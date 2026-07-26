// FIX — "leć do punktu" wskazujący ciało przejmuje je jako cel (statek orbituje, nie zamarza).
//
// End-to-end przez REALNY MovementOrderSystem + VesselManager + EntityManager.
//   T1  moveToPoint w punkt NA planecie (bez targetBodyId) → mission.targetId = bodyId (snap)
//       → po przylocie statek PODĄŻA za ruchomą planetą (orbita)
//   T2  moveToPoint w pusty punkt daleko od ciał → mission.targetId = null → drift (bez zmian)
//   T3  jawny targetBodyId → uszanowany (snap nie nadpisuje)

globalThis.localStorage = { _s:{}, getItem(k){return this._s[k]??null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];}, key(i){return Object.keys(this._s)[i]??null;}, get length(){return Object.keys(this._s).length;} };
globalThis.window = globalThis;
globalThis.performance = globalThis.performance ?? { now: () => 0 };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { VesselManager } = await import('../../systems/VesselManager.js');
const { MovementOrderSystem } = await import('../../systems/MovementOrderSystem.js');
const { ORDER_TYPES } = await import('../../data/MovementOrderTypes.js');

const AU = GAME_CONFIG.AU_TO_PX;
let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

window.KOSMOS = { timeSystem: { gameTime: 100 } };

function setup() {
  EntityManager.clear();
  const body = { id: 'planet_b', type: 'planet', name: 'Beta', systemId: 'sys_foreign', x: 5 * AU, y: 0 };
  EntityManager.add(body);
  const vm = new VesselManager();
  const mos = new MovementOrderSystem(vm);
  return { vm, mos, body };
}
function makeVessel(vm) {
  const v = {
    id: 'v_1', name: 'Scout', shipId: 'hull_small', systemId: 'sys_foreign',
    speedAU: 4.0, colonyId: 'planet_home',
    fuel: { current: 9999, consumption: 0 },
    velocity: { vx: 0, vy: 0, updatedYear: 0 }, stats: { distanceTraveled: 0 }, missionLog: [],
    position: { state: 'orbiting', dockedAt: null, x: 0, y: 0 },  // wystartuje z przestrzeni (bez portu)
    mission: null,
  };
  vm._vessels.set('v_1', v);
  return v;
}

// ── T1 — punkt NA planecie (klik obok/na planecie, brak targetBodyId) ─────────
{
  console.log('\n--- T1 moveToPoint NA planecie (bez targetBodyId) → snap + orbita ---');
  const { vm, mos, body } = setup();
  const v = makeVessel(vm);
  window.KOSMOS.timeSystem.gameTime = 100;
  // Punkt ~0.2 AU od planety (w zasięgu SNAP_TO_BODY_AU=0.5).
  const r = mos.issueOrder('v_1', { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 5 * AU + 0.2 * AU, y: 0 } });
  assert(r.ok, 'rozkaz wydany');
  assert(v.mission?.targetId === 'planet_b', 'mission.targetId przejęte = planet_b (snap)');

  // Doleć (speedAU=4, ~5 AU → ~1.3 roku). Symuluj do arrivalYear.
  const arrival = v.mission.arrivalYear;
  window.KOSMOS.timeSystem.gameTime = arrival + 0.01;
  vm._updatePositions(0.5);
  assert(v.position.dockedAt === 'planet_b', 'po przylocie dockedAt = planet_b');

  // Planeta orbituje dalej.
  body.x = 5 * AU; body.y = 3 * AU;
  window.KOSMOS.timeSystem.gameTime = arrival + 0.5;
  vm._updatePositions(0.5);
  const dist = Math.hypot(v.position.x - body.x, v.position.y - body.y) / AU;
  assert(dist < 0.5, `statek PODĄŻA za planetą (odległość ${dist.toFixed(2)} AU)`);
}

// ── T2 — pusty punkt daleko od ciał → drift ───────────────────────────────────
{
  console.log('\n--- T2 moveToPoint pusty punkt (daleko) → brak snap, drift ---');
  const { vm, mos } = setup();
  const v = makeVessel(vm);
  window.KOSMOS.timeSystem.gameTime = 100;
  // Punkt 12 AU od planety — poza zasięgiem snap.
  const r = mos.issueOrder('v_1', { type: ORDER_TYPES.moveToPoint, targetPoint: { x: -8 * AU, y: 8 * AU } });
  assert(r.ok, 'rozkaz wydany');
  assert(v.mission?.targetId == null, 'mission.targetId = null (brak ciała w pobliżu → drift)');
}

// ── T3 — jawny targetBodyId uszanowany (snap nie nadpisuje) ───────────────────
{
  console.log('\n--- T3 jawny targetBodyId → uszanowany ---');
  const { vm, mos } = setup();
  const v = makeVessel(vm);
  window.KOSMOS.timeSystem.gameTime = 100;
  const r = mos.issueOrder('v_1', {
    type: ORDER_TYPES.moveToPoint, targetBodyId: 'planet_b',
    targetPoint: { x: 5 * AU, y: 0 },
  });
  assert(r.ok, 'rozkaz wydany');
  assert(v.mission?.targetId === 'planet_b', 'mission.targetId = planet_b (jawny)');
}

console.log(`\n=== moveTo body-snap smoke: ${pass} PASS / ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
