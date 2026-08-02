// ═══════════════════════════════════════════════════════════════
// StarterLoadout — JEDNO autorytatywne źródło stanu startowego gracza (t=0).
// ─────────────────────────────────────────────────────────────
// Powód: definicje startu były zahardkodowane INLINE w GameScene (_setupColony,
// _setupBoostedTechs, _autoPlaceBoostedBuildings) i skopiowane do headless GameCore.
// Kopie DRYFOWAŁY — harness startował z basic_computing+automation (usunięte z gry) i
// BEZ metallurgy (dodane do gry), bez fuel:50 (reforma S3.0a). Krzywa referencyjna liczona
// na złym stanie startowym = fikcja. Teraz obie ścieżki (realna gra + harness) importują
// TE SAME stałe → dryf niemożliwy.
//
// „Nowa Gra" (przycisk) = scenariusz 'civilization_boosted' (TitleScene:346). To jest realny
// świeży start gracza. Standardowe 'civilization' to legacy fallback ładowania save (TitleScene:398).
//
// ⚠ To NIE jest zmiana balansu — wartości są IDENTYCZNE z dotychczasowym GameScene; jedynie
// przeniesione do współdzielonego modułu. Zmiana wartości = decyzja balansowa (osobno).
// ═══════════════════════════════════════════════════════════════

// Startowe zasoby kolonii macierzystej (surowce + commodities T1/T2 + fuel).
// Źródło: GameScene._setupColony. Konsument spreaduje ({ ...STARTER_RESOURCES }) — receive()
// nie powinno mutować argumentu, ale współdzielony obiekt trzymamy immutable defensywnie.
export const STARTER_RESOURCES = Object.freeze({
  Fe: 200, C: 150, Si: 100, Cu: 50, Ti: 20, Li: 10, Hv: 4,
  food: 100, water: 100, research: 100,
  structural_alloys: 15, polymer_composites: 10, conductor_bundles: 8,
  power_cells: 12, electronic_systems: 6, extraction_systems: 5,
  pressure_modules: 4, reactive_armor: 4, compact_bioreactor: 3,
  automation_droid: 0, semiconductor_arrays: 2, propulsion_systems: 0,
  plasma_cores: 0, metamaterials: 0, quantum_processors: 0, warp_cores: 0,
  fuel: 50,   // S3.0a: paliwo konwencjonalne
});

// Technologie zbadane od startu w „Nowej Grze" (boosted). Źródło: GameScene._setupBoostedTechs.
// metallurgy = odblokowuje Fabrykę (gracz startuje z nią gotową, tier 1 bez prereqów).
// basic_computing + automation ŚWIADOMIE NIE — gracz musi je sam zbadać (drugi slot badawczy +
// budynki autonomiczne nie są darmowe na starcie).
export const BOOSTED_STARTER_TECHS = Object.freeze([
  'orbital_survey', 'rocketry', 'exploration', 'metallurgy',
]);

// Budynki stawiane od startu w „Nowej Grze" (standardowe + boosted). Źródło:
// GameScene._autoPlaceBoostedBuildings. Kolejność = priorytet umieszczania.
export const BOOSTED_BUILD_PLAN = Object.freeze([
  { id: 'farm',       level: 1, count: 1 },
  { id: 'well',       level: 1, count: 1 },
  { id: 'solar_farm', level: 1, count: 1 },
  { id: 'habitat',    level: 1, count: 1 },
  { id: 'launch_pad', level: 1, count: 1 },
  { id: 'shipyard',   level: 1, count: 1 },
  { id: 'solar_farm', level: 3, count: 1 },
]);

// Populacja startowa „Nowej Gry" (boosted). Population 2.0: ×4 redenominacja (było 4).
// Źródło: GameScene (isBoosted → setPopulation(16)).
export const BOOSTED_STARTER_POP = 16;
