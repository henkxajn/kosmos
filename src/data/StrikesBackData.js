// AI STRIKES BACK (SB9, SB16) — JEDNA tabela strojenia arca. Wzór: `src/data/GarrisonData.js`.
//
// Każda liczba, której używa kod arca AI STRIKES BACK, stoi TUTAJ — razem z typem i zakresem, które sprawdza komenda
// konsoli przed przyjęciem nowej wartości. Logika odczytu, zmiany, resetu i zapisu mieszka w
// `src/utils/StrikesBackTuning.js`; wartości zmienione z konsoli jadą w zapisie gry (`gameState.strikesBackTuning`),
// brak wpisu = wartość domyślna z tej tabeli.
// ⚠ ZASADA KLUCZA (polecenie S1): klucz bez konsumenta nie wchodzi do tabeli. Kolejne slice'y (S2–S4) dokładają swoje
//   klucze RAZEM z kodem, który je czyta.
// ⚠ ZERO importów — moduł danych, node-testowalny. Kształt wpisu:
//   { default, type: 'int' | 'numberList', min, max, length?, unit }
//   'numberList' — lista liczb o stałej długości `length`; każdy element w [min, max].

export const SB_TUNING = Object.freeze({
  /**
   * SB3 — minimum limitu floty imperium (kadłuby). Limit = max(min, floor(POP / fleetPopPerHull)) × mnożnik szczebla.
   * Lustro `GARRISON_MIN_UNITS` drabiny garnizonu (ta sama klamra, osobne pokrętło).
   */
  fleetMinHulls: Object.freeze({ default: 2, type: 'int', min: 0, max: 100, unit: 'kadluby' }),

  /** SB3 — ile POP imperium przypada na jeden kadłub limitu (POP — suma pełnych kolonii, jak w limicie garnizonu). */
  fleetPopPerHull: Object.freeze({ default: 32, type: 'int', min: 1, max: 10000, unit: 'POP na kadlub' }),

  /**
   * SB3 — mnożnik limitu floty na KAŻDYM szczeblu drabiny garnizonu (indeks = szczebel `garrisonTier`, progi sumy
   * poziomów fabryk 0 / 6 / 14 / 20 — `GarrisonData.GARRISON_LADDER`). Domyślnie ×1,25 od 20 poziomów fabryk —
   * te same wartości co `limitMult` drabiny garnizonu; zgodność pilnuje keeper (`sb1_fleet_tuning_smoke` T1),
   * a zmiana drabiny garnizonu wymaga tu świadomej decyzji.
   */
  fleetRungMult: Object.freeze({ default: Object.freeze([1, 1, 1, 1.25]), type: 'numberList', length: 4, min: 0, max: 10, unit: 'mnoznik' }),
});
