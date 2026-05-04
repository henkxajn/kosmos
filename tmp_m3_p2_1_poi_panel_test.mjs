// ── M3 P2.1 — Smoke tests dla POIPanelLogic (pure helpers) ────────────
// Sort/filter/format/getPOILocation. Brak DOM/canvas — tylko logika.
//
// Uruchomienie: node tmp_m3_p2_1_poi_panel_test.mjs

// ── Stub browser globals (PRZED importami) ───────────────────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};

// ── Imports ──────────────────────────────────────────────────────────
const {
  sortPOIs, filterPOIs, formatPOIRow, getPOILocation,
  collectOwners, POI_TYPE_ORDER, TYPE_ICONS,
} = await import('./src/utils/POIPanelLogic.js');

// ── Test harness ─────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message}`);
  }
}
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}
function assert(cond, label) { if (!cond) throw new Error(label); }

// ── Mock t() — i18n stub ─────────────────────────────────────────────
const t = (key) => {
  const map = {
    'poi.type.label.waypoint': 'Waypoint',
    'poi.type.label.patrol':   'Patrol',
    'poi.type.label.picket':   'Picket',
    'poi.type.label.rally':    'Rally',
    'poi.type.label.ambush':   'Ambush',
    'poi.panel.subtitle.waypoints': 'wp',
    'poi.panel.subtitle.range':     'Range',
    'poi.panel.subtitle.members':   'members',
    'poi.panel.subtitle.hidden':    'hidden',
    'poi.panel.subtitle.visible':   'visible',
    'poi.panel.owner.player':       'Player',
  };
  return map[key] ?? key;
};

// ── Fixtures ─────────────────────────────────────────────────────────
function makeWaypoint(overrides = {}) {
  return { id: 'poi_w1', type: 'waypoint', name: 'Alpha', ownerEmpireId: 'player',
    createdYear: 2150, point: { x: 100, y: 200 }, ...overrides };
}
function makePatrol(overrides = {}) {
  return { id: 'poi_p1', type: 'patrol', name: 'Beta', ownerEmpireId: 'player',
    createdYear: 2155, waypoints: [{x:0,y:0},{x:10,y:10},{x:20,y:0}], loopMode: 'loop', ...overrides };
}
function makePicket(overrides = {}) {
  return { id: 'poi_pk1', type: 'picket', name: 'Charlie', ownerEmpireId: 'emp_3',
    createdYear: 2160, center: { x: 50, y: 50 }, rangePxLocal: 80, alertOnEmpireIds: null, ...overrides };
}
function makeRally(overrides = {}) {
  return { id: 'poi_r1', type: 'rally', name: 'Delta', ownerEmpireId: 'player',
    createdYear: 2165, center: { x: 0, y: 0 }, waitForCount: 3, memberVesselIds: ['v_1','v_2'], ...overrides };
}
function makeAmbush(overrides = {}) {
  return { id: 'poi_a1', type: 'ambush', name: 'Echo', ownerEmpireId: 'player',
    createdYear: 2170, center: { x: -50, y: 100 }, rangePxLocal: 60, hidden: true, triggerOnEmpireIds: null, ...overrides };
}

// ═════════════════════════════════════════════════════════════════════
// T1 — sortPOIs (6 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T1] sortPOIs');

test('T1.1 sort by name asc', () => {
  const res = sortPOIs([makeWaypoint({name:'Charlie'}), makePatrol({name:'Alpha'}), makePicket({name:'Beta'})], 'name', 'asc');
  assertEq(res.map(p => p.name), ['Alpha','Beta','Charlie'], 'name asc');
});

test('T1.2 sort by name desc', () => {
  const res = sortPOIs([makeWaypoint({name:'Charlie'}), makePatrol({name:'Alpha'}), makePicket({name:'Beta'})], 'name', 'desc');
  assertEq(res.map(p => p.name), ['Charlie','Beta','Alpha'], 'name desc');
});

test('T1.3 sort by type', () => {
  // alphabetical type: ambush, patrol, picket, rally, waypoint
  const res = sortPOIs([makeWaypoint(), makeAmbush(), makePatrol()], 'type', 'asc');
  assertEq(res.map(p => p.type), ['ambush','patrol','waypoint'], 'type asc');
});

test('T1.4 sort by createdYear desc (default)', () => {
  const res = sortPOIs([makeWaypoint({createdYear:2150}), makePatrol({createdYear:2155}), makeAmbush({createdYear:2170})]);
  assertEq(res.map(p => p.createdYear), [2170, 2155, 2150], 'createdYear desc');
});

