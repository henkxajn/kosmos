// ═══════════════════════════════════════════════════════════════════════════════
// map_click_frame_smoke — KEEPER legu D Findingu 255 (noga MAPY), D-LD1..D-LD5
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: współrzędne są LOKALNE dla układu (gwiazda każdego układu stoi w (0,0)),
//   więc goły punkt NIE NIESIE RAMKI. Klik PPM na mapie 3D jest zawsze w ramce KAMERY
//   (`activeSystemId`), a `StarSystemManager.switchActiveSystem:152` NIE czyści
//   zaznaczenia statku ani floty — żaden konsument `system:switched` tego nie robi
//   (`GameScene:3435` przełącza aktywną KOLONIĘ, `FMO:505` resetuje pan/zoom mapy).
//   Statek z innego układu zostaje więc zaznaczony i dostaje TE SAME współrzędne
//   odmierzone od SWOJEJ gwiazdy. ZMIERZONE repro właściciela (`mo_6`): statek
//   w `sys_020`, kamera na `sys_home`, klik w pustkę → `{ok:true}`, misja
//   `move_to_point` do (15.71, −158.94) W `sys_020`, spalone paliwo, **0 wpisów
//   w Dzienniku**. Cicho.
//
// ⚠ GDZIE SIEDZI TERMIN I DLACZEGO TAM (D-LD1): u WOŁAJĄCEGO (`RightClickMenu`), nie
//   w `buildOrderSpec`/`_buildFleetSpec`. Tamte są CZYSTE — `OrderDispatcher.js` nie
//   importuje niczego i dostaje `vesselId` jako STRING (nie obiekt), a
//   `_buildFleetSpec(option, target)` nie dostaje ani statku, ani `fleetId`. T8 pilnuje
//   tej czystości ŹRÓDŁOWO, z kontrolą na zmutowanej kopii.
//
// ⚠ CZEGO TU NIE MA I DLACZEGO — TERMIN NIE MOŻE STAĆ W `FleetSystem.issueFleetOrder`,
//   choć to JEDYNE miejsce pokrywające naraz PPM floty I oba pickery. Ta funkcja
//   obsługuje TAKŻE „Powrót do bazy", którego cel liczy się w układzie STATKU
//   (`nearestOwnColonyBodyInSystem`, naprawa 154) — termin „ramka statku ≠ kamera"
//   odrzuciłby tam rozkaz CAŁKOWICIE POPRAWNY. **T4 to pinuje i jest NAJWAŻNIEJSZYM
//   pinem tego slice'u**: mierzy PRAWDZIWE `issueFleetOrder`, więc pada, gdyby ktoś
//   przeniósł bramkę do fan-outu. Predykat NIE jest własnością ROZKAZU — jest własnością
//   pary (statek, kamera).
//
// ⚠ ZAKRES TYPÓW (`POINT_SOURCED_ORDER_TYPES` = moveToPoint + dock) wynika z tej samej
//   miary, i był MIERZONY, nie założony: `retreat` liczy cel w układzie STATKU
//   (statek w `sys_020` przy kamerze `sys_home` dostaje poprawny `targetPoint {286,0}`
//   = `f_a` w SWOIM układzie) ⇒ bramka na całej pętli byłaby fałszywym negatywem tej
//   samej klasy co regresja fan-outu. `escort` to Finding 264 (inny brak),
//   `goToPOI`/`patrol` chodzą po `poiId`, a POI nie ma `systemId` (Finding 152).
//
// PINY:
//   T1   ADMISJA — repro `mo_6` przez PRAWDZIWY łańcuch PPM: rozkaz NIE powstaje,
//        misja `null`, paliwo NIETKNIĘTE, DOKŁADNIE jeden wpis (fleet/warn)
//        + T1c KONTROLA: ta sama scena z kamerą na układzie STATKU ⇒ rozkaz POWSTAJE
//   T1b  PAYLOAD, NIE SŁOWNIK — tekst z `eventLogSystem.push` niesie NAZWĘ statku
//        i PRZETŁUMACZONY powód, w PL i EN, bez surowego sluga. ⚠ Grep po kluczu
//        dowiódłby OBECNOŚCI NAPISU, nie jego DOSTARCZENIA (lekcja Findingu 157)
//   T2   MIXED multi-select — OBA liczniki: in-frame RUSZYŁ **i** out-of-frame NAZWANY
//        (sam „brak złych rozkazów" przeszedłby jałowo na pustym zbiorze)
//   T3   FLOTA cała poza ramką — odmowa, raport nazywa KAŻDEGO członka
//   T3b  FLOTA MIESZANA (D-LD2) — OBA liczniki: ŻADEN członek nie ruszył (odmowa
//        całofoltowa) **i** nazwani są WYŁĄCZNIE ci poza ramką
//   T4   🔑 KONTROLA WYCIEKU DO FAN-OUTU — „Powrót do bazy" floty spoza ramki NADAL
//        przechodzi przez PRAWDZIWE `issueFleetOrder` + kontrola nie-jałowości (cel
//        naprawdę pochodzi z układu STATKU)
//   T4b  KONTROLA ZAKRESU D-LD4 — `dock` wydany POZA mapą (wprost do MOS) dalej
//        przechodzi; leg D zamyka producenta MAPY, nie mechanikę doku (256 zostaje)
//   T5   NIE-REGRESJA 147 — statek w skoku dostaje DOKŁADNIE `vessel_in_warp_transit`,
//        nie powód legu D (fail-open na `systemIdOf === null` — kolejność zmierzona)
//   T6   NIE-REGRESJA 254 — composite cross-system nietknięty
//   T7   ANTY-JAŁOWOŚĆ — klik w tej samej ramce NADAL wysyła statek
//   T8   PIN ŹRÓDŁOWY — `OrderDispatcher.js` pozostaje CZYSTY (bez `window.KOSMOS`,
//        `activeSystemId`, `systemIdOf`), na źródle BEZ KOMENTARZY + KONTROLA na
//        zmutowanej kopii (pin, który nie umie paść, nie jest pinem)
//   T9   ⚠ PINY ODWRÓCONE — ŚWIADOMIE pinują DEFEKT, żeby gate nie wziął legu D za
//        pełne domknięcie 255. Rows 8/9 (pickery flotowe, `FMO:4739`/`FleetCommandPanel:354`,
//        Finding 255 OTWARTY) i row 3 (`patrolManual`, **Finding 267**, NOWY) NADAL
//        przepuszczają punkt z obcej ramki. Gdy któryś zostanie zamknięty — TEN PIN MA
//        PAŚĆ, i to jest jego zadanie (wzór `deploy_seams` T1/T2/T4)
//   T10  i18n — reużyty `vessel.reasonTargetOtherSystem` żyje w PL i EN i NIE jest tym
//        samym tekstem co powód warp (D-LD3: zero nowych kluczy)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { readFileSync }        from 'node:fs';
import { fileURLToPath }       from 'node:url';
import { dirname, join }       from 'node:path';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService }        from '../../systems/OrderService.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { RightClickMenu }      from '../../ui/RightClickMenu.js';
import { buildMenuOptions }    from '../../data/RightClickMenuOptions.js';
import { buildOrderSpec, buildPatrolFromWaypoints } from '../../utils/OrderDispatcher.js';
import { nearestOwnColonyBodyInSystem } from '../../utils/RetreatTarget.js';
import { setLocale, getLocale, t } from '../../i18n/i18n.js';

