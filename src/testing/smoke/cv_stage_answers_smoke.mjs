// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_stage_answers_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3a2 „scena odpowiada” (D-CV-5, Findingi 646 (b), 638, 648 (b)).
//   Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §3.2, §4 CV-3a2.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — F11; bez pinów na stałych rysunku):
//   A1 (646 (b)) płaszczyzna kliku: `castRay` ze źródła na prawdziwym Three.js — klik w pustą przestrzeń przy kadrze walki
//      leży na wysokości statków i statek posłany w ten punkt jest rysowany POD KURSOREM; KONTROLA: dawna płaszczyzna Y = 0
//      kładła punkt ≈ 0,05 AU dalej wzdłuż promienia (plan §5 #646); kamera poniżej płaszczyzny statków — Y = 0 (jak dotąd)
//   A2 (D-CV-5) pole kliku sceny: rysowany → logiczny → rysowany = tożsamość przy stopniach 0 … 1 (prawo i skala awaryjna);
//      poza soczewką — tożsamość; stopień 0 — brak pola; wybór pola: najbliższy środek obejmujący punkt
//   A3 źródło: wszystkie trzy wejścia kliku (picker celu i patrol, prawy klik, dymek współrzędnych) przez JEDNO miejsce —
//      `GameScene._resolveClickTarget` woła `stageLogicalOf` (bez ciał i POI); `castRay` z `clickPlaneY`
//   A4 (638) klastry z pozycji LOGICZNYCH: dwa starcia w jednym miejscu — jeden klaster; daleko — dwa; karta walki: jeden
//      wiersz na klaster (widok scalony: strony, stany, log), lista bez zmian, gdy nic się nie łączy; `CombatHUD` pod flagą
//      `cvStage` — jeden „Watch” dla dwóch starć w jednym miejscu, bez flagi — dwa (dzisiejsza karta)
//   A5 (638) baner: dwa starcia klastra rozstrzygnięte w różnych chwilach — ŻADNEGO banera po pierwszym, JEDEN (scalony:
//      straty sumą, tury maks., werdykt z liczby wygranych) po drugim; KONTROLA: dwa klastry — dwa banery; starcie, które
//      skończyło się inną drogą, nie wiesza grupy; źródło: ścieżka B pod flagą przez `_clusterBattleBanners`
//   A6 (a) nic tu nie pisze stanu gry: widok scalony i scalony wynik nie mutują wejść (zamrożone obiekty)
//   A7 (648 (b)) „Obserwuj” nurkuje w kino: dopasowanie pełnej sceny (stopień 1) — dystans, przy którym stopień = 1 i
//      wszystkie statki rysowane w kadrze; KONTROLA: dopasowanie do pozycji rysowanych zatrzymuje się blisko kadru skali
//      prawdziwej (stopień ~3 %) — dlatego kino liczy się z rozwiązania sceny
//
// ⚠ Fail-first: moduł `BattleClusterLogic` i nowe funkcje powstają w tym kroku — importy dynamiczne w try/catch, każdy
//   blok łapie wyjątek: piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SL = await tryImport('../../renderer/combat/BattleStageLogic.js');
const SZ = await tryImport('../../renderer/combat/SemanticZoomLogic.js');
const CW = await tryImport('../../renderer/CombatWatchLogic.js');
const BC = await tryImport('../../ui/BattleClusterLogic.js');
const RH = await tryImport('../../utils/RaycasterHelper.js');
const RP = await tryImport('../../utils/RaycasterPure.js');
const ST = await tryImport('../../debug/CvBattleStager.js');
const HUD = await tryImport('../../ui/CombatHUD.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const call = (mod, name, ...a) => (typeof mod?.[name] === 'function' ? mod[name](...a) : undefined);
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const AU = GAME_CONFIG.AU_TO_PX, WS = 10, AUWU = AU / WS, L = 0.016;

// ── kamera kadru walki (kąty jak kontroler: theta 0,3, phi 63° od pionu ⇒ 27° nad płaszczyzną) ────────────────────
function camAt(target, d, { theta = 0.3, phi = 63 * Math.PI / 180, W = 1600, H = 1041 } = {}) {
  const cam = new THREE.PerspectiveCamera(55, W / H, 0.001, 5000);
  cam.position.set(target.x + d * Math.sin(phi) * Math.cos(theta), target.y + d * Math.cos(phi), target.z + d * Math.sin(phi) * Math.sin(theta));
  cam.lookAt(target.x, target.y, target.z); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return cam;
}
const toScreen = (cam, p, W = 1600, H = 1041) => { const v = new THREE.Vector3(p.x, p.y, p.z).project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };

// `castRay` ze źródła z prawdziwym Three.js (moduł importuje `three` bez ścieżki — pod node to pusta atrapa)
function castRayFromSource() {
  const src = read('src/utils/RaycasterHelper.js');
  const i = src.indexOf('export function castRay(');
  if (i < 0) return null;
  const sig = src.indexOf(') {\n', i), end = src.indexOf('\n}\n', sig);
  const params = src.slice(src.indexOf('(', i) + 1, sig), body = src.slice(sig + 4, end);
  return new Function('THREE', 'findKosmosNode', 'clickPlaneY', `return function castRay(${params}) {\n${body}\n};`)(
    THREE, RP?.findKosmosNode ?? (() => null), RH?.clickPlaneY ?? (() => 0));
}

// ═══ A1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('A1 — (646 (b)) płaszczyzna kliku na wysokości statków', () => {
  const castRay = castRayFromSource();
  const W = 1600, H = 1041;
  const target = { x: 3, y: 0.3, z: -2 };
  const cam = camAt(target, 0.6);                       // kadr walki: ~0,6 j., 27° nad płaszczyzną
  const ray = new THREE.Raycaster();
  const scene = new THREE.Scene();
  const cursor = { x: 1010, y: 410 };
  const ndc = { x: cursor.x / W * 2 - 1, y: -(cursor.y / H) * 2 + 1 };
  const { worldPoint: wp } = castRay(ndc, cam, scene, ray);
  const back = toScreen(cam, { x: wp.x, y: 0.3, z: wp.z });
  const err = Math.hypot(back.x - cursor.x, back.y - cursor.y);
  assert(RH?.SHIP_PLANE_Y === 0.3 && Math.abs(wp.y - 0.3) < 1e-12 && err < 1e-6,
    `A1a SEDNO: punkt kliku na Y = 0,3 i statek posłany w ten punkt rysowany POD KURSOREM (${err.toExponential(1)} px)`);
  // KONTROLA: dawna płaszczyzna Y = 0 — promień przez ŚRODEK kadru (plan §5 #646: 0,3 · tg 63° ≈ 0,59 j. ≈ 0,054 AU); statek
  // posłany w dawny punkt rysowany na Y = 0,3 nad nim — daleko od kursora
  // (czysta geometria, niezależna od `castRay` — kontrola zielona przed krokiem i po nim)
  const mid = { x: W / 2, y: H / 2 };
  const ndcM = { x: 0, y: 0 };
  ray.setFromCamera(ndcM, cam);
  const p0 = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p0);
  const p3 = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), p3);
  const offAU = Math.hypot(p0.x - p3.x, p0.z - p3.z) / AUWU;
  const back0 = toScreen(cam, { x: p0.x, y: 0.3, z: p0.z });
  assert(offAU > 0.050 && offAU < 0.057 && Math.hypot(back0.x - mid.x, back0.y - mid.y) > 100,
    `A1b KONTROLA: dawna płaszczyzna Y = 0 — punkt ${offAU.toFixed(4)} AU dalej wzdłuż promienia środka (plan: ≈ 0,054), statek ${Math.hypot(back0.x - mid.x, back0.y - mid.y).toFixed(0)} px od kursora`);
  // kamera poniżej płaszczyzny statków (zbliżenie ciała) — płaszczyzna orbit, jak dotąd
  const low = camAt({ x: 0, y: 0, z: 0 }, 0.3);         // cel na ciele (Y = 0), kamera ~0,14 j. nad płaszczyzną
  const r2 = castRay({ x: 0.1, y: -0.2 }, low, scene, ray);
  assert(low.position.y < 0.3 && r2.worldPoint.y === 0 && call(RH, 'clickPlaneY', 5) === 0.3 && call(RH, 'clickPlaneY', 0.2) === 0,
    'A1c kamera poniżej płaszczyzny statków — klik na płaszczyźnie orbit Y = 0 (bez punktu za kamerą)');
});

