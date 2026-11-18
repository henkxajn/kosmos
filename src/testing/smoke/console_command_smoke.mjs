// ARC KONSOLE K7-A — keeper: Dowództwo na szablonie konsoli (KZ-Command: jedyna ścieżka, flaga zdjęta). Plan: docs/design/CONSOLES_PLAN.md (K7).
//
// Sekcje (każda degraduje, nie przerywa — symbole nowego kodu przez import przestrzeni nazw / dynamiczny import):
//   A  inwentarz stref konsoli ABSOLUTNY: dokładne typy z licznościami i klucze danych per stan (12 stanów rejestru —
//      zamrożone z bazy 8701aa8, gdzie ścieżka ON była ⊇ OFF pod dawnym pinem A; zbiór zkey 1:1 z obecnym rysunkiem);
//      każdy z 33 typów klikany przez `handleClick` ze SKUTKIEM (stan, wywołany handler / system, zdarzenie)
//   B  sort / filtr: kolejność wierszy tabeli == FleetRegistryLogic dla tego samego wejścia (kilka kolumn, kierunki, filtry)
//   C  czipy nagłówka zastępują pasek zakładek, przełączenie zachowuje stan rejestru; gniazdo walki; brak pasa subnav;
//      TRWAŁOŚĆ — 'fleet' ekranem zestawu bez flag i przy consoleKit false, brak klucza consoleCommand, FMO bez kitOn / isKitScreen
//   D  wyłączona akcja ma powód i18n (zbiorcza bez zaznaczenia, „Pokaż” w tranzycie, kontakt tylko do odczytu) — klucze PL + EN
//   S  pole szukania DOM: prostokąt ze strefy listy przy 1600×1041 i 1280×833, bez `window.inner*` w handlerze
//   G  geometria stref (bez nakładania, nad zegarem, strefy trafień w ramie)
//   L  czysta logika (układ kolumn, liczniki fasetowe, temat osi, podsumowanie zaznaczenia, kontekst, pusta tabela)
//   E  pusta tabela po filtrze → „wyczyść filtry” (skutek)
//   M  wiele statków: przewijanie tabeli, strefy tylko w pasie widoku
//   N  brak surowych id / snake_case w tekście konsoli
//   X  przewijanie po strefach konsoli (lista / tabela / pas = zoom / inspektor)
//   F  (po bramce K7-A) klik wiersza = TYLKO zaznaczenie (bez `vessel:focus`; świadek: POKAŻ emituje); „POKAŻ” = plan z żywego
//      statku per stan (dok → ciało / stacja, orbita i lot → statek, inny układ → przełączenie, tranzyt / nieznany układ → powód)
//      i jego wykonanie (kolejność: zamknięcie → przełączenie → zaznaczenie → `vessel:focus`; odmowa = bez kamery)
// Bez pinów na stałe rysunku (kolory, odstępy).
//
// KZ-Command — piny ON vs OFF przepięte na absolutne: A (ON ⊇ OFF per stan → dokładne typy + klucze danych; „te same skutki ON ==
// OFF” → tabela skutków 33 typów), A multi (pola wyboru ON == OFF → jedno na wiersz własny tabeli), B (ON == OFF → == logika),
// C (OFF nie jest ekranem zestawu / brak stref konsoli → trwałość), F row (kontrola OFF „klik leci kamerą” → świadek POKAŻ).
// Usunięte bez zamiennika: brak.

import '../headless/env.js';   // MUSI być pierwszy
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import * as RL from '../../ui/FleetRegistryLogic.js';
import * as LAY from '../../ui/ConsoleLayoutLogic.js';
import * as NAV from '../../ui/CivPanelDrawer.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import EventBus from '../../core/EventBus.js';

let CL = {};
try { CL = await import('../../ui/CommandConsoleLogic.js'); } catch (e) { console.log('  (CommandConsoleLogic brak: ' + e.message + ')'); }
const { pl } = await import('../../i18n/pl.js').catch(() => ({ pl: null }));
const { en } = await import('../../i18n/en.js').catch(() => ({ en: null }));
const PL = pl ?? (await import('../../i18n/pl.js')).default ?? {};
const EN = en ?? (await import('../../i18n/en.js')).default ?? {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s);
const safe = (name, fn) => { try { fn(); } catch (e) { fail++; console.log(`  ✗ FAIL: ${name} rzuciło: ${e.message}`); } };

const FEAT = GAME_CONFIG.FEATURES;
FEAT.consoleKit = true;   // scena za tekstem; Dowództwo od niej nie zależy (C — trwałość)

// ── fikstura świata ───────────────────────────────────────────────────────────────────────────────────────────────
const AU = 100;
function mkVessel(id, name, extra = {}) {
  return {
    id, name, shipId: 'hull_medium', systemId: 'sys_home', colonyId: 'p_home', homeColonyId: 'p_home', owner: 'player',
    status: 'idle', mission: null, movementOrder: null,
    fuel: { current: 40, max: 60, consumption: 1 }, warpFuel: { current: 0, max: 0 },
    endurance: { current: 10, max: 10 }, cargo: {}, cargoUsed: 0, cargoCapacity: 50,
    colonistCapacity: 0, colonists: 0, troopCapacity: 0, modules: ['engine_ion', 'cargo_small'],
    missionLog: [], isWreck: false, serviceState: 'active', unpaidYears: 0, refuelAutomatically: true,
    position: { state: 'docked', dockedAt: 'p_home', x: 1 * AU, y: 0 }, ...extra,
  };
}
function world(nShips = 8) {
  const vs = [];
  const names = ['Kotwica', 'Kurier', 'Zmija', 'Orzel', 'Sokol', 'Wilga', 'Cyranka', 'Bocian'];
  for (let i = 0; i < nShips; i++) {
    const base = names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : '');
    const extra = {};
    if (i % 4 === 1) Object.assign(extra, { systemId: 'sys_b', position: { state: 'orbiting', dockedAt: null, x: 2 * AU, y: 0 } });
    if (i % 5 === 2) extra.fuel = { current: 5, max: 60, consumption: 1 };   // mało paliwa → alert
    if (i % 3 === 0) extra.shipId = 'hull_frigate';
    if (i === 3) extra.fleetId = 'fl_a';
    if (i === 5) extra.fleetId = 'fl_a';
    vs.push(mkVessel(`v_${i}`, base, extra));
  }
  // tranzyt (systemId null), wrak, kontakt wroga
  vs.push(mkVessel('v_tr', 'Wedrowiec', { systemId: null, position: { state: 'in_transit', dockedAt: null, x: 0, y: 0 } }));
  vs.push(mkVessel('v_wr', 'Szczatek', { isWreck: true, wreckedAt: 41 }));
  vs.push(mkVessel('v_en', 'Najezdzca', { owner: 'ai_1', empireId: 'ai_1', isEnemy: true, systemId: 'sys_home' }));
  return vs;
}
const FLEETS = [{ id: 'fl_a', name: 'Pierwsza', memberIds: ['v_3', 'v_5'], activeOrder: null, doctrine: 'balanced', retreatThreshold: 0.3 }];

