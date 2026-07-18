// MapLabelLogic — czyste helpery dla etykiet kolonii/stacji na mapie 3D (FAZA 5, S3.4).
// Node-importowalne (bez canvas/three) — testowalne headless. Widok w MapLabelLayer.js czyta te dane
// i rysuje na #ui-canvas (overlay 2D, Trasa A z FAZY 0). Zbieranie danych oddzielone od renderu, żeby:
//   (a) mgła wojny była JEDNYM miejscem (getPlayerColonies / stacje gracza — nigdy getAllColonies),
//   (b) badge/status stacji dało się testować bez rysowania.

import { STATION_MODULES } from '../data/StationModuleData.js';
import { buildShipEntry, worstTone } from './FleetPictureLogic.js';
import { isEnemyVessel } from '../entities/Vessel.js';

// Ikony typu kolonii (dwujęzyczność nie dotyczy — emoji uniwersalne).
export const COLONY_ICON = { home: '🏠', colony: '🏙️', outpost: '⛺' };
export const STATION_ICON = '🛰️';

// LOD (K1) — 3 poziomy wg dystansu kamery 3D (zakres orbitu 3..450). Przejścia PŁYNNE (cross-fade):
//   dist ≤ PLAQUE_FULL             → pełna plakietka (plaqueAlpha 1)
//   PLAQUE_FULL..PLAQUE_FADE       → cross-fade plakietka↓ / znacznik↑
//   PLAQUE_FADE..MARKER_FADE       → sam znacznik (ikona [+badge], bez nazwy/POP) — „tu coś jest"
//   MARKER_FADE..FADE_END          → znacznik zanika
//   ≥ FADE_END                     → nic (declutter — imersja przy całym układzie w kadrze)
export const LOD_PLAQUE_FULL = 150;
export const LOD_PLAQUE_FADE = 215;
export const LOD_MARKER_FADE = 300;
export const LABEL_FADE_END  = 360;

/**
 * Poziom szczegółowości etykiety wg dystansu (K1). Zwraca alfy obu reprezentacji (cross-fade płynny).
 * dist=null/NaN → pełna plakietka (brak danych = pokaż z bliska).
 * @returns {{plaqueAlpha:number, markerAlpha:number}}
 */
export function labelLOD(dist) {
  if (dist == null || !Number.isFinite(dist)) return { plaqueAlpha: 1, markerAlpha: 0 };
  if (dist <= LOD_PLAQUE_FULL) return { plaqueAlpha: 1, markerAlpha: 0 };
  if (dist < LOD_PLAQUE_FADE) {
    const t = (dist - LOD_PLAQUE_FULL) / (LOD_PLAQUE_FADE - LOD_PLAQUE_FULL);
    return { plaqueAlpha: 1 - t, markerAlpha: t };
  }
  if (dist <= LOD_MARKER_FADE) return { plaqueAlpha: 0, markerAlpha: 1 };
  if (dist < LABEL_FADE_END) {
    const t = (dist - LOD_MARKER_FADE) / (LABEL_FADE_END - LOD_MARKER_FADE);
    return { plaqueAlpha: 0, markerAlpha: 1 - t };
  }
  return { plaqueAlpha: 0, markerAlpha: 0 };
}

/**
 * Anty-nakładanie (K2) — deterministyczny greedy: sort po docelowym Y (potem X dla stabilności),
 * każdą kolidującą etykietę zsuń W DÓŁ pod najniższą nakładającą się (z odstępem gap). Bez fizyki,
 * bez iteracyjnych solverów. Kolizja = AABB (nakładanie w X ORAZ Y). `targetY` = pożądany środek
 * plakietki (punkt ciała + offset). Zwraca te same itemy z `drawY` + `displaced` (czy przesunięto).
 * @param {Array<{id,anchorX,targetY,w,h}>} items
 * @param {number} gap
 * @returns {Array<{id,anchorX,targetY,w,h,drawY,displaced}>}
 */
export function stackLabels(items, gap = 3) {
  const xOverlap = (a, b) =>
    (a.anchorX - a.w / 2) < (b.anchorX + b.w / 2) && (a.anchorX + a.w / 2) > (b.anchorX - b.w / 2);

  const sorted = [...items].sort((a, b) => (a.targetY - b.targetY) || (a.anchorX - b.anchorX));
  const placed = [];   // utrzymywane rosnąco po drawY
  const out = [];
  for (const it of sorted) {
    let drawY = it.targetY;
    for (const p of placed) {   // placed rosnąco → zsuwanie łańcuchowe działa
      if (!xOverlap(it, p)) continue;
      const pBottom = p.drawY + p.h / 2;
      const myTop = drawY - it.h / 2;
      if (myTop < pBottom + gap && (drawY + it.h / 2) > (p.drawY - p.h / 2)) {
        drawY = pBottom + gap + it.h / 2;   // zsuń pod ten box
      }
    }
    const res = { ...it, drawY, displaced: Math.abs(drawY - it.targetY) > 0.5 };
    out.push(res);
    placed.push(res);
    placed.sort((a, b) => a.drawY - b.drawY);
  }
  return out;
}

