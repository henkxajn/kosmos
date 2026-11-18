// KEEPER — Finding 125: nieudany „Powrót do bazy" NIE brykuje statku.
//
// CO PINUJE (i dlaczego akurat to)
// Rozkaz powrotu z obcego układu musiał dotąd skłamać o stanie statku, żeby przejść bramkę
// dyspozytora (`status='idle'; position.state='docked'; mission=null`). Kłamstwa nikt nie cofał,
// gdy skok odpadał — a odpada najczęściej z braku `warp_cores`, czyli dokładnie wtedy, gdy gracz
// ten przycisk klika. Statek zostawał „zadokowany" przy ciele BEZ portu i tracił KAŻDE wyjście.
//
// Pomiar jest WYKONANIEM przez prawdziwy łańcuch: `OrderService.issueReturn` → `issueWarp` →
// odmowa, a potem REALNE `canLaunchFromCurrent` i REALNE `MovementOrderSystem.issueOrder`.
// Bramka i skutek muszą mówić to samo — dlatego test nie sprawdza tylko pól, ale to, czy statek
// nadal PRZYJMUJE rozkaz.
//
// T1  ORBITING + odmowa (OrderService)      → stan bez zmian, port ok, rozkaz ruchu ok
// T2  ORBITING + odmowa (FleetActions)      → to samo (bliźniak; ta ścieżka też była żywa)
// T3  IN_TRANSIT + odmowa                   → rollback do lotu, misja zachowana
// T4  SUKCES                                → NO-OP względem starego kodu (dispatch nadpisuje)
// T4b composite warp→dostawa                → odmowa go NIE kasuje, sukces kasuje
// T5  foreign_recon + odmowa                → abortForeignRecon POZA transakcją (statek sprawny)
// T6  helper — tabela prawdy sukces/odmowa/wyjątek/brak statku
// T7  ścieżka LOKALNA (dom) nietknięta
// T8  FMO — rozkaz return_home przez żywą strefę `action` (fasada + komunikat); dawne strefy powrotu = no-op
// T9  FMO — komunikat o odmowie (jeden słownik z _warpErrLabel, zero nowych kluczy i18n)
// T10 pin ŹRÓDŁOWY — nigdzie poza dokowaniem nie fałszujemy `position.state='docked'` (+ kontrola pinu)
// T11 PRAWDZIWY planer — rozkaz powrotu z FMO dostaje POWÓD („Za mało rdzeni warp") i ślad w Dzienniku
// T12 pin RENDERU — panel przylotu (inspektor konsoli + panel statku HUD) NIE ma przycisku powrotu; strefy powrotu bez
//     producenta w całym `src/`
//
// ⚠ KZ-Command (dawny panel `_drawRight` i jego strefy `interstellar_return` / `foreign_return` / `foreign_return_from_recon`
//   usunięte razem z wrapperem `_dispatchReturnJump` — strefy nie miały producenta od Findingu 145 (a')): T8 / T11 jadą
//   żywą konsumentką rozkazu w FMO — strefą `action` (`actionId: 'return_home'`) → `_handleAction` → `OrderService.issueReturn`
//   (transakcja `returnJumpTransactional`, `utils/ReturnJump.js`) → `_toastReturnFailed`; T10 — FMO deleguje do fasady
//   (zero surowego `dispatchInterstellar`), transakcję wołają OrderService i FleetActions; T12 renderuje ŻYWE powierzchnie
//   panelu statku (`CommandInspectorView.drawInspector` i `ShipPanelHudLogic.buildShipPanelModel`) zamiast `_drawRight`.
// T13 debugLog — cisza po odmowie jest Z KONSTRUKCJI (audyt AI nie zna zdarzeń floty) + kontrola pinu
//
// Uruchom: node src/testing/smoke/return_home_no_brick_smoke.mjs

import { readFileSync } from 'node:fs';

globalThis.localStorage = {
  _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k, v){ this._s[k] = String(v); },
  removeItem(k){ delete this._s[k]; }, key(i){ return Object.keys(this._s)[i] ?? null; },
  get length(){ return Object.keys(this._s).length; },
};
globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, appendChild(){}, addEventListener(){}, setAttribute(){} }),
  body: { appendChild(){}, removeChild(){} }, addEventListener(){},
};

