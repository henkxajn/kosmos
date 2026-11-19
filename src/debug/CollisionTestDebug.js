// KOSMOS — CS-PHYS-c (Finding 776): csCollisionTest() / csCollisionTestLowFps() — kontrola właściciela przemiatanego
// wejścia w walkę.
//
// Wywołanie bez argumentów i bez cudzysłowów: `csCollisionTest()` albo `csCollisionTestLowFps()`. Na TESTOWEJ grze,
// w oglądanym układzie:
//   1. pauza, dwa uzbrojone kadłuby hull_small (hull_small + engine_ion ≈ 2.5 AU/rok): statek gracza i statek imperium
//      AI, naprzeciw siebie w wolnym miejscu, z przesunięciem bocznym 0.9 × próg wejścia w walkę (mijanka „po cięciwie” —
//      próbka punktowa co klatkę łatwo ją przeskakuje przy 1 r/s);
//   2. rozkaz lotu każdego na wylot za drugiego, czas 1 r/s (automatyczne zwalnianie wyłączone na czas testu);
//   3. odczyt: czy walka wystartowała, czym (przemiatanie / punkt), gdzie, najmniejsza odległość z próbek klatek, a gdy
//      walki nie było — DLACZEGO przemiatanie nie zadziałało (`sweptSkip`: flagOff / noPrevSample / systemChanged /
//      teleportGuard / noProximitySystem; `sweepSkips` = liczba wywołań z każdym powodem);
//   4. sprzątanie: prędkość czasu i automatyczne zwalnianie wracają; po końcu bitwy (albo od razu, gdy walki nie było)
//      oba statki testu (także wraki) są zdejmowane, gra zostaje na pauzie.
// csCollisionTestLowFps — ten sam scenariusz z WYMUSZONYMI DŁUGIMI TIKAMI (przycięcie): gra dostaje czas klatek w paczkach
// po `tickMs`, dobranych tak, by każdy statek przeleciał LOW_FPS_STEP_AU na tik — tyle, ile zmierzyła kontrola właściciela
// (6 klatek w ~1 s testu, w tym jedno przycięcie ~0.72 s: krok ≥ 1.79 AU na statek, ponad dawny stały limit 1 AU).
// Równe 6 fps (krok 0.42 AU) nie odtwarza tego przypadku — limit 1 AU przepuszczał taki krok.
// ⚠ Cheat debug (statek AI tworzony jak w `cvBattle`, z pominięciem `createAIVessel` — tylko do sesji testowej).
import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { systemScaleOf } from '../utils/SystemScale.js';
import { combatEnterAUOf, pairKey } from '../systems/ProximitySystem.js';
import { cvBattleCenter } from './CvBattleStager.js';

export const CS_COLLISION_TEST = Object.freeze({
  HULL: 'hull_small',
  MODULES: ['engine_ion', 'weapon_kinetic'],
  LATERAL_OF_ENTER: 0.9,      // bezwymiarowe — przesunięcie boczne torów / próg wejścia w walkę
  START_GAP_OF_ENTER: 14,     // bezwymiarowe — odległość startowa / próg wejścia (min START_GAP_MIN_AU)
  START_GAP_MIN_AU: 0.3,      // AU
  OVERSHOOT_AU: 0.5,          // AU — cel lotu za drugim statkiem
  TIMEOUT_MS: 8000,           // ms czasu realnego — limit oczekiwania na mijankę
  BATTLE_WAIT_MS: 120000,     // ms czasu realnego — limit oczekiwania na koniec bitwy przed sprzątaniem
  LOW_FPS_STEP_AU: 1.8,       // AU — krok statku na wymuszony tik w csCollisionTestLowFps (zmierzone przycięcie właściciela)
  PLACE_TRIES: 12,            // liczba ziaren miejsca mijanki do sprawdzenia (szukamy torów bez omijania ciał)
});

let _running = false;

function pickAiEmpire(K) {
  const all = (K.empireRegistry?.listAll?.() ?? []).filter((e) => e?.id && e.id !== 'player');
  return all.find((e) => K.directorProduction?.capitalOf?.(e.id)) ?? all[0] ?? null;
}

