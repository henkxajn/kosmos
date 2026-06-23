// Slice 4 smoke — Stratcom radar logika (offline; render canvas nietestowalny headless)
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

const o = new O();
ok(typeof o._drawStratcom === "function", "_drawStratcom method exists");
ok(typeof o._getStratcomRangeLY === "function", "_getStratcomRangeLY method exists");

// ── _getStratcomRangeLY: zasięg z poziomu obserwatorium ──
globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 0 };
ok(o._getStratcomRangeLY() === 3, "obs lvl 0 → range 3 ly (ślepy start)");
globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 3 };
ok(o._getStratcomRangeLY() === 3 + 3 * 6, "obs lvl 3 → range 21 ly");
globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 5 };
ok(o._getStratcomRangeLY() === 3 + 5 * 6, "obs lvl 5 → range 33 ly");
// brak obserwatorium → baza (guard)
delete globalThis.KOSMOS.observatorySystem;
ok(o._getStratcomRangeLY() === 3, "brak obserwatorium → baza 3 ly (guard)");

// ── range rośnie monotonicznie z poziomem (mgła rozszerza się) ──
const r0 = (() => { globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 0 }; return o._getStratcomRangeLY(); })();
const r2 = (() => { globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 2 }; return o._getStratcomRangeLY(); })();
const r4 = (() => { globalThis.KOSMOS.observatorySystem = { getMaxObservatoryLevel: () => 4 }; return o._getStratcomRangeLY(); })();
ok(r0 < r2 && r2 < r4, "zasięg radaru rośnie z poziomem obserwatorium");

// ── keymap: G i M otwierają fleet → Stratcom (Stratcom zastępuje galaxy/minimap) ──
const omMod = await import("./src/ui/OverlayManager.js");
const om = new omMod.OverlayManager();
const g = om._keyMap['g'];
ok(g && typeof g === 'object' && g.id === 'fleet' && g.opts?.tab === 'stratcom', "klawisz G → fleet/stratcom");
const m = om._keyMap['m'];
ok(m && typeof m === 'object' && m.id === 'fleet' && m.opts?.tab === 'stratcom', "klawisz M → fleet/stratcom");
ok(om._keyMap['g'] !== 'galaxy' && om._keyMap['m'] !== 'minimap', "stare wpisy galaxy/minimap zastąpione");

// ── Render no-throw: mock canvas + galaxyData → wywołaj _drawStratcom ──
function mockCtx() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {},
    stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {},
    rect() {}, setLineDash() {}, measureText() { return { width: 40 }; },
    createRadialGradient() { return grad; }, createConicGradient() { return grad; },
  };
}
const baseKOSMOS = {
  galaxyData: { systems: [
    { id: 'sys_home', name: 'Sol', isHome: true, explored: true, x: 0, y: 0, z: 0, colorHex: '#ffdd88', spectralType: 'G', mass: 1, distanceLY: 0 },
    { id: 'sys_001', name: 'Alfa', explored: false, x: 4, y: 1, z: 0, colorHex: '#ffaa66', spectralType: 'M', mass: 0.4, distanceLY: 4.1 },
    { id: 'sys_002', name: 'Beta', explored: true, x: -8, y: 5, z: 1, colorHex: '#cceeff', spectralType: 'F', mass: 1.4, distanceLY: 9.4, empireId: 'emp_1' },
    { id: 'sys_099', name: 'Daleki', explored: false, x: 40, y: -30, z: 2, colorHex: '#fff', spectralType: 'K', mass: 0.8, distanceLY: 50 },
  ] },
  observatorySystem: { getMaxObservatoryLevel: () => 2 },
  vesselManager: { getInterstellarVessels: () => [], getAvailable: () => [] },
  starSystemManager: { getSystem: () => null, hasBeacon: () => false, hasJumpGate: () => false },
  colonyManager: { getAllColonies: () => [], activePlanetId: 'p1', getColony: () => null },
  empireRegistry: { listAll: () => [{ id: 'emp_1', archetype: 'expansionist', homeSystemId: 'sys_002', colonies: [] }], get: (id) => id === 'emp_1' ? { id: 'emp_1', archetype: 'expansionist', homeSystemId: 'sys_002' } : null },
  intelSystem: { isAtLeast: (eid, lvl) => eid === 'emp_1' },  // emp_1 znane
  diplomacySystem: { getHostility: () => 55 },
  uiManager: { _dirty: false },
};
globalThis.KOSMOS = baseKOSMOS;

