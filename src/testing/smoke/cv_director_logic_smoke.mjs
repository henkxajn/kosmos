// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARC COMBAT VISUALS, krok CV-7: KAMERA REŻYSERA, spowolnienie bohatera, 9:16, tryb nagrywania (flaga `cvDirector`;
// COMBAT_VISUALS_PLAN.md §2.7, D-CV-23, D-CV-24 / §3.1-3; Findingi 658, 710).
// Uruchom: node src/testing/smoke/cv_director_logic_smoke.mjs
//
// Wyłącznie LOGIKA (protokół F11): bez pinów na stałych rysunku — liczby z tabeli pokręteł modułu (`DIR_TUNING`).
// Moduły powstają w kroku CV-7 — import dynamiczny (brak modułu = piny padają, suita się nie przerywa).
//   K1  harmonogram deterministyczny: to samo ziarno i te same wejścia → te same ujęcia; inne ziarno → inny harmonogram
//   K2  to samo ujęcie nigdy dwa razy z rzędu; każde ujęcie ≥ DIR_SHOT_MIN_MS (także przed wynikiem), przerwane przez bohatera —
//       ≥ DIR_HERO_PREEMPT_MIN_MS (rytm bohatera bez zmian); typowe ujęcie 4–7 s, plan ogólny i wynik dłuższe; cięcie (przelot,
//       bohater spoza kadru) najwyżej raz na DIR_CUT_GAP_MS — losowe ziarna i losowe zniszczenia (tempo po kontroli właściciela CV-7)
//   K3  bohater: wyłącznie zniszczenie godne bohatera (niszczyciel+, ostatni okręt strony), start przed trafieniem zabijającym
//       (≥ DIR_HERO_LEAD_MIN_MS), trzymanie przez wybuch, odstęp między bohaterami, `heroAllowed: false` — bez bohatera; pierwsze
//       ujęcie = plan ogólny, koniec bitwy = wynik
//   K4  spowolnienie (§3.1-3): tempo ≥ 0,35×, spowolnienie ≤ 0,8 s realnego, dodatkowe opóźnienie ≤ 1,5 R (sufit kończy ujęcie
//       wcześniej), doganianie 1,25× do zera (bilans czasu prezentacji = czas realny), nowy bohater dopiero poniżej 1 R, koniec
//       bitwy w trakcie — reszta w tempie 1,25×, prezentacja skończona — tempo 1
//   K5  pauza zamraża: spowolnienie stoi (opóźnienie bez zmian), zegar prezentacji z mnożnikiem — krok 0; mnożnik 1 — krok co do
//       bitu jak bez mnożnika; harmonogram bez upływu czasu — to samo ujęcie
//   K6  przejęcie: każda zmiana stanu kontrolera (kąty, dystans, cel, animacja) wykryta; ten sam stan — bez fałszywego przejęcia;
//       chip: wyłączony → gotowy → wyłączony, wstrzymany → gotowy; KLEJ (prawdziwy `CvDirector`) — wejście w klatce N, reżyser
//       w klatce N+1 nie pisze, klik chipa wznawia
//   K7  strażnicy: kamera nigdy w kadłubie / ciele / gwieździe, linia widzenia omija gwiazdę (losowe układy)
//   K8  9:16: kadr 9:16 wyśrodkowany, prostokąt bezpieczny w kadrze; kadr ujęcia w prostokącie 9:16 zawiera kadrowane okręty
//   K9  tryb nagrywania: wejście / wyjście przywraca DOKŁADNIE (klasa, czysty widok — także gdy był włączony, flaga); reguła CSS
//       zostawia scenę 3D, warstwę zdarzeń i przewodnik; klawisz F9 bez modyfikatorów
//   K10 wstrząs: zero w zoomie taktycznym i poza kadrem, sufit kąta, zanik na zegarze prezentacji, bez urazu — bez obrotu
//   K11 rejestr salw — odczyty reżysera: zniszczenia nadchodzące (kolejność, bez pokazanych), czekające, najzajętsze pary
//   K12 i18n — klucze PL + EN chipa
//   K13 klej: oba zegary prezentacji z JEDNYM mnożnikiem tempa (pętla: mnożnik przed zegarami), auto-fokus ustępuje reżyserowi
//   K14 nagrywarka rolek (F10, zmiana 2 po kontroli właściciela): MP4 (H.264) przed WebM VP9, nazwa pliku z chwili startu,
//       9:16 → 1080 × 1920 z wycinka kadru 9:16 (px bufora), bez przewodnika — całe płótno (wymiary parzyste); klawisz F10;
//       wskaźnik „● REC” poza nagraniem i widoczny w trybie nagrywania; klatka bez alokacji, kopia tuż po renderze; nic do zapisu
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };
const guard = (name, fn) => { try { fn(); } catch (e) { ok(false, `${name}: wyjątek — ${e.message}`); } };

const D = await tryImport('../../renderer/combat/CameraDirectorLogic.js');
const CL = await tryImport('../../renderer/combat/CombatLedgerLogic.js');
const PC = await tryImport('../../renderer/combat/PresentationClock.js');
const CM = await tryImport('../../ui/CaptureMode.js');
const CD = await tryImport('../../renderer/CvDirector.js');
const FX = await tryImport('../../renderer/combat/FxEngine.js');
const RR = await tryImport('../../renderer/ReelRecorder.js');
const T = D?.DIR_TUNING ?? {};
const SHOT = D?.SHOT ?? {};

// Deterministyczny generator keepera (nie `Math` losujący — przebiegi powtarzalne niezależnie od ziarna środowiska).
const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** Przebieg harmonogramu: krok 16 ms do `endMs`, zniszczenia widoczne w horyzoncie rejestru; zwraca listę ujęć { type, start, end, … }. */
function runSchedule(seed, kills, { endMs = 60000, doneAt = 56000, heroAllowed = () => true, avail = { follow: true, duel: true, flyby: true }, step = 16 } = {}) {
  const s = new D.DirectorSchedule({ seed });
  const shots = [];
  for (let t = 0; t <= endMs; t += step) {
    const ks = kills.filter((k) => k.at > t && k.at - t <= 1300).map((k) => ({ ...k }));
    const sh = s.step(t, { available: avail, kills: ks, heroAllowed: heroAllowed(t), done: t >= doneAt }, T);
    const last = shots[shots.length - 1];
    if (!last || last.index !== sh.index) {
      if (last) last.end = t;
      shots.push({ type: sh.type, index: sh.index, start: t, end: null, subject: sh.subjectId ?? null, killAt: sh.killAt ?? null, side: sh.side });
    }
  }
  return shots;
}
const KILLS = [{ id: 'bb1', at: 5200, hero: true }, { id: 'fr1', at: 9000, hero: false }, { id: 'dd2', at: 9300, hero: true },
  { id: 'dd3', at: 20000, hero: true }, { id: 'last', at: 41000, hero: true }];

