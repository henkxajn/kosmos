// Keeper: ARC GALAXY G3-B — skok z galaktyki w UI (logika, bez pinów na stałych rysunku; protokół lekki F8).
// Uruchom: node src/testing/smoke/galaxy_warp_ui_smoke.mjs
//
// T1  menu gwiazdy wg zaznaczenia: brak / statek / flota / mieszane — prawdziwe `RightClickMenu.show` na atrapie DOM
// T2  rozkaz: `issueWarp` per statek, komunikat kształtu D-E2, odmowa też w Dzienniku; klik pozycji menu
// T3  podgląd trasy tylko z zaznaczeniem: model, prawdziwa podwarstwa tras, powód w rozwinięciu prawdziwej podwarstwy etykiet
// T4  picker [ Wyślij ▼ ]: wiersze, okno ≤ 6 + kółko, Esc / klik poza zamyka, klik wiersza = rozkaz; prawdziwa podwarstwa
// T5  bramka mgły na nazwach: menu, nagłówek pickera, wiersz pickera
// T6  droga do domu z obcej orbity przez menu gwiazdy (następca `return_actions_removed` A3, gdy Stratcom zniknie w G5)
// T7  wpięcie PPM (`_handleTacticalRightClick` skompilowane ze źródła) i Esc (kolejność w źródle): GameScene nie importuje się pod node
// T8  KONTROLA: flaga OFF — menu galaktyki, podgląd, picker i przycisk jak przed krokiem
// T9  po G3 (F4): Esc zdejmuje zbiór przed wyjściem z trybu; pozycja menu kilku statków i rozkaz z odmową nazwaną. Pin zachowania, które
//     już działało (zmierzone przed zmianą) — na kodzie sprzed poprawek też zielony
//
// Świat: prawdziwe `VesselManager.dispatchInterstellar`, `WarpRouteSystem`, `OrderService`, `GalaxyModeController`.

import '../headless/env.js';           // MUSI być pierwszy (localStorage dla i18n, atrapa DOM menu)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import EventBus from '../../core/EventBus.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { t, tIn, setLocale, getLocale } from '../../i18n/i18n.js';
import { WarpRouteSystem } from '../../systems/WarpRouteSystem.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { OrderService } from '../../systems/OrderService.js';
import { GalaxyModeController } from '../../ui/GalaxyModeController.js';
import { RightClickMenu } from '../../ui/RightClickMenu.js';
import { HudGalaxyRouteLayer } from '../../ui/HudGalaxyRouteLayer.js';
import { HudGalaxyLabelLayer } from '../../ui/HudGalaxyLabelLayer.js';
import { HudGalaxySendPickerLayer } from '../../ui/HudGalaxySendPickerLayer.js';
import { galaxyPinButtons, runGalaxyPinAction } from '../../ui/GalaxyChromeLogic.js';
import {
  galaxyStarMenuEntries, runGalaxyWarpOrder, warpHoverModel, warpMenuOption, refusalText, warpSelection,
  sendPickerRows, sendPickerWindow, sendPickerRowLines, sendPickerModel, sendPickerBox, SEND_PICKER_MAX_ROWS,
} from '../../ui/GalaxyWarpLogic.js';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label); } };
const header = (s) => console.log('\n' + s);
const HERE = dirname(fileURLToPath(import.meta.url));
const call = (fn) => { try { return fn(); } catch (e) { return `WYJĄTEK: ${e.message}`; } };

// Galaktyka: oś X, skok ≤ 10 LY. C / D nieznane, FAR poza zasięgiem każdego skoku.
const SYS = [
  { id: 'sys_home', name: 'Dom',   x: 0,   y: 0, z: 0, explored: true, isHome: true },
  { id: 'B',        name: 'Beta',  x: 5,   y: 0, z: 0, explored: true },
  { id: 'C',        name: 'Cygni', x: 10,  y: 0, z: 0, explored: false },
  { id: 'D',        name: 'Deneb', x: 15,  y: 0, z: 0, explored: false },
  { id: 'FAR',      name: 'Odlegly', x: 200, y: 0, z: 0, explored: false },
];
const scans = {};
const selection = { lead: null, ids: [], fleet: null };
const logs = [];
const vm = Object.create(VesselManager.prototype);
vm._vessels = new Map();
const K = {
  civMode: true,
  galaxyData: { systems: SYS },
  timeSystem: { gameTime: 0 },
  eventLogSystem: { push: (e) => logs.push(e) },
  observatorySystem: { getSystemScanResult: (id) => scans[id] ?? null, getActiveSystemScans: () => [], getMaxObservatoryLevel: () => 0 },
  intelSystem: { isAtLeast: () => false },
  uiManager: {
    getSelectedVesselId: () => selection.lead, getSelectedVesselIds: () => [...selection.ids], getSelectedFleetId: () => selection.fleet,
    _outlinerState: { groundUnits: [] },
  },
  vesselManager: vm,
};
window.KOSMOS = K;
K.warpRouteSystem = new WarpRouteSystem(vm);
K.orderService = new OrderService();
GAME_CONFIG.FEATURES.galaxyWarp = true;
GAME_CONFIG.FEATURES.m3OrdersInteractive = true;

