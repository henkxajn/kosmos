// workshop.js — Model Workshop (ARC COMBAT VISUALS, krok CV-1c; plan `docs/design/COMBAT_VISUALS_PLAN.md` §2.11, D-CV-16).
//
// Strona narzędziowa (Live Server: http://127.0.0.1:5500/tools/model-workshop/index.html), bez sprzężenia z grą. Właściciel klika
// na swoim modelu dziób, dyszę, wieżyczki i punkty świetlne, stroi maskę koloru-klucza i zapisuje
// `assets/models/ships/hardpoints/<slot>.json`.
//
// PODGLĄD = GRA: statek stoi w rigu gry (`buildShipRig` — klony materiałów z maską `KeyColourEmission`, punkty `ShipLightPoints`,
// smuga z dyszy), wspólne uniformy maski ustawione z pokręteł gry `LIVE_CV_FX` (jak `ThreeRenderer._tickCvModels`), ten sam
// potok obrazu (log-depth, ACES 1,12, sRGB, bloom z progiem 1,0, `OutputPass`). Czysta logika (punkty, lustro, cofnij / ponów,
// suwaki, zapis zgodny ze schematem, sesja) — `WorkshopLogic.js` (keeper `cv_workshop_logic_smoke`).
//
// ZAPIS: File System Access API (uchwyt katalogu `hardpoints/` w IndexedDB — przeżywa przeładowanie), zapas: pobranie pliku.
// Zapis pliku w repo = Live Server przeładowuje stronę ⇒ stan edycji (slot, punkty, suwaki, historia) w sessionStorage.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildShipRig, disposeShipRig, RIG_PALETTE } from '../../src/renderer/ShipModelRig.js';
import { KC_SHARED, setKeyColourParams, keyColourMask, keyColourUniformsOf } from '../../src/renderer/KeyColourEmission.js';
import { LightPointPool } from '../../src/renderer/ShipLightPoints.js';
import { defaultHardpoints, hardpointsUrl, INCOMING_INDEX, SHIP_MODEL_DIR, INCOMING_DIR } from '../../src/renderer/ShipHardpoints.js';
import { validateHardpoints, formatHardpointsJson } from '../../src/data/ShipHardpointsSchema.js';
import { exhaustGradientColors } from '../../src/utils/VesselFxLogic.js';
import { LIVE_CV_FX } from '../../src/renderer/combat/FxEngine.js';
import * as WL from './WorkshopLogic.js';

// ── stałe ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOT = '../../';                                  // strona leży w tools/model-workshop/
const SESSION_KEY = 'kosmos-model-workshop-v1';
const IDB = { name: 'kosmos-model-workshop', store: 'handles', key: 'hardpointsDir' };
const DEFAULT_SLOT = 'warp_frigate';
// Kopie stałych modułu ThreeRenderer (nieeksportowane — strona nie może importować całej gry):
const FX_HDR_EXHAUST = 4.5;                             // `FX_HDR_EXHAUST` — wzmocnienie kolorów smugi
const STAR_BASE_INTENSITY = 2.8, STAR_LUM_EXP = 0.22;   // `_starLightBaseline`: natężenie 2,8 × L^0,22
const AMBIENT_BASE = 0x101a26, AMBIENT_COOL = 0x0a1c4d, AMBIENT_COOL_MIX = 0.6;   // ambient 0,4; gwiazdy M / K — chłodniejszy odcień
// Barwa i jasność klas (GameConfig `STAR_TYPES`).
const STAR_PRESETS = Object.freeze({
  F: { color: 0xffffff, lum: 3.0 }, G: { color: 0xfffacd, lum: 1.0 }, K: { color: 0xffaa55, lum: 0.4 }, M: { color: 0xff6b47, lum: 0.04 },
});
const MODE_HINT = Object.freeze({
  bow: '<b>Dziób</b> — kliknij czubek dziobu (kierunek zaokrąglamy do osi modelu). Następny krok: <b>2 Dysza</b>.',
  nozzle: '<b>Dysza</b> — kliknij wylot silnika na rufie; smuga pojawi się od razu. Następny krok: <b>3 Wieżyczki</b>.',
  weapons: '<b>Wieżyczki</b> — klikaj działa na kadłubie (W1, W2…). LUSTRO stawia bliźniaka po drugiej burcie.',
  lights: '<b>Światła</b> — klikaj okna i światła pozycyjne w wybranym kolorze. LUSTRO jak przy wieżyczkach.',
  select: '<b>Wybierz</b> — kliknij punkt, przeciągnij go po kadłubie albo usuń <b>Del</b>. Pusty klik odznacza.',
});
const CLICK_PX = 5;          // [px] dłuższe przesunięcie myszy = obrót kamery, nie klik
const PICK_PX = 14;          // [px] promień wyboru istniejącego punktu
const TWIN_SNAP_MAX = 0.05;  // [przestrzeń znormalizowana] bliźniak „przyklejony" do kadłuba, jeśli kadłub jest tak blisko odbicia

const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);

// ── stan strony ────────────────────────────────────────────────────────────────────────────────────────────────────────
const S = {
  slot: null, variant: 'slot', baseDoc: null, fileEdit: null, fileSig: null, fileWarn: null,
  history: null, transient: null, shown: null,
  mode: 'bow', mirror: true, swapNav: false, nozzleDir: 'stern', nozzleCentre: true, lightColour: 'cyan', lightSize: WL.LIGHT_SIZE_DEFAULT,
  enemy: false, engine: true, star: 'G', gameFrame: false, markers: true,
  sel: null,                       // { cat: 'weapons'|'lights'|'nozzle', uid }
  template: null, bboxN: null, rig: null, rigKind: null, texData: null,
  down: null, drag: null, saving: false, savedAt: null, dirHandle: null, loadToken: 0, occl: new Map(),
};
const edit = () => S.transient ?? S.history?.present ?? null;

// ── Three.js: renderer i potok obrazu jak w grze ─────────────────────────────────────────────────────────────────────────
const canvas = $('ws-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x07090d, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 200);
camera.position.set(-0.75, 0.55, 1.15);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 0.2;
controls.maxDistance = 60;
const ambient = new THREE.AmbientLight(AMBIENT_BASE, 0.4);
const sun = new THREE.DirectionalLight(0xffffff, STAR_BASE_INTENSITY);   // gwiazda daleko — światło kierunkowe = PointLight bez tłumienia
sun.position.set(-1.3, 1.5, 0.9);
scene.add(ambient, sun);
const grid = new THREE.GridHelper(2.4, 24, 0x2a3442, 0x141a22);
grid.material.transparent = true;
grid.material.opacity = 0.45;
scene.add(grid);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.0, 1.0);   // jak gra: siła 0,5, promień 0, próg 1,0
try { bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.7, 0.4, 0.15, 0.03]; } catch { /* wagi mipów jak gra */ }
composer.addPass(bloom);
composer.addPass(new OutputPass());

const pool = new LightPointPool({ THREE, logDepth: true });
const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

// ── znaczniki (dzieci `canon` — żyją w przestrzeni znormalizowanej, jak hardpointy) ─────────────────────────────────────
const markerRoot = new THREE.Group();
markerRoot.name = 'wsMarkers';
const overlayMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
const bowArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 0.6, 0xffd21f, 0.06, 0.028);
bowArrow.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 10; });
const nozzleRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff9a5a }));
const weaponGeo = new THREE.SphereGeometry(1, 16, 12);
const weaponMeshes = [];
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 40), overlayMat(0xffffff, 0.95));
selRing.renderOrder = 12;
const hoverA = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), overlayMat(0xffffff, 0.55));
const hoverB = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), overlayMat(0xffffff, 0.35));
hoverA.renderOrder = hoverB.renderOrder = 11;
markerRoot.add(bowArrow, nozzleRing, selRing, hoverA, hoverB);
hoverA.visible = hoverB.visible = selRing.visible = false;

// ── wczytanie slotu ─────────────────────────────────────────────────────────────────────────────────────────────────────
function modelUrl(slot, variant) { return ROOT + (variant === 'incoming' ? INCOMING_DIR : SHIP_MODEL_DIR) + slot + '.glb'; }

