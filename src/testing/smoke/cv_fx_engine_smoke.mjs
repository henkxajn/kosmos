// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_fx_engine_smoke — KEEPER ARC COMBAT VISUALS, krok CV-2a (F11 (d) pauza, (f) budżet; D-CV-10; Findingi 616, 617)
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.10, §2.12, §4 CV-2a.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — bez pinów na stałych rysunku):
//   (d) zegar prezentacji: płynie krokiem klatki czasu realnego, w pauzie stoi, po wznowieniu bez nadrabiania, przerwa bez
//       klatek (karta w tle) — krok przycięty; silnik FX na tym zegarze: w pauzie każdy efekt stoi (czas shadera, liczba
//       aktywnych, atrybuty), po wznowieniu dogrywa się dokładnie swój czas życia (pauza 30 s go nie skraca — Finding 616).
//       KONTROLA: zegar bezwzględny (dzisiejszy model) w tej samej pauzie gasi efekty.
//   (f) zero konstrukcji obiektów THREE (Object3D, Material, BufferGeometry, Texture) i zero tablic typowanych po
//       rozgrzewce w trakcie 100 salw najgorszej rundy 10 na 10; pule nigdy ponad pojemność, strzały nigdy nie giną
//       (najgorsza runda przy każdym tempie `combatRoundMs` 50 / 110 / 400 / 1000); przepełnienie (pula z pojemnością 4)
//       — najstarszy efekt kończy się wcześniej, NOWY strzał zawsze dostaje slot. KONTROLA licznika: celowa konstrukcja
//       w oknie jest widziana.
//   Programy: chunki logarytmicznej głębi (V-267) są przy `logDepth: true` i nie ma ich przy `false`; wiązka i smuga
//       dzielą tekst programu; pokrętła idą UNIFORMAMI (dwa silniki z różnymi pokrętłami — identyczne teksty); pokrętło
//       działa od następnej klatki. Końce wiązek i iskry idą za pozycją rysowaną statku; brak sprite'a — punkt zostaje.
//   Źródło: zero `Math.random` w nowych modułach CV-2a; gorąca ścieżka silnika bez `new` (KONTROLA na zmutowanej kopii).
//   Flaga: OFF i nic w locie — `_tickCvFx` nie rusza zegara ani silnika; `_onCombatRoundFx` z flagą OFF idzie dzisiejszą
//       ścieżką, z flagą ON — przez silnik (prawdziwe metody wyciągnięte ze źródła); ścieżka OFF co do bitu jak przed CV-2a
//       (odcisk SHA-256 ciał metod dzisiejszego silnika FX, liczony z `0eabc4f`). ARC CV-6b2 — T9d przecelowane świadomie: odcisk
//       liczony po cofnięciu DWÓCH zmian kroku (wycofany `combatFxVisible` — #630, biały błysk pod `cvStrip`); T9g pilnuje, że są.
// ⚠ Silnik i zegar na PRAWDZIWYM Three.js r171 (`src/lib`); importy CV-2a dynamiczne w try/catch — przy fail-first piny
//   DEGRADUJĄ (czerwone), suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import * as FXC                  from '../../config/CombatFxConfig.js';
import * as FX                   from '../../utils/VesselFxLogic.js';
import { vesselTargetSize }      from '../../renderer/VesselModelResolver.js';
import { isEnemyVessel }         from '../../entities/Vessel.js';
import { hasLogDepth }           from '../../renderer/LogDepthChunks.js';
import { rendererRandom }        from '../../renderer/RendererRng.js';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash }            from 'node:crypto';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const CLOCK  = await tryImport('../../renderer/combat/PresentationClock.js');
const ENGINE = await tryImport('../../renderer/combat/FxEngine.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const PACE = (R) => FXC.combatFxPace(R);
const camera = new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
const engineOf = (opts = {}) => (ENGINE ? new ENGINE.FxEngine({ THREE, parent: new THREE.Scene(), logDepth: true, ...opts }) : null);
const shot = (i, pace, extra = {}) => ({
  a: { x: -1 + i * 0.001, y: 0.3, z: 0 }, t: { x: 1, y: 0.3, z: i * 0.001 }, category: ['short', 'medium', 'long'][i % 3],
  hit: true, blockedByShield: 2, delayMs: (i % 8) * pace.staggerMs, pace, attackerId: null, targetId: null, targetSize: 0.02, ...extra,
});

// ── T1 (d) — zegar prezentacji ─────────────────────────────────────────────────────────────────────────────────────
header('T1 (d) — PresentationClock: płynie w grze, stoi w pauzie, bez nadrabiania');
{
  const C = CLOCK ? new CLOCK.PresentationClock() : null;
  if (!C) assert(false, 'T1 brak modułu PresentationClock');
  else {
    let real = 1000;
    const step = (ms, paused = false) => { real += ms; return C.tick(real, { paused }); };
    C.tick(real, { paused: false });
    assert(C.nowMs === 0, 'T1a pierwszy tick — krok 0 (brak poprzedniego stempla)');
    for (let i = 0; i < 60; i++) step(16);
    assert(C.nowMs === 960, `T1b 60 klatek po 16 ms w grze → 960 ms prezentacji (${C.nowMs})`);
    const before = C.nowMs;
    for (let i = 0; i < 1875; i++) step(16, true);   // 30 s pauzy, pętla renderu biegnie
    assert(C.nowMs === before && C.lastStepMs === 0, `T1c pauza 30 s (1875 klatek) — czas prezentacji stoi (${C.nowMs})`);
    step(16);
    assert(C.nowMs === before + 16, `T1d po wznowieniu pierwszy krok = jedna klatka, bez nadrabiania pauzy (+${C.nowMs - before} ms)`);
    real += 60000;   // pętla stała (karta w tle) — 60 s bez ticków
    const s = C.tick(real, { paused: false });
    assert(s === CLOCK.PRESENTATION_DT_MAX_MS && C.nowMs === before + 16 + CLOCK.PRESENTATION_DT_MAX_MS,
      `T1e przerwa 60 s bez klatek — krok przycięty do ${CLOCK.PRESENTATION_DT_MAX_MS} ms (bez skoku)`);
    const n0 = C.nowMs;
    C.tick(NaN, { paused: false });
    step(16);
    assert(C.nowMs === n0 + 16, 'T1f NaN — krok 0, stempel czasu realnego nienaruszony (następny krok = jedna klatka)');
    const n1 = C.nowMs;
    real -= 50; C.tick(real, { paused: false });
    step(16);
    assert(C.nowMs === n1 + 16, 'T1g zegar cofnięty — krok 0 i nowy stempel (następny krok = jedna klatka od niego, bez zamarznięcia)');
    C.anchor(5000);
    step(16, true); step(16);
    assert(C.sinceAnchorMs() === 16, `T1h odniesienie fazy (simClockMs) — czas prezentacji od kotwicy liczy tylko grę (${C.sinceAnchorMs()} ms)`);
    // KONTROLA: dzisiejszy model (wiek = performance.now() − start) w tej samej pauzie płynie.
    const start = 1000; let wall = 1000 + 960;
    for (let i = 0; i < 1875; i++) wall += 16;
    assert(wall - start > 30000, 'T1i KONTROLA: zegar bezwzględny w pauzie 30 s płynie (+30 s) — dzisiejszy model nie stoi');
  }
}

// ── T2 (d) — silnik na zegarze prezentacji: pauza zatrzymuje każdy efekt ─────────────────────────────────────────
header('T2 (d) — silnik FX: w pauzie efekty stoją, po wznowieniu dogrywają swój czas życia');
function pauseRun({ feed = 'presentation' } = {}) {
  const E = engineOf();
  const C = new CLOCK.PresentationClock();
  let real = 5000;
  C.tick(real, {});
  E.update({ nowMs: C.nowMs, camera, viewportH: 1041 });
  const pace = PACE(400);
  for (let i = 0; i < 10; i++) E.spawnShot(shot(i, pace));
  const frameUpd = (paused) => { real += 16; C.tick(real, { paused }); E.update({ nowMs: feed === 'presentation' ? C.nowMs : real - 5000, camera, viewportH: 1041 }); };
  for (let i = 0; i < 10; i++) frameUpd(false);
  const snap = () => ({ t: E.beams.material.uniforms.uTime.value, s: E.sparks.material.uniforms.uTime.value, n: E.activeCount(),
    arr: Array.from(E.tracers.f.aParams.array.slice(0, 40)).join(',') });
  const a = snap();
  for (let i = 0; i < 1875; i++) frameUpd(true);   // 30 s pauzy
  const b = snap();
  let presAtRetire = null;
  for (let i = 0; i < 400 && E.activeCount() > 0; i++) frameUpd(false);
  presAtRetire = C.nowMs;
  return { a, b, presAtRetire, alive: b.n, pace };
}
if (!ENGINE || !CLOCK) assert(false, 'T2 brak modułów silnika / zegara');
else {
  const P = pauseRun();
  assert(P.a.n > 0 && P.b.n === P.a.n && P.b.t === P.a.t && P.b.s === P.a.s && P.b.arr === P.a.arr,
    `T2a pauza 30 s: czas shadera, liczba aktywnych (${P.a.n}) i atrybuty bez zmian`);
  const lastEnd = 7 * P.pace.staggerMs + P.pace.flashDelayMs + Math.max(P.pace.flashMs, P.pace.shieldMs, FX.HIT_GLOW.MS, P.pace.tracerMs - P.pace.flashDelayMs);
  assert(Math.abs(P.presAtRetire - lastEnd) <= 16, `T2b ostatni efekt gaśnie po ${P.presAtRetire} ms prezentacji (oczekiwane ${lastEnd} ± klatka) — pauza nie skraca życia`);
  const W = pauseRun({ feed: 'wall' });
  assert(W.b.n === 0, `T2c KONTROLA: ten sam silnik zasilony zegarem bezwzględnym gasi wszystko w pauzie (${W.a.n} → ${W.b.n}) — Finding 616`);
}

// ── T3 (f) — zero alokacji po rozgrzewce ───────────────────────────────────────────────────────────────────────────
header('T3 (f) — zero konstrukcji THREE i tablic typowanych po rozgrzewce (100 salw najgorszej rundy)');
const WORST = { ships: 20, weaponsPerShip: 5 };   // 20 statków × 5 slotów użytkowych krążownika
const PER_ROUND = WORST.ships * WORST.weaponsPerShip;
function probeIds() {
  const o = new THREE.Object3D(), m = new THREE.Material(), g = new THREE.BufferGeometry(), t = new THREE.Texture();
  const ids = { obj: o.id, mat: m.id, geo: g.id, tex: t.id };
  m.dispose(); g.dispose(); t.dispose();
  return ids;
}
function countTyped(fn) {
  const names = ['Float32Array', 'Float64Array', 'Uint16Array', 'Uint32Array', 'Int32Array', 'Uint8Array'];
  const saved = {}; let count = 0;
  for (const n of names) {
    saved[n] = globalThis[n];
    globalThis[n] = new Proxy(saved[n], { construct(T, args) { count++; return new T(...args); } });
  }
  try { fn(); } finally { for (const n of names) globalThis[n] = saved[n]; }
  return count;
}
function salvos(E, { n = 100, R = 400, extra = null } = {}) {
  const pace = PACE(R);
  let now = E.nowMs;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < PER_ROUND; i++) { E.spawnShot(shot(i, pace)); if (extra) extra(); }
    for (let f = 0; f < Math.max(1, Math.round(R / 16)); f++) { now += 16; E.update({ nowMs: now, camera, viewportH: 1041 }); }
  }
}
if (!ENGINE) assert(false, 'T3 brak modułu silnika');
else {
  const E = engineOf();
  E.update({ nowMs: 0, camera, viewportH: 1041 });   // rozgrzewka: pule zbudowane w konstruktorze
  const ids0 = probeIds();
  let typed = 0;
  typed = countTyped(() => salvos(E, { n: 100, R: 400 }));
  const ids1 = probeIds();
  const d = { obj: ids1.obj - ids0.obj - 1, mat: ids1.mat - ids0.mat - 1, geo: ids1.geo - ids0.geo - 1, tex: ids1.tex - ids0.tex - 1 };
  const st = E.stats();
  console.log(`     100 salw × ${PER_ROUND} strzałów: szczyt wiązki ${st.pools.beam.peak} / smugi ${st.pools.tracer.peak} / iskry ${st.pools.spark.peak}, kradzieże ${st.pools.beam.steals + st.pools.tracer.steals + st.pools.spark.steals}`);
  assert(d.obj === 0 && d.mat === 0 && d.geo === 0 && d.tex === 0, `T3a konstrukcje po rozgrzewce: Object3D ${d.obj}, Material ${d.mat}, BufferGeometry ${d.geo}, Texture ${d.tex} (oczekiwane 0)`);
  assert(typed === 0, `T3b tablice typowane po rozgrzewce: ${typed} (oczekiwane 0)`);
  assert(st.shots === 100 * PER_ROUND && st.pools.beam.spawned + st.pools.tracer.spawned === st.shots,
    `T3c każdy strzał dostał wiązkę albo smugę (${st.pools.beam.spawned + st.pools.tracer.spawned} / ${st.shots})`);
  // KONTROLA licznika: celowa konstrukcja geometrii przy każdym strzale jest widziana.
  const E2 = engineOf();
  E2.update({ nowMs: 0, camera, viewportH: 1041 });
  const c0 = probeIds();
  let made = 0;
  salvos(E2, { n: 2, R: 400, extra: () => { new THREE.BufferGeometry().dispose(); made++; } });
  const c1 = probeIds();
  assert(c1.geo - c0.geo - 1 === made && made === 2 * PER_ROUND, `T3d KONTROLA: ${made} celowych konstrukcji w oknie — licznik widzi ${c1.geo - c0.geo - 1}`);
}