/** Podsumowanie wpisów obserwacji pary z ProximitySystem (`_sweepWatch`): liczby powodów pominięcia, kroki, zbliżenia. */
export function summarizeSweep(entries) {
  const sweepSkips = {};
  let maxStepAU = 0, minSweptAU = Infinity, stepLimitAU = null;
  for (const e of entries) {
    if (e.skip) sweepSkips[e.skip] = (sweepSkips[e.skip] ?? 0) + 1;
    if (Number.isFinite(e.stepAU) && e.stepAU > maxStepAU) maxStepAU = e.stepAU;
    if (e.skip === 'teleportGuard' && Number.isFinite(e.maxStepAU)) stepLimitAU = e.maxStepAU;
    if (Number.isFinite(e.distAU) && e.distAU < minSweptAU) minSweptAU = e.distAU;
  }
  // Powód „najważniejszy”: najczęstszy poza noPrevSample (pierwszy tik każdej pary go ma zawsze)
  const ranked = Object.entries(sweepSkips).filter(([k]) => k !== 'noPrevSample').sort((a, b) => b[1] - a[1]);
  const main = ranked[0]?.[0] ?? (entries.some((e) => !e.skip) ? null : (sweepSkips.noPrevSample ? 'noPrevSample' : null));
  return { sweepSkips, main, maxStepAU, minSweptAU, stepLimitAU };
}

