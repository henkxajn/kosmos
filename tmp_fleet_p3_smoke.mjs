// Player Fleet Groups — P3 (Doctrine effects) smoke test.
// Offline, pure-logic. Bez DOM/canvas.
//
// Pokrycie:
//   T1  applyDoctrine engage_in_range pass-through                          (2 cases)
//   T2  applyDoctrine kite + preferMaxRange dla engage                      (3 cases)
//   T3  applyDoctrine hold_position reject pursue/intercept/engage          (4 cases)
//   T4  applyDoctrine moveToPoint OK pod hold_position                      (2 cases)
//   T5  issueFleetOrder pod hold_position dump'uje wszystkich do rejected   (3 cases)
//   T6  fleet.retreatThreshold clamp + setter + event                       (5 cases)
//   T7  _tickCivYears accumulator + 0.5 civYear threshold                   (2 cases)
//   T8  retreat_at_50 trigger gdy aggregateHp < threshold + emit            (4 cases)
//   T9  retreat_at_50 idempotent przez _retreatTriggered flag               (2 cases)
//   T10 retreat_at_50 NIE triggeruje gdy doctrine inna                      (1 case)
//   T11 SaveMigration v73→v74 retreatThreshold default + CURRENT_VERSION=74 (3 cases)
//   T12 Fleet serialize/restore round-trip retreatThreshold                 (3 cases)

globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = {
  timeSystem: { gameTime: 100.0 },
  debug: {},
  colonyManager: { getColony: () => null },
};
globalThis.document = {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
  getElementById: () => null,
};

const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
GAME_CONFIG.FEATURES.playerFleets = true;
GAME_CONFIG.FEATURES.m4DeepSpaceCombat = true;

const EventBusModule = await import('./src/core/EventBus.js');
const EventBus = EventBusModule.default ?? EventBusModule.EventBus;
const { FleetSystem } = await import('./src/systems/FleetSystem.js');
const FleetMod = await import('./src/entities/Fleet.js');
const { setNextFleetId, serializeFleet, restoreFleet, clampRetreatThreshold } = FleetMod;
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');
const SaveMigrationModule = await import('./src/systems/SaveMigration.js');
const { CURRENT_VERSION, migrate } = SaveMigrationModule;

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

function makeVM() {
  const _vessels = new Map();
  return {
    _vessels,
    getVessel: (id) => _vessels.get(id) ?? null,
    getAllVessels: () => [..._vessels.values()],
    addMock: (v) => _vessels.set(v.id, v),
    _calcRoute: (sx, sy, tx, ty) => ({
      totalDist: Math.hypot(tx - sx, ty - sy),
      waypoints: [{ x: tx, y: ty }],
    }),
  };
}
function makeVessel(id, opts = {}) {
  return {
    id,
    name: opts.name ?? id.toUpperCase(),
    shipId: opts.shipId ?? 'frigate_hull',
    colonyId: opts.colonyId ?? 'p1',
    position: opts.position ?? { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' },
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    speedAU: opts.speedAU ?? 1.0,
    fuel: opts.fuel ?? { current: 999, max: 999, consumption: 0, fuelType: 'power_cells' },
    fleetId: null,
    isWreck: false,
    ownerEmpireId: opts.ownerEmpireId ?? 'player',
    isEnemy: opts.isEnemy ?? false,
    mission: null,
    movementOrder: null,
    status: 'idle',
    modules: opts.modules ?? [{ id: 'weapon_laser', rangeAU: 0.05, fireCooldownYears: 0.3, damage: 5, category: 'short' }],
    missionLog: [],
    endurance: { current: 100, max: 100, drainPerYear: 1, regenPerYear: 10, lastDepleted: null },
  };
}

// ── T1 — applyDoctrine engage_in_range pass-through ───────────────────────
header('T1: applyDoctrine engage_in_range pass-through');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Alfa', { doctrine: 'engage_in_range' });
  const spec1 = { type: 'engage', targetEntityId: 'e_1' };
  const r1 = fs.applyDoctrine(f, spec1);
  assert(r1 === spec1, 'engage_in_range: return same spec ref (no mutation)');
  const spec2 = { type: 'pursue', targetEntityId: 'e_1' };
  const r2 = fs.applyDoctrine(f, spec2);
  assert(r2 === spec2, 'engage_in_range: pursue też pass-through');
}

