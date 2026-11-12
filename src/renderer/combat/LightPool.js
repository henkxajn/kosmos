// LightPool — stała pula świateł punktowych efektów walki (ARC COMBAT VISUALS, krok CV-2b; plan §2.10, D-CV-18;
// flaga `cvPresets`). API dla CV-5 (światła wybuchów, błyski wylotów luf) — dziś bez stałego konsumenta w grze (instrument
// konsoli `KOSMOS.debug.cvLightFlash()`).
//
// Dlaczego pula, a nie światło na wybuch: Three.js r171 wkompilowuje LICZBĘ świateł w każdy program oświetlany —
// światło dodane w trakcie bitwy rekompilowałoby shader każdego statku i planety (przycięcie klatki). Pula powstaje RAZ
// (przy starcie renderera) z pojemnością największego presetu (4); preset mówi, ile z niej jest WIDOCZNYCH (High 4 /
// Medium 2 / Low 0) — światło niewidoczne nie wchodzi do programów, widoczne w spoczynku ma jasność 0 (wkład zerowy).
// Zmiana presetu zmienia liczbę widocznych = JEDNA rekompilacja (D-CV-18); w walce liczba nie zmienia się nigdy.
//
// Błysk: narost → podtrzymanie → wygaszenie na zegarze PREZENTACJI (pauza zatrzymuje, bez nadrabiania — reguła 4 §2.12).
// Brak wolnego światła — zabiera światło najbliższe końca (licznik `steals`); preset bez świateł — odmowa (`refused`).
// ⚠ THREE wstrzykiwany (pod node keeper buduje pulę na prawdziwym r171). Gorąca ścieżka (`flash`, `update`) bez `new`.

/** Pokrętła — na żywo (`KOSMOS.threeRenderer.cvTuning.LIGHT_*`, alias w `LIVE_CV_FX`); CV-5 stroi je pod wybuchy. */
export const LIVE_LIGHT_POOL = {
  LIGHT_INTENSITY: 0.02,   // jasność szczytowa (three r171: spadek 1 / max(d², 0,01) ⇒ przy statkach × 100)
  LIGHT_RANGE_WU:  0.2,    // [WU] zasięg światła (odcięcie; 1 L = długość fregaty = 0,016 WU)
  LIGHT_DECAY:     2,      // wykładnik spadku z odległością (fizycznie poprawny)
  LIGHT_ATTACK_MS: 40,     // [ms prezentacji] narost
  LIGHT_HOLD_MS:   60,     // [ms prezentacji] podtrzymanie
  LIGHT_FADE_MS:   500,    // [ms prezentacji] wygaszenie
};

export class CombatLightPool {
  /**
   * @param {{ THREE: object, parent?: object, capacity?: number, tuning?: object }} opts
   */
  constructor({ THREE, parent = null, capacity = 4, tuning = LIVE_LIGHT_POOL } = {}) {
    if (!THREE?.PointLight) throw new Error('[CombatLightPool] wymagany THREE (r171) z PointLight');
    this.tuning = tuning;
    this.capacity = Math.max(0, Math.floor(capacity));
    this.root = new THREE.Group();
    this.root.name = 'cvLightPool';
    if (parent) parent.add(this.root);
    this.lights = [];
    for (let i = 0; i < this.capacity; i++) {
      const L = new THREE.PointLight(0xffffff, 0, tuning.LIGHT_RANGE_WU, tuning.LIGHT_DECAY);
      L.name = 'cvPoolLight' + i;
      L.visible = false;          // do setCount — niewidoczne światło nie wchodzi do programów
      L.castShadow = false;
      this.root.add(L);
      this.lights.push(L);
    }
    const n = this.capacity;
    this.busy = new Uint8Array(n);
    this.t0 = new Float64Array(n);        // [ms prezentacji] początek błysku
    this.peak = new Float32Array(n);      // jasność szczytowa
    this.attack = new Float32Array(n);    // [ms]
    this.hold = new Float32Array(n);
    this.fade = new Float32Array(n);
    this.count = 0;
    this.nowMs = 0;
    this.acquired = 0;
    this.steals = 0;
    this.refused = 0;
    this.peakActive = 0;
  }

