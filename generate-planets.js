#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 *  PROCEDURAL PLANET TEXTURE GENERATOR v2
 *  Generuje tekstury planet (diffuse + normal + height + roughness
 *  + opcjonalnie: AO, specular, emission, clouds, night lights)
 *
 *  Użycie:
 *    node generate-planets.js
 *    node generate-planets.js --type rocky --count 3 --resolution 4096
 *    node generate-planets.js --type volcanic --seed 42 --emission
 *    node generate-planets.js --type all --quality ultra --all-maps
 *    node generate-planets.js --list-types
 *    node generate-planets.js --help
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Moduły generatora ──
const { generateTerrain } = require('./lib/terrain');
const { createNoise, fbm3d, sphereWorley } = require('./lib/noise');
const {
  gammaLerp, multiLerp, contrastCurve,
  colorJitter, mineralStreaks, polarIce, lavaFlow, colorVariation,
} = require('./lib/colors');
const {
  generateNormalMap, generateHeightGrayscale, generateRoughnessMap,
  generateAOMap, generateSpecularMap, generateEmissionMap,
  generateCloudLayer, generateNightLightsMap,
} = require('./lib/maps');
const { savePNG, hasSharp } = require('./lib/postprocess');
const { sphereCoords, clamp, progressBar, progressDone } = require('./lib/utils');

// ============================================
// CLI ARGUMENT PARSER
// ============================================
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  }
}

if (flags.help) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         PROCEDURAL PLANET TEXTURE GENERATOR v2            ║
╚═══════════════════════════════════════════════════════════╝

UŻYCIE:
  node generate-planets.js [opcje]

OPCJE:
  --type <typ>         Typ planety (domyślnie: all)
                       Dostępne: rocky, mercury, volcanic, desert,
                       iron, ice, ocean, toxic, lava-ocean,
                       gas_warm, gas_cold, gas_giant,
                       planetoid_metallic, planetoid_carbonaceous,
                       planetoid_silicate, all
  --count <n>          Ile wariantów danego typu (domyślnie: 1)
  --resolution <px>    Szerokość tekstury (domyślnie: 2048)
  --seed <n>           Seed bazowy (domyślnie: losowy)
  --output <dir>       Folder wyjściowy (domyślnie: ./planet-textures)
  --no-normal          Pomiń generowanie normal map
  --no-height          Pomiń generowanie heightmap
  --no-roughness       Pomiń generowanie roughness map
  --name <prefix>      Prefix nazwy pliku (domyślnie: typ planety)
  --list-types         Wyświetl dostępne typy planet

  --quality <q>        Poziom jakości: low, medium, high, ultra (domyślnie: high)
  --erosion <on|off>   Erozja (domyślnie: on dla high/ultra)
  --clouds             Generuj cloud layer (RGBA PNG)
  --emission           Generuj emission map (RGB)
  --nightlights        Generuj night lights map
  --ao                 Generuj ambient occlusion map
  --specular           Generuj specular/metalness map
  --all-maps           Generuj wszystkie dodatkowe mapy
  --workers <n>        Liczba wątków (domyślnie: CPU cores - 1)

  --help               Pokaż tę pomoc

QUALITY PRESETS:
  low     6 oktaw fBm, bez erozji, bez Worley         ~3s  @ 2048
  medium  8 oktaw, lekka erozja, Worley               ~8s  @ 2048
  high    10 oktaw, pełna erozja, Worley, post-proc    ~20s @ 2048
  ultra   12+ oktaw, pełna+termiczna, dithering        ~45s @ 2048

PRZYKŁADY:
  # Jedna rocky planet, domyślna jakość (high):
  node generate-planets.js --type rocky

  # 5 wulkanicznych ultra z emission:
  node generate-planets.js --type volcanic --count 5 --quality ultra --emission

  # Wszystkie typy z pełnym zestawem map:
  node generate-planets.js --type all --quality high --all-maps

  # Szybki podgląd (low quality):
  node generate-planets.js --type desert --quality low --resolution 1024
