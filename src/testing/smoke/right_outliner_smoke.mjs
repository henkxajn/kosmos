// ═══════════════════════════════════════════════════════════════════════════════
// right_outliner_smoke — KEEPER ARKUSZA UI, U3-2 (prawy outliner: statki gracza nad mapą)
// Rejestr: `docs/design/UI_PLAN.md` §4.4 (U3-2), §2 (D-UI-1 prawy, D-UI-5…D-UI-10), §5 (decyzje 4, 6 (a)), §7.1–§7.3,
// §7.5, §7.8, §7.11, §7.12, §7.16, §7.17; Findingi 477, 478 (reszta — Tab), 487, 491.
// ─────────────────────────────────────────────────────────────────────────────
// WYKONANIE prawdziwego `Outliner` (`draw` na atrapie ctx z rejestrem napisów i prostokątów, `hitTest`, `updateHover`,
// `handleWheel`, nasłuch zaznaczenia) na świecie w EntityManagerze; kolejność układów z PRAWDZIWEGO `LeftOutliner`;
// prawdziwe `MapInsets` i ich konsumenci (kotwica panelu statku, `StationPanel`). `ThreeRenderer` i `UIManager` nie
// importują się pod node (THREE) — ich metody wycięte ze źródła (komentarze zdjęte) i wykonane z atrapą `this`.
//
// PINY:
//   R1  decyzja 4 — kolumna tylko nad mapą (tryb cywilizacji, globus, stan użytkownika, overlay, rozwinięty Dok)
//   R2  geometria §7.17 / U3: kolumna 150 px przy prawej krawędzi, od y 28 do górnej krawędzi pasa dolnego (y 658),
//       tło `bgAlpha(0.6)`; nagłówek „STATKI [n]” (i18n) i klawisz „[ . ]”
//   R3  treść: „W drodze” na górze (statek w tranzycie warp); układy w kolejności LEWEGO outlinera (dom, potem wg
//       odległości — KONTROLA: alfabetycznie byłoby odwrotnie); rozwinięty bieżący układ, inne zwinięte z licznikiem;
//       kubełki typu w kolejności §7.1; wróg i wrak poza listą
//   R4  D-UI-9 — znacznik = kolor glifu roli (w walce / w ruchu / zadokowany / bez paliwa / bezczynny); węzeł floty —
//       najpilniejszy znacznik członków; decyzja 6 (a) — węzeł u prowadzącego, członek z innego układu z dopiskiem
//   R5  D-UI-5 — wiersz statku: 1. klik zaznaczenie (kamera stoi; mutex — zaznaczenie floty zdjęte; ping tylko statku
//       w doku), 2. klik focus; statek z innego układu wg §7.8; CTRL = przełączenie zbioru; nagłówki „W drodze” i typu
//       pochłaniają klik bez skutków; wiersz układu jak w lewym
//   R6  D-UI-7 / §7.11 — węzeł floty: 1. klik = menu floty + zaznaczenie statków zdjęte, kamera stoi; 2. klik = focus
//       na prowadzącym, prowadzący w innym układzie — przełączenie układu
//   R7  D-UI-10 / §7.12 — podświetlenie zaznaczonego statku i floty; zaznaczenie z mapy / Tab rozwija zwinięty układ
//       i przewija do wiersza; członek floty — układ PROWADZĄCEGO
//   R8  podpowiedzi: statek (rola, przyczyna znacznika — „bez paliwa” rozróżnia dryf od utrzymania, aktywność,
//       położenie), flota, nagłówek (klawisze)
//   R9  `MapInsets.right` = 150 przy widocznej kolumnie (0 ukryta); kotwica zapasowa panelu statku i `StationPanel`
//       kończą się przed nią (KONTROLA: kolumna ukryta — do krawędzi ekranu)
//   R10 Tab (reszta 478): `cycleSelectedVessel` = zaznaczenie + „drugi klik” reguły — statek z innego układu przełącza
//       układ, potem kamera (wykonanie metody wyciętej z UIManagera)
//   R11 Finding 477 — `pingVessel` z terminem układu (wykonanie wyciętej metody)
//   R12 Finding 487 — picker kliku na tarczy ciała: statek tylko w obrębie rdzenia sprite'a; poza tarczą bez zmian
//       (wykonanie wyciętych metod)
//   R13 Finding 491 — `syncStationPanelOnSystemSwitch` + słuchacz `system:switched` w UIManagerze (wykonanie)
//   R14 pas dolny — jedno źródło wysokości (`BottomControlBar` czyta `MapInsets.BOTTOM_STRIP_H`)
//
// ⚠ Moduł POWSTAJE w U3-2 (`OutlinerColumn`, kształt prawego) — importy dynamiczne w try/catch (pin DEGRADUJE).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { THEME, bgAlpha } from '../../config/ThemeConfig.js';
import { t, setLocale } from '../../i18n/i18n.js';
import { isEnemyVessel } from '../../entities/Vessel.js';
import { systemIdOf } from '../../utils/SystemScope.js';
import { resolveVesselPanelAnchor } from '../../ui/MapVesselPanelLogic.js';

