// ═══════════════════════════════════════════════════════════════════════════════
// warp_transit_order_gate_smoke — KEEPER Findingu 147 (D-147a/b/c)
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `MovementOrderSystem` nie miał ŻADNEJ bramki na tranzyt międzygwiezdny
//   (rejestr: „grep = 0"), więc rozkaz ruchu wydany statkowi W SKOKU przechodził
//   `{ok:true}`, podmieniał misję `interstellar_jump` na `move_to_point`, spalał paliwo
//   in-system i — przez `_reconcileSystemId` biegnące CO TIK — stemplował statek
//   `sys_home` przy współrzędnych układu, z którego startował. To jest MIS-HOMED DUCH,
//   dokładnie klasa, którą Slice A likwidował (`f072da0`), wpuszczona z powrotem
//   niebramkowaną gałęzią typu. Jeden PPM od gracza.
//
// ⚠ WARP CORES SĄ FORFEITED, NIE „WYDANE PRZEZ TEN ROZKAZ". `dispatchInterstellar`
//   pobiera je Z GÓRY (`VesselManager:895`, `consumeWarpFuel`) i nie ma ścieżki zwrotu;
//   `moveToPoint` nie tyka `warpFuel` w ogóle. Dlatego połowa T4 dotycząca `warpFuel`
//   jest KONTROLĄ (przechodzi po obu stronach naprawy), a nie pinem naprawy — i jest
//   tu opisana wprost, żeby nikt nie wziął jej zieleni za dowód czegokolwiek.
//
// ⚠ CZEGO TU NIE MA: T1/T1c (goły punkt cross-system, Finding 255) są ZAREZERWOWANE
//   dla przyszłego slice'u producentów (Shape C, w parze z 154). W tej suicie siedziałyby
//   na stałe na czerwono, a keeper, który świeci czerwono „z założenia", przestaje być
//   sygnałem. `system_scope_orders_smoke` T2c pilnuje w tym czasie, że bramka `if (bodyId)`
//   NAD tym wszystkim nadal odrzuca jawny cel z obcego układu.
//
// PINY (T2-T12; numeracja z audytu, zgodnie z podpisem):
//   T2   admission — statek w skoku dostaje `{ok:false, vessel_in_warp_transit'}`
//        + T2c KONTROLA: ten sam statek z wyczyszczoną misją ⇒ `{ok:true}` (dowód, że
//          odmowa pochodzi z terminu warp, a nie z czegokolwiek innego w fixture)
//        + T2d bramka obejmuje WSZYSTKIE typy rozkazu, `patrol` włącznie
//   T3   non-event MISJA — REFERENCJA tego samego obiektu + POZYTYWNA tożsamość
//        (`interstellar_jump` / `warp_transit` / `toSystemId`). ⚠ Bez pozytywnej połowy
//        `mission?.type !== 'move_to_point'` przechodziłby JAŁOWO także na zepsutym
//        kodzie, bo odmowa nie tworzy misji (lekcja 138/T2b: 11/10 → 10/11)
//   T4   non-event PALIWO — delta mierzona wobec KOSZTU TEGO KURSU (bliźniak nie-warp
//        wykonuje ten sam rozkaz i jego delta JEST kosztem), nie wobec pojemności baku
//        (lekcja „threshold-scale false green" ze slice'u 150) + `warpFuel` jako KONTROLA
//   T5   non-event STEMPEL — `systemId === null` po odmowie, DRUGIE wywołanie
//        `_reconcileSystemId` zwraca `false` + KONTROLA „stempluje, gdy legalnie"
//   T6   non-event PODRÓŻ — liczące atrapy `abortJourney` / `abortMissionsForVessel`
//        + `pendingOrder` nietknięty + KONTROLA D-VO3e (udany rozkaz JE woła)
//   T7   GŁOŚNA ODMOWA — PRAWDZIWY `RightClickMenu._handleOptionClick` na PRAWDZIWEJ
//        opcji z `buildMenuOptions`, odczyt payloadu `eventLogSystem.push` w PL i EN
//   T8   ANTY-JAŁOWOŚĆ — legalny goły punkt we WŁASNYM układzie NADAL leci
//        + T8b snap na WŁASNE ciało nadal śledzi (`mission.targetId`)
//   T9   KONTROLA 254 — composite cross-system (cel-CIAŁO) nietknięty
//   T10  KONTROLA D-FDk — ucieczka z bitwy przechodzi przy ZALEGŁYM utrzymaniu,
//        a statek w skopie nie może być w starciu (`isSameSystemStrict` fail-CLOSED)
//   T11  PIN ŹRÓDŁOWY — położenie terminu (nad `isRetreat`, poza `_dispatchByType`),
//        na źródle BEZ KOMENTARZY + KONTROLA na przeniesionej kopii
//   T12  ZASIĘG AI — obie pule AI wykluczają statek w skoku; ŚWIADEK przeciw jałowości
//        (ten sam statek bez misji JEST w puli)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { readFileSync }        from 'node:fs';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService }        from '../../systems/OrderService.js';
import { ORDER_TYPES }         from '../../data/MovementOrderTypes.js';
import { isSameSystem, isSameSystemStrict } from '../../utils/SystemScope.js';
import { RightClickMenu }      from '../../ui/RightClickMenu.js';
import { buildMenuOptions }    from '../../data/RightClickMenuOptions.js';
import { setLocale, getLocale, t } from '../../i18n/i18n.js';
import { DirectorOffensive }   from '../../systems/director/DirectorOffensive.js';
import { DirectorDoctrine }    from '../../systems/director/DirectorDoctrine.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = GAME_CONFIG.AU_TO_PX;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });

// ── Świat ────────────────────────────────────────────────────────────────────
// ⚠ Ciała obu układów leżą w TYCH SAMYCH zakresach px — gwiazda każdego układu stoi
//   w (0,0). To jest MECHANIZM całej rodziny 138/142/147/255, nie skrót fixture'u.
function resetWorld() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: 'sys_home' };
}

function addBody(id, sys, auX, name) {
  const b = {
    id, type: 'planet', name, x: auX * AU, y: 0,
    explored: true, analyzed: true, planetType: 'rocky', orbital: orb(auX), deposits: [],
  };
  if (sys !== undefined) b.systemId = sys;
  EntityManager.add(b);
  return b;
}
function addStar(sys) {
  EntityManager.add({ id: 'star_' + sys, type: 'star', name: 'G ' + sys, systemId: sys, x: 0, y: 0, mass: 1 });
}

const techStub = {
  isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
  getShipRangeMultiplier: () => 1.0, getMultiplier: () => 1.0,
  getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
};

/** Dwa układy + planety + żywy VesselManager/MOS w locatorze. */
function scene() {
  resetWorld();
  addStar('sys_home'); addStar('sys_061');
  const home = addBody('p_home', 'sys_home', 1.00, 'Dom');
  addBody('h2',  'sys_home', 6.00, 'Dom II');
  addBody('f_a', 'sys_061',  2.00, 'Obca A');
  addBody('f_b', 'sys_061',  7.00, 'Obca B');
  const vMgr = new VesselManager();
  const mos  = new MovementOrderSystem(vMgr);
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: techStub,
    colonyManager: { activePlanetId: 'p_home', getColony: () => null, getAllColonies: () => [] },
  });
  return { vMgr, mos };
}

function ship(vMgr, { sys = 'sys_home', auX = 1, warp = 5, modules = ['engine_ion'] } = {}) {
  const v = vMgr.createAndRegister('hull_small', 'p_home', { name: 'Sonda', modules, x: auX * AU, y: 0 });
  v.position.x = auX * AU; v.position.y = 0;
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  if (sys === undefined) delete v.systemId; else v.systemId = sys;
  v.warpFuel = { current: warp, max: warp, consumption: 0.5 };
  return v;
}

/**
 * Statek W TRANZYCIE — stan odtworzony CO DO POLA po `VesselManager.dispatchInterstellar`
 * (`:895-923`): `warpFuel` już pobrane, misja `interstellar_jump`/`warp_transit`,
 * `in_transit`, `dockedAt=null`, `systemId=null`.
 */
function warpShip(vMgr, opts = {}) {
  const v = ship(vMgr, { sys: 'sys_061', auX: 2, ...opts });
  v.warpFuel.current = 0.5;                       // 4.5 z 5.0 poszło na skok — bezzwrotnie
  v.mission = {
    type: 'interstellar_jump', fromSystemId: 'sys_061', toSystemId: 'sys_099',
    targetName: 'Wega', departYear: 100, arrivalYear: 140, warpSpeed: 2.5,
    distLY: 100, fuelCost: 4.5, phase: 'warp_transit',
    fromGalX: 0, fromGalY: 0, toGalX: 100, toGalY: 0,
  };
  v.status = 'on_mission'; v.position.state = 'in_transit'; v.position.dockedAt = null;
  v.systemId = null;
  return v;
}

const POINT = { x: 6 * AU, y: 0 };   // daleko poza SUN_EXCLUSION_PX (0,3 AU)