// ── T2 — applyDoctrine kite + preferMaxRange ──────────────────────────────
header('T2: applyDoctrine kite + preferMaxRange dla engage');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Bravo', { doctrine: 'kite' });
  const r1 = fs.applyDoctrine(f, { type: 'engage', targetEntityId: 'e_1' });
  assert(r1.preferMaxRange === true, 'kite + engage → preferMaxRange=true');
  assert(r1.type === 'engage', 'kite + engage zachowuje type');
  // Pursue pod kite — pass-through (kite tylko dla engage)
  const r2 = fs.applyDoctrine(f, { type: 'pursue', targetEntityId: 'e_1' });
  assert(r2.preferMaxRange !== true, 'kite + pursue: brak preferMaxRange (kite only for engage)');
}

// ── T3 — applyDoctrine hold_position reject ───────────────────────────────
header('T3: applyDoctrine hold_position reject pursue/intercept/engage');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Charlie', { doctrine: 'hold_position' });
  const r1 = fs.applyDoctrine(f, { type: 'pursue', targetEntityId: 'e_1' });
  assert(r1._rejected === true, 'hold_position + pursue → _rejected=true');
  assert(r1._reason === 'doctrine_hold_position', 'hold_position + pursue → reason match');
  const r2 = fs.applyDoctrine(f, { type: 'intercept', targetEntityId: 'e_1' });
  assert(r2._rejected === true, 'hold_position + intercept → _rejected=true');
  const r3 = fs.applyDoctrine(f, { type: 'engage', targetEntityId: 'e_1' });
  assert(r3._rejected === true, 'hold_position + engage → _rejected=true');
}

// ── T4 — applyDoctrine moveToPoint OK pod hold_position ──────────────────
header('T4: applyDoctrine hold_position dopuszcza moveToPoint');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Delta', { doctrine: 'hold_position' });
  const spec = { type: 'moveToPoint', targetPoint: { x: 100, y: 0 } };
  const r = fs.applyDoctrine(f, spec);
  assert(r._rejected !== true, 'hold_position + moveToPoint NIE rejected');
  assert(r === spec, 'hold_position + moveToPoint: pass-through');
}

// ── T5 — issueFleetOrder pod hold_position dump'uje wszystkich do rejected ─
header('T5: issueFleetOrder pod hold_position → wszyscy rejected');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;
  const v1 = makeVessel('v_1', { speedAU: 1.0 });
  const v2 = makeVessel('v_2', { speedAU: 1.0 });
  vm.addMock(v1); vm.addMock(v2);
  const f = fs.createFleet('Echo', { doctrine: 'hold_position' });
  fs.addMember(f.id, 'v_1');
  fs.addMember(f.id, 'v_2');

  const res = fs.issueFleetOrder(f.id, { type: 'pursue', targetEntityId: 'e_1' });
  assert(res.ok === false, 'hold_position pursue: ok=false');
  assert(res.reason === 'doctrine_hold_position', 'reason=doctrine_hold_position');
  assert(res.accepted.length === 0 && res.rejected.length === 2,
         `accepted=0 rejected=2 (got ${res.accepted.length}/${res.rejected.length})`);
}

// ── T6 — fleet.retreatThreshold clamp + setter + event ────────────────────
header('T6: retreatThreshold clamp + setter + event');
{
  EventBus.clear?.();
  setNextFleetId(1);
  assert(clampRetreatThreshold(0.5) === 0.5, 'clamp 0.5 → 0.5');
  assert(clampRetreatThreshold(0.01) === 0.05, 'clamp 0.01 → 0.05 (floor)');
  assert(clampRetreatThreshold(1.5) === 0.95, 'clamp 1.5 → 0.95 (ceil)');

  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Foxtrot');
  let evt = null;
  EventBus.on('fleet:retreatThresholdChanged', (e) => { evt = e; });
  fs.setRetreatThreshold(f.id, 0.3);
  assert(f.retreatThreshold === 0.3, `setter zmienia retreatThreshold (got ${f.retreatThreshold})`);
  assert(evt?.newThreshold === 0.3 && evt?.oldThreshold === 0.5,
         'emit fleet:retreatThresholdChanged z old/new');
}

// ── T7 — _tickCivYears accumulator + 0.5 civYear threshold ────────────────
header('T7: _tickCivYears accumulator + 0.5 civYear threshold');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  // Brak DSCS w window.KOSMOS — tick wcześnie wraca, acc dalej liczy.
  delete window.KOSMOS.deepSpaceCombatSystem;
  fs._tickCivYears(0.2);
  assert(fs._civYearAccumulator === 0.2, `acc=0.2 po pierwszym ticku (got ${fs._civYearAccumulator})`);
  fs._tickCivYears(0.4);
  // 0.2 + 0.4 = 0.6 ≥ 0.5 → reset acc=0
  assert(fs._civYearAccumulator === 0, `acc=0 po przekroczeniu 0.5 (got ${fs._civYearAccumulator})`);
}

