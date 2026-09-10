// ═══════════════════════════════════════════════════════════════════════════════
// fleet_move_picker_frame_smoke — KEEPER wierszy 8/9 Findingu 255 (pickery flotowe)
// Decyzje D-89a..D-89d. Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §255.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: leg D (`92e075f`) zamknął PPM mapy (wiersze 1/2), ale DWA pickery flotowe
//   budują spec WŁASNYM literałem, z pominięciem `_buildFleetSpec`, i nie widziały żadnego
//   terminu ramki: `FleetManagerOverlay._handleFleetMoveToPoint:4732` (`intent:'fleet_move'`)
//   oraz `FleetCommandPanel._armMovePicker:348` (`intent:'fleetcmd_move'`).
//   ZMIERZONE NA ŻYWO przez właściciela przy gate'cie legu D, i odtworzone WYKONANIEM tu:
//   flota dwóch statków w `sys_020`, kamera na `sys_home`, klik w pustkę → OBA statki
//   dostają `moveToPoint` do (15.71, −158.94) mierzonych od WŁASNEJ gwiazdy, **0 wpisów
//   w Dzienniku**, a UI melduje toastem „Flota: 2/2 statków wykonuje rozkaz". Czyli
//   interfejs AKTYWNIE potwierdzał sukces rozkazu, który poszedł w cudzą ramkę.
//
// ⚠ DLACZEGO PINY JEŻDŻĄ PRAWDZIWYM PRODUCENTEM, A NIE `issueFleetOrder`:
//   producent NIE wydaje rozkazu sam — uzbraja picker, a rozkaz rodzi się dopiero
//   w callbacku, przy kliku. Pin strzelający wprost w `issueFleetOrder` mierzyłby seam,
//   który MUSI zostać przepuszczalny (tędy idzie „Powrót do bazy" z celem w ramce STATKU —
//   `map_click_frame_smoke` T4), więc **nie mógłby paść po poprawnej naprawie**. Zmierzone:
//   na symulowanej naprawie producent odmawia, a taki pin dalej świeci na zielono.
//   Stąd `pickerUM()` + `firePicker()` — lustro `GameScene._finalizeTargetPointPicker:5272`.
//
// ⚠ MOMENT TERMINU: FINALIZACJA, NIGDY ARM (D-89c — REGUŁA, dziedziczy ją też 267).
//   Nic nie kasuje pickera na `system:switched` (dwaj konsumenci — `GameScene:3435`
//   i `FMO:505` — go nie dotykają), więc gracz uzbraja picker przy kamerze ZGODNEJ z flotą,
//   przełącza układ i klika. Bramka ARM-time przepuściłaby dokładnie ten przypadek.
//   Pinuje to F7, z kontrolą „picker po przełączeniu NADAL uzbrojony".
//
// PINY:
//   F1   ADMISJA wiersz 8 (`FMO._handleFleetMoveToPoint`) — żaden członek nie dostaje
//        rozkazu, `fleet.activeOrder` zostaje `null`
//        + KONTROLA NIE-JAŁOWOŚCI: flota MA dwóch członków i OBAJ są poza ramką
//   F2   ADMISJA wiersz 9 (`FleetCommandPanel._armMovePicker`) — bliźniak F1
//   F3   ODMOWA JEST GŁOŚNA — wpis `fleet`/`warn` z NAZWAMI OBU statków, `txt.length > 0`,
//        bez surowego sluga + ⚠ TRAP: `_announce*` mają `if (!res) return`, więc przy
//        odmowie NIE POWIEDZĄ NIC — pin sprawdza, że NIE poszedł toast sukcesu
//   F4   D-LD2 CAŁA FLOTA ALBO NIC — flota mieszana: ZERO przyjętych (nie jeden!),
//        nazwany WYŁĄCZNIE członek spoza ramki
//        + KONTROLA: ten sam członek w ramce PRZECHODZI, gdy jest sam (inaczej „0 przyjętych"
//        byłoby prawdą trywialnie)
//   F5   ANTY-JAŁOWOŚĆ — kamera == ramka floty ⇒ rozkaz LECI, zero wpisów w Dzienniku
//   F6   🔑 SEAM FAN-OUTU POZOSTAJE PRZEPUSZCZALNY — „Powrót do bazy" (cel w ramce STATKU)
//        przez PRAWDZIWE `issueFleetOrder` + kontrola, że cel naprawdę jest z układu statku
//   F7   🔑 FINALIZACJA, NIE ARM — uzbrój przy zgodnej kamerze, przełącz układ, kliknij
//        ⇒ ODMOWA + kontrola „picker po przełączeniu NADAL uzbrojony"
//   F8   NIE-REGRESJA 147 — członek W SKOKU nie dostaje powodu ramki (fail-open), tylko
//        `vessel_in_warp_transit` z MOS + kontrola `systemIdOf(v) === null`
//   F9   POWRÓT NIETKNIĘTY — `_handleFleetReturnBase` i `_fleetReturn` wysyłają flotę
//        spoza ramki kamery + marker `_pendingReturnDock` (D-255b)
//   F10  256 NIETKNIĘTY — `dock` wydany POZA mapą dalej przechodzi
//   F11  i18n — trzy reużyte klucze żyją w PL i EN, powód ramki ≠ powód warp
//   F12  ŹRÓDŁO — producenci używają WYŁĄCZNIE istniejących kluczy (zero nowych)
//        + D-89b: predykat ma JEDNO źródło (`utils/CameraFrame.js`), trzech konsumentów,
//        a po `RightClickMenu` nie został ŻADEN bliźniak prywatnej metody
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
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { FleetCommandPanel }   from '../../ui/FleetCommandPanel.js';
import { nearestOwnColonyBodyInSystem } from '../../utils/RetreatTarget.js';
import { systemIdOf }          from '../../utils/SystemScope.js';
import { setLocale, getLocale, t } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU  = GAME_CONFIG.AU_TO_PX;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });

