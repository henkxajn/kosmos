// Smoke: zegar (BottomControlBar) nie zostawia przezroczystego pasa pod overlayem Command.
//
// Bug: FleetManagerOverlay kończył tło na GÓRNEJ krawędzi zegara (H-62), a zegar maluje tło tylko
// pod swoim slotem nawigacji (~1/7 szerokości) → pas 20 px był na ~85% szerokości niezamalowany,
// przebijała przez niego mapa 3D i dolna krawędź ramki tworzyła linię tnącą ekran.
// Wariant 1: tło/ramka overlayu schodzą do paska nawigacji (H-42), a TREŚĆ nadal ustępuje zegarowi
// (contentH bez zmian → żadna zakładka się nie przelicza).
// Uruchom: node src/testing/smoke/tmp_fleet_clock_band_smoke.mjs

globalThis.localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style:{}, getContext: () => null, appendChild(){}, setAttribute(){} }),
  body: { appendChild(){}, removeChild(){} } };
if (!globalThis.KOSMOS) globalThis.KOSMOS = {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL:', m); } };

const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');
const { BottomControlBar } = await import('../../ui/BottomControlBar.js');
const { COSMIC, BOTTOM_RESERVED } = await import('../../config/LayoutConfig.js');
const { bottomNavBarRect } = await import('../../ui/BottomNavBarLogic.js');

const W = 1280, H = 720;
const STRIP_H = 20;   // BottomControlBar.STRIP_H (moduł-lokalny — replika do asercji)

function mockCtx() {
  const rects = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '11px mono', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: this.fillStyle }); },
    strokeRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {}, rect() {},
    setLineDash() {}, getTransform() { return { a: 1, d: 1 }; },
    measureText(s) { const px = parseFloat(this.font) || 10; return { width: String(s).length * px * 0.6 }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createConicGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    drawImage() {},
  };
  ctx.rects = rects;
  return ctx;
}

globalThis.KOSMOS = {
  civMode: true,
  homePlanet: { id: 'home', x: 0, y: 0 },
  activeSystemId: 'sys_home',
  timeSystem: { gameTime: 40, isPaused: true },
  uiManager: { _timeState: { isPaused: true, multiplierIndex: 1, displayText: '03/06/48' } },
  colonyManager: { getColony: () => null, getPlayerColonies: () => [], activePlanetId: 'home' },
  vesselManager: { isImmobilized: () => false, getAllVessels: () => [] },
  overlayManager: { active: 'fleet' },
  notificationCenter: { getActiveCount: () => 0 },
};

// ── Referencje geometrii ────────────────────────────────────────────────────
const navRect = bottomNavBarRect(W, H);
const navTop = navRect.y;                 // 678
const stripTop = navTop - STRIP_H;        // 658 — góra pasa zegara

const ov = new FleetManagerOverlay();
ov._visible = true;
ov._activeTab = 'tactical';
const ctx = mockCtx();
ov.draw(ctx, W, H);

// ── T1: tło overlayu dochodzi do paska nawigacji (pas zamalowany, nie przezroczysty) ──
const bottom = ov._bounds.y + ov._bounds.h;
ok(bottom === navTop, `T1: dół overlayu styka się z paskiem nawigacji (${bottom} === ${navTop})`);
ok(bottom === H - BOTTOM_RESERVED, `T1: rezerwa = BOTTOM_RESERVED, jak w BaseOverlay (${bottom} === ${H - BOTTOM_RESERVED})`);

// ── T2: treść NADAL ustępuje zegarowi (dolne akcje prawego panelu osiągalne scrollem) ──
const contentBottom = ov._contentBounds.y + ov._contentBounds.h;
ok(contentBottom === stripTop, `T2: dół TREŚCI = góra zegara (${contentBottom} === ${stripTop})`);
ok(ov._contentBounds.h === 602, `T2: contentH bez zmian względem stanu sprzed fixa (${ov._contentBounds.h} === 602)`);

// ── T3: pas 20 px jest realnie zamalowany na CAŁEJ szerokości ───────────────
// (dawniej: nic go nie rysowało poza slotem zegara → przebijała mapa 3D)
const bandY = stripTop + STRIP_H / 2;   // środek dawnej dziury
const covers = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const opaqueBg = ctx.rects.filter(r => r.fill === '#000');
for (const px of [4, 320, 640, 900, 1080]) {
  ok(opaqueBg.some(r => covers(r, px, bandY)), `T3: pas zegara zamalowany tłem overlayu w x=${px}`);
}

// ── T4: zegar leży NA overlayu (jego pas mieści się w prawej kolumnie, którą oszczędziliśmy) ──
const bar = new BottomControlBar();
const barCtx = mockCtx();
bar.draw(barCtx, W, H, KOSMOS.uiManager._timeState);
const bg = bar._bgRect;
ok(bg.y === stripTop && bg.h === STRIP_H, `T4: pas zegara na y=[${bg.y},${bg.y + bg.h}] = dawna dziura`);
const RIGHT_W = 200;
ok(bg.x >= W - RIGHT_W, `T4: zegar mieści się w prawej kolumnie overlayu (x=${bg.x} >= ${W - RIGHT_W}) — tylko ona mu ustępuje`);
ok(bg.x + bg.w <= W, `T4: zegar nie wystaje poza ekran (${bg.x + bg.w} <= ${W})`);

// ── T5: klik w dawną dziurę trafia w overlay, nie przelatuje na mapę 3D ─────
const b = ov._bounds;
const inOverlay = (x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
ok(inOverlay(400, bandY), 'T5: punkt w dawnej dziurze należy do overlayu (klik nie spada na scenę 3D)');
ok(!inOverlay(400, navTop + 10), 'T5: pasek nawigacji NIE jest zasłonięty przez overlay');

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
