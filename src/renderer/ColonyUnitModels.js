// ColonyUnitModels — warstwa modeli GLB jednostek naziemnych na kuli kolonii (ARC COLONY SPHERE, krok CS-10; plan §3.19).
//
// • Pamięć szablonów: każdy plik GLB wczytywany RAZ na sesję (mapa modułu ścieżka → szablon); szablon = części
//   (geometria z wypieczoną macierzą węzła + materiał pliku) znormalizowane: podstawa w y = 0, środek w osi Y,
//   największy wymiar = 1. Klucz grupy = lista kandydatów pliku (wariant `_mobile` / `_deployed`, potem bazowy GLB —
//   D-CS-14); brak wszystkich plików → stan `missing` (gospodarz rysuje zwarty znacznik).
// • Instancje: jedna grupa (klucz modelu) = jeden `InstancedMesh` na część szablonu — N jednostek tego samego typu
//   to jedno wywołanie rysowania na część; macierze i barwy instancji z `ColonyUnitLogic.instanceMatrix`.
// • Własna scena: kula-zasłona tylko w buforze głębi (jednostki za horyzontem znikają za limbem), światła idą za
//   kamerą (klucz od strony gwiazdy kadru, wypełnienie od kamery — jednostki czytelne także po nocnej stronie).
//   Renderuje ją `ColonySphereRenderer` na przezroczystym tle, a obraz trafia NAD portrety budynków.
// • THREE, loader i zegar wstrzykiwane — keeper wykonuje klasę pod node na prawdziwym three bez GL.

import { instanceMatrix } from './ColonyUnitLogic.js';

export const UNIT_MODEL_STATE = Object.freeze({ LOADING: 'loading', READY: 'ready', MISSING: 'missing' });

const OCCLUDER_RADIUS = 0.9985;    // kula-zasłona tuż pod powierzchnią (modele stoją na r = 1 + lift)
const MIN_CAPACITY = 4;
const LIGHTS = Object.freeze({ skyHex: 0xcfe0ff, groundHex: 0x4a4036, hemi: 1.15, key: 2.4, fill: 1.1, fillHex: 0xdfe8ff });
const ENV_INTENSITY = 0.85;        // otoczenie odbić (RoomEnvironment, lokalna kopia src/lib/addons) — modele mają metaliczne materiały PBR, same światła dają czerń

const _templates = new Map();   // ścieżka → Promise<szablon|null> (null = pliku nie ma / nie wczytał się)

async function defaultLoad(path) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  return new Promise((resolve, reject) => new GLTFLoader().load(path, (g) => resolve(g.scene), undefined, (e) => reject(e ?? new Error('glb_load_failed'))));
}

/**
 * Szablon z wczytanej sceny GLB: części z wypieczonymi macierzami, znormalizowane (podstawa y = 0, największy wymiar 1).
 * @returns {{ parts: {geometry:object, material:object}[], triangles:number }|null}
 */
export function buildUnitTemplate(T, root) {
  if (!root) return null;
  root.updateMatrixWorld?.(true);
  const parts = [], box = new T.Box3();
  root.traverse?.((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    box.union(g.boundingBox);
    parts.push({ geometry: g, material: o.material });
  });
  if (!parts.length || box.isEmpty()) return null;
  const size = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3());
  const k = 1 / Math.max(size.x, size.y, size.z, 1e-9);
  const m = new T.Matrix4().makeScale(k, k, k).multiply(new T.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  let triangles = 0;
  for (const p of parts) {
    p.geometry.applyMatrix4(m);
    p.geometry.computeBoundingSphere();
    triangles += (p.geometry.index ? p.geometry.index.count : (p.geometry.attributes.position?.count ?? 0)) / 3;
  }
  return { parts, triangles: Math.round(triangles) };
}

/** Wyczyść pamięć szablonów (testy). */
export function clearUnitTemplates() { _templates.clear(); }

export class ColonyUnitModels {
  /**
   * @param {object} o
   * @param {object} o.THREE przestrzeń nazw three
   * @param {(path:string) => Promise<object>} [o.load] wczytuje scenę GLB (domyślnie GLTFLoader)
   * @param {() => void} [o.onChange] szablon gotowy / brak pliku → prośba o przerysowanie
   */
  constructor(o = {}) {
    this._T = o.THREE;
    this._load = o.load ?? defaultLoad;
    this._onChange = o.onChange ?? (() => {});
    this._keys = new Map();     // klucz grupy → { state, tpl, path }
    this._meshes = new Map();   // klucz grupy → { list: InstancedMesh[], capacity }
    this._scene = null; this._lights = null;
    this._instances = 0; this._groups = 0; this._drawCalls = 0;
    this._env = null; this._envTried = false;
  }

  /** Stan modelu grupy; pierwsze pytanie o klucz zaczyna wczytywanie kandydatów po kolei. */
  stateOf(key, candidates) {
    if (!key) return UNIT_MODEL_STATE.MISSING;
    let e = this._keys.get(key);
    if (!e) {
      e = { state: UNIT_MODEL_STATE.LOADING, tpl: null, path: null };
      this._keys.set(key, e);
      this._resolve(e, candidates ?? key.split('|'));
    }
    return e.state;
  }

  async _resolve(entry, candidates) {
    for (const path of candidates) {
      let p = _templates.get(path);
      if (!p) {
        p = Promise.resolve().then(() => this._load(path)).then((root) => buildUnitTemplate(this._T, root)).catch(() => null);
        _templates.set(path, p);
      }
      const tpl = await p;
      if (tpl) { entry.tpl = tpl; entry.path = path; entry.state = UNIT_MODEL_STATE.READY; this._onChange(); return; }
    }
    entry.state = UNIT_MODEL_STATE.MISSING;
    this._onChange();
  }

