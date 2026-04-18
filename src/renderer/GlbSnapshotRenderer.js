// GlbSnapshotRenderer — offscreen Three.js renderer produkujący 2D snapshoty modeli GLB
//
// Cel: pozwala używać plików .glb (3D) tam gdzie silnik renderuje Canvas 2D
// (ColonyOverlay, GroundUnitPanel). Ładuje GLB via GLTFLoader, renderuje jedną
// klatkę w offscreen WebGL context, zwraca HTMLCanvasElement z przezroczystym tłem.
//
// Typowe użycie:
//   const canvas = await glbSnapshotRenderer.snapshot('assets/unit.glb');
//   ctx.drawImage(canvas, 0, 0);
//
// Cache: każda ścieżka renderowana raz; wynik współdzielony przez wszystkich wywołujących.

import * as THREE       from 'three';
import { GLTFLoader }   from 'three/addons/loaders/GLTFLoader.js';

// Rozdzielczość snapshot'u — ×2 względem docelowego sprite'a (92×92) daje ostre krawędzie
const DEFAULT_SIZE          = 256;
const DEFAULT_FIT_RADIUS    = 0.85;    // model wypełnia ~85% klatki (margines na cienie/wolumetrię)
// Kamera niżej niż klasyczne izo: kąt elewacji ~22° zamiast 45° — bardziej "hero shot".
// Y < sqrt(X²+Z²) daje niski kąt; tu 1.1 vs sqrt(4+4)≈2.83 → atan2(1.1, 2.83) ≈ 21°.
const DEFAULT_CAMERA_OFFSET = [2.0, 1.1, 2.0];
// lookAt lekko nad podstawą modelu — jednostka pozuje na centrum, nie na ziemi
const DEFAULT_CAMERA_LOOKAT = [0, 0.1, 0];

class GlbSnapshotRenderer {
  constructor() {
    this._renderer = null;
    this._loader   = null;
    this._cache    = new Map();  // path → Promise<HTMLCanvasElement>
  }

  /** Inicjalizacja offscreen WebGL (lazy, przy pierwszym użyciu). */
  _ensureInit() {
    if (this._renderer) return;

    // Canvas offscreen (niedodany do DOM — wystarczy jako target WebGL)
    const canvas = document.createElement('canvas');
    canvas.width  = DEFAULT_SIZE;
    canvas.height = DEFAULT_SIZE;

    this._renderer = new THREE.WebGLRenderer({
      canvas,
      alpha:                true,   // przezroczyste tło
      antialias:            true,
      preserveDrawingBuffer: true,  // toDataURL/drawImage po render()
    });
    // PixelRatio=1 — już renderujemy w 256 (2×92), nie chcemy mnożyć przez retina DPR
    this._renderer.setPixelRatio(1);
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Tone mapping: ACES Filmic daje cinematic look + kontrast zamiast wyblakłości
    this._renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.15;

    this._loader = new GLTFLoader();
  }

  /**
   * Wyrenderuj GLB do canvas 2D (lub zwróć wynik z cache).
   * @param {string} glbPath — ścieżka do pliku .glb
   * @param {Object} [opts]
   * @param {number} [opts.size=128]       — rozmiar kwadratu (px)
   * @param {number[]} [opts.cameraOffset] — [x, y, z] pozycji kamery
   * @param {number[]} [opts.cameraLookAt] — [x, y, z] punktu patrzenia
   * @param {number} [opts.fitRadius=0.9]  — jak ciasno model wypełnia klatkę (0-1)
   * @returns {Promise<HTMLCanvasElement>}
   */
  async snapshot(glbPath, opts = {}) {
    if (!glbPath) return Promise.reject(new Error('empty_path'));

    // Cache hit — zwróć istniejący promise (może jeszcze pending)
    if (this._cache.has(glbPath)) return this._cache.get(glbPath);

    const promise = this._renderInternal(glbPath, opts);
    this._cache.set(glbPath, promise);

    // Gdy render się wywali, usuń z cache żeby retry był możliwy
    promise.catch(() => this._cache.delete(glbPath));

    return promise;
  }

