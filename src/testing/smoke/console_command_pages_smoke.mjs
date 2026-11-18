// ARC KONSOLE K7-C — keeper: ostatnie strony Dowództwa na konsoli (KZ-Command: jedyna ścieżka, flaga zdjęta). Plan: docs/design/CONSOLES_PLAN.md (K7).
//
// Sekcje (każda degraduje, nie przerywa — symbole nowego kodu przez dynamiczny import):
//   E  panel wroga: strefy == zamrożone; MGŁA — kontakt niezidentyfikowany bez nazwy / imperium / kadłuba
//   G  konfigurator misji: strefy == zamrożone w każdym stanie (wybór celu, potwierdzenie, brak paliwa, inny układ, powtarzanie +
//      ładunek powrotny); niemożliwe = czip wyłączony z powodem i18n; PEŁNY rysunek Dowództwa z aktywnym konfiguratorem nie rzuca
//      i niesie strefy konfiguratora w inspektorze (klasa regresji „ov._fleetActionDef is not a function”), klik WYŚLIJ / ANULUJ
//   A  Atlas: akcje ciała per ciało układu (map_body, atlas_report tylko przy zbadanych), lista ↔ orrery, mgła, cel konfiguratora
//   L  Logistyka: akcje == zamrożone (kreator, drop-downy, zlecenia; katalog drop-downu = reguła niezależna z danych), pole
//      ilości z `consoleZones` przy 1600×1041 i 1280×833, wąskie gardło w roli alert
//   N  Jednostki: akcje == zamrożone (kafle, rekrutacja), kolonia strony lokalna (globalna nietknięta), rekrutacja w niej,
//      inne hosty GroundUnitPanel bez zmian (dziennik + strefy niezależne od consoleKit), czipy zachowują stan stron
//   P  po bramce (właściciel): wszystkie złoża ciała w inspektorze Atlasu; miniatury modeli jednostek (glif tylko bez zasobu);
//      Finding 753 — żaden host GroundUnitPanel bez surowych id archetypów; Finding 751 — kotwica okna ładunku i raportu ciała;
//      Finding 754 — każdy archetyp rozwiązuje się do istniejącego GLB; siatka kafli ≈2× w strefie bohatera bez nakładania
//   R  powody i etykiety: klucze istnieją w PL i EN, nie są surowymi id
// Bez pinów na stałe rysunku.
//
// KZ-Command — piny ON vs OFF przepięte na absolutne (zamrożone z bazy 8701aa8, gdzie ścieżka konsoli była == / ⊇ dawnych stron
// pod pinami E/G/L/N bazy; obecny rysunek = baza 1:1): E (== `_drawEnemyDetails`), G (== `_drawMissionConfig`), L (== dawna strona
// Logistyki; katalog drop-downu = ALL_RESOURCES bez research/energy + COMMODITIES), L orders (anulowanie == OFF → każde zlecenie
// ma w inspektorze dokładnie swoje `logi_cancel`), N (== dawna zakładka Naziemne), A (ciała / raporty z OFF → ciała układu z
// EntityManager, raport ⇔ zbadane), N hosts (flaga ON / OFF → consoleKit true / false), P 751 (flaga OFF → null ⇒ consoleKit
// false = ta sama kotwica). Usunięte: świadkowie rysunku OFF („OFF też anonimowy”, „OFF nie pokazuje nazwy”, „OFF rysuje
// dzisiejszy katalog” — klucz fleet.catalogHeaderFull usunięty z i18n, „wiersz OFF ma 3 najbogatsze”) — strony OFF nie ma;
// zamiast katalogu: FMO bez `_drawAtlasCatalog`, a każda strona stoi w ramie konsoli.

import '../headless/env.js';   // MUSI być pierwszy
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import EntityManager from '../../core/EntityManager.js';
import { consoleRoles } from '../../ui/ConsoleRolesLogic.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const imp = async (p) => { try { return await import(p); } catch (e) { console.log(`  (${p} brak: ${e.message})`); return {}; } };
const PG = await imp('../../ui/CommandPagesLogic.js');
const IV = await imp('../../ui/CommandInspectorView.js');
const CV = await imp('../../ui/CommandConsoleView.js');
const CLL = await imp('../../ui/ConsoleLayoutLogic.js');
const UA = await imp('../../data/unitArchetypes.js');
const HUM = await imp('../../data/factions/humanity.js');
const PL = (await import('../../i18n/pl.js')).pl ?? (await import('../../i18n/pl.js')).default ?? {};
const EN = (await import('../../i18n/en.js')).en ?? (await import('../../i18n/en.js')).default ?? {};
const { t } = await import('../../i18n/i18n.js');
globalThis.__i18nMod = await import('../../i18n/i18n.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s);
const safe = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log(`  ✗ FAIL: ${name} rzuciło: ${e.message}`); } };

const FEAT = GAME_CONFIG.FEATURES;
const AU = 100;
const usedKeys = new Set();

function mockCtx() {
  const log = [];
  return {
    log, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px mono', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, lineCap: 'butt', lineJoin: 'miter',
    fillRect() {}, strokeRect() {}, clearRect() {},
    fillText(s) { log.push(String(s)); },
    beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {}, rect() {},
    setLineDash() {}, quadraticCurveTo() {}, bezierCurveTo() {}, translate() {}, rotate() {}, scale() {}, setTransform() {}, ellipse() {},
    getTransform() { return { a: 1, d: 1 }; },
    measureText(s) { const px = parseFloat(String(this.font).replace(/^(bold |italic )/, '')) || 10; return { width: String(s).length * px * 0.6 }; },
    createRadialGradient() { return { addColorStop() {} }; }, createLinearGradient() { return { addColorStop() {} }; }, drawImage() {},
  };
}

// ── Świat (jak `console_inspector_smoke`) ──────────────────────────────────────────────────────────────────────────
function world(vessels, extra = {}) {
  EntityManager.clear();
  const home = { id: 'p_home', type: 'planet', name: 'Nowa Ziemia', x: 1 * AU, y: 0, systemId: 'sys_home', orbital: { a: 1, e: 0, T: 1, M: 0 }, deposits: [], explored: true, analyzed: true, planetType: 'rocky' };
  const two = { id: 'p_two', type: 'planet', name: 'Wtora', x: 3 * AU, y: 0, systemId: 'sys_home', orbital: { a: 3, e: 0, T: 5, M: 0 }, deposits: [], explored: true, analyzed: true, planetType: 'rocky' };
  const far = { id: 'p_far', type: 'planet', name: 'Thuban b', x: 2 * AU, y: 0, systemId: 'sys_B', orbital: { a: 2, e: 0, T: 3, M: 0 }, deposits: [], explored: true, analyzed: false, planetType: 'rocky' };
  const moon = { id: 'm_one', type: 'moon', name: 'Luna', x: 1.1 * AU, y: 0, systemId: 'sys_home', parentPlanetId: 'p_home', orbital: { a: 0.1, e: 0, T: 0.1, M: 0 }, deposits: [], explored: false, planetType: 'rocky' };
  for (const e of [home, two, far, moon, ...(extra.bodies ?? [])]) EntityManager.add(e);
  const vmap = new Map(vessels.map((v) => [v.id, v]));
  const colony = { planetId: 'p_home', name: 'Nowa Ziemia', isOutpost: false, systemId: 'sys_home', buildingSystem: { hasSpaceport: () => true },
    resourceSystem: { inventory: new Map([['Fe', 120], ['food', 40]]), getAmount: () => 10, canAfford: () => true, spend: () => true, receive: () => {} },
    civSystem: { freePops: 5, population: 7 }, planet: home, isHomePlanet: true, ownerEmpireId: null };
  const colonies = [colony, ...(extra.colonies ?? [])];
  let selV = vessels[0]?.id ?? null, selF = null;
  globalThis.window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home', homePlanet: home,
    vesselManager: { _vessels: vmap, getVessel: (id) => vmap.get(id), getAllVessels: () => [...vmap.values()],
      isImmobilized: () => false, getVesselUpkeepCredits: () => 300, getVesselBaseUpkeepCredits: () => 300,
      _findEntity: (id) => EntityManager.get(id), getVesselSensorRangeAU: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => colonies.find((c) => c.planetId === id) ?? null, getAllColonies: () => colonies,
      getPlayerColonies: () => colonies, isPlayerColony: () => true, hasColony: (id) => colonies.some((c) => c.planetId === id),
      getActiveColony: () => colony, _getShipyardLevel: () => 1 },
    missionSystem: { getActive: () => [] },
    techSystem: { isResearched: () => true, getShipSpeedMultiplier: () => 1, getMultiplier: () => 1, getFuelEfficiency: () => 1 },
    stationSystem: { getStationsAt: () => [], getAllStations: () => [] },
    starSystemManager: { activeSystemId: 'sys_home', getSystem: (id) => ({ id }),
      getAllSystems: () => [{ systemId: 'sys_home', galaxyStar: { name: 'Sol' } }, { systemId: 'sys_B', galaxyStar: { name: 'Thuban' } }] },
    galaxyData: { systems: [{ id: 'sys_home', name: 'Sol' }, { id: 'sys_B', name: 'Thuban' }] },
    fleetSystem: { getFleet: () => null, listFleets: () => [] },
    civilianTradeSystem: { getTreasuryCredits: () => 500 },
    empireRegistry: { get: (id) => (id === 'emp_ai' ? { id, name: 'Hegemonia Vex' } : null) },
    intelSystem: { getVesselContact: (id) => (extra.contacts?.[id] ? { quality: extra.contacts[id] } : null), getLevel: () => null },
    observatorySystem: { isVesselDetected: () => true },
    transportOrderSystem: extra.tos ?? null,
    groundUnitManager: extra.gum ?? null,
    notificationCenter: { getActiveCount: () => 0 },
    deepSpaceCombatSystem: { _findActiveEncounterContaining: () => null },
    uiManager: { _dirty: false, getSelectedVesselId: () => selV, getSelectedVesselIds: () => (selV ? [selV] : []), getSelectedFleetId: () => selF,
      setSelectedVesselId: (id) => { selV = id; }, setSelectedFleetId: (id) => { selF = id; }, overlayManager: { closeActive() {} } },
    threeRenderer: { _pingedEnemyId: null },
  };
  globalThis.KOSMOS = globalThis.window.KOSMOS;
  return { home, colony };
}
const ship = (o = {}) => ({
  id: 'v_1', name: 'Fracht III', shipId: 'hull_medium', systemId: 'sys_home', colonyId: 'p_home', homeColonyId: 'p_home', status: 'idle', owner: 'player',
  position: { state: 'docked', dockedAt: 'p_home', x: 1 * AU, y: 0 }, mission: null, movementOrder: null,
  fuel: { current: 40, max: 60, consumption: 1 }, warpFuel: { current: 0, max: 0 }, endurance: { current: 10, max: 10 },
  cargo: {}, cargoUsed: 0, cargoMax: 2000, colonistCapacity: 0, colonists: 0, troopCapacity: 0,
  modules: ['engine_ion', 'cargo_small'], missionLog: [], isWreck: false, serviceState: 'active', unpaidYears: 0,
  refuelAutomatically: true, experience: 4, ...o,
});
const enemy = (o = {}) => ship({ id: 'v_en', name: 'Krwawy Grot', owner: 'emp_ai', ownerEmpireId: 'emp_ai', shipId: 'hull_medium',
  position: { state: 'in_space', x: 2.5 * AU, y: 1 * AU }, ...o });

