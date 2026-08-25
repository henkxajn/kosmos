// VESSEL_ORDERS VO-3 (P1) — keeper D-VO3d: ODWRÓT przechodzi przez preempcję.
//
// PO CO: D-VO3d jest PODPISANE („zakres wymuszenia obejmuje `FleetSystem:585`"), ale do tego
// commitu NIEPINOWANE. Sweep świecił na zielono, bo preempcja była mierzona WYŁĄCZNIE na parze
// `moveToPoint` nad `moveToPoint` (`preempt_order_smoke` T3, `vessel_orders_seams` S5). Nie istniał
// ANI JEDEN test, w którym ŻYWY rozkaz INNEGO typu (`attack`) zostaje SKUTECZNIE przerwany — T2
// tamtego keepera dotyka `attack`, ale mierzy ścieżkę ODWROTNĄ (rozkaz ODRZUCONY ma NIE niszczyć
// uderzenia). Nie istniał też test asertujący `reason === 'superseded'` na PAYLOADZIE zdarzenia
// (tamte czytają wyłącznie `old.status` i licznik `seen.cancelled`).
//
// ⚠ TEN KEEPER POWSTAŁ, BO ŻYWY GATE B KROK 4 NIE DAŁ SIĘ DOMKNĄĆ W PRZEGLĄDARCE. TRZY pomiary
//   na żywo, TRZY RÓŻNE powody ciszy — żeby nikt nie przechodził tej drogi drugi raz:
//     • pomiar 1: `KOSMOS.debug.simulateBattleRetreat` HARDKODUJE `empireId:'player'`
//       (`GameScene.js:1365`), a `AutoRetreatSystem:56` na tej wartości WYCHODZI ⇒ producent nigdy
//       nie zawołał `issueOrder`. Instrument mierzył WŁASNĄ CISZĘ → pinuje T3.
//     • pomiar 2: po podaniu prawdziwego `ownerEmpireId` rozkaz odwrotu odpadł na
//       `target_other_system` (ZMIERZONE: `vessel:autoRetreatFailed`), bo
//       `_findNearestFriendlyPlanet` NIE MA terminu układu (Finding F-D) ⇒ preempcja znów
//       nietknięta → pinuje T4.
//     • pomiar 3 (2026-08-24, `v_49`): RĘCZNY ODWRÓT GRACZA (`ORDER_TYPES.retreat`, PPM) — statek
//       w `systemId:'sys_home'`, z żywą kolonią macierzystą W TYM SAMYM układzie, czyli najprostszy
//       możliwy przypadek — odpadł na `target_other_system` TAK SAMO jak pomiar 2.
//       ZMIERZONE: `_findNearestFriendlyPlanet` wskazał „Nowy Swiat Kochab" z `sys_008` w odległości
//       0,81 AU; rejestr encji jest PŁASKI przez 13 układów (`sys_home` = 32 ciała z 589).
//       ⇒ **F-D blokuje odwrót KAŻDEGO właściciela, gracza włącznie** — nie tylko AI bez kolonii
//       w układzie starcia.
//       ⚠ Odmowa jest DOWODEM, nie poszlaką: `_findBodyNearPoint` bierze ciało NAJBLIŻSZE punktowi,
//       a planeta stoi od WŁASNYCH współrzędnych w odległości 0 (nie do pobicia), zaś `isSameSystem`
//       jest FAIL-OPEN (`SystemScope.js:42`). Gdyby dobrana planeta była lokalna, bramka MUSIAŁABY
//       przepuścić. Drugie ogniwo tego samego braku = **Finding 138**.
//       ⚠ Skutek na żywo jest CICHY, nie zabójczy: `AutoRetreatSystem:136-139` emituje
//       `vessel:autoRetreatFailed` i NIE robi wraku — dlatego defekt nie rzucał się w oczy.
//       ⚠ Po drodze DRUGI, niezależny blocker: `vessel_immobilized` (`unpaidYears`) bramkuje TAKŻE
//       odwrót z bitwy, mimo dodatniego budżetu — statek, który nie płaci utrzymania, nie może uciec
//       ze starcia. Łączy się z otwartym pinem F6 (`fleet_upkeep_payer_smoke`, `_resolvePayHomeId`).
//       Pomiar wymagał ręcznego wyzerowania licznika.
//
// ⚠ DLATEGO POMIAR MIESZKA TUTAJ, A NIE W PRZEGLĄDARCE: kolaboratorzy `AutoRetreatSystem` są
//   WSTRZYKIWANI do konstruktora, więc atrapa `ColonyManager` z kolonią W TYM SAMYM UKŁADZIE omija
//   F-D całkowicie i zostawia w kadrze dokładnie JEDNĄ zmienną — preempcję. Aranżacja „kolonia AI
//   w układzie gracza" nie jest sztuczna: jedynym jej źródłem w grze jest PODBÓJ (`transferColony`
//   — przerzut własności w miejscu, `systemId` nietknięty), bo `EmpireStrategySystem._pickTargetSystem:368`
//   wyklucza układ gracza z normalnej ekspansji AI.
//
// ⚠ GRANICA DOWODU (nie mylić z zakresem): keeper pinuje, że odwrót DOCIERA do preempcji i że ona
//   go obsługuje. NIE pinuje ścieżki UI ani DSCS-owego wyzwalacza bitwy.
//   ⚠ ŻYWEGO GATE'U TEGO KROKU NIE DA SIĘ DZIŚ WYKONAĆ ŻADNĄ ARANŻACJĄ SCENY. Pierwotnie stało tu
//   „żywy gate zostaje na ręcznym odwrocie GRACZA, którego F-D nie blokuje" — **pomiar 3 to obalił**
//   i tamta droga jest zamknięta. Dopóki F-D żyje, KAŻDY producent odwrotu odpada PRZED preempcją,
//   na doborze celu. Krok 4 GATE B zamyka się NA TYM KEEPERZE; żywy gate wraca na stół dopiero po
//   naprawie F-D (poza VESSEL_ORDERS).
//
// ⚠ LUKA TRÓJDZIELNA, KTÓRĄ TO ZAMYKA (pin źródłowy zamykał tylko jedną trzecią):
//     (a) producent mógłby przekazać `spec.preempt === false` → pinuje T6 (grep, dziś ZERO).
//     (b) producent NIE DOCIERA do preempcji, bo rozkaz odpada PONIŻEJ rozgałęzienia typów → T4.
//     (c) producent w ogóle NIE WOŁA `issueOrder` (wyjście na `:56`) → T3.
//   (b) i (c) są niewidoczne dla grepa — zamyka je wyłącznie keeper na PRAWDZIWYM producencie.
//
// ⚠ AKTUALIZACJA (slice RETREAT_TARGET, `docs/design/RETREAT_TARGET_PLAN.md`): Finding F-D ZOSTAŁ
//   NAPRAWIONY. Wszystko powyżej opisuje stan SPRZED naprawy i zostaje jako zapis pomiarów — ale
//   dwa wnioski są już nieaktualne:
//     • „dopóki F-D żyje, KAŻDY producent odwrotu odpada PRZED preempcją" — nieaktualne. T4 został
//       ODWRÓCONY i pinuje teraz, że odwrót DOCIERA do preempcji także przy koloni w obcym układzie.
//     • „żywy gate wraca na stół dopiero po naprawie F-D" — warunek spełniony; gate jest wykonalny.
//   Inwariant D-VO3a stracił tu swojego producenta odmowy (odwrót przestał odpadać) i został
//   PRZENIESIONY do nowego bloku T4b, na powód `not_in_combat`.
//
// Uruchom: node src/testing/smoke/retreat_preempt_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { readFileSync }        from 'node:fs';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { MissionSystem }       from '../../systems/MissionSystem.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { WarpRouteSystem }     from '../../systems/WarpRouteSystem.js';
import { AutoRetreatSystem }   from '../../systems/AutoRetreatSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { ORDER_TYPES }         from '../../data/MovementOrderTypes.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = 110;

