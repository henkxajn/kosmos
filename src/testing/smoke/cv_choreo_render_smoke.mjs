// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_choreo_render_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3b (choreografia na scenie bitwy; F4, D-CV-6, D-CV-7; Findingi
//   622, 681). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.3, §4 CV-3b.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// RENDERER: `ThreeRenderer` nie importuje się pod node ⇒ PRAWDZIWE metody (`_tickBattleStage`, `_choreoCluster`, `_choreoPose`,
//   `_choreoOrient`, `_choreoRelease`, `_choreoEnd`, `_choreoExhaust`, `_stagePlace`, `_stageWatchFit`, …) wyciągnięte ze źródła
//   i wykonane na PRAWDZIWYM Three.js r171 (`src/lib`) z atrapą `this` (wzór `cv_stage_temporal_smoke`). Statki = rigi w ramie
//   kanonicznej (wrapper → canon → smuga), jak `buildShipRig` (kwaternion ramy jednostkowy: dziób +Z). Bitwa 10 na 10 szykiem
//   stagera z dala od gwiazdy (środek 2,5 AU na +X): strona A stoi RUFĄ do wroga (kurs na gwiazdę — Finding 681), strona B
//   dziobem do A (kurs spoczynkowy −X). Rundy jak w grze: krok podejścia, pary strzelec → cel co rundę, 60 kl./s.
// CO PINUJE (wyłącznie logika — F11):
//   R1 (D-CV-6) każda para klastra w KAŻDEJ klatce: pasmo odstępu RYSOWANEGO == pasmo odstępu kotwic sceny (choreografia nie
//      zmienia pasma); złe pasma względem logiki z choreografią == bez niej; ŚWIADEK (wymaga kodu choreografii): ten sam przebieg z rzutem wyłączonym
//      (zastępczy `constrainChoreo` bez działania) zmienia pasma
//   R2 koperta klasy na scenie: |rysowany − kotwica| ≤ koperta klasy × L
//   R3 ciągłość: krok rysowany ≤ ε 0,25 L / klatkę; na granicach rund statek jedzie dalej (bez zatrzymań — jak T9 CV-6b)
//   R4 (d) pauza: pozycje, kwaterniony (wrapper, canon) i smugi stoją co do bitu przez 60 klatek; po wznowieniu ruszają
//   R5 (Finding 681) cele stałe (zmianę celu pinują L9 / L12 w keeperze logiki); po czasie zwrotu każdy walczący (obie strony) ma dziób ku celowi (fregata, niszczyciel) albo burtę
//      (pancernik); KONTROLA: flaga OFF — strona A nadal rufą do wroga
//   R6 silnik w walce: smugi zapalone, fregaty jaśniejsze od pancerników; KONTROLA: flaga OFF — smugi zgaszone
//   R7 (b) zero zapisów na statkach i ich `position` (pułapka Proxy) przy choreografii
//   R8 (e) determinizm: dwa identyczne przebiegi — identyczne pozycje i kwaterniony; inne id starcia — inne fazy
//   R9 koniec bitwy: po wyjściu ze sceny `canon` = kwaternion ramy, smuga oddana `_applyExhaust`, stan zdjęty; statek wolny
//      zostaje z kursem z walki (nie wraca rufą do wroga)
//   R10 flaga OFF w trakcie bitwy: przesunięcia i kurs schodzą płynnie (krok ≤ ε), potem stan zdjęty; ON z powrotem — płynnie
//   R11 postawy przez prawdziwy klej: flota `hold_position` — mniejsza amplituda; statek z rozkazem odwrotu — dziób od zagrożenia
//      i pełny ciąg
//   R12 flaga OFF od początku: `_choreoCluster` nie wołane, żaden znacznik bez stanu, `canon` i smugi nietknięte
//   R13 oś kadru („Obserwuj”) bez przesunięć choreografii: `_stageWatchFit` = środek pozycji rysowanych minus przesunięcie × stopień
//   R14 (Finding 677) smuga statku w locie poza walką: pod `cvStage` faza migotania z zegara prezentacji — czas realny płynie,
//      zegar stoi ⇒ smuga stoi; KONTROLA bez `cvStage`: ta sama para wywołań migocze (czas realny)
//   R15 (Finding 622) sprite odtworzony W TRAKCIE bitwy (przełączenie układu, `cvModels`, nowy model) staje z kursem 0 — od
//      następnej klatki ma kurs z choreografii (dziób = kurs stanu); ŚWIADEK: przed tą klatką dziób daleko od kursu stanu
// ⚠ PRZECELOWANIE ŚWIADOME (CV-3c, decyzja właściciela 44): keeper pinuje choreografię CV-3b na scenie BEZ rozsunięcia — świat ustawia
//   `cvChoreo2` = false (lot wzdłuż kursu ma własny keeper `cv_choreo2_render_smoke`) i `STAGE_SPREAD` = 1 (progi koperty, ciągłości
//   i krawędzie pasm w L sceny CV-3b; rozsunięcie pinuje `cv_choreo2_logic_smoke` — niezmienniczość skali). Lista nazw wolnych
//   uzupełniona o funkcje CV-3c (metody kleju sięgają po nie przy przenikaniu trybów).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import * as FX                   from '../../utils/VesselFxLogic.js';
import * as CW                   from '../../renderer/CombatWatchLogic.js';
import { isEnemyVessel }         from '../../entities/Vessel.js';
import { VESSEL_TARGET_SIZE, vesselSizeClass } from '../../renderer/VesselModelResolver.js';
import { getMapInsets }          from '../../ui/MapInsets.js';
import { COSMIC }                from '../../config/LayoutConfig.js';
import { simClockMs }            from '../../utils/SimClock.js';
import { readFileSync }          from 'node:fs';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SL = await tryImport('../../renderer/combat/BattleStageLogic.js');
const SZ = await tryImport('../../renderer/combat/SemanticZoomLogic.js');
const SMOT = await tryImport('../../renderer/combat/StageMotionLogic.js');
const PC = await tryImport('../../renderer/combat/PresentationClock.js');
const ST = await tryImport('../../debug/CvBattleStager.js');
const ENG = await tryImport('../../renderer/combat/FxEngine.js');
const CH = await tryImport('../../renderer/combat/ChoreographyLogic.js');

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
const WORLD_SCALE = Number((TR.match(/const WORLD_SCALE\s*=\s*([\d.]+)/) ?? [])[1]);
const S = (v) => v / WORLD_SCALE;
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'isEnemyVessel', 'STAGE', 'solveStage', 'pairKey',
  'clusterEncounters', 'bandEdgesWU', 'apparentEdges', 'stageBlend', 'stageBlendFloored', 'motionSegment', 'motionAt', 'targetVelocity', 'lengthPx',
  'VESSEL_TARGET_SIZE', 'WORLD_SCALE', '_STAGE_V', 'centroidOf', 'fitWatchFrameOffset', 'viewOffsetFrame', 'watchSafeRect', 'getMapInsets', 'COSMIC',
  'glideRetarget', 'glideStep', 'encounterClusters', 'encounterParticipants', 'pickStageField', 'stagePointLogical', 'stagePointDrawn', 'shellBaseAt',
  'simClockMs', 'exhaustIntensityRaw', 'vesselSizeClass', 'createChoreo', 'choreoSeed', 'choreoClassOf', 'choreoEnvelope', 'postureOf', 'pickFacingTarget',
  'stepChoreoOffset', 'constrainChoreo', 'stepChoreoFacing', 'stepChoreoEngine', 'quatFromYawPitchRoll', '_CHQ_A', '_CHQ_C', '_CHQ_D', '_CHV',
  'stepChoreo2Offset', 'stepChoreo2Facing', 'stepChoreo2Engine', 'NOZZLE_KEY_HEX'];   // CV-3c
