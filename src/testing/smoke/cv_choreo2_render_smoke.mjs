// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_choreo2_render_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3c (lot wzdłuż kursu na scenie bitwy, wylot dysz, zwolnione tempo
//   skutków trafienia; decyzja właściciela 44). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §3.2-44, §4 CV-3c.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// RENDERER: PRAWDZIWE metody (`_tickBattleStage`, `_choreoCluster`, `_choreoPose`, `_choreoOrient`, `_choreoExhaust`, `_nozzleGlowSet`,
//   `_applyExhaust`, `_cvWpnImpact`, …) wyciągnięte ze źródła i wykonane na PRAWDZIWYM Three.js r171 (atrapa `this` — harness
//   `cv_choreo_render_smoke`, ten sam świat 10 na 10 stagera). Rigi w ramie kanonicznej z wylotami z `buildNozzleGlows`.
//   Domyślne pokrętła (`STAGE_SPREAD` 1,35) — pasma na krawędziach prawa rozsuniętego.
// CO PINUJE (logika):
//   G1 (D-CV-6) każda para w KAŻDEJ klatce w paśmie odstępu kotwic; ŚWIADEK — rzut wyłączony zmienia pasma
//   G2 koperta klasy (× rozsunięcie); G3 ciągłość (krok ≤ ε, bez zatrzymań na granicach rund)
//   G4 SEDNO — LOT na prawdziwym kleju (cele stałe): kąt dziób ↔ ruch rysowany w oknie 0,5 s — fregaty mediana ≤ 10° (p90 ≤ 30°),
//      niszczyciele ≤ 12°; pancernik — dziób za własną pętlą (≤ 3°; błądzenie kotwic sceny zostaje dryfem — do decyzji właściciela);
//      ŚWIADEK: flaga `cvChoreo2` OFF (CV-3b) — mediana ≥ 30° (dziób ku celowi, ruch bokiem)
//   G5 (d) pauza: pozycje, kwaterniony i wyloty stoją co do bitu
//   G6 wylot dysz: w walce widoczny na żywych statkach, stożek schowany; KONTROLA `cvChoreo2` OFF — stożek, wyloty schowane; zniszczony —
//      ciemny; zakrztuszenie (≤ 25 % HP) przygasza rdzeń
//   G7 przełączenie flagi w trakcie bitwy: ruch ciągły (krok ≤ ε), tryb przechodzi
//   G8 `_cvWpnImpact`: skutki trafienia (iskry, żar, błysk) w tempie `FX_TIME_SCALE` — przy 0,25 życie × 4, prędkość iskier × 0,25,
//      chwila trafienia bez zmian
//   G9 lot poza walką (`_applyExhaust`): w tranzycie wylot zapalony, w doku zgaszony; OFF — stożek jak CV-1a
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
const RIG = await tryImport('../../renderer/ShipModelRig.js');
const LG = await tryImport('../../renderer/combat/CombatLedgerLogic.js');

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
  'stepChoreo2Offset', 'stepChoreo2Facing', 'stepChoreo2Engine', 'NOZZLE_KEY_HEX',   // CV-3c
  'ledgerRng', 'FX_SHIELD_COLOR'];   // CV-3c — `_cvWpnImpact` (zwolnione tempo skutków trafienia)
