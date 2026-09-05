// KEEPER — (a') przyciski „Powrót do bazy" USUNIĘTE, zdolność powrotu ZOSTAJE.
//
// CO PINUJE (i dlaczego akurat to)
// Slice 145 zamiast dowozić prawdomówną fasadę (`OrderService.issueReturn` meldował `{ok:true}`
// na odmowie) USUWA cztery producenty przycisku: akcję `return_home` z listy akcji rejestru oraz
// trzy strefy panelu (`interstellar_return`, `foreign_return`, `foreign_return_from_recon`).
//
// ⚠ USUWAMY PRZYCISKI, NIE ZDOLNOŚĆ. Drogą do domu zostaje wysyłka z mapy galaktyki:
//   `_drawWarpShipList` (BEZ filtra stanu — listuje każdy statek gracza z bakiem warp)
//   → `warp_ship_select` → klik gwiazdy domowej → `_drawWarpOrderPanel` → `warp_order_send`
//   → `OrderService.issueWarp`. `WarpRouteSystem.canOrder` blokuje WYŁĄCZNIE `in_transit`.
// ⚠ To jest JEDYNA droga z mapy — druga (`cluster_send` w panelu detalu) jest schowana dla domu
//   (`FMO:6367  if (!sys.isHome)`). Dlatego A3 jest pinem pojedynczego punktu awarii i musi być
//   zielony PO OBU stronach: gdyby padł, usunęlibyśmy zdolność, a nie przycisk.
//
// A1  PIN   — `return_home` nie wychodzi z `_getAvailableActions` w ŻADNYM stanie
// A2  PIN   — trzy strefy powrotu nie są renderowane przez żaden panel
// A3  KONTROLA — mapa galaktyki DALEJ wystawia `warp_order_send` dla statku na obcej orbicie
// A4  KONTROLA — `canOrder`: obca orbita OK, `in_transit` odmowa (bramka nietknięta)
// A5  KONTROLA — silnikowa ścieżka powrotu (handler `foreign_return`) DALEJ dyspozycjonuje skok
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

function renderRight(mission) {
  vessels.clear(); vessels.set('v_1', makeVessel({ mission }));
  const o = Object.create(FleetManagerOverlay.prototype);
  o._selectedVesselId = 'v_1'; o._hitZones = []; o._rightViewH = 0; o._rightContentH = 0;
  o._collapsedFleets = new Set(); o._collapsedSections = new Set();
  const drawn = [];
  o._drawRight(makeCtx(drawn), 600, 60, 320, 700, vesselManager, missionSystem, colonyManager, 'planet_home');
  return { drawn, zones: o._hitZones.map(z => z.type) };
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
ok(arrival.zones.includes('cluster_switch'),
  'KONTROLA PINU: ekran Interstellar Arrival FAKTYCZNIE się narysował (ma cluster_switch) — ' +
  'brak stref powrotu nie bierze się z braku rysowania');

// ── A3 — KONTROLA: mapa galaktyki dalej wysyła do domu (POJEDYNCZY PUNKT AWARII) ──────────────
header('A3 KONTROLA — `_drawWarpOrderPanel` dalej wystawia warp_order_send dla statku na obcej orbicie');
vessels.clear(); vessels.set('v_1', makeVessel());
globalThis.KOSMOS.warpRouteSystem = new WarpRouteSystem(vesselManager);
const o3 = Object.create(FleetManagerOverlay.prototype);
o3._selectedWarpShipId = 'v_1'; o3._hitZones = [];
const drawn3 = [];
o3._drawWarpOrderPanel(makeCtx(drawn3), 0, 0, 900, 700, GALAXY.systems[0], vesselManager);
const z3 = o3._hitZones.map(z => z.type);
ok(drawn3.length > 0, 'KONTROLA PINU: panel rozkazu warp faktycznie się narysował');
ok(z3.includes('warp_order_send'),
  `statek na obcej orbicie MOŻE zostać wysłany do domu z mapy (strefy: ${JSON.stringify(z3)}) — ` +
  'to JEDYNA droga z mapy, bo cluster_send jest schowany dla domu (FMO:6367)');

// ── A4 — KONTROLA: bramka canOrder nietknięta ─────────────────────────────────────────────────
header('A4 KONTROLA — canOrder: obca orbita OK, in_transit odmowa');
const wrs = new WarpRouteSystem(vesselManager);
ok(wrs.canOrder(makeVessel()).ok === true, 'statek na obcej orbicie: canOrder OK');
ok(wrs.canOrder(makeVessel({ position: { state: 'in_transit', dockedAt: null, x: 1, y: 0 } })).reason === 'in_transit',
  'statek w locie in-system: dalej odmowa in_transit (bramka nietknięta)');

// ── A5 — KONTROLA: silnikowa ścieżka powrotu ŻYJE (usuwamy przycisk, nie zdolność) ────────────
header('A5 KONTROLA — handler foreign_return dalej dyspozycjonuje skok');
vessels.clear(); vessels.set('v_1', makeVessel());
warpCalls = [];
const o5 = Object.create(FleetManagerOverlay.prototype);
o5._hitZones = [];
o5._handleHit({ type: 'foreign_return', data: { vesselId: 'v_1', fromSystemId: 'sys_home' } });
ok(warpCalls.length === 1 && warpCalls[0].sys === 'sys_home',
  `ścieżka silnikowa nietknięta — skok do domu wydany (${JSON.stringify(warpCalls)}); ` +
  'dead code sprząta osobny sweep 127, nie ten commit');

// ── A6 — PIN ŹRÓDŁOWY: komentarze issueOrder już nie kłamią ───────────────────────────────────
header('A6 PIN ŹRÓDŁOWY — issueOrder nie powołuje się na przycisk powrotu');
const mosSrc = readFileSync(new URL('../../systems/MovementOrderSystem.js', import.meta.url), 'utf8');
const iStart = mosSrc.indexOf('issueOrder(vesselId, spec');
const win = mosSrc.slice(iStart, iStart + 3000);
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
