// HudLabelLogic — ARKUSZ HUD H2 (D-HUD-5, D-HUD-6, D-HUD-16; HUD_PLAN.md §4.3): czysta logika ETYKIET warstwy HUD 2D —
// LOD stosu „planeta + księżyce + stacje” (szyna), anti-overlap z kadrem obszaru mapy, nitki, strefy kliku, kratka cyfr,
// ucinanie z „…”, fade-in. Rysunek — `HudLabelLayer`.
// Czysty: bez three i bez DOM, bez `window`; ZERO kolorów na sztywno (style z ról `HudPalette.resolveHudRoles` podaje
// wołający). Wielkości w px LOGICZNYCH UI (skala jak `#ui-canvas`).
//   • LOD stosu (D-HUD-5) — deterministyczna funkcja średnicy tarczy KOTWICY (planeta grupy `stationGroupOf`) w px:
//     < `STACK_COLLAPSE_PX` — zwinięta „NOWA ZIEMIA +2” · do `STACK_EXPAND_PX` — szyna (kolumna etykiet z kropkami na
//     pionowej szynie, jedna nitka do kotwicy) · od `STACK_EXPAND_PX` — każdy członek przy własnym obiekcie. Progi — stałe do
//     strojenia okiem na bramce (punkt wyjścia z planu: 6 / 40 px); px tarczy są odporne na 502 (tarcza gwiazdy);
//   • anti-overlap (514): WSZYSTKIE etykiety (ciała, szyny, statki) jednym przebiegiem — zachłannie wg priorytetu
//     (zaznaczone pierwsze), kandydaci wokół kotwicy (nad nią w prawo / w lewo, coraz wyżej, potem pod nią); ważny
//     kandydat leży CAŁY w kadrze (obszar mapy z `MapInsets`) i nie dotyka etykiet już położonych ani przeszkód (tarcze
//     ciał, odczyt zasięgu radaru — 525, glif skoku warp, strzałki krawędzi); poprzedni wybór wygrywa, gdy nadal ważny
//     (bez skoków przy ruchu kamery); brak ważnego — najmniejsze nakładanie, zawsze w kadrze;
//   • strefa kliku = prostokąt tekstu (503); punkt na tarczy ciała wygrywa (487) — rozstrzyga wołający (raycast tarcz);
//   • kratka cyfr (D-HUD-6): każda cyfra w komórce o szerokości najszerszej cyfry aktywnego fontu (Rajdhani nie ma `tnum`).
import { stationGroupAnchorId } from '../utils/StationGroup.js';

// Rysunek i układ (px logiczne, ms). Strojenie na bramce (artboard właściciela „Kombinacja — szlif”).
export const HUD_LABELS = Object.freeze({
  BAR_ALPHA_SELECTED: 0.72,     // pasek pod tekstem — zaznaczony
  BAR_ALPHA: 0.55,              // pasek — reszta
  SUB_ALPHA: 0.78,              // druga linia (dane) — krycie tekstu
  THREAD_ALPHA: 0.55,           // nitka i podkreślenie
  THREAD_WIDTH: 1,
  LETTER_SPACING_COLONY: 1,     // wersaliki kolonii — odstęp liter (px)
  MAIN_SIZE_DELTA: -1,          // pierwsza linia = THEME.fontSizeNormal + delta
  PAD_X: 4, PAD_Y: 2,           // margines tekstu w pasku
  LINE_GAP: 1,                  // odstęp linii
  OFF_X: 7, OFF_Y: 9,           // narożnik nitki od krawędzi tarczy / sprite'a (w bok, w górę)
  STEP_Y: 7, LEVELS: 14,        // kolejni kandydaci wyżej / niżej o STEP_Y
  GAP: 2,                       // minimalny odstęp między etykietami
  EDGE: 3,                      // margines od krawędzi kadru
  STACK_COLLAPSE_PX: 6,         // średnica tarczy kotwicy < 6 px → zwinięta „+N”
  STACK_EXPAND_PX: 40,          // ≥ 40 px → każdy członek przy własnym obiekcie
  RAIL_INDENT: 8,               // tekst wiersza szyny od szyny
  RAIL_DOT_R: 1.6,              // kropka wiersza na szynie
  ROW_GAP: 2,                   // odstęp wierszy szyny
  FADE_MS: 150,                 // fade-in — czas realny (D-HUD-12)
  MAX_NAME_PX: 180,             // nazwa dłuższa — ucinana z „…” (513)
  DISC_OBSTACLE_MIN_PX: 3,      // tarcza mniejsza (promień) — nie jest przeszkodą
  ARROW_BOX: 14,                // strzałka krawędzi jako przeszkoda (kwadrat)
  BRACKET_HALF: 17,             // ramka zaznaczenia statku — połowa boku (lustro `UIManager._drawBracketForVessel`, s = 17)
  BRACKET_BARS: 14,             // … paski paliwa i warp pod ramką prowadzącego (4 + 2 × (3 + 2) px)
});

