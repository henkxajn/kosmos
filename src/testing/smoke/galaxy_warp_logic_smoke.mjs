// Keeper: ARC GALAXY G3-A — czyste modele skoku z galaktyki (`GalaxyWarpLogic`) i nazwy przez kanon mgły (Findingi 589, 592–594).
// Uruchom: node src/testing/smoke/galaxy_warp_logic_smoke.mjs
//
// T1  wpis menu — tabela dostępności na PRAWDZIWYM `canOrder` i planerze (ok / rezerwa / w tranzycie / ten sam układ / brak paliwa /
//     bez napędu / brak trasy / brak bramki), priorytet bramka > trasa; zgodność z `beginJourney` co do planu (także prędkość)
// T2  etykieta PL + EN niezależnie od aktywnego języka, „Skoki: N” bez polskiej liczby mnogiej; aktywny język nietknięty
// T3  bramka mgły: `warpSystemLabel`, menu, podgląd, picker i TRZY linie startu skoku (`warpRoute.started`,
//     `vessel.interstellarLaunch`, linia `vessel:launched` w Dzienniku); KONTROLA: po zbadaniu te same linie niosą nazwę; AI nietknięte
// T4  podgląd trasy: linia, punkty z rolami, odcinki z zasięgiem, pola częściowe przy `insufficient_warp_fuel`, fail-closed bez paliwa
// T5  picker wg `canOrder` (Finding 593): orbita przy innym ciele jest na liście, rezerwa przyciemniona z powodem, AI / wrak / bez napędu poza
// T6  słownik odmowy: parzystość z dawną tabelą `_warpErrLabel` (przepisaną tu dosłownie) w obu językach, także gałęzie domyślne
// T7  (wycofany w G5-B — przyciski skoku zakładki Stratcom usunięte; toast odmowy z powodem: `galaxy_warp_ui_smoke` T2 / T4)
// T8  menu PPM per język (Finding 592) — prawdziwe `RightClickMenu.show`; dane pozycji nietknięte; powód wyłączenia przez słownik
// T9  picker planuje trasę (po G3, F1): wiersz, który odmówiłby przy kliku, jest odmówiony przed klikiem; zgodność z prawdziwym rozkazem; pamięć planu
// T10 Finding 602 (po G3, F2): kolumna „Dokąd” rejestru K3 przez kanon mgły — `buildShipEntry` i `buildRegistryRows`; KONTROLA: po skanie /
//     po zbadaniu nazwa wraca
//
// ⚠ `UIManager` nie importuje się pod node — wpięcie linii Dziennika to pin źródłowy (T3e); logika (`launchTargetLabel`) wykonaniem.
// ⚠ PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — flagi `galaxyWarp` / `fleetWarp` na stałe ON, ścieżki OFF i zakładka Stratcom usunięte):
//   T3 — kontrola OFF (stare linie startu z prawdziwą nazwą) wycofana; to, że przyrząd widzi nazwę, pinuje dalej wiersz „po zbadaniu
//   trzy linie niosą nazwę”; T3e — pin źródłowy `UIManager` na BEZWARUNKOWE `launchTargetLabel(mission)`, bez odczytu flagi (dawniej:
//   wywołanie za `galaxyWarp ?`); T7 — wycofany w całości: `warp_order_send` / `cluster_send_pick` i `_pendingSendSystemId` zniknęły
//   z zakładką Stratcom (toast odmowy z powodem pinują `galaxy_warp_ui_smoke` T2 — rozkaz z menu gwiazdy — i T4 — klik odmówionego
//   wiersza pickera); T8 — kontrole OFF (klient EN dostaje `labelPL`, polski literał powodu) wycofane, wiersze PL / EN zostają;
//   T10 — kontrola OFF (`mission.targetName`) wycofana, nazwę po skanie i po zbadaniu widzą wiersze obok. Ustawianie flagi w setupie
//   usunięte (klucza nie ma, nikt go nie czyta).

