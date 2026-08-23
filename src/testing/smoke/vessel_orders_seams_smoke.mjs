// VESSEL_ORDERS — keeper SZWÓW modelu rozkazów floty (commit VO-0, arc VESSEL_ORDERS).
//
// PO CO: audyt `docs/design/UNIFIED_VESSEL_ORDERS_AUDIT.md` (Findings 115-129) zmierzył sześć
// mechanizmów, na których stoi kształt całego slice'u. Plan `docs/design/VESSEL_ORDERS_PLAN.md`
// (PODPISANY 2026-08-23) rozbija je na commity VO-1…VO-7. Ten keeper pinuje je WYKONANIEM — a tam,
// gdzie wykonanie nie sięga, ŹRÓDŁOWO — żeby żaden nie zmienił się po cichu i żeby następny czytelnik
// nie musiał wierzyć dokumentowi na słowo.
//
// ⚠ TO SĄ PINY STANU DZISIEJSZEGO, NIE PINY POPRAWNOŚCI. Każdy MA PAŚĆ w późniejszym commicie tego
//    arca i zostać ŚWIADOMIE ODWRÓCONY. Poniższa tabela jest CZĘŚCIĄ KONTRAKTU:
//    kto odwraca pin, PRZEPISUJE TEN NAGŁÓWEK, a NIE KASUJE TESTU.
//    Wzór: `colony_ownership_seams_smoke` (OG-0) · `deploy_seams_smoke` (W2-0) · `war_seams_smoke`.
//
//   | szew | co pinuje DZIŚ                                                    | MA PAŚĆ w | jak się zmieni |
//   |------|-------------------------------------------------------------------|-----------|----------------|
//   | S1   | rekord ekspedycji „przylatuje" po samym ZEGARZE i wypłaca łup,    | VO-2 (P2) | przylot wymaga, by statek FAKTYCZNIE był u celu |
//   |      | choć statek poleciał gdzie indziej (Finding 115)                  |           | |
//   | S2   | `arriveAtTarget` snapuje pozycję do celu NOWEGO rozkazu           | VO-2 (P2) | duch nie odpali, więc nie ma czego snapować |
//   |      | — statek teleportuje się i przedwcześnie domyka rozkaz (116)      |           | |
//   | S3   | rozkaz gracza ROBI snapshot misji, a anulowanie ją WSKRZESZA      | VO-3 (P1) | `_preempt` kasuje snapshot — rozkaz gracza nigdy nie wskrzesza |
//   |      | (Finding 118)                                                     |           | starej roboty; ścieżki systemowe wołają z `{preempt:false}` |
//   | S4   | `vessel.movementOrder` PRZEŻYWA domknięcie i wypycha statek       | VO-3 /    | zerowanie przy PREEMPCJI → VO-3; przy DOMKNIĘCIU → VO-3b |
//   |      | z puli logistycznej NA STAŁE (Finding 119)                        | VO-3b     | (D-VO1b: to zmiana tempa AI, dlatego osobny commit) |
//   | S5   | `issueOrder` NIE MA guardu „statek ma już rozkaz" — nadpisanie    | VO-3 (P1) | `_preempt` domyka stary rozkaz i emituje anulowanie |
//   |      | jest ciche, stary rozkaz zostaje osierocony (Findings 118/127)    |           | ⚠ `_preempt` stoi POD bramkami, nie NAD (plan §3.1.4 pkt 1) |
//   | S6   | menu akcji to zaszyty automat na `position.state`: docked 6 /     | VO-4 (P3) | menu iteruje WSZYSTKIE akcje i zwraca też zablokowane, |
//   |      | orbiting 3 / in_transit 1 (Findings 120/128)                      |           | z powodem — kubełki znikają |
//
// ⚠ GRANICE DOWODU — nazwane wprost, nie schowane (plan §9):
//   • S1, S2, S3, S4, S6 — piny WYKONANIOWE. Świat jest budowany ręcznie, ale mechanizmy przechodzą
//     przez PRODUKCYJNE systemy (`MissionSystem`, `VesselManager`, `MovementOrderSystem`,
//     `TransportOrderSystem`, `FleetActions`). Nie ma tu atrap logiki — tylko atrapy scenerii.
//   • S4b i S5b — piny ŹRÓDŁOWE (`stripComments` + kontrola pinu). Powód: „w kodzie NIE MA X" jest
//     twierdzeniem o CAŁYM pliku, a wykonanie potrafi dowieść co najwyżej jednej ścieżki.
//   • S4 NIE dowodzi, że statek na pewno wróci do doku — dokowanie robi `VesselManager.dockAtColony`,
//     tu symulowane. Pin brzmi: „gdy statek wróci do doku, martwy marker nadal go blokuje".
//
// ⚠ HARNESS: `GameCore` NIE montuje `movementOrderSystem` / `orderService` / `transportOrderSystem`
//    (zmierzone). Ten keeper NIE używa `GameCore` — buduje minimalny świat sam, bo każdy z sześciu
//    szwów jest lokalny i deterministyczny, a generowanie galaktyki wnosiłoby wyłącznie szum.
//
// Uruchom: node src/testing/smoke/vessel_orders_seams_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import gameState               from '../../core/GameState.js';
import { createVessel }        from '../../entities/Vessel.js';
import { MissionSystem }       from '../../systems/MissionSystem.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { TransportOrderSystem } from '../../systems/TransportOrderSystem.js';
import { ORDER_TYPES }         from '../../data/MovementOrderTypes.js';
import { getAvailableActions, FLEET_ACTIONS } from '../../data/FleetActions.js';
import { readFileSync }        from 'node:fs';
import { join }                from 'node:path';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = 110;                                  // GameConfig.AU_TO_PX — 1 AU = 110 px
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / AU;   // w AU

