// ═══════════════════════════════════════════════════════════════
// INDUSTRIALIST TARGETS — target states dla Warstwy B AI (ColonyAutoExpander)
// ───────────────────────────────────────────────────────────────
// Replay-driven design: liczby wyciągnięte z NAGRANIA gracza grającego
// konsekwentnie jako Industrialist (partia 1, recorder Opcja B, commit eb823b3).
//
// Źródło: opening-2026-05-25T11-21-47.json (162 akcji, 100 snapshotów,
//   dotarło do gameYear 41.05 / civYear 492).
// Kolonia referencyjna: "Nowa Ziemia" (entity_2, isHomePlanet) — główna kolonia gracza.
//
// FILOZOFIA: targets = surowe dane z nagrania partii 1 + 2 korekty świadomych
// błędów strukturalnych gracza:
//   1. colonies_count gy20: 1 zamiast 2 (gracz kolonizował przedwcześnie w gy12)
//   2. research_station: zostaje 1 z upgrade'ami (gracz błędnie rozebrał między gy10-gy20)
//
// Prosperity NIE jest celem samym w sobie — to konsekwencja consumer goods coverage.
// AI ma produkować 3 consumer goods on demand, prosperity wyjdzie samo. Wartości
// prosperity w targets pochodzą z nagrania i służą jako orientacja, nie cel.
//
// ⚠️ TO TYLKO 1 PARTIA. Brief zakładał mediany z 2-3 partii, ale user
//    zdecydował: jedziemy z 1 partią + korekty obserwując AI w grze.
//    Wartości = surowe odczyty ze snapshotów (NIE mediany) + 2 korekty wyżej.
//    Anomalie oznaczone `// ⚠ KOREKTA:` do ręcznej rewizji.
//
// Checkpointy: 1 gameYear = 12 civYears.
//   gameYear_10 = civYear 120 | gy20 = cy240 | gy30 = cy360 | gy40 = cy480
//
// Jednostki/uwagi do liczb:
// - `count` — DOKŁADNY (z coloniesList[].buildingsByCategory.byId).
// - `avgLevel` — totalLevels/count na poziomie KATEGORII (Snapshot nie agreguje
//   totalLevels per-budynek). Dla kategorii jednorodnych (energy=solar_farm,
//   space=shipyard) jest dokładny; dla mieszanych (food=farm+well,
//   mining=launch_pad+factory+mine+smelter) to BLEND — oznaczone `/* blend */`.
// - `safetyStocks` — z factorySystem.demandBonus (BONUS ponad bazę; tryb reactive
//   ustawia go automatycznie wg konsumpcji, więc to nie czysto ręczny safety stock).
// - `vessels_total` — bez rozbicia per typ (vessels.byType pusty — known bug Opcji B).
//
// ⚠ LUKA DANYCH (do hotfixu Snapshot.js): POZIOMY per-budynek NIE są zapisywane
//   — tylko totalLevels per-kategoria. factory avgLevel poniżej = Z RELACJI GRACZA
//   (4×L5=20 pkt produkcji), nie z nagrania. Po hotfixie wyciągniemy realny per-id.
//
// Housing na macierzystej NIE jest rozwijany ŚWIADOMIE (atmosfera oddychalna →
//   housing zbędny). To nie anomalia. Stąd housing=8 stałe mimo pop→62.
// ═══════════════════════════════════════════════════════════════

