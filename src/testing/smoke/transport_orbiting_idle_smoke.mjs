// KEEPER — Finding 259: `Transport` musi wystartować statkiem w stanie `orbiting` + `idle`.
//
// CO PINUJE (i dlaczego akurat to)
// Statek `orbiting` + `idle` wypadał MIĘDZY dwie bramki, które się nie pokrywały:
//   `MissionSystem._launchTransport:865` — `isOrbiting` wymagał `orbiting` ORAZ `status === 'on_mission'`
//        ⇒ dla `idle` false ⇒ wejście w gałąź `!isRedispatch`;
//   ta gałąź woła `VesselManager.dispatchOnMission`, a ta (`:401`) wymaga `position.state === 'docked'`
//        ⇒ dla `orbiting` false;
//   ⇒ `MissionSystem._abortLaunch:1651`, którego DOMYŚLNYM powodem jest `mission.shipUnavailable`
//        ⇒ gracz czyta „Statek niedostępny".
// Naprawa (D-259-1, narrow): `isOrbiting` przestaje pytać o `status`. `redispatchFromOrbit` i tak
// NIGDY go nie czytał — bramkuje wyłącznie `state === 'orbiting'`, a `status` sam ZAPISUJE (`:495`).
//
// ⚠ DLACZEGO ISTNIEJE T5 (pin NEGATYWNY na `cargoMax`) — to nie jest ostrożność, to blokada
//   POWROTU DO OBALONEJ TEORII. Pierwsza diagnoza (właściciela i moja) brzmiała: „`_launchTransport`
//   traktuje transport jak przewóz ładunku i odrzuca statek bez ładowni" — realny statek z gate'u to
//   `Fregata I`, `cargoMax 0` (`engine_warp`/`warp_tank`/`titanic_plating`/`weapon_missile`).
//   POMIAR JĄ OBALIŁ: przy identycznym stanie wynik jest TAKI SAM z ładownią i bez (T1 kolumna
//   kontrolna), `_launchTransport` nie zawiera ANI JEDNEGO odwołania do `cargoMax`/`cargoCapacity`,
//   a jedyny predykat ładowni w repo (`Vessel.canHaulCargo:487`) ma ZERO konsumentów produkcyjnych.
//   Statek z ładownią, który „działał", był po prostu ZADOKOWANY. Ładownia była SKORELOWANA,
//   nie sprawcza. T5 pilnuje, żeby nikt nie „naprawił" tego drugi raz przez ładownię i nie
//   przywrócił błędnej teorii do kodu.
//
// KONTROLE (muszą być zielone PRZED i PO zmianie — inaczej harness jest jałowy)
//   C1  fixture startuje: `docked` + `idle` daje misję (ścieżka, która działała zawsze)
//   C2  `cargoMax` nie różnicuje wyniku W ŻADNYM stanie (kolumna kontrolna T1)
//   C3  pusty ładunek nie produkuje wpisów handlu (anty-fantom)
//
// PINY (mają PAŚĆ przed zmianą, przejść po niej)
//   T1  `orbiting` + `idle` → MISJA (rdzeń 259), w obu wariantach ładowni
//   T2  wybór dyspozytora: `orbiting` → `redispatchFromOrbit`, `docked` → `dispatchOnMission`
//   T4  D-259-3 — rezerwa (`stored`) + `orbiting` ODMAWIA; kontrola: `active` + `orbiting` przechodzi
//   T4b D-259-3 — kadłub kompozytu warp (`_maybeDeliver`) NIE jest łapany przez nowy `isInService`
//   T5  pin NEGATYWNY (patrz wyżej) — `_launchTransport` nie odwołuje się do ładowni
//
// ⚠ GRANICA DOWODU: headless. `MissionSystem`, `OrderService` i `VesselManager` importują się pod
//   node, więc T1/T2/T4/T4b prowadzą PRAWDZIWY silnik; T3 czyta prawdziwe zdarzenia z `EventBus`.
//   Live-gate (fregata bez ładowni, orbita, Transport → cel → dolot) zostaje po stronie właściciela.
//
// Uruchom: node src/testing/smoke/transport_orbiting_idle_smoke.mjs

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