const METHODS = ['_unstageVessels', '_spriteBase', '_stageMark', '_stagePlace', '_setSpriteBase', '_stageClusters', '_tickBattleStage', 'getVesselStageBlend',
  '_stageWatchFit', '_placeFreeVessel', '_tickCombatGlide', '_choreoCluster', '_choreoPose', '_choreoOrient', '_choreoHeadingOwned', '_choreoRelease',
  '_choreoEnd', '_choreoExhaust', '_applyExhaust', '_nozzleGlowSet', '_cvWpnImpact'];
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
    stepChoreo2Offset: CH?.stepChoreo2Offset, stepChoreo2Facing: CH?.stepChoreo2Facing, stepChoreo2Engine: CH?.stepChoreo2Engine, NOZZLE_KEY_HEX: RIG?.NOZZLE_KEY_HEX ?? 0x7ff4ff,
    ledgerRng: LG?.ledgerRng, FX_SHIELD_COLOR: 0x00ffff, ...over,
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
  // CV-3c — wyloty dysz z prawdziwego `buildNozzleGlows` (dwie dysze za rufą: lokalne −Z; dziób +Z)
  const glows = RIG?.buildNozzleGlows?.(THREE, { nozzles: [{ p: [0.03, 0, -0.48], d: [0, 0, -1], r: 0.04 }, { p: [-0.03, 0, -0.48], d: [0, 0, -1], r: 0.04 }] }, canon) ?? [];
  return { sprite: wrapper, isModel3D: true, canonical: true, rig: { canon, frameQuat: [0, 0, 0, 1], nozzleR: 0.04, exhaust: cone, glows }, exhaust: cone, _exhaustPhase: 0, glide: null };
}

function world({ encId = 'enc_1', doctrineA = null, retreatIdx = -1, choreo = true, stub = null, choreo2 = true } = {}) {
  GAME_CONFIG.FEATURES.cvChoreo = choreo;
  GAME_CONFIG.FEATURES.cvChoreo2 = choreo2;   // CV-3c — lot wzdłuż kursu (świadek: false — CV-3b)
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
    cvTuning: { ...(ENG?.LIVE_CV_FX ?? {}) }, missing: [], choreoCalls: 0 };   // CV-3c — domyślne pokrętła (rozsunięcie 1,35)
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
const SPREAD = ENG?.LIVE_CV_FX?.STAGE_SPREAD ?? 1;
const app = SL?.apparentEdges?.(edges, SL?.spreadLaw?.(SL.STAGE_LAW, SPREAD)) ?? [];
const LC = L * SPREAD;   // długość odniesienia sceny rozsuniętej (koperta choreografii)
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
const FLAG0 = GAME_CONFIG.FEATURES.cvStage, CHO0 = GAME_CONFIG.FEATURES.cvChoreo, CHO2_0 = GAME_CONFIG.FEATURES.cvChoreo2, FX0 = GAME_CONFIG.FEATURES.fcCombatFx;
GAME_CONFIG.FEATURES.cvStage = true;
GAME_CONFIG.FEATURES.fcCombatFx = true;
const pctl = (arr, q) => { const b = [...arr].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * q))] : NaN; };
const glowSig = (e) => (e.rig.glows ?? []).map((g) => [g.group.visible, g.core.scale.x, g.core.material.color.r, g.core.material.color.g, g.flare.scale.z]);

