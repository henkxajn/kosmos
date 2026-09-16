// ══════════════════════════════════════════════════════════════════════════════════════════
// patrol_render_sync_smoke — Finding 273: statek pod rozkazem `patrol` (manualnym I z POI)
// oraz `escort` NIE trafiał do `moving[]` w `VesselManager._updatePositions`, więc
// `vessel:positionUpdate` — JEDYNY kanał, którym `ThreeRenderer._syncVesselPositions` rusza sprite
// `in_transit` — nigdy go nie niósł: symulacja jechała, sprite stał (ZMIERZONE 0/200 ładunków
// na pristine `b52f724`), a „Anuluj rozkaz" objawiał się jako TELEPORT (pierwszy kontakt renderera
// z pozycją, którą symulacja miała od dawna).
//
// NAPRAWA (jedna lista): `patrol` i `escort` dopisane do `isOrderControlled` w `_updatePositions`.
// Gałąź jest TYLKO EMISJĄ — `MOS._tickPatrolOrder`/`_tickEscortOrder` całkują `position.x/y`
// PRZED wywołaniem `_updatePositions`, a sama gałąź robi `moving.push(vessel); continue;`.
// ⚠ Jedyna pułapka tej naprawy to PODWÓJNE CAŁKOWANIE (gdyby `_updatePositions` ruszyło statek
//   po raz drugi ⇒ podwójna prędkość). Dlatego T2 porównuje ślad pozycji NIE ze stałą
//   `speedAU × dt` (którą przeszłoby też zdublowanie, gdyby ktoś zdublował obie strony), lecz
//   z ZAPISANYM ŚLADEM SPRZED NAPRAWY (`src/testing/fixtures/traces/F273-patrol-trace-baseline.json`,
//   nagrany TYM SAMYM plikiem z `--record` na pristine worktree `b52f724`) — bajt w bajt (`===`).
//
// ⚠ ŚWIADOMY SKUTEK UBOCZNY LISTY (T5, podpis właściciela): gałąź `continue` omija zerowanie
//   `vessel.velocity` niżej w pętli, więc MOS-owe `velocity` patrolu/eskorty PRZEŻYWA tik (jak przy
//   pursue/intercept/engage; §2.1 M1: zero TYLKO dla docked/orbiting/wrak). Jedyni czytelnicy tego
//   pola to matematyka przechwycenia (`MOS._computeInterceptPoint` + stożek predykcji) — czytają
//   `velocity` CELU. ZMIERZONE: przed naprawą wynik przechwycenia PATROLUJĄCEGO celu zależał od
//   KOLEJNOŚCI WYDANIA rozkazów (interceptor wydany PRZED patrolem tikał przed nim i czytał zero ⇒
//   pościg, 185 tików; wydany PO — czytał świeże velocity ⇒ prawdziwe przechwycenie, 165 tików).
//   Po naprawie oba = 165. Osiągalność w normalnej grze: ZERO (patrol/escort wydaje tylko gracz,
//   intercept/engage tylko gracz i tylko na wroga ⇒ cel przechwycenia nigdy nie patroluje).
//   Pole NIE jest serializowane.
//
// T-tabela:
//   T0  fixture baseline istnieje i opisuje TEN scenariusz (DT, N, AU_TO_PX, CIV_TIME_SCALE, id)
//   T1  EMISJA: `vessel:positionUpdate` niesie patrol manualny, patrol POI i eskortę w N/N tikach
//       (kontrola nie-jałowości: każdy z nich REALNIE przebył > 1 AU; kontrola moveToPoint N/N)
//   T2  BRAK PODWÓJNEGO CAŁKOWANIA: ślad (x, y, wpIdx) per tik == baseline BAJT W BAJT dla
//       patrolu/POI/eskorty; wkład `_updatePositions` w przesunięcie = 0 px (przy > 0 px dla
//       kontroli moveToPoint — dowód, że instrument WIDZI całkowanie)
//   T3  KONTROLA moveToPoint (lider eskorty + osobny statek): ślad == baseline, emisja N/N
//   T4  kadencja waypointów: indeks 0→1 w TYM SAMYM tiku co baseline
//   T5  konsekwencja velocity (podpisana): po tiku velocity patrolu = kierunek × speedAU/CIV_TIME_SCALE;
//       przechwycenie patrolującego celu jest DETERMINISTYCZNE (I_before i I_after w tym samym tiku)
//   T6  piny ŹRÓDŁOWE (\s-tolerantne, CRLF-safe — Finding 270): lista `isOrderControlled` zawiera
//       `'patrol'` i `'escort'`; całkowanie ZOSTAJE w MOS (`position.x +=` w obu tickach); ThreeRenderer
//       ma DOKŁADNIE jednego subskrybenta `vessel:positionUpdate` → `_syncVesselPositions`; gałąź
//       „Brak misji" ustawia `sprite.position`
//   T7  CANCEL: przed anulowaniem renderer dostał pozycję (emisja > 0), po `cancelOrder` statek
//       `orbiting`+`dockedAt=null` DOKŁADNIE w pozycji z ostatniego tiku (symulacja nie skacze —
//       kontrola po obu stronach)
//
// FAIL-FIRST (finalne piny, REALNY `git worktree --detach` na b52f724 + skopiowany keeper + fixture —
// ZMIERZONE 34 PASS / 8 FAIL): czerwone DOKŁADNIE T1 (3: patrol/POI/eskorta 0/200), T5 (2: velocity
// (0,0) + przylot 165≠185), T6 (2: brak `'patrol'`/`'escort'` na liście), T7 (1: emisja przed cancel = 0).
// T0/T2/T3/T4 zielone po OBU stronach (baseline nagrany TAM — kontrola). Po naprawie 42/42.
// Wynik w `docs/design/VESSEL_ORDERS_PLAN.md` §273.
//
// Uruchom: node src/testing/smoke/patrol_render_sync_smoke.mjs
// Nagranie baseline'u (TYLKO na drzewie sprzed naprawy): … --record [ścieżka]
// ══════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath }       from 'node:url';
import { dirname, join }       from 'node:path';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import gameState               from '../../core/GameState.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { POIRegistry }         from '../../systems/POIRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..');
const FIXTURE = join(SRC, 'testing', 'fixtures', 'traces', 'F273-patrol-trace-baseline.json');

