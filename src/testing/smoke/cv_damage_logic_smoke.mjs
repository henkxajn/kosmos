// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_damage_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-5 (wybuchy, stany uszkodzeń, płonące wraki; flaga `cvDamage`)
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.5, §2.10, §4 CV-5. Keepery wyłącznie LOGIKI (F11 a–f) — bez pinów na stałych rysunku.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wykonaniem):
//   D1  stany uszkodzeń z HP pokazywanego: dym ⊂ ogień ⊂ krztuszenie (z konstrukcji), poziom monotoniczny (HP maleje → poziom nie maleje)
//   D2  rozmiar wybuchu = funkcja długości RYSOWANEJ kadłuba, bez podłogi (Finding 619): plan dla 2 L = plan dla L × 2 (rozmiary,
//       przesunięcia, prędkości, zasięg światła); kadłub 1e-4 j. — rozmiary 1e-4 × współczynnik (bez dna)
//   D3  sekwencja klasy: fregata — 0 wtórnych, niszczyciel — 1, pancernik — 2 albo 3 (z ziarna, oba warianty występują); wybuch główny
//       po wszystkich wtórnych; to samo ziarno = ten sam plan; plan posortowany w czasie
//   D4  budżet presetu zmienia LICZBY (odłamki, żar, dym), nigdy chwile ani obecność wybuchu: Low — bez odłamków, żaru, dymu, a błysk,
//       płaty, fala i światło (pula odmówi) zostają; High ≥ Medium ≥ Low dla każdej liczby
//   D5  pula świateł nigdy ponad liczbę presetu (prawdziwy `CombatLightPool` na three r171): 12 wybuchów w 300 ms — aktywne ≤ count;
//       Low (count 0) — każdy błysk odmówiony, żadne światło nie świeci
//   D6  dryf wraku deterministyczny, ograniczony kopertą (× WRECK_DRIFT_ENV), od zera w chwili zniszczenia; zbieżność do pozycji
//       logicznej — odległość nierosnąca, `done` po czasie
//   D7  żar wraku nierosnący w czasie, żar resztkowy po WRECK_COOL_S; zegar efektów (prawdziwy `_cvDmgTick`): pauza — zegar stoi,
//       FX_TIME_SCALE 0,25 — krok × 0,25
//   D8  dokładnie jeden pokaz zniszczenia na okręt przy `cvDamage` ON: trafienie zabijające (rejestr) → wybuch warstwowy RAZ; późny
//       `vessel:wrecked` (prawdziwy handler ze źródła) — bez drugiego; odbudowa sprite'a po zabiciu — wygląd wraku od razu wystygły, bez
//       wybuchu. KONTROLA: `cvDamage` OFF — łata CV-3a3 (`_spawnFx`) zamiast pul CV-5; odbudowa w tej sesji — dryf i obrót dalej z osi
//       i ziarna chwili wybuchu (bez skoku); KONTROLA: bez epoki (nowa sesja — wczytanie) wrak odbudowany stoi bez dryfu
//   D9  sekwencja w pulach na zegarze efektów: pancernik — wtórne przed głównym, główny w `mainAt`; pauza — zero nowych cząstek
//   D10 emitery stanów uszkodzeń z HP pokazywanego: > 75 % — nic, ≤ 75 % — dym, ≤ 50 % — dym + ogień, ≤ 25 % — krztuszenie (bramka
//       smugi < 1 w części klatek); preset Medium (dym uszkodzeń „fire”) — sam ogień, Low — nic
//   D11 gorąca ścieżka (wybuchy + emitery przez 4 s) — zero konstrukcji THREE i tablic typowanych po rozgrzewce
//   D12 wypalanie wraku: tryb 1, żar od 1 stygnie; flaga OFF — `paintRigMaterials('wreck')` = tryb 0 (wygląd CV-1a); zniszczenie
//       z `cvExplode` zapamiętane (przebudowa sprite'a odtwarza wrak — pin źródłowy `_addVesselModelCv`, metoda ładuje GLB)
//   D13 wstawka wierzchołka do prawdziwego `ShaderLib.standard` (kotwice, głośny wyjątek bez kotwicy); gałąź trybu 0 = wyrażenia CV-1a;
//       matowy wrak (szorstkość / metaliczność) wyłącznie w trybie 1 — tryb 0 i statki żywe nietknięte
//   D14 źródło: zero Math.random w ExplosionLogic / FxEngine / FxShaders / metodach `_cvDmg*`; rozgrzewka pul w `_ensureFxEngine`
//   D15 (CV-3c, `cvChoreo2`) dryf wraku po bitwie: zwykły wrak rusza po zbieżności; zniszczenie ODROCZONE do trafienia w locie (rejestr
//       'pending') — bez dryfu, dopóki statek wygląda na żywy; dryf rusza z wybuchem, z bieżącego obrotu i miejsca (bez skoku); KONTROLA —
//       flaga OFF: bez dryfu (CV-5). Pomiar w grze przed poprawką: 2 z 14 wraków bez dryfu (stan wraku odtwarzany przy wybuchu)
//   D16 (CV-3c) pokazane zniszczenie (`_cvWpnKillLook`) gasi wyloty dysz OD RAZU — nie czeka na `_applyExhaust` (statek, który stanął,
//       nie dostaje aktualizacji pozycji; pomiar w grze: wylot świecił na wraku `cvExplode` przez cały wybuch)
//       (Finding 644) i prawdziwy `FxEngine.prewarm` rysuje każdą pulę raz
// ⚠ Fail-first: moduł `ExplosionLogic` i metody `_cvDmg*` powstają w tym kroku — import dynamiczny w try/catch, sekcje DEGRADUJĄ.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { GAME_CONFIG } from '../../config/GameConfig.js';
import EventBus from '../../core/EventBus.js';
import { readFileSync } from 'node:fs';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const X      = await tryImport('../../renderer/combat/ExplosionLogic.js');
const ENGINE = await tryImport('../../renderer/combat/FxEngine.js');
const CLOCK  = await tryImport('../../renderer/combat/PresentationClock.js');
const LP     = await tryImport('../../renderer/combat/LightPool.js');
const LEDGER = await tryImport('../../renderer/combat/CombatLedgerLogic.js');
const CUEBUS = await tryImport('../../renderer/combat/CombatCueBus.js');
const RIG    = await tryImport('../../renderer/ShipModelRig.js');
const HPTS   = await tryImport('../../renderer/ShipHardpoints.js');
const KC     = await tryImport('../../renderer/KeyColourEmission.js');
const CHOREO = await tryImport('../../renderer/combat/ChoreographyLogic.js');
const FXC = await import('../../config/CombatFxConfig.js');
const FX  = await import('../../utils/VesselFxLogic.js');
const VMR = await import('../../renderer/VesselModelResolver.js');
const VES = await import('../../entities/Vessel.js');
const RRNG = await import('../../renderer/RendererRng.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const guard = (label, fn) => { try { fn(); } catch (e) { assert(false, `${label} — wyjątek (pin degraduje, nie przerywa): ${e?.message ?? e}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const L = VMR.VESSEL_TARGET_SIZE.frigate;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

header('X0 — moduły CV-5');
assert(!!X?.explosionPlan && !!X?.damageStateOf && !!X?.wreckHeatAt && !!X?.wreckDrift && !!ENGINE?.FxEngine, 'X0 `ExplosionLogic` (plan, stany, żar, dryf) i silnik FX');

// ── D1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D1 — stany uszkodzeń: dym ⊂ ogień ⊂ krztuszenie, monotoniczne w HP pokazywanym');
guard('D1', () => {
  let ordered = true, mono = true, prev = -1;
  for (let i = 1000; i >= 0; i--) {
    const f = i / 1000, s = X.damageStateOf(f);
    if ((s.fire && !s.smoke) || (s.sputter && !s.fire) || s.level !== (s.smoke ? 1 : 0) + (s.fire ? 1 : 0) + (s.sputter ? 1 : 0)) ordered = false;
    if (s.level < prev) mono = false;
    prev = s.level;
  }
  assert(ordered, 'D1a dla każdego HP: ogień ⇒ dym, krztuszenie ⇒ ogień; poziom = liczba aktywnych stanów');
  assert(mono, 'D1b HP maleje 100 % → 0 % — poziom nigdy nie maleje');
  const lv = [1, 0.76, 0.75, 0.51, 0.5, 0.26, 0.25, 0.01].map((f) => X.damageStateOf(f).level).join('');
  assert(lv === '00112233', `D1c progi 75 / 50 / 25 % — HP 100 / 76 / 75 / 51 / 50 / 26 / 25 / 1 % → ${lv}`);
});

// ── D2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D2 — rozmiar wybuchu z długości rysowanej kadłuba, bez podłogi (Finding 619)');
guard('D2', () => {
  for (const cls of ['frigate', 'destroyer', 'battleship']) {
    const a = X.explosionPlan({ cls, lengthWU: 0.02, seed: 77 }), b = X.explosionPlan({ cls, lengthWU: 0.04, seed: 77 });
    let ok = a.spawns.length === b.spawns.length;
    for (let i = 0; ok && i < a.spawns.length; i++) {
      const p = a.spawns[i], q = b.spawns[i];
      for (const k of ['size', 'ox', 'oy', 'oz', 'vx', 'vy', 'vz', 'range']) if (Number.isFinite(p[k]) && !near(q[k], 2 * p[k])) ok = false;
      if (p.at !== q.at || p.kind !== q.kind) ok = false;
    }
    assert(ok && a.spawns.length > 5, `D2a ${cls}: plan dla 2 × długości = plan × 2 (rozmiary, przesunięcia, prędkości, zasięg światła), chwile te same`);
  }
  const tiny = X.explosionPlan({ cls: 'frigate', lengthWU: 1e-4, seed: 1 });
  const big = X.explosionPlan({ cls: 'frigate', lengthWU: 1, seed: 1 });
  const flashT = tiny.spawns.find((s) => s.kind === 'flash'), flashB = big.spawns.find((s) => s.kind === 'flash');
  assert(!!flashT && near(flashT.size, 1e-4 * flashB.size), `D2b kadłub 1e-4 j.: błysk ${flashT?.size?.toExponential?.(2)} = 1e-4 × (bez podłogi świata)`);
});

// ── D3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D3 — sekwencja klasy: wtórne (0 / 1 / 2–3) przed głównym; deterministyczna, posortowana');
guard('D3', () => {
  const cnt = { frigate: new Set(), destroyer: new Set(), battleship: new Set() };
  let order = true, sorted = true, det = true;
  for (let seed = 1; seed <= 200; seed++) {
    for (const cls of Object.keys(cnt)) {
      const p = X.explosionPlan({ cls, lengthWU: 0.02, seed });
      cnt[cls].add(p.secondaries.length);
      if (p.secondaries.some((s) => !(s.at < p.mainAt) && p.mainAt > 0)) order = false;
      for (let i = 1; i < p.spawns.length; i++) if (p.spawns[i].at < p.spawns[i - 1].at) sorted = false;
      if (seed % 50 === 0 && JSON.stringify(p) !== JSON.stringify(X.explosionPlan({ cls, lengthWU: 0.02, seed }))) det = false;
    }
  }
  assert([...cnt.frigate].join() === '0' && [...cnt.destroyer].join() === '1' && cnt.battleship.has(2) && cnt.battleship.has(3) && cnt.battleship.size === 2,
    `D3a wtórne: fregata ${[...cnt.frigate]}, niszczyciel ${[...cnt.destroyer]}, pancernik ${[...cnt.battleship].sort()} (oba warianty z ziarna)`);
  assert(order, 'D3b każdy wtórny przed wybuchem głównym (niszczyciel, pancernik)');
  assert(sorted && det, 'D3c plan posortowany w czasie; to samo ziarno = ten sam plan');
  const f = X.explosionPlan({ cls: 'frigate', lengthWU: 0.016, seed: 3 });
  assert(f.mainAt === 0 && f.spawns.filter((s) => s.kind === 'flash').length === 1 && f.spawns.some((s) => s.kind === 'streak') && f.spawns.some((s) => s.kind === 'ring'),
    'D3d fregata: jeden ostry wybuch w chwili zniszczenia (jeden błysk, smuga anamorficzna, fala)');
});

// ── D4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D4 — budżet presetu zmienia liczby, nie chwile; Low nadal wybucha');
guard('D4', () => {
  const PR = { high: { debris: 24, smoke: true, embers: true, damageSmoke: 'on', particles: 16000 },
    medium: { debris: 12, smoke: true, embers: false, damageSmoke: 'fire', particles: 6000 },
    low: { debris: 0, smoke: false, embers: false, damageSmoke: 'off', particles: 2000 } };
  const by = (p) => { const o = {}; for (const s of p.spawns) o[s.kind] = (o[s.kind] ?? 0) + 1; return o; };
  const plans = Object.fromEntries(Object.entries(PR).map(([k, e]) => [k, X.explosionPlan({ cls: 'battleship', lengthWU: 0.028, seed: 9, budget: X.explosionBudget(e) })]));
  const c = Object.fromEntries(Object.entries(plans).map(([k, p]) => [k, by(p)]));
  console.log(`     pancernik: High ${JSON.stringify(c.high)} · Medium ${JSON.stringify(c.medium)} · Low ${JSON.stringify(c.low)}`);
  const kinds = ['debris', 'ember', 'smoke', 'lobe', 'flash', 'ring', 'light'];
  assert(kinds.every((k) => (c.low[k] ?? 0) <= (c.medium[k] ?? 0) && (c.medium[k] ?? 0) <= (c.high[k] ?? 0)), 'D4a każda liczba Low ≤ Medium ≤ High');
  assert(!c.low.debris && !c.low.ember && !c.low.smoke && c.low.flash > 0 && c.low.lobe > 0 && c.low.ring === 1 && c.low.light === 1,
    'D4b Low: bez odłamków, żaru i dymu; błysk, płaty kuli ognia, fala i wpis światła zostają (pula Low odmówi)');
  assert(plans.low.mainAt === plans.high.mainAt && JSON.stringify(plans.low.secondaries) === JSON.stringify(plans.high.secondaries),
    'D4c chwile wybuchów (wtórne, główny) niezależne od budżetu');
});

// ── D5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D5 — pula świateł nigdy ponad liczbę presetu; Low = 0 świateł');
guard('D5', () => {
  const pool = new LP.CombatLightPool({ THREE, parent: new THREE.Group(), capacity: 4 });
  const run = (count) => {
    pool.setCount(count);
    let over = 0, lit = 0, slots = 0;
    for (let k = 0; k < 12; k++) {
      const plan = X.explosionPlan({ cls: k % 3 === 0 ? 'battleship' : 'frigate', lengthWU: 0.02, seed: k + 1 });
      const lr = plan.spawns.find((s) => s.kind === 'light');
      if (pool.flash(0, 0.3, k * 0.01, 0xffb070, k * 25 + lr.at, { intensity: lr.peak, range: lr.range, attackMs: lr.attack, holdMs: 0, fadeMs: lr.fade }) >= 0) slots++;
      for (let t = 0; t < 25; t += 5) {
        pool.update(k * 25 + t);
        if (pool.activeCount() > pool.count) over++;
        lit = Math.max(lit, pool.lights.filter((L2, i) => i >= pool.count ? L2.visible || L2.intensity > 0 : false).length);
      }
    }
    return { over, lit, slots, st: pool.stats() };
  };
  const hi = run(4), lo = run(0);
  console.log(`     High: przydziałów ${hi.slots}, kradzieże ${hi.st.steals}, szczyt aktywnych ${hi.st.peakActive}; Low: przydziałów ${lo.slots}, odmowy ${lo.st.refused}`);
  assert(hi.over === 0 && hi.st.peakActive <= 4 && hi.slots === 12, 'D5a High: 12 wybuchów w 300 ms — aktywne nigdy ponad 4 (najstarsze oddają światło)');
  assert(lo.over === 0 && lo.slots === 0 && pool.lights.every((L2) => !L2.visible && L2.intensity === 0), 'D5b Low: każdy błysk odmówiony, żadne światło nie świeci');
  pool.dispose();
});

// ── D6 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D6 — dryf wraku: deterministyczny, w kopercie, od zera; zbieżność do pozycji logicznej');
guard('D6', () => {
  const env = CHOREO?.choreoEnvelope ? CHOREO.choreoEnvelope('frigate', L) : L;
  const k = X.EXP_TUNING.WRECK_DRIFT_ENV;
  let maxD = 0, det = true;
  for (let seed = 1; seed <= 20; seed++) {
    for (let t = 0; t <= 180000; t += 333) {
      const d = X.wreckDrift({ seed, tMs: t, envWU: env });
      maxD = Math.max(maxD, Math.hypot(d.x, d.y, d.z));
      if (t % 9990 === 0) { const d2 = X.wreckDrift({ seed, tMs: t, envWU: env }); if (d2.x !== d.x || d2.angle !== d.angle) det = false; }
    }
  }
  const z0 = X.wreckDrift({ seed: 5, tMs: 0, envWU: env });
  const other = X.wreckDrift({ seed: 6, tMs: 30000, envWU: env }), same5 = X.wreckDrift({ seed: 5, tMs: 30000, envWU: env });
  console.log(`     koperta fregaty ${(env / L).toFixed(2)} L × ${k}: największy dryf ${(maxD / L).toFixed(3)} L`);
  assert(maxD <= env * k + 1e-12 && maxD > 0.2 * env * k, `D6a dryf ≤ koperta × WRECK_DRIFT_ENV (${(maxD / L).toFixed(3)} ≤ ${(env * k / L).toFixed(2)} L) i niezerowy`);
  assert(det && z0.x === 0 && z0.y === 0 && z0.z === 0 && z0.angle === 0, 'D6b deterministyczny (to samo ziarno i chwila = to samo); w chwili zniszczenia zero');
  assert(other.x !== same5.x, 'D6c inne ziarno — inny dryf');
  const from = { x: 1, y: 0.3, z: -2 }, to = { x: 1.5, y: 0.45, z: -1 };
  let monoC = true, prevD = Infinity, done = false;
  for (let t = 0; t <= 1300; t += 50) {
    const c = X.wreckConverge(from, to, t, 1200);
    const d = Math.hypot(c.x - to.x, c.y - to.y, c.z - to.z);
    if (d > prevD + 1e-12) monoC = false;
    prevD = d; done = c.done;
  }
  assert(monoC && done && prevD < 1e-12, 'D6d zbieżność: odległość do pozycji logicznej nierosnąca, po czasie dokładnie w niej (`done`)');
});

// ── D7 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D7 — żar wraku stygnie monotonicznie; zegar efektów: pauza stoi, FX_TIME_SCALE skaluje krok');
guard('D7', () => {
  let mono = true, prev = Infinity;
  for (let t = 0; t <= 30000; t += 100) { const h = X.wreckHeatAt(t); if (h > prev + 1e-12) mono = false; prev = h; }
  const T = X.EXP_TUNING;
  assert(mono && X.wreckHeatAt(0) === 1 && near(X.wreckHeatAt(T.WRECK_COOL_S * 1000), T.WRECK_HEAT_FLOOR) && near(X.wreckHeatAt(1e9), T.WRECK_HEAT_FLOOR),
    `D7a żar 1 → ${T.WRECK_HEAT_FLOOR} w ${T.WRECK_COOL_S} s, nierosnący`);
});

// ── Atrapa renderera z prawdziwymi metodami (CV-4a + CV-5) ─────────────────────────────────────────────────────────
const TR = read('src/renderer/ThreeRenderer.js');
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  return { params: TR.slice(TR.indexOf('(', i) + 1, sigEnd), body: TR.slice(sigEnd + 4, TR.indexOf('\n  }\n', sigEnd)) };
}
const WORLD_SCALE = Number((TR.match(/const WORLD_SCALE\s*=\s*([\d.]+)/) ?? [])[1]);
const S = (v) => v / WORLD_SCALE;
const SYS = 'sys_d';
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'CombatLedger', 'pickTurret', 'ledgerRng',
  'VESSEL_TARGET_SIZE', 'vesselTargetSize', 'vesselSizeClass', 'fxWeaponColor', 'FX_SHIELD_COLOR', 'cueWeaponOfCategory', 'cueSizeOfClass',
  'screenPan', 'CombatCueBus', 'EventBus', 'paintRigMaterials', 'rendererRandom', 'wreckTiltQuaternion', 'FxEngine', 'logDepthOn',
  'isEnemyVessel', 'isEndpointVisibleInCombat', 'isPlayerEngagement', 'quatFromYawPitchRoll', 'WRECK_EMISSIVE_COLOR', 'FX_HDR_WRECK', 'document',
  'LEDGER_INFO_LEGEND', 'EXPLOSION_RING_COLOR', 'FX_HDR_EXPLOSION', 'KC_SHARED', 'setKeyColourWreckState', 'STAGE',
  'explosionPlan', 'explosionBudget', 'explosionClassOf', 'explosionSeed', 'damageStateOf', 'wreckHeatAt', 'wreckBurnColor', 'wreckFireWindow',
  'wreckDrift', 'wreckConverge', 'sputterGate', 'emitterTicks', 'expSeedUnit', 'wreckAfterDrift'];   // CV-3c — dryf po bitwie (D15)
