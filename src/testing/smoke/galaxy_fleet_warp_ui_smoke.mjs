// galaxy_fleet_warp_ui_smoke — G4-B (GALAXY_PLAN.md §4 G4, D-GX-19, D-GX-20): UI skoku floty, logika na prawdziwym łańcuchu rozkazu.
//   T1  wpis menu gwiazdy per rodzaj zaznaczenia (węzeł floty, członek, członkowie jednej floty, mieszane, luźny, nic)
//   T2  wpis wyłączony: tekst D-GX-20 nazywa członków, ten sam co odmowa rozkazu; PL i EN, bez sluga
//   T3  klik: rozkaz floty, toast; odmowa niczego nie rusza i zostaje w Dzienniku
//   T4  podgląd przy najechaniu = wspólny plan (jedna linia), osiągalność wg baku wiążącego, pamięć po stanie członków
//   T5  picker: sekcja „Floty” z tej samej fazy 1, nagłówek bez strefy kliku, klik wiersza floty przez prawdziwą warstwę; bez flot jak w G3
//   T6  szyna: rozwinięta „+reszta” od 1, zwinięta bez zmian
//   T7  panel floty: „Skok warp → X · ETA”, czas całej trasy, koniec lotu gasi linię; stan rekordu w Dowództwie
//   T8  trasa zaznaczonej floty = wspólne przeskoki rekordu (prawdziwa warstwa tras)
//   T9  popup przylotu: jeden na grupę, przy obu kolejnościach słuchaczy; członek z przerwaną trasą melduje się sam
//   T10 pomocniki bramki (`KOSMOS.debug.fleetWarp*`): te same odpowiedzi co rozkaz, wpięte w `GameScene`
//
// ⚠ PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — flaga `fleetWarp` na stałe ON, ścieżka OFF usunięta): wycofane kontrole OFF = G3 —
//   T1 (węzeł floty = zaślepka G3 z kluczem `galaxyMenu.fleetWaitsG4`, usuwanym; członek = statek), T4 (flota bez podglądu), T5 (picker
//   bez sekcji floty). Wiersze przy ON bez zmian; alias `FEATURES` (służył tylko przestawianiu flagi) usunięty.
//
// Uruchom: node src/testing/smoke/galaxy_fleet_warp_ui_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync }        from 'node:fs';
import { fileURLToPath }       from 'node:url';
import { dirname, join }       from 'node:path';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { WarpRouteSystem }     from '../../systems/WarpRouteSystem.js';
import { OrderService }        from '../../systems/OrderService.js';
import { SHIPS }               from '../../data/ShipsData.js';
import { HULLS }               from '../../data/HullsData.js';
import { setLocale, t, tIn }   from '../../i18n/i18n.js';
import { HudGalaxySendPickerLayer } from '../../ui/HudGalaxySendPickerLayer.js';
import { HudGalaxyRouteLayer } from '../../ui/HudGalaxyRouteLayer.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { buildFleetPanelModel, fleetStateText } from '../../ui/FleetPanelHudLogic.js';
// Namespace: symbole G4-B powstają w tym kroku, statyczny import wywróciłby cały przebieg fail-first.
import * as GW                 from '../../ui/GalaxyWarpLogic.js';
import * as Chrome             from '../../ui/GalaxyChromeLogic.js';
// Dynamicznie: przed G4-B moduł pomocników nie zlinkuje się z `GalaxyWarpLogic`, a reszta pinów ma dostać kolor.
const FWD = await import('../../debug/FleetWarpDebug.js').catch(() => ({}));

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const group = (name, fn) => { console.log('\n── ' + name + ' ──'); try { fn(); } catch (e) { assert(false, `${name}: wyjątek ${e?.message}`); } };
const __dir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => readFileSync(join(__dir, '..', '..', rel), 'utf8').replace(/\r\n/g, '\n');   // CRLF-safe (Finding 270)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');

const AU = GAME_CONFIG.AU_TO_PX, DT = 0.02, CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const warpHull = (id, warpSpeedLY) => { SHIPS[id] = { ...HULLS.hull_frigate, id, warpCapable: true, warpSpeedLY }; };
warpHull('fu_slow', 3); warpHull('fu_med', 6); warpHull('fu_fast', 9);

let vMgr, mos, fSys, wrs, os, um, toasts, logs;

