// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_stage_render_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3a1 (scena bitwy w rendererze; Findingi 638, 641, 642, 643).
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.2, §4 CV-3a1.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// RENDERER: `ThreeRenderer` nie importuje się pod node ⇒ PRAWDZIWE metody sceny (`_unstageVessels`, `_spriteBase`,
//   `_stagePlace`, `_stageClusters`, `_tickBattleStage`, `_stageWatchFit`, `_stageSuccessor`, `_syncCombatViewOffset`,
//   `_hideEncounterRings`, `_spawnExplosion`, `_placeFreeVessel`, …) wyciągnięte ze źródła i wykonane na PRAWDZIWYM
//   Three.js r171 (`src/lib`) z atrapą `this` (wzór `cv_fx_results_smoke`).
// CO PINUJE (logika — F11):
//   R1 flaga OFF: zero znaczników sceny, sprite'y nietknięte co do bitu
//   R2 flaga ON, kamera blisko: po wejściu rysowane = scena — KAŻDA para w swoim paśmie (odstęp rysowany wobec
//      logicznego); (b) pozycje logiczne statków nietknięte (pułapka zapisu na `position` i na statku: zero zapisów)
//   R3 początek klatki: sprite wraca na bazę co do bitu; nowa pozycja zapisana między klatkami (ruch, orbita) — zostaje
//   R4 `_spriteBase` — baza, gdy sprite trzyma pozycję rysowaną; po nowym zapisie — ta nowa
//   R5 (d) pauza: wejście w scenę stoi (zegar prezentacji), stopień sceny dalej idzie za kamerą
//   R6 koniec starcia: powrót do skali prawdziwej przez JOIN_MS czasu prezentacji (nie skokiem), w pauzie stoi
//   R7 tryb galaktyki — bez sceny; R8 uczestnik przy ciele, ciało BEZ rysunku (atrapa bez `getBodyWorldInfo`) — bez sceny
//      (CV-3a3: skorupa przy ciele wymaga rysunku ciała — przy ciele z rysunkiem scena jest: `cv_stage_shell_smoke`)
//   R9 (642) pierścień starcia DSCS ukryty pod flagą, znacznik imitacji orbitalnej — nie; R10 (641) eksplozja wraku pod
//      flagą bez płaskiego pierścienia (OFF — z pierścieniem)
//   R11 (643) przesunięcie ekranowe kadru walki: przy „Obserwuj” — `setViewOffset`, cel kamery nietknięty; po końcu —
//      wygaszenie i `clearViewOffset`; przy podglądzie obserwatorium — nic
//   R12 (638) jedna bitwa = klaster: kadr obejmuje oba starcia klastra; obserwacja przechodzi na drugie starcie klastra
//   R13 ruch płynny startuje z pozycji BEZ sceny (sprite trzyma rysowaną)
//   R14 źródło: (b) tripwire — renderer i `src/renderer/combat/*` nie piszą pozycji logicznej statku (KONTROLA:
//      wstrzyknięty zapis złapany); kolejność w pętli renderu; bramki flagi przy wywołaniach
//   R15 (CV-3a2, D-CV-5) pole kliku sceny na prawdziwych metodach: punkt rysowany między statkami → `stageLogicalOf` →
//      `stageWorldOf` = ten sam punkt; poza flagą, w galaktyce, dla innego układu, przed wejściem w scenę (pauza od startu)
//      i dla bitwy przy ciele bez rysunku ciała — bez pola (punkt bez zmian; z rysunkiem — `cv_stage_shell_smoke` R6)
//   R16 (CV-3a2, Finding 648 (b)) kadr „Obserwuj”: po wejściu w scenę dystans kina (stopień 1 w tym dystansie, < 1/4 kadru
//      skali prawdziwej); w pauzie przed wejściem — kadr skali prawdziwej (bez nurkowania na statki w skali prawdziwej)
//   R17 (CV-6b, decyzja właściciela 20 — D-CV-3 zmienione) bitwa ściśnięta przy KAŻDYM zoomie: z daleka (6 / 30 / 85 j.)
//      każdy uczestnik na scenie (stopień 1), żaden w skali prawdziwej, każda para w swoim paśmie, pole kliku odwraca punkt;
//      KONTROLA: podłoga 0 (krzywa CV-3a1) — skala prawdziwa, złe pasma, brak pola (R5b/R5c — przecelowane tak samo)
//
// ⚠ Fail-first: metody i moduły CV-3a1 powstają w tym kroku — brak metody = pin czerwony, suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import * as FX                   from '../../utils/VesselFxLogic.js';
import * as CW                   from '../../renderer/CombatWatchLogic.js';
import { isEnemyVessel }         from '../../entities/Vessel.js';
import { VESSEL_TARGET_SIZE }    from '../../renderer/VesselModelResolver.js';
import { getMapInsets }          from '../../ui/MapInsets.js';
import { COSMIC }                from '../../config/LayoutConfig.js';
import { readFileSync, readdirSync } from 'node:fs';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SL = await tryImport('../../renderer/combat/BattleStageLogic.js');
const SZ = await tryImport('../../renderer/combat/SemanticZoomLogic.js');
const SMOT = await tryImport('../../renderer/combat/StageMotionLogic.js');   // ARC CV-6b — ruch sceny ciągły w prędkości
const PC = await tryImport('../../renderer/combat/PresentationClock.js');
const ST = await tryImport('../../debug/CvBattleStager.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

// ── prawdziwe metody renderera ze źródła ─────────────────────────────────────────────────────────────────────────
const TR = read('src/renderer/ThreeRenderer.js');
function methodOf(name, src = TR) {
  const i = src.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = src.indexOf(') {\n', i);
  const params = src.slice(src.indexOf('(', i) + 1, sigEnd);
  const end = src.indexOf('\n  }\n', sigEnd);
  return { params, body: src.slice(sigEnd + 4, end) };
}
const WORLD_SCALE = Number((TR.match(/const WORLD_SCALE\s*=\s*([\d.]+)/) ?? [])[1]);
const FX_HDR_EXPLOSION = Number((TR.match(/const FX_HDR_EXPLOSION\s*=\s*([\d.]+)/) ?? [])[1]);
const S = (v) => v / WORLD_SCALE;
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'isEnemyVessel', 'STAGE', 'solveStage', 'pairKey',
  'clusterEncounters', 'bandEdgesWU', 'stageBlend', 'stageBlendFloored', 'motionSegment', 'motionAt', 'targetVelocity', 'lengthPx', 'VESSEL_TARGET_SIZE', 'WORLD_SCALE', '_STAGE_V', 'centroidOf',
  'fitWatchFrameOffset', 'viewOffsetFrame', 'watchSafeRect', 'getMapInsets', 'COSMIC', 'glideRetarget', 'glideStep',
  'EXPLOSION_RING_COLOR', 'FX_HDR_EXPLOSION',
  // ARC CV-3a2 — klastry z pozycji logicznych i pole kliku sceny
  'encounterClusters', 'encounterParticipants', 'pickStageField', 'stagePointLogical', 'stagePointDrawn'];
