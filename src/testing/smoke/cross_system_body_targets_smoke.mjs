// KEEPER — d1 (Finding 254, wariant jednoslice'owy): transport MOŻE celować w dowolne ciało
// obcego układu, ale WYŁĄCZNIE w układzie JUŻ WYGENEROWANYM.
//
// CO PINUJE (i dlaczego akurat to)
// Gałąź cross-system `_getValidTargets` dopuszczała wyłącznie POSIADŁOŚCI gracza
// (`if (!col || col.ownerEmpireId !== 'player') continue`), a `_maybeDeliver` re-walidował cel
// jako kolonię/stację (`targetAlive`). Przez to nie dało się wysłać ładunku na ciało, przy którym
// gracz już był, ale niczego nie postawił — mimo że `_startForeignUnload` na miejscu zakłada
// z tego cargo placówkę.
//
// ⚠ MGŁA WOJNY JEST GRANICĄ TEGO SLICE'U, NIE OZDOBĄ. Ciała układu NIEODWIEDZONEGO nie istnieją
//   (`getByTypeInSystem` → 0), a wygenerowanie ich po to, żeby je WYLISTOWAĆ, oddałoby graczowi
//   spis ciał nieskanowanego układu — czyli otworzyłoby ponownie Finding 186 innymi drzwiami.
//   Repo ma na to jawny rozdział: `peekCountsForStar` (LICZBY, bez encji) vs `generateAndRegister`
//   (encje). Predykat `starSystemManager.getSystem(sysId) != null` trzyma nas po stronie „liczby".
//
// D1-1 PIN  (+) — ciało `explored:false` w układzie WYGENEROWANYM JEST celem transportu
// D1-2 PIN  (+) — `_maybeDeliver` PRZYJMUJE takie ciało (dostawa rusza)
// D1-3 PIN FOG — ciało układu NIEWYGENEROWANEGO jest NIEOBECNE w pickerze
// D1-4 PIN FOG — `_maybeDeliver` ODMAWIA takiego celu (`order:compositeFailed`)
// D1-5 PIN FOG — odpytanie o cele NIE REJESTRUJE ANI JEDNEJ nowej encji (anty-eager)
// D1-6 KONTROLA — kolonia AI w obcym układzie DALEJ nie jest celem transportu (granica S3.5b)
// D1-7 KONTROLA — `transport_passenger` DALEJ wymaga kolonii (POPy bez housingu przepadają)
// D1-8 KONTROLA — kolonia GRACZA cross-system dalej jest celem (nic nie zabraliśmy)
//
// Uruchom: node src/testing/smoke/cross_system_body_targets_smoke.mjs

globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  body: { appendChild() {}, removeChild() {} }, addEventListener() {},
};
globalThis.localStorage = {
  _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }, key(i) { return Object.keys(this._s)[i] ?? null; },
  get length() { return Object.keys(this._s).length; },
};

const EventBus              = (await import('../../core/EventBus.js')).default;
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');
const { OrderService }      = await import('../../systems/OrderService.js');
const { GAME_CONFIG }       = await import('../../config/GameConfig.js');

const AU = GAME_CONFIG.AU_TO_PX;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n--- ' + s + ' ---');

