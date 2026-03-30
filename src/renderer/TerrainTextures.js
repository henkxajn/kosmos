// src/renderer/TerrainTextures.js
// System ładowania i doboru tekstur terenu dla mapy 2D planety
//
// Każdy typ terenu ma podtypy (np. plains_green, plains_blue) i 3 warianty (_1, _2, _3).
// Dobór podtypu na podstawie cech planety (temperatureC, lifeScore, atmosphere, composition).

import EventBus from '../core/EventBus.js';

// Prefix pliku per typ terenu (większość = identyczny z kluczem)
const FILE_PREFIX = {
  ice_sheet: 'ice',   // TERRAIN_TYPES używa 'ice_sheet', pliki to 'ice_*.png'
};

// Dokładna lista podtypów i liczba wariantów per typ
const VARIANTS = {
  plains:    { green: 3, blue: 3, purple: 3, rusty: 3 },
  mountains: { grey: 3, red: 3, crystal: 3, snow: 3 },
  ocean:     { blue: 3, dark: 3, green: 3, iron: 3 },
  forest:    { rich: 3, scattered: 3, blue: 3, rusty: 3, egzotic: 3 },
  desert:    { sand: 3, rusty: 3, white: 3, black: 3 },
  tundra:    { blue: 3, fiolet: 3, rusty: 3 },
  volcano:   { red: 3, blue: 3, dark: 3, snow: 3 },
  crater:    { deep: 3 },
  ice_sheet: { white: 3, blue: 3, green: 3 },
};

// ── Pary transition i ich nazwy plików ───────────────────────────────────────
// Klucz: "typeA|typeB" (typeA = lewa strona tekstury, typeB = prawa)
// Wartość: prefix pliku (bez _1/_2.png)
// Wartość: { prefix, count } — prefix pliku + liczba wariantów
const TRANSITION_PAIRS = {
  'plains|ocean':       { prefix: 'plains_ocean',      count: 2 },
  'plains|forest':      { prefix: 'plains_forest',     count: 2 },
  'plains|mountains':   { prefix: 'plains_mountains',  count: 2 },
  'plains|desert':      { prefix: 'plain_desert',      count: 2 },
  'plains|tundra':      { prefix: 'plains_tundra',     count: 2 },
  'forest|ocean':       { prefix: 'forest_ocean',      count: 2 },
  'forest|mountains':   { prefix: 'forest_mountains',  count: 2 },
  'desert|volcano':     { prefix: 'desert_volcano',    count: 2 },
  'desert|mountains':   { prefix: 'desert_mountains',  count: 2 },
  'tundra|ice_sheet':   { prefix: 'tundra_ice',        count: 2 },
  'tundra|ocean':       { prefix: 'tundra_ocean',      count: 2 },
  'mountains|ice_sheet':{ prefix: 'mountains_ice',     count: 2 },
  'volcano|ocean':      { prefix: 'volcano_ocean',     count: 2 },
  'ice_sheet|forest':   { prefix: 'ice_forest',        count: 1 },
  'ice_sheet|ocean':    { prefix: 'ice_ocean',         count: 1 },
};

// Cache: klucz → HTMLImageElement
const _cache = new Map();
const _transCache = new Map(); // transition cache osobno
let _loaded = false;
let _loadPromise = null;

/**
 * Ładuje wszystkie tekstury terenu asynchronicznie.
 * Po załadowaniu emituje 'terrain:texturesLoaded'.
 */