const METHODS = ['_unstageVessels', '_spriteBase', '_stageMark', '_stagePlace', '_stageClusters', '_tickBattleStage',
  'getVesselStageBlend', '_stageWatchFit', '_stageSuccessor', '_syncCombatViewOffset', '_hideEncounterRings', '_spawnExplosion',
  '_placeFreeVessel', '_tickCombatGlide', '_stageFields', 'stageLogicalOf', 'stageWorldOf'];
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  try {
    return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(
      THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance, FX.isEngagementInView, isEnemyVessel, SL?.STAGE, SL?.solveStage, SL?.pairKey,
      SL?.clusterEncounters, SL?.bandEdgesWU, SZ?.stageBlend, SZ?.stageBlendFloored, SMOT?.motionSegment, SMOT?.motionAt, SMOT?.targetVelocity, SZ?.lengthPx, VESSEL_TARGET_SIZE, WORLD_SCALE, new THREE.Vector3(),
      CW.centroidOf, CW.fitWatchFrameOffset, CW.viewOffsetFrame, CW.watchSafeRect, getMapInsets, COSMIC, CW.glideRetarget, CW.glideStep,
      FX.EXPLOSION_RING_COLOR, FX_HDR_EXPLOSION,
      SL?.encounterClusters, SL?.encounterParticipants, SL?.pickStageField, SL?.stagePointLogical, SL?.stagePointDrawn);
  } catch (e) { console.log(`    (budowa ${name}: ${e.message})`); return null; }
}

// ── świat atrapy: jedno starcie 10 na 10 (szyk stagera) w oglądanym układzie ─────────────────────────────────────
const SYS = 'sys_v', AUWU = GAME_CONFIG.AU_TO_PX / WORLD_SCALE, L = VESSEL_TARGET_SIZE.frigate;
const clock = { now: 1e6 };
globalThis.performance.now = () => clock.now;
let writes = 0;
const trap = (obj) => new Proxy(obj, { set(t, k, v) { writes++; t[k] = v; return true; }, defineProperty(t, k, d) { writes++; return Reflect.defineProperty(t, k, d); } });

