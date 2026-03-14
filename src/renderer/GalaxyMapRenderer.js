// GalaxyMapRenderer — renderer 3D mapy galaktycznej
//
// Fullscreen WebGL canvas z gwiazdami, mgławicami, liniami konstelacji.
// Kamera orbitalna inline (theta/phi/dist). Input: startDrag/applyDrag/endDrag/applyZoom/handleClick.
// Wzorzec identyczny z PlanetGlobeRenderer.

import * as THREE from 'three';

// ── Stałe ─────────────────────────────────────────────────────────────────────
const NEBULA_COUNT = 5;      // mgławice
const LABEL_DIST   = 40;     // zoom bliższy niż ta wartość → etykiety widoczne
const CONSTEL_MAX_LY = 4;    // max odl. do rysowania linii konstelacji

export class GalaxyMapRenderer {
  constructor() {
    this._canvas    = null;
    this._renderer  = null;
    this._scene     = null;
    this._camera    = null;
    this._raf       = null;
    this._disposed  = false;

    // Kamera orbitalna
    this._theta = 0;
    this._phi   = 0.9;     // lekko z góry
    this._dist  = 60;
    this._minDist = 10;
    this._maxDist = 150;
    this._target = new THREE.Vector3(0, 0, 0);

    // Input
    this.wasDrag = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragging   = false;

    // Dane
    this._systems       = [];
    this._clickableMeshes = [];   // tablica mesh rdzeni
    this._meshToSystem  = new Map();
    this._labels        = [];     // { sprite, system }
    this._homeGlow      = null;   // pulsujący glow home
    this._callbacks     = {};     // { onSelect }
    this._nebulaSprites = [];

    // Animacja
    this._clock = new THREE.Clock();
  }

  // ── Otwórz / zamknij ──────────────────────────────────────────────────────

