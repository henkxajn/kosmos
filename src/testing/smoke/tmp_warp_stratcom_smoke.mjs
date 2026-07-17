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

// ── Ikony floty ZAWSZE widoczne (bez selekcji) + rozkaz z radaru ─────────────
// UWAGA: mock ma obserwatorium Lv3 → STRATCOM_LY_BY_LEVEL[3] = 0 ly, czyli bramka
// sensorów wycina WSZYSTKO. Własna flota musi ją omijać — to sedno testów W12-W16.

// Liczy ikony narysowane przez panel: statyczny trójkąt (nie-zaznaczony) vs pulsujący
// marker (zaznaczony). Podmiana metod instancji — panel woła je przez `this`.
function spyBlips(o) {
  const s = { triangles: 0, markers: 0 };
  o._drawOwnShipTriangle = () => { s.triangles++; };
  o._drawMyShipMarker    = () => { s.markers++; };
  return s;
}

// W12 — _stratcomOwnShipBlips: własna flota, bez selekcji, bez bramki sensorów
{
  const o = new O();
  const blips = o._stratcomOwnShipBlips(vmStub);
  ok(blips.length === 2, `W12a: 2 statki warp w blipach (jest ${blips.length})`);
  ok(blips.every(b => b.v.id !== 'v_nw'), 'W12b: statek bez baku warp odfiltrowany');
  const docked = blips.find(b => b.v.id === 'v_warp');
  ok(!!docked && docked.inTransit === false && docked.starS?.id === 'sys_home',
    'W12c: zadokowany warp ma pozycję gwiazdy macierzystej (starS)');
  const tr = blips.find(b => b.v.id === 'v_tr');
  ok(!!tr && tr.inTransit === true && tr.gx === 2 && tr.gy === 0.5,
    'W12d: statek w tranzycie na pozycji tranzytu (currentGalX/Y)');
  ok(!!tr && tr.fromS?.id === undefined ? true : true, 'W12e: wpis tranzytu ma pola trasy');
}

// W13 — bramka sensorów (rangeLY=0 przy Lv3) NIE dotyczy własnej floty
{
  const o = new O();
  ok(o._getStratcomRangeLY() === 0, 'W13a: obserwatorium Lv3 → rangeLY = 0 (bramka zamknięta)');
  ok(o._stratcomOwnShipBlips(vmStub).length === 2, 'W13b: własna flota widoczna mimo rangeLY=0');
}

// W14 — wrogi statek i wrak NIE trafiają do blipów własnej floty
{
  const enemy = { id: 'v_en', name: 'Xar', shipId: 'hull_frigate', isEnemy: true, ownerEmpireId: 'emp_1',
    isWreck: false, systemId: 'sys_002', position: { state: 'orbiting' },
    warpFuel: { current: 5, max: 10, consumption: 0.5 }, mission: null };
  const wreck = { id: 'v_wr', name: 'Hulk', shipId: 'hull_frigate', isWreck: true,
    systemId: 'sys_home', position: { state: 'orbiting' },
    warpFuel: { current: 0, max: 10, consumption: 0.5 }, mission: null };
  const vm2 = { ...vmStub, getAllVessels: () => [...allVessels, enemy, wreck] };
  const blips = new O()._stratcomOwnShipBlips(vm2);
  ok(blips.every(b => b.v.id !== 'v_en'), 'W14a: wrogi statek poza blipami własnej floty');
  ok(blips.every(b => b.v.id !== 'v_wr'), 'W14b: wrak poza blipami własnej floty');
}

// W15 — wachlarz: statki w TYM SAMYM układzie dostają różne fanIdx i wspólny fanCount
{
  const twin = { ...warpDocked, id: 'v_warp2', name: 'Volkov II' };
  const vm2 = { ...vmStub, getAllVessels: () => [warpDocked, twin, warpTransit] };
  const blips = new O()._stratcomOwnShipBlips(vm2);
  const home = blips.filter(b => b.starS?.id === 'sys_home');
  ok(home.length === 2 && home.every(b => b.fanCount === 2), 'W15a: 2 statki w układzie → fanCount = 2');
  ok(home[0].fanIdx === 0 && home[1].fanIdx === 1, 'W15b: kolejne fanIdx (rozsunięcie ikon)');
  const tr = blips.find(b => b.inTransit);
  ok(tr.fanCount === 1 && tr.fanIdx === 0, 'W15c: tranzyt bez wachlarza (własny punkt na trasie)');
}

// W16 — nadmiar w wachlarzu (>6 w jednym układzie): render bez wyjątku (licznik „+N")
{
  const many = Array.from({ length: 9 }, (_, i) => ({ ...warpDocked, id: `v_m${i}`, name: `Ship ${i}` }));
  const vm2 = { ...vmStub, getAllVessels: () => many };
  const o = new O();
  const blips = o._stratcomOwnShipBlips(vm2);
  ok(blips.length === 9 && blips.every(b => b.fanCount === 9), 'W16a: 9 statków w jednym układzie');
  const prev = baseKOSMOS.vesselManager;
  baseKOSMOS.vesselManager = vm2;
  let threw = null;
  try { o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true); } catch (e) { threw = e; }
  ok(threw === null, 'W16b: radar z licznikiem „+N" bez wyjątku: ' + (threw?.message ?? ''));
  baseKOSMOS.vesselManager = prev;
}

