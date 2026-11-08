// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_renderer_rng_smoke — KEEPER ARC COMBAT VISUALS, krok CV-0b (Finding 612; D-CV-1 (a) z warunkiem §3.1-1)
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §3.1-1 i §4 CV-0b.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: warstwa wizualna jadła strumień GRY (`Math.random`): `generateUUID` Three.js (4 losowania na KAŻDY obiekt:
//   Object3D, Material, BufferGeometry, Texture, Source) i bezpośrednie wywołania w rendererze i ekranach. Z tego
//   strumienia gra losuje sloty orbit (piszą pozycje logiczne statków), kąty przylotu, heksy desantu — więc to, co było
//   na ekranie, zmieniało świat i przez niego następne bitwy.
// KSZTAŁT: łatka `generateUUID` w `src/lib/three.core.js` (własny xorshift128, ziarno raz z crypto) + `RendererRng`
//   (`src/renderer/RendererRng.js`) dla 40 czysto wizualnych wywołań w 6 plikach; losowania stanu gry ZOSTAJĄ.
// ⚠ `ThreeRenderer` nie importuje się pod node ⇒ T5 / T6 / T7 WYCIĄGAJĄ ze źródła prawdziwe metody FX (`_onCombatRoundFx`,
//   `_spawnCombatTracer`, `_spawnFx`, `_spawnHitGlow`, `_spawnExplosion`, …) i przyrząd `debugRngCheck`, i wykonują je na
//   PRAWDZIWYM Three.js (`src/lib/three.module.js`, r171) z atrapą `this` (wzór `combat_ring_subtle_smoke`).
//
// PINY (logika, F11):
//   T1 (b) N obiektów THREE (16 typów + klony + `MathUtils.generateUUID`) ⇒ 0 losowań gry; UUID unikalne, format v4;
//      KONTROLA przyrządu: bezpośrednie `Math.random()` w oknie liczy się 1×
//   T2 źródło `three.core.js`: generator UUID bez `Math.random`, znacznik łatki; KONTROLA na zmutowanej kopii
//   T3 `RendererRng`: deterministyczny, [0, 1), 0 losowań gry, `reseedRendererRandom` wraca do sekwencji
//   T4 źródło warstwy wizualnej: zero `Math.random` w 6 przeniesionych plikach i w CAŁYM `src/renderer/`; każdy
//      przeniesiony plik importuje `RendererRng`; KONTROLA na zmutowanej kopii; NIE-PRZENIESIONE (stan gry) — liczba
//      odwołań bez zmian (sloty orbit, kąt przylotu, heksy desantu, anomalia M ciał, id, kandydaci, audio)
//   T5 (a) skryptowane starcie DSCS (3 fregaty vs niszczyciel, prawdziwy `TimeSystem` w siatce starcia): sekwencja losowań
//      gry z prawdziwymi metodami FX == bez FX; FX realnie działały (efekty i obiekty THREE w oknie pomiaru);
//      KONTROLA: ta sama ścieżka z emulacją dawnego UUID (losowania gry przy każdym efekcie) zmienia sekwencję
//   T6 (c) wynik przypięty: sygnatura starcia OFF == ON == NAGRANA (`--record`); slot orbity statku, który przylatuje
//      W TRAKCIE starcia (stan świata z `Math.random`), OFF == ON; KONTROLA emulacji — slot inny
//   T7 przyrządy konsoli: prawdziwa `debugRngCheck` ⇒ 0 losowań gry, UUID unikalne; `RngWatch` — klasyfikacja ramek
//      stosu, werdykt, opakowanie NIE zmienia strumienia gry
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
import { sourceOfStack, isVisualSource, summarizeTally, rngWatchToggle, countGameDraws } from '../../debug/RngWatch.js';
import { readFileSync, readdirSync } from 'node:fs';

// Prawdziwy Three.js r171 z repo. `CV0B_THREE_URL` (tylko fail-first): adres kopii SPRZED łatki — wtedy T1b / T5d / T6d /
// T7b mają być czerwone (zmierzone przy wdrożeniu CV-0b; zapis w planie §4 CV-0b).
const THREE = await import(process.env.CV0B_THREE_URL ?? new URL('../../lib/three.module.js', import.meta.url).href);

const RECORD = process.argv.includes('--record');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const randomRefs = (src) => (strip(src).match(/\bMath\.random\b/g) || []).length;

/** Okno pomiaru: każde losowanie gry w trakcie `fn` (wartości, w kolejności). */
function recordDraws(fn) {
  const base = Math.random;
  const draws = [];
  Math.random = () => { const v = base(); draws.push(v); return v; };
  let result;
  try { result = fn(); } finally { Math.random = base; }
  return { result, draws };
}

// ── T1 (b) — obiekty THREE nie losują ze strumienia gry ────────────────────────────────────────────────────────────
header('T1 (b) — N obiektów THREE ⇒ 0 losowań gry');
{
  const N = 50;
  const { result: uuids, draws } = recordDraws(() => {
    const ids = [];
    for (let i = 0; i < N; i++) {
      const geo = new THREE.BufferGeometry(), sph = new THREE.SphereGeometry(0.01, 6, 6), ring = new THREE.RingGeometry(0.1, 0.2, 8);
      const basic = new THREE.MeshBasicMaterial(), std = new THREE.MeshStandardMaterial(), lineMat = new THREE.LineBasicMaterial();
      const ptsMat = new THREE.PointsMaterial(), sprMat = new THREE.SpriteMaterial();
      const shader = new THREE.ShaderMaterial({ vertexShader: 'void main(){gl_Position=vec4(0.0);}', fragmentShader: 'void main(){}' });
      const mesh = new THREE.Mesh(sph, basic), line = new THREE.Line(geo, lineMat), pts = new THREE.Points(geo, ptsMat);
      const spr = new THREE.Sprite(sprMat), inst = new THREE.InstancedMesh(ring, std, 4), grp = new THREE.Group();
      const tex = new THREE.Texture(), dtex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
      const cam = new THREE.PerspectiveCamera(55, 1.5, 0.001, 5000), light = new THREE.PointLight(0xffffff, 1, 0, 2);
      const scene = new THREE.Scene(), obj = new THREE.Object3D();
      const meshCopy = mesh.clone(), matCopy = std.clone(), geoCopy = sph.clone();
      grp.add(mesh, line, pts, spr, inst, light, meshCopy);
      ids.push(geo.uuid, sph.uuid, ring.uuid, basic.uuid, std.uuid, lineMat.uuid, ptsMat.uuid, sprMat.uuid, shader.uuid,
        mesh.uuid, line.uuid, pts.uuid, spr.uuid, inst.uuid, grp.uuid, tex.uuid, tex.source.uuid, dtex.uuid, dtex.source.uuid,
        cam.uuid, light.uuid, scene.uuid, obj.uuid, meshCopy.uuid, matCopy.uuid, geoCopy.uuid, THREE.MathUtils.generateUUID());
      for (const d of [geo, sph, ring, basic, std, lineMat, ptsMat, sprMat, shader, tex, dtex, matCopy, geoCopy]) d.dispose();
    }
    return ids;
  });
  assert(uuids.length === N * 27, `T1a utworzono ${uuids.length} obiektów (16 typów + klony + generateUUID, ×${N})`);
  assert(draws.length === 0, `T1b losowań gry w trakcie: ${draws.length} (oczekiwane 0)`);
  assert(new Set(uuids).size === uuids.length, 'T1c wszystkie UUID unikalne');
  const big = Array.from({ length: 100000 }, () => THREE.MathUtils.generateUUID());
  assert(new Set(big).size === big.length, 'T1d 100 000 × generateUUID — bez kolizji');
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert(big.slice(0, 2000).every((u) => V4.test(u)), 'T1e format UUID v4 (wersja 4, wariant 8–b)');
  const ctl = recordDraws(() => Math.random());
  assert(ctl.draws.length === 1 && ctl.draws[0] === ctl.result, 'T1f KONTROLA przyrządu: bezpośrednie Math.random() w oknie liczy się dokładnie 1× (ta sama wartość)');
}

// ── T2 — źródło three.core.js ──────────────────────────────────────────────────────────────────────────────────────
header('T2 — źródło `three.core.js`: generator UUID bez Math.random');
const CORE = read('src/lib/three.core.js');
const uuidBlock = (src) => {
  const a = src.indexOf('function _seedUuidState()'), b = src.indexOf('\nfunction clamp(', a);
  return a >= 0 && b > a ? src.slice(a, b) : null;
};
{
  const blk = uuidBlock(CORE);
  assert(!!blk && blk.includes('function generateUUID()') && blk.includes('function _uuidWord()'), 'T2a blok generatora znaleziony (ziarno, krok xorshift128, generateUUID)');
  assert(blk && randomRefs(blk) === 0, 'T2b generator UUID: zero Math.random w kodzie (komentarze zdjęte)');
  assert(CORE.includes('KOSMOS CV-0b (Finding 612)'), 'T2c znacznik łatki w źródle (do ponowienia przy aktualizacji three)');
  assert(blk && /crypto/.test(strip(blk)), 'T2d ziarno z crypto.getRandomValues (fallback bez Math.random)');
  const mutated = blk ? blk.replace('const d0 = _uuidWord();', 'const d0 = Math.random() * 0xffffffff | 0;') : '';
  assert(randomRefs(mutated) === 1, 'T2e KONTROLA: kopia z dawnym Math.random w generateUUID — pin ją wykrywa');
}

// ── T3 — RendererRng ───────────────────────────────────────────────────────────────────────────────────────────────
header('T3 — RendererRng: prywatny, deterministyczny strumień warstwy wizualnej');
{
  reseedRendererRandom('t3');
  const a = Array.from({ length: 64 }, () => rendererRandom());
  reseedRendererRandom('t3');
  const { result: b, draws } = recordDraws(() => Array.from({ length: 64 }, () => rendererRandom()));
  assert(same(a, b), 'T3a ten sam seed ⇒ ta sama sekwencja (powtarzalne klatki sond)');
  assert(draws.length === 0, 'T3b rendererRandom: 0 losowań gry');
  assert(a.every((x) => x >= 0 && x < 1) && new Set(a).size === a.length, 'T3c wartości w [0, 1), bez powtórzeń w próbce');
  reseedRendererRandom('inne');
  assert(!same(a, Array.from({ length: 64 }, () => rendererRandom())), 'T3d inny seed ⇒ inna sekwencja');
  reseedRendererRandom();
}

// ── T4 — źródło warstwy wizualnej: przeniesione / zostawione ──────────────────────────────────────────────────────
header('T4 — źródło: zero Math.random w warstwie wizualnej, stan gry nietknięty');
const MOVED = ['src/renderer/ThreeRenderer.js', 'src/scenes/BattleView3D.js', 'src/scenes/TitleScene.js',
  'src/scenes/FactionSelectScene.js', 'src/scenes/EndgameScene.js', 'src/ui/ScheduledEventPopup.js'];
// Odwołania, które MUSZĄ zostać na Math.random (stan gry albo poza zakresem CV) — liczby z inwentarza CV-0b.
const KEPT = {
  'src/systems/OrbitalSpaceSystem.js': 6,   // sloty orbit (r, θ, φ) — piszą pozycje logiczne
  'src/systems/VesselManager.js': 1,        // kąt przylotu po skoku
  'src/systems/InvasionSystem.js': 1,       // heksy lądowania desantu
  'src/entities/Planet.js': 1, 'src/entities/Moon.js': 1, 'src/entities/Asteroid.js': 1,
  'src/entities/Comet.js': 1, 'src/entities/Planetoid.js': 1,   // anomalia średnia M ciał — fizyka
  'src/scenes/GameScene.js': 4,             // debug odwrotu, efekty zdarzeń, T księżyca przy wczytaniu
  'src/ui/ConsulElectionModal.js': 1,       // kolejność kandydatów — wybór gracza
  'src/ui/UnitDesignOverlay.js': 1,         // id projektu — zapis
  'src/data/StationModuleData.js': 1,       // id modułu — zapis
  'src/systems/AudioSystem.js': 1,          // szum dźwięku — audio poza CV (F8); przeniesienie razem z #613
};
{
  for (const f of MOVED) {
    const src = read(f);
    assert(randomRefs(src) === 0, `T4a ${f}: zero Math.random w kodzie`);
    assert(/import \{ rendererRandom \} from '(\.\/|\.\.\/renderer\/)RendererRng\.js'/.test(src) && /rendererRandom\(\)/.test(strip(src)),
      `T4b ${f}: importuje i woła rendererRandom`);
  }
  const rendererDir = readdirSync(new URL('src/renderer/', ROOT)).filter((f) => f.endsWith('.js'));
  const dirty = rendererDir.filter((f) => randomRefs(read('src/renderer/' + f)) > 0);
  assert(rendererDir.length >= 30 && dirty.length === 0, `T4c cały src/renderer/ (${rendererDir.length} plików): zero Math.random${dirty.length ? ' — ' + dirty.join(', ') : ''}`);
  const tr = read('src/renderer/ThreeRenderer.js');
  const mutated = tr.replace('_exhaustPhase: rendererRandom()', '_exhaustPhase: Math.random()');
  assert(mutated !== tr && randomRefs(mutated) === 1, 'T4d KONTROLA: kopia rendererа z dawnym Math.random (faza wydechu) — pin ją wykrywa');
  for (const [f, n] of Object.entries(KEPT)) {
    const got = randomRefs(read(f));
    assert(got === n, `T4e NIE przeniesione (stan gry / poza CV): ${f} — ${got} odwołań (oczekiwane ${n})`);
  }
}

// ── T5 / T6 — skryptowane starcie DSCS: FX OFF / ON / KONTROLA ─────────────────────────────────────────────────────
// Świat i scena jak `combat_pace_smoke` (prawdziwy TimeSystem, siatka starcia, VesselManager → Proximity → DSCS →
// MOS → wraki). W trakcie starcia (runda 5) statek przylatuje do planety — slot orbity z `Math.random` = stan świata.
const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';
const GY0 = 100.00002;
const START_AU = 0.30;
// Sygnatura NAGRANA tym keeperem (`node cv_renderer_rng_smoke.mjs --record`) na kodzie CV-0b — FX OFF.
// Format bitwy: [rundy, strzały, trafienia, zwycięzca, odwrót, straty A, straty B]; wraki — nazwy.
const PINNED_SIG = { battles: [[17, 31, 27, 'A', 'B', 1, 0], [1, 2, 2, 'A', null, 0, 1]], wrecks: ['Fregata2', 'Straznik'] };

const clock = { now: 1e7 };
performance.now = () => clock.now;

// Prawdziwe metody FX renderera (źródło) — wykonywane na prawdziwym Three.js z atrapą `this`.
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
const S = (v) => v / Number((TR.match(/const WORLD_SCALE\s*=\s*([\d.]+)/) ?? [])[1]);
let glowTex = null;
const TR_STATIC = { _hitGlowTexture: () => (glowTex ??= new THREE.Texture()) };
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'combatFxPace', 'fxWeaponColor',
  'FX_MAX_ACTIVE', 'FX_TRACER_MS', 'FX_SHIELD_COLOR', 'isEnemyVessel', 'isEndpointVisibleInCombat', 'isPlayerEngagement',
  'vesselTargetSize', 'HIT_GLOW', 'hitGlowWorldSize', 'ThreeRenderer', 'EXPLOSION_RING_COLOR', 'FX_HDR_EXPLOSION', 'rendererRandom'];
