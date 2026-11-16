// ConsoleKit — rysowanie wspólnych elementów konsol (ARC KONSOLE K0a, docs/design/CONSOLES_PLAN.md §3, D-K-1, D-K-19).
//
// Idiom HUD mapy na ekranach zakładek: linie 1 px, nawiasy narożne zamiast wypełnionych skrzynek, etykiety WERSALIKAMI
// z podkreśleniem-prowadnicą, akcje jako „[ CZIP ]”, duże instrumenty liczbowe. KAŻDE wywołanie dostaje
// `roles = resolveHudRoles(THEME)` — zero literałów kolorów w tym pliku (pin keepera `console_kit_smoke.mjs`); krycie przez
// `globalAlpha`, nigdy przez sklejanie napisu rgba. Fonty i rozmiary — tokeny THEME. Cyfry w kratce `layoutTabular`
// (proporcjonalny font Neon Cyber trzyma kolumny).
//
// Geometria stref — `ConsoleLayoutLogic.consoleZones`; tu tylko rysowanie wewnątrz podanych prostokątów. Funkcje, które
// mają klikalne elementy, ZWRACAJĄ strefy trafień `{ type, id, x, y, w, h }` — ekran dokłada je do swoich (pierwsza wygrywa).
// Strojenie (bramka): `KOSMOS.debug.consoleKit.tuneKit({ ROW_H: 20 })`. Nawiasy narożne — tylko bohater i zaznaczone elementy
// (wiersz listy, karta kolejki); pozostałe strefy — `drawZoneRule` (linia 1 px + etykieta).

import { THEME } from '../config/ThemeConfig.js';
import { bracketCornersRect } from './HudAttentionLogic.js';
import { layoutTabular, truncateText } from './HudLabelLogic.js';
import { clampScroll, scrollThumb, pruneZones } from './InfoPanelLayoutLogic.js';
import { layoutButtonRows } from './LabelPinLogic.js';

export const CONSOLE_KIT_DEFAULTS = Object.freeze({
  BRACKET_ARM: 10,      // ramię nawiasu narożnego strefy bohatera (px)
  SELECT_ARM: 4,        // ramię nawiasu zaznaczonego elementu (wiersz, karta)
  ROW_H: 18,            // wiersz listy
  GROUP_H: 20,          // nagłówek grupy listy
  ROW_PAD_X: 8,         // wcięcie tekstu wiersza
  HOVER_ALPHA: 0.18,    // wypełnienie wiersza pod kursorem (rola primary)
  TRACK_ALPHA: 0.35,    // tor paska i przewijania (rola dim)
  BAR_H: 2,             // pasek wartości
  SCROLLBAR_W: 2,       // pasek przewijania listy
  KV_H: 16,             // wiersz klucz–wartość
  EYEBROW_H: 18,        // etykieta sekcji z prowadnicą
  CHIP_H: 18,           // czip akcji
  CHIP_GAP: 6,
  CHIP_PAD_X: 4,
  HEADER_CHIP_GAP: 4,   // czipy podzakładek w nagłówku
  QUEUE_CHIP_W: 132,    // czip kolejki w pasie
  MORE_W: 28,           // miejsce na „+N” za ostatnim mieszczącym się czipem kolejki
  LANE_H: 20,           // tor osi czasu w pasie
  SPAN_H: 12,           // odcinek na torze (etykieta w środku, gdy się mieści)
  LANE_LABEL_W: 96,
  OFF_ALPHA: 0.55,      // czip „off” (przekreślony) — krycie tekstu
  // K0b — czytelność na żywej, przyciemnionej scenie (decyzja właściciela C+A; tylko konsole):
  DIM_LIFT: 0.35,       // (C) rola dim konsoli podniesiona w stronę tekstu głównego (0 = dim jak na mapie, 1 = textPrimary)
  HALO_BLUR: 2,         // (A) ciemna poświata za tekstem konsoli: shadowBlur w kolorze tła motywu (px; 0 = bez poświaty)
});
export const CONSOLE_KIT = { ...CONSOLE_KIT_DEFAULTS };