function world({ encs = null } = {}) {
  const layout = ST?.cvBattleLayout?.({ nA: 10, nB: 10 })?.ships ?? [];
  const vessels = new Map();
  for (const s of layout) {
    const pos = trap({ x: s.dxAU * GAME_CONFIG.AU_TO_PX, y: s.dyAU * GAME_CONFIG.AU_TO_PX, state: 'orbiting', dockedAt: null });
    const v = { id: s.name, name: s.name, systemId: SYS, position: pos, isEnemy: s.side === 'B', ownerEmpireId: s.side === 'B' ? 'emp_t' : undefined };
    vessels.set(v.id, trap(v));
  }
  const A = layout.filter((s) => s.side === 'A').map((s) => s.name), B = layout.filter((s) => s.side === 'B').map((s) => s.name);
  const mkEnc = (id, a, b, pt) => ({ id, isActive: true, location: { systemId: SYS, point: pt },
    sideA: { vesselIds: a, joinedVesselIds: [] }, sideB: { vesselIds: b, joinedVesselIds: [] },
    vesselStates: new Map([...a, ...b].map((v) => [v, { hp: 100, shieldHP: 0 }])), timeline: [] });
  const list = encs ? encs(mkEnc, A, B) : [mkEnc('enc_1', A, B, { x: 0, y: 0 })];
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
    _stageClusterOf: new Map(), _stageParticipants: new Set(), _stageEdges: null, _stageFitCache: new Map(), _stageFitFrame: -1, _combatViewOffset: null,
    _frameNo: 0, _watch: null, _autoFocus: null, _observatoryPreviewActive: false, _engagementMarkers: new Map(), _activeEffects: [],
    spawned: [], missing: [] };
  R._spawnFx = (mesh, cfg) => { R.spawned.push(cfg?.kind); };
  for (const n of METHODS) { const fn = makeMethod(n); if (fn) R[n] = fn; else R.missing.push(n); }
  for (const v of vessels.values()) {
    const sp = new THREE.Object3D(); sp.visible = true;
    sp.position.set(S(v.position.x), 0.3, S(v.position.y));
    R._vessels.set(v.id, { sprite: sp, glide: null });
  }
  const cc = { _target: new THREE.Vector3(), _goalTarget: new THREE.Vector3(), _dist: 0.4, _targetDist: 0.4, _theta: 0.3, _phi: 1.1,
    focusOnSmooth() {}, setTargetDist() {} };
  R._cameraController = cc;
  return { R, vessels, list, ts, A, B, cc };
}
/** Kamera w odległości `d` [j.] od środka bitwy (kąty jak kontroler). */
function placeCamera(R, cc, d) {
  const c = { x: 0, y: 0.3, z: 0 };
  let n = 0; for (const [, e] of R._vessels) { const p = R._spriteBase ? R._spriteBase('', e) : e.sprite.position; c.x += p.x; c.z += p.z; n++; }
  c.x /= n; c.z /= n;
  cc._target.set(c.x, c.y, c.z); cc._goalTarget.copy(cc._target); cc._dist = d;
  R.camera.position.set(c.x + d * Math.sin(1.1) * Math.cos(0.3), c.y + d * Math.cos(1.1), c.z + d * Math.sin(1.1) * Math.sin(0.3));
  R.camera.lookAt(c.x, c.y, c.z); R.camera.updateMatrixWorld(true);
}
/** Klatka jak pętla renderu: początek (powrót na bazę) → [zapisy ruchu] → scena. */
function frame(R, ms = 16) { clock.now += ms; R._frameNo++; R._unstageVessels?.(); R._tickBattleStage?.(); }
const snapSprites = (R) => [...R._vessels].map(([id, e]) => [id, e.sprite.position.x, e.sprite.position.y, e.sprite.position.z]);
const misbandedDrawn = (R, vessels) => {
  if (!SL) return Infinity;
  const pts = [...vessels.values()].map((v) => ({ id: v.id, x: S(v.position.x), z: S(v.position.y) }));
  const drawn = new Map([...R._vessels].map(([id, e]) => [id, { x: e.sprite.position.x, y: e.sprite.position.y, z: e.sprite.position.z }]));
  return SL.countMisbanded(pts, drawn, SL.bandEdgesWU([GAME_CONFIG.WEAPON_SHORT_AU, GAME_CONFIG.WEAPON_MED_AU, GAME_CONFIG.WEAPON_LONG_AU], AUWU));
};
const FLAG0 = GAME_CONFIG.FEATURES.cvStage;

// ═══ R0 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R0 — KONTROLA: metody sceny wyciągnięte ze źródła i wykonywalne na prawdziwym Three.js', () => {
  const { R } = world();
  assert(R.missing.length === 0 && /^1[5-9]\d$/.test(THREE.REVISION) && Number.isFinite(WORLD_SCALE),
    `R0 ${METHODS.length} metod z \`ThreeRenderer.js\`${R.missing.length ? ' — brak: ' + R.missing.join(', ') : ''}, Three.js r${THREE.REVISION}`);
});

// ═══ R1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R1 — flaga OFF: zero znaczników, sprite\'y nietknięte co do bitu', () => {
  GAME_CONFIG.FEATURES.cvStage = false;
  const { R, cc } = world();
  placeCamera(R, cc, 0.4);
  const before = JSON.stringify(snapSprites(R));
  for (let i = 0; i < 60; i++) frame(R);
  assert(R._stageMarks.size === 0 && R._stageFrame === null && JSON.stringify(snapSprites(R)) === before,
    'R1 flaga OFF (kamera 0,4 j. od bitwy): zero znaczników sceny, pozycje sprite\'ów identyczne co do bitu');
});

