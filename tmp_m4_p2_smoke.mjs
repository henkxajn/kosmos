// ── M4 P2 — Sensor overlay + Enemy ghosts + MiniMap + Wraki + Tab smoke ────
// Pure-logic only (Node ESM, no DOM/canvas/Three).
//
// T1 — SaveMigration v69→v70                       (~5 cases)
// T2 — Feature flags + tunables                    (~5 cases)
// T3 — Enemy ghosts intel quality + fade math      (~5 cases)
// T4 — Tab cycling filter/sort/wrap                (~5 cases)
// T5 — MiniMap hostility colors + ETA              (~5 cases)
// T6 — i18n PL/EN coverage                         (~5 cases)
//
// Target: ~30 GREEN cases.

// ── Stub browser globals (PRZED importami) ─────────────────────────────
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};
globalThis.document = globalThis.document ?? {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
};

// ── Imports ───────────────────────────────────────────────────────────
const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
const SaveMigrationModule = await import('./src/systems/SaveMigration.js');
const { CURRENT_VERSION, migrate } = SaveMigrationModule;

// i18n
const { t, setLocale } = await import('./src/i18n/i18n.js');

// ── Test harness ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (err) { failed++; failures.push({ name, err: err.message ?? String(err) }); }
}
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function assertTrue(actual, msg) {
  if (!actual) throw new Error(`${msg}: expected truthy, got ${actual}`);
}
function assertFalse(actual, msg) {
  if (actual) throw new Error(`${msg}: expected falsy, got ${actual}`);
}

// ──────────────────────────────────────────────────────────────────────
// T1 — SaveMigration v69→v70 (~5)
// ──────────────────────────────────────────────────────────────────────

test('T1.1 CURRENT_VERSION = 70', () => {
  assertEq(CURRENT_VERSION, 70, 'CURRENT_VERSION');
});

test('T1.2 v69→v70 adds uiPrefs defaults', () => {
  const data = { version: 69, civ4x: {} };
  const migrated = migrate(data);
  assertTrue(migrated.uiPrefs, 'uiPrefs created');
  assertEq(migrated.uiPrefs.sensorOverlayVisible, false, 'sensor default false');
  assertEq(migrated.uiPrefs.miniMapVisible, false, 'minimap default false');
});

test('T1.3 v69→v70 preserves existing uiPrefs values', () => {
  const data = {
    version: 69,
    uiPrefs: { sensorOverlayVisible: true, miniMapVisible: true },
    civ4x: {},
  };
  const migrated = migrate(data);
  assertEq(migrated.uiPrefs.sensorOverlayVisible, true, 'preserves true');
  assertEq(migrated.uiPrefs.miniMapVisible, true, 'preserves true');
});

test('T1.4 v69→v70 vessel lastBattleId/Year null defaults', () => {
  const data = {
    version: 69,
    civ4x: { vesselManager: { vessels: [
      { id: 'v_1', isWreck: true, wreckedAt: 50 },
      { id: 'v_2' },
    ]}},
  };
  const migrated = migrate(data);
  const vs = migrated.civ4x.vesselManager.vessels;
  assertEq(vs[0].lastBattleId, null, 'wreck lastBattleId null');
  assertEq(vs[0].lastBattleYear, null, 'wreck lastBattleYear null');
  assertEq(vs[1].lastBattleId, null, 'living lastBattleId null');
});

test('T1.5 v69→v70 idempotent (already migrated)', () => {
  const data = {
    version: 69,
    uiPrefs: { sensorOverlayVisible: true, miniMapVisible: false },
    civ4x: { vesselManager: { vessels: [
      { id: 'v_1', lastBattleId: 'battle_42_war_1_1', lastBattleYear: 42 },
    ]}},
  };
  const migrated = migrate(data);
  assertEq(migrated.uiPrefs.sensorOverlayVisible, true, 'preserved');
  assertEq(migrated.civ4x.vesselManager.vessels[0].lastBattleId, 'battle_42_war_1_1', 'preserved');
  assertEq(migrated.civ4x.vesselManager.vessels[0].lastBattleYear, 42, 'preserved');
});

// ──────────────────────────────────────────────────────────────────────
// T2 — Feature flags + tunables (~5)
// ──────────────────────────────────────────────────────────────────────