// ═══ A2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('A2 — (D-CV-5) pole kliku sceny: odwrotność i soczewka', () => {
  const c = { x: 3, z: -2 }, rIn = 1.3;
  let worst = 0, n = 0;
  for (const scale of [null, 0.08]) for (const blend of [0, 0.25, 0.5, 0.75, 1]) for (const r of [0.01, 0.4, 1.0, 1.29, 1.31, 2.4, 3.8, 3.95, 6]) for (const a of [0, 1.3, 4]) {
    const f = { centre: c, rIn, blend, scale };
    const p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
    const d = SL.stagePointDrawn(p, f), q = SL.stagePointLogical(d, f);
    worst = Math.max(worst, Math.hypot(q.x - p.x, q.z - p.z)); n++;
  }
  assert(n === 270 && worst < 1e-9, `A2a SEDNO: rysowany → logiczny → rysowany = tożsamość (${n} punktów, prawo i skala awaryjna, stopnie 0–1; błąd ${worst.toExponential(1)} j.)`);
  const f1 = { centre: c, rIn, blend: 1 };
  const out = SL.stagePointLogical({ x: c.x + 3.95, z: c.z }, f1), inn = SL.stagePointLogical({ x: c.x + 0.08, z: c.z }, f1);
  assert(Math.abs(out.x - (c.x + 3.95)) < 1e-12 && inn.x - c.x > 0.5,
    `A2b poza soczewką (≥ 3 rIn) — tożsamość; w scenie klik 0,08 j. od środka = ${(inn.x - c.x).toFixed(3)} j. bez sceny (prawo)`);
  const fields = [{ id: 'a', centre: { x: 0, z: 0 }, rIn: 1, blend: 1 }, { id: 'b', centre: { x: 2.5, z: 0 }, rIn: 1, blend: 1 }, { id: 'z', centre: { x: 1.2, z: 0 }, rIn: 1, blend: 0 }];
  assert(SL.pickStageField(fields, { x: 1.6, z: 0 })?.id === 'b' && SL.pickStageField(fields, { x: 0.5, z: 0 })?.id === 'a'
    && SL.pickStageField(fields, { x: 9, z: 0 }) === null,
    'A2c wybór pola: najbliższy środek, którego soczewka obejmuje punkt; pole przy stopniu 0 nie istnieje; daleko — brak');
});

