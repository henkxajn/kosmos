// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ UI U4-2: wcięcia obszaru mapy z JEDNEGO źródła (`MapInsets`) dla wszystkich konsumentów
// (UI_PLAN §4.5; Findingi 494, 496). Uruchom: node src/testing/smoke/map_insets_single_source_smoke.mjs
//
// Do U4-2 tylko KOLUMNY outlinerów kończyły się nad pasem dolnym (`outlinerBottomInset`); karta ciała, kadr
// „Obserwuj” i strzałki krawędzi mapy liczyły obszar mapy po swojemu — prawe 150 px na sztywno (także przy schowanym
// prawym outlinerze, 496), dół na pasku nawigacji (pod pasem), strzałki przy krawędzi EKRANU (pod kolumnami i paskami,
// 494). Stała wysokości pasa żyła w trzech miejscach (`MapInsets.BOTTOM_STRIP_H`, `TACTICAL_DOCK_CLOCK_CLEARANCE`,
// `TIME_STRIP_H` w Dowództwie).
//
// PINY (SEDNO pada na drzewie sprzed U4-2; KONTROLA — zielona po obu stronach):
//   M1 `computeMapInsets`: tryb cywilizacji — dół NAD pasem dolnym także bez Doku (42 + 20); z Dokiem bez zmian;
//      kolumna i obszar mapy kończą się na tej samej linii (`outlinerBottomInset` = `insets.bottom`); Generator bez zmian
//   M2 `BottomContext._bounds` (wykonanie): prawa krawędź karty z `MapInsets.right` (schowany prawy outliner → do
//      krawędzi ekranu, 496), dół nad pasem dolnym / nad Dokiem taktycznym
//   M3 `edgeIndicators` (wykonanie): kadr = prostokąt `opts.rect`; bez niego — cały ekran jak dotąd
//   M4 `MapLabelLayer.drawVesselLabels` (wykonanie): statek pod lewą kolumną i statek pod pasem dolnym → strzałki przy
//      krawędzi OBSZARU MAPY (494); lewy schowany → ten sam statek w kadrze (KONTROLA)
//   M5 Dok taktyczny: prześwit z `MapInsets.BOTTOM_STRIP_H` (pin źródłowy) — liczby bez zmian (wykonanie, KONTROLA)
//   M6 `LayoutConfig` bez `TACTICAL_DOCK_CLOCK_CLEARANCE`
//   M7 Dowództwo: `TIME_STRIP_H = BOTTOM_STRIP_H` (pin źródłowy)
//   M8 kadr „Obserwuj” (`ThreeRenderer._computeWatchFit`, pin źródłowy — moduł nie importuje się pod node): lewo,
//      prawo i dół z jednego odczytu `getMapInsets`; bez `OUTLINER_W` i bez sumy pasków nawigacji
//   M9 UIManager: martwy tekst powiadomień usunięty (`_drawNotifications` bez wywołań, `_notifications` bez pisarza)
//   M10 karta ciała bez 150 px na sztywno (`OUTLINER_W`), obszar z `getMapInsets` (pin źródłowy)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import * as MI from '../../ui/MapInsets.js';
import * as LC from '../../config/LayoutConfig.js';
import * as MLL from '../../ui/MapLabelLogic.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const body = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };

const W = 1280, H = 833;                       // okno właściciela
const NAV = LC.BOTTOM_RESERVED;                // pasek nawigacji + listwa dziennika (42)
const STRIP = MI.BOTTOM_STRIP_H;               // pas dolny (20)
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
// Świat: lewy / prawy outliner i Dok taktyczny jako stuby z rezerwami (wzór `left_outliner_smoke`).
const setWorld = ({ civ = true, left = 150, right = 150, dock = 0 } = {}) => {
  K.civMode = civ;
  K.leftOutliner = { getReservedWidth: () => left };
  K.rightOutliner = { getReservedWidth: () => right };
  K.tacticalDock = { getReservedHeight: () => dock, isExpanded: () => false };
};

