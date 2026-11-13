// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_models_render_smoke — KEEPER ARC COMBAT VISUALS, krok CV-1a (logika na PRAWDZIWYM Three.js r171; F11 a, b, f)
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.11, §4 CV-1a; Findingi 619, 620, 621, 624, 625.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (bez pinów na stałych rysunku):
//   R1 rig w ramie kanonicznej: model znormalizowany (najdłuższy wymiar = rozmiar klasy, środek w 0), dziób z pliku → +Z
//      wrappera, kurs wrappera kieruje dziób W ŚWIECIE wzdłuż ruchu; czubek smugi w dyszy z pliku, smuga za rufą.
//   R2 materiały: KAŻDY statek ma własne klony (tekstury wspólne, szablon nietknięty); szarość utrzymania (`_applyVesselMaintenanceTint`
//      z renderera) tylko na swoim statku. R2k KONTROLA (bez modułów CV-1a): dawna ścieżka (materiały szablonu wspólne) szarzy też drugi.
//   R3 maska: wstawka do PRAWDZIWEGO `ShaderLib.standard` (kotwice r171, jedna wstawka, wyjątek przy braku kotwicy i podwójnej
//      transformacji); jeden klucz programu dla wszystkich materiałów; uniformy dokładane w `onBeforeCompile`; klon materiału
//      z maską jest zwykłym materiałem (bez klucza i bez uniformów); mnożniki wspólne = ten sam obiekt.
//   R4 wróg: tint ciała UNIFORMAMI (kolor i ilość z palety; kolor materiału nietknięty — jedno pokrętło MODEL_ENEMY_TINT steruje
//      całym tintem; do kontroli właściciela CV-1a pin mówił „kolor jak dziś” = `color.lerp` — przecelowany świadomie, 2026-11-11);
//      wrak: żar > 0, maska 0, tint i obwódka 0, emisja mapy zgaszona, nieprzezroczysty; zamiana żywego statku we wrak NIE tworzy
//      materiałów.
//   R5 punkty świetlne rysowane WTEDY I TYLKO WTEDY, gdy `lights[]` niepuste — niezależnie od `keyColour.mode` (4 przypadki).
//   R6 (f) pula świateł: po rozgrzewce `acquire` / `release` — zero konstrukcji Object3D / Material / BufferGeometry; materiały
//      obiektów puli osobne, uniformy rozmiaru wspólne; krycie przepisywane w `onBeforeRender`.
//   R7 zwolnienie: klony materiałów i smuga zwolnione, światła wracają do puli, geometria SZABLONU nietknięta.
//   R8 integracja (prawdziwe metody renderera ze źródła): flaga ON → rama kanoniczna (statek gracza / wróg / wrak przy ciele),
//      kurs od razu z misji, smuga z pokręteł co klatkę; flaga OFF → dawna ścieżka; Finding 625 — wrak przy ciele bez wyjątku
//      także na ścieżce OFF; model z `incoming/` niedostępny → model slotu; (b) zero zapisów do stanu statku; (c) `enemyTint`
//      wpisu kanonicznego jak na ścieżce OFF (mgła tożsamości etykiet CTRL).
//   R10 Finding 625 na ścieżce OFF — blok bez modułów CV-1a (prawdziwy fail-first). R9 (a) zero `Math.random` (wszystko pod licznikiem).
//   R11 światło czytelności (kontrola właściciela CV-1a): uniformy STRONY (kolor obwódki, tint ciała) — własne obiekty każdego
//      materiału, swój ≠ wróg, wrak bez obwódki; zmiana motywu przemalowuje TYLKO obwódkę wrogów; uniformy wspólne (wypełnienie,
//      obwódka, sufit) — te same obiekty co `KC_SHARED`, pokrętła `cvTuning.MODEL_*` docierają co klatkę (`_tickCvModels`).
//   R12 kurs statków ON == OFF (prawdziwe metody stawiania): stojący bez misji (swój i wróg), z rozkazem bez współrzędnych
//      („Zaangażuj”), w locie, wrak (pochylenie) — orientacja dziobu i góry w świecie identyczna; KONTROLA: model z dziobem +X
//      (Finding 621) różni się świadomie — instrument widzi różnicę.
// ⚠ Importy CV-1a dynamiczne w try/catch — przy fail-first piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { isEnemyVessel }         from '../../entities/Vessel.js';
import { vesselTargetSize, VESSEL_MODEL_DEFAULT } from '../../renderer/VesselModelResolver.js';
import { exhaustGradientColors, exhaustIntensityRaw } from '../../utils/VesselFxLogic.js';
import { rendererRandom }        from '../../renderer/RendererRng.js';
import { readFileSync }          from 'node:fs';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const HP  = await tryImport('../../renderer/ShipHardpoints.js');
const KC  = await tryImport('../../renderer/KeyColourEmission.js');
const RIG = await tryImport('../../renderer/ShipModelRig.js');
const LP  = await tryImport('../../renderer/ShipLightPoints.js');
const ENG = await tryImport('../../renderer/combat/FxEngine.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = async (title, fn) => { header(title); try { await fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');

// (a) — licznik `Math.random` przez CAŁY keeper (renderer i moduły CV-1a losują wyłącznie `rendererRandom`).
let gameDraws = 0;
const _rnd = Math.random;
Math.random = function () { gameDraws++; return _rnd.call(Math); };

