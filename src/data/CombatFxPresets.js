// CombatFxPresets — presety jakości grafiki walki High / Medium / Low (ARC COMBAT VISUALS, krok CV-2b; plan §2.10,
// D-CV-17, D-CV-18; flaga `cvPresets`). JEDYNE miejsce liczb tabeli §2.10 — logika (wykrycie, zapis, dławienie) mieszka
// w `src/renderer/combat/QualityPreset.js`, pula świateł w `LightPool.js`.
//
// Co preset zmienia DZIŚ (CV-2b): gęstość pikseli renderera (ostrość), bloom, liczbę świateł puli (D-CV-18 — stała pula,
// w spoczynku jasność 0, zmiana presetu = jedna rekompilacja), tekstury statków 2K / 1K (`<slot>@1k.glb` od normalizatora
// CV-1b; sloty bez wariantu 1K zostają przy 2K). Budżety cząstek, odłamków, dymu, żaru, dymu uszkodzeń i fal osłony to
// liczby dla kroków, które te efekty dodadzą (CV-4b, CV-5) — dziś nikt ich nie zużywa.
// ⚠ Strzałów preset NIE dotyka (§2.10: „shots are never dropped”) — pule wiązek, smug i iskier trafień `FxEngine` mają
//   stałą pojemność niezależną od presetu i od dławienia; degradują wyłącznie efekty drugorzędne.
//
// ARC CV-5 (pozycja 0 — Finding 704, decyzja właściciela 41; reguła „wyższy preset nigdy nie wygląda gorzej od niższego”):
//   · High rysuje w rozdzielczości NATYWNEJ + SMAA (bez nadpróbkowania 1,5× i dwuliniowego zmniejszenia kanwy przez przeglądarkę,
//     które zmiękczało detal przy DPR ≥ 1,25), Medium — natywnie bez wygładzania, Low — min(1,0, natywna) (Finding 703);
//   · bloom liczony w pikselach CSS × gęstość Medium (`bloomInputSize`), niezależnie od gęstości presetu — przy nadpróbkowaniu
//     High poświata była 1,2–1,4 × węższa i do 30 % słabsza niż na Medium (mipy `UnrealBloomPass` szły za buforem rysowania).
//   CV-5 zużywa też budżety efektów drugorzędnych (odłamki, dym, żar, dym uszkodzeń, cząstki) — `ExplosionLogic.js`.
// ARC CV-4b (flaga `cvShields`): `shieldRipples` — fale na bańkę osłony (High 8 / Medium 4 / Low 1; `ShieldLogic.allocRipple`),
//   `scorch` — osmalenia kadłuba w punktach trafień (wyłącznie High, §2.4; `ShieldLogic.scorchEnabled`). Bez dławienia (koszt pomijalny).

/** Poziomy rosnąco — kolejność jest kontraktem (keeper: każdy budżet Low ≤ Medium ≤ High). */
export const GFX_LEVELS = Object.freeze(['low', 'medium', 'high']);

/** Klucz localStorage (preset NA MASZYNIE, nie w zapisie gry — D-CV-17). */
export const GFX_STORAGE_KEY = 'kosmos_gfx_quality';

/** Dym uszkodzeń: rosnąco (off < fire — tylko płonące < on). */
export const DAMAGE_SMOKE_ORDER = Object.freeze(['off', 'fire', 'on']);
/** Tekstury statków: rosnąco. */
export const TEXTURE_ORDER = Object.freeze(['1k', '2k']);
/** Wygładzanie krawędzi: rosnąco (ARC CV-5, decyzja 41 — SMAA wyłącznie na High). */
export const AA_ORDER = Object.freeze(['none', 'smaa']);

/**
 * Tabela §2.10. `pixelRatio` — reguła (gęstość = min(dpr × dprMul, cap) albo stała `fixed`). `notAbove` — poziom, od którego
 * gęstość nie może być większa (Finding 703: Low = min(1,0, Medium) — przy DPR < 1 stała 1,0 dawała Low OSTRZEJSZY od Medium,
 * który rysuje natywnie). ARC CV-5 (decyzja 41): High = natywna (dawniej `min(dpr × 1,5, 2)` — nadpróbkowanie) + `aa: 'smaa'`.
 */
