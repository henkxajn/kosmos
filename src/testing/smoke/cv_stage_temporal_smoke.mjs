// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_stage_temporal_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3a3 (scena stabilna w czasie — Finding 652; stager
//   z uzbrojeniem lustrzanym — Finding 654; łaty sceny — Finding 653). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §3.2-10…13,
//   §4 CV-3a3.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// RENDERER: `ThreeRenderer` nie importuje się pod node ⇒ PRAWDZIWE metody (`_unstageVessels`, `_tickCombatGlide`,
//   `_placeFreeVessel`, `_tickBattleStage`, `_stageClusters`, `_syncEnemyAlertMarkers`, `_spawnExplosion`, …) wyciągnięte ze
//   źródła i wykonane na PRAWDZIWYM Three.js r171 (`src/lib`) z atrapą `this` (wzór `cv_stage_render_smoke`). Rundy starcia
//   jak w grze: co rundę pozycje LOGICZNE zbliżają się (krok podejścia), `_placeFreeVessel` zaczyna ruch płynny, pary
//   strzelec → cel zmieniają się co rundę; klatki po 16 ms (60 kl./s), runda = `combatRoundMs()` 1000 ms.
// CO PINUJE (wyłącznie logika — F11; bez pinów na stałych rysunku):
//   T1 (654) stager: statek strony B o indeksie i ma kadłub i moduły statku strony A o tym samym indeksie (10 na 10, 4 na 6,
//      broń stała); ŚWIADEK: uzbrojenie różni się między indeksami (porównanie przy tym samym indeksie coś znaczy)
//   T2 (652) prowadnica sceny liczy się NAJWYŻEJ raz na rundę na klaster przy niezmienionym składzie (20 rund, ruch płynny
//      co klatkę); ŚWIADEK: pozycje bazowe zmieniają się prawie co klatkę (dawny klucz z pozycji liczył co klatkę)
//   T3 (652) ciągłość: przy stałej kamerze (kino, stopień 1) rysowane pozycje nie skaczą między klatkami 60 kl./s o więcej
//      niż ε = 0,25 L; KONTROLA: rozwiązania kolejnych rund różnią się o więcej niż ε (bez płynnego przejścia — skok)
//   T4 (d) pauza: w trakcie przejścia (w połowie rundy) pozycje rysowane, przesunięcia i licznik rozwiązań stoją co do bitu
//      przez 60 klatek; po wznowieniu przejście idzie dalej
//   T5 dołączający (zmiana składu) — jedno dodatkowe rozwiązanie w tej samej rundzie, pozostali bez skoku
//   T6 zmiana id klastra (skończyło się starcie o najmniejszym id) — pozostali bez skoku (cel wyświetlany z poprzedniej klatki)
//   T7 (b) zero zapisów na statkach i ich `position` w T2–T6 (pułapka Proxy)
//   T8 (653) łaty pod flagą `cvStage` — umowa flagi, nie wartości: (a) celownik wroga — po decyzji właściciela 2026-11-09
//      (Finding 666 (b), przecelowane świadomie) uczestnik klastra starć w widoku bez celownika przy KAŻDYM zoomie (kino i skala
//      prawdziwa; oznaczają go romby HUD), wróg w widoku poza starciem i flaga OFF — jak dotąd; (b) silnik FX —
//      bez sceny pokrętła dzisiejsze (wzrost iskry w shaderze = dawne 1 + 2p co do wartości), ze sceną — pokrętła `STAGE_*`;
//      (c) kula wybuchu wraku — pod flagą promień z rozmiaru kadłuba (proporcjonalny), bez flagi dzisiejsza podłoga
//      (CV-6b: „w skali prawdziwej” przy podłodze stopnia 0 — decyzja 20 trzyma scenę przy każdym zoomie)
//   T9 (CV-6b, zgłoszenie właściciela 2026-11-09 — zacinanie) ruch ciągły w prędkości: rundy dłuższe niż `combatRoundMs`
//      (jak w grze), na każdej granicy statek jedzie dalej (≥ 30 % prędkości sprzed granicy), skok prędkości ≤ 1/3 przejścia
//      liniowego; KONTROLA (liczona w keeperze): przejście liniowe z klamrą CV-3a3 na tych samych rozwiązaniach — staje
//   T10 (CV-6b) zniszczenie w trakcie starcia nie przesuwa osi kadru („Obserwuj”, auto-fokus); KONTROLA: oś z samych żywych
//   T11 (CV-6b) scena wolnej bitwy nie zależy od ruchu płynnego logiki (inny ruch płynny — te same pozycje rysowane);
//      ŚWIADEK: pozycje bazowe różne
//
// ⚠ Fail-first: metody i pokrętła CV-3a3 powstają w tym kroku — brak = pin czerwony, suita się nie przerywa (każdy blok łapie
//   wyjątek, importy dynamiczne).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import * as FX                   from '../../utils/VesselFxLogic.js';
import * as CW                   from '../../renderer/CombatWatchLogic.js';
import { isEnemyVessel }         from '../../entities/Vessel.js';
import { VESSEL_TARGET_SIZE }    from '../../renderer/VesselModelResolver.js';
import { getMapInsets }          from '../../ui/MapInsets.js';
import { COSMIC }                from '../../config/LayoutConfig.js';
import { simClockMs }            from '../../utils/SimClock.js';
import { readFileSync }          from 'node:fs';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SL = await tryImport('../../renderer/combat/BattleStageLogic.js');
const SZ = await tryImport('../../renderer/combat/SemanticZoomLogic.js');
const SMOT = await tryImport('../../renderer/combat/StageMotionLogic.js');   // ARC CV-6b — ruch sceny ciągły w prędkości
const PC = await tryImport('../../renderer/combat/PresentationClock.js');
const ST = await tryImport('../../debug/CvBattleStager.js');
const ENG = await tryImport('../../renderer/combat/FxEngine.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');