export function tuneConsoleKit(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k in CONSOLE_KIT_DEFAULTS && Number.isFinite(v) && v >= 0) CONSOLE_KIT[k] = v;
  }
  return { ...CONSOLE_KIT };
}
export function resetConsoleKit() { Object.assign(CONSOLE_KIT, CONSOLE_KIT_DEFAULTS); return { ...CONSOLE_KIT }; }

// ── Pomocnicze ───────────────────────────────────────────────────────────────────────────────────────────────────────

const font = (size, bold = false) => `${bold ? 'bold ' : ''}${size}px ${THEME.fontFamily}`;
const toneColor = (roles, tone) => roles[tone] ?? roles.primary;
const inRect = (r, x, y) => !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Czysta: strefa trafień pod punktem (pierwsza wygrywa — kolejność dokładania = priorytet) albo null. */
export function kitZoneAt(zones, x, y) {
  for (const z of zones ?? []) if (inRect(z, x, y)) return z;
  return null;
}

/** Czysta: tekst czipu akcji „[ LABEL ]” (wersaliki). */
export function chipLabel(label) { return `[ ${String(label ?? '').toUpperCase()} ]`; }

function strokeLine(ctx, x0, y0, x1, y1) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

/** Szerokość najszerszej cyfry bieżącego fontu (kratka `layoutTabular`). */
function digitCell(ctx) {
  let w = 0;
  for (let d = 0; d <= 9; d++) w = Math.max(w, ctx.measureText(String(d)).width);
  return w;
}

/** Tekst z cyframi w kratce: rysuje przy bieżącym foncie/kolorze; `align` 'left' | 'right' | 'center'. Zwraca szerokość. */
export function drawTabular(ctx, text, x, y, align = 'left') {
  const cell = digitCell(ctx);
  const lay = layoutTabular(String(text ?? ''), { measure: (s) => ctx.measureText(s).width, cell });
  const x0 = align === 'right' ? x - lay.w : align === 'center' ? x - lay.w / 2 : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const s of lay.segs) {
    if (s.digit) { const gw = ctx.measureText(s.s).width; ctx.fillText(s.s, x0 + s.x + (s.w - gw) / 2, y); }
    else ctx.fillText(s.s, x0 + s.x, y);
  }
  ctx.textAlign = prev;
  return lay.w;
}

const tabularWidth = (ctx, text) =>
  layoutTabular(String(text ?? ''), { measure: (s) => ctx.measureText(s).width, cell: digitCell(ctx) }).w;

// ── Tło i rama ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * K0b (A) — ciemna poświata za wszystkim, co ekran konsoli narysuje do najbliższego `ctx.restore()`: cień bez przesunięcia,
 * rozmycie `HALO_BLUR`, kolor tła motywu. Wołać po `ctx.save()` na początku rysowania konsoli; 0 — bez poświaty.
 */
export function applyConsoleHalo(ctx) {
  const b = CONSOLE_KIT.HALO_BLUR;
  if (!(b > 0)) return;
  ctx.shadowColor = THEME.bgPrimary;
  ctx.shadowBlur = b;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Nieprzezroczyste tło konsoli (D-K-5) — token `bgPrimary` motywu na prostokącie (domyślnie całe płótno). */
export function drawConsoleBackground(ctx, rect) {
  ctx.fillStyle = THEME.bgPrimary;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

/** Rama strefy: cztery nawiasy narożne 1 px, bez wypełnienia. `tone` — rola (domyślnie dim). */
export function drawZoneFrame(ctx, rect, roles, { tone = 'dim', arm = CONSOLE_KIT.BRACKET_ARM } = {}) {
  const corners = bracketCornersRect({ x: rect.x + 0.5, y: rect.y + 0.5, w: rect.w - 1, h: rect.h - 1 }, arm);
  if (!corners.length) return;
  ctx.save();
  ctx.strokeStyle = toneColor(roles, tone);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const c of corners) { const p = c.pts; ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); }
  ctx.stroke();
  ctx.restore();
}

