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
    groundBuildable:   true,   // S3.4d — JEDYNY kadłub budowalny w stoczni naziemnej; reszta wymaga stoczni orbitalnej
    baseMass:          25,     // tony — lekki
    baseModuleSlots:   3,
    baseFuelCapacity:  8,
    baseSpeedAU:       1.4,    // AU/rok — szybki
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.35,
    // Faza 4: combat — małe HP, wysokie evasion (mały i zwrotny)
    baseHP:            30,
    baseEvasion:       0.25,
    sensorRangeAU:     2.5,    // AU — zwiadowca: oczy floty, najszerszy zasięg wykrycia (reforma detekcji)
    // Aliasy kompatybilności (stary kod czyta te pola)
    fuelCapacity:      8,
    fuelPerAU:         0.35,
    range:             23,
    speedAU:           1.4,
    cargoCapacity:     0,
    fuelType:          'fuel',
    cost:              { Fe: 60, Ti: 10, Cu: 8 },
    commodityCost:     { structural_alloys: 3, polymer_composites: 2 },
    upkeepCredits:     50,     // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         3.0,
    maxSurge:          1,
    crewCost:          0.05,
    crewStrata:        'mix',
    requires:          'exploration',
    slots: [
      { type: 'propulsion' },
      { type: 'utility' },
      { type: 'utility' },
    ],
    description:       'Lekki kadłub — 3 sloty (1 napęd + 2 użytkowe). Szybki i tani. Nie wymaga wyrzutni.',
    descEN:            'Light hull — 3 slots (1 propulsion + 2 utility). Fast and cheap. No launcher required.',
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
    // Faza 4: combat — zbalansowane HP i evasion
    baseHP:            80,
    baseEvasion:       0.15,
    sensorRangeAU:     1.5,    // AU — zbalansowany zasięg wykrycia (reforma detekcji)
    fuelCapacity:      12,
    fuelPerAU:         0.5,
    range:             24,
    speedAU:           1.0,
    cargoCapacity:     0,
    fuelType:          'fuel',
    cost:              { Fe: 120, Ti: 20, Cu: 12 },
    commodityCost:     { structural_alloys: 8, polymer_composites: 4, reactive_armor: 2 },
    upkeepCredits:     300,    // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         6.0,
    maxSurge:          2,
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
    descEN:            'Medium hull — 6 slots (2 propulsion + 4 utility). Balanced. Requires a launcher.',
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
    // Faza 4: combat — duże HP, niskie evasion (niezdarny ale wytrzymały)
    baseHP:            180,
    baseEvasion:       0.05,
    sensorRangeAU:     1.1,    // AU — ciężki transport: skromne sensory (reforma detekcji)
    fuelCapacity:      18,
    fuelPerAU:         0.7,
    range:             26,
    speedAU:           0.7,
    cargoCapacity:     0,
    fuelType:          'fuel',
    cost:              { Fe: 200, Ti: 35, Cu: 18 },
    commodityCost:     { structural_alloys: 15, polymer_composites: 6, reactive_armor: 5 },
    upkeepCredits:     500,    // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         12.0,
    maxSurge:          3,
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
    descEN:            'Large hull — 9 slots (3 propulsion + 6 utility). Heavy and expensive. Requires a launcher.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Kadłuby bojowe (Faza 4) — zoptymalizowane pod combat
  // ══════════════════════════════════════════════════════════════════════════

  hull_frigate: {
    id:                'hull_frigate',
    namePL:            'Fregata',
    nameEN:            'Frigate',
    icon:              '⚔',
    size:              'small',
    baseMass:          40,     // tony
    baseModuleSlots:   4,
    baseFuelCapacity:  10,
    baseSpeedAU:       1.2,
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.4,
    fuelCapacity:      10,
    fuelPerAU:         0.4,
    range:             25,
    speedAU:           1.2,
    cargoCapacity:     0,
    fuelType:          'fuel',
    baseHP:            120,      // więcej HP niż zwiadowca
    baseEvasion:       0.20,     // wciąż zwrotna
    baseArmor:         2,        // wbudowany lekki pancerz
    sensorRangeAU:     1.6,      // AU — lekki okręt: dobre sensory bojowe (reforma detekcji)
    cost:              { Fe: 100, Ti: 20, Cu: 10 },
    commodityCost:     { structural_alloys: 6, reactive_armor: 4, electronic_systems: 2 },
    upkeepCredits:     300,    // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         5.0,
    maxSurge:          2,
    crewCost:          0.1,
    crewStrata:        'mix',
    requires:          'point_defense',
    slots: [
      { type: 'propulsion' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
    ],
    description:       'Lekki okręt bojowy — 4 sloty (1 napęd + 3 użytkowe). Wbudowany pancerz lekki.',
    descEN:            'Light warship — 4 slots (1 propulsion + 3 utility). Built-in light armor.',
  },

  hull_destroyer: {
    id:                'hull_destroyer',
    namePL:            'Niszczyciel',
    nameEN:            'Destroyer',
    icon:              '🛡',
    size:              'medium',
    baseMass:          80,     // tony
    baseModuleSlots:   6,
    baseFuelCapacity:  15,
    baseSpeedAU:       0.9,
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.55,
    fuelCapacity:      15,
    fuelPerAU:         0.55,
    range:             27,
    speedAU:           0.9,
    cargoCapacity:     0,
    fuelType:          'fuel',
    baseHP:            220,      // mocny kadłub
    baseEvasion:       0.10,
    baseArmor:         4,        // ciężki wbudowany pancerz
    sensorRangeAU:     1.4,      // AU — średni okręt bojowy (reforma detekcji)
    cost:              { Fe: 180, Ti: 40, Cu: 15, Hv: 5 },
    commodityCost:     { structural_alloys: 12, reactive_armor: 8, electronic_systems: 4 },
    upkeepCredits:     500,    // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         9.0,
    maxSurge:          3,
    crewCost:          0.15,
    crewStrata:        'mix',
    requires:          'point_defense',
    slots: [
      { type: 'propulsion' },
      { type: 'propulsion' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
    ],
    description:       'Średni okręt bojowy — 6 slotów (2 napędy + 4 użytkowe). Ciężki pancerz, duże HP.',
    descEN:            'Medium warship — 6 slots (2 propulsion + 4 utility). Heavy armor, high HP.',
  },

  hull_cruiser: {
    id:                'hull_cruiser',
    namePL:            'Krążownik',
    nameEN:            'Cruiser',
    icon:              '🚀',
    size:              'large',
    baseMass:          140,    // tony — ciężki okręt
    baseModuleSlots:   8,
    baseFuelCapacity:  22,
    baseSpeedAU:       0.7,    // AU/rok — powolny
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.75,
    fuelCapacity:      22,
    fuelPerAU:         0.75,
    range:             29,
    speedAU:           0.7,
    cargoCapacity:     0,
    fuelType:          'fuel',
    baseHP:            350,      // capital-class HP
    baseEvasion:       0.05,     // duży cel
    baseArmor:         5,        // ciężki pancerz kompozytowy
    sensorRangeAU:     1.3,      // AU — capital: sensory ustępują uzbrojeniu (reforma detekcji)
    cost:              { Fe: 280, Ti: 70, Cu: 25, Hv: 12 },
    commodityCost:     { structural_alloys: 22, reactive_armor: 14, electronic_systems: 8, pressure_modules: 4 },
    upkeepCredits:     1000,   // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         15.0,
    maxSurge:          4,
    crewCost:          0.25,
    crewStrata:        'mix',
    requires:          'point_defense',
    slots: [
      { type: 'propulsion' },
      { type: 'propulsion' },
      { type: 'propulsion' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
      { type: 'utility' },
    ],
    description:       'Ciężki okręt desantowy — 8 slotów (3 napędy + 5 użytkowych). Mieści troop bay L lub 2× troop bay M. Podstawa pełnoskalowej inwazji.',
    descEN:            'Heavy assault ship — 8 slots (3 propulsion + 5 utility). Fits one troop bay L or 2× troop bay M. Backbone of full-scale invasion.',
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
