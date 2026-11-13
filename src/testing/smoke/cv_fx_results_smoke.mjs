// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_fx_results_smoke — KEEPER ARC COMBAT VISUALS, krok CV-2a (F1 / F11 (a); stager `cvBattle`, Finding 634)
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.10, §4 CV-2a.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE: (a) wynik starcia nie zależy od warstwy wizualnej — flaga `cvFxEngine` ON (salwy przez silnik z pulami) ==
//   OFF (dzisiejsza ścieżka `_spawnCombatTracer`) == bez renderera: sygnatura, ślad KAŻDEJ rundy (zdarzenia, HP i osłona
//   każdego statku, pozycje logiczne), sekwencja losowań gry (`Math.random`) i stan świata z tego strumienia (sloty orbit
//   statków przylatujących W TRAKCIE starcia). KONTROLA przyrządu: atrapa słuchacza salwy, która losuje z `Math.random`,
//   PRZESUWA sloty orbit — przyrząd widzi skażenie strumienia.
//   Stager `KOSMOS.debug.cvBattle` (ten sam kod co w konsoli, na świecie headless): oglądany układ, pauza, wszyscy 20
//   w jednym starciu założonym przed pierwszym tikiem, ziarno stałe, rozkazy `engage` przyjęte, `DirectorRecall` (prawdziwy
//   zamiatacz) nie widzi okrętów AI starcia; to samo ziarno = ta sama bitwa; ponowne wywołanie w trakcie starcia —
//   odmowa, po starciu — statki poprzedniego testu zdjęte.
// ŚWIAT: jak `combat_pace_smoke` — PRAWDZIWY `TimeSystem.update(ms)` w pętli klatek (siatka starcia), łańcuch `time:tick` →
//   VesselManager → Proximity → VesselCombatSystem → DeepSpaceCombatSystem → MOS → wraki (EAH); zegar realny wirtualny.
// RENDERER: `ThreeRenderer` nie importuje się pod node ⇒ PRAWDZIWE metody (`_onCombatRoundFx`, `_cvFxRoundFx`,
//   `_ensureFxEngine`, `_tickCvFx`, `_combatEndpointWorld`, `_spawnCombatTracer`, …) wyciągnięte ze źródła i wykonane na
//   PRAWDZIWYM Three.js r171 (`src/lib`) z atrapą `this` (wzór `cv_renderer_rng_smoke`); co klatkę — jak pętla renderu —
//   sprite'y za pozycjami logicznymi (renderer pisze tylko sprite'y) i `_tickCvFx`.
//
// PINY:
//   S1 stager: `kind: 'orbital'` → `not_yet` (CV-8a)
//   S2 scena: 20 statków w oglądanym układzie, gra na pauzie, jedno starcie z kompletem, układ starcia = oglądany, ziarno =
//      `cvSeedBase(seed)`, rozkazy `engage` 10 / 10, nazwy `CV-A01…`, znacznik, autozapis 0 (tylko w pamięci); miejsce ≥ 1 AU
//      od obcego statku i obcy statek poza starciem
//   S3 `DirectorRecall.strandedWarshipsAwayFromHome` (prawdziwy) — okręty AI starcia poza listą; KONTROLA: okręt AI poza
//      starciem na liście
//   S4 starcie się rozegrało i ma treść (wszystkie trzy kategorie broni, trafienia, osłona, wrak)
//   S5 ponowne `cvBattle` w trakcie starcia — `battle_in_progress`, po starciu — stare statki zdjęte, nowa scena kompletna
//   S6 to samo ziarno = ta sama bitwa (sygnatura i ślad); inne ziarno — inne `seedBase`
//   S7 (CV-3a2, Finding 638) `cvBattle({ split })` — starcia parami: kilka starć w jednym miejscu (każda para własne starcie,
//      komplet statków), jeden klaster (`encounterClusters`), kolejne ziarna starć; KONTROLA: bez `split` — jedno starcie
//   A1 tryb ON naprawdę rysował silnikiem (strzały w pulach, zero dzisiejszych efektów), tryb OFF — dzisiejszą ścieżką;
//      CV-3a1: tryb ON (flagi `cvFxEngine` i `cvStage`) naprawdę rysował SCENĘ (kamera 0,4 j. od bitwy — stopień sceny 1,
//      sprite'y przesunięte), tryb OFF — bez sceny
//   A2 ON == OFF == bez renderera: sygnatura, ślad każdej rundy, sekwencja losowań gry, sloty orbit (obie warstwy CV)
//   A3 KONTROLA przyrządu: słuchacz salwy losujący z `Math.random` przesuwa sloty orbit (i sekwencję)
//   A4 tempo oglądanego starcia (`combatRoundMs`) 400 == 1000 == 1150 (CV-3c, decyzja właściciela 44 (1): domyślnie 1150): sygnatura,
//      ślad każdej rundy, sekwencja losowań gry, sloty orbit; świadek — czas realny starcia rośnie z kluczem
//   A10 (CV-3c, flaga `cvChoreo2`) — lot wzdłuż kursu, wylot dysz, odłamki blachy, dryf wraków, rozsunięcie sceny `STAGE_SPREAD` 1,35:
//      wynik ON + cvChoreo2 == ON z cvChoreo2 OFF == bez renderera (sygnatura z wrakami, ślad każdej rundy, losowania gry, sloty
//      orbit); świadek — tryb ON naprawdę leciał pętlami CV-3c (statki w trybie 2). Tryby A1–A9 ustawiają `cvChoreo2` jawnie: OFF
//      (pinują choreografię CV-3b), A10 — ON
//   A5 (CV-3a3, D-CV-4) bitwa PRZY CIELE (`cvBattle({ atBody })` — gracz na orbitach, wróg przypięty przez DSCS): ON (scena
//      ze skorupą) == OFF == bez renderera — sygnatura, ślad każdej rundy, sekwencja losowań gry, sloty orbit; świadek — tryb ON
//      rysował skorupę
//   A6 (CV-2b, flaga `cvPresets`) — sygnały walki: tryb ON z szyną `combatfx:cue` (salwy, trafienia, wybuchy wraków) i słuchaczem
//      `AudioSystem` podpiętym po `EventBus.clear()` świata == ON bez flagi == bez renderera (sygnatura, ślad, losowania, sloty);
//      świadek — sygnały naprawdę płynęły i słuchacz odebrał każdy
//   A7 (CV-4a, flaga `cvWeapons`) — język broni i rejestr salw: tryb ON z rejestrem (harmonogram, HP pokazywane, zniszczenie w chwili
//      trafienia, eksplozje z rejestru) == ON bez flagi (salwy CV-2a) == bez renderera (sygnatura, ślad, losowania, sloty); świadek —
//      strzały poszły pulami języka broni, rejestr pokazał zniszczenia, salwa CV-2a ustąpiła. Pozostałe tryby ON pinują ścieżkę CV-2a
//      (`cvWeapons` OFF jawnie — flaga domyślnie ON od CV-4a)
//   A9 (CV-4b, flaga `cvShields`) — bańki osłon (plan rundy, fale, rozpad), punkt trafienia na bańce / poszyciu, osmalenia: wynik
//      ON + cvWeapons + cvDamage + cvShields == bez renderera (sygnatura, ślad każdej rundy, losowania gry, sloty orbit); A1–A8 — cvShields OFF jawnie
//   A11 (CV-7, flaga `cvDirector`) — kamera reżysera i SPOWOLNIENIE BOHATERA: tryb ON (pełny — CV-3c / CV-4b / CV-5) z prawdziwym
//      `CvDirector` (chip włączony) i spowolnieniem wymuszanym przy KAŻDEJ okazji (tempo obu zegarów prezentacji 0,35× / 1,25× przez
//      całą bitwę) == bez renderera (sygnatura z wrakami, ślad każdej rundy, losowania gry, sloty orbit); świadek — tempo prezentacji
//      naprawdę się zmieniało (klatki z tempem ≠ 1, najmniejsze 0,35×, opóźnienie > 0) i zegar prezentacji zostawał za realnym;
//      Finding 711 — scena zostaje po końcu logiki, dopóki rejestr ma zniszczenia do pokazania (A10 bez flagi — ani klatki)
//   A8 (CV-5, flaga `cvDamage`) — wybuchy warstwowe, stany uszkodzeń z HP pokazywanego, wraki, pula świateł, zegar efektów
//      ZWOLNIONY (`cvTuning.FX_TIME_SCALE` 0,25 — tylko prezentacja): tryb ON + `cvWeapons` + `cvDamage` == ON + `cvWeapons` ==
//      ON == bez renderera (sygnatura, ślad, losowania, sloty); świadek — sekwencje wybuchów i emitery stanów uszkodzeń naprawdę
//      szły. Tryby A1–A7 — `cvDamage` OFF jawnie (flaga domyślnie ON od CV-5)
//
// ⚠ PRZECELOWANE ŚWIADOMIE (CV-Z — flagi kroków CV na stałe ON, ścieżki OFF usunięte): tryby „OFF” i warstwowe porównania A1–A10
//   (ON z jedną flagą więcej == ON bez niej) straciły przedmiot — każda warstwa jest na stałe. Zostaje to, o co keeper pyta: wynik
//   z PEŁNĄ warstwą wizualną (scena, choreografia CV-3c, sygnały, rejestr salw, wybuchy, osłony) == bez renderera (A2), KONTROLA
//   przyrządu (A3), tempo (A4), bitwa przy ciele (A5), reżyser ze spowolnieniem (A11); świadkowie warstw (A1, A6–A10) — na jednym
//   przebiegu ON. Tryb `mode: 'off'` usunięty.
// ⚠ Fail-first: moduły CV-2a (stager, silnik, zegar) powstają w tym kroku — import dynamiczny w try/catch, piny DEGRADUJĄ
//   (czerwone), suita się nie przerywa. A2 jest STRAŻNIKIEM (wynik nie zależał od FX także przed CV-2a, od CV-0b).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import * as FXC                  from '../../config/CombatFxConfig.js';
import * as FX                   from '../../utils/VesselFxLogic.js';
import { vesselTargetSize, vesselSizeClass, VESSEL_TARGET_SIZE } from '../../renderer/VesselModelResolver.js';
import { isEnemyVessel, setNextVesselId } from '../../entities/Vessel.js';
import { rendererRandom, reseedRendererRandom } from '../../renderer/RendererRng.js';
import { readFileSync }          from 'node:fs';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const STAGER = await tryImport('../../debug/CvBattleStager.js');
const ENGINE = await tryImport('../../renderer/combat/FxEngine.js');
const CLOCK  = await tryImport('../../renderer/combat/PresentationClock.js');
const CVDIR  = await tryImport('../../renderer/CvDirector.js');                  // ARC CV-7 — kamera reżysera i spowolnienie bohatera (A11)
const RECALL = await tryImport('../../systems/director/DirectorRecall.js');
const STAGEL = await tryImport('../../renderer/combat/BattleStageLogic.js');   // CV-3a1 — scena bitwy
const SZOOM  = await tryImport('../../renderer/combat/SemanticZoomLogic.js');
const SMOT = await tryImport('../../renderer/combat/StageMotionLogic.js');   // ARC CV-6b — ruch sceny ciągły w prędkości
const CHOREO = await tryImport('../../renderer/combat/ChoreographyLogic.js');   // ARC CV-3b — choreografia w kopercie
const CUEBUS = await tryImport('../../renderer/combat/CombatCueBus.js');        // ARC CV-2b — szyna sygnałów walki (A6)
const LEDGER = await tryImport('../../renderer/combat/CombatLedgerLogic.js');   // ARC CV-4a — rejestr salw (A7)
const RIG    = await tryImport('../../renderer/ShipModelRig.js');               // ARC CV-4a — wygląd wraku w chwili zniszczenia (A7)
const EXPL   = await tryImport('../../renderer/combat/ExplosionLogic.js');      // ARC CV-5 — wybuchy, stany uszkodzeń, wraki (A8)
const SHLD   = await tryImport('../../renderer/combat/ShieldLogic.js');         // ARC CV-4b — osłony (A9)
const BUBL   = await tryImport('../../renderer/combat/ShieldBubbles.js');       // ARC CV-4b — pula baniek (A9)
const KCE    = await tryImport('../../renderer/KeyColourEmission.js');          // ARC CV-5 — wypalanie wraku (uniformy wspólne)
const HPTS   = await tryImport('../../renderer/ShipHardpoints.js');
const AUDIOM = await tryImport('../../systems/AudioSystem.js');                 // ARC CV-2b — słuchacz sygnałów (A6)
// ARC CV-2b — jedna instancja jak w `main.js` (przed pierwszym `EventBus.clear()` — subskrypcje konstruktora i tak giną, jak w grze);
// w trybie A6 `attach()` po starcie świata (jak `GameScene.start`).
const AUDIO_SYS = AUDIOM ? new AUDIOM.AudioSystem() : null;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');