let seq = 0;
function mk(over = {}) {
  const id = `v_${++seq}`;
  const v = {
    id, name: `Ship${seq}`, shipId: 'hull_frigate', isWreck: false, systemId: 'sys_home', status: 'idle',
    position: { x: 0, y: 0, state: 'docked', dockedAt: 'home_planet' },
    modules: ['engine_warp', 'warp_tank'],
    warpFuel: { current: 10, max: 10, consumption: 0.5, fuelType: 'warp_cores' },
    unpaidYears: 0, mission: null, warpRoute: null, missionLog: [],
    ...over,
  };
  vm._vessels.set(id, v);
  return v;
}
const NO_WARP = { warpFuel: { current: 0, max: 0, consumption: 0 } };
const select = (ships = [], fleet = null) => {
  selection.lead = ships[0]?.id ?? null;
  selection.ids = ships.map((s) => s.id);
  selection.fleet = fleet;
};
const toasts = [];
EventBus.on('ui:toast', (e) => toasts.push(e.text));
const drain = () => { const a = [...toasts]; toasts.length = 0; logs.length = 0; return a; };

// ── T1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T1 menu gwiazdy wg zaznaczenia');
{
  const rcm = new RightClickMenu();
  // Prawdziwe `show` na atrapie DOM: tekst pozycji i pod-elementy.
  const openMenu = (id) => {
    rcm.show({ type: 'galaxyStar', systemId: id }, { x: 10, y: 10 });
    const el = rcm._element;
    const items = el ? [...(el.children ?? el.childNodes ?? [])] : [];
    if (el) { el.remove ??= () => {}; }
    return { items, close: () => rcm.hide() };
  };

  select([]);
  ok(call(() => galaxyStarMenuEntries('B')).length === 0, 'brak zaznaczenia: bez pozycji');
  const none = openMenu('B');
  ok(none.items.length === 0 && rcm.isOpen?.() !== true, 'brak zaznaczenia: menu się nie otwiera');

  const ship = mk();
  select([ship]);
  const shipE = galaxyStarMenuEntries('B');
  const shipO = warpMenuOption({ vessel: ship, targetSystemId: 'B', systems: SYS, canOrder: (v) => K.warpRouteSystem.canOrder(v) });
  ok(shipE.length === 1 && shipE[0].enabled === true && shipE[0].disabledReason === null, 'statek: jedna pozycja, aktywna');
  ok(shipE[0].labelPL === shipO.labelPL && shipE[0].labelEN === shipO.labelEN, 'statek: etykieta z `warpMenuOption` (skoki, ETA, paliwo)');
  ok(shipE[0].action === 'issueGalaxyWarp' && shipE[0].targetSystemId === 'B' && shipE[0].vesselIds.join() === ship.id, 'statek: cel i statek w pozycji');
  const shipM = openMenu('B');
  ok(shipM.items.length === 1 && shipM.items[0].textContent.includes(shipE[0].labelPL.slice(0, 8)), 'prawdziwy `show`: jedna pozycja z etykietą modelu');
  shipM.close();

  const res = mk({ serviceState: 'stored' });
  select([res]);
  const resE = galaxyStarMenuEntries('B')[0];
  ok(resE?.enabled === false && resE?.disabledReason === refusalText('vessel_in_reserve') && resE?.reasonIsText === true, 'rezerwa: wyłączona z powodem');
  const resM = openMenu('B');
  const why = [...(resM.items[0]?.children ?? [])].find((c) => c.className === 'kosmos-rcm-reason');
  ok(why?.textContent === refusalText('vessel_in_reserve'), 'prawdziwy `show`: powód widoczny w pozycji, nie tylko w podpowiedzi');
  resM.close();

  const noWarp = mk(NO_WARP);
  select([noWarp]);
  ok(galaxyStarMenuEntries('B')[0]?.disabledReason === t('fleet.warpErrConfig'), 'statek bez napędu: wyłączona z powodem');

  // `fleet.warpErrNoRoute` zawiera „zasięg” / „range” — dawny regex renderera podmieniał taki tekst na „poza zasięgiem”.
  select([ship]);
  const farE = galaxyStarMenuEntries('FAR')[0];
  ok(farE?.enabled === false && farE?.disabledReason === t('fleet.warpErrNoRoute'), 'brak trasy: wyłączona z powodem');
  const tips = [];
  const realCreate = document.createElement;
  document.createElement = (tag) => {
    const el = realCreate.call(document, tag);
    const set = el.setAttribute?.bind(el);
    el.setAttribute = (k, v) => { if (k === 'data-tooltip') tips.push(v); set?.(k, v); };
    return el;
  };
  const farM = openMenu('FAR');
  document.createElement = realCreate;
  ok(tips.length === 1 && tips[0] === t('fleet.warpErrNoRoute'), `podpowiedź: powód wprost, bez regexu „zasięgu” (${tips.join()})`);
  farM.close();

  // G4 — przy `fleetWarp` ON wpis floty jest żywy (`galaxy_fleet_warp_ui_smoke` T1); zaślepka G3 żyje przy OFF i tam zostaje pin.
  GAME_CONFIG.FEATURES.fleetWarp = false;
  select([], 'fleet_1');
  const fleetE = galaxyStarMenuEntries('B')[0];
  ok(fleetE?.enabled === false && fleetE?.disabledReason === t('galaxyMenu.fleetWaitsG4') && fleetE?.vesselIds.length === 0, 'flota: wyłączona z powodem „flota — G4”');
  ok(fleetE?.labelPL === 'Skok do Beta' && fleetE?.labelEN === 'Warp to Beta', 'flota: sam tytuł');
  select([ship], 'fleet_1');
  ok(galaxyStarMenuEntries('B')[0]?.disabledReason === t('galaxyMenu.fleetWaitsG4'), 'mieszane (flota + luźny statek): flota ma pierwszeństwo jak w menu mapy');
  GAME_CONFIG.FEATURES.fleetWarp = true;

  const a = mk(), b = mk(NO_WARP);
  select([a, b]);
  const mixE = galaxyStarMenuEntries('B');
  ok(mixE.length === 1, 'mieszane (luźne statki): JEDNA pozycja, nie po jednej na statek');
  ok(mixE[0].enabled === true && mixE[0].labelPL === 'Skok do Beta' && mixE[0].vesselIds.join() === `${a.id},${b.id}`, 'mieszane: aktywna, gdy skoczy choć jeden; rozkaz obejmie wszystkich');
  select([b, res]);
  const deadE = galaxyStarMenuEntries('B')[0];
  ok(deadE?.enabled === false && deadE?.disabledReason === refusalText('not_warp_capable'), 'nikt nie skoczy: wyłączona z powodem lidera');

  const wreck = mk({ isWreck: true }), enemy = mk({ ownerEmpireId: 'emp_001' });
  select([wreck, enemy]);
  ok(galaxyStarMenuEntries('B').length === 0 && warpSelection(K).ships.length === 0, 'wrak i statek obcy to nie zaznaczenie do rozkazu');
}