let OL = null, LO = null, MI = null, CI = null, STL = null, SPm = null;
try { OL = await import('../../ui/Outliner.js'); } catch { /* piny padną */ }
try { LO = await import('../../ui/LeftOutliner.js'); } catch { /* piny padną */ }
try { MI = await import('../../ui/MapInsets.js'); } catch { /* piny padną */ }
try { CI = await import('../../ui/ClickIntentLogic.js'); } catch { /* piny padną */ }
try { STL = await import('../../ui/ShipTreeLogic.js'); } catch { /* piny padną */ }
try { SPm = await import('../../ui/StationPanel.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const body = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
// Wykonanie metody klasy z modułu, który nie importuje się pod node — tekst wycięty ze źródła (bez komentarzy),
// oceniony z atrapą `this`; identyfikatory modułu podane jawnie w `scope`. Brak metody → `null` (pin pada).
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

setLocale('pl');
const W = 1280, H = 720;

/** Atrapa ctx: rejestr napisów i prostokątów z bieżącym `fillStyle`; `measureText` — 6 px na znak. */
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

// ── Świat: trzy układy (dom, Bellatrix — 2 ly, niezbadany, tylko Twój statek; Alioth — 4,6 ly, zbadany) ───────────
const evs = [], ops = [];
for (const ev of ['vessel:focus', 'body:selected', 'station:selected', 'station:focus']) EventBus.on(ev, (p) => evs.push([ev, p]));
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
  ship('v4', 'Straznik', 'sys_B', ['engine_ion', 'weapon_laser'], { state: 'in_transit', dockedAt: null, x: 100, y: 0 }, { unpaidYears: 3 }),
  ship('v5', 'Skoczek', null, ['engine_warp'], { state: 'orbiting', dockedAt: null, x: 0, y: 0 }, { mission: { type: 'interstellar_jump', phase: 'warp_transit' } }),
  ship('v6', 'Miecz', 'sys_A', ['engine_ion', 'weapon_laser'], { state: 'orbiting', dockedAt: 'PA', x: 100, y: 0 }, { fleetId: 'f1' }),
  ship('v7', 'Tarcza', 'sys_home', ['engine_ion', 'weapon_laser'], { state: 'docked', dockedAt: 'P1', x: 100, y: 0 }, { fleetId: 'f1' }),
  ship('v9', 'Dryfter', 'sys_B', ['engine_ion', 'cargo_small'], { state: 'in_transit', dockedAt: null, x: 120, y: 0 }, { cargoMax: 100, fuel: { current: 0, max: 10 } }),
  ship('x1', 'Obcy', 'sys_home', ['engine_ion', 'weapon_laser'], { state: 'orbiting', dockedAt: 'P1', x: 100, y: 0 }, { ownerEmpireId: 'emp_001' }),
  ship('w1', 'Wrak', 'sys_home', ['engine_ion'], { state: 'orbiting', dockedAt: null, x: 0, y: 0 }, { isWreck: true }),
];
const VMAP = new Map(VESSELS.map((v) => [v.id, v]));
const FLEETS = [{ id: 'f1', name: 'Grupa Alfa', memberIds: ['v6', 'v7'] }];

let overlayOpen = false, dockExpanded = false, dockRes = 0;
let sel = [], fleetSel = null;
const UM = {
  _selectedEntity: null,
  getSelectedVesselIds: () => [...sel], getSelectedVesselId: () => sel[0] ?? null, getSelectedFleetId: () => fleetSel,
  setSelectedVesselId: (id) => { ops.push(['select', id]); sel = id == null ? [] : [id]; },
  setSelectedFleetId: (id) => { ops.push(['selectFleet', id]); fleetSel = id; },
  toggleSelection: (id) => ops.push(['toggle', id]),
  overlayManager: { isAnyOpen: () => overlayOpen, openPanel: (id, o) => ops.push(['openPanel', id, o ?? null]) },
};
const SSM = {
  activeSystemId: 'sys_home',
  getAllSystems: () => SYSTEMS,
  switchActiveSystem(s) { ops.push(['switch', s]); this.activeSystemId = s; K.activeSystemId = s; return true; },
};
const K = globalThis.window.KOSMOS;
Object.assign(K, {
  civMode: true, planetGlobeOpen: false, activeSystemId: 'sys_home',
  uiManager: UM, starSystemManager: SSM,
  threeRenderer: { _pingedEnemyId: null, pingVessel: (id) => ops.push(['ping', id]), resetToSystemView: () => { ops.push(['reset']); return true; } },
  stationPanel: { visible: false, _stationId: null, _float: { minimized: false } },
  tacticalDock: { isExpanded: () => dockExpanded, getReservedHeight: () => dockRes },
  colonyManager: { getAllColonies: () => COLONIES, getColony: (id) => COLONIES.find((c) => c.planetId === id) ?? null },
  stationSystem: { getAllStations: () => [] },
  vesselManager: { _vessels: VMAP, getVessel: (id) => VMAP.get(id) ?? null, getAllVessels: () => [...VMAP.values()],
    isImmobilized: (v) => (v.unpaidYears ?? 0) >= 2 },
  fleetSystem: { listFleets: () => FLEETS, getFleet: (id) => FLEETS.find((f) => f.id === id) ?? null },
  deepSpaceCombatSystem: { _findActiveEncounterContaining: (id) => (id === 'v2' ? { id: 'enc1' } : null) },
  timeSystem: { gameTime: 10 },
});
K.leftOutliner = LO?.LeftOutliner ? new LO.LeftOutliner() : null;
const reset = (o = {}) => {
  evs.length = 0; ops.length = 0;
  sel = o.sel ?? []; fleetSel = o.fleet ?? null;
  overlayOpen = !!o.overlay; dockExpanded = !!o.dockExp; dockRes = o.dockRes ?? 0;
  SSM.activeSystemId = o.active ?? 'sys_home'; K.activeSystemId = SSM.activeSystemId;
  K.civMode = o.civ ?? true; K.planetGlobeOpen = !!o.globe;
};
const Outliner = OL?.Outliner;
const newRO = () => { const ro = Outliner ? new Outliner() : null; K.rightOutliner = ro; return ro; };
const draw = (ro, h = H, ctx = recCtx()) => {
  let tr = null;
  try { tr = ro?.draw?.(ctx, W, h, { treeColonies: COLONIES, colonies: [], groundUnits: [] }); } catch { /* kod sprzed U3-2 — pin pada */ }
  return { tr, ctx };
};
const zones = (ro, type) => (ro?._clickTargets ?? []).filter((z) => z.type === type);
const zone = (ro, type, id) => (ro?._clickTargets ?? []).find((z) => z.type === type && (z.vesselId === id || z.fleetId === id || z.systemId === id)) ?? null;
const clickAt = (ro, z, dx = 60, h = H) => (z ? ro?.hitTest?.(z.x + dx, z.y + z.h / 2, W, h) : null);
const glyphColor = (ctx, name) => { const tx = ctx._calls.text; const i = tx.findIndex((x) => x.s === name); return i > 0 ? tx[i - 1].fillStyle : null; };

// ═══ R1 ═══════════════════════════════════════════════════════════════════════
header('R1  decyzja 4 — kolumna tylko nad mapą');
{
  const ro = newRO();
  reset(); ok(ro?.isShown?.(K) === true, 'R1a tryb cywilizacji, mapa — widoczna');
  reset({ overlay: true }); ok(ro?.isShown?.(K) === false, 'R1b SEDNO: overlay pełnoekranowy otwarty — ukryta (dawniej szuflada nad overlayem)');
  reset({ dockExp: true }); ok(ro?.isShown?.(K) === false, 'R1c rozwinięty Dok taktyczny — ukryta');
  reset({ globe: true }); ok(ro?.isShown?.(K) === false, 'R1d podgląd globusa — ukryta');
  reset({ civ: false }); ok(ro?.isShown?.(K) === false, 'R1e poza trybem cywilizacji — nic');
  reset(); if (ro) ro.visible = false; ok(ro?.isShown?.(K) === false, 'R1f stan użytkownika „ukryty” (klawisz „.”) — ukryta');
  const { ctx } = draw(ro); ok(ctx._calls.rects.length === 0 && (ro?._clickTargets ?? []).length === 0 && ro?.hitTest?.(W - 75, 300, W, H) === false,
    'R1g ukryta — bez rysowania i bez trafień');
  if (ro) ro.visible = true;
}

// ═══ R2 ═══════════════════════════════════════════════════════════════════════
header('R2  geometria §7.17 / U3, tło, nagłówek');
{
  reset(); const ro = newRO();
  const { ctx } = draw(ro);
  const bg = ctx._calls.rects.find((r) => r.x === W - 150 && r.w === 150);
  ok(!!bg && bg.y === 28 && bg.h === H - 28 - 62, `R2a SEDNO: kolumna x ${W - 150}, od y 28 do górnej krawędzi pasa dolnego (y ${H - 62}) — jest ${bg ? `${bg.x}/${bg.y}+${bg.h}` : '—'}`);
  ok(!!bg && bg.fillStyle === bgAlpha(0.6), `R2b tło półprzezroczyste jak lewego \`bgAlpha(0.6)\` (jest ${bg?.fillStyle}; dawniej krycie 1)`);
  const text = ctx._calls.text.map((x) => x.s);
  ok(text.includes(t('rightOutliner.ships', 8).toUpperCase()) && text.includes('STATKI [8]'), `R2c nagłówek „STATKI [8]” — 8 Twoich żywych statków (i18n)`);
  ok(text.includes('[ . ]'), 'R2d klawisz prawego outlinera przy nagłówku („[ . ]”, §7.16)');
  reset({ dockRes: 64 }); const { ctx: c2 } = draw(ro);
  const bg2 = c2._calls.rects.find((r) => r.x === W - 150 && r.w === 150);
  ok(!!bg2 && bg2.y + bg2.h === H - 42 - 64, `R2e zwinięty Dok — kolumna nad jego rezerwą (zawiera już prześwit nad pasem zegara; dół y ${bg2 ? bg2.y + bg2.h : '—'})`);
}

// ═══ R3 ═══════════════════════════════════════════════════════════════════════
header('R3  treść — „W drodze”, układy w kolejności lewego, kubełki typu');
{
  reset(); const ro = newRO();
  const { tr, ctx } = draw(ro);
  const sysT = zones(ro, 'system').map((z) => z.systemId);
  ok(sysT.join(' ') === 'sys_home sys_B sys_A', `R3a SEDNO: układy w kolejności LEWEGO outlinera — dom, Bellatrix (2 ly), Alioth (4,6 ly) (jest ${sysT.join(' ')})`);
  ok(['Bellatrix', 'Alioth'].sort().join(' ') === 'Alioth Bellatrix'
    && SYSTEMS.find((x) => x.systemId === 'sys_B').galaxyStar.distanceLY < SYSTEMS.find((x) => x.systemId === 'sys_A').galaxyStar.distanceLY,
    'R3b KONTROLA: fixture rozróżnia — alfabetycznie Alioth przed Bellatrix, wg odległości odwrotnie');
  const tz = zones(ro, 'transit');
  const vT = zones(ro, 'vessel').map((z) => z.vesselId);
  ok(tz.length === 1 && vT[0] === 'v5' && tz[0].y < zone(ro, 'system', 'sys_home').y, `R3c „W drodze” na górze — statek w tranzycie warp (${vT[0]})`);
  ok(vT.join(' ') === 'v5 v2 v1', `R3d bieżący układ rozwinięty (WOJENNE „Fregata”, CARGO „Kurier”), inne zwinięte (jest ${vT.join(' ')})`);
  ok(!vT.includes('x1') && !vT.includes('w1') && tr?.total === 8, 'R3e wróg i wrak poza listą');
  const grpT = zones(ro, 'group').map((z) => z.groupId);
  ok(grpT.join(' ') === 'war cargo' && ctx._calls.text.some((x) => x.s === t('rightOutliner.group.war').toUpperCase()),
    `R3f kubełki typu w kolejności §7.1 (jest ${grpT.join(' ')}), nagłówki i18n`);
  const count = (sys) => { const z = zone(ro, 'system', sys); const c = ctx._calls.text.find((x) => x.y === z.y + 13 && x.x === W - 150 + 150 - 5); return c?.s; };
  ok(count('sys_home') === '2' && count('sys_B') === '2' && count('sys_A') === '3', `R3g licznik przy układzie (dom 2, Bellatrix 2, Alioth 3 — flota liczy członków; jest ${count('sys_home')}/${count('sys_B')}/${count('sys_A')})`);
}

// ═══ R4 ═══════════════════════════════════════════════════════════════════════
header('R4  znaczniki (D-UI-9) i węzeł floty (decyzja 6 (a))');
{
  reset(); const ro = newRO();
  ro?._expanded?.set?.('sys_A', true); ro?._expanded?.set?.('sys_B', true);
  const { ctx } = draw(ro);
  ok(glyphColor(ctx, 'Fregata') === THEME.danger, `R4a „Fregata” w walce — ${THEME.danger} (jest ${glyphColor(ctx, 'Fregata')})`);
  ok(glyphColor(ctx, 'Skoczek') === THEME.textPrimary, 'R4b „Skoczek” w tranzycie warp — „w ruchu”');
  ok(glyphColor(ctx, 'Kurier') === THEME.success, 'R4c „Kurier” w doku — „zadokowany”');
  ok(glyphColor(ctx, 'Straznik') === THEME.warning && glyphColor(ctx, 'Dryfter') === THEME.warning, 'R4d „Strażnik” (utrzymanie) i „Dryfter” (bez paliwa w locie) — „bez paliwa”');
  ok(glyphColor(ctx, 'Badacz') === THEME.textDim, 'R4e „Badacz” na orbicie bez zadania — „bezczynny”');
  const fz = zone(ro, 'fleet', 'f1');
  ok(!!fz && fz.y > (zone(ro, 'system', 'sys_A')?.y ?? Infinity) && glyphColor(ctx, 'Grupa Alfa') === THEME.success,
    'R4f SEDNO: węzeł „Grupa Alfa” w układzie prowadzącego (Alioth); glif ⛬ = najpilniejszy znacznik członków („zadokowany”)');
  const members = zones(ro, 'vessel').filter((z) => !!fz && z.y > fz.y && z.y <= fz.y + 2 * 16).map((z) => z.vesselId);
  ok(members.join(' ') === 'v6 v7', `R4g członkowie pod węzłem (jest ${members.join(' ')})`);
  const z7 = zone(ro, 'vessel', 'v7');
  const note7 = ctx._calls.text.find((x) => !!z7 && x.y === z7.y + 12 && x.fillStyle === THEME.textDim);
  ok(!!note7 && note7.s.startsWith('Kepler') && zones(ro, 'vessel').filter((z) => z.vesselId === 'v7').length === 1,
    `R4h „Tarcza” z innego układu — tylko pod węzłem, z dopiskiem układu („${note7?.s}” — skrócony do 56 px; pełne położenie w podpowiedzi)`);
}

// ═══ R5 ═══════════════════════════════════════════════════════════════════════
header('R5  wiersz statku — reguła klik/focus (D-UI-5)');
{
  reset(); const ro = newRO(); draw(ro);
  ro._lastMouseMods = { ctrl: false };
  reset(); clickAt(ro, zone(ro, 'vessel', 'v1'));
  ok(JSON.stringify(ops) === '[["select","v1"],["selectFleet",null],["ping","v1"]]' && evs.length === 0,
    `R5a SEDNO: statek w doku, 1. klik → zaznaczenie + zdjęcie floty (mutex) + ping (brak sprite'a), kamera stoi (${JSON.stringify(ops)})`);
  reset({ sel: ['v1'] }); clickAt(ro, zone(ro, 'vessel', 'v1'));
  ok(JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v1"}]]' && ops.length === 0, 'R5b zaznaczony, 2. klik → `vessel:focus`');
  reset(); clickAt(ro, zone(ro, 'vessel', 'v2'));
  ok(JSON.stringify(ops) === '[["select","v2"],["selectFleet",null]]', 'R5c KONTROLA: statek ze sprite\'em (w locie) — bez pingu (ramki na mapie)');
  ro._lastMouseMods = { ctrl: true }; reset(); clickAt(ro, zone(ro, 'vessel', 'v2'));
  ok(JSON.stringify(ops) === '[["toggle","v2"]]' && evs.length === 0, 'R5d CTRL+klik → przełączenie zbioru, bez kamery');
  ro._lastMouseMods = { ctrl: false };
  reset(); const zt = zone(ro, 'transit'), zg = zones(ro, 'group')[0];
  const rT = clickAt(ro, zt), rG = clickAt(ro, zg);
  ok(!!zt && !!zg && rT === true && rG === true && ops.length === 0 && evs.length === 0, 'R5e nagłówki „W drodze” i typu — klik pochłonięty bez skutków');
  reset(); const za = zone(ro, 'system', 'sys_A'); clickAt(ro, za, 4);
  ok(ro?.isExpanded?.('sys_A', 'sys_home') === true && ops.length === 0, 'R5f strzałka układu — rozwinięcie bez przełączania');
  draw(ro); reset(); clickAt(ro, zone(ro, 'vessel', 'v3'));
  ok(JSON.stringify(ops) === '[["select","v3"],["selectFleet",null]]', 'R5g statek z INNEGO układu, 1. klik → zaznaczenie bez przełączania (§7.8)');
  reset({ sel: ['v3'] }); clickAt(ro, zone(ro, 'vessel', 'v3'));
  ok(JSON.stringify(ops) === '[["switch","sys_A"]]' && JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v3"}]]', 'R5h … 2. klik → przełączenie układu, potem kamera');
  reset(); draw(ro); reset(); clickAt(ro, zone(ro, 'system', 'sys_B'), 60);
  ok(JSON.stringify(ops) === '[["switch","sys_B"]]', 'R5i KONTROLA: wiersz innego układu → przełączenie (jak dotąd i jak w lewym)');
  reset(); draw(ro); reset(); clickAt(ro, zone(ro, 'system', 'sys_home'), 60);
  ok(JSON.stringify(ops) === '[["reset"]]', 'R5j KONTROLA: wiersz bieżącego układu → domyślny widok (§7.9; jak dotąd)');
}

// ═══ R6 ═══════════════════════════════════════════════════════════════════════
header('R6  węzeł floty — menu floty, mutex, focus na prowadzącym (§7.11)');
{
  reset({ sel: ['v1'] }); const ro = newRO(); ro?._expanded?.set?.('sys_A', true); draw(ro);
  reset({ sel: ['v1'] }); clickAt(ro, zone(ro, 'fleet', 'f1'));
  ok(JSON.stringify(ops) === '[["selectFleet","f1"],["select",null]]' && evs.length === 0,
    `R6a SEDNO: 1. klik → menu floty (\`setSelectedFleetId\`) + zaznaczenie statków zdjęte, kamera stoi (${JSON.stringify(ops)})`);
  reset({ fleet: 'f1' }); clickAt(ro, zone(ro, 'fleet', 'f1'));
  ok(JSON.stringify(ops) === '[["switch","sys_A"]]' && JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v6"}]]',
    'R6b 2. klik → prowadzący „Miecz” w innym układzie: przełączenie, potem kamera');
  reset({ fleet: 'f1', active: 'sys_A' }); clickAt(ro, zone(ro, 'fleet', 'f1'));
  ok(ops.length === 0 && JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v6"}]]', 'R6c prowadzący w oglądanym układzie — sam focus');
  ok(CI?.fleetTarget?.('f1', VMAP.get('v6'))?.systemId === 'sys_A' && CI?.fleetTarget?.('f1', null)?.systemId === null,
    'R6d `fleetTarget` — układ celu = układ prowadzącego (bez prowadzącego — nieznany)');
}

// ═══ R7 ═══════════════════════════════════════════════════════════════════════
header('R7  D-UI-10 — podświetlenie i odsłonięcie wiersza (§7.12)');
{
  reset({ sel: ['v1'] }); const ro = newRO(); const { ctx } = draw(ro);
  const z1 = zone(ro, 'vessel', 'v1');
  ok(!!z1 && ctx._calls.rects.some((r) => r.y === z1.y && r.h === 16 && r.fillStyle === THEME.accentMed), 'R7a wiersz zaznaczonego statku podświetlony');
  reset({ fleet: 'f1' }); ro?._expanded?.set?.('sys_A', true); const { ctx: c2 } = draw(ro);
  const zf = zone(ro, 'fleet', 'f1');
  ok(!!zf && c2._calls.rects.some((r) => r.y === zf.y && r.fillStyle === THEME.accentMed), 'R7b węzeł zaznaczonej floty podświetlony');
  // zaznaczenie z mapy statku w zwiniętym układzie, przy krótkiej kolumnie (lista dłuższa niż widok)
  reset(); const r2 = newRO(); const hS = 220; draw(r2, hS);
  ok(r2?.isExpanded?.('sys_B', 'sys_home') === false, 'R7c-0 Bellatrix zwinięty przed zaznaczeniem');
  EventBus.emit('ui:selectionChanged', { vesselId: 'v9', vesselIds: ['v9'] });
  draw(r2, hS);
  const z9 = zone(r2, 'vessel', 'v9');
  const top = 28 + 18 + 2, bottom = hS - 62;
  ok(r2?.isExpanded?.('sys_B', 'sys_home') === true && !!z9 && z9.y >= top && z9.y + z9.h <= bottom && r2._scrollY > 0,
    `R7c SEDNO: zaznaczenie z mapy rozwija układ i przewija do wiersza (y ${z9?.y}, przewinięcie ${r2._scrollY})`);
  reset(); const r3 = newRO(); draw(r3);
  EventBus.emit('ui:selectionChanged', { vesselId: 'v7', vesselIds: ['v7'] });
  draw(r3);
  ok(r3?.isExpanded?.('sys_A', 'sys_home') === true && r3?._expanded?.get?.('sys_A') === true, 'R7d członek floty („Tarcza”, dom) — rozwija układ PROWADZĄCEGO (Alioth)');
  reset(); const r4 = newRO(); draw(r4);
  EventBus.emit('ui:fleetSelectionChanged', { fleetId: 'f1' }); draw(r4);
  ok(r4?.isExpanded?.('sys_A', 'sys_home') === true, 'R7e zaznaczenie floty (Dowództwo, mapa) — rozwija układ węzła');
}

// ═══ R8 ═══════════════════════════════════════════════════════════════════════
header('R8  podpowiedzi');
{
  reset(); const ro = newRO(); ro?._expanded?.set?.('sys_A', true); ro?._expanded?.set?.('sys_B', true); draw(ro);
  const tipOf = (z) => { if (!z) return []; try { ro.updateHover(z.x + 60, z.y + z.h / 2, W, H); } catch { return []; } return (ro._tip?.lines ?? []).map((l) => l.text ?? ''); };
  const t4 = tipOf(zone(ro, 'vessel', 'v4')), t9 = tipOf(zone(ro, 'vessel', 'v9'));
  ok(t4.includes(t('fleetPicture.alert.immobilized')) && !t4.includes(t('fleetPicture.alert.stranded')),
    `R8a SEDNO: „bez paliwa” rozróżnia — „Strażnik”: ${t('fleetPicture.alert.immobilized')}`);
  ok(t9.includes(t('fleetPicture.alert.stranded')) && !t9.includes(t('fleetPicture.alert.immobilized')), `R8b … „Dryfter”: ${t('fleetPicture.alert.stranded')}`);
  const t1 = tipOf(zone(ro, 'vessel', 'v1'));
  ok(t1[0]?.includes('Kurier') && t1.includes(t('fleetPicture.role.cargo')) && t1.includes(t('fleetPicture.state.docked')) && t1.includes('Mstow'),
    `R8c statek: rola, aktywność, położenie (${JSON.stringify(t1)})`);
  const t3 = tipOf(zone(ro, 'vessel', 'v3'));
  ok(t3.includes('Alioth b · Alioth'), `R8d statek z innego układu — ciało · układ (${JSON.stringify(t3)})`);
  const t5 = tipOf(zone(ro, 'vessel', 'v5'));
  ok(t5.includes(t('rightOutliner.inTransit')), 'R8e statek w tranzycie — „W drodze”');
  const tf = tipOf(zone(ro, 'fleet', 'f1'));
  ok(tf[0] === '⛬ Grupa Alfa' && tf.includes(t('fleet.shipsCount', 2)), `R8f węzeł floty — nazwa i liczba statków (${JSON.stringify(tf)})`);
  const t7 = tipOf(zone(ro, 'vessel', 'v7'));
  ok(t7.includes('Mstow · Kepler-4799'), `R8h członek floty z dopiskiem — pełne położenie w podpowiedzi (${JSON.stringify(t7)})`);
  const hd = (ro._clickTargets ?? []).find((z) => z.type === 'header');
  if (hd) ro.updateHover(hd.x + 20, hd.y + 5, W, H);
  ok(!!hd && ro._tip?.text === t('leftOutliner.keyHint'), 'R8g nagłówek — podpowiedź klawiszy');
}

// ═══ R9 ═══════════════════════════════════════════════════════════════════════
header('R9  `MapInsets.right` i konsumenci (kotwica panelu statku, StationPanel)');
{
  reset(); const ro = newRO();
  ok(MI?.getMapInsets?.(K)?.right === 150, 'R9a SEDNO: kolumna widoczna → wcięcie prawe 150');
  reset({ overlay: true }); ok(MI?.getMapInsets?.(K)?.right === 0, 'R9b KONTROLA: overlay → 0');
  reset(); if (ro) ro.visible = false; ok(MI?.getMapInsets?.(K)?.right === 0, 'R9c KONTROLA: schowana klawiszem → 0'); if (ro) ro.visible = true;
  reset();
  const ins = MI?.getMapInsets?.(K) ?? { left: 0, right: 0, top: 28, bottom: 42 };
  const b = { ox: ins.left + 8, oy: ins.top + 8, ow: Math.max(80, W - ins.left - ins.right - 16), oh: 400 };
  const a = resolveVesselPanelAnchor(null, 1, b, 300, 300, 24);
  ok(a.x + 300 <= W - 150, `R9d kotwica zapasowa panelu statku kończy się przed kolumną (prawa krawędź ${a.x + 300})`);
  // StationPanel — stacja tuż przy prawej krawędzi ekranu
  const sp = SPm?.StationPanel ? new SPm.StationPanel() : null;
  const st = { id: 'stR', type: 'station', name: 'Stacja R', systemId: 'sys_home', depot: { inventory: new Map() }, modules: [] };
  EntityManager.add(st);
  K.threeRenderer.getStationScreenPosition = () => ({ x: W - 30, y: 300 });
  let threw = null;
  const placeAt = () => { try { sp._stationId = 'stR'; sp.show(); sp._float.reanchor?.(); sp.draw(recCtx(), W, H); } catch (e) { threw = e; } return sp?._lastRect; };
  const r1 = sp ? placeAt() : null;
  const pw = r1?.PW ?? r1?.w ?? 0;
  ok(!threw && !!r1 && r1.px + pw <= W - 150, `R9e StationPanel przy prawej krawędzi kończy się przed kolumną (px ${r1?.px} + ${pw}${threw ? ', wyjątek ' + threw.message : ''})`);
  if (ro) ro.visible = false; const r0 = sp ? placeAt() : null; if (ro) ro.visible = true;
  ok(!!r0 && r0.px + pw > W - 150, `R9f KONTROLA: kolumna schowana — panel może stanąć przy krawędzi ekranu (px ${r0?.px})`);
  delete K.threeRenderer.getStationScreenPosition;
  EntityManager.remove?.('stR');
}

// ═══ R10 ══════════════════════════════════════════════════════════════════════
header('R10 Tab — zaznaczenie + „drugi klik” (reszta Findingu 478)');
{
  const ui = src('../../scenes/UIManager.js');
  const cyc = body(ui, '  cycleSelectedVessel(direction = 1) {');
  ok(/this\.setSelectedVesselId\(next\.id\);\s*clickObject\(vesselTarget\(next\.id, next\), \{ K: window\.KOSMOS, emit: \(n, p\) => EventBus\.emit\(n, p\) \}\);/.test(cyc)
    && !/EventBus\.emit\('vessel:focus'/.test(cyc), 'R10a źródło: po zaznaczeniu reguła U1 zamiast gołego `vessel:focus`');
  const fake = { _selectedVesselId: null, _sel: [],
    getSelectedVesselIds() { return [...this._sel]; }, getSelectedVesselId() { return this._selectedVesselId; }, getSelectedFleetId() { return null; },
    setSelectedVesselId(id) { ops.push(['select', id]); this._selectedVesselId = id; this._sel = [id]; } };
  const cy = compileMethod(ui, 'cycleSelectedVessel', { isEnemyVessel, clickObject: CI?.clickObject, vesselTarget: CI?.vesselTarget, EventBus });
  const um0 = K.uiManager; K.uiManager = fake;
  reset(); fake._selectedVesselId = null; call(cy, fake, 1);
  ok(JSON.stringify(ops) === '[["select","v1"]]' && JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v1"}]]', 'R10b KONTROLA: statek w oglądanym układzie — zaznaczenie + kamera, bez przełączania');
  reset(); fake._selectedVesselId = 'v2'; fake._sel = ['v2']; call(cy, fake, 1);
  ok(JSON.stringify(ops) === '[["select","v3"],["switch","sys_A"]]' && JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v3"}]]',
    `R10c SEDNO: następny statek w INNYM układzie — przełączenie układu, potem kamera (${JSON.stringify(ops)})`);
  reset(); fake._selectedVesselId = 'v4'; fake._sel = ['v4']; call(cy, fake, 1);
  ok(JSON.stringify(ops) === '[["select","v5"]]' && JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v5"}]]', 'R10d KONTROLA: statek w tranzycie warp — focus bez przełączania (układ nieznany; jak dotąd)');
  reset(); fake._selectedVesselId = 'v9'; fake._sel = ['v9']; call(cy, fake, 1);
  ok(ops[0]?.[1] === 'v1', 'R10e KONTROLA: zawinięcie listy; wróg i wrak poza cyklem (jak dotąd)');
  K.uiManager = um0;
}

// ═══ R11 ══════════════════════════════════════════════════════════════════════
header('R11 Finding 477 — `pingVessel` z terminem układu');
{
  const TR = src('../../renderer/ThreeRenderer.js');
  const spawned = [];
  function Mesh() { this.position = { set: (x, y, z) => { this.pos = [x, y, z]; } }; this.rotation = {}; }
  const THREE = { Mesh, RingGeometry: function () {}, MeshBasicMaterial: function () {}, DoubleSide: 2 };
  const ping = compileMethod(TR, 'pingVessel', { S: (v) => v / 10, THREE, TACTICAL_PING_THROTTLE_MS: 180, TACTICAL_PING_COLOR: 0xffffff, FX_PING_MS: 600, systemIdOf });
  const R = { _vessels: new Map(), _lastTacticalPingMs: -1e9, _spawnFx(m) { spawned.push(m.pos); } };
  const go = (id, viewed = 'sys_home') => { K.activeSystemId = viewed; SSM.activeSystemId = viewed; R._lastTacticalPingMs = -1e9; spawned.length = 0; return call(ping, R, id); };
  ok(typeof ping === 'function', 'R11-0 KONTROLA: metoda wycięta ze źródła');
  ok(go('v1') !== false && spawned.length === 1, 'R11a KONTROLA: statek w doku w OGLĄDANYM układzie (bez sprite\'a) — ping po pozycji (jak dotąd)');
  ok(go('v3') === false && spawned.length === 0, 'R11b SEDNO: statek z INNEGO układu — odmowa (dawniej pierścień w ramce oglądanego układu)');
  ok(go('v5') === false && spawned.length === 0, 'R11c statek w tranzycie warp — odmowa');
  ok(go('v3', 'sys_A') !== false && spawned.length === 1, 'R11d KONTROLA: ten sam statek, gdy oglądany jest jego układ — ping');
  R._vessels.set('v3', { sprite: { visible: true, position: { x: 1, y: 2, z: 3 } } });
  ok(go('v3') !== false && JSON.stringify(spawned[0]) === '[1,2,3]', 'R11e KONTROLA: statek z widocznym sprite\'em — ping na sprite (jak dotąd)');
  K.activeSystemId = 'sys_home'; SSM.activeSystemId = 'sys_home';
}

// ═══ R12 ══════════════════════════════════════════════════════════════════════
header('R12 Finding 487 — klik na tarczy ciała: statek tylko w obrębie rdzenia sprite\'a');
{
  const TR = src('../../renderer/ThreeRenderer.js');
  const scope = { VESSEL_CORE_PICK_PX: 6, vesselTargetSize: () => 0.016 };
  const gv = compileMethod(TR, '_getVesselAtScreen', scope);
  const pv = compileMethod(TR, '_pickVesselForClick', scope);
  const core = compileMethod(TR, '_vesselCorePickPx', scope);
  const disc = compileMethod(TR, '_isOnBodyDisc', scope);
  let DIST = 40;
  const spr = (pxOff) => ({ visible: true,
    getWorldPosition(v) { v.x = pxOff / 640; v.y = 0; v.z = 0; return v; },
    getWorldScale(v) { v.x = 1; v.y = 1; v.z = 1; return v; } });
  const R = { camera: { fov: 60, position: { distanceTo: () => DIST } },
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } },
    _tmpPickVec: { x: 0, y: 0, z: 0, project() {} }, _tmpPickScale: { x: 1, y: 1, z: 1 }, _tmpPickPos: { x: 0, y: 0, z: 0 },
    _vessels: new Map([['v2', { sprite: spr(9) }]]), _hoverVesselId: null, _onDisc: false };
  R._getVesselAtScreen = gv; R._vesselCorePickPx = core; R._isOnBodyDisc = () => R._onDisc;
  ok(!!gv && !!pv && !!core && !!disc, 'R12-0 KONTROLA: metody wycięte ze źródła');
  R._onDisc = false; ok(call(pv, R, 640, 360) === 'v2', 'R12a KONTROLA: poza tarczą — statek 9 px od kliku wybrany (tolerancja 40 px bez zmian)');
  R._onDisc = true; ok(call(pv, R, 640, 360) === null, 'R12b SEDNO: na tarczy — statek 9 px od kliku NIE zabiera kliku (pomiar U2: Fregata I 9 px od Mstow)');
  R._hoverVesselId = 'v2'; ok(call(pv, R, 640, 360) === null, 'R12c … także gdy statek jest „najechany” (podpowiedź 28 px)'); R._hoverVesselId = null;
  R._vessels.set('v2', { sprite: spr(4) }); ok(call(pv, R, 640, 360) === 'v2', 'R12d KONTROLA: na tarczy — statek w obrębie rdzenia (4 px ≤ 6) nadal wygrywa');
  DIST = 0.3; R._vessels.set('v2', { sprite: spr(12) });
  const cpx = call(core, R, 'v2', R._vessels.get('v2').sprite, 720);
  ok(cpx > 12 && call(pv, R, 640, 360) === 'v2', `R12e bliski kadr — rdzeń rośnie z rzutem modelu (${typeof cpx === 'number' ? cpx.toFixed(1) : cpx} px): statek 12 px od kliku wybrany`);
  DIST = 40; ok(call(core, R, 'v2', R._vessels.get('v2').sprite, 720) === 6, 'R12f daleki kadr — rdzeń = minimum 6 px (model 1–3 px)');
  // `_isOnBodyDisc`: planeta — tak; gwiazda — tylko jej rdzeń (sfera klikalna gwiazdy jest 2,5× większa)
  const D = { _starCore: {}, _ray: { intersectObject: () => [] }, getEntityAtScreen: () => null };
  ok(call(disc, D, 1, 1) === false, 'R12g brak ciała pod kursorem — nie tarcza');
  D.getEntityAtScreen = () => ({ type: 'planet' }); ok(call(disc, D, 1, 1) === true, 'R12h planeta pod kursorem — tarcza');
  D.getEntityAtScreen = () => ({ type: 'star' }); ok(call(disc, D, 1, 1) === false, 'R12i gwiazda — powiększona sfera klikalna poza rdzeniem NIE jest tarczą');
  D._ray.intersectObject = () => [{}]; ok(call(disc, D, 1, 1) === true, 'R12j gwiazda — rdzeń jest tarczą');
}

// ═══ R13 ══════════════════════════════════════════════════════════════════════
header('R13 Finding 491 — panel stacji przy przełączeniu układu');
{
  const f = CI?.syncStationPanelOnSystemSwitch;
  let closed = 0;
  ok(typeof f === 'function', 'R13-0 `syncStationPanelOnSystemSwitch` istnieje');
  ok(call(f, null, { id: 's1', systemId: 'sys_home' }, 'sys_A', () => closed++) === 'close' && closed === 1, 'R13a SEDNO: stacja spoza układu docelowego — panel zamknięty');
  ok(call(f, null, { id: 's1', systemId: 'sys_A' }, 'sys_A', () => closed++) === 'keep' && closed === 1, 'R13b stacja z układu docelowego — panel zostaje');
  ok(call(f, null, null, 'sys_A', () => closed++) === null && closed === 1, 'R13c bez stacji — nic');
  const ui = src('../../scenes/UIManager.js');
  const sig = "EventBus.on('system:switched', ({ systemId } = {}) => {";
  const i = ui.indexOf(sig), e = ui.indexOf('\n    });', i);
  const text = i < 0 || e < 0 ? '' : ui.slice(i + "EventBus.on('system:switched', ".length, e + '\n    }'.length);
  const sp = { visible: true, _float: { minimized: false }, _station: () => ({ id: 's1', systemId: 'sys_home' }), hide() { this.visible = false; } };
  const self = { _selectedEntity: null, stationPanel: sp, _dirty: false };
  const lis = compileWith(text, { syncBodyCardOnSystemSwitch: CI?.syncBodyCardOnSystemSwitch, syncStationPanelOnSystemSwitch: f, EventBus }, self);
  call(lis, null, { systemId: 'sys_A' });
  ok(!!lis && sp.visible === false && self._dirty === true, 'R13d słuchacz `system:switched` w UIManagerze zamyka panel stacji spoza układu (wykonanie)');
  sp.visible = true; sp._float.minimized = true; call(lis, null, { systemId: 'sys_A' });
  ok(sp.visible === true, 'R13e KONTROLA: panel zadokowany jako belka (zminimalizowany) — bez zmian');
  sp._float.minimized = false; sp._station = () => ({ id: 's2', systemId: 'sys_A' }); call(lis, null, { systemId: 'sys_A' });
  ok(sp.visible === true, 'R13f KONTROLA: stacja w układzie docelowym — panel zostaje');
}

// ═══ R14 ══════════════════════════════════════════════════════════════════════
header('R14 pas dolny — jedno źródło wysokości');
{
  const bcb = src('../../ui/BottomControlBar.js');
  ok(/import \{ BOTTOM_STRIP_H \} from '\.\/MapInsets\.js';/.test(bcb) && /const STRIP_H = BOTTOM_STRIP_H;/.test(bcb),
    'R14a pasek zegara czyta wysokość pasa dolnego z `MapInsets` (ta sama liczba kończy oba outlinery)');
  ok(STL?.MARKER_TONES && Object.values(STL.MARKER_TONES).every((tok) => typeof THEME[tok] === 'string'), 'R14b KONTROLA: tokeny znaczników istnieją w motywie');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
