// Smoke: STRATCOM warp UI (lista statków + marker + panel rozkazu + handlery).
// Render headless = no-throw (canvas mock). Uruchom: node tmp_warp_stratcom_smoke.mjs
globalThis.localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style:{}, getContext: () => null, appendChild(){}, setAttribute(){} }),
  body: { appendChild(){}, removeChild(){} } };
if (!globalThis.KOSMOS) globalThis.KOSMOS = {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL:', m); } };

const fm = await import('../../ui/FleetManagerOverlay.js');
const { WarpRouteSystem } = await import('../../systems/WarpRouteSystem.js');
const O = fm.FleetManagerOverlay;

function mockCtx() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {},
    stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {},
    rect() {}, setLineDash() {}, getTransform() { return { a: 1, d: 1 }; }, measureText() { return { width: 40 }; },
    createRadialGradient() { return grad; }, createConicGradient() { return grad; },
  };
}

// Statki: warp zadokowany (idle), warp w tranzycie (non-actionable), nie-warp (odfiltrowany).
const warpDocked = {
  id: 'v_warp', name: 'Volkov', shipId: 'hull_frigate', isWreck: false, modules: [],
  systemId: 'sys_home', status: 'idle', position: { x: 0, y: 0, state: 'docked', dockedAt: 'p1' },
  warpFuel: { current: 8, max: 10, consumption: 0.5, fuelType: 'warp_cores' }, mission: null, warpRoute: null,
};
const warpTransit = {
  id: 'v_tr', name: 'Drift', shipId: 'hull_frigate', isWreck: false, modules: [],
  systemId: null, status: 'on_mission', position: { x: 0, y: 0, state: 'in_transit', dockedAt: null },
  warpFuel: { current: 3, max: 10, consumption: 0.5, fuelType: 'warp_cores' },
  mission: { type: 'interstellar_jump', phase: 'warp_transit', fromGalX: 0, fromGalY: 0, toGalX: 4, toGalY: 1, currentGalX: 2, currentGalY: 0.5 }, warpRoute: null,
};
const nonWarp = {
  id: 'v_nw', name: 'Scout', shipId: 'hull_small', isWreck: false, modules: [],
  systemId: 'sys_home', status: 'idle', position: { x: 0, y: 0, state: 'docked', dockedAt: 'p1' },
  warpFuel: { current: 0, max: 0, consumption: 0 }, mission: null, warpRoute: null,
};
const allVessels = [warpDocked, warpTransit, nonWarp];
const vesselById = new Map(allVessels.map(v => [v.id, v]));

// Stub VM dla realnego WarpRouteSystem (getVessel/isImmobilized/dispatchInterstellar).
const vmStub = {
  getAllVessels: () => allVessels,
  getVessel: (id) => vesselById.get(id) ?? null,
  getInterstellarVessels: () => [warpTransit],
  getAvailable: () => [warpDocked],
  isImmobilized: () => false,
  dispatchInterstellar: () => true,   // sukces (pełny silnik = live)
};

const baseKOSMOS = {
  galaxyData: { systems: [
    { id: 'sys_home', name: 'Sol', isHome: true, explored: true, x: 0, y: 0, z: 0, colorHex: '#ffdd88', spectralType: 'G', mass: 1, distanceLY: 0 },
    { id: 'sys_001', name: 'Alfa', explored: true, x: 4, y: 1, z: 0, colorHex: '#ffaa66', spectralType: 'M', mass: 0.4, distanceLY: 4.1 },
    { id: 'sys_002', name: 'Beta', explored: true, x: -8, y: 5, z: 1, colorHex: '#cceeff', spectralType: 'F', mass: 1.4, distanceLY: 9.4, empireId: 'emp_1' },
  ] },
  observatorySystem: { getMaxObservatoryLevel: () => 3 },
  vesselManager: vmStub,
  starSystemManager: { getSystem: () => null, hasBeacon: () => false, hasJumpGate: () => false },
  colonyManager: { getAllColonies: () => [], activePlanetId: 'p1', getColony: () => null },
  empireRegistry: { listAll: () => [], get: () => null },
  intelSystem: { isAtLeast: () => false },
  diplomacySystem: { getHostility: () => 0 },
  timeSystem: { gameTime: 0 },
  eventLogSystem: { push() {} },
  uiManager: { _dirty: false },
};
globalThis.KOSMOS = baseKOSMOS;
baseKOSMOS.warpRouteSystem = new WarpRouteSystem(vmStub);   // REALNY system

ok(typeof O === 'function', 'import FleetManagerOverlay');
ok(typeof new O()._drawWarpShipList === 'function', '_drawWarpShipList istnieje');

// W1 — radar render z listą warp (bez selekcji) bez wyjątku (lista + filtr)
{
  const o = new O(); let threw = null;
  try { o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true); } catch (e) { threw = e; }
  ok(threw === null, 'W1: radar z tabelą warp bez wyjątku: ' + (threw?.message ?? ''));
}

// W2 — marker na radarze (statek wybrany) bez wyjątku
{
  const o = new O(); o._selectedWarpShipId = 'v_warp'; let threw = null;
  try { o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true); } catch (e) { threw = e; }
  ok(threw === null, 'W2: radar + marker (docked) bez wyjątku: ' + (threw?.message ?? ''));
}