export function loadAllTerrainTextures() {
  if (_loadPromise) return _loadPromise;

  const promises = [];

  for (const [terrainType, subtypes] of Object.entries(VARIANTS)) {
    const prefix = FILE_PREFIX[terrainType] ?? terrainType;
    for (const [subtype, count] of Object.entries(subtypes)) {
      for (let i = 1; i <= count; i++) {
        const key  = `${terrainType}_${subtype}_${i}`;
        const path = `assets/textures/terrain/${prefix}_${subtype}_${i}.png`;
        const p = new Promise((resolve) => {
          const img = new Image();
          img.onload  = () => { _cache.set(key, img); resolve(); };
          img.onerror = () => resolve(); // brak pliku → cichy fallback
          img.src = path;
        });
        promises.push(p);
      }
    }
  }

  // Ładuj transition textures
  const _transFailed = [];
  for (const [pairKey, { prefix: filePrefix, count: varCount }] of Object.entries(TRANSITION_PAIRS)) {
    for (let i = 1; i <= varCount; i++) {
      const key  = `trans_${filePrefix}_${i}`;
      const path = `assets/textures/terrain/transitions/${filePrefix}_${i}.png`;
      const p = new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => { _transCache.set(key, img); resolve(); };
        img.onerror = () => { _transFailed.push(path); resolve(); };
        img.src = path;
      });
      promises.push(p);
    }
  }

  _loadPromise = Promise.all(promises).then(() => {
    _loaded = true;
    console.log(`[TerrainTextures] Załadowano ${_cache.size} base + ${_transCache.size} transition tekstur`);
    if (_transFailed.length) console.warn('[TerrainTextures] Brak plików transition:', _transFailed);
    EventBus.emit('terrain:texturesLoaded');
  });

  return _loadPromise;
}

export function texturesLoaded() { return _loaded; }

// ── Logika doboru podtypu na podstawie cech planety ──────────────────────────
export function getTerrainSubtype(terrainType, planet) {
  if (!planet) return _getDefaultSubtype(terrainType);

  const pType = planet.planetType   ?? 'rocky';
  const temp  = planet.temperatureC
    ?? (planet.temperatureK ? planet.temperatureK - 273 : 20);
  const life  = planet.lifeScore    ?? 0;
  const atmo  = planet.atmosphere   ?? 'none';
  const comp  = planet.composition  ?? {};
  const fe    = comp.Fe  ?? 0;
  const si    = comp.Si  ?? 0;
  const h2o   = comp.H2O ?? 0;
  const c     = comp.C   ?? 0;

  // ── Earth-like: 0–30°C → ograniczony, realistyczny zestaw tekstur ──────────
  const isEarthLike = temp >= 0 && temp <= 30
    && (atmo === 'breathable' || atmo === 'dense')
    && pType !== 'ice' && pType !== 'hot_rocky';

  if (isEarthLike) {
    const EARTH_MAP = {
      plains:    'green',
      mountains: temp < 5 ? 'snow' : 'grey',
      ocean:     'blue',
      forest:    life > 70 ? 'rich' : (temp > 25 ? 'rusty' : 'scattered'),
      desert:    'sand',
      tundra:    'blue',
      volcano:   temp < 5 ? 'snow' : 'red',
      crater:    'deep',
      ice_sheet: 'white',
      wasteland: 'sand',
    };
    if (EARTH_MAP[terrainType]) return EARTH_MAP[terrainType];
  }

  // ── Egzotyczne planety — pełna logika doboru ──────────────────────────────
  switch (terrainType) {

    case 'plains':
      if (life > 60 && temp > -10 && temp < 50)         return 'green';
      if (pType === 'ice' || (temp < -10 && life > 20)) return 'blue';
      if (life >= 20 && life <= 60)                      return 'purple';
      if (atmo === 'toxic' || atmo === 'dense')          return 'purple';
      return 'rusty';

    case 'mountains':
      if (atmo === 'toxic' || (life === 0 && si > 0.4)) return 'crystal';
      if (pType === 'hot_rocky' || temp > 50)            return 'red';
      if (temp < -20 || pType === 'ice')                 return 'snow';
      return 'grey';

    case 'ocean':
      if (atmo === 'breathable' || life > 30)            return 'blue';
      if (temp < 0 && life === 0)                        return 'dark';
      if (pType === 'ocean' && life === 0)               return 'dark';
      if (atmo === 'toxic' || atmo === 'dense' || c > 0.3) return 'green';
      if (fe > 0.4 || (pType === 'hot_rocky' && h2o > 0)) return 'iron';
      if (life === 0 && temp > 20)                       return 'iron';
      return 'blue';

    case 'forest':
      if (atmo === 'toxic' && life > 30)                 return 'egzotic';
      if (si > 0.5 && life > 20)                         return 'egzotic';
      if ((pType === 'ice' || temp < 0) && life > 20)   return 'blue';
      if (temp > 30 && life > 20)                        return 'rusty';
      if (atmo === 'thin' && life > 20)                  return 'rusty';
      if (life > 70)                                     return 'rich';
      return 'scattered';

    case 'desert':
      // Zimna pustynia ma priorytet — na lodowej planecie nie ma pomarańczowego piasku
      if (temp < -20 || pType === 'ice')                 return 'white';
      if ((life === 0 && temp > 80) || (pType === 'hot_rocky' && temp > 80)) return 'black';
      if (pType === 'hot_rocky' || fe > 0.5 || temp > 60) return 'rusty';
      if (si > 0.5 && fe < 0.2)                         return 'white';
      if (atmo === 'none' && temp < 20)                  return 'white';
      return 'sand';

    case 'tundra':
      if (atmo === 'toxic' || c > 0.4)                  return 'fiolet';
      if (atmo === 'none' || h2o < 0.1)                 return 'rusty';
      return 'blue';

    case 'volcano':
      if (temp < -20)                                    return 'snow';
      if (atmo === 'toxic' || si > 0.5)                 return 'blue';
      if (life === 0 && fe > 0.5)                        return 'dark';
      return 'red';

    case 'crater':
      return 'deep';

    case 'ice_sheet':
      if (pType === 'ice' && c > 0.3)                   return 'green';
      if (atmo === 'toxic')                              return 'green';
      if (temp < -100)                                   return 'blue';
      return 'white';

    case 'wasteland':
      // Wasteland nie ma własnych tekstur — używa desert
      if (temp < -20 || pType === 'ice')                 return 'white';
      if (pType === 'hot_rocky' || temp > 60)            return 'rusty';
      return 'sand';

    default:
      return _getDefaultSubtype(terrainType);
  }
}