import '../headless/env.js';           // MUSI być pierwszy (localStorage dla i18n, atrapa DOM menu)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { t, tIn, setLocale, getLocale } from '../../i18n/i18n.js';
import { WarpRouteSystem } from '../../systems/WarpRouteSystem.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { planWarpRoute } from '../../utils/WarpRoutePlanner.js';
import { launchTargetLabel } from '../../utils/SystemRevealWorld.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { RightClickMenu } from '../../ui/RightClickMenu.js';
import { buildMenuOptions, menuOptionLabel, MENU_OPTIONS_BY_TARGET } from '../../data/RightClickMenuOptions.js';
import {
  warpMenuOption, warpPreview, sendPickerRows, sendPickerRowLines, refusalText, warpErrLabel, warpPlanOptions, warpSystemLabel,
} from '../../ui/GalaxyWarpLogic.js';
import { buildShipEntry } from '../../ui/FleetPictureLogic.js';
import { buildRegistryRows } from '../../ui/FleetRegistryLogic.js';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label); } };
const header = (s) => console.log('\n' + s);
const HERE = dirname(fileURLToPath(import.meta.url));

// Galaktyka: oś X, skok ≤ 10 LY. C i D nieznane, E imperium (intel), FAR poza zasięgiem każdego skoku.
const SYS = [
  { id: 'sys_home', name: 'Dom',     x: 0,   y: 0, z: 0, explored: true },
  { id: 'B',        name: 'Beta',    x: 5,   y: 0, z: 0, explored: true },
  { id: 'C',        name: 'Cygni',   x: 10,  y: 0, z: 0, explored: false },
  { id: 'D',        name: 'Deneb',   x: 15,  y: 0, z: 0, explored: false },
  { id: 'E',        name: 'Eridani', x: 20,  y: 0, z: 0, explored: false, empireId: 'emp_001' },
  { id: 'FAR',      name: 'Odlegly', x: 200, y: 0, z: 0, explored: false },
];
const scans = {};
const intel = {};
const RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };
const logs = [];
window.KOSMOS = {
  galaxyData: { systems: SYS },
  timeSystem: { gameTime: 0 },
  eventLogSystem: { push: (e) => logs.push(e.text) },
  observatorySystem: { getSystemScanResult: (id) => scans[id] ?? null },
  intelSystem: { isAtLeast: (emp, lvl) => (RANK[intel[emp]] ?? 0) >= (RANK[lvl] ?? 99) },
};
const K = window.KOSMOS;

const vm = Object.create(VesselManager.prototype);
vm._vessels = new Map();
K.vesselManager = vm;
const wrs = new WarpRouteSystem(vm);
K.warpRouteSystem = wrs;
const canOrder = (v) => wrs.canOrder(v);

let seq = 0;
function mk(over = {}) {
  const id = `v_${++seq}`;
  const v = {
    id, name: `Ship${seq}`, shipId: 'hull_frigate', isWreck: false,
    systemId: 'sys_home', status: 'idle',
    position: { x: 0, y: 0, state: 'docked', dockedAt: 'home_planet' },
    modules: ['engine_warp', 'warp_tank'],
    warpFuel: { current: 10, max: 10, consumption: 0.5, fuelType: 'warp_cores' },
    unpaidYears: 0, mission: null, warpRoute: null, missionLog: [],
    ...over,
  };
  vm._vessels.set(id, v);
  return v;
}
const menu = (vessel, targetSystemId, extra = {}) => warpMenuOption({ vessel, targetSystemId, systems: SYS, canOrder, ...extra });

