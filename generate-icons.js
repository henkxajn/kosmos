#!/usr/bin/env node
// generate-icons.js — Generator ikon budynków dla globusa planety
//
// Uruchomienie: node generate-icons.js
// Wymaga: sharp (npm install sharp)
// Wynik: assets/icons/building_*.png (128×128, przezroczyste tło)
//
// Ikony: hex tło z gradient + glow + biały wypełniony symbol z cieniem.
// Ładowane w PlanetGlobeTexture.js jako sprite'y.

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SIZE = 128;
const CX   = SIZE / 2;
const CY   = SIZE / 2;
const HEX_R = 50; // promień hexa w SVG

const OUTPUT_DIR = path.join(__dirname, 'assets', 'icons');

// ── Hex wierzchołki (pointy-top) ──────────────────────────

function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

// ── SVG builder ───────────────────────────────────────────

function buildSVG(rgb, symbolMarkup, opts = {}) {
  const [r, g, b] = rgb;
  // Jaśniejszy kolor (góra gradientu + ramka)
  const lr = Math.min(255, r + 55);
  const lg = Math.min(255, g + 55);
  const lb = Math.min(255, b + 55);
  // Ciemniejszy kolor (dół gradientu)
  const dr = Math.max(0, r - 35);
  const dg = Math.max(0, g - 35);
  const db = Math.max(0, b - 35);

  const hex      = hexPoints(CX, CY, HEX_R);
  const hexInner = hexPoints(CX, CY, HEX_R - 3);
  const borderW  = opts.borderWidth ?? 3;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <!-- Gradient tła hexa -->
    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgb(${lr},${lg},${lb})"/>
      <stop offset="50%"  stop-color="rgb(${r},${g},${b})"/>
      <stop offset="100%" stop-color="rgb(${dr},${dg},${db})"/>
    </linearGradient>

    <!-- Poświata (glow) pod hexem -->
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur"/>
      <feFlood flood-color="rgb(${r},${g},${b})" flood-opacity="0.5" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="glowLayer"/>
      <feMerge>
        <feMergeNode in="glowLayer"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Cień na symbolu -->
    <filter id="symSh" x="-20%" y="-10%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur"/>
      <feOffset in="blur" dx="0" dy="2" result="off"/>
      <feFlood flood-color="black" flood-opacity="0.5" result="color"/>
      <feComposite in="color" in2="off" operator="in" result="shadow"/>
      <feMerge>
        <feMergeNode in="shadow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Hex tło z poświatą i gradientem -->
  <polygon points="${hex}"
    fill="url(#hg)" filter="url(#glow)"
    stroke="rgb(${lr},${lg},${lb})" stroke-width="${borderW}" stroke-linejoin="round"/>

  <!-- Subtelna wewnętrzna krawędź (bevel) -->
  <polygon points="${hexInner}"
    fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>

  <!-- Symbol budynku z cieniem -->
  <g filter="url(#symSh)">
    ${symbolMarkup}
  </g>
</svg>`;
}

// ── Kolory kategorii ─────────────────────────────────────

const C_MINING     = [204, 153,  68];
const C_ENERGY     = [255, 221,  68];
const C_FOOD       = [ 68, 204, 102];
const C_POPULATION = [ 68, 136, 255];
const C_RESEARCH   = [204, 102, 255];
const C_SPACE      = [170, 170, 255];
// const C_MILITARY = [255,  68,  68]; // brak budynków military

// ── Definicje ikon (1 per typ budynku + capital) ─────────

const ICONS = {

  // ════ MINING ════════════════════════════════════════════

  // ⛏ Kopalnia — kilof
  mine: {
    color: C_MINING,
    symbol: `
      <g stroke="#FFF0DC" stroke-opacity="0.95" stroke-width="9" stroke-linecap="round" fill="none">
        <line x1="36" y1="94" x2="76" y2="54"/>
        <polyline points="90,40 76,54 62,40"/>
      </g>`,
  },

  // 🏭 Fabryka — budynek z kominem i dymem
  factory: {
    color: C_MINING,
    symbol: `
      <rect x="28" y="52" width="56" height="48" rx="4"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <rect x="36" y="64" width="16" height="20" rx="2"
        fill="rgba(0,0,0,0.18)"/>
      <rect x="58" y="64" width="16" height="20" rx="2"
        fill="rgba(0,0,0,0.18)"/>
      <rect x="84" y="38" width="14" height="62" rx="3"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <path d="M88,38 C88,28 84,22 90,14 C94,22 92,28 94,34"
        fill="none" stroke="#FFF0DC" stroke-opacity="0.7" stroke-width="4" stroke-linecap="round"/>
      <path d="M94,38 C94,30 96,24 100,18"
        fill="none" stroke="#FFF0DC" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round"/>`,
  },

  // 🔥 Huta — piec z płomieniem
  smelter: {
    color: C_MINING,
    symbol: `
      <rect x="32" y="54" width="64" height="46" rx="6"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <rect x="44" y="64" width="14" height="18" rx="3"
        fill="rgba(0,0,0,0.2)"/>
      <rect x="70" y="64" width="14" height="18" rx="3"
        fill="rgba(0,0,0,0.2)"/>
      <path d="M52,54 C52,34 48,28 54,18 C58,26 56,34 58,42 C60,34 64,26 62,18 C70,28 66,38 64,46 C68,38 72,30 70,22 C78,34 74,44 74,54"
        fill="#FFF0DC" fill-opacity="0.85" stroke="none"/>`,
  },

  // 🚀 Wyrzutnia — platforma startowa ze strzałką w górę
  launch_pad: {
    color: C_MINING,
    symbol: `
      <rect x="28" y="84" width="72" height="12" rx="4"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <rect x="44" y="72" width="8" height="16"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <rect x="76" y="72" width="8" height="16"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <path d="M64,16 L78,50 L70,50 L70,72 L58,72 L58,50 L50,50 Z"
        fill="#FFF0DC" fill-opacity="0.95"/>`,
  },

  // 🛰 Autonomiczny Port Kosmiczny — platforma z kółkiem auto
  autonomous_spaceport: {
    color: C_MINING,
    symbol: `
      <rect x="28" y="84" width="72" height="12" rx="4"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <path d="M64,24 L76,50 L70,50 L70,72 L58,72 L58,50 L52,50 Z"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <circle cx="86" cy="30" r="14" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.8" stroke-width="3"/>
      <path d="M86,16 L90,22 L82,22 Z" fill="#FFF0DC" fill-opacity="0.8"/>`,
  },

  // ⛏⟳ Kopalnia Autonomiczna — kilof z kółkiem auto
  autonomous_mine: {
    color: C_MINING,
    symbol: `
      <g stroke="#FFF0DC" stroke-opacity="0.95" stroke-width="8" stroke-linecap="round" fill="none">
        <line x1="34" y1="96" x2="70" y2="60"/>
        <polyline points="84,48 70,60 58,46"/>
      </g>
      <circle cx="86" cy="34" r="14" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.8" stroke-width="3"/>
      <path d="M86,20 L90,26 L82,26 Z" fill="#FFF0DC" fill-opacity="0.8"/>`,
  },

  // ════ ENERGY ═══════════════════════════════════════════

  // ☀ Elektrownia Słoneczna — słońce z promieniami
  solar_farm: {
    color: C_ENERGY,
    symbol: `
      <circle cx="64" cy="64" r="18" fill="#FFF0DC" fill-opacity="0.95"/>
      <g stroke="#FFF0DC" stroke-opacity="0.9" stroke-width="5" stroke-linecap="round">
        <line x1="64" y1="22" x2="64" y2="36"/>
        <line x1="64" y1="92" x2="64" y2="106"/>
        <line x1="22" y1="64" x2="36" y2="64"/>
        <line x1="92" y1="64" x2="106" y2="64"/>
        <line x1="34" y1="34" x2="44" y2="44"/>
        <line x1="84" y1="84" x2="94" y2="94"/>
        <line x1="94" y1="34" x2="84" y2="44"/>
        <line x1="44" y1="84" x2="34" y2="94"/>
      </g>`,
  },

  // 🌋 Elektrownia Geotermalna — fale ciepła
  geothermal: {
    color: C_ENERGY,
    symbol: `
      <path d="M34,96 L94,96 L86,78 L42,78 Z"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <path d="M42,78 C42,66 36,60 44,48 C50,58 48,64 52,70"
        fill="none" stroke="#FFF0DC" stroke-opacity="0.9" stroke-width="6" stroke-linecap="round"/>
      <path d="M56,78 C56,62 52,54 60,38 C66,50 64,58 66,68"
        fill="none" stroke="#FFF0DC" stroke-opacity="0.9" stroke-width="6" stroke-linecap="round"/>
      <path d="M72,78 C72,64 68,56 76,42 C82,54 78,62 80,72"
        fill="none" stroke="#FFF0DC" stroke-opacity="0.9" stroke-width="6" stroke-linecap="round"/>`,
  },

  // ☢ Elektrownia Jądrowa — symbol promieniowania
  nuclear_plant: {
    color: C_ENERGY,
    symbol: `
      <circle cx="64" cy="64" r="8" fill="#FFF0DC" fill-opacity="0.95"/>
      <path d="M64,56 A30,30 0 0,1 90,78 L64,64 Z"
        fill="#FFF0DC" fill-opacity="0.9"/>
      <path d="M90,78 A30,30 0 0,1 38,78 L64,64 Z"
        fill="#FFF0DC" fill-opacity="0.9"/>
      <path d="M38,78 A30,30 0 0,1 64,56 L64,64 Z"
        fill="#FFF0DC" fill-opacity="0.9"/>
      <circle cx="64" cy="64" r="30" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.5" stroke-width="2"/>`,
  },

  // ☀⟳ Autonomiczna Elektrownia Słoneczna — słońce + kółko auto
  autonomous_solar_farm: {
    color: C_ENERGY,
    symbol: `
      <circle cx="58" cy="66" r="16" fill="#FFF0DC" fill-opacity="0.95"/>
      <g stroke="#FFF0DC" stroke-opacity="0.85" stroke-width="4" stroke-linecap="round">
        <line x1="58" y1="28" x2="58" y2="40"/>
        <line x1="58" y1="92" x2="58" y2="104"/>
        <line x1="20" y1="66" x2="32" y2="66"/>
        <line x1="84" y1="66" x2="96" y2="66"/>
        <line x1="31" y1="39" x2="39" y2="47"/>
        <line x1="77" y1="85" x2="85" y2="93"/>
        <line x1="85" y1="39" x2="77" y2="47"/>
        <line x1="39" y1="85" x2="31" y2="93"/>
      </g>
      <circle cx="86" cy="34" r="13" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.8" stroke-width="2.5"/>
      <path d="M86,21 L89,26 L83,26 Z" fill="#FFF0DC" fill-opacity="0.8"/>`,
  },

  // ⚛ Reaktor Fuzyjny — atom z orbitami plazmy
  fusion_reactor: {
    color: C_ENERGY,
    symbol: `
      <circle cx="64" cy="64" r="10" fill="#FFF0DC" fill-opacity="0.95"/>
      <ellipse cx="64" cy="64" rx="36" ry="14" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.9" stroke-width="3.5"
        transform="rotate(0,64,64)"/>
      <ellipse cx="64" cy="64" rx="36" ry="14" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.9" stroke-width="3.5"
        transform="rotate(60,64,64)"/>
      <ellipse cx="64" cy="64" rx="36" ry="14" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.9" stroke-width="3.5"
        transform="rotate(120,64,64)"/>`,
  },

  // ════ FOOD ═════════════════════════════════════════════

  // 🌾 Farma — kłos zboża
  farm: {
    color: C_FOOD,
    symbol: `
      <path d="M64,102 C20,76 20,32 64,16 C108,32 108,76 64,102 Z"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <line x1="64" y1="24" x2="64" y2="94"
        stroke="rgba(0,80,20,0.25)" stroke-width="3.5"/>
      <line x1="46" y1="52" x2="64" y2="40"
        stroke="rgba(0,80,20,0.18)" stroke-width="2.5"/>
      <line x1="82" y1="52" x2="64" y2="40"
        stroke="rgba(0,80,20,0.18)" stroke-width="2.5"/>`,
  },

  // 💧 Studnia — kropla wody
  well: {
    color: C_FOOD,
    symbol: `
      <path d="M64,18 C64,18 30,60 30,78 C30,96 46,108 64,108 C82,108 98,96 98,78 C98,60 64,18 64,18 Z"
        fill="#66BBFF" fill-opacity="0.95"/>
      <ellipse cx="64" cy="84" rx="20" ry="12"
        fill="rgba(255,255,255,0.2)"/>
      <path d="M50,76 Q56,68 62,76" fill="none"
        stroke="rgba(255,255,255,0.25)" stroke-width="2.5"/>`,
  },

  // 🧬 Zakład Syntetycznej Żywności — kapsuła/DNA
  synthesized_food_plant: {
    color: C_FOOD,
    symbol: `
      <rect x="38" y="24" width="52" height="80" rx="26"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <line x1="38" y1="58" x2="90" y2="58"
        stroke="rgba(0,0,0,0.15)" stroke-width="2.5"/>
      <circle cx="56" cy="42" r="5" fill="rgba(0,0,0,0.12)"/>
      <circle cx="72" cy="42" r="5" fill="rgba(0,0,0,0.12)"/>
      <circle cx="64" cy="78" r="7" fill="rgba(0,0,0,0.1)"/>`,
  },

  // ════ POPULATION ═══════════════════════════════════════

  // 🏠 Habitat — kopuła
  habitat: {
    color: C_POPULATION,
    symbol: `
      <path d="M30,90 L30,56 C30,22 98,22 98,56 L98,90 Z"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <rect x="50" y="58" width="28" height="28" rx="4"
        fill="rgba(0,0,0,0.18)"/>
      <line x1="64" y1="58" x2="64" y2="86"
        stroke="rgba(0,0,0,0.12)" stroke-width="2"/>
      <line x1="50" y1="72" x2="78" y2="72"
        stroke="rgba(0,0,0,0.12)" stroke-width="2"/>`,
  },

  // ════ RESEARCH ═════════════════════════════════════════

  // 🔬 Stacja Badawcza — kolba laboratoryjna
  research_station: {
    color: C_RESEARCH,
    symbol: `
      <path d="M48,24 L48,48 L26,92 C22,108 106,108 102,92 L80,48 L80,24 Z"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <rect x="42" y="18" width="44" height="10" rx="5"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <ellipse cx="64" cy="88" rx="28" ry="9"
        fill="rgba(0,0,0,0.1)"/>
      <circle cx="52" cy="78" r="5" fill="rgba(0,0,0,0.08)"/>
      <circle cx="70" cy="82" r="4" fill="rgba(0,0,0,0.06)"/>`,
  },

  // ════ SPACE ════════════════════════════════════════════

  // 🔧 Stocznia — klucz + kadłub
  shipyard: {
    color: C_SPACE,
    symbol: `
      <path d="M36,44 L50,44 L50,36 L66,36 L66,44 L92,44 L98,56 L92,68 L36,68 L30,56 Z"
        fill="#FFF0DC" fill-opacity="0.95"/>
      <rect x="40" y="50" width="48" height="6" rx="2"
        fill="rgba(0,0,0,0.15)"/>
      <g stroke="#FFF0DC" stroke-opacity="0.9" stroke-width="6" stroke-linecap="round">
        <line x1="46" y1="78" x2="46" y2="100"/>
        <line x1="82" y1="78" x2="82" y2="100"/>
      </g>
      <rect x="38" y="68" width="52" height="12" rx="3"
        fill="#FFF0DC" fill-opacity="0.95"/>`,
  },

  // 🌍 Terraformer — globus ze strzałkami
  terraformer: {
    color: C_SPACE,
    symbol: `
      <circle cx="64" cy="64" r="30" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.95" stroke-width="5"/>
      <ellipse cx="64" cy="64" rx="14" ry="30" fill="none"
        stroke="#FFF0DC" stroke-opacity="0.7" stroke-width="3"/>
      <line x1="34" y1="52" x2="94" y2="52"
        stroke="#FFF0DC" stroke-opacity="0.5" stroke-width="2.5"/>
      <line x1="34" y1="76" x2="94" y2="76"
        stroke="#FFF0DC" stroke-opacity="0.5" stroke-width="2.5"/>
      <path d="M88,30 L96,22 L98,34 Z"
        fill="#FFF0DC" fill-opacity="0.8"/>
      <path d="M40,98 L32,106 L30,94 Z"
        fill="#FFF0DC" fill-opacity="0.8"/>`,
  },

  // ════ SPECIAL ══════════════════════════════════════════

  // ⭐ Stolica — gwiazda 6-ramienna
  capital: {
    color: [100, 160, 255],
    symbol: `
      <path d="M64,22 L74,46 L100,44 L82,64 L96,86 L72,78 L64,104 L56,78 L32,86 L46,64 L28,44 L54,46 Z"
        fill="#FFF0DC" fill-opacity="0.95"/>`,
    borderWidth: 4,
  },
};

// ── Generowanie ───────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Generowanie ikon budynków (${SIZE}×${SIZE})...\n`);

  for (const [name, def] of Object.entries(ICONS)) {
    const svg  = buildSVG(def.color, def.symbol, { borderWidth: def.borderWidth });
    const out  = path.join(OUTPUT_DIR, `building_${name}.png`);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(out);

    const stat = fs.statSync(out);
    console.log(`  ✓ building_${name}.png  (${(stat.size / 1024).toFixed(1)} KB)`);
  }

  console.log(`\nWygenerowano ${Object.keys(ICONS).length} ikon → ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Błąd generowania ikon:', err);
  process.exit(1);
});
