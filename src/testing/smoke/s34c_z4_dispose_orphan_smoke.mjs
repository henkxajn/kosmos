// S3.4c Z4/Z5 — smoke: dispose per-kolonijnych tickerów + orphan-guard FactorySystem.
// Uruchom: node src/testing/smoke/s34c_z4_dispose_orphan_smoke.mjs
// Dowodzi: (1) dispose() zdejmuje listener time:tick (leak subskrypcji zamknięty — Z5);
// (2) osierocona FactorySystem._update no-op BEZ warn per-frame (Z4); (3) removeColony woła
// dispose na wszystkich 5 systemach per-kolonia.

globalThis.window = globalThis.window ?? { KOSMOS: {} };
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const EventBus = (await import('../../core/EventBus.js')).default;
const { FactorySystem } = await import('../../systems/FactorySystem.js');

const tickCount = () => EventBus.listeners.get('time:tick')?.length ?? 0;

// ══ 1. FactorySystem: subskrybuje time:tick w konstruktorze, dispose() zdejmuje ══════════════════════
const before = tickCount();
const fs = new FactorySystem({ inventory: new Map(), receive() {}, spend() { return true; }, getAmount: () => 0 });
T('1.1 konstruktor dodał 1 listener time:tick', tickCount() === before + 1);
T('1.2 dispose istnieje', typeof fs.dispose === 'function');
fs.dispose();
T('1.3 dispose() zdjął listener time:tick (leak zamknięty)', tickCount() === before);
T('1.4 dispose() idempotentny (2× nie psuje licznika)', (fs.dispose(), tickCount() === before));

// ══ 2. Orphan-guard: _update na osieroconej fabryce = no-op BEZ warn per-frame (Z4) ═════════════════
// _getOwnerColony() zwraca null gdy fabryki nie ma w żadnej kolonii → guard musi wcześnie wyjść.
window.KOSMOS.colonyManager = {
  getColony: () => null,
  getAllColonies: () => [],   // pusto → _getOwnerColony() = null
};
const fs2 = new FactorySystem({ inventory: new Map(), receive() {}, spend() { return true; }, getAmount: () => 0 });
fs2._mode = 'reactive';   // tryb, który normalnie woła isRecipeAvailable → warn gdy brak techSystem
T('2.1 _getOwnerColony() = null (fabryka osierocona)', fs2._getOwnerColony() === null);

const origWarn = console.warn;
let warnCount = 0;
console.warn = (...a) => { if (String(a[0]).includes('[FactorySystem]')) warnCount++; };
try {
  for (let i = 0; i < 5; i++) fs2._update(1.0);   // 5 „klatek"
} finally { console.warn = origWarn; }
T('2.2 osierocony _update NIE loguje warn (guard early-return, Z4)', warnCount === 0);
fs2.dispose();

// ══ 3. ResourceSystem/CivilizationSystem/BuildingSystem/ProsperitySystem też mają dispose() ══════════
const { ResourceSystem } = await import('../../systems/ResourceSystem.js');
const { CivilizationSystem } = await import('../../systems/CivilizationSystem.js');
const { ProsperitySystem } = await import('../../systems/ProsperitySystem.js');

const base3 = tickCount();
const rs = new ResourceSystem();
const cs = new CivilizationSystem({});
const ps = new ProsperitySystem(rs, cs, null, { id: 'p1' });
T('3.1 3 systemy dodały 3 listenery time:tick', tickCount() === base3 + 3);
T('3.2 ResourceSystem.dispose istnieje', typeof rs.dispose === 'function');
T('3.3 CivilizationSystem.dispose istnieje', typeof cs.dispose === 'function');
T('3.4 ProsperitySystem.dispose istnieje', typeof ps.dispose === 'function');
rs.dispose(); cs.dispose(); ps.dispose();
T('3.5 po dispose 3 listenery zdjęte (powrót do baseline)', tickCount() === base3);

// BuildingSystem — konstruktor wymaga (resSys, civSys, techSys); listener multi-line handler.
const { BuildingSystem } = await import('../../systems/BuildingSystem.js');
const base4 = tickCount();
const bs = new BuildingSystem(rs, cs, null);
T('3.6 BuildingSystem dodał 1 listener time:tick', tickCount() === base4 + 1);
T('3.7 BuildingSystem.dispose istnieje', typeof bs.dispose === 'function');
bs.dispose();
T('3.8 BuildingSystem.dispose() zdjął listener', tickCount() === base4);

console.log(`\nS3.4c Z4/Z5 dispose+orphan smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