function resetWorld() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 0 }, activeSystemId: 'sys_home' };
}

function makeStore(seed = {}) {
  const inv = new Map(Object.entries(seed));
  return {
    inventory: inv,
    getAmount: (k) => inv.get(k) ?? 0,
    canAfford: () => true,
    spend: () => true,
    receive: () => {},
  };
}

/**
 * Świat: gwiazda + dom gracza + cel uderzenia + kolonia AI W TYM SAMYM UKŁADZIE (`p_ai`)
 * + kolonia AI w OBCYM układzie (`p_ai_far`, `sys_061`) — ta druga wyłącznie dla T4.
 */
function buildWorld() {
  EntityManager.add({ id: 'star_1', type: 'star', name: 'Słońce', systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: 'sys_home',
    x: 1 * AU, y: 0, explored: true });
  EntityManager.add({ id: 'p_tgt', type: 'planet', name: 'Cel', systemId: 'sys_home',
    x: -5 * AU, y: 0, explored: true });
  EntityManager.add({ id: 'p_ai', type: 'planet', name: 'Zdobycz AI', systemId: 'sys_home',
    x: 3 * AU, y: 0, explored: true });
  // ⚠ Gwiazda KAŻDEGO układu stoi w (0,0), więc ciała obcych układów leżą w tej samej przestrzeni
  //   px co własne — to jest MECHANIZM Findingu F-D, nie skrót fixture'u.
  EntityManager.add({ id: 'p_ai_far', type: 'planet', name: 'Stolica AI', systemId: 'sys_061',
    x: 2 * AU, y: 0, explored: true });
  return { home: EntityManager.get('p_home'), tgt: EntityManager.get('p_tgt') };
}