// ═══ R2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
GAME_CONFIG.FEATURES.cvStage = true;
// ARC CV-3b — ten keeper pinuje warstwę SCENY (CV-3a / CV-6b) przy choreografii WYŁĄCZONEJ: choreografia to osobna warstwa
//   za flagą `cvChoreo` (przesunięcia w kopercie, kurs, silnik), pinowana z tymi samymi niezmiennikami sceny (pasma, ciągłość,
//   pauza, zero zapisów) w `cv_choreo_render_smoke` / `cv_choreo_logic_smoke`.
GAME_CONFIG.FEATURES.cvChoreo = false;
block('R2 — flaga ON, kamera blisko: rysowane = scena, każda para w swoim paśmie; (b) pozycje logiczne nietknięte', () => {
  const { R, cc, vessels } = world();
  placeCamera(R, cc, 0.4);
  const bandsTrue = misbandedDrawn(R, vessels);
  writes = 0;
  for (let i = 0; i < 60; i++) frame(R);   // 960 ms > JOIN_MS — pełne wejście
  const k = R.getVesselStageBlend?.('CV-A01') ?? 0;
  const mis = misbandedDrawn(R, vessels);
  const st = R._stageFrame?.list?.[0];
  console.log(`     skala prawdziwa: złych pasm ${bandsTrue} (odstęp rysowany = logiczny × 1 — pasma logiczne); po wejściu: stopień ${k.toFixed(3)}, złych pasm ${mis}, klaster ${st?.id}, statki ${st?.members}`);
  assert(k > 0.99 && st?.members === 20 && st?.fallback === false, 'R2a po wejściu (JOIN_MS) pełna scena: stopień 1 przy 0,4 j. (fregata > 24 px), 20 statków w klastrze');
  assert(mis === 0, 'R2b SEDNO: KAŻDA para — pasmo odstępu RYSOWANEGO (krawędzie G(zasięg)) = pasmo odstępu logicznego');
  assert(writes === 0 && k > 0.99, `R2c (b) zero zapisów na statkach i ich \`position\` przy pracującej scenie (pułapka Proxy: ${writes}; świadek — stopień ${k.toFixed(3)})`);
});

// ═══ R3 / R4 ══════════════════════════════════════════════════════════════════════════════════════════════════════
block('R3 / R4 — początek klatki: powrót na bazę; nowy zapis między klatkami zostaje; `_spriteBase`', () => {
  const { R, cc } = world();
  placeCamera(R, cc, 0.4);
  for (let i = 0; i < 60; i++) frame(R);
  const e = R._vessels.get('CV-B03'), m = R._stageMarks.get('CV-B03');
  const drawn = e.sprite.position.clone(), base = { ...m.base };
  const sb = R._spriteBase('CV-B03', e);
  R._unstageVessels();
  const restored = e.sprite.position.clone();
  assert(m && !drawn.equals(new THREE.Vector3(base.x, base.y, base.z)) && restored.x === base.x && restored.y === base.y && restored.z === base.z,
    'R3a początek klatki: sprite sceny wraca dokładnie na bazę (rysowany ≠ baza — świadek)');
  assert(sb.x === base.x && sb.y === base.y && sb.z === base.z, 'R4a `_spriteBase` przy pozycji rysowanej — baza');
  R._tickBattleStage();                                   // ta sama klatka: znów rysowany
  e.sprite.position.set(base.x + 0.05, 0.3, base.z);      // „ruch płynny / orbita” między klatkami pisze nową bazę
  const sb2 = R._spriteBase('CV-B03', e);
  R._unstageVessels();
  assert(e.sprite.position.x === base.x + 0.05 && sb2.x === base.x + 0.05, 'R3b nowa pozycja zapisana między klatkami zostaje bazą (nie nadpisana); R4b `_spriteBase` — ta nowa');
});

// ═══ R5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R5 — (d) pauza: wejście w scenę stoi; stopień sceny idzie za kamerą', () => {
  const { R, cc, ts } = world();
  placeCamera(R, cc, 0.4);
  ts.isPaused = true;
  for (let i = 0; i < 120; i++) frame(R);
  const kPaused = R.getVesselStageBlend?.('CV-A02') ?? -1;
  ts.isPaused = false;
  for (let i = 0; i < 16; i++) frame(R);
  const kRun = R.getVesselStageBlend?.('CV-A02') ?? -1;
  assert(kPaused === 0 && kRun > 0.2 && kRun < 0.8, `R5a pauza (120 klatek): wejście stoi — stopień ${kPaused}; po wznowieniu rośnie (${kRun.toFixed(3)} po 16 klatkach)`);
  for (let i = 0; i < 40; i++) frame(R);
  ts.isPaused = true;
  const kNear = R.getVesselStageBlend('CV-A02');
  placeCamera(R, cc, 2.0); frame(R);
  // ⚠ Przecelowane ŚWIADOMIE (ARC CV-6b, decyzja właściciela 20 — D-CV-3 zmienione): przy podłodze domyślnej (1) bitwa zostaje
  //   na scenie przy KAŻDYM zoomie — oddalenie nie zmienia stopnia. Dawna asercja („oddalenie zmniejsza stopień”) zostaje jako
  //   KONTROLA przy podłodze 0 (krzywa CV-3a1): krzywa zoomu dalej idzie za kamerą także w pauzie — scena to widok, nie czas.
  const kFar = R.getVesselStageBlend('CV-A02');
  R.cvTuning = { STAGE_BLEND_FLOOR: 0 }; frame(R);
  const kFar0 = R.getVesselStageBlend('CV-A02');
  delete R.cvTuning; frame(R);
  assert(kNear > 0.99 && kFar > 0.99, `R5b decyzja 20: w pauzie oddalenie kamery (0,4 → 2,0 j.) — stopień zostaje ${kFar.toFixed(3)} (bitwa na scenie przy każdym zoomie)`);
  assert(kFar0 > 0 && kFar0 < kNear, `R5c KONTROLA podłoga 0 (krzywa CV-3a1): w pauzie oddalenie zmniejsza stopień (${kNear.toFixed(3)} → ${kFar0.toFixed(3)}) — scena to widok, nie czas`);
});

