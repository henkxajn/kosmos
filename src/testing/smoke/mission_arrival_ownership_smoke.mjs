// VESSEL_ORDERS VO-2 (ruch P2) — keeper: PRZYLOT JEST WŁASNOŚCIĄ STATKU, NIE KALENDARZA.
//
// PO CO: `MissionSystem._checkArrivals` bramkował przylot WYŁĄCZNIE zegarem
// (`exp.status === 'en_route' && this._gameYear >= exp.arrivalYear`) — ani słowa o tym, gdzie jest
// statek. Skutkiem były trzy findingi naraz: **115** (duch wypłaca łup pod nieobecność statku),
// **116** (ten sam duch TELEPORTUJE statek do celu NOWEGO rozkazu), **117** (kolonia powstaje
// 4,14 AU od statku, który nigdzie nie poleciał).
// Plan: docs/design/VESSEL_ORDERS_PLAN.md §1 (P2) · decyzje **D-VO2a = W1**, **D-VO2b = W1**.
//
// ⚠ PREDYKAT: `vessel.position.dockedAt === exp.targetId`. To NIE jest wybór estetyczny — trzy
//    pomiary go wymusiły:
//    1. **Nie ma pułapki jajko-kura.** `VesselManager._updatePositions:2367` ma WŁASNĄ detekcję
//       przylotu i stempluje `dockedAt`, a `MissionSystem._gameYear` idzie z `time:display`, które
//       `TimeSystem` emituje PO `time:tick`. Misja czyta zegar o TIK STARSZY ⇒ gdy pyta „czy
//       przyleciał", stempel już jest. ZMIERZONE: **LAG = 0** na sześciu typach misji + 37 nogach
//       recon, ani razu „termin minął, a predykat mówi NIE".
//    2. **Wariant odległościowy jest niewykonalny** — wymagany ε rośnie z prędkością gry:
//       0.122 AU @ tickSize 0.25 → **2.978 AU @ 12.0**. To rząd wielkości, który ma być KARANY
//       (Finding 117 = 4.14 AU).
//    3. **`dockedAt` dostaje termin układu ZA DARMO** — `_updatePositions:2380` sam ustawia `null`
//       (a nie `targetId`) dla ciała spoza układu statku. ZMIERZONE: **5518 par cross-system
//       w promieniu 0,5 AU**, najbliższa para **0.000 AU** — predykat odległościowy byłby tam ślepy.
//       (Ta sama klasa co Findingi 138/142.)
//
// ⚠ TRZY RZECZY, KTÓRE BY TEN COMMIT WYWRÓCIŁY — każda pinowana niżej:
//    • **Gałąź `returning` NIE MOŻE być bramkowana** (T4). `VesselManager:2368` jawnie wyklucza
//      `phase.startsWith('return')`, więc statek nie ma własnego domknięcia powrotu — bramka tam
//      zawiesiłaby KAŻDY powrót w grze.
//    • **Envoy nie ma pola `targetId` w ogóle** (T3) — rekord niesie `targetEmpireId`, statek nie
//      leci (`lockOnAbstractMission`). Bez wyjątku: ZMIERZONE **249 zablokowanych przylotów**
//      i statek `on_mission` na zawsze (zwolnienie wisi za gałęzią `returning`).
//    • **Cel w INNYM UKŁADZIE** (T5) — W3-4b świadomie nie dokuje (`dockedAt = null`), więc predykat
//      nie ma czym odpowiedzieć. Nie bramkujemy tego, czego nie umiemy zmierzyć; ta trasa należy
//      do `OrderService` (composite warp→dostawa).
//
// ⚠ DRUGA POŁOWA (D-VO2b = W1) — odmowa dyspozytora MUSI cofnąć wydatek.
//    Wszystkie ścieżki `_launch*` wydają PRZED dispatchem, a `_launchPassenger` fizycznie ZDEJMUJE
//    POP. Głośna odmowa bez zwrotu zamieniłaby cichego zombie w cichą KRADZIEŻ (T6/T7).
//    ⚠ Komentarz przy `_launchPassenger:970-972` DEKLARUJE dokładnie tę ochronę, której nie było.
//    Wzorzec zwrotki nie jest wynalazkiem — `_dispatchLoopLeg:2052` był jedynym miejscem w pliku,
//    które czytało wynik dyspozytora poprawnie.
//
// ⚠ ŚCIEŻKA WRAKU (D-VO2a = W1, T8) — `_preempt` z VO-3 jej NIE domknie (odpala na `issueOrder`,
//    a wrak nie przechodzi przez żaden intent). Dziś rekord martwego statku WYPŁACA ŁUP — to
//    nieodnotowany wariant Findingu 115, więc zamyka go ten commit, lustrem `_onColonyDestroyed`.
//
// Uruchom: node src/testing/smoke/mission_arrival_ownership_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import EventBus          from '../../core/EventBus.js';
import EntityManager     from '../../core/EntityManager.js';
import { MissionSystem } from '../../systems/MissionSystem.js';
import { VesselManager } from '../../systems/VesselManager.js';

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
    spend: (g) => { for (const [k, v] of Object.entries(g ?? {})) inv.set(k, (inv.get(k) ?? 0) - v); return true; },
    receive: (g) => { for (const [k, v] of Object.entries(g ?? {})) inv.set(k, (inv.get(k) ?? 0) + v); },
  };
}

