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

// ── K1c-B: etykiety bohatera Stoczni POZA obrysem kadłuba ──────────────────────────────────────────────────────────────────
// Dwie kolumny poza prostokątem rzutu kadłuba: kotwica po lewej stronie środka obrysu → kolumna lewa, po prawej → prawa (w
// domyślnym 3/4 dziób jest po lewej, więc lewa = dziobowa; po obrocie myszą kolumny idą za ekranem, nie za dziobem — inaczej
// odnośniki przecinałyby kadłub). Kolumna mieści się obok obrysu → etykiety przy obrysie, rozsunięte w pionie; nie mieści się
// → przy krawędzi prostokąta, NAD albo POD obrysem (wg wysokości kotwicy). Prostokąt etykiety nigdy nie wchodzi w obrys.
export const HERO_LABELS = Object.freeze({
  GAP: 10,          // [px log.] odstęp etykiety od prostokąta obrysu kadłuba
});

/** Prostokąt etykiety (wiersz roli nad podkreśleniem + lista modułów pod nim) — keeper i rysunek. */
export function labelRect(e, o = ANCHOR_OVERLAY) {
  if (!e?.line || !e.elbow) return null;
  return { x: e.line[0], y: e.elbow[1] - o.ROW_H, w: e.line[1] - e.line[0], h: o.ROW_H + (e.extra ?? 0) };
}

/**
 * @param {{ key:string, x:number, y:number, text:string, subs?:string[], label?:boolean }[]} items — rzut kotwic
 * @param {{x:number,y:number,w:number,h:number}} rect — prostokąt hologramu
 * @param {{x0:number,y0:number,x1:number,y1:number}|null} hull — obrys rzutu kadłuba (null → układ K1b `layoutAnchorLabels`)
 * @returns {object[]} jak `layoutAnchorLabels` (+ `band`: 'beside' | 'above' | 'below')
 */
export function layoutHeroLabels(items, rect, hull, { measure = (s) => String(s).length * 6, o = ANCHOR_OVERLAY, gap = HERO_LABELS.GAP } = {}) {
  if (!hull || ![hull.x0, hull.y0, hull.x1, hull.y1].every(Number.isFinite)) return layoutAnchorLabels(items, rect, { measure, o });
  const r = rect ?? { x: 0, y: 0, w: 0, h: 0 };
  const left = r.x + o.EDGE, right = r.x + r.w - o.EDGE;
  const top = r.y + o.EDGE + o.ROW_H, bottom = r.y + r.h - o.EDGE;    // granice łokcia (blok: łokieć − ROW_H … łokieć + extra)
  const hx0 = hull.x0 - gap, hx1 = hull.x1 + gap, hy0 = hull.y0 - gap, hy1 = hull.y1 + gap;
  const cx = (hull.x0 + hull.x1) / 2, cy = (hull.y0 + hull.y1) / 2;
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
    if (it.label === false) { out.push({ ...it, side: 0, elbow: null, line: null, textX: null, w: 0 }); continue; }
    const subs = Array.isArray(it.subs) ? it.subs : [];
    const w = Math.max(0, measure(it.text), ...subs.map((s) => measure(s, true))) + o.PAD * 2;
    out.push({ ...it, side: it.x < cx ? -1 : 1, w, extra: subs.length * o.LINE_H, elbow: [it.x, it.y], line: null, textX: null, band: null });
  }
  const H = (e) => o.ROW_H + e.extra;
  // pakowanie swobodne (obok obrysu): łokieć możliwie na wysokości kotwicy, bez nakładania, w klamrze prostokąta
  const packFree = (col) => {
    col.sort((a, b) => a.y - b.y || a.x - b.x);
    let prev = null;
    for (const e of col) { e.elbow[1] = Math.max(e.y, prev ? prev.elbow[1] + prev.extra + o.ROW_H : top); prev = e; }
    const last = col[col.length - 1];
    const over = last ? last.elbow[1] + last.extra - bottom : 0;
    if (over > 0) for (const e of col) e.elbow[1] -= over;
    let p2 = null;
    for (const e of col) { e.elbow[1] = Math.max(e.elbow[1], p2 ? p2.elbow[1] + p2.extra + o.ROW_H : top); p2 = e; }
  };
  for (const side of [-1, 1]) {
    const col = out.filter((e) => e.side === side);
    if (!col.length) continue;
    const colW = Math.max(...col.map((e) => e.w));
    const beside = side < 0 ? hx0 - left >= colW : right - hx1 >= colW;
    if (beside) {
      for (const e of col) { e.line = side < 0 ? [hx0 - e.w, hx0] : [hx1, hx1 + e.w]; e.band = 'beside'; }
      packFree(col);
    } else {
      for (const e of col) e.line = side < 0 ? [left, left + e.w] : [right - e.w, right];
      const sorted = [...col].sort((a, b) => a.y - b.y || a.x - b.x);
      let above = sorted.filter((e) => e.y < cy), below = sorted.filter((e) => e.y >= cy);
      const sum = (g) => g.reduce((s, e) => s + H(e), 0);
      const capA = hy0 - (r.y + o.EDGE), capB = bottom - hy1;
      while (above.length && sum(above) > capA && sum(below) + H(above[above.length - 1]) <= capB) below.unshift(above.pop());
      while (below.length && sum(below) > capB && sum(above) + H(below[0]) <= capA) above.push(below.shift());
      // nad obrysem: od obrysu w górę (najniższa kotwica najbliżej kadłuba)
      let cur = hy0;
      for (let k = above.length - 1; k >= 0; k--) { const e = above[k]; e.elbow[1] = cur - e.extra; cur = e.elbow[1] - o.ROW_H; e.band = 'above'; }
      // pod obrysem: od obrysu w dół
      cur = hy1;
      for (const e of below) { e.elbow[1] = cur + o.ROW_H; cur = e.elbow[1] + e.extra; e.band = 'below'; }
    }
    for (const e of col) {
      e.elbow[0] = side < 0 ? e.line[1] : e.line[0];
      e.textX = e.line[0] + o.PAD;
    }
  }
  return out;
}
