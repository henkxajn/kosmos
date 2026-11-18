// KEEPER — (a') przyciski „Powrót do bazy" USUNIĘTE, zdolność powrotu ZOSTAJE.
//
// CO PINUJE (i dlaczego akurat to)
// Slice 145 zamiast dowozić prawdomówną fasadę (`OrderService.issueReturn` meldował `{ok:true}`
// na odmowie) USUWA cztery producenty przycisku: akcję `return_home` z listy akcji rejestru oraz
// trzy strefy panelu (`interstellar_return`, `foreign_return`, `foreign_return_from_recon`).
//
// ⚠ USUWAMY PRZYCISKI, NIE ZDOLNOŚĆ. Drogą do domu zostaje skok z mapy galaktyki (tryb G / M):
//   zaznaczony statek → PPM na gwieździe domowej → pozycja menu `galaxyStarMenuEntries` → `runGalaxyWarpOrder`
//   → `OrderService.issueWarp` (także [ Wyślij ▼ ] przypięcia gwiazdy). Bramka: `WarpRouteSystem.canOrder`.
// ⚠ A3 jest pinem pojedynczego punktu awarii i musi być zielony PO OBU stronach: gdyby padł, usunęlibyśmy zdolność,
//   a nie przycisk.
// ⚠ PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — zakładka Stratcom usunięta, D-GX-21): A3 pinował dawną drogę z mapy Stratcomu
//   (`_drawWarpShipList` → `warp_order_send` z `_drawWarpOrderPanel`). Panel rozkazu zniknął z zakładką, więc A3 czyta jej
//   następcę z G3: menu gwiazdy domu w trybie galaktyki (`galaxyStarMenuEntries`) i rozkaz `runGalaxyWarpOrder` — ten sam
//   statek na obcej orbicie, ten sam cel. Zamiar bez zmian (zdolność powrotu z mapy zostaje); wzór — `galaxy_warp_ui` T6.
//
// A1  PIN   — `return_home` nie wychodzi z `_getAvailableActions` w ŻADNYM stanie
// A2  PIN   — trzy strefy powrotu nie są renderowane przez żaden panel (żywe: inspektor konsoli + panel statku HUD)
//             i nie mają producenta ani handlera nigdzie w `src/`
// A3  KONTROLA — mapa galaktyki DALEJ wysyła statek z obcej orbity do domu (menu gwiazdy domu, G3)
// A4  KONTROLA — `canOrder`: obca orbita OK, `in_transit` odmowa (bramka nietknięta)
// A5  KONTROLA — silnikowa ścieżka powrotu (`OrderService.issueReturn`, `FleetActions.return_home`) DALEJ dyspozycjonuje skok
//
// ⚠ PRZECELOWANE (KZ-Command — dawny panel `_drawRight`, strefy `interstellar_return` / `foreign_return` /
//   `foreign_return_from_recon` i ich wrapper `_dispatchReturnJump` usunięte z FMO; strefy nie miały producenta od (a')):
//   A2 renderuje ŻYWE powierzchnie panelu statku — inspektor konsoli Dowództwa (`CommandInspectorView.drawInspector`) i panel
//   statku HUD (`ShipPanelHudLogic.buildShipPanelModel`) — i dokłada pin całego produktu (napis typu strefy nie występuje
//   w kodzie `src/`, świadek `'cluster_switch'`); A5 — „sweep 127” się dokonał: silnikowa droga powrotu to fasada
//   `OrderService.issueReturn` (i bliźniak `FleetActions.return_home`), obie przez `returnJumpTransactional`.
// A6  PIN ŹRÓDŁOWY — komentarze w `issueOrder` nie powołują się już na przycisk powrotu
// A7  ZAPIS SKUTKU — lista akcji statku `in_transit` robi się PUSTA (PPM jedyną powierzchnią)
//
// Uruchom: node src/testing/smoke/return_actions_removed_smoke.mjs

import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  body: { appendChild() {}, removeChild() {} }, addEventListener() {},
};
globalThis.localStorage = {
  _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }, key(i) { return Object.keys(this._s)[i] ?? null; },
  get length() { return Object.keys(this._s).length; },
};

const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');
const IV                      = await import('../../ui/CommandInspectorView.js');
const { consoleRoles }        = await import('../../ui/ConsoleRolesLogic.js');
const L5                      = await import('../../ui/ShipPanelHudLogic.js');
const { OrderService }        = await import('../../systems/OrderService.js');
const { FLEET_ACTIONS }       = await import('../../data/FleetActions.js');
const { getAvailableActions } = await import('../../data/FleetActions.js');
const { WarpRouteSystem }     = await import('../../systems/WarpRouteSystem.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n--- ' + s + ' ---');