// ═══ T2 — ADMISSION ══════════════════════════════════════════════════════════
header('T2  admission — statek w skoku nie przyjmuje rozkazu');
{
  const { vMgr, mos } = scene();
  const v = warpShip(vMgr);

  const r = mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } });
  assert(r?.ok === false && r?.reason === 'vessel_in_warp_transit',
    `T2 goły punkt w tranzycie ODRZUCONY powodem warp (dostano: ok=${r?.ok} reason=${r?.reason})`);

  // ⚠ KONTROLA — bez niej T2 mógłby świecić na dowolnej innej odmowie tego fixture'u
  //   (`unreachable_target`, `insufficient_fuel`, `no_spaceport_at_origin`…).
  v.mission = null; v.status = 'idle'; v.position.state = 'orbiting'; v.systemId = 'sys_061';
  const rc = mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } });
  assert(rc?.ok === true,
    `T2c KONTROLA: ten sam statek z wyczyszczoną misją LECI (ok=${rc?.ok} reason=${rc?.reason ?? '—'})`);
}

// ═══ T2d — bramka obejmuje WSZYSTKIE typy, `patrol` włącznie ══════════════════
header('T2d  jedna bramka, dziesięć typów rozkazu');
{
  const { vMgr, mos } = scene();
  // ⚠ `patrol` NIE przechodzi przez `_issueMoveToPoint` (buduje własny order, `MOS:1667`),
  //   więc bramka postawiona tam byłaby nieutwardzonym bliźniakiem. Ten pin to pilnuje.
  const specs = [
    ['moveToPoint', { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } }],
    ['dock',        { type: ORDER_TYPES.dock, targetBodyId: 'f_b', targetPoint: { x: 7 * AU, y: 0 } }],
    ['patrol',      { type: ORDER_TYPES.patrol, patrolRoute: [{ x: 2 * AU, y: 0 }, { x: 7 * AU, y: 0 }] }],
    ['goToPOI',     { type: ORDER_TYPES.goToPOI, poiId: 'poi_x' }],
    ['pursue',      { type: ORDER_TYPES.pursue, targetEntityId: 'v_zzz' }],
    ['intercept',   { type: ORDER_TYPES.intercept, targetEntityId: 'v_zzz' }],
    ['engage',      { type: ORDER_TYPES.engage, targetEntityId: 'v_zzz' }],
    ['escort',      { type: ORDER_TYPES.escort, targetEntityId: 'v_zzz' }],
    ['retreat',     { type: ORDER_TYPES.retreat }],
    ['attack',      { type: ORDER_TYPES.attack, targetBodyId: 'f_b' }],
  ];
  let covered = 0;
  const misses = [];
  for (const [label, spec] of specs) {
    const v = warpShip(vMgr, { auX: 2 });
    const r = mos.issueOrder(v.id, spec);
    if (r?.reason === 'vessel_in_warp_transit') covered++; else misses.push(`${label}:${r?.reason ?? r?.ok}`);
  }
  assert(specs.length === 10, `T2d KONTROLA: sprawdzono WSZYSTKIE 10 typów z ORDER_TYPES (${specs.length})`);
  assert(covered === 10, `T2d wszystkie 10 typów odrzucone powodem warp (pominięte: ${misses.join(', ') || 'brak'})`);
}

// ═══ T3 — NON-EVENT: MISJA ═══════════════════════════════════════════════════
header('T3  non-event — misja skoku PRZEŻYWA odmowę');
{
  const { vMgr, mos } = scene();
  const v = warpShip(vMgr);
  const missionRef = v.mission;                    // referencja SPRZED wywołania

  mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } });

  assert(v.mission === missionRef,
    'T3a misja to TEN SAM obiekt (referencja), nie odtworzony klon');
  // ⚠ POZYTYWNA tożsamość — patrz nagłówek: negatyw sam przechodzi jałowo.
  assert(v.mission?.type === 'interstellar_jump',
    `T3b mission.type nadal 'interstellar_jump' (dostano: ${v.mission?.type})`);
  assert(v.mission?.phase === 'warp_transit',
    `T3c mission.phase nadal 'warp_transit' (dostano: ${v.mission?.phase})`);
  assert(v.mission?.toSystemId === 'sys_099',
    `T3d cel skoku NIE przepadł (toSystemId=${v.mission?.toSystemId})`);
  assert(v.movementOrder == null,
    `T3e odmowa nie zainstalowała rozkazu (movementOrder=${v.movementOrder ? 'JEST' : 'null'})`);
  assert(v.position.state === 'in_transit' && v.position.dockedAt === null && v.status === 'on_mission',
    `T3f stan lotu nietknięty (${v.position.state}/${v.position.dockedAt}/${v.status})`);
}