// ── T4 (f) — najgorsza runda przy każdym tempie: pule mieszczą, strzały nie giną ───────────────────────────────────
header('T4 (f) — najgorsza runda 10 na 10 (100 strzałów, wszystkie trafione i na osłonie) przy R 50 / 110 / 400 / 1000 ms');
if (!ENGINE) assert(false, 'T4 brak modułu silnika');
else {
  for (const R of [50, 110, 400, 1000]) {
    const E = engineOf();
    E.update({ nowMs: 0, camera, viewportH: 1041 });
    salvos(E, { n: 40, R });
    const st = E.stats();
    const steals = st.pools.beam.steals + st.pools.tracer.steals + st.pools.spark.steals;
    const head = (p) => (st.pools[p].capacity / Math.max(1, st.pools[p].peak)).toFixed(1);
    console.log(`     R ${R}: szczyt wiązki ${st.pools.beam.peak}/${st.pools.beam.capacity} (×${head('beam')}), smugi ${st.pools.tracer.peak}/${st.pools.tracer.capacity} (×${head('tracer')}), iskry ${st.pools.spark.peak}/${st.pools.spark.capacity} (×${head('spark')})`);
    assert(steals === 0 && st.pools.beam.peak <= st.pools.beam.capacity && st.pools.tracer.peak <= st.pools.tracer.capacity && st.pools.spark.peak <= st.pools.spark.capacity
      && st.pools.beam.spawned + st.pools.tracer.spawned === 40 * PER_ROUND,
      `T4 R ${R} ms: zero kradzieży, szczyt ≤ pojemność, ${st.pools.beam.spawned + st.pools.tracer.spawned} / ${40 * PER_ROUND} strzałów narysowanych`);
  }
}