let vMgr, mos, fSys, pushed, toasts;

// ⚠ Ciała OBU układów leżą w TYCH SAMYCH zakresach px — gwiazda każdego układu stoi
//   w (0,0). To jest MECHANIZM całej rodziny 138/142/147/255, nie skrót fixture'u.
function addBody(id, sys, auX, name) {
  const b = {
    id, type: 'planet', name, x: auX * AU, y: 0, radius: 8, mass: 1,
    orbital: orb(auX), physics: { x: auX * AU, y: 0 }, systemId: sys,
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
  pushed = []; toasts = [];

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
  EventBus.on('ui:toast', (d) => toasts.push(d));
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
const makeFleet = (...vs) => {
  const id = fSys.createFleet('F1').id;
  for (const v of vs) fSys.addMember(id, v.id);
  return id;
};

// Stub pickera — LUSTRO `UIManager.setPickerMode/getPickerState/cancelPickerMode`.
function installPickerUM() {
  let st = null;
  const um = {
    isPickerActive: () => st !== null,
    getPickerState: () => st,
    setPickerMode: (mode, cb, metadata) => { st = { mode, callback: cb, metadata }; return true; },
    cancelPickerMode: () => { st = null; return true; },
    getSelectedFleetId: () => null, getSelectedVesselId: () => null, getSelectedVesselIds: () => [],
  };
  window.KOSMOS.uiManager = um;
  return um;
}
// Lustro `GameScene._finalizeTargetPointPicker:5272` — czyta callback, kasuje stan, woła.
function firePicker(um, point) {
  const ps = um.getPickerState();
  if (!ps || ps.mode !== 'targetPoint') return false;
  const cb = ps.callback;
  um.cancelPickerMode();
  if (typeof cb === 'function') cb(point);
  return true;
}
// Producenci są metodami PROTOTYPU i nie potrzebują konstrukcji (canvas/DOM).
const fmo = () => Object.create(FleetManagerOverlay.prototype);
const fcp = () => Object.assign(Object.create(FleetCommandPanel.prototype), { _markDirty: () => {} });

// Punkt, który gracz kliknął w ramce KAMERY — dosłownie z rejestru (`mo_6`).
const CLICK = { x: 15.71, y: -158.94 };

setLocale('pl');

// ═══ F1 — ADMISJA wiersz 8 ═══════════════════════════════════════════════════
header('F1  FMO._handleFleetMoveToPoint — flota spoza ramki NIE rusza');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);
  const um = installPickerUM();

  // KONTROLA NIE-JAŁOWOŚCI: bez niej „nikt nie dostał rozkazu" byłoby prawdą
  // dla pustej floty albo dla floty, której członkowie są w ramce.
  const members = fSys.getFleet(fleetId)?.memberIds ?? [];
  assert(members.length === 2
         && members.every(id => systemIdOf(vMgr.getVessel(id)) === 'sys_020')
         && window.KOSMOS.activeSystemId === 'sys_home',
    `F1a KONTROLA: flota ma ${members.length} członków i OBAJ są poza ramką kamery (${window.KOSMOS.activeSystemId})`);

  fmo()._handleFleetMoveToPoint(fleetId);
  const ps = um.getPickerState();
  assert(ps?.mode === 'targetPoint' && ps?.metadata?.intent === 'fleet_move',
    `F1b picker uzbrojony (mode=${ps?.mode}, intent=${ps?.metadata?.intent})`);

  firePicker(um, CLICK);
  assert(mos.getOrder(a.id) == null && mos.getOrder(b.id) == null
         && fSys.getFleet(fleetId)?.activeOrder == null
         && a.mission == null && b.mission == null,
    `F1c ODMOWA: rozkazy=${mos.getOrder(a.id)?.type ?? 'BRAK'}/${mos.getOrder(b.id)?.type ?? 'BRAK'}, activeOrder=${fSys.getFleet(fleetId)?.activeOrder == null ? 'null' : 'JEST'}`);
}

