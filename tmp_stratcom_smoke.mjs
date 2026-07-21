// tmp_stratcom_smoke.mjs — smoke H1: STRATCOM „stół holograficzny" (JEDNA mapa galaktyki)
//   node tmp_stratcom_smoke.mjs
// Radar wchłonięty w jedną mapę; panele polityczny+operacyjny scalone w _drawStratcomDetail.
// Render canvas nietestowalny headless (WebGL → 2D fallback), więc testujemy no-throw + strukturę.

globalThis.localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style:{}, getContext: () => null, appendChild(){}, setAttribute(){} }),
  body: { appendChild(){}, removeChild(){} } };
if (!globalThis.KOSMOS) globalThis.KOSMOS = {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("FAIL:", m); } };

const fm = await import("./src/ui/FleetManagerOverlay.js");
const O = fm.FleetManagerOverlay;
ok(typeof O === "function", "FleetManagerOverlay imported");
// Headless: brak WebGL → wymuś ścieżkę 2D fallback (renderer 3D nigdy się nie ładuje;
// pending-placeholder bez tego wychodziłby wcześnie i nie rysował mapy w teście).
O.prototype._ensureGalaxy3D = function () { this._galaxy3DFailed = true; return false; };
const { computeOwnedLanes } = await import("./src/ui/TerritoryRenderLogic.js");

const o = new O();
// ── Metody jednej mapy istnieją ──
ok(typeof o._drawStratcomTab === "function", "_drawStratcomTab istnieje");
ok(typeof o._drawStratcomGalaxy === "function", "_drawStratcomGalaxy istnieje");
ok(typeof o._drawStratcomDetail === "function", "_drawStratcomDetail (scalony panel) istnieje");
ok(typeof o._drawWarpShipList === "function", "_drawWarpShipList istnieje");
ok(typeof o._stratcomVisibleSystems === "function", "_stratcomVisibleSystems istnieje");
ok(typeof o._getStratcomRangeLY === "function", "_getStratcomRangeLY istnieje");
// ── Radar + dwupanel + osobne panele detalu USUNIĘTE ──
ok(o._drawStratcom === undefined, "_drawStratcom (radar) usunięty");
ok(o._drawStratcomPolitical === undefined, "_drawStratcomPolitical usunięty (scalony w detail)");
ok(o._drawStratcomOps === undefined, "_drawStratcomOps usunięty (scalony w detail)");
ok(o._drawStarCluster === undefined, "_drawStarCluster (martwy) usunięty");
ok(o._drawClusterInfoPanel === undefined, "_drawClusterInfoPanel (martwy) usunięty");
ok(!('_stratcomBig' in o), "_stratcomBig (flaga dwupanelu) usunięta");

// ── _getStratcomRangeLY: zasięg radaru galaktycznego z poziomu obserwatorium ──
// STRATCOM_LY_BY_LEVEL = [0,0,0,0,5,10,15] — radar galaktyczny dopiero od Lv4.
globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 0 };
ok(o._getStratcomRangeLY() === 0, "obs lvl 0 → 0 ly (ślepy start)");
globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 4 };
ok(o._getStratcomRangeLY() === 5, "obs lvl 4 → 5 ly");
globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 6 };
ok(o._getStratcomRangeLY() === 15, "obs lvl 6 → 15 ly (clamp górny)");
delete globalThis.KOSMOS.observatorySystem;
ok(o._getStratcomRangeLY() === 0, "brak obserwatorium → 0 ly (guard)");

// ── keymap G/M → Stratcom ──
const omMod = await import("./src/ui/OverlayManager.js");
const om = new omMod.OverlayManager();
ok(om._keyMap['g']?.id === 'fleet' && om._keyMap['g']?.opts?.tab === 'stratcom', "klawisz G → fleet/stratcom");
ok(om._keyMap['m']?.id === 'fleet' && om._keyMap['m']?.opts?.tab === 'stratcom', "klawisz M → fleet/stratcom");

// ── Render jednej mapy (mock canvas; WebGL niedostępny headless → 2D fallback) ──
function mockCtx() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    globalAlpha: 1, lineDashOffset: 0,
    fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {},
    stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {},
    rect() {}, setLineDash() {}, measureText() { return { width: 40 }; },
    drawImage() {}, getTransform() { return { a: 1, d: 1 }; },
    createRadialGradient() { return grad; }, createConicGradient() { return grad; }, createLinearGradient() { return grad; },
  };
}
const warpShip = { id: 'v_warp', name: 'Skok I', shipId: 'hull_small', isWreck: false,
  warpFuel: { current: 5, max: 10 }, position: { state: 'docked' }, status: 'idle' };
