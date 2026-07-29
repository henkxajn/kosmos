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

// Slice 5A tuning — runaway wzrostu przy skali: bez capa peak (h=cap/2) sięga ~2.3/civYr
// (pop 100+ ze świeżym housingiem) → skok bezrobocia → crush satysfakcji. Dwie dźwignie (tunable):
export const MAX_GROWTH_PER_YEAR = 0.25;  // ABSOLUTNY cap /civYear — plateau ~3 POP/gameYr (0.25×12). POINT 2 re-gate: 1.0→0.25 (kadencja „1 POP/game-month" była POPRAWNA, nie leak — tylko za szybka; probe-growth-cadence.mjs)
export const GROWTH_TAPER_SCALE  = 400;   // taper bazowego tempa: rate ×= S/(S+humans) — łagodny per-capita
                                          // slowdown (głównie ogon >150 pop); DUŻA wartość ≈ wyłącza taper.

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
export const SAT_K_UNEMP     = 2;     // Slice 5A: 3→2 — człon zatrudnienia zeruje przy 50% bezrobocia
                                      // (nie 33%); + floor-at-0 w _updateSatisfaction (nie schodzi w minus).
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
export const FOCUS_BONUS_MAX    = 1.0;   // Slice 5A: 0.25→1.0 — focus steruje NOWY wzrost/bezrobotnych
                                         // mocniej (pressure→wage→Etap1/2). ⚠ na w pełni obsadzonej STATYCZNEJ
                                         // kolonii focus dalej bezczynny (brak wolnych etatów) — pełny fix
                                         // (focus jako cel struktury, over-fill) należy do Slice 5C.

// ── Mnożnik handlu z zatrudnienia w przemyśle (Faza 3, §3.7) ────────────────
// trade = civilianTradeIncome × (1 + K_TRADE × industryEmploymentShare),
// gdzie industryEmploymentShare = zatrudnieni {laborer,miner,worker} / wszyscy zatrudnieni.
export const K_TRADE = 0.5;