/** Bitwa 20 rund × 64 klatki: pomiary pasm, koperty, ciągłości i lotu (kąt dziób ↔ ruch rysowany). */
function battleRun({ choreo2 = true, stub = null, stable = false } = {}) {
  const w = world({ choreo2, stub });
  const { R } = w;
  placeCamera(R, 0.4);
  for (let i = 0; i < 40; i++) frame(R);
  const ids = [...w.A, ...w.B];
  const out = { missing: R.missing, pairs: 0, bandViol: 0, envViol: 0, envMax: 0, maxStepL: 0, flight: [], stops: 0, checks: 0, frames: 0, glowLit: 0, glowN: 0, coneLit: 0,
    cls: { frigate: { win: [], intent: [] }, destroyer: { win: [], intent: [] }, battleship: { win: [], intent: [] } } };
  const hist = new Map();
  const WARM = { frigate: 2, destroyer: 3, battleship: 7 };   // [s] zwrot początkowy klasy (≥ 180° / sufit skrętu)
  let prev = drawnOf(R);
  const pos = [], solveFrames = [];
  for (let f = 0; f < 20 * 64; f++) {
    if (f % 64 === 0) round(w, { stable });
    frame(R);
    if ((R._stageFrame?.solves ?? 0) > 0) solveFrames.push(f);
    const st = R._stageState.get('enc_1');
    const drawn = drawnOf(R);
    pos.push(drawn);
    for (let i = 0; i < ids.length; i++) {
      const ai = st.stagePos.get(ids[i]), mi = R._stageMarks.get(ids[i]);
      if (!ai || !(mi?.k >= 0.999)) continue;
      const di = drawn.get(ids[i]);
      const E = CH.choreoEnvelope(clsOf(w, ids[i]), LC, R.cvTuning);
      const off = Math.hypot(di.x - ai.x, di.y - ai.y, di.z - ai.z);
      out.envMax = Math.max(out.envMax, off / E);
      if (off > E + 1e-9) out.envViol++;
      for (let j = i + 1; j < ids.length; j++) {
        const aj = st.stagePos.get(ids[j]);
        if (!aj || !(R._stageMarks.get(ids[j])?.k >= 0.999)) continue;
        const dj = drawn.get(ids[j]);
        out.pairs++;
        if (bandOf(Math.hypot(dj.x - di.x, dj.y - di.y, dj.z - di.z)) !== bandOf(Math.hypot(aj.x - ai.x, aj.y - ai.y, aj.z - ai.z))) out.bandViol++;
      }
      // G4 — dziób ↔ ruch rysowany w oknie 0,5 s (po zwrocie początkowym klasy, przy prędkości > 0,1 L/s); dziób ↔ ruch zamierzony
      const cls = clsOf(w, ids[i]);
      if (f > WARM[cls] * 64) {
        const hh = hist.get(ids[i]) ?? [];
        const b = bowOf(R._vessels.get(ids[i]));
        const ang = (v) => Math.acos(Math.max(-1, Math.min(1, (b.x * v.x + b.y * v.y + b.z * v.z) / (Math.hypot(v.x, v.y, v.z) || 1)))) * 180 / Math.PI;
        if (hh.length >= 30) {
          const q0 = hh[hh.length - 30];
          const v = { x: di.x - q0.x, y: di.y - q0.y, z: di.z - q0.z };
          if (Math.hypot(v.x, v.y, v.z) / L / 0.5 > 0.1) { out.cls[cls].win.push(ang(v)); out.flight.push(ang(v)); }
        }
        const vi = mi.ch?.velInt;
        if (vi && Math.hypot(vi.x, vi.y, vi.z) * 1000 / L > 0.05) out.cls[cls].intent.push(ang(vi));
      }
    }
    for (const id of ids) out.maxStepL = Math.max(out.maxStepL, Math.hypot(drawn.get(id).x - prev.get(id).x, drawn.get(id).y - prev.get(id).y, drawn.get(id).z - prev.get(id).z) / L);
    if (f > 3 * 64) for (const id of ids) {
      const e = R._vessels.get(id);
      out.glowN++;
      const gl = e.rig.glows ?? [];   // wyloty muszą ISTNIEĆ — `every` na pustej tablicy liczyłby zapalone (fail-first na kodzie bez wylotów)
      if (gl.length > 0 && gl.every((g) => g.group.visible)) out.glowLit++;
      if (e.exhaust.visible) out.coneLit++;
    }
    for (const id of ids) { const arr = hist.get(id) ?? []; arr.push(drawn.get(id)); if (arr.length > 40) arr.shift(); hist.set(id, arr); }
    prev = drawn;
    out.frames++;
  }
  const len = (a, b) => (a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : NaN);
  for (const sf of solveFrames.slice(1)) for (const id of ids) {
    let pre = 0, n = 0;
    for (let k = sf - 10; k <= sf - 3; k++) { const l = len(pos[k - 1]?.get(id), pos[k]?.get(id)); if (Number.isFinite(l)) { pre += l; n++; } }
    pre /= Math.max(1, n);
    if (!(pre > 1e-6)) continue;
    let mn = Infinity; for (let k = sf - 2; k <= sf + 2; k++) mn = Math.min(mn, len(pos[k - 1]?.get(id), pos[k]?.get(id)));
    out.checks++; if (mn < 0.1 * pre) out.stops++;
  }
  return { w, out };
}