// ── prawdziwe metody renderera ze źródła ─────────────────────────────────────────────────────────────────────────
const TR = read('src/renderer/ThreeRenderer.js');
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  const params = TR.slice(TR.indexOf('(', i) + 1, sigEnd);
  const end = TR.indexOf('\n  }\n', sigEnd);
  return { params, body: TR.slice(sigEnd + 4, end) };
}
const num = (re) => Number((TR.match(re) ?? [])[1]);
const WORLD_SCALE = num(/const WORLD_SCALE\s*=\s*([\d.]+)/);
const FX_HDR_EXPLOSION = num(/const FX_HDR_EXPLOSION\s*=\s*([\d.]+)/);
const ALERT_MARKER_SCALE = num(/const ALERT_MARKER_SCALE\s*=\s*([\d.]+)/);
const ALERT_MARKER_REF_DIST = num(/const ALERT_MARKER_REF_DIST\s*=\s*([\d.]+)/);
const ALERT_MARKER_PULSE_MAX = num(/const ALERT_MARKER_PULSE_MAX\s*=\s*([\d.]+)/);
const S = (v) => v / WORLD_SCALE;
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'isEnemyVessel', 'STAGE', 'solveStage', 'pairKey',
  'clusterEncounters', 'bandEdgesWU', 'stageBlend', 'stageBlendFloored', 'motionSegment', 'motionAt', 'targetVelocity', 'lengthPx', 'VESSEL_TARGET_SIZE', 'WORLD_SCALE', '_STAGE_V', 'centroidOf',
  'fitWatchFrameOffset', 'viewOffsetFrame', 'watchSafeRect', 'getMapInsets', 'COSMIC', 'glideRetarget', 'glideStep',
  'encounterClusters', 'encounterParticipants', 'pickStageField', 'stagePointLogical', 'stagePointDrawn', 'shellBaseAt',
  'simClockMs', 'capBillboardWorld', 'COMBAT_WATCH', 'ALERT_MARKER_SCALE', 'ALERT_MARKER_REF_DIST', 'ALERT_MARKER_PULSE_MAX',
  'EXPLOSION_RING_COLOR', 'FX_HDR_EXPLOSION'];
const METHODS = ['_unstageVessels', '_spriteBase', '_stageMark', '_stagePlace', '_stageClusters', '_tickBattleStage', 'getVesselStageBlend',
  '_stageWatchFit', '_stageFields', 'stageLogicalOf', 'stageWorldOf', '_placeFreeVessel', '_tickCombatGlide', '_syncEnemyAlertMarkers',
  '_spawnExplosion'];
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  try {
    return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(
      THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance, FX.isEngagementInView, isEnemyVessel, SL?.STAGE, SL?.solveStage, SL?.pairKey,
      SL?.clusterEncounters, SL?.bandEdgesWU, SZ?.stageBlend, SZ?.stageBlendFloored, SMOT?.motionSegment, SMOT?.motionAt, SMOT?.targetVelocity, SZ?.lengthPx, VESSEL_TARGET_SIZE, WORLD_SCALE, new THREE.Vector3(),
      CW.centroidOf, CW.fitWatchFrameOffset, CW.viewOffsetFrame, CW.watchSafeRect, getMapInsets, COSMIC, CW.glideRetarget, CW.glideStep,
      SL?.encounterClusters, SL?.encounterParticipants, SL?.pickStageField, SL?.stagePointLogical, SL?.stagePointDrawn, SL?.shellBaseAt,
      simClockMs, CW.capBillboardWorld, CW.COMBAT_WATCH, ALERT_MARKER_SCALE, ALERT_MARKER_REF_DIST, ALERT_MARKER_PULSE_MAX,
      FX.EXPLOSION_RING_COLOR, FX_HDR_EXPLOSION);
  } catch (e) { console.log(`    (budowa ${name}: ${e.message})`); return null; }
}

// ── świat atrapy: starcie 10 na 10 (szyk stagera) w oglądanym układzie, rundy jak w grze ─────────────────────────
const SYS = 'sys_t', AU = GAME_CONFIG.AU_TO_PX, L = VESSEL_TARGET_SIZE.frigate, EPS_L = 0.25;
const clock = { now: 1e6 };
globalThis.performance.now = () => clock.now;
let writes = 0;
const trap = (obj) => new Proxy(obj, { set(t, k, v) { writes++; t[k] = v; return true; }, defineProperty(t, k, d) { writes++; return Reflect.defineProperty(t, k, d); } });