// ── szablon testowy: grupa → siatka przesunięta od środka (jak węzeł GLB), materiał standardowy z mapą ─────────────────────
const tex = new THREE.DataTexture(new Uint8Array([60, 230, 240, 255]), 1, 1);
function makeTemplate() {
  const geo = new THREE.BoxGeometry(2, 0.4, 0.6);
  geo.translate(0.3, 0.1, -0.2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, emissive: 0xffffff, emissiveMap: tex });
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'hull';
  g.add(mesh);
  return { g, geo, mat };
}
const docOf = (over = {}) => ({
  ...HP.defaultHardpoints('warp_frigate'),
  frame: { bow: [-1, 0, 0], up: [0, 1, 0] },
  nozzles: [{ p: [0.5, 0.02, 0], d: [1, 0, 0], r: 0.05 }],
  ...over,
});
const EXH = { gradient: exhaustGradientColors({ isEnemy: false }), hdr: 4.5 };
const L = 0.016;

// ── R1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('R1 rig w ramie kanonicznej — normalizacja, dziób → +Z, kurs w świecie, smuga w dyszy', () => {
  const { g } = makeTemplate();
  const hp = docOf();
  const rig = RIG.buildShipRig({ THREE, template: g, hardpoints: hp, targetSize: L, kind: 'own', exhaust: EXH });
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.model);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  assert(Math.abs(Math.max(size.x, size.y, size.z) - L) < 1e-9 && c.length() < 1e-9, `R1a model znormalizowany: najdłuższy wymiar = ${Math.max(size.x, size.y, size.z).toFixed(6)} (= L), środek w 0`);
  assert(Math.abs(size.z - L) < 1e-9 && size.x < L, 'R1b najdłuższa oś modelu (dziób −X) leży wzdłuż Z wrappera — rama kanoniczna');
  // Kurs: wrapper obrócony jak w grze (yawToward kanoniczny) — dziób z pliku W ŚWIECIE wzdłuż kierunku ruchu.
  let worst = 1;
  for (const [dx, dz] of [[1, 0], [0, 1], [-0.6, 0.8], [0.3, -0.95]]) {
    rig.root.rotation.set(0, HP.yawToward(dx, dz, true), 0);
    rig.root.updateMatrixWorld(true);
    const q = rig.canon.getWorldQuaternion(new THREE.Quaternion());
    const b = new THREE.Vector3(...hp.frame.bow).applyQuaternion(q);
    worst = Math.min(worst, (b.x * dx + b.z * dz) / Math.hypot(dx, dz));
  }
  assert(worst > 1 - 1e-9, `R1c kurs wrappera: dziób z pliku w świecie wzdłuż ruchu (min cos ${worst.toFixed(12)})`);
  rig.root.rotation.set(0, 0, 0); rig.root.updateMatrixWorld(true);
  const apex = rig.exhaust.getWorldPosition(new THREE.Vector3());
  const plumeDir = new THREE.Vector3(0, -1, 0).applyQuaternion(rig.exhaust.getWorldQuaternion(new THREE.Quaternion()));
  assert(Math.abs(apex.z + 0.5 * L) < 1e-9 && Math.abs(apex.y - 0.02 * L) < 1e-9 && plumeDir.z < -0.999,
    `R1d czubek smugi w dyszy z pliku (z = ${(apex.z / L).toFixed(3)} L — rufa), smuga ku −Z (za rufę)`);
  const rigPlus = RIG.buildShipRig({ THREE, template: makeTemplate().g, hardpoints: docOf({ frame: { bow: [1, 0, 0], up: [0, 1, 0] }, nozzles: [{ p: [-0.5, 0, 0], d: [-1, 0, 0], r: 0.05 }] }), targetSize: L, kind: 'own', exhaust: EXH });
  rigPlus.root.updateMatrixWorld(true);
  assert(rigPlus.exhaust.getWorldPosition(new THREE.Vector3()).z < -0.49 * L, 'R1e dziób +X (nonwarp_large_science, Finding 621) — ta sama rama: dysza za rufą (−Z)');
});

// ── R2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
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
const FX_HDR_EXHAUST = Number((TR.match(/const FX_HDR_EXHAUST\s*=\s*([\d.]+)/) ?? [])[1]);
const S = (v) => v / WORLD_SCALE;
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'isEnemyVessel', 'slotOfModelPath', 'buildShipRig', 'disposeShipRig', 'paintRigMaterials',
  'vesselTargetSize', 'exhaustGradientColors', 'exhaustIntensityRaw', 'FX_HDR_EXHAUST', 'yawToward', 'orbitYaw', 'bankRoll', 'rendererRandom',
  'lightTestPattern', 'SHIP_MODEL_DIR', 'INCOMING_DIR', 'VESSEL_MODEL_DEFAULT', 'LightPointPool', 'logDepthOn', 'performance', 'console', 'KC_SHARED',
  'REST_YAW_CANONICAL', 'wreckTiltQuaternion', 'paintRigRim', 'themeEpoch'];