const VALUES = () => [THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance, FX.isEngagementInView, LEDGER?.CombatLedger, LEDGER?.pickTurret, LEDGER?.ledgerRng,
  VMR.VESSEL_TARGET_SIZE, VMR.vesselTargetSize, VMR.vesselSizeClass, FXC.weaponColor, FXC.FX_SHIELD_COLOR, CUEBUS?.cueWeaponOfCategory, CUEBUS?.cueSizeOfClass,
  CUEBUS?.screenPan, CUEBUS?.CombatCueBus, EventBus, RIG?.paintRigMaterials, RRNG.rendererRandom, HPTS?.wreckTiltQuaternion, ENGINE?.FxEngine, () => true,
  VES.isEnemyVessel, FX.isEndpointVisibleInCombat, FX.isPlayerEngagement, CHOREO?.quatFromYawPitchRoll, FX.WRECK_EMISSIVE_COLOR, 2.2, globalThis.document,
  LEDGER?.LEDGER_INFO_LEGEND, FX.EXPLOSION_RING_COLOR, 2.5, KC?.KC_SHARED, KC?.setKeyColourWreckState, { SHELL_FLOOR_L: 2, JOIN_MS: 500 },
  X?.explosionPlan, X?.explosionBudget, X?.explosionClassOf, X?.explosionSeed, X?.damageStateOf, X?.wreckHeatAt, X?.wreckBurnColor, X?.wreckFireWindow,
  X?.wreckDrift, X?.wreckConverge, X?.sputterGate, X?.emitterTicks, X?.seedUnit, X?.wreckAfterDrift];
