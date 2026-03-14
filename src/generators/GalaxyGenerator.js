// GalaxyGenerator — generator danych galaktycznych (okoliczne układy gwiezdne)
//
// Generuje ~42 układów wokół macierzystego systemu gracza.
// Seeded PRNG (Mulberry32) z star.id → determinizm.
// Rozkład Poisson-disk w sferze 3-18 LY z rozłożonym Z (grubość dysku).

import { STAR_TYPES } from '../config/GameConfig.js';

// ── Stałe ─────────────────────────────────────────────────────────────────────
const SYSTEM_COUNT = 72;
const MIN_DIST_LY  = 2.0;   // minimalna odl. między gwiazdami (LY)
const MAX_DIST_LY  = 22.0;  // max odl. od home (LY)
const Z_SPREAD     = 5.0;   // max |z| — grubość dysku galaktycznego

// Wagi typów spektralnych (M najczęstsze)
const SPECTRAL_WEIGHTS = [
  { type: 'M', weight: 3 },
  { type: 'K', weight: 2 },
  { type: 'G', weight: 2 },
  { type: 'F', weight: 1 },
];
const TOTAL_WEIGHT = SPECTRAL_WEIGHTS.reduce((s, w) => s + w.weight, 0);

// Pula nazw gwiazd (polskie + klasyczne)
const STAR_NAMES = [
  'Tau Ceti', 'Proxima', 'Barnarda', 'Lalande', 'Sirius',
  'Procyon', 'Altair', 'Wega', 'Deneb', 'Kapella',
  'Aldebaran', 'Betelgeza', 'Rigel', 'Antares', 'Arktur',
  'Pollux', 'Regulus', 'Fomalhaut', 'Akhernar', 'Kanopus',
  'Spika', 'Mira', 'Hadar', 'Rasalhague', 'Shaula',
  'Mimosa', 'Algieba', 'Diphda', 'Thuban', 'Eltanin',
  'Algorab', 'Sadalmelik', 'Alnilam', 'Mintaka', 'Bellatrix',
  'Castor', 'Acamar', 'Sabik', 'Suhail', 'Avior',
  'Alsephina', 'Ankaa', 'Sargas', 'Kochab', 'Phact',
  'Zuben', 'Izar', 'Alderamin', 'Schedar', 'Mirfak',
  'Naos', 'Wezen', 'Aludra', 'Adhara', 'Furud',
  'Mirzam', 'Arneb', 'Nihal', 'Cursa', 'Hassaleh',
  'Elnath', 'Tejat', 'Mebsuta', 'Alzirr', 'Alhena',
  'Propus', 'Wasat', 'Mekbuda', 'Talitha', 'Muscida',
  'Dubhe', 'Merak', 'Phecda', 'Megrez', 'Alioth',
  'Alcor', 'Alkaid', 'Cor Caroli', 'Nekkar', 'Seginus',
];

// ── Mulberry32 PRNG ───────────────────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash string → number (deterministyczny seed)
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

// ── Generator ─────────────────────────────────────────────────────────────────

export class GalaxyGenerator {
  /**
   * Generuje dane galaktyczne (okoliczne układy gwiezdne).
   * @param {string} starId — ID gwiazdy gracza (seed PRNG)
   * @param {string} [starName] — nazwa gwiazdy gracza (dla home system)
   * @param {string} [spectralType] — typ spektralny gwiazdy gracza
   * @returns {GalaxyData}
   */
  static generate(starId, starName = 'Sol', spectralType = 'G') {
    const seed = hashString(starId);
    const rng = mulberry32(seed);

    const systems = [];

    // Home system — gracz
    const homeType = STAR_TYPES[spectralType] || STAR_TYPES.G;
    systems.push({
      id:           'sys_home',
      name:         starName,
      spectralType: spectralType,
      mass:         homeType.mass,
      luminosity:   homeType.luminosity,
      colorHex:     homeType.color,
      glowColorHex: homeType.glowColor,
      x: 0, y: 0, z: 0,
      distanceLY:   0,
      explored:     true,
      hasColony:    true,
      isHome:       true,
    });

    // Tasowanie nazw (Fisher-Yates z PRNG)
    const names = [...STAR_NAMES];
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }

    // Generuj okoliczne układy (Poisson-disk sampling)
    let attempts = 0;
    const maxAttempts = 5000;

    while (systems.length < SYSTEM_COUNT && attempts < maxAttempts) {
      attempts++;

      // Losowa pozycja w sferze
      const angle = rng() * Math.PI * 2;
      const dist  = MIN_DIST_LY + rng() * (MAX_DIST_LY - MIN_DIST_LY);
      const x = dist * Math.cos(angle);
      const y = dist * Math.sin(angle);
      const z = (rng() * 2 - 1) * Z_SPREAD;

      // Sprawdź min odl. od istniejących
      let tooClose = false;
      for (const s of systems) {
        const dx = x - s.x, dy = y - s.y, dz = z - s.z;
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) < MIN_DIST_LY) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Typ spektralny (weighted random)
      const roll = rng() * TOTAL_WEIGHT;
      let cumul = 0;
      let specType = 'M';
      for (const sw of SPECTRAL_WEIGHTS) {
        cumul += sw.weight;
        if (roll < cumul) { specType = sw.type; break; }
      }

      const stInfo = STAR_TYPES[specType];
      const idx = systems.length - 1; // -1 bo home już jest
      const distLY = Math.sqrt(x*x + y*y + z*z);

      // Lekka wariacja masy (±20%)
      const massMult = 0.8 + rng() * 0.4;
      const lumMult  = massMult * massMult; // L ∝ M² (uproszczone)

      systems.push({
        id:           `sys_${String(systems.length).padStart(3, '0')}`,
        name:         names[idx] || `GJ-${Math.floor(rng() * 9000 + 1000)}`,
        spectralType: specType,
        mass:         +(stInfo.mass * massMult).toFixed(2),
        luminosity:   +(stInfo.luminosity * lumMult).toFixed(3),
        colorHex:     stInfo.color,
        glowColorHex: stInfo.glowColor,
        x: +x.toFixed(2),
        y: +y.toFixed(2),
        z: +z.toFixed(2),
        distanceLY:   +distLY.toFixed(1),
        explored:     false,
        hasColony:    false,
        isHome:       false,
      });
    }

    return { seed, systems };
  }
}
