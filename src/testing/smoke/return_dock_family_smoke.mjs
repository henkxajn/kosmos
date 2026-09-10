// ═══════════════════════════════════════════════════════════════════════════════
// return_dock_family_smoke — KEEPER slice'u PRODUCENT-SIDE: Findingi 154 + 255 (leg Powrotu) + 263
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA — trzy defekty jednej rodziny, każdy w innej warstwie:
//
//   154 (SELEKTOR)   `AutoRetreatSystem._findNearestFriendlyPlanet` filtrowała po WŁAŚCICIELU
//                    i liczyła `euclideanAU` po WSZYSTKICH koloniach w galaktyce. Gwiazda każdego
//                    układu stoi w (0,0), więc kolonia z obcego układu wygrywała DYSTANSEM:
//                    ZMIERZONE — statek w `sys_020` dostawał `p_home` [sys_home] jako „2.00 AU",
//                    przy własnej koloni 6.00 AU dalej w JEGO układzie.
//   255 (PRODUCENT)  Oba przyciski „Powrót do bazy" podawały ten cel jako GOŁY PUNKT, więc bramka
//                    `if (bodyId)` w `MovementOrderSystem` nigdy go nie oglądała — rozkaz
//                    przechodził i statek leciał do tych współrzędnych we WŁASNEJ ramce.
//   263 (KONSUMENT)  `FleetSystem._maybeAutoDockOnReturn` TELEPORTUJE bezwarunkowo (przepisuje
//                    `position.x/y`, `dockedAt` i `colonyId`). Bez terminu układu dokowała statek
//                    przy ciele, którego w jego układzie NIE MA — i ten stan szedł DO ZAPISU.
//                    Plus: marker PRZEŻYWAŁ porzucenie rozkazu (patrz T5/T5b/T5c).
//
// ⚠ TERMIN ODLEGŁOŚCI JEST ZAKAZANY, NIE ZAPOMNIANY (T6). `RETURN_DOCK_THRESHOLD_AU = 0.5` została
//   usunięta ŚWIADOMIE w `7ea94e8` (2026-05-20, „Bug F2 — dotarli ale dalej nie dokuja"), z podpisem
//   „snap to teleport — akceptowalny convenience UX w 4X". POMIAR TO POTWIERDZA, i to WEWNĄTRZ
//   jednego układu: statyczny `targetPoint` z chwili wydania rozkazu nie zna ruchu planety, więc po
//   locie planeta jest 3,15-7,62 AU od tego punktu ⇒ próg 0,5 AU PADAŁBY ZAWSZE. Dlatego 263
//   domykamy TERMINEM UKŁADU, a T6 pilnuje, żeby nikt nie „naprawił" tego przez powrót progu.
//
// ✅ FINDING 256 ZAMKNIĘTY 2026-09-10 — TU MIESZKAJĄ JEGO PINY (D1-D9, D-256e).
//   Leg C wypadł wtedy z zakresu po pomiarze i miał rację: `sameSystemOnly:true` BEZ `vessel`
//   jest NO-OPEM (`filterDockTargets` ma guard `if (!vessel) return list`) — zmierzone:
//   `filterDockTargets(all, null, true)` zwraca WSZYSTKIE trzy ciała. Czyli dwa argumenty
//   na site, nie jeden, plus REGUŁA dla grupy rozpiętej na dwa układy.
//   PODPIS WŁAŚCICIELA: **A + C** — oferta REPREZENTANTA (pierwszy żywy członek) + admisja
//   per statek. Wariant PRZECIĘCIA odrzucony świadomie: pusty picker odbierałby graczowi
//   legalną akcję (dok tych, którzy MOGĄ), więc **D2 (pusta oferta) NIE ISTNIEJE** — to nie
//   przeoczenie, tylko konsekwencja wybranego kształtu.
//
// ⚠ DLACZEGO `SystemScope`, A NIE `CameraFrame`: dock ma PRAWDZIWE ciało w spec-u, więc pytanie
//   brzmi „czy to ciało jest w układzie STATKU" — predykat (statek, CIAŁO), fail-OPEN. Termin
//   KAMERY (Finding 255) odrzucałby tu flotę dokującą legalnie we własnym układzie, gdy gracz
//   patrzy na inny — inna rodzina, inne narzędzie.
//// PINY:
//   T1   FMO „Powrót do bazy" — marker celuje w ciało W UKŁADZIE STATKU (+ ŚWIADEK: własna kolonia
//        w tym układzie ISTNIEJE, inaczej pin przechodzi na świecie bez konkurencji)
//   T2   `FleetCommandPanel._fleetReturn` — bliźniak T1 (ta powierzchnia NIGDY nie była mierzona)
//   T3   po przylocie `dockedAt != null` **i** leży w układzie statku (kolejność asercji jest częścią pinu)
//   T4   brak teleportu przez ramkę — pozycja == pozycja WŁASNEGO celu, NIE „niezmieniona"
//   T5   Return → STOP → nowy rozkaz: marker sprzątnięty, nowy rozkaz NIE przekierowany
//   T5b  bliźniak `_pendingDock` (rozkaz Dock)
//   T5c  Return → nowy rozkaz BEZ „Stop" (preempcja) — najbardziej osiągalny wariant, zmierzony
//   T6   PIN ANTY-REWIZYJNY: brak stałej i brak terminu odległości (komentarze zdjęte + kontrola
//        na zmutowanej kopii)
//   T7   ANTY-JAŁOWOŚĆ: legalny Powrót W TYM układzie NADAL dokuje i re-homuje bazę
//   T8   ANTY-JAŁOWOŚĆ: legalny dock picker w swoim układzie NADAL kończy `state==='docked'`
//   T9   brak własnej koloni w układzie ⇒ UCZCIWA ODMOWA: zero rozkazu, zero markera, DOKŁADNIE
//        jeden komunikat (klucz `fleet.noFriendlyPlanet` — istniał, zero nowych kluczy i18n)
//   T10  parytet selektora + sierota USUNIĘTA (kształt zwrotki, fallback placówkowy, warp → null)
//   T11  NIE-REGRESJA 147 — statek w skoku dalej odrzucany
//   T12  NIE-REGRESJA 254 — composite cross-system dalej działa (`getSystem` stubowany TRUTHY)
//   ── Finding 256 (dock: oferta + admisja) ──
//   D1   OFERTA — reprezentant odsiewa ciało z obcego układu (+ KONTROLA: lista bez filtra
//        JE ZAWIERA) + pin źródłowy: obie stare powierzchnie podają flagę I reprezentanta
//   D3   🔑 ADMISJA — `dock` cross-system ODRZUCANY: zero rozkazu, zero misji, zero markera
//        (+ KONTROLA nie-jałowości: ciało naprawdę jest w innym układzie)
//   D4   🔑 ODMOWA MÓWI — wpis `fleet`/`warn` z NAZWĄ i PRZETŁUMACZONYM powodem; TRZY
//        zmierzone pułapki ciszy: (i) odmowa BEZ powodu (`?? null` gasiło raport),
//        (ii) odmowa CZĘŚCIOWA (raport szedł tylko gdy NIKT nie ruszył), (iii) sukces MILCZY
//   D5   CZĘŚCIOWA WYSYŁKA JEST UCZCIWA — kto mógł, polecił; kto nie — NAZWANY
//        (⚠ all-or-nothing z D-LD2 NIE przenosi się na dock: `dispatchDockTo` to zwykła pętla
//        per statek, bez wspólnego `_arrivalSyncYear` — zmierzone)
//   D6   ANTY-JAŁOWOŚĆ — dock we WŁASNYM układzie przechodzi CAŁY łańcuch aż do `docked`
//   D7   KONSUMENT (D-256b) — NIEŚWIEŻY marker `_pendingDock` na obce ciało NIE re-homuje bazy
//        (+ KONTROLA: marker naprawdę był ustawiony)
//   D8   SYMETRIA BLIŹNIAKÓW — oba konsumenty markera (`_maybeDockOnArrival` i
//        `_maybeAutoDockOnReturn`) odpowiadają TAK SAMO na ten sam stan świata
//   D9   PIN źRÓDŁOWY — termin siedzi w `_issueDock`, dokładnie raz, i NIE ma drugiej kopii
//        w `VesselGroupActions` (+ kontrola pinu na zmutowanej kopii)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { readFileSync }        from 'node:fs';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { AutoRetreatSystem }   from '../../systems/AutoRetreatSystem.js';
import { OrderService }        from '../../systems/OrderService.js';
import { ORDER_TYPES }         from '../../data/MovementOrderTypes.js';
import { nearestOwnColonyBodyInSystem } from '../../utils/RetreatTarget.js';
import { systemIdOf }          from '../../utils/SystemScope.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { FleetCommandPanel }   from '../../ui/FleetCommandPanel.js';
import { dispatchDockTo, filterDockTargets } from '../../ui/VesselGroupActions.js';
import { getDockTargets }     from '../../utils/BodyName.js';
import { isSameSystem }       from '../../utils/SystemScope.js';
import { fileURLToPath }      from 'node:url';
import { dirname, join }      from 'node:path';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = GAME_CONFIG.AU_TO_PX;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });

// ── Świat: kolonie gracza w DWÓCH układach, w TYCH SAMYCH zakresach px ───────
// ⚠ To jest MECHANIZM całej rodziny, nie skrót fixture'u: gwiazda każdego układu stoi w (0,0),
//   więc ciała obcych układów konkurują o ranking odległości z własnymi.
const COLONIES = {};
function addBody(id, sys, auX, name) {
  const b = { id, type: 'planet', name, x: auX * AU, y: 0, explored: true, analyzed: true,
              planetType: 'rocky', orbital: orb(auX), deposits: [] };
  if (sys !== undefined) b.systemId = sys;
  EntityManager.add(b);
  return b;
}
function addColony(planetId, name, { isOutpost = false } = {}) {
  COLONIES[planetId] = { planetId, name, isOutpost,
    resourceSystem: { getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} } };
}
const colMgr = {
  activePlanetId: 'p_home',
  getColony: (id) => COLONIES[id] ?? null,
  getAllColonies: () => Object.values(COLONIES),
  getPlayerColonies: () => Object.values(COLONIES),
  hasColony: (id) => id in COLONIES,
  isPlayerColony: (c) => !!c,
};
const techStub = {
  isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
  getShipRangeMultiplier: () => 1.0, getMultiplier: () => 1.0,
  getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
};