/** Atrapa ColonyManager — JEDYNY nośnik informacji „gdzie ten właściciel ma dokąd uciec". */
function colonies(list) {
  return { activePlanetId: 'p_home', getColony: () => null, getAllColonies: () => list };
}

function scene(colonyList) {
  resetWorld();
  const w = buildWorld();
  const store = makeStore({ Fe: 1000, power_cells: 1000 });
  const vMgr = new VesselManager();
  const mos  = new MovementOrderSystem(vMgr);
  const wrs  = new WarpRouteSystem(vMgr);
  const ms   = new MissionSystem(store);
  const col  = colonies(colonyList);
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: w.home, vesselManager: vMgr, movementOrderSystem: mos,
    missionSystem: ms, expeditionSystem: ms, resourceSystem: store, warpRouteSystem: wrs,
    colonyManager: col,
    techSystem: {
      isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
      getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
    },
  });
  // ⚠ AutoRetreatSystem subskrybuje `battle:resolved` W KONSTRUKTORZE, a `resetWorld` robi
  //   `EventBus.clear()` — konstrukcja MUSI iść PO nim, inaczej subskrypcja ginie i keeper
  //   mierzyłby ciszę martwego listenera (ta sama pułapka co „listener przed `GameCore.boot()`").
  const ars = new AutoRetreatSystem(vMgr, col, mos);
  window.KOSMOS.autoRetreatSystem = ars;
  return { ...w, ms, mos, wrs, vMgr, ars, store };
}

function ship(vMgr, { modules = ['engine_ion'], x = 1 * AU, y = 0, owner = null, hull = 'hull_small' } = {}) {
  const v = vMgr.createAndRegister(hull, 'p_home', { name: 'Jednostka', modules: [...modules], x, y });
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  v.systemId = 'sys_home';
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  return v;
}

/** Statek AI z ŻYWYM uderzeniem — dokładnie konfiguracja zmierzona na żywo w GATE B krok 4. */
function raiderWithLiveStrike(s) {
  const ai = ship(s.vMgr, { hull: 'hull_frigate', owner: 'emp_001', x: 2 * AU, y: 2 * AU });
  const r = s.mos.issueOrder(ai.id, {
    type: ORDER_TYPES.attack, targetBodyId: 'p_tgt', bypassFuelCheck: true, bypassSpaceportCheck: true,
  });
  return { ai, ok: r?.ok === true, strike: ai.movementOrder };
}

/** Nasłuch sygnałów, które REALNIE rozróżniają ścieżki (pole `lowFuelDrift` tego NIE robi). */
function listen() {
  const log = [];
  const push = (ev) => (e) => log.push([ev, e]);
  for (const ev of ['vessel:orderCancelled', 'vessel:autoRetreatIssued',
                    'vessel:autoRetreatLowFuel', 'vessel:autoRetreatFailed', 'fleet:retreatTriggered']) {
    EventBus.on(ev, push(ev));
  }
  return {
    log,
    find: (ev) => log.find(r => r[0] === ev)?.[1] ?? null,
    all:  (ev) => log.filter(r => r[0] === ev).map(r => r[1]),
  };
}

