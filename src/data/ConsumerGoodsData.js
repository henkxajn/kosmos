// src/data/ConsumerGoodsData.js
// Dane popytu na dobra konsumpcyjne - używane przez ProsperitySystem
// 3 dobra: basic_supplies (functioning), civilian_goods (comfort), neurostimulants (luxury)

export const BASE_DEMAND = {
    basic_supplies:   0.15,  // per POP per rok
    civilian_goods:   0.12,
    neurostimulants:  0.08,
};

// Mnożniki temperatury planety (temperatureC)
// Klucze: 'hot' (>77C), 'moderate' (-53C do 77C), 'cold' (<-53C)
export const TEMP_MULTIPLIERS = {
    hot:      { basic_supplies: 1.3, civilian_goods: 0.8, neurostimulants: 1.2 },
    moderate: { basic_supplies: 1.0, civilian_goods: 1.0, neurostimulants: 1.0 },
    cold:     { basic_supplies: 1.4, civilian_goods: 1.3, neurostimulants: 1.1 },
};

// Mnożniki atmosfery planety
export const ATMO_MULTIPLIERS = {
    none:       { basic_supplies: 2.0, civilian_goods: 1.3, neurostimulants: 1.3 },
    thin:       { basic_supplies: 1.3, civilian_goods: 1.1, neurostimulants: 1.1 },
    breathable: { basic_supplies: 0.8, civilian_goods: 1.0, neurostimulants: 1.0 },
    dense:      { basic_supplies: 1.5, civilian_goods: 1.2, neurostimulants: 1.0 },
};

// Mnożniki grawitacji powierzchniowej (surfaceGravity w g)
// Klucze: 'low' (<0.4g), 'normal' (0.4-1.5g), 'high' (>1.5g)
export const GRAV_MULTIPLIERS = {
    low:    { basic_supplies: 1.0, civilian_goods: 1.0, neurostimulants: 1.2 },
    normal: { basic_supplies: 1.0, civilian_goods: 1.0, neurostimulants: 1.0 },
    high:   { basic_supplies: 1.3, civilian_goods: 1.2, neurostimulants: 1.3 },
};

// Epoki cywilizacyjne
export const EPOCHS = {
    early:      { minScore: 0,   demandMult: 0.5, unlockedGoods: ['basic_supplies'] },
    developing: { minScore: 100, demandMult: 1.0, unlockedGoods: ['basic_supplies', 'civilian_goods'] },
    advanced:   { minScore: 300, demandMult: 1.3, unlockedGoods: ['basic_supplies', 'civilian_goods', 'neurostimulants'] },
    cosmic:     { minScore: 600, demandMult: 1.5, unlockedGoods: ['basic_supplies', 'civilian_goods', 'neurostimulants'] },
};

// Wagi warstw prosperity
export const PROSPERITY_WEIGHTS = {
    survival:       30,  // food + water + energy
    infrastructure: 20,  // housing + employment
    functioning:    25,  // basic_supplies
    comfort:        15,  // civilian_goods
    luxury:         10,  // neurostimulants
};

// Progi satisfaction (ratio produkcja/demand -> procent satisfaction)
export const SATISFACTION_THRESHOLDS = [
    { minRatio: 1.5, satisfaction: 1.0 },   // duża nadwyżka
    { minRatio: 1.0, satisfaction: 0.8 },   // pokryty
    { minRatio: 0.5, satisfaction: 0.5 },   // niedobór
    { minRatio: 0.2, satisfaction: 0.2 },   // poważny niedobór
    { minRatio: 0.0, satisfaction: 0.0 },   // brak
];

// Mapowanie warstw na towary
export const LAYER_GOODS = {
    functioning: ['basic_supplies'],
    comfort:     ['civilian_goods'],
    luxury:      ['neurostimulants'],
};

// Efekty prosperity na gameplay
export const PROSPERITY_EFFECTS = [
    { maxProsperity: 15,  growthMult: 0.2, researchMult: 1.0, crisisRisk: true },
    { maxProsperity: 30,  growthMult: 0.4, researchMult: 1.0, crisisRisk: false },
    { maxProsperity: 50,  growthMult: 0.6, researchMult: 1.0, crisisRisk: false },
    { maxProsperity: 65,  growthMult: 0.8, researchMult: 1.0, crisisRisk: false },
    { maxProsperity: 80,  growthMult: 1.0, researchMult: 1.05, crisisRisk: false },
    { maxProsperity: 100, growthMult: 1.2, researchMult: 1.1, crisisRisk: false },
];