// ── T1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T1 wpis menu — tabela dostępności');
{
  const good = menu(mk(), 'B');
  ok(good.available === true && good.reason === null, 'ok: dostępny, bez powodu');
  ok(good.hops === 1 && good.fuelNeed === 2.5 && good.fuelHave === 10 && good.etaYears > 0, 'ok: skoki, paliwo i ETA z planera');

  const reserve = menu(mk({ serviceState: 'stored' }), 'B');
  ok(reserve.available === false && reserve.reason === 'vessel_in_reserve', 'rezerwa: wyłączony z vessel_in_reserve');
  ok(reserve.hops === 1, 'rezerwa: trasa dalej policzona (bramka nie kasuje informacji)');

  const transit = menu(mk({ systemId: null, position: { x: 0, y: 0, state: 'in_transit', dockedAt: null } }), 'B');
  ok(transit.available === false && transit.reason === 'in_transit' && transit.hops === null,
    'w tranzycie: in_transit, bez trasy (układ null nie staje się domem — klasa 151)');

  const same = menu(mk(), 'sys_home');
  ok(same.available === false && same.reason === 'same_system' && same.hops === null, 'ten sam układ: same_system');

  const dry = menu(mk({ warpFuel: { current: 1, max: 10, consumption: 0.5 } }), 'D');
  ok(dry.available === false && dry.reason === 'insufficient_warp_fuel', 'brak paliwa: insufficient_warp_fuel');
  ok(dry.hops === 2 && dry.fuelNeed === 7.5 && dry.fuelHave === 1, 'brak paliwa: pola częściowe (skoki, potrzeba, stan baku)');

  const noWarp = menu(mk({ warpFuel: { current: 0, max: 0, consumption: 0 } }), 'B');
  ok(noWarp.available === false && noWarp.reason === 'not_warp_capable', 'bez napędu: not_warp_capable');

  const far = menu(mk(), 'FAR');
  ok(far.available === false && far.reason === 'no_route', 'poza zasięgiem skoku: no_route');

  const immob = menu(mk({ unpaidYears: 9 }), 'B');
  ok(immob.available === false && immob.reason === 'immobilized', 'bramka nad trasą: unieruchomiony przy wykonalnej trasie');

  const none = warpMenuOption({ vessel: mk(), targetSystemId: 'B', systems: SYS });
  ok(none.available === false && none.reason === 'not_player', 'fail-closed: brak `canOrder` = brak rozkazu');

  // Zgodność z rozkazem: to, co menu obiecuje, jest dokładnie trasą `beginJourney` (także prędkość — dwa różne napędy).
  for (const modules of [['engine_warp', 'warp_tank'], ['engine_warp_mk2', 'warp_tank']]) {
    const shown = menu(mk({ modules }), 'D');
    const v = mk({ modules });
    const res = wrs.beginJourney(v.id, 'D');
    ok(res.ok === true && JSON.stringify(shown.plan) === JSON.stringify(res.route),
      `plan menu === trasa beginJourney (moduły: ${modules.join('+') || 'brak'})`);
  }
  // Domyślna 2,5 LY/rok (brak modułów) ≠ 18 LY/rok z napędu: stała prędkość w modelu rozjechałaby `etaYears` z rozkazem wyżej.
  ok(warpPlanOptions(mk({ modules: ['engine_warp'] })).warpSpeed === 18 && warpPlanOptions(mk({ modules: [] })).warpSpeed === 2.5,
    'KONTROLA: prędkość liczona z modułów (zgodność wyżej nie jest jałowa)');
}

// ── T2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T2 etykieta PL + EN');
{
  const prev = getLocale();
  for (const active of ['pl', 'en']) {
    setLocale(active);
    const m = menu(mk(), 'B');
    const eta = m.etaYears.toFixed(1);
    ok(m.labelPL === `Skok do Beta — Skoki: 1 · ETA: ${eta} lat · Rdzenie: 2.5 / 10.0`, `aktywny ${active}: labelPL co do znaku`);
    ok(m.labelEN === `Warp to Beta — Hops: 1 · ETA: ${eta} yr · Cores: 2.5 / 10.0`, `aktywny ${active}: labelEN co do znaku`);
    ok(getLocale() === active, `aktywny ${active}: model nie przestawia języka`);
  }
  setLocale(prev);
  const far = menu(mk(), 'FAR');
  ok(far.labelPL === 'Skok do ???' && far.labelEN === 'Warp to ???', 'bez trasy: sam tytuł (bez pustych „Skoki: null”)');
  const dry = menu(mk({ warpFuel: { current: 1, max: 10, consumption: 0.5 } }), 'B');
  ok(dry.labelPL.includes('Rdzenie: 2.5 / 1.0'), 'brak paliwa: etykieta pokazuje potrzebę i stan baku');
  ok(!/skok(ów|i)\b/.test(menu(mk(), 'D').labelPL), 'brzmienie neutralne: bez „2 skoków” / „2 skoki” (klasa 563)');
  ok(tIn('en', 'galaxyMenu.warpTo', 'X') === 'Warp to X' && tIn('pl', 'galaxyMenu.warpTo', 'X') === 'Skok do X', 'klucz galaxyMenu.warpTo w obu językach');
  ok(t('fleet.warpHops', '2') === tIn(getLocale(), 'fleet.warpHops', '2'), '`t` = `tIn` w aktywnym języku');
}