  /**
   * @param {GalaxyData} galaxyData
   * @param {{ onSelect: Function }} callbacks
   */
  open(galaxyData, callbacks = {}) {
    this._systems   = galaxyData.systems;
    this._callbacks = callbacks;
    this._disposed  = false;

    // Canvas fullscreen
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'galaxy-map-canvas';
    this._canvas.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 1; pointer-events: none;
    `;
    document.body.appendChild(this._canvas);

    // WebGL renderer
    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      alpha: false,
    });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.setClearColor(0x020408, 1); // ciemne tło kosmiczne

    // Scena
    this._scene = new THREE.Scene();

    // Kamera
    this._camera = new THREE.PerspectiveCamera(
      50, window.innerWidth / window.innerHeight, 0.1, 2000
    );
    this._updateCamera();

    // Buduj zawartość sceny
    this._buildNebulae();
    this._buildStars();
    this._buildConstellationLines();
    this._buildLabels();

    // Ambient light (żeby MeshBasicMaterial działał poprawnie)
    this._scene.add(new THREE.AmbientLight(0xffffff, 1));

    // Resize handler
    this._onResize = () => {
      if (this._disposed) return;
      this._renderer.setSize(window.innerWidth, window.innerHeight);
      this._camera.aspect = window.innerWidth / window.innerHeight;
      this._camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._onResize);

    // Animacja
    this._clock.start();
    this._animate();
  }

  close() {
    this._disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.forceContextLoss();
    }
    if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);

    // Dispose geometrii i materiałów
    this._scene?.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });

    this._clickableMeshes = [];
    this._meshToSystem.clear();
    this._labels = [];
    this._nebulaSprites = [];
    this._homeGlow = null;
    this._scene  = null;
    this._camera = null;
    this._canvas = null;
  }

  // ── Input API (wywoływane przez GalaxyMapScene) ───────────────────────────

  startDrag(x, y) {
    this._dragging = true;
    this._dragStartX = x;
    this._dragStartY = y;
    this.wasDrag = false;
  }

  applyDrag(x, y) {
    if (!this._dragging) return;
    const dx = x - this._dragStartX;
    const dy = y - this._dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.wasDrag = true;

    const sensitivity = 0.005;
    this._theta -= dx * sensitivity;
    this._phi   += dy * sensitivity;
    // Ogranicz phi do [0.1, PI-0.1] — nie odwracaj kamery
    this._phi = Math.max(0.1, Math.min(Math.PI - 0.1, this._phi));

    this._dragStartX = x;
    this._dragStartY = y;
    this._updateCamera();
  }

  endDrag() {
    this._dragging = false;
  }

  applyZoom(delta) {
    this._dist += delta * 0.05;
    this._dist = Math.max(this._minDist, Math.min(this._maxDist, this._dist));
    this._updateCamera();
  }

  /**
   * Raycasting — zwraca system pod kursorem lub null
   */
  handleClick(x, y) {
    if (!this._camera || !this._clickableMeshes.length) return null;

    const rect = this._canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this._camera);
    // Zwiększ tolerancję raycastera dla małych kul
    raycaster.params.Points = { threshold: 0.5 };

    const hits = raycaster.intersectObjects(this._clickableMeshes, false);
    if (hits.length > 0) {
      return this._meshToSystem.get(hits[0].object) ?? null;
    }
    return null;
  }

  // ── Budowanie sceny ───────────────────────────────────────────────────────

  _buildNebulae() {
    // 4-5 dużych Sprite z radial gradient — AdditiveBlending
    for (let i = 0; i < NEBULA_COUNT; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      // Losowy kolor mgławicy
      const hue = Math.random() * 360;
      const sat = 30 + Math.random() * 40;

      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0,   `hsla(${hue}, ${sat}%, 60%, 0.3)`);
      grad.addColorStop(0.3, `hsla(${hue}, ${sat}%, 40%, 0.15)`);
      grad.addColorStop(0.7, `hsla(${hue}, ${sat}%, 30%, 0.05)`);
      grad.addColorStop(1,   `hsla(${hue}, ${sat}%, 20%, 0.0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.04 + Math.random() * 0.08,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      // Pozycja na obrzeżach sceny
      const angle = (i / NEBULA_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const r = 30 + Math.random() * 60;
      sprite.position.set(
        r * Math.cos(angle),
        (Math.random() - 0.5) * 10,
        r * Math.sin(angle)
      );
      sprite.scale.set(40 + Math.random() * 40, 40 + Math.random() * 40, 1);

      this._scene.add(sprite);
      this._nebulaSprites.push({ sprite, rotSpeed: 0.001 + Math.random() * 0.003 });
    }
  }

  _buildStars() {
    this._clickableMeshes = [];
    this._meshToSystem.clear();

    for (const sys of this._systems) {
      const group = new THREE.Group();
      // Mapowanie koordynat: x→x, y→z, z→y*0.5 (Three.js Y-up, płaski dysk)
      group.position.set(sys.x, sys.z, sys.y);

      const color = new THREE.Color(sys.colorHex);
      const glowColor = new THREE.Color(sys.glowColorHex);

      // Rdzeń gwiazdy (klikalny)
      const coreRadius = sys.isHome ? 0.18 : 0.10;
      const coreSegments = sys.isHome ? 12 : 8;
      const coreGeo = new THREE.SphereGeometry(coreRadius, coreSegments, coreSegments);
      const coreMat = new THREE.MeshBasicMaterial({ color });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      group.add(coreMesh);

      this._clickableMeshes.push(coreMesh);
      this._meshToSystem.set(coreMesh, sys);

      // Glow sprite
      const glowTex = this._createGlowTexture(glowColor);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: sys.isHome ? 0.45 : 0.25,
        depthWrite: false,
      });
      const glowSprite = new THREE.Sprite(glowMat);
      const glowScale = sys.isHome ? 1.6 : (0.6 + Math.min(sys.luminosity, 1.5) * 0.2);
      glowSprite.scale.set(glowScale, glowScale, 1);
      group.add(glowSprite);

      if (sys.isHome) {
        this._homeGlow = { sprite: glowSprite, baseScale: glowScale };
      }

      this._scene.add(group);
    }
  }

  _createGlowTexture(color) {
    const S = 256; // wysoka rozdzielczość → gładki glow
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');

    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const half = S / 2;

    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0,    `rgba(${r},${g},${b},1.0)`);
    grad.addColorStop(0.15, `rgba(${r},${g},${b},0.7)`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.3)`);
    grad.addColorStop(0.6,  `rgba(${r},${g},${b},0.08)`);
    grad.addColorStop(1,    `rgba(${r},${g},${b},0.0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    return new THREE.CanvasTexture(canvas);
  }

  _buildConstellationLines() {
    // Linie między explored systemami bliżej niż CONSTEL_MAX_LY
    const explored = this._systems.filter(s => s.explored);
    const points = [];

    for (let i = 0; i < explored.length; i++) {
      for (let j = i + 1; j < explored.length; j++) {
        const a = explored[i], b = explored[j];
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist <= CONSTEL_MAX_LY) {
          points.push(
            new THREE.Vector3(a.x, a.z * 0.5, a.y),
            new THREE.Vector3(b.x, b.z * 0.5, b.y)
          );
        }
      }
    }

    if (points.length === 0) return;

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x88ffcc,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    this._scene.add(new THREE.LineSegments(geo, mat));
  }

  _buildLabels() {
    this._labels = [];

    for (const sys of this._systems) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      ctx.font = 'bold 24px Courier New, monospace';
      ctx.fillStyle = sys.isHome ? '#00ffb4' : '#a8c4b8';
      ctx.textAlign = 'center';
      ctx.fillText(sys.name, 128, 36);

      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      sprite.position.set(sys.x, sys.z + 0.5, sys.y);
      sprite.scale.set(3, 0.75, 1);
      sprite.visible = false; // widoczne tylko od bliższego zoomu

      this._scene.add(sprite);
      this._labels.push({ sprite, system: sys });
    }
  }

  // ── Kamera ────────────────────────────────────────────────────────────────

  _updateCamera() {
    if (!this._camera) return;
    const x = this._dist * Math.sin(this._phi) * Math.cos(this._theta);
    const y = this._dist * Math.cos(this._phi);
    const z = this._dist * Math.sin(this._phi) * Math.sin(this._theta);

    this._camera.position.set(
      this._target.x + x,
      this._target.y + y,
      this._target.z + z
    );
    this._camera.lookAt(this._target);
  }

  // ── Animacja ──────────────────────────────────────────────────────────────

  _animate() {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(() => this._animate());

    const t = this._clock.getElapsedTime();

    // Pulsujący glow home
    if (this._homeGlow) {
      const pulse = 1 + Math.sin(t * 1.8) * 0.15;
      const s = this._homeGlow.baseScale * pulse;
      this._homeGlow.sprite.scale.set(s, s, 1);
    }

    // Wolna rotacja mgławic
    for (const n of this._nebulaSprites) {
      n.sprite.material.rotation += n.rotSpeed;
    }

    // Widoczność etykiet (zależna od zoomu)
    const showLabels = this._dist < LABEL_DIST;
    for (const l of this._labels) {
      l.sprite.visible = showLabels;
    }

    this._renderer.render(this._scene, this._camera);
  }
}
