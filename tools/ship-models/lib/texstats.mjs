// texstats — statystyki tekstury bazowej w obszarze UV (ARC COMBAT VISUALS, krok CV-1b; plan §2.11, F10). Czyste funkcje.
//
// Kolor-klucz liczy TEN SAM klasyfikator co gra: `keyColourMask` z `src/renderer/KeyColourEmission.js` (lustro JS
// fragmentu GLSL maski — CV-1a). Procent „zapalonych" = suma wartości maski po tekselach obszaru UV / liczba tekseli
// obszaru UV — dokładnie definicja pomiaru CV-1a (fixture `CV1a-incoming-key-colour`, pole `measured.litPctOfCovered`).

import { keyColourMask } from '../../../src/renderer/KeyColourEmission.js';

/** Jasność (luma Rec. 601, sRGB 0–255), poniżej której teksel kadłuba liczymy jako „prawie czarny". */
export const NEAR_BLACK_LUMA = 40;

/**
 * Udział koloru-klucza w obszarze UV.
 * @param {Uint8Array|Buffer} px — surowe piksele sRGB 8 bit, `channels` na teksel
 * @param {number} channels — 3 albo 4
 * @param {Uint8Array} coverage — maska obszaru UV (1 = pokryty), ta sama długość co liczba tekseli
 * @param {object} kc — parametry maski (`keyColour` z hardpointów albo `KEY_COLOUR_DEFAULTS`)
 * @returns {{ covered: number, lit: number, litTexels: number, pctOfCovered: number, pctOfTexture: number }}
 */
export function keyColourStats(px, channels, coverage, kc) {
  let covered = 0, lit = 0, litTexels = 0;
  const n = coverage.length;
  for (let i = 0; i < n; i++) {
    if (!coverage[i]) continue;
    covered++;
    const o = i * channels;
    const m = keyColourMask(px[o], px[o + 1], px[o + 2], kc);
    if (m > 0) { lit += m; litTexels++; }
  }
  return {
    covered, lit, litTexels,
    pctOfCovered: covered ? (100 * lit) / covered : 0,
    pctOfTexture: n ? (100 * lit) / n : 0,
  };
}

/**
 * Jasność kadłuba w obszarze UV: średnia luma i udział tekseli prawie czarnych.
 * @returns {{ covered: number, meanLuma: number, nearBlackPct: number }}
 */
export function hullLuma(px, channels, coverage, { nearBlack = NEAR_BLACK_LUMA } = {}) {
  let covered = 0, sum = 0, dark = 0;
  for (let i = 0; i < coverage.length; i++) {
    if (!coverage[i]) continue;
    covered++;
    const o = i * channels;
    const y = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
    sum += y;
    if (y < nearBlack) dark++;
  }
  return { covered, meanLuma: covered ? sum / covered : 0, nearBlackPct: covered ? (100 * dark) / covered : 0 };
}
