// CombatCueBus — sygnały dźwiękowe walki w czasie PREZENTACJI (ARC COMBAT VISUALS, krok CV-2b; plan §2.9, F8, D-CV-19;
// flaga `cvPresets`). Renderer planuje sygnał w chwili, w której efekt pojawi się na ekranie (strzał — po rozrzucie salwy,
// trafienie — po opóźnieniu błysku, wybuch wraku — od razu), a `flush()` raz na klatkę wysyła sygnały, których czas nadszedł,
// jako `combatfx:cue` (EventBus — wysyła wołający). Słuchacz: `AudioSystem._onCombatCue` (dziś bez dźwięków — tabela
// `CombatCueData` pusta).
//
// Kształt sygnału: `{ kind, weapon, size, count, pos: {x, y, z}, pan, dist, encounterId, vesselId, t }` — `kind` ∈ fire /
// impact / shieldHit / explosion / destroyed, `weapon` ∈ laser / kinetic / missile (rodzaje strzałów), `size` ∈ small /
// medium / large, `pos` — pozycja RYSOWANA (scena bitwy), `pan` ∈ [−1, 1] z położenia na ekranie, `dist` — odległość od
// kamery [WU], `count` — ile sygnałów scalono, `t` — czas prezentacji [ms].
//
// Dławienie (§2.9): ten sam rodzaj + broń (albo rozmiar) najwyżej raz na 30 ms — reszta scalana w `count` następnego
// sygnału; najwyżej 12 sygnałów na klatkę (nadmiar czeka do następnej, kolejność: zniszczenie, wybuch, trafienie, osłona,
// strzał). Pauza zatrzymuje wszystko (zegar prezentacji stoi). Efekty ukryte (tryb galaktyki) — sygnały, których czas
// nadszedł, przepadają (`muted`), żeby po powrocie nie wybuchła ich lawina.
// ⚠ Zero obiektów THREE i zero tablic typowanych po konstrukcji; pozycja rysowana i rzut na ekran — funkcje wstrzyknięte.

import { CUE_KINDS, CUE_WEAPON_KINDS, CUE_WEAPONS, CUE_SIZES } from '../../data/CombatCueData.js';

/** Pokrętła — na żywo (`KOSMOS.threeRenderer.cvTuning.CUE_*`, alias w `LIVE_CV_FX`). */
export const LIVE_CUE = {
  CUE_MAX_PER_FRAME: 12,   // najwyżej tyle sygnałów na klatkę
  CUE_COALESCE_MS:   30,   // [ms prezentacji] ten sam rodzaj + broń / rozmiar najwyżej raz na tyle — reszta w `count`
};

/** Pojemność kolejki zaplanowanych sygnałów (najgorsza runda 10 na 10: 100 strzałów + 100 trafień, z zapasem). */
export const CUE_QUEUE_CAPACITY = 1024;

/** Kategoria modułu broni → broń sygnału (nieznana — kinetyk). */
export const CUE_WEAPON_OF_CATEGORY = Object.freeze({ short: 'laser', medium: 'kinetic', long: 'missile' });
export function cueWeaponOfCategory(category) { return CUE_WEAPON_OF_CATEGORY[category] ?? 'kinetic'; }

/** Klasa modelu (`vesselSizeClass`: frigate / destroyer / battleship albo small_* / medium_* / large_*) → rozmiar sygnału. */
export function cueSizeOfClass(sizeClass) {
  const s = String(sizeClass ?? '');
  if (s === 'frigate' || s.startsWith('small')) return 'small';
  if (s === 'battleship' || s.startsWith('large')) return 'large';
  return 'medium';
}

/**
 * Panorama z pozycji w przestrzeni KAMERY: x / (|z| · tan(połowy kąta poziomego)), przycięte do [−1, 1]. Punkt za kamerą —
 * znak z x (lewo / prawo), bez odwrócenia.
 */
