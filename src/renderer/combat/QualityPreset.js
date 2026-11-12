// QualityPreset — wybór i stan presetu jakości grafiki walki (ARC COMBAT VISUALS, krok CV-2b; plan §2.10, D-CV-17;
// flaga `cvPresets`). Moduł CZYSTY (bez Three.js, bez `window` w ścieżkach logiki — magazyn i kontekst GL wstrzykiwane),
// wykonuje się pod node.
//
//   · wykrycie domyślnego poziomu z napisu renderera WebGL (`UNMASKED_RENDERER_WEBGL`): karta dedykowana → High,
//     zintegrowana → Medium, programowa / mobilna → Low; napis pusty albo nieznany → Medium;
//   · zapis NA MASZYNIE — localStorage `kosmos_gfx_quality`; każdy dostęp w try / catch (tryb prywatny, zablokowane dane
//     strony, wyjątek przy samym odczycie `localStorage`) — błąd = brak zapisu, gra działa dalej na wykrytym poziomie;
//   · ustawienia efektywne = preset z tabeli (`CombatFxPresets`) − poziomy dławienia;
//   · dławienie automatyczne (§2.10): czas klatki > 20 ms przez 2 s W WALCE ⇒ kolejny efekt drugorzędny w kolejności
//     dym → żar → odłamki → dym uszkodzeń; powrót z histerezą (czas klatki < 17 ms przez 5 s, w walce 10 s). Pojedyncza
//     długa klatka (kompilacja, GC) nie dławi; przerwa > 250 ms (karta w tle) nie jest próbką. STRZAŁÓW nie dotyka
//     z konstrukcji: lista dławienia ma wyłącznie efekty drugorzędne (`THROTTLE_ORDER`).

import { GFX_LEVELS, GFX_PRESETS, GFX_STORAGE_KEY, THROTTLE_ORDER, presetPixelRatio } from '../../data/CombatFxPresets.js';

/**
 * Poziom z dowolnego zapisu: 'low' | 'medium' | 'high' (wielkość liter bez znaczenia, także polskie nazwy z menu) albo
 * liczba 0 / 1 / 2 (Low / Medium / High — postać konsoli bez cudzysłowów). Inne — `null`.
 * @returns {'low'|'medium'|'high'|null}
 */
export function normalizeGfxLevel(v) {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < GFX_LEVELS.length) return GFX_LEVELS[v];
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (GFX_LEVELS.includes(s)) return s;
  if (s === 'niska') return 'low';
  if (s === 'średnia' || s === 'srednia') return 'medium';
  if (s === 'wysoka') return 'high';
  return null;
}

/** Następny poziom w cyklu ☰ „Grafika”: High → Medium → Low → High. */
export function nextGfxLevelInCycle(level) {
  const lv = normalizeGfxLevel(level) ?? 'high';
  return lv === 'high' ? 'medium' : lv === 'medium' ? 'low' : 'high';
}

// Napisy renderera (ANGLE w Chrome: „ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)”).
const RE_SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render|basic render driver|mesa offscreen/;
const RE_MOBILE   = /\bmali\b|adreno|powervr|\bsgx\b|videocore/;
const RE_DISCRETE = /nvidia|geforce|\brtx\b|\bgtx\b|quadro|radeon\s*(?:\(tm\)\s*)?(?:rx|pro|vii|r9|hd\s*[5-8]\d{3})|\brx\s*\d{3,4}|intel\(r\)\s*arc|\barc\s*a\d{3}|apple m\d+ (?:pro|max|ultra)/;
const RE_INTEGRATED = /intel|iris|\buhd\b|hd graphics|apple|radeon\s*(?:\(tm\)\s*)?graphics|vega\s*\d+\s*graphics/;

/**
 * Domyślny poziom z napisu renderera WebGL.
 * @param {string} rendererString
 * @returns {'low'|'medium'|'high'}
 */
export function detectGfxLevel(rendererString) {
  const s = String(rendererString ?? '').toLowerCase();
  if (!s.trim()) return 'medium';
  if (RE_SOFTWARE.test(s)) return 'low';
  if (RE_MOBILE.test(s)) return 'low';
  if (RE_DISCRETE.test(s)) return 'high';
  if (RE_INTEGRATED.test(s)) return 'medium';
  return 'medium';
}