const EventBus                 = (await import('../../core/EventBus.js')).default;
const { OrderService }         = await import('../../systems/OrderService.js');
const { MovementOrderSystem }  = await import('../../systems/MovementOrderSystem.js');
const { canLaunchFromCurrent } = await import('../../utils/SpaceportCheck.js');
const { returnJumpTransactional, jumpSucceeded } = await import('../../utils/ReturnJump.js');
const { FLEET_ACTIONS }        = await import('../../data/FleetActions.js');
const { FleetManagerOverlay }  = await import('../../ui/FleetManagerOverlay.js');
const IV                       = await import('../../ui/CommandInspectorView.js');
const { consoleRoles }         = await import('../../ui/ConsoleRolesLogic.js');
const L5                       = await import('../../ui/ShipPanelHudLogic.js');
const { WarpRouteSystem }      = await import('../../systems/WarpRouteSystem.js');
const { WARP_ROUTE_REASONS }   = await import('../../utils/WarpRoutePlanner.js');
const { t }                    = await import('../../i18n/i18n.js');
const debugLog                 = (await import('../../core/DebugLog.js')).default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n--- ' + s + ' ---');

// ── Świat: statek MEDIUM (wymaga portu) w obcym układzie, przy ciele BEZ kolonii ──────────────
const vessels = new Map();
let warpOk = false, warpCalls = 0, dispatchCalls = 0;
let startReturnCalls = 0, cancelledMissions = [], activeMissions = [];

function makeVessel(over = {}) {
  return {
    id: 'v_1', name: 'Sonda', shipId: 'hull_medium',
    systemId: 'sys_061',            // obcy układ
    colonyId: 'planet_home',        // dom w sys_home
    status: 'on_mission',
    position: { state: 'orbiting', dockedAt: 'planet_foreign', x: 400, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'planet_foreign' },
    fuel: { current: 60, max: 60, consumption: 1 },
    warpFuel: { current: 0, max: 4, consumption: 0.5 },   // pusty bak warp = powód kliknięcia
    speedAU: 1, modules: [], cargo: {}, missionLog: [],
    pendingOrder: null, warpRoute: null, movementOrder: null, serviceState: 'active',
    ...over,
  };
}

const vesselManager = {
  getVessel: id => vessels.get(id),
  getAllVessels: () => [...vessels.values()],
  _findEntity: id => (id === 'planet_home' ? { id, systemId: 'sys_home', x: 0, y: 0 } : null),
  _findBodyNearPoint: () => null,
  _predictPosition: () => null,
  _calcRoute: (sx, sy, tx, ty) => ({ totalDist: Math.hypot(tx - sx, ty - sy), waypoints: [] }),
  isImmobilized: () => false,
  startReturn: () => { startReturnCalls++; return true; },
  // odpowiednik prawdziwego: ląduje statek na orbicie z panelem exploration/orbiting_body
  abortForeignRecon: (id) => {
    const v = vessels.get(id);
    if (!v?.mission || v.mission.type !== 'foreign_recon') return false;
    v.position.state = 'orbiting'; v.position.dockedAt = v.mission.targetId;
    v.status = 'on_mission'; v.mission.type = 'exploration'; v.mission.phase = 'orbiting_body';
    return true;
  },
  dispatchInterstellar: (id, sys) => {
    dispatchCalls++;
    if (!warpOk) return false;
    const v = vessels.get(id);
    v.mission = { type: 'interstellar_jump', toSystemId: sys, phase: 'warp_transit' };
    v.status = 'on_mission'; v.position.state = 'in_transit'; v.position.dockedAt = null; v.systemId = null;
    return true;
  },
};

window.KOSMOS = {
  timeSystem: { gameTime: 100 },
  galaxyData: { systems: [{ id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0 }, { id: 'sys_061', name: 'Obcy', x: 6, y: 0, z: 0 }] },
  colonyManager: { getColony: () => null, hasColony: () => false, activePlanetId: 'planet_home' },
  stationSystem: { getStation: () => null, getStationsAt: () => [] },
  starSystemManager: { getSystem: () => ({ starEntityId: 'star_1' }) },
  missionSystem: { getActive: () => activeMissions, cancelMission: id => cancelledMissions.push(id) },
  techSystem: { isResearched: () => true, getShipSpeedMultiplier: () => 1 },
  warpRouteSystem: {
    // Jak prawdziwy WarpRouteSystem: planer odmawia przy pustym baku, a przy zgodzie
    // deleguje do dispatchInterstellar (to ON mutuje stan statku).
    beginJourney: (vid, sid) => {
      warpCalls++;
      if (!warpOk) return { ok: false, reason: WARP_ROUTE_REASONS.INSUFFICIENT_FUEL };
      return vesselManager.dispatchInterstellar(vid, sid) ? { ok: true } : { ok: false, reason: 'dispatch_failed' };
    },
  },
  vesselManager,
};
const mos = new MovementOrderSystem(vesselManager);
window.KOSMOS.movementOrderSystem = mos;
const os = new OrderService();
window.KOSMOS.orderService = os;

