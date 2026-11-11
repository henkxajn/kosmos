// KeyColourEmission — emisja z koloru-klucza tekstury bazowej + tint wroga + żar wraku jako uniformy (ARC COMBAT VISUALS,
// krok CV-1a; plan §2.11, D-CV-12, Finding 620; flaga `cvModels`).
//
// Po co: Meshy nie daje map emisji, a standard modelu właściciela (F10) mówi „jeden kolor-klucz = jasny cyjan, tylko na
// oknach / światłach / pierścieniu warp". Gra liczy z niego PRAWDZIWĄ emisję: maska barwa × nasycenie × jasność próbki
// tekstury bazowej, `totalEmissiveRadiance += kolor · maska · wzmocnienie` (HDR — ponad progiem bloomu 1,0, więc świeci).
// Dotychczasowy człon mapy emisji zostaje (okna kolonii z mapy emisji świecą jak dziś).
//
// Finding 620: tint wroga (`emissive 0x880022`) i żar wraku (`0xff2200 × 2,2`) mnożyły czarną mapę emisji
// (`emissivemap_fragment`: `totalEmissiveRadiance *= emissiveColor.rgb`) — niewidoczne na 24 z 27 modeli. Tu oba idą
// UNIFORMAMI dodawanymi PO mapie emisji: tint — emisja kadłuba modulowana jasnością tekstury (jasne panele czerwienieją,
// rowy zostają ciemne — model czytelny, nie płaska sylwetka), żar — cienka świecąca krawędź (fresnel⁴) + słaba poświata.
//
// ŚWIATŁO CZYTELNOŚCI (kontrola właściciela CV-1a, 2026-11-11): przy czerwonej, słabej gwieździe kadłub jest ciemny i czerwony,
// a czerwony tint wroga tonie w barwie gwiazdy. Dwa człony, oba PO oświetleniu (druga wstawka, przed `opaque_fragment`), oba
// pod SUFITEM poniżej progu bloomu (1,0) — nigdy nie rozjaśniają piksela, który już jest jasny, więc nie rodzą bloomu:
//   • wypełnienie — neutralne, niezależne od barwy gwiazdy, względem kamery (`0,35 + 0,65·N·V`), albedo × kolor wypełnienia,
//     słabnące z jasnością piksela (strona oświetlona gwiazdą zostaje w barwie gwiazdy, cień dostaje neutralne światło);
//   • obwódka (fresnel `(1 − N·V)^moc`) w kolorze STRONY — swój chłodna biel, wróg czerwień roli `alert` — główny sygnał
//     swój / obcy; dlatego tint ciała wroga (albedo i emisja) jest słabszy, a detal tekstury zostaje.
// Tint ciała wroga to od tej poprawki UNIFORM (dawniej `color.lerp` przy budowie), żeby jedno pokrętło `MODEL_ENEMY_TINT`
// sterowało CAŁYM tintem na żywo.
//
// JEDEN PROGRAM dla wszystkich statków (§2.12-5): każda wartość na statek idzie UNIFORMEM, nigdy interpolacją stringa do
// GLSL; `customProgramCacheKey` stały. Mnożniki wspólne (`KC_SHARED`) to TE SAME obiekty uniformów we wszystkich
// materiałach — pokrętło w konsoli działa od następnej klatki bez przebudowy statków.
//
// ⚠ ZERO importów — moduł wykonuje się pod node: keeper sprawdza wstawkę przeciwko szablonowi `meshphysical_frag`
//   z `src/lib/three.module.js` (kotwice muszą istnieć) i maskę jej LUSTREM w JS (`keyColourMask`) — ta sama definicja.
// ⚠ Granica: `Material.copy` NIE kopiuje `onBeforeCompile` ani `customProgramCacheKey` (instancyjnych), a uniformy żyją
//   w WeakMapie, nie w `userData` (`copy` robi `JSON.parse(JSON.stringify(userData))`) — klon materiału z maską jest
//   zwykłym materiałem bez maski, nigdy materiałem z kluczem programu maski bez jej uniformów.

