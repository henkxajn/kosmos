// Smoke P3-5: engage order + PPM menu integration.

globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { timeSystem: { gameTime: 100.0 } };
globalThis.document = { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) };

const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
const { ORDER_TYPES, validateOrder } = await import('./src/data/MovementOrderTypes.js');
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');
const { buildMenuOptions, MENU_OPTIONS_BY_TARGET } = await import('./src/data/RightClickMenuOptions.js');
const { buildOrderSpec } = await import('./src/utils/OrderDispatcher.js');
const EventBusModule = await import('./src/core/EventBus.js');
const EventBus = EventBusModule.default ?? EventBusModule.EventBus;

let pass = 0, fail = 0;
function ok(name, cond, ctx = '') {
  if (cond) { console.log('  PASS  ' + name + (ctx ? ' [' + ctx + ']' : '')); pass++; }
  else { console.error('  FAIL  ' + name + (ctx ? ' [' + ctx + ']' : '')); fail++; }
}
function eq(name, actual, expected) {
  ok(name + ' (got ' + JSON.stringify(actual) + ')', actual === expected);
}

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

function makeVessel(id, x, y, opts = {}) {
  return {
    id, name: opts.name ?? id,
    position: { x, y, state: 'orbiting', dockedAt: null },
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    speedAU: opts.speedAU ?? 1.0,
    fuel: { current: 100, capacity: 100, consumption: 1.0 },
    mission: null, movementOrder: null,
    isWreck: false, status: 'idle',
    modules: opts.modules ?? ['weapon_laser', 'weapon_kinetic'],
    shipId: opts.shipId ?? 'hull_frigate',
    hullId: opts.hullId ?? 'hull_frigate',
    ownerEmpireId: opts.ownerEmpireId ?? null,
    isEnemy: opts.isEnemy ?? false,
    missionLog: [],
  };
}

function makeMockVM(vessels) {
  const map = new Map(vessels.map(v => [v.id, v]));
  return {
    _vessels: map,
    getVessel(id) { return map.get(id); },
    getAllVessels() { return [...map.values()]; },
    _calcRoute(sx, sy, tx, ty) {
      const totalDist = Math.hypot(tx - sx, ty - sy);
      return { totalDist, waypoints: [] };
    },
  };
}

// ── T1: ORDER_TYPES.engage istnieje + validateOrder ────────────────────
console.log('\n--- T1: ORDER_TYPES.engage + validateOrder ---');
eq('ORDER_TYPES.engage = "engage"', ORDER_TYPES.engage, 'engage');
{
  const v = validateOrder({ type: 'engage', targetEntityId: 'v1' });
  ok('validateOrder engage z targetEntityId → valid', v.valid === true);
}
{
  const v = validateOrder({ type: 'engage' });
  ok('validateOrder engage bez targetEntityId → invalid', v.valid === false);
  eq('reason = missing_target_entity', v.reason, 'missing_target_entity');
}

// ── T2: issueOrder engage — success ────────────────────────────────────
console.log('\n--- T2: issueOrder engage success ---');
{
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', 0.5 * AU_TO_PX, 0, { modules: ['weapon_laser'], ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const mos = new MovementOrderSystem(vm);
  const r = mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });
  ok('issueOrder ok=true', r.ok === true, JSON.stringify(r));
  ok('p1.movementOrder.type = engage', p1.movementOrder?.type === 'engage');
  ok('p1.movementOrder.targetEntityId = e1', p1.movementOrder?.targetEntityId === 'e1');
  ok('p1.movementOrder.engageTargetId = e1', p1.movementOrder?.engageTargetId === 'e1');
  ok('p1.movementOrder.engageMaxRangeAU > 0', p1.movementOrder?.engageMaxRangeAU > 0);
  eq('p1.position.state = orbiting', p1.position.state, 'orbiting');
  eq('p1.position.dockedAt = null', p1.position.dockedAt, null);
  // M4 P3 hotfix #2: synthetic mission dla UI ("Engage: targetName")
  ok('p1.mission ma type=engage', p1.mission?.type === 'engage');
  ok('p1.mission.targetId = e1', p1.mission?.targetId === 'e1');
  ok('p1.mission.managedByOrder = true', p1.mission?.managedByOrder === true);
  mos.destroy();
}