async function fetchDoc(slot, variant) {
  try {
    const res = await fetch(ROOT + hardpointsUrl(slot, variant), { cache: 'no-store' });
    if (!res.ok) return { doc: defaultHardpoints(slot), warn: `Brak pliku hardpointów (${res.status}) — wartości zapasowe gry; zapis utworzy plik.` };
    const doc = await res.json();
    const v = validateHardpoints(doc);
    if (!v.ok) return { doc: defaultHardpoints(slot), warn: 'Plik hardpointów niepoprawny — wartości zapasowe gry: ' + v.errors.slice(0, 3).join('; ') };
    return { doc, warn: null };
  } catch (e) {
    return { doc: defaultHardpoints(slot), warn: 'Nie udało się wczytać pliku hardpointów: ' + (e?.message ?? e) };
  }
}

function loadGlb(url) {
  return new Promise((resolve, reject) => loader.load(url, (g) => resolve(g.scene), undefined, reject));
}

function disposeTemplate(tpl) {
  tpl?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose?.();
    for (const m of [].concat(o.material ?? [])) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) m[k]?.dispose?.();
      m.dispose?.();
    }
  });
}

/** Prostopadłościan modelu w przestrzeni znormalizowanej (do strzałki dziobu). */
function normalizedBounds(tpl) {
  const box = new THREE.Box3().setFromObject(tpl);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const m = Math.max(size.x, size.y, size.z) || 1;
  return { min: box.min.clone().sub(c).divideScalar(m).toArray(), max: box.max.clone().sub(c).divideScalar(m).toArray() };
}

async function loadSlot(slot, variant = 'slot', { session = null } = {}) {
  const token = ++S.loadToken;
  $('loading').classList.remove('hidden');
  $('loading').textContent = `Wczytywanie ${slot}…`;
  clearNotes();
  const [{ doc, warn }, tpl] = await Promise.all([
    fetchDoc(slot, variant),
    loadGlb(modelUrl(slot, variant)).catch((e) => { console.error(e); return null; }),
  ]);
  if (token !== S.loadToken) { disposeTemplate(tpl); return; }   // w międzyczasie wybrano inny slot
  if (!tpl) {
    $('loading').textContent = `Nie udało się wczytać modelu ${modelUrl(slot, variant)}`;
    return;
  }
  if (S.rig) { S.rig.root.removeFromParent(); disposeShipRig(S.rig, pool); S.rig = null; }
  disposeTemplate(S.template);
  S.slot = slot; S.variant = variant; S.baseDoc = doc; S.fileWarn = warn;
  S.fileEdit = WL.editFromDoc(doc);
  S.fileSig = WL.editSignature(doc, S.fileEdit);
  S.template = tpl; S.bboxN = normalizedBounds(tpl); S.texData = null;
  S.sel = null; S.transient = null; S.shown = null;
  S.history = WL.createHistory(S.fileEdit);
  S.savedAt = null;
  if (session && session.slot === slot && session.variant === variant) {
    S.history = session.history;
    S.savedAt = session.savedAt;
    const curSig = WL.editSignature(doc, S.history.present);
    if (curSig === S.fileSig) {
      if (session.savedAt && Date.now() - session.savedAt < 120000) note(`✔ Zapisano <b>${slot}.json</b> — plik wczytany ponownie z dysku, punkty się zgadzają.`, 'ok', { ttl: 8000 });
    } else {
      note('Przywrócono <b>niezapisane zmiany</b> z tej karty (strona się przeładowała).', 'warn', {
        buttons: [{ label: 'Odrzuć zmiany (wczytaj plik)', onClick: () => { S.history = WL.createHistory(S.fileEdit); S.sel = null; refresh(true); } }],
      });
    }
  }
  if (warn) note(warn, 'warn');
  $('slotSel').value = (variant === 'incoming' ? 'incoming/' : '') + slot;
  $('slotInfo').innerHTML = `${WL.slotLabelPL(slot)} · <span class="muted">${variant === 'incoming' ? 'kandydat z incoming/' : 'slot gry'}`
    + ` · ${doc.source?.normalizer ?? 'bez normalizatora'}</span>`;
  $('loading').classList.add('hidden');
  refresh(true);
  frameCamera('near');
  extractTexture();
}

// ── rig i znaczniki ─────────────────────────────────────────────────────────────────────────────────────────────────────
function kindNow() { return S.enemy ? 'enemy' : 'own'; }

function rebuildRig(e) {
  if (!S.template) return;
  const doc = WL.buildDoc(S.baseDoc, e);
  if (S.rig) { S.rig.root.removeFromParent(); disposeShipRig(S.rig, pool); }
  const rig = buildShipRig({
    THREE, template: S.template, hardpoints: doc, targetSize: 1, kind: kindNow(),
    lightPool: doc.lights.length ? pool : null, lightKey: `ws/${S.variant}/${S.slot}`,
    exhaust: { gradient: exhaustGradientColors({ isEnemy: S.enemy }), hdr: FX_HDR_EXHAUST },
    enemyRimHex: RIG_PALETTE.ENEMY_RIM,
  });
  applyFrameView(rig);
  rig.canon.add(markerRoot);
  scene.add(rig.root);
  rig.root.updateMatrixWorld(true);
  S.rig = rig;
  S.rigKind = kindNow();
}

function applyFrameView(rig = S.rig) {
  if (!rig) return;
  if (S.gameFrame) rig.canon.quaternion.set(...rig.frameQuat); else rig.canon.quaternion.identity();
  rig.root.updateMatrixWorld(true);
}

const sameVec = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Zsynchronizuj scenę ze stanem edycji (przebudowa rigu tylko, gdy zmieniła się rama, dysza albo światła). */
function sync3D(force = false) {
  const e = edit();
  if (!e || !S.template) return;
  const p = S.shown;
  const radiusOnly = p && e.nozzle && p.nozzle && e.nozzle !== p.nozzle && sameVec(e.nozzle.p, p.nozzle.p) && sameVec(e.nozzle.d, p.nozzle.d)
    && e.frame === p.frame && e.lights === p.lights;
  if (force || !S.rig || !p || S.rigKind !== kindNow() || (!radiusOnly && (e.frame !== p.frame || e.nozzle !== p.nozzle || e.lights !== p.lights))) {
    rebuildRig(e);
  } else {
    if (radiusOnly) S.rig.nozzleR = e.nozzle.r;
    if (e.keyColour !== p.keyColour) for (const m of S.rig.materials) setKeyColourParams(m, e.keyColour);
  }
  S.shown = e;
  updateMarkers();
  scheduleOcclusion();
}

function updateMarkers() {
  const e = edit();
  markerRoot.visible = S.markers && !!e;
  if (!e) return;
  // strzałka dziobu NAD kadłubem (widać ją zawsze — rysowana bez testu głębi)
  const bow = e.frame.bow, up = WL.orthoUp(e.frame);
  const corners = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) corners.push([S.bboxN.min[0] * (1 - x) + S.bboxN.max[0] * x, S.bboxN.min[1] * (1 - y) + S.bboxN.max[1] * y, S.bboxN.min[2] * (1 - z) + S.bboxN.max[2] * z]);
  const top = Math.max(...corners.map((c) => c[0] * up[0] + c[1] * up[1] + c[2] * up[2]));
  const o = [up[0] * (top + 0.07) - bow[0] * 0.3, up[1] * (top + 0.07) - bow[1] * 0.3, up[2] * (top + 0.07) - bow[2] * 0.3];
  bowArrow.position.set(...o);
  bowArrow.setDirection(new THREE.Vector3(...bow));
  // dysza
  nozzleRing.visible = !!e.nozzle;
  if (e.nozzle) {
    nozzleRing.position.set(...e.nozzle.p);
    nozzleRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...e.nozzle.d).normalize());
    const r = Math.max(e.nozzle.r, 0.01);
    nozzleRing.scale.set(r, r, r);
  }
  // wieżyczki
  while (weaponMeshes.length < e.weapons.length) {
    const m = new THREE.Mesh(weaponGeo, new THREE.MeshBasicMaterial({ color: 0xffb000 }));
    weaponMeshes.push(m);
    markerRoot.add(m);
  }
  weaponMeshes.forEach((m, i) => {
    const w = e.weapons[i];
    m.visible = !!w;
    if (!w) return;
    const sel = S.sel?.cat === 'weapons' && S.sel.uid === w.uid;
    m.position.set(...w.p);
    m.scale.setScalar(sel ? 0.018 : 0.013);
    m.material.color.setHex(sel ? 0xffffff : 0xffb000);
  });
  // pierścień zaznaczenia
  const sp = selectedPoint();
  selRing.visible = !!sp;
  if (sp) {
    selRing.position.set(...sp.p);
    const s = sp.cat === 'lights' ? Math.max(0.012, sp.size * 0.9) : (sp.cat === 'nozzle' ? Math.max(0.02, (e.nozzle?.r ?? 0.04) * 1.3) : 0.024);
    selRing.scale.setScalar(s);
  }
}

