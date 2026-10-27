// ═══════════════════════════════════════════════════════════════════════════════
// ship_panel_outliner_smoke — KEEPER REFORMY ZAKŁADEK, T3 (panel statku przy prawym outlinerze)
// Rejestr: `docs/design/TABS_REFORM_PLAN.md` §5.2 (T3), §5.3, §6.0 (D-TR-7, 8, 9, 10, 13, 14); Findingi 529, 539, 542, 543.
// ─────────────────────────────────────────────────────────────────────────────
// Wyłącznie LOGIKA (protokół `HUD_PLAN.md` §4.0, aneks 2026-10-23): kotwica wiersz → prostokąt, zapas, tryb Y, mutex,
// wejścia, zwinięcie, rozbiórka z potwierdzeniem, klik ciała. Bez pinów na stałych rysunku (łącznik, wspólna krawędź —
// strojenie okiem). WYKONANIE: prawdziwy `Outliner` (rysunek na atrapie ctx → układ listy `_layout`), prawdziwy
// `FleetManagerOverlay` (`_handleHit` rozbiórki), prawdziwe `TacticalDock` i `HudLabelLayer` (wejścia); `UIManager`,
// `GameScene` i `ThreeRenderer` nie importują się pod node (THREE) — ich metody wycięte ze źródła (komentarze zdjęte)
// i wykonane z atrapą `this`.
//
// PINY:
//   S0  moduł `ShipPanelAnchorLogic` (flaga kroku `shipPanelOutliner` na stałe ON od T4 — predykat i klucz usunięte)
//   S1  kotwica wiersz → prostokąt: x = W − 150 − 300 (prawa krawędź = lewa krawędź kolumny), górna krawędź = wiersz
//       statku; 300 / 360; klamra do obszaru mapy (dół nad pasem — wiersz u dołu listy); okna 1280×720 i 1280×833
//   S2  przewinięcie: wiersz poza listą → kotwica przy górnej / dolnej krawędzi listy, łącznik tylko przy widocznym
//       wierszu; panel idzie za przewijaniem; statek w zwiniętym układzie → nagłówek układu; „W drodze”
//   S3  zapas (D-TR-8): kolumna ukryta („.”), overlay, Dok rozwinięty → kotwica zapasowa (geometria dawnego pływającego
//       panelu — klamra 4 px wyliczona w keeperze); powrót kolumny → wiersz
//   S4  `UIManager` (wykonanie wyciętych metod): `_shipPanelAtOutliner` = kotwica wiersza; bez przeciągania (dawny panel
//       pływający usunięty); tryb Y (D-TR-10, 542) — panel się nie rysuje, klik / kółko / blokada kamery wyłączone,
//       prostokąt panelu T5 zdjęty (`clear`)
//   S5  mutex (D-TR-9): N == 1 → panel statku; N ≥ 2 → grupa; węzeł floty → flota, zaznaczenie statku zdjęte
//   S6  wejścia ×5 (mapa, prawy outliner, Dok taktyczny, etykieta HUD, Tab) — każde daje N == 1 i panel przy wierszu
//   S7  zwinięcie: zmiana zaznaczenia → panel przy nowym wierszu; odznaczenie; Esc (kaskada bez zmian); przełączenie
//       układu — statek spoza układu docelowego zdjęty, z docelowego (Tab, 2. klik §7.8) zostaje
//   S8  rozbiórka (D-TR-13, 543): `fleet:disbandRequest` dopiero po potwierdzeniu (`_handleHit`)
//   S9  D-TR-14 (539): klik ciała / stacji na mapie nie zdejmuje zaznaczenia statku (scena + renderer); pustka — zdejmuje
//   S10 montaż: panel rysowany PO outlinerze (świeży układ listy w tej samej klatce); `seamRight`; klucz i18n
//   S11 STROJENIE 1 (Finding 545) — karta walki jako przeszkoda kotwicy, okno 1280×720, scena starcia (prawdziwy `CombatHUD`):
//       panel przy wierszu przesunięty w pionie nad kartę (łącznik, gdy wiersz w zasięgu), „Obserwuj” odsłonięte; brak
//       miejsca → kotwica zapasowa; KONTROLE: bez przeszkody panel zakrywa „Obserwuj”, bez starcia i w oknie właściciela —
//       bez zmian; kolejność kliku przy ON — panel przed kartą walki (rysunek = klik)
//   (S12 — przeszkoda kart z prostokąta panelu, Finding 544 — usunięty w T4-2 razem z kartą ciała i panelem stacji)
//   S13 STROJENIE 1 (Finding 547) — PL „🗑 Rozbiórka (zwrot 75%)”; tytuł okna potwierdzenia z tego samego klucza
//   ⚠ S4k (strojenie 1) — bramka kliku panelu w `_vesselPanelClick` (wołana z `handleClick` przed / po karcie walki).
//
// ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): flaga kroku `shipPanelOutliner` na stałe ON —
//   S0b / S0c (flaga) zastąpione pinem braku predykatu i klucza; sekcje OFF usunięte (S4c, S4e, S4g, S7l, S8i, S9e, S12e /
//   S12f; połowy OFF S7g, S9a); S3 — wyrocznia kotwicy zapasowej bez `FloatingPanel`; S4 / S10 / S11j / S11k — dawny panel
//   pływający (`_vesselPanelBounds`, przeciąganie, `drawVesselPanel` w `UIManager`) usunięty: kotwica wiersza z
//   `_shipPanelAtOutliner`, rysunek i klik panelu T5; S4b (wysokość 360 px dawnego panelu T3) — wysokość podaje panel T5.
//   T4-3 (dawny panel statku T3 usunięty z FMO): S10d — płyta `seamRight` zniknęła razem z `drawVesselPanel`.
//   T4-2 (karta ciała, panel stacji i dok usunięte): S11j — kolejność kliku bez panelu stacji (panel stacji nie łapie kliku);
//   S12 (przeszkoda kart: `getShipPanelObstacle`, `_noteShipPanelDrawn`) usunięty — kart, które omijały panel statku, nie ma.
// ⚠ Moduł POWSTAJE w T3 — import dynamiczny w try/catch (pin DEGRADUJE, nie przerywa suity).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { setLocale, t } from '../../i18n/i18n.js';
import { isEnemyVessel } from '../../entities/Vessel.js';
import { worldToGameplay } from '../../utils/CoordTransform.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { resolveVesselPanelAnchor, resolveMapSelectionSurface } from '../../ui/MapVesselPanelLogic.js';
import * as CI from '../../ui/ClickIntentLogic.js';
import { CombatHUD } from '../../ui/CombatHUD.js';

