// TacticalDockLogic — CZYSTA logika „Doku taktycznego" (Faza 4 Obrazu Operacyjnego).
// Node-importowalna, zero canvas/THREE/i18n — czwarta soczewka FleetPictureLogic.
// Widok/hit-testy w TacticalDock.js. TWARDA REGUŁA planu §0: żaden widok nie liczy
// glifu/tonu/ETA/alertu sam — wiersze WYŁĄCZNIE z buildShipEntry.
//
// Dok = „co się dzieje TERAZ, tutaj": bieżący układ + tranzyt międzygwiezdny.
// Filtr STAŁY (plan §1.2): systemId===activeSystemId LUB systemId===null (warp).
// Sort STAŁY: alerty najpierw (wg severity 1→3), potem ETA rosnąco. Bez szukajki,
// grupowania, wraków, kontaktów (to jest w Command/REJESTR — dok ich nie dubluje).

import { buildShipEntry } from './FleetPictureLogic.js';
import { isEnemyVessel } from '../entities/Vessel.js';

// Zakładki doku (id → widok). 'list' = LISTA, 'timeline' = OŚ.
export const DOCK_TABS = Object.freeze(['list', 'timeline']);
export const DEFAULT_DOCK_TAB = 'list';

// Severity zastępcza dla wierszy BEZ alertu (sortowane po alertach z alertem).
const NO_ALERT_SEVERITY = 99;

/**
 * Filtr statków doku — JEDNO źródło zbioru dla LISTY i OSI (spójność „ten sam zbiór").
 * Żywe statki gracza w bieżącym układzie LUB w tranzycie międzygwiezdnym (systemId===null).
 * systemId===undefined traktowany jak 'sys_home' (parytet z buildShipEntry).
 */
export function filterDockVessels(vessels, activeSystemId = 'sys_home') {
  const out = [];
  for (const v of vessels ?? []) {
    if (!v) continue;
    if (v.isWreck === true || v.status === 'destroyed') continue;
    if (isEnemyVessel(v)) continue;
    const sys = (v.systemId === undefined) ? 'sys_home' : v.systemId;
    if (sys !== null && sys !== activeSystemId) continue;   // null=tranzyt zostaje
    out.push(v);
  }
  return out;
}

/**
 * Wiersze LISTY doku — flota gracza w bieżącym układzie + tranzycie.
 * @param {object[]} vessels — vesselManager.getAllVessels()
 * @param {object} ctx —
 *   pictureCtx     — ctx dla buildShipEntry (combatCheck/isImmobilized/fleetSystem/gameYear)
 *   activeSystemId — bieżąco oglądany układ (window.KOSMOS.activeSystemId ?? 'sys_home')
 * @returns {Array} row = { id, name, glyph, tone, activityKey, activityArgs,
 *   eta:{year,confidence}, fuelPct, warpFuelPct, alerts, alertCount, systemId,
 *   isTransit, immobilized }
 */
export function buildDockRows(vessels, ctx = {}) {
  const activeSys = ctx.activeSystemId ?? 'sys_home';
  const rows = [];
  // filterDockVessels = JEDNO źródło zbioru (spójne z OSIĄ); buildShipEntry tylko na przefiltrowanych.
  for (const v of filterDockVessels(vessels, activeSys)) {
    const e = buildShipEntry(v, ctx.pictureCtx ?? {});
    if (!e) continue;                                    // defensywnie (nie powinno zajść)
    const isTransit = e.systemId === null;               // warp międzygwiezdny (systemId===null!)
    rows.push({
      id:          e.id,
      name:        e.name,
      glyph:       e.glyph,
      tone:        e.tone,
      activityKey: e.activityKey,
      activityArgs: e.activityArgs,
      eta:         e.eta,
      fuelPct:     e.fuelPct,
      warpFuelPct: e.warpFuelPct,
      alerts:      e.alerts,
      alertCount:  e.alerts.length,
      systemId:    e.systemId,
      isTransit,
      immobilized: e.alerts.some((a) => a.kind === 'immobilized'),
    });
  }
  return sortDockRows(rows);
}

