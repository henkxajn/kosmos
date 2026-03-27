// TradeValuesData — ceny bazowe, priorytety i kwalifikacja towarów do handlu cywilnego
//
// BASE_PRICE:         goodId → cena bazowa (Kr) — odzwierciedla koszt surowców + marżę
// scarcityMultiplier: stock vs konsumpcja/zapasy → mnożnik ceny (dynamiczny)
//   - Towary z ciągłą konsumpcją (food, consumer goods): flow-based (płynna krzywa)
//   - Commodities bez ciągłej konsumpcji: stock-threshold based
// routingPriority:    goodId → priorytet routingu (wyższy = pilniejszy transfer)
// TRADEABLE_GOODS:    lista goodId dopuszczonych do handlu

import { COMMODITIES } from './CommoditiesData.js';

// ── Ceny bazowe (Kr za jednostkę) ──────────────────────────────────────────
// Formuła: koszt surowców w recepturze × 1.3 (marża za przetworzenie)
// T3+: uwzględnia wartość sub-commodities, bracket per tier
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

  // ── T1 commodities (koszt surowców × 1.3) ──────────────────
  structural_alloys:    16,   // Fe:8(8) + C:4(4) = 12 → ×1.3 = 16
  polymer_composites:   20,   // C:10(10) + Si:4(6) = 16 → ×1.3 = 20
  conductor_bundles:    22,   // Cu:8(16) + C:2(2) = 18 → ×1.3 = 22
  extraction_systems:   35,   // Fe:6(6) + C:6(6) + Hv:2(16) = 28 → ×1.3 = 35

  // ── T1 consumer goods ───────────────────────────────────────
  basic_supplies:       10,   // Fe:3(3) + C:3(3) + Cu:1(2) = 8 → ×1.3 = 10
  civilian_goods:       18,   // C:4(4) + Si:3(4.5) + Li:1(5) = 13.5 → ×1.3 = 18

  // ── T2 commodities (koszt surowców × 1.3) ──────────────────
  power_cells:          50,   // Li:6(30) + Cu:4(8) + Si:2(3) = 41 → ×1.3 = 50
  pressure_modules:     50,   // Ti:6(24) + Fe:4(4) + Si:4(6) + Cu:2(4) = 38 → ×1.3 = 50
  electronic_systems:   30,   // Si:8(12) + Cu:5(10) + C:2(2) = 24 → ×1.3 = 30
  reactive_armor:       70,   // Ti:7(28) + Fe:5(5) + Hv:3(24) = 57 → ×1.3 = 70
  compact_bioreactor:   35,   // C:8(8) + water:3(6) + Cu:3(6) + Li:1(5) = 25 → ×1.3 = 35

  // ── T2 consumer goods ───────────────────────────────────────
  neurostimulants:      25,   // Li:3(15) + C:2(2) + water:1(2) = 19 → ×1.3 = 25

  // ── T3 commodities (bracket 80–160 Kr) ─────────────────────
  android_worker:       160,  // wymaga 5×electronic + 3×semiconductor + 2×polymer
  plasma_cores:         100,  // Ti:8 + Hv:6 + Li:4 → surowe 100
  semiconductor_arrays:  90,  // Si:10 + Cu:4 + Hv:2 + Xe:1 → surowe 51 + czas
  propulsion_systems:   100,  // Ti:6 + Xe:4 + Hv:3 + Cu:4 + Li:2 → surowe 114
  quantum_processors:   120,  // Si:8 + Hv:4 + Xe:3 + Nt:2 → surowe 110
  metamaterials:        110,  // Ti:6 + Hv:5 + Xe:2 + Si:4 → surowe 94

  // ── T4 commodities (bracket 200–300 Kr) ─────────────────────
  quantum_cores:        250,  // rzadkie surowce + ogromny czas (8 lat)
  antimatter_cells:     280,  // Nt + Xe + Hv + Li → surowe 142 + ekstremalny czas

  // ── T5 commodities ──────────────────────────────────────────
  warp_cores:           500,  // 2×quantum_cores + 2×antimatter + Ti:8 → endgame
};

// ── Mnożnik niedoboru — HYBRYDOWY ─────────────────────────────────────────
//
// Towary z ciągłą konsumpcją (food, water, consumer goods, surowce zużywane
// przez fabryki): flow-based z PŁYNNĄ krzywą zamiast schodków.
//
// Commodities bez ciągłej konsumpcji (T1-T5 nie-consumer): stock-threshold.
// Próg zależy od poziomu zapasów vs minimalny potrzebny bufor.
//
export function scarcityMultiplier(stock, annualConsumption) {
  // ── Flow-based: towary z realną konsumpcją ────────────────
  if (annualConsumption > 0.01) {
    const y = stock / annualConsumption; // lata zapasu
    // Płynna interpolacja liniowa między progami
    if (y > 10)  return 0.2;
    if (y > 5)   return 0.2 + (10 - y) / 5 * 0.3;       // 0.2 → 0.5
    if (y > 2)   return 0.5 + (5 - y)  / 3 * 0.5;        // 0.5 → 1.0
    if (y > 0.5) return 1.0 + (2 - y)  / 1.5 * 1.0;      // 1.0 → 2.0
    if (y > 0)   return 2.0 + (0.5 - y) / 0.5 * 1.0;     // 2.0 → 3.0
    return 3.0;
  }

  // ── Stock-threshold: commodities bez ciągłej konsumpcji ───
  // Progi uniwersalne — wartość tier jest już w BASE_PRICE
  if (stock <= 0)  return 3.0;   // brak → kupiec desperacki
  if (stock < 3)   return 2.0;   // poważny niedobór
  if (stock < 5)   return 1.5;   // niewielki niedobór
  if (stock < 10)  return 1.0;   // zbalansowany
  if (stock < 20)  return 0.5;   // nadwyżka
  return 0.3;                    // duża nadwyżka
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