const METHODS = ['_unstageVessels', '_spriteBase', '_stageMark', '_stagePlace', '_setSpriteBase', '_stageClusters', '_stageClustersDscs', '_cvEncList', '_cvEncById', '_cvEncOf', '_cvVisWreck', '_tickBattleStage', 'getVesselStageBlend',
  '_stageWatchFit', '_placeFreeVessel', '_tickCombatGlide', '_choreoCluster', '_choreoPose', '_choreoOrient', '_choreoHeadingOwned', '_choreoRelease',
  '_choreoEnd', '_choreoExhaust', '_applyExhaust'];
function makeMethod(name, over = {}) {
  const m = methodOf(name);
  if (!m) return null;
  const vals = {
    THREE, S, GAME_CONFIG, window: globalThis.window, performance: globalThis.performance, isEngagementInView: FX.isEngagementInView, isEnemyVessel,
    STAGE: SL?.STAGE, solveStage: SL?.solveStage, pairKey: SL?.pairKey, clusterEncounters: SL?.clusterEncounters, bandEdgesWU: SL?.bandEdgesWU,
    apparentEdges: SL?.apparentEdges, stageBlend: SZ?.stageBlend, stageBlendFloored: SZ?.stageBlendFloored, motionSegment: SMOT?.motionSegment,
    motionAt: SMOT?.motionAt, targetVelocity: SMOT?.targetVelocity, lengthPx: SZ?.lengthPx, VESSEL_TARGET_SIZE, WORLD_SCALE, _STAGE_V: new THREE.Vector3(),
    centroidOf: CW.centroidOf, fitWatchFrameOffset: CW.fitWatchFrameOffset, viewOffsetFrame: CW.viewOffsetFrame, watchSafeRect: CW.watchSafeRect,
    getMapInsets, COSMIC, glideRetarget: CW.glideRetarget, glideStep: CW.glideStep, encounterClusters: SL?.encounterClusters,
    encounterParticipants: SL?.encounterParticipants, pickStageField: SL?.pickStageField, stagePointLogical: SL?.stagePointLogical,
    stagePointDrawn: SL?.stagePointDrawn, shellBaseAt: SL?.shellBaseAt, simClockMs, exhaustIntensityRaw: FX.exhaustIntensityRaw, vesselSizeClass,
    createChoreo: CH?.createChoreo, choreoSeed: CH?.choreoSeed, choreoClassOf: CH?.choreoClassOf, choreoEnvelope: CH?.choreoEnvelope,
    postureOf: CH?.postureOf, pickFacingTarget: CH?.pickFacingTarget, stepChoreoOffset: CH?.stepChoreoOffset, constrainChoreo: CH?.constrainChoreo,
    stepChoreoFacing: CH?.stepChoreoFacing, stepChoreoEngine: CH?.stepChoreoEngine, quatFromYawPitchRoll: CH?.quatFromYawPitchRoll,
    _CHQ_A: new THREE.Quaternion(), _CHQ_C: new THREE.Quaternion(), _CHQ_D: new THREE.Quaternion(), _CHV: new THREE.Vector3(),
    stepChoreo2Offset: CH?.stepChoreo2Offset, stepChoreo2Facing: CH?.stepChoreo2Facing, stepChoreo2Engine: CH?.stepChoreo2Engine, NOZZLE_KEY_HEX: 0x7ff4ff, ...over,
  };
  try {
    return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(...NAMES.map((n) => vals[n]));
  } catch (e) { console.log(`    (budowa ${name}: ${e.message})`); return null; }
}

// ── świat atrapy ─────────────────────────────────────────────────────────────────────────────────────────────────
const SYS = 'sys_t', AU = GAME_CONFIG.AU_TO_PX, L = VESSEL_TARGET_SIZE.frigate, EPS_L = 0.25, CX = 2.5 * AU;
const clock = { now: 1e6 };
globalThis.performance.now = () => clock.now;
let writes = 0;
const trap = (obj) => new Proxy(obj, { set(t, k, v) { writes++; t[k] = v; return true; }, defineProperty(t, k, d) { writes++; return Reflect.defineProperty(t, k, d); } });
const REST_YAW = -Math.PI / 2;   // kurs spoczynkowy ramy kanonicznej — dziób w świecie −X (jak ścieżka OFF)