function world({ split = false } = {}) {
  const layout = ST?.cvBattleLayout?.({ nA: 10, nB: 10 })?.ships ?? [];
  const vessels = new Map();
  const logical = new Map();   // pozycje logiczne poza pułapką (logika atrapy pisze tu, statek czyta przez getter)
  for (const s of layout) {
    const lp = { x: s.dxAU * AU, y: s.dyAU * AU };
    logical.set(s.name, lp);
    const pos = trap({ get x() { return lp.x; }, get y() { return lp.y; }, state: 'orbiting', dockedAt: null });
    const v = { id: s.name, name: s.name, systemId: SYS, position: pos, isEnemy: s.side === 'B', ownerEmpireId: s.side === 'B' ? 'emp_t' : undefined };
    vessels.set(v.id, trap(v));
  }
  const A = layout.filter((s) => s.side === 'A').map((s) => s.name), B = layout.filter((s) => s.side === 'B').map((s) => s.name);
  const mkEnc = (id, a, b) => ({ id, isActive: true, currentRound: 0, location: { systemId: SYS, point: { x: 0, y: 0 } },
    sideA: { vesselIds: a, joinedVesselIds: [] }, sideB: { vesselIds: b, joinedVesselIds: [] },
    vesselStates: new Map([...a, ...b].map((v) => [v, { hp: 100, shieldHP: 0 }])), timeline: [] });
  const list = split ? [mkEnc('enc_a', A.slice(0, 5), B.slice(0, 5)), mkEnc('enc_b', A.slice(5), B.slice(5))] : [mkEnc('enc_1', A, B)];
  const ts = { isPaused: false, multiplier: 1, combatRoundMs: () => 1000 };
  window.KOSMOS = { activeSystemId: SYS, timeSystem: ts, uiScale: 1,
    vesselManager: { getVessel: (id) => vessels.get(id) ?? null },
    deepSpaceCombatSystem: { listActive: () => list.filter((e) => e.isActive), _activeEncounters: new Map(list.map((e) => [e.id, e])),
      _findActiveEncounterContaining: (vid) => list.find((e) => e.isActive && e.vesselStates.has(vid)) ?? null },
    combatHud: { getPanelRect: () => ({ x: 520, y: 600, w: 560, h: 300 }) } };
  window.innerWidth = 1600; window.innerHeight = 1041;
  const cam = new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  const R = { camera: cam, scene: new THREE.Scene(), _vessels: new Map(), _galaxyActive: false, _galaxyFlight: false,
    _stageMarks: new Map(), _stageState: new Map(), _stageClock: PC ? new PC.PresentationClock() : null, _stageFrame: null,
    _stageClusterOf: new Map(), _stageParticipants: new Set(), _stageEdges: null, _stageFitCache: new Map(), _stageFitFrame: -1, _frameNo: 0, _glideLastMs: null,
    cvTuning: ENG?.LIVE_CV_FX ?? {}, missing: [] };
  for (const n of METHODS) { const fn = makeMethod(n); if (fn) R[n] = fn; else R.missing.push(n); }
  for (const v of vessels.values()) {
    const sp = new THREE.Object3D(); sp.visible = true;
    sp.position.set(S(v.position.x), 0.3, S(v.position.y));
    const e = { sprite: sp, glide: null };
    R._vessels.set(v.id, e);
    R._placeFreeVessel?.(v.id, e, v.position.x, v.position.y);   // pierwsze wejście w starcie: sprite w pozycji logicznej
  }
  return { R, vessels, logical, list, ts, A, B };
}
function placeCamera(R, d) {
  let cx = 0, cz = 0, n = 0;
  for (const [, e] of R._vessels) { cx += e.sprite.position.x; cz += e.sprite.position.z; n++; }
  cx /= n; cz /= n;
  R.camera.position.set(cx + d * Math.sin(1.1) * Math.cos(0.3), 0.3 + d * Math.cos(1.1), cz + d * Math.sin(1.1) * Math.sin(0.3));
  R.camera.lookAt(cx, 0.3, cz); R.camera.updateMatrixWorld(true);
}
/** Klatka jak pętla renderu: powrót na bazę → ruch płynny → scena. */
function frame(R, ms = 16) { clock.now += ms; R._frameNo++; R._unstageVessels(); R._tickCombatGlide(); R._tickBattleStage(); }
/** Runda starcia jak w DSCS: krok podejścia (pozycje logiczne), pary strzelec → cel tej rundy, `vessel:positionUpdate`. */
function round(w, encs = w.list) {
  for (const enc of encs) {
    if (!enc.isActive) continue;
    enc.currentRound++;
    const a = [...enc.sideA.vesselIds], b = [...enc.sideB.vesselIds];
    const events = a.map((id, i) => ({ attacker: id, target: b[(i + enc.currentRound) % b.length], weapon: 'weapon_kinetic', hit: true }));
    enc.timeline.push({ round: enc.currentRound, events });
    for (const id of [...a, ...b]) {
      const lp = w.logical.get(id);
      lp.x += (a.includes(id) ? 1 : -1) * 0.0015 * AU;             // krok podejścia: strony zbliżają się do siebie
      lp.y += Math.sin(enc.currentRound * 0.7 + id.length) * 0.0006 * AU;
    }
  }
  for (const [id, e] of w.R._vessels) { const v = w.vessels.get(id); w.R._placeFreeVessel(id, e, v.position.x, v.position.y); }
}
const drawnOf = (R) => new Map([...R._vessels].map(([id, e]) => [id, { x: e.sprite.position.x, y: e.sprite.position.y, z: e.sprite.position.z }]));
const maxStep = (a, b) => { let m = 0; for (const [id, p] of a) { const q = b.get(id); if (q) m = Math.max(m, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)); } return m; };
const FLAG0 = GAME_CONFIG.FEATURES.cvStage;
GAME_CONFIG.FEATURES.cvStage = true;