// ── T3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T3 bramka mgły na nazwach');
{
  ok(warpSystemLabel('B') === 'Beta', 'zbadany → nazwa');
  ok(warpSystemLabel('sys_home') === 'Dom', 'dom → nazwa');
  ok(warpSystemLabel('C') === '???', 'niezbadany → ???');
  ok(warpSystemLabel('E') === '???', 'cudzy bez wywiadu → ???');
  intel.emp_001 = 'rumor';
  ok(warpSystemLabel('E') === 'Eridani', 'rumor → nazwa (D-188-1)');
  delete intel.emp_001;
  scans.C = { tier: 1 };
  ok(warpSystemLabel('C') === 'Cygni', 'ukończony skan → nazwa');
  delete scans.C;
  ok(warpSystemLabel('nope') === '???' && warpSystemLabel(null) === '???', 'układ spoza danych / null → ??? (nigdy surowe id)');
  ok(warpSystemLabel('C', { galaxyData: { systems: [{ id: 'C', name: 'Atrapa', explored: true }] } }) === 'Atrapa', 'jawny lokator K działa (czystość względem świata)');

  // Menu, podgląd, picker.
  const m = menu(mk(), 'C');
  ok(m.targetName === '???' && m.labelPL.startsWith('Skok do ???') && m.labelEN.startsWith('Warp to ???'), 'menu: niezbadany cel = ???');
  ok(!m.labelPL.includes('Cygni') && !m.labelEN.includes('Cygni'), 'menu: nazwa nie przecieka');
  scans.C = { tier: 1 };
  ok(menu(mk(), 'C').labelEN.startsWith('Warp to Cygni'), 'menu: po skanie nazwa wraca');
  delete scans.C;

  const pv = warpPreview(menu(mk(), 'D').plan, SYS);
  ok(pv.hopPoints.length === 3 && pv.hopPoints.every(p => {
    const s = SYS.find(x => x.id === p.systemId);
    return p.label === (s.explored ? s.name : '???');
  }), 'podgląd: etykieta każdego przeskoku wg kanonu');
  ok(pv.hopPoints.at(-1).label === '???', 'podgląd: niezbadany cel = ???');

  const rows = sendPickerRows([mk({ systemId: 'C', position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'x' } })], 'B', canOrder);
  ok(rows[0]?.whereLabel === '???', 'picker: położenie statku w niezbadanym układzie = ???');

  // Linie startu skoku — prawdziwe `beginJourney` / `dispatchInterstellar`.
  const launchLine = (v) => v.missionLog.at(-1)?.text ?? '';
  logs.length = 0;
  const v1 = mk();
  ok(wrs.beginJourney(v1.id, 'C').ok === true, 'skok na niezbadany cel startuje (mgła nie blokuje rozkazu)');
  ok(logs.some(x => x.includes('???')) && !logs.some(x => x.includes('Cygni')), 'warpRoute.started: ??? zamiast nazwy');
  ok(launchLine(v1).includes('???') && !launchLine(v1).includes('Cygni'), 'vessel.interstellarLaunch: ??? zamiast nazwy');
  ok(launchTargetLabel(v1.mission) === '???', 'linia vessel:launched: ??? zamiast nazwy');
  ok(v1.mission.targetName === 'Cygni', '`mission.targetName` zostaje prawdziwy (czytają go powierzchnie po przylocie)');

  SYS.find(s => s.id === 'C').explored = true;
  logs.length = 0;
  const v2 = mk();
  wrs.beginJourney(v2.id, 'C');
  ok(logs.some(x => x.includes('Cygni')) && launchLine(v2).includes('Cygni') && launchTargetLabel(v2.mission) === 'Cygni', 'po zbadaniu trzy linie niosą nazwę');
  SYS.find(s => s.id === 'C').explored = false;

  const ai = mk({ ownerEmpireId: 'emp_001' });
  vm.dispatchInterstellar(ai.id, 'C');
  ok(launchLine(ai).includes('Cygni'), 'KONTROLA AI: dziennik misji imperium nietknięty');

  ok(launchTargetLabel({ type: 'colony', targetName: 'Kolonia X' }) === 'Kolonia X' && launchTargetLabel(null) === '?', 'misje poza skokiem jak dotąd');

  // T3e — wpięcie linii Dziennika (UIManager nie importuje się pod node).
  const src = readFileSync(join(HERE, '../../scenes/UIManager.js'), 'utf8').replace(/\r\n/g, '\n');
  const at = src.indexOf("EventBus.on('vessel:launched'");
  const body = at >= 0 ? src.slice(at, src.indexOf('EventBus.on(', at + 10)) : '';
  const code = body.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  // G5-B: wywołanie bezwarunkowe — żadnego odczytu flagi i żadnej gałęzi z `mission.targetName` obok.
  ok(body.length > 0 && /const\s+launchTarget\s*=\s*launchTargetLabel\(mission\)\s*;/.test(code) && !/FEATURES|galaxyWarp/.test(code),
    'UIManager: linia startu idzie przez launchTargetLabel bezwarunkowo (bez odczytu flagi)');
  ok(/t\('log\.el\.vesselLaunched',[^)]*launchTarget\b/.test(code), 'UIManager: wynik trafia do linii Dziennika');
}

