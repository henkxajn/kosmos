// DysonData — definicje 20 segmentów Sfery Dysona w 4 fazach (Faza D3)
//
// Sfera Dysona to główny megaprojekt endgame. 20 segmentów w 4 fazach.
// Gracz dostarcza surowce kiedy chce i ile chce — to budowa katedry.
// Każdy ukończony segment daje +5 research/rok permanentnie.
// Wizualna progresja gwiazdy w ThreeRenderer (5 etapów).
//
// Fazy odblokowywane przez techy:
//   Phase 1 (Fundament): dyson_engineering
//   Phase 2 (Zbiór Energii): dyson_collector
//   Phase 3 (Transmisja): dyson_collector
//   Phase 4 (Brama Skoku): dyson_transmitter
//   Segment 20 (Aktywacja Bramy): jump_gate_construction (dodatkowe wymaganie)

export const DYSON_PHASES = [
  {
    id:        'phase_1',
    namePL:    'Fundament Orbitalny',
    nameEN:    'Orbital Foundation',
    segments:  [1, 2, 3, 4, 5, 6],
    // Odblokowana po dyson:engineeringUnlocked
  },
  {
    id:           'phase_2',
    namePL:       'Zbiór Energii',
    nameEN:       'Energy Collection',
    segments:     [7, 8, 9, 10, 11],
    requiresTech: 'dyson_collector',
  },
  {
    id:           'phase_3',
    namePL:       'Transmisja',
    nameEN:       'Transmission',
    segments:     [12, 13, 14, 15],
    requiresTech: 'dyson_collector',
  },
  {
    id:           'phase_4',
    namePL:       'Brama Skoku',
    nameEN:       'Jump Gate',
    segments:     [16, 17, 18, 19, 20],
    requiresTech: 'dyson_transmitter',
  },
];

export const DYSON_SEGMENTS = {
  // ── FAZA I — Fundament (Fe, Si, Cu, Ti) ──────────────────────
  1:  { namePL: 'Szkielet Orbitalny',    nameEN: 'Orbital Skeleton',
        cost: { Fe: 5000, Si: 2000 } },
  2:  { namePL: 'Węzły Kotwiczące',      nameEN: 'Anchor Nodes',
        cost: { Fe: 3000, Cu: 1000, Ti: 200 } },
  3:  { namePL: 'Rdzenie Stabilizacji',  nameEN: 'Stabilization Cores',
        cost: { Fe: 4000, Si: 1500, Ti: 300 } },
  4:  { namePL: 'Platforma Serwisowa',   nameEN: 'Service Platform',
        cost: { Fe: 3500, Si: 2000, Cu: 800 } },
  5:  { namePL: 'Mosty Łączące',         nameEN: 'Connecting Bridges',
        cost: { Fe: 6000, Si: 3000, Ti: 400 } },
  6:  { namePL: 'Osłony Termiczne',      nameEN: 'Thermal Shields',
        cost: { Si: 4000, Cu: 1500, Ti: 300 } },

  // ── FAZA II — Zbiór Energii (Si, Cu, Li, Nt) ─────────────────
  7:  { namePL: 'Panele Fotowolt. I',    nameEN: 'Photovoltaic Panels I',
        cost: { Si: 8000, Cu: 3000, Nt: 10 } },
  8:  { namePL: 'Panele Fotowolt. II',   nameEN: 'Photovoltaic Panels II',
        cost: { Si: 8000, Cu: 3000, Nt: 10 } },
  9:  { namePL: 'Konwertery Energii',    nameEN: 'Energy Converters',
        cost: { Si: 4000, Cu: 4000, Li: 1500, Nt: 20 } },
  10: { namePL: 'Akumulatory Orbitalne', nameEN: 'Orbital Accumulators',
        cost: { Cu: 2000, Li: 4000 } },
  11: { namePL: 'Sieć Dystrybucji',      nameEN: 'Distribution Network',
        cost: { Si: 5000, Cu: 6000, Nt: 15 } },

  // ── FAZA III — Transmisja (Xe, Hv, Nt) ───────────────────────
  12: { namePL: 'Nadajniki Wiązek',      nameEN: 'Beam Transmitters',
        cost: { Xe: 800, Hv: 600, Nt: 80 } },
  13: { namePL: 'Rdzenie Kwantowe',      nameEN: 'Quantum Cores',
        cost: { Hv: 800, Nt: 120 } },
  14: { namePL: 'Sieć Rezonansu',        nameEN: 'Resonance Network',
        cost: { Xe: 1200, Nt: 100 } },
  15: { namePL: 'Stacja Kontrolna',      nameEN: 'Control Station',
        cost: { Xe: 500, Hv: 1000, Nt: 60 } },

  // ── FAZA IV — Brama Skoku (Nt, Hv, Xe) ──────────────────────
  16: { namePL: 'Fundament Bramy',       nameEN: 'Gate Foundation',
        cost: { Nt: 200, Hv: 2000 } },
  17: { namePL: 'Pierścień Skoku',       nameEN: 'Jump Ring',
        cost: { Nt: 400, Hv: 4000, Xe: 3000 } },
  18: { namePL: 'Kondensatory Hv',       nameEN: 'Hv Condensers',
        cost: { Nt: 800, Hv: 8000 } },
  19: { namePL: 'Rdzeń Temporalny',      nameEN: 'Temporal Core',
        cost: { Nt: 1500, Hv: 6000, Xe: 4000 } },
  20: { namePL: 'Aktywacja Bramy',       nameEN: 'Gate Activation',
        cost: { Nt: 3000, Hv: 12000, Xe: 8000 },
        requiresTech: 'jump_gate_construction' },
};

// Etap wizualny gwiazdy (5 etapów, 0-4) — używany przez ThreeRenderer.updateStarForDyson
//   0: normalna gwiazda (0 segmentów)
//   1: ledwo widoczne pierścienie (1-5 segmentów)
//   2: wyraźne pierścienie z panelami (6-11 segmentów)
//   3: wiązki energii, gwiazda przysłonięta (12-15 segmentów)
//   4: gwiazda prawie niewidoczna, fioletowe światło (16-20 segmentów)
export function getDysonVisualStage(completedCount) {
  if (completedCount === 0)  return 0;
  if (completedCount <= 5)   return 1;
  if (completedCount <= 11)  return 2;
  if (completedCount <= 15)  return 3;
  return 4;
}

// Mapa pomocnicza: segmentId → faza (id) — szybki lookup
export const SEGMENT_TO_PHASE = (() => {
  const map = {};
  for (const phase of DYSON_PHASES) {
    for (const segId of phase.segments) {
      map[segId] = phase.id;
    }
  }
  return map;
})();
