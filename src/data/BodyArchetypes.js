// BodyArchetypes — archetypy ciał (ARC COLONY SPHERE, kroki CS-3b + CS-3b-v2; COLONY_SPHERE_PLAN §0b D-CS-1/2/3/5/8,
// §1.E, §2, §3.3).
//
// Archetyp = „jaki to świat" (ziemski, cieplarniany, lodowej mgły, …). Wybierany RAZ, deterministycznie, z ZAPISANYCH
// parametrów fizycznych ciała + kontekstu gwiazdy / planety-rodzica (selektor: `src/utils/BodyArchetypeLogic.js`),
// remis rozstrzyga `surfaceSeed`. Wynik jest ZAPISYWANY na ciele (`body.bodyArchetype`;
// nie `archetype` — to pole imperium, EmpireData.ARCHETYPES) i ZAMROŻONY (D-CS-2): późniejszy dryf temperatury
// czy kolizja nie przemaluje skolonizowanego świata.
//
// CS-3b-v2 (właściciel 2026-11-18, D-CS-1 zrewidowane): wybór PRZEDE WSZYSTKIM z fizycznych DRIVERÓW — strumień
// gwiazdy na orbicie (S = L/a², w S⊕; księżyc: orbita rodzica), atmosfera, composition.H2O, masa, planeta-rodzic,
// pozycja księżyca wśród księżyców rodzica — a zapisana temperatura tylko POMOCNICZO. Dzięki temu wygląd jest
// realistyczny także tam, gdzie dzisiejszy model temperatury nie jest (D-CS-19, §4).
//
// To są WYŁĄCZNIE DANE — nic jeszcze nie rysuje się inaczej. Konsumenci:
//   • CS-4 (SurfaceField) — `field` (parametry szumu), `waterCoverage` terran (poziom morza),
//   • CS-5 (GeodesicGrid) — `biomes` (klasa biomu → jeden z 10 terenów rozgrywki, D-CS-3) i `GRID_TILE_COUNTS`,
//   • CS-6 (SurfaceShader) — `atmosphere`, `clouds`, palety; CS-6 DODA WARIANTY w obrębie archetypu (ziarno +
//     palety klasy gwiazdy), żeby dwa światy tego samego archetypu nigdy nie wyglądały identycznie,
//   • CS-11 (gazowe olbrzymy) — `gasPreset` (D-CS-5: domyślnie i awaryjnie DZISIEJSZY wygląd).
// ⚠ Wartości `field`, `atmosphere`, `clouds` to PLACEHOLDERY — strojone w CS-4 / CS-6 (nie są pinowane keeperami).
// ⚠ CS-6b: `atmosphere` / `clouds` w wierszach NIE są już czytane — żywe dane powietrza to src/data/BodyAtmospheres.js
//   (Finding 772: usunąć placeholdery w CS-Z).
// CS-4a (SurfaceField, plan §3.4) — `field` strojony na arkuszu kontaktowym; przepis = id archetypu. Pokrętła:
//   octaves, freq (bazowa częstotliwość), warp (zniekształcenie domeny), ridge (grzbiety), relief (amplituda ciał bez
//   atmosfery), continent (udział niskiej częstotliwości — kontynenty), craterDensity / craterScale / craterDepth,
//   basinChance (szansa wielkiego basenu z ziarna), polarCapBias (próg czap: 0 → t < 0.06, 1 → t < 0.26),
//   seaFromWaterCoverage (terran: morze = zapisane waterCoverage) albo seaShare (stały udział cieczy), tropic / wetBias,
//   islands (ocean), lava / calderas (volcanic), volcanoes (hothouse), polarLow (jeziora Tytana przy biegunach),
//   maria (Księżyc), scarps (Merkury), veins (żyły planetoid), patches (ciemne plamy), cracks (lineae), paterae (Io),
//   regional (gęstość kraterów: stare wyżyny vs równiny), regionalDepth (głębokość spadku gęstości na równinach,
//   domyślnie 0.8) i highlandBoost (dodatkowa gęstość na wyżynach, domyślnie 0) — CS-6b, dziś tylko barren,
//   lavaPlains (scorched: ciemne gładkie równiny lawowe),
//   rifts / oldIce (ice: ryfty, regiony starego lodu i gładkich równin).
//
// ── Reguły dopasowania (`match`) ──────────────────────────────────────────────────────────────────────────────
// Wiersz ma listę klauzul; klauzula pasuje, gdy WSZYSTKIE jej warunki są spełnione. Wynik wiersza = najwyższy
// `priority` spośród pasujących klauzul. Wygrywa najwyższy wynik w rodzinie ciała; RÓWNY wynik = remis →
// rozstrzyga `surfaceSeed` (tylko on).
// Warunki (każdy opcjonalny):
//   planetType / moonType / planetoidType / atmosphere — lista dozwolonych wartości,
//   tempC [min, max]  — temperatura powierzchni °C, OBA końce OSTRE (min < v < max); null = otwarty koniec;
//                       ciało bez temperatury nie spełnia warunku tempC,
//   flux  [min, max]  — strumień gwiazdy S = L/a² [S⊕] (księżyc: a rodzica), końce ostre; brak = nie spełnia,
//   h2o   [min, max]  — `composition.H2O` w % masy, końce ostre,
//   mass  [min, max]  — masa ciała w M⊕, końce ostre,
//   lifeMin           — `lifeScore` ≥ lifeMin (0–100),
//   tidallyLocked     — true/false (zapisana flaga ciała),
//   parentType        — (księżyc) lista `planetType` planety-rodzica,
//   moonZone          — (księżyc) lista stref wśród księżyców rodzica: 'inner' | 'mid' | 'outer' (MOON_ZONE_*),
//   priority          — liczba całkowita.
// Każda rodzina ma wiersz-fallback z klauzulą bez warunków (priority 0) → selektor jest funkcją TOTALNĄ.
//
// Rodziny: planet (planety skaliste/lodowe), gas (planetType 'gas'), moon, planetoid.