/** Rig w ramie kanonicznej jak `buildShipRig` (kwaternion ramy jednostkowy — dziób +Z, smuga za rufą). */
function rigEntry(yaw) {
  const wrapper = new THREE.Object3D(), canon = new THREE.Object3D();
  wrapper.add(canon);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35 }));
  cone.visible = false; cone.scale.set(1e-6, 1e-6, 1e-6);
  canon.add(cone);
  wrapper.rotation.set(0, yaw, 0);
  wrapper.visible = true;
  return { sprite: wrapper, isModel3D: true, canonical: true, rig: { canon, frameQuat: [0, 0, 0, 1], nozzleR: 0.04, exhaust: cone }, exhaust: cone, _exhaustPhase: 0, glide: null };
}

function world({ encId = 'enc_1', doctrineA = null, retreatIdx = -1, choreo = true, stub = null } = {}) {
  GAME_CONFIG.FEATURES.cvChoreo = choreo;
  GAME_CONFIG.FEATURES.cvChoreo2 = false;   // CV-3c — keeper pinuje CV-3b (przecelowanie świadome, nagłówek)
  const layout = ST?.cvBattleLayout?.({ nA: 10, nB: 10 })?.ships ?? [];
  const vessels = new Map(), logical = new Map();
  for (const s of layout) {
    const lp = { x: CX + s.dxAU * AU, y: s.dyAU * AU };
    logical.set(s.name, lp);
    const pos = trap({ get x() { return lp.x; }, get y() { return lp.y; }, state: 'orbiting', dockedAt: null });
    const v = { id: s.name, name: s.name, shipId: s.hull, systemId: SYS, position: pos, isEnemy: s.side === 'B', ownerEmpireId: s.side === 'B' ? 'emp_t' : undefined };
    vessels.set(v.id, v);
  }
  const A = layout.filter((s) => s.side === 'A').map((s) => s.name), B = layout.filter((s) => s.side === 'B').map((s) => s.name);
  // strona A z rozkazem „Zaangażuj” jak w `cvBattle` (cel B_i); jeden statek opcjonalnie z rozkazem odwrotu (znacznik DSCS)
  A.forEach((id, i) => {
    vessels.get(id).movementOrder = i === retreatIdx ? { type: 'moveToPoint', _retreatFromCombat: true } : { type: 'engage', targetEntityId: B[i % B.length] };
  });
  for (const [id, v] of vessels) vessels.set(id, trap(v));
  const mkEnc = (id, a, b) => ({ id, isActive: true, currentRound: 0, location: { systemId: SYS, point: { x: CX, y: 0 } },
    sideA: { vesselIds: a, joinedVesselIds: [] }, sideB: { vesselIds: b, joinedVesselIds: [] },
    vesselStates: new Map([...a, ...b].map((v) => [v, { hp: 100, shieldHP: 0 }])), timeline: [] });
  const list = [mkEnc(encId, A, B)];
  const ts = { isPaused: false, multiplier: 1, combatRoundMs: () => 1000 };
  const fleets = { getVesselFleet: (id) => (doctrineA && A.includes(id) ? { id: 'f_cv', doctrine: doctrineA } : null) };
  window.KOSMOS = { activeSystemId: SYS, timeSystem: ts, uiScale: 1, fleetSystem: fleets,
    vesselManager: { getVessel: (id) => vessels.get(id) ?? null },
    deepSpaceCombatSystem: { listActive: () => list.filter((e) => e.isActive), _activeEncounters: new Map(list.map((e) => [e.id, e])),
      _findActiveEncounterContaining: (vid) => list.find((e) => e.isActive && e.vesselStates.has(vid)) ?? null },
    combatHud: { getPanelRect: () => null } };
  window.innerWidth = 1600; window.innerHeight = 1041;
  const cam = new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  const R = { camera: cam, scene: new THREE.Scene(), _vessels: new Map(), _galaxyActive: false, _galaxyFlight: false,
    _stageMarks: new Map(), _stageState: new Map(), _stageClock: PC ? new PC.PresentationClock() : null, _stageFrame: null,
    _stageClusterOf: new Map(), _stageParticipants: new Set(), _stageEdges: null, _stageFitCache: new Map(), _stageFitFrame: -1, _frameNo: 0, _glideLastMs: null,
    cvTuning: { ...(ENG?.LIVE_CV_FX ?? {}), STAGE_SPREAD: 1 }, missing: [], choreoCalls: 0 };   // CV-3c — scena bez rozsunięcia (nagłówek)
  for (const n of METHODS) { const fn = makeMethod(n, stub && n === '_choreoCluster' ? { constrainChoreo: stub } : {}); if (fn) R[n] = fn; else R.missing.push(n); }
  if (R._choreoCluster) { const f = R._choreoCluster; R._choreoCluster = function (...a) { R.choreoCalls++; return f.apply(this, a); }; }
  for (const v of vessels.values()) {
    const yaw = v.isEnemy ? REST_YAW : Math.atan2(-v.position.x, -v.position.y);   // A — na gwiazdę (0, 0) (Finding 681); B — spoczynkowy
    const e = rigEntry(yaw);
    e.sprite.position.set(S(v.position.x), 0.3, S(v.position.y));
    R._vessels.set(v.id, e);
    R._placeFreeVessel?.(v.id, e, v.position.x, v.position.y);
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
function frame(R, ms = 16) { clock.now += ms; R._frameNo++; R._unstageVessels(); R._tickCombatGlide(); R._tickBattleStage(); }
// Runda syntetyczna: strona B zmienia cel CO RUNDĘ (ćwiczy zmianę celu zwrotu); `stable` — stałe cele obu stron (R5: zwrot
// „po czasie zwrotu” ma sens tylko przy celu, który się nie zmienia — przy rotacji co ~1 s pancernik 30 °/s goni nowy cel).
function round(w, { stable = false } = {}) {
  for (const enc of w.list) {
    if (!enc.isActive) continue;
    enc.currentRound++;
    const a = [...enc.sideA.vesselIds], b = [...enc.sideB.vesselIds];
    const events = [...a.map((id, i) => ({ attacker: id, target: b[i % b.length], weapon: 'weapon_kinetic', hit: true })),
      ...b.map((id, i) => ({ attacker: id, target: a[(i + (stable ? 0 : enc.currentRound)) % a.length], weapon: 'weapon_laser', hit: true }))];
    enc.timeline.push({ round: enc.currentRound, events });
    for (const id of [...a, ...b]) {
      const lp = w.logical.get(id);
      lp.x += (a.includes(id) ? 1 : -1) * 0.0012 * AU;
      lp.y += Math.sin(enc.currentRound * 0.7 + id.length) * 0.0005 * AU;
    }
  }
  for (const [id, e] of w.R._vessels) { const v = w.vessels.get(id); w.R._placeFreeVessel(id, e, v.position.x, v.position.y); }
}
const drawnOf = (R) => new Map([...R._vessels].map(([id, e]) => [id, { x: e.sprite.position.x, y: e.sprite.position.y, z: e.sprite.position.z }]));
const bowOf = (e) => new THREE.Vector3(0, 0, 1).applyQuaternion(e.rig.canon.quaternion).applyQuaternion(e.sprite.quaternion);
const clsOf = (w, id) => CH?.choreoClassOf?.(vesselSizeClass(w.vessels.get(id)));
const edges = SL?.bandEdgesWU?.([GAME_CONFIG.WEAPON_SHORT_AU, GAME_CONFIG.WEAPON_MED_AU, GAME_CONFIG.WEAPON_LONG_AU], AU / WORLD_SCALE) ?? [];
const app = SL?.apparentEdges?.(edges) ?? [];
const bandOf = (d) => { for (let i = 0; i < app.length; i++) if (d <= app[i]) return i; return app.length; };
/** Błąd zwrotu: fregata / niszczyciel — kąt dziób ↔ cel; pancernik — |90° − kąt|. */
function facingErrors(w, ids = [...w.A, ...w.B]) {
  const out = [];
  for (const id of ids) {
    const e = w.R._vessels.get(id), m = w.R._stageMarks.get(id), tgt = m?.ch?.targetId ?? null;
    let tp = tgt ? w.R._vessels.get(tgt)?.sprite?.position : null;
    if (!tp) {   // bez stanu (flaga OFF) — cel jak choreografia: rozkaz „Zaangażuj” albo najbliższy przeciwnik
      const v = w.vessels.get(id);
      const foes = v.isEnemy ? w.A : w.B;
      const eng = v.movementOrder?.type === 'engage' ? v.movementOrder.targetEntityId : null;
      let best = eng, bd = Infinity;
      if (!best) for (const f of foes) { const d = e.sprite.position.distanceTo(w.R._vessels.get(f).sprite.position); if (d < bd) { bd = d; best = f; } }
      tp = w.R._vessels.get(best)?.sprite?.position;
    }
    const aim = tp.clone().sub(e.sprite.position).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, bowOf(e).dot(aim)))) / Math.PI * 180;
    out.push({ id, cls: clsOf(w, id), side: w.vessels.get(id).isEnemy ? 'B' : 'A', err: clsOf(w, id) === 'battleship' ? Math.abs(90 - ang) : ang, ang });
  }
  return out;
}
const FLAG0 = GAME_CONFIG.FEATURES.cvStage, CHO0 = GAME_CONFIG.FEATURES.cvChoreo;
GAME_CONFIG.FEATURES.cvStage = true;

