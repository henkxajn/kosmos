// VESSEL_ORDERS VO-3 (ruch P1) — keeper PREEMPCJI: nowy rozkaz przerywa i zastępuje stary.
//
// PO CO: `MovementOrderSystem.issueOrder` nie wołał `cancelOrder`, nie dotykał rekordu misji i nie
// czyścił `pendingOrder` — nadpisywał pola i tyle. Skutkiem były Findingi **118** (statek sam wraca
// do poprzedniej roboty), **119** (martwy marker wypycha statek z trzech pul), **126** (composite
// przeżywa przekierowanie), **127** (`vessel:orderIssued` bez subskrybenta).
// Plan: `docs/design/VESSEL_ORDERS_PLAN.md` §1 (P1) · **D-VO1 = W1** · **D-VO1b = W1 ROZDZIELONE**
// · poprawki **D-VO3a-d** (§3.1.4b, podpisane po pomiarze).
//
// ⚠ CZTERY POPRAWKI DO WARUNKÓW MECHANICZNYCH — każda wymuszona POMIAREM, każda pinowana niżej:
//   • **D-VO3a (T1, T2)** — `_preempt` jest DWUFAZOWY, destrukcja dopiero po `res.ok`. Warunek
//     „POD bramkami" pokrywał 5 z ~30 ścieżek odmowy; ~25 leży PONIŻEJ rozgałęzienia typów.
//     ⚠ Najdotkliwszy przypadek to JEDNO KLIKNIĘCIE: „Zaangażuj" na statku bez broni → `no_weapons`
//     ⇒ odrzucony rozkaz kasowałby ŻYWE uderzenie.
//   • **D-VO3b (T5, T6)** — `_preempt` ZERUJE `vessel.mission`, ale NIE w `warp_transit`.
//     Bez zerowania: ZMIERZONY skok **5,05 AU w jednym tiku 0,001 roku** (regresja klasy Findingu
//     116 w commicie, który ma zamykać 118/119/126/127), bo para `orbiting` + żywa misja wpada
//     w `VesselManager._updatePositions:2224` i PINUJE statek do `m.targetId`.
//     ⚠ Guard warp jest obowiązkowy: MOS nie ma ŻADNEJ bramki na `warp_transit`, a `_reconcileSystemId`
//     i cała Slice A stoją na `mission.toSystemId`.
//   • **D-VO3c (T7)** — punkt 2 rusza `_suspendMissionIfAny`, nie tylko wejście intentu. Samo
//     `delete _suspendedMission` na wejściu jest NO-OPEM: cztery call-site'y odtwarzają snapshot
//     w TEJ SAMEJ RAMCE. ⚠ DETEKTOR: jeśli `moveto_no_return` dalej daje 15/15, punkt 2 nie wszedł.
//   • **D-VO3d (T8)** — `OrderService.issueReturn` WYŁĄCZONY z preempcji: `_preempt` skasowałby
//     `pendingOrder` PRZED snapshotem `ReturnJump.js:58` i **cofnął Finding 125**.
//
// ⚠ T2 JEST SEDNEM GATE B I POWSTAŁ, BO SWEEP TEGO NIE MIERZYŁ. `w3_attack_dispatch` przechodzi
//    36/36, ale przy **`liveOrder = 0`** — w całym sweepie preempcja nad ŻYWYM rozkazem odpala
//    dokładnie raz i NIE na statku AI. Tamten keeper dowodzi więc „preempcja nie psuje normalnej
//    ścieżki AI", a NIE „preempcja nad żywym uderzeniem AI jest bezpieczna". T2 mierzy to drugie.
//
// ⚠ DWA OGRANICZENIA IMPLEMENTACJI, oba zmierzone i oba pinowane pośrednio przez T3/T9:
//    `_preempt` NIE MOŻE stać na `cancelOrder` (jej `_stopVesselMotion` zdemolowałby świeży rozkaz)
//    ani na `MissionSystem.cancelMission` (to alias `_orderReturn` — ODSYŁA STATEK DO DOMU
//    i NIE zamyka rekordu). Właściwy prymityw to kształt `_onVesselWrecked` z VO-2.
//
// Uruchom: node src/testing/smoke/preempt_order_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { MissionSystem }       from '../../systems/MissionSystem.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { WarpRouteSystem }    from '../../systems/WarpRouteSystem.js';
import { TransportOrderSystem } from '../../systems/TransportOrderSystem.js';
import gameState              from '../../core/GameState.js';
import { ORDER_TYPES }         from '../../data/MovementOrderTypes.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = 110;
const distAU = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / AU;

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

