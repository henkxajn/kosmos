// MapLabelLogic — czyste helpery dla etykiet kolonii/stacji na mapie 3D (FAZA 5, S3.4).
// Node-importowalne (bez canvas/three) — testowalne headless. Widok w MapLabelLayer.js czyta te dane
// i rysuje na #ui-canvas (overlay 2D, Trasa A z FAZY 0). Zbieranie danych oddzielone od renderu, żeby:
//   (a) mgła wojny była JEDNYM miejscem (getPlayerColonies / stacje gracza — nigdy getAllColonies),
//   (b) badge/status stacji dało się testować bez rysowania.

import { STATION_MODULES } from '../data/StationModuleData.js';

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
