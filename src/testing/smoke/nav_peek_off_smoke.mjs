// ═══════════════════════════════════════════════════════════════════════════════
// nav_peek_off_smoke — KEEPER ARKUSZA UI, U3-0b (decyzja właściciela 2026-10-19): karty peek dolnego paska WYŁĄCZONE
// bez zamiennika. Rejestr: `docs/design/UI_PLAN.md` §4.4.
// ─────────────────────────────────────────────────────────────────────────────
// WYKONANIE prawdziwego `BottomNavBar` (najechanie `handleMouseMove`, czas rzeczywisty dłuższy niż dawna zwłoka karty
// `PEEK_HOVER_DELAY` = 500 ms, potem klatki `draw`) i `BottomControlBar` (rząd paska zegara i czipu walk) na atrapie
// ctx z rejestrem wywołań. W = 1280, H = 720.
//
// PINY (padają na kodzie sprzed U3-0b):
//   P1  kursor dłużej niż 500 ms nad kafelkiem → ŻADNEJ karty: zero rysowania nad paskiem nawigacji, punkt 8 px nad
//       kafelkiem (dawniej wnętrze karty) nie blokuje kamery (`isOver`), klik tam nie jest pochłaniany przez kartę
//   P6  kafelek pod kursorem podświetlony — 2 px wskaźnik akcentu (dawniej pod wysuniętą kartą zostawało puste
//       „gniazdo” bez wskaźnika)
//   P2  po najechaniu pasek nie wymusza ciągłego przerysowywania (`isAnimating` gaśnie po animacji podświetlenia —
//       dawniej zwłoka karty trzymała ją włączoną przez cały czas najechania)
//   P3  pasek zegara nieruchomy przy najechaniu na OSTATNI kafelek (dawniej jechał w górę z kartą)
//   P4  czip walk nieruchomy przy najechaniu na PRZEDOSTATNI kafelek (dawniej jechał w górę z kartą)
//   P5  źródło: `BottomNavBar` nie importuje `NavPeekCard` ani zwłoki karty; `BottomControlBar` nie czyta karty
// KONTROLE (zielone po obu stronach):
//   K2  klik w kafelek nadal otwiera jego grupę
// PRZECELOWANE W U4-1 (UI_PLAN §4.5, decyzja 4 — sprzątanie kart peek; padają na drzewie sprzed U4-1, więc nie są już
// kontrolami):
//   K3  badge alertów nadal liczone — z predykatu `hasSlotAlert` (dawniej `getPeekAlert`), bez flagi `navPeekCards`
//   K4  pliki kart usunięte (`NavPeekCard.js`, `NavPeekCardLogic.js`; dawniej „zostają na dysku do U4”), formatery liczb
//       w `NumberFormatLogic.js`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s} ──`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const srcOf = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const { BottomNavBar } = await import('../../ui/BottomNavBar.js');
const { BottomControlBar } = await import('../../ui/BottomControlBar.js');
const { bottomNavBarRect, navSlotLayout } = await import('../../ui/BottomNavBarLogic.js');
const { NAV_GROUPS } = await import('../../ui/CivPanelDrawer.js');
const { THEME, hexToRgb } = await import('../../config/ThemeConfig.js');

const W = 1280, H = 720;
const ROW_Y = H - 6 - 36 - 20;   // rząd paska zegara i czipu — tuż nad paskiem nawigacji (listwa 6 + pasek 36 + rząd 20)