const RECORD_IDX = process.argv.indexOf('--record');
const RECORD_TO  = RECORD_IDX >= 0 ? (process.argv[RECORD_IDX + 1] ?? FIXTURE) : null;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU  = GAME_CONFIG.AU_TO_PX;
const CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const DT  = 0.01;    // rok GRY per tik (sonda z rejestru 273: 30 → 31,98 AU w 200 tikach)
const N   = 200;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });
const techStub = {
  isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
  getShipRangeMultiplier: () => 1.0, getMultiplier: () => 1.0,
  getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
};

// ── Świat ──────────────────────────────────────────────────────────────────────────────────
let vm, mos, poiReg;
function scene() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: 'sys_home' };
  gameState.reset?.();
  EntityManager.add({ id: 'star_home', type: 'star', name: 'Sol', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
  const home = { id: 'p_home', type: 'planet', name: 'Dom', x: 1 * AU, y: 0, explored: true, analyzed: true,
                 planetType: 'rocky', orbital: orb(1), deposits: [], systemId: 'sys_home' };
  EntityManager.add(home);
  vm  = new VesselManager();
  mos = new MovementOrderSystem(vm);
  poiReg = new POIRegistry(); poiReg.initPOISubdomain();
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vm, movementOrderSystem: mos, poiRegistry: poiReg,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: techStub,
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null,
                     getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
  });
}
function ship(name, xAU, yAU, { owner, speed = 1.0 } = {}) {
  const v = vm.createAndRegister('hull_small', 'p_home', { name, modules: ['engine_ion'], x: xAU * AU, y: yAU * AU });
  v.position.x = xAU * AU; v.position.y = yAU * AU;
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = speed; v.systemId = 'sys_home';
  if (owner) v.ownerEmpireId = owner;
  return v;
}
const P = (xAU, yAU) => ({ x: xAU * AU, y: yAU * AU });

