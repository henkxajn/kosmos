// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv3c_nozzle_slots_smoke — KEEPER Findingu 709 (ARC COMBAT VISUALS, krok CV-3c; kontrola właściciela 2026-11-13, decyzja 45).
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §3.2-45, §5 #709.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// DEFEKT: w paradzie `cvParade` CV-P01 (fregata niewarpowa) bez żadnego wylotu dysz, CV-P13 (fregata warp) — bardzo dobrze.
// PRZYCZYNA (zmierzona w grze): dane dysz WSZYSTKICH 24 slotów są poprawne (dysza na tylnej ścianie bbox, promień 0,02–0,12,
//   niezasłonięta od tyłu). Wyloty startują ukryte (`buildNozzleGlows` — `group.visible = false`), a poza walką zapalał je wyłącznie
//   `_applyExhaust` przy AKTUALIZACJI POZYCJI (gra w ruchu). Model GLB dochodzi asynchronicznie — rig powstaje już po ostatnim
//   `_applyExhaust` — więc statek, którego model doszedł na PAUZIE (parada startuje na pauzie; także wczytanie, przebudowa po zmianie
//   presetu, zmiana układu), nie miał wylotu do wznowienia gry. Statek warp „wyglądał dobrze”, bo jego tekstura ma świecący cyjanowy
//   pierścień dyszy (emisja koloru-klucza modelu) — niewarpowy nie ma żadnej.
// NAPRAWA: `_addVesselModelCv` stosuje stan wylotu (`_applyExhaust`) od razu po rigu (flaga `cvChoreo2`); `resolveNozzles` — dysza z pliku
//   na swoim miejscu (brakujący promień — z przekroju kadłuba, brakujący kierunek — za rufę), slot bez użytecznej dyszy — dysza z RUFY.
// CO PINUJE:
//   N1 każdy z 24 slotów parady (`cvParadeLayout`, pliki hardpointów z repo) rozwiązuje ≥ 1 dyszę: pozycja i kierunek skończone,
//      promień > 0, na rufie (rzut na kierunek za rufę ≥ 0,4) i skierowana za rufę
//   N2 zapas z rufy: brak dysz / pozycja NaN — jedna dysza na środku tylnej ściany bbox, kierunek −dziób, promień z przekroju > 0;
//      dziób +X (`nonwarp_large_science`) — rufa po −X; poprawna pozycja bez promienia / kierunku — pozycja zostaje
//   N3 SEDNO 709 — PRAWDZIWE `_addVesselModelCv` (model dochodzi, gra na PAUZIE, bez żadnej aktualizacji pozycji): każdy z 24 slotów ma
//      ≥ 1 wylot o promieniu > 0 i jest on WIDOCZNY od razu; KONTROLA — flaga `cvChoreo2` OFF: wyloty schowane (ścieżka CV-5 bez zmian)
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
const STG = await tryImport('../../debug/CvBattleStager.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = async (title, fn) => { header(title); try { await fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');

const SLOTS = (STG?.cvParadeLayout?.() ?? []).map((s) => s.key);
const docOfSlot = (slot) => JSON.parse(read(`assets/models/ships/hardpoints/${slot}.json`));
const tex = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
const makeTemplate = () => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.16, 0.24), new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex })));
  return g;
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ═══ N1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
await block('N1 — 24 sloty parady: plik hardpointów rozwiązuje ≥ 1 dyszę na rufie (promień > 0, kierunek za rufę)', () => {
  assert(SLOTS.length === 24 && new Set(SLOTS).size === 24, `N1-0 ŚWIADEK: parada ma 24 różne sloty (${SLOTS.length})`);
  const bad = [];
  for (const slot of SLOTS) {
    const hp = docOfSlot(slot);
    const list = RIG?.resolveNozzles?.(hp, { h: [0.5, 0.08, 0.12] }) ?? [];
    const bow = hp.frame?.bow ?? [-1, 0, 0];
    const aft = [-bow[0], -bow[1], -bow[2]];
    const ok = list.length >= 1 && list.every((n) => n.p.every(Number.isFinite) && n.d.every(Number.isFinite) && n.r > 0
      && dot(n.p, aft) >= 0.4 && dot(n.d, aft) / Math.hypot(...n.d) >= 0.7);
    if (!ok) bad.push(slot);
  }
  assert(bad.length === 0, `N1a każdy slot: dysza na rufie, promień > 0, kierunek za rufę${bad.length ? ' — źle: ' + bad.join(', ') : ''}`);
});

