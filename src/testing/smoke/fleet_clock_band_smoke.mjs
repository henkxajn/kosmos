// Smoke: zegar (BottomControlBar) nie zostawia przezroczystego pasa pod overlayem Command.
//
// Bug: FleetManagerOverlay kończył tło na GÓRNEJ krawędzi zegara (H-62), a zegar maluje tło tylko
// pod swoim slotem nawigacji (~1/7 szerokości) → pas 20 px był na ~85% szerokości niezamalowany,
// przebijała przez niego mapa 3D i dolna krawędź ramki tworzyła linię tnącą ekran.
// Wariant 1: tło/ramka overlayu schodzą do paska nawigacji (H-42), a TREŚĆ nadal ustępuje zegarowi
// (contentH bez zmian → żadna zakładka się nie przelicza).
// Uruchom: node src/testing/smoke/fleet_clock_band_smoke.mjs
//
// KZ-Command — Dowództwo jest wyłącznie konsolą: T2 / T3 pinowały dawny ekran (contentH 602, nieprzezroczyste tło `#000`
// w pasie zegara), którego nie ma. Teraz: T2 — klaster zegara konsoli (`consoleZones.clock`) = realny prostokąt
// BottomControlBar, a każda strefa konsoli nad zegarem (w poziomie) kończy się na jego górnej krawędzi (świadek: ≥ 1 taka
// strefa); T3 — rama konsoli schodzi do paska nawigacji (żadna krawędź nie tnie ekranu na górze zegara), a strefy obok
// zegara wchodzą w pas (świadek: ≥ 1) — pas nie jest pustą dziurą. T1 / T4 / T5 bez zmian.

globalThis.localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style:{}, getContext: () => null, appendChild(){}, setAttribute(){} }),
  body: { appendChild(){}, removeChild(){} } };
if (!globalThis.KOSMOS) globalThis.KOSMOS = {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL:', m); } };

// KZ-Command: jedyna ścieżka Dowództwa = konsola (flaga consoleCommand zdjęta).
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');
const { BottomControlBar } = await import('../../ui/BottomControlBar.js');
const { COSMIC, BOTTOM_RESERVED } = await import('../../config/LayoutConfig.js');
const { bottomNavBarRect, navSlotLayout } = await import('../../ui/BottomNavBarLogic.js');
const { NAV_GROUPS } = await import('../../ui/CivPanelDrawer.js');

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

// ── T2: treść konsoli ustępuje zegarowi tylko tam, gdzie zegar leży (prawy slot) ──
const bar0 = new BottomControlBar();
bar0.draw(mockCtx(), W, H, KOSMOS.uiManager._timeState);
const z = ov.consoleZones ?? {};
const clock = z.clock;
const realClock = bar0._bgRect;
ok(!!clock && !!realClock && clock.x === realClock.x && clock.y === realClock.y && clock.w === realClock.w && clock.h === realClock.h,
  `T2: klaster zegara konsoli = prostokąt BottomControlBar (${JSON.stringify(clock)} vs ${JSON.stringify(realClock)})`);
const ZONES = ['list', 'hero', 'inspector', 'strip'].map((k) => [k, z[k]]).filter(([, r]) => !!r);
ok(ZONES.length === 4, `T2: świadek — 4 strefy konsoli (${ZONES.length})`);
const overClock = ZONES.filter(([, r]) => clock && r.x < clock.x + clock.w && r.x + r.w > clock.x);
ok(overClock.length >= 1, `T2: świadek — strefy nad zegarem w poziomie (${overClock.map(([k]) => k).join(',')})`);
for (const [k, r] of overClock) ok(r.y + r.h <= stripTop, `T2: ${k} kończy się nad zegarem (${r.y + r.h} <= ${stripTop})`);

// ── T3: pas zegara nie jest dziurą ani linią tnącą ekran ──
// (dawniej: dół ramki na górze zegara + niezamalowany pas → przebijała mapa 3D, linia przez cały ekran)
const bandY = stripTop + STRIP_H / 2;   // środek dawnej dziury
const fr = z.frame;
ok(!!fr && fr.y + fr.h === navTop, `T3: rama konsoli schodzi do paska nawigacji (${fr ? fr.y + fr.h : '—'} === ${navTop})`);
const besideClock = ZONES.filter(([, r]) => !overClock.some(([, q]) => q === r));
ok(besideClock.length >= 1, `T3: świadek — strefy obok zegara (${besideClock.map(([k]) => k).join(',')})`);
// dolny rząd stref obok zegara (lista, pas osi) sięga w pas — przestrzeń obok zegara jest używana, nie pusta
const lowBeside = Math.max(...besideClock.map(([, r]) => r.y + r.h));
ok(lowBeside > stripTop, `T3: strefy obok zegara wchodzą w pas (dół ${lowBeside} > ${stripTop})`);

// ── T4: pas zegara ZAKOTWICZONY DOKŁADNIE w ostatnim (prawym) slocie nawigacji ──
// Niezależne od liczby slotów: C7 zdjął slot Populacji (7→6) → ostatni slot szerszy i zaczyna
// się dalej w lewo (C8 przywróci 7). Liczymy realny ostatni slot tą samą funkcją co
// BottomControlBar (navSlotLayout) — dawne proxy „bg.x >= 1080" zakładało sztywno 7 slotów.
const bar = new BottomControlBar();
const barCtx = mockCtx();
bar.draw(barCtx, W, H, KOSMOS.uiManager._timeState);
const bg = bar._bgRect;
ok(bg.y === stripTop && bg.h === STRIP_H, `T4: pas zegara na y=[${bg.y},${bg.y + bg.h}] = dawna dziura`);
const navSlots = navSlotLayout(navRect, NAV_GROUPS.length);
const lastSlot = navSlots[navSlots.length - 1];
const approx = (a, b) => Math.abs(a - b) < 1e-6;   // bgW = (x+w)−x w BottomControlBar → szum float ~1e-13
ok(approx(bg.x, lastSlot.x) && approx(bg.w, lastSlot.w),
  `T4: zegar = ostatni slot nawigacji (x=${bg.x}/${lastSlot.x}, w=${bg.w}/${lastSlot.w}) — tylko prawa kolumna mu ustępuje`);
ok(bg.x + bg.w <= W, `T4: zegar nie wystaje poza ekran (${bg.x + bg.w} <= ${W})`);

// ── T5: klik w dawną dziurę trafia w overlay, nie przelatuje na mapę 3D ─────
const b = ov._bounds;
const inOverlay = (x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
ok(inOverlay(400, bandY), 'T5: punkt w dawnej dziurze należy do overlayu (klik nie spada na scenę 3D)');
ok(!inOverlay(400, navTop + 10), 'T5: pasek nawigacji NIE jest zasłonięty przez overlay');

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