function reset() {
  vessels.clear(); mos._byVessel.clear();
  warpOk = false; warpCalls = 0; dispatchCalls = 0;
  startReturnCalls = 0; cancelledMissions = []; activeMissions = [];
}

/** Czy statek NADAL przyjmuje rozkaz ruchu? (mierzone na KLONIE — issueOrder mutuje stan). */
function stillOrderable(v) {
  const clone = JSON.parse(JSON.stringify(v)); clone.id = 'v_probe';
  vessels.set('v_probe', clone);
  const r = mos.issueOrder('v_probe', { type: 'moveToPoint', targetPoint: { x: 900, y: 300 } });
  vessels.delete('v_probe'); mos._byVessel.delete('v_probe');
  return r;
}
const snapOf = v => ({ st: v.position.state, dk: v.position.dockedAt, status: v.status, mt: v.mission?.type ?? null });
const same = (a, b) => a.st === b.st && a.dk === b.dk && a.status === b.status && a.mt === b.mt;

// ── T1 — ORBITING + odmowa skoku (OrderService, ścieżka rejestru floty) ───────────────────────
header('T1 orbiting + odmowa → brak brykowania (OrderService)');
reset(); vessels.set('v_1', makeVessel());
const v1 = vessels.get('v_1');
const before1 = snapOf(v1);
ok(canLaunchFromCurrent(v1).ok && stillOrderable(v1).ok, 'stan wyjściowy: statek mobilny (port ok, rozkaz ok)');
const r1 = os.issueReturn('v_1');
ok(r1.ok === false && r1.reason === WARP_ROUTE_REASONS.INSUFFICIENT_FUEL, 'issueReturn zwraca odmowę Z POWODEM (nie połyka jej)');
ok(warpCalls === 1, 'skok był realnie próbowany (beginJourney 1x)');
ok(same(snapOf(v1), before1), 'stan statku CO DO POLA bez zmian po odmowie');
ok(v1.position.state !== 'docked', 'statek NIE jest fałszywie zadokowany');
ok(canLaunchFromCurrent(v1).ok === true, 'canLaunchFromCurrent nadal ok (był no_spaceport_at_origin — to był brick)');
ok(stillOrderable(v1).ok === true, 'MovementOrderSystem nadal przyjmuje moveToPoint');

// ── T2 — ten sam pomiar na bliźniaku FleetActions ─────────────────────────────────────────────
header('T2 orbiting + odmowa → brak brykowania (FleetActions.return_home)');
reset(); vessels.set('v_1', makeVessel());
const v2 = vessels.get('v_1');
const before2 = snapOf(v2);
FLEET_ACTIONS.return_home.execute(v2, { vesselManager, missionSystem: window.KOSMOS.missionSystem });
ok(dispatchCalls === 1, 'skok próbowany przez dispatchInterstellar');
ok(same(snapOf(v2), before2), 'stan bez zmian po odmowie');
ok(canLaunchFromCurrent(v2).ok === true && stillOrderable(v2).ok === true, 'statek nadal mobilny i orderowalny');

// ── T3 — IN_TRANSIT: przygotowanie do skoku musi się COFNĄĆ ───────────────────────────────────
header('T3 in_transit + odmowa → rollback do lotu');
reset();
vessels.set('v_1', makeVessel({
  position: { state: 'in_transit', dockedAt: null, x: 200, y: 0 },
  mission: { type: 'move_to_point', targetId: 'planet_foreign', arrivalYear: 140 },
}));
const v3 = vessels.get('v_1');
const before3 = snapOf(v3);
const r3 = os.issueReturn('v_1');
ok(r3.ok === false, 'odmowa skoku');
ok(same(snapOf(v3), before3), 'statek WRACA do lotu (state/dockedAt/status/mission jak przed)');
ok(v3.mission?.type === 'move_to_point', 'misja w toku NIE została skasowana');