/**
 * Głowica strefy bez nawiasów (lista, inspektor, pas — nawiasy narożne mają tylko bohater i zaznaczone elementy, poprawka
 * właściciela K0a): linia 1 px u góry w roli dim + etykieta WERSALIKAMI pod nią. Zwraca wysokość głowicy (treść poniżej).
 */
export function drawZoneRule(ctx, rect, label, roles, { tone = 'dim' } = {}) {
  ctx.save();
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  strokeLine(ctx, rect.x, rect.y + 0.5, rect.x + rect.w, rect.y + 0.5);
  let h = 1;
  if (label) {
    ctx.font = font(THEME.fontSizeSmall);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = toneColor(roles, tone);
    ctx.fillText(String(label).toUpperCase(), rect.x, rect.y + CONSOLE_KIT.EYEBROW_H - 4);
    h = CONSOLE_KIT.EYEBROW_H + 2;
  }
  ctx.restore();
  return h;
}

/** Nawiasy narożne wokół zaznaczonego elementu (wiersz listy, karta) — rola primary, małe ramię. */
export function drawSelectBrackets(ctx, rect, roles, { arm = CONSOLE_KIT.SELECT_ARM, tone = 'primary' } = {}) {
  drawZoneFrame(ctx, rect, roles, { tone, arm });
}

// ── Nagłówek ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Nagłówek konsoli: TYTUŁ wersalikami, czipy podzakładek „[ NAZWA ]” (aktywny — primary z podkreśleniem, reszta — dim),
 * „[ x ]” po prawej, linia 1 px pod pasmem. Zastępuje pasek subnav dla ekranów zestawu.
 * @param {{ title:string, chips?:Array<{id:string,label:string,active?:boolean}>, hoverId?:string|null }} p
 * @returns {Array<{type:'tab'|'close', id:string, x,y,w,h}>}
 */
