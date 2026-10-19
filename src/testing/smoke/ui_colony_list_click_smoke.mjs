// Keeper ARKUSZ UI, U0-2 (D-UI-11, UI_PLAN §7.13): lista kolonii w górnej belce rozwija się KLIKNIĘCIEM, nie hoverem.
//
// Wykonaniowo: prawdziwy `TopResourceDrawer` (draw / handleMouseMove / handleClick) na atrapie ctx, trzy kolonie gracza,
// W = 1280, H = 720; `window.addEventListener` przechwycony, żeby wykonać nasłuch „klik poza listą".
//   PINY (padają na kodzie sprzed U0-2):
//     L1  najechanie na pasmo NIE rozwija listy (kilka klatek rysowania po hoverze),
//     L2  drugi klik w pasmo poza nazwą ZWIJA listę (pierwszy rozwija — L2a, kontrola),
//     L4  klik w nazwę kolonii w rozwiniętej liście otwiera kolonię i ZWIJA listę,
//     L5  klik poza listą (mapa) zwija listę i NIE jest pochłaniany (handleClick → false),
//     L6  otwarta lista ma nasłuch `click` (capture) na window; klik poza nim zwija listę, klik w pasmo — nie;
//         po zwinięciu nasłuch zdjęty,
//     L7  przy jednej kolonii klik w pasmo nie zostawia stanu „otwarte" ani nasłuchu.
//   KONTROLE (zielone po obu stronach):
//     K1  tooltip tokenu na hover działa, K2 pierwszy klik w pasmo rozwija listę i jest pochłaniany,
//     K3  klik w nazwę aktywnej kolonii w paśmie → przełączenie + panel kolonii.
// Uruchom: node src/testing/smoke/ui_colony_list_click_smoke.mjs
import '../headless/env.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };

// ── Przechwycenie nasłuchów window (zanim drawer cokolwiek podepnie) ─────────────────────────────
const listeners = [];
globalThis.addEventListener = (type, fn, opt) => { listeners.push({ type, fn, capture: opt === true || !!opt?.capture }); };
globalThis.removeEventListener = (type, fn) => { const i = listeners.findIndex(l => l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); };
const clickListeners = () => listeners.filter(l => l.type === 'click' && l.capture);

const { TopResourceDrawer } = await import('../../ui/TopResourceDrawer.js');