// ═══ R1 / R2 / R3 / R6 / R7 ═══════════════════════════════════════════════════════════════════════════════════════
const RUN = { frames: 0, pairs: 0, bandViol: 0, misDrawn: 0, misAnchor: 0, envViol: 0, envMax: 0, maxStepL: 0, writes: 0, stops: 0, checks: 0, minRatio: Infinity,
  dvBound: 0, dvElse: 0,
  coneLit: 0, coneN: 0, plume: { frigate: [], destroyer: [], battleship: [] } };
block('R1 / R2 / R3 / R6 / R7 — pasma, koperta, ciągłość, silnik, zero zapisów (20 rund, 60 kl./s)', () => {
  const w = world();
  const { R } = w;
  assert(R.missing.length === 0, `R0 metody renderera wyciągnięte ze źródła${R.missing.length ? ' — brak: ' + R.missing.join(', ') : ''}`);
  placeCamera(R, 0.4);
  for (let i = 0; i < 40; i++) frame(R);
  writes = 0;
  const logicalList = () => [...w.logical].map(([id, p]) => ({ id, x: S(p.x), z: S(p.y) }));
  const ids = [...w.A, ...w.B];
  const PER = 64;
  const pos = [], solveFrames = [];
  let prev = drawnOf(R);
  for (let f = 0; f < 20 * PER; f++) {
    if (f % PER === 0) round(w);
    frame(R);
    if ((R._stageFrame?.solves ?? 0) > 0) solveFrames.push(f);
    const st = R._stageState.get('enc_1');
    const drawn = drawnOf(R);
    pos.push(drawn);
    // R1 / R2 — pary i koperta przy pełnym stopniu (po wejściu w scenę)
    for (let i = 0; i < ids.length; i++) {
      const ai = st.stagePos.get(ids[i]), mi = R._stageMarks.get(ids[i]);
      if (!ai || !(mi?.k >= 0.999)) continue;
      const di = drawn.get(ids[i]);
      const E = CH.choreoEnvelope(clsOf(w, ids[i]), L, R.cvTuning);
      const off = Math.hypot(di.x - ai.x, di.y - ai.y, di.z - ai.z);
      RUN.envMax = Math.max(RUN.envMax, off / L);
      if (off > E + 1e-9) RUN.envViol++;
      for (let j = i + 1; j < ids.length; j++) {
        const aj = st.stagePos.get(ids[j]);
        if (!aj || !(R._stageMarks.get(ids[j])?.k >= 0.999)) continue;
        const dj = drawn.get(ids[j]);
        RUN.pairs++;
        if (bandOf(Math.hypot(dj.x - di.x, dj.y - di.y, dj.z - di.z)) !== bandOf(Math.hypot(aj.x - ai.x, aj.y - ai.y, aj.z - ai.z))) RUN.bandViol++;
      }
    }
    RUN.misDrawn += SL.countMisbanded(logicalList(), drawn, edges);
    RUN.misAnchor += SL.countMisbanded(logicalList(), st.stagePos, edges);
    for (const id of ids) RUN.maxStepL = Math.max(RUN.maxStepL, Math.hypot(drawn.get(id).x - prev.get(id).x, drawn.get(id).y - prev.get(id).y, drawn.get(id).z - prev.get(id).z) / L);
    if (f > 3 * PER) for (const id of ids) {   // R6 — smugi po rozgrzaniu
      const c = R._vessels.get(id).exhaust;
      RUN.coneN++; if (c.visible && c.scale.y > 0) RUN.coneLit++;
      RUN.plume[clsOf(w, id)].push(c.visible ? c.scale.y : 0);
    }
    prev = drawn;
    RUN.frames++;
  }
  RUN.writes = writes;
  // R3 — granice rund (jak T9 CV-6b): statek jadący przed granicą nie zatrzymuje się na niej
  const len = (a, b) => (a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : NaN);
  for (const sf of solveFrames.slice(1)) {
    for (const id of ids) {
      let pre = 0, n = 0;
      for (let k = sf - 10; k <= sf - 3; k++) { const l = len(pos[k - 1]?.get(id), pos[k]?.get(id)); if (Number.isFinite(l)) { pre += l; n++; } }
      pre /= Math.max(1, n);
      if (!(pre > 1e-6)) continue;
      let mn = Infinity; for (let k = sf - 2; k <= sf + 2; k++) mn = Math.min(mn, len(pos[k - 1]?.get(id), pos[k]?.get(id)));
      RUN.checks++; RUN.minRatio = Math.min(RUN.minRatio, mn / pre); if (mn < 0.1 * pre) RUN.stops++;
    }
  }
  // skok prędkości klatka do klatki: przy granicach rund (±2 klatki od rozwiązania) i poza nimi
  const near = new Set();
  for (const sf of solveFrames.slice(1)) for (let k = sf - 2; k <= sf + 2; k++) near.add(k);
  for (let f = 2; f < pos.length; f++) {
    for (const id of ids) {
      const a = pos[f - 2].get(id), b = pos[f - 1].get(id), c = pos[f].get(id);
      const dv = Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y, c.z - 2 * b.z + a.z) / L;
      if (near.has(f)) RUN.dvBound = Math.max(RUN.dvBound, dv); else if (f > 64) RUN.dvElse = Math.max(RUN.dvElse, dv);
    }
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  console.log(`     ${RUN.frames} klatek, ${RUN.pairs} sprawdzeń par: zmiana pasma ${RUN.bandViol}; złe pasma względem logiki — rysowane ${RUN.misDrawn}, kotwice ${RUN.misAnchor}; `
    + `koperta maks. ${RUN.envMax.toFixed(3)} L (przekroczeń ${RUN.envViol}); krok maks. ${RUN.maxStepL.toFixed(4)} L/klatkę; granice rund — kontroli ${RUN.checks}, zatrzymań ${RUN.stops}, `
    + `min. ${(RUN.minRatio * 100).toFixed(0)} %, skok prędkości na granicy ${RUN.dvBound.toFixed(4)} / poza ${RUN.dvElse.toFixed(4)} L/klatkę; smugi zapalone ${RUN.coneLit}/${RUN.coneN}, długość średnio F ${mean(RUN.plume.frigate).toFixed(3)} / N ${mean(RUN.plume.destroyer).toFixed(3)} / P ${mean(RUN.plume.battleship).toFixed(3)}; zapisów ${RUN.writes}`);
  assert(RUN.pairs > 100000 && RUN.bandViol === 0, `R1a SEDNO: w każdej klatce każda para w paśmie odstępu kotwic sceny (${RUN.pairs} sprawdzeń, zmian ${RUN.bandViol})`);
  assert(RUN.misDrawn === RUN.misAnchor, `R1b złe pasma względem logiki: rysowane ${RUN.misDrawn} == kotwice ${RUN.misAnchor} (choreografia nie dokłada żadnej)`);
  assert(RUN.envViol === 0 && RUN.envMax > 0.3, `R2 koperta klasy na scenie: przekroczeń ${RUN.envViol}, największe przesunięcie ${RUN.envMax.toFixed(3)} L (ruch jest)`);
  assert(RUN.maxStepL > 0 && RUN.maxStepL <= EPS_L, `R3a ciągłość: krok rysowany maks. ${RUN.maxStepL.toFixed(4)} L / klatkę ≤ ε ${EPS_L} L`);
  // ⚠ Próg CV-6b „≥ 30 % prędkości sprzed granicy” (T9a, sama scena) NIE przenosi się na choreografię: przelot boczny zawraca
  //   płynnie przez zero (prędkość wzoru i kotwicy potrafią się chwilowo znosić — w dowolnym miejscu rundy). Sedno to brak
  //   ZATRZYMANIA na granicy i granica bez osobnego skoku prędkości (scena bez choreografii — T9 w cv_stage_temporal_smoke).
  assert(RUN.checks >= 100 && RUN.stops === 0 && RUN.dvBound <= Math.max(RUN.dvElse * 1.5, 1e-3),
    `R3b granice rund: ${RUN.checks} kontroli, zatrzymań ${RUN.stops}; skok prędkości przy granicy ${RUN.dvBound.toFixed(4)} ≤ 1,5 × poza granicami (${RUN.dvElse.toFixed(4)}) L/klatkę`);
  assert(RUN.coneLit === RUN.coneN && mean(RUN.plume.frigate) > mean(RUN.plume.battleship) * 1.3,
    `R6a silnik w walce: smugi zapalone ${RUN.coneLit}/${RUN.coneN}; fregaty (${mean(RUN.plume.frigate).toFixed(3)}) jaśniejsze od pancerników (${mean(RUN.plume.battleship).toFixed(3)})`);
  assert(RUN.writes === 0, `R7 (b) zero zapisów na statkach i ich position przy choreografii (${RUN.writes})`);
});
block('R1c — ŚWIADEK: ten sam przebieg z rzutem wyłączonym zmienia pasma', () => {
  const w = world({ stub: ({ offsets }) => ({ pairs: 0, clamped: 0, passes: 0, halved: 0, zeroed: 0, residual: 0, offsets }) });
  const { R } = w;
  placeCamera(R, 0.4);
  for (let i = 0; i < 40; i++) frame(R);
  const ids = [...w.A, ...w.B];
  let viol = 0;
  for (let f = 0; f < 10 * 64; f++) {
    if (f % 64 === 0) round(w);
    frame(R);
    const st = R._stageState.get('enc_1');
    const drawn = drawnOf(R);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const ai = st.stagePos.get(ids[i]), aj = st.stagePos.get(ids[j]);
      if (!ai || !aj) continue;
      const di = drawn.get(ids[i]), dj = drawn.get(ids[j]);
      if (bandOf(Math.hypot(dj.x - di.x, dj.y - di.y, dj.z - di.z)) !== bandOf(Math.hypot(aj.x - ai.x, aj.y - ai.y, aj.z - ai.z))) viol++;
    }
  }
  assert(viol > 0, `R1c ŚWIADEK: bez rzutu pary zmieniają pasmo ${viol} razy — pin R1a nie jest jałowy`);
});