// ── T5 (f) — przepełnienie: nowy strzał zawsze dostaje slot ────────────────────────────────────────────────────────
header('T5 (f) — przepełnienie puli (pojemność 4): najstarszy kończy się wcześniej, nowy zawsze jest');
if (!ENGINE) assert(false, 'T5 brak modułu silnika');
else {
  const E = engineOf({ capacity: { beam: 4, tracer: 4, spark: 8 } });
  E.update({ nowMs: 0, camera, viewportH: 1041 });
  const pace = PACE(400);
  for (let i = 0; i < 6; i++) E.spawnShot({ ...shot(0, pace), category: 'short', hit: false, delayMs: i * 10 });
  const st = E.stats().pools.beam;
  const deaths = Array.from(E.beams.death.slice(0, E.beams.n)).sort((x, y) => x - y);
  assert(st.active === 4 && st.steals === 2 && st.spawned === 6, `T5a aktywne ${st.active}/4, kradzieże ${st.steals}, przyjęte ${st.spawned}`);
  assert(deaths[deaths.length - 1] === 5 * 10 + pace.tracerMs && deaths[0] === 2 * 10 + pace.tracerMs,
    `T5b w puli są CZTERY NAJNOWSZE strzały (koniec życia ${deaths.join(', ')}) — najstarsze dwa skrócone`);
}