// ═══ G1 / G2 / G3 / G4 / G6 ═══════════════════════════════════════════════════════════════════════════════════════
let ON = null, OFF = null;
block('G1 / G2 / G3 / G6 — lot wzdłuż kursu na prawdziwym kleju (20 rund, cele zmieniane co rundę, 60 kl./s, rozsunięcie 1,35)', () => {
  ON = battleRun({ choreo2: true });
  const o = ON.out;
  assert(o.missing.length === 0, `G0 metody renderera wyciągnięte ze źródła${o.missing.length ? ' — brak: ' + o.missing.join(', ') : ''}`);
  console.log(`     ${o.frames} klatek, ${o.pairs} sprawdzeń par: zmian pasma ${o.bandViol}; koperta maks. ${o.envMax.toFixed(3)} E (przekroczeń ${o.envViol}); krok maks. ${o.maxStepL.toFixed(4)} L/klatkę; `
    + `granice rund ${o.checks} / zatrzymań ${o.stops}; dziób ↔ ruch: mediana ${pctl(o.flight, 0.5).toFixed(2)}°, p90 ${pctl(o.flight, 0.9).toFixed(1)}°, p99 ${pctl(o.flight, 0.99).toFixed(1)}° (n ${o.flight.length}); `
    + `wyloty zapalone ${o.glowLit}/${o.glowN}, stożki ${o.coneLit}`);
  assert(o.pairs > 100000 && o.bandViol === 0, `G1 SEDNO: w każdej klatce każda para w paśmie odstępu kotwic (${o.pairs} sprawdzeń, zmian ${o.bandViol})`);
  assert(o.envViol === 0 && o.envMax > 0.3, `G2 koperta klasy × rozsunięcie: przekroczeń ${o.envViol}, największe ${o.envMax.toFixed(3)} E (ruch jest)`);
  assert(o.maxStepL > 0 && o.maxStepL <= EPS_L && o.checks >= 100 && o.stops === 0,
    `G3 ciągłość: krok maks. ${o.maxStepL.toFixed(4)} L ≤ ε ${EPS_L}; granice rund ${o.checks}, zatrzymań ${o.stops}`);
  const c = o.cls;
  console.log(`     dziób ↔ ruch 0,5 s — fregaty mediana ${pctl(c.frigate.win, 0.5).toFixed(1)}° p90 ${pctl(c.frigate.win, 0.9).toFixed(1)}° · niszczyciele ${pctl(c.destroyer.win, 0.5).toFixed(1)}° p90 ${pctl(c.destroyer.win, 0.9).toFixed(1)}° · `
    + `pancerniki ${pctl(c.battleship.win, 0.5).toFixed(1)}°; dziób ↔ ruch zamierzony — pancerniki mediana ${pctl(c.battleship.intent, 0.5).toFixed(2)}° (kurs za pętlą)`);
  assert(o.glowLit === o.glowN && o.coneLit === 0, `G6a wylot dysz: zapalony na żywych statkach w walce (${o.glowLit}/${o.glowN}), stożek schowany (${o.coneLit})`);
});
let STB = null;
block('G4 — SEDNO LOT (cele stałe): dziób ↔ ruch rysowany w oknie 0,5 s; pancernik — dziób za własną pętlą', () => {
  STB = battleRun({ choreo2: true, stable: true });
  const c = STB.out.cls;
  console.log(`     fregaty: mediana ${pctl(c.frigate.win, 0.5).toFixed(1)}°, p90 ${pctl(c.frigate.win, 0.9).toFixed(1)}° (n ${c.frigate.win.length}) · niszczyciele: ${pctl(c.destroyer.win, 0.5).toFixed(1)}°, p90 ${pctl(c.destroyer.win, 0.9).toFixed(1)}° · `
    + `pancerniki: ruch ${pctl(c.battleship.win, 0.5).toFixed(1)}°, dziób ↔ ruch zamierzony ${pctl(c.battleship.intent, 0.5).toFixed(2)}° p90 ${pctl(c.battleship.intent, 0.9).toFixed(1)}°`);
  assert(c.frigate.win.length > 500 && pctl(c.frigate.win, 0.5) <= 10 && pctl(c.frigate.win, 0.9) <= 30,
    `G4a fregaty lecą wzdłuż kursu: kąt dziób ↔ ruch (0,5 s) mediana ${pctl(c.frigate.win, 0.5).toFixed(1)}° ≤ 10°, p90 ${pctl(c.frigate.win, 0.9).toFixed(1)}° ≤ 30°`);
  assert(c.destroyer.win.length > 500 && pctl(c.destroyer.win, 0.5) <= 12,
    `G4b niszczyciele: kąt dziób ↔ ruch (0,5 s) mediana ${pctl(c.destroyer.win, 0.5).toFixed(1)}° ≤ 12°`);
  assert(c.battleship.intent.length > 300 && pctl(c.battleship.intent, 0.5) <= 3,
    `G4c pancerniki: dziób za własną pętlą (ruch zamierzony) mediana ${pctl(c.battleship.intent, 0.5).toFixed(2)}° ≤ 3° — błądzenie kotwic sceny (~0,2 L / rundę) zostaje dryfem (do decyzji właściciela)`);
});
block('G4d / G6b — ŚWIADEK i KONTROLA: flaga `cvChoreo2` OFF — CV-3b (dziób ku celowi, ruch bokiem), stożki zamiast wylotów', () => {
  OFF = battleRun({ choreo2: false, stable: true });
  const o = OFF.out;
  const fw = o.cls.frigate.win;
  console.log(`     OFF: fregaty dziób ↔ ruch mediana ${pctl(fw, 0.5).toFixed(1)}° (n ${fw.length}); wyloty ${o.glowLit}/${o.glowN}, stożki ${o.coneLit}`);
  assert(fw.length > 300 && pctl(fw, 0.5) >= 30, `G4d ŚWIADEK: CV-3b — fregaty: mediana kąta dziób ↔ ruch ${pctl(fw, 0.5).toFixed(1)}° ≥ 30° (pin G4a nie jest jałowy)`);
  assert(o.glowLit === 0 && o.coneLit === o.glowN, `G6b KONTROLA: OFF — stożki smugi (${o.coneLit}/${o.glowN}), wyloty schowane (${o.glowLit})`);
});
block('G1c — ŚWIADEK: rzut wyłączony zmienia pasma (lot CV-3c)', () => {
  const r = battleRun({ choreo2: true, stub: ({ offsets }) => ({ pairs: 0, clamped: 0, passes: 0, halved: 0, zeroed: 0, residual: 0, offsets }) });
  assert(r.out.bandViol > 0, `G1c bez rzutu pary zmieniają pasmo (${r.out.bandViol}) — rzut potrzebny także dla lotu`);
});