const o2 = new O();
let threw = null;
try { o2._drawStratcom(mockCtx(), 0, 0, 800, 600); } catch (e) { threw = e; }
ok(threw === null, "_drawStratcom renderuje bez wyjątku (intel emp + zbadane + nieznane w zasięgu): " + (threw?.message ?? ''));
ok(baseKOSMOS.uiManager._dirty === true, "_drawStratcom ustawia uiManager._dirty (ciągły redraw sweepa)");

// Z selekcją systemu (panel info) + brak galaxy danych (early return)
threw = null;
try { o2._selectedClusterSystem = 'sys_002'; o2._drawStratcom(mockCtx(), 0, 0, 800, 600); } catch (e) { threw = e; }
ok(threw === null, "_drawStratcom z wybranym systemem (panel info) bez wyjątku: " + (threw?.message ?? ''));

threw = null;
globalThis.KOSMOS = { ...baseKOSMOS, galaxyData: { systems: [] } };
try { new O()._drawStratcom(mockCtx(), 0, 0, 800, 600); } catch (e) { threw = e; }
ok(threw === null, "_drawStratcom bez danych galaktyki → early return bez wyjątku");
globalThis.KOSMOS = baseKOSMOS;

// ── Dwupanelowy Stratcom (radar + mapa galaktyki 2D) ──
const o3 = new O();
ok(o3._stratcomBig === 'radar', "domyślny duży panel = radar");
ok(typeof o3._drawStratcomTab === 'function', "_drawStratcomTab istnieje");
ok(typeof o3._drawStratcomGalaxy === 'function', "_drawStratcomGalaxy istnieje");
ok(typeof o3._stratcomVisibleSystems === 'function', "_stratcomVisibleSystems istnieje");
ok(typeof o3._drawStratcomPolitical === 'function', "_drawStratcomPolitical istnieje");
ok(typeof o3._drawStratcomOps === 'function', "_drawStratcomOps istnieje");

// fog wojny: widoczne = home + w zasięgu (obs lvl 2 → 21 ly); sys_099 (50 ly) wykluczony
const visRes = o3._stratcomVisibleSystems();
const visIds = visRes.list.map(e => e.s.id);
ok(visRes.home?.id === 'sys_home', "visible: home wykryty");
ok(visIds.includes('sys_home') && visIds.includes('sys_001') && visIds.includes('sys_002'), "visible: home/001/002 znane lub w zasięgu");
ok(!visIds.includes('sys_099'), "visible: sys_099 (50 ly) poza zasięgiem → ukryty (mgła wojny)");

// render dwupanelu bez wyjątku (radar duży)
let t2 = null;
try { o3._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { t2 = e; }
ok(t2 === null, "_drawStratcomTab render bez wyjątku: " + (t2?.message ?? ''));

// expand: klik małego panelu → swap big
o3._handleHit({ type: 'stratcom_expand', data: { panel: 'galaxy' } });
ok(o3._stratcomBig === 'galaxy', "stratcom_expand{galaxy} → duży = galaxy");
o3._handleHit({ type: 'stratcom_expand', data: { panel: 'radar' } });
ok(o3._stratcomBig === 'radar', "stratcom_expand{radar} → duży = radar");

// render galaxy-duży + selekcja (panel operacyjny + bodies) bez wyjątku
let t3 = null;
try { o3._stratcomBig = 'galaxy'; o3._selectedClusterSystem = 'sys_002'; o3._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { t3 = e; }
ok(t3 === null, "_drawStratcomTab (galaxy big + selekcja → ops panel) bez wyjątku: " + (t3?.message ?? ''));

// render radar-duży + selekcja (panel polityczny) bez wyjątku
let t3b = null;
try { o3._stratcomBig = 'radar'; o3._selectedClusterSystem = 'sys_002'; o3._drawStratcomTab(mockCtx(), 0, 0, 1000, 600); } catch (e) { t3b = e; }
ok(t3b === null, "_drawStratcomTab (radar big + selekcja → panel polityczny) bez wyjątku: " + (t3b?.message ?? ''));

// scan placeholder nie rzuca
let t4 = null;
try { o3._handleHit({ type: 'stratcom_scan', data: { systemId: 'sys_001' } }); } catch (e) { t4 = e; }
ok(t4 === null, "stratcom_scan (placeholder toast) bez wyjątku");

// wejście w Stratcom resetuje duży=radar
o3._stratcomBig = 'galaxy';
o3._switchTab('tactical'); o3._switchTab('stratcom');
ok(o3._stratcomBig === 'radar', "wejście w Stratcom resetuje duży panel = radar");

console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ""));
process.exit(fail ? 1 : 0);