  _ensureScene() {
    if (this._scene) return;
    const T = this._T;
    this._scene = new T.Scene();
    const occ = new T.Mesh(new T.SphereGeometry(OCCLUDER_RADIUS, 64, 48), new T.MeshBasicMaterial({ colorWrite: false }));
    occ.renderOrder = -1;
    this._scene.add(occ);
    const hemi = new T.HemisphereLight(LIGHTS.skyHex, LIGHTS.groundHex, LIGHTS.hemi);
    const key = new T.DirectionalLight(0xffffff, LIGHTS.key);
    const fill = new T.DirectionalLight(LIGHTS.fillHex, LIGHTS.fill);
    this._scene.add(hemi); this._scene.add(key); this._scene.add(fill);
    this._lights = { hemi, key, fill };
    this._occluder = occ;
  }

  /**
   * Ustaw instancje klatki.
   * @param {Map<string, {key:string, candidates:string[], items:object[]}>|null} groups grupy z `groupUnitInstances`
   * @param {number} spacing rozstaw pól [promień ciała]
   * @returns {number} liczba instancji z gotowym modelem
   */
  setInstances(groups, spacing) {
    const T = this._T;
    let instances = 0, used = 0, calls = 0;
    const seen = new Set();
    if (groups && groups.size) {
      this._ensureScene();
      const m4 = new T.Matrix4(), col = new T.Color(), arr = new Array(16);
      for (const g of groups.values()) {
        if (this.stateOf(g.key, g.candidates) !== UNIT_MODEL_STATE.READY) continue;
        const tpl = this._keys.get(g.key).tpl, n = g.items.length;
        let e = this._meshes.get(g.key);
        if (!e || e.capacity < n) {
          if (e) this._dropMeshes(e);
          let cap = MIN_CAPACITY; while (cap < n) cap *= 2;
          e = { capacity: cap, list: tpl.parts.map((p) => { const im = new T.InstancedMesh(p.geometry, p.material, cap); im.frustumCulled = false; this._scene.add(im); return im; }) };
          this._meshes.set(g.key, e);
        }
        for (let i = 0; i < n; i++) {
          const it = g.items[i];
          m4.fromArray(instanceMatrix(it, spacing, undefined, arr));
          col.setRGB(it.tint[0], it.tint[1], it.tint[2]);
          for (const im of e.list) { im.setMatrixAt(i, m4); im.setColorAt(i, col); }
        }
        for (const im of e.list) {
          im.count = n; im.visible = n > 0;
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
        seen.add(g.key); instances += n; used++; calls += e.list.length;
      }
    }
    for (const [key, e] of this._meshes) if (!seen.has(key)) for (const im of e.list) { im.count = 0; im.visible = false; }
    this._instances = instances; this._groups = used; this._drawCalls = calls;
    return instances;
  }

  get instances() { return this._instances; }

  /** Wyrenderuj warstwę (tło przezroczyste ustawia gospodarz). `sun` / `eye` — kierunki jednostkowe w układzie kuli. */
  render(gl, camera, sun, eye) {
    if (!this._scene || this._instances <= 0) return false;
    if (!this._envTried && gl?.capabilities) { this._envTried = true; this._loadEnv(gl); }
    const L = this._lights;
    L.key.position.set(sun[0] * 10, sun[1] * 10, sun[2] * 10);
    L.fill.position.set(eye[0] * 10, eye[1] * 10 + 4, eye[2] * 10);
    gl.render(this._scene, camera);
    return true;
  }

  // Mapa otoczenia dla odbić PBR — raz na kontekst GL, poza klatką; RoomEnvironment z lokalnej kopii (src/lib/addons, bez CDN —
  // build Steam offline); gdyby import padł, zostają same światła.
  async _loadEnv(gl) {
    try {
      const { RoomEnvironment } = await import('../lib/addons/RoomEnvironment.js');
      if (!this._scene) return;
      const pm = new this._T.PMREMGenerator(gl);
      this._env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      if (!this._scene) { this._env.dispose(); this._env = null; return; }
      this._scene.environment = this._env;
      this._scene.environmentIntensity = ENV_INTENSITY;
      this._onChange();
    } catch (e) { /* same światła */ }
  }

  _dropMeshes(e) {
    for (const im of e.list) { this._scene?.remove(im); im.dispose?.(); }
  }

  /** Zwolnij obiekty sceny (kontekst GL gospodarza znika); szablony zostają w pamięci modułu. */
  disposeGL() {
    for (const e of this._meshes.values()) this._dropMeshes(e);
    this._meshes.clear();
    if (this._occluder) { this._occluder.geometry.dispose?.(); this._occluder.material.dispose?.(); }
    try { this._env?.dispose?.(); } catch (e) { /* nic */ }
    this._env = null; this._envTried = false;
    this._scene = null; this._lights = null; this._occluder = null;
    this._instances = 0; this._groups = 0; this._drawCalls = 0;
  }

  info() {
    const states = {};
    for (const [k, e] of this._keys) states[k] = e.state;
    let triangles = 0;
    for (const [k, e] of this._meshes) { const tpl = this._keys.get(k)?.tpl; if (tpl && e.list[0]?.count) triangles += tpl.triangles * e.list[0].count; }
    return { instances: this._instances, groups: this._groups, drawCalls: this._drawCalls, triangles, states, env: !!this._env };
  }
}

export default ColonyUnitModels;