const withFeat = (patch, fn) => { const saved = { ...FEAT }; Object.assign(FEAT, patch); try { return fn(); } finally { Object.assign(FEAT, saved); } };
const norm = (z) => `${z.type}|${JSON.stringify(Object.fromEntries(Object.entries(z.data ?? {}).sort()))}`;
const ms = (arr) => arr.map(norm).sort();
const env = () => { const K = window.KOSMOS; return { vMgr: K.vesselManager, ms: K.missionSystem, colMgr: K.colonyManager, activePid: 'p_home' }; };
const BODY = { x: 900, y: 100, w: 294, h: 6000 };
const sameMulti = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
// Strefa w zapisie zamrożonym: typ(klucz=wartość,…) — dane posortowane
const short = (z) => { const d = z.data ?? {}; return `${z.type}(${Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join(',')})`; };
// Zamrożone z bazy 8701aa8 (ścieżka konsoli; tam == dawnym stronom pod pinami E/G/L/N)
const EXPECT_E = {
  tracked: ["back_to_shipyard()"],
  unidentified: ["back_to_shipyard()"],
};
const EXPECT_G = {
  select: ["cancel_config()", "select_target(targetId=m_one,targetSystemId=null)", "select_target(targetId=p_far,targetSystemId=sys_B)", "select_target(targetId=p_two,targetSystemId=null)"],
  select_none: ["cancel_config()"],
  confirm: ["cancel_config()", "change_target()", "confirm_mission()", "toggle_repeat()"],
  no_fuel: ["cancel_config()", "change_target()", "toggle_repeat()"],
  repeat_colony: ["cancel_config()", "change_target()", "confirm_mission()", "set_return_cargo()", "toggle_repeat()"],
  repeat_body: ["cancel_config()", "change_target()", "confirm_mission()", "toggle_repeat()"],
  cross_system: ["cancel_config()", "change_target()", "confirm_mission()", "toggle_repeat()"],
  no_options: ["cancel_config()", "change_target()", "confirm_mission()"],
};
const EXPECT_L = {
  empty: ["logi_from_dropdown_toggle||||", "logi_good_dropdown_toggle||||", "logi_to_dropdown_toggle||||"],
  goods: ["logi_create||||", "logi_from_dropdown_toggle||||", "logi_good_dec|Fe|||", "logi_good_dec|food|||", "logi_good_dropdown_toggle||||", "logi_good_inc|Fe|||", "logi_good_inc|food|||", "logi_good_qty_input|Fe|||", "logi_good_qty_input|food|||", "logi_good_remove|Fe|||", "logi_good_remove|food|||", "logi_to_dropdown_toggle||||"],
  same: ["logi_from_dropdown_toggle||||", "logi_good_dec|Fe|||", "logi_good_dropdown_toggle||||", "logi_good_inc|Fe|||", "logi_good_qty_input|Fe|||", "logi_good_remove|Fe|||", "logi_to_dropdown_toggle||||"],
  no_goods: ["logi_from_dropdown_toggle||||", "logi_good_dropdown_toggle||||", "logi_to_dropdown_toggle||||"],
  no_to: ["logi_from_dropdown_toggle||||", "logi_good_dec|Fe|||", "logi_good_dropdown_toggle||||", "logi_good_inc|Fe|||", "logi_good_qty_input|Fe|||", "logi_good_remove|Fe|||", "logi_to_dropdown_toggle||||"],
  col_dd: ["logi_col_dropdown_bg||||", "logi_col_dropdown_close||||", "logi_col_pick||p_far|from|", "logi_col_pick||p_home|from|", "logi_from_dropdown_toggle||||", "logi_good_dropdown_toggle||||", "logi_to_dropdown_toggle||||"],
  good_dd: ["logi_dropdown_bg||||", "logi_dropdown_close||||", "logi_from_dropdown_toggle||||", "logi_good_dropdown_toggle||||", "logi_good_pick|Cu|||", "logi_good_pick|C|||", "logi_good_pick|Fe|||", "logi_good_pick|Hv|||", "logi_good_pick|H|||", "logi_good_pick|Li|||", "logi_good_pick|Nt|||", "logi_good_pick|Si|||", "logi_good_pick|Ti|||", "logi_good_pick|Xe|||", "logi_good_pick|android_worker|||", "logi_good_pick|antimatter_cells|||", "logi_good_pick|automation_droid|||", "logi_good_pick|basic_supplies|||", "logi_good_pick|civilian_goods|||", "logi_good_pick|compact_bioreactor|||", "logi_good_pick|conductor_bundles|||", "logi_good_pick|electronic_systems|||", "logi_good_pick|extraction_systems|||", "logi_good_pick|food|||", "logi_good_pick|fuel|||", "logi_good_pick|metamaterials|||", "logi_good_pick|military_supplies|||", "logi_good_pick|neurostimulants|||", "logi_good_pick|orbital_shells|||", "logi_good_pick|plasma_cores|||", "logi_good_pick|polymer_composites|||", "logi_good_pick|power_cells|||", "logi_good_pick|pressure_modules|||", "logi_good_pick|propulsion_systems|||", "logi_good_pick|quantum_cores|||", "logi_good_pick|quantum_processors|||", "logi_good_pick|reactive_armor|||", "logi_good_pick|semiconductor_arrays|||", "logi_good_pick|structural_alloys|||", "logi_good_pick|warp_cores|||", "logi_good_pick|water|||", "logi_to_dropdown_toggle||||"],
};
const EXPECT_L_ORDER = { 7: ["logi_cancel||||7"], 8: ["logi_cancel||||8"] };
const EXPECT_N = {
  open: ["ground:recruit|shock_infantry", "ground:select_tile|aa_platform", "ground:select_tile|garrison_unit", "ground:select_tile|ground_supply_unit", "ground:select_tile|medic_unit", "ground:select_tile|recon_drone", "ground:select_tile|rocket_artillery", "ground:select_tile|shock_infantry"],
  no_barracks: ["ground:select_tile|aa_platform", "ground:select_tile|garrison_unit", "ground:select_tile|ground_supply_unit", "ground:select_tile|medic_unit", "ground:select_tile|recon_drone", "ground:select_tile|rocket_artillery", "ground:select_tile|shock_infantry"],
  no_pop: ["ground:select_tile|aa_platform", "ground:select_tile|garrison_unit", "ground:select_tile|ground_supply_unit", "ground:select_tile|medic_unit", "ground:select_tile|recon_drone", "ground:select_tile|rocket_artillery", "ground:select_tile|shock_infantry"],
};

function onInspector(ov) {
  ov._hitZones = []; ov._cmdDisabled = []; ov._cmdTip = null;
  const ctx = mockCtx();
  IV.drawInspector(ov, ctx, BODY, consoleRoles(), env());
  return { zones: ov._hitZones.slice(), disabled: ov._cmdDisabled.slice(), log: ctx.log };
}
const reasonsOf = (dis) => dis.map((d) => d.reasonKey).filter(Boolean);

// ═══ E — panel wroga ══════════════════════════════════════════════════════════════════════════════════════════════
header('E  panel wroga: strefy == zamrożone; mgła tożsamości');
for (const [name, contacts] of [['tracked', { v_en: 'contact' }], ['unidentified', {}]]) {
  await safe(`E ${name}`, () => {
    world([ship(), enemy()], { contacts });
    const ov = new FleetManagerOverlay();
    ov._selectedVesselId = 'v_en';
    const on = onInspector(ov);
    const got = on.zones.map(short).sort();
    ok(EXPECT_E[name].length > 0, `E ${name}: świadek — oczekiwane strefy (${EXPECT_E[name].length})`);
    ok(sameMulti(EXPECT_E[name], got), `E ${name}: strefy == zamrożone (${got.join(' ; ')})`);
    const text = on.log.join('\n');
    if (name === 'unidentified') {
      for (const leak of ['Krwawy Grot', 'Hegemonia Vex', t('cmdPages.enemy.hull'), t('cmdPages.enemy.position')]) ok(!text.includes(leak), `E unidentified: mgła — brak „${leak}” na konsoli`);
      ok(text.includes(t('intel.unidentifiedContact')), 'E unidentified: nagłówek „niezidentyfikowany kontakt”');
      ok(text.includes(t('cmdPages.enemy.noActionsHint').slice(0, 20)), 'E unidentified: gdzie wydać rozkaz (bez cichego braku)');
    } else {
      ok(text.includes('Krwawy Grot') && text.includes('Hegemonia Vex'), 'E tracked: nazwa i imperium przy pełnym kontakcie');
      ok(text.includes(t('cmdPages.enemy.intel.contact')), 'E tracked: jakość kontaktu przez t()');
    }
  });
}
await safe('E logic', () => {
  ok(typeof PG.enemyRows === 'function', 'E logic: enemyRows istnieje');
  const r = PG.enemyRows({ tracked: false, distHomeAU: 2.5, empireName: 'X', typeName: 'Y', posAU: { x: 1, y: 1 } });
  ok(r.length === 1 && r[0].key === 'cmdPages.enemy.distHome', 'E logic: niezidentyfikowany = tylko dystans od domu (mgła w logice)');
  const r2 = PG.enemyRows({ tracked: true, distHomeAU: 1, empireName: null, intel: 'rumor', typeName: 'K', stateKey: 'vesselStatus.orbiting', posAU: { x: 0, y: 0 } });
  ok(r2.some((q) => q.valueKey === 'cmdPages.enemy.empireUnknown'), 'E logic: brak imperium → „nieznane imperium”');
  for (const q of [...r, ...r2]) { usedKeys.add(q.key); if (q.valueKey && q.valueKey.startsWith('cmdPages')) usedKeys.add(q.valueKey); }
});

