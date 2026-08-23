// VESSEL_ORDERS VO-1 (ruch P0) — keeper ODKOTWICZENIA DYSTANSU MISJI.
//
// PO CO: `MissionSystem._calcDistance` liczył odległość od `window.KOSMOS.homePlanet`, a nie od
// statku. ZMIERZONE przed naprawą: statek stojący 0.001 AU od celu dostawał wycenę **2.581 AU**
// i pre-check paliwa na 0.90 jednostki, których nie potrzebował. Ta jedna liczba zasila CZTERECH
// konsumentów naraz: bramkę paliwa, `travelTime`, kalendarz `arrivalYear`/`returnYear` oraz
// `fuelCost` realnie odejmowany w `dispatchOnMission`. ⇒ Finding 122.
// Plan: docs/design/VESSEL_ORDERS_PLAN.md §1 (P0) · audyt: UNIFIED_VESSEL_ORDERS_AUDIT.md §1.4.
//
// ⚠ ŹRÓDŁO ORIGINU JEST KANONEM, NIE WYBOREM. Repo ma JEDNO poprawne rozwiązanie „skąd startuje
//    statek" i mieszka ono w `VesselManager.dispatchOnMission:407-412`:
//       encja doku → jeśli `type === 'station'`, PODMIEŃ na `bodyId` → x/y (LIVE)
//       brak doku (orbiting / dryf)          → surowe `vessel.position.x/y`
//       brak statku (envoy, sortowanie)      → `homePlanet` (dzisiejszy fallback, bit w bit)
//    Ten sam kanon powtórzony jest w repo cztery razy (`VesselManager:2213`, `dockAtStation:713-722`,
//    `MissionSystem._findTarget:2752-2759`, `StationSystem:525`), zawsze z tym samym komentarzem:
//    encja stacji ma STATYCZNE x/y (anchored GEO). Używamy go tu z tego samego powodu — i dodatkowo
//    dlatego, że `dispatchOnMission` liczy tym samym rozwiązaniem START TRASY, więc wycena i lot
//    przestają mieć dwa różne źródła prawdy.
//
// ⚠ CZEGO TU CELOWO NIE MA (żeby następny czytelnik nie „dokończył" tego przez pomyłkę):
//   • `_getVesselOrigin` z MARTWEGO bliźniaka `ExpeditionSystem.js:1984` — zwraca encję doku BEZ
//     rozwiązania stacji. ZMIERZONE: dla statku przy stacji orbitalnej myli się o **0.695 AU**
//     (encja stacji odjeżdża od własnego ciała nawet o 3.03 AU). Ten helper powstał 2026-03-27,
//     encja `Station` — 2026-06-04. Jest STARSZY niż mechanika, o którą się rozbija. **T3 to pinuje.**
//   • `_findNearestUnexplored:2609` — sortowanie kandydatów recon ZOSTAJE liczone od `homePlanet`.
//     To nie przeoczenie: zmiana punktu odniesienia sortu zmienia, KTÓRE ciało zostanie celem,
//     czyli zachowanie gry, a nie liczbę. Poza zakresem VO-1, świadomie. **T6 to pinuje.**
//     ⚠ Konsekwencja przyjęta z otwartymi oczami: bliźniak `_findNearestUnexploredFrom:2613` JUŻ
//     sortuje od statku, więc pierwszy odcinek deep_scan wybiera cel inaczej niż każdy następny.
//   • `_launchTransport:858` — tam poprawka jest inline od dawna (gałąź `if (vessel)`), a
//     `_calcDistance` jest już tylko fallbackiem dla `vessel === null`. Nietknięte.
//   • `_launchEnvoy` — misja abstrakcyjna, `distance: 0` zaszyte, nie używa `_calcDistance` w ogóle.
//
// ⚠ T5 PINUJE DEFEKT, KTÓRY VO-1 SAM BY STWORZYŁ, gdyby się zatrzymał na `_calcDistance`.
//    `exp.distance` pełniło PODWÓJNĄ rolę: „dystans tam" ORAZ „dystans powrotu do domu".
//    `_orderReturn` w gałęzi Z ORBITY liczył `returnTime = exp.distance / shipSpeed` — i to było
//    przypadkiem poprawne wyłącznie dlatego, że `exp.distance` znaczyło dom→cel. Po odkotwiczeniu
//    znaczy statek→cel (krótki odcinek), więc powrót z wysuniętej bazy dostałby kalendarz z złego
//    odcinka. Naprawa NIE jest wynalazkiem: gałąź `en_route` tej SAMEJ metody (:1093-1098) już liczy
//    poprawnie — z `vessel.position` do encji `vessel.colonyId`. VO-1 rozciąga jej wzorzec na drugą
//    gałąź. Paliwo i bramka strandingu były i zostają niezależne (`VesselManager.startReturn`).
//
// Uruchom: node src/testing/smoke/mission_distance_anchor_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import EventBus          from '../../core/EventBus.js';
import EntityManager     from '../../core/EntityManager.js';
import { MissionSystem } from '../../systems/MissionSystem.js';
import { VesselManager } from '../../systems/VesselManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const AU = 110;                                   // GameConfig.AU_TO_PX