let vMgr, mos, fs, ars, toasts;
function world({ farColony = true } = {}) {
  EventBus.clear(); EntityManager.clear();
  for (const k of Object.keys(COLONIES)) delete COLONIES[k];
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: 'sys_home' };
  for (const s of ['sys_home', 'sys_020']) {
    EntityManager.add({ id: 'star_' + s, type: 'star', name: 'G ' + s, systemId: s, x: 0, y: 0, mass: 1 });
  }
  const home = addBody('p_home', 'sys_home', 1.00, 'Mstow');
  addBody('h2',    'sys_home', 6.00, 'Dom II');
  addBody('f_far', 'sys_020',  9.00, 'Wysunieta');
  addBody('f_rock','sys_020',  2.00, 'Skala 020');
  addColony('p_home', 'Mstow');
  addColony('h2', 'Dom II');
  if (farColony) addColony('f_far', 'Wysunieta');
  vMgr = new VesselManager();
  mos  = new MovementOrderSystem(vMgr);
  fs   = new FleetSystem(vMgr);
  ars  = new AutoRetreatSystem(vMgr, colMgr, mos);
  toasts = [];
  EventBus.on('ui:toast', (e) => toasts.push(e.text));
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos,
    fleetSystem: fs, autoRetreatSystem: ars, colonyManager: colMgr, techSystem: techStub,
    gameConfig: GAME_CONFIG,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
  });
  return home;
}
function ship({ sys = 'sys_020', auX = 3, colonyId = 'p_home', name = 'Zmija' } = {}) {
  const v = vMgr.createAndRegister('hull_small', colonyId, { name, modules: ['engine_ion'], x: auX * AU, y: 0 });
  v.position.x = auX * AU; v.position.y = 0;
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  v.systemId = sys; v.colonyId = colonyId;
  v.warpFuel = { current: 5, max: 5, consumption: 0.5 };
  return v;
}
/** Wydaje Powrót przez PRAWDZIWY producent i zwraca statek. */
function fmoReturn(v) {
  const fleet = fs.createFleet('Klin'); fs.addMember(fleet.id, v.id);
  const o = Object.create(FleetManagerOverlay.prototype);
  o._announceFleetOrderResult = () => {};
  o._handleFleetReturnBase(fleet.id);
  return fleet;
}
function fcpReturn(v) {
  const fleet = fs.createFleet('Ostrze'); fs.addMember(fleet.id, v.id);
  const p = Object.create(FleetCommandPanel.prototype);
  p._fs = () => fs; p._announce = () => {}; p._markDirty = () => {};
  p._fleetReturn(fleet.id);
  return fleet;
}
/** Domyka rozkaz DOKŁADNIE tak, jak robi to `VesselManager` (`vessel:orderCompleted`). */
function completeOrder(v) {
  if (!v.movementOrder) return false;
  v.movementOrder.status = 'completed';
  EventBus.emit('vessel:orderCompleted', { vesselId: v.id, orderId: v.movementOrder.id });
  return true;
}

// ═══ T1 — FMO Powrót: marker w układzie STATKU ═══════════════════════════════
header('T1  FMO „Powrót do bazy" — cel w układzie STATKU');
{
  world();
  const v = ship({ sys: 'sys_020', auX: 3 });

  // ⚠ ŚWIADEK: bez własnej koloni w `sys_020` pin przechodziłby na świecie, w którym nie ma
  //   z czym konkurować — a cały defekt polegał na tym, że obca kolonia WYGRYWAŁA ranking.
  const own = nearestOwnColonyBodyInSystem(v, colMgr);
  assert(!!own && systemIdOf(own.planet) === 'sys_020',
    `T1 ŚWIADEK: własna kolonia w układzie statku ISTNIEJE (${own?.planet?.id ?? 'BRAK'})`);
  const rival = EntityManager.get('p_home');
  assert(Math.hypot(rival.x - v.position.x, rival.y - v.position.y)
       < Math.hypot(own.planet.x - v.position.x, own.planet.y - v.position.y),
    'T1 ŚWIADEK 2: obca kolonia jest BLIŻEJ w px niż własna — świat jest konkurencyjny');

  fmoReturn(v);
  assert(v._pendingReturnDock != null,
    `T1a marker postawiony (${v._pendingReturnDock ?? 'BRAK'})`);
  assert(systemIdOf(EntityManager.get(v._pendingReturnDock)) === v.systemId,
    `T1b marker celuje w ciało z układu statku (marker=${v._pendingReturnDock} `
    + `[${systemIdOf(EntityManager.get(v._pendingReturnDock))}], statek=${v.systemId})`);
}

// ═══ T2 — FleetCommandPanel: bliźniak ════════════════════════════════════════
header('T2  FleetCommandPanel._fleetReturn — bliźniak (pierwszy pomiar tej powierzchni)');
{
  world();
  const v = ship({ sys: 'sys_020', auX: 3 });
  fcpReturn(v);
  assert(v._pendingReturnDock != null && systemIdOf(EntityManager.get(v._pendingReturnDock)) === v.systemId,
    `T2 marker celuje w ciało z układu statku (marker=${v._pendingReturnDock} `
    + `[${systemIdOf(EntityManager.get(v._pendingReturnDock ?? ''))}], statek=${v.systemId})`);
}