header('K1 — harmonogram deterministyczny');
guard('K1', () => {
  const a = runSchedule(7, KILLS), b = runSchedule(7, KILLS), c = runSchedule(8, KILLS);
  const sig = (x) => JSON.stringify(x.map((s) => [s.type, s.start, s.end, s.subject, s.side]));
  ok(a.length > 8 && sig(a) === sig(b), `K1a to samo ziarno i te same wejścia → te same ujęcia (${a.length} ujęć)`);
  ok(sig(a) !== sig(c), 'K1b inne ziarno → inny harmonogram (typy, chwile albo strony)');
  ok(D?.ledgerRng === undefined && !/Math\.random/.test(strip(src('../../renderer/combat/CameraDirectorLogic.js')))
    && !/Math\.random/.test(strip(src('../../renderer/CvDirector.js'))), 'K1c logika i klej reżysera bez `Math.random` (reguła CV-0b)');
});

header('K2 — bez powtórzeń z rzędu; każde ujęcie ≥ minimum (losowe ziarna i zniszczenia)');
guard('K2', () => {
  const rnd = rngOf(12345);
  let repeats = 0, shortN = 0, total = 0, heroes = 0, minLen = Infinity, preShort = 0, preN = 0, minPre = Infinity;
  const lens = [];
  for (let k = 0; k < 120; k++) {
    const kills = [];
    let t = 1500 + rnd() * 3000;
    while (t < 52000) { kills.push({ id: `v${k}_${kills.length}`, at: t, hero: rnd() < 0.5 }); t += 300 + rnd() * 4000; }
    const shots = runSchedule(1000 + k, kills, { heroAllowed: (tt) => (Math.floor(tt / 7000) % 3) !== 2 });
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      total++;
      if (s.type === SHOT.HERO) heroes++;
      if (i > 0 && shots[i - 1].type === s.type) repeats++;
      if (s.end == null || s.type === SHOT.HERO) continue;   // bohater — własny rytm (wejście przed trafieniem + trzymanie)
      const len = s.end - s.start;
      if (shots[i + 1]?.type === SHOT.HERO) { preN++; minPre = Math.min(minPre, len); if (len < T.DIR_HERO_PREEMPT_MIN_MS - 16) preShort++; continue; }
      minLen = Math.min(minLen, len); if (len < T.DIR_SHOT_MIN_MS - 16) shortN++;
      if (s.type !== SHOT.ESTABLISHING && s.type !== SHOT.RESULT) lens.push(len);
    }
  }
  ok(total > 1000 && heroes > 50, `K2a przebiegi z treścią (${total} ujęć, ${heroes} bohaterów)`);
  ok(repeats === 0, `K2b żadne ujęcie dwa razy z rzędu (${repeats})`);
  ok(shortN === 0, `K2c każde ujęcie ≥ ${T.DIR_SHOT_MIN_MS} ms (najkrótsze ${Math.round(minLen)} ms, za krótkich ${shortN})`);
  ok(preN > 50 && preShort === 0, `K2c2 ujęcie przerwane przez bohatera ≥ ${T.DIR_HERO_PREEMPT_MIN_MS} ms (rytm bohatera; ${preN} przerwań, najkrótsze ${Math.round(minPre)} ms)`);
  lens.sort((a, b) => a - b);
  const med = lens[Math.floor(lens.length / 2)];
  ok(T.DIR_SHOT_MIN_MS >= 3000 && med >= 4000 && med <= 7000 && T.DIR_EST_MIN_MS >= T.DIR_FOLLOW_MIN_MS && T.DIR_RESULT_HOLD_MS >= T.DIR_WIDE_MIN_MS
    && T.DIR_EASE_MS >= 1200 && T.DIR_EASE_MS <= 1600,
    `K2c3 tempo: mediana zwykłego ujęcia ${Math.round(med)} ms (4–7 s), plan ogólny i wynik dłuższe, przejście ${T.DIR_EASE_MS} ms (1,2–1,6 s)`);
  const types = new Set(runSchedule(3, KILLS).map((s) => s.type));
  ok(['follow', 'duel', 'flyby', 'wide'].every((x) => types.has(x)), `K2d różnorodność: plan ogólny, za okrętem, pojedynek, przelot, szeroki w jednej bitwie (${[...types].join(', ')})`);
  // Cięcia: przelot — tak, bohater — gdy poza kadrem; oba najwyżej raz na DIR_CUT_GAP_MS; reszta — przejście.
  ok(D.shotCut({ type: SHOT.FLYBY }, T) && !D.shotCut({ type: SHOT.FLYBY, sinceCutMs: T.DIR_CUT_GAP_MS - 1 }, T)
    && D.shotCut({ type: SHOT.HERO, subjectInView: false }, T) && !D.shotCut({ type: SHOT.HERO, subjectInView: true }, T)
    && !D.shotCut({ type: SHOT.HERO, subjectInView: false, sinceCutMs: 1000 }, T)
    && ['follow', 'duel', 'wide', 'establishing', 'result'].every((t) => !D.shotCut({ type: t }, T)),
    `K2f cięcie: przelot i bohater spoza kadru, najwyżej raz na ${T.DIR_CUT_GAP_MS} ms; pozostałe ujęcia — przejście wygładzone`);
  let lastCut = -Infinity, cuts = 0, tooClose = 0;
  for (const s of runSchedule(11, KILLS, { endMs: 240000, doneAt: 236000 })) {
    if (D.shotCut({ type: s.type, subjectInView: false, sinceCutMs: s.start - lastCut }, T)) { if (s.start - lastCut < T.DIR_CUT_GAP_MS) tooClose++; lastCut = s.start; cuts++; }
  }
  ok(cuts >= 2 && tooClose === 0, `K2g bitwa 4 min: ${cuts} cięć, żadne bliżej niż ${T.DIR_CUT_GAP_MS} ms od poprzedniego`);
  const noFly = runSchedule(3, KILLS, { avail: { follow: true, duel: false, flyby: false } });
  ok(noFly.every((s) => s.type !== SHOT.DUEL && s.type !== SHOT.FLYBY), 'K2e niedostępne ujęcie nie pada (brak pary / lecącej fregaty)');
});

