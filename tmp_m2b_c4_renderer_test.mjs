// Smoke test M2b Commit 4 — ThreeRenderer prediction cone rendering (lifecycle + flag gate)
//
// Strategia (zgodnie z planem, lekcja L1): instancjacja ThreeRenderer wymaga
// `import 'three'` z CDN — niedostępne w Node. Test pokrywa tylko core logic
// `_syncPredictionCones` jako standalone replika (z mock THREE/scene/vMgr/GAME_CONFIG).
// Math (rotation/scale) NIE testowane — visual review (SS1 Filip) pokrywa to
// na żywo (3-liniowa formuła, screen pokaże od razu czy działa).
//
// Pokrywa:
//   T1 lifecycle filtering — vMgr z 5 vesselami + 2 multi-run cases (~7 cases)
//   T3 flag gate — anti-pattern proof per L1 (~2 cases)
//
// Run: node tmp_m2b_c4_renderer_test.mjs

// ── Stub browser globals (PRZED importami) ─────────────────────────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {
  vesselManager: null,  // per-test
};

// ── Imports (real GAME_CONFIG dla flag gate proof) ─────────────────────────
const { GAME_CONFIG } = await import('./src/config/GameConfig.js');

// ── Mock THREE namespace (minimalne stuby) ─────────────────────────────────
const disposed = { geom: 0, mat: 0 };
function makeDisposable(kind) {
  return { dispose: () => { disposed[kind]++; } };
}
const THREE = {
  Vector3: function (x, y, z) { return { x, y, z }; },
  BufferGeometry: function () {
    const obj = makeDisposable('geom');
    obj.setFromPoints = (pts) => { obj._pts = pts; return obj; };
    obj.setIndex = (idx) => { obj._idx = idx; return obj; };
    return obj;
  },
  Mesh: function (geom, mat) { return { geometry: geom, material: mat, type: 'Mesh' }; },
  Line: function (geom, mat) { return { geometry: geom, material: mat, type: 'Line' }; },
  Group: function () { return { children: [], add: function (c) { this.children.push(c); }, type: 'Group' }; },
  MeshBasicMaterial: function (opts) { const m = makeDisposable('mat'); Object.assign(m, opts); return m; },
  LineBasicMaterial: function (opts) { const m = makeDisposable('mat'); Object.assign(m, opts); return m; },
  DoubleSide: 'DoubleSide',
};

// ── Mock scene (capture add/remove) ────────────────────────────────────────
function makeScene() {
  const ops = [];
  return {
    _ops: ops,
    add:    (obj) => ops.push({ kind: 'add',    obj }),
    remove: (obj) => ops.push({ kind: 'remove', obj }),
    countAdds:    () => ops.filter(o => o.kind === 'add').length,
    countRemoves: () => ops.filter(o => o.kind === 'remove').length,
  };
}

// ── REPLIKA logiki produkcji (ThreeRenderer.js) ────────────────────────────
// Trzymane synchronicznie z produkcją. Jeśli plan się zmieni — zmień tu też.
const PREDICTION_CONE_FILL_COLOR = 0x00ffff;
const PREDICTION_CONE_FILL_ALPHA = 0.15;
const PREDICTION_CONE_LINE_COLOR = 0x00ffff;
const PREDICTION_CONE_LINE_ALPHA = 0.6;
const PREDICTION_CONE_BASE_ANGLE = 0.5;
const PREDICTION_CONE_Y          = 0.05;
const AU          = GAME_CONFIG.AU_TO_PX;
const WORLD_SCALE = 10;
const S = (v) => v / WORLD_SCALE;