function runCollisionTest({ lowFps = false } = {}) {
  const name = lowFps ? 'csCollisionTestLowFps' : 'csCollisionTest';
  const K = window.KOSMOS ?? {};
  const vm = K.vesselManager, ts = K.timeSystem, mos = K.movementOrderSystem, dscs = K.deepSpaceCombatSystem;
  const ps = K.proximitySystem ?? null;
  const home = K.homePlanet;
  const refuse = (reason) => { const r = { ok: false, reason }; console.warn(`[${name}]`, JSON.stringify(r)); return Promise.resolve(r); };
  if (_running) return refuse('test_running');
  if (!vm || !ts || !mos || !dscs || !home) return refuse('no_world');
  if (K.threeRenderer?._galaxyActive) return refuse('galaxy_mode');
  // Trwa starcie w układzie: świat tyka siatką rund (1 d/s), statki testu prawie stoją — odczyt byłby bez sensu
  if (ts._combatView?.()) return refuse('combat_in_progress');
  const empire = pickAiEmpire(K);
  if (!empire) return refuse('no_ai_empire');

  const AU = GAME_CONFIG.AU_TO_PX;
  const sys = K.activeSystemId ?? 'sys_home';
  const k = systemScaleOf(sys);
  const prevIndex = ts.multiplierIndex, prevAutoSlow = ts._autoSlowEnabled;
  ts.pause?.();

  // Statki testu (pozycja i rozkaz po ustaleniu progu)
  const A = vm.createAndRegister(CS_COLLISION_TEST.HULL, home.id, { name: 'CS-776 A', modules: [...CS_COLLISION_TEST.MODULES], systemId: sys });
  const B = vm.createAndRegister(CS_COLLISION_TEST.HULL, home.id, { name: 'CS-776 B', modules: [...CS_COLLISION_TEST.MODULES], systemId: sys });
  if (!A || !B) return refuse('spawn_failed');
  for (const v of [A, B]) { v.systemId = sys; v._csCollisionTest = true; }
  B.ownerEmpireId = empire.id; B.owner = empire.id; B.isEnemy = true;

  const enterAU = combatEnterAUOf(A, B);
  const gapAU = Math.max(CS_COLLISION_TEST.START_GAP_MIN_AU * k, CS_COLLISION_TEST.START_GAP_OF_ENTER * enterAU);
  const lateralAU = CS_COLLISION_TEST.LATERAL_OF_ENTER * enterAU;
  // Długie tiki: cel lotu co najmniej jeden krok za punktem mijanki (w układzie ściśniętym krok > 1 AU też się mieści)
  const overshootAU = lowFps ? Math.max(CS_COLLISION_TEST.OVERSHOOT_AU, CS_COLLISION_TEST.LOW_FPS_STEP_AU) : CS_COLLISION_TEST.OVERSHOOT_AU;
  const others = (vm.getVesselsInSystem?.(sys) ?? []).filter((v) => !v._csCollisionTest && !v.isWreck && v.position).map((v) => v.position);
  const bodies = ['star', 'planet', 'moon', 'planetoid'].flatMap((t) => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
    .filter((b) => Number.isFinite(b?.x) && Number.isFinite(b?.y));
  // Miejsce mijanki: pierwsze z ziaren 776… przy którym OBA tory są proste (omijanie ciał w trasie misji zgięłoby tor
  // i zmieniło zbliżenie — wtedy wynik nie mówiłby nic o przemiataniu)
  const geomOf = (seed) => {
    const c = cvBattleCenter({ seed, vessels: others, bodies, auPx: AU }) ?? { x: 2 * AU, y: 0 };
    const ang = Math.atan2(c.y, c.x) + Math.PI / 2;               // tor styczny do orbity (z dala od gwiazdy)
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    const half = (gapAU / 2) * AU, off = (lateralAU / 2) * AU, over = (gapAU / 2 + overshootAU) * AU;
    const g = { ux, uy,
      a0: { x: c.x - ux * half + nx * off, y: c.y - uy * half + ny * off }, a1: { x: c.x + ux * over + nx * off, y: c.y + uy * over + ny * off },
      b0: { x: c.x + ux * half - nx * off, y: c.y + uy * half - ny * off }, b1: { x: c.x - ux * over - nx * off, y: c.y - uy * over - ny * off } };
    const wp = (p, q) => vm._calcRoute?.(p.x, p.y, q.x, q.y, sys)?.waypoints?.length ?? 0;
    g.bends = wp(g.a0, g.a1) + wp(g.b0, g.b1);
    return g;
  };
  let geom = null, placeSeed = null;
  for (let s = 776; s < 776 + CS_COLLISION_TEST.PLACE_TRIES && !geom; s++) { const g = geomOf(s); if (g.bends === 0) { geom = g; placeSeed = s; } }
  const routeStraight = !!geom;
  if (!geom) { geom = geomOf(776); placeSeed = 776; }
  const { ux, uy } = geom;
  Object.assign(A.position, { ...geom.a0, state: 'orbiting', dockedAt: null });
  Object.assign(B.position, { ...geom.b0, state: 'orbiting', dockedAt: null });
  const ordA = mos.issueOrder(A.id, { type: 'moveToPoint', targetPoint: geom.a1, noBodySnap: true, bypassFuelCheck: true, issuedBy: name });
  const ordB = mos.issueOrder(B.id, { type: 'moveToPoint', targetPoint: geom.b1, noBodySnap: true, bypassFuelCheck: true, issuedBy: name });

  const watchKey = pairKey(A.id, B.id);
  const cleanup = (why) => {
    for (const v of [A, B]) if (vm._vessels?.has?.(v.id)) vm.destroyVessel?.(v.id, { reason: 'dismantled' });
    ts.pause?.();
    _running = false;
    console.log(`[${name}] sprzątanie:`, why);
  };
  if (!ordA?.ok || !ordB?.ok) {
    cleanup('order_rejected');
    return Promise.resolve({ ok: false, reason: 'order_rejected', a: ordA?.reason ?? null, b: ordB?.reason ?? null });
  }

  _running = true;
  return new Promise((resolve) => {
    let enter = null, frames = 0, minSampledAU = Infinity, done = false, forcedTicks = 0, ticks = 0;
    const t0 = performance.now();
    // Obserwacja pary w ProximitySystem: powód pominięcia przemiatania albo zbliżenie, na każde wywołanie
    const watch = [];
    if (ps) { if (!(ps._sweepWatch instanceof Map)) ps._sweepWatch = new Map(); ps._sweepWatch.set(watchKey, watch); }
    // Długie tiki: czas klatek oddawany grze w paczkach po tickMs (render dalej co klatkę)
    const multiplier = ts.multipliers[ts.multipliers.length - 1];   // 1 r/s
    const tickMs = lowFps ? (CS_COLLISION_TEST.LOW_FPS_STEP_AU / (Math.max(0.01, A.speedAU ?? 1) * multiplier)) * 1000 : null;
    const hadOwnUpdate = Object.prototype.hasOwnProperty.call(ts, 'update');
    const origUpdate = ts.update;
    const restoreUpdate = () => {
      if (!lowFps) return;
      if (hadOwnUpdate) ts.update = origUpdate; else delete ts.update;
    };
    if (lowFps) {
      let acc = 0;
      ts.update = function (deltaMs) {
        acc += deltaMs;
        if (acc < tickMs) return;
        const d = acc; acc = 0; forcedTicks++;
        return origUpdate.call(this, d);
      };
    }
    const onEnter = (e) => {
      const ids = [e?.vesselAId, e?.vesselBId];
      if (enter || !ids.includes(A.id) || !ids.includes(B.id)) return;
      restoreUpdate();   // starcie: siatka rund DSCS w zwykłym tempie
      enter = { swept: e.swept === true, distanceAU: e.distanceAU,
        xAU: (A.position.x + B.position.x) / 2 / AU, yAU: (A.position.y + B.position.y) / 2 / AU };
    };
    EventBus.on('vessel:combatRangeEnter', onEnter);
    const onTick = () => { ticks++; };   // tiki gry w czasie testu (do odczytu)
    EventBus.on('time:tick', onTick);
    const finish = () => {
      done = true;
      restoreUpdate();
      EventBus.off('vessel:combatRangeEnter', onEnter);
      EventBus.off('time:tick', onTick);
      if (ps?._sweepWatch instanceof Map) { ps._sweepWatch.delete(watchKey); if (!ps._sweepWatch.size) ps._sweepWatch = null; }
      ts.setMultiplier?.(prevIndex);
      ts._autoSlowEnabled = prevAutoSlow;
      const enc = dscs._findActiveEncounterContaining?.(A.id) ?? dscs._findActiveEncounterContaining?.(B.id) ?? null;
      const secs = (performance.now() - t0) / 1000;
      const sw = summarizeSweep(watch);
      const r = {
        ok: true, test: name, system: sys, k, sweptProximity: !!GAME_CONFIG.FEATURES?.sweptProximity,
        combatStarted: !!enc, trigger: enter ? (enter.swept ? 'swept' : 'point') : null,
        // Powód, dla którego przemiatanie NIE dało walki (null, gdy walka wystartowała albo przemiatanie liczyło się, ale
        // zbliżenie było poza progiem — wtedy patrz minSweptAU)
        sweptSkip: enc ? null : (ps ? sw.main : 'noProximitySystem'),
        sweepSkips: sw.sweepSkips,
        minSweptAU: Number.isFinite(sw.minSweptAU) ? +sw.minSweptAU.toFixed(4) : null,
        maxShipStepAU: +sw.maxStepAU.toFixed(4),
        stepLimitAU: sw.stepLimitAU != null ? +sw.stepLimitAU.toFixed(4) : null,
        enterAU: +enterAU.toFixed(4), lateralAU: +lateralAU.toFixed(4),
        minFrameSampleAU: Number.isFinite(minSampledAU) ? +minSampledAU.toFixed(4) : null,
        pointSamplesMissed: minSampledAU >= enterAU,
        at: enter ? { xAU: +enter.xAU.toFixed(3), yAU: +enter.yAU.toFixed(3), distanceAU: +enter.distanceAU.toFixed(4) } : null,
        frames, fps: +(frames / Math.max(secs, 1e-3)).toFixed(1), ticks, routeStraight, placeSeed,
        ...(lowFps ? { tickMs: Math.round(tickMs), forcedTicks, stepPerTickAU: CS_COLLISION_TEST.LOW_FPS_STEP_AU } : {}),
      };
      console.log(`[${name}]`, JSON.stringify(r));
      resolve(r);
      if (!enc) { cleanup('no_combat'); return; }
      const onResolved = () => { EventBus.off('battle:resolved', onResolved); clearTimeout(timer); cleanup('battle_resolved'); };
      const timer = setTimeout(() => { EventBus.off('battle:resolved', onResolved); cleanup('battle_timeout'); }, CS_COLLISION_TEST.BATTLE_WAIT_MS);
      EventBus.on('battle:resolved', onResolved);
    };
    const step = () => {
      if (done) return;
      frames++;
      const d = Math.hypot(A.position.x - B.position.x, A.position.y - B.position.y) / AU;
      if (d < minSampledAU) minSampledAU = d;
      // Koniec: walka wystartowała, statki się minęły i rozeszły na odległość startową, albo limit czasu
      const passed = ((B.position.x - A.position.x) * ux + (B.position.y - A.position.y) * uy) < 0;
      if (enter || (passed && d > gapAU / 2) || performance.now() - t0 > CS_COLLISION_TEST.TIMEOUT_MS) { finish(); return; }
      requestAnimationFrame(step);
    };
    ts._autoSlowEnabled = false;
    ts.setMultiplier?.(ts.multipliers.length - 1);   // 1 r/s
    ts.play?.();
    requestAnimationFrame(step);
  });
}

/** csCollisionTest() — patrz nagłówek. Zwraca Promise z odczytem (także w konsoli). */
export function csCollisionTest() { return runCollisionTest({ lowFps: false }); }

/** csCollisionTestLowFps() — ten sam scenariusz z wymuszonymi długimi tikami (przycięcie). */
export function csCollisionTestLowFps() { return runCollisionTest({ lowFps: true }); }