/** Okno pomiaru: każde losowanie gry w trakcie `fn` (wartości, w kolejności). */
function recordDraws(fn) {
  const base = Math.random;
  const draws = [];
  Math.random = () => { const v = base(); draws.push(v); return v; };
  let result;
  try { result = fn(); } finally { Math.random = base; }
  return { result, draws };
}

// ── Prawdziwe metody renderera (źródło) na prawdziwym Three.js z atrapą `this` ──────────────────────────────────────
const TR = read('src/renderer/ThreeRenderer.js');
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  const params = TR.slice(TR.indexOf('(', i) + 1, sigEnd);
  const end = TR.indexOf('\n  }\n', sigEnd);
  return { params, body: TR.slice(sigEnd + 4, end) };
}
const FX_HDR_EXPLOSION = Number((TR.match(/const FX_HDR_EXPLOSION\s*=\s*([\d.]+)/) ?? [])[1]);
const WORLD_SCALE = Number((TR.match(/const WORLD_SCALE\s*=\s*([\d.]+)/) ?? [])[1]);
const S = (v) => v / WORLD_SCALE;
let glowTex = null;
const TR_STATIC = { _hitGlowTexture: () => (glowTex ??= new THREE.Texture()) };
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'combatFxPace', 'fxWeaponColor',
  'FX_MAX_ACTIVE', 'FX_TRACER_MS', 'FX_SHIELD_COLOR', 'isEnemyVessel', 'isEndpointVisibleInCombat', 'isPlayerEngagement',
  'vesselTargetSize', 'HIT_GLOW', 'hitGlowWorldSize', 'ThreeRenderer', 'EXPLOSION_RING_COLOR', 'FX_HDR_EXPLOSION', 'rendererRandom',
  'FxEngine', 'logDepthOn', 'STAGE', 'solveStage', 'pairKey', 'clusterEncounters', 'bandEdgesWU', 'stageBlend', 'stageBlendFloored', 'motionSegment', 'motionAt', 'targetVelocity', 'lengthPx', 'VESSEL_TARGET_SIZE',
  'WORLD_SCALE', '_STAGE_V', 'encounterClusters', 'encounterParticipants',   // CV-3a2 — klastry z pozycji logicznych
  'shellBaseAt',                                                               // CV-3a3 — skorupa przy ciele
  // ARC CV-3b — choreografia (tryb ON: flaga `cvChoreo` razem z `cvStage`)
  'createChoreo', 'choreoSeed', 'choreoClassOf', 'choreoEnvelope', 'postureOf', 'pickFacingTarget', 'stepChoreoOffset', 'constrainChoreo',
  'stepChoreoFacing', 'stepChoreoEngine', 'vesselSizeClass', 'apparentEdges', 'exhaustIntensityRaw', '_CHQ_A', '_CHQ_C', '_CHQ_D', '_CHV', 'quatFromYawPitchRoll',
  // ARC CV-2b — szyna sygnałów walki (tryb A6: flaga `cvPresets`)
  'CombatCueBus', 'cueWeaponOfCategory', 'cueSizeOfClass', 'screenPan', 'EventBus',
  // ARC CV-4a — język broni i rejestr salw (tryb A7: flaga `cvWeapons`)
  'CombatLedger', 'pickTurret', 'ledgerRng', 'paintRigMaterials', 'wreckTiltQuaternion',
  // ARC CV-5 — wybuchy, stany uszkodzeń, wraki (tryb A8: flaga `cvDamage`)
  'explosionPlan', 'explosionBudget', 'explosionClassOf', 'explosionSeed', 'damageStateOf', 'wreckHeatAt', 'wreckBurnColor', 'wreckFireWindow',
  'wreckDrift', 'wreckConverge', 'sputterGate', 'emitterTicks', 'expSeedUnit', 'KC_SHARED', 'setKeyColourWreckState',
  // ARC CV-4b — osłony i pancerz (tryb A9: flaga `cvShields`)
  'ShieldStates', 'bubbleAxes', 'ellipsoidPoint', 'hullPoint', 'scorchEnabled', 'allocScorch', 'scorchHeat', 'SHIELD_RIPPLES_MAX', 'SCORCH_MAX',
  'ShieldBubblePool', 'KC_SCORCH_MAX', 'setKeyColourScorch', 'setKeyColourScorchHeat', 'setKeyColourScorchCount', 'ledgerHash',
  // ARC CV-3c — lot wzdłuż kursu, wylot dysz, dryf wraków (tryb A10: flaga `cvChoreo2`)
  'stepChoreo2Offset', 'stepChoreo2Facing', 'stepChoreo2Engine', 'NOZZLE_KEY_HEX', 'wreckAfterDrift'];
