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
//   A1 tryb ON naprawdę rysował silnikiem (strzały w pulach, zero dzisiejszych efektów), tryb OFF — dzisiejszą ścieżką
//   A2 ON == OFF == bez renderera: sygnatura, ślad każdej rundy, sekwencja losowań gry, sloty orbit
//   A3 KONTROLA przyrządu: słuchacz salwy losujący z `Math.random` przesuwa sloty orbit (i sekwencję)
//
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
import { vesselTargetSize }      from '../../renderer/VesselModelResolver.js';
import { isEnemyVessel }         from '../../entities/Vessel.js';
import { rendererRandom, reseedRendererRandom } from '../../renderer/RendererRng.js';
import { readFileSync }          from 'node:fs';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const STAGER = await tryImport('../../debug/CvBattleStager.js');
const ENGINE = await tryImport('../../renderer/combat/FxEngine.js');
const CLOCK  = await tryImport('../../renderer/combat/PresentationClock.js');
const RECALL = await tryImport('../../systems/director/DirectorRecall.js');

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
  'FxEngine', 'logDepthOn'];
const METHODS = ['_onCombatRoundFx', '_combatEndpointWorld', '_isEnemyEndpointVisible', '_isCombatRevealed', '_spawnCombatTracer',
  '_spawnFx', '_disposeFx', '_followTracerEnds', '_followFxTarget', '_spawnHitGlow', '_cvFxRoundFx', '_ensureFxEngine', '_tickCvFx'];
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(
    THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance, FX.isEngagementInView, FXC.combatFxPace, FXC.weaponColor,
    FXC.FX_MAX_ACTIVE, FXC.FX_TRACER_MS, FXC.FX_SHIELD_COLOR, isEnemyVessel, FX.isEndpointVisibleInCombat, FX.isPlayerEngagement,
    vesselTargetSize, FX.HIT_GLOW, FX.hitGlowWorldSize, TR_STATIC, FX.EXPLOSION_RING_COLOR, FX_HDR_EXPLOSION, rendererRandom,
    ENGINE?.FxEngine ?? null, () => true);
}