  /** Główna logika renderowania — oddzielna żeby można było łapać błędy. */
  async _renderInternal(glbPath, opts) {
    this._ensureInit();

    const size         = opts.size         ?? DEFAULT_SIZE;
    const fitRadius    = opts.fitRadius    ?? DEFAULT_FIT_RADIUS;
    const cameraOffset = opts.cameraOffset ?? DEFAULT_CAMERA_OFFSET;
    const cameraLookAt = opts.cameraLookAt ?? DEFAULT_CAMERA_LOOKAT;

    // Załaduj GLB (async)
    const gltf = await new Promise((resolve, reject) => {
      this._loader.load(
        glbPath,
        resolve,
        undefined,
        err => reject(err instanceof Error ? err : new Error(`glb_load_failed: ${glbPath}`)),
      );
    });

    // Renderer target size
    this._renderer.setSize(size, size, false);
    this._renderer.domElement.width  = size;
    this._renderer.domElement.height = size;

    // Nowa scena per render (cleanup na koniec)
    const scene = new THREE.Scene();
    const model = gltf.scene;

    // ── Auto-scale (bounding sphere — rotation-invariant) + center (bounding box) ──
    // Sphere zapewnia że model MIEŚCI się w klatce pod każdym kątem kamery izo.
    // Box center daje wizualne centrowanie na geometrii (nie na niesymetrycznej sferze).
    model.updateMatrixWorld(true);
    const bbox    = new THREE.Box3().setFromObject(model);
    const bsphere = bbox.getBoundingSphere(new THREE.Sphere());
    const scale   = fitRadius / (bsphere.radius || 1);

    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);

    // Recenter po skalowaniu — używamy Box center (wizualnie naturalne dla humanoidów)
    const scaledBox    = new THREE.Box3().setFromObject(model);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    model.position.sub(scaledCenter);
    model.updateMatrixWorld(true);

    scene.add(model);

    // ── Lighting (studio PBR — hemi + 3-point) ──
    // Hemisphere zastępuje flat ambient — sky/ground colors dają naturalne nasycenie
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x2a1d0e, 0.55);
    scene.add(hemi);

    // Key: główne światło, z góry-przodu, silne (tone mapping skompresuje highlights)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(3, 4, 2);
    scene.add(keyLight);

    // Fill: delikatne światło z przeciwnej strony, chłodniejszy odcień dla głębi
    const fillLight = new THREE.DirectionalLight(0xa0c4ff, 0.5);
    fillLight.position.set(-2, 1.5, -3);
    scene.add(fillLight);

    // Rim: ciepła kontur-lampa zza modelu — podkreśla sylwetkę + dodaje "hero shot" feel
    const rimLight = new THREE.DirectionalLight(0xffd48a, 0.9);
    rimLight.position.set(-1.5, 2.5, -2);
    scene.add(rimLight);

    // ── Camera (ortho izometryczna) ──
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    camera.position.set(cameraOffset[0], cameraOffset[1], cameraOffset[2]);
    camera.lookAt(cameraLookAt[0], cameraLookAt[1], cameraLookAt[2]);
    camera.updateProjectionMatrix();

    // ── Render ──
    this._renderer.render(scene, camera);

    // Skopiuj domElement do nowego canvas (żeby kolejne renderingi nie nadpisały wyniku)
    const outCanvas = document.createElement('canvas');
    outCanvas.width  = size;
    outCanvas.height = size;
    const ctx = outCanvas.getContext('2d');
    ctx.drawImage(this._renderer.domElement, 0, 0, size, size);

    // ── Cleanup — dispose geometrii/materiałów z GLB (nie współdzielone) ──
    model.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          // Dispose texturek tylko jeśli nie są shared (GLTFLoader tworzy osobne per load)
          if (m.map)          m.map.dispose();
          if (m.normalMap)    m.normalMap.dispose();
          if (m.roughnessMap) m.roughnessMap.dispose();
          if (m.metalnessMap) m.metalnessMap.dispose();
          if (m.emissiveMap)  m.emissiveMap.dispose();
          m.dispose();
        }
      }
    });

    return outCanvas;
  }

  /**
   * Zwróć HTMLImageElement ze snapshotem — dla kodu używającego <img>.
   * Jeśli GLB nie istnieje/rzuca błąd → Promise reject.
   */
  async snapshotAsImage(glbPath, opts = {}) {
    const canvas = await this.snapshot(glbPath, opts);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error('image_from_canvas_failed'));
      img.src = canvas.toDataURL('image/png');
    });
  }

  /** Czy renderer już załadował i scachował daną ścieżkę. */
  has(glbPath) {
    return this._cache.has(glbPath);
  }

  /** Czyść cache (nie dispose renderera — tylko zapomnij wyniki). */
  clearCache() {
    this._cache.clear();
  }

  /** Pełny dispose — zwalnia WebGL context. Wywoływać tylko przy zamykaniu gry. */
  dispose() {
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }
    this._loader = null;
    this._cache.clear();
  }
}

// Singleton — jeden renderer na grę
export const glbSnapshotRenderer = new GlbSnapshotRenderer();