/** Rodziny archetypów (D-CS-1). */
export const ARCHETYPE_FAMILIES = Object.freeze(['planet', 'gas', 'moon', 'planetoid']);

// ── D-CS-8: liczba kafli per klasa rozmiaru — JEDNA tabela konfiguracji (właściciel może zmniejszyć po testach) ──
// Siatka geodezyjna: tiles = 10·n² + 2 (n=3 → 92, n=4 → 162, n=5 → 252, n=6 → 362). Konsumuje CS-5.
export const GRID_TILE_COUNTS = Object.freeze({
  planetoid:   92,
  moon:        92,
  gas:         92,    // pokład platform (D-CS-5)
  hot_rocky:   162,
  small_rocky: 162,   // planetType 'ice' oraz 'rocky' ≤ GRID_LARGE_ROCKY_MASS
  large_rocky: 252,   // 'rocky' > GRID_LARGE_ROCKY_MASS
  largest_cap: 362,   // górny pułap przy FEATURES.largestHexMaps (CS-5)
});
/** Próg masy (M⊕) między small_rocky a large_rocky (D-CS-8: „rocky ≤1.5 M⊕"). */
export const GRID_LARGE_ROCKY_MASS = 1.5;

// ── Rotacja związana (tidallyLocked, D-CS-1) ──────────────────────────────────────────────────────────────────
// Reguła: planeta (orbituje gwiazdę bezpośrednio) jest związana pływowo, gdy a < TIDAL_LOCK_BASE_AU · ∛M_klasy.
// Kształt ∝ M★^(1/3) — promień synchronizacji Peale'a/Gladmana przy stałym wieku układu. Baza SKALIBROWANA do
// ściśniętych orbit gry: generator nie stawia planet bliżej niż ≈0.55 AU (M) / 0.56 (K) / 0.71 (G) / 1.22 (F)
// (pomiar 5 seedów × 72 układy, §3.3), więc fizyczna baza ≈0.3–0.5 AU nie związałaby ŻADNEJ planety.
// Masa z KLASY widmowej (nie z wariacji ±20%) — reguła zależy od orbity i klasy gwiazdy, jak w D-CS-1.
// Księżyce i planetoidy: false (księżyc jest związany z planetą, nie z gwiazdą — nie ma stałej strony dziennej).
// Mimośród pomijamy (gra: e ≤ 0.09; rezonans 3:2 jak Merkury wymaga e ≈ 0.2).
export const TIDAL_LOCK_BASE_AU = 0.85;
/** Masa klasy widmowej (M☉) — lustro `STAR_TYPES[*].mass` z GameConfig (keeper pilnuje zgodności). */
export const STAR_CLASS_MASS = Object.freeze({ M: 0.3, K: 0.7, G: 1.0, F: 1.4 });
/** Klasa nieznana (np. stary zapis z typem spoza tabeli) → masa G. */
export const STAR_CLASS_MASS_DEFAULT = 1.0;
/** Jasność klasy widmowej (L☉) — lustro `STAR_TYPES[*].luminosity`; używana tylko gdy gwiazda nie ma `luminosity`. */
export const STAR_CLASS_LUMINOSITY = Object.freeze({ M: 0.04, K: 0.4, G: 1.0, F: 3.0 });
export const STAR_CLASS_LUMINOSITY_DEFAULT = 1.0;

