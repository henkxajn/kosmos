// ARC COLONY SPHERE CS-4a — pomiar kosztu SurfaceField (wspólny dla node i headless Chrome; plan §3.4).
// Importowany przez probe-cs4a-surface.mjs (node) i przez stronę Chrome (`/src/testing/headless/cs4a-measure.mjs`).
// Zimny bake = nowe ziarno w każdym przebiegu (prepare: permutacje + kalibracja morza wliczone), mediana z `runs`.

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

export function measureSurface(SF, rows, { runs = 3, hero = true } = {}) {
  const now = () => performance.now();
  const out = [];
  let seedBase = 0x51f0a;
  for (const arch of rows) {
    if (arch.family === 'gas') continue;
    const params = { waterCoverage: 0.7, palette: arch.family === 'planetoid' ? 'metallic' : null };
    const lod = arch.family === 'planetoid' ? SF.LOD_SIZES.planetoid : SF.LOD_SIZES.body;
    const lodMs = [], heroMs = [], prepMs = [];
    for (let r = 0; r < runs; r++) {
      let t = now(); SF.prepareSurface(++seedBase, arch, params); prepMs.push(now() - t);
      t = now(); SF.bakeEquirect(++seedBase, arch, params, lod[0], lod[1]); lodMs.push(now() - t);
      if (hero) { t = now(); SF.bakeEquirect(++seedBase, arch, params, 1024, 512); heroMs.push(now() - t); }
    }
    // evalAt na ciepłym kontekście (ścieżka kafli CS-5): 1000 punktów Fibonacciego, mediana z `runs`.
    const pts = SF.fibonacciSphere(1000);
    const seed = ++seedBase;
    SF.prepareSurface(seed, arch, params);
    const evalMs = [];
    for (let r = 0; r < runs; r++) {
      const t = now();
      for (let i = 0; i < 1000; i++) SF.evalAt(seed, arch, params, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      evalMs.push(now() - t);
    }
    out.push({
      id: arch.id, family: arch.family, lod: `${lod[0]}x${lod[1]}`,
      prepareMs: +median(prepMs).toFixed(2), lodMs: +median(lodMs).toFixed(1),
      heroMs: hero ? +median(heroMs).toFixed(0) : null, evalPer1000Ms: +median(evalMs).toFixed(2),
    });
  }
  return out;
}