const METHODS = ['_onCombatRoundFx', '_combatEndpointWorld', '_isEnemyEndpointVisible', '_isCombatRevealed',
  '_spawnFx', '_disposeFx', '_cvFxRoundFx', '_ensureFxEngine', '_tickCvFx',
  '_unstageVessels', '_spriteBase', '_stageMark', '_stagePlace', '_stageClusters', '_stageClustersDscs', '_cvEncList', '_cvEncById', '_cvEncOf', '_cvVisWreck', '_tickBattleStage', 'getVesselStageBlend',
  '_choreoCluster', '_choreoPose', '_choreoOrient', '_choreoHeadingOwned', '_choreoRelease', '_choreoEnd', '_choreoExhaust', '_applyExhaust',
  '_ensureCueBus', '_cueEncounterId', '_cueShot', '_cueDestroyed', '_flushCues',   // ARC CV-2b — sygnały walki (A6)
  '_cvWpnRoundFx', '_cvWpnSpawn', '_cvWpnImpact', '_cvWpnResolveLocal', '_cvWpnMuzzle', '_cvWpnTick', '_cvWpnPresentKill', '_cvWpnKillLook',
  '_cvWpnWreckGate', 'cvPresentedState', 'cvEventShown', '_spawnExplosion',   // ARC CV-4a — język broni i rejestr salw (A7)
  '_cvDmgOn', '_cvDmgState', '_cvDmgTick', '_cvDmgExplode', '_cvDmgPoint', '_cvDmgRunSeq', '_cvDmgWreckLook', '_cvDmgPaintHeat',
  '_cvDmgWrecks', '_cvDmgStates', '_cvDmgDrift', '_cvDmgTumble', '_cvDmgConverge', '_setSpriteBase', '_lightClockMs', '_stageKept',   // ARC CV-5 (A8)
  '_cvShdOn', '_cvShdState', '_ensureShieldBubbles', '_cvShdRipples', '_cvShdDir', '_cvShdPlanRound', '_cvShdEndPoint', '_cvShdImpacts',
  '_cvShdTick', '_cvShdBubbles', '_cvShdScorch', '_cvShdApplyScorch', '_cvShdScorchTick', '_cvShdReapplyScorch',   // ARC CV-4b (A9)
  '_nozzleGlowSet', '_cvWreckAfterStep'];   // ARC CV-3c (A10)
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(
    THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance, FX.isEngagementInView, FXC.combatFxPace, FXC.weaponColor,
    FXC.FX_MAX_ACTIVE, FXC.FX_TRACER_MS, FXC.FX_SHIELD_COLOR, isEnemyVessel, FX.isEndpointVisibleInCombat, FX.isPlayerEngagement,
    vesselTargetSize, FX.HIT_GLOW, FX.hitGlowWorldSize, TR_STATIC, FX.EXPLOSION_RING_COLOR, FX_HDR_EXPLOSION, rendererRandom,
    ENGINE?.FxEngine ?? null, () => true, STAGEL?.STAGE, STAGEL?.solveStage, STAGEL?.pairKey, STAGEL?.clusterEncounters, STAGEL?.bandEdgesWU,
    SZOOM?.stageBlend, SZOOM?.stageBlendFloored, SMOT?.motionSegment, SMOT?.motionAt, SMOT?.targetVelocity, SZOOM?.lengthPx, VESSEL_TARGET_SIZE, WORLD_SCALE, new THREE.Vector3(),
    STAGEL?.encounterClusters, STAGEL?.encounterParticipants, STAGEL?.shellBaseAt,
    CHOREO?.createChoreo, CHOREO?.choreoSeed, CHOREO?.choreoClassOf, CHOREO?.choreoEnvelope, CHOREO?.postureOf, CHOREO?.pickFacingTarget,
    CHOREO?.stepChoreoOffset, CHOREO?.constrainChoreo, CHOREO?.stepChoreoFacing, CHOREO?.stepChoreoEngine, vesselSizeClass, STAGEL?.apparentEdges,
    FX.exhaustIntensityRaw, new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Vector3(), CHOREO?.quatFromYawPitchRoll,
    CUEBUS?.CombatCueBus, CUEBUS?.cueWeaponOfCategory, CUEBUS?.cueSizeOfClass, CUEBUS?.screenPan, EventBus,
    LEDGER?.CombatLedger, LEDGER?.pickTurret, LEDGER?.ledgerRng, RIG?.paintRigMaterials, HPTS?.wreckTiltQuaternion,
    EXPL?.explosionPlan, EXPL?.explosionBudget, EXPL?.explosionClassOf, EXPL?.explosionSeed, EXPL?.damageStateOf, EXPL?.wreckHeatAt,
    EXPL?.wreckBurnColor, EXPL?.wreckFireWindow, EXPL?.wreckDrift, EXPL?.wreckConverge, EXPL?.sputterGate, EXPL?.emitterTicks, EXPL?.seedUnit,
    KCE?.KC_SHARED ?? { uKcTime: { value: 0 }, uKcSeamFreq: { value: 9 } }, KCE?.setKeyColourWreckState,
    SHLD?.ShieldStates, SHLD?.bubbleAxes, SHLD?.ellipsoidPoint, SHLD?.hullPoint, SHLD?.scorchEnabled, SHLD?.allocScorch, SHLD?.scorchHeat,
    SHLD?.SHIELD_RIPPLES_MAX, SHLD?.SCORCH_MAX, BUBL?.ShieldBubblePool, KCE?.KC_SCORCH_MAX, KCE?.setKeyColourScorch, KCE?.setKeyColourScorchHeat,
    KCE?.setKeyColourScorchCount, LEDGER?.ledgerHash,
    CHOREO?.stepChoreo2Offset, CHOREO?.stepChoreo2Facing, CHOREO?.stepChoreo2Engine, RIG?.NOZZLE_KEY_HEX ?? 0x7ff4ff, EXPL?.wreckAfterDrift);
}