const battleResolved = (vessel, empireId, battleId) => EventBus.emit('battle:resolved', {
  battleId,
  result: {
    retreated: 'A',
    participantA: { type: 'vessel_group', empireId, vesselIds: [vessel.id] },
  },
});

const AI_IN_SYSTEM  = [{ planetId: 'p_ai',     ownerEmpireId: 'emp_001', isOutpost: false, name: 'Zdobycz AI' }];
const AI_FAR_SYSTEM = [{ planetId: 'p_ai_far', ownerEmpireId: 'emp_001', isOutpost: false, name: 'Stolica AI' }];
const PLAYER_HOME   = [{ planetId: 'p_home',   isOutpost: false, name: 'Dom' }];

// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('T1 — SEDNO D-VO3d: odwrót przez PRAWDZIWEGO producenta przerywa ŻYWE uderzenie');
{
  const s = scene(AI_IN_SYSTEM);
  const ev = listen();
  const { ai, ok, strike } = raiderWithLiveStrike(s);
  assert(ok && strike?.status === 'active' && ai.mission?.type === 'attack',
    `T1 PRZESŁANKA: rajder ma ŻYWE uderzenie (order=${strike?.status}, mission=${ai.mission?.type}) ` +
    '— bez tego test mierzyłby preempcję nad pustką');

  // Duchy, które preempcja ma sprzątnąć (pkt 2 i 4 kontraktu `_preemptCommit`).
  ai._suspendedMission = { type: 'transport', targetId: 'p_tgt' };
  ai.pendingOrder      = { kind: 'transport', targetId: 'p_tgt' };

  battleResolved(ai, 'emp_001', 'btl_t1');

  const issued = ev.find('vessel:autoRetreatIssued') ?? ev.find('vessel:autoRetreatLowFuel');
  assert(!!issued && issued.vesselId === ai.id,
    'T1 PIN (a) — producent REALNIE zawołał `issueOrder`: `vessel:autoRetreat*` poszło. To jedyny ' +
    'sygnał rozróżniający „odwrót się udał" od „handler odpadł na bramce" — pole `lowFuelDrift` ' +
    'tego NIE robi (powstaje wyłącznie w gałęzi retry po `insufficient_fuel`)');

  const cancelled = ev.all('vessel:orderCancelled').find(e => e.orderId === strike?.id);
  assert(!!cancelled && cancelled.reason === 'superseded',
    `T1 PIN (b) — PODPIS PREEMPCJI NA PAYLOADZIE: \`orderCancelled\` niesie id PRZERWANEGO rozkazu ` +
    `i \`reason='${cancelled?.reason}'\`. ⚠ Id musi być STARE — z nowym \`FleetSystem\` wchodzi ` +
    'w gałąź `tracked !== orderId` i rozkaz floty NIGDY się nie domyka');

  assert(ai.movementOrder?.type === ORDER_TYPES.moveToPoint && ai.movementOrder?.id !== strike?.id
         && ai.movementOrder?.retreatFromBattleId === 'btl_t1',
    `T1 PIN (c) — rozkaz PODMIENIONY na odwrót (type=${ai.movementOrder?.type}, ` +
    `retreatFromBattleId=${ai.movementOrder?.retreatFromBattleId})`);

  assert(strike?.status === 'superseded',
    `T1 PIN (b') — stary rozkaz DOMKNIĘTY (status=${strike?.status}), nie porzucony jako 'active'`);

  assert(ai._suspendedMission === undefined,
    'T1 STRAŻNIK (pkt 2) — `_suspendedMission` skasowany. ⚠ To STRAŻNIK REGRESJI, NIE pin ' +
    'preempcji: dla `moveToPoint` snapshot kasuje `_issueMoveToPoint` od dawna. Realnym pinem ' +
    'punktu 2 jest `preempt_order_smoke` T7 (pursue)');

  assert(ai.pendingOrder == null,
    `T1 PIN (e, pkt 4 / Finding 126) — \`pendingOrder\` wyczyszczony (${JSON.stringify(ai.pendingOrder)})`);
}