export const INDUSTRIALIST_TARGETS = {
  // ── gameYear 10 (civYear 120) ──────────────────────────────────
  gameYear_10: {
    colonies_count: 1,  // Pole orientacyjne; AutoExpander to ignoruje, kolonizacja należy do EconAI/Warstwy C

    pop: 21,
    prosperity: 91,
    housing: 8,                 // świadomie stałe całą grę (atmosfera oddychalna → housing zbędny)
    buildings: {
      farm:             { count: 2, avgLevel: 2.5 /* blend food */ },
      well:             { count: 2, avgLevel: 2.5 /* blend food */ },
      solar_farm:       { count: 5, avgLevel: 2.2 },
      habitat:          { count: 1, avgLevel: 1.0 },
      colony_base:      { count: 1, avgLevel: 1.0 },
      launch_pad:       { count: 1, avgLevel: 3.5 /* blend mining */ },
      factory:          { count: 3, avgLevel: 3.5 /* blend mining */ },
      mine:             { count: 2, avgLevel: 3.5 /* blend mining */ },
      shipyard:         { count: 1, avgLevel: 2.0 },
      research_station: { count: 1, avgLevel: 1.0 },
      observatory:      { count: 1, avgLevel: 1.0 },
    },
    safetyStocks: {             // demandBonus — równo 7 na wszystkich (target ≈ baza+7)
      structural_alloys: 7, polymer_composites: 7, conductor_bundles: 7,
      extraction_systems: 7, power_cells: 7, electronic_systems: 7,
      basic_supplies: 7, civilian_goods: 7,
    },
    vessels_total: 5,
  },

  // ── gameYear 20 (civYear 240) ──────────────────────────────────
  gameYear_20: {
    // KOREKTA #1: 1 zamiast obserwowanych 2 — Industrialist konsoliduje home do gy20
    //   (gracz w nagraniu kolonizował przedwcześnie w gy12.6, target tego nie odtwarza).
    colonies_count: 1,  // Pole orientacyjne; AutoExpander to ignoruje, kolonizacja należy do EconAI/Warstwy C

    pop: 36,
    prosperity: 90,
    housing: 8,                 // świadomie stałe (atmosfera oddychalna)
    buildings: {
      farm:        { count: 2, avgLevel: 3.0 /* blend food */ },
      well:        { count: 2, avgLevel: 3.0 /* blend food */ },
      solar_farm:  { count: 5, avgLevel: 2.6 },
      habitat:     { count: 1, avgLevel: 1.0 },
      colony_base: { count: 1, avgLevel: 1.0 },
      launch_pad:  { count: 1, avgLevel: 3.0 /* reszta mining: (32−4×L5)/4 ≈ 3 */ },
      factory:     { count: 4, avgLevel: 2.5 /* z relacji gracza: w gy40 było 4×L5, w gy20 ~połowa tego; Snapshot nie ma per-id */ },
      mine:        { count: 2, avgLevel: 3.0 /* reszta mining ≈ 3 */ },
      smelter:     { count: 1, avgLevel: 3.0 /* reszta mining ≈ 3 */ },
      shipyard:    { count: 1, avgLevel: 2.0 },
      // KOREKTA #2: Industrialist NIE rozbiera research_station. Gracz w nagraniu partii 1
      //   rozebrał (research per year spadło do 0) — to błąd strukturalny, target tego nie odtwarza.
      research_station: { count: 1, avgLevel: 2.0 },
      observatory: { count: 1, avgLevel: 3.0 },
    },
    safetyStocks: {             // materiały ↑17, dobra konsumpcyjne wciąż 7 + nowe T2/T3
      structural_alloys: 17, polymer_composites: 17, conductor_bundles: 17,
      extraction_systems: 17, power_cells: 17, electronic_systems: 17,
      basic_supplies: 7, civilian_goods: 7,
      semiconductor_arrays: 9, propulsion_systems: 4, android_worker: 9,
      pressure_modules: 7,
    },
    vessels_total: 4,
  },

  // ── gameYear 30 (civYear 360) ──────────────────────────────────
  gameYear_30: {
    colonies_count: 2,  // Pole orientacyjne; AutoExpander to ignoruje, kolonizacja należy do EconAI/Warstwy C

    pop: 47,
    prosperity: 84,             // z nagrania (orientacja, nie cel — patrz FILOZOFIA)
    housing: 8,                 // świadomie stałe (atmosfera oddychalna)
    buildings: {
      // identyczna struktura jak gy40 — rozbudowa domu zatrzymała się ~gy20
      farm:        { count: 2, avgLevel: 2.6 /* blend food */ },
      well:        { count: 3, avgLevel: 2.6 /* blend food */ },
      solar_farm:  { count: 5, avgLevel: 2.6 },
      habitat:     { count: 1, avgLevel: 1.0 },
      colony_base: { count: 1, avgLevel: 1.0 },
      launch_pad:  { count: 1, avgLevel: 3.0 /* reszta mining ≈ 3 */ },
      factory:     { count: 4, avgLevel: 5.0 /* z relacji gracza, 4×L5=20 pkt */ },
      mine:        { count: 2, avgLevel: 3.0 /* reszta mining ≈ 3 */ },
      smelter:     { count: 1, avgLevel: 3.0 /* reszta mining ≈ 3 */ },
      shipyard:    { count: 1, avgLevel: 2.0 },
      research_station: { count: 1, avgLevel: 3.0 },  // KOREKTA #2: nie rozebrany, upgrade'owany
      observatory: { count: 1, avgLevel: 3.0 },
    },
    safetyStocks: {             // materiały ↑27, dobra ↑27, neurostimulants 27
      structural_alloys: 27, polymer_composites: 27, conductor_bundles: 27,
      extraction_systems: 27, power_cells: 17, electronic_systems: 27,
      basic_supplies: 27, civilian_goods: 27,
      semiconductor_arrays: 19, propulsion_systems: 4, android_worker: 19,
      pressure_modules: 7, reactive_armor: 7, neurostimulants: 27,
    },
    vessels_total: 6,
  },

  // ── gameYear 40 (civYear 480) ──────────────────────────────────
  gameYear_40: {
    colonies_count: 2,          // 2–3 (w nagraniu 2: Nowa Ziemia + Xe; „new moon" to outpost pop=0)
    //   Pole orientacyjne; AutoExpander to ignoruje, kolonizacja należy do EconAI/Warstwy C
    pop: 62,
    prosperity: 68,             // z nagrania (orientacja, nie cel — patrz FILOZOFIA)
    housing: 8,                 // świadomie stałe (atmosfera oddychalna)
    buildings: {
      farm:        { count: 2, avgLevel: 2.6 /* blend food */ },
      well:        { count: 3, avgLevel: 2.6 /* blend food */ },
      solar_farm:  { count: 5, avgLevel: 2.6 },
      habitat:     { count: 1, avgLevel: 1.0 },
      colony_base: { count: 1, avgLevel: 1.0 },
      launch_pad:  { count: 1, avgLevel: 3.0 /* reszta mining ≈ 3 */ },
      factory:     { count: 4, avgLevel: 5.0 /* z relacji gracza, 4×L5=20 pkt */ },
      mine:        { count: 2, avgLevel: 3.0 /* reszta mining ≈ 3 */ },
      smelter:     { count: 1, avgLevel: 3.0 /* reszta mining ≈ 3 */ },
      shipyard:    { count: 1, avgLevel: 2.0 },
      research_station: { count: 1, avgLevel: 3.0 },  // KOREKTA #2: nie rozebrany, upgrade'owany
      observatory: { count: 1, avgLevel: 3.0 },
    },
    safetyStocks: {
      // structural_alloys 127 = świadomy stock pod założenie autonomicznego portu
      //   kosmicznego na nowej kolonii (~130 wymagane). NIE korygować.
      // electronic_systems / reactive_armor 57 — pochodne stock, do weryfikacji
      //   w kolejnych partiach (możliwy burst, możliwy świadomy zapas).
      structural_alloys: 127, polymer_composites: 27, conductor_bundles: 27,
      extraction_systems: 27, power_cells: 17, electronic_systems: 57,
      basic_supplies: 27, civilian_goods: 27,
      semiconductor_arrays: 19, propulsion_systems: 4, android_worker: 19,
      pressure_modules: 7, reactive_armor: 57, neurostimulants: 27,
    },
    vessels_total: 6,
  },
};