// ═══ A3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('A3 — źródło: jedno miejsce kliku, płaszczyzna statków w `castRay`', () => {
  const gs = strip(read('src/scenes/GameScene.js'));
  const i = gs.indexOf('\n  _resolveClickTarget(');
  const body = i >= 0 ? gs.slice(i, gs.indexOf('\n  }\n', i)) : '';
  assert(/stageLogicalOf\?\.\(window\.KOSMOS\?\.activeSystemId \?\? null, target\.worldPoint\.x, target\.worldPoint\.z\)/.test(body)
    && /target\.type !== 'planet' && target\.type !== 'poi'/.test(body),
    'A3a `_resolveClickTarget` odwraca punkt kliku przez scenę (`stageLogicalOf`), z pominięciem ciał i POI');
  const uses = (gs.match(/this\._resolveClickTarget\(/g) ?? []).length;
  assert(uses >= 3 && !/castRay\(/.test(gs.replace(body, '')),
    `A3b NIEZMIENNIK (prawdziwy także przed krokiem): wszystkie wejścia kliku przez \`_resolveClickTarget\` (${uses} wywołań), \`castRay\` tylko tam`);
  const rh = strip(read('src/utils/RaycasterHelper.js'));
  assert(/const planeY = clickPlaneY\(camera\?\.position\?\.y\)/.test(rh) && /new THREE\.Plane\(new THREE\.Vector3\(0, 1, 0\), -planeY\)/.test(rh)
    && !/new THREE\.Plane\(new THREE\.Vector3\(0, 1, 0\), 0\)/.test(rh),
    'A3c `castRay`: płaszczyzna kliku z `clickPlaneY` (statki 0,3), bez dawnej stałej płaszczyzny Y = 0');
});