const { MissionSystem } = await import('../../systems/MissionSystem.js');
const { OrderService }  = await import('../../systems/OrderService.js');
const { GAME_CONFIG }   = await import('../../config/GameConfig.js');
const EntityManager     = (await import('../../core/EntityManager.js')).default;
const EventBus          = (await import('../../core/EventBus.js')).default;
const VMod              = await import('../../systems/VesselManager.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = GAME_CONFIG.AU_TO_PX;

function world() {
  EntityManager.clear();
  for (const [id, n, a] of [['p_home', 'Dom', 1], ['p_two', 'Wtora', 3]]) {
    EntityManager.add({ id, type: 'planet', name: n, x: a * AU, y: 0, systemId: 'sys_home',
                        orbital: { a, e: 0, T: a * 2, M: 0 }, deposits: [], explored: true, analyzed: true });
  }
}

/**
 * Jeden przebieg PRAWDZIWEGO łańcucha: OrderService.issueTransport → expedition:transportRequest
 * → MissionSystem._launchTransport → VesselManager.{dispatchOnMission|redispatchFromOrbit}.
 * `VesselManager` jest PRAWDZIWY (nie atrapa), więc bramki `:401` / `isInService` są mierzone,
 * a nie odwzorowywane — inaczej pin mierzyłby moją kopię reguły, nie regułę.
 */
function run({ state, status, cargoMax, serviceState = 'active', cargo = {} }) {
  // ⚠ IZOLACJA — bez tego każdy przebieg zostawia ŻYWY `MissionSystem` zapisany na
  //   `expedition:transportRequest`, a wszystkie stare instancje czytają `window.KOSMOS`
  //   NA ŻYWO ⇒ emit obsługuje N systemów naraz, statek konsumuje pierwszy z nich, a `ms`
  //   z TEGO przebiegu widzi już zmieniony stan. Zmierzone: bez `clear()` C1 dawało misję,
  //   a identyczna konfiguracja w T1 dawała 0. To defekt HARNESSU, nie kodu gry.
  EventBus.clear();
  world();
  const home = { planetId: 'p_home', name: 'Dom', isOutpost: false,
    buildingSystem: { hasSpaceport: () => true }, civSystem: { freePops: 5 },
    resourceSystem: { inventory: new Map(), getAmount: () => 50, canAfford: () => true, spend: () => true, receive: () => {} } };
  const tgt = { planetId: 'p_two', name: 'Wtora', isOutpost: false,
    buildingSystem: { hasSpaceport: () => true }, civSystem: { freePops: 1 },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => false, spend: () => false, receive: () => {} } };

  const vm = new VMod.VesselManager();
  const v = {
    id: 'v_1', name: 'Fregata I', shipId: 'hull_frigate', systemId: 'sys_home',
    colonyId: 'p_home', homeColonyId: 'p_home', status,
    position: { state, dockedAt: 'p_home', x: 1 * AU, y: 0 },
    mission: null, movementOrder: null,
    fuel: { current: 400, max: 400, consumption: 0.05 }, warpFuel: { current: 4, max: 4 },
    endurance: { current: 10, max: 10 },
    cargo: { ...cargo }, cargoUsed: 0, cargoMax, cargoCapacity: cargoMax,
    colonistCapacity: 0, colonists: 0, troopCapacity: 0,
    modules: cargoMax > 0 ? ['engine_ion', 'cargo_small']
                          : ['engine_warp', 'warp_tank', 'titanic_plating', 'weapon_missile'],
    missionLog: [], isWreck: false, serviceState, unpaidYears: 0, refuelAutomatically: true, xp: 0,
  };
  vm._vessels.set('v_1', v);

  const ms = new MissionSystem(home.resourceSystem);
  window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home',
    homePlanet: EntityManager.get('p_home'),
    vesselManager: vm,
    colonyManager: { activePlanetId: 'p_home',
      getColony: (id) => (id === 'p_home' ? home : (id === 'p_two' ? tgt : null)),
      getAllColonies: () => [home, tgt], getPlayerColonies: () => [home, tgt], isPlayerColony: () => true },
    missionSystem: ms,
    techSystem: { isResearched: () => true, getShipSpeedMultiplier: () => 1, getMultiplier: () => 1, getFuelEfficiency: () => 1 },
    stationSystem: { getStationsAt: () => [] },
  };
  const os = new OrderService();
  window.KOSMOS.orderService = os;

  // Który dyspozytor został użyty (T2) — szpiedzy NA PRAWDZIWYCH metodach, nie zamiast nich.
  const used = [];
  const origD = vm.dispatchOnMission.bind(vm);
  const origR = vm.redispatchFromOrbit.bind(vm);
  vm.dispatchOnMission   = (...a) => { const r = origD(...a); used.push('dispatchOnMission:' + r); return r; };
  vm.redispatchFromOrbit = (...a) => { const r = origR(...a); used.push('redispatchFromOrbit:' + r); return r; };

  const fails = [], trade = [];
  const onFail = (e) => fails.push(e?.reason);
  const onImp  = () => trade.push('imported');
  const onExp  = () => trade.push('exported');
  EventBus.on('expedition:launchFailed', onFail);
  EventBus.on('trade:imported', onImp);
  EventBus.on('trade:exported', onExp);

  os.issueTransport('v_1', { targetId: 'p_two', targetSystemId: null, cargo, loop: false });

  EventBus.off?.('expedition:launchFailed', onFail);
  EventBus.off?.('trade:imported', onImp);
  EventBus.off?.('trade:exported', onExp);

  return { missions: ms.getActive().length, used, fails, trade, ms, vm, v };
}

