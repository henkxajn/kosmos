// PlanetGlobeRenderer — 3D widok planety z proceduralną teksturą terenu
//
// Osobna scena Three.js na dynamicznie tworzonym canvasie.
// Główna sfera: PlanetTerrainTexture (proceduralna z biomów) lub PBR (fallback).
// Overlay sfera (r=1.005): markery budynków + highlight regionów/hexów.
// Raycasting: klik/hover na sferze → lat/lon → region (lub UV → hex fallback).
//
// Dwa tryby:
//   1. Standalone (fullscreen) — open(planet, grid) — eventy na własnym canvasie
//   2. Embedded (w PlanetGlobeScene) — open(planet, grid, bounds, true) — input z zewnątrz
//
// Lifecycle: open(planet, grid, bounds?, externalInput?) → [interakcja] → close()
// Komunikacja: EventBus('planet:closeGlobe') przy zamknięciu (tylko standalone)

import * as THREE from 'three';
import EventBus   from '../core/EventBus.js';
import { HexGrid } from '../map/HexGrid.js';
import { PlanetGlobeTexture }         from './PlanetGlobeTexture.js';
import { PlanetGlobeCameraController } from './PlanetGlobeCameraController.js';
import { PlanetTerrainTexture }        from './PlanetTerrainTexture.js';
import { resolveTextureType, loadPlanetTextures, hashCode, TEXTURE_VARIANTS }
  from './PlanetTextureUtils.js';
import { BUILDINGS }                   from '../data/BuildingsData.js';
import { SurfaceMarkers }              from './SurfaceMarkers.js';
import { getEffectivePlanetType }      from '../utils/EntityUtils.js';
import { BiomeMapGenerator }           from './BiomeMapGenerator.js';
import { BuildingMapGenerator }        from './BuildingMapGenerator.js';
import { PlanetShader }                from './PlanetShader.js';

// Eksport do konsoli przeglądarki (debug/test)
window.PlanetTerrainTexture = PlanetTerrainTexture;

// ── Kolory kategorii budynków (markery na globie) ───────────────────────────
const CAT_COLORS = {
  mining:     [204, 153,  68],
  energy:     [255, 221,  68],
  food:       [ 68, 204, 102],
  population: [ 68, 136, 255],
  research:   [204, 102, 255],
  military:   [255,  68,  68],
  space:      [170, 170, 255],
};

export class PlanetGlobeRenderer {
  constructor() {
    this._planet   = null;
    this._grid     = null;
    this._canvas   = null;
    this._renderer = null;
    this._scene    = null;
    this._camera   = null;
    this._cameraCtrl = null;
    this._sphereMesh     = null;
    this._atmosphereMesh = null;
    this._cloudMesh      = null;   // sfera chmur
    this._overlayMesh    = null;    // sfera overlay (r=1.005) — markery + highlight + siatka
    this._overlayTexture = null;    // canvas texture overlay
    this._terrainTexture = null;    // PlanetTerrainTexture (do dispose)
    this._biomeMapTexture = null;   // DataTexture dla GLSL shadera
    this._buildingMapTexture = null;  // DataTexture dla świateł nocnych
    this._surfaceMarkers = null;    // SurfaceMarkers — markery 3D budynków
    this._hoveredTile    = null;
    this._selectedTileCoords = null;  // {q, r} zaznaczonego tile/regionu
    this._animFrameId    = null;
    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();
    this._externalInput = false;  // tryb sterowania zewnętrznego
    this._bounds    = null;       // {x, y, w, h} lub null (fullscreen)
    this._showGrid  = false;      // toggle siatki hex / konturów regionów
    this._isGas     = false;      // czy planeta gazowa (proceduralna tekstura)
    this._isRegionMode = false;   // czy grid to RegionSystem (nie HexGrid)

    // Callbacki zewnętrzne
    this.onTileHover = null;   // (tile, screenX, screenY) => {}
    this.onTileClick = null;   // (tile) => {}

    // Bound handlery (do cleanup)
    this._onKeyDown = null;
    this._onResize  = null;
    this._onGlobeMouseMove = null;
    this._onGlobeClick     = null;

    this.isOpen = false;
  }