// ── starcia atrapy: pozycje logiczne uczestników (px rozgrywki) ───────────────────────────────────────────────────
function mkEnc(id, { at, n = 2, sys = 'sys_v', sideBOwner = 'emp_t', rounds = 3, pos }) {
  const ids = [];
  const a = [], b = [];
  for (let i = 0; i < n; i++) {
    const va = `${id}_a${i}`, vb = `${id}_b${i}`;
    a.push(va); b.push(vb);
    pos.set(va, { x: at.x - 0.03 * AU, y: at.y + i * 0.01 * AU });
    pos.set(vb, { x: at.x + 0.03 * AU, y: at.y + i * 0.01 * AU });
    ids.push(va, vb);
  }
  const states = new Map(ids.map((v, k) => [v, { hp: 50 + k, hpStart: 100, weapons: [{ moduleId: 'weapon_kinetic' }] }]));
  const timeline = [];
  for (let r = 1; r <= rounds; r++) timeline.push({ round: r, distanceAU: 0.06, events: [{ attacker: a[0], target: b[0], weapon: 'weapon_kinetic', hit: true, damage: 10, blockedByShield: 0 }] });
  return { id, isActive: true, currentRound: rounds, timeline, location: { systemId: sys, planetId: null, point: { ...at } },
    sideA: { vesselIds: a, joinedVesselIds: [], ownerEmpireId: 'player', label: `Gracz (${n})` },
    sideB: { vesselIds: b, joinedVesselIds: [], ownerEmpireId: sideBOwner, label: `Wróg (${n})` }, vesselStates: states };
}