const METHODS = ['_cvWpnRoundFx', '_cvWpnSpawn', '_cvWpnImpact', '_cvWpnResolveLocal', '_cvWpnMuzzle', '_cvWpnTick', '_cvEncList', '_cvEncById', '_cvEncOf', '_cvVisWreck', '_cvWpnPresentKill', '_cvWpnKillLook',
  '_cvWpnWreckGate', 'cvPresentedState', 'cvEventShown', '_ensureFxEngine', '_tickCvFx', '_combatEndpointWorld', '_isEnemyEndpointVisible', '_isCombatRevealed',
  '_ensureCueBus', '_cueDestroyed', '_flushCues', '_cvTiltWreck', '_spawnExplosion', '_lightClockMs', '_setSpriteBase', '_spriteBase', '_stageMark', '_stagePlace',
  '_cvDmgOn', '_cvDmgState', '_cvDmgTick', '_cvDmgExplode', '_cvDmgPoint', '_cvDmgRunSeq', '_cvDmgWreckLook', '_cvDmgPaintHeat', '_cvDmgWrecks',
  '_cvDmgStates', '_cvDmgDrift', '_cvDmgTumble', '_cvDmgConverge', 'cvExplodeVessel', 'cvDamageInfo', '_cvWreckAfterStep'];   // CV-3c (D15)
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(...VALUES());
}
function wreckHandler() {
  // ⚠ PRZECELOWANE ŚWIADOMIE (CV-8a, 2026-11-13): ciało słuchacza `vessel:wrecked` przeniesione do `this._onVesselWreckedView`
  //   (słuchacz zostawia sobie tylko wstrzymanie wraku powtórki bitwy orbitalnej — `CvOrbital.deferWreck` — i woła je; powtórka woła
  //   to samo ciało po zniszczeniu w powtórce). Kod ciała co do znaku ten sam — wyciągamy je z nowego miejsca; stare — zapas.
  const heads = [["this._onVesselWreckedView = (vesselId, vessel) => {", '\n    };\n'], ["EventBus.on('vessel:wrecked', safe(({ vesselId, vessel }) => {", '\n    }));\n']];
  for (const [head, tail] of heads) {
    const i = TR.indexOf(head);
    if (i < 0) continue;
    const b0 = i + head.length;
    const end = TR.indexOf(tail, b0);
    return new Function(...NAMES, `return function ({ vesselId, vessel }) {\n${TR.slice(b0, end)}\n};`)(...VALUES());
  }
  return null;
}
const clock = { now: 1e6 };
performance.now = () => clock.now;
const tex = new THREE.Texture();
function template() {
  const geo = new THREE.BoxGeometry(1, 0.2, 0.3);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex })));
  return g;
}
const TPL = template();
function fakeR() {
  const R = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000), _vessels: new Map(), _fxEngine: null, _fxGroup: null,
    _presClock: CLOCK ? new CLOCK.PresentationClock() : null, _galaxyActive: false, _galaxyFlight: false, cvTuning: ENGINE?.LIVE_CV_FX ?? {}, _cvLedger: null,
    _cvWpnTurretTurn: new Map(), _cvWpnStats: { rounds: 0, shots: 0, hidden: 0, killsShown: 0, wreckDeduped: 0, wreckDeferred: 0, wreckUnknown: 0 },
    _stageMarks: new Map(), _shipLightPool: null, _gfx: null, _cueBus: null, _cvDmg: null, _fxLightPool: null, _cvDebugKilled: new Set(), _cvWreckEpoch: new Map(), missing: [], legacy: 0,
    _planets: new Map(), _moons: new Map(), _planetoids: new Map(), _activeEffects: [] };
  for (const n of METHODS) { const fn = makeMethod(n); if (fn) R[n] = fn; else R.missing.push(n); }
  R._spawnFx = () => { R.legacy++; };   // łata CV-3a3 / OFF: każdy dawny efekt (kula ognia, pierścień)
  R._onWrecked = wreckHandler();
  R.camera.position.set(0, 0.5, 0.4); R.camera.lookAt(0, 0.3, 0); R.camera.updateMatrixWorld(true);
  R._presClock?.tick(performance.now());
  return R;
}
function addShip(R, id, { x = 0, z = 0, enemy = false, hull = 'hull_frigate' } = {}) {
  const hp = HPTS.defaultHardpoints('warp_frigate');
  const rig = RIG.buildShipRig({ THREE, template: TPL, hardpoints: hp, targetSize: L, kind: enemy ? 'enemy' : 'own',
    exhaust: { gradient: FX.exhaustGradientColors({ isEnemy: enemy }), hdr: 4.5 } });
  rig.root.position.set(x, 0.3, z);
  rig.root.visible = true;
  R._vessels.set(id, { sprite: rig.root, canonical: true, rig, isModel3D: true, exhaust: rig.exhaust });
  return { id, name: id.toUpperCase(), shipId: hull, isEnemy: enemy, ownerEmpireId: enemy ? 'emp_t' : undefined, lastBattleId: 'battle_ds_t',
    position: { x: x * WORLD_SCALE, y: z * WORLD_SCALE, state: 'orbiting', dockedAt: null } };
}
function kosmosFor(ships, { enc = null } = {}) {
  const byId = new Map(ships.map((v) => [v.id, v]));
  window.KOSMOS = { activeSystemId: SYS, timeSystem: { combatRoundMs: () => 1000, isPaused: false, multiplier: 1 },
    vesselManager: { getVessel: (id) => byId.get(id) ?? null },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }) },
    deepSpaceCombatSystem: { listActive: () => (enc ? [enc] : []), _findActiveEncounterContaining: () => enc } };
}
const payload = (round, events) => ({ encounterId: 'enc_d', systemId: SYS, round, seed: 99, midpoint: { x: 0, y: 0 }, events });
const pev = (attacker, target, category, { hit = true, dmg = 12, killed = false, hpAfter = 50 } = {}) => ({
  attacker, target, category, hit, blockedByShield: 0, aPos: null, tPos: null, weapon: { short: 'weapon_laser', medium: 'weapon_kinetic', long: 'weapon_missile' }[category],
  side: attacker.startsWith('a') ? 'A' : 'B', dmg: hit ? dmg : 0, hpAfter, shieldAfter: 0, killed });
