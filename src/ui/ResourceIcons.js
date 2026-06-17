// src/ui/ResourceIcons.js
// Warstwa ikon PNG dla surowców i towarów — obrazy nad emoji z RESOURCE_ICONS/COMMODITIES.
//
// Wzorowane na TerrainTextures: asynchroniczne ładowanie + cache + cichy fallback.
// Gdy PNG nie jest (jeszcze) załadowany albo brak pliku — rysujemy emoji z definicji,
// więc nic się wizualnie nie psuje (zero regresji).
//
// Faza 1: surowce (assets/icons/resources/). Faza 2: towary (assets/icons/commodities/).
//
// Import-safe w Node (headless smoke testy): ŻADNYCH top-level `new Image()` ani
// `document` — DOM dotykany tylko wewnątrz funkcji, pod strażą `typeof Image`.

import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES }   from '../data/CommoditiesData.js';

// id surowca → nazwa pliku PNG (bez rozszerzenia) w assets/icons/resources/
// Faza 1: tylko 10 surowców wydobywalnych (MINED). Kolejne fazy (food/water/fuel,
// commodities) dopisują tu wpisy — reszta kodu nie wymaga zmian.
export const RESOURCE_ICON_FILES = {
  C:  'carbon',
  Fe: 'iron',
  Si: 'silicon',
  Cu: 'copper',
  Ti: 'titanium',
  Li: 'lithium',
  Hv: 'heavy_metals',
  Xe: 'xenon',
  Nt: 'neutronium',
  H:  'hydrogen',
  // HARVESTED (zbieralne) — też mają PNG
  food:  'food',
  water: 'water',
  // Paliwo — commodity wywyższony do rangi zasobu witalnego (S3.0a)
  fuel:  'fuel',
};

// id towaru → nazwa pliku PNG (bez rozszerzenia) w assets/icons/commodities/ (Faza 2).
// UWAGA: plik 'extraction.png' odpowiada id 'extraction_systems' (nazwa pliku ≠ id towaru)!
export const COMMODITY_ICON_FILES = {
  structural_alloys:  'structural_alloys',
  polymer_composites: 'polymer_composites',
  conductor_bundles:  'conductor_bundles',
  extraction_systems: 'extraction',         // ← nazwa pliku inna niż id
  power_cells:        'power_cells',
  pressure_modules:   'pressure_modules',
  electronic_systems: 'electronic_systems',
  reactive_armor:     'reactive_armor',
  compact_bioreactor: 'compact_bioreactor',
  // Faza 2 (rozszerzenie) — pozostałe towary T2-T5 + prefaby/jednostki-commodity.
  // Wszystkie nazwa pliku == id (brak mismatchy jak extraction).
  android_worker:       'android_worker',
  basic_supplies:       'basic_supplies',
  civilian_goods:       'civilian_goods',
  military_supplies:    'military_supplies',
  neurostimulants:      'neurostimulants',
  orbital_shells:       'orbital_shells',
  plasma_cores:         'plasma_cores',
  semiconductor_arrays: 'semiconductor_arrays',
  propulsion_systems:   'propulsion_systems',
  quantum_processors:   'quantum_processors',
  quantum_cores:        'quantum_cores',
  metamaterials:        'metamaterials',
  antimatter_cells:     'antimatter_cells',
  warp_cores:           'warp_cores',
};

// Grupy ładowania: mapa id→plik + katalog źródłowy
const ICON_GROUPS = [
  { map: RESOURCE_ICON_FILES,  dir: 'assets/icons/resources' },
  { map: COMMODITY_ICON_FILES, dir: 'assets/icons/commodities' },
];

const _cache = new Map();   // id → HTMLImageElement (po udanym onload)
let _loadPromise = null;
let _loaded = false;

/**
 * Startuje (raz) asynchroniczne ładowanie wszystkich ikon surowców.
 * Zwraca Promise rozwiązywany po próbie załadowania wszystkich (sukces lub błąd).
 * No-op w środowisku bez DOM (Node) — zwraca rozwiązany Promise.
 */
export function loadResourceIcons() {
  if (_loadPromise) return _loadPromise;

  // Headless/Node — brak Image; działa tylko fallback emoji.
  if (typeof Image === 'undefined') {
    _loadPromise = Promise.resolve();
    return _loadPromise;
  }

  const promises = [];
  const failed = [];   // diagnostyka: które ikony się nie wczytały (i z jakiej ścieżki)
  let total = 0;
  for (const { map, dir } of ICON_GROUPS) {
    for (const [id, file] of Object.entries(map)) {
      total++;
      const path = `${dir}/${file}.png`;
      promises.push(new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => { _cache.set(id, img); resolve(); };
        img.onerror = () => { failed.push(`${id} → ${path}`); resolve(); };  // brak/zła nazwa → fallback emoji
        img.src = path;
      }));
    }
  }

  _loadPromise = Promise.all(promises).then(() => {
    _loaded = true;
    console.log(`[ResourceIcons] Załadowano ${_cache.size}/${total} ikon PNG`);
    if (failed.length) console.warn('[ResourceIcons] Nie wczytano (fallback emoji):', failed);
  });
  return _loadPromise;
}

export function resourceIconsLoaded() { return _loaded; }
export function getResourceIconImage(id) { return _cache.get(id) ?? null; }
export function hasResourceIcon(id) { return _cache.has(id); }

// Czy dla danego id istnieje zmapowany plik PNG (surowiec LUB towar)?
// Gate dla wywołujących — niezależny od stanu załadowania (działa też przed onload).
export function hasIconFile(id) {
  return (id in RESOURCE_ICON_FILES) || (id in COMMODITY_ICON_FILES);
}

/**
 * Rysuje ikonę surowca: PNG jeśli załadowany, inaczej emoji (fallback).
 * Lazy-init — pierwsze wywołanie startuje ładowanie; kolejne klatki pętli
 * renderującej pokażą już PNG (bez jawnego eventu — UI rysuje co klatkę).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} id       id surowca (np. 'Fe')
 * @param {number} x        lewa krawędź ikony (px)
 * @param {number} centerY  pionowy środek ikony (px)
 * @param {number} size     bok kwadratu ikony (px)
 * @param {string} [fallbackEmoji] emoji do narysowania gdy brak PNG (np. dla
 *        commodities spoza ALL_RESOURCES, jak 'fuel'); wywołujący zwykle ma je pod ręką
 * @returns {number} szerokość zajęta przez ikonę (px) — do przesunięcia kursora
 */
export function drawResourceIcon(ctx, id, x, centerY, size = 16, fallbackEmoji = null) {
  if (!_loadPromise) loadResourceIcons();

  const img = _cache.get(id);
  if (img) {
    ctx.drawImage(img, Math.round(x), Math.round(centerY - size / 2), size, size);
    return size;
  }

  // Fallback: emoji (z parametru lub z definicji surowca), wyśrodkowane wokół centerY.
  // Używa bieżącego ctx.fillStyle/ctx.font ustawionego przez wywołującego.
  const emoji = fallbackEmoji ?? ALL_RESOURCES[id]?.icon ?? COMMODITIES[id]?.icon ?? id;
  const prevBaseline = ctx.textBaseline;
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, centerY);
  ctx.textBaseline = prevBaseline;
  return ctx.measureText(emoji).width;
}