// ═══ A4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('A4 — (638) klastry z pozycji logicznych, karta: jeden wiersz na klaster', () => {
  const pos = new Map();
  const getPos = (id) => pos.get(id) ?? null;
  const e1 = mkEnc('encounter_a', { at: { x: 200, y: 100 }, pos }), e2 = mkEnc('encounter_b', { at: { x: 200, y: 100 + 0.15 * AU }, pos, rounds: 5 });
  const e3 = mkEnc('encounter_c', { at: { x: 200 + 1.0 * AU, y: 100 }, pos });
  const radius = BC.clusterRadiusPx(AU);
  const cl = SL.encounterClusters([e2, e1, e3], getPos, radius);
  assert(cl.length === 2 && cl[0].id === 'encounter_a' && cl[0].encounterIds.join() === 'encounter_a,encounter_b' && cl[1].encounterIds.join() === 'encounter_c',
    `A4a 0,15 AU — jeden klaster (id = najmniejsze id starcia), 1 AU — osobny (${cl.map((c) => c.encounterIds.join('+')).join(' · ')})`);
  const rows = BC.combatCardRows([e1, e2, e3], { getPos, radius, labelFor: (o, n) => `${o}:${n}` });
  const m = rows[0];
  assert(rows.length === 2 && m.clusterEncounterIds?.join() === 'encounter_a,encounter_b' && m.sideA.vesselIds.length === 4 && m.vesselStates.size === 8
    && m.sideA.label === 'player:4' && m.currentRound === 5 && m.timeline.length === 8 && m.timeline[m.timeline.length - 1].round === 5 && rows[1] === e3,
    `A4b karta: 3 starcia → 2 wiersze; wiersz scalony — strony (4 + 4), stany (8), runda maks. (5), log wyrównany do końca (8 rund), etykieta z tłumaczenia; pojedyncze starcie bez zmian`);
  const far = BC.combatCardRows([e1, e3], { getPos, radius });
  assert(far.length === 2 && far[0] === e1 && far[1] === e3, 'A4c KONTROLA: nic się nie łączy — lista wejściowa bez zmian (te same obiekty, ta sama kolejność)');
  // `CombatHUD` — prawdziwy `draw` na atrapie kanwy: pod flagą jeden „Watch” dla dwóch starć w jednym miejscu, bez flagi — dwa
  const vessels = new Map([...pos.keys()].map((id) => [id, { id, name: id, hullId: 'hull_frigate', position: pos.get(id) }]));
  const ctx = { font: '10px monospace', textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '', strokeStyle: '', lineWidth: 1,
    measureText(s) { return { width: String(s).length * 6 }; }, fillText() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, save() {}, restore() {}, rect() {}, clip() {} };
  window.KOSMOS = { civMode: true, activeSystemId: 'sys_v', deepSpaceCombatSystem: { listActive: () => [e1, e2] },
    vesselManager: { _vessels: vessels, getVessel: (id) => vessels.get(id) ?? null }, starSystemManager: { getAllSystems: () => [] },
    tacticalDock: { getReservedHeight: () => 0 }, empireRegistry: { get: () => ({ name: 'Liga' }) } };
  // CV-Z — przecelowane świadomie: wariant „bez flagi `cvStage`” (karta na starcie) usunięty razem z flagą.
  const hudOn = new HUD.CombatHUD(); hudOn.draw(ctx, 1600, 1041);
  assert(hudOn._watchBtns.length === 1 && hudOn._watchBtns[0].encounterId === 'encounter_a',
    `A4d \`CombatHUD\`: dwa starcia w jednym miejscu — ${hudOn._watchBtns.length} „Watch” (klaster, kamera kadruje oba)`);
});

