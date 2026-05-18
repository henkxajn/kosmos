// M4 P3 consolidated smoke test — Tick-based Deep-Space Combat + Weapon ranges.
// Pure-logic only (Node ESM, no DOM/canvas/Three).
//
// T1 — SaveMigration v70→v71                       (~5 cases)
// T2 — Weapon rangeAU + tech mult                  (~6 cases)
// T3 — TechSystem.getMultiplier                    (~4 cases)
// T4 — DSCS encounter init + auto-join             (~7 cases)
// T5 — Per-tick fire + engage target priority       (~7 cases)
// T6 — Battle conclude + per-vessel wreck           (~6 cases)
// T7 — Engage order (kiting)                       (~4 cases)
// T8 — Stationary AI                                (~2 cases)
// T9 — ProximitySystem dynamic detection            (~3 cases)
// T10 — Group combat sanity                         (~2 cases)
// T11 — DSCS serialize/restore                      (~3 cases)
//
// Target: ≥45 GREEN cases.

globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { timeSystem: { gameTime: 100.0 } };
globalThis.document = {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
  getElementById: () => null,
};

const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
GAME_CONFIG.FEATURES.proximitySystem = true;
GAME_CONFIG.FEATURES.vesselCombat = true;
GAME_CONFIG.FEATURES.m4DeepSpaceCombat = true;

const { SHIP_MODULES } = await import('./src/data/ShipModulesData.js');
const { TECHS } = await import('./src/data/TechData.js');
const { ORDER_TYPES, validateOrder } = await import('./src/data/MovementOrderTypes.js');
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');
const { DeepSpaceCombatSystem, MAX_ROUNDS } = await import('./src/systems/DeepSpaceCombatSystem.js');
const { ProximitySystem, PROXIMITY_DETECTION_AU } = await import('./src/systems/ProximitySystem.js');
const SaveMigrationModule = await import('./src/systems/SaveMigration.js');
const { CURRENT_VERSION, migrate } = SaveMigrationModule;
const { buildMenuOptions } = await import('./src/data/RightClickMenuOptions.js');
const { buildOrderSpec } = await import('./src/utils/OrderDispatcher.js');
const EventBusModule = await import('./src/core/EventBus.js');
const EventBus = EventBusModule.default ?? EventBusModule.EventBus;

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

let pass = 0, fail = 0;
function ok(name, cond, ctx = '') {
  if (cond) { console.log('  PASS  ' + name + (ctx ? ' [' + ctx + ']' : '')); pass++; }
  else { console.error('  FAIL  ' + name + (ctx ? ' [' + ctx + ']' : '')); fail++; }
}
function eq(name, actual, expected) {
  ok(name + ` (got ${JSON.stringify(actual)})`, actual === expected);
}

// ── Mock TechSystem ───────────────────────────────────────────────────
class FakeTechSystem {
  constructor(researched = []) { this._researched = new Set(researched); }
  getMultiplier(category) {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech?.effects) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'multiplier' && fx.category === category) m *= fx.value;
      }
    }
    return m;
  }
}