// Priorytety (mniej = kładzione wcześniej): zaznaczone · dom · grupa / szyna · kolonia · stacja · statki · wrogowie.
export const LABEL_PRIO = Object.freeze({ selected: 0, home: 1, group: 1, colony: 2, station: 3, own: 4, enemy: 5 });

// ── LOD stosu ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Stan stosu z średnicy tarczy kotwicy (px) i liczby etykiet w grupie.
 * @returns {'single'|'collapsed'|'rail'|'spread'}
 */
export function stackLOD(discPx, members = 2) {
  if (!(members >= 2)) return 'single';
  if (!(discPx >= HUD_LABELS.STACK_COLLAPSE_PX)) return 'collapsed';   // także null / NaN — z daleka
  if (discPx < HUD_LABELS.STACK_EXPAND_PX) return 'rail';
  return 'spread';
}

/** Kolejność stanów — wymuszenie co najmniej szyny, gdy zaznaczony jest członek inny niż kotwica. */
const LOD_RANK = { single: 0, collapsed: 1, rail: 2, spread: 3 };
export function atLeastLOD(state, min) {
  return (LOD_RANK[state] ?? 0) >= (LOD_RANK[min] ?? 0) ? state : min;
}

/** Tekst zwiniętej grupy: nazwa (kotwica, inaczej pierwszy członek) + „+N” (pozostali). */
export function collapsedText(name, others) {
  return others > 0 ? `${name} +${others}` : `${name}`;
}

/**
 * Grupy stosu (D-HUD-5): etykiety ciał (kolonie, stacje) wg kotwicy `stationGroupAnchorId` (planeta; księżyc → planeta
 * macierzysta). Kolejność członków: kotwica, księżyce, stacje (w obrębie rodzaju — kolejność wejścia).
 * @param {Array<{key, kind:'colony'|'station', body?:object, anchorId?:string}>} items
 * @returns {Map<string, object[]>} kotwica → członkowie
 */
export function groupByAnchor(items) {
  const groups = new Map();
  for (const it of items ?? []) {
    const a = it.anchorId ?? stationGroupAnchorId(it.body) ?? it.key;
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a).push(it);
  }
  const rank = (it, a) => (it.kind === 'colony' && it.id === a) ? 0 : it.kind === 'colony' ? 1 : 2;
  for (const [a, list] of groups) list.sort((p, q) => rank(p, a) - rank(q, a));
  return groups;
}

// ── Geometria prostokątów ───────────────────────────────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cmpKey = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

/** Pole przecięcia dwóch prostokątów (z odstępem `gap` — prostokąt `a` powiększony). */
export function rectOverlapArea(a, b, gap = 0) {
  const ix = Math.min(a.x + a.w + gap, b.x + b.w) - Math.max(a.x - gap, b.x);
  const iy = Math.min(a.y + a.h + gap, b.y + b.h) - Math.max(a.y - gap, b.y);
  return (ix > 0 && iy > 0) ? ix * iy : 0;
}