// ═══ G — konfigurator misji ═══════════════════════════════════════════════════════════════════════════════════════
header('G  konfigurator: strefy == zamrożone w każdym stanie; niemożliwe = powód; pełny rysunek nie rzuca');
const TARGETS = [
  { id: 'p_two', name: 'Wtora', type: 'planet', reachable: true, explored: true, sameSystem: true, distAU: 2 },
  { id: 'm_one', name: 'Luna', type: 'moon', reachable: true, explored: false, sameSystem: true, distAU: 0.1 },
  { id: 'p_x', name: 'Daleka', type: 'planet', reachable: false, explored: true, sameSystem: true, distAU: 40 },
  { id: 'p_far', name: 'Thuban b', type: 'planet', reachable: true, explored: true, sameSystem: false, systemId: 'sys_B', systemName: 'Thuban', distLY: 4.2 },
];
const CFG = {
  select:        { v: {}, cfg: { actionId: 'transport', targetId: null, step: 'select' }, expectReason: 'cmdPages.cfg.reasonTooFar' },
  select_none:   { v: {}, cfg: { actionId: 'transport', targetId: null, step: 'select' }, targets: [], expectReason: 'cmdPages.cfg.reasonNoTarget' },
  confirm:       { v: {}, cfg: { actionId: 'transport', targetId: 'p_two', step: 'confirm' }, expectZone: 'confirm_mission' },
  no_fuel:       { v: { fuel: { current: 0.5, max: 60, consumption: 1 } }, cfg: { actionId: 'transport', targetId: 'p_two', step: 'confirm' }, expectReason: 'cmdPages.cfg.reasonNoFuel', noZone: 'confirm_mission' },
  repeat_colony: { v: {}, cfg: { actionId: 'transport', targetId: 'p_home', step: 'confirm', repeat: true }, expectZone: 'set_return_cargo' },
  repeat_body:   { v: {}, cfg: { actionId: 'transport', targetId: 'p_two', step: 'confirm', repeat: true }, expectZone: 'toggle_repeat', noZone: 'set_return_cargo' },
  cross_system:  { v: {}, cfg: { actionId: 'transport', targetId: 'p_far', targetSystemId: 'sys_B', step: 'confirm' }, expectZone: 'confirm_mission' },
  no_options:    { v: { cargoMax: 0 }, cfg: { actionId: 'colonize', targetId: 'p_two', step: 'confirm' }, noZone: 'toggle_repeat' },
};
const CFG_TYPES = new Set(['select_target', 'cancel_config', 'change_target', 'confirm_mission', 'toggle_repeat', 'set_return_cargo', 'map_body']);
for (const [name, st] of Object.entries(CFG)) {
  await safe(`G ${name}`, () => {
    world([ship(st.v)]);
    const mk = () => { const ov = new FleetManagerOverlay(); ov._selectedVesselId = 'v_1'; ov._missionConfig = { ...st.cfg }; ov._getValidTargets = () => (st.targets ?? TARGETS); return ov; };
    const ovOn = mk();
    const on = onInspector(ovOn);
    const onCfg = on.zones.filter((z) => CFG_TYPES.has(z.type)).map(short).sort();
    const want = EXPECT_G[name] ?? [];
    ok(want.length > 0, `G ${name}: świadek — oczekiwane strefy konfiguratora (${want.length})`);
    ok(sameMulti(want, onCfg), `G ${name}: strefy konfiguratora == zamrożone\n      jest     : ${onCfg.join(' ; ')}\n      oczekiwane: ${want.join(' ; ')}`);
    if (st.expectZone) ok(onCfg.some((k) => k.startsWith(st.expectZone + '(')), `G ${name}: świadek strefy ${st.expectZone}`);
    if (st.noZone) ok(!onCfg.some((k) => k.startsWith(st.noZone + '(')), `G ${name}: brak strefy ${st.noZone}`);
    if (st.expectReason) ok(reasonsOf(on.disabled).includes(st.expectReason), `G ${name}: czip wyłączony z powodem ${st.expectReason} (${reasonsOf(on.disabled).join(',')})`);
    for (const k of reasonsOf(on.disabled)) usedKeys.add(k);
    // kroki z góry na dół: tytuł konfiguratora przed czipem „Wyślij”, „Anuluj” na końcu
    const iT = on.log.findIndex((s) => s.includes(t('cmdPages.cfg.title').toUpperCase()) || s.includes(t('cmdPages.cfg.title')));
    const iS = on.log.findIndex((s) => s.includes(t('cmdPages.cfg.send').toUpperCase()));
    const iC = on.log.findIndex((s) => s.includes(t('cmdPages.cfg.cancel').toUpperCase()));
    ok(iT >= 0 && iS > iT && iC > iS, `G ${name}: kolejność czytania tytuł → … → WYŚLIJ → ANULUJ (${iT}, ${iS}, ${iC})`);
  });
}
// pełny rysunek Dowództwa (draw → konsola → inspektor → konfigurator): nie rzuca, strefy konfiguratora w strefie inspektora,
// klik WYŚLIJ / ANULUJ przez handleClick ma skutek (regresja KZ-Command: `ov._fleetActionDef` usunięte, konfigurator rzucał)
await safe('G draw', () => {
  for (const [name, cfg, need] of [['select', { actionId: 'transport', targetId: null, step: 'select' }, ['cancel_config', 'select_target']],
    ['confirm', { actionId: 'transport', targetId: 'p_two', step: 'confirm' }, ['cancel_config', 'change_target', 'confirm_mission']]]) {
    world([ship()]);
    const ov = new FleetManagerOverlay();
    ov._selectedVesselId = 'v_1'; ov._missionConfig = { ...cfg }; ov._getValidTargets = () => TARGETS;
    ov._visible = true; ov._activeTab = 'tactical';
    let err = null;
    try { withFeat({ consoleKit: true }, () => ov.draw(mockCtx(), 1600, 1041)); } catch (e) { err = e.message; }
    ok(err === null, `G draw ${name}: pełny rysunek z aktywnym konfiguratorem nie rzuca (${err ?? 'ok'})`);
    const ins = ov.consoleZones?.inspector;
    const inIns = (ov._hitZones ?? []).filter((z) => ins && z.x >= ins.x - 1 && z.x + z.w <= ins.x + ins.w + 1);
    ok(need.every((ty) => inIns.some((z) => z.type === ty)), `G draw ${name}: strefy konfiguratora w inspektorze (${need.join(', ')}; jest ${[...new Set(inIns.map((z) => z.type))].join(',')})`);
    if (name === 'confirm') {
      let sent = 0; ov._executeMission = () => { sent++; };
      const zs = inIns.find((z) => z.type === 'confirm_mission');
      if (zs) ov.handleClick(zs.x + zs.w / 2, zs.y + zs.h / 2);
      ok(sent === 1, 'G draw confirm: klik WYŚLIJ → `_executeMission`');
      const zc = inIns.find((z) => z.type === 'cancel_config');
      if (zc) ov.handleClick(zc.x + zc.w / 2, zc.y + zc.h / 2);
      ok(ov._missionConfig === null, 'G draw confirm: klik ANULUJ zamyka konfigurator');
    }
  }
});
await safe('G logic', () => {
  ok(typeof PG.configSteps === 'function', 'G logic: configSteps istnieje');
  const s1 = PG.configSteps('select', false).map((q) => q.state).join(',');
  const s2 = PG.configSteps('confirm', true).map((q) => q.state).join(',');
  const s3 = PG.configSteps('confirm', false).map((q) => q.state).join(',');
  ok(s1 === 'done,current,todo,todo', `G logic: wybór celu = krok 2 (${s1})`);
  ok(s2 === 'done,done,current,todo', `G logic: z opcjami = krok 3 (${s2})`);
  ok(s3 === 'done,done,done,current', `G logic: bez opcji = krok 4 (${s3})`);
  const tr = PG.targetRow({ reachable: false, distAU: 9 }, 'transport');
  ok(!tr.enabled && tr.reasonKey === 'cmdPages.cfg.reasonTooFar', 'G logic: cel za daleko → bez strefy, z powodem');
  ok(PG.confirmGate({ insufficientFuel: true, fuelCost: 3, fuelCur: 1 }).reasonKey === 'cmdPages.cfg.reasonNoFuel', 'G logic: brak paliwa → powód');
  ok(PG.confirmGate({ insufficientFuel: false, fuelCost: 1, fuelCur: 3 }).ok === true, 'G logic: paliwo starcza → OK');
  for (const q of PG.configSteps('select', true)) usedKeys.add(q.labelKey);
});