test('T1.5 missing createdYear → graceful (treat undefined as 0)', () => {
  const res = sortPOIs([makeWaypoint({createdYear:2150}), makePatrol({createdYear: undefined}), makeAmbush({createdYear: 100})], 'createdYear', 'asc');
  // undefined→0, 100, 2150
  assertEq(res.map(p => p.createdYear ?? 0), [0, 100, 2150], 'undefined → 0');
});

test('T1.6 empty list → empty result', () => {
  assertEq(sortPOIs([]), [], 'empty');
  assertEq(sortPOIs(null), [], 'null');
  assertEq(sortPOIs(undefined), [], 'undefined');
});

// ═════════════════════════════════════════════════════════════════════
// T2 — filterPOIs (6 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T2] filterPOIs');

const allTypes = [makeWaypoint(), makePatrol(), makePicket(), makeRally(), makeAmbush()];

test('T2.1 filter all → unchanged', () => {
  assertEq(filterPOIs(allTypes, 'all', 'all').length, 5, 'all=5');
});

test('T2.2 filter type "patrol"', () => {
  const res = filterPOIs(allTypes, 'patrol', 'all');
  assertEq(res.length, 1, 'count=1');
  assertEq(res[0].type, 'patrol', 'type');
});

test('T2.3 filter owner "player" → 4 (waypoint+patrol+rally+ambush, picket=emp_3)', () => {
  const res = filterPOIs(allTypes, 'all', 'player');
  assertEq(res.length, 4, 'count=4');
  assert(res.every(p => p.ownerEmpireId === 'player'), 'all player');
});

test('T2.4 combined: type=picket AND owner=emp_3', () => {
  const res = filterPOIs(allTypes, 'picket', 'emp_3');
  assertEq(res.length, 1, 'count=1');
  assertEq(res[0].id, 'poi_pk1', 'id');
});

test('T2.5 no matches → empty', () => {
  assertEq(filterPOIs(allTypes, 'rally', 'emp_999').length, 0, 'no matches');
});

test('T2.6 missing field (no ownerEmpireId) → graceful', () => {
  const broken = [{ id:'x', type:'waypoint', name:'X', point:{x:0,y:0} }]; // no ownerEmpireId
  // filter owner='player' → broken has undefined owner → excluded
  assertEq(filterPOIs(broken, 'all', 'player').length, 0, 'missing owner excluded');
  // filter owner='all' → still included
  assertEq(filterPOIs(broken, 'all', 'all').length, 1, 'missing owner+all included');
});

// ═════════════════════════════════════════════════════════════════════
// T3 — formatPOIRow (7 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T3] formatPOIRow');

test('T3.1 waypoint → 📍 + (x,y) subtitle', () => {
  const row = formatPOIRow(makeWaypoint(), t);
  assertEq(row.icon, '📍', 'icon');
  assertEq(row.label, 'Waypoint', 'label');
  assertEq(row.subtitle, '(100, 200)', 'subtitle');
  assertEq(row.meta, 'Y2150', 'meta');
  assertEq(row.ownerLabel, 'Player', 'owner');
});

test('T3.2 patrol → ↻ + N waypoints + loopMode', () => {
  const row = formatPOIRow(makePatrol(), t);
  assertEq(row.icon, '↻', 'icon');
  assertEq(row.subtitle, '3 wp · loop', 'subtitle');
});

test('T3.3 picket → ⚠ + Range:N', () => {
  const row = formatPOIRow(makePicket(), t);
  assertEq(row.icon, '⚠', 'icon');
  assertEq(row.subtitle, 'Range: 80', 'subtitle');
});

test('T3.4 rally → 🎯 + have/want members', () => {
  const row = formatPOIRow(makeRally(), t);
  assertEq(row.icon, '🎯', 'icon');
  assertEq(row.subtitle, '2/3 members', 'subtitle');
});

test('T3.5 ambush → 👁 + Range + hidden|visible', () => {
  const row = formatPOIRow(makeAmbush({hidden:true}), t);
  assertEq(row.icon, '👁', 'icon');
  assertEq(row.subtitle, 'Range: 60 · hidden', 'subtitle');
  const row2 = formatPOIRow(makeAmbush({hidden:false}), t);
  assertEq(row2.subtitle, 'Range: 60 · visible', 'visible variant');
});

test('T3.6 unknown type → null', () => {
  const row = formatPOIRow({ id:'x', type:'unknown', name:'X' }, t);
  assertEq(row, null, 'null for unknown');
});

