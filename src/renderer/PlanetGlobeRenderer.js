// PlanetGlobeRenderer — 3D widok planety z siatką heksagonalną
//
// Osobna scena Three.js na dynamicznie tworzonym canvasie.
// Sfera z teksturą łączącą powierzchnię planety + hex overlay.
// Raycasting: klik/hover na sferze → UV → hex tile.
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

export class PlanetGlobeRenderer {
  constructor() {
    this._planet   = null;
    this._grid     = null;
    this._canvas   = null;
    this._renderer = null;
    this._scene    = null;
    this._camera   = null;
    this._cameraCtrl = null;
    this._texture  = null;
    this._sphereMesh     = null;
    this._atmosphereMesh = null;
    this._overlayMesh    = null;    // sfera highlight (r=1.01)
    this._overlayTexture = null;    // lekka tekstura highlight
    this._hoveredTile    = null;
    this._selectedTileCoords = null;  // {q, r} zaznaczonego tile
    this._animFrameId    = null;
    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();
    this._externalInput = false;  // tryb sterowania zewnętrznego
    this._bounds    = null;       // {x, y, w, h} lub null (fullscreen)

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
    this.isOpen   = true;

    const W = bounds ? Math.round(bounds.w) : window.innerWidth;
    const H = bounds ? Math.round(bounds.h) : window.innerHeight;

    // Dynamiczny canvas
    this._canvas = document.createElement('canvas');
    if (bounds) {
      this._canvas.style.cssText =
        `position:absolute;left:${Math.round(bounds.x)}px;top:${Math.round(bounds.y)}px;` +
        `width:${Math.round(bounds.w)}px;height:${Math.round(bounds.h)}px;z-index:5;`;
    } else {
      this._canvas.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;';
    }
    document.getElementById('game-container').appendChild(this._canvas);

    // WebGL renderer
    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      alpha: true,
    });
    this._renderer.setSize(W, H);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.toneMapping = THREE.NoToneMapping;

    // Scena
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x060810);

    // Kamera
    this._camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);

    // Oświetlenie
    this._scene.add(new THREE.AmbientLight(0x334466, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(3, 2, 4);
    this._scene.add(dirLight);

    // Tekstura z hexami
    this._texture = PlanetGlobeTexture.generate(planet, grid, {
      showGrid: true,
      showBuildings: true,
    });

    // Sfera planety
    const geometry = new THREE.SphereGeometry(1.0, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      map: this._texture,
      shininess: planet.planetType === 'ice' ? 40 : 8,
      specular: new THREE.Color(0x111111),
    });
    this._sphereMesh = new THREE.Mesh(geometry, material);
    this._scene.add(this._sphereMesh);

    // Overlay highlight sphere (r=1.01) — rysuje tylko 1-2 podświetlone hexy
    this._overlayTexture = PlanetGlobeTexture.generateHighlightTexture(grid, null, null);
    const overlayGeom = new THREE.SphereGeometry(1.01, 64, 64);
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

    // Dispose Three.js
    if (this._sphereMesh) {
      this._sphereMesh.geometry.dispose();
      this._sphereMesh.material.dispose();
      this._scene.remove(this._sphereMesh);
      this._sphereMesh = null;
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
    if (this._texture) {
      this._texture.dispose();
      this._texture = null;
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
      this._updateHighlight();  // overlay <1ms
    }
  }

  handleExternalClick(clientX, clientY) {
    const tile = this._raycastToTile(clientX, clientY);
    if (this.onTileClick) this.onTileClick(tile);
  }

  // ── Highlight API ──────────────────────────────────────────

  setSelectedTile(tile) {
    this._selectedTileCoords = tile ? { q: tile.q, r: tile.r } : null;
    this._updateHighlight();
  }

  // ── Odśwież teksturę (np. po budowie budynku) ──────────────

  refreshTexture() {
    if (!this._texture || !this._planet || !this._grid) return;
    // Bazowa tekstura bez highlight — highlight jest na overlay sphere
    PlanetGlobeTexture.update(this._texture, this._planet, this._grid, {
      showGrid: true,
      showBuildings: true,
    });
    // Odśwież overlay (budynek mógł się pojawić pod highlighted hexem)
    this._updateHighlight();
  }

  // ── Prywatne ────────────────────────────────────────────────

  // Update overlay highlight — rysuje 1-2 hexy na przezroczystej sferze (<1ms)
  _updateHighlight() {
    if (!this._overlayTexture || !this._grid) return;
    PlanetGlobeTexture.updateHighlightTexture(
      this._overlayTexture, this._grid,
      this._selectedTileCoords,
      this._hoveredTile ? { q: this._hoveredTile.q, r: this._hoveredTile.r } : null,
    );
  }

  _startLoop() {
    const loop = () => {
      if (!this._renderer) return;
      this._cameraCtrl?.update();
      this._renderer.render(this._scene, this._camera);
      this._animFrameId = requestAnimationFrame(loop);
    };
    this._animFrameId = requestAnimationFrame(loop);
  }

  // ── Raycasting: hover/klik na sferze → UV → hex tile ───────

  _setupMouse() {
    this._onGlobeMouseMove = (e) => {
      const tile = this._raycastToTile(e.clientX, e.clientY);
      if (tile !== this._hoveredTile) {
        this._hoveredTile = tile;
        if (this.onTileHover) this.onTileHover(tile, e.clientX, e.clientY);
        this._updateHighlight();  // overlay <1ms
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

  // Raycast na sferę → UV → hex tile
  _raycastToTile(screenX, screenY) {
    if (!this._sphereMesh || !this._grid) return null;

    // Przelicz clientX/clientY na NDC w kontekście canvasa globu
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.x =  ((screenX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((screenY - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const hits = this._raycaster.intersectObject(this._sphereMesh);
    if (hits.length === 0) return null;

    const uv = hits[0].uv;
    if (!uv) return null;

    // UV → hex grid pixel coordinates
    const hexSize = PlanetGlobeTexture.calcHexSize(this._grid);
    const gridPx  = this._grid.gridPixelSize(hexSize);

    const hexX = uv.x * gridPx.w;
    // UV.y w Three.js: 0 = dół, 1 = góra → odwracamy
    const hexY = (1 - uv.y) * gridPx.h;

    const { q, r } = HexGrid.pixelToHex(hexX, hexY, hexSize);
    return this._grid.get(q, r) || null;
  }
}