function scene() {
  EventBus.clear(); EntityManager.clear();
  const home = { id: 'p_home', type: 'planet', name: 'Dom', x: AU, y: 0, radius: 8, mass: 1, orbital: { a: 1, e: 0, T: 1, M: 0, inclinationOffset: 0 }, physics: { x: AU, y: 0 }, systemId: 'sys_home' };
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  toasts = []; logs = [];
  um = { sel: { ids: [], fleet: null }, getSelectedVesselId() { return this.sel.ids[0] ?? null; }, getSelectedVesselIds() { return [...this.sel.ids]; }, getSelectedFleetId() { return this.sel.fleet; } };
  window.KOSMOS = {
    timeSystem: { gameTime: 100 }, activeSystemId: 'sys_home', civMode: true, homePlanet: home, uiManager: um,
    galaxyData: { systems: [
      { id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0, explored: true, isHome: true }, { id: 'B', name: 'Beta', x: 8, y: 0, z: 0 },
      { id: 'C', name: 'Cygni', x: 16, y: 0, z: 0 }, { id: 'D', name: 'Delta', x: 24, y: 0, z: 0 }, { id: 'FAR', name: 'Daleko', x: 100, y: 0, z: 0 },
    ] },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1, getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: (e) => logs.push(e), getEntries: () => [...logs].reverse() },
    debug: {},
  };
  EntityManager.add(home);
  vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr); fSys = new FleetSystem(vMgr); wrs = new WarpRouteSystem(vMgr); os = new OrderService();
  Object.assign(window.KOSMOS, { vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys, warpRouteSystem: wrs, orderService: os });
  EventBus.on('ui:toast', (e) => toasts.push(e));
}
function ship({ name = 'S', hull = 'fu_med', fuel = 20, max = 20, cons = 0.5, sys = 'sys_home', state = 'orbiting' } = {}) {
  const v = vMgr.createAndRegister(hull, 'p_home', { name, modules: [] });
  v.position.x = 2 * AU; v.position.y = 0; v.position.state = state; v.position.dockedAt = state === 'docked' ? 'p_home' : null;
  v.status = 'idle'; v.mission = null; v.systemId = sys; v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  v.warpFuel = { current: fuel, max, consumption: cons };
  return v;
}
const makeFleet = (...vs) => { const f = fSys.createFleet('Eskadra'); for (const v of vs) fSys.addMember(f.id, v.id); return f.id; };
const select = (ships, fleet = null) => { um.sel = { ids: ships.map((v) => v.id), fleet }; };
const tick = (n = 1) => { for (let i = 0; i < n; i++) { window.KOSMOS.timeSystem.gameTime += DT; EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 }); } };
const runUntil = (pred, max = 3000) => { let n = 0; while (!pred() && n++ < max) tick(); return pred(); };
const snapshot = () => JSON.stringify({ v: vMgr.serialize(), f: fSys.serialize() });
const menu = (id) => GW.galaxyStarMenuEntries(id)?.[0] ?? null;
const fuelLabel = (lang, need, have, who) => `${tIn(lang, 'fleet.warpFuelNeed', need, have)} (${who})`;

group('T1 wpis menu per rodzaj zaznaczenia', () => {
  scene();
  const a = ship({ name: 'Wolny', hull: 'fu_slow' }), b = ship({ name: 'Wiazacy', hull: 'fu_fast', fuel: 13 }), c = ship({ name: 'Trzeci' });
  const loose = ship({ name: 'Luzny' });
  const fid = makeFleet(a, b, c);
  const label = (lang) => `${tIn(lang, 'galaxyMenu.fleetWarpTo', '???')} — ${tIn(lang, 'fleet.warpHops', '3')} · ${tIn(lang, 'fleet.warpEta', '8.0')} · ${fuelLabel(lang, '12.0', '13.0', 'Wiazacy')}`;
  const live = (e) => e?.id === 'galaxy.fleetWarp' && e?.action === 'issueGalaxyFleetWarp' && e?.fleetId === fid && e?.enabled === true && e?.targetSystemId === 'D';
  select([], fid);
  const e = menu('D');
  assert(live(e), 'węzeł floty: wpis skoku floty, aktywny');
  assert(e?.labelPL === label('pl') && e?.labelEN === label('en'), `etykieta: skoki, ETA najwolniejszego, paliwo wiążącego z nazwą (${e?.labelEN})`);
  select([b]);
  assert(live(menu('D')), 'jeden członek: ten sam wpis floty');
  select([a, c]);
  assert(live(menu('D')), 'kilku członków jednej floty: wpis floty');
  select([a, loose]);
  assert(menu('D')?.action === 'issueGalaxyWarp' && menu('D')?.vesselIds?.length === 2, 'członek + luźny: rozkazy per statek (G3)');
  select([loose]);
  assert(menu('D')?.action === 'issueGalaxyWarp' && menu('D')?.vesselIds?.[0] === loose.id, 'luźny statek: wpis statku (G3)');
  select([]);
  assert((GW.galaxyStarMenuEntries('D') ?? []).length === 0, 'bez zaznaczenia: brak menu');
});