// ═══ T1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('T1 — (654) stager: uzbrojenie lustrzane', () => {
  const same = (nA, nB, opts = {}) => {
    const sh = ST?.cvBattleLayout?.({ nA, nB, ...opts })?.ships ?? [];
    const A = sh.filter((s) => s.side === 'A'), B = sh.filter((s) => s.side === 'B');
    const n = Math.min(A.length, B.length);
    let eq = n > 0;
    for (let i = 0; i < n; i++) if (A[i].hull !== B[i].hull || A[i].modules.join() !== B[i].modules.join()) eq = false;
    return { eq, A, B, n };
  };
  const t10 = same(10, 10), t46 = same(4, 6), tfix = same(5, 5, { weapons: 'missile' });
  assert(t10.eq && t10.n === 10 && t46.eq && t46.n === 4 && tfix.eq,
    'T1a SEDNO: statek B_i — kadłub i moduły statku A_i (10 na 10, 4 na 6, broń stała)');
  let differs = false;
  for (let i = 0; i + 1 < t10.A.length; i++) if (t10.A[i].modules.join() !== t10.A[i + 1].modules.join()) differs = true;
  assert(differs, 'T1b ŚWIADEK: uzbrojenie różni się między indeksami (porównanie przy tym samym indeksie coś znaczy)');
});

// ═══ T2 / T3 / T7 ═════════════════════════════════════════════════════════════════════════════════════════════════
const RUN = { solves: 0, rounds: 0, baseChanges: 0, frames: 0, maxStepL: 0, maxJumpL: 0, solveFrames: [], blendMin: 1 };
block('T2 / T3 — (652) prowadnica raz na rundę; rysowane pozycje bez skoków', () => {
  const w = world();
  const { R } = w;
  assert(R.missing.length === 0, `T2-0 metody renderera wyciągnięte ze źródła${R.missing.length ? ' — brak: ' + R.missing.join(', ') : ''}`);
  placeCamera(R, 0.4);
  writes = 0;
  for (let i = 0; i < 40; i++) frame(R);                       // wejście w scenę (JOIN_MS 500 ms) przed pomiarem
  let prevDrawn = drawnOf(R), prevBase = new Map([...R._stageMarks].map(([id, m]) => [id, { ...m.base }]));
  for (let f = 0; f < 20 * 62; f++) {
    if (f % 62 === 0) { round(w); RUN.rounds++; }
    frame(R);
    RUN.frames++;
    const sf = R._stageFrame;
    RUN.solves += sf?.solves ?? 0;
    if ((sf?.solves ?? 0) > 0) {
      RUN.solveFrames.push(f);
      const st = R._stageState.get('enc_1');
      let jump = 0;
      for (const [id, T] of st?.to ?? []) { const F = st.from.get(id); if (F) jump = Math.max(jump, Math.hypot(T.x - F.x, T.y - F.y, T.z - F.z)); }
      RUN.maxJumpL = Math.max(RUN.maxJumpL, jump / L);
    }
    RUN.blendMin = Math.min(RUN.blendMin, sf?.list?.[0]?.blend ?? 0);
    const drawn = drawnOf(R);
    RUN.maxStepL = Math.max(RUN.maxStepL, maxStep(drawn, prevDrawn) / L);
    let changed = false;
    for (const [id, m] of R._stageMarks) { const q = prevBase.get(id); if (!q || q.x !== m.base.x || q.z !== m.base.z) changed = true; }
    if (changed) RUN.baseChanges++;
    prevDrawn = drawn;
    prevBase = new Map([...R._stageMarks].map(([id, m]) => [id, { ...m.base }]));
  }
  RUN.writes = writes;
  console.log(`     ${RUN.rounds} rund, ${RUN.frames} klatek (60 kl./s), stopień min. ${RUN.blendMin.toFixed(3)}: rozwiązań ${RUN.solves}; klatek ze zmianą pozycji bazowej ${RUN.baseChanges}; `
    + `największy krok rysowany ${RUN.maxStepL.toFixed(4)} L / klatkę; największa zmiana rozwiązania między rundami ${RUN.maxJumpL.toFixed(3)} L`);
  assert(RUN.solves >= RUN.rounds && RUN.solves <= RUN.rounds + 1, `T2a SEDNO: prowadnica najwyżej raz na rundę przy stałym składzie (${RUN.solves} rozwiązań w ${RUN.rounds} rundach)`);
  assert(RUN.baseChanges >= 10 * RUN.rounds, `T2b ŚWIADEK: pozycje bazowe zmieniają się prawie co klatkę (${RUN.baseChanges} / ${RUN.frames}) — dawny klucz z pozycji liczył co klatkę`);
  assert(RUN.blendMin > 0.99 && RUN.maxStepL > 0 && RUN.maxStepL <= EPS_L,
    `T3a SEDNO: kino (stopień 1), 60 kl./s — największy krok rysowany ${RUN.maxStepL.toFixed(4)} L ≤ ε ${EPS_L} L (bez skoków; ruch jest — świadek)`);
  assert(RUN.maxJumpL > EPS_L, `T3b KONTROLA: rozwiązania kolejnych rund różnią się o ${RUN.maxJumpL.toFixed(3)} L > ε — bez płynnego przejścia byłby skok`);
});

