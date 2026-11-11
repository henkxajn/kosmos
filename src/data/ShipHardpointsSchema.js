// ShipHardpointsSchema — schemat v1 plików hardpointów modelu statku (ARC COMBAT VISUALS, krok CV-1a; plan §2.11,
// D-CV-11, D-CV-12; `docs/design/COMBAT_VISUALS_PLAN.md`).
//
// Plik: `assets/models/ships/hardpoints/<slot>.json` (model gracza w slocie) albo `…/hardpoints/incoming/<slot>.json`
// (model właściciela czekający w `assets/models/ships/incoming/` na podmianę slotu — CV-1b). Piszą je: CV-1a (wartości
// z pomiaru), normalizator CV-1b (scala, nie nadpisuje klikniętych punktów), Model Workshop CV-1c (kliknięcia właściciela).
//
// PRZESTRZEŃ WSPÓŁRZĘDNYCH — „znormalizowana przestrzeń modelu": scena GLB z transformacjami węzłów, przesunięta tak, by
// środek prostopadłościanu otaczającego (bbox) był w (0, 0, 0), i przeskalowana jednorodnie tak, by NAJDŁUŻSZY wymiar
// bbox = 1,0. Dokładnie to robi renderer przy stawianiu statku, więc punkt `p` z pliku trafia w to samo miejsce kadłuba
// przy KAŻDYM rozmiarze klasy (`VESSEL_TARGET_SIZE`) i po każdej normalizacji pliku (CV-1b centruje i skaluje tak samo).
//
// POLA:
//   frame      { bow, up }      kierunek dziobu i „góry" modelu w tej przestrzeni (wektory jednostkowe, prostopadłe).
//                               Renderer liczy z nich JEDEN kwaternion na slot do ramy kanonicznej: dziób +Z, góra +Y
//                               (D-CV-11 — natywna dla `Object3D.lookAt`, więc zwrot ku celowi to jedno wywołanie).
//   nozzles    [{ p, d, r }]    dysza: punkt, kierunek smugi (OD kadłuba, za rufę), promień; renderer używa nozzles[0].
//   weapons    [{ id, p, d }]   wieżyczki W1…Wn (CV-4); `d` = null — kierunek dowolny.
//   lights     [{ p, size, colour?, gain? }]
//                               punkty świetlne (okna, światła pozycyjne) klikane w Workshopie. ⚠ RYSOWANE ZAWSZE, GDY SĄ —
//                               NIEZALEŻNIE od `keyColour.mode` (zmiana wobec szkicu §2.11: dla nowych modeli właściciela
//                               okna to właśnie klikane punkty — tekstury Meshy nie mają cyjanowych okien; jedyny cyjan to
//                               pierścień rdzenia warp — pomiar 2026-11-10). Maska i punkty RAZEM są poprawne: pierścień
//                               świeci z maski, okna z punktów. `size` = średnica w tej samej przestrzeni (× rozmiar klasy).
//   keyColour  { mode, hue, hueTol, satMin, valMin, soft, gain }
//                               emisja z koloru-klucza tekstury (D-CV-12). `mode`: 'mask' — maska z tekstury bazowej
//                               świeci (HDR, ponad progiem bloomu); 'none' — bez maski. Dawny tryb „points" ze szkicu §2.11
//                               WYCOFANY: punkty nie są już trybem, tylko osobną listą (patrz `lights`).
//                               Definicja maski (lustro GLSL w `KeyColourEmission.js`): progi są TWARDE — przy odległości
//                               barwy ≥ hueTol, nasyceniu ≤ satMin albo jasności ≤ valMin maska = 0 dokładnie; `soft` łagodzi
//                               do wewnątrz (pełna maska od satMin + soft, valMin + soft i odległości ≤ hueTol − soft·100°).
//   damagePoints 'auto' | [p…]  punkty uszkodzeń (CV-5); 'auto' — wyznaczy renderer.
//   source     { file, sha256, normalizer }  skąd wartości (sha256 pliku GLB w chwili pomiaru — CV-1b po nim wykrywa
//                               nieaktualny plik hardpointów); normalizer = null, gdy plik nie przeszedł normalizatora.
//   notes      opcjonalny opis (string).
//
// ⚠ ZERO importów — moduł wykonuje się pod node (keeper `cv_models_logic_smoke` sprawdza nim wszystkie pliki z dysku).