// ═══ A5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('A5 — (638) jeden baner na klaster', () => {
  const bd = (id, winner, la, lb, turns) => Object.freeze({ battleId: id.replace('encounter_', 'battle_ds_'), source: 'dscs', playerSide: 'A',
    aggressorName: 'Gracz', defenderName: 'Liga', result: Object.freeze({ id: id.replace('encounter_', 'battle_ds_'), winner, lossesA: la, lossesB: lb, turns }) });
  const active = new Set(['encounter_a', 'encounter_b']);
  const hold = [];
  // pierwsze starcie klastra rozstrzygnięte, drugie trwa
  const s1 = BC.clusterBannerStep(hold, { encounterId: 'encounter_a', battleData: bd('encounter_a', 'A', 1, 2, 7), peerIds: ['encounter_b'], isActive: (id) => active.has(id) && id !== 'encounter_a' });
  active.delete('encounter_a');
  const s2 = BC.clusterBannerStep(hold, { encounterId: 'encounter_b', battleData: bd('encounter_b', 'B', 3, 1, 12), peerIds: [], isActive: (id) => active.has(id) && id !== 'encounter_b' });
  const m = s2?.[0];
  assert(Array.isArray(s1) && s1.length === 0 && s2?.length === 1 && hold.length === 0,
    `A5a SEDNO: po pierwszym starciu klastra — ${s1?.length} banerów, po drugim — ${s2?.length} (grupa zwolniona)`);
  assert(m?.result?.lossesA === 4 && m.result.lossesB === 3 && m.result.turns === 12 && m.result.winner === 'B' && m.clusterSize === 2
    && m.result.clusterBattleIds?.join() === 'battle_ds_a,battle_ds_b',
    `A5b wynik scalony: straty sumą (4 / 3), tury maks. (12), werdykt: 1 wygrana : 1 przegrana → mniejsze straty — przeciwnik (${m?.result?.winner})`);
  // KONTROLA: dwa klastry (bez wspólnego czekania) — dwa banery
  const h2 = [];
  const k1 = BC.clusterBannerStep(h2, { encounterId: 'encounter_x', battleData: bd('encounter_x', 'A', 0, 2, 5), peerIds: [], isActive: () => false });
  const k2 = BC.clusterBannerStep(h2, { encounterId: 'encounter_y', battleData: bd('encounter_y', 'A', 1, 1, 6), peerIds: [], isActive: () => false });
  assert(k1.length === 1 && k2.length === 1 && k1[0].result.winner === 'A' && k1[0].clusterSize === undefined,
    'A5c KONTROLA: dwa klastry — dwa banery (wynik pojedynczego starcia bez zmian)');
  // starcie, na które grupa czeka, skończyło się inną drogą — grupa wychodzi przy następnym kroku, nie wisi
  const h3 = [];
  BC.clusterBannerStep(h3, { encounterId: 'encounter_p', battleData: bd('encounter_p', 'A', 0, 1, 4), peerIds: ['encounter_q'], isActive: (id) => id === 'encounter_q' });
  const k3 = BC.clusterBannerStep(h3, { encounterId: 'encounter_r', battleData: bd('encounter_r', 'A', 0, 0, 2), peerIds: [], isActive: () => false });
  assert(k3.length === 2 && h3.length === 0, `A5d grupa czekająca na starcie zakończone inną drogą wychodzi przy następnym kroku (${k3.length} banery, czekających ${h3.length})`);
  const gs = strip(read('src/scenes/GameScene.js'));
  assert(/battleData\.source === 'dscs'\)\s*\?\s*this\._clusterBattleBanners\(battleData\)\s*:\s*\[battleData\]/.test(gs) && !/FEATURES\?\.cvStage/.test(gs)
    && /_clusterBattleBanners\(battleData\) \{[\s\S]*?clusterPeerIds\([\s\S]*?clusterBannerStep\(this\._battleClusterHold/.test(gs),
    'A5e źródło: ścieżka B (deep-space) przez `_clusterBattleBanners` (`clusterPeerIds` + `clusterBannerStep`); CV-Z — bez flagi `cvStage`');
});

// ═══ A6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('A6 — (a) widok scalony i wynik scalony nie piszą wejść', () => {
  const pos = new Map();
  const freeze = (e) => { Object.freeze(e.sideA); Object.freeze(e.sideB); Object.freeze(e.timeline); Object.freeze(e.location); return Object.freeze(e); };
  const e1 = freeze(mkEnc('encounter_a', { at: { x: 0, y: 0 }, pos })), e2 = freeze(mkEnc('encounter_b', { at: { x: 0, y: 5 }, pos }));
  const v = BC.mergeEncounterView([e2, e1]);
  const r = BC.mergeClusterBattles([Object.freeze({ battleId: 'b1', playerSide: 'A', result: Object.freeze({ winner: 'A', lossesA: 1, lossesB: 2, turns: 3 }) }),
    Object.freeze({ battleId: 'b2', playerSide: 'A', result: Object.freeze({ winner: 'A', lossesA: 0, lossesB: 1, turns: 4 }) })]);
  assert(v?.id === 'encounter_a' && e1.sideA.vesselIds.length === 2 && r?.result?.winner === 'A' && r.result.lossesB === 3,
    'A6 zamrożone wejścia — widok scalony i wynik scalony bez zapisu do starć ani wyników (tryb ścisły modułu ES rzuciłby wyjątek)');
});