header('K3 — bohater');
guard('K3', () => {
  const shots = runSchedule(7, KILLS);
  const hero = shots.filter((s) => s.type === SHOT.HERO);
  ok(shots[0].type === SHOT.ESTABLISHING, 'K3a pierwsze ujęcie — plan ogólny');
  ok(shots[shots.length - 1].type === SHOT.RESULT, 'K3b koniec bitwy — kadr wyniku');
  ok(hero.length >= 2 && hero.every((h) => KILLS.find((k) => k.id === h.subject)?.hero === true), `K3c bohater wyłącznie przy zniszczeniu godnym bohatera (${hero.map((h) => h.subject).join(', ')})`);
  ok(hero.every((h) => h.killAt - h.start >= T.DIR_HERO_LEAD_MIN_MS - 16), 'K3d bohater startuje przed trafieniem zabijającym (≥ DIR_HERO_LEAD_MIN_MS)');
  ok(hero.every((h) => h.end == null || Math.abs(h.end - (h.killAt + T.DIR_HERO_HOLD_MS)) <= 16), 'K3e trzymanie przez wybuch: koniec = trafienie + DIR_HERO_HOLD_MS');
  let gapOk = true;
  for (let i = 1; i < hero.length; i++) if (hero[i].start - hero[i - 1].end < T.DIR_HERO_GAP_MS - 16) gapOk = false;
  ok(gapOk, 'K3f odstęp między bohaterami ≥ DIR_HERO_GAP_MS (dd2 tuż po bb1 — bez bohatera)');
  const none = runSchedule(7, KILLS, { heroAllowed: () => false });
  ok(!none.some((s) => s.type === SHOT.HERO), 'K3g opóźnienie ≥ 1 R (`heroAllowed: false`) — bez bohatera');
  ok(D.heroWorthy({ cls: 'destroyer' }) && D.heroWorthy({ cls: 'battleship' }) && !D.heroWorthy({ cls: 'frigate' }) && D.heroWorthy({ cls: 'frigate', lastOfSide: true }),
    'K3h godny bohatera: niszczyciel, pancernik, ostatni okręt strony; fregata — nie');
});

header('K4 — spowolnienie bohatera (§3.1-3)');
const R0 = 1150;
function runWarp({ R = R0, frames = 600, dt = 16, startAt = [0], ended = () => false, done = () => false, paused = () => false } = {}) {
  const w = new D.PresentationWarp();
  let real = 0, pres = 0, minRate = Infinity, maxLag = 0, slowRun = 0, maxSlowRun = 0, starts = 0, refused = 0;
  const rates = [];
  for (let i = 0; i < frames; i++) {
    if (startAt.includes(i)) { if (w.startHero(R, T)) starts++; else refused++; }
    const p = paused(i);
    const r = w.step(dt, { R, paused: p, ended: ended(i), done: done(i) }, T);
    if (!p) { real += dt; pres += dt * r; minRate = Math.min(minRate, r); }
    maxLag = Math.max(maxLag, w.lagMs);
    if (w.phase === 'slow') { slowRun += dt; maxSlowRun = Math.max(maxSlowRun, slowRun); } else slowRun = 0;
    rates.push(r);
  }
  return { w, real, pres, minRate, maxLag, maxSlowRun, starts, refused, rates };
}
guard('K4', () => {
  const a = runWarp();
  ok(Math.abs(a.minRate - T.DIR_HERO_SLOW) < 1e-9 && a.rates.every((r) => r >= T.DIR_HERO_SLOW - 1e-9), `K4a tempo nigdy poniżej ${T.DIR_HERO_SLOW}× (najmniejsze ${a.minRate})`);
  ok(Math.abs(a.w.slowTotalMs - T.DIR_HERO_SLOW_MAX_MS) < 1e-6, `K4b spowolnienie ≤ ${T.DIR_HERO_SLOW_MAX_MS} ms realnego (${a.w.slowTotalMs})`);
  ok(a.w.maxLagMs <= T.DIR_HERO_LAG_CAP_R * R0 + 1e-6 && a.maxLag <= a.w.maxLagMs + 1e-9, `K4c dodatkowe opóźnienie ≤ ${T.DIR_HERO_LAG_CAP_R} R (${(a.maxLag / R0).toFixed(3)} R)`);
  ok(a.w.lagMs === 0 && Math.abs(a.pres - a.real) < 1e-6 && a.rates.some((r) => Math.abs(r - T.DIR_CATCHUP) < 1e-9),
    `K4d doganianie ${T.DIR_CATCHUP}× do zera — czas prezentacji = czas realny (różnica ${(a.pres - a.real).toFixed(6)} ms)`);
  const cap = runWarp({ R: 300 });   // krótka runda: sufit 1,5 R osiągnięty przed 0,8 s
  ok(Math.abs(cap.w.maxLagMs - T.DIR_HERO_LAG_CAP_R * 300) < 1e-6 && cap.w.slowTotalMs < T.DIR_HERO_SLOW_MAX_MS - 1,
    `K4e sufit 1,5 R kończy spowolnienie wcześniej (R 300: szczyt opóźnienia ${cap.w.maxLagMs.toFixed(1)} ms = ${(cap.w.maxLagMs / 300).toFixed(3)} R, spowolnienie ${cap.w.slowTotalMs.toFixed(1)} ms)`);
  const re = runWarp({ R: 300, startAt: [0, 40, 80] });
  ok(re.refused >= 1 && re.maxLag <= T.DIR_HERO_LAG_CAP_R * 300 + 1e-6,
    `K4f nowy bohater dopiero poniżej ${T.DIR_HERO_REARM_LAG_R} R (odmowy ${re.refused}, przyjęte ${re.starts})`);
  const w2 = new D.PresentationWarp(); w2.lagMs = T.DIR_HERO_REARM_LAG_R * R0;
  ok(!w2.canStartHero(R0, T) && (() => { const w3 = new D.PresentationWarp(); w3.lagMs = T.DIR_HERO_REARM_LAG_R * R0 - 1; return w3.canStartHero(R0, T); })(),
    'K4g próg ponownego bohatera dokładnie 1 R (≥ — odmowa, poniżej — zgoda)');
  // Koniec bitwy w trakcie spowolnienia: reszta w tempie 1,25× do końca prezentacji; prezentacja skończona — tempo 1.
  const e = runWarp({ ended: (i) => i >= 20, done: (i) => i >= 200 });
  const tail = e.rates.slice(60, 200);
  ok(tail.length > 0 && tail.every((r) => Math.abs(r - T.DIR_CATCHUP) < 1e-9) && e.rates.slice(200).every((r) => r === 1) && e.w.lagMs === 0,
    `K4h koniec logiki w trakcie bohatera — ogon ${T.DIR_CATCHUP}× do końca prezentacji, potem 1 (bez przestoju)`);
  const e2 = runWarp({ startAt: [], ended: () => true });
  ok(e2.rates.every((r) => r === 1), 'K4i koniec logiki bez bohatera i bez opóźnienia — tempo 1 (normalnie)');
});