// ═══ N2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
await block('N2 — zapas z rufy kadłuba, gdy slot nie ma użytecznej dyszy', () => {
  const B = { h: [0.5, 0.08, 0.12] };
  const none = RIG.resolveNozzles({ frame: { bow: [-1, 0, 0] }, nozzles: [] }, B);
  const nan = RIG.resolveNozzles({ frame: { bow: [-1, 0, 0] }, nozzles: [{ p: [NaN, 0, 0], d: [1, 0, 0], r: 0.05 }] }, B);
  const missing = RIG.resolveNozzles({ frame: { bow: [-1, 0, 0] } }, B);
  const plusX = RIG.resolveNozzles({ frame: { bow: [1, 0, 0] }, nozzles: [] }, B);
  const keepP = RIG.resolveNozzles({ frame: { bow: [-1, 0, 0] }, nozzles: [{ p: [0.48, 0.01, 0] }] }, B);
  const stern = (l, x) => l.length === 1 && l[0].fallback === true && Math.abs(l[0].p[0] - x) < 1e-12 && l[0].p[1] === 0 && l[0].p[2] === 0 && l[0].r > 0;
  assert(stern(none, 0.5) && stern(nan, 0.5) && stern(missing, 0.5) && none[0].d[0] === 1,
    `N2a brak dysz / pozycja NaN / brak listy — jedna dysza na środku tylnej ściany (x = 0,5), kierunek +X, promień ${none[0]?.r?.toFixed?.(3)} > 0`);
  assert(stern(plusX, -0.5) && plusX[0].d[0] === -1, 'N2b dziób +X (nonwarp_large_science) — rufa po −X, kierunek −X');
  assert(keepP.length === 1 && keepP[0].fallback === false && keepP[0].p[0] === 0.48 && keepP[0].r > 0 && keepP[0].d[0] === 1,
    'N2c poprawna pozycja bez promienia i kierunku — pozycja z pliku zostaje, promień z przekroju, kierunek za rufę');
});