// ── T4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T4 podgląd trasy');
{
  const fullTank = warpPreview(menu(mk(), 'D').plan, SYS, { currentFuel: 10 });
  ok(fullTank.ok === true && fullTank.reason === null, 'plan wykonalny: ok, bez powodu');
  ok(fullTank.polyline.length === 3 && fullTank.polyline[0].x === 0 && fullTank.polyline.at(-1).x === 15, 'linia przez układy trasy (galaktyczne LY)');
  ok(fullTank.hopPoints.map(p => p.role).join() === 'origin,hop,target', 'punkty z rolami');
  ok(fullTank.legs.length === 2 && fullTank.legs.every(l => l.reachable === true), 'wszystkie odcinki w zasięgu');
  ok(fullTank.totalLY === 15 && fullTank.totalFuel === 7.5 && fullTank.etaYears > 0, 'sumy z planera');
  ok(warpPreview(menu(mk(), 'D').plan, SYS).legs.every(l => l.reachable), 'plan wykonalny bez podanego paliwa: w zasięgu (planer już to policzył)');

  const short = planWarpRoute(SYS, 'sys_home', 'D', { maxHopLY: 10, currentFuel: 3, consumption: 0.5, warpSpeed: 2 });
  ok(short.reason === 'insufficient_warp_fuel', 'KONTROLA fixture: plan częściowy');
  const pv = warpPreview(short, SYS, { currentFuel: 3 });
  ok(pv.ok === false && pv.reason === 'insufficient_warp_fuel', 'plan częściowy: powód na podglądzie');
  ok(pv.polyline.length === 3 && pv.legs.length === 2, 'plan częściowy: linia i odcinki są');
  ok(pv.legs[0].reachable === true && pv.legs[1].reachable === false, 'odcinek osiągalny tylko do wyczerpania baku narastająco');
  ok(pv.fuelShort === 4.5, 'niedobór paliwa policzony');
  // Każdy odcinek z osobna mieści się w baku (2,5 ≤ 3), suma nie: zasięg liczony narastająco, nie per odcinek.
  const PQR = [{ id: 'P', x: 0, y: 0, z: 0 }, { id: 'Q', x: 5, y: 0, z: 0 }, { id: 'R', x: 10, y: 0, z: 0 }];
  const even = planWarpRoute(PQR, 'P', 'R', { maxHopLY: 5, currentFuel: 3, consumption: 0.5, warpSpeed: 2 });
  const evenPv = warpPreview(even, PQR, { currentFuel: 3 });
  ok(evenPv.legs.length === 2 && evenPv.legs[0].reachable === true && evenPv.legs[1].reachable === false, 'zasięg narastająco: drugi z równych odcinków poza bakiem');
  const noFuel = warpPreview(short, SYS);
  ok(noFuel.legs.every(l => l.reachable === false) && noFuel.fuelShort === null, 'fail-closed: bez `currentFuel` plan odrzucony nie ma odcinka w zasięgu');

  const same = warpPreview(planWarpRoute(SYS, 'B', 'B', {}), SYS);
  ok(same.reason === 'same_system' && same.polyline.length === 0 && same.legs.length === 0 && same.hopPoints.length === 0, 'bez trasy: puste listy + powód');
  const nul = warpPreview(null, SYS);
  ok(nul.ok === false && nul.polyline.length === 0, 'brak planu: pusty model, bez wyjątku');
}

