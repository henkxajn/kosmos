// CityLightsLogic — CZYSTA logika świateł miast na nocnej stronie ciała (ARC COLONY SPHERE, krok CS-9; plan §3.18).
//
//   • `tileLight(tile, factor)`        — natężenie światła pola 0…1: budynek (kategoria × poziom), stolica, plac budowy;
//   • `colonyLightFactor(b, pop)`      — mnożnik kolonii: rośnie z liczbą budynków i z ludnością, nasyca się przy 1;
//   • `cityLightsOf(tiles, pop)`       — natężenia wszystkich pól + podpis (zmiana podpisu = trzeba przerysować mapę);
//   • `rasterizeCityLights(topo, …)`   — mapa równoodległościowa natężeń (komórki Voronoi pól, jaśniej w środku pola);
//   • `lightUvOf(x, y, z)`             — TA SAMA konwencja kierunek → uv, której używa shader (`CityLightsShader`).
//
// Wszystko deterministyczne: brak losowania, brak zegara — to samo wejście daje te same bajty (keeper). Wzór punktów
// światła liczy shader z kierunku na kuli i ziarna ciała, więc kula kolonii i mapa układu pokazują to samo miasto.
// Moduł bez DOM i bez three.

import { BUILDINGS } from '../data/BuildingsData.js';