/**
 * Etykiety KOLONII GRACZA (mgła wojny: getPlayerColonies → filtr ownerEmpireId już w ColonyManager;
 * NIGDY getAllColonies). Zwraca tylko kolonie z ciałem widocznym na mapie (planeta/księżyc) — filtr
 * pozycji robi widok (getBodyScreenPosition null → pomija).
 * @returns {Array<{id,name,icon,kind,pop}>}
 */
export function gatherColonyLabels(colMgr, homePid) {
  if (!colMgr?.getPlayerColonies) return [];
  const out = [];
  for (const col of colMgr.getPlayerColonies()) {
    const pid = col.planetId ?? col.planet?.id;
    if (!pid) continue;
    const isHome = pid === homePid;
    const isOutpost = col.isOutpost === true;
    const kind = isHome ? 'home' : isOutpost ? 'outpost' : 'colony';
    // Outpost = mini-kolonia bez POPów (brak civSystem) → pop=null (nie pokazujemy 0).
    const pop = isOutpost ? null : Math.round(col.civSystem?.population ?? 0);
    out.push({
      id: pid,
      name: (col.planet?.name ?? col.name ?? pid ?? '').slice(0, 16),
      icon: COLONY_ICON[kind],
      kind,
      pop,
    });
  }
  return out;
}

/**
 * Badge statusu stacji (kolejność: budowa → brak załogi → deficyt energii). Emoji uniwersalne.
 * Deficyt/brak-załogi z inactiveReason modułów (bezpośredni sygnał, bez re-liczenia bilansu).
 * @returns {Array<'building'|'no_crew'|'no_power'>}
 */
export function stationStatusBadges(station) {
  const badges = [];
  const building = (station.pendingModuleOrders?.length ?? 0) > 0
    || (station.shipQueues?.length ?? 0) > 0;
  if (building) badges.push('building');
  const mods = station.modules ?? [];
  if (mods.some(m => m.active === false && m.inactiveReason === 'no_crew')) badges.push('no_crew');
  if (mods.some(m => m.active === false && m.inactiveReason === 'no_power')) badges.push('no_power');
  return badges;
}

export const BADGE_ICON = { building: '🔨', no_crew: '👥', no_power: '⚡' };

/**
 * Etykiety STACJI GRACZA (mgła wojny: tylko !ownerEmpireId — cudze stacje pomijamy, S3.5 wprowadzi
 * kontakty). Pozycję rozwiązuje widok przez getStationScreenPosition (null → pomija).
 * @returns {Array<{id,name,icon,kind,pop,popCapacity,badges}>}
 */
export function gatherStationLabels(stationSystem) {
  if (!stationSystem?.getAllStations) return [];
  const out = [];
  for (const st of stationSystem.getAllStations()) {
    if ((st.ownerEmpireId ?? 'player') !== 'player') continue;   // tylko stacje gracza
    out.push({
      id: st.id,
      name: (st.name ?? st.id ?? '').slice(0, 16),
      icon: STATION_ICON,
      kind: 'station',
      pop: st.pop ?? 0,
      popCapacity: st.popCapacity ?? 0,
      badges: stationStatusBadges(st),
    });
  }
  return out;
}

// ═══ Obraz Operacyjny — Faza 1 (M1-light): plakietki flotowe ═════════════════
// Czyste helpery zbieracza etykiet statków. Słownik (tone/glif/alerty) WYŁĄCZNIE
// z FleetPictureLogic (twarda reguła planu §0) — tu tylko filtracja/geometria.

/**
 * px CSS (getVesselScreenPosition liczy z window.innerWidth/Height) → px LOGICZNE
 * overlayu 2D (transformata UI_SCALE). Aneks A.3 — bez tej konwersji pozycje
 * rozjeżdżają się na każdej rozdzielczości ≠ 1280×720.
 * @param {{x:number,y:number}|null} pos @param {number} uiScale
 * @returns {{x:number,y:number}|null}
 */
export function toLogicalPx(pos, uiScale) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
  const s = (Number.isFinite(uiScale) && uiScale > 0) ? uiScale : 1;
  return { x: pos.x / s, y: pos.y / s };
}