// ── Progi strumienia gwiazdy (CS-3b-v2) — S = L/a² w S⊕ (Ziemia = 1) ─────────────────────────────────────────────
// Zewnętrzna krawędź HZ gry odpowiada S ≈ 0.35 we WSZYSTKICH klasach (G 0.346, K 0.363, F 0.345, M 0.327 —
// `habitableZone.max` z STAR_TYPES) — to też fizyczna granica maksymalnej cieplarni CO₂ (Kopparapu 2013: ≈0.35).
// Linia mrozu gry = 2.2 · hz.max (SystemGenerator) → S = 0.35 / 2.2² ≈ 0.072.
export const FLUX_HOT       = 1.5;     // powyżej: wnętrze układu (Merkury/Wenus); HZ inner gry: G 1.38, F 1.43
export const FLUX_WARM      = 1.1;     // ciepła strona HZ (oddychalny → dżungla / pustynia)
export const FLUX_HZ_OUTER  = 0.35;    // zewnętrzna krawędź HZ = granica cieplarni (hothouse ↔ cryo_haze)
export const FLUX_FROST     = 0.072;   // linia mrozu (2.2 · hz.max)
export const FLUX_KUIPER    = FLUX_FROST / 100;   // 10 × odległość linii mrozu (S ∝ 1/a²) — pas lodowych planetoid
// Pomocnicze progi temperatury (°C) i składu — temperatura tylko jako wejście drugorzędne.
export const JUNGLE_TEMP_MIN_C   = 35;    // oddychalny cieplejszy niż to → dżungla / pustynia
export const JUNGLE_H2O_MIN      = 2.5;   // % masy H2O: mokry (dżungla) ↔ suchy (pustynia)
export const WATER_RICH_H2O      = 8;     // % masy H2O: świat bogaty w wodę (lód / ocean)
export const LAVA_TEMP_MIN_C     = 150;   // świat lawy
export const SCORCHED_TEMP_MIN_C = 100;   // bez atmosfery i gorętszy niż to → spieczony
export const SUPER_EARTH_MASS    = 4.5;   // M⊕: super-Ziemia z wygazowaniem (wulkaniczna)

// ── Strefy księżyców (CS-3b-v2) — pozycja wśród księżyców TEGO rodzica, posortowanych po półosi ─────────────────
// ranga r (0 = najbliższy), n księżyców: inner gdy r < n·MOON_ZONE_INNER, mid gdy r < n·MOON_ZONE_MID, inaczej outer.
// (n = 4: Io i Europa inner, Ganimedes mid, Kallisto outer — jak galileuszowe księżyce Jowisza.)
export const MOON_ZONE_INNER = 1 / 3;
export const MOON_ZONE_MID   = 2 / 3;

// ── Pasma wody terran (CS-3b-v2, D-CS-1 zrewidowane) — zapisane i zamrożone `waterBand` + `waterCoverage` ──────
// Wynik s = u(surfaceSeed) + clamp(WATER_H2O_GAIN·(H2O − WATER_H2O_REF), ±WATER_H2O_SHIFT_MAX), obcięty do [0, 1);
// pasma po kolei (udział = szerokość pasma s): continental 15% · balanced 25% · oceanic 60%. `waterCoverage` =
// liniowo w obrębie pasma (lo…hi), zaokrąglone do 0.001. Czysty hash — zero strumienia RNG. Konsument: CS-4 / CS-6
// (poziom morza).
export const WATER_BANDS = Object.freeze([
  Object.freeze({ id: 'continental', share: 0.15, lo: 0.15, hi: 0.40 }),
  Object.freeze({ id: 'balanced',    share: 0.25, lo: 0.40, hi: 0.65 }),
  Object.freeze({ id: 'oceanic',     share: 0.60, lo: 0.65, hi: 0.90 }),
]);
export const WATER_H2O_REF       = 3;      // % masy — typowy oddychalny świat generatora (2–3%)
export const WATER_H2O_GAIN      = 0.02;   // przesunięcie s na 1 pp H2O
export const WATER_H2O_SHIFT_MAX = 0.1;    // |przesunięcie| ≤ 0.1

// ── Zmienność planetoid z ziarna (CS-4 / CS-6 — DOKUMENTACJA, nie zapisywane, nie liczone w CS-3b-v2) ──────────
// Z `surfaceSeed` (mixSeed z osobnymi solami): gęstość kraterów × 0.6–1.4, albedo × 0.8–1.2, pojedynczy wielki krater
// (ok. 1 na 6 planetoid, promień 0.3–0.5 R, pozycja z ziarna). Wyprowadzane przy rysowaniu, nie zapisywane.

// ── Archetypy ─────────────────────────────────────────────────────────────────────────────────────────────────
// biomes: klasa biomu (wizualna) → teren rozgrywki (jeden z 10: plains, mountains, ocean, forest, desert, tundra,
// volcano, crater, ice_sheet, wasteland — HexTile.js; D-CS-3) + rola koloru dla shadera (CS-6).
// gridClass: 'by_mass' = klasa z typu i masy ciała (BodyArchetypeLogic.gridClassFor), inaczej klucz GRID_TILE_COUNTS.

const ROCKY = ['rocky', 'hot_rocky'];
const WITH_ATM = ['thin', 'breathable', 'dense', 'thick'];
const DENSE = ['dense', 'thick'];

const GAS_BIOMES = [
  { class: 'high_deck', terrain: 'desert', colorRole: 'deck' },
  { class: 'mid_deck', terrain: 'wasteland', colorRole: 'deck' },
  { class: 'low_deck', terrain: 'mountains', colorRole: 'deck' },
  { class: 'dock_ring', terrain: 'crater', colorRole: 'deck' },
];
const AIRLESS = { atmosphere: { tint: '#000000', density: 0.0 }, clouds: { coverage: 0.0 } };