group('T2 wpis wyłączony nazywa członków (D-GX-20)', () => {
  for (const locale of ['en', 'pl']) {
    setLocale(locale);
    scene();
    const ok = ship({ name: 'Zdolny' }), res = ship({ name: 'Magazyn' }); res.serviceState = 'stored';
    const noWarp = ship({ name: 'BezBaku', fuel: 0, max: 0 }), far = ship({ name: 'Obok', sys: 'B' });
    const fid = makeFleet(ok, res, noWarp, far);
    select([], fid);
    const e = menu('D');
    const refusal = os.previewFleetWarp?.(fid, 'D');
    assert(e?.enabled === false && e?.reasonIsText === true && e?.action === 'issueGalaxyFleetWarp', `${locale}: wyłączony, powód jako tekst`);
    assert(!!refusal && e?.disabledReason === GW.describeFleetWarpRefusal?.(refusal)?.text, `${locale}: tekst = opis odmowy rozkazu`);
    assert(['Magazyn', 'BezBaku', 'Obok'].every((n) => e?.disabledReason?.includes(n)) && !e?.disabledReason?.includes('Zdolny'), `${locale}: nazywa winnych i tylko ich (${e?.disabledReason})`);
    assert(e?.disabledReason?.includes(t('vessel.reasonVesselInReserve')) && e?.disabledReason?.includes(t('fleet.otherSystem')), `${locale}: powody ze słownika`);
    assert(e?.action === 'issueGalaxyFleetWarp' && !/vessel_in_reserve|group_split|not_warp_capable/.test(e?.disabledReason ?? 'vessel_in_reserve'), `${locale}: bez sluga`);
    assert(e?.action === 'issueGalaxyFleetWarp' && !(e?.disabledReason ?? '✗').includes('✗'), `${locale}: bez znacznika panelu w nawiasie`);
  }
  setLocale('en');
  // Menu pozwala zawijać długą odmowę (DOM — pin źródłowy).
  const rcm = stripComments(readSrc('ui/RightClickMenu.js'));
  assert(/why\.style\.whiteSpace = 'normal';/.test(rcm), 'RightClickMenu: długi powód się zawija');
  assert(/option\.action === 'issueGalaxyFleetWarp'\) \{\s*runGalaxyFleetWarpOrder\(\{ fleetId: option\.fleetId, targetSystemId: option\.targetSystemId \}\)/.test(rcm), 'RightClickMenu: klik wpisu = rozkaz floty');
});

group('T3 klik: rozkaz floty', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'B' });
  const fid = makeFleet(a, b);
  const r = GW.runGalaxyFleetWarpOrder?.({ fleetId: fid, targetSystemId: 'D' });
  assert(r?.ok === true && a.warpRoute?.groupId && a.warpRoute?.groupId === b.warpRoute?.groupId, 'rozkaz floty wydany');
  assert(toasts.length === 1 && toasts[0].text === t('fleet.warpOrderSent'), 'toast sukcesu, jeden');
  assert(r?.ok === true && !logs.some((l) => l.severity === 'warn'), 'sukces bez wpisu ostrzeżenia');
  scene();
  const c = ship({ name: 'C' }), d = ship({ name: 'Rezerwa' }); d.serviceState = 'stored';
  const fid2 = makeFleet(c, d);
  const before = snapshot();
  const r2 = GW.runGalaxyFleetWarpOrder?.({ fleetId: fid2, targetSystemId: 'D' });
  assert(r2?.ok === false && snapshot() === before, 'odmowa: nic się nie ruszyło');
  assert(r2?.text?.includes('Rezerwa') && toasts[0]?.text === r2?.text, 'toast nazywa winnego');
  assert(logs.filter((l) => l.severity === 'warn' && l.text === r2?.text).length === 1, 'odmowa zostaje w Dzienniku');
});