// ═══ F2 — ADMISJA wiersz 9 ═══════════════════════════════════════════════════
header('F2  FleetCommandPanel._armMovePicker — bliźniak F1');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);
  const um = installPickerUM();

  const members = fSys.getFleet(fleetId)?.memberIds ?? [];
  assert(members.length === 2 && members.every(id => systemIdOf(vMgr.getVessel(id)) !== window.KOSMOS.activeSystemId),
    `F2a KONTROLA: dwóch członków, obaj poza ramką`);

  fcp()._armMovePicker(fleetId);
  const ps = um.getPickerState();
  assert(ps?.mode === 'targetPoint' && ps?.metadata?.intent === 'fleetcmd_move',
    `F2b picker uzbrojony (intent=${ps?.metadata?.intent})`);

  firePicker(um, CLICK);
  assert(mos.getOrder(a.id) == null && mos.getOrder(b.id) == null
         && fSys.getFleet(fleetId)?.activeOrder == null,
    `F2c ODMOWA: rozkazy=${mos.getOrder(a.id)?.type ?? 'BRAK'}/${mos.getOrder(b.id)?.type ?? 'BRAK'}`);
}

// ═══ F3 — ODMOWA JEST GŁOŚNA (+ trap `if (!res) return`) ═════════════════════
header('F3  odmowa mówi NAZWAMI, a nie milczy — i nie melduje sukcesu');
for (const loc of ['pl', 'en']) {
  setLocale(loc);
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);
  const um = installPickerUM();
  fmo()._handleFleetMoveToPoint(fleetId);
  firePicker(um, CLICK);

  const e   = pushed[0];
  const txt = e?.text ?? '';
  assert(pushed.length === 1 && e?.channel === 'fleet' && e?.severity === 'warn' && e?.entityRef === a.id,
    `F3a-${loc} DOKŁADNIE jeden wpis, kanał=${e?.channel}, waga=${e?.severity}, entityRef=${e?.entityRef}`);
  // ⚠ `txt.length > 0` JEST CZĘŚCIĄ PINU — bez tego „brak surowego sluga" przechodzi
  //   na pustym tekście (lekcja z legu D, licznik fail-first 20/20 → 18/22).
  assert(txt.length > 0 && txt.includes('Alfa') && txt.includes('Beta')
         && txt.includes(t('vessel.reasonTargetOtherSystem')) && !/target_other_system/.test(txt),
    `F3b-${loc} tekst niesie OBIE nazwy i PRZETŁUMACZONY powód → „${txt}"`);
  // ⚠ TRAP nazwany przez właściciela: `_announceFleetOrderResult` ma `if (!res) return`,
  //   więc przy odmowie nie leci ŻADEN toast. Przed naprawą leciał toast SUKCESU („2/2").
  assert(toasts.length === 0,
    `F3c-${loc} ZERO toastów — w szczególności ŻADNEGO meldunku sukcesu (było: „Flota: 2/2 …")`);
}
setLocale('pl');

