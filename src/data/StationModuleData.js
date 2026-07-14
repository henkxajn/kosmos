// StationModuleData — definicje modułów stacji orbitalnych (S3.4 FAZA 1).
// Oddzielone od logiki (jak BuildingsData/StationData). WSZYSTKIE wartości balansu żyją TU —
// logika (StationSystem._tick w FAZIE 2) czyta tylko te pola, zero magic numbers w kodzie.
//
// Instancja modułu na encji stacji (Station.modules[]) ma kształt: { id, moduleType, level, active }
//   moduleType === klucz w STATION_MODULES (poniżej).
//
// Konwencje pól definicji:
//   cost / commodityCost   — surowce bazowe / towary do budowy (spend z depotu stacji, FAZA 2)
//   buildTime              — czas budowy w LATACH CYWILIZACYJNYCH (advance civDeltaYears — spójnie z
//                            BuildingsData i ColonyManager._tickShipBuilds; 1 civrok ≈ 30.4 dnia gry
//                            @CIV_TIME_SCALE=12, tj. ~30s real @1d/s). Komentarz = ~dni gry.
//   energy                 — bilans energii modułu: +produkuje / -pobiera (FAZA 2 bilans energii)
//   popWork                — POP potrzebne do obsługi modułu (FAZA 2 bilans pracy; 0 = autonomiczny)
//   maxLevel               — maks. poziom (tylko trade_module >1; upgrade w FAZIE 2/3)
//   requires               — bramka tech (techSystem.isResearched) lub null
//   category               — grupowanie w UI (housing/energy/industry/trade/science)
//   Efekty (obecne tylko na właściwym module):
//     popCapacity          — habitat: +pojemność załogi na poziom (Station.popCapacity liczy z tego)
//     tradeCapacityByLevel — trade_module: ABSOLUTNY tradeCapacity per poziom [lv1, lv2, lv3] (A2)
//     researchPerYear      — lab: RP/rok do globalnego researchu (FAZA 2)
//     unlocksShipyard      — shipyard: odblokowuje kolejkę budowy statków na stacji (FAZA 2)
//
// UWAGA (pierwsza przymiarka): koszty/czasy do strojenia — schemat pozwala zmieniać liczby
// bez dotykania logiki.

export const STATION_MODULES = {
  // ── Mieszkania ────────────────────────────────────────────────────────────
  habitat: {
    id:            'habitat',
    namePL:        'Habitat',
    nameEN:        'Habitat',
    icon:          '🏠',
    category:      'housing',
    cost:          { Fe: 400 },
    commodityCost: { pressure_modules: 40 },
    buildTime:     3.0,    // lata cyw. (~91 dni gry)
    energy:        -1,
    popWork:       0,
    maxLevel:      1,
    requires:      null,
    popCapacity:   1,      // +1 miejsce załogi na poziom
    descPL:        'Moduł mieszkalny z podtrzymaniem życia — miejsce dla załogi stacji.',
    descEN:        'Pressurised living module with life support — housing for station crew.',
  },

  // ── Energia ───────────────────────────────────────────────────────────────
  power_atom: {
    id:            'power_atom',
    namePL:        'Elektrownia Atomowa',
    nameEN:        'Atomic Reactor',
    icon:          '☢',
    category:      'energy',
    cost:          { Fe: 300 },
    commodityCost: { power_cells: 60 },
    buildTime:     4.0,    // lata cyw. (~122 dni gry)
    energy:        6,
    popWork:       0.1,
    maxLevel:      1,
    requires:      null,
    descPL:        'Kompaktowy reaktor rozszczepienia — stabilne źródło energii stacji.',
    descEN:        'Compact fission reactor — the station\'s stable power source.',
  },

  power_solar: {
    id:            'power_solar',
    namePL:        'Panele Słoneczne',
    nameEN:        'Solar Panels',
    icon:          '☀',
    category:      'energy',
    cost:          { Si: 300 },
    commodityCost: { conductor_bundles: 40 },
    buildTime:     2.0,    // lata cyw. (~61 dni gry)
    energy:        3,
    popWork:       0.1,
    maxLevel:      1,
    requires:      null,
    descPL:        'Rozkładane panele fotowoltaiczne — tania, ale skromna energia.',
    descEN:        'Deployable photovoltaic array — cheap but modest power.',
  },

  power_fusion: {
    id:            'power_fusion',
    namePL:        'Reaktor Fuzyjny',
    nameEN:        'Fusion Reactor',
    icon:          '🔆',
    category:      'energy',
    cost:          { Ti: 400 },
    commodityCost: { plasma_cores: 80 },
    buildTime:     6.0,    // lata cyw. (~182 dni gry)
    energy:        12,
    popWork:       0.1,
    maxLevel:      1,
    requires:      'fusion_power',   // bramka tech (S3.4 FAZA 0 A-załącznik)
    descPL:        'Reaktor termojądrowy — ogromna, czysta energia dla dużych stacji.',
    descEN:        'Thermonuclear reactor — huge, clean power for large stations.',
  },

  power_solar_auto: {
    id:            'power_solar_auto',
    namePL:        'Autonomiczne Panele',
    nameEN:        'Autonomous Solar',
    icon:          '🤖☀',
    category:      'energy',
    cost:          { Si: 400 },
    commodityCost: { electronic_systems: 60 },
    buildTime:     3.0,    // lata cyw. (~91 dni gry)
    energy:        2,
    popWork:       0,      // obsługiwane przez roboty — zero POP
    maxLevel:      1,
    requires:      'automation',   // bramka tech
    descPL:        'Panele słoneczne obsługiwane przez roboty — działają bez załogi.',
    descEN:        'Robot-tended solar panels — operate without crew.',
  },

  // ── Przemysł ──────────────────────────────────────────────────────────────
  shipyard: {
    id:            'shipyard',
    namePL:        'Stocznia Orbitalna',
    nameEN:        'Orbital Shipyard',
    icon:          '🛠',
    category:      'industry',
    cost:          { Fe: 800 },
    commodityCost: { structural_alloys: 120 },
    buildTime:     8.0,    // lata cyw. (~243 dni gry)
    energy:        -3,
    popWork:       0.2,
    maxLevel:      1,
    requires:      null,
    unlocksShipyard: true,   // odblokowuje kolejkę budowy statków na stacji (FAZA 2)
    descPL:        'Dok budowy statków na orbicie — pozwala produkować floty z dala od planety.',
    descEN:        'Orbital ship-construction dock — build fleets away from the homeworld.',
  },

  // ── Handel ────────────────────────────────────────────────────────────────
  trade_module: {
    id:            'trade_module',
    namePL:        'Moduł Handlowy',
    nameEN:        'Trade Module',
    icon:          '💱',
    category:      'trade',
    cost:          { Fe: 500 },
    commodityCost: { electronic_systems: 80 },
    buildTime:     5.0,    // lata cyw. (~152 dni gry)
    energy:        -2,
    popWork:       0.5,
    maxLevel:      3,      // jedyny moduł z poziomami (upgrade w FAZIE 2/3)
    requires:      null,
    // ABSOLUTNY tradeCapacity per poziom (parytet naziemnego trade_hub 200/poziom — S3.4 FAZA 0 A2).
    // FAZA 2 tylko WYSTAWIA tę liczbę (Station.tradeCapacity); realne wpięcie w CivilianTradeSystem
    // to przyszły slice (getTradeCapacity przyjmuje ID kolonii, nie obiekt stacji).
    tradeCapacityByLevel: [200, 400, 600],
    descPL:        'Węzeł handlu orbitalnego — zwiększa przepustowość wymiany towarów stacji.',
    descEN:        'Orbital trade hub — raises the station\'s goods-throughput capacity.',
  },

  // ── Nauka ─────────────────────────────────────────────────────────────────
  lab: {
    id:            'lab',
    namePL:        'Laboratorium',
    nameEN:        'Laboratory',
    icon:          '🔬',
    category:      'science',
    cost:          { Ti: 300 },
    commodityCost: { electronic_systems: 60 },
    buildTime:     5.0,    // lata cyw. (~152 dni gry)
    energy:        -2,
    popWork:       0.1,
    maxLevel:      1,
    requires:      null,
    researchPerYear: 4,    // RP/rok (moduł lżejszy niż naziemna Stacja Badawcza = 8 — S3.4 FAZA 0)
    descPL:        'Laboratorium orbitalne — prowadzi badania w mikrograwitacji.',
    descEN:        'Orbital laboratory — conducts research in microgravity.',
  },
};