function makeRenderer() {
  const scene = makeScene();
  const r = {
    scene,
    _predictionConeMeshes: new Map(),
    _disposeAllPredictionCones() {
      for (const id of [...this._predictionConeMeshes.keys()]) {
        this._disposePredictionCone(id);
      }
    },
    _disposePredictionCone(vesselId) {
      const entry = this._predictionConeMeshes.get(vesselId);
      if (!entry) return;
      this.scene.remove(entry.group);
      entry.fillMesh.geometry.dispose();
      entry.fillMesh.material.dispose();
      entry.lineMesh.geometry.dispose();
      entry.lineMesh.material.dispose();
      this._predictionConeMeshes.delete(vesselId);
    },
    _createPredictionConeMesh() {
      const tan = Math.tan(PREDICTION_CONE_BASE_ANGLE);
      const v0 = new THREE.Vector3(0, 0, 0);
      const v1 = new THREE.Vector3( tan, 0, 1);
      const v2 = new THREE.Vector3(-tan, 0, 1);
      const fillGeom = new THREE.BufferGeometry().setFromPoints([v0, v1, v2]);
      fillGeom.setIndex([0, 1, 2]);
      const fillMat = new THREE.MeshBasicMaterial({
        color: PREDICTION_CONE_FILL_COLOR, transparent: true,
        opacity: PREDICTION_CONE_FILL_ALPHA, side: THREE.DoubleSide, depthWrite: false,
      });
      const fillMesh = new THREE.Mesh(fillGeom, fillMat);
      const lineGeom = new THREE.BufferGeometry().setFromPoints([v0, v1, v2, v0]);
      const lineMat = new THREE.LineBasicMaterial({
        color: PREDICTION_CONE_LINE_COLOR, transparent: true,
        opacity: PREDICTION_CONE_LINE_ALPHA,
      });
      const lineMesh = new THREE.Line(lineGeom, lineMat);
      const group = new THREE.Group();
      group.add(fillMesh);
      group.add(lineMesh);
      return { fillMesh, lineMesh, group };
    },
    _updatePredictionConeTransform(entry, cone) {
      // No-op dla testu: rotation/scale to dane na obiekcie group, ale test tego nie weryfikuje.
      // Zachowujemy stub żeby _upsertPredictionCone nie crashował.
      entry.group._lastTransform = {
        position: { x: S(cone.originX), y: PREDICTION_CONE_Y, z: S(cone.originY) },
        rotationY: Math.atan2(cone.dirX, cone.dirY),
        scale: { x: cone.angleWidth / PREDICTION_CONE_BASE_ANGLE, y: 1, z: S(cone.rangeAU * AU) },
      };
    },
    _upsertPredictionCone(vesselId, cone) {
      let entry = this._predictionConeMeshes.get(vesselId);
      if (!entry) {
        entry = this._createPredictionConeMesh();
        this.scene.add(entry.group);
        this._predictionConeMeshes.set(vesselId, entry);
      }
      this._updatePredictionConeTransform(entry, cone);
    },
    _syncPredictionCones() {
      if (!GAME_CONFIG.FEATURES.predictionCone) {
        if (this._predictionConeMeshes.size > 0) this._disposeAllPredictionCones();
        return;
      }
      const vMgr = window.KOSMOS?.vesselManager;
      if (!vMgr) return;
      const activeIds = new Set();
      for (const v of vMgr._vessels.values()) {
        const order = v.movementOrder;
        if (!order) continue;
        if (order.type !== 'intercept') continue;
        if (order.status !== 'active') continue;
        if (!order.predictionCone) continue;
        if (v.isWreck) continue;
        activeIds.add(v.id);
        this._upsertPredictionCone(v.id, order.predictionCone);
      }
      for (const id of [...this._predictionConeMeshes.keys()]) {
        if (!activeIds.has(id)) this._disposePredictionCone(id);
      }
    },
  };
  return r;
}

// ── Helpers do tworzenia mock vesseli ──────────────────────────────────────
function makeCone(opts = {}) {
  return {
    originX: 0, originY: 0, dirX: 1, dirY: 0,
    angleWidth: 0.3, rangeAU: 5, confidence: 0.5, updatedYear: 0,
    ...opts,
  };
}
function makeVessel(id, overrides = {}) {
  return { id, isWreck: false, movementOrder: null, ...overrides };
}
function makeVMgr(vesselArr) {
  const m = new Map();
  for (const v of vesselArr) m.set(v.id, v);
  return { _vessels: m };
}

// ── Test harness ───────────────────────────────────────────────────────────
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
  if (!cond) throw new Error(`${label}: expected true, got false`);
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — lifecycle filtering
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T1 — Lifecycle filtering w _syncPredictionCones]');

test('T1.1 active intercept + cone + !wreck → mesh upsert (scene.add wołane)', () => {
  GAME_CONFIG.FEATURES.predictionCone = true;
  const r = makeRenderer();
  const v = makeVessel('v_1', {
    movementOrder: { type: 'intercept', status: 'active', predictionCone: makeCone() },
  });
  window.KOSMOS.vesselManager = makeVMgr([v]);
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 1, 'map size');
  assertTrue(r._predictionConeMeshes.has('v_1'), 'has v_1 entry');
  assertEq(r.scene.countAdds(), 1, 'scene.add count');
  assertEq(r.scene.countRemoves(), 0, 'scene.remove count');
});

test('T1.2 vessel bez movementOrder → brak entry', () => {
  GAME_CONFIG.FEATURES.predictionCone = true;
  const r = makeRenderer();
  window.KOSMOS.vesselManager = makeVMgr([makeVessel('v_2')]);
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 0, 'map size');
  assertEq(r.scene.countAdds(), 0, 'scene.add count');
});