// ── T2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T2 rozkaz i komunikat');
{
  const one = mk();
  drain();
  let r = runGalaxyWarpOrder({ vesselIds: [one.id], targetSystemId: 'B' });
  ok(r.moved === 1 && one.position.state === 'in_transit' && one.systemId === null, 'jeden statek: prawdziwy skok');
  ok(toasts.length === 1 && toasts[0] === t('fleet.warpOrderSent') && !logs.some((l) => l.severity === 'warn'), 'sukces: `fleet.warpOrderSent`, bez ostrzeżenia w Dzienniku');

  const stored = mk({ serviceState: 'stored' });
  drain();
  r = runGalaxyWarpOrder({ vesselIds: [stored.id], targetSystemId: 'B' });
  ok(r.moved === 0 && stored.position.state === 'docked', 'rezerwa: nikt nie leci');
  ok(toasts[0] === `${t('fleet.warpOrderFailed')} — ${refusalText('vessel_in_reserve')}`, 'odmowa jednego statku: nagłówek + powód');
  ok(logs.length === 1 && logs[0].channel === 'fleet' && logs[0].severity === 'warn' && logs[0].text === toasts[0], 'odmowa zostaje w Dzienniku (toast jest ulotny)');

  const p1 = mk(), p2 = mk({ ...NO_WARP, name: 'Barka' });
  drain();
  r = runGalaxyWarpOrder({ vesselIds: [p1.id, p2.id], targetSystemId: 'B' });
  ok(r.moved === 1 && r.total === 2 && p1.position.state === 'in_transit' && p2.position.state === 'docked', 'kilka statków: rozkaz per statek');
  const skipped = `Barka (${refusalText('not_warp_capable').replace(/^[^\p{L}\p{N}]+/u, '')})`;
  ok(toasts[0] === t('vessel.orderPartial', 1, 2, skipped), 'częściowo: kształt D-E2 (`vessel.orderPartial`) z nazwą i powodem bez ✗');

  const n1 = mk({ ...NO_WARP, name: 'N1' }), n2 = mk({ serviceState: 'stored', name: 'N2' });
  drain();
  r = runGalaxyWarpOrder({ vesselIds: [n1.id, n2.id], targetSystemId: 'B' });
  ok(r.moved === 0 && toasts[0].startsWith(t('vessel.orderNoneMoved', '').trimEnd()) && toasts[0].includes('N1') && toasts[0].includes('N2'), 'nikt: `vessel.orderNoneMoved` z oboma');

  const a1 = mk(), a2 = mk();
  drain();
  r = runGalaxyWarpOrder({ vesselIds: [a1.id, a2.id], targetSystemId: 'B' });
  ok(r.moved === 2 && toasts.length === 1 && toasts[0] === t('fleet.warpOrderSent'), 'wszyscy: jeden komunikat sukcesu');

  // Klik pozycji menu — prawdziwy `_handleOptionClick`.
  const rcm = new RightClickMenu();
  const c = mk();
  select([c]);
  const [entry] = galaxyStarMenuEntries('B');
  rcm._element = null;
  drain();
  rcm._handleOptionClick(entry, { type: 'galaxyStar', systemId: 'B' });
  ok(c.position.state === 'in_transit' && toasts[0] === t('fleet.warpOrderSent'), 'klik pozycji menu: rozkaz przez `issueWarp`');
}