// ═══ T3/T4 — przylot: zgodność ramki i BRAK teleportu przez ramkę ════════════
header('T3/T4  przylot — dok w układzie statku, pozycja == własny cel');
{
  world();
  const v = ship({ sys: 'sys_020', auX: 3 });
  fmoReturn(v);
  const target = EntityManager.get(v._pendingReturnDock);
  completeOrder(v);

  // ⚠ KOLEJNOŚĆ JEST CZĘŚCIĄ PINU: przy `dockedAt === null` porównanie układów przechodziłoby
  //   „bo obie strony są nieznane". Najpierw istnienie, potem zgodność.
  assert(v.position.dockedAt != null,
    `T3a statek ZADOKOWAŁ (dockedAt=${v.position.dockedAt})`);
  assert(systemIdOf(EntityManager.get(v.position.dockedAt)) === v.systemId,
    `T3b dok leży w układzie statku (${systemIdOf(EntityManager.get(v.position.dockedAt))} vs ${v.systemId})`);

  // ⚠ NIE „pozycja niezmieniona": snap DO WŁASNEGO celu jest zamierzony (Bug F2). Mierzymy,
  //   że statek stoi przy WŁASNYM ciele, a nie przy ciele z obcej ramki.
  const dOwn = Math.hypot(v.position.x - target.x, v.position.y - target.y) / AU;
  const foreign = EntityManager.get('p_home');
  const dForeign = Math.hypot(v.position.x - foreign.x, v.position.y - foreign.y) / AU;
  assert(dOwn < 0.01,
    `T4a pozycja == pozycja WŁASNEGO celu (${dOwn.toFixed(3)} AU od ${target.id})`);
  assert(dForeign > 1.0,
    `T4b statek NIE stoi przy ciele z obcej ramki (${dForeign.toFixed(2)} AU od p_home)`);
}

// ═══ T5 / T5b / T5c — marker nie przekierowuje NASTĘPNEGO rozkazu ════════════
header('T5  Powrót → STOP → nowy rozkaz: marker sprzątnięty');
{
  world();
  const v = ship({ sys: 'sys_home', auX: 3 });
  fmoReturn(v);
  const base = EntityManager.get(v._pendingReturnDock);
  assert(mos.cancelOrder(v.id, 'player') === true, 'T5 PRZESŁANKA: rozkaz anulowany');
  assert((v._pendingReturnDock ?? null) === null,
    `T5a marker sprzątnięty przy PORZUCENIU rozkazu (${v._pendingReturnDock ?? 'null'})`);

  const r = mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 12 * AU, y: 0 } });
  assert(r?.ok === true && Math.abs(v.mission.targetX / AU - 12) < 0.01,
    `T5b PRZESŁANKA: nowy rozkaz na 12.00 AU przyjęty (targetX=${(v.mission?.targetX / AU).toFixed(2)})`);
  completeOrder(v);
  assert(v.position.dockedAt == null,
    `T5c nowy rozkaz NIE został przekierowany do bazy (dockedAt=${v.position.dockedAt})`);
  assert(Math.hypot(v.position.x - base.x, v.position.y - base.y) / AU > 1.0,
    `T5d statek NIE został teleportowany do bazy (${(Math.hypot(v.position.x - base.x, v.position.y - base.y) / AU).toFixed(2)} AU od ${base.id})`);
}

header('T5b  bliźniak `_pendingDock` (rozkaz Dock)');
{
  world();
  const v = ship({ sys: 'sys_home', auX: 3 });
  const rd = mos.issueOrder(v.id, { type: ORDER_TYPES.dock, targetBodyId: 'p_home', targetPoint: { x: 1 * AU, y: 0 } });
  assert(rd?.ok === true && v._pendingDock === 'p_home',
    `T5b PRZESŁANKA: dock wydany, marker ${v._pendingDock}`);
  mos.cancelOrder(v.id, 'player');
  assert((v._pendingDock ?? null) === null,
    `T5b-1 marker docka sprzątnięty przy porzuceniu (${v._pendingDock ?? 'null'})`);
  mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 12 * AU, y: 0 } });
  completeOrder(v);
  assert(v.position.state !== 'docked',
    `T5b-2 nowy rozkaz nie zakończył się dokiem (state=${v.position.state})`);
}

header('T5c  Powrót → nowy rozkaz BEZ „Stop" (preempcja) — wariant najbardziej osiągalny');
{
  world();
  const v = ship({ sys: 'sys_home', auX: 3 });
  fmoReturn(v);
  const base = EntityManager.get(v._pendingReturnDock);
  assert(v._pendingReturnDock != null, 'T5c PRZESŁANKA: marker postawiony');
  // BEZ cancelOrder — po prostu nowy rozkaz; preempcja VO-3 robi resztę.
  const r = mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 12 * AU, y: 0 } });
  assert(r?.ok === true, `T5c PRZESŁANKA 2: nowy rozkaz przyjęty (${r?.reason ?? 'ok'})`);
  assert((v._pendingReturnDock ?? null) === null,
    `T5c-1 marker sprzątnięty przez WEJŚCIE nowego rozkazu (${v._pendingReturnDock ?? 'null'})`);
  completeOrder(v);
  assert(v.position.dockedAt == null
      && Math.hypot(v.position.x - base.x, v.position.y - base.y) / AU > 1.0,
    `T5c-2 rozkaz gracza NIE przekierowany (dockedAt=${v.position.dockedAt}, `
    + `${(Math.hypot(v.position.x - base.x, v.position.y - base.y) / AU).toFixed(2)} AU od bazy)`);
}

