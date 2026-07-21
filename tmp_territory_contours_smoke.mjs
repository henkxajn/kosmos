// tmp_territory_contours_smoke.mjs — smoke H4: zagnieżdżone warstwice + poolFillAlpha
//   node tmp_territory_contours_smoke.mjs
// Czysto liczbowy (zero canvasa). Mock territoryService + galaxyData (wzór b3).

globalThis.localStorage = { _d:{}, length:0, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];}, key(){return null;} };
function setKosmos(k) { globalThis.KOSMOS = k; globalThis.window = { KOSMOS: k }; }
setKosmos({});

const { TerritoryField } = await import('./src/systems/TerritoryField.js');
const { poolFillAlpha }  = await import('./src/ui/TerritoryRenderLogic.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.error('  FAIL:', name); } };

const loopArea = (loop) => { const p = loop.pts; let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a) / 2; };
const sumArea = (loops) => loops.reduce((s, l) => s + loopArea(l), 0);

function mockKosmos(ownedFn, positions, gameTime = 100) {
  const systems = Object.entries(positions).map(([id, p]) => ({ id, x: p.x, y: p.y, z: 0 }));
  const svc = {
    getSystemOwner:    (id)  => ownedFn().find(o => o.systemId === id)?.owner ?? null,
    getOwnedSystems:   (oid) => ownedFn().filter(o => o.owner === oid).map(o => ({ systemId: o.systemId, devScore: o.devScore, kind: o.kind ?? 'colony' })),
    getSystemDevScore: (id)  => ownedFn().find(o => o.systemId === id)?.devScore ?? 0,
    getEmpireColor:    (oid) => (oid === 'player' ? '#33ccff' : '#B03030'),
    reindex:           () => {},
  };
  setKosmos({ territoryService: svc, galaxyData: { systems }, timeSystem: { gameTime } });
  return svc;
}

// ── T1: silne terytorium ma contours z ≥1 zagnieżdżoną pętlą ──
{
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 20 }], { sA: { x: 0, y: 0 } });
  const tf = new TerritoryField();
  const t = tf.getTerritory('player');
  check('T1 contours to tablica', Array.isArray(t.contours));
  check('T1 istnieje poziom warstwicy z pętlą', t.contours.some(c => c.loops.length >= 1));
  check('T1 warstwica ma isoMul > 1 (próg wewnętrzny)', t.contours.every(c => c.isoMul > 1));
  tf.dispose();
}

// ── T2: wewnętrzna warstwica ciaśniejsza niż izolinia (mniejsze pole) ──
{
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 20 }], { sA: { x: 0, y: 0 } });
  const tf = new TerritoryField();
  const t = tf.getTerritory('player');
  const boundaryArea = sumArea(t.loops);
  const inner = t.contours.find(c => c.loops.length >= 1);
  const innerArea = sumArea(inner.loops);
  check('T2 pole warstwicy dodatnie', innerArea > 0);
  check('T2 warstwica ciaśniejsza niż izolinia (pole wewn < izolinia)', innerArea < boundaryArea);
  tf.dispose();
}

// ── T3: 2 bliskie kolonie → wyższe pole → więcej poziomów warstwic (topografia rdzenia) ──
{
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 20 }, { systemId: 'sB', owner: 'player', devScore: 20 }],
             { sA: { x: 0, y: 0 }, sB: { x: 2, y: 0 } });   // nakładanie → f > 1 w rdzeniu
  const tf = new TerritoryField();
  const t = tf.getTerritory('player');
  const levels = t.contours.filter(c => c.loops.length >= 1).length;
  check('T3 nakładające się kolonie → ≥1 poziom warstwic', levels >= 1);
  tf.dispose();
}

// ── T4: poolFillAlpha — 0 poza izolinią, rdzeń jaśniejszy niż front, monotoniczna, clamp ──
{
  const cfg = { POOL_LUMA_LO: 128, POOL_LUMA_HI: 240, POOL_CORE_MULT: 2.6 };
  const fullA = 18;   // ≈ FILL_ALPHA 0.07 × 255
  check('T4 m<128 → 0 (poza izolinią)', poolFillAlpha(127, fullA, cfg) === 0);
  check('T4 m=128 → fullA (front strefy)', poolFillAlpha(128, fullA, cfg) === fullA);
  const core = poolFillAlpha(255, fullA, cfg);
  check('T4 rdzeń jaśniejszy niż front', core > fullA);
  check('T4 rdzeń = fullA×coreMult', core === Math.min(255, Math.round(fullA * 2.6)));
  check('T4 monotoniczność (front ≤ środek ≤ rdzeń)',
    poolFillAlpha(160, fullA, cfg) <= poolFillAlpha(200, fullA, cfg) && poolFillAlpha(200, fullA, cfg) <= core);
  check('T4 clamp do 255', poolFillAlpha(255, 200, cfg) === 255);
  check('T4 defaults gdy brak cfg', poolFillAlpha(127, fullA) === 0 && poolFillAlpha(240, fullA) > fullA);
}

console.log(`\ntmp_territory_contours_smoke: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