const FX_METHODS = ['_onCombatRoundFx', '_combatEndpointWorld', '_isEnemyEndpointVisible', '_isCombatRevealed', '_spawnCombatTracer',
  '_spawnFx', '_disposeFx', '_followTracerEnds', '_followFxTarget', '_spawnHitGlow', '_spawnExplosion', 'debugRngCheck'];
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(
    THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance, FX.isEngagementInView, FXC.combatFxPace, FXC.weaponColor,
    FXC.FX_MAX_ACTIVE, FXC.FX_TRACER_MS, FXC.FX_SHIELD_COLOR, isEnemyVessel, FX.isEndpointVisibleInCombat, FX.isPlayerEngagement,
    vesselTargetSize, FX.HIT_GLOW, FX.hitGlowWorldSize, TR_STATIC, FX.EXPLOSION_RING_COLOR, FX_HDR_EXPLOSION, rendererRandom);
}

/** Atrapa renderera z PRAWDZIWYMI metodami FX; `oldUuid` — emulacja dawnego `generateUUID` (KONTROLA). */
function fakeRenderer({ oldUuid = false } = {}) {
  const R = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000),
    _fxGroup: null, _activeEffects: [], _vessels: new Map(), spawned: 0, explosions: 0, missing: [] };
  for (const n of FX_METHODS) { const fn = makeMethod(n); if (fn) R[n] = fn; else R.missing.push(n); }
  const spawn = R._spawnFx;
  R._spawnFx = function (mesh, cfg) {
    R.spawned++;
    if (oldUuid) for (let k = 0; k < 12; k++) Math.random();   // geometria + materiał + siatka × 4 losowania (jak przed łatką)
    return spawn.call(R, mesh, cfg);
  };
  return R;
}