function buildWorld() {
  EntityManager.add({ id: 'star_1', type: 'star', name: 'Słońce', systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: 'sys_home',
    x: 1 * AU, y: 0, explored: true });
  EntityManager.add({ id: 'ast_1', type: 'asteroid', name: 'Skała', systemId: 'sys_home',
    x: 0, y: 6 * AU, explored: true,
    deposits: [{ resourceId: 'Fe', richness: 2.0, remaining: 500 }] });
  EntityManager.add({ id: 'p_tgt', type: 'planet', name: 'Cel', systemId: 'sys_home',
    x: -5 * AU, y: 0, explored: true });
  return {
    home: EntityManager.get('p_home'), rock: EntityManager.get('ast_1'), tgt: EntityManager.get('p_tgt'),
  };
}

function scene() {
  resetWorld();
  const w = buildWorld();
  const store = makeStore({ Fe: 1000, C: 1000, Si: 1000, water: 1000, power_cells: 1000 });
  const vMgr = new VesselManager();
  const mos  = new MovementOrderSystem(vMgr);
  const wrs  = new WarpRouteSystem(vMgr);
  const ms   = new MissionSystem(store);
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: w.home, vesselManager: vMgr, movementOrderSystem: mos,
    missionSystem: ms, expeditionSystem: ms, resourceSystem: store, warpRouteSystem: wrs,
    colonyManager: { activePlanetId: 'p_home', getColony: () => null },
    techSystem: {
      isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
      getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
    },
  });
  return { ...w, ms, mos, wrs, vMgr, store };
}

/** Statek gracza (bez broni, chyba że podano moduły). Domyślnie ORBITUJE — omija bramkę portu. */
function ship(vMgr, { modules = ['engine_ion'], x = 1 * AU, y = 0, owner = null, hull = 'hull_small' } = {}) {
  const v = vMgr.createAndRegister(hull, 'p_home', { name: 'Jednostka', modules: [...modules], x, y });
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  return v;
}

/** Statek ZADOKOWANY — konieczny do wystartowania misji.
 *  UWAGA: po VO-2 `dispatchOnMission` odmawia statkowi na orbicie, a `_abortLaunch` KASUJE rekord,
 *  więc fixture z orbitującym statkiem mierzyłby brak rekordu, a nie preempcję (złapane fail-first). */
function docked(vMgr, opts = {}) {
  const v = ship(vMgr, opts);
  v.position.state = 'docked';
  v.position.dockedAt = 'p_home';
  return v;
}