// ⚠ Po D-89b predykat ramki mieszka w `utils/CameraFrame.js` (trzech konsumentów), ale ten
//   keeper jedzie też na kodzie SPRZED ekstrakcji (fail-first `git archive HEAD`) — statyczny
//   import wywaliłby CAŁĄ suitę (`ERR_MODULE_NOT_FOUND`) i żaden pin nie miałby koloru.
//   To ta sama lekcja co „pin białoskrzynkowy musi degradować, nie przerywać", tylko na poziomie
//   MODUŁU. Resolver sięga po util, a gdy go nie ma — po starą metodę `RightClickMenu`:
//   obie odpowiadają na to samo pytanie i obie mają być ZIELONE PO OBU STRONACH D-89b
//   (to są piny legu D, nie slice'u wierszy 8/9).
let _CF = null;
try { _CF = await import('../../utils/CameraFrame.js'); } catch { /* kod sprzed D-89b */ }
const outOfFrame = (rcm, vid) =>
  (typeof _CF?.outOfCameraFrame === 'function') ? _CF.outOfCameraFrame(vid)
  : (typeof rcm?._outOfCameraFrame === 'function') ? rcm._outOfCameraFrame(vid)
  : null;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU  = GAME_CONFIG.AU_TO_PX;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });

// ⚠ Ciała OBU układów leżą w TYCH SAMYCH zakresach px — gwiazda każdego układu stoi
//   w (0,0). To jest MECHANIZM całej rodziny 138/142/147/255, nie skrót fixture'u.
function addBody(id, sys, auX, name) {
  const b = {
    id, type: 'planet', name, x: auX * AU, y: 0,
    explored: true, analyzed: true, planetType: 'rocky', orbital: orb(auX), deposits: [],
    systemId: sys,
  };
  EntityManager.add(b);
  return b;
}
const addStar = (sys) =>
  EntityManager.add({ id: 'star_' + sys, type: 'star', name: 'G ' + sys, systemId: sys, x: 0, y: 0, mass: 1 });