// ── T6 — programy: log-depth, wspólny tekst, pokrętła uniformami ──────────────────────────────────────────────────
header('T6 — programy: chunki logarytmicznej głębi, wspólny program wiązki i smugi, pokrętła przez uniformy');
if (!ENGINE) assert(false, 'T6 brak modułu silnika');
else {
  const E = engineOf();
  const mats = [E.beams.material, E.tracers.material, E.sparks.material];
  assert(mats.every(m => hasLogDepth(m.vertexShader) && hasLogDepth(m.fragmentShader)), 'T6a logDepth: true — chunki w każdym programie (V-267)');
  const Eoff = engineOf({ logDepth: false });
  assert([Eoff.beams.material, Eoff.sparks.material].every(m => !hasLogDepth(m.vertexShader) && !hasLogDepth(m.fragmentShader)), 'T6b logDepth: false — bez chunków');
  assert(E.beams.material.vertexShader === E.tracers.material.vertexShader && E.beams.material.fragmentShader === E.tracers.material.fragmentShader,
    'T6c wiązka i smuga — ten sam tekst programu (jeden program, różne uniformy)');
  const tuned = { ...ENGINE.LIVE_CV_FX, BEAM_CORE: 9, MIN_PX: 7, FLASH_K: 11 };
  const E2 = engineOf({ tuning: tuned });
  assert(mats.every((m, i) => m.vertexShader === [E2.beams, E2.tracers, E2.sparks][i].material.vertexShader), 'T6d inne pokrętła — identyczne teksty (wartości uniformami, nie w GLSL)');
  E2.update({ nowMs: 0, camera, viewportH: 1041 });
  tuned.BEAM_CORE = 4.5;
  E2.update({ nowMs: 16, camera, viewportH: 1041 });
  assert(E2.beams.material.uniforms.uCore.value === 4.5 && E2.beams.material.uniforms.uMinPx.value === 7 && E2.sparks.material.uniforms.uSizeK.value.x === 11,
    'T6e pokrętło działa od następnej klatki (uniformy przepisane z obiektu pokręteł)');
}

