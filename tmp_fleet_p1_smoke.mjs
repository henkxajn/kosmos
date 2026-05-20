// Player Fleet Groups — P1 (Foundation) smoke test.
// Offline, pure-logic. Bez DOM/canvas.
//
// Pokrycie:
//   T1  FleetDoctrines enum + walidacja                                       (3 cases)
//   T2  Fleet entity factory + serialize/restore                               (4 cases)
//   T3  FleetSystem CRUD: create/disband/setName/setDoctrine                   (5 cases)
//   T4  addMember/removeMember + mutuje obu stron + idempotent + transfer      (6 cases)
//   T5  vessel:wrecked → auto-remove + autoDisband empty                        (3 cases)
//   T6  SaveMigration v72→v73                                                  (3 cases)
//   T7  FleetSystem.serialize → restore round-trip (z orphan filtering)         (4 cases)
//
// Target: ≥25 GREEN cases.

globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { timeSystem: { gameTime: 100.0 }, debug: {} };
globalThis.document = {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
  getElementById: () => null,
};

const { FLEET_DOCTRINES, DEFAULT_DOCTRINE, ALL_DOCTRINES, isValidDoctrine } = await import('./src/data/FleetDoctrines.js');
const FleetMod = await import('./src/entities/Fleet.js');
const { createFleet, serializeFleet, restoreFleet, setNextFleetId, getNextFleetId } = FleetMod;
const { FleetSystem } = await import('./src/systems/FleetSystem.js');
const EventBusModule = await import('./src/core/EventBus.js');
const EventBus = EventBusModule.default ?? EventBusModule.EventBus;
const SaveMigrationModule = await import('./src/systems/SaveMigration.js');
const { CURRENT_VERSION, migrate } = SaveMigrationModule;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// Minimalny VesselManager mock — tylko _vessels Map + getVessel + getAllVessels.
function makeVM() {
  const _vessels = new Map();
  return {
    _vessels,
    getVessel: (id) => _vessels.get(id) ?? null,
    getAllVessels: () => [..._vessels.values()],
    addMock: (v) => _vessels.set(v.id, v),
  };
}
function makeVessel(id, opts = {}) {
  return {
    id,
    name: opts.name ?? id.toUpperCase(),
    fleetId: opts.fleetId ?? null,
    isWreck: opts.isWreck ?? false,
    ownerEmpireId: opts.ownerEmpireId ?? null,
    position: opts.position ?? { x: 0, y: 0, state: 'docked', dockedAt: 'p1' },
    isEnemy: opts.isEnemy ?? false,
  };
}

// ── T1 — FleetDoctrines ──────────────────────────────────────────────────────
header('T1: FleetDoctrines enum + walidacja');
{
  assert(ALL_DOCTRINES.length === 4, 'ALL_DOCTRINES ma 4 wartości');
  assert(DEFAULT_DOCTRINE === FLEET_DOCTRINES.ENGAGE_IN_RANGE, 'DEFAULT_DOCTRINE = engage_in_range');
  assert(isValidDoctrine('kite') && !isValidDoctrine('foo'), 'isValidDoctrine prawidłowo waliduje');
}

// ── T2 — Fleet entity factory ─────────────────────────────────────────────────
header('T2: Fleet entity factory + serialize/restore');
{
  setNextFleetId(1);
  const f1 = createFleet({ name: 'Alpha' });
  assert(f1.id.startsWith('fleet_') && f1.name === 'Alpha' && f1.doctrine === DEFAULT_DOCTRINE,
         'createFleet z defaultami');
  const f2 = createFleet({ name: 'Beta', doctrine: 'kite' });
  assert(f2.doctrine === 'kite' && f2.memberIds.length === 0 && f2.autoDisbandWhenEmpty === true,
         'createFleet z doctrine="kite" + auto-disband=true');
  const ser = serializeFleet(f1);
  assert(ser.id === f1.id && Array.isArray(ser.memberIds) && ser.autoDisbandWhenEmpty === true,
         'serializeFleet zwraca poprawny obiekt');
  const rest = restoreFleet(ser);
  assert(rest.id === f1.id && rest.name === f1.name && rest.doctrine === f1.doctrine,
         'restoreFleet odtwarza pola');
}

// ── T3 — FleetSystem CRUD ─────────────────────────────────────────────────────
header('T3: FleetSystem CRUD');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Strike Alpha');
  assert(fs.listFleets().length === 1, 'createFleet → listFleets ma 1 element');
  assert(fs.getFleet(f.id) === f, 'getFleet zwraca tę samą instancję');
  assert(fs.setName(f.id, 'Renamed') && f.name === 'Renamed', 'setName mutuje + zwraca true');
  assert(fs.setDoctrine(f.id, 'kite') && f.doctrine === 'kite', 'setDoctrine OK dla valid');
  assert(!fs.setDoctrine(f.id, 'bogus'), 'setDoctrine reject dla invalid doctrine');
}