/** Atrapa ctx: stan + rejestr wywołań (op, args, kolor w chwili wywołania). */
function recCtx() {
  const st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', textAlign: 'left',
    textBaseline: 'alphabetic', globalAlpha: 1, filter: 'none', globalCompositeOperation: 'source-over',
    shadowColor: 'transparent', shadowBlur: 0, shadowOffsetY: 0 };
  const calls = [];
  return new Proxy(st, {
    get(t, p) {
      if (p === 'calls') return calls;
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: String(s).length * (parseFloat(t.font) || 10) * 0.54 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return (...args) => { calls.push({ op: p, args, fill: t.fillStyle }); };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const ops = (ctx, op) => ctx.calls.filter((c) => c.op === op);

const opened = [];
window.KOSMOS = {
  civMode: true,
  overlayManager: { active: null, openPanel: (id) => opened.push(id), closeActive() {} },
  uiManager: { _timeState: { isPaused: true, multiplierIndex: 1, displayText: '03/06/60' } },
  notificationCenter: { getActiveCount: () => 0 },
  combatHud: { isMinimized: () => true, hasActiveEncounters: () => true, toggleMinimize() {} },
  deepSpaceCombatSystem: { listActive: () => [{}] },
};
const rect = bottomNavBarRect(W, H);
const slots = navSlotLayout(rect, NAV_GROUPS.length);
const LAST = NAV_GROUPS.length - 1, PREV = NAV_GROUPS.length - 2;
const center = (i) => ({ x: slots[i].x + slots[i].w / 2, y: rect.y + rect.h / 2 });

/** Najechanie na kafelek `i`, czekanie `ms` (dłużej niż dawna zwłoka karty), potem `n` klatek z odstępem 40 ms. */
async function hoverAndDraw(nav, i, ms = 650, n = 12) {
  const c = center(i);
  nav.draw(recCtx(), W, H);
  nav.handleMouseMove(c.x, c.y);
  nav.draw(recCtx(), W, H);
  await sleep(ms);
  let last = null;
  const all = [];
  for (let k = 0; k < n; k++) { nav.handleMouseMove(c.x, c.y); last = recCtx(); nav.draw(last, W, H); all.push(last); await sleep(40); }
  return { last, all };
}

// ═══ P1 / P2 / K1 ══════════════════════════════════════════════════════════════
header('P1 · P2 · P6 — kursor nad kafelkiem dłużej niż dawna zwłoka karty (500 ms)');
{
  const nav = new BottomNavBar();
  window.KOSMOS.bottomNavBar = nav;
  const { last, all } = await hoverAndDraw(nav, 3);
  const above = all.flatMap((c) => ops(c, 'fillRect').filter((r) => r.args[1] < rect.y - 0.5));
  const aboveImg = all.flatMap((c) => ops(c, 'drawImage').filter((r) => (r.args[6] ?? r.args[2] ?? rect.y) < rect.y - 0.5));
  ok(above.length === 0 && aboveImg.length === 0,
    `P1 SEDNO: zero rysowania NAD paskiem nawigacji w 12 klatkach po 650 ms najechania (prostokąty: ${above.length}, obrazy: ${aboveImg.length}) — karta peek się nie wysuwa`);
  const c3 = center(3);
  ok(nav.isOver(c3.x, rect.y - 8) === false && nav.isOver(c3.x, c3.y) === true,
    'P1b punkt 8 px nad kafelkiem nie blokuje kamery (dawniej wnętrze wysuniętej karty); punkt na kafelku — blokuje');
  opened.length = 0;
  ok(nav.handleClick(c3.x, rect.y - 8) === false && opened.length === 0, 'P1c klik 8 px nad kafelkiem nie jest pochłaniany i niczego nie otwiera (dawniej klik w kartę = otwarcie grupy)');
  const acc = hexToRgb(THEME.accent);
  const ind = ops(last, 'fillRect').some((r) => Math.abs(r.args[0] - slots[3].x) < 1e-6 && Math.abs(r.args[1] - rect.y) < 1e-6
    && Math.abs(r.args[2] - slots[3].w) < 1e-6 && r.args[3] === 2 && r.fill === `rgba(${acc.r},${acc.g},${acc.b},1)`);
  ok(ind, 'P6 podświetlenie kafelka zostaje — 2 px wskaźnik akcentu nad kafelkiem pod kursorem (dawniej puste gniazdo pod kartą)');
  ok(nav.isAnimating() === false, `P2 po zakończeniu animacji podświetlenia pasek nie wymusza przerysowywania (isAnimating: ${nav.isAnimating()})`);
}

// ═══ P3 / P4 ═══════════════════════════════════════════════════════════════════
header('P3 · P4 — pasek zegara i czip walk nieruchome przy najechaniu na swój kafelek');
{
  const nav = new BottomNavBar();
  window.KOSMOS.bottomNavBar = nav;
  const bar = new BottomControlBar();
  bar.draw(recCtx(), W, H, window.KOSMOS.uiManager._timeState);
  ok(bar._bgRect?.y === ROW_Y && bar._chipRect?.y === ROW_Y, `KONTROLA: rząd przed najechaniem y ${bar._bgRect?.y} (czip ${bar._chipRect?.y}) = ${ROW_Y}`);
  const ys = [];
  const c = center(LAST);
  nav.draw(recCtx(), W, H); nav.handleMouseMove(c.x, c.y);
  await sleep(650);
  for (let k = 0; k < 12; k++) { nav.handleMouseMove(c.x, c.y); nav.draw(recCtx(), W, H); bar.draw(recCtx(), W, H, window.KOSMOS.uiManager._timeState); ys.push(bar._bgRect.y); await sleep(40); }
  ok(ys.length === 12 && ys.every((y) => y === ROW_Y), `P3 SEDNO: najechanie na OSTATNI kafelek — pasek zegara stoi (y w 12 klatkach: ${[...new Set(ys)].join(', ')})`);
  const ysChip = [];
  const cp = center(PREV);
  nav.handleMouseMove(cp.x, cp.y);
  await sleep(650);
  for (let k = 0; k < 12; k++) { nav.handleMouseMove(cp.x, cp.y); nav.draw(recCtx(), W, H); bar.draw(recCtx(), W, H, window.KOSMOS.uiManager._timeState); ysChip.push(bar._chipRect?.y); await sleep(40); }
  ok(ysChip.length === 12 && ysChip.every((y) => y === ROW_Y), `P4 SEDNO: najechanie na PRZEDOSTATNI kafelek — czip walk stoi (y w 12 klatkach: ${[...new Set(ysChip)].join(', ')})`);
}

// ═══ K2 ════════════════════════════════════════════════════════════════════════
header('K2 — klik w kafelek dalej otwiera grupę');
{
  const nav = new BottomNavBar();
  nav.draw(recCtx(), W, H);
  opened.length = 0;
  const c = center(2);
  ok(nav.handleClick(c.x, c.y) === true && opened.length === 1 && opened[0] === NAV_GROUPS[2].primary,
    `K2 KONTROLA: klik w kafelek „${NAV_GROUPS[2].primary}” → openPanel (${JSON.stringify(opened)})`);
}

// ═══ P5 / K3 / K4 ══════════════════════════════════════════════════════════════
header('P5 · K3 · K4 — źródło');
{
  const nav = strip(srcOf('../../ui/BottomNavBar.js'));
  const bcb = strip(srcOf('../../ui/BottomControlBar.js'));
  ok(!/NavPeekCard|PEEK_HOVER_DELAY|_dwell|_peekSlot/.test(nav), 'P5a `BottomNavBar` bez karty peek: zero `NavPeekCard`, zwłoki karty i stanu najechania karty');
  ok(!/peekTopY|_peek\b/.test(bcb), 'P5b `BottomControlBar` nie czyta karty peek (rząd stały)');
  ok(/hasSlotAlert\(/.test(nav) && /hasAlert/.test(nav) && !/getPeekAlert|navPeekCards|_alertBadges/.test(nav),
    'K3 (U4-1): pasywne badge alertów dalej liczone — predykat `hasSlotAlert` → `hasAlert` slotu, bez flagi `navPeekCards`');
  const there = (f) => existsSync(fileURLToPath(new URL(`../../ui/${f}`, import.meta.url)));
  ok(!there('NavPeekCard.js') && !there('NavPeekCardLogic.js') && there('NumberFormatLogic.js'),
    'K4 (U4-1): pliki kart usunięte (`NavPeekCard.js`, `NavPeekCardLogic.js`), formatery liczb w `NumberFormatLogic.js`');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
