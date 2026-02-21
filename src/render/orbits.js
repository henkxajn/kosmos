export function buildOrbitPoints(orbit, samples = 240) {
  const a = orbit.semiMajorAxis;
  const e = orbit.eccentricity;
  const i = orbit.inclination;
  const O = orbit.lonAscendingNode;
  const w = orbit.argPeriapsis;

  const cosO = Math.cos(O), sinO = Math.sin(O);
  const cosi = Math.cos(i), sini = Math.sin(i);
  const cosw = Math.cos(w), sinw = Math.sin(w);

  function rotatePQWtoIJK(xp, yp) {
    const x =
      (cosO * cosw - sinO * sinw * cosi) * xp +
      (-cosO * sinw - sinO * cosw * cosi) * yp;

    const y =
      (sinO * cosw + cosO * sinw * cosi) * xp +
      (-sinO * sinw + cosO * cosw * cosi) * yp;

    const z =
      (sinw * sini) * xp +
      (cosw * sini) * yp;

    return { x, y, z };
  }

  const pts = [];
  for (let s = 0; s <= samples; s++) {
    const nu = (s / samples) * Math.PI * 2;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
    const xp = r * Math.cos(nu);
    const yp = r * Math.sin(nu);
    pts.push(rotatePQWtoIJK(xp, yp));
  }
  return pts;
}