header('K5 — pauza zamraża');
guard('K5', () => {
  const w = new D.PresentationWarp();
  w.startHero(R0, T); w.step(100, { R: R0 }, T);
  const lag = w.lagMs, slow = w.slowMs;
  for (let i = 0; i < 50; i++) w.step(16, { R: R0, paused: true }, T);
  ok(w.lagMs === lag && w.slowMs === slow && w.phase === 'slow', `K5a pauza: spowolnienie stoi (opóźnienie ${lag.toFixed(1)} ms bez zmian, faza „slow”)`);
  const c1 = new PC.PresentationClock(), c2 = new PC.PresentationClock();
  c1.tick(1000); c2.tick(1000);
  c1.tick(1016.7); c2.tick(1016.7, { rate: 1 });
  ok(c1.nowMs === c2.nowMs && c1.lastStepMs === c2.lastStepMs, 'K5b mnożnik 1 — krok zegara prezentacji co do bitu jak bez mnożnika');
  const c3 = new PC.PresentationClock(); c3.tick(0); c3.tick(16, { rate: 0.35 });
  const c4 = new PC.PresentationClock(); c4.tick(0); c4.tick(16, { paused: true, rate: 1.25 });
  ok(Math.abs(c3.lastStepMs - 16 * 0.35) < 1e-12 && c4.lastStepMs === 0, `K5c mnożnik skaluje krok (16 ms × 0,35 = ${c3.lastStepMs}); w pauzie krok 0 przy każdym mnożniku`);
  const s = new D.DirectorSchedule({ seed: 5 });
  const a = s.step(3000, { available: { follow: true } }, T), b = s.step(3000, { available: { follow: true } }, T);
  ok(a === b && a.index === b.index, 'K5d harmonogram bez upływu czasu prezentacji — to samo ujęcie');
});