  // Getter — kontroler kamery (PlanetGlobeScene potrzebuje go do drag/zoom)
  get cameraCtrl() { return this._cameraCtrl; }

  // ── Otwórz widok globu ──────────────────────────────────────
  // bounds: { x, y, w, h } w pikselach fizycznych (null → fullscreen)
  // externalInput: true → nie podpinaj eventów myszy (PlanetGlobeScene steruje)
  open(planet, grid, bounds = null, externalInput = false) {
    if (this.isOpen) return;
    this._planet  = planet;
    this._grid    = grid;
    this._bounds  = bounds;
    this._externalInput = externalInput;
    this._isRegionMode = !!grid.getByLatLon;
    this.isOpen   = true;

    const W = bounds ? Math.round(bounds.w) : window.innerWidth;
    const H = bounds ? Math.round(bounds.h) : window.innerHeight;

    // Dynamiczny canvas — z-index 3 (pod planet-canvas=4, nad ui-canvas=2)
    // planet-canvas jest przeźroczysty w centrum → globus widoczny; panele/tooltips nad globusem
    this._canvas = document.createElement('canvas');
    if (bounds) {
      this._canvas.style.cssText =
        `position:absolute;left:${Math.round(bounds.x)}px;top:${Math.round(bounds.y)}px;` +
        `width:${Math.round(bounds.w)}px;height:${Math.round(bounds.h)}px;z-index:3;background:transparent;`;
    } else {
      this._canvas.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;z-index:3;background:transparent;';
    }
    document.getElementById('game-container').appendChild(this._canvas);
    console.log('[PlanetGlobeRenderer] bounds:', bounds, 'W:', W, 'H:', H, 'z-index:', this._canvas.style.zIndex);

    // WebGL renderer — setPixelRatio PRZED setSize (ważna kolejność!)
    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      alpha: true,
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setSize(W, H, false); // false = nie nadpisuj CSS width/height
    this._renderer.toneMapping = THREE.NoToneMapping;
    // Poprawne kolory dla PBR (MeshStandardMaterial)
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scena
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x020405);