let ts, vm, mos, prox, dscs, eah, oss, rec;

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
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos,
    proximitySystem: prox, deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    debug: { combatTrace: false },
  });
  rec = { rounds: 0, battles: [], wrecks: [] };
  const orig = dscs._tickEncounter.bind(dscs);
  dscs._tickEncounter = (enc, civDy) => { orig(enc, civDy); rec.rounds++; };
  EventBus.on('battle:resolved', ({ result }) => {
    if (!result?.id?.startsWith?.('battle_ds_')) return;
    const evs = (result.timeline ?? []).flatMap(r => r.events ?? []);
    rec.battles.push([Math.max(0, ...(result.timeline ?? []).map(r => r.round ?? 0)), evs.length, evs.filter(e => e.hit).length,
      result.winner ?? null, result.retreated ?? null, result.lossesA ?? null, result.lossesB ?? null]);
  });
  EventBus.on('vessel:wrecked', ({ vesselId, vessel }) => rec.wrecks.push(vessel?.name ?? vesselId));
}

function ship({ xAU, yAU = 0, name, empire = null, modules, hull = 'hull_frigate' }) {
  const v = vm.createAndRegister(hull, 'p_home', { name, modules });
  v.position.x = xAU * AU; v.position.y = yAU * AU; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; v.serviceState = 'active'; }
  return v;
}