// ── T4 — addMember / removeMember ─────────────────────────────────────────────
header('T4: addMember/removeMember + mutuje obu stron + idempotent + transfer');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const fA = fs.createFleet('A');
  const fB = fs.createFleet('B');
  const v1 = makeVessel('v_1');
  const v2 = makeVessel('v_2');
  vm.addMock(v1); vm.addMock(v2);

  const r1 = fs.addMember(fA.id, v1.id);
  assert(r1.ok && v1.fleetId === fA.id && fA.memberIds.includes(v1.id),
         'addMember mutuje OBA strony (vessel.fleetId + fleet.memberIds)');

  const r2 = fs.addMember(fA.id, v1.id);
  assert(r2.ok && fA.memberIds.length === 1, 'addMember idempotent dla duplikatu');

  const r3 = fs.addMember(fB.id, v1.id);
  assert(r3.ok && v1.fleetId === fB.id && !fA.memberIds.includes(v1.id) && fB.memberIds.includes(v1.id),
         'addMember transferuje z innej floty (auto-remove)');

  // Świeża flota — fA mogła stać się empty po transferze v1 → fB (auto-disband).
  const fC = fs.createFleet('C');
  const r4 = fs.addMember(fC.id, 'nonexistent');
  assert(!r4.ok && r4.reason === 'vessel_not_found', 'addMember reject vessel_not_found');

  v2.isWreck = true;
  const r5 = fs.addMember(fC.id, v2.id);
  assert(!r5.ok && r5.reason === 'wrecked', 'addMember reject wrecked vessel');
  v2.isWreck = false; // restore dla dalszego ciągu

  const removed = fs.removeMember(v1.id);
  assert(removed && v1.fleetId === null && !fB.memberIds.includes(v1.id) && !fs.getFleet(fB.id),
         'removeMember + autoDisband pustej floty (fB miał tylko v1)');
}

// ── T5 — vessel:wrecked → auto-remove + autoDisband ─────────────────────────
header('T5: vessel:wrecked → auto-remove + autoDisband empty');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Doomed');
  const v1 = makeVessel('v_1');
  const v2 = makeVessel('v_2');
  vm.addMock(v1); vm.addMock(v2);
  fs.addMember(f.id, v1.id);
  fs.addMember(f.id, v2.id);
  assert(f.memberIds.length === 2, 'flota ma 2 członków');

  // Pierwszy wrak — fleet zostaje (1 member)
  v1.isWreck = true;
  EventBus.emit('vessel:wrecked', { vesselId: v1.id });
  assert(f.memberIds.length === 1 && v1.fleetId === null, 'vessel:wrecked → auto-remove');

  // Drugi wrak → empty → auto-disband
  v2.isWreck = true;
  EventBus.emit('vessel:wrecked', { vesselId: v2.id });
  assert(fs.listFleets().length === 0 && v2.fleetId === null,
         'wrecked → empty → auto-disband (autoDisbandWhenEmpty=true)');
}

// ── T6 — SaveMigration v72→v73 ──────────────────────────────────────────────
header('T6: SaveMigration v72→v73');
{
  assert(CURRENT_VERSION === 73, 'CURRENT_VERSION = 73');

  // Symuluj minimalny save w v72 z 1 vesselem
  const oldSave = {
    version: 72,
    civ4x: {
      vesselManager: { vessels: [{ id: 'v_1', name: 'X' }] },
      notificationCenter: { items: [], nextId: 1 },
    },
  };
  const migrated = migrate(oldSave);
  assert(migrated.version === 73 && migrated.civ4x.playerFleets, 'migracja dodaje playerFleets default');
  assert(migrated.civ4x.vesselManager.vessels[0].fleetId === null,
         'migracja dodaje vessel.fleetId default null');
}

// ── T7 — FleetSystem.serialize → restore round-trip ─────────────────────────
header('T7: FleetSystem.serialize/restore round-trip + orphan filtering');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  const f = fs.createFleet('Charlie', { doctrine: 'hold_position' });
  const v1 = makeVessel('v_1');
  const v2 = makeVessel('v_2');
  vm.addMock(v1); vm.addMock(v2);
  fs.addMember(f.id, v1.id);
  fs.addMember(f.id, v2.id);
  const ser = fs.serialize();
  assert(ser.fleets.length === 1 && ser.fleets[0].memberIds.length === 2 && ser.nextId >= 2,
         'serialize zwraca { fleets[], nextId }');

  // Nowa instancja FleetSystem — restore
  const vm2 = makeVM();
  const v1b = makeVessel('v_1'); // ten sam id, świeży vessel po load
  vm2.addMock(v1b);
  // v_2 ZNIKA (orphan w restore — drop)
  const fs2 = new FleetSystem(vm2);
  fs2.restore(ser);
  const fr = fs2.getFleet(f.id);
  assert(fr && fr.name === 'Charlie' && fr.doctrine === 'hold_position', 'restore odtwarza floty');
  assert(fr.memberIds.length === 1 && fr.memberIds[0] === 'v_1', 'orphan v_2 odfiltrowany');
  assert(v1b.fleetId === f.id, 'vessel.fleetId re-ustawiony reactive mirror');
}

console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