// ═══ R4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R4 — (d) pauza: pozycje, kwaterniony i smugi stoją co do bitu', () => {
  const w = world();
  const { R, ts } = w;
  placeCamera(R, 0.4);
  for (let i = 0; i < 40; i++) frame(R);
  round(w); for (let i = 0; i < 30; i++) frame(R);
  const snap = () => JSON.stringify([...R._vessels].map(([id, e]) => [id, e.sprite.position.toArray(), e.sprite.quaternion.toArray(), e.rig.canon.quaternion.toArray(),
    e.exhaust.visible, e.exhaust.scale.toArray(), e.exhaust.material.opacity]));
  const s0 = snap();
  ts.isPaused = true;
  let same = true;
  for (let i = 0; i < 60; i++) { frame(R); if (snap() !== s0) same = false; }
  ts.isPaused = false;
  for (let i = 0; i < 10; i++) frame(R);
  assert(same, 'R4a SEDNO: 60 klatek pauzy — pozycje, kwaterniony wrappera i canon, smugi (widoczność, skala, krycie) identyczne co do bitu');
  assert(snap() !== s0, 'R4b po wznowieniu poza i smugi ruszają');
});

// ═══ R5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R5 — (Finding 681) po czasie zwrotu obie strony dziobem ku celowi (pancernik burtą); KONTROLA flaga OFF', () => {
  const run = (choreo) => {
    const w = world({ choreo });
    const { R } = w;
    placeCamera(R, 0.4);
    const e0 = facingErrors(w);
    for (let f = 0; f < 7 * 64; f++) { if (f % 64 === 0) round(w, { stable: true }); frame(R); }   // 7 s: pancernik 90° przy suficie + ustalenie; cele stałe
    return { w, start: e0, end: facingErrors(w) };
  };
  const on = run(true), off = run(false);
  const by = (arr, pred) => arr.filter(pred).map((x) => x.err);
  const max = (a) => Math.max(...a), med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const bowOn = by(on.end, (x) => x.cls !== 'battleship'), broad = by(on.end, (x) => x.cls === 'battleship');
  const startA = by(on.start, (x) => x.side === 'A' && x.cls !== 'battleship'), offA = by(off.end, (x) => x.side === 'A' && x.cls !== 'battleship');
  console.log(`     ON po 7 s: fregaty / niszczyciele odchyłka mediana ${med(bowOn).toFixed(1)}°, maks. ${max(bowOn).toFixed(1)}° (${bowOn.length}); pancerniki burta maks. ${max(broad).toFixed(1)}° (${broad.length}); `
    + `start strony A ${med(startA).toFixed(0)}°; OFF strona A po 7 s ${med(offA).toFixed(0)}°`);
  assert(bowOn.length >= 12 && max(bowOn) <= 30 && broad.length >= 6 && max(broad) <= 20,
    'R5a SEDNO: po 7 s każdy walczący obu stron ma dziób ku celowi (≤ 30° z wyprzedzeniem przelotu) albo burtę (pancernik ≤ 20°)');
  assert(med(startA) > 150, `R5b strona A startuje rufą do wroga (odchyłka mediana ${med(startA).toFixed(0)}° — scena Findingu 681)`);
  assert(med(offA) > 150, `R5c KONTROLA: flaga OFF — strona A po 7 s nadal rufą do wroga (${med(offA).toFixed(0)}°)`);
});