// ── T3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T3 podgląd tylko z zaznaczeniem');
{
  const ship = mk({ warpFuel: { current: 3, max: 10, consumption: 0.5 } });   // na 6 LY: B tak, D (15 LY) nie
  select([]);
  ok(warpHoverModel('B') === null, 'bez zaznaczenia: brak modelu');
  select([], 'fleet_1');
  ok(warpHoverModel('B') === null, 'flota: brak modelu (G4)');
  select([ship], 'fleet_1');
  ok(warpHoverModel('B') === null, 'flota + luźny statek: dalej brak modelu');
  select([mk(NO_WARP)]);
  ok(warpHoverModel('B') === null, 'statek bez napędu: brak modelu');
  select([ship]);
  ok(warpHoverModel(null) === null, 'bez gwiazdy pod kursorem: brak modelu');
  ok(warpHoverModel('sys_home') === null, 'układ statku: brak modelu');
  const near = warpHoverModel('B');
  ok(near?.available === true && near.legs.length === 1 && near.legs[0].reachable === true && near.reason === null, 'w zasięgu: odcinek osiągalny');
  ok(near.polyline.length === 2 && near.hopPoints.map((h) => h.role).join() === 'origin,target', 'linia i punkty');
  const far = warpHoverModel('D');
  ok(far?.available === false && far.reason === 'insufficient_warp_fuel', 'poza bakiem: powód');
  ok(far.legs.length === 2 && far.legs[0].reachable === true && far.legs[1].reachable === false, 'poza bakiem: odcinki wg zasięgu');
  ok(warpHoverModel('D') === far, 'te same wejścia: jeden przebieg planera w klatce');
  ship.warpFuel.current = 9;
  ok(warpHoverModel('D')?.available === true, 'zmiana baku unieważnia pamięć');
  ship.warpFuel.current = 3;
  const res = mk({ serviceState: 'stored' });
  select([res]);
  const resM = warpHoverModel('B');
  ok(resM?.reason === 'vessel_in_reserve' && resM.legs.every((l) => l.reachable === false) && resM.polyline.length === 2, 'rezerwa: trasa widoczna, cała przygaszona');

  // Prawdziwa podwarstwa tras.
  const proj = { depth: () => 1, point: (x, y) => ({ x: 100 + x / 50, y: 100 + y / 50 }) };   // płyta: 200 j. świata / LY
  const hud = { key: null, hoverObjectKey() { return this.key; } };
  const K2 = K;
  K2.galaxyMode = { isActive: true };
  K2.threeRenderer = { getGalaxyAnchorLy: () => ({ x: 0, y: 0, z: 0 }) };
  const layer = new HudGalaxyRouteLayer(hud);
  const F = { K: K2, att: { layers: { routes: true } }, sel: {}, sim: 0, now: 0, W: 1000, H: 1000 };
  const pv = () => { layer.prepare(F); return layer.collect(F, proj).preview; };
  select([ship]);
  hud.key = null;
  ok(pv() === null, 'warstwa: bez najechania nic');
  hud.key = 'galaxy:D';
  const drawn = pv();
  ok(drawn?.legs.length === 2 && drawn.legs.map((l) => l.reachable).join() === 'true,false', 'warstwa: najechanie rysuje odcinki z rolą wg zasięgu');
  ok(drawn?.hops.length === 3, 'warstwa: punkty przeskoków');
  hud.key = 'galaxy:B';
  layer.prepare(F);
  const k1 = layer.prepare(F);
  hud.key = 'galaxy:D';
  ok(layer.prepare(F) !== k1, 'warstwa: zmiana gwiazdy zmienia klucz klatki');
  select([]);
  ok(pv() === null, 'warstwa: najechanie bez zaznaczenia — nic');

  // Prawdziwa podwarstwa etykiet: powód w rozwinięciu gwiazdy.
  const stars = SYS.map((s) => ({ id: s.id, x: s.x, y: 0, z: 0 }));
  K2.galaxyMode = { isActive: true, isFlying: false, selectedSystemId: null, diveTargetId: () => null, canEnter: () => false };
  K2.threeRenderer = { getGalaxyStarsWorld: () => stars, galaxyStarAt: () => 'D', _cameraController: null, _galaxyFadeT0: -1e9 };
  const L = new HudGalaxyLabelLayer({ ctx: null });
  const FL = { K: K2, att: { layers: { labels: true } }, pointer: { lx: 5, ly: 5, rawX: 5, rawY: 5, overUI: false }, now: 1000, sim: 0 };
  select([ship]);
  call(() => L.prepare(FL));
  ok(L._g2.p?.warpReason === refusalText('insufficient_warp_fuel'), 'etykiety: powód odmowy dla gwiazdy pod kursorem');
  select([]);
  call(() => L.prepare({ ...FL, now: 2000 }));
  ok(L._g2.p?.warpReason == null, 'etykiety: bez zaznaczenia bez powodu');
  // Przycisk [ Wyślij ▼ ] w przypięciu — prawdziwa ścieżka przypięcia, aktywny wyłącznie z flagą.
  K2.galaxyMode.selectedSystemId = 'B';
  const sendBtn = () => { call(() => L.prepare({ ...FL, now: 3000 })); return L._g2.p?.pin?.buttons?.find((b) => b.id === 'send') ?? null; };
  ok(sendBtn()?.enabled === true && sendBtn()?.reason === null, 'przypięcie: [ Wyślij ▼ ] aktywny z flagą');
  GAME_CONFIG.FEATURES.galaxyWarp = false;
  ok(sendBtn()?.enabled === false && sendBtn()?.reason === 'G3', 'przypięcie: bez flagi jak przed krokiem');
  GAME_CONFIG.FEATURES.galaxyWarp = true;
}