// ── T4 — SUKCES jest no-opem względem starego kodu ────────────────────────────────────────────
header('T4 sukces → dispatch nadpisuje wszystko (bez zmian względem starego zachowania)');
reset(); warpOk = true; vessels.set('v_1', makeVessel());
const v4 = vessels.get('v_1');
const r4 = os.issueReturn('v_1');
ok(r4.ok === true, 'skok przyjęty');
ok(v4.position.state === 'in_transit' && v4.position.dockedAt === null, 'stan = w tranzycie (jak dawniej)');
ok(v4.status === 'on_mission' && v4.mission?.type === 'interstellar_jump', 'status/misja z dispatchInterstellar');
reset(); warpOk = true;
vessels.set('v_1', makeVessel({
  position: { state: 'in_transit', dockedAt: null, x: 200, y: 0 },
  mission: { type: 'move_to_point', targetId: 'planet_foreign' },
}));
const v4b = vessels.get('v_1');
os.issueReturn('v_1');
ok(v4b.mission?.type === 'interstellar_jump' && v4b.position.state === 'in_transit',
   'sukces ze stanu in_transit nie jest cofany');

// ── T4b — composite (warp→dostawa) NIE ginie po odmowie skoku ─────────────────────────────────
header('T4b pendingOrder — odmowa skoku nie kasuje zakolejkowanej dostawy');
reset();
const chain = { kind: 'transport', targetId: 'planet_b', targetSystemId: 'sys_home', stage: 'awaiting_warp' };
vessels.set('v_1', makeVessel({ pendingOrder: chain }));
const v4c = vessels.get('v_1');
os.issueReturn('v_1');
ok(v4c.pendingOrder === chain, 'odmowa → composite gracza przywrócony (nie znika po cichu)');
reset(); warpOk = true;
vessels.set('v_1', makeVessel({ pendingOrder: { ...chain } }));
const v4d = vessels.get('v_1');
os.issueReturn('v_1');
ok(v4d.pendingOrder === null, 'sukces → composite skasowany (statek leci gdzie indziej)');

// ── T5 — abortForeignRecon POZA transakcją (świadomie) ────────────────────────────────────────
header('T5 foreign_recon + odmowa → statek ląduje sprawny, nie wraca do rekonu');
reset();
vessels.set('v_1', makeVessel({
  position: { state: 'in_transit', dockedAt: null, x: 300, y: 0 },
  mission: { type: 'foreign_recon', phase: 'travel', targetId: 'planet_foreign' },
}));
const v5 = vessels.get('v_1');
os.issueReturn('v_1');
ok(v5.mission?.type === 'exploration' && v5.mission?.phase === 'orbiting_body',
   'rekon przerwany NA STAŁE (panel obcego układu wraca w pełni)');
ok(v5.position.state === 'orbiting', 'statek na orbicie, nie w fałszywym doku');
ok(canLaunchFromCurrent(v5).ok === true && stillOrderable(v5).ok === true, 'w pełni sprawny mimo odmowy skoku');

// ── T6 — helper: tabela prawdy ────────────────────────────────────────────────────────────────
header('T6 returnJumpTransactional — tabela prawdy');
const mk = () => ({ status: 'on_mission', mission: { type: 'exploration' },
  position: { state: 'in_transit', dockedAt: null } });
ok(jumpSucceeded(true) && jumpSucceeded({ ok: true }), 'sukces: true oraz {ok:true}');
ok(!jumpSucceeded(false) && !jumpSucceeded({ ok: false }) && !jumpSucceeded(undefined) && !jumpSucceeded(null),
   'odmowa: false / {ok:false} / undefined / null');
const a6 = mk(); returnJumpTransactional(a6, () => false);
ok(a6.position.state === 'in_transit' && a6.mission?.type === 'exploration', 'odmowa → rollback');
const b6 = mk(); returnJumpTransactional(b6, () => { b6.position.state = 'jumped'; return true; });
ok(b6.position.state === 'jumped' && b6.mission === null, 'sukces → BEZ rollbacku (skok nadpisał stan)');
const c6 = mk(); let threw = false;
try { returnJumpTransactional(c6, () => { throw new Error('boom'); }); } catch { threw = true; }
ok(threw && c6.position.state === 'in_transit' && c6.mission?.type === 'exploration',
   'wyjątek → rollback i wyjątek leci dalej');
let called = 0; returnJumpTransactional(null, () => { called++; return true; });
ok(called === 1, 'brak statku → skok i tak wykonany (helper nigdy nie połyka rozkazu)');
const d6 = mk(); const notFn = returnJumpTransactional(d6, 'nie-funkcja');
ok(notFn === undefined && d6.position.state === 'in_transit', 'brak jumpFn → no-op');