// Kolejność wyłączania modułów przy deficycie ENERGII (S3.4 FAZA 2): trade → lab → shipyard.
// Producenci (power_*) NIGDY nie gasną dla energii (gaszenie producenta pogłębiłoby deficyt).
export const MODULE_SHED_ORDER = ['trade_module', 'lab', 'shipyard'];

// Kolejność wyłączania przy deficycie PRACY (S3.4 FAZA 4, decyzja obsada=pop): najpierw KONSUMENCI
// (trade → lab → shipyard), POTEM ENERGIA (power_* — priorytet utrzymania: gaszone OSTATNIE, żeby wracały
// PIERWSZE gdy rośnie załoga → kaskada „power → konsumenci"). Świeża stacja z pop=0 jest NAPRAWDĘ martwa:
// każdy moduł z popWork>0 gaśnie na no_crew do przywiezienia POP. Wyjątki (popWork 0, NIEobecne tu →
// nigdy nie gaszone dla pracy): habitat (pasywne miejsca — popCapacity działa bez załogi) i
// power_solar_auto (autonomiczne — energia bez załogi). Moduł z popWork>0 MUSI być na tej liście.
export const CREW_SHED_ORDER = ['trade_module', 'lab', 'shipyard', 'power_solar', 'power_atom', 'power_fusion'];

// Płaski koszt budowy modułu do spend()/canAfford() — surowce bazowe + towary w jednym obiekcie
// (mirror stationTotalCost w StationData.js). FAZA 2 użyje przy budowie z kolejki.
export function stationModuleCost(moduleType) {
  const d = STATION_MODULES[moduleType];
  if (!d) return {};
  return { ...(d.cost ?? {}), ...(d.commodityCost ?? {}) };
}

// Fabryka instancji modułu na encji stacji. Id kolizjo-odporny (mirror station_/pso_ z reszty kodu).
export function makeStationModule(moduleType, level = 1, active = true) {
  return {
    id:         `smod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    moduleType,
    level,
    active,
  };
}

// Wyposażenie startowe każdej NOWEJ stacji (S3.4 FAZA 1.3): 1× habitat + 1× power_atom.
// Koszt jest „w cenie" bazowej stacji (StationData.cost) — nie pobierany osobno.
export function createStarterModules() {
  return [
    makeStationModule('habitat',   1),
    makeStationModule('power_atom', 1),
  ];
}
