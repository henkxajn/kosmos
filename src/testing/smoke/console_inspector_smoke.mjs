// ARC KONSOLE K7-B — keeper: inspektor statku / floty na konsoli Dowództwa (FEATURES.consoleCommand). Plan: docs/design/CONSOLES_PLAN.md (K7).
//
// Sekcje (każda degraduje, nie przerywa — symbole nowego kodu przez dynamiczny import):
//   I  dostępność akcji ON == OFF: strefy inspektora konsoli (`drawInspector`) == strefy dzisiejszego panelu `_drawRight`
//      dla stanów statku (20 stanów migawki T4 + uszkodzony, mało paliwa, inny układ) — te same typy i dane
//   W  integracja: pełny rysunek konsoli (flaga ON) z wybranym statkiem niesie strefy inspektora; OFF bez zmian
//   D  akcja niemożliwa = czip wyłączony z powodem i18n (PL + EN, bez surowych id), bez strefy
//   F  flota: strefy ON ⊇ OFF (`_drawRightFleet`), jedyny nowy typ = `fleetDisband`; anulowanie bez rozkazu z powodem
//   K  Finding 747: `fleetCreate` (lista „Floty”) i `fleetDisband` (inspektor floty) osiągalne na konsoli i trafiają do handlerów
//   M  podsumowanie zaznaczenia wielokrotnego: najwolniejszy / zasięg / najmniej paliwa + dzisiejsze akcje zbiorcze
//   R  kolumna ROLA: forma skrócona dla każdej roli (PL + EN), pełna nazwa w podpowiedzi
//   C  kolumny puste dla wszystkich widocznych wierszy — minimum, nigdy nie znikają
//   A  okna dialogowe (zmiana nazwy, rozbiórka, rozwiązanie floty, nowa flota) z prostokąta strefy konsoli przy 1600×1041
//      i 1280×833, bez `window.inner*` w handlerach; poza konsolą — dzisiejsze okno na środku
//   L  czysta logika (grupy akcji, podsumowanie grupy, przyrząd, kadłub, utrzymanie z konkretną naprawą, kotwica)
// Bez pinów na stałe rysunku.

import '../headless/env.js';   // MUSI być pierwszy
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import EntityManager from '../../core/EntityManager.js';
import { consoleRoles } from '../../ui/ConsoleRolesLogic.js';
import { ROLE_GLYPHS } from '../../ui/FleetPictureLogic.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const imp = async (p) => { try { return await import(p); } catch (e) { console.log(`  (${p} brak: ${e.message})`); return {}; } };
const IL = await imp('../../ui/CommandInspectorLogic.js');
const IV = await imp('../../ui/CommandInspectorView.js');
const CL = await imp('../../ui/CommandConsoleLogic.js');
const MA = await imp('../../ui/ModalAnchor.js');
const PL = (await import('../../i18n/pl.js')).pl ?? (await import('../../i18n/pl.js')).default ?? {};
const EN = (await import('../../i18n/en.js')).en ?? (await import('../../i18n/en.js')).default ?? {};
const { t } = await import('../../i18n/i18n.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s);
const safe = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log(`  ✗ FAIL: ${name} rzuciło: ${e.message}`); } };

const FEAT = GAME_CONFIG.FEATURES;
const AU = 100;

function mockCtx() {
  const log = [];
  return {
    log, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px mono', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    fillRect() {}, strokeRect() {}, clearRect() {},
    fillText(s, x, y) { log.push(String(s)); },
    beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {}, rect() {},
    setLineDash() {}, quadraticCurveTo() {}, bezierCurveTo() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    getTransform() { return { a: 1, d: 1 }; },
    measureText(s) { const px = parseFloat(String(this.font).replace(/^bold /, '')) || 10; return { width: String(s).length * px * 0.6 }; },
    createRadialGradient() { return { addColorStop() {} }; }, createLinearGradient() { return { addColorStop() {} }; }, drawImage() {},
  };
}