// ── T7 — ścieżka lokalna (dom) nietknięta ─────────────────────────────────────────────────────
header('T7 powrót w układzie macierzystym — bez zmian');
reset(); vessels.set('v_1', makeVessel({ systemId: 'sys_home' }));
activeMissions = [{ id: 'exp_9', vesselId: 'v_1' }];
const r7 = os.issueReturn('v_1');
ok(r7.ok === true && cancelledMissions.length === 1 && warpCalls === 0, 'lokalny powrót anuluje misję, zero skoków');
reset(); vessels.set('v_1', makeVessel({ systemId: 'sys_home' }));
os.issueReturn('v_1');
ok(startReturnCalls === 1, 'brak ekspedycji → startReturn (jak dotąd)');

// ── T8 — FMO: rozkaz „Powrót do bazy" przez żywą strefę `action` ──────────────────────────────
// KZ-Command: jedyna konsumentka rozkazu powrotu w FMO to strefa `action` → `_handleAction` → `OrderService.issueReturn`
// → `_toastReturnFailed`. ⚠ Producenci strefy `action` (czipy inspektora konsoli i panelu statku HUD) biorą actionId
// z `getAvailableActions`, z której `return_home` wypadło w (a') — pin trzyma KONTRAKT konsumentki (fasada + transakcja
// + komunikat), nie osiągalność przycisku (tej nie ma — `return_actions_removed_smoke` A1).
header('T8 FleetManagerOverlay — rozkaz return_home przez żywą strefę `action` (fasada, transakcja, komunikat)');
const fmo = Object.create(FleetManagerOverlay.prototype);
const toasts = [];
const onToast = d => toasts.push(d);
EventBus.on('ui:toast', onToast);
{
  reset(); vessels.set('v_1', makeVessel());
  const v = vessels.get('v_1');
  const before = snapOf(v);
  toasts.length = 0;
  fmo._handleHit({ type: 'action', data: { actionId: 'return_home', vessel: v } });
  // Strefa idzie przez fasadę (OrderService.issueReturn → issueWarp), bo TYLKO ona niesie POWÓD odmowy —
  // dlatego mierzymy wywołanie planera, nie surowego dyspozytora.
  ok(warpCalls === 1, 'action/return_home: skok realnie próbowany PRZEZ FASADĘ (powód dostępny)');
  ok(dispatchCalls === 0, 'action/return_home: zero surowych wywołań dispatchInterstellar');
  ok(same(snapOf(v), before), 'action/return_home: stan bez zmian po odmowie');
  ok(canLaunchFromCurrent(v).ok === true && stillOrderable(v).ok === true, 'action/return_home: statek nadal mobilny');
  ok(toasts.length === 1, 'action/return_home: gracz DOSTAJE komunikat o odmowie');
}
// Dawne strefy panelu obcego układu — bez producenta (T12) i bez handlera: klik NIE omija transakcji żadną boczną drogą.
// Świadek: ten sam statek i ta sama atrapa wyżej SKACZĄ przez strefę `action` (warpCalls === 1).
for (const zoneType of ['interstellar_return', 'foreign_return', 'foreign_return_from_recon']) {
  reset(); vessels.set('v_1', makeVessel());
  const v = vessels.get('v_1');
  const before = snapOf(v);
  toasts.length = 0;
  fmo._handleHit({ type: zoneType, data: { vesselId: 'v_1', fromSystemId: 'sys_home' } });
  ok(warpCalls === 0 && dispatchCalls === 0 && toasts.length === 0 && same(snapOf(v), before),
     `${zoneType}: strefa usunięta — klik nie skacze żadną drogą (planer ${warpCalls}, dyspozytor ${dispatchCalls}, komunikaty ${toasts.length})`);
}

// ── T9 — komunikat: jeden słownik z _warpErrLabel, zero nowych kluczy ─────────────────────────
header('T9 komunikat o odmowie — reużycie słownika _warpErrLabel');
toasts.length = 0; fmo._toastReturnFailed(WARP_ROUTE_REASONS.INSUFFICIENT_FUEL);
ok(toasts.length === 1 && toasts[0].text.endsWith(t('fleet.warpErrFuel')),
   'powód trasy → szczegół DOKŁADNIE z _warpErrLabel (jeden słownik, nie drugi)');