group('T4 podgląd = wspólny plan', () => {
  scene();
  const a = ship({ name: 'A', hull: 'fu_slow' }), b = ship({ name: 'B', fuel: 13 });
  const fid = makeFleet(a, b);
  select([], fid);
  const m = GW.warpHoverModel('D');
  const plan = os.previewFleetWarp?.(fid, 'D');
  assert(m?.fleetId === fid && m?.available === true, 'model floty, dostępny');
  assert(m?.hopPoints?.map((h) => h.systemId).join() === plan?.hops?.join() && plan?.hops?.join() === 'sys_home,B,C,D', 'punkty trasy = przeskoki planu rozkazu');
  assert(m?.polyline?.length === 4 && m?.polyline?.[3]?.x === 24, 'jedna linia przez wszystkie układy (LY)');
  assert(m?.legs?.length === 3 && m?.legs?.every((l) => l.reachable), 'wszystkie odcinki osiągalne');
  select([b]);
  assert(GW.warpHoverModel('D')?.fleetId === fid, 'członek zaznaczony: ten sam podgląd floty');
  assert(GW.warpHoverModel('D')?.fleetId === fid && GW.warpHoverModel('sys_home') === null, 'układ floty: bez podglądu');
  // Pamięć po stanie członków: bak się zmienia, plan nie zostaje stary.
  b.warpFuel.current = 5;
  const short = GW.warpHoverModel('D');
  assert(short?.available === false && short?.reason === 'insufficient_warp_fuel' && short?.reasonText?.includes('B'), 'bak maleje: odmowa paliwa z nazwą');
  assert(short?.fleetId === fid && short?.legs?.map((l) => (l.reachable ? 1 : 0)).join('') === '100', `osiągalność wg baku wiążącego (10 LY przy odcinkach po 8 LY: ${short?.legs?.map((l) => (l.reachable ? 1 : 0)).join('')})`);
  // Odmowa bramki członka gasi całą trasę, jak w G3 przy odmowie statku.
  a.serviceState = 'stored'; b.warpFuel.current = 20;
  const gate = GW.warpHoverModel('D');
  assert(gate?.available === false && gate?.legs?.every((l) => !l.reachable) && gate?.reasonText?.includes('A'), 'rezerwa: trasa zgaszona, powód z nazwą');
  const label = stripComments(readSrc('ui/HudGalaxyLabelLayer.js'));
  assert(/warpModel\.reasonText \?\? refusalText\(warpModel\.reason\)/.test(label), 'rozwinięcie gwiazdy: tekst floty przed powodem statku');
});

group('T5 picker: sekcja „Floty”', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'B', fuel: 13 });
  const fid = makeFleet(a, b);
  const r1 = ship({ name: 'Rezerwa' }); r1.serviceState = 'stored';
  const fid2 = fSys.createFleet('Druga').id; fSys.addMember(fid2, r1.id);
  const loose = ship({ name: 'Luzny' });
  const m = GW.sendPickerModel({ systemId: 'D', scroll: 0 });
  const kinds = m.rows.map((r) => r.kind ?? 'ship').join();
  assert(kinds === 'section,fleet,fleet,section,ship,ship', `sekcje i kolejność w oknie (${kinds})`);
  assert(m.total === 8 && m.maxScroll === 2, 'nagłówki liczą się do okna listy; członkowie flot zostają na liście statków');
  assert(m.rows[0]?.text === t('fleet.fleetsHeader') && m.rows[3]?.text === t('rightOutliner.ships', 4), 'nagłówki z istniejących kluczy');
  assert(m.rows[1]?.fleetId === fid && m.rows[1]?.ok === true && m.rows[2]?.fleetId === fid2 && m.rows[2]?.ok === false, 'zdolne floty pierwsze');
  assert(m.rows[2]?.reasonText === GW.fleetWarpMenuOption?.({ fleetId: fid2, targetSystemId: 'D' })?.reasonText && m.rows[2]?.reasonText?.includes('Rezerwa'), 'odmowa z tej samej fazy 1 co menu');
  const lines = GW.sendPickerRowLines(m.rows[1] ?? {});
  assert(lines.main === 'Eskadra · ×2', `wiersz floty: nazwa i liczba (${lines.main})`);
  assert(lines.sub === `${t('fleet.warpHops', '3')} · ${t('fleet.warpEta', '4.0')} · ${t('fleet.warpFuelNeed', '12.0', '13.0')} (B)`, `wiersz floty: skoki, ETA, paliwo wiążącego (${lines.sub})`);
  // Bez flot — lista jak w G3.
  scene();
  ship({ name: 'Sam' });
  const none = GW.sendPickerModel({ systemId: 'D', scroll: 0 });
  assert(none.rows.length === 1 && none.rows[0].kind === undefined && none.rows[0].name === 'Sam', 'bez flot: bez nagłówków');

  // Prawdziwa warstwa: nagłówek bez strefy, klik wiersza floty wydaje rozkaz i zamyka picker.
  scene();
  const c = ship({ name: 'C' }), d = ship({ name: 'D' });
  const fid3 = makeFleet(c, d);
  let closed = 0;
  const K = window.KOSMOS;
  K.galaxyMode = { isActive: true, isFlying: false, sendPicker: { systemId: 'D', scroll: 0 }, closeSendPicker() { closed++; this.sendPicker = null; }, scrollSendPicker() {} };
  const layer = new HudGalaxySendPickerLayer({ ctx: null, _galaxySublayers: [{ sendButtonZone: () => ({ x: 100, y: 100, w: 40, h: 12 }) }] });
  const F = { K, pointer: null, mapRect: { x: 0, y: 0, w: 1000, h: 800 }, now: 0, roles: { primary: '#fff', dim: '#888' } };
  const key = layer.prepare(F);
  const c1 = layer.collect(F, {});
  assert(typeof key === 'string' && c1?.rows?.length === 5 && layer._last.zones.length === 3, `warstwa: 5 wierszy, 3 strefy (${c1?.rows?.length}/${layer._last.zones.length})`);
  const calls = []; const ctx = new Proxy({}, { get: (o, p) => (p in o ? o[p] : (...a) => calls.push([p, ...a])), set: (o, p, v) => { o[p] = v; return true; } });
  layer.draw(ctx, F, c1);
  assert(calls.some(([m0, s]) => m0 === 'fillText' && s === t('fleet.fleetsHeader')), 'warstwa rysuje nagłówek sekcji');
  const fleetZone = layer._last.zones.find((z) => z.fleetId === fid3), headerRow = c1.rows.find((r) => r.kind === 'section');
  layer.handleClick(headerRow.x + 5, headerRow.y + 2);
  assert(!c.warpRoute && closed === 0, 'klik nagłówka: nic');
  layer.handleClick(fleetZone.x + 5, fleetZone.y + 5);
  assert(!!c.warpRoute?.groupId && c.warpRoute.groupId === d.warpRoute?.groupId && closed === 1, 'klik wiersza floty: skok całej floty, picker zamknięty');
});