// ── Mock VesselManager ────────────────────────────────────────────────
function makeVessel(id, x, y, opts = {}) {
  return {
    id, name: opts.name ?? id,
    position: { x, y, state: opts.state ?? 'in_transit', dockedAt: null },
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    speedAU: opts.speedAU ?? 1.0,
    fuel: { current: 100, capacity: 100, consumption: 1.0 },
    mission: opts.mission ?? null, movementOrder: opts.movementOrder ?? null,
    isWreck: false, status: opts.status ?? 'in_flight',
    modules: opts.modules ?? ['weapon_laser'],
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
      return { totalDist: Math.hypot(tx - sx, ty - sy), waypoints: [] };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// T1 — SaveMigration v70→v71
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T1: SaveMigration v70→v71 ---');
eq('CURRENT_VERSION = 71', CURRENT_VERSION, 71);
{
  const v70Save = {
    version: 70,
    civ4x: {
      vesselManager: {
        vessels: [
          { id: 'v1', movementOrder: { type: 'pursue', targetEntityId: 'e1' } },
          { id: 'v2', movementOrder: null },
        ],
      },
    },
  };
  const migrated = migrate(v70Save);
  ok('migrate v70→v71 success', migrated && !migrated.error);
  eq('migrated.version = 71', migrated.version, 71);
  eq('deepSpaceEngagements default = {}',
     JSON.stringify(migrated.civ4x.deepSpaceEngagements), '{}');
  ok('v1.movementOrder.engageTargetId = null (lazy default)',
     migrated.civ4x.vesselManager.vessels[0].movementOrder.engageTargetId === null);
  ok('v2.movementOrder = null (nie touchowane)',
     migrated.civ4x.vesselManager.vessels[1].movementOrder === null);
}

// ──────────────────────────────────────────────────────────────────────
// T2 — Weapon rangeAU + tech multipliers
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T2: Weapon rangeAU + tech mult ---');
eq('weapon_laser.rangeAU',   SHIP_MODULES.weapon_laser.stats.rangeAU,   0.05);
eq('weapon_kinetic.rangeAU', SHIP_MODULES.weapon_kinetic.stats.rangeAU, 0.15);
eq('weapon_missile.rangeAU', SHIP_MODULES.weapon_missile.stats.rangeAU, 0.30);
eq('weapon_laser.category', SHIP_MODULES.weapon_laser.stats.category, 'short');
eq('weapon_laser.fireCooldownYears', SHIP_MODULES.weapon_laser.stats.fireCooldownYears, 0.3);
ok('orbital_strike_battery brak rangeAU',
   SHIP_MODULES.orbital_strike_battery.stats.rangeAU === undefined);

// ──────────────────────────────────────────────────────────────────────
// T3 — TechSystem.getMultiplier
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T3: TechSystem.getMultiplier ---');
{
  const ts0 = new FakeTechSystem([]);
  eq('bez tech weapon_range_short = 1.0', ts0.getMultiplier('weapon_range_short'), 1.0);
  const ts1 = new FakeTechSystem(['weapon_optics']);
  eq('weapon_optics → weapon_range_short ×1.25', ts1.getMultiplier('weapon_range_short'), 1.25);
  const ts2 = new FakeTechSystem(['weapon_optics', 'range_finder_array']);
  eq('weapon_optics + range_finder_array → weapon_range_short ×1.25',
     ts2.getMultiplier('weapon_range_short'), 1.25);
  eq('range_finder_array → weapon_range_all ×1.15',
     ts2.getMultiplier('weapon_range_all'), 1.15);
}

// ──────────────────────────────────────────────────────────────────────
// T4 — DSCS encounter init + auto-join
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T4: DSCS encounter init + auto-join ---');
{
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser', 'weapon_kinetic'] });
  const e1 = makeVessel('e1', 10, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_missile'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  globalThis.window.KOSMOS.deepSpaceCombatSystem = dscs;

  const enc = dscs.startEngagement('p1', 'e1');
  ok('startEngagement zwraca encounter', !!enc && enc.isActive);
  eq('_activeEncounters.size = 1', dscs._activeEncounters.size, 1);
  eq('sideA.ownerEmpireId = player', enc.sideA.ownerEmpireId, 'player');
  eq('sideB.ownerEmpireId = empire_alpha', enc.sideB.ownerEmpireId, 'empire_alpha');
  eq('p1.weapons.length = 2', enc.vesselStates.get('p1').weapons.length, 2);
  eq('e1.weapons.length = 1', enc.vesselStates.get('e1').weapons.length, 1);

  // Reinforcement — drugi player vessel poza team-up bufferze (500,500) joinuje
  const p2 = makeVessel('p2', 500, 500);
  vm._vessels.set('p2', p2);
  p2.position.x = 4; p2.position.y = 0;  // wbij w buffer
  dscs.handleCombatRangeEnter('p1', 'p2', false);
  eq('p2 joined sideA', enc.sideA.joinedVesselIds[0], 'p2');
  dscs.destroy();
}

// ──────────────────────────────────────────────────────────────────────
// T5 — Per-tick fire + engage target priority
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T5: Per-tick fire + engage priority ---');
{
  // Out-of-range — laser nie strzela do 0.20 AU
  const dist = 0.20 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  const hp0 = enc.vesselStates.get('e1').hp;
  dscs._tick(0.5);
  eq('laser nie wyrządził damage poza 0.05 AU', enc.vesselStates.get('e1').hp, hp0);
  dscs.destroy();
}
{
  // In-range fire + hit registered po N tickach (deterministyczne PRNG)
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  for (let i = 0; i < 5 && enc.isActive; i++) dscs._tick(0.5);
  const hits = enc.timeline.flatMap(r => r.events).filter(ev => ev.hit).length;
  ok('przynajmniej jeden hit w 5 tickach (in-range)', hits >= 1);
  dscs.destroy();
}
{
  // Engage target priority
  const closeDist = 0.03 * AU_TO_PX;
  const targetDist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', closeDist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const e2 = makeVessel('e2', targetDist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  p1.movementOrder = { type: 'engage', targetEntityId: 'e2' };
  const vm = makeMockVM([p1, e1, e2]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  dscs.handleCombatRangeEnter('p1', 'e2', false);
  let shotsE2 = 0, shotsE1 = 0;
  for (let i = 0; i < 8 && enc.isActive; i++) {
    dscs._tick(0.5);
    for (const r of enc.timeline) {
      for (const ev of r.events ?? []) {
        if (ev.attacker === 'p1' && ev.target === 'e2') shotsE2++;
        if (ev.attacker === 'p1' && ev.target === 'e1') shotsE1++;
      }
    }
    enc.timeline.length = 0;
  }
  ok('engage priority: p1 strzela więcej w e2 niż e1', shotsE2 >= shotsE1);
  ok('engage target dostał strzały', shotsE2 > 0);
  dscs.destroy();
}
{
  // Shield absorb → HP cascade
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser', 'weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['shield_basic'] });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  for (let i = 0; i < 10 && enc.isActive; i++) dscs._tick(0.5);
  const blockedTotal = enc.timeline.flatMap(r => r.events).filter(ev => ev.hit && ev.target === 'e1')
    .reduce((s, ev) => s + (ev.blockedByShield ?? 0), 0);
  ok('shield absorbował damage', blockedTotal > 0);
  dscs.destroy();
}

// ──────────────────────────────────────────────────────────────────────
// T6 — Battle conclude + per-vessel wreck
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T6: Battle conclude ---');
{
  // Kill condition
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  enc.vesselStates.get('e1').hp = 0;
  const battles = [];
  const sub = (ev) => battles.push(ev);
  EventBus.on('battle:resolved', sub);
  dscs._tick(0.1);
  eq('winner = A (sideB hp=0)', battles[0]?.result?.winner, 'A');
  ok('e1 wreck (per-vessel always)', e1.isWreck === true);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}
{
  // M4 P3 polish: Enemy auto-retreat via HP comparison (pctEnemy<=0.2 AND pctEnemy<pctPlayer*0.5)
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  // enemy 15% HP, player 80% HP → enemy retreat (pctB=0.15 ≤ 0.2 AND 0.15 < 0.40)
  enc.vesselStates.get('e1').hp = enc.vesselStates.get('e1').hpStart * 0.15;
  enc.vesselStates.get('p1').hp = enc.vesselStates.get('p1').hpStart * 0.80;
  const battles = [];
  const sub = (ev) => battles.push(ev);
  EventBus.on('battle:resolved', sub);
  dscs._tick(0.1);
  eq('retreated = B (enemy HP comparison)', battles[0]?.result?.retreated, 'B');
  eq('winner = A (gracz wygrał)', battles[0]?.result?.winner, 'A');
  ok('e1 NIE wreck (retreat)', e1.isWreck !== true);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}
{
  // M4 P3 polish: Enemy NIE retreat gdy obie strony nisko (pctB NIE < pctA*0.5)
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  enc.vesselStates.get('p1').hp = enc.vesselStates.get('p1').hpStart * 0.15;
  enc.vesselStates.get('e1').hp = enc.vesselStates.get('e1').hpStart * 0.15;
  const battles = [];
  const sub = (ev) => battles.push(ev);
  EventBus.on('battle:resolved', sub);
  dscs._tick(0.1);
  // pctA=0.15, pctB=0.15. 0.15 < 0.075 → false. No retreat (continues or kill).
  ok('No auto-retreat gdy obie strony równo', !battles[0] || battles[0]?.result?.retreated == null);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}
{
  // M4 P3 polish: Player NIE auto-retreat (manual only)
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  // player 10%, enemy 90% — stara logika by zrobiła retreat='A'. Nowa: nie (player manual only)
  enc.vesselStates.get('p1').hp = enc.vesselStates.get('p1').hpStart * 0.10;
  enc.vesselStates.get('e1').hp = enc.vesselStates.get('e1').hpStart * 0.90;
  const battles = [];
  const sub = (ev) => battles.push(ev);
  EventBus.on('battle:resolved', sub);
  dscs._tick(0.1);
  ok('Player NIE auto-retreat (manual only)', !battles[0] || battles[0]?.result?.retreated !== 'A');
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}
{
  // M4 P3 polish: combatRangeExit — player ucieka → retreated='A' (loss)
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  // Teleport p1 (sideA = player) daleko od midpoint
  p1.position.x = enc.location.point.x + 1.0 * AU_TO_PX;
  // e1 (sideB = enemy) zostaje w pobliżu midpoint
  const battles = [];
  const sub = (ev) => battles.push(ev);
  EventBus.on('battle:resolved', sub);
  EventBus.emit('vessel:combatRangeExit', { vesselAId: 'p1', vesselBId: 'e1' });
  eq('player exit → retreated = A', battles[0]?.result?.retreated, 'A');
  eq('player exit → winner = B', battles[0]?.result?.winner, 'B');
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}
{
  // M4 P3 polish: mutual disengagement → draw (oba daleko od midpoint)
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  // OBA daleko od midpoint
  p1.position.x = enc.location.point.x + 1.0 * AU_TO_PX;
  e1.position.x = enc.location.point.x - 1.0 * AU_TO_PX;
  const battles = [];
  const sub = (ev) => battles.push(ev);
  EventBus.on('battle:resolved', sub);
  EventBus.emit('vessel:combatRangeExit', { vesselAId: 'p1', vesselBId: 'e1' });
  eq('mutual exit → winner = null', battles[0]?.result?.winner, null);
  eq('mutual exit → retreated = null', battles[0]?.result?.retreated, null);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}

// ──────────────────────────────────────────────────────────────────────
// T7 — Engage order kiting
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T7: Engage order kiting ---');
{
  // Toward
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'], speedAU: 1.0 });
  const e1 = makeVessel('e1', 0.10 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  globalThis.window.KOSMOS.timeSystem.gameTime = 100.0;
  const mos = new MovementOrderSystem(vm);
  const r = mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });
  ok('issueOrder engage ok', r.ok === true);
  mos._tick(0.1);
  globalThis.window.KOSMOS.timeSystem.gameTime = 101.0;
  const x0 = p1.position.x;
  mos._tick(0.1);
  ok('p1 zbliżył się toward target', p1.position.x > x0);
  mos.destroy();
}
{
  // Away
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'], speedAU: 1.0 });
  const e1 = makeVessel('e1', 0.03 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  globalThis.window.KOSMOS.timeSystem.gameTime = 100.0;
  const mos = new MovementOrderSystem(vm);
  mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });
  mos._tick(0.1);
  globalThis.window.KOSMOS.timeSystem.gameTime = 101.0;
  const x0 = p1.position.x;
  mos._tick(0.1);
  ok('p1 cofnął się away from target', p1.position.x < x0);
  mos.destroy();
}
{
  // Cancel target_lost
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', 0.1 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const mos = new MovementOrderSystem(vm);
  mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });
  e1.isWreck = true;
  const events = [];
  EventBus.on('vessel:orderBlocked', e => events.push(e));
  mos._tick(0.1);
  eq('block reason = target_lost', events[0]?.reason, 'target_lost');
  EventBus.off('vessel:orderBlocked');
  mos.destroy();
}
{
  // No weapons reject
  const p1 = makeVessel('p1', 0, 0, { modules: ['cargo_small'] });
  const e1 = makeVessel('e1', 0.1 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const mos = new MovementOrderSystem(vm);
  const r = mos.issueOrder('p1', { type: 'engage', targetEntityId: 'e1' });
  eq('reject no_weapons', r.reason, 'no_weapons');
  mos.destroy();
}
{
  // M4 P3 polish — manual retreat order (issueOrder type:'retreat')
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', 0.04 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  dscs.startEngagement('p1', 'e1');
  globalThis.window.KOSMOS.deepSpaceCombatSystem = dscs;
  // Stub AutoRetreatSystem dla _findNearestFriendlyPlanet lookup
  globalThis.window.KOSMOS.autoRetreatSystem = {
    _findNearestFriendlyPlanet: () => ({ x: 100 * AU_TO_PX, y: 0, name: 'TestPlanet' }),
  };
  const mos = new MovementOrderSystem(vm);
  const retreatEvents = [];
  EventBus.on('vessel:retreatIssued', e => retreatEvents.push(e));
  const r = mos.issueOrder('p1', { type: 'retreat' });
  ok('issueOrder retreat ok', r.ok === true);
  eq('p1.movementOrder.type = moveToPoint', p1.movementOrder?.type, 'moveToPoint');
  ok('_retreatFromCombat marker = true', p1.movementOrder?._retreatFromCombat === true);
  eq('retreatIssued event emit', retreatEvents.length, 1);
  EventBus.off('vessel:retreatIssued');
  delete globalThis.window.KOSMOS.deepSpaceCombatSystem;
  delete globalThis.window.KOSMOS.autoRetreatSystem;
  mos.destroy();
  dscs.destroy();
}
{
  // M4 P3 polish — retreat reject gdy vessel NIE w combat
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const vm = makeMockVM([p1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  // brak DSCS → not_in_combat
  delete globalThis.window.KOSMOS.deepSpaceCombatSystem;
  const mos = new MovementOrderSystem(vm);
  const r = mos.issueOrder('p1', { type: 'retreat' });
  eq('reject not_in_combat', r.reason, 'not_in_combat');
  mos.destroy();
}

// ──────────────────────────────────────────────────────────────────────
// T8 — Stationary AI
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T8: Stationary AI ---');
{
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', 0.04 * AU_TO_PX, 0, {
    ownerEmpireId: 'empire_alpha', isEnemy: true,
    mission: { type: 'attack', targetId: 'p1' },
  });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  dscs.startEngagement('p1', 'e1');
  eq('enemy.mission = null po startEngagement', e1.mission, null);
  eq('enemy.position.state = orbiting', e1.position.state, 'orbiting');
  dscs.destroy();
}

// ──────────────────────────────────────────────────────────────────────
// T9 — ProximitySystem dynamic detection
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T9: ProximitySystem dynamic ---');
{
  const ts = new FakeTechSystem(['advanced_sensors_1']);
  globalThis.window.KOSMOS.techSystem = ts;
  const player = makeVessel('p1', 0, 0);
  const enemy  = makeVessel('e1', 0.6 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha' });
  const vm = makeMockVM([player, enemy]);
  const ps = new ProximitySystem(vm);
  ok('player z advanced_sensors_1 → detection 0.625',
     Math.abs(ps._getDetectionRangeAU(player) - 0.625) < 1e-6);
  ok('enemy bez tech → BASE 0.5',
     Math.abs(ps._getDetectionRangeAU(enemy) - 0.5) < 1e-6);
  const events = [];
  EventBus.on('vessel:proximityEnter', e => events.push(e));
  ps._tick(0.1);
  ok('enter emit (0.6 < max(0.625, 0.5))', events.length === 1);
  EventBus.off('vessel:proximityEnter');
  ps.destroy();
  globalThis.window.KOSMOS.techSystem = null;
}

// ──────────────────────────────────────────────────────────────────────
// T10 — Group combat sanity (2v2 → expected damage per tick)
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T10: Group combat sanity ---');
{
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const p2 = makeVessel('p2', 1, 1, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const e2 = makeVessel('e2', dist + 1, 1, { ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] });
  const vm = makeMockVM([p1, p2, e1, e2]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  const enc = dscs.startEngagement('p1', 'e1');
  ok('2v2 encounter ma wszystkich 4 w vesselStates', enc.vesselStates.size === 4);
  for (let i = 0; i < 6 && enc.isActive; i++) dscs._tick(0.5);
  // Bitwa powinna się zakończyć w rozsądnym czasie (kill OR retreat OR time-out)
  const battles = [];
  EventBus.on('battle:resolved', e => battles.push(e));
  for (let i = 0; i < 30 && enc.isActive; i++) dscs._tick(1.0);
  EventBus.off('battle:resolved');
  ok('2v2 bitwa zakończyła się w 36 tickach', !enc.isActive);
  dscs.destroy();
}

// ──────────────────────────────────────────────────────────────────────
// T11 — DSCS serialize/restore
// ──────────────────────────────────────────────────────────────────────
console.log('\n--- T11: DSCS serialize/restore ---');
{
  const dist = 0.04 * AU_TO_PX;
  const p1 = makeVessel('p1', 0, 0, { modules: ['weapon_laser'] });
  const e1 = makeVessel('e1', dist, 0, { ownerEmpireId: 'empire_alpha', isEnemy: true });
  const vm = makeMockVM([p1, e1]);
  globalThis.window.KOSMOS.vesselManager = vm;
  const dscs1 = new DeepSpaceCombatSystem(vm);
  const enc = dscs1.startEngagement('p1', 'e1');
  // tick kilka razy dla damage / timeline entries
  dscs1._tick(0.5); dscs1._tick(0.5);
  const serialized = dscs1.serialize();
  ok('serialize zwraca object', typeof serialized === 'object');
  ok('serialize zawiera encounter id', Object.keys(serialized).length === 1);
  const dscs2 = new DeepSpaceCombatSystem(vm);
  dscs2.restore(serialized);
  eq('restore odtwarza _activeEncounters.size', dscs2._activeEncounters.size, 1);
  const restored = [...dscs2._activeEncounters.values()][0];
  eq('vesselStates restored size', restored.vesselStates.size, 2);
  ok('p1 hp przywrócone', restored.vesselStates.get('p1').hp > 0);
  dscs1.destroy();
  dscs2.destroy();
}

console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail > 0 ? 1 : 0);