export const GFX_PRESETS = Object.freeze({
  high: Object.freeze({
    pixelRatio: Object.freeze({ dprMul: 1.0, cap: 2 }), aa: 'smaa', bloom: true, particles: 16000, lights: 4, debris: 24,
    smoke: true, embers: true, damageSmoke: 'on', shieldRipples: 8, scorch: true, textures: '2k',
  }),
  medium: Object.freeze({
    pixelRatio: Object.freeze({ dprMul: 1.0, cap: 1.5 }), aa: 'none', bloom: true, particles: 6000, lights: 2, debris: 12,
    smoke: true, embers: false, damageSmoke: 'fire', shieldRipples: 4, scorch: false, textures: '1k',
  }),
  low: Object.freeze({
    pixelRatio: Object.freeze({ fixed: 1.0, notAbove: 'medium' }), aa: 'none', bloom: false, particles: 2000, lights: 0, debris: 0,
    smoke: false, embers: false, damageSmoke: 'off', shieldRipples: 1, scorch: false, textures: '1k',
  }),
});

/** Pojemność puli świateł = największa liczba z tabeli (pula budowana RAZ, preset ustawia, ile z niej świeci). */
export const LIGHT_POOL_MAX = Math.max(...GFX_LEVELS.map((l) => GFX_PRESETS[l].lights));

/**
 * Kolejność dławienia (§2.10 — wyłącznie efekty drugorzędne): poziom k wyłącza pierwsze k pozycji.
 * Strzały, trafienia i światła puli nie są na tej liście z konstrukcji.
 */
export const THROTTLE_ORDER = Object.freeze(['smoke', 'embers', 'debris', 'damageSmoke']);

/**
 * Gęstość pikseli renderera dla poziomu.
 * @param {string} level — 'low' | 'medium' | 'high'
 * @param {number} dpr — `window.devicePixelRatio`
 * @returns {number}
 */
export function presetPixelRatio(level, dpr) {
  const p = (GFX_PRESETS[level] ?? GFX_PRESETS.high).pixelRatio;
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const r = Number.isFinite(p.fixed) ? p.fixed : Math.min(d * p.dprMul, p.cap);
  // Finding 703 — niższy preset nigdy ostrzejszy od wyższego (Low ≤ Medium ≤ High przy każdym DPR).
  return p.notAbove && p.notAbove !== level ? Math.min(r, presetPixelRatio(p.notAbove, d)) : r;
}

/** ARC CV-5 (Finding 704) — gęstość ODNIESIENIA bloomu: gęstość Medium (min(dpr, 1,5)) — ta sama dla każdego presetu danego DPR. */
export function bloomPixelRatio(dpr) {
  return presetPixelRatio('medium', dpr);
}

/**
 * ARC CV-5 (pozycja 0 — Finding 704) — rozmiar WEJŚCIA mipów bloomu (`UnrealBloomPass.setSize(w, h)` — mip 0 = połowa).
 * `cssPx` (presety włączone): rozmiar CSS × gęstość odniesienia (`bloomPixelRatio`) — poświata w pikselach CSS, ta sama przy
 * każdym presecie (High natywny, Medium, nawet przy DPR 2, gdzie High rysuje gęściej od Medium). Bez `cssPx` (flaga `cvPresets`
 * OFF): rozmiar bufora rysowania (CSS × gęstość renderera) — dzisiejsze zachowanie co do bitu.
 * @param {{ cssW:number, cssH:number, dpr:number, pixelRatio:number, cssPx?:boolean }} o
 * @returns {{ w:number, h:number, scale:number }}
 */
export function bloomInputSize({ cssW, cssH, dpr, pixelRatio, cssPx = true } = {}) {
  const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const scale = cssPx ? bloomPixelRatio(dpr) : pr;
  const w = Math.max(1, (Number(cssW) || 1) * scale);
  const h = Math.max(1, (Number(cssH) || 1) * scale);
  return { w, h, scale };
}