// ═══ T4 — NON-EVENT: PALIWO ══════════════════════════════════════════════════
header('T4  non-event — paliwo nietknięte (delta vs KOSZT TEGO KURSU)');
{
  const { vMgr, mos } = scene();

  // (1) Bliźniak NIE-warp wykonuje DOKŁADNIE ten sam rozkaz z tej samej pozycji.
  //     Jego delta JEST kosztem tego kursu — mierzymy go, nie wyprowadzamy wzorem.
  //     ⚠ To jest cała treść lekcji „threshold-scale false green" (slice 150): próg
  //       „mniej niż pół baku" przechodziłby na ZEPSUTYM kodzie, bo kurs jest o rzędy
  //       wielkości tańszy niż pojemność.
  const twin = ship(vMgr, { sys: 'sys_061', auX: 2 });
  const twinFuel0 = twin.fuel.current;
  const twinWarp0 = twin.warpFuel.current;
  const rt = mos.issueOrder(twin.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } });
  const courseCost = twinFuel0 - twin.fuel.current;
  assert(rt?.ok === true && courseCost > 0,
    `T4a KONTROLA: bliźniak nie-warp POLECIAŁ i kurs coś kosztuje (ok=${rt?.ok}, koszt=${courseCost.toFixed(3)})`);

  // (2) Statek w skoku — po odmowie delta musi być DOKŁADNIE zero, przy niezerowym koszcie kursu.
  const v = warpShip(vMgr);
  const fuel0 = v.fuel.current;
  const warp0 = v.warpFuel.current;
  mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } });
  const delta = fuel0 - v.fuel.current;
  assert(delta === 0,
    `T4b paliwo in-system NIETKNIĘTE: delta=${delta} przy koszcie kursu ${courseCost.toFixed(3)}`);

  // (3) KONTROLA `warpFuel` — przechodzi PO OBU STRONACH naprawy i tak ma być.
  //     `warp_cores` pobiera Z GÓRY `dispatchInterstellar` (`VesselManager:895`), a `moveToPoint`
  //     nie tyka `warpFuel` w ogóle — dowodzi tego bliźniak niżej. Realna szkoda 147 to
  //     FORFEITURE zapłaconego skoku (misja ginie, rdzeni nikt nie zwraca), a tę pinuje T3.
  assert(v.warpFuel.current === warp0,
    `T4c KONTROLA (obie strony): warpFuel nietknięty przez odmowę (${warp0} → ${v.warpFuel.current})`);
  assert(twin.warpFuel.current === twinWarp0,
    `T4d KONTROLA (obie strony): warpFuel nietknięty także przez UDANY moveToPoint (${twinWarp0} → ${twin.warpFuel.current})`);
}

// ═══ T5 — NON-EVENT: STEMPEL systemId ════════════════════════════════════════
header('T5  non-event — brak stempla mis-homed');
{
  const { vMgr, mos } = scene();
  const v = warpShip(vMgr);

  mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } });
  assert(v.systemId === null,
    `T5a znacznik tranzytu zachowany (systemId=${v.systemId})`);

  // ⚠ DRUGIE wywołanie jest częścią pinu: bez niego „nadal null" przechodzi, bo w tym teście
  //   reconciler po prostu nie biegł. W grze biegnie CO TIK (`VesselManager:2311`).
  const changed = vMgr._reconcileSystemId(v);
  assert(changed === false && v.systemId === null,
    `T5b _reconcileSystemId NIE stempluje (zmienił=${changed}, systemId=${v.systemId})`);

  // ⚠ KONTROLA „stempluje, gdy legalnie" — dowód, że reconciler jest ŻYWY, a zieleń T5b nie
  //   pochodzi z inertnej funkcji. To jest DOKŁADNIE stan po-147 (misja zabita, systemId null).
  const w = warpShip(vMgr, { auX: 2 });
  w.mission = { type: 'move_to_point', targetId: null };   // tak wyglądał świat PRZED naprawą
  const changed2 = vMgr._reconcileSystemId(w);
  assert(changed2 === true && w.systemId === 'sys_home',
    `T5c KONTROLA: reconciler stempluje 'sys_home', gdy misja skoku zginęła (zmienił=${changed2}, systemId=${w.systemId})`);
}