function buildWorld() {
  EntityManager.add({ id: 'star_1', type: 'star', name: 'Słońce', systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: 'sys_home',
    x: 1 * AU, y: 0, explored: true });
  EntityManager.add({ id: 'ast_1', type: 'asteroid', name: 'Skała', systemId: 'sys_home',
    x: 0, y: 4 * AU, explored: true,
    deposits: [{ resourceId: 'Fe', richness: 2.0, remaining: 500 }] });
  // Ciało w INNYM układzie — do pinu cross-system (T5).
  EntityManager.add({ id: 'star_2', type: 'star', name: 'Obca', systemId: 'sys_far', x: 0, y: 0 });
  EntityManager.add({ id: 'far_1', type: 'planet', name: 'Obca I', systemId: 'sys_far',
    x: 0, y: 4 * AU, explored: true });
  return { home: EntityManager.get('p_home'), rock: EntityManager.get('ast_1'), far: EntityManager.get('far_1') };
}

function mountLocator({ vMgr, store, home }) {
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, resourceSystem: store,
    colonyManager: { activePlanetId: 'p_home', getColony: () => null },
    techSystem: {
      isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
      getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
    },
  });
}

function scene() {
  resetWorld();
  const w = buildWorld();
  const store = makeStore({ Fe: 1000, C: 1000, Si: 1000, water: 1000, power_cells: 1000 });
  const vMgr = new VesselManager();
  const ms   = new MissionSystem(store);
  mountLocator({ vMgr, store, home: w.home });
  return { ...w, ms, vMgr, store };
}

function dockShip(vMgr, { hull = 'hull_small', modules = ['engine_ion'], at = 'p_home' } = {}) {
  const body = EntityManager.get(at);
  const v = vMgr.createAndRegister(hull, 'p_home', { name: 'Sonda', modules: [...modules], x: body.x, y: body.y });
  v.position.state = 'docked'; v.position.dockedAt = at; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  return v;
}

/** Przesuń zegar tak, jak robi to gra: `time:display` USTAWIA rok misji, `time:tick` WYZWALA. */
function advanceTo(year) {
  window.KOSMOS.timeSystem.gameTime = year;
  EventBus.emit('time:display', { gameTime: year });
  EventBus.emit('time:tick', { deltaYears: 0.01, gameTime: year });
}
const activeOf = (ms, vId) => ms.getActive?.().find(e => e.vesselId === vId) ?? null;