function installKosmos(ov, vessels) {
  let selV = null, selF = null;
  const byId = new Map(vessels.map((v) => [v.id, v]));
  globalThis.window.KOSMOS = globalThis.KOSMOS = {
    civMode: true, activeSystemId: 'sys_home',
    homePlanet: { id: 'p_home', x: 0, y: 0 },
    timeSystem: { gameTime: 40, isPaused: true },
    vesselManager: { getAllVessels: () => vessels, getVessel: (id) => byId.get(id) ?? null, isImmobilized: () => false },
    fleetSystem: { listFleets: () => FLEETS, getFleet: (id) => FLEETS.find((f) => f.id === id) ?? null },
    starSystemManager: { getAllSystems: () => [{ systemId: 'sys_home', galaxyStar: { name: 'Sol' } }, { systemId: 'sys_b', galaxyStar: { name: 'Barnard' } }] },
    colonyManager: { getColony: (id) => (id === 'p_home' ? { name: 'Ziemia' } : null), getPlayerColonies: () => [], getAllColonies: () => [], activePlanetId: 'p_home', _getShipyardLevel: () => 0 },
    intelSystem: { getVesselContact: () => ({ quality: 'full' }) },
    notificationCenter: { getActiveCount: () => 0 },
    uiManager: {
      _dirty: false,
      getSelectedVesselId: () => selV, getSelectedFleetId: () => selF,
      setSelectedVesselId: (id) => { selV = id; ov._selectedVesselId = id; },
      setSelectedFleetId: (id) => { selF = id; ov._selectedFleetId = id; },
      overlayManager: { closeActive() {} },
    },
    overlayManager: { active: 'fleet', overlays: { fleet: ov } },
  };
}

function mockCtx() {
  const log = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px mono', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    fillRect(x, y, w, h) { log.push(['fillRect', x, y, w, h, this.fillStyle]); },
    strokeRect() {}, clearRect() {},
    fillText(s, x, y) { log.push(['fillText', String(s), x, y]); },
    beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {}, rect() {},
    setLineDash() {}, quadraticCurveTo() {}, bezierCurveTo() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    getTransform() { return { a: 1, d: 1 }; },
    measureText(s) { const px = parseFloat(String(this.font).replace(/^bold /, '')) || 10; return { width: String(s).length * px * 0.6 }; },
    createRadialGradient() { return { addColorStop() {} }; }, createLinearGradient() { return { addColorStop() {} }; },
    createConicGradient() { return { addColorStop() {} }; }, drawImage() {},
  };
  ctx.log = log;
  return ctx;
}

const W = 1280, H = 833;   // logiczne px przy 1600×1041 (skala 1.25) i 1280×833 (skala 1)
function mk({ vessels = world(), setup = null } = {}) {
  const ov = new FleetManagerOverlay();
  installKosmos(ov, vessels);
  ov._visible = true;
  ov._activeTab = 'tactical';
  if (setup) setup(ov);
  return ov;
}
function draw(ov) {
  const ctx = mockCtx();
  ov.draw(ctx, W, H);
  return ctx;
}
const stable = (d) => JSON.stringify(d ?? {}, (k, v) => (typeof v === 'function' ? undefined : v), 0);
const zkey = (z) => `${z.type}|${stable(Object.fromEntries(Object.entries(z.data ?? {}).sort()))}`;
const zoneSet = (ov) => new Set(ov._hitZones.map(zkey));

// Stany rejestru (inwentarz A)
const STATES = {
  plain: null,
  multi: (o) => { o._multiSelectedIds.add('v_0'); o._multiSelectedIds.add('v_2'); },
  wrecksContacts: (o) => { o._registryFilter.showWrecks = true; o._registryFilter.showContacts = true; },
  groupFleet: (o) => { o._registryGroupMode = 'fleet'; },
  groupSystem: (o) => { o._registryGroupMode = 'system'; o._registryCollapsedGroups.add('sys_b'); },
  filterSystem: (o) => { o._registryFilter.systemKey = 'sys_b'; },
  filterRole: (o) => { o._registryFilter.role = 'warship'; },
  search: (o) => { o._registryFilter.search = 'ko'; },
  selFleet: (o) => { window.KOSMOS.uiManager.setSelectedFleetId('fl_a'); },
  selWreck: (o) => { o._registryFilter.showWrecks = true; window.KOSMOS.uiManager.setSelectedVesselId('v_wr'); },
  selVessel: (o) => { window.KOSMOS.uiManager.setSelectedVesselId('v_0'); },
  multiAndSel: (o) => { o._multiSelectedIds.add('v_1'); window.KOSMOS.uiManager.setSelectedVesselId('v_0'); },
};

// ═══ A — inwentarz stref konsoli (absolutny) ══════════════════════════════════════════════════════════════════════
header('A  inwentarz stref konsoli: dokładne typy (liczności) i klucze danych per stan');
// Zamrożone z bazy 8701aa8 (ścieżka konsoli, która tam była ⊇ ścieżki OFF pod dawnym pinem A); obecny rysunek = baza 1:1.
const EXPECT_TYPES = {
  plain: { close: 1, fleetCreate: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 8, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 9, vesselMultiToggle: 9 },
  multi: { close: 1, fleetAssignMenuOpen: 2, fleetClearMultiSelect: 2, fleetCreate: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 8, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 11, vesselMultiToggle: 9 },
  wrecksContacts: { close: 1, fleetCreate: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 8, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 10, vesselMultiToggle: 9 },
  groupFleet: { close: 1, fleetCreate: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 8, registryGroupFleet: 2, registryGroupMode: 3, registryGroupToggle: 3, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 9, vesselMultiToggle: 9 },
  groupSystem: { close: 1, fleetCreate: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 6, registryGroupFleet: 1, registryGroupMode: 3, registryGroupToggle: 6, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 7, vesselMultiToggle: 7 },
  filterSystem: { close: 1, fleetCreate: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 4, registryFocus: 2, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 2, vesselMultiToggle: 2 },
  filterRole: { close: 1, fleetCreate: 1, registryChipKind: 2, registryChipRole: 2, registryChipSystem: 3, registryClearFilters: 1, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1 },
  search: { close: 1, fleetCreate: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 2, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySearchClear: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 2, vesselMultiToggle: 2 },
  selFleet: { close: 1, fleetBackToList: 1, fleetCreate: 1, fleetDisband: 1, fleetEngage: 1, fleetMemberSelect: 2, fleetMoveToPoint: 1, fleetRename: 1, fleetReturnBase: 1, fleetSetDoctrine: 4, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 8, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 9, vesselMultiToggle: 9 },
  selWreck: { close: 1, fleetCreate: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 8, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, tab: 4, timelineCollapse: 1, vessel: 10, vesselMultiToggle: 9 },
  selVessel: { action: 1, back_to_shipyard: 1, close: 1, fleetCreate: 1, manual_refuel: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 8, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, rename: 1, tab: 4, timelineCollapse: 1, toggle_refuel_auto: 1, undock: 1, vessel: 9, vesselMultiToggle: 9 },
  multiAndSel: { action: 1, back_to_shipyard: 1, close: 1, fleetAssignMenuOpen: 1, fleetClearMultiSelect: 1, fleetCreate: 1, manual_refuel: 1, registryChipKind: 2, registryChipRole: 1, registryChipSystem: 3, registryFocus: 8, registryGroupFleet: 1, registryGroupMode: 3, registrySearch: 1, registrySort: 12, rename: 1, tab: 4, timelineCollapse: 1, toggle_refuel_auto: 1, undock: 1, vessel: 9, vesselMultiToggle: 9 },
};
// klucze danych każdego typu (te same we wszystkich stanach)
const EXPECT_KEYS = { action: 'actionId,vessel', back_to_shipyard: '', close: '', fleetAssignMenuOpen: '', fleetBackToList: '', fleetClearMultiSelect: '',
  fleetCreate: '', fleetDisband: 'fleetId', fleetEngage: 'fleetId', fleetMemberSelect: 'vesselId', fleetMoveToPoint: 'fleetId', fleetRename: 'fleetId',
  fleetReturnBase: 'fleetId', fleetSetDoctrine: 'doctrine,fleetId', manual_refuel: 'vesselId', registryChipKind: 'field', registryChipRole: 'role',
  registryChipSystem: 'key', registryClearFilters: '', registryFocus: 'systemId,vesselId', registryGroupFleet: 'fleetId', registryGroupMode: 'mode',
  registryGroupToggle: 'key', registrySearch: '', registrySearchClear: '', registrySort: 'col', rename: 'vesselId', tab: 'tab', timelineCollapse: '',
  toggle_refuel_auto: 'vesselId', undock: 'vesselId', vessel: 'vesselId', vesselMultiToggle: 'vesselId' };
