// src/data/ConsumerGoodsData.js
// Dane popytu na dobra konsumpcyjne - używane przez ProsperitySystem

export const BASE_DEMAND = {
    spare_parts:          0.15,  // per POP per rok
    pharmaceuticals:      0.10,
    life_support_filters: 0.10,
    synthetics:           0.10,
    personal_electronics: 0.08,
    gourmet_food:         0.06,
    stimulants:           0.06,
    semiconductors:       0.03,
};

// Mnożniki temperatury planety (temperatureC)
// Klucze: 'hot' (>77C), 'moderate' (-53C do 77C), 'cold' (<-53C)
export const TEMP_MULTIPLIERS = {
    hot:      { spare_parts: 1.5, pharmaceuticals: 1.0, life_support_filters: 1.2, synthetics: 0.7, personal_electronics: 1.3, gourmet_food: 1.0, stimulants: 1.2, semiconductors: 1.0 },
    moderate: { spare_parts: 1.0, pharmaceuticals: 1.0, life_support_filters: 1.0, synthetics: 1.0, personal_electronics: 1.0, gourmet_food: 1.0, stimulants: 1.0, semiconductors: 1.0 },
    cold:     { spare_parts: 1.3, pharmaceuticals: 1.2, life_support_filters: 1.2, synthetics: 1.5, personal_electronics: 1.0, gourmet_food: 1.2, stimulants: 1.0, semiconductors: 1.0 },
};

// Mnożniki atmosfery planety
export const ATMO_MULTIPLIERS = {
    none:       { spare_parts: 1.5, pharmaceuticals: 1.5, life_support_filters: 3.0, synthetics: 1.3, personal_electronics: 1.0, gourmet_food: 1.5, stimulants: 1.3, semiconductors: 1.0 },
    thin:       { spare_parts: 1.2, pharmaceuticals: 1.2, life_support_filters: 1.5, synthetics: 1.1, personal_electronics: 1.0, gourmet_food: 1.2, stimulants: 1.1, semiconductors: 1.0 },
    breathable: { spare_parts: 1.0, pharmaceuticals: 0.8, life_support_filters: 0.5, synthetics: 1.0, personal_electronics: 1.0, gourmet_food: 0.7, stimulants: 1.0, semiconductors: 1.0 },
    dense:      { spare_parts: 1.3, pharmaceuticals: 1.0, life_support_filters: 1.8, synthetics: 1.2, personal_electronics: 1.2, gourmet_food: 1.0, stimulants: 1.0, semiconductors: 1.0 },
};

// Mnożniki grawitacji powierzchniowej (surfaceGravity w g)
// Klucze: 'low' (<0.4g), 'normal' (0.4-1.5g), 'high' (>1.5g)
export const GRAV_MULTIPLIERS = {
    low:    { spare_parts: 1.0, pharmaceuticals: 1.4, life_support_filters: 1.0, synthetics: 1.0, personal_electronics: 1.0, gourmet_food: 1.0, stimulants: 1.2, semiconductors: 1.0 },
    normal: { spare_parts: 1.0, pharmaceuticals: 1.0, life_support_filters: 1.0, synthetics: 1.0, personal_electronics: 1.0, gourmet_food: 1.0, stimulants: 1.0, semiconductors: 1.0 },
    high:   { spare_parts: 1.3, pharmaceuticals: 1.2, life_support_filters: 1.0, synthetics: 1.3, personal_electronics: 1.0, gourmet_food: 1.2, stimulants: 1.3, semiconductors: 1.0 },
};

// Epoki cywilizacyjne
export const EPOCHS = {
    early:      { minScore: 0,   demandMult: 0.5, unlockedGoods: ['spare_parts', 'pharmaceuticals', 'life_support_filters'] },
    developing: { minScore: 100, demandMult: 1.0, unlockedGoods: ['spare_parts', 'pharmaceuticals', 'life_support_filters', 'synthetics', 'personal_electronics'] },
    advanced:   { minScore: 300, demandMult: 1.3, unlockedGoods: ['spare_parts', 'pharmaceuticals', 'life_support_filters', 'synthetics', 'personal_electronics', 'gourmet_food', 'stimulants'] },
    cosmic:     { minScore: 600, demandMult: 1.5, unlockedGoods: ['spare_parts', 'pharmaceuticals', 'life_support_filters', 'synthetics', 'personal_electronics', 'gourmet_food', 'stimulants', 'semiconductors'] },
};

// Wagi warstw prosperity
export const PROSPERITY_WEIGHTS = {
    survival:       25,  // food + water + energy
    infrastructure: 15,  // housing + employment
    functioning:    25,  // spare_parts + pharma + life_support
    comfort:        20,  // synthetics + electronics
    luxury:         15,  // gourmet + stimulants + semiconductors
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
    functioning: ['spare_parts', 'pharmaceuticals', 'life_support_filters'],
    comfort:     ['synthetics', 'personal_electronics'],
    luxury:      ['gourmet_food', 'stimulants', 'semiconductors'],
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