// ═══ R6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R6 — koniec starcia: powrót do skali prawdziwej przez JOIN_MS, w pauzie stoi', () => {
  const { R, cc, list, ts, vessels } = world();
  placeCamera(R, cc, 0.4);
  for (let i = 0; i < 60; i++) frame(R);
  const e = R._vessels.get('CV-B05');
  const base = { ...R._stageMarks.get('CV-B05').base };
  const off0 = Math.hypot(e.sprite.position.x - base.x, e.sprite.position.z - base.z);
  list[0].isActive = false;
  ts.isPaused = true;
  for (let i = 0; i < 30; i++) frame(R);
  const offPause = Math.hypot(e.sprite.position.x - base.x, e.sprite.position.z - base.z);
  ts.isPaused = false;
  frame(R, 16); for (let i = 0; i < 15; i++) frame(R, 16);   // ~256 ms
  const offHalf = Math.hypot(e.sprite.position.x - base.x, e.sprite.position.z - base.z);
  for (let i = 0; i < 30; i++) frame(R, 16);
  const v = vessels.get('CV-B05');
  const atBase = e.sprite.position.x === S(v.position.x) && e.sprite.position.z === S(v.position.y);
  assert(off0 > 0.01 && Math.abs(offPause - off0) < 1e-12, `R6a koniec starcia w pauzie: sprite stoi na scenie (${off0.toFixed(4)} j. od bazy — bez skoku)`);
  assert(offHalf > 0.2 * off0 && offHalf < 0.8 * off0, `R6b po ~256 ms gry: w połowie drogi (${(offHalf / off0).toFixed(2)} przesunięcia)`);
  assert(atBase && !R._stageMarks.has('CV-B05'), 'R6c po JOIN_MS: na pozycji bez sceny, znacznik zdjęty');
});

// ═══ R7 / R8 ══════════════════════════════════════════════════════════════════════════════════════════════════════
block('R7 / R8 — tryb galaktyki bez sceny; uczestnik przy ciele bez rysunku ciała — bitwa bez sceny (CV-3a3)', () => {
  const w1 = world(); placeCamera(w1.R, w1.cc, 0.4);
  for (let i = 0; i < 60; i++) frame(w1.R);
  const marksBefore = w1.R._stageMarks.size;
  w1.R._galaxyActive = true;
  for (let i = 0; i < 60; i++) frame(w1.R);
  assert(marksBefore === 20 && w1.R._stageMarks.size === 0, `R7 tryb galaktyki — scena zdjęta (znaczników ${marksBefore} → ${w1.R._stageMarks.size})`);
  const w2 = world(); placeCamera(w2.R, w2.cc, 0.4);
  const before = JSON.stringify(snapSprites(w2.R));
  const pinned = w2.vessels.get('CV-B01'); pinned.position.dockedAt = 'p_x';
  for (let i = 0; i < 60; i++) frame(w2.R);
  assert(w2.R._stageMarks.size === 0 && w2.R._stageFrame?.list?.[0]?.pinned === true && JSON.stringify(snapSprites(w2.R)) === before,
    'R8 uczestnik z `dockedAt`, ciało bez rysunku: klaster oznaczony, sprite\'y nietknięte (CV-3a3 — przecelowane: dawniej „każda bitwa przy ciele”)');
});

// ═══ R9 / R10 ═════════════════════════════════════════════════════════════════════════════════════════════════════
block('R9 / R10 — (642) pierścień starcia ukryty; (641) eksplozja wraku bez płaskiego pierścienia', () => {
  const { R } = world();
  const mk = () => { const mesh = new THREE.Object3D(); mesh.visible = true; return mesh; };
  R._engagementMarkers.set('enc_1', { mesh: mk(), kind: 'encounter' });
  R._engagementMarkers.set('orbital_x', { mesh: mk(), kind: 'burst' });
  R._hideEncounterRings();
  assert(R._engagementMarkers.get('enc_1').mesh.visible === false && R._engagementMarkers.get('orbital_x').mesh.visible === true,
    'R9 pierścień starcia DSCS ukryty, znacznik imitacji bitwy orbitalnej — bez zmian');
  R.spawned = []; GAME_CONFIG.FEATURES.cvStage = true; R._spawnExplosion(new THREE.Vector3(1, 0.3, 1), 0.016);
  const on = [...R.spawned];
  R.spawned = []; GAME_CONFIG.FEATURES.cvStage = false; R._spawnExplosion(new THREE.Vector3(1, 0.3, 1), 0.016);
  const off = [...R.spawned];
  GAME_CONFIG.FEATURES.cvStage = true;
  assert(JSON.stringify(on) === JSON.stringify(['explosion']) && JSON.stringify(off) === JSON.stringify(['explosion', 'explosionRing']),
    `R10 eksplozja wraku: ON ${JSON.stringify(on)}, OFF ${JSON.stringify(off)} (KONTROLA — dzisiejszy pierścień)`);
});