header('T2 — KONTROLA PINU: przy `unifiedVesselOrders=false` wynik MUSI być INNY');
{
  const prev = GAME_CONFIG.FEATURES.unifiedVesselOrders;
  GAME_CONFIG.FEATURES.unifiedVesselOrders = false;
  try {
    const s = scene(AI_IN_SYSTEM);
    const ev = listen();
    const { ai, strike } = raiderWithLiveStrike(s);
    ai.pendingOrder = { kind: 'transport', targetId: 'p_tgt' };

    battleResolved(ai, 'emp_001', 'btl_t2');

    const issued = ev.find('vessel:autoRetreatIssued') ?? ev.find('vessel:autoRetreatLowFuel');
    assert(!!issued,
      'T2 PRZESŁANKA: odwrót wydany TAK SAMO jak przy ON — kill-switch nie dotyka producenta, ' +
      'tylko preempcji. Bez tej asercji T2 mógłby „przechodzić" z powodu zepsutego fixture\'u');

    const supersededByPreempt = ev.all('vessel:orderCancelled')
      .some(e => e.orderId === strike?.id && e.reason === 'superseded');
    assert(supersededByPreempt === false,
      'T2 KONTROLA PINU (b): przy OFF NIE MA `orderCancelled reason=superseded` na starym rozkazie ' +
      '— czyli T1 mierzy PREEMPCJĘ, a nie coś, co dzieje się tak czy owak');

    assert(ai.pendingOrder != null,
      `T2 KONTROLA PINU (e): przy OFF \`pendingOrder\` PRZEŻYWA (${JSON.stringify(ai.pendingOrder)}) ` +
      '— to jest różnica, którą T1 pinuje jako naprawę Findingu 126');

    assert(strike?.status !== 'superseded',
      `T2 KONTROLA PINU (b'): przy OFF stary rozkaz NIE jest domykany (status=${strike?.status}) ` +
      '— zachowanie sprzed VO-3 bit w bit');
  } finally {
    GAME_CONFIG.FEATURES.unifiedVesselOrders = prev;
  }
}

header("T3 — POMIAR 1 Z GATE B: literał empireId:'player' NIE dociera do producenta (luka „c\")");
{
  const s = scene(AI_IN_SYSTEM);
  const ev = listen();
  const { ai, strike } = raiderWithLiveStrike(s);

  // Dokładnie payload, który emituje `KOSMOS.debug.simulateBattleRetreat` (`GameScene.js:1359-1369`):
  // właściciel ZAHARDKODOWANY, niezależnie od tego, czyj statek wskazano przez `opts.vesselId`.
  battleResolved(ai, 'player', 'btl_t3');

  assert(ev.log.length === 0,
    `T3 PIN: ZERO sygnałów odwrotu (${ev.log.length}) — \`AutoRetreatSystem:56\` wychodzi na ` +
    "`side.empireId === 'player'` ZANIM dotknie statku. Dźwignia debug mierzyła własną ciszę");

  assert(ai.movementOrder === strike && strike?.status === 'active' && ai.mission?.type === 'attack',
    `T3 KONTROLA PINU: uderzenie NIETKNIĘTE (status=${strike?.status}, mission=${ai.mission?.type}) ` +
    '— cisza jest tu POPRAWNA, a nie objawem zepsutej preempcji');

  // Kontrola pinu do kontroli pinu: ten SAM statek w tym SAMYM świecie reaguje na poprawnego właściciela.
  battleResolved(ai, 'emp_001', 'btl_t3b');
  assert(ev.log.length > 0,
    'T3 KONTROLA PINU²: ten sam świat REAGUJE na prawdziwy `ownerEmpireId` — dowód, że cisza wyżej ' +
    'brała się z PAYLOADU, a nie z martwego harnessu');
}

