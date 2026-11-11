// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_plume_origin_smoke — KEEPER ARC COMBAT VISUALS, poprawka po łącznej kontroli właściciela CV-1b + CV-1c (2026-11-11, uwaga 1:
// „smuga nie wychodzi z dyszy, którą kliknąłem"). Logika — F11, bez pinów na stałych rysunku.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// DIAGNOZA (zmierzona w grze, fixture GATE-S4, plik właściciela): wierzchołek smugi leżał DOKŁADNIE w dyszy z pliku (błąd 0 L,
// kierunek cos 1) — transformacja była poprawna. Wadą był PUNKT: klik „w wylot" trafiał ścianę tunelu pierścienia warp
// (0,4296; −0,0239; −0,0045 — 0,024 pod osią, normalna ku osi), bo środek otworu to pustka; plus rama z „górą" przestawioną na +Z
// (statek na boku). Poprawki: Workshop centruje dyszę w ujściu otworu, dziób nie rusza „góry" (cv_workshop_logic_smoke W12–W13).
// Ten keeper pinuje NIEZMIENNIK, o który prosił właściciel: początek smugi == punkt dyszy przeniesiony do świata (± ε) dla dyszy
// NIEDOMYŚLNEJ, w pełnym łańcuchu przekształceń gry (rama pliku → kwaternion ramy → choreografia premnoży `canon` → skala klasy →
// wrapper z kursem i pozycją) i po skalowaniu smugi jak `_applyExhaust` — oraz to, że nic po drodze nie przesuwa stożka.
//
// CO PINUJE:
//   P1 wierzchołek stożka smugi w świecie = `canon.localToWorld(nozzles[0].p)`, oś smugi = `nozzles[0].d` obrócone jak `canon` —
//      dla 4 ram (w tym zepsutej ramy właściciela z „górą" +Z), dysz niedomyślnych (poza osią), dowolnej choreografii i wrappera.
//   P2 skalowanie smugi jak `_applyExhaust` / `_choreoExhaust` (`scale = (r, L, r)`) nie rusza wierzchołka; koniec smugi = wierzchołek
//      + d · L · rozmiar klasy. P3 geometria stożka: wierzchołek w początku układu stożka (y = 0), podstawa w y = −1.
//      KONTROLA: stożek bez przesunięcia geometrii (wierzchołek w +0,5) przesuwa wierzchołek przy skalowaniu — warunek P2 go odrzuca.
//   P4 źródło: `_applyExhaust` i `_choreoExhaust` (gra) oraz pętla Workshopu ustawiają smudze skalę / krycie / widoczność, NIGDY
//      pozycji ani obrotu (wierzchołek zostaje tam, gdzie postawił go rig).
// ⚠ Fail-first na HEAD: P1–P3 przechodzą także przed poprawką — tak ma być (transformacja nie była wadą; keeper strzeże jej odtąd).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const header = (t) => console.log('\n' + t);
const section = async (name, fn) => { header(name); try { await fn(); } catch (e) { fail++; console.log(`  ✗ ${name}: wyjątek ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`); } };
const tryImport = async (rel) => { try { return await import(new URL(rel, import.meta.url).href); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const THREE = await tryImport('../../lib/three.module.js');
const RIG = await tryImport('../../renderer/ShipModelRig.js');
const ROOT = new URL('../../../', import.meta.url);

const doc = (frame, nozzle) => ({
  schema: 'kosmos-ship-hardpoints', version: 1, slot: 't', source: { file: 't.glb', sha256: null, normalizer: null },
  frame, nozzles: [nozzle], weapons: [], lights: [],
  keyColour: { mode: 'none', hue: 182, hueTol: 12, satMin: 0.45, valMin: 0.55, soft: 0.06, gain: 3.5 }, damagePoints: 'auto',
});
const template = () => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.2), new THREE.MeshStandardMaterial());
  g.add(m);
  return g;
};
const EXH = { gradient: { apex: { r: 1, g: 1, b: 1 }, base: { r: 0, g: 0, b: 1 } }, hdr: 4.5 };
const near = (a, b, eps) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= eps;