const W = 1280, H = 720;
function recCtx() {
  const st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', textAlign: 'left',
    textBaseline: 'alphabetic', globalAlpha: 1 };
  return new Proxy(st, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: String(s).length * (parseFloat(t.font) || 10) * 0.54 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function colony(planetId, name, k) {
  const snap = { C: 100 * k, Fe: 200 * k, Si: 50 * k, Cu: 10 * k, Ti: 5 * k, Li: 3 * k, Hv: 1, Xe: 1, Nt: 0, H: 7, food: 400 * k,
    water: 300 * k, fuel: 20 * k, _perYear: { C: 1.5, Fe: -2 }, _energy: { production: 50, consumption: 30, balance: 20 } };
  return { planetId, name, systemId: 'sys_home', credits: 1234 * k,
    resourceSystem: { inventorySnapshot: () => snap, research: { amount: 10, perYear: 1 } },
    civSystem: { population: 20, freePops: 2, employed: 18, _lockedPops: 0 },
    prosperitySystem: { prosperity: 55, targetProsperity: 60 } };
}
const COLS = [colony('p1', 'Alfa', 1), colony('p2', 'Beta', 2), colony('p3', 'Gamma', 3)];
const rec = { switched: [], panels: [], systems: [] };
window.KOSMOS = {
  civMode: true, uiScale: 1,
  uiManager: { _dirty: false },
  colonyManager: {
    activePlanetId: 'p1',
    getAllColonies: () => COLS,
    getColony: (id) => COLS.find(c => c.planetId === id) ?? null,
    switchActiveColony: (id) => { rec.switched.push(id); },
  },
  starSystemManager: { activeSystemId: 'sys_home', switchActiveSystem: (id) => rec.systems.push(id) },
  overlayManager: { openPanel: (id) => rec.panels.push(id) },
};

const d = new TopResourceDrawer();
const frames = (n = 40) => { for (let i = 0; i < n; i++) d.draw(recCtx(), W, H); };
const isOpenNow = () => d.isOpen() && !!d._panelRect;
const BAND_Y = 14, NAME_X = 20, BAND_X = 700, MAP = [640, 400];

frames(2);
console.log('\n── Hover nad pasmem ──');
d.handleMouseMove(BAND_X, BAND_Y); frames(); d.handleMouseMove(BAND_X + 50, BAND_Y + 4); frames();
ok(!isOpenNow(), `L1 hover nad pasmem nie rozwija listy (slide ${d._slideProgress.toFixed(2)}, panel ${d._panelRect ? 'jest' : 'brak'})`);
const tokenHit = d._hitItems.find(h => h.tip?.kind === 'resource');
if (tokenHit) d.handleMouseMove(tokenHit.x + 2, tokenHit.y + 2);
ok(!!d._hoverTip?.lines?.length, 'K1 [kontrola] tooltip tokenu na hover działa');
d.handleMouseMove(MAP[0], MAP[1]); frames();

console.log('\n── Klik w pasmo poza nazwą: rozwiń / zwiń ──');
const r1 = d.handleClick(BAND_X, BAND_Y); frames();
ok(r1 === true && isOpenNow(), `K2 [kontrola] pierwszy klik rozwija listę i jest pochłaniany (wynik ${r1}, otwarta ${isOpenNow()})`);
const r2 = d.handleClick(BAND_X, BAND_Y); frames();
ok(r2 === true && !isOpenNow(), `L2 drugi klik w pasmo zwija listę (wynik ${r2}, otwarta ${isOpenNow()})`);

console.log('\n── Klik w nazwę ──');
rec.switched.length = 0; rec.panels.length = 0;
const r3 = d.handleClick(NAME_X, BAND_Y);
ok(r3 === true && rec.switched[0] === 'p1' && rec.panels[0] === 'colony', `K3 [kontrola] nazwa aktywnej kolonii → przełączenie ${rec.switched[0]} + panel ${rec.panels[0]}`);
d.handleClick(BAND_X, BAND_Y); frames();
const row3 = d._colonyRects.find(c => c.planetId === 'p3');
rec.switched.length = 0; rec.panels.length = 0;
const r4 = row3 ? d.handleClick(row3.x + 10, row3.y + row3.h / 2) : null; frames();
ok(r4 === true && rec.switched[0] === 'p3' && rec.panels[0] === 'colony' && !isOpenNow(),
  `L4 nazwa w rozwiniętej liście → kolonia ${rec.switched[0]} + panel ${rec.panels[0]}, lista zwinięta: ${!isOpenNow()}`);

console.log('\n── Klik poza listą ──');
d.handleClick(BAND_X, BAND_Y); frames();
const wasOpen = isOpenNow();
const r5 = d.handleClick(MAP[0], MAP[1]); frames();
ok(wasOpen && r5 === false && !isOpenNow(), `L5 klik na mapie: nie pochłonięty (${r5}), lista zwinięta (${!isOpenNow()})`);

console.log('\n── Nasłuch „klik poza" (capture na window) ──');
d.handleClick(BAND_X, BAND_Y); frames();
const L = clickListeners();
ok(isOpenNow() && L.length === 1, `L6a otwarta lista ma nasłuch click (capture) na window — ${L.length}`);
L[0]?.fn({ clientX: BAND_X, clientY: BAND_Y }); frames(5);
ok(L.length === 1 && isOpenNow(), `L6b klik w pasmo przez nasłuch — lista zostaje (o pasmie decyduje handleClick); nasłuch ${L.length}`);
L[0]?.fn({ clientX: MAP[0], clientY: MAP[1] }); frames();
ok(!isOpenNow() && clickListeners().length === 0, `L6c klik poza (np. w inny panel) przez nasłuch zwija listę i zdejmuje nasłuch (zostało ${clickListeners().length})`);

console.log('\n── Jedna kolonia ──');
const ONE = [COLS[0]];
window.KOSMOS.colonyManager.getAllColonies = () => ONE;
const d1 = new TopResourceDrawer();
const before = clickListeners().length;
for (let i = 0; i < 3; i++) d1.draw(recCtx(), W, H);
d1.handleClick(BAND_X, BAND_Y); for (let i = 0; i < 20; i++) d1.draw(recCtx(), W, H);
ok(!d1.isOpen() && clickListeners().length === before, `L7 jedna kolonia: klik w pasmo nie zostawia stanu „otwarte" (slide ${d1._slideProgress.toFixed(2)}) ani nasłuchu`);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