group('T6 szyna: rozwinięta i zwinięta', () => {
  const row = { w: 60, h: 14 };
  const lay = (o) => Chrome.railLayout({ ax: 400, ay: 300, pickHalf: 11, plusW: 20, rowH: 14, plusMin: 2, ...o });
  assert(lay({ rows: [row, row, row, row] }).plus?.count === 1 && lay({ rows: [row, row, row, row] }).rows.length === 3, 'rozwinięta, 4 statki: 3 nazwy + „+1”');
  assert(lay({ rows: [row, row, row, row, row] }).plus?.count === 2, 'rozwinięta, 5 statków: „+2”');
  assert(lay({ rows: [row], hidden: 1 }).plus === null, 'zwinięta, zaznaczony wiersz + 1 ukryty: bez „+1” (jak po PASS G3)');
  assert(lay({ rows: [row], hidden: 3 }).plus?.count === 3, 'zwinięta, zaznaczony wiersz + 3 ukryte: „+3”');
  assert(lay({ rows: [row, row, row] }).plus === null, 'rozwinięta, 3 statki: bez licznika');
  assert(lay({ rows: [], hidden: 1 }).plus === null, 'zwinięta, 1 statek: sam znacznik');
  assert(lay({ rows: [], hidden: 2 }).plus?.count === 2 && lay({ rows: [], hidden: 4 }).plus?.count === 4, 'zwinięta, N ≥ 2: „+N” łącznie');
});