toasts.length = 0; fmo._toastReturnFailed('in_transit');
ok(toasts[0].text.endsWith(fmo._warpErrLabel(null, { ok: false, reason: 'in_transit' })),
   'powód bramki idzie gałęzią bramki (nie trasy)');
toasts.length = 0; fmo._toastReturnFailed();
ok(toasts.length === 1 && !toasts[0].text.includes('—'), 'brak powodu (goły bool) → sam nagłówek');
toasts.length = 0; fmo._toastReturnFailed('no_active_mission');
ok(toasts.length === 1 && toasts[0].text.includes('—'), 'powód lokalny NIE dostaje etykiety warpowej');
EventBus.off('ui:toast', onToast);

// ── T10 — pin ŹRÓDŁOWY: nigdzie poza dokowaniem nie fałszujemy doku ───────────────────────────
header('T10 pin źródłowy — koniec fałszywego doku przed skokiem');
const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const codeOf = f => stripComments(readFileSync(new URL(f, import.meta.url), 'utf8'));
const FAKE_DOCK = /position\s*\.\s*state\s*=\s*'docked'/g;
const SITES = [
  ['OrderService',        '../../systems/OrderService.js'],
  ['FleetActions',        '../../data/FleetActions.js'],
  ['FleetManagerOverlay', '../../ui/FleetManagerOverlay.js'],
];
for (const [label, file] of SITES) {
  ok((codeOf(file).match(FAKE_DOCK) ?? []).length === 0, `${label}: zero zapisów position.state='docked'`);
}
// KONTROLA PINU — regex działa: prawdziwe dokowanie w VesselManager nadal go wyzwala.
const vmHits = (codeOf('../../systems/VesselManager.js').match(FAKE_DOCK) ?? []).length;
ok(vmHits === 2, `kontrola pinu: regex ŻYJE — dwie PRAWDZIWE ścieżki dokowania w VesselManager `
   + `(dockAtColony + dockAtStation) nadal go wyzwalają (trafień=${vmHits})`);
