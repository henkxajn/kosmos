// AtmosphereLogic — czysta arytmetyka powłoki atmosfery (V3 / A0 + A1).
//
// ⚠ ZERO importów, w tym three (precedens: SunAnimationLogic.js, HolotableCamera.js).
//   To JEDYNY moduł tego slice'u, który importuje się pod node, więc JEDYNY, który da się
//   przypiąć WYKONANIEM. Reguła arca (VISUALS_PLAN §Ustalenia proceduralne): ThreeRenderer
//   nie importuje się pod node, a GLSL nie jest wykonywalny w sweepie — więc wszystko, co
//   da się policzyć POZA shaderem, ma stać tutaj i mieć keeper. Bez tego cały slice V3
//   wisiałby na grepie.
//
// ⚠ Lekcja V-266 (1079cd9): żadnej funkcji bez konsumenta. Każda z trzech poniżej ma
//   go w kodzie produkcyjnym — densityMul i atmoStrengthFor od A0 (fabryka materiału
//   + _tickAtmoMaterials), discFade od A1 (_tickAtmoMaterials pisze uDiscFade). Dlatego
//   discFade weszła dopiero teraz, a nie razem z rusztowaniem.

// ── Klasa atmosfery → mnożnik siły powłoki ───────────────────────────────────
// Wartości brane z obiektu pokręteł (LIVE_ATMO), a nie zaszyte tutaj — dzięki temu
// gate zmienia je jednym tokenem w konsoli i widzi efekt w tej samej klatce.
//
// ⚠ Tabela stoi w JS, a nie w GLSL, z dwóch powodów: (1) jest czytelna i sprawdzalna
//   WYKONANIEM, (2) mnożnik wchodzi w ISTNIEJĄCY uniform uStrength, więc shader nie
//   dostaje ani jednego nowego pola (D-V3c).
//
// ⚠ FAIL-OPEN: nieznana klasa dostaje 1.0, nie 0. Wartość 'toxic' pojawia się już dziś
//   w TerrainTextures, a getAtmosphere może kiedyś dołożyć kolejną — powłoka ma prawo
//   być za jasna, nie ma prawa ZNIKNĄĆ dlatego, że generator dołożył nazwę.
//   Kierunek fail jest tu ODWROTNY niż przy mgle wojny (SystemExploration, fail-closed):
//   tam cena fałszywego pozytywu to wyciek do zapisu, tu — cena fałszywego negatywu to
//   cicho zgaszona warstwa, której nikt nie powiąże z nową nazwą klasy.
export function densityMul(atmosphereClass, knobs) {
  switch (atmosphereClass) {
    case 'thin':       return knobs.DENSITY_THIN;
    case 'dense':      return knobs.DENSITY_DENSE;
    case 'breathable': return knobs.DENSITY_BREATHABLE;
    default:           return 1.0;
  }
}

// ── Siła powłoki dla konkretnej planety ──────────────────────────────────────
// mistrz alfy × mnożnik klasy. Wynik ląduje w uniformie uStrength — tym samym, który
// powłoka ma dzisiaj, więc przy neutralnych pokrętłach A0 wychodzi dokładnie 0.55.
//
// ⚠ Brak obrony przed nieistniejącym pokrętłem jest ŚWIADOMY: literówka w nazwie pola
//   ma dać NaN i zgasić powłokę głośno, a nie po cichu podstawić 1.0. Kompletu nazw
//   pilnuje pin strukturalny keepera (wzór T12 z V2).
export function atmoStrengthFor(atmosphereClass, knobs) {
  return knobs.STRENGTH * densityMul(atmosphereClass, knobs);
}

// ── Zanik wg ŚREDNICY TARCZY na ekranie (D-V3f) ──────────────────────────────
// Pełna siła przy px >= hi, zero przy px <= lo, hermite pomiędzy — ten sam kształt,
// co GLSL-owy smoothstep, żeby wartość liczona na CPU i intuicja z shadera się zgadzały.
//
// ⚠ NEUTRALNOŚĆ JEST WBUDOWANA, nie osiągana wartościami: przy hi <= lo (w tym przy
//   shipowanym 0/0) funkcja zwraca 1.0, czyli mnożnik, którego nie widać. Dzięki temu
//   pokrętło jest ŻYWE (czytane co klatkę) i JEDNOCZEŚNIE domyślnie nic nie zmienia —
//   gate włącza je dwoma tokenami, bez rebuildu materiału.
//
// ⚠ FAIL-OPEN na nie-liczbie (ta sama stanza co densityMul): powłoka ma prawo być za
//   jasna, nie ma prawa zniknąć przez NaN, który wjechał z pomiaru kamery.
export function discFade(px, lo, hi) {
  if (!(hi > lo)) return 1.0;
  if (!Number.isFinite(px)) return 1.0;
  const t = Math.min(1, Math.max(0, (px - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}