function combatScene() {
  const guard = ship({ xAU: 1.0, yAU: 0, name: 'Straznik', empire: EMP, hull: 'hull_destroyer',
    modules: ['weapon_missile', 'weapon_missile', 'weapon_kinetic', 'engine_ion', 'armor_heavy'] });
  const frigs = [0, 1, 2].map(i => {
    const ang = 2.6 + i * 0.25;
    return ship({ xAU: 1.0 + Math.cos(ang) * START_AU, yAU: Math.sin(ang) * START_AU, name: `Fregata${i}`, modules: ['weapon_laser', 'engine_ion'] });
  });
  frigs.forEach(f => mos.issueOrder(f.id, { type: 'engage', targetEntityId: guard.id, issuedBy: 'keeper' }));
  return { guard, frigs };
}

/** Statek przylatuje do planety W TRAKCIE starcia — slot orbity (r, θ, φ) z `Math.random` (stan świata). */
const ARRIVAL_ROUNDS = [3, 6, 9, 12];
function arrival(i) {
  const v = ship({ xAU: 9, yAU: 0, name: `Przylot${i}`, modules: ['engine_ion'] });
  v.position.dockedAt = 'p_far';
  EventBus.emit('vessel:arrived', { vessel: v, mission: { type: 'transport', targetId: 'p_far' } });
  return v.id;
}