const MOVE = (y) => ({
  type: ORDER_TYPES.moveToPoint, targetPoint: { x: 0, y: y * AU },
  bypassFuelCheck: true, bypassSpaceportCheck: true,
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('T1 — DWUFAZOWOŚĆ (D-VO3a): ODRZUCONY rozkaz nie niszczy żywego');
{
  const s = scene();
  const v = ship(s.vMgr);                                   // BEZ modułu broni
  const r1 = s.mos.issueOrder(v.id, MOVE(-4));
  const live = v.movementOrder;
  assert(r1?.ok === true && live?.status === 'active',
    `T1 PRZESŁANKA: statek ma ŻYWY rozkaz (${live?.status})`);

  // Odmowa PONIŻEJ rozgałęzienia typów — dokładnie ta, którą gracz wywoła jednym kliknięciem.
  const prey = ship(s.vMgr, { x: 4 * AU, y: 4 * AU });
  const r2 = s.mos.issueOrder(v.id, { type: ORDER_TYPES.engage, targetEntityId: prey.id });
  assert(r2?.ok === false && r2?.reason === 'no_weapons',
    `T1 PRZESŁANKA: rozkaz ODRZUCONY poniżej rozgałęzienia typów (${r2?.reason}) — ` +
    'bramki `:193`/`:205` go NIE łapią, więc jednofazowy `_preempt` już by zniszczył rozkaz wyżej');

  assert(v.movementOrder === live && live.status === 'active',
    `T1 PIN (D-VO3a): żywy rozkaz NIETKNIĘTY po odmowie (status=${live.status}) — destrukcja ` +
    'wolno dopiero po `res.ok`');
}

header('T2 — SEDNO GATE B: żywe uderzenie AI przeżywa ODRZUCONY rozkaz');
{
  const s = scene();
  const ai = ship(s.vMgr, { hull: 'hull_frigate', modules: ['engine_ion'], owner: 'emp_001', x: 2 * AU, y: 2 * AU });
  const rA = s.mos.issueOrder(ai.id, {
    type: ORDER_TYPES.attack, targetBodyId: 'p_tgt', bypassFuelCheck: true, bypassSpaceportCheck: true,
  });
  const strike = ai.movementOrder;
  assert(rA?.ok === true && strike?.status === 'active' && ai.mission?.type === 'attack',
    `T2 PRZESŁANKA: statek AI ma ŻYWE uderzenie (order=${strike?.status}, mission=${ai.mission?.type}) ` +
    '— bez tego cały test mierzyłby ciszę, dokładnie jak `w3_attack_dispatch` przy `liveOrder=0`');

  const prey = ship(s.vMgr, { x: -3 * AU, y: 3 * AU });
  const rB = s.mos.issueOrder(ai.id, { type: ORDER_TYPES.engage, targetEntityId: prey.id });
  assert(rB?.ok === false,
    `T2 PRZESŁANKA: drugi rozkaz ODRZUCONY (${rB?.reason})`);

  assert(ai.movementOrder === strike && strike.status === 'active' && ai.mission?.type === 'attack',
    `T2 PIN (D-VO1): uderzenie AI PRZEŻYŁO odrzucony rozkaz (order=${strike.status}, ` +
    `mission=${ai.mission?.type}) — Director nie anuluje własnego strike'u próbą nielegalnego drugiego`);
}

header('T3 — PREEMPCJA: przyjęty rozkaz przerywa stary we WSZYSTKICH czterech krokach');
{
  const s = scene();
  const v = docked(s.vMgr);
  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });
  const exp = s.ms.getActive?.().find(e => e.vesselId === v.id) ?? null;
  assert(!!exp, `T3 PRZESLANKA: rekord misji powstal (${exp?.status}) — bez tego pkt 3 mierzylby cisze`);
  v.position.state = 'in_transit';
  v._suspendedMission = { type: 'transport', targetId: 'p_tgt' };
  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt' };
  const r1 = s.mos.issueOrder(v.id, MOVE(-4));
  const old = v.movementOrder;
  assert(r1?.ok === true && !!old, 'T3 PRZESŁANKA: pierwszy rozkaz przyjęty');
  v._suspendedMission = { type: 'transport', targetId: 'p_tgt' };
  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt' };

  const r2 = s.mos.issueOrder(v.id, MOVE(-7));
  assert(r2?.ok === true && v.movementOrder !== old, 'T3 PRZESŁANKA: drugi rozkaz przyjęty');

  assert(old.status === 'superseded' || old.status === 'cancelled',
    `T3 PIN: stary rozkaz DOMKNIĘTY (status=${old.status}) — przed VO-3 zostawał 'active' na zawsze`);
  // UWAGA: dla `moveToPoint` to jest STRAZNIK REGRESJI, nie pin preempcji — `_issueMoveToPoint`
  //   kasuje snapshot od dawna (MOS:671). Realnym pinem punktu 2 jest T7 (pursue), gdzie
  //   `_suspendMissionIfAny` odtwarza snapshot w tej samej ramce.
  assert(v._suspendedMission === undefined,
    'T3 STRAZNIK (pkt 2): `_suspendedMission` skasowany — dla moveToPoint dzialalo to juz przed VO-3');
  assert(v.pendingOrder == null,
    `T3 PIN (pkt 4, Finding 126): \`pendingOrder\` wyczyszczony (${JSON.stringify(v.pendingOrder)})`);
  assert(!!exp && exp.status === 'completed',
    `T3 PIN (pkt 3): rekord ekspedycji ZAMKNIĘTY (status=${exp?.status}) — duch skasowany u źródła`);
}