/** Jeden tik gry DOKŁADNIE tak, jak robi to TimeSystem (VM._tick → MOS._tick → _updatePositions). */
function tick() {
  window.KOSMOS.timeSystem.gameTime += DT;
  EventBus.emit('time:tick', {
    deltaYears: DT, civDeltaYears: DT * CIV,
    gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1,
  });
}

// ── Scenariusz (JEDEN dla nagrania i dla porównania — recorder nie może się rozjechać z keeperem) ──
function buildScenario() {
  scene();
  const S = {};
  S.pMan = ship('P_man', 30, 0);                                // patrol manualny (patrolRoute)
  S.pPoi = ship('P_poi', 2, 5);                                 // patrol POI (prawdziwy POIRegistry)
  S.lead = ship('L_lead', 10, 0);                               // lider (moveToPoint, misja) — eskortowany
  S.esc  = ship('E_esc', 10, 0.5);                              // eskorta lidera
  S.ctl  = ship('C_ctl', 20, 0);                                // kontrola: moveToPoint
  S.tEn1 = ship('T_en1', 40, 0, { owner: 'emp_001' });          // wróg patroluje; interceptor wydany PO
  S.iA   = ship('I_after', 40, 3, { speed: 2.0 });              // ⚠ szybszy od celu — inaczej a=0 (pursue)
  S.tEn2 = ship('T_en2', 50, 0, { owner: 'emp_001' });          // wróg patroluje; interceptor wydany PRZED
  S.iB   = ship('I_before', 50, 3, { speed: 2.0 });

  S.issue = {};
  S.issue.pMan = mos.issueOrder(S.pMan.id, { type: 'patrol', patrolRoute: [P(32, 0), P(36, 0)] });
  const poi = poiReg.createPOI({ type: 'patrol', name: 'POI-A', waypoints: [P(3, 5), P(5, 5)], loopMode: 'loop' });
  S.issue.poi  = poi;
  S.issue.pPoi = mos.issueOrder(S.pPoi.id, { type: 'patrol', poiId: poi.poiId });
  S.issue.lead = mos.issueOrder(S.lead.id, { type: 'moveToPoint', targetPoint: P(14, 0) });
  S.issue.esc  = mos.issueOrder(S.esc.id,  { type: 'escort', targetEntityId: S.lead.id });
  S.issue.ctl  = mos.issueOrder(S.ctl.id,  { type: 'moveToPoint', targetPoint: P(24, 0) });
  S.issue.tEn1 = mos.issueOrder(S.tEn1.id, { type: 'patrol', patrolRoute: [P(44, 0), P(48, 0)] });
  S.issue.iA   = mos.issueOrder(S.iA.id,   { type: 'intercept', targetEntityId: S.tEn1.id });
  S.issue.iB   = mos.issueOrder(S.iB.id,   { type: 'intercept', targetEntityId: S.tEn2.id });
  S.issue.tEn2 = mos.issueOrder(S.tEn2.id, { type: 'patrol', patrolRoute: [P(54, 0), P(58, 0)] });

  S.traced = ['pMan', 'pPoi', 'esc', 'lead', 'ctl'];           // ślad do baseline'u (SYMULACJA, nie velocity)
  S.all    = ['pMan', 'pPoi', 'esc', 'lead', 'ctl', 'tEn1', 'iA', 'tEn2', 'iB'];
  return S;
}