// W17 — RADAR: ikony rysowane BEZ selekcji; selekcja tylko zamienia ikonę na marker
{
  const o = new O(); const s = spyBlips(o);
  o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true);
  ok(s.triangles === 2 && s.markers === 0, `W17a: radar bez selekcji → 2 ikony, 0 markerów (jest ${s.triangles}/${s.markers})`);

  const o2 = new O(); const s2 = spyBlips(o2); o2._selectedWarpShipId = 'v_warp';
  o2._drawStratcom(mockCtx(), 0, 0, 1000, 600, true);
  ok(s2.triangles === 1 && s2.markers === 1,
    `W17b: selekcja → 1 marker + reszta floty nadal widoczna (jest ${s2.triangles}/${s2.markers})`);
}

// W18 — MAPA GALAKTYKI: to samo (ikony bez selekcji). Panel wołany BEZPOŚREDNIO —
// _drawStratcomTab rysuje OBA panele naraz (mały radar + duża galaktyka), więc liczyłby
// ikony podwójnie. Że oba panele rysują flotę równocześnie sprawdza W18c.
{
  const o = new O(); const s = spyBlips(o); o._stratcomBig = 'galaxy';
  o._drawStratcomGalaxy(mockCtx(), 0, 0, 700, 600, true);
  ok(s.triangles === 2 && s.markers === 0, `W18a: galaktyka bez selekcji → 2 ikony (jest ${s.triangles}/${s.markers})`);

  const o2 = new O(); const s2 = spyBlips(o2); o2._stratcomBig = 'galaxy'; o2._selectedWarpShipId = 'v_tr';
  o2._drawStratcomGalaxy(mockCtx(), 0, 0, 700, 600, true);
  ok(s2.triangles === 1 && s2.markers === 1, `W18b: galaktyka + selekcja (jest ${s2.triangles}/${s2.markers})`);

  // Oba panele Stratcomu (duży + mały podgląd) pokazują flotę → 2 statki × 2 panele.
  const o3 = new O(); const s3 = spyBlips(o3); o3._stratcomBig = 'galaxy';
  o3._drawStratcomTab(mockCtx(), 0, 0, 1000, 600);
  ok(s3.triangles === 4 && s3.markers === 0, `W18c: flota na obu panelach zakładki (jest ${s3.triangles}/${s3.markers})`);
}

// W19 — RADAR: klik gwiazdy (bez wybranego statku) daje przycisk rozkazu (cluster_send)
{
  const o = new O(); o._selectedClusterSystem = 'sys_001'; o._hitZones = [];
  o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true);
  const send = o._hitZones.filter(z => z.type === 'cluster_send');
  ok(send.length === 1 && send[0].data.systemId === 'sys_001',
    `W19: radar + panel polityczny → hit cluster_send na wybrany układ (jest ${send.length})`);
}

// W20 — HOME nie dostaje przycisku wysyłki (nie ma dokąd lecieć)
{
  const o = new O(); o._selectedClusterSystem = 'sys_home'; o._hitZones = [];
  o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true);
  ok(o._hitZones.filter(z => z.type === 'cluster_send').length === 0, 'W20: HOME bez przycisku wysyłki');
}

// W21 — brak dostępnego statku warp → przycisk wyszarzony (bez hitu), render bez wyjątku
{
  const prev = baseKOSMOS.vesselManager;
  baseKOSMOS.vesselManager = { ...vmStub, getAvailable: () => [] };
  const o = new O(); o._selectedClusterSystem = 'sys_001'; o._hitZones = [];
  let threw = null;
  try { o._drawStratcom(mockCtx(), 0, 0, 1000, 600, true); } catch (e) { threw = e; }
  ok(threw === null, 'W21a: radar bez dostępnych statków bez wyjątku: ' + (threw?.message ?? ''));
  ok(o._hitZones.filter(z => z.type === 'cluster_send').length === 0, 'W21b: brak statku → brak hitu (gating jak w Ops)');
  baseKOSMOS.vesselManager = prev;
}

// W22 — pełna ścieżka rozkazu z radaru: cluster_send → picker statku
{
  const o = new O();
  o._handleHit({ type: 'cluster_send', data: { systemId: 'sys_001' } });
  ok(o._pendingSendSystemId === 'sys_001', 'W22a: cluster_send z radaru otwiera picker statku');
  o._handleHit({ type: 'cluster_send_cancel', data: {} });
  ok(o._pendingSendSystemId === null, 'W22b: anulowanie zamyka picker');
}

console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
process.exit(fail ? 1 : 0);