function selectedPoint() {
  const e = edit();
  if (!e || !S.sel) return null;
  if (S.sel.cat === 'nozzle') return e.nozzle ? { cat: 'nozzle', p: e.nozzle.p } : null;
  const list = S.sel.cat === 'weapons' ? e.weapons : e.lights;
  const it = list.find((x) => x.uid === S.sel.uid);
  return it ? { cat: S.sel.cat, p: it.p, size: it.size ?? 0 } : null;
}

// ── podpisy (HTML nad płótnem) ───────────────────────────────────────────────────────────────────────────────────────────
const labelEls = new Map();
const tmpV = new THREE.Vector3();
function screenOf(p) {
  if (!S.rig) return null;
  tmpV.set(p[0], p[1], p[2]);
  S.rig.canon.localToWorld(tmpV);
  const camSpace = tmpV.clone().applyMatrix4(camera.matrixWorldInverse);
  const depth = -camSpace.z;
  tmpV.project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: (tmpV.x * 0.5 + 0.5) * r.width, y: (-tmpV.y * 0.5 + 0.5) * r.height, depth, inView: depth > 0 && Math.abs(tmpV.x) <= 1.05 && Math.abs(tmpV.y) <= 1.05 };
}
function updateLabels() {
  const e = edit();
  const want = new Map();
  if (e && S.markers && S.rig) {
    const tipLocal = [bowArrow.position.x + e.frame.bow[0] * 0.6, bowArrow.position.y + e.frame.bow[1] * 0.6, bowArrow.position.z + e.frame.bow[2] * 0.6];
    want.set('bow', { p: tipLocal, text: 'DZIÓB', cls: 'bow' });
    if (e.nozzle) want.set('noz', { p: e.nozzle.p, text: 'DYSZA', cls: 'noz', occ: S.occl.get('noz') });
    WL.weaponIds(e).forEach((id, i) => {
      const w = e.weapons[i];
      const sel = S.sel?.cat === 'weapons' && S.sel.uid === w.uid;
      want.set('w' + w.uid, { p: w.p, text: id, cls: sel ? 'sel' : '', occ: S.occl.get('w' + w.uid) });
    });
    const sp = selectedPoint();
    if (sp && sp.cat === 'lights') want.set('selL', { p: sp.p, text: '💡', cls: 'sel' });
  }
  for (const [k, el] of labelEls) if (!want.has(k)) { el.remove(); labelEls.delete(k); }
  for (const [k, w] of want) {
    let el = labelEls.get(k);
    if (!el) { el = document.createElement('div'); el.className = 'lbl'; $('labels').appendChild(el); labelEls.set(k, el); }
    const s = screenOf(w.p);
    if (!s || !s.inView) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.textContent = w.text;
    el.className = 'lbl ' + (w.cls || '') + (w.occ ? ' dim' : '');
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
  }
}

// Zasłonięcie punktów kadłubem (podpisy przygaszone, wybór pomija) — liczone po ruchu kamery i po edycji, nie co klatkę.
let occlTimer = 0;
function scheduleOcclusion() { clearTimeout(occlTimer); occlTimer = setTimeout(computeOcclusion, 120); }
function isOccluded(p) {
  if (!S.rig) return false;
  const w = S.rig.canon.localToWorld(new THREE.Vector3(...p));
  const dir = w.clone().sub(camera.position);
  const dist = dir.length();
  raycaster.set(camera.position, dir.normalize());
  raycaster.far = dist;
  const h = raycaster.intersectObject(S.rig.model, true)[0];
  raycaster.far = Infinity;
  return !!h && h.distance < dist - 0.006;
}
function computeOcclusion() {
  const e = edit();
  S.occl.clear();
  if (!e || !S.rig) return;
  if (e.nozzle) S.occl.set('noz', isOccluded(e.nozzle.p));
  for (const w of e.weapons) S.occl.set('w' + w.uid, isOccluded(w.p));
}

// ── klikanie ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function hullHit(clientX, clientY) {
  if (!S.rig) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const h = raycaster.intersectObject(S.rig.model, true)[0];
  if (!h) return null;
  const m = S.rig.canon.matrixWorld.elements;
  const p = WL.worldToModel(h.point.toArray(), m);
  const nWorld = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).toArray() : null;
  const n = nWorld ? WL.dirWorldToModel(nWorld, m) : null;
  return p ? { p, n } : null;
}

/** Oś najdłuższa modelu (przestrzeń znormalizowana) — dziób leży na niej. */
function longAxis() { return S.bboxN ? WL.longestAxisOf(S.bboxN.min, S.bboxN.max) : null; }

/** Promień w przestrzeni MODELU → pierwsze trafienie kadłuba { p, n } (przestrzeń modelu) albo null; `far` w długościach statku. */
function castModel(o, dir, far) {
  if (!S.rig) return null;
  const canon = S.rig.canon;
  canon.updateMatrixWorld(true);
  const from = canon.localToWorld(new THREE.Vector3(o[0], o[1], o[2]));
  const dw = new THREE.Vector3(dir[0], dir[1], dir[2]).transformDirection(canon.matrixWorld);
  const s = canon.getWorldScale(new THREE.Vector3()).x || 1;
  raycaster.set(from, dw);
  raycaster.far = far * s;
  const h = raycaster.intersectObject(S.rig.model, true)[0];
  raycaster.far = Infinity;
  if (!h) return null;
  const m = canon.matrixWorld.elements;
  const nWorld = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).toArray() : null;
  return { p: WL.worldToModel(h.point.toArray(), m), n: nWorld ? WL.dirWorldToModel(nWorld, m) : null };
}

/**
 * Dysza w środku otworu (pierścień, dzwon): z punktu kliku (lekko w stronę wylotu i do wnętrza otworu) promienie w płaszczyźnie
 * ⟂ smugi; trafienia w ściany → okrąg → środek i promień (`WL.openingFromHits`), dwa przebiegi z nowego środka. Za mało trafień —
 * null (dysza zostaje w punkcie kliku: płaska rufa, zewnętrzna krawędź).
 */
function nozzleInOpening(p, n, d) {
  const dn = WL.orthoUp({ bow: d, up: n ?? [0, 1, 0] });   // składowa normalnej ⟂ d (dla ściany tunelu — ku osi otworu)
  const inward = n && Math.abs(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) < 0.95 ? dn : [0, 0, 0];
  let origin = [0, 1, 2].map((k) => p[k] + d[k] * WL.OPENING.STEP + inward[k] * WL.OPENING.STEP);
  const ring = (o) => {
    const hits = [];
    for (const dir of WL.openingRayDirs(d)) { const h = castModel(o, dir, WL.OPENING.FAR); if (h?.p) hits.push(h.p); }
    return WL.openingFromHits({ origin: o, d, hits });
  };
  let best = null;
  for (let pass = 0; pass < 3; pass++) {
    const res = ring(origin);
    if (!res) break;
    best = res;
    origin = res.centre;
  }
  if (!best) return null;
  // Do WYLOTU: wzdłuż smugi, dopóki przekrój jest wciąż otworem — dysza = środek ostatniego przekroju (smuga zaczyna się w ujściu,
  // nie w głębi tunelu), promień = promień ujścia. Wynik nie zależy od tego, jak głęboko trafił klik (sonda 2026-11-11).
  // Pojedynczy przekrój bywa „dziurawy” (szczeliny w pierścieniu) — marsz kończą dopiero MOUTH_GAP kolejne przekroje bez otworu.
  let probe = best.centre, misses = 0;
  for (let i = 1; i <= WL.OPENING.MOUTH_STEPS && misses < WL.OPENING.MOUTH_GAP; i++) {
    probe = [0, 1, 2].map((k) => probe[k] + d[k] * WL.OPENING.MOUTH_STEP);
    const res = ring(probe);
    if (res) { best = res; misses = 0; probe = res.centre; } else misses++;
  }
  return best;
}