function frame(ms) { clock.now += ms; ts.update(ms); }
const encActive = () => dscs.listActive().length > 0;

/** Przebieg: 'off' (FX wyłączone), 'on' (prawdziwe metody FX), 'control' (FX + emulacja dawnego UUID). */
function run(mode) {
  const flag = GAME_CONFIG.FEATURES.fcCombatFx;
  // CV-2a — ten keeper pinuje DZISIEJSZĄ ścieżkę FX (metody `_spawnCombatTracer` / `_spawnFx` …), czyli ścieżkę OFF flagi
  // `cvFxEngine` (od CV-2a domyślnie ON). Neutralność silnika z pulami wobec strumienia gry pinuje `cv_fx_results_smoke`.
  const cvFlag = GAME_CONFIG.FEATURES.cvFxEngine;
  GAME_CONFIG.FEATURES.cvFxEngine = false;
  // ARC CV-3a1 — `cvStage` (od CV-3a1 domyślnie ON) też OFF: dzisiejsza eksplozja wraku ma płaski pierścień (641).
  const stFlag = GAME_CONFIG.FEATURES.cvStage;
  GAME_CONFIG.FEATURES.cvStage = false;
  reseed('cv0b-battle'); reseedRendererRandom();
  let R = null;
  const arrivals = [];
  const out = recordDraws(() => {
    world();
    GAME_CONFIG.FEATURES.fcCombatFx = mode !== 'off';
    if (mode !== 'off') {
      R = fakeRenderer({ oldUuid: mode === 'control' });
      EventBus.on('combat:roundFx', (p) => R._onCombatRoundFx(p));
      EventBus.on('vessel:wrecked', ({ vessel }) => {            // pierwszy krok handlera wraku renderera: eksplozja + przeskinowanie
        if (!vessel) return;
        R.explosions++;
        R._spawnExplosion(new THREE.Vector3(S(vessel.position.x), 0.3, S(vessel.position.y)), vesselTargetSize(vessel));
        new THREE.MeshStandardMaterial().clone();
        rendererRandom(); rendererRandom();                      // przechył wraku (rotation.z / rotation.x)
      });
    }
    combatScene();
    for (let n = 0; n < 40000; n++) {
      if (arrivals.length < ARRIVAL_ROUNDS.length && rec.rounds >= ARRIVAL_ROUNDS[arrivals.length]) arrivals.push(arrival(arrivals.length));
      frame(16);
      if (!encActive() && rec.battles.length > 0) { for (let k = 0; k < 60; k++) frame(16); break; }
    }
    const slots = arrivals.map((id) => { const o = oss.getOrbit(id); return o ? [o.r, o.theta0, o.phi] : null; });
    return { sig: { battles: rec.battles, wrecks: rec.wrecks }, slots };
  });
  GAME_CONFIG.FEATURES.fcCombatFx = flag;
  GAME_CONFIG.FEATURES.cvFxEngine = cvFlag;
  GAME_CONFIG.FEATURES.cvStage = stFlag;
  return { ...out.result, draws: out.draws, R };
}