// ═══ T6 — NON-EVENT: PODRÓŻ (D-VO3e) ═════════════════════════════════════════
header('T6  non-event — trasa warp i rekord misji nietknięte');
{
  const { vMgr, mos } = scene();
  let abortJourneyCalls = 0, abortMissionCalls = 0;
  window.KOSMOS.warpRouteSystem = { abortJourney: () => { abortJourneyCalls++; } };
  window.KOSMOS.missionSystem   = { abortMissionsForVessel: () => { abortMissionCalls++; } };

  const v = warpShip(vMgr);
  const sentinel = { kind: 'transport', targetId: 'p_home', targetSystemId: 'sys_099' };
  v.pendingOrder = sentinel;
  v.warpRoute = { hops: ['sys_099'], idx: 0 };

  mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } });
  assert(abortJourneyCalls === 0 && abortMissionCalls === 0,
    `T6a odmowa nie przerwała podróży ani rekordu (abortJourney=${abortJourneyCalls}, abortMissions=${abortMissionCalls})`);
  assert(v.pendingOrder === sentinel && v.warpRoute != null,
    'T6b composite (`pendingOrder`) i `warpRoute` nietknięte — TEN SAM obiekt');

  // ⚠ KONTROLA D-VO3e — atrapy MUSZĄ być wołane na ścieżce UDANEGO rozkazu, inaczej T6a
  //   mierzy „stub nie jest wpięty", nie „naprawa działa". Statek SPOZA warpu z żywą trasą.
  // ⚠ Liczymy DELTĘ, nie sumę bezwzględną: na kodzie SPRZED naprawy T6a już podbił licznik,
  //   więc `=== 1` czyniłoby z kontroli drugą ofiarę defektu. Kontrola ma być zielona
  //   PO OBU STRONACH — inaczej nie jest kontrolą.
  const j0 = abortJourneyCalls, m0 = abortMissionCalls;
  const u = ship(vMgr, { sys: 'sys_061', auX: 2 });
  u.pendingOrder = { kind: 'transport', targetId: 'p_home', targetSystemId: 'sys_061' };
  u.warpRoute = { hops: ['sys_061'], idx: 0 };
  const ru = mos.issueOrder(u.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { ...POINT } });
  assert(ru?.ok === true && (abortJourneyCalls - j0) === 1 && (abortMissionCalls - m0) === 1,
    `T6c KONTROLA: udany rozkaz NADAL sprząta (ok=${ru?.ok}, ΔabortJourney=${abortJourneyCalls - j0}, ΔabortMissions=${abortMissionCalls - m0})`);

  delete window.KOSMOS.warpRouteSystem;
  delete window.KOSMOS.missionSystem;
}

// ═══ T7 — GŁOŚNA ODMOWA (wykonaniowo, przez PRAWDZIWY RightClickMenu) ════════
header('T7  odmowa jest GŁOŚNA — prawdziwy łańcuch PPM → Dziennik');
{
  // ⚠ Cicha odmowa zamieniłaby defekt na NIEWIDZIALNOŚĆ (klasa „reasonless failure reads
  //   as unfixed", re-gate Findingu 125). Dlatego pinujemy CAŁĄ drogę WYKONANIEM:
  //   prawdziwa opcja z `buildMenuOptions` → prawdziwy `_handleOptionClick` → payload
  //   `eventLogSystem.push`. Sam klucz i18n bez tej drogi nie dowodzi niczego.
  const { vMgr, mos } = scene();
  const v = warpShip(vMgr);
  const pushed = [];
  Object.assign(window.KOSMOS, {
    uiManager: { getSelectedVesselId: () => v.id, getSelectedVesselIds: () => [v.id] },
    eventLogSystem: { push: (e) => pushed.push(e) },
  });

  const target = { type: 'empty', worldPoint: { x: POINT.x, y: POINT.y } };
  const opts = buildMenuOptions(target, { vesselId: v.id });
  const moveOpt = opts.find(o => o.id === 'moveToPoint');
  assert(!!moveOpt && moveOpt.action === 'issueOrder' && moveOpt.orderType === 'moveToPoint',
    `T7a KONTROLA: „Leć tutaj" JEST oferowane statkowi w skoku (opcja ${moveOpt ? 'jest' : 'BRAK'}) — bramka jest ADMISYJNA, nie ofertowa`);

  const locale0 = getLocale();
  setLocale('pl');
  new RightClickMenu()._handleOptionClick(moveOpt, target);
  assert(pushed.length === 1, `T7b DOKŁADNIE jeden wpis w Dzienniku (dostano: ${pushed.length})`);
  const e = pushed[0] ?? {};
  assert(e.channel === 'fleet' && e.severity === 'warn',
    `T7c kanał/waga: fleet/warn (dostano: ${e.channel}/${e.severity})`);
  assert(typeof e.text === 'string' && e.text.includes('Statek jest w skoku międzygwiezdnym'),
    `T7d PL: tekst niesie POWÓD, nie surowy slug → „${e.text}"`);
  assert(!/vessel_in_warp_transit/.test(e.text ?? ''),
    'T7e PL: w tekście NIE MA surowego sluga (klucz i18n istnieje i został trafiony)');

  pushed.length = 0;
  setLocale('en');
  new RightClickMenu()._handleOptionClick(moveOpt, target);
  const eEn = pushed[0] ?? {};
  assert(typeof eEn.text === 'string' && eEn.text.includes('interstellar transit')
         && !/vessel_in_warp_transit/.test(eEn.text),
    `T7f EN: własny tekst, bez sluga → „${eEn.text}"`);
  // ⚠ Bez tego pinu reużycie `reasonTargetOtherSystem` przeszłoby T7d/T7f niezauważone.
  assert(t('vessel.reasonVesselInWarpTransit') !== t('vessel.reasonTargetOtherSystem'),
    'T7g powód warp jest WŁASNYM tekstem, nie reużyciem „najpierw skok warp" (D-147b)');
  setLocale(locale0);

  delete window.KOSMOS.uiManager;
  delete window.KOSMOS.eventLogSystem;
}

