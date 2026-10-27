// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ UI U4-3: pas dolny na całą szerokość + chipy doku na pasie (UI_PLAN §4.5; decyzje 1, 2, (a), (b), (c)).
// Uruchom: node src/testing/smoke/bottom_strip_smoke.mjs
//
// Do U4-3 pas dolny (20 px nad paskiem nawigacji) miał tło tylko pod klastrem zegara (ostatni slot nawigacji), a belki
// zminimalizowanych paneli (156 × 24 px) stackowały się pionowo w lewym dolnym rogu mapy. Teraz nad mapą pas biegnie od
// prawej krawędzi lewego outlinera (`MapInsets.left`; 0 przy schowanym) do prawej krawędzi ekranu, a chipy doku (16 px,
// ikona + skrócona nazwa do 110 px, odstęp 4 px, „+N” z listą w podpowiedzi) stoją na nim od lewego końca. Pod overlayem
// pełnoekranowym — jak dotąd: sam klaster zegara nad ostatnim slotem i czip ⚔, bez chipów doku (decyzja (b)).
//
// PINY — prawdziwy `BottomControlBar.draw` / `PanelDock.draw` na atrapie ctx (SEDNO pada na drzewie sprzed U4-3;
// KONTROLA — zielona po obu stronach):
//   B1–B3 tło pasa: nad mapą od prawej krawędzi lewego outlinera do W; lewy schowany — od 0; pod overlayem — ostatni slot
//   B4    klaster zegara (🔔 ☰ ▶ prędkości) w tym samym miejscu w obu trybach
//   B5–B6 (T4) pin px: klaster zegara, suwak zoomu i czip ⚔ w tych samych px co przed usunięciem rzędu doku (liczby
//         zmierzone na drzewie `e873127` — sonda `strip_geom_T4.mjs`, teczka T4); rząd doku (`getDockSpan`) usunięty
//   B7    pas bez ramy także nad mapą (jedyny stroke() — separator przed datą)
//   B8–B9 `isOver` i klik w tło pasa nad mapą — pochłonięte (kamera i mapa nie dostają zdarzenia)
//   U1–U3 UIManager (pin źródłowy — moduł nie importuje się pod node): pas dostaje `MapInsets.left` tylko bez overlayu;
//         doku paneli brak (T4)
// ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): dok zminimalizowanych paneli (`PanelDock`)
//   usunięty razem z kartą ciała i panelem stacji — sekcja D (chipy doku) i piny rzędu doku (B5, B5b, B6, U2, U3) usunięte;
//   w ich miejscu pin px klastra zegara, suwaka i czipu ⚔ (B5, B6) i brak doku w `UIManager` (U2, U3).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { BottomControlBar } from '../../ui/BottomControlBar.js';
import { bottomNavBarRect, navSlotLayout } from '../../ui/BottomNavBarLogic.js';
import { NAV_GROUPS } from '../../ui/CivPanelDrawer.js';
import * as MI from '../../ui/MapInsets.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

const W = 1280, H = 833;                           // okno właściciela
const STRIP_H = MI.BOTTOM_STRIP_H;                 // 20
const stripTop = H - 42 - STRIP_H;                 // pas nad paskiem nawigacji + listwą dziennika (42)
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const TS = { isPaused: true, multiplierIndex: 1, displayText: '03/06/48' };
const near = (a, b) => Math.abs(a - b) < 1e-6;