/** Atrapa renderera: prawdziwe metody FX, sprite'y = Object3D za pozycjami logicznymi, zegar prezentacji z CV-2a. */
function fakeRenderer() {
  const R = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000),
    _fxGroup: null, _activeEffects: [], _vessels: new Map(), _fxEngine: null, _galaxyActive: false,
    _presClock: CLOCK ? new CLOCK.PresentationClock() : null, legacySpawned: 0, missing: [],
    // CV-3a1 — stan sceny (jak konstruktor renderera)
    _stageMarks: new Map(), _stageState: new Map(), _stageClock: CLOCK ? new CLOCK.PresentationClock() : null, _stageFrame: null,
    _stageClusterOf: new Map(), _stageParticipants: new Set(), _stageEdges: null, _galaxyFlight: false, _frameNo: 0, stagedFrames: 0, stageMaxK: 0, shellFrames: 0,
    choreoFrames: 0, choreoMaxL: 0, cvTuning: ENGINE?.LIVE_CV_FX ?? {},   // ARC CV-3b — świadek: tryb ON naprawdę choreografował
    _cvLedger: null, _cvWpnTurretTurn: new Map(), _shipLightPool: null, _gfx: null,   // ARC CV-4a — rejestr salw (A7)
    _cvDmg: null, _cvDebugKilled: new Set(), _cvWreckEpoch: new Map(), _fxLightPool: null, _stageKeep: null,   // ARC CV-5 (A8)
    _cvWpnStats: { rounds: 0, shots: 0, hidden: 0, killsShown: 0, wreckDeduped: 0, wreckDeferred: 0, wreckUnknown: 0 },
    // CV-3a3 — rysowane ciało (skorupa): środek z encji, promień jak `computeBodyRadius` skalistej planety bez masy
    getBodyWorldInfo: (id) => { const b = EntityManager.get(id); return b ? { x: S(b.x), y: 0, z: S(b.y), r: 0.062 } : null; } };
  for (const n of METHODS) { const fn = makeMethod(n); if (fn) R[n] = fn; else R.missing.push(n); }
  const spawn = R._spawnFx;
  R._spawnFx = function (mesh, cfg) { R.legacySpawned++; return spawn.call(R, mesh, cfg); };
  R.frame = function () {   // jak pętla renderu: powrót na bazę → sprite'y (TYLKO rysunek) → scena → zegar i silnik
    R._frameNo++;
    R._unstageVessels?.();
    for (const v of vm.getAllVessels()) {
      if (v.systemId !== SYS) continue;
      let e = R._vessels.get(v.id);
      if (!e) { e = { sprite: new THREE.Object3D() }; R._vessels.set(v.id, e); }
      e.sprite.visible = true;
      e.sprite.position.set(S(v.position.x), 0.3, S(v.position.y));
    }
    // CV-3a1 — kamera 0,4 j. od środka uczestników aktywnego starcia (fregata > 24 px — pełna scena)
    const enc = dscs.listActive()[0];
    if (enc) {
      const ids = [...enc.vesselStates.keys()];
      let cx = 0, cz = 0, n = 0;
      for (const id of ids) { const e = R._vessels.get(id); if (e) { cx += e.sprite.position.x; cz += e.sprite.position.z; n++; } }
      if (n) { R.camera.position.set(cx / n, 0.3 + 0.2, cz / n + 0.35); R.camera.lookAt(cx / n, 0.3, cz / n); R.camera.updateMatrixWorld(true); }
    }
    R._tickBattleStage?.();
    if (!dscs.listActive().length && (R._stageFrame?.clusters ?? 0) > 0) R.lingerFrames = (R.lingerFrames ?? 0) + 1;   // CV-7 (Finding 711)
    if (R._stageMarks.size) { R.stagedFrames++; for (const m of R._stageMarks.values()) R.stageMaxK = Math.max(R.stageMaxK, m.k); }
    if (R._stageFrame?.list?.some?.((c) => c.shell)) R.shellFrames++;
    // ARC CV-3b — klatki z choreografią (przesunięcie od kotwicy) i największe przesunięcie [L]
    let ch = 0;
    for (const m of R._stageMarks.values()) if (m.choreo) { ch++; R.choreoMaxL = Math.max(R.choreoMaxL, Math.hypot(m.choreo.x, m.choreo.y, m.choreo.z) / VESSEL_TARGET_SIZE.frigate); }
    if (ch) R.choreoFrames++;
    // ARC CV-3c (A10) — świadek: statki w trybie lotu wzdłuż kursu
    let m2 = 0;
    for (const m of R._stageMarks.values()) if (m.ch?.mode2 && m.choreo) m2++;
    if (m2) R.choreo2Frames = (R.choreo2Frames ?? 0) + 1;
    R._tickCvFx?.();
  };
  return R;
}

// ── Świat ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';
const GY0 = 100.00002;
const clock = { now: 1e7 };
performance.now = () => clock.now;

let ts, vm, mos, prox, dscs, eah, oss, rec, saveSys;

function world() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  // CV-3a3 — zegar realny wirtualny od tej samej chwili w każdym świecie: kąt orbit statków przy ciele liczy się od kotwicy
  // zegara klatek (= czas realny pierwszego tiku, POLISH P1 CP5), więc bitwa przy ciele z innym startem zegara zaczynałaby
  // z innych slotów orbit (zmierzone: ta sama bitwa „bez renderera” dwa razy — dwie różne sygnatury). Bitwy w wolnej
  // przestrzeni od zegara nie zależą (A2, A4 — różnice czasu).
  clock.now = 1e7;
  // … i ta sama numeracja statków: prędkość kątowa orbity ma rozrzut z hasha id statku (`OrbitalSpaceSystem.assignOrbit`), a licznik
  // id jest modułowy — bez tego kolejny świat dostawał inne id, więc inne orbity (zmierzone: ω 0,1133 / 0,1142 / 0,1153).
  setNextVesselId(1);
  ts = new TimeSystem();
  ts.gameTime = GY0;
  ts.multiplierIndex = 1;                                // 1 d/s
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  EntityManager.add({ id: 'p_rock', type: 'planet', name: 'Skala', systemId: SYS, x: 3 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  EntityManager.add({ id: 'p_far', type: 'planet', name: 'Daleka', systemId: SYS, x: 9 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  vm = new VesselManager(); mos = new MovementOrderSystem(vm); prox = new ProximitySystem(vm);
  dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); eah = new EnemyAttackHandler(); oss = new OrbitalSpaceSystem();
  saveSys = { _autosaveInterval: 1 };
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  const empires = [{ id: EMP, name: 'Testowe Imperium' }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos,
    proximitySystem: prox, deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    // Wywiad „nieznany” — wróg widoczny wyłącznie przez odsłonięcie w starciu z graczem (bramka mgły wojny w użyciu).
    intelSystem: { getVesselContact: () => ({ quality: 'unknown' }), getLevel: () => 'unknown', isAtLeast: () => false },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find(e => e.id === id) ?? null },
    debug: { combatTrace: false },
  });
  rec = { rounds: [], battles: [], wrecks: [], clock: [] };
  const nameOf = (id) => vm.getVessel(id)?.name ?? id;
  const orig = dscs._tickEncounter.bind(dscs);
  dscs._tickEncounter = (enc, civDy) => {
    orig(enc, civDy);
    rec.clock.push(clock.now);   // A4 — czas realny rundy (poza śladem: ślad ma nie zależeć od tempa)
    const last = enc.timeline?.[enc.timeline.length - 1];
    rec.rounds.push({
      round: enc.currentRound,
      events: (last?.events ?? []).map(e => [nameOf(e.attacker), nameOf(e.target), e.weapon, e.hit, e.damage, e.blockedByShield, e.distanceAU]),
      states: [...enc.vesselStates].map(([id, s]) => [nameOf(id), s.hp, s.shieldHP]),
      pos: [...enc.vesselStates.keys()].map(id => { const v = vm.getVessel(id); return [nameOf(id), v?.position?.x, v?.position?.y]; }),
    });
  };
  EventBus.on('battle:resolved', ({ result }) => {
    if (!result?.id?.startsWith?.('battle_ds_')) return;
    const evs = (result.timeline ?? []).flatMap(r => r.events ?? []);
    rec.battles.push([Math.max(0, ...(result.timeline ?? []).map(r => r.round ?? 0)), evs.length, evs.filter(e => e.hit).length,
      result.winner ?? null, result.retreated ?? null, result.lossesA ?? null, result.lossesB ?? null]);
  });
  EventBus.on('vessel:wrecked', ({ vesselId, vessel }) => rec.wrecks.push(vessel?.name ?? vesselId));
}

