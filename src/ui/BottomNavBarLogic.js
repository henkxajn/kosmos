// BottomNavBarLogic — czyste helpery BottomNavBar (bez DOM/canvas), testowalne headless.
//
// Geometria stałego dolnego paska nawigacji + layout slotów + hit-test. Wzór:
// NavDrawerLogic (logika oddzielona od rysowania → smoke bez przeglądarki).

import { COSMIC } from '../config/LayoutConfig.js';

/**
 * Prostokąt stałego paska nawigacji: DOBITY w dół do listwy schowanego dziennika
 * (BOTTOM_LOG_TRIG_H), na PEŁNĄ szerokość okna. LOGICZNE W/H (przeskalowany układ
 * UIManagera), nie window.*.
 * ARKUSZ HUD paczka B (Finding 564) — bez prawego wcięcia 6 px (pozostałość po wyzwalaczu dawnego wysuwanego
 * outlinera): prawa krawędź dochodzi do ekranu jak lewa.
 * @returns {{ x:number, y:number, w:number, h:number }}
 */
export function bottomNavBarRect(W, H) {
  const h = COSMIC.BOTTOM_NAV_H;
  const y = H - COSMIC.BOTTOM_LOG_TRIG_H - h;
  const x = 0;                                  // od LEWEJ krawędzi
  const w = Math.max(0, W);                     // do PRAWEJ krawędzi (564)
  return { x, y, w, h };
}

/**
 * Szerokość slotu (px): całkowita (`floor`), ostatni slot dochodzi do prawego końca paska. ARKUSZ HUD paczka B (Finding 564)
 * — granice slotów w całych px: kafle półprzezroczyste stykające się na ułamku piksela dają jaśniejszy szew (pasek jest bez
 * ram — U0-1); przy szerokości 1280 granice slotów 0–5 te same co z dawnym wcięciem (1274 / 7 = 182), ostatni slot szerszy
 * o odzyskane 6 px.
 */
export function navSlotWidth(rect, count) {
  return count > 0 ? Math.max(0, Math.floor(rect.w / count)) : 0;
}

/**
 * Layout slotów w prostokącie paska: równe sloty o całkowitej szerokości, ostatni — do prawego końca paska.
 * @returns {Array<{ index:number, x:number, w:number }>}
 */
export function navSlotLayout(rect, count) {
  const slots = [];
  if (count <= 0) return slots;
  const slotW = navSlotWidth(rect, count);
  for (let i = 0; i < count; i++) {
    const x = rect.x + i * slotW;
    slots.push({ index: i, x, w: i === count - 1 ? rect.x + rect.w - x : slotW });
  }
  return slots;
}

/** Indeks slotu pod punktem (x,y) lub -1 (granice jak `navSlotLayout`). */
export function hitNavSlot(rect, count, x, y) {
  if (count <= 0) return -1;
  if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) return -1;
  const slotW = navSlotWidth(rect, count);
  const idx = slotW > 0 ? Math.min(count - 1, Math.floor((x - rect.x) / slotW)) : -1;
  return (idx >= 0 && idx < count) ? idx : -1;
}

/** Punkt w prostokącie {x,y,w,h} (null-safe). */
export function pointInRect(rect, x, y) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