// ── T5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T5 picker wg canOrder');
{
  const dockedHome = mk({ name: 'Docked' });
  const orbitingFar = mk({ name: 'Orbiter', systemId: 'B', position: { x: 1, y: 1, state: 'orbiting', dockedAt: 'moon_x' } });
  const drifting = mk({ name: 'Drifter', position: { x: 1, y: 1, state: 'orbiting', dockedAt: null }, status: 'on_mission' });
  const stored = mk({ name: 'Stored', serviceState: 'stored' });
  const transit = mk({ name: 'Transit', systemId: null, position: { x: 0, y: 0, state: 'in_transit', dockedAt: null } });
  const atTarget = mk({ name: 'AtTarget', systemId: 'C', position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'c1' } });
  const noWarp = mk({ name: 'NoWarp', warpFuel: { current: 0, max: 0, consumption: 0 } });
  const wreck = mk({ name: 'Wreck', isWreck: true });
  const enemy = mk({ name: 'Enemy', ownerEmpireId: 'emp_001' });
  const rows = sendPickerRows([stored, dockedHome, orbitingFar, transit, drifting, atTarget, noWarp, wreck, enemy], 'C', canOrder);
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  ok(by.Docked?.ok === true && by.Orbiter?.ok === true, 'zadokowany i orbitujący w innym układzie: zdolne (Finding 593)');
  ok(by.Drifter?.ok === true, 'dryfujący: zdolny (canOrder przyjmuje orbiting, nie „zadokowany przy aktywnej kolonii”)');
  ok(by.Stored?.ok === false && by.Stored.reason === 'vessel_in_reserve' && by.Stored.reasonText === refusalText('vessel_in_reserve'), 'rezerwa: na liście, odmowa z powodem');
  ok(by.Transit?.ok === false && by.Transit.reason === 'in_transit', 'w tranzycie: na liście z powodem');
  ok(by.AtTarget?.ok === false && by.AtTarget.reason === 'same_system', 'już w układzie celu: same_system');
  ok(!by.NoWarp && !by.Wreck && !by.Enemy, 'bez napędu, wrak, statek AI: poza listą');
  ok(rows.map(r => r.name).join() === 'Docked,Orbiter,Drifter,Stored,Transit,AtTarget', 'najpierw zdolne, kolejność wejścia w grupie');
  ok(by.Docked.reason === null && by.Docked.reasonText === null && by.Docked.warpMax === 10, 'wiersz zdolny: bez powodu, z bakiem');
  ok(sendPickerRows([dockedHome], 'C').every(r => r.ok === false && r.reason === 'not_player'), 'fail-closed: brak `canOrder`');
  ok(sendPickerRows(null, 'C', canOrder).length === 0, 'brak statków: pusta lista');
}

// ── T6 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T6 słownik odmowy — parzystość z dawną tabelą');
{
  // Dawne ciało `FleetManagerOverlay._warpErrLabel` (7c49020), przepisane dosłownie.
  const oldLabel = (plan, gate) => {
    if (!gate.ok) {
      switch (gate.reason) {
        case 'in_transit':       return t('fleet.warpErrInTransit');
        case 'immobilized':      return t('fleet.warpErrImmobilized');
        case 'not_warp_capable': return t('fleet.warpErrConfig');
        default:                 return t('fleet.warpErrState');
      }
    }
    switch (plan.reason) {
      case 'same_system':            return t('fleet.warpErrSame');
      case 'no_route':               return t('fleet.warpErrNoRoute');
      case 'insufficient_warp_fuel': return t('fleet.warpErrFuel');
      case 'bad_config':
      case 'unknown_system':         return t('fleet.warpErrConfig');
      default:                       return t('fleet.warpErrNoRoute');
    }
  };
  const GATE = ['in_transit', 'immobilized', 'not_warp_capable', 'bad_state', 'not_player', 'cos_nowego'];
  const ROUTE = ['same_system', 'no_route', 'insufficient_warp_fuel', 'bad_config', 'unknown_system', 'dispatch_failed', 'no_vessel', undefined];
  const fmo = FleetManagerOverlay.prototype;
  const prev = getLocale();
  for (const lang of ['pl', 'en']) {
    setLocale(lang);
    ok(GATE.every(r => warpErrLabel(null, { ok: false, reason: r }) === oldLabel(null, { ok: false, reason: r })), `${lang}: gałąź bramki identyczna (z domyślną)`);
    ok(ROUTE.every(r => warpErrLabel({ reason: r }, { ok: true }) === oldLabel({ reason: r }, { ok: true })), `${lang}: gałąź trasy identyczna (z domyślną)`);
    ok(ROUTE.every(r => fmo._warpErrLabel({ reason: r }, { ok: true }) === oldLabel({ reason: r }, { ok: true }))
      && GATE.every(r => fmo._warpErrLabel(null, { ok: false, reason: r }) === oldLabel(null, { ok: false, reason: r })), `${lang}: FMO deleguje do tego samego słownika`);
    ok(['in_transit', 'immobilized', 'not_warp_capable', 'bad_state', 'not_player'].every(r => refusalText(r) === oldLabel(null, { ok: false, reason: r })), `${lang}: refusalText = bramka`);
    ok(['same_system', 'no_route', 'insufficient_warp_fuel', 'bad_config', 'unknown_system', 'dispatch_failed'].every(r => refusalText(r) === oldLabel({ reason: r }, { ok: true })), `${lang}: refusalText = trasa`);
    ok(refusalText('vessel_in_reserve') === t('vessel.reasonVesselInReserve') && warpErrLabel(null, { ok: false, reason: 'vessel_in_reserve' }) === t('vessel.reasonVesselInReserve'), `${lang}: powód rezerwy = klucz wspólny z MOS`);
  }
  setLocale(prev);
  ok(tIn('en', 'vessel.reasonVesselInReserve') !== tIn('pl', 'vessel.reasonVesselInReserve'), 'KONTROLA: klucz ma dwie wersje językowe (parzystość nie jest jałowa)');
}