/** Strojenie świateł (wartości do przeglądu przez właściciela — plan §3.18). */
export const CITY_LIGHTS = Object.freeze({
  mapW: 512, mapH: 256,                  // mapa natężeń (równoodległościowa)
  categoryWeight: Object.freeze({        // jak jasno świeci budynek danej kategorii
    population: 1.0, market: 0.92, civil: 0.85, governance: 0.85, space: 0.78, research: 0.72, infrastructure: 0.66,
    energy: 0.62, synthetic: 0.6, military: 0.5, mining: 0.46, food: 0.34,
  }),
  defaultWeight: 0.6,
  capitalWeight: 1.0,
  levelStep: 0.14,                       // + tyle na poziom powyżej 1
  levelMax: 1.9,                         // klamra mnożnika poziomu
  constructionGlow: 0.16,                // plac budowy: światła robocze
  colonyFloor: 0.36,                     // mnożnik kolonii z jednym budynkiem i bez ludności
  buildingsScale: 14,                    // tyle budynków ≈ 63 % drogi do pełnej jasności
  populationScale: 60,                   // tyle ludności ≈ 63 % drogi do pełnej jasności
  edgeFloor: 0,                          // jasność przy krawędzi pola względem środka (0 = miasto gaśnie do granicy pola —
                                         // przy wartości > 0 pola czytały się na mapie układu jak plaster miodu)
  coreBand: 0.9,                         // szerokość przejścia krawędź → środek (ułamek „głębokości" pola)
  capScale: 0.72,                        // promień wyszukiwania komórki względem najdalszego sąsiada
  warm: Object.freeze([1.0, 0.72, 0.38]),   // barwa sodowa
  cool: Object.freeze([1.0, 0.93, 0.80]),   // barwa biała (część punktów)
  nightEdge: Object.freeze([-0.05, 0.10]),  // światła zapalają się już o zmierzchu (iloczyn normalna · słońce): nocny sierp kuli
                                            // kolonii jest wąski (lampa 48° od osi widzenia), więc pas zmierzchu też ma świecić
  heroDensity: Object.freeze([210, 84]),    // gęstość kraty punktów na kuli kolonii (drobna, gruba)
  systemDensity: Object.freeze([64, 26]),   // gęstość na mapie układu (ciało ma kilkadziesiąt–kilkaset px)
  heroGain: 1.45, systemGain: 1.5, workGain: 0.3,   // tryb budowy / soczewka: światła przygaszone
  heroRadius: 1.001, systemRadius: 1.004,   // promień powłoki świateł [promienie ciała]
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / Math.max(1e-9, b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Ludność kolonii (jak lista konsoli): `civSystem.humans ?? population`; placówka / brak → 0. */
export function populationOfColony(colony) {
  const civ = colony?.civSystem ?? null;
  if (!civ || colony?.isOutpost) return 0;
  return Math.max(0, Math.floor(Number(civ.humans ?? civ.population) || 0));
}

/** Mnożnik kolonii 0…1: rośnie ściśle z liczbą budynków i z ludnością, nasyca się przy 1; pusta kolonia → 0. */
export function colonyLightFactor(buildings, population, T = CITY_LIGHTS) {
  const b = Math.max(0, Number(buildings) || 0), p = Math.max(0, Number(population) || 0);
  if (b <= 0) return 0;
  return T.colonyFloor + (1 - T.colonyFloor) * (1 - Math.exp(-((b - 1) / T.buildingsScale + p / T.populationScale)));
}

/** Waga pola bez mnożnika kolonii: budynek (kategoria × poziom), stolica, plac budowy; puste pole → 0. */
export function tileLightWeight(tile, T = CITY_LIGHTS) {
  if (!tile) return 0;
  let w = 0;
  if (tile.buildingId) {
    const cat = BUILDINGS[tile.buildingId]?.category;
    const lv = Math.max(1, Math.floor(Number(tile.buildingLevel) || 1));
    w = (T.categoryWeight[cat] ?? T.defaultWeight) * Math.min(T.levelMax, 1 + T.levelStep * (lv - 1));
  }
  if (tile.capitalBase) w = Math.max(w, T.capitalWeight);
  if (w <= 0 && tile.underConstruction) w = T.constructionGlow;
  return w;
}

/** Natężenie światła pola 0…1. */
export function tileLight(tile, factor, T = CITY_LIGHTS) {
  return clamp(tileLightWeight(tile, T) * factor, 0, 1);
}

/**
 * Natężenia wszystkich pól kolonii.
 * @param {object[]} tiles pola siatki (indeks = id pola)
 * @param {number} population ludność kolonii
 * @param {object|null} [reuse] poprzedni wynik (bufor do ponownego użycia)
 * @returns {{data:Float32Array, buildings:number, population:number, factor:number, lit:number, any:boolean, signature:number}}
 */
export function cityLightsOf(tiles, population = 0, reuse = null, T = CITY_LIGHTS) {
  const n = tiles?.length ?? 0;
  const data = reuse?.data?.length === n ? reuse.data : new Float32Array(n);
  let buildings = 0;
  for (let i = 0; i < n; i++) if (tiles[i]?.buildingId || tiles[i]?.capitalBase) buildings++;
  const factor = colonyLightFactor(buildings, population, T);
  let lit = 0, h = 0x811c9dc5;
  for (let i = 0; i < n; i++) {
    // Plac budowy świeci także w kolonii bez żadnego gotowego budynku (mnożnik najniższy).
    const v = buildings > 0 ? tileLight(tiles[i], factor, T) : clamp(tileLightWeight(tiles[i], T) * T.colonyFloor, 0, 1);
    data[i] = v;
    if (v > 0) {
      lit++;
      h ^= i + 1; h = Math.imul(h, 0x01000193);
      h ^= Math.round(v * 255); h = Math.imul(h, 0x01000193);
    }
  }
  return { data, buildings, population: Math.max(0, Number(population) || 0), factor, lit, any: lit > 0, signature: ((h ^ n) >>> 0) };
}

/** Kierunek na kuli → uv mapy natężeń (u = długość / 2π + 0,5; v = szerokość / π + 0,5). Lustro GLSL `lightUv`. */
export function lightUvOf(x, y, z) {
  return [Math.atan2(z, x) / (2 * Math.PI) + 0.5, Math.asin(clamp(y, -1, 1)) / Math.PI + 0.5];
}

/**
 * Mapa natężeń świateł: każde świecące pole wypełnia SWOJĄ komórkę (punkt należy do pola, gdy żaden sąsiad nie jest
 * bliżej), jaśniej w środku, ciemniej przy krawędzi. Bajty RGBA (R = natężenie, A = 255), wiersz 0 = biegun południowy.
 * @param {object} topo topologia siatki geo (`cx`, `cy`, `cz`, `nbStart`, `nbList`, `count`)
 * @param {Float32Array|number[]} lights natężenie per pole 0…1
 * @param {number} w @param {number} h rozmiar mapy
 * @param {Uint8Array|null} [out] bufor do ponownego użycia
 */
export function rasterizeCityLights(topo, lights, w = CITY_LIGHTS.mapW, h = CITY_LIGHTS.mapH, out = null, T = CITY_LIGHTS) {
  const data = out && out.length === w * h * 4 ? out : new Uint8Array(w * h * 4);
  data.fill(0);
  for (let k = 3; k < data.length; k += 4) data[k] = 255;
  const { cx, cy, cz, nbStart, nbList, count } = topo;
  for (let i = 0; i < count; i++) {
    const I = lights[i];
    if (!(I > 0)) continue;
    const x0 = cx[i], y0 = cy[i], z0 = cz[i];
    const a = nbStart[i], b = nbStart[i + 1];
    let minDot = 1;
    for (let k = a; k < b; k++) { const j = nbList[k]; minDot = Math.min(minDot, x0 * cx[j] + y0 * cy[j] + z0 * cz[j]); }
    const rho = Math.acos(clamp(minDot, -1, 1)) * T.capScale;
    const cosRho = Math.cos(rho);
    const lat0 = Math.asin(clamp(y0, -1, 1)), lon0 = Math.atan2(z0, x0);
    const v0 = Math.max(0, Math.floor(((lat0 - rho) / Math.PI + 0.5) * h)), v1 = Math.min(h - 1, Math.ceil(((lat0 + rho) / Math.PI + 0.5) * h));
    const polar = Math.abs(lat0) + rho >= Math.PI / 2 - 1e-3;
    const dLon = polar ? Math.PI : Math.asin(clamp(Math.sin(rho) / Math.max(1e-6, Math.cos(lat0)), 0, 1)) + 2 * Math.PI / w;
    const uc = (lon0 / (2 * Math.PI) + 0.5) * w, du = polar ? w / 2 : Math.min(w / 2, Math.ceil(dLon / (2 * Math.PI) * w) + 1);
    for (let v = v0; v <= v1; v++) {
      const lat = ((v + 0.5) / h - 0.5) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
      for (let q = Math.floor(uc - du); q <= Math.ceil(uc + du); q++) {
        const u = ((q % w) + w) % w;
        const lon = ((u + 0.5) / w - 0.5) * 2 * Math.PI;
        const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
        const d = px * x0 + py * y0 + pz * z0;
        if (d < cosRho) continue;
        let m = 1;
        for (let k = a; k < b && m > 0; k++) {
          const j = nbList[k];
          const dj = px * cx[j] + py * cy[j] + pz * cz[j];
          const cc = x0 * cx[j] + y0 * cy[j] + z0 * cz[j];
          m = Math.min(m, (d - dj) / Math.max(1e-9, 1 - cc));
        }
        if (m <= 0) continue;
        const val = Math.round(255 * clamp(I * (T.edgeFloor + (1 - T.edgeFloor) * smooth(0, T.coreBand, m)), 0, 1));
        const o = (v * w + u) * 4;
        if (val > data[o]) { data[o] = val; data[o + 1] = val; data[o + 2] = val; }
      }
    }
  }
  return data;
}

export const CityLightsLogic = {
  CITY_LIGHTS, populationOfColony, colonyLightFactor, tileLightWeight, tileLight, cityLightsOf, lightUvOf, rasterizeCityLights,
};
export default CityLightsLogic;
