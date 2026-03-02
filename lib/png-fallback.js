/**
 * png-fallback.js — encoder PNG bez zależności (fallback gdy brak sharp)
 * Przeniesiony z oryginalnego generate-planets.js.
 */
'use strict';

const zlib = require('zlib');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let x = n;
    for (let k = 0; k < 8; k++) x = (x & 1) ? (0xEDB88320 ^ (x >>> 1)) : (x >>> 1);
    table[n] = x;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/**
 * Enkoduje bufor pikseli do PNG.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} pixelData — dane pikseli (RGB lub grayscale)
 * @param {number} channels — 3 (RGB), 4 (RGBA) lub 1 (grayscale)
 * @returns {Buffer} — gotowy plik PNG
 */
function encodePNG(width, height, pixelData, channels = 3) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth

  // kolor: 0=grayscale, 2=RGB, 6=RGBA
  if (channels === 4) ihdr[9] = 6;
  else if (channels === 3) ihdr[9] = 2;
  else ihdr[9] = 0;

  const rowLen = 1 + width * channels;
  const raw = Buffer.alloc(height * rowLen);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        raw[y * rowLen + 1 + x * channels + c] = pixelData[(y * width + x) * channels + c];
      }
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { encodePNG };