// W3 — marker dla statku w tranzycie (currentGalX/Y) bez wyjątku
{
  const o = new O(); o._selectedWarpShipId = 'v_tr'; let threw = null;
  try { o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true); } catch (e) { threw = e; }
  ok(threw === null, 'W3: radar + marker (in_transit) bez wyjątku: ' + (threw?.message ?? ''));
}

// W4 — panel rozkazu (statek wybrany + system wybrany) bez wyjątku (REALNY planner)
{
  const o = new O(); o._selectedWarpShipId = 'v_warp'; o._selectedClusterSystem = 'sys_001'; let threw = null;
  try { o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true); } catch (e) { threw = e; }
  ok(threw === null, 'W4: radar + panel rozkazu bez wyjątku: ' + (threw?.message ?? ''));
}

// W5 — HOME jako cel (statek z obcego układu) panel bez wyjątku (planner same_system/ok)
{
  const o = new O(); o._selectedWarpShipId = 'v_warp'; o._selectedClusterSystem = 'sys_home'; let threw = null;
  try { o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true); } catch (e) { threw = e; }
  ok(threw === null, 'W5: HOME jako cel (panel) bez wyjątku: ' + (threw?.message ?? ''));
}

// W6 — galaxy big + ship + system → marker galaktyki + panel rozkazu bez wyjątku
{
  const o = new O(); o._stratcomBig = 'galaxy'; o._selectedWarpShipId = 'v_warp'; o._selectedClusterSystem = 'sys_002'; let threw = null;
  try { o._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { threw = e; }
  ok(threw === null, 'W6: galaxy big + marker + panel rozkazu bez wyjątku: ' + (threw?.message ?? ''));
}

// W7 — handler warp_ship_select toggluje
{
  const o = new O();
  o._handleHit({ type: 'warp_ship_select', data: { vesselId: 'v_warp' } });
  ok(o._selectedWarpShipId === 'v_warp', 'W7a: select ustawia');
  o._handleHit({ type: 'warp_ship_select', data: { vesselId: 'v_warp' } });
  ok(o._selectedWarpShipId === null, 'W7b: ponowny klik odznacza (toggle)');
}

// W8 — handler warp_order_send wywołuje beginJourney + czyści wybrany system
{
  const o = new O(); o._selectedWarpShipId = 'v_warp'; o._selectedClusterSystem = 'sys_001';
  let called = null;
  baseKOSMOS.warpRouteSystem = { beginJourney: (id, sys) => { called = { id, sys }; return { ok: true }; }, canOrder: () => ({ ok: true }) };
  let threw = null;
  try { o._handleHit({ type: 'warp_order_send', data: { vesselId: 'v_warp', systemId: 'sys_001' } }); } catch (e) { threw = e; }
  ok(threw === null && called && called.id === 'v_warp' && called.sys === 'sys_001', 'W8a: warp_order_send → beginJourney');
  ok(o._selectedClusterSystem === null, 'W8b: send czyści wybrany system');
  baseKOSMOS.warpRouteSystem = new WarpRouteSystem(vmStub);
}

// W9 — handlery cancel + bg nie rzucają i czyszczą/absorbują
{
  const o = new O(); o._selectedClusterSystem = 'sys_001';
  o._handleHit({ type: 'warp_order_cancel', data: {} });
  ok(o._selectedClusterSystem === null, 'W9a: cancel czyści wybrany system');
  let threw = null;
  try { o._handleHit({ type: 'warp_order_bg', data: {} }); } catch (e) { threw = e; }
  ok(threw === null, 'W9b: warp_order_bg (absorber) bez wyjątku');
}

// W10 — switchTab resetuje wybór statku warp
{
  const o = new O(); o._selectedWarpShipId = 'v_warp'; o._warpShipScrollY = 50;
  o._switchTab('tactical'); o._switchTab('stratcom');
  ok(o._selectedWarpShipId === null && o._warpShipScrollY === 0, 'W10: switchTab resetuje wybór + scroll');
}

// W11 — linia trasy (warpRoute) renderuje się na radarze + galaktyce bez wyjątku
{
  warpDocked.warpRoute = { hops: ['sys_home', 'sys_001', 'sys_002'], legIndex: 0, finalSystemId: 'sys_002', totalFuelPlanned: 2, startedYear: 0 };
  const o = new O(); o._selectedWarpShipId = 'v_warp';
  let threw = null;
  try { o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true); } catch (e) { threw = e; }
  ok(threw === null, 'W11a: radar z linią trasy multi-hop bez wyjątku: ' + (threw?.message ?? ''));
  threw = null;
  try { o._stratcomBig = 'galaxy'; o._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { threw = e; }
  ok(threw === null, 'W11b: galaktyka z linią trasy bez wyjątku: ' + (threw?.message ?? ''));
  // bezpośrednie wywołanie helpera z projekcją
  threw = null;
  try { o._drawWarpRouteLine(mockCtx(), warpDocked.warpRoute, (s) => ({ sx: s.x * 10, sy: s.y * 10 })); } catch (e) { threw = e; }
  ok(threw === null, 'W11c: _drawWarpRouteLine bezpośrednio bez wyjątku: ' + (threw?.message ?? ''));
  warpDocked.warpRoute = null;
}

console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
process.exit(fail ? 1 : 0);