function runScenario(S) {
  const idOf = Object.fromEntries(S.all.map(k => [k, S[k].id]));
  const emits = Object.fromEntries(S.all.map(k => [k, 0]));
  EventBus.on('vessel:positionUpdate', ({ vessels }) => {
    const set = new Set(vessels.map(v => v.id));
    for (const k of S.all) if (set.has(idOf[k])) emits[k]++;
  });
  const completedAt = {};
  EventBus.on('vessel:orderCompleted', ({ vesselId }) => {
    for (const k of S.all) if (idOf[k] === vesselId && completedAt[k] == null) completedAt[k] = tickNo;
  });
  // Wkład `_updatePositions` w PRZESUNIĘCIE (owijamy metodę; MOS tika PRZED nią).
  const upContrib = Object.fromEntries(S.all.map(k => [k, 0]));
  const origUP = vm._updatePositions.bind(vm);
  vm._updatePositions = function (dy) {
    const pre = Object.fromEntries(S.all.map(k => [k, [S[k].position.x, S[k].position.y]]));
    origUP(dy);
    for (const k of S.all) upContrib[k] += Math.hypot(S[k].position.x - pre[k][0], S[k].position.y - pre[k][1]);
  };
  const trace = Object.fromEntries(S.traced.map(k => [k, []]));
  let tickNo = 0;
  for (tickNo = 0; tickNo < N; tickNo++) {
    tick();
    for (const k of S.traced) {
      trace[k].push([S[k].position.x, S[k].position.y, S[k].movementOrder?.patrolWaypointIndex ?? null]);
    }
  }
  return { emits, upContrib, trace, completedAt };
}