// ── harness (wzór: vessel_orders_seams_smoke) ────────────────────────────────────────────────────
// ⚠ EventBus/EntityManager to singletony — czyścimy PRZED konstrukcją systemów (subskrybują
//    w konstruktorze), nigdy po.
function resetWorld() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 0 } };
}

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

/** Świat: gwiazda (0,0) · dom 1 AU · odległa kolonia 6 AU · cel misji 6.2 AU (tuż obok odległej).
 *  ⚠ BEZ pola `orbital` — niepełny `orbital` wpycha NaN do `_predictPosition` (zmierzone w VO-0). */
function buildWorld() {
  EntityManager.add({ id: 'star_1', type: 'star', name: 'Słońce', systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: 'sys_home',
    x: 1 * AU, y: 0, explored: true });
  EntityManager.add({ id: 'p_far', type: 'planet', name: 'Przyczółek', systemId: 'sys_home',
    x: 6 * AU, y: 0, explored: true });
  EntityManager.add({ id: 'ast_1', type: 'asteroid', name: 'Skała', systemId: 'sys_home',
    x: 6.2 * AU, y: 0, explored: true,
    deposits: [{ resourceId: 'Fe', richness: 2.0, remaining: 500 }] });
  return {
    home: EntityManager.get('p_home'),
    far:  EntityManager.get('p_far'),
    rock: EntityManager.get('ast_1'),
  };
}