// ═════════════════════════════════════════════════════════════════════════════════════════════════
header('T1 — DUCH ZABLOKOWANY: rekord nie „przylatuje", gdy statku nie ma u celu');
{
  const s = scene();
  const v = dockShip(s.vMgr);
  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });
  const exp = activeOf(s.ms, v.id);
  assert(!!exp && exp.status === 'en_route', `T1 PRZESŁANKA: misja wystartowała (${exp?.status})`);

  // Odtworzenie realnego mechanizmu przekierowania: rozkaz ruchu PODMIENIA `vessel.mission`,
  // więc `_updatePositions` przestaje lecieć statkiem do celu misji — a rekord zostaje.
  v.mission = null;
  v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.position.x = 3 * AU; v.position.y = -3 * AU;

  const feBefore = s.store.getAmount('Fe');
  advanceTo((exp.arrivalYear ?? 0) + 0.01);

  assert(exp.status === 'en_route',
    `T1 PIN: rekord NIE „przyleciał" (status=${exp.status}) — bramka pyta o STATEK, nie o zegar`);
  assert(s.store.getAmount('Fe') === feBefore,
    `T1 PIN (SKUTEK, nie bramka): magazyn Fe bez zmian (${feBefore}) — przed VO-2 duch wypłacał łup ` +
    'przy statku oddalonym o kilka AU (Finding 115)');
  assert(Math.hypot(v.position.x - s.rock.x, v.position.y - s.rock.y) / AU > 1.0,
    'T1 PIN: statek NIE został teleportowany do celu misji (Finding 116)');
}

header('T2 — KONTROLA PINU: zdrowa misja dolatuje i rozlicza się jak dotąd');
{
  const s = scene();
  const v = dockShip(s.vMgr);
  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });
  const exp = activeOf(s.ms, v.id);
  const feBefore = s.store.getAmount('Fe');

  // Tyknij po kolei aż do przylotu — tak jak biegnie gra (statek leci, potem misja pyta).
  for (let y = 0.1; y <= (exp.arrivalYear ?? 0) + 0.5; y += 0.1) advanceTo(y);

  assert(exp.status === 'orbiting',
    `T2 KONTROLA PINU: zdrowa misja DOLATUJE (status=${exp.status}) — bramka nie blokuje ` +
    'niczego, co dolatywało wcześniej. Bez tego pin T1 byłby nieodróżnialny od „nic nie działa"');
  assert(s.store.getAmount('Fe') > feBefore,
    `T2 KONTROLA PINU: łup wypłacony (Fe ${feBefore} → ${s.store.getAmount('Fe')})`);
  assert(v.position.dockedAt === 'ast_1',
    `T2 PRZESŁANKA PREDYKATU: w chwili rozliczenia statek MA stempel celu (dockedAt=${v.position.dockedAt}) ` +
    '— to jest ta własność, na której stoi predykat (LAG = 0)');
}

header('T3 — ENVOY: misja abstrakcyjna (bez `targetId`) NIE jest bramkowana');
{
  const s = scene();
  const v = dockShip(s.vMgr, { modules: ['engine_ion', 'diplomatic_module'] });
  // Rekord envoy budujemy tak, jak robi to `_launchEnvoy`: cel = IMPERIUM, brak `targetId`.
  const exp = {
    id: 'exp_envoy', type: 'envoy', targetEmpireId: 'emp_001', vesselId: v.id,
    status: 'en_route', departYear: 0, arrivalYear: 1.0, returnYear: 3.0,
    distance: 0, travelTime: 3.0, originColonyId: 'p_home',
  };
  s.ms._missions.push(exp);
  assert(!('targetId' in exp),
    'T3 PRZESŁANKA: rekord envoy NIE MA pola `targetId` (niesie `targetEmpireId`) — predykat ' +
    'oparty na `dockedAt === exp.targetId` porównywałby z `undefined`');

  advanceTo(1.5);
  assert(exp.status !== 'en_route',
    `T3 PIN: emisariusz DOTARŁ (status=${exp.status}) — misja abstrakcyjna przechodzi bez bramki. ` +
    'Bez tego wyjątku ZMIERZONO 249 zablokowanych przylotów i statek `on_mission` na zawsze');
}

