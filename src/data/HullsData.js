// HullsData — definicje kadłubów statków (system modułowy)
//
// Trzy rozmiary kadłubów z typowanymi slotami:
//   Mały  (3 sloty) — 1 napędowy + 2 użytkowe
//   Średni (6 slotów) — 2 napędowe + 4 użytkowe
//   Duży  (9 slotów) — 3 napędowe + 6 użytkowych
//
// Sloty mają typ: 'propulsion' (tylko moduły napędowe) lub 'utility' (reszta).
// Finalne staty = baza kadłuba + suma efektów modułów (calcShipStats z ShipModulesData).

export const HULLS = {

  // ══════════════════════════════════════════════════════════════════════════
  // Kadłub Mały — szybki zwiadowca, 3 sloty (1P + 2U)
  // ══════════════════════════════════════════════════════════════════════════

  hull_small: {
    id:                'hull_small',
    namePL:            'Kadłub Mały',
    nameEN:            'Small Hull',
    icon:              '🔹',
    size:              'small',
    baseMass:          25,     // tony — lekki
    baseModuleSlots:   3,
    baseFuelCapacity:  8,
    baseSpeedAU:       1.4,    // AU/rok — szybki
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.35,
    // Aliasy kompatybilności (stary kod czyta te pola)
    fuelCapacity:      8,
    fuelPerAU:         0.35,
    range:             23,
    speedAU:           1.4,
    cargoCapacity:     0,
    fuelType:          'power_cells',
    cost:              { Fe: 60, Ti: 10, Cu: 8 },
    commodityCost:     { structural_alloys: 3, polymer_composites: 2 },
    buildTime:         0.8,
    crewCost:          0.05,
    crewStrata:        'mix',
    requires:          'exploration',
    slots: [
      { type: 'propulsion' },
      { type: 'utility' },
      { type: 'utility' },
    ],
    description:       'Lekki kadłub — 3 sloty (1 napęd + 2 użytkowe). Szybki i tani. Nie wymaga wyrzutni.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Kadłub Średni — zbalansowany, 6 slotów (2P + 4U)
  // ══════════════════════════════════════════════════════════════════════════

  hull_medium: {
    id:                'hull_medium',
    namePL:            'Kadłub Średni',
    nameEN:            'Medium Hull',
    icon:              '🔷',
    size:              'medium',
    baseMass:          50,     // tony
    baseModuleSlots:   6,
    baseFuelCapacity:  12,
    baseSpeedAU:       1.0,    // AU/rok
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.5,
    fuelCapacity:      12,
    fuelPerAU:         0.5,
    range:             24,
    speedAU:           1.0,
    cargoCapacity:     0,
    fuelType:          'power_cells',
    cost:              { Fe: 120, Ti: 20, Cu: 12 },
    commodityCost:     { structural_alloys: 8, polymer_composites: 4, reactive_armor: 2 },
    buildTime:         1.5,
    crewCost:          0.1,
    crewStrata:        'mix',
    requires:          'exploration',
    slots: [
      { type: 'propulsion' },
      { type: 'propulsion' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
    ],
    description:       'Średni kadłub — 6 slotów (2 napędy + 4 użytkowe). Zbalansowany. Wymaga wyrzutni.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Kadłub Duży — ciężki, 9 slotów (3P + 6U)
  // ══════════════════════════════════════════════════════════════════════════

  hull_large: {
    id:                'hull_large',
    namePL:            'Kadłub Duży',
    nameEN:            'Large Hull',
    icon:              '🟦',
    size:              'large',
    baseMass:          90,     // tony — ciężki
    baseModuleSlots:   9,
    baseFuelCapacity:  18,
    baseSpeedAU:       0.7,    // AU/rok — wolny bez dobrych silników
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.7,
    fuelCapacity:      18,
    fuelPerAU:         0.7,
    range:             26,
    speedAU:           0.7,
    cargoCapacity:     0,
    fuelType:          'power_cells',
    cost:              { Fe: 200, Ti: 35, Cu: 18 },
    commodityCost:     { structural_alloys: 15, polymer_composites: 6, reactive_armor: 5 },
    buildTime:         2.5,
    crewCost:          0.15,
    crewStrata:        'mix',
    requires:          'exploration',
    slots: [
      { type: 'propulsion' },
      { type: 'propulsion' },
      { type: 'propulsion' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
    ],
    description:       'Duży kadłub — 9 slotów (3 napędy + 6 użytkowych). Ciężki i drogi. Wymaga wyrzutni.',
  },
};

// ── Pomocnik: zlicz sloty wg typu ────────────────────────────────────────────
export function getSlotCounts(hullId) {
  const hull = HULLS[hullId];
  if (!hull) return { propulsion: 0, utility: 0, total: 0 };
  let propulsion = 0, utility = 0;
  for (const s of hull.slots) {
    if (s.type === 'propulsion') propulsion++;
    else utility++;
  }
  return { propulsion, utility, total: hull.slots.length };
}