// ── T4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T4 picker [ Wyślij ▼ ]');
{
  const canOrder = (v) => K.warpRouteSystem.canOrder(v);
  // Świat pickera: same te statki.
  vm._vessels.clear();
  const d = mk({ name: 'Kurier' });
  const r0 = mk({ name: 'Magazyn', serviceState: 'stored' });
  const rows = sendPickerRows(vm.getAllVessels(), 'B', canOrder);
  ok(rows.map((x) => x.name).join() === 'Kurier,Magazyn', 'wiersze: zdolne pierwsze');
  const l0 = sendPickerRowLines(rows[0]), l1 = sendPickerRowLines(rows[1]);
  ok(rows[0].hull.length > 0 && l0.main.startsWith('Kurier · ') && l0.main.includes(rows[0].hull) && l0.main.endsWith(`${t('shipPicker.warp')} 10.0/10.0`), 'linia: nazwa · kadłub · paliwo');
  ok(l1.sub === refusalText('vessel_in_reserve'), 'odmówiony: powód w drugiej linii');
  ok(l0.sub === 'Dom', 'zdolny: położenie w drugiej linii');

  const many = Array.from({ length: 9 }, (_, i) => ({ vesselId: `x${i}` }));
  const w0 = sendPickerWindow(many, 0);
  ok(w0.rows.length === SEND_PICKER_MAX_ROWS && SEND_PICKER_MAX_ROWS === 6 && w0.maxScroll === 3, 'okno: ≤ 6 wierszy');
  ok(sendPickerWindow(many, 99).first === 3 && sendPickerWindow(many, -5).first === 0, 'okno: przewinięcie przycięte');
  ok(sendPickerWindow(many.slice(0, 2), 5).first === 0 && sendPickerWindow(many.slice(0, 2), 5).maxScroll === 0, 'mała lista: bez przewijania');

  const rect = { x: 0, y: 0, w: 500, h: 300 };
  const below = sendPickerBox({ anchor: { x: 10, y: 20, w: 30, h: 10 }, w: 100, h: 50, rect, gap: 3 });
  ok(below.y === 33 && below.x === 10, 'pudełko: pod przyciskiem');
  const above = sendPickerBox({ anchor: { x: 460, y: 280, w: 30, h: 10 }, w: 100, h: 50, rect, gap: 3 });
  ok(above.y === 227 && above.x === 400, 'pudełko: nad przyciskiem przy dole kadru, w poziomie w kadrze');

  const gm = new GalaxyModeController();
  gm._active = true;
  K.galaxyMode = gm;
  K.threeRenderer = { setGalaxySelected() {}, _cameraController: null };
  gm.select('B');
  const btn = galaxyPinButtons({ sendEnabled: true, t }).find((b) => b.id === 'send');
  ok(btn.enabled === true && btn.reason === null, 'przycisk aktywny z flagą kroku');
  ok(runGalaxyPinAction(btn, { systemId: 'B', K, t }) === 'send' && gm.sendPicker?.systemId === 'B', 'klik przycisku otwiera picker');
  runGalaxyPinAction(btn, { systemId: 'B', K, t });
  ok(gm.sendPicker === null, 'drugi klik zamyka');
  gm.toggleSendPicker('B');
  ok(gm.closeSendPicker() === true && gm.sendPicker === null && gm.closeSendPicker() === false, 'Esc: zamyka raz, kolejne przejście idzie dalej');
  gm.toggleSendPicker('B');
  gm.select('C');
  ok(gm.sendPicker === null, 'zmiana przypięcia zamyka');
  gm.select('B');
  gm.toggleSendPicker('B');
  gm.exit('debug');
  ok(gm.sendPicker === null, 'wyjście z trybu zamyka');
  gm._active = true;

  // Prawdziwa podwarstwa: klik poza, klik wiersza, kółko.
  const labels = { sendButtonZone: () => ({ x: 50, y: 50, w: 40, h: 12 }) };
  const hud = { ctx: null, _galaxySublayers: [labels], _pointer: null };
  const P = new HudGalaxySendPickerLayer(hud);
  const F = () => ({ K, now: 1e6, mapRect: { x: 0, y: 0, w: 1000, h: 800 }, pointer: hud._pointer, roles: {} });
  const frame = () => { const f = F(); P.prepare(f); return P.collect(f, {}); };
  ok(frame().count === 0 && P.handleClick(1, 1) === false, 'zamknięty: nic nie rysuje i nie łapie kliku');
  gm.toggleSendPicker('B');
  const c = frame();
  ok(c.count === 1 && c.rows.length === 2 && c.box.y > 62, 'otwarty: wiersze pod przyciskiem');
  ok(c.header === `${t('fleet.selectShipToSend')} → Beta`, 'nagłówek z nazwą celu');
  ok(P.coversPoint(c.box.x + 5, c.box.y + 5) === true && P.coversPoint(1, 1) === false, 'pudełko zakrywa swój prostokąt');
  ok(P.pinButtonAt(c.rows[0].x + 5, c.rows[0].y + 5) === 'sendRow' && P.pinButtonAt(c.rows[1].x + 5, c.rows[1].y + 5) === null, 'rączka tylko nad zdolnym wierszem');

  drain();
  ok(P.handleClick(c.rows[1].x + 5, c.rows[1].y + 5) === true, 'klik odmówionego wiersza pochłonięty');
  ok(toasts[0] === `${t('fleet.warpOrderFailed')} — ${refusalText('vessel_in_reserve')}` && gm.sendPicker !== null && r0.position.state === 'docked', 'odmowa: toast z powodem, picker zostaje');

  drain();
  P.handleClick(c.rows[0].x + 5, c.rows[0].y + 5);
  ok(d.position.state === 'in_transit' && d.systemId === null && toasts[0] === t('fleet.warpOrderSent'), 'klik wiersza: `issueWarp`, toast `fleet.warpOrderSent`');
  ok(gm.sendPicker === null, 'sukces zamyka');

  gm.toggleSendPicker('B');
  frame();
  ok(P.handleClick(900, 700) === true && gm.sendPicker === null, 'klik poza: zamyka i pochłania (przypięcie gwiazdy zostaje)');
  ok(gm.selectedSystemId === 'B', 'przypięcie po kliku poza nietknięte');

  for (let i = 0; i < 8; i++) mk({ name: `S${i}` });
  gm.toggleSendPicker('B');
  const c2 = frame();
  ok(c2.rows.length === 6 && c2.maxScroll > 0, 'długa lista: 6 wierszy');
  hud._pointer = { lx: 900, ly: 700 };
  ok(P.wheel(100) === false && gm.sendPicker.scroll === 0, 'kółko poza pudełkiem: nie przewija (kamera dostaje krok)');
  hud._pointer = { lx: c2.box.x + 5, ly: c2.box.y + 5 };
  ok(P.wheel(100) === true && gm.sendPicker.scroll === 1, 'kółko nad pudełkiem: przewija o wiersz');
  frame();
  ok(P.wheel(-100) === true && gm.sendPicker.scroll === 0, 'w górę z powrotem; bez przewinięcia poza początek');
  ok(P.wheel(-100) === true && gm.sendPicker.scroll === 0, 'na początku kółko dalej połknięte');
  K.hudLayer = { sendPickerWheel: (dy) => P.wheel(dy) };
  hud._pointer = { lx: c2.box.x + 5, ly: c2.box.y + 5 };
  ok(gm.onWheel({ deltaY: 100 }, {}) === true && gm.sendPicker.scroll === 1, 'prawdziwe `onWheel`: kółko trafia do pickera przed gestem kamery');
  delete K.hudLayer;
  gm.closeSendPicker();

  const empty = sendPickerModel({ systemId: 'B', scroll: 0 }, { ...K, vesselManager: { getAllVessels: () => [] } });
  ok(empty.empty === t('fleet.noWarpShipsAvailable') && empty.rows.length === 0, 'brak statków: tekst pustej listy');
}