/** Atrapa renderera: prawdziwe metody FX, sprite'y = Object3D za pozycjami logicznymi, zegar prezentacji z CV-2a. */
function fakeRenderer() {
  const R = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000),
    _fxGroup: null, _activeEffects: [], _vessels: new Map(), _fxEngine: null, _galaxyActive: false,
    _presClock: CLOCK ? new CLOCK.PresentationClock() : null, legacySpawned: 0, missing: [] };
  for (const n of METHODS) { const fn = makeMethod(n); if (fn) R[n] = fn; else R.missing.push(n); }
  const spawn = R._spawnFx;
  R._spawnFx = function (mesh, cfg) { R.legacySpawned++; return spawn.call(R, mesh, cfg); };
  R.frame = function () {   // jak pętla renderu: sprite'y (TYLKO rysunek) + zegar i silnik
    for (const v of vm.getAllVessels()) {
      if (v.systemId !== SYS) continue;
      let e = R._vessels.get(v.id);
      if (!e) { e = { sprite: new THREE.Object3D() }; R._vessels.set(v.id, e); }
      e.sprite.visible = true;
      e.sprite.position.set(S(v.position.x), 0.3, S(v.position.y));
    }
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
  rec = { rounds: [], battles: [], wrecks: [] };
  const nameOf = (id) => vm.getVessel(id)?.name ?? id;
  const orig = dscs._tickEncounter.bind(dscs);
  dscs._tickEncounter = (enc, civDy) => {
    orig(enc, civDy);
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
function runBattle({ mode = 'none', seed = 1, control = false, nA = 10, nB = 10 } = {}) {
  const flag = GAME_CONFIG.FEATURES.cvFxEngine;
  reseed('cv2a-battle'); reseedRendererRandom();
  let R = null, st = null, outsider = null, recallList = null, recallNoEnc = null, ctlAi = null;
  const arrivals = [];
  const out = recordDraws(() => {
    world();
    if (mode !== 'none') {
      GAME_CONFIG.FEATURES.cvFxEngine = mode === 'on';
      R = fakeRenderer();
      EventBus.on('combat:roundFx', (p) => R._onCombatRoundFx(p));
    }
    if (control) EventBus.on('combat:roundFx', () => { Math.random(); Math.random(); Math.random(); });
    outsider = ship({ xAU: 3, yAU: 0, name: 'Postronny', modules: ['weapon_laser', 'engine_ion'], dockedAt: 'p_rock' });
    const H = helpers();
    st = H ? H.cvBattle({ seed, nA, nB }) : null;
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
    return { scene, sig: { battles: rec.battles, wrecks: rec.wrecks }, trace: rec.rounds, slots };
  });
  GAME_CONFIG.FEATURES.cvFxEngine = flag;
  return { ...out.result, draws: out.draws, R, st, recallList, recallNoEnc, outsiderName: outsider?.name };
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
header('S1 — stager: starcie orbitalne to krok CV-8a');
{
  world();
  const H = helpers();
  const r = H?.cvBattle({ kind: 'orbital' });
  assert(r?.ok === false && r?.reason === 'not_yet' && r?.step === 'CV-8a', `S1 kind 'orbital' → not_yet (CV-8a)${r ? '' : ' — brak stagera'}`);
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

header('S6 — to samo ziarno = ta sama bitwa; inne ziarno — inne seedBase');
const NONE2 = runBattle({ mode: 'none', seed: 1 });
const OTHER = runBattle({ mode: 'none', seed: 2 });
{
  assert(NONE.trace.length >= 5 && same(NONE2.sig, NONE.sig) && same(NONE2.trace, NONE.trace),
    `S6a ziarno 1 dwa razy: sygnatura i ślad każdej rundy identyczne (${NONE.trace.length} rund — świadek: bitwa się odbyła)`);
  assert(OTHER.scene?.seedBase !== NONE.scene?.seedBase && OTHER.st?.ok === true, `S6b ziarno 2: inne seedBase (${OTHER.scene?.seedBase} ≠ ${NONE.scene?.seedBase})`);
}

// ═══ A — wynik ON == OFF == bez renderera ═════════════════════════════════════════════════════════════════════════
header('A1 — tryby naprawdę rysowały: ON przez silnik z pulami, OFF dzisiejszą ścieżką');
const OFF = runBattle({ mode: 'off', seed: 1 });
const ON  = runBattle({ mode: 'on', seed: 1 });
{
  assert(ON.R && ON.R.missing.length === 0, `A1a metody renderera wyciągnięte ze źródła${ON.R?.missing?.length ? ' — brak: ' + ON.R.missing.join(', ') : ''}`);
  const es = ON.R?._fxEngine?.stats?.();
  console.log(`     ON: silnik ${es ? `strzały ${es.shots}, szczyt wiązki ${es.pools.beam.peak} / smugi ${es.pools.tracer.peak} / iskry ${es.pools.spark.peak}` : 'BRAK'}, dzisiejsze efekty ${ON.R?.legacySpawned}; OFF: dzisiejsze efekty ${OFF.R?.legacySpawned}, silnik ${OFF.R?._fxEngine ? 'jest' : 'brak'}`);
  assert(!!es && es.shots >= 50 && es.pools.beam.spawned > 0 && es.pools.tracer.spawned > 0 && es.pools.spark.spawned > 0 && ON.R.legacySpawned === 0,
    'A1b ON: salwy przez silnik (wiązki, smugi, iskry), zero dzisiejszych efektów');
  assert(OFF.R && OFF.R.legacySpawned >= 50 && OFF.R._fxEngine === null, 'A1c OFF: dzisiejsza ścieżka (efekty _spawnFx), silnik nie powstał');
  assert(!!ON.R?._presClock && ON.R._presClock.nowMs > 0, `A1d zegar prezentacji płynął w trybie ON (${ON.R?._presClock?.nowMs ?? 0} ms)`);
}

header('A2 — (a) wynik starcia ON == OFF == bez renderera');
{
  assert(NONE.sig.battles.length >= 1 && same(ON.sig, OFF.sig) && same(OFF.sig, NONE.sig), `A2a sygnatura identyczna ${JSON.stringify(NONE.sig.battles)}`);
  assert(NONE.trace.length >= 5 && same(ON.trace, OFF.trace) && same(OFF.trace, NONE.trace),
    `A2b ślad każdej rundy identyczny (${NONE.trace.length} rund: zdarzenia, HP, osłona, pozycje logiczne)`);
  assert(NONE.draws.length > 0 && same(ON.draws, OFF.draws) && same(OFF.draws, NONE.draws),
    `A2c sekwencja losowań gry identyczna (${NONE.draws.length} losowań, wartości)`);
  assert(NONE.slots.length === ARRIVAL_ROUNDS.length && NONE.slots.every(s => s && s.every(Number.isFinite)) && same(ON.slots, OFF.slots) && same(OFF.slots, NONE.slots),
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

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
