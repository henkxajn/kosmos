// KOSMOS — SysGenDigest: odcisk palca wyjścia generatora układów (ARC COLONY SPHERE, krok CS-3a).
//
// Po co: dowód „flaga `seededSystems` OFF = generacja bit w bit jak przed krokiem". Ten plik
// używa WYŁĄCZNIE API, które istnieje także na bazie `bf5a08d` (`generateForStar(gs)`,
// `peekCountsForStar(gs)`, `generateCivScenario()` bez argumentów), więc ten sam kod liczy odcisk
// w `git worktree --detach bf5a08d` (nagranie) i w drzewie roboczym (keeper) — porównanie jest
// porównaniem generatorów, nie dwóch różnych harnessów.
//
// Odcisk = SHA-256 kanonicznego JSON-a wszystkich ciał (gwiazda, planety, księżyce, planetoidy)
// z posortowanymi kluczami. Pole `surfaceSeed` jest POMIJANE celowo i tylko ono: generator go nie
// nadaje (nadaje wołający — StarSystemManager / pass po wczytaniu), więc jego brak/obecność nie
// jest częścią kontraktu generatora. Każde inne pole (orbita, skład, złoża, id) wchodzi.
//
// Wymaga: `globalThis.window` + `window.KOSMOS` ustawione PRZED importem (jak w każdym keeperze)
// oraz `env.js` zaimportowanego wcześniej (Math.random = seeded PRNG harnessu → `reseed`).

import { createHash } from 'node:crypto';

const SKIP_KEYS = new Set(['surfaceSeed']);

function canonical(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return `"${String(value)}"`;
    if (typeof value === 'function' || value === undefined) return 'null';
    return JSON.stringify(value);
  }
  if (seen.has(value)) return '"[cycle]"';
  seen.add(value);
  let out;
  if (Array.isArray(value)) {
    out = '[' + value.map(v => canonical(v, seen)).join(',') + ']';
  } else {
    const keys = Object.keys(value).filter(k => !SKIP_KEYS.has(k) && typeof value[k] !== 'function').sort();
    out = '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(value[k], seen)).join(',') + '}';
  }
  seen.delete(value);
  return out;
}

export function digestResult(result) {
  const parts = {
    star:       result.star,
    planets:    result.planets,
    moons:      result.moons,
    planetoids: result.planetoids,
  };
  const json = canonical(parts);
  return {
    sha256:     createHash('sha256').update(json).digest('hex'),
    planets:    result.planets.length,
    moons:      result.moons.length,
    planetoids: result.planetoids.length,
  };
}

/** Stały zestaw gwiazd obcych — różne typy widmowe, id w formacie GalaxyGenerator. */
export const DIGEST_STARS = [
  { id: 'sys_001', name: 'Alfa',  spectralType: 'G', mass: 1.0,  luminosity: 1.0  },
  { id: 'sys_017', name: 'Beta',  spectralType: 'K', mass: 0.78, luminosity: 0.4  },
  { id: 'sys_037', name: 'Gamma', spectralType: 'M', mass: 0.4,  luminosity: 0.05 },
  { id: 'sys_052', name: 'Delta', spectralType: 'F', mass: 1.3,  luminosity: 2.5  },
  { id: 'sys_071', name: 'Eta',   spectralType: 'A', mass: 2.0,  luminosity: 12   },
];

/** Stałe ziarna harnessu (env.js `reseed`) dla generacji układu domowego. */
export const DIGEST_HOME_SEEDS = ['cs3a-home-1', 'cs3a-home-2', 'cs3a-home-3'];

/**
 * @param {{SystemGenerator, EntityManager, reseed}} deps — przekazane z wołającego (każde drzewo swoje)
 * @returns {{foreign: Object, peek: Object, home: Object}}
 */
export function sysGenDigest({ SystemGenerator, EntityManager, reseed }) {
  const foreign = {}, peek = {}, home = {};
  for (const gs of DIGEST_STARS) {
    EntityManager.clear();
    foreign[gs.id] = digestResult(new SystemGenerator().generateForStar({ ...gs }));
    EntityManager.clear();
    const c = new SystemGenerator().peekCountsForStar({ ...gs });
    peek[gs.id] = { planets: c.planets, moons: c.moons, planetoids: c.planetoids, total: c.total };
  }
  for (const s of DIGEST_HOME_SEEDS) {
    EntityManager.clear();
    reseed(s);
    home[s] = digestResult(new SystemGenerator().generateCivScenario());
  }
  EntityManager.clear();
  return { foreign, peek, home };
}
