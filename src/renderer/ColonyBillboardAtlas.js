// ColonyBillboardAtlas — atlas portretów budynków dla billboardów kuli kolonii (ARC COLONY SPHERE, krok CS-9; plan §3.18).
//
// • Wsad: każdy portret (id × stan) trafia RAZ do stron atlasu — jedna strona-płótno na poziom mip (512 / 256 / 128 / 64 /
//   32 px). Klatka rysuje wszystkie budynki z tych samych kilku płócien (`drawImage` z podprostokąta), więc rasteryzator
//   składa je w jeden wsad zamiast przełączać źródło co budynek; stany (odbarwienie budowy, czerwień uszkodzenia) są
//   wypalone w atlasie — w klatce nie ma filtrów ani kompozycji per budynek.
// • Mipmapy: poziom najwyższy = bok źródła zaokrąglony w górę do 128 / 256 / 512 (większe źródło → 512); niższe poziomy
//   powstają przez kolejne połowienie. Klatka bierze najmniejszy poziom ≥ rozmiar na ekranie (× DPR) — pomniejszenie
//   nigdy nie przekracza 2×, więc mały portret nie migocze, a duży (256 / 512) jest ostry w zbliżeniu.
// • Brak pliku PNG → znak kategorii (te same łamane co gniazdo portretu konsoli Kolonii) na ciemnej tabliczce.
// • Nowa grafika = wrzucenie pliku `assets/buildings/{id}.png` (kwadrat ≥ 128 px). Klucz atlasu niesie tożsamość obrazu,
//   więc portret doładowany po pierwszej klatce zastępuje znak kategorii bez żadnego kodu.
//
// Płótno wstrzykiwane (`createCanvas`) — keeper wykonuje klasę pod node na atrapie.

import { BILLBOARD, BILLBOARD_STATE, topMipFor, mipFor, categoryCss } from './ColonyBillboardLogic.js';
import { categoryGlyphOf } from '../ui/ColonyConsoleLogic.js';

const PAGE_PX = 1024;       // bok strony atlasu (poziom 512 dostaje stronę 2 × 2 komórki — patrz `_slot`)
const PAD = 1;              // margines komórki [px] — sąsiednie portrety nie przeciekają przy filtrowaniu
const GLYPH_TOP = 128;      // poziom najwyższy znaku kategorii

function defaultCreateCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Bok obrazu źródłowego [px] (HTMLImageElement / płótno / atrapa). */
export function nativeSizeOf(img) {
  return Math.max(Number(img?.naturalWidth) || 0, Number(img?.naturalHeight) || 0, Number(img?.width) || 0, Number(img?.height) || 0);
}

