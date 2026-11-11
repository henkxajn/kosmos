// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_workshop_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-1c (Model Workshop; logika — F11, bez pinów na stałych
// rysunku). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.11, §4 CV-1c; D-CV-16.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (czysty `tools/model-workshop/WorkshopLogic.js` + prawdziwy three r171 i rig gry tam, gdzie potrzebna geometria):
//   W1 klik → hardpoint: promień rzucony na model w rigu gry (`buildShipRig`, dowolny obrót ramy, skala klasy, wrapper przesunięty
//      i obrócony) — `worldToModel(trafienie, canon.matrixWorld)` = punkt w ZNORMALIZOWANEJ przestrzeni modelu (analitycznie
//      z szablonu: (v − środek) / najdłuższy wymiar) = `canon.worldToLocal`; rama kanoniczna i tożsamościowa dają ten sam punkt.
//      KONTROLA: macierz wrappera zamiast `canon` daje inny punkt (pin zależy od właściwej macierzy).
//   W2 lustro: dokładne odbicie względem płaszczyzny (dziób, góra) przez środek — dla dziobu −X i góry +Y z → −z co do bitu;
//      dla losowych ram: środek odcinka na płaszczyźnie, odcinek ∥ normalnej, |p| = |p'|, inwolucja; punkt na płaszczyźnie —
//      bez bliźniaka; bliźniak wieżyczki zaraz za nią (W1 / W2); po zaokrągleniu zapisu z → −z dalej dokładne.
//      KONTROLA: odbicie względem złej płaszczyzny (normalna = dziób) nie spełnia warunków.
//   W3 zapis zgodny ze schematem: każdy plik hardpointów z dysku → stan → dokument: `validateHardpoints` ok, zmienione WYŁĄCZNIE
//      pola modelu (source / schema / version / slot / damagePoints bajt w bajt); setki losowych kliknięć — dalej poprawny;
//      punkt poza przestrzenią — odmowa (ok:false, brak dokumentu), nigdy dokument niepoprawny; dopisek notes zastępuje poprzedni.
//   W4 cofnij / ponów: kolejność, nowy krok czyści „ponów", limit, krok bez zmiany stanu — bez kroku.
//   W5 suwaki ↔ keyColour w obie strony: wszystkie pliki z dysku, losowe wartości na siatce suwaka; przycięcie do zakresów.
//   W6 zapisany plik wczytuje się w GRZE z tymi samymi punktami: tekst (`formatHardpointsJson`) → `ShipHardpointsCache` gry →
//      ten sam dokument, bez zapasu; rig gry z tym dokumentem: smuga w dyszy, punkty świetlne (atrybut instancji) w punktach.
//   W7 bezpieczny dla SCALANIA normalizatora: dokument z Workshopu → `pickCarried` (ten sam model) → `mergeHardpoints` →
//      punkty bez zmian; `source` nietknięte. KONTROLA: zmienione `source.input` (inny model) — punkty NIE przechodzą.
//   W8 sesja (sessionStorage — zapis przeładowuje stronę): zapis → odczyt = ten sam stan; śmieci → null; historia przycięta.
//   W9 wybór punktu ekranowo: zasłonięty i poza kadrem pomijany, remis → bliższy kamerze.
//   W10 źródło: zero three / DOM / `Math.random` w logice; strona woła `worldToModel` (klik) i `docFromEdit` (zapis); importmap
//      strony = importmap gry (ten sam three, ta sama linia CDN).
//   W11 sloty: opisy po polsku dla wszystkich slotów, okręty wojenne = dokładnie sześć, lista strony = lista normalizatora.
// ⚠ Moduły nowe importowane dynamicznie w try/catch — przy braku modułu piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync, readdirSync, existsSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const header = (t) => console.log('\n' + t);
const section = async (name, fn) => { header(name); try { await fn(); } catch (e) { fail++; console.log(`  ✗ ${name}: wyjątek ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`); } };

