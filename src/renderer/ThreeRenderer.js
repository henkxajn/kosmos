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
import { GAME_CONFIG, STAR_TYPES } from '../config/GameConfig.js';
import { resolveTextureType, loadPlanetTextures, loadStarTextures, hashCode, TEXTURE_VARIANTS }
  from './PlanetTextureUtils.js';
import { RegionGenerator }    from '../map/RegionSystem.js';
import { BiomeMapGenerator }  from './BiomeMapGenerator.js';
import { PlanetShader }       from './PlanetShader.js';
import { GasGiantShader }    from './GasGiantShader.js';

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
    this.renderer.setClearColor(0x020405, 1); // tło: #020405 (spec bg)

    // ── Obsługa utraty/odzyskania kontekstu WebGL ───────────
    this._contextLost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // pozwól przeglądarce odzyskać kontekst
      this._contextLost = true;
      console.warn('[ThreeRenderer] WebGL context lost');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false;
      console.info('[ThreeRenderer] WebGL context restored — rebuilding scene');
      this.renderer.setClearColor(0x020405, 1);
      // Odbuduj tekstury — Three.js nie robi tego automatycznie po context loss
      try {
        this.scene.traverse((obj) => {
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
              mat.needsUpdate = true;
              if (mat.map) mat.map.needsUpdate = true;
              if (mat.normalMap) mat.normalMap.needsUpdate = true;
              if (mat.roughnessMap) mat.roughnessMap.needsUpdate = true;
              if (mat.emissiveMap) mat.emissiveMap.needsUpdate = true;
            }
          }
          if (obj.geometry?.attributes?.position) obj.geometry.attributes.position.needsUpdate = true;
        });
      } catch (e) {
        console.error('[ThreeRenderer] Error rebuilding after context restore:', e);
      }
    });

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
      // Aktualizuj skalę gwiazd tła (jak Three.js PointsMaterial)
      if (this._starScaleUniform) this._starScaleUniform.value = nH * 0.5;
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

    // ── Labele kolonii nad planetami ────────────────────────
    this._colonyLabels = new Map(); // planetId → { sprite }
    this._colonyLabelCounter = 88;  // pierwsze sprawdzenie po ~2 klatkach

    // ── Gwiazda ───────────────────────────────────────────────
    this._star      = null;
    this._starGroup = null;
    this._starLight = null;
    this._starCoronaUniform  = null;  // referencja do uTime korony
    this._starTwinkleUniform = null;  // referencja do uTime migotania gwiazd tła
    this._starPromCount      = 0;     // liczba protuberancji

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
    // 6000 gwiazd tła (sfera r=300-1000) z migotaniem (twinkle)
    const N   = 6000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);

    // Atrybuty migotania per gwiazda
    const phase      = new Float32Array(N);
    const speed      = new Float32Array(N);
    const brightness = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const r     = 300 + Math.random() * 700;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pos[i*3  ]  = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1]  = r * Math.sin(phi) * Math.sin(theta);
      pos[i*3+2]  = r * Math.cos(phi);

      // Kolory gwiazd tła — dominujące teal + rzadkie kolorowe (jak w rzeczywistości)
      const temp = Math.random();
      if (temp < 0.03) {
        // Czerwone karły (~3%) — ciepły czerwony
        col[i*3]=0.95; col[i*3+1]=0.45; col[i*3+2]=0.35;
      } else if (temp < 0.06) {
        // Diamentowe/białe (~3%) — jasny czysto-biały z lekkim ciepłem
        col[i*3]=1.0; col[i*3+1]=0.98; col[i*3+2]=0.95;
      } else if (temp < 0.09) {
        // Niebieskie gorące (~3%) — intensywny błękit
        col[i*3]=0.4; col[i*3+1]=0.55; col[i*3+2]=1.0;
      } else if (temp < 0.29) {
        // Chłodne błękitne (20%)
        col[i*3]=0.55; col[i*3+1]=0.75; col[i*3+2]=0.85;
      } else if (temp < 0.59) {
        // Teal #b0f0e0 (30%)
        col[i*3]=0.69; col[i*3+1]=0.94; col[i*3+2]=0.88;
      } else {
        // Jasny teal-biały (41%)
        col[i*3]=0.85; col[i*3+1]=0.95; col[i*3+2]=0.92;
      }

      phase[i]      = Math.random() * Math.PI * 2;
      speed[i]      = 0.15 + Math.random() * 0.4;
      // Kolorowe gwiazdy jaśniejsze — bardziej wyraziste na tle teal
      brightness[i] = temp < 0.09 ? (0.8 + Math.random() * 0.2) : (0.6 + Math.random() * 0.4);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',    new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',       new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aPhase',      new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSpeed',      new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:  { value: 0.0 },
        uSize:  { value: 0.8 },
        uScale: { value: window.innerHeight * 0.5 },
      },
      vertexShader: `
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aBrightness;
        varying vec3  vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uSize;
        uniform float uScale;

        void main() {
          vColor = color;

          // Migotanie: sin z indywidualną fazą i prędkością
          float wave = sin(uTime * aSpeed + aPhase);
          float twinkle = wave * 0.15;
          vAlpha = clamp(aBrightness + twinkle, 0.15, 1.0);

          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          // Modulacja rozmiaru — widoczna przy statycznej kamerze
          float sizeMod = 1.0 + wave * 0.25;
          gl_PointSize = uSize * sizeMod * (uScale / -mvPos.z);
          gl_Position  = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3  vColor;
        varying float vAlpha;

        void main() {
          // Okrągły punkt z miękką krawędzią
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = vAlpha * (1.0 - smoothstep(0.3, 0.5, d));
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
    });

    // Referencje do uniformów — aktualizowane w render loop i resize
    this._starTwinkleUniform = starMat.uniforms.uTime;
    this._starScaleUniform   = starMat.uniforms.uScale;

    this.scene.add(new THREE.Points(geo, starMat));

  }

  // ── Oświetlenie ──────────────────────────────────────────────
  _buildLights() {
    // Ambient — słabe wypełnienie (nocna strona delikatnie widoczna)
    this.scene.add(new THREE.AmbientLight(0x1a2832, 0.25));
    // PointLight od gwiazdy — decay=0: brak fizycznego tłumienia (r171 domyślnie decay=2
    // co przy intensity=2.0 i odl.=11j daje 2/121≈0.017 = czarny).
    // distance=0 = brak limitu zasięgu.
    this._starLight = new THREE.PointLight(0xffeedd, 1.5, 0, 0);
    this._starLight.position.set(0, 0, 0);
    this.scene.add(this._starLight);
  }

  // ── EventBus ─────────────────────────────────────────────────
  _setupEventBus() {
    // Helper — opakowuje handler w try/catch (zapobiega crashowi renderera)
    const safe = (fn) => (...args) => {
      try { fn(...args); } catch (e) { console.error('[ThreeRenderer] EventBus handler error:', e); }
    };

    EventBus.on('physics:updated', safe(({ planets, star, moons = [] }) => {
      this._syncPlanetMeshes(planets, moons);
      if (star) this._syncStarPosition(star);
    }));

    EventBus.on('body:collision', safe(({ winner, loser, type }) => {
      if (type === 'absorb' || type === 'eject') {
        if (loser) this._removePlanetMesh(loser.id);
      }
      if (winner) this._updatePlanetMesh(winner);
      this._rebuildAllOrbits();
    }));

    EventBus.on('accretion:newPlanet', safe((planet) => {
      this.addPlanetMesh(planet);
      this._rebuildAllOrbits();
    }));

    EventBus.on('life:updated', safe(({ planet }) => {
      this._updateLifeGlow(planet);
      this._rebuildAllOrbits();
    }));

    EventBus.on('disk:updated', safe(({ planetesimals }) => {
      this._updateDiskPoints(planetesimals);
    }));

    EventBus.on('player:planetUpdated', safe(({ planet }) => {
      this._updatePlanetMesh(planet);
      this._rebuildAllOrbits();
    }));

    EventBus.on('entity:removed', safe(({ entity }) => {
      this._removePlanetMesh(entity.id);
      this._removePlanetoidMesh(entity.id);
    }));

    EventBus.on('orbits:stabilityChanged', safe(() => {
      this._rebuildAllOrbits();
    }));

    // Gracz przejmuje planetę → zmień zieloną kropkę na żółtą + odśwież orbity
    EventBus.on('planet:colonize', safe(({ planet }) => {
      this._updateLifeGlow(planet);
      this._rebuildAllOrbits();
    }));

    EventBus.on('planet:ejected', safe(({ planet }) => {
      this._removePlanetMesh(planet.id);
    }));

    // ── Vessel sprites ──────────────────────────────────────────
    EventBus.on('vessel:launched', safe(({ vessel }) => {
      this._addVesselSprite(vessel);
    }));
    EventBus.on('vessel:returning', safe(({ vessel }) => {
      // Przebuduj sprite + linię trasy aby celowała w punkt powrotu
      if (this._vessels.has(vessel.id)) {
        this._removeVesselSprite(vessel.id);
      }
      this._addVesselSprite(vessel);
    }));
    EventBus.on('vessel:docked', safe(({ vessel }) => {
      this._removeVesselSprite(vessel.id);
    }));
    EventBus.on('vessel:positionUpdate', safe(({ vessels }) => {
      this._syncVesselPositions(vessels);
    }));

    // ── Śledzenie kamery po kliknięciu ciała ─────────────────
    EventBus.on('body:selected', safe(({ entity }) => {
      this._focusEntityId = entity.id;
      // Księżyce — pozwól na głębszy zoom (r=0.015–0.04, potrzeba bliskiej kamery)
      if (this._cameraController) {
        this._cameraController.setMinDist(entity.type === 'moon' ? 0.15 : 0.3);
      }
      this._updateCameraFocus();
      // Pokaż orbitę planetoidy po kliknięciu
      this._showPlanetoidOrbit(entity.id, 0.35);
      // Pokaż orbitę księżyca po kliknięciu (ukryta domyślnie)
      this._hideAllMoonOrbits();
      if (entity.type === 'moon') this._showMoonOrbit(entity.id);
      // Odśwież orbitę planety gracza (żółty kolor)
      this._rebuildAllOrbits();
    }));

    EventBus.on('body:deselected', safe(() => {
      this._focusEntityId = null;
      // Przywróć domyślny min zoom
      if (this._cameraController) {
        this._cameraController.setMinDist(0.3);
        const sx = this._starGroup ? this._starGroup.position.x : 0;
        const sz = this._starGroup ? this._starGroup.position.z : 0;
        this._cameraController.focusOn(sx, sz);
      }
      // Ukryj orbity planetoidów i księżyców
      this._hideAllPlanetoidOrbits();
      this._hideAllMoonOrbits();
      this._rebuildAllOrbits();
    }));

    // Centruj kamerę na statku (kliknięcie w liście floty / Outliner)
    EventBus.on('vessel:focus', safe(({ vesselId }) => {
      if (!this._cameraController) return;
      const entry = this._vessels.get(vesselId);
      if (entry) {
        // Statek w locie/orbicie — centruj na sprite
        const pos = entry.sprite.position;
        this._focusEntityId = null;
        this._cameraController.focusOn(pos.x, pos.z);
      } else {
        // Statek zadokowany — centruj na planecie hangaru + zaznacz ją
        const vessel = window.KOSMOS?.vesselManager?.getVessel(vesselId);
        const dockedAt = vessel?.position?.dockedAt;
        if (dockedAt) {
          const pEntry = this._planets.get(dockedAt);
          const mEntry = this._moons.get(dockedAt);
          const entity = pEntry ? this._entityByUUID.get(pEntry.mesh.uuid)
                                : mEntry ? this._entityByUUID.get(mEntry.mesh.uuid) : null;
          const pos = pEntry?.group?.position ?? mEntry?.mesh?.position;
          if (pos) {
            this._focusEntityId = dockedAt;
            this._cameraController.focusOn(pos.x, pos.z);
            // Zaznacz ciało — feedback wizualny (orbita, glow)
            if (entity) EventBus.emit('body:selected', { entity });
          }
        }
      }
    }));

    // Hover na planetoidzie → pokaż orbitę jaśniej
    EventBus.on('planet:hover', safe(({ entityId }) => {
      // Przywróć domyślną widoczność orbit planetoidów (nie zaznaczonych)
      this._planetoidOrbits.forEach((line, id) => {
        if (id !== this._focusEntityId) {
          line.material.opacity = 0.12;
          line.visible = true;
        }
      });
      if (entityId) this._showPlanetoidOrbit(entityId, 0.20);
    }));
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

  // ── Przełączanie układu gwiezdnego (dispose + reinit) ──────────────────
  // Wywoływane przez StarSystemManager.switchActiveSystem()
  switchSystem(star, planets, planetesimals, moons = []) {
    this._disposeAllMeshes();
    this.initSystem(star, planets, planetesimals, moons);
  }

  // Usuń wszystkie meshe z bieżącej sceny (planety, księżyce, gwiazda, orbity, itp.)
  _disposeAllMeshes() {
    // Planety
    for (const [id, entry] of this._planets) {
      if (entry.group) {
        entry.group.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
        this.scene.remove(entry.group);
      }
    }
    this._planets.clear();

    // Orbity planet
    for (const [id, line] of this._orbits) {
      line.geometry.dispose();
      line.material.dispose();
      this.scene.remove(line);
    }
    this._orbits.clear();

    // Księżyce
    for (const [id, entry] of this._moons) {
      if (entry.mesh) {
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        this.scene.remove(entry.mesh);
      }
      if (entry.ring) {
        entry.ring.geometry?.dispose();
        entry.ring.material?.dispose();
      }
    }
    this._moons.clear();

    // Planetoidy
    for (const [id, entry] of this._planetoids) {
      if (entry.mesh) {
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        this.scene.remove(entry.mesh);
      }
    }
    this._planetoids.clear();

    for (const [id, line] of this._planetoidOrbits) {
      line.geometry.dispose();
      line.material.dispose();
      this.scene.remove(line);
    }
    this._planetoidOrbits.clear();

    // Life glows
    for (const [id, sprite] of this._lifeGlows) {
      sprite.material?.dispose();
    }
    this._lifeGlows.clear();

    // Colony labels
    for (const [id, entry] of this._colonyLabels) {
      if (entry.sprite) {
        entry.sprite.material?.map?.dispose();
        entry.sprite.material?.dispose();
        this.scene.remove(entry.sprite);
      }
    }
    this._colonyLabels.clear();

    // Vessels
    for (const [id, entry] of this._vessels) {
      if (entry.sprite) {
        entry.sprite.material?.map?.dispose();
        entry.sprite.material?.dispose();
        this.scene.remove(entry.sprite);
      }
      if (entry.routeLine) {
        entry.routeLine.geometry?.dispose();
        entry.routeLine.material?.dispose();
        this.scene.remove(entry.routeLine);
      }
    }
    this._vessels.clear();

    // Gwiazda
    if (this._starGroup) {
      this._starGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this.scene.remove(this._starGroup);
      this._starGroup = null;
    }

    // HZ ring
    if (this._hzRing) {
      this._hzRing.geometry?.dispose();
      this._hzRing.material?.dispose();
      this.scene.remove(this._hzRing);
      this._hzRing = null;
    }

    // Dysk planetezymali
    if (this._diskPoints) {
      this._diskPoints.geometry?.dispose();
      this._diskPoints.material?.dispose();
      this.scene.remove(this._diskPoints);
      this._diskPoints = null;
    }

    // Małe ciała (asteroidy, komety)
    if (this._smallBodyPoints) {
      this._smallBodyPoints.geometry?.dispose();
      this._smallBodyPoints.material?.dispose();
      this.scene.remove(this._smallBodyPoints);
      this._smallBodyPoints = null;
    }

    // Reset
    this._entityByUUID.clear();
    this._clickable = [];
    this._focusEntityId = null;
    this._star = null;
  }

  // ── Gwiazda (kolorowy rdzeń + białe centrum + kolorowe promieniowanie) ──
  renderStar(star) {
    this._star = star;
    const r     = 1.6;   // stały promień 3D
    const color = new THREE.Color(star.visual.color);
    const glow  = new THREE.Color(star.visual.glowColor ?? star.visual.color);

    // Typ spektralny → konfiguracja per-typ
    const spec   = star.spectralType || 'G';
    const stData = STAR_TYPES[spec] || STAR_TYPES.G;
    const cfg    = stData.corona;
    const brightness = cfg.brightness || 3.0;
    const whitePower = cfg.whitePower || 1.0;
    const glowScale  = cfg.glowScale  || 7.0;
    const glowOpacity = cfg.glowOpacity || 1.0;

    const group = new THREE.Group();
    group.position.set(S(star.x), 0, S(star.y));

    // Kolory RGB do canvas gradientów
    const cr = Math.round(color.r * 255);
    const cg = Math.round(color.g * 255);
    const cb = Math.round(color.b * 255);
    const glR = Math.round(glow.r * 255);
    const glG = Math.round(glow.g * 255);
    const glB = Math.round(glow.b * 255);

    // ── [0] Rdzeń — shader: tekstura wypalona do jasności, kolor na krawędziach ──
    const texType = stData.texType || `star_${spec}`;
    const variant = (hashCode(star.id || 'star') % TEXTURE_VARIANTS) + 1;
    const texMaps = loadStarTextures(texType, variant);

    const coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uDiffuse:    { value: texMaps.diffuse },
        uEmission:   { value: texMaps.emission },
        uColor:      { value: color },
        uBrightness: { value: brightness },
        uWhitePower: { value: whitePower },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uDiffuse;
        uniform sampler2D uEmission;
        uniform vec3  uColor;
        uniform float uBrightness;
        uniform float uWhitePower;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;

        void main() {
          vec3 emTex = texture2D(uEmission, vUv).rgb;

          // Limb darkening — krawędzie ciemniejsze (fizycznie poprawne)
          float NdotV = max(dot(vNormal, vViewDir), 0.0);
          float limb = pow(NdotV, 0.5);

          // Bazowy kolor: emission texture × kolor gwiazdy × jasność
          vec3 base = emTex * uColor * uBrightness * limb;

          // Białe prześwietlenie — uWhitePower kontroluje zasięg
          // M/K (ciemne) → whitePower 0.8-0.9 = szerokie białe centrum
          // F (jasne)   → whitePower 1.5 = wąskie białe centrum
          float whiteAmount = pow(NdotV, uWhitePower) * 1.0;
          base = mix(base, vec3(1.0), whiteAmount);

          // Gwarantuj minimalną jasność (gwiazda nigdy nie jest ciemna)
          base = max(base, uColor * 0.3);

          // Reinhard tone mapping — miękki clamp, zachowuje kolory
          base = base / (base + vec3(0.35));
          base *= 1.7;

          gl_FragColor = vec4(base, 1.0);
        }
      `,
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(r, 64, 64), coreMat));

    // ── Helper: canvas sprite z radial gradient ──
    const _glowSprite = (size, stops, opacity, scale) => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const h = size / 2;
      const g = ctx.createRadialGradient(h, h, 0, h, h, h);
      for (const [pos, col] of stops) g.addColorStop(pos, col);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      }));
      sp.scale.setScalar(scale);
      return sp;
    };

    // ── [1] Glow wewnętrzny — silny biały bloom zakrywający rdzeń ──
    group.add(_glowSprite(512, [
      [0.0,  `rgba(255,255,255,1.0)`],
      [0.06, `rgba(255,255,255,0.9)`],
      [0.12, `rgba(255,255,255,0.6)`],
      [0.18, `rgba(${cr},${cg},${cb},0.35)`],
      [0.28, `rgba(${cr},${cg},${cb},0.15)`],
      [0.42, `rgba(${glR},${glG},${glB},0.05)`],
      [0.65, `rgba(${glR},${glG},${glB},0.01)`],
      [1.0,  `rgba(${glR},${glG},${glB},0.0)`],
    ], 1.0, r * 13.5));

    // ── [2] Glow średni — kolorowa poświata ──
    group.add(_glowSprite(512, [
      [0.0,  `rgba(${cr},${cg},${cb},0.50)`],
      [0.06, `rgba(${cr},${cg},${cb},0.30)`],
      [0.14, `rgba(${glR},${glG},${glB},0.16)`],
      [0.25, `rgba(${glR},${glG},${glB},0.08)`],
      [0.40, `rgba(${glR},${glG},${glB},0.03)`],
      [0.60, `rgba(${glR},${glG},${glB},0.008)`],
      [0.85, `rgba(${glR},${glG},${glB},0.001)`],
      [1.0,  `rgba(${glR},${glG},${glB},0.0)`],
    ], glowOpacity, r * glowScale * 3.0));

    // ── [3] Glow zewnętrzny — duży zasięg, miękkie promieniowanie ──
    group.add(_glowSprite(512, [
      [0.0,  `rgba(${glR},${glG},${glB},0.14)`],
      [0.06, `rgba(${glR},${glG},${glB},0.08)`],
      [0.15, `rgba(${glR},${glG},${glB},0.035)`],
      [0.30, `rgba(${glR},${glG},${glB},0.012)`],
      [0.50, `rgba(${glR},${glG},${glB},0.003)`],
      [0.75, `rgba(${glR},${glG},${glB},0.0005)`],
      [1.0,  `rgba(${glR},${glG},${glB},0.0)`],
    ], glowOpacity * 0.8, r * glowScale * 6.0));

    this.scene.add(group);
    this._starGroup = group;
    this._starCoronaUniform = null;
    this._starPromCount = 0;

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
  // Gwiazda = 1.6 → planety ZAWSZE mniejsze (gas max 0.60 = 3/8 gwiazdy)
  // Hierarchia: gas(Jowisz) > gas_cold(Neptun) > ice > rocky > hot_rocky
  static _planetRadius(planet) {
    const mass = planet.physics?.mass ?? 1;
    const type = planet.planetType;
    if (type === 'gas') {
      // Rozróżnienie Jowisz/Saturn (duże) vs Neptun/Uran (małe) wg masy
      if (mass < 50) {
        // Neptun/Uran-like: 10–50 M⊕ → promień 0.20–0.35
        return Math.max(0.20, Math.min(0.35, 0.15 + Math.log10(Math.max(1, mass)) * 0.11));
      }
      // Jowisz/Saturn-like: 50–330 M⊕ → promień 0.35–0.60
      return Math.max(0.35, Math.min(0.60, 0.20 + Math.log10(Math.max(1, mass)) * 0.16));
    }
    if (type === 'ice') {
      // 2–20 M⊕ → promień 0.14–0.24
      return Math.max(0.14, Math.min(0.24, 0.10 + Math.log10(Math.max(1, mass)) * 0.10));
    }
    if (type === 'hot_rocky') {
      // 0.1–2 M⊕ → promień 0.04–0.10
      return Math.max(0.04, Math.min(0.10, 0.04 + mass * 0.025));
    }
    // rocky: 0.3–6 M⊕ → promień 0.06–0.14
    return Math.max(0.06, Math.min(0.14, 0.05 + mass * 0.012));
  }

  // ── Pierścienie planet (gas 60%, ice 40%) ──────────────────────────────
  // Parametry (innerMult, outerMult, tilt, kolory, szczeliny) z deterministycznego hasha
  _addRings(group, planet, r, seed) {
    const type = planet.planetType;
    if (type !== 'gas' && type !== 'ice') return;

    // Szansa na pierścienie: gas 60%, ice 40% (deterministycznie z seed)
    const chance = type === 'gas' ? 60 : 40;
    if ((seed % 100) >= chance) return;

    // Parametry geometrii z hasha
    const h2 = hashCode(String(seed * 7 + 13));
    const innerMult = 1.20 + (h2 % 30) / 100;        // 1.20–1.50
    const outerMult = 1.80 + (h2 % 50) / 100;        // 1.80–2.30
    const tiltDeg   = 10 + (h2 % 20);                 // 10°–30°
    const gapCount  = 3 + (h2 % 3);                   // 3–5 szczelin

    // Paleta kolorów per pod-typ
    const texType = resolveTextureType(planet);
    let ringR, ringG, ringB;
    if (texType === 'gas_warm') {
      // Ciepłe: brązy, beże, złoto (Saturn-like)
      ringR = 200 + (h2 % 40); ringG = 170 + (h2 % 40); ringB = 120 + (h2 % 30);
    } else if (texType === 'gas_cold') {
      // Lodowe: blado-niebieskie, białawe (Uran/Neptun)
      ringR = 160 + (h2 % 40); ringG = 190 + (h2 % 40); ringB = 220 + (h2 % 30);
    } else if (texType === 'gas_giant') {
      // Neutralne: jasne brązy, szarości (Jowisz)
      ringR = 190 + (h2 % 35); ringG = 185 + (h2 % 35); ringB = 165 + (h2 % 30);
    } else {
      // Ice — jasne lodowe
      ringR = 180 + (h2 % 40); ringG = 200 + (h2 % 40); ringB = 230 + (h2 % 25);
    }

    // Canvas tekstura 512×1 z przezroczystymi szczelinami
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 512; ringCanvas.height = 1;
    const rc = ringCanvas.getContext('2d');

    // Generuj pozycje szczelin (deterministyczne)
    const gaps = [];
    for (let g = 0; g < gapCount; g++) {
      const gapCenter = 60 + hashCode(String(seed + g * 31)) % 380;  // 60–440
      const gapWidth  = 4 + hashCode(String(seed + g * 17)) % 12;    // 4–16 px
      gaps.push({ center: gapCenter, width: gapWidth });
    }

    for (let x = 0; x < 512; x++) {
      // Bazowa przezroczystość — łuk sinusoidalny (gęstszy w środku)
      const t = x / 512;
      let alpha = Math.sin(t * Math.PI) * 0.50;

      // Drobna modulacja gęstości (substruktura pierścieni)
      const fineNoise = (hashCode(String(x * 3 + seed)) % 100) / 200; // 0–0.5
      alpha *= (0.5 + fineNoise);

      // Szczeliny — zeruj alpha
      for (const gap of gaps) {
        if (Math.abs(x - gap.center) < gap.width / 2) { alpha = 0; break; }
      }

      // Lekka wariacja koloru wzdłuż promienia
      const cVar = (hashCode(String(x + seed * 3)) % 20) - 10; // ±10
      const cr = Math.min(255, Math.max(0, ringR + cVar));
      const cg = Math.min(255, Math.max(0, ringG + cVar));
      const cb = Math.min(255, Math.max(0, ringB + cVar));

      rc.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
      rc.fillRect(x, 0, 1, 1);
    }

    const rTex = new THREE.CanvasTexture(ringCanvas);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * innerMult, r * outerMult, 64),
      new THREE.MeshStandardMaterial({
        map: rTex, transparent: true,
        side: THREE.DoubleSide, depthWrite: false,
        metalness: 0, roughness: 0.8,
      })
    );
    ring.rotation.x = -Math.PI * (tiltDeg / 90);  // konwersja: 10°→-0.35, 30°→-1.05 rad
    group.add(ring);
  }

  // ── RTT Bake — renderuj proceduralny diffuse z PlanetShader na teksturę ────
  // Generuje equirectangular diffuse texture identyczną z globusem (bez oświetlenia)
  _bakePlanetTexture(planet) {
    const BAKE_W = 1024, BAKE_H = 512;

    // 1. Generuj regiony (deterministyczne z planet.id)
    const isHome = planet.id === window.KOSMOS?.homePlanet?.id;
    const regions = RegionGenerator.generate(planet, isHome);

    // 2. Generuj BiomeMap (DataTexture)
    const biomeMap = BiomeMapGenerator.generate(regions, planet);
    if (!biomeMap) return null;

    // 3. Bake material — shader z uniformami (bez oświetlenia)
    const uniforms = PlanetShader.createBakeUniforms(planet, biomeMap);
    const bakeMat = new THREE.ShaderMaterial({
      vertexShader:   PlanetShader.bakeVertexShader,
      fragmentShader: PlanetShader.bakeFragmentShader,
      uniforms,
    });

    // 4. Fullscreen quad + ortho camera
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
    const cam  = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const bakeScene = new THREE.Scene();
    bakeScene.add(quad);

    // 5. Render do RenderTarget
    const rt = new THREE.WebGLRenderTarget(BAKE_W, BAKE_H, {
      format: THREE.RGBAFormat,
      type:   THREE.UnsignedByteType,
    });
    this.renderer.setRenderTarget(rt);
    this.renderer.render(bakeScene, cam);
    this.renderer.setRenderTarget(null);

    // 6. Odczytaj piksele → CanvasTexture (WebGL readPixels daje Y-flipped dane)
    const pixels = new Uint8Array(BAKE_W * BAKE_H * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, BAKE_W, BAKE_H, pixels);

    const canvas = document.createElement('canvas');
    canvas.width = BAKE_W;
    canvas.height = BAKE_H;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(BAKE_W, BAKE_H);

    for (let y = 0; y < BAKE_H; y++) {
      const srcRow = (BAKE_H - 1 - y) * BAKE_W * 4;
      const dstRow = y * BAKE_W * 4;
      imgData.data.set(pixels.subarray(srcRow, srcRow + BAKE_W * 4), dstRow);
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    // 7. Cleanup tymczasowych zasobów GPU
    rt.dispose();
    bakeMat.dispose();
    quad.geometry.dispose();
    biomeMap.dispose();

    return tex;
  }

  // ── Planeta mesh ─────────────────────────────────────────────
  addPlanetMesh(planet) {
    if (this._planets.has(planet.id)) return;

    const seed = hashCode(String(planet.id));
    const r    = ThreeRenderer._planetRadius(planet);

    const group = new THREE.Group();
    group.position.set(S(planet.x), 0, S(planet.y));

    // Materiał: RTT bake — proceduralny diffuse
    // Gas giganty: GasGiantShader (pasy + burze), rocky/ice: PlanetShader (biomy)
    const isGas = planet.planetType === 'gas';
    let material;
    if (isGas) {
      // RTT bake — proceduralny gas giant (diffuse + normal + roughness)
      const baked = GasGiantShader.bakeGasGiantTextures(planet, this.renderer);
      if (baked) {
        material = new THREE.MeshStandardMaterial({
          map:          baked.diffuse,
          normalMap:    baked.normal,
          roughnessMap: baked.roughness,
          metalness:    0.0,
        });
      }
    } else {
      // RTT bake — proceduralny diffuse z BiomeMap + PlanetShader
      const bakedDiffuse = this._bakePlanetTexture(planet);
      if (bakedDiffuse) {
        // Zachowaj normal+roughness z PBR jeśli dostępne
        const texType = resolveTextureType(planet);
        let normalMap = null, roughnessMap = null;
        if (texType) {
          const variant = (seed % TEXTURE_VARIANTS) + 1;
          const maps    = loadPlanetTextures(texType, variant);
          normalMap     = maps.normal;
          roughnessMap  = maps.roughness;
        }
        material = new THREE.MeshStandardMaterial({
          map:          bakedDiffuse,
          normalMap,
          roughnessMap,
          metalness:    0.05,
        });
      }
    }
    // Fallback: bake failed → PBR PNG
    if (!material) {
      const texType = resolveTextureType(planet);
      if (texType) {
        const variant = (seed % TEXTURE_VARIANTS) + 1;
        const maps    = loadPlanetTextures(texType, variant);
        material = new THREE.MeshStandardMaterial({
          map:          maps.diffuse,
          normalMap:    maps.normal,
          roughnessMap: maps.roughness,
          metalness:    isGas ? 0.0 : 0.05,
        });
      } else {
        material = new THREE.MeshStandardMaterial({
          color: planet.visual?.color ?? 0x888888,
          metalness: 0.05, roughness: 0.7,
        });
      }
    }

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 48, 48),
      material
    );
    mesh.rotation.z = 0.1 + (seed % 10) * 0.04;
    group.add(mesh);

    // Warstwa chmur — tylko rocky z atmosferą (nie gas)
    if (!isGas && planet.atmosphere && planet.atmosphere !== 'none' && planet.atmosphere !== 'brak') {
      const cloudMesh = this._createSystemCloudMesh(r);
      if (cloudMesh) {
        cloudMesh.userData.isCloud = true;
        group.add(cloudMesh);
      }
    }

    // Atmosfera Rayleigh — pełny shader zarówno dla rocky jak i gas
    // Gas giganty: grubsza atmosfera, kolor per pod-typ (warm/cold/giant)
    const hasAtmo = planet.atmosphere && planet.atmosphere !== 'none' && planet.atmosphere !== 'brak';
    if (hasAtmo || isGas) {
      // Kolor atmosfery: gas giganty mają specyficzny kolor per pod-typ
      let atmoColor;
      let atmoScale;    // grubość sfery atmosfery (mnożnik promienia)
      let atmoStrength; // mnożnik alpha
      if (isGas) {
        const texType = resolveTextureType(planet);
        if (texType === 'gas_warm') {
          atmoColor = new THREE.Color(0.8, 0.5, 0.2);   // pomarańczowo-złoty
        } else if (texType === 'gas_cold') {
          atmoColor = new THREE.Color(0.2, 0.4, 0.9);   // niebieski/cyjanowy (Neptun/Uran)
        } else {
          atmoColor = new THREE.Color(0.6, 0.6, 0.5);   // jasno-żółtawy (Saturn)
        }
        atmoScale    = 1.08;  // grubsza atmosfera niż rocky
        atmoStrength = 0.70;  // intensywniejsza
      } else {
        atmoColor    = new THREE.Color(planet.visual.glowColor ?? 0x4488ff);
        atmoScale    = 1.15;
        atmoStrength = 0.55;
      }

      const atmoMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor:     { value: atmoColor },
          uLightDir:  { value: new THREE.Vector3(0, 0, 0) },
          uStrength:  { value: atmoStrength },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPos;
          varying float vFresnel;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            vViewDir = normalize(-mvPos.xyz);
            float NdotV = dot(vNormal, vViewDir);
            float rim = 1.0 - abs(NdotV);
            vFresnel = rim * rim * rim;
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform vec3 uLightDir;
          uniform float uStrength;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPos;
          varying float vFresnel;
          void main() {
            float fresnel = vFresnel;

            // Kąt słońca w tym punkcie atmosfery
            vec3 toLight = normalize(uLightDir - vWorldPos);
            float sunAngle = dot(vWorldNormal, toLight);

            // Dzień — jaśniejszy kolor od strony słońca
            float dayAtm = max(sunAngle, 0.0);
            vec3 dayAtmColor = mix(uColor, uColor * vec3(1.2, 1.1, 0.9), dayAtm * 0.6);

            // Terminator — pomarańczowy pas
            float atmTerminator = exp(-abs(sunAngle) / 0.18);
            atmTerminator = pow(atmTerminator, 1.5);
            vec3 terminatorColor = vec3(1.0, 0.45, 0.15);

            // Noc — ciemna atmosfera
            vec3 nightAtmColor = uColor * vec3(0.15, 0.18, 0.35);

            // Blend
            vec3 atmColor = mix(dayAtmColor, nightAtmColor, smoothstep(-0.1, 0.3, -sunAngle));
            atmColor = mix(atmColor, terminatorColor, atmTerminator * 0.65);

            // Glow na krawędzi
            float glow = fresnel * smoothstep(1.0, 0.6, fresnel);
            float alpha = glow * uStrength;

            gl_FragColor = vec4(atmColor, alpha);
          }
        `,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const atmoMesh = new THREE.Mesh(
        new THREE.SphereGeometry(r * atmoScale, 32, 32), atmoMat
      );
      atmoMesh.userData.isAtmosphere = true;
      group.add(atmoMesh);
    }

    // Pierścienie — gas (60%) i ice (40%), warianty per pod-typ
    this._addRings(group, planet, r, seed);

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
    mesh.material.dispose();
    const isGas = planet.planetType === 'gas';
    if (isGas) {
      // Gas giant — procedural RTT bake
      const baked = GasGiantShader.bakeGasGiantTextures(planet, this.renderer);
      if (baked) {
        mesh.material = new THREE.MeshStandardMaterial({
          map: baked.diffuse, normalMap: baked.normal,
          roughnessMap: baked.roughness, metalness: 0.0,
        });
      } else {
        mesh.material = new THREE.MeshStandardMaterial({
          color: planet.visual?.color ?? 0x888888, metalness: 0.0, roughness: 0.6,
        });
      }
    } else {
      const texType = resolveTextureType(planet);
      if (texType) {
        const variant = (seed % TEXTURE_VARIANTS) + 1;
        const maps    = loadPlanetTextures(texType, variant);
        mesh.material = new THREE.MeshStandardMaterial({
          map: maps.diffuse, normalMap: maps.normal,
          roughnessMap: maps.roughness, metalness: 0.05,
        });
      } else {
        mesh.material = new THREE.MeshStandardMaterial({
          color: planet.visual?.color ?? 0x888888,
          metalness: 0.05, roughness: 0.7,
        });
      }
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

    // Helper: focusOn z guardem NaN
    const safeFocus = (x, z) => {
      if (!isNaN(x) && !isNaN(z)) this._cameraController.focusOn(x, z);
    };

    // Sprawdź planety
    const pEntry = this._planets.get(this._focusEntityId);
    if (pEntry) { safeFocus(pEntry.group.position.x, pEntry.group.position.z); return; }
    // Sprawdź księżyce
    const mEntry = this._moons.get(this._focusEntityId);
    if (mEntry) { safeFocus(mEntry.mesh.position.x, mEntry.mesh.position.z); return; }
    // Sprawdź planetoidy
    const pdEntry = this._planetoids.get(this._focusEntityId);
    if (pdEntry) { safeFocus(pdEntry.mesh.position.x, pdEntry.mesh.position.z); }
  }

  // ── Synchronizacja pozycji planet i księżyców ─────────────────
  // ── Sfera chmur dla mapy układu — triplanar noise, animowane dryfowanie ─────
  _createSystemCloudMesh(planetRadius) {
    const cloudVert = `
      varying vec3 vSpherePos;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vSpherePos = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `;
    const cloudFrag = `
      uniform float uTime;
      uniform vec3  uLightDir;
      varying vec3  vSpherePos;
      varying vec3  vNormal;
      varying vec3  vViewDir;
      varying vec3  vWorldNormal;
      varying vec3  vWorldPos;

      vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
      vec2 mod289v2(vec2 x){return x-floor(x*(1./289.))*289.;}
      vec3 permute3(vec3 x){return mod289v3(((x*34.)+1.)*x);}
      float snoise(vec2 v){
        const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
        vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
        vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
        vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289v2(i);
        vec3 p=permute3(permute3(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
        vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
        m=m*m;m=m*m;
        vec3 x2=2.*fract(p*C.www)-1.;vec3 h=abs(x2)-0.5;
        vec3 ox=floor(x2+0.5);vec3 a0=x2-ox;
        m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
        vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
        return 130.*dot(m,g);
      }
      float sphereNoise(vec3 p,float s){
        vec3 w=abs(p);w=w/(w.x+w.y+w.z+0.0001);
        return snoise(p.yz*s)*w.x+snoise(p.xz*s)*w.y+snoise(p.xy*s)*w.z;
      }
      void main(){
        vec3 sp=vSpherePos+vec3(uTime*0.012,0.0,uTime*0.004);
        float n=sphereNoise(sp,3.0)*0.500+sphereNoise(sp,6.2)*0.250
               +sphereNoise(sp,12.5)*0.125+sphereNoise(sp,25.0)*0.063;
        n=n*0.5+0.5;
        float cloudMask=smoothstep(0.50,0.72,n);
        vec3 toStar=normalize(uLightDir-vWorldPos);
        float rawDiff=dot(vWorldNormal,toStar);
        float diff=max(rawDiff,0.0);
        float lit=0.4+0.6*diff;
        vec3 cloudColor=vec3(0.95,0.97,1.00)*lit;
        float nightFade=smoothstep(-0.1,0.15,rawDiff);
        float fresnel=1.0-max(dot(vNormal,vViewDir),0.0);
        float edgeFade=1.0-pow(fresnel,2.5)*0.6;
        float alpha=cloudMask*0.82*edgeFade*(0.06+0.94*nightFade);
        gl_FragColor=vec4(cloudColor,alpha);
      }
    `;
    const mat = new THREE.ShaderMaterial({
      vertexShader: cloudVert, fragmentShader: cloudFrag,
      uniforms: {
        uTime:     { value: 0.0 },
        uLightDir: { value: new THREE.Vector3(0, 0, 0) },
      },
      transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.02, 32, 32), mat);
  }

  _syncPlanetMeshes(planets, moons = []) {
    const homePlanetId = window.KOSMOS?.homePlanet?.id;

    // Pozycja gwiazdy w world space (dla atmosfery oświetlonej)
    const starWPos = this._starGroup
      ? this._starGroup.position : new THREE.Vector3(0, 0, 0);

    planets.forEach(planet => {
      const entry = this._planets.get(planet.id);
      if (!entry) return;
      // Guard NaN z fizyki — zapobiega propagacji do kamery → biały ekran
      if (isNaN(planet.x) || isNaN(planet.y)) return;
      entry.group.position.set(S(planet.x), 0, S(planet.y));
      entry.mesh.rotation.y += 0.003;


      // Aktualizuj kierunek światła w atmosferze i chmurach
      for (const child of entry.group.children) {
        if (!child.material?.uniforms) continue;
        if (child.userData.isAtmosphere) {
          child.material.uniforms.uLightDir.value.copy(starWPos);
        }
        if (child.userData.isCloud) {
          child.material.uniforms.uLightDir.value.copy(starWPos);
          child.material.uniforms.uTime.value += 0.016; // ~60fps krok
        }
      }

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
      if (isNaN(moon.x) || isNaN(moon.y)) return;
      entry.mesh.position.set(S(moon.x), 0, S(moon.y));
    });

    // Markery kolonii — pozycje (po aktualizacji planet i księżyców)
    if (this._colonyLabels.size > 0) this._updateColonyLabelPositions();

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

    // Odświeżanie labeli kolonii (co ~90 klatek ≈ 1.5s)
    this._colonyLabelCounter++;
    if (this._colonyLabelCounter >= 90) {
      this._colonyLabelCounter = 0;
      this._syncColonyLabels();
    }
  }

  // ── Markery kolonii nad planetami/księżycami ─────────────────
  _syncColonyLabels() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    const homePid = window.KOSMOS?.homePlanet?.id;
    const colonies = colMgr.getAllColonies?.() ?? [];

    // Zbierz aktywne colony IDs
    const activeIds = new Set();
    for (const col of colonies) activeIds.add(col.planetId ?? col.planet?.id);

    // Usuń markery dla ciał bez kolonii
    for (const [pid] of this._colonyLabels) {
      if (!activeIds.has(pid)) this._removeColonyLabel(pid);
    }

    // Dodaj/aktualizuj markery
    for (const col of colonies) {
      const pid = col.planetId ?? col.planet?.id;
      if (!pid) continue;

      // Szukaj ciała w planetach i księżycach
      const pEntry = this._planets.get(pid);
      const mEntry = this._moons.get(pid);
      if (!pEntry && !mEntry) continue;

      const isHome = pid === homePid;
      const isOutpost = col.isOutpost === true;
      const isMoon = !!mEntry;
      const labelType = isHome ? 'home' : isOutpost ? 'outpost' : 'colony';

      // Sprawdź czy marker już istnieje z tym samym typem
      const existing = this._colonyLabels.get(pid);
      if (existing && existing.sprite.userData._labelType === labelType) continue;

      // Usuń stary marker
      if (existing) this._removeColonyLabel(pid);

      // Stwórz nowy marker
      const name = (col.planet?.name ?? col.planetId ?? '').slice(0, 12);
      const sprite = this._createColonyMarker(name, isHome, isOutpost, isMoon);
      sprite.userData._labelType = labelType;
      sprite.userData._bodyId = pid;

      this.scene.add(sprite);
      this._clickable.push(sprite);
      if (col.planet) this._entityByUUID.set(sprite.uuid, col.planet);
      this._colonyLabels.set(pid, { sprite, isMoon });
    }
  }

  // Pozycje markerów — wywoływane co klatkę w _syncPlanetMeshes
  _updateColonyLabelPositions() {
    for (const [pid, entry] of this._colonyLabels) {
      let wx, wz;
      if (entry.isMoon) {
        const mE = this._moons.get(pid);
        if (!mE) continue;
        wx = mE.mesh.position.x; wz = mE.mesh.position.z;
      } else {
        const pE = this._planets.get(pid);
        if (!pE) continue;
        wx = pE.group.position.x; wz = pE.group.position.z;
      }
      entry.sprite.position.set(wx, entry.isMoon ? 0.4 : 1.0, wz);
    }
  }

  _removeColonyLabel(pid) {
    const entry = this._colonyLabels.get(pid);
    if (!entry) return;
    this.scene.remove(entry.sprite);
    const idx = this._clickable.indexOf(entry.sprite);
    if (idx !== -1) this._clickable.splice(idx, 1);
    this._entityByUUID.delete(entry.sprite.uuid);
    entry.sprite.material.map?.dispose();
    entry.sprite.material.dispose();
    this._colonyLabels.delete(pid);
  }

  /**
   * Marker kolonii — złoty/mint diament ze świecącą poświatą.
   * sizeAttenuation: true → skaluje się ze sceną, zawsze widoczny.
   */
  _createColonyMarker(name, isHome, isOutpost, isMoon) {
    const S = 128; // rozdzielczość canvas
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const c = canvas.getContext('2d');
    const cx = S / 2, cy = S / 2;

    // Kolory per status
    let fillColor, glowColor, glowRadius;
    if (isHome) {
      fillColor = '#ffcc44'; glowColor = 'rgba(255,200,50,'; glowRadius = 52;
    } else if (isOutpost) {
      fillColor = '#44ddaa'; glowColor = 'rgba(68,221,170,'; glowRadius = 40;
    } else {
      fillColor = '#00ee88'; glowColor = 'rgba(0,238,136,'; glowRadius = 46;
    }

    // ── Zewnętrzna poświata (radial gradient) ──
    const grd = c.createRadialGradient(cx, cy, 4, cx, cy, glowRadius);
    grd.addColorStop(0,   glowColor + '0.6)');
    grd.addColorStop(0.3, glowColor + '0.2)');
    grd.addColorStop(0.7, glowColor + '0.05)');
    grd.addColorStop(1,   glowColor + '0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, S, S);

    // ── Diament — romb 4 wierzchołki ──
    const dw = isHome ? 16 : isOutpost ? 10 : 13; // połowa szerokości
    const dh = isHome ? 22 : isOutpost ? 14 : 18; // połowa wysokości
    c.beginPath();
    c.moveTo(cx, cy - dh);       // góra
    c.lineTo(cx + dw, cy);       // prawo
    c.lineTo(cx, cy + dh);       // dół
    c.lineTo(cx - dw, cy);       // lewo
    c.closePath();

    // Gradient diamentu — jaśniejszy u góry (efekt blasku)
    const dGrd = c.createLinearGradient(cx, cy - dh, cx, cy + dh);
    dGrd.addColorStop(0,   '#ffffff');
    dGrd.addColorStop(0.3, fillColor);
    dGrd.addColorStop(1,   fillColor);
    c.fillStyle = dGrd;
    c.fill();

    // Cienki biały kontur
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.5;
    c.stroke();

    // Outpost: hollow (wytnij środek)
    if (isOutpost) {
      const iw = dw - 4, ih = dh - 5;
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.moveTo(cx, cy - ih);
      c.lineTo(cx + iw, cy);
      c.lineTo(cx, cy + ih);
      c.lineTo(cx - iw, cy);
      c.closePath();
      c.fill();
      c.globalCompositeOperation = 'source-over';
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.95,
      depthWrite: false, depthTest: false,
      sizeAttenuation: true,
    });
    const sprite = new THREE.Sprite(mat);
    // Skala 3D — duża, widoczna z daleka (porównaj: planeta rocky r≈0.08–0.15)
    const sz = isMoon ? 0.5 : (isHome ? 1.0 : 0.7);
    sprite.scale.set(sz, sz, 1);
    sprite.renderOrder = 10;
    sprite.center.set(0.5, -0.3); // kotwica pod spodem → diament nad planetą
    return sprite;
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
    const geo = new THREE.SphereGeometry(r, 24, 16);

    // PBR tekstury — re-use istniejących tekstur planet (rocky/ice/iron/volcanic)
    const texType = resolveTextureType(moon);
    let mat;
    if (texType) {
      const seed    = hashCode(moon.id || 'moon');
      const variant = (seed % TEXTURE_VARIANTS) + 1;
      const maps    = loadPlanetTextures(texType, variant);
      mat = new THREE.MeshStandardMaterial({
        map:          maps.diffuse,
        normalMap:    maps.normal,
        roughnessMap: maps.roughness,
        metalness:    0.02,
      });
    } else {
      // fallback — stary kolor
      mat = new THREE.MeshStandardMaterial({ color: moon.visual.color, roughness: 0.85, metalness: 0.02 });
    }
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
    grd.addColorStop(0, 'rgba(0,255,180,0.9)');
    grd.addColorStop(0.5, 'rgba(0,238,136,0.4)');
    grd.addColorStop(1,   'rgba(0,238,136,0)');
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
    grd.addColorStop(0, 'rgba(0,204,255,0.95)');
    grd.addColorStop(0.5, 'rgba(0,180,220,0.5)');
    grd.addColorStop(1,   'rgba(0,150,200,0)');
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
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    EntityManager.getByTypeInSystem('planet', sysId).forEach(p => this._buildOrbit(p));
  }

  _buildOrbit(planet) {
    const orb  = planet.orbital;
    const star = this._star;
    if (!orb || !star) return;
    // Guard NaN w parametrach orbitalnych — zapobiega geometrii z Infinity
    if (isNaN(orb.a) || isNaN(orb.e) || orb.a <= 0) return;

    const angle = orb.inclinationOffset ?? 0;
    const a     = S(orb.a * AU);
    const b     = a * Math.sqrt(1 - orb.e * orb.e);
    const c     = a * orb.e;
    const cx    = S(star.x) - c * Math.cos(angle);
    const cz    = S(star.y) - c * Math.sin(angle);

    let color = 0x003828;       // domyślna orbita — ciemny teal
    if (planet.lifeScore > 0)          color = 0x005540;   // życie — jaśniejszy teal
    // Orbita planety gracza — jasny teal (orbitColony)
    if (planet.id === window.KOSMOS?.homePlanet?.id) color = 0x007852;
    if (planet.orbitalStability < 0.5) color = 0x553322;   // niestabilna — ciemny czerwony
    if (planet.isSelected)             color = 0x00ccff;   // zaznaczona — info blue

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

  // Tworzy sfery mesh + orbit lines dla planetoidów aktywnego układu (orbity ukryte domyślnie)
  _initPlanetoids() {
    const activeSysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const planetoids = EntityManager.getByTypeInSystem('planetoid', activeSysId);
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

  // Synchronizuj pozycje meshów planetoidów z danymi fizyki (tylko aktywny układ)
  _syncPlanetoidPositions() {
    const activeSysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const planetoids = EntityManager.getByTypeInSystem('planetoid', activeSysId);
    planetoids.forEach(p => {
      const entry = this._planetoids.get(p.id);
      if (entry && !isNaN(p.x) && !isNaN(p.y)) {
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

    const rSysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    EntityManager.getByTypeInSystem('planetoid', rSysId).forEach(p => {
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
    const sbSysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const bodies = [
      ...EntityManager.getByTypeInSystem('asteroid', sbSysId),
      ...EntityManager.getByTypeInSystem('comet', sbSysId),
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
      const bx = isNaN(b.x) ? 0 : b.x;
      const by = isNaN(b.y) ? 0 : b.y;
      pos[i*3] = S(bx); pos[i*3+1] = 0; pos[i*3+2] = S(by);
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

      // Pomiń rendering gdy kontekst WebGL utracony
      if (this._contextLost) return;

      try {
        const t = this._clock.getElapsedTime();

        // Aktualizuj migotanie gwiazd tła
        if (this._starTwinkleUniform) this._starTwinkleUniform.value = t;

        // Animacja gwiazdy — [0]=rdzeń, [1]=innerGlow, [2]=midGlow, [3]=outerGlow
        if (this._starGroup) {
          const sg = this._starGroup;
          // Rdzeń — powolna rotacja (granulacja widoczna przy zoom-in)
          if (sg.children[0]) sg.children[0].rotation.y += 0.0005;
          // Glow pulsowanie — delikatne "oddychanie"
          for (let gi = 1; gi <= 3 && gi < sg.children.length; gi++) {
            const spr = sg.children[gi];
            if (!spr.material) continue;
            if (spr.material._baseOpacity === undefined) {
              spr.material._baseOpacity = spr.material.opacity;
              spr.userData.baseScale = spr.scale.x;
            }
            const speed = 1.6 - gi * 0.3;  // inner szybszy, outer wolniejszy
            spr.material.opacity = spr.material._baseOpacity
              + Math.sin(t * speed) * 0.03;
            spr.scale.setScalar(
              spr.userData.baseScale * (1 + Math.sin(t * speed * 0.8) * 0.015)
            );
          }
        }

        // Aktualizuj kamerę (płynny zoom + orbit)
        if (this._cameraController) this._cameraController.update();

        this.renderer.render(this.scene, this.camera);
      } catch (err) {
        console.error('[ThreeRenderer] Render loop error:', err);
      }
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

    // Kolor wg generacji statku (trail + sprite)
    const GEN_COLORS = { 1: 0xffffff, 2: 0x4488ff, 3: 0xff44aa, 4: 0xffdd44, 5: 0x44ffdd };
    const typeColors = {
      science_vessel:      0x4488ff,
      colony_ship:         0xff8800,
      cargo_ship:          0x44cc66,
      heavy_freighter:     0x88aa44,
      fast_scout:          0x4488ff,
      bulk_freighter:      0x4488ff,
      fusion_explorer:     0xff44aa,
      heavy_colony_ship:   0xff44aa,
      antimatter_cruiser:  0xffdd44,
      starship:            0x44ffdd,
      ark_ship:            0x44ffdd,
    };
    const gen = vessel.generation ?? 1;
    const color = typeColors[vessel.shipId] ?? GEN_COLORS[gen] ?? 0xaaaaaa;

    // Stwórz sprite (billboard) — kształt per typ statku
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const c = canvas.getContext('2d');
    const hexColor = `#${color.toString(16).padStart(6, '0')}`;
    c.fillStyle = hexColor;
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;

    if (vessel.shipId === 'science_vessel') {
      // Trójkąt — dziób u góry
      c.beginPath();
      c.moveTo(16, 4); c.lineTo(28, 28); c.lineTo(4, 28);
      c.closePath(); c.fill(); c.stroke();
    } else if (vessel.shipId === 'heavy_freighter') {
      // Duży prostokąt z podwójną ładownią — ciężki frachtowiec
      c.fillRect(5, 2, 22, 12);
      c.fillRect(5, 15, 22, 12);
      c.fillRect(10, 28, 12, 3);
      c.strokeRect(5, 2, 22, 12);
      c.strokeRect(5, 15, 22, 12);
    } else if (vessel.shipId === 'cargo_ship') {
      // Prostokąt z ładownią
      c.fillRect(7, 4, 18, 16);
      c.fillRect(9, 20, 14, 8);
      c.strokeRect(7, 4, 18, 16);
      c.strokeRect(9, 20, 14, 8);
    } else if (vessel.shipId === 'colony_ship') {
      // Pentagon — wierzchołek u góry
      c.beginPath();
      const pr = 13;
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const sx = 16 + pr * Math.cos(angle);
        const sy = 16 + pr * Math.sin(angle);
        if (i === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
      }
      c.closePath(); c.fill(); c.stroke();
    } else if (vessel.shipId === 'fast_scout') {
      // Cienki trójkąt (strzała) — szybki zwiadowca Gen II
      c.beginPath();
      c.moveTo(16, 2); c.lineTo(22, 30); c.lineTo(16, 24); c.lineTo(10, 30);
      c.closePath(); c.fill(); c.stroke();
    } else if (vessel.shipId === 'bulk_freighter') {
      // 3 bloki cargo — frachtowiec masowy Gen II
      c.fillRect(6, 3, 20, 8);
      c.fillRect(6, 12, 20, 8);
      c.fillRect(6, 21, 20, 8);
      c.strokeRect(6, 3, 20, 8);
      c.strokeRect(6, 12, 20, 8);
      c.strokeRect(6, 21, 20, 8);
    } else if (vessel.shipId === 'fusion_explorer') {
      // Trójkąt ze skrzydłami — eksplorator fuzyjny Gen III
      c.beginPath();
      c.moveTo(16, 3); c.lineTo(28, 22); c.lineTo(30, 28); c.lineTo(16, 20);
      c.lineTo(2, 28); c.lineTo(4, 22);
      c.closePath(); c.fill(); c.stroke();
    } else if (vessel.shipId === 'heavy_colony_ship') {
      // Duży pentagon + koło habitatu — ciężki kolonizator Gen III
      c.beginPath();
      const hpr = 14;
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const hx = 16 + hpr * Math.cos(angle);
        const hy = 16 + hpr * Math.sin(angle);
        if (i === 0) c.moveTo(hx, hy); else c.lineTo(hx, hy);
      }
      c.closePath(); c.fill(); c.stroke();
      // Koło habitatu
      c.beginPath(); c.arc(16, 16, 6, 0, Math.PI * 2); c.stroke();
    } else if (vessel.shipId === 'antimatter_cruiser') {
      // Sześciokąt — krążownik antymaterii Gen IV
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 2;
        const hx = 16 + 13 * Math.cos(angle);
        const hy = 16 + 13 * Math.sin(angle);
        if (i === 0) c.moveTo(hx, hy); else c.lineTo(hx, hy);
      }
      c.closePath(); c.fill(); c.stroke();
    } else if (vessel.shipId === 'starship') {
      // Gwiazda 8-ramienna — gwiezdny statek Gen V
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI / 8) - Math.PI / 2;
        const r = i % 2 === 0 ? 14 : 7;
        const sx = 16 + r * Math.cos(angle);
        const sy = 16 + r * Math.sin(angle);
        if (i === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
      }
      c.closePath(); c.fill(); c.stroke();
    } else if (vessel.shipId === 'ark_ship') {
      // Elipsa z ramionami — arka Gen V
      c.beginPath(); c.ellipse(16, 16, 14, 9, 0, 0, Math.PI * 2); c.closePath(); c.fill(); c.stroke();
      // Ramiona
      c.fillRect(2, 14, 6, 4); c.strokeRect(2, 14, 6, 4);
      c.fillRect(24, 14, 6, 4); c.strokeRect(24, 14, 6, 4);
    } else {
      // Domyślny romb
      c.beginPath();
      c.moveTo(16, 2); c.lineTo(30, 16); c.lineTo(16, 30); c.lineTo(2, 16);
      c.closePath(); c.fill(); c.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.9,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    // Skalowanie sprite wg generacji statku
    const genScale = { 1: 0.4, 2: 0.45, 3: 0.5, 4: 0.6, 5: 0.75 };
    sprite.scale.set(genScale[gen] ?? 0.4, genScale[gen] ?? 0.4, 1);

    // Pozycja startowa
    const px = S(vessel.position.x);
    const pz = S(vessel.position.y);
    sprite.position.set(px, 0.3, pz); // lekko nad płaszczyzną

    this.scene.add(sprite);

    // Linia trasy (przerywana, 2 punkty: statek → cel)
    let routeLine = null;
    if (vessel.mission) {
      const m = vessel.mission;
      const isReturn = m.phase === 'returning';
      const tx = isReturn ? (m.liveOriginX ?? m.returnTargetX ?? 0) : (m.liveTargetX ?? m.targetX ?? 0);
      const ty = isReturn ? (m.liveOriginY ?? m.returnTargetY ?? 0) : (m.liveTargetY ?? m.targetY ?? 0);
      const points = [
        new THREE.Vector3(S(vessel.position.x), 0.1, S(vessel.position.y)),
        new THREE.Vector3(S(tx), 0.1, S(ty)),
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

    this._vessels.set(vessel.id, { sprite, routeLine, tex, color });
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
      // Guard NaN — pozycja statku
      const vx = isNaN(vessel.position.x) ? 0 : vessel.position.x;
      const vy = isNaN(vessel.position.y) ? 0 : vessel.position.y;
      entry.sprite.position.set(S(vx), 0.3, S(vy));

      // Aktualizuj linię trasy (2 punkty: statek → cel)
      if (vessel.mission) {
        const m = vessel.mission;
        const isReturn = m.phase === 'returning';
        // Cel: outbound → predykcyjny targetX/Y, return → predykcyjny returnTargetX/Y
        // (nie live — linia trasy ma być stabilna, nie skakać z orbitą planety)
        let tx = isReturn ? (m.returnTargetX ?? 0) : (m.targetX ?? 0);
        let ty = isReturn ? (m.returnTargetY ?? 0) : (m.targetY ?? 0);
        if (isNaN(tx)) tx = 0;
        if (isNaN(ty)) ty = 0;

        if (!entry.routeLine) {
          // Stwórz nową linię
          const savedColor = entry.color ?? 0xaaaaaa;
          const pts = [
            new THREE.Vector3(S(vessel.position.x), 0.1, S(vessel.position.y)),
            new THREE.Vector3(S(tx), 0.1, S(ty)),
          ];
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const lineMat = new THREE.LineDashedMaterial({
            color: savedColor, dashSize: 0.3, gapSize: 0.15,
            transparent: true, opacity: 0.4,
          });
          entry.routeLine = new THREE.Line(geo, lineMat);
          entry.routeLine.computeLineDistances();
          this.scene.add(entry.routeLine);
        } else {
          // Aktualizuj 2 punkty: statek → cel
          const posArr = entry.routeLine.geometry.attributes.position.array;
          posArr[0] = S(vessel.position.x); posArr[1] = 0.1; posArr[2] = S(vessel.position.y);
          posArr[3] = S(tx);                posArr[4] = 0.1; posArr[5] = S(ty);
          entry.routeLine.geometry.attributes.position.needsUpdate = true;
          entry.routeLine.computeLineDistances();
        }
      } else if (entry.routeLine) {
        // Misja zakończona — usuń linię trasy
        this.scene.remove(entry.routeLine);
        entry.routeLine.geometry.dispose();
        entry.routeLine.material.dispose();
        entry.routeLine = null;
      }
    }
  }
}