/** Portret w stanie `state` na płótnie `s × s` (czyste operacje Canvas 2D; odbarwienie i czerwień ograniczone do krycia grafiki). */
export function paintPortrait(ctx, s, img, state) {
  ctx.clearRect(0, 0, s, s);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(img, 0, 0, s, s);
  if (state === BILLBOARD_STATE.CONSTRUCTION) {
    ctx.globalCompositeOperation = 'saturation';       // nasycenie źródła (szarość = 0) na tle → portret w skali szarości
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'destination-in';   // przywróć krycie grafiki (tryb mieszania zamalował też tło)
    ctx.drawImage(img, 0, 0, s, s);
    ctx.globalCompositeOperation = 'source-atop';      // chłodny ton „projektu"
    ctx.fillStyle = 'rgba(110,150,200,0.20)';
    ctx.fillRect(0, 0, s, s);
  } else if (state === BILLBOARD_STATE.DAMAGED) {
    ctx.globalCompositeOperation = 'source-atop';      // czerwień tylko tam, gdzie jest grafika
    ctx.fillStyle = 'rgba(214,38,26,0.48)';
    ctx.fillRect(0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Znak kategorii (brak PNG): ciemna tabliczka z obrysem w barwie kategorii, stojąca na linii gruntu jak portret. */
export function paintGlyph(ctx, s, category, state, T = BILLBOARD) {
  ctx.clearRect(0, 0, s, s);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const side = s * 0.60, x = (s - side) / 2, y = s * T.groundY - side - s * 0.02;
  const col = state === BILLBOARD_STATE.DAMAGED ? '#ff4a38' : (state === BILLBOARD_STATE.CONSTRUCTION ? '#9aa6b4' : categoryCss(category));
  const r = side * 0.16;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + side - r, y); ctx.quadraticCurveTo(x + side, y, x + side, y + r);
  ctx.lineTo(x + side, y + side - r); ctx.quadraticCurveTo(x + side, y + side, x + side - r, y + side);
  ctx.lineTo(x + r, y + side); ctx.quadraticCurveTo(x, y + side, x, y + side - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(10,14,20,0.86)';
  ctx.fill();
  ctx.lineWidth = Math.max(1, s / 40); ctx.strokeStyle = col; ctx.stroke();
  ctx.lineWidth = Math.max(1, s / 24); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const pad = side * 0.16, g = side - 2 * pad;
  ctx.beginPath();
  for (const line of categoryGlyphOf(category)) {
    line.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(x + pad + px * g, y + pad + py * g); else ctx.lineTo(x + pad + px * g, y + pad + py * g); });
  }
  ctx.stroke();
  // nóżka tabliczki do linii gruntu
  ctx.beginPath(); ctx.moveTo(s / 2, y + side); ctx.lineTo(s / 2, s * T.groundY); ctx.stroke();
}

/** Miękki cień pod budynkiem (elipsa rysowana ze spłaszczonego koła). */
export function paintShadow(ctx, s) {
  ctx.clearRect(0, 0, s, s);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient?.(s / 2, s / 2, 0, s / 2, s / 2, s / 2) ?? null;
  if (g) {
    g.addColorStop(0, 'rgba(0,0,0,0.92)'); g.addColorStop(0.55, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  } else {   // kontekst bez gradientów: płaski krążek
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); ctx.fill();
  }
}

export class ColonyBillboardAtlas {
  /** @param {{createCanvas?:(w:number,h:number)=>object, tuning?:object}} [o] */
  constructor(o = {}) {
    this._mk = o.createCanvas ?? defaultCreateCanvas;
    this._T = o.tuning ?? BILLBOARD;
    this._pages = new Map();     // poziom → [{ canvas, ctx, used, cols }]
    this._sprites = new Map();   // klucz → { top, levels: Map<poziom, {canvas, sx, sy, s}> }
    this._imgIds = new WeakMap(); this._imgSeq = 0;
    this._scratch = new Map();   // bok → { canvas, ctx }
    this.builds = 0;
    this.errors = 0;             // nieudane wpisy (obraz nie do narysowania…) — klatka rysuje wtedy bez portretu, nie rzuca
  }

  _imgId(img) {
    if (!img || typeof img !== 'object') return 0;
    let id = this._imgIds.get(img);
    if (!id) { id = ++this._imgSeq; this._imgIds.set(img, id); }
    return id;
  }

  _scratchOf(s) {
    let e = this._scratch.get(s);
    if (!e) { const canvas = this._mk(s, s); e = { canvas, ctx: canvas.getContext('2d') }; this._scratch.set(s, e); }
    return e;
  }

  _slot(level) {
    const cell = level + 2 * PAD;
    const side = Math.max(PAGE_PX, cell * 2);          // poziom 512 → strona 1028 (2 × 2 komórki)
    const cols = Math.floor(side / cell);
    let pages = this._pages.get(level);
    if (!pages) { pages = []; this._pages.set(level, pages); }
    let pg = pages[pages.length - 1];
    if (!pg || pg.used >= cols * cols) {
      const canvas = this._mk(cols * cell, cols * cell);
      pg = { canvas, ctx: canvas.getContext('2d'), used: 0, cols };
      pages.push(pg);
    }
    const k = pg.used++;
    return { canvas: pg.canvas, ctx: pg.ctx, sx: (k % cols) * cell + PAD, sy: Math.floor(k / cols) * cell + PAD, s: level };
  }

  /** Zbuduj łańcuch mip wpisu: `paint(ctx, s)` rysuje poziom najwyższy, niższe = kolejne połowienie. */
  _build(key, top, paint) {
    const levels = new Map();
    const mips = [...this._T.mips].filter(s => s <= top).sort((a, b) => b - a);
    let prev = null;
    for (const s of mips) {
      const sc = this._scratchOf(s);
      if (!prev) paint(sc.ctx, s);
      else {
        sc.ctx.globalCompositeOperation = 'source-over'; sc.ctx.globalAlpha = 1;
        sc.ctx.clearRect(0, 0, s, s);
        sc.ctx.imageSmoothingEnabled = true; sc.ctx.imageSmoothingQuality = 'high';
        sc.ctx.drawImage(prev.canvas, 0, 0, prev.s, prev.s, 0, 0, s, s);
      }
      const slot = this._slot(s);
      slot.ctx.clearRect(slot.sx - PAD, slot.sy - PAD, s + 2 * PAD, s + 2 * PAD);
      slot.ctx.drawImage(sc.canvas, 0, 0, s, s, slot.sx, slot.sy, s, s);
      levels.set(s, { canvas: slot.canvas, sx: slot.sx, sy: slot.sy, s });
      prev = { canvas: sc.canvas, s };
    }
    const e = { top, levels };
    this._sprites.set(key, e);
    this.builds++;
    return e;
  }

  /**
   * Portret budynku w stanie `state` dla rozmiaru `devicePx` (piksele urządzenia). `img` = obraz PNG albo null → znak
   * kategorii. Zwraca podprostokąt strony atlasu `{ canvas, sx, sy, s }`.
   */
  portrait(id, state, category, img, devicePx) {
    const st = state === BILLBOARD_STATE.UPGRADE ? BILLBOARD_STATE.BUILT : state;   // rozbudowa: zwykły portret + pierścień
    const ok = !!img && nativeSizeOf(img) > 0;
    const key = ok ? `p|${id}|${st}|${this._imgId(img)}` : `g|${category}|${st}`;
    let e = this._sprites.get(key);
    if (e === undefined) {
      try {
        e = ok ? this._build(key, topMipFor(nativeSizeOf(img), this._T), (ctx, s) => paintPortrait(ctx, s, img, st))
          : this._build(key, GLYPH_TOP, (ctx, s) => paintGlyph(ctx, s, category, st, this._T));
      } catch (err) { e = null; this._sprites.set(key, null); this.errors++; }
    }
    return e ? (e.levels.get(mipFor(devicePx, e.top, this._T)) ?? null) : null;
  }

  /** Cień pod budynkiem (jeden wpis, poziom 64). */
  shadow() {
    let e = this._sprites.get('fx|shadow');
    if (e === undefined) {
      try { e = this._build('fx|shadow', 64, (ctx, s) => paintShadow(ctx, s)); }
      catch (err) { e = null; this._sprites.set('fx|shadow', null); this.errors++; }
    }
    return e ? (e.levels.get(64) ?? null) : null;
  }

  stats() {
    let pages = 0;
    for (const list of this._pages.values()) pages += list.length;
    return { sprites: this._sprites.size, pages, builds: this.builds, errors: this.errors, levels: [...this._pages.keys()].sort((a, b) => a - b) };
  }

  clear() { this._pages.clear(); this._sprites.clear(); this._scratch.clear(); }
}

export default ColonyBillboardAtlas;