// ── T7 — końce za pozycją rysowaną ─────────────────────────────────────────────────────────────────────────────────
header('T7 — końce wiązek i iskry idą za pozycją rysowaną statku; brak sprite\'a — punkt zostaje');
if (!ENGINE) assert(false, 'T7 brak modułu silnika');
else {
  const pos = new Map([['A', new THREE.Vector3(-1, 0.3, 0)], ['B', new THREE.Vector3(1, 0.3, 0)]]);
  const E = engineOf({ resolve: (id) => pos.get(id) ?? null });
  E.update({ nowMs: 0, camera, viewportH: 1041 });
  E.spawnShot({ ...shot(0, PACE(400)), category: 'short', delayMs: 0, attackerId: 'A', targetId: 'B' });
  pos.get('A').set(-2, 0.5, 1); pos.get('B').set(3, 0.4, -1);
  E.update({ nowMs: 16, camera, viewportH: 1041 });
  const s = Array.from(E.beams.f.aStart.array.slice(0, 3)), e = Array.from(E.beams.f.aEnd.array.slice(0, 3));
  const sp = Array.from(E.sparks.f.aPos.array.slice(0, 3)).map(v => Number(v.toFixed(4)));
  assert(s.join() === '-2,0.5,1' && e.map(v => Number(v.toFixed(4))).join() === '3,0.4,-1' && sp.join() === '3,0.4,-1',
    `T7a początek ${s.join()} / koniec ${e.map(v => v.toFixed(2)).join()} / iskra ${sp.join()} — za statkami`);
  pos.delete('B');
  E.update({ nowMs: 32, camera, viewportH: 1041 });
  const e2 = Array.from(E.beams.f.aEnd.array.slice(0, 3)).map(v => Number(v.toFixed(4)));
  assert(e2.join() === '3,0.4,-1', 'T7b sprite celu zniknął — koniec zostaje tam, gdzie był');
}

