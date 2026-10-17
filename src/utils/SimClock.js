// POLISH P1 (CP1, CP3, CP5) — ODCZYT zegara klatek symulacji `TimeSystem` (`simClockMs`). Plan: `docs/design/POLISH_PLAN.md`.
//
// Jedno źródło czasu dla dwóch rzeczy, które dotąd liczyły się z `performance.now()` (czas REALNY): rund starcia
// w przestrzeni (`DeepSpaceCombatSystem`) i kąta orbit statków wokół ciał (`OrbitalSpaceSystem`, `VesselManager`,
// `EnemyAttackHandler`, `ThreeRenderer` — Finding 452).
// Zegar przyrasta WYŁĄCZNIE wtedy, gdy gra tyka: poza starciem o czas realny klatki (dzisiejszy wygląd orbit), w starciu
// o klatkę siatki starcia (`CombatPaceData`). Pauza go zatrzymuje, więc po odpauzowaniu nic nie nadrabia (Finding 449).
// ⚠ Moduł niczego nie importuje i niczego nie zapisuje — czyta `window.KOSMOS.timeSystem` (service locator).

/** Zegar klatek symulacji (ms) albo `null`: gra przed pierwszym tikiem albo keeper bez prawdziwego `TimeSystem`. */
export function simClockMs() {
  const ts = (typeof window !== 'undefined') ? window.KOSMOS?.timeSystem : null;
  const ms = ts?.simClockMs;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Zegar rund starcia w przestrzeni (ms). Bez zegara klatek — STAŁA 0: zegar starcia stoi, więc starcie rozgrywa wyłącznie
 * pierwszą rundę. Celowo BEZ rezerwy czasu realnego (Finding 454 — keepery z surowym `time:tick` mają być deterministyczne).
 */
export function combatClockMs() {
  return simClockMs() ?? 0;
}

/**
 * Zegar kąta orbit statków wokół ciał (sekundy) — Finding 452. Bez zegara klatek — czas realny, jak dotąd: rysowanie
 * przed pierwszym tikiem gry (po wczytaniu na pauzie) i keepery bez prawdziwego `TimeSystem`.
 */
export function orbitClockSec() {
  const ms = simClockMs();
  return (ms ?? _realNowMs()) / 1000;
}

function _realNowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