const techStub = {
  isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
  getShipRangeMultiplier: () => 1.0, getMultiplier: () => 1.0,
  getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
};

let vMgr, mos, fSys, pushed;

/** Dwa układy, kolonia GRACZA w KAŻDYM (żeby „Powrót" miał dokąd wracać w obu). */
function scene({ camera = 'sys_home' } = {}) {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: camera };

  addStar('sys_home'); addStar('sys_020');
  const home = addBody('p_home', 'sys_home', 1.00, 'Dom');
  addBody('h2', 'sys_home', 6.00, 'Dom II');
  addBody('f_a', 'sys_020', 2.00, 'Obca A');
  addBody('f_b', 'sys_020', 7.00, 'Obca B');

  vMgr = new VesselManager();
  mos  = new MovementOrderSystem(vMgr);
  fSys = new FleetSystem(vMgr);
  pushed = [];

  const cols = [
    { planetId: 'p_home', name: 'Dom',  isOutpost: false, resourceSystem: {} },
    { planetId: 'f_a',    name: 'Obca', isOutpost: false, resourceSystem: {} },
  ];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: techStub,
    colonyManager: {
      activePlanetId: 'p_home',
      getColony: (id) => cols.find(c => c.planetId === id) ?? null,
      getAllColonies: () => cols,
      getPlayerColonies: () => cols,
      isPlayerColony: () => true,
    },
    eventLogSystem: { push: (e) => pushed.push(e) },
  });
}

function ship({ sys = 'sys_home', auX = 1, name = 'Sonda', modules = ['engine_ion'] } = {}) {
  const v = vMgr.createAndRegister('hull_small', 'p_home', { name, modules, x: auX * AU, y: 0 });
  v.position.x = auX * AU; v.position.y = 0;
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  v.systemId = sys;
  v.warpFuel = { current: 5, max: 5, consumption: 0.5 };
  return v;
}
const select = (...vs) => {
  window.KOSMOS.uiManager = {
    getSelectedVesselId:  () => vs[0]?.id ?? null,
    getSelectedVesselIds: () => vs.map(v => v.id),
    getSelectedFleetId:   () => null,
  };
};
const selectFleet = (fleetId) => {
  window.KOSMOS.uiManager = {
    getSelectedVesselId:  () => null,
    getSelectedVesselIds: () => [],
    getSelectedFleetId:   () => fleetId,
  };
};
const makeFleet = (...vs) => {
  const id = fSys.createFleet('F1').id;
  for (const v of vs) fSys.addMember(id, v.id);
  return id;
};

// Punkt, który gracz kliknął w ramce KAMERY — dosłownie z rejestru (`mo_6`).
const CLICK  = { x: 15.71, y: -158.94 };
const TARGET = () => ({ type: 'empty', worldPoint: { x: CLICK.x, y: CLICK.y } });
const moveOptFor = (v) => buildMenuOptions(TARGET(), { vesselId: v.id }).find(o => o.id === 'moveToPoint');
const fleetMoveOpt = (fleetId) =>
  buildMenuOptions(TARGET(), { fleetId }).find(o => o.action === 'issueFleetOrder' && o.orderType === 'moveToPoint');