const runFrames = (R, ms, { paused = false } = {}) => {
  if (window.KOSMOS?.timeSystem) window.KOSMOS.timeSystem.isPaused = paused;
  for (let t = 0; t < ms; t += 16) { clock.now += 16; R._tickCvFx(); }
  if (window.KOSMOS?.timeSystem) window.KOSMOS.timeSystem.isPaused = false;
};
function withFlags(flags, fn) {
  const F = GAME_CONFIG.FEATURES, keep = {};
  for (const k of Object.keys(flags)) { keep[k] = F[k]; F[k] = flags[k]; }
  try { return fn(); } catch (e) { assert(false, `sekcja przerwana wyjątkiem: ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`); return null; } finally { Object.assign(F, keep); }
}
const ON = { fcCombatFx: true, cvFxEngine: true, cvWeapons: true, cvPresets: false, cvStage: true, cvDamage: true };

header('R0 — metody renderera CV-5 wyciągnięte ze źródła');
{ const R = fakeR(); assert(R.missing.length === 0 && typeof R._onWrecked === 'function', `R0 metody (${METHODS.length}) i handler \`vessel:wrecked\`${R.missing.length ? ' — brak: ' + R.missing.join(', ') : ''}`); }

header('D7 (zegar) — prawdziwy `_cvDmgTick`: pauza — zegar efektów stoi; FX_TIME_SCALE 0,25 — krok × 0,25');
withFlags(ON, () => {
  const R = fakeR();
  kosmosFor([]);
  runFrames(R, 160);
  const t0 = R._cvDmg?.now;
  runFrames(R, 800, { paused: true });
  const t1 = R._cvDmg?.now;
  const keep = R.cvTuning.FX_TIME_SCALE;
  R.cvTuning.FX_TIME_SCALE = 0.25;
  const p0 = R._presClock.nowMs, d0 = R._cvDmg.now;
  runFrames(R, 800);
  const dp = R._presClock.nowMs - p0, dd = R._cvDmg.now - d0;
  R.cvTuning.FX_TIME_SCALE = keep;
  console.log(`     pauza: zegar efektów ${t0?.toFixed?.(1)} → ${t1?.toFixed?.(1)} ms; FX_TIME_SCALE 0,25: prezentacja +${dp.toFixed(1)} ms, efekty +${dd.toFixed(1)} ms`);
  assert(Number.isFinite(t0) && t0 === t1, 'D7b pauza — zegar efektów uszkodzeń stoi (bez nadrabiania)');
  assert(dp > 700 && near(dd, 0.25 * dp, 1e-9), 'D7c FX_TIME_SCALE 0,25 — zegar efektów płynie 4 × wolniej niż zegar prezentacji');
});

