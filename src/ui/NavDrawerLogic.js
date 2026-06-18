// NavDrawerLogic — czyste helpery NavDrawer (bez DOM/canvas), testowalne headless.
//
// Geometria panelu, layout kafli, krok animacji slide, hit-test, scroll clamp.
// Wzór: BottomContextLogic/StationPanelLogic/POIPanelLogic (logika oddzielona od
// rysowania → smoke test bez przeglądarki).

import { COSMIC } from '../config/LayoutConfig.js';

// ── Stałe layoutu (współdzielone z NavDrawer.js) ───────────────────────────
export const NAV_TRIGGER_W   = 6;     // px — pasek-trigger lewej krawędzi
export const NAV_HIDE_DELAY  = 300;   // ms — opóźnienie chowania po opuszczeniu hovera
export const NAV_ANIM_SPEED  = 0.16;  // przyrost _slideProgress na klatkę (wzór BottomContext)
export const NAV_TILE_ASPECT = 5;     // proporcja kafla 5:1 (grafika źródłowa 1280×256)
export const NAV_TILE_GAP    = 4;     // odstęp pionowy między kaflami
export const NAV_PANEL_PAD   = 8;     // wewnętrzny padding panelu
export const NAV_HEADER_H    = 22;    // wysokość nagłówka panelu
export const NAV_LABEL_BAND  = 18;    // wysokość dolnego paska etykiety na kaflu

export const NAV_ICON_DIR = 'assets/icons/nav/';

// primary grupy (NAV_GROUPS) → plik PNG (fotorealistyczne kafle 1280×256 = 5:1, center-crop).
// UWAGA: klucze MUSZĄ pokrywać się z NAV_GROUPS[].primary (CivPanelDrawer); wartości =
// realne nazwy plików w assets/icons/nav/ (sufiks _symbol). Zła nazwa → 404 → fallback emoji.
export const NAV_TILE_FILES = {
  civilization: 'civilization_symbol.png',
  economy:      'economy_symbol.png',
  colony:       'colony_symbol.png',
  population:   'population_symbol.png',
  diplomacy:    'diplomacy_symbol.png',
  fleet:        'fleet_symbol.png',
  tech:         'tech_symbol.png',
};

/**
 * Logiczna szerokość panelu = 1/3 ekranu (min 220).
 * UWAGA: LOGICZNE W (przekazane do draw), NIE window.innerWidth — UIManager rysuje
 * w przeskalowanym układzie (UI_SCALE), więc panel liczymy z W.
 */
export function navPanelWidth(W) {
  return Math.max(220, Math.floor(W / 3));
}

/**
 * Pionowe granice panelu/triggera: od SAMEJ GÓRY ekranu (y=0) do nad BottomBar.
 * Slice A: panel/trigger sięgają top:0 (TopBar = lekki overlay tylko w prawym rogu;
 * lewa/środek przezroczyste). Wysokość = H − BottomBar. BottomResourceBar rysuje się
 * PO NavDrawer (na wierzchu jego dolnej krawędzi) — bez chowania kafli w praktyce.
 * @returns {{ top:number, bottom:number, height:number }}
 */
export function navPanelVBounds(H) {
  const top = 0;
  const bottom = H - COSMIC.BOTTOM_BAR_H;
  return { top, bottom, height: Math.max(0, bottom - top) };
}

/** Krok animacji slide w stronę target (0|1), clamp 0..1. */
export function stepSlide(progress, target, speed = NAV_ANIM_SPEED) {
  if (target > progress) return Math.min(1, progress + speed);
  if (target < progress) return Math.max(0, progress - speed);
  return progress;
}

/** Czy slide trwa (między 0 a 1) lub czeka timer schowania (hideAt>0). */
export function navIsAnimating(progress, hideAt) {
  return (progress > 0 && progress < 1) || hideAt > 0;
}

/** Clamp scrolla do [0, maxScroll]. */
export function clampScroll(scrollY, maxScroll) {
  return Math.max(0, Math.min(maxScroll, scrollY));
}

/**
 * Layout listy kafli (pozycje wierszy + flaga widoczności + scroll).
 * @returns {{ tileW, tileH, rowH, contentH, listTop, listH, maxScroll, scrollY,
 *             rows: Array<{index:number, y:number, visible:boolean}> }}
 */
export function navTileLayout({
  panelTop, panelW, panelH, count, scrollY = 0,
  pad = NAV_PANEL_PAD, gap = NAV_TILE_GAP, header = NAV_HEADER_H, aspect = NAV_TILE_ASPECT,
}) {
  const tileW = panelW - pad * 2;
  const tileH = Math.round(tileW / aspect);
  const rowH = tileH + gap;
  const listTop = panelTop + header;
  const listH = Math.max(0, panelH - header);
  const contentH = count * rowH;
  const maxScroll = Math.max(0, contentH - listH + gap);
  const sY = clampScroll(scrollY, maxScroll);

  const rows = [];
  let y = listTop + gap - sY;
  for (let i = 0; i < count; i++) {
    const visible = (y + tileH > listTop) && (y < listTop + listH);
    rows.push({ index: i, y, visible });
    y += rowH;
  }
  return { tileW, tileH, rowH, contentH, listTop, listH, maxScroll, scrollY: sY, rows };
}

/** Pierwsza pasująca strefa (first-match — kolejność dodawania = priorytet). */
export function findZone(zones, x, y) {
  return zones.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null;
}

/** Punkt w prostokącie {x,y,w,h} (null-safe). */
export function pointInRect(rect, x, y) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