`);
  process.exit(0);
}

// ============================================
// PLANET TYPE DEFINITIONS
// ============================================
const PLANET_TYPES = {
  rocky: {
    label: 'Rocky Mars-like',
    palette: [
      [40,18,12],[55,24,14],[65,30,18],[85,40,22],[95,45,25],[115,55,30],
      [130,62,32],[150,75,40],[165,85,45],[185,105,60],[200,125,75],
      [195,140,95],[210,160,110],[225,185,140],[235,205,170],[245,225,200],
    ],
    features: {
      craters: true, craterCount: 60, craterMin: 0.004, craterMax: 0.07,
      ridges: true, ridgeScale: 5, ridgeBlend: 0.35,
      tectonic: true, tecScale: 6, tecStr: 0.4,
      baseScale: 3.5, polar: true, polarFrost: true, minerals: true,
      polarStart: 0.72, polarEnd: 0.93,
    },
  },
  mercury: {
    label: 'Mercury (heavy craters)',
    palette: [
      [35,33,30],[45,42,38],[55,52,48],[70,68,65],[90,87,82],
      [100,98,92],[120,116,108],[130,125,118],[150,145,138],
      [155,150,142],[175,170,160],[195,190,182],
    ],
    features: {
      craters: true, craterCount: 120, craterMin: 0.003, craterMax: 0.09,
      ridges: false, ridgeScale: 3, ridgeBlend: 0.15,
      tectonic: false, tecScale: 4, tecStr: 0.2,
      baseScale: 2.5, polar: true, polarFrost: false, minerals: false,
    },
  },
  volcanic: {
    label: 'Volcanic (dark with lava veins)',
    palette: [
      [10,5,3],[15,7,4],[20,10,6],[30,15,8],[35,18,10],[45,22,12],
      [55,28,14],[70,34,16],[80,38,18],[120,44,16],
      [140,50,15],[180,65,15],[200,80,15],[230,100,20],[240,120,25],[255,160,40],
    ],
    features: {
      craters: true, craterCount: 25, craterMin: 0.005, craterMax: 0.05,
      ridges: true, ridgeScale: 6, ridgeBlend: 0.5,
      tectonic: true, tecScale: 8, tecStr: 0.85,
      baseScale: 4, polar: false, polarFrost: false, minerals: false,
      hasEmission: true, emissionThreshold: 0.4,
    },
  },
  desert: {
    label: 'Desert with canyons',
    palette: [
      [80,42,20],[90,50,25],[110,62,30],[120,70,35],[140,80,40],
      [160,95,50],[170,110,60],[190,130,75],[195,140,80],[210,160,95],
      [225,185,120],[240,210,160],
    ],
    features: {
      craters: true, craterCount: 20, craterMin: 0.003, craterMax: 0.04,
      ridges: true, ridgeScale: 7, ridgeBlend: 0.45,
      tectonic: true, tecScale: 5, tecStr: 0.6,
      baseScale: 3, polar: true, polarFrost: false, minerals: true,
      polarStart: 0.75, polarEnd: 0.95,
    },
  },
  iron: {
    label: 'Iron-rich (dark purple metallic)',
    palette: [
      [20,12,25],[25,15,30],[35,20,38],[40,22,42],[50,28,48],
      [55,32,55],[68,40,60],[75,45,65],[90,55,72],[100,65,80],
      [120,78,90],[130,85,95],[145,100,108],[155,110,115],[170,130,128],[180,145,140],
    ],
    features: {
      craters: true, craterCount: 45, craterMin: 0.004, craterMax: 0.06,
      ridges: true, ridgeScale: 4.5, ridgeBlend: 0.3,
      tectonic: true, tecScale: 7, tecStr: 0.5,
      baseScale: 3.2, polar: true, polarFrost: false, minerals: true,
    },
  },
  ice: {
    label: 'Ice world (frozen surface)',
    palette: [
      [130,145,165],[140,155,170],[150,165,182],[155,170,185],[165,178,195],
      [170,185,200],[180,195,210],[185,200,215],[195,208,222],
      [200,215,228],[210,222,235],[215,228,238],[225,235,242],[230,238,245],[240,245,250],
    ],
    features: {
      craters: true, craterCount: 30, craterMin: 0.003, craterMax: 0.05,
      ridges: true, ridgeScale: 5, ridgeBlend: 0.25,
      tectonic: true, tecScale: 9, tecStr: 0.7,
      baseScale: 3, polar: false, polarFrost: false, minerals: false,
    },
  },
  ocean: {
    label: 'Ocean world (blue with islands)',
    palette: [
      [10,22,65],[15,30,80],[18,38,95],[20,45,110],[22,50,120],[25,55,130],
      [28,62,140],[30,70,150],[45,95,115],[60,120,100],[75,135,90],
      [90,145,80],[110,155,85],[130,160,90],[155,172,105],
      [170,180,120],[190,190,140],[200,195,150],
    ],
    features: {
      craters: false, craterCount: 0,
      ridges: true, ridgeScale: 4, ridgeBlend: 0.3,
      tectonic: false, tecScale: 5, tecStr: 0.3,
      baseScale: 2.5, polar: true, polarFrost: true, minerals: false,
      polarStart: 0.70, polarEnd: 0.88,
      hasClouds: true,
    },
  },
  toxic: {
    label: 'Toxic (green-yellow caustic)',
    palette: [
      [25,28,8],[30,35,10],[40,45,12],[50,55,15],[62,68,18],
      [70,80,20],[88,95,22],[100,110,25],[118,125,30],
      [130,140,35],[148,148,38],[160,155,40],[175,162,45],[180,165,50],[195,175,60],[200,180,70],
    ],
    features: {
      craters: true, craterCount: 35, craterMin: 0.004, craterMax: 0.05,
      ridges: true, ridgeScale: 5, ridgeBlend: 0.35,
      tectonic: true, tecScale: 7, tecStr: 0.6,
      baseScale: 3.5, polar: false, polarFrost: false, minerals: true,
      hasClouds: true,
    },
  },
  'lava-ocean': {
    label: 'Lava ocean (molten surface)',
    palette: [
      [10,3,1],[15,5,2],[25,8,3],[30,10,4],[40,13,4],[50,15,5],
      [65,18,5],[80,20,5],[110,28,5],[160,40,5],
      [200,60,8],[220,80,10],[240,100,15],[250,130,20],[255,160,35],[255,180,50],[255,220,100],
    ],
    features: {
      craters: true, craterCount: 15, craterMin: 0.005, craterMax: 0.04,
      ridges: true, ridgeScale: 3, ridgeBlend: 0.6,
      tectonic: true, tecScale: 6, tecStr: 0.9,
      baseScale: 3, polar: false, polarFrost: false, minerals: false,
      hasEmission: true, emissionThreshold: 0.45,
    },
  },

  // ── Gas giganty (proceduralne pasma, bez terenu) ──────────────
  gas_warm: {
    label: 'Gas giant warm (Jupiter-like)',
    isGas: true,
    palette: [
      [120,70,30],[140,85,40],[160,100,50],[175,110,55],[190,125,65],
      [200,140,75],[210,155,85],[215,165,100],[220,175,115],[225,185,130],
      [230,195,145],[235,200,155],[240,210,170],[245,220,185],[250,230,200],
      [255,240,215],
    ],
    bandConfig: {
      bandFreq: 12,          // liczba głównych pasm
      turbulenceScale: 3.5,  // skala turbulencji na pasmach
      stormChance: 0.15,     // szansa na burzę per piksel (próg Worley)
      stormScale: 6,         // skala Worley dla burz
      bandWidthVariation: 0.6, // zmienność szerokości pasm
    },
  },
  gas_cold: {
    label: 'Gas giant cold (Neptune-like)',
    isGas: true,
    palette: [
      [30,50,120],[40,65,140],[50,80,160],[55,90,170],[60,100,180],
      [70,110,190],[80,120,200],[90,130,210],[100,145,218],[110,155,225],
      [120,165,230],[135,178,235],[150,190,240],[170,205,245],[190,218,248],
      [210,230,252],
    ],
    bandConfig: {
      bandFreq: 18,          // węższe pasma
      turbulenceScale: 2.5,
      stormChance: 0.08,     // mniej burz
      stormScale: 8,
      bandWidthVariation: 0.4,
    },
  },
  gas_giant: {
    label: 'Gas giant (Saturn-like)',
    isGas: true,
    palette: [
      [180,165,130],[190,175,140],[195,180,145],[200,185,150],[205,190,155],
      [210,195,160],[215,200,165],[218,205,172],[220,208,178],[222,210,182],
      [225,215,188],[228,218,192],[230,220,195],[235,225,200],[240,232,210],
      [245,238,218],
    ],
    bandConfig: {
      bandFreq: 24,          // liczne wąskie pasma
      turbulenceScale: 2.0,
      stormChance: 0.05,
      stormScale: 10,
      bandWidthVariation: 0.3,
    },
  },

  // ── Planetoidy (standardowy pipeline, małe ciała) ─────────────
  planetoid_metallic: {
    label: 'Planetoid metallic (bright, iron-rich)',
    palette: [
      [140,135,125],[150,145,135],[160,155,145],[170,165,155],[178,172,162],
      [185,180,170],[192,188,178],[198,194,185],[205,200,192],[210,206,198],
      [215,212,205],[220,218,212],
    ],
    features: {
      craters: true, craterCount: 80, craterMin: 0.005, craterMax: 0.08,
      ridges: false, ridgeScale: 2, ridgeBlend: 0.1,
      tectonic: false, tecScale: 3, tecStr: 0.15,
      baseScale: 2.5, polar: false, polarFrost: false, minerals: true,
    },
  },
  planetoid_carbonaceous: {
    label: 'Planetoid carbonaceous (dark, carbon-rich)',
    palette: [
      [25,22,18],[30,27,22],[35,32,26],[40,36,30],[48,42,35],
      [55,48,40],[62,55,46],[68,60,50],[75,66,55],[82,72,60],
      [88,78,65],[95,84,70],
    ],
    features: {
      craters: true, craterCount: 60, craterMin: 0.004, craterMax: 0.06,
      ridges: false, ridgeScale: 2, ridgeBlend: 0.1,
      tectonic: false, tecScale: 3, tecStr: 0.1,
      baseScale: 2.0, polar: false, polarFrost: false, minerals: false,
    },
  },
  planetoid_silicate: {
    label: 'Planetoid silicate (grey, rocky)',
    palette: [
      [80,78,72],[90,88,82],[100,98,92],[110,108,100],[118,115,108],
      [125,122,115],[132,130,122],[140,138,130],[148,145,138],[155,152,145],
      [162,160,152],[170,168,160],
    ],
    features: {
      craters: true, craterCount: 70, craterMin: 0.004, craterMax: 0.07,
      ridges: true, ridgeScale: 3, ridgeBlend: 0.15,
      tectonic: false, tecScale: 3, tecStr: 0.1,
      baseScale: 2.2, polar: false, polarFrost: false, minerals: true,
    },
  },
};

if (flags['list-types']) {
  console.log('\nDostępne typy planet:\n');
  for (const [key, val] of Object.entries(PLANET_TYPES)) {
    console.log(`  ${key.padEnd(14)} — ${val.label}`);
  }
  console.log('  all            — Generuj po jednej z każdego typu\n');
  process.exit(0);
}

// ============================================
// PLANET GENERATION PIPELINE
// ============================================

/**
 * Generuje pełen zestaw tekstur dla jednej planety.
 * @param {object} planetType — z PLANET_TYPES
 * @param {number} W — szerokość px
 * @param {number} H — wysokość px
 * @param {number} seed
 * @param {object} genOpts — flagi generacji
 * @returns {object} — { diffuse, normal?, height?, roughness?, ao?, specular?, emission?, clouds?, nightlights? }
 */
function generatePlanet(planetType, W, H, seed, genOpts) {
  const { palette, features } = planetType;
  const quality = genOpts.quality || 'high';
  const useGamma = quality === 'high' || quality === 'ultra';

  // ── 1. Heightmap ──
  const { heightmap, craters, worleyData } = generateTerrain(
    W, H, features, seed, quality, true
  );

  // ── 2. Diffuse color ──
  const t0 = Date.now();
  const diffuse = new Uint8Array(W * H * 3);
  const nColor = createNoise(seed + 7000);
  const nPolar = createNoise(seed + 7500);

  for (let py = 0; py < H; py++) {
    if (py % 100 === 0) progressBar(py, H, 'diffuse color', t0);

    for (let px = 0; px < W; px++) {
      const u = px / W, v = py / H;
      const { x: nx, y: ny, z: nz } = sphereCoords(u, v);
      const h = heightmap[py * W + px];

      // kontrast na heightmap
      const hc = useGamma ? contrastCurve(h, 2.2) : h;

      // gradient mapping (gamma-correct lub linear)
      let c = useGamma ? gammaLerp(palette, hc) : multiLerp(palette, hc);

      // color variation (low-freq noise)
      const cv = fbm3d(nColor, nx * 8, ny * 8, nz * 8, 3);
      c = colorVariation(c, cv, 12);

      // Worley-based color jitter + mineral streaks
      if (worleyData) {
        const idx3 = (py * W + px) * 3;
        const f1 = worleyData[idx3];
        const f2 = worleyData[idx3 + 1];
        const cellId = worleyData[idx3 + 2];

        c = colorJitter(c, cellId, 0.6);

        if (features.minerals) {
          c = mineralStreaks(c, f1, f2, 0.08, 1.0);
        }
      } else if (features.minerals) {
        // fallback — prosty mineral streak bez Worley
        const mineral = fbm3d(nColor, nx * 12 + 3, ny * 12 + nz * 12 + 3, nz * 12, 4, 2.3, 0.45);
        if (mineral > 0.3) {
          const ms = (mineral - 0.3) / 0.7;
          c[0] += ms * 15; c[1] -= ms * 5; c[2] -= ms * 8;
        }
      }

      // lava flow (volcanic / lava-ocean)
      if (features.hasEmission) {
        const theta = u * Math.PI * 2, phi = v * Math.PI;
        const wor = sphereWorley(theta, phi, features.tecScale * 0.7, 0.9, seed + 9500);
        const flowVal = (wor.f2 - wor.f1 < 0.06) ? 1 - (wor.f2 - wor.f1) / 0.06 : 0;
        c = lavaFlow(c, flowVal, h, features.emissionThreshold || 0.45);
      }

      // polar ice
      const absLat = Math.abs(ny);
      if (features.polarFrost) {
        const noiseVal = fbm3d(nPolar, nx * 10, ny * 10, nz * 10, 3);
        c = polarIce(c, absLat, noiseVal, {
          polarStart: features.polarStart || 0.72,
          polarEnd: features.polarEnd || 0.93,
          frost: true,
        });
      } else if (features.polar) {
        const noiseVal = fbm3d(nPolar, nx * 10, ny * 10, nz * 10, 3);
        c = polarIce(c, absLat, noiseVal, {
          polarStart: features.polarStart || 0.75,
          polarEnd: features.polarEnd || 0.95,
          frost: false,
        });
      }

      // zapis
      const idx = (py * W + px) * 3;
      diffuse[idx]     = clamp(Math.round(c[0]), 0, 255);
      diffuse[idx + 1] = clamp(Math.round(c[1]), 0, 255);
      diffuse[idx + 2] = clamp(Math.round(c[2]), 0, 255);
    }
  }
  progressDone('diffuse color', t0);

  const result = { diffuse };

  // ── 3. Normal map ──
  if (genOpts.normal !== false) {
    const t1 = Date.now();
    result.normal = generateNormalMap(heightmap, W, H, 3.0);
    progressDone('normal map', t1);
  }

  // ── 4. Heightmap grayscale ──
  if (genOpts.height !== false) {
    result.height = generateHeightGrayscale(heightmap, W, H);
    console.log('  ✓ heightmap');
  }

  // ── 5. Roughness ──
  if (genOpts.roughness !== false) {
    result.roughness = generateRoughnessMap(heightmap, W, H, craters);
    console.log('  ✓ roughness map');
  }

  // ── 6. AO ──
  if (genOpts.ao) {
    const t1 = Date.now();
    result.ao = generateAOMap(heightmap, W, H);
    progressDone('ambient occlusion', t1);
  }

  // ── 7. Specular ──
  if (genOpts.specular) {
    result.specular = generateSpecularMap(heightmap, W, H, craters, worleyData);
    console.log('  ✓ specular map');
  }

  // ── 8. Emission ──
  if (genOpts.emission && features.hasEmission) {
    const t1 = Date.now();
    result.emission = generateEmissionMap(heightmap, W, H, seed, {
      threshold: features.emissionThreshold || 0.4,
      tecScale: features.tecScale || 6,
    });
    progressDone('emission map', t1);
  }

  // ── 9. Clouds ──
  if (genOpts.clouds) {
    const t1 = Date.now();
    result.clouds = generateCloudLayer(W, H, seed);
    progressDone('cloud layer', t1);
  }

  // ── 10. Night lights ──
  if (genOpts.nightlights) {
    result.nightlights = generateNightLightsMap(heightmap, W, H, seed);
    console.log('  ✓ night lights');
  }

  return result;
}

// ============================================
// GAS GIANT GENERATION PIPELINE
// ============================================

/**
 * Generuje tekstury gazowego giganta — pasma + turbulencja + burze.
 * Nie korzysta z generateTerrain() (brak kraterów/erozji/ridges).
 * @param {object} planetType — z PLANET_TYPES (isGas=true)
 * @param {number} W — szerokość px
 * @param {number} H — wysokość px
 * @param {number} seed
 * @param {object} genOpts — flagi generacji
 * @returns {object} — { diffuse, normal?, height?, roughness? }
 */
function generateGasGiant(planetType, W, H, seed, genOpts) {
  const { palette, bandConfig } = planetType;
  const { bandFreq, turbulenceScale, stormChance, stormScale, bandWidthVariation } = bandConfig;
  const quality = genOpts.quality || 'high';
  const useGamma = quality === 'high' || quality === 'ultra';
  const octaves = quality === 'low' ? 4 : quality === 'medium' ? 6 : quality === 'ultra' ? 10 : 8;

  // ── 1. Heightmap (band-based + turbulencja + burze) ──
  const t0h = Date.now();
  const heightmap = new Float32Array(W * H);

  // Silnik szumu
  const nBand    = createNoise(seed + 100);
  const nTurb    = createNoise(seed + 200);
  const nWarp    = createNoise(seed + 300);
  const nDetail  = createNoise(seed + 400);
  const nBandVar = createNoise(seed + 500);

  for (let py = 0; py < H; py++) {
    if (py % 100 === 0) progressBar(py, H, 'gas bands', t0h);

    for (let px = 0; px < W; px++) {
      const u = px / W, v = py / H;
      const { x: nx, y: ny, z: nz } = sphereCoords(u, v);

      // Główne pasma: sinus po latitude (ny) z modulacją
      const bandVariation = fbm3d(nBandVar, nx * 2, ny * 2, nz * 2, 3) * bandWidthVariation;
      const bandVal = Math.sin((ny * bandFreq + bandVariation) * Math.PI);

      // Turbulencja: domain warp na pasmach
      const warpX = fbm3d(nWarp, nx * turbulenceScale, ny * turbulenceScale, nz * turbulenceScale, octaves, 2.0, 0.5);
      const warpZ = fbm3d(nWarp, nx * turbulenceScale + 7.3, ny * turbulenceScale + 3.1, nz * turbulenceScale + 5.7, octaves, 2.0, 0.5);

      const turbBand = Math.sin(
        (ny * bandFreq + bandVariation + warpX * 1.2) * Math.PI +
        warpZ * 0.8
      );

      // Mieszanka pasma + turbulencja
      let h = (turbBand * 0.6 + bandVal * 0.4 + 1) * 0.5; // [0, 1]

      // Drobne detale (drobna struktura chmur)
      const detail = fbm3d(nDetail, nx * 12, ny * 12, nz * 12, Math.min(octaves, 6), 2.2, 0.45);
      h += detail * 0.08;

      // Burze (storm spots) — Worley noise
      if (stormChance > 0) {
        const storm = sphereWorley(u * Math.PI * 2, v * Math.PI, stormScale, 0.85, seed + 600);
        const stormVal = 1 - storm.f1;
        if (stormVal > (1 - stormChance)) {
          const intensity = (stormVal - (1 - stormChance)) / stormChance;
          // Wirowe zaciemnienie/rozjaśnienie (naprzemienne)
          const swirl = fbm3d(nTurb, nx * 15 + storm.f2 * 3, ny * 15, nz * 15 + storm.f1 * 3, 4);
          h += intensity * swirl * 0.2;
        }
      }

      heightmap[py * W + px] = clamp(h, 0, 1);
    }
  }
  progressDone('gas bands', t0h);

  // ── 2. Diffuse color ──
  const t0c = Date.now();
  const diffuse = new Uint8Array(W * H * 3);
  const nColor = createNoise(seed + 700);

  for (let py = 0; py < H; py++) {
    if (py % 100 === 0) progressBar(py, H, 'gas diffuse', t0c);

    for (let px = 0; px < W; px++) {
      const u = px / W, v = py / H;
      const { x: nx, y: ny, z: nz } = sphereCoords(u, v);
      let h = heightmap[py * W + px];

      // kontrast
      const hc = useGamma ? contrastCurve(h, 1.8) : h;

      // gradient mapping
      let c = useGamma ? gammaLerp(palette, hc) : multiLerp(palette, hc);

      // color variation (niskoczęstotliwościowa)
      const cv = fbm3d(nColor, nx * 5, ny * 5, nz * 5, 3);
      c = colorVariation(c, cv, 15);

      const idx = (py * W + px) * 3;
      diffuse[idx]     = clamp(Math.round(c[0]), 0, 255);
      diffuse[idx + 1] = clamp(Math.round(c[1]), 0, 255);
      diffuse[idx + 2] = clamp(Math.round(c[2]), 0, 255);
    }
  }
  progressDone('gas diffuse', t0c);

  const result = { diffuse };

  // ── 3. Normal map — niska siła (subtelna głębia chmur) ──
  if (genOpts.normal !== false) {
    const t1 = Date.now();
    result.normal = generateNormalMap(heightmap, W, H, 0.8);
    progressDone('gas normal', t1);
  }

  // ── 4. Heightmap grayscale ──
  if (genOpts.height !== false) {
    result.height = generateHeightGrayscale(heightmap, W, H);
    console.log('  ✓ gas heightmap');
  }

  // ── 5. Roughness — niska i jednolita (gładka atmosfera) ──
  if (genOpts.roughness !== false) {
    const roughness = new Uint8Array(W * H);
    const nRough = createNoise(seed + 800);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const u = px / W, v = py / H;
        const { x: nx, y: ny, z: nz } = sphereCoords(u, v);
        // Bazowa roughness 0.25–0.45 z subtelną wariacją
        const variation = fbm3d(nRough, nx * 6, ny * 6, nz * 6, 3) * 0.1;
        const rough = 0.35 + variation;
        roughness[py * W + px] = clamp(Math.round(rough * 255), 0, 255);
      }
    }
    result.roughness = roughness;
    console.log('  ✓ gas roughness');
  }

  // ── 6. Clouds (opcjonalny) ──
  if (genOpts.clouds) {
    const t1 = Date.now();
    result.clouds = generateCloudLayer(W, H, seed);
    progressDone('gas clouds', t1);
  }

  return result;
}

// ============================================
// WORKER PIPELINE (opcjonalny)
// ============================================

// Worker threads — do przyszłej implementacji wielowątkowej
// Obecna wersja: sekwencyjne wykonanie (prostsze, debuggowalne)

// ============================================
// MAIN
// ============================================

async function main() {
  const typeArg = flags.type || 'all';
  const count = parseInt(flags.count) || 1;
  const resolution = parseInt(flags.resolution) || 2048;
  const baseSeed = flags.seed ? parseInt(flags.seed) : null;
  const outputDir = flags.output || './planet-textures';
  const namePrefix = flags.name || null;
  const quality = flags.quality || 'high';

  // flagi map
  const genNormal = flags['no-normal'] !== true;
  const genHeight = flags['no-height'] !== true;
  const genRoughness = flags['no-roughness'] !== true;
  const allMaps = flags['all-maps'] === true;
  const genAO = allMaps || flags.ao === true;
  const genSpecular = allMaps || flags.specular === true;
  const genEmission = allMaps || flags.emission === true;
  const genClouds = allMaps || flags.clouds === true;
  const genNightlights = allMaps || flags.nightlights === true;

  // override erosion
  let erosionOverride = null;
  if (flags.erosion === 'off') erosionOverride = false;
  else if (flags.erosion === 'on') erosionOverride = true;

  const W = resolution;
  const H = Math.floor(resolution / 2);

  // typy do generacji
  let types;
  if (typeArg === 'all') {
    types = Object.keys(PLANET_TYPES);
  } else if (PLANET_TYPES[typeArg]) {
    types = [typeArg];
  } else {
    console.error(`\n❌ Nieznany typ planety: "${typeArg}"`);
    console.error(`   Użyj --list-types aby zobaczyć dostępne typy.\n`);
    process.exit(1);
  }

  // folder wyjściowy
  fs.mkdirSync(outputDir, { recursive: true });

  const totalPlanets = types.length * count;

  // mapy do wygenerowania
  const mapList = [];
  if (genNormal) mapList.push('normal');
  if (genHeight) mapList.push('height');
  if (genRoughness) mapList.push('roughness');
  if (genAO) mapList.push('ao');
  if (genSpecular) mapList.push('specular');
  if (genEmission) mapList.push('emission');
  if (genClouds) mapList.push('clouds');
  if (genNightlights) mapList.push('nightlights');

  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  PLANET TEXTURE GENERATOR v2                              ║`);
  console.log(`╠═══════════════════════════════════════════════════════════╣`);
  console.log(`║  Typ:          ${typeArg.padEnd(41)}║`);
  console.log(`║  Ilość:        ${String(totalPlanets).padEnd(41)}║`);
  console.log(`║  Rozdzielczość: ${(W + '×' + H).padEnd(40)}║`);
  console.log(`║  Jakość:       ${quality.padEnd(41)}║`);
  console.log(`║  Sharp:        ${(hasSharp() ? 'tak ✓' : 'nie (fallback PNG)').padEnd(41)}║`);
  console.log(`║  Mapy:         ${(['diffuse', ...mapList].join(', ')).padEnd(41)}║`);
  console.log(`║  Output:       ${outputDir.padEnd(41)}║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);

  let planetNum = 0;
  const totalT0 = Date.now();

  for (const type of types) {
    for (let i = 0; i < count; i++) {
      planetNum++;
      const seed = baseSeed !== null ? baseSeed + i * 1000 : Math.floor(Math.random() * 99999);

      const prefix = namePrefix || type;
      const suffix = count > 1 ? `_${String(i + 1).padStart(2, '0')}` : '';
      const fname = `${prefix}${suffix}`;

      console.log(`[${planetNum}/${totalPlanets}] ${PLANET_TYPES[type].label} (seed: ${seed}, quality: ${quality})`);
      const t0 = Date.now();

      const genOpts = {
        quality,
        normal: genNormal,
        height: genHeight,
        roughness: genRoughness,
        ao: genAO,
        specular: genSpecular,
        emission: genEmission,
        clouds: genClouds,
        nightlights: genNightlights,
      };

      const pType = PLANET_TYPES[type];
      const result = pType.isGas
        ? generateGasGiant(pType, W, H, seed, genOpts)
        : generatePlanet(pType, W, H, seed, genOpts);

      // ── Zapis plików ──
      const postOpts = {
        unsharp: quality === 'high' || quality === 'ultra',
        gamma: (quality === 'high' || quality === 'ultra') ? 1.1 : null,
      };

      // Diffuse (RGB)
      const diffPath = path.join(outputDir, `${fname}_diffuse.png`);
      const diffSize = await savePNG(diffPath, result.diffuse, W, H, 3, postOpts);
      console.log(`    → ${diffPath} (${(diffSize / 1024 / 1024).toFixed(1)} MB)`);

      // Normal (RGB)
      if (result.normal) {
        const p = path.join(outputDir, `${fname}_normal.png`);
        const sz = await savePNG(p, result.normal, W, H, 3);
        console.log(`    → ${p} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
      }

      // Height (Grayscale)
      if (result.height) {
        const p = path.join(outputDir, `${fname}_height.png`);
        const sz = await savePNG(p, result.height, W, H, 1);
        console.log(`    → ${p} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
      }

      // Roughness (Grayscale)
      if (result.roughness) {
        const p = path.join(outputDir, `${fname}_roughness.png`);
        const sz = await savePNG(p, result.roughness, W, H, 1);
        console.log(`    → ${p} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
      }

      // AO (Grayscale)
      if (result.ao) {
        const p = path.join(outputDir, `${fname}_ao.png`);
        const sz = await savePNG(p, result.ao, W, H, 1);
        console.log(`    → ${p} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
      }

      // Specular (Grayscale)
      if (result.specular) {
        const p = path.join(outputDir, `${fname}_specular.png`);
        const sz = await savePNG(p, result.specular, W, H, 1);
        console.log(`    → ${p} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
      }

      // Emission (RGB)
      if (result.emission) {
        const p = path.join(outputDir, `${fname}_emission.png`);
        const sz = await savePNG(p, result.emission, W, H, 3);
        console.log(`    → ${p} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
      }

      // Clouds (RGBA)
      if (result.clouds) {
        const p = path.join(outputDir, `${fname}_clouds.png`);
        const sz = await savePNG(p, result.clouds, W, H, 4);
        console.log(`    → ${p} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
      }

      // Night lights (Grayscale)
      if (result.nightlights) {
        const p = path.join(outputDir, `${fname}_nightlights.png`);
        const sz = await savePNG(p, result.nightlights, W, H, 1);
        console.log(`    → ${p} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
      }

      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`    ✓ gotowe w ${dt}s\n`);
    }
  }

  const totalDt = ((Date.now() - totalT0) / 1000).toFixed(1);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`✅ Wygenerowano ${planetNum} planet w ${totalDt}s`);
  console.log(`   Pliki w: ${path.resolve(outputDir)}`);
  console.log(`\n📋 Użycie w Three.js:`);
  console.log(`   const loader = new THREE.TextureLoader();`);
  console.log(`   const material = new THREE.MeshStandardMaterial({`);
  console.log(`     map: loader.load('${types[0]}_diffuse.png'),`);
  if (genNormal) console.log(`     normalMap: loader.load('${types[0]}_normal.png'),`);
  if (genHeight) {
    console.log(`     displacementMap: loader.load('${types[0]}_height.png'),`);
    console.log(`     displacementScale: 0.3,`);
  }
  if (genRoughness) console.log(`     roughnessMap: loader.load('${types[0]}_roughness.png'),`);
  if (genAO) console.log(`     aoMap: loader.load('${types[0]}_ao.png'),`);
  if (genSpecular) console.log(`     metalnessMap: loader.load('${types[0]}_specular.png'),`);
  if (genEmission) console.log(`     emissiveMap: loader.load('${types[0]}_emission.png'),`);
  console.log(`   });\n`);
}

main().catch(err => {
  console.error('\n❌ Błąd:', err.message);
  console.error(err.stack);
  process.exit(1);
});