// ── D8 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D8 — jeden pokaz zniszczenia na okręt: trafienie zabijające + późny `vessel:wrecked` + odbudowa sprite\'a');
withFlags(ON, () => {
  const R = fakeR();
  const ships = [addShip(R, 'a1', { x: -0.05 }), addShip(R, 'b1', { x: 0.05, enemy: true })];
  kosmosFor(ships);
  R._cvWpnRoundFx(payload(2, [pev('a1', 'b1', 'short', { killed: true, hpAfter: -4 })]));
  const killAt = R._cvLedger?.killAt?.('b1');
  runFrames(R, (killAt ?? 0) + 200);
  const n1 = R._cvDmg?.stats?.explosions ?? 0, blasts1 = R._fxEngine?.stats?.().pools?.blast?.spawned ?? 0;
  R._onWrecked?.call(R, { vesselId: 'b1', vessel: ships[1] });
  runFrames(R, 400);
  const n2 = R._cvDmg?.stats?.explosions ?? 0;
  // odbudowa: nowy wpis statku (jak `_addVesselModelCv` po zmianie presetu) — `_cvWpnKillLook` bez wybuchu, wygląd od razu wystygły
  const e0 = R._vessels.get('b1');
  const rig2 = RIG.buildShipRig({ THREE, template: TPL, hardpoints: HPTS.defaultHardpoints('warp_frigate'), targetSize: L, kind: 'wreck' });
  const e2 = { sprite: rig2.root, canonical: true, rig: rig2, isModel3D: true, cvKilled: true };
  rig2.root.visible = true;
  R._vessels.set('b1', e2);
  R._cvWpnKillLook('b1', e2);
  runFrames(R, 200);
  const n3 = R._cvDmg?.stats?.explosions ?? 0;
  console.log(`     wybuchy CV-5: po trafieniu ${n1} (cząstek wybuchu ${blasts1}), po wraku ${n2}, po odbudowie ${n3}; łata ${R.legacy}; żar odbudowanego ${e2.cvWreck?.heat?.toFixed?.(3)}`);
  assert(n1 === 1 && blasts1 > 5 && R.legacy === 0, 'D8a trafienie zabijające: jeden wybuch warstwowy w pulach CV-5, zero dawnych efektów');
  assert(n2 === 1 && R._cvWpnStats.wreckDeduped === 1, 'D8b późny `vessel:wrecked`: bez drugiego wybuchu (jeden pokaz)');
  assert(n3 === 1 && e2.cvWreck?.t0 === null && near(e2.cvWreck?.heat, X.EXP_TUNING.WRECK_HEAT_FLOOR) && (e0.cvWreck?.heat ?? 0) > e2.cvWreck.heat,
    'D8c odbudowa po zabiciu: bez wybuchu, wygląd wraku od razu wystygły (żar resztkowy)');
  // D8e — dryf odbudowanego wraku: oś czasu i ziarno z chwili wybuchu (ta sama pozycja co stary wpis — bez skoku); KONTROLA bez epoki
  const env = 0.05;
  const w0 = e0.cvWreck;
  const dOld = w0 ? X.wreckDrift({ seed: w0.seed, tMs: R._cvDmg.now - (w0.tDrift ?? w0.t0), envWU: env, tuning: R.cvTuning }) : null;
  const dNew = R._cvDmgDrift?.('b1', env) ?? null;
  console.log(`     dryf po odbudowie: stary wpis (${dOld?.x?.toExponential?.(2)}, ${dOld?.z?.toExponential?.(2)}), nowy (${dNew?.x?.toExponential?.(2)}, ${dNew?.z?.toExponential?.(2)}); oś ${e2.cvWreck?.tDrift} vs wybuch ${e0.cvBlastAt}`);
  assert(!!dOld && !!dNew && e2.cvWreck?.tDrift === e0.cvBlastAt && e2.cvWreck?.seed === w0?.seed && Math.hypot(dOld.x, dOld.z) > 0
    && near(dNew.x, dOld.x) && near(dNew.y, dOld.y) && near(dNew.z, dOld.z),
    'D8e odbudowa w tej sesji: dryf (i obrót) dalej z osi i ziarna chwili wybuchu — nowy wpis stoi tam, gdzie stary (bez skoku)');
  R._cvWreckEpoch.clear();
  const e3 = { sprite: rig2.root, canonical: true, rig: rig2, isModel3D: true, cvKilled: true };
  R._vessels.set('b1', e3);
  R._cvWpnKillLook('b1', e3);
  assert(e3.cvWreck?.t0 === null && e3.cvWreck?.tDrift === null && R._cvDmgDrift?.('b1', env) === null,
    'D8f KONTROLA: bez epoki (nowa sesja — wczytanie zapisu) wrak odbudowany bez osi dryfu — stoi w swojej kotwicy');
  // KONTROLA: flaga OFF — łata CV-3a3 (`_spawnFx`) w chwili trafienia
  GAME_CONFIG.FEATURES.cvDamage = false;
  const R2 = fakeR();
  const s2 = [addShip(R2, 'a1', { x: -0.05 }), addShip(R2, 'b1', { x: 0.05, enemy: true })];
  kosmosFor(s2);
  R2._cvWpnRoundFx(payload(2, [pev('a1', 'b1', 'short', { killed: true, hpAfter: -4 })]));
  runFrames(R2, (R2._cvLedger?.killAt?.('b1') ?? 0) + 200);
  GAME_CONFIG.FEATURES.cvDamage = true;
  assert(R2.legacy >= 1 && !R2._cvDmg && (R2._fxEngine?.stats?.().pools?.blast?.spawned ?? 0) === 0, 'D8d KONTROLA: `cvDamage` OFF — łata (kula ognia `_spawnFx`), pule CV-5 puste, stanu CV-5 brak');
});