// ── T3: issueOrder engage — reject cases ──────────────────────────────
console.log('\n--- T3: issueOrder engage reject ---');
{
  // No target
  const p1 = makeVessel('p1', 0, 0);
  const vm = makeMockVM([p1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const mos = new MovementOrderSystem(vm);
  let r = mos.issueOrder('p1', { type: 'engage' });
  ok('engage bez targetEntityId → reject', r.ok === false);

  // Target self
  r = mos.issueOrder('p1', { type: 'engage', targetEntityId: 'p1' });
  ok('engage self → reject', r.ok === false);
  eq('reason = target_self', r.reason, 'target_self');

  // Target wreck
  const e1 = makeVessel('e1', 100, 0, { modules: ['weapon_laser'] });
  e1.isWreck = true;
  vm._vessels.set('e1', e1);
  r = mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });
  ok('engage target wreck → reject', r.ok === false);
  eq('reason = target_is_wreck', r.reason, 'target_is_wreck');

  // No weapons
  const p2 = makeVessel('p2', 0, 0, { modules: ['cargo_small'] });  // brak weapon
  vm._vessels.set('p2', p2);
  const e2 = makeVessel('e2', 100, 0);
  vm._vessels.set('e2', e2);
  r = mos.issueOrder('p2', { type: 'engage', targetEntityId: 'e2' });
  ok('engage bez broni → reject', r.ok === false);
  eq('reason = no_weapons', r.reason, 'no_weapons');

  mos.destroy();
}

// ── T4: _tickEngageOrder — toward (currentDist > optimal × 1.05) ──────
console.log('\n--- T4: kiting toward target (dist > optimal × 1.05) ---');
{
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'], speedAU: 1.0 });
  // weapon_laser rangeAU=0.05, optimal = 0.05 × 0.95 = 0.0475 AU
  // Ustaw enemy w 0.10 AU — dist > 0.0475 × 1.05 = 0.0499 → toward
  const e1 = makeVessel('e1', 0.10 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  globalThis.window.KOSMOS.timeSystem.gameTime = 100.0;
  const mos = new MovementOrderSystem(vm);
  mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });

  // First tick — initializes _lastTickYear, no movement (dPhysicsYear=0).
  mos._tick(0.1);
  // Second tick — gameYear advance triggers movement.
  globalThis.window.KOSMOS.timeSystem.gameTime = 101.0;
  const p1XBefore = p1.position.x;
  mos._tick(0.1);
  ok('p1 zbliżył się do e1 (x rośnie toward e1.x)', p1.position.x > p1XBefore,
     `before=${p1XBefore.toFixed(3)} after=${p1.position.x.toFixed(3)}`);
  mos.destroy();
}

// ── T5: _tickEngageOrder — away (currentDist < optimal × 0.95) ────────
console.log('\n--- T5: kiting away from target (dist < optimal × 0.95) ---');
{
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'], speedAU: 1.0 });
  // dist 0.03 AU; optimal × 0.95 = 0.0475 × 0.95 = 0.0451 → away
  const e1 = makeVessel('e1', 0.03 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  globalThis.window.KOSMOS.timeSystem.gameTime = 100.0;
  const mos = new MovementOrderSystem(vm);
  mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });

  mos._tick(0.1);  // init _lastTickYear
  globalThis.window.KOSMOS.timeSystem.gameTime = 101.0;
  const p1XBefore = p1.position.x;
  mos._tick(0.1);
  ok('p1 cofnął się od e1 (x maleje away from e1)', p1.position.x < p1XBefore,
     `before=${p1XBefore.toFixed(3)} after=${p1.position.x.toFixed(3)}`);
  mos.destroy();
}

// ── T6: _tickEngageOrder — hold (sweet spot) ──────────────────────────
console.log('\n--- T6: hold sweet spot (dist w bandzie) ---');
{
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'], speedAU: 1.0 });
  // optimal = 0.0475 AU; sweet spot 0.0451..0.0499. Ustaw enemy w 0.047 AU.
  const e1 = makeVessel('e1', 0.047 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const mos = new MovementOrderSystem(vm);
  mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });

  globalThis.window.KOSMOS.timeSystem.gameTime = 101.0;
  const p1XBefore = p1.position.x;
  mos._tick(0.1);
  ok('p1 nie ruszył się (hold sweet spot)', p1.position.x === p1XBefore);
  mos.destroy();
}