/** Czy prostokąt dotyka koła (dokładnie — najbliższy punkt prostokąta). */
export function rectCircleOverlap(r, cx, cy, rad) {
  const nx = clamp(cx, r.x, r.x + r.w), ny = clamp(cy, r.y, r.y + r.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < rad * rad;
}

/** Czy prostokąt leży CAŁY w kadrze `rect` = { x, y, w, h } z marginesem `edge`. */
export function insideRect(b, rect, edge = 0) {
  return b.x >= rect.x + edge - 1e-6 && b.y >= rect.y + edge - 1e-6
    && b.x + b.w <= rect.x + rect.w - edge + 1e-6 && b.y + b.h <= rect.y + rect.h - edge + 1e-6;
}

/** Czy punkt leży w kadrze. */
export function pointInRect(x, y, rect) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** Nakładanie prostokąta z przeszkodami: { x, y, w, h } (prostokąt) albo { cx, cy, r } (koło — kara = pole prostokąta). */
function obstacleScore(box, obstacles, skip = null) {
  let s = 0;
  for (const o of obstacles ?? []) {
    if (!o || o === skip) continue;
    if (o.r != null) { if (rectCircleOverlap(box, o.cx, o.cy, o.r)) s += box.w * box.h * 0.5 + 1; }
    else s += rectOverlapArea(box, o, 0);
  }
  return s;
}

// ── Kandydaci i rozkład ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Kandydaci położenia etykiety wokół kotwicy (`ax`, `ay`, prześwit `clear` — promień tarczy / sprite'a w px).
 * Kolejność: nad kotwicą w prawo, w lewo, coraz wyżej; potem pod kotwicą w prawo, w lewo, coraz niżej. Narożnik nitki
 * (`attach`) — dolny narożnik po stronie kotwicy (nitka przechodzi w podkreślenie pod tekstem).
 * @returns {Array<{x:number, y:number, side:'E'|'W', below:boolean, level:number}>}
 */
export function labelCandidates(it) {
  const R = HUD_LABELS;
  const c = Math.max(0, it.clear ?? 0) * Math.SQRT1_2;
  const out = [];
  const xE = it.ax + c + R.OFF_X, xW = it.ax - c - R.OFF_X - it.w;
  for (let lv = 0; lv < R.LEVELS; lv++) {
    const bottom = it.ay - c - R.OFF_Y - lv * R.STEP_Y;
    out.push({ x: xE, y: bottom - it.h, side: 'E', below: false, level: lv });
    out.push({ x: xW, y: bottom - it.h, side: 'W', below: false, level: lv });
  }
  for (let lv = 0; lv < R.LEVELS; lv++) {
    const top = it.ay + c + R.OFF_Y + lv * R.STEP_Y;
    out.push({ x: xE, y: top, side: 'E', below: true, level: lv });
    out.push({ x: xW, y: top, side: 'W', below: true, level: lv });
  }
  return out;
}

/**
 * Anti-overlap i kadr — rozkład etykiet (deterministyczny przy tych samych wejściach i `prev`).
 * @param {Array<{key, ax, ay, w, h, clear?, prio?}>} items — prostokąty etykiet (px logiczne) i kotwice
 * @param {{ rect:{x,y,w,h}, obstacles?:object[], prev?:Map<string, number> }} o — kadr (obszar mapy), przeszkody, poprzedni
 *   wybór kandydata (klucz → indeks)
 * @returns {{ placed: Array<object>, hidden: string[] }} — `placed`: item + `x, y, side, below, cand, overlap, attach`
 */
export function placeLabels(items, { rect, obstacles = [], prev = null } = {}) {
  const R = HUD_LABELS;
  const sorted = [...(items ?? [])].sort((a, b) => ((a.prio ?? 9) - (b.prio ?? 9)) || cmpKey(a.key, b.key));
  const placed = [], hidden = [];
  for (const it of sorted) {
    if (!(it.w > 0 && it.h > 0) || !rect || it.w > rect.w - 2 * R.EDGE || it.h > rect.h - 2 * R.EDGE) { hidden.push(it.key); continue; }
    const cands = labelCandidates(it);
    const pi = prev?.get?.(it.key);
    const tryOrder = [];
    if (Number.isInteger(pi) && pi >= 0 && pi < cands.length) tryOrder.push(pi);
    for (let i = 0; i < cands.length; i++) if (i !== pi) tryOrder.push(i);
    let best = -1, bestScore = Infinity;
    for (const i of tryOrder) {
      const c = cands[i];
      const box = { x: c.x, y: c.y, w: it.w, h: it.h };
      if (!insideRect(box, rect, R.EDGE)) continue;
      let s = obstacleScore(box, obstacles, it.ownObstacle ?? null);
      for (const p of placed) s += rectOverlapArea(box, p, R.GAP);
      if (s < bestScore) { bestScore = s; best = i; if (s === 0) break; }
    }
    let c;
    if (best >= 0) c = cands[best];
    else {   // żaden kandydat nie mieści się w kadrze — pierwszy kandydat wciśnięty w kadr
      best = 0;
      c = { ...cands[0] };
      c.x = clamp(c.x, rect.x + R.EDGE, rect.x + rect.w - R.EDGE - it.w);
      c.y = clamp(c.y, rect.y + R.EDGE, rect.y + rect.h - R.EDGE - it.h);
      bestScore = NaN;
    }
    const p = { ...it, x: c.x, y: c.y, side: c.side, below: c.below, cand: best, overlap: Number.isFinite(bestScore) ? bestScore : null };
    p.attach = { x: c.side === 'E' ? p.x : p.x + p.w, y: p.y + p.h };
    placed.push(p);
  }
  return { placed, hidden };
}

/** Pary nakładających się prostokątów (bramka / keeper): [i, j]. */
export function overlappingPairs(boxes, gap = 0) {
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (rectOverlapArea(boxes[i], boxes[j], gap) > 0) out.push([i, j]);
  }
  return out;
}