// ═══ T4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('T4 — (d) pauza w trakcie przejścia: wszystko stoi co do bitu, po wznowieniu idzie dalej', () => {
  const w = world();
  const { R, ts } = w;
  placeCamera(R, 0.4);
  for (let i = 0; i < 40; i++) frame(R);
  round(w); for (let i = 0; i < 20; i++) frame(R);                 // w połowie przejścia
  const st = R._stageState.get('enc_1');
  const el0 = st?.el, solves0 = st?.solves, drawn0 = JSON.stringify([...drawnOf(R)]);
  ts.isPaused = true;
  for (let i = 0; i < 60; i++) frame(R);
  const el1 = st?.el, solves1 = st?.solves, drawn1 = JSON.stringify([...drawnOf(R)]);
  ts.isPaused = false;
  for (let i = 0; i < 10; i++) frame(R);
  const el2 = st?.el;
  assert(el0 > 0 && el0 < st.dur && el1 === el0 && solves1 === solves0 && drawn1 === drawn0,
    `T4a SEDNO: pauza 60 klatek w połowie przejścia (${el0} / ${st?.dur} ms) — przejście, rozwiązania i rysowane pozycje stoją co do bitu`);
  assert(el2 > el1, `T4b po wznowieniu przejście idzie dalej (${el1} → ${el2} ms)`);
});

// ═══ T5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('T5 — dołączający: jedno rozwiązanie więcej w tej samej rundzie, pozostali bez skoku', () => {
  const w = world();
  const { R, list, vessels, logical } = w;
  placeCamera(R, 0.4);
  for (let i = 0; i < 40; i++) frame(R);
  round(w); for (let i = 0; i < 70; i++) frame(R);
  const st = R._stageState.get('enc_1'), solves0 = st.solves;
  // dołączający: nowy statek AI obok strony B
  const id = 'CV-B11', lp = { x: 0.09 * AU, y: 0.05 * AU };
  logical.set(id, lp);
  const v = { id, name: id, systemId: SYS, position: trap({ get x() { return lp.x; }, get y() { return lp.y; }, state: 'orbiting', dockedAt: null }), isEnemy: true, ownerEmpireId: 'emp_t' };
  vessels.set(id, trap(v));
  const sp = new THREE.Object3D(); sp.visible = true; sp.position.set(S(lp.x), 0.3, S(lp.y));
  const e = { sprite: sp, glide: null };
  R._vessels.set(id, e); R._placeFreeVessel(id, e, lp.x, lp.y);
  list[0].sideB.joinedVesselIds.push(id); list[0].vesselStates.set(id, { hp: 100, shieldHP: 0 });
  const before = drawnOf(R); before.delete(id);
  frame(R);
  const after = drawnOf(R); after.delete(id);
  const step = maxStep(after, before) / L;
  assert(st.solves === solves0 + 1 && step <= EPS_L, `T5 dołączający: ${st.solves - solves0} rozwiązanie w tej samej rundzie, pozostali — krok ${step.toFixed(4)} L ≤ ε`);
});

// ═══ T6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('T6 — zmiana id klastra (skończyło się starcie o najmniejszym id): pozostali bez skoku', () => {
  const w = world({ split: true });
  const { R, list } = w;
  placeCamera(R, 0.4);
  for (let i = 0; i < 40; i++) frame(R);
  for (let r = 0; r < 3; r++) { round(w); for (let i = 0; i < 62; i++) frame(R); }
  const idBefore = R._stageFrame?.list?.[0]?.id;
  const staying = new Set([...list[1].sideA.vesselIds, ...list[1].sideB.vesselIds]);
  const before = new Map([...drawnOf(R)].filter(([id]) => staying.has(id)));
  list[0].isActive = false;
  frame(R);
  const after = new Map([...drawnOf(R)].filter(([id]) => staying.has(id)));
  const idAfter = R._stageFrame?.list?.[0]?.id;
  const step = maxStep(after, before) / L;
  assert(idBefore === 'enc_a' && idAfter === 'enc_b' && step <= EPS_L,
    `T6 klaster ${idBefore} → ${idAfter}: 10 statków drugiego starcia — krok ${step.toFixed(4)} L ≤ ε (start nowego rozwiązania = cel wyświetlany)`);
});

// ═══ T7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('T7 — (b) zero zapisów na statkach i ich `position`', () => {
  assert(RUN.writes === 0 && RUN.solves > 0, `T7 pułapka Proxy w T2–T3: ${RUN.writes} zapisów (świadek — ${RUN.solves} rozwiązań sceny)`);
});