header('T4 — po preempcji stara misja NIE wraca (kolejność wewnętrzna jest kontraktem)');
{
  const s = scene();
  const v = ship(s.vMgr);
  v.position.state = 'in_transit';
  v.mission = { type: 'transport', targetId: 'ast_1', targetX: 0, targetY: 6 * AU, arrivalYear: 9 };
  v._suspendedMission = { type: 'transport', targetId: 'ast_1', targetX: 0, targetY: 6 * AU, arrivalYear: 9 };

  s.mos.issueOrder(v.id, MOVE(-4));
  assert(v.mission?.type !== 'transport',
    `T4 PIN: stara misja NIE zmartwychwstała (mission=${v.mission?.type ?? 'null'}) — emisja ` +
    '`vessel:orderCancelled` odpala SYNCHRONICZNIE `_resumeMissionAfterOrder`, więc skasowanie ' +
    'snapshotu MUSI ją poprzedzić');
}

header('T5 — BRAK TELEPORTU (D-VO3b): statek nie skacze do celu zabitej misji');
{
  const s = scene();
  const v = ship(s.vMgr, { modules: ['engine_ion', 'weapon_kinetic'] });
  const prey = ship(s.vMgr, { x: 3 * AU, y: 3 * AU });
  v.position.state = 'in_transit';
  v.mission = { type: 'mining', targetId: 'ast_1', targetX: 0, targetY: 6 * AU,
    startX: v.position.x, startY: v.position.y, departYear: 0, arrivalYear: 9 };

  // `pursue` zawiesza misję, ale jej NIE podmienia. Skok bierze się z pary `orbiting` + ŻYWA misja:
  // wtedy `_updatePositions:2224` PINUJE statek do `m.targetId` (a nie interpoluje po czasie).
  // ⚠ Bez ustawienia `orbiting` po rozkazie pin byl JALOWY: interpolacja przy t=0.001/9 daje
  //   0.0000 AU niezaleznie od naprawy (zlapane fail-first).
  s.mos.issueOrder(v.id, { type: ORDER_TYPES.pursue, targetEntityId: prey.id });
  v.position.state = 'orbiting';
  v.position.dockedAt = null;
  const before = { x: v.position.x, y: v.position.y };
  assert(distAU(before, s.rock) > 1.0,
    `T5 PRZESLANKA: statek stoi ${distAU(before, s.rock).toFixed(2)} AU od celu ZABITEJ misji — ` +
    'jest sk\u0105d skaka\u0107');
  window.KOSMOS.timeSystem.gameTime = 0.001;
  EventBus.emit('time:tick', { deltaYears: 0.001, gameTime: 0.001 });
  const jumped = distAU(before, v.position);

  assert(jumped <= (v.speedAU ?? 1) * 0.001 + 0.02,
    `T5 PIN (D-VO3b): statek przebył ${jumped.toFixed(4)} AU w tiku 0.001 roku przy ` +
    `${v.speedAU} AU/rok — bez zerowania \`vessel.mission\` ZMIERZONO **5,05 AU**, czyli regresję ` +
    'klasy Findingu 116 (`_updatePositions:2224` pinuje statek do `m.targetId`)');
}