/** Atrapa ctx: rejestr wywołań (fillRect / strokeRect / fillText / stroke) z bieżącym stylem; 6 px na znak. */
const recCtx = () => {
  const calls = [];
  let fillStyle = '#000';
  return new Proxy({}, {
    get(o, k) {
      if (k === '_calls') return calls;
      if (k === 'fillStyle') return fillStyle;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (['fillRect', 'strokeRect', 'fillText', 'stroke', 'moveTo', 'lineTo'].includes(k)) {
        return (...args) => { calls.push({ op: k, args, fillStyle }); };
      }
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};
const ops = (ctx, op) => ctx._calls.filter((c) => c.op === op);

const navRect = bottomNavBarRect(W, H);
const slots = navSlotLayout(navRect, NAV_GROUPS.length);
const last = slots[slots.length - 1];

// ═══ B ═══════════════════════════════════════════════════════════════════════
header('B  pas dolny — tło, klaster zegara, suwak, czip ⚔');
{
  K.combatHud = null;
  // Kamera (suwak zoomu rysuje się wyłącznie nad mapą z kontrolerem kamery — U4-4); jak w sondzie `strip_geom_T4.mjs`.
  K.threeRenderer = { _cameraController: { minDist: 0.3, maxDist: 450, _targetDist: 85, _dist: 85, setTargetDist() {}, wheelZoom() {} } };
  const mapBar = new BottomControlBar();
  const cMap = recCtx();
  mapBar.draw(cMap, W, H, TS, { left: 150 });
  const bg = mapBar._bgRect;
  ok(!!bg && bg.x === 150 && near(bg.x + bg.w, W) && bg.y === stripTop && bg.h === STRIP_H,
    `B1 SEDNO: nad mapą tło pasa od prawej krawędzi lewego outlinera (x 150) do prawej krawędzi ekranu (${W}) — jest x ${bg?.x}, w ${bg?.w}`);
  const hidBar = new BottomControlBar();
  hidBar.draw(recCtx(), W, H, TS, { left: 0 });
  ok(hidBar._bgRect?.x === 0 && near(hidBar._bgRect.w, W), `B2 SEDNO: lewy outliner schowany — pas od x 0 (jest x ${hidBar._bgRect?.x}, w ${hidBar._bgRect?.w})`);
  const ovBar = new BottomControlBar();
  const cOv = recCtx();
  ovBar.draw(cOv, W, H, TS);
  ok(near(ovBar._bgRect?.x, last.x) && near(ovBar._bgRect?.w, last.w),
    `B3 KONTROLA: pod overlayem (bez prostokąta pasa) — tło = ostatni slot nawigacji jak dotąd (x ${ovBar._bgRect?.x})`);
  const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  ok(same(mapBar._bellRect, ovBar._bellRect) && same(mapBar._menuRect, ovBar._menuRect) && same(mapBar._playRect, ovBar._playRect)
    && mapBar._speedRects.every((r, i) => same(r, ovBar._speedRects[i])),
    'B4 KONTROLA: klaster zegara (🔔 ☰ ▶ prędkości) w tym samym miejscu nad mapą i pod overlayem');
  // B5 — pin px (T4): liczby zmierzone na drzewie `e873127` (przed usunięciem rzędu doku), okno 1280×833, nad mapą (lewy 150).
  const at = (r, x, y, w, h) => !!r && r.x === x && r.y === y && r.w === w && r.h === h;
  ok(at(mapBar._bellRect, 1097, 775, 16, 12) && at(mapBar._menuRect, 1115, 775, 16, 12) && at(mapBar._playRect, 1133, 775, 13, 12)
    && at(mapBar._speedRects[0], 1149, 775, 13, 12) && at(mapBar._speedRects[4], 1205, 775, 13, 12) && at(mapBar._zoomRect, 991, 771, 100, 20),
    `B5 SEDNO (pin px): 🔔 x 1097, ☰ 1115, ▶ 1133, prędkości 1149–1205, suwak zoomu x 991 w 100 — jak przed T4 (jest 🔔 ${mapBar._bellRect?.x}, suwak ${mapBar._zoomRect?.x})`);
  ok(mapBar.getDockSpan === undefined && mapBar._dockSpan === undefined,
    'B5b SEDNO: rząd chipów doku usunięty (T4) — pas bez `getDockSpan`');
  // B6 — czip ⚔ (HUD walki zminimalizowany przy trwających starciach): na lewo od suwaka, px jak przed T4
  K.combatHud = { isMinimized: () => true, hasActiveEncounters: () => true };
  K.deepSpaceCombatSystem = { listActive: () => [{}] };
  const chipBar = new BottomControlBar();
  chipBar.draw(recCtx(), W, H, TS, { left: 150 });
  const ovChip = new BottomControlBar();
  ovChip.draw(recCtx(), W, H, TS);
  ok(at(chipBar._chipRect, 931, 771, 56, 20) && at(ovChip._chipRect, 1032, 771, 56, 20),
    `B6 SEDNO (pin px): czip ⚔ nad mapą x 931 (na lewo od suwaka), pod overlayem x 1032 (na lewo od zegara) — jak przed T4 (jest ${chipBar._chipRect?.x} / ${ovChip._chipRect?.x})`);
  K.combatHud = null; delete K.deepSpaceCombatSystem; delete K.threeRenderer;
  ok(ops(cMap, 'stroke').length === 1 && ops(cMap, 'strokeRect').length === 5,
    `B7 KONTROLA: pas bez ramy także nad mapą — jedyny stroke() to separator (${ops(cMap, 'stroke').length}), 5 obrysów prędkości (${ops(cMap, 'strokeRect').length})`);
  ok(ops(cMap, 'fillRect').some((c) => c.args[0] === 150 && c.args[1] === stripTop && near(c.args[0] + c.args[2], W) && c.args[3] === STRIP_H),
    'B7b SEDNO: tło pasa narysowane jednym prostokątem od x 150 do prawej krawędzi ekranu');
  ok(mapBar.isOver(300, stripTop + 10) && !mapBar.isOver(300, stripTop - 5),
    'B8 SEDNO: nad mapą `isOver` całego pasa (kamera nie dostaje zdarzenia); nad pasem — nie');
  ok(mapBar.handleClick(300, stripTop + 10) === true, 'B9 SEDNO: klik w puste tło pasa nad mapą pochłonięty (nie spada na mapę 3D)');
}

// ═══ U ═══════════════════════════════════════════════════════════════════════
header('U  UIManager — podłączenie pasa (pin źródłowy)');
{
  const ui = src('../../scenes/UIManager.js');
  ok(/this\._bottomControlBar\.draw\(ctx, W, H, this\._timeState,\s*this\.overlayManager\.isAnyOpen\(\) \? null : \{ left: getMapInsets\(window\.KOSMOS\)\.left \}\);/.test(ui),
    'U1 SEDNO: pas dostaje `MapInsets.left` tylko bez overlayu pełnoekranowego (pod overlayem — null, decyzja (b))');
  ok(!/\bpanelDock\b|\bPanelDock\b|\bgetDockSpan\b/.test(ui), 'U2 SEDNO: dok zminimalizowanych paneli usunięty z `UIManager` (T4)');
  const iBar = ui.indexOf('this._bottomControlBar.draw('), iBarClick = ui.indexOf('this._bottomControlBar?.handleClick?.(x, y)');
  ok(iBar > 0 && iBarClick > 0, 'U3 KONTROLA: pas rysowany i klikany (wywołania znalezione)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