// ═══ T8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('T8 — (653) łaty pod flagą `cvStage` — umowa flagi (bez pinów na wartościach)', () => {
  // (a) celownik wroga
  const w = world();
  const { R } = w;
  R._enemyAlertMarkers = new Map();
  R._getAlertReticleTex = () => (R._tex ??= new THREE.Texture());
  R._isEnemyTargetable = () => true;
  R._hud3dHex = () => 0xcc4433;
  R._viewDepth = () => 1;
  R._disposeEnemyAlertMarker = (k) => { const m = R._enemyAlertMarkers.get(k); if (m) R.scene.remove(m); R._enemyAlertMarkers.delete(k); };
  R._disposeAllEnemyAlertMarkers = () => { for (const k of [...R._enemyAlertMarkers.keys()]) R._disposeEnemyAlertMarker(k); };
  const prevFeat = GAME_CONFIG.FEATURES.fcEnemyAlertMarker;
  GAME_CONFIG.FEATURES.fcEnemyAlertMarker = true;
  // ⚠ Przecelowane ŚWIADOMIE (decyzja właściciela 2026-11-09, Finding 666 (b)): dawniej „w skali prawdziwej — jest” (celownik
  //   gasł ze stopniem sceny); teraz uczestnik klastra starć W WIDOKU nie ma celownika przy ŻADNYM zoomie (oznaczają go romby HUD),
  //   a wrogi statek w widoku POZA starciem — jak dotąd. Klatki jak w pętli renderu (`_tickBattleStage` zbiera uczestników).
  const foe = 'CV-B03';
  const xs = { id: 'X-01', name: 'X-01', systemId: SYS, isEnemy: true, ownerEmpireId: 'emp_t',
    position: { x: 0.05 * AU, y: 0.02 * AU, state: 'orbiting', dockedAt: null } };
  w.vessels.set(xs.id, xs);
  const spX = new THREE.Object3D(); spX.visible = true; spX.position.set(S(xs.position.x), 0.3, S(xs.position.y));
  R._vessels.set(xs.id, { sprite: spX, glide: null });
  // ⚠ ARC CV-6b (decyzja właściciela 20): „z daleka” przy podłodze 0 (krzywa CV-3a1, skala prawdziwa) — świadek, że celownika nie
  //   gasi stopień sceny, tylko reguła 666 (b); przy podłodze domyślnej z daleka też jest scena (stopień 1).
  const tuning0 = R.cvTuning;
  const at = (d, on, floor = null) => {
    GAME_CONFIG.FEATURES.cvStage = on;
    R.cvTuning = floor != null ? { ...tuning0, STAGE_BLEND_FLOOR: floor } : tuning0;
    placeCamera(R, d);
    for (let f = 0; f < 40; f++) frame(R);
    R._syncEnemyAlertMarkers();
    R.cvTuning = tuning0;
    return { foe: R._enemyAlertMarkers.has(foe), other: R._enemyAlertMarkers.has(xs.id), k: R._stageMarks.get(foe)?.k ?? 0 };
  };
  const cinema = at(0.4, true), far = at(60, true, 0), off = at(0.4, false);
  GAME_CONFIG.FEATURES.cvStage = true;
  GAME_CONFIG.FEATURES.fcEnemyAlertMarker = prevFeat;
  assert(cinema.k > 0.99 && far.k < 0.01, `T8a-0 świadek: kino — stopień statku ${cinema.k.toFixed(3)}, z daleka — ${far.k.toFixed(3)} (skala prawdziwa)`);
  assert(cinema.foe === false && far.foe === false && off.foe === true,
    `T8a SEDNO (666 (b)): uczestnik bitwy w widoku — celownik w kinie ${cinema.foe ? 'jest' : 'brak'}, w skali prawdziwej ${far.foe ? 'jest' : 'brak'}; flaga OFF — ${off.foe ? 'jest' : 'brak'}`);
  assert(cinema.other && far.other && off.other, `T8a KONTROLA: wróg w widoku poza starciem — celownik jak dotąd (${cinema.other} / ${far.other} / ${off.other})`);
  // (b) silnik FX
  const T = ENG?.LIVE_CV_FX;
  const E = ENG ? new ENG.FxEngine({ THREE, parent: new THREE.Scene(), logDepth: true }) : null;
  const cam = new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  E?.update({ nowMs: 0, camera: cam, viewportH: 1041 });
  const u = E?.sparks?.material?.uniforms;
  const offSel = u && u.uSizeK.value.x === T.FLASH_K && u.uSizeK.value.y === T.RING_K && u.uGrow?.value?.x === T.FLASH_GROW && u.uGrow?.value?.y === T.RING_GROW && u.uGrow?.value?.z === 1;
  E?.update({ nowMs: 16, camera: cam, viewportH: 1041, stage: true });
  const onSel = u && u.uSizeK.value.x === T.STAGE_FLASH_K && u.uSizeK.value.y === T.STAGE_RING_K && u.uGrow?.value?.x === T.STAGE_FLASH_GROW && u.uGrow?.value?.y === T.STAGE_RING_GROW;
  const vs = E?.sparks?.material?.vertexShader ?? '';
  // Wzrost iskry w shaderze: dziś `1 + (uGrow[kind] − 1) · p`; ścieżka bez sceny (uGrow = (FLASH_GROW, RING_GROW, 1)) = dawne
  // `kind < 1,5 ? 1 + 2p : 1` co do wartości (wzór liczony tu dla p ∈ [0, 1] i trzech rodzajów).
  let ident = /1\.0 \+ \(pickKind\(uGrow, aKind\) - 1\.0\) \* p/.test(vs);
  for (let p = 0; p <= 1.0001; p += 0.05) for (const [k, g] of [[0, T?.FLASH_GROW], [1, T?.RING_GROW], [2, 1]]) {
    const old = k < 1.5 ? 1 + 2 * p : 1, now = 1 + (g - 1) * p;
    if (Math.abs(old - now) > 1e-12) ident = false;
  }
  assert(!!E && offSel && onSel && ident,
    'T8b silnik FX: bez sceny — dzisiejsze pokrętła (wzrost iskry = dawne 1 + 2p co do wartości), ze sceną — pokrętła `STAGE_*` (wybór, nie wartości)');
  // (c) kula wybuchu wraku
  const radii = [];
  R._spawnFx = (mesh, cfg) => { radii.push({ r: mesh.geometry?.parameters?.radius, kind: cfg.kind, onTick: typeof cfg.onTick === 'function' }); };
  GAME_CONFIG.FEATURES.cvStage = true;
  R._spawnExplosion(new THREE.Vector3(0, 0.3, 0), 0.016); R._spawnExplosion(new THREE.Vector3(0, 0.3, 0), 0.028);
  GAME_CONFIG.FEATURES.cvStage = false;
  R._spawnExplosion(new THREE.Vector3(0, 0.3, 0), 0.016); R._spawnExplosion(new THREE.Vector3(0, 0.3, 0), 0.028);
  GAME_CONFIG.FEATURES.cvStage = true;
  const on = radii.filter((x) => x.kind === 'explosion').slice(0, 2), offR = radii.filter((x) => x.kind === 'explosion').slice(2, 4);
  assert(on.length === 2 && Math.abs(on[1].r / on[0].r - 0.028 / 0.016) < 1e-9 && on.every((x) => x.onTick)
    && offR.length === 2 && offR[0].r === offR[1].r && offR[0].r === Math.max(0.2, 0.016) * 0.4,
    `T8c kula wybuchu wraku: pod flagą promień ∝ rozmiar kadłuba (${on.map((x) => x.r?.toFixed?.(5)).join(' / ')} j.), bez flagi dzisiejsza podłoga (${offR.map((x) => x.r).join(' / ')} j.)`);
});