// ═══ T1 — ADMISJA: repro `mo_6` przez PRAWDZIWY łańcuch ══════════════════════
header('T1  repro mo_6 — rozkaz NIE powstaje, a odmowa jest GŁOŚNA');
{
  scene({ camera: 'sys_home' });
  const v = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  select(v);
  const fuel0 = v.fuel.current;

  new RightClickMenu()._handleOptionClick(moveOptFor(v), TARGET());

  assert(mos.getOrder(v.id) == null, `T1a rozkaz NIE powstał (dostano: ${JSON.stringify(mos.getOrder(v.id)?.type ?? null)})`);
  assert(v.mission == null, `T1b' misja NIETKNIĘTA (dostano: ${v.mission?.type ?? 'null'})`);
  assert(v.fuel.current === fuel0, `T1c' paliwo NIETKNIĘTE (${fuel0} → ${v.fuel.current})`);
  assert(v.position.state === 'orbiting', `T1d' stan NIETKNIĘTY (dostano: ${v.position.state})`);
  assert(pushed.length === 1, `T1e' DOKŁADNIE jeden wpis w Dzienniku (dostano: ${pushed.length})`);
  const e = pushed[0] ?? {};
  assert(e.channel === 'fleet' && e.severity === 'warn',
    `T1f' kanał/waga: fleet/warn (dostano: ${e.channel}/${e.severity})`);

  // ⚠ KONTROLA — bez niej „rozkaz nie powstał" świeciłoby na dowolnej innej awarii
  //   fixture'u (brak paliwa, nieosiągalny cel, brak MOS…).
  scene({ camera: 'sys_020' });
  const vc = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  select(vc);
  new RightClickMenu()._handleOptionClick(moveOptFor(vc), TARGET());
  assert(mos.getOrder(vc.id) != null && pushed.length === 0,
    `T1c KONTROLA: ta sama scena z kamerą na układzie STATKU ⇒ rozkaz POWSTAJE (order=${mos.getOrder(vc.id)?.type ?? 'BRAK'}, wpisów=${pushed.length})`);
}

// ═══ T1b — PAYLOAD, nie słownik ══════════════════════════════════════════════
header('T1b  tekst odmowy — czytany z PAYLOADU `eventLogSystem.push`, nie z dict');
{
  const locale0 = getLocale();
  for (const [loc, needle] of [['pl', 'w innym układzie'], ['en', 'another system']]) {
    scene({ camera: 'sys_home' });
    const v = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
    select(v);
    setLocale(loc);
    new RightClickMenu()._handleOptionClick(moveOptFor(v), TARGET());
    const txt = pushed[0]?.text ?? '';
    assert(txt.includes('Żmija'), `T1b-${loc} tekst niesie NAZWĘ statku → „${txt}"`);
    assert(txt.includes(needle), `T1b-${loc} tekst niesie PRZETŁUMACZONY powód (szukane: „${needle}")`);
    // ⚠ Wymóg NIEPUSTOŚCI jest częścią pinu: samo „brak sluga" przechodziło JAŁOWO na
    //   kodzie sprzed naprawy, bo tam nie ma żadnego tekstu (zmierzone w fail-first).
    assert(txt.length > 0 && !/target_other_system/.test(txt),
      `T1b-${loc} tekst ISTNIEJE i jest BEZ surowego sluga (len=${txt.length})`);
  }
  setLocale(locale0);
}

// ═══ T2 — MIXED multi-select: OBA liczniki ═══════════════════════════════════
header('T2  multi-select mieszany — jeden leci, drugi NAZWANY');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_home', auX: 1, name: 'Alfa' });
  const b = ship({ sys: 'sys_020',  auX: 2, name: 'Beta' });
  select(a, b);
  new RightClickMenu()._handleOptionClick(moveOptFor(a), TARGET());

  const moved  = [a, b].filter(v => mos.getOrder(v.id) != null).map(v => v.name);
  const txt    = pushed[0]?.text ?? '';
  // ⚠ OBA liczniki. Sam warunek „B nie ruszył" przeszedłby JAŁOWO, gdyby fixture nie
  //   wydał ŻADNEGO rozkazu (np. przy zepsutym `buildMenuOptions`).
  assert(moved.length === 1 && moved[0] === 'Alfa',
    `T2a in-frame RUSZYŁ, out-of-frame NIE (ruszyli: [${moved.join(', ')}])`);
  assert(pushed.length === 1 && txt.includes('Beta') && !txt.includes('Alfa'),
    `T2b raport nazywa WYŁĄCZNIE winowajcę → „${txt}"`);
}