test('T2.1 FEATURES.m4SensorOverlay = true', () => {
  assertEq(GAME_CONFIG.FEATURES.m4SensorOverlay, true, 'm4SensorOverlay flag');
});

test('T2.2 FEATURES.m4EnemyGhosts = true', () => {
  assertEq(GAME_CONFIG.FEATURES.m4EnemyGhosts, true, 'm4EnemyGhosts flag');
});

test('T2.3 FEATURES.m4MiniMap = true', () => {
  assertEq(GAME_CONFIG.FEATURES.m4MiniMap, true, 'm4MiniMap flag');
});

test('T2.4 SENSOR_LOCK_AU constant', () => {
  assertEq(GAME_CONFIG.SENSOR_LOCK_AU, 0.3, 'SENSOR_LOCK_AU = 0.3');
});

test('T2.5 RUMOR_FADE_YEARS constant', () => {
  assertEq(GAME_CONFIG.RUMOR_FADE_YEARS, 10, 'RUMOR_FADE_YEARS = 10');
});

// ──────────────────────────────────────────────────────────────────────
// T3 — Enemy ghosts intel quality + fade math (~5)
// ──────────────────────────────────────────────────────────────────────

// Replikuje logikę z ThreeRenderer._applyVesselIntelVisibility (kontrola
// bez ładowania three.js). Wzorzec: pure helper.
function computeGhostOpacity(quality, gameYear, lastSeenYear, fadeYears) {
  if (quality === 'unknown') return { visible: false, opacity: 0 };
  if (quality === 'detailed') return { visible: true,  opacity: 1.0 };
  if (quality === 'contact')  return { visible: true,  opacity: 0.5 };
  // rumor
  const yearsAgo = Math.max(0, gameYear - lastSeenYear);
  const fade = Math.max(0, 1 - yearsAgo / fadeYears);
  const opacity = 0.3 * fade;
  if (opacity <= 0.05) return { visible: false, opacity: 0 };
  return { visible: true, opacity };
}

test('T3.1 unknown → invisible', () => {
  const r = computeGhostOpacity('unknown', 10, 5, 10);
  assertEq(r, { visible: false, opacity: 0 }, 'unknown invisible');
});

test('T3.2 contact → opacity 0.5', () => {
  const r = computeGhostOpacity('contact', 10, 5, 10);
  assertEq(r, { visible: true, opacity: 0.5 }, 'contact 0.5');
});

test('T3.3 detailed → opacity 1.0', () => {
  const r = computeGhostOpacity('detailed', 10, 5, 10);
  assertEq(r, { visible: true, opacity: 1.0 }, 'detailed full');
});

test('T3.4 rumor freshly seen (yearsAgo=0) → opacity 0.3', () => {
  const r = computeGhostOpacity('rumor', 10, 10, 10);
  assertEq(r.visible, true, 'fresh rumor visible');
  if (Math.abs(r.opacity - 0.3) > 1e-9) throw new Error(`expected 0.3, got ${r.opacity}`);
});

test('T3.5 rumor expired → hidden (≤0.05)', () => {
  // yearsAgo=10 → fade=0 → opacity=0 → hidden
  const r = computeGhostOpacity('rumor', 20, 10, 10);
  assertEq(r.visible, false, 'expired rumor hidden');
});

// ──────────────────────────────────────────────────────────────────────
// T4 — Tab cycling filter/sort/wrap (~5)
// ──────────────────────────────────────────────────────────────────────

// Replikuje logikę z UIManager.cycleSelectedVessel (filter own non-wreck,
// sort by id, wraparound).
function cycleNext(list, curId, direction) {
  if (list.length === 0) return null;
  const curIdx = curId ? list.findIndex(v => v.id === curId) : -1;
  let nextIdx;
  if (curIdx === -1) {
    nextIdx = direction === -1 ? list.length - 1 : 0;
  } else {
    const n = list.length;
    nextIdx = ((curIdx + direction) % n + n) % n;
  }
  return list[nextIdx].id;
}