function _getDefaultSubtype(terrainType) {
  const defaults = {
    plains:    'green',
    mountains: 'grey',
    ocean:     'blue',
    forest:    'rich',
    desert:    'sand',
    tundra:    'blue',
    volcano:   'red',
    crater:    'deep',
    ice_sheet: 'white',
  };
  return defaults[terrainType] ?? 'grey';
}

// ── Średni kolor tekstury (cache: klucz → {r,g,b} 0-1) ─────────────────────
const _avgColorCache = new Map();
const _sampleCanvas = document.createElement('canvas');
_sampleCanvas.width = 32;  // próbkuj w niskiej rozdzielczości — szybko
_sampleCanvas.height = 32;
const _sampleCtx = _sampleCanvas.getContext('2d', { willReadFrequently: true });

function _computeAverageColor(img) {
  const w = _sampleCanvas.width, h = _sampleCanvas.height;
  _sampleCtx.clearRect(0, 0, w, h);
  _sampleCtx.drawImage(img, 0, 0, w, h);
  const data = _sampleCtx.getImageData(0, 0, w, h).data;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // pomiń przezroczyste
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
    count++;
  }
  if (count === 0) return { r: 0.5, g: 0.5, b: 0.5 };
  return { r: rSum / count / 255, g: gSum / count / 255, b: bSum / count / 255 };
}

/**
 * Zwraca średni kolor {r,g,b} (0-1) dla danego typu terenu + planety.
 * Próbkuje wariant _1 dla stabilności.
 */
export function getAverageTerrainColor(terrainType, planet) {
  const subtype = getTerrainSubtype(terrainType, planet);
  const key = `${terrainType}_${subtype}_1`;

  if (_avgColorCache.has(key)) return _avgColorCache.get(key);

  const img = _cache.get(key);
  if (!img) return null;

  const color = _computeAverageColor(img);
  _avgColorCache.set(key, color);
  return color;
}

// Kolejność biome ID (musi odpowiadać BIOME_DATA w BiomeMapGenerator)
const BIOME_ORDER = [
  'plains', 'mountains', 'ocean', 'forest', 'desert',
  'tundra', 'volcano', 'crater', 'ice_sheet', 'wasteland',
];

