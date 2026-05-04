// ── M3 P1.5 — Smoke tests dla TooltipContent (pure helper) ─────────────
// Brak DOM/canvas — tylko getTooltipContent + _resolveVesselEmpireName.
// Mock deps (t, colonyManager, empireRegistry).
//
// Uruchomienie: node tmp_m3_p1_5_tooltip_test.mjs

// ── Stub browser globals (PRZED importami — ESM hoisting) ──────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};

// ── Imports ────────────────────────────────────────────────────────────
const { getTooltipContent, _resolveVesselEmpireName, _resolvePlanetAtmosphere } = await import('./src/utils/TooltipContent.js');

// ── Test harness ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
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
function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected true`);
}
function assertContains(arr, predicate, label) {
  if (!Array.isArray(arr)) throw new Error(`${label}: not array`);
  if (!arr.some(predicate)) throw new Error(`${label}: no element matches predicate. Array: ${JSON.stringify(arr)}`);
}
function assertNoElement(arr, predicate, label) {
  if (!Array.isArray(arr)) return;
  if (arr.some(predicate)) throw new Error(`${label}: unexpectedly found matching element. Array: ${JSON.stringify(arr)}`);
}

// ── Mocks ──────────────────────────────────────────────────────────────
// Identity t: zwraca raw key — łatwiej weryfikować w asercjach
const tIdentity = (key) => key;

function mockColonyManager(map) {
  return {
    getColony: (planetId) => map[planetId] ?? null,
  };
}

function mockEmpireRegistry(map) {
  return {
    get: (id) => map[id] ?? null,
  };
}

function makeVessel(overrides = {}) {
  return {
    id: 'v_1',
    name: 'Obrońca Alfa',
    fuel:        { current: 6.5, max: 8, consumption: 0.5 },
    endurance:   { current: 75, max: 100, drainPerYear: 0, regenPerYear: 0 },
    movementOrder: null,
    mission: null,
    position: { x: 12.3, y: -45.6, state: 'in_transit', dockedAt: null },
    ...overrides,
  };
}

function makePlanet(overrides = {}) {
  return {
    id: 'p_home',
    name: 'Bastion',
    type: 'planet',
    planetType: 'rocky',
    temperatureC: 12,
    explored: true,
    deposits: [{ resourceId: 'iron' }, { resourceId: 'silicon' }],
    ...overrides,
  };
}

// ── T1 — getTooltipContent per type (12 cases) ─────────────────────────

console.log('\n=== T1 — getTooltipContent per entity type ===\n');

test('T1.1 vessel basic — title=name, empire=player, fuel, position', () => {
  const v = makeVessel();
  const out = getTooltipContent('vessel', v, { t: tIdentity });
  assertEq(out.title, 'Obrońca Alfa', 'title');
  assertContains(out.lines, l => l.startsWith('tooltip.vessel.empire:') && l.includes('tooltip.empire.player'), 'empire line');
  assertContains(out.lines, l => l.startsWith('tooltip.vessel.fuel:') && l.includes('6.5/8.0'), 'fuel line');
  assertContains(out.lines, l => l.startsWith('tooltip.vessel.position:') && l.includes('12.3') && l.includes('in_transit'), 'position line');
});

test('T1.2 vessel z movementOrder active — pokazuje order line', () => {
  const v = makeVessel({ movementOrder: { type: 'pursue', status: 'active', targetEntityId: 'v_2' } });
  const out = getTooltipContent('vessel', v, { t: tIdentity });
  assertContains(out.lines, l => l.includes('tooltip.vessel.order') && l.includes('pursue'), 'order line shows pursue');
});

test('T1.3 vessel z movementOrder cancelled — NIE pokazuje order line', () => {
  const v = makeVessel({ movementOrder: { type: 'pursue', status: 'cancelled' } });
  const out = getTooltipContent('vessel', v, { t: tIdentity });
  assertNoElement(out.lines, l => l.includes('tooltip.vessel.order'), 'order line absent for cancelled');
});

test('T1.4 vessel z mission — pokazuje mission line z target', () => {
  const v = makeVessel({ mission: { type: 'recon', targetId: 'p_alpha', targetName: 'Alfa Centauri' } });
  const out = getTooltipContent('vessel', v, { t: tIdentity });
  assertContains(out.lines, l => l.includes('tooltip.vessel.mission') && l.includes('recon') && l.includes('Alfa Centauri'), 'mission line');
});

test('T1.5 planet basic — title=name, type, neutral owner, temperatura, resources', () => {
  const p = makePlanet();
  const out = getTooltipContent('planet', p, { t: tIdentity });
  assertEq(out.title, 'Bastion', 'title');
  assertContains(out.lines, l => l.startsWith('tooltip.planet.type:') && l.includes('rocky'), 'type line');
  assertContains(out.lines, l => l.startsWith('tooltip.planet.owner:') && l.includes('tooltip.empire.neutral'), 'owner line neutral (no colony)');
  assertContains(out.lines, l => l.startsWith('tooltip.planet.resources:') && l.includes('iron'), 'resources line');
  assertContains(out.lines, l => l.startsWith('tooltip.planet.temperature:') && l.includes('+12°C'), 'temperature line');
});

test('T1.6 planet z owner+population (colony lookup)', () => {
  const p = makePlanet({ id: 'p_colony' });
  const colMgr = mockColonyManager({
    p_colony: { name: 'Stolica', civSystem: { population: 12.4 } },
  });
  const out = getTooltipContent('planet', p, { t: tIdentity, colonyManager: colMgr });
  assertContains(out.lines, l => l.startsWith('tooltip.planet.owner:') && l.includes('tooltip.empire.player'), 'owner = player');
  assertContains(out.lines, l => l.startsWith('tooltip.planet.population:') && l.includes('12.4'), 'population line');
});

test('T1.7 planet bez owner (uncolonized) — neutral fallback', () => {
  const p = makePlanet({ id: 'p_unknown' });
  const colMgr = mockColonyManager({});
  const out = getTooltipContent('planet', p, { t: tIdentity, colonyManager: colMgr });
  assertContains(out.lines, l => l.includes('tooltip.empire.neutral'), 'neutral when no colony');
  assertNoElement(out.lines, l => l.startsWith('tooltip.planet.population:'), 'no population line uncolonized');
});

test('T1.8 planet bez explored — skip resources line', () => {
  const p = makePlanet({ explored: false });
  const out = getTooltipContent('planet', p, { t: tIdentity });
  assertNoElement(out.lines, l => l.startsWith('tooltip.planet.resources:'), 'resources line absent unscanned');
});

test('T1.9 poi waypoint — title, type, owner=player, position', () => {
  const poi = { id: 'poi_1', name: 'WP-Bramowy', type: 'waypoint', ownerEmpireId: 'player', createdYear: 2050, point: { x: 100, y: -200 } };
  const out = getTooltipContent('poi', poi, { t: tIdentity });
  assertEq(out.title, 'WP-Bramowy', 'title');
  assertContains(out.lines, l => l.includes('tooltip.poi.type') && l.includes('waypoint'), 'type line');
  assertContains(out.lines, l => l.includes('tooltip.poi.owner') && l.includes('tooltip.empire.player'), 'owner=player');
  assertContains(out.lines, l => l.includes('tooltip.poi.position') && l.includes('100.0') && l.includes('-200.0'), 'position');
});

test('T1.10 poi patrol — N waypoints + loopMode', () => {
  const poi = {
    id: 'poi_2', name: 'Patrol-East', type: 'patrol', ownerEmpireId: 'player', createdYear: 2055,
    waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }],
    loopMode: 'loop',
  };
  const out = getTooltipContent('poi', poi, { t: tIdentity });
  assertContains(out.lines, l => l.includes('tooltip.poi.waypoints') && l.includes('3'), '3 waypoints');
  assertContains(out.lines, l => l.includes('tooltip.poi.loopMode') && l.includes('loop'), 'loopMode loop');
});

test('T1.11 poi picket — range', () => {
  const poi = {
    id: 'poi_3', name: 'Picket-North', type: 'picket', ownerEmpireId: 'player', createdYear: 2060,
    rangePxLocal: 4.5,
  };
  const out = getTooltipContent('poi', poi, { t: tIdentity });
  assertContains(out.lines, l => l.includes('tooltip.poi.range') && l.includes('4.5'), 'range line');
});

test('T1.12 unknown entity type → null', () => {
  const out = getTooltipContent('mysterious_thing', { id: 'x' }, { t: tIdentity });
  assertEq(out, null, 'null returned');
});

// ── T2 — Schema robustness L24 (5 cases) ───────────────────────────────

console.log('\n=== T2 — Schema robustness (L24 missing fields) ===\n');

test('T2.1 entity null → null returned (no crash)', () => {
  const out = getTooltipContent('vessel', null, { t: tIdentity });
  assertEq(out, null, 'null entity → null content');
});

test('T2.2 vessel bez fuel → graceful skip, position dalej rysowana', () => {
  const v = { id: 'v_2', name: 'NoFuel', position: { x: 0, y: 0, state: 'docked' } };
  const out = getTooltipContent('vessel', v, { t: tIdentity });
  assertNoElement(out.lines, l => l.startsWith('tooltip.vessel.fuel:'), 'no fuel line');
  assertContains(out.lines, l => l.startsWith('tooltip.vessel.position:'), 'position dalej');
});

test('T2.3 vessel bez hp (off-spec #1) → no crash, no HP line ever', () => {
  const v = makeVessel();
  // vessel.hp NIE istnieje na entity. Tooltip nigdy nie powinien generować HP linii.
  const out = getTooltipContent('vessel', v, { t: tIdentity });
  assertNoElement(out.lines, l => /hp|HP/i.test(l), 'no HP line — entity nie ma hp field');
});

test('T2.4 nested fields undefined → no crash (vessel.position.x === null)', () => {
  const v = makeVessel({ position: { state: 'docked' } });  // missing x/y
  const out = getTooltipContent('vessel', v, { t: tIdentity });
  // position line skipnięta (typeof position.x !== 'number')
  assertNoElement(out.lines, l => l.startsWith('tooltip.vessel.position:'), 'position skipped when x undefined');
});

test('T2.5 t function null → fallback do raw keys (identity)', () => {
  const v = makeVessel();
  const out = getTooltipContent('vessel', v, {});  // brak t
  // _identityT zwraca key as-is — empire line będzie 'tooltip.vessel.empire: tooltip.empire.player'
  assertContains(out.lines, l => l.includes('tooltip.vessel.empire'), 'fallback raw key');
});

// ── T3 — _resolveVesselEmpireName multi-shape (BONUS, flag #1) ─────────

console.log('\n=== T3 — _resolveVesselEmpireName multi-shape (flag #1) ===\n');

test('T3.1 vessel default (player) → tooltip.empire.player', () => {
  const v = makeVessel();
  assertEq(_resolveVesselEmpireName(v, tIdentity, {}), 'tooltip.empire.player', 'player default');
});

test('T3.2 vessel z ownerEmpireId="emp_alpha" + registry → emp.name', () => {
  const v = makeVessel({ ownerEmpireId: 'emp_alpha' });
  const er = mockEmpireRegistry({ emp_alpha: { id: 'emp_alpha', name: 'Konfederacja Alfa' } });
  assertEq(_resolveVesselEmpireName(v, tIdentity, { empireRegistry: er }), 'Konfederacja Alfa', 'empire name from registry');
});

test('T3.3 vessel.isEnemy=true bez ID → tooltip.empire.hostile', () => {
  const v = makeVessel({ isEnemy: true });
  assertEq(_resolveVesselEmpireName(v, tIdentity, {}), 'tooltip.empire.hostile', 'hostile fallback');
});

test('T3.4 vessel.owner="player" → player (legacy semantyka)', () => {
  const v = makeVessel({ owner: 'player' });
  assertEq(_resolveVesselEmpireName(v, tIdentity, {}), 'tooltip.empire.player', 'owner=player → player');
});

// ── T4 — Single tooltip switch behavior (flag #4 — last hover wins) ────
// Brak DOM tutaj; testujemy semantykę key discriminator w content lookup.
// Tooltip.js timer state covered w real-flow; tu sprawdzamy że content
// rebuild z różnymi entity zwraca distinctly different output (last wins).

console.log('\n=== T4 — Last hover wins switch (flag #4) ===\n');

test('T4.1 vessel → planet → poi switch — content distinct + non-null', () => {
  const v = makeVessel();
  const p = makePlanet();
  const poi = { id: 'poi_1', name: 'Alpha', type: 'waypoint', ownerEmpireId: 'player', createdYear: 2050, point: { x: 1, y: 2 } };
  const c1 = getTooltipContent('vessel', v, { t: tIdentity });
  const c2 = getTooltipContent('planet', p, { t: tIdentity });
  const c3 = getTooltipContent('poi', poi, { t: tIdentity });
  assertTrue(c1.title === 'Obrońca Alfa', 'c1 vessel title');
  assertTrue(c2.title === 'Bastion', 'c2 planet title');
  assertTrue(c3.title === 'Alpha', 'c3 poi title');
  assertTrue(c1.title !== c2.title && c2.title !== c3.title, 'distinct titles');
});

// ── T5 — FleetOverlay body tooltip migration (M3 mini-feature) ────────
// Migracja content z _drawBodyTooltip (canvas) → NEW _planetContent.
// Nowe pola: status, distance (od gwiazdy), atmosphere, "Dane ???" dla unexplored.
// Reuse i18n keys fleet.tooltip* (z parametrami {0}). Local tParam honoruje args.

console.log('\n=== T5 — FleetOverlay body tooltip migration (M3) ===\n');

// t fn który formatuje parametryzowane klucze: 'key' lub 'key|arg1,arg2'
const tParam = (key, ...args) => args.length ? `${key}|${args.join(',')}` : key;

test('T5.1 explored planet z deposits + atmosphere thick + x/y + auToPx → Status/Distance/Atmosphere/Resources', () => {
  const p = makePlanet({ x: 30, y: 40, atmosphere: 'thick' });  // dist = 50/auToPx
  const out = getTooltipContent('planet', p, { t: tParam, auToPx: 10 });
  assertContains(out.lines, l => l === 'fleet.tooltipStatusExplored', 'status explored');
  assertContains(out.lines, l => l.startsWith('fleet.tooltipDistance|') && l.includes('5.00'), 'distance 5.00 AU');
  assertContains(out.lines, l => l.startsWith('fleet.tooltipAtmosphere|') && l.includes('fleet.atmDense'), 'atmosphere=thick → atmDense label');
  assertContains(out.lines, l => l.startsWith('tooltip.planet.resources:') && l.includes('iron'), 'resources line');
});

test('T5.2 unexplored planet → Status unexplored + Dane ??? + brak resources', () => {
  const p = makePlanet({ explored: false, x: 10, y: 0 });
  const out = getTooltipContent('planet', p, { t: tParam, auToPx: 10 });
  assertContains(out.lines, l => l === 'fleet.tooltipStatusUnexplored', 'status unexplored');
  assertContains(out.lines, l => l === 'fleet.tooltipData', 'Dane ??? line');
  assertNoElement(out.lines, l => l.startsWith('tooltip.planet.resources:'), 'no resources unexplored');
});

test('T5.3 planet z atmosphere=none → SKIP linia atmosphere', () => {
  const p = makePlanet({ atmosphere: 'none' });
  const out = getTooltipContent('planet', p, { t: tParam, auToPx: 10 });
  assertNoElement(out.lines, l => l.startsWith('fleet.tooltipAtmosphere'), 'no atmosphere line for none');
});

test('T5.4 planet bez x/y lub deps.auToPx → SKIP linia distance', () => {
  const p1 = makePlanet({ x: 30, y: 40 });  // ma x/y ale brak auToPx
  const out1 = getTooltipContent('planet', p1, { t: tParam });
  assertNoElement(out1.lines, l => l.startsWith('fleet.tooltipDistance'), 'no distance bez auToPx');

  const p2 = makePlanet();  // brak x/y
  const out2 = getTooltipContent('planet', p2, { t: tParam, auToPx: 10 });
  assertNoElement(out2.lines, l => l.startsWith('fleet.tooltipDistance'), 'no distance bez x/y');
});

test('T5.5 atmosphere=breathable → linia z ✅', () => {
  const p = makePlanet({ atmosphere: 'breathable' });
  const out = getTooltipContent('planet', p, { t: tParam });
  assertContains(out.lines, l => l.startsWith('fleet.tooltipAtmosphere|') && l.includes('✅'), 'breathable z ✅');
});

test('T5.6 _resolvePlanetAtmosphere — multi-shape (string/none/breathableFlag/null)', () => {
  // string thin → atmThin
  assertEq(_resolvePlanetAtmosphere({ atmosphere: 'thin' }, tParam), 'fleet.atmThin', 'thin → atmThin');
  // none → null (skip)
  assertEq(_resolvePlanetAtmosphere({ atmosphere: 'none' }, tParam), null, 'none → null');
  // missing → null
  assertEq(_resolvePlanetAtmosphere({}, tParam), null, 'missing atm → null');
  // breathableAtmosphere flag fallback (atmosphere=thick + flag → ✅)
  const lbl = _resolvePlanetAtmosphere({ atmosphere: 'thick', breathableAtmosphere: true }, tParam);
  assertTrue(lbl.includes('✅'), 'breathableAtmosphere flag → ✅');
  // null planet → null (graceful)
  assertEq(_resolvePlanetAtmosphere(null, tParam), null, 'null planet → null');
});

// ── Summary ────────────────────────────────────────────────────────────

console.log('\n=== SUMMARY ===');
console.log(`PASS: ${passed}`);
console.log(`FAIL: ${failed}`);
if (failed > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => {
    console.log(`  - ${f.name}: ${f.err.message}`);
  });
  process.exit(1);
}
