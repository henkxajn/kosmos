// Keeper ARKUSZ UI, U0-1 (D-UI-13, UI_PLAN §7.15): dolny pasek nawigacji i pasek zegara BEZ RAM.
//
// Wykonaniowo: prawdziwe `BottomNavBar.draw` i `BottomControlBar.draw` na atrapie ctx z rejestracją KAŻDEGO wywołania
// (W = 1280, H = 720 — szerokość logiczna każdego ekranu do 16:9).
//   PINY (padają na kodzie sprzed U0-1):
//     N1  pasek nawigacji nie wywołuje stroke() — zero separatorów i boków,
//     N2  zero odcinków na granicach slotów (dawne separatory 1 px),
//     N3  zero pełnoszerokościowej górnej listwy (fillRect h ≤ 3 px szerszy niż slot),
//     N4  przy wysuniętej karcie peek też zero listwy (dawna logika szwu: dwa odcinki wokół gniazda),
//     C1  pasek zegara bez ramy (zero odcinków na krawędziach tła),
//     C2  pasek zegara: jedyny stroke() to separator przed datą.
//   KONTROLE (zielone po obu stronach — dowód, że atrapa naprawdę rysuje pasek):
//     K1  tło paska nawigacji, K2 wskaźnik 2 px aktywnego slotu, K3 wskaźnik 2 px hover,
//     K4  tło paska zegara = ostatni slot (jak `fleet_clock_band` T4), K5 obrysy 5 przycisków prędkości zostają.
// Uruchom: node src/testing/smoke/ui_bar_frames_smoke.mjs
import '../headless/env.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };

const { BottomNavBar } = await import('../../ui/BottomNavBar.js');
const { BottomControlBar } = await import('../../ui/BottomControlBar.js');
const { bottomNavBarRect, navSlotLayout } = await import('../../ui/BottomNavBarLogic.js');
const { NAV_GROUPS } = await import('../../ui/CivPanelDrawer.js');
const { THEME, hexToRgb } = await import('../../config/ThemeConfig.js');

const W = 1280, H = 720;
const STRIP_H = 20;   // BottomControlBar.STRIP_H (stała modułu — replika do asercji)

/** Atrapa ctx: stan + rejestr wywołań (op, args, kolory/font/alpha w chwili wywołania). */
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
      return (...args) => { calls.push({ op: p, args, fill: t.fillStyle, stroke: t.strokeStyle, alpha: t.globalAlpha }); };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const ops = (ctx, op) => ctx.calls.filter(c => c.op === op);
const near = (a, b) => Math.abs(a - b) < 1e-6;

window.KOSMOS = {
  civMode: true,
  overlayManager: { active: null },
  uiManager: { _timeState: { isPaused: true, multiplierIndex: 1, displayText: '03/06/60' } },
  notificationCenter: { getActiveCount: () => 0 },
};

const rect = bottomNavBarRect(W, H);
const slots = navSlotLayout(rect, NAV_GROUPS.length);
const acc = hexToRgb(THEME.accent);
const accFull = `rgba(${acc.r},${acc.g},${acc.b},1)`;

// ── Pasek nawigacji: aktywny slot 2, kursor nad slotem 4 (hover w pełni rozwinięty) ──────────────
console.log('\n── BottomNavBar.draw (aktywny slot 2, hover slot 4) ──');
const ACTIVE = 2, HOVER = 4;
window.KOSMOS.overlayManager.active = NAV_GROUPS[ACTIVE].primary;
const nav = new BottomNavBar();
nav._hoverSlot = HOVER; nav._hoverP[HOVER] = 1; nav._lastMs = Date.now();
const c1 = recCtx();
nav.draw(c1, W, H);
ok(ops(c1, 'stroke').length === 0, `N1 pasek nawigacji bez stroke() — wywołań: ${ops(c1, 'stroke').length} (oczekiwane 0)`);
const inner = slots.slice(1).map(s => Math.round(s.x) + 0.5);
const sepMoves = ops(c1, 'moveTo').filter(c => inner.some(x => near(c.args[0], x)));
ok(sepMoves.length === 0, `N2 zero odcinków na granicach slotów — znaleziono ${sepMoves.length}`);
const listwa = ops(c1, 'fillRect').filter(c => near(c.args[1], rect.y) && c.args[3] > 0 && c.args[3] <= 3 && c.args[2] > slots[0].w + 1);
ok(listwa.length === 0, `N3 zero górnej listwy szerszej niż slot — znaleziono ${listwa.length}${listwa.length ? ` (w=${listwa[0].args[2].toFixed(1)}, h=${listwa[0].args[3]})` : ''}`);
ok(ops(c1, 'fillRect').some(c => near(c.args[0], rect.x) && near(c.args[1], rect.y) && near(c.args[2], rect.w) && near(c.args[3], rect.h)),
  'K1 [kontrola] tło paska nawigacji narysowane');
