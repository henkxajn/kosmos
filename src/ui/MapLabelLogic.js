// MapLabelLogic — czyste helpery etykiet mapy 3D (FAZA 5, S3.4; Obraz Operacyjny F1). Node-importowalne (bez canvas/three)
// — testowalne headless. Od ARKUSZA HUD B-Z dane czyta warstwa etykiet HUD (`HudLabelLayer`): zbieracz statków aktywnego
// układu z mgłą wojny (`gatherVesselLabels` — JEDNO miejsce), badge statusu stacji, strzałki krawędzi; `systemDisplayName` —
// kanon nazwy układu dla wielu modułów. Dawne plakietki `MapLabelLayer` (LOD, anty-nakładanie, zbieracze kolonii i stacji,
// `toLogicalPx`) — ścieżka OFF `hudLabels` — usunięte w B-Z.

import { buildShipEntry, worstTone } from './FleetPictureLogic.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { enemyVesselNamed } from '../utils/VesselReveal.js';   // Finding 568 — jedna reguła nazwy obcego statku

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

// ═══ Obraz Operacyjny — Faza 1 (M1-light): plakietki flotowe ═════════════════
// Czyste helpery zbieracza etykiet statków. Słownik (tone/glif/alerty) WYŁĄCZNIE
// z FleetPictureLogic (twarda reguła planu §0) — tu tylko filtracja/geometria.

/**
 * Nazwa WYŚWIETLANA układu (slice 1e) — nigdy surowe id: wpis StarSystemManagera
 * (galaxyStar.name) → fallback nazwa gwiazdy układu (układ macierzysty bywa poza
 * rejestrem wygenerowanych) → dopiero na końcu id.
 * @param {string} systemId
 * @param {object} [sources] — { systems: [{systemId, galaxyStar}], starName(systemId)→string|null }
 */
export function systemDisplayName(systemId, sources = {}) {
  const sys = sources.systems?.find?.(s => s?.systemId === systemId);
  if (sys?.galaxyStar?.name) return sys.galaxyStar.name;
  const star = sources.starName?.(systemId);
  if (star) return star;
  return systemId;
}

/**
 * Zbieracz punktów etykiet statków AKTYWNEGO układu — wejście do clusterScreenPoints.
 * Mgła wojny: wrogowie wyłącznie przez ctx.enemyQuality (istniejące bramki intel):
 *   'unknown' → pomijany, 'rumor' → wpis ANONIMOWY (name '?', bez fleetId),
 *   'contact'/'detailed' → pełna nazwa (Finding 568: `VesselReveal.enemyVesselNamed` — ta sama reguła co rozwinięcie T1
 *   i linia treści alertu HUD). Wraki pomijane (entry.isWreck — 3f).
 *
 * @param {object[]} vessels — vesselManager.getAllVessels()
 * @param {object} ctx —
 *   getScreenPos(id) → {x,y}|null   — px LOGICZNE (warstwa etykiet HUD — rzut wspólnym projektorem)
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
    if (!entry || entry.isWreck) continue;                     // wraki poza mapą etykiet
    if (entry.systemId !== activeSys) continue;                // tylko aktywny układ (null = tranzyt — „W drodze” w prawym outlinerze)
    const pos = ctx.getScreenPos?.(v.id);
    if (!pos) continue;                                        // za kamerą (z-clamp)
    const enemy = isEnemyVessel(v);
    if (enemy) {
      const q = ctx.enemyQuality?.(v.id) ?? 'unknown';
      if (q === 'unknown') continue;                           // mgła wojny — niewykryty
      const anonymous = !enemyVesselNamed(q);
      out.push({
        x: pos.x, y: pos.y, id: v.id,
        name: anonymous ? '?' : entry.name,
        glyph: anonymous ? null : entry.glyph,                 // rola wroga jawna dopiero od contact
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
      glyph: entry.glyph,
      fleetId: entry.fleetId,
      tone: entry.tone,
      alertCount: entry.alerts.length,
      kind: 'own',
      selected: selected.has(v.id),
      // Profil tactical (F2): aktywność + mini-ETA na plakietce — z buildShipEntry.
      activityKey: entry.activityKey,
      etaYear: entry.eta.year,
      etaMoving: entry.eta.confidence === 'moving',
    });
  }
  return out;
}

// Strzałki krawędziowe — geometria clamp + grupowanie w sektory krawędzi.
export const EDGE_MARGIN = 26;        // px logiczne — odstęp strzałki od krawędzi
export const EDGE_BANDS  = 4;         // liczba sektorów na każdą krawędź (grupowanie)

/**
 * Wskaźniki krawędziowe dla punktów POZA kadrem (px logiczne). Kadr = `opts.rect` {x0, y0, x1, y1} — od ARKUSZ UI U4-2
 * (Finding 494) prostokąt OBSZARU MAPY z `MapInsets` (bez kolumn outlinerów, górnej belki, pasa dolnego i paska
 * nawigacji), żeby strzałka nie stała pod nimi; bez `rect` — cały ekran 0..W × 0..H (jak dotąd).
 * Punkt poza → clamp do ramki z marginesem; wiele punktów w tym samym sektorze
 * krawędzi → jedna strzałka z licznikiem i worst-of tonem.
 * @param {Array<{x,y,tone,alertCount?}>} points — WSZYSTKIE punkty (w kadrze pomijane)
 * @returns {Array<{x,y,edge:'left'|'right'|'top'|'bottom',count,worstTone,alertCount}>}
 */
export function edgeIndicators(points, W, H, opts = {}) {
  const m = opts.margin ?? EDGE_MARGIN;
  const r = opts.rect ?? { x0: 0, y0: 0, x1: W, y1: H };
  const spanX = Math.max(1, r.x1 - r.x0), spanY = Math.max(1, r.y1 - r.y0);
  const groups = new Map();   // `${edge}:${band}` → { xs, ys, tones, count, alertCount }
  for (const p of points ?? []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) continue;   // w kadrze — nie dotyczy
    // Krawędź = oś większego przekroczenia (deterministycznie; remis → pozioma).
    const dx = p.x < r.x0 ? r.x0 - p.x : (p.x > r.x1 ? p.x - r.x1 : 0);
    const dy = p.y < r.y0 ? r.y0 - p.y : (p.y > r.y1 ? p.y - r.y1 : 0);
    const edge = (dx >= dy)
      ? (p.x < r.x0 ? 'left' : 'right')
      : (p.y < r.y0 ? 'top' : 'bottom');
    const cx = Math.min(Math.max(p.x, r.x0 + m), r.x1 - m);
    const cy = Math.min(Math.max(p.y, r.y0 + m), r.y1 - m);
    const along = (edge === 'left' || edge === 'right') ? (cy - r.y0) / spanY : (cx - r.x0) / spanX;
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
      x: g.edge === 'left' ? r.x0 + m : g.edge === 'right' ? r.x1 - m : x,
      y: g.edge === 'top' ? r.y0 + m : g.edge === 'bottom' ? r.y1 - m : y,
      edge: g.edge,
      count: g.count,
      worstTone: worstTone(g.tones),
      alertCount: g.alertCount,
    });
  }
  return out;
}
