// Smoke: lista floty w Dowództwie (Command) — STAŁA wysokość kafla + skracanie nazw po szerokości.
//
// Steruje REALNYM FleetManagerOverlay._drawLeft na mocku ctx i mierzy hit-zony typu 'vessel'
// (rysowanie i hit-test dzielą tę samą geometrię, więc zony = realne kafle).
// Bug A: wysokość zależała od stanu (34 vs 52) i baku warp (+8) → lista skakała przy starcie/dokowaniu.
// Bug B: nazwa obcinana po LICZBIE znaków (slice(0,10)) — niezależnie od szerokości panelu.
// Uruchom: node src/testing/smoke/tmp_fleet_list_rows_smoke.mjs

globalThis.localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style:{}, getContext: () => null, appendChild(){}, setAttribute(){} }),
  body: { appendChild(){}, removeChild(){} } };
if (!globalThis.KOSMOS) globalThis.KOSMOS = {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL:', m); } };

const fm = await import('../../ui/FleetManagerOverlay.js');
const O = fm.FleetManagerOverlay;

// Mock ctx: measureText proporcjonalny do długości (Space Mono ≈ 0.6em) — pozwala sprawdzić,
// że skracanie liczy się z SZEROKOŚCI, nie z liczby znaków.
const CHAR_W = 0.6;
function mockCtx() {
  const drawn = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '13px mono', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, clip() {}, rect() {},
    setLineDash() {}, getTransform() { return { a: 1, d: 1 }; },
    fillText(txt, x, y) { drawn.push({ txt: String(txt), x, y }); },
    measureText(s) { const px = parseFloat(this.font) || 10; return { width: String(s).length * px * CHAR_W }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createConicGradient() { return { addColorStop() {} }; },
  };
  ctx.drawn = drawn;
  return ctx;
}

const mkVessel = (id, name, state, opts = {}) => ({
  id, name, shipId: opts.shipId ?? 'hull_small', isWreck: false, modules: [],
  systemId: 'sys_home', status: 'idle',
  position: { x: 0, y: 0, state, dockedAt: state === 'in_transit' ? null : 'home' },
  fuel: { current: 6, max: 10 },
  warpFuel: opts.warp ? { current: 5, max: 10 } : { current: 0, max: 0 },
  mission: state === 'in_transit'
    ? { type: 'recon', phase: 'outbound', targetId: 'home', targetName: 'Kepler-442b', arrivalYear: 49 }
    : null,
});

globalThis.KOSMOS = {
  civMode: true,
  homePlanet: { id: 'home', x: 0, y: 0 },
  activeSystemId: 'sys_home',
  timeSystem: { gameTime: 40 },
  colonyManager: { getColony: (id) => (id === 'home' ? { planetId: 'home', name: 'Kolonia Domowa' } : null), activePlanetId: 'home' },
  vesselManager: { isImmobilized: () => false, getAllVessels: () => [] },
};

// ── Uruchom _drawLeft i zbierz kafle statków ────────────────────────────────
function drawRows(vessels) {
  const ov = new O();
  const ctx = mockCtx();
  ov._hitZones = [];
  ov._drawLeft(ctx, 0, 0, 260, 600, vessels, null, [], []);
  const zones = ov._hitZones.filter(z => z.type === 'vessel');
  return { ctx, zones, byId: new Map(zones.map(z => [z.data.vesselId, z])) };
}

// ── T1: jednakowa wysokość niezależnie od stanu i baku warp ─────────────────
const mixed = [
  mkVessel('v1', 'Odkrywca I', 'docked'),
  mkVessel('v2', 'Zwiadowca II', 'in_transit'),
  mkVessel('v3', 'Kwatermistrz VIII', 'orbiting', { warp: true }),
  mkVessel('v4', 'Volkov', 'in_transit', { warp: true }),
];
const r1 = drawRows(mixed);
ok(r1.zones.length === 4, 'T1: 4 kafle statków');
const heights = [...new Set(r1.zones.map(z => z.h))];
ok(heights.length === 1, `T1: JEDNA wysokość kafla dla wszystkich stanów (jest: ${heights.join('/')})`);
ok(heights[0] === 52, `T1: wysokość = 52 (jest: ${heights[0]})`);

// ── T2: zmiana statusu NIE przesuwa reszty listy (brak skakania) ────────────
const before = drawRows(mixed);
const yBefore = mixed.map(v => before.byId.get(v.id).y);
mixed[0].position.state = 'in_transit';   // v1 startuje → dawniej +18 px i lista skakała
mixed[0].position.dockedAt = null;
mixed[0].mission = { type: 'recon', phase: 'outbound', targetId: 'home', targetName: 'Kepler-442b', arrivalYear: 51 };
const after = drawRows(mixed);
const yAfter = mixed.map(v => after.byId.get(v.id).y);
ok(JSON.stringify(yBefore) === JSON.stringify(yAfter), `T2: pozycje kafli bez zmian po zmianie statusu (${yBefore} vs ${yAfter})`);
mixed[0].position.state = 'docked'; mixed[0].position.dockedAt = 'home'; mixed[0].mission = null;

// ── T3: sąsiednie kafle stykają się dokładnie (brak dziur/nakładek) ─────────
const r3 = drawRows(mixed);
let contiguous = true;
for (let i = 1; i < r3.zones.length; i++) {
  if (r3.zones[i].y !== r3.zones[i - 1].y + r3.zones[i - 1].h) contiguous = false;
}
ok(contiguous, 'T3: kafle stykają się (y[i] === y[i-1] + h)');

// ── T4: pełna nazwa mieści się w poszerzonym panelu (bez wielokropka) ───────
const longNames = [
  mkVessel('n1', 'USS ENTERPRISE', 'docked'),
  mkVessel('n2', 'Kwatermistrz VIII', 'docked'),
  mkVessel('n3', 'Pierwszy Krok III', 'docked'),
];
const r4 = drawRows(longNames);
for (const v of longNames) {
  const hit = r4.ctx.drawn.some(d => d.txt.includes(v.name));
  ok(hit, `T4: „${v.name}" narysowana w całości (bez ucięcia)`);
}

// Tekst rysowany w danej linii kafla (offset względem GÓRY kafla — ry, nie 0).
const lineAt = (res, vesselId, dy) => {
  const top = res.byId.get(vesselId).y;
  return res.ctx.drawn.filter(d => Math.abs(d.y - (top + dy)) < 1);
};

// ── T5: skracanie liczone z SZEROKOŚCI — ten sam statek, dwie szerokości panelu ──
const beast = () => [mkVessel('b1', 'Nieprawdopodobnie Długa Nazwa Statku', 'docked')];
const wideName = lineAt(drawRows(beast()), 'b1', 14)[0]?.txt ?? '';
const ovNarrow = new O(); const cNarrow = mockCtx();
ovNarrow._hitZones = [];
ovNarrow._drawLeft(cNarrow, 0, 0, 120, 600, beast(), null, [], []);   // wąski panel
const nTop = ovNarrow._hitZones.find(z => z.type === 'vessel').y;
const narrowName = cNarrow.drawn.find(d => Math.abs(d.y - (nTop + 14)) < 1)?.txt ?? '';
ok(narrowName.includes('…'), `T5: wąski panel (120px) — nazwa skrócona wielokropkiem („${narrowName}")`);
ok(wideName.includes('…'), `T5: szeroki panel — bardzo długa nazwa nadal skrócona („${wideName}")`);
ok(narrowName.length < wideName.length, `T5: szerszy panel = WIĘCEJ znaków („${narrowName}" < „${wideName}") — skracanie po szerokości, nie po slice(0,10)`);

// ── T6: zarezerwowana 3. linia nie jest pusta dla statku bez ETA ────────────
const r6 = drawRows([mkVessel('d1', 'Odkrywca I', 'docked')]);
ok(lineAt(r6, 'd1', 43).length > 0, 'T6: statek w hangarze ma wypełnioną 3. linię (klasa kadłuba zamiast pustki)');
const r6b = drawRows([mkVessel('f1', 'Odkrywca I', 'in_transit')]);
ok(lineAt(r6b, 'f1', 43).some(d => d.txt.includes('ETA')), 'T6: statek w locie ma ETA w 3. linii');

// ── T7: wraki i wrogowie zachowują swoje wysokości (bez regresji) ───────────
const wreck = { ...mkVessel('w1', 'Wrak', 'orbiting'), isWreck: true, wreckedAt: 30 };
const enemy = { ...mkVessel('e1', 'Obcy', 'orbiting'), ownerEmpireId: 'emp_1' };
const r7 = new O(); const c7 = mockCtx(); r7._hitZones = [];
r7._drawLeft(c7, 0, 0, 260, 600, [], null, [enemy], [wreck]);
const z7 = r7._hitZones.filter(z => z.type === 'vessel');
ok(z7.find(z => z.data.vesselId === 'w1')?.h === 30, 'T7: wrak nadal 30 px');
ok(z7.find(z => z.data.vesselId === 'e1')?.h === 34, 'T7: wrogi statek nadal 34 px');

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