// ── T7 — wycofany w G5-B (przyciski skoku zakładki Stratcom usunięte; zob. nagłówek) ─────────────────────────────────────────

// ── T8 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T8 menu PPM per język');
{
  K.uiManager = { getSelectedVesselId: () => 'v_1', getSelectedFleetId: () => null };
  const rcm = new RightClickMenu();
  const shown = () => {
    rcm.show({ type: 'empty', point: { x: 1, y: 1 } }, { x: 10, y: 10 });
    const kids = rcm._element?.children ?? rcm._element?.childNodes ?? [];
    const text = [...kids].map(c => c.textContent).join(' | ');
    rcm._element.remove ??= () => {};   // atrapa DOM bez `remove`
    rcm.hide();
    return text;
  };
  const prev = getLocale();
  setLocale('en');
  const en = shown();
  ok(en.includes('Move here') && !en.includes('Lecisz tutaj'), 'klient EN: menu po angielsku');
  setLocale('pl');
  const pl = shown();
  ok(pl.includes('Lecisz tutaj') && !pl.includes('Move here'), 'klient PL: menu po polsku');

  ok(menuOptionLabel({ labelPL: 'a' }) === 'a', 'pozycja bez labelEN: fallback na labelPL');
  const all = Object.values(MENU_OPTIONS_BY_TARGET).flat();
  ok(all.length > 0 && all.every(o => typeof o.labelPL === 'string' && typeof o.labelEN === 'string'), 'każda pozycja katalogu ma obie etykiety');
  ok(MENU_OPTIONS_BY_TARGET.empty[0].labelPL === 'Lecisz tutaj' && MENU_OPTIONS_BY_TARGET.empty[0].labelEN === 'Move here', 'dane pozycji nietknięte');

  // Gałąź powodu wyłączenia (`!selectedVesselId` przy pustym id — filtr wycina null, więc pusty napis to jedyne wejście).
  const reasonNow = () => buildMenuOptions({ type: 'empty' }, { vesselId: '' }).find(o => o.requiresSelection)?.disabledReason;
  setLocale('en');
  ok(reasonNow() === 'Select a vessel first', 'powód wyłączenia po angielsku przez tooltip.menu.requiresSelection');
  setLocale('pl');
  ok(reasonNow() === 'Najpierw wybierz statek', 'powód wyłączenia po polsku');
  setLocale(prev);
}