export const HARDPOINTS_SCHEMA  = 'kosmos-ship-hardpoints';
export const HARDPOINTS_VERSION = 1;
export const KEY_COLOUR_MODES   = Object.freeze(['mask', 'none']);

// Domyślne parametry maski — z POMIARU sześciu modeli właściciela (2026-11-10, dekoder Chrome = ten sam co tekstura gry):
// pierścień rdzenia warp ma barwę 174–192° (szczyt 180–183°), nasycenie ≥ 0,45 i jasność ≥ 0,55; niebiesko-szare panele
// pancerników leżą na 196–216° przy nasyceniu < 0,3 lub jasności < 0,4 — wykluczone OBIEMA granicami (barwa ≥ 194°
// daje 0 niezależnie od nasycenia). Wartości dla pliku nadpisuje Workshop (CV-1c).
export const KEY_COLOUR_DEFAULTS = Object.freeze({ mode: 'none', hue: 182, hueTol: 12, satMin: 0.45, valMin: 0.55, soft: 0.06, gain: 3.5 });

// Zakresy dopuszczalne (walidacja). hueTol ≤ 60° — szerzej to już nie „jeden kolor-klucz".
export const KEY_COLOUR_LIMITS = Object.freeze({
  hue: [0, 360], hueTol: [0, 60], satMin: [0, 1], valMin: [0, 1], soft: [0, 0.5], gain: [0, 20],
});

// Punkt świetlny bez własnych pól: cyjan klucza (sRGB), wzmocnienie HDR ponad progiem bloomu.
export const LIGHT_DEFAULTS = Object.freeze({ size: 0.012, colour: '#7ff4ff', gain: 3.0 });

const COORD_MAX = 1.0;        // |współrzędna| w przestrzeni znormalizowanej (nominalnie ≤ 0,5; zapas na wieżyczki itp.)
const MAX_LIGHTS = 256;
const MAX_ITEMS  = 64;
const TOP_KEYS = Object.freeze(['schema', 'version', 'slot', 'source', 'frame', 'nozzles', 'weapons', 'lights', 'keyColour', 'damagePoints', 'notes']);

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const len3 = (v) => Math.hypot(v[0], v[1], v[2]);
const inBox = (v) => v.every((c) => Math.abs(c) <= COORD_MAX);
const isUnitish = (v) => isVec3(v) && len3(v) > 0.5 && len3(v) < 1.5;