// Fallback kolory (identyczne z hardkodowanymi w PlanetShader GLSL)
const FALLBACK_COLORS = [
  { r: 0.35, g: 0.54, b: 0.22 }, // plains
  { r: 0.55, g: 0.50, b: 0.44 }, // mountains
  { r: 0.10, g: 0.27, b: 0.59 }, // ocean
  { r: 0.13, g: 0.42, b: 0.13 }, // forest
  { r: 0.80, g: 0.67, b: 0.32 }, // desert
  { r: 0.54, g: 0.67, b: 0.74 }, // tundra
  { r: 0.74, g: 0.22, b: 0.07 }, // volcano
  { r: 0.42, g: 0.38, b: 0.32 }, // crater
  { r: 0.82, g: 0.90, b: 0.97 }, // ice_sheet
  { r: 0.49, g: 0.42, b: 0.36 }, // wasteland
];

/**
 * Zwraca Float32Array(30) z 10 kolorami biomów (RGB, 0-1) dla danej planety.
 * Kolory próbkowane z tekstur terenu (uwzględniając podtyp per planeta).
 * Jeśli tekstury nie załadowane — zwraca fallback.
 */
export function getBiomeColorsForPlanet(planet) {
  const colors = new Float32Array(30);
  for (let i = 0; i < BIOME_ORDER.length; i++) {
    const terrainType = BIOME_ORDER[i];
    const avg = _loaded ? getAverageTerrainColor(terrainType, planet) : null;
    const c = avg ?? FALLBACK_COLORS[i];
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return colors;
}

// ── Transition texture lookup ─────────────────────────────────────────────────
// Zwraca { img, flip } lub null.
// flip=true → bieżący hex to "prawa strona" tekstury (trzeba lustrzanie)
export function getTransitionTexture(typeA, typeB, edgeHash) {
  if (!_loaded || typeA === typeB) return null;

  // Szukaj pary w obu kierunkach
  let pairKey = `${typeA}|${typeB}`;
  let flip = false;
  let pair = TRANSITION_PAIRS[pairKey];
  if (!pair) {
    pairKey = `${typeB}|${typeA}`;
    pair = TRANSITION_PAIRS[pairKey];
    if (!pair) return null;
    flip = true;
  }

  const n = (Math.abs(edgeHash) % pair.count) + 1;
  const key = `trans_${pair.prefix}_${n}`;
  const img = _transCache.get(key);
  if (!img) return null;

  return { img, flip };
}

// ── Pobierz teksturę dla konkretnego hexa ────────────────────────────────────
// tileIndex: deterministyczny hash z pozycji hexa (q, r) → wybiera wariant 1/2/3
// Mapowanie typów bez własnych tekstur na typy z teksturami
const TYPE_REDIRECT = { wasteland: 'desert' };

export function getTerrainTexture(terrainType, planet, tileIndex) {
  const fileType = TYPE_REDIRECT[terrainType] ?? terrainType;
  const subtype = getTerrainSubtype(terrainType, planet);
  const count   = VARIANTS[fileType]?.[subtype] ?? 1;

  const n   = (Math.abs(tileIndex) % count) + 1;
  const key = `${fileType}_${subtype}_${n}`;

  return _cache.get(key) ?? null;
}

// ── Zwróć ImageData tekstury (do próbkowania pikseli w generatorze 3D) ──────
const _imgDataCache = new Map();
const _pixCanvas = document.createElement('canvas');
const _pixCtx = _pixCanvas.getContext('2d', { willReadFrequently: true });

export function getTerrainImageData(terrainType, planet, tileIndex) {
  const fileType = TYPE_REDIRECT[terrainType] ?? terrainType;
  const subtype = getTerrainSubtype(terrainType, planet);
  const count   = VARIANTS[fileType]?.[subtype] ?? 1;
  const n       = (Math.abs(tileIndex) % count) + 1;
  const key     = `${fileType}_${subtype}_${n}`;

  if (_imgDataCache.has(key)) return _imgDataCache.get(key);

  const img = _cache.get(key);
  if (!img) return null;

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w === 0 || h === 0) return null;

  _pixCanvas.width = w;
  _pixCanvas.height = h;
  _pixCtx.drawImage(img, 0, 0);
  const data = _pixCtx.getImageData(0, 0, w, h);
  _imgDataCache.set(key, data);
  return data;
}