// ═══ N3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
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
  'REST_YAW_CANONICAL', 'wreckTiltQuaternion', 'paintRigRim', 'themeEpoch', 'NOZZLE_KEY_HEX'];
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  try {
    return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(
      THREE, S, GAME_CONFIG, globalThis.window, isEnemyVessel, HP?.slotOfModelPath, RIG?.buildShipRig, RIG?.disposeShipRig, RIG?.paintRigMaterials,
      vesselTargetSize, exhaustGradientColors, exhaustIntensityRaw, FX_HDR_EXHAUST, HP?.yawToward, HP?.orbitYaw, HP?.bankRoll, rendererRandom,
      RIG?.lightTestPattern, HP?.SHIP_MODEL_DIR, HP?.INCOMING_DIR, VESSEL_MODEL_DEFAULT, LP?.LightPointPool, () => true, globalThis.performance, console, KC?.KC_SHARED,
      HP?.REST_YAW_CANONICAL, HP?.wreckTiltQuaternion, RIG?.paintRigRim, () => 1, RIG?.NOZZLE_KEY_HEX ?? 0x7ff4ff);
  } catch (e) { console.log(`    (budowa ${name}: ${e.message})`); return null; }
}
// Parada na pauzie: każdy slot stawiany prawdziwym `_addVesselModelCv` (model i hardpointy z pliku dochodzą asynchronicznie), bez żadnej
// aktualizacji pozycji potem — odczyt wylotów zaraz po dojściu modelu.
async function paradeRun(choreo2) {
  const F = GAME_CONFIG.FEATURES; const keep = { cvModels: F.cvModels, fcCombatFx: F.fcCombatFx, cvChoreo2: F.cvChoreo2 };
  const tick = () => new Promise((r) => (globalThis.__origSetTimeout ?? setTimeout)(r, 1));
  const R = {
    THREE, scene: new THREE.Scene(), _vessels: new Map(), _missingModelPaths: new Set(), _shipLightPool: null, _cvLightTest: false,
    _planets: new Map(), _moons: new Map(), _planetoids: new Map(), _entityByUUID: new Map(), _getEntityRadius: () => 0.05,
    cvTuning: ENG?.LIVE_CV_FX ?? {}, _stageClock: null,
    _shipHardpoints: new HP.ShipHardpointsCache({ fetchJson: async (url) => { const m = String(url).match(/hardpoints\/([a-z0-9_]+)\.json$/); return m ? docOfSlot(m[1]) : null; }, warn: () => {} }),
    _loadShipModel: () => Promise.resolve(makeTemplate()),
    _applyVesselIntelVisibility: () => {}, _applyPendingVesselFocus: () => {}, _addVesselSpriteFallback: () => {},
  };
  for (const n of ['_addVesselModelCv', '_cvLightPool', '_cvLightTestDoc', '_cvTiltWreck', '_applyExhaust', '_nozzleGlowSet', '_applyVesselMaintenanceTint']) {
    const fn = makeMethod(n); if (fn) R[n] = fn;
  }
  window.KOSMOS = { observatorySystem: { isVesselDetected: () => true }, vesselManager: { isImmobilized: () => false } };
  const out = [];
  try {
    F.cvModels = true; F.fcCombatFx = true; F.cvChoreo2 = choreo2;
    SLOTS.forEach((slot, i) => {
      const v = { id: `p${i}`, name: `CV-P${String(i + 1).padStart(2, '0')}`, shipId: 'hull_frigate', position: { x: 100 + i, y: 50, state: 'in_transit' },
        mission: { targetX: 400, targetY: 50, phase: 'outbound' } };
      R._addVesselModelCv(v, `assets/models/ships/${slot}.glb`);
    });
    for (let k = 0; k < 6; k++) await tick();
    SLOTS.forEach((slot, i) => {
      const e = R._vessels.get(`p${i}`);
      const gl = e?.rig?.glows ?? [];
      out.push({ slot, glows: gl.length, minR: gl.length ? Math.min(...gl.map((g) => g.r)) : 0, visible: gl.filter((g) => g.group.visible).length, cone: !!e?.exhaust?.visible });
    });
  } finally { Object.assign(F, keep); }
  return out;
}
await block('N3 — SEDNO 709: prawdziwe `_addVesselModelCv` na PAUZIE — każdy slot ma widoczny wylot od razu', async () => {
  const on = await paradeRun(true), off = await paradeRun(false);
  const noGlow = on.filter((s) => !(s.glows >= 1 && s.minR > 0)), hidden = on.filter((s) => s.visible < 1);
  console.log(`     ON: sloty ${on.length}, bez wylotu ${noGlow.length}, ukryte ${hidden.length}; OFF: widoczne ${off.filter((s) => s.visible > 0).length}`);
  assert(on.length === 24 && noGlow.length === 0, `N3a każdy z 24 slotów ma ≥ 1 wylot o promieniu > 0${noGlow.length ? ' — brak: ' + noGlow.map((s) => s.slot).join(', ') : ''}`);
  assert(on.length === 24 && hidden.length === 0 && on.every((s) => !s.cone),
    `N3b SEDNO: wylot WIDOCZNY od razu po dojściu modelu na pauzie (bez aktualizacji pozycji), stożek schowany${hidden.length ? ' — ukryte: ' + hidden.map((s) => s.slot).join(', ') : ''}`);
  assert(off.length === 24 && off.every((s) => s.visible === 0), 'N3c KONTROLA: `cvChoreo2` OFF — wyloty schowane (ścieżka CV-5 bez zmian)');
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
