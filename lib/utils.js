/**
 * utils.js — narzędzia pomocnicze: sfera, matematyka, PRNG, progress bar
 */
'use strict';

// ── Matematyka ──

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function remap(v, inLo, inHi, outLo, outHi) {
  return outLo + (v - inLo) / (inHi - inLo) * (outHi - outLo);
}

// ── Mapowanie sferyczne ──

/** UV [0,1]×[0,1] → punkt na sferze jednostkowej {x,y,z} */
function sphereCoords(u, v) {
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  const sinPhi = Math.sin(phi);
  return {
    x: Math.cos(theta) * sinPhi,
    y: Math.cos(phi),
    z: Math.sin(theta) * sinPhi,
  };
}

/** latitude z UV v — zakres [-1, 1] (bieguny → ±1) */
function latitude(v) {
  return Math.cos(v * Math.PI); // v=0 → +1 (biegun N), v=0.5 → 0 (równik), v=1 → -1 (biegun S)
}

// ── PRNG (szybki, deterministyczny) ──

function seededRandom(seed) {
  let s = seed | 0;
  if (s <= 0) s = 1;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Progress bar ──

/**
 * Wyświetla pasek postępu z ETA w terminalu.
 * @param {number} current  — bieżący krok
 * @param {number} total    — łączna liczba kroków
 * @param {string} label    — etykieta fazy
 * @param {number} startMs  — Date.now() z początku fazy
 */
function progressBar(current, total, label, startMs) {
  const pct = current / total;
  const barLen = 20;
  const filled = Math.round(pct * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  const pctStr = (pct * 100).toFixed(0).padStart(3);

  let eta = '';
  if (pct > 0.02) {
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = (elapsed / pct) * (1 - pct);
    eta = ` | ETA: ${remaining.toFixed(0)}s`;
  }

  process.stdout.write(`\r  [${bar}] ${pctStr}%${eta} | ${label}  `);
}

/** Wyczyść linię postępu i wypisz podsumowanie */
function progressDone(label, startMs) {
  const dt = ((Date.now() - startMs) / 1000).toFixed(1);
  process.stdout.write(`\r  ✓ ${label}: ${dt}s${''.padEnd(40)}\n`);
}

module.exports = {
  lerp, clamp, smoothstep, remap,
  sphereCoords, latitude,
  seededRandom,
  progressBar, progressDone,
};
