import { getMuForParent } from "../WorldGen.js";

function v3(x = 0, y = 0, z = 0) { return { x, y, z }; }

function solveKepler(M, e) {
  const twoPi = Math.PI * 2;
  M = ((M % twoPi) + twoPi) % twoPi;

  let E = e < 0.8 ? M : Math.PI;
  for (let iter = 0; iter < 12; iter++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E = E - f / fp;
  }
  return E;
}

function rotatePQWtoIJK(posPQW, O, i, w) {
  const cosO = Math.cos(O), sinO = Math.sin(O);
  const cosi = Math.cos(i), sini = Math.sin(i);
  const cosw = Math.cos(w), sinw = Math.sin(w);

  const x =
    (cosO * cosw - sinO * sinw * cosi) * posPQW.x +
    (-cosO * sinw - sinO * cosw * cosi) * posPQW.y;

  const y =
    (sinO * cosw + cosO * sinw * cosi) * posPQW.x +
    (-sinO * sinw + cosO * cosw * cosi) * posPQW.y;

  const z =
    (sinw * sini) * posPQW.x +
    (cosw * sini) * posPQW.y;

  return { x, y, z };
}

export class OrbitSystem {
  constructor() { this.id = "OrbitSystem"; }

  step(world, _dt) {
    for (const id of world.bodyOrder) {
      const body = world.bodies[id];

      if (body.type === "star") {
        body.position = v3(0, 0, 0);
        continue;
      }
      if (!body.orbit) continue;

      const parent = world.bodies[body.orbit.parentId];
      if (!parent) continue;

      const { semiMajorAxis: a, eccentricity: e, inclination: i, lonAscendingNode: O, argPeriapsis: w, meanAnomalyAtEpoch: M0 } = body.orbit;

      const mu = getMuForParent(parent);
      const n = Math.sqrt(mu / (a * a * a));
      const M = M0 + n * world.timeSeconds;

      const E = solveKepler(M, e);
      const cosE = Math.cos(E);
      const sinE = Math.sin(E);

      const nu = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);
      const r = a * (1 - e * cosE);

      const posPQW = v3(r * Math.cos(nu), r * Math.sin(nu), 0);
      const posIJK = rotatePQWtoIJK(posPQW, O, i, w);

      body.position = { x: parent.position.x + posIJK.x, y: parent.position.y + posIJK.y, z: parent.position.z + posIJK.z };
      body.periodSeconds = (2 * Math.PI) / n;
    }
  }
}
