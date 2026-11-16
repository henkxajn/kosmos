// Keeper — ARC KONSOLE K1c-A: Stocznia na szablonie konsoli (`FEATURES.consoleShipyard`; CONSOLES_PLAN.md §1.2, Finding 723/726).
//
// Pinujemy LOGIKĘ i INWENTARZ AKCJI (wykonaniem na prawdziwych klasach — ShipyardOverlay i UnitDesignOverlay importują się pod node),
// bez pinów na stałe rysunku:
//   S1  delta podglądu = staty(z) − staty(bez) (`calcShipStats` / `calcShipCost`) na próbce kadłubów i modułów; broń / tarcze = surowe
//       damage / shieldHP modułu, BEZ agregacji
//   S2  etykiety ról: `roleStacks` przez `groupModulesByRole` (jedna na niepustą rolę, moduły zliczone, kolejność ról)
//   S3  reguła zablokowanego kadłuba bez zmian: 🛰 ⇔ !canBuildHullAt(id, 'ground'); wybór kadłuba dalej wolny (jak dziś)
//   S4  stan budowy szablonu = dzisiejsza reguła: macierz (tech × slot × surowce × kadłub) — strefa `build_template` ścieżki OFF
//       istnieje ⇔ [ BUDUJ ] konsoli ma strefę (dla wczytanego, niezmienionego szablonu)
//   S5  inwentarz akcji ON ⊇ OFF (każdy typ strefy dzisiejszej Stoczni jest osiągalny przy fladze ON) + handlery: klik w strefę ON
//       robi to samo co dziś (emit / colonyManager / vesselManager / edytor)
//   S6  OFF = dziś: flaga OFF → ścieżka bez stref konsoli; `isKitScreen` wymaga obu flag
//   S7  wspólny UnitDesignOverlay (klawisz U, Command) nietknięty: jego strefy niezależne od flagi
//   S8  Finding 726: każda kategoria pickera ma ikonę i klucz PL/EN; picker konsoli nie rysuje surowego slotType
//   S9  geometria ze stref konsoli: strefy w ramie, sekcje w swoich strefach; wejście bez window.inner*
//   S10 bramki S0/S1 = linia banera w nagłówku (te same reguły): brak budowy, projektant osiągalny
//   S11 etykiety na kotwicach (atrapa hologramu): jedna na niepustą rolę + lista modułów; role puste nie rysowane
//   S12 hologram: hide() zwalnia; UIManager rysuje klatki, gdy hologram Stoczni się animuje (pin źródła)
//   S13 przewijanie list (projekty, inspektor, pas): strefy przycięte do pasma (bez ghost-clicku)

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import fs from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { ShipyardOverlay } from '../../ui/ShipyardOverlay.js';
import { UnitDesignOverlay } from '../../ui/UnitDesignOverlay.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES, UTILITY_SLOT_TYPES, calcShipStats, calcShipCost } from '../../data/ShipModulesData.js';
import { canBuildHullAt } from '../../data/ShipBuildRules.js';
import { ANCHOR_ROLES } from '../../data/ShipAnchorsSchema.js';
import { isKitScreen } from '../../ui/ConsoleLayoutLogic.js';
import EventBus from '../../core/EventBus.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

const L = await import('../../ui/ShipyardConsoleLogic.js').catch(() => ({}));
const AOL = await import('../../ui/ShipAnchorOverlayLogic.js').catch(() => ({}));

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const F = GAME_CONFIG.FEATURES;
const FLAGS0 = { consoleKit: F.consoleKit, consoleShipyard: F.consoleShipyard, shipHologram: F.shipHologram };
const setFlag = (on) => { F.consoleKit = true; F.consoleShipyard = on; F.shipHologram = false; };

function mockCtx() {
  const texts = [], pos = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, textAlign: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    measureText: (s) => ({ width: String(s ?? '').length * 6 }),
    fillText: (s, x, y) => { texts.push(String(s)); pos.push({ s: String(s), x, y }); }, fillRect() {}, strokeRect() {}, rect() {}, arc() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, save() {}, restore() {}, clip() {}, setLineDash() {},
    getTransform: () => ({ a: 1 }),
    _texts: texts, _pos: pos,
  };
  return ctx;
}