/** Bliźniak lustrzany „przyklejony" do kadłuba (model rzadko jest idealnie symetryczny); bez kadłuba w pobliżu — dokładne odbicie. */
function twinOnHull(p, n) {
  const q = WL.mirrorPoint(p, edit().frame);
  if (!S.rig || !n) return q;
  const nq = WL.mirrorDir(n, edit().frame);
  const canon = S.rig.canon;
  const from = canon.localToWorld(new THREE.Vector3(q[0] + nq[0] * 0.03, q[1] + nq[1] * 0.03, q[2] + nq[2] * 0.03));
  const dirW = new THREE.Vector3(-nq[0], -nq[1], -nq[2]).transformDirection(canon.matrixWorld);
  raycaster.set(from, dirW);
  raycaster.far = 0.08;
  const h = raycaster.intersectObject(S.rig.model, true)[0];
  raycaster.far = Infinity;
  if (!h) return q;
  const s = WL.worldToModel(h.point.toArray(), canon.matrixWorld.elements);
  return s && Math.hypot(s[0] - q[0], s[1] - q[1], s[2] - q[2]) < TWIN_SNAP_MAX ? s : q;
}

function placeAt(clientX, clientY) {
  const hit = hullHit(clientX, clientY);
  if (!hit) { note('Klik obok kadłuba — kliknij na model.', 'warn', { ttl: 2500 }); return; }
  const e = S.history.present;
  const { p, n } = hit;
  if (S.mode === 'bow') {
    // Dziób na osi najdłuższej modelu, „góra” z PLIKU (nigdy nie przeskakuje); klik przy środku statku — odmowa.
    const { bow } = WL.bowFromClick(p, { longAxis: longAxis() });
    if (!bow) { note('To środek statku — kliknij <b>czubek dziobu</b> (koniec kadłuba).', 'warn', { ttl: 3500 }); return; }
    const next = WL.setBow(e, p, { longAxis: longAxis(), upPref: S.fileEdit?.frame?.up ?? null });
    commit(next);
    note(`Dziób: ${axisName(next.frame.bow)}. Następny krok: <b>2 Dysza</b>.`, 'ok', { ttl: 3500 });
  } else if (S.mode === 'nozzle') {
    const d = WL.nozzleDirection(S.nozzleDir, e.frame, n);
    const op = S.nozzleCentre ? nozzleInOpening(p, n, d) : null;
    commit(WL.setNozzle(e, op ? op.centre : p, d, op ? op.r : (e.nozzle?.r ?? 0.04)));
    S.sel = { cat: 'nozzle', uid: 0 };
    if (op) note(`Dysza w środku otworu (promień ${op.r.toFixed(3)}). Smuga wychodzi ze środka wylotu.`, 'ok', { ttl: 4000 });
  } else if (S.mode === 'weapons' || S.mode === 'lights') {
    const cat = S.mode;
    const mirror = S.mirror && !WL.onMirrorPlane(p, e.frame);
    const r = WL.addPoint(e, cat, p, {
      mirror, twinP: mirror ? twinOnHull(p, n) : null,
      colour: WL.LIGHT_COLOURS[S.lightColour], size: S.lightSize, swapNav: S.swapNav,
    });
    S.sel = { cat, uid: r.uid };
    commit(r.edit);
  }
  refresh();
}

function axisName(v) {
  const i = v.findIndex((c) => Math.abs(c) > 0.5);
  return (v[i] > 0 ? '+' : '−') + 'XYZ'[i] + ' (oś modelu)';
}

function pickAt(clientX, clientY) {
  const e = edit();
  if (!e || !S.rig) return null;
  const r = canvas.getBoundingClientRect();
  const x = clientX - r.left, y = clientY - r.top;
  const items = [];
  if (e.nozzle) items.push({ cat: 'nozzle', uid: 0, p: e.nozzle.p });
  for (const w of e.weapons) items.push({ cat: 'weapons', uid: w.uid, p: w.p });
  for (const l of e.lights) items.push({ cat: 'lights', uid: l.uid, p: l.p });
  const pts = items.map((it) => {
    const s = screenOf(it.p);
    if (!s) return null;
    const close = Math.hypot(s.x - x, s.y - y) <= PICK_PX;
    return { ...s, occluded: close ? isOccluded(it.p) : false };
  });
  const i = WL.pickNearest(pts, x, y, PICK_PX);
  return i >= 0 ? items[i] : null;
}

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || !S.rig) return;
  S.down = { x: ev.clientX, y: ev.clientY, moved: false };
  if (S.mode === 'select') {
    const hit = pickAt(ev.clientX, ev.clientY);
    if (hit) {
      S.sel = { cat: hit.cat, uid: hit.uid };
      S.drag = { cat: hit.cat, uid: hit.uid, started: false };
      controls.enabled = false;   // nasłuch w fazie przechwytywania — OrbitControls nie zacznie obrotu
      refresh();
    }
  }
}, { capture: true });

window.addEventListener('pointermove', (ev) => {
  if (S.down && Math.hypot(ev.clientX - S.down.x, ev.clientY - S.down.y) > CLICK_PX) S.down.moved = true;
  if (S.drag && (ev.buttons & 1)) {
    if (!S.down?.moved) return;
    S.drag.started = true;
    const hit = hullHit(ev.clientX, ev.clientY);
    if (!hit) return;
    const base = S.history.present;
    let next;
    if (S.drag.cat === 'nozzle') next = WL.setNozzle(base, hit.p, WL.nozzleDirection(S.nozzleDir, base.frame, hit.n), base.nozzle?.r);
    else {
      const list = S.drag.cat === 'weapons' ? base.weapons : base.lights;
      const it = list.find((x) => x.uid === S.drag.uid);
      next = WL.movePoint(base, S.drag.cat, S.drag.uid, hit.p, { mirror: S.mirror, twinP: S.mirror && it?.twin !== null ? twinOnHull(hit.p, hit.n) : null });
    }
    S.transient = next;
    sync3D();
    return;
  }
  if (!ev.buttons && ev.target === canvas) hoverAt(ev.clientX, ev.clientY);
});

window.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0) return;
  const down = S.down;
  S.down = null;
  if (S.drag) {
    const d = S.drag;
    S.drag = null;
    controls.enabled = true;
    if (d.started && S.transient) commit(S.transient); else refresh();
    return;
  }
  if (!down || down.moved || ev.target !== canvas) return;
  if (S.mode === 'select') { S.sel = null; refresh(); return; }
  placeAt(ev.clientX, ev.clientY);
});

let hoverPending = null;
function hoverAt(x, y) {
  hoverPending = { x, y };
}
function applyHover() {
  if (!hoverPending) return;
  const { x, y } = hoverPending;
  hoverPending = null;
  const addMode = S.mode !== 'select';
  const hit = addMode ? hullHit(x, y) : null;
  hoverA.visible = !!hit;
  hoverB.visible = false;
  if (!hit) return;
  const col = S.mode === 'lights' ? WL.LIGHT_COLOURS[S.lightColour] : (S.mode === 'weapons' ? '#ffb000' : (S.mode === 'nozzle' ? '#ff9a5a' : '#fff36a'));
  hoverA.material.color.set(col);
  hoverA.position.set(...hit.p);
  const s = S.mode === 'lights' ? Math.max(0.006, S.lightSize * 0.5) : 0.012;
  hoverA.scale.setScalar(s);
  if ((S.mode === 'weapons' || S.mode === 'lights') && S.mirror && !WL.onMirrorPlane(hit.p, edit().frame)) {
    hoverB.visible = true;
    hoverB.material.color.set(S.mode === 'lights' ? WL.twinColour(col, S.swapNav) : col);
    hoverB.position.set(...WL.mirrorPoint(hit.p, edit().frame));
    hoverB.scale.setScalar(s);
  }
}
canvas.addEventListener('pointerleave', () => { hoverA.visible = hoverB.visible = false; });
controls.addEventListener('end', () => { scheduleOcclusion(); persistSoon(); });