// Szerokość rampy barwy na jednostkę `soft` [°]: soft 0,06 ⇒ 6° — pełna maska do hueTol − 6°, zero od hueTol.
export const KC_HUE_SOFT_DEG = 100;
export const KC_PROGRAM_KEY = 'kosmos-cv1a-keycolour-v2';

const ANCHOR_PARS = '#include <emissivemap_pars_fragment>';
const ANCHOR_MAIN = '#include <emissivemap_fragment>';
const ANCHOR_LIFT = '#include <opaque_fragment>';
const MARK = 'uKcGainMul';   // token obecny wyłącznie we wstawce (wykrywa podwójną transformację)

export const KC_PARS_GLSL = `
uniform float uKcHue;
uniform float uKcHueTol;
uniform float uKcSatMin;
uniform float uKcValMin;
uniform float uKcSoft;
uniform float uKcGain;
uniform float uKcGainMul;
uniform vec3 uKcTint;
uniform float uKcTintMul;
uniform vec3 uKcBurn;
uniform float uKcBurnMul;
uniform vec3 uKcBody;
uniform float uKcBodyAmt;
uniform vec3 uKcRim;
uniform float uKcRimMul;
uniform float uKcRimPow;
uniform vec3 uKcFillCol;
uniform float uKcFillMul;
uniform float uKcLiftCeil;
float kcStep(float e0, float e1, float x) {
  float t = clamp((x - e0) / max(e1 - e0, 1e-5), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
vec3 kcToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
float kcMask(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  if (mx <= 1e-5 || d <= 1e-5) return 0.0;
  float h;
  if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  h *= 60.0;
  float sat = d / mx;
  float dh = abs(h - uKcHue);
  dh = min(dh, 360.0 - dh);
  float sd = max(uKcSoft * ${KC_HUE_SOFT_DEG.toFixed(1)}, 0.01);
  float wH = uKcHueTol > 0.0 ? 1.0 - kcStep(max(0.0, uKcHueTol - sd), uKcHueTol, dh) : 0.0;
  float ss = max(uKcSoft, 1e-4);
  return wH * kcStep(uKcSatMin, uKcSatMin + ss, sat) * kcStep(uKcValMin, uKcValMin + ss, mx);
}
`;

// Wstawka PO `emissivemap_fragment`: `sampledDiffuseColor` (map_fragment) to kolor tekstury BEZ tintu materiału — maska
// klasyfikuje to, co namalował autor modelu, nie kolor po tincie wroga czy szarości utrzymania. Tekstura przychodzi
// liniowa (sRGB zdekodowane przy próbkowaniu) — `kcToSrgb` wraca do przestrzeni, w której mierzono progi.
// Tint ciała wroga mnoży `diffuseColor` TU — przed oświetleniem (`lights_physical_fragment` czyta go dalej). Wypełnienie
// i obwódka tylko się LICZĄ (`kcFill`, `kcRimL` — zmienne w zasięgu `main`); dodaje je druga wstawka, po oświetleniu.
export const KC_MAIN_GLSL = `
vec3 kcFill = vec3(0.0);
vec3 kcRimL = vec3(0.0);
{
#ifdef USE_MAP
  vec3 kcTex = sampledDiffuseColor.rgb;
#else
  vec3 kcTex = diffuseColor.rgb;
#endif
  diffuseColor.rgb *= mix(vec3(1.0), uKcBody, clamp(uKcBodyAmt * uKcTintMul, 0.0, 1.0));
  if (uKcGain > 0.0) {
    totalEmissiveRadiance += kcTex * (kcMask(kcToSrgb(kcTex)) * uKcGain * uKcGainMul);
  }
  float kcL = dot(kcTex, vec3(0.2126, 0.7152, 0.0722));
  totalEmissiveRadiance += uKcTint * (uKcTintMul * (0.2 + 1.2 * kcL));
  float kcNV = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  kcFill = diffuseColor.rgb * uKcFillCol * (uKcFillMul * (0.35 + 0.65 * kcNV));
  if (uKcRim.r + uKcRim.g + uKcRim.b > 0.0) {
    kcRimL = uKcRim * (uKcRimMul * pow(1.0 - kcNV, max(uKcRimPow, 0.5)));
  }
  if (uKcBurn.r + uKcBurn.g + uKcBurn.b > 0.0) {
    float kcRim = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
    float kcR2 = kcRim * kcRim;
    totalEmissiveRadiance += uKcBurn * (uKcBurnMul * (0.03 + 0.97 * kcR2 * kcR2));
  }
}
`;