  /** Ile świateł puli jest widocznych (preset). Światła poza liczbą — zgaszone i zwolnione. */
  setCount(n) {
    const c = Math.max(0, Math.min(this.capacity, Math.floor(Number(n) || 0)));
    for (let i = 0; i < this.capacity; i++) {
      const L = this.lights[i];
      L.visible = i < c;
      if (i >= c) { this.busy[i] = 0; L.intensity = 0; }
    }
    this.count = c;
    return c;
  }

  /** Liczba świateł w trakcie błysku. */
  activeCount() {
    let a = 0;
    for (let i = 0; i < this.count; i++) a += this.busy[i];
    return a;
  }

  _endMs(i) { return this.t0[i] + this.attack[i] + this.hold[i] + this.fade[i]; }

  /**
   * Błysk w punkcie świata. Zwraca indeks światła albo −1 (preset bez świateł).
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} colorHex
   * @param {number} [nowMs] — czas prezentacji (domyślnie ostatni `update`)
   * @param {{ intensity?:number, range?:number, attackMs?:number, holdMs?:number, fadeMs?:number }} [opts]
   */
  flash(x, y, z, colorHex = 0xffd8a0, nowMs = this.nowMs, opts = null) {
    if (this.count === 0) { this.refused++; return -1; }
    const T = this.tuning;
    let slot = -1;
    for (let i = 0; i < this.count; i++) if (!this.busy[i]) { slot = i; break; }
    if (slot < 0) {
      let best = 0, bestEnd = this._endMs(0);
      for (let i = 1; i < this.count; i++) { const e = this._endMs(i); if (e < bestEnd) { bestEnd = e; best = i; } }
      slot = best;
      this.steals++;
    }
    const L = this.lights[slot];
    L.position.set(x, y, z);
    L.color.setHex(colorHex);
    L.distance = opts?.range ?? T.LIGHT_RANGE_WU;
    L.decay = T.LIGHT_DECAY;
    L.intensity = 0;
    this.busy[slot] = 1;
    this.t0[slot] = Number.isFinite(nowMs) ? nowMs : this.nowMs;
    this.peak[slot] = opts?.intensity ?? T.LIGHT_INTENSITY;
    this.attack[slot] = Math.max(0, opts?.attackMs ?? T.LIGHT_ATTACK_MS);
    this.hold[slot] = Math.max(0, opts?.holdMs ?? T.LIGHT_HOLD_MS);
    this.fade[slot] = Math.max(1, opts?.fadeMs ?? T.LIGHT_FADE_MS);
    this.acquired++;
    const a = this.activeCount();
    if (a > this.peakActive) this.peakActive = a;
    return slot;
  }

  /**
   * Raz na klatkę: obwiednia błysków na zegarze prezentacji. `visible: false` (tryb galaktyki) — jasność 0, błyski biegną dalej.
   * @param {number} nowMs
   * @param {{ visible?: boolean }} [opts]
   */
  update(nowMs, { visible = true } = {}) {
    if (Number.isFinite(nowMs)) this.nowMs = nowMs;
    const now = this.nowMs;
    for (let i = 0; i < this.count; i++) {
      if (!this.busy[i]) continue;
      const L = this.lights[i];
      const t = now - this.t0[i];
      const at = this.attack[i], ho = this.hold[i], fa = this.fade[i];
      let env;
      if (t < 0) env = 0;
      else if (t < at) env = at > 0 ? t / at : 1;
      else if (t < at + ho) env = 1;
      else if (t < at + ho + fa) env = 1 - (t - at - ho) / fa;
      else { this.busy[i] = 0; L.intensity = 0; continue; }
      L.intensity = visible ? this.peak[i] * env : 0;
    }
  }

  stats() {
    return { capacity: this.capacity, count: this.count, active: this.activeCount(), peakActive: this.peakActive,
      acquired: this.acquired, steals: this.steals, refused: this.refused };
  }

  dispose() {
    for (const L of this.lights) { L.dispose?.(); }
    this.root.parent?.remove(this.root);
  }
}