export const BODY_ARCHETYPES = Object.freeze([
  // ── Planety ──
  {
    id: 'terran', family: 'planet', nameKey: 'archetype.terran.name',
    match: [
      { atmosphere: ['breathable'], lifeMin: 50, priority: 90 },                          // żywa biosfera = świat ziemski
      { atmosphere: ['breathable'], flux: [FLUX_HZ_OUTER, FLUX_HOT], priority: 60 },      // oddychalny w HZ
    ],
    // ZAWSZE ma oceany: pokrycie wodą = zapisane `waterCoverage` (pasmo `waterBand`, WATER_BANDS).
    field: { octaves: 6, warp: 0.35, ridge: 0.5, craterDensity: 0.0, seaFromWaterCoverage: true, polarCapBias: 0.5, continent: 1.0, freq: 1.6 },
    biomes: [
      { class: 'deep_sea', terrain: 'ocean', colorRole: 'deepSea' },
      { class: 'shallow_sea', terrain: 'ocean', colorRole: 'shallowSea' },
      { class: 'pack_ice', terrain: 'ice_sheet', colorRole: 'ice' },
      { class: 'glacier', terrain: 'ice_sheet', colorRole: 'ice' },
      { class: 'peaks', terrain: 'mountains', colorRole: 'peak' },
      { class: 'mountains', terrain: 'mountains', colorRole: 'rock' },
      { class: 'tundra', terrain: 'tundra', colorRole: 'tundra' },
      { class: 'steppe', terrain: 'desert', colorRole: 'dryGrass' },
      { class: 'plains', terrain: 'plains', colorRole: 'grass' },
      { class: 'forest', terrain: 'forest', colorRole: 'forest' },
    ],
    atmosphere: { tint: '#7fb2ff', density: 0.6 }, clouds: { coverage: 0.45 },
    gridClass: 'by_mass',
  },
  {
    id: 'ocean', family: 'planet', nameKey: 'archetype.ocean.name',
    match: [
      // Rzadki z założenia (wygląd świata-oceanu niesie zwykle terran `oceanic`): dużo wody w HZ.
      { atmosphere: WITH_ATM, flux: [FLUX_HZ_OUTER, FLUX_HOT], h2o: [WATER_RICH_H2O, null], priority: 65 },
    ],
    field: { octaves: 5, warp: 0.3, ridge: 0.3, craterDensity: 0.0, seaFromWaterCoverage: false, polarCapBias: 0.4, seaShare: 0.9, islands: 0.25, continent: 0.4, freq: 1.7 },
    biomes: [
      { class: 'deep_sea', terrain: 'ocean', colorRole: 'deepSea' },
      { class: 'shallow_sea', terrain: 'ocean', colorRole: 'shallowSea' },
      { class: 'pack_ice', terrain: 'ice_sheet', colorRole: 'ice' },
      { class: 'island_plains', terrain: 'plains', colorRole: 'grass' },
      { class: 'island_forest', terrain: 'forest', colorRole: 'forest' },
      { class: 'island_peaks', terrain: 'mountains', colorRole: 'rock' },
    ],
    atmosphere: { tint: '#6fa8ff', density: 0.65 }, clouds: { coverage: 0.6 },
    gridClass: 'by_mass',
  },
  {
    id: 'jungle', family: 'planet', nameKey: 'archetype.jungle.name',
    match: [
      // Ciepły i mokry oddychalny: ciepła strona HZ (strumień) albo — pomocniczo — gorąca zapisana temperatura.
      { atmosphere: ['breathable'], flux: [FLUX_WARM, null], h2o: [JUNGLE_H2O_MIN, null], priority: 61 },
      { atmosphere: ['breathable'], tempC: [JUNGLE_TEMP_MIN_C, null], h2o: [JUNGLE_H2O_MIN, null], priority: 61 },
    ],
    field: { octaves: 6, warp: 0.45, ridge: 0.35, craterDensity: 0.0, seaFromWaterCoverage: false, polarCapBias: 0.15, seaShare: 0.18, wetBias: 0.15, tropic: 0.5, continent: 0.6, freq: 1.5 },
    biomes: [
      { class: 'shallow_sea', terrain: 'ocean', colorRole: 'shallowSea' },
      { class: 'swamp', terrain: 'forest', colorRole: 'swamp' },
      { class: 'jungle', terrain: 'forest', colorRole: 'jungle' },
      { class: 'plains', terrain: 'plains', colorRole: 'grass' },
      { class: 'mountains', terrain: 'mountains', colorRole: 'rock' },
    ],
    atmosphere: { tint: '#9fd9a0', density: 0.75 }, clouds: { coverage: 0.65 },
    gridClass: 'by_mass',
  },
  {
    id: 'desert', family: 'planet', nameKey: 'archetype.desert.name',
    match: [
      { atmosphere: ['breathable'], flux: [FLUX_WARM, null], h2o: [null, JUNGLE_H2O_MIN], priority: 61 },          // suchy oddychalny
      { atmosphere: ['breathable'], tempC: [JUNGLE_TEMP_MIN_C, null], h2o: [null, JUNGLE_H2O_MIN], priority: 61 },
      { planetType: ROCKY, atmosphere: ['thin'], h2o: [null, WATER_RICH_H2O], flux: [FLUX_FROST, null], priority: 40 },  // Mars-like
    ],
    field: { octaves: 5, warp: 0.25, ridge: 0.45, craterDensity: 0.35, seaFromWaterCoverage: false, polarCapBias: 0.3, basinChance: 0.5, freq: 1.2 },
    biomes: [
      { class: 'dune_sea', terrain: 'desert', colorRole: 'sand' },
      { class: 'salt_flat', terrain: 'desert', colorRole: 'salt' },
      { class: 'mesa', terrain: 'mountains', colorRole: 'rock' },
      { class: 'scorched_rock', terrain: 'wasteland', colorRole: 'darkRock' },
      { class: 'polar_frost', terrain: 'ice_sheet', colorRole: 'ice' },
    ],
    atmosphere: { tint: '#e0b080', density: 0.3 }, clouds: { coverage: 0.08 },
    gridClass: 'by_mass',
  },
  {
    id: 'ice', family: 'planet', nameKey: 'archetype.ice.name',
    match: [
      { planetType: ['ice'], atmosphere: ['none', 'thin'], priority: 45 },                          // lodowy, bez gęstej atmosfery
      { atmosphere: ['breathable'], flux: [null, FLUX_HZ_OUTER], priority: 62 },                   // oddychalny poza HZ = śnieżka
      { planetType: ROCKY, atmosphere: ['none', 'thin'], h2o: [WATER_RICH_H2O, null], flux: [null, FLUX_HZ_OUTER], priority: 40 },  // zamarznięta woda
    ],
    field: { octaves: 5, warp: 0.2, ridge: 0.6, craterDensity: 0.1, seaFromWaterCoverage: false, polarCapBias: 1.0, rifts: 1.0, oldIce: 1.0, freq: 1.4 },
    biomes: [
      { class: 'ice_plain', terrain: 'ice_sheet', colorRole: 'ice' },
      { class: 'cryo_volcano', terrain: 'mountains', colorRole: 'blueIce' },
      { class: 'fractured_ridge', terrain: 'mountains', colorRole: 'blueIce' },
      { class: 'exposed_rock', terrain: 'wasteland', colorRole: 'rock' },
      { class: 'old_ice', terrain: 'ice_sheet', colorRole: 'oldIce' },          // CS-4a: ciemniejszy stary lód
      { class: 'smooth_plain', terrain: 'ice_sheet', colorRole: 'smoothIce' },    // CS-4a: gładkie zamarznięte równiny
      { class: 'rift', terrain: 'wasteland', colorRole: 'rift' },                 // CS-4a: ryfty / szczeliny
    ],
    atmosphere: { tint: '#cfe6ff', density: 0.25 }, clouds: { coverage: 0.15 },
    gridClass: 'by_mass',
  },
  {
    id: 'volcanic', family: 'planet', nameKey: 'archetype.volcanic.name',
    match: [
      { planetType: ROCKY, tempC: [LAVA_TEMP_MIN_C, null], priority: 50 },                                         // świat lawy
      { planetType: ROCKY, mass: [SUPER_EARTH_MASS, null], atmosphere: ['thin'], flux: [FLUX_FROST, null], priority: 50 },  // super-Ziemia, wygazowanie
    ],
    field: { octaves: 6, warp: 0.3, ridge: 0.7, craterDensity: 0.0, seaFromWaterCoverage: false, polarCapBias: 0.0, lava: 1.0, calderas: 0.35, freq: 1.5 },
    biomes: [
      { class: 'lava_field', terrain: 'volcano', colorRole: 'lava' },
      { class: 'caldera', terrain: 'volcano', colorRole: 'lava' },
      { class: 'ash_plain', terrain: 'wasteland', colorRole: 'ash' },
      { class: 'scorched_rock', terrain: 'wasteland', colorRole: 'darkRock' },
      { class: 'basalt_ridge', terrain: 'mountains', colorRole: 'darkRock' },
    ],
    atmosphere: { tint: '#ff8a50', density: 0.4 }, clouds: { coverage: 0.2 },
    gridClass: 'by_mass',
  },
  {
    id: 'hothouse', family: 'planet', nameKey: 'archetype.hothouse.name',
    match: [
      // Wenus-like: gęsta atmosfera przy strumieniu powyżej zewnętrznej krawędzi HZ (tam cieplarnia działa).
      { planetType: ROCKY, atmosphere: DENSE, flux: [FLUX_HZ_OUTER, null], priority: 60 },
    ],
    field: { octaves: 5, warp: 0.4, ridge: 0.4, craterDensity: 0.0, seaFromWaterCoverage: false, polarCapBias: 0.0, volcanoes: 0.3, freq: 1.2 },
    biomes: [
      { class: 'acid_flats', terrain: 'wasteland', colorRole: 'acid' },
      { class: 'sulphur_volcano', terrain: 'volcano', colorRole: 'sulphur' },
      { class: 'corroded_highlands', terrain: 'mountains', colorRole: 'darkRock' },
      { class: 'dust_basin', terrain: 'desert', colorRole: 'sulphurDust' },
    ],
    atmosphere: { tint: '#d6c060', density: 0.95 }, clouds: { coverage: 0.9 },
    gridClass: 'by_mass',
  },
  {
    id: 'cryo_haze', family: 'planet', nameKey: 'archetype.cryo_haze.name',
    match: [
      // Tytan-like: gęsta atmosfera poza HZ (zimna mgła); tu trafiają też lodowe planety z gęstą atmosferą.
      { atmosphere: DENSE, flux: [null, FLUX_HZ_OUTER], priority: 60 },
    ],
    field: { octaves: 5, warp: 0.3, ridge: 0.35, craterDensity: 0.05, seaFromWaterCoverage: false, polarCapBias: 0.6, seaShare: 0.07, polarLow: 0.3, freq: 1.4 },
    biomes: [
      { class: 'methane_lake', terrain: 'ocean', colorRole: 'methaneLake' },
      { class: 'hydrocarbon_dunes', terrain: 'desert', colorRole: 'tholin' },
      { class: 'water_ice_bedrock', terrain: 'ice_sheet', colorRole: 'dirtyIce' },
      { class: 'cryo_highlands', terrain: 'mountains', colorRole: 'blueIce' },
      { class: 'haze_plain', terrain: 'tundra', colorRole: 'tholin' },
    ],
    atmosphere: { tint: '#d9a35a', density: 0.9 }, clouds: { coverage: 0.85 },
    gridClass: 'by_mass',
  },
  {
    id: 'scorched', family: 'planet', nameKey: 'archetype.scorched.name',
    match: [
      // Merkury-like: bez atmosfery przy wysokim strumieniu (albo — pomocniczo — gorąca zapisana temperatura).
      { atmosphere: ['none'], flux: [FLUX_HOT, null], priority: 50 },
      { atmosphere: ['none'], tempC: [SCORCHED_TEMP_MIN_C, null], priority: 50 },
    ],
    field: { octaves: 5, warp: 0.1, ridge: 0.45, craterDensity: 0.55, seaFromWaterCoverage: false, polarCapBias: 0.0, scarps: 1.0, basinChance: 0.5, regional: 0.9, lavaPlains: 1.0, relief: 0.3, tropic: 0.5, freq: 1.3 },
    biomes: [
      { class: 'sunbaked_plain', terrain: 'wasteland', colorRole: 'bakedRock' },
      { class: 'crater_floor', terrain: 'crater', colorRole: 'darkRock' },
      { class: 'lobate_scarp', terrain: 'mountains', colorRole: 'rock' },
      { class: 'glassy_basin', terrain: 'desert', colorRole: 'glass' },
    ],
    ...AIRLESS,
    gridClass: 'by_mass',
  },
  {
    id: 'barren', family: 'planet', nameKey: 'archetype.barren.name',
    match: [
      { atmosphere: ['none'], priority: 30 },   // bezatmosferyczny, słabe światło (Księżyc / Kallisto)
      { priority: 0 },                          // fallback rodziny planet
    ],
    field: { octaves: 5, warp: 0.1, ridge: 0.4, craterDensity: 0.6, seaFromWaterCoverage: false, polarCapBias: 0.2, basinChance: 0.3, regional: 0.95, regionalDepth: 1.0, highlandBoost: 0.35, lavaPlains: 0.7, relief: 0.25, freq: 1.3 },
    biomes: [
      { class: 'regolith_plain', terrain: 'wasteland', colorRole: 'regolith' },
      { class: 'crater_floor', terrain: 'crater', colorRole: 'darkRock' },
      { class: 'crater_rim', terrain: 'mountains', colorRole: 'rock' },
      { class: 'polar_crater_ice', terrain: 'ice_sheet', colorRole: 'ice' },
    ],
    ...AIRLESS,
    gridClass: 'by_mass',
  },
  {
    id: 'tidally_locked', family: 'planet', nameKey: 'archetype.tidally_locked.name',
    match: [
      // Poniżej rodziny oddychalnej i gęstych atmosfer (60+): oddychalny zostaje ziemski (właściciel OK), gęsta
      // atmosfera wyrównuje dzień/noc (hothouse / cryo_haze). Flaga tidallyLocked jest zapisana zawsze.
      { planetType: ROCKY, tidallyLocked: true, atmosphere: ['none', 'thin'], priority: 55 },
    ],
    field: { octaves: 5, warp: 0.25, ridge: 0.45, craterDensity: 0.2, seaFromWaterCoverage: false, polarCapBias: 0.0, freq: 1.4 },
    biomes: [
      { class: 'day_side_scorched', terrain: 'desert', colorRole: 'sand' },
      { class: 'terminator_band', terrain: 'tundra', colorRole: 'tundra' },
      { class: 'night_ice', terrain: 'ice_sheet', colorRole: 'ice' },
      { class: 'substellar_rock', terrain: 'wasteland', colorRole: 'darkRock' },
      { class: 'terminator_sea', terrain: 'ocean', colorRole: 'shallowSea' },     // CS-4a: woda w terminatorze (≈ ½ ziaren)
    ],
    atmosphere: { tint: '#c0a0ff', density: 0.35 }, clouds: { coverage: 0.25 },
    gridClass: 'by_mass',
  },

  // ── Gazowe olbrzymy (D-CS-5) — archetyp tylko ZAPISUJE rodzinę presetu GasGiantShader (bez zmian w v2). ──
  // Progi = progi `resolveTextureType` (PlanetTextureUtils.js): > −73 °C warm, < −193 °C cold, reszta gas_giant.
  // Shader NIE czyta archetypu (wygląd bit w bit jak dziś).
  {
    id: 'gas_warm', family: 'gas', nameKey: 'archetype.gas_warm.name', gasPreset: 'gas_warm',
    match: [{ tempC: [-73, null], priority: 10 }],
    biomes: GAS_BIOMES,
    gridClass: 'gas',
  },
  {
    id: 'gas_temperate', family: 'gas', nameKey: 'archetype.gas_temperate.name', gasPreset: 'gas_giant',
    match: [{ priority: 0 }],   // fallback rodziny gas (też: brak temperatury — jak resolveTextureType)
    biomes: GAS_BIOMES,
    gridClass: 'gas',
  },
  {
    id: 'gas_cold', family: 'gas', nameKey: 'archetype.gas_cold.name', gasPreset: 'gas_cold',
    match: [{ tempC: [null, -193], priority: 10 }],
    biomes: GAS_BIOMES,
    gridClass: 'gas',
  },

  // ── Księżyce (CS-3b-v2: 5 archetypów z moonType + rodzic + strefa wśród księżyców rodzica + atmosfera) ──
  {
    id: 'rocky_cratered', family: 'moon', nameKey: 'archetype.rocky_cratered.name',
    match: [
      { moonType: ['rocky'], priority: 10 },   // Księżyc-like
      { priority: 0 },                         // fallback rodziny moon
    ],
    field: { octaves: 5, warp: 0.1, ridge: 0.35, craterDensity: 0.98, seaFromWaterCoverage: false, polarCapBias: 0.2, maria: 1.0, basinChance: 0.25, regional: 0.5, relief: 0.25, freq: 1.3 },
    biomes: [
      { class: 'highlands', terrain: 'wasteland', colorRole: 'highland' },
      { class: 'maria', terrain: 'wasteland', colorRole: 'mare' },
      { class: 'crater_floor', terrain: 'crater', colorRole: 'darkRock' },
      { class: 'crater_rim', terrain: 'mountains', colorRole: 'rock' },
      { class: 'polar_crater_ice', terrain: 'ice_sheet', colorRole: 'ice' },
    ],
    ...AIRLESS,
    gridClass: 'moon',
  },
  {
    id: 'volcanic_moon', family: 'moon', nameKey: 'archetype.volcanic_moon.name',
    match: [
      // Io-like: skalisty, wewnętrzny księżyc gazowego olbrzyma — grzanie pływowe.
      { moonType: ['rocky'], parentType: ['gas'], moonZone: ['inner'], priority: 40 },
    ],
    field: { octaves: 5, warp: 0.25, ridge: 0.5, craterDensity: 0.0, seaFromWaterCoverage: false, polarCapBias: 0.0, paterae: 0.35, freq: 1.3 },
    biomes: [
      { class: 'sulphur_plain', terrain: 'wasteland', colorRole: 'sulphur' },
      { class: 'lava_lake', terrain: 'volcano', colorRole: 'lava' },
      { class: 'patera', terrain: 'volcano', colorRole: 'darkRock' },
      { class: 'silicate_mountains', terrain: 'mountains', colorRole: 'rock' },
    ],
    atmosphere: { tint: '#e8d070', density: 0.05 }, clouds: { coverage: 0.0 },
    gridClass: 'moon',
  },
  {
    id: 'icy_cracked', family: 'moon', nameKey: 'archetype.icy_cracked.name',
    match: [
      // Europa-like: lodowy, wewnętrzny/środkowy księżyc gazowego olbrzyma (albo wewnętrzny olbrzyma lodowego —
      // Miranda/Ariel) — pęknięta skorupa nad oceanem.
      { moonType: ['icy'], parentType: ['gas'], moonZone: ['inner', 'mid'], priority: 40 },
      { moonType: ['icy'], parentType: ['ice'], moonZone: ['inner'], priority: 40 },
    ],
    field: { octaves: 5, warp: 0.15, ridge: 0.65, craterDensity: 0.05, seaFromWaterCoverage: false, polarCapBias: 1.0, cracks: 1.0, freq: 1.3 },
    biomes: [
      { class: 'ice_plain', terrain: 'ice_sheet', colorRole: 'ice' },
      { class: 'lineae', terrain: 'tundra', colorRole: 'rustLine' },
      { class: 'chaos_terrain', terrain: 'mountains', colorRole: 'blueIce' },
      { class: 'ridged_plain', terrain: 'ice_sheet', colorRole: 'blueIce' },
    ],
    atmosphere: { tint: '#d8ecff', density: 0.03 }, clouds: { coverage: 0.0 },
    gridClass: 'moon',
  },
  {
    id: 'icy_cratered', family: 'moon', nameKey: 'archetype.icy_cratered.name',
    match: [{ moonType: ['icy'], priority: 10 }],   // Kallisto-like (zewnętrzny, stara skorupa)
    field: { octaves: 5, warp: 0.15, ridge: 0.45, craterDensity: 1.19, seaFromWaterCoverage: false, polarCapBias: 1.0, patches: 1.0, regional: 0.7, relief: 0.2, freq: 1.3 },
    biomes: [
      { class: 'ice_plain', terrain: 'ice_sheet', colorRole: 'dirtyIce' },
      { class: 'crater_floor', terrain: 'crater', colorRole: 'dirtyIce' },
      { class: 'crater_rim', terrain: 'mountains', colorRole: 'ice' },
      { class: 'exposed_rock', terrain: 'wasteland', colorRole: 'rock' },
    ],
    atmosphere: { tint: '#d8ecff', density: 0.02 }, clouds: { coverage: 0.0 },
    gridClass: 'moon',
  },
  {
    id: 'hazy_moon', family: 'moon', nameKey: 'archetype.hazy_moon.name',
    match: [
      // Tytan-like: księżyc z atmosferą poniżej zera (temperatura) albo poza HZ (strumień).
      { atmosphere: WITH_ATM, tempC: [null, 0], priority: 50 },
      { atmosphere: WITH_ATM, flux: [null, FLUX_HZ_OUTER], priority: 50 },
    ],
    field: { octaves: 5, warp: 0.3, ridge: 0.35, craterDensity: 0.05, seaFromWaterCoverage: false, polarCapBias: 0.6, seaShare: 0.04, polarLow: 0.3, freq: 1.4 },
    biomes: [
      { class: 'methane_lake', terrain: 'ocean', colorRole: 'methaneLake' },
      { class: 'hydrocarbon_dunes', terrain: 'desert', colorRole: 'tholin' },
      { class: 'water_ice_bedrock', terrain: 'ice_sheet', colorRole: 'dirtyIce' },
      { class: 'haze_plain', terrain: 'tundra', colorRole: 'tholin' },
    ],
    atmosphere: { tint: '#d9a35a', density: 0.8 }, clouds: { coverage: 0.8 },
    gridClass: 'moon',
  },

  // ── Planetoidy — paleta wg zapisanego `planetoidType`; lodowe za pasem Kuipera gry (CS-3b-v2) ──
  {
    id: 'planetoid', family: 'planetoid', nameKey: 'archetype.planetoid.name',
    match: [{ priority: 0 }],
    palettes: {
      metallic:     { base: '#8a8f96', accent: '#c9b27a' },
      carbonaceous: { base: '#3b3633', accent: '#5a4e44' },
      silicate:     { base: '#8c7b68', accent: '#b3a089' },
    },
    field: { octaves: 4, warp: 0.05, ridge: 0.3, craterDensity: 0.8, seaFromWaterCoverage: false, polarCapBias: 0.0, veins: 1.0, relief: 0.4, craterScale: 0.7, craterDepth: 0.16, freq: 1.6 },
    biomes: [
      { class: 'regolith', terrain: 'wasteland', colorRole: 'regolith' },
      { class: 'solid_rock', terrain: 'mountains', colorRole: 'rock' },
      { class: 'metal_vein', terrain: 'crater', colorRole: 'metal' },
      { class: 'crater_floor', terrain: 'crater', colorRole: 'darkRock' },
      { class: 'crater_rim', terrain: 'mountains', colorRole: 'rock' },
    ],
    ...AIRLESS,
    gridClass: 'planetoid',
  },
  {
    id: 'planetoid_icy', family: 'planetoid', nameKey: 'archetype.planetoid_icy.name',
    match: [
      // Za 10× linią mrozu niemetaliczne planetoidy zachowują lód (obiekty pasa Kuipera); metaliczne zostają
      // metaliczne (wygląd zgodny z rozgrywkowym `planetoidType`, który się NIE zmienia).
      { planetoidType: ['carbonaceous', 'silicate'], flux: [null, FLUX_KUIPER], priority: 10 },
    ],
    palettes: {
      icy:          { base: '#c9d6de', accent: '#8a9aa6' },
    },
    field: { octaves: 4, warp: 0.08, ridge: 0.35, craterDensity: 0.7, seaFromWaterCoverage: false, polarCapBias: 0.0, patches: 1.0, relief: 0.4, craterScale: 0.7, craterDepth: 0.16, freq: 1.6 },
    biomes: [
      { class: 'frost_regolith', terrain: 'ice_sheet', colorRole: 'ice' },
      { class: 'dirty_ice', terrain: 'wasteland', colorRole: 'dirtyIce' },
      { class: 'crater_floor', terrain: 'crater', colorRole: 'darkRock' },
      { class: 'crater_rim', terrain: 'mountains', colorRole: 'ice' },
    ],
    ...AIRLESS,
    gridClass: 'planetoid',
  },
]);

/** Archetyp po id (null gdy brak). */
export const ARCHETYPE_BY_ID = Object.freeze(Object.fromEntries(BODY_ARCHETYPES.map(a => [a.id, a])));