// Wstawka PRZED `opaque_fragment` (po całym oświetleniu): wypełnienie słabnie z jasnością piksela (cień dostaje je w pełni,
// strona oświetlona gwiazdą prawie nic — gwiazda zostaje nastrojem), obwódka idzie w pełni; suma nie przebija sufitu
// `uKcLiftCeil` (< próg bloomu 1,0), a piksel już ponad sufitem zostaje nietknięty (maska HDR, odblask, żar wraku).
export const KC_LIFT_GLSL = `
{
  float kcLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  vec3 kcAdd = kcFill * clamp(1.0 - kcLum / max(uKcLiftCeil, 1e-3), 0.0, 1.0) + kcRimL;
  outgoingLight = max(outgoingLight, min(outgoingLight + kcAdd, vec3(uKcLiftCeil)));
}
`;

/**
 * Wstawka do szablonu fragmentu MeshStandardMaterial (`meshphysical_frag`, three r171). Kotwica, której NIE MA, jest
 * GŁOŚNA (wyjątek) — transformacja, która po cichu nic nie robi, dałaby statek bez maski i bez tintu, czyli dokładnie
 * Finding 620, tylko trudniejszy do zauważenia (lekcja LogDepthChunks).
 */
export function injectKeyColour(fragSrc) {
  if (typeof fragSrc !== 'string') throw new Error('[KeyColourEmission] oczekiwano tekstu shadera');
  if (fragSrc.includes(MARK)) throw new Error('[KeyColourEmission] shader JUŻ ma wstawkę (podwójna transformacja)');
  for (const a of [ANCHOR_PARS, ANCHOR_MAIN, ANCHOR_LIFT]) {
    if (!fragSrc.includes(a)) throw new Error(`[KeyColourEmission] brak kotwicy „${a}"`);
  }
  // Wstawka światła czytelności MUSI stać za liczeniem oświetlenia (inaczej `outgoingLight` jeszcze nie istnieje).
  if (fragSrc.indexOf(ANCHOR_LIFT) < fragSrc.indexOf(ANCHOR_MAIN)) throw new Error(`[KeyColourEmission] „${ANCHOR_LIFT}" przed „${ANCHOR_MAIN}"`);
  return fragSrc
    .replace(ANCHOR_PARS, ANCHOR_PARS + '\n' + KC_PARS_GLSL)
    .replace(ANCHOR_MAIN, ANCHOR_MAIN + '\n' + KC_MAIN_GLSL)
    .replace(ANCHOR_LIFT, KC_LIFT_GLSL + ANCHOR_LIFT);
}

// ── lustro maski w JS (ta sama definicja co `kcMask` — keeper porównuje na siatce) ─────────────────────────────────────

/** Krok gładki z twardymi brzegami: 0 przy x ≤ e0, 1 przy x ≥ e1 (szerokość ≥ 1e-5 — bez zachowania niezdefiniowanego). */
export function kcStep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / Math.max(e1 - e0, 1e-5)));
  return t * t * (3 - 2 * t);
}

/**
 * Maska koloru-klucza dla próbki sRGB (0–255). Progi TWARDE: barwa w odległości ≥ hueTol, nasycenie ≤ satMin albo
 * jasność ≤ valMin ⇒ dokładnie 0 (np. przy hue 182 / hueTol 12 nic od 194° w górę — niebieskie panele pancerników).
 * @param {number} r8 @param {number} g8 @param {number} b8
 * @param {{ hue:number, hueTol:number, satMin:number, valMin:number, soft:number }} kc
 * @returns {number} [0, 1]
 */