// ═══ G5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('G5 — (d) pauza: pozycje, kwaterniony i wyloty stoją co do bitu', () => {
  const w = world({ choreo2: true });
  const { R } = w;
  placeCamera(R, 0.4);
  for (let f = 0; f < 4 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  w.ts.isPaused = true;
  frame(R);
  const snap = () => JSON.stringify([...R._vessels].map(([id, e]) => [id, e.sprite.position.toArray(), e.sprite.quaternion.toArray(), e.rig.canon.quaternion.toArray(), glowSig(e)]));
  const s0 = snap();
  let same = true;
  for (let k = 0; k < 60; k++) { frame(R); if (snap() !== s0) same = false; }
  w.ts.isPaused = false;
  for (let k = 0; k < 5; k++) frame(R);
  assert(same && snap() !== s0, 'G5 pauza: 60 klatek — pozycje, kwaterniony (wrapper, canon) i wyloty co do bitu; po wznowieniu ruch');
});

// ═══ G6c / G6d ════════════════════════════════════════════════════════════════════════════════════════════════════
block('G6c / G6d — zniszczony: wylot ciemny; zakrztuszenie (≤ 25 % HP): rdzeń przygasa', () => {
  const w = world({ choreo2: true });
  const { R } = w;
  placeCamera(R, 0.4);
  for (let f = 0; f < 3 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  const id = w.A[0], e = R._vessels.get(id);
  const core = () => { const c = e.rig.glows[0].core.material.color; return c.r + c.g + c.b; };
  const dmg0 = GAME_CONFIG.FEATURES.cvDamage;
  GAME_CONFIG.FEATURES.cvDamage = true;
  let base = 0, choke = 0;
  for (let k = 0; k < 30; k++) { e.cvDmgSputter = null; frame(R); base += core(); }
  for (let k = 0; k < 30; k++) { e.cvDmgSputter = 0.12; frame(R); choke += core(); }
  e.cvDmgSputter = null;
  e.cvKilled = true;
  frame(R);
  const dark = e.rig.glows.every((g) => !g.group.visible);
  GAME_CONFIG.FEATURES.cvDamage = dmg0;
  console.log(`     rdzeń: pełny ${(base / 30).toFixed(3)} → zakrztuszony ${(choke / 30).toFixed(3)}; zniszczony — wyloty ${dark ? 'zgaszone' : 'ZAPALONE'}`);
  assert(choke < 0.7 * base, `G6c zakrztuszenie przygasza rdzeń (${(choke / 30).toFixed(3)} < 0,7 × ${(base / 30).toFixed(3)})`);
  assert(dark, 'G6d zniszczony (pokazane trafienie zabijające) — wyloty dysz zgaszone');
});

// ═══ G7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('G7 — przełączenie `cvChoreo2` w trakcie bitwy: ruch ciągły, tryb przechodzi w obie strony', () => {
  const w = world({ choreo2: true });
  const { R } = w;
  placeCamera(R, 0.4);
  for (let f = 0; f < 4 * 64; f++) { if (f % 64 === 0) round(w); frame(R); }
  const ids = [...w.A, ...w.B];
  let prev = drawnOf(R), maxStep = 0;
  const run = (n) => { for (let k = 0; k < n; k++) { frame(R); const d = drawnOf(R); for (const id of ids) maxStep = Math.max(maxStep, Math.hypot(d.get(id).x - prev.get(id).x, d.get(id).y - prev.get(id).y, d.get(id).z - prev.get(id).z) / L); prev = d; } };
  GAME_CONFIG.FEATURES.cvChoreo2 = false; run(64);
  const off2 = ids.filter((id) => R._stageMarks.get(id)?.ch?.mode2).length;
  GAME_CONFIG.FEATURES.cvChoreo2 = true; run(64);
  const on2 = ids.filter((id) => R._stageMarks.get(id)?.ch?.mode2).length;
  assert(maxStep <= EPS_L && off2 === 0 && on2 === ids.length, `G7 krok maks. ${maxStep.toFixed(4)} L ≤ ε ${EPS_L}; po OFF w trybie 2 ${off2} statków, po ON ${on2}/${ids.length}`);
});