header('T4 — POWRÓT nie jest bramkowany (inaczej zawisłby KAŻDY powrót w grze)');
{
  const s = scene();
  const v = dockShip(s.vMgr);
  const exp = {
    id: 'exp_ret', type: 'mining', targetId: 'ast_1', vesselId: v.id,
    status: 'returning', departYear: 0, arrivalYear: 1.0, returnYear: 2.0,
    distance: 3, travelTime: 1.0, originColonyId: 'p_home',
  };
  s.ms._missions.push(exp);
  // Statek w drodze powrotnej — z definicji NIE jest u celu misji.
  v.position.state = 'in_transit'; v.position.dockedAt = null;

  advanceTo(2.5);
  assert(exp.status === 'completed',
    `T4 PIN: powrót domknięty (status=${exp.status}) MIMO że statek nie jest u celu — gałąź ` +
    '`returning` jest POZA bramką. `VesselManager:2368` jawnie wyklucza `phase.startsWith("return")`, ' +
    'więc statek nie ma własnego domknięcia powrotu i bramka zawiesiłaby każdy powrót');
}

header('T5 — CEL W INNYM UKŁADZIE: nie bramkujemy tego, czego predykat nie umie zmierzyć');
{
  const s = scene();
  const v = dockShip(s.vMgr);
  const exp = {
    id: 'exp_x', type: 'mining', targetId: 'far_1', vesselId: v.id,
    status: 'en_route', departYear: 0, arrivalYear: 1.0, returnYear: 3.0,
    distance: 3, travelTime: 1.0, originColonyId: 'p_home',
  };
  s.ms._missions.push(exp);
  v.position.state = 'orbiting'; v.position.dockedAt = null;   // W3-4b: obce ciało → dockedAt = null

  advanceTo(1.5);
  assert(exp.status !== 'en_route',
    `T5 PIN: misja z celem w innym układzie przechodzi (status=${exp.status}) — W3-4b ŚWIADOMIE ` +
    'nie dokuje do obcego ciała, więc `dockedAt` nie ma czym odpowiedzieć. Ta trasa należy do ' +
    '`OrderService` (composite warp→dostawa), nie do tej bramki');
}

header('T6 — ODMOWA DYSPOZYTORA: rekord NIE powstaje, a wydatek WRACA');
{
  const s = scene();
  const v = dockShip(s.vMgr);
  // ⚠ Scenariusz REALNY, nie sztuczny: `undockToOrbit` zostawia `status='idle'` + `state='orbiting'`,
  //   a bramka `_launch` sprawdza TYLKO `status`. Statek przechodzi bramkę, a dyspozytor odmawia
  //   (`dispatchOnMission` wymaga `position.state === 'docked'`).
  s.vMgr.undockToOrbit(v.id);
  assert(v.status === 'idle' && v.position.state === 'orbiting',
    `T6 PRZESŁANKA: statek na orbicie, ale `+`idle (${v.status}/${v.position.state}) — przechodzi ` +
    'bramkę `_launch`, odmawia dopiero dyspozytor');

  const feBefore = s.store.getAmount('Fe');
  const before = s.ms.getActive?.().length ?? 0;
  let failed = null;
  EventBus.on('expedition:launchFailed', (d) => { failed = d; });

  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });

  assert((s.ms.getActive?.().length ?? 0) === before,
    'T6 PIN: rekord misji NIE POWSTAŁ — przed VO-2 zostawał `en_route` i „przylatywał" po zegarze ' +
    '(ZMIERZONE: duch wypłacał 77 minerałów i przenosił statek 3,4 AU bez lotu)');
  assert(!!failed,
    `T6 PIN: odmowa jest GŁOŚNA (expedition:launchFailed, reason="${failed?.reason ?? '—'}")`);
  assert(s.store.getAmount('Fe') === feBefore,
    `T6 PIN (D-VO2b): wydatek COFNIĘTY — Fe ${feBefore} → ${s.store.getAmount('Fe')}. Bez zwrotu ` +
    'zamienilibyśmy cichego zombie na cichą KRADZIEŻ');
}

