// KEEPER — d2 (Finding 254): move-to-point na ciało w INNYM układzie = COMPOSITE, nie luzowanie bramki.
//
// CO PINUJE (i dlaczego akurat to)
// `OrderService.issueMove` był cienkim przelotem do `MovementOrderSystem.issueOrder`, więc cel
// w obcym układzie odpadał na `target_other_system`. Kuszące „rozwiązanie" — zdjąć tę bramkę —
// jest BŁĘDEM: rozkazy MOS niosą `targetPoint` we WSPÓŁRZĘDNYCH UKŁADU (każda gwiazda w (0,0)),
// więc zdjęcie bramki pozwoliłoby lecieć ku punktowi z ramki INNEGO układu — dokładnie klasa
// „globalne id ≠ położenie" (131cc2e, W3-4b), pod którą powstało `isSameSystemStrict`.
//
// ⚠ WŁAŚCIWY KSZTAŁT JEST JUŻ W REPO: `issueRecall` = „skocz, potem moveToPoint na ciało".
//   d2 reużywa ten sam odcinek przylotowy, ale MUSI go SPARAMETRYZOWAĆ — `_issueRecallLeg`
//   miał ZASZYTE `bypassFuelCheck: true` (bo „kolonie AI nie trzymają paliwa") oraz
//   `issuedBy: 'ai_recall'`. Dla rozkazu GRACZA jedno i drugie byłoby kłamstwem: gracz ma
//   podlegać bramce paliwa. Sam CEL nie niósł żadnego założenia o przyjazności — to była
//   jedyna dobra wiadomość ze skanu.
//
// d2-1 PIN  — cross-system move na ciało w układzie WYGENEROWANYM → composite `move`
// d2-2 KONTROLA (BRAMKA ZAMKNIĘTA) — BEZPOŚREDNI rozkaz MOS dalej zwraca `target_other_system`
// d2-3 KONTROLA FOG — ciało układu nigdy nieodwiedzonego: odmowa + ZERO nowych encji
// d2-4 PIN  — po przylocie composite WYDAJE odcinek i KOŃCZY się czysto (bez ducha)
// d2-5 KONTROLA — move w TYM SAMYM układzie dalej idzie wprost do MOS (bez composite)
// d2-6 KONTROLA — `bypassFuelCheck` NIE jest przemycane graczowi (parametryzacja działa)
//
// Uruchom: node src/testing/smoke/cross_system_move_composite_smoke.mjs

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
const { VesselManager }     = await import('../../systems/VesselManager.js');
const { MovementOrderSystem } = await import('../../systems/MovementOrderSystem.js');
const { OrderService }      = await import('../../systems/OrderService.js');
const { GAME_CONFIG }       = await import('../../config/GameConfig.js');

const AU = GAME_CONFIG.AU_TO_PX;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n--- ' + s + ' ---');