// ── T5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T5 bramka mgły na nazwach');
{
  vm._vessels.clear();
  const ship = mk();
  select([ship]);
  const e = galaxyStarMenuEntries('C')[0];
  ok(e.labelPL.startsWith('Skok do ???') && e.labelEN.startsWith('Warp to ???') && !e.labelPL.includes('Cygni'), 'menu: niezbadany cel = ???');
  GAME_CONFIG.FEATURES.fleetWarp = false;   // G4 — zaślepka G3 żyje przy OFF; wpis żywy: `galaxy_fleet_warp_ui_smoke` T1
  select([], 'fleet_1');
  const f = galaxyStarMenuEntries('C')[0];
  ok(f.labelPL === 'Skok do ???' && !f.labelEN.includes('Cygni'), 'menu floty: niezbadany cel = ???');
  GAME_CONFIG.FEATURES.fleetWarp = true;
  select([ship]);
  const m = sendPickerModel({ systemId: 'C', scroll: 0 }, K);
  ok(m.header.endsWith('→ ???') && !m.header.includes('Cygni'), 'nagłówek pickera: ???');
  const inFog = mk({ systemId: 'D', position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'x' } });
  const row = sendPickerRows([inFog], 'B', (v) => K.warpRouteSystem.canOrder(v), { K })[0];
  ok(sendPickerRowLines(row).sub === '???' && !sendPickerRowLines(row).sub.includes('Deneb'), 'wiersz pickera: położenie w niezbadanym układzie = ???');
  scans.C = { tier: 1 };
  ok(galaxyStarMenuEntries('C')[0].labelEN.startsWith('Warp to Cygni') && sendPickerModel({ systemId: 'C', scroll: 0 }, K).header.endsWith('→ Cygni'), 'KONTROLA: po skanie nazwa wraca — przyrząd ją widzi');
  delete scans.C;
}

