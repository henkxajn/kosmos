// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ UI U4-4: suwak zoomu na pasie dolnym obok 🔔 (UI_PLAN §4.5, decyzja (d)).
// Uruchom: node src/testing/smoke/zoom_slider_smoke.mjs
//
// Suwak ~100 px tuż na lewo od 🔔 (czip ⚔ na lewo od suwaka), tylko nad mapą. Skala logarytmiczna dystansu kamery od jej
// CELU (`_targetDist`), LEWO = DALEKO, zakres `_minDist` (podłoga jedzie z fokusem — `setMinDist`) – `maxDist` (450).
// Gałka co klatkę z `_targetDist` (kółko i auto-zoom fokusu ją przesuwają); zapis wyłącznie `setTargetDist` — cel kamery
// (`_goalTarget`) nietknięty. Przeciąganie przez `UIManager.handleMouseDown/Move/Up`; kółko nad suwakiem = kółko nad mapą
// (ten sam krok — `ThreeCameraController.wheelZoom`, wyjęty z nasłuchu kółka).
//
// PINY (SEDNO pada na drzewie sprzed U4-4; KONTROLA — zielona po obu stronach). Kamera = atrapa na PRAWDZIWYM
// prototypie `ThreeCameraController` (`setTargetDist`, `wheelZoom`, `maxDist` — wykonanie, nie kopia):
//   Z1 `ZoomSliderLogic` — tabela skali: lewo = daleko, log, klamry, odwracalność
//   Z2 suwak nad mapą: 100 px tuż na lewo od 🔔; pod overlayem i bez kamery — brak
//   Z3 gałka co klatkę z `_targetDist` (daleko — lewy koniec, blisko — prawy, środek skali — środek toru)
//   Z4 przeciąganie: wciśnięcie ustawia dystans z pozycji kursora, ruch (także poza torem — klamra), koniec
//   Z5 podłoga jedzie z fokusem (`_minDist` 0,05 przy statku)
//   Z6 kółko nad suwakiem = ten sam krok co nad mapą; poza suwakiem — nic
//   Z7 `wheelZoom` — tabela kroku (adaptacyjna czułość jak dawny nasłuch kółka), klamry; nasłuch kółka woła `wheelZoom`
//   Z8 czip ⚔ na lewo od suwaka, rząd doku kończy się przed nimi
//   Z9 suwak bez obrysów (pas bez ram — U0-1): Z9a liczby obrysów jak bez suwaka (KONTROLA), Z9b gałka z `fillRect`
//   Z10 podpowiedź suwaka (i18n PL + EN)
//   Z11 UIManager (pin źródłowy): kółko, wciśnięcie, ruch, puszczenie
//   Z12 cel kamery nietknięty przez suwak
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { BottomControlBar } from '../../ui/BottomControlBar.js';
import { ThreeCameraController } from '../../renderer/ThreeCameraController.js';
import { t, setLocale } from '../../i18n/i18n.js';

let ZS = null;
try { ZS = await import('../../ui/ZoomSliderLogic.js'); } catch { /* moduł powstaje w U4-4 — piny padną, nie przerwą */ }

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const body = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
const near = (a, b, e = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e * Math.max(1, Math.abs(b));

const W = 1280, H = 833;
const stripTop = H - 42 - 20;
const TS = { isPaused: true, multiplierIndex: 1, displayText: '03/06/48' };
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});

// Atrapa kamery na prawdziwym prototypie (metody i getter z `ThreeCameraController`).
const mkCam = (dist = 85, min = 0.3) => {
  const c = Object.create(ThreeCameraController.prototype);
  c._targetDist = dist; c._minDist = min; c._goalTarget = { x: 12, y: 0, z: -7 };
  return c;
};
let cam = mkCam();
K.threeRenderer = { get _cameraController() { return cam; } };