const FRAMES = [
  ['dziób −X, góra +Y (modele właściciela)', { bow: [-1, 0, 0], up: [0, 1, 0] }],
  ['dziób −X, góra +Z (rama zepsuta klikiem dziobu)', { bow: [-1, 0, 0], up: [0, 0, 1] }],
  ['dziób +X (nonwarp_large_science)', { bow: [1, 0, 0], up: [0, 1, 0] }],
  ['dziób +Z, góra −X', { bow: [0, 0, 1], up: [-1, 0, 0] }],
];
const NOZZLES = [
  { p: [0.4896, 0.0001, 0], d: [1, 0, 0], r: 0.0527 },            // dysza właściciela po wyśrodkowaniu (ujście pierścienia)
  { p: [0.4296, -0.0239, -0.0045], d: [1, 0, 0], r: 0.046 },      // klik właściciela przed poprawką (ściana tunelu)
  { p: [0.31, 0.04, -0.07], d: [0.8, 0.0, -0.6], r: 0.03 },        // dysza z boku, smuga pod kątem
];

await section('P1  wierzchołek smugi = dysza z pliku przeniesiona do świata (pełny łańcuch przekształceń gry)', async () => {
  let worst = 0, worstDir = 0, n = 0;
  for (const [, frame] of FRAMES) {
    for (const nz of NOZZLES) {
      for (let k = 0; k < 6; k++) {
        const tpl = template();
        const rig = RIG.buildShipRig({ THREE, template: tpl, hardpoints: doc(frame, nz), targetSize: 0.016 + 0.01 * k, kind: 'own', exhaust: EXH });
        // wrapper jak gra: pozycja na płaszczyźnie statków, kurs Y; choreografia: canon = A · ramaPliku (`_choreoOrient`)
        rig.root.position.set(3 - k, 0.3, -2 + 0.5 * k);
        rig.root.rotation.set(0, -Math.PI / 2 + 0.7 * k, 0);
        const A = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15 * k, -0.4 + 0.2 * k, 0.3 - 0.1 * k, 'YXZ'));
        rig.canon.quaternion.set(...rig.frameQuat).premultiply(A);
        rig.root.updateMatrixWorld(true);
        const apex = rig.exhaust.localToWorld(new THREE.Vector3(0, 0, 0));
        const nzW = rig.canon.localToWorld(new THREE.Vector3(...nz.p));
        const L = rig.canon.getWorldScale(new THREE.Vector3()).x;
        worst = Math.max(worst, apex.distanceTo(nzW) / L);
        const qc = rig.exhaust.getWorldQuaternion(new THREE.Quaternion());
        const axis = new THREE.Vector3(0, -1, 0).applyQuaternion(qc);
        const qk = rig.canon.getWorldQuaternion(new THREE.Quaternion());
        const dW = new THREE.Vector3(...nz.d).normalize().applyQuaternion(qk);
        worstDir = Math.max(worstDir, 1 - axis.dot(dW));
        n++;
      }
    }
  }
  ok(worst < 1e-9, `P1a ${n} konfiguracji (4 ramy × 3 dysze niedomyślne × 6 kursów / choreografii / skal): wierzchołek − dysza w świecie ≤ ${worst.toExponential(1)} L`);
  ok(worstDir < 1e-12, `P1b oś smugi = kierunek dyszy obrócony jak canon (1 − cos ≤ ${worstDir.toExponential(1)})`);
});

