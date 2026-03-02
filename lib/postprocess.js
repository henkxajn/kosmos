/**
 * postprocess.js — post-processing: unsharp mask, gamma, dithering, zapis PNG
 *
 * Używa `sharp` (graceful degradation do png-fallback.js).
 */
'use strict';

const { clamp } = require('./utils');
const { encodePNG } = require('./png-fallback');

// ── Ładowanie sharp (z fallback) ──

let sharp = null;
try {
  sharp = require('sharp');
} catch {
  // brak sharp → fallback na png-fallback.js
}

/** Czy sharp jest dostępny */
function hasSharp() { return sharp !== null; }

// ── Floyd-Steinberg dithering (CPU) ──

/**
 * Floyd-Steinberg dithering — eliminacja bandingu przy kwantyzacji do 8 bit.
 * @param {Float32Array} data — dane [0, 1], W×H (1 kanał) lub W×H×channels
 * @param {number} W, H
 * @param {number} channels — 1 lub 3
 * @returns {Uint8Array}
 */
function floydSteinberg(data, W, H, channels = 1) {
  const size = W * H * channels;
  const work = new Float32Array(size);
  for (let i = 0; i < size; i++) work[i] = data[i] * 255;

  const result = new Uint8Array(size);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < channels; c++) {
        const idx = (y * W + x) * channels + c;
        const oldVal = work[idx];
        const newVal = Math.round(oldVal);
        result[idx] = clamp(newVal, 0, 255);
        const error = oldVal - newVal;

        // dystrybucja błędu
        if (x + 1 < W)
          work[(y * W + x + 1) * channels + c] += error * 7 / 16;
        if (y + 1 < H) {
          if (x > 0)
            work[((y + 1) * W + x - 1) * channels + c] += error * 3 / 16;
          work[((y + 1) * W + x) * channels + c] += error * 5 / 16;
          if (x + 1 < W)
            work[((y + 1) * W + x + 1) * channels + c] += error * 1 / 16;
        }
      }
    }
  }

  return result;
}

// ── Gamma correction (CPU fallback) ──

/**
 * Korekcja gamma na Uint8Array.
 * @param {Uint8Array} data — RGB W×H×3
 * @param {number} gamma — np. 1.1
 * @returns {Uint8Array}
 */
function gammaCorrection(data, gamma = 1.1) {
  const invG = 1 / gamma;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = clamp(Math.round(Math.pow(i / 255, invG) * 255), 0, 255);
  }
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = lut[data[i]];
  }
  return result;
}

// ── Zapis PNG (sharp lub fallback) ──

/**
 * Zapisuje bufor pikseli jako PNG.
 * @param {string} filePath — ścieżka wyjściowa
 * @param {Uint8Array} data — piksele
 * @param {number} W, H
 * @param {number} channels — 1, 3 lub 4
 * @param {object} opts — { unsharp, gamma, dither }
 * @returns {Promise<number>} — rozmiar pliku w bajtach
 */
async function savePNG(filePath, data, W, H, channels, opts = {}) {
  const { unsharp = false, gamma = null, dither = false } = opts;

  if (sharp) {
    return _saveWithSharp(filePath, data, W, H, channels, opts);
  }
  return _saveWithFallback(filePath, data, W, H, channels, opts);
}

async function _saveWithSharp(filePath, data, W, H, channels, opts) {
  const { unsharp = false, gamma = null } = opts;

  // interpretacja kanałów
  let colorspace, sharpChannels;
  if (channels === 1) {
    colorspace = 'b-w';
    sharpChannels = 1;
  } else if (channels === 3) {
    colorspace = 'srgb';
    sharpChannels = 3;
  } else {
    colorspace = 'srgb';
    sharpChannels = 4;
  }

  let img = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width: W, height: H, channels: sharpChannels },
  });

  if (unsharp) {
    img = img.sharpen({ sigma: 1.2, m1: 1.2, m2: 0.5 });
  }

  if (gamma) {
    img = img.gamma(gamma);
  }

  const buf = await img.png({ compressionLevel: 6 }).toBuffer();
  require('fs').writeFileSync(filePath, buf);
  return buf.length;
}

async function _saveWithFallback(filePath, data, W, H, channels, opts) {
  const { gamma: gammaVal = null, dither = false } = opts;

  let processedData = data;

  // gamma CPU
  if (gammaVal && channels >= 3) {
    processedData = gammaCorrection(processedData, gammaVal);
  }

  const buf = encodePNG(W, H, processedData, channels);
  require('fs').writeFileSync(filePath, buf);
  return buf.length;
}

module.exports = {
  hasSharp,
  floydSteinberg,
  gammaCorrection,
  savePNG,
};