// ── --record: nagraj baseline (TYLKO na drzewie sprzed naprawy) ──────────────────────────────
if (RECORD_TO) {
  const S = buildScenario();
  const R = runScenario(S);
  const out = {
    finding: 273, recordedFrom: process.env.F273_BASELINE_COMMIT ?? 'unknown',
    note: 'Ślad SYMULACJI (x, y px; wpIdx) per tik, nagrany TYM keeperem na drzewie SPRZED naprawy 273. Baseline dla pinu "brak podwójnego całkowania" (T2).',
    DT, N, AU_TO_PX: AU, CIV_TIME_SCALE: CIV,
    ships: Object.fromEntries(S.traced.map(k => [k, { name: S[k].name, speedAU: S[k].speedAU }])),
    emitsAtRecord: R.emits, upContribAtRecord: R.upContrib,
    trace: R.trace,
  };
  mkdirSync(dirname(RECORD_TO), { recursive: true });
  writeFileSync(RECORD_TO, JSON.stringify(out));
  console.log(`baseline zapisany: ${RECORD_TO}`);
  console.log('emisje przy nagraniu:', JSON.stringify(R.emits));
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
header('T0 — fixture baseline istnieje i opisuje TEN scenariusz');
let BASE = null;
try { BASE = JSON.parse(readFileSync(FIXTURE, 'utf8')); } catch (e) { BASE = null; }
assert(BASE !== null, `baseline wczytany: ${FIXTURE}`);
assert(BASE?.DT === DT && BASE?.N === N, `schemat: DT=${BASE?.DT} N=${BASE?.N} (keeper: ${DT}/${N})`);
assert(BASE?.AU_TO_PX === AU && BASE?.CIV_TIME_SCALE === CIV,
  `jednostki: AU_TO_PX=${BASE?.AU_TO_PX} CIV_TIME_SCALE=${BASE?.CIV_TIME_SCALE} (config: ${AU}/${CIV})`);
assert(['pMan', 'pPoi', 'esc', 'lead', 'ctl'].every(k => Array.isArray(BASE?.trace?.[k]) && BASE.trace[k].length === N),
  'ślady pMan/pPoi/esc/lead/ctl mają po N wpisów');
assert(BASE?.emitsAtRecord?.pMan === 0 && BASE?.emitsAtRecord?.esc === 0 && BASE?.emitsAtRecord?.pPoi === 0,
  `baseline pochodzi SPRZED naprawy (emisje przy nagraniu: patrol ${BASE?.emitsAtRecord?.pMan}, POI ${BASE?.emitsAtRecord?.pPoi}, eskorta ${BASE?.emitsAtRecord?.esc} — mają być 0)`);

// ══════════════════════════════════════════════════════════════════════════════════════════
const S = buildScenario();
for (const k of ['pMan', 'pPoi', 'lead', 'esc', 'ctl', 'tEn1', 'iA', 'iB', 'tEn2']) {
  if (!S.issue[k]?.ok) console.log(`  ⚠ rozkaz ${k} ODRZUCONY: ${JSON.stringify(S.issue[k])}`);
}
const R = runScenario(S);
const movedAU = (k) => Math.hypot(S[k].position.x - R.trace[k]?.[0]?.[0], S[k].position.y - R.trace[k]?.[0]?.[1]) / AU;
const distAU  = (k, x0, y0) => Math.hypot(S[k].position.x - x0 * AU, S[k].position.y - y0 * AU) / AU;

header('T1 — EMISJA: vessel:positionUpdate niesie patrol (manualny, POI) i eskortę');
assert(S.issue.pMan?.ok && S.issue.pPoi?.ok && S.issue.esc?.ok && S.issue.ctl?.ok && S.issue.lead?.ok,
  `rozkazy przyjęte: patrol=${S.issue.pMan?.ok} POI=${S.issue.pPoi?.ok} eskorta=${S.issue.esc?.ok} kontrole=${S.issue.ctl?.ok}/${S.issue.lead?.ok}`);
assert(distAU('pMan', 30, 0) > 1.0, `kontrola nie-jałowości: patrol manualny REALNIE przebył ${distAU('pMan', 30, 0).toFixed(3)} AU (> 1)`);
assert(distAU('pPoi', 2, 5) > 1.0,  `kontrola nie-jałowości: patrol POI REALNIE przebył ${distAU('pPoi', 2, 5).toFixed(3)} AU (> 1)`);
assert(distAU('esc', 10, 0.5) > 1.0, `kontrola nie-jałowości: eskorta REALNIE przebyła ${distAU('esc', 10, 0.5).toFixed(3)} AU (> 1)`);
assert(R.emits.pMan === N, `patrol manualny w vessel:positionUpdate: ${R.emits.pMan}/${N} tików (Finding 273: było 0/200)`);
assert(R.emits.pPoi === N, `patrol POI w vessel:positionUpdate: ${R.emits.pPoi}/${N} tików`);
assert(R.emits.esc  === N, `eskorta w vessel:positionUpdate: ${R.emits.esc}/${N} tików`);
assert(R.emits.ctl === N && R.emits.lead === N,
  `KONTROLA (zielona po obu stronach): moveToPoint ${R.emits.ctl}/${N}, lider eskorty ${R.emits.lead}/${N}`);

header('T2 — BRAK PODWÓJNEGO CAŁKOWANIA: ślad == baseline BAJT W BAJT, wkład _updatePositions = 0');
function traceIdentical(k) {
  const a = BASE?.trace?.[k]; const b = R.trace[k];
  if (!a || !b || a.length !== b.length) return { same: false, firstDiff: -1, maxDelta: NaN };
  let maxDelta = 0, firstDiff = -1;
  for (let i = 0; i < a.length; i++) {
    const same = a[i][0] === b[i][0] && a[i][1] === b[i][1] && a[i][2] === b[i][2];   // === — bez tolerancji
    if (!same) { if (firstDiff < 0) firstDiff = i; maxDelta = Math.max(maxDelta, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1])); }
  }
  return { same: firstDiff < 0, firstDiff, maxDelta };
}
for (const [k, label] of [['pMan', 'patrol manualny'], ['pPoi', 'patrol POI'], ['esc', 'eskorta']]) {
  const r = traceIdentical(k);
  assert(r.same, `${label}: ślad (x, y, wpIdx) × ${N} tików IDENTYCZNY z baseline'em sprzed naprawy` +
    (r.same ? '' : ` — pierwsza różnica w tiku ${r.firstDiff}, max Δ ${r.maxDelta.toExponential(3)} px`));
  assert(R.upContrib[k] === 0, `${label}: wkład _updatePositions w przesunięcie = ${R.upContrib[k]} px (ma być 0 — całkuje TYLKO MOS)`);
}
assert(R.upContrib.ctl > 0 && R.upContrib.lead > 0,
  `KONTROLA instrumentu: dla moveToPoint _updatePositions JEST integratorem (wkład ${(R.upContrib.ctl / AU).toFixed(3)} AU / ${(R.upContrib.lead / AU).toFixed(3)} AU > 0)`);
{
  // Krok per tik patrolu = speedAU × DT: to DODATKOWA kontrola skali, nie zamiennik baseline'u.
  const steps = R.trace.pMan.slice(1).map((r, i) => Math.hypot(r[0] - R.trace.pMan[i][0], r[1] - R.trace.pMan[i][1]) / AU);
  const maxStep = Math.max(...steps);
  assert(maxStep <= 1.0 * DT * 1.000001, `krok patrolu ≤ speedAU×DT = ${(1.0 * DT).toFixed(4)} AU (max zmierzony ${maxStep.toFixed(6)} AU — zdublowanie dałoby ${(2 * DT).toFixed(4)})`);
}