export function drawConsoleHeader(ctx, zones, roles, { title, chips = [], hoverId = null } = {}) {
  const K = CONSOLE_KIT, hd = zones.header, tr = zones.title, cl = zones.close;
  const out = [];
  const cy = hd.y + hd.h / 2;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = font(THEME.fontSizeMedium, true);
  ctx.fillStyle = roles.primary;
  const t = String(title ?? '').toUpperCase();
  ctx.fillText(t, tr.x, cy);
  let x = tr.x + ctx.measureText(t).width + 18;
  ctx.font = font(THEME.fontSizeSmall);
  for (const c of chips ?? []) {
    const txt = chipLabel(c.label);
    const w = Math.ceil(ctx.measureText(txt).width) + 2 * K.CHIP_PAD_X;
    if (x + w > tr.x + tr.w) break;
    const r = { x, y: Math.round(cy - K.CHIP_H / 2), w, h: K.CHIP_H };
    if (hoverId === c.id && !c.active) { ctx.globalAlpha = K.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
    ctx.fillStyle = c.active ? roles.primary : roles.dim;
    ctx.fillText(txt, x + K.CHIP_PAD_X, cy);
    if (c.active) { ctx.strokeStyle = roles.primary; ctx.lineWidth = 1; strokeLine(ctx, r.x + K.CHIP_PAD_X, r.y + r.h - 0.5, r.x + r.w - K.CHIP_PAD_X, r.y + r.h - 0.5); }
    out.push({ type: 'tab', id: c.id, ...r });
    x += w + K.HEADER_CHIP_GAP;
  }
  // [ x ]
  ctx.font = font(THEME.fontSizeSmall);
  const ct = '[ x ]';
  if (hoverId === 'close') { ctx.globalAlpha = K.HOVER_ALPHA; ctx.fillStyle = roles.alert; ctx.fillRect(cl.x, cl.y + 4, cl.w, cl.h - 8); ctx.globalAlpha = 1; }
  ctx.fillStyle = hoverId === 'close' ? roles.alert : roles.dim;
  ctx.textAlign = 'center';
  ctx.fillText(ct, cl.x + cl.w / 2, cy);
  ctx.textAlign = 'left';
  out.push({ type: 'close', id: 'close', x: cl.x, y: cl.y, w: cl.w, h: cl.h });
  // linia pod pasmem
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  strokeLine(ctx, hd.x, hd.y + hd.h - 0.5, hd.x + hd.w, hd.y + hd.h - 0.5);
  ctx.restore();
  return out;
}

// ── Etykieta sekcji, klucz–wartość, pasek ────────────────────────────────────────────────────────────────────────────

/** Etykieta sekcji: małe WERSALIKI (dim) + prowadnica 1 px od końca tekstu do prawej krawędzi. Zwraca wysokość. */
export function drawEyebrow(ctx, x, y, w, text, roles, { tone = 'dim' } = {}) {
  const K = CONSOLE_KIT;
  ctx.save();
  ctx.font = font(THEME.fontSizeSmall);
  ctx.textBaseline = 'alphabetic';
  const t = String(text ?? '').toUpperCase();
  const base = y + K.EYEBROW_H - 6;
  ctx.fillStyle = toneColor(roles, tone);
  ctx.fillText(t, x, base);
  const tw = ctx.measureText(t).width;
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  if (x + tw + 6 < x + w) strokeLine(ctx, x + tw + 6, base + 2.5, x + w, base + 2.5);
  ctx.restore();
  return K.EYEBROW_H;
}

/** Wiersz klucz … wartość: klucz dim z lewej, wartość (kratka cyfr) z prawej w roli `tone`. Zwraca wysokość. */
export function drawKvRow(ctx, x, y, w, key, value, roles, { tone = 'primary', unit = '' } = {}) {
  const K = CONSOLE_KIT;
  ctx.save();
  ctx.font = font(THEME.fontSizeNormal);
  ctx.textBaseline = 'middle';
  const cy = y + K.KV_H / 2;
  let right = x + w;
  if (unit) {
    ctx.font = font(THEME.fontSizeSmall);
    ctx.fillStyle = roles.dim; ctx.textAlign = 'right';
    ctx.fillText(unit, right, cy);
    right -= ctx.measureText(unit).width + 4;
    ctx.textAlign = 'left';
    ctx.font = font(THEME.fontSizeNormal);
  }
  ctx.fillStyle = toneColor(roles, tone);
  const vw = drawTabular(ctx, value, right, cy, 'right');
  ctx.fillStyle = roles.dim;
  const kw = Math.max(0, right - vw - 8 - x);
  ctx.fillText(truncateText(String(key ?? ''), kw, (s) => ctx.measureText(s).width), x, cy);
  ctx.restore();
  return K.KV_H;
}

/** Pasek 2 px: tor (dim, krycie TRACK_ALPHA) + wypełnienie `frac` 0–1 w roli `tone`. */
export function drawBar(ctx, x, y, w, frac, roles, { tone = 'primary', h = CONSOLE_KIT.BAR_H } = {}) {
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  ctx.save();
  ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1; ctx.fillStyle = toneColor(roles, tone); ctx.fillRect(x, y, Math.round(w * f), h);
  ctx.restore();
}

// ── Instrument ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Duży instrument liczbowy (D-K-19): ETYKIETA (dim) nad dużą liczbą (token `fontSizeInstrument`, kratka cyfr) + jednostka +
 * zmiana w roli `deltaTone`. Zwraca `{ w, h }`.
 * @param {{ label:string, value:string|number, unit?:string, delta?:string, deltaTone?:string, tone?:string }} p
 */
export function drawInstrument(ctx, x, y, roles, { label, value, unit = '', delta = '', deltaTone = 'dim', tone = 'primary' } = {}) {
  const big = THEME.fontSizeInstrument ?? Math.round(2 * THEME.fontSizeLarge);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(THEME.fontSizeSmall);
  ctx.fillStyle = roles.dim;
  ctx.fillText(String(label ?? '').toUpperCase(), x, y + THEME.fontSizeSmall);
  const base = y + THEME.fontSizeSmall + 4 + big;
  ctx.font = font(big);
  ctx.fillStyle = toneColor(roles, tone);
  let w = drawTabular(ctx, value, x, base, 'left');
  if (unit) {
    ctx.font = font(THEME.fontSizeMedium);
    ctx.fillStyle = roles.dim;
    ctx.fillText(unit, x + w + 6, base);
    w += 6 + ctx.measureText(unit).width;
  }
  let h = base - y + 4;
  if (delta) {
    ctx.font = font(THEME.fontSizeSmall);
    ctx.fillStyle = toneColor(roles, deltaTone);
    drawTabular(ctx, delta, x, base + 4 + THEME.fontSizeSmall, 'left');
    h += 4 + THEME.fontSizeSmall;
  }
  ctx.restore();
  return { w, h };
}

// ── Czipy akcji ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Rząd czipów akcji „[ LABEL ]” (wiersze łamane przez `layoutButtonRows`). Stany: normal (primary), hover (wypełnienie
 * HOVER_ALPHA), disabled (dim, bez strefy), off (dim, przekreślony — strefa zostaje), danger (rola alert).
 * @param {Array<{id:string,label:string,state?:'normal'|'disabled'|'off'|'danger'}>} chips
 * @returns {{ zones:Array, h:number }}
 */