function filterOwnNonWreck(vessels) {
  return [...vessels]
    .filter(v => !v.isWreck && (v.ownerEmpireId === undefined || v.ownerEmpireId === 'player'))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

test('T4.1 Filter pomija wraki i obce', () => {
  const list = filterOwnNonWreck([
    { id: 'v_001' },
    { id: 'v_002', isWreck: true },
    { id: 'v_003', ownerEmpireId: 'empire_xyz' },
    { id: 'v_004' },
  ]);
  assertEq(list.map(v => v.id), ['v_001', 'v_004'], 'own non-wreck only');
});

test('T4.2 Forward cycling z null start', () => {
  const list = filterOwnNonWreck([{ id: 'v_002' }, { id: 'v_001' }]);
  assertEq(cycleNext(list, null, 1), 'v_001', 'sort + first');
});

test('T4.3 Backward cycling z null start → last', () => {
  const list = filterOwnNonWreck([{ id: 'v_002' }, { id: 'v_001' }, { id: 'v_003' }]);
  assertEq(cycleNext(list, null, -1), 'v_003', 'backward = last');
});

test('T4.4 Forward wraparound', () => {
  const list = filterOwnNonWreck([{ id: 'v_001' }, { id: 'v_002' }]);
  assertEq(cycleNext(list, 'v_002', 1), 'v_001', 'wrap forward');
});

test('T4.5 Backward wraparound', () => {
  const list = filterOwnNonWreck([{ id: 'v_001' }, { id: 'v_002' }]);
  assertEq(cycleNext(list, 'v_001', -1), 'v_002', 'wrap backward');
});

// ──────────────────────────────────────────────────────────────────────
// T5 — MiniMap hostility colors + ETA (~5)
// ──────────────────────────────────────────────────────────────────────

// Hostility → kategoria (logika z GalacticMiniMap.hostilityColor)
function hostilityCategory(h) {
  if (h <= 30) return 'low';
  if (h <= 70) return 'medium';
  return 'high';
}

test('T5.1 Hostility 0 → low', () => {
  assertEq(hostilityCategory(0), 'low', 'h=0');
});

test('T5.2 Hostility 30 → low (border)', () => {
  assertEq(hostilityCategory(30), 'low', 'h=30');
});

test('T5.3 Hostility 31 → medium', () => {
  assertEq(hostilityCategory(31), 'medium', 'h=31');
});

test('T5.4 Hostility 71 → high', () => {
  assertEq(hostilityCategory(71), 'high', 'h=71');
});

test('T5.5 Fleet ETA computation (max 0)', () => {
  // ETA = max(0, etaYear - gameYear)
  const eta = (fEta, gy) => Math.max(0, fEta - gy);
  if (Math.abs(eta(15.5, 10) - 5.5) > 1e-9) throw new Error('eta 5.5');
  assertEq(eta(5, 10), 0, 'eta clamped to 0');
});

// ──────────────────────────────────────────────────────────────────────
// T6 — i18n PL/EN coverage (~5)
// ──────────────────────────────────────────────────────────────────────

test('T6.1 menu.radar PL', () => {
  setLocale('pl');
  assertEq(t('menu.radar'), 'Radar', 'PL menu.radar');
});

test('T6.2 menu.radar EN', () => {
  setLocale('en');
  assertEq(t('menu.radar'), 'Radar', 'EN menu.radar');
});

test('T6.3 minimap.title PL/EN różny', () => {
  setLocale('pl');
  const pl = t('minimap.title');
  setLocale('en');
  const en = t('minimap.title');
  assertTrue(pl && pl !== 'minimap.title', 'PL exists');
  assertTrue(en && en !== 'minimap.title', 'EN exists');
  assertTrue(pl !== en, 'PL !== EN');
});

test('T6.4 minimap.fleetETA interpolation', () => {
  setLocale('pl');
  const s = t('minimap.fleetETA', '4.5');
  assertTrue(s.includes('4.5'), `should contain 4.5 — got: ${s}`);
});

test('T6.5 fleet.battleHeader interpolation', () => {
  setLocale('pl');
  const s = t('fleet.battleHeader', 42);
  assertTrue(s.includes('42'), `should contain 42 — got: ${s}`);
});

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n=== M4 P2 smoke test summary ===`);
console.log(`✓ Passed: ${passed}`);
console.log(`✗ Failed: ${failed}`);
if (failures.length > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.err}`);
  }
  process.exit(1);
}
process.exit(0);