// ═══ M1 ══════════════════════════════════════════════════════════════════════
header('M1  computeMapInsets — dół obszaru mapy nad pasem dolnym');
{
  ok(NAV === 42 && STRIP === 20, `M1-0 KONTROLA: stałe — pasek nawigacji ${NAV}, pas dolny ${STRIP}`);
  const civ = MI.computeMapInsets({ civMode: true, leftW: 150, rightW: 150 });
  ok(civ.bottom === NAV + STRIP, `M1a SEDNO: tryb cywilizacji bez Doku — dół ${NAV + STRIP} (nad pasem dolnym; dawniej ${NAV}) — jest ${civ.bottom}`);
  const civDock = MI.computeMapInsets({ civMode: true, dockH: LC.TACTICAL_DOCK_TAB_H + STRIP });
  ok(civDock.bottom === NAV + LC.TACTICAL_DOCK_TAB_H + STRIP,
    `M1b KONTROLA: z Dokiem zwiniętym — ${NAV} + ${LC.TACTICAL_DOCK_TAB_H} + ${STRIP} jak dotąd (jest ${civDock.bottom})`);
  const civExp = MI.computeMapInsets({ civMode: true, dockH: LC.TACTICAL_DOCK_H + STRIP });
  ok(civExp.bottom === NAV + LC.TACTICAL_DOCK_H + STRIP, `M1c KONTROLA: z Dokiem rozwiniętym — rezerwa Doku jak dotąd (jest ${civExp.bottom})`);
  const gen = MI.computeMapInsets({ civMode: false });
  ok(gen.bottom === LC.COSMIC.BOTTOM_BAR_H && gen.left === 0 && gen.right === 0,
    `M1d KONTROLA: Generator — dolny pasek ${LC.COSMIC.BOTTOM_BAR_H}, bez kolumn (jest ${JSON.stringify(gen)})`);
  ok(MI.outlinerBottomInset(civ, true) === civ.bottom,
    `M1e SEDNO: kolumna outlinera i obszar mapy kończą się na tej samej linii (kolumna ${MI.outlinerBottomInset(civ, true)}, mapa ${civ.bottom})`);
  ok(MI.outlinerBottomInset(civDock, true) === civDock.bottom, 'M1f KONTROLA: to samo z Dokiem (rezerwa Doku wygrywa po obu stronach)');
}

// ═══ M2 ══════════════════════════════════════════════════════════════════════
header('M2  karta ciała (BottomContext._bounds) — obszar mapy z MapInsets');
{
  const { BottomContext } = await import('../../ui/BottomContext.js');
  const bc = new BottomContext();
  const TOP = LC.COSMIC.TOP_BAR_H;
  setWorld({ left: 150, right: 150 });
  const b1 = bc._bounds(W, H);
  ok(b1.ox === 150 && b1.oy === TOP && b1.ow === W - 150 - 150,
    `M2a KONTROLA: oba outlinery widoczne — od x 150 do prawego outlinera (ox ${b1.ox}, oy ${b1.oy}, ow ${b1.ow})`);
  setWorld({ left: 150, right: 0 });
  const b2 = bc._bounds(W, H);
  ok(b2.ox === 150 && b2.ow === W - 150,
    `M2b SEDNO (Finding 496): prawy outliner schowany — karta do krawędzi ekranu (ow ${W - 150}; dawniej ${W - 300}) — jest ${b2.ow}`);
  setWorld({ left: 150, right: 150 });
  const b3 = bc._bounds(W, H);
  ok(b3.oy + b3.oh === H - NAV - STRIP,
    `M2c SEDNO: dół karty nad pasem dolnym (y ${H - NAV - STRIP}; dawniej ${H - NAV}) — jest ${b3.oy + b3.oh}`);
  setWorld({ left: 150, right: 150, dock: LC.TACTICAL_DOCK_TAB_H + STRIP });
  const b4 = bc._bounds(W, H);
  ok(b4.oy + b4.oh === H - NAV - LC.TACTICAL_DOCK_TAB_H - STRIP,
    `M2d SEDNO: z Dokiem taktycznym — dół karty nad Dokiem (y ${H - NAV - LC.TACTICAL_DOCK_TAB_H - STRIP}; dawniej ${H - NAV}) — jest ${b4.oy + b4.oh}`);
  setWorld({ civ: false, left: 0, right: 0 });
  const b5 = bc._bounds(W, H);
  ok(b5.ox === 0 && b5.oy + b5.oh === H - LC.COSMIC.BOTTOM_BAR_H, `M2e KONTROLA: Generator — od x 0, dół nad dolnym paskiem (${b5.oy + b5.oh})`);
}