/** Atrapa ctx: rejestr wywołań z bieżącym `fillStyle`; 6 px na znak. */
const recCtx = () => {
  const calls = [];
  let fillStyle = '#000';
  return new Proxy({}, {
    get(o, k) {
      if (k === '_calls') return calls;
      if (k === 'fillStyle') return fillStyle;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (['fillRect', 'strokeRect', 'fillText', 'stroke'].includes(k)) return (...args) => { calls.push({ op: k, args, fillStyle }); };
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};
const ops = (ctx, op) => ctx._calls.filter((c) => c.op === op);
const knobX = (ctx) => { const k = ops(ctx, 'fillRect').find((c) => c.args[2] === 6 && c.args[3] === 12); return k ? k.args[0] + 3 : null; };
const drawMap = (bar, ctx = recCtx()) => { bar.draw(ctx, W, H, TS, { left: 150 }); return ctx; };

// ═══ Z1 ══════════════════════════════════════════════════════════════════════
header('Z1  ZoomSliderLogic — skala logarytmiczna, lewo = daleko');
{
  const d2p = ZS?.distToPos, p2d = ZS?.posToDist;
  ok(typeof d2p === 'function' && typeof p2d === 'function' && typeof ZS?.xToPos === 'function' && typeof ZS?.posToX === 'function',
    'Z1-0 moduł eksportuje `distToPos`, `posToDist`, `xToPos`, `posToX`');
  if (d2p && p2d) {
    ok(d2p(450, 0.3, 450) === 0 && d2p(0.3, 0.3, 450) === 1, 'Z1a SEDNO: lewy koniec = najdalej (450), prawy = najbliżej (podłoga 0,3)');
    const mid = Math.sqrt(0.3 * 450);
    ok(near(d2p(mid, 0.3, 450), 0.5) && near(p2d(0.5, 0.3, 450), mid), `Z1b SEDNO: skala logarytmiczna — środek toru = średnia geometryczna (${mid.toFixed(3)})`);
    ok(d2p(100, 0.3, 450) < d2p(10, 0.3, 450) && d2p(10, 0.3, 450) < d2p(1, 0.3, 450), 'Z1c większy dystans → bliżej lewego końca');
    ok(d2p(1000, 0.3, 450) === 0 && d2p(0.01, 0.3, 450) === 1 && p2d(-1, 0.3, 450) === 450 && near(p2d(2, 0.3, 450), 0.3),
      'Z1d klamry: dystans i pozycja poza zakresem');
    ok([0.3, 0.7, 5, 85, 449].every((d) => near(p2d(d2p(d, 0.3, 450), 0.3, 450), d, 1e-9)), 'Z1e odwracalność dystans → pozycja → dystans');
    ok(ZS.xToPos(90, 100, 80) === 0 && ZS.xToPos(200, 100, 80) === 1 && ZS.xToPos(140, 100, 80) === 0.5 && ZS.posToX(0.25, 100, 80) === 120,
      'Z1f piksel ↔ pozycja na torze (klamra)');
  }
}

// ═══ Z2–Z3 ═══════════════════════════════════════════════════════════════════
header('Z2–Z3  suwak na pasie — miejsce, gałka');
let bar = new BottomControlBar();
{
  cam = mkCam(85);
  drawMap(bar);
  const z = bar._zoomRect;
  ok(!!z && z.w === 100 && z.x + z.w === bar._bellRect.x - 6 && z.y === stripTop && z.h === 20,
    `Z2a SEDNO: nad mapą suwak 100 px tuż na lewo od 🔔 (x ${z?.x}…${z ? z.x + z.w : '—'}, 🔔 x ${bar._bellRect?.x})`);
  const ov = new BottomControlBar();
  ov.draw(recCtx(), W, H, TS);
  ok(ov._zoomRect == null && !!ov._bellRect, 'Z2b KONTROLA: pod overlayem (bez prostokąta pasa) — bez suwaka (sterowanie mapą chowa się jak outlinery)');
  const saved = cam; cam = null;
  const nc = new BottomControlBar(); drawMap(nc);
  ok(nc._zoomRect == null && !!nc._bgRect, 'Z2c KONTROLA: bez kontrolera kamery — bez suwaka, pas rysowany');
  cam = saved;
  const tr = bar._zoomTrack;
  cam._targetDist = 450; const kFar = knobX(drawMap(bar));
  cam._targetDist = 0.3; const kNear = knobX(drawMap(bar));
  cam._targetDist = Math.sqrt(0.3 * 450); const kMid = knobX(drawMap(bar));
  ok(!!tr && near(kFar, tr.x, 0.51) && near(kNear, tr.x + tr.w, 0.51) && near(kMid, tr.x + tr.w / 2, 0.51),
    `Z3 SEDNO: gałka co klatkę z \`_targetDist\` — daleko przy lewym końcu toru, blisko przy prawym, środek skali w środku (${kFar}, ${kMid}, ${kNear}; tor ${tr?.x}…${tr ? tr.x + tr.w : '—'})`);
}

// ═══ Z4–Z5 ═══════════════════════════════════════════════════════════════════
header('Z4–Z5  przeciąganie, podłoga z fokusem');
{
  cam = mkCam(85); bar = new BottomControlBar(); drawMap(bar);
  const tr = bar._zoomTrack, z = bar._zoomRect;
  const y = stripTop + 10;
  ok(bar.tryBeginZoomDrag?.(z ? z.x - 30 : 0, y) === false, 'Z4-0 wciśnięcie poza suwakiem — bez przeciągania (`false`)');
  const began = tr ? bar.tryBeginZoomDrag?.(tr.x, y) : false;
  ok(began === true && cam._targetDist === 450, `Z4a SEDNO: wciśnięcie na lewym końcu toru — dystans 450 od razu (${cam._targetDist})`);
  bar.handleZoomDrag?.(tr ? tr.x + tr.w : 0);
  ok(near(cam._targetDist, 0.3), `Z4b SEDNO: przeciągnięcie na prawy koniec — podłoga 0,3 (${cam._targetDist})`);
  bar.handleZoomDrag?.(tr ? tr.x + tr.w / 2 : 0);
  ok(near(cam._targetDist, Math.sqrt(0.3 * 450)), `Z4c SEDNO: środek toru — średnia geometryczna (${cam._targetDist})`);
  bar.handleZoomDrag?.(0);
  ok(cam._targetDist === 450 && bar.isDraggingZoom?.() === true, 'Z4d SEDNO: ruch daleko w lewo poza suwak — klamra 450, przeciąganie trwa');
  ok(bar.endZoomDrag?.() === true && bar.isDraggingZoom?.() === false && bar.handleZoomDrag?.(500) === false,
    'Z4e SEDNO: puszczenie po ruchu → true (UIManager pochłania klik), dalszy ruch — bez zmian');
  cam = mkCam(1, 0.05); drawMap(bar);
  const kVessel = knobX(drawMap(bar));
  cam = mkCam(1, 0.3); const kDefault = knobX(drawMap(bar));
  cam = mkCam(1, 0.05); drawMap(bar);
  bar.tryBeginZoomDrag?.(bar._zoomTrack ? bar._zoomTrack.x + bar._zoomTrack.w : 0, y); bar.endZoomDrag?.();
  ok(near(cam._targetDist, 0.05) && Number.isFinite(kVessel) && kVessel < kDefault,
    `Z5 SEDNO: podłoga jedzie z fokusem — przy statku (0,05) prawy koniec = 0,05, a ten sam dystans 1 stoi bliżej lewego końca (${kVessel} < ${kDefault})`);
}

// ═══ Z6–Z7 ═══════════════════════════════════════════════════════════════════
header('Z6–Z7  kółko nad suwakiem = kółko nad mapą');
{
  const wz = ThreeCameraController.prototype.wheelZoom;
  ok(typeof wz === 'function', 'Z7-0 `ThreeCameraController.wheelZoom` istnieje (krok kółka wyjęty z nasłuchu)');
  const step = (d, dy, min = 0.3) => { const c = mkCam(d, min); wz?.call(c, dy); return c._targetDist; };
  ok(near(step(0.1, 100, 0.05), 0.16) && near(step(0.3, 100), 0.42) && near(step(1, 100), 1.4) && near(step(3, 100), 4)
    && near(step(10, 100), 12) && near(step(100, 100), 105),
    'Z7a SEDNO: tabela kroku — 0,0006 / 0,0012 / 0,004 / 0,01 / 0,02 / 0,05 na jednostkę deltaY (jak dawny nasłuch)');
  ok(step(449, 100) === 450 && step(0.3, -1000) === 0.3, 'Z7b klamry kroku: sufit 450, podłoga `_minDist`');
  const cc = src('../../renderer/ThreeCameraController.js');
  ok(/this\.wheelZoom\(e\.deltaY\);/.test(cc) && (cc.match(/const zoomSpeed =/g) ?? []).length === 1,
    'Z7c nasłuch kółka nad mapą woła `wheelZoom(e.deltaY)` — tabela kroku w jednym miejscu');
  cam = mkCam(10); bar = new BottomControlBar(); drawMap(bar);
  const z = bar._zoomRect;
  const hit = z ? bar.handleZoomWheel?.(z.x + 50, z.y + 10, 100) : false;
  ok(hit === true && near(cam._targetDist, step(10, 100)), `Z6a SEDNO: kółko nad suwakiem — ten sam krok co nad mapą (${cam._targetDist})`);
  cam = mkCam(10);
  ok(bar.handleZoomWheel?.(z ? z.x - 40 : 0, stripTop + 10, 100) === false && cam._targetDist === 10, 'Z6b kółko poza suwakiem — `false`, bez zmiany dystansu');
}

// ═══ Z8–Z10 ══════════════════════════════════════════════════════════════════
header('Z8–Z10  czip ⚔, rząd doku, bez obrysów, podpowiedź');
{
  cam = mkCam(85);
  K.combatHud = { isMinimized: () => true, hasActiveEncounters: () => true };
  K.deepSpaceCombatSystem = { listActive: () => [{}] };
  bar = new BottomControlBar(); drawMap(bar);
  const z = bar._zoomRect, c = bar._chipRect, sp = bar.getDockSpan?.();
  ok(!!z && !!c && c.x + c.w === z.x - 4 && sp?.x1 === c.x - 4, `Z8a SEDNO: czip ⚔ na lewo od suwaka (${c?.x + c?.w} = ${z?.x} − 4), rząd doku przed czipem`);
  K.combatHud = null; delete K.deepSpaceCombatSystem;
  bar = new BottomControlBar(); const ctx = drawMap(bar);
  ok(!!bar._zoomRect && bar.getDockSpan?.()?.x1 === bar._zoomRect.x - 4, 'Z8b SEDNO: bez czipu — rząd doku kończy się przed suwakiem');
  ok(ops(ctx, 'stroke').length === 1 && ops(ctx, 'strokeRect').length === 5,
    `Z9a KONTROLA: pas nad mapą bez obrysów — jedyny stroke() to separator (${ops(ctx, 'stroke').length}), 5 obrysów prędkości (${ops(ctx, 'strokeRect').length})`);
  ok(knobX(ctx) != null, 'Z9b SEDNO: suwak z samych `fillRect` (gałka 6 × 12) — liczby obrysów jak bez suwaka');
  const zr = bar._zoomRect;
  if (zr) bar.handleMouseMove(zr.x + 20, zr.y + 10);
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    const tc = drawMap(bar);
    const hint = t('bottomBar.zoomHint');
    ok(hint !== 'bottomBar.zoomHint' && ops(tc, 'fillText').some((x) => x.args[0] === hint && x.args[2] < stripTop),
      `Z10 (${loc}) podpowiedź nad pasem po najechaniu: „${hint}”`);
  }
  setLocale('pl');
}

// ═══ Z11 ═════════════════════════════════════════════════════════════════════
header('Z11  UIManager — kółko, wciśnięcie, ruch, puszczenie (pin źródłowy)');
{
  const ui = src('../../scenes/UIManager.js');
  ok(/this\.handleWheel\(e\.clientX, e\.clientY, dy, e\.deltaY\);/.test(ui), 'Z11a nasłuch kółka przekazuje surowe `deltaY`');
  const hw = body(ui, '  handleWheel(rawX, rawY, deltaY, rawDeltaY = deltaY) {');
  const iZ = hw.indexOf('this._bottomControlBar?.handleZoomWheel?.(x, y, rawDeltaY)'), iLO = hw.indexOf('this._leftOutliner?.handleWheel?.(');
  ok(iZ > 0 && iLO > iZ && /!this\.overlayManager\.isAnyOpen\(\)/.test(hw.slice(0, iZ)),
    'Z11b `handleWheel`: kółko nad suwakiem (bez overlayu) — przed outlinerami, surowe `deltaY`');
  const md = body(ui, '  handleMouseDown(rawX, rawY, button = 0) {');
  ok(/if \(button === 0 && window\.KOSMOS\?\.civMode && this\._bottomControlBar\?\.tryBeginZoomDrag\?\.\(x, y\)\) return;/.test(md)
    && md.indexOf('tryBeginZoomDrag') > md.indexOf('overlayManager.handleMouseDown'),
    'Z11c `handleMouseDown`: wciśnięcie na suwaku zaczyna przeciąganie (po bramce overlayu)');
  const mm = body(ui, '  handleMouseMove(x, y) {');
  ok(/if \(this\._bottomControlBar\?\.handleZoomDrag\?\.\(x\)\) return;/.test(mm) && /this\._bottomControlBar\?\.endZoomDrag\?\.\(\);/.test(mm),
    'Z11d `handleMouseMove`: ruch w trakcie przeciągania pochłonięty; overlay w trakcie — koniec przeciągania');
  const mu = body(ui, '  handleMouseUp(rawX, rawY, button = 0) {');
  ok(/const draggedZ = this\._bottomControlBar\?\.endZoomDrag\?\.\(\);/.test(mu) && /if \(draggedS \|\| draggedB \|\| draggedZ\) this\._panelDragConsumedClick = true;/.test(mu),
    'Z11e `handleMouseUp`: koniec przeciągania; ruszony suwak pochłania nadchodzący klik');
}

// ═══ Z12 ═════════════════════════════════════════════════════════════════════
header('Z12  cel kamery nietknięty');
{
  cam = mkCam(85); bar = new BottomControlBar(); drawMap(bar);
  const before = JSON.stringify(cam._goalTarget);
  const tr = bar._zoomTrack;
  if (tr) { bar.tryBeginZoomDrag(tr.x + 10, stripTop + 10); bar.handleZoomDrag(tr.x + 50); bar.endZoomDrag(); }
  if (bar._zoomRect) bar.handleZoomWheel(bar._zoomRect.x + 40, stripTop + 10, -120);
  ok(!!tr && cam._targetDist !== 85 && JSON.stringify(cam._goalTarget) === before,
    `Z12 SEDNO: suwak i kółko nad nim zmieniają wyłącznie dystans (${cam._targetDist.toFixed(3)}), cel kamery bez zmian (${before})`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