// LOD plakietek STATKÓW (profil light) — osobne progi, NIE ruszamy labelLOD kolonii.
//   clusterAlpha — plakietki flot/klastrów (świadomość w tle; widoczne też daleko,
//                  zanikają dopiero przy ekstremalnym oddaleniu całego układu);
//   detailAlpha  — etykiety indywidualne (wybrany statek + statki z alertem) — tylko blisko.
export const VESSEL_DETAIL_FULL  = 120;   // dist ≤ → pełne etykiety indywidualne
export const VESSEL_DETAIL_FADE  = 180;   // fade out detali
export const VESSEL_CLUSTER_FADE = 380;   // od tego dystansu plakietki klastrów zanikają…
export const VESSEL_CLUSTER_END  = 450;   // …aż do zera (maks. oddalenie kamery)

/**
 * LOD plakietek statków wg dystansu kamery (cross-fade jak labelLOD).
 * dist=null/NaN → pełny detal (brak danych = pokaż).
 * @returns {{clusterAlpha:number, detailAlpha:number}}
 */
export function vesselLabelLOD(dist) {
  if (dist == null || !Number.isFinite(dist)) return { clusterAlpha: 1, detailAlpha: 1 };
  let clusterAlpha = 1;
  if (dist >= VESSEL_CLUSTER_END) clusterAlpha = 0;
  else if (dist > VESSEL_CLUSTER_FADE) {
    clusterAlpha = 1 - (dist - VESSEL_CLUSTER_FADE) / (VESSEL_CLUSTER_END - VESSEL_CLUSTER_FADE);
  }
  let detailAlpha = 0;
  if (dist <= VESSEL_DETAIL_FULL) detailAlpha = 1;
  else if (dist < VESSEL_DETAIL_FADE) {
    detailAlpha = 1 - (dist - VESSEL_DETAIL_FULL) / (VESSEL_DETAIL_FADE - VESSEL_DETAIL_FULL);
  }
  return { clusterAlpha, detailAlpha };
}

/**
 * Zbieracz punktów etykiet statków AKTYWNEGO układu — wejście do clusterScreenPoints.
 * Mgła wojny: wrogowie wyłącznie przez ctx.enemyQuality (istniejące bramki intel):
 *   'unknown' → pomijany, 'rumor' → wpis ANONIMOWY (name '?', bez fleetId),
 *   'contact'/'detailed' → pełna nazwa. Wraki pomijane (buildShipEntry.excluded).
 *
 * @param {object[]} vessels — vesselManager.getAllVessels()
 * @param {object} ctx —
 *   getScreenPos(id) → {x,y}|null   — px LOGICZNE (Layer: toLogicalPx(tr.getVesselScreenPosition))
 *   pictureCtx                      — ctx dla FleetPictureLogic.buildShipEntry
 *   enemyQuality(id) → 'unknown'|'rumor'|'contact'|'detailed'
 *   activeSystemId                  — filtr układu (tranzyt systemId=null NIE jest na tej mapie)
 *   selectedIds                     — Set zaznaczonych (emfaza detail-LOD)
 * @returns {Array<{x,y,id,name,fleetId,tone,alertCount,kind:'own'|'enemy',selected}>}
 */
export function gatherVesselLabels(vessels, ctx = {}) {
  const out = [];
  const activeSys = ctx.activeSystemId ?? 'sys_home';
  const selected = ctx.selectedIds ?? new Set();
  for (const v of vessels ?? []) {
    if (!v) continue;
    const entry = buildShipEntry(v, ctx.pictureCtx ?? {});
    if (!entry || entry.excluded) continue;                    // wraki poza zakresem v1
    if (entry.systemId !== activeSys) continue;                // tylko aktywny układ (null=tranzyt → chip)
    const pos = ctx.getScreenPos?.(v.id);
    if (!pos) continue;                                        // za kamerą (z-clamp)
    const enemy = isEnemyVessel(v);
    if (enemy) {
      const q = ctx.enemyQuality?.(v.id) ?? 'unknown';
      if (q === 'unknown') continue;                           // mgła wojny — niewykryty
      const anonymous = q === 'rumor';
      out.push({
        x: pos.x, y: pos.y, id: v.id,
        name: anonymous ? '?' : entry.name,
        fleetId: null,                                         // floty wroga nie grupują plakietek
        tone: entry.tone,
        alertCount: 0,                                         // alerty tylko własne (bez leakowania)
        kind: 'enemy',
        selected: false,
      });
      continue;
    }
    out.push({
      x: pos.x, y: pos.y, id: v.id,
      name: entry.name,
      fleetId: entry.fleetId,
      tone: entry.tone,
      alertCount: entry.alerts.length,
      kind: 'own',
      selected: selected.has(v.id),
    });
  }
  return out;
}