export function drawChipRow(ctx, x, y, maxW, chips, roles, { hoverId = null } = {}) {
  const K = CONSOLE_KIT;
  ctx.save();
  ctx.font = font(THEME.fontSizeSmall);
  ctx.textBaseline = 'middle';
  const widthOf = (c) => Math.ceil(ctx.measureText(chipLabel(c.label)).width) + 2 * K.CHIP_PAD_X;
  const rows = layoutButtonRows(chips ?? [], widthOf, maxW, K.CHIP_GAP);
  const byId = new Map((chips ?? []).map((c) => [c.id, c]));
  const zones = [];
  rows.forEach((row, ri) => {
    const ry = y + ri * (K.CHIP_H + K.CHIP_GAP);
    for (const cell of row) {
      const c = byId.get(cell.id);
      const st = c.state ?? 'normal';
      const r = { x: x + cell.x, y: ry, w: cell.w, h: K.CHIP_H };
      const col = st === 'danger' ? roles.alert : (st === 'disabled' || st === 'off') ? roles.dim : roles.primary;
      if (hoverId === c.id && st !== 'disabled') { ctx.globalAlpha = K.HOVER_ALPHA; ctx.fillStyle = col; ctx.fillRect(r.x, r.y, r.w, r.h); }
      ctx.globalAlpha = st === 'off' ? K.OFF_ALPHA : 1;
      ctx.fillStyle = col;
      const txt = chipLabel(c.label);
      ctx.fillText(txt, r.x + K.CHIP_PAD_X, r.y + r.h / 2);
      if (st === 'off') { ctx.strokeStyle = col; ctx.lineWidth = 1; strokeLine(ctx, r.x + K.CHIP_PAD_X, r.y + r.h / 2 + 0.5, r.x + r.w - K.CHIP_PAD_X, r.y + r.h / 2 + 0.5); }
      ctx.globalAlpha = 1;
      if (st !== 'disabled') zones.push({ type: 'chip', id: c.id, state: st, ...r });
    }
  });
  ctx.restore();
  return { zones, h: rows.length ? rows.length * (K.CHIP_H + K.CHIP_GAP) - K.CHIP_GAP : 0 };
}

/**
 * K2 — pojedynczy czip akcji „[ LABEL ]” na pełną szerokość `w` (inspektor): normal (primary) / danger (alert) / wyłączony (dim).
 * Zwraca prostokąt czipu — ekran sam dokłada strefę (dzisiejszy typ akcji albo strefę podpowiedzi wyłączonego czipu).
 * @param {{ label:string, enabled?:boolean, danger?:boolean, hover?:boolean }} c
 */