// Pin ŹRÓDŁOWY czyta kod BEZ komentarzy (memory `source-pin-strip-comments`) — inaczej łapie własne
// wyjaśnienie zostawione obok kodu. `[^:]` chroni `://` w URL-ach.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const codeOf = (...seg) => stripComments(readFileSync(join(SRC, ...seg), 'utf8'));

// ── harness ──────────────────────────────────────────────────────────────────────────────────────
// ⚠ EventBus i EntityManager to SINGLETONY. Każdy blok musi zacząć od czystego stanu, inaczej
//    subskrypcje z poprzedniego bloku (VesselManager, MissionSystem, TransportOrderSystem —
//    wszystkie subskrybują w KONSTRUKTORZE) odpalają się podwójnie i pin mierzy cudzy świat.
//    Czyścimy PRZED konstrukcją systemów, nigdy po.
function resetWorld() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 0 } };
}

/** Minimalny świat: gwiazda w (0,0) + planeta macierzysta + cel misji.
 *  ⚠ BEZ pola `orbital` — z niepełnym `orbital` `_predictPosition` liczy Keplera na `undefined`
 *  i zwraca NaN, przez co `mission.targetX` staje się NaN (zmierzone). Bez `orbital` gałąź zwraca
 *  czyste `{x,y}` encji, więc arytmetyka pinu jest przewidywalna. */
function buildWorld() {
  EntityManager.add({ id: 'star_1', type: 'star', name: 'Słońce', systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: 'sys_home',
    x: 1 * AU, y: 0, explored: true });
  EntityManager.add({ id: 'ast_1', type: 'asteroid', name: 'Skała', systemId: 'sys_home',
    x: 0, y: 5 * AU, explored: true,
    deposits: [{ resourceId: 'Fe', richness: 2.0, remaining: 500 }] });
  return { home: EntityManager.get('p_home'), rock: EntityManager.get('ast_1') };
}

/** Magazyn-atrapa o kontrakcie ResourceSystem, którego dotyka ścieżka przylotu misji. */
function makeStore(seed = {}) {
  const inv = new Map(Object.entries(seed));
  return {
    inventory: inv,
    getAmount: (k) => inv.get(k) ?? 0,
    canAfford: () => true,
    spend: () => true,
    receive: (g) => { for (const [k, v] of Object.entries(g ?? {})) inv.set(k, (inv.get(k) ?? 0) + v); },
  };
}

/** Locator z atrapami SCENERII (nie logiki) — dokładnie tyle, ile czytają ścieżki misji. */
function mountLocator({ vMgr, mos, store, home }) {
  Object.assign(window.KOSMOS, {
    civMode: true,
    homePlanet: home,
    vesselManager: vMgr,
    movementOrderSystem: mos,
    resourceSystem: store,
    colonyManager: { activePlanetId: 'p_home', getColony: () => null },
    techSystem: {
      isResearched: () => true,
      getFuelEfficiency: () => 1.0,
      getShipSpeedMultiplier: () => 1.0,
      getMissionYieldBonus: () => 0,
      getDisasterReduction: () => 0,
      getShipSurvivalChance: () => 0,
    },
  });
}

/** Statek gotowy do startu z `p_home`. `hull_small` nie wymaga portu (bramka spaceportu). */
function spawnShip(vMgr, { hull = 'hull_small', modules = ['engine_ion'], x = 1 * AU, y = 0 } = {}) {
  const v = vMgr.createAndRegister(hull, 'p_home', { name: 'Sonda', modules: [...modules], x, y });
  v.position.state = 'docked';
  v.position.dockedAt = 'p_home';
  v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999;
  v.speedAU = 1.0;
  return v;
}

/** Przesuń zegar tak, żeby `_checkArrivals` zobaczyło przylot.
 *  ⚠ `_gameYear` ustawia WYŁĄCZNIE `time:display` (przypisanie), a `time:tick` tylko WYZWALA
 *  sprawdzenie (`MissionSystem.js:23-28`). Potrzebne są OBA — zmierzone. */