// ── T8 — retreat_at_50 trigger gdy aggregateHp < threshold ────────────────
header('T8: retreat_at_50 trigger + fleet:retreatTriggered emit');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;

  const v1 = makeVessel('v_a', { speedAU: 1.0 });
  const v2 = makeVessel('v_b', { speedAU: 1.0 });
  vm.addMock(v1); vm.addMock(v2);

  // Stub DSCS — encounter zawiera v_a i v_b z hp/hpStart.
  const enc = {
    isActive: true,
    vesselStates: new Map([
      ['v_a', { hp: 10, hpStart: 100 }],
      ['v_b', { hp: 20, hpStart: 100 }],
    ]),
  };
  window.KOSMOS.deepSpaceCombatSystem = {
    _activeEncounters: new Map([['enc_1', enc]]),
  };
  // Stub autoRetreatSystem — zawsze zwraca testową planetę.
  window.KOSMOS.autoRetreatSystem = {
    _findNearestFriendlyPlanet: (_v) => ({
      colony: { planetId: 'p_home' },
      planet: { id: 'p_home', x: 50, y: 50 },
      distanceAU: 1.0,
    }),
  };

  const f = fs.createFleet('Gulf', { doctrine: 'retreat_at_50' });
  fs.addMember(f.id, 'v_a');
  fs.addMember(f.id, 'v_b');
  // Activ order musi istnieć — stub minimalny.
  f.activeOrder = { type: 'engage', memberOrderIds: { v_a: 'o_1', v_b: 'o_2' }, _retreatTriggered: false, _inCombat: false };

  let trig = null;
  EventBus.on('fleet:retreatTriggered', (e) => { trig = e; });

  // Aggregate: (10+20)/(100+100) = 0.15 → < 0.5 threshold default.
  fs._tickCivYears(0.6);  // przekrocz 0.5
  assert(trig !== null, 'fleet:retreatTriggered wyemitowany');
  assert(Math.abs(trig.aggregateHpPct - 0.15) < 0.01,
         `aggregateHpPct ≈ 0.15 (got ${trig?.aggregateHpPct?.toFixed(3)})`);
  assert(trig.memberCount === 2, 'memberCount=2');
  assert(f.activeOrder._retreatTriggered === true, '_retreatTriggered flag set');
}

// ── T9 — retreat_at_50 idempotent przez _retreatTriggered flag ────────────
header('T9: retreat_at_50 idempotent');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;

  const v1 = makeVessel('v_x', { speedAU: 1.0 });
  vm.addMock(v1);
  const enc = {
    isActive: true,
    vesselStates: new Map([['v_x', { hp: 5, hpStart: 100 }]]),
  };
  window.KOSMOS.deepSpaceCombatSystem = { _activeEncounters: new Map([['enc_1', enc]]) };
  window.KOSMOS.autoRetreatSystem = {
    _findNearestFriendlyPlanet: () => ({ colony: {}, planet: { id: 'p_h', x: 0, y: 0 }, distanceAU: 1.0 }),
  };

  const f = fs.createFleet('Hotel', { doctrine: 'retreat_at_50' });
  fs.addMember(f.id, 'v_x');
  f.activeOrder = { type: 'engage', memberOrderIds: { v_x: 'o_1' }, _retreatTriggered: false, _inCombat: false };

  let count = 0;
  EventBus.on('fleet:retreatTriggered', () => { count++; });
  fs._tickCivYears(0.6);
  fs._tickCivYears(0.6);  // drugi tick z _retreatTriggered=true → skip
  assert(count === 1, `emit tylko raz (got ${count})`);
  assert(f.activeOrder._retreatTriggered === true, 'flag dalej true po 2. ticku');
}

// ── T10 — retreat_at_50 NIE triggeruje gdy doctrine inna ──────────────────
header('T10: retreat NIE triggeruje gdy doctrine != retreat_at_50');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;

  const v = makeVessel('v_y');
  vm.addMock(v);
  window.KOSMOS.deepSpaceCombatSystem = {
    _activeEncounters: new Map([['e', {
      isActive: true,
      vesselStates: new Map([['v_y', { hp: 1, hpStart: 100 }]]),
    }]]),
  };
  window.KOSMOS.autoRetreatSystem = {
    _findNearestFriendlyPlanet: () => ({ colony: {}, planet: { id: 'p_h', x: 0, y: 0 } }),
  };

  const f = fs.createFleet('India', { doctrine: 'engage_in_range' });
  fs.addMember(f.id, 'v_y');
  f.activeOrder = { type: 'engage', memberOrderIds: { v_y: 'o' }, _retreatTriggered: false, _inCombat: false };

  let count = 0;
  EventBus.on('fleet:retreatTriggered', () => { count++; });
  fs._tickCivYears(0.6);
  assert(count === 0, 'engage_in_range NIE emit retreatTriggered');
}