export function keyColourMask(r8, g8, b8, kc) {
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx <= 1e-5 || d <= 1e-5) return 0;
  let h;
  if (mx === r) { h = ((g - b) / d) % 6; if (h < 0) h += 6; } else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60;
  const sat = d / mx;
  let dh = Math.abs(h - kc.hue); dh = Math.min(dh, 360 - dh);
  const sd = Math.max(kc.soft * KC_HUE_SOFT_DEG, 0.01);
  const wH = kc.hueTol > 0 ? 1 - kcStep(Math.max(0, kc.hueTol - sd), kc.hueTol, dh) : 0;
  const ss = Math.max(kc.soft, 1e-4);
  return wH * kcStep(kc.satMin, kc.satMin + ss, sat) * kcStep(kc.valMin, kc.valMin + ss, mx);
}

/** Barwa HSV (°) próbki sRGB 0–255 — ta sama konwencja co maska. */
export function hueOf(r8, g8, b8) {
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d <= 1e-5) return 0;
  let h;
  if (mx === r) { h = ((g - b) / d) % 6; if (h < 0) h += 6; } else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return h * 60;
}

/** Wzmocnienie maski z trybu: 'mask' → gain, inaczej 0 (program ten sam — gałąź uniformu `uKcGain > 0`). */
export function keyColourGain(kc) {
  return kc && kc.mode === 'mask' && Number.isFinite(kc.gain) ? Math.max(0, kc.gain) : 0;
}

// ── uniformy i podpięcie do materiału ──────────────────────────────────────────────────────────────────────────────────

/**
 * Uniformy wspólne dla WSZYSTKICH materiałów z maską — pokrętła `cvTuning` przepisywane co klatkę przez renderer:
 * `MODEL_KC_GAIN` (maska), `MODEL_ENEMY_TINT` (cały tint ciała wroga: albedo i emisja), `MODEL_WRECK_BURN` (żar),
 * `MODEL_FILL` (wypełnienie), `MODEL_RIM_GAIN` / `MODEL_RIM_POWER` (obwódka), `MODEL_LIFT_CEIL` (sufit obu — poniżej 1,0
 * bez bloomu; powyżej — bloom świadomie). Kolor wypełnienia neutralny, stały. Wartości tu — tylko do pierwszej klatki.
 */
export const KC_SHARED = Object.freeze({
  uKcGainMul: { value: 1 },
  uKcTintMul: { value: 1 },
  uKcBurnMul: { value: 1 },
  uKcFillMul: { value: 0 },
  uKcFillCol: { value: { x: 0.90, y: 0.93, z: 1.0 } },   // prawie neutralny, lekko chłodny (kalibracja pod gwiazdą M / K / F)
  uKcRimMul: { value: 0 },
  uKcRimPow: { value: 4.0 },
  uKcLiftCeil: { value: 0.95 },
});

const UNIFORMS = new WeakMap();   // material → uniformy (NIE userData — patrz nagłówek)

function onBeforeCompileKc(shader) {
  const u = UNIFORMS.get(this);
  if (!u) return;
  Object.assign(shader.uniforms, u);
  shader.fragmentShader = injectKeyColour(shader.fragmentShader);
}
function programKeyKc() { return KC_PROGRAM_KEY; }

/**
 * Podepnij maskę do (sklonowanego, własnego) materiału MeshStandardMaterial. Wołać PRZED pierwszym rysowaniem.
 * @param {object} material
 * @param {object} kc — keyColour z pliku hardpointów
 * @returns {object} uniformy materiału
 */
