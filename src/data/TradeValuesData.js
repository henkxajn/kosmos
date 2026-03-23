// TradeValuesData — ceny bazowe, priorytety i kwalifikacja towarów do handlu cywilnego
//
// BASE_PRICE:         goodId → cena bazowa (Kr) — podstawa do kalkulacji wartości transferów
// scarcityMultiplier: stock vs roczna konsumpcja → mnożnik ceny (dynamiczny)
// routingPriority:    goodId → priorytet routingu (wyższy = pilniejszy transfer)
// TRADEABLE_GOODS:    lista goodId dopuszczonych do handlu (bez prefabów)

import { COMMODITIES } from './CommoditiesData.js';

// ── Ceny bazowe (Kr za jednostkę) ──────────────────────────────────────────
// Surowce wydobywane, towary T1–T5, dobra konsumpcyjne
export const BASE_PRICE = {
  // Surowce wydobywane (raw)
  Fe:   1,
  C:    1,
  Si:   1.5,
  Cu:   2,
  Ti:   4,
  Li:   5,
  W:    6,
  Pt:   10,
  Xe:   12,
  Nt:   15,

  // Zasoby bazowe
  food:   2,
  water:  2,
  energy: 1,

  // ── T1 commodities ────────────────────────────────────────
  steel_plates:       5,
  polymer_composites: 5,
  concrete_mix:       6,
  copper_wiring:      5,

  // ── T1 consumer goods ─────────────────────────────────────
  spare_parts:          4,
  pharmaceuticals:      5,
  life_support_filters: 4,
  synthetics:           4,
  stimulants:           5,

  // ── T2 commodities ────────────────────────────────────────
  power_cells:        12,
  electronics:        15,
  food_synthesizers:  14,
  mining_drills:      13,
  hull_armor:         16,
  habitat_modules:    18,
  water_recyclers:    12,
  automation_droid:   20,
  composite_alloy:    18,
  bio_samples:        16,

  // ── T2 consumer goods ─────────────────────────────────────
  personal_electronics: 14,
  gourmet_food:         12,

  // ── T3 commodities ────────────────────────────────────────
  semiconductors:      35,
  ion_thrusters:       40,
  fusion_cores:        50,
  nanotech_filters:    45,
  power_cells_mk2:     30,
  exotic_alloy:        55,
  quantum_processors:  60,
  fusion_cells:        45,
  superconductors:     50,

  // ── T4 commodities ────────────────────────────────────────
  quantum_cores:       100,
  antimatter_cells:    120,

  // ── T5 commodities ────────────────────────────────────────
  warp_cores:          200,
};

// ── Mnożnik niedoboru (dynamiczny) ──────────────────────────────────────────
// stock / annualConsumption → ile lat zapasu → mnożnik ceny
export function scarcityMultiplier(stock, annualConsumption) {
  if (annualConsumption <= 0) return 0.2;  // brak konsumpcji = tanio
  const yearsOfSupply = stock / annualConsumption;
  if (yearsOfSupply > 10) return 0.2;
  if (yearsOfSupply > 5)  return 0.5;
  if (yearsOfSupply > 2)  return 1.0;
  if (yearsOfSupply > 0.5) return 2.0;
  return 5.0;
}

// ── Priorytet routingu ──────────────────────────────────────────────────────
// Wyższy = pilniejszy transfer w sytuacji ograniczonego TC
const PRIORITY_MAP = {
  food: 5, water: 5, energy: 4,
  // functioning consumer goods
  spare_parts: 3, pharmaceuticals: 3, life_support_filters: 3,
  // comfort consumer goods
  synthetics: 2, personal_electronics: 2,
  // luxury consumer goods
  gourmet_food: 1, stimulants: 1, semiconductors: 1,
};

export function routingPriority(goodId) {
  if (PRIORITY_MAP[goodId] != null) return PRIORITY_MAP[goodId];
  // Commodities wg tieru
  const comm = COMMODITIES[goodId];
  if (comm) {
    if (comm.tier >= 3) return 4;  // T3+ — cenne, priorytetowe
    if (comm.tier === 2) return 2;
    return 1;  // T1
  }
  // Surowce wydobywane
  return 2;
}

// ── Lista towarów dopuszczonych do handlu ───────────────────────────────────
// Explicite: bez prefabów (isPrefab), bez research
export const TRADEABLE_GOODS = Object.keys(BASE_PRICE).filter(id => {
  if (id === 'research') return false;  // research nie handluje
  const comm = COMMODITIES[id];
  if (comm?.isPrefab) return false;
  return true;
});