// KONTROLA PINU — transakcję wołają OBA silnikowe wejścia rozkazu; FMO (KZ-Command: wrapper `_dispatchReturnJump` usunięty)
// deleguje do fasady `OrderService.issueReturn` i nie ma własnego, surowego skoku.
for (const [label, file] of SITES.slice(0, 2)) {
  ok(/returnJumpTransactional\s*\(/.test(codeOf(file)), `${label}: skok idzie przez transakcję`);
}
{
  const fmoCode = codeOf('../../ui/FleetManagerOverlay.js');
  ok(/orderService\.issueReturn\(vessel\.id\)/.test(fmoCode) && !/dispatchInterstellar\s*\(/.test(fmoCode)
     && !/_dispatchReturnJump/.test(fmoCode) && !/returnJumpTransactional/.test(fmoCode),
     'FleetManagerOverlay: powrót deleguje do fasady (`orderService.issueReturn`) — zero surowego dispatchInterstellar i własnej kopii transakcji');
}

// ── T11 — PRAWDZIWY planer: gracz dostaje POWÓD, nie samo „nie można" ─────────────────────────
// Ten blok istnieje, bo live-gate zobaczył „Cannot issue order" BEZ powodu. Przyczyną nie był
// piąty producent (patrz T12), tylko to, że te przyciski wołały `dispatchInterstellar` — a ten
// zwraca GOŁY BOOL, więc powodu po prostu NIE BYŁO. Tu jedzie prawdziwy WarpRouteSystem.
header('T11 prawdziwy planer — komunikat niesie powód (pusty bak warp)');
const realWrs = new WarpRouteSystem(vesselManager);
const savedWrs = window.KOSMOS.warpRouteSystem;
window.KOSMOS.warpRouteSystem = realWrs;
const journal = [];
window.KOSMOS.eventLogSystem = { push: e => journal.push(e) };
const fmo11 = Object.create(FleetManagerOverlay.prototype);
const toasts11 = [];
const onToast11 = d => toasts11.push(d);
EventBus.on('ui:toast', onToast11);
const EXPECTED = `${t('fleet.warpOrderFailed')} — ${t('fleet.warpErrFuel')}`;
// KZ-Command: rozkaz jedzie żywą strefą `action` (dawne strefy powrotu usunięte — T8). Dwa kształty misji przy obcym ciele:
// panel przylotu (interstellar_jump / in_system) i orbita ciała (exploration / orbiting_body).
for (const [label, mission] of [
  ['przylot', { type: 'interstellar_jump', phase: 'in_system', toSystemId: 'sys_061', fromSystemId: 'sys_home' }],
  ['orbita ciała', null],
]) {
  reset(); vessels.set('v_1', mission ? makeVessel({ mission }) : makeVessel());   // warpFuel.current = 0, trasa 6 ly istnieje
  const v = vessels.get('v_1');
  const before = snapOf(v);
  toasts11.length = 0; journal.length = 0;
  fmo11._handleHit({ type: 'action', data: { actionId: 'return_home', vessel: v } });
  ok(toasts11.length === 1 && toasts11[0].text === EXPECTED,
     `${label}: komunikat niesie POWÓD (dostał: "${toasts11[0]?.text ?? 'BRAK'}")`);
  ok(same(snapOf(v), before), `${label}: stan bez zmian (transakcja trzyma)`);
  ok(journal.length === 1 && journal[0].channel === 'fleet' && journal[0].severity === 'warn',
     `${label}: TRWAŁY ślad w Dzienniku, kanał floty (toast jest ulotny)`);
  ok(v.warpRoute == null, `${label}: planer nie zostawia niedokończonej trasy`);
}
// KONTROLA — z paliwem ten sam rozkaz MUSI wystartować (inaczej pinujemy zepsuty przycisk).
reset(); vessels.set('v_1', makeVessel({ warpFuel: { current: 4, max: 4, consumption: 0.5 } }));
warpOk = true; toasts11.length = 0;
const v11 = vessels.get('v_1');
fmo11._handleHit({ type: 'action', data: { actionId: 'return_home', vessel: v11 } });
ok(toasts11.length === 0 && v11.mission?.type === 'interstellar_jump',
   'kontrola: z pełnym bakiem powrót WYCHODZI (zero komunikatu o odmowie)');
EventBus.off('ui:toast', onToast11);
window.KOSMOS.warpRouteSystem = savedWrs;
delete window.KOSMOS.eventLogSystem;

// ── T12 — pin RENDERU: panel przylotu nie ma własnego, piątego przycisku ─────────────────────
// Live-gate rozsądnie podejrzewał piątą implementację. Pin trzyma odpowiedź na ŻYWYCH powierzchniach panelu statku
// (KZ-Command: dawny `_drawRight` usunięty): inspektor konsoli Dowództwa (`CommandInspectorView.drawInspector`, fakty
// `_inspectorShipFacts` / `_inspectorShipInfo`) i panel statku HUD (`ShipPanelHudLogic.buildShipPanelModel`). Ekran przylotu
// (linia „przybył do" + „Przełącz widok") nie wystawia ŻADNEJ strefy powrotu; trzy dawne typy stref powrotu nie mają
// producenta nigdzie w `src/`.
header('T12 pin renderu — żywe powierzchnie panelu statku nie wystawiają powrotu');
function renderPanel(mission) {
  reset(); vessels.set('v_1', makeVessel({ mission }));
  const o = new FleetManagerOverlay();
  o._selectedVesselId = 'v_1'; o._hitZones = []; o._cmdDisabled = []; o._cmdTip = null;
  const drawn = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? (s2) => ({ width: String(s2).length * 6 })
    : k === 'fillText' ? (txt) => drawn.push(String(txt))
    : k === 'getTransform' ? () => ({ a: 1, d: 1 })
    : (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') ? () => ({ addColorStop() {} })
    : () => {}), set: () => true });
  IV.drawInspector(o, ctx, { x: 900, y: 60, w: 294, h: 4000 }, consoleRoles(),
    { vMgr: vesselManager, ms: window.KOSMOS.missionSystem, colMgr: window.KOSMOS.colonyManager, activePid: 'planet_home' });
  const m = L5.buildShipPanelModel(vessels.get('v_1'), { K: window.KOSMOS, fmo: o });
  return { drawn, zones: o._hitZones.map(z => z.type), hud: L5.modelZones(m).map(z => z.type), hudInfo: (m?.info ?? []).map(i => i.text) };
}
const arrivedTxt = t('fleet.arrivedAt', 'Obcy');
const arrival = renderPanel({ type: 'interstellar_jump', phase: 'in_system', toSystemId: 'sys_061', fromSystemId: 'sys_home', targetName: 'Obcy' });
ok(arrival.drawn.some(x => x.includes(arrivedTxt)) && arrival.hudInfo.some(x => x.includes(arrivedTxt)),
   'ekran przylotu faktycznie się rysuje (linia „przybył do" w inspektorze konsoli i w panelu statku HUD)');