// ── T6 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T6 droga do domu z obcej orbity');
{
  const far = mk({ systemId: 'B', status: 'on_mission', position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'b1' } });
  select([far]);
  const e = galaxyStarMenuEntries('sys_home')[0];
  ok(e?.enabled === true && e.labelPL.startsWith('Skok do Dom'), 'menu gwiazdy domu: aktywna pozycja dla statku na obcej orbicie');
  drain();
  const r = runGalaxyWarpOrder({ vesselIds: e.vesselIds, targetSystemId: e.targetSystemId });
  ok(r.moved === 1 && far.mission?.toSystemId === 'sys_home', 'rozkaz prowadzi do domu');
}

// ── T7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T7 wpięcie w GameScene');
{
  const raw = readFileSync(join(HERE, '../../scenes/GameScene.js'), 'utf8').replace(/\r\n/g, '\n');
  const bodyOf = (name) => {
    const at = raw.indexOf(`\n  ${name}(`);
    if (at < 0) return null;
    const open = raw.indexOf('{', raw.indexOf(')', at));
    let depth = 0, i = open;
    for (; i < raw.length; i++) { if (raw[i] === '{') depth++; else if (raw[i] === '}' && --depth === 0) break; }
    return raw.slice(at + 3, i + 1);
  };
  const compile = (name, scope) => {
    const b = bodyOf(name);
    if (!b) return null;
    const names = Object.keys(scope);
    const make = new Function(...names, '__src', 'return eval("(" + __src + ")");');
    return make(...names.map((n) => scope[n]), 'function ' + b.trim().slice(name.length));
  };
  const right = compile('_handleTacticalRightClick', { window: globalThis.window, document: { querySelector: () => null }, GAME_CONFIG });
  const open = compile('_openGalaxyStarMenu', { window: globalThis.window, EventBus });
  ok(typeof right === 'function' && typeof open === 'function', 'metody w źródle');

  const opened = [];
  const onOpen = (e) => opened.push(e);
  EventBus.on('ui:rightClickMenuOpened', onOpen);
  const evt = (over = {}) => ({ target: { id: 'three-canvas' }, clientX: 200, clientY: 100, ...over });
  let star = 'B';
  K.galaxyMode = { isActive: true, isFlying: false, closed: 0, closeSendPicker() { this.closed++; return false; } };
  K.hudLayer = { galaxyStarIdAt: () => star };
  const self = {
    planetScene: null, threeRenderer: { galaxyStarAt: () => null },
    uiManager: { overlayManager: { isAnyOpen: () => false }, isOverUI: () => false, toLocalUI: () => ({ x: 1, y: 1 }) },
    _resolveClickTarget: () => { throw new Error('raycast układu w trybie galaktyki'); },
  };
  self._openGalaxyStarMenu = open;
  right.call(self, evt());
  ok(opened.length === 1 && opened[0].target.type === 'galaxyStar' && opened[0].target.systemId === 'B', 'gwiazda pod kursorem: menu `galaxyStar`, bez raycastu układu');
  ok(K.galaxyMode.closed === 1, 'otwarcie menu zamyka picker');
  opened.length = 0;
  star = null;
  right.call(self, evt());
  ok(opened.length === 0, 'pusta płyta: bez menu');
  star = 'B';
  K.galaxyMode.isFlying = true;
  right.call(self, evt());
  K.galaxyMode.isFlying = false;
  ok(opened.length === 0, 'lot: bez menu');
  self.uiManager.isOverUI = () => true;
  right.call(self, evt());
  self.uiManager.isOverUI = () => false;
  ok(opened.length === 0, 'nad UI: bez menu');
  self.uiManager.overlayManager.isAnyOpen = () => true;
  right.call(self, evt());
  self.uiManager.overlayManager.isAnyOpen = () => false;
  ok(opened.length === 0, 'overlay otwarty: bez menu');
  // KONTROLA: tryb układu idzie dawną drogą.
  K.galaxyMode = { isActive: false };
  let raycast = 0;
  self._resolveClickTarget = () => { raycast++; return null; };
  right.call(self, evt());
  ok(raycast === 1, 'KONTROLA: tryb układu — raycast jak dotąd');
  EventBus.off('ui:rightClickMenuOpened', onOpen);
  delete K.hudLayer;

  // Esc: picker schodzi przed resztą łańcucha Esc (zaznaczenie statku, przypięcie, wyjście).
  const code = raw.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const escAt = code.indexOf('closeSendPicker?.()) {');
  const selAt = code.indexOf('galaxyMode.selectedSystemId != null) window.KOSMOS.galaxyMode.select(null)');
  const pickAt = code.indexOf('um.cancelPickerMode();');
  ok(escAt > 0 && selAt > escAt && pickAt > 0 && pickAt < escAt, 'Esc: picker po pickerze celu, przed zdjęciem przypięcia');
  const uiRaw = readFileSync(join(HERE, '../../scenes/UIManager.js'), 'utf8').replace(/\r\n/g, '\n');
  ok(/sendPicker && this\.isOverUI\(x, y\)\) window\.KOSMOS\.galaxyMode\.closeSendPicker\(\)/.test(uiRaw), 'klik nad UI zamyka picker (UIManager — pin źródłowy)');
}