group('T7 panel floty w skoku', () => {
  scene();
  const a = ship({ name: 'A', hull: 'fu_slow' }), b = ship({ name: 'B' });
  const fid = makeFleet(a, b);
  const fleet = fSys.getFleet(fid);
  const K = window.KOSMOS;
  assert(!buildFleetPanelModel(fleet, { K })?.info?.length, 'bez skoku: bez linii');
  os.issueFleetWarp?.(fid, 'D');
  const line = () => buildFleetPanelModel(fleet, { K })?.info?.find((i) => i.text?.includes('→'))?.text;
  assert(line() === `${t('fleetPicture.activity.warp')} → ??? · ${t('fleet.warpEta', '8.0')}`, `start: cel przez kanon mgły, ETA całej trasy (${line()})`);
  assert(/warp jump/i.test(fleetStateText([], fleet, {})) || fleetStateText([], fleet, {}) === t('fleetPicture.activity.warp'), 'słowo stanu: skok, nie „rozkaz”');
  const overlay = Object.create(FleetManagerOverlay.prototype);
  assert(overlay._computeFleetStatus(fleet)?.label?.includes(t('fleetPicture.activity.warp')), 'Dowództwo: flota w skoku, nie bezczynna');
  const sawLine = !!line();
  runUntil(() => a.mission?.toSystemId === 'C');
  assert(Math.abs(GW.fleetWarpStatus?.(fleet)?.etaYears - 16 / 3) < 0.03, `po pierwszym przeskoku: 16 LY / 3 (${GW.fleetWarpStatus?.(fleet)?.etaYears?.toFixed(3)})`);
  K.starSystemManager = { hasBeacon: (id) => id === 'D', getSystem: () => null, generateAndRegister() {} };
  assert(Math.abs(GW.fleetWarpStatus?.(fleet)?.etaYears - (8 / 3 + 8 / 9)) < 0.03, 'beacon celu skraca ostatni odcinek, jak w dyspozytorze');
  delete K.starSystemManager;
  runUntil(() => fleet.activeOrder === null);
  assert(sawLine && a.systemId === 'D' && !line(), 'koniec lotu: linia znika');
  assert(overlay._computeFleetStatus(fleet)?.label === t('fleet.statusIdle2'), 'Dowództwo: po skoku bezczynna (kontrola)');
});

group('T8 trasa zaznaczonej floty = wspólne przeskoki', () => {
  scene();
  const a = ship({ name: 'A' }), b = ship({ name: 'B' });
  const fid = makeFleet(a, b);
  const K = window.KOSMOS;
  K.galaxyMode = { isActive: true };
  K.threeRenderer = { getGalaxyAnchorLy: () => ({ x: 0, y: 0, z: 0 }) };
  const layer = new HudGalaxyRouteLayer(null);
  const F = { K, att: { layers: { routes: true } }, sel: { fleetId: fid }, sim: 0 };
  const hops = () => { layer.prepare(F); return layer._prep.hops?.map((s) => s.id).join() ?? null; };
  assert(hops() === null, 'kontrola: bez skoku bez trasy');
  os.issueFleetWarp?.(fid, 'D');
  const ao = fSys.getFleet(fid).activeOrder;
  assert(!!ao && hops() === ao.hops?.join() && a.warpRoute?.hops?.join() === ao.hops?.join() && b.warpRoute?.hops?.join() === ao.hops?.join(), `trasa = przeskoki rekordu i obu członków (${hops()})`);
  runUntil(() => a.mission?.toSystemId === 'C');
  assert(hops() === 'B,C,D', `po przeskoku: pozostałe (${hops()})`);
  const st = GW.fleetWarpStatus?.(fSys.getFleet(fid));
  assert(st?.flying === 2 && st?.leadId === a.id && st?.targetSystemId === 'D', 'stan: lecą dwaj, prowadzi pierwszy');
  assert(a.mission?.warpGroupId === ao.groupId, 'misja członka niesie znacznik grupy');
  assert(a.mission?.groupId === undefined, 'pole eskadr AI (SB54) nietknięte');
  // Stop: trasa na płycie kończy się na przystanku od chwili kliku, bo czyta skrócone przeskoki (cel nie jest już celem).
  assert(fSys.cancelFleetOrder(fid, 'manual') === true && hops() === 'B,C', `po Stopie: trasa do przystanku (${hops()})`);
  assert(GW.fleetWarpStatus?.(fSys.getFleet(fid))?.targetSystemId === 'C', 'po Stopie: stan floty mówi to samo');
});

