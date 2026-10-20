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
//   B5–B6 rząd chipów doku (`getDockSpan`): od lewego końca pasa do lewej krawędzi klastra (🔔) albo czipu ⚔; pod
//         overlayem — brak
//   B7    pas bez ramy także nad mapą (jedyny stroke() — separator przed datą)
//   B8–B9 `isOver` i klik w tło pasa nad mapą — pochłonięte (kamera i mapa nie dostają zdarzenia)
//   D1–D6 chipy doku: rząd od lewego końca pasa, szerokość ≤ 110 px z wielokropkiem, „+N” z listą niewidocznych
//         w podpowiedzi, klik przywraca panel („+N” — pierwszy niewidoczny), `isOver`; bez pasa (Generator) — rząd nad
//         dolną krawędzią obszaru mapy
//   U1–U3 UIManager (pin źródłowy — moduł nie importuje się pod node): pas dostaje `MapInsets.left` tylko bez overlayu,
//         dok — prostokąt rzędu z paska; kolejność rysowania i kliku
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { BottomControlBar } from '../../ui/BottomControlBar.js';
import { PanelDock } from '../../ui/PanelDock.js';
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
header('B  pas dolny — tło, klaster zegara, rząd doku');
{
  K.combatHud = null;
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
  const span = mapBar.getDockSpan?.();
  ok(!!span && span.x0 === 154 && span.x1 === mapBar._bellRect.x - 4 && span.y === stripTop + 2 && span.h === 16,
    `B5 SEDNO: rząd chipów doku — od lewego końca pasa (x 154) do 🔔 (x ${mapBar._bellRect?.x} − 4), 16 px na pasie (jest ${JSON.stringify(span)})`);
  ok((ovBar.getDockSpan?.() ?? null) === null && typeof ovBar.getDockSpan === 'function',
    'B5b SEDNO: pod overlayem brak rzędu doku (chipy chowają się jak outlinery — decyzja (b))');
  // B6 — czip ⚔ (HUD walki zminimalizowany przy trwających starciach): rząd kończy się przed nim
  K.combatHud = { isMinimized: () => true, hasActiveEncounters: () => true };
  K.deepSpaceCombatSystem = { listActive: () => [{}] };
  const chipBar = new BottomControlBar();
  chipBar.draw(recCtx(), W, H, TS, { left: 150 });
  const cs = chipBar.getDockSpan?.();
  ok(!!chipBar._chipRect && !!cs && cs.x1 === chipBar._chipRect.x - 4,
    `B6 SEDNO: z czipem ⚔ — rząd doku kończy się przed nim (x1 ${cs?.x1}, czip x ${chipBar._chipRect?.x})`);
  K.combatHud = null; delete K.deepSpaceCombatSystem;
  ok(ops(cMap, 'stroke').length === 1 && ops(cMap, 'strokeRect').length === 5,
    `B7 KONTROLA: pas bez ramy także nad mapą — jedyny stroke() to separator (${ops(cMap, 'stroke').length}), 5 obrysów prędkości (${ops(cMap, 'strokeRect').length})`);
  ok(ops(cMap, 'fillRect').some((c) => c.args[0] === 150 && c.args[1] === stripTop && near(c.args[0] + c.args[2], W) && c.args[3] === STRIP_H),
    'B7b SEDNO: tło pasa narysowane jednym prostokątem od x 150 do prawej krawędzi ekranu');
  ok(mapBar.isOver(300, stripTop + 10) && !mapBar.isOver(300, stripTop - 5),
    'B8 SEDNO: nad mapą `isOver` całego pasa (kamera nie dostaje zdarzenia); nad pasem — nie');
  ok(mapBar.handleClick(300, stripTop + 10) === true, 'B9 SEDNO: klik w puste tło pasa nad mapą pochłonięty (nie spada na mapę 3D)');
}