// ── D9 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D9 — sekwencja pancernika w pulach: wtórne przed głównym; pauza — zero nowych cząstek');
withFlags(ON, () => {
  const R = fakeR();
  const ships = [addShip(R, 'bb', { x: 0, hull: 'hull_cruiser' })];
  kosmosFor(ships);
  runFrames(R, 32);
  const res = R.cvExplodeVessel('bb');
  const seq = R._cvDmg?.seqs?.[0];
  const plan = seq?.plan;
  const flashes0 = R._fxEngine.stats().pools.blast.spawned;
  runFrames(R, 120);
  const atSec = R._fxEngine.stats().pools.blast.spawned;
  runFrames(R, 300, { paused: true });
  const paused = R._fxEngine.stats().pools.blast.spawned;
  runFrames(R, (plan?.mainAt ?? 900) + 200);
  const after = R._fxEngine.stats();
  console.log(`     cvExplodeVessel: ${JSON.stringify(res)}; cząstki wybuchu: start ${flashes0}, po 120 ms ${atSec}, po pauzie ${paused}, po wybuchu głównym ${after.pools.blast.spawned}; odłamki ${after.pools.debris.spawned}`);
  assert(res?.ok && res.cls === 'battleship' && plan?.secondaries?.length >= 2 && plan.mainAt > plan.secondaries[plan.secondaries.length - 1].at,
    'D9a pancernik: 2–3 wtórne, wybuch główny po ostatnim wtórnym');
  assert(flashes0 > 0 && atSec >= flashes0 && after.pools.blast.spawned > atSec && after.pools.debris.spawned > 0, 'D9b cząstki w pulach rosną z sekwencją (wtórny w chwili 0, główny z odłamkami później)');
  assert(paused === atSec, 'D9c pauza — sekwencja stoi (zero nowych cząstek)');
});

// ── D10 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D10 — emitery stanów uszkodzeń z HP pokazywanego; budżet presetu');
const emitFor = (hpFrac, eff = null) => withFlags({ ...ON, cvPresets: !!eff }, () => {
  const R = fakeR();
  if (eff) R._gfx = { eff };
  const ships = [addShip(R, 'a1', { x: -0.05 }), addShip(R, 'b1', { x: 0.05, enemy: true })];
  const enc = { id: 'enc_d', location: { systemId: SYS }, vesselStates: new Map([['b1', { hp: 100 * hpFrac, hpStart: 100, shieldHP: 0, shieldHPStart: 0 }]]) };
  kosmosFor(ships, { enc });
  let gates = 0, frames = 0;
  for (let t = 0; t < 3000; t += 16) { clock.now += 16; R._tickCvFx(); frames++; if (R._vessels.get('b1').cvDmgSputter != null && R._vessels.get('b1').cvDmgSputter < 1) gates++; }
  const st = R._cvDmg?.stats ?? {};
  return { smoke: st.dmgSmoke ?? 0, fire: st.dmgFire ?? 0, sparks: st.sputterSparks ?? 0, gates, frames, level: R._vessels.get('b1').cvDmgLevel };
});
guard('D10', () => {
  const r = { 90: emitFor(0.9), 60: emitFor(0.6), 40: emitFor(0.4), 20: emitFor(0.2) };
  for (const [k, v] of Object.entries(r)) console.log(`     HP ${k} %: poziom ${v.level}, dym ${v.smoke}, ogień ${v.fire}, iskry ${v.sparks}, klatki zakrztuszenia ${v.gates}/${v.frames}`);
  assert(r[90].smoke === 0 && r[90].fire === 0 && r[90].level === 0, 'D10a HP 90 % — nic');
  assert(r[60].smoke > 0 && r[60].fire === 0 && r[60].level === 1, 'D10b HP 60 % — dym, bez ognia');
  assert(r[40].smoke > r[60].smoke && r[40].fire > 0 && r[40].gates === 0, 'D10c HP 40 % — więcej dymu i ogień, silnik bez zakrztuszeń');
  assert(r[20].fire > r[40].fire && r[20].gates > 0 && r[20].gates < r[20].frames && r[20].sparks > 0, 'D10d HP 20 % — krztuszący się silnik (smuga przerywa w części klatek, iskry z dyszy)');
  const med = emitFor(0.4, { damageSmoke: 'fire', smoke: true, embers: false, debris: 12, particles: 6000 });
  const low = emitFor(0.2, { damageSmoke: 'off', smoke: false, embers: false, debris: 0, particles: 2000 });
  assert(med.smoke === 0 && med.fire > 0, 'D10e Medium (dym uszkodzeń „fire”): sam ogień');
  assert(low.smoke === 0 && low.fire === 0 && low.gates > 0, 'D10f Low: bez dymu i ognia uszkodzeń (krztuszenie smugi zostaje — to nie cząstki)');
});

// ── D11 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D11 — gorąca ścieżka: wybuchy i emitery bez konstrukcji THREE i tablic typowanych po rozgrzewce');
withFlags(ON, () => {
  const R = fakeR();
  const ships = [];
  for (let i = 0; i < 6; i++) ships.push(addShip(R, 'z' + i, { x: i * 0.03, hull: i % 2 ? 'hull_cruiser' : 'hull_frigate' }));
  const enc = { id: 'enc_d', location: { systemId: SYS }, vesselStates: new Map(ships.map((s, i) => [s.id, { hp: 15 + 10 * i, hpStart: 100, shieldHP: 0, shieldHPStart: 0 }])) };
  kosmosFor(ships, { enc });
  R.cvExplodeVessel('z0'); runFrames(R, 1500);   // rozgrzewka: silnik, kwaterniony / wektory pomocnicze
  const probe = () => { const o = new THREE.Object3D(), m = new THREE.Material(), g = new THREE.BufferGeometry(), t = new THREE.Texture(); const ids = [o.id, m.id, g.id, t.id]; m.dispose(); g.dispose(); t.dispose(); return ids; };
  const names = ['Float32Array', 'Float64Array', 'Uint16Array', 'Uint32Array', 'Int32Array', 'Uint8Array'];
  const saved = {}; let typed = 0;
  const i0 = probe();
  for (const n of names) { saved[n] = globalThis[n]; globalThis[n] = new Proxy(saved[n], { construct(T, args) { typed++; return new T(...args); } }); }
  try { for (let k = 1; k < 6; k++) { R.cvExplodeVessel('z' + k); runFrames(R, 800); } runFrames(R, 2000); } finally { for (const n of names) globalThis[n] = saved[n]; }
  const i1 = probe();
  const st = R._fxEngine.stats();
  console.log(`     6 wybuchów + emitery: szczyt dym ${st.pools.smoke.peak} / wybuchy ${st.pools.blast.peak} / odłamki ${st.pools.debris.peak}; kradzieże ${st.pools.smoke.steals + st.pools.blast.steals + st.pools.debris.steals}`);
  assert(i1.every((v, j) => v - i0[j] === 1) && typed === 0, `D11a zero konstrukcji THREE (przyrost id ${i1.map((v, j) => v - i0[j] - 1).join('/')}) i tablic typowanych (${typed})`);
  assert(st.pools.blast.steals + st.pools.smoke.steals + st.pools.debris.steals === 0, 'D11b pule uszkodzeń bez kradzieży slotów');
  const SRC = strip(read('src/renderer/combat/FxEngine.js'));
  const body = (name) => { const i = SRC.indexOf(`\n  ${name}(`); if (i < 0) return null; const a = SRC.indexOf('{', i); return SRC.slice(a, SRC.indexOf('\n  }\n', a)); };
  const HOT = ['spawnBlast', 'spawnDebris', '_followDmg', '_dmgEpochFor'];
  const bad = HOT.filter((n) => { const b = body(n); return b == null || /\bnew\s+[A-Z]/.test(b); });
  assert(bad.length === 0, `D11c źródło: gorąca ścieżka pul uszkodzeń (${HOT.length} metod) bez \`new\`${bad.length ? ' — ' + bad.join(', ') : ''}`);
});