header('K6 — przejęcie kamery i chip');
guard('K6', () => {
  const st = { theta: 0.5, phi: 1.1, dist: 0.8, target: { x: 1, y: 0.3, z: 2 }, animating: false };
  const mut = (f) => { const c = JSON.parse(JSON.stringify(st)); f(c); return c; };
  ok(!D.cameraTaken(st, JSON.parse(JSON.stringify(st))), 'K6a ten sam stan — bez przejęcia');
  const cases = [['θ (przeciąganie)', (c) => { c.theta += 0.01; }], ['φ', (c) => { c.phi -= 0.01; }], ['dystans (kółko)', (c) => { c.dist *= 1.1; }],
    ['cel (fokus / „Obserwuj” / Home)', (c) => { c.target.x += 0.001; }], ['animacja kątów (flyTo)', (c) => { c.animating = true; }]];
  ok(cases.every(([, f]) => D.cameraTaken(st, mut(f))), `K6b każda zmiana stanu kontrolera = przejęcie (${cases.map(([n]) => n).join(', ')})`);
  ok(D.chipNext('off') === 'armed' && D.chipNext('armed') === 'off' && D.chipNext('paused') === 'armed', 'K6c chip: wyłączony → gotowy → wyłączony; wstrzymany → gotowy (wznowienie)');
  // Klej: prawdziwy CvDirector na atrapie renderera i kontrolera kamery.
  if (!CD?.CvDirector) { ok(false, 'K6d moduł CvDirector'); return; }
  const prevKOS = globalThis.window.KOSMOS;
  const V3 = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
  const cc = { _theta: 0.3, _phi: 1.1, _goalTheta: null, _goalPhi: null, _dist: 5, _targetDist: 5, _goalTarget: V3().set(0, 0.3, 0), _target: V3().set(0, 0.3, 0),
    _isDragging: false, _hasMoved: false, _minDist: 0.3, setMinDist(v) { this._minDist = v; } };
  const ships = [];
  for (let i = 0; i < 6; i++) ships.push({ id: `s${i}`, x: 0.02 * i, y: 0.3, z: 0.01 * (i % 3) });
  const vessels = new Map(ships.map((s) => [s.id, { sprite: { visible: true, position: { x: s.x, y: s.y, z: s.z } } }]));
  const encs = [{ id: 'enc1', isActive: true, seedBase: 77, sideA: { ownerEmpireId: 'player', vesselIds: ['s0', 's1', 's2'] }, sideB: { ownerEmpireId: 'e', vesselIds: ['s3', 's4', 's5'] } }];
  const info = { id: 'enc1', encounterIds: ['enc1'], encs, ids: ships.map((s) => s.id) };
  const pres = { nowMs: 0, lastStepMs: 16 };
  const r = { _cameraController: cc, _vessels: vessels, _presClock: pres, _frameNo: 0, cvTuning: FX?.LIVE_CV_FX ?? {}, _stageFrame: { clusters: 1, list: [info] },
    _stageClusterOf: new Map([['enc1', info]]), _cvLedger: null, _planets: new Map(), _moons: new Map(), _planetoids: new Map(), _starGroup: null,
    camera: { fov: 55, aspect: 1600 / 1041 }, getVesselBowWorld: () => ({ x: 1, y: 0, z: 0 }), getBodyWorldInfo: () => null };
  globalThis.window.innerWidth = 1600; globalThis.window.innerHeight = 1041;
  globalThis.window.KOSMOS = { uiPrefs: {}, vesselManager: { getVessel: (id) => ({ id, shipId: 'hull_frigate', isEnemy: Number(id.slice(1)) >= 3, ownerEmpireId: Number(id.slice(1)) >= 3 ? 'e' : undefined }) },
    deepSpaceCombatSystem: { _activeEncounters: new Map([['enc1', encs[0]]]) }, timeSystem: { combatRoundMs: () => 1150 }, uiScale: 1 };
  try {
    const d = new CD.CvDirector(r);
    d.setArmed(true);
    const frame = () => { r._frameNo++; pres.nowMs += 16; d.tickCamera(); };
    for (let i = 0; i < 30; i++) frame();
    const wrote = d.active && d._lastWrite && cc._theta === d._lastWrite.theta && cc._targetDist === d._lastWrite.dist;
    ok(wrote, `K6d klej: włączony reżyser prowadzi bitwę i pisze stan kontrolera (sterowanie: ${d.info().control})`);
    ok(cc._minDist <= 0.05 + 1e-12, `K6d2 podłoga zoomu na czas bitwy ≤ 0,05 j. (jak „Obserwuj”) — kółko po przejęciu nie skacze na 0,3 (${cc._minDist})`);
    // Wejście gracza (kółko) między klatkami N i N+1
    const before = r._frameNo;
    cc._targetDist *= 1.25;
    frame();
    const dist1 = cc._targetDist;
    frame(); frame();
    ok(d.chipState === 'paused' && d.lastTakeBack?.frame === before + 1 && cc._targetDist === dist1 && !d.active,
      `K6e wejście w klatce ${before} → przejęcie w klatce ${d.lastTakeBack?.frame}; reżyser już nie pisze (dystans gracza zostaje)`);
    d.chipClick('enc1');
    frame(); frame();
    ok(d.chipState === 'armed' && d.active && cc._targetDist !== dist1, 'K6f klik chipa wznawia — reżyser znów prowadzi kamerę');
    cc._isDragging = true; cc._hasMoved = true; cc._theta += 0.0;   // przeciąganie bez ruchu kąta w tej klatce — sama flaga
    frame();
    ok(d.chipState === 'paused', 'K6g przeciąganie myszą (flaga kontrolera) — przejęcie');
    cc._isDragging = false; cc._hasMoved = false;
    d.chipClick('enc1'); frame();
    ok(d.takeBack('icon') === true && d.chipState === 'paused', 'K6h klik w ikonę / znak bitwy (`takeBack`) — przejęcie');
    d.setArmed(false);
    ok(d.chipState === 'off' && !d.active && !d.battle && cc._minDist === 0.3, 'K6i chip wyłączony — reżyser puszcza kamerę i bitwę; podłoga zoomu wraca do 0,3');
  } finally { globalThis.window.KOSMOS = prevKOS; }
});

header('K7 — strażnicy: kamera nigdy w kadłubie, ciele ani gwieździe');
guard('K7', () => {
  const rnd = rngOf(777);
  let bad = 0, starLine = 0, n = 0;
  for (let k = 0; k < 400; k++) {
    const c = { x: (rnd() - 0.5) * 20, y: 0.3, z: (rnd() - 0.5) * 20 };
    const ships = Array.from({ length: 12 }, () => ({ x: c.x + (rnd() - 0.5) * 0.4, y: 0.3 + (rnd() - 0.5) * 0.05, z: c.z + (rnd() - 0.5) * 0.4, len: [0.016, 0.03, 0.06][Math.floor(rnd() * 3)] }));
    const bodies = rnd() < 0.5 ? [{ x: c.x + (rnd() - 0.5) * 0.6, y: 0, z: c.z + (rnd() - 0.5) * 0.6, r: 0.05 + rnd() * 0.2 }] : [];
    const star = { x: 0, y: 0, z: 0, r: 3.6 };
    const subj = ships[Math.floor(rnd() * ships.length)];
    const g = { target: { x: subj.x, y: subj.y, z: subj.z }, theta: rnd() * 6.28, phi: (0.2 + rnd() * 1.3), dist: 0.001 + rnd() * 1.5 };
    const out = D.guardCamera(g, { ships, bodies, star }, T);
    n++;
    if (D.cameraClearance(out, { ships, bodies, star }, T) < -1e-9) bad++;
    // linia widzenia: odcinek kamera → cel nie przecina kuli gwiazdy (promień × DIR_CLEAR_STAR_K)
    const cp = D.cameraPos(out), t = out.target, R = star.r * T.DIR_CLEAR_STAR_K;
    const dx = t.x - cp.x, dy = t.y - cp.y, dz = t.z - cp.z, L2 = dx * dx + dy * dy + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((star.x - cp.x) * dx + (star.y - cp.y) * dy + (star.z - cp.z) * dz) / L2));
    if (Math.hypot(cp.x + dx * u - star.x, cp.y + dy * u - star.y, cp.z + dz * u - star.z) < R - 1e-9 && Math.hypot(t.x, t.y, t.z) > R) starLine++;
  }
  ok(bad === 0, `K7a ${n} losowych układów: prześwit kamery ≥ 0 od każdego kadłuba (× ${T.DIR_CLEAR_HULL_K} długości), ciała i gwiazdy (złych ${bad})`);
  ok(starLine === 0, `K7b linia widzenia nigdy przez gwiazdę (złych ${starLine})`);
  const near = { target: { x: 4, y: 0.3, z: 0 }, theta: Math.PI, phi: Math.PI / 2, dist: 3 };   // kamera za gwiazdą — linia przez gwiazdę
  const fixed = D.guardCamera(near, { ships: [], bodies: [], star: { x: 0, y: 0, z: 0, r: 1 } }, T);
  ok(fixed.guarded.includes('starLine') || fixed.guarded.includes('star'), `K7c kamera za gwiazdą — strażnik podnosi / odsuwa (${fixed.guarded.join(', ')})`);
});