// ═══ T6 — PIN ANTY-REWIZYJNY: brak progu odległości ══════════════════════════
header('T6  pin anty-rewizyjny — brak stałej i brak terminu ODLEGŁOŚCI');
{
  const FS_PATH = new URL('../../systems/FleetSystem.js', import.meta.url);
  const raw = readFileSync(FS_PATH, 'utf8');
  // ⚠ KOMENTARZE ZDJĘTE — nagłówek pliku CELOWO wymienia nazwę usuniętej stałej jako nagrobek,
  //   więc pin na surowym źródle trafiałby w opis, nie w kod (reguła source-pin-strip-comments).
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const hasConst = /RETURN_DOCK_THRESHOLD_AU/.test(code);
  assert(!hasConst, `T6a stała RETURN_DOCK_THRESHOLD_AU nie istnieje w KODZIE (${hasConst ? 'JEST' : 'brak'})`);

  /** Wycina ciało `_maybeAutoDockOnReturn` — wydzielone, by dało się puścić na mutacji. */
  const bodyOf = (src) => {
    const i = src.indexOf('_maybeAutoDockOnReturn(vesselId) {');
    if (i < 0) return null;
    const j = src.indexOf('\n  }', i);
    return j > i ? src.slice(i, j) : null;
  };
  const body = bodyOf(code);
  assert(!!body && /isSameSystem\(/.test(body),
    'T6b KONTROLA PINU: ciało `_maybeAutoDockOnReturn` wycięte i ma TERMIN UKŁADU');
  const distRe = /(distanceAU|euclideanAU|THRESHOLD|hypot)/;
  assert(!!body && !distRe.test(body),
    `T6c brak jakiegokolwiek terminu ODLEGŁOŚCI w ciele (${body && distRe.test(body) ? 'ZNALEZIONY' : 'brak'})`);

  // ⚠ KONTROLA PINU — wstrzyknij próg i sprawdź, że T6c BY PADŁ. Bez tego T6c jest zgadywaniem:
  //   przechodziłby też dla kodu, w którym wzorzec nic nie umie znaleźć.
  const mutated = body.replace('if (!isSameSystem(v, planet)) {',
    'if (DistanceUtils.euclideanAU(v.position, planet) > 0.5) return;\n    if (!isSameSystem(v, planet)) {');
  assert(mutated !== body && distRe.test(mutated),
    'T6d KONTROLA PINU: zmutowana kopia z progiem JEST wykrywana przez wzorzec');
}

// ═══ T7/T8 — ANTY-JAŁOWOŚĆ: legalne ścieżki nadal działają ═══════════════════
header('T7/T8  anty-jałowość — legalny Powrót dokuje, legalny dock dokuje');
{
  world();
  const v = ship({ sys: 'sys_home', auX: 3, colonyId: 'h2' });
  fmoReturn(v);
  const target = EntityManager.get(v._pendingReturnDock);
  completeOrder(v);
  assert(v.position.dockedAt === target.id && v.position.state === 'orbiting',
    `T7a legalny Powrót DOKUJE (dockedAt=${v.position.dockedAt}, state=${v.position.state})`);
  assert(v.colonyId === target.id,
    `T7b baza RE-HOMOWANA na cel Powrotu (colonyId=${v.colonyId}) — to jest sens „Powrotu do bazy"`);
  assert(Math.hypot(v.position.x - target.x, v.position.y - target.y) / AU < 0.01,
    'T7c pozycja zsnapowana do AKTUALNEJ pozycji ciała (teleport w obrębie układu ZOSTAJE)');
}
{
  world();
  const v = ship({ sys: 'sys_home', auX: 3 });
  const r = dispatchDockTo([v.id], 'p_home');
  assert(r?.okCount === 1, `T8 PRZESŁANKA: dock przyjęty (${JSON.stringify(r)})`);
  completeOrder(v);
  assert(v.position.state === 'docked' && v.position.dockedAt === 'p_home',
    `T8a legalny dock w swoim układzie NADAL dokuje (state=${v.position.state}, dockedAt=${v.position.dockedAt})`);
}

// ═══ T9 — UCZCIWA ODMOWA, dokładnie jeden komunikat ══════════════════════════
header('T9  brak własnej koloni w układzie ⇒ odmowa z JEDNYM komunikatem');
{
  world({ farColony: false });                 // gracz ma kolonie tylko w sys_home
  const v = ship({ sys: 'sys_020', auX: 3 });
  assert(nearestOwnColonyBodyInSystem(v, colMgr) === null,
    'T9 PRZESŁANKA: selektor nie znajduje własnej koloni w układzie statku');
  fmoReturn(v);
  assert((v._pendingReturnDock ?? null) === null && v.movementOrder == null && v.mission == null,
    `T9a zero rozkazu i zero markera (marker=${v._pendingReturnDock ?? 'null'}, order=${v.movementOrder ? 'JEST' : 'null'})`);
  assert(toasts.length === 1,
    `T9b DOKŁADNIE jeden komunikat (dostano: ${toasts.length} — ${JSON.stringify(toasts)})`);
  const locale0 = getLocale();
  setLocale('en'); const en = t('fleet.noFriendlyPlanet');
  setLocale('pl'); const pl = t('fleet.noFriendlyPlanet');
  setLocale(locale0);
  assert(en !== 'fleet.noFriendlyPlanet' && pl !== 'fleet.noFriendlyPlanet',
    `T9c klucz istniał w OBU językach — zero nowych kluczy i18n (EN „${en}")`);
}

// ═══ T10 — parytet selektora + sierota usunięta ══════════════════════════════
header('T10  parytet selektora + sierota USUNIĘTA');
{
  world();
  const v = ship({ sys: 'sys_020', auX: 3 });
  const cure = nearestOwnColonyBodyInSystem(v, colMgr);
  assert(!!cure && JSON.stringify(Object.keys(cure).sort()) === JSON.stringify(['colony', 'distanceAU', 'planet']),
    `T10a kształt zwrotki {colony, planet, distanceAU} (${JSON.stringify(Object.keys(cure ?? {}))})`);
  COLONIES['f_far'].isOutpost = true;
  assert(nearestOwnColonyBodyInSystem(v, colMgr)?.planet?.id === 'f_far',
    'T10b fallback placówkowy ZACHOWANY (placówka jako jedyna w układzie jest wybierana)');
  const vw = ship({ sys: 'sys_020', auX: 3 }); vw.systemId = null;
  assert(nearestOwnColonyBodyInSystem(vw, colMgr) === null,
    'T10c statek w tranzycie warp ⇒ null (nie ma „tutaj")');

  assert(typeof ars._findNearestFriendlyPlanet !== 'function',
    `T10d sierota "_findNearestFriendlyPlanet" USUNIĘTA (typeof=${typeof ars._findNearestFriendlyPlanet})`);
  // ⚠ KONTROLA PINU: obiekt JEST żywym AutoRetreatSystem, więc T10d nie przechodzi „bo nic nie ma".
  assert(typeof ars._issueRetreatOrder === 'function',
    'T10e KONTROLA PINU: to jest prawdziwy AutoRetreatSystem (ma `_issueRetreatOrder`)');
}

// ═══ T11/T12 — NIE-REGRESJA 147 i 254 ═══════════════════════════════════════
header('T11/T12  nie-regresja — 147 (admisja warp) i 254 (composite)');
{
  world();
  const vw = ship({ sys: 'sys_020', auX: 3 });
  vw.mission = { type: 'interstellar_jump', toSystemId: 'sys_099', phase: 'warp_transit', arrivalYear: 140 };
  vw.systemId = null;
  const r = mos.issueOrder(vw.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 6 * AU, y: 0 } });
  assert(r?.ok === false && r?.reason === 'vessel_in_warp_transit',
    `T11 bramka 147 nietknięta (ok=${r?.ok}, reason=${r?.reason})`);
}
{
  world();
  const os = new OrderService();
  let jumps = 0;
  Object.assign(window.KOSMOS, {
    orderService: os,
    // ⚠ TRUTHY OBOWIĄZKOWO: bez tego `issueMove` skręca w gałąź MGŁY (`target_system_unknown`,
    //   `OrderService:112-113`) i pin mierzyłby Finding 186 zamiast composite'u.
    starSystemManager: { getSystem: () => ({ id: 'sys_home' }) },
    warpRouteSystem: { beginJourney: () => { jumps++; return { ok: true }; } },
  });
  const v = ship({ sys: 'sys_020', auX: 3 });
  const h2 = EntityManager.get('h2');
  const rc = os.issueMove(v.id, { type: 'moveToPoint', targetBodyId: 'h2', targetPoint: { x: h2.x, y: h2.y } });
  assert(rc?.ok === true && rc?.composite === true && jumps === 1,
    `T12 composite 254 nietknięty (ok=${rc?.ok}, composite=${rc?.composite}, skoki=${jumps})`);
  os.destroy();
  delete window.KOSMOS.orderService;
  delete window.KOSMOS.starSystemManager;
  delete window.KOSMOS.warpRouteSystem;
}