export function drawActionChip(ctx, x, y, w, roles, { label, enabled = true, danger = false, hover = false } = {}) {
  const K = CONSOLE_KIT;
  const r = { x, y, w, h: K.CHIP_H };
  const col = !enabled ? roles.dim : danger ? roles.alert : roles.primary;
  ctx.save();
  ctx.font = font(THEME.fontSizeSmall);
  ctx.textBaseline = 'middle';
  if (hover && enabled) { ctx.globalAlpha = K.HOVER_ALPHA; ctx.fillStyle = col; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
  ctx.fillStyle = col;
  ctx.fillText(truncateText(chipLabel(label), Math.max(0, w - 2 * K.CHIP_PAD_X), (s) => ctx.measureText(s).width), r.x + K.CHIP_PAD_X, r.y + r.h / 2);
  ctx.restore();
  return r;
}

/**
 * K2 — podpowiedź konsoli (np. powód wyłączonej akcji): tło motywu, ramka 1 px dim, tekst w roli `tone`; pod / nad kotwicą
 * `{x, y}` w klamrze prostokąta `frame` (ramy ekranu). Bez cienia poświaty.
 */
export function drawConsoleTooltip(ctx, tip, frame, roles, { tone = 'alert' } = {}) {
  if (!tip?.text) return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.font = font(THEME.fontSizeSmall);
  ctx.textBaseline = 'middle';
  const pad = 6, h = 20, w = Math.ceil(ctx.measureText(tip.text).width) + 2 * pad;
  const x = Math.max(frame.x, Math.min(tip.x, frame.x + frame.w - w));
  const y = tip.y + h > frame.y + frame.h ? tip.y - h - (tip.above ?? 22) : tip.y;
  ctx.globalAlpha = 0.94; ctx.fillStyle = THEME.bgPrimary; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = toneColor(roles, tone);
  ctx.fillText(tip.text, x + pad, y + h / 2);
  ctx.restore();
}

// ── Lista ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lista w prostokącie: wiersze `{id, label, value?, tone?}` i nagłówki grup `{group:true, label}`; zaznaczenie = podkreślenie
 * primary + nawias z lewej, hover = wypełnienie HOVER_ALPHA; przycięcie do prostokąta, przewijanie (klamra `clampScroll`) i
 * pasek 2 px (`scrollThumb`); strefy poza pasmem przycięte (`pruneZones`).
 * K0b: `rowH` — wysokość wiersza zamiast ROW_H (wiersze dwulinijkowe listy imperiów); `renderRow(ctx, row, rect, { sel, hov })`
 * — treść wiersza rysuje ekran (zestaw dalej rysuje hover, podkreślenie, nawiasy, strefy i przewijanie).
 * @returns {{ zones:Array<{type:'row',id,x,y,w,h}>, contentH:number, scroll:number }} `scroll` — po klamrze (ekran go zapisuje)
 */
export function drawList(ctx, rect, rows, roles, { selectedId = null, hoverId = null, scroll = 0, rowH = null, renderRow = null, underline = true } = {}) {
  const K = CONSOLE_KIT;
  const RH = Number.isFinite(rowH) && rowH > 0 ? rowH : K.ROW_H;
  let contentH = 0;
  for (const r of rows ?? []) contentH += r.group ? K.GROUP_H : RH;
  const sc = clampScroll(scroll, contentH, rect.h);
  const zones = [];
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.textBaseline = 'middle';
  const textW = rect.w - 2 * K.ROW_PAD_X - K.SCROLLBAR_W - 2;
  let y = rect.y - sc;
  for (const r of rows ?? []) {
    const h = r.group ? K.GROUP_H : RH;
    if (y + h >= rect.y && y <= rect.y + rect.h) {
      if (r.group) {
        drawEyebrow(ctx, rect.x + 2, y + 1, rect.w - K.SCROLLBAR_W - 6, r.label, roles);
      } else {
        const sel = r.id === selectedId, hov = r.id === hoverId;
        if (hov && !sel) { ctx.globalAlpha = K.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rect.x, y, rect.w - K.SCROLLBAR_W - 2, h); ctx.globalAlpha = 1; }
        if (renderRow) {
          ctx.save();
          renderRow(ctx, r, { x: rect.x, y, w: rect.w - K.SCROLLBAR_W - 2, h }, { sel, hov });
          ctx.restore();
        } else {
          const cy = y + h / 2;
          ctx.font = font(THEME.fontSizeNormal);
          let vw = 0;
          if (r.value != null && r.value !== '') {
            ctx.fillStyle = toneColor(roles, r.tone ?? (sel ? 'primary' : 'dim'));
            vw = drawTabular(ctx, r.value, rect.x + rect.w - K.SCROLLBAR_W - 2 - K.ROW_PAD_X, cy, 'right') + 8;
          }
          ctx.fillStyle = sel ? roles.primary : (r.dimmed ? roles.dim : roles.primary);
          ctx.globalAlpha = sel || hov ? 1 : 0.85;
          ctx.fillText(truncateText(String(r.label ?? ''), textW - vw, (s) => ctx.measureText(s).width), rect.x + K.ROW_PAD_X, cy);
          ctx.globalAlpha = 1;
        }
        if (sel) {
          ctx.strokeStyle = roles.primary; ctx.lineWidth = 1;
          // K1c-B — `underline: false`: same nawiasy wyboru (lista projektów Stoczni — uwaga właściciela D)
          if (underline) strokeLine(ctx, rect.x + K.ROW_PAD_X, y + h - 1.5, rect.x + rect.w - K.SCROLLBAR_W - 2 - K.ROW_PAD_X, y + h - 1.5);
          drawSelectBrackets(ctx, { x: rect.x, y, w: rect.w - K.SCROLLBAR_W - 2, h }, roles);
        }
        zones.push({ type: 'row', id: r.id, x: rect.x, y, w: rect.w - K.SCROLLBAR_W - 2, h });
      }
    }
    y += h;
  }
  ctx.restore();
  // pasek przewijania 2 px (poza przycięciem — rysowany w prostokącie)
  const th = scrollThumb(sc, contentH, rect.h, rect.y);
  if (th) {
    ctx.save();
    const sx = rect.x + rect.w - K.SCROLLBAR_W;
    ctx.globalAlpha = K.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(sx, rect.y, K.SCROLLBAR_W, rect.h);
    ctx.globalAlpha = 1; ctx.fillStyle = roles.primary; ctx.fillRect(sx, th.y, K.SCROLLBAR_W, th.h);
    ctx.restore();
  }
  pruneZones(zones, 0, rect.y, rect.y + rect.h);
  return { zones, contentH, scroll: sc };
}

