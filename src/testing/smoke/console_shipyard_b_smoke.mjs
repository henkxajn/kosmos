// Keeper — ARC KONSOLE K1c-B: szlif konsoli Stoczni (CONSOLES_PLAN.md §10.1, §12.1, uwagi właściciela A–D). KZ-Shipyard: konsola jest
// jedyną ścieżką Stoczni (flagi `consoleShipyard` / `shipHologram` zdjęte).
//
// Pinujemy LOGIKĘ (wykonaniem — ShipyardOverlay, UnitDesignOverlay, OverlayManager, ConsoleKit i renderer hologramu importują się
// pod node), bez pinów na stałe rysunku:
//   B1  blok statystyk STAŁY: prostokąty wierszy, instrumentów, kolumny delty i akcji identyczne bez najechania i z najechaniem
//       modułu (także moduły dodające nowe staty: koloniści, desant, warp; broń i tarcza) — świadek: delta faktycznie narysowana
//   A1  bez auto-obrotu: bohater woła setSpin(false) i podaje pozę gospodarza; przeciąganie obraca (yaw) i pochyla (pitch w klamrze)
//   A2  dwuklik w bohatera = poza domyślna; wolne kliki i przeciągnięcie nie resetują
//   A3  podmiana modelu trzyma pozę
//   A4  renderer: poza w kamerze i rzucie (yaw / pochylenie), kadr bohatera ~75 % szerokości, wyśrodkowany, aspect-aware
//   A5  UIManager: przeciąganie kieruje ruch do warstwy PRZED oznaczeniem UI do przerysowania; pętla otwiera / zamyka klatkę warstwy
//   W1  warstwa hologramu: prostokąt wyczyszczony w UI = prostokąt warstwy; przeciąganie maluje warstwę, nie UI; klatka UI bez
//       bohatera chowa warstwę; hide() zdejmuje ją z DOM; z warstwą UIManager nie animuje
//   L1  etykiety: żaden prostokąt etykiety nie wchodzi w obrys kadłuba, kolumny po stronach środka obrysu, bez nakładania, w prostokącie
//   D1  wybrany projekt: nawiasy bez podkreślenia (kontrola: domyślna lista nadal podkreśla)
//   C5  czip [ BUDUJ ] wiersza = reguła dawnej `_drawShipyard` przepisana niezależnie w keeperze (macierz 16 przypadków, BEZ
//       wczytywania projektu); klik buduje; wyłączony — podpowiedź z powodem
//   C6  [ USUŃ ] wymaga drugiego kliku w 3 s
//   U1  U → Stocznia ZAWSZE (bez flag, także z consoleKit OFF); inne klawisze bez zmian; projektant naziemny w dzisiejszych gospodarzach
//
// KZ-Shipyard — piny przepięte (pinowały ścieżkę OFF, której nie ma): C5a «czip wiersza ⇔ wykonanie ścieżki OFF» → reguła niezależna
// w keeperze; U1b «flagi OFF → ekran U» → U1b `routeOverlayId('unit_design', …)` = shipyard dla {} / consoleKit OFF / bez argumentu,
// inne id bez zmian; U1e «flaga OFF — U otwiera ekran U» → U1e consoleKit OFF — OverlayManager i tak otwiera Stocznię. Usunięte bez
// zamiennika: brak.
// KZ-Command — U1f przepięty: pinował `FleetManagerOverlay._drawGroundTab … _groundPanel.draw(` (usunięta zakładka Naziemne);
// teraz strona Jednostek konsoli (`CommandPagesView` → `ov._groundFacts()`) i `_withGroundColony` → panel overlayu U.
//   F726 projektant U: kategorie tarcz i desantu z etykietą i ikoną

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import fs from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { ShipyardOverlay } from '../../ui/ShipyardOverlay.js';
import { UnitDesignOverlay } from '../../ui/UnitDesignOverlay.js';
import { OverlayManager } from '../../ui/OverlayManager.js';
import { HULLS } from '../../data/HullsData.js';
import { canBuildHullAt } from '../../data/ShipBuildRules.js';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import EventBus from '../../core/EventBus.js';
import PL from '../../i18n/pl.js';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return {}; } };
const L = await tryImport('../../ui/ShipyardConsoleLogic.js');
const HL = await tryImport('../../renderer/ShipHologramLogic.js');
const R = await tryImport('../../renderer/ShipHologramRenderer.js');
const AOL = await tryImport('../../ui/ShipAnchorOverlayLogic.js');
const LAY = await tryImport('../../ui/ShipyardHoloLayer.js');
const KIT = await tryImport('../../ui/ConsoleKit.js');
const CLL = await tryImport('../../ui/ConsoleLayoutLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
// sekcja nie przerywa suity: wyjątek = jeden czerwony pin z nazwą (fail-first na bazie bez nowych symboli)
const sec = async (fn) => { try { await fn(); } catch (e) { assert(false, `sekcja przerwana wyjątkiem: ${String(e?.message ?? e).slice(0, 120)}`); } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const F = GAME_CONFIG.FEATURES;
const kitOn = () => { F.consoleKit = true; };   // KZ-Shipyard: flag Stoczni / hologramu już nie ma — tylko scena konsoli
const src = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

function mockCtx() {
  const texts = [], pos = [], clears = [], lines = [];
  let cur = null;
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, textAlign: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, globalCompositeOperation: 'source-over',
    measureText: (s) => ({ width: String(s ?? '').length * 6 }),
    fillText: (s, x, y) => { texts.push(String(s)); pos.push({ s: String(s), x, y }); }, fillRect() {}, strokeRect() {}, rect() {}, arc() {},
    beginPath() {}, moveTo(x, y) { cur = [x, y]; }, lineTo(x, y) { if (cur) lines.push([cur[0], cur[1], x, y]); cur = [x, y]; },
    stroke() {}, fill() {}, save() {}, restore() {}, clip() {}, setLineDash() {}, translate() {}, scale() {}, setTransform() {},
    clearRect: (x, y, w, h) => clears.push({ x, y, w, h }), drawImage() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    getTransform: () => ({ a: 1 }),
    _texts: texts, _pos: pos, _clears: clears, _lines: lines,
  };
  return ctx;
}

const PID = 'p_home';
const spy = { emits: [] };
EventBus.on('fleet:buildRequest', (p) => spy.emits.push(p));
function stubWorld({ level = 2, tech = true, inv = null, queues = null, templates = null } = {}) {
  spy.emits = [];
  const active = new Map();
  if (level > 0) active.set('b1', { building: { id: 'shipyard' }, level });
  const richInv = inv ?? Object.fromEntries(['Fe', 'Ti', 'Cu', 'Si', 'C', 'Hv', 'Li', 'W', 'Pt', 'Xe', 'Nt',
    'structural_alloys', 'polymer_composites', 'electronics', 'power_cells', 'conductor_bundles', 'semiconductor_wafers',
    'reactor_core', 'quantum_cores', 'warp_cores', 'plasma_cores', 'nanotech_parts'].map((k) => [k, 99999]));
  const col = { planetId: PID, name: 'Dom', credits: 5000, civSystem: { freePops: 3 }, buildingSystem: { _active: active },
    resourceSystem: { inventorySnapshot: () => richInv, inventory: richInv },
    shipQueues: queues ?? [], pendingShipOrders: [] };
  const ed = new UnitDesignOverlay();
  const ui = { _dirty: false, isConsoleSceneActive: () => true };
  globalThis.window.KOSMOS = {
    lang: 'pl', civMode: true, uiScale: 1, uiManager: ui,
    techSystem: { isResearched: () => tech },
    unitDesigns: templates ?? [{ id: 'tpl1', name: 'Zwiadowca', hullId: 'hull_small', modules: ['engine_chemical', 'cargo_small', null] }],
    colonyManager: { activePlanetId: PID, getColony: (id) => (id === PID ? col : null), getShipQueues: () => col.shipQueues,
      surgeShipBuild() {}, cancelPendingShip() {} },
    vesselManager: { getAllVessels: () => [], getVessel: () => null, getVesselUpkeepCredits: () => 30, fleetInArrears: () => false, deployVessel: () => ({ ok: true }) },
    overlayManager: { overlays: { unit_design: ed } },
  };
  return { col, ed, ui };
}

/** Atrapa hologramu (rejestruje wywołania gospodarza). */
function fakeHolo() {
  const f = { spin: null, pose: null, keys: [], mode: null, released: false, draws: 0,
    setModel(k) { f.keys.push(k); f.modelKey = k; }, setMode(m) { f.mode = m; }, setSpin(on) { f.spin = on; }, setPose(p) { f.pose = { ...p }; },
    draw() { f.draws++; return {}; }, isAnimating: () => false, anchors: () => null, projectPoints: () => [], projectHullBox: () => null,
    release() { f.released = true; } };
  return f;
}
/** Atrapa dokumentu z #ui-canvas (warstwa wstawiana przed nim). */
function fakeDoc() {
  const parent = { kids: [], insertBefore(el, ref) { this.kids.splice(this.kids.indexOf(ref), 0, el); el.parentNode = this; },
    removeChild(el) { this.kids = this.kids.filter((k) => k !== el); el.parentNode = null; } };
  const ui = { id: 'ui-canvas', parentNode: parent };
  parent.kids.push(ui);
  return { parent, ui, getElementById: (id) => (id === 'ui-canvas' ? ui : null),
    createElement: () => { const c = mockCtx(); return { style: {}, width: 0, height: 0, getContext: () => c, ctx: c }; } };
}

const W = 1280, H = 833;
function drawSy(setup) {
  kitOn();
  const sy = new ShipyardOverlay(); sy.visible = true;
  setup?.(sy);
  const ctx = mockCtx();
  sy.draw(ctx, W, H);
  return { sy, ctx };
}
const loadTpl = (ed, idx = 0) => ed._onHit({ type: 'edit_template', data: { index: idx } });

// ═══════════════════════════════════════════════════════════════════════════
console.log('B1 — blok statystyk o stałym układzie (najechanie modułu nie przesuwa niczego)');
await sec(async () => {
  const cases = [
    ['hull_large', 3, 'cargo_large'], ['hull_large', 3, 'habitat_pod'], ['hull_large', 4, 'troop_bay_m'], ['hull_large', 5, 'warp_tank'],
    ['hull_frigate', 1, 'weapon_laser'], ['hull_frigate', 2, 'shield_phase'], ['hull_large', 0, 'engine_ion'],
  ];
  let same = 0, drawnDelta = 0, n = 0;
  const geo = (sy) => JSON.stringify([sy.lastStatLayout, sy._hitZones.filter((z) => ['save_template', 'clear_design'].includes(z.type)).map((z) => [z.type, z.x, z.y, z.w, z.h])]);
  for (const [hid, slot, mod] of cases) {
    const prep = (sy) => {
      const ed = window.KOSMOS.overlayManager.overlays.unit_design;
      ed._onHit({ type: 'select_hull', data: { hullId: hid } });
      ed._onHit({ type: 'pick_module', data: { moduleId: 'engine_chemical' } });   // slot 0 aktywny po wyborze kadłuba? — ustaw jawnie
      ed._activeSlotIndex = slot;
    };
    stubWorld();
    const a = drawSy(prep);
    const ed = window.KOSMOS.overlayManager.overlays.unit_design;
    const b = drawSy((sy) => { sy._hoverZone = { type: 'pick_module', data: { moduleId: mod } }; });
    n++;
    if (a.sy.lastStatLayout && geo(a.sy) === geo(b.sy)) same++;
    const hdr = String(PL['shipyardConsole.deltaFor'] ?? '').split('{')[0].trim();
    if (b.ctx._texts.some((s) => hdr && s.toUpperCase().includes(hdr.toUpperCase().slice(0, 6))) && !a.ctx._texts.some((s) => hdr && s.toUpperCase().includes(hdr.toUpperCase().slice(0, 6)))) drawnDelta++;
    void ed;
  }
  assert(same === n, `B1a: prostokąty wierszy / instrumentów / delty / akcji identyczne z najechaniem i bez (${same}/${n})`);
  assert(drawnDelta === n, `B1b (świadek): najechanie faktycznie rysuje nagłówek delty (${drawnDelta}/${n})`);
  const lay = safe(() => L.inspectorStatLayout({ x: 0, y: 0, w: 300, h: 600 }, { eyebrowH: 16, instrH: 60, kvH: 18, chipH: 18, reasonH: 13, deltaW: 64 }));
  assert(!!lay && lay.rows.length === (L.STAT_ROW_KEYS?.length ?? -1) && lay.rows.every((r) => r.delta.w === 64 && r.delta.x === 236),
    `B1c: wszystkie wiersze (${lay?.rows?.length}) mają tę samą kolumnę delty`);
  const keys = L.STAT_ROW_KEYS ?? [];
  assert(['colonistsTroops', 'warp', 'module', 'costDelta'].every((k) => keys.includes(k)), 'B1d: wiersze koloniści / desant, warp, moduł i delta kosztu zawsze obecne');
  const v = strip(src('../../ui/ShipyardConsoleView.js'));
  assert(/drawTabular\(ctx, truncateText\(r\.d/.test(v), 'B1e: delta cyframi tabelarycznymi w stałej kolumnie');
  const sub = safe(() => L.statDeltaSubSlots({ x: 236, y: 0, w: 64, h: 16 }), []);
  assert(sub.length === 2 && sub[1].x + sub[1].w === 300 && sub[0].x === 236 && sub[0].x + sub[0].w === sub[1].x,
    'B1f: delta wiersza-pary (Koloniści / Desant) w tej samej kolumnie — druga zmiana do prawej krawędzi kolumny');
  assert(/dPair: \[fmtDelta\(D\.colonistCapacity\), fmtDelta\(D\.troopCapacity\)\]/.test(v) && /statDeltaSubSlots\(L\.delta\)/.test(v),
    'B1g: Koloniści / Desant rysowani w podkolumnach kolumny delty');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('A1–A3 — poza bohatera: bez auto-obrotu, przeciąganie, dwuklik, podmiana modelu');
await sec(async () => {
  const { ed } = stubWorld(); loadTpl(ed);
  const f = fakeHolo();
  const { sy } = drawSy((s) => { s._holo = f; s._createHoloLayer = () => null; });
  assert(f.spin === false && f.draws >= 1, 'A1a: bohater wyłącza auto-obrót (setSpin(false)) i rysuje hologram');
  assert(!!f.pose && f.pose.yaw === 0 && f.pose.pitch === 0, 'A1b: domyślnie statyczne 3/4 (poza 0, 0)');
  const r = sy.heroHoloRect;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  sy.handleMouseDown(cx, cy, 0);
  assert(sy.isHoloDragging() === true, 'A1c: wciśnięcie w bohaterze zaczyna przeciąganie');
  sy.handleHoloDrag(cx + 60, cy + 10);
  sy.handleMouseUp(cx + 60, cy + 10, 0);
  const P = HL.HOLO_POSE ?? {};
  assert(Math.abs(sy._holoPose.yaw - 60 * P.YAW_PER_PX) < 1e-9 && Math.abs(sy._holoPose.pitch - 10 * P.PITCH_PER_PX) < 1e-9 && f.pose.yaw === sy._holoPose.yaw,
    `A1d: przeciągnięcie obraca i pochyla (yaw ${sy._holoPose.yaw.toFixed(3)}, pitch ${sy._holoPose.pitch.toFixed(3)})`);
  assert(sy.isHoloDragging() === false, 'A1e: puszczenie kończy przeciąganie');
  const p2 = safe(() => HL.dragPose({ yaw: 0, pitch: 0 }, 0, 10000));
  const p3 = safe(() => HL.dragPose({ yaw: 3, pitch: 0 }, 1000, -10000));
  assert(p2?.pitch === P.PITCH_MAX && p3?.pitch === P.PITCH_MIN && p3.yaw > -Math.PI && p3.yaw <= Math.PI, 'A1f: pochylenie w klamrze, yaw zawinięty');
  sy.handleMouseDown(r.x - 50, cy, 0);
  assert(sy.isHoloDragging() === false, 'A1g: wciśnięcie poza bohaterem nie przeciąga');
  sy.handleMouseUp(r.x - 50, cy, 0);
  // A3 — podmiana modelu trzyma pozę
  const keep = { ...sy._holoPose };
  ed._onHit({ type: 'select_hull', data: { hullId: 'hull_frigate' } });
  sy.draw(mockCtx(), W, H);
  assert(f.keys.length >= 2 && f.keys[f.keys.length - 1] !== f.keys[0] && f.pose.yaw === keep.yaw && f.pose.pitch === keep.pitch,
    `A3: inny kadłub → inny model (${f.keys[0]} → ${f.keys[f.keys.length - 1]}), poza bez zmian`);
  // A2 — dwuklik
  let now = 1000; sy._now = () => now;
  const tap = (x, y) => { sy.handleMouseDown(x, y, 0); sy.handleMouseUp(x, y, 0); };
  tap(cx, cy); now += 600; tap(cx, cy);
  assert(sy._holoPose.yaw === keep.yaw, 'A2a: dwa wolne kliki (600 ms) nie resetują');
  now += 150; tap(cx + 2, cy + 1);
  assert(sy._holoPose.yaw === 0 && sy._holoPose.pitch === 0 && f.pose.yaw === 0, 'A2b: dwuklik (150 ms) → poza domyślna');
  sy._holoPose = { ...keep };
  now += 1000; tap(cx, cy); now += 100;
  sy.handleMouseDown(cx, cy, 0); sy.handleHoloDrag(cx + 40, cy); sy.handleMouseUp(cx + 40, cy, 0);
  assert(sy._holoPose.yaw !== 0, 'A2c: klik + przeciągnięcie to nie dwuklik');
  sy._onHit({ type: 'holo_view', data: { mode: 'plan' } });
  sy.handleMouseDown(cx, cy, 0);
  assert(sy.isHoloDragging() === false, 'A2d: w widoku [ PLAN ] (rysunek techniczny) bez obracania');
  sy.handleMouseUp(cx, cy, 0);
  assert(HL.isDoubleTap?.({ t: 0, x: 0, y: 0 }, { t: 400, x: 8, y: 0 }) === true && HL.isDoubleTap?.({ t: 0, x: 0, y: 0 }, { t: 401, x: 0, y: 0 }) === false
    && HL.isDoubleTap?.({ t: 0, x: 0, y: 0 }, { t: 100, x: 9, y: 0 }) === false, 'A2e: okno dwukliku 400 ms / 8 px');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('A4 — renderer: poza w kamerze i rzucie, kadr bohatera');
await sec(async () => {
  const fakeCanvas = (w = 1, h = 1) => ({ width: w, height: h, getContext: () => mockCtx(), addEventListener() {}, removeEventListener() {} });
  const fakeGL = (canvas) => ({ canvas, renders: 0, setSize() {}, setPixelRatio() {}, setClearColor() {}, render() { this.renders++; }, clear() {},
    dispose() {}, forceContextLoss() {}, getContext: () => ({ RGBA: 1, UNSIGNED_BYTE: 2, readPixels() {}, getExtension: () => null }) });
  const tpl = () => { const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.15, 0.2), new THREE.MeshStandardMaterial())); return root; };
  const mk = (fit) => new R.ShipHologramRenderer({ THREE, fit, createCanvas: fakeCanvas, createGL: fakeGL,
    loadTemplate: async () => ({ template: tpl(), path: 'assets/models/ships/x_key.glb' }), loadFrame: async () => ({ bow: [-1, 0, 0], up: [0, 1, 0] }),
    getColor: () => '#ffffff', getEpoch: () => 1, now: () => 0, tuning: { ...HL.HOLO_TUNING_DEFAULTS } });
  const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
  const rect = { x: 0, y: 0, w: 600, h: 400 };
  if (R.ShipHologramRenderer) {
    const k1a = mk(null), hero = mk('hero');
    for (const r of [k1a, hero]) { r.setModel('x_key'); }
    await settle();
    for (const r of [k1a, hero]) safe(() => r.draw(mockCtx(), rect));
    const pts = [[-0.5, 0, 0], [0.5, 0, 0]];
    const p0 = safe(() => k1a.projectPoints(pts, rect), []);
    const box = safe(() => hero.projectHullBox(rect));
    const fillW = box ? (box.x1 - box.x0) / rect.w : 0, fillH = box ? (box.y1 - box.y0) / rect.h : 0;
    assert(!!box && Math.abs(Math.max(fillW / 0.75, fillH / 0.72) - 1) < 0.02 && fillW <= 0.77 && fillH <= 0.74, `A4a: kadr bohatera — obrys ${(fillW * 100).toFixed(1)} % szer. / ${(fillH * 100).toFixed(1)} % wys. (cel 75 % albo 72 %)`);
    const cxb = box ? (box.x0 + box.x1) / 2 : 0, cyb = box ? (box.y0 + box.y1) / 2 : 0;
    assert(Math.abs(cxb - 300) < 1 && Math.abs(cyb - 200) < 1, `A4b: obrys wyśrodkowany (${cxb.toFixed(1)}, ${cyb.toFixed(1)})`);
    const boxK1a = safe(() => k1a.projectHullBox(rect));
    assert(!!boxK1a && (boxK1a.x1 - boxK1a.x0) < (box?.x1 - box?.x0) * 0.9, 'A4c (kontrola): bez `fit` — kadr K1a (mniejszy model)');
    hero.setPose({ yaw: 0.6, pitch: 0 });
    const b2 = safe(() => hero.projectHullBox(rect));
    const fr = hero.framing?.();
    assert(!!b2 && JSON.stringify(b2) !== JSON.stringify(box) && fr && hero.framing().s === fr.s, 'A4d: obrót zmienia rzut, kadr (skala) stały');
    const p1 = safe(() => { k1a.setPose({ yaw: 0.6, pitch: 0 }); return k1a.projectPoints(pts, rect); }, []);
    assert(p0.length === 2 && p1.length === 2 && Math.abs(p0[0].x - p1[0].x) > 1, 'A4e: poza (yaw) w rzucie kotwic — etykiety idą za modelem');
    const pp = safe(() => { k1a.setPose({ yaw: 0.6, pitch: 0.3 }); return k1a.projectPoints([[0, 0.2, 0]], rect); }, []);
    assert(pp.length === 1 && Math.abs(pp[0].y - safe(() => { k1a.setPose({ yaw: 0.6, pitch: 0 }); return k1a.projectPoints([[0, 0.2, 0]], rect)[0].y; }, 0)) > 0.5,
      'A4f: pochylenie zmienia wysokość kamery w rzucie');
    const spec0 = HL.holoCameraSpec('3q', 1.5), specD = HL.holoCameraSpec('3q', 1.5, { elevationDeg: HL.HOLO_VIEW.ELEVATION_DEG });
    assert(JSON.stringify(spec0) === JSON.stringify(specD), 'A4g (kontrola): kamera bez pochylenia = kadr K1a co do bitu');
    const tall = safe(() => HL.heroFraming({ x0: -0.1, y0: -0.5, x1: 0.1, y1: 0.5 }));
    const wide = safe(() => HL.heroFraming({ x0: -0.4, y0: -0.05, x1: 0.6, y1: 0.05 }));
    assert(!!tall && Math.abs(tall.s * 1 - 2 * 0.72) < 1e-9 && !!wide && Math.abs(wide.s * 1 - 1.5) < 1e-9 && Math.abs(wide.tx + wide.s * 0.1) < 1e-9,
      'A4h: heroFraming — wąski i wysoki kadłub w klamrze wysokości, długi w 75 % szerokości, środek → 0');
    // bez auto-obrotu: setSpin(false) → brak animacji
    hero.setSpin(false);
    assert(hero.isAnimating() === false, 'A4i: bez auto-obrotu renderer nie animuje (0 klatek w bezczynności)');
  } else assert(false, 'A4: renderer niedostępny');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('A5 — UIManager (piny źródła): ruch przy przeciąganiu bez przerysowania UI, klatka warstwy');
await sec(async () => {
  const u = strip(src('../../scenes/UIManager.js'));
  const mm = u.slice(u.indexOf('handleMouseMove(x, y) {'), u.indexOf('handleMouseMove(x, y) {') + 600);
  const iDrag = mm.indexOf('isHoloDragging'), iDirty = mm.indexOf('this._dirty = true');
  assert(iDrag > 0 && iDirty > iDrag && /handleHoloDrag\([^)]*\);\s*return;/.test(mm), 'A5a: przeciąganie obsłużone i zakończone PRZED `_dirty = true`');
  assert(/beginUiFrame\?\.\(\);\s*this\._draw\(\);\s*sy\?\.endUiFrame\?\.\(\);/.test(u), 'A5b: pętla UI otwiera i zamyka klatkę warstwy wokół `_draw`');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('W1 — warstwa hologramu pod UI');
await sec(async () => {
  const { ed, ui } = stubWorld(); loadTpl(ed);
  const f = fakeHolo();
  const doc = fakeDoc();
  const rafQ = [];
  let layer = null;
  kitOn();
  const sy = new ShipyardOverlay(); sy.visible = true;
  sy._holo = f;
  sy._createHoloLayer = () => (layer = new LAY.ShipyardHoloLayer({ doc, raf: (cb) => rafQ.push(cb) }));
  const ctx = mockCtx();
  sy.beginUiFrame(); sy.draw(ctx, W, H); sy.endUiFrame();
  const lr = layer?.rect;
  assert(!!layer && doc.parent.kids.indexOf(layer.canvas) === doc.parent.kids.indexOf(doc.ui) - 1, 'W1a: warstwa wstawiona tuż przed #ui-canvas (pod UI)');
  assert(!!lr && ctx._clears.some((c) => c.x === lr.x && c.y === lr.y && c.w === lr.w && c.h === lr.h), 'W1b: UI czyści dokładnie prostokąt warstwy (przezroczysty)');
  assert(layer?.shown === true && layer.stats.paints === 1 && f.draws === 1, `W1c: pierwsza klatka maluje warstwę (malowań ${layer?.stats?.paints}, hologram ${f.draws})`);
  sy.beginUiFrame(); sy.draw(mockCtx(), W, H); sy.endUiFrame();
  assert(layer.stats.paints === 1, 'W1d: klatka UI bez zmian stanu nie maluje warstwy ponownie');
  const r = sy.heroHoloRect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ui._dirty = false;
  sy.handleMouseDown(cx, cy, 0);
  for (let k = 1; k <= 5; k++) sy.handleHoloDrag(cx + 10 * k, cy);
  assert(ui._dirty === false && rafQ.length === 1, `W1e: przeciąganie nie oznacza UI do przerysowania, prośby o malowanie łączone (${rafQ.length})`);
  rafQ.splice(0).forEach((cb) => cb());
  assert(layer.stats.paints === 2 && f.pose.yaw === sy._holoPose.yaw, 'W1f: klatka warstwy maluje hologram w nowej pozie');
  sy.handleMouseUp(cx + 50, cy, 0);
  assert(sy.isAnimating() === false, 'W1g: z warstwą UIManager nie animuje (przenikanie maluje warstwa)');
  sy.beginUiFrame(); sy.endUiFrame();   // klatka UI bez bohatera (np. czysty widok)
  assert(layer.shown === false && layer.canvas.style.display === 'none', 'W1h: klatka UI bez bohatera chowa warstwę');
  sy.beginUiFrame(); sy.draw(mockCtx(), W, H); sy.endUiFrame();
  assert(layer.shown === true, 'W1i: kolejna klatka z bohaterem — warstwa wraca');
  const cv = layer.canvas;
  sy.hide();
  assert(!doc.parent.kids.includes(cv) && sy._holoLayer === null && f.released === true, 'W1j: hide() zdejmuje warstwę z DOM i zwalnia hologram');
  const snap = safe(() => HL.snapRectToCss({ x: 10.3, y: 20.1, w: 100.2, h: 50 }, 1.25));
  assert(!!snap && Number.isInteger(snap.css.left) && Number.isInteger(snap.css.width) && snap.x <= 10.3 && snap.x + snap.w >= 110.5,
    'W1k: prostokąt warstwy na całych px CSS i obejmuje prostokąt bohatera');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('L1 — etykiety poza obrysem kadłuba');
await sec(async () => {
  const rect = { x: 100, y: 100, w: 600, h: 420 };
  const o = AOL.ANCHOR_OVERLAY ?? {};
  const inter = (a, b) => a.x < b.x1 && a.x + a.w > b.x0 && a.y < b.y1 && a.y + a.h > b.y0;
  const mkItems = (pts) => pts.map(([x, y, n], k) => ({ key: 'r' + k, x, y, text: 'ROLA' + k, subs: Array.from({ length: n }, (_, j) => `Moduł ${j} ×2`), label: true }));
  const configs = [
    // długi kadłub (75 % szerokości) — kolumny nad / pod obrysem
    { hull: { x0: 175, y0: 260, x1: 625, y1: 360 }, pts: [[200, 300, 2], [260, 330, 1], [400, 310, 3], [560, 300, 1], [600, 340, 2], [380, 350, 0]] },
    // zwarty kadłub — kolumny obok obrysu
    { hull: { x0: 300, y0: 200, x1: 500, y1: 420 }, pts: [[320, 250, 1], [340, 380, 2], [470, 260, 1], [480, 400, 3]] },
    // wszystkie kotwice po jednej stronie
    { hull: { x0: 180, y0: 250, x1: 620, y1: 370 }, pts: [[200, 300, 1], [220, 320, 2], [240, 280, 1], [260, 350, 1]] },
  ];
  let ok = 0, sides = 0, overl = 0, inside = 0, total = 0;
  for (const c of configs) {
    const placed = safe(() => AOL.layoutHeroLabels(mkItems(c.pts), rect, c.hull, {}), []);
    const rs = placed.map((e) => AOL.labelRect(e));
    total += placed.length;
    if (rs.every((q) => q && !inter(q, c.hull))) ok++;
    const cx = (c.hull.x0 + c.hull.x1) / 2;
    sides += placed.filter((e) => e.side === (e.x < cx ? -1 : 1)).length;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (AOL.labelsOverlap(placed[i], placed[j])) overl++;
    inside += rs.filter((q) => q && q.x >= rect.x && q.x + q.w <= rect.x + rect.w + 0.01 && q.y >= rect.y && q.y + q.h <= rect.y + rect.h + 0.01).length;
  }
  assert(ok === configs.length && total === 14, `L1a: żaden prostokąt etykiety nie wchodzi w obrys kadłuba (${ok}/${configs.length} układów)`);
  assert(sides === total && total === 14, `L1b: kotwica po lewej środka obrysu → kolumna lewa, po prawej → prawa (${sides}/${total})`);
  assert(overl === 0 && total === 14, `L1c: etykiety się nie nakładają (${overl})`);
  assert(inside === total && total === 14, `L1d: etykiety w prostokącie hologramu (${inside}/${total})`);
  const bands = safe(() => AOL.layoutHeroLabels(mkItems(configs[0].pts), rect, configs[0].hull, {}), []).map((e) => e.band);
  const beside = safe(() => AOL.layoutHeroLabels(mkItems(configs[1].pts), rect, configs[1].hull, {}), []).map((e) => e.band);
  assert(bands.some((b) => b === 'above') && bands.some((b) => b === 'below') && beside.every((b) => b === 'beside'),
    'L1e (świadek): oba tryby kolumn — nad/pod obrysem (długi kadłub) i obok (zwarty)');
  const old = safe(() => AOL.layoutAnchorLabels(mkItems(configs[0].pts), rect, {}), []);
  assert(old.map((e) => AOL.labelRect(e)).some((q) => q && inter(q, configs[0].hull)), 'L1f (kontrola): układ K1b kładł etykiety na kadłubie');
  const v = strip(src('../../ui/ShipyardConsoleView.js'));
  assert(/hullBox: state\.view === 'plan' \? undefined : \(holo\.projectHullBox/.test(v) && /halo: applyConsoleHalo/.test(v),
    'L1g: bohater podaje obrys kadłuba (3/4) i poświatę tekstu konsoli etykietom');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('D1 — wybrany projekt: nawiasy bez podkreślenia');
await sec(async () => {
  const rect = { x: 0, y: 0, w: 300, h: 200 };
  const rows = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  const roles = { primary: '#fff', dim: '#888', alert: '#f00' };
  const underlineAt = (ctx, y) => ctx._lines.some((l) => Math.abs(l[1] - y) < 0.01 && Math.abs(l[3] - y) < 0.01 && Math.abs(l[2] - l[0]) > 100);
  const c0 = mockCtx(), c1 = mockCtx();
  const rh = KIT.CONSOLE_KIT?.ROW_H ?? 20;
  safe(() => KIT.drawList(c0, rect, rows, roles, { selectedId: 'a' }));
  safe(() => KIT.drawList(c1, rect, rows, roles, { selectedId: 'a', underline: false }));
  assert(underlineAt(c0, rh - 1.5), 'D1a (kontrola): domyślna lista konsoli podkreśla wybrany wiersz');
  assert(!underlineAt(c1, rh - 1.5) && c1._lines.length >= 8, `D1b: underline:false — bez podkreślenia, nawiasy narysowane (${c1._lines.length} odcinków)`);
  const v = strip(src('../../ui/ShipyardConsoleView.js'));
  const seg = v.slice(v.indexOf('const res = drawList(ctx, tplRect'), v.indexOf('const res = drawList(ctx, tplRect') + 400);
  assert(/underline: false/.test(seg), 'D1c: lista projektów Stoczni rysuje wybór bez podkreślenia');
  const seg2 = v.slice(v.indexOf('const res = drawList(ctx, hullRect'), v.indexOf('const res = drawList(ctx, hullRect') + 400);
  assert(/underline: false/.test(seg2), 'D1d: lista kadłubów — także same nawiasy (decyzja 4 z bramki)');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('C5 — czip [ BUDUJ ] w wierszu projektu = dzisiejsza reguła');
await sec(async () => {
  // Reguła dawnej `ShipyardOverlay._drawShipyard` (usuniętej w KZ-Shipyard), przepisana NIEZALEŻNIE od `templateBuildState`
  // (poziom stoczni 1): eksploracja (bramka S0 = tech) → tech kadłuba → stocznia naziemna → (stać ? wolny slot : kolejka).
  const oldRule = ({ tech, full, afford, hullId }) => {
    if (!tech) return false;
    if (HULLS[hullId].requires && !tech) return false;
    if (!canBuildHullAt(hullId, 'ground')) return false;
    return afford ? !full : true;
  };
  let cases = 0, agree = 0, offClick = 0, reasonOk = 0, blocked = 0;
  for (const hullId of ['hull_small', 'hull_frigate']) for (const tech of [true, false]) for (const full of [false, true]) for (const afford of [true, false]) {
    const tpl = { id: 'tx', name: 'T', hullId, modules: hullId === 'hull_small' ? ['engine_chemical', null, null] : ['engine_chemical', null, null, null] };
    const opts = { tech, templates: [tpl], level: 1, queues: full ? [{ shipId: 'hull_small', progress: 0, buildTime: 3 }] : [], inv: afford ? null : {} };
    const off = oldRule({ tech, full, afford, hullId });   // nazwa zostaje: «dawna Stocznia»
    stubWorld(opts);   // projekt NIE wczytany — czip wiersza działa na zapisanym szablonie
    const on = drawSy();
    const lz = on.sy.consoleZones?.list;
    const chip = on.sy._hitZones.find((z) => z.type === 'build_template' && lz && z.y >= lz.y && z.y <= lz.y + lz.h && z.x >= lz.x);
    cases++; if (!!chip === off) agree++; if (off) offClick++;
    const bl = on.sy._hitZones.find((z) => z.type === 'tpl_build_blocked');
    if (bl) { blocked++; if (bl.data.reason && on.ctx._texts.some((s) => s === bl.data.reason || s.startsWith(bl.data.reason.slice(0, 8)))) reasonOk++; }
    if (!!chip === !!bl) agree -= 0.5;   // dokładnie jedno z dwojga
  }
  assert(agree === cases, `C5a: [ BUDUJ ] wiersza klikalny ⇔ reguła dawnej karty szablonu (niezależna kopia) i dokładnie jeden z czipów BUDUJ / zablokowany (${agree}/${cases})`);
  assert(offClick > 0 && offClick < cases, `C5b (świadek): macierz ma oba stany (${offClick} z ${cases})`);
  assert(blocked === cases - offClick && reasonOk === blocked, `C5c: wyłączony czip niesie powód (ten sam tekst co w wierszu) (${reasonOk}/${blocked})`);
  stubWorld();
  const on = drawSy();
  const chip = on.sy._hitZones.find((z) => z.type === 'build_template');
  if (chip) on.sy._onHit(chip);
  assert(spy.emits.length === 1 && spy.emits[0].shipId === 'hull_small' && JSON.stringify(spy.emits[0].modules) === JSON.stringify(['engine_chemical', 'cargo_small']),
    'C5d: jeden klik buduje zapisany projekt (fleet:buildRequest z kadłubem i modułami szablonu)');
  const ed = window.KOSMOS.overlayManager.overlays.unit_design;
  assert(!!chip && spy.emits.length === 1 && ed._editingTemplateId == null, 'C5e: [ BUDUJ ] nie wczytuje projektu (świadek: czip istniał i zbudował)');
  const tplZone = on.sy._hitZones.find((z) => z.type === 'tpl_row');
  on.sy._onHit(tplZone);
  assert(ed._editingTemplateId === 'tpl1', 'C5f (kontrola — tak jak w K1c-A): klik w wiersz nadal wczytuje projekt');
  assert(!on.sy._hitZones.some((z) => z.type === 'edit_template'), 'C5g: [ EDYTUJ ] zastąpiony przez [ BUDUJ ]');
  stubWorld({ tech: false });
  const bl = drawSy((sy) => { sy._hoverZone = null; });
  const bz = bl.sy._hitZones.find((z) => z.type === 'tpl_build_blocked');
  const bl2 = drawSy((sy) => { sy._hoverZone = bz; });
  assert(!!bz && bl2.sy._tplTooltip?.text === bz.data.reason && bl2.ctx._texts.includes(bz.data.reason), 'C5h: najechanie wyłączonego czipu pokazuje podpowiedź z powodem');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('C6 — [ USUŃ ] za drugim kliknięciem w 3 s');
await sec(async () => {
  const dc = L.deleteClick ?? (() => ({ arm: null, delete: true }));
  const a1 = dc(null, { id: 'x', now: 0 });
  const a2 = dc(a1.arm, { id: 'x', now: 2999 });
  const a3 = dc(a1.arm, { id: 'x', now: 3001 });
  const a4 = dc(a1.arm, { id: 'y', now: 10 });
  assert(a1.delete === false && a1.arm?.until === 3000 && a2.delete === true && a2.arm === null, 'C6a: pierwszy klik uzbraja, drugi w 3 s kasuje');
  assert(a3.delete === false && a3.arm?.until === 6001 && a4.delete === false && a4.arm?.id === 'y', 'C6b: po 3 s albo w inny projekt — uzbraja od nowa');
  const { ed } = stubWorld({ templates: [{ id: 't1', name: 'A', hullId: 'hull_small', modules: ['engine_chemical', null, null] }, { id: 't2', name: 'B', hullId: 'hull_small', modules: ['engine_chemical', null, null] }] });
  void ed;
  let now = 5000;
  const on = drawSy((sy) => { sy._now = () => now; });
  const del = () => on.sy._hitZones.find((z) => z.type === 'delete_template' && z.data.index === 0);
  on.sy._onHit(del());
  assert(window.KOSMOS.unitDesigns.length === 2, 'C6c: pierwszy klik nie kasuje');
  on.sy._hitZones = []; const c2 = mockCtx(); on.sy.draw(c2, W, H);
  assert(c2._texts.some((s) => s.includes(String(PL['shipyardConsole.confirm']).toUpperCase())), 'C6d: czip pokazuje [ POTWIERDŹ ]');
  now += 3100; on.sy._onHit(del());
  assert(window.KOSMOS.unitDesigns.length === 2, 'C6e: drugi klik po 3,1 s nie kasuje (uzbraja od nowa)');
  now += 500; on.sy._onHit(del());
  assert(window.KOSMOS.unitDesigns.length === 1 && window.KOSMOS.unitDesigns[0].id === 't2', 'C6f: drugi klik w 3 s kasuje właściwy projekt');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('U1 — klawisz U → projektant Stoczni; projektant naziemny w dzisiejszych gospodarzach');
await sec(async () => {
  assert(CLL.routeOverlayId?.('unit_design', { consoleKit: true }) === 'shipyard', 'U1a: U → Stocznia');
  assert(CLL.routeOverlayId?.('unit_design', {}) === 'shipyard' && CLL.routeOverlayId?.('unit_design', { consoleKit: false }) === 'shipyard'
    && CLL.routeOverlayId?.('unit_design') === 'shipyard', 'U1b: trwałe — U → Stocznia bez flag, z consoleKit OFF i bez argumentu flag');
  assert(['fleet', 'shipyard', 'tech', 'colony', 'diplomacy'].every((id) => CLL.routeOverlayId?.(id, {}) === id),
    'U1g (kontrola): inne klawisze bez zmian (fleet, shipyard, tech, colony, diplomacy)');
  kitOn();
  const om = new OverlayManager();
  const mkOv = () => ({ visible: false, show() { this.visible = true; }, hide() { this.visible = false; } });
  om.register('shipyard', mkOv()); om.register('unit_design', mkOv());
  om.handleKey('u');
  assert(om.active === 'shipyard' && om.overlays.shipyard.visible && !om.overlays.unit_design.visible, 'U1c: OverlayManager — U otwiera Stocznię');
  om.handleKey('u');
  assert(om.active === null, 'U1d (kontrola): drugie U zamyka (jak S)');
  F.consoleKit = false;
  om.handleKey('u');
  F.consoleKit = true;
  assert(om.active === 'shipyard' && om.overlays.shipyard.visible && !om.overlays.unit_design.visible,
    'U1e: trwałe — przy consoleKit OFF U nadal otwiera Stocznię (ekran U nie wraca)');
  // KZ-Command: dawna zakładka Naziemne (`_drawGroundTab` → `_groundPanel.draw`) usunięta — Dowództwo → Jednostki to strona konsoli
  // (`CommandPagesView` czyta `ov._groundFacts()`), która rekrutuje przez panel zarejestrowanego overlayu U (`_withGroundColony`)
  const fm = strip(src('../../ui/FleetManagerOverlay.js')), co = strip(src('../../ui/ColonyOverlay.js')), um = strip(src('../../scenes/UIManager.js'));
  const pv = strip(src('../../ui/CommandPagesView.js'));
  assert(/_withGroundColony\(fn\) \{[\s\S]{0,200}_getDesignEditor\(\)\?\._groundPanel/.test(fm) && /overlays\?\.unit_design/.test(fm)
    && /ov\._groundFacts\(\)/.test(pv) && /GroundUnitPanel/.test(co) && /register\('unit_design', new UnitDesignOverlay\(\)\)/.test(um),
    'U1f (kontrola): projektant naziemny — Dowództwo → Jednostki (strona konsoli przez panel overlayu U) i szkic Kolonii bez zmian; overlay U nadal zarejestrowany');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('F726 — projektant U: kategorie tarcz i desantu');
await sec(async () => {
  stubWorld();
  const ed = new UnitDesignOverlay(); ed.visible = true;
  ed._onHit({ type: 'select_hull', data: { hullId: 'hull_frigate' } });
  ed._onHit({ type: 'select_slot', data: { index: 1 } });
  const ctx = mockCtx();
  ed.draw(ctx, 1920, 1080);
  const tx = ctx._texts;
  assert(tx.some((s) => s.includes(PL['unitDesign.cat.shield'])) && tx.some((s) => s.includes(PL['unitDesign.cat.troop'])), 'F726a: etykiety tarcz i desantu w pickerze U');
  assert(!tx.some((s) => /(^|\s)(shield|troop)$/.test(s.trim())) && tx.some((s) => s.includes('🔰')) && tx.some((s) => s.includes('🪖')), 'F726b: bez surowego slotType, z ikonami');
  assert(tx.some((s) => s.includes(PL['unitDesign.cat.cargo'])), 'F726c (świadek): picker narysowany (inne kategorie obecne)');
});

console.log(`\nconsole_shipyard_b_smoke: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