// ── historia i stan ──────────────────────────────────────────────────────────────────────────────────────────────────────
function commit(next) {
  if (!next) return;
  S.history = WL.historyPush(S.history, next);
  S.transient = null;
  refresh();
}
function undo() { S.history = WL.historyUndo(S.history); S.transient = null; fixSelection(); refresh(); }
function redo() { S.history = WL.historyRedo(S.history); S.transient = null; fixSelection(); refresh(); }
function fixSelection() { if (S.sel && !selectedPoint()) S.sel = null; }
const isDirty = () => !!S.history && WL.editSignature(S.baseDoc, S.history.present) !== S.fileSig;

function refresh(force = false) {
  if (!S.history) return;
  sync3D(force);
  updatePanel();
  persistSoon();
}

// ── panel ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const fmt = (v, d = 3) => v.map((c) => c.toFixed(d)).join(', ');
function updatePanel() {
  const e = edit();
  if (!e) return;
  for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === S.mode);
  for (const b of document.querySelectorAll('[data-star]')) b.classList.toggle('on', b.dataset.star === S.star);
  for (const b of document.querySelectorAll('[data-col]')) b.classList.toggle('on', b.dataset.col === S.lightColour);
  $('optNozzle').classList.toggle('hidden', S.mode !== 'nozzle');
  $('optLights').classList.toggle('hidden', S.mode !== 'lights' && !(S.mode === 'select' && S.sel?.cat === 'lights'));
  $('optMirror').classList.toggle('hidden', S.mode === 'bow' || S.mode === 'nozzle');
  $('mirrorChk').checked = S.mirror;
  $('swapNavChk').checked = S.swapNav;
  $('hint').innerHTML = MODE_HINT[S.mode];
  $('bowInfo').textContent = axisName(e.frame.bow);
  $('nozInfo').innerHTML = e.nozzle ? `(${fmt(e.nozzle.p)}) · r ${e.nozzle.r.toFixed(3)}` : '<span style="color:var(--warn)">brak — statek bez smugi</span>';
  $('nozR').value = e.nozzle?.r ?? 0.04;
  $('nozRv').textContent = (e.nozzle?.r ?? 0.04).toFixed(3);
  const selLight = S.mode === 'select' && S.sel?.cat === 'lights' ? e.lights.find((l) => l.uid === S.sel.uid) : null;
  const sz = selLight ? selLight.size : S.lightSize;
  $('lightSize').value = sz;
  $('lightSizeV').textContent = sz.toFixed(3);
  $('countInfo').textContent = `· ${e.weapons.length} wieżyczek · ${e.lights.length} świateł`;
  // listy
  const wl = $('weaponList');
  wl.innerHTML = '';
  WL.weaponIds(e).forEach((id, i) => {
    const w = e.weapons[i];
    const c = document.createElement('span');
    c.className = 'chip' + (S.sel?.cat === 'weapons' && S.sel.uid === w.uid ? ' sel' : '');
    c.textContent = id + (w.twin !== null ? ' ⇄' : '');
    c.title = `(${fmt(w.p)})` + (w.twin !== null ? ' — ma bliźniaka (lustro)' : '');
    c.onclick = () => { S.sel = { cat: 'weapons', uid: w.uid }; refresh(); };
    wl.appendChild(c);
  });
  if (!e.weapons.length) wl.innerHTML = '<span class="muted">— brak —</span>';
  const ll = $('lightList');
  ll.innerHTML = '';
  e.lights.forEach((l, i) => {
    const c = document.createElement('span');
    c.className = 'chip' + (S.sel?.cat === 'lights' && S.sel.uid === l.uid ? ' sel' : '');
    c.innerHTML = `<i style="background:${l.colour}"></i>${i + 1}${l.twin !== null ? ' ⇄' : ''}`;
    c.title = `(${fmt(l.p)}) · rozmiar ${l.size.toFixed(3)}`;
    c.onclick = () => { S.sel = { cat: 'lights', uid: l.uid }; refresh(); };
    ll.appendChild(c);
  });
  if (!e.lights.length) ll.innerHTML = '<span class="muted">— brak —</span>';
  // zaznaczenie
  const sp = selectedPoint();
  $('selBox').classList.toggle('hidden', !sp);
  if (sp) {
    const idx = sp.cat === 'weapons' ? e.weapons.findIndex((w) => w.uid === S.sel.uid) : e.lights.findIndex((l) => l.uid === S.sel.uid);
    $('selName').textContent = sp.cat === 'nozzle' ? 'dysza' : (sp.cat === 'weapons' ? `wieżyczka W${idx + 1}` : `światło ${idx + 1}` + (S.mode === 'select' ? ' — kolor i rozmiar poniżej zmieniają je' : ''));
  }
  $('undoBtn').disabled = !WL.canUndo(S.history);
  $('redoBtn').disabled = !WL.canRedo(S.history);
  $('clrW').disabled = !e.weapons.length;
  $('clrL').disabled = !e.lights.length;
  // maska
  $('maskChk').checked = e.keyColour.mode === 'mask';
  const sv = WL.slidersFromKeyColour(e.keyColour);
  for (const s of WL.SLIDERS) {
    const inp = $('sl_' + s.key), out = $('slv_' + s.key);
    if (inp && document.activeElement !== inp) inp.value = sv[s.key];
    if (out) out.textContent = sv[s.key] + s.unit;
  }
  updateMaskStat();
  // zapis
  const dirty = isDirty();
  $('saveBtn').classList.toggle('dirty', dirty);
  $('dirtyFlag').innerHTML = dirty ? '<span style="color:var(--warn)">● niezapisane zmiany</span>' : '✔ zgodne z plikiem';
  const v = WL.docFromEdit(S.baseDoc, e);
  $('errBox').textContent = v.ok ? '' : 'Dokument niepoprawny — zapis zablokowany:\n' + v.errors.slice(0, 5).join('\n');
  $('saveBtn').disabled = !v.ok;
  $('dlBtn').disabled = !v.ok;
}

function buildSliders() {
  const box = $('sliders');
  for (const s of WL.SLIDERS) {
    const row = document.createElement('div');
    row.className = 'slider';
    row.innerHTML = `<span>${s.label}</span><input type="range" id="sl_${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" /><span class="v" id="slv_${s.key}"></span>`;
    box.appendChild(row);
    const inp = row.querySelector('input');
    inp.addEventListener('input', () => {
      const vals = { ...WL.slidersFromKeyColour(S.history.present.keyColour), [s.key]: Number(inp.value) };
      S.transient = WL.setKeyColour(S.history.present, WL.keyColourFromSliders(vals, S.history.present.keyColour.mode));
      sync3D();
      updatePanel();
    });
    inp.addEventListener('change', () => { if (S.transient) commit(S.transient); });
  }
}

// Udział tekstury, który świeci z maski (lustro JS chunku GLSL gry — `keyColourMask`), na próbce 512×512 koloru bazowego.
function extractTexture() {
  S.texData = null;
  const mat = S.rig?.materials.find((m) => m.map?.image);
  const img = mat?.map?.image;
  if (!img) { updateMaskStat(); return; }
  try {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 512, 512);
    S.texData = g.getImageData(0, 0, 512, 512).data;
  } catch (e) { console.warn('[Workshop] tekstura do statystyki maski:', e); }
  updateMaskStat();
}
let maskTimer = 0;
function updateMaskStat() {
  clearTimeout(maskTimer);
  maskTimer = setTimeout(() => {
    const e = edit();
    if (!e) return;
    if (e.keyColour.mode !== 'mask') { $('maskStat').textContent = 'Maska wyłączona — świecą tylko klikane punkty.'; return; }
    if (!S.texData) { $('maskStat').textContent = 'Maska włączona (brak tekstury do policzenia udziału).'; return; }
    const kc = e.keyColour, d = S.texData;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (keyColourMask(d[i], d[i + 1], d[i + 2], kc) > 0.5) lit++;
    const pct = (100 * lit) / (d.length / 4);
    $('maskStat').textContent = `Świeci ≈ ${pct.toFixed(2)} % tekstury (barwa ${kc.hue}° ± ${kc.hueTol}°).` + (pct === 0 ? ' Ten model nie ma cyjanu na teksturze — zostaw maskę wyłączoną albo dodaj światła.' : '');
  }, 120);
}