// ═══ R6b / R12 ════════════════════════════════════════════════════════════════════════════════════════════════════
block('R6b / R12 — flaga OFF od początku: smugi zgaszone, `_choreoCluster` nie wołane, canon nietknięty', () => {
  const w = world({ choreo: false });
  const { R } = w;
  placeCamera(R, 0.4);
  for (let f = 0; f < 4 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  let lit = 0, canonTouched = 0, withState = 0;
  for (const [, e] of R._vessels) { if (e.exhaust.visible) lit++; const q = e.rig.canon.quaternion; if (q.x || q.y || q.z || q.w !== 1) canonTouched++; }
  for (const m of R._stageMarks.values()) if (m.ch || m.choreo) withState++;
  assert(lit === 0, `R6b KONTROLA: flaga OFF — smugi zgaszone (${lit} zapalonych)`);
  assert(R.choreoCalls === 0 && withState === 0 && canonTouched === 0 && R._stageMarks.size === 20,
    `R12 flaga OFF: wywołań _choreoCluster ${R.choreoCalls}, znaczników ze stanem ${withState}, canon ruszony ${canonTouched} (scena jest — ${R._stageMarks.size} znaczników)`);
});

// ═══ R8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R8 — (e) determinizm: dwa przebiegi identyczne; inne starcie — inne fazy', () => {
  const run = (encId) => {
    const w = world({ encId });
    const { R } = w;
    placeCamera(R, 0.4);
    const trace = [];
    for (let f = 0; f < 4 * 64; f++) {
      if (f % 64 === 0) round(w);
      frame(R);
      if (f % 16 === 0) trace.push([...R._vessels].map(([, e]) => [...e.sprite.position.toArray(), ...e.sprite.quaternion.toArray(), ...e.rig.canon.quaternion.toArray()]));
    }
    return trace;
  };
  const a = run('enc_1'), b = run('enc_1'), c = run('enc_7');
  // inne fazy: przesunięcia względem kotwic różne — kotwice i statki te same, różnią się tylko pozycje rysowane
  let differ = 0, total = 0;
  for (let k = 4; k < a.length; k++) for (let i = 0; i < a[k].length; i++) { total++; if (Math.hypot(a[k][i][0] - c[k][i][0], a[k][i][1] - c[k][i][1], a[k][i][2] - c[k][i][2]) > 1e-4 * L) differ++; }
  assert(JSON.stringify(a) === JSON.stringify(b), `R8a SEDNO: dwa identyczne przebiegi — ${a.length} migawek pozycji i kwaternionów identycznych co do bitu`);
  assert(differ > total * 0.8, `R8b inne id starcia — inne fazy (${differ} / ${total} pozycji różnych)`);
});