const vessels = new Map();
let warpCalls = [];
const vesselManager = {
  getVessel: id => vessels.get(id),
  getAllVessels: () => [...vessels.values()],
  _findEntity: id => (id === 'planet_home' ? { id, systemId: 'sys_home', x: 0, y: 0, name: 'Dom' } : null),
  isImmobilized: () => false,
  abortForeignRecon: () => {},
  dispatchInterstellar: (id, sys) => { warpCalls.push({ id, sys }); return true; },
};
const colonyManager = { getColony: () => null, hasColony: () => false, activePlanetId: 'planet_home' };
const missionSystem = { getActive: () => [], cancelMission() {} };

function makeVessel(over = {}) {
  return {
    id: 'v_1', name: 'Dyplomata', shipId: 'hull_medium',
    systemId: 'sys_061', colonyId: 'planet_home', homeColonyId: 'planet_home',
    status: 'on_mission',
    position: { state: 'orbiting', dockedAt: 'planet_foreign', x: 400, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'planet_foreign', originId: 'sys_home' },
    fuel: { current: 60, max: 60, consumption: 1 },
    warpFuel: { current: 3, max: 4, consumption: 0.5 },
    speedAU: 1, modules: [], cargo: {}, cargoUsed: 0, missionLog: [],
    pendingOrder: null, warpRoute: null, movementOrder: null, serviceState: 'active',
    isWreck: false, unpaidYears: 0,
    ...over,
  };
}

const GALAXY = { systems: [
  { id: 'sys_home', name: 'Dom',  x: 0,  y: 0, z: 0, isHome: true,  explored: true },
  { id: 'sys_061',  name: 'Obcy', x: 3,  y: 0, z: 0, isHome: false, explored: true },
] };

globalThis.KOSMOS = {
  vesselManager, colonyManager, missionSystem,
  timeSystem: { gameTime: 40 },
  galaxyData: GALAXY,
  orderService: { issueWarp: (id, sys) => { warpCalls.push({ id, sys }); return { ok: true }; } },
  warpRouteSystem: null,
  starSystemManager: { getSystem: (id) => (id === 'sys_home' || id === 'sys_061' ? { systemId: id } : null) },
};

/** Atrapa ctx 2D — wzór `return_home_no_brick_smoke` T12. */
function makeCtx(drawn) {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '11px mono', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    closePath() {}, save() {}, restore() {}, clip() {}, rect() {}, setLineDash() {}, getTransform() { return { a: 1, d: 1 }; },
    fillText(txt) { drawn.push(String(txt)); }, measureText(s) { return { width: String(s).length * 6 }; },
    createRadialGradient() { return { addColorStop() {} }; }, createConicGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; }, drawImage() {}, ellipse() {},
    quadraticCurveTo() {}, bezierCurveTo() {},
  };
}

/** Żywe powierzchnie panelu statku: inspektor konsoli (strefy z rysunku) + panel statku HUD (strefy modelu). */
function renderRight(mission) {
  vessels.clear(); vessels.set('v_1', makeVessel({ mission }));
  const o = new FleetManagerOverlay();
  o._selectedVesselId = 'v_1'; o._hitZones = []; o._cmdDisabled = []; o._cmdTip = null;
  const drawn = [];
  IV.drawInspector(o, makeCtx(drawn), { x: 900, y: 60, w: 294, h: 4000 }, consoleRoles(),
    { vMgr: vesselManager, ms: missionSystem, colMgr: colonyManager, activePid: 'planet_home' });
  const hud = L5.modelZones(L5.buildShipPanelModel(vessels.get('v_1'), { K: globalThis.KOSMOS, fmo: o })).map(z => z.type);
  return { drawn, zones: [...o._hitZones.map(z => z.type), ...hud], insp: o._hitZones.map(z => z.type), hud };
}

// ── A1 — akcja `return_home` nie wychodzi z listy akcji ───────────────────────────────────────
header('A1 `return_home` nie wychodzi z _getAvailableActions w ŻADNYM stanie');
const state = { missionSystem, vesselManager, colonyManager, techSystem: null, activePlanetId: 'planet_home' };
for (const [label, v] of [
  ['orbiting', makeVessel()],
  ['in_transit', makeVessel({ position: { state: 'in_transit', dockedAt: null, x: 400, y: 0 } })],
  ['docked', makeVessel({ position: { state: 'docked', dockedAt: 'planet_home', x: 0, y: 0 }, status: 'idle' })],
]) {
  const ids = (getAvailableActions(v, state) ?? []).map(a => a.action?.id ?? a.id);
  ok(!ids.includes('return_home'), `stan ${label}: brak return_home (jest: ${JSON.stringify(ids)})`);
}