let themeEpochStub = 1;   // R11 — zegar epoki motywu podawany metodom renderera
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  try {
    return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(
      THREE, S, GAME_CONFIG, globalThis.window, isEnemyVessel, HP?.slotOfModelPath, RIG?.buildShipRig, RIG?.disposeShipRig, RIG?.paintRigMaterials,
      vesselTargetSize, exhaustGradientColors, exhaustIntensityRaw, FX_HDR_EXHAUST, HP?.yawToward, HP?.orbitYaw, HP?.bankRoll, rendererRandom,
      RIG?.lightTestPattern, HP?.SHIP_MODEL_DIR, HP?.INCOMING_DIR, VESSEL_MODEL_DEFAULT, LP?.LightPointPool, () => true, globalThis.performance, console, KC?.KC_SHARED,
      HP?.REST_YAW_CANONICAL, HP?.wreckTiltQuaternion, RIG?.paintRigRim, () => themeEpochStub);
  } catch (e) { console.log(`    (budowa ${name}: ${e.message})`); return null; }
}
const tint = makeMethod('_applyVesselMaintenanceTint');

await block('R2 materiały: własne klony każdego statku; szarość utrzymania tylko na swoim (Finding 624)', () => {
  const { g, mat } = makeTemplate();
  const A = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'own' });
  const B = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'own' });
  const mA = A.materials[0], mB = B.materials[0];
  assert(mA !== mB && mA !== mat && mB !== mat && mA.map === tex && mB.map === tex, 'R2a dwa statki tego samego szablonu: osobne materiały, wspólna tekstura (klon obiektu materiału, nie tekstury)');
  assert(KC.keyColourUniformsOf(mat) === null && mat.customProgramCacheKey() !== KC.KC_PROGRAM_KEY, 'R2b materiał SZABLONU bez maski i bez klucza programu (nietknięty)');
  window.KOSMOS = { vesselManager: { isImmobilized: (v) => !!v.immobile } };
  const eA = { sprite: A.root, isModel3D: true }, eB = { sprite: B.root, isModel3D: true };
  tint.call({}, { id: 'a', immobile: true }, eA);
  tint.call({}, { id: 'b', immobile: false }, eB);
  assert(mA.opacity < 1 && mA.color.getHex() !== 0xffffff && mB.opacity === 1 && mB.color.getHex() === 0xffffff && mat.opacity === 1 && mat.color.getHex() === 0xffffff,
    `R2c szarość utrzymania: statek A szary (krycie ${mA.opacity}), statek B i szablon nietknięte`);
});

// KONTROLA (bez modułów CV-1a — zielona po obu stronach zmiany): dawna ścieżka — klon grupy BEZ klonowania materiałów (statek
// gracza) ⇒ wspólny materiał szablonu szarzeje na KAŻDYM statku tego pliku. Instrument R2c umie zobaczyć defekt 624.
await block('R2k KONTROLA — dawna ścieżka: wspólny materiał szablonu, szarość rozlewa się na drugi statek', () => {
  assert(!!tint, 'R2k-a `_applyVesselMaintenanceTint` wyciągnięty ze źródła renderera (prawdziwa metoda)');
  window.KOSMOS = { vesselManager: { isImmobilized: (v) => !!v.immobile } };
  const { g: g2, mat: shared } = makeTemplate();
  const oA = g2.clone(), oB = g2.clone();
  tint.call({}, { id: 'a', immobile: true }, { sprite: oA, isModel3D: true });
  const otherMat = oB.children[0].material;
  assert(otherMat === shared && otherMat.opacity < 1, 'R2k-b materiały wspólne (dawna ścieżka) — szarość statku A widać też na statku B');
});

// ── R3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('R3 maska: wstawka do prawdziwego ShaderLib.standard, jeden program, klon bez maski', () => {
  const src = THREE.ShaderLib.standard.fragmentShader;
  const out = KC.injectKeyColour(src);
  const ip = out.indexOf('#include <emissivemap_pars_fragment>'), im = out.indexOf('#include <emissivemap_fragment>');
  assert(out.split('#include <emissivemap_fragment>').length === 2 && out.split('uniform float uKcGainMul;').length === 2
    && out.indexOf('float kcMask(') > ip && out.indexOf('kcMask(kcToSrgb(kcTex))') > im && out.indexOf('#include <lights_physical_fragment>') > out.indexOf('totalEmissiveRadiance += uKcTint'),
    'R3a wstawka: deklaracje po `emissivemap_pars_fragment`, emisja PO `emissivemap_fragment` (przed oświetleniem), każda raz');
  const il = out.indexOf('outgoingLight = max(outgoingLight'), io = out.indexOf('#include <opaque_fragment>');
  assert(out.split('outgoingLight = max(outgoingLight').length === 2 && il > out.indexOf('vec3 outgoingLight =') && il < io
    && out.indexOf('kcFill = diffuseColor.rgb') > im && out.indexOf('kcFill = diffuseColor.rgb') < out.indexOf('#include <lights_physical_fragment>'),
    'R3a2 światło czytelności: liczone przy emisji, DODAWANE raz po całym oświetleniu (za `outgoingLight`, przed `opaque_fragment`)');
  let thrownDouble = false, thrownMissing = false, thrownLift = false;
  try { KC.injectKeyColour(out); } catch { thrownDouble = true; }
  try { KC.injectKeyColour(src.replace('#include <emissivemap_fragment>', '')); } catch { thrownMissing = true; }
  try { KC.injectKeyColour(src.replace('#include <opaque_fragment>', '')); } catch { thrownLift = true; }
  assert(thrownDouble && thrownMissing && thrownLift, 'R3b podwójna transformacja i brak kotwicy (także `opaque_fragment`) — GŁOŚNY wyjątek (nie cicha wstawka bez skutku)');
  const m1 = new THREE.MeshStandardMaterial({ map: tex }), m2 = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex });
  const u1 = KC.applyKeyColour(m1, { ...HP.defaultHardpoints('x').keyColour, mode: 'mask' }), u2 = KC.applyKeyColour(m2, HP.defaultHardpoints('x').keyColour);
  assert(m1.customProgramCacheKey() === KC.KC_PROGRAM_KEY && m2.customProgramCacheKey() === KC.KC_PROGRAM_KEY && m1.onBeforeCompile === m2.onBeforeCompile,
    'R3c jeden klucz programu i jedna funkcja `onBeforeCompile` dla wszystkich materiałów (wartości tylko uniformami)');
  assert(u1.uKcGain.value === 3.5 && u2.uKcGain.value === 0 && u1.uKcGainMul === u2.uKcGainMul && u1.uKcGainMul === KC.KC_SHARED.uKcGainMul,
    'R3d tryb mask → wzmocnienie 3,5, none → 0; mnożnik wspólny to TEN SAM obiekt uniformu (pokrętło działa na wszystkie)');
  const shader = { uniforms: {}, fragmentShader: src, vertexShader: THREE.ShaderLib.standard.vertexShader };
  m1.onBeforeCompile(shader);
  assert(shader.uniforms.uKcHue === u1.uKcHue && shader.fragmentShader.includes('kcMask(kcToSrgb(kcTex))'), 'R3e `onBeforeCompile` dokłada uniformy materiału i wstawkę');
  const cl = m1.clone();
  assert(KC.keyColourUniformsOf(cl) === null && cl.customProgramCacheKey() !== KC.KC_PROGRAM_KEY, 'R3f klon materiału z maską = zwykły materiał (bez klucza programu maski i bez jej uniformów)');
});