const tryImport = async (rel) => { try { return await import(new URL(rel, import.meta.url).href); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const THREE = await tryImport('../../lib/three.module.js');
const WL    = await tryImport('../../../tools/model-workshop/WorkshopLogic.js');
const RIG   = await tryImport('../../renderer/ShipModelRig.js');
const SHP   = await tryImport('../../renderer/ShipHardpoints.js');
const SCH   = await tryImport('../../data/ShipHardpointsSchema.js');
const LPP   = await tryImport('../../renderer/ShipLightPoints.js');
const NHP   = await tryImport('../../../tools/ship-models/lib/hardpoints.mjs');
const SLOTS = await tryImport('../../../tools/ship-models/lib/slots.mjs');

const ROOT = new URL('../../../', import.meta.url);
const HP_DIR = new URL('assets/models/ships/hardpoints/', ROOT);
const readHp = (name) => JSON.parse(readFileSync(new URL(name, HP_DIR), 'utf8'));
const diskDocs = readdirSync(HP_DIR).filter((f) => /^[a-z0-9_]+\.json$/.test(f)).map((f) => ({ name: f, doc: readHp(f) }));
const incomingDir = new URL('incoming/', HP_DIR);
if (existsSync(incomingDir)) {
  for (const f of readdirSync(incomingDir).filter((x) => /^[a-z0-9_]+\.json$/.test(x) && x !== 'index.json')) diskDocs.push({ name: 'incoming/' + f, doc: JSON.parse(readFileSync(new URL(f, incomingDir), 'utf8')) });
}
const near = (a, b, eps = 1e-9) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= eps);
const rnd = (lo, hi) => lo + (hi - lo) * Math.random();
const rndUnit = () => { const v = [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)]; const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
const randomFrame = () => {
  const bow = rndUnit();
  let up = rndUnit();
  const d = up[0] * bow[0] + up[1] * bow[1] + up[2] * bow[2];
  up = up.map((c, i) => c - d * bow[i]);
  const l = Math.hypot(...up);
  return { bow, up: up.map((c) => c / l) };
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossLen = (a, b) => Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);

// Szablon syntetyczny: model z transformacjami węzłów (grupa przesunięta i obrócona, siatka przeskalowana) — jak GLB sprzed normalizacji.
function makeTemplate() {
  const tpl = new THREE.Group();
  const node = new THREE.Group();
  node.position.set(3, -1, 2);
  node.rotation.set(0.3, -0.7, 0.2);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  mesh.scale.set(1.3, 1.0, 0.9);
  node.add(mesh);
  tpl.add(node);
  tpl.updateMatrixWorld(true);
  return { tpl, mesh };
}
const baseDocFor = (slot, frame) => ({
  schema: 'kosmos-ship-hardpoints', version: 1, slot,
  source: { file: slot + '.glb', sha256: null, normalizer: null },
  frame, nozzles: [{ p: [0.5, 0, 0], d: [1, 0, 0], r: 0.04 }], weapons: [], lights: [],
  keyColour: { mode: 'mask', hue: 182, hueTol: 12, satMin: 0.45, valMin: 0.55, soft: 0.06, gain: 3.5 }, damagePoints: 'auto',
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W1  klik → hardpoint w znormalizowanej przestrzeni modelu', async () => {
  const { tpl, mesh } = makeTemplate();
  const { c, m } = RIG.templateBounds(THREE, tpl);
  const results = [];
  for (const [label, frame, canonical] of [
    ['dziób −X, rama tożsamościowa', { bow: [-1, 0, 0], up: [0, 1, 0] }, false],
    ['dziób −X, rama kanoniczna', { bow: [-1, 0, 0], up: [0, 1, 0] }, true],
    ['dziób +Z, góra −X, rama kanoniczna', { bow: [0, 0, 1], up: [-1, 0, 0] }, true],
  ]) {
    const rig = RIG.buildShipRig({ THREE, template: tpl, hardpoints: baseDocFor('t', frame), targetSize: 0.037, kind: 'own' });
    if (!canonical) rig.canon.quaternion.identity();
    rig.root.position.set(5, 0.3, -2);
    rig.root.rotation.set(0.1, 1.2, -0.05);
    rig.root.updateMatrixWorld(true);
    // punkt na ścianie pudełka (lokalnie w siatce), promień z zewnątrz wzdłuż normalnej ściany
    const localP = new THREE.Vector3(0.4, 0.25, -0.1);       // ściana +Y (połowa wysokości 0,25)
    const meshCopy = rig.model.getObjectByProperty('type', 'Mesh');
    const worldP = localP.clone().applyMatrix4(meshCopy.matrixWorld);
    const worldN = new THREE.Vector3(0, 1, 0).transformDirection(meshCopy.matrixWorld);
    const ray = new THREE.Raycaster(worldP.clone().addScaledVector(worldN, 0.05), worldN.clone().negate());
    const hit = ray.intersectObject(rig.model, true)[0];
    const p = WL.worldToModel(hit.point.toArray(), rig.canon.matrixWorld.elements);
    const tplP = localP.clone().applyMatrix4(mesh.matrixWorld);          // ten sam punkt w przestrzeni szablonu (z węzłami)
    const analytic = [(tplP.x - c[0]) / m, (tplP.y - c[1]) / m, (tplP.z - c[2]) / m];
    const viaThree = rig.canon.worldToLocal(hit.point.clone()).toArray();
    const nModel = WL.dirWorldToModel(hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray(), rig.canon.matrixWorld.elements);
    const nTpl = new THREE.Vector3(0, 1, 0).transformDirection(mesh.matrixWorld).toArray();
    results.push({ label, p, analytic, viaThree, nModel, nTpl, rootP: WL.worldToModel(hit.point.toArray(), rig.root.matrixWorld.elements) });
  }
  for (const r of results) {
    ok(near(r.p, r.analytic, 1e-6), `W1a ${r.label}: klik = punkt szablonu w przestrzeni znormalizowanej (${r.p.map((x) => x.toFixed(4)).join(', ')})`);
    ok(near(r.p, r.viaThree, 1e-9), `W1b ${r.label}: = canon.worldToLocal (three)`);
    ok(near(r.nModel, r.nTpl, 1e-6), `W1c ${r.label}: normalna trafienia w przestrzeni modelu (kierunek smugi „z powierzchni")`);
  }
  ok(near(results[0].p, results[1].p, 1e-9) && near(results[0].p, results[2].p, 1e-6), 'W1d obrót ramy (tożsamościowa / kanoniczna / inna) nie zmienia punktu hardpointu');
  ok(!near(results[1].rootP, results[1].p, 1e-3), 'W1e KONTROLA: macierz wrappera (nie `canon`) daje inny punkt — pin zależy od właściwej macierzy');
  // losowe macierze: worldToModel(localToWorld(p)) = p
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const g = new THREE.Group();
    g.position.set(rnd(-50, 50), rnd(-50, 50), rnd(-50, 50));
    g.quaternion.set(...rndUnit(), rnd(-1, 1)).normalize();
    const s = rnd(0.01, 3); g.scale.set(s, s, s);
    g.updateMatrixWorld(true);
    const p = [rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5)];
    const w = new THREE.Vector3(...p).applyMatrix4(g.matrixWorld).toArray();
    const back = WL.worldToModel(w, g.matrixWorld.elements);
    worst = Math.max(worst, ...back.map((x, k) => Math.abs(x - p[k])));
  }
  ok(worst < 1e-9, `W1f 200 losowych macierzy (przesunięcie ±50, obrót, skala 0,01–3): powrót do punktu modelu (max błąd ${worst.toExponential(1)})`);
  ok(WL.worldToModel([1, 2, 3], new Array(16).fill(0)) === null, 'W1g macierz osobliwa ⇒ null (bez punktu w nieskończoności)');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W2  lustro — bliźniak dokładnie po drugiej stronie płaszczyzny środkowej', async () => {
  const F6 = { bow: [-1, 0, 0], up: [0, 1, 0] };   // sześć modeli właściciela
  const pts = Array.from({ length: 300 }, () => [rnd(-0.5, 0.5), rnd(-0.2, 0.2), rnd(-0.3, 0.3)]);
  ok(pts.every((p) => { const q = WL.mirrorPoint(p, F6); return q[0] === p[0] && q[1] === p[1] && q[2] === -p[2]; }), 'W2a dziób −X, góra +Y: odbicie = (x, y, −z) co do bitu (300 punktów)');
  ok(WL.mirrorNormal(F6).join() === '0,0,1', `W2b normalna płaszczyzny = góra × dziób = +Z (jak frameQuaternion — prawa burta) (${WL.mirrorNormal(F6).join(', ')})`);
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    const fr = randomFrame();
    const r = WL.mirrorNormal(fr);
    const p = [rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5)];
    const q = WL.mirrorPoint(p, fr);
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    const back = WL.mirrorPoint(q, fr);
    const onPlane = Math.abs(dot(mid, r)) < 1e-12;
    const parallel = crossLen(sub(p, q), r) < 1e-12;
    const isoNorm = Math.abs(Math.hypot(...p) - Math.hypot(...q)) < 1e-12;
    const invol = near(back, p, 1e-12);
    const keepsBowUp = Math.abs(dot(p, fr.bow) - dot(q, fr.bow)) < 1e-12 && Math.abs(dot(p, fr.up) - dot(q, fr.up)) < 1e-12;
    if (!(onPlane && parallel && isoNorm && invol && keepsBowUp)) bad++;
  }
  ok(bad === 0, `W2c 300 losowych ram: środek na płaszczyźnie, odcinek ∥ normalnej, |p| = |p'|, inwolucja, składowe dziobu / góry bez zmian (złe: ${bad})`);
  // KONTROLA: zła płaszczyzna (normalna = dziób) nie spełnia tych warunków
  const fr = { bow: [-1, 0, 0], up: [0, 1, 0] };
  const p = [0.3, 0.1, 0.2];
  const wrong = [-p[0], p[1], p[2]];   // odbicie względem płaszczyzny ⟂ dziobu
  ok(Math.abs(dot(p, fr.bow) - dot(wrong, fr.bow)) > 0.1, 'W2d KONTROLA: odbicie przez płaszczyznę ⟂ dziobu zmienia składową dziobu — warunek W2c ją odrzuca');

  const base = baseDocFor('w2', F6);
  let e = WL.editFromDoc(base);
  const onPlaneP = [0.1, 0.05, 0.001];
  const r1 = WL.addPoint(e, 'weapons', [0.2, 0.06, 0.07], { mirror: true });
  e = r1.edit;
  const r2 = WL.addPoint(e, 'weapons', onPlaneP, { mirror: true });
  e = r2.edit;
  ok(e.weapons.length === 3 && r1.twinUid !== null && r2.twinUid === null, `W2e lustro: punkt poza płaszczyzną → para, punkt na płaszczyźnie (|z| < ${WL.MIRROR_EPS}) → bez bliźniaka (${e.weapons.length} wieżyczki)`);
  ok(WL.weaponIds(e).join() === 'W1,W2,W3' && e.weapons[1].uid === r1.twinUid && e.weapons[0].twin === e.weapons[1].uid && e.weapons[1].twin === e.weapons[0].uid,
    'W2f bliźniak wieżyczki ZARAZ za nią: W1 / W2 para (wzajemne `twin`), W3 bez pary');
  // światła: kolor bliźniaka, zamiana nawigacyjna
  const L1 = WL.addPoint(e, 'lights', [0.0, 0.03, 0.08], { mirror: true, colour: WL.LIGHT_COLOURS.red, swapNav: true }).edit;
  const L2 = WL.addPoint(e, 'lights', [0.0, 0.03, 0.08], { mirror: true, colour: WL.LIGHT_COLOURS.red, swapNav: false }).edit;
  ok(L1.lights[0].colour === WL.LIGHT_COLOURS.red && L1.lights[1].colour === WL.LIGHT_COLOURS.green && L2.lights[1].colour === WL.LIGHT_COLOURS.red,
    'W2g bliźniak światła: ten sam kolor, a przy zamianie nawigacyjnej czerwony ↔ zielony');
  // zaokrąglenie zapisu nie psuje lustra
  let ed = WL.editFromDoc(base);
  for (let i = 0; i < 120; i++) ed = WL.addPoint(ed, 'lights', [rnd(-0.5, 0.5), rnd(-0.2, 0.2), rnd(0.01, 0.3)], { mirror: true }).edit;
  const doc = WL.docFromEdit(base, ed).doc;
  let asym = 0;
  for (let i = 0; i < doc.lights.length; i += 2) {
    const a = doc.lights[i].p, b = doc.lights[i + 1].p;
    if (!(a[0] === b[0] && a[1] === b[1] && a[2] === -b[2])) asym++;
  }
  ok(doc.lights.length === 240 && asym === 0, `W2h po zaokrągleniu zapisu (4 miejsca) para = (x, y, z) / (x, y, −z) co do znaku (${doc.lights.length} punktów, złe: ${asym})`);
  ok(WL.roundSym(-0.00005, 4) === -WL.roundSym(0.00005, 4) && Object.is(WL.roundSym(-0.00001, 4), 0), 'W2i zaokrąglenie symetryczne (round(−x) = −round(x)) i bez −0');
  // przesunięcie / usunięcie pary
  let mv = WL.movePoint(ed, 'lights', ed.lights[0].uid, [0.1, 0.1, 0.1], { mirror: true });
  ok(near(mv.lights[1].p, [0.1, 0.1, -0.1], 1e-12), 'W2j przesunięcie z lustrem: bliźniak idzie za punktem (odbicie)');
  mv = WL.movePoint(ed, 'lights', ed.lights[0].uid, [0.1, 0.1, 0.1], { mirror: false });
  ok(near(mv.lights[1].p, ed.lights[1].p, 0), 'W2k przesunięcie bez lustra: bliźniak stoi');
  const del = WL.deletePoint(ed, 'lights', ed.lights[0].uid, { mirror: true });
  const del1 = WL.deletePoint(ed, 'lights', ed.lights[0].uid, { mirror: false });
  ok(del.lights.length === ed.lights.length - 2 && del1.lights.length === ed.lights.length - 1 && del1.lights[0].twin === null,
    'W2l usunięcie z lustrem — para; bez lustra — jeden punkt, bliźniak bez pary');
  // zmiana koloru / rozmiaru: z lustrem także bliźniak; bez zmiany wartości — ten sam stan (bez pustego kroku cofania)
  const lp = WL.setLightProps(ed, ed.lights[0].uid, { colour: WL.LIGHT_COLOURS.green, size: 0.05 }, { mirror: true });
  ok(lp.lights[0].colour === WL.LIGHT_COLOURS.green && lp.lights[1].colour === WL.LIGHT_COLOURS.green && lp.lights[1].size === 0.05 && lp.lights[2] === ed.lights[2],
    'W2n kolor / rozmiar zaznaczonego światła z lustrem zmienia też bliźniaka (reszta punktów — te same obiekty)');
  ok(WL.setLightProps(lp, lp.lights[0].uid, { colour: WL.LIGHT_COLOURS.green }, { mirror: true }) === lp,
    'W2o ten sam kolor jeszcze raz ⇒ ten sam stan (historia bez pustego kroku)');
  // rozpoznanie par przy wczytaniu pliku
  const back = WL.editFromDoc(doc);
  ok(back.lights.every((l) => l.twin !== null) && back.lights[0].twin === back.lights[1].uid, 'W2m wczytanie pliku: pary lustrzane rozpoznane z geometrii (przesuń / usuń parę działa po przeładowaniu)');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W3  zapis — dokument zawsze zgodny ze schematem, zmienione tylko pola modelu', async () => {
  ok(diskDocs.length >= 25, `W3a pliki hardpointów z dysku: ${diskDocs.length}`);
  const untouched = ['schema', 'version', 'slot', 'source', 'damagePoints'];
  let invalid = 0, leaked = 0, roundTripBad = 0;
  for (const { name, doc } of diskDocs) {
    const e = WL.editFromDoc(doc);
    const r = WL.docFromEdit(doc, e);
    if (!r.ok) { invalid++; console.log(`    ! ${name}: ${r.errors.slice(0, 2).join('; ')}`); continue; }
    for (const k of untouched) if (JSON.stringify(r.doc[k]) !== JSON.stringify(doc[k])) { leaked++; console.log(`    ! ${name}: ${k} zmienione`); }
    if (r.doc.notes !== doc.notes) leaked++;
    for (const k of ['frame', 'nozzles', 'weapons', 'lights', 'keyColour']) if (JSON.stringify(r.doc[k]) !== JSON.stringify(doc[k])) { roundTripBad++; console.log(`    ! ${name}: ${k} ≠ plik po wczytaniu i zapisie bez zmian`); }
  }
  ok(invalid === 0, `W3b każdy plik → stan → dokument: validateHardpoints ok (${diskDocs.length - invalid}/${diskDocs.length})`);
  ok(leaked === 0, 'W3c schema / version / slot / source / damagePoints / notes (bez daty) — bajt w bajt z pliku');
  ok(roundTripBad === 0, 'W3d wczytanie i zapis bez zmian = plik (pola modelu identyczne — zapis bez kliknięć nie zmienia pliku)');
  // losowe kliknięcia w dużej liczbie
  const base = readHp('warp_frigate.json');
  let e = WL.editFromDoc(base);
  e = WL.setBow(e, [0.49, 0.01, -0.02]);
  e = WL.setNozzle(e, [-0.5, 0.0, 0.01], WL.nozzleDirection('stern', e.frame), 0.05);
  // oczekiwana liczba punktów: klik + bliźniak, gdy lustro i punkt poza płaszczyzną środkową (losowy punkt bywa NA niej)
  let expW = 0, expL = 0;
  for (let i = 0; i < 30; i++) {
    const p = [rnd(-0.5, 0.5), rnd(-0.1, 0.1), rnd(-0.3, 0.3)];
    const mirror = i % 2 === 0;
    expW += 1 + (mirror && !WL.onMirrorPlane(p, e.frame) ? 1 : 0);
    e = WL.addPoint(e, 'weapons', p, { mirror }).edit;
  }
  for (let i = 0; i < 100; i++) {
    const p = [rnd(-0.5, 0.5), rnd(-0.1, 0.1), rnd(-0.3, 0.3)];
    const mirror = i % 3 === 0;
    expL += 1 + (mirror && !WL.onMirrorPlane(p, e.frame) ? 1 : 0);
    e = WL.addPoint(e, 'lights', p, { mirror, colour: Object.values(WL.LIGHT_COLOURS)[i % 4], size: rnd(0, 0.2) }).edit;
  }
  e = WL.setKeyColour(e, { hue: 200.4, hueTol: 59.6, satMin: 0.333, gain: 19.97, mode: 'mask' });
  const r = WL.docFromEdit(base, e, { date: '2026-11-11' });
  ok(r.ok && r.doc.weapons.length === expW && r.doc.lights.length === expL && expW > 30 && expL > 100,
    `W3e ${r.doc?.weapons.length} wieżyczek i ${r.doc?.lights.length} świateł (losowe kliki, lustro co 2. / 3.; oczekiwane ${expW} / ${expL}): dokument poprawny`);
  ok(r.ok && r.doc.weapons.every((w, i) => w.id === 'W' + (i + 1)), 'W3e2 identyfikatory wieżyczek W1…Wn wg kolejności (bez powtórzeń — schemat)');
  ok(r.ok && r.doc.frame.bow.join() === '1,0,0' && r.doc.frame.up.join() === '0,1,0', `W3f dziób z kliku zaokrąglony do osi: (0,49, 0,01, −0,02) → +X (${r.doc?.frame.bow.join(', ')})`);
  ok(r.ok && r.doc.lights.every((l) => l.size >= WL.LIGHT_SIZE_RANGE[0] && l.size <= WL.LIGHT_SIZE_RANGE[1]), 'W3g rozmiar światła przycięty do zakresu suwaka (schemat: (0; 0,2])');
  ok(r.ok && JSON.stringify(r.doc.source) === JSON.stringify(base.source), 'W3h source nietknięte także po kliknięciach (sha256, normalizer, input)');
  // odmowa zamiast dokumentu niepoprawnego
  const bad = WL.addPoint(WL.editFromDoc(base), 'lights', [1.5, 0, 0]).edit;
  const rb = WL.docFromEdit(base, bad);
  ok(!rb.ok && rb.doc === null && rb.errors.some((x) => /lights\[0\]\.p/.test(x)), `W3i punkt poza przestrzenią (|x| = 1,5) ⇒ odmowa z błędem, brak dokumentu (${rb.errors[0]})`);
  // dopisek notes
  const n1 = WL.stampNotes(base.notes, { date: '2026-11-11', weapons: 2, lights: 4 });
  const n2 = WL.stampNotes(n1, { date: '2026-11-12', weapons: 4, lights: 8 });
  const stamps = (txt) => (txt.match(/Model Workshop \d{4}-\d{2}-\d{2}:/g) || []).length;
  ok(n1.startsWith(base.notes) && stamps(n1) === 1 && stamps(n2) === 1 && n2.startsWith(base.notes) && n2.endsWith('2026-11-12: wieżyczki 4, światła 8.'),
    'W3j notes: dopisek Workshopu zastępuje poprzedni (jeden dopisek po wielu zapisach)');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W4  cofnij / ponów', async () => {
  const s0 = { n: 0 }, s1 = { n: 1 }, s2 = { n: 2 }, s3 = { n: 3 };
  let h = WL.createHistory(s0, 3);
  h = WL.historyPush(h, s1); h = WL.historyPush(h, s2);
  ok(h.present === s2 && WL.canUndo(h) && !WL.canRedo(h), 'W4a dwa kroki: stan = ostatni, cofnij dostępne, ponów nie');
  h = WL.historyUndo(h);
  ok(h.present === s1 && WL.canRedo(h), 'W4b cofnij → poprzedni stan, ponów dostępne');
  h = WL.historyRedo(h);
  ok(h.present === s2 && !WL.canRedo(h), 'W4c ponów → z powrotem');
  h = WL.historyUndo(WL.historyUndo(h));
  ok(h.present === s0 && !WL.canUndo(h), 'W4d cofnij do początku');
  h = WL.historyPush(h, s3);
  ok(h.present === s3 && !WL.canRedo(h) && h.past.length === 1, 'W4e nowy krok po cofnięciu czyści „ponów"');
  let hc = WL.createHistory(s0, 3);
  for (let i = 1; i <= 10; i++) hc = WL.historyPush(hc, { n: i });
  ok(hc.past.length === 3 && hc.past[0].n === 7, `W4f limit historii (3): najstarsze kroki odpadają (${hc.past.map((x) => x.n).join(',')})`);
  ok(WL.historyPush(hc, hc.present) === hc, 'W4g krok bez zmiany stanu — bez kroku');
  ok(WL.historyUndo(WL.createHistory(s0)).present === s0 && WL.historyRedo(WL.createHistory(s0)).present === s0, 'W4h cofnij / ponów na pustej historii — bez zmian');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W5  suwaki ↔ keyColour w obie strony', async () => {
  let bad = 0;
  for (const { name, doc } of diskDocs) {
    const back = WL.keyColourFromSliders(WL.slidersFromKeyColour(doc.keyColour), doc.keyColour.mode);
    if (JSON.stringify(back) !== JSON.stringify(doc.keyColour)) { bad++; console.log(`    ! ${name}: ${JSON.stringify(back)}`); }
  }
  ok(bad === 0, `W5a każdy plik z dysku: keyColour → suwaki → keyColour = plik (${diskDocs.length - bad}/${diskDocs.length})`);
  let bad2 = 0;
  for (let i = 0; i < 500; i++) {
    const s = {};
    for (const sl of WL.SLIDERS) s[sl.key] = WL.roundSym(sl.min + Math.round(rnd(0, (sl.max - sl.min) / sl.step)) * sl.step, sl.step >= 1 ? 0 : Math.round(-Math.log10(sl.step)));
    const kc = WL.keyColourFromSliders(s, i % 2 ? 'mask' : 'none');
    const back = WL.slidersFromKeyColour(kc);
    if (WL.SLIDERS.some((sl) => back[sl.key] !== s[sl.key]) || !SCH.validateHardpoints({ ...baseDocFor('k', { bow: [-1, 0, 0], up: [0, 1, 0] }), keyColour: kc }).ok) bad2++;
  }
  ok(bad2 === 0, `W5b 500 losowych ustawień na siatce suwaków: suwaki → keyColour → suwaki bez zmian, keyColour w schemacie (złe: ${bad2})`);
  const kc = WL.keyColourFromSliders({ hue: 999, hueTol: -5, satMin: 2, valMin: Number.NaN, soft: 0.6, gain: 50 }, 'zly');
  ok(kc.hue === 360 && kc.hueTol === 0 && kc.satMin === 1 && kc.valMin === SCH.KEY_COLOUR_DEFAULTS.valMin && kc.soft === 0.5 && kc.gain === 20 && kc.mode === 'mask',
    'W5c wartości spoza zakresu przycięte do KEY_COLOUR_LIMITS, brak liczby → domyślna, zły tryb → mask');
  ok(WL.SLIDERS.map((s) => s.key).join() === Object.keys(SCH.KEY_COLOUR_LIMITS).join(), 'W5d suwaki = dokładnie pola KEY_COLOUR_LIMITS (barwa, tolerancja, nasycenie, jasność, miękkość, wzmocnienie)');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W6  zapisany plik wczytuje się w grze z tymi samymi punktami', async () => {
  const base = readHp('warp_frigate.json');
  let e = WL.editFromDoc(base);
  e = WL.setNozzle(e, [0.497, 0.004, -0.003], [1, 0, 0], 0.05);
  e = WL.addPoint(e, 'weapons', [0.1, 0.07, 0.06], { mirror: true }).edit;
  e = WL.addPoint(e, 'lights', [-0.4, 0.02, 0.03], { mirror: true, colour: WL.LIGHT_COLOURS.cyan, size: 0.03 }).edit;
  e = WL.addPoint(e, 'lights', [0.0, 0.08, 0.0], { mirror: true, colour: WL.LIGHT_COLOURS.white, size: 0.025 }).edit;   // na płaszczyźnie — pojedynczy
  e = WL.addPoint(e, 'lights', [0.2, 0.0, 0.11], { mirror: true, colour: WL.LIGHT_COLOURS.red, size: 0.02, swapNav: true }).edit;
  const r = WL.docFromEdit(base, e, { date: '2026-11-11' });
  const text = NHP.formatHardpointsJson(r.doc);
  const parsed = JSON.parse(text);
  const warns = [];
  const cache = new SHP.ShipHardpointsCache({ fetchJson: async () => parsed, warn: (m) => warns.push(m) });
  const loaded = await cache.load('warp_frigate');
  ok(r.ok && JSON.stringify(loaded) === JSON.stringify(r.doc) && cache.stats().fallback.length === 0 && warns.length === 0,
    `W6a tekst pliku → ShipHardpointsCache gry: ten sam dokument, bez wartości zapasowych (${loaded.weapons.length} wieżyczki, ${loaded.lights.length} światła)`);
  const pool = new LPP.LightPointPool({ THREE, logDepth: true });
  const { tpl } = makeTemplate();
  const rig = RIG.buildShipRig({ THREE, template: tpl, hardpoints: loaded, targetSize: 0.03, kind: 'own', lightPool: pool, lightKey: 'w6',
    exhaust: { gradient: { apex: { r: 1, g: 1, b: 1 }, base: { r: 0, g: 0, b: 1 } }, hdr: 4.5 } });
  const ep = rig.exhaust?.position.toArray();
  ok(!!ep && near(ep, loaded.nozzles[0].p, 1e-12), `W6b rig gry: smuga w dyszy z pliku (${ep?.join(', ')})`);
  const aPos = rig.lights?.geometry?.attributes?.aPos;
  const flat = loaded.lights.flatMap((l) => l.p);
  ok(!!aPos && rig.lights.geometry.instanceCount === loaded.lights.length && Array.from(aPos.array).every((x, i) => Math.abs(x - flat[i]) < 1e-6),
    `W6c rig gry: punkty świetlne (atrybut instancji aPos) = punkty z pliku (${rig.lights?.geometry?.instanceCount} instancji)`);
  const q = SHP.frameQuaternion(loaded.frame);
  ok(near(rig.canon.quaternion.toArray(), q, 1e-12), 'W6d rig gry: rama z pliku (kwaternion `canon`)');
  ok(loaded.lights[3].colour === WL.LIGHT_COLOURS.red && loaded.lights[4].colour === WL.LIGHT_COLOURS.green, 'W6e kolory punktów przechodzą do pliku (zamiana nawigacyjna bliźniaka)');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W7  bezpieczny dla scalania normalizatora', async () => {
  const base = readHp('warp_frigate.json');
  let e = WL.editFromDoc(base);
  e = WL.addPoint(e, 'weapons', [0.1, 0.07, 0.06], { mirror: true }).edit;
  e = WL.addPoint(e, 'lights', [-0.4, 0.02, 0.03], { mirror: true }).edit;
  e = WL.setKeyColour(e, { hue: 185, gain: 4.0 });
  const ws = WL.docFromEdit(base, e, { date: '2026-11-11' }).doc;
  const measured = NHP.measuredHardpoints({ slot: 'warp_frigate', nozzle: { p: [0.5, 0, 0], d: [1, 0, 0], r: 0.04 }, keyMode: 'mask' });
  const pick = NHP.pickCarried({ incomingDoc: null, slotDoc: ws, input: { ...ws.source.input } });
  const merged = NHP.mergeHardpoints(measured, pick.doc).doc;
  ok(pick.from === 'slot', `W7a ponowna normalizacja tego samego modelu rozpoznaje dokument z Workshopu (${pick.from}: ${pick.why})`);
  ok(NHP.CARRIED_FIELDS.every((k) => JSON.stringify(merged[k]) === JSON.stringify(ws[k])), 'W7b scalanie zachowuje kliknięte pola modelu (frame, nozzles, weapons, lights, keyColour, damagePoints)');
  ok(JSON.stringify(ws.source) === JSON.stringify(base.source), 'W7c source dokumentu z Workshopu = source pliku (sha256, normalizer, input)');
  const other = NHP.pickCarried({ incomingDoc: null, slotDoc: ws, input: { sha256: 'f'.repeat(64), verts: 1, tris: 1 } });
  ok(other.from === null && other.doc === null, 'W7d KONTROLA: inny model w slocie — dokument z Workshopu NIE jest scalany (punkty nie trafiają na cudzy kadłub)');
  // kandydat w incoming/ (dokument opisuje surowy plik po sha256)
  const inc = { ...baseDocFor('warp_destroyer', { bow: [-1, 0, 0], up: [0, 1, 0] }), source: { file: 'warp_destroyer.glb', sha256: 'a'.repeat(64), normalizer: null } };
  const wsInc = WL.docFromEdit(inc, WL.addPoint(WL.editFromDoc(inc), 'lights', [0.1, 0.02, 0.05], { mirror: true }).edit).doc;
  const pInc = NHP.pickCarried({ incomingDoc: wsInc, slotDoc: null, input: { sha256: 'a'.repeat(64), verts: 10, tris: 12 } });
  ok(pInc.from === 'incoming' && pInc.doc.lights.length === 2, 'W7e kandydat z incoming/: kliknięcia Workshopu przechodzą przy podmianie slotu (sha256 surowego pliku)');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W8  sesja — stan przeżywa przeładowanie strony', async () => {
  const base = readHp('nonwarp_destroyer.json');
  let h = WL.createHistory(WL.editFromDoc(base));
  for (let i = 0; i < 80; i++) h = WL.historyPush(h, WL.addPoint(h.present, 'lights', [rnd(-0.4, 0.4), 0.02, rnd(0.01, 0.2)], { mirror: true }).edit);
  h = WL.historyUndo(WL.historyUndo(h));
  const txt = WL.sessionSnapshot({ slot: 'nonwarp_destroyer', variant: 'slot', history: h, fileSig: 'abc', savedSig: null, savedAt: null, ui: { mode: 'lights' } });
  const s = WL.restoreSession(txt);
  ok(!!s && JSON.stringify(s.history.present) === JSON.stringify(h.present) && s.slot === 'nonwarp_destroyer' && s.ui.mode === 'lights' && s.fileSig === 'abc',
    'W8a zapis sesji → odczyt: ten sam slot, stan, podpis pliku i ustawienia');
  ok(s.history.past.length === WL.SESSION_HISTORY_KEEP && s.history.future.length === 2 && JSON.stringify(s.history.future[0]) === JSON.stringify(h.future[0]),
    `W8b historia przycięta do ${WL.SESSION_HISTORY_KEEP} kroków cofania, „ponów" zachowane`);
  ok(WL.restoreSession('nie json') === null && WL.restoreSession('{"v":1}') === null && WL.restoreSession(JSON.stringify({ v: 1, slot: 'x y', variant: 'slot' })) === null
    && WL.restoreSession(txt.replace('"variant":"slot"', '"variant":"obcy"')) === null, 'W8c śmieci / zły slot / zły wariant ⇒ null (strona startuje od zera)');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W9  wybór istniejącego punktu ekranowo', async () => {
  const pts = [
    { x: 100, y: 100, depth: 5 },
    { x: 104, y: 100, depth: 3, occluded: true },
    { x: 106, y: 100, depth: 2 },
    { x: 400, y: 100, depth: 1, inView: false },
  ];
  ok(WL.pickNearest(pts, 101, 100, 12) === 0, 'W9a najbliższy ekranowo w promieniu wygrywa (1 px wobec 5 px, mimo że drugi bliżej kamery)');
  ok(WL.pickNearest(pts, 104, 100, 12) === 2, 'W9b zasłonięty kadłubem pominięty (statek z tyłu nie łapie kliku)');
  ok(WL.pickNearest([{ x: 10, y: 10, depth: 9 }, { x: 10.5, y: 10, depth: 1 }], 10.2, 10, 12) === 1, 'W9c remis (± 1 px) — bliższy kamerze (bliźniak po drugiej burcie nie przechwytuje)');
  ok(WL.pickNearest(pts, 400, 100, 12) === -1 && WL.pickNearest(pts, 300, 300, 12) === -1, 'W9d poza kadrem / poza promieniem — brak');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W10  źródło strony i logiki', async () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const logic = strip(readFileSync(new URL('tools/model-workshop/WorkshopLogic.js', ROOT), 'utf8'));
  const page = strip(readFileSync(new URL('tools/model-workshop/workshop.js', ROOT), 'utf8'));
  const html = readFileSync(new URL('tools/model-workshop/index.html', ROOT), 'utf8');
  const gameHtml = readFileSync(new URL('index.html', ROOT), 'utf8');
  ok(!/from\s+['"]three/.test(logic) && !/\bdocument\b|\bwindow\b/.test(logic) && !/Math\.random/.test(logic), 'W10a logika: zero three, DOM i Math.random (wykonuje się pod node)');
  ok(!/Math\.random/.test(page), 'W10b strona: zero Math.random (§2.12-1)');
  // funkcja KLIKU strony (`hullHit`) i funkcja ZAPISU (`save`) — piny na ich ciałach, nie na całym pliku (bliźniak lustra też woła
  // worldToModel, więc pin na całym pliku przeżyłby podmianę w samym kliku — mutant M19 baterii CV-1c)
  const body = (name) => { const i = page.indexOf(`function ${name}(`); if (i < 0) return ''; const j = page.indexOf('\n}\n', i); return page.slice(i, j < 0 ? undefined : j); };
  ok(/WL\.worldToModel\(/.test(body('hullHit')) && /WL\.dirWorldToModel\(/.test(body('hullHit')) && /WL\.docFromEdit\(/.test(body('save')),
    'W10c klik strony (hullHit) liczy punkt przez worldToModel / dirWorldToModel, zapis (save) przez docFromEdit — keeper testuje TE funkcje');
  ok(!/from\s+['"][^'"]+\.mjs['"]/.test(page) && !/from\s+['"][^'"]+\.mjs['"]/.test(logic), 'W10h strona i logika nie importują `.mjs` (Live Server podaje je z typem MIME odrzucanym dla modułów)');
  ok(/validateHardpoints/.test(page) || /docFromEdit/.test(page), 'W10d zapis przechodzi przez walidację schematu (docFromEdit → validateHardpoints)');
  const map = (s) => (/"three":\s*"([^"]+)"/.exec(s)?.[1] ?? null);
  const addons = (s) => (/"three\/addons\/":\s*"([^"]+)"/.exec(s)?.[1] ?? null);
  ok(map(html) === '../../src/lib/three.module.js' && map(gameHtml) === './src/lib/three.module.js', `W10e importmap strony: three = ten sam plik co gra (${map(html)})`);
  ok(!!addons(html) && addons(html) === addons(gameHtml), `W10f importmap strony: dodatki z tej samej linii CDN co gra (${addons(html)})`);
  ok(/buildShipRig/.test(page) && /KC_SHARED/.test(page) && /LightPointPool/.test(page) && /LIVE_CV_FX/.test(page), 'W10g podgląd KODEM GRY: rig, wspólne uniformy maski, pula świateł, pokrętła LIVE_CV_FX');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await section('W11  sloty', async () => {
  const all = SLOTS.SHIP_SLOTS;
  ok(all.every((s) => WL.slotLabelPL(s) !== s), `W11a każdy z ${all.length} slotów ma opis po polsku (np. warp_frigate → ${WL.slotLabelPL('warp_frigate')})`);
  ok(JSON.stringify(WL.WORKSHOP_SLOTS) === JSON.stringify(all), `W11c lista slotów strony = SHIP_SLOTS normalizatora (to samo źródło: VESSEL_MODEL_KEYS + default; ${WL.WORKSHOP_SLOTS.length})`);
  const war = all.filter(WL.isWarshipSlot).sort().join();
  ok(war === 'nonwarp_battleship,nonwarp_destroyer,nonwarp_frigate,warp_battleship,warp_destroyer,warp_frigate', `W11b okręty wojenne = dokładnie sześć slotów modeli właściciela (${war})`);
});

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