// ═══ R9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R9 — koniec bitwy: canon = rama, smuga oddana, stan zdjęty; statek wolny zostaje z kursem z walki', () => {
  // wyjście bez choreografii (ten sam świat): powrót ze sceny do skali prawdziwej w JOIN_MS — krok tej samej skali co z choreografią
  const releaseStep = (choreo) => {
    const ww = world({ choreo });
    placeCamera(ww.R, 0.4);
    for (let f = 0; f < 6 * 64; f++) { if (f % 64 === 0) round(ww); frame(ww.R); }
    ww.list[0].isActive = false;
    let mx = 0, pv = drawnOf(ww.R);
    for (let i = 0; i < 60; i++) { frame(ww.R); const d = drawnOf(ww.R); for (const [id, p] of d) mx = Math.max(mx, Math.hypot(p.x - pv.get(id).x, p.y - pv.get(id).y, p.z - pv.get(id).z) / L); pv = d; }
    return mx;
  };
  const offStep = releaseStep(false);
  const w = world();
  const { R, list } = w;
  placeCamera(R, 0.4);
  for (let f = 0; f < 6 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  const yawOf = (e) => { const b = bowOf(e); return Math.atan2(b.x, b.z); };
  const before = new Map([...R._vessels].map(([id, e]) => [id, yawOf(e)]));
  list[0].isActive = false;
  let maxStep = 0, prev = drawnOf(R);
  for (let i = 0; i < 60; i++) { frame(R); const d = drawnOf(R); for (const [id, p] of d) maxStep = Math.max(maxStep, Math.hypot(p.x - prev.get(id).x, p.y - prev.get(id).y, p.z - prev.get(id).z) / L); prev = d; }
  let canonOk = 0, exhaustFree = 0, yawKept = 0, lit = 0;
  for (const [id, e] of R._vessels) {
    const q = e.rig.canon.quaternion;
    if (q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1) canonOk++;
    if (!e._choreoExhaust) exhaustFree++;
    if (e.exhaust.visible) lit++;
    let d = Math.abs(yawOf(e) - before.get(id)); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d <= 2 * Math.PI / 180) yawKept++;
  }
  assert(R._stageMarks.size === 0 && canonOk === 20 && exhaustFree === 20 && lit === 0,
    `R9a SEDNO: po wyjściu ze sceny znaczników ${R._stageMarks.size}, canon = rama ${canonOk}/20, smuga oddana ${exhaustFree}/20 (zgaszona — stan orbiting; zapalonych ${lit})`);
  assert(yawKept === 20 && maxStep <= offStep + EPS_L,
    `R9b statki wolne zostają z kursem z walki (${yawKept}/20 w ±2°); wyjście ciągłe — krok maks. ${maxStep.toFixed(4)} L ≤ wyjście bez choreografii ${offStep.toFixed(4)} L + ε`);
});

// ═══ R10 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R10 — flaga OFF w trakcie bitwy: płynne zejście, stan zdjęty; ON z powrotem — płynne wejście', () => {
  const w = world();
  const { R } = w;
  placeCamera(R, 0.4);
  for (let f = 0; f < 3 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  let maxStep = 0, prev = drawnOf(R);
  const step = () => { const d = drawnOf(R); for (const [id, p] of d) maxStep = Math.max(maxStep, Math.hypot(p.x - prev.get(id).x, p.y - prev.get(id).y, p.z - prev.get(id).z) / L); prev = d; };
  GAME_CONFIG.FEATURES.cvChoreo = false;
  for (let i = 0; i < 45; i++) { frame(R); step(); }
  let withState = 0, canonOk = 0;
  for (const m of R._stageMarks.values()) if (m.ch || m.choreo) withState++;
  for (const [, e] of R._vessels) { const q = e.rig.canon.quaternion; if (q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1) canonOk++; }
  const offStep = maxStep;
  GAME_CONFIG.FEATURES.cvChoreo = true;
  maxStep = 0;
  for (let i = 0; i < 60; i++) { frame(R); step(); }
  let back = 0;
  for (const m of R._stageMarks.values()) if (m.ch && m.cw > 0.99) back++;
  assert(offStep <= EPS_L && withState === 0 && canonOk === 20, `R10a OFF w trakcie: krok maks. ${offStep.toFixed(4)} L, po 0,7 s stan zdjęty (${withState}), canon = rama ${canonOk}/20`);
  assert(maxStep <= EPS_L && back === 20, `R10b ON z powrotem: krok maks. ${maxStep.toFixed(4)} L, choreografia z pełną wagą ${back}/20`);
});

// ═══ R11 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R11 — postawy przez prawdziwy klej: hold — mniejsza amplituda; odwrót — dziób od zagrożenia, pełny ciąg', () => {
  const amp = (doctrineA) => {
    const w = world({ doctrineA });
    const { R } = w;
    placeCamera(R, 0.4);
    let s = 0, n = 0;
    for (let f = 0; f < 6 * 64; f++) {
      if (f % 64 === 0) round(w);
      frame(R);
      if (f > 3 * 64) for (const id of w.A) { const o = R._stageMarks.get(id)?.choreo; if (o) { s += Math.hypot(o.x, o.y, o.z) / L; n++; } }
    }
    return s / Math.max(1, n);
  };
  const aEng = amp(null), aHold = amp('hold_position');
  assert(aHold < 0.5 * aEng && aEng > 0.2, `R11a flota hold_position — amplituda strony A ${aHold.toFixed(3)} L < 0,5 × angażuj (${aEng.toFixed(3)} L)`);
  const w = world({ retreatIdx: 0 });
  const { R } = w;
  placeCamera(R, 0.4);
  for (let f = 0; f < 4 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  const id = w.A[0], e = R._vessels.get(id), m = R._stageMarks.get(id);
  const tp = R._vessels.get(m.ch.targetId)?.sprite?.position;
  const ang = tp ? Math.acos(Math.max(-1, Math.min(1, bowOf(e).dot(tp.clone().sub(e.sprite.position).normalize())))) / Math.PI * 180 : 0;
  const plumes = w.A.map((x) => R._vessels.get(x).exhaust.scale.y);
  assert(m.ch.posture === 'retreat' && ang > 120 && plumes[0] >= Math.max(...plumes) - 1e-12,
    `R11b statek z rozkazem odwrotu: postawa ${m.ch.posture}, dziób ${ang.toFixed(0)}° od celu, smuga najdłuższa w stronie A (${plumes[0].toFixed(3)})`);
});