// Strzałki krawędziowe — geometria clamp + grupowanie w sektory krawędzi.
export const EDGE_MARGIN = 26;        // px logiczne — odstęp strzałki od krawędzi
export const EDGE_BANDS  = 4;         // liczba sektorów na każdą krawędź (grupowanie)

/**
 * Wskaźniki krawędziowe dla punktów POZA kadrem (px logiczne, prostokąt 0..W × 0..H).
 * Punkt poza → clamp do ramki z marginesem; wiele punktów w tym samym sektorze
 * krawędzi → jedna strzałka z licznikiem i worst-of tonem.
 * @param {Array<{x,y,tone,alertCount?}>} points — WSZYSTKIE punkty (on-screen pomijane)
 * @returns {Array<{x,y,edge:'left'|'right'|'top'|'bottom',count,worstTone,alertCount}>}
 */
export function edgeIndicators(points, W, H, opts = {}) {
  const m = opts.margin ?? EDGE_MARGIN;
  const groups = new Map();   // `${edge}:${band}` → { xs, ys, tones, count, alertCount }
  for (const p of points ?? []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) continue;   // w kadrze — nie dotyczy
    // Krawędź = oś większego przekroczenia (deterministycznie; remis → pozioma).
    const dx = p.x < 0 ? -p.x : (p.x > W ? p.x - W : 0);
    const dy = p.y < 0 ? -p.y : (p.y > H ? p.y - H : 0);
    const edge = (dx >= dy)
      ? (p.x < 0 ? 'left' : 'right')
      : (p.y < 0 ? 'top' : 'bottom');
    const cx = Math.min(Math.max(p.x, m), W - m);
    const cy = Math.min(Math.max(p.y, m), H - m);
    const along = (edge === 'left' || edge === 'right') ? cy / H : cx / W;
    const band = Math.min(EDGE_BANDS - 1, Math.max(0, Math.floor(along * EDGE_BANDS)));
    const key = `${edge}:${band}`;
    if (!groups.has(key)) groups.set(key, { edge, xs: 0, ys: 0, tones: [], count: 0, alertCount: 0 });
    const g = groups.get(key);
    g.xs += cx; g.ys += cy; g.count++;
    g.tones.push(p.tone);
    g.alertCount += p.alertCount ?? 0;
  }
  const out = [];
  for (const g of groups.values()) {
    const x = g.xs / g.count;
    const y = g.ys / g.count;
    // Strzałka siedzi NA ramce swojej krawędzi (druga oś = uśredniona pozycja clamp).
    out.push({
      x: g.edge === 'left' ? m : g.edge === 'right' ? W - m : x,
      y: g.edge === 'top' ? m : g.edge === 'bottom' ? H - m : y,
      edge: g.edge,
      count: g.count,
      worstTone: worstTone(g.tones),
      alertCount: g.alertCount,
    });
  }
  return out;
}

/**
 * Chipy układów (prawa krawędź): po jednym na układ z ≥1 WŁASNYM statkiem
 * (grupowanie po systemId; wrogowie i wraki pomijani) + chip 🌀 tranzytu dla
 * statków w skoku międzygwiezdnym (systemId === null).
 * @param {object[]} vessels
 * @param {object} ctx — { activeSystemId, systemName(id)→string|null, pictureCtx }
 * @returns {Array<{systemId:string|null,name,count,alertCount,isActive,isTransit}>}
 *   sort: aktywny układ → pozostałe alfabetycznie → tranzyt na końcu.
 */
export function buildSystemChips(vessels, ctx = {}) {
  const activeSys = ctx.activeSystemId ?? 'sys_home';
  const groups = new Map();   // systemId|'__transit' → { count, alertCount }
  for (const v of vessels ?? []) {
    if (!v || isEnemyVessel(v)) continue;
    const entry = buildShipEntry(v, ctx.pictureCtx ?? {});
    if (!entry || entry.excluded) continue;
    const key = entry.systemId === null ? '__transit' : entry.systemId;
    if (!groups.has(key)) groups.set(key, { count: 0, alertCount: 0 });
    const g = groups.get(key);
    g.count++;
    g.alertCount += entry.alerts.length;
  }
  const out = [];
  for (const [key, g] of groups) {
    const isTransit = key === '__transit';
    const systemId = isTransit ? null : key;
    out.push({
      systemId,
      name: isTransit ? null : (ctx.systemName?.(systemId) ?? systemId),
      count: g.count,
      alertCount: g.alertCount,
      isActive: !isTransit && systemId === activeSys,
      isTransit,
    });
  }
  out.sort((a, b) => {
    if (a.isTransit !== b.isTransit) return a.isTransit ? 1 : -1;   // tranzyt na końcu
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;      // aktywny pierwszy
    return String(a.name).localeCompare(String(b.name));
  });
  return out;
}