await section('P2–P3  skalowanie smugi nie rusza wierzchołka; geometria stożka', async () => {
  const nz = NOZZLES[2];
  const rig = RIG.buildShipRig({ THREE, template: template(), hardpoints: doc(FRAMES[0][1], nz), targetSize: 0.03, kind: 'own', exhaust: EXH });
  rig.root.position.set(1, 0.3, 2); rig.root.rotation.set(0, 0.8, 0); rig.root.updateMatrixWorld(true);
  const before = rig.exhaust.localToWorld(new THREE.Vector3());
  const rad = 0.05, len = 0.8;
  rig.exhaust.scale.set(rad, len, rad);   // jak `_applyExhaust` gałąź kanoniczna
  rig.root.updateMatrixWorld(true);
  const after = rig.exhaust.localToWorld(new THREE.Vector3());
  const end = rig.exhaust.localToWorld(new THREE.Vector3(0, -1, 0));
  const L = rig.canon.getWorldScale(new THREE.Vector3()).x;
  const dW = new THREE.Vector3(...nz.d).normalize().applyQuaternion(rig.canon.getWorldQuaternion(new THREE.Quaternion()));
  const expectEnd = after.clone().addScaledVector(dW, len * L);
  ok(near(before, after, 1e-12 * L), 'P2a skala smugi (promień, długość) nie przesuwa wierzchołka');
  ok(near(end, expectEnd, 1e-9 * L), 'P2b koniec smugi = wierzchołek + d · długość · rozmiar klasy');
  rig.exhaust.geometry.computeBoundingBox();
  const bb = rig.exhaust.geometry.boundingBox;
  ok(Math.abs(bb.max.y) < 1e-9 && Math.abs(bb.min.y + 1) < 1e-9, `P3a geometria stożka: wierzchołek y = 0 (początek układu), podstawa y = −1 (${bb.max.y.toFixed(3)} / ${bb.min.y.toFixed(3)})`);
  // KONTROLA: stożek z wierzchołkiem w +0,5 (bez przesunięcia geometrii) — skalowanie przesuwa wierzchołek
  const ctl = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8, 1, true), new THREE.MeshBasicMaterial());
  ctl.position.copy(rig.exhaust.position); ctl.quaternion.copy(rig.exhaust.quaternion);
  rig.canon.add(ctl); rig.root.updateMatrixWorld(true);
  const tip0 = ctl.localToWorld(new THREE.Vector3(0, 0.5, 0));
  ctl.scale.set(rad, len, rad); rig.root.updateMatrixWorld(true);
  const tip1 = ctl.localToWorld(new THREE.Vector3(0, 0.5, 0));
  ok(!near(tip0, tip1, 1e-3 * L), 'P3b KONTROLA: stożek z wierzchołkiem w +0,5 przesuwa wierzchołek przy skalowaniu — P2a ma co rozróżniać');
});

await section('P4  nic po drodze nie przesuwa ani nie obraca smugi (źródło, bez komentarzy)', async () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const tr = strip(readFileSync(new URL('src/renderer/ThreeRenderer.js', ROOT), 'utf8'));
  const ws = strip(readFileSync(new URL('tools/model-workshop/workshop.js', ROOT), 'utf8'));
  const method = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n  }\n', i); return src.slice(i, j < 0 ? undefined : j); };
  // zapis pozycji / obrotu smugi: przypisanie (także składowej), metoda mutująca wektora / kwaternionu albo metoda obiektu
  // obracająca / przesuwająca go (rotateX, translateY, lookAt, applyQuaternion…); odczyty (clone, distanceTo) — nie
  const moves = new RegExp(String.raw`\b(?:cone|exhaust)\.(?:(?:position|quaternion|rotation)(?:\.[xyzw])?\s*=(?!=)|(?:position|quaternion|rotation)\.(?:set\w*|copy|identity|multiply\w*|premultiply|add\w*|sub\w*|apply\w*|lerp\w*|slerp\w*|rotate\w*|normalize|negate|invert|conjugate)\s*\(|(?:rotate\w*|translate\w*|lookAt|apply(?:Quaternion|Matrix4)|setRotationFrom\w*)\s*\()`);
  const ae = method(tr, '  _applyExhaust(vessel, entry) {');
  const ce = method(tr, '  _choreoExhaust(e, intensity) {');
  ok(ae.length > 200 && /cone\.scale\.set\(/.test(ae) && !moves.test(ae), '`_applyExhaust` (gra): skala smugi tak, pozycja / obrót nie');
  ok(ce.length > 200 && /cone\.scale\.set\(/.test(ce) && !moves.test(ce), '`_choreoExhaust` (gra, walka z choreografią): skala smugi tak, pozycja / obrót nie');
  const tick = method(ws, 'function tick() {');
  ok(tick.length > 200 && /cone\.scale\.set\(/.test(tick) && !moves.test(tick), 'pętla Workshopu: skala smugi tak, pozycja / obrót nie (podgląd = gra)');
  const writes = ['cone.position.set(1, 2, 3);', 'exhaust.quaternion.copy(q)', 'cone.quaternion.identity();', 'cone.position.x = 1;', 'cone.rotateY(0.1);', 'cone.lookAt(v);', 'exhaust.translateZ(-1);'];
  const reads = ['cone.scale.set(1, 2, 1);', 'const p = cone.position.clone();', 'cone.position.distanceTo(v)', 'if (cone.quaternion.x === 0) {}'];
  ok(writes.every((w) => moves.test(w)) && reads.every((r) => !moves.test(r)), `P4d KONTROLA: wzorzec łapie ${writes.length} rodzajów zapisu pozycji / obrotu smugi, a odczyty i skalę przepuszcza`);
});

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