function ship({ xAU, yAU = 0, name, empire = null, modules, hull = 'hull_frigate', dockedAt = null }) {
  const v = vm.createAndRegister(hull, 'p_home', { name, modules });
  v.position.x = xAU * AU; v.position.y = yAU * AU; v.position.state = 'orbiting'; v.position.dockedAt = dockedAt;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; v.serviceState = 'active'; }
  return v;
}

const ARRIVAL_ROUNDS = [3, 6, 9, 12];
function arrival(i) {
  const v = ship({ xAU: 9, yAU: 0, name: `Przylot${i}`, modules: ['engine_ion'], dockedAt: 'p_far' });
  EventBus.emit('vessel:arrived', { vessel: v, mission: { type: 'transport', targetId: 'p_far' } });
  return v.id;
}

function frame(ms) { clock.now += ms; ts.update(ms); }
const encActive = () => dscs.listActive().length > 0;
const helpers = () => STAGER?.cvBattleDebugHelpers?.({ getRenderer: () => null, getSaveSystem: () => saveSys }) ?? null;

/**
 * Starcie ze stagera, rozegrane do końca. mode: 'none' (bez renderera) · 'off' (renderer, flaga OFF) · 'on' (flaga ON);
 * `control` — słuchacz salwy losujący z `Math.random` (KONTROLA przyrządu).
 */
function runBattle({ mode = 'none', seed = 1, control = false, nA = 10, nB = 10, roundMs = null, atBody = null, director = false } = {}) {
  const on = mode === 'on';
  // CV-Z — tryb ON = pełna warstwa wizualna (flagi kroków, które jeszcze istnieją, ustawione jawnie; reszta na stałe).
  const dirFlag = GAME_CONFIG.FEATURES.cvDirector;   // ARC CV-7 — A11: reżyser i spowolnienie tylko w trybie `director`
  GAME_CONFIG.FEATURES.cvDirector = director === true;
  const damageFlag = GAME_CONFIG.FEATURES.cvDamage;
  GAME_CONFIG.FEATURES.cvDamage = on;
  const shieldsFlag = GAME_CONFIG.FEATURES.cvShields;
  GAME_CONFIG.FEATURES.cvShields = on;
  const T5 = ENGINE?.LIVE_CV_FX ?? null;
  const fxScale0 = T5?.FX_TIME_SCALE;
  if (on && T5) T5.FX_TIME_SCALE = 0.25;   // zwolnione tempo efektów — tylko prezentacja (A2 obejmuje i je)
  const presetsFlag = GAME_CONFIG.FEATURES.cvPresets;
  GAME_CONFIG.FEATURES.cvPresets = on;
  const weaponsFlag = GAME_CONFIG.FEATURES.cvWeapons;
  GAME_CONFIG.FEATURES.cvWeapons = on;
  reseed('cv2a-battle'); reseedRendererRandom();
  let R = null, st = null, outsider = null, recallList = null, recallNoEnc = null, ctlAi = null;
  const arrivals = [];
  const out = recordDraws(() => {
    world();
    if (roundMs != null) ts.combatRoundMs = () => roundMs;   // A4 — tempo oglądanego starcia (jak `combat_pace_smoke`)
    if (mode !== 'none') {
      window.innerWidth = 1600; window.innerHeight = 1041;
      R = fakeRenderer();
      if (director && CVDIR?.CvDirector) {   // ARC CV-7 (A11) — prawdziwy reżyser; spowolnienie wymuszane przy każdej okazji
        R._cvDir = new CVDIR.CvDirector(R);
        window.KOSMOS.uiPrefs = { ...(window.KOSMOS.uiPrefs ?? {}), cvDirector: true };
        R.warpFrames = 0; R.warpMinRate = 1; R.warpMaxLag = 0; R.presBehind = 0;
        const base = R.frame;
        R.frame = function () {
          const d = R._cvDir, Rms = window.KOSMOS.timeSystem?.combatRoundMs?.() ?? 1150;
          if (d.warp.canStartHero(Rms)) d.warp.startHero(Rms);
          d.tickWarp(clock.now);
          if (R._presRate !== 1) R.warpFrames++;
          R.warpMinRate = Math.min(R.warpMinRate, R._presRate);
          R.warpMaxLag = Math.max(R.warpMaxLag, d.warp.lagMs);
          d.tickCamera();   // bez kontrolera kamery (atrapa) — wyjście od razu; pętla renderu woła go tu
          base();
          R.presBehind = Math.max(R.presBehind, d.warp.lagMs);
        };
      }
      EventBus.on('combat:roundFx', (p) => R._onCombatRoundFx(p));
      EventBus.on('combat:roundFx', (p) => R._cvWpnRoundFx(p));   // ARC CV-4a — drugi słuchacz renderera (pełny ładunek)
      // ARC CV-2b (A6) — wybuch wraku → sygnał „destroyed” (jak słuchacz `vessel:wrecked` renderera) i słuchacz `AudioSystem` po
      // `EventBus.clear()` świata (jak `GameScene.start`). Bez flagi `cvPresets` — szyna nie powstaje (metody i tak w atrapie).
      {
        EventBus.on('vessel:wrecked', ({ vesselId, vessel }) => R._cueDestroyed?.(vesselId, vessel, R._vessels.get(vesselId)));
        AUDIO_SYS?.resetCueStats?.();
        AUDIO_SYS?.attach?.();
      }
    }
    if (control) EventBus.on('combat:roundFx', () => { Math.random(); Math.random(); Math.random(); });
    outsider = ship({ xAU: 3, yAU: 0, name: 'Postronny', modules: ['weapon_laser', 'engine_ion'], dockedAt: 'p_rock' });
    const H = helpers();
    st = H ? H.cvBattle({ seed, nA, nB, ...(atBody ? { atBody } : {}) }) : null;
    // `DirectorRecall` (prawdziwy zamiatacz) przed pierwszym tikiem — KONTROLA: zbrojny okręt AI poza starciem.
    ctlAi = ship({ xAU: -6, yAU: 3, name: 'AI-poza', empire: EMP, hull: 'hull_destroyer', modules: ['weapon_kinetic', 'engine_ion'] });
    const P = RECALL?.DirectorRecall?.prototype;
    recallList = P ? P.strandedWarshipsAwayFromHome.call({ homeSystemIdOf: () => 'sys_capital', _inActiveEncounter: P._inActiveEncounter,
      _awaitingBatchedBattle: () => false }, EMP).map(v => v.name) : null;
    // ŚWIADEK: ten sam zamiatacz z predykatem starcia wyłączonym widzi okręty CV — wykluczenie robi STARCIE, nie co innego.
    recallNoEnc = P ? P.strandedWarshipsAwayFromHome.call({ homeSystemIdOf: () => 'sys_capital', _inActiveEncounter: () => false,
      _awaitingBatchedBattle: () => false }, EMP).map(v => v.name) : null;
    const scene = st ? snapshotScene(st) : null;
    vm.destroyVessel?.(ctlAi.id, { reason: 'dismantled' });   // poza bitwą i bez skutku dla niej
    ts.play();
    for (let n = 0; n < 40000; n++) {
      if (arrivals.length < ARRIVAL_ROUNDS.length && rec.rounds.length >= ARRIVAL_ROUNDS[arrivals.length]) arrivals.push(arrival(arrivals.length));
      frame(16);
      R?.frame();
      if (!encActive() && rec.battles.length > 0) { for (let k = 0; k < 60; k++) { frame(16); R?.frame(); } break; }
    }
    const slots = arrivals.map((id) => { const o = oss.getOrbit(id); return o ? [o.r, o.theta0, o.phi] : null; });
    const realMs = rec.clock.length > 1 ? rec.clock[rec.clock.length - 1] - rec.clock[0] : 0;
    return { scene, sig: { battles: rec.battles, wrecks: rec.wrecks }, trace: rec.rounds, slots, realMs };
  });
  GAME_CONFIG.FEATURES.cvPresets = presetsFlag;
  GAME_CONFIG.FEATURES.cvWeapons = weaponsFlag;
  GAME_CONFIG.FEATURES.cvDamage = damageFlag;
  GAME_CONFIG.FEATURES.cvShields = shieldsFlag;
  GAME_CONFIG.FEATURES.cvDirector = dirFlag;
  if (T5 && fxScale0 !== undefined) T5.FX_TIME_SCALE = fxScale0;
  const audio = mode === 'on' ? (AUDIO_SYS?.cueStats?.() ?? null) : null;
  return { ...out.result, draws: out.draws, R, st, recallList, recallNoEnc, outsiderName: outsider?.name, audio };
}