/**
 * Walidacja dokumentu hardpointów (schemat v1). Ścisła: nieznane klucze najwyższego poziomu to błąd (literówka
 * „nozzle" zamiast „nozzles" ma krzyczeć, a nie po cichu dawać statek bez dyszy).
 * @param {object} doc
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateHardpoints(doc) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, errors: ['dokument nie jest obiektem'] };
  for (const k of Object.keys(doc)) if (!TOP_KEYS.includes(k)) err(`nieznany klucz „${k}"`);
  if (doc.schema !== HARDPOINTS_SCHEMA) err(`schema ≠ „${HARDPOINTS_SCHEMA}"`);
  if (doc.version !== HARDPOINTS_VERSION) err(`version ≠ ${HARDPOINTS_VERSION}`);
  if (typeof doc.slot !== 'string' || !/^[a-z0-9_]+$/.test(doc.slot)) err('slot: wymagany identyfikator [a-z0-9_]');

  const src = doc.source;
  if (!src || typeof src !== 'object') err('source: wymagany obiekt');
  else {
    if (typeof src.file !== 'string' || !/\.glb$/i.test(src.file)) err('source.file: wymagana nazwa pliku .glb');
    if (!(src.sha256 === null || (typeof src.sha256 === 'string' && /^[0-9a-f]{64}$/.test(src.sha256)))) err('source.sha256: null albo 64 znaki hex');
    if (!(src.normalizer === null || typeof src.normalizer === 'string')) err('source.normalizer: null albo string');
  }

  const fr = doc.frame;
  if (!fr || typeof fr !== 'object') err('frame: wymagany obiekt');
  else if (!isUnitish(fr.bow) || !isUnitish(fr.up)) err('frame.bow / frame.up: wektory jednostkowe (długość 0,5–1,5)');
  else {
    const dot = (fr.bow[0] * fr.up[0] + fr.bow[1] * fr.up[1] + fr.bow[2] * fr.up[2]) / (len3(fr.bow) * len3(fr.up));
    if (Math.abs(dot) > 0.05) err('frame: bow i up muszą być prostopadłe (|cos| ≤ 0,05)');
  }

  if (!Array.isArray(doc.nozzles) || doc.nozzles.length > MAX_ITEMS) err('nozzles: wymagana lista');
  else doc.nozzles.forEach((n, i) => {
    if (!n || !isVec3(n.p) || !inBox(n.p)) err(`nozzles[${i}].p: punkt w przestrzeni znormalizowanej (|c| ≤ ${COORD_MAX})`);
    if (!n || !isUnitish(n.d)) err(`nozzles[${i}].d: wektor jednostkowy`);
    if (!n || !isNum(n.r) || n.r <= 0 || n.r > 0.5) err(`nozzles[${i}].r: liczba z (0; 0,5]`);
  });

  if (!Array.isArray(doc.weapons) || doc.weapons.length > MAX_ITEMS) err('weapons: wymagana lista');
  else {
    const ids = new Set();
    doc.weapons.forEach((w, i) => {
      if (!w || typeof w.id !== 'string' || !/^W\d+$/.test(w.id)) err(`weapons[${i}].id: „W<n>"`);
      else if (ids.has(w.id)) err(`weapons[${i}].id: powtórzone „${w.id}"`);
      else ids.add(w.id);
      if (!w || !isVec3(w.p) || !inBox(w.p)) err(`weapons[${i}].p: punkt w przestrzeni znormalizowanej`);
      if (!w || !(w.d === null || isUnitish(w.d))) err(`weapons[${i}].d: null albo wektor jednostkowy`);
    });
  }

  if (!Array.isArray(doc.lights) || doc.lights.length > MAX_LIGHTS) err(`lights: wymagana lista (≤ ${MAX_LIGHTS})`);
  else doc.lights.forEach((l, i) => {
    if (!l || !isVec3(l.p) || !inBox(l.p)) err(`lights[${i}].p: punkt w przestrzeni znormalizowanej`);
    if (!l || !isNum(l.size) || l.size <= 0 || l.size > 0.2) err(`lights[${i}].size: liczba z (0; 0,2]`);
    if (l && l.colour !== undefined && !(typeof l.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.colour))) err(`lights[${i}].colour: „#rrggbb"`);
    if (l && l.gain !== undefined && !(isNum(l.gain) && l.gain >= 0 && l.gain <= 20)) err(`lights[${i}].gain: liczba z [0; 20]`);
  });

  const kc = doc.keyColour;
  if (!kc || typeof kc !== 'object') err('keyColour: wymagany obiekt');
  else {
    if (!KEY_COLOUR_MODES.includes(kc.mode)) err(`keyColour.mode: jedno z ${KEY_COLOUR_MODES.join(' / ')}`);
    for (const [k, [lo, hi]] of Object.entries(KEY_COLOUR_LIMITS)) {
      if (!isNum(kc[k]) || kc[k] < lo || kc[k] > hi) err(`keyColour.${k}: liczba z [${lo}; ${hi}]`);
    }
  }

  const dp = doc.damagePoints;
  if (!(dp === 'auto' || (Array.isArray(dp) && dp.length <= MAX_ITEMS && dp.every((p) => isVec3(p) && inBox(p))))) err("damagePoints: 'auto' albo lista punktów");
  if (doc.notes !== undefined && typeof doc.notes !== 'string') err('notes: string');
  return { ok: errors.length === 0, errors };
}
