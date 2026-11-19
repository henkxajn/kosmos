// KOSMOS — keeper CS-PHYS-c część B (Finding 776, plan COLONY_SPHERE §3.9.3): przemiatane progi zbliżenia.
//
// S1  matematyka: closestApproach (ruch względny jednostajny, t ∈ [0, 1]), segmentPointDistance
// S2  ProximitySystem._tick WYKONANY: dwa statki różnych frakcji mijają się w jednym tiku w układzie M (k = 0.2) —
//     wejście w walkę (z przemiatania), sensor-lock, wykrycie; strony cofnięte do punktu największego zbliżenia
//     (czerwone na bazie 98f7316)
// S3  kontrole (zielone po obu stronach): flaga OFF = brak zdarzenia i pozycje nietknięte; świat dotychczasowy k = 1 —
//     wejście punktowe z tym samym ładunkiem co dotąd (bez pola `swept`, bez cofania) i w tym samym tiku podejścia;
//     wykluczenia ze świadkiem: teleport (skok > największy przelot w dt tiku), zmiana układu między tikami, brak próbki
// S4  ta sama frakcja: zdarzenie z przemiatania (VCS je odrzuca), ale BEZ cofania pozycji
// S5  MovementOrderSystem._moveTowardsAndMaybeComplete WYKONANY: krok przechwytu przechodzący przez próg celu kończy
//     rozkaz (czerwone na bazie); kontrola: flaga OFF i zwykłe dojście do celu. Długi tik: krok kończy się w punkcie
//     przechwytu, cel przelatuje przez niego później w tym samym tiku — przemiatanie poprzedniego kroku względem
//     rzeczywistego ruchu celu kończy rozkaz (czerwone na drzewie z limitem 1 AU); wykluczenia: teleport celu, statek
//     przesunięty poza MOS, odcinek celu z pozycji z POCZĄTKU tiku (_tickStartTargetPos), nie bieżącej
// S6  kontrola właściciela (CS-PHYS-c, 2026-11-19): długi tik przy 1 r/s — krok 1.8 AU na statek (> dawny stały limit
//     1 AU) — walka z przemiatania i cofnięcie, k = 1 i k = 0.2 (czerwone na drzewie z limitem 1 AU); prawdziwy teleport
//     nadal pomija przemiatanie: ten sam skok w krótkim tiku, skok dłuższy niż przelot w długim tiku, przylot warp
//     (systemId), zmiana układu; mnożnik prędkości z tech podnosi granicę; statek na orbicie jedzie z ciałem (ruch ciała
//     nie jest teleportem); diagnostyka `_sweepWatch` (powody: teleportGuard / systemChanged / noPrevSample) i
//     `summarizeSweep` z csCollisionTest
import '../headless/env.js';           // MUSI być pierwszy (window, Math.random = seeded)
import { readFileSync } from 'node:fs';