// ── R4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('R4 wróg z tintem, wrak z żarem; zamiana we wrak bez nowych materiałów (Finding 620)', () => {
  const { g } = makeTemplate();
  const E = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'enemy' });
  const ue = KC.keyColourUniformsOf(E.materials[0]);
  const ec = new THREE.Color(RIG.RIG_PALETTE.ENEMY_COLOR);
  assert(ue.uKcTint.value.x > 0 && ue.uKcBodyAmt.value === RIG.RIG_PALETTE.ENEMY_COLOR_T
    && Math.abs(ue.uKcBody.value.x - ec.r) < 1e-12 && Math.abs(ue.uKcBody.value.y - ec.g) < 1e-12 && Math.abs(ue.uKcBody.value.z - ec.b) < 1e-12
    && E.materials[0].color.getHex() === 0xffffff && E.materials[0].emissive.getHex() === 0xffffff && ue.uKcTintMul === KC.KC_SHARED.uKcTintMul,
    'R4a wróg: tint ciała i emisji UNIFORMAMI (kolor i ilość z palety, mnożnik wspólny MODEL_ENEMY_TINT), kolor materiału i mapa emisji nietknięte');
  const W = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'wreck', burnHot: true });
  const uw = KC.keyColourUniformsOf(W.materials[0]);
  assert(uw.uKcBurn.value.x > 1 && uw.uKcGain.value === 0 && uw.uKcBodyAmt.value === 0 && uw.uKcRim.value.x + uw.uKcRim.value.y + uw.uKcRim.value.z === 0
    && W.materials[0].emissive.getHex() === 0 && W.materials[0].transparent === false && W.exhaust === null,
    'R4b wrak: żar HDR (> 1), maska, tint ciała i obwódka zgaszone, mapa emisji zgaszona, nieprzezroczysty, bez smugi');
  const own = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'own' });
  const before = new THREE.MeshBasicMaterial().id;
  RIG.paintRigMaterials(THREE, own.materials, 'wreck', { burnHot: true });
  const after = new THREE.MeshBasicMaterial().id;
  assert(after - before === 1 && KC.keyColourUniformsOf(own.materials[0]).uKcBurn.value.x > 1, 'R4c zamiana żywego statku we wrak na jego własnych klonach — zero nowych materiałów');
});

// ── R5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('R5 punkty świetlne wtedy i tylko wtedy, gdy lights[] niepuste — niezależnie od trybu maski', () => {
  const pool = new LP.LightPointPool({ THREE, logDepth: true });
  const lights = [{ p: [-0.4, 0.05, 0], size: 0.02 }, { p: [0, 0.1, 0.1], size: 0.02, colour: '#ff4040' }, { p: [0.3, 0, -0.1], size: 0.02 }];
  const res = [];
  for (const mode of ['mask', 'none']) for (const ls of [[], lights]) {
    const hp = docOf({ lights: ls, keyColour: { ...HP.defaultHardpoints('x').keyColour, mode } });
    const rig = RIG.buildShipRig({ THREE, template: makeTemplate().g, hardpoints: hp, targetSize: L, kind: 'own', lightPool: pool, lightKey: `k-${mode}-${ls.length}` });
    res.push({ mode, n: ls.length, has: !!rig.lights, inst: rig.lights?.geometry?.instanceCount ?? 0, parent: rig.lights?.parent === rig.canon });
  }
  assert(res.every((r) => r.has === (r.n > 0) && r.inst === r.n && (!r.has || r.parent)),
    `R5a ${res.map((r) => `${r.mode}/${r.n}→${r.has ? r.inst : '—'}`).join(' · ')} — punkty pod ramą kanoniczną (dziedziczą kurs i skalę)`);
  assert(pool.stats().live === 2, 'R5b pula: dwa statki ze światłami — dwa obiekty w użyciu');
});