// ── T8 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T8 KONTROLA: flaga OFF');
{
  GAME_CONFIG.FEATURES.galaxyWarp = false;
  const off = galaxyPinButtons({ sendEnabled: false, t }).find((b) => b.id === 'send');
  ok(off.enabled === false && off.reason === 'G3', 'przycisk jak przed krokiem');

  const ship = mk();
  select([ship]);
  const hud = { hoverObjectKey: () => 'galaxy:B' };
  K.galaxyMode = { isActive: true };
  K.threeRenderer = { getGalaxyAnchorLy: () => ({ x: 0, y: 0, z: 0 }) };
  const layer = new HudGalaxyRouteLayer(hud);
  const F = { K, att: { layers: { routes: true } }, sel: {}, sim: 0, now: 0, W: 1000, H: 1000 };
  layer.prepare(F);
  ok(layer.collect(F, { depth: () => 1, point: (x, y) => ({ x, y }) }).preview === null, 'podgląd nie powstaje');

  const gm = new GalaxyModeController();
  gm._active = true;
  K.galaxyMode = gm;
  gm.toggleSendPicker('B');
  const P = new HudGalaxySendPickerLayer({ ctx: null, _galaxySublayers: [] });
  ok(P.prepare({ K, now: 0 }) === 'gsp:0' && P.handleClick(1, 1) === false, 'podwarstwa pickera milczy');
  gm.closeSendPicker();

  const raw = readFileSync(join(HERE, '../../scenes/GameScene.js'), 'utf8').replace(/\r\n/g, '\n');
  ok(/if \(galaxyActive && !GAME_CONFIG\.FEATURES\?\.galaxyWarp\) return;/.test(raw), 'PPM w trybie galaktyki: powrót jak w G1 (pin źródłowy; wykonanie — `galaxy_pick` P7b)');
  GAME_CONFIG.FEATURES.galaxyWarp = true;
  ok(getLocale() != null && tIn('en', 'galaxyMenu.fleetWaitsG4') !== tIn('pl', 'galaxyMenu.fleetWaitsG4'), 'powód floty w obu językach');
  setLocale(getLocale());
}

// ── T9 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T9 po G3 (F4): Esc zdejmuje zbiór przed wyjściem z trybu; menu kilku statków z F1');
{
  const raw = readFileSync(join(HERE, '../../scenes/GameScene.js'), 'utf8').replace(/\r\n/g, '\n');
  const iClear = raw.indexOf('um.clearSelection();');
  const iExit = raw.indexOf("window.KOSMOS.galaxyMode.exit('esc')");
  const iCaret = raw.indexOf("if (e.key === 'Escape') {", raw.indexOf('M3 P1.3 — picker / menu / selection keyboard'));
  ok(iCaret >= 0 && iClear > iCaret && iExit > iClear, 'Esc: zbiór statków schodzi PRZED wyjściem z trybu galaktyki (kolejność w źródle)');

  // Dwa statki: jeden doskoczy, drugi ma za mało rdzeni. Menu aktywne, rozkaz per statek, podsumowanie D-E2.
  const g1 = mk({ name: 'Zdolny' }), g2 = mk({ name: 'Pusty', warpFuel: { current: 0.1, max: 10, consumption: 0.5, fuelType: 'warp_cores' } });
  select([g1, g2]);
  const entries = galaxyStarMenuEntries('B');
  ok(entries.length === 1 && entries[0].enabled === true && entries[0].vesselIds.join() === `${g1.id},${g2.id}` && entries[0].labelPL === tIn('pl', 'galaxyMenu.warpTo', 'Beta'),
    'kilka statków: jedna pozycja „Skok do X”, aktywna, gdy choć jeden doskoczy');
  drain();
  const res = runGalaxyWarpOrder({ vesselIds: entries[0].vesselIds, targetSystemId: 'B' });
  const said = drain();
  ok(res.moved === 1 && res.total === 2 && said.some((s) => s.includes('Pusty')), 'klik: rozkaz per statek, odmówiony nazwany');
  select([mk({ name: 'P1', warpFuel: { current: 0.1, max: 10, consumption: 0.5 } }), mk({ name: 'P2', warpFuel: { current: 0.1, max: 10, consumption: 0.5 } })]);
  const none = galaxyStarMenuEntries('B');
  ok(none[0].enabled === false && none[0].disabledReason === refusalText('insufficient_warp_fuel'), 'nikt nie doskoczy: pozycja wyłączona z powodem lidera');
  select([]);
}

console.log(`\ngalaxy_warp_ui: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