header('T6 — GUARD WARP (D-VO3b): statek w skoku NIE traci misji międzygwiezdnej');
{
  const s = scene();
  const v = ship(s.vMgr);
  const prey = ship(s.vMgr, { x: 3 * AU, y: 3 * AU });
  v.position.state = 'in_transit';
  v.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_far',
    targetId: null, arrivalYear: 5 };

  // ⚠ ZAKRES PINU JEST WĄSKI I TAKI MA BYĆ: mierzy, że **`_preempt`** nie tyka misji w skoku.
  //   Dlatego `pursue`, a NIE `moveToPoint`: gałąź `_issueMoveToPoint` PODMIENIA `vessel.mission`
  //   sama z siebie, niezależnie od preempcji — to zachowanie PRE-EXISTING, starsze od VO-3.
  //   Pierwsza wersja tego pinu używała `moveToPoint` i padała, mierząc CUDZY defekt zamiast
  //   mojego guardu (złapane po implementacji). Ten defekt jest realny i został ZGŁOSZONY
  //   osobno — patrz Finding 147 w `VESSEL_ORDERS_PLAN.md`; naprawa należy do P4/OrderService,
  //   bo to bramka podróży międzygwiezdnej, nie preempcja.
  s.mos.issueOrder(v.id, { type: ORDER_TYPES.pursue, targetEntityId: prey.id });

  assert(v.mission?.phase === 'warp_transit' && v.mission?.toSystemId === 'sys_far',
    `T6 PIN (D-VO3b): \`_preempt\` NIE tknął misji skoku (phase=${v.mission?.phase}, ` +
    `toSystemId=${v.mission?.toSystemId}) — \`_reconcileSystemId\` i cała Slice A stoją na ` +
    '`mission.toSystemId`, więc wyzerowanie jej w skoku rozbiłoby podróż międzygwiezdną');
  assert(v._suspendedMission === undefined,
    'T6 KONTROLA PINU: guard warp NIE wyłącza reszty preempcji — snapshot i tak nie powstał, ' +
    'czyli gałąź warp jest wąska, a nie „nic nie rób"');
}

header('T7 — PUNKT 2 REALNY (D-VO3c): pościg NIE odtwarza snapshotu w tej samej ramce');
{
  const s = scene();
  const v = ship(s.vMgr);
  const prey = ship(s.vMgr, { x: 3 * AU, y: 3 * AU });
  v.position.state = 'in_transit';
  v.mission = { type: 'mining', targetId: 'ast_1', targetX: 0, targetY: 6 * AU, arrivalYear: 9 };

  s.mos.issueOrder(v.id, { type: ORDER_TYPES.pursue, targetEntityId: prey.id });
  assert(v._suspendedMission === undefined,
    `T7 PIN (D-VO3c): po preempcji pościg NIE zostawia snapshotu ` +
    `(_suspendedMission=${JSON.stringify(v._suspendedMission)}) — samo \`delete\` na wejściu jest ` +
    'NO-OPEM, bo cztery call-site\'y `_suspendMissionIfAny` odtwarzają go w TEJ SAMEJ RAMCE');
}