// ═══ T3 — FLOTA cała poza ramką ══════════════════════════════════════════════
header('T3  flota w całości poza ramką — odmowa nazywa KAŻDEGO');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);
  selectFleet(fleetId);
  new RightClickMenu()._handleOptionClick(fleetMoveOpt(fleetId), TARGET());

  const moved = [a, b].filter(v => mos.getOrder(v.id) != null).length;
  const txt   = pushed[0]?.text ?? '';
  assert(moved === 0, `T3a żaden członek NIE ruszył (ruszyło: ${moved})`);
  assert(pushed.length === 1 && txt.includes('Alfa') && txt.includes('Beta'),
    `T3b raport nazywa OBU → „${txt}"`);
}

// ═══ T3b — FLOTA MIESZANA (D-LD2: odmowa całoflotowa) ════════════════════════
header('T3b flota mieszana — D-LD2: nikt nie leci, nazwani tylko winowajcy');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_home', auX: 1, name: 'Alfa' });
  const b = ship({ sys: 'sys_020',  auX: 2, name: 'Beta' });
  const c = ship({ sys: 'sys_020',  auX: 3, name: 'Gamma' });
  const fleetId = makeFleet(a, b, c);
  selectFleet(fleetId);
  new RightClickMenu()._handleOptionClick(fleetMoveOpt(fleetId), TARGET());

  const moved = [a, b, c].filter(v => mos.getOrder(v.id) != null).map(v => v.name);
  const txt   = pushed[0]?.text ?? '';
  // ⚠ OBA liczniki: „nikt nie ruszył" JEST tu pinem (D-LD2 = całoflotowa odmowa), ale bez
  //   drugiej połowy przeszedłby jałowo na flocie, której fixture w ogóle nie zbudował.
  assert(moved.length === 0, `T3b-a NIKT nie ruszył — także członek W RAMCE (ruszyli: [${moved.join(', ')}])`);
  assert(pushed.length === 1 && txt.includes('Beta') && txt.includes('Gamma') && !txt.includes('Alfa'),
    `T3b-b nazwani WYŁĄCZNIE ci poza ramką → „${txt}"`);
}

// ═══ T4 — 🔑 KONTROLA WYCIEKU DO FAN-OUTU ════════════════════════════════════
header('T4  „Powrót do bazy" floty spoza ramki — PRAWDZIWE issueFleetOrder');
{
  // ⚠ NAJWAŻNIEJSZY PIN SLICE'U. Gdyby termin legu D trafił do `FleetSystem.issueFleetOrder`
  //   (jedyne miejsce pokrywające naraz PPM floty i oba pickery), TEN rozkaz zostałby
  //   odrzucony — a jest CAŁKOWICIE POPRAWNY: cel liczy się w układzie STATKU (naprawa 154).
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);

  const nearest = nearestOwnColonyBodyInSystem(a, window.KOSMOS.colonyManager);
  // KONTROLA NIE-JAŁOWOŚCI: cel MUSI pochodzić z układu STATKU, nie kamery — inaczej
  // pin mierzyłby „rozkaz w ramce kamery przechodzi", czyli T7, a nie wyciek do fan-outu.
  assert(nearest?.planet?.systemId === 'sys_020' && window.KOSMOS.activeSystemId === 'sys_home',
    `T4a KONTROLA: cel Powrotu jest w układzie STATKU (${nearest?.planet?.systemId}), kamera w ${window.KOSMOS.activeSystemId}`);

  const p = nearest.planet;
  const res = fSys.issueFleetOrder(fleetId, { type: 'moveToPoint', targetPoint: { x: p.x, y: p.y } });
  assert(res?.ok === true && res.accepted?.length === 2,
    `T4b Powrót PRZECHODZI mimo obcej ramki kamery (ok=${res?.ok}, accepted=${res?.accepted?.length}, rejected=${JSON.stringify(res?.rejected ?? [])})`);
}