// ═══ G8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('G8 — `_cvWpnImpact`: iskry, żar i błysk trafienia w tempie FX_TIME_SCALE (0,25 — życie × 4, prędkość iskier × 0,25)', () => {
  const w = world({ choreo2: true });
  const { R } = w;
  const cap = [];
  const eng = { spawnMote: (p) => cap.push({ t0: p.t0, life: p.life, v: Math.hypot(p.vx ?? 0, p.vy ?? 0, p.vz ?? 0), kind: p.kind, color: p.color }) };
  const x = { impactAt: 5000, kind: 'kinetic', dmg: 12, seed: 4242, shd: null, target: w.B[0] };
  const shot = (scale) => { cap.length = 0; R.cvTuning = { ...R.cvTuning, FX_TIME_SCALE: scale }; R._cvWpnImpact(eng, x, 1, 0.3, 1, 0, 0, 0, -1, 0, 0, 0.02, 1000, 1); return cap.map((c) => ({ ...c })); };
  const a = shot(1), b = shot(0.25);
  const sparksA = a.filter((c) => c.kind === 0), sparksB = b.filter((c) => c.kind === 0);
  const glowA = a.find((c) => c.color === 0xff6a20), glowB = b.find((c) => c.color === 0xff6a20);
  const lifeOk = a.length === b.length && a.every((c, i) => Math.abs(b[i].life - c.life * 4) <= 1e-9 * c.life + 1e-9 || (c.life <= 1 && b[i].life >= 1));
  const vOk = sparksA.length > 0 && sparksA.every((c, i) => Math.abs(sparksB[i].v - c.v * 0.25) <= 1e-12 + 1e-9 * c.v);
  const t0Ok = a.every((c, i) => c.t0 === b[i].t0 && c.t0 === 5000);
  console.log(`     ${a.length} motków (iskry ${sparksA.length}); żar: życie ${glowA?.life?.toFixed(0)} → ${glowB?.life?.toFixed(0)} ms; iskra 0: v ${sparksA[0]?.v?.toExponential(2)} → ${sparksB[0]?.v?.toExponential(2)}`);
  assert(lifeOk && t0Ok && !!glowA && !!glowB, 'G8a życie każdego skutku trafienia × 1 / FX_TIME_SCALE (× 4 przy 0,25); chwila trafienia bez zmian (rejestr salw)');
  assert(vOk, 'G8b prędkość iskier × FX_TIME_SCALE — ten sam tor w zwolnionym tempie (ruch motka p₀ + v·wiek·(1 − p / 2))');
});