/** Odczyt sceny tuż po `cvBattle` (pauza, przed pierwszym tikiem). */
function snapshotScene(st) {
  const cv = vm.getAllVessels().filter(v => /^CV-[AB]\d\d$/.test(v.name ?? ''));
  const enc = dscs.listActive()[0] ?? null;
  return {
    paused: ts.isPaused, count: cv.length, systems: [...new Set(cv.map(v => v.systemId))], encSystem: enc?.location?.systemId ?? null,
    members: cv.filter(v => enc?.vesselStates?.has(v.id)).length, seedBase: enc?.seedBase ?? null,
    markers: cv.filter(v => v._cvBattle != null).length, autosave: saveSys._autosaveInterval,
    aiInEncounter: cv.filter(v => v.isEnemy).every(v => !!dscs._findActiveEncounterContaining(v.id)),
    outsiderIn: vm.getAllVessels().some(v => v.name === 'Postronny' && enc?.vesselStates?.has(v.id)),
    names: cv.map(v => v.name).sort(), engage: cv.filter(v => !v.isEnemy && v.movementOrder?.type === 'engage').length,
  };
}

// ═══ S — stager ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ S1 PRZECELOWANE ŚWIADOMIE (CV-8a, 2026-11-13): przed CV-8a `kind: 'orbital'` zwracało `not_yet`; od CV-8a deleguje do
//   `cvOrbitalBattle` (atak na kolonię gracza prawdziwą ścieżką EnemyAttackHandler — keeper `cv_orbital_results_smoke`). Świat headless
//   nie ma `enemyAttackHandler` ani `orbitalSpaceSystem`, więc delegacja kończy się odmową świata — pin: delegacja zamiast `not_yet`.
header('S1 — stager: starcie orbitalne deleguje do cvOrbitalBattle (CV-8a)');
{
  world();
  const H = helpers();
  const r = H?.cvBattle({ kind: 'orbital' });
  const d = H?.cvOrbitalBattle?.({});
  assert(r?.reason !== 'not_yet' && typeof H?.cvOrbitalBattle === 'function' && JSON.stringify(r) === JSON.stringify(d),
    `S1 kind 'orbital' → cvOrbitalBattle (ten sam wynik: ${JSON.stringify(r)})${r ? '' : ' — brak stagera'}`);
}

header('S2 / S3 / S4 — scena cvBattle (10 na 10, ziarno 1) i jej starcie');
const NONE = runBattle({ mode: 'none', seed: 1 });
{
  const sc = NONE.scene, st = NONE.st;
  console.log(`     wynik cvBattle: ${JSON.stringify(st && { ok: st.ok, members: st.members, engage: st.engageOrders, centerAU: st.centerAU, seedBase: st.seedBase })}`);
  assert(st?.ok === true && sc?.count === 20, `S2a 20 statków testowych, cvBattle ok (${sc?.count ?? 0})`);
  assert(sc?.paused === true, 'S2b scena zbudowana na PAUZIE');
  assert(same(sc?.systems, [SYS]) && sc?.encSystem === SYS, `S2c układ statków i starcia = oglądany (${JSON.stringify(sc?.systems)} / ${sc?.encSystem})`);
  assert(sc?.members === 20, `S2d wszyscy w jednym starciu założonym przed pierwszym tikiem (${sc?.members}/20)`);
  assert(STAGER && sc?.seedBase === STAGER.cvSeedBase(1), `S2e ziarno starcia stałe: seedBase = cvSeedBase(1) (${sc?.seedBase})`);
  assert(st?.engageOrders === '10/10' && sc?.engage === 10, `S2f rozkazy engage przed pierwszym tikiem: ${st?.engageOrders}`);
  assert(sc?.names?.[0] === 'CV-A01' && sc?.names?.[19] === 'CV-B10' && sc?.markers === 20, 'S2g nazwy CV-A01…CV-B10 i znacznik _cvBattle');
  assert(sc?.autosave === 0, 'S2h autozapis wyłączony w pamięci (interwał 0)');
  const c = st?.centerAU;
  assert(!!c && Math.hypot(c[0] - 3, c[1]) >= 1 - 1e-9 && sc?.outsiderIn === false,
    `S2i miejsce ≥ 1 AU od obcego statku (${c ? Math.hypot(c[0] - 3, c[1]).toFixed(3) : '?'} AU), obcy poza starciem`);
  assert(sc?.aiInEncounter === true, 'S3a okręty AI starcia w aktywnym starciu przed pierwszym tikiem');
  const cvbNoEnc = (NONE.recallNoEnc ?? []).filter(n => /^CV-B/.test(n)).length;
  assert(Array.isArray(NONE.recallList) && NONE.recallList.includes('AI-poza') && !NONE.recallList.some(n => /^CV-B/.test(n)) && cvbNoEnc === 10,
    `S3b DirectorRecall.strandedWarshipsAwayFromHome (prawdziwy): okręty CV poza listą, KONTROLA „AI-poza” na liście (${JSON.stringify(NONE.recallList)}); ŚWIADEK — bez predykatu starcia ${cvbNoEnc}/10 okrętów CV na liście`);
  const evs = NONE.trace.flatMap(r => r.events);
  const cats = new Set(evs.map(e => ({ weapon_laser: 'short', weapon_kinetic: 'medium', weapon_missile: 'long' })[e[2]]));
  console.log(`     sygnatura: ${JSON.stringify(NONE.sig.battles)}, rund ${NONE.trace.length}, strzałów ${evs.length}, wraki ${NONE.sig.wrecks.length}`);
  assert(NONE.sig.battles.length >= 1 && evs.length >= 50 && cats.size === 3 && evs.some(e => e[3]) && evs.some(e => e[5] > 0)
    && NONE.sig.wrecks.length >= 1, `S4 starcie z treścią: ${evs.length} strzałów, kategorie ${[...cats].join('/')}, trafienia, osłona, wraki`);
}