const baseKOSMOS = {
  galaxyData: { systems: [
    { id: 'sys_home', name: 'Sol', isHome: true, explored: true, x: 0, y: 0, z: 0, colorHex: '#ffdd88', spectralType: 'G', mass: 1, distanceLY: 0 },
    { id: 'sys_001', name: 'Alfa', explored: false, x: 4, y: 1, z: 0, colorHex: '#ffaa66', spectralType: 'M', mass: 0.4, distanceLY: 4.1 },
    { id: 'sys_002', name: 'Beta', explored: true, x: -8, y: 5, z: 1, colorHex: '#cceeff', spectralType: 'F', mass: 1.4, distanceLY: 9.4, empireId: 'emp_1' },
    { id: 'sys_099', name: 'Daleki', explored: false, x: 40, y: -30, z: 2, colorHex: '#fff', spectralType: 'K', mass: 0.8, distanceLY: 50 },
  ] },
  observatorySystem: { getMaxObservatoryLevel: () => 2, getSystemScanResult: () => null, getSystemScanProgress: () => null, getMaxSystemScanTier: () => 0, getActiveSystemScans: () => [], getMaxConcurrentSystemScans: () => 1 },
  vesselManager: { getInterstellarVessels: () => [], getAvailable: () => [], getAllVessels: () => [warpShip], getVessel: () => null },
  starSystemManager: { getSystem: () => null, hasBeacon: () => false, hasJumpGate: () => false },
  colonyManager: { getAllColonies: () => [], activePlanetId: 'p1', getColony: () => null },
  empireRegistry: { listAll: () => [{ id: 'emp_1', archetype: 'expansionist', homeSystemId: 'sys_002', colonies: [] }], get: (id) => id === 'emp_1' ? { id: 'emp_1', name: 'Obcy', archetype: 'expansionist', homeSystemId: 'sys_002' } : null },
  intelSystem: { isAtLeast: (eid) => eid === 'emp_1' },
  diplomacySystem: { getHostility: () => 55 },
  territoryService: { getSystemOwner: (id) => id === 'sys_002' ? 'emp_1' : null, getEmpireColor: () => '#B03030', getOwnedSystems: () => [] },
  uiManager: { _dirty: false },
};
globalThis.KOSMOS = baseKOSMOS;