// ═══════════════════════════════════════════════════════════════
// SURVIVAL THRESHOLDS — minimalne progi przeżycia kolonii.
// ───────────────────────────────────────────────────────────────
// ⚠ "DO POTWIERDZENIA" — z 1 partii nie da się wyznaczyć twardych minimów
//    (potrzeba min z wielu partii / przypadków bliskich załamania). Poniżej
//    HEURYSTYKA wsparta obserwacjami z partii 1. Korygować po kolejnych sesjach.
// ═══════════════════════════════════════════════════════════════
export const INDUSTRIALIST_SURVIVAL_THRESHOLDS = {
  // Konsumpcja organics ≈ 3.0/pop/civYear (CLAUDE.md). Bufor 1 civYear zapasu.
  // do potwierdzenia — partia 1 nigdy nie zagłodziła głównej kolonii.
  food_min_per_pop: 3.0,

  // ⚠ housing ZALEŻY OD ATMOSFERY: na planecie z oddychalną atmosferą housing
  //   jest zbędny (Nowa Ziemia: pop 62 @ housing 8, świadomie). Próg poniżej
  //   stosować TYLKO dla kolonii bez oddychalnej atmosfery. do potwierdzenia.
  housing_min_ratio_no_atmosphere: 0.5,

  // Energia: w partii 1 bilans był zawsze dodatni (brownout=false). Próg = nie
  //   schodzić poniżej 0 bilansu. do potwierdzenia.
  energy_balance_min: 0,

  // Prosperity poniżej tego progu = sygnał alarmowy dla AI: zwiększ pokrycie
  //   consumer goods (basic_supplies, civilian_goods, neurostimulants) — to główna
  //   dźwignia prosperity. Heurystyka z partii 1. do potwierdzenia.
  prosperity_alarm: 70,
};

export default INDUSTRIALIST_TARGETS;
