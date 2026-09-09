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
// ⚠ DWA PINY PRZEPISANE ŚWIADOMIE PO ZAMKNIĘCIU FINDINGU 147 (D-147a) — T6 i T11.
//   `MovementOrderSystem.issueOrder` ma od tej pory ADMISYJNY termin tranzytu warp: statek
//   w skoku nie przyjmuje ŻADNEGO rozkazu ruchu. W obu tych pinach wejściem był właśnie statek
//   w skoku, więc ich PRZESŁANKA była Findingiem 147:
//     • T6 zakładał, że rozkaz zostaje PRZYJĘTY, a misji broni gałąź `inWarp` w `_preemptCommit`.
//       Dziś broni jej ADMISJA — pin czyta więc POWÓD odmowy, inaczej byłby jałowy.
//     • T11 zakładał, że `moveToPoint` ZABIJA misję warp i osierocą trasę. Dziś nie zabija, więc
//       nie ma czego sprzątać. Inwariant D-VO3e został pinowany na wejściu, które NADAL istnieje
//       i które sam D-VO3e wymienia: statek SPOZA warpu z żywą trasą wielo-przeskokową.
//   ⚠ KONSEKWENCJA STRUKTURALNA, ZGŁOSZONA OSOBNO: gałąź `inWarp` / `warpMissionSurvived`
//   w `_preemptCommit` jest od teraz NIEOSIĄGALNA. Kod ZOSTAJE (usunięcie = własna decyzja
//   i własny pomiar); tu jest tylko zapisane, że żaden pin już jej nie dotyka.
//   Keeper samego 147: `warp_transit_order_gate_smoke.mjs`.
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

  // ⚠ MECHANIZM SIĘ ZMIENIŁ — PIN PRZEPISANY ŚWIADOMIE (Finding 147, D-147a).
  //   Do zamknięcia 147 ten pin mierzył guard warp W `_preempt`: rozkaz był PRZYJMOWANY, a misji
  //   skoku broniła gałąź `inWarp` w `_preemptCommit`. Dlatego stał tu `pursue`, a nie
  //   `moveToPoint` — gałąź `_issueMoveToPoint` podmieniała `vessel.mission` niezależnie od
  //   preempcji (własny komentarz tego pinu wskazywał to jako Finding 147 i odsyłał naprawę
  //   do `OrderService`/P4).
  //   TERAZ `issueOrder` ODMAWIA KAŻDEGO rozkazu ruchu statkowi w tranzycie, więc `_preempt`
  //   dla takiego statku NIE BIEGNIE W OGÓLE. Misja skoku przeżywa nadal — ale przez ADMISJĘ,
  //   nie przez guard preempcji.
  //   ⚠ Bez asercji na POWÓD ten pin byłby od tej pory JAŁOWY: „misja przeżyła" jest prawdą
  //   także wtedy, gdy odmowa przyszła z dowolnego innego tytułu. Dlatego czytamy zwrotkę.
  //   ⚠ KONSEKWENCJA STRUKTURALNA, ZGŁOSZONA OSOBNO: gałąź `inWarp` / `warpMissionSurvived`
  //   w `_preemptCommit` staje się NIEOSIĄGALNA (nie da się już wejść do `_preemptCommit`
  //   z `prev.mission.phase === 'warp_transit'`). Kod ZOSTAJE — usunięcie go to własna decyzja
  //   i własny pomiar. Nowy keeper: `warp_transit_order_gate_smoke.mjs`.
  const r6 = s.mos.issueOrder(v.id, { type: ORDER_TYPES.pursue, targetEntityId: prey.id });

  assert(r6?.ok === false && r6?.reason === 'vessel_in_warp_transit',
    `T6 PIN (D-147a): rozkaz dla statku w skoku ODRZUCONY i to powodem WARP ` +
    `(ok=${r6?.ok}, reason=${r6?.reason}) — bez tej asercji dwie następne są jałowe`);
  assert(v.mission?.phase === 'warp_transit' && v.mission?.toSystemId === 'sys_far',
    `T6 PIN (D-VO3b, inwariant ZACHOWANY): misja skoku nietknięta (phase=${v.mission?.phase}, ` +
    `toSystemId=${v.mission?.toSystemId}) — \`_reconcileSystemId\` i cała Slice A stoją na ` +
    '`mission.toSystemId`, więc wyzerowanie jej w skoku rozbiłoby podróż międzygwiezdną');
  assert(v._suspendedMission === undefined,
    'T6 KONTROLA PINU: odmowa nie zostawia po sobie snapshotu misji (preempcja nie zaczęła się)');
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
  // ⚠ FIXTURE PRZEPISANY ŚWIADOMIE (Finding 147, D-147a). Stał tu statek W SKOKU, bo to
  //   `moveToPoint` na takim statku ZABIJAŁO misję warp i robiło z trasy sierotę. Po zamknięciu
  //   147 taki rozkaz jest ODRZUCANY, więc tamten wejściowy stan nie produkuje już osieroconej
  //   trasy — nie ma czego sprzątać, a pin mierzyłby ciszę.
  //   INWARIANT D-VO3e ZOSTAJE PINOWANY, tylko na wejściu, które NADAL ISTNIEJE i które sam
  //   plan D-VO3e wymienia wprost: „⚠ Obejmuje TAKŻE statek SPOZA warpu z żywą trasą
  //   wielo-przeskokową (zmierzone: `pendingOrder` był czyszczony, a `warpRoute` zostawał)".
  const s = scene();
  const v = ship(s.vMgr);
  // Statek SPOZA warpu (misja skoku już się domknęła), ale z ZYWA trasa wielo-przeskokowa
  // i zakolejkowana dostawa composite — dokladnie druga polowa pomiaru D-VO3e.
  v.warpRoute = { hops: ['sys_home', 'sys_mid', 'sys_far'], legIndex: 0,
    finalSystemId: 'sys_far', totalFuelPlanned: 4, startedYear: 0 };
  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt', targetSystemId: 'sys_far' };
  assert(!!v.warpRoute && !!v.pendingOrder && v.mission == null,
    'T11 PRZESLANKA: statek SPOZA skoku ma ZYWA trase warp i zakolejkowana dostawe composite');

  const r11 = s.mos.issueOrder(v.id, MOVE(-4));
  assert(r11?.ok === true,
    `T11 PRZESLANKA 2: rozkaz PRZYJETY (ok=${r11?.ok}, reason=${r11?.reason ?? '—'}) — inaczej `
    + 'ponizsze asercje przechodzilyby przez odmowe, nie przez sprzatanie');

  assert(v.warpRoute == null,
    `T11 PIN (D-VO3e): trasa warp PRZERWANA (warpRoute=${JSON.stringify(v.warpRoute)}) — bez tego `
    + 'wisiala BEZTERMINOWO (ZMIERZONE: 400 lat gry, ZERO zdarzen warp). '
    + 'UWAGA: OrderService._maybeDeliver ma `if (v.warpRoute) return`, wiec sierota BLOKOWALA '
    + 'dostawy composite do konca partii — takze po wczytaniu zapisu (oba pola sa serializowane)');
  assert(v.pendingOrder == null,
    `T11 PIN (D-VO3e): pendingOrder tez wyczyszczony (${JSON.stringify(v.pendingOrder)})`);
}
{
  // KONTROLA PINU — statek W SKOKU: po 147 rozkaz ODMAWIA, wiec trasa i dostawa maja zostac
  // NIETKNIETE. To jest lustro pinu wyzej: sprzatanie ma odpalac WYLACZNIE tam, gdzie cos
  // realnie osierocilo, a nie „przy okazji" na kazdym statku z trasa.
  // ⚠ Powod odmowy jest czescia asercji — bez niego kontrola przechodzi takze wtedy, gdy rozkaz
  //   odpadl z innego tytulu i nie mierzy juz nic (ta sama poprawka co w T6).
  const s = scene();
  const v = ship(s.vMgr);
  const prey = ship(s.vMgr, { x: 3 * AU, y: 3 * AU });
  v.position.state = 'in_transit';
  v.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_far',
    targetId: null, arrivalYear: 5 };
  v.warpRoute = { hops: ['sys_home', 'sys_far'], legIndex: 0, finalSystemId: 'sys_far',
    totalFuelPlanned: 2, startedYear: 0 };
  v.pendingOrder = { kind: 'transport', targetId: 'p_tgt', targetSystemId: 'sys_far' };

  const rc = s.mos.issueOrder(v.id, { type: ORDER_TYPES.pursue, targetEntityId: prey.id });
  assert(rc?.ok === false && rc?.reason === 'vessel_in_warp_transit',
    `T11 KONTROLA PINU (a): rozkaz dla statku w skoku ODRZUCONY powodem warp (reason=${rc?.reason})`);
  assert(v.mission?.phase === 'warp_transit' && v.warpRoute != null && v.pendingOrder != null,
    'T11 KONTROLA PINU (b): odmowa NIE sprzata trasy ani dostawy — sprzatanie odpala wylacznie '
    + 'na sciezce PRZYJETEGO rozkazu, ktory cos realnie osierocil');
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