header('S5 — ponowne cvBattle: w trakcie starcia odmowa, po starciu stare statki zdjęte');
{
  world();
  const H = helpers();
  const a = H?.cvBattle({ seed: 3, nA: 3, nB: 3 });
  const busy = H?.cvBattle({ seed: 3, nA: 3, nB: 3 });
  assert(a?.ok === true && busy?.ok === false && busy?.reason === 'battle_in_progress', `S5a w trakcie starcia: ${busy?.reason}`);
  ts.play();
  for (let n = 0; n < 40000 && (encActive() || rec.battles.length === 0); n++) frame(16);
  const before = vm.getAllVessels().filter(v => /^CV-/.test(v.name ?? '')).length;
  const b = H?.cvBattle({ seed: 4, nA: 2, nB: 2 });
  const cvNow = vm.getAllVessels().filter(v => /^CV-/.test(v.name ?? ''));
  assert(before === 6 && b?.ok === true && cvNow.length === 4 && cvNow.every(v => v._cvBattle === 4),
    `S5b po starciu: ${before} statków poprzedniego testu zdjętych, nowa scena ${cvNow.length} (2 na 2, znacznik ziarna 4)`);
}

header('S7 — (CV-3a2) cvBattle({ split }) — starcia parami w jednym miejscu, jeden klaster');
{
  world();
  const H = helpers();
  const r = H?.cvBattle({ seed: 5, nA: 3, nB: 3, split: true });
  const encs = dscs.listActive();
  const getPos = (id) => vm.getVessel(id)?.position ?? null;
  const cl = STAGEL?.encounterClusters?.(encs, getPos, STAGEL.STAGE.CLUSTER_AU * AU) ?? [];
  const seeds = encs.map((e) => e.seedBase).sort((a, b) => a - b);
  assert(r?.ok === true && encs.length === 3 && encs.every((e) => e.vesselStates.size === 2) && r.members === 6 && cl.length === 1
    && cl[0].encounterIds.length === 3 && seeds[1] === seeds[0] + 1 && seeds[2] === seeds[0] + 2,
    `S7a split 3 na 3: ${encs.length} starcia po parze (komplet ${r?.members}), jeden klaster (${cl.map((c) => c.encounterIds.length).join('+')}), ziarna kolejne`);
  world();
  const one = helpers()?.cvBattle({ seed: 5, nA: 3, nB: 3 });
  assert(one?.ok === true && dscs.listActive().length === 1, 'S7b KONTROLA: bez `split` — jedno starcie z kompletem');
}

header('S6 — to samo ziarno = ta sama bitwa; inne ziarno — inne seedBase');
const NONE2 = runBattle({ mode: 'none', seed: 1 });
const OTHER = runBattle({ mode: 'none', seed: 2 });
{
  assert(NONE.trace.length >= 5 && same(NONE2.sig, NONE.sig) && same(NONE2.trace, NONE.trace),
    `S6a ziarno 1 dwa razy: sygnatura i ślad każdej rundy identyczne (${NONE.trace.length} rund — świadek: bitwa się odbyła)`);
  assert(OTHER.scene?.seedBase !== NONE.scene?.seedBase && OTHER.st?.ok === true, `S6b ziarno 2: inne seedBase (${OTHER.scene?.seedBase} ≠ ${NONE.scene?.seedBase})`);
}

// ═══ A — wynik z pełną warstwą wizualną == bez renderera ══════════════════════════════════════════════════════════════
header('A1 / A6–A10 — świadkowie: tryb ON naprawdę rysował każdą warstwę (jeden przebieg, pełna warstwa wizualna)');
const ON  = runBattle({ mode: 'on', seed: 1 });
{
  const R = ON.R;
  assert(R && R.missing.length === 0, `A1a metody renderera wyciągnięte ze źródła${R?.missing?.length ? ' — brak: ' + R.missing.join(', ') : ''}`);
  const es = R?._fxEngine?.stats?.();
  const ls = R?._cvLedger?.stats ?? null;
  console.log(`     język broni: strzały ${es?.wpnShots ?? 0} (wiązki ${es?.pools?.wbeam?.spawned ?? 0}, pociski ${es?.pools?.bolt?.spawned ?? 0}, punkty ${es?.pools?.mote?.spawned ?? 0}), `
    + `salwy CV-2a ${es?.shots ?? 0}; rejestr: rund ${ls?.rounds ?? 0}, zniszczeń pokazanych ${R?._cvWpnStats?.killsShown ?? 0}, strzały po zniszczeniu ${ls?.violations ?? '?'}`);
  assert(!!es && es.wpnShots >= 50 && es.pools.wbeam.spawned > 0 && es.pools.bolt.spawned > 0 && es.pools.mote.spawned > 0 && es.shots === 0
    && (R?._cvWpnStats?.killsShown ?? 0) >= 1 && ls?.violations === 0 && R.legacySpawned === 0,
    'A1b / A7a świadek: strzały pulami języka broni, rejestr pokazał zniszczenia (bez strzału po zniszczeniu), zero dawnych efektów `_spawnFx` z salw');
  assert(!!R?._presClock && R._presClock.nowMs > 0, `A1d zegar prezentacji płynął (${R?._presClock?.nowMs ?? 0} ms)`);
  console.log(`     scena: klatek ${R?.stagedFrames}, stopień maks. ${R?.stageMaxK?.toFixed?.(3)}; choreografia: klatek ${R?.choreoFrames}, lot CV-3c ${R?.choreo2Frames ?? 0}, największe ${R?.choreoMaxL?.toFixed?.(3)} L`);
  assert((R?.stagedFrames ?? 0) > 100 && (R?.stageMaxK ?? 0) > 0.99, 'A1e świadek: scena bitwy (pełny stopień przy kamerze 0,4 j.)');
  assert((R?.choreoFrames ?? 0) > 100 && (R?.choreoMaxL ?? 0) > 0.05 && (R?.choreo2Frames ?? 0) > 100,
    'A1f / A10a świadek: choreografia — lot wzdłuż kursu CV-3c (statki w trybie 2, przesunięcia od kotwic)');
  const cs = R?._cueBus?.stats?.() ?? null;
  assert(!!cs && cs.emitted >= 20 && cs.byKind.fire > 0 && cs.byKind.impact + cs.byKind.shieldHit > 0 && cs.byKind.destroyed > 0
    && cs.byKind.kill > 0 && ON.audio?.received === cs.emitted,
    // CV-Z — przecelowane świadomie: „destroyed” == straty obu stron mierzyło przebieg BEZ rejestru salw (dawny tryb A6); z rejestrem
    //   zniszczenie pokazuje się w chwili trafienia (`kill`), a atrapa dokłada sygnał wraku bez bramki rejestru — liczba nie jest 1:1.
    `A6a świadek: sygnały walki szły (${cs?.emitted ?? 0}: ${JSON.stringify(cs?.byKind ?? {})}) i słuchacz AudioSystem odebrał każdy`);
  const ds = R?._cvDmg?.stats ?? null;
  assert(!!ds && ds.explosions >= 1 && (es?.pools?.blast?.spawned ?? 0) > 0 && (es?.pools?.debris?.spawned ?? 0) > 0 && (ds.dmgSmoke + ds.dmgFire) > 0,
    `A8a świadek: wybuchy (${ds?.explosions ?? 0}) i emitery stanów uszkodzeń szły — przy zegarze efektów 0,25×`);
  const ss = R?._cvShd ?? null, pl = ss?.states?.stats ?? null;
  assert(!!ss && (pl?.onBubble ?? 0) > 0 && (pl?.collapsesPlanned ?? 0) > 0 && (ss.stats.ripples ?? 0) > 0 && (ss.stats.collapses ?? 0) > 0
    && (ss.stats.hullHits ?? 0) > 0 && (R?._shieldBubbles?.stats?.().acquired ?? 0) > 0,
    'A9a świadek: plan osłon szedł (trafienia na bańce, rozpady), pokaz — fale, rozpady, trafienia w kadłub, bańki z puli');
}

