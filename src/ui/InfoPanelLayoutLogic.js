// ── Czysta matematyka layoutu prawej kolumny ColonyOverlay (bez THREE — headless-testowalna) ──
// C4 — dane-driven pasek zakładek (N-zakładek) + per-zakładka scroll. Wydzielone z ColonyOverlay
// (importuje THREE). Wzór modułowy jak DepositReadoutLogic (C2) / EnvironmentEffectLogic (C3).
//
// JEDNO źródło prawdy dla: szerokości pigułek zakładek, klampu offsetu scrolla, geometrii kciuka
// paska przewijania. ColonyOverlay tylko rysuje/rejestruje hity wg tych liczb.

// Szerokość pojedynczej pigułki zakładki dla `count` zakładek w szerokości `totalW` z odstępem `gap`.
// Zachowuje historyczną formułę 2-zakładkową: count=2 → (totalW − gap)/2 (identyczny wygląd).
export function tabSlotWidth(totalW, count, gap = 6) {
  if (count <= 0) return 0;
  return Math.floor((totalW - gap * (count - 1)) / count);
}

// Prostokąty (x,w) kolejnych zakładek od x0 — spójne z pętlą rysującą (sx += w + gap).
export function computeTabRects(x0, totalW, count, gap = 6) {
  const w = tabSlotWidth(totalW, count, gap);
  const rects = [];
  let sx = x0;
  for (let i = 0; i < count; i++) { rects.push({ x: sx, w }); sx += w + gap; }
  return rects;
}

// Klamp offsetu scrolla do [0, max(0, contentH − viewportH)]. Zawartość mieści się → 0.
// (Dolny klamp też w handleScroll; górny wymaga znanej contentH — stąd tutaj.)
export function clampScroll(scroll, contentH, viewportH) {
  const max = Math.max(0, contentH - viewportH);
  return Math.max(0, Math.min(scroll ?? 0, max));
}

// ── Stepper ± (zakładka Załoga) — JEDNO źródło prawdy dla przycisku i strefy klik (C4 recheck) ──
// Problem: strefa klik wyśrodkowana na `my` (kotwica tekstu linii, textBaseline='middle') NIE pokrywa
// się z pikselami glifu — '+'/'−' renderują się ~GLYPH_RISE px NAD `my`, więc symetryczny box na `my`
// wystawał POD glif (mis-klik „pod ikoną"). Fix: box wyśrodkowany na OPTYCZNYM środku glifu (my−RISE);
// glif rysowany na `glyphY` (=`my`, spójny z resztą linii). Box + glif dzielą TĘ funkcję → nie mogą
// się rozjechać (ani między sobą, ani przy scrollu — wszystko pochodne `my` = f(scroll)).
//   GLYPH_RISE — korekta em-środek→optyczny środek; strojalna JEDNĄ liczbą jeśli live-gate pokaże bias.
// ⚠ ZAAKCEPTOWANY KOMPROMIS (decyzja produktowa, C4 close-out): GLYPH_RISE to SZACUNEK optycznego środka,
//   nie zmierzony piksel — przy obecnej wartości zostaje mały resztkowy „bleed" klik ~kilka px NAD i POD
//   ikoną (SYMETRYCZNY, znacznie mniejszy niż dwa naprawione bugi strukturalne). Klik-na-ikonę = poprawny.
//   Świadomie NIE dostrajane dalej. GLYPH_RISE (i wtórnie STEPPER_BTN_H) = jedyne pokrętła jeśli ktoś wróci.
export const STEPPER_BTN_H     = 13;   // wysokość przycisku (px) — mieści '+' snug, '−' z symetrycznym marginesem
export const STEPPER_GLYPH_RISE = 2;   // '+'/'−' renderują się ~2px nad `my` (textBaseline middle) — korekta (knob)

/** Pasmo przycisku steppera dla danej kotwicy linii `my`. Zwraca { top, h, glyphY } — WSZYSTKIE
 *  współrzędne z jednego źródła: box=[top, top+h] wyśrodkowany na (my−RISE); glif na glyphY=my. */
export function stepperButtonBand(my) {
  return { top: (my - STEPPER_GLYPH_RISE) - STEPPER_BTN_H / 2, h: STEPPER_BTN_H, glyphY: my };
}

// Geometria kciuka paska przewijania (mirror _floatScroll: min 20px, proporcja viewport/content).
// Zwraca { y, h } albo null gdy zawartość NIE przekracza viewportu (brak paska).
// trackTop = szczyt widocznego pasma treści; tor = wysokość viewportu.
export function scrollThumb(scroll, contentH, viewportH, trackTop) {
  if (!(contentH > viewportH) || viewportH <= 0 || contentH <= 0) return null;
  const denom = Math.max(1, contentH - viewportH);
  const pct = clampScroll(scroll, contentH, viewportH) / denom;
  const h = Math.max(20, viewportH * (viewportH / contentH));
  const y = trackTop + pct * (viewportH - h);
  return { y, h };
}
