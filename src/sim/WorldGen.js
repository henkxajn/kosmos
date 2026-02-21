import { RNG } from "./rng.js";

export const AU = 149_597_870_700; // m
export const G = 6.67430e-11;      // m^3 kg^-1 s^-2

function v3(x = 0, y = 0, z = 0) { return { x, y, z }; }
function makeId(prefix, n) { return `${prefix}-${n}`; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

export function generateWorld(seed) {
  const rng = new RNG(seed);

  const starMass = rng.range(0.7, 1.3) * 1.98847e30;
  const starRadius = rng.range(0.8, 1.4) * 6.9634e8;

  const star = { id: "star-0", name: "Star", type: "star", mass: starMass, radius: starRadius, position: v3(0,0,0) };

  const bodies = { [star.id]: star };
  const bodyOrder = [star.id];

  const numPlanets = rng.int(3, 9);
  let a = rng.range(0.25, 0.6) * AU;

  for (let p = 0; p < numPlanets; p++) {
    a *= rng.range(1.25, 1.75);

    const e = clamp01(rng.range(0.0, 0.15));
    const i = rng.range(0, 10) * (Math.PI / 180);

    const planetMass = rng.range(0.2, 5.0) * 5.972e24;
    const planetRadius = rng.range(0.6, 2.2) * 6.371e6;

    const planetId = makeId("planet", p);
    const orbit = {
      parentId: star.id,
      semiMajorAxis: a,
      eccentricity: e,
      inclination: i,
      lonAscendingNode: rng.range(0, Math.PI * 2),
      argPeriapsis: rng.range(0, Math.PI * 2),
      meanAnomalyAtEpoch: rng.range(0, Math.PI * 2)
    };

    const planet = { id: planetId, name: `Planet ${p + 1}`, type: "planet", mass: planetMass, radius: planetRadius, orbit, position: v3() };
    bodies[planet.id] = planet;
    bodyOrder.push(planet.id);

    const moonCount = rng.int(0, Math.min(4, Math.floor(planetMass / 5.972e24) + 1));
    for (let m = 0; m < moonCount; m++) {
      const moonId = `${planetId}-moon-${m}`;
      const moonMass = rng.range(0.01, 0.2) * 7.342e22;
      const moonRadius = rng.range(0.2, 0.7) * 1.737e6;

      const moonA = rng.range(5, 40) * planetRadius;
      const moonOrbit = {
        parentId: planet.id,
        semiMajorAxis: moonA,
        eccentricity: clamp01(rng.range(0, 0.08)),
        inclination: rng.range(0, 18) * (Math.PI / 180),
        lonAscendingNode: rng.range(0, Math.PI * 2),
        argPeriapsis: rng.range(0, Math.PI * 2),
        meanAnomalyAtEpoch: rng.range(0, Math.PI * 2)
      };

      const moon = { id: moonId, name: `Moon ${m + 1} of P${p + 1}`, type: "moon", mass: moonMass, radius: moonRadius, orbit: moonOrbit, position: v3() };
      bodies[moon.id] = moon;
      bodyOrder.push(moon.id);
    }
  }

  return { seed, timeSeconds: 0, paused: false, timeScale: 86400, bodies, bodyOrder };
}

export function getMuForParent(parent) { return G * parent.mass; }
