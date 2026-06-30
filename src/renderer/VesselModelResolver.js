// VesselModelResolver — mapowanie instancji statku → plik modelu GLB
//
// Statki na mapie 3D dostają model GLB wybierany wg DWÓCH osi:
//   A) napęd:  nonwarp (bez Komory Warp) | warp (warpFuel.max > 0)
//   B) klasa:  small/medium/large × rola (science|cargo|colony)  +  kadłuby
//              bojowe (frigate | destroyer | battleship)
//
// Razem 12 klas × 2 napędy = 24 pliki modeli + 1 plik DEFAULT (fallback).
// Klucz modelu ma format `{nonwarp|warp}_{klasa}`, plik = `<klucz>.glb`.
//
// Brakujący plik → gra używa VESSEL_MODEL_DEFAULT (`default.glb`).
//
// Plik czysty (bez Three.js) — importowalny w node (smoke testy).

import { HULLS } from '../data/HullsData.js';
import { SHIPS } from '../data/ShipsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';

// Katalog modeli statków + domyślny model (fallback gdy brak konkretnego pliku)
export const VESSEL_MODEL_DIR     = 'assets/models/ships/';
export const VESSEL_MODEL_DEFAULT = VESSEL_MODEL_DIR + 'default.glb';

// shipId kadłubów bojowych → klasa modelu (bez wariantu science/cargo).
// hull_cruiser = największy kadłub bojowy w grze → mapuje się na „battleship".
const COMBAT_CLASS = {
  hull_frigate:   'frigate',
  hull_destroyer: 'destroyer',
  hull_cruiser:   'battleship',
};

// Rozmiar dla legacy shipId (ShipsData) bez pola `size`.
const LEGACY_SIZE = {
  science_vessel:    'small',
  cargo_ship:        'medium',
  space_supply_ship: 'medium',
  colony_ship:       'large',
};

// ── Lista wszystkich kluczy modeli (24) — używane przez nazwy plików/preload/testy ──
export const VESSEL_MODEL_CLASSES = [
  'small_science',  'small_cargo',  'small_colony',
  'medium_science', 'medium_cargo', 'medium_colony',
  'large_science',  'large_cargo',  'large_colony',
  'frigate', 'destroyer', 'battleship',
];
export const VESSEL_MODEL_KEYS = (() => {
  const keys = [];
  for (const drive of ['nonwarp', 'warp']) {
    for (const cls of VESSEL_MODEL_CLASSES) keys.push(`${drive}_${cls}`);
  }
  return keys;
})();

// Docelowy rozmiar (maxDim, jednostki świata 3D) per klasa — model jest
// NORMALIZOWANY do tej wielkości przez bounding box przy ładowaniu. Dzięki temu
// dowolny model gracza (o nieznanej skali natywnej) renderuje się spójnie —
// kalibracja JEDNĄ liczbą per klasa, nie metodą prób per plik.
// Odniesienie: stacja orbitalna ≈ 0.029 j., księżyc bodyR ≈ 0.03 j.
// ⚙ KNOB / STOP-IF-WRONG: jeśli za duże/małe, zmień tu lub globalnie VESSEL_SIZE_SCALE.
export const VESSEL_TARGET_SIZE = {
  small_science:  0.014, small_cargo:  0.014, small_colony:  0.016,
  medium_science: 0.018, medium_cargo: 0.018, medium_colony: 0.020,
  large_science:  0.022, large_cargo:  0.022, large_colony:  0.026,
  frigate:        0.016, destroyer:    0.020, battleship: 0.028,
};
export const VESSEL_TARGET_SIZE_DEFAULT = 0.018;
// Globalny mnożnik rozmiaru wszystkich statków (live-tuning jednym pokrętłem).
export const VESSEL_SIZE_SCALE = 1.0;

/** Czy statek ma napęd warp (bak warp_cores zamontowany). */
export function isWarpVessel(vessel) {
  return (vessel?.warpFuel?.max ?? 0) > 0;
}

/**
 * Rola statku cywilnego (colony | science | cargo) — z modułów, z fallbackiem
 * na typ kadłuba. Priorytet: colony (moduł kolonizacyjny) > science (moduł
 * naukowy) > cargo (reszta). Klasy bojowe NIE używają roli (mają własne klasy
 * frigate/destroyer/battleship).
 */
export function vesselRole(vessel) {
  const mods = Array.isArray(vessel?.modules) ? vessel.modules : null;
  if (mods && mods.length) {
    let hasColony = false, hasScience = false;
    for (const id of mods) {
      const m = SHIP_MODULES[id];
      if (!m) continue;
      // Moduł kolonizacyjny = slotType 'habitat' (habitat_pod / cryo_pod),
      // analogicznie jak moduł naukowy = slotType 'science'.
      if (m.slotType === 'habitat') hasColony = true;
      else if (m.slotType === 'science') hasScience = true;
    }
    if (hasColony)  return 'colony';
    if (hasScience) return 'science';
    return 'cargo';  // brak osobnej kategorii bojowej dla kadłubów generycznych
  }
  // Legacy (bez modułów) — z hullType / shipId
  const shipId = vessel?.shipId;
  if (shipId === 'colony_ship')   return 'colony';
  if (shipId === 'science_vessel') return 'science';
  const def = SHIPS[shipId] ?? HULLS[shipId];
  if (def?.hullType === 'science') return 'science';
  return 'cargo';
}

/**
 * Klasa modelu: 'frigate'/'destroyer'/'battleship' (kadłuby bojowe) lub
 * '{small|medium|large}_{science|cargo}' (kadłuby generyczne/legacy).
 */
export function vesselSizeClass(vessel) {
  const shipId = vessel?.shipId;
  if (COMBAT_CLASS[shipId]) return COMBAT_CLASS[shipId];

  const def = HULLS[shipId] ?? SHIPS[shipId];
  let size = def?.size;
  if (size !== 'small' && size !== 'medium' && size !== 'large') {
    size = LEGACY_SIZE[shipId] ?? 'medium';
  }
  return `${size}_${vesselRole(vessel)}`;
}

/** Klucz modelu `{nonwarp|warp}_{klasa}` (jeden z VESSEL_MODEL_KEYS). */
export function resolveVesselModelKey(vessel) {
  return `${isWarpVessel(vessel) ? 'warp' : 'nonwarp'}_${vesselSizeClass(vessel)}`;
}

/** Ścieżka pliku modelu dla statku (może nie istnieć → fallback w rendererze). */
export function vesselModelPath(vessel) {
  return VESSEL_MODEL_DIR + resolveVesselModelKey(vessel) + '.glb';
}

/** Docelowy maxDim (j. świata) dla klasy danego statku × globalny mnożnik. */
export function vesselTargetSize(vessel) {
  const cls = vesselSizeClass(vessel);
  return (VESSEL_TARGET_SIZE[cls] ?? VESSEL_TARGET_SIZE_DEFAULT) * VESSEL_SIZE_SCALE;
}