function mountLocator({ vMgr, store, home }) {
  Object.assign(window.KOSMOS, {
    civMode: true,
    homePlanet: home,
    vesselManager: vMgr,
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

function scene() {
  resetWorld();
  const w = buildWorld();
  const store = makeStore({ Fe: 1000 });
  const vMgr = new VesselManager();
  const ms   = new MissionSystem(store);
  mountLocator({ vMgr, store, home: w.home });
  return { ...w, ms, vMgr, store };
}

/** Statek zadokowany przy `dockId`, ustawiony na pozycji tego ciała (tak jak robi to tick). */
function dockShipAt(vMgr, dockId, colonyId = 'p_home') {
  const body = EntityManager.get(dockId);
  const anchor = body?.type === 'station' ? EntityManager.get(body.bodyId) : body;
  const v = vMgr.createAndRegister('hull_small', colonyId,
    { name: 'Sonda', modules: ['engine_ion'], x: anchor?.x ?? 0, y: anchor?.y ?? 0 });
  v.position.state = 'docked';
  v.position.dockedAt = dockId;
  v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999;
  v.speedAU = 1.0;
  return v;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('T1 — statek stojący PRZY CELU nie płaci daniny od planety macierzystej');
{
  const s = scene();
  const v = dockShipAt(s.vMgr, 'p_far');                       // 6 AU od domu, 0.2 AU od celu
  const origin = s.ms._getVesselOrigin?.(v.id) ?? null;

  assert(typeof s.ms._getVesselOrigin === 'function',
    'T1 PRZESŁANKA: `MissionSystem._getVesselOrigin` ISTNIEJE (przed VO-1 helpera nie było wcale)');
  assert(!!origin && near(origin.x, 6 * AU, 1e-6) && near(origin.y, 0, 1e-6),
    `T1: origin zadokowanego statku = pozycja jego ciała (${origin?.x}, ${origin?.y}) = p_far`);

  const anchored = s.ms._calcDistance(s.rock);                 // stary kształt — bez origin
  const fromShip = s.ms._calcDistance(s.rock, origin);
  assert(near(fromShip, 0.2, 1e-6),
    `T1 PIN: dystans liczony OD STATKU = ${fromShip.toFixed(4)} AU (realny 0.2 AU)`);
  assert(anchored > 5.0 && fromShip < 0.5,
    `T1 PIN (skala defektu): bez origin ta sama misja wyceniana jest na ${anchored.toFixed(4)} AU ` +
    `zamiast ${fromShip.toFixed(4)} AU — ${(anchored / fromShip).toFixed(0)}× zawyżenie`);
}

header('T2 — pełna ścieżka startu: pre-check paliwa i kalendarz liczone od statku');
{
  const s = scene();
  const v = dockShipAt(s.vMgr, 'p_far');
  // ⚠ Paliwo dobrane tak, by pin NIE BYŁ JAŁOWY: dziś bramka liczy 5.2 AU × consumption ≈ 2.8
  //   i ODMAWIA startu; po VO-1 liczy 0.2 AU × consumption ≈ 0.11 i przepuszcza. Przy zapasie 3
  //   (pierwsza wersja) misja startowała PRZED i PO — asercja nic nie mierzyła.
  v.fuel.current = v.fuel.max = 1.0;
  const consumption = v.fuel.consumption;

  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });
  const exp = s.ms.getActive?.().find(e => e.vesselId === v.id) ?? null;

  assert(!!exp,
    'T2 PIN (SKUTEK, nie bramka): misja z wysuniętej bazy WYSTARTOWAŁA — pre-check paliwa liczy ' +
    `odcinek statek→cel (0.2 AU × ${consumption.toFixed(2)}), nie dom→cel`);
  assert(!!exp && exp.distance < 0.5,
    `T2 PIN: zapisany \`mission.distance\` = ${exp?.distance} AU (odcinek realny), nie ~5.2 AU`);
  assert(!!exp && exp.travelTime < 0.5,
    `T2 PIN: \`travelTime\` = ${exp?.travelTime} lat — kalendarz zgodny z trasą, którą statek ` +
    'faktycznie poleci (`dispatchOnMission` liczy start tym samym rozwiązaniem originu)');
}

header('T3 — KANON STACJI: origin bierze się z ciała macierzystego, nie z zamrożonej encji stacji');
{
  const s = scene();
  // Encja stacji ma x/y ZAMROŻONE w chwili budowy (`Station.orbital = null` → fizyka jej nie tyka).
  // Tu odtwarzamy stan po dryfie ciała: stacja pamięta stare (2 AU, 0), ciało jest na (6 AU, 0).
  EntityManager.add({ id: 'st_1', type: 'station', name: 'Stacja', systemId: 'sys_home',
    bodyId: 'p_far', x: 2 * AU, y: 0 });
  const v = dockShipAt(s.vMgr, 'st_1');
  const origin = s.ms._getVesselOrigin?.(v.id) ?? null;

  assert(!!origin && near(origin.x, 6 * AU, 1e-6),
    `T3 PIN: statek zadokowany przy STACJI dostaje origin z jej \`bodyId\` (${origin?.x} = p_far), ` +
    'a NIE z zamrożonego x/y encji stacji (220 = 2 AU) — kanon `dispatchOnMission:409`');
  assert(!!origin && !near(origin.x, 2 * AU, 1e-6),
    'T3 KONTROLA PINU: gdyby przeniesiono `_getVesselOrigin` z martwego bliźniaka DOSŁOWNIE, ' +
    'origin byłby zamrożoną encją stacji — ta asercja by padła. Zmierzony błąd tamtej wersji: 0.695 AU');
}

header('T4 — statek W PRZESTRZENI (orbiting / dryf, dockedAt = null) → surowa pozycja');
{
  const s = scene();
  const v = dockShipAt(s.vMgr, 'p_far');
  v.position.state = 'orbiting';
  v.position.dockedAt = null;                                  // stan realny po Findingu 125 / engage
  v.position.x = 3 * AU; v.position.y = 4 * AU;
  const origin = s.ms._getVesselOrigin?.(v.id) ?? null;

  assert(!!origin && near(origin.x, 3 * AU, 1e-6) && near(origin.y, 4 * AU, 1e-6),
    `T4 PIN: bez doku origin = surowe \`vessel.position\` (${origin?.x}, ${origin?.y}) — ` +
    'gałąź, którą `dispatchOnMission:410-411` pokrywa fallbackiem `?? vessel.position`');
}

header('T5 — POWRÓT Z ORBITY liczony od statku, nie z `exp.distance` (defekt, który VO-1 sam tworzy)');
{
  const s = scene();
  const v = dockShipAt(s.vMgr, 'p_far');
  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });
  const exp = s.ms.getActive?.().find(e => e.vesselId === v.id) ?? null;
  assert(!!exp && exp.distance < 0.5,
    `T5 PRZESŁANKA: \`exp.distance\` = ${exp?.distance} AU to teraz odcinek STATEK→CEL, ` +
    'więc reużycie go jako drogi powrotnej byłoby błędem');

  // Doprowadź misję do orbity celu.
  window.KOSMOS.timeSystem.gameTime = (exp.arrivalYear ?? 0) + 0.01;
  EventBus.emit('time:display', { gameTime: window.KOSMOS.timeSystem.gameTime });
  EventBus.emit('time:tick', { deltaYears: 0.001, gameTime: window.KOSMOS.timeSystem.gameTime });
  assert(exp.status === 'orbiting',
    `T5 PRZESŁANKA: misja na orbicie celu (status=${exp.status}) — to gałąź „Z orbity" w _orderReturn`);

  const yearAtOrder = window.KOSMOS.timeSystem.gameTime;
  EventBus.emit('expedition:orderReturn', { expeditionId: exp.id });
  const returnTime = (exp.returnYear ?? 0) - yearAtOrder;
  const realBack = Math.hypot(v.position.x - s.home.x, v.position.y - s.home.y) / AU;

  assert(exp.status === 'returning',
    `T5 PRZESŁANKA: rozkaz powrotu przyjęty (status=${exp.status})`);
  assert(returnTime > 4.0 && near(returnTime, realBack / v.speedAU, 0.02),
    `T5 PIN: kalendarz powrotu = ${returnTime.toFixed(3)} lat ≈ realna droga do domu ` +
    `${realBack.toFixed(3)} AU / ${v.speedAU} AU/rok — a NIE \`exp.distance\` (${exp.distance} AU), ` +
    'która po odkotwiczeniu opisuje zupełnie inny odcinek');
  assert(!near(returnTime, exp.distance / v.speedAU, 0.02),
    `T5 KONTROLA PINU: gdyby VO-1 zatrzymał się na \`_calcDistance\`, powrót dostałby ` +
    `${(exp.distance / v.speedAU).toFixed(3)} lat zamiast ${returnTime.toFixed(3)} — ta asercja by padła`);
}