// ═══ T8 — ANTY-JAŁOWOŚĆ: naprawa NIE jest „odmawiaj wszystkiego" ═════════════
header('T8  anty-jałowość — legalne rozkazy nadal przechodzą');
{
  const { vMgr, mos } = scene();
  const v = ship(vMgr, { sys: 'sys_home', auX: 1 });
  const r = mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 4 * AU, y: 0 } });
  assert(r?.ok === true && v.mission != null && v.mission.type === 'move_to_point',
    `T8 goły punkt WE WŁASNYM układzie leci (ok=${r?.ok}, mission=${v.mission?.type})`);

  const u = ship(vMgr, { sys: 'sys_home', auX: 1 });
  const h2 = EntityManager.get('h2');
  const r2 = mos.issueOrder(u.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { x: h2.x, y: h2.y } });
  assert(r2?.ok === true && u.mission?.targetId === 'h2',
    `T8b snap na WŁASNE ciało nadal śledzi (ok=${r2?.ok}, targetId=${u.mission?.targetId})`);
}

// ═══ T9 — KONTROLA: composite 254 nietknięty ═════════════════════════════════
header('T9  kontrola 254 — composite cross-system żyje');
{
  const { vMgr, mos } = scene();
  const os = new OrderService();
  let beginJourneyCalls = 0;
  Object.assign(window.KOSMOS, {
    orderService: os,
    // ⚠ `getSystem` MUSI być truthy, inaczej `issueMove` skręca w gałąź MGŁY
    //   (`target_system_unknown`, `OrderService:112-113`) i pin mierzy Finding 186,
    //   a nie composite.
    starSystemManager: { getSystem: () => ({ id: 'sys_home' }) },
    warpRouteSystem: { beginJourney: () => { beginJourneyCalls++; return { ok: true }; } },
  });

  const v = ship(vMgr, { sys: 'sys_061', auX: 2 });
  const h2 = EntityManager.get('h2');
  const r = os.issueMove(v.id, {
    type: 'moveToPoint', targetBodyId: 'h2', targetPoint: { x: h2.x, y: h2.y },
  });
  assert(r?.ok === true && r?.composite === true && beginJourneyCalls === 1,
    `T9a cel-CIAŁO w innym układzie → COMPOSITE, nie odmowa (ok=${r?.ok}, composite=${r?.composite}, skoki=${beginJourneyCalls})`);
  assert(r?.reason !== 'vessel_in_warp_transit' && r?.reason !== 'target_other_system',
    `T9b composite nie zderza się z żadną bramką układu (reason=${r?.reason ?? '—'})`);
  assert(v.pendingOrder?.kind === 'move' && v.pendingOrder?.targetSystemId === 'sys_home',
    `T9c composite zapisany na statku (kind=${v.pendingOrder?.kind}, cel=${v.pendingOrder?.targetSystemId})`);

  os.destroy();
  delete window.KOSMOS.orderService;
  delete window.KOSMOS.starSystemManager;
  delete window.KOSMOS.warpRouteSystem;
}