// ═══ M3 ══════════════════════════════════════════════════════════════════════
header('M3  edgeIndicators — kadr strzałek = prostokąt obszaru mapy');
{
  const ei = MLL.edgeIndicators;
  const m = 10;
  const rect = { x0: 150, y0: 28, x1: W - 150, y1: H - NAV - STRIP };
  const a0 = ei([{ x: -40, y: 300, tone: 'ok' }], W, H, { margin: m });
  ok(a0.length === 1 && a0[0].edge === 'left' && a0[0].x === m, `M3a KONTROLA: bez prostokąta — cały ekran jak dotąd (strzałka przy x ${a0[0]?.x})`);
  const a1 = ei([{ x: 100, y: 300, tone: 'ok' }], W, H, { margin: m, rect });
  ok(a1.length === 1 && a1[0].edge === 'left' && a1[0].x === rect.x0 + m,
    `M3b SEDNO: punkt pod lewą kolumną (x 100) — strzałka przy lewej krawędzi obszaru mapy (x ${rect.x0 + m}) — jest ${JSON.stringify(a1.map((a) => [a.edge, a.x]))}`);
  const a2 = ei([{ x: 640, y: H - 30, tone: 'ok' }], W, H, { margin: m, rect });
  ok(a2.length === 1 && a2[0].edge === 'bottom' && a2[0].y === rect.y1 - m,
    `M3c SEDNO: punkt na pasku nawigacji — strzałka nad pasem dolnym (y ${rect.y1 - m}) — jest ${JSON.stringify(a2.map((a) => [a.edge, a.y]))}`);
  const a3 = ei([{ x: 50, y: H + 100, tone: 'ok' }], W, H, { margin: m, rect });
  ok(a3.length === 1 && a3[0].edge === 'bottom' && a3[0].x >= rect.x0 + m && a3[0].y === rect.y1 - m,
    `M3d SEDNO: dolna strzałka nie wchodzi pod lewą kolumnę (x ${a3[0]?.x} ≥ ${rect.x0 + m})`);
  const a4 = ei([{ x: 640, y: 300, tone: 'ok' }], W, H, { margin: m, rect });
  ok(a4.length === 0, 'M3e KONTROLA: punkt w obszarze mapy — bez strzałki');
}

// ═══ M4 ══════════════════════════════════════════════════════════════════════
header('M4  MapLabelLayer — statki pod kolumną / pod pasem dostają strzałkę przy krawędzi obszaru mapy');
{
  const { MapLabelLayer } = await import('../../ui/MapLabelLayer.js');
  const mk = (id) => ({ id, name: id, shipId: 'hull_frigate', systemId: 'sys_home', status: 'idle', mission: null,
    position: { state: 'orbiting', x: 0, y: 0, dockedAt: null }, fuel: { current: 10, max: 10 }, modules: [] });
  // v2 + v4 — klaster dwóch statków w kadrze (plakietka; bez niej warstwa kończy klatkę przed strzałkami — kandydat
  // na finding, poza U4-2); v1 pod lewą kolumną, v3 na pasku nawigacji.
  const vs = [mk('v1'), mk('v2'), mk('v3'), mk('v4')];
  const POS = { v1: { x: 100, y: 300 }, v2: { x: 640, y: 300 }, v3: { x: 640, y: H - 30 }, v4: { x: 644, y: 300 } };
  K.vesselManager = { getAllVessels: () => vs, getVessel: (id) => vs.find((v) => v.id === id) ?? null };
  K.uiPrefs = {}; K.activeSystemId = 'sys_home';
  const tr = { getVesselScreenPosition: (id) => POS[id] ?? null, getCameraDistance: () => 50 };
  const recCtx = () => {
    const moves = [];
    return new Proxy({}, {
      get(o, k) {
        if (k === '_moves') return moves;
        if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
        if (k === 'moveTo') return (x, y) => { moves.push({ x, y }); };
        if (k in o) return o[k];
        return () => {};
      },
      set(o, k, v) { o[k] = v; return true; },
    });
  };
  setWorld({ left: 150, right: 0 });
  const layer = new MapLabelLayer();
  const ctx = recCtx();
  let threw = null; try { layer.drawVesselLabels(ctx, tr, W, H, 1); } catch (e) { threw = e; }
  const off = (layer._lastOffscreenPoints ?? []).map((p) => p.id);
  ok(!threw && !off.includes('v2') && layer._vesselHitZones.length >= 1,
    `M4-0 KONTROLA: rysowanie bez wyjątku (${threw?.message ?? 'ok'}); klaster w obszarze mapy (v2 + v4) — plakietka, bez strzałki`);
  ok(off.includes('v1'), `M4a SEDNO (Finding 494): statek pod lewą kolumną (x 100) — poza kadrem obszaru mapy (poza kadrem: ${JSON.stringify(off)})`);
  ok(off.includes('v3'), 'M4b SEDNO: statek pod pasem dolnym / paskiem nawigacji — poza kadrem obszaru mapy');
  const EM = MLL.EDGE_MARGIN;
  const tipLeft = ctx._moves.some((p) => p.x === 150 + EM - 6 && p.y === 300);
  const tipBottom = ctx._moves.some((p) => p.y === H - NAV - STRIP - EM + 6);
  ok(tipLeft && tipBottom,
    `M4c SEDNO: strzałki narysowane przy krawędziach obszaru mapy (lewa x ${150 + EM - 6}, dolna y ${H - NAV - STRIP - EM + 6}) — groty: ${JSON.stringify(ctx._moves)}`);
  setWorld({ left: 0, right: 0 });
  const layer2 = new MapLabelLayer();
  layer2.drawVesselLabels(recCtx(), tr, W, H, 1);
  const off2 = (layer2._lastOffscreenPoints ?? []).map((p) => p.id);
  ok(!off2.includes('v1') && !off2.includes('v2'), `M4d KONTROLA: lewy outliner schowany — statek przy x 100 w kadrze (poza kadrem: ${JSON.stringify(off2)})`);
  delete K.vesselManager;
}