// ── Świat stanów statku (jak `ship_panel_hud_smoke` / migawka T4) ──────────────────────────────────────────────────
function world(vessel, extra = {}, more = []) {
  EntityManager.clear();
  const home = { id: 'p_home', type: 'planet', name: 'Nowa Ziemia', x: 1 * AU, y: 0, systemId: 'sys_home', orbital: { a: 1, e: 0, T: 1, M: 0 }, deposits: [], explored: true, analyzed: true, planetType: 'rocky' };
  const two = { id: 'p_two', type: 'planet', name: 'Wtora', x: 3 * AU, y: 0, systemId: 'sys_home', orbital: { a: 3, e: 0, T: 5, M: 0 }, deposits: [], explored: true, analyzed: true, planetType: 'rocky' };
  const far = { id: 'p_far', type: 'planet', name: 'Thuban b', x: 2 * AU, y: 0, systemId: 'sys_B', orbital: { a: 2, e: 0, T: 3, M: 0 }, deposits: [],
    explored: extra.farExplored ?? true, analyzed: extra.farAnalyzed ?? false, planetType: 'rocky' };
  for (const e of [home, two, far]) EntityManager.add(e);
  const vessels = new Map([[vessel.id, vessel], ...more.map((m) => [m.id, m])]);
  const colony = { planetId: 'p_home', name: 'Nowa Ziemia', isOutpost: false, buildingSystem: { hasSpaceport: () => true },
    resourceSystem: { inventory: new Map(), getAmount: () => 10, canAfford: () => true, spend: () => true, receive: () => {} }, civSystem: { freePops: 5 },
    planet: home, isHomePlanet: true, ownerEmpireId: null };
  const fleets = extra.fleets ?? [];
  let selV = vessel.id, selF = null;
  globalThis.window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home', homePlanet: home,
    vesselManager: { _vessels: vessels, getVessel: (id) => vessels.get(id), getAllVessels: () => [...vessels.values()],
      isImmobilized: () => !!extra.immob, getVesselUpkeepCredits: () => 300, getVesselBaseUpkeepCredits: () => 300,
      _findEntity: (id) => EntityManager.get(id), deployVessel: () => ({ ok: true }), withdrawVessel: () => ({ ok: true }), getVesselSensorRangeAU: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => (id === 'p_home' ? colony : null), getAllColonies: () => [colony],
      getPlayerColonies: () => [colony], isPlayerColony: () => true, _getShipyardLevel: () => (extra.noYard ? 0 : 1) },
    missionSystem: { getActive: () => extra.missions ?? [] },
    techSystem: { isResearched: (id) => !(extra.noRocketry && id === 'rocketry'), getShipSpeedMultiplier: () => 1, getMultiplier: () => 1, getFuelEfficiency: () => 1 },
    stationSystem: { getStationsAt: () => [], getAllStations: () => [] },
    starSystemManager: { activeSystemId: 'sys_home', getSystem: (id) => (id === 'sys_B' ? { id } : null),
      getAllSystems: () => [{ systemId: 'sys_home', galaxyStar: { name: 'Sol' } }, { systemId: 'sys_B', galaxyStar: { name: 'Thuban' } }] },
    fleetSystem: { getFleet: (id) => fleets.find((f) => f.id === id) ?? null, listFleets: () => fleets },
    civilianTradeSystem: { getTreasuryCredits: () => extra.treasury ?? 48 },
    poiRegistry: extra.poi ?? null,
    transportOrderSystem: extra.tos ?? null,
    intelSystem: { getVesselContact: () => ({ quality: 'full' }) },
    notificationCenter: { getActiveCount: () => 0 },
    deepSpaceCombatSystem: { _findActiveEncounterContaining: (id) => (extra.combat && id === vessel.id ? { id: 'e1' } : null) },
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
const inFlight = { state: 'in_transit', dockedAt: null, x: 2 * AU, y: 0 };
const STATES = {
  hangar:         () => ({ v: ship() }),
  dock_noyard:    () => ({ v: ship(), extra: { noYard: true } }),
  dock_colonists: () => ({ v: ship({ colonists: 3, colonistCapacity: 4, modules: ['engine_ion', 'habitat_pod'] }) }),
  orbit:          () => ({ v: ship({ position: { state: 'orbiting', dockedAt: 'p_two', x: 3 * AU, y: 0 } }) }),
  flight:         () => ({ v: ship({ name: 'Kurier', status: 'on_mission', position: { ...inFlight }, mission: { type: 'transport', targetId: 'p_two', phase: 'outbound' },
    cargo: { Fe: 120 }, cargoUsed: 120, movementOrder: { id: 'mo_1', type: 'moveToPoint', status: 'active', targetPoint: { x: 300, y: 40 } } }),
    extra: { missions: [{ vesselId: 'v_1', type: 'transport', targetId: 'p_two', status: 'transit', arrivalYear: 12.3, progressPct: 0.4, cargo: { Fe: 120 } }] } }),
  combat:         () => ({ v: ship({ name: 'Fregata', shipId: 'hull_frigate', status: 'on_mission', position: { state: 'orbiting', dockedAt: null, x: 2 * AU, y: 0 },
    modules: ['engine_ion', 'weapon_laser'], movementOrder: { id: 'mo_2', type: 'engage', status: 'active', targetEntityId: 'x_9' } }), extra: { combat: true } }),
  foreign_orbit:  () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { state: 'orbiting', dockedAt: 'p_far', x: 2 * AU, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far' }, cargoUsed: 50, cargo: { Fe: 50 }, modules: ['engine_ion', 'cargo_small', 'habitat_pod'] }) }),
  interstellar:   () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { state: 'orbiting', dockedAt: null, x: 2 * AU, y: 0 },
    mission: { type: 'interstellar_jump', phase: 'in_system', toSystemId: 'sys_B', targetName: 'Thuban' } }) }),
  foreign_recon:  () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { ...inFlight },
    mission: { type: 'foreign_recon', scope: 'full_system', targets: ['p_far'], currentIdx: 0, phase: 'scanning' } }) }),
  loop:           () => ({ v: ship({ status: 'on_mission', position: { ...inFlight } }),
    extra: { missions: [{ vesselId: 'v_1', type: 'transport', loop: true, loopSourceId: 'p_home', loopTargetId: 'p_two', status: 'waiting_reload', leg: 'outbound' }] } }),
  reserve:        () => ({ v: ship({ serviceState: 'stored' }) }),
  mobilizing:     () => ({ v: ship({ serviceState: 'mobilizing', mobilizeProgress: 0.4, mobilizeTarget: 'active' }) }),
  rally_none:     () => ({ v: ship(), extra: { poi: { listPOIs: () => [{ id: 'poi_1', name: 'Zbiórka', memberVesselIds: [] }] } } }),
  rally_member:   () => ({ v: ship(), extra: { poi: { listPOIs: () => [{ id: 'poi_1', name: 'Zbiórka', memberVesselIds: ['v_1'] }] } } }),
  pool:           () => ({ v: ship(), extra: { tos: { isInPool: () => true } }, features: { transportOrders: true } }),
  immobilized:    () => ({ v: ship({ position: { state: 'orbiting', dockedAt: 'p_two', x: 3 * AU, y: 0 }, unpaidYears: 2 }), extra: { immob: true } }),
  blocked:        () => ({ v: ship({ position: { ...inFlight }, movementOrder: { id: 'mo_3', type: 'pursue', status: 'blocked', blockReason: 'target_lost', targetEntityId: 'x_9' } }) }),
  config_select:  () => ({ v: ship(), cfg: { actionId: 'transport', targetId: null, step: 'select' } }),
  config_confirm: () => ({ v: ship(), cfg: { actionId: 'transport', targetId: 'p_two', step: 'confirm', repeat: true } }),
  config_home:    () => ({ v: ship(), cfg: { actionId: 'transport', targetId: 'p_home', step: 'confirm', repeat: true } }),
  // K7-B — stany z briefu ponad migawkę T4
  damaged:        () => ({ v: ship({ damaged: true, _repairProgress: 0.4 }) }),
  low_fuel:       () => ({ v: ship({ fuel: { current: 5, max: 60, consumption: 1 }, position: { state: 'orbiting', dockedAt: 'p_two', x: 3 * AU, y: 0 } }) }),
  other_system:   () => ({ v: ship({ systemId: 'sys_B', position: { state: 'orbiting', dockedAt: 'p_far', x: 2 * AU, y: 0 } }) }),
  foreign_unexplored: () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { state: 'orbiting', dockedAt: 'p_far', x: 2 * AU, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far' }, modules: ['engine_ion', 'cargo_small', 'habitat_pod'] }), extra: { farExplored: false } }),
  foreign_analyzed: () => ({ v: ship({ systemId: 'sys_B', status: 'on_mission', position: { state: 'orbiting', dockedAt: 'p_far', x: 2 * AU, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far' }, modules: ['engine_ion', 'cargo_small', 'habitat_pod'] }), extra: { farAnalyzed: true } }),
  pool_flight:    () => ({ v: ship({ status: 'on_mission', position: { ...inFlight } }), extra: { tos: { isInPool: () => false } }, features: { transportOrders: true } }),
};

const withFeat = (patch, fn) => { const saved = { ...FEAT }; Object.assign(FEAT, patch); try { return fn(); } finally { Object.assign(FEAT, saved); } };
const norm = (z) => {
  const d = { ...(z.data ?? {}) };
  if (d.vessel && typeof d.vessel === 'object') d.vessel = d.vessel.id;
  return `${z.type}|${JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => !['sliderX', 'sliderW'].includes(k)).sort()))}`;
};
const ms = (arr) => arr.map(norm).sort();

function scene(name) {
  const s = STATES[name]();
  world(s.v, s.extra ?? {});
  const ov = new FleetManagerOverlay();
  ov._selectedVesselId = s.v.id;
  ov._missionConfig = s.cfg ? { ...s.cfg } : null;
  return { s, ov };
}
const env = () => { const K = window.KOSMOS; return { vMgr: K.vesselManager, ms: K.missionSystem, colMgr: K.colonyManager, activePid: 'p_home' }; };
const BODY = { x: 900, y: 100, w: 294, h: 6000 };

function offZones(name) {
  const { s, ov } = scene(name);
  return withFeat(s.features ?? {}, () => {
    ov._hitZones = [];
    const e = env();
    ov._drawRight(mockCtx(), BODY.x, BODY.y, BODY.w, BODY.h, e.vMgr, e.ms, e.colMgr, e.activePid);
    return ov._hitZones.slice();
  });
}
function onDraw(name, setup = null) {
  const { s, ov } = scene(name);
  return withFeat(s.features ?? {}, () => {
    ov._hitZones = []; ov._cmdDisabled = []; ov._cmdTip = null;
    if (setup) setup(ov);
    const ctx = mockCtx();
    IV.drawInspector(ov, ctx, BODY, consoleRoles(), env());
    return { ov, zones: ov._hitZones.slice(), disabled: ov._cmdDisabled.slice(), ctx };
  });
}

// ═══ I — dostępność ON == OFF ═════════════════════════════════════════════════════════════════════════════════════
header('I  strefy inspektora konsoli == strefy panelu `_drawRight` (stany statku)');
for (const name of Object.keys(STATES)) {
  await safe(`I ${name}`, () => {
    const off = ms(offZones(name));
    const on = ms(onDraw(name).zones);
    ok(off.length > 0, `I ${name}: świadek — panel OFF ma strefy (${off.length})`);
    const missing = off.filter((k, i, a) => on.filter((q) => q === k).length < a.filter((q) => q === k).length);
    const extra = on.filter((k, i, a) => off.filter((q) => q === k).length < a.filter((q) => q === k).length);
    ok(missing.length === 0, `I ${name}: akcje OFF bez strefy na konsoli: ${[...new Set(missing)].join(' ; ')}`);
    ok(extra.length === 0, `I ${name}: strefy konsoli spoza panelu OFF: ${[...new Set(extra)].join(' ; ')}`);
  });
}

// ═══ W — integracja z pełnym rysunkiem konsoli ═══════════════════════════════════════════════════════════════════
header('W  pełny rysunek Dowództwa: inspektor konsoli ON, dzisiejszy panel OFF');
await safe('W', () => {
  for (const on of [true, false]) {
    const { ov } = scene('hangar');
    window.KOSMOS.uiManager.setSelectedVesselId('v_1');
    FEAT.consoleKit = true; FEAT.consoleCommand = on;
    ov._visible = true; ov._activeTab = 'tactical';
    const ctx = mockCtx();
    ov.draw(ctx, 1280, 833);
    const types = new Set(ov._hitZones.map((z) => z.type));
    ok(types.has('undock') && types.has('disband') && types.has('rename'), `W ${on ? 'ON' : 'OFF'}: strefy statku w rysunku (undock, disband, rename)`);
    const consoleText = ctx.log.some((s) => s === `[ ${t('cmdInsp.undock').toUpperCase()} ]`);
    ok(consoleText === on, `W ${on ? 'ON' : 'OFF'}: czip konsoli „${t('cmdInsp.undock')}” ${on ? 'jest' : 'nieobecny (dzisiejszy panel)'}`);
  }
  FEAT.consoleCommand = true;
});

// ═══ D — powody wyłączonych akcji ════════════════════════════════════════════════════════════════════════════════
header('D  czip wyłączony = powód i18n (PL + EN, bez surowych id), bez strefy');
const RAW = /\b[a-z]+_[a-z_]+\b|\b[a-z]+\.[a-z][A-Za-z]+\b/;
let disabledSeen = 0;
for (const name of Object.keys(STATES)) {
  await safe(`D ${name}`, () => {
    const { disabled, zones } = onDraw(name);
    for (const d of disabled) {
      disabledSeen++;
      if (d.reasonKey) {
        ok(typeof PL[d.reasonKey] === 'string' && typeof EN[d.reasonKey] === 'string', `D ${name}: powód ${d.reasonKey} w PL i EN`);
        const txt = t(d.reasonKey, ...(d.args ?? []));
        ok(txt !== d.reasonKey && !RAW.test(txt), `D ${name}: powód czytelny „${txt}”`);
      } else {
        ok(typeof d.text === 'string' && d.text.length > 3 && !RAW.test(d.text), `D ${name}: powód tekstem „${d.text}”`);
      }
      const inZone = zones.some((z) => z.x === d.rect.x && z.y === d.rect.y && z.w === d.rect.w);
      ok(!inZone, `D ${name}: czip wyłączony bez strefy trafień`);
    }
  });
}
ok(disabledSeen >= 10, `D świadek — czipów wyłączonych w stanach: ${disabledSeen}`);
await safe('D konkret', () => {
  const key = (name, id) => {
    const { disabled } = onDraw(name);
    return disabled.map((d) => d.reasonKey);
  };
  ok(key('flight').includes('cmdInsp.reasonRefuelDock'), 'D lot: tankowanie wyłączone — „zadokuj”');
  ok(key('dock_noyard').includes('cmdInsp.reasonScrapShipyard'), 'D dok bez stoczni: rozbiórka — „zbuduj stocznię”');
  ok(key('orbit').includes('cmdInsp.reasonScrapDock'), 'D orbita: rozbiórka — „zadokuj w kolonii ze stocznią”');
  const fl = onDraw('flight');
  ok(fl.ctx.log.includes(t('cmdInsp.noOrdersFlight')) && !fl.ctx.log.includes(t('fleet.noAvailableActions')),
    `D lot bez akcji misji, z logistyką: „${t('cmdInsp.noOrdersFlight')}” zamiast „${t('fleet.noAvailableActions')}”`);
  const im = onDraw('immobilized');
  const s = t('fleet.upkeepShortfall', 252);
  ok(im.ctx.log.some((q) => q.includes(s)), `D unieruchomiony: konkretna naprawa „${s}” w inspektorze`);
});

// ═══ F — flota ════════════════════════════════════════════════════════════════════════════════════════════════════
header('F  inspektor floty: ON ⊇ OFF, jedyny nowy typ `fleetDisband`');
const FLEET = { id: 'fl_a', name: 'Pierwsza', memberIds: ['v_1', 'v_2'], activeOrder: null, doctrine: 'retreat_at_50', retreatThreshold: 0.3 };
function fleetScene() {
  world(ship(), { fleets: [FLEET] }, [ship({ id: 'v_2', name: 'Druga', fuel: { current: 6, max: 60, consumption: 2 } })]);
  const ov = new FleetManagerOverlay();
  ov._selectedFleetId = 'fl_a'; ov._selectedVesselId = null;
  return ov;
}
await safe('F', () => {
  const off = fleetScene(); off._hitZones = [];
  off._drawRightFleet(mockCtx(), BODY.x, BODY.y, BODY.w, BODY.h, FLEET);
  const on = fleetScene(); on._hitZones = []; on._cmdDisabled = [];
  const ctx = mockCtx();
  IV.drawInspector(on, ctx, BODY, consoleRoles(), env());
  const so = ms(off._hitZones), sn = ms(on._hitZones);
  ok(so.length > 0, `F świadek — OFF ma strefy (${so.length})`);
  const missing = so.filter((k) => !sn.includes(k));
  ok(missing.length === 0, `F akcje floty OFF na konsoli: brak ${missing.join(' ; ')}`);
  const extraTypes = [...new Set(sn.filter((k) => !so.includes(k)).map((k) => k.split('|')[0]))];
  ok(extraTypes.length === 1 && extraTypes[0] === 'fleetDisband', `F nowe typy: ${extraTypes.join(',')} (oczekiwane: fleetDisband)`);
  ok(on._cmdDisabled.some((d) => d.reasonKey === 'cmdInsp.reasonNoFleetOrder'), 'F anulowanie bez rozkazu: wyłączone z powodem (dziś: brak strefy)');
  const all = ctx.log.join('');   // liczby kratki cyfr rysowane znak po znaku
  ok(all.includes('30.0 AU'), 'F podsumowanie: najmniejszy zasięg (v_2: 60/2 = 30 AU)');
  ok(all.includes('10%'), 'F podsumowanie: najmniej paliwa 10% (v_2 6/60)');
});

// ═══ K — Finding 747 ═════════════════════════════════════════════════════════════════════════════════════════════
header('K  Finding 747: nowa flota (lista) i rozwiązanie floty (inspektor) osiągalne i trafiają do handlerów');
await safe('K', () => {
  const ov = fleetScene();
  FEAT.consoleKit = true; FEAT.consoleCommand = true;
  ov._visible = true; ov._activeTab = 'tactical';
  ov.draw(mockCtx(), 1280, 833);
  const zc = ov._hitZones.find((z) => z.type === 'fleetCreate');
  const zd = ov._hitZones.find((z) => z.type === 'fleetDisband' && z.data?.fleetId === 'fl_a');
  ok(!!zc && !!ov.consoleZones && zc.x >= ov.consoleZones.list.x && zc.x < ov.consoleZones.list.x + ov.consoleZones.list.w,
    'K strefa `fleetCreate` w strefie listy konsoli');
  ok(!!zd && zd.x >= ov.consoleZones.inspector.x, 'K strefa `fleetDisband` w inspektorze floty');
  const calls = [];
  ov._handleCreateFleet = () => calls.push('create');
  ov._handleDisbandFleet = (id) => calls.push(`disband:${id}`);
  if (zc) ov.handleClick(zc.x + zc.w / 2, zc.y + zc.h / 2);
  if (zd) ov.handleClick(zd.x + zd.w / 2, zd.y + zd.h / 2);
  ok(calls.includes('create'), 'K klik [ + NOWA FLOTA ] → `_handleCreateFleet`');
  ok(calls.includes('disband:fl_a'), 'K klik [ ROZWIĄŻ FLOTĘ ] → `_handleDisbandFleet(fl_a)` (dzisiejsze potwierdzenie)');
});

// ═══ M — zaznaczenie wielokrotne ════════════════════════════════════════════════════════════════════════════════
header('M  podsumowanie zaznaczenia: najwolniejszy / zasięg / paliwo + akcje zbiorcze');
await safe('M', () => {
  world(ship(), {}, [ship({ id: 'v_2', name: 'Druga', fuel: { current: 6, max: 60, consumption: 2 } })]);
  const ov = new FleetManagerOverlay();
  FEAT.consoleKit = true; FEAT.consoleCommand = true;
  window.KOSMOS.uiManager.setSelectedVesselId(null);
  ov._selectedVesselId = null; ov._visible = true; ov._activeTab = 'tactical';
  ov._multiSelectedIds.add('v_1'); ov._multiSelectedIds.add('v_2');
  const ctx = mockCtx();
  ov.draw(ctx, 1280, 833);
  for (const k of ['cmdInsp.slowest', 'cmdInsp.minRange', 'cmdInsp.minFuel']) ok(ctx.log.some((q) => q === t(k)), `M wiersz „${t(k)}”`);
  ok(ctx.log.join('').includes('10%'), 'M najmniej paliwa = 10%');
  const types = new Set(ov._hitZones.map((z) => z.type));
  ok(types.has('fleetAssignMenuOpen') && types.has('fleetClearMultiSelect'), 'M akcje zbiorcze zostają');
});

// ═══ R — forma skrócona roli ════════════════════════════════════════════════════════════════════════════════════
header('R  kolumna ROLA: forma skrócona dla każdej roli');
await safe('R', () => {
  const roles = new Set([...Object.keys(ROLE_GLYPHS).filter((r) => r !== 'station'), 'envoy']);
  ok(roles.size >= 8, `R świadek — ról: ${roles.size}`);
  for (const r of roles) {
    ok(CL.ROLE_SHORT_IDS?.includes(r), `R rola ${r} w katalogu formy skróconej`);
    for (const [lang, D] of [['PL', PL], ['EN', EN]]) {
      const tag = D[`cmdConsole.roleTag.${r}`];
      ok(typeof tag === 'string' && tag.length >= 2 && tag.length <= 4, `R ${lang} ${r}: znacznik „${tag}” (2–4 znaki)`);
    }
    const s = CL.roleShort?.(r, t);
    ok(!!s && s.text.startsWith(CL.ROLE_SHORT_GLYPHS[r]) && s.full.length > s.tag.length && !RAW.test(s.full), `R ${r}: „${s?.text}” / „${s?.full}”`);
  }
  ok(PL['cmdConsole.roleTag.scout'] === 'ZWD', 'R zwiadowca: „ZWD” (decyzja właściciela po bramce K7-B)');
  ok(CL.roleShort?.(null, t)?.text === '—' && CL.roleShort?.('zzz_unknown', t)?.text === '—', 'R rola nieznana → kreska (bez surowego id)');
});

// ═══ C — kolumny puste ═════════════════════════════════════════════════════════════════════════════════════════
header('C  kolumny puste dla wszystkich widocznych wierszy → minimum, nie znikają');
await safe('C', () => {
  const rows = [{ kind: 'own', name: 'a', role: 'cargo', eta: null, alertCount: 0, fleetName: null, fromName: null, toName: null, stateKey: 'x', activityKey: 'y', fuelPct: 0.5 },
    { kind: 'own', name: 'b', role: 'cargo', eta: { year: 12 }, alertCount: 0, fleetName: 'F', fromName: null, toName: null, stateKey: 'x', activityKey: null, fuelPct: 0.5 }];
  const e = CL.emptyColumnIds(rows);
  ok(e.has('alerts') && e.has('from') && e.has('to') && !e.has('eta') && !e.has('fleet') && !e.has('activity'), `C puste: ${[...e].join(',')}`);
  ok(CL.emptyColumnIds([]).size === 0, 'C pusta tabela → nic nie zwężamy');
  const base = CL.registryColumnLayout(0, 760);
  const sh = CL.registryColumnLayout(0, 760, { shrink: e });
  ok(sh.cols.length === base.cols.length, `C liczba kolumn bez zmian (${sh.cols.length})`);
  for (const id of e) {
    const c = sh.cols.find((q) => q.id === id);
    ok(c && c.w > 0 && c.w <= CL.CMD_TABLE.MIN_COL_W, `C ${id}: ${c?.w}px (minimum, nie zero)`);
  }
  const nm = (l) => l.cols.find((q) => q.id === 'name').w;
  ok(nm(sh) > nm(base), `C zwolnione miejsce idzie do nazwy (${nm(base)} → ${nm(sh)})`);
  const last = sh.cols[sh.cols.length - 1];
  ok(last.x + last.w <= 760 - CL.CMD_TABLE.FOCUS_W + 1, 'C tabela mieści się w szerokości');
});

// ═══ A — okna dialogowe z prostokąta strefy ═════════════════════════════════════════════════════════════════════
header('A  okna dialogowe z `consoleZones` przy 1600×1041 i 1280×833 (bez window.inner* w handlerach)');
const realStyleDom = () => {
  const ce = document.createElement;
  document.createElement = (tag) => { const el = ce(tag); el.style = {}; return el; };
  return () => { document.createElement = ce; };
};
const lastOverlay = () => document.body.children[document.body.children.length - 1];
for (const [iw, ih, sc] of [[1600, 1041, 1.25], [1280, 833, 1]]) {
  await safe(`A ${iw}`, async () => {
    globalThis.innerWidth = iw; globalThis.innerHeight = ih;
    const restore = realStyleDom();
    try {
      const ov = fleetScene();
      FEAT.consoleKit = true; FEAT.consoleCommand = true;
      ov._visible = true; ov._activeTab = 'tactical';
      ov.draw(mockCtx(), Math.round(iw / sc), Math.round(ih / sc));
      const z = ov.consoleZones;
      globalThis.innerWidth = 333; globalThis.innerHeight = 222;   // handler nie może czytać okna
      const cases = [
        ['rozwiązanie floty', () => ov._handleDisbandFleet('fl_a'), z.inspector],
        ['zmiana nazwy floty', () => ov._handleRenameFleet('fl_a'), z.inspector],
        ['zmiana nazwy statku', () => ov._renameVessel('v_1'), z.inspector],
        ['rozbiórka statku', () => ov._confirmVesselDisband(window.KOSMOS.vesselManager.getVessel('v_1')), z.inspector],
        ['nowa flota', () => ov._handleCreateFleet(), z.list],
      ];
      for (const [label, open, rect] of cases) {
        const n0 = document.body.children.length;
        open();
        for (let i = 0; i < 20 && document.body.children.length === n0; i++) await new Promise((r) => setTimeout(r, 5));
        const o = lastOverlay();
        const panel = o?.children?.[0];
        ok(document.body.children.length > n0 && !!panel, `A ${iw} ${label}: okno otwarte`);
        if (!panel) continue;
        const exp = IL.dialogAnchorCss(rect, sc, { frame: z.frame, dy: 22 });
        const px = (v) => parseFloat(v);
        ok(panel.style.position === 'absolute' && px(panel.style.left) === exp.left && px(panel.style.top) === exp.top && px(panel.style.width) === exp.width,
          `A ${iw} ${label}: panel w (${panel.style.left}, ${panel.style.top}, ${panel.style.width}) = strefa × ${sc} (${exp.left}, ${exp.top}, ${exp.width})`);
        ok(exp.left + exp.width <= iw && exp.top < ih && exp.left >= 0, `A ${iw} ${label}: okno w oknie przeglądarki`);
        document.body.removeChild(o);
      }
      // poza konsolą (flaga OFF) — dzisiejsze okno na środku
      FEAT.consoleCommand = false;
      ok(ov._dialogAnchor('inspector') === null, `A ${iw} flaga OFF: brak kotwicy (okno na środku jak dziś)`);
      FEAT.consoleCommand = true;
      ov._activeTab = 'atlas';
      ok(ov._dialogAnchor('inspector') === null, `A ${iw} inna zakładka: brak kotwicy`);
    } finally { restore(); }
  });
}
await safe('A źródło', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../../ui/FleetManagerOverlay.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const body = (name) => { const i = src.indexOf(`  ${name}(`); const j = src.indexOf('\n  }\n', i); return i >= 0 ? src.slice(i, j) : ''; };
  for (const fn of ['_dialogAnchor', 'async _handleDisbandFleet', 'async _handleRenameFleet', 'async _renameVessel', 'async _confirmVesselDisband', 'async _handleCreateFleet']) {
    const b = body(fn);
    ok(b.length > 0, `A źródło: świadek ${fn}`);
    ok(!/window\.inner|innerWidth|innerHeight/.test(b), `A źródło: ${fn} bez window.inner*`);
  }
  const a = { left: 10, top: 20, width: 300 };
  const ov1 = { style: {} }, p1 = { style: {} };
  ok(MA.applyModalAnchor?.(ov1, p1, a) === true && p1.style.left === '10px' && ov1.style.justifyContent === 'flex-start', 'A applyModalAnchor: panel na kotwicy');
  const ov2 = { style: {} }, p2 = { style: {} };
  ok(MA.applyModalAnchor?.(ov2, p2, null) === false && Object.keys(p2.style).length === 0 && Object.keys(ov2.style).length === 0,
    'A applyModalAnchor bez kotwicy: style nietknięte (okno jak dziś)');
});

// ═══ L — czysta logika ═════════════════════════════════════════════════════════════════════════════════════════
header('L  czysta logika inspektora');
await safe('L', () => {
  const u = IL.upkeepLines({ upkeep: 300, unpaid: 2, treasury: 48, immobilized: true });
  ok(u.alert && u.lines.some((l) => l.key === 'fleet.upkeepShortfall' && l.args[0] === 252 && l.tone === 'alert'), 'L utrzymanie: brakuje 252 Kr (alert)');
  ok(IL.upkeepLines({ upkeep: 300, unpaid: 1, treasury: 5000 }).lines.some((l) => l.key === 'fleet.arrearsClearsSoon'), 'L utrzymanie: skarbiec wystarcza → kara zejdzie');
  ok(IL.upkeepLines({ upkeep: 300 }).alert === false, 'L utrzymanie bez zaległości: bez alarmu');
  ok(IL.meter(5, 60)?.tone === 'alert' && IL.meter(40, 60)?.tone === 'primary' && IL.meter(1, 0) === null, 'L przyrząd: próg 20 %, brak maks. → null');
  ok(IL.hullState({ damaged: false }).key === 'cmdInsp.hullOk' && IL.hullState({ damaged: true, _repairProgress: 0.5 }).key === 'cmdInsp.hullRepair', 'L kadłub');
  const gs = IL.groupStats([{ speedAU: 2, rangeAU: 30, fuelPct: 0.1 }, { speedAU: 1.5, rangeAU: 60, fuelPct: 0.6 }], 3);
  ok(gs.slowestSpeed === 1.5 && gs.minRange === 30 && gs.minFuelPct === 0.1 && gs.lowFuel === 1 && gs.count === 3 && gs.present === 2, 'L podsumowanie grupy');
  const g = IL.shipActionGroups({ vesselId: 'v', docked: true, dockedAt: 'p', actions: [], canDisband: false, hasShipyard: false, refuelAuto: true });
  ok(g.primary[0]?.zone?.type === 'undock' && g.destructive[0]?.zone === null && g.destructive[0]?.reasonKey === 'cmdInsp.reasonScrapShipyard', 'L grupy: start w głównych, rozbiórka na końcu z powodem');
  ok(IL.SHIP_ACTION_GROUPS.join() === 'primary,orders,logistics,destructive', 'L kolejność grup');
  ok(IL.noOrdersKey?.('in_transit', 0, 3) === 'cmdInsp.noOrdersFlight' && IL.noOrdersKey?.('orbiting', 0, 1) === 'cmdInsp.noOrdersOrbit'
    && IL.noOrdersKey?.('docked', 0, 1) === 'cmdInsp.noOrdersDock' && IL.noOrdersKey?.('weird', 0, 1) === 'cmdInsp.noOrdersState'
    && IL.noOrdersKey?.('in_transit', 0, 0) === 'fleet.noAvailableActions' && IL.noOrdersKey?.('docked', 2, 3) === null, 'L linia „brak rozkazów” wg stanu');
  for (const k of ['cmdInsp.noOrdersFlight', 'cmdInsp.noOrdersOrbit', 'cmdInsp.noOrdersDock', 'cmdInsp.noOrdersState']) ok(!!PL[k] && !!EN[k], `L ${k} w PL i EN`);
  const fg = IL.fleetActionGroups({ fleetId: 'f', hasOrder: true, engagePick: false });
  ok(fg.orders.every((c) => c.zone?.data?.fleetId === 'f') && fg.destructive[0].zone.type === 'fleetDisband', 'L flota: rozkazy + rozwiązanie');
  const an = IL.dialogAnchorCss({ x: 1000, y: 100, w: 300, h: 500 }, 1.25, { frame: { x: 0, y: 0, w: 1280, h: 833 }, dy: 22 });
  ok(an.left === 1225 && an.top === 153 && an.width === 375, `L kotwica dociągnięta do prawej krawędzi ramy (980 × 1.25): ${JSON.stringify(an)}`);
});

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
