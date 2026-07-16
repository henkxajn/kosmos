// ShipModulesData — moduły statków (system modułowy)
//
// Każdy statek składa się z kadłuba (ShipsData) + modułów.
// Moduły wpływają na: zasięg, prędkość, cargo, paliwo, zdolności misji.
//
// slotType:  kategoria slotu (propulsion|cargo|science|habitat|armor|fuel)
// stats:     modyfikatory statystyk statku
// fuelType:  typ paliwa (tylko dla silników)
// requires:  tech wymagany do odblokowania (null = zawsze dostępny)

export const SHIP_MODULES = {

  // ── Moduły napędowe ────────────────────────────────────────────────────

  engine_chemical: {
    id: 'engine_chemical',
    namePL: 'VDT-100 "Wół"',
    nameEN: 'VDT-100 "Ox"',
    icon: '🔥',
    slotType: 'propulsion',
    tier: 1,
    mass: 5,   // tony
    cost: { Fe: 20, Cu: 10 },
    commodityCost: { power_cells: 2 },
    stats: { speedMult: 1.0, fuelMult: 1.0, rangeMult: 1.0 },
    fuelType: 'fuel',
    requires: null,
    description: 'Bazowy napęd chemiczny. Niezawodny, tani, ograniczony zasięgiem układu.',
    descEN: 'Baseline chemical drive. Reliable, cheap, limited to in-system range.',
  },

  engine_ion: {
    id: 'engine_ion',
    namePL: 'VDT-250 "Sokół"',
    nameEN: 'VDT-250 "Falcon"',
    icon: '⚡',
    slotType: 'propulsion',
    tier: 2,
    mass: 8,   // tony
    cost: { Ti: 15, Cu: 10 },
    commodityCost: { propulsion_systems: 2 },
    stats: { speedMult: 2.2, fuelMult: 1.4, rangeMult: 2.5 },
    fuelType: 'fuel',
    requires: 'ion_drives',
    description: '2.5× zasięg, 1.8× prędkość. Ksenon w komorze jonizacji.',
    descEN: '2.5× range, 1.8× speed. Xenon in the ionization chamber.',
  },

  engine_fusion: {
    id: 'engine_fusion',
    namePL: 'VDT-600 "Pożoga"',
    nameEN: 'VDT-600 "Blaze"',
    icon: '🔆',
    slotType: 'propulsion',
    tier: 3,
    mass: 15,  // tony
    cost: { Ti: 30, Hv: 10 },
    commodityCost: { plasma_cores: 3, propulsion_systems: 2 },
    stats: { speedMult: 3.8, fuelMult: 2.0, rangeMult: 4.0 },
    fuelType: 'fuel',
    requires: 'fusion_drives',
    description: '4× zasięg, 3× prędkość. Ciągłe spalanie fuzyjne.',
    descEN: '4× range, 3× speed. Sustained fusion burn.',
  },

  // ── Silniki warp (dwutrybowe: sublight pali fuel + skok pali warp_cores) ──
  // S3.0b S1: KONIEC absurdalnego speedMult 50 / rangeMult 999. Tryb in-system =
  //   moc sublight (speedMult), pali fuel. Tryb skoku = warpSpeedLY LY/rok, pali
  //   warp_cores (bak warpFuel, zużycie warpFuelPerLY). Warp-klasa jest najszybsza
  //   in-system, ale najżarłoczniejsza (fuelMult najwyższy) — presja paliwowa zostaje.
  engine_warp: {
    id: 'engine_warp',
    namePL: 'VDT-W1 "Wyłom"',
    nameEN: 'VDT-W1 "Breach"',
    icon: '🌀',
    slotType: 'propulsion',
    tier: 4,
    mass: 30,  // tony — ciężki
    cost: { Ti: 50, Hv: 20 },
    commodityCost: { warp_cores: 2, electronic_systems: 4, power_cells: 2 },  // S3.0b S3: bez T3-komponentów (były metamaterials+quantum_processors)
    // ⚙ KNOBY balansu: sublight 9.0 (+100% vs 4.5), fuelMult 0.012 (in-system PRAWIE DARMOWY —
    //   ÷50 vs 0.6; statki warp nie mają być ograniczane paliwem in-system), rangeMult 2.0
    stats: { speedMult: 9.0, fuelMult: 0.012, rangeMult: 2.0 },
    fuelType: 'fuel',          // tryb in-system pali fuel (skok pali warp_cores przez warpFuel)
    warpCapable: true,
    warpSpeedLY: 2.0,          // prędkość skoku (LY/rok) — STAŁA między tierami
    warpFuelPerLY: 0.125,      // warp_cores/LY (−75% vs 0.5 — tańsze skoki, dłuższy zasięg na bak)
    requires: 'ion_drives',    // S3.0b S3: warp mid-game (match warp_cores gate; było warp_drive T4)
    description: 'Dwutrybowy: sublight (fuel) w układzie + skok warp (warp_cores) między gwiazdami.',
    descEN: 'Dual-mode: sublight (fuel) in-system + warp jump (warp_cores) between stars.',
  },

  engine_warp_mk2: {
    id: 'engine_warp_mk2',
    namePL: 'VDT-W2 "Osnowa"',
    nameEN: 'VDT-W2 "Weft"',
    icon: '🌀',
    slotType: 'propulsion',
    tier: 5,
    mass: 32,  // tony
    cost: { Ti: 70, Hv: 30 },
    commodityCost: { warp_cores: 2, metamaterials: 6, quantum_processors: 3 },
    // Tier podnosi moc sublight (9.0→11.0). fuelMult 0.014 (in-system prawie darmowy — ÷50 vs 0.7).
    stats: { speedMult: 11.0, fuelMult: 0.014, rangeMult: 2.0 },
    fuelType: 'fuel',
    warpCapable: true,
    warpSpeedLY: 2.0,          // STAŁA — progresja warpu odłożona (knob na później)
    warpFuelPerLY: 0.125,      // warp_cores/LY (−75% vs 0.5 — spójnie z engine_warp)
    requires: 'warp_drive_mk2', // load-bearing gate (UnitDesignOverlay czyta mod.requires)
    description: 'Ulepszony napęd warp — +50% mocy sublight. Skok bez zmian.',
    descEN: 'Upgraded warp drive — +50% sublight power. Jump unchanged.',
  },

  // ── Moduły cargo ───────────────────────────────────────────────────────

  cargo_small: {
    id: 'cargo_small',
    namePL: 'Ładownia Mała',
    nameEN: 'Small Cargo Bay',
    icon: '📦',
    slotType: 'cargo',
    tier: 1,
    mass: 15,  // tony — lekka konstrukcja
    cost: { Fe: 30 },
    commodityCost: { structural_alloys: 3 },
    stats: { cargoAdd: 200 },
    requires: null,
    description: '+200t ładowni.',
    descEN: '+200t cargo hold.',
  },

  cargo_large: {
    id: 'cargo_large',
    namePL: 'Ładownia Duża',
    nameEN: 'Large Cargo Bay',
    icon: '🚛',
    slotType: 'cargo',
    tier: 1,
    mass: 50,  // tony — ciężka konstrukcja
    cost: { Fe: 80, Ti: 10 },
    commodityCost: { structural_alloys: 8, reactive_armor: 2 },
    stats: { cargoAdd: 1000 },
    requires: null,
    description: '+1000t ładowni. Wzmocnione ściany.',
    descEN: '+1000t cargo hold. Reinforced walls.',
  },

  cargo_mass: {
    id: 'cargo_mass',
    namePL: 'Ładownia Masowa',
    nameEN: 'Mass Cargo Bay',
    icon: '🏭',
    slotType: 'cargo',
    tier: 2,
    mass: 120, // tony — masywna
    cost: { Fe: 200, Ti: 30 },
    commodityCost: { structural_alloys: 20, reactive_armor: 8 },
    stats: { cargoAdd: 5000 },
    requires: 'interplanetary_logistics',
    description: '+5000t ładowni masowej.',
    descEN: '+5000t bulk cargo hold.',
  },

  // ── Moduły naukowe ─────────────────────────────────────────────────────

  science_lab: {
    id: 'science_lab',
    namePL: 'Laboratorium Pokładowe',
    nameEN: 'Science Lab',
    icon: '🔬',
    slotType: 'science',
    tier: 1,
    mass: 8,   // tony
    cost: { Si: 20, Cu: 15 },
    commodityCost: { electronic_systems: 3, polymer_composites: 2 },
    stats: { discoveryBonus: 0.25, enablesMissions: ['survey', 'deep_scan'] },
    requires: null,
    description: '+25% szans odkrycia naukowego. Umożliwia misje naukowe.',
    descEN: '+25% science discovery chance. Enables science missions.',
  },

  deep_scanner: {
    id: 'deep_scanner',
    namePL: 'Skaner Głęboki',
    nameEN: 'Deep Scanner',
    icon: '📡',
    slotType: 'science',
    tier: 2,
    mass: 6,   // tony
    cost: { Si: 30, Cu: 20 },
    commodityCost: { semiconductor_arrays: 2, electronic_systems: 3 },
    stats: { discoveryBonus: 0.5, enablesMissions: ['deep_scan', 'anomaly_hunt'] },
    requires: 'orbital_survey',
    description: '+50% odkrycia. Umożliwia polowanie na anomalie.',
    descEN: '+50% discovery. Enables anomaly hunting.',
  },

  quantum_scanner: {
    id: 'quantum_scanner',
    namePL: 'Skaner Kwantowy',
    nameEN: 'Quantum Scanner',
    icon: '⚛',
    slotType: 'science',
    tier: 3,
    mass: 15,  // tony
    cost: { Si: 50, Hv: 10 },
    commodityCost: { quantum_processors: 2, semiconductor_arrays: 4 },
    stats: { discoveryBonus: 1.0, enablesMissions: ['deep_scan', 'anomaly_hunt', 'neutron_star'] },
    requires: 'quantum_computing',
    description: '+100% odkrycia. Umożliwia misje do gwiazd neutronowych.',
    descEN: '+100% discovery. Enables missions to neutron stars.',
  },

  // ── Moduły specjalne ──────────────────────────────────────────────────

  science_away_team: {
    id: 'science_away_team',
    namePL: 'Zespół Badawczy',
    nameEN: 'Science Away Team',
    icon: '🤖',
    slotType: 'special',
    tier: 1,
    mass: 5,   // tony
    cost: { Si: 15, Cu: 10 },
    commodityCost: { electronic_systems: 2 },
    stats: { enablesAwayTeam: true, awayTeamType: 'science_rover' },
    requires: 'exploration',
    description: 'Rover badawczy do eksploracji powierzchni. Wyślij z orbity na planetę.',
    descEN: 'Research rover for surface exploration. Deploy from orbit to the planet.',
  },

  // ── S3.4 Moduł dyplomatyczny ───────────────────────────────────────────
  // slotType 'special'; stats.enablesMissions:['envoy'] → getModuleCapabilities
  // automatycznie dodaje capability 'envoy' (zero zmian w mapperze).
  diplomatic_module: {
    id: 'diplomatic_module',
    namePL: 'Moduł Dyplomatyczny',
    nameEN: 'Diplomatic Module',
    icon: '🕊',
    slotType: 'special',
    tier: 2,
    mass: 6,   // tony
    cost: { Cu: 12, Si: 18 },
    commodityCost: { electronic_systems: 3 },
    stats: { enablesMissions: ['envoy'] },
    requires: null,
    description: 'Pokładowa misja dyplomatyczna. Umożliwia wysłanie emisariusza do obcego imperium (misja envoy). Niekompatybilny z uzbrojeniem — emisariusz to gest pokojowy.',
    descEN: 'Onboard diplomatic mission. Enables dispatching an envoy to an alien empire (envoy mission). Incompatible with weapons — an envoy is a gesture of peace.',
  },

  // ── Moduły habitacyjne ─────────────────────────────────────────────────

  habitat_pod: {
    id: 'habitat_pod',
    namePL: 'Moduł Kolonizacyjny',
    nameEN: 'Habitat Pod',
    icon: '🏠',
    slotType: 'habitat',
    tier: 1,
    mass: 20,  // tony — life support
    cost: { Ti: 20, Fe: 30 },
    commodityCost: { pressure_modules: 4, compact_bioreactor: 2 },
    stats: { colonistCapacity: 1.0, enablesMissions: ['colony'] },
    requires: 'colonization',
    description: 'Ciśnieniowy moduł dla 1 POP kolonistów.',
    descEN: 'Pressurized module for 1 POP of colonists.',
  },

  cryo_pod: {
    id: 'cryo_pod',
    namePL: 'Moduł Kriogeniczny',
    nameEN: 'Cryo Pod',
    icon: '❄',
    slotType: 'habitat',
    tier: 2,
    mass: 25,  // tony
    cost: { Ti: 30, Fe: 40 },
    commodityCost: { pressure_modules: 6, electronic_systems: 3 },
    stats: { colonistCapacity: 3.0, enablesMissions: ['colony'] },
    requires: 'cryogenics',
    description: '3 POP w hibernacji kriogenicznej.',
    descEN: '3 POP in cryogenic hibernation.',
  },

  // Moduł pasażerski (S3.4 FAZA 4) — wozi 1 POP jako PASAŻERA (vessel.colonists), ale slotType
  // 'special' (NIE 'habitat') → NIE czyni statku kolonizatorem (canColonize bramkuje na 'habitat').
  // Transport ludności między koloniami i stacjami (stacja ożywa dopiero po dowiezieniu załogi).
  passenger_module: {
    id: 'passenger_module',
    namePL: 'Moduł Pasażerski',
    nameEN: 'Passenger Module',
    icon: '🧑‍🚀',
    slotType: 'special',
    tier: 1,
    mass: 8,   // tony — lekka kabina ciśnieniowa
    cost: { Fe: 20, Ti: 8 },
    commodityCost: { pressure_modules: 2 },
    stats: { colonistCapacity: 1 },   // 1 POP pasażera — reuse vessel.colonists (bez zakładania kolonii)
    requires: null,
    description: 'Kabina ciśnieniowa dla 1 pasażera (POP). Przewóz ludności — bez zakładania kolonii.',
    descEN: 'Pressurized cabin for 1 passenger (POP). Population transport — without founding a colony.',
  },

  // ── Moduły pancerne ────────────────────────────────────────────────────

  armor_standard: {
    id: 'armor_standard',
    namePL: 'Opancerzenie Standardowe',
    nameEN: 'Standard Armor',
    icon: '🛡',
    slotType: 'armor',
    tier: 1,
    mass: 15,  // tony
    cost: { Ti: 10, Fe: 15 },
    commodityCost: { reactive_armor: 4 },
    stats: { armorRating: 1, survivalBonus: 0.02 },
    requires: null,
    description: '+2% przeżywalność misji.',
    descEN: '+2% mission survivability.',
  },

  armor_heavy: {
    id: 'armor_heavy',
    namePL: 'Opancerzenie Ciężkie',
    nameEN: 'Heavy Armor',
    icon: '⚔',
    slotType: 'armor',
    tier: 2,
    mass: 35,  // tony — bardzo ciężki
    cost: { Ti: 25, Hv: 10 },
    commodityCost: { reactive_armor: 10, metamaterials: 2 },
    stats: { armorRating: 3, survivalBonus: 0.05, speedMult: 0.9 },
    requires: 'point_defense',
    description: '+5% przeżywalność, -10% prędkość.',
    descEN: '+5% survivability, -10% speed.',
  },

  // ── Wzmocnienie kadłuba — +HP (zastępuje wbudowany pancerz hull_frigate/destroyer/cruiser) ──

  reinforced_hull: {
    id: 'reinforced_hull',
    namePL: 'Wzmocniony Kadłub',
    nameEN: 'Reinforced Hull',
    icon: '🛡',
    slotType: 'armor',
    tier: 2,
    mass: 25,  // tony — wewnętrzne wzmocnienia
    cost: { Fe: 60, Ti: 20, Hv: 5 },
    commodityCost: { structural_alloys: 8, reactive_armor: 4 },
    stats: { hpBonus: 60, armorRating: 1 },
    requires: 'point_defense',
    description: '+60 HP kadłuba, +1 armor. Wewnętrzne wzmocnienia konstrukcyjne.',
    descEN: '+60 hull HP, +1 armor. Internal structural reinforcements.',
  },

  titanic_plating: {
    id: 'titanic_plating',
    namePL: 'Płyty Tytaniczne',
    nameEN: 'Titanic Plating',
    icon: '⚜',
    slotType: 'armor',
    tier: 3,
    mass: 60,  // tony — masywna warstwa pancerza
    cost: { Fe: 120, Ti: 60, Hv: 20 },
    commodityCost: { structural_alloys: 16, reactive_armor: 10, metamaterials: 4 },
    stats: { hpBonus: 180, armorRating: 4, speedMult: 0.92 },
    requires: 'exotic_materials',
    description: '+180 HP, +4 armor, -8% prędkość. Endgame — kapitalny okręt bojowy.',
    descEN: '+180 HP, +4 armor, -8% speed. Endgame — capital warship.',
  },

  // ── Moduły paliwowe ────────────────────────────────────────────────────

  fuel_tank: {
    id: 'fuel_tank',
    namePL: 'Zbiornik Paliwa',
    nameEN: 'Fuel Tank',
    icon: '⛽',
    slotType: 'fuel',
    tier: 1,
    mass: 10,  // tony (pusty zbiornik)
    cost: { Fe: 20, Ti: 5 },
    commodityCost: { structural_alloys: 4 },
    stats: { fuelCapacityAdd: 5 },
    requires: null,
    description: '+5 jednostek paliwa.',
    descEN: '+5 fuel units.',
  },

  fuel_tank_medium: {
    id: 'fuel_tank_medium',
    namePL: 'Zbiornik Paliwa Średni',
    nameEN: 'Medium Fuel Tank',
    icon: '⛽',
    slotType: 'fuel',
    tier: 1,
    mass: 16,  // tony
    cost: { Fe: 35, Ti: 10 },
    commodityCost: { structural_alloys: 6, reactive_armor: 1 },
    stats: { fuelCapacityAdd: 10 },
    requires: null,
    description: '+10 jednostek paliwa.',
    descEN: '+10 fuel units.',
  },

  fuel_tank_large: {
    id: 'fuel_tank_large',
    namePL: 'Zbiornik Paliwa Duży',
    nameEN: 'Large Fuel Tank',
    icon: '⛽',
    slotType: 'fuel',
    tier: 1,
    mass: 25,  // tony
    cost: { Fe: 50, Ti: 15 },
    commodityCost: { structural_alloys: 10, reactive_armor: 2 },
    stats: { fuelCapacityAdd: 15 },
    requires: null,
    description: '+15 jednostek paliwa.',
    descEN: '+15 fuel units.',
  },

  fuel_tank_cryo: {
    id: 'fuel_tank_cryo',
    namePL: 'Zbiornik Kriogeniczny',
    nameEN: 'Cryo Fuel Tank',
    icon: '🧊',
    slotType: 'fuel',
    tier: 2,
    mass: 18,  // tony — lekki dzięki izolacji kriogenicznej
    cost: { Ti: 20, Cu: 10 },
    commodityCost: { pressure_modules: 4, structural_alloys: 6 },
    stats: { fuelCapacityAdd: 25 },
    requires: 'cryogenics',
    description: '+25 jednostek paliwa. Kriogeniczna izolacja minimalizuje masę.',
    descEN: '+25 fuel units. Cryogenic insulation minimizes mass.',
  },

  // ── Moduł warp (bak na warp_cores — paliwo skoków międzygwiezdnych) ──────
  // S3.0b S1: slotType 'fuel' (NIE 'warp') — mieści się w slocie utility obok zbiorników
  //   paliwa, gated przez requires. Bez tego modułu statek nie ma baku warp → nie skacze.
  warp_tank: {
    id: 'warp_tank',
    namePL: 'Komora Rdzeni Warp',
    nameEN: 'Warp Core Bay',
    icon: '🌀',
    slotType: 'fuel',
    tier: 4,
    mass: 12,  // tony
    cost: { Ti: 15, Hv: 8 },
    commodityCost: { structural_alloys: 4, pressure_modules: 2 },
    stats: { warpCapacityAdd: 5 },   // ⚙ KNOB: pojemność baku warp_cores (stackowalna)
    requires: 'warp_drive',
    description: '+5 jednostek warp_cores. Paliwo skoków warp — bez tego modułu statek nie skacze.',
    descEN: '+5 warp_cores units. Warp jump fuel — without this module the ship cannot jump.',
  },

  // ── Moduły uzbrojenia (Faza 4: aktywne w BattleSystem; M4 P3: rangeAU + fireCooldownYears + category dla DeepSpaceCombatSystem) ────────────────────
  // Pola bojowe legacy (BattleSystem orbital): damage (na turę), range ('short'|'medium'|'long'), tracking (0-1)
  // M4 P3 deep-space (DSCS): rangeAU — fizyczny zasięg w AU; fireCooldownYears — cadence; category — alias range dla tech-mult lookup

  weapon_laser: {
    id: 'weapon_laser',
    namePL: 'Wieża Laserowa',
    nameEN: 'Laser Turret',
    icon: '🔫',
    slotType: 'weapon',
    tier: 1,
    mass: 10,  // tony
    cost: { Ti: 20, Cu: 15 },
    commodityCost: { electronic_systems: 3 },
    stats: { attackPower: 5, survivalBonus: 0.01, damage: 5, range: 'short', tracking: 0.8, rangeAU: 0.05, fireCooldownYears: 0.3, category: 'short' },
    requires: 'point_defense',
    description: 'Broń energetyczna bliskiego zasięgu. Wysokie tracking, niskie obrażenia.',
    descEN: 'Short-range energy weapon. High tracking, low damage.',
  },

  weapon_kinetic: {
    id: 'weapon_kinetic',
    namePL: 'Działo Kinetyczne',
    nameEN: 'Kinetic Cannon',
    icon: '💥',
    slotType: 'weapon',
    tier: 1,
    mass: 14,  // tony
    cost: { Fe: 35, Ti: 15 },
    commodityCost: { reactive_armor: 2, electronic_systems: 2 },
    stats: { attackPower: 8, survivalBonus: 0.01, damage: 8, range: 'medium', tracking: 0.6, armorPierce: 1, rangeAU: 0.15, fireCooldownYears: 0.5, category: 'medium' },
    requires: 'point_defense',
    description: 'Pociski kinetyczne średniego zasięgu. Przebijają lekki pancerz.',
    descEN: 'Medium-range kinetic rounds. Pierce light armor.',
  },

  weapon_missile: {
    id: 'weapon_missile',
    namePL: 'Wyrzutnia Rakiet',
    nameEN: 'Missile Launcher',
    icon: '🚀',
    slotType: 'weapon',
    tier: 2,
    mass: 18,  // tony
    cost: { Ti: 30, Fe: 20 },
    commodityCost: { propulsion_systems: 2, reactive_armor: 3 },
    stats: { attackPower: 12, survivalBonus: 0.02, speedMult: 0.95, damage: 12, range: 'long', tracking: 0.5, rangeAU: 0.30, fireCooldownYears: 1.0, category: 'long' },
    requires: 'point_defense',
    description: 'Rakiety dalekiego zasięgu. Wysokie obrażenia, słabsze trafianie.',
    descEN: 'Long-range missiles. High damage, weaker accuracy.',
  },

  // ── Moduły tarcz (Faza 4: absorbują damage przed armor/hp) ────────────────

  shield_basic: {
    id: 'shield_basic',
    namePL: 'Tarcza Energetyczna',
    nameEN: 'Basic Shield',
    icon: '🛡',
    slotType: 'shield',
    tier: 2,
    mass: 12,  // tony
    cost: { Cu: 20, Ti: 10 },
    commodityCost: { electronic_systems: 4, polymer_composites: 2 },
    stats: { shieldHP: 15, shieldRegen: 1 },
    requires: 'point_defense',
    description: 'Ładowane pole ochronne. +15 HP tarczy, +1/turę regeneracji.',
    descEN: 'Charged protective field. +15 shield HP, +1/turn regeneration.',
  },

  shield_phase: {
    id: 'shield_phase',
    namePL: 'Tarcza Fazowa',
    nameEN: 'Phase Shield',
    icon: '🔷',
    slotType: 'shield',
    tier: 3,
    mass: 20,  // tony
    cost: { Ti: 30, Hv: 8 },
    commodityCost: { quantum_processors: 2, electronic_systems: 6 },
    stats: { shieldHP: 35, shieldRegen: 3 },
    requires: 'quantum_computing',
    description: 'Zaawansowana tarcza fazowa. Dużo HP i szybka regeneracja.',
    descEN: 'Advanced phase shield. High HP and fast regeneration.',
  },

  // ── Moduły transportu wojsk (Faza desantu) ────────────────────────────────
  // troopCapacity liczone w transportSize: 1=piechota, 2=wóz, 3=ciężki sprzęt.
  // Wymaga drop_pods by móc desantować jednostki na wrogą planetę.

  troop_bay_s: {
    id: 'troop_bay_s',
    namePL: 'Ładownia Desantowa Mała',
    nameEN: 'Small Troop Bay',
    icon: '🪖',
    slotType: 'troop',
    tier: 1,
    mass: 25,  // tony — żywe jednostki + lekki life support
    cost: { Fe: 30, Ti: 10 },
    commodityCost: { structural_alloys: 4, pressure_modules: 1 },
    stats: { troopCapacity: 3 },
    requires: 'ground_warfare',
    description: 'Mieści 3 pkt ładowności (3 piechoty / 1 ciężki sprzęt). Raid/commando.',
    descEN: 'Holds 3 capacity points (3 infantry / 1 heavy unit). Raid/commando.',
  },

  troop_bay_m: {
    id: 'troop_bay_m',
    namePL: 'Ładownia Desantowa Średnia',
    nameEN: 'Medium Troop Bay',
    icon: '🪖',
    slotType: 'troop',
    tier: 2,
    mass: 55,  // tony
    cost: { Fe: 70, Ti: 20 },
    commodityCost: { structural_alloys: 10, pressure_modules: 3, reactive_armor: 2 },
    stats: { troopCapacity: 8 },
    requires: 'ground_warfare',
    description: 'Mieści 8 pkt ładowności (batalion mieszany). Standard inwazyjny.',
    descEN: 'Holds 8 capacity points (mixed battalion). Invasion standard.',
  },

  troop_bay_l: {
    id: 'troop_bay_l',
    namePL: 'Ładownia Desantowa Duża',
    nameEN: 'Large Troop Bay',
    icon: '🪖',
    slotType: 'troop',
    tier: 3,
    mass: 110, // tony
    cost: { Fe: 140, Ti: 40, Cu: 15 },
    commodityCost: { structural_alloys: 20, pressure_modules: 6, reactive_armor: 4 },
    stats: { troopCapacity: 16 },
    requires: 'fleet_logistics',
    description: 'Mieści 16 pkt ładowności (pełna armia z logistyką). Kampania podbojowa.',
    descEN: 'Holds 16 capacity points (full army with logistics). Conquest campaign.',
  },

  drop_pods: {
    id: 'drop_pods',
    namePL: 'Kapsuły Desantowe',
    nameEN: 'Drop Pods',
    icon: '🛩',
    slotType: 'special',
    tier: 2,
    mass: 12,  // tony — pojedyncze kapsuły zrzutowe
    cost: { Ti: 20, Fe: 25, Cu: 8 },
    commodityCost: { structural_alloys: 4, reactive_armor: 2, electronic_systems: 2 },
    stats: { enablesPlanetLanding: true },
    requires: 'ground_warfare',
    description: 'Umożliwia desant jednostek z troop bay na powierzchnię planety (wymaga dominacji orbitalnej). Bez tego jednostki są tylko transportowane — nie wysadzane na wrogi ląd.',
    descEN: 'Enables landing units from a troop bay onto a planet surface (requires orbital dominance). Without it, units are only transported — not deployed onto hostile ground.',
  },

  // ── Moduł wsparcia orbitalnego (Faza desantu) ─────────────────────────────

  orbital_strike_battery: {
    id: 'orbital_strike_battery',
    namePL: 'Bateria Ostrzału Orbitalnego',
    nameEN: 'Orbital Strike Battery',
    icon: '💥',
    slotType: 'weapon',
    tier: 3,
    mass: 30,  // tony
    cost: { Ti: 40, Fe: 30, Hv: 15 },
    commodityCost: { reactive_armor: 4, electronic_systems: 4, propulsion_systems: 2 },
    // Ładuje orbital_shells jako amunicję; strike: 20 dmg na hex, cooldown 0.5 civY
    stats: { orbitalStrike: { damage: 20, cooldownYears: 0.5, ammoCapacity: 10, ammoType: 'orbital_shells' } },
    requires: 'tech_munitions',
    description: 'Ciężka bateria kinetyczna do ostrzału powierzchni. Zużywa Pociski Orbitalne (max 10 na pokładzie). Wymaga dominacji orbitalnej.',
    descEN: 'Heavy kinetic battery for surface bombardment. Consumes Orbital Shells (max 10 onboard). Requires orbital dominance.',
  },
};

