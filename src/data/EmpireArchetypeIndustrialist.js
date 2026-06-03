// EmpireArchetypeIndustrialist — archetyp imperium AI typu "Industrialista"
//
// Slice 1: jedyny archetyp obcych imperiów. Cywilizacja oparta na produkcji
// i handlu — buduje fabryki, gromadzi towary, rozwija się stabilnie. Wektor
// osobowości skłania się ku trade/expansion, niski aggression.
//
// Rich data (poza personality): handicap startowy (budynki, POPy, surowce)
// oraz wagi strategicPriorities dla EmpireStrategicAI (Faza 2).
//
// Plik powiązany: src/data/EmpireData.js eksportuje INDUSTRIALIST w ARCHETYPES
// pod kluczem 'industrialist' (cienki re-export — żeby EmpireRegistry.createEmpire
// znalazł arch.personality / arch.namePL po stringu archetype id).

export const INDUSTRIALIST = {
  id:     'industrialist',
  namePL: 'Industrialista',
  nameEN: 'Industrialist',
  descPL: 'Cywilizacja oparta na produkcji i handlu. Buduje fabryki, ' +
          'gromadzi towary, rozwija się stabilnie.',
  descEN: 'Production and trade focused civilization. Builds factories, ' +
          'stockpiles commodities, grows steadily.',
  color:  '#B07020',  // ciepły amber/copper

  // Wektor osobowości (0-1) — używany przez AI scoring + diplomacy hostility
  personality: {
    aggression: 0.3,
    expansion:  0.7,
    secrecy:    0.2,
    trade:      0.9,
    science:    0.6,
  },

  // Wagi priorytetów strategicznych dla EmpireStrategicAI (Faza 2)
  strategicPriorities: {
    raw_extraction:       1.0,
    commodity_production: 0.9,
    self_sufficiency:     0.8,
    civilian_logistics:   0.7,
    defense:              0.3,
    science:              0.5,
    military_buildup:     0.1,
  },

  // Warstwa C (EmpireStrategySystem) — tunable doktryny kolonizacji AI.
  // Opcjonalny blok: system ma własne DEFAULTS jako fallback per-klucz, więc
  // działa też dla archetypów bez tego pola. Decyzja "minimum wg promptu":
  //   minFoodTransfer/minWaterTransfer pełnią podwójną rolę — próg dostępności
  //   macierzystej ORAZ ilość wysyłana na nową kolonię (bez bufora; macierzysta
  //   może chwilowo spaść ~do zera, odbuduje przed kolejną kolonią).
  strategicColonization: {
    targetXeOutposts:       2,    // ile outpostów Xe zabezpieczyć (P1 + P2)
    targetNtOutposts:       1,    // ile outpostów Nt (Neutronium) — Slice 2 S3, P5
    popTransferSize:        2,    // ile POP wysłać na pełną kolonię (suma ≥ 2)
    minFreePops:            8,    // min freePops macierzystej by uruchomić full-colony path
    minFoodTransfer:        200,  // próg = transfer food (bootstrap wymaga ≥ 200)
    minWaterTransfer:       200,  // próg = transfer water
    blacklistDurationCy:    30,   // jak długo ciało-cel na blackliście po failure
    requireBreathableForP3: true, // P3 wymaga atmosfery oddychalnej (fallback nie)
    // S3.1b — ekspansja cross-system. Industrialist zostaje JEDNO-systemowy:
    maxExtraSystems:                0,  // ile systemów POZA macierzystym wolno kolonizować (0 = home-locked)
    minExtraHomeColoniesForExpansion: 2,  // ile DODATKOWYCH pełnych kolonii z POP w home (poza stolicą)
                                          //   musi mieć imperium, zanim odblokuje ekspansję cross-system
  },

  // Warstwa 2 transportu (EmpireLogisticsSystem) — Slice 2 S3. Kurierzy krążą
  // outpost↔stolica wożąc surowce strategiczne (Xe/Nt). ROUTE-BASED: każdy outpost
  // dostaje dedykowanych kurierów (couriersPerRoute), krążących póki route żyje.
  //   couriersPerRoute     — ile statków na trasę (2 dywersyfikuje load + redundancja)
  //   cargoModule          — moduł ładowni (cargo_small = +200t, bez tech-gate)
  //   minFreePopsForCourier— min wolnych POP stolicy by zbudować kuriera (hull_small crewCost 0.05)
  //   strategicDeposits    — które surowce traktujemy jako "strategiczne" (trasa dla outpostu z tym złożem)
  logisticsConfig: {
    couriersPerRoute:      2,
    cargoModule:           'cargo_small',
    minFreePopsForCourier: 0.05,
    strategicDeposits:     ['Xe', 'Nt'],
  },

  // Handicap startowy — budynki stawiane instant (bez kosztu surowców i tech)
  // przez EmpireColonyBootstrap via BuildingSystem.autoPlaceBuilding.
  // preferredTerrain to scoring hint dla autoPlaceBuilding (Faza 0 Issue #1).
  //
  // Skala dopasowana do startowej populacji gracza (~4 POP). Lekki handicap
  // AI = 6 POP + 16 budynków startowych (+50% POP vs gracz, zgodnie z planem Slice 1).
  //
  // Bilans dla 6 POP (consumption per POP/year: food 3.0, water 1.5, energy 1.0):
  //   food   need 18/y → 2 farm × 10 × ~1.2 yieldBonus = ~24/y  → buffer +6
  //   water  need  9/y → 2 well × 6                = 12/y       → buffer +3
  //   energy need  6/y POP + ~10/y budynki ≈ 16/y → 6 solar × 8 = 48/y → buffer +32
  //   Fe     wydobycie z REALNYCH deposits (SystemGenerator zapewnia Fe~125k)
  //   housing colony_base(4) + habitat(3) = 7 → POP 6 mieści się z buforem na wzrost
  //
  // Solar count zwiększony z 2 → 6 (patch v3 Fix 1 opcja c): zamiast upgrade'ować
  // 2 solar do lvl 3, używamy 6 solar lvl 1 (taka sama suma produkcji, prostsze API,
  // unika fake-upgrade bug i kompleksowości BuildingSystem._applyUpgrade).
  //
  // Uwagi:
  //   - latitude variance (biegunowe hexy ×0.5) NIE wymaga buforu — smart placer
  //     w EmpireColonyBootstrap stawia poza biegunami (patch v3 Fix 3)
  startingBuildings: [
    { buildingId: 'colony_base', count: 1 },
    { buildingId: 'habitat',     count: 1 },
    { buildingId: 'launch_pad',  count: 1 },
    { buildingId: 'shipyard',    count: 1 },                                            // istnieje, ale w Slice 1 nie produkuje
    { buildingId: 'factory',     count: 1 },                                            // reaktywna, działa via safety stock
    { buildingId: 'mine',        count: 1, preferredTerrain: ['mountains', 'crater'] },
    { buildingId: 'farm',        count: 2, preferredTerrain: ['plains', 'forest'] },
    { buildingId: 'well',        count: 2, preferredTerrain: ['water', 'ice'] },
    { buildingId: 'solar_farm',  count: 6, preferredTerrain: ['desert', 'plains'] },
    { buildingId: 'research_station', count: 1 },                                       // S3.2 S2: gate produkcji research (model badań AI)
  ],

  // Startowa populacja — rozkład per strata (suma 6 POP — lekki handicap vs gracz ~4)
  startingPops: {
    laborer:    3,
    worker:     1,
    scientist:  1,
    merchant:   1,
  },

  // Startowe technologie — odblokowane "od razu", jakby imperium je już zbadało.
  // Parytet z conductem gracza (reguła #8 scenariusza nagrań): gracz startuje z
  //   Automatyzacją, Kartografią Orbitalną, Rakietnictwem, Eksploracją i
  //   Obliczeniami Cyfrowymi, a pierwszą akcją (przed startem czasu) odkrywa
  //   Metalurgię. AI nie może "kliknąć przed startem", więc bootstrap daje mu te
  //   same techy + Metalurgię od razu.
  // Identyfikatory z TechData.js (klucze EN), NIE namePL.
  // Metalurgia odblokowuje fabryki (factory.requires === 'metallurgy') — bez niej
  //   AutoExpander pętlił się w nieskończoność na "build factory" (silent fail).
  // Bootstrap czyta to pole i seeduje osobny per-imperium TechSystem (izolacja od
  //   drzewa tech gracza). Inne archetypy: dopisać własną listę.
  startingTechs: [
    'automation',        // Automatyzacja
    'orbital_survey',    // Kartografia Orbitalna
    'rocketry',          // Rakietnictwo
    'exploration',       // Eksploracja
    'basic_computing',   // Obliczenia Cyfrowe
    'metallurgy',        // Metalurgia — odblokowuje fabryki
    'robotics',          // Robotyka — odblokowuje recepturę android_worker (wymaga metallurgy).
                         //   Bez tego AI nigdy nie produkuje androidów → P1/P2 (outposty Xe)
                         //   martwe (autonomous_solar/mine wymagają android_worker). Slice 2 S2 fix.
  ],

  // S3.2 S2 — kolejka badań (EmpireResearchSystem). Techy badane W CZASIE z research
  // stolicy (gate: research_station). System pomija techy już w startingTechs.
  // Ścieżka przemysłowa: data_networks → energia jądrowa → materiały → androidy.
  //   advanced_materials (req metallurgy ✓) → android_engineering (req robotics ✓ +
  //   advanced_materials) odblokowuje android_lab + android_worker (autonomiczna siła).
  // efficient_solar wstawione jako prereq nuclear_power (root tech, spoza startingTechs).
  researchQueue: [
    'data_networks',         // Sieci Danych (req basic_computing ✓)
    'efficient_solar',       // Wydajne Panele (prereq nuclear_power)
    'nuclear_power',         // Energetyka Jądrowa (req efficient_solar)
    'advanced_materials',    // Zaawansowane Materiały (req metallurgy ✓)
    'android_engineering',   // Inżynieria Androidów (req robotics ✓ + advanced_materials)
  ],

  // Startowe surowce — deponowane do colony.resourceSystem.inventory.
  // Bufor food/water powiększony do 250 — daje ~8 civYears zapasu na 6 POP
  // (przed pierwszą produkcją + buffer na latitude variance budynków).
  // Xe (Ksenon) 1000 — surowiec wejściowy dla układów półprzewodnikowych
  //   (semiconductor_arrays, target od gameYear_20). Bez Xe na starcie AI siedzi
  //   z pełnym inwentarzem (Fe/Si/Cu) i nie produkuje dóbr T2 — brak go w realnych
  //   deposits planety home. Wartość heurystyczna (test); skala vs startowe Fe=200.
  startingResources: {
    C:       200,
    Fe:      200,
    Si:      100,
    Cu:      80,
    Xe:      1000,
    food:    250,
    water:   250,
    credits: 1000,  // uwaga: credits to NIE resource — bootstrap przeniesie do colony.credits
  },

  // Startowe safety stock targety (efektywny target = bonus + base wg tieru)
  // FactorySystem.getSafetyStockTarget: tier 1-2 → base 3, tier 3-5 → base 1.
  // Wszystkie commodities poniżej to tier 1 (CommoditiesData), więc:
  //   target X → bonus = X - 3 (bonus aplikowany przez fs.setDemandBonus)
  //
  // Patch v3 Fix 4: dodane consumer goods (basic_supplies, civilian_goods).
  // Bez nich factory reactive nie produkuje gdy POP demand rośnie — observed
  // deficyt 3.1/1 w panelu factory dla Thuban b.
  startingSafetyStocks: {
    // Komponenty produkcyjne (na potrzeby budownictwa / upgrade'ów)
    structural_alloys:  30,
    polymer_composites: 20,
    conductor_bundles:  20,
    extraction_systems: 15,

    // Consumer goods — POP demand. Target 10 = ~2 lata bufora przy 6 POP × ~0.5/y demand
    basic_supplies:     10,   // Zaopatrzenie Bytowe (consumptionLayer: functioning)
    civilian_goods:     10,   // Dobra Cywilizacyjne (consumptionLayer: comfort)
  },
};