// ═══ R11 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R11 — (643) przesunięcie ekranowe kadru walki', () => {
  const { R, cc } = world();
  placeCamera(R, cc, 1.8);
  for (let i = 0; i < 40; i++) frame(R);
  R._watch = { encounterId: 'enc_1' };
  const t0 = cc._target.clone();
  for (let i = 0; i < 40; i++) { R._frameNo++; R._syncCombatViewOffset(); }
  const v = R.camera.view;
  assert(!!v && v.enabled && Math.abs(v.offsetY) > 20 && cc._target.equals(t0),
    `R11a „Obserwuj”: kompozycja przesunięciem ekranowym (offsetY ${v ? v.offsetY.toFixed(1) : '—'} px), cel kamery nietknięty`);
  R._watch = null;
  for (let i = 0; i < 80; i++) { R._frameNo++; R._syncCombatViewOffset(); }
  assert(R._combatViewOffset === null && (!R.camera.view || R.camera.view.enabled === false), 'R11b po końcu obserwacji: przesunięcie wygaszone, `clearViewOffset`');
  R._watch = { encounterId: 'enc_1' }; R._observatoryPreviewActive = true;
  R.camera.setViewOffset(1600, 1041, -100, -50, 1600, 1041);
  for (let i = 0; i < 10; i++) { R._frameNo++; R._syncCombatViewOffset(); }
  assert(R.camera.view.offsetX === -100 && R.camera.view.offsetY === -50, 'R11c podgląd obserwatorium: jego przesunięcie nietknięte');
});

// ═══ R12 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R12 — (638) jedna bitwa = klaster starć: kadr i obserwacja', () => {
  const { R, cc, list } = world({ encs: (mk, A, B) => [mk('enc_a', A.slice(0, 5), B.slice(0, 5), { x: -5, y: 0 }), mk('enc_b', A.slice(5), B.slice(5), { x: 5, y: 0 })] });
  placeCamera(R, cc, 0.6);
  for (let i = 0; i < 40; i++) frame(R);
  const fit = R._stageWatchFit(list[0]);
  assert(R._stageFrame?.clusters === 1 && R._stageFrame.list[0].encounterIds.length === 2 && fit?.points?.length === 20,
    `R12a dwa starcia w jednym miejscu — jeden klaster, kadr „Obserwuj” obejmuje 20 statków obu starć (${fit?.points?.length})`);
  list[0].isActive = false;
  const nx = R._stageSuccessor('enc_a', ['enc_a', 'enc_b']);
  assert(nx?.id === 'enc_b', 'R12b koniec obserwowanego starcia — obserwacja przechodzi na drugie starcie klastra');
});

// ═══ R13 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R13 — ruch płynny startuje z pozycji BEZ sceny', () => {
  const { R, cc, vessels } = world();
  placeCamera(R, cc, 0.4);
  for (let i = 0; i < 60; i++) frame(R);
  const id = 'CV-A04', e = R._vessels.get(id), v = vessels.get(id);
  const base = { ...R._stageMarks.get(id).base };
  e.glide = { from: { x: base.x, z: base.z }, to: { x: base.x, z: base.z }, elapsedMs: 1, durMs: 1, done: true };
  R._placeFreeVessel(id, e, v.position.x + 30, v.position.y);   // nowy krok zbliżenia (logika przesunęła statek)
  assert(e.glide && !e.glide.done && Math.abs(e.glide.from.x - base.x) < 1e-12 && Math.abs(e.glide.from.z - base.z) < 1e-12,
    `R13 nowy ruch od pozycji BEZ sceny (sprite trzymał rysowaną — ${Math.hypot(e.sprite.position.x - base.x, e.sprite.position.z - base.z).toFixed(4)} j. dalej)`);
});

// ═══ R15 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R15 — (CV-3a2, D-CV-5) pole kliku sceny: `stageLogicalOf` / `stageWorldOf`', () => {
  const { R, cc, ts } = world();
  placeCamera(R, cc, 0.4);
  for (let i = 0; i < 60; i++) frame(R);
  const a = R._vessels.get('CV-A03').sprite.position, b = R._vessels.get('CV-B03').sprite.position;
  const p = { x: (a.x + b.x) / 2 + 0.01, z: (a.z + b.z) / 2 - 0.007 };   // punkt rysowany między statkami
  const lp = R.stageLogicalOf(SYS, p.x, p.z);
  const back = lp?.staged ? R.stageWorldOf(SYS, lp.x, lp.z) : null;
  const shift = lp ? Math.hypot(lp.x - p.x, lp.z - p.z) : 0;
  assert(lp?.staged === true && back && Math.hypot(back.x - p.x, back.z - p.z) < 1e-9 && shift > 0.05 && lp.blend > 0.99,
    `R15a SEDNO: klik w scenie (stopień ${lp?.blend?.toFixed(3)}) — punkt bez sceny ${shift.toFixed(3)} j. od rysowanego, powrót do rysowanego co do 1e-9`);
  const far = R.stageLogicalOf(SYS, p.x + 30, p.z);
  const other = R.stageLogicalOf('sys_inny', p.x, p.z);
  R._galaxyActive = true; const gal = R.stageLogicalOf(SYS, p.x, p.z); R._galaxyActive = false;
  GAME_CONFIG.FEATURES.cvStage = false; const off = R.stageLogicalOf(SYS, p.x, p.z); GAME_CONFIG.FEATURES.cvStage = FLAG0;
  assert(far?.staged === false && far.x === p.x + 30 && other?.staged === false && gal?.staged === false && off?.staged === false && off.x === p.x,
    'R15b daleko od bitwy, inny układ, tryb galaktyki, flaga OFF — punkt bez zmian (staged: false)');
  // pauza od startu: wejście w scenę stoi (stopień × wejście = 0) — brak pola
  const w2 = world(); placeCamera(w2.R, w2.cc, 0.4); w2.ts.isPaused = true;
  for (let i = 0; i < 30; i++) frame(w2.R);
  const pz = w2.R.stageLogicalOf(SYS, p.x, p.z);
  // bitwa przy ciele BEZ rysunku ciała (CV-3a3: skorupa wymaga rysunku): klaster bez sceny — brak pola
  const w3 = world(); w3.vessels.get('CV-A01').position.dockedAt = 'p_x'; placeCamera(w3.R, w3.cc, 0.4);
  for (let i = 0; i < 60; i++) frame(w3.R);
  const pp = w3.R.stageLogicalOf(SYS, p.x, p.z);
  assert(pz?.staged === false && pp?.staged === false && w3.R._stageFrame?.list?.[0]?.pinned === true,
    'R15c pauza przed wejściem w scenę i bitwa przy ciele bez rysunku ciała (bez sceny) — klik bez zmian');
});

