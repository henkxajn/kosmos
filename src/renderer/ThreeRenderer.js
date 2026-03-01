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

const AU          = GAME_CONFIG.AU_TO_PX;   // 110
const WORLD_SCALE = 10;                      // dzielnik pozycji: AU×11 w 3D
const S           = (v) => v / WORLD_SCALE; // skrót: skaluj pozycję
const SR          = (r) => r / WORLD_SCALE; // skaluj promień

const LIFE_GLOW_COL = 0x44ff88;

// ── FBM tekstury (port z prototypu) ─────────────────────────────
function noise(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}
function fbm(x, y, seed, octaves = 6) {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise(x * freq, y * freq, seed);
    amp *= 0.5; freq *= 2;
  }
  return val;
}

const PALETTES = {
  hot_rocky: [[180,40,20],[220,80,20],[140,20,10],[255,120,30],[60,10,5]],
  rocky:     [[100,90,80],[130,120,100],[80,75,65],[150,140,120],[60,55,50]],
  rocky_hz:  [[34,80,60],[45,120,80],[80,150,60],[170,160,100],[200,200,220]],
  gas:       [[180,150,120],[200,170,130],[160,130,100],[140,120,90],[210,190,160]],
  gas_cold:  [[150,180,255],[100,140,220],[180,200,255],[80,120,200],[140,160,240]],
  ice:       [[180,200,240],[140,170,220],[200,220,255],[100,140,200],[240,245,255]],
};