// ── gwiazda, kamera ──────────────────────────────────────────────────────────────────────────────────────────────────────
function applyStar() {
  const st = STAR_PRESETS[S.star] ?? STAR_PRESETS.G;
  sun.color.setHex(st.color);
  sun.intensity = STAR_BASE_INTENSITY * Math.pow(st.lum, STAR_LUM_EXP);
  ambient.color.setHex(AMBIENT_BASE);
  if (S.star === 'M' || S.star === 'K') ambient.color.lerp(new THREE.Color(AMBIENT_COOL), AMBIENT_COOL_MIX);
}

function frameCamera(kind) {
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-9) dir.set(-0.75, 0.55, 1.15);
  dir.normalize();
  let d = 1.45;
  if (kind === 'battle') {
    const h = Math.max(1, canvas.clientHeight);
    const pxPerWorldAt1 = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    d = pxPerWorldAt1 / 48;   // statek (długość 1) ≈ 48 px — tak mały jak w bitwie
  }
  controls.target.set(0, 0, 0);
  camera.position.copy(dir.multiplyScalar(d));
  controls.update();
  scheduleOcclusion();
}

// ── zapis ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB.name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB.store);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet() {
  try { const db = await idbOpen(); return await new Promise((res) => { const q = db.transaction(IDB.store).objectStore(IDB.store).get(IDB.key); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); }); } catch { return null; }
}
async function idbPut(handle) {
  try { const db = await idbOpen(); await new Promise((res) => { const t = db.transaction(IDB.store, 'readwrite'); t.objectStore(IDB.store).put(handle, IDB.key); t.oncomplete = res; t.onerror = res; }); } catch { /* bez pamięci uchwytu — zapyta przy następnym zapisie */ }
}

/** Czy katalog to `assets/models/ships/hardpoints` (nazwa + plik `default.json` w środku). */
async function looksLikeHardpointsDir(dir) {
  if (!dir || dir.name !== 'hardpoints') return false;
  try { await dir.getFileHandle('default.json'); return true; } catch { return false; }
}

async function ensurePermission(handle) {
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
}

/** Uchwyt katalogu hardpointów: pamięć strony → IndexedDB → wybór folderu (wymaga gestu — klik „Zapisz"). */
async function getHardpointsDir() {
  let dir = S.dirHandle ?? (await idbGet());
  if (dir && !(await ensurePermission(dir))) dir = null;
  if (!dir) {
    if (typeof window.showDirectoryPicker !== 'function') return { dir: null, why: 'unsupported' };
    try { dir = await window.showDirectoryPicker({ id: 'kosmos-hardpoints', mode: 'readwrite' }); } catch { return { dir: null, why: 'cancel' }; }
  }
  if (!(await looksLikeHardpointsDir(dir))) return { dir: null, why: 'wrongdir', name: dir?.name };
  S.dirHandle = dir;
  await idbPut(dir);
  return { dir, why: null };
}