const typeCounts = (ov) => { const m = {}; for (const z of ov._hitZones) m[z.type] = (m[z.type] ?? 0) + 1; return Object.fromEntries(Object.entries(m).sort()); };
const diffCounts = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).map((k) => `${k}:${a[k] ?? 0}≠${b[k] ?? 0}`);
for (const [name, setup] of Object.entries(STATES)) {
  safe(`A ${name}`, () => {
    const on = mk({ setup }); draw(on);
    ok(!!on.consoleZones?.frame && on._hitZones.length > 0, `A ${name}: świadek — rysunek konsoli ze strefami (${on._hitZones.length})`);
    const got = typeCounts(on), want = EXPECT_TYPES[name];
    ok(stable(got) === stable(want), `A ${name}: typy stref i liczności == zamrożone (${diffCounts(got, want).join(' ; ')})`);
    const badKeys = on._hitZones.filter((z) => Object.keys(z.data ?? {}).sort().join(',') !== EXPECT_KEYS[z.type]).map((z) => `${z.type}{${Object.keys(z.data ?? {}).join(',')}}`);
    ok(badKeys.length === 0, `A ${name}: klucze danych stref == zamrożone (${[...new Set(badKeys)].join(' ; ')})`);
  });
}
// zaznaczenie wielokrotne i akcja zbiorcza: pole wyboru na każdym wierszu własnym tabeli, skutek kliku
safe('A multi', () => {
  const on = mk(); draw(on);
  ok(!!on.consoleZones, 'A multi: świadek — rysunek konsoli');
  const tog = on._hitZones.filter((z) => z.type === 'vesselMultiToggle');
  const rowIds = on._hitZones.filter((z) => z.type === 'vessel' && z.x < on.consoleZones.inspector.x).map((z) => z.data.vesselId);
  ok(tog.length > 0 && tog.length === rowIds.length && tog.every((z) => rowIds.includes(z.data.vesselId)),
    `A: pole wyboru na każdym wierszu tabeli (${tog.length} vs ${rowIds.length} wierszy)`);
  ok(!on._hitZones.some((z) => z.type === 'fleetAssignMenuOpen'), 'A: bez zaznaczenia brak strefy „Przypisz” (wyłączona z powodem — D)');
  const z = tog.find((q) => q.data.vesselId === 'v_2');
  on._handleHit(z);
  ok(on._multiSelectedIds.has('v_2'), 'A: klik pola wyboru zaznacza');
  draw(on);
  ok(on._hitZones.some((q) => q.type === 'fleetAssignMenuOpen'), 'A: po zaznaczeniu „Przypisz do floty” osiągalne');
  const clr = on._hitZones.find((q) => q.type === 'fleetClearMultiSelect');
  on._handleHit(clr);
  ok(on._multiSelectedIds.size === 0, 'A: „Wyczyść zaznaczenie” czyści');
});
// inspektor przy zaznaczeniu wielokrotnym bez wyboru = podsumowanie z akcjami zbiorczymi i nazwami (klik = wybór)
safe('A inspector multi', () => {
  const inInsp = (ov) => { const r = ov.consoleZones.inspector; return ov._hitZones.filter((z) => z.x >= r.x && z.x + z.w <= r.x + r.w + 1 && z.y >= r.y); };
  const on = mk({ setup: STATES.multi }); draw(on);
  ok(!!on.consoleZones, 'A insp: świadek — ON rysuje konsolę');
  const zi = on.consoleZones ? inInsp(on) : [];
  ok(zi.some((z) => z.type === 'fleetAssignMenuOpen') && zi.some((z) => z.type === 'fleetClearMultiSelect'), 'A insp: akcje zbiorcze w inspektorze');
  ok(['v_0', 'v_2'].every((id) => zi.some((z) => z.type === 'vessel' && z.data.vesselId === id)), 'A insp: nazwy zaznaczonych klikalne (wybór)');
  const one = mk({ setup: STATES.multiAndSel }); draw(one);
  const zo = one.consoleZones ? inInsp(one) : [];
  ok(!zo.some((z) => z.type === 'fleetClearMultiSelect'), 'A insp: kontrola — z wybranym statkiem inspektor pokazuje statek, nie podsumowanie');
});

