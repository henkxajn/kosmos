// Renderer Three.js — główna scena 3D układu słonecznego
// Wzorowany na space_4x_prototype.html
//
// Układ współrzędnych:
//   Fizyka gry: planet.x/y w jednostkach AU × 110
//   Three.js:   planet.x/y podzielone przez WORLD_SCALE (= 10)
//   → 1 AU = 11 jednostek Three.js (podobnie jak prototyp: dist 8-54)

import * as THREE         from 'three';
import EventBus           from '../core/EventBus.js';
import EntityManager      from '../core/EntityManager.js';
import { GAME_CONFIG }    from '../config/GameConfig.js';
import { resolveTextureType, loadPlanetTextures, hashCode, TEXTURE_VARIANTS }
  from './PlanetTextureUtils.js';

const AU          = GAME_CONFIG.AU_TO_PX;   // 110
const WORLD_SCALE = 10;                      // dzielnik pozycji: AU×11 w 3D
const S           = (v) => v / WORLD_SCALE; // skrót: skaluj pozycję
const SR          = (r) => r / WORLD_SCALE; // skaluj promień

const LIFE_GLOW_COL = 0x44ff88;

// ── Tekstury planet: resolveTextureType, loadPlanetTextures, hashCode,
//    TEXTURE_VARIANTS — importowane z PlanetTextureUtils.js ──

