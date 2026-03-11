// ResourcesData — definicje 10 surowców wydobywalnych + 2 zbieralnych + 2 utility
//
// 4 kategorie zasobów:
//   MINED (10)      — z kopalni, zależy od złóż na ciele niebieskim
//   HARVESTED (2)   — z farm/studni, NIE kopane
//   COMMODITIES     → patrz CommoditiesData.js
//   UTILITY (2)     — flow (energia) / accumulator (nauka), nie w inventory
//
// Rarity: 1–5 (wyższy = rzadszy, trudniej o złoże)
// Weight: tony na jednostkę (do cargo capacity statków)
// Element: klucz z ElementsData — mapowanie skład chemiczny → złoże

// ── 10 surowców wydobywalnych (MINED) ──────────────────────────────────────
export const MINED_RESOURCES = {
  C:  { id: 'C',  namePL: 'Węgiel',      icon: '\u25C6', symbol: 'C',  rarity: 1, weight: 0.5, element: 'C',  color: '#555555' },
  Fe: { id: 'Fe', namePL: 'Żelazo',      icon: '🔩', symbol: 'Fe', rarity: 1, weight: 2.0, element: 'Fe', color: '#c8a870' },
  Si: { id: 'Si', namePL: 'Krzem',        icon: '💎', symbol: 'Si', rarity: 2, weight: 1.5, element: 'Si', color: '#8899aa' },
  Cu: { id: 'Cu', namePL: 'Miedź',        icon: '🟤', symbol: 'Cu', rarity: 2, weight: 1.8, element: 'Cu', color: '#cc7744' },
  Ti: { id: 'Ti', namePL: 'Tytan',        icon: '⬜', symbol: 'Ti', rarity: 3, weight: 2.2, element: 'Ti', color: '#aabbcc' },
  Li: { id: 'Li', namePL: 'Lit',          icon: '🔋', symbol: 'Li', rarity: 3, weight: 0.8, element: 'Li', color: '#88aadd' },
  W:  { id: 'W',  namePL: 'Wolfram',      icon: '⚙',  symbol: 'W',  rarity: 4, weight: 3.0, element: 'W',  color: '#6677aa' },
  Pt: { id: 'Pt', namePL: 'Platyna',      icon: '✨', symbol: 'Pt', rarity: 4, weight: 2.5, element: 'Pt', color: '#ccddee' },
  Xe: { id: 'Xe', namePL: 'Ksenon',       icon: '💜', symbol: 'Xe', rarity: 5, weight: 0.1, element: 'Xe', color: '#9966cc' },
  Nt: { id: 'Nt', namePL: 'Neutronium',   icon: '⚛',  symbol: 'Nt', rarity: 5, weight: 5.0, element: 'Nt', color: '#ff44aa' },
};

// ── 2 surowce zbieralne (HARVESTED) ────────────────────────────────────────
export const HARVESTED_RESOURCES = {
  food:  { id: 'food',  namePL: 'Żywność', icon: '🍖', weight: 0.8, color: '#88cc44' },
  water: { id: 'water', namePL: 'Woda',    icon: '💧', weight: 1.0, color: '#4488ff' },
};

// ── 2 zasoby utility (FLOW — nie w inventory) ─────────────────────────────
export const UTILITY_RESOURCES = {
  energy:   { id: 'energy',   namePL: 'Energia', icon: '⚡', color: '#ffd700' },
  research: { id: 'research', namePL: 'Nauka',   icon: '🔬', color: '#aa44ff' },
};

// ── Połączone definicje wszystkich zasobów ─────────────────────────────────
// Klucz = id zasobu, wartość = definicja
export const ALL_RESOURCES = {
  ...MINED_RESOURCES,
  ...HARVESTED_RESOURCES,
  ...UTILITY_RESOURCES,
};

// ── Ikony zasobów (compat ze starym RESOURCE_ICONS) ────────────────────────
export const RESOURCE_ICONS = {};
for (const [id, def] of Object.entries(ALL_RESOURCES)) {
  RESOURCE_ICONS[id] = def.icon;
}

// ── Stała: bazowe tempo wydobycia na kopalnie (jednostek/rok) ──────────────
export const BASE_MINE_RATE = 10; // jednostek surowca / rok / poziom kopalni przy richness=1.0

// ── Konsumpcja POP per rok ─────────────────────────────────────────────────
export const POP_CONSUMPTION = {
  food:   2.5,  // z farm lub Food Synthesizers (obniżone z 3.0 — szerszy margines)
  water:  1.5,  // ze studni
  energy: 1.0,  // z bilansu energii (flow)
};

