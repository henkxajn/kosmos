// SeedMath — wspólne prymitywy deterministycznego losowania ze STRUKTURALNYCH ziaren.
//
// Wydzielone z `AcceptanceMath.js` (Director Slice 1, commit S1). Powód wydzielenia jest
// architektoniczny, nie kosmetyczny: pin **P14** (`acceptance_engine_smoke`) trzyma import
// modułów `Acceptance*` WYŁĄCZNIE w `DiplomacySystem`, żeby balans akceptacji nie dorobił
// się drugiej ścieżki decyzyjnej. Gdy `DirectorRuleMath` potrzebował tych samych prymitywów,
// były trzy wyjścia: (a) poluzować pin — psuje realną gwarancję; (b) trzecia kopia funkcji —
// dług, na który kod narzekał już DWA razy; (c) wydzielić. Wybrane (c).
//
// ⚠ `AcceptanceMath.js` RE-EKSPORTUJE te trzy funkcje, więc każdy dotychczasowy import
// (`AcceptanceEngine`, `acceptance_engine_smoke`) działa BEZ ZMIAN — to jest przenosiny,
// nie zmiana API.
//
// 📌 DŁUG, KTÓREGO TEN COMMIT ŚWIADOMIE NIE SPŁACA: `EmpireGenerator.js:66` ma WŁASNĄ,
// prywatną kopię `mixSeed` (dodaną w `0b15d95`). Nie jest scalana tutaj, bo na tym pliku
// stoją piny GALAXY_SEED, a S1 nie ma powodu ich ruszać. Scalić przy najbliższej pracy
// nad generatorem imperiów.
//
// CZYSTY moduł: bez `window`, bez `Math.random`, bez stanu.

/**
 * Finalizer splitmix32 — rozprasza STRUKTURALNE wejścia.
 *
 * Powód istnienia (lekcja z `0b15d95`): seedy bywają prawie kolejnymi liczbami, a
 * pierwszy rzut świeżego mulberry32 dla takich wejść jest słabo rozrzucony — kolizje
 * zdarzały się częściej niż losowo. NIGDY nie czytamy pierwszego rzutu surowego seeda.
 *
 * @param {number} n
 * @returns {number} uint32
 */
export function mixSeed(n) {
  let z = (Number(n) || 0) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

/** Hash stringa do int32 — ten sam wariant, którego używa reszta projektu (djb2-ish). */
export function hashStringToInt(str) {
  const s = String(str ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Deterministyczny szum −1..+1 z ziarna. Rozgrzany: bierzemy WYJŚCIE finalizera,
 * a nie pierwszy rzut generatora zasianego surową liczbą (patrz mixSeed).
 */
export function noiseUnit(seed) {
  return (mixSeed(seed) / 4294967296) * 2 - 1;
}