// ═══ R16 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R16 — (CV-3a2, Finding 648 (b)) kadr „Obserwuj”: kino po wejściu w scenę, skala prawdziwa przed', () => {
  const { R, cc, list, ts } = world();
  placeCamera(R, cc, 2.7);
  ts.isPaused = true;
  for (let i = 0; i < 20; i++) frame(R);
  const before = R._stageWatchFit(list[0]);
  ts.isPaused = false;
  for (let i = 0; i < 60; i++) frame(R);
  R._stageFitFrame = -1;
  const after = R._stageWatchFit(list[0]);
  const H = 1041, blendAt = (d) => SZ.stageBlend(SZ.lengthPx({ length: L, depth: d, fovDeg: R.camera.fov, H }));
  assert(before?.dist > 2 && after?.cinema === true && after.dist < before.dist / 4 && blendAt(after.dist) >= 0.999,
    `R16 pauza przed wejściem: kadr ${before?.dist?.toFixed(3)} j. (skala prawdziwa); po wejściu: kino ${after?.dist?.toFixed(3)} j. (stopień ${after ? blendAt(after.dist).toFixed(3) : '—'})`);
});

// ═══ R14 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R14 — źródło: tripwire (b), kolejność w pętli renderu, bramki flagi', () => {
  const WRITE = /(?<![\w.$])(?:vessel|v|ves|vv|ship|target|attacker|defender)\.position\.(?:x|y|state|dockedAt)\s*(?:[+\-*/]?=)(?!=)|Object\.assign\(\s*(?:vessel|v|ves|vv|ship)\.position\b/;
  const files = ['src/renderer/ThreeRenderer.js', ...readdirSync(new URL('src/renderer/combat/', ROOT)).filter((f) => f.endsWith('.js')).map((f) => `src/renderer/combat/${f}`)];
  const hits = files.filter((f) => WRITE.test(strip(read(f))));
  assert(files.length >= 5 && hits.length === 0, `R14a (b) renderer i ${files.length - 1} modułów \`src/renderer/combat/\`: brak zapisu pozycji logicznej statku${hits.length ? ' — ' + hits.join(', ') : ''}`);
  const injected = strip(read('src/renderer/ThreeRenderer.js')).replace('_unstageVessels() {', '_unstageVessels() {\n    vessel.position.x = 0;');
  assert(WRITE.test(injected), 'R14a-KONTROLA: wstrzyknięty zapis `vessel.position.x = …` jest łapany');
  const loop = (() => { const s = strip(TR); const i = s.indexOf('  _startLoop() {'); return s.slice(i, s.indexOf('\n  }\n', i)); })();
  const at = (t) => loop.indexOf(t);
  assert(at('this._unstageVessels()') > 0 && at('this._unstageVessels()') < at('this._tickCombatGlide()') && at('this._tickCombatGlide()') < at('this._tickBattleStage()')
    && at('this._tickBattleStage()') < at('this._updateWatchCamera()') && at('this._cameraController.update()') < at('this._syncCombatViewOffset()')
    && at('this._syncCombatViewOffset()') < at('this._updateActiveEffects('),
    'R14b pętla renderu: powrót na bazę → ruch płynny → scena → kamera walki → `update()` kontrolera → przesunięcie ekranowe → efekty');
  // ARC CV-6b2 — przecelowane świadomie: pierścień ukrywa także flaga `cvStrip` (pierścień odchodzi razem z kartą, §4 CV-6b2).
  assert(/this\._tickEngagementMarkers\(performance\.now\(\)\);\s*if \(GAME_CONFIG\.FEATURES\?\.cvStage \|\| GAME_CONFIG\.FEATURES\?\.cvStrip\) this\._hideEncounterRings\(\);/.test(loop),
    'R14c (642) pierścień ukrywany przy wywołaniu, pod flagą `cvStage` albo `cvStrip` (ciało `_tickEngagementMarkers` nietknięte — piny ścieżki OFF)');
  const pf = methodOf('_placeFreeVessel'); const sw = methodOf('_startWatch'); const uw = methodOf('_updateWatchCamera');
  assert(/glideRetarget\(g, to, this\._spriteBase\(vid, entry\),/.test(pf?.body ?? '')
    && /GAME_CONFIG\.FEATURES\?\.cvStage \? this\._stageWatchFit\(enc\) : this\._computeWatchFit\(enc\)/.test(sw?.body ?? '')
    && /GAME_CONFIG\.FEATURES\?\.cvStage \? this\._stageWatchFit\(enc\) : this\._computeWatchFit\(enc\)/.test(uw?.body ?? ''),
    'R14d ruch płynny od `_spriteBase`; „Obserwuj” (start i śledzenie) — kadr sceny pod flagą, dzisiejszy kadr bez flagi');
});