/** Czysta: odsunięcie przewijania tak, by wiersz `id` był w pasie widoku (odsłoń zaznaczony). `rowH` — jak w `drawList`. */
export function revealScroll(rows, id, scroll, viewH, rowH = null) {
  const K = CONSOLE_KIT;
  const RH = Number.isFinite(rowH) && rowH > 0 ? rowH : K.ROW_H;
  let y = 0;
  for (const r of rows ?? []) {
    const h = r.group ? K.GROUP_H : RH;
    if (!r.group && r.id === id) {
      if (y < scroll) return y;
      if (y + h > scroll + viewH) return y + h - viewH;
      return scroll;
    }
    y += h;
  }
  return scroll;
}

// ── Pas: kolejka i osie czasu ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Czipy kolejki w pasie (od lewej, ile się zmieści): nazwa + podpis + pasek postępu w roli `tone`; nadmiar → „+N”.
 * @param {Array<{id:string,label:string,sub?:string,frac?:number,tone?:string}>} items
 * @returns {Array<{type:'queue',id,x,y,w,h}>}
 */
export function drawQueueChips(ctx, rect, items, roles, { hoverId = null } = {}) {
  const K = CONSOLE_KIT;
  const zones = [];
  const list = items ?? [];
  const h = Math.min(rect.h, 44);
  const w = K.QUEUE_CHIP_W;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  let x = rect.x;
  for (let i = 0; i < list.length; i++) {
    const rest = list.length - i;
    // ostatni czip musi się zmieścić sam; każdy wcześniejszy — razem z miejscem na „+N”
    const needMore = rest > 1 && x + w + K.CHIP_GAP + K.MORE_W > rect.x + rect.w;
    if (x + w > rect.x + rect.w || needMore) {
      ctx.font = font(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
      ctx.fillText(`+${rest}`, x + 2, rect.y + h / 2 + 4);
      break;
    }
    const it = list[i];
    const r = { x, y: rect.y, w, h };
    drawZoneFrame(ctx, r, roles, { tone: hoverId === it.id ? 'primary' : 'dim', arm: 5 });
    ctx.font = font(THEME.fontSizeNormal);
    ctx.fillStyle = toneColor(roles, it.tone ?? 'primary');
    ctx.fillText(truncateText(String(it.label ?? '').toUpperCase(), w - 12, (s) => ctx.measureText(s).width), x + 6, rect.y + 15);
    if (it.sub) { ctx.font = font(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; drawTabular(ctx, it.sub, x + 6, rect.y + 28, 'left'); }
    drawBar(ctx, x + 6, rect.y + h - 8, w - 12, it.frac ?? 0, roles, { tone: it.tone ?? 'primary' });
    zones.push({ type: 'queue', id: it.id, ...r });
    x += w + K.CHIP_GAP;
  }
  ctx.restore();
  return zones;
}

/**
 * Osie czasu w pasie: tor na wiersz (etykieta dim z lewej), odcinki `{t0, t1, tone, label}` w skali [t0, t1] okna, znacznik
 * „teraz” w roli primary.
 * @param {Array<{id:string,label:string,spans:Array<{t0:number,t1:number,tone?:string,label?:string}>}>} lanes
 * @param {{ t0:number, t1:number, now?:number }} win
 */
export function drawTimelineLanes(ctx, rect, lanes, roles, win) {
  const K = CONSOLE_KIT;
  const t0 = Number(win?.t0) || 0, t1 = Number(win?.t1) || 1;
  const span = Math.max(1e-9, t1 - t0);
  const ax = rect.x + K.LANE_LABEL_W, aw = Math.max(0, rect.w - K.LANE_LABEL_W);
  const X = (t) => ax + Math.max(0, Math.min(1, (t - t0) / span)) * aw;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.textBaseline = 'middle';
  let y = rect.y;
  for (const ln of lanes ?? []) {
    if (y + K.LANE_H > rect.y + rect.h) break;
    const cy = y + K.LANE_H / 2;
    ctx.font = font(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
    ctx.fillText(truncateText(String(ln.label ?? '').toUpperCase(), K.LANE_LABEL_W - 8, (s) => ctx.measureText(s).width), rect.x, cy);
    ctx.globalAlpha = K.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(ax, Math.round(cy), aw, 1); ctx.globalAlpha = 1;
    for (const sp of ln.spans ?? []) {
      const x0 = X(sp.t0), x1 = X(sp.t1);
      ctx.fillStyle = toneColor(roles, sp.tone ?? 'primary');
      ctx.fillRect(x0, Math.round(cy - K.SPAN_H / 2), Math.max(2, x1 - x0), K.SPAN_H);
      if (sp.label && x1 - x0 > 30) {
        ctx.font = font(THEME.fontSizeTiny ?? THEME.fontSizeSmall);
        ctx.fillStyle = THEME.bgPrimary;
        ctx.fillText(truncateText(String(sp.label).toUpperCase(), x1 - x0 - 6, (s) => ctx.measureText(s).width), x0 + 3, cy + 0.5);
      }
    }
    y += K.LANE_H;
  }
  if (Number.isFinite(win?.now)) {
    const nx = Math.round(X(win.now)) + 0.5;
    ctx.strokeStyle = roles.primary; ctx.lineWidth = 1;
    strokeLine(ctx, nx, rect.y, nx, y);
  }
  ctx.restore();
}

export { tabularWidth };