// ── T8 — źródło: bez Math.random, gorąca ścieżka bez `new` ────────────────────────────────────────────────────────
header('T8 — źródło modułów CV-2a: zero Math.random, gorąca ścieżka silnika bez konstrukcji');
{
  const safeRead = (rel) => { try { return read(rel); } catch { return null; } };
  let files = [];
  try { files = readdirSync(new URL('src/renderer/combat/', ROOT)).filter(f => f.endsWith('.js')).map(f => 'src/renderer/combat/' + f); } catch { files = []; }
  if (safeRead('src/debug/CvBattleStager.js') != null) files.push('src/debug/CvBattleStager.js');
  const dirty = files.filter(f => /\bMath\.random\b/.test(strip(safeRead(f) ?? '')));
  assert(files.length >= 4 && dirty.length === 0, `T8a ${files.length} plików CV-2a: zero Math.random${dirty.length ? ' — ' + dirty.join(', ') : ''}`);
  const SRC = strip(safeRead('src/renderer/combat/FxEngine.js') ?? '');
  const methodBody = (src, name) => { const i = src.indexOf(`\n  ${name}(`); if (i < 0) return null; const a = src.indexOf('{', i); const b = src.indexOf('\n  }\n', a); return src.slice(a, b); };
  const HOT = ['alloc', 'set3', 'set4', 'set1', 'free', 'retire', 'upload', 'spawnShot', '_spark', 'update', '_follow', 'activeCount', 'hasActive'];
  const bodies = HOT.map(n => [n, methodBody(SRC, n)]);
  const withNew = bodies.filter(([, b]) => b == null || /\bnew\s+[A-Z]/.test(b) || /\[\s*this\./.test(b));
  assert(withNew.length === 0, `T8b gorąca ścieżka (${HOT.length} metod) bez \`new\` i bez literałów tablic${withNew.length ? ' — ' + withNew.map(x => x[0]).join(', ') : ''}`);
  const mutated = methodBody(SRC, 'update')?.replace('const now = this.nowMs;', 'const now = this.nowMs; const _v = new THREE.Vector3();') ?? '';
  assert(/\bnew\s+[A-Z]/.test(mutated), 'T8c KONTROLA: kopia `update` z konstrukcją Vector3 — pin ją wykrywa');
}

// ── T9 — flaga: OFF = dzisiejsza ścieżka co do bitu, ON = silnik ──────────────────────────────────────────────────
header('T9 — flaga cvFxEngine: OFF nic nie zmienia (wykonanie + odcisk źródła), ON kieruje salwę do silnika');
const TR = read('src/renderer/ThreeRenderer.js');
function fullBody(name) { const i = TR.indexOf(`\n  ${name}(`); if (i < 0) return null; const sigEnd = TR.indexOf(') {\n', i); const end = TR.indexOf('\n  }\n', sigEnd); return TR.slice(i, end + 5); }
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  return { params: TR.slice(TR.indexOf('(', i) + 1, sigEnd), body: TR.slice(sigEnd + 4, TR.indexOf('\n  }\n', sigEnd)) };
}
const S = (v) => v / 10;
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'combatFxPace', 'fxWeaponColor', 'FX_MAX_ACTIVE',
  'FX_TRACER_MS', 'FX_SHIELD_COLOR', 'isEnemyVessel', 'isEndpointVisibleInCombat', 'isPlayerEngagement', 'vesselTargetSize', 'HIT_GLOW',
  'hitGlowWorldSize', 'ThreeRenderer', 'rendererRandom', 'FxEngine', 'logDepthOn'];
