// PopulationData — Population 2.0 (Faza 1) — stałe redenominacji ×4, wzrostu
// logistycznego i satysfakcji. DANE oddzielone od logiki (reguła projektowa #1).
// Źródło prawdy tuningu (doc: docs/POPULATION_REDESIGN.md §7.2 — Faza 5 tuning).
//
// Redenominacja: 1 stary pop-unit = 4 nowe (POP_UNIT_SCALE). Per-unit konsumpcja/
// jobs/koszty skalowane odwrotnie, więc AGREGAT niezmieniony (balans identyczny).

import { gravityBand, temperatureBand } from './EnvironmentBands.js';

// ── Redenominacja ──────────────────────────────────────────────────────────
export const POP_UNIT_SCALE = 4;   // 1 stary pop = 4 nowe (migracja + starty + koszty)

// ── Wzrost logistyczny (§3.1) ──────────────────────────────────────────────
export const BASE_GROWTH_RATE = 0.04;   // /rok gry cywilnego, przed mnożnikami

// planetMod: iloczyn 3 pasm środowiskowych (reużycie EnvironmentBands — jedno źródło
// progów), clamp [0.6, 1.0]. IDEAŁ (oddychalna + umiarkowana + normalna grawitacja) = 1.0
// (baza, BEZ bonusu); surowe warunki spowalniają. Zgodne z weryfikacją wzrostu: breathable
// → planetMod 1.0 → growth = 0.04 × prosperityMult × humans × (1 − humans/capacity).
const TEMP_GROWTH = { moderate: 1.0, cold: 0.85, hot: 0.85 };
const ATMO_GROWTH = { breathable: 1.0, dense: 0.9, thin: 0.85, none: 0.7 };
const GRAV_GROWTH = { normal: 1.0, low: 0.9, high: 0.9 };

/** Mnożnik wzrostu z warunków planety (0.6–1.0; ideał = 1.0). */
export function planetGrowthMod(planet) {
  const tt = TEMP_GROWTH[temperatureBand(planet?.temperatureC)] ?? 1.0;
  const aa = ATMO_GROWTH[planet?.atmosphere] ?? 1.0;
  const gg = GRAV_GROWTH[gravityBand(planet?.surfaceGravity)] ?? 1.0;
  return Math.max(0.6, Math.min(1.0, tt * aa * gg));
}

// ── Satysfakcja kolonii (0–100, §3.5) ──────────────────────────────────────
// Faza 1: unemploymentRate = 0 (stała) → człon W_EMP = SAT_W_EMP na stałe.
// (Faza 2 wpina realne bezrobocie przez SAT_K_UNEMP.)
export const SAT_BASE        = 50;    // baza
export const SAT_W_EMP       = 40;    // waga zatrudnienia
export const SAT_K_UNEMP     = 3;     // mnożnik bezrobocia (Faza 2)
export const SAT_W_CROWD     = 15;    // kara za przeludnienie habitatów
export const SAT_CROWD_START = 0.85;  // >85% zapełnienia capacity = crowding rośnie od 0
export const SAT_CROWD_SPAN  = 0.15;  // pełne crowding (=1) przy 100% zapełnienia
export const SAT_W_TAX       = 100;   // mapowanie drenu podatkowego (−drain × W_TAX) na punkty

// ── Zatrudnienie / płace / migracja (Faza 2, §3.2/§3.3/§7.2) ────────────────
// Płaca bazowa per strata (Kr/pop/rok). Faza 2: LICZONA i WYŚWIETLANA (napędza
// pressure→migrację). Faza 3 wpina jako realny wydatek imperium (laborCost).
export const BASE_WAGE = {
  laborer:    1,
  miner:      1.5,
  worker:     1.5,
  engineer:   3,
  scientist:  4,
  merchant:   2,
  bureaucrat: 2,
};

// wage = baseWage × (1 + pressure), pressure ∈ [0,1] → cap płacy = ×2 bazy (§7.2).
export const MIGRATION_FRICTION = 0.10;  // max 10% straty źródłowej może migrować / rok cywilny
export const FOCUS_BONUS_MAX    = 0.25;  // slider focus: demandBonus do +25% etatów budynkowych straty