// ── T9 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T9 picker planuje trasę: odmowa przed klikiem');
{
  const fuel = (current) => ({ current, max: 10, consumption: 0.5, fuelType: 'warp_cores' });
  const fine = mk({ name: 'Fine' });
  const low = mk({ name: 'Low', warpFuel: fuel(0.2) });
  const lowStored = mk({ name: 'LowStored', warpFuel: fuel(0.2), serviceState: 'stored' });
  const rows = sendPickerRows([low, lowStored, fine], 'B', canOrder);
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  ok(by.Fine?.ok === true && by.Fine.reason === null, 'pełny bak: wiersz zdolny');
  ok(by.Low?.ok === false && by.Low.reason === 'insufficient_warp_fuel' && by.Low.reasonText === refusalText('insufficient_warp_fuel'),
    'SEDNO: za mało rdzeni: odmówiony z powodem PRZED klikiem');
  ok(sendPickerRowLines(by.Low).sub === refusalText('insufficient_warp_fuel') && sendPickerRowLines(by.Fine).sub === 'Dom',
    'druga linia wiersza: powód odmowy; KONTROLA: wiersz zdolny — położenie statku');
  ok(by.LowStored?.reason === 'vessel_in_reserve', 'priorytet jak w menu: bramka statku > trasa');
  ok(rows[0].name === 'Fine', 'odmówiony schodzi pod zdolne');
  const far = sendPickerRows([mk({ name: 'NoRoute' })], 'FAR', canOrder)[0];
  ok(far?.ok === false && far.reason === 'no_route' && far.reasonText === refusalText('no_route'), 'cel poza zasięgiem każdego skoku: no_route');

  // Zgodność z rozkazem: każdy wiersz mówi to samo, co prawdziwe `beginJourney` temu samemu statkowi.
  const table = [
    ['pełny bak', {}, 'B'], ['za mało rdzeni', { warpFuel: fuel(0.2) }, 'B'], ['trasa dwuskokowa', {}, 'D'], ['paliwo na jeden skok z dwóch', { warpFuel: fuel(3) }, 'D'],
    ['brak trasy', {}, 'FAR'], ['rezerwa', { serviceState: 'stored' }, 'B'], ['ten sam układ', {}, 'sys_home'],
    ['poza domem', { systemId: 'B', position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'x' } }, 'D'],
  ];
  const bad = [];
  for (const [label, over, target] of table) {
    const v = mk(over);
    const row = sendPickerRows([v], target, canOrder)[0];
    const res = wrs.beginJourney(v.id, target);
    if (row.ok !== (res.ok === true)) bad.push(`${label}: wiersz ${row.ok}/${row.reason}, rozkaz ${res.ok}/${res.reason}`);
  }
  ok(bad.length === 0 && table.some(([, o]) => o.warpFuel), `SEDNO: wiersz ≡ prawdziwy rozkaz w ${table.length} przypadkach (${bad.join(' | ') || 'zgodne'})`);

  // Pamięć planu: picker pyta co klatkę, planer biegnie raz na stan statku; zmiana baku unieważnia.
  let plans = 0;
  const spy = (...a) => { plans++; return planWarpRoute(...a); };
  const memo = mk({ name: 'Memo', warpFuel: fuel(0.2) });
  const askMemo = () => sendPickerRows([memo], 'B', canOrder, { planWarpRoute: spy })[0];
  const r1 = askMemo();
  askMemo(); askMemo();
  ok(plans === 1 && r1.ok === false, `planer raz na stan statku, nie co klatkę (wywołania: ${plans})`);
  memo.warpFuel.current = 10;
  const r2 = askMemo();
  ok(plans === 2 && r2.ok === true, 'zmiana baku: nowy plan, wiersz odzyskuje zdolność');
  const otherGalaxy = [...SYS];
  sendPickerRows([memo], 'B', canOrder, { planWarpRoute: spy, systems: otherGalaxy });
  ok(plans === 3, 'inna tablica układów: nowy plan');
}

// ── T10 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('T10 Finding 602: kolumna „Dokąd” przez kanon mgły');
{
  const C = SYS.find(s => s.id === 'C');
  C.explored = false;
  const v = mk({ name: 'Skoczek' });
  ok(wrs.beginJourney(v.id, 'C').ok === true && v.mission?.type === 'interstellar_jump' && v.mission.targetName === 'Cygni',
    'KONTROLA fixture: statek w skoku, `mission.targetName` = prawdziwa nazwa');
  const rowOf = () => buildRegistryRows([v], { systemName: (id) => id }).find(r => r.id === v.id);
  ok(buildShipEntry(v, {}).toName === '???' && rowOf()?.toName === '???', 'SEDNO: niezbadany cel w trakcie skoku — „???” we wpisie i w wierszu K3');
  ok(!JSON.stringify(rowOf()).includes('Cygni'), 'wiersz K3 nigdzie nie niesie prawdziwej nazwy');
  scans.C = { tier: 1 };
  ok(buildShipEntry(v, {}).toName === 'Cygni', 'po skanie nazwa wraca');
  delete scans.C;
  C.explored = true;
  ok(buildShipEntry(v, {}).toName === 'Cygni' && rowOf()?.toName === 'Cygni', 'układ zbadany: nazwa');
  C.explored = false;
  const other = mk({ name: 'Inna', mission: { type: 'transport', targetId: 'p1', targetName: 'Kolonia X', phase: 'transit' } });
  ok(buildShipEntry(other, {}).toName === 'Kolonia X', 'misje poza skokiem: nazwa z misji, bez kanonu');
}

console.log(`\ngalaxy_warp_logic: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