// ═══ A — Atlas Gwiazd ═════════════════════════════════════════════════════════════════════════════════════════════
function pageDraw(tab, ov, { W = 1600, H = 1041 } = {}) {
  return withFeat({ consoleKit: true }, () => {
    ov._visible = true; ov._activeTab = tab;
    const ctx = mockCtx();
    ov.draw(ctx, W, H);
    return { zones: ov._hitZones.slice(), disabled: (ov._cmdDisabled ?? []).slice(), log: ctx.log, ctx };
  });
}
const zoneOf = (zones, type, pred = () => true) => zones.find((z) => z.type === type && pred(z.data ?? {}));
header('A  Atlas: akcje per ciało układu; lista ↔ orrery; mgła; cel konfiguratora');
await safe('A', () => {
  world([ship(), ship({ id: 'v_2', name: 'Zwiad', position: { state: 'in_transit', x: 2 * AU, y: 0.5 * AU } })]);
  const ov = new FleetManagerOverlay();
  // ciała aktywnego układu (dawna strona OFF: te same 3 wiersze z map_body; raport tylko przy zbadanych — baza 8701aa8)
  const bodies = ['p_home', 'm_one', 'p_two'];
  const reportable = new Set(bodies.filter((id) => EntityManager.get(id)?.explored === true));
  ok(reportable.size === 2 && !reportable.has('m_one'), `A: świadek — raport możliwy przy zbadanych (${[...reportable].join(',')})`);
  const on0 = pageDraw('atlas', ov);
  const listed = [...new Set(on0.zones.filter((z) => z.type === 'atlasSelect').map((z) => z.data.bodyId))].sort();
  ok(listed.join() === [...bodies].sort().join(), `A: lista / orrery = ciała układu (${listed.join(',')})`);
  ok(!on0.zones.some((z) => z.type === 'map_body'), 'A: bez wyboru — akcje ciała dopiero w inspektorze wybranego');
  ok(on0.log.some((s) => s.includes(t('cmdPages.atlas.selectHint'))), 'A: bez wyboru — podpowiedź „wybierz ciało”');
  for (const id of bodies) {
    const listZ = on0.zones.filter((z) => z.type === 'atlasSelect' && z.data.bodyId === id);
    ok(listZ.length >= 2, `A ${id}: wybór na liście i na orrery (${listZ.length} strefy atlasSelect)`);
    // klik listy → stan → inspektor ma dzisiejsze akcje tego ciała
    ov._handleHit(listZ[0]);
    const on = pageDraw('atlas', ov);
    ok(ov._atlasSelectedBodyId === id, `A ${id}: klik listy wybiera ciało`);
    ok(!!zoneOf(on.zones, 'map_body', (d) => d.bodyId === id), `A ${id}: map_body w inspektorze (dzisiejsza akcja wiersza)`);
    const rep = !!zoneOf(on.zones, 'atlas_report', (d) => d.bodyId === id);
    ok(rep === reportable.has(id), `A ${id}: raport ⇔ ciało zbadane (${rep})`);
    if (!rep) ok(on.disabled.some((d) => d.reasonKey === 'cmdPages.atlas.reasonReportUnexplored'), `A ${id}: raport wyłączony z powodem`);
    // klik orrery → ten sam stan (synchronizacja)
    ov._atlasSelectedBodyId = null;
    const heroZ = on.zones.filter((z) => z.type === 'atlasSelect' && z.data.bodyId === id).pop();
    ov._handleHit(heroZ);
    ok(ov._atlasSelectedBodyId === id, `A ${id}: klik orrery wybiera to samo ciało`);
  }
  // mgła: niezbadany księżyc „Luna” — nazwa nigdzie na konsoli, także po wybraniu
  ov._atlasSelectedBodyId = 'm_one';
  const fog = pageDraw('atlas', ov);
  ok(!fog.log.some((s) => s.includes('Luna')), 'A: mgła — nazwa niezbadanego ciała nie wycieka (lista, orrery, inspektor)');
  ok(fog.log.some((s) => s.includes('???')), 'A: mgła — „???” zamiast nazwy');
  // statek w locie zaznaczony na orrery, stolica podpisana
  ok(fog.log.some((s) => s.includes('◆')), 'A: stolica zaznaczona na orrery');
  // konfigurator czeka na cel → czip „ustaw jako cel” = dzisiejszy map_body → krok potwierdzenia
  ov._selectedVesselId = 'v_1';
  ov._missionConfig = { actionId: 'transport', targetId: null, step: 'select' };
  ov._atlasSelectedBodyId = 'p_two';
  const cfg = pageDraw('atlas', ov);
  ok(cfg.log.some((s) => s.includes(t('cmdPages.atlas.actTarget').toUpperCase())), 'A: w trybie wyboru celu czip „ustaw jako cel”');
  ov._handleHit(zoneOf(cfg.zones, 'map_body', (d) => d.bodyId === 'p_two'));
  ok(ov._missionConfig?.step === 'confirm' && ov._missionConfig?.targetId === 'p_two', 'A: czip ustawia cel konfiguratora (krok potwierdzenia)');
  ov._missionConfig = null;
  // dawny katalog Atlasu (nieprzezroczysta strona) usunięty; fakty ciała zostają (inspektor konsoli)
  ok(typeof FleetManagerOverlay.prototype._drawAtlasCatalog === 'undefined' && typeof FleetManagerOverlay.prototype._atlasBodyFacts === 'function',
    'A: FMO bez `_drawAtlasCatalog` (świadek: `_atlasBodyFacts` jest)');
  for (const k of ['cmdPages.atlas.reasonReportUnexplored', 'cmdPages.atlas.actTarget', 'cmdPages.atlas.actShow', 'cmdPages.atlas.actReport', 'cmdPages.atlas.selectHint']) usedKeys.add(k);
});
await safe('A logic', () => {
  ok(typeof PG.orreryLayout === 'function' && typeof PG.atlasRows === 'function', 'A logic: funkcje istnieją');
  const rows = PG.atlasRows([{ body: { id: 'a', name: 'A', type: 'planet' }, explored: true }, { body: { id: 'b', name: 'Tajna', type: 'moon' }, explored: false, isMoon: true }]);
  ok(rows[1].name === null, 'A logic: niezbadane bez nazwy');
  ok(PG.atlasSelection('zz', rows) === null && PG.atlasSelection('a', rows) === 'a', 'A logic: wybór spoza listy → brak');
  const L = PG.orreryLayout([{ id: 'p', x: 100, y: 0 }, { id: 'q', x: 0, y: -400 }], { x: 0, y: 0, w: 400, h: 400 });
  const p = L.bodies.get('p'), q = L.bodies.get('q');
  ok(q.orbitR > p.orbitR && Math.abs(q.orbitR - L.R) < 1e-6, 'A logic: najdalsze ciało na skraju, bliższe wewnątrz');
  ok(p.orbitR > L.R * 0.4, 'A logic: skala √ — wewnętrzne ciało nie przy gwieździe');
});