header('K8 — 9:16');
guard('K8', () => {
  const crop = D.promoRect916(1600, 1041);
  ok(Math.abs((crop.x1 - crop.x0) / (crop.y1 - crop.y0) - 9 / 16) < 1e-9 && Math.abs((crop.x0 + crop.x1) / 2 - 800) < 1e-9 && crop.y0 === 0 && crop.y1 === 1041,
    `K8a kadr 9:16 wyśrodkowany na pełnej wysokości (${Math.round(crop.x1 - crop.x0)} × ${crop.y1 - crop.y0})`);
  const safe = D.promoSafe916(crop, T);
  ok(safe.x0 > crop.x0 && safe.x1 < crop.x1 && safe.y0 > crop.y0 && safe.y1 < crop.y1, 'K8b prostokąt bezpieczny wewnątrz kadru (strefy podpisów)');
  const narrow = D.promoRect916(400, 1041);
  ok(Math.abs((narrow.x1 - narrow.x0) - 400) < 1e-9 && Math.abs((narrow.y1 - narrow.y0) / 400 - 16 / 9) < 1e-9, 'K8c wąski ekran — kadr na pełną szerokość');
  // Kadr ujęcia w prostokącie 9:16 zawiera kadrowane okręty (rzut jak kamera kontrolera).
  const ships = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, x: 0.04 * Math.cos(i), y: 0.3, z: 0.04 * Math.sin(i * 1.7), len: 0.016, alive: true, side: i < 4 ? 'own' : 'enemy', cls: 'frigate', heading: { x: 1, z: 0 } }));
  const byId = new Map(ships.map((s) => [s.id, s]));
  const view = { fovDeg: 55, aspect: 1600 / 1041, W: 1600, H: 1041, safe: D.insetRect(safe, T) };
  const inside = (g, pts) => { const b = { theta: g.theta, phi: g.phi }; const cp = D.cameraPos(g);
    const sp = Math.sin(b.phi), cpp = Math.cos(b.phi), st = Math.sin(b.theta), ct = Math.cos(b.theta);
    const zc = { x: sp * ct, y: cpp, z: sp * st }, xc = { x: st, y: 0, z: -ct }, yc = { x: -cpp * ct, y: sp, z: -cpp * st };
    const tanH = Math.tan(55 * Math.PI / 360), asp = 1600 / 1041;
    return pts.every((p) => { const r = { x: p.x - cp.x, y: p.y - cp.y, z: p.z - cp.z }; const dep = -(r.x * zc.x + r.y * zc.y + r.z * zc.z);
      const px = ((r.x * xc.x + r.y * xc.y + r.z * xc.z) / (dep * tanH * asp) + 1) / 2 * 1600, py = (1 - (r.x * yc.x + r.y * yc.y + r.z * yc.z) / (dep * tanH)) / 2 * 1041;
      return dep > 0 && px >= safe.x0 - 0.5 && px <= safe.x1 + 0.5 && py >= safe.y0 - 0.5 && py <= safe.y1 + 0.5; }); };
  const wide = D.frameShot({ type: SHOT.WIDE, startMs: 0, side: 1, theta0: 0.4 }, { ships, byId }, view, 0, T);
  const duel = D.frameShot({ type: SHOT.DUEL, startMs: 0, side: 1, theta0: 0.4, subjectId: 's0', targetId: 's5' }, { ships, byId }, view, 0, T);
  ok(!!wide && inside(wide, ships), 'K8d szeroki kadr w 9:16 — wszystkie okręty w prostokącie bezpiecznym 9:16');
  ok(!!duel && inside(duel, [byId.get('s0'), byId.get('s5')]), 'K8e pojedynek w 9:16 — obaj w prostokącie bezpiecznym 9:16');
  const st0 = D.promoGuideStyle({ on: true }, T), st1 = D.promoGuideStyle({ on: true, capture: true }, T), st2 = D.promoGuideStyle({ on: false }, T);
  ok(st0.visible && st0.dark > 0 && st1.visible === (T.DIR_916_CAPTURE_FRAME > 0) && (!st1.visible || st1.dark === 0) && !st2.visible,
    'K8f przewodnik: zwykły — ramka i przyciemnienie; nagrywanie — cienka ramka bez przyciemnienia; wyłączony — nic');
});

header('K9 — tryb nagrywania: dokładne przywrócenie');
guard('K9', () => {
  const mkDoc = () => {
    const classes = new Set(['theme-x']);
    const els = new Map();
    const head = { children: [], appendChild(e) { this.children.push(e); els.set(e.id, e); } };
    return { classes, head, body: { classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) } },
      getElementById: (id) => els.get(id) ?? null, createElement: () => ({ id: '', textContent: '' }) };
  };
  const mkR = (clean) => ({ _cleanView: clean, calls: 0, setCleanView(v) { this._cleanView = !!v; this.calls++; } });
  for (const clean0 of [false, true]) {
    const doc = mkDoc(), r = mkR(clean0), K = {};
    const before = JSON.stringify({ cls: [...doc.classes].sort(), clean: r._cleanView, k: 'captureMode' in K });
    const snap = CM.enterCapture({ doc, renderer: r, K });
    const during = { cls: doc.classes.has(CM.CAPTURE_CLASS), clean: r._cleanView, k: K.captureMode };
    CM.exitCapture(snap, { doc, renderer: r, K });
    const after = JSON.stringify({ cls: [...doc.classes].sort(), clean: r._cleanView, k: 'captureMode' in K });
    ok(during.cls && during.clean === true && during.k === true && before === after,
      `K9${clean0 ? 'b' : 'a'} wejście / wyjście (czysty widok przed: ${clean0}) — stan po wyjściu == przed (${after})`);
  }
  const css = CM.captureCss();
  ok(/:not\(#three-canvas\)/.test(css) && /:not\(#event-layer\)/.test(css) && /:not\(#cv916-guide\)/.test(css) && /visibility: hidden/.test(css),
    'K9c reguła CSS chowa interfejs, zostawia scenę 3D, warstwę zdarzeń i przewodnik 9:16');
  ok(CM.isCaptureKey({ key: 'F9', code: 'F9' }) && !CM.isCaptureKey({ key: 'F9', code: 'F9', ctrlKey: true }) && !CM.isCaptureKey({ key: 'F8', code: 'F8' }),
    `K9d klawisz ${CM.CAPTURE_KEY} bez modyfikatorów`);
  const gs = strip(src('../../scenes/GameScene.js'));
  ok(/window\.addEventListener\('keydown'[\s\S]{0,700}isCaptureKey\(e\)[\s\S]{0,400}e\.key === 'Escape'[\s\S]{0,200}setCapture\(false\)[\s\S]{0,200}\}, true\)/.test(gs),
    'K9e GameScene: F9 i Esc w fazie przechwytywania (przed kaskadą Esc gry)');
  const um = strip(src('../../scenes/UIManager.js'));
  ok(/isOverUI\(rawX, rawY\) \{\s*if \(window\.KOSMOS\?\.captureMode\) return false;/.test(um) && /handleClick\(x, y\) \{\s*this\._dirty = true;\s*if \(window\.KOSMOS\?\.captureMode\) return false;/.test(um),
    'K9f UIManager: w trybie nagrywania mysz należy do mapy (bez kliku i blokady nad niewidocznym interfejsem)');
});

