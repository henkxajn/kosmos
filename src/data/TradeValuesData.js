// TradeValuesData — ceny bazowe, priorytety i kwalifikacja towarów do handlu cywilnego
//
// BASE_PRICE:         goodId → cena bazowa (Kr) — podstawa do kalkulacji wartości transferów
// scarcityMultiplier: stock vs roczna konsumpcja → mnożnik ceny (dynamiczny)
// routingPriority:    goodId → priorytet routingu (wyższy = pilniejszy transfer)
// TRADEABLE_GOODS:    lista goodId dopuszczonych do handlu

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
  Hv:   8,
  Xe:   12,
  Nt:   15,

  // Zasoby bazowe
  food:   2,
  water:  2,
  energy: 1,

  // ── T1 commodities ────────────────────────────────────────
  structural_alloys:    5,
  polymer_composites:   5,
  conductor_bundles:    5,
  extraction_systems:   7,

  // ── T1 consumer goods ─────────────────────────────────────
  basic_supplies:       4,
  civilian_goods:       5,

  // ── T2 commodities ────────────────────────────────────────
  power_cells:          12,
  pressure_modules:     18,
  electronic_systems:   15,
  reactive_armor:       16,
  compact_bioreactor:   14,

  // ── T2 consumer goods ─────────────────────────────────────
  neurostimulants:      10,

  // ── T3 commodities ────────────────────────────────────────
  android_worker:       40,
  plasma_cores:         50,
  semiconductor_arrays: 35,
  propulsion_systems:   40,
  quantum_processors:   60,
  metamaterials:        55,

  // ── T4 commodities ────────────────────────────────────────
  quantum_cores:        100,
  antimatter_cells:     120,

  // ── T5 commodities ────────────────────────────────────────
  warp_cores:           200,
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
  basic_supplies: 3,
  // comfort consumer goods
  civilian_goods: 2,
  // luxury consumer goods
  neurostimulants: 1,
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
export const TRADEABLE_GOODS = Object.keys(BASE_PRICE).filter(id => {
  if (id === 'research') return false;
  return true;
});