// ═══ D ═══════════════════════════════════════════════════════════════════════
header('D  chipy doku na pasie');
{
  const bar = new BottomControlBar();
  bar.draw(recCtx(), W, H, TS, { left: 150 });
  const span = bar.getDockSpan?.() ?? null;
  const restored = [];
  const mkDock = (n, long = false) => {
    const pd = new PanelDock();
    for (let i = 0; i < n; i++) {
      const label = long ? `Bardzo długa nazwa stacji orbitalnej numer ${i}` : `Ciało ${i}`;
      pd.register(`body:B${i}`, { icon: '🪐', label, onRestore: () => restored.push(`body:B${i}`) });
    }
    return pd;
  };
  const pd3 = mkDock(3);
  const c3 = recCtx();
  pd3.draw(c3, W, H, span);
  const z = pd3._hitZones;
  ok(z.length === 3 && z[0].x === 154 && z[1].x === z[0].x + z[0].w + 4 && z[2].x === z[1].x + z[1].w + 4
    && z.every((q) => q.y === stripTop + 2 && q.h === 16),
    `D1 SEDNO: trzy chipy w rzędzie na pasie — od x 154, odstęp 4 px, 16 px (jest ${JSON.stringify(z.map((q) => [q.x, q.y, q.w, q.h]))})`);
  const pdL = mkDock(1, true);
  const cL = recCtx();
  pdL.draw(cL, W, H, span);
  const txtL = ops(cL, 'fillText').map((c) => String(c.args[0]));
  ok(pdL._hitZones[0]?.w <= 110 && txtL.some((s) => s.endsWith('…')),
    `D2 SEDNO: chip najwyżej 110 px, długa nazwa skrócona wielokropkiem (w ${pdL._hitZones[0]?.w}; ${JSON.stringify(txtL)})`);
  const pdM = mkDock(12, true);   // 12 × 110 px nie mieści się w rzędzie → „+N”
  const cM = recCtx();
  pdM.draw(cM, W, H, span);
  const more = pdM._hitZones.find((q) => q.key === '__more__');
  const shown = pdM._hitZones.filter((q) => q.key !== '__more__').length;
  const txtM = ops(cM, 'fillText').map((c) => String(c.args[0]));
  ok(!!more && more.first === shown && txtM.includes(`+${12 - shown}`) && more.x + more.w <= span.x1,
    `D3 SEDNO: brak miejsca — ostatni chip „+${12 - shown}” (pierwszy niewidoczny ${more?.first}), w granicy rzędu`);
  if (more) pdM.handleMouseMove(more.x + 2, more.y + 4);   // pin degraduje, nie przerywa (fail-first)
  const cTip = recCtx();
  pdM.draw(cTip, W, H, span);
  const tipTexts = ops(cTip, 'fillText').filter((c) => c.args[2] < stripTop).map((c) => String(c.args[0]));
  ok(!!more && tipTexts.length === 12 - shown && !!tipTexts[0]?.includes(`numer ${shown}`),
    `D3b SEDNO: podpowiedź „+N” nad pasem — lista niewidocznych (${tipTexts.length})`);
  restored.length = 0;
  if (z[1]) pd3.handleClick(z[1].x + 3, z[1].y + 3);
  if (more) pdM.handleClick(more.x + 2, more.y + 4);
  ok(restored[0] === 'body:B1' && restored[1] === `body:B${shown}`,
    `D4 SEDNO: klik chipa przywraca jego panel, klik „+N” — pierwszy niewidoczny (${JSON.stringify(restored)})`);
  ok(!!z[2] && pd3.isOver(z[0].x + 2, z[0].y + 2) && !pd3.isOver(z[2].x + z[2].w + 30, z[2].y + 2),
    'D5 KONTROLA: `isOver` chipa — tak; pas poza chipami — nie (ten obszar blokuje `BottomControlBar.isOver`)');
  // D6 — bez pasa (Generator): rząd nad dolną krawędzią obszaru mapy
  K.civMode = false;
  K.leftOutliner = { getReservedWidth: () => 0 }; K.rightOutliner = { getReservedWidth: () => 0 };
  K.tacticalDock = { getReservedHeight: () => 0, isExpanded: () => false };
  const pdG = mkDock(2);
  pdG.draw(recCtx(), W, H);
  const g = pdG._hitZones;
  const genBottom = MI.computeMapInsets({ civMode: false }).bottom;
  ok(g.length === 2 && g[0].x === 8 && g[0].y === H - genBottom - 16 - 6 && g[1].x > g[0].x && g[1].y === g[0].y,
    `D6 SEDNO: bez pasa (Generator) — chipy w rzędzie nad dolną krawędzią obszaru mapy (jest ${JSON.stringify(g.map((q) => [q.x, q.y]))})`);
  K.civMode = true;
}

// ═══ U ═══════════════════════════════════════════════════════════════════════
header('U  UIManager — podłączenie pasa i doku (pin źródłowy)');
{
  const ui = src('../../scenes/UIManager.js');
  ok(/this\._bottomControlBar\.draw\(ctx, W, H, this\._timeState,\s*this\.overlayManager\.isAnyOpen\(\) \? null : \{ left: getMapInsets\(window\.KOSMOS\)\.left \}\);/.test(ui),
    'U1 SEDNO: pas dostaje `MapInsets.left` tylko bez overlayu pełnoekranowego (pod overlayem — null, decyzja (b))');
  ok(/this\.panelDock\.draw\(ctx, W, H, civMode \? this\._bottomControlBar\.getDockSpan\(\) : null\);/.test(ui),
    'U2 SEDNO: dok rysuje chipy w rzędzie z paska (`getDockSpan`), poza trybem cywilizacji — bez pasa');
  const iBar = ui.indexOf('this._bottomControlBar.draw('), iDock = ui.indexOf('this.panelDock.draw(');
  const iDockClick = ui.indexOf('this.panelDock?.handleClick?.(x, y)'), iBarClick = ui.indexOf('this._bottomControlBar?.handleClick?.(x, y)');
  ok(iBar > 0 && iDock > iBar && iDockClick > 0 && iBarClick > iDockClick,
    'U3 KONTROLA: pas rysowany PRZED dokiem (rząd z tej samej klatki), klik doku PRZED klikiem pasa (chip wygrywa z tłem)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