// ── D12 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D12 — wypalanie wraku: tryb 1, żar stygnie; flaga OFF — wygląd CV-1a (tryb 0)');
withFlags(ON, () => {
  const R = fakeR();
  const ships = [addShip(R, 'w1', { x: 0 })];
  kosmosFor(ships);
  runFrames(R, 32);
  R.cvExplodeVessel('w1');
  const e = R._vessels.get('w1');
  const u = KC.keyColourUniformsOf(e.rig.materials[0]);
  const h0 = u.uKcHeat.value, m0 = u.uKcBurnMode.value, b0 = u.uKcBurn.value.x;
  runFrames(R, 6000);
  const h1 = u.uKcHeat.value, b1 = u.uKcBurn.value.x;
  console.log(`     tryb ${m0}, żar ${h0.toFixed(3)} → ${h1.toFixed(3)} po 6 s, szwy R ${b0.toFixed(2)} → ${b1.toFixed(2)}, iskry R ${u.uKcEmber.value.x.toFixed(2)}`);
  assert(m0 === 1 && h0 === 1 && h1 < 0.75 && b1 < b0 && u.uKcEmber.value.x > 0, 'D12a tryb 1 (szwy), żar od 1 stygnie, iskry zimnego kadłuba rosną');
  const rig = RIG.buildShipRig({ THREE, template: TPL, hardpoints: HPTS.defaultHardpoints('warp_frigate'), targetSize: L, kind: 'own' });
  RIG.paintRigMaterials(THREE, rig.materials, 'wreck', { burnHot: true });
  const uo = KC.keyColourUniformsOf(rig.materials[0]);
  assert(uo.uKcBurnMode.value === 0 && uo.uKcEmber.value.x === 0 && uo.uKcBurn.value.x > 1, 'D12b `paintRigMaterials(\'wreck\')` (ścieżka OFF): tryb 0, bez iskier, żar CV-1a');
  const ADD = TR.slice(TR.indexOf('\n  _addVesselModelCv('), TR.indexOf('\n  _addVesselModelCv(') + 6000);
  assert(R._cvDebugKilled?.has?.('w1') === true && /this\._cvDebugKilled\?\.has\(vessel\.id\)/.test(ADD),
    'D12c zniszczenie z `cvExplode` zapamiętane; przebudowa (`_addVesselModelCv`) odtwarza je jako wrak (pin źródłowy — metoda ładuje GLB)');
});

