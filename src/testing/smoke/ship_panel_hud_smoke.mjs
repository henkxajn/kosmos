// ═══════════════════════════════════════════════════════════════════════════════
// ship_panel_hud_smoke — KEEPER REFORMY ZAKŁADEK, T5 (panel statku w idiomie etykiet przy prawym outlinerze)
// Rejestr: `docs/design/TABS_REFORM_PLAN.md` §5.8 (decyzje właściciela 2026-10-26); Finding 530.
// ─────────────────────────────────────────────────────────────────────────────
// Wyłącznie LOGIKA (protokół `HUD_PLAN.md` §4.0, aneks 2026-10-23): zbiór akcji, handlery, stany nieaktywne, strefy kliku,
// akordeon, konfigurator, kotwica T3, łamanie nazwy, 530, budżet. Bez pinów na stałych rysunku (szerokość, odstępy,
// krycie — strojenie okiem; piny czytają `SHIP_PANEL_HUD` symbolicznie). WYKONANIE: prawdziwy `FleetManagerOverlay` (panel
// T3 `drawVesselPanel` — źródło prawdy zbioru stref i dyspozycji), prawdziwy `ShipPanelHudLayer` (rysunek na atrapie ctx,
// prawdziwe kliki), prawdziwy `Outliner` (kotwica przy wierszu), prawdziwe `HudLabelLayer` / `HudLayer` (530); metody
// `UIManager` i `GameScene` (nie importują się pod node — THREE) wycięte ze źródła (komentarze zdjęte) i wykonane z atrapą
// `this`.
//
// PINY:
//   H0  moduły (flaga kroku `shipPanelHud` i flagi, na których stała — na stałe ON od T4: predykaty i klucze usunięte)
//   H1  ZBIÓR AKCJI ON = OFF: strefy panelu T5 ≡ strefy panelu T3 (`drawVesselPanel`, wysokość bez przycinania) co do typu
//       i danych — 20 stanów (hangar, dok bez stoczni, koloniści, orbita, lot, walka, obca orbita, przylot międzygwiezdny,
//       rekon obcy, pętla, rezerwa, mobilizacja, rally ×2, pula, unieruchomiony, blokada, konfigurator ×3); pokrycie 31 typów
//   H2  KAŻDY CHIP → TEN SAM HANDLER: prawdziwy klik w każdą strefę panelu T3 (`handleVesselPanelClick`) i w każdy chip
//       panelu T5 (`handleClick`, rozkazy po rozwinięciu) daje te same wywołania `_handleHit` / `_handleVesselPanelFooter`
//   H3  STANY NIEAKTYWNE zgodne z dziś: chip przygaszony ⇔ panel T3 bez strefy; klik w przygaszony — nic
//   H4  STREFY KLIKU: chip > nazwa > pasek (pochłania) > mapa; nazwa = reguła D-UI-5 (`vessel:focus`); ✎; okno DOM;
//       `UIManager._vesselPanelClick` / `_vesselPanelHit` / `_detectHoverBtn` (rączka) — prostokąt panelu T5
//   H5  AKORDEON „[ Rozkazy ▼ ]”: jedna lista, otwarcie / zamknięcie, zwinięcie przy zmianie zaznaczenia (także A → nic → A)
//   H6  KONFIGURATOR: szerokość `W_CONFIG` w kroku wyboru celu i potwierdzenia, powrót do `W`; cel zniknął — konfigurator zdjęty;
//       zachowanie 9 (PASS, Finding 546) — zmiana zaznaczenia zdejmuje konfigurator (Rejestr — bez zmian)
//   H7  KOTWICA T3 BEZ ZMIAN (prawdziwy Outliner, wycięte `_drawShipPanelHud` / `_shipPanelAtOutliner`): prawa krawędź = lewa
//       krawędź kolumny, górna = wiersz, łącznik; zapas (kolumna schowana); klamra wysokości; lista przewijana, nie panel
//   H8  ŁAMANIE NAZWY: nazwa ≤ 30 znaków (okno zmiany nazwy) — ≤ 2 linie, bez „…”, pełna treść; font proporcjonalny
//   H9  530: dymek współrzędnych nie nad UI (`isOverUI` + strefy HUD) — z warstwą etykiet HUD i bez niej
//   H10 panel T5 jedyną powierzchnią statku nad mapą: nienarysowany (`clear`) — klik i trafienie nie idą do dawnego panelu
//       T3; przeszkoda etykiet HUD — wyłącznie prostokąt panelu T5
//   H11 BUDŻET: powtórna klatka bez pomiaru tekstu; jeden model na klatkę; panel nienarysowany — bez stref
//   H12 STROJENIE 1 (Finding 556) — PL „⛽ Tankuj”, „🗑 Rozbiórka — wymaga stoczni” (bez angielskich słów); EN bez zmian
//
// ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): flagi kroków na stałe ON — H0c–H0e (flaga)
//   zastąpione pinem braku predykatów i kluczy; H6g / H6j bez połowy OFF; H9b — stany warstwy etykiet HUD (`hudLabels`)
//   zamiast `labelHover` × `shipPanelHud`; H10 (OFF = T3) przecelowany na „panel T5 jedyną powierzchnią”; H11d — bramka bez
//   `_vesselPanelBounds`. H1 / H2 / H3 (panel T3 jako wyrocznia zbioru stref i dyspozycji) — bez zmian do kolejnego kroku T4.
//   T4-2 (karta ciała i panel stacji usunięte): H11d — wynik rysunku panelu T5 bez zapisu przeszkody kart (`shipPanelHudDrawn`).
// ⚠ Moduły POWSTAJĄ w T5 — import dynamiczny w try/catch (pin DEGRADUJE, nie przerywa suity).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { setLocale, t } from '../../i18n/i18n.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { COSMIC } from '../../config/LayoutConfig.js';
import { THEME } from '../../config/ThemeConfig.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { getMapInsets } from '../../ui/MapInsets.js';
import * as SPA from '../../ui/ShipPanelAnchorLogic.js';
import * as CI from '../../ui/ClickIntentLogic.js';
import { worldToGameplay } from '../../utils/CoordTransform.js';