group('T9 popup przylotu: jeden na grupę', () => {
  const run = (listenerFirst) => {
    scene();
    if (listenerFirst) EventBus.clear();
    let shown = null;
    const seen = [];
    const listen = ({ vessel, systemId }) => {
      const kind = GW.fleetArrivalPopupKind?.(vessel, systemId, shown);
      if (kind === 'fleet') shown = vessel.mission.warpGroupId;
      seen.push(`${vessel.name}@${systemId}:${kind}`);
    };
    if (listenerFirst) {
      EventBus.on('interstellar:arrived', listen);
      vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr); fSys = new FleetSystem(vMgr); wrs = new WarpRouteSystem(vMgr); os = new OrderService();
      Object.assign(window.KOSMOS, { vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys, warpRouteSystem: wrs, orderService: os });
    } else {
      EventBus.on('interstellar:arrived', listen);
    }
    const a = ship({ name: 'A' }), b = ship({ name: 'B' }), c = ship({ name: 'C' });
    const fid = makeFleet(a, b, c);
    os.issueFleetWarp?.(fid, 'D');
    runUntil(() => fSys.getFleet(fid)?.activeOrder === null);
    return seen;
  };
  for (const [label, seen] of [['słuchacz po WarpRouteSystem (dziś)', run(false)], ['słuchacz przed WarpRouteSystem', run(true)]]) {
    assert(seen.length === 9, `${label}: 9 przylotów (3 × 3)`);
    assert(seen.filter((s) => s.endsWith(':fleet')).length === 1 && seen.filter((s) => s.endsWith(':fleet'))[0]?.includes('@D'), `${label}: jeden popup, w celu (${seen.filter((s) => s.endsWith(':fleet')).join()})`);
    assert(seen.filter((s) => s.endsWith(':none')).length === 8, `${label}: reszta cicho`);
  }
  // Statek solo i członek z przerwaną trasą meldują się sami.
  scene();
  const solo = ship({ name: 'Solo' });
  wrs.beginJourney(solo.id, 'B');
  assert(GW.fleetArrivalPopupKind?.(solo, 'B') === 'solo', 'statek solo: jak dotąd');
  const a = ship({ name: 'A' }), b = ship({ name: 'Przerwany' });
  os.issueFleetWarp?.(makeFleet(a, b), 'D');
  wrs.abortJourney(b.id, 'superseded');
  const kinds = [];
  EventBus.on('interstellar:arrived', ({ vessel, systemId }) => { if (vessel.id === b.id) kinds.push(GW.fleetArrivalPopupKind?.(vessel, systemId)); });
  runUntil(() => kinds.length > 0);
  assert(kinds[0] === 'solo', 'przerwany członek zatrzymał się: melduje się sam');
  const modal = stripComments(readSrc('ui/MissionEventModal.js'));
  assert(/if \(arrivalKind === 'none'\) return;/.test(modal) && /fleetArrivalPopupKind\(vessel, systemId, _fleetArrivalShown\)/.test(modal), 'MissionEventModal: bramka popupu wpięta (pin źródłowy — DOM)');
});

// Finding 604 (G5-C): statek solo na trasie wieloprzeskokowej — przystanki bez popupu (tylko linia Dziennika), popup raz, w celu.
// W tej samej scenie leci flota na tę samą trasę: jej odpowiedź ma zostać jak w T9 (jeden popup na grupę).
group('T9b popup przylotu statku solo na trasie (Finding 604)', () => {
  const run = (listenerFirst) => {
    scene();
    if (listenerFirst) EventBus.clear();
    let shown = null;
    const seen = [], logs = [];
    EventBus.on('interstellar:arrived', ({ vessel, systemId }) => {
      const kind = GW.fleetArrivalPopupKind?.(vessel, systemId, shown);
      if (kind === 'fleet') shown = vessel.mission.warpGroupId;
      seen.push(`${vessel.name}@${systemId}:${kind}`);
    });
    if (listenerFirst) {
      vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr); fSys = new FleetSystem(vMgr); wrs = new WarpRouteSystem(vMgr); os = new OrderService();
      Object.assign(window.KOSMOS, { vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys, warpRouteSystem: wrs, orderService: os });
    }
    window.KOSMOS.eventLogSystem = { push: (e) => logs.push(e.text) };
    const solo = ship({ name: 'Solo' }), f1 = ship({ name: 'F1' }), f2 = ship({ name: 'F2' });
    const fid = makeFleet(f1, f2);
    const started = wrs.beginJourney(solo.id, 'D');
    os.issueFleetWarp?.(fid, 'D');
    runUntil(() => !solo.warpRoute && fSys.getFleet(fid)?.activeOrder === null);
    return { seen, logs, started, solo };
  };
  for (const [label, listenerFirst] of [['słuchacz po WarpRouteSystem (dziś)', false], ['słuchacz przed WarpRouteSystem', true]]) {
    const { seen, logs, started, solo } = run(listenerFirst);
    const soloSeen = seen.filter((s) => s.startsWith('Solo@')).map((s) => s.slice(5));
    // KONTROLA: trasa solo naprawdę ma trzy odcinki i dolatuje do celu — inaczej „brak popupów na przystankach” byłby ciszą.
    assert(started?.ok === true && started.route?.hops?.join() === 'sys_home,B,C,D' && solo.systemId === 'D', `${label}: KONTROLA — solo leci trzema odcinkami i dolatuje (${started?.route?.hops?.join()})`);
    assert(soloSeen.join() === 'B:none,C:none,D:solo', `${label}: solo — przystanki cicho, popup raz, w celu (${soloSeen.join()})`);
    assert(logs.filter((x) => x.includes('Solo')).length >= 3, `${label}: solo — linie Dziennika na przystankach i w celu zostają (${logs.filter((x) => x.includes('Solo')).length})`);
    const fleetSeen = seen.filter((s) => !s.startsWith('Solo@'));
    assert(fleetSeen.length === 6 && fleetSeen.filter((s) => s.endsWith(':fleet')).length === 1 && fleetSeen.find((s) => s.endsWith(':fleet'))?.includes('@D')
      && fleetSeen.filter((s) => s.endsWith(':none')).length === 5, `${label}: KONTROLA — flota bez zmian: jeden popup na grupę, w celu (${fleetSeen.join()})`);
  }
});