// ── D13 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D13 — wstawka wierzchołka (prawdziwy ShaderLib.standard), gałąź trybu 0 = wyrażenia CV-1a');
guard('D13', () => {
  const v = THREE.ShaderLib.standard.vertexShader;
  const out = KC.injectKeyColourVertex(v);
  assert(out.split('varying vec3 vKcObj;').length === 2 && out.indexOf('vKcObj = position;') > out.indexOf('#include <begin_vertex>')
    && out.indexOf('varying vec3 vKcObj;') > out.indexOf('#include <common>'), 'D13a deklaracja po `common`, zapis po `begin_vertex`, każde raz');
  let dbl = false, miss = false;
  try { KC.injectKeyColourVertex(out); } catch { dbl = true; }
  try { KC.injectKeyColourVertex(v.replace('#include <begin_vertex>', '')); } catch { miss = true; }
  assert(dbl && miss, 'D13b podwójna transformacja i brak kotwicy — głośny wyjątek');
  assert(/uKcBurnMode < 0\.5\)\s*\{\s*float kcR2 = kcRim \* kcRim;\s*totalEmissiveRadiance \+= uKcBurn \* \(uKcBurnMul \* \(0\.03 \+ 0\.97 \* kcR2 \* kcR2\)\);/.test(KC.KC_MAIN_GLSL),
    'D13c gałąź trybu 0 = wyrażenie żaru CV-1a (krawędź fresnel⁴ + 3 %) co do znaku');
  const m = new THREE.MeshStandardMaterial({ map: tex });
  KC.applyKeyColour(m, HPTS.defaultHardpoints('x').keyColour);
  const sh = { uniforms: {}, fragmentShader: THREE.ShaderLib.standard.fragmentShader, vertexShader: v };
  m.onBeforeCompile(sh);
  assert(sh.vertexShader.includes('vKcObj = position;') && sh.uniforms.uKcBurnMode && sh.uniforms.uKcTime === KC.KC_SHARED.uKcTime && m.customProgramCacheKey() === KC.KC_PROGRAM_KEY,
    'D13d `onBeforeCompile`: wstawka wierzchołka, uniformy trybu i czas wspólny, jeden klucz programu');
  // D13e — matowy wypalony kadłub WYŁĄCZNIE w trybie 1 (tryb 0 / CV-1a i statki żywe — szorstkość i metaliczność nietknięte przez wypalanie).
  // ARC CV-4b — PRZECELOWANE ŚWIADOMIE (decyzja 42 (a), Finding 707): dwa nowe zapisy poza bramką wypalania — podłoga szorstkości ŻYWYCH kadłubów
  // `max(roughnessFactor, uKcRoughMin)` (wspólne pokrętło `MODEL_ROUGH_MIN`; 0 — szorstkość z mapy jak CV-1a) i osmalenia pod `uKcScorchN > 0,5`
  // (statek bez plam — gałąź pominięta). Wypalanie zostaje przy swoich 2 zapisach pod `uKcBurnMode > 0,5`; reszta pinu bez zmian.
  const G = KC.KC_MAIN_GLSL;
  const gate = G.match(/if \(uKcBurnMode > 0\.5\) \{([^}]*)\}/);
  const writes = (G.match(/(roughnessFactor|metalnessFactor)\s*=/g) ?? []).length;
  const floorW = (G.match(/roughnessFactor = max\(roughnessFactor, uKcRoughMin\);/g) ?? []).length;
  const scorchBlock = G.match(/if \(uKcScorchN > 0\.5\) \{([\s\S]*?)\n  \}\n  if \(uKcBurnMode > 0\.5\)/);
  const scorchW = scorchBlock ? (scorchBlock[1].match(/(roughnessFactor|metalnessFactor)\s*=/g) ?? []).length : -1;
  assert(!!gate && /roughnessFactor = max\(roughnessFactor,/.test(gate[1]) && /metalnessFactor = min\(metalnessFactor,/.test(gate[1])
    && floorW === 1 && scorchW === 2 && writes === 2 + floorW + scorchW
    && sh.fragmentShader.indexOf('roughnessFactor = max') > sh.fragmentShader.indexOf('#include <metalnessmap_fragment>')
    && sh.fragmentShader.indexOf('roughnessFactor = max') < sh.fragmentShader.indexOf('#include <lights_physical_fragment>'),
    `D13e szorstkość i metaliczność: wypalanie — 2 zapisy pod \`uKcBurnMode > 0,5\`; poza nim wyłącznie podłoga 707 (\`uKcRoughMin\`, ${floorW}) i osmalenia pod \`uKcScorchN\` (${scorchW}); po mapach, przed oświetleniem (razem ${writes})`);
});

// ── D14 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D14 — źródło: zero Math.random; rozgrzewka pul (Finding 644)');
guard('D14', () => {
  const files = ['src/renderer/combat/ExplosionLogic.js', 'src/renderer/combat/FxEngine.js', 'src/renderer/combat/FxShaders.js'];
  const dirty = files.filter((f) => /\bMath\.random\b/.test(strip(read(f))));
  const dmg = METHODS.filter((n) => n.startsWith('_cvDmg') || n === 'cvExplodeVessel').map((n) => methodOf(n)?.body ?? '').join('\n');
  assert(dirty.length === 0 && !/\bMath\.random\b/.test(dmg) && dmg.length > 3000, `D14a ExplosionLogic, silnik, shadery i metody _cvDmg*: zero Math.random${dirty.length ? ' — ' + dirty.join(', ') : ''}`);
  const ens = methodOf('_ensureFxEngine')?.body ?? '';
  assert(/\.prewarm\?\.\(this\.renderer, this\.camera\)/.test(strip(ens)), 'D14b `_ensureFxEngine` rozgrzewa pule (programy i bufory przed pierwszą salwą)');
  // prawdziwy prewarm na atrapie renderera: każda pula „narysowana” raz (widoczna w chwili rysowania), widoczność przywrócona
  const eng = new ENGINE.FxEngine({ THREE, parent: new THREE.Group() });
  const seen = new Set();
  const fakeRend = { getRenderTarget: () => null, setRenderTarget: () => {}, render: (root) => root.traverse((o) => { if (o.isMesh && o.visible) seen.add(o.name); }), info: { programs: [] } };
  const r = eng.prewarm(fakeRend, new THREE.PerspectiveCamera());
  const names = [...eng.pools, ...eng.dmgPools].map((p) => p.mesh.name);
  assert(r.ok && names.every((n) => seen.has(n)) && [...eng.pools, ...eng.dmgPools].every((p) => p.mesh.visible === false), `D14c prewarm: ${names.length} pul narysowanych raz, potem ukrytych (puste)`);
});


// ── D15 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D15 — CV-3c: dryf wraku po bitwie; zniszczenie odroczone do trafienia w locie — dryf dopiero od wybuchu');
const d15Run = (choreo2) => withFlags({ ...ON, cvChoreo2: choreo2 }, () => {
  const R = fakeR();
  R.cvTuning = { ...R.cvTuning, WRECK_CONVERGE_MS: 300 };   // zbieżność krótsza od lotu rakiety (~1,2 R) — trafienie przychodzi PO niej
  const ships = [addShip(R, 'a1', { x: -0.05 }), addShip(R, 'b1', { x: 0.05, enemy: true }), addShip(R, 'b2', { x: 0.09, z: 0.03, enemy: true })];
  kosmosFor(ships);
  // b2 — rakieta zabijająca w locie (rejestr: 'pending' do chwili trafienia); b1 — wrak bez zapisu w rejestrze (pokazany od razu)
  R._cvWpnRoundFx(payload(2, [pev('a1', 'b2', 'long', { killed: true, hpAfter: -4 })]));
  runFrames(R, 32);
  const killAt = R._cvLedger?.killAt?.('b2') ?? null;
  for (const v of ships.slice(1)) { v.isWreck = true; v.wreckLocation = { x: v.position.x, y: v.position.y }; }
  R._onWrecked?.call(R, { vesselId: 'b1', vessel: ships[1] });
  R._onWrecked?.call(R, { vesselId: 'b2', vessel: ships[2] });
  const e1 = R._vessels.get('b1'), e2 = R._vessels.get('b2');
  const convMs = (R.cvTuning?.WRECK_CONVERGE_MS ?? 1200) + 100;
  runFrames(R, convMs);
  const nowConv = R._presClock?.nowMs ?? 0;
  const st = { killAt, nowConv, pendingAtConv: R._cvLedger?.killState?.('b2') === 'pending' && !e2?.cvKilled, conv1Done: !e1?.cvWreck?.conv, conv2Done: !e2?.cvWreck?.conv,
    after1: !!e1?.cvWreck?.after, after1Rot: e1?.cvWreck?.after?.rotate === true, after2AtConv: !!e2?.cvWreck?.after };
  // po trafieniu zabijającym (wybuch odroczony) — dryf rusza; pierwszy krok łapie bieżący obrót (bez skoku)
  const toKill = Math.max(0, (killAt ?? 0) - nowConv) + 120;
  runFrames(R, toKill);
  st.killed2 = !!e2?.cvKilled;
  st.after2 = !!e2?.cvWreck?.after;
  st.after2Rot = e2?.cvWreck?.after?.rotate === true;
  const q0 = e2?.cvWreck?.after?.q0 ? [...e2.cvWreck.after.q0] : null;
  const p0 = e2?.sprite?.position?.clone?.() ?? null;
  const qNow = e2?.sprite?.quaternion ? [e2.sprite.quaternion.x, e2.sprite.quaternion.y, e2.sprite.quaternion.z, e2.sprite.quaternion.w] : null;
  runFrames(R, 32);
  const p1 = e2?.sprite?.position ?? null;
  st.jumpL = p0 && p1 ? p0.distanceTo(p1) / L : NaN;
  st.qDelta = q0 && qNow ? Math.max(...q0.map((v, i) => Math.abs(Math.abs(v) - Math.abs(qNow[i])))) : NaN;
  // dryf idzie dalej i staje (koniec po 5 τ)
  const pA = e2?.sprite?.position?.clone?.() ?? null;
  runFrames(R, 4000);
  st.moved4s = pA && e2?.sprite ? pA.distanceTo(e2.sprite.position) / L : NaN;
  return st;
});
{
  const on = d15Run(true);
  console.log(`     ON: rakieta zabija w ${on?.killAt?.toFixed?.(0)} ms, zbieżność w ${on?.nowConv?.toFixed?.(0)} ms; b1 dryf ${on?.after1} (obrót ${on?.after1Rot}); b2 przy zbieżności: oczekuje ${on?.pendingAtConv}, dryf ${on?.after2AtConv}; po wybuchu: dryf ${on?.after2} (obrót ${on?.after2Rot}), skok ${on?.jumpL?.toExponential?.(2)} L, Δq ${on?.qDelta?.toExponential?.(2)}, ruch przez 4 s ${on?.moved4s?.toFixed?.(3)} L`);
  assert(!!on && on.conv1Done && on.after1 && on.after1Rot, 'D15a zwykły wrak: po zbieżności do miejsca śmierci rusza dryf z pokrzywionym obrotem');
  assert(!!on && on.after1 && on.conv2Done && on.pendingAtConv && on.after2AtConv === false,
    'D15b SEDNO: zniszczenie odroczone (rakieta jeszcze w locie przy końcu zbieżności) — bez dryfu, dopóki statek wygląda na żywy (ŚWIADKOWIE: dryf działa — b1, zbieżność skończona, rejestr „pending”)');
  assert(!!on && on.killed2 && on.after2 && on.after2Rot && on.jumpL < 0.02 && on.qDelta < 0.02 && on.moved4s > 0,
    'D15c wybuch odroczony: dryf rusza od wybuchu — z bieżącego miejsca i obrotu (bez skoku), wrak płynie dalej');
  // CV-Z — D15d (KONTROLA „`cvChoreo2` OFF — bez dryfu”) wycofane razem z flagą; dryf po bitwie jest jedyną ścieżką.
}


// ── D16 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('D16 — CV-3c: pokazane zniszczenie gasi wyloty dysz od razu');
withFlags({ ...ON, cvChoreo2: true }, () => {
  const R = fakeR();
  const ships = [addShip(R, 'a1', { x: -0.05 }), addShip(R, 'b1', { x: 0.05, enemy: true })];
  kosmosFor(ships);
  const e = R._vessels.get('b1');
  const gl = e?.rig?.glows ?? [];
  for (const g of gl) g.group.visible = true;   // stan „w locie” (wylot zapalony)
  const litBefore = gl.filter((g) => g.group.visible).length;
  R._cvWpnKillLook('b1', e);
  const litAfter = gl.filter((g) => g.group.visible).length;
  console.log(`     wyloty: ${gl.length}, zapalone przed ${litBefore}, po pokazanym zniszczeniu ${litAfter}`);
  assert(gl.length > 0 && litBefore === gl.length && litAfter === 0, 'D16 SEDNO: pokazane zniszczenie gasi wszystkie wyloty dysz od razu (ŚWIADEK: wyloty istnieją i świeciły przed wywołaniem)');
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
