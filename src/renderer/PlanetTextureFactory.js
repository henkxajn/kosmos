// Fabryka proceduralnych tekstur Canvas dla planet 3D
// Generuje THREE.CanvasTexture na canvas 512×512 per typ planety
// Seed z hash(planet.id) — deterministyczne (brak migotania przy kolejnych renderach)

import * as THREE from 'three';

// Prosty PRNG (Mulberry32) — deterministyczny, szybki
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Hash stringa na liczbę całkowitą (djb2)
function hashId(id) {
  let h = 5381;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export class PlanetTextureFactory {
  static SIZE = 512;

  // Tworzy THREE.CanvasTexture dla danej planety
  static create(planet) {
    const canvas = document.createElement('canvas');
    canvas.width  = this.SIZE;
    canvas.height = this.SIZE;
    const ctx = canvas.getContext('2d');
    const rng = mulberry32(hashId(planet.id));
    const S   = this.SIZE;

    switch (planet.planetType) {
      case 'gas':       this._drawGas(ctx, planet, rng, S);       break;
      case 'ice':       this._drawIce(ctx, planet, rng, S);       break;
      case 'hot_rocky': this._drawHotRocky(ctx, planet, rng, S);  break;
      default:          this._drawRocky(ctx, planet, rng, S);
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // ── Rocky — szaro-brązowe z kraterami ──────────────────────
  static _drawRocky(ctx, planet, rng, S) {
    const c = '#' + Math.max(0, planet.visual.color).toString(16).padStart(6, '0');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, S, S);

    // Noise — ciemniejsze i jaśniejsze plamy
    for (let i = 0; i < 400; i++) {
      const x = rng() * S, y = rng() * S;
      const r = 4 + rng() * 20;
      const dark = rng() < 0.55;
      ctx.fillStyle = dark
        ? `rgba(0,0,0,${(0.04 + rng() * 0.12).toFixed(2)})`
        : `rgba(255,255,255,${(0.02 + rng() * 0.06).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Kratery (10–16 szt.)
    const nCraters = 10 + Math.floor(rng() * 7);
    for (let i = 0; i < nCraters; i++) {
      const cx = rng() * S, cy = rng() * S;
      const cr  = 8 + rng() * 32;
      ctx.strokeStyle = `rgba(255,255,255,${(0.12 + rng() * 0.18).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(0,0,0,${(0.18 + rng() * 0.18).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.75, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Hot Rocky — pomarańczowo-czerwone, lawa ─────────────────
  static _drawHotRocky(ctx, planet, rng, S) {
    const c = '#' + Math.max(0, planet.visual.color).toString(16).padStart(6, '0');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, S, S);

    // Ciemne skalne obszary
    for (let i = 0; i < 200; i++) {
      const x = rng() * S, y = rng() * S;
      const r = 6 + rng() * 28;
      ctx.fillStyle = `rgba(30,0,0,${(0.05 + rng() * 0.22).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Żyłki lawy — jasne plamy i linie
    const lavaColors = [
      `rgba(255,120,0,`, `rgba(255,200,0,`, `rgba(255,60,0,`, `rgba(255,160,30,`,
    ];
    for (let i = 0; i < 100; i++) {
      const x = rng() * S, y = rng() * S;
      const r = 2 + rng() * 12;
      const col = lavaColors[Math.floor(rng() * lavaColors.length)];
      ctx.fillStyle = col + (0.3 + rng() * 0.5).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Kratery (5–9 szt.)
    const nCraters = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < nCraters; i++) {
      const cx = rng() * S, cy = rng() * S;
      const cr  = 12 + rng() * 40;
      ctx.strokeStyle = `rgba(255,150,0,${(0.25 + rng() * 0.25).toFixed(2)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(20,0,0,${(0.20 + rng() * 0.20).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Gas — poziome pasy atmosferyczne ────────────────────────
  static _drawGas(ctx, planet, rng, S) {
    const c = '#' + Math.max(0, planet.visual.color).toString(16).padStart(6, '0');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, S, S);

    // Ciepłe lub zimne kolory pasów — zależy od koloru planety
    const r = (planet.visual.color >> 16) & 0xff;
    const g = (planet.visual.color >>  8) & 0xff;
    const warm = r > g;

    const bands = warm ? [
      `rgba(255,220,150,`, `rgba(200,140,60,`,  `rgba(240,180,90,`,
      `rgba(160,100,40,`,  `rgba(220,160,80,`,  `rgba(255,200,120,`,
    ] : [
      `rgba(150,180,255,`, `rgba(100,140,220,`, `rgba(180,200,255,`,
      `rgba(80,120,200,`,  `rgba(140,160,240,`, `rgba(160,190,255,`,
    ];

    // 8–12 pasów z lekkimi undulacjami
    const nBands = 8 + Math.floor(rng() * 5);
    const bandH  = S / nBands;
    for (let i = 0; i < nBands; i++) {
      const col = bands[i % bands.length];
      const y0  = i * bandH;
      const ofs = (rng() - 0.5) * bandH * 0.25;
      ctx.fillStyle = col + (0.15 + rng() * 0.40).toFixed(2) + ')';
      ctx.fillRect(0, y0 + ofs, S, bandH + 2);
    }

    // Burzowe plamy (1–3 szt., jak Wielka Czerwona Plama)
    const nStorms = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nStorms; i++) {
      const sx = rng() * S, sy = rng() * S;
      const sw = 30 + rng() * 80, sh = 14 + rng() * 28;
      ctx.fillStyle = warm
        ? `rgba(200,100,60,${(0.25 + rng() * 0.30).toFixed(2)})`
        : `rgba(60,100,200,${(0.20 + rng() * 0.25).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sw, sh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Ice — jasnoniebieski, czapa polarna ──────────────────────
  static _drawIce(ctx, planet, rng, S) {
    const c = '#' + Math.max(0, planet.visual.color).toString(16).padStart(6, '0');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, S, S);

    // Subtelne niebieskie wariacje
    for (let i = 0; i < 300; i++) {
      const x = rng() * S, y = rng() * S;
      const r = 5 + rng() * 25;
      const light = rng() < 0.5;
      ctx.fillStyle = light
        ? `rgba(200,240,255,${(0.03 + rng() * 0.10).toFixed(2)})`
        : `rgba(0,60,120,${(0.03 + rng() * 0.08).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Kratery lodowe (4–8 szt.)
    const nCraters = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < nCraters; i++) {
      const cx = rng() * S, cy = rng() * S;
      const cr  = 10 + rng() * 35;
      ctx.strokeStyle = `rgba(255,255,255,${(0.20 + rng() * 0.20).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(150,200,255,${(0.12 + rng() * 0.10).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.8, 0, Math.PI * 2); ctx.fill();
    }

    // Czapa polarna — biały gradient u góry
    const capH = S * (0.12 + rng() * 0.08);
    const grad = ctx.createLinearGradient(0, 0, 0, capH);
    grad.addColorStop(0, 'rgba(255,255,255,0.90)');
    grad.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, capH);
  }
}