// ═══ G9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('G9 — lot poza walką (`_applyExhaust`): tranzyt — wylot zapalony, dok — zgaszony; OFF — stożek jak CV-1a', () => {
  const w = world({ choreo2: true });
  const { R } = w;
  const e = rigEntry(0);
  const vT = { position: { state: 'in_transit' }, isWreck: false }, vD = { position: { state: 'docked' }, isWreck: false };
  R._applyExhaust(vT, e);
  const transitOn = e.rig.glows.length > 0 && e.rig.glows.every((g) => g.group.visible) && !e.exhaust.visible;
  R._applyExhaust(vD, e);
  const dockOff = e.rig.glows.every((g) => !g.group.visible) && !e.exhaust.visible;
  GAME_CONFIG.FEATURES.cvChoreo2 = false;
  R._applyExhaust(vT, e);
  const offCone = e.exhaust.visible && e.rig.glows.every((g) => !g.group.visible);
  GAME_CONFIG.FEATURES.cvChoreo2 = true;
  assert(transitOn && dockOff, `G9a tranzyt — wylot zapalony, stożek schowany (${transitOn}); dok — wszystko zgaszone (${dockOff})`);
  assert(offCone, 'G9b KONTROLA: `cvChoreo2` OFF — stożek smugi w tranzycie (ścieżka CV-1a), wyloty schowane');
});

GAME_CONFIG.FEATURES.cvStage = FLAG0; GAME_CONFIG.FEATURES.cvChoreo = CHO0; GAME_CONFIG.FEATURES.cvChoreo2 = CHO2_0; GAME_CONFIG.FEATURES.fcCombatFx = FX0;
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