const { GAME_CONFIG }   = await import('../../config/GameConfig.js');
const EventBus          = (await import('../../core/EventBus.js')).default;
const EntityManager     = (await import('../../core/EntityManager.js')).default;
const { Star }          = await import('../../entities/Star.js');
const { createVessel }  = await import('../../entities/Vessel.js');
const PS                = await import('../../systems/ProximitySystem.js');
const { MovementOrderSystem } = await import('../../systems/MovementOrderSystem.js');
const SW = await import('../../utils/SweptProximity.js').catch(() => ({}));   // nowy moduł — fail-first nie przerywa

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
const safe = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const quietly = (fn) => { const o = console.log, w = console.warn; console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = o; console.warn = w; } };
const withFlags = (flags, fn) => {
  const prev = {}; for (const k of Object.keys(flags)) { prev[k] = GAME_CONFIG.FEATURES[k]; GAME_CONFIG.FEATURES[k] = flags[k]; }
  try { return fn(); } finally { for (const k of Object.keys(flags)) GAME_CONFIG.FEATURES[k] = prev[k]; }
};
const AU = GAME_CONFIG.AU_TO_PX;
const CIV = GAME_CONFIG.CIV_TIME_SCALE;   // civDy / rok fizyki (ProximitySystem._tick dostaje civDy)
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ── S1 matematyka ───────────────────────────────────────────────────────────
console.log('\n── S1 matematyka przemiatania ──');
{
  const ca = (a0, a1, b0, b1) => safe(() => SW.closestApproach(a0, a1, b0, b1), null);
  const head = ca({ x: -1, y: 0.1 }, { x: 1, y: 0.1 }, { x: 1, y: -0.1 }, { x: -1, y: -0.1 });
  assert(head && near(head.dist, 0.2) && near(head.t, 0.5) && near(head.a.x, 0) && near(head.b.x, 0), `mijanka czołowa: zbliżenie 0.2 w t = 0.5 (${head?.dist}, t ${head?.t})`);
  const app = ca({ x: -1, y: 0 }, { x: -0.5, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 0 });
  assert(app && near(app.dist, 1) && app.t === 1, 'zbliżanie bez mijania: minimum w końcu odcinka (= test punktowy)');
  const rec = ca({ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 });
  assert(rec && near(rec.dist, 0.5) && rec.t === 0, 'oddalanie: minimum na początku odcinka');
  const still = ca({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 });
  assert(still && near(still.dist, 5) && still.t === 0, 'bez ruchu: odległość punktowa');
  const sp = (p0, p1, q) => safe(() => SW.segmentPointDistance(p0, p1, q), NaN);
  assert(near(sp({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 0.2 }), 0.2) && near(sp({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), 1)
    && near(sp({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }), 1), 'segmentPointDistance: środek / za końcem / odcinek zerowy');
}

// ── świat testu: układ M (k = 0.2) i kontrola dotychczasowa (k = 1) ─────────
EntityManager.clear();
globalThis.window.KOSMOS.starSystemManager = null;
for (const [sysId, stamped] of [['sys_m', true], ['sys_leg', false]]) {
  const st = new Star({ id: `star_${sysId}`, name: sysId, spectralType: 'M', mass: 0.4, luminosity: 0.027, ...(stamped ? { orbitModel: 2 } : {}) });
  st.systemId = sysId; EntityManager.add(st);
}
let seq = 0;
const ship = (sysId, owner, x, y) => {
  const v = createVessel('hull_small', 'col_test', { modules: ['engine_ion', 'weapon_kinetic'], x: x * AU, y: y * AU });
  v.id = `v776_${++seq}`; v.systemId = sysId; v.ownerEmpireId = owner; v.owner = owner;
  Object.assign(v.position, { x: x * AU, y: y * AU, state: 'in_transit', dockedAt: null });
  return v;
};
// dt tiku ZGODNY z ruchem: krok stepAU statku hull_small + engine_ion (speedAU) → civDy (granica skoku liczy się z dt)
const SPEED = ship('sys_leg', 'player', 0, 0).speedAU;
const civFor = (stepAU) => stepAU / SPEED * CIV;
const listen = () => {
  const ev = [];
  const names = ['vessel:combatRangeEnter', 'vessel:sensorLockEnter', 'vessel:proximityEnter'];
  const fns = names.map((n) => { const f = (e) => ev.push({ n, e }); EventBus.on(n, f); return [n, f]; });
  return { ev, off: () => fns.forEach(([n, f]) => EventBus.off(n, f)), of: (n) => ev.filter((x) => x.n === `vessel:${n}`) };
};
// Dwa tiki: pozycje start → koniec (w AU); zwraca zdarzenia i pozycje po drugim tiku. civ = dt obu tików (domyślnie
// zgodny z krokiem 0.16 AU geometrii PASS — skok dłuższy niż przelot w tym dt to teleport); tech = mnożnik prędkości;
// watch = wpisy obserwacji pary (_sweepWatch) — powody pominięcia przemiatania
function run2(sysA, sysB, ownerB, p0, p1, { sysA2 = sysA, civ = civFor(0.16), tech = null } = {}) {
  const A = ship(sysA, 'player', p0.a.x, p0.a.y), B = ship(sysB, ownerB, p0.b.x, p0.b.y);
  const ps = new PS.ProximitySystem({ _vessels: new Map([[A.id, A], [B.id, B]]) });
  const watch = []; ps._sweepWatch = new Map([[PS.pairKey(A.id, B.id), watch]]);
  const K = globalThis.window.KOSMOS, prevTech = K.techSystem;
  if (tech != null) K.techSystem = { getShipSpeedMultiplier: () => tech };
  try {
    quietly(() => ps._tick(civ));
    A.position.x = p1.a.x * AU; A.position.y = p1.a.y * AU; B.position.x = p1.b.x * AU; B.position.y = p1.b.y * AU; A.systemId = sysA2;
    const L = listen();
    quietly(() => ps._tick(civ));
    L.off();
    safe(() => ps.destroy());
    return { L, A, B, watch, dAU: Math.hypot(A.position.x - B.position.x, A.position.y - B.position.y) / AU };
  } finally { K.techSystem = prevTech; }
}
// Mijanka: przesunięcie boczne 0.02 AU (< próg walki 0.0315 AU przy k = 0.2), skok 0.16 AU na tik (względny 0.32 AU)
const PASS0 = { a: { x: -0.08, y: 0.01 }, b: { x: 0.08, y: -0.01 } }, PASS1 = { a: { x: 0.08, y: 0.01 }, b: { x: -0.08, y: -0.01 } };

// ── S2 mijanka w układzie M ─────────────────────────────────────────────────
console.log('\n── S2 mijanka między tikami w układzie M (k = 0.2) ──');
{
  const enterM = safe(() => PS.combatEnterAUOf(ship('sys_m', 'player', 0, 0), ship('sys_m', 'emp_x', 0, 0)), 0.0315);
  console.log(`  (próg wejścia w walkę k = 0.2: ${enterM.toFixed(4)} AU; odległość w obu próbkach 0.1612 AU; zbliżenie 0.02 AU)`);
  assert(near(enterM, 0.15 * 1.05 * 0.2, 1e-12), 'świadek: próg walki pary = max(0.15·k, zasięg kinetyka × 1.05 × k)');
  const r = run2('sys_m', 'sys_m', 'emp_x', PASS0, PASS1);
  const c = r.L.of('combatRangeEnter');
  assert(c.length === 1, `wejście w walkę mimo próbek poza progiem (zdarzeń ${c.length}) — Finding 776`);
  assert(c[0]?.e?.swept === true && near(c[0]?.e?.distanceAU ?? NaN, 0.02, 1e-9) && c[0]?.e?.sameFaction === false,
    `ładunek: swept, odległość = zbliżenie ${c[0]?.e?.distanceAU}`);
  assert(near(r.dAU, 0.02, 1e-9) && near(r.A.position.x, 0) && near(r.B.position.x, 0),
    `strony cofnięte do punktu zbliżenia (odległość ${r.dAU.toFixed(4)} AU ≤ zasięg broni — DSCS nie odmówi startu)`);
  assert(r.L.of('sensorLockEnter').length === 1 && r.L.of('sensorLockEnter')[0].e.swept === true, 'sensor-lock z przemiatania (0.06 AU × … > zbliżenie)');
  assert(r.L.of('proximityEnter').length === 1 && r.L.of('proximityEnter')[0].e.swept === true, 'wykrycie z przemiatania');
}

// ── S3 kontrole ─────────────────────────────────────────────────────────────
console.log('\n── S3 kontrole i wykluczenia ──');
{
  const off = withFlags({ sweptProximity: false }, () => run2('sys_m', 'sys_m', 'emp_x', PASS0, PASS1));
  assert(off.L.ev.length === 0 && near(off.A.position.x, 0.08 * AU) && near(off.B.position.x, -0.08 * AU),
    'KONTROLA flaga OFF: brak zdarzeń, pozycje nietknięte (zachowanie sprzed zmiany)');
  // Świat dotychczasowy: koniec tiku 0.1 AU od siebie (< 0.15) — wejście punktowe jak dotąd
  const leg = run2('sys_leg', 'sys_leg', 'emp_x', { a: { x: -0.3, y: 0 }, b: { x: 0.3, y: 0 } }, { a: { x: -0.05, y: 0 }, b: { x: 0.05, y: 0 } });
  const lc = leg.L.of('combatRangeEnter');
  assert(lc.length === 1 && !('swept' in lc[0].e) && near(lc[0].e.distanceAU, 0.1, 1e-9) && near(leg.A.position.x, -0.05 * AU) && near(leg.B.position.x, 0.05 * AU),
    'KONTROLA k = 1: wejście punktowe — ładunek bez pola swept, odległość końcowa 0.1 AU, pozycje nietknięte');
  // Podejście czołowe krokami 60 fps przy 1 r/s (speedAU / 60 na statek, dt 1/60 roku): tik wejścia ten sam co przy OFF
  const approachTick = (flag) => withFlags({ sweptProximity: flag }, () => {
    const A = ship('sys_leg', 'player', -0.5, 0.05), B = ship('sys_leg', 'emp_x', 0.5, -0.05);
    const ps = new PS.ProximitySystem({ _vessels: new Map([[A.id, A], [B.id, B]]) });
    let hit = -1; const f = () => { if (hit < 0) hit = i; }; let i = 0;
    EventBus.on('vessel:combatRangeEnter', f);
    for (i = 0; i < 40 && hit < 0; i++) { A.position.x += SPEED / 60 * AU; B.position.x -= SPEED / 60 * AU; quietly(() => ps._tick(CIV / 60)); }
    EventBus.off('vessel:combatRangeEnter', f); safe(() => ps.destroy());
    return hit;
  });
  const tOn = approachTick(true), tOff = approachTick(false);
  assert(tOn >= 0 && tOn === tOff, `KONTROLA k = 1, podejście czołowe 60 fps: wejście w tym samym tiku (ON ${tOn}, OFF ${tOff})`);
  // Wykluczenia (świadek = S2: ta sama geometria z krótkim skokiem łapie)
  const tele = run2('sys_m', 'sys_m', 'emp_x', { a: { x: -0.6, y: 0.01 }, b: { x: 0.6, y: -0.01 } }, { a: { x: 0.6, y: 0.01 }, b: { x: -0.6, y: -0.01 } });
  assert(tele.L.of('combatRangeEnter').length === 0, 'teleport (skok 1.2 AU w tiku, w którym statek przelatuje najwyżej ~0.29 AU): bez przemiatania');
  // teleport TYLKO jednego statku (drugi leci krótko) — każdy z dwóch warunków skoku osobno
  const teleA = run2('sys_m', 'sys_m', 'emp_x', { a: { x: -1.5, y: 0.01 }, b: { x: 0.08, y: -0.01 } }, { a: { x: 0.08, y: 0.01 }, b: { x: -0.08, y: -0.01 } });
  const teleB = run2('sys_m', 'sys_m', 'emp_x', { a: { x: -0.08, y: 0.01 }, b: { x: 1.5, y: -0.01 } }, { a: { x: 0.08, y: 0.01 }, b: { x: -0.08, y: -0.01 } });
  assert(teleA.L.of('combatRangeEnter').length === 0 && teleB.L.of('combatRangeEnter').length === 0, 'teleport jednego statku (A albo B, skok 1.58 AU): bez przemiatania');
  const jump = run2('sys_x', 'sys_m', 'emp_x', PASS0, PASS1, { sysA2: 'sys_m' });
  assert(jump.L.of('combatRangeEnter').length === 0, 'zmiana układu między tikami: bez przemiatania');
  const first = (() => {
    const A = ship('sys_m', 'player', 0.08, 0.01), B = ship('sys_m', 'emp_x', -0.08, -0.01);
    const ps = new PS.ProximitySystem({ _vessels: new Map([[A.id, A], [B.id, B]]) });
    const L = listen(); quietly(() => ps._tick(0.01)); L.off(); safe(() => ps.destroy()); return L.ev.length;
  })();
  assert(first === 0, 'pierwszy tik (brak próbki początku): tylko test punktowy');
}

// ── S4 ta sama frakcja ──────────────────────────────────────────────────────
console.log('\n── S4 ta sama frakcja: zdarzenie bez cofania ──');
{
  const r = run2('sys_m', 'sys_m', 'player', PASS0, PASS1);
  const c = r.L.of('combatRangeEnter');
  assert(c.length === 1 && c[0].e.sameFaction === true && c[0].e.swept === true, 'zdarzenie z przemiatania (sameFaction — VesselCombatSystem je odrzuca)');
  assert(near(r.A.position.x, 0.08 * AU) && near(r.B.position.x, -0.08 * AU), 'pozycje statków tej samej frakcji NIE cofnięte');
}

// ── S5 MovementOrderSystem — krok przechwytu ────────────────────────────────
console.log('\n── S5 MovementOrderSystem: krok przechodzi przez próg celu ──');
{
  const step = (flag, from, ip, target) => withFlags({ sweptProximity: flag }, () => {
    let done = 0;
    const self = Object.create(MovementOrderSystem.prototype);
    self._completeOrder = () => { done++; };
    const v = { id: 'v776_mos', systemId: 'sys_leg', speedAU: 1.4, position: { x: from.x * AU, y: from.y * AU, state: 'in_transit' }, velocity: null };
    safe(() => MovementOrderSystem.prototype._moveTowardsAndMaybeComplete.call(self, v, { id: 'o1', type: 'intercept' }, ip.x * AU, ip.y * AU, 1, 100,
      { id: 'tgt', position: { x: target.x * AU, y: target.y * AU } }));
    return done;
  });
  // start (0,0) → punkt przechwytu (0.6,0); cel (0.3, 0.02): przed i po kroku 0.30 AU (> 0.15), krok mija cel o 0.02 AU
  assert(step(true, { x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.3, y: 0.02 }) === 1, 'krok przez próg celu kończy przechwyt (Finding 776)');
  assert(step(false, { x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.3, y: 0.02 }) === 0, 'KONTROLA flaga OFF: jak dotąd (tylko pozycja końcowa)');
  assert(step(true, { x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.02 }) === 1 && step(false, { x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 0.02 }) === 1,
    'KONTROLA: zwykłe dojście do celu kończy rozkaz przy obu ustawieniach');
  assert(step(true, { x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.3, y: 0.4 }) === 0, 'wykluczenie (świadek wyżej): cel daleko od kroku — rozkaz trwa');

  // Długi tik (dt 1 rok): tik 1 — krok 1.5 AU kończy się w punkcie przechwytu (1.5, 0), cel jeszcze w (3, 0.02);
  // potem cel (misja) przelatuje w tym samym tiku do tgNow; tik 2 — przemiatanie poprzedniego kroku.
  const longTick = (flag, { tgNow = { x: 0.5, y: 0.02 }, snap = null, moveVessel = false } = {}) => withFlags({ sweptProximity: flag }, () => {
    let done = 0;
    const self = Object.create(MovementOrderSystem.prototype);
    self._completeOrder = () => { done++; };
    self._sweepPrev = new WeakMap();
    const v = { id: 'v776_lt', systemId: 'sys_leg', speedAU: SPEED, position: { x: 0, y: 0, state: 'in_transit' }, velocity: null };
    const tgt = { id: 'tgt_lt', systemId: 'sys_leg', speedAU: SPEED, position: { x: 3 * AU, y: 0.02 * AU, state: 'in_transit', dockedAt: null } };
    const order = { id: 'o_lt', type: 'intercept' };
    const mv = () => safe(() => MovementOrderSystem.prototype._moveTowardsAndMaybeComplete.call(self, v, order, 1.5 * AU, 0, 1.0, 100, tgt));
    mv();
    const after1 = { x: v.position.x / AU, done };
    Object.assign(tgt.position, { x: tgNow.x * AU, y: tgNow.y * AU });
    if (moveVessel) v.position.y += 0.5 * AU;
    if (snap) self._tickStartTargetPos = new Map([[tgt, { x: snap.x * AU, y: snap.y * AU }]]);
    mv();
    return { done, after1 };
  });
  const lt = longTick(true);
  assert(near(lt.after1.x, 1.5, 1e-9) && lt.after1.done === 0, `świadek: tik 1 kończy krok w punkcie przechwytu bez zakończenia (x ${lt.after1.x})`);
  assert(lt.done === 1, 'długi tik: cel przeleciał przez punkt przechwytu w tym samym tiku — przechwyt zakończony (przemiatanie poprzedniego kroku)');
  assert(longTick(false).done === 0, 'KONTROLA flaga OFF: jak dotąd — rozkaz trwa (pościg za odlatującym celem)');
  assert(longTick(true, { tgNow: { x: -8, y: 0.02 } }).done === 0, 'wykluczenie: skok celu 11 AU > największy przelot w dt (teleport) — bez przemiatania');
  assert(longTick(true, { moveVessel: true }).done === 0, 'wykluczenie: statek przesunięty poza MOS od poprzedniego kroku — bez przemiatania');
  assert(longTick(true, { snap: { x: 2.9, y: 0.02 } }).done === 0,
    'odcinek celu z pozycji z POCZĄTKU tiku (_tickStartTargetPos 2.9 AU — cel jeszcze nie minął), nie z bieżącej (0.5 AU)');
}

// ── S6 długi tik (kontrola właściciela) ─────────────────────────────────────
console.log('\n── S6 długi tik przy 1 r/s: krok > 1 AU na statek ──');
{
  // Geometria kontroli właściciela: k = 1, próg 0.1575 AU, przesunięcie boczne 0.1418 AU; krok 1.8 AU na statek (tik ~0.72 s)
  const P0 = { a: { x: -1.1, y: 0.0709 }, b: { x: 1.1, y: -0.0709 } }, P1 = { a: { x: 0.7, y: 0.0709 }, b: { x: -0.7, y: -0.0709 } };
  const civLong = civFor(1.8);
  console.log(`  (speedAU ${SPEED.toFixed(4)} AU/rok; krok 1.8 AU = dt ${(1.8 / SPEED).toFixed(3)} roku; próbki końcowe 1.4 AU od siebie)`);
  const r = run2('sys_leg', 'sys_leg', 'emp_x', P0, P1, { civ: civLong });
  const c = r.L.of('combatRangeEnter');
  assert(c.length === 1 && c[0].e.swept === true && near(c[0].e.distanceAU, 0.1418, 1e-9),
    `k = 1: krok 1.8 AU (> dawny limit 1 AU) — walka z przemiatania, zbliżenie ${c[0]?.e?.distanceAU} AU`);
  assert(near(r.A.position.x, 0, 1e-6) && near(r.B.position.x, 0, 1e-6), 'strony cofnięte do punktu zbliżenia (x = 0, 0.9 AU wstecz po torze)');
  const rm = run2('sys_m', 'sys_m', 'emp_x', { a: { x: -1.1, y: 0.01 }, b: { x: 1.1, y: -0.01 } }, { a: { x: 0.7, y: 0.01 }, b: { x: -0.7, y: -0.01 } }, { civ: civLong });
  assert(rm.L.of('combatRangeEnter').length === 1 && rm.L.of('combatRangeEnter')[0].e.swept === true && near(rm.dAU, 0.02, 1e-9),
    'k = 0.2: ten sam długi tik — walka z przemiatania, cofnięcie do zbliżenia 0.02 AU');
  const sweptEntry = r.watch.find((e) => Number.isFinite(e.distAU));
  assert(sweptEntry && near(sweptEntry.stepAU, 1.8, 1e-9), `diagnostyka: wpis przemiatania z krokiem statku ${sweptEntry?.stepAU} AU`);

  // Prawdziwe teleporty nadal pomijają przemiatanie (świadek: wyżej ta sama geometria łapie)
  const short = run2('sys_leg', 'sys_leg', 'emp_x', P0, P1, { civ: CIV / 60 });
  const sk = short.watch.find((e) => e.skip === 'teleportGuard');
  assert(short.L.of('combatRangeEnter').length === 0, 'KONTROLA: ten sam skok 1.8 AU w krótkim tiku (1/60 roku) — teleport, bez walki');
  assert(sk && near(sk.stepAU, 1.8, 1e-9) && sk.maxStepAU < 0.2, `diagnostyka: teleportGuard, skok 1.8 AU > przelot ${sk?.maxStepAU?.toFixed(3)} AU`);
  const far = run2('sys_leg', 'sys_leg', 'emp_x', { a: { x: -3, y: 0.0709 }, b: { x: 3, y: -0.0709 } }, { a: { x: 3, y: 0.0709 }, b: { x: -3, y: -0.0709 } }, { civ: civLong });
  assert(far.L.of('combatRangeEnter').length === 0, 'KONTROLA: długi tik, skok 6 AU > największy przelot (1.8 × 1.5 + 0.05 AU) — bez walki');
  assert(far.watch.some((e) => e.skip === 'teleportGuard'), 'diagnostyka: skok 6 AU = teleportGuard');
  const warp = run2(null, 'sys_leg', 'emp_x', P0, P1, { sysA2: 'sys_leg', civ: civLong });
  assert(warp.L.of('combatRangeEnter').length === 0, 'KONTROLA: przylot warp przy długim tiku (statek w skoku, systemId null → układ) — bez walki');
  assert(warp.watch.some((e) => e.skip === 'systemChanged'), 'diagnostyka: przylot warp = systemChanged');
  const jump = run2('sys_x', 'sys_leg', 'emp_x', P0, P1, { sysA2: 'sys_leg', civ: civLong });
  assert(jump.L.of('combatRangeEnter').length === 0, 'zmiana układu przy długim tiku: bez walki');
  assert(r.watch.some((e) => e.skip === 'noPrevSample') && short.watch.some((e) => e.skip === 'noPrevSample'),
    'diagnostyka: pierwszy tik pary = noPrevSample');

  // Przejście PRZED ruchem: ruch policzony dt poprzedniej klatki (długiej), a bieżące wywołanie ma krótkie dt — granica
  // z większego z dwóch (inaczej zwykły lot z długiej klatki wyglądałby na teleport)
  const prevDt = (() => {
    const A = ship('sys_leg', 'player', P0.a.x, P0.a.y), B = ship('sys_leg', 'emp_x', P0.b.x, P0.b.y);
    const ps = new PS.ProximitySystem({ _vessels: new Map([[A.id, A], [B.id, B]]) });
    quietly(() => ps._tick(civLong));
    A.position.x = P1.a.x * AU; B.position.x = P1.b.x * AU;
    const L = listen(); quietly(() => ps._tick(CIV / 60)); L.off(); safe(() => ps.destroy());
    return L.of('combatRangeEnter').length;
  })();
  assert(prevDt === 1, 'ruch z długiej klatki widziany w krótkim wywołaniu: granica z dt poprzedniego wywołania — walka');

  // Mnożnik prędkości z tech podnosi granicę: skok 1.8 AU w dt przelotu 0.6 AU (granica 0.95 AU; × tech 3 → 2.75 AU)
  const noTech = run2('sys_leg', 'sys_leg', 'emp_x', P0, P1, { civ: civFor(0.6) });
  const withTech = run2('sys_leg', 'sys_leg', 'emp_x', P0, P1, { civ: civFor(0.6), tech: 3 });
  assert(noTech.L.of('combatRangeEnter').length === 0 && withTech.L.of('combatRangeEnter').length === 1,
    `mnożnik prędkości tech ×3: skok 1.8 AU to lot, nie teleport (bez tech ${noTech.L.of('combatRangeEnter').length}, z tech ${withTech.L.of('combatRangeEnter').length})`);

  // Statek na orbicie ciała jedzie z ciałem: ciało przesuwa się o 1 AU w krótkim tiku (przelot własny ≤ 0.11 AU)
  const carry = (attached) => {
    const pl = { id: `pl776_${attached ? 'a' : 'b'}`, type: 'planet', name: 'pl776', systemId: 'sys_leg', x: -0.5 * AU, y: 0 };
    EntityManager.add(pl);
    const A = ship('sys_leg', 'player', -0.5, 0.02), B = ship('sys_leg', 'emp_x', 0, -0.05);
    if (attached) Object.assign(A.position, { state: 'orbiting', dockedAt: pl.id });
    const ps = new PS.ProximitySystem({ _vessels: new Map([[A.id, A], [B.id, B]]) });
    const watch = []; ps._sweepWatch = new Map([[PS.pairKey(A.id, B.id), watch]]);
    quietly(() => ps._tick(CIV / 60));
    pl.x = 0.5 * AU; A.position.x = 0.5 * AU;               // ciało i statek przy nim: +1 AU
    const L = listen(); quietly(() => ps._tick(CIV / 60)); L.off();
    safe(() => EntityManager.remove(pl.id));
    return { n: L.of('combatRangeEnter').length, watch };
  };
  const ca = carry(true), cb = carry(false);
  assert(ca.n === 1 && !ca.watch.some((e) => e.skip === 'teleportGuard'),
    'statek na orbicie: ruch ciała (1 AU w krótkim tiku) to nie teleport — przemiatanie łapie mijankę (zbliżenie 0.07 AU)');
  assert(cb.n === 0 && cb.watch.some((e) => e.skip === 'teleportGuard'), 'świadek: ten sam skok bez ciała (wolny lot) = teleportGuard');

  // csCollisionTest — podsumowanie obserwacji (powód pominięcia przemiatania w odczycie)
  const CT = await import('../../debug/CollisionTestDebug.js').catch(() => ({}));
  const sum = safe(() => CT.summarizeSweep([{ skip: 'noPrevSample' }, { skip: 'noPrevSample' }, { skip: 'teleportGuard', stepAU: 1.8, maxStepAU: 1 }]), null);
  assert(sum && sum.main === 'teleportGuard' && sum.sweepSkips.teleportGuard === 1 && sum.sweepSkips.noPrevSample === 2 && near(sum.maxStepAU, 1.8) && sum.stepLimitAU === 1,
    `csCollisionTest: sweptSkip = najczęstszy powód poza noPrevSample (${sum?.main})`);
  const sum2 = safe(() => CT.summarizeSweep([{ skip: 'noPrevSample' }, { distAU: 0.3, stepAU: 0.4 }]), null);
  assert(sum2 && sum2.main === null && near(sum2.minSweptAU, 0.3), 'csCollisionTest: przemiatanie liczone (zbliżenie poza progiem) — sweptSkip null, minSweptAU');
}

// ── piny źródła ─────────────────────────────────────────────────────────────
console.log('\n── piny źródła ──');
{
  const ps = src('../../systems/ProximitySystem.js');
  assert(/const nearAU = swept \? Math\.min\(distAU, swept\.distAU\) : distAU;/.test(ps) && /if \(!isCombatRefreshed && nearAU < combatEnterAU\)/.test(ps)
    && /else if \(isCombatRefreshed && distAU >= combatExitAU\)/.test(ps), 'pin: wejścia z zbliżenia przemiatanego, wyjścia (histereza) dalej z pozycji końcowej');
  assert(/if \(!GAME_CONFIG\.FEATURES\?\.sweptProximity\) return (null|\{ skip: 'flagOff' \});/.test(ps) && GAME_CONFIG.FEATURES.sweptProximity === true, 'pin: flaga sweptProximity (domyślnie ON)');
  assert(/this\._samplePositions\(vessels\);\n  \}/.test(ps), 'pin: próbki pozycji zapisywane na końcu tiku');
  assert(!/SWEEP_MAX_STEP_AU/.test(ps) && /this\._sweepDtYears = Math\.max\(civDy, this\._lastCivDy \?\? 0\) \/ CIV_TIME_SCALE;/.test(ps),
    'pin: bez stałego limitu skoku — granica z dt tiku (większy z bieżącego i poprzedniego wywołania)');
  // MOS._tick WYKONANY na atrapie: pozycje celów pościgu/przechwytu zapisane PRZED pętlą rozkazów
  const tgt = { id: 'tgt_snap', position: { x: 7 * AU, y: 1 * AU } };
  const self = Object.create(MovementOrderSystem.prototype);
  Object.assign(self, { _byVessel: new Map([['v_gone', { id: 'o_s', type: 'intercept', status: 'active', targetEntityId: 'tgt_snap' }]]),
    _resolveTarget: () => tgt, _vm: { getVessel: () => null }, _lastTickYear: null, _pendingRelease: new Set() });
  quietly(() => safe(() => MovementOrderSystem.prototype._tick.call(self, 1)));
  const snap = self._tickStartTargetPos?.get?.(tgt);
  assert(snap && near(snap.x, 7 * AU) && near(snap.y, 1 * AU), 'MOS._tick: pozycja celu z początku tiku zapisana przed ruchem (_tickStartTargetPos)');
  const gs = src('../../scenes/GameScene.js'), csd = src('../../debug/ColonySphereDebug.js');
  assert(/window\.csCollisionTestLowFps = window\.KOSMOS\.debug\?\.csCollisionTestLowFps;/.test(gs) && /csCollisionTest, csCollisionTestLowFps \}/.test(csd),
    'pin: csCollisionTestLowFps() bez argumentów (debug + alias w GameScene)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