// ═══ F4 — D-LD2: CAŁA FLOTA ALBO NIC ═════════════════════════════════════════
header('F4  flota mieszana — nikt nie rusza, nazwany tylko winowajca');
{
  scene({ camera: 'sys_home' });
  const inFrame  = ship({ sys: 'sys_home', auX: 2, name: 'Wewn' });
  const outFrame = ship({ sys: 'sys_020',  auX: 3, name: 'Zewn' });
  const fleetId  = makeFleet(inFrame, outFrame);
  const um = installPickerUM();
  fmo()._handleFleetMoveToPoint(fleetId);
  firePicker(um, CLICK);

  assert(mos.getOrder(inFrame.id) == null && mos.getOrder(outFrame.id) == null,
    `F4a ZERO przyjętych, nie jeden (wewn=${mos.getOrder(inFrame.id)?.type ?? 'BRAK'}, zewn=${mos.getOrder(outFrame.id)?.type ?? 'BRAK'})`);
  const txt = pushed[0]?.text ?? '';
  assert(pushed.length === 1 && txt.includes('Zewn') && !txt.includes('Wewn'),
    `F4b nazwany WYŁĄCZNIE członek spoza ramki → „${txt}"`);

  // ⚠ KONTROLA: gdyby `Wewn` i tak nie mógł polecieć, F4a byłoby prawdą trywialnie.
  scene({ camera: 'sys_home' });
  const solo = ship({ sys: 'sys_home', auX: 2, name: 'Wewn' });
  const soloFleet = makeFleet(solo);
  const um2 = installPickerUM();
  fmo()._handleFleetMoveToPoint(soloFleet);
  firePicker(um2, CLICK);
  assert(mos.getOrder(solo.id)?.type === 'moveToPoint',
    `F4c KONTROLA: ten sam członek W RAMCE, sam, PRZECHODZI (${mos.getOrder(solo.id)?.type ?? 'BRAK'})`);
}

// ═══ F5 — ANTY-JAŁOWOŚĆ ══════════════════════════════════════════════════════
header('F5  naprawa NIE jest „odmawiaj wszystkiego"');
{
  scene({ camera: 'sys_020' });
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);
  const um = installPickerUM();
  fmo()._handleFleetMoveToPoint(fleetId);
  firePicker(um, CLICK);
  assert(mos.getOrder(a.id)?.type === 'moveToPoint' && mos.getOrder(b.id)?.type === 'moveToPoint'
         && pushed.length === 0,
    `F5a kamera == ramka floty ⇒ rozkaz LECI do obu, wpisów=${pushed.length}`);

  scene({ camera: 'sys_020' });
  const c = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const fleet2 = makeFleet(c);
  const um2 = installPickerUM();
  fcp()._armMovePicker(fleet2);
  firePicker(um2, CLICK);
  assert(mos.getOrder(c.id)?.type === 'moveToPoint' && pushed.length === 0,
    `F5b to samo dla wiersza 9 (${mos.getOrder(c.id)?.type ?? 'BRAK'})`);
}

// ═══ F6 — 🔑 SEAM FAN-OUTU POZOSTAJE PRZEPUSZCZALNY ══════════════════════════
header('F6  „Powrót do bazy" floty spoza ramki NADAL przechodzi przez issueFleetOrder');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);

  const nearest = nearestOwnColonyBodyInSystem(a, window.KOSMOS.colonyManager);
  assert(nearest?.planet?.systemId === 'sys_020' && window.KOSMOS.activeSystemId === 'sys_home',
    `F6a KONTROLA: cel Powrotu jest w układzie STATKU (${nearest?.planet?.systemId}), kamera w ${window.KOSMOS.activeSystemId}`);

  const p = nearest.planet;
  const res = fSys.issueFleetOrder(fleetId, { type: 'moveToPoint', targetPoint: { x: p.x, y: p.y } });
  assert(res?.ok === true && res.accepted?.length === 2,
    `F6b fan-out PRZEPUSZCZA punkt z ramki STATKU (ok=${res?.ok}, accepted=${res?.accepted?.length}) — termin NIE MOŻE tam zamieszkać`);
}

