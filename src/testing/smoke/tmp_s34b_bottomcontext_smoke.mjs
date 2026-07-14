// Smoke — BottomContext C2 (S3.4b): ▼ minimalizuje do doku (nie in-place) + restore + close.
// hitTest sterowany wstrzykniętymi _hitZones (pomijamy canvas draw); PanelDock zamockowany.
// Uruchom: node src/testing/smoke/tmp_s34b_bottomcontext_smoke.mjs
globalThis.window = globalThis.window || {};
globalThis.window.KOSMOS = globalThis.window.KOSMOS || {};
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = globalThis.document || {
  createElement: () => ({ style: {}, addEventListener() {}, appendChild() {}, set innerHTML(_v) {} }),
  body: { appendChild() {} },
};

// Mock PanelDock (rejestr belek)
const dock = new Map();
globalThis.window.KOSMOS.panelDock = {
  register(key, e) { dock.set(key, e); },
  unregister(key) { dock.delete(key); },
  has(key) { return dock.has(key); },
  get(key) { return dock.get(key) ?? null; },
};

const { BottomContext } = await import('../../ui/BottomContext.js');
const EventBus = (await import('../../core/EventBus.js')).default;

let pass = 0, fail = 0;
const ok = (l, c) => { if (c) { pass++; } else { fail++; console.log(`  FAIL ${l}`); } };

const bc = new BottomContext();
const ent = { name: 'Kepler-X', type: 'planet', id: 'p_kx' };

ok('start: nie zminimalizowany', bc._minimized === false);

// ── ▼ → dokowanie (nie in-place) ──
bc._slideProgress = 1;
bc._hitZones = [{ x: 0, y: 0, w: 16, h: 16, type: 'minimize' }];
bc.hitTest(8, 8, 1280, 720, ent);
ok('klik ▼ → zminimalizowany', bc._minimized === true);
ok('klik ▼ → belka w doku (body:p_kx)', dock.has('body:p_kx'));
ok('belka: label = nazwa encji', dock.get('body:p_kx')?.label === 'Kepler-X');
ok('belka: ma onRestore', typeof dock.get('body:p_kx')?.onRestore === 'function');

// ── restore (klik belki → onRestore) → un-minimize + belka zdjęta ──
dock.get('body:p_kx').onRestore();
ok('restore → un-minimized', bc._minimized === false);
ok('restore → belka zdjęta', !dock.has('body:p_kx'));

// ── body:selected (klik ciała 3D) un-minimizuje + zdejmuje belkę ──
bc._minimized = true;
dock.set('body:p_kx', { label: 'Kepler-X' });
EventBus.emit('body:selected', { entity: ent });
ok('body:selected → un-minimized', bc._minimized === false);
ok('body:selected → belka zdjęta', !dock.has('body:p_kx'));

// ── #2 (review) — usunięcie encji z symulacji zdejmuje osieroconą belkę ──
bc._minimized = true;
bc._prevEntity = ent;
dock.set('body:p_kx', { label: 'Kepler-X' });
EventBus.emit('entity:removed', { entity: ent });
ok('entity:removed → belka zdjęta', !dock.has('body:p_kx'));
ok('entity:removed → prevEntity wyczyszczony', bc._prevEntity === null);
ok('entity:removed → un-minimized', bc._minimized === false);

// ── close (−) → body:deselected + pochłonięcie ──
let deselected = false;
EventBus.on('body:deselected', () => { deselected = true; });
bc._minimized = false;
bc._hitZones = [{ x: 0, y: 0, w: 16, h: 16, type: 'close' }];
const consumed = bc.hitTest(8, 8, 1280, 720, ent);
ok('klik − → body:deselected', deselected === true);
ok('klik − pochłonięty (return true)', consumed === true);

console.log(`\nS3.4b BottomContext dock smoke: ${pass}/${pass + fail} ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail ? 1 : 0);