/** Najgorsza (najniższa liczbowo) severity wiersza; NO_ALERT_SEVERITY gdy brak alertów. */
function _rowSeverity(r) {
  return (r.alerts && r.alerts.length) ? r.alerts[0].severity : NO_ALERT_SEVERITY;
}

/**
 * Sort stały doku: alerty najpierw (severity 1→3), potem ETA rosnąco (brak ETA na końcu),
 * tie-break po id → sort STABILNY. Nowa tablica; wejście nietknięte.
 */
export function sortDockRows(rows) {
  return [...(rows ?? [])].sort((a, b) =>
    (_rowSeverity(a) - _rowSeverity(b))
    || ((a.eta?.year ?? Infinity) - (b.eta?.year ?? Infinity))
    || String(a.id).localeCompare(String(b.id)));
}

/**
 * Geometria pasa doku (px LOGICZNE — widok dzieli raw przez UI_SCALE przed wołaniem).
 * Pas kotwiczy dolną krawędzią do (H - bottomReserved) — bezpośrednio nad dolnym HUD.
 * Zwinięty → tylko pasek zakładek (tabH). Lewy dok = zakładki + treść; prawy = mini-panel.
 *
 * @param {number} W, @param {number} H — wymiary płótna (logiczne)
 * @param {object} opts — { collapsed, dockH, panelW, tabH, tabW, bottomReserved, topLimit }
 * @returns {{ x,y,w,h, collapsed, tabH, tabBar, tabs:[{id,x,y,w,h}], collapseBtn,
 *   leftRect, panelRect, listRect, dockH, panelW, bottomReserved }}
 */
export function computeDockLayout(W, H, opts = {}) {
  const dockH   = opts.dockH   ?? 200;
  const panelW  = Math.min(opts.panelW ?? 300, Math.max(0, W - 120));   // guard wąskie ekrany
  const tabH    = opts.tabH    ?? 24;
  const tabW    = opts.tabW    ?? 68;
  const bottomReserved = opts.bottomReserved ?? 42;
  const topLimit = opts.topLimit ?? 0;
  const collapsed = !!opts.collapsed;

  const barH = collapsed ? tabH : Math.max(tabH, Math.min(dockH, H - bottomReserved - topLimit));
  const y = H - bottomReserved - barH;
  const w = W;

  const leftW = Math.max(0, w - panelW);

  // Zakładki [LISTA][OŚ] przy lewej krawędzi paska; przycisk zwijania na prawym końcu
  // LEWEGO regionu (przed przegrodą mini-panelu ┬).
  const tabs = [
    { id: 'list',     x: 4,                y, w: tabW, h: tabH },
    { id: 'timeline', x: 4 + tabW + 2,     y, w: tabW, h: tabH },
  ];
  const collapseBtn = { x: leftW - tabH - 4, y, w: tabH, h: tabH };

  const contentY = y + tabH;
  const contentH = Math.max(0, barH - tabH);

  return {
    x: 0, y, w, h: barH, collapsed, tabH, tabW,
    tabBar: { x: 0, y, w, h: tabH },
    tabs,
    collapseBtn,
    leftRect:  { x: 0,     y: contentY, w: leftW,  h: contentH },   // treść LISTA/OŚ (pod zakładkami)
    listRect:  { x: 0,     y: contentY, w: leftW,  h: contentH },   // alias — LISTA renderuje tu
    panelRect: { x: leftW, y,           w: panelW, h: barH },       // mini-panel — pełna wysokość pasa
    dockH, panelW, bottomReserved,
  };
}

/** Liczba wierszy mieszczących się w regionie treści (do stronicowania/scrolla). */
export function dockVisibleRowCount(contentH, rowH) {
  if (!(rowH > 0)) return 0;
  return Math.max(0, Math.floor(contentH / rowH));
}

/** Clamp offsetu scrolla listy do [0, maxScroll] (maxScroll = nadmiar wierszy × rowH). */
export function clampDockScroll(scroll, rowCount, visibleCount, rowH) {
  const maxScroll = Math.max(0, (rowCount - visibleCount) * rowH);
  return Math.max(0, Math.min(maxScroll, scroll ?? 0));
}