header('T8 — issueReturn WYŁĄCZONY z preempcji (D-VO3d): chroni Finding 125');
{
  const s = scene();
  const v = ship(s.vMgr);
  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt', targetSystemId: 'sys_home' };
  const code = (await import('node:fs')).readFileSync(
    new URL('../../systems/OrderService.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const iSig = code.indexOf('issueReturn(');
  const body = code.slice(iSig, code.indexOf('\n  }', iSig));

  assert(iSig >= 0 && body.length > 100,
    `T8 KONTROLA PINU: ciało \`issueReturn\` wczytane z ŻYWEGO źródła (${body.length} zn.)`);
  assert(!/_preempt/.test(body),
    'T8 PIN (D-VO3d): `issueReturn` NIE wywołuje `_preempt` — skasowałby `pendingOrder` PRZED ' +
    'snapshotem `ReturnJump.js:58`, więc odmowa skoku przywróciłaby `null` i po cichu skasowała ' +
    'zakolejkowaną dostawę gracza (cofnięcie Findingu 125)');
}

header('T9 — rekord zamknięty jako `completed`, a statek NIE odesłany do domu');
{
  const s = scene();
  const v = docked(s.vMgr);
  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });
  const exp = s.ms.getActive?.().find(e => e.vesselId === v.id) ?? null;
  assert(!!exp, 'T9 PRZESŁANKA: rekord istnieje');
  if (!exp) { console.log('\n=== WYNIK: ' + pass + ' PASS / ' + (fail) + ' FAIL ==='); process.exit(1); }
  v.position.state = 'in_transit';

  s.mos.issueOrder(v.id, MOVE(-4));
  assert(exp.status === 'completed',
    `T9 PIN: status terminalny to \`completed\` (${exp.status}), nie nowy — nowy status tworzy ` +
    'WIECZNEGO zombie (GC i serialize tną wyłącznie `completed`, a 10 konsumentów keyuje na „nie completed")');
  assert(exp.status !== 'returning' && v.mission?.type === 'move_to_point',
    `T9 PIN: statek NIE został odesłany do domu (mission=${v.mission?.type}) — \`cancelMission\` ` +
    'jest aliasem `_orderReturn` i zrobiłaby dokładnie to, czego gracz właśnie NIE chciał');
}

header('T10 — KILL-SWITCH: przy OFF zachowanie wraca do stanu sprzed VO-3');
{
  const had = GAME_CONFIG.FEATURES.unifiedVesselOrders;
  GAME_CONFIG.FEATURES.unifiedVesselOrders = false;
  const s = scene();
  const v = ship(s.vMgr);
  v._suspendedMission = { type: 'transport', targetId: 'p_tgt' };
  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt' };
  s.mos.issueOrder(v.id, MOVE(-4));
  const kept = v.pendingOrder != null;
  GAME_CONFIG.FEATURES.unifiedVesselOrders = had;

  assert(kept,
    'T10 PIN: przy fladze OFF `pendingOrder` PRZEŻYWA rozkaz — czyli zachowanie sprzed VO-3, ' +
    'bit w bit. Kill-switch musi dać się wyłączyć atomowo razem z P3 (para P1×P3, ryzyko R-6)');
}

header('T11 — D-VO3e: przekierowanie NIE zostawia osieroconej trasy warp');
{
  const s = scene();
  const v = ship(s.vMgr);
  // Statek w SKOKU z zywa trasa wielo-przeskokowa i zakolejkowana dostawa composite.
  v.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_far',
    targetId: null, arrivalYear: 5 };
  v.warpRoute = { hops: ['sys_home', 'sys_mid', 'sys_far'], legIndex: 0,
    finalSystemId: 'sys_far', totalFuelPlanned: 4, startedYear: 0 };
  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt', targetSystemId: 'sys_far' };
  assert(!!v.warpRoute && !!v.pendingOrder,
    'T11 PRZESLANKA: statek ma ZYWA trase warp i zakolejkowana dostawe composite');

  // `moveToPoint` PODMIENIA misje — czyli misja warp ginie i trasa staje sie sierota.
  s.mos.issueOrder(v.id, MOVE(-4));

  assert(v.warpRoute == null,
    `T11 PIN (D-VO3e): trasa warp PRZERWANA (warpRoute=${JSON.stringify(v.warpRoute)}) — bez tego `
    + 'wisiala BEZTERMINOWO (ZMIERZONE: 400 lat gry, ZERO zdarzen warp), bo detekcja przylotu stoi '
    + 'na mission.type === "interstellar_jump", a galaz typu wlasnie te misje nadpisala. '
    + 'UWAGA: OrderService._maybeDeliver ma `if (v.warpRoute) return`, wiec sierota BLOKOWALA '
    + 'dostawy composite do konca partii — takze po wczytaniu zapisu (oba pola sa serializowane)');
  assert(v.pendingOrder == null,
    `T11 PIN (D-VO3e): pendingOrder tez wyczyszczony (${JSON.stringify(v.pendingOrder)}) — `
    + 'pierwotny guard inWarp pilnowal misji, ktorej galaz typu i tak juz nie zostawila, '
    + 'a w zamian zostawial te dostawe zywa. To byla regresja wprowadzona przez sam ten commit');
}
{
  // KONTROLA PINU — misja warp, ktora REALNIE PRZEZYLA rozkaz (`pursue` jej nie podmienia):
  // tu trasa i dostawa MUSZA zostac nietkniete, inaczej D-VO3e psulby podroz miedzygwiezdna.
  const s = scene();
  const v = ship(s.vMgr);
  const prey = ship(s.vMgr, { x: 3 * AU, y: 3 * AU });
  v.position.state = 'in_transit';
  v.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_far',
    targetId: null, arrivalYear: 5 };
  v.warpRoute = { hops: ['sys_home', 'sys_far'], legIndex: 0, finalSystemId: 'sys_far',
    totalFuelPlanned: 2, startedYear: 0 };
  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt', targetSystemId: 'sys_far' };

  s.mos.issueOrder(v.id, { type: ORDER_TYPES.pursue, targetEntityId: prey.id });
  assert(v.mission?.phase === 'warp_transit' && v.warpRoute != null && v.pendingOrder != null,
    'T11 KONTROLA PINU: gdy misja warp PRZEZYWA rozkaz (pursue jej nie podmienia), trasa '
    + 'i dostawa zostaja NIETKNIETE — guard kluczuje sie na PRZEZYCIU misji, nie na samym warpie');
}