function advanceTo(year) {
  window.KOSMOS.timeSystem.gameTime = year;
  EventBus.emit('time:display', { gameTime: year });
  EventBus.emit('time:tick', { deltaYears: 0.001, gameTime: year });
}

/** Scena S1/S2: statek startuje na misję wydobywczą do `ast_1`. Zwraca komplet do pomiaru. */
function sceneMiningLaunch() {
  resetWorld();
  const { home, rock } = buildWorld();
  const store = makeStore({ Fe: 1000 });
  const vMgr = new VesselManager();               // kolejność jak w grze: ruch, potem rozkazy, potem misje
  const mos  = new MovementOrderSystem(vMgr);
  const ms   = new MissionSystem(store);
  mountLocator({ vMgr, mos, store, home });
  const v = spawnShip(vMgr);
  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: rock.id, vesselId: v.id });
  const exp = ms.getActive?.().find(e => e.vesselId === v.id) ?? null;
  return { ms, mos, vMgr, store, v, exp, home, rock };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// S1 — DUCH MISJI: rekord ekspedycji „przylatuje" po samym zegarze (Finding 115)
// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('S1 — duch misji dostarcza łup pod nieobecność statku (WYKONANIE)');
{
  const s = sceneMiningLaunch();
  assert(!!s.exp && s.exp.status === 'en_route',
    `S1 PRZESŁANKA: misja wydobywcza wystartowała PRODUKCYJNĄ ścieżką (status=${s.exp?.status}) — ` +
    'jest co mierzyć, pin nie stoi na pustym rejestrze');

  // Gracz przekierowuje statek w PRZECIWNĄ stronę (ujemne Y, cel misji jest na +5 AU).
  const r = s.mos.issueOrder(s.v.id, {
    type: ORDER_TYPES.moveToPoint, targetPoint: { x: 0, y: -3 * AU },
    issuedBy: 'vo0_seam', bypassFuelCheck: true, bypassSpaceportCheck: true,
  });
  assert(r?.ok === true && s.v.mission?.type === 'move_to_point',
    `S1 PRZESŁANKA: rozkaz ruchu przyjęty i PODMIENIŁ misję statku (${s.v.mission?.type})`);

  assert(s.exp.status === 'en_route',
    'S1 PIN DZIŚ: rekord ekspedycji PRZEŻYWA rozkaz ruchu — `MOS.issueOrder` nie dotyka ' +
    '`MissionSystem` (grep: zero odwołań do movementOrder w tym pliku). VO-3 MA to odwrócić.');

  const feBefore = s.store.getAmount('Fe');
  advanceTo((s.exp.arrivalYear ?? 0) + 0.01);
  const feAfter = s.store.getAmount('Fe');
  const dAway = dist(s.v.position, s.rock);

  assert(s.exp.status === 'orbiting',
    `S1 PIN DZIŚ: ekspedycja „doleciała" (status=${s.exp.status}) mimo że statek jest ` +
    `${dAway.toFixed(2)} AU od celu — bramka to WYŁĄCZNIE kalendarz (MissionSystem.js:1463). ` +
    'VO-2 MA to odwrócić.');
  assert(feAfter > feBefore && dAway > 1.0,
    `S1 PIN DZIŚ (SKUTEK, nie bramka): łup WYPŁACONY do magazynu Fe ${feBefore} → ${feAfter} ` +
    `(+${(feAfter - feBefore).toFixed(0)}) przy statku ${dAway.toFixed(2)} AU od miejsca wydobycia`);
}
{
  // KONTROLA PINU — ta sama scena BEZ rozkazu: przylot też następuje, ale statek JEST u celu.
  // Bez tej kontroli pin S1 nie odróżniałby „duch dostarcza" od „przyloty w ogóle działają".
  const s = sceneMiningLaunch();
  const feBefore = s.store.getAmount('Fe');
  advanceTo((s.exp.arrivalYear ?? 0) + 0.01);
  const dAway = dist(s.v.position, s.rock);
  assert(s.exp.status === 'orbiting' && s.store.getAmount('Fe') > feBefore && dAway < 0.01,
    `S1 KONTROLA PINU: bez rozkazu ten sam przylot daje łup, ale statek stoi ${dAway.toFixed(3)} AU ` +
    'od celu — różnicą między pinem a kontrolą jest WYŁĄCZNIE dystans, nie działanie mechanizmu');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// S2 — TELEPORT: `arriveAtTarget` snapuje pozycję do celu NOWEGO rozkazu (Finding 116)
// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('S2 — przylot ducha TELEPORTUJE statek do celu nowego rozkazu (WYKONANIE)');
{
  const s = sceneMiningLaunch();
  const far = { x: 0, y: -8 * AU };               // 8 AU w przeciwną stronę niż cel misji (+5 AU)
  const r = s.mos.issueOrder(s.v.id, {
    type: ORDER_TYPES.moveToPoint, targetPoint: far,
    issuedBy: 'vo0_seam', bypassFuelCheck: true, bypassSpaceportCheck: true,
  });
  const orderArrival = s.v.mission?.arrivalYear ?? 0;
  const expArrival   = s.exp.arrivalYear ?? 0;
  assert(r?.ok === true && orderArrival > expArrival,
    `S2 PRZESŁANKA: rozkaz ruchu dociera PÓŹNIEJ (${orderArrival.toFixed(2)}) niż duch misji ` +
    `(${expArrival.toFixed(2)}) — duch odpali PIERWSZY, więc jest co teleportować`);

  const posBefore = { x: s.v.position.x, y: s.v.position.y };
  advanceTo(expArrival + 0.01);
  const jumped   = dist(posBefore, s.v.position);
  const toOrder  = dist(s.v.position, far);
  const toRock   = dist(s.v.position, s.rock);

  assert(toOrder < 0.01 && toRock > 1.0,
    `S2 PIN DZIŚ: statek wylądował ${toOrder.toFixed(3)} AU od celu ROZKAZU i ${toRock.toFixed(2)} AU ` +
    'od celu MISJI — `VesselManager.arriveAtTarget:505-506` snapuje do `vessel.mission.targetX/Y`, ' +
    'czyli do misji NOWEJ. VO-2 MA to odwrócić.');
  assert(jumped > 1.0,
    `S2 PIN DZIŚ (SKUTEK): ${jumped.toFixed(2)} AU pokonane w jednym tiku — droga, na którą rozkaz ` +
    `przewidywał rok ${orderArrival.toFixed(2)}, przebyta w roku ${(expArrival + 0.01).toFixed(2)}`);
  assert(s.v.movementOrder?.status === 'completed' && s.v.mission === null,
    `S2 PIN DZIŚ: teleport DOMYKA też rozkaz ruchu (status=${s.v.movementOrder?.status}) — ` +
    'gracz dostaje „wykonano", choć statek nigdy nie leciał');
}
{
  // KONTROLA PINU — bez rozkazu statek ląduje NA CELU MISJI. Ta sama funkcja `arriveAtTarget`,
  // przeciwny wynik, bo `vessel.mission` wskazuje wtedy prawdziwą misję.
  const s = sceneMiningLaunch();
  advanceTo((s.exp.arrivalYear ?? 0) + 0.01);
  assert(dist(s.v.position, s.rock) < 0.01 && s.v.position.dockedAt === s.rock.id,
    'S2 KONTROLA PINU: bez rozkazu `arriveAtTarget` snapuje do celu MISJI (dockedAt=' +
    `${s.v.position.dockedAt}) — teleport z pinu bierze się z PODMIENIONEJ misji, nie z zepsutej funkcji`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// S3 — WZNOWIENIE: rozkaz gracza snapshotuje misję, anulowanie ją wskrzesza (Finding 118)
// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('S3 — statek sam wraca do poprzedniej roboty po anulowaniu pościgu (WYKONANIE)');
{
  const s = sceneMiningLaunch();
  advanceTo(0.05);                                          // statek rusza, jest w locie
  assert(s.v.position.state === 'in_transit' && s.v.mission?.type === 'mining',
    `S3 PRZESŁANKA: statek w locie na misji (${s.v.position.state}/${s.v.mission?.type}) — ` +
    '`_suspendMissionIfAny` snapshotuje WYŁĄCZNIE przy `in_transit` (MovementOrderSystem.js:149)');

  // Ofiara pościgu — dalej niż THREAT_RADIUS (0.15 AU), inaczej `target_already_in_range`.
  const prey = s.vMgr.createAndRegister('hull_small', 'p_home',
    { name: 'Zwierzyna', modules: ['engine_ion'], x: 3 * AU, y: 3 * AU });
  prey.position.state = 'orbiting'; prey.position.dockedAt = null;

  const r = s.mos.issueOrder(s.v.id, { type: ORDER_TYPES.pursue, targetEntityId: prey.id });
  assert(r?.ok === true && s.v._suspendedMission?.type === 'mining',
    `S3 PIN DZIŚ: pościg ROBI snapshot misji (_suspendedMission=${s.v._suspendedMission?.type}) — ` +
    'VO-3 MA to odwrócić: rozkaz gracza nigdy nie ma wskrzeszać starej roboty');

  s.mos.cancelOrder(s.v.id, 'player');
  assert(s.v.mission?.type === 'mining' && s.v._suspendedMission === undefined,
    `S3 PIN DZIŚ (SKUTEK): po anulowaniu statek SAM wrócił do misji (${s.v.mission?.type}, ` +
    `state=${s.v.position.state}) — ścieżka: MOS→\`vessel:orderCancelled\`→` +
    'VesselManager._resumeMissionAfterOrder (subskrypcja :128)');
}
{
  // KONTROLA PINU (a) — `moveToPoint` jest TERMINALNY: nie snapshotuje i KASUJE istniejący snapshot.
  // Ta sama scena, inny typ rozkazu, przeciwny wynik ⇒ wznowienie jest STEROWANE snapshotem,
  // a nie „dzieje się zawsze". To jest zarazem stan DOCELOWY, który VO-3 uogólni na resztę rozkazów.
  const s = sceneMiningLaunch();
  advanceTo(0.05);
  s.mos.issueOrder(s.v.id, {
    type: ORDER_TYPES.moveToPoint, targetPoint: { x: 0, y: -3 * AU },
    bypassFuelCheck: true, bypassSpaceportCheck: true,
  });
  assert(s.v._suspendedMission === undefined && s.v.mission?.type === 'move_to_point',
    'S3 KONTROLA PINU (a): `moveToPoint` NIE snapshotuje (`_issueMoveToPoint:671` robi `delete`) — ' +
    'ten sam statek, ten sam stan, inny typ rozkazu ⇒ pin mierzy typ rozkazu, nie szum');
}
{
  // KONTROLA PINU (b) — statek, który DOLECIAŁ, nie jest snapshotowany (warunek `in_transit`).
  const s = sceneMiningLaunch();
  advanceTo((s.exp.arrivalYear ?? 0) + 0.01);
  const before = s.v._suspendedMission;
  const suspended = s.mos._suspendMissionIfAny(s.v);
  assert(suspended === false && before === undefined && s.v._suspendedMission === undefined,
    `S3 KONTROLA PINU (b): statek po przylocie (${s.v.position.state}) NIE jest snapshotowany ` +
    '— pin S3 mierzy warunek `in_transit`, a nie „snapshot powstaje zawsze"');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// S4 — LEPKI MARKER: `vessel.movementOrder` przeżywa domknięcie (Finding 119)
// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('S4 — martwy rozkaz wypycha statek z puli logistycznej NA STAŁE (WYKONANIE)');
{
  resetWorld();
  const { home } = buildWorld();
  const vMgr = new VesselManager();
  const mos  = new MovementOrderSystem(vMgr);
  mountLocator({ vMgr, mos, store: makeStore(), home });
  // ⚠ `TransportOrderSystem._state()` czyta `window.KOSMOS.gameState` — bez tego `addToPool`
  //    zwraca `false` po cichu, a `_freePoolVessels()` PUSTĄ listę. Wtedy pin S4 mierzyłby
  //    brak magazynu zamiast lepkiego markera (złapane fail-first: 0 → 0 → 0 zamiast 1 → 0 → 1).
  //    `gameState` to SINGLETON i przeżywa cały plik ⇒ pulę czyścimy jawnie.
  window.KOSMOS.gameState = gameState;
  gameState.set('transportOrders.pool', [], 'vo0_seam_reset');
  const tos = new TransportOrderSystem();
  window.KOSMOS.transportOrderSystem = tos;

  const v = spawnShip(vMgr, { hull: 'hull_medium', modules: ['engine_ion', 'cargo_small'] });
  assert((v.cargoMax ?? 0) > 0,
    `S4 PRZESŁANKA: statek ma ładownię (cargoMax=${v.cargoMax}) — bez niej odpadłby na filtrze ` +
    '`canHaulCargo`, a pin mierzyłby nie ten warunek');

  const added = tos.addToPool(v.id);
  const free = () => tos._freePoolVessels().length;
  assert(added === true && tos.isInPool(v.id),
    'S4 PRZESŁANKA: statek DOŁĄCZYŁ do puli logistycznej (opt-in) — `addToPool` zwraca `false` ' +
    'po cichu, gdy magazyn stanu jest niedostępny, więc bez tego odczytu reszta bloku mierzyłaby ciszę');
  assert(free() === 1,
    'S4 PRZESŁANKA (KONTROLA DLA PINU GŁÓWNEGO): statek przechodzi POZOSTAŁE osiem filtrów ' +
    '`_freePoolVessels` i jest liczony jako wolny — dopiero różnica względem tego odczytu ma sens');

  const r = mos.issueOrder(v.id, {
    type: ORDER_TYPES.moveToPoint, targetPoint: { x: 0, y: -4 * AU },
    bypassFuelCheck: true, bypassSpaceportCheck: true,
  });
  assert(r?.ok === true, `S4 PRZESŁANKA: rozkaz wydany (${r?.reason ?? 'ok'})`);

  // Domknięcie PRODUKCYJNĄ ścieżką: `vessel:arrived` → MOS._onVesselArrived (subskrypcja :86).
  EventBus.emit('vessel:arrived', { vessel: v, mission: v.mission });
  assert(v.movementOrder?.status === 'completed' && v.mission === null && mos._byVessel.size === 0,
    `S4 PIN DZIŚ: domknięcie ZEROWAŁO misję i indeks (mission=${v.mission}, _byVessel=` +
    `${mos._byVessel.size}), ale marker ZOSTAŁ (status=${v.movementOrder?.status}) — ` +
    'dwa źródła prawdy o zajętości rozjeżdżają się. VO-3b MA to odwrócić.');

  // Symulujemy zadokowanie (robi to `VesselManager.dockAtColony`, poza tym pinem — patrz granice dowodu).
  v.position.state = 'docked'; v.position.dockedAt = 'p_home'; v.status = 'idle'; v.mission = null;
  const withMarker = free();
  const keep = v.movementOrder;
  v.movementOrder = null;
  const withoutMarker = free();
  v.movementOrder = keep;
  const restored = free();

  assert(withMarker === 0,
    'S4 PIN GŁÓWNY: zadokowany, bezczynny statek bez misji NIE WRACA do puli logistycznej ' +
    '(`TransportOrderSystem.js:517` odrzuca każdy `v.movementOrder`, a ten nigdy nie wygasa)');
  assert(withoutMarker === 1 && restored === 0,
    `S4 KONTROLA PINU: zmiana WYŁĄCZNIE jednego pola przełącza wynik ${withMarker} → ` +
    `${withoutMarker} → ${restored} — różnica jest przypisana markerowi i niczemu innemu`);

  tos.destroy?.();
}
{
  // S4b — PIN ŹRÓDŁOWY. „W kodzie NIE MA zerowania markera" jest twierdzeniem o CAŁYM pliku;
  // wykonanie dowodzi co najwyżej jednej ścieżki domknięcia.
  const mosCode = codeOf('systems', 'MovementOrderSystem.js');
  const assigns = mosCode.match(/\.movementOrder\s*=\s*[^;]+/g) ?? [];
  const nulls   = assigns.filter(a => /=\s*null/.test(a));

  assert(assigns.length >= 4,
    `S4b KONTROLA PINU: ten sam regex WIDZI ${assigns.length} przypisań do \`.movementOrder\` ` +
    'w `MovementOrderSystem.js` — pin nie świeci przez literówkę we wzorcu ani na pustym pliku');
  assert(nulls.length === 0 && !/delete\s+\w+\.movementOrder/.test(mosCode),
    'S4b PIN DZIŚ: ANI JEDNO z nich nie zeruje pola i nie ma `delete` — marker jest z konstrukcji ' +
    'nieusuwalny przez warstwę rozkazów. VO-3/VO-3b MA to odwrócić.');

  // Trzej dalsi konsumenci tego samego martwego markera — to oni zamieniają naprawę S4
  // w zmianę TEMPA AI (plan D-VO1b / R-1). Pinujemy ich, żeby fix nie przeszedł po cichu.
  const tosCode  = codeOf('systems', 'TransportOrderSystem.js');
  const offCode  = codeOf('systems', 'director', 'DirectorOffensive.js');
  const docCode  = codeOf('systems', 'director', 'DirectorDoctrine.js');
  const truthy = (c) => /if\s*\(\s*v(essel)?\.movementOrder\s*\)/.test(c);
  assert(truthy(tosCode) && truthy(offCode) && truthy(docCode),
    'S4b PIN DZIŚ: trzej konsumenci testują SAMĄ OBECNOŚĆ markera, nie jego status ' +
    '(`TransportOrderSystem`, `DirectorOffensive`, `DirectorDoctrine`) — zerowanie markera ' +
    'PRZY DOMKNIĘCIU odblokuje pule uderzeniowe i doktrynalne AI. To jest treść decyzji D-VO1b.');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// S5 — BRAK GUARDU: nadpisanie żywego rozkazu jest ciche (Findings 118/127)
// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('S5 — `issueOrder` nie ma guardu „statek ma już rozkaz" (WYKONANIE + ŹRÓDŁO)');
{
  resetWorld();
  const { home } = buildWorld();
  const vMgr = new VesselManager();
  const mos  = new MovementOrderSystem(vMgr);
  mountLocator({ vMgr, mos, store: makeStore(), home });
  const v = spawnShip(vMgr);

  const spec = (y) => ({
    type: ORDER_TYPES.moveToPoint, targetPoint: { x: 0, y: y * AU },
    bypassFuelCheck: true, bypassSpaceportCheck: true,
  });
  const rA = mos.issueOrder(v.id, spec(-3));
  const orderA = v.movementOrder;
  assert(rA?.ok === true && orderA?.status === 'active',
    `S5 PRZESŁANKA: pierwszy rozkaz jest ŻYWY (status=${orderA?.status})`);

  // Nasłuch PER KANAŁ — sumaryczny licznik kłamie, bo nadpisanie emituje `vessel:launched`.
  const seen = { cancelled: 0, completed: 0, blocked: 0, issued: 0, launched: 0 };
  EventBus.on('vessel:orderCancelled', () => seen.cancelled++);
  EventBus.on('vessel:orderCompleted', () => seen.completed++);
  EventBus.on('vessel:orderBlocked',   () => seen.blocked++);
  EventBus.on('vessel:orderIssued',    () => seen.issued++);
  EventBus.on('vessel:launched',       () => seen.launched++);

  const rB = mos.issueOrder(v.id, spec(-6));
  assert(rB?.ok === true && v.movementOrder !== orderA,
    'S5 PIN DZIŚ: drugi rozkaz na statku z ŻYWYM rozkazem PRZECHODZI — `issueOrder:181-206` ' +
    'nie ma testu „ma już rozkaz". VO-3 MA to odwrócić (preempcja zamiast cichego nadpisania).');
  assert(orderA.status === 'active' && orderA.completedYear == null,
    `S5 PIN DZIŚ: stary rozkaz zostaje OSIEROCONY ze statusem \`${orderA.status}\` — nikt go ` +
    'nigdy nie domknie, bo `cancelOrder` czyta `vessel.movementOrder`, czyli już NOWY rozkaz');
  assert(seen.cancelled === 0 && seen.completed === 0 && seen.blocked === 0,
    `S5 PIN DZIŚ (CISZA): zero zdarzeń zamknięcia dla nadpisanego rozkazu ` +
    `(cancelled=${seen.cancelled}, completed=${seen.completed}, blocked=${seen.blocked})`);
  assert(seen.issued > 0 && seen.launched > 0,
    `S5 KONTROLA PINU (cisza ≠ „nie zmierzyłem"): ten sam nasłuch ZŁAPAŁ zdarzenia, które LECĄ ` +
    `(issued=${seen.issued}, launched=${seen.launched}) — milczenie na kanałach zamknięcia jest ` +
    'własnością kodu, nie wadą pomiaru');
}
{
  // KONTROLA PINU S5 — czy `ok:true` nie bierze się stąd, że walidator w ogóle nie działa?
  // Cztery różne klasy odmowy na TEJ SAMEJ ścieżce `issueOrder`, tuż obok nadpisania.
  resetWorld();
  const { home } = buildWorld();
  const vMgr = new VesselManager();
  const mos  = new MovementOrderSystem(vMgr);
  mountLocator({ vMgr, mos, store: makeStore(), home });
  const pt = { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 0, y: -3 * AU },
    bypassFuelCheck: true, bypassSpaceportCheck: true };

  const wreck = spawnShip(vMgr); wreck.isWreck = true;
  const stored = spawnShip(vMgr); stored.serviceState = 'stored';
  const ok = spawnShip(vMgr);

  const rNone   = mos.issueOrder('v_nie_ma', pt);
  const rWreck  = mos.issueOrder(wreck.id, pt);
  const rStored = mos.issueOrder(stored.id, pt);
  const rBad    = mos.issueOrder(ok.id, { type: ORDER_TYPES.pursue });   // bez celu

  assert(rNone?.reason === 'vessel_not_found' && rWreck?.reason === 'vessel_is_wreck'
      && rStored?.reason === 'vessel_in_reserve' && rBad?.ok === false,
    `S5 KONTROLA PINU: walidator DZIAŁA i odrzuca cztery klasy (${rNone?.reason} / ${rWreck?.reason} / ` +
    `${rStored?.reason} / ${rBad?.reason}) — brak testu „ma już rozkaz" jest WYBOREM w działającej ` +
    'bramce, nie awarią całego walidatora');
}
{
  // S5b — PIN ŹRÓDŁOWY na CIELE metody (nie na całym pliku: `vessel:orderCancelled` występuje
  // w `cancelOrder` i `_onVesselWrecked`, więc grep po pliku byłby jałowy).
  const mosCode = codeOf('systems', 'MovementOrderSystem.js');
  const iSig = mosCode.indexOf('issueOrder(vesselId');
  const body = mosCode.slice(iSig, mosCode.indexOf('\n  }', iSig));

  assert(iSig >= 0 && body.length > 200,
    `S5b KONTROLA PINU 0: ciało \`issueOrder\` wczytane z ŻYWEGO źródła (${body.length} zn. po ` +
    'zdjęciu komentarzy) — pin nie przechodzi na pustym pliku ani przy literówce w nazwie metody');
  assert(/isImmobilized/.test(body) && /isInService\s*\(\s*vessel\s*\)/.test(body),
    'S5b KONTROLA PINU: ten sam wycinek WIDZI istniejące bramki (`isImmobilized`, `isInService`) — ' +
    'nieobecność innych pochodzi z KODU, nie z regeksu');
  assert(!/movementOrder/.test(body) && !/cancelOrder/.test(body) && !/_preempt/.test(body),
    'S5b PIN DZIŚ: ciało `issueOrder` nie odwołuje się ANI do `movementOrder`, ANI do `cancelOrder`, ' +
    'ANI do `_preempt` — nie ma czym przerwać starego rozkazu. VO-3 MA to odwrócić, wstawiając ' +
    '`_preempt` POD istniejącymi bramkami (plan §3.1.4 pkt 1).');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// S6 — MENU TO TRZY KUBEŁKI: `getAvailableActions` jako automat na `position.state` (120/128)
// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('S6 — menu akcji jest zaszytym automatem na position.state (WYKONANIE)');
{
  resetWorld();
  // Fixture audytu: hull_medium z habitatem i ładownią — ten sam, na którym zmierzono 6/3/1.
  const v = createVessel('hull_medium', 'p_home',
    { modules: ['engine_ion', 'habitat_pod', 'cargo_small'] });
  const ids = (st) => { v.position.state = st; return getAvailableActions(v, {}).map(r => r.action.id); };

  const docked    = ids('docked');
  const orbiting  = ids('orbiting');
  const inTransit = ids('in_transit');

  assert(JSON.stringify(docked) === JSON.stringify(
    ['orbit', 'colonize', 'load_colonists', 'transport', 'transport_passenger', 'found_outpost']),
    `S6 PIN DZIŚ: kubełek \`docked\` = ${docked.length} pozycji w tej kolejności [${docked.join(', ')}]`);
  assert(JSON.stringify(orbiting) === JSON.stringify(['return_home', 'redirect', 'transport']),
    `S6 PIN DZIŚ: kubełek \`orbiting\` = ${orbiting.length} pozycji [${orbiting.join(', ')}]`);
  assert(inTransit.length === 1 && inTransit[0] === 'return_home',
    `S6 PIN DZIŚ: statek W LOCIE ma DOKŁADNIE JEDNĄ akcję [${inTransit.join(', ')}] — ` +
    'to nie jest „mniej swobody w obcym układzie", to brak swobody wszędzie. VO-4 MA to odwrócić.');

  // Sufit `in_transit` jest STRUKTURALNY, nie fixture'owy — kitchen-sink też daje 1.
  const vMax = createVessel('hull_large', 'p_home',
    { modules: ['engine_ion', 'habitat_pod', 'cargo_small', 'drop_pods', 'science_lab'] });
  vMax.position.state = 'in_transit';
  assert(getAvailableActions(vMax, {}).length === 1,
    'S6 KONTROLA PINU: kadłub z pięcioma modułami W LOCIE też ma 1 pozycję — sufit bierze się ' +
    'z gałęzi `else if (in_transit)` (FleetActions.js:680-683), a nie z ubogiego fixture\'u');

  // Brak gałęzi `else` — nieznany stan gasi menu po cichu.
  v.position.state = 'wrecked';
  const unknown = getAvailableActions(v, {}).length;
  v.position.state = 'docked';
  assert(unknown === 0 && getAvailableActions(v, {}).length === 6,
    `S6 PIN DZIŚ: nieznany \`position.state\` daje PUSTE menu (${unknown}) — brak gałęzi \`else\`; ` +
    'kontrola: ten sam statek w `docked` ma 6 pozycji, więc zero nie pochodzi ze zepsutego fixture\'u');
}
{
  // S6b — Finding 128: zgoda predykatu istnieje i jest NIEOSIĄGALNA z menu.
  resetWorld();
  const vSci = createVessel('hull_medium', 'p_home', { modules: ['engine_ion', 'science_lab'] });
  const state = {
    missionSystem: { getUnexploredCount: () => ({ total: 3 }), getActive: () => [] },
    colonyManager: { getColony: () => ({ buildingSystem: { hasSpaceport: () => true } }) },
  };
  window.KOSMOS.techSystem = { isResearched: () => true };

  vSci.position.state = 'docked';
  const inDocked = getAvailableActions(vSci, state).map(r => r.action.id);
  vSci.position.state = 'orbiting';
  const inOrbit  = getAvailableActions(vSci, state).map(r => r.action.id);
  const verdict  = FLEET_ACTIONS.survey.canExecute(vSci, state);

  assert(inDocked.includes('survey'),
    'S6b KONTROLA PINU (a): `survey` JEST osiągalne dla tego statku w `docked` — bez tego pin ' +
    'przechodziłby też dla kadłuba bez modułu naukowego i po naprawie 128 nadal by świecił');
  assert(verdict?.ok === true,
    'S6b KONTROLA PINU (b): `ACTIONS.survey.canExecute` mówi TAK dla `orbiting` ' +
    '(FleetActions.js:63 dopuszcza ten stan) — jest zgoda, którą menu ma ukrywać');
  assert(!inOrbit.includes('survey'),
    `S6b PIN DZIŚ (Finding 128): mimo zgody predykatu \`survey\` NIE POJAWIA SIĘ w menu ` +
    `\`orbiting\` [${inOrbit.join(', ')}] — kubełek decyduje o widoczności, \`canExecute\` tylko ` +
    'o szarości. VO-4 MA to odwrócić.');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