// ── Główna klasa renderera ───────────────────────────────────────
export class ThreeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    // Używamy pełnych wymiarów okna przeglądarki
    const W = window.innerWidth;
    const H = window.innerHeight;

    // ── Renderer WebGL ─────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Poprawne zarządzanie kolorami dla MeshStandardMaterial (PBR)
    this.renderer.toneMapping    = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ── Scena ─────────────────────────────────────────────────
    this.scene = new THREE.Scene();

    // ── Kamera perspektywiczna ─────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 5000);
    this.camera.position.set(0, 35, 50);
    this.camera.lookAt(0, 0, 0);

    // ── Obsługa zmiany rozmiaru okna ──────────────────────────
    window.addEventListener('resize', () => {
      const nW = window.innerWidth, nH = window.innerHeight;
      this.renderer.setSize(nW, nH);
      this.camera.aspect = nW / nH;
      this.camera.updateProjectionMatrix();
    });

    // ── Mapy encji → obiekty Three.js ─────────────────────────
    this._planets      = new Map();   // planetId → { group, mesh }
    this._orbits       = new Map();   // planetId → Line
    this._lifeGlows    = new Map();   // planetId → Sprite (dziecko group planety)
    this._moons        = new Map();   // moonId → { mesh, ring, parentEntry }
    this._planetoids       = new Map();   // planetoidId → { mesh }
    this._planetoidOrbits  = new Map();   // planetoidId → Line (ukryte domyślnie)
    this._entityByUUID = new Map();   // mesh.uuid → entity
    this._clickable    = [];
    this._vessels      = new Map();   // vesselId → { sprite, routeLine }

    // Współdzielona tekstura kropki życia — tworzona raz
    this._lifeDotTex    = ThreeRenderer._createLifeDotTexture();
    this._playerDotTex  = ThreeRenderer._createPlayerDotTexture();

    // ── Małe ciała i dysk ─────────────────────────────────────
    this._diskPoints      = null;
    this._smallBodyPoints = null;

    // ── Licznik do periodycznego odświeżania orbit ───────────
    this._orbitRebuildCounter = 0;

    // ── Gwiazda ───────────────────────────────────────────────
    this._star      = null;
    this._starGroup = null;
    this._starLight = null;

    // ── Raycaster ─────────────────────────────────────────────
    this._ray   = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._hoverPlanetId = null;

    // ── Śledzenie kamery (focus na planecie/księżycu) ───────
    this._focusEntityId = null;

    // ── Referencja do kontrolera kamery (ustawiana z zewnątrz) ─
    this._cameraController = null;

    // ── Czas (do animacji gwiazdy) ────────────────────────────
    this._clock = new THREE.Clock();

    this._buildBackground();
    this._buildLights();
    this._setupEventBus();
    this._startLoop();
  }

  // ── Tło: galaktyczne gwiazdy + mgławica ─────────────────────
  _buildBackground() {
    // 6000 gwiazd tła (sfera r=300-1000)
    const N   = 6000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const sz  = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const r     = 300 + Math.random() * 700;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pos[i*3  ]  = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1]  = r * Math.sin(phi) * Math.sin(theta);
      pos[i*3+2]  = r * Math.cos(phi);

      const temp = Math.random();
      if (temp < 0.2) { col[i*3]=0.6; col[i*3+1]=0.7; col[i*3+2]=1.0; }
      else if (temp < 0.5) { col[i*3]=1.0; col[i*3+1]=0.95; col[i*3+2]=0.8; }
      else { col[i*3]=1.0; col[i*3+1]=1.0; col[i*3+2]=1.0; }
      sz[i] = 0.3 + Math.random() * 1.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.8, vertexColors: true,
      transparent: true, opacity: 0.9, sizeAttenuation: true,
    });
    this.scene.add(new THREE.Points(geo, mat));

  }

  // ── Oświetlenie ──────────────────────────────────────────────
  _buildLights() {
    // Ambient — delikatne wypełnienie (nocna strona planet nie jest całkiem czarna)
    this.scene.add(new THREE.AmbientLight(0x334466, 0.5));
    // PointLight od gwiazdy — decay=0: brak fizycznego tłumienia (r171 domyślnie decay=2
    // co przy intensity=2.0 i odl.=11j daje 2/121≈0.017 = czarny).
    // distance=0 = brak limitu zasięgu.
    this._starLight = new THREE.PointLight(0xffeedd, 1.5, 0, 0);
    this._starLight.position.set(0, 0, 0);
    this.scene.add(this._starLight);
  }

  // ── EventBus ─────────────────────────────────────────────────
  _setupEventBus() {
    EventBus.on('physics:updated', ({ planets, star, moons = [] }) => {
      this._syncPlanetMeshes(planets, moons);
      if (star) this._syncStarPosition(star);
    });

    EventBus.on('body:collision', ({ winner, loser, type }) => {
      if (type === 'absorb' || type === 'eject') {
        if (loser) this._removePlanetMesh(loser.id);
      }
      if (winner) this._updatePlanetMesh(winner);
      this._rebuildAllOrbits();
    });

    EventBus.on('accretion:newPlanet', (planet) => {
      this.addPlanetMesh(planet);
      this._rebuildAllOrbits();
    });

    EventBus.on('life:updated', ({ planet }) => {
      this._updateLifeGlow(planet);
      this._rebuildAllOrbits();
    });

    EventBus.on('disk:updated', ({ planetesimals }) => {
      this._updateDiskPoints(planetesimals);
    });

    EventBus.on('player:planetUpdated', ({ planet }) => {
      this._updatePlanetMesh(planet);
      this._rebuildAllOrbits();
    });

    EventBus.on('entity:removed', ({ entity }) => {
      this._removePlanetMesh(entity.id);
      this._removePlanetoidMesh(entity.id);
    });

    EventBus.on('orbits:stabilityChanged', () => {
      this._rebuildAllOrbits();
    });

    // Gracz przejmuje planetę → zmień zieloną kropkę na żółtą + odśwież orbity
    EventBus.on('planet:colonize', ({ planet }) => {
      this._updateLifeGlow(planet);
      this._rebuildAllOrbits();
    });

    EventBus.on('planet:ejected', ({ planet }) => {
      this._removePlanetMesh(planet.id);
    });

    // ── Vessel sprites ──────────────────────────────────────────
    EventBus.on('vessel:launched', ({ vessel }) => {
      this._addVesselSprite(vessel);
    });
    EventBus.on('vessel:docked', ({ vessel }) => {
      this._removeVesselSprite(vessel.id);
    });
    EventBus.on('vessel:positionUpdate', ({ vessels }) => {
      this._syncVesselPositions(vessels);
    });

    // ── Śledzenie kamery po kliknięciu ciała ─────────────────
    EventBus.on('body:selected', ({ entity }) => {
      this._focusEntityId = entity.id;
      // Księżyce — pozwól na głębszy zoom (r=0.015–0.04, potrzeba bliskiej kamery)
      if (this._cameraController) {
        this._cameraController.setMinDist(entity.type === 'moon' ? 0.5 : 3);
      }
      this._updateCameraFocus();
      // Pokaż orbitę planetoidy po kliknięciu
      this._showPlanetoidOrbit(entity.id, 0.35);
      // Pokaż orbitę księżyca po kliknięciu (ukryta domyślnie)
      this._hideAllMoonOrbits();
      if (entity.type === 'moon') this._showMoonOrbit(entity.id);
      // Odśwież orbitę planety gracza (żółty kolor)
      this._rebuildAllOrbits();
    });

    EventBus.on('body:deselected', () => {
      this._focusEntityId = null;
      // Przywróć domyślny min zoom
      if (this._cameraController) {
        this._cameraController.setMinDist(3);
        const sx = this._starGroup ? this._starGroup.position.x : 0;
        const sz = this._starGroup ? this._starGroup.position.z : 0;
        this._cameraController.focusOn(sx, sz);
      }
      // Ukryj orbity planetoidów i księżyców
      this._hideAllPlanetoidOrbits();
      this._hideAllMoonOrbits();
      this._rebuildAllOrbits();
    });

    // Hover na planetoidzie → pokaż orbitę jaśniej
    EventBus.on('planet:hover', ({ entityId }) => {
      // Przywróć domyślną widoczność orbit planetoidów (nie zaznaczonych)
      this._planetoidOrbits.forEach((line, id) => {
        if (id !== this._focusEntityId) {
          line.material.opacity = 0.12;
          line.visible = true;
        }
      });
      if (entityId) this._showPlanetoidOrbit(entityId, 0.20);
    });
  }

  // ── Inicjalizacja układu ─────────────────────────────────────
  initSystem(star, planets, planetesimals, moons = []) {
    this.renderStar(star);
    this._buildHabitableZone(star);
    planets.forEach(p => this.addPlanetMesh(p));
    moons.forEach(m => this._addMoonMesh(m));
    this._initPlanetoids();
    this._rebuildAllOrbits();
    if (planetesimals?.length > 0) this._updateDiskPoints(planetesimals);
  }

  // ── Gwiazda (3 sfery + PointLight) ──────────────────────────
  renderStar(star) {
    this._star = star;
    const r     = 1.6;   // stały promień 3D — niezależny od visualRadius (2D px)
    const color = new THREE.Color(star.visual.color);
    const glow  = new THREE.Color(star.visual.glowColor ?? star.visual.color);

    const group = new THREE.Group();
    group.position.set(S(star.x), 0, S(star.y));

    // Rdzeń — pełna kula
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(r, 48, 48),
      new THREE.MeshBasicMaterial({ color })
    ));

    // Warstwy glow — mniejsze mnożniki, glow max = 1.6*2.8 = 4.5j
    // (orbity wewnętrzne startują od ~4-5j więc glow ich nie zasłania)
    const glowLayers = [
      { size: 1.4, alpha: 0.30 },
      { size: 2.0, alpha: 0.12 },
      { size: 2.8, alpha: 0.04 },
    ];
    glowLayers.forEach(({ size, alpha }) => {
      group.add(new THREE.Mesh(
        new THREE.SphereGeometry(r * size, 24, 24),
        new THREE.MeshBasicMaterial({
          color: glow, transparent: true, opacity: alpha,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      ));
    });

    this.scene.add(group);
    this._starGroup = group;

    // Zaktualizuj PointLight
    this._starLight.color = color;
    this._starLight.position.set(S(star.x), 0, S(star.y));
  }

  // ── Strefa Goldilocksa ───────────────────────────────────────
  _buildHabitableZone(star) {
    const hzMin = S(star.habitableZone.min * AU);
    const hzMax = S(star.habitableZone.max * AU);
    const geo   = new THREE.RingGeometry(hzMin, hzMax, 128);
    const mat   = new THREE.MeshBasicMaterial({
      color: 0x33aa44, side: THREE.DoubleSide,
      transparent: true, opacity: 0.07, depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.5;
    this.scene.add(ring);
  }

  // Rozmiary 3D planet per typ — logarytmiczna skala masy
  // Gwiazda = 1.6 → planety ZAWSZE mniejsze (gas max 0.55 = 1/3 gwiazdy)
  // Hierarchia: gas > ice > rocky > hot_rocky (wyraźna różnica wizualna)
  static _planetRadius(planet) {
    const mass = planet.physics?.mass ?? 1;
    const type = planet.planetType;
    if (type === 'gas') {
      // 30–330 M⊕ → promień 0.35–0.55 (gwiazda 3–4.5× większa)
      return Math.max(0.35, Math.min(0.55, 0.25 + Math.log10(Math.max(1, mass)) * 0.12));
    }
    if (type === 'ice') {
      // 8–68 M⊕ → promień 0.20–0.32 (gwiazda 5–8× większa)
      return Math.max(0.20, Math.min(0.32, 0.15 + Math.log10(Math.max(1, mass)) * 0.09));
    }
    if (type === 'hot_rocky') {
      // 0.1–3 M⊕ → promień 0.07–0.12 (gwiazda 13–23× większa)
      return Math.max(0.07, Math.min(0.12, 0.07 + mass * 0.016));
    }
    // rocky: 0.2–8 M⊕ → promień 0.10–0.18 (gwiazda 9–16× większa)
    return Math.max(0.10, Math.min(0.18, 0.09 + mass * 0.012));
  }

  // ── Planeta mesh ─────────────────────────────────────────────
  addPlanetMesh(planet) {
    if (this._planets.has(planet.id)) return;

    const seed = hashCode(String(planet.id));
    const r    = ThreeRenderer._planetRadius(planet);

    const group = new THREE.Group();
    group.position.set(S(planet.x), 0, S(planet.y));

    // Materiał: PBR (MeshStandardMaterial) — pre-generowane tekstury z plików
    const texType = resolveTextureType(planet);
    let material;
    if (texType) {
      const variant = (seed % TEXTURE_VARIANTS) + 1;
      const maps    = loadPlanetTextures(texType, variant);
      // Gas giganty: metalness=0 (chmury), reszta: 0.05
      const isGas = planet.planetType === 'gas';
      material = new THREE.MeshStandardMaterial({
        map:          maps.diffuse,
        normalMap:    maps.normal,
        roughnessMap: maps.roughness,
        metalness:    isGas ? 0.0 : 0.05,
      });
    } else {
      // Fallback: solid color (nie powinno wystąpić — resolveTextureType pokrywa wszystkie typy)
      material = new THREE.MeshStandardMaterial({
        color: planet.visual?.color ?? 0x888888,
        metalness: 0.05, roughness: 0.7,
      });
    }

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 48, 48),
      material
    );
    mesh.rotation.z = 0.1 + (seed % 10) * 0.04;
    group.add(mesh);

    // Atmosferyczny glow
    if (planet.atmosphere && planet.atmosphere !== 'none') {
      const gc = planet.visual.glowColor ?? 0x4488ff;
      group.add(new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.12, 24, 24),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(gc), transparent: true, opacity: 0.14,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      ));
    }

    // Pierścienie dla planet lodowych
    if (planet.planetType === 'ice') {
      const ringCanvas = document.createElement('canvas');
      ringCanvas.width = 256; ringCanvas.height = 1;
      const rc = ringCanvas.getContext('2d');
      for (let x = 0; x < 256; x++) {
        const a = Math.sin(x / 256 * Math.PI) * 0.45 * (0.4 + (hashCode(x + seed) % 100) / 200);
        rc.fillStyle = `rgba(200,220,255,${a.toFixed(3)})`;
        rc.fillRect(x, 0, 1, 1);
      }
      const rTex = new THREE.CanvasTexture(ringCanvas);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.4, r * 2.2, 64),
        new THREE.MeshBasicMaterial({
          map: rTex, transparent: true,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI * 0.42;
      group.add(ring);
    }

    this._clickable.push(mesh);
    this._entityByUUID.set(mesh.uuid, planet);
    this._planets.set(planet.id, { group, mesh });
    this.scene.add(group);
  }

  _updatePlanetMesh(planet) {
    const entry = this._planets.get(planet.id);
    if (!entry) { this.addPlanetMesh(planet); return; }

    const { mesh } = entry;
    const seed = hashCode(String(planet.id));
    const r    = ThreeRenderer._planetRadius(planet);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.SphereGeometry(r, 48, 48);

    // Odtwórz materiał z odpowiednimi teksturami
    const texType = resolveTextureType(planet);
    mesh.material.dispose();
    if (texType) {
      const variant = (seed % TEXTURE_VARIANTS) + 1;
      const maps    = loadPlanetTextures(texType, variant);
      const isGas = planet.planetType === 'gas';
      mesh.material = new THREE.MeshStandardMaterial({
        map:          maps.diffuse,
        normalMap:    maps.normal,
        roughnessMap: maps.roughness,
        metalness:    isGas ? 0.0 : 0.05,
      });
    } else {
      mesh.material = new THREE.MeshStandardMaterial({
        color: planet.visual?.color ?? 0x888888,
        metalness: 0.05, roughness: 0.7,
      });
    }
  }

  _removePlanetMesh(id) {
    const entry = this._planets.get(id);
    if (!entry) return;

    const idx = this._clickable.indexOf(entry.mesh);
    if (idx !== -1) this._clickable.splice(idx, 1);
    this._entityByUUID.delete(entry.mesh.uuid);
    this.scene.remove(entry.group);
    entry.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        // Tekstury PBR z loadPlanetTextures są w _textureCache — nie dispose'uj
        obj.material.dispose();
      }
    });
    this._planets.delete(id);

    const lg = this._lifeGlows.get(id);
    if (lg) {
      entry.group.remove(lg);
      lg.material?.dispose();
      this._lifeGlows.delete(id);
    }
    const orb = this._orbits.get(id);
    if (orb) { this.scene.remove(orb); this._orbits.delete(id); }

    // Usuń księżyce powiązane z tą planetą
    this._moons.forEach((moonEntry, moonId) => {
      const entity = this._entityByUUID.get(moonEntry.mesh.uuid);
      if (entity?.parentPlanetId === id) {
        this.scene.remove(moonEntry.mesh);
        moonEntry.mesh.geometry.dispose();
        moonEntry.mesh.material.dispose();
        // Ring jest dzieckiem grupy planety — zostaje usunięty automatycznie przez traverse powyżej
        const idx = this._clickable.indexOf(moonEntry.mesh);
        if (idx !== -1) this._clickable.splice(idx, 1);
        this._entityByUUID.delete(moonEntry.mesh.uuid);
        this._moons.delete(moonId);
      }
    });
  }

  // ── Aktualizacja celu kamery na śledzonym ciele ──────────────
  _updateCameraFocus() {
    if (!this._focusEntityId || !this._cameraController) return;

    // Sprawdź planety
    const pEntry = this._planets.get(this._focusEntityId);
    if (pEntry) {
      this._cameraController.focusOn(pEntry.group.position.x, pEntry.group.position.z);
      return;
    }
    // Sprawdź księżyce
    const mEntry = this._moons.get(this._focusEntityId);
    if (mEntry) {
      this._cameraController.focusOn(mEntry.mesh.position.x, mEntry.mesh.position.z);
      return;
    }
    // Sprawdź planetoidy
    const pdEntry = this._planetoids.get(this._focusEntityId);
    if (pdEntry) {
      this._cameraController.focusOn(pdEntry.mesh.position.x, pdEntry.mesh.position.z);
    }
  }

  // ── Synchronizacja pozycji planet i księżyców ─────────────────
  _syncPlanetMeshes(planets, moons = []) {
    const homePlanetId = window.KOSMOS?.homePlanet?.id;

    planets.forEach(planet => {
      const entry = this._planets.get(planet.id);
      if (!entry) return;
      entry.group.position.set(S(planet.x), 0, S(planet.y));
      entry.mesh.rotation.y += 0.003;

      const lg = this._lifeGlows.get(planet.id);
      if (lg) {
        // Planeta gracza: szybsze + mocniejsze pulsowanie (żółta kropka)
        const isPlayer = planet.id === homePlanetId;
        lg._phase = (lg._phase || 0) + (isPlayer ? 0.045 : 0.025);
        lg.material.opacity = isPlayer
          ? 0.80 + Math.sin(lg._phase) * 0.20   // 0.60–1.00
          : 0.75 + Math.sin(lg._phase) * 0.20;  // 0.55–0.95
      }
    });

    // Księżyce: pozycja bezpośrednio z fizyki (absolutna w pikselach → Three.js)
    moons.forEach(moon => {
      const entry = this._moons.get(moon.id);
      if (!entry) return;
      entry.mesh.position.set(S(moon.x), 0, S(moon.y));
    });

    // Planetoidy: synchronizuj pozycje meshów
    this._syncPlanetoidPositions();

    // Aktualizuj śledzenie kamery (ciało się porusza → kamera za nim)
    this._updateCameraFocus();

    this._syncSmallBodies();

    // Periodyczne odświeżanie orbit (co ~180 klatek ≈ 3s przy 60fps)
    this._orbitRebuildCounter++;
    if (this._orbitRebuildCounter >= 180) {
      this._orbitRebuildCounter = 0;
      this._rebuildAllOrbits();
      this._rebuildPlanetoidOrbits();
    }
  }

  // ── Mesh księżyca + orbit line ────────────────────────────────
  // Eliptyczna orbita jako dziecko grupy planety-rodzica (podąża za planetą).
  // Sfera księżyca w scenie — pozycja aktualizowana w _syncPlanetMeshes.
  // Orbita ukryta domyślnie — widoczna po kliknięciu na księżyc.
  _addMoonMesh(moon) {
    const parentEntry = this._planets.get(moon.parentPlanetId);
    if (!parentEntry) return;

    // Eliptyczna orbita — dziecko grupy planety (local space, XZ plane)
    const orb   = moon.orbital;
    const a3d   = orb.a * AU / WORLD_SCALE;               // półoś wielka w Three.js
    const b3d   = a3d * Math.sqrt(1 - orb.e * orb.e);     // półoś mała
    const c3d   = a3d * orb.e;                              // odl. ognisko → centrum
    const angle = orb.inclinationOffset || 0;

    // Centrum elipsy przesunięte o c (planeta w ognisku, nie w centrum)
    const cx = -c3d * Math.cos(angle);
    const cz = -c3d * Math.sin(angle);

    const STEPS  = 96;
    const points = [];
    for (let i = 0; i <= STEPS; i++) {
      const t  = (i / STEPS) * Math.PI * 2;
      const ex = a3d * Math.cos(t);
      const ey = b3d * Math.sin(t);
      const rx = ex * Math.cos(angle) - ey * Math.sin(angle) + cx;
      const ry = ex * Math.sin(angle) + ey * Math.cos(angle) + cz;
      points.push(new THREE.Vector3(rx, 0, ry));
    }

    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0x445566, transparent: true, opacity: 0.30,
      })
    );
    ring.visible = false;  // ukryta domyślnie — widoczna po kliknięciu
    parentEntry.group.add(ring);

    // Sfera księżyca — w scenie, pozycja synchronizowana z moon.x/y
    // Promień oparty o masę: 0.0001–0.015 M⊕ → r = 0.015–0.04 (zawsze mniejsze od planet)
    const r   = Math.max(0.015, Math.min(0.04, 0.015 + (moon.physics?.mass ?? 0.001) * 1.5));
    const geo = new THREE.SphereGeometry(r, 12, 8);
    const mat = new THREE.MeshPhongMaterial({ color: moon.visual.color, shininess: 15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(S(moon.x), 0, S(moon.y));
    this.scene.add(mesh);

    this._clickable.push(mesh);
    this._entityByUUID.set(mesh.uuid, moon);
    this._moons.set(moon.id, { mesh, ring, parentEntry });
  }

  // Pokaż orbitę konkretnego księżyca
  _showMoonOrbit(moonId) {
    const entry = this._moons.get(moonId);
    if (!entry?.ring) return;
    entry.ring.material.opacity = 0.30;
    entry.ring.visible = true;
  }

  // Ukryj wszystkie orbity księżyców
  _hideAllMoonOrbits() {
    this._moons.forEach(entry => {
      if (entry.ring) {
        entry.ring.material.opacity = 0;
        entry.ring.visible = false;
      }
    });
  }

  // ── Znacznik na planecie: żółty (gracz) lub zielony (życie) ───
  // Sprite (billboard) jako dziecko entry.group — automatycznie podąża za planetą
  _updateLifeGlow(planet) {
    const entry = this._planets.get(planet.id);
    const old   = this._lifeGlows.get(planet.id);
    if (old) {
      if (entry) entry.group.remove(old);
      old.material?.dispose();
      this._lifeGlows.delete(planet.id);
    }

    // Planeta gracza → żółta kropka (niezależnie od lifeScore)
    const isPlayer = planet.id === window.KOSMOS?.homePlanet?.id;
    if (!isPlayer && planet.lifeScore <= 0) return;
    if (!entry) return;

    const r       = ThreeRenderer._planetRadius(planet);
    // Kropka gracza nieco większa
    const dotSize = isPlayer ? Math.max(0.05, r * 0.45) : Math.max(0.04, r * 0.35);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: isPlayer ? this._playerDotTex : this._lifeDotTex,
        transparent: true, opacity: 0.90,
        depthWrite: false,
      })
    );
    sprite.scale.set(dotSize * 2, dotSize * 2, 1);

    // Prawy górny narożnik tarczy planety (w lokalnej przestrzeni grupy)
    const offset = r * 0.72 + dotSize;
    sprite.position.set(offset, offset, 0);
    sprite._phase = Math.random() * Math.PI * 2;
    sprite._isPlayer = isPlayer;

    entry.group.add(sprite);
    this._lifeGlows.set(planet.id, sprite);
  }

  // Współdzielona tekstura zielonej kropki (życie) — tworzona raz
  static _createLifeDotTexture() {
    const c   = document.createElement('canvas');
    c.width   = 32; c.height = 32;
    const dc  = c.getContext('2d');

    const grd = dc.createRadialGradient(16, 16, 3, 16, 16, 14);
    grd.addColorStop(0, 'rgba(136,255,204,0.9)');
    grd.addColorStop(0.5, 'rgba(68,255,136,0.4)');
    grd.addColorStop(1,   'rgba(68,255,136,0)');
    dc.fillStyle = grd;
    dc.fillRect(0, 0, 32, 32);

    dc.beginPath();
    dc.arc(16, 16, 5, 0, Math.PI * 2);
    dc.fillStyle = '#88ffcc';
    dc.fill();

    return new THREE.CanvasTexture(c);
  }

  // Współdzielona tekstura żółtej kropki (planeta gracza) — tworzona raz
  static _createPlayerDotTexture() {
    const c   = document.createElement('canvas');
    c.width   = 32; c.height = 32;
    const dc  = c.getContext('2d');

    // Zewnętrzna poświata — złoto-żółta
    const grd = dc.createRadialGradient(16, 16, 3, 16, 16, 14);
    grd.addColorStop(0, 'rgba(255,220,68,0.95)');
    grd.addColorStop(0.5, 'rgba(255,180,34,0.5)');
    grd.addColorStop(1,   'rgba(255,150,0,0)');
    dc.fillStyle = grd;
    dc.fillRect(0, 0, 32, 32);

    // Środkowa pełna kropka — jasno-żółta
    dc.beginPath();
    dc.arc(16, 16, 5, 0, Math.PI * 2);
    dc.fillStyle = '#ffdd44';
    dc.fill();

    return new THREE.CanvasTexture(c);
  }

  // ── Orbity eliptyczne ─────────────────────────────────────────
  _rebuildAllOrbits() {
    this._orbits.forEach(line => this.scene.remove(line));
    this._orbits.clear();
    EntityManager.getByType('planet').forEach(p => this._buildOrbit(p));
  }

  _buildOrbit(planet) {
    const orb  = planet.orbital;
    const star = this._star;
    if (!orb || !star) return;

    const a     = S(orb.a * AU);
    const b     = a * Math.sqrt(1 - orb.e * orb.e);
    const c     = a * orb.e;
    const angle = orb.inclinationOffset;
    const cx    = S(star.x) - c * Math.cos(angle);
    const cz    = S(star.y) - c * Math.sin(angle);

    let color = 0x1a3a5a;
    if (planet.lifeScore > 0)          color = 0x226622;
    // Złoty kolor orbity dla planety gracza
    if (planet.id === window.KOSMOS?.homePlanet?.id) color = 0x7a6a22;
    if (planet.orbitalStability < 0.5) color = 0x774422;
    if (planet.isSelected)             color = 0x4a8ae8;

    const STEPS  = 128;
    const points = [];
    for (let i = 0; i <= STEPS; i++) {
      const t  = (i / STEPS) * Math.PI * 2;
      const ex = a * Math.cos(t);
      const ey = b * Math.sin(t);
      const rx = ex * Math.cos(angle) - ey * Math.sin(angle) + cx;
      const ry = ex * Math.sin(angle) + ey * Math.cos(angle) + cz;
      points.push(new THREE.Vector3(rx, 0, ry));
    }

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(color), transparent: true, opacity: 0.35,
      })
    );
    this.scene.add(line);
    this._orbits.set(planet.id, line);
  }

  // ── Planetoidy: indywidualne meshe + ukryte orbity ───────────────

  // Tworzy sfery mesh + orbit lines dla wszystkich planetoidów (orbity ukryte domyślnie)
  _initPlanetoids() {
    const planetoids = EntityManager.getByType('planetoid');
    planetoids.forEach(p => {
      // Mesh sfery (r = 0.08–0.12 na podstawie masy — widoczne w zewnętrznym układzie)
      const mass = p.physics?.mass ?? 0.01;
      const r = Math.max(0.08, Math.min(0.12, 0.06 + mass * 0.8));
      const geo = new THREE.SphereGeometry(r, 16, 12);

      // PBR tekstura z pre-generowanych plików
      const texType = resolveTextureType(p);
      let mat;
      if (texType) {
        const seed    = hashCode(String(p.id));
        const variant = (seed % TEXTURE_VARIANTS) + 1;
        const maps    = loadPlanetTextures(texType, variant);
        // Metallic planetoids: wyższy metalness (błyszczące)
        const isMetallic = p.planetoidType === 'metallic';
        mat = new THREE.MeshStandardMaterial({
          map:          maps.diffuse,
          normalMap:    maps.normal,
          roughnessMap: maps.roughness,
          metalness:    isMetallic ? 0.25 : 0.05,
        });
      } else {
        // Fallback: solid color
        mat = new THREE.MeshStandardMaterial({
          color: p.visual?.color ?? 0x998877,
          metalness: 0.05, roughness: 0.7,
        });
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(S(p.x), 0, S(p.y));
      this.scene.add(mesh);

      this._clickable.push(mesh);
      this._entityByUUID.set(mesh.uuid, p);
      this._planetoids.set(p.id, { mesh });

      // Orbita (ukryta domyślnie)
      this._buildPlanetoidOrbit(p);
    });
  }

  // Usuń mesh i orbitę planetoidy (entity:removed)
  _removePlanetoidMesh(id) {
    const entry = this._planetoids.get(id);
    if (!entry) return;
    const idx = this._clickable.indexOf(entry.mesh);
    if (idx !== -1) this._clickable.splice(idx, 1);
    this._entityByUUID.delete(entry.mesh.uuid);
    this.scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.mesh.material.dispose();
    this._planetoids.delete(id);

    const orb = this._planetoidOrbits.get(id);
    if (orb) {
      this.scene.remove(orb);
      orb.geometry.dispose();
      orb.material.dispose();
      this._planetoidOrbits.delete(id);
    }
  }

  // Synchronizuj pozycje meshów planetoidów z danymi fizyki
  _syncPlanetoidPositions() {
    const planetoids = EntityManager.getByType('planetoid');
    planetoids.forEach(p => {
      const entry = this._planetoids.get(p.id);
      if (entry) {
        entry.mesh.position.set(S(p.x), 0, S(p.y));
      }
    });
  }

  // Pokaż orbitę konkretnej planetoidy (hover/click)
  _showPlanetoidOrbit(entityId, opacity = 0.25) {
    const line = this._planetoidOrbits.get(entityId);
    if (!line) return;
    line.material.opacity = opacity;
    line.visible = true;
  }

  // Przywróć domyślną widoczność orbit planetoidów (przyciemnione)
  _hideAllPlanetoidOrbits() {
    this._planetoidOrbits.forEach(line => {
      line.material.opacity = 0.12;
      line.visible = true;
    });
  }

  // Przebuduj geometrię orbit planetoidów (zachowaj widoczność)
  _rebuildPlanetoidOrbits() {
    // Zapamiętaj stan widoczności
    const wasVisible = new Map();
    this._planetoidOrbits.forEach((line, id) => {
      wasVisible.set(id, { visible: line.visible, opacity: line.material.opacity });
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });
    this._planetoidOrbits.clear();

    EntityManager.getByType('planetoid').forEach(p => {
      this._buildPlanetoidOrbit(p);
      // Przywróć wcześniejszy stan widoczności
      const prev = wasVisible.get(p.id);
      if (prev) {
        const line = this._planetoidOrbits.get(p.id);
        if (line) {
          line.visible = prev.visible;
          line.material.opacity = prev.opacity;
        }
      }
    });
  }

  // Buduje linię orbity jednej planetoidy (domyślnie ukryta)
  _buildPlanetoidOrbit(planetoid) {
    const orb  = planetoid.orbital;
    const star = this._star;
    if (!orb || !star) return;

    const a     = S(orb.a * AU);
    const b     = a * Math.sqrt(1 - orb.e * orb.e);
    const c     = a * orb.e;
    const angle = orb.inclinationOffset || 0;
    const cx    = S(star.x) - c * Math.cos(angle);
    const cz    = S(star.y) - c * Math.sin(angle);

    const STEPS  = 96;
    const points = [];
    for (let i = 0; i <= STEPS; i++) {
      const t  = (i / STEPS) * Math.PI * 2;
      const ex = a * Math.cos(t);
      const ey = b * Math.sin(t);
      const rx = ex * Math.cos(angle) - ey * Math.sin(angle) + cx;
      const ry = ex * Math.sin(angle) + ey * Math.cos(angle) + cz;
      points.push(new THREE.Vector3(rx, 0, ry));
    }

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0x554433, transparent: true, opacity: 0.12,
      })
    );
    line.visible = true;
    this.scene.add(line);
    this._planetoidOrbits.set(planetoid.id, line);
  }

  // ── Dysk protoplanetarny ──────────────────────────────────────
  _updateDiskPoints(planetesimals) {
    if (this._diskPoints) {
      this.scene.remove(this._diskPoints);
      this._diskPoints.geometry.dispose();
      this._diskPoints.material.dispose();
      this._diskPoints = null;
    }
    if (!planetesimals?.length) return;

    const pos = new Float32Array(planetesimals.length * 3);
    const col = new Float32Array(planetesimals.length * 3);
    planetesimals.forEach((p, i) => {
      pos[i*3  ] = S(p.x); pos[i*3+1] = 0; pos[i*3+2] = S(p.y);
      const b = 0.20 + (p.id % 9) * 0.04;
      col[i*3] = b*0.8; col[i*3+1] = b*0.9; col[i*3+2] = b;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    this._diskPoints = new THREE.Points(geo,
      new THREE.PointsMaterial({ size: 0.25, vertexColors: true }));
    this.scene.add(this._diskPoints);
  }

  // ── Małe ciała ────────────────────────────────────────────────
  _syncSmallBodies() {
    const bodies = [
      ...EntityManager.getByType('asteroid'),
      ...EntityManager.getByType('comet'),
    ];
    if (this._smallBodyPoints) {
      this.scene.remove(this._smallBodyPoints);
      this._smallBodyPoints.geometry.dispose();
      this._smallBodyPoints.material.dispose();
      this._smallBodyPoints = null;
    }
    if (!bodies.length) return;

    const pos = new Float32Array(bodies.length * 3);
    const col = new Float32Array(bodies.length * 3);
    bodies.forEach((b, i) => {
      pos[i*3] = S(b.x); pos[i*3+1] = 0; pos[i*3+2] = S(b.y);
      if (b.type === 'comet') { col[i*3]=0.7; col[i*3+1]=0.8; col[i*3+2]=1.0; }
      else { const v = 0.45; col[i*3]=v; col[i*3+1]=v; col[i*3+2]=v; }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    this._smallBodyPoints = new THREE.Points(geo,
      new THREE.PointsMaterial({ size: 0.3, vertexColors: true }));
    this.scene.add(this._smallBodyPoints);
  }

  // ── Synchronizacja gwiazdy ────────────────────────────────────
  _syncStarPosition(star) {
    this._star = star;
    if (this._starGroup) {
      this._starGroup.position.set(S(star.x), 0, S(star.y));
      this._starLight.position.set(S(star.x), 0, S(star.y));
    }
  }

  // ── Kliknięcie (raycasting) ───────────────────────────────────
  // screenX/Y w CSS-pikselach (e.clientX) — normalizujemy przez window.innerWidth/H
  handleClick(screenX, screenY) {
    this._mouse.x =  (screenX / window.innerWidth)  * 2 - 1;
    this._mouse.y = -(screenY / window.innerHeight) * 2 + 1;
    this._ray.setFromCamera(this._mouse, this.camera);

    const hits = this._ray.intersectObjects(this._clickable);
    if (hits.length > 0) {
      const entity = this._entityByUUID.get(hits[0].object.uuid);
      if (entity) { EventBus.emit('body:selected', { entity }); return true; }
    }
    EventBus.emit('body:deselected');
    return false;
  }

  // Zwraca encję pod kursorem BEZ emitowania eventów (do dblclick)
  getEntityAtScreen(screenX, screenY) {
    this._mouse.x =  (screenX / window.innerWidth)  * 2 - 1;
    this._mouse.y = -(screenY / window.innerHeight) * 2 + 1;
    this._ray.setFromCamera(this._mouse, this.camera);

    const hits = this._ray.intersectObjects(this._clickable);
    if (hits.length > 0) {
      return this._entityByUUID.get(hits[0].object.uuid) ?? null;
    }
    return null;
  }

  handleMouseMove(screenX, screenY) {
    this._mouse.x =  (screenX / window.innerWidth)  * 2 - 1;
    this._mouse.y = -(screenY / window.innerHeight) * 2 + 1;
    this._ray.setFromCamera(this._mouse, this.camera);

    const hits  = this._ray.intersectObjects(this._clickable);
    const newId = hits.length > 0
      ? (this._entityByUUID.get(hits[0].object.uuid)?.id ?? null)
      : null;
    if (newId !== this._hoverPlanetId) {
      this._hoverPlanetId = newId;
      EventBus.emit('planet:hover', { entityId: newId });
    }
  }

  // ── Pętla renderowania ────────────────────────────────────────
  _startLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      const t = this._clock.getElapsedTime();

      // Pulsowanie gwiazdy
      if (this._starGroup && this._starGroup.children.length > 1) {
        this._starGroup.children[1].material.opacity = 0.25 + Math.sin(t * 2) * 0.08;
        if (this._starGroup.children[2]) {
          this._starGroup.children[2].material.opacity = 0.06 + Math.sin(t * 1.5) * 0.03;
          this._starGroup.children[2].scale.setScalar(1 + Math.sin(t * 1.8) * 0.05);
        }
      }

      // Aktualizuj kamerę (płynny zoom + orbit)
      if (this._cameraController) this._cameraController.update();

      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  getCamera() { return this.camera; }

  // Rejestracja kontrolera kamery (ustawiany przez GameScene)
  setCameraController(ctrl) { this._cameraController = ctrl; }

  // ── Vessel sprites ──────────────────────────────────────────────────

  /**
   * Dodaj sprite statku na mapie 3D.
   */
  _addVesselSprite(vessel) {
    if (this._vessels.has(vessel.id)) return;

    // Kolor wg typu statku
    const typeColors = {
      science_vessel: 0x4488ff,
      colony_ship:    0xff8800,
      cargo_ship:     0x44cc66,
    };
    const color = typeColors[vessel.shipId] ?? 0xaaaaaa;

    // Stwórz sprite (billboard)
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const c = canvas.getContext('2d');
    // Romb z kolorem
    c.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    c.beginPath();
    c.moveTo(16, 2); c.lineTo(30, 16); c.lineTo(16, 30); c.lineTo(2, 16);
    c.closePath(); c.fill();
    // Obramowanie
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.9,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.4, 0.4, 1);

    // Pozycja startowa
    const px = S(vessel.position.x);
    const pz = S(vessel.position.y);
    sprite.position.set(px, 0.3, pz); // lekko nad płaszczyzną

    this.scene.add(sprite);

    // Linia trasy (przerywana)
    let routeLine = null;
    if (vessel.mission) {
      const startPx = S(vessel.mission.startX ?? vessel.position.x);
      const startPz = S(vessel.mission.startY ?? vessel.position.y);
      const targetPx = S(vessel.mission.targetX ?? 0);
      const targetPz = S(vessel.mission.targetY ?? 0);

      const points = [
        new THREE.Vector3(startPx, 0.1, startPz),
        new THREE.Vector3(targetPx, 0.1, targetPz),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineDashedMaterial({
        color, dashSize: 0.3, gapSize: 0.15,
        transparent: true, opacity: 0.4,
      });
      routeLine = new THREE.Line(geo, lineMat);
      routeLine.computeLineDistances();
      this.scene.add(routeLine);
    }

    this._vessels.set(vessel.id, { sprite, routeLine, tex });
  }

  /**
   * Usuń sprite statku z mapy 3D.
   */
  _removeVesselSprite(vesselId) {
    const entry = this._vessels.get(vesselId);
    if (!entry) return;

    this.scene.remove(entry.sprite);
    entry.sprite.material.dispose();
    if (entry.tex) entry.tex.dispose();
    if (entry.routeLine) {
      this.scene.remove(entry.routeLine);
      entry.routeLine.geometry.dispose();
      entry.routeLine.material.dispose();
    }
    this._vessels.delete(vesselId);
  }

  /**
   * Synchronizuj pozycje vessel sprites z danymi z VesselManager.
   */
  _syncVesselPositions(vessels) {
    for (const vessel of vessels) {
      const entry = this._vessels.get(vessel.id);
      if (!entry) {
        // Vessel w tranzycie ale nie ma sprite'a → stwórz
        this._addVesselSprite(vessel);
        continue;
      }
      entry.sprite.position.set(S(vessel.position.x), 0.3, S(vessel.position.y));

      // Aktualizuj linię trasy
      if (entry.routeLine && vessel.mission) {
        const m = vessel.mission;
        const sx = m.phase === 'returning' ? S(m.returnStartX ?? 0) : S(m.startX ?? 0);
        const sz = m.phase === 'returning' ? S(m.returnStartY ?? 0) : S(m.startY ?? 0);
        const tx = m.phase === 'returning' ? S(m.returnTargetX ?? 0) : S(m.targetX ?? 0);
        const tz = m.phase === 'returning' ? S(m.returnTargetY ?? 0) : S(m.targetY ?? 0);
        const posArr = entry.routeLine.geometry.attributes.position.array;
        posArr[0] = sx; posArr[1] = 0.1; posArr[2] = sz;
        posArr[3] = tx; posArr[4] = 0.1; posArr[5] = tz;
        entry.routeLine.geometry.attributes.position.needsUpdate = true;
        entry.routeLine.computeLineDistances();
      }
    }
  }
}
