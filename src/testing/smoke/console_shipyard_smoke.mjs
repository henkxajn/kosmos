// Keeper — ARC KONSOLE K1c-A: Stocznia na szablonie konsoli (CONSOLES_PLAN.md §1.2, Finding 723/726). KZ-Shipyard: konsola jest
// JEDYNĄ ścieżką Stoczni (flagi `consoleShipyard` i `shipHologram` zdjęte, dawna wąska kolumna usunięta) — piny porównujące ON z OFF
// zamienione na piny BEZWZGLĘDNE konsoli.
//
// Pinujemy LOGIKĘ i INWENTARZ AKCJI (wykonaniem na prawdziwych klasach — ShipyardOverlay i UnitDesignOverlay importują się pod node),
// bez pinów na stałe rysunku:
//   S1  delta podglądu = staty(z) − staty(bez) (`calcShipStats` / `calcShipCost`) na próbce kadłubów i modułów; broń / tarcze = surowe
//       damage / shieldHP modułu, BEZ agregacji
//   S2  etykiety ról: `roleStacks` przez `groupModulesByRole` (jedna na niepustą rolę, moduły zliczone, kolejność ról)
//   S3  reguła zablokowanego kadłuba bez zmian: 🛰 ⇔ !canBuildHullAt(id, 'ground'); wybór kadłuba dalej wolny
//   S4  stan budowy szablonu = reguła dawnej `_drawShipyard` przepisana NIEZALEŻNIE w keeperze (eksploracja × poziom stoczni ×
//       kolejka × surowce × kadłub, 48 przypadków): [ BUDUJ ] wiersza i inspektora mają strefę ⇔ reguła
//   S5  inwentarz akcji konsoli = DOKŁADNY zbiór 17 typów stref z dokładnymi kluczami danych; KAŻDY typ kliknięty przez handleClick
//       (pierwsze trafienie = ta strefa) ze SKUTKIEM: emit / colonyManager / vesselManager / odmowa do Dziennika / stan edytora / widok /
//       USUŃ ×2 / zamknięcie; strefy bez akcji (bg, podpowiedzi) — brak skutku ze świadkiem
//   S6  trwałość: Stocznia jest ekranem zestawu bez flag i bez consoleKit; kluczy flag nie ma w FEATURES ani w kodzie; rysunek przy
//       consoleKit OFF to dalej konsola; usunięte symbole dawnej kolumny nie wracają; klawisz U → Stocznia bez warunku
//   S7  wspólny UnitDesignOverlay: rysunek konsoli nie zmienia stanu edytora; edytor nie zna konsoli Stoczni
//   S8  Finding 726: każda kategoria pickera ma ikonę i klucz PL/EN; picker konsoli nie rysuje surowego slotType
//   S9  geometria ze stref konsoli: strefy w ramie, sekcje w swoich strefach; wejście bez window.inner*
//   S10 bramki S0/S1 = linia banera w nagłówku: brak budowy, projektant i rezerwa osiągalne, czip wiersza niesie tekst bramki
//   S11 etykiety na kotwicach (atrapa hologramu): jedna na niepustą rolę + lista modułów; role puste nie rysowane
//   S12 hologram: hide() zwalnia; UIManager rysuje klatki, gdy hologram Stoczni się animuje (pin źródła)
//   S13 przewijanie list (projekty, inspektor, pas): strefy przycięte do pasma (bez ghost-clicku)
//
// KZ-Shipyard — piny usunięte / przepięte (powód: pinowały ścieżkę OFF, która nie istnieje):
//   S4a «konsola = wykonanie ścieżki OFF» → reguła niezależna w keeperze (S4a/S4b/S4c); S5a «OFF ma pełny inwentarz» i S5b «ON ⊇ OFF»
//   → dokładny zbiór typów konsoli (S5a/S5b); S5d «klucze danych = OFF» → dokładne klucze danych per typ (S5c); S6b «jedna flaga
//   wyłączona → stara Stocznia», S6c «OFF bez stref konsoli», S6d «OFF: ✕ w rogu ramy», S6e «flaga domyślnie ON» → piny trwałości
//   S6a–S6g; S7a «strefy ekranu U identyczne przy ON i OFF» → S7a (rysunek konsoli nie zmienia stanu edytora); S10d «ta sama reguła
//   co OFF» → S10d (czip wiersza niesie tekst bramki jako powód). Bez zamiennika: brak (każdy usunięty pin ma następcę).

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import fs from 'node:fs';
import path from 'node:path';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { ShipyardOverlay } from '../../ui/ShipyardOverlay.js';
import { UnitDesignOverlay } from '../../ui/UnitDesignOverlay.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES, UTILITY_SLOT_TYPES, calcShipStats, calcShipCost } from '../../data/ShipModulesData.js';
import { canBuildHullAt } from '../../data/ShipBuildRules.js';
import { ANCHOR_ROLES } from '../../data/ShipAnchorsSchema.js';
import * as CLL from '../../ui/ConsoleLayoutLogic.js';
import EventBus from '../../core/EventBus.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