ok(arrival.zones.includes('cluster_switch') && arrival.hud.includes('cluster_switch'),
   'ma „Switch view" na obu powierzchniach (to ten ekran z opisu live-gate)');
const arrivalReturns = [...arrival.zones, ...arrival.hud].filter(z => /return/i.test(z));
// ⚠ ODWRÓCONE ŚWIADOMIE w (a', Finding 145). Pin mierzył PRZEDROZBIÓRKOWY kontrakt renderu
//   („który ekran wystawia który przycisk powrotu") i kosztował jedną rundę live-gate'u, bo bez
//   niego brak przycisku mylił się z brakiem rysowania. Po (a') przycisków NIE MA — intencja
//   pinu (żadnego PIĄTEGO producenta) żyje dalej w `return_actions_removed_smoke` A2, a tutaj
//   zostaje jako STRAŻNIK REGRESJI: gdyby ktoś przywrócił przycisk, ten pin padnie.
ok(arrival.zones.length > 3 && arrival.hud.length > 3 && arrivalReturns.length === 0,
   `ekran przylotu NIE ma przycisku powrotu na żadnej powierzchni (stref: konsola ${arrival.zones.length}, HUD ${arrival.hud.length}; powrotu: ${JSON.stringify(arrivalReturns)})`);
const orbitingBody = renderPanel({ type: 'exploration', phase: 'orbiting_body', targetId: 'planet_foreign', originId: 'sys_home' });
const obReturns = [...orbitingBody.zones, ...orbitingBody.hud].filter(z => /return/i.test(z));
ok(orbitingBody.zones.includes('action') && orbitingBody.hud.length > 3 && obReturns.length === 0,
   `ekran orbity obcego ciala NIE ma przycisku powrotu — świadek: lista rozkazów (action) narysowana (stref: konsola ${orbitingBody.zones.length} ${JSON.stringify(orbitingBody.zones)}, HUD ${orbitingBody.hud.length}; powrotu: ${JSON.stringify(obReturns)})`);
ok(!orbitingBody.zones.includes('cluster_switch') && !orbitingBody.hud.includes('cluster_switch'),
   'ekran orbity NIE ma „Switch view" (to dwa różne ekrany)');
// Producent w całym `src/` (kod bez komentarzy, bez `src/testing/`): napis typu strefy nie występuje nigdzie.
{
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) { if (n !== 'testing' && n !== 'lib') walk(f); } else if (n.endsWith('.js')) files.push(f); } };
  walk(root);
  const code = files.map(f => stripComments(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'))).join('\n');
  const hits = ['interstellar_return', 'foreign_return', 'foreign_return_from_recon'].filter(z => code.includes(`'${z}'`));
  ok(files.length > 100 && code.includes("'cluster_switch'") && hits.length === 0,
     `typy stref powrotu bez producenta i bez handlera w całym src/ (plików ${files.length}; świadek \'cluster_switch\' obecny; trafienia: ${JSON.stringify(hits)})`);
}

// ── T13 — cisza w debugLog jest Z KONSTRUKCJI (mierzone, nie wyczytane) ───────────────────────
// Live-gate wywnioskował z pustego `debugLog.tail()`, że rozkaz nie przeszedł żadną ze znanych
// ścieżek. Ten pin mierzy, że cisza NIE ROZRÓŻNIA ścieżek: audyt AI nie zna ANI JEDNEGO zdarzenia
// floty, więc milczy tak samo dla ścieżki naprawionej, jak i dla nienaprawionej.
header('T13 debugLog — cisza po odmowie jest z konstrukcji');
debugLog.clear();
for (const ev of ['vessel:orderIssued', 'vessel:orderBlocked', 'vessel:launched',
                  'interstellar:departed', 'warpRoute:started', 'warpRoute:aborted', 'ui:toast']) {
  EventBus.emit(ev, { vesselId: 'v_1' });
}
ok(debugLog.size() === 0, 'zdarzenia floty NIE trafiają do audytu AI (stąd sam year:0 w tail)');
EventBus.emit('battle:resolved', { warId: 'w_probe' });   // KONTROLA PINU — instrument żyje
ok(debugLog.size() === 1, 'kontrola pinu: śledzone zdarzenie (battle:resolved) JEST zapisywane');
debugLog.clear();

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