// ═══ R13 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R13 — oś kadru „Obserwuj” bez przesunięć choreografii', () => {
  const w = world();
  const { R, list } = w;
  R._cameraController = { _theta: 0.3, _phi: 1.1, _targetDist: 0.4, _dist: 0.4 };
  placeCamera(R, 0.4);
  for (let f = 0; f < 3 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  const fit = R._stageWatchFit?.(list[0]);
  let cx = 0, cy = 0, cz = 0, n = 0, moved = 0;
  for (const [id, e] of R._vessels) {
    const m = R._stageMarks.get(id), o = m?.choreo, p = e.sprite.position;
    if (o && Math.hypot(o.x, o.y, o.z) > 0.05 * L) moved++;
    cx += p.x - (o ? o.x * m.k : 0); cy += p.y - (o ? o.y * m.k : 0); cz += p.z - (o ? o.z * m.k : 0); n++;
  }
  const d = fit?.target ? Math.hypot(fit.target.x - cx / n, fit.target.y - cy / n, fit.target.z - cz / n) : Infinity;
  assert(d < 1e-12 && moved > 10, `R13 oś kadru = środek pozycji rysowanych minus przesunięcie choreografii × stopień (różnica ${d.toExponential(2)} j.; przesuniętych ${moved})`);
});

// ═══ R14 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R14 — (Finding 677) smuga w locie poza walką: pod sceną faza migotania z zegara prezentacji (pauza zatrzymuje smugę)', () => {
  let now = 1000;
  const exh = makeMethod('_applyExhaust', { performance: { now: () => now } });
  const R = { cvTuning: ENG?.LIVE_CV_FX ?? {}, _stageClock: PC ? new PC.PresentationClock() : null };
  const e = rigEntry(0);
  const v = { id: 'T1', position: { state: 'in_transit' } };
  const F = GAME_CONFIG.FEATURES, keepStage = F.cvStage, keepFx = F.fcCombatFx;
  const pair = (stage) => {
    F.cvStage = stage; F.fcCombatFx = true;
    now = 1000; exh.call(R, v, e); const a = { len: e.exhaust.scale.y, op: e.exhaust.material.opacity };
    now = 1037; exh.call(R, v, e); const b = { len: e.exhaust.scale.y, op: e.exhaust.material.opacity };
    return { a, b, same: a.len === b.len && a.op === b.op, lit: e.exhaust.visible };
  };
  try {
    const on = pair(true), off = pair(false);
    console.log(`     cvStage ON: długość ${on.a.len.toFixed(5)} → ${on.b.len.toFixed(5)} (czas realny +37 ms, zegar stoi); cvStage OFF: ${off.a.len.toFixed(5)} → ${off.b.len.toFixed(5)}`);
    assert(!!exh && on.lit && on.same, 'R14a SEDNO: pod `cvStage` czas realny płynie, zegar prezentacji stoi — smuga w locie stoi co do bitu (długość i krycie)');
    assert(off.lit && !off.same, 'R14b KONTROLA: bez `cvStage` ta sama para wywołań migocze (faza z czasu realnego — ścieżka sprzed zmiany)');
  } finally { F.cvStage = keepStage; F.fcCombatFx = keepFx; }
});

// ═══ R15 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R15 — (Finding 622) sprite odtworzony w trakcie bitwy: kurs z choreografii od następnej klatki', () => {
  const w = world();
  const { R } = w;
  placeCamera(R, 0.4);
  for (let f = 0; f < 4 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  const want = (ch) => new THREE.Vector3(Math.sin(ch.yaw) * Math.cos(ch.pitch), Math.sin(ch.pitch), Math.cos(ch.yaw) * Math.cos(ch.pitch));
  const deg = (a, b) => a.angleTo(b) * 180 / Math.PI;
  // statek strony A z kursem stanu najdalej od kursu 0 (świadek musi móc się różnić)
  let id = null, best = -1;
  for (const vid of w.A) { const ch = R._stageMarks.get(vid)?.ch; if (!ch || ch.yaw == null) continue; const d = deg(new THREE.Vector3(0, 0, 1), want(ch)); if (d > best) { best = d; id = vid; } }
  const old = R._vessels.get(id);
  const fresh = rigEntry(0);                       // jak `_addVesselModelCv` w trakcie bitwy: kurs 0, `canon` = rama
  fresh.sprite.position.copy(old.sprite.position);
  R._vessels.set(id, fresh);
  const before = deg(bowOf(fresh), want(R._stageMarks.get(id).ch));
  frame(R);
  const after = deg(bowOf(fresh), want(R._stageMarks.get(id).ch));
  console.log(`     ${id}: dziób odtworzonego sprite'a od kursu stanu — przed klatką ${before.toFixed(1)}°, po klatce ${after.toFixed(3)}°`);
  assert(after < 0.5, `R15a SEDNO: po jednej klatce dziób odtworzonego sprite'a = kurs choreografii (odchyłka ${after.toFixed(3)}°)`);
  assert(before > 20, `R15b ŚWIADEK: sprite odtworzony z kursem 0 stał ${before.toFixed(1)}° od kursu stanu (pin R15a nie jest jałowy)`);
});

GAME_CONFIG.FEATURES.cvStage = FLAG0;
GAME_CONFIG.FEATURES.cvChoreo = CHO0;
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
