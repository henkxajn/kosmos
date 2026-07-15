// S3.4c Z9 (S-BACKLOG) — smoke: transferColony disposuje 5 per-kolonijnych tickerów.
// Uruchom: node src/testing/smoke/s34c_z9_transfer_dispose_smoke.mjs
// Dowodzi: bliźniaczy leak do removeColony (Z4/Z5) domknięty — przejęcie kolonii przez AI
// (InvasionSystem → transferColony) zdejmuje listener time:tick z WSZYSTKICH 5 subsystemów
// (factory/resource/civ/building/prosperity), zamiast zostawić je tykające w tle (jałowa
// praca + leak subskrypcji, dziś tylko wyciszone orphan-guardem w FactorySystem).
// Wzorzec setupu: s34c_z4_dispose_orphan_smoke.mjs + s34d_hull_gating_smoke.mjs.

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
const { ResourceSystem } = await import('../../systems/ResourceSystem.js');
const { CivilizationSystem } = await import('../../systems/CivilizationSystem.js');
const { BuildingSystem } = await import('../../systems/BuildingSystem.js');
const { FactorySystem } = await import('../../systems/FactorySystem.js');
const { ProsperitySystem } = await import('../../systems/ProsperitySystem.js');
const cmMod = await import('../../systems/ColonyManager.js');
const ColonyManager = cmMod.ColonyManager ?? cmMod.default;

const tickCount = () => EventBus.listeners.get('time:tick')?.length ?? 0;
const makeStore = () => ({ inventory: new Map(), receive() {}, spend() { return true; }, getAmount: () => 0 });

// Kolonia z 5 PRAWDZIWYMI subsystemami (realne subskrypcje time:tick) + szpieg na dispose.
function makeRichColony(planetId) {
  const rs = new ResourceSystem();
  const cs = new CivilizationSystem({});
  const fs = new FactorySystem(makeStore());
  const bs = new BuildingSystem(rs, cs, null);
  const ps = new ProsperitySystem(rs, cs, null, { id: planetId });
  cs.population = 42;   // do weryfikacji snapshotu payloadu (kolejność dispose vs emit)
  const colony = {
    name: 'TestColony', planetId, isHomePlanet: false, isOutpost: false, fleet: [],
    resourceSystem: rs, civSystem: cs, factorySystem: fs, buildingSystem: bs, prosperitySystem: ps,
  };
  const disposed = { fs: false, rs: false, cs: false, bs: false, ps: false };
  for (const [key, sys] of [['fs', fs], ['rs', rs], ['cs', cs], ['bs', bs], ['ps', ps]]) {
    const orig = sys.dispose.bind(sys);
    sys.dispose = () => { disposed[key] = true; return orig(); };
  }
  return { colony, disposed };
}

// ── Setup: minimalne mocki KOSMOS których dotyka transferColony ──
// empireRegistry.addColony (abstrakcyjny wpis); vesselManager/homePlanet/galaxyData nieobecne
// (fleet pusty → brak niszczenia statków; activePlanetId=null → brak switchActiveColony).
window.KOSMOS.empireRegistry = { addColony: () => true };

const techMock = { isResearched: () => true };
const cm = new ColonyManager(techMock);
const base = tickCount();   // baseline PO konstrukcji ColonyManager (jego własny listener time:tick wliczony)

const { colony, disposed } = makeRichColony('p_capture');
cm._colonies.set('p_capture', colony);

// ══ 1. Subskrypcje przed przejęciem ═══════════════════════════════════════════════════════════════
T('1.1 5 subsystemów dodało 5 listenerów time:tick', tickCount() === base + 5);
T('1.2 kolonia jest w _colonies', cm._colonies.has('p_capture'));

// ══ 2. Akt: przejęcie kolonii przez AI (ścieżka InvasionSystem._captureColony) ═════════════════════
let captured = null;
const offCap = EventBus.on('colony:captured', (e) => { captured = e; });
const ok = cm.transferColony('p_capture', 'empire_ai', 'invasion');
EventBus.off('colony:captured', offCap);

T('2.1 transferColony zwróciło true', ok === true);
T('2.2 kolonia usunięta z _colonies', !cm._colonies.has('p_capture'));

// ══ 3. Wszystkie 5 dispose() wywołane przez transferColony ═════════════════════════════════════════
T('3.1 factorySystem.dispose() wywołany', disposed.fs === true);
T('3.2 resourceSystem.dispose() wywołany', disposed.rs === true);
T('3.3 civSystem.dispose() wywołany', disposed.cs === true);
T('3.4 buildingSystem.dispose() wywołany', disposed.bs === true);
T('3.5 prosperitySystem.dispose() wywołany', disposed.ps === true);

// ══ 4. Licznik time:tick zamrożony — 5 listenerów zdjętych, leak zamknięty ═════════════════════════
T('4.1 powrót do baseline (5 listenerów time:tick usuniętych)', tickCount() === base);
T('4.2 dokładnie 5 usunięto (dowód że to fix, nie no-op)', (base + 5) - tickCount() === 5);
T('4.3 własny listener ColonyManager NIENARUSZONY (nie przedozowano dispose)', tickCount() === base && base >= 1);

// ══ 5. Kolejność bezpieczna (pkt 2 audytu): payload emitu ma poprawny snapshot mimo dispose ═════════
T('5.1 colony:captured.population = 42 (snapshot przed dispose)', captured?.population === 42);
T('5.2 colony:captured.colonyName = TestColony (snapshot przed dispose)', captured?.colonyName === 'TestColony');
T('5.3 colony:captured.newOwner = empire_ai', captured?.newOwner === 'empire_ai');

// ══ 6. Idempotencja: dispose 2× (gdyby transfer trafił na już-rozłączony subsystem) nie psuje ══════
colony.factorySystem.dispose();
colony.resourceSystem.dispose();
T('6.1 podwójny dispose nie schodzi poniżej baseline', tickCount() === base);

console.log(`\nS3.4c Z9 transferColony dispose smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