header('T3 — KONTROLA moveToPoint: ślad == baseline, emisja N/N (zielone po obu stronach)');
for (const [k, label] of [['ctl', 'moveToPoint'], ['lead', 'lider eskorty (moveToPoint)']]) {
  const r = traceIdentical(k);
  assert(r.same, `${label}: ślad × ${N} tików IDENTYCZNY z baseline'em` + (r.same ? '' : ` — pierwsza różnica w tiku ${r.firstDiff}`));
}
assert(movedAU('ctl') > 1.9, `moveToPoint przebył ${movedAU('ctl').toFixed(3)} AU w ${N} tikach (oczekiwane ≈ ${(N * DT).toFixed(2)})`);

header('T4 — kadencja waypointów: indeks 0→1 w TYM SAMYM tiku co baseline');
{
  const flipAt = (tr) => tr.findIndex(r => r[2] === 1);
  const mine = flipAt(R.trace.pMan), base = flipAt(BASE?.trace?.pMan ?? []);
  assert(mine > 0 && mine === base, `patrol manualny: waypoint 0→1 w tiku ${mine} (baseline ${base})`);
  const mineP = flipAt(R.trace.pPoi), baseP = flipAt(BASE?.trace?.pPoi ?? []);
  assert(mineP > 0 && mineP === baseP, `patrol POI: waypoint 0→1 w tiku ${mineP} (baseline ${baseP})`);
}

header('T5 — KONSEKWENCJA velocity (podpisana): MOS-owe velocity przeżywa tik; przechwycenie deterministyczne');
{
  const v = S.pMan.velocity;
  const expectVx = 1.0 / CIV;   // patrol leci +x z speedAU=1.0 ⇒ AU/civYear
  assert(!!v && Math.abs(v.vx - expectVx) < 1e-12 && v.vy === 0,
    `po tiku velocity patrolu = (${v?.vx}, ${v?.vy}) AU/civYear — MOS-owe, NIE wyzerowane (oczekiwane (${expectVx}, 0); przed naprawą (0, 0))`);
  const a = R.completedAt.iA, b = R.completedAt.iB;
  assert(a != null && b != null && a === b,
    `przechwycenie patrolującego celu NIEZALEŻNE od kolejności wydania: I_after tik ${a}, I_before tik ${b} (przed naprawą 165 vs 185)`);
  // Kontrola pinu: I_after czytał świeże velocity JUŻ przed naprawą — jego tik przylotu to stała sceny.
  assert(a != null && a < N, `kontrola: I_after przyleciał (tik ${a} < ${N}) — scena nie jest jałowa`);
}