// Typy modułów akceptowane w slotach utility (wszystko oprócz propulsion)
export const UTILITY_SLOT_TYPES = new Set([
  'cargo', 'science', 'special', 'habitat', 'armor', 'fuel', 'weapon', 'shield', 'troop',
]);

// ── Pomocnik: oblicz statystyki statku z kadłuba + modułów ────────────────
//
// Masa wpływa na prędkość i zużycie paliwa:
//   totalMass = hull.baseMass + Σ(module.mass)
//   massRatio = totalMass / hull.baseMass
//   speed     = baseSpeed × Π(speedMult) / ∛massRatio
//   fuelPerAU = baseFuelPerAU × Π(fuelMult) × ∛massRatio
//   range     = fuelCapacity / fuelPerAU
//
export function calcShipStats(hullDef, selectedModuleIds) {
  const baseMass = hullDef.baseMass ?? 30;
  let speed = hullDef.baseSpeedAU ?? 1.0;
  let fuelCapacity = hullDef.baseFuelCapacity ?? 10;
  let cargo = hullDef.baseCargoCapacity ?? 0;
  let fuelPerAU = hullDef.baseFuelPerAU ?? 0.5;
  let survivalBonus = 0;
  let discoveryBonus = 0;
  let colonistCapacity = 0;
  let fuelType = 'fuel';
  let warpCapable = false;
  let warpSpeedLY = 0;
  let warpFuelCapacity = 0;   // S3.0b S1: pojemność baku warp_cores (suma Komór Warp)
  let warpFuelPerLY = 0;      // S3.0b S1: warp_cores/LY (z silnika warp; ostatni silnik warp wygrywa)
  let moduleMass = 0;
  // Troop transport + orbital strike (Faza desantu)
  let troopCapacity = 0;
  let canDropTroops = false;
  let orbitalStrike = null;

  // HP i armor (z bazy kadłuba + modułów reinforced_hull/titanic_plating)
  let hp = hullDef.baseHP ?? 50;
  let armor = hullDef.baseArmor ?? 0;

  // Zlicz silniki — kolejne dają redundancy bonus (więcej silników = większa moc napędowa).
  // Bez tego 2 silniki chemiczne (speedMult 1.0 × 1.0 = 1.0) dawały tylko więcej masy → absurd.
  let engineCount = 0;
  for (const modId of selectedModuleIds) {
    if (SHIP_MODULES[modId]?.slotType === 'propulsion') engineCount++;
  }
  const ENGINE_REDUNDANCY_BONUS = 0.25; // +25% za każdy dodatkowy silnik ponad pierwszy
  const engineRedundancyMult = 1 + Math.max(0, engineCount - 1) * ENGINE_REDUNDANCY_BONUS;

  for (const modId of selectedModuleIds) {
    const m = SHIP_MODULES[modId];
    if (!m) continue;
    moduleMass += (m.mass ?? 0);
    if (m.stats.speedMult != null)       speed *= m.stats.speedMult;
    if (m.stats.fuelMult != null)        fuelPerAU *= m.stats.fuelMult;
    if (m.stats.rangeMult != null)       fuelCapacity *= m.stats.rangeMult;
    if (m.stats.cargoAdd != null)        cargo += m.stats.cargoAdd;
    if (m.stats.fuelCapacityAdd != null) fuelCapacity += m.stats.fuelCapacityAdd;
    if (m.stats.survivalBonus != null)   survivalBonus += m.stats.survivalBonus;
    if (m.stats.discoveryBonus != null)  discoveryBonus += m.stats.discoveryBonus;
    if (m.stats.colonistCapacity != null) colonistCapacity += m.stats.colonistCapacity;
    if (m.stats.troopCapacity != null)   troopCapacity += m.stats.troopCapacity;
    if (m.stats.enablesPlanetLanding)    canDropTroops = true;
    if (m.stats.orbitalStrike)           orbitalStrike = { ...m.stats.orbitalStrike };
    if (m.stats.hpBonus != null)         hp += m.stats.hpBonus;
    if (m.stats.armorRating != null)     armor += m.stats.armorRating;
    // S3.0b S1: bak in-system ZAWSZE 'fuel' — porzucenie reguły "ostatni silnik wygrywa".
    //   Silnik warp pali fuel in-system (tryb sublight); warp_cores idą TYLKO na skok (bak warpFuel).
    if (m.warpCapable)                   warpCapable = true;
    if (m.warpSpeedLY)                   warpSpeedLY = m.warpSpeedLY;
    if (m.stats.warpCapacityAdd != null) warpFuelCapacity += m.stats.warpCapacityAdd;
    if (m.warpFuelPerLY != null)         warpFuelPerLY = m.warpFuelPerLY;
  }

  // Redundancy silników (więcej silników = bonus do prędkości, kompensuje masę większych kadłubów)
  speed *= engineRedundancyMult;

  // Wpływ masy: ∛massRatio — łagodna krzywa (×2 masy = ~26% kary, ×3 = ~44%)
  const totalMass = baseMass + moduleMass;
  const massRatio = totalMass / baseMass;
  const massFactor = Math.cbrt(massRatio); // >= 1.0

  speed /= massFactor;
  fuelPerAU *= massFactor;

  const range = fuelPerAU > 0 ? fuelCapacity / fuelPerAU : 0;

  return {
    speed, fuelCapacity, cargo, fuelPerAU,
    survivalBonus, discoveryBonus, colonistCapacity,
    fuelType, warpCapable, warpSpeedLY, range,
    warpFuelCapacity, fuelPerLY: warpFuelPerLY,   // S3.0b S1 — bak warp + zużycie skoku
    totalMass, baseMass, massRatio,
    troopCapacity, canDropTroops, orbitalStrike,
    hp, armor, engineCount,
  };
}