// ═══ F7 — 🔑 FINALIZACJA, NIE ARM ════════════════════════════════════════════
header('F7  bramka liczy się przy KLIKU, nie przy uzbrajaniu pickera');
{
  scene({ camera: 'sys_020' });                  // kamera ZGODNA z flotą w chwili ARM
  const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
  const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);
  const um = installPickerUM();
  fmo()._handleFleetMoveToPoint(fleetId);
  assert(um.isPickerActive() && window.KOSMOS.activeSystemId === 'sys_020',
    'F7a KONTROLA: w chwili ARM kamera == ramka floty (bramka ARM-time by PRZEPUŚCIŁA)');

  window.KOSMOS.activeSystemId = 'sys_home';     // gracz przełącza układ…
  assert(um.isPickerActive(),
    'F7b KONTROLA: picker po przełączeniu układu NADAL uzbrojony (nic go nie kasuje na system:switched)');

  firePicker(um, CLICK);                          // …i dopiero teraz klika
  assert(mos.getOrder(a.id) == null && mos.getOrder(b.id) == null && pushed.length === 1,
    `F7c ODMOWA mimo zgodnej kamery przy ARM (rozkazy=${mos.getOrder(a.id)?.type ?? 'BRAK'}/${mos.getOrder(b.id)?.type ?? 'BRAK'}, wpisów=${pushed.length})`);
}

// ═══ F8 — NIE-REGRESJA 147 ═══════════════════════════════════════════════════
header('F8  członek W SKOKU — powód należy do 147, nie do ramki');
{
  scene({ camera: 'sys_home' });
  const w = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  w.warpFuel.current = 0.5;
  w.mission = { type: 'interstellar_jump', fromSystemId: 'sys_020', toSystemId: 'sys_099',
                phase: 'warp_transit', departYear: 100, arrivalYear: 140 };
  w.status = 'on_mission'; w.position.state = 'in_transit'; w.systemId = null;
  const fleetId = makeFleet(w);
  assert(systemIdOf(w) === null,
    `F8a KONTROLA: statek w tranzycie ma systemIdOf === null (dostano: ${JSON.stringify(systemIdOf(w))})`);

  const um = installPickerUM();
  fmo()._handleFleetMoveToPoint(fleetId);
  firePicker(um, CLICK);
  // Fail-open ramki ⇒ żadnego wpisu o ramce; odmowa przychodzi z MOS, z powodem 147.
  const frameTxt = pushed.map(p => p.text).join(' | ');
  assert(!frameTxt.includes(t('vessel.reasonTargetOtherSystem')),
    `F8b termin ramki PRZEPUSZCZA statek w tranzycie (fail-open) → wpisy: „${frameTxt || '(brak)'}"`);
  const r = mos.issueOrder(w.id, { type: 'moveToPoint', targetPoint: { ...CLICK } });
  assert(r?.ok === false && r?.reason === 'vessel_in_warp_transit',
    `F8c odmowę wydaje bramka 147 własnym powodem (${r?.reason})`);
}

// ═══ F9 — POWRÓT NIETKNIĘTY (obie powierzchnie) ══════════════════════════════
header('F9  „Powrót do bazy" działa dla floty spoza ramki — obie powierzchnie');
{
  for (const [label, run] of [['FMO', (id) => fmo()._handleFleetReturnBase(id)],
                              ['FCP', (id) => fcp()._fleetReturn(id)]]) {
    scene({ camera: 'sys_home' });
    const a = ship({ sys: 'sys_020', auX: 2, name: 'Alfa' });
    const b = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
    const fleetId = makeFleet(a, b);
    assert(systemIdOf(a) !== window.KOSMOS.activeSystemId,
      `F9a-${label} KONTROLA: flota jest POZA ramką kamery`);
    run(fleetId);
    assert(mos.getOrder(a.id)?.type === 'moveToPoint' && mos.getOrder(b.id)?.type === 'moveToPoint'
           && a._pendingReturnDock != null,
      `F9b-${label} Powrót LECI + marker D-255b (${mos.getOrder(a.id)?.type ?? 'BRAK'}, marker=${a._pendingReturnDock ?? 'brak'})`);
  }
}