export function screenPan(viewX, viewZ, tanHalfHFov) {
  const den = Math.max(1e-6, Math.abs(viewZ)) * Math.max(1e-6, tanHalfHFov);
  const p = viewX / den;
  return p < -1 ? -1 : p > 1 ? 1 : (Number.isFinite(p) ? p : 0);
}

// Indeks klucza (rodzaj × broń / rozmiar) — liczba 0…14, bez sklejania napisów w gorącej ścieżce.
const KIND_INDEX = Object.freeze(Object.fromEntries(CUE_KINDS.map((k, i) => [k, i])));
const SUB_COUNT = 3;
const EMIT_ORDER = Object.freeze(['destroyed', 'explosion', 'impact', 'shieldHit', 'fire'].map((k) => KIND_INDEX[k]));

export function cueKeyIndex(kind, weapon, size) {
  const ki = KIND_INDEX[kind];
  if (ki === undefined) return -1;
  const weaponKind = CUE_WEAPON_KINDS.includes(kind);
  const list = weaponKind ? CUE_WEAPONS : CUE_SIZES;
  let si = list.indexOf(weaponKind ? weapon : size);
  if (si < 0) si = 1;   // nieznana broń — kinetyk, nieznany rozmiar — średni
  return ki * SUB_COUNT + si;
}

export class CombatCueBus {
  constructor({ capacity = CUE_QUEUE_CAPACITY, tuning = LIVE_CUE } = {}) {
    this.tuning = tuning;
    this.capacity = Math.max(1, Math.floor(capacity));
    const n = this.capacity;
    this.at = new Float64Array(n);
    this.key = new Int16Array(n);
    this.size = new Array(n).fill(null);
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.pz = new Float64Array(n);
    this.enc = new Array(n).fill(null);
    this.vid = new Array(n).fill(null);
    this.n = 0;
    // Akumulatory per klucz — zbudowane RAZ.
    this.acc = [];
    for (let k = 0; k < CUE_KINDS.length * SUB_COUNT; k++) {
      const kind = CUE_KINDS[Math.floor(k / SUB_COUNT)];
      const weaponKind = CUE_WEAPON_KINDS.includes(kind);
      const sub = (weaponKind ? CUE_WEAPONS : CUE_SIZES)[k % SUB_COUNT];
      this.acc.push({ kind, weapon: weaponKind ? sub : null, size: weaponKind ? null : sub, count: 0, lastEmit: -Infinity,
        x: 0, y: 0, z: 0, enc: null, vid: null, sizeOfShip: null });
    }
    this._proj = { pan: 0, dist: 0 };
    this.scheduled = 0;
    this.emitted = 0;
    this.merged = 0;
    this.dropped = 0;
    this.muted = 0;
    this.deferred = 0;
    this.byKind = Object.fromEntries(CUE_KINDS.map((k) => [k, 0]));
  }

  /**
   * Zaplanuj sygnał na chwilę `atMs` (czas prezentacji). Pełna kolejka — przepada NAJSTARSZY zaplanowany (`dropped`).
   * @returns {boolean}
   */
  schedule(atMs, kind, weapon, size, x, y, z, encounterId = null, vesselId = null) {
    const key = cueKeyIndex(kind, weapon, size);
    if (key < 0) return false;
    let i;
    if (this.n < this.capacity) i = this.n++;
    else {
      i = 0;
      for (let j = 1; j < this.n; j++) if (this.at[j] < this.at[i]) i = j;
      this.dropped++;
    }
    this.at[i] = Number.isFinite(atMs) ? atMs : 0;
    this.key[i] = key;
    this.size[i] = size ?? null;
    this.px[i] = Number.isFinite(x) ? x : 0;
    this.py[i] = Number.isFinite(y) ? y : 0;
    this.pz[i] = Number.isFinite(z) ? z : 0;
    this.enc[i] = encounterId ?? null;
    this.vid[i] = vesselId ?? null;
    this.scheduled++;
    return true;
  }