    // Kamera
    this._camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);

    // Oświetlenie — dostosowane do PBR
    this._scene.add(new THREE.AmbientLight(0x1a3330, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    dirLight.position.set(3, 2, 4);
    this._scene.add(dirLight);

    // ── Materiał sfery ────────────────────────────────────────────────────
    this._isGas = (getEffectivePlanetType(planet) === 'gas');
    const geometry = new THREE.SphereGeometry(1.0, 64, 64);
    let material;

    if (!this._isGas && grid) {
      // Próba GLSL shadera (BiomeMap + PlanetShader)
      let shaderOk = false;
      try {
        this._biomeMapTexture = BiomeMapGenerator.generate(grid, planet);
        this._buildingMapTexture = BuildingMapGenerator.generate(grid);
        if (this._biomeMapTexture) {
          const uniforms = PlanetShader.createUniforms(planet, this._biomeMapTexture, this._buildingMapTexture);
          material = new THREE.ShaderMaterial({
            vertexShader:   PlanetShader.vertexShader,
            fragmentShader: PlanetShader.fragmentShader,
            uniforms,
          });
          shaderOk = true;
          console.log('[PlanetGlobeRenderer] GLSL shader aktywny');
        }
      } catch (err) {
        console.warn('[PlanetGlobeRenderer] GLSL shader error, fallback na Canvas2D:', err);
      }

      // Fallback: Canvas 2D jeśli GLSL nie działa
      if (!shaderOk) {
        this._terrainTexture = PlanetTerrainTexture.generate(grid, planet);
        console.log('[PlanetGlobeRenderer] terrain tex (fallback):', this._terrainTexture);
        material = new THREE.MeshStandardMaterial({
          map:       this._terrainTexture,
          metalness: 0.05,
          roughness: 0.75,
        });
      }
    } else {
      // Gas giant lub brak grida: pre-generowane tekstury PBR z plików
      const texType = resolveTextureType(planet);
      if (texType) {
        const seed    = hashCode(String(planet.id));
        const variant = (seed % TEXTURE_VARIANTS) + 1;
        const maps    = loadPlanetTextures(texType, variant);
        material = new THREE.MeshStandardMaterial({
          map:          maps.diffuse,
          normalMap:    maps.normal,
          roughnessMap: maps.roughness,
          metalness:    this._isGas ? 0.0 : 0.05,
        });
      } else {
        // Fallback: solid color
        material = new THREE.MeshStandardMaterial({
          color: planet.visual?.color ?? 0x888888,
          metalness: 0.05, roughness: 0.7,
        });
      }
    }

    this._sphereMesh = new THREE.Mesh(geometry, material);
    this._scene.add(this._sphereMesh);

    // ── Overlay sfera (r=1.005) — markery budynków + highlight + siatka ──
    // PlanetGlobeTexture generuje overlay (działa z HexGrid — markery, siatka, highlight)
    this._overlayTexture = PlanetGlobeTexture.generateOverlay(grid, {
      showGrid: this._showGrid,
      showBuildings: false,  // markery budynków rysowane przez SurfaceMarkers (3D)
      selectedTile: null,
      hoveredTile: null,
    });
    const overlayGeom = new THREE.SphereGeometry(1.005, 64, 64);
    const overlayMat  = new THREE.MeshBasicMaterial({
      map: this._overlayTexture,
      transparent: true,
      depthWrite: false,
    });
    this._overlayMesh = new THREE.Mesh(overlayGeom, overlayMat);
    this._scene.add(this._overlayMesh);

    // Atmosfera glow (jeśli planeta ma atmosferę)
    const atm = planet.atmosphere;
    if (atm && atm !== 'none' && atm !== 'brak') {
      const glowColor = planet.visual?.glowColor ?? 0x4488ff;
      this._atmosphereMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.06, 32, 32),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(glowColor),
          transparent: true,
          opacity: 0.12,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this._scene.add(this._atmosphereMesh);
    }

    // Warstwa chmur
    this._cloudMesh = this._createCloudMesh(planet);
    if (this._cloudMesh) {
      this._scene.add(this._cloudMesh);
    }

    // Kontroler kamery
    this._cameraCtrl = new PlanetGlobeCameraController(this._camera);
    if (!externalInput) {
      // Standalone: eventy na canvasie globu
      this._cameraCtrl.attach(this._canvas);
    }

    // Mouse hover + click (tylko standalone)
    if (!externalInput) {
      this._setupMouse();
    }

    // ESC → zamknij (tylko standalone)
    if (!externalInput) {
      this._onKeyDown = (e) => {
        if (e.code === 'Escape') this.close();
      };
      document.addEventListener('keydown', this._onKeyDown);
    }

    // Resize
    this._onResize = () => {
      if (this._bounds) return; // embedded — resize obsługiwany przez PlanetGlobeScene
      const nW = window.innerWidth;
      const nH = window.innerHeight;
      this._renderer.setSize(nW, nH);
      this._camera.aspect = nW / nH;
      this._camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._onResize);

    // Markery 3D budynków na powierzchni globusa
    this._surfaceMarkers = new SurfaceMarkers(this._scene);
    this._surfaceMarkers.update(grid);

    // Pętla renderowania
    this._startLoop();
  }

  // ── Zamknij widok globu ─────────────────────────────────────

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    // Zatrzymaj pętlę
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }

    // Eventy
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('resize', this._onResize);
    if (!this._externalInput) this._cleanupMouse();

    // Camera controller
    if (this._cameraCtrl) {
      this._cameraCtrl.dispose();
      this._cameraCtrl = null;
    }

    // Dispose markery 3D
    if (this._surfaceMarkers) {
      this._surfaceMarkers.dispose();
      this._surfaceMarkers = null;
    }

    // Dispose Three.js
    if (this._sphereMesh) {
      this._sphereMesh.geometry.dispose();
      // Tekstury PBR z loadPlanetTextures są w _textureCache — nie dispose'uj
      this._sphereMesh.material.dispose();
      this._scene.remove(this._sphereMesh);
      this._sphereMesh = null;
    }
    // Dispose biomeMap DataTexture
    if (this._biomeMapTexture) {
      this._biomeMapTexture.dispose();
      this._biomeMapTexture = null;
    }
    // Dispose buildingMap DataTexture
    if (this._buildingMapTexture) {
      this._buildingMapTexture.dispose();
      this._buildingMapTexture = null;
    }
    // Dispose terrain texture (nie jest w cache)
    if (this._terrainTexture) {
      this._terrainTexture.dispose();
      this._terrainTexture = null;
    }
    if (this._cloudMesh) {
      this._cloudMesh.geometry.dispose();
      this._cloudMesh.material.dispose();
      this._scene.remove(this._cloudMesh);
      this._cloudMesh = null;
    }
    if (this._atmosphereMesh) {
      this._atmosphereMesh.geometry.dispose();
      this._atmosphereMesh.material.dispose();
      this._scene.remove(this._atmosphereMesh);
      this._atmosphereMesh = null;
    }
    if (this._overlayMesh) {
      this._overlayMesh.geometry.dispose();
      this._overlayMesh.material.dispose();
      this._scene.remove(this._overlayMesh);
      this._overlayMesh = null;
    }
    if (this._overlayTexture) {
      this._overlayTexture.dispose();
      this._overlayTexture = null;
    }
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }

    // Usuń canvas z DOM
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;

    this._scene    = null;
    this._camera   = null;
    this._planet   = null;
    this._grid     = null;
    this._hoveredTile = null;
    this._selectedTileCoords = null;
    this._isRegionMode = false;
    this._biomeMapTexture = null;

    // Standalone: emituj zdarzenie zamknięcia
    if (!this._externalInput) {
      EventBus.emit('planet:closeGlobe');
    }
  }

  // ── External input API (PlanetGlobeScene steruje z event-layer) ──

  handleExternalMouseMove(clientX, clientY) {
    const tile = this._raycastToTile(clientX, clientY);
    if (tile !== this._hoveredTile) {
      this._hoveredTile = tile;
      if (this.onTileHover) this.onTileHover(tile, clientX, clientY);
      this._updateOverlay();
    }
  }

  handleExternalClick(clientX, clientY) {
    const tile = this._raycastToTile(clientX, clientY);
    if (this.onTileClick) this.onTileClick(tile);
  }

  // ── Highlight API ──────────────────────────────────────────

  setSelectedTile(tile) {
    this._selectedTileCoords = tile ? { q: tile.q, r: tile.r } : null;
    this._updateOverlay();
    // Podświetl marker wybranego tile'a
    const key = tile ? (tile.key ?? `${tile.q},${tile.r}`) : null;
    this._surfaceMarkers?.setSelected(key);
  }

  // ── Toggle siatki hex / konturów regionów ──────────────────
  setShowGrid(show) {
    this._showGrid = !!show;
    this._updateOverlay();
  }

  // ── Odśwież overlay (np. po budowie budynku) ─────────────────

  refreshTexture() {
    if (!this._overlayTexture || !this._grid) return;
    this._updateOverlay();
    // Aktualizuj BuildingMap po budowie/rozbiórce
    if (this._buildingMapTexture && this._grid) {
      BuildingMapGenerator.update(this._buildingMapTexture, this._grid);
    }
    // Aktualizuj markery 3D (nowe budynki, rozbiórki)
    this._surfaceMarkers?.update(this._grid);
    if (this._selectedTileCoords) {
      const key = `${this._selectedTileCoords.q},${this._selectedTileCoords.r}`;
      this._surfaceMarkers?.setSelected(key);
    }
  }

  // ── Prywatne ────────────────────────────────────────────────

  // Pełna aktualizacja overlay — markery + highlight + opcjonalna siatka
  _updateOverlay() {
    if (!this._overlayTexture || !this._grid) return;

    if (this._isRegionMode) {
      // Ścieżka regionów: ręczne rysowanie na overlay canvas
      const canvas = this._overlayTexture.image;
      const ctx = canvas.getContext('2d');
      const texW = canvas.width;
      const texH = canvas.height;
      ctx.clearRect(0, 0, texW, texH);

      // Highlight zaznaczonego regionu
      if (this._selectedTileCoords) {
        const region = this._grid.get(this._selectedTileCoords.q);
        if (region) this._drawRegionHighlight(ctx, region, texW, texH, 'selected');
      }

      // Highlight hoverowanego regionu (jeśli inny niż zaznaczony)
      if (this._hoveredTile) {
        const selectedId = this._selectedTileCoords
          ? this._grid.get(this._selectedTileCoords.q)?.id
          : null;
        if (this._hoveredTile.id !== selectedId) {
          this._drawRegionHighlight(ctx, this._hoveredTile, texW, texH, 'hovered');
        }
      }

      // Markery budynków
      this._drawRegionBuildingMarkers(ctx, texW, texH);

      this._overlayTexture.needsUpdate = true;
    } else {
      // HexGrid: PlanetGlobeTexture obsługuje markery, siatki, highlight
      PlanetGlobeTexture.updateOverlay(
        this._overlayTexture, this._grid, {
          showGrid: this._showGrid,
          showBuildings: false,  // markery budynków rysowane przez SurfaceMarkers (3D)
          selectedTile: this._selectedTileCoords,
          hoveredTile: this._hoveredTile ? { q: this._hoveredTile.q, r: this._hoveredTile.r } : null,
        }
      );
    }
  }

  // ── Highlight regionu — miękki radialny glow ──────────────────────────────
  _drawRegionHighlight(ctx, region, texW, texH, type) {
    // Centrum regionu: (lat, lon) → UV na equirectangular
    const u = region.centerLon / (2 * Math.PI);
    const v = 1 - (region.centerLat + Math.PI / 2) / Math.PI;
    const cx = u * texW;
    const cy = v * texH;

    // Promień glowa proporcjonalny do area regionu
    const radius = Math.sqrt(region.area) * texW * 0.12;

    // Radialny gradient
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    if (type === 'selected') {
      grad.addColorStop(0,   'rgba(136, 255, 204, 0.45)');
      grad.addColorStop(0.5, 'rgba(136, 255, 204, 0.20)');
      grad.addColorStop(1,   'rgba(136, 255, 204, 0)');
    } else {
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, texW, texH);
  }

  // ── Markery budynków na regionach ──────────────────────────────────────────
  _drawRegionBuildingMarkers(ctx, texW, texH) {
    this._grid.forEach(region => {
      if (!region.buildingId && !region.capitalBase) return;

      const u = region.centerLon / (2 * Math.PI);
      const v = 1 - (region.centerLat + Math.PI / 2) / Math.PI;
      const cx = u * texW;
      const cy = v * texH;

      if (region.buildingId) {
        const bDef = BUILDINGS[region.buildingId];
        const cat = bDef?.category ?? 'mining';
        const rgb = CAT_COLORS[cat] ?? CAT_COLORS.mining;

        // Kółko budynku
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (region.capitalBase) {
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(68, 136, 255)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  // ── Sfera chmur — proceduralny GLSL shader ──────────────────────────────────
  _createCloudMesh(planet) {
    // Planety bez atmosfery nie mają chmur
    const atm = planet.atmosphere;
    if (!atm || atm === 'none' || atm === 'brak') return null;

    const cloudVertexShader = `
      varying vec3 vSpherePos;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vSpherePos = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `;

    const cloudFragmentShader = `
      uniform float uTime;
      uniform vec3  uLightDir;
      varying vec3  vSpherePos;
      varying vec3  vNormal;
      varying vec3  vViewDir;

      // Simplex noise 2D (Stefan Gustavson, public domain)
      vec3 mod289v3(vec3 x) { return x - floor(x*(1./289.))*289.; }
      vec2 mod289v2(vec2 x) { return x - floor(x*(1./289.))*289.; }
      vec3 permute3(vec3 x) { return mod289v3(((x*34.)+1.)*x); }
      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.,0.) : vec2(0.,1.);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289v2(i);
        vec3 p = permute3(permute3(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
        vec3 m = max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
        m=m*m; m=m*m;
        vec3 x2 = 2.*fract(p*C.www)-1.;
        vec3 h = abs(x2)-0.5;
        vec3 ox = floor(x2+0.5);
        vec3 a0 = x2-ox;
        m *= 1.79284291400159-0.85373472095314*(a0*a0+h*h);
        vec3 g;
        g.x  = a0.x *x0.x  + h.x *x0.y;
        g.yz = a0.yz*x12.xz + h.yz*x12.yw;
        return 130.*dot(m,g);
      }

      // Triplanar noise — bez szwu na sferze
      float sphereNoise(vec3 p, float scale) {
        vec3 w = abs(p);
        w = w / (w.x + w.y + w.z + 0.0001);
        return snoise(p.yz * scale) * w.x
             + snoise(p.xz * scale) * w.y
             + snoise(p.xy * scale) * w.z;
      }

      void main() {
        // Dryfowanie chmur — przesunięcie pozycji sfery przez czas
        vec3 sp = vSpherePos + vec3(uTime * 0.012, 0.0, uTime * 0.004);

        // FBM — 4 warstwy triplanar noise
        float n = sphereNoise(sp, 3.0)  * 0.500
                + sphereNoise(sp, 6.2)  * 0.250
                + sphereNoise(sp, 12.5) * 0.125
                + sphereNoise(sp, 25.0) * 0.063;
        n = n * 0.5 + 0.5;

        // Próg chmur — tylko powyżej 0.52 są chmury
        float cloudMask = smoothstep(0.50, 0.72, n);

        // Oświetlenie chmur
        float rawDiff = dot(vNormal, normalize(uLightDir));
        float diff = max(rawDiff, 0.0);
        float lit = 0.4 + 0.6 * diff;

        // Kolor chmury — biały z lekkim cieniem od spodu
        vec3 cloudColor = vec3(0.95, 0.97, 1.00) * lit;

        // Nocna strona — chmury prawie niewidoczne
        float nightFade = smoothstep(-0.1, 0.15, rawDiff);  // 0=noc, 1=dzień

        // Fresnel — chmury cieńsze na krawędzi
        float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        float edgeFade = 1.0 - pow(fresnel, 2.5) * 0.6;

        float alpha = cloudMask * 0.82 * edgeFade * (0.06 + 0.94 * nightFade);

        gl_FragColor = vec4(cloudColor, alpha);
      }
    `;

    const cloudUniforms = {
      uTime:     { value: 0.0 },
      uLightDir: { value: new THREE.Vector3(3, 2, 4).normalize() },
    };

    const cloudMat = new THREE.ShaderMaterial({
      vertexShader:   cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      uniforms:       cloudUniforms,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.FrontSide,
    });

    return new THREE.Mesh(
      new THREE.SphereGeometry(1.018, 64, 64),
      cloudMat
    );
  }

  _startLoop() {
    let lastTime = performance.now();
    const loop = () => {
      if (!this._renderer) return;
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      try {
        this._surfaceMarkers?.tick(delta);
        // Aktualizuj czas dla animacji rotacji i chmur
        if (this._sphereMesh?.material?.uniforms?.uTime != null) {
          this._sphereMesh.material.uniforms.uTime.value += delta * 0.08;
        }
        if (this._cloudMesh?.material?.uniforms?.uTime != null) {
          this._cloudMesh.material.uniforms.uTime.value += delta;
        }
        this._cameraCtrl?.update();
        this._renderer.render(this._scene, this._camera);
      } catch (err) {
        console.error('[PlanetGlobeRenderer] Render loop error:', err);
      }
      this._animFrameId = requestAnimationFrame(loop);
    };
    this._animFrameId = requestAnimationFrame(loop);
  }

  // ── Raycasting: hover/klik na sferze → region lub hex tile ───────

  _setupMouse() {
    this._onGlobeMouseMove = (e) => {
      const tile = this._raycastToTile(e.clientX, e.clientY);
      if (tile !== this._hoveredTile) {
        this._hoveredTile = tile;
        if (this.onTileHover) this.onTileHover(tile, e.clientX, e.clientY);
        this._updateOverlay();
      }
    };

    this._onGlobeClick = (e) => {
      // Ignoruj kliknięcie po drag'u
      if (this._cameraCtrl?.wasDrag) return;
      const tile = this._raycastToTile(e.clientX, e.clientY);
      if (tile && this.onTileClick) this.onTileClick(tile);
    };

    this._canvas.addEventListener('mousemove', this._onGlobeMouseMove);
    this._canvas.addEventListener('click',     this._onGlobeClick);
  }

  _cleanupMouse() {
    if (this._canvas) {
      this._canvas.removeEventListener('mousemove', this._onGlobeMouseMove);
      this._canvas.removeEventListener('click',     this._onGlobeClick);
    }
  }

  // Raycast na sferę → lat/lon → region (lub UV → hex fallback)
  _raycastToTile(screenX, screenY) {
    if (!this._sphereMesh || !this._grid) return null;

    // Przelicz clientX/clientY na NDC w kontekście canvasa globu
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.x =  ((screenX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((screenY - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const hits = this._raycaster.intersectObject(this._sphereMesh);
    if (hits.length === 0) return null;

    // Tryb regionów: punkt trafienia → lat/lon → region
    // Three.js SphereGeometry UV: x = -r*cos(u*2π)*sin(v*π), z = r*sin(u*2π)*sin(v*π)
    // Stąd lon odpowiadający UV: lon = atan2(z, -x), znormalizowane do 0..2π
    if (this._isRegionMode) {
      const point = hits[0].point.normalize();
      const lat = Math.asin(point.y);                     // -π/2 do π/2
      let lon = Math.atan2(point.z, -point.x);             // -π do π
      if (lon < 0) lon += 2 * Math.PI;                     // 0 do 2π
      return this._grid.getByLatLon(lat, lon);
    }

    // Fallback HexGrid: UV → hex coords
    const uv = hits[0].uv;
    if (!uv) return null;

    const hexSize = PlanetGlobeTexture.calcHexSize(this._grid);
    const gridPx  = this._grid.gridPixelSize(hexSize);

    const hexX = uv.x * gridPx.w;
    // UV.y w Three.js: 0 = dół, 1 = góra → odwracamy
    const hexY = (1 - uv.y) * gridPx.h;

    // Próba bezpośrednia
    const { q, r } = HexGrid.pixelToHex(hexX, hexY, hexSize);
    const tile = this._grid.get(q, r);
    if (tile) return tile;

    // Brute-force nearest hex z wrappingiem (obsługa szwu)
    let bestTile = null;
    let bestDist = Infinity;
    this._grid.forEach(t => {
      const center = HexGrid.hexToPixel(t.q, t.r, hexSize);
      for (const dx of [0, gridPx.w, -gridPx.w]) {
        const d = (hexX - center.x - dx) ** 2 + (hexY - center.y) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestTile = t;
        }
      }
    });
    return bestTile;
  }
}