export function applyKeyColour(material, kc) {
  if (!material) return null;
  let u = UNIFORMS.get(material);
  if (!u) {
    u = {
      uKcHue: { value: 182 }, uKcHueTol: { value: 12 }, uKcSatMin: { value: 0.45 }, uKcValMin: { value: 0.55 },
      uKcSoft: { value: 0.06 }, uKcGain: { value: 0 },
      uKcTint: { value: { x: 0, y: 0, z: 0 } }, uKcBurn: { value: { x: 0, y: 0, z: 0 } },
      // Strona statku — WŁASNE obiekty materiału (nigdy wspólne): kolor tintu ciała + ilość, kolor obwódki (0 = bez obwódki).
      uKcBody: { value: { x: 1, y: 1, z: 1 } }, uKcBodyAmt: { value: 0 }, uKcRim: { value: { x: 0, y: 0, z: 0 } },
      uKcGainMul: KC_SHARED.uKcGainMul, uKcTintMul: KC_SHARED.uKcTintMul, uKcBurnMul: KC_SHARED.uKcBurnMul,
      uKcFillMul: KC_SHARED.uKcFillMul, uKcFillCol: KC_SHARED.uKcFillCol, uKcRimMul: KC_SHARED.uKcRimMul,
      uKcRimPow: KC_SHARED.uKcRimPow, uKcLiftCeil: KC_SHARED.uKcLiftCeil,
    };
    UNIFORMS.set(material, u);
    material.onBeforeCompile = onBeforeCompileKc;
    material.customProgramCacheKey = programKeyKc;
  }
  setKeyColourParams(material, kc);
  return u;
}

/** Uniformy maski materiału albo null (materiał bez maski). */
export function keyColourUniformsOf(material) { return (material && UNIFORMS.get(material)) || null; }

/** Parametry maski z dokumentu (`mode` → wzmocnienie). */
export function setKeyColourParams(material, kc) {
  const u = keyColourUniformsOf(material);
  if (!u || !kc) return;
  if (Number.isFinite(kc.hue)) u.uKcHue.value = kc.hue;
  if (Number.isFinite(kc.hueTol)) u.uKcHueTol.value = kc.hueTol;
  if (Number.isFinite(kc.satMin)) u.uKcSatMin.value = kc.satMin;
  if (Number.isFinite(kc.valMin)) u.uKcValMin.value = kc.valMin;
  if (Number.isFinite(kc.soft)) u.uKcSoft.value = kc.soft;
  u.uKcGain.value = keyColourGain(kc);
}

/** Tint (emisja stała, LINIOWE rgb). */
export function setKeyColourTint(material, r, g, b) {
  const u = keyColourUniformsOf(material);
  if (!u) return;
  u.uKcTint.value.x = r; u.uKcTint.value.y = g; u.uKcTint.value.z = b;
}

/** Żar wraku (LINIOWE rgb, HDR; krawędź fresnel + słaba poświata). */
export function setKeyColourBurn(material, r, g, b) {
  const u = keyColourUniformsOf(material);
  if (!u) return;
  u.uKcBurn.value.x = r; u.uKcBurn.value.y = g; u.uKcBurn.value.z = b;
}

/** Tint ciała (albedo × mix(1, kolor, ilość · MODEL_ENEMY_TINT); LINIOWE rgb; ilość 0 = bez tintu). */
export function setKeyColourBody(material, r, g, b, amount) {
  const u = keyColourUniformsOf(material);
  if (!u) return;
  u.uKcBody.value.x = r; u.uKcBody.value.y = g; u.uKcBody.value.z = b;
  u.uKcBodyAmt.value = Math.max(0, Number(amount) || 0);
}

/** Obwódka w kolorze strony (LINIOWE rgb; 0,0,0 = bez obwódki — wrak). */
export function setKeyColourRim(material, r, g, b) {
  const u = keyColourUniformsOf(material);
  if (!u) return;
  u.uKcRim.value.x = r; u.uKcRim.value.y = g; u.uKcRim.value.z = b;
}

/** Wyłącz maskę (wrak: martwe okna nie świecą) bez zmiany programu. */
export function setKeyColourGain(material, gain) {
  const u = keyColourUniformsOf(material);
  if (u) u.uKcGain.value = Math.max(0, Number(gain) || 0);
}