// ═══ T10 — KONTROLA D-FDk: ucieczka NIE jest kolateralem ═════════════════════
header('T10  kontrola D-FDk — ucieczka z bitwy nietknięta');
{
  const { vMgr, mos } = scene();
  // Ciało schronienia MUSI istnieć w układzie statku i leżeć POZA bąblem starcia.
  const v = ship(vMgr, { sys: 'sys_061', auX: 2 });
  v.unpaidYears = 5;                                   // zaległe utrzymanie → immobilized
  assert(vMgr.isImmobilized(v) === true,
    'T10a KONTROLA: statek JEST unieruchomiony (inaczej pin mierzyłby brak kary)');

  const enc = { location: { point: { x: 2 * AU, y: 0 } }, isActive: true };
  window.KOSMOS.deepSpaceCombatSystem = { _findActiveEncounterContaining: (id) => (id === v.id ? enc : null) };

  const rMove = mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 7 * AU, y: 0 } });
  assert(rMove?.ok === false && rMove?.reason === 'vessel_immobilized',
    `T10b KONTROLA: zwykły ruch TEGO SAMEGO statku odrzucony za dług (reason=${rMove?.reason})`);

  const rRet = mos.issueOrder(v.id, { type: ORDER_TYPES.retreat });
  assert(rRet?.ok === true,
    `T10c ucieczka z bitwy PRZECHODZI mimo długu — D-FDk nietknięte (ok=${rRet?.ok}, reason=${rRet?.reason ?? '—'})`);

  // ⚠ Dlaczego nowy termin NIE MOŻE odebrać ucieczki: statek w skoku nie może być w starciu,
  //   bo DSCS bramkuje `isSameSystemStrict`, a ta dla `systemId === null` jest fail-CLOSED.
  const w = warpShip(vMgr, { auX: 2 });
  const body = EntityManager.get('f_b');
  assert(isSameSystemStrict(w, body) === false,
    'T10d isSameSystemStrict(statek w skoku, ciało) === false — warstwa walki go NIE wpuszcza');
  assert(isSameSystem(w, body) === true,
    'T10e KONTROLA: isSameSystem (fail-OPEN) mówi `true` — dlatego NIE nadaje się na tę bramkę');
  const rRetW = mos.issueOrder(w.id, { type: ORDER_TYPES.retreat });
  assert(rRetW?.reason === 'vessel_in_warp_transit',
    `T10f statek w skoku odrzucony POWODEM WARP, nie "not_in_combat" (reason=${rRetW?.reason}) — termin stoi NAD bypassem`);

  delete window.KOSMOS.deepSpaceCombatSystem;
}

// ═══ T11 — PIN ŹRÓDŁOWY: położenie terminu ═══════════════════════════════════
header('T11  pin źródłowy — termin nad `isRetreat`, poza `_dispatchByType`');
{
  const MOS_PATH = new URL('../../systems/MovementOrderSystem.js', import.meta.url);
  const raw = readFileSync(MOS_PATH, 'utf8');
  // ⚠ KOMENTARZE ZDJĘTE — inaczej pin trafiałby w opis, nie w kod (reguła
  //   `source-pin-strip-comments`). Ten plik JEST gęsto komentowany i wymienia
  //   `vessel_in_warp_transit` w komentarzu GameConfig-owym stylu kilka razy.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  /** Sprawdzenie położenia — WYDZIELONE, żeby dało się je puścić na zmutowanej kopii. */
  const placementOk = (src) => {
    const iGuard   = src.indexOf("reason: 'vessel_in_warp_transit'");
    const iRetreat = src.indexOf('const isRetreat = isRetreatSpec(spec)');
    const iBranch  = src.indexOf('this._dispatchByType(vessel, spec)');
    const iMove    = src.indexOf('_issueMoveToPoint(vessel, spec) {');
    if (iGuard < 0 || iRetreat < 0 || iBranch < 0) return { ok: false, why: 'kotwica nieznaleziona' };
    if (iGuard > iRetreat) return { ok: false, why: 'termin PONIŻEJ isRetreat' };
    if (iGuard > iBranch)  return { ok: false, why: 'termin PONIŻEJ _dispatchByType' };
    if (iMove >= 0 && iGuard > iMove) return { ok: false, why: 'termin w _issueMoveToPoint' };
    return { ok: true, why: '' };
  };

  const res = placementOk(code);
  assert(res.ok, `T11a termin stoi nad "isRetreat" i przed rozgałęzieniem typów (${res.why || 'OK'})`);

  const occurrences = (code.match(/vessel_in_warp_transit/g) ?? []).length;
  assert(occurrences === 1,
    `T11b termin istnieje w kodzie DOKŁADNIE raz — brak drugiej kopii (${occurrences})`);

  // ⚠ KONTROLA PINU — przenieś blok pod `isRetreat` i sprawdź, że checker ODRZUCA.
  //   Bez tego T11a jest zgadywaniem: przechodziłby też dla kodu, którego nie umie ocenić.
  const guardBlock = code.match(/if \(GAME_CONFIG\.FEATURES\?\.warpTransitOrderGate\)[\s\S]*?\n {4}\}\n/);
  assert(!!guardBlock, 'T11c KONTROLA: blok bramki wycięty ze źródła (kotwica mutacji istnieje)');
  if (guardBlock) {
    const moved = code.replace(guardBlock[0], '')
      .replace('const isRetreat = isRetreatSpec(spec)',
               'const isRetreat = isRetreatSpec(spec);\n' + guardBlock[0]);
    const resMoved = placementOk(moved);
    assert(resMoved.ok === false && /PONIŻEJ isRetreat/.test(resMoved.why),
      `T11d KONTROLA: przeniesiona kopia jest ODRZUCANA (${resMoved.why || 'PRZESZŁA — pin nic nie mierzy'})`);
  }

  // Argument POKRYCIA: jedna linia obejmuje 10 typów tylko dlatego, że `_dispatchByType`
  // ma DOKŁADNIE jednego wołającego. Gdyby ktoś dodał drugie wejście — ten pin pada.
  const dispatchCalls = (code.match(/this\._dispatchByType\(/g) ?? []).length;
  assert(dispatchCalls === 1,
    `T11e "_dispatchByType" ma DOKŁADNIE jednego wołającego — bramka w "issueOrder" pokrywa wszystko (${dispatchCalls})`);

  // Bramka jest pod flagą — brak klucza = OFF (D-147c).
  assert(/GAME_CONFIG\.FEATURES\?\.warpTransitOrderGate/.test(code),
    'T11f termin bramkowany flagą `warpTransitOrderGate` (ścieżka rollbacku)');
  assert(GAME_CONFIG.FEATURES.warpTransitOrderGate === true,
    'T11g flaga default ON');
}

