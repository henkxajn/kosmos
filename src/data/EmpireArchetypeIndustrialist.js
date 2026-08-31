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
    // ⚠ 215 (D-215-1c, PODPISANE po krzywej pomiarowej): 8 → 4. `8` powstało w Population 2.0
    //   Fazie 1 jako ×4 dawnego `2` — ale populacja matki AI nigdy nie urosła do tej skali
    //   (3-8 POP), więc transfer 8 był ~CAŁĄ kolonią. ZMIERZONE (3 seedy × 100 gy, rezerwa 4):
    //     transfer 8 → 1,0 koloni/100 gy, matka 10,8 robotnika / 23,7 POP
    //     transfer 4 → 3,7 koloni/100 gy, matka 13,1 / 35,0, placówki 4,0 (bez kanibalizacji)
    //     transfer 2 → 5,3 koloni, ale MEDIANA POP KOLONII = 2 (jednostki bezwładne)
    //   4 wygrywa na KAŻDEJ mierzonej osi wobec 8 i daje kolonię o użytecznym rozmiarze.
    //   ⚠ NIE podpisane na przeżywalności — ta była w tym środowisku bliska JAŁOWEJ (nic nie
    //     zabija koloni solo headless); patrz Finding 216 i `AI_POP_GATES_PLAN.md` §2.2.
    popTransferSize:        4,
    minFoodTransfer:        200,  // próg = transfer food (bootstrap wymaga ≥ 200)
    minWaterTransfer:       200,  // próg = transfer water
    blacklistDurationCy:    30,   // jak długo ciało-cel na blackliście po failure
    requireBreathableForP3: true, // P3 wymaga atmosfery oddychalnej (fallback nie)
    // S3.3a v2 — eksperyment: Industrialist DOSTAJE cross-system (przejmuje rolę po shelved Expansionist).
    maxExtraSystems:                2,  // ile systemów POZA macierzystym wolno kolonizować (było 0 = home-locked)
    minExtraHomeColoniesForExpansion: 2,  // ile DODATKOWYCH pełnych kolonii z POP w home (poza stolicą)
                                          //   musi mieć imperium, zanim odblokuje ekspansję cross-system
  },

  // Warstwa 2 transportu (EmpireLogisticsSystem) — Slice 2 S3. Kurierzy krążą
  // outpost↔stolica wożąc surowce strategiczne (Xe/Nt). ROUTE-BASED: każdy outpost
  // dostaje dedykowanych kurierów (couriersPerRoute), krążących póki route żyje.
  //   couriersPerRoute     — ile statków na trasę (2 dywersyfikuje load + redundancja)
  //   cargoModule          — moduł ładowni (cargo_small = +200t, bez tech-gate)
  //   strategicDeposits    — które surowce traktujemy jako "strategiczne" (trasa dla outpostu z tym złożem)
  // ⚠ 215 (D-215-3): `minFreePops` i `minFreePopsForCourier` USUNIĘTE razem z czytelnikami.
  //   Oba były progami NIEOSIĄGALNYMI — `freePops` u AI klamruje się do 0 na stałe. Drugi był
  //   dodatkowo skalibrowany do crewCost SPRZED Population 2.0: komentarz mówił „crewCost 0.05",
  //   a `hull_small.crewCost` wynosi dziś **0.2** (×4 z Fazy 1). Bramka żądała więc CZTERY RAZY
  //   mniej, niż akcja realnie kosztuje — i tak nigdy nie przechodziła.
  logisticsConfig: {
    couriersPerRoute:      2,
    cargoModule:           'cargo_small',
    strategicDeposits:     ['Xe', 'Nt', 'Ti'],   // S3.3b-S1: Ti strategiczny (Expansionist dziedziczy przez clone)
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
    { buildingId: 'research_station', count: 2 },                                       // S3.2 S2: gate produkcji research (model badań AI)
  ],

  // Startowa populacja — rozkład per strata (suma 24 POP).
  // ⚠ BALANS Phase 3 / eksperyment #1 — PARYTET z redenominacją Population 2.0.
  //   Population 2.0 Faza 1 przedefiniowała jednostkę POP: WSZYSTKIE liczności per strata
  //   ×4 (`SaveMigration._migrateV95toV96`: `S = 4`, `strata[*].count *= S`), a etaty
  //   budynków przeszły na `jobs = popCost × 4`. W tym pliku przeskalowano wtedy JEDNO pole
  //   (`popTransferSize` 2→8, commit bc87846) — `startingPops` zostało w starej jednostce.
  //   Skutek zmierzony w slice AI (docs/BALANS_PHASE2_AI.md): imperium startowało z 19
  //   etatami na 6 POP (32% obsady), gdy gracz ma 10 etatów na 16 POP (160%) — 18 darmowych
  //   budynków startowych, czyli PRZEWAGA z projektu, stawało się nieobsadzalnym balastem.
  //   Tu stosujemy TĘ SAMĄ regułę migracji per strata (×4), nie wartość dobraną „na oko":
  //     laborer 3→12 · worker 1→4 · scientist 1→4 · merchant 1→4  (suma 6→24)
  //   Housing startowy (colony_base 16 + habitat 12 + launch_pad 4 = 32) mieści 24 POP,
  //   więc wzrost logistyczny zachowuje zapas — kolonia nie startuje w capie.
  //   EXPANSIONIST dziedziczy to przez `structuredClone(INDUSTRIALIST)`.
  startingPops: {
    laborer:    12,
    worker:     4,
    scientist:  4,
    merchant:   4,
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
    // ── Director S4 / orzeczenie właścicielskie R-3 ──────────────────────────
    // Bez `point_defense` łańcuch nacisku militarnego nie dowozi ANI JEDNEGO okrętu:
    // tech bramkuje JEDNOCZEŚNIE wszystkie trzy kadłuby wojenne (hull_frigate/destroyer/
    // cruiser) I **każdy moduł broni w grze**. Zmierzone przed wpisem: `point_defense`
    // nie występował w żadnym archetypie ani w żadnej kolejce badań (0 trafień), a
    // `EmpireResearchSystem` nie potrafi przyznać techu spoza kolejki — więc bramka bez
    // trasy była cichym no-opem klasy R12: reguła „odpalałaby" i nie robiła nic.
    // Przyznanie z góry jest spójne z filozofią fory startowej AI (darmowe budynki,
    // darmowe techy, teraz stacja-żeton), a NIE z symulacją wyboru badawczego.
    // ⚠ REJESTR: gdy WAR_BACKBONE da AI realną ekonomię badań, przeniesienie
    // `point_defense` z powrotem do `researchQueue` JAKO WYBORU można rozważyć ponownie —
    // dziś taki wybór byłby fikcją, bo AI nie ma czym go dokonać.
    'basic_shielding',   // Osłony Radiacyjne — jedyny prereq point_defense (tier 1, requires []).
                         //   `grantTechs` omija prereqy, ale drzewo bez niego byłoby wewnętrznie
                         //   niespójne (checkPrerequisites w innych ścieżkach widziałby dziurę).
    'point_defense',     // Obrona Punktowa — kadłuby wojenne + KAŻDY moduł broni.
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
    // S3.3a v2 — ścieżka warp (bramka cross-system: EmpireStrategySystem.canCross → hasWarp).
    //   Prereqy spełnione przez wcześniejsze ogniwa: rocketry✓(starting)→ion_drives;
    //   nuclear_power✓(idx2)+data_networks✓(idx0)→quantum_physics; ion_drives+quantum_physics→
    //   warp_theory (miękkie bramki requiresDiscovery/requiresInventory POMINIĘTE przez grantTechs);
    //   warp_theory→warp_drive (+3150 research: 250+500+900+1500 ponad obecną kolejkę).
    'ion_drives',            // Napędy Jonowe Volkov (req rocketry ✓)
    'quantum_physics',       // Fizyka Kwantowa (req nuclear_power ✓ + data_networks ✓)
    'warp_theory',           // Teoria Osnowy (req ion_drives + quantum_physics)
    'warp_drive',            // Napęd Skokowy (req warp_theory) — odblokowuje hasWarp
    // ── W2-1: łańcuch TOWARÓW WOJENNYCH (WOJNA I POKÓJ 1.0, workstream B) ────────
    // PO CO: `metamaterials` (requiresTech `exotic_materials`) siedzi w `commodityCost`
    // modułu `armor_heavy`, a ten jest w KAŻDYM z trzech szablonów okrętów wojennych
    // (ShipTemplateData). Bez tego techu żadne imperium AI nie kończy ŻADNEGO okrętu:
    // resolver moduł WYBIERA (jego `requires` to `point_defense`, nie `exotic_materials`),
    // więc zlecenie nie pada głośno — po cichu parkuje w `pendingShipOrders` aż zmiecie
    // je TTL Directora. Zmierzone wykonaniem, audyt W2 §C-5.
    // ⚠ DOKLEJONE NA KOŃCU, nie wstawione przed blok warp — świadomie. Przesunięcie
    //   `warp_*` w dół opóźniłoby ekspansję cross-system, a oś czasu ekspansji AI jest
    //   PRZESŁANKĄ ponownego pomiaru R-2 (`WAR_BACKBONE` §6 HANDOVER). Towary wojenne
    //   przychodzą więc PÓŹNO — i to jest cena, którą świadomie płacimy za nietykanie
    //   liczby, na której stoi inny otwarty pomiar.
    'advanced_mining',       // Zaawansowane Górnictwo (root, requires []) — prereq deep_drilling
    'deep_drilling',         // Głębokie Wiercenia (req advanced_mining)
    'space_mining',          // Górnictwo Kosmiczne (req rocketry ✓ + deep_drilling)
    'exotic_materials',      // Materiały Egzotyczne (req advanced_materials ✓ idx3 + space_mining)
                             //   → odblokowuje recepturę `metamaterials` (Ti 6, Hv 5, Xe 2, Si 4)
    // Finding 181 / plan AI_FUSION_BRANCH §3 (podpisany 2026-08-28) — galaz fuzji.
    // Odblokowuje antimatter_cells, a przez nie warp_cores: warp_cores = quantum_cores +
    // antimatter_cells + Ti, wiec BEZ tej galezi byly dla Industrialisty nieosiagalne MIMO
    // posiadania ion_drives i warp_drive. To ta sama para, ktora Ekspansjonista ma od S3.2 —
    // wyrownanie archetypow, nie nowy stan.
    // F2 — NA KONCU kolejki SWIADOMIE: 600 rp to ~1,5 gy przy tempie ~413 rp/gy (ZMIERZONE:
    // cala kolejka domyka sie w 10 gy). Wstawka wczesniej przesunelaby warp_drive, czyli tech
    // krytyczny dla ekspansji cross-system. Fuzja przychodzi ok. 11,5 gy przy partii 45-60+ gy.
    'plasma_physics',        // 200 rp — JEDYNY brakujacy prereq fusion_power (req efficient_solar ✓ poz. 2)
    'fusion_power',          // 400 rp — req nuclear_power ✓ (poz. 3) + plasma_physics ⬆
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
    // Finding 182 (podpisany 2026-08-28, plan AI_SAFETY_STOCK_PLAN §3 D2/D4/D5):
    // cel zapasu dla tier 3+ = 50. Bez tego getSafetyStockTarget zwraca dla nich 1 SZTUKE,
    // na piatym z szesciu priorytetow (DEFAULT_REACTIVE_ORDER), wiec towary, ktore AI umie
    // zrobic i ma z czego, nie wchodza do produkcji nigdy.
    // D4 — LISTA FILTROWANA PO OSIAGALNOSCI TEGO archetypu; nie dopisujemy tu:
    //   (brak) — lista D4 nie wyklucza juz NICZEGO dla tego archetypu.
    // ⚠ metamaterials byly tu wykluczone jako „exotic_materials poza planem" — to bylo BLEDNE.
    //   exotic_materials JEST w researchQueue (dodane przez W2-1 pod lancuch towarow wojennych,
    //   zbadane ok. 12 gy). Blad wzial sie z wady narzedzia odczytu, nie z pliku: nie-zachlanny
    //   regex kolejki zatrzymywal sie na `]` wewnatrz komentarza „(root, requires [])", gubiac
    //   trzy ostatnie pozycje. Wniosek na przyszlosc: liste kolejki czytac WYKONANIEM
    //   (import ARCHETYPES), nie regexem po zrodle.
    // ⚠ antimatter_cells i warp_cores BYLY tu wykluczone jako nieosiagalne; galaz fuzji (wyzej,
    //   plan AI_FUSION_BRANCH F1/F2) usunela powod wykluczenia, wiec wracaja — F3 nakazuje zrobic
    //   to w TYM SAMYM commicie, inaczej odblokowalibysmy zdolnosc i zostawili cel zapasu na
    //   1 sztuce, czyli powtorzyli Finding 182 na swiezej galezi.
    // Zamawianie tego, czego archetyp nie umie dokonczyc, generuje stalle missing_ingredient
    // — ZMIERZONE (0-1 -> 1-4) w wariancie bez tego filtra.
    plasma_cores:         50,
    quantum_cores:        50,
    quantum_processors:   50,
    semiconductor_arrays: 50,
    propulsion_systems:   50,
    antimatter_cells:     50,   // F3 — odblokowane galezia fuzji
    warp_cores:           50,   // F3 — oba polprodukty juz osiagalne
    metamaterials:        50,   // osiagalne przez exotic_materials (W2-1) — korekta bledu D4
  },
};