const PID = 'p_home';
const spy = { emits: [], surge: [], cancel: [], deploy: [] };
/** Świat: kolonia ze stocznią `level`, magazyn `inv`, kolejki, zamówienia, rezerwa, szablony, edytor. */
function stubWorld({ level = 2, tech = true, inv = null, queues = null, pending = null, reserve = true, templates = null } = {}) {
  spy.emits = []; spy.surge = []; spy.cancel = []; spy.deploy = [];
  const active = new Map();
  if (level > 0) active.set('b1', { building: { id: 'shipyard' }, level });
  const richInv = inv ?? Object.fromEntries(['Fe', 'Ti', 'Cu', 'Si', 'C', 'Hv', 'Li', 'W', 'Pt', 'Xe', 'Nt',
    'structural_alloys', 'polymer_composites', 'electronics', 'power_cells', 'conductor_bundles', 'semiconductor_wafers',
    'reactor_core', 'quantum_cores', 'warp_cores', 'plasma_cores', 'nanotech_parts'].map((k) => [k, 99999]));
  const col = {
    planetId: PID, name: 'Dom', credits: 5000, civSystem: { freePops: 3 },
    buildingSystem: { _active: active },
    resourceSystem: { inventorySnapshot: () => richInv, inventory: richInv },
    shipQueues: queues ?? [{ shipId: 'hull_small', progress: 1, buildTime: 3, surgeCount: 0 }],
    pendingShipOrders: pending ?? [{ id: 'po1', shipId: 'hull_small', cost: { Fe: 1e9 } }],
  };
  const vessels = reserve ? [{ id: 'v_r', name: 'Rezerwa 1', shipId: 'hull_small', isWreck: false, colonyId: PID, homeColonyId: PID,
    serviceState: 'stored', position: { state: 'docked', dockedAt: PID }, modules: [] }] : [];
  const ed = new UnitDesignOverlay();
  globalThis.window.KOSMOS = {
    lang: 'pl', civMode: true,
    techSystem: { isResearched: () => tech },
    unitDesigns: templates ?? [{ id: 'tpl1', name: 'Zwiadowca', hullId: 'hull_small', modules: ['engine_chemical', 'cargo_small', null] }],
    colonyManager: {
      activePlanetId: PID, getColony: (id) => (id === PID ? col : null), getShipQueues: () => col.shipQueues,
      surgeShipBuild: (p, q) => spy.surge.push([p, q]), cancelPendingShip: (p, o) => spy.cancel.push([p, o]),
    },
    vesselManager: {
      getAllVessels: () => vessels, getVessel: (id) => vessels.find((v) => v.id === id) ?? null,
      getVesselUpkeepCredits: () => 30, fleetInArrears: () => false,
      deployVessel: (id) => { spy.deploy.push(id); return { ok: true }; },
    },
    overlayManager: { overlays: { unit_design: ed } },
  };
  return { col, ed };
}
EventBus.on('fleet:buildRequest', (p) => spy.emits.push(p));

const W = 1280, H = 833;
function drawSy(on, setup) {
  setFlag(on);
  const sy = new ShipyardOverlay(); sy.visible = true;
  setup?.(sy);
  const ctx = mockCtx();
  sy.draw(ctx, W, H);
  return { sy, ctx, types: new Set(sy._hitZones.map((z) => z.type)) };
}
/** Projektant w stanie «wczytany szablon tpl1 + otwarty picker utility». */
const loadTpl = (ed, idx = 0) => { ed._onHit({ type: 'edit_template', data: { index: idx } }); };

