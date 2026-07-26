// GROUND TRUTH — moveToPoint arrival na RUCHOME ciało: czy statek śledzi (orbituje) ciało,
// czy zamarza w heliocentrycznym punkcie gdy ciało odlatuje dalej.
//
// Cel: ustalić, czy o zachowaniu decyduje mission.targetId (bodyId) na przylocie.
//   A) targetId = bodyId  → oczekiwane: statek podąża za ciałem (dockedAt=bodyId, follow)
//   B) targetId = null    → oczekiwane (BUG): statek zamarza (dockedAt=null, brak follow)

globalThis.localStorage = { _s:{}, getItem(k){return this._s[k]??null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];}, key(i){return Object.keys(this._s)[i]??null;}, get length(){return Object.keys(this._s).length;} };
globalThis.window = globalThis;
globalThis.performance = globalThis.performance ?? { now: () => 0 };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { VesselManager } = await import('../../systems/VesselManager.js');

const AU = GAME_CONFIG.AU_TO_PX;
let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

window.KOSMOS = { timeSystem: { gameTime: 100 } };

function run(label, targetId) {
  console.log(`\n--- ${label} (targetId=${targetId}) ---`);
  EntityManager.clear();
  // Ruchome ciało (planeta) — start w (5 AU, 0).
  const body = { id: 'planet_b', type: 'planet', name: 'Beta', systemId: 'sys_foreign', x: 5 * AU, y: 0 };
  EntityManager.add(body);

  const vm = new VesselManager();
  const vessel = {
    id: 'v_1', name: 'Scout', shipId: 'hull_small', systemId: 'sys_foreign',
    speedAU: 4.0, colonyId: 'planet_home',
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    stats: { distanceTraveled: 0 },
    missionLog: [],
    position: { state: 'in_transit', dockedAt: null, x: 0, y: 0 },
    mission: {
      type: 'move_to_point', targetId,
      startX: 0, startY: 0, targetX: 5 * AU, targetY: 0, waypoints: [],
      departYear: 100, arrivalYear: 101,
    },
  };
  vm._vessels.set('v_1', vessel);

  // Tick 1 — w połowie drogi (gameYear 100.5).
  window.KOSMOS.timeSystem.gameTime = 100.5;
  vm._updatePositions(0.5);
  // Tick 2 — przylot (gameYear 101).
  window.KOSMOS.timeSystem.gameTime = 101;
  vm._updatePositions(0.5);

  assert(vessel.position.state === 'orbiting', 'po przylocie state=orbiting');
  const dockedAfterArrival = vessel.position.dockedAt;
  console.log(`     dockedAt po przylocie = ${dockedAfterArrival}`);

  // Planeta orbituje dalej — przesuwamy ją znacząco.
  body.x = 5 * AU;
  body.y = 3 * AU;

  // Tick 3 — czy statek podąża za ciałem?
  window.KOSMOS.timeSystem.gameTime = 101.5;
  vm._updatePositions(0.5);

  const dxToBody = Math.hypot(vessel.position.x - body.x, vessel.position.y - body.y) / AU;
  console.log(`     pozycja statku=(${(vessel.position.x/AU).toFixed(2)}, ${(vessel.position.y/AU).toFixed(2)}) AU; ciało=(5.00, 3.00) AU; odległość=${dxToBody.toFixed(2)} AU`);
  return { follows: dxToBody < 0.5, dockedAfterArrival };
}

const A = run('A: targetId=bodyId', 'planet_b');
assert(A.dockedAfterArrival === 'planet_b', 'A: dockedAt = bodyId');
assert(A.follows === true, 'A: statek PODĄŻA za ciałem (orbituje)');

const B = run('B: targetId=null', null);
assert(B.dockedAfterArrival == null, 'B: dockedAt = null (brak zaczepu)');
assert(B.follows === false, 'B: statek ZAMARZA (reprodukcja buga)');

console.log(`\n=== ground truth: ${pass} PASS / ${fail} FAIL ===`);
console.log(`\nWNIOSEK: o (nie)orbitowaniu decyduje mission.targetId (bodyId) na przylocie.`);
if (fail > 0) process.exit(1);