header('T12 — pula logistyczna: przerwana misja kuriera ZWALNIA przydzial zlecenia');
{
  const s = scene();
  // ⚠ `TransportOrderSystem._state()` czyta `window.KOSMOS.gameState` — bez tego `addToPool`
  //   zwraca `false` PO CICHU i caly blok mierzylby cisze (lekcja z keepera szwow VO-0).
  window.KOSMOS.gameState = gameState;
  gameState.set('transportOrders.pool', [], 'vo3_t12_reset');
  gameState.set('transportOrders.orders', [], 'vo3_t12_reset');
  const tos = new TransportOrderSystem();
  window.KOSMOS.transportOrderSystem = tos;

  // ⚠ `hull_small` CELOWO: wiekszy kadlub odbija sie o bramke portu w `_checkPadForVessel`
  //   (kolonia-atrapa nie ma `buildingSystem`) i rekord misji by NIE POWSTAL — pin mierzylby
  //   cisze zamiast zwolnienia przydzialu (zlapane fail-first, ta sama pulapka co w VO-2 T7).
  //   Zdolnosc cargo jest tu nieistotna: przydzial i `inFlight` budujemy recznie.
  const v = docked(s.vMgr);
  assert(tos.addToPool(v.id) === true, 'T12 PRZESLANKA: statek dolaczyl do puli logistycznej');

  // Kurier na kursie: rekord misji + przydzial ze zlecenia z zarezerwowanym ladunkiem.
  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });
  const exp = s.ms.getActive?.().find(e => e.vesselId === v.id) ?? null;
  assert(!!exp, 'T12 PRZESLANKA: kurier ma zywy rekord misji');

  const st = gameState.get('transportOrders');
  const order = { id: 'to_t12', fromColonyId: 'p_home', toColonyId: 'p_tgt',
    goods: { Fe: 50 }, delivered: {}, inFlight: { Fe: 50 }, createdYear: 0,
    assignments: [{ vesselId: v.id, phase: 'hauling', courseCargo: { Fe: 50 } }] };
  st.orders.push(order);
  assert(order.assignments.length === 1 && (order.inFlight.Fe ?? 0) === 50,
    'T12 PRZESLANKA: zlecenie trzyma statek i REZERWUJE 50 Fe (inFlight)');

  v.position.state = 'in_transit';
  const prey = ship(s.vMgr, { x: 3 * AU, y: 3 * AU });
  s.mos.issueOrder(v.id, { type: ORDER_TYPES.pursue, targetEntityId: prey.id });

  assert(order.assignments.length === 0,
    `T12 PIN: przydzial ZWOLNIONY (${order.assignments.length}) — pula slucha `
    + '`mission:aborted` i sprzata SAMA. Bez tego zlecenie wisialo `hauling` z zamrozonym '
    + 'ladunkiem przez 60 lat gry (ZMIERZONE), a statek stal idle jako „przypisany"');
  assert((order.inFlight.Fe ?? 0) === 0,
    `T12 PIN (koszt ukryty): rezerwacja \`inFlight\` zdjeta (Fe=${order.inFlight.Fe ?? 0}) — `
    + 'dopoki wisiala, INNE statki z puli tez nie mogly wziac tej czesci zlecenia');
  assert(tos.isInPool(v.id) === true,
    'T12 KONTROLA PINU: statek ZOSTAJE w puli — gracz go z niej nie wypisal, wiec ma byc '
    + 'znow dostepny dla dispatchera. Zwolnienie przydzialu to nie to samo co usuniecie z puli');

  tos.destroy?.();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