header('K10 — wstrząs');
guard('K10', () => {
  ok(D.shakeTrauma({ kind: 'kill', cls: 'battleship', pxL: T.DIR_SHAKE_PX_MIN - 1 }, T) === 0, 'K10a zoom taktyczny (fregata < DIR_SHAKE_PX_MIN px) — bez wstrząsu');
  ok(D.shakeTrauma({ kind: 'kill', cls: 'battleship', pxL: 100, inFrame: false }, T) === 0, 'K10b zdarzenie poza kadrem — bez wstrząsu');
  const big = D.shakeTrauma({ kind: 'kill', cls: 'battleship', pxL: 100 }, T), small = D.shakeTrauma({ kind: 'kill', cls: 'frigate', pxL: 100 }, T);
  ok(big > small && small > 0 && D.shakeTrauma({ kind: 'hit', dmg: 1, pxL: 100 }, T) === 0, 'K10c skala rozmiaru: pancernik > fregata; drobne trafienie — nic');
  const s = new D.ShakeState();
  for (let i = 0; i < 20; i++) s.add(1);
  let maxA = 0;
  for (let i = 0; i < 200; i++) { s.step(16, T); const o = s.offset(T); maxA = Math.max(maxA, Math.abs(o.yaw), Math.abs(o.pitch)); }
  ok(maxA <= T.DIR_SHAKE_MAX_DEG * Math.PI / 180 + 1e-12 && s.trauma === 0, `K10d sufit kąta ${T.DIR_SHAKE_MAX_DEG}° i zanik do zera (największy ${(maxA * 180 / Math.PI).toFixed(3)}°)`);
  const z = new D.ShakeState().offset(T);
  ok(z.yaw === 0 && z.pitch === 0 && z.roll === 0, 'K10e bez urazu — bez obrotu kamery');
  const p = new D.ShakeState(); p.add(0.5); p.step(0, T);
  ok(p.trauma === 0.5, 'K10f pauza (krok 0) — uraz stoi');
});

header('K11 — rejestr salw: odczyty reżysera');
guard('K11', () => {
  const led = new CL.CombatLedger();
  const ev = (a, t, killed = false) => ({ attacker: a, target: t, category: 'short', hit: true, dmg: 10, killed });
  led.addRound({ encounterId: 'E', round: 1, seed: 3, events: [ev('a1', 'b1'), ev('a1', 'b1'), ev('a2', 'b2', true), ev('b1', 'a1')], nowMs: 0, roundMs: 1000 });
  const up = led.upcomingKills(['E']);
  ok(up.length === 1 && up[0].vesselId === 'b2' && up[0].attacker === 'a2' && up[0].at > 0, `K11a zniszczenie nadchodzące z chwilą i strzelcem (${JSON.stringify(up[0] ?? null)})`);
  ok(led.hasPending(['E']) && !led.hasPending(['X']), 'K11b czekające zdarzenia w starciu (inne starcie — nic)');
  const pairs = led.pairIntensity(['E']);
  ok(pairs[0]?.attacker === 'a1' && pairs[0]?.target === 'b1' && pairs[0]?.shots === 2, 'K11c najzajętsza para a1 → b1 (2 strzały)');
  ok(led.lastTargetOf('b1') === 'a1', 'K11d ostatni cel strzelca');
  led.advance(5000);
  ok(led.upcomingKills(['E']).length === 0 && !led.hasPending(['E']), 'K11e po pokazaniu — bez nadchodzących i czekających');
});

header('K12 — i18n');
guard('K12', () => {
  const pl = src('../../i18n/pl.js'), en = src('../../i18n/en.js');
  const keys = ['combatStrip.director', 'combatStrip.directorPaused', 'combatStrip.directorHint', 'combatStrip.directorOnHint', 'combatStrip.directorPausedHint'];
  ok(keys.every((k) => pl.includes(`'${k}'`) && en.includes(`'${k}'`)), `K12a klucze chipa PL + EN (${keys.length})`);
  ok(/'combatStrip\.director':\s*'Reżyser'/.test(pl) && /'combatStrip\.directorPaused':\s*'Reżyser \(wstrzymany\)'/.test(pl), 'K12b PL: „Reżyser” / „Reżyser (wstrzymany)”');
});