header('T7 — ODMOWA przy transporcie pasażerskim: POP wracają do źródła');
{
  const s = scene();
  const v = dockShip(s.vMgr, { hull: 'hull_medium', modules: ['engine_ion', 'passenger_module'] });
  const civ = {
    population: 10, freePops: 8,
    removePop: (_t, n) => { civ.population -= n; civ.freePops -= n; return n; },
    addPop: (_t, n) => { civ.population += n; civ.freePops += n; return n; },
  };
  window.KOSMOS.colonyManager = {
    activePlanetId: 'p_home',
    // ⚠ `buildingSystem` OBOWIĄZKOWY: `hull_medium` przechodzi bramkę portu (`_checkPadForVessel`),
    //   a bez niej `_launchPassenger` odpadał na `mission.noSpaceport` PRZED zdjęciem POP
    //   i pin był jałowy (złapane fail-first).
    getColony: (id) => (id === 'p_home'
      ? { planetId: 'p_home', civSystem: civ, resourceSystem: s.store,
          buildingSystem: { hasSpaceport: () => true } }
      : null),
  };
  // ⚠ TU inna, ale też REALNA przyczyna odmowy niż w T6: `_launchPassenger` bramkuje na wejściu
  //   `position.state !== 'docked'`, więc scenariusz „na orbicie" odpadłby PRZED zdjęciem POP
  //   i pin byłby JAŁOWY (złapane fail-first: przechodził przed naprawą). Bierzemy kadłub
  //   w REZERWIE (W2): przechodzi wszystkie bramki metody, POP schodzi, a `dispatchOnMission`
  //   odmawia dopiero na `isInService`.
  v.serviceState = 'stored';
  const popBefore = civ.population;

  EventBus.emit('expedition:passengerRequest', { targetId: 'ast_1', vesselId: v.id });

  assert(civ.population === popBefore,
    `T7 PIN (D-VO2b): populacja źródła bez zmian (${popBefore} → ${civ.population}) — POP zdejmowane ` +
    'PRZED dispatchem wracają przy odmowie. ⚠ Komentarz przy `_launchPassenger:970-972` DEKLAROWAŁ ' +
    'tę ochronę, a jej nie było (ZMIERZONE: 4 POP zdjęte, statek został w doku)');
  assert((v.colonists ?? 0) === 0,
    `T7 PIN: statek nie zatrzymuje pasażerów (colonists=${v.colonists ?? 0})`);
}

header('T8 — WRAK: rekord martwego statku zostaje zamknięty, nie wisi jako zombie');
{
  const s = scene();
  const v = dockShip(s.vMgr);
  EventBus.emit('expedition:sendRequest', { type: 'mining', targetId: 'ast_1', vesselId: v.id });
  const exp = activeOf(s.ms, v.id);
  assert(!!exp && exp.status === 'en_route', `T8 PRZESŁANKA: misja w locie (${exp?.status})`);

  const feBefore = s.store.getAmount('Fe');
  EventBus.emit('vessel:wrecked', { vessel: v, vesselId: v.id });

  assert(exp.status === 'completed',
    `T8 PIN (D-VO2a): rekord zamknięty po zniszczeniu statku (status=${exp.status}). ⚠ VO-3 tego ` +
    'NIE domknie — `_preempt` odpala na `issueOrder`, a wrak nie przechodzi przez żaden intent');

  advanceTo((exp.arrivalYear ?? 0) + 0.01);
  assert(s.store.getAmount('Fe') === feBefore,
    `T8 PIN (SKUTEK): martwy statek NIE wypłaca łupu (Fe ${feBefore}) — to był nieodnotowany ` +
    'wariant Findingu 115');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