header('T5 (a) — sekwencja losowań gry w starciu: FX OFF == FX ON (prawdziwe metody FX)');
const OFF = run('off');
const ON  = run('on');
const CTL = run('control');
{
  assert(ON.R && ON.R.missing.length === 0, `T5a metody FX wyciągnięte ze źródła renderera${ON.R?.missing?.length ? ' — brak: ' + ON.R.missing.join(', ') : ''}`);
  assert(OFF.sig.battles.length > 0 && OFF.draws.length > 0, `T5b KONTROLA sceny: starcie rozstrzygnięte, gra losowała w oknie (${OFF.draws.length} losowań)`);
  assert(ON.R.spawned >= 30 && ON.R.explosions >= 1, `T5c FX realnie działały: ${ON.R.spawned} efektów, ${ON.R.explosions} eksplozji (obiekty THREE w oknie pomiaru)`);
  assert(same(ON.draws, OFF.draws), `T5d sekwencja losowań gry ON == OFF (${ON.draws.length} == ${OFF.draws.length}, wartości identyczne)`);
  assert(!same(CTL.draws, OFF.draws), `T5e KONTROLA: emulacja dawnego UUID zmienia sekwencję (${CTL.draws.length} ≠ ${OFF.draws.length}) — przyrząd czuły`);
}

header('T6 (c) — wynik przypięty: starcie i stan świata OFF == ON');
{
  if (RECORD) console.log('  [record] PINNED_SIG =', JSON.stringify(OFF.sig));
  assert(same(OFF.sig, PINNED_SIG), `T6a sygnatura starcia FX OFF = NAGRANA ${JSON.stringify(PINNED_SIG.battles)}`);
  assert(same(ON.sig, OFF.sig), 'T6b sygnatura starcia FX ON = FX OFF');
  assert(OFF.slots.length === ARRIVAL_ROUNDS.length && OFF.slots.every((s) => s && s.every(Number.isFinite)),
    `T6c KONTROLA: ${OFF.slots.length} sloty orbit przydzielone W TRAKCIE starcia (rundy ${ARRIVAL_ROUNDS.join(', ')}), r / θ₀ / φ skończone`);
  assert(same(ON.slots, OFF.slots), 'T6d sloty orbit (stan świata z Math.random) FX ON = FX OFF');
  assert(!same(CTL.slots, OFF.slots), 'T6e KONTROLA: emulacja dawnego UUID przesuwa sloty orbit — stan świata zależałby od FX');
}