const make = (name) => {
  const m = methodOf(name);
  return m ? new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance,
    FX.isEngagementInView, FXC.combatFxPace, FXC.weaponColor, FXC.FX_MAX_ACTIVE, FXC.FX_TRACER_MS, FXC.FX_SHIELD_COLOR, isEnemyVessel,
    FX.isEndpointVisibleInCombat, FX.isPlayerEngagement, vesselTargetSize, FX.HIT_GLOW, FX.hitGlowWorldSize,
    { _hitGlowTexture: () => new THREE.Texture() }, rendererRandom, ENGINE?.FxEngine ?? null, () => true) : null;
};
{
  globalThis.window = globalThis.window ?? {};
  const flag = GAME_CONFIG.FEATURES.cvFxEngine;
  // `_tickCvFx` przy fladze OFF i bez silnika — nie rusza zegara, nie buduje silnika.
  const tick = make('_tickCvFx');
  const R0 = { _presClock: CLOCK ? new CLOCK.PresentationClock() : null, _fxEngine: null, camera, _galaxyActive: false };
  GAME_CONFIG.FEATURES.cvFxEngine = false;
  window.KOSMOS = { timeSystem: { isPaused: false, multiplier: 1 } };
  if (tick) for (let i = 0; i < 5; i++) tick.call(R0);
  assert(!!tick && R0._fxEngine === null && R0._presClock?._lastRealMs === null && R0._presClock?.nowMs === 0,
    'T9a flaga OFF, nic w locie: `_tickCvFx` nie dotyka zegara ani silnika (pętla renderu jak dziś)');
  // `_onCombatRoundFx`: OFF → dzisiejsze `_spawnCombatTracer`, ON → `_cvFxRoundFx`.
  const route = make('_onCombatRoundFx');
  const calls = { legacy: 0, engine: 0, pace: null };
  const R = { _combatEndpointWorld: () => ({ x: 0, y: 0.3, z: 0 }),
    _spawnCombatTracer: () => { calls.legacy++; }, _cvFxRoundFx: (evs, pace) => { calls.engine += evs.length; calls.pace = pace; } };
  const payload = { systemId: 'sys_v', events: [{ attacker: 'a', target: 'b', category: 'short', hit: true, blockedByShield: 0, aPos: { x: 0, y: 0 }, tPos: { x: 1, y: 0 } },
    { attacker: 'b', target: 'a', category: 'long', hit: false, blockedByShield: 0, aPos: { x: 1, y: 0 }, tPos: { x: 0, y: 0 } }] };
  window.KOSMOS = { activeSystemId: 'sys_v', uiPrefs: {}, timeSystem: { combatRoundMs: () => 400 } };
  GAME_CONFIG.FEATURES.cvFxEngine = false;
  route?.call(R, payload);
  const off = { ...calls };
  GAME_CONFIG.FEATURES.cvFxEngine = true;
  route?.call(R, payload);
  GAME_CONFIG.FEATURES.cvFxEngine = flag;
  assert(off.legacy === 2 && off.engine === 0, `T9b flaga OFF: dzisiejsza ścieżka (${off.legacy} × _spawnCombatTracer), silnik nietknięty`);
  assert(calls.engine === 2 && calls.legacy === 2 && calls.pace?.tracerMs === FXC.combatFxPace(400).tracerMs,
    'T9c flaga ON (czytana w chwili salwy): salwa do `_cvFxRoundFx` z dzisiejszym tempem `combatFxPace`, bez dzisiejszej ścieżki');
  // Odcisk ścieżki OFF: ciała metod dzisiejszego silnika FX (i `_onCombatRoundFx` bez gałęzi CV-2a) == `0eabc4f`.
  const LEGACY = ['_onCombatRoundFx', '_combatEndpointWorld', '_isEnemyEndpointVisible', '_isCombatRevealed', '_spawnCombatTracer', '_spawnFx',
    '_disposeFx', '_updateActiveEffects', '_spawnHitGlow', '_followTracerEnds', '_followFxTarget'];
  const stripCv = (s) => s.replace(/\n    \/\/ ARC CV-2a — flaga `cvFxEngine`[^\n]*\n[^\n]*\n    if \(GAME_CONFIG\.FEATURES\?\.cvFxEngine\) \{ this\._cvFxRoundFx\(events, pace\); return; \}/, '');
  // ARC CV-6b2 — DWIE świadome zmiany ścieżki OFF (przecelowanie T9d: odcisk `0eabc4f` liczony po ich COFNIĘCIU, więc reszta ścieżki
  // nadal co do bitu): (1) Finding 630, decyzja właściciela §3.2-23 — czytelnik `uiPrefs.combatFxVisible` usunięty z `_onCombatRoundFx`;
  // (2) biały błysk trafienia P2b pod flagą `cvStrip` — bramka przy `_spawnHitGlow` w `_spawnCombatTracer` (§4 CV-6b2). T9g — ŚWIADEK
  // przecelowania (nie kontrola: na kodzie sprzed CV-6b2 pada, bo cofać nie ma czego), że obie zmiany są w źródle dokładnie tam.
  const undo6b2 = (s) => s
    .replace(/\n    \/\/ ARC CV-6b2 \(Finding 630, decyzja właściciela §3\.2-23\)[^\n]*\n    \/\/[^\n]*\n/, '\n    if (window.KOSMOS?.uiPrefs?.combatFxVisible === false) return;\n')
    .replace(/\n    \/\/ ARC CV-6b2 — biały błysk na modelu[^\n]*\n    \/\/[^\n]*\n    if \(ids\?\.target && !GAME_CONFIG\.FEATURES\?\.cvStrip\) this\._spawnHitGlow\(/, '\n    if (ids?.target) this._spawnHitGlow(');
  const fp = createHash('sha256').update(LEGACY.map(m => stripCv(undo6b2(fullBody(m) ?? `<brak ${m}>`))).join('\n')).digest('hex');
  assert(['_onCombatRoundFx', '_spawnCombatTracer'].every((m) => undo6b2(fullBody(m) ?? '') !== (fullBody(m) ?? '')),
    'T9g ŚWIADEK przecelowania T9d: obie zmiany CV-6b2 ścieżki OFF są w źródle (`combatFxVisible` wycofany, biały błysk pod `cvStrip`) — odcisk liczony po ich cofnięciu');
  const FP_0EABC4F = '3c19a2433dbfa33e85b22cb2a98b1f51a0797955c56738816fca46b73143b3ae';
  assert(fp === FP_0EABC4F, `T9d ścieżka OFF co do bitu jak w 0eabc4f (odcisk ${fp.slice(0, 12)}…)`);
  assert(stripCv(fullBody('_onCombatRoundFx') ?? '') !== (fullBody('_onCombatRoundFx') ?? ''), 'T9e KONTROLA: gałąź CV-2a jest w `_onCombatRoundFx` (odcisk liczony bez niej, nie z pliku sprzed zmiany)');
  assert((fullBody('_ensureFxEngine') ?? '').includes('logDepth: logDepthOn()'),
    'T9f renderer buduje silnik z flagą logarytmicznej głębi mapy (`logDepth: logDepthOn()`) — chunki V-267 w programach FX (T6a)');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