// ═══ D1 — OFERTA: reprezentant odsiewa obcy układ ══════════════════════
header('D1  oferta docka — reprezentant zawęża listę do swojego układu');
{
  world();
  const near = ship({ sys: 'sys_home', auX: 2, name: 'Sable' });
  ship({ sys: 'sys_020', auX: 3, name: 'Kestrel' });
  const all  = getDockTargets().map((b) => b.id);
  // KONTROLA NIE-JAŁOWOŚCI: bez niej „obcego ciała nie ma na liście" jest prawdą trywialną.
  assert(all.includes('f_far') && all.includes('p_home'),
    `D1a KONTROLA: lista BEZ filtra zawiera cel z obcego układu (${JSON.stringify(all)})`);
  const offered = filterDockTargets(getDockTargets(), near, true).map((b) => b.id);
  assert(!offered.includes('f_far') && offered.includes('p_home'),
    `D1b oferta reprezentanta [sys_home] NIE zawiera f_far (${JSON.stringify(offered)})`);
  // ⚠ Sam `sameSystemOnly` bez reprezentanta jest NO-OPEM — to jest sedno korekty „jednego argumentu".
  assert(filterDockTargets(getDockTargets(), null, true).length === all.length,
    'D1c KONTROLA: flaga BEZ reprezentanta niczego nie odsiewa (guard `if (!vessel)`)');

  // Pin źródłowy — obie stare powierzchnie podają OBIE rzeczy. ⚠ Kotwice `\s`, nigdy `\n`
  //   (Finding 270: świeży checkout jest CRLF, drzewo autora bywa LF).
  const here  = dirname(fileURLToPath(import.meta.url));
  const fgp   = readFileSync(join(here, '../../ui/FleetGroupPanel.js'), 'utf-8');
  const fcp   = readFileSync(join(here, '../../ui/FleetCommandPanel.js'), 'utf-8');
  const asks  = (src) => /sameSystemOnly:\s*true/.test(src) && /vessel:\s*[A-Za-z_$][\w$]*(\[0\])?/.test(src);
  assert(asks(fgp) && asks(fcp),
    'D1d obie stare powierzchnie proszą o zawężenie I podają reprezentanta (kształt A)');
  assert(!asks('openDockPicker(ids, { sameSystemOnly: true, onDone });'),
    'D1e KONTROLA PINU: sama flaga bez reprezentanta NIE przechodzi');
}