// ═══ C1 — fixture startuje (ścieżka, która działała zawsze) ══════════════════════════════════
header('C1  KONTROLA — `docked` + `idle` daje misję (fixture nie jest zepsuty)');
{
  const r = run({ state: 'docked', status: 'idle', cargoMax: 50 });
  ok(r.missions === 1, `misja powstała (jest: ${r.missions}, odmowy: ${JSON.stringify(r.fails)})`);
}

// ═══ T1 — RDZEŃ 259 + C2 (kolumna kontrolna ładowni) ═════════════════════════════════════════
header('T1  PIN — `orbiting` + `idle` startuje; C2: `cargoMax` nie różnicuje NICZEGO');
{
  const rows = [
    ['docked   + idle      ', { state: 'docked',   status: 'idle' },       true],
    ['orbiting + idle      ', { state: 'orbiting', status: 'idle' },       true],   // ← 259
    ['orbiting + on_mission', { state: 'orbiting', status: 'on_mission' }, true],
  ];
  for (const [label, cfg, expectOk] of rows) {
    const bez = run({ ...cfg, cargoMax: 0 });
    const zla = run({ ...cfg, cargoMax: 50 });
    ok(bez.missions === (expectOk ? 1 : 0),
       `${label} BEZ ładowni → ${expectOk ? 'misja' : 'odmowa'} (jest: ${bez.missions}, ${JSON.stringify(bez.fails)})`);
    // C2 — kolumna kontrolna: ładownia nie może zmienić wyniku w ŻADNYM stanie.
    ok(bez.missions === zla.missions,
       `C2 ${label}: wynik IDENTYCZNY z ładownią i bez (${bez.missions} == ${zla.missions})`);
  }
}

// ═══ T2 — wybór dyspozytora (pin na MECHANIZMIE, nie na wyniku) ══════════════════════════════
header('T2  PIN — `orbiting` → redispatchFromOrbit, `docked` → dispatchOnMission');
{
  const orb = run({ state: 'orbiting', status: 'idle', cargoMax: 0 });
  ok(orb.used.some((u) => u.startsWith('redispatchFromOrbit:true')),
     `orbiting+idle poszedł przez redispatchFromOrbit (jest: ${JSON.stringify(orb.used)})`);
  ok(!orb.used.some((u) => u.startsWith('dispatchOnMission')),
     'orbiting+idle NIE dotknął dispatchOnMission (bramka `docked` by go odrzuciła)');
  const dok = run({ state: 'docked', status: 'idle', cargoMax: 0 });
  ok(dok.used.some((u) => u.startsWith('dispatchOnMission:true')),
     `KONTROLA: docked+idle dalej idzie przez dispatchOnMission (jest: ${JSON.stringify(dok.used)})`);
}

// ═══ C3 — pusty ładunek nie produkuje wpisów handlu ══════════════════════════════════════════
header('C3  KONTROLA — pusty transport nie emituje trade:imported/exported (anty-fantom)');
{
  const puste = run({ state: 'orbiting', status: 'idle', cargoMax: 0, cargo: {} });
  ok(puste.trade.length === 0, `brak wpisów handlu przy cargo {} (jest: ${JSON.stringify(puste.trade)})`);
  const zladunkiem = run({ state: 'docked', status: 'idle', cargoMax: 50, cargo: { minerals: 5 } });
  ok(zladunkiem.trade.includes('exported'),
     `KONTROLA: realny ładunek DALEJ loguje eksport (jest: ${JSON.stringify(zladunkiem.trade)})`);
}

