// fleet_panel_hud_smoke — REFORMA ZAKŁADEK T6 (TABS_REFORM_PLAN.md §5.9; decyzja właściciela 2026-10-26 — D-TR-9 zmieniona):
// panel FLOTY (`FleetCommandPanel`) przy wierszu węzła floty i panel GRUPY N ≥ 2 (`FleetGroupPanel`) przy wierszu lidera,
// w idiomie etykiet z T5 (flaga kroku `fleetPanelHud` — na stałe ON od T4, klucz usunięty; dawne panele bez rysunku i kliku).
//
// Keeper WYŁĄCZNIE logiki (protokół `HUD_PLAN.md` §4.0, aneks 2026-10-23 — bez pinów na stałych rysunku):
//   F0  moduły (flagi kroków na stałe ON od T4) · F1 zbiór akcji ON = OFF — strefy panelu T6 ≡ strefy PRAWDZIWEGO `FleetCommandPanel.draw` /
//   `FleetGroupPanel.draw` (typ + dane) w każdym stanie z inwentarza §5.9.1, pokrycie typów, kontrola czułości · F2 każdy
//   chip → ten sam handler (prawdziwy klik obu paneli, szpieg `_onHit`) · F3 stany nieaktywne · F4 strefy kliku (chip >
//   linia członka > nazwa > pasek) · F5 mutex trzech paneli (`fleetHudSurface` = reguła Doku; `UIManager._mapSurface`,
//   `setSelectedVesselId`, `addToSelection` wykonane) · F6 klik w członka → panel statku · F7 akordeon · F8 konfigurator celu
//   floty i reguła 546 · F9 kotwica na prawdziwym Outlinerze (węzeł floty, układ zwinięty, lider grupy, zapas, tryb Y, karta
//   walki) · F10 Esc · F11 montaż (dawne panele poza rysunkiem i klikiem `UIManager`) · F12 budżet · F13 kółko (lista członków)
//   · F14 trafienie i przeszkody.
//   Strojenie 1 (właściciel 2026-10-27): F15 klik w pustą mapę zdejmuje flotę (uzbrojony picker — cel) · F16 baner pickera
//   ukryty przy konfiguratorze w panelu · F17 Finding 562 — „Odwrót” grupy tylko dla członka w aktywnym
//   starciu (predykat bramki MOS `not_in_combat`, wykonanie prawdziwego `_issueRetreat`; OFF i ON).
// `UIManager` i `GameScene` (nie importują się pod node — THREE) — metody wycięte ze źródła (komentarze zdjęte) i wykonane
// z atrapą `this`. Ślad deterministyczny „OFF = dziś” wobec kotwicy — sonda poza repo (teczka T6, `probes/trace_off_T6.mjs`).
// ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): flagi kroków na stałe ON — F0c–F0e (flaga)
//   zastąpione pinem braku predykatów i kluczy; sekcje OFF usunięte (F5b, F5f, F14c, F15f, F16e; połowy OFF F8f, F10a, F15a,
//   F16b); F5k — bramki rysunku bez dawnego panelu floty; F11 (OFF = dziś) przecelowany na montaż: dawne panele floty i grupy
//   poza rysunkiem i klikiem `UIManager`. F1 / F2 / F3 / F17 (dawne panele jako wyrocznia stref i dyspozycji) — bez zmian do
//   kolejnego kroku T4.
// ⚠ Moduły POWSTAJĄ w T6 — import dynamiczny w try/catch (pin DEGRADUJE, nie przerywa suity).

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { setLocale, t } from '../../i18n/i18n.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { COSMIC } from '../../config/LayoutConfig.js';
import { FleetCommandPanel } from '../../ui/FleetCommandPanel.js';
import { FleetGroupPanel }   from '../../ui/FleetGroupPanel.js';
import * as FGL from '../../ui/FleetGroupPanelLogic.js';   // strojenie 1 (562) — `combatCheckOf` powstaje w strojeniu: przestrzeń nazw (pin degraduje)
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { getMapInsets } from '../../ui/MapInsets.js';
import { resolveMapSelectionSurface } from '../../ui/MapVesselPanelLogic.js';
import { isEnemyVessel } from '../../entities/Vessel.js';
import * as SPA from '../../ui/ShipPanelAnchorLogic.js';
import * as CI  from '../../ui/ClickIntentLogic.js';
import * as TDL from '../../ui/TacticalDockLogic.js';
import * as T5  from '../../ui/ShipPanelHudLayer.js';

