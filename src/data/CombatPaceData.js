// POLISH P1 (CP1, CP4) — tempo starcia w przestrzeni: SIATKA STARCIA. Plan i decyzje: `docs/design/POLISH_PLAN.md`.
//
// Gdy trwa starcie `DeepSpaceCombatSystem`, świat tyka na stałej siatce — klatka 16 ms przy 1 d/s, czyli dzisiejsza
// klatka 60 FPS przy auto-slow — niezależnie od prędkości ustawionej przez gracza i od FPS; runda pada co 110 ms zegara
// starcia (dzisiejsza reguła rund). Czas realny decyduje WYŁĄCZNIE o tempie odtwarzania siatki: starcie oglądane — czas
// rundy oglądanego starcia (klucz `combatRoundMs`), starcie w innym układzie — dzisiejsze 110 ms. Wynik od tempa nie zależy.
// Konsumenci: `TimeSystem` (siatka i tempo), `DeepSpaceCombatSystem` (reguła rund).
// ⚠ ZERO importów — moduł danych.

/** Reguła rund DSCS: runda co tyle ms ZEGARA STARCIA (`DeepSpaceCombatSystem.ROUND_INTERVAL_MS`). */
export const COMBAT_ROUND_RULE_MS = 110;

/** Klatka siatki starcia (ms zegara starcia na jeden tik gry) — dzisiejsza klatka 60 FPS. */
export const COMBAT_GRID_FRAME_MS = 16;

/** Prędkość siatki: indeks `GAME_CONFIG.TIME_MULTIPLIERS` (1 = 1 d/s — cel auto-slow przy starciu). */
export const COMBAT_GRID_SPEED_INDEX = 1;

/** Najwięcej klatek siatki na jedną klatkę gry; tyle samo wynosi największa zaległość siatki (≈ 1 runda). */
export const COMBAT_GRID_MAX_FRAMES = 8;

/** CP4 — starcie w układzie, którego gracz nie ogląda: dzisiejsze tempo, ms czasu realnego na rundę (= reguła rund).
 *  Starcie oglądane — klucz strojenia `combatRoundMs` (`StrikesBackData`, CP2). */
export const COMBAT_UNWATCHED_ROUND_MS = COMBAT_ROUND_RULE_MS;