// ═══ T4b — KONTROLA ZAKRESU D-LD4 ════════════════════════════════════════════
header('T4b dock POZA mapą — leg D zamyka producenta MAPY, nie mechanikę doku');
{
  scene({ camera: 'sys_home' });
  const v = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  const fa = EntityManager.get('f_a');
  // Ścieżka NIE-mapowa (pickery `VesselGroupActions`, `FleetCommandPanel`) — wprost do MOS.
  const r = mos.issueOrder(v.id, { type: 'dock', targetBodyId: 'f_a', targetPoint: { x: fa.x, y: fa.y } });
  assert(r?.ok === true,
    `T4b dock wydany POZA mapą dalej przechodzi (ok=${r?.ok}, reason=${r?.reason ?? '—'}) — Finding 256 NIETKNIĘTY`);

  // A ten sam `dock` PRZEZ MAPĘ na ciało z ramki KAMERY jest odmawiany (D-LD4).
  scene({ camera: 'sys_home' });
  const v2 = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  select(v2);
  const home = EntityManager.get('p_home');
  const dockTarget = { type: 'planet', planet: home, entityId: 'p_home', worldPoint: { x: home.x, y: home.y } };
  new RightClickMenu()._handleOptionClick({ id: 'dock', action: 'issueOrder', orderType: 'dock' }, dockTarget);
  assert(mos.getOrder(v2.id) == null && v2._pendingDock == null && pushed.length === 1,
    `T4b' dock Z MAPY na ciało z obcej ramki ODRZUCONY (order=${mos.getOrder(v2.id)?.type ?? 'BRAK'}, _pendingDock=${v2._pendingDock ?? 'brak'}, wpisów=${pushed.length})`);
}

// ═══ T5 — NIE-REGRESJA 147 (dokładny powód, nie „jakakolwiek odmowa") ════════
header('T5  statek w skoku — powód należy do 147, nie do legu D');
{
  scene({ camera: 'sys_home' });
  const v = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  v.warpFuel.current = 0.5;
  v.mission = { type: 'interstellar_jump', fromSystemId: 'sys_020', toSystemId: 'sys_099',
                phase: 'warp_transit', departYear: 100, arrivalYear: 140 };
  v.status = 'on_mission'; v.position.state = 'in_transit'; v.systemId = null;
  select(v);

  // Fail-open legu D na `systemIdOf === null` — WPROST na predykacie.
  // ⚠ Tolerancja na BRAK metody jest celowa: to KONTROLA (zielona po obu stronach), a pin,
  //   który wywala CAŁĄ suitę na kodzie sprzed naprawy, ukrywa kolor wszystkich pinów niżej
  //   (zmierzone: pierwszy przebieg fail-first urwał się tutaj i T5b-T10 nie miały koloru).
  //   Po naprawie metoda ISTNIEJE, więc pin jest tak samo mocny jak bez tolerancji.
  const rcm = new RightClickMenu();
  const legDsays = outOfFrame(rcm, v.id);
  assert(legDsays === null,
    `T5a leg D PRZEPUSZCZA statek w tranzycie (fail-open; dostano: ${JSON.stringify(legDsays)})`);

  rcm._handleOptionClick(moveOptFor(v), TARGET());
  const txt = pushed[0]?.text ?? '';
  assert(pushed.length === 1 && txt.includes(t('vessel.reasonVesselInWarpTransit')),
    `T5b odmowa niesie DOKŁADNIE powód 147 → „${txt}"`);
  assert(!txt.includes(t('vessel.reasonTargetOtherSystem')),
    'T5c powód legu D NIE wyparł powodu 147 (kolejność zmierzona)');
}