header('T4 — ⚠ PIN ODWRÓCONY (slice RETREAT_TARGET): kolonia w OBCYM układzie ⇒ odwrót JEDNAK DZIAŁA');
{
  // ⚠ TEN TEST ZOSTAŁ ŚWIADOMIE ODWRÓCONY. W poprzednim kształcie pinował DEFEKT (Finding F-D):
  //   `_findNearestFriendlyPlanet` nie miało terminu układu, wskazywało kolonię z `sys_061`,
  //   a `_issueMoveToPoint` odrzucało rozkaz na `target_other_system` ⇒ odwrót nie działał
  //   dla NIKOGO. Naprawa (`docs/design/RETREAT_TARGET_PLAN.md`) przenosi dobór celu do
  //   `MovementOrderSystem.resolveShelterOrderSpec` → `utils/RetreatTarget.js`: cel szuka się
  //   WYŁĄCZNIE w układzie statku, a WŁASNOŚĆ jest kolejnością preferencji, nie filtrem.
  //   Skutkiem ubocznym jest to, czego GATE B nie mógł zmierzyć: odwrót DOCIERA do preempcji
  //   także tą ścieżką — czyli D-VO3d dostaje tu drugi, niezależny pin.
  const s = scene(AI_FAR_SYSTEM);
  const ev = listen();
  const { ai, strike } = raiderWithLiveStrike(s);

  battleResolved(ai, 'emp_001', 'btl_t4');

  const issued = ev.find('vessel:autoRetreatIssued');
  assert(!!issued && issued.vesselId === ai.id,
    `T4 PIN ODWRÓCONY: odwrót ZOSTAŁ WYDANY mimo że jedyna kolonia właściciela leży w \`sys_061\` ` +
    `(issued=${!!issued}). PRZED SLICE'EM leciało tu \`vessel:autoRetreatFailed\` z ` +
    '`reason=target_other_system`');

  const dest = EntityManager.get(ai.mission?.targetId);
  assert(!!dest && (dest.systemId ?? 'sys_home') === 'sys_home',
    `T4 PIN (rdzeń F-D): cel odwrotu leży w UKŁADZIE STATKU (targetId=${ai.mission?.targetId}, ` +
    `sys=${dest?.systemId ?? '—'}) — nie w \`sys_061\`, mimo że tam jest jedyna kolonia właściciela`);

  assert(ev.find('vessel:autoRetreatFailed') === null,
    'T4 KONTROLA PINU: ZERO odmów — inaczej test mierzyłby dalej starą ścieżkę');

  assert(strike?.status === 'superseded' && ai.movementOrder !== strike,
    `T4 PIN (D-VO3d, drugie źródło): UDANY odwrót PRZERYWA żywe uderzenie (strike=${strike?.status})`);

  assert(ai.isWreck !== true && ai.status !== 'destroyed',
    `T4 PIN SEMANTYKI: statek ŻYJE (isWreck=${ai.isWreck}, status=${ai.status}). Gałąź ` +
    '`_turnIntoWreck` została z `AutoRetreatSystem` USUNIĘTA (D-FDe) — brak celu nigdy nie zabija');
}

header('T4b — D-VO3a przeniesiony: ODRZUCONY odwrót nadal NIE niszczy żywego uderzenia');
{
  // ⚠ T4 był JEDYNYM pinem inwariantu D-VO3a na ścieżce odwrotu, a naprawa F-D odebrała mu
  //   producenta odmowy. Bez tego bloku inwariant zostałby BEZ STRAŻNIKA. Nowym producentem jest
  //   `not_in_combat` (rozkaz `retreat` bez aktywnego starcia) — odmowa PONIŻEJ rozgałęzienia
  //   typów, czyli dokładnie tam, gdzie jednofazowa preempcja skasowałaby uderzenie.
  //   ⚠ NIE `vessel_immobilized`: po D-FDk zaległości NIE blokują już ucieczki, więc ten powód
  //   nigdy by tu nie padł i pin mierzyłby ciszę.
  const s = scene(AI_IN_SYSTEM);
  const { ai, strike } = raiderWithLiveStrike(s);
  assert(strike?.status === 'active', 'T4b PRZESŁANKA: uderzenie żyje');

  const res = s.mos.issueOrder(ai.id, { type: ORDER_TYPES.retreat });
  assert(res?.ok === false && res?.reason === 'not_in_combat',
    `T4b KONTROLA PINU: odwrót ODRZUCONY z powodem (reason=${res?.reason}) — bez odmowy nie ma czego pinować`);

  assert(ai.movementOrder === strike && strike?.status === 'active',
    'T4b PIN (D-VO3a): odrzucony rozkaz NIE zniszczył żywego uderzenia — destrukcja wolno dopiero po `res.ok`');
}