// ── Pomocnik: oblicz koszt statku (kadłub + moduły) ───────────────────────
export function calcShipCost(hullDef, selectedModuleIds) {
  const totalCost = { ...(hullDef.cost || {}) };
  const totalCommodity = { ...(hullDef.commodityCost || {}) };

  for (const modId of selectedModuleIds) {
    const mod = SHIP_MODULES[modId];
    if (!mod) continue;
    for (const [res, qty] of Object.entries(mod.cost || {})) {
      totalCost[res] = (totalCost[res] || 0) + qty;
    }
    for (const [com, qty] of Object.entries(mod.commodityCost || {})) {
      totalCommodity[com] = (totalCommodity[com] || 0) + qty;
    }
  }

  return { cost: totalCost, commodityCost: totalCommodity };
}

// ── Pomocnik: ile slotów zajmują wybrane moduły ───────────────────────────
export function countModuleSlots(selectedModuleIds) {
  let total = 0;
  for (const modId of selectedModuleIds) {
    // Każdy moduł zajmuje 1 slot (chyba że przyszłe moduły zmienią to)
    total += 1;
  }
  return total;
}

// ── Pomocnik: zdolności z modułów ─────────────────────────────────────────
export function getModuleCapabilities(selectedModuleIds) {
  const caps = new Set();
  for (const modId of selectedModuleIds) {
    const m = SHIP_MODULES[modId];
    if (!m) continue;
    if (m.stats.enablesMissions) {
      for (const mis of m.stats.enablesMissions) caps.add(mis);
    }
    if (m.stats.cargoAdd > 0) caps.add('cargo');
    if (m.stats.colonistCapacity > 0) caps.add('colony');
    if (m.warpCapable) caps.add('warp');
    if (m.stats.troopCapacity > 0) caps.add('troop_transport');
    if (m.stats.enablesPlanetLanding) caps.add('planet_landing');
    if (m.stats.orbitalStrike) caps.add('orbital_strike');
  }
  return caps;
}