// ── A2 — trzy strefy powrotu nie są renderowane ───────────────────────────────────────────────
header('A2 panele NIE wystawiają stref powrotu');
const arrival = renderRight({ type: 'interstellar_jump', phase: 'in_system', toSystemId: 'sys_061', fromSystemId: 'sys_home', targetName: 'Obcy' });
const orbit   = renderRight({ type: 'exploration', phase: 'orbiting_body', targetId: 'planet_foreign', originId: 'sys_home' });
const recon   = renderRight({ type: 'foreign_recon', scope: 'target', targetId: 'planet_foreign', originId: 'sys_home', phase: 'scanning' });
for (const [label, r] of [['Interstellar Arrival', arrival], ['orbita obcego ciała', orbit], ['rekon w toku', recon]]) {
  const rets = r.zones.filter(z => /return/i.test(z));
  ok(rets.length === 0, `ekran „${label}" bez stref powrotu (znaleziono: ${JSON.stringify(rets)})`);
}
ok(arrival.insp.includes('cluster_switch') && arrival.hud.includes('cluster_switch'),
  'KONTROLA PINU: ekran Interstellar Arrival FAKTYCZNIE się narysował na obu powierzchniach (ma cluster_switch) — ' +
  'brak stref powrotu nie bierze się z braku rysowania');
// Pin całego produktu: trzy typy stref powrotu nie występują jako napis w kodzie `src/` (komentarze zdjęte, bez `src/testing/`
// i `src/lib/`) — ani producent, ani `case` handlera. Świadek: `'cluster_switch'` (producent + handler) JEST w tym samym tekście.
{
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const strip = (t) => t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) { if (n !== 'testing' && n !== 'lib') walk(f); } else if (n.endsWith('.js')) files.push(f); } };
  walk(root);
  const code = files.map((f) => strip(readFileSync(f, 'utf8'))).join('\n');
  const hits = ['interstellar_return', 'foreign_return', 'foreign_return_from_recon'].filter((z) => code.includes(`'${z}'`));
  ok(files.length > 100 && code.includes("case 'cluster_switch':") && code.includes("zone('cluster_switch'") && hits.length === 0,
    `strefy powrotu bez producenta i bez handlera w CAŁYM src/ (plików ${files.length}; trafienia: ${JSON.stringify(hits)})`);
  const P = FleetManagerOverlay.prototype;
  ok(typeof P._dispatchReturnJump === 'undefined' && typeof P._toastReturnFailed === 'function',
    'FMO: wrapper `_dispatchReturnJump` usunięty razem z jedynymi wołającymi; komunikat odmowy `_toastReturnFailed` zostaje');
}

// ── A3 — KONTROLA: mapa galaktyki dalej wysyła do domu (POJEDYNCZY PUNKT AWARII) ──────────────
header('A3 KONTROLA — menu gwiazdy domu w trybie galaktyki wysyła statek z obcej orbity do domu');
vessels.clear(); vessels.set('v_1', makeVessel());
globalThis.KOSMOS.warpRouteSystem = new WarpRouteSystem(vesselManager);
globalThis.KOSMOS.uiManager = { getSelectedVesselId: () => 'v_1', getSelectedVesselIds: () => ['v_1'], getSelectedFleetId: () => null };
const { galaxyStarMenuEntries, runGalaxyWarpOrder } = await import('../../ui/GalaxyWarpLogic.js');
const e3 = galaxyStarMenuEntries('sys_home', globalThis.KOSMOS)[0] ?? null;
ok(!!e3, 'KONTROLA PINU: menu gwiazdy domu ma pozycję dla zaznaczonego statku');
ok(e3?.enabled === true && e3.action === 'issueGalaxyWarp' && (e3.vesselIds ?? []).includes('v_1'),
  `statek na obcej orbicie MOŻE zostać wysłany do domu z mapy galaktyki (pozycja: ${JSON.stringify({ enabled: e3?.enabled, action: e3?.action, reason: e3?.disabledReason })})`);
warpCalls = [];
const r3 = runGalaxyWarpOrder({ vesselIds: e3?.vesselIds ?? [], targetSystemId: 'sys_home', K: globalThis.KOSMOS });
ok(r3?.moved === 1 && warpCalls.some((c) => c.id === 'v_1' && c.sys === 'sys_home'),
  `rozkaz z menu idzie przez OrderService.issueWarp do domu (wywołania: ${JSON.stringify(warpCalls)})`);
delete globalThis.KOSMOS.uiManager;