// ═══ F10 — 256 NIETKNIĘTY ════════════════════════════════════════════════════
header('F10 dock POZA mapą dalej przechodzi (Finding 256 zostaje otwarty)');
{
  scene({ camera: 'sys_home' });
  const v = ship({ sys: 'sys_020', auX: 2, name: 'Żmija' });
  const fa = EntityManager.get('f_a');
  const r = mos.issueOrder(v.id, { type: 'dock', targetBodyId: 'f_a', targetPoint: { x: fa.x, y: fa.y } });
  assert(r?.ok === true,
    `F10a dock wydany POZA mapą przechodzi (ok=${r?.ok}, reason=${r?.reason ?? '—'})`);
}

// ═══ F11 — i18n (zero nowych kluczy) ═════════════════════════════════════════
header('F11 trzy reużyte klucze żyją w PL i EN');
{
  const prev = getLocale();
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    for (const k of ['vessel.orderNoneMoved', 'vessel.orderPartial', 'vessel.reasonTargetOtherSystem']) {
      const s = t(k, 'X', 'Y', 'Z');
      assert(typeof s === 'string' && s.length > 0 && s !== k,
        `F11-${loc} ${k} ma tekst → „${String(s).slice(0, 52)}"`);
    }
    assert(t('vessel.reasonTargetOtherSystem') !== t('vessel.reasonVesselInWarpTransit'),
      `F11-${loc} powód ramki ≠ powód warp (gracz rozróżnia dwa stany)`);
  }
  setLocale(prev);
}

// ═══ F12 — PIN ŹRÓDŁOWY: jeden predykat, trzech konsumentów, zero nowych kluczy ═
header('F12 D-89b — jedno źródło predykatu i zero wymyślonych kluczy');
{
  const here = dirname(fileURLToPath(import.meta.url));
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const read = (rel) => stripComments(readFileSync(join(here, rel), 'utf-8'));
  const rcm = read('../../ui/RightClickMenu.js');
  const ovl = read('../../ui/FleetManagerOverlay.js');
  const pnl = read('../../ui/FleetCommandPanel.js');

  assert([rcm, ovl, pnl].every(s => /from ['"][^'"]*CameraFrame\.js['"]/.test(s)),
    'F12a wszyscy TRZEJ konsumenci importują predykat z `utils/CameraFrame.js`');
  // ⚠ Bliźniak zostawiony w `RightClickMenu` byłby drugą definicją tego samego predykatu —
  //   dokładnie miną, którą ta ekstrakcja usuwa.
  assert(!/_outOfCameraFrame\s*\(\s*vesselId\s*\)\s*\{/.test(rcm) && !/_describeFail\s*\(/.test(rcm),
    'F12b po `RightClickMenu` NIE został żaden prywatny bliźniak predykatu');
  // KONTROLA PINU — na zmutowanej kopii ten sam pin PADA.
  assert(/_outOfCameraFrame\s*\(\s*vesselId\s*\)\s*\{/.test(rcm + '\n_outOfCameraFrame(vesselId) {'),
    'F12c KONTROLA PINU: na zmutowanej kopii pin bliźniaka PADA');

  const keysIn = (s) => [...s.matchAll(/t\(\s*'(vessel\.[A-Za-z0-9_.]+)'/g)].map(m => m[1]);
  const used = new Set([...keysIn(ovl), ...keysIn(pnl)].filter(k => /orderNoneMoved|orderPartial|reason/.test(k)));
  assert(used.has('vessel.orderNoneMoved') && [...used].every(k =>
      ['vessel.orderNoneMoved', 'vessel.orderPartial', 'vessel.reasonTargetOtherSystem'].includes(k)),
    `F12d producenci używają WYŁĄCZNIE istniejących kluczy → [${[...used].join(', ')}]`);
}

console.log(`\n════ fleet_move_picker_frame_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail === 0 ? 0 : 1);