// ═══ D3 — 🔑 ADMISJA ═════════════════════════════════════════
header('D3  `dock` na ciało z OBCEGO układu — odmowa, i to STRICTE no-op');
{
  world();
  const v = ship({ sys: 'sys_020', auX: 3, name: 'Kestrel' });
  const home = EntityManager.get('p_home');
  assert(!isSameSystem(v, home),
    `D3a KONTROLA: cel NAPRAWDĘ jest w innym układzie (statek ${v.systemId}, cel ${home.systemId})`);
  const fuelBefore = v.fuel.current;
  const r = mos.issueOrder(v.id, { type: ORDER_TYPES.dock, targetBodyId: 'p_home',
    targetPoint: { x: home.x, y: home.y } });
  assert(r?.ok === false && r?.reason === 'target_other_system',
    `D3b ODMOWA z powodem 256 (${JSON.stringify(r)})`);
  assert(mos.getOrder(v.id) == null && (v._pendingDock ?? null) === null
         && v.mission == null && v.fuel.current === fuelBefore,
    `D3c NO-OP: rozkaz=${mos.getOrder(v.id)?.type ?? 'BRAK'}, marker=${v._pendingDock ?? 'brak'}, `
    + `misja=${v.mission?.type ?? 'brak'}, paliwo ${fuelBefore}→${v.fuel.current}`);
}

// ═══ D4 + D5 — 🔑 ODMOWA MÓWI, I MÓWI NAZWAMI ═══════════════════════
header('D4/D5 odmowa docka jest głośna — trzy pułapki ciszy zamknięte');
for (const loc of ['pl', 'en']) {
  const prev = getLocale();
  setLocale(loc);
  world();
  const pushed = [];
  window.KOSMOS.eventLogSystem = { push: (e) => pushed.push(e) };
  const inSys  = ship({ sys: 'sys_home', auX: 2, name: 'Sable' });
  const outSys = ship({ sys: 'sys_020',  auX: 3, name: 'Kestrel' });
  const res = dispatchDockTo([inSys.id, outSys.id], 'p_home');

  // D5 — KONTROLA NIE-JAŁOWOŚCI po OBU stronach: ktoś polecił I ktoś został pominięty.
  assert(res.okCount === 1 && mos.getOrder(inSys.id)?.type === 'moveToPoint'
         && mos.getOrder(outSys.id) == null,
    `D5-${loc} częściowa wysyłka: kto mógł — polecił (okCount=${res.okCount})`);

  const e = pushed[0];
  const txt = e?.text ?? '';
  assert(pushed.length === 1 && e?.channel === 'fleet' && e?.severity === 'warn'
         && e?.entityRef === outSys.id,
    `D4a-${loc} DOKŁADNIE jeden wpis (kanał=${e?.channel}, waga=${e?.severity}, ref=${e?.entityRef})`);
  // ⚠ `txt.length > 0` JEST CZĘŚCIĄ PINU — bez tego „brak surowego sluga" przechodzi na PUSTYM
  //   tekście (lekcja legu D, licznik fail-first 20/20 → 18/22).
  assert(txt.length > 0 && txt.includes('Kestrel') && !txt.includes('Sable')
         && txt.includes(t('vessel.reasonTargetOtherSystem')) && !/target_other_system/.test(txt),
    `D4b-${loc} nazwany WYŁĄCZNIE pominięty, powód PRZETŁUMACZONY → „${txt}"`);

  // PUŁAPKA (i): odmowa BEZ powodu — `?? null` gasiło CAŁY raport (zmierzone).
  world();
  const pushed2 = [];
  window.KOSMOS.eventLogSystem = { push: (ev) => pushed2.push(ev) };
  const w = ship({ sys: 'sys_020', auX: 3, name: 'Zmija' });
  const realIssue = mos.issueOrder.bind(mos);
  mos.issueOrder = () => ({ ok: false });          // brak `reason`
  const r2 = dispatchDockTo([w.id], 'p_home');
  mos.issueOrder = realIssue;
  assert(pushed2.length === 1 && (pushed2[0].text ?? '').length > 0 && r2.firstFail === 'unknown',
    `D4c-${loc} odmowa BEZ powodu też MÓWI (firstFail=${JSON.stringify(r2.firstFail)}, `
    + `wpisów=${pushed2.length})`);

  // PUŁAPKA (iii): SUKCES ma milczeć — inaczej raport zamieniłby się w szum.
  world();
  const pushed3 = [];
  window.KOSMOS.eventLogSystem = { push: (ev) => pushed3.push(ev) };
  const okShip = ship({ sys: 'sys_home', auX: 2, name: 'Sable' });
  const r3 = dispatchDockTo([okShip.id], 'p_home');
  assert(r3.okCount === 1 && pushed3.length === 0,
    `D4d-${loc} pełny sukces MILCZY (okCount=${r3.okCount}, wpisów=${pushed3.length})`);
  setLocale(prev);
}