// ═══ T4 — D-259-3: symetria rezerwy między dyspozytorami ═════════════════════════════════════
// ⚠ `withdrawVessel:1014` blokuje tylko `in_transit`, więc `stored` + `orbiting` JEST osiągalne.
//   Dziś taki kadłub nie dosięga `redispatchFromOrbit` (bo `isOrbiting` żąda `on_mission`);
//   po D-259-1 dosięga ⇒ bez `isInService` narrow A OTWORZYŁBY dziurę w zbiorze wykluczeń W2.
header('T4  PIN — rezerwa (`stored`) + `orbiting` ODMAWIA (D-259-3)');
{
  const rez = run({ state: 'orbiting', status: 'idle', cargoMax: 0, serviceState: 'stored' });
  ok(rez.missions === 0, `rezerwa nie startuje (misji: ${rez.missions}, odmowy: ${JSON.stringify(rez.fails)})`);
  ok(rez.used.some((u) => u.startsWith('redispatchFromOrbit:false')),
     `odmowa przyszła Z DYSPOZYTORA, nie skądinąd (jest: ${JSON.stringify(rez.used)})`);
  const akt = run({ state: 'orbiting', status: 'idle', cargoMax: 0, serviceState: 'active' });
  ok(akt.missions === 1, `KONTROLA: `.concat(`ten sam stan w SŁUŻBIE przechodzi (misji: ${akt.missions})`));
  const mob = run({ state: 'orbiting', status: 'idle', cargoMax: 0, serviceState: 'mobilizing' });
  ok(mob.missions === 0, `mobilizacja też nie startuje (isInService: 'mobilizing' NIE jest służbą) — misji: ${mob.missions}`);
}

// ═══ T4b — kompozyt warp: dostawa po skoku NIE jest łapana przez nowy `isInService` ═══════════
// ⚠ `OrderService._maybeDeliver` wydaje dostawę przez `expedition:transportRequest` na statku
//   `orbiting` (po przylocie z warpu). D-259-3 dokłada tam bramkę, więc trzeba pokazać, że
//   kadłub kompozytu przez nią PRZECHODZI — jest w służbie z konstrukcji (rezerwa nie wystartuje).
//   Pinujemy TAKŻE brak pola: stary zapis / statek spoza stoczni ma `serviceState === undefined`,
//   a `isInService` czyta to jako SŁUŻBĘ (`Vessel.js:337`, `?? 'active'`).
header('T4b PIN — kadłub kompozytu warp (orbiting, w służbie) przechodzi mimo nowej bramki');
{
  const poWarpie = run({ state: 'orbiting', status: 'on_mission', cargoMax: 50, cargo: { minerals: 3 } });
  ok(poWarpie.missions === 1,
     `dostawa po skoku startuje (misji: ${poWarpie.missions}, odmowy: ${JSON.stringify(poWarpie.fails)})`);
  ok(poWarpie.used.some((u) => u.startsWith('redispatchFromOrbit:true')),
     `i idzie TĄ ścieżką, którą chodzi _maybeDeliver (jest: ${JSON.stringify(poWarpie.used)})`);
  const bezPola = run({ state: 'orbiting', status: 'idle', cargoMax: 0, serviceState: undefined });
  ok(bezPola.missions === 1,
     `stary zapis (serviceState undefined) czytany jako SŁUŻBA (misji: ${bezPola.missions})`);
}

// ═══ T5 — PIN NEGATYWNY: naprawa NIE MOŻE wrócić przez ładownię ══════════════════════════════
// Powód istnienia tego pinu: patrz nagłówek pliku. Teoria „brak ładowni" została ZMIERZONA
// I OBALONA; T5 blokuje jej powrót do kodu.
header('T5  PIN NEGATYWNY — `_launchTransport` nie odwołuje się do ładowni');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../systems/MissionSystem.js', import.meta.url), 'utf-8');
  // Kod BEZ komentarzy — nagłówki/komentarze CYTUJĄ te nazwy i same by pin zazieleniły
  // (reguła `source-pin-strip-comments`).
  const lines = src.split(String.fromCharCode(10));
  const code = lines.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join(String.fromCharCode(10));
  const at = code.indexOf('  _launchTransport(');
  const end = code.indexOf('  _launchPassenger(');
  const body = (at >= 0 && end > at) ? code.slice(at, end) : '';
  ok(body.length > 2000, `KONTROLA: ciało _launchTransport realnie wycięte (${body.length} zn.)`);
  ok(!body.includes('cargoMax') && !body.includes('cargoCapacity'),
     '_launchTransport NIE odwołuje się do cargoMax/cargoCapacity (teoria „brak ładowni" była FAŁSZYWA)');
  // KONTROLA dwustronna: te nazwy ISTNIEJĄ w repo, więc pin nie przechodzi przez pomyłkę w pisowni.
  const vs = readFileSync(new URL('../../entities/Vessel.js', import.meta.url), 'utf-8');
  ok(vs.includes('cargoMax'), 'KONTROLA: token `cargoMax` istnieje w repo (pin szuka realnej nazwy)');
}

console.log(`\n═══ ${pass}/${pass + fail} OK, ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