EntityManager.clear();
EntityManager.add({ id: 'star_home', type: 'star', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
EntityManager.add({ id: 'p_home', type: 'planet', systemId: 'sys_home', x: 2 * AU, y: 0, name: 'Dom',
  orbital: { a: 2, e: 0.01, M: 0.3, T: 2.8, inclinationOffset: 0 } });
EntityManager.add({ id: 'star_gen', type: 'star', systemId: 'sys_gen', x: 0, y: 0, mass: 1 });
EntityManager.add({ id: 'p_gen_bare', type: 'planet', systemId: 'sys_gen', x: 3 * AU, y: 0, name: 'Phact c',
  explored: false, orbital: { a: 3, e: 0.01, M: 1.1, T: 5.2, inclinationOffset: 0 } });
// sys_never — ZERO encji (nigdy nieodwiedzony)

const GALAXY = { systems: [
  { id: 'sys_home', name: 'Dom',   x: 0, y: 0, z: 0, isHome: true },
  { id: 'sys_gen',  name: 'Znany', x: 2, y: 0, z: 0 },
  { id: 'sys_never', name: 'Obcy', x: 3, y: 0, z: 0 },
] };
const generated = new Set(['sys_home', 'sys_gen']);

const clock = { gameTime: 40 };
const vm = new VesselManager();
const mos = new MovementOrderSystem(vm);
const os = new OrderService();
let warpTargets = [];

globalThis.KOSMOS = {
  timeSystem: clock, vesselManager: vm, movementOrderSystem: mos, orderService: os,
  galaxyData: GALAXY,
  starSystemManager: { getSystem: id => (generated.has(id) ? { systemId: id } : null) },
  colonyManager: { getColony: () => null, hasColony: () => false, activePlanetId: 'p_home' },
  stationSystem: { getStation: () => null, getStationsAt: () => [] },
  missionSystem: { getActive: () => [] },
  warpRouteSystem: { beginJourney: (id, sys) => { warpTargets.push(sys); return { ok: true }; } },
};

function makeVessel(over = {}) {
  const v = {
    id: 'v_1', name: 'Zwiadowca', shipId: 'hull_medium',
    systemId: 'sys_home', colonyId: 'p_home', homeColonyId: 'p_home',
    status: 'idle', position: { state: 'docked', dockedAt: 'p_home', x: 2 * AU, y: 0 },
    mission: null, fuel: { current: 60, max: 60, consumption: 1 },
    warpFuel: { current: 8, max: 8, consumption: 0.2 },
    speedAU: 1, experience: 0, stats: { distanceTraveled: 0, missionsComplete: 0 },
    modules: [], cargo: {}, missionLog: [], pendingOrder: null, warpRoute: null,
    movementOrder: null, serviceState: 'active', isWreck: false, unpaidYears: 0,
    ...over,
  };
  vm._vessels.clear(); vm._vessels.set(v.id, v); warpTargets = [];
  return v;
}
const countAll = () => ['star', 'planet', 'moon', 'planetoid', 'asteroid', 'comet']
  .reduce((a, ty) => a + EntityManager.getByType(ty).length, 0);

// ── d2-1 — cross-system move → composite ──────────────────────────────────────────────────────
header('d2-1 PIN — move na ciało w obcym WYGENEROWANYM układzie tworzy composite `move`');
const v1 = makeVessel();
const r1 = os.issueMove('v_1', { type: 'moveToPoint', targetBodyId: 'p_gen_bare', issuedBy: 'player_ppm' });
ok(r1?.ok === true && r1.composite === true, `zwrot: ${JSON.stringify(r1)}`);
ok(v1.pendingOrder?.kind === 'move' && v1.pendingOrder.targetId === 'p_gen_bare'
   && v1.pendingOrder.targetSystemId === 'sys_gen',
  `pendingOrder = composite move na ciało (${JSON.stringify(v1.pendingOrder)})`);
ok(warpTargets.includes('sys_gen'), `skok warp zlecony do sys_gen (${JSON.stringify(warpTargets)})`);
ok(!v1.movementOrder, 'ŻADEN surowy rozkaz MOS nie powstał w układzie startowym — cel jest gdzie indziej');

// ── d2-2 — KONTROLA: bramka MOS została ZAMKNIĘTA ─────────────────────────────────────────────
header('d2-2 KONTROLA (BRAMKA ZAMKNIĘTA) — bezpośredni rozkaz MOS dalej odmawia');
const v2 = makeVessel();
const direct = mos.issueOrder('v_1', {
  type: 'moveToPoint', targetBodyId: 'p_gen_bare',
  targetPoint: { x: 3 * AU, y: 0 }, issuedBy: 'test_direct',
});
ok(direct?.ok === false && direct.reason === 'target_other_system',
  `MOS dalej zwraca target_other_system (${JSON.stringify(direct)}) — d2 DODAŁO ścieżkę, nie osłabiło strażnika`);
ok(!v2.movementOrder, 'KONTROLA PINU: odmowa MOS nie zostawia rozkazu');

// ── d2-3 — KONTROLA FOG ───────────────────────────────────────────────────────────────────────
header('d2-3 KONTROLA FOG — układ nigdy nieodwiedzony: odmowa + ZERO nowych encji');
const v3 = makeVessel();
const before = countAll();
const rFog = os.issueMove('v_1', { type: 'moveToPoint', targetBodyId: 'p_never_x', issuedBy: 'player_ppm' });
// ⚠ Powód MUSI pochodzić z bramki mgły, nie z walidacji MOS. Przed naprawą ten pin przechodził
// JAŁOWO na `missing_target_point` — czyli był zielony z zupełnie innego powodu niż mierzony.
ok(rFog?.ok === false && rFog.reason === 'target_system_unknown',
  `odmowa Z POWODEM MGŁY, nie z walidacji MOS (${JSON.stringify(rFog)})`);
ok(!v3.pendingOrder, 'żaden composite nie powstał');
ok(countAll() === before,
  `liczba encji BEZ ZMIAN (${before} → ${countAll()}) — ⛔ zakaz generateAndRegister obowiązuje ` +
  'tak samo jak w d1 (pin D1-5)');

// ── d2-4 — przylot: composite wydaje odcinek i domyka się ─────────────────────────────────────
header('d2-4 PIN — po przylocie composite WYDAJE odcinek i czyści się (bez ducha)');
const v4 = makeVessel({
  systemId: 'sys_gen', position: { state: 'orbiting', dockedAt: null, x: 30 * AU, y: 0 },
  status: 'on_mission',
  mission: { type: 'interstellar_jump', fromSystemId: 'sys_home', toSystemId: 'sys_gen', phase: 'in_system', arrivalYear: 39 },
});
v4.pendingOrder = { kind: 'move', targetId: 'p_gen_bare', targetSystemId: 'sys_gen', stage: 'awaiting_warp' };
const seen = [];
const onEv = d => seen.push(d);
EventBus.on('order:compositeDelivering', onEv);
EventBus.on('order:compositeFailed', onEv);
os._maybeDeliver('v_1');
EventBus.off('order:compositeDelivering', onEv);
EventBus.off('order:compositeFailed', onEv);
ok(v4.pendingOrder === null, 'pendingOrder wyczyszczony (composite się nie zapętli)');
// ⚠ Tożsamość CIAŁA nie mieszka na obiekcie rozkazu (ten ma tylko `targetPoint`), tylko na
// `vessel.mission.targetId` — i to jest mechanizm, dzięki któremu przylot snapuje do ŻYWEJ
// pozycji planety i statek ją ORBITUJE, zamiast dryfować do nieaktualnego punktu (fix T7 z F-D).
// Pierwsza wersja tego pinu sprawdzała `movementOrder.targetBodyId` — pole, którego tam NIE MA.
ok(v4.movementOrder?.type === 'moveToPoint' && v4.mission?.targetId === 'p_gen_bare',
  `odcinek przylotowy WYDANY i ŚLEDZI ciało (order=${v4.movementOrder?.type}, ` +
  `mission.targetId=${v4.mission?.targetId})`);
ok(v4.mission?.type !== 'interstellar_jump',
  `martwa misja skoku NIE zostaje (mission=${v4.mission?.type ?? 'null'}) — to jest brick z §2 planu Z2`);

// ── d2-5 — KONTROLA: move w tym samym układzie bez zmian ──────────────────────────────────────
header('d2-5 KONTROLA — move w TYM SAMYM układzie dalej idzie wprost do MOS');
const v5 = makeVessel({ position: { state: 'orbiting', dockedAt: null, x: 1 * AU, y: 0 } });
const r5 = os.issueMove('v_1', { type: 'moveToPoint', targetBodyId: 'p_home', targetPoint: { x: 2 * AU, y: 0 }, issuedBy: 'player_ppm' });
ok(r5?.ok === true && !r5.composite, `zwykły rozkaz, bez composite (${JSON.stringify(r5)})`);
ok(!v5.pendingOrder && !!v5.movementOrder, 'rozkaz MOS wydany wprost, pendingOrder pusty');

// ── d2-6 — KONTROLA: parametryzacja odcinka (gracz NIE dostaje bypassFuelCheck) ────────────────
header('d2-6 KONTROLA — odcinek przylotowy gracza NIE omija bramki paliwa');
const v6 = makeVessel({
  systemId: 'sys_gen', position: { state: 'orbiting', dockedAt: null, x: 30 * AU, y: 0 },
  fuel: { current: 0.01, max: 60, consumption: 1 },   // pusto — bramka paliwa MA zadziałać
  status: 'on_mission',
  mission: { type: 'interstellar_jump', fromSystemId: 'sys_home', toSystemId: 'sys_gen', phase: 'in_system', arrivalYear: 39 },
});
v6.pendingOrder = { kind: 'move', targetId: 'p_gen_bare', targetSystemId: 'sys_gen', stage: 'awaiting_warp' };
os._maybeDeliver('v_1');
ok(!v6.movementOrder,
  'przy pustym baku odcinek gracza ODPADA — `bypassFuelCheck` z `_issueRecallLeg` (uzasadnione ' +
  'tym, że kolonie AI nie trzymają paliwa) NIE zostało przemycone graczowi');
// ⚠ KONTROLA NIEJAŁOWOŚCI: bez niej powyższy pin przechodzi na kodzie SPRZED naprawy, gdzie
// gałęzi `move` w ogóle nie ma — brak rozkazu myliłby się z odmową paliwową.
const v6b = makeVessel({
  systemId: 'sys_gen', position: { state: 'orbiting', dockedAt: null, x: 30 * AU, y: 0 },
  fuel: { current: 60, max: 60, consumption: 1 },
  status: 'on_mission',
  mission: { type: 'interstellar_jump', fromSystemId: 'sys_home', toSystemId: 'sys_gen', phase: 'in_system', arrivalYear: 39 },
});
v6b.pendingOrder = { kind: 'move', targetId: 'p_gen_bare', targetSystemId: 'sys_gen', stage: 'awaiting_warp' };
os._maybeDeliver('v_1');
ok(!!v6b.movementOrder,
  'KONTROLA NIEJAŁOWOŚCI: z PEŁNYM bakiem ten sam odcinek JEST wydany — czyli odmowa wyżej ' +
  'bierze się z paliwa, a nie z braku gałęzi');

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
