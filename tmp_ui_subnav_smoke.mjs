// Smoke — konsolidacja nav 14→7, Slice 2 (subnav addytywnie).
// Testuje czystą logikę: NAV_GROUPS + getNavGroup/isGroupedId/getSubNavHeight
// + hitTestSubNav + drawSubNav (mock ctx). Bez DOM/canvas.
//
// Stuby globalne PRZED importem: i18n.js:8 czyta localStorage na top-levelu,
// getSubNavHeight czyta window.KOSMOS.overlayManager.active w runtime.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = { KOSMOS: { overlayManager: { active: null } } };

const M = await import('./src/ui/CivPanelDrawer.js');
const { COSMIC } = await import('./src/config/LayoutConfig.js');
const {
  NAV_GROUPS, getNavGroup, isGroupedId, getSubNavHeight,
  drawSubNav, hitTestSubNav, SUBNAV_TAB_W, CIV_TABS,
} = M;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };

// ── G1: NAV_GROUPS struktura ──────────────────────────────
ok(Array.isArray(NAV_GROUPS) && NAV_GROUPS.length === 7, 'G1.1 NAV_GROUPS = 7 grup');
const order = NAV_GROUPS.map(g => g.primary).join(',');
ok(order === 'civilization,economy,colony,population,diplomacy,fleet,tech',
   'G1.2 kolejność C/E/H/P/D/F/T: ' + order);
ok(NAV_GROUPS.every(g => g.members[0] === g.primary), 'G1.3 members[0] === primary');
const allMembers = NAV_GROUPS.flatMap(g => g.members);
ok(allMembers.length === 14, 'G1.4 łącznie 14 członków: ' + allMembers.length);
ok(new Set(allMembers).size === 14, 'G1.5 brak duplikatów członków');
const expectedIds = ['civilization','dyson','economy','trade','colony','population',
  'diplomacy','intel','war','galaxy','fleet','unit_design','tech','observatory'];
ok(expectedIds.every(id => allMembers.includes(id)), 'G1.6 wszystkie 14 overlay-id obecne');
ok(getNavGroup('diplomacy').members.join(',') === 'diplomacy,intel,war,galaxy',
   'G1.7 grupa Diplomacy = diplomacy,intel,war,galaxy');
// Każdy member istnieje w CIV_TABS (subnav czyta ikonę/label stamtąd)
ok(allMembers.every(id => CIV_TABS.some(t => t.id === id)), 'G1.8 każdy member ma wpis w CIV_TABS');

// ── G2: getNavGroup (mapa odwrotna) ───────────────────────
ok(getNavGroup('dyson')?.primary === 'civilization', 'G2.1 dyson → civilization');
ok(getNavGroup('trade')?.primary === 'economy',       'G2.2 trade → economy');
ok(getNavGroup('galaxy')?.primary === 'diplomacy',    'G2.3 galaxy → diplomacy');
ok(getNavGroup('observatory')?.primary === 'tech',    'G2.4 observatory → tech');
ok(getNavGroup('unit_design')?.primary === 'fleet',   'G2.5 unit_design → fleet');
ok(getNavGroup('nieistnieje') === null,               'G2.6 nieznany id → null');

// ── G3: isGroupedId (grupy >1 vs singletony) ──────────────
ok(isGroupedId('civilization') === true,  'G3.1 civilization grupowy');
ok(isGroupedId('economy') === true,       'G3.2 economy grupowy');
ok(isGroupedId('diplomacy') === true,     'G3.3 diplomacy grupowy');
ok(isGroupedId('fleet') === true,         'G3.4 fleet grupowy');
ok(isGroupedId('tech') === true,          'G3.5 tech grupowy');
ok(isGroupedId('colony') === false,       'G3.6 colony singleton');
ok(isGroupedId('population') === false,    'G3.7 population singleton');
ok(isGroupedId('dyson') === true,         'G3.8 dyson (wtórny) też grupowy');
ok(isGroupedId(null) === false,           'G3.9 null → false');
ok(isGroupedId(undefined) === false,      'G3.10 undefined → false');

// ── G4: getSubNavHeight (dynamiczny, czyta active) ────────
window.KOSMOS.overlayManager.active = 'economy';
ok(getSubNavHeight() === COSMIC.SUBNAV_H, 'G4.1 active=economy → SUBNAV_H');
window.KOSMOS.overlayManager.active = 'trade';
ok(getSubNavHeight() === COSMIC.SUBNAV_H, 'G4.2 active=trade (wtórny) → SUBNAV_H');
window.KOSMOS.overlayManager.active = 'colony';
ok(getSubNavHeight() === 0, 'G4.3 active=colony (singleton) → 0');
window.KOSMOS.overlayManager.active = 'population';
ok(getSubNavHeight() === 0, 'G4.4 active=population (singleton) → 0');
window.KOSMOS.overlayManager.active = null;
ok(getSubNavHeight() === 0, 'G4.5 active=null → 0');

