// S3.4c Z9 — smoke: `transferColony` nie zostawia OSIEROCONYCH tickerów.
// Uruchom: node src/testing/smoke/s34c_z9_transfer_dispose_smoke.mjs
//
// ⚠ PRZEPISANY W W3-1 — ŚWIADOMIE, nie przy okazji (zapowiedziane w `W3_PLAN.md` §Tests).
//
// Z9 powstał, żeby domknąć bliźniaczy leak do `removeColony` (Z4/Z5): przejęta kolonia
// opuszczała `_colonies`, a jej pięć subsystemów tykało dalej w próżni. Lekarstwem był
// wtedy `dispose() × 5`.
//
// W3-1 (orzeczenie właściciela D7 „PRZEGRANA JEST ODWRACALNA") zmienił PRZESŁANKĘ, a nie
// tylko implementację: kolonia NIE opuszcza już `_colonies` — zmienia właściciela w miejscu
// i żyje dalej jako zwykła kolonia AI. Skoro nie jest osierocona, to nie ma czego rozłączać;
// `dispose × 5` wycięłoby produkcję, którą zdobywca ma właśnie przejąć.
//
// DLATEGO TEN KEEPER PILNUJE TEJ SAMEJ WŁASNOŚCI, WYRAŻONEJ WPROST:
//   „żaden subsystem subskrybujący `time:tick` nie należy do kolonii spoza `_colonies`".
// Stary zapis („dispose został wywołany") był PROXY tej własności, prawdziwym tylko dopóki
// przejęcie oznaczało kasowanie. Nowy zapis mierzy ją bezpośrednio, więc przeżyje kolejną
// zmianę modelu własności.
//
//   1  pięć subsystemów subskrybuje time:tick
//   2  przejęcie: kolonia ZOSTAJE, dostaje ownerEmpireId (INWERSJA vs pre-W3-1)
//   3  ŻADEN dispose nie został wywołany (INWERSJA)
//   4  listenery zostają — i to NIE jest leak: właściciel każdego z nich jest w `_colonies`
//   5  payload `colony:captured` nadal niesie poprawny snapshot (BEZ ZMIAN)
//   6  KONTROLA: `removeColony` (prawdziwe zniszczenie) NADAL disposuje wszystkie pięć

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
  cs.population = 42;   // do weryfikacji snapshotu payloadu (kolejność mutacji vs emit)
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
// `addColony` (abstrakcyjny wpis); brak `getColoniesByEmpire` ⇒ resolver tech imperium
// (`_findEmpireTechSystem`) zwraca null swoim własnym guardem — świadomie, bo ten keeper
// mierzy CYKL ŻYCIA subsystemów, nie przepięcie drzewa tech (to robi w3_conquest_persists).
window.KOSMOS.empireRegistry = { addColony: () => true };

const techMock = { isResearched: () => true };
const cm = new ColonyManager(techMock);
const base = tickCount();   // baseline PO konstrukcji ColonyManager (jego własny listener wliczony)

const { colony, disposed } = makeRichColony('p_capture');
cm._colonies.set('p_capture', colony);

// ══ 1. Subskrypcje przed przejęciem ═══════════════════════════════════════════════════════════════
T('1.1 5 subsystemów dodało 5 listenerów time:tick', tickCount() === base + 5);
T('1.2 kolonia jest w _colonies', cm._colonies.has('p_capture'));

// ══ 2. Akt: przejęcie kolonii przez AI (ścieżka InvasionSystem → transferColony) ═══════════════════
let captured = null;
const offCap = EventBus.on('colony:captured', (e) => { captured = e; });
const ok = cm.transferColony('p_capture', 'empire_ai', 'invasion');
EventBus.off('colony:captured', offCap);

T('2.1 transferColony zwróciło true', ok === true);
T('2.2 kolonia ZOSTAJE w _colonies (INWERSJA W3-1 — dawniej była kasowana)',
  cm._colonies.has('p_capture'));
T('2.3 …i ma nowego właściciela — to jest cały transfer', colony.ownerEmpireId === 'empire_ai');
T('2.4 …więc znika z listy GRACZA', !cm.getPlayerColonies().some(c => c.planetId === 'p_capture'));

// ══ 3. Żaden dispose NIE został wywołany (INWERSJA) ════════════════════════════════════════════════
T('3.1 factorySystem.dispose() NIE wywołany', disposed.fs === false);
T('3.2 resourceSystem.dispose() NIE wywołany', disposed.rs === false);
T('3.3 civSystem.dispose() NIE wywołany', disposed.cs === false);
T('3.4 buildingSystem.dispose() NIE wywołany', disposed.bs === false);
T('3.5 prosperitySystem.dispose() NIE wywołany', disposed.ps === false);

// ══ 4. Listenery zostają — i to NIE jest leak (właściwa własność Z9) ═══════════════════════════════
T('4.1 5 listenerów time:tick dalej działa (produkcja zdobyczy ma tykać)', tickCount() === base + 5);
T('4.2 ⚠ ISTOTA Z9: właściciel tych listenerów JEST w _colonies — nie ma sieroty',
  cm._colonies.has(colony.planetId) && cm.getColony('p_capture') === colony);
T('4.3 orphan-guard FactorySystem nie ma się o co zaczepić (kolonia rozwiązywalna po id)',
  cm.getColony('p_capture')?.factorySystem === colony.factorySystem);

// ══ 5. Kolejność bezpieczna: payload emitu ma poprawny snapshot ════════════════════════════════════
T('5.1 colony:captured.population = 42 (snapshot sprzed mutacji)', captured?.population === 42);
T('5.2 colony:captured.colonyName = TestColony', captured?.colonyName === 'TestColony');
T('5.3 colony:captured.newOwner = empire_ai', captured?.newOwner === 'empire_ai');

// ══ 6. KONTROLA PINU: prawdziwe ZNISZCZENIE nadal disposuje wszystkie pięć ═════════════════════════
// Bez tego „dispose nie został wywołany" w §3 byłoby nieodróżnialne od zepsutej ścieżki dispose.
const { colony: doomed, disposed: dDisposed } = makeRichColony('p_doomed');
cm._colonies.set('p_doomed', doomed);
const beforeDoom = tickCount();
cm.removeColony('p_doomed', 'test');
T('6.1 removeColony usuwa kolonię z _colonies', !cm._colonies.has('p_doomed'));
T('6.2 …i disposuje WSZYSTKIE pięć subsystemów (ścieżka Z4/Z5 nietknięta)',
  dDisposed.fs && dDisposed.rs && dDisposed.cs && dDisposed.bs && dDisposed.ps);
T('6.3 …a licznik listenerów wraca dokładnie o 5 w dół', tickCount() === beforeDoom - 5);

console.log(`\nS3.4c Z9 (W3-1) transferColony lifecycle smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