header('T6 — piny ŹRÓDŁOWE (\\s-tolerantne, CRLF-safe)');
{
  const vmSrc = readFileSync(join(SRC, 'systems', 'VesselManager.js'), 'utf8');
  const mosSrc = readFileSync(join(SRC, 'systems', 'MovementOrderSystem.js'), 'utf8');
  const trSrc = readFileSync(join(SRC, 'renderer', 'ThreeRenderer.js'), 'utf8');
  const listRe = /const\s+isOrderControlled\s*=\s*mo\?\.status\s*===\s*'active'\s*&&\s*\(([^;]*?)\)\s*;/;
  const m = vmSrc.match(listRe);
  const list = m ? m[1] : '';
  assert(!!m, 'VesselManager: lista `isOrderControlled` znaleziona');
  assert(/mo\.type\s*===\s*'patrol'/.test(list), "lista `isOrderControlled` zawiera `mo.type === 'patrol'`");
  assert(/mo\.type\s*===\s*'escort'/.test(list), "lista `isOrderControlled` zawiera `mo.type === 'escort'`");
  assert(/mo\.type\s*===\s*'pursue'/.test(list) && /mo\.type\s*===\s*'intercept'/.test(list) && /mo\.type\s*===\s*'engage'/.test(list),
    'lista nadal zawiera pursue/intercept/engage (nic nie wypadło)');
  const patrolTick = mosSrc.match(/_tickPatrolOrder\s*\(vessel,\s*order,\s*dPhysicsYear,\s*gameYear\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\/\*\*/);
  const escortTick = mosSrc.match(/_tickEscortOrder\s*\(vessel,\s*order,\s*dPhysicsYear,\s*gameYear\)\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\/\*\*/);
  assert(!!patrolTick && /vessel\.position\.x\s*\+=/.test(patrolTick[1]), 'całkowanie patrolu ZOSTAJE w MOS._tickPatrolOrder (`position.x +=`)');
  assert(!!escortTick && /vessel\.position\.x\s*\+=/.test(escortTick[1]), 'całkowanie eskorty ZOSTAJE w MOS._tickEscortOrder (`position.x +=`)');
  const subs = (trSrc.match(/EventBus\.on\(\s*'vessel:positionUpdate'/g) ?? []).length;
  assert(subs === 1, `ThreeRenderer subskrybuje vessel:positionUpdate DOKŁADNIE raz (${subs})`);
  assert(/EventBus\.on\(\s*'vessel:positionUpdate'\s*,\s*safe\(\s*\(\s*\{\s*vessels\s*\}\s*\)\s*=>\s*\{\s*this\._syncVesselPositions\(vessels\)/.test(trSrc),
    'subskrypcja deleguje do `_syncVesselPositions(vessels)`');
  assert(/\/\/\s*Brak misji[\s\S]{0,200}?entry\.sprite\.position\.set\(S\(vx\),\s*0\.3,\s*S\(vy\)\)/.test(trSrc),
    'gałąź „Brak misji" w _syncVesselPositions ustawia sprite.position z REALNYCH x/y (tam ląduje patrol/eskorta bez misji)');
}

header('T7 — CANCEL: renderer miał pozycję na bieżąco; po cancelOrder pozycja = ostatni tik (bez skoku)');
{
  const before = { x: S.pMan.position.x, y: S.pMan.position.y };
  assert(R.emits.pMan > 0, `przed anulowaniem renderer dostał ${R.emits.pMan} ładunków pozycji patrolu (przed naprawą 0 ⇒ „teleport" przy Anuluj)`);
  const ok = mos.cancelOrder(S.pMan.id, 'player');
  assert(ok === true, 'cancelOrder zwrócił true');
  assert(S.pMan.position.state === 'orbiting' && S.pMan.position.dockedAt == null,
    `po anulowaniu: state=${S.pMan.position.state} dockedAt=${S.pMan.position.dockedAt} (wolny dryf — gałąź _tickOrbitingVessels)`);
  assert(S.pMan.position.x === before.x && S.pMan.position.y === before.y,
    'KONTROLA (obie strony): symulacja NIE skacze przy anulowaniu — pozycja bajt w bajt jak po ostatnim tiku');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