// ═══ A7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('A7 — (648 (b)) „Obserwuj” nurkuje w kino: dopasowanie pełnej sceny', () => {
  const layout = ST.cvBattleLayout({ nA: 10, nB: 10 }).ships;
  const base = layout.map((s) => ({ id: s.name, side: s.side, x: s.dxAU * AUWU, y: 0.3, z: s.dyAU * AUWU }));
  const edges = SL.bandEdgesWU([GAME_CONFIG.WEAPON_SHORT_AU, GAME_CONFIG.WEAPON_MED_AU, GAME_CONFIG.WEAPON_LONG_AU], AUWU);
  const c = { x: 0, y: 0.3, z: 0 };
  const sol = SL.solveStage({ points: base, centre: c, L, edges });
  const staged = base.map((q) => sol.pos.get(q.id));
  const W = 1600, H = 1041, fov = 55, theta = 0.3, phi = 1.1;
  const safe = CW.watchSafeRect({ W, H, uiScale: 1.25, hudRect: { x: 360, y: 466, w: 560, h: 320 }, topBarH: 32, bottomH: 40, rightW: 150, leftW: 150 });
  const fitAt = (pts) => CW.fitWatchFrameOffset({ points: pts, pivot: CW.centroidOf(pts), theta, phi, fovDeg: fov, aspect: W / H, W, H, safe });
  const blendAt = (d) => SZ.stageBlend(SZ.lengthPx({ length: L, depth: d, fovDeg: fov, H }));
  const drawnAt = (b) => base.map((q, i) => ({ x: q.x + (staged[i].x - q.x) * b, y: q.y + (staged[i].y - q.y) * b, z: q.z + (staged[i].z - q.z) * b }));
  const cinema = fitAt(staged), trueFit = fitAt(base);
  const inFrame = (pts, d) => {
    const pv = CW.centroidOf(pts);
    const r = CW.viewOffsetFrame({ points: pts, pivot: pv, d, theta, phi, fovDeg: fov, aspect: W / H, W, H, safe });
    return r?.ok === true;
  };
  assert(cinema?.fits && blendAt(cinema.dist) >= 0.999 && inFrame(drawnAt(blendAt(cinema.dist)), cinema.dist) && cinema.dist < trueFit.dist / 4,
    `A7a PRZESŁANKA (prawdziwa także przed krokiem): dopasowanie pełnej sceny — ${cinema?.dist?.toFixed(3)} j., stopień ${blendAt(cinema?.dist).toFixed(3)}, cała bitwa w kadrze; kadr skali prawdziwej ${trueFit?.dist?.toFixed(3)} j. (renderer — A7c i \`cv_stage_render_smoke\` R16)`);
  // KONTROLA: dopasowanie do pozycji RYSOWANYCH (stopień z dystansu) z kadru skali prawdziwej — punkt stały blisko tego kadru
  let d = trueFit.dist;
  for (let k = 0; k < 200; k++) d = fitAt(drawnAt(blendAt(d))).dist;
  assert(d > trueFit.dist * 0.8 && blendAt(d) < 0.1,
    `A7b KONTROLA: dopasowanie do pozycji rysowanych zatrzymuje się na ${d.toFixed(3)} j. (stopień ${blendAt(d).toFixed(3)}) — samo nie nurkuje`);
  const tr = strip(read('src/renderer/ThreeRenderer.js'));
  const i = tr.indexOf('\n  _stageWatchFit(');
  const body = i >= 0 ? tr.slice(i, tr.indexOf('\n  }\n', i)) : '';
  assert(/this\._stageMarks\.get\(id\)\?\.w \?\? 0/.test(body) && /let fit = staged \? fitAt\(staged\) : null;/.test(body) && /if \(!fit\) fit = fitAt\(base\);/.test(body),
    'A7c źródło: kadr z pozycji sceny × wejście statku (w pauzie przed wejściem — skala prawdziwa), bez sceny (bitwa przy ciele) — skala prawdziwa');
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