header('T5 — SCENARIUSZ B: doktryna `retreat_at_50` (FleetSystem:585) też przechodzi przez preempcję');
{
  const s = scene(PLAYER_HOME);
  const ev = listen();
  const fs = new FleetSystem(s.vMgr);
  window.KOSMOS.fleetSystem = fs;

  // Statek GRACZA z żywym uderzeniem — `ORDER_TYPES.attack` jest rozkazem gracza (W3-4).
  const v = ship(s.vMgr, { hull: 'hull_frigate', x: 2 * AU, y: 2 * AU });
  const rA = s.mos.issueOrder(v.id, {
    type: ORDER_TYPES.attack, targetBodyId: 'p_tgt', bypassFuelCheck: true, bypassSpaceportCheck: true,
  });
  const strike = v.movementOrder;
  assert(rA?.ok === true && strike?.status === 'active',
    `T5 PRZESŁANKA: statek gracza ma ŻYWE uderzenie (${strike?.status})`);

  const fleet = fs.createFleet('Klin', { doctrine: 'retreat_at_50' });
  fs.addMember(fleet.id, v.id);
  assert(fleet.memberIds.includes(v.id), 'T5 PRZESŁANKA: statek jest członkiem floty');
  fleet.activeOrder = { _retreatTriggered: false };

  // Atrapa encountera DSCS — doktryna czyta WYŁĄCZNIE `_activeEncounters` (derived `_inCombat`).
  window.KOSMOS.deepSpaceCombatSystem = {
    _activeEncounters: new Map([['enc_1', {
      isActive: true, vesselStates: new Map([[v.id, { hp: 10, hpStart: 100 }]]),
    }]]),
  };

  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt' };
  fs._tickCivYears(0.6);   // akumulator doktryny wymaga ≥ 0.5 civYear

  const trig = ev.find('fleet:retreatTriggered');
  assert(!!trig && trig.retreatedIds?.includes(v.id),
    `T5 PRZESŁANKA: doktryna ODPALIŁA i wydała rozkaz (pct=${trig?.aggregateHpPct}) — ` +
    'bez tego reszta T5 mierzyłaby ciszę');

  const cancelled = ev.all('vessel:orderCancelled').find(e => e.orderId === strike?.id);
  assert(!!cancelled && cancelled.reason === 'superseded',
    `T5 PIN (D-VO3d, druga połowa): odwrót DOKTRYNALNY też przerywa żywy rozkaz ` +
    `(reason=${cancelled?.reason}). To TRZECI producent odwrotu z podpisu — omija ` +
    '`AutoRetreatSystem._issueRetreatOrder` i woła `mos.issueOrder` wprost');

  assert(v.pendingOrder == null,
    `T5 PIN: \`pendingOrder\` wyczyszczony także tą ścieżką (${JSON.stringify(v.pendingOrder)})`);

  fs.destroy?.();
}

header('T6 — PIN ŹRÓDŁOWY (luka „a"): żaden producent odwrotu nie wypisuje się z preempcji');
{
  // ⚠ Komentarze ZDEJMOWANE — inaczej pin łapie własne wyjaśnienie (wzór `source-pin-strip-comments`).
  const strip = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

  const files = [
    '../../systems/AutoRetreatSystem.js',
    '../../systems/FleetSystem.js',
    '../../systems/MovementOrderSystem.js',
  ];
  const optOut = files.filter(f => /preempt\s*:\s*false/.test(strip(f)));
  assert(optOut.length === 0,
    `T6 PIN: ZERO producentów z \`preempt:false\` (${optOut.join(', ') || 'brak'}) — jedyny opt-out ` +
    "w kodzie (`_preemptSnapshot`) nie ma produkcyjnego call-site'u. ⚠ Nagłówek keepera szwów (S3) " +
    'zapowiadał, że „ścieżki systemowe wołają z `{preempt:false}`" — NIE zostało to zaimplementowane; ' +
    'preempcja jest BEZWARUNKOWA. Ten pin trzyma zgodność opisu z kodem');

  // Kontrola pinu: wzorzec DZIAŁA — łapie sztucznie wstrzykniętą frazę.
  assert(/preempt\s*:\s*false/.test('issueOrder(id, { type: "x", preempt: false })'),
    'T6 KONTROLA PINU: wzorzec wykrywa `preempt: false` — bez tego zielone T6 znaczyłoby ' +
    '„grep nic nie znalazł, bo jest zepsuty"');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