// ═══ M5–M10 ══════════════════════════════════════════════════════════════════
header('M5–M10  jedno źródło pasa dolnego i wcięć — Dok, LayoutConfig, Dowództwo, kadr „Obserwuj”, UIManager, karta');
{
  const { TacticalDock } = await import('../../ui/TacticalDock.js');
  const tdSrc = src('../../ui/TacticalDock.js');
  ok(/import \{ BOTTOM_STRIP_H \}\s+from '\.\/MapInsets\.js';/.test(tdSrc) && !/TACTICAL_DOCK_CLOCK_CLEARANCE/.test(tdSrc),
    'M5a SEDNO: Dok taktyczny czyta prześwit nad pasem z `MapInsets.BOTTOM_STRIP_H` (bez własnej stałej)');
  const dock = Object.create(TacticalDock.prototype);
  dock.visible = true; dock._collapsed = true;
  const lay = dock._layout(W, H);
  ok(dock.getReservedHeight() === LC.TACTICAL_DOCK_TAB_H + STRIP && lay.y === H - NAV - STRIP - LC.TACTICAL_DOCK_TAB_H,
    `M5b KONTROLA: liczby Doku bez zmian — rezerwa ${dock.getReservedHeight()}, pas od y ${lay.y}`);
  ok(!('TACTICAL_DOCK_CLOCK_CLEARANCE' in LC) && 'BOTTOM_RESERVED' in LC,
    'M6 SEDNO: `LayoutConfig` bez `TACTICAL_DOCK_CLOCK_CLEARANCE` (wysokość pasa tylko w `MapInsets`)');
  const fmo = src('../../ui/FleetManagerOverlay.js');
  ok(/import \{ BOTTOM_STRIP_H \} from '\.\/MapInsets\.js';/.test(fmo) && /const TIME_STRIP_H = BOTTOM_STRIP_H;/.test(fmo)
    && /contentH = oh - TAB_H - TIME_STRIP_H/.test(fmo),
    'M7 SEDNO: Dowództwo — `TIME_STRIP_H = BOTTOM_STRIP_H` z `MapInsets` (dawniej 20 na sztywno); treść dalej ustępuje pasowi');
  const wf = body(src('../../renderer/ThreeRenderer.js'), '  _computeWatchFit(enc) {');
  ok(/watchSafeRect\(/.test(wf) && /const ins = getMapInsets\(window\.KOSMOS\);/.test(wf)
    && /bottomH: ins\.bottom\b/.test(wf) && /rightW: ins\.right\b/.test(wf) && /leftW: ins\.left\b/.test(wf)
    && !/OUTLINER_W|BOTTOM_NAV_H/.test(wf),
    'M8 SEDNO (Finding 496): kadr „Obserwuj” — lewo, prawo, dół z jednego odczytu `getMapInsets` (bez `OUTLINER_W`, bez sumy pasków)');
  const ui = src('../../scenes/UIManager.js');
  ok(/class UIManager\b/.test(ui) && /this\._leftOutliner\.draw\(/.test(ui) && !/_drawNotifications|this\._notifications\b/.test(ui),
    'M9 SEDNO: UIManager bez martwego tekstu powiadomień (`_drawNotifications`, `_notifications`)');
  const bcs = src('../../ui/BottomContext.js');
  const bb = body(bcs, '  _bounds(W, H) {');
  ok(!/OUTLINER_W/.test(bcs) && /getMapInsets\(\)/.test(bb) && /W - ins\.right - ox/.test(bb) && /H - ins\.bottom - resBar - oy/.test(bb),
    'M10 SEDNO: karta ciała — obszar z `getMapInsets` (prawa krawędź i dół), bez `OUTLINER_W`');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