const L = await import('../../ui/ShipyardConsoleLogic.js').catch(() => ({}));
const AOL = await import('../../ui/ShipAnchorOverlayLogic.js').catch(() => ({}));

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const F = GAME_CONFIG.FEATURES;
const KIT0 = F.consoleKit;
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

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
const spy = { emits: [], surge: [], cancel: [], deploy: [], rejected: [] };
const RICH = Object.fromEntries(['Fe', 'Ti', 'Cu', 'Si', 'C', 'Hv', 'Li', 'W', 'Pt', 'Xe', 'Nt',
  'structural_alloys', 'polymer_composites', 'electronics', 'power_cells', 'conductor_bundles', 'semiconductor_wafers',
  'reactor_core', 'quantum_cores', 'warp_cores', 'plasma_cores', 'nanotech_parts'].map((k) => [k, 99999]));
const mkVessel = (id) => ({ id, name: `Rezerwa ${id}`, shipId: 'hull_small', isWreck: false, colonyId: PID, homeColonyId: PID,
  serviceState: 'stored', position: { state: 'docked', dockedAt: PID }, modules: [] });
/** Świat: kolonia ze stocznią `level`, magazyn `inv`, kolejki, zamówienia, rezerwa, szablony, edytor. */
function stubWorld({ level = 2, tech = true, inv = null, queues = null, pending = null, reserve = ['v_r'], templates = null } = {}) {
  spy.emits = []; spy.surge = []; spy.cancel = []; spy.deploy = []; spy.rejected = [];
  const active = new Map();
  if (level > 0) active.set('b1', { building: { id: 'shipyard' }, level });
  const richInv = inv ?? RICH;
  const col = {
    planetId: PID, name: 'Dom', credits: 5000, civSystem: { freePops: 3 },
    buildingSystem: { _active: active },
    resourceSystem: { inventorySnapshot: () => richInv, inventory: richInv },
    shipQueues: queues ?? [{ shipId: 'hull_small', progress: 1, buildTime: 3, surgeCount: 0 }],
    pendingShipOrders: pending ?? [{ id: 'po1', shipId: 'hull_small', cost: { Fe: 1e9 } }],
  };
  const vessels = (reserve ?? []).map(mkVessel);
  const ed = new UnitDesignOverlay();
  const vm = {
    getAllVessels: () => vessels, getVessel: (id) => vessels.find((v) => v.id === id) ?? null,
    getVesselUpkeepCredits: () => 30, fleetInArrears: () => false,
    deployVessel: (id) => { spy.deploy.push(id); return { ok: true }; },
  };
  globalThis.window.KOSMOS = {
    lang: 'pl', civMode: true,
    techSystem: { isResearched: () => tech },
    unitDesigns: templates ?? [{ id: 'tpl1', name: 'Zwiadowca', hullId: 'hull_small', modules: ['engine_chemical', 'cargo_small', null] }],
    colonyManager: {
      activePlanetId: PID, getColony: (id) => (id === PID ? col : null), getShipQueues: () => col.shipQueues,
      surgeShipBuild: (p, q) => spy.surge.push([p, q]), cancelPendingShip: (p, o) => spy.cancel.push([p, o]),
    },
    vesselManager: vm,
    overlayManager: { overlays: { unit_design: ed } },
  };
  return { col, ed, vm, vessels };
}
EventBus.on('fleet:buildRequest', (p) => spy.emits.push(p));
EventBus.on('vessel:deployRejected', (p) => spy.rejected.push(p));