// ── T7: _tickEngageOrder — cancel target_lost ─────────────────────────
console.log('\n--- T7: cancel target_lost (target wreck) ---');
{
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', 0.1 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const mos = new MovementOrderSystem(vm);
  mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });

  // target staje się wreck
  e1.isWreck = true;
  const blockEvents = [];
  const sub = (e) => blockEvents.push(e);
  EventBus.on('vessel:orderBlocked', sub);
  mos._tick(0.1);
  ok('vessel:orderBlocked emitted', blockEvents.length === 1);
  eq('reason = target_lost', blockEvents[0].reason, 'target_lost');
  ok('p1.movementOrder.status = blocked', p1.movementOrder?.status === 'blocked');
  EventBus.off('vessel:orderBlocked', sub);
  mos.destroy();
}

// ── T8: hotfix — engage chase (target daleko NIE cancel, vessel ścigá) ─
console.log('\n--- T8: hotfix chase + kite (daleki target → vessel ścigá) ---');
{
  // M4 P3 hotfix: poprzednio engage cancel target_out_of_range gdy dist > 2 × maxRange.
  // Realny scenariusz: enemy nadlatuje z 1 AU → laser maxRange 0.05 AU → 2×0.05=0.10
  // → cancel immediate → vessel stoi przy planecie → planet defense walczy.
  // Fix: engage chase'uje target dopóki nie wpadnie w band; cancel TYLKO target wreck.
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'], speedAU: 1.0 });  // maxRange 0.05 AU
  // Enemy DALEKO — 1 AU od player vessela
  const e1 = makeVessel('e1', 1.0 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  globalThis.window.KOSMOS.timeSystem.gameTime = 100.0;
  const mos = new MovementOrderSystem(vm);
  mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });

  const blockEvents = [];
  const sub = (e) => blockEvents.push(e);
  EventBus.on('vessel:orderBlocked', sub);
  mos._tick(0.1);  // init _lastTickYear
  globalThis.window.KOSMOS.timeSystem.gameTime = 101.0;
  const xBefore = p1.position.x;
  mos._tick(0.1);
  ok('NO cancel mimo dist >> maxRange (chase mode)', blockEvents.length === 0,
     `blocks: ${blockEvents.map(e => e.reason).join(',')}`);
  ok('vessel ścigá target (x rośnie toward 1 AU)', p1.position.x > xBefore);
  EventBus.off('vessel:orderBlocked', sub);
  mos.destroy();
}

// ── T9: PPM menu — enemy vessel ma opcję engage ────────────────────────
console.log('\n--- T9: PPM enemy vessel ma engage ---');
{
  const target = { type: 'enemyVessel', entityId: 'e1' };
  const opts = buildMenuOptions(target, 'p1');
  const engage = opts.find(o => o.id === 'engage');
  ok('engage opcja istnieje w PPM enemy vessel', !!engage);
  eq('engage.orderType = engage', engage.orderType, 'engage');
  eq('engage.icon = ⊗', engage.icon, '⊗');
  eq('engage.labelPL = Zaangażuj', engage.labelPL, 'Zaangażuj');
  eq('engage.enabled = true (z selection)', engage.enabled, true);
}

// ── T10: PPM warning gdy vessel bez broni ──────────────────────────────
console.log('\n--- T10: PPM engage warning no_weapons ---');
{
  const p1 = makeVessel('p1', 0, 0, { modules: ['cargo_small'] });  // bez broni
  globalThis.window.KOSMOS.vesselManager = makeMockVM([p1]);
  const target = { type: 'enemyVessel', entityId: 'e1' };
  const opts = buildMenuOptions(target, 'p1');
  const engage = opts.find(o => o.id === 'engage');
  eq('engage.warning = no_weapons', engage.warning, 'no_weapons');
}

// ── T11: buildOrderSpec engage → spec.type='engage' + targetEntityId ───
console.log('\n--- T11: buildOrderSpec engage ---');
{
  const target = { type: 'enemyVessel', entityId: 'e_x' };
  const option = { orderType: 'engage' };
  const r = buildOrderSpec(option, target, 'p1');
  ok('buildOrderSpec engage ok', r.ok === true);
  eq('spec.type = engage', r.spec.type, 'engage');
  eq('spec.targetEntityId = e_x', r.spec.targetEntityId, 'e_x');
}

console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail > 0 ? 1 : 0);