// ── R6 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('R6 (f) pula świateł — zero konstrukcji po rozgrzewce, krycie własne, uniformy rozmiaru wspólne', () => {
  const pool = new LP.LightPointPool({ THREE, logDepth: true });
  const sets = [0, 1, 2].map((i) => pool.geometryFor('s' + i, [{ p: [0.1 * i, 0, 0], size: 0.02 }, { p: [-0.2, 0.05, 0], size: 0.03 }]));
  const warm = [];
  for (let i = 0; i < 12; i++) warm.push(pool.acquire(sets[i % 3]));
  for (const m of warm) pool.release(m);
  const ids = () => [new THREE.Object3D().id, new THREE.Material().id, new THREE.BufferGeometry().id];
  const created0 = pool.stats().created, id0 = ids();
  const held = [];
  for (let c = 0; c < 50; c++) {
    for (let i = 0; i < 12; i++) held.push(pool.acquire(sets[(i + c) % 3]));
    while (held.length) pool.release(held.pop());
    if (pool.geometryFor('s' + (c % 3), sets[c % 3].userData.lightsRef) !== sets[c % 3]) held.push(null);
  }
  const id1 = ids();
  const d = id1.map((x, i) => x - id0[i] - 1);
  assert(d.every((x) => x === 0) && pool.stats().created === created0 && held.length === 0,
    `R6a 50 cykli × 12 statków po rozgrzewce: konstrukcje Object3D / Material / BufferGeometry = ${d.join(' / ')}, nowe obiekty puli ${pool.stats().created - created0}`);
  const a = pool.acquire(sets[0]), b = pool.acquire(sets[1]);
  assert(a.material !== b.material && a.material.uniforms.uGain === b.material.uniforms.uGain && a.material.uniforms.uPxToWorld === pool.shared.uPxToWorld,
    'R6b obiekty puli: materiały osobne (krycie wywiadu / utrzymania na swoim statku), uniformy rozmiaru i wzmocnienia wspólne');
  a.material.opacity = 0.3;
  a.onBeforeRender(null, null, null, a.geometry, a.material);
  pool.update({ fovDeg: 55, viewportH: 1041, gain: 2, minPx: 3 });
  assert(a.material.uniforms.uOpacity.value === 0.3 && b.material.uniforms.uOpacity.value === 1 && b.material.uniforms.uGain.value === 2 && b.material.uniforms.uMinPx.value === 3,
    'R6c krycie przepisywane w `onBeforeRender` (tylko ten statek), pokrętła puli od następnej klatki dla wszystkich');
  const src = LP.buildLightShaders({ logDepth: true });
  assert(src.vertexShader.includes('USE_LOGDEPTHBUF') && src.fragmentShader.includes('gl_FragDepth') && !LP.buildLightShaders({ logDepth: false }).vertexShader.includes('USE_LOGDEPTHBUF'),
    'R6d program świateł: chunki logarytmicznej głębi przy `logDepth`, bez — przy false');
});

// ── R7 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('R7 zwolnienie: klony i smuga zwolnione, światła do puli, geometria szablonu nietknięta', () => {
  const { g, geo } = makeTemplate();
  const pool = new LP.LightPointPool({ THREE, logDepth: true });
  const rig = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf({ lights: [{ p: [0, 0, 0], size: 0.02 }] }), targetSize: L, kind: 'own', lightPool: pool, exhaust: EXH });
  let disposedMats = 0, templateGeoDisposed = 0, exhaustDisposed = 0;
  for (const m of rig.materials) m.addEventListener('dispose', () => disposedMats++);
  geo.addEventListener('dispose', () => templateGeoDisposed++);
  rig.exhaust.geometry.addEventListener('dispose', () => exhaustDisposed++);
  const n = rig.materials.length;
  RIG.disposeShipRig(rig, pool);
  assert(disposedMats === n && exhaustDisposed === 1 && templateGeoDisposed === 0 && pool.stats().live === 0 && pool.stats().free === 1,
    `R7a zwolnione: ${disposedMats}/${n} klonów materiałów, smuga; geometria szablonu NIE (${templateGeoDisposed}); światła w puli (wolne ${pool.stats().free})`);
});

