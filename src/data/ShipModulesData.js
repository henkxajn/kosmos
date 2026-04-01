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
    namePL: 'Napęd Chemiczny',
    nameEN: 'Chemical Drive',
    icon: '🔥',
    slotType: 'propulsion',
    tier: 1,
    cost: { Fe: 20, Cu: 10 },
    commodityCost: { power_cells: 2 },
    stats: { speedMult: 1.0, fuelMult: 1.0, rangeMult: 1.0 },
    fuelType: 'power_cells',
    requires: null,
    description: 'Bazowy napęd chemiczny. Niezawodny, tani, ograniczony zasięgiem układu.',
  },

  engine_ion: {
    id: 'engine_ion',
    namePL: 'Napęd Jonowy',
    nameEN: 'Ion Drive',
    icon: '⚡',
    slotType: 'propulsion',
    tier: 2,
    cost: { Ti: 15, Cu: 10 },
    commodityCost: { propulsion_systems: 2 },
    stats: { speedMult: 1.8, fuelMult: 0.6, rangeMult: 2.5 },
    fuelType: 'power_cells',
    requires: 'ion_drives',
    description: '2.5× zasięg, 1.8× prędkość. Ksenon w komorze jonizacji.',
  },

  engine_fusion: {
    id: 'engine_fusion',
    namePL: 'Napęd Fuzyjny',
    nameEN: 'Fusion Drive',
    icon: '🔆',
    slotType: 'propulsion',
    tier: 3,
    cost: { Ti: 30, Hv: 10 },
    commodityCost: { plasma_cores: 3, propulsion_systems: 2 },
    stats: { speedMult: 3.0, fuelMult: 0.4, rangeMult: 4.0 },
    fuelType: 'plasma_cores',
    requires: 'fusion_drives',
    description: '4× zasięg, 3× prędkość. Ciągłe spalanie fuzyjne.',
  },

  engine_warp: {
    id: 'engine_warp',
    namePL: 'Napęd Warp',
    nameEN: 'Warp Drive',
    icon: '🌀',
    slotType: 'propulsion',
    tier: 4,
    cost: { Ti: 50, Hv: 20 },
    commodityCost: { warp_cores: 2, metamaterials: 4, quantum_processors: 2 },
    stats: { speedMult: 50.0, fuelMult: 1.0, rangeMult: 999 },
    fuelType: 'warp_cores',
    warpCapable: true,
    warpSpeedLY: 2.0,
    requires: 'warp_drive',
    description: 'Zakrzywienie czasoprzestrzeni. Otwiera drogę do gwiazd.',
  },

  // ── Moduły cargo ───────────────────────────────────────────────────────

  cargo_small: {
    id: 'cargo_small',
    namePL: 'Ładownia Mała',
    nameEN: 'Small Cargo Bay',
    icon: '📦',
    slotType: 'cargo',
    tier: 1,
    cost: { Fe: 30 },
    commodityCost: { structural_alloys: 3 },
    stats: { cargoAdd: 200 },
    requires: null,
    description: '+200t ładowni.',
  },

  cargo_large: {
    id: 'cargo_large',
    namePL: 'Ładownia Duża',
    nameEN: 'Large Cargo Bay',
    icon: '🚛',
    slotType: 'cargo',
    tier: 1,
    cost: { Fe: 80, Ti: 10 },
    commodityCost: { structural_alloys: 8, reactive_armor: 2 },
    stats: { cargoAdd: 1000 },
    requires: null,
    description: '+1000t ładowni. Wzmocnione ściany.',
  },

  cargo_mass: {
    id: 'cargo_mass',
    namePL: 'Ładownia Masowa',
    nameEN: 'Mass Cargo Bay',
    icon: '🏭',
    slotType: 'cargo',
    tier: 2,
    cost: { Fe: 200, Ti: 30 },
    commodityCost: { structural_alloys: 20, reactive_armor: 8 },
    stats: { cargoAdd: 5000 },
    requires: 'interplanetary_logistics',
    description: '+5000t ładowni masowej.',
  },

  // ── Moduły naukowe ─────────────────────────────────────────────────────

  science_lab: {
    id: 'science_lab',
    namePL: 'Laboratorium Pokładowe',
    nameEN: 'Science Lab',
    icon: '🔬',
    slotType: 'science',
    tier: 1,
    cost: { Si: 20, Cu: 15 },
    commodityCost: { electronic_systems: 3, polymer_composites: 2 },
    stats: { discoveryBonus: 0.25, enablesMissions: ['scientific', 'survey'] },
    requires: null,
    description: '+25% szans odkrycia naukowego. Umożliwia misje naukowe.',
  },

  deep_scanner: {
    id: 'deep_scanner',
    namePL: 'Skaner Głęboki',
    nameEN: 'Deep Scanner',
    icon: '📡',
    slotType: 'science',
    tier: 2,
    cost: { Si: 30, Cu: 20 },
    commodityCost: { semiconductor_arrays: 2, electronic_systems: 3 },
    stats: { discoveryBonus: 0.5, enablesMissions: ['deep_scan', 'anomaly_hunt'] },
    requires: 'orbital_survey',
    description: '+50% odkrycia. Umożliwia polowanie na anomalie.',
  },

  quantum_scanner: {
    id: 'quantum_scanner',
    namePL: 'Skaner Kwantowy',
    nameEN: 'Quantum Scanner',
    icon: '⚛',
    slotType: 'science',
    tier: 3,
    cost: { Si: 50, Hv: 10 },
    commodityCost: { quantum_processors: 2, semiconductor_arrays: 4 },
    stats: { discoveryBonus: 1.0, enablesMissions: ['deep_scan', 'anomaly_hunt', 'neutron_star'] },
    requires: 'quantum_computing',
    description: '+100% odkrycia. Umożliwia misje do gwiazd neutronowych.',
  },

  // ── Moduły specjalne ──────────────────────────────────────────────────

  science_away_team: {
    id: 'science_away_team',
    namePL: 'Zespół Badawczy',
    nameEN: 'Science Away Team',
    icon: '🤖',
    slotType: 'special',
    tier: 1,
    cost: { Si: 15, Cu: 10 },
    commodityCost: { electronic_systems: 2 },
    stats: { enablesAwayTeam: true, awayTeamType: 'science_rover' },
    requires: 'exploration',
    description: 'Rover badawczy do eksploracji powierzchni. Wyślij z orbity na planetę.',
  },

  // ── Moduły habitacyjne ─────────────────────────────────────────────────

  habitat_pod: {
    id: 'habitat_pod',
    namePL: 'Moduł Kolonizacyjny',
    nameEN: 'Habitat Pod',
    icon: '🏠',
    slotType: 'habitat',
    tier: 1,
    cost: { Ti: 20, Fe: 30 },
    commodityCost: { pressure_modules: 4, compact_bioreactor: 2 },
    stats: { colonistCapacity: 1.0, enablesMissions: ['colony'] },
    requires: 'colonization',
    description: 'Ciśnieniowy moduł dla 1 POP kolonistów.',
  },

  cryo_pod: {
    id: 'cryo_pod',
    namePL: 'Moduł Kriogeniczny',
    nameEN: 'Cryo Pod',
    icon: '❄',
    slotType: 'habitat',
    tier: 2,
    cost: { Ti: 30, Fe: 40 },
    commodityCost: { pressure_modules: 6, electronic_systems: 3 },
    stats: { colonistCapacity: 3.0, enablesMissions: ['colony'] },
    requires: 'cryogenics',
    description: '3 POP w hibernacji kriogenicznej.',
  },

  // ── Moduły pancerne ────────────────────────────────────────────────────

  armor_standard: {
    id: 'armor_standard',
    namePL: 'Opancerzenie Standardowe',
    nameEN: 'Standard Armor',
    icon: '🛡',
    slotType: 'armor',
    tier: 1,
    cost: { Ti: 10, Fe: 15 },
    commodityCost: { reactive_armor: 4 },
    stats: { armorRating: 1, survivalBonus: 0.02 },
    requires: null,
    description: '+2% przeżywalność misji.',
  },

  armor_heavy: {
    id: 'armor_heavy',
    namePL: 'Opancerzenie Ciężkie',
    nameEN: 'Heavy Armor',
    icon: '⚔',
    slotType: 'armor',
    tier: 2,
    cost: { Ti: 25, Hv: 10 },
    commodityCost: { reactive_armor: 10, metamaterials: 2 },
    stats: { armorRating: 3, survivalBonus: 0.05, speedMult: 0.9 },
    requires: 'point_defense',
    description: '+5% przeżywalność, -10% prędkość.',
  },

  // ── Moduły paliwowe ────────────────────────────────────────────────────

  fuel_tank: {
    id: 'fuel_tank',
    namePL: 'Zbiornik Paliwa',
    nameEN: 'Fuel Tank',
    icon: '⛽',
    slotType: 'fuel',
    tier: 1,
    cost: { Fe: 20, Ti: 5 },
    commodityCost: { structural_alloys: 4 },
    stats: { fuelCapacityAdd: 5 },
    requires: null,
    description: '+5 jednostek paliwa.',
  },

  fuel_tank_large: {
    id: 'fuel_tank_large',
    namePL: 'Zbiornik Paliwa Duży',
    nameEN: 'Large Fuel Tank',
    icon: '⛽',
    slotType: 'fuel',
    tier: 1,
    cost: { Fe: 50, Ti: 15 },
    commodityCost: { structural_alloys: 10, reactive_armor: 2 },
    stats: { fuelCapacityAdd: 15 },
    requires: null,
    description: '+15 jednostek paliwa.',
  },
};