header('T6 — REGRESJA: ścieżki BEZ statku zachowują dzisiejszy fallback bit w bit');
{
  const s = scene();

  const noFrom = s.ms._calcDistance(s.rock);
  const explicitHome = s.ms._calcDistance(s.rock, s.home);
  assert(near(noFrom, explicitHome, 1e-9),
    `T6 PIN: wywołanie BEZ origin liczy od \`homePlanet\` (${noFrom.toFixed(4)} AU) — dokładnie jak ` +
    'przed VO-1. Envoy i sortowanie kandydatów nie zmieniają zachowania');
  assert(near(noFrom, 5.2, 1e-6),
    `T6 KONTROLA PINU: to jest liczba dom→cel (${noFrom.toFixed(4)} AU = 6.2 − 1.0), ` +
    'więc fallback naprawdę idzie od domu, a nie przypadkiem od statku');

  assert(s.ms._getVesselOrigin('nie_ma_takiego') === null && s.ms._getVesselOrigin(null) === null,
    'T6 PIN: brak statku → `_getVesselOrigin` zwraca `null`, a nie `{x:0,y:0}`. ⚠ To istotne: ' +
    '`euclideanAU(null, X)` liczy od GWIAZDY (fail-open), więc cichy null byłby wyceną od Słońca');

  // Sortowanie recon ZOSTAJE zakotwiczone — świadomie poza zakresem VO-1.
  const src = s.ms._findNearestUnexplored?.toString() ?? '';
  assert(!/_calcDistance\([^)]*,/.test(src),
    'T6 PIN ŹRÓDŁOWY: `_findNearestUnexplored` NADAL sortuje bez origin — zmiana punktu odniesienia ' +
    'sortu zmieniałaby WYBÓR celu recon, czyli zachowanie gry. Poza zakresem VO-1, świadomie.');
}

header('T7 — statek zadokowany W DOMU: dystans NIEZMIENIONY (scenariusz ±0%)');
{
  const s = scene();
  const v = dockShipAt(s.vMgr, 'p_home');
  const origin = s.ms._getVesselOrigin(v.id);
  const fromShip = s.ms._calcDistance(s.rock, origin);
  const anchored = s.ms._calcDistance(s.rock);
  assert(near(fromShip, anchored, 1e-9),
    `T7 KONTROLA PINU (regresja balansu): dla statku w koloni MACIERZYSTEJ naprawa nie zmienia nic — ` +
    `${fromShip.toFixed(4)} AU przed i po. Cięcie kosztu dotyczy WYŁĄCZNIE baz wysuniętych`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