// ── R8 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('R8 integracja — prawdziwe metody renderera: flaga ON / OFF, kurs, smuga z pokręteł, wrak przy ciele (625), incoming', async () => {
  const add3d = makeMethod('_addVesselModel3D'), addCv = makeMethod('_addVesselModelCv'), pool = makeMethod('_cvLightPool');
  const ltd = makeMethod('_cvLightTestDoc'), exh = makeMethod('_applyExhaust'), rm = makeMethod('_removeVesselSprite');
  assert(!!(add3d && addCv && pool && ltd && exh && rm), 'R8a metody wyciągnięte ze źródła: _addVesselModel3D, _addVesselModelCv, _cvLightPool, _cvLightTestDoc, _applyExhaust, _removeVesselSprite');
  const tpl = makeTemplate();
  let writes = 0;
  const trap = (o) => new Proxy(o, { set(t, k, v) { writes++; t[k] = v; return true; } });
  const failPaths = new Set();
  const calls = { intel: 0, focus: 0, warn: [] };
  const R = {
    THREE, scene: new THREE.Scene(), _vessels: new Map(), _missingModelPaths: new Set(), _shipLightPool: null, _cvLightTest: false,
    _planets: new Map([['p1', { mesh: { uuid: 'u1' }, group: { position: { x: 0, z: 0 } } }]]), _moons: new Map(), _planetoids: new Map(), _entityByUUID: new Map(),
    _getEntityRadius: () => 0.05, cvTuning: ENG?.LIVE_CV_FX ?? {},
    _shipHardpoints: new HP.ShipHardpointsCache({ fetchJson: async (url) => (url.endsWith('/warp_frigate.json') ? docOf() : null), warn: () => {} }),
    _loadShipModel: (p) => (failPaths.has(p) ? Promise.reject(new Error('404')) : Promise.resolve(tpl.g)),
    _applyVesselIntelVisibility: () => { calls.intel++; }, _applyPendingVesselFocus: () => { calls.focus++; },
    _addVesselSpriteFallback: () => { calls.warn.push('fallback'); },
  };
  R._addVesselModelCv = addCv; R._cvLightPool = pool; R._cvLightTestDoc = ltd; R._addVesselModel3D = add3d; R._cvTiltWreck = makeMethod('_cvTiltWreck');
  window.KOSMOS = { observatorySystem: { isVesselDetected: () => true } };
  const F = GAME_CONFIG.FEATURES; const keep = { fcCombatFx: F.fcCombatFx, m4EnemyGhosts: F.m4EnemyGhosts };
  // ⚠ `headless/env.js` kolejkuje `setTimeout(…, 0)` do ręcznego flusha — tu prawdziwe makrozadanie (obietnice ładowania dokończone).
  const tick = () => new Promise((r) => (globalThis.__origSetTimeout ?? setTimeout)(r, 1));
  try {
    F.fcCombatFx = true; F.m4EnemyGhosts = true;
    const own = trap({ id: 'v1', name: 'own', shipId: 'hull_frigate', position: trap({ x: 100, y: 50, state: 'in_transit' }), warpFuel: { max: 5 },
      mission: trap({ targetX: 400, targetY: -250, phase: 'outbound' }) });
    R._addVesselModel3D(own, 'assets/models/ships/warp_frigate.glb');
    await tick(); await tick();
    const e1 = R._vessels.get('v1');
    e1?.sprite?.updateMatrixWorld(true);
    const q = e1?.rig?.canon?.getWorldQuaternion(new THREE.Quaternion());
    const bow = q ? new THREE.Vector3(-1, 0, 0).applyQuaternion(q) : new THREE.Vector3();
    const dx = 300, dz = -300, cos = (bow.x * dx + bow.z * dz) / Math.hypot(dx, dz);
    assert(e1?.canonical === true && e1.slot === 'warp_frigate' && e1.exhaust && Math.abs(cos - 1) < 1e-9 && calls.focus === 1,
      `R8b flaga ON: statek gracza w ramie kanonicznej, kurs od razu z misji (cos ${cos.toFixed(9)}), smuga, fokus oczekujący dokończony`);
    exh.call(R, own, e1);
    const len0 = e1.exhaust.scale.y;
    R.cvTuning.MODEL_PLUME_LEN *= 2;
    exh.call(R, own, e1);
    const ratio = e1.exhaust.scale.y / len0;
    R.cvTuning.MODEL_PLUME_LEN /= 2;
    assert(e1.exhaust.visible && ratio > 1.5 && ratio < 2.6 && Math.abs(e1.exhaust.scale.x - Math.max(0.05, R.cvTuning.MODEL_PLUME_R_MIN) * R.cvTuning.MODEL_PLUME_R_MUL) < 1e-12,
      `R8c smuga w locie: długość z pokrętła MODEL_PLUME_LEN co klatkę (×2 ⇒ ×${ratio.toFixed(2)} z migotaniem), promień z dyszy pliku`);
    const enemy = trap({ id: 'v2', name: 'enemy', shipId: 'hull_frigate', isEnemy: true, ownerEmpireId: 'emp_x', position: trap({ x: 0, y: 0, state: 'orbiting', dockedAt: null }), warpFuel: { max: 5 } });
    R._addVesselModel3D(enemy, 'assets/models/ships/warp_frigate.glb');
    await tick(); await tick();
    const e2 = R._vessels.get('v2');
    assert(e2?.canonical && KC.keyColourUniformsOf(e2.rig.materials[0]).uKcTint.value.x > 0 && calls.intel === 1, 'R8d wróg: rama kanoniczna, tint uniformem, widoczność wg wywiadu (`_applyVesselIntelVisibility`)');
    // (c) mgła wojny: etykiety CTRL (`getAllVisibleLabels`) rozpoznają wroga po `entry.enemyTint` (kolor i „?” zamiast nazwy przy
    // wywiadzie < contact) — wpis kanoniczny niesie TĘ SAMĄ semantykę co ścieżka OFF (wróg / wrak — true, swój — false).
    assert(e2.enemyTint === true && e1.enemyTint === false, 'R8d2 (c) `enemyTint` wpisu kanonicznego jak na ścieżce OFF — wróg true, swój false (mgła tożsamości etykiet CTRL)');
    const wreck = trap({ id: 'v3', name: 'wreck', shipId: 'hull_frigate', isWreck: true, position: trap({ x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' }), warpFuel: { max: 0 } });
    R._addVesselModel3D(wreck, 'assets/models/ships/warp_frigate.glb');
    await tick(); await tick();
    const e3 = R._vessels.get('v3');
    assert(e3?.canonical && e3.isWreck && e3.enemyTint === true && e3._orbiting?.bodyId === 'p1' && e3.exhaust === null && KC.keyColourUniformsOf(e3.rig.materials[0]).uKcBurn.value.x > 0,
      'R8e wrak przy ciele (flaga ON): pamięć orbity cmentarzyska, żar, bez smugi');
    // CV-Z — R8f (dawna ścieżka bez ramy kanonicznej, Finding 625 na ścieżce OFF) wycofane razem z flagą `cvModels`; wrak przy ciele
    //   w ramie kanonicznej pinuje R8e.
    // Model z `incoming/` niedostępny → model slotu (bez czekania i bez DEFAULT).
    failPaths.add('assets/models/ships/incoming/warp_frigate.glb');
    const warnOrig = console.warn;
    console.warn = () => {};
    const inc = trap({ id: 'v5', name: 'inc', shipId: 'hull_frigate', position: trap({ x: 0, y: 0, state: 'orbiting', dockedAt: null }), warpFuel: { max: 5 } });
    R._addVesselModel3D(inc, 'assets/models/ships/incoming/warp_frigate.glb');
    await tick(); await tick(); await tick();
    console.warn = warnOrig;
    const e5 = R._vessels.get('v5');
    assert(e5?.canonical && e5.slotVariant === 'slot' && R._missingModelPaths.has('assets/models/ships/incoming/warp_frigate.glb'), 'R8g model z incoming/ niedostępny → model slotu, ścieżka zapamiętana jako brakująca');
    const lp = R._shipLightPool;
    rm.call(R, 'v1');
    assert(!R._vessels.has('v1') && e1.rig.materials.length === 0 && (lp?.stats?.().live ?? 0) === 0, 'R8h `_removeVesselSprite`: rig zwolniony (klony, smuga, światła)');
    assert(writes === 0, `R8i (b) renderer nie pisze stanu statku (zapisy do statku / pozycji / misji: ${writes})`);
  } finally { Object.assign(F, keep); }
});

// ── R11 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Kontrola właściciela CV-1a (2026-11-11) — światło czytelności: obwódka w kolorze STRONY i tint ciała wroga to uniformy
// WŁASNE materiału (zmiana strony / motywu dotyka tylko tego statku), pokrętła wypełnienia / obwódki / sufitu — wspólne.
await block('R11 światło czytelności — uniformy strony własne dla materiału, wspólne pokrętła, motyw przemalowuje tylko wrogów', () => {
  const { g, mat } = makeTemplate();
  const ALERT = 0xff8800;
  const own = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'own', enemyRimHex: ALERT });
  const own2 = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'own', enemyRimHex: ALERT });
  const enemy = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'enemy', enemyRimHex: ALERT });
  const wreck = RIG.buildShipRig({ THREE, template: g, hardpoints: docOf(), targetSize: L, kind: 'wreck', enemyRimHex: ALERT });
  const uo = KC.keyColourUniformsOf(own.materials[0]), uo2 = KC.keyColourUniformsOf(own2.materials[0]);
  const ue = KC.keyColourUniformsOf(enemy.materials[0]), uw = KC.keyColourUniformsOf(wreck.materials[0]);
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const eq3 = (v, a) => Math.abs(v.x - a[0]) < 1e-12 && Math.abs(v.y - a[1]) < 1e-12 && Math.abs(v.z - a[2]) < 1e-12;
  assert(eq3(uo.uKcRim.value, lin(RIG.RIG_PALETTE.OWN_RIM)) && eq3(ue.uKcRim.value, lin(ALERT)) && eq3(uw.uKcRim.value, [0, 0, 0]),
    'R11a obwódka strony: swój — chłodna biel palety, wróg — kolor podany przez renderer (rola `alert`), wrak — bez obwódki');
  assert(uo.uKcRim !== uo2.uKcRim && uo.uKcRim.value !== uo2.uKcRim.value && uo.uKcRim !== ue.uKcRim && uo.uKcBody !== ue.uKcBody
    && uo.uKcBodyAmt !== ue.uKcBodyAmt && uo.uKcBodyAmt.value === 0 && ue.uKcBodyAmt.value > 0,
    'R11b obwódka i tint ciała to WŁASNE obiekty każdego materiału (także dwóch statków gracza z jednego szablonu); swój bez tintu ciała, wróg z tintem');
  const shared = ['uKcFillMul', 'uKcFillCol', 'uKcRimMul', 'uKcRimPow', 'uKcLiftCeil', 'uKcTintMul'];
  const all = [uo, uo2, ue, uw];
  assert(shared.every((k) => all.every((u) => u[k] === KC.KC_SHARED[k])) && KC.keyColourUniformsOf(mat) === null,
    'R11c wypełnienie, obwódka (wzmocnienie, moc), sufit i mnożnik tintu — TE SAME obiekty `KC_SHARED` we wszystkich materiałach; materiał szablonu bez uniformów');
  RIG.paintRigRim(THREE, enemy.materials, 'enemy', 0x00ff66);
  assert(eq3(ue.uKcRim.value, lin(0x00ff66)) && eq3(uo.uKcRim.value, lin(RIG.RIG_PALETTE.OWN_RIM)) && eq3(uo2.uKcRim.value, lin(RIG.RIG_PALETTE.OWN_RIM)),
    'R11d przemalowanie obwódki wroga zmienia wyłącznie jego materiały (statki gracza nietknięte)');

  // Integracja — prawdziwa `_tickCvModels`: pokrętła do uniformów wspólnych co klatkę; po zmianie epoki motywu obwódka wrogów w nowej roli
  // `alert`, swoi i wraki bez zmian; bez zmiany epoki — bez przemalowania (koszt raz na zmianę motywu, nie co klatkę).
  const tick = makeMethod('_tickCvModels');
  assert(!!tick, 'R11e `_tickCvModels` wyciągnięty ze źródła renderera');
  const keepShared = Object.fromEntries(Object.keys(KC.KC_SHARED).map((k) => [k, KC.KC_SHARED[k].value]));
  let alertHex = 0x2255ff;
  const R = {
    cvTuning: { ...(ENG?.LIVE_CV_FX ?? {}) }, _shipLightPool: null, camera: { fov: 55 }, _hud3dHex: (role) => (role === 'alert' ? alertHex : 0x123456),
    _vessels: new Map([
      ['o', { canonical: true, rig: own, enemyTint: false, isWreck: false }],
      ['e', { canonical: true, rig: enemy, enemyTint: true, isWreck: false }],
      ['w', { canonical: true, rig: wreck, enemyTint: true, isWreck: true }],
    ]),
  };
  try {
    themeEpochStub = 101;
    Object.assign(R.cvTuning, { MODEL_FILL: 0.123, MODEL_RIM_GAIN: 0.456, MODEL_RIM_POWER: 3.3, MODEL_LIFT_CEIL: 0.9, MODEL_ENEMY_TINT: 0.2 });
    tick.call(R);
    const S0 = KC.KC_SHARED;
    assert(S0.uKcFillMul.value === 0.123 && S0.uKcRimMul.value === 0.456 && S0.uKcRimPow.value === 3.3 && S0.uKcLiftCeil.value === 0.9 && S0.uKcTintMul.value === 0.2,
      'R11f pokrętła `cvTuning.MODEL_FILL / RIM_GAIN / RIM_POWER / LIFT_CEIL / ENEMY_TINT` w uniformach wspólnych po jednej klatce');
    assert(eq3(ue.uKcRim.value, lin(0x2255ff)) && eq3(uo.uKcRim.value, lin(RIG.RIG_PALETTE.OWN_RIM)) && eq3(uw.uKcRim.value, [0, 0, 0]),
      'R11g pierwsza klatka: obwódka wroga w bieżącej roli `alert`, swój i wrak bez zmian');
    alertHex = 0xaa00ff; tick.call(R);
    const noRepaint = eq3(ue.uKcRim.value, lin(0x2255ff));
    themeEpochStub = 102; tick.call(R);
    assert(noRepaint && eq3(ue.uKcRim.value, lin(0xaa00ff)) && eq3(uo.uKcRim.value, lin(RIG.RIG_PALETTE.OWN_RIM)) && eq3(uw.uKcRim.value, [0, 0, 0]),
      'R11h bez zmiany epoki motywu — bez przemalowania; zmiana epoki — wróg w nowej roli `alert`, swój i wrak nietknięci');
  } finally {
    for (const [k, v] of Object.entries(keepShared)) KC.KC_SHARED[k].value = v;
  }
});