// ═══ A klik — każdy typ strefy konsoli przez `handleClick` ze SKUTKIEM ═════════════════════════════════════════════
header('A klik  każdy z typów inwentarza klikany przez handleClick — skutek (stan / handler / system / zdarzenie)');
const focusEv = [];
EventBus.on('vessel:focus', (p) => focusEv.push(p?.vesselId));
const clickAt = (ov, z) => ov.handleClick(z.x + z.w / 2, z.y + z.h / 2);
const spyOn = (ov, name) => { const calls = []; ov[name] = (...a) => { calls.push(a); }; return calls; };
const pick = (zs, f) => zs.find(f) ?? null;
const K_ = () => window.KOSMOS;
const EFFECTS = {
  close: (ov, zs) => { clickAt(ov, zs[0]); return ov._visible === false; },
  fleetCreate: (ov, zs) => { const c = spyOn(ov, '_handleCreateFleet'); clickAt(ov, zs[0]); return c.length === 1; },
  registryChipKind: (ov, zs) => { const z = zs[0]; const b = !!ov._registryFilter[z.data.field]; clickAt(ov, z); return ov._registryFilter[z.data.field] === !b; },
  registryChipRole: (ov, zs) => { const z = pick(zs, (q) => q.data.role !== ov._registryFilter.role); clickAt(ov, z); return ov._registryFilter.role === z.data.role; },
  registryChipSystem: (ov, zs) => { const z = pick(zs, (q) => q.data.key !== ov._registryFilter.systemKey); clickAt(ov, z); return ov._registryFilter.systemKey === z.data.key; },
  registryFocus: (ov, zs) => { const c = spyOn(ov, '_focusVesselKit'); const z = zs[0]; clickAt(ov, z); return c.length === 1 && c[0][0] === z.data.vesselId; },
  registryGroupFleet: (ov, zs) => { clickAt(ov, zs[0]); return K_().uiManager.getSelectedFleetId() === zs[0].data.fleetId; },
  registryGroupMode: (ov, zs) => { const z = pick(zs, (q) => q.data.mode !== ov._registryGroupMode); clickAt(ov, z); return ov._registryGroupMode === z.data.mode; },
  registrySearch: (ov, zs) => {
    clickAt(ov, zs[0]); const el = ov._registrySearchEl; const okEl = !!el && document.body.children.includes(el);
    ov._closeRegistrySearch(); return okEl;
  },
  registrySort: (ov, zs) => {
    const z = pick(zs, (q) => q.data.col !== ov._registrySort.col); clickAt(ov, z);
    const first = ov._registrySort.col === z.data.col && ov._registrySort.dir === 1;
    clickAt(ov, z); return first && ov._registrySort.col === z.data.col && ov._registrySort.dir === -1;
  },
  tab: (ov, zs) => { const z = pick(zs, (q) => q.data.tab !== ov._activeTab); clickAt(ov, z); return ov._activeTab === z.data.tab; },
  timelineCollapse: (ov, zs) => { const b = !!ov._timelineCollapsed; clickAt(ov, zs[0]); return !!ov._timelineCollapsed === !b; },
  vessel: (ov, zs) => {
    const z = pick(zs, (q) => q.data.vesselId !== ov._selectedVesselId && q.x < ov.consoleZones.inspector.x);
    focusEv.length = 0; clickAt(ov, z); return ov._selectedVesselId === z.data.vesselId && focusEv.length === 0;
  },
  vesselMultiToggle: (ov, zs) => {
    const z = pick(zs, (q) => !ov._multiSelectedIds.has(q.data.vesselId)); clickAt(ov, z);
    const on = ov._multiSelectedIds.has(z.data.vesselId); clickAt(ov, z); return on && !ov._multiSelectedIds.has(z.data.vesselId);
  },
  fleetAssignMenuOpen: (ov, zs) => { const c = spyOn(ov, '_handleAssignMultiToFleet'); clickAt(ov, zs[0]); return c.length === 1; },
  fleetClearMultiSelect: (ov, zs) => { const n = ov._multiSelectedIds.size; clickAt(ov, zs[0]); return n > 0 && ov._multiSelectedIds.size === 0; },
  registryGroupToggle: (ov, zs) => { const z = zs[0]; const b = ov._registryCollapsedGroups.has(z.data.key); clickAt(ov, z); return ov._registryCollapsedGroups.has(z.data.key) === !b; },
  registryClearFilters: (ov, zs) => { const b = ov._registryFilter.role; clickAt(ov, zs[0]); return b !== null && ov._registryFilter.role === null && ov._registryFilter.search === ''; },
  registrySearchClear: (ov, zs) => { const b = ov._registryFilter.search; clickAt(ov, zs[0]); return b !== '' && ov._registryFilter.search === ''; },
  fleetBackToList: (ov, zs) => { const b = K_().uiManager.getSelectedFleetId(); clickAt(ov, zs[0]); return b === 'fl_a' && K_().uiManager.getSelectedFleetId() === null; },
  fleetDisband: (ov, zs) => { const c = spyOn(ov, '_handleDisbandFleet'); clickAt(ov, zs[0]); return c.length === 1 && c[0][0] === zs[0].data.fleetId; },
  fleetEngage: (ov, zs) => { const c = spyOn(ov, '_handleFleetEngage'); clickAt(ov, zs[0]); return c.length === 1 && c[0][0] === zs[0].data.fleetId; },
  fleetMoveToPoint: (ov, zs) => { const c = spyOn(ov, '_handleFleetMoveToPoint'); clickAt(ov, zs[0]); return c.length === 1 && c[0][0] === zs[0].data.fleetId; },
  fleetReturnBase: (ov, zs) => { const c = spyOn(ov, '_handleFleetReturnBase'); clickAt(ov, zs[0]); return c.length === 1 && c[0][0] === zs[0].data.fleetId; },
  fleetRename: (ov, zs) => { const c = spyOn(ov, '_handleRenameFleet'); clickAt(ov, zs[0]); return c.length === 1 && c[0][0] === zs[0].data.fleetId; },
  fleetMemberSelect: (ov, zs) => {
    const z = zs[0]; focusEv.length = 0; clickAt(ov, z);
    return ov._selectedVesselId === z.data.vesselId && K_().uiManager.getSelectedFleetId() === null && focusEv.includes(z.data.vesselId);
  },
  fleetSetDoctrine: (ov, zs) => {
    const c = []; K_().fleetSystem.setDoctrine = (...a) => c.push(a);
    const z = zs[0]; clickAt(ov, z); return c.length === 1 && c[0][0] === z.data.fleetId && c[0][1] === z.data.doctrine;
  },
  action: (ov, zs) => { const c = spyOn(ov, '_handleAction'); clickAt(ov, zs[0]); return c.length === 1 && c[0][0]?.actionId === zs[0].data.actionId; },
  back_to_shipyard: (ov, zs) => {
    const c = []; K_().overlayManager.openPanel = (id) => c.push(id);
    clickAt(ov, zs[0]); return c.join() === 'shipyard' && ov._selectedVesselId === null;
  },
  manual_refuel: (ov, zs) => { const c = []; K_().vesselManager.manualRefuel = (id) => c.push(id); clickAt(ov, zs[0]); return c.join() === zs[0].data.vesselId; },
  rename: (ov, zs) => { const c = spyOn(ov, '_renameVessel'); clickAt(ov, zs[0]); return c.length === 1 && c[0][0] === zs[0].data.vesselId; },
  toggle_refuel_auto: (ov, zs) => {
    const v = K_().vesselManager.getVessel(zs[0].data.vesselId); const b = v.refuelAutomatically ?? true;
    clickAt(ov, zs[0]); return v.refuelAutomatically === !b;
  },
  undock: (ov, zs) => { const c = []; K_().vesselManager.undockToOrbit = (id) => c.push(id); clickAt(ov, zs[0]); return c.join() === zs[0].data.vesselId; },
};
const ALL_TYPES = Object.keys(EXPECT_KEYS);
ok(ALL_TYPES.length === 33 && ALL_TYPES.every((t) => typeof EFFECTS[t] === 'function') && Object.keys(EFFECTS).length === ALL_TYPES.length,
  `A klik: tabela skutków pokrywa dokładnie typy inwentarza (${Object.keys(EFFECTS).length}/${ALL_TYPES.length})`);
for (const type of ALL_TYPES) {
  safe(`A klik ${type}`, () => {
    const stName = Object.keys(EXPECT_TYPES).find((n) => EXPECT_TYPES[n][type]);
    const ov = mk({ setup: STATES[stName] }); draw(ov);
    const zs = ov._hitZones.filter((q) => q.type === type);
    ok(zs.length > 0 && typeof EFFECTS[type] === 'function', `A klik ${type}: świadek — strefa w stanie ${stName}`);
    if (zs.length && EFFECTS[type]) ok(EFFECTS[type](ov, zs) === true, `A klik ${type}: skutek kliknięcia (${stName}, ${stable(zs[0].data)})`);
  });
}

// ═══ B — sort / filtr ON == OFF ═══════════════════════════════════════════════════════════════════════════════════
header('B  kolejność wierszy tabeli == FleetRegistryLogic');
const tableOrder = (ov) => {
  const hero = ov.consoleZones?.hero;
  return ov._hitZones.filter((z) => z.type === 'vessel' && (!hero || (z.x >= hero.x && z.x <= hero.x + hero.w)))
    .map((z) => z.data.vesselId);
};
for (const [col, dir, filt] of [['name', 1, null], ['name', -1, null], ['fuel', 1, null], ['system', -1, null], ['eta', 1, { showWrecks: true }],
  ['role', 1, { systemKey: 'sys_home' }], ['fleet', 1, { search: 'o' }]]) {
  safe(`B ${col}`, () => {
    const setup = (o) => { o._registrySort = { col, dir }; Object.assign(o._registryFilter, filt ?? {}); };
    const on = mk({ setup }); draw(on);
    const a = tableOrder(on);
    const rows = RL.sortRows(RL.filterRows(RL.buildRegistryRows(window.KOSMOS.vesselManager.getAllVessels(), on._registryCtx()), on._registryFilter), col, dir)
      .filter((r) => r.kind !== 'contact').map((r) => r.id);
    ok(a.length > 1, `B ${col}/${dir}: świadek — tabela ma ≥ 2 wiersze (${a.length})`);
    ok(!!on.consoleZones?.hero, `B ${col}/${dir}: świadek — tabela w strefie bohatera`);
    ok(a.join() === rows.join(), `B ${col}/${dir}: kolejność == logika (${a.join()} vs ${rows.join()})`);
  });
}