// ═══ R17 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ARC CV-6b (decyzja właściciela 20 — D-CV-3 zmienione): bitwa w widoku zostaje na scenie przy KAŻDYM zoomie — z daleka (6, 30,
// 85 j.) rysowane = cel sceny (stopień 1), każda para w swoim paśmie, pole kliku odwraca punkt i wraca co do 1e-9.
// KONTROLA: podłoga 0 (krzywa CV-3a1) — z daleka skala prawdziwa (rysowane = baza), pary w złych pasmach, brak pola kliku.
block('R17 — decyzja 20: bitwa ściśnięta przy KAŻDYM zoomie (pasma, pole kliku, nikt w skali prawdziwej)', () => {
  GAME_CONFIG.FEATURES.cvStage = true;
  const run = (floor) => {
    const { R, cc, vessels } = world();
    if (floor != null) R.cvTuning = { STAGE_BLEND_FLOOR: floor };
    placeCamera(R, cc, 0.4);
    for (let i = 0; i < 60; i++) frame(R);   // pełne wejście (JOIN_MS)
    const out = {};
    for (const d of [6, 30, 85]) {
      placeCamera(R, cc, d); frame(R);
      const st = R._stageFrame?.list?.[0];
      const sp = R._stageState.get(st?.id)?.stagePos;
      let kMin = Infinity, offTarget = 0, offBase = 0, onBase = 0;
      const moved = [];
      for (const [id, e] of R._vessels) {
        const m = R._stageMarks.get(id), t = sp?.get(id), p = e.sprite.position;
        kMin = Math.min(kMin, m?.k ?? 0);
        if (t) offTarget = Math.max(offTarget, Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z));
        const db = m ? Math.hypot(p.x - m.base.x, p.y - m.base.y, p.z - m.base.z) : 0;
        moved.push(db); offBase = Math.max(offBase, db);
        if (db < 1e-9) onBase++;
      }
      moved.sort((a, b) => a - b);
      const mis = misbandedDrawn(R, vessels);
      const a = R._vessels.get('CV-A01').sprite.position, b = R._vessels.get('CV-B01').sprite.position;
      const q = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const lp = R.stageLogicalOf?.(SYS, q.x, q.z);
      const back = lp?.staged ? R.stageWorldOf?.(SYS, lp.x, lp.z) : null;
      out[d] = { kMin, offTarget, onBase, medMoved: moved[moved.length >> 1] ?? 0, mis, staged: !!lp?.staged,
        err: back ? Math.hypot(back.x - q.x, back.z - q.z) : Infinity, pxL: st?.pxL ?? 0, curve: st?.curve ?? -1 };
    }
    return out;
  };
  const on = run(null), k0 = run(0);
  const ds = [6, 30, 85];
  for (const d of ds) console.log(`     ${d} j.: fregata ${on[d].pxL.toFixed(2)} px (krzywa ${on[d].curve.toFixed(3)}); podłoga 1 — stopień min. ${on[d].kMin.toFixed(3)}, `
    + `od celu sceny ${on[d].offTarget.toExponential(1)} j., mediana przesunięcia od bazy ${(on[d].medMoved / L).toFixed(1)} L, złych par ${on[d].mis}, pole ${on[d].staged} (${on[d].err.toExponential(1)}); `
    + `podłoga 0 — stopień ${k0[d].kMin.toFixed(3)}, na bazie ${k0[d].onBase}/20, złych par ${k0[d].mis}, pole ${k0[d].staged}`);
  assert(ds.every((d) => on[d].kMin > 0.999 && on[d].offTarget < 1e-9 && on[d].medMoved > 5 * L && on[d].curve < 0.01),
    'R17a SEDNO: z daleka (6 / 30 / 85 j., krzywa zoomu ≈ 0) każdy uczestnik rysowany NA SCENIE (stopień 1, rysowane = cel sceny), żaden w skali prawdziwej (mediana przesunięcia od bazy > 5 L)');
  assert(ds.every((d) => on[d].mis === 0), 'R17b pasma z daleka: KAŻDA para — pasmo odstępu rysowanego = pasmo logicznego (0 złych par przy 6 / 30 / 85 j.)');
  assert(ds.every((d) => on[d].staged && on[d].err < 1e-9), 'R17c pole kliku z daleka: punkt między statkami → bez sceny → rysowany co do 1e-9 (6 / 30 / 85 j.)');
  assert(k0[85].kMin < 0.01 && k0[85].onBase === 20 && k0[85].mis > 0 && !k0[85].staged,
    `R17d KONTROLA podłoga 0 (krzywa CV-3a1) przy 85 j.: skala prawdziwa (na bazie ${k0[85].onBase}/20), ${k0[85].mis} par w złych pasmach, brak pola kliku`);
});

GAME_CONFIG.FEATURES.cvStage = FLAG0;
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
