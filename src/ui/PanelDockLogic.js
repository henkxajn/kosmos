// PanelDockLogic — czysta logika układu doku zminimalizowanych paneli (S3.4b C2; ARKUSZ UI U4-3).
// Node-importowalna (bez canvas / three) → smoke-testowalna. Widok w PanelDock.js.
//
// ARKUSZ UI U4-3 (UI_PLAN §4.5, decyzja (c)): chipy w JEDNYM rzędzie na pasie dolnym — od lewego końca pasa, odstęp
// `DOCK_CHIP_GAP`; gdy wszystkie się nie mieszczą, ostatnie miejsce zajmuje chip „+N” (N = liczba niewidocznych — lista
// w podpowiedzi). Dawniej (S3.4b C2) belki 156 × 24 px stackowały się PIONOWO w lewym dolnym rogu obszaru mapy
// (`computeDockSlots`, usunięte razem ze stosem).

export const DOCK_CHIP_H     = 16;    // px — wysokość chipa (rząd w pasie dolnym 20 px)
export const DOCK_CHIP_GAP   = 4;     // px — odstęp między chipami i od krańców rzędu
export const DOCK_CHIP_MAX_W = 110;   // px — szerokość chipa: ikona + skrócona nazwa, najwyżej tyle

/**
 * Rozmieść chipy doku w rzędzie.
 * @param {number[]} widths — szerokości chipów (px, już przycięte do `DOCK_CHIP_MAX_W`), kolejność doku (najstarszy
 *   pierwszy)
 * @param {{x0:number, x1:number, y:number, h:number, gap?:number, moreW?:number}} span — rząd (x0 — lewy koniec,
 *   x1 — granica z prawej); `moreW` — szerokość chipa „+N”
 * @returns {{ chips: Array<{x:number,y:number,w:number,h:number,index:number}>,
 *             more: null | {x:number,y:number,w:number,h:number,count:number,first:number} }}
 *   `more.first` — indeks pierwszego niewidocznego wpisu, `more.count` — ile ich jest
 */
export function layoutDockChips(widths, span) {
  const { x0, x1, y, h, gap = DOCK_CHIP_GAP, moreW = 28 } = span;
  const n = widths?.length ?? 0;
  const chips = [];
  if (!n) return { chips, more: null };
  const total = widths.reduce((s, w) => s + w, 0) + gap * (n - 1);
  let x = x0;
  if (x0 + total <= x1) {                       // wszystkie się mieszczą
    for (let i = 0; i < n; i++) { chips.push({ x, y, w: widths[i], h, index: i }); x += widths[i] + gap; }
    return { chips, more: null };
  }
  // Nie mieszczą się — tyle chipów, ile wejdzie z miejscem na „+N” po nich.
  let i = 0;
  for (; i < n; i++) {
    if (x + widths[i] + gap + moreW > x1) break;
    chips.push({ x, y, w: widths[i], h, index: i });
    x += widths[i] + gap;
  }
  if (x + moreW > x1) return { chips, more: null };   // rząd węższy niż sam chip „+N” (skrajnie wąskie okno)
  return { chips, more: { x, y, w: moreW, h, count: n - i, first: i } };
}