// ═══ C — czipy zastępują pasek zakładek, stan zostaje ═════════════════════════════════════════════════════════════
header('C  czipy nagłówka, przełączanie zakładek, stan rejestru, gniazdo walki');
safe('C', () => {
  // trwałość (KZ-Command): 'fleet' zawsze ekranem zestawu — bez flag, przy consoleKit false, bez argumentu; rejestr flag pusty
  ok(LAY.isKitScreen?.('fleet', {}) === true && LAY.isKitScreen?.('fleet', { consoleKit: false }) === true && LAY.isKitScreen?.('fleet') === true,
    'C: fleet jest ekranem zestawu zawsze (bez flag, consoleKit false, bez argumentu)');
  ok(LAY.PERMANENT_KIT_SCREENS?.includes('fleet') && !('fleet' in (LAY.CONSOLE_KIT_SCREENS ?? { fleet: 1 })) && !('consoleCommand' in FEAT),
    'C: fleet w PERMANENT_KIT_SCREENS, nie w CONSOLE_KIT_SCREENS; brak klucza consoleCommand w FEATURES');
  ok(LAY.isKitScreen?.('tech', {}) === false && LAY.isKitScreen?.('observatory', { consoleKit: true }) === false,
    'C: świadek — predykat nie jest stały (Technologie / Obserwatorium nie są ekranem zestawu)');
  const on = mk({ setup: (o) => { o._registryFilter.systemKey = 'sys_b'; o._registrySort = { col: 'fuel', dir: -1 }; o._multiSelectedIds.add('v_1'); } });
  const ctx = draw(on);
  const tabs = on._hitZones.filter((z) => z.type === 'tab').map((z) => z.data.tab);
  const expect = ['tactical', 'ground', 'atlas', ...(FEAT.transportOrders ? ['logistics'] : [])];
  ok(tabs.join() === expect.join(), `C: czipy = dzisiejsze zakładki (${tabs.join()})`);
  ok(!!on.consoleZones?.combatSlot, 'C: gniazdo paska walki w nagłówku (D-K-17)');
  ok(NAV.getSubNavHeight?.() === 0, 'C: brak pasa subnav nad Dowództwem');
  const titleTxt = ctx.log.filter((l) => l[0] === 'fillText' && l[1] === PL['fleet.tabTactical']);
  ok(titleTxt.length === 0, 'C: brak dawnego paska zakładek (etykieta bez nawiasów czipa nie jest rysowana)');
  on._handleHit(on._hitZones.find((z) => z.type === 'tab' && z.data.tab === 'atlas'));
  ok(on._activeTab === 'atlas', 'C: klik czipa przełącza zakładkę (dzisiejszy `_switchTab`)');
  draw(on);
  ok(on._hitZones.some((z) => z.type === 'tab' && z.data.tab === 'tactical'), 'C: czipy widoczne na stronie Atlasu');
  on._handleHit(on._hitZones.find((z) => z.type === 'tab' && z.data.tab === 'tactical'));
  ok(on._registryFilter.systemKey === 'sys_b' && on._registrySort.col === 'fuel' && on._multiSelectedIds.has('v_1'),
    'C: filtr, sort i zaznaczenie przeżywają przełączenie zakładek');
  // trwałość rysunku: przy consoleKit false i przy pustych FEATURES Dowództwo dalej rysuje konsolę z czipami
  const saved = { ...FEAT };
  try {
    for (const [tag, patch] of [['consoleKit false', { consoleKit: false }], ['FEATURES {}', null]]) {
      if (patch) Object.assign(FEAT, patch); else for (const k of Object.keys(FEAT)) delete FEAT[k];
      const o2 = mk(); draw(o2);
      ok(!!o2.consoleZones?.frame && o2._hitZones.filter((z) => z.type === 'tab').length >= 3, `C: ${tag} — Dowództwo dalej konsolą (strefy + czipy)`);
      Object.assign(FEAT, saved);
    }
  } finally { Object.assign(FEAT, saved); }
  const fsrc = fs.readFileSync(fileURLToPath(new URL('../../ui/FleetManagerOverlay.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  ok(/drawCommandConsole\(this, ctx, W, H\)/.test(fsrc), 'C: świadek — FMO rysuje przez drawCommandConsole');
  ok(!/\bkitOn\b|\bisKitScreen\b|consoleCommand/.test(fsrc), 'C: FMO bez kitOn / isKitScreen / consoleCommand (kod bez komentarzy)');
});

// ═══ D — wyłączone akcje z powodem i18n ═══════════════════════════════════════════════════════════════════════════
header('D  wyłączona akcja = powód i18n (PL + EN)');
safe('D', () => {
  const on = mk(); draw(on);
  const dis = on._cmdDisabled ?? [];
  ok(dis.some((d) => d.reasonKey === 'cmdConsole.bulkNeed'), 'D: „Przypisz do floty” bez zaznaczenia → powód');
  ok(dis.some((d) => d.reasonKey === 'cmdConsole.focusTransit'), 'D: „Pokaż” dla statku w tranzycie → powód');
  ok(!on._hitZones.some((z) => z.type === 'registryFocus' && z.data.vesselId === 'v_tr'), 'D: tranzyt bez strefy „Pokaż” (jak OFF)');
  ok(on._hitZones.some((z) => z.type === 'registryFocus' && z.data.vesselId === 'v_0'), 'D: kontrola — zadokowany ma „Pokaż”');
  const on2 = mk({ setup: (o) => { o._registryFilter.showContacts = true; } }); draw(on2);
  ok((on2._cmdDisabled ?? []).some((d) => d.reasonKey === 'cmdConsole.contactHint'), 'D: kontakt wroga → podpowiedź (nie cichy brak reakcji)');
  ok(!on2._hitZones.some((z) => z.data?.vesselId === 'v_en'), 'D: kontakt bez akcji (jak OFF)');
  const keys = new Set([...dis, ...(on2._cmdDisabled ?? [])].map((d) => d.reasonKey));
  for (const k of ['cmdConsole.bulkNeed', 'cmdConsole.focusTransit', 'cmdConsole.contactHint', 'cmdConsole.focusHint', ...keys]) {
    ok(typeof PL[k] === 'string' && PL[k].length > 3 && typeof EN[k] === 'string' && EN[k].length > 3, `D: klucz ${k} w PL i EN`);
  }
  ok(CL.bulkGate?.(0)?.ok === false && CL.bulkGate?.(2)?.ok === true, 'D: bulkGate');
  ok(CL.focusGate?.({ kind: 'own', isTransit: true })?.ok === false && CL.focusGate?.({ kind: 'wreck' }) === null, 'D: focusGate');
});

// ═══ S — pole szukania DOM z prostokąta strefy ═════════════════════════════════════════════════════════════════════
header('S  <input> szukajki przy 1600×1041 i 1280×833 (bez window.inner* w handlerze)');
for (const [iw, ih, sc] of [[1600, 1041, 1.25], [1280, 833, 1]]) {
  safe(`S ${iw}`, () => {
    globalThis.innerWidth = iw; globalThis.innerHeight = ih;
    const ce = document.createElement;
    document.createElement = (tag) => { const el = ce(tag); if (String(tag) === 'input') el.style = {}; return el; };
    const on = mk(); draw(on);
    ok(Math.abs((on._uiScale ?? 0) - sc) < 1e-9, `S ${iw}×${ih}: skala UI z rysunku = ${sc} (${on._uiScale})`);
    globalThis.innerWidth = 333; globalThis.innerHeight = 222;   // handler nie może czytać okna
    const z = on._hitZones.find((q) => q.type === 'registrySearch');
    on._handleHit(z);
    const el = on._registrySearchEl;
    const r = on._cmdRects?.search;
    ok(!!el && !!r, `S ${iw}: pole otwarte`);
    if (el && r) {
      const px = (v) => parseFloat(v);
      ok(px(el.style.left) === Math.round(r.x * sc) && px(el.style.top) === Math.round(r.y * sc)
        && px(el.style.width) === Math.round(r.w * sc) && px(el.style.height) === Math.round(r.h * sc),
        `S ${iw}: pozycja = strefa × skala (${el.style.left},${el.style.top},${el.style.width},${el.style.height})`);
      const lz = on.consoleZones.list;
      ok(r.x >= lz.x && r.x + r.w <= lz.x + lz.w && r.y >= lz.y && r.y + r.h <= lz.y + lz.h, `S ${iw}: pole w strefie listy`);
      ok(px(el.style.left) + px(el.style.width) <= iw && px(el.style.top) + px(el.style.height) <= ih, `S ${iw}: pole w oknie`);
      el.value = 'zmi'; el.oninput?.();
      ok(on._registryFilter.search === 'zmi', `S ${iw}: wpis filtruje (dzisiejszy cykl życia)`);
      on._closeRegistrySearch();
    }
    document.createElement = ce;
  });
}
globalThis.innerWidth = 1920; globalThis.innerHeight = 1080;
safe('S src', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../../ui/FleetManagerOverlay.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/_openRegistrySearchKit\(rect\) \{([\s\S]*?)\n  \}/);
  ok(!!m, 'S: świadek — metoda pola konsoli istnieje');
  ok(!!m && !/window\.inner/.test(m[1].replace(/\/\/.*$/gm, '')), 'S: brak window.inner* w handlerze pola konsoli');
  const o = src.match(/\n  _openRegistrySearch\(\) \{([\s\S]*?)\n  \}/);
  ok(!!o && /this\._cmdRects\?\.search/.test(o[1]) && /_openRegistrySearchKit\(/.test(o[1]) && !/window\.inner|innerWidth|innerHeight/.test(o[1].replace(/\/\/.*$/gm, '')),
    'S: `_openRegistrySearch()` bez argumentu — tylko pole konsoli (`_cmdRects.search`), bez window.inner*');
});

// ═══ G — geometria stref ═════════════════════════════════════════════════════════════════════════════════════════
header('G  strefy konsoli: bez nakładania, nad zegarem, trafienia w ramie');
safe('G', () => {
  const on = mk({ setup: (o) => { o._multiSelectedIds.add('v_0'); } }); draw(on);
  const z = on.consoleZones;
  ok(!!z?.hero && !!z?.list && !!z?.inspector && !!z?.strip, 'G: 4 strefy + pas');
  ok(LAY.zonesOverlap?.([z.list, z.hero, z.inspector, z.strip]) === false, 'G: strefy się nie nakładają');
  const clock = z.clock;
  ok(!!clock, 'G: świadek — klaster zegara znany');
  for (const k of ['list', 'hero', 'inspector', 'strip']) {
    const r = z[k];
    const overX = r.x < clock.x + clock.w && r.x + r.w > clock.x;
    ok(!overX || r.y + r.h <= clock.y, `G: ${k} nie wchodzi pod zegar`);
  }
  const f = z.frame;
  const outside = on._hitZones.filter((q) => q.x < f.x - 1 || q.y < f.y - 1 || q.x + q.w > f.x + f.w + 1 || q.y + q.h > f.y + f.h + 1);
  ok(outside.length === 0, `G: strefy trafień w ramie (${outside.length} poza)`);
  const tbl = on._cmdRects?.table;
  const rowsOut = on._hitZones.filter((q) => q.type === 'vessel' && q.x < z.inspector.x && (q.y < tbl.y - 0.5 || q.y + q.h > tbl.y + tbl.h + 0.5));
  ok(rowsOut.length === 0, 'G: strefy wierszy tylko w pasie tabeli (Finding 110)');
});

// ═══ L — czysta logika ═══════════════════════════════════════════════════════════════════════════════════════════
header('L  logika konsoli');
safe('L', () => {
  const lay = CL.registryColumnLayout?.(100, 700);
  ok(!!lay && lay.cols.length === RL.REGISTRY_COLUMNS.length, 'L: 12 kolumn dzisiejszych');
  if (lay) {
    const end = lay.focus.x + lay.focus.w;
    ok(Math.abs(end - 800) <= RL.REGISTRY_COLUMNS.length, `L: kolumny wypełniają szerokość (${end})`);
    ok(lay.cols.find((c) => c.id === 'name').w >= (CL.CMD_TABLE?.NAME_MIN ?? 96), 'L: nazwa ≥ minimum');
    const wide = CL.registryColumnLayout(0, 2000);
    ok(wide.scale === 1 && wide.cols.find((c) => c.id === 'fuel').w === CL.CMD_FIXED_COLS.fuel, 'L: szeroko — dzisiejsze szerokości');
  }
  const vs = world();
  const ov = mk({ vessels: vs });
  const rows = RL.buildRegistryRows(vs, ov._registryCtx());
  const f = { systemKey: null, role: 'warship', search: '', showWrecks: true, showContacts: false };
  const c = CL.facetCounts?.(rows, f);
  ok(!!c && c.shown === RL.filterRows(rows, f).length, 'L: licznik „pokazane” = filterRows');
  ok(!!c && c.systems.every((s) => s.count === RL.filterRows(rows, { ...f, systemKey: s.key }).length), 'L: liczniki układów fasetowe');
  ok(!!c && c.roles.every((r) => r.count === RL.filterRows(rows, { ...f, role: r.role }).length), 'L: liczniki ról fasetowe');
  ok(!!c && c.wrecks === 1 && c.contacts === 1, `L: wraki ${c?.wrecks}, kontakty ${c?.contacts}`);
  const fl = FLEETS[0];
  ok(CL.timelineSubject?.({ selVesselId: 'v_0', fleet: fl, multiIds: ['v_1'] })?.kind === 'fleet', 'L: oś — flota ma pierwszeństwo');
  ok(CL.timelineSubject?.({ selVesselId: 'v_0', multiIds: ['v_1'] })?.ids.join() === 'v_0,v_1', 'L: oś — zaznaczone + wybrany');
  ok(CL.timelineSubject?.({ selVesselId: 'v_0' })?.kind === 'vessel', 'L: oś — statek');
  ok(CL.timelineSubject?.({ visibleRows: [{ id: 'a' }, { id: 'b' }] })?.ids.join() === 'a,b', 'L: oś — bez wyboru wiersze tabeli');
  const ms = CL.multiSummary?.(rows, ['v_0', 'v_2', 'v_wr', 'gone']);
  ok(ms?.count === 2 && ms.names.length === 2, `L: podsumowanie liczy tylko własne żywe (${ms?.count})`);
  ok(ms?.lowFuel === 1, `L: mało paliwa (${ms?.lowFuel})`);
  ok(CL.emptyState?.(0, { own: 3, wrecks: 0, contacts: 0 }, { search: 'x' })?.canClear === true, 'L: pusta po filtrze → wyczyść');
  ok(CL.emptyState?.(0, { own: 0, wrecks: 0, contacts: 0 }, {})?.key === 'cmdConsole.emptyNoShips', 'L: brak statków');
  ok(CL.emptyState?.(3, {}, {}) === null, 'L: są wiersze → null');
  const tt = (k, ...a) => `${k}(${a.join(',')})`;
  const parts = CL.contextParts?.({ shown: 2, total: 9, filter: { systemKey: 'sys_b', role: null, search: 'ko' }, systemName: 'Barnard', sortLabel: 'Nazwa', sortDir: 1 }, tt) ?? [];
  ok(parts.some((p) => p.includes('Barnard')) && parts.some((p) => p.includes('ko')) && parts[0].includes('2,9'), 'L: kontekst = licznik, układ, szukajka');
  const chips = CL.commandGroupChips?.('atlas', { transportOrders: false }, (k) => k) ?? [];
  ok(chips.length === 3 && chips.find((q) => q.active)?.id === 'atlas', 'L: czipy bez Logistyki przy transportOrders OFF');
  ok(CL.rowRole?.({ kind: 'contact' }) === 'foreign' && CL.rowRole?.({ tone: 'combat' }) === 'alert' && CL.rowRole?.({ tone: 'idle' }) === 'dim'
    && CL.rowRole?.({ tone: 'move' }) === 'primary' && CL.rowRole?.({ kind: 'wreck' }) === 'dim', 'L: role statusu');
  const css = CL.searchInputCss?.({ x: 10, y: 20, w: 100, h: 18 }, 1.25);
  ok(css?.left === 13 && css?.top === 25 && css?.width === 125 && css?.height === 23, 'L: searchInputCss');
});

// ═══ E — pusta tabela po filtrze ═════════════════════════════════════════════════════════════════════════════════
header('E  pusty wynik filtra → „wyczyść filtry”');
safe('E', () => {
  const on = mk({ setup: (o) => { o._registryFilter.search = 'qqqq'; o._registryFilter.role = 'warship'; } });
  const ctx = draw(on);
  const z = on._hitZones.find((q) => q.type === 'registryClearFilters');
  ok(!!z, 'E: strefa „wyczyść filtry” przy pustym wyniku');
  ok(ctx.log.some((l) => l[0] === 'fillText' && l[1] === PL['cmdConsole.emptyFiltered']), 'E: powód pustej tabeli wypisany');
  if (z) on._handleHit(z);
  ok(on._registryFilter.search === '' && on._registryFilter.role === null, 'E: klik przywraca filtr domyślny');
  draw(on);
  ok(!on._hitZones.some((q) => q.type === 'registryClearFilters'), 'E: kontrola — z wierszami brak strefy');
});

// ═══ M — wiele statków ═══════════════════════════════════════════════════════════════════════════════════════════
header('M  wiele statków: przewijanie tabeli');
safe('M', () => {
  const vs = world(60);
  const on = mk({ vessels: vs }); draw(on);
  const tbl = on._cmdRects.table;
  const first = on._hitZones.filter((q) => q.type === 'vessel').length;
  ok(first > 5 && first < 60, `M: widać część wierszy (${first})`);
  const h = on.consoleZones.hero;
  for (let i = 0; i < 40; i++) on.handleScroll(200, h.x + 20, h.y + h.h / 2);
  draw(on);
  ok(on._registryScroll > 0, `M: tabela przewinięta (${on._registryScroll})`);
  const last = RL.sortRows(RL.filterRows(RL.buildRegistryRows(vs, on._registryCtx()), on._registryFilter), 'name', 1).at(-1).id;
  ok(on._hitZones.some((q) => q.type === 'vessel' && q.data.vesselId === last), 'M: na dole widać ostatni wiersz');
  ok(on._hitZones.filter((q) => q.type === 'vessel').every((q) => q.y >= tbl.y - 0.5 && q.y + q.h <= tbl.y + tbl.h + 0.5), 'M: strefy w pasie widoku');
});

// ═══ N — brak surowych id ═════════════════════════════════════════════════════════════════════════════════════════
header('N  brak surowych id / snake_case w tekście konsoli');
safe('N', () => {
  const on = mk({ setup: (o) => { o._registryFilter.showWrecks = true; o._registryFilter.showContacts = true; o._registryGroupMode = 'fleet'; o._multiSelectedIds.add('v_0'); } });
  const ctx = draw(on);
  const texts = ctx.log.filter((l) => l[0] === 'fillText').map((l) => l[1]);
  ok(texts.length > 30, `N: świadek — konsola pisze tekst (${texts.length})`);
  const bad = texts.filter((s) => /\b(v_\d+|sys_[a-z]+|fl_[a-z]+|p_home|[a-z]+_[a-z]+_[a-z]+)\b/.test(s) || /\b[a-z]+\.[a-z]+[A-Z]\w*\b/.test(s));
  ok(bad.length === 0, `N: surowe id / klucze: ${bad.slice(0, 5).join(' | ')}`);
});

// ═══ X — przewijanie po strefach ═════════════════════════════════════════════════════════════════════════════════
header('X  kółko myszy po strefach konsoli');
safe('X', () => {
  const on = mk({ vessels: world(40) }); draw(on);
  const z = on.consoleZones;
  const so = on._scrollOffset ?? 0;
  on.handleScroll(120, z.list.x + 10, z.list.y + z.list.h - 10);
  ok((on._cmdListScroll ?? 0) > 0 && (on._scrollOffset ?? 0) === so, 'X: lista przewija listę konsoli (nie uśpioną listę mapy)');
  const tl = on._cmdRects.timeline;
  ok(!!tl, 'X: świadek — oś czasu narysowana');
  if (tl) {
    const before = { ...on._timelineYears };
    on.handleScroll(120, tl.vx0 + 20, tl.y + tl.h / 2);
    ok(on._timelineYears.endYear - on._timelineYears.startYear > before.endYear - before.startYear, 'X: pas = zoom osi');
  }
  window.KOSMOS.uiManager.setSelectedVesselId('v_0'); draw(on);
  on._rightContentH = 2000; on._rightViewH = 300; on._rightScrollY = 0;
  on.handleScroll(120, z.inspector.x + 20, z.inspector.y + 40);
  ok(on._rightScrollY > 0, 'X: inspektor przewija panel statku');
  const hz = on._hitZones.find((q) => q.type === 'tab');
  on.handleMouseMove(hz.x + 2, hz.y + 2);
  ok(on._kitHoverZone?.type === 'tab', 'X: hover czipa rozpoznany (podświetlenie)');
});

// ═══ F — wiersz zaznacza, „POKAŻ” leci (po bramce K7-A) ════════════════════════════════════════════════════════════
header('F  klik wiersza bez kamery; POKAŻ = plan z żywego statku per stan');
const focusLog = [];
EventBus.on('vessel:focus', (p) => focusLog.push(p?.vesselId));
safe('F row', () => {
  const ov = mk(); draw(ov);
  const z = ov._hitZones.find((q) => q.type === 'vessel' && q.data.vesselId === 'v_0');
  ok(!!z, 'F: świadek — strefa wiersza');
  focusLog.length = 0;
  if (z) ov._handleHit(z);
  ok(ov._selectedVesselId === 'v_0', 'F: klik wiersza zaznacza');
  ok(focusLog.length === 0, `F: klik wiersza NIE emituje vessel:focus (${focusLog.join()})`);
  // świadek (zamiast dawnej kontroli OFF): ten sam nasłuch widzi vessel:focus z „POKAŻ” tego wiersza
  const f = ov._hitZones.find((q) => q.type === 'registryFocus' && q.data.vesselId === 'v_0');
  focusLog.length = 0;
  if (f) ov._handleHit(f);
  ok(focusLog.includes('v_0'), `F: świadek — „POKAŻ” tego wiersza emituje vessel:focus (${focusLog.join()})`);
});
safe('F plan', () => {
  const P = CL.focusPlan;
  ok(typeof P === 'function', 'F: świadek — focusPlan istnieje');
  if (typeof P !== 'function') return;
  const env = { activeSystemId: 'sys_home', canSwitch: (s) => s === 'sys_b', isStation: (id) => id === 'st_1', systemName: (s) => ({ sys_b: 'Barnard', sys_x: 'Xeno' })[s] ?? s, transitTarget: 'Barnard' };
  const dockP = P(mkVessel('a', 'A'), env);
  ok(dockP?.ok && dockP.target === 'body' && dockP.switchTo === null, 'F: dok przy ciele → ciało, bez przełączania');
  const dockS = P(mkVessel('a', 'A', { position: { state: 'docked', dockedAt: 'st_1' } }), env);
  ok(dockS?.ok && dockS.target === 'station', 'F: dok przy stacji → stacja');
  const orb = P(mkVessel('a', 'A', { position: { state: 'orbiting', dockedAt: 'p_home', x: 1, y: 1 } }), env);
  ok(orb?.ok && orb.target === 'ship', 'F: orbita → statek (śledzony)');
  const fly = P(mkVessel('a', 'A', { position: { state: 'in_transit', dockedAt: null, x: 5, y: 5 }, mission: { type: 'foreign_recon', scope: 'full_system' } }), env);
  ok(fly?.ok && fly.target === 'ship' && fly.switchTo === null, 'F: lot w układzie (także rozpoznanie) → statek');
  const oth = P(mkVessel('a', 'A', { systemId: 'sys_b', position: { state: 'orbiting', dockedAt: null, x: 5, y: 5 } }), env);
  ok(oth?.ok && oth.switchTo === 'sys_b' && oth.target === 'ship' && oth.reasonKey === 'cmdConsole.focusOther' && oth.args[0] === 'Barnard', 'F: inny układ → przełączenie + statek');
  const unk = P(mkVessel('a', 'A', { systemId: 'sys_x' }), env);
  ok(unk?.ok === false && unk.reasonKey === 'cmdConsole.focusNoSystem' && unk.args[0] === 'Xeno', 'F: nieotwieralny układ → powód z nazwą');
  const tr = P(mkVessel('a', 'A', { systemId: null, position: { state: 'in_transit' } }), env);
  ok(tr?.ok === false && tr.reasonKey === 'cmdConsole.focusTransit' && tr.args[0] === 'Barnard', 'F: tranzyt → powód z celem skoku');
  ok(P(mkVessel('a', 'A', { isWreck: true }), env) === null && P(null, env) === null, 'F: wrak / brak → bez POKAŻ');
  ok(P(mkVessel('a', 'A', { systemId: undefined }), env)?.switchTo === null, 'F: brak pola systemId = układ domowy (kanon)');
  for (const k of ['cmdConsole.focusDocked', 'cmdConsole.focusOther', 'cmdConsole.focusNoSystem', 'cmdConsole.focusTransit']) {
    ok(/\{0\}/.test(PL[k] ?? '') === /\{0\}/.test(EN[k] ?? '') && (PL[k] ?? '').length > 3 && (EN[k] ?? '').length > 3, `F: klucz ${k} PL + EN (te same argumenty)`);
  }
});
safe('F exec', () => {
  const vs = world();
  vs.push(mkVessel('v_far', 'Daleki', { systemId: 'sys_b', position: { state: 'orbiting', dockedAt: null, x: 5, y: 5 } }));
  const ov = mk({ vessels: vs }); draw(ov);
  const seq = [];
  let refuse = false;
  window.KOSMOS.uiManager.overlayManager = { closeActive: () => seq.push('close') };
  window.KOSMOS.starSystemManager.switchActiveSystem = (sid) => { seq.push(`switch:${sid}`); return !refuse; };
  window.KOSMOS.starSystemManager._systems = new Map([['sys_home', {}], ['sys_b', {}]]);
  const sub = (p) => seq.push(`focus:${p?.vesselId}`);
  EventBus.on('vessel:focus', sub);
  const toasts = [];
  EventBus.on('ui:toast', (p) => toasts.push(p?.text));
  seq.length = 0;
  ov._handleHit(ov._hitZones.find((q) => q.type === 'registryFocus' && q.data.vesselId === 'v_0'));
  ok(seq.join() === 'close,focus:v_0' && ov._selectedVesselId === 'v_0', `F: POKAŻ w układzie → zamknij, zaznacz, kamera (${seq.join()})`);
  seq.length = 0;
  const far = ov._focusVesselKit?.('v_far');
  ok(seq.join() === 'close,switch:sys_b,focus:v_far', `F: POKAŻ w innym układzie → przełączenie przed kamerą (${seq.join()})`);
  ok(far?.switchTo === 'sys_b', 'F: plan wykonany = przełączenie na układ statku');
  seq.length = 0; refuse = true; toasts.length = 0;
  ov._focusVesselKit?.('v_far');
  ok(!seq.some((x) => x.startsWith('focus:')) && toasts.length === 1, `F: odmowa przełączenia → bez kamery, komunikat (${seq.join()})`);
  seq.length = 0; toasts.length = 0;
  ov._focusVesselKit?.('v_tr');
  ok(seq.length === 0 && toasts.length === 1 && !/\{0\}/.test(toasts[0] ?? ''), `F: tranzyt → bez akcji, komunikat z wypełnionym powodem (${toasts[0]})`);
  const z = ov._hitZones.find((q) => q.type === 'registryFocus' && q.data.vesselId === 'v_tr');
  ok(!z, 'F: tranzyt bez strefy POKAŻ (wyłączone z powodem)');
  // przez strefę z klatki: odmowa przełączenia = bez kamery; statek, który zmienił układ po narysowaniu — plan z żywego statku
  draw(ov);
  const zFar = ov._hitZones.find((q) => q.type === 'registryFocus' && q.data.vesselId === 'v_far');
  ok(!!zFar && zFar.data.systemId === 'sys_b', 'F: świadek — strefa POKAŻ statku z innego układu');
  seq.length = 0; refuse = true;
  if (zFar) ov._handleHit(zFar);
  ok(!seq.some((x) => x.startsWith('focus:')), `F: strefa + odmowa przełączenia → bez kamery (${seq.join()})`);
  refuse = false;
  const zMoved = ov._hitZones.find((q) => q.type === 'registryFocus' && q.data.vesselId === 'v_0');
  vs.find((v) => v.id === 'v_0').systemId = 'sys_b';   // statek przeskoczył po narysowaniu klatki
  seq.length = 0;
  if (zMoved) ov._handleHit(zMoved);
  ok(seq.join() === 'close,switch:sys_b,focus:v_0', `F: plan z żywego statku, nie z danych strefy (${seq.join()})`);
});

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