  /** Zaplanowane + czekające w akumulatorach. */
  pending() {
    let c = this.n;
    for (let k = 0; k < this.acc.length; k++) c += this.acc[k].count;
    return c;
  }

  _remove(i) {
    const last = this.n - 1;
    if (i !== last) {
      this.at[i] = this.at[last]; this.key[i] = this.key[last]; this.size[i] = this.size[last];
      this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
      this.enc[i] = this.enc[last]; this.vid[i] = this.vid[last];
    }
    this.size[last] = null; this.enc[last] = null; this.vid[last] = null;
    this.n = last;
  }

  /**
   * Raz na klatkę: sygnały, których czas nadszedł, do akumulatorów; z akumulatorów — do `emit` (najwyżej `CUE_MAX_PER_FRAME`,
   * każdy klucz najwyżej raz na `CUE_COALESCE_MS`).
   * @param {number} nowMs — czas prezentacji
   * @param {(cue:object)=>void} emit
   * @param {{ visible?: boolean, resolvePos?: (vesselId:string)=>({x:number,y:number,z:number}|null),
   *           project?: (x:number, y:number, z:number, out:{pan:number, dist:number})=>void }} [opts]
   * @returns {number} wysłane w tej klatce
   */
  flush(nowMs, emit, { visible = true, resolvePos = null, project = null } = {}) {
    const now = Number.isFinite(nowMs) ? nowMs : 0;
    for (let i = this.n - 1; i >= 0; i--) {
      if (this.at[i] > now) continue;
      if (!visible) { this.muted++; this._remove(i); continue; }
      const a = this.acc[this.key[i]];
      if (a.count > 0) this.merged++;
      a.count++;
      a.x = this.px[i]; a.y = this.py[i]; a.z = this.pz[i];
      a.enc = this.enc[i]; a.vid = this.vid[i]; a.sizeOfShip = this.size[i];
      this._remove(i);
    }
    if (!visible) {
      for (let k = 0; k < this.acc.length; k++) { this.muted += this.acc[k].count; this.acc[k].count = 0; }
      return 0;
    }
    const T = this.tuning;
    const maxPerFrame = Math.max(0, Math.floor(T.CUE_MAX_PER_FRAME ?? 12));
    const coalesce = Math.max(0, T.CUE_COALESCE_MS ?? 30);
    let sent = 0;
    for (let o = 0; o < EMIT_ORDER.length; o++) {
      const base = EMIT_ORDER[o] * SUB_COUNT;
      for (let s = 0; s < SUB_COUNT; s++) {
        const a = this.acc[base + s];
        if (a.count === 0 || now - a.lastEmit < coalesce) continue;
        if (sent >= maxPerFrame) { this.deferred++; continue; }
        let x = a.x, y = a.y, z = a.z;
        if (resolvePos && a.vid != null) { const p = resolvePos(a.vid); if (p) { x = p.x; y = p.y; z = p.z; } }
        const pr = this._proj;
        pr.pan = 0; pr.dist = 0;
        if (project) project(x, y, z, pr);
        const cue = { kind: a.kind, weapon: a.weapon, size: a.size ?? a.sizeOfShip ?? null, count: a.count,
          pos: { x, y, z }, pan: pr.pan, dist: pr.dist, encounterId: a.enc, vesselId: a.vid, t: now };
        this.byKind[a.kind] += a.count;
        a.count = 0;
        a.lastEmit = now;
        sent++;
        this.emitted++;
        emit(cue);
      }
    }
    return sent;
  }

  clear() {
    for (let i = 0; i < this.n; i++) { this.size[i] = null; this.enc[i] = null; this.vid[i] = null; }
    this.n = 0;
    for (const a of this.acc) { a.count = 0; a.lastEmit = -Infinity; a.enc = null; a.vid = null; }
  }

  stats() {
    return { queued: this.n, pending: this.pending(), scheduled: this.scheduled, emitted: this.emitted, merged: this.merged,
      dropped: this.dropped, muted: this.muted, deferred: this.deferred, byKind: { ...this.byKind } };
  }
}