group('T10 pomocniki bramki', () => {
  scene();
  const K = window.KOSMOS, d = FWD.fleetWarpDebugHelpers?.();
  um.setSelectedFleetId = (id) => { um.sel.fleet = id; };
  const r = d?.fleetWarpRig(1);
  assert(r?.ok === true && r?.members?.map((m) => m.speedLY).join() === '6,12,18' && r?.members?.map((m) => m.cores).join() === '10,5,10', 'rig: trzy prędkości i członek wiążący');
  assert(r?.members?.some((m) => m.state === 'orbiting') && r?.members?.some((m) => m.state === 'docked'), 'rig: mieszanka doku i orbity');
  assert(um.sel.fleet === K.fleetSystem?.listFleets?.()[0]?.id, 'rig zaznacza flotę');
  const p = d?.fleetWarpPlan(2);
  assert(p?.ok === true && p?.hops === 2 && p?.groupSpeedLY === 6 && p?.binding === 'G4-wiazacy', `plan: dwa skoki, prędkość najwolniejszego, wiążący (${p?.route})`);
  const i = d?.fleetWarpIssue(2);
  assert(i?.ok === true && i?.unchanged === false, 'rozkaz wydany');
  const s = d?.fleetWarpState();
  assert(s?.sameHops === true && s?.sameArrival === true && s?.order?.type === 'warp' && s?.logFleet?.length === 1 && s?.logMembers?.length === 0, 'odczyt: te same przeskoki i przylot, jedna linia');
  runUntil(() => K.fleetSystem.listFleets()[0]?.activeOrder === null);
  const end = d?.fleetWarpState();
  assert(Object.values(end?.arrivals ?? {}).length === 2 && Object.values(end?.arrivals ?? {}).every((a) => a.members === 3 && a.sameTick), 'odczyt przylotów: każdy przystanek, trzech w jednym ticku');
  assert(end?.logFleet?.length === 2, 'na końcu dwie linie floty');
  for (const [kind, reason] of [[2, 'not_warp_capable'], [3, 'vessel_in_reserve']]) {
    d?.fleetWarpRig(kind);
    const rf = d?.fleetWarpIssue(1);
    assert(rf?.ok === false && rf?.reason === reason && rf?.unchanged === true && rf?.text?.includes('G4-szybki'), `rig(${kind}): odmowa ${reason}, nazwany, nic się nie zmieniło`);
  }
  assert(K.fleetSystem.listFleets().filter((f) => f.name === 'G4').length === 1, 'kolejny rig zastępuje poprzedni');
  // Zjazd członka z trasy: rozkaz wprost odmawia w locie, po zjeździe leci sam.
  d?.fleetWarpRig(1);
  d?.fleetWarpIssue(3);
  const dv = d?.fleetWarpDivert(2);
  assert(dv?.ok === true && dv?.direct === 'false:in_transit', 'w locie własny skok odmawia');
  const fleet = K.fleetSystem.listFleets().find((f) => f.name === 'G4');
  const v = K.vesselManager.getVessel(fleet?.memberIds?.[1]);
  runUntil(() => fleet?.activeOrder === null);
  assert(v?.systemId !== 'D' && K.vesselManager.getVessel(fleet.memberIds[0])?.systemId === 'D', 'reszta w celu bez niego');
  const scene2 = stripComments(readSrc('scenes/GameScene.js'));
  assert(/\.\.\.fleetWarpDebugHelpers\(\),/.test(scene2), 'GameScene: pomocniki w `KOSMOS.debug`');
});

console.log(`\n══════ galaxy_fleet_warp_ui_smoke: ${pass} PASS / ${fail} FAIL ══════`);
process.exit(fail > 0 ? 1 : 0);