let SPA = null, OL = null, LO = null, MI = null;
try { SPA = await import('../../ui/ShipPanelAnchorLogic.js'); } catch { /* fail-first: piny padną */ }
try { OL = await import('../../ui/Outliner.js'); } catch { /* piny padną */ }
try { LO = await import('../../ui/LeftOutliner.js'); } catch { /* piny padną */ }
try { MI = await import('../../ui/MapInsets.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const body = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
const compileWith = (text, scope, thisArg) => {
  if (!text) return null;
  try {
    const names = Object.keys(scope);
    const make = new Function(...names, '__src', 'return eval("(" + __src + ")");');
    return make.call(thisArg, ...names.map((n) => scope[n]), text);
  } catch { return null; }
};
const compileMethod = (code, name, scope = {}) => {
  const b = body(code, `  ${name}(`);
  return b ? compileWith('function ' + b.trim().slice(name.length), scope, null) : null;
};
const call = (fn, self, ...a) => { try { return fn ? fn.apply(self, a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
const callAsync = async (fn, self, ...a) => { try { return fn ? await fn.apply(self, a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
const tick = () => new Promise((r) => (globalThis.__origSetTimeout ?? setTimeout)(r, 1));   // env odracza setTimeout(…, 0) do flusha
const FEATURES = GAME_CONFIG.FEATURES;

setLocale('pl');
const W = 1280;

const recCtx = () => {
  const calls = { text: [], rects: [] };
  let fillStyle = '#000';
  return new Proxy({}, {
    get(o, k) {
      if (k === '_calls') return calls;
      if (k === 'fillStyle') return fillStyle;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'fillText') return (s, x, y) => { calls.text.push({ s: String(s), x, y, fillStyle }); };
      if (k === 'fillRect') return (x, y, w, h) => { calls.rects.push({ x, y, w, h, fillStyle }); };
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};

// ── Świat: dom (Kepler-4799) z DŁUGĄ listą statków (przewijanie, wiersz u dołu), Alioth (zbadany), Bellatrix ──────────
const evs = [], ops = [];
for (const ev of ['vessel:focus', 'body:selected', 'station:selected', 'station:focus', 'fleet:disbandRequest']) EventBus.on(ev, (p) => evs.push([ev, p]));
const STARS = [
  { id: 'star_h', type: 'star', name: 'Kepler-4799', systemId: 'sys_home' },
  { id: 'star_a', type: 'star', name: 'Alioth', systemId: 'sys_A' },
  { id: 'star_b', type: 'star', name: 'Bellatrix', systemId: 'sys_B' },
];
const P1 = { id: 'P1', type: 'planet', name: 'Mstow', systemId: 'sys_home', orbital: { a: 1.0 }, explored: true };
const PA = { id: 'PA', type: 'planet', name: 'Alioth b', systemId: 'sys_A', orbital: { a: 1.0 }, explored: true };
const PB = { id: 'PB', type: 'planet', name: 'Bellatrix c', systemId: 'sys_B', orbital: { a: 1.0 }, explored: true };
EntityManager.clear?.();
for (const e of [...STARS, P1, PA, PB]) EntityManager.add(e);
const SYSTEMS = [
  { systemId: 'sys_home', galaxyStar: null },
  { systemId: 'sys_A', explored: true, galaxyStar: { id: 'sys_A', name: 'Alioth', distanceLY: 4.6, explored: true } },
  { systemId: 'sys_B', explored: false, galaxyStar: { id: 'sys_B', name: 'Bellatrix', distanceLY: 2.0, explored: false } },
];
const COLONIES = [{ planetId: 'P1', name: 'Mstow', isOutpost: false, isHomePlanet: true, ownerEmpireId: null, planet: P1 }];
const ship = (id, name, systemId, modules, position, extra = {}) => ({
  id, name, shipId: 'hull_small', systemId, modules, position, fuel: { current: 10, max: 10 }, warpFuel: { current: 0, max: 0 },
  status: 'idle', mission: null, movementOrder: null, fleetId: null, unpaidYears: 0, isWreck: false, ...extra,
});
const VESSELS = [
  ship('v1', 'Kurier', 'sys_home', ['engine_ion', 'cargo_small'], { state: 'docked', dockedAt: 'P1', x: 100, y: 0 }, { cargoMax: 100 }),
  ship('v2', 'Fregata', 'sys_home', ['engine_ion', 'weapon_laser'], { state: 'in_transit', dockedAt: null, x: 150, y: 0 }),
  ship('v3', 'Badacz', 'sys_A', ['engine_ion', 'deep_scanner'], { state: 'orbiting', dockedAt: 'PA', x: 100, y: 0 }),
  ship('v4', 'Straznik', 'sys_B', ['engine_ion', 'weapon_laser'], { state: 'in_transit', dockedAt: null, x: 100, y: 0 }),
  ship('v5', 'Skoczek', null, ['engine_warp'], { state: 'orbiting', dockedAt: null, x: 0, y: 0 }, { mission: { type: 'interstellar_jump', phase: 'warp_transit' } }),
  ship('v6', 'Miecz', 'sys_home', ['engine_ion', 'weapon_laser'], { state: 'orbiting', dockedAt: 'P1', x: 100, y: 0 }, { fleetId: 'f1' }),
  ship('v7', 'Tarcza', 'sys_home', ['engine_ion', 'weapon_laser'], { state: 'docked', dockedAt: 'P1', x: 100, y: 0 }, { fleetId: 'f1' }),
  ship('x1', 'Obcy', 'sys_home', ['engine_ion', 'weapon_laser'], { state: 'orbiting', dockedAt: 'P1', x: 100, y: 0 }, { ownerEmpireId: 'emp_001' }),
];
// 40 frachtowców w domu — lista dłuższa niż okno kolumny (przewijanie, wiersz u dołu).
for (let i = 1; i <= 40; i++) {
  const n = String(i).padStart(2, '0');
  VESSELS.push(ship(`c${n}`, `Frachtowiec ${n}`, 'sys_home', ['engine_ion', 'cargo_small'], { state: 'docked', dockedAt: 'P1', x: 100, y: 0 }, { cargoMax: 100 }));
}
const VMAP = new Map(VESSELS.map((v) => [v.id, v]));
const FLEETS = [{ id: 'f1', name: 'Grupa Alfa', memberIds: ['v6', 'v7'] }];

let overlayOpen = false, dockExpanded = false, dockRes = 0;
let sel = [], fleetSel = null;
// Atrapa `UIManager` (zaznaczenie) — `this` dla wyciętych metod `cycleSelectedVessel` i `_syncShipPanelOnSystemSwitch`.
const UM = {
  _selectedEntity: null,
  get _selectedVesselId() { return sel[0] ?? null; },
  get _selectedVesselIds() { return new Set(sel); },
  _dirty: false,
  getSelectedVesselIds: () => [...sel], getSelectedVesselId: () => sel[0] ?? null, getSelectedFleetId: () => fleetSel,
  setSelectedVesselId(id) { ops.push(['select', id]); sel = id == null ? [] : [id]; EventBus.emit('ui:selectionChanged', { vesselId: id, vesselIds: [...sel] }); },
  addToSelection(id) { ops.push(['add', id]); if (!sel.includes(id)) sel = [...sel, id]; },
  setSelectedFleetId(id) { ops.push(['selectFleet', id]); fleetSel = id; },
  toggleSelection: (id) => ops.push(['toggle', id]),
  clearSelection() { ops.push(['clear']); sel = []; },
  overlayManager: { isAnyOpen: () => overlayOpen, openPanel: (id, o) => ops.push(['openPanel', id, o ?? null]) },
};
const SSM = {
  activeSystemId: 'sys_home',
  getAllSystems: () => SYSTEMS,
  onSwitch: null,
  switchActiveSystem(s) { ops.push(['switch', s]); this.activeSystemId = s; K.activeSystemId = s; this.onSwitch?.(s); return true; },
};
const K = globalThis.window.KOSMOS;
const TR_STUB = { _pingedEnemyId: null, pingVessel: (id) => ops.push(['ping', id]), pingEnemyTarget: (id) => ops.push(['pingEnemy', id]),
  resetToSystemView: () => { ops.push(['reset']); return true; }, _isOnBodyDisc: () => false };
Object.assign(K, {
  civMode: true, planetGlobeOpen: false, activeSystemId: 'sys_home', uiPrefs: {},
  uiManager: UM, starSystemManager: SSM, threeRenderer: TR_STUB,
  stationPanel: { visible: false, _stationId: null, _float: { minimized: false } },
  tacticalDock: { isExpanded: () => dockExpanded, getReservedHeight: () => dockRes },
  colonyManager: { getAllColonies: () => COLONIES, getColony: (id) => COLONIES.find((c) => c.planetId === id) ?? null },
  stationSystem: { getAllStations: () => [] },
  vesselManager: { _vessels: VMAP, getVessel: (id) => VMAP.get(id) ?? null, getAllVessels: () => [...VMAP.values()], isImmobilized: () => false },
  fleetSystem: { listFleets: () => FLEETS, getFleet: (id) => FLEETS.find((f) => f.id === id) ?? null },
  deepSpaceCombatSystem: { _findActiveEncounterContaining: () => null },
  timeSystem: { gameTime: 10 },
});
K.leftOutliner = LO?.LeftOutliner ? new LO.LeftOutliner() : null;
const reset = (o = {}) => {
  evs.length = 0; ops.length = 0;
  sel = o.sel ?? []; fleetSel = o.fleet ?? null;
  overlayOpen = !!o.overlay; dockExpanded = !!o.dockExp; dockRes = o.dockRes ?? 0;
  SSM.activeSystemId = o.active ?? 'sys_home'; K.activeSystemId = SSM.activeSystemId;
  K.civMode = true; K.planetGlobeOpen = false; K.threeRenderer = TR_STUB;
};
const Outliner = OL?.Outliner;
const ro = Outliner ? new Outliner() : null;
K.rightOutliner = ro;
const draw = (H = 720) => { try { ro?.draw?.(recCtx(), W, H, { treeColonies: COLONIES, colonies: [], groundUnits: [] }); } catch { /* pin pada */ } };
const zoneOf = (id) => (ro?._clickTargets ?? []).find((z) => z.type === 'vessel' && z.vesselId === id) ?? null;
const sysZone = (id) => (ro?._clickTargets ?? []).find((z) => z.type === 'system' && z.systemId === id) ?? null;
const ins = () => MI?.getMapInsets?.(K) ?? { left: 0, right: 0, top: 28, bottom: 62 };

// ── Metody wycięte ze źródeł (UIManager / GameScene / ThreeRenderer nie importują się pod node) ────────────────────────
const UI = src('../../scenes/UIManager.js');
const GS = src('../../scenes/GameScene.js');
const TRS = src('../../renderer/ThreeRenderer.js');
const FMO_SRC = src('../../ui/FleetManagerOverlay.js');
const mShip = compileMethod(UI, '_shipPanelAtOutliner', {
  resolveRowAnchor: SPA?.resolveRowAnchor, shipRowKeys: SPA?.shipRowKeys, computeShipPanelPlacement: SPA?.computeShipPanelPlacement,
  getMapInsets: MI?.getMapInsets,
});
const mDockHidden = compileMethod(UI, '_shipPanelDockHidden', { GAME_CONFIG, shipPanelHiddenByDock: SPA?.shipPanelHiddenByDock });
const mPanelHit = compileMethod(UI, '_vesselPanelHit', {});
const mSyncSwitch = compileMethod(UI, '_syncShipPanelOnSystemSwitch', {
  GAME_CONFIG, syncShipPanelOnSystemSwitch: SPA?.syncShipPanelOnSystemSwitch,
});
const mCycle = compileMethod(UI, 'cycleSelectedVessel', { isEnemyVessel, clickObject: CI.clickObject, vesselTarget: CI.vesselTarget, EventBus });
const mPick = compileMethod(GS, '_selectFromClickPick', { GAME_CONFIG, isEnemyVessel, keepShipSelectionOnMapClick: SPA?.keepShipSelectionOnMapClick });
const mLeft = compileMethod(GS, '_handleTacticalLeftClick', { GAME_CONFIG, isEnemyVessel, worldToGameplay });
const mTrClick = compileMethod(TRS, 'handleClick', {
  EventBus, isEnemyVessel, CLICK_INTENT: CI.CLICK_INTENT, clickObject: CI.clickObject,
  resolveClickIntent: CI.resolveClickIntent, readClickSelection: CI.readClickSelection, applyClickIntent: CI.applyClickIntent,
});
// `UIManager._shipPanelAtOutliner` na atrapie: outliner, zaznaczony statek.
const shipPanel = (H = 720, panelH = 300) => { draw(H); return call(mShip, { _outliner: ro, _selectedVesselId: sel[0] ?? null }, W, H, 300, panelH); };

// ═══ S0 ═══════════════════════════════════════════════════════════════════════
header('S0  moduł (flaga kroku `shipPanelOutliner` na stałe ON od T4)');
{
  const API = ['SHIP_PANEL_W', 'shipRowKeys', 'resolveRowAnchor', 'computeShipPanelPlacement',
    'shipPanelHiddenByDock', 'syncShipPanelOnSystemSwitch', 'keepShipSelectionOnMapClick', 'confirmThenDisband'];
  ok(!!SPA && API.every((k) => k in SPA), `S0a ShipPanelAnchorLogic eksportuje: ${API.join(', ')}`);
  ok(!!SPA && SPA.isShipPanelOutlinerOn === undefined && FEATURES.shipPanelOutliner === undefined
    && !/\bshipPanelOutliner:\s*(true|false)/.test(src('../../config/GameConfig.js')),
    'S0b flaga kroku `shipPanelOutliner` na stałe ON (T4) — predykat `isShipPanelOutlinerOn` i klucz w GameConfig usunięte');
  ok(!!mShip && !!mDockHidden && !!mPanelHit && !!mSyncSwitch && !!mCycle && !!mPick && !!mLeft && !!mTrClick,
    'S0d metody T3 wycięte ze źródeł i skompilowane');
}

// ═══ S1 ═══════════════════════════════════════════════════════════════════════
// Lista (dom bieżący, przewinięcie 0): „W drodze” · Skoczek · Kepler-4799 · WOJENNE · Grupa Alfa (Miecz, Tarcza) · Fregata ·
// CARGO · Frachtowiec 01…40 · Kurier · Bellatrix · Alioth — okno listy 610 px przy 1280×720, treść dłuższa.
header('S1  kotwica wiersz → prostokąt (D-TR-7 (a))');
{
  reset(); ro._scrollY = 0; UM.setSelectedVesselId('v2'); draw();
  const z = zoneOf('v2');
  const p = shipPanel();
  ok(!!z, `S1-0 KONTROLA: wiersz „Fregata” w oknie listy (y ${z?.y})`);
  ok(p?.mode === 'row', `S1a SEDNO: tryb „wiersz” (jest: ${p?.mode})`);
  ok(p?.x === W - 150 - 300 && p.x + p.w === ro._rect?.x, `S1b x = W − 150 − 300 = ${W - 450}; prawa krawędź panelu = lewa krawędź kolumny (${p?.x} + ${p?.w} = ${ro._rect?.x})`);
  ok(!!z && p?.y === z.y, `S1c górna krawędź = górna krawędź wiersza (panel ${p?.y}, wiersz ${z?.y})`);
  ok(p?.w === 300 && p?.h === 300 && p?.seam === true && p?.tab?.y === z?.y && p?.tab?.h === z?.h,
    'S1d 300 × 300, wspólna krawędź, łącznik na wysokości wiersza');
  const p360 = shipPanel(720, 360);
  ok(p360?.h === 360 && p360?.x === p?.x && p360?.y === p?.y, 'S1e krok wyboru celu — 360 px, ta sama kotwica');
  // Wiersz u dołu okna listy (widoczny) — panel klamrowany nad pasem dolnym; łącznik dalej przy wierszu.
  reset({ sel: ['c29'] }); ro._scrollY = 0; draw();
  const zb = zoneOf('c29');
  const pb = shipPanel();
  const mapBottom = 720 - ins().bottom;
  ok(!!zb && zb.y + zb.h > mapBottom - 300, `S1f KONTROLA: wiersz „Frachtowiec 29” widoczny u dołu listy (y ${zb?.y}) — panel od wiersza wyszedłby pod pas`);
  ok(!!pb && !!zb && pb.y + pb.h === mapBottom && pb.y < zb.y, `S1g klamra: dół panelu = dół obszaru mapy (${pb ? pb.y + pb.h : '—'} = ${mapBottom}), panel podniesiony nad wiersz`);
  ok(!!pb?.tab && pb.tab.y === zb?.y && pb.tab.y >= pb.y && pb.tab.y + pb.tab.h <= pb.y + pb.h, 'S1h łącznik przy wierszu i w zasięgu panelu');
  // Okno właściciela (logicznie 1280×833): ta sama reguła, dłuższe okno listy.
  reset(); ro._scrollY = 0; UM.setSelectedVesselId('v2');
  const p833 = shipPanel(833); const z833 = zoneOf('v2');
  ok(!!z833 && p833?.x === W - 450 && p833?.y === z833.y, `S1i 1280×833: x ${p833?.x}, y = wiersz (${z833?.y})`);
  ok((p?.x ?? 0) >= 150, `S1j 1280×720: panel x ${p?.x}–${(p?.x ?? 0) + 300} — nie zasłania lewego outlinera (0–150)`);
}

// ═══ S2 ═══════════════════════════════════════════════════════════════════════
header('S2  przewinięcie listy, układ zwinięty, „W drodze”');
{
  reset({ sel: ['c05'] }); ro._scrollY = 0; draw();
  const L = ro._layout;
  const maxS = ro._maxScroll;
  ok(maxS > 0, `S2-0 KONTROLA: lista dłuższa niż okno (maxScroll ${maxS})`);
  ok(!!L && L.rows?.has?.('vessel:c05'), 'S2-0b układ listy z ostatniej klatki (`Outliner._layout`) — wiersze z kluczami');
  // panel idzie za przewijaniem (wiersz widoczny w obu położeniach, bez klamry)
  const at = (s) => { ro._scrollY = s; draw(); return { z: zoneOf('c05'), p: shipPanel() }; };
  const s1 = Math.min(maxS, 40), s2 = Math.min(maxS, 100);
  const a = at(s1), b = at(s2);
  ok(s2 > s1, `S2-1 KONTROLA: dwa różne przewinięcia (${s1}, ${s2})`);
  ok(!!a.z && !!b.z && a.p?.y === a.z.y && b.p?.y === b.z.y && a.p.y - b.p.y === s2 - s1,
    `S2a SEDNO: panel idzie za wierszem przy przewijaniu (y ${a.p?.y} → ${b.p?.y})`);
  // wiersz przewinięty POWYŻEJ okna → kotwica przy górnej krawędzi listy, bez łącznika
  reset({ sel: ['v2'] }); ro._scrollY = maxS; draw();
  const pt = shipPanel();
  ok(!zoneOf('v2') && !!zoneOf('c40'), 'S2b-0 KONTROLA: „Fregata” nad oknem, świadek „Frachtowiec 40” w oknie');
  ok(pt?.edge === 'top' && pt.y === ro._layout?.contentTop && pt.tab === null,
    `S2b wiersz nad oknem listy → panel przy górnej krawędzi listy (y ${pt?.y} = ${ro._layout?.contentTop}), bez łącznika`);
  // wiersz przewinięty PONIŻEJ okna → kotwica przy dolnej krawędzi listy (klamra nad pasem), bez łącznika
  reset({ sel: ['c40'] }); ro._scrollY = 0; draw();
  const pbm = shipPanel();
  ok(!zoneOf('c40') && !!zoneOf('c01'), 'S2c-0 KONTROLA: „Frachtowiec 40” pod oknem, świadek „Frachtowiec 01” w oknie');
  ok(pbm?.edge === 'bottom' && pbm.y + pbm.h === 720 - ins().bottom && pbm.tab === null,
    `S2c wiersz pod oknem listy → panel przy dolnej krawędzi (dół ${pbm ? pbm.y + pbm.h : '—'}), bez łącznika`);
  // statek w ZWINIĘTYM układzie → nagłówek układu
  reset(); ro._scrollY = 0; UM.setSelectedVesselId('v3'); draw();
  ok(!!zoneOf('v3'), 'S2d KONTROLA: zaznaczenie rozwija układ statku i przewija do wiersza (§7.12) — „Badacz” w oknie');
  ro.toggleExpanded('sys_A', 'sys_home'); draw();
  const sz = sysZone('sys_A');
  const an = SPA?.resolveRowAnchor?.(ro._layout, SPA?.shipRowKeys?.('v3', ro._layout?.result));
  const pc = shipPanel();
  ok(!zoneOf('v3') && !!sz && an?.key === 'system:sys_A' && an?.viaSection === true,
    `S2e układ zwinięty przez gracza → kotwica przy nagłówku „Alioth” (klucz ${an?.key})`);
  ok(pc?.mode === 'row' && !!pc?.tab && pc.tab.y === sz?.y, `S2f łącznik przy nagłówku układu (y ${pc?.tab?.y} = ${sz?.y})`);
  ro._expanded.clear();
  // statek w skoku — „W drodze”
  reset({ sel: ['v5'] }); ro._scrollY = 0; draw();
  const zt = zoneOf('v5');
  const ptr = shipPanel();
  ok(!!zt && ptr?.mode === 'row' && ptr.y === zt.y, `S2g statek w skoku — panel przy wierszu w „W drodze” (y ${ptr?.y})`);
}

// ═══ S3 ═══════════════════════════════════════════════════════════════════════
header('S3  zapas (D-TR-8 (a)) — kotwica zapasowa (geometria dawnego pływającego panelu)');
{
  // Wyrocznia: obszar mapy z marginesem 8 px, `resolveVesselPanelAnchor(null)` (prawy górny róg), klamra 4 px — arytmetyka
  // dawnego `FloatingPanel._clamp` (moduł usunięty w T4) wyliczona tu, niezależnie od `computeShipPanelPlacement`.
  const legacy = (H, h) => {
    const i = ins(); const oy = i.top + 8;
    const b = { ox: i.left + 8, oy, ow: Math.max(80, W - i.left - i.right - 16), oh: Math.max(60, H - i.bottom - oy) };
    const a = resolveVesselPanelAnchor(null, 1, b, 300, h, 24);
    const minX = b.ox + 4, maxX = Math.max(minX, b.ox + b.ow - 300 - 4), minY = b.oy + 4, maxY = Math.max(minY, b.oy + b.oh - h - 4);
    return { x: Math.max(minX, Math.min(maxX, a.x)), y: Math.max(minY, Math.min(maxY, a.y)) };
  };
  reset({ sel: ['v1'] }); ro.visible = false;
  const p = shipPanel();
  const l = legacy(720, 300);
  ok(p?.mode === 'fallback' && p.x === l.x && p.y === l.y && p.seam === false && p.tab === null,
    `S3a SEDNO: kolumna schowana („.”) → kotwica zapasowa (${p?.x},${p?.y} = ${l.x},${l.y}), pełna ramka`);
  ok(p?.x === W - 320, `S3b prawy górny róg obszaru mapy bez kolumny (x ${p?.x} = W − 320)`);
  ro.visible = true;
  const back = shipPanel();
  ok(back?.mode === 'row' && back.x === W - 450, 'S3c kolumna wraca → panel wraca do wiersza');
  reset({ sel: ['v1'], overlay: true });
  const po = shipPanel();
  ok(po?.mode === 'fallback', 'S3d overlay pełnoekranowy (kolumna ukryta) → zapas (panel i tak się nie rysuje — bramka overlayu)');
  reset({ sel: ['v1'], dockExp: true, dockRes: 84 });
  const pd = shipPanel();
  ok(pd?.mode === 'fallback', 'S3e rozwinięty Dok → kolumna ukryta → geometria zapasowa (rysunek wyłącza tryb Y — S4)');
  reset({ sel: ['v1'] });
}

// ═══ S4 ═══════════════════════════════════════════════════════════════════════
header('S4  UIManager — `_shipPanelAtOutliner`, bez przeciągania, tryb Y (D-TR-10)');
{
  reset({ sel: ['v2'] }); ro._scrollY = 0; draw();
  const self = { get _selectedVesselId() { return sel[0] ?? null; }, _outliner: ro };
  const on = call(mShip, self, W, 720, 200, 300);
  const z = zoneOf('v2');
  ok(!!z && on?.x === W - 350 && on?.y === z.y && on?.mode === 'row', `S4a SEDNO: \`_shipPanelAtOutliner\` (panel T5, 200 px) = kotwica wiersza (${on?.x},${on?.y})`);
  const on260 = call(mShip, self, W, 720, 260, 300);
  ok(on260?.x === W - 410 && on260?.y === z?.y && on260?.w === 260, 'S4b konfigurator (260 px) — przy wierszu, prawa krawędź nadal przy kolumnie');
  // przeciąganie — dawny panel pływający usunięty
  ok(!/tryBeginVesselPanelDrag|handleVesselPanelDragMove|endVesselPanelDrag|_vesselPanelFloat|_vesselPanelBounds/.test(UI),
    'S4d bez przeciągania — `UIManager` nie ma już dawnego panelu pływającego (przeciąganie, `_vesselPanelBounds`)');
  // tryb Y
  const dock = (exp) => ({ tacticalDock: { isExpanded: () => exp } });
  ok(call(mDockHidden, dock(true)) === true && call(mDockHidden, dock(false)) === false, 'S4f tryb Y: rozwinięty Dok chowa panel statku, zwinięty — nie');
  const hitSelf = (hidden) => ({ _shipPanelHud: { rect: { x: 100, y: 100, w: 200, h: 300 } }, _shipPanelDockHidden: () => hidden });
  ok(call(mPanelHit, hitSelf(true), 200, 200) === false, 'S4h blokada kamery (`_vesselPanelHit`) wyłączona przy panelu schowanym przez Dok');
  ok(call(mPanelHit, hitSelf(false), 200, 200) === true, 'S4h-k KONTROLA: panel widoczny — kursor nad nim blokuje kamerę (jak dziś)');
  const dr = body(UI, '  _draw() {');
  ok(/!this\._shipPanelDockHidden\(\) && this\._mapSurface\(\) === 'vessel'\) \{/.test(dr), 'S4i rysunek panelu za bramką trybu Y');
  ok(/if \(!shipPanelHudDrawn\) this\._shipPanelHud\?\.clear\?\.\(\);/.test(dr),
    'S4j panel schowany przez Dok (nienarysowany) — `clear`: prostokąt z poprzedniej klatki zdjęty (klik, kółko, przeszkoda etykiet HUD)');
  const hc = body(UI, '  handleClick(x, y) {');
  const hw = body(UI, '  handleWheel(rawX, rawY, deltaY, rawDeltaY = deltaY) {');
  const vpc = body(UI, '  _vesselPanelClick(x, y) {');
  ok(/!this\._shipPanelDockHidden\(\) && this\._shipPanelHud\.handleClick\(x, y,/.test(vpc)
    && /this\._vesselPanelClick\(x, y\)/.test(hc)
    && /!this\._shipPanelDockHidden\(\) && this\._shipPanelHud\?\.handleWheel\?\.\(x, y, delta\)/.test(hw),
    'S4k klik i kółko panelu za bramką trybu Y (klik — `_vesselPanelClick`, wołany z `handleClick`)');
}

// ═══ S5 ═══════════════════════════════════════════════════════════════════════
header('S5  mutex (D-TR-9 (a))');
{
  ok(resolveMapSelectionSurface(['v1'], { flagOn: true }) === 'vessel' && resolveMapSelectionSurface(['v1', 'v2'], { flagOn: true }) === 'group'
    && resolveMapSelectionSurface([], { flagOn: true }) === 'none', 'S5a KONTROLA (D-TR-9 — bez zmian): N == 1 → panel statku; N ≥ 2 → panel grupy; brak → nic');
  reset({ sel: ['v1'] }); draw();
  const fz = (ro?._clickTargets ?? []).find((q) => q.type === 'fleet' && q.fleetId === 'f1');
  ok(!!fz, 'S5b KONTROLA: węzeł floty „Grupa Alfa” w liście');
  if (fz) ro.hitTest(fz.x + 60, fz.y + fz.h / 2, W, 720);
  ok(JSON.stringify(ops) === '[["selectFleet","f1"],["select",null]]' && sel.length === 0,
    `S5c KONTROLA (D-TR-9 — bez zmian): węzeł floty → menu floty, zaznaczenie statku zdjęte — panel statku się zwija (ops ${JSON.stringify(ops)})`);
}

// ═══ S6 ═══════════════════════════════════════════════════════════════════════
header('S6  wejścia ×5 — N == 1 i panel przy wierszu statku');
{
  const atRow = (id) => { ro._scrollY = 0; draw(); draw(); const p = shipPanel(); const z = zoneOf(id); return !!z && p?.mode === 'row' && p.y === z.y && sel.length === 1 && sel[0] === id; };
  // mapa — scena zaznacza z pickera renderera (`_selectFromClickPick`)
  reset(); call(mPick, { uiManager: UM }, 'v2', false, null, null);
  ok(atRow('v2'), 'S6a mapa 3D (picker renderera) → „Fregata”, panel przy jej wierszu');
  // prawy outliner — wiersz statku
  reset(); ro._scrollY = 0; draw(); const z1 = zoneOf('c03'); if (z1) ro.hitTest(z1.x + 60, z1.y + z1.h / 2, W, 720);
  ok(atRow('c03') && ops.some((o) => o[0] === 'ping' && o[1] === 'c03'), 'S6b prawy outliner → „Frachtowiec 03” (w doku — ping), panel przy jego wierszu');
  // Dok taktyczny — wiersz
  reset();
  let TD = null; try { TD = new (await import('../../ui/TacticalDock.js')).TacticalDock(); } catch { /* pin pada */ }
  call(TD?._onHit, TD, { type: 'row', data: { id: 'c05' } });
  ok(atRow('c05'), 'S6c Dok taktyczny (wiersz) → „Frachtowiec 05”, panel przy jego wierszu');
  // etykieta HUD statku
  reset();
  let HL = null; try { HL = new (await import('../../ui/HudLabelLayer.js')).HudLabelLayer(); } catch { /* pin pada */ }
  if (HL) HL._zones = [{ x: 300, y: 300, w: 60, h: 12, key: 'v:c07', kind: 'vessel', target: CI.vesselsTarget(['c07'], 'sys_home') }];
  const hl = call(HL?.handleClick, HL, 320, 305, 320, 305);
  ok(hl === true && atRow('c07'), 'S6d etykieta HUD statku → „Frachtowiec 07”, panel przy jego wierszu');
  // Tab
  reset({ sel: ['c10'] });
  call(mCycle, UM, 1);
  ok(sel.length === 1 && sel[0] === 'c11' && atRow('c11'), `S6e Tab → następny statek „Frachtowiec 11”, panel przy jego wierszu (zaznaczony ${sel[0]})`);
}

// ═══ S7 ═══════════════════════════════════════════════════════════════════════
header('S7  zwinięcie — zmiana zaznaczenia, odznaczenie, Esc, przełączenie układu');
{
  reset({ sel: ['v2'] }); ro._scrollY = 0; const p1 = shipPanel(); const z1 = zoneOf('v2');
  UM.setSelectedVesselId('c05'); const p2 = shipPanel(); const z2 = zoneOf('c05');
  ok(!!z1 && !!z2 && p1?.y === z1.y && p2?.y === z2.y && p1.y !== p2.y, `S7a zmiana zaznaczenia → panel przeskakuje do nowego wiersza (${p1?.y} → ${p2?.y})`);
  ok(resolveMapSelectionSurface([]) === 'none', 'S7b KONTROLA: odznaczenie → brak powierzchni (panel się zwija, jak dziś)');
  const esc = GS.slice(GS.indexOf("if (e.key === 'Escape') {"), GS.indexOf("if (e.key === 'Enter' && um?.isPickerActive?.())"));
  const iP = esc.indexOf('um.cancelPickerMode()'), iR = esc.indexOf('rcm.hide()'), iS = esc.indexOf('um.clearSelection()');
  ok(iP > 0 && iR > iP && iS > iR, 'S7c KONTROLA: Esc — kaskada bez zmian: picker → menu PPM → zaznaczenie statku (panel się zwija)');
  // przełączenie układu — czysta reguła
  const f = SPA?.syncShipPanelOnSystemSwitch;
  let cleared = 0; const clr = () => cleared++;
  const V = (sys) => ({ id: 'q', systemId: sys });
  ok(call(f, null, { vesselIds: ['q'], vessel: V('sys_home'), systemId: 'sys_A', clear: clr }) === 'clear' && cleared === 1,
    'S7d SEDNO: statek spoza układu docelowego → zaznaczenie zdjęte');
  ok(call(f, null, { vesselIds: ['q'], vessel: V('sys_A'), systemId: 'sys_A', clear: clr }) === 'keep' && cleared === 1,
    'S7e statek w układzie docelowym → zostaje');
  ok(call(f, null, { vesselIds: ['q'], vessel: V(null), systemId: 'sys_A', clear: clr }) === 'clear' && cleared === 2,
    'S7f statek w skoku (układ `null`) → zdjęty');
  ok(call(f, null, { vesselIds: ['q', 'r'], vessel: V('sys_home'), systemId: 'sys_A', clear: clr }) === null && cleared === 2,
    'S7g grupa N ≥ 2 — bez zmian (D-TR-9)');
  // słuchacz w UIManagerze (wycięta metoda) + rejestracja
  reset({ sel: ['v1'] });
  call(mSyncSwitch, UM, 'sys_A');
  ok(JSON.stringify(ops) === '[["clear"]]' && sel.length === 0, 'S7h UIManager `_syncShipPanelOnSystemSwitch`: „Kurier” (dom) przy przejściu do Alioth — zdjęty (wykonanie)');
  reset({ sel: ['v1'] }); call(mSyncSwitch, UM, 'sys_home');
  ok(ops.length === 0 && sel[0] === 'v1', 'S7i KONTROLA: układ docelowy = układ statku — zaznaczenie zostaje');
  ok(/EventBus\.on\('system:switched', \(ev\) => \{ this\._syncShipPanelOnSystemSwitch\(ev\?\.systemId \?\? null\); \}\);/.test(UI),
    'S7j słuchacz `system:switched` zarejestrowany w UIManagerze');
  // Tab na statek z innego układu: zaznaczenie PRZED przełączeniem → panel zostaje przy wierszu po przełączeniu
  reset({ sel: ['v2'] });
  const save = new Map(VMAP); VMAP.clear(); for (const id of ['v2', 'v3']) VMAP.set(id, save.get(id));
  let syncRes = null;
  SSM.onSwitch = (s) => { syncRes = call(mSyncSwitch, UM, s); };
  call(mCycle, UM, 1);
  SSM.onSwitch = null;
  VMAP.clear(); for (const [k, v] of save) VMAP.set(k, v);
  ok(ops.some((o) => o[0] === 'switch' && o[1] === 'sys_A') && syncRes === 'keep' && sel[0] === 'v3' && !ops.some((o) => o[0] === 'clear'),
    `S7k Tab na „Badacza” (Alioth): przełączenie układu, słuchacz T3 „zostaje” — panel przy wierszu (sync ${syncRes}, ops ${JSON.stringify(ops)})`);
  reset();
}

// ═══ S8 ═══════════════════════════════════════════════════════════════════════
header('S8  rozbiórka z potwierdzeniem (D-TR-13 (a), Finding 543)');
{
  const f = SPA?.confirmThenDisband;
  const got = [];
  const emit = (n, p) => got.push([n, p]);
  let resolveC; const pending = new Promise((r) => { resolveC = r; });
  const pr = typeof f === 'function' ? f({ vesselId: 'v1', confirm: () => pending, isAlive: () => true, emit }) : null;
  ok(typeof f === 'function' && pr instanceof Promise && got.length === 0, 'S8a SEDNO: przed potwierdzeniem — brak `fleet:disbandRequest`');
  resolveC(true); const r1 = pr ? await pr : null;
  ok(r1 === true && JSON.stringify(got) === '[["fleet:disbandRequest",{"vesselId":"v1"}]]', 'S8b po „Rozwiąż” — jedno żądanie');
  got.length = 0;
  ok(await callAsync(f, null, { vesselId: 'v1', confirm: async () => false, emit }) === false && got.length === 0, 'S8c anulowanie (przycisk / Esc / tło) — nic');
  ok(await callAsync(f, null, { vesselId: 'v1', confirm: async () => { throw new Error('okno'); }, emit }) === false && got.length === 0, 'S8d wyjątek okna — nic');
  ok(await callAsync(f, null, { vesselId: 'v1', confirm: async () => true, isAlive: () => false, emit }) === false && got.length === 0,
    'S8e statek zniknął w trakcie (wrak, rozbiórka) — nic');
  // prawdziwy FleetManagerOverlay: `_handleHit` strefy rozbiórki
  let FMO = null; try { FMO = (await import('../../ui/FleetManagerOverlay.js')).FleetManagerOverlay; } catch { /* pin pada */ }
  const fmo = FMO ? new FMO() : null;
  const disbands = () => evs.filter((e) => e[0] === 'fleet:disbandRequest');
  reset({ sel: ['v1'] }); if (fmo) fmo._selectedVesselId = 'v1';
  let res2; const pend2 = new Promise((r) => { res2 = r; });
  if (fmo) fmo._confirmVesselDisband = () => pend2;
  call(fmo?._handleHit, fmo, { type: 'disband', data: { vesselId: 'v1' } });
  await tick();
  ok(!!fmo && disbands().length === 0 && sel[0] === 'v1', 'S8f `_handleHit`: okno otwarte — żądania brak, statek nadal zaznaczony');
  const before = disbands().length;
  res2(true); await tick(); await tick();
  ok(before === 0 && disbands().length === 1 && disbands()[0][1]?.vesselId === 'v1' && sel.length === 0,
    `S8g po potwierdzeniu — żądanie (przed: ${before}, po: ${disbands().length}) i zaznaczenie zdjęte (jak dotąd po rozbiórce)`);
  reset({ sel: ['v1'] }); if (fmo) { fmo._selectedVesselId = 'v1'; fmo._confirmVesselDisband = async () => false; }
  call(fmo?._handleHit, fmo, { type: 'disband', data: { vesselId: 'v1' } });
  await tick(); await tick();
  ok(!!fmo && disbands().length === 0 && sel[0] === 'v1', 'S8h anulowanie — bez żądania, statek zaznaczony');
  reset();
  const conf = body(FMO_SRC, '  async _confirmVesselDisband(vessel) {');
  ok(/showConfirmModal\(\{[\s\S]*?t\('fleet\.disbandVesselConfirm'/.test(conf) && /danger:\s*true/.test(conf),
    'S8j okno: istniejący `ConfirmModal` (Esc / tło = anuluj), treść `fleet.disbandVesselConfirm`, przycisk niebezpieczny');
  ok(t('fleet.disbandVesselConfirm', 'Kurier') !== 'fleet.disbandVesselConfirm' && t('fleet.disbandVesselConfirm', 'Kurier').includes('Kurier'),
    'S8k klucz i18n istnieje (PL) i wstawia nazwę statku');
}

// ═══ S9 ═══════════════════════════════════════════════════════════════════════
header('S9  D-TR-14 (a), Finding 539 — klik ciała / stacji na mapie nie zdejmuje zaznaczenia statku');
{
  const k = SPA?.keepShipSelectionOnMapClick;
  ok(call(k, null, 'body') === true && call(k, null, 'station') === true && call(k, null, null) === false,
    'S9a reguła: ciało i stacja zachowują zaznaczenie, pustka nie');
  const run = (objectHit) => { reset({ sel: ['v1'] }); call(mPick, { uiManager: UM }, null, false, null, objectHit); return [...ops]; };
  ok(JSON.stringify(run('body')) === '[]' && sel[0] === 'v1', 'S9b SEDNO: klik tarczy ciała → zaznaczenie statku zostaje (scena)');
  ok(JSON.stringify(run('station')) === '[]', 'S9c klik modelu stacji → zaznaczenie zostaje');
  ok(JSON.stringify(run(null)) === '[["clear"]]', 'S9d KONTROLA: pusta mapa → odznaczenie (jak dziś)');
  // `_handleTacticalLeftClick` (gałąź canvas — zwykła gra) przekazuje trafienie z pickera renderera
  const G = { planetScene: null, uiManager: UM, _resolveClickTarget: () => null, _selectFromClickPick: mPick, threeRenderer: {} };
  const ev = { target: { id: 'planet-canvas', tagName: 'CANVAS', closest: () => null }, ctrlKey: false, clientX: 640, clientY: 360 };
  reset({ sel: ['v1'] }); call(mLeft, G, ev, { vesselId: null, object: 'body' });
  ok(ops.length === 0 && sel[0] === 'v1', 'S9f `_handleTacticalLeftClick` (canvas): trafienie ciała z pickera → zaznaczenie zostaje');
  reset({ sel: ['v1'] }); call(mLeft, G, ev, { vesselId: null });
  ok(JSON.stringify(ops) === '[["clear"]]', 'S9g KONTROLA: bez trafienia obiektu → odznaczenie');
  // renderer: `lastClickPick.object` przy stacji / ciele, brak przy statku i pustce
  const R = { _pickVesselForClick: () => null, _mouse: {}, camera: {}, _stations: new Map(), _clickable: [], _entityByUUID: new Map(),
    _ray: { hitsStation: [], hitsBody: [], setFromCamera() {}, intersectObjects(objs, rec) { return rec ? this.hitsStation : this.hitsBody; } },
    _pingedEnemyId: null, pingEnemyTarget: () => {}, resetToSystemView: () => {} };
  K.threeRenderer = R;
  const pickOf = (o) => {
    reset(); K.threeRenderer = R;
    R._pickVesselForClick = () => o.pick ?? null;
    R._stations = new Map(o.station ? [['s1', { mesh: {} }]] : []);
    R._ray.hitsStation = o.station ? [{ object: { userData: { stationId: 's1' } } }] : [];
    R._ray.hitsBody = o.body ? [{ object: { uuid: 'u1' } }] : [];
    R._entityByUUID = new Map(o.body ? [['u1', P1]] : []);
    call(mTrClick, R, 640, 360, {});
    return R.lastClickPick;
  };
  ok(pickOf({ station: true })?.object === 'station' && pickOf({ body: true })?.object === 'body', 'S9h renderer: trafienie stacji / ciała zapisane w `lastClickPick.object`');
  ok(pickOf({ pick: 'v1' })?.object === undefined && pickOf({})?.object === undefined && pickOf({})?.vesselId === null,
    'S9i KONTROLA: statek i pustka — bez obiektu (scena rozstrzyga jak dziś)');
  K.threeRenderer = TR_STUB;
}

// ═══ S10 ══════════════════════════════════════════════════════════════════════
header('S10 montaż');
{
  const dr = body(UI, '  _draw() {');
  const iOut = dr.indexOf('this._outliner.draw('), iPanel = dr.indexOf('this._drawShipPanelHud(ctx, W, H)');
  ok(iOut > 0 && iPanel > iOut, 'S10a KONTROLA: rysunek — prawy outliner PRZED panelem statku (układ listy z tej samej klatki)');
  const sph = body(UI, '  _drawShipPanelHud(ctx, W, H) {');
  ok(/const p = this\._shipPanelAtOutliner\(W, H, size\.w, size\.h\);/.test(sph) && /if \(p\.tab\) this\._drawShipPanelTab\(ctx, p\);/.test(sph),
    'S10b panel przy wierszu — kotwica `_shipPanelAtOutliner` i łącznik (`_drawShipPanelTab`)');
  ok(FMO_SRC.length > 100000 && !/\bdrawVesselPanel\b|\bseamRight\b/.test(FMO_SRC),
    'S10d płyta dawnego panelu T3 (`seamRight`, `drawVesselPanel`) usunięta z FMO razem z panelem (T4-3); panel T5 rysuje się bez ramki');
  const pl = readFileSync(new URL('../../i18n/pl.js', import.meta.url), 'utf8');
  const en = readFileSync(new URL('../../i18n/en.js', import.meta.url), 'utf8');
  ok(/'fleet\.disbandVesselConfirm':/.test(pl) && /'fleet\.disbandVesselConfirm':/.test(en), 'S10e klucz `fleet.disbandVesselConfirm` w PL i EN');
}

// ═══ S11 ══════════════════════════════════════════════════════════════════════
header('S11 strojenie 1 (Finding 545) — karta walki jako przeszkoda kotwicy, okno 1280×720, scena starcia');
{
  // Prawdziwy `CombatHUD` na atrapie kanwy; świat starcia podstawiony na czas rysowania karty (geometria karty jak w grze).
  const hudCtx = () => ({ font: '10px monospace', textAlign: 'left',
    measureText(s) { const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1]) || 10; return { width: [...String(s)].length * px * 0.6 }; },
    fillText() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {} });
  const mkEnc = (id, nA, nB, round = 1) => {
    const states = new Map(), vessels = new Map();
    const ids = (n, side) => Array.from({ length: n }, (_, i) => {
      const vid = `${id}_${side}${i}`;
      states.set(vid, { hp: 100, hpStart: 120, weapons: [{ moduleId: 'weapon_laser' }] });
      vessels.set(vid, { id: vid, name: `Okręt ${side}${i}`, hullId: 'hull_frigate' });
      return vid;
    });
    const a = ids(nA, 'a'), b = ids(nB, 'b');
    const timeline = [];
    for (let r = 1; r <= round; r++) timeline.push({ round: r, events: [
      { attacker: b[0], target: a[0], weapon: 'weapon_missile', hit: true, damage: 10, blockedByShield: 0 },
      { attacker: a[0], target: b[0], weapon: 'weapon_laser', hit: true, damage: 13, blockedByShield: 0 }] });
    return { enc: { id, isActive: true, currentRound: round, timeline, location: { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
      sideA: { vesselIds: a, joinedVesselIds: [], ownerEmpireId: 'player', label: 'Gracz' },
      sideB: { vesselIds: b, joinedVesselIds: [], ownerEmpireId: 'emp_001', label: 'Konsorcjum' }, vesselStates: states }, vessels };
  };
  const hudOf = (encs, H) => {
    const vessels = new Map(); for (const e of encs) for (const [k, v] of e.vessels) vessels.set(k, v);
    const saved = globalThis.window.KOSMOS;
    globalThis.window.KOSMOS = { civMode: true, activeSystemId: 'sys_home', deepSpaceCombatSystem: { listActive: () => encs.map((e) => e.enc) },
      vesselManager: { _vessels: vessels }, starSystemManager: { getAllSystems: () => [] }, tacticalDock: { getReservedHeight: () => 0 } };
    const hud = new CombatHUD();
    try { hud.draw(hudCtx(), W, H); } catch { /* pin pada */ } finally { globalThis.window.KOSMOS = saved; }
    return hud;
  };
  const over = (a, b) => !!a && !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const PAD = SPA?.SHIP_PANEL_OBSTACLE_PAD ?? NaN;
  const panelWith = (hud, H = 720, panelH = 300) => { draw(H); return call(mShip, { _outliner: ro, _selectedVesselId: sel[0] ?? null, combatHud: hud }, W, H, 300, panelH); };
  // Lista jak w S1: układy jak domyślnie, bez zaległego przewinięcia do wiersza z poprzednich sekcji (`_revealKey`).
  const pick = (id) => { reset(); ro._expanded.clear(); ro._revealKey = null; ro._scrollY = 0; UM.setSelectedVesselId(id); };
  const hud1 = hudOf([mkEnc('e1', 1, 1)], 720);
  const card = hud1.getPanelRect(), watch = hud1._watchBtns?.[0] ?? null;
  ok(!!card && !!watch && card.y + card.h <= 720,
    `S11-0 KONTROLA: karta walki narysowana (x ${card?.x}–${card ? card.x + card.w : '—'}, y ${card?.y}–${card ? card.y + card.h : '—'}), „Obserwuj” x ${watch?.x}`);
  // A — scena K10b: pierwszy statek listy, którego panel przy wierszu (bez przeszkody) sięga przycisku „Obserwuj”
  let idA = null, plain = null;
  for (const id of ['v2', 'c01', 'c02', 'c03', 'c04', 'c05', 'c06']) {
    pick(id); const pp = panelWith(null);
    if (over(pp, card) && over(pp, watch)) { idA = id; plain = pp; break; }
  }
  pick(idA ?? 'v2');
  const z = zoneOf(idA ?? 'v2');
  const p = panelWith(hud1);
  ok(!!idA && over(plain, card) && over(plain, watch),
    `S11a KONTROLA: bez przeszkody panel przy wierszu „${idA}” (y ${plain?.y}–${plain ? plain.y + plain.h : '—'}) zakrywa kartę i „Obserwuj” — scena odtwarza 545 (K10b)`);
  ok(p?.mode === 'row' && p.shifted === true && !over(p, card) && p.x === W - 450 && p.y >= ins().top,
    `S11b SEDNO: panel przy kolumnie przesunięty w pionie nad kartę (y ${p?.y}–${p ? p.y + p.h : '—'}) — karta i „Obserwuj” odsłonięte`);
  ok(!!card && p?.y === card.y - PAD - 300, `S11c najbliższe wolne położenie — dół panelu ${PAD} px nad kartą (${p ? p.y + p.h : '—'} = ${card ? card.y - PAD : '—'})`);
  ok(!!z && p?.shifted === true && p.tab?.y === z.y && p.y <= z.y && z.y + z.h <= p.y + p.h, `S11d wiersz w zasięgu przesuniętego panelu — łącznik zostaje (y ${p?.tab?.y})`);
  // B — wiersz u dołu listy: panel nad kartą, wiersz poza jego zasięgiem — bez łącznika
  pick('c29');
  const pb = panelWith(hud1); const zb = zoneOf('c29');
  ok(pb?.mode === 'row' && pb.shifted === true && !over(pb, card) && pb.tab === null && !!zb && zb.y > pb.y + pb.h,
    `S11e wiersz u dołu listy (y ${zb?.y}) poza zasięgiem panelu nad kartą (y ${pb?.y}) — bez łącznika, panel przy kolumnie`);
  // C — dwa starcia (karta wysoka) i krok wyboru celu (360 px): brak miejsca nad i pod kartą → kotwica zapasowa
  const hud2 = hudOf([mkEnc('e1', 2, 2, 7), mkEnc('e2', 1, 1, 7)], 720);
  const card2 = hud2.getPanelRect();
  pick('v2');
  const p360 = panelWith(hud2, 720, 360);
  const p300 = panelWith(hud2, 720, 300);
  ok(!!card2 && card2.y - 360 < ins().top && card2.y + card2.h > 720 - ins().bottom - 360,
    `S11f-0 KONTROLA: karta dwóch starć (y ${card2?.y}–${card2 ? card2.y + card2.h : '—'}) — panel 360 px nie mieści się ani nad, ani pod nią`);
  ok(p360?.mode === 'fallback' && p360.seam === false && p360.tab === null, `S11f brak miejsca → kotwica zapasowa (x ${p360?.x}, y ${p360?.y})`);
  ok(p300?.mode === 'row' && p300.shifted === true && !over(p300, card2), `S11g ta sama karta, panel 300 px — mieści się nad kartą (y ${p300?.y})`);
  // D — bez starcia i w oknie właściciela: kotwica przy wierszu bez zmian
  const hud0 = hudOf([], 720);
  pick('v2');
  const p0 = panelWith(hud0); const z0 = zoneOf('v2');
  ok(hud0.getPanelRect() === null && p0?.mode === 'row' && p0.shifted !== true && p0.y === z0?.y, 'S11h KONTROLA: bez starcia — panel przy wierszu jak przed strojeniem');
  const hud945 = hudOf([mkEnc('e1', 1, 1)], 945);
  pick('v2');
  const p945 = panelWith(hud945, 945); const z945 = zoneOf('v2');
  ok(!!hud945.getPanelRect() && p945?.shifted !== true && p945.y === z945?.y && !over(p945, hud945.getPanelRect()),
    'S11i KONTROLA: okno właściciela (1280×945) — karta niżej, panel przy wierszu bez przesunięcia (K10)');
  // E — kolejność kliku: panel PRZED kartą walki (rysowany po niej); panel stacji nie łapie kliku (T4)
  const hc = body(UI, '  handleClick(x, y) {');
  const iFirst = hc.indexOf('if (this._vesselPanelClick(x, y)) return true;');
  const iCombat = hc.indexOf('this.combatHud?.handleClick?.(x, y)');
  ok(iFirst > 0 && iCombat > iFirst && hc.split('this._vesselPanelClick(x, y)').length === 2 && !/stationPanel\??\.handleClick/.test(hc),
    'S11j kolejność kliku: panel statku przed kartą walki (rysunek = klik), jedno wywołanie; klik panelu stacji usunięty (T4)');
  const mVpc = compileMethod(UI, '_vesselPanelClick', {});
  const vself = (hidden, surf = 'vessel', ovl = false) => ({ overlayManager: { isAnyOpen: () => ovl }, _mapSurface: () => surf,
    _shipPanelDockHidden: () => hidden, _shipPanelHud: { rect: { x: 0, y: 0, w: 10, h: 10 }, handleClick: () => true } });
  const civWas = K.civMode; K.civMode = true;
  ok(call(mVpc, vself(false), 1, 1) === true && call(mVpc, vself(true), 1, 1) === false && call(mVpc, vself(false, 'group'), 1, 1) === false
    && call(mVpc, vself(false, 'vessel', true), 1, 1) === false, 'S11k `_vesselPanelClick` — ta sama bramka co rysunek (overlay, powierzchnia, tryb Y)');
  K.civMode = civWas;
  reset();
}

// ═══ S13 ══════════════════════════════════════════════════════════════════════
header('S13 strojenie 1 (Finding 547) — PL „Rozbiórka”, tytuł potwierdzenia z tego klucza');
{
  setLocale('pl'); const plTxt = t('fleet.disbandReturn');
  setLocale('en'); const enTxt = t('fleet.disbandReturn');
  setLocale('pl');
  ok(plTxt === '🗑 Rozbiórka (zwrot 75%)' && !/Disband/.test(plTxt), `S13a PL: „${plTxt}” — bez angielskiego słowa`);
  ok(enTxt === '🗑 Disband (75% refund)', `S13b KONTROLA: EN bez zmian („${enTxt}”)`);
  const conf = body(FMO_SRC, '  async _confirmVesselDisband(vessel) {');
  ok(/title:\s*t\('fleet\.disbandReturn'\)/.test(conf) && /ctx\.fillText\(t\('fleet\.disbandReturn'\), dbx \+ 8, cy \+ 16\)/.test(FMO_SRC),
    'S13c KONTROLA: tytuł okna potwierdzenia i etykieta przycisku — ten sam klucz (`fleet.disbandReturn`; od T3)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