header('A2 — (a) wynik starcia z pełną warstwą wizualną == bez renderera');
{
  assert(NONE.sig.battles.length >= 1 && same(ON.sig, NONE.sig), `A2a sygnatura (z wrakami) identyczna ${JSON.stringify(NONE.sig.battles)}`);
  assert(NONE.trace.length >= 5 && same(ON.trace, NONE.trace),
    `A2b ślad każdej rundy identyczny (${NONE.trace.length} rund: zdarzenia, HP, osłona, pozycje logiczne)`);
  assert(NONE.draws.length > 0 && same(ON.draws, NONE.draws), `A2c sekwencja losowań gry identyczna (${NONE.draws.length} losowań, wartości)`);
  assert(NONE.slots.length === ARRIVAL_ROUNDS.length && NONE.slots.every(s => s && s.every(Number.isFinite)) && same(ON.slots, NONE.slots),
    `A2d sloty orbit statków przylatujących W TRAKCIE starcia (rundy ${ARRIVAL_ROUNDS.join(', ')}) identyczne`);
}

header('A3 — KONTROLA przyrządu: słuchacz salwy losujący z Math.random przesuwa stan świata');
const CTL = runBattle({ mode: 'on', seed: 1, control: true });
{
  assert(!same(CTL.slots, NONE.slots), 'A3a sloty orbit przesunięte — przyrząd widzi skażenie strumienia gry');
  assert(!same(CTL.draws, NONE.draws), `A3b sekwencja losowań inna (${CTL.draws.length} ≠ ${NONE.draws.length})`);
  assert(NONE.sig.battles.length >= 1 && same(CTL.sig, NONE.sig),
    'A3c (świadek) wynik bitwy DSCS nadal ten sam — ziarno starcia jest prywatne; skażenie widać w świecie, nie w bitwie');
}

header('A4 — tempo oglądanego starcia 400 == 1000 == 1150 ms na rundę (ten sam wynik; domyślnie 1150 od CV-3c, decyzja 44 (1))');
const K400  = runBattle({ mode: 'none', seed: 1, roundMs: 400 });
const K1000 = runBattle({ mode: 'none', seed: 1, roundMs: 1000 });
const K1150 = runBattle({ mode: 'none', seed: 1, roundMs: 1150 });
{
  const rounds = K400.trace.length;
  console.log(`     400: rund ${rounds}, czas realny ${K400.realMs} ms · 1000: ${K1000.realMs} ms · 1150: rund ${K1150.trace.length}, czas realny ${K1150.realMs} ms · sygnatura ${JSON.stringify(K400.sig.battles)}`);
  assert(K400.sig.battles.length >= 1 && same(K400.sig, K1000.sig) && same(K1000.sig, K1150.sig), `A4a sygnatura identyczna przy 400, 1000 i 1150 ms ${JSON.stringify(K1150.sig.battles)}`);
  assert(rounds >= 5 && same(K400.trace, K1000.trace) && same(K1000.trace, K1150.trace), `A4b ślad każdej rundy identyczny (${rounds} rund: zdarzenia, HP, osłona, pozycje logiczne)`);
  assert(K400.draws.length > 0 && same(K400.draws, K1000.draws) && same(K1000.draws, K1150.draws), `A4c sekwencja losowań gry identyczna (${K400.draws.length} losowań)`);
  assert(K400.slots.length === ARRIVAL_ROUNDS.length && same(K400.slots, K1000.slots) && same(K1000.slots, K1150.slots), 'A4d sloty orbit statków przylatujących w trakcie starcia identyczne');
  const q = (k) => 16 * k / 110 + 16;   // kwant siatki (jak `combat_pace_smoke`)
  assert(rounds > 1 && Math.abs(K400.realMs - (rounds - 1) * 400) <= q(400) && Math.abs(K1000.realMs - (rounds - 1) * 1000) <= q(1000)
    && Math.abs(K1150.realMs - (rounds - 1) * 1150) <= q(1150),
    `A4e świadek: czas realny starcia = (rundy − 1) × klucz ± kwant (${K400.realMs} / ${K1000.realMs} / ${K1150.realMs} ms) — klucz działa`);
}

header('A5 — (CV-3a3) bitwa przy ciele: wynik z pełną warstwą (skorupa) == bez renderera');
const BN  = runBattle({ mode: 'none', seed: 1, atBody: 'p_home' });
const BON = runBattle({ mode: 'on', seed: 1, atBody: 'p_home' });
{
  console.log(`     przy ciele: cvBattle ${JSON.stringify(BN.st && { ok: BN.st.ok, body: BN.st.body, docked: BN.st.docked, enemyPinned: BN.st.enemyPinned })}, `
    + `sygnatura ${JSON.stringify(BN.sig.battles)}, rund ${BN.trace.length}; ON — klatek ze skorupą ${BON.R?.shellFrames}`);
  assert(BN.st?.ok === true && BN.st.docked === 10 && BN.st.enemyPinned === 10 && BN.sig.battles.length >= 1 && BN.trace.length >= 3,
    `A5-0 PRZESŁANKA: bitwa przy ciele rozegrana (gracz ${BN.st?.docked}/10 na orbitach, wróg ${BN.st?.enemyPinned}/10 przypięty, ${BN.trace.length} rund)`);
  assert(same(BON.sig, BN.sig) && same(BON.trace, BN.trace), 'A5a sygnatura i ślad każdej rundy identyczne ON == bez renderera');
  assert(BN.draws.length > 0 && same(BON.draws, BN.draws) && same(BON.slots, BN.slots), `A5b sekwencja losowań gry (${BN.draws.length}) i sloty orbit identyczne`);
  assert((BON.R?.shellFrames ?? 0) > 100, `A5c świadek: tryb ON rysował skorupę (${BON.R?.shellFrames} klatek)`);
}

header('A11 — (CV-7) kamera reżysera i spowolnienie bohatera (wymuszane przez całą bitwę): wynik == bez renderera');
const DIRB = runBattle({ mode: 'on', seed: 1, director: true });
{
  console.log(`     reżyser: klatek z tempem ≠ 1: ${DIRB.R?.warpFrames ?? 0}, najmniejsze tempo ${DIRB.R?.warpMinRate}, największe opóźnienie `
    + `${DIRB.R?.warpMaxLag?.toFixed?.(1)} ms, bohaterów ${DIRB.R?._cvDir?.warp?.heroes ?? 0}; brak modułu: ${!CVDIR}`);
  assert(!!CVDIR && (DIRB.R?.warpFrames ?? 0) > 100 && Math.abs((DIRB.R?.warpMinRate ?? 1) - 0.35) < 1e-9 && (DIRB.R?.warpMaxLag ?? 0) > 100
    && (DIRB.R?._cvDir?.warp?.heroes ?? 0) >= 2,
    'A11a świadek: spowolnienie naprawdę szło — tempo prezentacji 0,35× / 1,25× przez setki klatek, zegar prezentacji za realnym, ≥ 2 bohaterów');
  assert((DIRB.R?.lingerFrames ?? 0) > 10 && !(ON.R?.lingerFrames > 0),
    `A11d (Finding 711) scena zostaje po końcu logiki, dopóki rejestr ma zniszczenia do pokazania (${DIRB.R?.lingerFrames ?? 0} klatek); bez flagi — ani klatki (${ON.R?.lingerFrames ?? 0})`);
  assert(same(DIRB.sig, NONE.sig) && same(DIRB.trace, NONE.trace),
    `A11b sygnatura (z wrakami) i ślad każdej rundy identyczne reżyser + spowolnienie == bez renderera ${JSON.stringify(DIRB.sig.battles)}`);
  assert(NONE.draws.length > 0 && same(DIRB.draws, NONE.draws) && same(DIRB.slots, NONE.slots),
    `A11c sekwencja losowań gry (${DIRB.draws.length}) i sloty orbit identyczne — tempo prezentacji nie dotyka logiki ani strumienia gry`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