const ind = (i) => ops(c1, 'fillRect').some(c => near(c.args[0], slots[i].x) && near(c.args[1], rect.y)
  && near(c.args[2], slots[i].w) && c.args[3] === 2 && c.fill === accFull);
ok(ind(ACTIVE), 'K2 [kontrola] wskaźnik 2 px aktywnego slotu (akcent, krycie 1)');
ok(ind(HOVER), 'K3 [kontrola] wskaźnik 2 px slotu pod kursorem');

// ── Wysunięta karta peek nad slotem 5: dawniej listwa dzielona na dwa odcinki wokół gniazda ───────
console.log('\n── BottomNavBar.draw z wysuniętą kartą peek nad slotem 5 ──');
const PEEK = 5;
const nav2 = new BottomNavBar();
nav2._peek = { activeGroup: () => NAV_GROUPS[PEEK].primary, isActive: () => true, update() {}, draw() {},
  covers: () => false, isOver: () => false, peekTopY: () => null, handleClick: () => false };
const c2 = recCtx();
nav2.draw(c2, W, H);
const listwa2 = ops(c2, 'fillRect').filter(c => near(c.args[1], rect.y) && c.args[3] > 0 && c.args[3] <= 3 && c.args[3] !== 2);
ok(listwa2.length === 0, `N4 z kartą peek zero odcinków listwy — znaleziono ${listwa2.length}`);
ok(ops(c2, 'fillRect').some(c => near(c.args[0], slots[PEEK].x) && near(c.args[2], slots[PEEK].w) && near(c.args[3], rect.h)),
  'K1b [kontrola] gniazdo pod kartą peek (tło slotu 5) narysowane');

// ── Pasek zegara: bez ramy, obrysy prędkości zostają ─────────────────────────────────────────────
console.log('\n── BottomControlBar.draw (pauza: 5 obrysów prędkości) ──');
const bar = new BottomControlBar();
const c3 = recCtx();
bar.draw(c3, W, H, window.KOSMOS.uiManager._timeState);
const bg = bar._bgRect;
const last = slots[slots.length - 1];
ok(bg && near(bg.x, last.x) && near(bg.w, last.w) && bg.h === STRIP_H, `K4 [kontrola] tło paska zegara = ostatni slot (x ${bg?.x}, w ${bg?.w})`);
const frameXs = bg ? [bg.x + 0.5, bg.x + bg.w - 0.5] : [];
const frameSeg = [...ops(c3, 'moveTo'), ...ops(c3, 'lineTo')].filter(c => frameXs.some(x => near(c.args[0], x)));
ok(frameSeg.length === 0, `C1 pasek zegara bez ramy — odcinków na krawędziach tła: ${frameSeg.length} (oczekiwane 0)`);
ok(ops(c3, 'stroke').length === 1, `C2 jedyny stroke() paska zegara to separator przed datą — wywołań: ${ops(c3, 'stroke').length} (oczekiwane 1)`);
ok(ops(c3, 'fillRect').some(c => bg && near(c.args[0], bg.x) && near(c.args[1], bg.y) && near(c.args[2], bg.w) && c.args[3] === STRIP_H),
  'K5 [kontrola] tło paska zegara narysowane');
ok(ops(c3, 'strokeRect').length === 5, `K6 [kontrola] obrysy 5 przycisków prędkości zostają — strokeRect: ${ops(c3, 'strokeRect').length}`);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