// ── R12 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ PRZECELOWANE ŚWIADOMIE (CV-Z): dawne R12b / R12c / R12e porównywały kurs i pochylenie ramy kanonicznej z dawną ścieżką bez ramy
//   (ON == OFF przy stawianiu), a R10 — Finding 625 na ścieżce OFF. Ścieżka usunięta razem z flagą `cvModels`, porównanie nie ma
//   drugiej strony; zostaje pin metod stawiania (R12a) i gałęzi kanonicznej zamiany żywego statku we wrak (R12d — `_cvTiltWreck`, bez
//   zapisów Eulera), a dziób +X (621) i kurs spoczynkowy pinuje `cv_models_logic_smoke` (T5r / T5rk, T11).
await block('R12 stawianie w ramie kanonicznej i zamiana żywego statku we wrak', async () => {
  const add3d = makeMethod('_addVesselModel3D'), addCv = makeMethod('_addVesselModelCv'), pool = makeMethod('_cvLightPool');
  const ltd = makeMethod('_cvLightTestDoc'), tilt = makeMethod('_cvTiltWreck');
  assert(!!(add3d && addCv && pool && ltd && tilt), 'R12a metody stawiania wyciągnięte ze źródła (w tym `_cvTiltWreck`)');
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const i0 = TR.indexOf("EventBus.on('vessel:wrecked'");
  const h = i0 >= 0 ? strip(TR.slice(i0, TR.indexOf('} else if (entry.sprite.material)', i0))) : '';
  const cvBranch = h.slice(h.indexOf('if (entry.canonical && entry.rig)'));
  assert(cvBranch.includes('this._cvTiltWreck(entry.sprite)') && !/rotation\.[zx]\s*=/.test(cvBranch) && !/entry\.isModel3D/.test(h),
    'R12d zamiana żywego statku we wrak: gałąź kanoniczna przez `_cvTiltWreck` (bez zapisów Eulera); gałęzi modeli bez ramy nie ma');
});

// ── R9 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
header('R9 (a) zero Math.random w całym keeperze (renderer nie rusza strumienia gry)');
assert(gameDraws === 0, `R9a losowania Math.random: ${gameDraws}`);
Math.random = _rnd;

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