test('T1.3 order.type=pursue → brak entry (filter type)', () => {
  GAME_CONFIG.FEATURES.predictionCone = true;
  const r = makeRenderer();
  const v = makeVessel('v_3', {
    movementOrder: { type: 'pursue', status: 'active', predictionCone: makeCone() },
  });
  window.KOSMOS.vesselManager = makeVMgr([v]);
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 0, 'map size');
});

test('T1.4 order.status=cancelled → brak entry (filter status)', () => {
  GAME_CONFIG.FEATURES.predictionCone = true;
  const r = makeRenderer();
  const v = makeVessel('v_4', {
    movementOrder: { type: 'intercept', status: 'cancelled', predictionCone: makeCone() },
  });
  window.KOSMOS.vesselManager = makeVMgr([v]);
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 0, 'map size');
});

test('T1.5 isWreck=true mimo active intercept → brak entry (safety)', () => {
  GAME_CONFIG.FEATURES.predictionCone = true;
  const r = makeRenderer();
  const v = makeVessel('v_5', {
    isWreck: true,
    movementOrder: { type: 'intercept', status: 'active', predictionCone: makeCone() },
  });
  window.KOSMOS.vesselManager = makeVMgr([v]);
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 0, 'map size');
});

test('T1.6 cancellacja w drugim runie → mesh removed (scene.remove + dispose)', () => {
  GAME_CONFIG.FEATURES.predictionCone = true;
  disposed.geom = 0; disposed.mat = 0;
  const r = makeRenderer();
  const v = makeVessel('v_6', {
    movementOrder: { type: 'intercept', status: 'active', predictionCone: makeCone() },
  });
  window.KOSMOS.vesselManager = makeVMgr([v]);
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 1, 'map size after first sync');
  // Drugi run — order cancelled
  v.movementOrder.status = 'cancelled';
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 0, 'map size after second sync');
  assertEq(r.scene.countRemoves(), 1, 'scene.remove wołane');
  // 2 BufferGeometry (fill + line) + 2 Material (MeshBasic + LineBasic) per cone
  assertEq(disposed.geom, 2, 'oba geometry disposed (fill + line)');
  assertEq(disposed.mat, 2, 'oba material disposed (fill + line)');
});

test('T1.7 active w drugim runie → ten sam entry reużywany (no nowe scene.add)', () => {
  GAME_CONFIG.FEATURES.predictionCone = true;
  const r = makeRenderer();
  const v = makeVessel('v_7', {
    movementOrder: { type: 'intercept', status: 'active', predictionCone: makeCone() },
  });
  window.KOSMOS.vesselManager = makeVMgr([v]);
  r._syncPredictionCones();
  const firstEntry = r._predictionConeMeshes.get('v_7');
  // Drugi run — cone update (różne dirX/rangeAU)
  v.movementOrder.predictionCone = makeCone({ dirX: 0, dirY: 1, rangeAU: 8 });
  r._syncPredictionCones();
  const secondEntry = r._predictionConeMeshes.get('v_7');
  assertTrue(firstEntry === secondEntry, 'entry identity preserved (mesh reuse)');
  assertEq(r.scene.countAdds(), 1, 'scene.add wołane TYLKO raz');
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — flag gate (anti-pattern proof per L1)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T3 — Flag gate]');

test('T3.1 flag=false z aktywnym mesh → _disposeAllPredictionCones, size=0', () => {
  GAME_CONFIG.FEATURES.predictionCone = true;
  const r = makeRenderer();
  const v = makeVessel('v_8', {
    movementOrder: { type: 'intercept', status: 'active', predictionCone: makeCone() },
  });
  window.KOSMOS.vesselManager = makeVMgr([v]);
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 1, 'preflight: mesh utworzony');
  // Flip flag — proof imported singleton (NIE window.GAME_CONFIG)
  GAME_CONFIG.FEATURES.predictionCone = false;
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 0, 'mesh disposed po flip');
  assertEq(r.scene.countRemoves(), 1, 'scene.remove wołane');
});

test('T3.2 flag=false z pustą mapą → no-op (brak operacji)', () => {
  GAME_CONFIG.FEATURES.predictionCone = false;
  const r = makeRenderer();
  window.KOSMOS.vesselManager = makeVMgr([]);
  r._syncPredictionCones();
  assertEq(r._predictionConeMeshes.size, 0, 'map size');
  assertEq(r.scene.countAdds(), 0, 'scene.add count');
  assertEq(r.scene.countRemoves(), 0, 'scene.remove count');
});

// Reset flagi do trues (zostawiamy GAME_CONFIG w stanie predictionCone=true jak default M2b C3+)
GAME_CONFIG.FEATURES.predictionCone = true;

// ──────────────────────────────────────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failures.length > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.err.stack ?? f.err.message}`);
  }
  process.exit(1);
}
console.log('All M2b C4 smoke tests PASSED ✅');