header('K13 — klej: jedno źródło tempa prezentacji, auto-fokus ustępuje');
guard('K13', () => {
  const tr = strip(src('../../renderer/ThreeRenderer.js'));
  const iWarp = tr.indexOf('this._cvDir?.tickWarp(performance.now())'), iStage = tr.indexOf('this._tickBattleStage();'), iCam = tr.indexOf('this._cvDir?.tickCamera()');
  const iUpd = tr.indexOf('this._cameraController.update()');
  ok(iWarp > 0 && iWarp < iStage && iStage < iCam && iCam < iUpd, 'K13a pętla renderu: mnożnik tempa przed zegarami, reżyser po scenie bitwy i przed `update()` kontrolera');
  const n = (tr.match(/\.tick\(performance\.now\(\), \{ paused: [^}]*rate: this\._presRate \?\? 1 \}/g) ?? []).length;
  ok(n === 2 && /_stageClock\.tick\(performance\.now\(\), \{[^}]*rate: this\._presRate/.test(tr) && /_presClock\.tick\(performance\.now\(\), \{[^}]*rate: this\._presRate/.test(tr),
    `K13b OBA zegary prezentacji (scena / choreografia i FX / rejestr / HUD) z tym samym mnożnikiem (${n})`);
  ok(/if \(this\._cvDir\?\.wantsBattles\?\.\(\)\) return;/.test(tr) && !/FEATURES\?\.cvDirector/.test(tr), 'K13c auto-fokus nowego starcia ustępuje włączonemu reżyserowi (CV-Z — bez bramki flagi)');
  ok(!!FX?.LIVE_CV_FX && Object.keys(T).length > 40 && Object.keys(T).every((k) => k in FX.LIVE_CV_FX), 'K13d pokrętła `DIR_*` żywe w `cvTuning` (alias `LIVE_CV_FX`)');
  // CV-Z — przecelowane świadomie: flaga `cvDirector` zdjęta (reżyser na stałe); chip dalej domyślnie wyłączony — `uiPrefs.cvDirector`.
  ok(!('cvDirector' in GAME_CONFIG.FEATURES) && 'fcCombatFx' in GAME_CONFIG.FEATURES, 'K13e (CV-Z) klucz `cvDirector` zdjęty z FEATURES (reżyser na stałe; chip domyślnie wyłączony — `uiPrefs.cvDirector`)');
});

header('K14 — nagrywarka rolek (F10)');
guard('K14', () => {
  const sup = (list) => (m) => list.includes(m);
  const mp4 = RR.pickReelMime(sup(['video/webm;codecs=vp9', 'video/mp4;codecs=avc1.640028', 'video/webm']));
  const webm = RR.pickReelMime(sup(['video/webm;codecs=vp9', 'video/webm']));
  ok(mp4?.mime === 'video/mp4;codecs=avc1.640028' && mp4.ext === 'mp4' && webm?.mime === 'video/webm;codecs=vp9' && webm.ext === 'webm'
    && RR.pickReelMime(() => false) === null, 'K14a format: MP4 (H.264), gdy obsługiwany; inaczej WebM VP9; brak — null');
  ok(RR.reelFileName(new Date(2026, 10, 13, 9, 5, 7), 'mp4') === 'kosmos_reel_20261113_090507.mp4', 'K14b nazwa kosmos_reel_RRRRMMDD_GGMMSS.<ext> z chwili startu');
  const o916 = RR.reelOutputSize({ promo: true, canvasW: 2000, canvasH: 1301 }), oFull = RR.reelOutputSize({ promo: false, canvasW: 2001, canvasH: 1301 });
  ok(o916.w === 1080 && o916.h === 1920 && oFull.w === 2000 && oFull.h === 1300, `K14c rozmiar: 9:16 → 1080 × 1920; całe płótno — parzyste (${oFull.w} × ${oFull.h})`);
  const sr = RR.reelSourceRect({ promo: true, canvasW: 2000, canvasH: 1301.25, cssW: 1600, cssH: 1041 }, {});
  const crop = D.promoRect916(1600, 1041), k = 2000 / 1600;
  ok(Math.abs(sr.sw / sr.sh - 9 / 16) < 1e-9 && Math.abs(sr.sx - crop.x0 * k) < 1e-9 && Math.abs(sr.sx + sr.sw / 2 - 1000) < 1e-9 && sr.sy === 0,
    `K14d wycinek 9:16 = kadr przewodnika w px bufora (sx ${sr.sx.toFixed(1)}, sw ${sr.sw.toFixed(1)} × ${sr.sh.toFixed(1)})`);
  const full = RR.reelSourceRect({ promo: false, canvasW: 2000, canvasH: 1301 }, {});
  ok(full.sx === 0 && full.sy === 0 && full.sw === 2000 && full.sh === 1301, 'K14e bez przewodnika — całe płótno');
  ok(RR.isReelKey({ key: 'F10', code: 'F10' }) && !RR.isReelKey({ key: 'F10', code: 'F10', shiftKey: true }) && !RR.isReelKey({ key: 'F9', code: 'F9' }), 'K14f klawisz F10 bez modyfikatorów');
  ok(/:not\(#cv-rec-indicator\)/.test(CM.captureCss()), 'K14g tryb nagrywania nie chowa wskaźnika „● REC” (element DOM — nie jest w nagraniu)');
  const rs = strip(src('../../renderer/ReelRecorder.js'));
  const of = rs.slice(rs.indexOf('onFrame() {'), rs.indexOf('_fail(reason'));
  ok(of.length > 100 && !/\bnew\s/.test(of) && /drawImage\(src,/.test(of) && /requestFrame/.test(of), 'K14h klatka: `drawImage` + `requestFrame`, bez `new` (bez alokacji na klatkę)');
  const tr = strip(src('../../renderer/ThreeRenderer.js'));
  const iRender = tr.indexOf('this._composer.render()'), iReel = tr.indexOf('this._cvDir?.reel?.onFrame()');
  ok(iRender > 0 && iReel > iRender && iReel - iRender < 600, 'K14i kopia klatki TUŻ PO renderze (ten sam przebieg pętli — bufor WebGL ważny)');
  ok(!/SaveSystem|uiPrefs|localStorage/.test(rs), 'K14j nagrywarka niczego nie zapisuje (bez zapisu gry, preferencji, localStorage)');
  const gs = strip(src('../../scenes/GameScene.js'));
  ok(/isReelKey\(e\) && window\.KOSMOS\?\.civMode\)[\s\S]{0,200}setRecording\(!dir\.reel\.recording\)/.test(gs), 'K14k GameScene: F10 przełącza nagrywanie (faza przechwytywania)');
  const pl = src('../../i18n/pl.js'), en = src('../../i18n/en.js');
  ok(['reel.rec', 'reel.saved', 'reel.unsupported'].every((x) => pl.includes(`'${x}'`) && en.includes(`'${x}'`)), 'K14l i18n nagrywarki PL + EN');
  ok(RR.reelClock(0) === '0:00' && RR.reelClock(65400) === '1:05', 'K14m czas wskaźnika m:ss');
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