// ── A4 — KONTROLA: bramka canOrder nietknięta ─────────────────────────────────────────────────
header('A4 KONTROLA — canOrder: obca orbita OK, in_transit odmowa');
const wrs = new WarpRouteSystem(vesselManager);
ok(wrs.canOrder(makeVessel()).ok === true, 'statek na obcej orbicie: canOrder OK');
ok(wrs.canOrder(makeVessel({ position: { state: 'in_transit', dockedAt: null, x: 1, y: 0 } })).reason === 'in_transit',
  'statek w locie in-system: dalej odmowa in_transit (bramka nietknięta)');

// ── A5 — KONTROLA: silnikowa ścieżka powrotu ŻYJE (usuwamy przycisk, nie zdolność) ────────────
// KZ-Command: handler strefy `foreign_return` usunięty (sweep 127 — martwy kod); silnikową drogą powrotu jest fasada
// `OrderService.issueReturn` (żywa konsumentka: `FleetManagerOverlay._handleAction`) i jej bliźniak `FleetActions.return_home`.
header('A5 KONTROLA — OrderService.issueReturn i FleetActions.return_home dalej dyspozycjonują skok do domu');
vessels.clear(); vessels.set('v_1', makeVessel());
warpCalls = [];
const os5 = new OrderService();
const r5 = os5.issueReturn('v_1');
ok(r5 === true || r5?.ok === true, `OrderService.issueReturn z obcej orbity: przyjęte (${JSON.stringify(r5)})`);
ok(warpCalls.length === 1 && warpCalls[0].id === 'v_1' && warpCalls[0].sys === 'sys_home',
  `fasada wydała skok do domu (${JSON.stringify(warpCalls)})`);
vessels.clear(); vessels.set('v_1', makeVessel());
warpCalls = [];
FLEET_ACTIONS.return_home.execute(vessels.get('v_1'), { vesselManager, missionSystem });
ok(warpCalls.length === 1 && warpCalls[0].sys === 'sys_home',
  `bliźniak FleetActions.return_home też wydaje skok do domu (${JSON.stringify(warpCalls)})`);

// ── A6 — PIN ŹRÓDŁOWY: komentarze issueOrder już nie kłamią ───────────────────────────────────
header('A6 PIN ŹRÓDŁOWY — issueOrder nie powołuje się na przycisk powrotu');
const mosSrc = readFileSync(new URL('../../systems/MovementOrderSystem.js', import.meta.url), 'utf8');
const iStart = mosSrc.indexOf('issueOrder(vesselId, spec');
// ⚠ OKNO ANCHOROWANE STRUKTURALNIE, NIE ROZMIAREM. Stało tu `iStart + 3000` i kontrola pinu
//   niżej PADŁA, gdy Finding 147 dołożył do `issueOrder` termin tranzytu warp z opisem —
//   `vessel_in_reserve` wypadło za 3000 znaków, czyli pin nad nią stał się częściowo jałowy.
//   Kontrola zrobiła dokładnie to, do czego jest. Teraz okno to CAŁE ciało `issueOrder`:
//   od jego nagłówka do definicji `_dispatchByType`, która stoi bezpośrednio za nim.
//   Ta sama lekcja co `fleet_clock_band` T4 (sztywne proxy → inwariant strukturalny).
const iEnd = mosSrc.indexOf('_dispatchByType(vessel, spec) {', iStart);
ok(iStart >= 0 && iEnd > iStart,
  `KONTROLA PINU: obie kotwice okna znalezione (iStart=${iStart}, iEnd=${iEnd}) — bez tego okno byłoby puste`);
const win = mosSrc.slice(iStart, iEnd);
ok(!/Powrót do bazy idzie przez/.test(win),
  'zdanie „Powrót do bazy idzie przez VesselManager.startReturn … pozostaje dozwolony" USUNIĘTE ' +
  '(po (a\') nie ma już takiego przycisku — komentarz byłby kłamstwem)');
ok(/vessel_immobilized/.test(win) && /vessel_in_reserve/.test(win),
  'KONTROLA PINU: okno źródła obejmuje OBIE bramki (pin nie jest jałowy)');

// ── A7 — ZAPIS SKUTKU: lista akcji w locie jest pusta ─────────────────────────────────────────
header('A7 ZAPIS SKUTKU — statek in_transit nie ma już żadnej akcji w rejestrze');
const inFlight = (getAvailableActions(makeVessel({ position: { state: 'in_transit', dockedAt: null, x: 400, y: 0 } }), state) ?? []);
ok(inFlight.length === 0,
  `lista akcji statku w locie jest PUSTA (${inFlight.length}) — PPM na mapie zostaje jedyną ` +
  'powierzchnią rozkazu dla statku w locie. To jest ZAPISANY SKUTEK (a\'), nie defekt');

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