/** Zapis tekstu do `<katalog>/<slot>.json` (kandydat — do `incoming/`); odczyt kontrolny po zapisie. Eksport dla testu (OPFS). */
async function writeDocTo(dir, slot, variant, text) {
  const target = variant === 'incoming' ? await dir.getDirectoryHandle('incoming') : dir;
  const fh = await target.getFileHandle(slot + '.json', { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
  const back = await (await fh.getFile()).text();
  if (back !== text) throw new Error('odczyt kontrolny różni się od zapisu');
  return true;
}

function confirmSave(slot, variant, doc) {
  return new Promise((resolve) => {
    $('dlgSlot').textContent = `${slot}  —  ${WL.slotLabelPL(slot)}`;
    $('dlgPath').textContent = 'assets/models/ships/' + hardpointsUrl(slot, variant).replace(/^assets\/models\/ships\//, '');
    $('dlgCounts').textContent = `dziób ${axisName(doc.frame.bow)} · dysza ${doc.nozzles.length ? 'tak' : 'BRAK'} · wieżyczki ${doc.weapons.length} · światła ${doc.lights.length} · maska ${doc.keyColour.mode === 'mask' ? 'włączona' : 'wyłączona'}`;
    $('dlg').classList.add('show');
    const done = (v) => { $('dlg').classList.remove('show'); $('dlgOk').onclick = $('dlgCancel').onclick = null; resolve(v); };
    $('dlgOk').onclick = () => done(true);
    $('dlgCancel').onclick = () => done(false);
  });
}

async function save() {
  const r = WL.docFromEdit(S.baseDoc, edit(), { date: today() });
  if (!r.ok) { note('Dokument niepoprawny — nic nie zapisano.', 'bad'); return; }
  if (!(await confirmSave(S.slot, S.variant, r.doc))) return;
  const text = formatHardpointsJson(r.doc);
  const { dir, why, name } = await getHardpointsDir();
  if (!dir) {
    if (why === 'wrongdir') note(`Wybrany folder „${name ?? '?'}" to nie <b>assets/models/ships/hardpoints</b> — nic nie zapisano. Spróbuj jeszcze raz.`, 'bad');
    else if (why === 'unsupported') { note('Ta przeglądarka nie zapisuje plików bezpośrednio — pobieram plik (zapas).', 'warn'); download(text); }
    else note('Nie wybrano folderu — nic nie zapisano. Możesz też „Pobierz plik".', 'warn');
    return;
  }
  S.saving = true;
  S.savedAt = Date.now();   // przed zapisem — przeładowanie przez Live Server może przyjść, zanim zapis się „domknie”
  persistNow();
  try {
    await writeDocTo(dir, S.slot, S.variant, text);
  } catch (e) {
    S.saving = false;
    note('Zapis nie powiódł się: ' + (e?.message ?? e) + ' — możesz „Pobierz plik".', 'bad');
    return;
  }
  // Plik na dysku = ten dokument. Live Server za chwilę przeładuje stronę (i grę) — sesja niesie stan i znacznik zapisu.
  S.baseDoc = r.doc;
  S.fileEdit = WL.editFromDoc(r.doc);
  S.fileSig = WL.editSignature(r.doc, S.fileEdit);
  persistNow();
  note(`✔ Zapisano <b>${S.slot}.json</b> (${r.doc.weapons.length} wieżyczek, ${r.doc.lights.length} świateł). Strona przeładuje się sama.`, 'ok', { ttl: 10000 });
  updatePanel();
  setTimeout(() => { S.saving = false; }, 4000);
}

function download(text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = S.slot + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  note(`Plik <b>${S.slot}.json</b> pobrany. Przenieś go do <b>assets/models/ships/hardpoints/${S.variant === 'incoming' ? 'incoming/' : ''}</b> (zastąp istniejący).`, 'ok', { ttl: 12000 });
}

// ── sesja ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
let persistTimer = 0;
function persistSoon() { clearTimeout(persistTimer); persistTimer = setTimeout(() => persistNow(), 250); }
function persistNow() {
  if (!S.history || !S.slot) return;
  const ui = { mode: S.mode, mirror: S.mirror, swapNav: S.swapNav, nozzleDir: S.nozzleDir, nozzleCentre: S.nozzleCentre, lightColour: S.lightColour, lightSize: S.lightSize,
    enemy: S.enemy, engine: S.engine, star: S.star, gameFrame: S.gameFrame, markers: S.markers,
    cam: { p: camera.position.toArray(), t: controls.target.toArray() } };
  const txt = WL.sessionSnapshot({
    slot: S.slot, variant: S.variant, history: S.history, fileSig: S.fileSig, ui, savedAt: S.savedAt,
  });
  try { sessionStorage.setItem(SESSION_KEY, txt); } catch (e) { console.warn('[Workshop] sessionStorage:', e); }
}

function applyUi(ui) {
  if (!ui) return;
  if (typeof ui.mode === 'string' && MODE_HINT[ui.mode]) S.mode = ui.mode;
  for (const k of ['mirror', 'swapNav', 'nozzleCentre', 'enemy', 'engine', 'gameFrame', 'markers']) if (typeof ui[k] === 'boolean') S[k] = ui[k];
  if (ui.nozzleDir === 'stern' || ui.nozzleDir === 'normal') S.nozzleDir = ui.nozzleDir;
  if (WL.LIGHT_COLOURS[ui.lightColour]) S.lightColour = ui.lightColour;
  if (Number.isFinite(ui.lightSize)) S.lightSize = ui.lightSize;
  if (STAR_PRESETS[ui.star]) S.star = ui.star;
}

// ── komunikaty ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function note(html, kind = '', { ttl = 0, buttons = [] } = {}) {
  const el = document.createElement('div');
  el.className = 'note ' + kind;
  el.innerHTML = html;
  for (const b of buttons) {
    const bt = document.createElement('button');
    bt.textContent = b.label;
    bt.onclick = () => { el.remove(); b.onClick?.(); };
    el.appendChild(bt);
  }
  const x = document.createElement('button');
  x.textContent = '✕';
  x.onclick = () => el.remove();
  el.appendChild(x);
  $('msg').appendChild(el);
  if (ttl) setTimeout(() => el.remove(), ttl);
  return el;
}
function clearNotes() { $('msg').innerHTML = ''; }

// ── UI: wiązania ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function setMode(m) {
  if (!MODE_HINT[m]) return;
  S.mode = m;
  hoverA.visible = hoverB.visible = false;
  refresh();
}

async function buildSlotSelect() {
  const sel = $('slotSel');
  const war = WL.WORKSHOP_SLOTS.filter(WL.isWarshipSlot);
  const rest = WL.WORKSHOP_SLOTS.filter((s) => !WL.isWarshipSlot(s));
  const group = (label, items, prefix = '') => {
    const g = document.createElement('optgroup');
    g.label = label;
    for (const s of items) { const o = document.createElement('option'); o.value = prefix + s; o.textContent = `${s}  —  ${WL.slotLabelPL(s)}`; g.appendChild(o); }
    sel.appendChild(g);
  };
  group('Twoje okręty (modele właściciela)', war);
  group('Pozostałe sloty', rest);
  try {
    const idx = await (await fetch(ROOT + INCOMING_INDEX, { cache: 'no-store' })).json();
    const inc = (idx?.slots ?? []).filter((s) => /^[a-z0-9_]+$/.test(s));
    if (inc.length) group('Kandydaci w incoming/ (przed podmianą slotu)', inc, 'incoming/');
  } catch { /* brak indeksu — bez kandydatów */ }
  sel.addEventListener('change', () => {
    const v = sel.value;
    const variant = v.startsWith('incoming/') ? 'incoming' : 'slot';
    const slot = v.replace(/^incoming\//, '');
    if (isDirty()) {
      sel.value = (S.variant === 'incoming' ? 'incoming/' : '') + S.slot;
      note(`Masz niezapisane zmiany w <b>${S.slot}</b>.`, 'warn', { buttons: [{ label: `Porzuć i otwórz ${slot}`, onClick: () => loadSlot(slot, variant) }] });
      return;
    }
    loadSlot(slot, variant);
  });
}

function bindUi() {
  for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => setMode(b.dataset.mode);
  $('mirrorChk').onchange = (e) => { S.mirror = e.target.checked; refresh(); };
  $('swapNavChk').onchange = (e) => { S.swapNav = e.target.checked; refresh(); };
  for (const r of document.querySelectorAll('input[name=nozDir]')) r.onchange = () => { if (r.checked) S.nozzleDir = r.value; persistSoon(); };
  $('nozCentreChk').onchange = (e) => { S.nozzleCentre = e.target.checked; persistSoon(); };
  $('nozR').addEventListener('input', (ev) => {
    if (!S.history.present.nozzle) return;
    S.transient = WL.setNozzleRadius(S.history.present, Number(ev.target.value));
    sync3D(); updatePanel();
  });
  $('nozR').addEventListener('change', () => { if (S.transient) commit(S.transient); });
  // Kolor i rozmiar: w trybie „Światła" ustawiają NASTĘPNE punkty (świeżo postawione światło jest zaznaczone — nie wolno go
  // wtedy przemalować); w trybie „Wybierz" zmieniają zaznaczone światło (z bliźniakiem, gdy LUSTRO).
  const editSelLight = () => S.mode === 'select' && S.sel?.cat === 'lights';
  for (const b of document.querySelectorAll('[data-col]')) b.onclick = () => {
    S.lightColour = b.dataset.col;
    if (editSelLight()) commit(WL.setLightProps(S.history.present, S.sel.uid, { colour: WL.LIGHT_COLOURS[S.lightColour] }, { mirror: S.mirror, swapNav: S.swapNav }));
    else refresh();
  };
  $('lightSize').addEventListener('input', (ev) => {
    const v = Number(ev.target.value);
    S.lightSize = v;
    if (editSelLight()) { S.transient = WL.setLightProps(S.history.present, S.sel.uid, { size: v }, { mirror: S.mirror }); sync3D(); }
    updatePanel();
  });
  $('lightSize').addEventListener('change', () => { if (S.transient) commit(S.transient); else persistSoon(); });
  $('delBtn').onclick = deleteSelected;
  $('deselBtn').onclick = () => { S.sel = null; refresh(); };
  $('undoBtn').onclick = undo;
  $('redoBtn').onclick = redo;
  $('clrW').onclick = () => { commit(WL.clearCategory(S.history.present, 'weapons')); fixSelection(); refresh(); };
  $('clrL').onclick = () => { commit(WL.clearCategory(S.history.present, 'lights')); fixSelection(); refresh(); };
  for (const b of document.querySelectorAll('[data-revert]')) b.onclick = () => { commit(WL.revertPart(S.history.present, S.fileEdit, b.dataset.revert)); fixSelection(); refresh(); };
  $('maskChk').onchange = (e) => commit(WL.setKeyColour(S.history.present, { mode: e.target.checked ? 'mask' : 'none' }));
  $('enemyChk').onchange = (e) => { S.enemy = e.target.checked; refresh(true); };
  $('engineChk').onchange = (e) => { S.engine = e.target.checked; persistSoon(); };
  $('frameChk').onchange = (e) => { S.gameFrame = e.target.checked; applyFrameView(); scheduleOcclusion(); persistSoon(); };
  $('markersChk').onchange = (e) => { S.markers = e.target.checked; refresh(); };
  for (const b of document.querySelectorAll('[data-star]')) b.onclick = () => { S.star = b.dataset.star; applyStar(); refresh(); };
  $('camNear').onclick = () => frameCamera('near');
  $('camBattle').onclick = () => frameCamera('battle');
  $('saveBtn').onclick = () => save();
  $('dlBtn').onclick = () => { const r = WL.docFromEdit(S.baseDoc, edit(), { date: today() }); if (r.ok) download(formatHardpointsJson(r.doc)); };
  window.addEventListener('keydown', (ev) => {
    const tag = (ev.target?.tagName ?? '').toLowerCase();
    if (tag === 'select' || (tag === 'input' && ev.target.type !== 'range' && ev.target.type !== 'checkbox' && ev.target.type !== 'radio')) return;
    const k = ev.key.toLowerCase();
    if ($('dlg').classList.contains('show')) { if (k === 'escape') $('dlgCancel').click(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); redo(); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (k === 'delete' || k === 'backspace') { if (S.sel) { ev.preventDefault(); deleteSelected(); } return; }
    if (k === 'escape') { S.sel = null; refresh(); return; }
    if (k === 'm') { S.mirror = !S.mirror; refresh(); return; }
    const mode = { 1: 'bow', 2: 'nozzle', 3: 'weapons', 4: 'lights', 5: 'select' }[k];
    if (mode) setMode(mode);
  });
  window.addEventListener('beforeunload', (ev) => {
    if (S.saving || !isDirty()) return;
    ev.preventDefault();
    ev.returnValue = '';   // niezapisane zmiany: zamknięcie karty je zgubi (przeładowanie — nie, sesja je niesie)
  });
}

function deleteSelected() {
  if (!S.sel) return;
  const e = S.history.present;
  const next = S.sel.cat === 'nozzle' ? WL.clearCategory(e, 'nozzle') : WL.deletePoint(e, S.sel.cat, S.sel.uid, { mirror: S.mirror });
  S.sel = null;
  commit(next);
}

function syncChecks() {
  $('enemyChk').checked = S.enemy;
  $('engineChk').checked = S.engine;
  $('frameChk').checked = S.gameFrame;
  $('markersChk').checked = S.markers;
  for (const r of document.querySelectorAll('input[name=nozDir]')) r.checked = r.value === S.nozzleDir;
  $('nozCentreChk').checked = S.nozzleCentre;
}

// ── pętla ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function resize() {
  const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

function tick() {
  requestAnimationFrame(tick);
  controls.update();
  applyHover();
  // Pokrętła gry co klatkę (jak `ThreeRenderer._tickCvModels`) — podgląd = gra.
  const T = LIVE_CV_FX;
  KC_SHARED.uKcGainMul.value = T.MODEL_KC_GAIN ?? 1;
  KC_SHARED.uKcTintMul.value = T.MODEL_ENEMY_TINT ?? 1;
  KC_SHARED.uKcBurnMul.value = T.MODEL_WRECK_BURN ?? 1;
  KC_SHARED.uKcFillMul.value = T.MODEL_FILL ?? 0;
  KC_SHARED.uKcRimMul.value = T.MODEL_RIM_GAIN ?? 0;
  KC_SHARED.uKcRimPow.value = T.MODEL_RIM_POWER ?? 4;
  KC_SHARED.uKcLiftCeil.value = T.MODEL_LIFT_CEIL ?? 0.95;
  pool.update({ fovDeg: camera.fov, viewportH: canvas.clientHeight || 1, gain: T.MODEL_LIGHT_GAIN, minPx: T.MODEL_LIGHT_MIN_PX,
    fadePx: T.MODEL_LIGHT_FADE_PX, fadeEndPx: T.MODEL_LIGHT_FADE_END_PX });
  // Smuga jak `_applyExhaust` (gałąź kanoniczna): promień z dyszy, długość z pokręteł, migotanie długości.
  const cone = S.rig?.exhaust;
  if (cone) {
    cone.visible = S.engine;
    if (S.engine) {
      const flick = 0.8 + 0.2 * Math.sin(performance.now() * 0.02);
      cone.material.opacity = 0.35 * flick;
      const rad = Math.max(S.rig.nozzleR ?? 0.04, T.MODEL_PLUME_R_MIN ?? 0.03) * (T.MODEL_PLUME_R_MUL ?? 1);
      cone.scale.set(rad, (T.MODEL_PLUME_LEN ?? 0.8) * (0.85 + 0.3 * flick), rad);
    }
  }
  if (selRing.visible) selRing.quaternion.copy(camera.quaternion).premultiply(S.rig ? S.rig.canon.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion());
  composer.render();
  updateLabels();
}

// ── start ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function start() {
  buildSliders();
  bindUi();
  await buildSlotSelect();
  const session = WL.restoreSession(sessionStorage.getItem(SESSION_KEY) ?? '');
  applyUi(session?.ui);
  syncChecks();
  applyStar();
  resize();
  requestAnimationFrame(tick);
  if (session) await loadSlot(session.slot, session.variant, { session });
  else await loadSlot(DEFAULT_SLOT, 'slot');
  if (session?.ui?.cam && Array.isArray(session.ui.cam.p) && Array.isArray(session.ui.cam.t)) {
    camera.position.fromArray(session.ui.cam.p);
    controls.target.fromArray(session.ui.cam.t);
    controls.update();
  }
  S.dirHandle = await idbGet();
  $('dirInfo').textContent = S.dirHandle ? 'Folder zapisu zapamiętany (hardpoints).' : 'Przy pierwszym zapisie wskaż folder assets/models/ships/hardpoints.';
}

// Uchwyty dla testów automatycznych (headless) — bez wpływu na działanie strony.
window.WS = {
  ready: start().catch((e) => { console.error('[Workshop] start:', e); note('Błąd startu strony: ' + (e?.message ?? e), 'bad'); throw e; }),
  state: () => ({ slot: S.slot, variant: S.variant, mode: S.mode, mirror: S.mirror, sel: S.sel, edit: edit(), dirty: isDirty(),
    canUndo: WL.canUndo(S.history), canRedo: WL.canRedo(S.history), lightsMesh: !!S.rig?.lights,
    lightCount: S.rig?.lights?.geometry?.instanceCount ?? 0, plume: !!S.rig?.exhaust?.visible }),
  setMode, loadSlot, undo, redo, frameCamera,
  view: (p, t = [0, 0, 0]) => { camera.position.fromArray(p); controls.target.fromArray(t); controls.update(); camera.updateMatrixWorld(true); },
  setOption: (k, v) => { S[k] = v; syncChecks(); refresh(true); },
  /** Punkt modelu → współrzędne klienta (do kliknięć testu). */
  client: (p) => { const s = screenOf(p); const r = canvas.getBoundingClientRect(); return s ? { x: r.left + s.x, y: r.top + s.y, inView: s.inView } : null; },
  hullAt: (x, y) => hullHit(x, y),
  castModel: (o, dir, far = 1) => castModel(o, dir, far),
  nozzleInOpening: (p, n, d) => nozzleInOpening(p, n, d),
  /** Wierzchołek smugi i dysza w świecie + uniformy punktów świetlnych (test: smuga ze środka dyszy, podłoga światła). */
  rigProbe: () => {
    const r = S.rig, nz = edit()?.nozzle;
    if (!r?.exhaust || !r.canon) return null;
    r.root.updateMatrixWorld(true);
    const u = r.lights?.material?.uniforms ?? null;
    return { apex: r.exhaust.getWorldPosition(new THREE.Vector3()).toArray(),
      nozzleWorld: nz ? r.canon.localToWorld(new THREE.Vector3(...nz.p)).toArray() : null,
      len: r.canon.scale.x, minPx: u?.uMinPx?.value ?? null, fadeHi: u?.uFadeHi?.value ?? null, fadeLo: u?.uFadeLo?.value ?? null, gain: u?.uGain?.value ?? null };
  },
  docText: () => { const r = WL.docFromEdit(S.baseDoc, edit(), { date: today() }); return r.ok ? formatHardpointsJson(r.doc) : null; },
  writeDocTo,
  /** Ścieżka zapisu bez okien (test: katalog OPFS zamiast wyboru folderu). */
  saveTo: async (dir) => {
    const r = WL.docFromEdit(S.baseDoc, edit(), { date: today() });
    if (!r.ok) return { ok: false, errors: r.errors };
    const text = formatHardpointsJson(r.doc);
    await writeDocTo(dir, S.slot, S.variant, text);
    S.baseDoc = r.doc; S.fileEdit = WL.editFromDoc(r.doc); S.fileSig = WL.editSignature(r.doc, S.fileEdit);
    S.savedAt = Date.now();
    persistNow();
    updatePanel();
    return { ok: true, text };
  },
  looksLikeHardpointsDir,
  maskStat: () => $('maskStat').textContent,
  /** Wartości uniformów maski pierwszego materiału rigu (test: suwak dociera do shadera gry). */
  kcUniforms: () => { const m = S.rig?.materials?.[0]; const u = m ? keyColourUniformsOf(m) : null; return u ? { hue: u.uKcHue.value, hueTol: u.uKcHueTol.value, satMin: u.uKcSatMin.value, valMin: u.uKcValMin.value, soft: u.uKcSoft.value, gain: u.uKcGain.value } : null; },
};
