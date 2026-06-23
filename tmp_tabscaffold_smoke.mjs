// Slice 0 smoke — tab scaffold + reset logic (offline; tylko logika, bez canvas render)
// Stuby przeglądarkowe (moduły KOSMOS czytają localStorage/window/document na import).
globalThis.localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style:{}, getContext: () => null, appendChild(){}, setAttribute(){} }),
  body: { appendChild(){}, removeChild(){} } };
if (!globalThis.KOSMOS) globalThis.KOSMOS = {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("FAIL:", m); } };

let O;
try {
  const m = await import("./src/ui/FleetManagerOverlay.js");
  O = m.FleetManagerOverlay;
  ok(typeof O === "function", "FleetManagerOverlay imported");
} catch (e) {
  console.log("IMPORT_FAIL:", e.message);
  process.exit(1);
}

const o = new O();
ok(o._activeTab === "tactical", "default tab = tactical");
ok(o._contentBounds === null, "contentBounds null pre-draw");

// _switchTab: same tab = no-op
o._switchTab("tactical");
ok(o._activeTab === "tactical", "switch to same tab no-op");

// mission-config select mode cancelled on switch
o._missionConfig = { step: "select", actionId: "transport" };
o._targetScrollOffset = 5;
o._switchTab("atlas");
ok(o._activeTab === "atlas", "switched to atlas");
ok(o._missionConfig === null, "missionConfig cancelled on tab switch (was select)");
ok(o._targetScrollOffset === 0, "targetScroll reset");

// atlas scroll reset on entering atlas
o._atlasScrollY = 88;
o._switchTab("tactical");
o._switchTab("atlas");
ok(o._atlasScrollY === 0, "atlasScrollY reset on enter atlas");

// stratcom enter clears cluster selection + pending send
o._selectedClusterSystem = "sys_x";
o._pendingSendSystemId = "sys_y";
o._switchTab("stratcom");
ok(o._activeTab === "stratcom", "switched to stratcom");
ok(o._selectedClusterSystem === null, "cluster selection cleared on enter stratcom");
ok(o._pendingSendSystemId === null, "pendingSend cleared on enter stratcom");

// hover cleared on switch
o._mapHoverBody = { bodyId: "x" };
o._clusterHoverSystem = "sys_z";
o._hoverShipId = "ship";
o._switchTab("shipyard");
ok(o._mapHoverBody === null && o._clusterHoverSystem === null && o._hoverShipId === null, "hovers cleared on switch");

// open(opts.tab) honored
const o2 = new O();
o2.open({ tab: "stratcom" });
ok(o2._activeTab === "stratcom", "open({tab:'stratcom'}) sets tab");
ok(o2._visible === true, "open sets visible");

// open(focusSection) forces tactical
const o3 = new O();
o3._activeTab = "stratcom";
o3.open({ focusSection: "wreck" });
ok(o3._activeTab === "tactical", "focusSection forces tactical tab");
ok(o3._pendingFocusSection === "wreck", "pendingFocusSection set");

// close resets to tactical
const o4 = new O();
o4._activeTab = "atlas";
o4.close();
ok(o4._activeTab === "tactical", "_close resets tab to tactical");
ok(o4._visible === false, "close hides");

// fleet nav group is now a singleton (Designs removed from subnav)
const nav = await import("./src/ui/CivPanelDrawer.js");
const fleetGrp = nav.NAV_GROUPS.find(g => g.primary === "fleet");
ok(fleetGrp && fleetGrp.members.length === 1 && fleetGrp.members[0] === "fleet",
   "fleet nav group is singleton ['fleet'] (no subnav)");
ok(typeof nav.getSubNavHeight === "function", "getSubNavHeight exported");

// Designs editor embedded in Shipyard tab: hits delegate to registered unit_design instance
let delegated = null;
const editorStub = { _onHit: (z) => { delegated = z; }, _hitZones: [], _hoverZone: null };
globalThis.KOSMOS.overlayManager = { overlays: { unit_design: editorStub } };
const o5 = new O();
ok(o5._getDesignEditor() === editorStub, "_getDesignEditor returns registered unit_design instance");
o5._handleHit({ type: "select_hull", data: { hullId: "hull_small" } });
ok(delegated && delegated.type === "select_hull", "design-editor hit (select_hull) delegated to editor._onHit");
delegated = null;
o5._handleHit({ type: "save_template", data: {} });
ok(delegated && delegated.type === "save_template", "design-editor hit (save_template) delegated to editor._onHit");
// non-editor hit NOT delegated
delegated = null;
o5._handleHit({ type: "tab", data: { tab: "atlas" } });
ok(delegated === null && o5._activeTab === "atlas", "non-editor hit (tab) handled locally, not delegated");
// no registered editor → _getDesignEditor null (headless-safe)
const o6 = new O();
globalThis.KOSMOS.overlayManager = { overlays: {} };
ok(o6._getDesignEditor() === null, "_getDesignEditor null when unit_design not registered");

console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ""));
process.exit(fail ? 1 : 0);