// ═══ D6 — ANTY-JAŁOWOŚĆ: dok we własnym układzie działa CAŁY łańcuch ══════════
header('D6  dock we WŁASNYM układzie — nietknięty od rozkazu do `docked`');
{
  world();
  const v = ship({ sys: 'sys_home', auX: 3, name: 'Sable' });
  const r = dispatchDockTo([v.id], 'p_home');
  assert(r.okCount === 1, `D6a PRZESŁANKA: rozkaz przyjęty (${JSON.stringify(r)})`);
  completeOrder(v);
  assert(v.position.state === 'docked' && v.position.dockedAt === 'p_home',
    `D6b statek ZADOKOWAŁ (state=${v.position.state}, dockedAt=${v.position.dockedAt})`);
}

// ═══ D7 — KONSUMENT: nieświeży marker nie re-homuje bazy ════════════════
header('D7  stary `_pendingDock` na obce ciało — BAZA statku nietknięta (D-256b)');
{
  world();
  const v = ship({ sys: 'sys_020', auX: 3, colonyId: 'f_far', name: 'Kestrel' });
  v._pendingDock = 'p_home';                       // marker przeżył porzucenie rozkazu
  assert((v._pendingDock ?? null) === 'p_home' && v.colonyId === 'f_far',
    `D7a KONTROLA: marker ustawiony, baza w ${v.colonyId}`);
  const xBefore = v.position.x;
  fs._maybeDockOnArrival(v.id);
  assert(v.colonyId === 'f_far' && (v.position.dockedAt ?? null) === null
         && v.position.x === xBefore,
    `D7b baza NIE re-homowana (colonyId=${v.colonyId}, dockedAt=${v.position.dockedAt ?? 'null'}, `
    + `x ${xBefore}→${v.position.x})`);
  assert((v._pendingDock ?? null) === null, 'D7c marker ZUŻYTY mimo odmowy (jednorazowy flag)');
}

// ═══ D8 — SYMETRIA BLIŹNIAKÓW ═════════════════════════════════
header('D8  oba konsumenty markera odpowiadają TAK SAMO na ten sam stan świata');
{
  world();
  const a = ship({ sys: 'sys_020', auX: 3, colonyId: 'f_far', name: 'Kestrel' });
  const b = ship({ sys: 'sys_020', auX: 3, colonyId: 'f_far', name: 'Vipera' });
  a._pendingDock = 'p_home';
  b._pendingReturnDock = 'p_home';
  fs._maybeDockOnArrival(a.id);
  fs._maybeAutoDockOnReturn(b.id);
  assert(a.colonyId === 'f_far' && b.colonyId === 'f_far'
         && (a.position.dockedAt ?? null) === null && (b.position.dockedAt ?? null) === null,
    `D8a oba markery odrzucone identycznie (dock: ${a.colonyId}/${a.position.dockedAt ?? 'null'}, `
    + `return: ${b.colonyId}/${b.position.dockedAt ?? 'null'})`);
}

// ═══ D9 — PIN źRÓDŁOWY: jeden termin, jedno miejsce ═══════════════════
header('D9  termin siedzi w `_issueDock`, dokładnie raz, bez drugiej kopii');
{
  const here = dirname(fileURLToPath(import.meta.url));
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const mosSrc = strip(readFileSync(join(here, '../../systems/MovementOrderSystem.js'), 'utf-8'));
  const vgaSrc = strip(readFileSync(join(here, '../../ui/VesselGroupActions.js'), 'utf-8'));
  // ⚠ Kotwica `[\s\S]` — nigdy `\n` (Finding 270: świeży checkout CRLF).
  const dockFn = mosSrc.match(/_issueDock\(vessel, spec\)\s*\{[\s\S]*?\n  \}/);
  assert(!!dockFn && /isSameSystem\(vessel,\s*bodyEnt\)/.test(dockFn[0]),
    'D9a termin (statek, CIAŁO) siedzi WEWNĄTRZ `_issueDock`');
  assert(!/isSameSystem/.test(vgaSrc),
    'D9b `VesselGroupActions` NIE ma drugiej kopii terminu (jedno miejsce, nie dwa)');
  assert(/isSameSystem/.test(vgaSrc + 'isSameSystem(a,b)'),
    'D9c KONTROLA PINU: na zmutowanej kopii D9b PADA');
}
console.log(`\n════ return_dock_family_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail > 0 ? 1 : 0);