// ═══════════════════════════════════════════════════════════════════════════
console.log('S1 — delta podglądu = staty(z) − staty(bez)');
{
  const sample = [['hull_small', 1, 'cargo_large'], ['hull_small', 0, 'engine_ion'], ['hull_medium', 3, 'fuel_tank_large'],
    ['hull_frigate', 2, 'armor_heavy'], ['hull_destroyer', 3, 'warp_tank'], ['hull_cruiser', 4, 'habitat_pod'], ['hull_large', 5, 'troop_bay_m']];
  let nonzero = 0, ok = 0;
  for (const [hid, slot, mod] of sample) {
    const hull = HULLS[hid];
    const base = hull.slots.map((s) => (s.type === 'propulsion' ? 'engine_chemical' : 'cargo_small'));
    const d = L.designDelta?.({ hull, slotAssignments: base, slotIndex: slot, moduleId: mod, calcShipStats, calcShipCost, modules: SHIP_MODULES });
    const wo = [...base]; wo[slot] = null; const wi = [...base]; wi[slot] = mod;
    const sA = calcShipStats(hull, wo.filter(Boolean)), sB = calcShipStats(hull, wi.filter(Boolean));
    const good = !!d && ['speed', 'range', 'cargo', 'fuelCapacity', 'warpFuelCapacity', 'totalMass', 'hp', 'armor', 'colonistCapacity', 'troopCapacity']
      .every((k) => Math.abs((d.stats[k] ?? 0) - ((sB[k] ?? 0) - (sA[k] ?? 0))) < 1e-9);
    const cA = calcShipCost(hull, wo.filter(Boolean)).cost, cB = calcShipCost(hull, wi.filter(Boolean)).cost;
    const costOk = !!d && Object.keys({ ...cA, ...cB }).every((k) => Math.abs((d.cost[k] ?? 0) - ((cB[k] ?? 0) - (cA[k] ?? 0))) < 1e-9);
    if (good && costOk) ok++;
    if (d && Object.values(d.stats).some((v) => v !== 0)) nonzero++;
  }
  assert(ok === sample.length, `S1a: delta = staty(z) − staty(bez) i koszt(z) − koszt(bez) na ${sample.length} parach (${ok})`);
  assert(nonzero === sample.length, `S1b (świadek): każda para daje niezerową deltę (${nonzero}/${sample.length})`);
  const hull = HULLS.hull_frigate, base = ['engine_chemical', null, null, null];
  const dl = L.designDelta?.({ hull, slotAssignments: base, slotIndex: 1, moduleId: 'weapon_laser', calcShipStats, calcShipCost, modules: SHIP_MODULES });
  const ds = L.designDelta?.({ hull, slotAssignments: base, slotIndex: 1, moduleId: 'shield_phase', calcShipStats, calcShipCost, modules: SHIP_MODULES });
  assert(dl?.raw?.damage === SHIP_MODULES.weapon_laser.stats.damage && ds?.raw?.shieldHP === SHIP_MODULES.shield_phase.stats.shieldHP,
    'S1c: broń / tarcza = surowe damage / shieldHP modułu');
  assert(dl && !('damage' in dl.stats) && !('shieldHP' in dl.stats), 'S1d: bez agregacji broni / tarcz w delcie statków');
  // «bez» = aktywny slot pusty, nawet gdy coś w nim siedzi (podmiana)
  const dr = L.designDelta?.({ hull: HULLS.hull_small, slotAssignments: ['engine_chemical', 'cargo_large', null], slotIndex: 1, moduleId: 'cargo_small',
    calcShipStats, calcShipCost, modules: SHIP_MODULES });
  assert(dr?.stats?.cargo === SHIP_MODULES.cargo_small.stats.cargoAdd, `S1e: podmiana w zajętym slocie — «bez» liczone z pustym slotem (${dr?.stats?.cargo})`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S2 — etykiety ról przez groupModulesByRole');
{
  const mods = ['engine_ion', 'weapon_laser', 'weapon_laser', 'weapon_missile', 'weapon_laser', null, 'cargo_small', 'shield_basic', 'armor_standard'];
  const st = L.roleStacks?.(mods, SHIP_MODULES) ?? [];
  const w = st.find((s) => s.role === 'weapons');
  assert(w?.items?.length === 2 && w.items[0].id === 'weapon_laser' && w.items[0].count === 3 && w.items[1].count === 1,
    'S2a: UZBROJENIE · Laser ×3, Rakiety ×1 (zliczone, kolejność montażu)');
  assert(st.map((s) => s.role).join() === ['drive', 'weapons', 'defence', 'hold'].join(), `S2b: tylko role niepuste, kolejność ANCHOR_ROLES (${st.map((s) => s.role)})`);
  assert(st.find((s) => s.role === 'defence')?.items.length === 2, 'S2c: tarcza i pancerz w jednej roli obrony');
  const total = st.reduce((a, s) => a + s.items.reduce((b, i) => b + i.count, 0), 0);
  assert(total === mods.filter(Boolean).length, `S2d: suma liczników = liczba modułów (${total})`);
  assert((L.roleStacks?.([], SHIP_MODULES) ?? [1]).length === 0, 'S2e: pusty projekt → brak etykiet');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S3 — zablokowany kadłub: reguła canBuildHullAt bez zmian');
{
  const rows = L.hullPickerRows?.({ hulls: HULLS, getSlotCounts: (id) => ({ propulsion: HULLS[id].slots.filter((s) => s.type === 'propulsion').length,
    utility: HULLS[id].slots.filter((s) => s.type !== 'propulsion').length }), canBuildHullAt, techResearched: () => true }) ?? [];
  assert(rows.length === Object.keys(HULLS).length && rows.length === 6, `S3a: 6 kadłubów na liście (${rows.length})`);
  assert(rows.every((r) => r.orbitalOnly === !canBuildHullAt(r.id, 'ground')), 'S3b: 🛰 ⇔ !canBuildHullAt(id, ground)');
  assert(rows.some((r) => r.orbitalOnly) && rows.some((r) => !r.orbitalOnly), 'S3c (świadek): oba stany obecne (mały naziemny, reszta 🛰)');
  assert(rows.find((r) => r.id === 'hull_small')?.slots === '1P+2U', 'S3d: układ slotów «1P+2U»');
  stubWorld();
  const { sy } = drawSy(true);
  const hz = sy._hitZones.filter((z) => z.type === 'select_hull').map((z) => z.data.hullId);
  assert(hz.length === 6, `S3e: każdy kadłub (także 🛰) klikalny w projektancie — jak dziś (${hz.length})`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S4 — stan budowy szablonu: konsola = dzisiejsza reguła (macierz, wykonanie obu ścieżek)');
{
  let cases = 0, agree = 0, onClick = 0, offClick = 0;
  for (const hullId of ['hull_small', 'hull_frigate']) for (const tech of [true, false]) for (const full of [false, true]) for (const afford of [true, false]) {
    const tpl = { id: 'tx', name: 'T', hullId, modules: hullId === 'hull_small' ? ['engine_chemical', null, null] : ['engine_chemical', null, null, null] };
    const opts = { tech, templates: [tpl], level: 1, queues: full ? [{ shipId: 'hull_small', progress: 0, buildTime: 3 }] : [], inv: afford ? null : {} };
    stubWorld(opts);
    const off = drawSy(false).sy._hitZones.some((z) => z.type === 'build_template');
    const { ed } = stubWorld(opts);
    loadTpl(ed);
    const on = drawSy(true).sy._hitZones.some((z) => z.type === 'build_template');
    cases++; if (on === off) agree++; if (on) onClick++; if (off) offClick++;
  }
  assert(agree === cases, `S4a (kontrola równoważności — zielona też na bazie): [ BUDUJ ] klikalny ⇔ dzisiejszy wiersz klikalny (${agree}/${cases})`);
  assert(offClick > 0 && offClick < cases, `S4b (świadek): macierz ma oba stany (${offClick} klikalnych z ${cases})`);
  // zmieniony / niezapisany projekt → brak budowy (dziś buduje się tylko zapisane szablony)
  const { ed } = stubWorld();
  loadTpl(ed); ed._slotAssignments[1] = 'cargo_large';
  const mod = drawSy(true);
  // K1c-B: czip [ BUDUJ ] w wierszu zapisanego projektu zostaje (buduje zapisany szablon) — pin dotyczy [ BUDUJ ] inspektora
  const izc = mod.sy.consoleZones?.inspector;
  assert(!!izc && !mod.sy._hitZones.some((z) => z.type === 'build_template' && z.x >= izc.x && z.y >= izc.y),
    'S4c: projekt zmieniony po wczytaniu → [ BUDUJ ] inspektora bez strefy');
  assert(mod.ctx._texts.some((s) => s.includes(PL['shipyardConsole.reason.modified'])), 'S4d: powód «zmieniony» widoczny');
  assert(L.buildTarget?.({ hullId: 'hull_small', slotAssignments: ['engine_chemical'], editingId: null, templates: [] })?.reason === 'unsaved', 'S4e: niezapisany → powód unsaved');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S5 — inwentarz akcji ON ⊇ OFF + te same handlery');
{
  const prep = (ed) => { loadTpl(ed); ed._onHit({ type: 'select_slot', data: { index: 2 } }); };
  let w = stubWorld(); prep(w.ed);
  const off = drawSy(false);
  // OFF: wspólny scroll — lista szablonów leży pod pickerem; inwentarz = suma klatek na górze i na dole
  const offZones = [...off.sy._hitZones];
  off.sy._shipyardScrollY = 1e6;
  for (let k = 0; k < 2; k++) { off.sy._hitZones = []; off.sy.draw(mockCtx(), W, H); }   // 2. klatka — po klamrze scrolla
  for (const z of off.sy._hitZones) { off.types.add(z.type); offZones.push(z); }
  w = stubWorld(); prep(w.ed);
  const on = drawSy(true);
  // K1c-B: [ EDYTUJ ] zastąpiony klikiem w wiersz (`tpl_row` → handler edytora `edit_template`, pin S5i)
  const REPLACED = { edit_template: 'tpl_row' };
  const missing = [...off.types].filter((tp) => !on.types.has(tp) && !(REPLACED[tp] && on.types.has(REPLACED[tp])));
  assert(off.types.size >= 14, `S5a (świadek): ścieżka OFF ma pełny inwentarz (${[...off.types].sort().join(',')})`);
  assert(missing.length === 0, `S5b: każdy typ strefy dzisiejszej Stoczni osiągalny przy ON (brak: ${missing.join(',') || '—'})`);
  assert(on.types.has('holo_view'), 'S5c: nowe czipy [ 3D ] [ PLAN ]');
  // dane stref: te same klucze co dziś
  const keys = (zones, tp) => Object.keys(zones.find((z) => z.type === tp)?.data ?? {}).sort().join();
  const same = [...off.types].filter((tp) => !['bg', 'close'].includes(tp) && !REPLACED[tp]).every((tp) => keys(offZones, tp) === keys(on.sy._hitZones, tp));
  assert(same, 'S5d: dane każdej strefy mają dzisiejsze klucze (te same handlery)');
  // handlery: klik ON = dzisiejszy skutek
  const click = (tp) => { const z = on.sy._hitZones.find((q) => q.type === tp); if (z) on.sy._onHit(z); return !!z; };
  click('build_template'); click('surge_ship'); click('cancel_pending_ship'); click('deploy_vessel');
  assert(spy.emits.length === 1 && spy.emits[0].shipId === 'hull_small', 'S5e (kontrola handlera): [ BUDUJ ] → fleet:buildRequest (kadłub szablonu)');
  assert(spy.surge.length === 1 && spy.cancel.length === 1 && spy.deploy.length === 1, 'S5f (kontrola handlera): Surge / anuluj / Rozmieść → colonyManager / vesselManager');
  const ed = w.ed;
  const pick = on.sy._hitZones.find((q) => q.type === 'pick_module');
  if (pick) on.sy._onHit(pick);
  assert(!!pick && ed._slotAssignments[2] === pick.data.moduleId, 'S5g (kontrola handlera): pick_module → wspólny edytor montuje moduł');
  click('clear_slot');
  assert(ed._slotAssignments.filter(Boolean).length < 3, 'S5h (kontrola handlera): clear_slot → edytor zdejmuje moduł');
  ed._editingTemplateId = null;
  click('tpl_row');
  assert(ed._editingTemplateId === 'tpl1', 'S5i: wybór wiersza projektu = wczytaj do projektanta');
  on.sy._onHit({ type: 'holo_view', data: { mode: 'plan' } });
  assert(on.sy._holoView === 'plan', 'S5j: [ PLAN ] przełącza widok');
  click('delete_template');
  const afterOne = window.KOSMOS.unitDesigns.length;
  click('delete_template');   // K1c-B — drugi klik (w oknie potwierdzenia)
  assert(afterOne === 1 && window.KOSMOS.unitDesigns.length === 0, 'S5k: [ USUŃ ] ×2 → edytor kasuje szablon (pierwszy klik tylko uzbraja)');
  click('close');
  assert(on.sy.visible === false, 'S5l: [ x ] zamyka');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S6 — OFF = dziś');
{
  assert(isKitScreen('shipyard', { consoleKit: true, consoleShipyard: true }) === true, 'S6a: obie flagi → konsola');
  assert(isKitScreen('shipyard', { consoleKit: false, consoleShipyard: true }) === false
    && isKitScreen('shipyard', { consoleKit: true, consoleShipyard: false }) === false, 'S6b: jedna wyłączona → dzisiejsza Stocznia');
  stubWorld();
  const off = drawSy(false);
  assert(off.sy.consoleZones === null && !off.types.has('holo_view'), 'S6c: OFF — bez stref konsoli');
  const b = off.sy._getOverlayBounds(W, H);
  const close = off.sy._hitZones.find((z) => z.type === 'close');
  assert(close && close.x === b.ox + b.ow - 28 && close.w === 22, 'S6d: OFF — dzisiejsza geometria (✕ w rogu ramy)');
  assert(F.consoleShipyard === true || FLAGS0.consoleShipyard === true, 'S6e: flaga domyślnie ON w drzewie');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S7 — wspólny UnitDesignOverlay nietknięty (inne hosty)');
{
  const snap = (on) => {
    setFlag(on); stubWorld();
    const ed = new UnitDesignOverlay(); ed.visible = true;
    ed._onHit({ type: 'select_hull', data: { hullId: 'hull_medium' } });
    ed._onHit({ type: 'select_slot', data: { index: 2 } });
    ed.draw(mockCtx(), 1920, 1080);
    return JSON.stringify(ed._hitZones.map((z) => [z.type, Math.round(z.x), Math.round(z.y), z.w, z.h]));
  };
  const a = snap(true), b = snap(false);
  assert(a === b && a.length > 100, 'S7a: strefy ekranu U identyczne przy ON i OFF');
  const src = fs.readFileSync(new URL('../../ui/UnitDesignOverlay.js', import.meta.url), 'utf8');
  assert(!/consoleShipyard|ShipyardConsole/.test(src), 'S7b: UnitDesignOverlay nie zna konsoli Stoczni');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S8 — Finding 726: kategorie tarcz i desantu');
{
  const cats = ['propulsion', ...UTILITY_SLOT_TYPES];
  assert(cats.every((c) => L.MODULE_CATEGORY_ICONS?.[c]), 'S8a: każda kategoria ma ikonę');
  assert(cats.every((c) => PL[`unitDesign.cat.${c}`] && EN[`unitDesign.cat.${c}`]), 'S8b: każda kategoria ma etykietę PL i EN');
  const { ed } = stubWorld();
  ed._onHit({ type: 'select_hull', data: { hullId: 'hull_frigate' } });
  ed._onHit({ type: 'select_slot', data: { index: 1 } });
  const on = drawSy(true);
  const tx = on.ctx._texts;
  assert(tx.some((s) => s.includes(String(PL['unitDesign.cat.shield'] ?? ' ').toUpperCase())) && tx.some((s) => s.includes(String(PL['unitDesign.cat.troop'] ?? ' ').toUpperCase())),
    'S8c: picker konsoli rysuje etykiety tarcz i desantu');
  assert(!tx.some((s) => /(^|\s)(shield|troop)$/.test(s.trim())), 'S8d: bez surowego slotType');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S9 — geometria ze stref konsoli');
{
  const { ed } = stubWorld(); loadTpl(ed); ed._onHit({ type: 'select_slot', data: { index: 1 } });
  const on = drawSy(true);
  const z = on.sy.consoleZones ?? { frame: { x: 0, y: 0, w: 0, h: 0 }, list: null, inspector: null, strip: null, hero: null };
  const inside = (q, r) => !!r && q.x >= r.x - 0.5 && q.y >= r.y - 0.5 && q.x + q.w <= r.x + r.w + 0.5 && q.y + q.h <= r.y + r.h + 0.5;
  const zs = on.sy._hitZones.filter((q) => q.type !== 'bg');
  assert(!!on.sy.consoleZones && zs.every((q) => inside(q, z.frame)), 'S9a: każda strefa w ramie konsoli');
  const sect = { list: ['tpl_row', 'select_hull', 'edit_template', 'delete_template', 'build_template', 'tpl_build_blocked'], inspector: ['select_slot', 'clear_slot', 'pick_module', 'save_template', 'clear_design', 'build_template'],
    strip: ['surge_ship', 'cancel_pending_ship', 'pending_ship_hover', 'deploy_vessel'], hero: ['holo_view'] };
  const bad = [];
  // strefa w JEDNEJ z sekcji, które wymieniają jej typ (K1c-B: [ BUDUJ ] jest w wierszu projektu i w inspektorze)
  for (const q of zs) {
    const ks = Object.keys(sect).filter((k) => sect[k].includes(q.type));
    if (ks.length && !ks.some((k) => inside(q, z[k]))) bad.push(`${q.type}∉${ks.join('|')}`);
  }
  assert(bad.length === 0, `S9b: sekcje w swoich strefach (${bad.slice(0, 4).join(',') || 'ok'})`);
  assert(zs.filter((q) => Object.values(sect).flat().includes(q.type)).length >= 12, 'S9c (świadek): sprawdzono co najmniej 12 stref');
  const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  let v = ''; try { v = strip(fs.readFileSync(new URL('../../ui/ShipyardConsoleView.js', import.meta.url), 'utf8')); } catch { v = 'window.inner'; }
  assert(!/window\.inner/.test(v) && /consoleZones\(/.test(v), 'S9d: widok bez window.inner*, geometria z consoleZones');
  assert(on.sy.handleScroll(1, z.frame.x - 50, z.frame.y + 10) === false && on.sy.handleScroll(1, z.list.x + 5, z.list.y + 40) === true,
    'S9e: kółko myszy — poza ramą nie przechwytuje, w liście tak');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S10 — bramki S0 / S1 jako linia banera');
{
  for (const [gate, opts, key] of [['S1', { level: 0 }, 'fleet.shipyardNoBuild'], ['S0', { tech: false }, 'fleet.shipyardRequiresTech']]) {
    const { ed } = stubWorld(opts); loadTpl(ed);
    const on = drawSy(true);
    assert(on.ctx._texts.includes(PL[key]), `S10a ${gate} (kontrola — dziś ten sam tekst): baner z dzisiejszym tekstem`);
    const hb = on.sy.consoleZones?.header;
    const at = on.ctx._pos.find((q) => q.s === PL[key]);
    assert(!!hb && !!at && at.y >= hb.y && at.y <= hb.y + hb.h, `S10e ${gate}: baner w paśmie nagłówka konsoli (y=${at?.y})`);
    assert(!on.types.has('build_template') && !on.types.has('surge_ship') && !on.types.has('cancel_pending_ship'), `S10b ${gate} (kontrola): budowa niedostępna (jak dziś)`);
    assert(on.types.has('select_hull') && on.types.has('select_slot') && on.types.has('deploy_vessel'), `S10c ${gate} (kontrola): projektant i rezerwa osiągalne (jak dziś)`);
    stubWorld(opts);
    const off = drawSy(false);
    assert(off.types.has('select_hull') === on.types.has('select_hull') && off.types.has('build_template') === on.types.has('build_template'),
      `S10d ${gate} (kontrola): ta sama reguła co OFF`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S11 — etykiety na kotwicach (atrapa hologramu)');
{
  const { ed } = stubWorld({ templates: [] });
  ed._onHit({ type: 'select_hull', data: { hullId: 'hull_frigate' } });
  ed._slotAssignments = ['engine_ion', 'weapon_laser', 'weapon_laser', 'shield_basic'];
  const fake = {
    setModel() {}, setMode() {}, draw() { return {}; }, isAnimating: () => true, release() { fake.released = true; },
    anchors: () => ({ anchors: ANCHOR_ROLES.map((role, i) => ({ role, p: [i / 10 - 0.25, 0, 0], src: 'default' })) }),
    projectPoints: (pts, rect) => pts.map((p, i) => ({ i, view: '3q', x: rect.x + rect.w * (0.3 + p[0]), y: rect.y + rect.h / 2 })),
  };
  F.consoleKit = true; F.consoleShipyard = true; F.shipHologram = true;
  const sy = new ShipyardOverlay(); sy.visible = true; sy._holo = fake;
  const ctx = mockCtx();
  sy.draw(ctx, W, H);
  const up = (k) => PL[k].toUpperCase();
  assert(ctx._texts.includes(up('shipAnchor.weapons')) && ctx._texts.includes(up('shipAnchor.drive')) && ctx._texts.includes(up('shipAnchor.defence')),
    'S11a: etykiety ról niepustych (napęd, uzbrojenie, obrona)');
  assert(!ctx._texts.includes(up('shipAnchor.hold')) && !ctx._texts.includes(up('shipAnchor.habitat')), 'S11b (wykluczenie; świadek S11a): role puste nie rysowane');
  const laser = SHIP_MODULES.weapon_laser;
  assert(ctx._texts.some((s) => s.includes(laser.namePL) && s.includes('×2')), 'S11c: lista modułów pod etykietą («Laser ×2»)');
  assert(sy.lastAnchors?.drawn === 3, `S11d: trzy etykiety (${sy.lastAnchors?.drawn})`);
  const placed = sy.lastAnchors?.placed ?? [];
  let overlap = false;
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (AOL.labelsOverlap?.(placed[i], placed[j])) overlap = true;
  assert(!overlap && placed.some((e) => e.extra > 0), 'S11e: etykiety z listą się nie nakładają (wysokość listy w rozsuwaniu)');
  assert(sy.isAnimating?.() === true, 'S11f: obrót hologramu → klatki');
  sy.hide();
  assert(fake.released === true && sy._holo === null && sy.isAnimating?.() === false, 'S11g: hide() zwalnia hologram');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S12 — UIManager: klatki przy animacji hologramu Stoczni (pin źródła)');
{
  const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const u = strip(fs.readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf8'));
  assert(/this\._animating\s*=[\s\S]{0,900}overlays\.shipyard\?\.isAnimating/.test(u), 'S12a: `_animating` czyta isAnimating Stoczni');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S13 — przewijanie: strefy przycięte do pasma');
{
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, name: `P${i}`, hullId: 'hull_small', modules: ['engine_chemical', null, null] }));
  const { ed } = stubWorld({ templates: many });
  ed._onHit({ type: 'select_hull', data: { hullId: 'hull_medium' } });
  ed._slotAssignments[0] = 'engine_chemical';
  ed._onHit({ type: 'select_slot', data: { index: 2 } });
  let on = drawSy(true);
  const R = on.sy._consoleScrollRects ?? {};
  const inBand = (q, r) => !!r && q.y >= r.y - 0.5 && q.y + q.h <= r.y + r.h + 0.5;
  const rows0 = on.sy._hitZones.filter((q) => q.type === 'tpl_row');
  const mods0 = on.sy._hitZones.filter((q) => q.type === 'pick_module');
  assert(rows0.length > 0 && rows0.length < 30 && rows0.every((q) => inBand(q, R.designs)), `S13a: wiersze projektów w paśmie listy (${rows0.length}/30)`);
  assert(mods0.length > 0 && mods0.every((q) => inBand(q, R.inspector)), `S13b: picker w paśmie inspektora (${mods0.length})`);
  if (R.designs) on.sy.handleScroll(800, R.designs.x + 5, R.designs.y + 5);
  if (R.inspector) on.sy.handleScroll(800, R.inspector.x + 5, R.inspector.y + 5);
  on.sy._hitZones = []; on.sy.draw(mockCtx(), W, H);
  const rows1 = on.sy._hitZones.filter((q) => q.type === 'tpl_row');
  const mods1 = on.sy._hitZones.filter((q) => q.type === 'pick_module');
  assert(rows1.length > 0 && rows1[0].data.index > rows0[0].data.index && rows1.every((q) => inBand(q, R.designs)), 'S13c: po przewinięciu — inne wiersze, nadal w paśmie');
  assert(mods1.length > 0 && mods1[0].data.moduleId !== mods0[0].data.moduleId && mods1.every((q) => inBand(q, R.inspector)), 'S13d: picker przewinięty, nadal w paśmie');
  assert(on.sy._hitZones.filter((q) => q.type === 'save_template').length === 1, 'S13e: [ ZAPISZ ] stoi poza przewijaną częścią');
}

Object.assign(F, FLAGS0);
console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
