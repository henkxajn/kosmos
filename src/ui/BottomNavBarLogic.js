// BottomNavBarLogic — czyste helpery BottomNavBar (bez DOM/canvas), testowalne headless.
//
// Geometria stałego dolnego paska nawigacji + layout slotów + hit-test. Wzór:
// NavDrawerLogic/BottomContextLogic (logika oddzielona od rysowania → smoke bez przeglądarki).

import { COSMIC } from '../config/LayoutConfig.js';

export const BOTTOM_NAV_EDGE = 6;   // px — inset z lewej/prawej (nie wchodzi w prawy trigger Outlinera)

/**
 * Prostokąt stałego paska nawigacji: DOBITY w dół do listwy schowanego dziennika
 * (BOTTOM_LOG_TRIG_H), inset BOTTOM_NAV_EDGE z boków. LOGICZNE W/H (przeskalowany układ
 * UIManagera), nie window.*.
 * @returns {{ x:number, y:number, w:number, h:number }}
 */
export function bottomNavBarRect(W, H) {
  const h = COSMIC.BOTTOM_NAV_H;
  const y = H - COSMIC.BOTTOM_LOG_TRIG_H - h;
  const x = 0;                                  // dosunięty do LEWEJ krawędzi
  const w = Math.max(0, W - BOTTOM_NAV_EDGE);   // prawy inset (nie wchodzi w trigger Outlinera)
  return { x, y, w, h };
}

/**
 * Layout równych slotów w prostokącie paska.
 * @returns {Array<{ index:number, x:number, w:number }>}
 */
export function navSlotLayout(rect, count) {
  const slots = [];
  if (count <= 0) return slots;
  const slotW = rect.w / count;
  for (let i = 0; i < count; i++) {
    slots.push({ index: i, x: rect.x + i * slotW, w: slotW });
  }
  return slots;
}

/** Indeks slotu pod punktem (x,y) lub -1. */
export function hitNavSlot(rect, count, x, y) {
  if (count <= 0) return -1;
  if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) return -1;
  const idx = Math.floor((x - rect.x) / (rect.w / count));
  return (idx >= 0 && idx < count) ? idx : -1;
}

/** Punkt w prostokącie {x,y,w,h} (null-safe). */
export function pointInRect(rect, x, y) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