// ── T7 — przyrządy konsoli ─────────────────────────────────────────────────────────────────────────────────────────
header('T7 — przyrządy konsoli: debugRngCheck i RngWatch');
{
  const check = makeMethod('debugRngCheck');
  const { result: r, gameDraws } = countGameDraws(() => check.call({}, 100));
  assert(r && r.objects === 1200 && r.uniqueUuids === 1200 && r.rendererDraws === 100, `T7a debugRngCheck (prawdziwa metoda): ${r?.objects} obiektów, ${r?.uniqueUuids} unikalnych UUID`);
  assert(gameDraws === 0, `T7b debugRngCheck pod countGameDraws: ${gameDraws} losowań gry (oczekiwane 0)`);
  const ctl = countGameDraws(() => { Math.random(); Math.random(); });
  assert(ctl.gameDraws === 2, 'T7c KONTROLA countGameDraws: dwa bezpośrednie losowania liczą się 2×');

  const chrome = 'Error\n    at rngWatchRandom (http://127.0.0.1:5500/src/debug/RngWatch.js:70:20)\n    at OrbitalSpaceSystem.assignOrbit (http://127.0.0.1:5500/src/systems/OrbitalSpaceSystem.js:273:40)';
  const firefox = 'rngWatchRandom@http://localhost:5500/src/debug/RngWatch.js:70:20\n_spawnFx@http://localhost:5500/src/renderer/ThreeRenderer.js:6420:5';
  const cdn = 'Error\n    at x (https://cdn.jsdelivr.net/npm/three@0.171/examples/jsm/loaders/GLTFLoader.js:10:1)';
  const core = 'Error\n    at generateUUID (http://127.0.0.1:5500/src/lib/three.core.js?v=2:314:12)';
  const ui = 'Error\n    at pick (http://127.0.0.1:5500/src/ui/ConsulElectionModal.js:44:5)';
  const s1 = sourceOfStack(chrome), s2 = sourceOfStack(firefox), s3 = sourceOfStack(cdn), s4 = sourceOfStack(core), s5 = sourceOfStack(ui);
  assert(s1.file === 'OrbitalSpaceSystem.js' && !isVisualSource(s1), 'T7d ramka Chrome: pomija RngWatch, OrbitalSpaceSystem = stan gry');
  assert(s2.file === 'ThreeRenderer.js' && isVisualSource(s2), 'T7e ramka Firefox: ThreeRenderer = warstwa wizualna');
  assert(isVisualSource(s3) && s4.file === 'three.core.js' && isVisualSource(s4), 'T7f dodatek Three z CDN i three.core.js (parametr ?v= zdjęty) = warstwa wizualna');
  assert(s5.file === 'ConsulElectionModal.js' && !isVisualSource(s5), 'T7g plik UI ze stanem gry (kandydaci) NIE jest warstwą wizualną');
  const tally = new Map([['a', { file: 'OrbitalSpaceSystem.js', draws: 3, visual: false }], ['b', { file: 'ThreeRenderer.js', draws: 1, visual: true }]]);
  const sumBad = summarizeTally(tally);
  tally.delete('b');
  const sumOk = summarizeTally(tally);
  assert(sumBad.visualDraws === 1 && /BŁĄD/.test(sumBad.verdict) && sumOk.visualDraws === 0 && /OK/.test(sumOk.verdict), 'T7h werdykt: losowanie z warstwy wizualnej = BŁĄD, bez — OK');

  const quiet = { log: () => {}, table: () => {} };
  reseed('t7-watch');
  const seqA = Array.from({ length: 5 }, () => Math.random());
  reseed('t7-watch');
  rngWatchToggle(quiet);
  const seqB = Array.from({ length: 5 }, () => Math.random());
  const sum = rngWatchToggle(quiet);
  assert(same(seqA, seqB), 'T7i opakowanie RngWatch NIE zmienia strumienia gry (te same wartości z opakowaniem i bez)');
  assert(sum.total === 5 && sum.visualDraws === 0 && sum.rows[0]?.file === 'cv_renderer_rng_smoke.mjs', `T7j tabela: ${sum.total} losowań przypisanych temu keeperowi, 0 z warstwy wizualnej`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