// ── Świat: 3 układy. GEN_A + HOME wygenerowane; NEVER — NIE (nigdy nieodwiedzony) ─────────────
EntityManager.clear();
EntityManager.add({ id: 'star_home', type: 'star', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
EntityManager.add({ id: 'p_home', type: 'planet', systemId: 'sys_home', x: 2 * AU, y: 0, name: 'Dom', explored: true,
  orbital: { a: 2, e: 0.01, M: 0.3, T: 2.8, inclinationOffset: 0 } });
// Układ WYGENEROWANY, ale ciała NIEZBADANE — to jest scenariusz „byłem tam raz".
EntityManager.add({ id: 'star_gen', type: 'star', systemId: 'sys_gen', x: 0, y: 0, mass: 1 });
EntityManager.add({ id: 'p_gen_bare', type: 'planet', systemId: 'sys_gen', x: 3 * AU, y: 0, name: 'Phact c', explored: false,
  planetType: 'rocky', orbital: { a: 3, e: 0.01, M: 1.1, T: 5.2, inclinationOffset: 0 } });
EntityManager.add({ id: 'p_gen_player', type: 'planet', systemId: 'sys_gen', x: 4 * AU, y: 0, name: 'Moja', explored: true,
  planetType: 'rocky', orbital: { a: 4, e: 0.01, M: 0.5, T: 8, inclinationOffset: 0 } });
EntityManager.add({ id: 'p_gen_ai', type: 'planet', systemId: 'sys_gen', x: 5 * AU, y: 0, name: 'Obca', explored: true,
  planetType: 'rocky', orbital: { a: 5, e: 0.01, M: 0.9, T: 11, inclinationOffset: 0 } });
// ⚠ sys_never NIE MA ANI JEDNEJ ENCJI — dokładnie tak wygląda układ nigdy nieodwiedzony.

const GALAXY = { systems: [
  { id: 'sys_home',  name: 'Dom',   x: 0, y: 0, z: 0, isHome: true },
  { id: 'sys_gen',   name: 'Znany', x: 2, y: 0, z: 0 },
  { id: 'sys_never', name: 'Obcy',  x: 3, y: 0, z: 0 },
] };

const colonies = new Map([
  ['p_home',      { planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: { receive() {} } }],
  ['p_gen_player',{ planetId: 'p_gen_player', name: 'Moja', isOutpost: false, resourceSystem: { receive() {} } }],
  ['p_gen_ai',    { planetId: 'p_gen_ai', name: 'Obca', isOutpost: false, ownerEmpireId: 'emp_001', resourceSystem: { receive() {} } }],
]);
const colonyManager = {
  getColony: id => colonies.get(id) ?? null,
  hasColony: id => colonies.has(id),
  activePlanetId: 'p_home',
};
// ⚠ generated ⇔ ma wpis; sys_never NIE MA — lustro produkcyjnego StarSystemManager._systems.
const generated = new Set(['sys_home', 'sys_gen']);
const starSystemManager = { getSystem: id => (generated.has(id) ? { systemId: id } : null) };

const vessel = {
  id: 'v_1', name: 'Frachtowiec', shipId: 'hull_medium',
  systemId: 'sys_home', colonyId: 'p_home', homeColonyId: 'p_home',
  status: 'idle', position: { state: 'docked', dockedAt: 'p_home', x: 2 * AU, y: 0 },
  mission: null, fuel: { current: 60, max: 60, consumption: 1 },
  warpFuel: { current: 8, max: 8, consumption: 0.2 },
  speedAU: 1, modules: [], cargo: { minerals: 10 }, cargoUsed: 10, cargoMax: 50,
  missionLog: [], pendingOrder: null, warpRoute: null, movementOrder: null, serviceState: 'active',
  isWreck: false, unpaidYears: 0,
};
const vesselManager = {
  getVessel: id => (id === 'v_1' ? vessel : null),
  getAllVessels: () => [vessel],
  _findEntity: id => EntityManager.get(id),
};

globalThis.KOSMOS = {
  vesselManager, colonyManager, starSystemManager,
  galaxyData: GALAXY, timeSystem: { gameTime: 40 },
  stationSystem: { getStation: () => null, getStationsAt: () => [] },
  missionSystem: { getActive: () => [] },
};

function targetsFor(actionId) {
  const o = Object.create(FleetManagerOverlay.prototype);
  o._cachedTargets = null; o._cachedTargetsKey = '';
  return o._getValidTargets(vessel, actionId);
}
const idsOf = list => list.map(t2 => t2.id);

// ── D1-1 — POZYTYWNA KONTROLA: gołe ciało w układzie wygenerowanym JEST celem ─────────────────
header('D1-1 PIN(+) — ciało explored:false w układzie WYGENEROWANYM jest celem transportu');
const tTransport = targetsFor('transport');
ok(idsOf(tTransport).includes('p_gen_bare'),
  `„Phact c" (explored:false, bez kolonii, układ wygenerowany) JEST celem (${JSON.stringify(idsOf(tTransport))})`);
const bare = tTransport.find(x => x.id === 'p_gen_bare');
ok(bare && bare.sameSystem === false && bare.systemId === 'sys_gen',
  `cel oznaczony jako cross-system (systemId=${bare?.systemId}, sameSystem=${bare?.sameSystem})`);

// ── D1-3 — FOG (picker) ───────────────────────────────────────────────────────────────────────
header('D1-3 PIN FOG — układ NIGDY nieodwiedzony nie wnosi ANI JEDNEGO celu');
ok(!tTransport.some(x => x.systemId === 'sys_never'),
  `zero celów z sys_never (${JSON.stringify(tTransport.filter(x => x.systemId === 'sys_never'))})`);
ok(tTransport.length > 0, 'KONTROLA PINU: lista celów NIE jest pusta — brak sys_never to filtr, nie pustka');

// ── D1-5 — FOG anty-eager: odpytanie o cele nie tworzy encji ──────────────────────────────────
header('D1-5 PIN FOG (anty-eager) — odpytanie o cele nie REJESTRUJE encji');
const countAll = () => ['star', 'planet', 'moon', 'planetoid', 'asteroid', 'comet']
  .reduce((a, ty) => a + EntityManager.getByType(ty).length, 0);
const before = countAll();
const beforeNever = EntityManager.getByTypeInSystem('planet', 'sys_never').length;
targetsFor('transport'); targetsFor('transport_passenger'); targetsFor('colonize');
const after = countAll();
ok(after === before,
  `liczba encji BEZ ZMIAN (${before} → ${after}) — gdyby ktoś „pomocnie" zawołał generateAndRegister, ` +
  'żeby odpowiedzieć „które ciała", ten pin padnie i mgła z Findingu 186 zostanie utrzymana Z KONSTRUKCJI');
ok(EntityManager.getByTypeInSystem('planet', 'sys_never').length === beforeNever && beforeNever === 0,
  'sys_never dalej ma ZERO ciał (nie zmaterializował się przy odpytaniu)');

// ── D1-6 / D1-7 / D1-8 — kontrole granic ──────────────────────────────────────────────────────
header('D1-6/7/8 KONTROLE — granice, których d1 NIE przesuwa');
ok(!idsOf(tTransport).includes('p_gen_ai'),
  'kolonia AI w obcym układzie DALEJ nie jest celem transportu (cross-empire = S3.5b)');
ok(idsOf(tTransport).includes('p_gen_player'),
  'kolonia GRACZA cross-system dalej jest celem (nic nie zabraliśmy)');
const tPass = targetsFor('transport_passenger');
ok(!idsOf(tPass).includes('p_gen_bare'),
  `pasażer DALEJ wymaga kolonii — gołe ciało odrzucone (${JSON.stringify(idsOf(tPass))})`);
ok(idsOf(tPass).includes('p_gen_player'), 'KONTROLA PINU: pasażer widzi kolonię gracza (lista nie jest pusta z innego powodu)');

// ── D1-2 / D1-4 — druga powierzchnia: `_maybeDeliver` ─────────────────────────────────────────
header('D1-2/D1-4 — dostawa: przyjmuje ciało z układu wygenerowanego, odmawia z niewygenerowanego');
const os = new OrderService();
const events = [];
for (const ev of ['order:compositeFailed', 'order:compositeDelivering', 'expedition:transportRequest']) {
  EventBus.on(ev, d => events.push({ ev, ...d }));
}
function deliverTo(targetId, systemId) {
  events.length = 0;
  vessel.warpRoute = null;
  vessel.systemId = systemId;
  vessel.pendingOrder = { kind: 'transport', targetId, targetSystemId: systemId, cargo: { minerals: 10 }, stage: 'awaiting_warp' };
  os._maybeDeliver('v_1');
  return events.map(e => e.ev);
}
const okDeliver = deliverTo('p_gen_bare', 'sys_gen');
ok(okDeliver.includes('expedition:transportRequest') && !okDeliver.includes('order:compositeFailed'),
  `dostawa na gołe ciało w układzie wygenerowanym RUSZA (${JSON.stringify(okDeliver)})`);

// Cel w układzie, którego nie ma w rejestrze wygenerowanych — encja celu też nie istnieje.
const badDeliver = deliverTo('p_never_x', 'sys_never');
ok(badDeliver.includes('order:compositeFailed') && !badDeliver.includes('expedition:transportRequest'),
  `dostawa do układu NIEWYGENEROWANEGO ODMÓWIONA (${JSON.stringify(badDeliver)}) — fog zamknięty na OBU powierzchniach`);

// KONTROLA PINU: kolonia gracza cross-system dalej dostarcza (nie zepsuliśmy starej ścieżki).
const colDeliver = deliverTo('p_gen_player', 'sys_gen');
ok(colDeliver.includes('expedition:transportRequest'),
  'KONTROLA PINU: dostawa do kolonii gracza cross-system dalej działa');

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