// ═══ T12 — ZASIĘG AI: zero promienia rażenia ═════════════════════════════════
header('T12  zasięg AI — obie pule wykluczają statek w skoku (ze ŚWIADKIEM)');
{
  const { vMgr } = scene();
  const cap = addBody('cap_061', 'sys_061', 3.00, 'Stolica AI');
  window.KOSMOS.directorProduction = { capitalOf: () => ({ planetId: cap.id }) };

  const mkAi = (patch = {}) => {
    const v = ship(vMgr, { sys: 'sys_061', auX: 3, modules: ['engine_ion', 'weapon_laser'] });
    v.ownerEmpireId = 'emp_001';
    v.isTestEnemy = true;                       // isEnemyVessel → true
    v.position.dockedAt = cap.id;
    v.position.state = 'docked';
    v.warpFuel = { current: 5, max: 5, consumption: 0.5 };
    Object.assign(v, patch);
    return v;
  };

  // ⚠ ŚWIADEK PRZECIW JAŁOWOŚCI: ten sam kadłub BEZ misji MUSI być w puli. Bez tego
  //   „pula nie zawiera statku w skopie" przechodzi na PUSTEJ puli i nie mierzy nic
  //   (lekcja `observatory_player_colonies`, pierwszy przebieg 3/11).
  const witness = mkAi();
  const off = new DirectorOffensive();
  const doc = new DirectorDoctrine();
  const strikeW = off.strikeReadyVessels('emp_001').map(v => v.id);
  const doctW   = doc._idleArmedAtCapital('emp_001').map(v => v.id);
  assert(strikeW.includes(witness.id),
    `T12a ŚWIADEK: kadłub bez misji JEST w puli uderzeniowej (${strikeW.join(',') || 'PUSTA'})`);
  assert(doctW.includes(witness.id),
    `T12b ŚWIADEK: kadłub bez misji JEST w puli doktrynalnej (${doctW.join(',') || 'PUSTA'})`);

  // Ten sam kadłub, jedyna zmiana = misja skoku. ⚠ Stan jest CELOWO sztuczny (zadokowany
  //   „w skoku"), żeby wyizolować TERMIN MISJI; w grze statek w skoku wypada z tych pul
  //   dodatkowo przez `dockedAt`/`systemId` — czyli obrona jest podwójna, nie pojedyncza.
  witness.mission = {
    type: 'interstellar_jump', toSystemId: 'sys_099', phase: 'warp_transit', arrivalYear: 140,
  };
  const strikeA = off.strikeReadyVessels('emp_001').map(v => v.id);
  const doctA   = doc._idleArmedAtCapital('emp_001').map(v => v.id);
  assert(!strikeA.includes(witness.id),
    `T12c statek w skoku NIE jest w puli uderzeniowej (${strikeA.join(',') || 'PUSTA'})`);
  assert(!doctA.includes(witness.id),
    `T12d statek w skoku NIE jest w puli doktrynalnej (${doctA.join(',') || 'PUSTA'})`);

  delete window.KOSMOS.directorProduction;
}

console.log(`\n════ warp_transit_order_gate_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail > 0 ? 1 : 0);