// ═══ T6 — NIE-REGRESJA 254 (composite) ═══════════════════════════════════════
header('T6  composite cross-system (254) nietknięty');
{
  scene({ camera: 'sys_home' });
  const os = new OrderService();
  let jumps = 0;
  Object.assign(window.KOSMOS, {
    orderService: os,
    // ⚠ TRUTHY OBOWIĄZKOWO: bez tego `issueMove` skręca w gałąź MGŁY
    //   (`target_system_unknown`) i pin mierzyłby Finding 186 zamiast composite'u.
    starSystemManager: { getSystem: () => ({ id: 'sys_home' }) },
    warpRouteSystem: { beginJourney: () => { jumps++; return { ok: true }; } },
  });
  const v  = ship({ sys: 'sys_020', auX: 3, name: 'Żmija' });
  const h2 = EntityManager.get('h2');
  const rc = os.issueMove(v.id, { type: 'moveToPoint', targetBodyId: 'h2', targetPoint: { x: h2.x, y: h2.y } });
  assert(rc?.ok === true && rc?.composite === true && jumps === 1,
    `T6 composite 254 nietknięty (ok=${rc?.ok}, composite=${rc?.composite}, skoki=${jumps})`);
  os.destroy();
  delete window.KOSMOS.orderService;
  delete window.KOSMOS.starSystemManager;
  delete window.KOSMOS.warpRouteSystem;
}

// ═══ T7 — ANTY-JAŁOWOŚĆ ══════════════════════════════════════════════════════
header('T7  naprawa NIE jest „odmawiaj wszystkiego"');
{
  scene({ camera: 'sys_020' });
  const v = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  select(v);
  new RightClickMenu()._handleOptionClick(moveOptFor(v), TARGET());
  const o = mos.getOrder(v.id);
  assert(o != null && o.type === 'moveToPoint' && pushed.length === 0,
    `T7a klik w TEJ SAMEJ ramce leci (order=${o?.type ?? 'BRAK'}, wpisów=${pushed.length})`);

  // …i statek W RAMCE nie jest ruszany przez typ rozkazu spoza zakresu punktowego.
  scene({ camera: 'sys_home' });
  const w = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  const rcm = new RightClickMenu();
  const spec = buildOrderSpec({ id: 'retreat', action: 'issueOrder', orderType: 'retreat' },
                              { type: 'ownVessel', entityId: w.id, worldPoint: { x: 0, y: 0 } }, w.id);
  // ⚠ Tolerancja na BRAK metody — jak w T5a, ale tu pin jest PINEM NAPRAWY, więc bez
  //   metody ma świecić NA CZERWONO, a nie wywalać suity (fail-first musi mieć KOLOR).
  const wSays = outOfFrame(rcm, w.id);
  assert(spec?.ok === true && wSays === 'target_other_system',
    `T7b KONTROLA: predykat ODRZUCA ten statek (${JSON.stringify(wSays)}), ale retreat jest POZA zakresem punktowym…`);
  // …co znaczy, że `retreat` w ogóle nie przechodzi przez bramkę — pinowane źródłowo w T8b.
}

// ═══ T8 — PIN ŹRÓDŁOWY: `OrderDispatcher.js` zostaje CZYSTY ══════════════════
header('T8  OrderDispatcher.js pozostaje pure (D-LD1) + kontrola pinu');
{
  const here = dirname(fileURLToPath(import.meta.url));
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const srcRaw  = readFileSync(join(here, '../../utils/OrderDispatcher.js'), 'utf-8');
  const src     = stripComments(srcRaw);
  const dirty   = /window\.KOSMOS|activeSystemId|systemIdOf/;
  assert(!dirty.test(src),
    'T8a `OrderDispatcher.js` NIE odwołuje się do KOSMOS/activeSystemId/systemIdOf (kod bez komentarzy)');
  // ⚠ KONTROLA PINU — pin, który nie umie paść, nie jest pinem.
  assert(dirty.test(src + '\nconst x = window.KOSMOS?.activeSystemId;'),
    'T8b KONTROLA PINU: na zmutowanej kopii ten sam pin PADA');
  // Kontrola druga: komentarze SĄ zdejmowane (inaczej T8a mierzyłby prozę, nie kod).
  assert(stripComments('// window.KOSMOS\ncode();').includes('code()')
         && !stripComments('// window.KOSMOS\ncode();').includes('KOSMOS'),
    'T8c KONTROLA: `stripComments` naprawdę zdejmuje komentarz');

  // Termin MUSI za to istnieć u wołającego.
  const rcmSrc = stripComments(readFileSync(join(here, '../../ui/RightClickMenu.js'), 'utf-8'));
  // ⚠ Po D-89b predykat MIESZKA w `utils/CameraFrame.js`, ale INWARIANT D-LD1 jest ten sam:
  //   termin STOSUJE wołający, a nie `OrderDispatcher`. Wzorzec `_?` łapie obie postaci —
  //   metodę legu D i import utila — więc pin jest zielony po OBU stronach ekstrakcji.
  assert(/_?outOfCameraFrame/.test(rcmSrc) && /POINT_SOURCED_ORDER_TYPES/.test(rcmSrc),
    'T8d termin ramki STOSUJE `RightClickMenu` (caller), zgodnie z D-LD1');
  // `retreat`/`escort` NIE mogą wejść do zbioru punktowego (mierzony fałszywy negatyw).
  const setLine = rcmSrc.match(/POINT_SOURCED_ORDER_TYPES\s*=\s*new Set\(\[([^\]]*)\]/)?.[1] ?? '';
  assert(!/retreat|escort|goToPOI|patrol/.test(setLine) && /moveToPoint/.test(setLine) && /dock/.test(setLine),
    `T8e zbiór punktowy to DOKŁADNIE moveToPoint+dock → [${setLine.trim()}]`);
}