const o2 = new O();
let threw = null;
try { o2._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { threw = e; }
ok(threw === null, "_drawStratcomTab (jedna mapa + pasek warp) bez wyjątku: " + (threw?.message ?? ''));
ok(baseKOSMOS.uiManager._dirty === true, "_drawStratcomTab wymusza ciągły redraw (uiManager._dirty)");

// selekcja układu → panel detalu scalony (przez pełny render mapy)
threw = null;
try { o2._selectedClusterSystem = 'sys_002'; o2._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { threw = e; }
ok(threw === null, "_drawStratcomTab z selekcją → panel detalu bez wyjątku: " + (threw?.message ?? ''));

// panel detalu bezpośrednio (imperium znane + wrogość + terytorium + skan)
threw = null;
try { o2._drawStratcomDetail(mockCtx(), 0, 0, 1000, 600, baseKOSMOS.galaxyData.systems[2], baseKOSMOS.starSystemManager, baseKOSMOS.vesselManager, baseKOSMOS.colonyManager); } catch (e) { threw = e; }
ok(threw === null, "_drawStratcomDetail (imperium+wrogość+terytorium+skan) bez wyjątku: " + (threw?.message ?? ''));

// panel detalu dla HOME (bez imperium, bez skanu, bez przycisków)
threw = null;
try { o2._drawStratcomDetail(mockCtx(), 0, 0, 1000, 600, baseKOSMOS.galaxyData.systems[0], baseKOSMOS.starSystemManager, baseKOSMOS.vesselManager, baseKOSMOS.colonyManager); } catch (e) { threw = e; }
ok(threw === null, "_drawStratcomDetail dla home bez wyjątku: " + (threw?.message ?? ''));

// warp ship list bezpośrednio
threw = null;
try { o2._drawWarpShipList(mockCtx(), 0, 0, 200, 600, baseKOSMOS.vesselManager); } catch (e) { threw = e; }
ok(threw === null, "_drawWarpShipList bez wyjątku: " + (threw?.message ?? ''));

// pusta galaktyka → early return bez wyjątku
threw = null;
globalThis.KOSMOS = { ...baseKOSMOS, galaxyData: { systems: [] } };
try { new O()._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { threw = e; }
ok(threw === null, "_drawStratcomTab bez danych galaktyki → bez wyjątku: " + (threw?.message ?? ''));
globalThis.KOSMOS = baseKOSMOS;

// stratcom_detail_bg = absorber klików (no-op, nie rzuca)
threw = null;
try { o2._handleHit({ type: 'stratcom_detail_bg' }); } catch (e) { threw = e; }
ok(threw === null, "stratcom_detail_bg (absorber tła) bez wyjątku");

// fog wojny: home wykryty, znane widoczne
const o3 = new O();
const visRes = o3._stratcomVisibleSystems();
const visIds = visRes.list.map(e => e.s.id);
ok(visRes.home?.id === 'sys_home', "visible: home wykryty");
ok(visIds.includes('sys_home') && visIds.includes('sys_002'), "visible: home + znane imperium");

// ── H2: przeciąganie mapy = PAN po dysku (nie obrót); skos i azymut STAŁE ──
{
  const o = new O();
  o._visible = true;
  o._galaxyPanelRect = { x: 0, y: 0, w: 1000, h: 600 };
  o._galaxyDist = 40;
  // stan po mousedown nad mapą galaktyki (bez wołania handleMouseDown — testujemy sam pan)
  o._mapDragging = true; o._galaxyDrag = true; o._mapDragStartX = 500; o._mapDragStartY = 300;
  const pitch0 = o._galaxyPitch, yaw0 = o._galaxyYaw;
  o.handleMouseMove(560, 340);   // przeciągnięcie o (60, 40)
  ok(o._holotablePanTarget.x !== 0 || o._holotablePanTarget.z !== 0, "H2: drag przesuwa _holotablePanTarget (pan)");
  ok(o._galaxyPitch === pitch0, "H2: skos (pitch) NIE zmienia się przy dragu");
  ok(o._galaxyYaw === yaw0, "H2: azymut (yaw) NIE zmienia się przy dragu");
  ok(Math.abs(o._holotablePanTarget.x) <= 30 && Math.abs(o._holotablePanTarget.z) <= 30, "H2: pan w granicach clampu (±30 ly)");
}

// ── H5: soczewka sensora — toggle + render (range 0 i range>0) bez wyjątku ──
{
  const o = new O();
  ok(o._sensorLens === false, "H5: soczewka domyślnie wyłączona");
  o._handleHit({ type: 'stratcom_lens_toggle' });
  ok(o._sensorLens === true, "H5: toggle włącza soczewkę");
  o._handleHit({ type: 'stratcom_lens_toggle' });
  ok(o._sensorLens === false, "H5: toggle wyłącza soczewkę");

  globalThis.KOSMOS = baseKOSMOS;   // obs Lv2 → range 0 (sweep pominięty, przycisk rysowany)
  const o2 = new O(); o2._sensorLens = true;
  let threw = null;
  try { o2._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { threw = e; }
  ok(threw === null, "H5: render z soczewką ON (range 0) bez wyjątku: " + (threw?.message ?? ''));

  // obs Lv4 → range 5 → sweep + pierścień rysowane
  globalThis.KOSMOS = { ...baseKOSMOS, observatorySystem: { ...baseKOSMOS.observatorySystem, getMaxObservatoryLevel: () => 4 } };
  const o3 = new O(); o3._sensorLens = true;
  threw = null;
  try { o3._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { threw = e; }
  ok(threw === null, "H5: render z soczewką ON + zasięg>0 (sweep) bez wyjątku: " + (threw?.message ?? ''));
  globalThis.KOSMOS = baseKOSMOS;
}

// ── H6: warp-lane MST (konstelacja) + render z układami gracza ──
{
  const e = computeOwnedLanes([{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }]);
  ok(e.length === 2, "H6: MST 3 węzłów → 2 krawędzie (łańcuch, bez cyklu)");
  ok(computeOwnedLanes([{ x: 0, y: 0, z: 0 }]).length === 0, "H6: 1 węzeł → 0 krawędzi");
  ok(computeOwnedLanes([]).length === 0, "H6: 0 węzłów → 0 krawędzi");
  const kOwned = { ...baseKOSMOS, territoryService: { ...baseKOSMOS.territoryService, getOwnedSystems: () => [{ systemId: 'sys_home' }, { systemId: 'sys_002' }], getEmpireColor: () => '#33ccff' } };
  globalThis.KOSMOS = kOwned;
  const o = new O(); let threw = null;
  try { o._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (er) { threw = er; }
  ok(threw === null, "H6: render z warp-lane (2 układy gracza) bez wyjątku: " + (threw?.message ?? ''));
  globalThis.KOSMOS = baseKOSMOS;
}

console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ""));
process.exit(fail ? 1 : 0);