/**
 * Nitka: od krawędzi prześwitu kotwicy (tarcza / sprite) do narożnika etykiety; dalej podkreślenie pod tekstem.
 * @returns {{ x0, y0, x1, y1 }}
 */
export function threadGeometry(p) {
  const dx = p.attach.x - p.ax, dy = p.attach.y - p.ay, d = Math.hypot(dx, dy);
  const k = d > 0 ? Math.min(1, Math.max(0, p.clear ?? 0) / d) : 0;
  return { x0: p.ax + dx * k, y0: p.ay + dy * k, x1: p.attach.x, y1: p.attach.y };
}

/**
 * Wiersze bloku szyny: położenie (px logiczne) wierszy w bloku `p` (po rozkładzie) — tekst od szyny (strona E: szyna na
 * lewej krawędzi bloku, tekst na prawo; strona W: szyna na prawej krawędzi, tekst wyrównany do prawej).
 * @param {{x, y, w, side, rows:Array<{w, h}>}} p
 * @returns {{ railX:number, rows:Array<{x, y, w, h, lineY, dotX}> }}
 */
export function railRows(p) {
  const R = HUD_LABELS;
  const railX = p.side === 'E' ? p.x : p.x + p.w;
  let y = p.y;
  const rows = [];
  for (const r of p.rows ?? []) {
    const x = p.side === 'E' ? p.x + R.RAIL_INDENT : p.x + p.w - R.RAIL_INDENT - r.w;
    rows.push({ ...r, x, y, w: r.w, h: r.h, lineY: y + r.h, dotX: railX });
    y += r.h + R.ROW_GAP;
  }
  return { railX, rows };
}

/** Wymiary bloku szyny z wymiarów wierszy. */
export function railBlockSize(rows) {
  const R = HUD_LABELS;
  let w = 0, h = 0;
  for (let i = 0; i < (rows?.length ?? 0); i++) { w = Math.max(w, rows[i].w); h += rows[i].h + (i > 0 ? R.ROW_GAP : 0); }
  return { w: w + R.RAIL_INDENT, h };
}