// ═══ T9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ARC CV-6b (zgłoszenie właściciela 2026-11-09 — „bitwy się zacinają”): ruch sceny ciągły w prędkości. Rundy co 64 klatki
// (1024 ms — w grze rundy szły co ~1013 ms czasu realnego, dłużej niż `combatRoundMs`), logika rusza się co rundę. Na każdej
// granicy rund statek, który jechał, nie zwalnia poniżej 30 % swojej prędkości sprzed granicy, a skok prędkości na granicy
// jest najwyżej 1/3 skoku przejścia liniowego. KONTROLA (liczona TU, niezależnie od renderera): przejście liniowe z klamrą
// (CV-3a3) na TYCH SAMYCH rozwiązaniach — staje (klatka bez ruchu) na każdej granicy i skacze w prędkości.
block('T9 — CV-6b: na granicy rund prędkość nie spada do zera i nie skacze (ruch ciągły w prędkości)', () => {
  const w = world();
  const { R } = w;
  placeCamera(R, 0.4);
  for (let i = 0; i < 40; i++) frame(R);
  const PER = 64, DT = 16, ids = [...w.A, ...w.B];
  const pos = [], solves = [];
  for (let f = 0; f < 12 * PER; f++) {
    if (f % PER === 0) round(w);
    frame(R, DT);
    pos.push(drawnOf(R));
    const st = R._stageState.get('enc_1');
    if ((R._stageFrame?.solves ?? 0) > 0 && st) {
      solves.push({ f, to: new Map([...st.to].map(([k, v]) => [k, { ...v }])), from: new Map([...st.from].map(([k, v]) => [k, { ...v }])) });
    }
  }
  // KONTROLA — przejście liniowe CV-3a3 na tych samych rozwiązaniach (układ świata: cele i starty rozwiązań), el od rozwiązania
  const lin = [];
  for (let f = 0; f < pos.length; f++) {
    let s = null; for (const q of solves) if (q.f <= f) s = q;
    if (!s) { lin.push(null); continue; }
    const u = Math.min(1, (f - s.f + 1) * DT / 1000);
    lin.push(new Map(ids.map((id) => { const T = s.to.get(id), F = s.from.get(id); return [id, T && F ? { x: F.x + (T.x - F.x) * u, y: F.y + (T.y - F.y) * u, z: F.z + (T.z - F.z) * u } : null]; })));
  }
  const vel = (P, f, id) => { const a = P[f - 1]?.get(id), b = P[f]?.get(id); return a && b ? { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z } : null; };
  const len = (v) => (v ? Math.hypot(v.x, v.y, v.z) : NaN);
  const stats = (P) => {
    let checks = 0, stops = 0, minRatio = Infinity, dvMax = 0;
    for (const s of solves.slice(1)) {
      for (const id of ids) {
        let pre = 0, n = 0;
        for (let k = s.f - 10; k <= s.f - 3; k++) { const l = len(vel(P, k, id)); if (Number.isFinite(l)) { pre += l; n++; } }
        pre /= Math.max(1, n);
        if (!(pre > 1e-5)) continue;   // statek jechał przed granicą (> 6·10⁻⁴ L / s nie ma znaczenia — próg zera)
        let mn = Infinity; for (let k = s.f - 2; k <= s.f + 2; k++) mn = Math.min(mn, len(vel(P, k, id)));
        checks++; minRatio = Math.min(minRatio, mn / pre); if (mn < 0.1 * pre) stops++;
        for (let k = s.f - 1; k <= s.f + 1; k++) {
          const v0 = vel(P, k, id), v1 = vel(P, k + 1, id);
          if (v0 && v1) dvMax = Math.max(dvMax, Math.hypot(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z) / L);
        }
      }
    }
    return { checks, stops, minRatio, dvMax };
  };
  const now = stats(pos), old = stats(lin);
  console.log(`     ${solves.length} rozwiązań w ${12} rundach po ${PER * DT} ms: teraz — kontroli ${now.checks}, zatrzymań ${now.stops}, min. prędkość / sprzed granicy ${now.minRatio.toFixed(2)}, `
    + `skok prędkości maks. ${now.dvMax.toFixed(4)} L/klatkę; liniowo (CV-3a3) — zatrzymań ${old.stops}/${old.checks}, min. ${old.minRatio.toFixed(2)}, skok ${old.dvMax.toFixed(4)} L/klatkę`);
  assert(solves.length >= 12 && now.checks >= 100 && now.stops === 0 && now.minRatio >= 0.3,
    `T9a SEDNO: na każdej granicy rund statek jedzie dalej (${now.checks} kontroli, zatrzymań ${now.stops}, prędkość min. ${(now.minRatio * 100).toFixed(0)} % sprzed granicy ≥ 30 %)`);
  assert(now.dvMax > 0 && old.dvMax > 0 && now.dvMax <= old.dvMax / 3,
    `T9b SEDNO: skok prędkości na granicy ${now.dvMax.toFixed(4)} L/klatkę ≤ 1/3 skoku przejścia liniowego (${old.dvMax.toFixed(4)} / 3 = ${(old.dvMax / 3).toFixed(4)})`);
  assert(old.stops > old.checks / 2, `T9c KONTROLA: przejście liniowe z klamrą (CV-3a3) na tych samych rozwiązaniach staje na granicy (${old.stops}/${old.checks}) — próba nie jest jałowa`);
});