let L = null, Y = null, OL = null, LO = null, HLL = null, HL = null;
try { L = await import('../../ui/ShipPanelHudLogic.js'); } catch { /* fail-first: piny padną */ }
try { Y = await import('../../ui/ShipPanelHudLayer.js'); } catch { /* fail-first */ }
try { OL = await import('../../ui/Outliner.js'); } catch { /* piny padną */ }
try { LO = await import('../../ui/LeftOutliner.js'); } catch { /* piny padną */ }
try { HLL = await import('../../ui/HudLabelLayer.js'); } catch { /* piny padną */ }
try { HL = await import('../../ui/HudLayer.js'); } catch { /* piny padną */ }

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
const compileMethod = (code, name, scope = {}) => {
  const b = body(code, `  ${name}(`);
  return b ? compileWith('function ' + b.trim().slice(name.length), scope) : null;
};
const call = (fn, self, ...a) => { try { return fn ? fn.apply(self, a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
const FEATURES = GAME_CONFIG.FEATURES;
// Stałe rysunku czytane symbolicznie (bez pinów na wartościach); brak modułu (fail-first) — NaN: porównania szerokości padają.
const S = L?.SHIP_PANEL_HUD ?? { W: NaN, W_CONFIG: NaN };
const AU = GAME_CONFIG.AU_TO_PX;

setLocale('pl');

// Atrapa ctx z pomiarem z rozmiaru fontu (0,6 em na znak — font o stałej szerokości) i zapisem napisów.
const recCtx = ({ prop = false } = {}) => {
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
        // font proporcjonalny (H8 — kratka cyfr): szerokość znaku zależna od znaku (cyfry różne)
        const w = prop ? [...String(s)].reduce((a, c) => a + px * (/[0-9]/.test(c) ? 0.45 + 0.03 * Number(c) : /[il.,:;'| ]/.test(c) ? 0.28 : /[mwMW]/.test(c) ? 0.8 : 0.5), 0)
          : [...String(s)].length * px * 0.6;
        return { width: w };
      };
      if (k === 'fillText') return (s, x, y) => calls.text.push({ s: String(s), x, y, fillStyle });
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'font') font = v; else if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};

// ── Świat (stany statku jak w panelu T3) ──────────────────────────────────────────────────────────────────────────
const evs = [];
for (const ev of ['vessel:focus', 'body:selected', 'station:selected']) EventBus.on(ev, (p) => evs.push([ev, p]));
let SEL = [];
function world(vessel, extra = {}) {
  EntityManager.clear();
  const home = { id: 'p_home', type: 'planet', name: 'Nowa Ziemia', x: 1 * AU, y: 0, systemId: 'sys_home', orbital: { a: 1, e: 0, T: 1, M: 0 }, deposits: [], explored: true, analyzed: true, planetType: 'rocky' };
  const two = { id: 'p_two', type: 'planet', name: 'Wtora', x: 3 * AU, y: 0, systemId: 'sys_home', orbital: { a: 3, e: 0, T: 5, M: 0 }, deposits: [], explored: true, analyzed: true, planetType: 'rocky' };
  const far = { id: 'p_far', type: 'planet', name: 'Thuban b', x: 2 * AU, y: 0, systemId: 'sys_B', orbital: { a: 2, e: 0, T: 3, M: 0 }, deposits: [],
    explored: extra.farExplored ?? true, analyzed: extra.farAnalyzed ?? false, planetType: 'rocky' };
  for (const e of [home, two, far]) EntityManager.add(e);
  const vessels = new Map([[vessel.id, vessel]]);
  const colony = { planetId: 'p_home', name: 'Nowa Ziemia', isOutpost: false, buildingSystem: { hasSpaceport: () => true },
    resourceSystem: { inventory: new Map(), getAmount: () => 10, canAfford: () => true, spend: () => true, receive: () => {} }, civSystem: { freePops: 5 },
    planet: home, isHomePlanet: true, ownerEmpireId: null };
  SEL = [vessel.id];
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
    starSystemManager: { activeSystemId: 'sys_home', getSystem: (id) => (id === 'sys_B' ? { id } : null) },
    fleetSystem: { getFleet: () => null, listFleets: () => [] },
    poiRegistry: extra.poi ?? null,
    transportOrderSystem: extra.tos ?? null,
    deepSpaceCombatSystem: { _findActiveEncounterContaining: (id) => (extra.combat && id === vessel.id ? { id: 'e1' } : null) },
    uiManager: { _dirty: false, _selectedEntity: null, getSelectedVesselId: () => SEL[0] ?? null, getSelectedVesselIds: () => [...SEL], getSelectedFleetId: () => null },
    threeRenderer: { _pingedEnemyId: null },
  };
  return { home, colony };
}
const ship = (o = {}) => ({
  id: 'v_1', name: 'Fracht III', shipId: 'hull_medium', systemId: 'sys_home', colonyId: 'p_home', homeColonyId: 'p_home', status: 'idle',
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
  immobilized:    () => ({ v: ship({ position: { state: 'orbiting', dockedAt: 'p_two', x: 3 * AU, y: 0 } }), extra: { immob: true } }),
  blocked:        () => ({ v: ship({ position: { ...inFlight }, movementOrder: { id: 'mo_3', type: 'pursue', status: 'blocked', blockReason: 'target_lost', targetEntityId: 'x_9' } }) }),
  config_select:  () => ({ v: ship(), cfg: { actionId: 'transport', targetId: null, step: 'select' } }),
  config_confirm: () => ({ v: ship(), cfg: { actionId: 'transport', targetId: 'p_two', step: 'confirm', repeat: true } }),
  config_home:    () => ({ v: ship(), cfg: { actionId: 'transport', targetId: 'p_home', step: 'confirm', repeat: true } }),
};
/** Stan gotowy do pomiaru: świat, flagi, FMO z konfiguratorem. */
function scene(name) {
  const s = STATES[name]();
  world(s.v, s.extra ?? {});
  const feat = { ...FEATURES, ...(s.features ?? {}) };
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = s.v.id;
  fmo._missionConfig = s.cfg ? { ...s.cfg } : null;
  return { s, feat, fmo };
}
/** Strefy panelu T3 (prawdziwy `drawVesselPanel`, wysokość bez przycinania — cała treść). */
function t3Zones(fmo) {
  fmo.drawVesselPanel(recCtx(), 0, 0, 300, 6000, { compact: true });
  return [...fmo._hitZones];
}
const keys = (zs) => zs.map((z) => L?.zoneKey?.(z) ?? '?').sort();
const sameMultiset = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withFeatures = (feat, fn) => { const saved = { ...FEATURES }; Object.assign(FEATURES, feat); try { return fn(); } finally { for (const k of Object.keys(FEATURES)) if (!(k in saved)) delete FEATURES[k]; Object.assign(FEATURES, saved); } };
/** Panel T5: model, układ i rysunek na atrapie w prostokącie (930, 60). */
function t5Panel(fmo, vid, { open = false, maxH = 600, ctx = recCtx(), layer = null, feat = FEATURES } = {}) {
  const lay = layer ?? (Y ? new Y.ShipPanelHudLayer() : null);
  if (!lay) return null;
  if (open) lay._open = L.toggleOrders(lay._open, vid);
  const sz = lay.prepare({ ctx, K: globalThis.window.KOSMOS, fmo, vesselId: vid, maxH, features: feat });
  if (sz) lay.draw(ctx, { x: 930, y: 60, w: sz.w, h: sz.h }, {});
  return { lay, sz, ctx };
}
const mid = (z) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });
/** Szpieg dyspozycji FMO: `_handleHit` i `_handleVesselPanelFooter` — zapis bez wykonania. */
const spyFmo = (fmo) => { const rec = []; fmo._handleHit = (z) => rec.push('hit|' + L?.zoneKey?.(z)); fmo._handleVesselPanelFooter = (z) => rec.push('footer|' + L?.zoneKey?.(z)); return rec; };

// ═══ H0 ═══════════════════════════════════════════════════════════════════════
header('H0  moduły (flagi kroków na stałe ON od T4)');
{
  const API = ['SHIP_PANEL_HUD', 'SHIP_PANEL_ZONE_TYPES', 'FOOTER_ZONE_TYPES', 'buildShipPanelModel',
    'modelZones', 'zoneKey', 'wrapText', 'wrapName', 'layoutChipRows', 'toggleOrders', 'ordersOpen', 'shipPanelHitAt', 'runShipPanelAction', 'coordTooltipBlocked'];
  ok(!!L && API.every((k) => k in L), `H0a ShipPanelHudLogic eksportuje: ${API.join(', ')}`);
  ok(typeof Y?.ShipPanelHudLayer === 'function', 'H0b ShipPanelHudLayer — klasa renderera');
  const gone = ['shipPanelHud', 'shipPanelOutliner', 'mapVesselPanel', 'mapVesselPanelCompact'];
  const cfgSrc = src('../../config/GameConfig.js');
  ok(!!L && L.isShipPanelHudOn === undefined && L.isShipPanelHudActive === undefined && gone.every((k) => FEATURES[k] === undefined)
    && gone.every((k) => !new RegExp('\\b' + k + ':\\s*(true|false)').test(cfgSrc)),
    'H0c flagi `shipPanelHud`, `shipPanelOutliner`, `mapVesselPanel`, `mapVesselPanelCompact` na stałe ON (T4) — predykaty i klucze usunięte');
  ok((L?.SHIP_PANEL_ZONE_TYPES?.length ?? 0) === 31 && new Set(L?.SHIP_PANEL_ZONE_TYPES ?? []).size === 31, 'H0f 31 typów stref panelu statku (inwentarz I2 §3.3), bez powtórzeń');
}

// ═══ H1 ═══════════════════════════════════════════════════════════════════════
header('H1  zbiór akcji ON = OFF — strefy panelu T5 ≡ strefy panelu T3 (typ + dane) w każdym stanie');
const T3_TYPES = new Set();
{
  const sigs = new Set();
  for (const name of Object.keys(STATES)) {
    const { s, feat, fmo } = scene(name);
    const z3 = withFeatures(feat, () => t3Zones(fmo));
    fmo._missionConfig = s.cfg ? { ...s.cfg } : null;
    const m = L?.buildShipPanelModel?.(s.v, { K: globalThis.window.KOSMOS, fmo, features: feat });
    const z5 = L?.modelZones?.(m) ?? [];
    for (const z of z3) T3_TYPES.add(z.type);
    sigs.add(JSON.stringify(keys(z3)));
    ok(z3.length > 0 && sameMultiset(keys(z3), keys(z5)), `H1 ${name.padEnd(15)} — ${z3.length} stref T3 = ${z5.length} stref T5`);
  }
  ok(sigs.size >= 15, `H1-k KONTROLA: stany dają RÓŻNE zbiory stref (${sigs.size} różnych na ${Object.keys(STATES).length}) — porównanie nie jest jałowe`);
  const missing = (L?.SHIP_PANEL_ZONE_TYPES ?? []).filter((x) => !T3_TYPES.has(x));
  ok(missing.length === 0 && T3_TYPES.size === 31, `H1-p pokrycie: stany ćwiczą wszystkie 31 typów stref panelu T3 (brak: ${missing.join(', ') || '—'})`);
  // KONTROLA czułości: model bez rozbiórki (mutacja stanu) — porównanie łapie różnicę.
  const { s, feat, fmo } = scene('hangar');
  const z3 = withFeatures(feat, () => t3Zones(fmo));
  const m = L?.buildShipPanelModel?.(s.v, { K: globalThis.window.KOSMOS, fmo, features: feat });
  if (m) m.chips = m.chips.filter((c) => c.id !== 'disband');
  ok(!sameMultiset(keys(z3), keys(L?.modelZones?.(m) ?? [])), 'H1-c KONTROLA: model bez jednego chipa (rozbiórka) — porównanie zgłasza różnicę');
  // Wróg i wrak — bez panelu (jak `drawVesselPanel`)
  ok(L?.buildShipPanelModel?.(ship({ isWreck: true }), { K: globalThis.window.KOSMOS, fmo }) === null
    && L?.buildShipPanelModel?.(ship({ ownerEmpireId: 'emp_001' }), { K: globalThis.window.KOSMOS, fmo }) === null
    && L?.buildShipPanelModel?.(null, { K: globalThis.window.KOSMOS, fmo }) === null, 'H1-w wrak, wróg i brak statku — bez panelu (D-MVP-12)');
}

// ═══ H2 ═══════════════════════════════════════════════════════════════════════
header('H2  każdy chip → ten sam handler co przycisk panelu T3 (prawdziwe kliki obu paneli)');
{
  for (const name of Object.keys(STATES)) {
    const { s, feat, fmo } = scene(name);
    // T3: klik w środek każdej strefy panelu T3 (prawdziwy `handleVesselPanelClick`)
    const z3 = withFeatures(feat, () => t3Zones(fmo));
    const rec3 = spyFmo(fmo);
    for (const z of z3) { const p = mid(z); fmo.handleVesselPanelClick(p.x, p.y); }
    // T5: klik w każdy aktywny chip (rozkazy — po rozwinięciu listy prawdziwym klikiem w „[ Rozkazy ▼ ]”)
    const fmo5 = new FleetManagerOverlay(); fmo5._selectedVesselId = s.v.id; fmo5._missionConfig = s.cfg ? { ...s.cfg } : null;
    const rec5 = spyFmo(fmo5);
    const lay = Y ? new Y.ShipPanelHudLayer() : null;
    let P = withFeatures(feat, () => t5Panel(fmo5, s.v.id, { layer: lay, feat }));
    const tog = P?.lay?._zones?.find?.((z) => z.local === 'orders' && z.enabled);
    if (tog) { const p = mid(tog); P.lay.handleClick(p.x, p.y, { K: globalThis.window.KOSMOS, fmo: fmo5 }); P = withFeatures(feat, () => t5Panel(fmo5, s.v.id, { layer: lay, feat })); }
    const chips = (P?.lay?._zones ?? []).filter((z) => z.kind === 'chip' && z.zone && z.enabled !== false);
    for (const z of chips) { const p = mid(z); P.lay.handleClick(p.x, p.y, { K: globalThis.window.KOSMOS, fmo: fmo5 }); }
    ok(rec3.length === z3.length && rec3.length > 0 && sameMultiset([...rec3].sort(), [...rec5].sort()),
      `H2 ${name.padEnd(15)} — ${rec3.length} wywołań T3 = ${rec5.length} wywołań T5 (_handleHit / _handleVesselPanelFooter)`);
  }
  // footer → `_handleVesselPanelFooter`, reszta → `_handleHit` (dyspozycja `runShipPanelAction` = `handleVesselPanelClick`)
  const got = [];
  const fake = { _handleHit: (z) => got.push(['hit', z.type]), _handleVesselPanelFooter: (z) => got.push(['footer', z.type]) };
  L?.runShipPanelAction?.({ type: 'mvpDock', data: {} }, { fmo: fake });
  L?.runShipPanelAction?.({ type: 'undock', data: {} }, { fmo: fake });
  L?.runShipPanelAction?.({ type: 'action', data: { actionId: 'orbit' } }, { fmo: fake });
  ok(JSON.stringify(got) === '[["footer","mvpDock"],["hit","undock"],["hit","action"]]', 'H2-d footer-3 → `_handleVesselPanelFooter`; reszta (także 16 rozkazów `action`) → `_handleHit`');
}

// ═══ H3 ═══════════════════════════════════════════════════════════════════════
header('H3  stany nieaktywne zgodne z dziś — chip przygaszony ⇔ panel T3 bez strefy; klik w przygaszony — nic');
{
  const check = (name, id, label) => {
    const { s, feat, fmo } = scene(name);
    const z3 = withFeatures(feat, () => t3Zones(fmo));
    const m = L?.buildShipPanelModel?.(s.v, { K: globalThis.window.KOSMOS, fmo, features: feat });
    const all = [...(m?.chips ?? []), ...(m?.orders?.items ?? []), ...(m?.config?.chips ?? []), ...(m?.config?.tail ?? [])];
    const c = all.find((x) => x.id === id);
    const t3has = z3.some((z) => z.type === id);
    ok(!!c && c.enabled === false && c.zone === null && !t3has, `H3 ${label} — chip „${c?.label ?? '?'}” przygaszony, panel T3 bez strefy`);
    return { s, feat, fmo };
  };
  check('hangar', 'mvpRetreat', 'w doku: Odwrót');
  check('immobilized', 'mvpDock', 'unieruchomiony: Dokuj');
  check('immobilized', 'mvpRetreat', 'unieruchomiony: Odwrót');
  const nd = check('dock_noyard', 'disband', 'dok bez stoczni: Rozbiórka');
  { const m = L?.buildShipPanelModel?.(nd.s.v, { K: globalThis.window.KOSMOS, fmo: nd.fmo, features: nd.feat });
    ok(m?.chips?.find?.((c) => c.id === 'disband')?.label === t('fleet.disbandRequiresShipyard'), 'H3-t dok bez stoczni — tekst dzisiejszego przycisku (`fleet.disbandRequiresShipyard`)'); }
  // obca orbita: ciało przeanalizowane — recon ciała nieaktywny; niezbadane — kolonizacja nieaktywna z dopiskiem
  { const s0 = STATES.foreign_orbit(); world(s0.v, { farAnalyzed: true, farExplored: false }); const fmo = new FleetManagerOverlay(); fmo._selectedVesselId = 'v_1';
    const z3 = t3Zones(fmo); const m = L?.buildShipPanelModel?.(s0.v, { K: globalThis.window.KOSMOS, fmo, features: FEATURES });
    const rb = m?.chips?.find?.((c) => c.id === 'foreign_recon_body'), fc = m?.chips?.find?.((c) => c.id === 'foreign_colonize');
    ok(rb?.enabled === false && !z3.some((z) => z.type === 'foreign_recon_body'), 'H3 obca orbita, ciało przeanalizowane — „Recon ciała” przygaszony (T3 bez strefy)');
    ok(fc?.enabled === false && fc.label.includes(t('fleet.requiresExplored')) && !z3.some((z) => z.type === 'foreign_colonize'),
      'H3 obca orbita, ciało niezbadane — „Kolonizuj (wymaga zbadania)” przygaszony (T3 bez strefy)'); }
  // rozkazy z odmową: bez technologii — `getAvailableActions` ok:false; chip przygaszony, powód jak dziś
  { const s0 = STATES.hangar(); world(s0.v, { noRocketry: true }); const fmo = new FleetManagerOverlay(); fmo._selectedVesselId = 'v_1';
    const z3 = t3Zones(fmo); const m = L?.buildShipPanelModel?.(s0.v, { K: globalThis.window.KOSMOS, fmo, features: FEATURES });
    const dis = (m?.orders?.items ?? []).filter((c) => !c.enabled);
    ok(dis.length > 0 && dis.every((c) => !z3.some((z) => z.type === 'action' && z.data?.actionId === c.id.slice(7))), `H3 rozkazy z odmową (bez „rocketry”) — ${dis.length} przygaszonych, T3 bez ich stref`);
    ok((m?.orders?.reasons ?? []).includes(t('fleet.reason.needRocketry')), 'H3-r powód blokady z `canExecute` (ten sam tekst co pod siatką T3)'); }
  // potwierdzenie bez paliwa: WYŚLIJ nieaktywny z dzisiejszym tekstem
  { const s0 = STATES.config_confirm(); s0.v.fuel.current = 0; world(s0.v, {}); const fmo = new FleetManagerOverlay(); fmo._selectedVesselId = 'v_1'; fmo._missionConfig = { ...s0.cfg };
    const z3 = t3Zones(fmo); fmo._missionConfig = { ...s0.cfg }; const m = L?.buildShipPanelModel?.(s0.v, { K: globalThis.window.KOSMOS, fmo, features: FEATURES });
    const send = m?.config?.tail?.find?.((c) => c.id === 'confirm_mission');
    ok(send?.enabled === false && send.label === t('fleet.sendMissionNoFuel') && !z3.some((z) => z.type === 'confirm_mission'), 'H3 potwierdzenie bez paliwa — „⛽ BRAK PALIWA” przygaszony (T3 bez strefy)'); }
  // „[ Rozkazy ▼ ]” — w locie brak rozkazów misji: przycisk przygaszony, klik nic nie otwiera
  { const { s, fmo } = scene('flight'); const P = t5Panel(fmo, s.v.id); const tog = P?.lay?._zones?.find?.((z) => z.local === 'orders');
    const before = JSON.stringify(P?.lay?._open ?? null);
    if (tog) { const p = mid(tog); P.lay.handleClick(p.x, p.y, { K: globalThis.window.KOSMOS, fmo }); }
    ok(!!tog && tog.enabled === false && JSON.stringify(P.lay._open ?? null) === before && P.lay.chipAt(mid(tog).x, mid(tog).y) === null,
      'H3 w locie (zero rozkazów misji) — „[ Rozkazy ]” przygaszony: klik nie rozwija, bez „rączki”'); }
  // klik w przygaszony chip — pochłonięty, bez wywołania
  { const { s, fmo } = scene('hangar'); const rec = spyFmo(fmo); const P = t5Panel(fmo, s.v.id);
    const m = P?.lay?._prep?.model; const ret = m?.chips?.find?.((c) => c.id === 'mvpRetreat');
    // pozycja przygaszonego chipa — z napisu na atrapie
    const tx = P?.ctx?._calls?.text?.find?.((x) => x.s.includes(ret?.label ?? '§'));
    const r = tx ? P.lay.handleClick(tx.x + 3, tx.y - 3, { K: globalThis.window.KOSMOS, fmo }) : null;
    ok(!!tx && r === true && rec.length === 0, 'H3-k klik w przygaszony „Odwrót” — pochłonięty (nie idzie do mapy), bez wywołania handlera'); }
}

// ═══ H4 ═══════════════════════════════════════════════════════════════════════
header('H4  strefy kliku: chip > nazwa > pasek (pochłania) > mapa');
const UI = src('../../scenes/UIManager.js');
const GS = src('../../scenes/GameScene.js');
{
  const Z = [{ kind: 'body', x: 0, y: 0, w: 100, h: 100 }, { kind: 'name', x: 0, y: 0, w: 50, h: 20 }, { kind: 'chip', id: 'a', x: 10, y: 5, w: 10, h: 10 }];
  ok(L?.shipPanelHitAt?.(Z, 12, 8)?.kind === 'chip' && L.shipPanelHitAt(Z, 40, 10)?.kind === 'name' && L.shipPanelHitAt(Z, 80, 80)?.kind === 'body'
    && L.shipPanelHitAt(Z, 120, 10) === null, 'H4a kolejność: chip > nazwa > pasek; poza panelem — brak (klik idzie do mapy)');
  const { s, fmo } = scene('hangar');
  const rec = spyFmo(fmo);
  const P = t5Panel(fmo, s.v.id);
  const lay = P?.lay, r = lay?.rect;
  ok(!!r && lay.handleClick(r.x + r.w - 3, r.y + r.h - 3, { K: globalThis.window.KOSMOS, fmo }) === true && rec.length === 0, 'H4b klik w pasek poza strefami — pochłonięty, bez akcji');
  ok(!!r && lay.handleClick(r.x - 5, r.y + 10, { K: globalThis.window.KOSMOS, fmo }) === false, 'H4c KONTROLA: klik poza panelem — `false` (mapa)');
  // nazwa = reguła D-UI-5: statek zaznaczony → 2. klik → kamera (`vessel:focus`)
  evs.length = 0;
  const nz = lay?._zones?.find?.((z) => z.kind === 'name');
  if (nz) lay.handleClick(nz.x + 2, nz.y + 2, { K: globalThis.window.KOSMOS, fmo, emit: (n, p) => EventBus.emit(n, p) });
  ok(!!nz && evs.length === 1 && evs[0][0] === 'vessel:focus' && evs[0][1]?.vesselId === 'v_1' && rec.length === 0,
    'H4d linia nazwy — reguła D-UI-5 (zaznaczony statek: 2. klik = `vessel:focus`), bez handlera panelu');
  // ✎ — rename (ten sam handler co ✎ panelu T3)
  const pen = lay?._zones?.find?.((z) => z.id === 'rename');
  if (pen) lay.handleClick(mid(pen).x, mid(pen).y, { K: globalThis.window.KOSMOS, fmo });
  ok(!!pen && rec.length === 1 && rec[0] === 'hit|' + L.zoneKey({ type: 'rename', data: { vesselId: 'v_1' } }), 'H4e ✎ obok nazwy → `_handleHit` „rename” (jak ✎ panelu T3)');
  // okno DOM na wierzchu — klik pochłonięty, bez akcji
  const qs = globalThis.document.querySelector;
  globalThis.document.querySelector = (q) => (/kosmos-modal-overlay/.test(q) ? {} : null);
  const und = lay?._zones?.find?.((z) => z.id === 'undock');
  const pu = und ? mid(und) : { x: -1, y: -1 };          // brak panelu (fail-first) — punkt poza wszystkim
  const rr = r ?? { x: -100, y: -100, w: 0, h: 0 };
  const rDom = und ? lay.handleClick(pu.x, pu.y, { K: globalThis.window.KOSMOS, fmo }) : null;
  globalThis.document.querySelector = qs;
  ok(rDom === true && rec.length === 1, 'H4f okno DOM na wierzchu — klik pochłonięty bez akcji (lustro `handleVesselPanelClick`)');
  // „rączka” — tylko nad aktywnym chipem
  ok(!!und && !!nz && lay.chipAt(pu.x, pu.y) === 'undock' && lay.chipAt(rr.x + rr.w - 3, rr.y + rr.h - 3) === null && lay.chipAt(nz.x + 2, nz.y + 2) === null,
    'H4g `chipAt` — aktywny chip (rączka); pasek i nazwa — nie');
  // UIManager: `_vesselPanelClick` → panel T5 (narysowany), `_vesselPanelHit` — jego prostokąt; `_detectHoverBtn` — rączka
  const mVpc = compileMethod(UI, '_vesselPanelClick', {});
  const mHit = compileMethod(UI, '_vesselPanelHit', {});
  const um = (o = {}) => ({ overlayManager: { isAnyOpen: () => !!o.ovl }, _mapSurface: () => o.surf ?? 'vessel', _shipPanelDockHidden: () => !!o.dock,
    _shipPanelHud: lay, _fleetOverlay: fmo });
  rec.length = 0;
  ok(call(mVpc, um(), pu.x, pu.y) === true && rec.length === 1 && rec[0].startsWith('hit|undock'),
    'H4h `UIManager._vesselPanelClick` (wykonanie) — przy narysowanym panelu T5 klik do jego chipa („Wystartuj na orbitę” → `_handleHit`)');
  ok(!!und && call(mVpc, um({ dock: true }), pu.x, pu.y) === false && call(mVpc, um({ ovl: true }), pu.x, pu.y) === false
    && call(mVpc, um({ surf: 'group' }), pu.x, pu.y) === false && rec.length === 1, 'H4i ta sama bramka co rysunek (tryb Y, overlay, powierzchnia grupy) — klik nie dociera do chipa');
  ok(call(mHit, um(), rr.x + 5, rr.y + 5) === true && call(mHit, um(), rr.x - 5, rr.y + 5) === false && call(mHit, um({ dock: true }), rr.x + 5, rr.y + 5) === false,
    'H4j `_vesselPanelHit` — prostokąt panelu T5 (blokada kamery, `isPointerOverFloatingPanel`); tryb Y — nie');
  const mHov = compileMethod(UI, '_detectHoverBtn', { H: 720, W: 1280, COSMIC, CIV_PANEL_Y: 0, CIV_SIDEBAR_W: 0 });
  const hovSelf = { _outliner: { isOver: () => false }, _shipPanelHud: lay };
  ok(call(mHov, hovSelf, pu.x, pu.y) === 'shippanel' && call(mHov, hovSelf, rr.x + rr.w - 3, rr.y + rr.h - 3) === null,
    "H4k `UIManager._detectHoverBtn` (wykonanie) — nad aktywnym chipem 'shippanel' (kursor „rączki”), nad paskiem — nic");
}

// ═══ H5 ═══════════════════════════════════════════════════════════════════════
header('H5  akordeon „[ Rozkazy ▼ ]” — jedna lista, zwinięcie przy zmianie zaznaczenia');
{
  const { s, fmo } = scene('hangar');
  const lay = Y ? new Y.ShipPanelHudLayer() : null;
  const draw = () => t5Panel(fmo, s.v.id, { layer: lay });
  const orderChips = () => (lay?._zones ?? []).filter((z) => z.kind === 'chip' && z.zone?.type === 'action');
  const clickTog = () => { const tg = lay?._zones?.find?.((z) => z.local === 'orders'); if (tg) lay.handleClick(mid(tg).x, mid(tg).y, { K: globalThis.window.KOSMOS, fmo }); return !!tg; };
  draw();
  const items = lay?._prep?.model?.orders?.items ?? [];
  const nOk = items.filter((c) => c.enabled).length;
  ok(items.length >= 3 && nOk >= 2 && orderChips().length === 0, `H5a zwinięte: ${items.length} rozkazów misji w modelu (${nOk} aktywnych), żaden chip rozkazu na panelu`);
  const h0 = lay?.rect?.h ?? 0;
  ok(clickTog(), 'H5-k KONTROLA: „[ Rozkazy ▼ ]” na panelu');
  draw();
  ok(orderChips().length === nOk && (lay?.rect?.h ?? 0) > h0, `H5b klik — lista rozwinięta: ${orderChips().length} aktywnych chipów rozkazów (= ${nOk}), panel wyższy (${h0} → ${lay?.rect?.h})`);
  ok(L?.ordersOpen?.(lay._open, s.v.id) === true && lay.debug().ordersOpen === true, 'H5c stan akordeonu — otwarta (odczyt bramki)');
  clickTog(); draw();
  ok(orderChips().length === 0 && L?.ordersOpen?.(lay._open, s.v.id) === false, 'H5d ponowny klik — zwinięta');
  clickTog(); draw();
  EventBus.emit('ui:selectionChanged', { vesselId: null, vesselIds: [] });
  EventBus.emit('ui:selectionChanged', { vesselId: 'v_1', vesselIds: ['v_1'] });
  draw();
  ok(orderChips().length === 0 && L?.ordersOpen?.(lay._open, s.v.id) === false, 'H5e zmiana zaznaczenia (A → nic → A) — lista zwinięta');
  const st = L?.toggleOrders?.(null, 'v_1');
  ok(L?.ordersOpen?.(st, 'v_1') === true && L?.ordersOpen?.(st, 'v_2') === false && L?.ordersOpen?.(L.toggleOrders(st, 'v_2'), 'v_1') === false,
    'H5f jedna lista naraz — akordeon kluczem statku (inny statek — zamknięta)');
}

// ═══ H6 ═══════════════════════════════════════════════════════════════════════
header('H6  konfigurator misji — szerokość i powrót; cel zniknął');
{
  const { s, fmo } = scene('hangar');
  const lay = Y ? new Y.ShipPanelHudLayer() : null;
  const w = () => t5Panel(fmo, s.v.id, { layer: lay })?.sz?.w;
  ok(w() === S.W, `H6a zwykły panel — szerokość W (${S.W})`);
  // prawdziwy klik w rozkaz z wyborem celu („Leć i orbituj” — requiresTarget) → krok wyboru celu (FMO `_handleAction`)
  if (lay) lay._open = L?.toggleOrders?.(null, s.v.id);
  t5Panel(fmo, s.v.id, { layer: lay });
  const orbit = (lay?._zones ?? []).find((z) => z.zone?.type === 'action' && z.zone.data?.actionId === 'orbit');
  if (orbit) lay.handleClick(mid(orbit).x, mid(orbit).y, { K: globalThis.window.KOSMOS, fmo });
  ok(fmo._missionConfig?.step === 'select' && fmo._missionConfig.actionId === 'orbit', 'H6b klik „Leć i orbituj” (prawdziwy `_handleHit` → `_handleAction`) — konfigurator w kroku wyboru celu');
  ok(w() === S.W_CONFIG && lay?.debug?.()?.wide === true && lay.debug().step === 'select', `H6c krok wyboru celu — szerokość W_CONFIG (${S.W_CONFIG})`);
  const rows = (lay?._zones ?? []).filter((z) => z.zone?.type === 'select_target');
  if (rows[0]) lay.handleClick(mid(rows[0]).x, mid(rows[0]).y, { K: globalThis.window.KOSMOS, fmo });
  ok(rows.length > 0 && fmo._missionConfig?.step === 'confirm' && w() === S.W_CONFIG, 'H6d klik celu (prawdziwy `_handleHit` „select_target”) — potwierdzenie, szerokość W_CONFIG');
  const cancel = (lay?._zones ?? []).find((z) => z.zone?.type === 'cancel_config');
  if (cancel) lay.handleClick(mid(cancel).x, mid(cancel).y, { K: globalThis.window.KOSMOS, fmo });
  ok(!!cancel && fmo._missionConfig === null && w() === S.W, 'H6e „ANULUJ” (prawdziwy `_handleHit` „cancel_config”) — powrót do W');
  fmo._missionConfig = { actionId: 'transport', targetId: 'p_nie_ma', step: 'confirm' };
  t5Panel(fmo, s.v.id, { layer: lay });
  ok(fmo._missionConfig === null, 'H6f cel konfiguratora zniknął — konfigurator zdjęty (dzisiejsza reguła `_drawMissionConfirm`)');
  // Zachowanie 9 (PASS T5, Finding 546): zmiana zaznaczenia zdejmuje konfigurator — reguła czysta + metoda `UIManager` (wycięta).
  const D = L?.shouldDropMissionConfig;
  const cfg = { actionId: 'orbit', targetId: null, step: 'select' };
  ok(D?.({ overlayOpen: false, config: cfg }) === true && D({ overlayOpen: true, config: cfg }) === false
    && D({ overlayOpen: false, config: null }) === false,
    'H6g reguła: bez overlayu, konfigurator otwarty — zdjąć; overlay (Rejestr) / brak konfiguratora — zostawić');
  const mDrop = compileMethod(UI, '_dropMissionConfigOnSelection', { GAME_CONFIG, shouldDropMissionConfig: D });
  const dropSelf = (ovl = false) => ({ _fleetOverlay: fmo, overlayManager: { isAnyOpen: () => ovl }, _dirty: false });
  // konfigurator otwarty prawdziwym klikiem (jak H6b), potem zmiana zaznaczenia
  if (lay) lay._open = L?.toggleOrders?.(null, s.v.id);
  t5Panel(fmo, s.v.id, { layer: lay });
  const orb2 = (lay?._zones ?? []).find((z) => z.zone?.type === 'action' && z.zone.data?.actionId === 'orbit');
  if (orb2) lay.handleClick(mid(orb2).x, mid(orb2).y, { K: globalThis.window.KOSMOS, fmo });
  const opened = fmo._missionConfig?.step === 'select' && w() === S.W_CONFIG;
  fmo._targetScrollOffset = 7;
  const ds = dropSelf(false);
  const r1 = call(mDrop, ds);
  ok(opened && r1 === true && fmo._missionConfig === null && fmo._targetScrollOffset === 0 && ds._dirty === true && w() === S.W,
    'H6h konfigurator (prawdziwy klik „⊙ Leć i orbituj”) → zmiana zaznaczenia — zdjęty (jak „ANULUJ”), panel wraca do W');
  fmo._missionConfig = { ...cfg };
  ok(call(mDrop, dropSelf(true)) !== true && fmo._missionConfig?.step === 'select', 'H6i KONTROLA: overlay otwarty (Rejestr Dowództwa) — konfigurator zostaje (własna reguła Rejestru)');
  fmo._missionConfig = null;
  ok(/EventBus\.on\('ui:selectionChanged', \(\) => \{ this\._dropMissionConfigOnSelection\(\); \}\);/.test(UI),
    'H6k montaż: `UIManager` słucha `ui:selectionChanged` (każda zmiana zaznaczenia, także A → nic → A)');
}

// ═══ H7 ═══════════════════════════════════════════════════════════════════════
header('H7  kotwica T3 bez zmian — prawdziwy Outliner, wycięte `_drawShipPanelHud` / `_shipPanelAtOutliner`');
{
  // Świat outlinera: dom z 30 statkami (lista dłuższa niż okno), zaznaczony statek przy wierszu.
  const s0 = STATES.hangar(); world(s0.v, {});
  const K = globalThis.window.KOSMOS;
  const VM = K.vesselManager._vessels;
  for (let i = 1; i <= 30; i++) { const n = String(i).padStart(2, '0'); VM.set(`c${n}`, ship({ id: `c${n}`, name: `Frachtowiec ${n}` })); }
  K.starSystemManager.getAllSystems = () => [{ systemId: 'sys_home', galaxyStar: null }];
  EntityManager.add({ id: 'star_h', type: 'star', name: 'Kepler-4799', systemId: 'sys_home' });
  K.leftOutliner = LO?.LeftOutliner ? new LO.LeftOutliner() : null;
  const ro = OL?.Outliner ? new OL.Outliner() : null;
  K.rightOutliner = ro;
  const COL = K.colonyManager.getAllColonies();
  const drawRo = (H = 720) => { try { ro?.draw?.(recCtx(), 1280, H, { treeColonies: COL, colonies: [], groundUnits: [] }); } catch { /* pin pada */ } };
  const zoneOf = (id) => (ro?._clickTargets ?? []).find((z) => z.type === 'vessel' && z.vesselId === id) ?? null;
  const mShip = compileMethod(UI, '_shipPanelAtOutliner', { resolveRowAnchor: SPA.resolveRowAnchor, shipRowKeys: SPA.shipRowKeys,
    computeShipPanelPlacement: SPA.computeShipPanelPlacement, getMapInsets });
  const mDraw = compileMethod(UI, '_drawShipPanelHud', { getMapInsets, GAME_CONFIG });
  const fmo = new FleetManagerOverlay(); fmo._selectedVesselId = 'v_1'; fmo._vesselPanelRect = { x: 1, y: 1, w: 300, h: 300 };
  const lay = Y ? new Y.ShipPanelHudLayer() : null;
  const tabs = [];
  const self = { _outliner: ro, _fleetOverlay: fmo, _shipPanelHud: lay, _selectedVesselId: 'v_1', _tooltipMouseX: -1, _tooltipMouseY: -1,
    combatHud: null, _shipPanelAtOutliner: mShip, _drawShipPanelTab: (ctx, p) => tabs.push(p) };
  K.uiManager._selectedEntity = null;
  EventBus.emit('ui:selectionChanged', { vesselId: 'v_1', vesselIds: ['v_1'] });   // outliner odsłania wiersz zaznaczonego
  drawRo(); drawRo();
  const rect = call(mDraw, self, recCtx(), 1280, 720);
  const z = zoneOf('v_1');
  const pl = lay?.rect;
  ok(!!mShip && !!mDraw && typeof rect === 'object' && rect !== null, 'H7-0 metody wycięte i wykonane (`_drawShipPanelHud` zwraca prostokąt narysowanego panelu)');
  ok(fmo._vesselPanelRect === null, 'H7a panel T3 przy ON bez prostokąta (klik, kółko, kursor i przeszkody czytają panel T5)');
  ok(!!pl && !!ro?._rect && pl.x + pl.w === ro._rect.x && pl.w === S.W, `H7b prawa krawędź panelu = lewa krawędź kolumny (${pl?.x} + ${pl?.w} = ${ro?._rect?.x}); szerokość z renderera T5`);
  ok(!!z && pl?.y === z.y && tabs.length === 1 && tabs[0].tab?.y === z.y, `H7c górna krawędź = wiersz statku (${pl?.y} = ${z?.y}), łącznik T3 na wysokości wiersza`);
  const ins = getMapInsets(K);
  ok(!!pl && pl.h <= 720 - ins.top - ins.bottom && pl.y >= ins.top && pl.y + pl.h <= 720 - ins.bottom, `H7d klamra: panel w obszarze mapy (y ${pl?.y}–${pl ? pl.y + pl.h : '—'})`);
  // zapas: kolumna schowana („.”) — kotwica zapasowa T3, bez łącznika
  ro.visible = false; tabs.length = 0;
  call(mDraw, self, recCtx(), 1280, 720);
  const fb = SPA.computeShipPanelPlacement({ W: 1280, H: 720, insets: getMapInsets(K), column: null, anchor: null, panelW: S.W, panelH: lay?.rect?.h ?? 0 });
  ok(lay?.rect?.x === fb.x && lay.rect.y === fb.y && fb.mode === 'fallback' && tabs.length === 0, `H7e kolumna schowana — kotwica zapasowa T3 (${lay?.rect?.x},${lay?.rect?.y}), bez łącznika`);
  ro.visible = true;
  // konfigurator — szerszy panel przy tej samej kolumnie
  fmo._missionConfig = { actionId: 'transport', targetId: null, step: 'select' };
  drawRo(); call(mDraw, self, recCtx(), 1280, 720);
  ok(lay?.rect?.w === S.W_CONFIG && lay.rect.x + lay.rect.w === ro._rect?.x, `H7f konfigurator — szerokość W_CONFIG, prawa krawędź nadal = kolumna (${lay?.rect?.x} + ${lay?.rect?.w})`);
  fmo._missionConfig = null;
  // brak miejsca: okno niższe niż treść — przewija się lista rozkazów, nie panel; panel w obszarze mapy, kółko przewija listę.
  if (lay) lay._open = L?.toggleOrders?.(null, 'v_1');
  const full = lay?.prepare?.({ ctx: recCtx(), K, fmo, vesselId: 'v_1', maxH: 5000, features: FEATURES })?.h ?? 0;
  const insX = getMapInsets(K);
  const HL5 = Math.ceil(full - 4 + insX.top + insX.bottom + 16);    // `maxH` o 4 px mniejsze niż pełna treść (lista oddaje 4 px)
  drawRo(HL5); call(mDraw, self, recCtx(), 1280, HL5);
  const ins5 = getMapInsets(K);
  const d5 = lay?.debug?.();
  ok(full > 0 && !!lay?.rect && lay.rect.h <= HL5 - ins5.top - ins5.bottom && lay.rect.h < full && (d5?.maxScroll ?? 0) > 0,
    `H7g okno 1280×${HL5} (treść ${full} px) — panel w obszarze mapy (h ${lay?.rect?.h}), lista rozkazów przewijana (max ${d5?.maxScroll})`);
  const before = lay?._scroll ?? 0;
  const wh = lay?.rect ? lay.handleWheel(lay.rect.x + 5, lay.rect.y + 5, 200) : null;
  ok(wh === true && (lay?._scroll ?? 0) > before && lay._scroll <= lay._maxScroll, `H7h kółko nad panelem — przewija listę (${before} → ${lay?._scroll}), pochłonięte`);
  ok(!!lay?.rect && lay.handleWheel(lay.rect.x - 5, lay.rect.y + 5, 200) === false, 'H7i KONTROLA: kółko poza panelem — `false` (zoom mapy)');
  call(mDraw, self, recCtx(), 1280, HL5);   // klatka po przewinięciu — strefy listy z nowego położenia
  const listZones = (lay?._zones ?? []).filter((q) => q.zone?.type === 'action');
  const lr = lay?._prep?.list;
  ok(listZones.length > 0 && !!lay?.rect && listZones.every((q) => q.y >= lay.rect.y && q.y + q.h <= lay.rect.y + lay.rect.h + 0.5)
    && (lay?._prep?.model?.orders?.items?.filter?.((c) => c.enabled)?.length ?? 0) > listZones.length,
    `H7j strefy rozkazów tylko w widocznym oknie listy (${listZones.length} z ${lay?._prep?.model?.orders?.items?.filter?.((c) => c.enabled)?.length} — przewinięte poza okno nie są klikalne; okno ${lr?.viewH} z ${lr?.contentH} px)`);
}

// ═══ H8 ═══════════════════════════════════════════════════════════════════════
header('H8  łamanie nazwy — ≤ 2 linie, bez „…”, pełna treść');
{
  const names = ['Zaopatrzeniowiec Północy XVIII', 'Kwatermistrz Dalekiej Floty IV', 'ŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹŹ',
    'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM', 'a b c d e f g h i j k l m n o', 'Kurier'];
  for (const prop of [false, true]) {
    const ctx = recCtx({ prop });
    const lay = Y ? new Y.ShipPanelHudLayer() : null;
    const size = (THEME.fontSizeNormal ?? 11) - 1;
    const inner = (S.W ?? 200) - 2 * (S.PAD_X ?? 6);
    const pen = lay ? lay._textWidth(ctx, '✎', { size }) : 10;
    const widthOf = (q) => lay._textWidth(ctx, q, { size, bold: true });
    const res = names.map((n) => ({ n, r: L?.wrapName?.(n.toLocaleLowerCase('pl'), inner - pen - (S.RENAME_GAP ?? 4), widthOf) }));
    ok(res.every(({ n, r }) => r && r.lines.length <= 2 && !r.clipped && !r.lines.join('').includes('…') && r.lines.join('').replace(/ /g, '') === n.toLocaleLowerCase('pl').replace(/ /g, '')),
      `H8${prop ? 'b font proporcjonalny' : 'a font stałej szerokości'} — 30 znaków (okno zmiany nazwy, maxLength 30): ≤ 2 linie, bez „…”, pełna treść (${res.map(({ r }) => r?.lines?.length).join('/')})`);
  }
  const long = L?.wrapName?.('x'.repeat(90), 100, (q) => q.length * 6);
  ok(long?.lines?.length === 2 && long.clipped === true && long.lines[1].endsWith('…'), 'H8c KONTROLA: nazwa spoza okna zmiany (90 znaków) — 2 linie, ostatnia ucięta (`clipped`)');
  ok(JSON.stringify(L?.wrapText?.('ab cd', 1000, (q) => q.length)) === '["ab cd"]' && L?.wrapText?.('aaaa bbbb', 5, (q) => q.length)?.length === 2,
    'H8d `wrapText` — mieści się: jedna linia; za długie: łamanie po słowach');
  const { s, fmo } = scene('hangar'); s.v.name = 'Zaopatrzeniowiec Północy XVIII';
  const P = t5Panel(fmo, s.v.id);
  const nb = P?.lay?._prep?.blocks?.find?.((b) => b.k === 'name');
  ok(!!nb && nb.lines.length === 2 && !nb.clipped, `H8e panel: długa nazwa w 2 liniach („${nb?.lines?.map((l) => l.text).join(' | ')}”)`);
}

// ═══ H9 ═══════════════════════════════════════════════════════════════════════
header('H9  530 — dymek współrzędnych nie nad UI (isOverUI + strefy HUD), z warstwą etykiet HUD i bez niej');
{
  const B = L?.coordTooltipBlocked;
  ok(B?.({}) === false && B({ overUI: true }) === true && B({ hudZone: true }) === true && B({ overUI: false, hudZone: false }) === false,
    'H9a reguła: nad UI albo strefą HUD — bez dymka; pusta mapa — dymek');
  const mMain = compileMethod(GS, '_tooltipHoverFromMain3D', { GAME_CONFIG, isHudLabelsOn: (f) => f?.hudLabels === true, worldToGameplay });
  const mCover = compileMethod(GS, '_coordTooltipOverUi', { coordTooltipBlocked: B });
  ok(!!mMain && !!mCover, 'H9-0 `GameScene._tooltipHoverFromMain3D` i `_coordTooltipOverUi` wycięte ze źródła');
  const run = ({ overUI = false, hud = false, hl = true } = {}) => {
    const got = [];
    const saved = { hudLabels: FEATURES.hudLabels };
    FEATURES.hudLabels = hl;
    globalThis.window.KOSMOS.hudLayer = { coversUiPoint: () => hud, coversPoint: () => false };
    const self = {
      uiManager: { overlayManager: { isAnyOpen: () => false }, isPointerOverFloatingPanel: () => false, isOverUI: () => overUI, toLocalUI: (x, y) => ({ x, y }) },
      threeRenderer: { _hoverPlanetId: null },
      _resolveClickTarget: () => ({ type: 'empty', worldPoint: { x: 1, z: 2 } }),
      _scheduleEntityTooltip: (tg) => got.push(['entity', tg]),
      _scheduleCoordTooltip: () => got.push(['coord']),
      _coordTooltipOverUi: mCover,
    };
    call(mMain, self, 600, 300);
    Object.assign(FEATURES, saved);
    return got.some((g) => g[0] === 'coord');
  };
  for (const hl of [true, false]) {
    ok(run({ overUI: true, hl }) === false && run({ hud: true, hl }) === false && run({ hl }) === true,
      `H9b warstwa etykiet HUD ${hl ? 'ON' : 'OFF'} — nad UI / strefą HUD bez dymka; nad pustą mapą — dymek (KONTROLA)`);
  }
  // `isOverUI` (wykonanie): panel T5, belka, pas, outlinery, nawigacja — każda powierzchnia zgłasza UI
  const mOver = compileMethod(UI, 'isOverUI', { UI_SCALE: 1, W: 1280, H: 720, GAME_CONFIG, CIV_PANEL_Y: 0, CIV_SIDEBAR_W: 0, COSMIC });
  const mHit = compileMethod(UI, '_vesselPanelHit', {});
  const surf = { topBar: false, bottomBar: false, left: false, right: false, nav: false, control: false, log: false, res: false };
  const lay = Y ? new Y.ShipPanelHudLayer() : null;
  if (lay) lay.rect = { x: 930, y: 60, w: 200, h: 300 };
  const self = {
    _gameOverData: null, _confirmDialog: null,
    _topBar: { isOver: () => surf.topBar }, _bottomBar: { isOver: () => surf.bottomBar }, _leftOutliner: { isOver: () => surf.left }, _outliner: { isOver: () => surf.right },
    _topResourceDrawer: { isOver: () => surf.res }, _bottomNavBar: { isOver: () => surf.nav }, _bottomControlBar: { isOver: () => surf.control }, _eventLogDrawer: { isOver: () => surf.log },
    _mapSurface: () => 'vessel', _vesselPanelHit: mHit, _shipPanelHud: lay, _fleetOverlay: { _vesselPanelRect: null }, _shipPanelDockHidden: () => false,
    fleetGroupPanel: null, fleetCommandPanel: null, stationPanel: null, _tacticalMode: null, tacticalDock: null,
    overlayManager: { isAnyOpen: () => false },
  };
  globalThis.window.KOSMOS.civMode = true;
  ok(call(mOver, self, 1000, 200) === true, 'H9c `isOverUI` (wykonanie) — kursor nad panelem statku T5 (prostokąt z `_vesselPanelHit`)');
  ok(call(mOver, self, 400, 400) === false, 'H9d KONTROLA: pusta mapa — nie UI (dymek współrzędnych zostaje)');
  const each = Object.keys(surf).map((k) => { for (const q of Object.keys(surf)) surf[q] = false; surf[k] = true; return call(mOver, self, 400, 400) === true; });
  for (const q of Object.keys(surf)) surf[q] = false;
  ok(each.every(Boolean), 'H9e `isOverUI` — belka, menu, outlinery (lewy, prawy), pasek surowców, nawigacja, pas dolny, dziennik — każda powierzchnia');
  // strefy HUD: prawdziwa warstwa etykiet (strefy z ostatniej klatki) i bramka `HudLayer`
  const HLx = HLL?.HudLabelLayer ? new HLL.HudLabelLayer() : null;
  if (HLx) { HLx._prep = { on: true }; HLx._zones = [{ x: 100, y: 100, w: 60, h: 12, key: 'v:c1', kind: 'vessel' }]; HLx._pinZones = [{ kind: 'btn', id: 'report', x: 300, y: 300, w: 40, h: 12 }]; }
  ok(HLx?.coversUiPoint?.(110, 105) === true && HLx.coversUiPoint(310, 305) === true && HLx.coversUiPoint(500, 500) === false,
    'H9f `HudLabelLayer.coversUiPoint` — etykieta i przypięcie (strefy z ostatniej klatki), pusta mapa — nie');
  if (HLx) HLx._prep = { on: false };
  ok(HLx?.coversUiPoint?.(110, 105) === false, 'H9g warstwa etykiet wyłączona (`hudLabels` OFF) — brak stref');
  const hud = HL?.HudLayer ? new HL.HudLayer(null, { autoStart: false, sublayers: [{ coversUiPoint: () => true }] }) : null;
  if (hud) { hud._gate = { shown: true }; hud._shown = true; }
  const shownOk = hud?.coversUiPoint?.(1, 1) === true;
  if (hud) hud._gate = { shown: false };
  ok(shownOk && hud.coversUiPoint(1, 1) === false, 'H9h `HudLayer.coversUiPoint` — warstwa widoczna: podwarstwy; schowana (overlay, globus) — `false`');
  ok(/if \(this\._coordTooltipOverUi\(clientX, clientY\)\) \{/.test(body(GS, '  _tooltipHoverFromMain3D(clientX, clientY) {')), 'H9i montaż: jeden warunek w ścieżce dymka pustej mapy (`_coordTooltipOverUi`)');
}

// ═══ H10 ══════════════════════════════════════════════════════════════════════
header('H10 panel T5 jedyną powierzchnią statku nad mapą (dawny panel T3 poza rysunkiem i klikiem `UIManager`)');
{
  const mVpc = compileMethod(UI, '_vesselPanelClick', {});
  const mHit = compileMethod(UI, '_vesselPanelHit', {});
  const lay = Y ? new Y.ShipPanelHudLayer() : null;
  lay?.clear?.();
  const t3r = { x: 100, y: 100, w: 300, h: 300 };
  let t3Clicks = 0;
  const self = { overlayManager: { isAnyOpen: () => false }, _mapSurface: () => 'vessel', _shipPanelDockHidden: () => false, _shipPanelHud: lay,
    _fleetOverlay: { handleVesselPanelClick: () => { t3Clicks++; return true; }, _vesselPanelRect: t3r } };
  globalThis.window.KOSMOS.civMode = true;
  ok(lay?.rect === null && call(mVpc, self, 150, 150) === false && t3Clicks === 0 && call(mHit, self, 150, 150) === false,
    'H10b panel T5 niewyrysowany (`clear`) — klik i trafienie NIE idą do dawnego panelu T3 (jego prostokąt bez znaczenia)');
  if (lay) lay.rect = { x: 120, y: 120, w: 200, h: 200 };
  ok(call(mHit, self, 150, 150) === true && call(mHit, self, 110, 110) === false,
    'H10c KONTROLA: panel T5 narysowany — trafienie wg JEGO prostokąta (110,110 leży w dawnym T3, nie w T5)');
  // HudLabelLayer: przeszkoda — wyłącznie prostokąt panelu T5
  const HLx = HLL?.HudLabelLayer ? new HLL.HudLabelLayer() : null;
  const um = { _mapSurface: () => 'vessel', _selectedEntity: null, _shipPanelHud: { rect: null }, _fleetOverlay: { _vesselPanelRect: t3r } };
  const rNone = HLx?._cardRects?.({ uiManager: um, civMode: true }) ?? null;
  um._shipPanelHud.rect = { x: 930, y: 60, w: 200, h: 250 };
  const rOn = HLx?._cardRects?.({ uiManager: um, civMode: true }) ?? [];
  ok(Array.isArray(rNone) && rNone.length === 0 && rOn.length === 1 && rOn[0].w === 200,
    'H10e przeszkoda etykiet HUD: panel T5 nienarysowany — brak przeszkody (dawny prostokąt T3 ignorowany); narysowany — jego prostokąt');
}

// ═══ H11 ══════════════════════════════════════════════════════════════════════
header('H11 budżet — powtórna klatka bez pomiaru tekstu, jeden model na klatkę');
{
  const { s, fmo } = scene('flight');
  const lay = Y ? new Y.ShipPanelHudLayer() : null;
  const ctx = recCtx();
  t5Panel(fmo, s.v.id, { layer: lay, ctx });
  const m1 = ctx._calls.measures;
  t5Panel(fmo, s.v.id, { layer: lay, ctx });
  const m2 = ctx._calls.measures - m1;
  ok(m1 > 0 && m2 === 0, `H11a powtórna klatka (ten sam stan) — ${m2} pomiarów tekstu (pierwsza: ${m1}; pamięć pomiaru i linii)`);
  ok((lay?.stats?.prepares ?? 0) === 2 && (lay?.stats?.draws ?? 0) === 2, 'H11b jeden model i jeden rysunek na klatkę (`stats`)');
  lay?.clear?.();
  ok(lay?.rect === null && (lay?._zones?.length ?? -1) === 0 && lay.chipAt(1000, 100) === null && lay.handleClick(1000, 100, {}) === false
    && lay.handleWheel(1000, 100, 50) === false, 'H11c panel nienarysowany — bez stref: brak kliku, kółka i „rączki”');
  const dr = body(UI, '  _draw() {');
  ok(/if \(civMode && !globeOpen && !this\.overlayManager\.isAnyOpen\(\) && !this\._shipPanelDockHidden\(\) && this\._mapSurface\(\) === 'vessel'\) \{\s*shipPanelHudDrawn = !!this\._drawShipPanelHud\(ctx, W, H\);/.test(dr),
    'H11d model liczony wyłącznie przy rysunku panelu (bramka T3: tryb cywilizacji, bez globusa i overlayu, bez trybu Y, N == 1)');
}

// ═══ H12 ══════════════════════════════════════════════════════════════════════
header('H12 strojenie 1 (Finding 556) — PL bez angielskich słów na chipach tankowania i rozbiórki');
{
  setLocale('pl'); const plR = t('fleet.refuelNow'), plD = t('fleet.disbandRequiresShipyard'), plRet = t('fleet.disbandReturn');
  setLocale('en'); const enR = t('fleet.refuelNow'), enD = t('fleet.disbandRequiresShipyard');
  setLocale('pl');
  ok(plR === '⛽ Tankuj' && !/Refuel/.test(plR), `H12a PL: „${plR}” — bez angielskiego słowa`);
  ok(plD === '🗑 Rozbiórka — wymaga stoczni' && !/Disband/.test(plD) && plRet.startsWith('🗑 Rozbiórka'), `H12b PL: „${plD}” — to samo słowo co „${plRet}”`);
  ok(enR === '⛽ Refuel' && enD === '🗑 Disband — requires shipyard', `H12c KONTROLA: EN bez zmian („${enR}”, „${enD}”)`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
