// OrbitalRolesData — preferencje radialne dla sferycznej przestrzeni orbitalnej.
//
// Każda rola orbitalna definiuje:
//   - rMin, rMax       — zakres radiusu (jednostki Three.js world)
//   - phiCenter        — środek zakresu kąta biegunowego (rad; π/2 = równik)
//   - phiDelta         — połowa rozpiętości od phiCenter (tolerancja)
//   - omega            — prędkość kątowa (rad/s); 0 = anchored
//   - label            — nazwa użytkowa (PL/EN — UI może czerpać)
//
// Konwencja: mniejszy `r` = bliżej planety = więcej obrażeń w bitwie
// (tier modifier w Fazie 5). Wraki mają największy zakres i najwolniej
// dryfują — "cmentarzysko orbitalne" z dala od żywych statków.

export const MIN_ANGULAR_SPACING_RAD = 15 * Math.PI / 180;   // 15° między obiektami
export const FALLBACK_SPACING_RAD    = 10 * Math.PI / 180;   // gdy 40 prób zawiedzie
export const SPAWN_ATTEMPTS          = 40;                    // liczba prób per assignOrbit
export const RADIAL_COLLISION_THRESHOLD = 0.3;                // |Δr| ≤ 0.3 wymaga spacing

// Preferencje radialne per rola — MULTIPLIER × promień planety (bodyR).
// Zapewnia automatyczne skalowanie: na małej planecie (rocky bodyR=0.07) wraki
// orbitują r≈0.5; na gazowym gigancie (bodyR=0.4) wraki orbitują r≈3.0.
// Z dodatkowym `rMinAbs` jako bezpiecznym minimum, żeby nawet bardzo mała planeta
// (np. księżyc bodyR=0.02) nie miała orbit wewnątrz mesh planety.
//
// Skala oparta o realną logikę: warships LEO (1.5-2× promień Ziemi),
// cargo MEO (2-3×), stacje GEO (4-5×), wraki dalej (6-8×).
export const ORBITAL_ROLES = {
  // Satelity — niska orbita (LEO-like)
  satellite: {
    rMinMult: 1.5, rMaxMult: 1.9, rMinAbs: 0.06,
    phiCenter: Math.PI / 2, phiDelta: Math.PI / 8,
    omegaBase: 0.12,
    labelPL: 'Satelita', labelEN: 'Satellite',
  },
  // Warships — strefa defensywna, blisko planety (LEO)
  warship: {
    rMinMult: 1.9, rMaxMult: 2.5, rMinAbs: 0.08,
    phiCenter: Math.PI / 2, phiDelta: Math.PI / 4,
    omegaBase: 0.10,
    labelPL: 'Okręt bojowy', labelEN: 'Warship',
  },
  // Cargo — strefa tranzytowa (MEO)
  cargo: {
    rMinMult: 2.5, rMaxMult: 3.4, rMinAbs: 0.10,
    phiCenter: Math.PI / 2, phiDelta: Math.PI / 6,
    omegaBase: 0.08,
    labelPL: 'Frachtowiec', labelEN: 'Cargo',
  },
  // Science — wyższa orbita, polar orbit w zakresie
  science: {
    rMinMult: 3.4, rMaxMult: 4.5, rMinAbs: 0.12,
    phiCenter: Math.PI / 2, phiDelta: Math.PI / 3,
    omegaBase: 0.07,
    labelPL: 'Statek badawczy', labelEN: 'Science',
  },
  // Stacje orbitalne — GEO, anchored (omega=0)
  station: {
    rMinMult: 4.0, rMaxMult: 5.0, rMinAbs: 0.14,
    phiCenter: Math.PI / 2, phiDelta: Math.PI / 6,
    omegaBase: 0.0,
    labelPL: 'Stacja orbitalna', labelEN: 'Orbital Station',
  },
  // Wraki — graveyard, dalej od żywych statków, ale wciąż przy planecie
  wreck: {
    rMinMult: 5.5, rMaxMult: 7.0, rMinAbs: 0.18,
    phiCenter: Math.PI / 2, phiDelta: Math.PI / 2,
    omegaBase: 0.02,
    labelPL: 'Wrak', labelEN: 'Wreck',
  },
  // Domyślna rola gdy nic nie pasuje — traktowana jak cargo
  default: {
    rMinMult: 2.5, rMaxMult: 3.4, rMinAbs: 0.10,
    phiCenter: Math.PI / 2, phiDelta: Math.PI / 6,
    omegaBase: 0.08,
    labelPL: 'Statek', labelEN: 'Vessel',
  },
};

/**
 * Promień planety (jednostki Three.js world) z fizyki entity.
 * Identyczna logika jak ThreeRenderer._planetRadius — duplikat żeby uniknąć
 * cyklicznego importu i zależności OrbitalSpaceSystem od renderera.
 */
export function computeBodyRadius(entity) {
  if (!entity) return 0.1;
  const type = entity.type;
  const mass = entity.physics?.mass ?? 1;
  if (type === 'star') return 1.6;
  if (type === 'moon') {
    return Math.max(0.015, Math.min(0.04, 0.015 + (entity.physics?.mass ?? 0.001) * 1.5));
  }
  if (type === 'planetoid') return 0.02;
  if (type === 'planet') {
    const ptype = entity.planetType;
    if (ptype === 'gas') {
      if (mass < 50) return Math.max(0.20, Math.min(0.35, 0.15 + Math.log10(Math.max(1, mass)) * 0.11));
      return Math.max(0.35, Math.min(0.60, 0.20 + Math.log10(Math.max(1, mass)) * 0.16));
    }
    if (ptype === 'ice')        return Math.max(0.14, Math.min(0.24, 0.10 + Math.log10(Math.max(1, mass)) * 0.10));
    if (ptype === 'hot_rocky')  return Math.max(0.04, Math.min(0.10, 0.04 + mass * 0.025));
    return Math.max(0.06, Math.min(0.14, 0.05 + mass * 0.012));
  }
  return 0.1;
}

/**
 * Oblicz konkretny zakres orbit (rMin, rMax) dla danej roli na danym ciele.
 */
export function getOrbitRange(roleKey, bodyRadius) {
  const def = ORBITAL_ROLES[roleKey] ?? ORBITAL_ROLES.default;
  const rMin = Math.max(def.rMinAbs ?? 0, bodyRadius * def.rMinMult);
  const rMax = Math.max(rMin + 0.02, bodyRadius * def.rMaxMult);
  return { rMin, rMax };
}

// Helper: wybór roli dla vessela na podstawie modułów/flag.
// Priorytet: wreck > station > science > warship > cargo > default.
export function resolveVesselOrbitalRole(vessel) {
  if (!vessel) return 'default';
  if (vessel.isWreck) return 'wreck';
  if (vessel.isStation) return 'station';

  const modules = vessel.modules ?? [];
  const hasWeapon = modules.some(m => {
    if (typeof m === 'string') return m.startsWith('weapon_');
    return m?.slotType === 'weapon';
  });
  const hasScience = modules.some(m => {
    const id = typeof m === 'string' ? m : m?.id;
    return id === 'science_lab' || id === 'deep_scanner' || id === 'quantum_scanner';
  });
  if (hasScience) return 'science';
  if (hasWeapon)  return 'warship';

  // Cargo capacity check
  if ((vessel.cargoMax ?? 0) > 0) return 'cargo';

  return 'default';
}