const W = 1280, H = 833;
function drawSy(setup) {
  F.consoleKit = true;
  const sy = new ShipyardOverlay(); sy.visible = true;
  setup?.(sy);
  const ctx = mockCtx();
  sy.draw(ctx, W, H);
  return { sy, ctx, types: new Set(sy._hitZones.map((z) => z.type)) };
}
/** Projektant w stanie «wczytany szablon idx». */
const loadTpl = (ed, idx = 0) => { ed._onHit({ type: 'edit_template', data: { index: idx } }); };
const inRect = (q, r) => !!r && q.x >= r.x - 0.5 && q.y >= r.y - 0.5 && q.x + q.w <= r.x + r.w + 0.5 && q.y + q.h <= r.y + r.h + 0.5;

// Inwentarz konsoli Stoczni (KZ-Shipyard — jedyna ścieżka): typ strefy → klucze danych
const CONSOLE_ZONE_KEYS = {
  bg: '', close: '',
  tpl_row: 'index', build_template: 'enabled,hullId,modules,templateId', tpl_build_blocked: 'index,reason', delete_template: 'index,label',
  select_hull: 'hullId', holo_view: 'mode',
  select_slot: 'index', clear_slot: 'index', pick_module: 'moduleId', save_template: 'label', clear_design: 'label',
  surge_ship: 'planetId,queueIndex', cancel_pending_ship: 'orderId,planetId', pending_ship_hover: 'order', deploy_vessel: 'vesselId',
};
const CONSOLE_TYPES = Object.keys(CONSOLE_ZONE_KEYS).sort();

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
  const { sy } = drawSy();
  const hz = sy._hitZones.filter((z) => z.type === 'select_hull').map((z) => z.data.hullId);
  assert(hz.length === 6, `S3e: każdy kadłub (także 🛰) klikalny w projektancie (${hz.length})`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S4 — stan budowy szablonu: konsola = reguła dawnej _drawShipyard (niezależna kopia w keeperze, 48 przypadków)');
{
  // Reguła dawnej `ShipyardOverlay._drawShipyard` (usuniętej w KZ-Shipyard), przepisana tu NIEZALEŻNIE od `templateBuildState`:
  // bramka S0 (eksploracja) → bramka S1 (poziom stoczni > 0) → tech kadłuba → stocznia naziemna → (stać ? wolny slot : kolejka).
  const oldRule = ({ tech, level, queuesLen, afford, hullId }) => {
    if (!tech || !(level > 0)) return false;
    const hull = HULLS[hullId];
    const hasTech = !hull.requires || tech;
    if (!hasTech || !canBuildHullAt(hullId, 'ground')) return false;
    return afford ? queuesLen < level : true;
  };
  let cases = 0, agreeRow = 0, agreeInsp = 0, expClick = 0, insWitness = 0;
  for (const hullId of ['hull_small', 'hull_frigate']) for (const tech of [true, false]) for (const level of [0, 1, 2])
    for (const queuesLen of [0, 1]) for (const afford of [true, false]) {
      const tpl = { id: 'tx', name: 'T', hullId, modules: hullId === 'hull_small' ? ['engine_chemical', null, null] : ['engine_chemical', null, null, null] };
      const queues = Array.from({ length: queuesLen }, () => ({ shipId: 'hull_small', progress: 0, buildTime: 3 }));
      const { ed } = stubWorld({ tech, templates: [tpl], level, queues, inv: afford ? null : {} });
      loadTpl(ed);
      const { sy } = drawSy();
      const lz = sy.consoleZones?.list, iz = sy.consoleZones?.inspector;
      const row = sy._hitZones.some((z) => z.type === 'build_template' && inRect(z, lz));
      const insp = sy._hitZones.some((z) => z.type === 'build_template' && inRect(z, iz));
      if (sy._hitZones.some((z) => z.type === 'save_template' && inRect(z, iz))) insWitness++;
      const exp = oldRule({ tech, level, queuesLen, afford, hullId });
      cases++; if (row === exp) agreeRow++; if (insp === exp) agreeInsp++; if (exp) expClick++;
    }
  assert(agreeRow === cases, `S4a: [ BUDUJ ] wiersza projektu klikalny ⇔ reguła dawnej Stoczni (${agreeRow}/${cases})`);
  assert(agreeInsp === cases, `S4b: [ BUDUJ ] inspektora (projekt wczytany, niezmieniony) klikalny ⇔ ta sama reguła (${agreeInsp}/${cases})`);
  assert(expClick > 0 && expClick < cases && insWitness === cases, `S4c (świadek): macierz ma oba stany (${expClick} klikalnych z ${cases}), inspektor narysowany w każdym (${insWitness})`);
  // zmieniony / niezapisany projekt → brak budowy (budują się tylko zapisane szablony)
  const { ed } = stubWorld();
  loadTpl(ed); ed._slotAssignments[1] = 'cargo_large';
  const mod = drawSy();
  // K1c-B: czip [ BUDUJ ] w wierszu zapisanego projektu zostaje (buduje zapisany szablon) — pin dotyczy [ BUDUJ ] inspektora
  const izc = mod.sy.consoleZones?.inspector;
  assert(!!izc && !mod.sy._hitZones.some((z) => z.type === 'build_template' && inRect(z, izc))
    && mod.sy._hitZones.some((z) => z.type === 'build_template' && inRect(z, mod.sy.consoleZones?.list)),
  'S4d: projekt zmieniony po wczytaniu → [ BUDUJ ] inspektora bez strefy (świadek: czip wiersza zapisanego projektu jest)');
  assert(mod.ctx._texts.some((s) => s.includes(PL['shipyardConsole.reason.modified'])), 'S4e: powód «zmieniony» widoczny');
  assert(L.buildTarget?.({ hullId: 'hull_small', slotAssignments: ['engine_chemical'], editingId: null, templates: [] })?.reason === 'unsaved', 'S4f: niezapisany → powód unsaved');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S5 — inwentarz akcji konsoli (dokładny) + skutek każdej akcji przez handleClick');
{
  const TPLS = () => [
    { id: 'tpl1', name: 'Zwiadowca', hullId: 'hull_small', modules: ['engine_chemical', 'cargo_small', null] },
    { id: 'tpl2', name: 'Fregata', hullId: 'hull_frigate', modules: ['engine_chemical', null, null, null] },   // 🛰 → czip zablokowany
  ];
  const w = stubWorld({
    level: 3,   // 2 budowy w 3 slotach → [ BUDUJ ] klikalny (stać, wolny slot)
    templates: TPLS(),
    queues: [{ shipId: 'hull_small', progress: 1, buildTime: 3, surgeCount: 0 }, { shipId: 'hull_small', progress: 0, buildTime: 3, surgeCount: 0 }],
    pending: [{ id: 'po1', shipId: 'hull_small', cost: { Fe: 1e9 } }, { id: 'po2', shipId: 'hull_small', cost: { Fe: 1e9 } }],
    reserve: ['v_r1', 'v_r2'],
  });
  const ed = w.ed;
  loadTpl(ed); ed._onHit({ type: 'select_slot', data: { index: 2 } });
  let now = 10000;
  const on = drawSy((sy) => { sy._now = () => now; });
  const sy = on.sy;
  const types = [...on.types].sort();
  assert(types.join() === CONSOLE_TYPES.join(), `S5a: zbiór typów stref konsoli = dokładnie ${CONSOLE_TYPES.length} typów (${types.join(',')})`);
  assert(!on.types.has('edit_template') && on.types.size === 17, 'S5b (wykluczenie; świadek S5a): bez strefy [ EDYTUJ ] — wczytanie = klik w wiersz');
  const badKeys = sy._hitZones.filter((z) => Object.keys(z.data ?? {}).sort().join() !== CONSOLE_ZONE_KEYS[z.type]).map((z) => z.type);
  assert(badKeys.length === 0 && sy._hitZones.length >= 25, `S5c: dane każdej strefy mają dokładne klucze (${sy._hitZones.length} stref; złe: ${[...new Set(badKeys)].join(',') || '—'})`);

  const clicked = new Set();
  const redraw = () => { sy._hitZones = []; sy.draw(mockCtx(), W, H); };
  /** Klik w środek strefy przez handleClick; zwraca strefę, gdy pierwsze trafienie to właśnie ona. */
  const click = (type, pred = () => true) => {
    redraw();
    const z = sy._hitZones.find((q) => q.type === type && pred(q));
    if (!z) return null;
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    if (sy._hitTest(cx, cy) !== z) return null;
    const handled = sy.handleClick(cx, cy);
    if (handled) clicked.add(type);
    return handled ? z : null;
  };
  const edState = () => JSON.stringify([ed._selectedHullId, ed._slotAssignments, ed._activeSlotIndex, ed._editingTemplateId]);
  const lz = () => sy.consoleZones.list, iz = () => sy.consoleZones.inspector;

  // [ BUDUJ ] wiersza i inspektora → fleet:buildRequest z kadłubem i modułami zapisanego szablonu
  const bRow = click('build_template', (q) => inRect(q, lz()) && q.data.templateId === 'tpl1');
  const bIns = click('build_template', (q) => inRect(q, iz()));
  const mods1 = JSON.stringify(['engine_chemical', 'cargo_small']);
  assert(!!bRow && !!bIns && spy.emits.length === 2 && spy.emits.every((p) => p.shipId === 'hull_small' && JSON.stringify(p.modules) === mods1),
    `S5d: [ BUDUJ ] (wiersz i inspektor) → fleet:buildRequest {hull_small, moduły szablonu} ×2 (${spy.emits.length})`);
  // czip zablokowany: brak skutku (świadek: strefa istnieje i została trafiona)
  const st0 = edState(), n0 = window.KOSMOS.unitDesigns.length;
  const blk = click('tpl_build_blocked');
  assert(!!blk && blk.data.index === 1 && spy.emits.length === 2 && edState() === st0 && window.KOSMOS.unitDesigns.length === n0,
    'S5e: czip [ BUDUJ ] zablokowany (🛰) — klik bez budowy, bez zmiany edytora i projektów');
  // pas: Surge drugiej budowy, anuluj drugie zamówienie, Rozmieść drugi kadłub
  const sg = click('surge_ship', (q) => q.data.queueIndex === 1);
  assert(!!sg && JSON.stringify(spy.surge) === JSON.stringify([[PID, 1]]), `S5f: Surge (budowa 2) → colonyManager.surgeShipBuild(${PID}, 1) (${JSON.stringify(spy.surge)})`);
  const cn = click('cancel_pending_ship', (q) => q.data.orderId === 'po2');
  assert(!!cn && JSON.stringify(spy.cancel) === JSON.stringify([[PID, 'po2']]), `S5g: [ x ] zamówienia 2 → colonyManager.cancelPendingShip(${PID}, po2) (${JSON.stringify(spy.cancel)})`);
  const dp = click('deploy_vessel', (q) => q.data.vesselId === 'v_r2');
  assert(!!dp && JSON.stringify(spy.deploy) === JSON.stringify(['v_r2']) && spy.rejected.length === 0,
    `S5h: Rozmieść (kadłub 2) → vesselManager.deployVessel(v_r2); sukces bez odmowy w Dzienniku (${JSON.stringify(spy.deploy)})`);
  w.vm.deployVessel = (id) => { spy.deploy.push(id); return { ok: false, reason: 'noCrewPops' }; };
  click('deploy_vessel', (q) => q.data.vesselId === 'v_r1');
  const rj = spy.rejected[0];
  assert(spy.rejected.length === 1 && rj.vesselId === 'v_r1' && rj.reason === 'noCrewPops' && rj.vessel?.id === 'v_r1',
    'S5i: odmowa rozmieszczenia nie jest cicha — vessel:deployRejected {vesselId, vessel, reason}');
  // podpowiedź braków: najechanie ustawia zamówienie; klik bez skutku
  redraw();
  const ph = sy._hitZones.find((q) => q.type === 'pending_ship_hover' && q.data.order?.id === 'po1');
  if (ph) sy.handleMouseMove(ph.x + 4, ph.y + 4);
  const hoverOk = sy._hoverPendingOrder?.id === 'po1';
  const before = JSON.stringify([spy.emits.length, spy.surge, spy.cancel, spy.deploy]);
  const phc = click('pending_ship_hover', (q) => q.data.order?.id === 'po1');
  assert(!!ph && hoverOk && !!phc && JSON.stringify([spy.emits.length, spy.surge, spy.cancel, spy.deploy]) === before,
    'S5j: oczekujące — najechanie wybiera zamówienie do podpowiedzi braków, klik bez akcji');
  // widok bohatera
  const hp = click('holo_view', (q) => q.data.mode === 'plan');
  const afterPlan = sy._holoView;
  const h3 = click('holo_view', (q) => q.data.mode === '3q');
  assert(!!hp && !!h3 && afterPlan === 'plan' && sy._holoView === '3q', 'S5k: [ PLAN ] → widok plan, [ 3D ] → widok 3q');
  // projektant (wspólny edytor overlays.unit_design)
  click('select_slot', (q) => q.data.index === 1);
  assert(ed._activeSlotIndex === 1, `S5l: select_slot → edytor: aktywny slot 1 (${ed._activeSlotIndex})`);
  const pk = click('pick_module');
  assert(!!pk && ed._slotAssignments[1] === pk.data.moduleId, `S5m: pick_module → edytor montuje moduł w slocie 1 (${pk?.data?.moduleId})`);
  const cs = click('clear_slot', (q) => q.data.index === 1);
  assert(!!cs && ed._slotAssignments[1] === null && ed._slotAssignments[0] === 'engine_chemical', 'S5n: clear_slot → edytor zdejmuje moduł tylko z tego slotu');
  let saves = 0; ed._saveTemplate = () => { saves++; };
  click('save_template');
  assert(saves === 1, `S5o: [ ZAPISZ ] → edytor._saveTemplate (${saves})`);
  const tr = click('tpl_row', (q) => q.data.index === 1);
  assert(!!tr && ed._editingTemplateId === 'tpl2' && ed._selectedHullId === 'hull_frigate' && ed._slotAssignments[0] === 'engine_chemical',
    `S5p: klik w wiersz projektu 2 = wczytaj TEN projekt do projektanta (${ed._editingTemplateId})`);
  click('select_hull', (q) => q.data.hullId === 'hull_medium');
  assert(ed._selectedHullId === 'hull_medium' && ed._editingTemplateId === null && ed._slotAssignments.length === HULLS.hull_medium.slots.length,
    'S5q: select_hull → edytor: nowy kadłub, puste sloty, bez wczytanego projektu');
  ed._slotAssignments[0] = 'engine_chemical';
  click('clear_design');
  assert(ed._slotAssignments.every((m) => m === null) && ed._selectedHullId === 'hull_medium', 'S5r: [ WYCZYŚĆ ] → edytor zdejmuje wszystkie moduły (kadłub zostaje)');
  // [ USUŃ ] ×2 (pierwszy klik uzbraja, drugi w oknie potwierdzenia kasuje WŁAŚCIWY projekt)
  click('delete_template', (q) => q.data.index === 0);
  const afterOne = window.KOSMOS.unitDesigns.map((t) => t.id).join();
  now += 500;
  click('delete_template', (q) => q.data.index === 0);
  assert(afterOne === 'tpl1,tpl2' && window.KOSMOS.unitDesigns.map((t) => t.id).join() === 'tpl2',
    `S5s: [ USUŃ ] ×2 → kasuje projekt 1 (pierwszy klik tylko uzbraja) (${afterOne} → ${window.KOSMOS.unitDesigns.map((t) => t.id).join()})`);
  // tło: pochłania klik, bez skutku
  redraw();
  const f = sy.consoleZones.frame;
  const bgPt = [[f.x + 2, f.y + f.h - 2], [f.x + f.w - 2, f.y + f.h - 2], [f.x + 2, f.y + 2]].find(([x, y]) => sy._hitTest(x, y)?.type === 'bg');
  const st1 = edState(), ev1 = JSON.stringify([spy.emits.length, spy.surge, spy.cancel, spy.deploy, sy._holoView, window.KOSMOS.unitDesigns.length]);
  const bgH = bgPt ? sy.handleClick(bgPt[0], bgPt[1]) : false;
  if (bgH) clicked.add('bg');
  assert(!!bgPt && bgH === true && edState() === st1 && sy.visible
    && JSON.stringify([spy.emits.length, spy.surge, spy.cancel, spy.deploy, sy._holoView, window.KOSMOS.unitDesigns.length]) === ev1,
  'S5t: klik w tło konsoli pochłonięty (true), bez skutku');
  click('close');
  assert(sy.visible === false, 'S5u: [ x ] zamyka');
  const missed = CONSOLE_TYPES.filter((tp) => !clicked.has(tp));
  assert(missed.length === 0, `S5v: każdy typ strefy konsoli kliknięty przez handleClick (pominięte: ${missed.join(',') || '—'})`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S6 — trwałość: Stocznia jest na stałe konsolą');
{
  assert(CLL.isKitScreen('shipyard', {}) === true && CLL.isKitScreen('shipyard', { consoleKit: false }) === true,
    'S6a: isKitScreen(shipyard) bez flag i z consoleKit OFF');
  assert((CLL.PERMANENT_KIT_SCREENS ?? []).includes('shipyard') && (CLL.PERMANENT_KIT_SCREENS ?? []).includes('diplomacy')
    && typeof CLL.CONSOLE_KIT_SCREENS === 'object' && CLL.CONSOLE_KIT_SCREENS !== null && !('shipyard' in CLL.CONSOLE_KIT_SCREENS),
  'S6b: shipyard w PERMANENT_KIT_SCREENS (obok diplomacy z KZ-Dipl), nie w mapie flag CONSOLE_KIT_SCREENS');
  assert(!('consoleShipyard' in F) && !('shipHologram' in F) && 'consoleKit' in F, 'S6c: kluczy consoleShipyard / shipHologram nie ma w FEATURES (świadek: consoleKit jest)');
  const { ed: ed6 } = stubWorld(); loadTpl(ed6);
  F.consoleKit = false;
  const sy = new ShipyardOverlay(); sy.visible = true;
  sy.draw(mockCtx(), W, H);
  F.consoleKit = true;
  const ty = new Set(sy._hitZones.map((z) => z.type));
  assert(!!sy.consoleZones?.hero && ty.has('holo_view') && ty.has('tpl_row') && ty.has('deploy_vessel'), 'S6d: consoleKit OFF — Stocznia dalej rysuje konsolę (strefy konsoli, czipy [ 3D ] [ PLAN ])');
  const so = strip(fs.readFileSync(new URL('../../ui/ShipyardOverlay.js', import.meta.url), 'utf8'));
  const gone = ['_drawShipyardBody', '_drawShipyard', '_drawReserve', '_shipyardScrollY', '_shipyardContentH', '_shipyardViewH', 'isKitScreen', 'GAME_CONFIG']
    .filter((s) => new RegExp(`\\b${s}\\b`).test(so));
  assert(gone.length === 0 && /drawShipyardConsole\(this, ctx, W, H\)/.test(so), `S6e: ShipyardOverlay bez symboli dawnej kolumny i bez warunku flagi; draw woła konsolę (wróciło: ${gone.join(',') || '—'})`);
  // kod produktu (bez testów i bibliotek): żadnego odczytu flag Stoczni / hologramu
  const root = new URL('../../', import.meta.url);
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['testing', 'lib'].includes(e.name)) walk(p); } else if (e.name.endsWith('.js')) files.push(p);
  } };
  walk(path.normalize(decodeURIComponent(root.pathname.replace(/^\/([A-Za-z]:)/, '$1'))));
  const hits = files.filter((p) => /\b(consoleShipyard|shipHologram)\b/.test(strip(fs.readFileSync(p, 'utf8')))).map((p) => path.basename(p));
  const kitReaders = files.filter((p) => /\bconsoleKit\b/.test(strip(fs.readFileSync(p, 'utf8')))).length;
  assert(files.length > 100 && kitReaders > 0 && hits.length === 0, `S6f: kod produktu bez consoleShipyard / shipHologram (${files.length} plików; świadek: consoleKit czytany w ${kitReaders}; trafienia: ${hits.join(',') || '—'})`);
  assert(CLL.routeOverlayId?.('unit_design', {}) === 'shipyard' && CLL.routeOverlayId?.('unit_design', { consoleKit: false }) === 'shipyard'
    && CLL.routeOverlayId?.('unit_design') === 'shipyard' && CLL.routeOverlayId?.('tech', {}) === 'tech',
  'S6g: klawisz U zawsze prowadzi do Stoczni (bez flag, z consoleKit OFF, bez argumentu flag); kontrola: inne id bez zmian');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S7 — wspólny UnitDesignOverlay (stan wspólny z konsolą)');
{
  const { ed } = stubWorld();
  ed._onHit({ type: 'select_hull', data: { hullId: 'hull_medium' } });
  ed._onHit({ type: 'select_slot', data: { index: 2 } });
  ed._slotAssignments[0] = 'engine_ion';
  const snap = () => JSON.stringify([ed._selectedHullId, ed._slotAssignments, ed._activeSlotIndex, ed._editingTemplateId, ed._scrollModules]);
  const s0 = snap();
  const on = drawSy();
  assert(snap() === s0 && on.sy._hitZones.some((z) => z.type === 'pick_module'), 'S7a: rysunek konsoli czyta edytor, nie zmienia jego stanu (świadek: picker edytora narysowany)');
  const src = strip(fs.readFileSync(new URL('../../ui/UnitDesignOverlay.js', import.meta.url), 'utf8'));
  assert(!/ShipyardConsole|isKitScreen/.test(src) && /_onHit\(zone\)/.test(src), 'S7b: UnitDesignOverlay nie zna konsoli Stoczni');
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
  const on = drawSy();
  const tx = on.ctx._texts;
  assert(tx.some((s) => s.includes(String(PL['unitDesign.cat.shield'] ?? '\u0000').toUpperCase())) && tx.some((s) => s.includes(String(PL['unitDesign.cat.troop'] ?? '\u0000').toUpperCase())),
    'S8c: picker konsoli rysuje etykiety tarcz i desantu');
  assert(!tx.some((s) => /(^|\s)(shield|troop)$/.test(s.trim())), 'S8d: bez surowego slotType');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S9 — geometria ze stref konsoli');
{
  const { ed } = stubWorld(); loadTpl(ed); ed._onHit({ type: 'select_slot', data: { index: 1 } });
  const on = drawSy();
  const z = on.sy.consoleZones ?? { frame: { x: 0, y: 0, w: 0, h: 0 }, list: null, inspector: null, strip: null, hero: null };
  const zs = on.sy._hitZones.filter((q) => q.type !== 'bg');
  assert(!!on.sy.consoleZones && zs.every((q) => inRect(q, z.frame)), 'S9a: każda strefa w ramie konsoli');
  const sect = { list: ['tpl_row', 'select_hull', 'delete_template', 'build_template', 'tpl_build_blocked'], inspector: ['select_slot', 'clear_slot', 'pick_module', 'save_template', 'clear_design', 'build_template'],
    strip: ['surge_ship', 'cancel_pending_ship', 'pending_ship_hover', 'deploy_vessel'], hero: ['holo_view'] };
  const bad = [];
  // strefa w JEDNEJ z sekcji, które wymieniają jej typ (K1c-B: [ BUDUJ ] jest w wierszu projektu i w inspektorze)
  for (const q of zs) {
    const ks = Object.keys(sect).filter((k) => sect[k].includes(q.type));
    if (ks.length && !ks.some((k) => inRect(q, z[k]))) bad.push(`${q.type}∉${ks.join('|')}`);
  }
  assert(bad.length === 0, `S9b: sekcje w swoich strefach (${bad.slice(0, 4).join(',') || 'ok'})`);
  assert(zs.filter((q) => Object.values(sect).flat().includes(q.type)).length >= 12, 'S9c (świadek): sprawdzono co najmniej 12 stref');
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
    const on = drawSy();
    assert(on.ctx._texts.includes(PL[key]), `S10a ${gate}: baner z tekstem bramki`);
    const hb = on.sy.consoleZones?.header;
    const at = on.ctx._pos.find((q) => q.s === PL[key]);
    assert(!!hb && !!at && at.y >= hb.y && at.y <= hb.y + hb.h, `S10e ${gate}: baner w paśmie nagłówka konsoli (y=${at?.y})`);
    assert(!on.types.has('build_template') && !on.types.has('surge_ship') && !on.types.has('cancel_pending_ship'), `S10b ${gate}: budowa niedostępna`);
    assert(on.types.has('select_hull') && on.types.has('select_slot') && on.types.has('deploy_vessel'), `S10c ${gate}: projektant i rezerwa osiągalne`);
    const bl = on.sy._hitZones.find((z) => z.type === 'tpl_build_blocked');
    assert(!!bl && bl.data.reason === PL[key], `S10d ${gate}: czip [ BUDUJ ] wiersza zablokowany z tekstem bramki jako powodem`);
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
  F.consoleKit = true;
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
  const on = drawSy();
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

F.consoleKit = KIT0;
console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