// ── T11 — SaveMigration v73→v74 + CURRENT_VERSION=74 ─────────────────────
header('T11: SaveMigration v73→v74 + CURRENT_VERSION=74');
{
  assert(CURRENT_VERSION === 75, `CURRENT_VERSION = 75 (got ${CURRENT_VERSION})`);

  const oldSave = {
    version: 73,
    civ4x: {
      vesselManager: { vessels: [{ id: 'v1' }] },
      notificationCenter: { items: [], nextId: 1 },
      playerFleets: {
        fleets: [
          { id: 'fleet_1', name: 'X', doctrine: 'engage_in_range', memberIds: [] },
        ],
        nextId: 2,
      },
    },
  };
  const migrated = migrate(oldSave);
  assert(migrated.version === 75, `migrated.version === 75 (got ${migrated.version})`);
  const f0 = migrated.civ4x.playerFleets.fleets[0];
  assert(f0.retreatThreshold === 0.5,
         `migracja dodaje retreatThreshold=0.5 (got ${f0.retreatThreshold})`);
  assert(migrated.civ4x.vesselManager.vessels[0].combatDamage === null,
         'migracja v74→v75 dodaje combatDamage=null per vessel');
}

// ── T12 — Fleet serialize/restore round-trip retreatThreshold ─────────────
header('T12: Fleet serialize/restore round-trip retreatThreshold');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const v = makeVessel('v_t12');
  vm.addMock(v);
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Juliet', { doctrine: 'retreat_at_50' });
  fs.addMember(f.id, 'v_t12');  // unikaj auto-disband empty
  fs.setRetreatThreshold(f.id, 0.3);
  const data = fs.serialize();
  const json = JSON.parse(JSON.stringify(data));
  assert(json.fleets[0].retreatThreshold === 0.3, 'serialize zawiera retreatThreshold');

  const fs2 = new FleetSystem(vm);
  fs2.restore(json);
  const restored = fs2.getFleet('fleet_1');
  assert(restored !== null, 'restored fleet exists');
  assert(restored?.retreatThreshold === 0.3,
         `restored retreatThreshold=0.3 (got ${restored?.retreatThreshold})`);
}

// ── T13 — HP persist między bitwami (DSCS combatDamage) ──────────────────
header('T13: combatDamage persists HP across battles');
{
  const { DeepSpaceCombatSystem } = await import('./src/systems/DeepSpaceCombatSystem.js');
  // _buildVesselState czytamy z prototype — minimalna instancja bez tickow.
  const dscs = Object.create(DeepSpaceCombatSystem.prototype);
  dscs._vm = makeVM();
  dscs._fallbackRangeAU = () => 0.15;

  // Vessel bez damage — pełne HP (hull_frigate baseHP=120)
  const v1 = makeVessel('v_p1', { shipId: 'hull_frigate', modules: [] });
  const s1 = dscs._buildVesselState(v1);
  assert(s1.hp === 120 && s1.hpStart === 120,
         `bez damage: hp=hpStart=120 (got hp=${s1.hp}, hpStart=${s1.hpStart})`);

  // Vessel z damage hpMissing=80 → hp=40, hpStart=120 (start nadal full)
  const v2 = makeVessel('v_p2', { shipId: 'hull_frigate', modules: [] });
  v2.combatDamage = { hpMissing: 80, shieldMissing: 0, lastBattleYear: 100 };
  const s2 = dscs._buildVesselState(v2);
  assert(s2.hpStart === 120, `hpStart=120 niezmieniony (got ${s2.hpStart})`);
  assert(s2.hp === 40, `hp=40 (120-80, got ${s2.hp})`);

  // Vessel z damage > baseHP → clamp do 1 (vessel nadal walczy o życie)
  const v3 = makeVessel('v_p3', { shipId: 'hull_frigate', modules: [] });
  v3.combatDamage = { hpMissing: 999, shieldMissing: 0, lastBattleYear: 100 };
  const s3 = dscs._buildVesselState(v3);
  assert(s3.hp === 1, `hp clamped to 1 (got ${s3.hp})`);
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