// ── Pomocnik: oblicz statystyki statku z kadłuba + modułów ────────────────
export function calcShipStats(hullDef, selectedModuleIds) {
  let speed = hullDef.baseSpeedAU ?? 1.0;
  let fuelCapacity = hullDef.baseFuelCapacity ?? 10;
  let cargo = hullDef.baseCargoCapacity ?? 0;
  let fuelPerAU = 0.5;  // bazowe
  let survivalBonus = 0;
  let discoveryBonus = 0;
  let colonistCapacity = 0;
  let fuelType = 'power_cells';
  let warpCapable = false;
  let warpSpeedLY = 0;

  for (const modId of selectedModuleIds) {
    const m = SHIP_MODULES[modId];
    if (!m) continue;
    if (m.stats.speedMult != null)       speed *= m.stats.speedMult;
    if (m.stats.fuelMult != null)        fuelPerAU *= m.stats.fuelMult;
    if (m.stats.rangeMult != null)       fuelCapacity *= m.stats.rangeMult;
    if (m.stats.cargoAdd != null)        cargo += m.stats.cargoAdd;
    if (m.stats.fuelCapacityAdd != null) fuelCapacity += m.stats.fuelCapacityAdd;
    if (m.stats.survivalBonus != null)   survivalBonus += m.stats.survivalBonus;
    if (m.stats.discoveryBonus != null)  discoveryBonus += m.stats.discoveryBonus;
    if (m.stats.colonistCapacity != null) colonistCapacity += m.stats.colonistCapacity;
    if (m.fuelType)                      fuelType = m.fuelType; // ostatni silnik wygrywa
    if (m.warpCapable)                   warpCapable = true;
    if (m.warpSpeedLY)                   warpSpeedLY = m.warpSpeedLY;
  }

  const range = fuelPerAU > 0 ? fuelCapacity / fuelPerAU : 0;

  return {
    speed, fuelCapacity, cargo, fuelPerAU,
    survivalBonus, discoveryBonus, colonistCapacity,
    fuelType, warpCapable, warpSpeedLY, range,
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
  }
  return caps;
}