/**
 * Napis renderera z kontekstu WebGL (rozszerzenie `WEBGL_debug_renderer_info`, zapas — `gl.RENDERER`). Błąd — ''.
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @returns {string}
 */
export function readRendererString(gl) {
  try {
    const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const unmasked = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    if (unmasked) return String(unmasked);
    const plain = gl?.getParameter?.(gl.RENDERER);
    return plain ? String(plain) : '';
  } catch {
    return '';
  }
}

/** Magazyn: wstrzyknięty albo `globalThis.localStorage` (sam odczyt właściwości może rzucić — stąd funkcja w try). */
function storageOf(storage) {
  if (storage !== undefined) return storage;
  return globalThis.localStorage;
}

/**
 * Zapisany poziom albo `null` (brak, śmieć, wyjątek magazynu).
 * @param {Storage} [storage]
 */
export function readStoredGfxLevel(storage) {
  try {
    return normalizeGfxLevel(storageOf(storage)?.getItem?.(GFX_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

/**
 * Zapisz poziom. `true` — zapisano; `false` — poziom niepoprawny albo magazyn rzucił (gra działa dalej).
 * @param {string|number} level
 * @param {Storage} [storage]
 */
export function writeStoredGfxLevel(level, storage) {
  const lv = normalizeGfxLevel(level);
  if (!lv) return false;
  try {
    const st = storageOf(storage);
    if (!st?.setItem) return false;
    st.setItem(GFX_STORAGE_KEY, lv);
    return true;
  } catch {
    return false;
  }
}

/**
 * Poziom na start: zapisany na tej maszynie, inaczej wykryty z napisu renderera.
 * @param {{ storage?: Storage, rendererString?: string }} opts
 * @returns {{ level: 'low'|'medium'|'high', source: 'stored'|'detected' }}
 */
export function initialGfxLevel({ storage, rendererString } = {}) {
  const stored = readStoredGfxLevel(storage);
  if (stored) return { level: stored, source: 'stored' };
  return { level: detectGfxLevel(rendererString), source: 'detected' };
}

/** Czy efekt drugorzędny `key` jest WŁĄCZONY w ustawieniach `s` (dla listy dławienia). */
export function secondaryOn(s, key) {
  if (!s) return false;
  if (key === 'debris') return (s.debris ?? 0) > 0;
  if (key === 'damageSmoke') return (s.damageSmoke ?? 'off') !== 'off';
  return s[key] === true;
}

/**
 * Ustawienia efektywne: preset z tabeli, potem `throttle` pierwszych pozycji `THROTTLE_ORDER` wyłączone.
 * @param {string|number} level
 * @param {{ dpr?: number, throttle?: number }} [opts]
 */
export function resolveGfxSettings(level, { dpr = 1, throttle = 0 } = {}) {
  const lv = normalizeGfxLevel(level) ?? 'high';
  const p = GFX_PRESETS[lv];
  const s = {
    level: lv, pixelRatio: presetPixelRatio(lv, dpr), aa: p.aa ?? 'none', bloom: p.bloom, particles: p.particles, lights: p.lights,
    debris: p.debris, smoke: p.smoke, embers: p.embers, damageSmoke: p.damageSmoke, shieldRipples: p.shieldRipples,
    textures: p.textures, throttle: 0, throttled: [],
  };
  const k = Math.max(0, Math.min(THROTTLE_ORDER.length, Math.floor(Number(throttle) || 0)));
  for (let i = 0; i < k; i++) {
    const key = THROTTLE_ORDER[i];
    if (!secondaryOn(s, key)) continue;   // w tym presecie i tak wyłączone — nic do zdjęcia
    if (key === 'debris') s.debris = 0;
    else if (key === 'damageSmoke') s.damageSmoke = 'off';
    else s[key] = false;
    s.throttled.push(key);
  }
  s.throttle = k;
  return s;
}

/**
 * Pokrętła dławienia — na żywo (`KOSMOS.threeRenderer.gfxThrottleTuning`): progi czasu klatki [ms] i czasy [s].
 * Wartości domyślne z §2.10 (20 ms / 2 s); powrót z histerezą.
 */
export const LIVE_GFX_THROTTLE = {
  HIGH_MS: 20,           // [ms] czas klatki (wygładzony), powyżej którego liczy się czas „za wolno”
  HOLD_S: 2,             // [s] tyle „za wolno” w walce ⇒ jeden poziom dławienia więcej
  LOW_MS: 17,            // [ms] poniżej tego liczy się czas „spokojnie” (pasmo 17–20 ms — bez zmiany, histereza)
  RESTORE_S: 5,          // [s] tyle „spokojnie” poza walką ⇒ jeden poziom mniej
  RESTORE_COMBAT_S: 10,  // [s] tyle „spokojnie” w walce ⇒ jeden poziom mniej (ostrożniej — mniej przełączeń w bitwie)
  EMA_S: 0.25,           // [s] stała czasowa wygładzenia czasu klatki
  GAP_MS: 250,           // [ms] odstęp klatki dłuższy niż to — przerwa rysowania (karta w tle), nie próbka
};

/**
 * Dławienie automatyczne — maszyna stanów. `step()` raz na klatkę (odstęp klatki w ms, czy trwa walka, preset bazowy).
 * Poziom 0 = bez dławienia; k = pierwsze k pozycji `THROTTLE_ORDER` wyłączone. Krok w górę pomija pozycje, które w presecie
 * bazowym i tak są wyłączone (Medium nie ma żaru — po dymie od razu odłamki); na Low nie ma czego dławić.
 */
export class QualityThrottle {
  constructor(tuning = LIVE_GFX_THROTTLE) {
    this.tuning = tuning;
    this.reset();
  }

  reset() {
    this.level = 0;
    this.ema = null;
    this.overS = 0;
    this.underS = 0;
    this.degrades = 0;
    this.restores = 0;
    this.samples = 0;
    this.gaps = 0;
  }

  /** Najbliższy wyższy poziom, który coś zdejmuje w presecie `base` (brak — bez zmiany). */
  _up(base) {
    for (let k = this.level + 1; k <= THROTTLE_ORDER.length; k++) {
      if (secondaryOn(base, THROTTLE_ORDER[k - 1])) return k;
    }
    return this.level;
  }

  /** Poziom kanoniczny ≤ k: ostatnia zdjęta pozycja jest w presecie włączona (albo 0) — te same poziomy w górę i w dół. */
  _canonical(base, k) {
    while (k > 0 && !secondaryOn(base, THROTTLE_ORDER[k - 1])) k--;
    return k;
  }

  /** Jeden efekt z powrotem: najwyższa zdjęta pozycja włączona w presecie (pozycje wyłączone w presecie zostają wyłączone). */
  _down(base) {
    for (let j = this.level - 1; j >= 0; j--) {
      if (secondaryOn(base, THROTTLE_ORDER[j])) return this._canonical(base, j);
    }
    return 0;
  }

  /**
   * @param {number} dtMs — odstęp tej klatki od poprzedniej [ms]
   * @param {{ inCombat?: boolean, base?: object }} ctx — `base` = ustawienia presetu BEZ dławienia (`resolveGfxSettings`)
   * @returns {boolean} czy poziom się zmienił
   */
  step(dtMs, { inCombat = false, base = null } = {}) {
    const T = this.tuning;
    if (!(dtMs > 0)) return false;
    if (dtMs > T.GAP_MS) { this.gaps++; return false; }
    this.samples++;
    const dt = dtMs / 1000;
    const a = 1 - Math.exp(-dt / Math.max(1e-3, T.EMA_S));
    this.ema = this.ema == null ? dtMs : this.ema + (dtMs - this.ema) * a;
    let changed = false;
    if (inCombat && this.ema > T.HIGH_MS) {
      this.overS += dt;
      if (this.overS >= T.HOLD_S) {
        const nx = this._up(base);
        if (nx > this.level) { this.level = nx; this.degrades++; changed = true; }
        this.overS = 0;
      }
    } else {
      this.overS = 0;
    }
    if (this.ema < T.LOW_MS) {
      this.underS += dt;
      const need = inCombat ? T.RESTORE_COMBAT_S : T.RESTORE_S;
      if (this.underS >= need && this.level > 0) {
        this.level = this._down(base);
        this.restores++;
        changed = true;
        this.underS = 0;
      }
    } else {
      this.underS = 0;
    }
    return changed;
  }

  stats() {
    return {
      level: this.level, dropped: THROTTLE_ORDER.slice(0, this.level), emaMs: this.ema == null ? null : Number(this.ema.toFixed(2)),
      degrades: this.degrades, restores: this.restores, samples: this.samples, gaps: this.gaps,
    };
  }
}