// ═══ T10 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ARC CV-6b: zniszczenie statku w trakcie starcia nie przesuwa osi kadru „Obserwuj” / auto-fokusu (zmierzone w grze przed:
// 4 z 4 klatek ze zniszczeniem szarpnęły cel kamery 10–49 L/s) — kadr liczy WSZYSTKICH rysowanych uczestników, także
// zniszczonych (DSCS trzyma ich w starciu do końca, sprite stoi na scenie). KONTROLA: oś z samych żywych przesuwa się skokiem.
block('T10 — CV-6b: zniszczenie w trakcie starcia nie przesuwa osi kadru', () => {
  const run = (kill) => {
    const w = world();
    const { R, list } = w;
    R._cameraController = { _theta: 0.3, _phi: 1.1, _targetDist: 0.4, _dist: 0.4 };
    placeCamera(R, 0.4);
    for (let i = 0; i < 40; i++) frame(R);
    round(w); for (let i = 0; i < 20; i++) frame(R);
    const enc = list[0];
    const dead = w.B.slice(0, 5);   // jedna strona traci 5 statków (jak w bitwie, którą ktoś przegrywa)
    if (kill) for (const id of dead) enc.vesselStates.get(id).hp = 0;
    frame(R);
    const fit = R._stageWatchFit?.(enc);
    let lx = 0, lz = 0, n = 0;
    for (const [id, e] of R._vessels) if (!dead.includes(id)) { lx += e.sprite.position.x; lz += e.sprite.position.z; n++; }
    return { target: fit?.target ?? null, live: { x: lx / n, z: lz / n } };
  };
  const a = run(false), b = run(true);
  const d = a.target && b.target ? Math.hypot(b.target.x - a.target.x, b.target.z - a.target.z) / L : Infinity;
  const dLive = a.target ? Math.hypot(b.live.x - a.target.x, b.live.z - a.target.z) / L : 0;
  console.log(`     oś kadru: bez zniszczeń / po zniszczeniu 5 statków — różnica ${d.toExponential(2)} L; oś z samych żywych przesunęłaby się o ${dLive.toFixed(2)} L`);
  assert(Number.isFinite(d) && d < 1e-6, `T10a SEDNO: 5 zniszczonych w klatce — oś kadru ta sama co bez zniszczeń (${d.toExponential(2)} L)`);
  assert(dLive > 0.1, `T10b KONTROLA: oś z samych żywych przesunęłaby się o ${dLive.toFixed(2)} L (> 0,1 L) — próba nie jest jałowa`);
});

// ═══ T11 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ARC CV-6b: wolna bitwa na scenie (stopień 1) nie jedzie na ruchu płynnym logiki — cele sceny w świecie z pozycji LOGICZNYCH
// w chwili rundy. Dawniej początkiem układu był środek pozycji bazowych (ruch płynny: cele co ~150 ms tików fizyki, koniec ruchu
// przed kolejnym celem — w grze zatrzymania i szarpnięcia całej bitwy). Dwa światy: ten sam przebieg, w drugim ruch płynny
// każdego statku przesunięty o 0,05 j. — rysowane pozycje identyczne; ŚWIADEK: pozycje bazowe różnią się o 0,05 j.
block('T11 — CV-6b: scena wolnej bitwy nie zależy od ruchu płynnego logiki', () => {
  const run = (shift) => {
    const w = world();
    const { R } = w;
    placeCamera(R, 0.4);
    for (let i = 0; i < 40; i++) frame(R);
    round(w);
    if (shift) for (const [, e] of R._vessels) if (e.glide) { e.glide.from.x += 0.05; e.glide.to.x += 0.05; }
    for (let i = 0; i < 30; i++) frame(R);
    return { drawn: drawnOf(R), base: new Map([...R._stageMarks].map(([id, m]) => [id, { ...m.base }])) };
  };
  const a = run(false), b = run(true);
  let dd = 0, db = Infinity;
  for (const [id, p] of a.drawn) { const q = b.drawn.get(id); dd = Math.max(dd, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)); }
  for (const [id, p] of a.base) { const q = b.base.get(id); if (q) db = Math.min(db, Math.abs(q.x - p.x)); }
  console.log(`     ruch płynny przesunięty o 0,05 j.: pozycje bazowe różnią się min. ${db.toFixed(4)} j., rysowane maks. ${dd.toExponential(2)} j.`);
  assert(dd < 1e-9, `T11a SEDNO: rysowane pozycje identyczne mimo innego ruchu płynnego (różnica maks. ${dd.toExponential(2)} j.)`);
  assert(db > 0.04, `T11b ŚWIADEK: pozycje bazowe różnią się o ${db.toFixed(4)} j. (próba nie jest jałowa)`);
});

GAME_CONFIG.FEATURES.cvStage = FLAG0;
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