let L = null, Y = null, OL = null, HLL = null;
try { L = await import('../../ui/FleetPanelHudLogic.js'); } catch { /* fail-first: piny padną */ }
try { Y = await import('../../ui/FleetPanelHudLayer.js'); } catch { /* fail-first */ }
try { OL = await import('../../ui/Outliner.js'); } catch { /* piny padną */ }
try { HLL = await import('../../ui/HudLabelLayer.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const body = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
const compileWith = (text, scope) => {
  if (!text) return null;
  try {
    const names = Object.keys(scope);
    const make = new Function(...names, '__src', 'return eval("(" + __src + ")");');
    return make(...names.map((n) => scope[n]), text);
  } catch { return null; }
};
/** Metoda klasy `UIManager` wycięta ze źródła (sygnatura na początku linii z wcięciem 2) i skompilowana z zakresem. */
const compileMethod = (code, name, scope = {}) => {
  const b = body(code, `\n  ${name}(`);
  return b ? compileWith('function ' + b.trim().slice(name.length), scope) : null;
};
const call = (fn, self, ...a) => { try { return fn ? fn.apply(self, a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
const FEATURES = GAME_CONFIG.FEATURES;
const S = L?.FLEET_PANEL_HUD ?? { W: NaN, W_CONFIG: NaN, MEMBERS_MAX: NaN };
const AU = GAME_CONFIG.AU_TO_PX;
const UI = src('../../scenes/UIManager.js');
const GS = src('../../scenes/GameScene.js');

setLocale('pl');

// Atrapa ctx z pomiarem z rozmiaru fontu (0,6 em na znak) i zapisem napisów.
const recCtx = () => {
  const calls = { text: [], measures: 0 };
  let font = '10px monospace', fillStyle = '#000';
  return new Proxy({}, {
    get(o, k) {
      if (k === '_calls') return calls;
      if (k === 'font') return font;
      if (k === 'fillStyle') return fillStyle;
      if (k === 'measureText') return (s) => {
        calls.measures++;
        const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 10;
        return { width: [...String(s)].length * px * 0.6 };
      };
      if (k === 'fillText') return (s, x, y) => calls.text.push({ s: String(s), x, y, fillStyle });
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'font') font = v; else if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};

// ── Świat ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const DOCK = { state: 'docked', dockedAt: 'p_home', x: AU, y: 0 };
const SPACE = { state: 'in_transit', dockedAt: null, x: 2 * AU, y: 0 };
const ORBIT = { state: 'orbiting', dockedAt: 'p_two', x: 3 * AU, y: 0 };
const ship = (id, o = {}) => ({
  id, name: `Statek ${id}`, shipId: 'hull_frigate', systemId: 'sys_home', colonyId: 'p_home', homeColonyId: 'p_home', status: 'idle',
  position: { ...DOCK }, mission: null, movementOrder: null, fuel: { current: 40, max: 60, consumption: 1 }, warpFuel: { current: 0, max: 0 },
  endurance: { current: 10, max: 10 }, cargo: {}, cargoUsed: 0, cargoMax: 0, modules: ['engine_ion', 'weapon_laser'], isWreck: false,
  serviceState: 'active', fleetId: null, refuelAutomatically: true, ...o,
});
const evs = [];
for (const ev of ['vessel:focus', 'body:selected', 'station:selected', 'ui:selectionChanged', 'ui:fleetSelectionChanged']) EventBus.on(ev, (p) => evs.push([ev, p]));
const pings = [];
let UM = null;
/** Stub `UIManager` — selekcja jak w grze (bez reguł T6; te pinuje F5 na prawdziwych metodach). */
function stubUm() {
  return {
    _dirty: false, _sel: [], _lead: null, _fleet: null, _picker: null, calls: [],
    getSelectedVesselId() { return this._lead; }, getSelectedVesselIds() { return [...this._sel]; }, getSelectedFleetId() { return this._fleet; },
    setSelectedVesselId(id) { this.calls.push(['vessel', id]); this._sel = id == null ? [] : [id]; this._lead = id; },
    addToSelection(id) { this.calls.push(['add', id]); if (!this._sel.includes(id)) this._sel.push(id); if (this._lead == null) this._lead = id; },
    removeFromSelection(id) { this.calls.push(['remove', id]); this._sel = this._sel.filter((x) => x !== id); if (this._lead === id) this._lead = this._sel[0] ?? null; },
    setSelectedFleetId(f) { this.calls.push(['fleet', f]); this._fleet = f; },
    getPickerState() { return this._picker; }, isPickerActive() { return !!this._picker; },
    setPickerMode(mode, cb, md) { this.calls.push(['picker', mode, md]); this._picker = { mode, callback: cb, metadata: md }; return true; },
    cancelPickerMode() { this.calls.push(['cancelPicker']); const had = !!this._picker; this._picker = null; return had; },
  };
}
function world({ vessels = [], fleets = [], sel = [], fleetSel = null, immob = [], noFleetSystem = false, combat = [] } = {}) {
  EntityManager.clear();
  const home = { id: 'p_home', type: 'planet', name: 'Nowa Ziemia', x: AU, y: 0, systemId: 'sys_home', orbital: { a: 1, e: 0, T: 1, M: 0 }, explored: true };
  const two = { id: 'p_two', type: 'planet', name: 'Wtora', x: 3 * AU, y: 0, systemId: 'sys_home', orbital: { a: 3, e: 0, T: 5, M: 0 }, explored: true };
  const star = { id: 'star_home', type: 'star', name: 'Kepler', systemId: 'sys_home', x: 0, y: 0 };
  const starB = { id: 'star_B', type: 'star', name: 'Thuban', systemId: 'sys_B', x: 0, y: 0 };
  for (const e of [home, two, star, starB]) EntityManager.add(e);
  const vmap = new Map(vessels.map((v) => [v.id, v]));
  const fmap = new Map(fleets.map((f) => [f.id, f]));
  const fsCalls = [];
  UM = stubUm();
  UM._sel = [...sel]; UM._lead = sel[0] ?? null; UM._fleet = fleetSel;
  globalThis.window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home', homePlanet: home,
    vesselManager: { _vessels: vmap, getVessel: (id) => vmap.get(id) ?? null, getAllVessels: () => [...vmap.values()],
      isImmobilized: (v) => immob.includes(v?.id), getVesselUpkeepCredits: () => 300, getVesselBaseUpkeepCredits: () => 300,
      undockToOrbit: (id) => fsCalls.push(['undock', id]), manualRefuel: (id) => fsCalls.push(['refuel', id]) },
    fleetSystem: noFleetSystem ? null : {
      getFleet: (id) => fmap.get(id) ?? null, listFleets: () => [...fmap.values()],
      setName: (id, n) => fsCalls.push(['setName', id, n]), setDoctrine: (id, d) => fsCalls.push(['setDoctrine', id, d]),
      removeMember: (id, r) => fsCalls.push(['removeMember', id, r]), cancelFleetOrder: (id, r) => fsCalls.push(['cancelFleetOrder', id, r]),
      disbandFleet: (id, r) => fsCalls.push(['disbandFleet', id, r]), issueFleetOrder: () => ({ ok: true, accepted: [], rejected: [] }),
    },
    movementOrderSystem: { cancelOrder: (id, r) => fsCalls.push(['cancelOrder', id, r]), issueOrder: (id, s) => fsCalls.push(['issueOrder', id, s?.type]) },
    colonyManager: { activePlanetId: 'p_home', getColony: () => null, getAllColonies: () => [], getPlayerColonies: () => [] },
    deepSpaceCombatSystem: { _findActiveEncounterContaining: (id) => (combat.includes(id) ? { id: 'e1' } : null) },
    starSystemManager: { activeSystemId: 'sys_home', switchActiveSystem: () => true, getSystem: () => null },
    threeRenderer: { _pingedEnemyId: null, pingVessel: (id) => pings.push(id) },
    uiManager: UM,
  };
  evs.length = 0; pings.length = 0;
  return { K: globalThis.window.KOSMOS, fsCalls, home };
}
const fleet = (id, memberIds, o = {}) => ({ id, name: o.name ?? `Flota ${id}`, memberIds: [...memberIds], doctrine: o.doctrine ?? 'engage_in_range', activeOrder: o.activeOrder ?? null });

// Stany z inwentarza §5.9.1 (flota — I1 F1–F6; grupa — G1–G6).
const FLEET_STATES = {
  f_docked: () => ({ vessels: ['a', 'b', 'c'].map((id) => ship(id)), fleets: [fleet('F1', ['a', 'b', 'c'])], fleetSel: 'F1' }),
  f_space:  () => ({ vessels: [ship('a', { position: { ...SPACE } }), ship('b', { position: { ...ORBIT } }), ship('c', { position: { ...SPACE } })],
    fleets: [fleet('F1', ['a', 'b', 'c'], { activeOrder: { type: 'moveToPoint' } })], fleetSel: 'F1' }),
  f_mixed:  () => ({ vessels: [ship('a'), ship('b'), ship('c', { position: { ...SPACE }, movementOrder: { id: 'mo_1', type: 'engage', status: 'active', targetEntityId: 'x_9' } }),
    ship('d', { position: { ...ORBIT } })], fleets: [fleet('F1', ['a', 'b', 'c', 'd'], { activeOrder: { type: 'engage' } })], fleetSel: 'F1', combat: ['c'] }),
  f_empty:  () => ({ vessels: [ship('a', { isWreck: true })], fleets: [fleet('F1', ['a'])], fleetSel: 'F1' }),
  f_other:  () => ({ vessels: [ship('a'), ship('b', { systemId: 'sys_B' }), ship('c', { systemId: null, position: { ...SPACE } })],
    fleets: [fleet('F1', ['a', 'b', 'c'])], fleetSel: 'F1' }),
  f_big:    () => ({ vessels: Array.from({ length: 9 }, (_, i) => ship(`v${i}`, { position: i % 2 ? { ...SPACE } : { ...DOCK } })),
    fleets: [fleet('F1', Array.from({ length: 9 }, (_, i) => `v${i}`))], fleetSel: 'F1' }),
  f_min:    () => ({ vessels: ['a', 'b'].map((id) => ship(id)), fleets: [fleet('F1', ['a', 'b'])], fleetSel: 'F1', minimized: true }),
};
const GROUP_STATES = {
  g_docked: () => ({ vessels: ['a', 'b', 'c'].map((id) => ship(id)), sel: ['a', 'b', 'c'] }),
  g_space:  () => ({ vessels: [ship('a', { position: { ...SPACE }, movementOrder: { id: 'mo_1', type: 'moveToPoint', status: 'active' } }),
    ship('b', { position: { ...ORBIT }, movementOrder: { id: 'mo_2', type: 'pursue', status: 'active', targetEntityId: 'x_9' } })], sel: ['a', 'b'] }),
  g_immob:  () => ({ vessels: [ship('a', { position: { ...SPACE } }), ship('b', { position: { ...ORBIT } })], sel: ['a', 'b'], immob: ['a', 'b'] }),
  g_nofs:   () => ({ vessels: ['a', 'b'].map((id) => ship(id)), sel: ['a', 'b'], noFleetSystem: true }),
  g_big:    () => ({ vessels: Array.from({ length: 9 }, (_, i) => ship(`v${i}`)), sel: Array.from({ length: 9 }, (_, i) => `v${i}`) }),
  g_min:    () => ({ vessels: ['a', 'b'].map((id) => ship(id)), sel: ['a', 'b'], minimized: true }),
  // Strojenie 1 (562): członek „a” w aktywnym starciu — „Odwrót” aktywny; także przy unieruchomieniu (D-FDk — jak MOS).
  g_combat: () => ({ vessels: [ship('a', { position: { ...SPACE } }), ship('b', { position: { ...ORBIT } })], sel: ['a', 'b'], combat: ['a'] }),
  g_combat_immob: () => ({ vessels: [ship('a', { position: { ...SPACE } }), ship('b', { position: { ...ORBIT } })], sel: ['a', 'b'], combat: ['a'], immob: ['a', 'b'] }),
};
function fleetScene(name) {
  const s = FLEET_STATES[name]();
  const w = world(s);
  const fcp = new FleetCommandPanel();
  fcp._fleetId = s.fleetSel; fcp.visible = true; fcp._minimized = !!s.minimized;
  return { s, w, fcp };
}
function groupScene(name) {
  const s = GROUP_STATES[name]();
  const w = world(s);
  const fgp = new FleetGroupPanel();
  fgp._ids = [...s.sel]; fgp.visible = true; fgp._minimized = !!s.minimized;
  return { s, w, fgp };
}
const PAGING = new Set(L?.PAGING_ZONE_TYPES ?? ['pageUp', 'pageDown']);
/** Strefy dzisiejszego panelu (prawdziwy `draw`) — wszystkie strony, bez stronicowania i tła. */
function oldZones(panel) {
  const out = [];
  for (let page = 0; page < 6; page++) {
    panel._page = page;
    panel.draw(recCtx(), 1280, 720);
    const zs = panel._hitZones.filter((z) => z.type !== 'bg' && !PAGING.has(z.type));
    if (panel._page !== page) break;   // `draw` przyciął stronę — koniec listy
    for (const z of zs) if (!out.some((o) => o.type === z.type && JSON.stringify(o.data) === JSON.stringify(z.data))) out.push(z);
  }
  panel._page = 0;
  return out;
}
const keys = (zs) => zs.map((z) => L?.zoneKey?.(z) ?? '?').sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const envOf = (K) => ({ K, orderTargetInfo: () => null, systemName: (id) => EntityManager.getStarOfSystem?.(id)?.name ?? null });
const fleetModel = (K, fcp, extra = {}) => L?.buildFleetPanelModel?.(K.fleetSystem?.getFleet?.(fcp._fleetId), { ...envOf(K), minimized: fcp._minimized, ...extra });
const groupModel = (K, fgp) => {
  const vs = (UM.getSelectedVesselIds()).map((id) => K.vesselManager.getVessel(id)).filter((v) => v && !v.isWreck && !isEnemyVessel(v));
  return L?.buildGroupPanelModel?.(vs, { ...envOf(K), leadId: UM.getSelectedVesselId(), minimized: fgp._minimized });
};
/** Panel T6 na atrapie: `prepare` + `draw` w prostokącie przy kolumnie (x = 930). */
function t6Panel(surface, { lay = null, ctx = recCtx(), fcp = null, fgp = null, maxH = 640, open = false } = {}) {
  const layer = lay ?? (Y ? new Y.FleetPanelHudLayer() : null);
  if (!layer) return null;
  const K = globalThis.window.KOSMOS;
  const sz = layer.prepare({ ctx, K, um: UM, fcp, fgp, surface, maxH });
  if (open && sz && layer._prep?.model) { layer._open = L.toggleOrders(layer._open, layer._prep.model.key); layer.prepare({ ctx, K, um: UM, fcp, fgp, surface, maxH }); }
  const sz2 = layer._prep ? { w: layer._prep.w, h: layer._prep.h } : null;
  if (sz2) layer.draw(ctx, { x: 930, y: 60, w: sz2.w, h: sz2.h }, {});
  return { layer, sz: sz2, ctx };
}
const mid = (z) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });

// ═══ F0 ═══════════════════════════════════════════════════════════════════════
header('F0  moduły (flagi kroków na stałe ON od T4)');
{
  const API = ['FLEET_PANEL_HUD', 'FLEET_PANEL_ZONE_TYPES', 'GROUP_PANEL_ZONE_TYPES',
    'PAGING_ZONE_TYPES', 'FLEET_PICKER_INTENTS', 'fleetHudSurface', 'dropFleetOnShipSelection', 'escapeClosesFleetPanel',
    'shouldDropFleetPicker', 'fleetPickerFor', 'fleetRowKeys', 'buildFleetPanelModel', 'buildGroupPanelModel', 'modelZones', 'zoneKey',
    'toggleOrders', 'ordersOpen', 'fleetPanelHitAt', 'runFleetPanelAction', 'memberClickPlan', 'dropFleetOnEmptyMapClick', 'pickerBannerHidden'];
  ok(!!L && API.every((k) => k in L), `F0a FleetPanelHudLogic eksportuje: ${API.join(', ')}`);
  ok(typeof Y?.FleetPanelHudLayer === 'function' && new Y.FleetPanelHudLayer() instanceof T5.ShipPanelHudLayer,
    'F0b FleetPanelHudLayer — osobny renderer; maszyneria tekstu odziedziczona z panelu statku T5 (ten sam font, kratka cyfr)');
  const gone = ['fleetPanelHud', 'shipPanelHud', 'shipPanelOutliner', 'mapVesselPanel', 'mapVesselPanelCompact'];
  const cfgSrc = src('../../config/GameConfig.js');
  ok(!!L && L.isFleetPanelHudOn === undefined && L.isFleetPanelHudActive === undefined && gone.every((k) => FEATURES[k] === undefined)
    && gone.every((k) => !new RegExp('\\b' + k + ':\\s*(true|false)').test(cfgSrc)),
    'F0c flaga `fleetPanelHud` i flagi T5 / T3 na stałe ON (T4) — predykaty `isFleetPanelHudOn` / `isFleetPanelHudActive` i klucze usunięte');
  ok((L?.FLEET_PANEL_ZONE_TYPES?.length ?? 0) === 16 && new Set(L?.FLEET_PANEL_ZONE_TYPES ?? []).size === 16
    && (L?.GROUP_PANEL_ZONE_TYPES?.length ?? 0) === 11 && new Set(L?.GROUP_PANEL_ZONE_TYPES ?? []).size === 11,
    'F0f typy stref (inwentarz §5.9.1 I2): flota 16, grupa 11, bez powtórzeń (stronicowanie i tło osobno)');
}

// ═══ F1 ═══════════════════════════════════════════════════════════════════════
header('F1  zbiór akcji ON = OFF — strefy panelu T6 ≡ strefy PRAWDZIWEGO dzisiejszego panelu (typ + dane), każdy stan');
{
  const fTypes = new Set(), gTypes = new Set(), sigs = new Set();
  for (const name of Object.keys(FLEET_STATES)) {
    const { w, fcp } = fleetScene(name);
    const z0 = oldZones(fcp);
    const m = fleetModel(w.K, fcp);
    const z6 = L?.modelZones?.(m) ?? [];
    for (const z of z0) fTypes.add(z.type);
    sigs.add(JSON.stringify(keys(z0)));
    ok(z0.length > 0 && same(keys(z0), keys(z6)), `F1 flota ${name.padEnd(9)} — ${z0.length} stref dziś = ${z6.length} stref T6`);
  }
  for (const name of Object.keys(GROUP_STATES)) {
    const { w, fgp } = groupScene(name);
    const z0 = oldZones(fgp);
    const m = groupModel(w.K, fgp);
    const z6 = L?.modelZones?.(m) ?? [];
    for (const z of z0) gTypes.add(z.type);
    sigs.add(JSON.stringify(keys(z0)));
    ok(z0.length > 0 && same(keys(z0), keys(z6)), `F1 grupa ${name.padEnd(9)} — ${z0.length} stref dziś = ${z6.length} stref T6`);
  }
  ok(sigs.size >= 10, `F1-k KONTROLA: stany dają RÓŻNE zbiory stref (${sigs.size} na ${Object.keys(FLEET_STATES).length + Object.keys(GROUP_STATES).length})`);
  const fMiss = (L?.FLEET_PANEL_ZONE_TYPES ?? []).filter((x) => !fTypes.has(x));
  const gMiss = (L?.GROUP_PANEL_ZONE_TYPES ?? []).filter((x) => !gTypes.has(x));
  ok(fTypes.size === 16 && fMiss.length === 0, `F1-p pokrycie floty: stany ćwiczą wszystkie 16 typów (brak: ${fMiss.join(', ') || '—'})`);
  ok(gTypes.size === 11 && gMiss.length === 0, `F1-q pokrycie grupy: stany ćwiczą wszystkie 11 typów (brak: ${gMiss.join(', ') || '—'})`);
  // KONTROLA czułości: model bez jednego chipa / bez akcji członka — porównanie zgłasza różnicę.
  const { w, fcp } = fleetScene('f_mixed');
  const z0 = oldZones(fcp);
  const m = fleetModel(w.K, fcp);
  if (m) m.chips = [];
  const m2 = fleetModel(w.K, fcp);
  if (m2?.members?.[0]) m2.members[0].chips = m2.members[0].chips.slice(0, 1);
  ok(!same(keys(z0), keys(L?.modelZones?.(m) ?? [])) && !same(keys(z0), keys(L?.modelZones?.(m2) ?? [])),
    'F1-c KONTROLA: model bez „Rozwiąż” albo bez ✕ członka — porównanie zgłasza różnicę');
}

// ═══ F2 ═══════════════════════════════════════════════════════════════════════
header('F2  każdy chip → TEN SAM handler (`_onHit` dzisiejszego panelu) — prawdziwe kliki obu paneli');
{
  const spy = (panel) => { const rec = []; panel._onHit = (z) => rec.push(L?.zoneKey?.(z) ?? z?.type); return rec; };
  const clickAllOld = (panel) => {
    const rec = spy(panel);
    const zs = oldZones(panel);
    for (const z of zs) {
      panel.draw(recCtx(), 1280, 720);   // strefy z tej klatki (jak gra)
      const c = mid(z);
      panel.handleClick(c.x, c.y);
    }
    return rec;
  };
  const clickAllT6 = (surface, panel, args) => {
    const rec = spy(panel);
    const r = t6Panel(surface, { ...args, open: true });
    const zs = (r?.layer?._zones ?? []).filter((z) => z.kind === 'chip' && z.zone && z.enabled !== false);
    for (const z of zs) { const c = mid(z); r.layer.handleClick(c.x, c.y, { K: globalThis.window.KOSMOS, um: UM, ...args }); }
    return rec;
  };
  for (const name of ['f_mixed', 'f_docked', 'f_other']) {
    const a = fleetScene(name); const old = clickAllOld(a.fcp).sort();
    const b = fleetScene(name); const neu = clickAllT6('fleetHud', b.fcp, { fcp: b.fcp });
    ok(old.length > 0 && same(old, [...neu].sort()), `F2 flota ${name} — ${old.length} wywołań \`_onHit\` z dzisiejszego panelu = ${neu.length} z chipów T6`);
  }
  for (const name of ['g_docked', 'g_space', 'g_combat']) {
    const a = groupScene(name); const old = clickAllOld(a.fgp).sort();
    const b = groupScene(name); const neu = clickAllT6('groupHud', b.fgp, { fgp: b.fgp });
    ok(old.length > 0 && same(old, [...neu].sort()), `F2 grupa ${name} — ${old.length} wywołań \`_onHit\` z dzisiejszego panelu = ${neu.length} z chipów T6`);
  }
  // Dyspozycja `runFleetPanelAction` — panel podany wprost (bez panelu — nic).
  const rec = [];
  ok(L?.runFleetPanelAction?.({ type: 'bgStop', data: {} }, { panel: { _onHit: (z) => rec.push(z.type) } }) === true && rec[0] === 'bgStop'
    && L?.runFleetPanelAction?.({ type: 'bgStop', data: {} }, { panel: null }) === false, 'F2-d `runFleetPanelAction` → `_onHit(zone)` panelu; bez panelu — nic');
  // KONTROLA: prawdziwy handler (bez szpiega) — chip „Stop” T6 woła `cancelFleetOrder` floty (ten sam skutek co przycisk dziś).
  const c = fleetScene('f_space');
  const r = t6Panel('fleetHud', { fcp: c.fcp, open: true });
  const z = r?.layer?._zones?.find((q) => q.zone?.type === 'bgStop');
  if (z) { const p = mid(z); r.layer.handleClick(p.x, p.y, { K: c.w.K, um: UM, fcp: c.fcp }); }
  ok(c.w.fsCalls.some((x) => x[0] === 'cancelFleetOrder' && x[1] === 'F1' && x[2] === 'manual'), 'F2-e prawdziwy `_onHit` (bez szpiega): chip „Stop” → `cancelFleetOrder(F1, manual)`');
}

// ═══ F3 ═══════════════════════════════════════════════════════════════════════
header('F3  stany nieaktywne zgodne z dziś (chip przygaszony ⇔ dzisiejszy przycisk bez strefy)');
{
  const { w, fcp } = fleetScene('f_docked');
  const m = fleetModel(w.K, fcp);
  const off = (m?.orders?.items ?? []).filter((c) => !c.enabled).map((c) => c.id).sort();
  const old = new Set(oldZones(fcp).map((z) => z.type));
  ok(same(off, ['bgReturn', 'bgStop']) && !old.has('bgReturn') && !old.has('bgStop') && old.has('bgUndock'),
    `F3a flota w doku bez rozkazu: przygaszone ${off.join(', ')} — dziś bez strefy; „Odcumuj” aktywny w obu`);
  const rec = []; fcp._onHit = (z) => rec.push(z.type);
  const r = t6Panel('fleetHud', { fcp, open: true });
  const chipZones = (r?.layer?._zones ?? []).filter((z) => z.kind === 'chip');
  const dimIds = new Set((r?.layer?._prep?.model?.orders?.items ?? []).filter((c) => !c.enabled).map((c) => c.id));
  ok(chipZones.length > 0 && dimIds.size === 2 && !chipZones.some((z) => z.enabled === false || dimIds.has(z.zone?.type ?? z.id))
    && chipZones.some((z) => z.zone?.type === 'bgUndock'),
    'F3b przygaszony chip (Powrót, Stop) nie ma strefy kliku — rysowany w roli `dim`; aktywny obok (Odcumuj) — ma');
  const g = groupScene('g_immob');
  const gm = groupModel(g.w.K, g.fgp);
  const goff = (gm?.orders?.items ?? []).filter((c) => !c.enabled).map((c) => c.id).sort();
  ok(same(goff, ['grpDock', 'grpRefuel', 'grpRetreat', 'grpStop', 'grpUndock']), `F3c grupa unieruchomiona w kosmosie: wszystkie rozkazy przygaszone (${goff.join(', ')}) — jak \`countActionable\``);
}

// ═══ F4 ═══════════════════════════════════════════════════════════════════════
header('F4  strefy kliku: chip > linia członka > nazwa > pasek');
{
  const Z = [{ kind: 'body', id: 'b', x: 0, y: 0, w: 200, h: 200 }, { kind: 'name', id: 'n', x: 0, y: 0, w: 100, h: 20 },
    { kind: 'member', id: 'v1', x: 0, y: 40, w: 200, h: 14 }, { kind: 'chip', id: 'memberFocus:v1', x: 160, y: 40, w: 14, h: 14 }];
  ok(L?.fleetPanelHitAt?.(Z, 165, 45)?.kind === 'chip' && L.fleetPanelHitAt(Z, 50, 45)?.kind === 'member' && L.fleetPanelHitAt(Z, 50, 10)?.kind === 'name'
    && L.fleetPanelHitAt(Z, 50, 150)?.kind === 'body' && L.fleetPanelHitAt(Z, 500, 500) === null, 'F4a priorytet: chip > linia członka > nazwa > pasek; poza panelem — nic');
  const { w, fcp } = fleetScene('f_docked');
  const rec = []; fcp._onHit = (z) => rec.push(z.type);
  const r = t6Panel('fleetHud', { fcp });
  const lay = r?.layer;
  const mem = lay?._zones?.find((z) => z.kind === 'member');
  const foc = lay?._zones?.find((z) => z.zone?.type === 'memberFocus');
  const bodyZ = lay?._zones?.find((z) => z.kind === 'body');
  ok(!!mem && !!foc && foc.y >= mem.y && foc.y + foc.h <= mem.y + mem.h + 0.01, 'F4b chipy-glify członka leżą na jego linii (◎ ✕ na końcu linii)');
  const p = foc ? mid(foc) : { x: -1, y: -1 };
  ok(lay?.handleClick?.(p.x, p.y, { K: w.K, um: UM, fcp }) === true && rec[0] === 'memberFocus', 'F4c klik ◎ na linii członka — chip (`memberFocus`), nie zaznaczenie statku');
  const empty = bodyZ ? { x: bodyZ.x + bodyZ.w - 2, y: bodyZ.y + bodyZ.h - 2 } : { x: -1, y: -1 };
  rec.length = 0; const n0 = UM.calls.length;
  ok(lay?.handleClick?.(empty.x, empty.y, { K: w.K, um: UM, fcp }) === true && rec.length === 0 && UM.calls.length === n0,
    'F4d klik w pasek poza chipami i liniami — pochłonięty, bez akcji');
  ok(lay?.handleClick?.(10, 10, { K: w.K, um: UM, fcp }) === false, 'F4e klik poza panelem — nie jego (`false`)');
  ok(lay?.chipAt?.(p.x, p.y) != null && lay.chipAt(empty.x, empty.y) === null && (mem ? lay.chipAt(mem.x + 20, mem.y + 4) : null) != null,
    'F4f „rączka”: nad aktywnym chipem i linią członka — tak; nad pustym paskiem — nie');
}

// ═══ F5 ═══════════════════════════════════════════════════════════════════════
header('F5  mutex trzech paneli — flota > N ≥ 2 > lider (reguła Doku `computePanelMode`), zaznaczenie statku zdejmuje flotę');
const ON_F = { ...FEATURES };
{
  const cases = [
    [null, 0, null, 'none'], [null, 1, 'a', 'vessel'], [null, 3, 'a', 'group'], ['F1', 0, null, 'none'], ['F1', 1, 'a', 'vessel'], ['F1', 3, 'a', 'group'],
  ];
  let okOn = true;
  for (const [fid, n, lead, surf] of cases) {
    const on = L?.fleetHudSurface?.(surf, { features: ON_F, fleetId: fid, vesselCount: n, leadId: lead });
    const mode = TDL.computePanelMode({ leadId: lead, selectedCount: n, fleetId: fid });
    const want = mode === 'fleet' ? 'fleetHud' : mode === 'multi' ? 'groupHud' : mode === 'single' ? 'vessel' : 'none';
    if (on !== want) okOn = false;
  }
  ok(okOn, 'F5a powierzchnia = reguła Doku taktycznego (flota → `fleetHud` przy N 0 / 1 / 3; N ≥ 2 → `groupHud`; N = 1 → `vessel`)');
  ok(L?.fleetHudSurface?.('vessel', { features: { ...ON_F, fcFleetPanel: false }, fleetId: 'F1', vesselCount: 1, leadId: 'a' }) === 'vessel'
    && L?.fleetHudSurface?.('group', { features: { ...ON_F, fcGroupPanel: false }, vesselCount: 3, leadId: 'a' }) === 'group',
    'F5c dzisiejsze bramki obowiązują (`fcFleetPanel` / `fcGroupPanel` OFF — bez panelu T6 tego rodzaju)');
  // Prawdziwe metody UIManager: `_mapSurface`, `setSelectedFleetId`, `setSelectedVesselId`, `addToSelection`, `_dropFleetOnShipSelection`.
  const scope = { EventBus, GAME_CONFIG, resolveMapSelectionSurface, isEnemyVessel,
    fleetHudSurface: L?.fleetHudSurface ?? (() => null), dropFleetOnShipSelection: L?.dropFleetOnShipSelection ?? (() => false) };
  const M = {};
  for (const n of ['_mapSurface', 'setSelectedFleetId', 'setSelectedVesselId', 'addToSelection', '_dropFleetOnShipSelection', 'getSelectedVesselId',
    'getSelectedVesselIds', 'getSelectedFleetId', '_syncFleetOvLead']) M[n] = compileMethod(UI, n, scope);
  const umReal = () => {
    const self = { _selectedVesselId: null, _selectedVesselIds: new Set(), _selectedFleetId: null, overlayManager: { overlays: {} } };
    for (const [n, f] of Object.entries(M)) if (f) self[n] = f;
    return self;
  };
  world({ vessels: ['a', 'b', 'c'].map((id) => ship(id)), fleets: [fleet('F1', ['a', 'b'])] });
  const K = globalThis.window.KOSMOS;
  const run = (steps) => { const u = umReal(); K.uiManager = u; for (const s of steps) call(s[0], u, ...s.slice(1)); return u; };
  const u1 = run([[M.setSelectedFleetId, 'F1']]);
  ok(call(M._mapSurface, u1) === 'fleetHud', 'F5d `_mapSurface` (wykonanie): wybrana flota → `fleetHud`');
  const u2 = run([[M.setSelectedFleetId, 'F1'], [M.setSelectedVesselId, 'c']]);
  ok(u2._selectedFleetId === null && u2._selectedVesselId === 'c' && call(M._mapSurface, u2) === 'vessel',
    'F5e zaznaczenie statku (mapa, Tab, etykieta, Dok) zdejmuje flotę → panel statku T5');
  const u4 = run([[M.setSelectedVesselId, 'a'], [M.setSelectedFleetId, 'F1'], [M.setSelectedVesselId, 'a']]);
  ok(u4._selectedFleetId === null && u4._selectedVesselId === 'a', 'F5g statek już zaznaczony przy wybranej flocie (np. „→ Flota”) — ponowny wybór też zdejmuje flotę (przed deduplikacją)');
  const u5 = run([[M.setSelectedFleetId, 'F1'], [M.addToSelection, 'b'], [M.addToSelection, 'c']]);
  ok(u5._selectedFleetId === null && u5._selectedVesselIds.size === 2 && call(M._mapSurface, u5) === 'groupHud',
    'F5h CTRL / prostokąt SHIFT (`addToSelection`) zdejmuje flotę → panel grupy');
  // `clickObject(fleetTarget)` — 1. klik węzła floty: flota + zaznaczenie statków zdjęte; flota ZOSTAJE (null nie zdejmuje).
  const u6 = umReal(); u6.setSelectedVesselId('c'); K.uiManager = u6;
  CI.applyClickIntent(CI.fleetTarget('F1', K.vesselManager.getVessel('a')), CI.CLICK_INTENT.SELECT, { K, emit: () => {} });
  ok(u6._selectedFleetId === 'F1' && u6._selectedVesselIds.size === 0 && call(M._mapSurface, u6) === 'fleetHud',
    'F5i węzeł floty w outlinerze (reguła U1) — panel floty; panel statku zdjęty');
  ok(call(M._dropFleetOnShipSelection, u6, null) === false && u6._selectedFleetId === 'F1', 'F5j odznaczenie statków (`null`) floty nie zdejmuje');
  // JEDEN panel naraz: bramki rysunku — panel statku (`vessel`), panel grupy bez T6 (`group` — przy `fcGroupPanel` OFF, nic nie
  // rysuje), panel T6 (`fleetHud` / `groupHud`) — w każdym stanie zaznaczenia najwyżej jedna prawdziwa (dawnego panelu floty brak).
  const states = [['F1', []], ['F1', ['a']], ['F1', ['a', 'b']], [null, ['a']], [null, ['a', 'b', 'c']], [null, []]];
  let oneOk = true, seenT6 = 0, seenShip = 0;
  for (const [fid, ids] of states) {
    const u = umReal(); K.uiManager = u; u._selectedFleetId = fid; u._selectedVesselIds = new Set(ids); u._selectedVesselId = ids[0] ?? null;
    const surf = call(M._mapSurface, u);
    const gates = [surf === 'vessel', surf === 'group', surf === 'fleetHud' || surf === 'groupHud'];
    const n = gates.filter(Boolean).length;
    if (n > 1 || ((fid || ids.length) && n !== 1)) oneOk = false;
    if (gates[2]) seenT6++;
    if (gates[0]) seenShip++;
  }
  ok(oneOk && seenT6 === 4 && seenShip === 1, `F5k JEDEN panel naraz: w ${states.length} stanach zaznaczenia najwyżej jedna bramka rysunku (T6 ${seenT6}×, statek ${seenShip}×)`);
}

// ═══ F6 ═══════════════════════════════════════════════════════════════════════
header('F6  klik w linię członka → zaznaczenie statku (panel statku T5), panel floty / grupy znika');
{
  ok(L?.memberClickPlan?.({ vesselIds: [], leadId: null }, 'a') === 'select' && L.memberClickPlan({ vesselIds: ['a'], leadId: 'a' }, 'a') === 'clearFleet'
    && L.memberClickPlan({ vesselIds: ['a', 'b'], leadId: 'a' }, 'a') === 'select' && L.memberClickPlan({ vesselIds: ['b'], leadId: 'b' }, 'a') === 'select',
    'F6a plan: statek już jedynym zaznaczeniem — tylko zdjęcie floty; inaczej — wybór (D-UI-5)');
  const { w, fcp } = fleetScene('f_docked');
  const r = t6Panel('fleetHud', { fcp });
  const memB = r?.layer?._zones?.find((z) => z.kind === 'member' && z.id === 'b');
  const pb = memB ? { x: memB.x + 20, y: memB.y + memB.h / 2 } : { x: -1, y: -1 };
  r?.layer?.handleClick?.(pb.x, pb.y, { K: w.K, um: UM, fcp });
  ok(UM._fleet === null && same(UM._sel, ['b']) && UM._lead === 'b', 'F6b flota: klik linii „b” — flota zdjęta, zaznaczony statek „b” (panel statku T5)');
  ok(!evs.some((e) => e[0] === 'vessel:focus') && pings.includes('b'), 'F6c bez polecenia kamery (1. klik = wybór); statek w doku — ping na mapie (jak wiersz outlinera)');
  const g = groupScene('g_docked');
  const rg = t6Panel('groupHud', { fgp: g.fgp });
  const memC = rg?.layer?._zones?.find((z) => z.kind === 'member' && z.id === 'c');
  const pc = memC ? { x: memC.x + 20, y: memC.y + memC.h / 2 } : { x: -1, y: -1 };
  rg?.layer?.handleClick?.(pc.x, pc.y, { K: g.w.K, um: UM, fgp: g.fgp });
  ok(same(UM._sel, ['c']) && UM._lead === 'c', 'F6d grupa: klik linii „c” — zaznaczenie zwija się do „c” (N = 1 → panel statku T5)');
  // Flota z jedynym zaznaczonym statkiem (po „→ Flota”): klik jego linii — tylko zdjęcie floty, bez kamery.
  const a = fleetScene('f_docked');
  UM._sel = ['a']; UM._lead = 'a';
  const ra = t6Panel('fleetHud', { fcp: a.fcp });
  const memA = ra?.layer?._zones?.find((z) => z.kind === 'member' && z.id === 'a');
  if (memA) ra.layer.handleClick(memA.x + 20, memA.y + memA.h / 2, { K: a.w.K, um: UM, fcp: a.fcp });
  ok(UM._fleet === null && same(UM._sel, ['a']) && !evs.some((e) => e[0] === 'vessel:focus'), 'F6e statek już zaznaczony — flota zdjęta, bez kamery');
  // Linia nazwy — reguła D-UI-5 (2. klik): flota zaznaczona → kamera na prowadzącym.
  const n = fleetScene('f_docked');
  const rn = t6Panel('fleetHud', { fcp: n.fcp });
  const nm = rn?.layer?._zones?.find((z) => z.kind === 'name');
  if (nm) rn.layer.handleClick(nm.x + 4, nm.y + 3, { K: n.w.K, um: UM, fcp: n.fcp });
  ok(evs.some((e) => e[0] === 'vessel:focus' && e[1]?.vesselId === 'a') && UM._fleet === 'F1', 'F6f linia nazwy floty — kamera na prowadzącym (D-UI-5), panel zostaje');
}

// ═══ F7 ═══════════════════════════════════════════════════════════════════════
header('F7  akordeon „[ Rozkazy ▼ ]” — zwija się przy zmianie zaznaczenia statków i floty');
{
  const { w, fcp } = fleetScene('f_space');
  const lay = Y ? new Y.FleetPanelHudLayer() : null;
  const orderChip = () => lay?._zones?.find((z) => z.local === 'orders');
  t6Panel('fleetHud', { lay, fcp });
  const hasOrders = () => (lay?._zones ?? []).some((z) => z.zone?.type === 'bgMove');
  ok(!!orderChip() && !hasOrders(), 'F7a domyślnie zwinięte — rozkazy floty niewidoczne (strefy brak)');
  const oc = orderChip(); if (oc) lay.handleClick(mid(oc).x, mid(oc).y, { K: w.K, um: UM, fcp });
  t6Panel('fleetHud', { lay, fcp });
  ok(hasOrders(), 'F7b klik „[ Rozkazy ▼ ]” — rozwinięte, chipy rozkazów klikalne');
  EventBus.emit('ui:fleetSelectionChanged', { fleetId: 'F1' });
  t6Panel('fleetHud', { lay, fcp });
  ok(!!orderChip() && !hasOrders(), 'F7c zmiana floty (`ui:fleetSelectionChanged`) — zwinięte');
  const oc2 = orderChip(); if (oc2) lay.handleClick(mid(oc2).x, mid(oc2).y, { K: w.K, um: UM, fcp });
  t6Panel('fleetHud', { lay, fcp });
  const reopened = hasOrders();
  EventBus.emit('ui:selectionChanged', { vesselId: null, vesselIds: [] });
  t6Panel('fleetHud', { lay, fcp });
  ok(reopened && !!orderChip() && !hasOrders(), 'F7d zmiana zaznaczenia statków (`ui:selectionChanged`) — zwinięte (świadek: przed zdarzeniem rozwinięte)');
}

// ═══ F8 ═══════════════════════════════════════════════════════════════════════
header('F8  konfigurator celu floty (picker Rusz / Atak tej floty) i reguła 546 — zmiana zaznaczenia zdejmuje picker');
{
  const { w, fcp } = fleetScene('f_space');
  // Prawdziwy `_armMovePicker` / `_armEngagePicker` — metadane pickera rozpoznaje `fleetPickerFor`.
  fcp._armMovePicker('F1');
  const pm = UM._picker;
  ok(L?.fleetPickerFor?.(pm, 'F1') === 'fleetcmd_move' && L.fleetPickerFor(pm, 'F2') === null, 'F8a prawdziwy picker „Rusz” (`_armMovePicker`) — rozpoznany dla F1, nie dla F2');
  const lay = Y ? new Y.FleetPanelHudLayer() : null;
  t6Panel('fleetHud', { lay, fcp });
  ok(lay?._prep?.model?.config?.intent === 'fleetcmd_move' && lay._prep.w === S.W_CONFIG && lay._prep.w !== S.W,
    'F8b panel szerszy (konfigurator) z nagłówkiem rozkazu, podpowiedzią i „[ ANULUJ ]”');
  const cz = lay?._zones?.find((z) => z.local === 'cancelPicker');
  if (cz) lay.handleClick(mid(cz).x, mid(cz).y, { K: w.K, um: UM, fcp });
  ok(UM._picker === null && UM.calls.some((c) => c[0] === 'cancelPicker'), 'F8c „[ ANULUJ ]” — `cancelPickerMode` (jak Esc)');
  t6Panel('fleetHud', { lay, fcp });
  ok(lay?._prep?.model?.config === null && lay._prep.w === S.W, 'F8d bez pickera — panel wraca do szerokości podstawowej');
  fcp._armEngagePicker('F1');
  ok(L?.fleetPickerFor?.(UM._picker, 'F1') === 'fleetcmd_engage', 'F8e prawdziwy picker „Atak” (`_armEngagePicker`) — rozpoznany');
  const P = (intent, fid) => ({ mode: 'targetPoint', metadata: { intent, fleetId: fid } });
  ok(L?.shouldDropFleetPicker?.({ picker: P('fleetcmd_move', 'F1'), fleetId: 'F2' }) === true
    && L.shouldDropFleetPicker({ picker: P('fleetcmd_move', 'F1'), fleetId: null }) === true
    && L.shouldDropFleetPicker({ picker: P('fleetcmd_move', 'F1'), fleetId: 'F1' }) === false
    && L.shouldDropFleetPicker({ picker: P('create_poi', undefined), fleetId: null }) === false,
    'F8f reguła 546: inna flota / brak floty — zdjęty; ta sama flota, picker POI — zostaje');
  const mDrop = compileMethod(UI, '_dropFleetPickerOnSelection', { GAME_CONFIG, shouldDropFleetPicker: L?.shouldDropFleetPicker ?? (() => false) });
  const self = (fid) => { const s = { _pickerState: P('fleetcmd_engage', 'F1'), _selectedFleetId: fid, cancelled: 0 }; s.cancelPickerMode = () => { s.cancelled++; s._pickerState = null; return true; }; return s; };
  const sB = self('F2'), sA = self('F1');
  ok(call(mDrop, sB) === true && sB.cancelled === 1 && call(mDrop, sA) === false && sA.cancelled === 0,
    'F8g `UIManager._dropFleetPickerOnSelection` (wykonanie): flota B — picker floty A zdjęty; flota A — zostaje');
  ok(/EventBus\.on\('ui:selectionChanged', \(\) => \{ this\._dropFleetPickerOnSelection\(\); \}\);/.test(UI)
    && /EventBus\.on\('ui:fleetSelectionChanged', \(\) => \{ this\._dropFleetPickerOnSelection\(\); \}\);/.test(UI),
    'F8h montaż: słuchacze zmiany zaznaczenia statków i floty');
}

// ═══ F9 ═══════════════════════════════════════════════════════════════════════
header('F9  kotwica — wiersz węzła floty / lidera grupy w PRAWDZIWYM outlinerze (geometria T3)');
{
  const mAt = compileMethod(UI, '_fleetPanelAtOutliner', { getMapInsets, fleetRowKeys: L?.fleetRowKeys ?? (() => []), shipRowKeys: SPA.shipRowKeys,
    resolveRowAnchor: SPA.resolveRowAnchor, computeShipPanelPlacement: SPA.computeShipPanelPlacement });
  const setup = (vessels, fleets, { fleetSel = null, sel = [] } = {}) => {
    world({ vessels, fleets, fleetSel, sel });
    const K = globalThis.window.KOSMOS;
    const ol = OL ? new OL.Outliner() : null;
    K.rightOutliner = ol; K.leftOutliner = null; K.tacticalDock = { isExpanded: () => false, getReservedHeight: () => 0 };
    K.uiManager.overlayManager = { isAnyOpen: () => false };
    return { K, ol };
  };
  const draw = (ol) => ol?.draw?.(recCtx(), 1280, 720, { groundUnits: [] });
  const self = (ol, extra = {}) => ({ _outliner: ol, combatHud: null, _selectedFleetId: 'F1', _selectedVesselId: null, ...extra });
  const vs = [ship('a', { name: 'Alfa' }), ship('b', { name: 'Beta' }), ship('c', { name: 'Gamma' }), ship('d', { name: 'Delta' })];
  const { K, ol } = setup(vs, [fleet('F1', ['c', 'd'])], { fleetSel: 'F1' });
  draw(ol);
  const row = ol?._layout?.rows?.get('fleet:F1');
  const p = call(mAt, self(ol), 1280, 720, 200, 180, 'fleetHud');
  ok(!!row && p?.mode === 'row' && Math.abs(p.x + p.w - ol._rect.x) < 0.01, 'F9a panel floty przy kolumnie: prawa krawędź = lewa krawędź prawego outlinera');
  ok(!!row && !!p && Math.abs(p.y - (ol._layout.contentTop + row.y - ol._layout.scrollY)) < 0.01 && p.tab?.y === p.y,
    'F9b górna krawędź = wiersz węzła floty; łącznik na wysokości wiersza');
  ol._setExpanded('sys_home', false, 'sys_home'); draw(ol);
  const pc = call(mAt, self(ol), 1280, 720, 200, 180, 'fleetHud');
  ok(!ol._layout.rows.has('fleet:F1') && pc?.mode === 'row' && Math.abs(pc.y - (ol._layout.contentTop + ol._layout.rows.get('system:sys_home').y - ol._layout.scrollY)) < 0.01,
    'F9c układ zwinięty — kotwica przy nagłówku układu (jak T3)');
  ol._setExpanded('sys_home', true, 'sys_home'); draw(ol);
  const pg = call(mAt, self(ol, { _selectedFleetId: null, _selectedVesselId: 'b' }), 1280, 720, 200, 180, 'groupHud');
  const rb = ol?._layout?.rows?.get('vessel:b');
  ok(!!rb && pg?.mode === 'row' && Math.abs(pg.y - (ol._layout.contentTop + rb.y - ol._layout.scrollY)) < 0.01, 'F9d panel grupy — przy wierszu lidera');
  ol.visible = false; draw(ol);
  const pf = call(mAt, self(ol), 1280, 720, 200, 180, 'fleetHud');
  ok(pf?.mode === 'fallback' && pf.tab === null, 'F9e outliner schowany „.” — kotwica zapasowa (prawy górny róg obszaru mapy, D-TR-8)');
  ol.visible = true; K.tacticalDock = { isExpanded: () => true, getReservedHeight: () => 140 }; draw(ol);
  const py = call(mAt, self(ol), 1280, 720, 200, 180, 'fleetHud');
  ok(py?.mode === 'fallback', 'F9f tryb Y (rozwinięty Dok) — panel floty w zapasie (rysuje się — mini-panel Doku odsyła do niego)');
  K.tacticalDock = { isExpanded: () => false, getReservedHeight: () => 0 }; draw(ol);
  const r0 = ol._layout.rows.get('fleet:F1'); const ry = ol._layout.contentTop + r0.y - ol._layout.scrollY;
  const card = { x: 900, y: ry - 20, w: 300, h: 120 };
  const pk = call(mAt, self(ol, { combatHud: { getPanelRect: () => card } }), 1280, 720, 200, 180, 'fleetHud');
  const overlap = pk && pk.x < card.x + card.w && pk.x + pk.w > card.x && pk.y < card.y + card.h && pk.y + pk.h > card.y;
  ok(!!pk && !overlap, 'F9g karta walki — przeszkoda kotwicy (panel obok karty albo zapas — jak T3, 545)');
  ok(same(L?.fleetRowKeys?.('F1', { fleetIndex: new Map([['F1', 'sys_B']]) }), ['fleet:F1', 'system:sys_B'])
    && same(L?.fleetRowKeys?.('F1', { fleetIndex: new Map([['F1', 'transit']]) }), ['fleet:F1', 'transit']) && same(L?.fleetRowKeys?.(null, null), []),
    'F9h klucze kotwicy floty: węzeł, potem nagłówek układu / „W drodze”');
}

// ═══ F10 ══════════════════════════════════════════════════════════════════════
header('F10 Esc zamyka panel floty (przed zaznaczeniem statków; nie przy overlayu i oknie DOM)');
{
  ok(L?.escapeClosesFleetPanel?.({ fleetId: 'F1' }) === true && L.escapeClosesFleetPanel({ fleetId: null }) === false
    && L.escapeClosesFleetPanel({ fleetId: 'F1', overlayOpen: true }) === false && L.escapeClosesFleetPanel({ fleetId: 'F1', modalOpen: true }) === false,
    'F10a Esc: flota — tak; bez floty, overlay, okno DOM — nie');
  const kd = body(GS, '    window.addEventListener(\'keydown\'') || GS;
  const iMod = GS.indexOf('escapeHeldByModal({ K: window.KOSMOS'), iFl = GS.indexOf('escapeClosesFleetPanel({'), iVes = GS.indexOf('if (um?.getSelectedVesselId?.()) {');
  ok(iMod > 0 && iFl > iMod && iVes > iFl && /um\.setSelectedFleetId\(null\);/.test(GS.slice(iFl, iVes)),
    'F10b montaż (`GameScene`): krok floty po oknie DOM, przed zaznaczeniem statków — zdejmuje flotę');
  ok(kd.length > 0, 'F10c KONTROLA: źródło `GameScene` wczytane');
}

// ═══ F11 ══════════════════════════════════════════════════════════════════════
header('F11 montaż — dawne panele floty i grupy poza rysunkiem i klikiem `UIManager` (T4)');
{
  const mClick = compileMethod(UI, '_fleetPanelHudClick', {});
  const lay = Y ? new Y.FleetPanelHudLayer() : null; lay?.clear?.();
  globalThis.window.KOSMOS.civMode = true;
  ok(call(mClick, { _fleetPanelHud: lay, overlayManager: { isAnyOpen: () => false }, _mapSurface: () => 'groupHud' }, 900, 100) === false,
    'F11c panel T6 nienarysowany — klik nie jego');
  const dr = body(UI, '\n  _draw() {');
  ok(dr.length > 0 && !/fleetCommandPanel\.draw\(|fleetGroupPanel\.draw\(/.test(UI),
    'F11d rysunek: dawne panele floty i grupy NIE są rysowane przez `UIManager` (T4; jedyną powierzchnią jest panel T6)');
  ok(/if \(fleetPanelDrawn\) shipPanelDrawn = fleetPanelDrawn;\s*else \{ this\._fleetPanelHud\?\.clear\?\.\(\); this\._fleetPanelPlacement = null; \}/.test(dr)
    && dr.indexOf('this._drawFleetPanelHud(ctx, W, H)') > dr.indexOf('if (!shipPanelHudDrawn) this._shipPanelHud?.clear?.();')
    && dr.indexOf('this._drawFleetPanelHud(ctx, W, H)') < dr.indexOf('this._noteShipPanelDrawn(shipPanelDrawn)'),
    'F11f rysunek T6 w miejscu panelu statku (po T5, przed zapisem przeszkody kart); nienarysowany — `clear` + kotwica wyzerowana');
  const hc = body(UI, '\n  handleClick(x, y) {');
  ok(hc.indexOf('this._vesselPanelClick(x, y)') > 0 && hc.indexOf('this._fleetPanelHudClick(x, y)') > hc.indexOf('this._vesselPanelClick(x, y)')
    && hc.indexOf('this._fleetPanelHudClick(x, y)') < hc.indexOf('this.combatHud?.handleClick?.(x, y)')
    && !/fleetCommandPanel\?\.handleClick|fleetGroupPanel\?\.handleClick|fleetCommandPanel\.handleClick|fleetGroupPanel\.handleClick/.test(UI),
    'F11g klik: T6 zaraz po panelu statku (przed kartą walki); dawnych paneli floty i grupy brak w łańcuchu kliku');
}

// ═══ F12 ══════════════════════════════════════════════════════════════════════
header('F12 budżet — powtórna klatka bez pomiaru tekstu, jeden model na klatkę');
{
  const { fcp } = fleetScene('f_mixed');
  const lay = Y ? new Y.FleetPanelHudLayer() : null;
  const ctx = recCtx();
  t6Panel('fleetHud', { lay, ctx, fcp });
  const m1 = ctx._calls.measures;
  t6Panel('fleetHud', { lay, ctx, fcp });
  const m2 = ctx._calls.measures - m1;
  ok(m1 > 0 && m2 === 0, `F12a powtórna klatka (ten sam stan) — ${m2} pomiarów tekstu (pierwsza: ${m1})`);
  ok((lay?.stats?.prepares ?? 0) === 2 && (lay?.stats?.draws ?? 0) === 2, 'F12b jeden model i jeden rysunek na klatkę (`stats`)');
  lay?.clear?.();
  ok(lay?.rect === null && (lay?._zones?.length ?? -1) === 0 && lay.chipAt(1000, 100) === null && lay.handleClick(1000, 100, {}) === false
    && lay.handleWheel(1000, 100, 50) === false, 'F12c panel nienarysowany — bez stref: brak kliku, kółka i „rączki”');
}

// ═══ F13 ══════════════════════════════════════════════════════════════════════
header('F13 kółko nad panelem przewija WYŁĄCZNIE listę członków');
{
  const { fcp } = fleetScene('f_big');
  const lay = Y ? new Y.FleetPanelHudLayer() : null;
  t6Panel('fleetHud', { lay, fcp });
  const vis0 = (lay?._zones ?? []).filter((z) => z.kind === 'member').map((z) => z.id);
  ok(lay?._maxScroll > 0 && vis0.length > 0 && vis0.length < 9, `F13a 9 członków — lista przewijana (widać ${vis0.length}, ≤ ${S.MEMBERS_MAX})`);
  const r = lay?.rect ?? { x: 0, y: 0, w: 0, h: 0 };
  const nameZ = lay?._zones?.find((z) => z.kind === 'name');
  const y0 = nameZ?.y;
  ok(lay?.handleWheel?.(r.x + 10, r.y + 10, 400) === true && lay._scroll > 0, 'F13b kółko nad panelem — przewija listę (pochłonięte)');
  t6Panel('fleetHud', { lay, fcp });
  const vis1 = (lay?._zones ?? []).filter((z) => z.kind === 'member').map((z) => z.id);
  ok(!same(vis0, vis1) && lay?._zones?.find((z) => z.kind === 'name')?.y === y0, 'F13c przewija się lista, nie panel (nagłówek stoi)');
  ok(lay?.handleWheel?.(10, 10, 50) === false, 'F13d kółko poza panelem — nie jego');
  const g = groupScene('g_big');
  t6Panel('groupHud', { lay, fgp: g.fgp });
  ok(lay?._scroll === 0, 'F13e inny panel (zbiór statków) — przewinięcie od zera');
}

// ═══ F14 ══════════════════════════════════════════════════════════════════════
header('F14 trafienie, blokada kamery i przeszkody — prostokąt panelu T6');
{
  const mHit = compileMethod(UI, '_fleetPanelHudHit', {});
  const lay = Y ? new Y.FleetPanelHudLayer() : null;
  if (lay) lay.rect = { x: 930, y: 60, w: 200, h: 220 };
  ok(call(mHit, { _fleetPanelHud: lay }, 1000, 100) === true && call(mHit, { _fleetPanelHud: lay }, 400, 400) === false, 'F14a `_fleetPanelHudHit` — prostokąt z ostatniej klatki');
  const mOver = compileMethod(UI, 'isOverUI', { UI_SCALE: 1, W: 1280, H: 720, GAME_CONFIG, CIV_PANEL_Y: 0, CIV_SIDEBAR_W: 0, COSMIC });
  const no = { isOver: () => false };
  const fcpStub = { visible: true, _hitTest: () => true };
  const base = () => ({ _gameOverData: null, _confirmDialog: null, _topBar: no, _bottomBar: no, _leftOutliner: no, _outliner: no, _topResourceDrawer: no,
    _bottomNavBar: no, _bottomControlBar: no, _eventLogDrawer: no, _mapSurface: () => 'none', _vesselPanelHit: () => false, _fleetPanelHud: lay,
    _fleetPanelHudHit: mHit, fleetGroupPanel: null, fleetCommandPanel: fcpStub, _stationPanelSurface: () => false,
    stationPanel: null, _tacticalMode: null, tacticalDock: null, panelDock: null, _bottomContext: no, _bodyCardEntity: () => null, overlayManager: { isAnyOpen: () => false } });
  globalThis.window.KOSMOS.civMode = true;
  ok(call(mOver, base(), 1000, 100) === true && call(mOver, base(), 400, 400) === false,
    'F14b `isOverUI` (wykonanie): nad panelem T6 — UI; pusta mapa — nie (dawny panel floty nie jest pytany, nawet gdy jego `_hitTest` mówi „tak”)');
  const HLx = HLL?.HudLabelLayer ? new HLL.HudLabelLayer() : null;
  const um = { _mapSurface: () => 'fleetHud', _bottomContext: {}, _selectedEntity: null, _shipPanelHud: { rect: null }, _fleetOverlay: { _vesselPanelRect: null },
    _fleetPanelHud: { rect: { x: 930, y: 60, w: 200, h: 220 } } };
  const rr = HLx?._cardRects?.({ uiManager: um, civMode: true }) ?? [];
  um._fleetPanelHud.rect = null;
  const r0 = HLx?._cardRects?.({ uiManager: um, civMode: true }) ?? [];
  ok(rr.length === 1 && rr[0].w === 200 && r0.length === 0, 'F14d przeszkoda etykiet HUD: prostokąt panelu T6 (nienarysowany — brak)');
  const mDet = compileMethod(UI, '_detectHoverBtn', { H: 720, W: 1280, COSMIC, CIV_PANEL_Y: 0, CIV_SIDEBAR_W: 0 });
  const dSelf = { _outliner: no, _shipPanelHud: null, _fleetPanelHud: { chipAt: (x) => (x > 900 ? 'bgStop' : null) } };
  ok(call(mDet, dSelf, 1000, 100) === 'fleetpanel' && call(mDet, dSelf, 400, 400) === null, 'F14e kursor „rączki” nad aktywnym chipem / linią członka');
}

// ═══ F15 ══════════════════════════════════════════════════════════════════════
header('F15 strojenie 1 (3) — klik w PUSTĄ mapę zdejmuje flotę i grupę (jak panel statku i przypięcia); uzbrojony picker — klik = cel');
{
  const D = L?.dropFleetOnEmptyMapClick;
  ok(D?.({ fleetId: 'F1' }) === true && D?.({ fleetId: null }) === false && D?.({ fleetId: 'F1', pickerActive: true }) === false,
    'F15a reguła: flota — zdjęta; bez floty, przy uzbrojonym pickerze — nie');
  // Prawdziwe metody (wycięte ze źródła, wykonane): `UIManager._dropFleetOnEmptyMapClick`, `GameScene._selectFromClickPick`,
  // `GameScene._handleTacticalLeftClick` (gałąź pickera).
  const mDrop = compileMethod(UI, '_dropFleetOnEmptyMapClick', { GAME_CONFIG, dropFleetOnEmptyMapClick: D ?? (() => false) });
  const mSel = compileMethod(GS, '_selectFromClickPick', { keepShipSelectionOnMapClick: SPA.keepShipSelectionOnMapClick, GAME_CONFIG, isEnemyVessel,
    window: globalThis.window });
  const mLeft = compileMethod(GS, '_handleTacticalLeftClick', { GAME_CONFIG, worldToGameplay: (x, z) => ({ x, y: z }), document: { querySelector: () => null } });
  world({ vessels: ['a', 'b', 'c'].map((id) => ship(id)), fleets: [fleet('F1', ['a', 'b'])] });
  const umFor = ({ fleet: fid = 'F1', sel = [], picker = false } = {}) => {
    const u = { _selectedFleetId: fid, _sel: [...sel], calls: [], _picker: picker, overlayManager: { isAnyOpen: () => false } };
    u.isPickerActive = () => u._picker;
    u.isOverUI = () => false;
    u.getPickerState = () => (u._picker ? { mode: 'targetPoint', metadata: { intent: 'fleetcmd_move', fleetId: 'F1' } } : null);
    u.setSelectedFleetId = (f) => { u.calls.push(['fleet', f]); u._selectedFleetId = f; };
    u.clearSelection = () => { u.calls.push(['clear']); u._sel = []; };
    u.setSelectedVesselId = (id) => { u.calls.push(['vessel', id]); u._sel = id == null ? [] : [id]; };
    u.toggleSelection = (id) => { u.calls.push(['toggle', id]); };
    u._dropFleetOnEmptyMapClick = function () { return call(mDrop, this); };
    return u;
  };
  const scene = (u) => {
    const s = { uiManager: u, planetScene: null, finals: [], _resolveClickTarget: () => ({ type: 'empty', worldPoint: { x: 3, y: 0, z: 4 } }) };
    s._finalizeTargetPointPicker = (gp) => s.finals.push(gp);
    s._selectFromClickPick = function (...a) { return call(mSel, this, ...a); };
    return s;
  };
  const u1 = umFor();
  call(mSel, scene(u1), null, false, null, null);
  ok(u1._selectedFleetId === null && u1.calls.some((c) => c[0] === 'clear'),
    'F15b pusta mapa (`_selectFromClickPick` — wykonanie) — zaznaczenie wyczyszczone i flota zdjęta → panel floty znika');
  const u2 = umFor({ fleet: null, sel: ['a', 'b'] });
  call(mSel, scene(u2), null, false, null, null);
  ok(u2._sel.length === 0 && u2.calls.some((c) => c[0] === 'clear'), 'F15c grupa N ≥ 2 — pusta mapa czyści zbiór (`clearSelection`, już dziś) → panel grupy znika');
  const u3 = umFor();
  call(mSel, scene(u3), null, false, null, 'body');
  ok(u3._selectedFleetId === 'F1' && !u3.calls.some((c) => c[0] === 'clear'), 'F15d klik w CIAŁO na mapie — flota zostaje (D-TR-14, jak zaznaczenie statku)');
  const u4 = umFor();
  call(mSel, scene(u4), null, true, null, null);
  ok(u4._selectedFleetId === 'F1' && u4.calls.length === 0, 'F15e CTRL + pusta mapa — zbiór i flota bez zmian (jak dziś)');
  const u6 = umFor({ picker: true });
  ok(call(mDrop, u6) === false && u6._selectedFleetId === 'F1', 'F15g obrona w głąb: przy uzbrojonym pickerze `_dropFleetOnEmptyMapClick` floty nie zdejmuje');
  // WYJĄTEK — uzbrojony picker: klik w mapę to cel (gałąź pickera wraca przed zaznaczeniem).
  const ev = { target: { id: 'planet-canvas', tagName: 'CANVAS', closest: () => null }, ctrlKey: false, clientX: 600, clientY: 300 };
  const u7 = umFor({ picker: true }), s7 = scene(u7);
  call(mLeft, s7, ev, { vesselId: null, object: null });
  ok(s7.finals.length === 1 && u7._selectedFleetId === 'F1' && !u7.calls.some((c) => c[0] === 'clear'),
    'F15h WYJĄTEK (wykonanie `_handleTacticalLeftClick`): uzbrojony picker — klik w mapę to cel (`_finalizeTargetPointPicker`); flota i zaznaczenie zostają');
  const u8 = umFor(), s8 = scene(u8);
  call(mLeft, s8, ev, { vesselId: null, object: null });
  ok(s8.finals.length === 0 && u8._selectedFleetId === null, 'F15i ten sam klik bez pickera (pełna ścieżka mapy) — flota zdjęta');
}

// ═══ F16 ══════════════════════════════════════════════════════════════════════
header('F16 strojenie 1 (4) — baner pickera u góry ekranu ukryty, gdy panel floty T6 pokazuje konfigurator');
{
  const HB = L?.pickerBannerHidden;
  const P = (intent, fid) => ({ mode: 'targetPoint', metadata: { intent, fleetId: fid } });
  const base = { picker: P('fleetcmd_move', 'F1'), fleetId: 'F1', minimized: false, panelShown: true };
  ok(HB?.(base) === true && HB?.({ ...base, picker: P('fleetcmd_engage', 'F1') }) === true,
    'F16a picker Rusz / Atak tej floty, panel narysowany i niezwinięty — baner ukryty (podpowiedź tylko w panelu)');
  ok(HB?.({ ...base, minimized: true }) === false && HB?.({ ...base, panelShown: false }) === false && HB?.({ ...base, fleetId: 'F2' }) === false
    && HB?.({ ...base, picker: P('create_poi', undefined) }) === false && HB?.({ ...base, picker: null }) === false,
    'F16b baner widoczny: panel zwinięty albo nienarysowany (overlay), picker innej floty albo POI, bez pickera');
  // Zgodność z modelem: baner ukryty dokładnie wtedy, gdy panel ma konfigurator (prawdziwy `_armMovePicker`).
  const { w, fcp } = fleetScene('f_space');
  fcp._armMovePicker('F1');
  const pk = UM._picker;
  const mCfg = fleetModel(w.K, fcp, { picker: pk }), mMin = fleetModel(w.K, fcp, { picker: pk, minimized: true });
  ok(!!mCfg?.config && HB?.({ ...base, picker: pk }) === true && !mMin?.config && HB?.({ ...base, picker: pk, minimized: true }) === false,
    'F16c zgodność z modelem: konfigurator w panelu ⇔ baner ukryty (zwinięty panel — bez konfiguratora, baner widoczny)');
  // Prawdziwa metoda `UIManager._syncPickerBanner` (wykonanie) na atrapie banera — przez `visibility`, nie `display`.
  const el = { style: { display: 'block', visibility: '' } };
  const doc = { getElementById: (id) => (id === 'kosmos-picker-banner' ? el : null) };
  const mSync = compileMethod(UI, '_syncPickerBanner', { GAME_CONFIG, pickerBannerHidden: HB ?? (() => false), document: doc });
  const self = { _pickerState: P('fleetcmd_move', 'F1'), _selectedFleetId: 'F1', fleetCommandPanel: { _minimized: false } };
  const rOn = call(mSync, self, true), visOn = el.style.visibility;
  const rGone = call(mSync, self, false), visGone = el.style.visibility;
  ok(rOn === true && visOn === 'hidden' && rGone === false && visGone === '' && el.style.display === 'block',
    'F16d `_syncPickerBanner` (wykonanie): panel z konfiguratorem — `visibility: hidden`; panel znika — widoczny; `display` (zdarzenia pickera) nietknięte');
  const dr = body(UI, '\n  _draw() {');
  ok(/else \{ this\._fleetPanelHud\?\.clear\?\.\(\); this\._fleetPanelPlacement = null; \}\s*this\._syncPickerBanner\(!!fleetPanelDrawn && this\._mapSurface\(\) === 'fleetHud'\);/.test(dr),
    'F16f montaż w klatce: zaraz po rysunku panelu T6 (stan z tej klatki)');
  ok(/EventBus\.on\('ui:pickerModeStarted', \(\) => \{\s*this\._syncPickerBanner\(!!this\._fleetPanelHud\?\.rect && this\._mapSurface\(\) === 'fleetHud'\);/.test(UI)
    && /EventBus\.on\('ui:pickerModeEnded', \(\) => \{ this\._syncPickerBanner\(false\); \}\);/.test(UI),
    'F16g montaż w zdarzeniach pickera: start — decyzja od razu (bez mignięcia banera), koniec — ukrycie zdjęte');
  const ph = body(GS, '\n  _createPickerHUD() {');
  ok(ph.length > 0 && /banner\.style\.display = 'block';/.test(ph) && /banner\.style\.display = 'none';/.test(ph) && !/visibility/.test(ph),
    'F16h KONTROLA: baner w `GameScene` jak dziś — pokaż / schowaj przez `display`; `visibility` pisze wyłącznie T6');
}

// ═══ F17 ══════════════════════════════════════════════════════════════════════
header('F17 Finding 562 — „Odwrót” grupy tylko dla członka w AKTYWNYM STARCIU (predykat bramki MOS `not_in_combat`), OFF i ON');
{
  const CA = FGL.countActionable, CC = FGL.combatCheckOf;
  const vm = { isImmobilized: (v) => v?.id === 'imm' };
  const vs = [ship('a', { position: { ...SPACE } }), ship('b', { position: { ...ORBIT } }), ship('imm', { position: { ...SPACE } })];
  const inC = (ids) => (id) => ids.includes(id);
  ok(CA(vs, { vesselManager: vm, combatCheck: inC([]) }).canRetreat === 0, 'F17a poza walką (w kosmosie, na orbicie) — „Odwrót” przygaszony (dawniej aktywny, MOS odmawiał — 562)');
  ok(CA(vs, { vesselManager: vm, combatCheck: inC(['a']) }).canRetreat === 1 && CA(vs, { vesselManager: vm, combatCheck: inC(['a', 'b']) }).canRetreat === 2,
    'F17b członek w aktywnym starciu — aktywny (licznik = członkowie w starciu)');
  ok(CA(vs, { vesselManager: vm, combatCheck: inC(['imm']) }).canRetreat === 1, 'F17c unieruchomiony w starciu — aktywny (ucieczka przebija utrzymanie — D-FDk, jak MOS)');
  ok(CA(vs, { vesselManager: vm }).canRetreat === 0, 'F17d bez systemu walki (brak `combatCheck`) — przygaszony: MOS odmawia wtedy każdemu odwrotowi');
  const r0 = CA(vs, { vesselManager: vm, combatCheck: inC(['a']) });
  ok(r0.canRefuel === 0 && r0.canStop === 0 && r0.canUndock === 0 && r0.canDock === 2, 'F17e KONTROLA: pozostałe liczniki bez zmian (Tankuj / Stop / Odcumuj / Dokuj)');
  // Ten sam predykat co bramka MOS — wykonanie PRAWDZIWEGO `MovementOrderSystem._issueRetreat` na tym samym świecie.
  const w = world({ vessels: [ship('a', { position: { ...SPACE } }), ship('b', { position: { ...ORBIT } })], combat: ['a'] });
  const mos = new MovementOrderSystem(w.K.vesselManager);
  const verdict = (id) => { try { return mos._issueRetreat(w.K.vesselManager.getVessel(id), {})?.reason !== 'not_in_combat'; } catch { return true; } };
  const pred = CC?.(w.K);
  ok(typeof pred === 'function' && verdict('a') === true && verdict('b') === false && ['a', 'b'].every((id) => pred(id) === verdict(id)),
    'F17f `combatCheckOf` = bramka MOS `not_in_combat` (prawdziwe `_issueRetreat` na tym samym świecie: a — w starciu, b — nie)');
  ok(CC?.({}) === null && CC?.({ deepSpaceCombatSystem: {} }) === null, 'F17g bez systemu walki — `null` (fail-closed)');
  // Prawdziwy panel grupy (OFF) i model T6 (ON): strefa „Odwrót” tylko przy członku w starciu.
  const zt = (name) => {
    const { w: ww, fgp } = groupScene(name);
    const old = oldZones(fgp).some((z) => z.type === 'grpRetreat');
    const neu = (groupModel(ww.K, fgp)?.orders?.items ?? []).find((c) => c.id === 'grpRetreat')?.enabled === true;
    return [old, neu];
  };
  const [sOld, sNew] = zt('g_space'), [cOld, cNew] = zt('g_combat'), [iOld, iNew] = zt('g_combat_immob');
  ok(!sOld && !sNew, 'F17h grupa w kosmosie poza walką: dzisiejszy panel bez strefy „Odwrót”, chip T6 przygaszony (OFF i ON)');
  ok(cOld && cNew, 'F17i KONTROLA: członek w starciu — „Odwrót” aktywny w obu panelach');
  ok(iOld && iNew, 'F17k grupa unieruchomiona, członek w starciu — „Odwrót” aktywny w obu panelach (D-FDk; dawniej przygaszony)');
  const g = groupScene('g_combat');
  g.fgp._onHit({ type: 'grpRetreat', data: {} });
  ok(g.w.fsCalls.filter((c) => c[0] === 'issueOrder' && c[2] === 'retreat').length === 2,
    'F17j KONTROLA: handler „Odwrót” bez zmian — rozkaz `retreat` dla każdego statku zbioru (MOS rozstrzyga per statek)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