function generateTexture(planetType, seed, tempK) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Wybór palety
  let palKey = 'rocky';
  if (planetType === 'hot_rocky') palKey = 'hot_rocky';
  else if (planetType === 'gas')  palKey = (seed % 2 === 0) ? 'gas' : 'gas_cold';
  else if (planetType === 'ice')  palKey = 'ice';
  else if (tempK > 250 && tempK < 400) palKey = 'rocky_hz'; // HZ = zielonkawa

  const pal = PALETTES[palKey];

  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 256; x++) {
      const nx = x / 256, ny = y / 128;
      let val;

      if (planetType === 'gas') {
        // Gaz: poziome pasy z turbulencjami
        val = fbm(nx * 2 + ny * 0.5, ny * 8, seed, 5);
        val = (Math.sin(ny * 20 + val * 6) + 1) * 0.5;
      } else {
        val = fbm(nx * 4, ny * 4, seed, 6);
      }

      const idx = Math.min(Math.floor(val * pal.length), pal.length - 1);
      const c   = pal[idx];
      const v   = 0.85 + noise(x * 0.1, y * 0.1, seed + 1) * 0.3;
      ctx.fillStyle = `rgb(${c[0]*v|0},${c[1]*v|0},${c[2]*v|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Czapa polarna dla planety lodowej
  if (planetType === 'ice') {
    const capH = 25 + (seed % 8) * 3;
    const g = ctx.createLinearGradient(0, 0, 0, capH);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, capH);
    const g2 = ctx.createLinearGradient(0, 128 - capH, 0, 128);
    g2.addColorStop(0, 'rgba(255,255,255,0)');
    g2.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = g2; ctx.fillRect(0, 128 - capH, 256, capH);
  }

  return new THREE.CanvasTexture(canvas);
}

// ── Hash do seedów deterministycznych ───────────────────────────
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

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
    // Bez fizycznego tone mappingu — r171 ACES ciemni MeshPhongMaterial
    this.renderer.toneMapping = THREE.NoToneMapping;

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
    this._entityByUUID = new Map();   // mesh.uuid → entity
    this._clickable    = [];

    // Współdzielona tekstura kropki życia — tworzona raz
    this._lifeDotTex = ThreeRenderer._createLifeDotTexture();

    // ── Małe ciała i dysk ─────────────────────────────────────
    this._diskPoints      = null;
    this._smallBodyPoints = null;

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

    // Mgławica — 30 gradientowych plam
    const nebCanvas = document.createElement('canvas');
    nebCanvas.width = 512; nebCanvas.height = 512;
    const nc = nebCanvas.getContext('2d');
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const r = 60 + Math.random() * 180;
      const g = nc.createRadialGradient(x, y, 0, x, y, r);
      const hue = 200 + Math.random() * 60;
      g.addColorStop(0, `hsla(${hue},60%,40%,0.04)`);
      g.addColorStop(1, 'transparent');
      nc.fillStyle = g; nc.fillRect(0, 0, 512, 512);
    }
    const nebTex = new THREE.CanvasTexture(nebCanvas);
    const plane  = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshBasicMaterial({
        map: nebTex, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    plane.position.z = -200;
    this.scene.add(plane);
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
    });

    EventBus.on('orbits:stabilityChanged', () => {
      this._rebuildAllOrbits();
    });

    EventBus.on('planet:ejected', ({ planet }) => {
      this._removePlanetMesh(planet.id);
    });

    // ── Śledzenie kamery po kliknięciu ciała ─────────────────
    EventBus.on('body:selected', ({ entity }) => {
      this._focusEntityId = entity.id;
      // Księżyce — pozwól na głębszy zoom (r=0.015–0.04, potrzeba bliskiej kamery)
      if (this._cameraController) {
        this._cameraController.setMinDist(entity.type === 'moon' ? 0.5 : 3);
      }
      this._updateCameraFocus();
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
    });
  }

  // ── Inicjalizacja układu ─────────────────────────────────────
  initSystem(star, planets, planetesimals, moons = []) {
    this.renderStar(star);
    this._buildHabitableZone(star);
    planets.forEach(p => this.addPlanetMesh(p));
    moons.forEach(m => this._addMoonMesh(m));
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

    // Sfera planety z FBM teksturą (MeshPhongMaterial — działa z każdą wersją Three.js)
    const tex  = generateTexture(planet.planetType, seed, planet.temperatureK || 0);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 48, 48),
      new THREE.MeshPhongMaterial({
        map:       tex,
        shininess: planet.planetType === 'ice' ? 60 : 8,
        specular:  new THREE.Color(0x111111),
      })
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
    if (mesh.material.map) { mesh.material.map.dispose(); }
    mesh.material.map = generateTexture(planet.planetType, seed, planet.temperatureK || 0);
    mesh.material.needsUpdate = true;
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
      if (obj.material?.map) obj.material.map.dispose();
      if (obj.material) obj.material.dispose();
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
    }
  }

  // ── Synchronizacja pozycji planet i księżyców ─────────────────
  _syncPlanetMeshes(planets, moons = []) {
    planets.forEach(planet => {
      const entry = this._planets.get(planet.id);
      if (!entry) return;
      entry.group.position.set(S(planet.x), 0, S(planet.y));
      entry.mesh.rotation.y += 0.003;

      const lg = this._lifeGlows.get(planet.id);
      if (lg) {
        lg._phase = (lg._phase || 0) + 0.025;
        lg.material.opacity = 0.75 + Math.sin(lg._phase) * 0.20;
      }
    });

    // Księżyce: pozycja bezpośrednio z fizyki (absolutna w pikselach → Three.js)
    moons.forEach(moon => {
      const entry = this._moons.get(moon.id);
      if (!entry) return;
      entry.mesh.position.set(S(moon.x), 0, S(moon.y));
    });

    // Aktualizuj śledzenie kamery (ciało się porusza → kamera za nim)
    this._updateCameraFocus();

    this._syncSmallBodies();
  }

  // ── Mesh księżyca + orbit ring ────────────────────────────────
  // Ring jako dziecko grupy planety-rodzica — automatycznie podąża za planetą.
  // Sfera księżyca w scenie — pozycja aktualizowana w _syncPlanetMeshes.
  _addMoonMesh(moon) {
    const parentEntry = this._planets.get(moon.parentPlanetId);
    if (!parentEntry) return;

    // Orbit ring — dziecko grupy planety (płaszczyzna XZ = obrót -π/2 wokół X)
    const ringR   = moon.orbital.a * AU / WORLD_SCALE;  // AU → ThreeJS units
    const ringGeo = new THREE.RingGeometry(Math.max(0.01, ringR - 0.018), ringR + 0.018, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x445566, transparent: true, opacity: 0.30,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
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

  // ── Znacznik życia — mała kropka przy planecie ────────────────
  // Sprite (billboard) jako dziecko entry.group — automatycznie podąża za planetą
  _updateLifeGlow(planet) {
    const entry = this._planets.get(planet.id);
    const old   = this._lifeGlows.get(planet.id);
    if (old) {
      if (entry) entry.group.remove(old);
      old.material?.dispose();
      this._lifeGlows.delete(planet.id);
    }
    if (planet.lifeScore <= 0 || !entry) return;

    const r       = ThreeRenderer._planetRadius(planet);
    const dotSize = Math.max(0.04, r * 0.35);   // rozmiar kropki (skalowana do nowych mniejszych planet)

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this._lifeDotTex,
        transparent: true, opacity: 0.90,
        depthWrite: false,
      })
    );
    sprite.scale.set(dotSize * 2, dotSize * 2, 1);

    // Prawy górny narożnik tarczy planety (w lokalnej przestrzeni grupy)
    const offset = r * 0.72 + dotSize;
    sprite.position.set(offset, offset, 0);
    sprite._phase = Math.random() * Math.PI * 2;

    entry.group.add(sprite);
    this._lifeGlows.set(planet.id, sprite);
  }

  // Współdzielona tekstura zielonej kropki — tworzona raz w konstruktorze
  static _createLifeDotTexture() {
    const c   = document.createElement('canvas');
    c.width   = 32; c.height = 32;
    const dc  = c.getContext('2d');

    // Zewnętrzna poświata
    const grd = dc.createRadialGradient(16, 16, 3, 16, 16, 14);
    grd.addColorStop(0, 'rgba(136,255,204,0.9)');
    grd.addColorStop(0.5, 'rgba(68,255,136,0.4)');
    grd.addColorStop(1,   'rgba(68,255,136,0)');
    dc.fillStyle = grd;
    dc.fillRect(0, 0, 32, 32);

    // Środkowa pełna kropka
    dc.beginPath();
    dc.arc(16, 16, 5, 0, Math.PI * 2);
    dc.fillStyle = '#88ffcc';
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
      ...EntityManager.getByType('planetoid'),
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
      if (b.type === 'comet')    { col[i*3]=0.7; col[i*3+1]=0.8; col[i*3+2]=1.0; }
      else if (b.type === 'planetoid') { col[i*3]=0.7; col[i*3+1]=0.6; col[i*3+2]=0.5; }
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
}
