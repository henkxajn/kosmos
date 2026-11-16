// ShipAnchorOverlayLogic — układ etykiet kotwic modułów na hologramie (ARC KONSOLE, krok K1b; CONSOLES_PLAN.md §2 B3).
// Czysta logika (zero DOM / Canvas) — keeper `ship_anchors_smoke`. Rysunek: `ShipAnchorOverlay.js`.
//
// IDIOM HUD: znacznik w punkcie kotwicy → odnośnik ukośny do «łokcia» → podkreślenie, nad nim etykieta WIELKIMI literami.
// Etykiety odchodzą NA ZEWNĄTRZ (punkt w lewej połowie prostokąta → etykieta w lewo, w prawej → w prawo) i w górę (przy górnej
// krawędzi — w dół). Na każdej stronie łokcie rozsunięte pionowo o wiersz (bez nakładania), całość w prostokącie gospodarza.
// Punkty z `label: false` (np. widok «góra» planu) — sam znacznik.

export const ANCHOR_OVERLAY = Object.freeze({
  LEAD_DX: 30,      // [px log.] odsunięcie łokcia w poziomie od znacznika
  LEAD_DY: 22,      // [px log.] odsunięcie łokcia w pionie
  ROW_H: 15,        // [px log.] minimalny odstęp łokci na jednej stronie (wiersz etykiety)
  PAD: 3,           // [px log.] zapas podkreślenia po obu stronach tekstu
  EDGE: 4,          // [px log.] margines od krawędzi prostokąta
  MARK_R: 3.5,      // [px log.] promień znacznika
  LINE_H: 12,       // [px log.] K1c — wiersz listy modułów POD podkreśleniem (`subs`)
});

/**
 * @param {{ key:string, x:number, y:number, text:string, src?:string, label?:boolean }[]} items
 * @param {{ x:number, y:number, w:number, h:number }} rect
 * @param {{ measure?: (text:string) => number, o?: object }} [opts]
 * @returns {object[]} elementy z `side` (−1 / 1 / 0 bez etykiety), `elbow` [x, y], `line` [x0, x1] podkreślenia, `textX`, `w`
 */
export function layoutAnchorLabels(items, rect, { measure = (s) => String(s).length * 6, o = ANCHOR_OVERLAY } = {}) {
  const r = rect ?? { x: 0, y: 0, w: 0, h: 0 };
  const cx = r.x + r.w / 2;
  const top = r.y + o.EDGE + o.ROW_H, bottom = r.y + r.h - o.EDGE;
  const left = r.x + o.EDGE, right = r.x + r.w - o.EDGE;
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
    if (it.label === false) { out.push({ ...it, side: 0, elbow: null, line: null, textX: null, w: 0 }); continue; }
    // K1c — `subs`: lista modułów roli pod podkreśleniem (szerokość = najszerszy wiersz; wysokość `extra` przy rozsuwaniu)
    const subs = Array.isArray(it.subs) ? it.subs : [];
    const w = Math.max(0, measure(it.text), ...subs.map((s) => measure(s, true))) + o.PAD * 2;
    const extra = subs.length * o.LINE_H;
    let side = it.x < cx ? -1 : 1;
    // nie mieści się na zewnątrz — na drugą stronę
    if (side < 0 && it.x - o.LEAD_DX - w < left) side = 1;
    else if (side > 0 && it.x + o.LEAD_DX + w > right) side = -1;
    const up = it.y - o.LEAD_DY >= top;
    out.push({ ...it, side, w, extra, elbow: [it.x + side * o.LEAD_DX, up ? it.y - o.LEAD_DY : it.y + o.LEAD_DY], line: null, textX: null });
  }
  // rozsunięcie pionowe łokci na każdej stronie + klamra w prostokącie
  for (const side of [-1, 1]) {
    const col = out.filter((e) => e.side === side).sort((a, b) => a.elbow[1] - b.elbow[1] || a.x - b.x);
    for (let k = 1; k < col.length; k++) {
      const minY = col[k - 1].elbow[1] + o.ROW_H + (col[k - 1].extra ?? 0);
      if (col[k].elbow[1] < minY) col[k].elbow[1] = minY;
    }
    const last = col[col.length - 1];
    const over = last ? last.elbow[1] + (last.extra ?? 0) - bottom : 0;
    if (over > 0) for (const e of col) e.elbow[1] -= over;
    for (const e of col) e.elbow[1] = Math.max(top, e.elbow[1]);
    for (const e of col) {
      // łokcie jednej strony w jednej kolumnie wyrównanej do najdalszego (czytelna lista), w klamrze prostokąta
      e.elbow[0] = Math.min(right - (side > 0 ? e.w : 0), Math.max(left + (side < 0 ? e.w : 0), e.elbow[0]));
      e.line = side < 0 ? [e.elbow[0] - e.w, e.elbow[0]] : [e.elbow[0], e.elbow[0] + e.w];
      e.textX = e.line[0] + o.PAD;
    }
  }
  return out;
}

/** Czy dwie etykiety (podkreślenie + wiersz nad nim) się nakładają — keeper. */
export function labelsOverlap(a, b, o = ANCHOR_OVERLAY) {
  if (!a?.line || !b?.line) return false;
  const ax0 = a.line[0], ax1 = a.line[1], bx0 = b.line[0], bx1 = b.line[1];
  const ay0 = a.elbow[1] - o.ROW_H, ay1 = a.elbow[1] + (a.extra ?? 0), by0 = b.elbow[1] - o.ROW_H, by1 = b.elbow[1] + (b.extra ?? 0);
  return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
}