// ── G5: hitTestSubNav ─────────────────────────────────────
const W = 1280;
const y0 = COSMIC.TOP_BAR_H, h = COSMIC.SUBNAV_H, yMid = y0 + h / 2;
ok(hitTestSubNav(4 + 0 * SUBNAV_TAB_W + 5, yMid, W, 'economy')?.id === 'economy', 'G5.1 1. zakładka → economy');
ok(hitTestSubNav(4 + 1 * SUBNAV_TAB_W + 5, yMid, W, 'economy')?.id === 'trade',   'G5.2 2. zakładka → trade');
const gap = hitTestSubNav(4 + 2 * SUBNAV_TAB_W + 5, yMid, W, 'economy');
ok(gap && gap.id === null, 'G5.3 pas poza zakładką → {id:null} (absorb)');
ok(hitTestSubNav(10, y0 - 1, W, 'economy') === null,     'G5.4 y nad pasem → null');
ok(hitTestSubNav(10, y0 + h + 1, W, 'economy') === null, 'G5.5 y pod pasem → null');
ok(hitTestSubNav(10, yMid, W, 'colony') === null,        'G5.6 singleton colony → null');
ok(hitTestSubNav(10, yMid, W, 'population') === null,    'G5.7 singleton population → null');
ok(hitTestSubNav(4 + 3 * SUBNAV_TAB_W + 5, yMid, W, 'diplomacy')?.id === 'galaxy', 'G5.8 diplomacy 4. zakładka → galaxy');
ok(hitTestSubNav(W - COSMIC.OUTLINER_W + 5, yMid, W, 'economy') === null, 'G5.9 obszar outlinera → null');
ok(hitTestSubNav(4 + 1 * SUBNAV_TAB_W + 5, yMid, W, 'diplomacy')?.id === 'intel', 'G5.10 diplomacy 2. zakładka → intel');

// ── G6: drawSubNav (mock ctx — no-op singleton, nie rzuca) ─
const calls = { fillRect: 0, fillText: 0 };
const mockCtx = {
  fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
  fillRect() { calls.fillRect++; }, strokeRect() {}, fillText() { calls.fillText++; },
  beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, measureText() { return { width: 40 }; },
};
drawSubNav(mockCtx, W, 'colony');
ok(calls.fillRect === 0 && calls.fillText === 0, 'G6.1 drawSubNav(colony) = no-op (singleton)');
drawSubNav(mockCtx, W, 'economy');
ok(calls.fillText >= 4, 'G6.2 drawSubNav(economy) rysuje ≥4 fillText (ikona+nazwa ×2)');
let threw = false;
try { drawSubNav(mockCtx, W, 'diplomacy'); } catch (e) { threw = true; console.log('   threw: ' + e.message); }
ok(!threw, 'G6.3 drawSubNav(diplomacy ×4) nie rzuca');

// ── G7: BaseOverlay._getOverlayBounds integracja (pas rezerwowany) ─
const { BaseOverlay } = await import('./src/ui/BaseOverlay.js');
const ov = new BaseOverlay({});
window.KOSMOS.overlayManager.active = 'economy';   // grupowy → +pas
const bGrp = ov._getOverlayBounds(1280, 800);
ok(bGrp.oy === COSMIC.TOP_BAR_H + COSMIC.MAP_MODE_H + COSMIC.SUBNAV_H,
   `G7.1 grupowy: oy = TOP_BAR_H+SUBNAV_H (${bGrp.oy})`);
window.KOSMOS.overlayManager.active = 'population';  // singleton → bez pasa
const bSng = ov._getOverlayBounds(1280, 800);
ok(bSng.oy === COSMIC.TOP_BAR_H + COSMIC.MAP_MODE_H,
   `G7.2 singleton: oy = TOP_BAR_H (bez pasa) (${bSng.oy})`);
ok(bGrp.oy - bSng.oy === COSMIC.SUBNAV_H, 'G7.3 różnica oy grupowy−singleton = SUBNAV_H');
ok(bSng.oh - bGrp.oh === COSMIC.SUBNAV_H, 'G7.4 grupowy oh mniejszy o SUBNAV_H (pas zjada wysokość)');

console.log(`\nSlice 2 subnav smoke: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
process.exit(fail ? 1 : 0);