// ═══ T9 — ⚠ PINY ODWRÓCONE: co leg D ŚWIADOMIE ZOSTAWIA OTWARTE ══════════════
header('T9  ⚠ ODWRÓCONE — rows 8/9 (255) i patrolManual (267) NADAL przeciekają');
{
  // ⚠ TE DWA PINY PINUJĄ DEFEKT. Powód: leg D zamyka WYŁĄCZNIE producenta PPM (rows 1/2),
  //   a gate nie może wziąć tego za pełne domknięcie 255. Gdy któryś zostanie naprawiony,
  //   TEN PIN MA PAŚĆ — to jest jego zadanie (wzór `deploy_seams` T1/T2/T4,
  //   `s34c_z9_transfer_dispose`).
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);
  // Rows 8/9 — `FMO:4739` (`_handleFleetMoveToPoint`) i `FleetCommandPanel:354`
  // (`_armMovePicker`) wołają `issueFleetOrder` WPROST, z pominięciem `_buildFleetSpec`.
  const res = fSys.issueFleetOrder(fleetId, { type: 'moveToPoint', targetPoint: { ...CLICK } });
  assert(res?.ok === true && res.accepted?.length === 2,
    `T9a ⚠ ODWRÓCONY — pickery flotowe (Finding 255, rows 8/9) NADAL biorą punkt z obcej ramki (accepted=${res?.accepted?.length}). PADNIE, gdy zostaną domknięte — i o to chodzi`);

  scene({ camera: 'sys_home' });
  const v = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  const built = buildPatrolFromWaypoints([{ x: 1.0 * AU, y: 0 }, { x: 4.0 * AU, y: 0 }]);
  const rp = mos.issueOrder(v.id, built.spec);
  assert(built.ok === true && rp?.ok === true,
    `T9b ⚠ ODWRÓCONY — patrolManual (Finding 267, row 3) NADAL przyjmuje trasę z obcej ramki (ok=${rp?.ok}). Nie idzie przez buildOrderSpec, więc leg D go nie dotyka. PADNIE, gdy 267 zostanie domknięty`);
}

// ═══ T10 — i18n (D-LD3: zero nowych kluczy) ══════════════════════════════════
header('T10 reużyty powód żyje w obu językach i nie zlewa się z 147');
{
  const locale0 = getLocale();
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    const s = t('vessel.reasonTargetOtherSystem');
    assert(typeof s === 'string' && s.length > 0 && s !== 'vessel.reasonTargetOtherSystem',
      `T10-${loc} vessel.reasonTargetOtherSystem ma tekst → „${s}"`);
    assert(s !== t('vessel.reasonVesselInWarpTransit'),
      `T10-${loc} powód legu D ≠ powód 147 (gracz rozróżnia dwa różne stany)`);
  }
  setLocale(locale0);
}

console.log(`\n════ map_click_frame_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail > 0 ? 1 : 0);
