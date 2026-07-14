// MapLabelLogic — czyste helpery dla etykiet kolonii/stacji na mapie 3D (FAZA 5, S3.4).
// Node-importowalne (bez canvas/three) — testowalne headless. Widok w MapLabelLayer.js czyta te dane
// i rysuje na #ui-canvas (overlay 2D, Trasa A z FAZY 0). Zbieranie danych oddzielone od renderu, żeby:
//   (a) mgła wojny była JEDNYM miejscem (getPlayerColonies / stacje gracza — nigdy getAllColonies),
//   (b) badge/status stacji dało się testować bez rysowania.

import { STATION_MODULES } from '../data/StationModuleData.js';

// Ikony typu kolonii (dwujęzyczność nie dotyczy — emoji uniwersalne).
export const COLONY_ICON = { home: '🏠', colony: '🏙️', outpost: '⛺' };
export const STATION_ICON = '🛰️';

// Progi czytelności na zoom-out (jednostki dystansu kamery 3D — zakres orbitu 3..450).
export const LABEL_FADE_START = 140;   // ≤ → pełna nieprzezroczystość
export const LABEL_FADE_END   = 320;   // ≥ → etykiety zanikają (clutter przy całym układzie w kadrze)
export const LABEL_DETAIL_DIST = 180;  // > → tryb kompaktowy (sama nazwa+ikona, bez POP/badge)

/**
 * Alpha etykiety wg dystansu kamery (fade progowy). dist=null → 1 (brak danych = pokaż).
 * @returns {number} 0..1
 */
export function labelAlphaForDistance(dist, fadeStart = LABEL_FADE_START, fadeEnd = LABEL_FADE_END) {
  if (dist == null || !Number.isFinite(dist)) return 1;
  if (dist <= fadeStart) return 1;
  if (dist >= fadeEnd) return 0;
  return (fadeEnd - dist) / (fadeEnd - fadeStart);
}

/** Czy pokazywać szczegóły (POP, badge) — kompakt przy dużym oddaleniu. */
export function labelShowDetail(dist, detailDist = LABEL_DETAIL_DIST) {
  if (dist == null || !Number.isFinite(dist)) return true;
  return dist <= detailDist;
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

// Wariant wizualny: 'W1' (minimalistyczny) | 'W2' (plakietka). Źródło: uiPrefs.mapLabelVariant lub
// query param ?maplabels=W2 (fallback dev). Default W1.
export function resolveLabelVariant(uiPrefs, queryString = '') {
  const pref = uiPrefs?.mapLabelVariant;
  if (pref === 'W1' || pref === 'W2') return pref;
  const m = /[?&]maplabels=(W[12])/i.exec(queryString || '');
  if (m) return m[1].toUpperCase();
  return 'W1';
}