// ═══ L — Logistyka ════════════════════════════════════════════════════════════════════════════════════════════════
header('L  Logistyka: akcje == zamrożone w każdym stanie; pole ilości z `consoleZones`; wąskie gardło');
const { ALL_RESOURCES } = await import('../../data/ResourcesData.js');
const { COMMODITIES } = await import('../../data/CommoditiesData.js');
// reguła katalogu drop-downu (niezależna od widoku): fizyczne surowce (bez research / energy) + wszystkie towary
const CATALOG = [...Object.keys(ALL_RESOURCES).filter((id) => id !== 'research' && id !== 'energy'), ...Object.keys(COMMODITIES)].sort();
const LTYPES = (z) => z.type.startsWith('logi_');
const lkey = (z) => `${z.type}|${z.data?.goodId ?? ''}|${z.data?.colonyId ?? ''}|${z.data?.which ?? ''}|${z.data?.orderId ?? ''}`;
function logiWorld(orders = [], pool = 2) {
  const col2 = { planetId: 'p_two', name: 'Wtora', isOutpost: false, systemId: 'sys_home', resourceSystem: { inventory: new Map([['Fe', 5]]) }, civSystem: { population: 2 } };
  const col3 = { planetId: 'p_far', name: 'Thuban b', isOutpost: false, systemId: 'sys_B', resourceSystem: { inventory: new Map() }, civSystem: { population: 1 } };
  const tos = { getPool: () => Array.from({ length: pool }, (_, i) => `v_p${i}`), getOrders: () => orders };
  world([ship(), ship({ id: 'v_h', name: 'Holownik', status: 'on_mission', position: { state: 'in_transit', x: 2 * AU, y: 0 } })], { tos, colonies: [col2, col3] });
}
const LSTATES = {
  empty:      { setup: () => {} },
  goods:      { setup: (ov) => { ov._logiTo = 'p_two'; ov._logiGoods = { Fe: 30, food: 10 }; } },
  same:       { setup: (ov) => { ov._logiTo = 'p_home'; ov._logiGoods = { Fe: 30 }; }, reason: 'cmdPages.logi.reasonSame' },
  no_goods:   { setup: (ov) => { ov._logiTo = 'p_two'; }, reason: 'cmdPages.logi.reasonNoGoods' },
  no_to:      { setup: (ov) => { ov._logiGoods = { Fe: 30 }; }, reason: 'cmdPages.logi.reasonNoTo' },
  col_dd:     { setup: (ov) => { ov._logiTo = 'p_two'; ov._logiColDropdown = 'from'; }, reason: 'cmdPages.logi.reasonOpposite' },
  good_dd:    { setup: (ov) => { ov._logiGoodDropdownOpen = true; } },
};
for (const [name, st] of Object.entries(LSTATES)) {
  await safe(`L ${name}`, () => {
    logiWorld();
    const mk = () => { const ov = new FleetManagerOverlay(); ov._logiGoods = {}; st.setup(ov); return ov; };
    const on = pageDraw('logistics', mk());
    const onK = on.zones.filter(LTYPES).map(lkey).sort();
    const isPick = (k) => k.startsWith('logi_good_pick|');
    const want = (EXPECT_L[name] ?? []).filter((k) => !isPick(k));
    ok(want.length > 0, `L ${name}: świadek — oczekiwane strefy logi_* (${want.length})`);
    ok(sameMulti(want, onK.filter((k) => !isPick(k))), `L ${name}: akcje == zamrożone\n      jest     : ${onK.filter((k) => !isPick(k)).join(' ; ')}\n      oczekiwane: ${want.join(' ; ')}`);
    const picks = onK.filter(isPick).map((k) => k.split('|')[1]).sort();
    if (name === 'good_dd') ok(picks.length > 30 && picks.join() === CATALOG.join(), `L good_dd: katalog drop-downu = reguła z danych (${picks.length} vs ${CATALOG.length})`);
    else ok(picks.length === 0, `L ${name}: bez otwartego drop-downu brak pozycji katalogu`);
    if (st.reason) ok(on.disabled.some((d) => d.reasonKey === st.reason), `L ${name}: niemożliwe = powód ${st.reason}`);
    for (const d of on.disabled) if (d.reasonKey) usedKeys.add(d.reasonKey);
  });
}
await safe('L orders', () => {
  const orders = [
    { id: 7, fromColonyId: 'p_home', toColonyId: 'p_two', goods: { Fe: 100 }, delivered: { Fe: 40 }, assignments: [{ vesselId: 'v_h', phase: 'hauling' }] },
    { id: 8, fromColonyId: 'p_home', toColonyId: 'p_far', goods: { food: 50 }, delivered: {}, assignments: [] },
  ];
  logiWorld(orders, 0);
  const ov = new FleetManagerOverlay();
  const r0 = pageDraw('logistics', ov);
  const sel = r0.zones.filter((z) => z.type === 'logiSelect');
  ok(sel.some((z) => z.data.orderId === 'new') && sel.some((z) => z.data.orderId === 7) && sel.some((z) => z.data.orderId === 8), 'L orders: lista = kreator + zlecenia');
  ok(sel.filter((z) => z.data.orderId === 7).length >= 2, 'L orders: zlecenie wybieralne na liście i na schemacie tras');
  const onZ = [];
  for (const id of [7, 8]) {
    ov._handleHit(sel.find((z) => z.data.orderId === id));
    ok(ov._logiSelectedOrderId === id, `L orders: wybór #${id}`);
    const r = pageDraw('logistics', ov);
    const cz = r.zones.filter((z) => z.type === 'logi_cancel').map(lkey);
    onZ.push(...cz);
    ok(sameMulti(EXPECT_L_ORDER[id], cz), `L orders #${id}: inspektor zlecenia — dokładnie jego anulowanie (${cz.join(';')})`);
    ok(!r.zones.some((z) => z.type === 'logi_create'), `L orders #${id}: inspektor zlecenia, nie kreator`);
    if (id === 8) ok(r.log.some((s) => s.includes(t('cmdPages.logi.alertNoPool'))), 'L orders #8: wąskie gardło (pusta pula) w roli alert');
    if (id === 7) ok(r.log.some((s) => s.includes('40 / 100')), 'L orders #7: postęp per towar');
  }
  ok(onZ.length === 2, `L orders: anulowanie osiągalne dla każdego zlecenia (${onZ.join(';')})`);
  const cancels = [];
  window.KOSMOS.transportOrderSystem.cancelOrder = (oid) => cancels.push(oid);
  ov._logiSelectedOrderId = 8;
  const r8 = pageDraw('logistics', ov);
  const z8 = r8.zones.find((z) => z.type === 'logi_cancel');
  if (z8) ov.handleClick(z8.x + z8.w / 2, z8.y + z8.h / 2);
  ok(cancels.join() === '8', `L orders: klik anulowania → transportOrderSystem.cancelOrder(8) (${cancels.join()})`);
  ov._logiSelectedOrderId = 7;
  usedKeys.add('cmdPages.logi.alertNoPool'); usedKeys.add('cmdPages.logi.alertQueued'); usedKeys.add('cmdPages.logi.alertWaiting');
  // zniknięte zlecenie → kreator
  ov._logiSelectedOrderId = 99;
  pageDraw('logistics', ov);
  ok(ov._logiSelectedOrderId === 'new', 'L orders: zniknięte zlecenie → kreator');
});
await safe('L qty', () => {
  const origCreate = document.createElement;
  for (const [cw, ch] of [[1600, 1041], [1280, 833]]) {
    logiWorld();
    const iw = window.innerWidth, ih = window.innerHeight;
    window.innerWidth = cw; window.innerHeight = ch;
    const vp = CLL.uiViewport(cw, ch);
    const ov = new FleetManagerOverlay();
    ov._logiTo = 'p_two'; ov._logiGoods = { Fe: 30 };
    const r = pageDraw('logistics', ov, { W: vp.W, H: vp.H });
    const z = r.zones.find((q) => q.type === 'logi_good_qty_input');
    const ins = ov.consoleZones?.inspector;
    const within = z && ins && z.x >= ins.x - 0.5 && z.y >= ins.y - 0.5 && z.x + z.w <= ins.x + ins.w + 0.5 && z.y + z.h <= ins.y + ins.h + 0.5;
    ok(within, `L qty ${cw}×${ch}: pole ilości w strefie inspektora konsoli`);
    window.innerWidth = 333; window.innerHeight = 222;   // handler nie może czytać okna
    document.createElement = (tag) => { const el = origCreate(tag); el.style = {}; el.focus = () => {}; el.select = () => {}; return el; };
    if (z) withFeat({ consoleKit: true }, () => ov._handleHit(z));
    const inp = ov._logiQtyInput;
    document.createElement = origCreate;
    window.innerWidth = iw; window.innerHeight = ih;
    const px = (v) => `${Math.round(v * vp.scale)}px`;
    const good = inp && z && inp.style.left === px(z.x) && inp.style.top === px(z.y) && inp.style.width === px(z.w) && inp.style.height === px(z.h);
    ok(good, `L qty ${cw}×${ch}: <input> = strefa × skala ${vp.scale.toFixed(3)} (${inp?.style?.left},${inp?.style?.top} ${inp?.style?.width}×${inp?.style?.height})`);
    ov._closeLogiQtyInput?.();
  }
  // źródło: gałąź konsoli `_openLogiQtyInput` bez `window.inner*`
  const src = fs.readFileSync(fileURLToPath(new URL('../../ui/FleetManagerOverlay.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');   // bez komentarzy (pin czyta kod, nie opis)
  const m = src.match(/_openLogiQtyInput\(goodId, canvasX, canvasY, kitBox = null\) \{([\s\S]*?)\n    \} else \{/);
  ok(!!m, 'L qty: świadek — gałąź konsoli w `_openLogiQtyInput`');
  ok(m && !/window\.inner/.test(m[1]), 'L qty: gałąź konsoli bez window.inner*');
});
await safe('L logic', () => {
  ok(PG.logiSelection(null, []) === 'new' && PG.logiSelection(5, [{ id: 5 }]) === 5, 'L logic: wybór');
  ok(PG.orderAlert({ assigns: [] }, 0)?.key === 'cmdPages.logi.alertNoPool', 'L logic: pusta pula');
  ok(PG.orderAlert({ assigns: [] }, 3)?.key === 'cmdPages.logi.alertQueued', 'L logic: kolejka');
  ok(PG.orderAlert({ assigns: [{ phase: 'waiting' }] }, 3)?.key === 'cmdPages.logi.alertWaiting', 'L logic: czeka na ładunek');
  ok(PG.orderAlert({ assigns: [{ phase: 'hauling' }] }, 3) === null, 'L logic: płynie = brak alertu');
  const p = PG.orderProgress({ goods: [{ total: 100, done: 40 }, { total: 50, done: 60 }] });
  ok(p.done === 90 && p.total === 150, 'L logic: postęp (nadwyżka przycięta)');
});

// ═══ N — Jednostki (Naziemne) ════════════════════════════════════════════════════════════════════════════════════
header('N  Jednostki: akcje == zamrożone (kafle, rekrutacja); kolonia strony lokalna; rekrutacja celuje w nią; inne hosty bez zmian');
const GP = await imp('../../ui/GroundUnitPanel.js');
function groundWorld({ barracksLv = 1, freePops = 5, units = [] } = {}) {
  const col2 = { planetId: 'p_two', name: 'Wtora', isOutpost: false, systemId: 'sys_home', groundUnitQueues: [],
    resourceSystem: { inventory: new Map(), canAfford: () => true }, civSystem: { freePops: 5, population: 3 }, credits: 999 };
  world([ship()], { colonies: [col2] });
  const K = window.KOSMOS;
  const home = K.colonyManager.getColony('p_home');
  Object.assign(home, { groundUnitQueues: [], credits: 999 });
  home.civSystem.freePops = freePops;
  const calls = [];
  Object.assign(K.colonyManager, {
    _getBarracksLevel: () => barracksLv, _getBarracksSlots: () => 2, _canRecruitMoreUnits: () => true, _getMaxGroundUnits: () => 6,
    startGroundUnitBuild: (pid, arch) => { calls.push({ pid, arch }); return { ok: true }; },
  });
  K.groundUnitManager = { getUnitsOnPlanet: (pid) => units.filter((u) => u.planetId === pid) };
  const editor = { _hitZones: [], _hoverZone: null, _mouseX: 0, _mouseY: 0,
    _addHit(x, y, w, h, type, data) { this._hitZones.push({ x, y, w, h, type, data }); },
    _onHit(zone) { this._groundPanel.onHit(zone.type.replace(/^ground:/, ''), zone.data ?? {}); } };
  editor._groundPanel = new GP.GroundUnitPanel({ addHit: (x, y, w, h, type, data) => editor._addHit(x, y, w, h, `ground:${type}`, data),
    getHoverZone: () => editor._hoverZone, getMouse: () => ({ x: 0, y: 0 }) });
  K.overlayManager = { overlays: { unit_design: editor } };
  return { calls, editor, home, col2 };
}
const GTYPES = new Set(['ground:select_tile', 'ground:recruit']);
const gkey = (z) => `${z.type}|${z.data?.archetypeId ?? ''}`;
for (const [name, opt] of [['open', {}], ['no_barracks', { barracksLv: 0 }], ['no_pop', { freePops: 0 }]]) {
  await safe(`N ${name}`, () => {
    ok(typeof GP.GroundUnitPanel === 'function', 'N: GroundUnitPanel importuje się pod node (pin wykonaniem)');
    groundWorld(opt);
    const ovOn = new FleetManagerOverlay();
    const on = pageDraw('ground', ovOn);
    const onK = on.zones.filter((z) => GTYPES.has(z.type)).map(gkey).sort();
    const want = EXPECT_N[name] ?? [];
    ok(want.filter((k) => k.startsWith('ground:select_tile')).length >= 6, `N ${name}: świadek — oczekiwane kafle archetypów (${want.length})`);
    ok(sameMulti(want, onK), `N ${name}: akcje == zamrożone\n      jest     : ${onK.join(' ; ')}\n      oczekiwane: ${want.join(' ; ')}`);
    if (name !== 'open') {
      ok(!onK.some((k) => k.startsWith('ground:recruit')), `N ${name}: rekrutacja niemożliwa — bez strefy`);
      const rk = on.disabled.map((d) => d.reasonKey).filter(Boolean);
      ok(rk.includes(name === 'no_barracks' ? 'cmdPages.ground.reasonBarracks' : 'cmdPages.ground.reasonCost'), `N ${name}: powód (${rk.join(',')})`);
      for (const k of rk) usedKeys.add(k);
    }
  });
}
await safe('N colony', () => {
  const units = [{ id: 'gu_1', planetId: 'p_two', owner: 'player', archetypeId: 'shock_infantry', currentHP: 9, hpMax: 15, status: 'idle', org: 8, maxOrg: 10, morale: 12, maxMorale: 15 },
    { id: 'gu_x', planetId: 'p_two', owner: 'emp_ai', archetypeId: 'garrison_unit', currentHP: 9, hpMax: 9, status: 'idle' }];
  const { calls } = groundWorld({ units });
  const ov = new FleetManagerOverlay();
  const r0 = pageDraw('ground', ov);
  const cz = r0.zones.filter((z) => z.type === 'groundColony');
  ok(cz.length === 2, `N colony: lista kolonii gracza (${cz.length})`);
  ok(ov._groundColonyId === 'p_home', 'N colony: domyślnie kolonia aktywna');
  ov._handleHit(cz.find((z) => z.data.colonyId === 'p_two'));
  const r1 = pageDraw('ground', ov);
  ok(ov._groundColonyId === 'p_two' && window.KOSMOS.colonyManager.activePlanetId === 'p_home', 'N colony: wybór zmienia kolonię strony, globalna aktywna nietknięta');
  const uz = r1.zones.filter((z) => z.type === 'groundUnit');
  ok(uz.length === 1 && uz[0].data.unitId === 'gu_1', `N colony: tabela = jednostki gracza tej kolonii (bez obcych) (${uz.length})`);
  ov._handleHit(uz[0]);
  const r2 = pageDraw('ground', ov);
  ok(ov._groundSelUnitId === 'gu_1' && r2.log.some((s) => s.toUpperCase().includes(t('cmdPages.ground.state').toUpperCase())), 'N colony: wybór jednostki → inspektor jednostki (stan)');
  // kafel archetypu zdejmuje wybór jednostki; rekrutacja celuje w kolonię strony
  withFeat({ consoleKit: true }, () => ov._handleHit(r2.zones.find((z) => z.type === 'ground:select_tile' && z.data.archetypeId === 'shock_infantry')));
  ok(ov._groundSelUnitId === null, 'N colony: kafel archetypu → inspektor archetypu');
  const r3 = pageDraw('ground', ov);
  const rec = r3.zones.find((z) => z.type === 'ground:recruit');
  ok(!!rec, 'N colony: świadek — strefa rekrutacji');
  withFeat({ consoleKit: true }, () => ov._handleHit(rec));
  ok(calls.length === 1 && calls[0].pid === 'p_two', `N colony: rekrutacja w kolonii strony (${JSON.stringify(calls)})`);
  const panel = window.KOSMOS.overlayManager.overlays.unit_design._groundPanel;
  ok(panel._getColonyDep()?.planetId === 'p_home', 'N colony: źródło kolonii panelu przywrócone po klik (inne hosty bez zmian)');
});
await safe('N hosts', () => {
  // inne hosty panelu: rysunek UnitDesignOverlay-podobny (globalna kolonia) i ColonyOverlay-podobny (wstrzyknięta) — identyczny
  // dziennik i strefy przy consoleKit true i false (stan konsoli nie przecieka do panelu); plik panelu bez śladu K7-C.
  const run = (flag, inject) => withFeat({ consoleKit: flag }, () => {
    const { editor, col2 } = groundWorld();
    const p = inject ? new GP.GroundUnitPanel({ addHit: (x, y, w, h, type, data) => editor._addHit(x, y, w, h, `ground:${type}`, data), getColony: () => col2 }) : editor._groundPanel;
    editor._hitZones = [];
    const ctx = mockCtx();
    p.draw(ctx, 100, 100, 560, 700);
    return JSON.stringify([ctx.log, editor._hitZones.map((z) => [z.type, z.x, z.y, z.w, z.h, z.data])]);
  });
  for (const inject of [false, true]) {
    const a = run(true, inject), b = run(false, inject);
    ok(a.length > 200, `N hosts ${inject ? 'kolonia' : 'edytor'}: świadek — panel rysuje (${a.length} zn.)`);
    ok(a === b, `N hosts ${inject ? 'kolonia' : 'edytor'}: dziennik + strefy identyczne przy consoleKit true / false`);
  }
  const src = fs.readFileSync(fileURLToPath(new URL('../../ui/GroundUnitPanel.js', import.meta.url)), 'utf8');
  ok(!/K7-C|consoleCommand|isKitScreen/.test(src), 'N hosts: GroundUnitPanel nie zna konsoli');
});
await safe('N chips', () => {
  // czipy nagłówka zachowują stan każdej strony przy obiegu po wszystkich zakładkach
  groundWorld();
  const ov = new FleetManagerOverlay();
  ov._atlasSelectedBodyId = 'p_two'; ov._logiSelectedOrderId = 'new'; ov._groundColonyId = 'p_two';
  ov._registryFilter.search = 'frach';
  for (const tab of ['atlas', 'logistics', 'ground', 'tactical', 'atlas']) {
    const r = pageDraw(tab, ov);
    const tz = r.zones.filter((z) => z.type === 'tab').map((z) => z.data.tab);
    ok(['tactical', 'ground', 'atlas', 'logistics'].every((x) => tz.includes(x)), `N chips ${tab}: 4 czipy zakładek`);
    ok(!!ov.consoleZones?.frame && !!ov.consoleZones?.inspector, `N chips ${tab}: strona w ramie konsoli (strefy konsoli)`);
  }
  ok(ov._atlasSelectedBodyId === 'p_two' && ov._groundColonyId === 'p_two' && ov._registryFilter.search === 'frach', 'N chips: stan stron zachowany po obiegu');
});

// ═══ P — zmiany właściciela po bramce K7-C ═══════════════════════════════════════════════════════════════════════
header('P  po bramce: wszystkie złoża ciała; miniatury modeli jednostek; 753 bez surowych id; 751 kotwica okien');
await safe('P deposits', () => {
  const RES = ['Fe', 'Cu', 'Si', 'Ti', 'C', 'W'];
  const rich = { id: 'p_rich', type: 'planet', name: 'Bogata', x: 5 * AU, y: 0, systemId: 'sys_home', orbital: { a: 5, e: 0, T: 9, M: 0 }, explored: true, planetType: 'rocky',
    deposits: RES.map((r, i) => ({ resourceId: r, richness: 0.9 - i * 0.12, remaining: 1000 + i })).concat([{ resourceId: 'Pt', richness: 0.5, remaining: 0 }]) };
  world([ship()], { bodies: [rich] });
  const ov = new FleetManagerOverlay();
  ov._atlasSelectedBodyId = 'p_rich';
  const on = pageDraw('atlas', ov);
  const names = RES.map((r) => ov._atlasBodyFacts(EntityManager.get('p_rich')).deposits.find((d) => d.id === r)?.name ?? r);
  ok(ov._atlasBodyFacts(EntityManager.get('p_rich')).deposits.length >= RES.length, 'P deposits: świadek — fakty ciała mają wszystkie złoża');
  ok(names.every((n) => on.log.some((s) => s === n)), `P deposits: inspektor wypisuje wszystkie ${RES.length} złoża (${names.join(', ')})`);
  ok(!on.log.some((s) => s === (ov._atlasBodyFacts(EntityManager.get('p_rich')).deposits.find((d) => d.id === 'Pt')?.name ?? '§')), 'P deposits: wyczerpane złoże pominięte (jak dziś)');
  ov._atlasSelectedBodyId = 'm_one';
  const fog = pageDraw('atlas', ov);
  ok(!fog.log.some((s) => /★/.test(s)), 'P deposits: niezbadane ciało — złoża ukryte (mgła)');
});
await safe('P atlas scroll', () => {
  // kółko na Atlasie konsoli: nad inspektorem ciała przewija inspektor (pełna lista złóż), nad listą — listę; gałęzie rozłączne
  world([ship()]);
  const ov = new FleetManagerOverlay();
  ov._atlasSelectedBodyId = 'p_home';
  pageDraw('atlas', ov);
  const ins = ov._atlasKitRects?.insp, lst = ov._contentBounds;
  ok(!!ins && !!lst, 'P atlas scroll: świadek — prostokąty inspektora i listy z rysunku');
  ov._atlasInspContentH = 5000; ov._atlasInspViewH = 200; ov._atlasInspScrollY = 0;
  ov._atlasContentH = 5000; ov._atlasVisibleH = 200; ov._atlasScrollY = 0;
  if (ins) withFeat({ consoleKit: true }, () => ov.handleScroll(60, ins.x + ins.w / 2, ins.y + ins.h / 2));
  ok(ov._atlasInspScrollY > 0 && ov._atlasScrollY === 0, `P atlas scroll: kółko nad inspektorem przewija inspektor (${ov._atlasInspScrollY}), nie listę (${ov._atlasScrollY})`);
  const y0 = ov._atlasInspScrollY;
  if (lst) withFeat({ consoleKit: true }, () => ov.handleScroll(60, lst.x + 4, lst.y + 4));
  ok(ov._atlasScrollY > 0 && ov._atlasInspScrollY === y0, `P atlas scroll: kółko nad listą przewija listę (${ov._atlasScrollY}), nie inspektor`);
});
await safe('P art', () => {
  const { editor } = groundWorld({ units: [{ id: 'gu_1', planetId: 'p_home', owner: 'player', archetypeId: 'shock_infantry', currentHP: 15, hpMax: 15, status: 'idle' }] });
  const ready = new Set(['shock_infantry', 'rocket_artillery']);
  const imgs = {};
  editor._groundPanel._ensureSprite = (id) => (imgs[id] ??= { id, complete: true, _kosmosAsset: ready.has(id) ? 'glb' : id === 'aa_platform' ? 'loading' : 'missing' });
  const ov = new FleetManagerOverlay();
  const r = withFeat({ consoleKit: true }, () => {
    ov._visible = true; ov._activeTab = 'ground';
    const ctx = mockCtx(); const drawn = [];
    ctx.drawImage = (img) => { drawn.push(img?.id ?? '?'); };
    ov.draw(ctx, 1600, 1041);
    return { drawn, log: ctx.log };
  });
  ok(r.drawn.includes('shock_infantry') && r.drawn.includes('rocket_artillery'), `P art: miniatura modelu użyta, gdy jest (${[...new Set(r.drawn)].join(',')})`);
  ok(r.drawn.filter((x) => x === 'shock_infantry').length >= 2, 'P art: ta sama miniatura w kaflu i w tabeli jednostek');
  ok(!r.drawn.includes('garrison_unit') && !r.drawn.includes('aa_platform'), 'P art: brak zasobu / wczytywanie → bez obrazu');
  const IC = UA.ARCHETYPE_ICONS ?? {};
  ok(r.log.includes(IC.garrison_unit) && !r.log.includes(IC.shock_infantry), 'P art: glif tylko tam, gdzie zasobu brak');
});
await safe('P 753', () => {
  // wszystkie hosty panelu (edytor = kolonia globalna, kolonia wstrzyknięta): żaden kafel, tytuł ani podpowiedź nie pokazuje surowego id archetypu
  const ids = Object.keys(UA.UNIT_ARCHETYPES ?? {});
  const rawId = new RegExp(`\\b(${ids.join('|')})\\b`, 'i');   // także WIELKIMI literami (dzisiejszy tytuł)
  const raw = { test: (q) => rawId.test(q) || /\bGROUND\b/.test(q) };   // ucięty skrót „GROUND” z surowego id
  for (const inject of [false, true]) {
    const { editor, col2 } = groundWorld();
    const p = inject ? new GP.GroundUnitPanel({ addHit: (x, y, w, h, type, data) => editor._addHit(x, y, w, h, `ground:${type}`, data), getColony: () => col2,
      getHoverZone: () => editor._hoverZone }) : editor._groundPanel;
    const seen = [];
    for (const id of ids) {
      p._selectedArchetypeId = id;
      editor._hitZones = [];
      editor._hoverZone = { type: 'ground:select_tile', data: { archetypeId: id } };
      const ctx = mockCtx();
      p.draw(ctx, 100, 100, 560, 900);
      seen.push(...ctx.log.filter((s) => raw.test(s)));
    }
    ok(ids.includes('ground_supply_unit'), 'P 753: świadek — katalog ma zaopatrzenie');
    ok(seen.length === 0, `P 753 ${inject ? 'kolonia' : 'edytor'}: brak surowych id archetypów (${[...new Set(seen)].slice(0, 4).join(' | ')})`);
  }
});
await safe('P 754', () => {
  // każdy archetyp katalogu rozwiązuje się do ISTNIEJĄCEGO GLB (ta sama zamiana rozszerzenia co `GroundUnitFactory.loadUnitSprite`);
  // archetypy z trybem rozłożenia — także warianty mapy kolonii (`ColonyOverlay._deriveVariantPath`)
  const HU = HUM.HUMANITY_UNITS ?? {};
  const ids = Object.keys(UA.UNIT_ARCHETYPES ?? {});
  const glb = (p) => String(p).replace(/\.(png|jpg|jpeg|webp)$/i, '.glb');
  const onDisk = (p) => fs.existsSync(fileURLToPath(new URL(`../../../${p}`, import.meta.url)));
  ok(ids.length >= 7, `P 754: świadek — katalog archetypów (${ids.length})`);
  for (const id of ids) {
    const def = HU[id];
    const path = def?.catalogSprite ?? def?.sprite;
    ok(!!path && onDisk(glb(path)), `P 754 ${id}: model katalogu istnieje (${path ? glb(path) : 'brak wpisu'})`);
    if (UA.UNIT_ARCHETYPES[id]?.supportsDeploy && def?.sprite) {
      for (const v of ['mobile', 'deployed']) {
        const vp = glb(def.sprite.replace(/(\.[a-z]+)$/i, `_${v}$1`));
        ok(onDisk(vp), `P 754 ${id}: wariant mapy kolonii ${v} istnieje (${vp})`);
      }
    }
  }
});
const gUnits = (n) => Array.from({ length: n }, (_, i) => ({ id: `gu_${i}`, planetId: 'p_home', owner: 'player', archetypeId: 'shock_infantry', currentHP: 15, hpMax: 15, status: 'idle' }));
const ovl = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
await safe('P grid', () => {
  // K7-C-ground (uwaga właściciela): rząd kafli w rozmiarze sprzed „≈2×” zakotwiczony u dołu bohatera, tabela jednostek nad nim
  // z własnym przewijaniem — obie części rozłączne przy 1600×1041 i 1280×833, przy 0, 1 i wielu jednostkach
  for (const [cw, ch] of [[1600, 1041], [1280, 833]]) {
    for (const n of [0, 1, 25]) {
      groundWorld({ units: gUnits(n) });
      const vp = CLL.uiViewport(cw, ch);
      const ov = new FleetManagerOverlay();
      const r = pageDraw('ground', ov, { W: vp.W, H: vp.H });
      const hero = ov.consoleZones.hero, K = ov._groundKitRects ?? {};
      const TB = K.tableBody ?? hero;   // brak prostokąta (baza) → pin degraduje, nie przerywa
      const tag = `P grid ${cw}×${ch} n=${n}`;
      const tiles = r.zones.filter((z) => z.type === 'ground:select_tile');
      const rows = r.zones.filter((z) => z.type === 'groundUnit');
      const inHero = (z) => z.x >= hero.x - 0.5 && z.y >= hero.y - 0.5 && z.x + z.w <= hero.x + hero.w + 0.5 && z.y + z.h <= hero.y + hero.h + 0.5;
      ok(tiles.length === Object.keys(UA.UNIT_ARCHETYPES).length && !!K.table && !!K.hero, `${tag}: świadek — ${tiles.length} kafli, prostokąt tabeli`);
      ok(n === 0 ? rows.length === 0 : rows.length >= 1, `${tag}: świadek — ${rows.length} wierszy ze strefą`);
      ok(tiles.every(inHero) && rows.every(inHero), `${tag}: kafle i wiersze w strefie bohatera`);
      ok(!tiles.some((a, i) => tiles.some((b, j) => i < j && ovl(a, b))), `${tag}: kafle się nie nakładają`);
      ok(!tiles.some((a) => rows.some((b) => ovl(a, b))), `${tag}: strefy kafli i wierszy się nie nakładają`);
      ok(!!K.table && tiles.every((z) => !ovl(z, K.table)) && K.table.y + K.table.h <= K.tilesTop + 0.5, `${tag}: obszar tabeli i rząd kafli (z etykietą) rozłączne`);
      ok(rows.every((z) => z.y >= TB.y - 0.5 && z.y + z.h <= TB.y + TB.h + 0.5), `${tag}: strefy wierszy tylko w obszarze przewijania tabeli`);
      ok(!!K.table && K.table.h >= PG.GROUND_HERO.HEAD_H + PG.GROUND_HERO.ROW_H, `${tag}: tabela mieści nagłówek + co najmniej wiersz (${K.table?.h})`);
      const bottom = Math.max(...tiles.map((z) => z.y + z.h));
      const hb = K.hero ? K.hero.y + K.hero.h : NaN;
      ok(new Set(tiles.map((z) => z.y)).size === 1 && Math.abs(hb - bottom) <= 4.5, `${tag}: jeden rząd kafli zakotwiczony u dołu bohatera (dół ${bottom} vs ${hb})`);
      // rozmiar sprzed „≈2×”: blok rekrutacji 112 px, kafel 86 px wys., miniatura ≈52 px (nie ≈96)
      const th = Math.min(...tiles.map((z) => z.h)), tw = Math.min(...tiles.map((z) => z.w));
      ok(th === (PG.GROUND_HERO?.TILES_H ?? 112) - 26 && th < 96 && Math.min(tw - 8, th - 34) >= 40, `${tag}: kafel w dawnym rozmiarze (${tw}×${th}, miniatura ${Math.min(tw - 8, th - 34)} px)`);
    }
  }
});
await safe('P scroll', () => {
  // przewijanie tabeli jednostek kółkiem: każda jednostka osiągalna, strefy tylko dla widocznych wierszy, wybór i kafel działają po przewinięciu
  for (const [cw, ch] of [[1600, 1041], [1280, 833]]) {
    const N = 25, tag = `P scroll ${cw}×${ch}`;
    groundWorld({ units: gUnits(N) });
    const vp = CLL.uiViewport(cw, ch);
    const ov = new FleetManagerOverlay();
    let r = pageDraw('ground', ov, { W: vp.W, H: vp.H });
    const K = ov._groundKitRects ?? {};
    const TB = K.tableBody ?? { x: ov.consoleZones.hero.x, y: ov.consoleZones.hero.y + 40, w: ov.consoleZones.hero.w, h: ov.consoleZones.hero.h - 40 };
    const vis0 = r.zones.filter((z) => z.type === 'groundUnit');
    ok(vis0.length > 0 && vis0.length < N, `${tag}: świadek — widać ${vis0.length} z ${N} (tabela wymaga przewijania)`);
    ok(vis0[0]?.data.unitId === 'gu_0', `${tag}: bez przewinięcia od pierwszej jednostki`);
    ok(r.log.length > 0 && (ov._groundUnitScrollY ?? 0) === 0, `${tag}: start przewinięcia 0`);
    const seen = new Set(vis0.map((z) => z.data.unitId));
    const mx = TB.x + 20, my = TB.y + 10;
    let guard = 0, prev = -1;
    while (guard++ < 200 && ov._groundUnitScrollY !== prev) {
      prev = ov._groundUnitScrollY;
      withFeat({ consoleKit: true }, () => ov.handleScroll(60, mx, my));
      r = pageDraw('ground', ov, { W: vp.W, H: vp.H });
      const rz = r.zones.filter((z) => z.type === 'groundUnit');
      rz.forEach((z) => seen.add(z.data.unitId));
      if (!rz.every((z) => z.y >= TB.y - 0.5 && z.y + z.h <= TB.y + TB.h + 0.5)) { ok(false, `${tag}: strefa poza pasem widoku przy przewinięciu ${ov._groundUnitScrollY}`); break; }
      if (rz.length > vis0.length + 1) { ok(false, `${tag}: więcej stref (${rz.length}) niż widocznych wierszy`); break; }
    }
    ok((ov._groundUnitScrollY ?? 0) > 0, `${tag}: kółko nad tabelą przewija (${ov._groundUnitScrollY})`);
    ok(seen.size === N, `${tag}: każda jednostka osiągalna przewijaniem (${seen.size}/${N})`);
    const last = r.zones.filter((z) => z.type === 'groundUnit');
    ok(last.some((z) => z.data.unitId === `gu_${N - 1}`) && !last.some((z) => z.data.unitId === 'gu_0'), `${tag}: na dole listy ostatnia widoczna, pierwszej brak`);
    // przewinięcie trzymane w klamrze: po dojściu do dołu i nadmiarze kółka jeden ruch w górę od razu odsłania wcześniejszy wiersz
    for (let k = 0; k < 20; k++) withFeat({ consoleKit: true }, () => ov.handleScroll(60, mx, my));
    pageDraw('ground', ov, { W: vp.W, H: vp.H });
    withFeat({ consoleKit: true }, () => ov.handleScroll(-60, mx, my));
    const up = pageDraw('ground', ov, { W: vp.W, H: vp.H }).zones.filter((z) => z.type === 'groundUnit');
    ok(up.some((z) => !last.some((q) => q.data.unitId === z.data.unitId)), `${tag}: nadmiar kółka w dół nie „martwi” kółka w górę`);
    pageDraw('ground', ov, { W: vp.W, H: vp.H });
    for (let k = 0; k < 20; k++) withFeat({ consoleKit: true }, () => ov.handleScroll(60, mx, my));
    pageDraw('ground', ov, { W: vp.W, H: vp.H });
    // wybór jednostki z dołu listy po przewinięciu
    const bz = last.find((z) => z.data.unitId === `gu_${N - 1}`);
    if (bz) withFeat({ consoleKit: true }, () => ov._handleHit(bz));
    r = pageDraw('ground', ov, { W: vp.W, H: vp.H });
    ok(ov._groundSelUnitId === `gu_${N - 1}` && r.log.some((q) => q.toUpperCase().includes(t('cmdPages.ground.state').toUpperCase())), `${tag}: wybór ostatniej jednostki po przewinięciu → inspektor jednostki`);
    // kółko nad kaflami nie przewija tabeli; kafel klikalny przy przewiniętej tabeli
    const s0 = ov._groundUnitScrollY;
    const tz = r.zones.find((z) => z.type === 'ground:select_tile');
    withFeat({ consoleKit: true }, () => ov.handleScroll(-60, tz.x + 4, tz.y + 4));
    ok(ov._groundUnitScrollY === s0, `${tag}: kółko nad kaflami nie rusza tabeli`);
    withFeat({ consoleKit: true }, () => ov._handleHit(tz));
    ok(ov._groundSelUnitId === null, `${tag}: kafel po przewinięciu → inspektor archetypu`);
    // zmiana kolonii → tabela od góry
    const cz = r.zones.find((z) => z.type === 'groundColony' && z.data.colonyId === 'p_two');
    withFeat({ consoleKit: true }, () => ov._handleHit(cz));
    ok(!!cz && ov._groundUnitScrollY === 0, `${tag}: zmiana kolonii zeruje przewinięcie`);
  }
});
await safe('P scroll logic', () => {
  // logika: strefy wyłącznie w pasie widoku, reszta osiągalna (czysta geometria)
  const L = PG.groundHeroLayout({ x: 0, y: 0, w: 600, h: 400 }, { nArchs: 7, nUnits: 40, scroll: 9999 });
  ok(L.scroll === L.maxScroll && L.maxScroll === 40 * PG.GROUND_HERO.ROW_H - L.body.h, `P scroll logic: klamra przewinięcia (${L.scroll})`);
  ok(L.rows.length > 0 && L.rows.at(-1).i === 39 && L.rows.every((q) => !q.zone || (q.zone.y >= L.body.y && q.zone.y + q.zone.h <= L.body.y + L.body.h)), 'P scroll logic: strefy w pasie widoku, ostatni wiersz na dole');
  ok(L.tiles.every((z) => z.y >= L.table.y + L.table.h), 'P scroll logic: kafle pod tabelą');
  const maxVis = Math.ceil(L.body.h / PG.GROUND_HERO.ROW_H) + 1;
  ok(L.rows.length <= maxVis && L.rows.every((q) => q.y + PG.GROUND_HERO.ROW_H > L.body.y && q.y < L.body.y + L.body.h), `P scroll logic: tylko wiersze w pasie widoku (${L.rows.length} ≤ ${maxVis})`);
});
await safe('P names', () => {
  // K7-C-ground: nazwa domyślna archetypu (fabryka zapisuje angielskie `name` frakcji) → nazwa i18n; nazwa własna bez zmian;
  // etykieta zaopatrzenia w inspektorze przez i18n — w PL żadnej angielskiej nazwy domyślnej ani „SUPPLY”
  const I18N = globalThis.__i18nMod;
  const HU = HUM.HUMANITY_UNITS ?? {};
  const ids = Object.keys(UA.UNIT_ARCHETYPES ?? {}).filter((id) => HU[id]?.name && HU[id].namePL && HU[id].namePL !== HU[id].name);
  const units = ids.map((id, i) => ({ id: `gu_${i}`, planetId: 'p_home', owner: 'player', archetypeId: id, name: HU[id].name, currentHP: 10, hpMax: 10, status: 'idle',
    supply: 50, supplyCap: 100, org: 5, maxOrg: 10, morale: 7, maxMorale: 10 }));
  units.push({ id: 'gu_raw', planetId: 'p_home', owner: 'player', archetypeId: 'shock_infantry', name: 'shock_infantry', currentHP: 10, hpMax: 10, status: 'idle' });
  units.push({ id: 'gu_own', planetId: 'p_home', owner: 'player', archetypeId: 'shock_infantry', name: 'Krwawe Lisy', currentHP: 10, hpMax: 10, status: 'idle' });
  ok(ids.length >= 5 && ids.includes('ground_supply_unit'), `P names: świadek — ${ids.length} archetypów z angielską nazwą domyślną ≠ PL`);
  const prev = I18N.getLocale();
  try {
    for (const lang of ['pl', 'en']) {
      I18N.setLocale(lang);
      groundWorld({ units });
      const ov = new FleetManagerOverlay();
      const r0 = pageDraw('ground', ov);
      const tableText = r0.log.join('\n');
      const want = (id) => (lang === 'en' ? HU[id].nameEN : HU[id].namePL) ?? HU[id].name;
      ok(ids.every((id) => tableText.includes(want(id))), `P names ${lang}: tabela pokazuje nazwy i18n archetypów`);
      if (lang === 'pl') ok(!ids.some((id) => r0.log.some((q) => q.includes(HU[id].name))), `P names pl: żadnej angielskiej nazwy domyślnej (${ids.filter((id) => r0.log.some((q) => q.includes(HU[id].name))).join(',') || '—'})`);
      ok(r0.log.some((q) => q.includes('Krwawe Lisy')), `P names ${lang}: nazwa własna bez zmian`);
      ok(!r0.log.some((q) => q === 'shock_infantry' || q.startsWith('shock_infantry')), `P names ${lang}: surowe id jako nazwa → nazwa i18n`);
      const sup = units.find((u) => u.archetypeId === 'ground_supply_unit');
      withFeat({ consoleKit: true }, () => ov._handleHit(r0.zones.find((z) => z.type === 'groundUnit' && z.data.unitId === sup.id)));
      const r1 = pageDraw('ground', ov);
      ok(ov._groundSelUnitId === sup.id, `P names ${lang}: świadek — wybrana jednostka zaopatrzenia`);
      ok(r1.log.filter((q) => q.includes(want('ground_supply_unit'))).length >= 2, `P names ${lang}: inspektor — tytuł nazwą i18n`);
      ok(r1.log.some((q) => q.toUpperCase().includes(t('cmdPages.ground.supply').toUpperCase())), `P names ${lang}: etykieta zaopatrzenia z i18n`);
      if (lang === 'pl') ok(!r1.log.some((q) => /\bSUPPLY\b/.test(q) || q.includes(HU.ground_supply_unit.name)), 'P names pl: inspektor bez „SUPPLY” i angielskiej nazwy');
    }
  } finally { I18N.setLocale(prev); }
});
await safe('P 751', () => {
  world([ship()]);
  const ov = new FleetManagerOverlay();
  pageDraw('atlas', ov, { W: 1280, H: 833 });
  ov._uiScale = 1.25;
  const a = withFeat({ consoleKit: true }, () => ov._dialogAnchor('inspector', { anyTab: true, minWcss: 520 }));
  const fr = ov.consoleZones.frame;
  ok(!!a && a.width >= 520 && a.left + a.width <= Math.round((fr.x + fr.w) * 1.25) + 1, `P 751: raport ciała przy strefie inspektora Atlasu, w ramie (${JSON.stringify(a)})`);
  ok(withFeat({ consoleKit: true }, () => ov._dialogAnchor('inspector')) === null, 'P 751: bez `anyTab` poza rejestrem — jak w K7-B (null)');
  ok(JSON.stringify(withFeat({ consoleKit: false }, () => ov._dialogAnchor('inspector', { anyTab: true, minWcss: 520 }))) === JSON.stringify(a), 'P 751: consoleKit false → ta sama kotwica (bez warunku flagi)');
  const rd = (f) => fs.readFileSync(fileURLToPath(new URL(`../../ui/${f}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  ok(/applyModalAnchor\(overlay, panel, options\.anchor \?\? null\)/.test(rd('CargoLoadModal.js')), 'P 751: okno ładunku stosuje kotwicę');
  ok(/applyModalAnchor\(overlay, panel, anchor\)/.test(rd('BodyDetailModal.js')), 'P 751: raport ciała stosuje kotwicę');
  const fmo = rd('FleetManagerOverlay.js');
  ok((fmo.match(/showCargoLoadModal\([^;]*anchor: this\._dialogAnchor\('inspector'/g) ?? []).length === 3, 'P 751: 3 wywołania okna ładunku z kotwicą');
  ok(/showBodyDetailModal\(reportBody, \{ anchor: this\._dialogAnchor\('inspector', \{ anyTab: true/.test(fmo), 'P 751: raport z Atlasu z kotwicą');
});

// ═══ R — powody i etykiety (PL + EN, bez surowych id) ═══════════════════════════════════════════════════════════════
header('R  klucze powodów i etykiet w PL i EN');
await safe('R', () => {
  ok(usedKeys.size >= 8, `R: świadek — zebrano klucze (${usedKeys.size})`);
  for (const k of usedKeys) {
    ok(typeof PL[k] === 'string' && PL[k] !== k && PL[k].length > 0, `R PL ${k}`);
    ok(typeof EN[k] === 'string' && EN[k] !== k && EN[k].length > 0, `R EN ${k}`);
    ok(!/\b(p_|v_|sys_|col_)\w+/.test(PL[k] ?? '') && !/\b(p_|v_|sys_|col_)\w+/.test(EN[k] ?? ''), `R ${k}: bez surowych id`);
  }
});

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