test('T3.7 missing fields → fallback (no crash, L24)', () => {
  // patrol bez waypoints array
  const row = formatPOIRow({ id:'x', type:'patrol', name:'X' }, t);
  assertEq(row.icon, '↻', 'icon present');
  assertEq(row.subtitle, '0 wp · ?', 'fallback subtitle');
  // waypoint bez point
  const row2 = formatPOIRow({ id:'y', type:'waypoint', name:'Y' }, t);
  assertEq(row2.subtitle, '—', 'em-dash fallback');
  // null poi → null
  assertEq(formatPOIRow(null, t), null, 'null input');
  // brak t → użyj key jako fallback
  const row3 = formatPOIRow(makeWaypoint(), null);
  assert(row3 !== null, 'works without t');
});

// ═════════════════════════════════════════════════════════════════════
// T4 — integration / utilities (6 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T4] integration / getPOILocation / collectOwners');

test('T4.1 sort + filter combined', () => {
  const list = [
    makeWaypoint({createdYear:2150}),
    makePatrol({createdYear:2155}),
    makePicket({createdYear:2160}),
    makeAmbush({createdYear:2170}),
  ];
  const filtered = filterPOIs(list, 'all', 'player');  // 3 player items (waypoint, patrol, ambush)
  const sorted = sortPOIs(filtered, 'createdYear', 'desc');
  assertEq(sorted.map(p => p.createdYear), [2170, 2155, 2150], 'sort+filter combined');
});

test('T4.2 getPOILocation per type', () => {
  // waypoint → point
  assertEq(getPOILocation(makeWaypoint()), { x: 100, y: 200 }, 'waypoint');
  // patrol → first waypoint
  assertEq(getPOILocation(makePatrol()), { x: 0, y: 0 }, 'patrol[0]');
  // picket → center
  assertEq(getPOILocation(makePicket()), { x: 50, y: 50 }, 'picket');
  // rally → center
  assertEq(getPOILocation(makeRally()), { x: 0, y: 0 }, 'rally');
  // ambush → center
  assertEq(getPOILocation(makeAmbush()), { x: -50, y: 100 }, 'ambush');
  // null → null
  assertEq(getPOILocation(null), null, 'null');
});

test('T4.3 getPOILocation graceful missing fields', () => {
  // waypoint bez point
  assertEq(getPOILocation({ type: 'waypoint', name: 'X' }), null, 'waypoint no point');
  // patrol z empty waypoints
  assertEq(getPOILocation({ type: 'patrol', waypoints: [] }), null, 'patrol empty');
  // picket bez center
  assertEq(getPOILocation({ type: 'picket' }), null, 'picket no center');
  // unknown type
  assertEq(getPOILocation({ type: 'foo' }), null, 'unknown type');
});

test('T4.4 collectOwners — unique sorted list', () => {
  const list = [makeWaypoint(), makePatrol(), makePicket(), makeRally()];
  // owners: player, player, emp_3, player → unique: ['emp_3', 'player']
  assertEq(collectOwners(list), ['emp_3', 'player'], 'unique sorted');
  assertEq(collectOwners([]), [], 'empty');
  assertEq(collectOwners(null), [], 'null');
});

test('T4.5 POI_TYPE_ORDER + TYPE_ICONS exports', () => {
  assertEq(POI_TYPE_ORDER, ['waypoint','patrol','picket','rally','ambush'], 'order');
  assertEq(Object.keys(TYPE_ICONS).sort(), ['ambush','patrol','picket','rally','waypoint'], 'icons keys');
  assert(TYPE_ICONS.waypoint === '📍', 'waypoint icon');
});

test('T4.6 sort stability (same createdYear → tie-break by id)', () => {
  const list = [
    { id: 'poi_b', type: 'waypoint', name: 'B', createdYear: 2150, point:{x:0,y:0} },
    { id: 'poi_a', type: 'waypoint', name: 'A', createdYear: 2150, point:{x:0,y:0} },
  ];
  const res = sortPOIs(list, 'createdYear', 'desc');
  // Same year: id desc → poi_b, poi_a
  assertEq(res.map(p => p.id), ['poi_b','poi_a'], 'tie-break desc');
  const res2 = sortPOIs(list, 'createdYear', 'asc');
  assertEq(res2.map(p => p.id), ['poi_a','poi_b'], 'tie-break asc');
});

// ── Summary ──────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log(`PASSED: ${passed}, FAILED: ${failed}, TOTAL: ${passed + failed}`);
if (failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`    ${f.err.message}`);
  }
  process.exit(1);
}
console.log('ALL GREEN ✓');
process.exit(0);