// ── Klik ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Strefa kliku etykiety pod punktem (px logiczne) — najwyższa (ostatnio narysowana). Punkt na tarczy ciała wygrywa
 * (487, 503): `onDisc() === true` → brak trafienia (klik przechodzi do raycastu tarcz).
 * @param {Array<{x,y,w,h, target}>} zones — w kolejności rysowania
 * @returns {object|null} strefa
 */
export function resolveLabelClick(zones, x, y, onDisc = null) {
  if (!Array.isArray(zones) || !zones.length || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  let hit = null;
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { hit = z; break; }
  }
  if (!hit) return null;
  if (typeof onDisc === 'function' && onDisc() === true) return null;
  return hit;
}

// ── Tekst ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const DIGIT = /[0-9]/;

/**
 * Układ tekstu z cyframi w stałej kratce (D-HUD-6): cyfra w komórce `cell` (szerokość najszerszej cyfry), reszta tekstu —
 * pomiarem fontu. `measure(s)` — szerokość napisu (bez odstępu liter); `spacing` — odstęp liter (px, po każdym znaku).
 * @returns {{ w:number, segs:Array<{ s:string, x:number, w:number, digit:boolean }> }}
 */
export function layoutTabular(text, { measure, cell, spacing = 0 }) {
  const segs = [];
  let x = 0, run = '';
  const flush = () => {
    if (!run) return;
    const w = (measure?.(run) ?? run.length * 6) + spacing * run.length;
    segs.push({ s: run, x, w, digit: false });
    x += w; run = '';
  };
  for (const ch of String(text ?? '')) {
    if (DIGIT.test(ch)) {
      flush();
      const w = cell + spacing;
      segs.push({ s: ch, x, w, digit: true });
      x += w;
    } else run += ch;
  }
  flush();
  // Odstęp po ostatnim znaku nie należy do szerokości napisu.
  const w = Math.max(0, x - (segs.length ? spacing : 0));
  return { w, segs };
}

/**
 * Ucinanie do szerokości `maxW` z „…” (513) — `width(s)` mierzy napis (z kratką cyfr i odstępem liter).
 */
export function truncateText(text, maxW, width) {
  const s0 = String(text ?? '');
  if (!(maxW > 0) || width(s0) <= maxW) return s0;
  let s = s0;
  while (s.length > 1 && width(s + '…') > maxW) s = s.slice(0, -1);
  return s + '…';
}

/** Fade-in etykiety (D-HUD-12 — czas realny, działa w pauzie): 0 → 1 w `FADE_MS`. */
export function fadeAlpha(nowMs, bornMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(bornMs)) return 1;
  const d = nowMs - bornMs;
  if (d <= 0) return 0;
  return d >= HUD_LABELS.FADE_MS ? 1 : d / HUD_LABELS.FADE_MS;
}

/**
 * Pamięć narodzin etykiet (fade-in): klucze obecne teraz; nowy klucz — „urodzony” teraz; zniknięty — zapomniany.
 * @param {Map<string, number>} born — mutowana
 * @returns {boolean} czy któraś etykieta jeszcze się rozjaśnia
 */
export function updateBorn(born, keys, nowMs) {
  const now = new Set(keys);
  for (const k of [...born.keys()]) if (!now.has(k)) born.delete(k);
  let fading = false;
  for (const k of now) {
    if (!born.has(k)) born.set(k, nowMs);
    if (nowMs - born.get(k) < HUD_LABELS.FADE_MS) fading = true;
  }
  return fading;
}

// ── Etykiety CTRL (D-HUD-16) ────────────────────────────────────────────────────────────────────────────────────────

/** Rola i krycie etykiety CTRL (przytrzymanie Ctrl — nazwy wszystkich obiektów). */
export function ctrlLabelStyle(kind, roles) {
  switch (kind) {
    case 'vessel':
    case 'station': return { color: roles.primary, alpha: 1 };
    case 'enemy':   return { color: roles.foreign, alpha: 1 };
    case 'wreck':   return { color: roles.dim, alpha: 1 };
    default:        return { color: roles.primary, alpha: 0.62 };   // gwiazda, planety, księżyce, planetoidy
  }
}
