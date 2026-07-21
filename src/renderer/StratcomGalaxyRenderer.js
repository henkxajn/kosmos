// StratcomGalaxyRenderer — osadzony renderer 3D galaktyki dla panelu Stratcom.
//
// Tryb OFFSCREEN: renderuje do własnego canvasa (poza DOM), który overlay
// komponuje przez ctx.drawImage(canvas, panelRect). BRAK pętli rAF — render()
// jest wołany synchronicznie z draw() overlayu (radar Stratcomu wymusza ciągły
// redraw przez _dirty, więc 3D animuje się płynnie). Cały chrome (nazwy,
// pierścienie, linie, hit-zony) rysuje overlay 2D PO drawImage, pozycjonując go
// przez project()/projectXYZ() — czyli rzut pozycji gwiazd z kamery 3D.
//
// Gwiazdy: rdzeń (MeshBasicMaterial colorHex) + sprite glow additive
// (glowColorHex). Kolor = typ spektralny (dane colorHex/glowColorHex z
// galaxyData). Stan gry (dim/home) sterowany flagami z setSystems — renderer
// NIE zna logiki gry (mgła wojny/dyplomacja zostają w overlayu).
//
// Wzorzec offscreen+drawImage (zamiast warstwowego canvasa jak PlanetGlobeRenderer)
// wybrany świadomie: panel Stratcomu ma chrome 2D NAD mapą (panel operacyjny,
// nazwy, linie) — drawImage daje poprawny z-order w jednym #ui-canvas bez
// żonglowania pozycją/uiScale osobnego DOM-canvasa.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { STAR_TYPES, GAME_CONFIG } from '../config/GameConfig.js';
import { loadStarTextures, hashCode, TEXTURE_VARIANTS } from './PlanetTextureUtils.js';
import { orbitPosition, riserEndpoints } from './HolotableCamera.js';
import { poolFillAlpha } from '../ui/TerritoryRenderLogic.js';

const FOV = 50;
// Tło kosmiczne (subtelne). Plik podmienialny; jasność regulowana mnożnikiem (niska = subtelne).
const BG_URL = 'assets/backgrounds/deep_space.png';
const BG_BRIGHTNESS = 0.25;   // 0..1 — scene.backgroundIntensity (1.0 = bez tłumienia)
const TERRITORY_DASH_SPEED = 0.3;   // „marsz" dashа izolinii 3D (jedn. galakt./s; tuning B6)
const RISER_COLOR   = 0x7796b5;     // chłodny błękit — pionowy „słupek z" od dysku do gwiazdy (głębia bez brył)
const RISER_OPACITY = 0.35;         // subtelny, żeby nie zaśmiecać dysku (× dimF dla niezbadanych)

export class StratcomGalaxyRenderer {
  constructor() {
    this._renderer  = null;
    this._scene     = null;
    this._camera    = null;
    this._canvas    = null;
    this._wPx = 0; this._hPx = 0;
    this._starGroup = null;       // grupa wszystkich gwiazd
    this._ringGroup = null;       // pierścienie zasięgu na płaszczyźnie dysku
    this._sig       = '';         // sygnatura zestawu gwiazd (rebuild tylko przy zmianie)
    this._ringSig   = '';
    this._territoryGroup = null;  // strefy wpływów: płaszczyzna polityczna + izolinie
    this._territorySig   = '';
    this._territoryTex   = null;  // wspólna CanvasTexture (dispose ręczny — map nie idzie z material.dispose)
    this._territoryDashMats = []; // materiały izolinii z patchem uDashOffset (update per render)
    this._territoryLines = [];    // izolinie (userData: ownerId/atWar/baseOpacity) — war-pulse + merge-flash
    this._territoryFlash = null;  // Map ownerId→factor (0..1), ustawiane per-frame przez overlay
    this._glowCache = new Map();  // glowColorHex → CanvasTexture (współdzielone)
    this._failed    = false;
    this._composer  = null;       // pipeline HDR: Render → Bloom(próg 1.0) → OutputPass
    this._bloomPass = null;
    this._bgTexture = null;       // tło kosmiczne (tekstura) → scene.background + backgroundIntensity
    this._bgTried   = false;      // czy próbowano już załadować tło (async, raz)
    this.fitDist    = 40;         // domyślny dystans kamery dopasowany do rozrzutu
  }

  get canvas() { return this._canvas; }
  get ok()     { return !this._failed && !!this._renderer; }

  // Leniwe utworzenie / resize. Zwraca false gdy WebGL niedostępny.
  _ensure(wPx, hPx) {
    if (this._failed) return false;
    if (!this._renderer) {
      try {
        this._canvas = document.createElement('canvas');
        this._canvas.width = wPx; this._canvas.height = hPx;
        this._renderer = new THREE.WebGLRenderer({
          canvas: this._canvas,
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,   // niezbędne do ctx.drawImage(canvas)
        });
        this._renderer.setClearColor(0x000000, 1);  // prawdziwa czerń (pipeline HDR)
        this._renderer.outputColorSpace = THREE.SRGBColorSpace; // jak w mapie układu (tekstury sRGB)
        // Pipeline HDR jak w mapie układu: ACES + pełnoekranowy bloom (próg 1.0).
        // Rdzenie gwiazd świecą HDR (>1) → miękka poświata z poprawną okluzją
        // (bloom to post-process na WIDOCZNYCH pikselach — bliższa gwiazda zasłania
        // dalszą razem z poświatą; dokładnie problem, przez który usunięto sprite-glow).
        this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this._renderer.toneMappingExposure = 1.12;
        this._scene  = new THREE.Scene();
        this._scene.add(new THREE.AmbientLight(0xffffff, 1)); // by MeshBasicMaterial świecił
        this._camera = new THREE.PerspectiveCamera(FOV, wPx / hPx, 0.05, 5000);
        this._starGroup = new THREE.Group(); this._scene.add(this._starGroup);
        this._ringGroup = new THREE.Group(); this._scene.add(this._ringGroup);
        this._territoryGroup = new THREE.Group(); this._scene.add(this._territoryGroup);
        this._loadBackground();   // subtelne tło kosmiczne (async, ładuje się raz)
        // Composer: Render → Bloom(0.45, 0.3, próg 1.0) → OutputPass (ACES+sRGB).
        // Fallback przy błędzie: _composer=null → renderer.render (bez bloomu).
        try {
          const composer = new EffectComposer(this._renderer);
          composer.setSize(wPx, hPx);
          composer.addPass(new RenderPass(this._scene, this._camera));
          this._bloomPass = new UnrealBloomPass(new THREE.Vector2(wPx, hPx), 0.45, 0.0, 1.0);
          // radius=0 + jawne wagi mipów — bez „kwadratu" upsamplingu na czerni (jak mapa układu)
          try { this._bloomPass.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.7, 0.4, 0.15, 0.03]; } catch (e) {}
          composer.addPass(this._bloomPass);
          composer.addPass(new OutputPass());
          this._composer = composer;
        } catch (e) {
          console.warn('[StratcomGalaxyRenderer] HDR composer init failed — direct render:', e);
          this._composer = null;
        }
      } catch (e) {
        console.warn('[StratcomGalaxyRenderer] WebGL init failed:', e);
        this._failed = true;
        return false;
      }
    }
    if (wPx !== this._wPx || hPx !== this._hPx) {
      this._wPx = wPx; this._hPx = hPx;
      this._renderer.setSize(wPx, hPx, false);
      this._composer?.setSize(wPx, hPx);   // resizuje też UnrealBloomPass
      this._camera.aspect = wPx / hPx;
      this._camera.updateProjectionMatrix();
    }
    return true;
  }

  // ── Tło kosmiczne: PNG + scene.backgroundIntensity (zamiast canvas-multiply).
  // Jedna ścieżka zarządzana kolorami — bez ręcznego przetwarzania obrazu;
  // jasność regulowana na żywo przez BG_BRIGHTNESS.
  // Screen-fixed (scene.background) — nie obraca się z kamerą; dla ciemnej mgławicy OK.
  _loadBackground() {
    if (this._bgTried || !this._scene) return;
    this._bgTried = true;
    new THREE.TextureLoader().load(
      BG_URL,
      (tex) => {
        if (!this._scene) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;   // bez mip-blura drobnego pola gwiazd
        tex.generateMipmaps = false;
        tex.anisotropy = 8;
        this._bgTexture = tex;
        this._scene.background = tex;
        this._scene.backgroundIntensity = BG_BRIGHTNESS;
      },
      undefined,
      () => { /* brak pliku → zostaje sam clearColor (czerń) */ },
    );
  }

  // systems: [{ id, x, y, z, colorHex, glowColorHex, isHome, dim, luminosity }]
  // Rebuild tylko gdy zmienia się zestaw lub flagi dim/home (sygnatura).
  setSystems(systems) {
    if (!this._starGroup) return;
    const sig = systems.map(s => `${s.id}:${s.dim ? 1 : 0}:${s.isHome ? 1 : 0}`).join('|');
    if (sig === this._sig && this._starGroup.children.length) return;
    this._sig = sig;

    // Rozrzut → jednostka rozmiaru gwiazd + domyślny dystans kamery
    let maxR = 0;
    for (const s of systems) {
      const d = Math.hypot(s.x ?? 0, s.y ?? 0, s.z ?? 0);
      if (d > maxR) maxR = d;
    }
    const unit = Math.max(0.35, maxR * 0.022);   // promień bazowy gwiazdy (j. galaktyczne)
    this.fitDist = Math.max(8, maxR * 2.4 + unit * 10);

    this._disposeGroup(this._starGroup);
    for (const s of systems) this._addStar(s, unit);
  }

  _addStar(s, unit) {
    const g = new THREE.Group();
    // Mapowanie galaktyka→Three: X=x, Y=z(wysokość), Z=y (płaski dysk na XZ)
    g.position.set(s.x ?? 0, s.z ?? 0, s.y ?? 0);

    const dimF   = s.dim ? 0.5 : 1.0;
    const spec   = s.spectralType || 'G';
    const stData = STAR_TYPES[spec] || STAR_TYPES.G;
    const color  = new THREE.Color(s.colorHex ?? stData.color ?? 0xffffff);

    // ── Rdzeń: opakowa sfera z teksturą gwiazdy (jak w mapie układu 3D) ──
    // gl_FragColor.a = uAlpha (1.0 dla zbadanych) + depthWrite → bliższa gwiazda
    // ZASŁANIA dalszą = koniec przebijania. Limb darkening + prześwietlone centrum +
    // Reinhard tone map = realna powierzchnia gwiazdy. (Niezbadane: dimF=0.5 = widmo.)
    const rCore   = (s.isHome ? 0.58 : 0.43) * unit;
    const texType = stData.texType || `star_${spec}`;
    const variant = (hashCode(String(s.id || 'star')) % TEXTURE_VARIANTS) + 1;
    const tex     = loadStarTextures(texType, variant);
    const coreMat = new THREE.ShaderMaterial({
      transparent: false,   // ZAWSZE nieprzezroczysta → depthWrite → TWARDA okluzja
      uniforms: {
        uEmission:   { value: tex.emission },
        uColor:      { value: color },
        uBrightness: { value: 2.6 },   // HDR (>1) → rdzeń przekracza próg bloomu 1.0 = miękka poświata
        uDim:        { value: dimF },   // przygaszenie niezbadanych JASNOŚCIĄ (nie przezroczystością!)
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vViewDir; varying vec2 vUv;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }`,
      fragmentShader: `
        uniform sampler2D uEmission; uniform vec3 uColor;
        uniform float uBrightness; uniform float uDim;
        varying vec3 vNormal; varying vec3 vViewDir; varying vec2 vUv;
        void main() {
          vec3 emTex = texture2D(uEmission, vUv).rgb;
          float lum = dot(emTex, vec3(0.299, 0.587, 0.114));
          float NdotV = max(dot(vNormal, vViewDir), 0.0);
          float limb   = 0.6 + 0.4 * pow(NdotV, 0.7);          // kształt sfery (krawędzie ciemniejsze)
          float detail = mix(0.78, 1.22, lum);                 // subtelny detal powierzchni (przy zbliżeniu)
          vec3 base = uColor * uBrightness * limb * detail;    // KOLOR typu dominuje (HDR — bloom w kolorze typu)
          base += vec3(1.0) * pow(NdotV, 10.0) * 0.5 * uBrightness;  // WĄSKIE gorące centrum (skalowane HDR)
          base = max(base, uColor * 0.45);                     // nigdy nie czarna
          base *= uDim;                                        // przygaszenie niezbadanych (wciąż OPAQUE)
          gl_FragColor = vec4(max(base, 0.0), 1.0);            // BEZ clampu — ACES+bloom na composerze; alpha=1 → zasłania
        }`,
    });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(rCore, 24, 24), coreMat));
    // Brak osobnej poświaty-sprite: była ADDITYWNA/półprzezroczysta i to ona „przebijała".
    // Gorące centrum daje już sam shader sfery. (Glow z poprawną głębią → ewentualnie bloom.)

    // ── Słupek (riser): pionowa szpilka od rzutu na dysk (Y=0) do gwiazdy (Y=z) — pokazuje
    //    wysokość galaktyczną „z" jako głębię BEZ brył. depthWrite:false → nie okluduje;
    //    opaque sfera zasłania odcinek wewnątrz rdzenia. Sierota w _starGroup (dispose z grupą). ──
    const zH = s.z ?? 0;
    if (Math.abs(zH) > 1e-3) {
      const re = riserEndpoints(s.x ?? 0, s.y ?? 0, zH);   // Three: base=(x,0,y), top=(x,z,y)
      const riserGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(re.base.x, re.base.y, re.base.z),
        new THREE.Vector3(re.top.x,  re.top.y,  re.top.z),
      ]);
      const riserMat = new THREE.LineBasicMaterial({
        color: RISER_COLOR, transparent: true, opacity: RISER_OPACITY * dimF, depthWrite: false,
      });
      this._starGroup.add(new THREE.Line(riserGeo, riserMat));
      // Kropka u podstawy słupka — rzut gwiazdy na dysk (czytelna pozycja XY, gdy z ją unosi).
      const baseDot = new THREE.Mesh(
        new THREE.CircleGeometry(unit * 0.18, 16),
        new THREE.MeshBasicMaterial({ color: RISER_COLOR, transparent: true, opacity: Math.min(1, RISER_OPACITY + 0.2) * dimF, depthWrite: false, side: THREE.DoubleSide }),
      );
      baseDot.position.set(re.base.x, re.base.y, re.base.z);   // (x, 0, y) na dysku
      baseDot.rotation.x = -Math.PI / 2;                        // płasko na dysk XZ
      this._starGroup.add(baseDot);
    }

    this._starGroup.add(g);
  }

  _glowTex(hex) {
    if (this._glowCache.has(hex)) return this._glowCache.get(hex);
    const S = 128;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d');
    const col = new THREE.Color(hex);
    const r = (col.r * 255) | 0, g = (col.g * 255) | 0, b = (col.b * 255) | 0, h = S / 2;
    // Kolorowa korona (bez dominującego białego — gorące centrum daje rdzeń-shader)
    const gr = ctx.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0,    `rgba(${r},${g},${b},0.45)`);
    gr.addColorStop(0.22, `rgba(${r},${g},${b},0.22)`);
    gr.addColorStop(0.55, `rgba(${r},${g},${b},0.06)`);
    gr.addColorStop(1,    `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    this._glowCache.set(hex, t);
    return t;
  }

  // Pierścienie zasięgu na płaszczyźnie dysku (centrum = origin/home).
  setRangeRings(radii, colorHex = 0x33ffb4) {
    if (!this._ringGroup) return;
    const want = radii.join(',') + ':' + colorHex;
    if (want === this._ringSig) return;
    this._ringSig = want;
    this._disposeGroup(this._ringGroup);
    const N = 96;
    for (const rr of radii) {
      if (rr <= 0) continue;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: colorHex, transparent: true, opacity: 0.15, depthWrite: false,
      });
      this._ringGroup.add(new THREE.Line(geo, mat));
    }
  }

  // Warstwa polityczna (strefy wpływów): płaszczyzna tint (CanvasTexture z masek 'full')
  // + przerywane izolinie (LineDashedMaterial). payload = { sig, fillAlpha, layers:[
  //   { colorHex, mode:'full'|'outline', mask:Uint8, maskBounds:{x0,y0,cell,nx,ny}, loops:[{pts:[{x,y}]}] } ] }
  // Fog-of-war i wybór warstw robi overlay (resolveTerritoryVisibility) — TA SAMA logika co 2D.
  setTerritory(payload) {
    if (!this._territoryGroup) return;
    const sig = payload?.sig ?? '';
    if (sig === this._territorySig) return;   // rebuild tylko przy zmianie
    this._territorySig = sig;
    this._disposeGroup(this._territoryGroup);
    if (this._territoryTex) { this._territoryTex.dispose(); this._territoryTex = null; }
    this._territoryDashMats = [];
    const layers = payload?.layers ?? [];
    if (!layers.length) return;

    // ── Płaszczyzna: composite masek 'full' → CanvasTexture → PlaneGeometry (y≈-0.02) ──
    const full = layers.filter(l => l.mode === 'full' && l.mask && l.maskBounds);
    if (full.length) {
      const mb = full[0].maskBounds;   // wspólna siatka (TerritoryField)
      const cv = document.createElement('canvas'); cv.width = mb.nx; cv.height = mb.ny;
      const cctx = cv.getContext('2d');
      const alpha = payload.fillAlpha ?? 0.07;
      const cfg = GAME_CONFIG.TERRITORY ?? {};
      const fullA = Math.round(alpha * 255);   // H4: „rozlane światło" (poolFillAlpha) zamiast binarnego
      for (const l of full) {
        const lc = document.createElement('canvas'); lc.width = mb.nx; lc.height = mb.ny;
        const lctx = lc.getContext('2d'); const img = lctx.createImageData(mb.nx, mb.ny);
        const col = new THREE.Color(l.colorHex);
        const r = (col.r*255)|0, g = (col.g*255)|0, b = (col.b*255)|0;
        for (let k = 0; k < l.mask.length; k++) {
          const m = l.mask[k];   // H4: alpha „rozlanego światła" — jasny rdzeń → gasnący front
          const av = poolFillAlpha(m, fullA, cfg);
          if (av > 0) { const o = k*4; img.data[o]=r; img.data[o+1]=g; img.data[o+2]=b; img.data[o+3]=av; }
        }
        lctx.putImageData(img, 0, 0);
        cctx.drawImage(lc, 0, 0);   // source-over — nakładanie się stref blenduje
      }
      const tex = new THREE.CanvasTexture(cv);   // flipY=true (default) → wiersz j maski = world y0+j*cell
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      this._territoryTex = tex;
      const worldW = (mb.nx - 1) * mb.cell, worldH = (mb.ny - 1) * mb.cell;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(worldW, worldH),
        // DoubleSide: kamera Stratcomu schodzi pod dysk → strefy widoczne też od spodu.
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      plane.rotation.x = -Math.PI / 2;                                   // na dysk XZ (Three y=0)
      plane.position.set(mb.x0 + worldW/2, -0.02, mb.y0 + worldH/2);     // offset pod pierścieniami zasięgu
      plane.renderOrder = -1;                                            // pod gwiazdami
      this._territoryGroup.add(plane);
    }

    // ── Izolinie: THREE.Line + LineDashedMaterial (computeLineDistances WYMAGANE) ──
    // Tagowane userData (ownerId/atWar/baseOpacity) — war-pulse + merge-flash w render() (B6).
    this._territoryLines = [];
    for (const l of layers) {
      const baseCol = new THREE.Color(l.mode === 'outline' ? 0x8a8a8a : l.colorHex);
      for (const loop of (l.loops ?? [])) {
        if (!loop.pts || loop.pts.length < 2) continue;
        const pts = loop.pts.map(p => new THREE.Vector3(p.x, 0.0, p.y));
        pts.push(pts[0].clone());   // domknięcie pętli
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const col = loop.contested ? baseCol.clone().lerp(new THREE.Color(0xffffff), 0.35) : baseCol;   // sporne jaśniej
        const baseOpacity = loop.contested ? 1.0 : 0.9;
        const mat = new THREE.LineDashedMaterial({ color: col.getHex(), dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: baseOpacity, depthWrite: false });
        this._patchDashOffset(mat);
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        line.userData = { ownerId: l.ownerId, atWar: !!l.atWar, baseOpacity };
        this._territoryLines.push(line);
        this._territoryGroup.add(line);
      }
      // H4: wewnętrzne warstwice (rdzeń) — ciaśniejsze pętle, solid, ciemniejsze niż izolinia.
      // Statyczne (bez dash/war-pulse) → NIE do _territoryLines; dispose przez _disposeGroup.
      for (const c of (l.contours ?? [])) {
        for (const loop of c.loops) {
          if (!loop.pts || loop.pts.length < 2) continue;
          const pts = loop.pts.map(p => new THREE.Vector3(p.x, 0.0, p.y));
          pts.push(pts[0].clone());
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({ color: baseCol.getHex(), transparent: true, opacity: 0.22, depthWrite: false });
          this._territoryGroup.add(new THREE.Line(geo, mat));
        }
      }
    }
  }

  // Współczynniki rozbłysku (Map ownerId→0..1) ustawiane per-frame przez overlay (merge-flash).
  setTerritoryFlash(factors) { this._territoryFlash = factors; }

  // r0.171 LineDashedMaterial NIE ma dashOffset → wstrzykujemy uniform onBeforeCompile.
  // Fallback: gdy string shadera się nie zgadza → statyczny dash (2D animuje) — udokumentowane.
  _patchDashOffset(mat) {
    mat.onBeforeCompile = (shader) => {
      const target = 'if ( mod( vLineDistance, totalSize ) > dashSize ) {';
      if (!shader.fragmentShader.includes(target)) return;   // fallback: statyczny dash
      shader.uniforms.uDashOffset = { value: 0 };
      shader.fragmentShader = 'uniform float uDashOffset;\n' + shader.fragmentShader.replace(
        target, 'if ( mod( vLineDistance + uDashOffset, totalSize ) > dashSize ) {');
      mat.userData._dashShader = shader;
      this._territoryDashMats.push(mat);
    };
  }

  // Kamera orbitalna sferyczna (yaw=theta, pitch=phi, dist). Target domyślnie origin.
  // Pozycja liczona w czystym HolotableCamera.orbitPosition (headless-testowalne; ten
  // sam clamp pitcha 0.12..π-0.12 i ta sama formuła co dotychczas).
  setCameraOrbit(yaw, pitch, dist, target = null) {
    if (!this._camera) return;
    const tx = target?.x ?? 0, ty = target?.y ?? 0, tz = target?.z ?? 0;
    const p = orbitPosition(yaw, pitch, dist, target);
    this._camera.position.set(p.x, p.y, p.z);
    this._camera.lookAt(tx, ty, tz);
    this._camera.updateMatrixWorld();
  }

  render(wPx, hPx) {
    if (!this._ensure(wPx, hPx)) return false;
    const now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    if (this._territoryDashMats.length) {
      const off = -now * TERRITORY_DASH_SPEED;
      for (const m of this._territoryDashMats) { const s = m.userData._dashShader; if (s?.uniforms?.uDashOffset) s.uniforms.uDashOffset.value = off; }
    }
    // War-pulse (izolinia wroga w stanie wojny) + merge-flash (po zroście bąbli) — B6.
    if (this._territoryLines.length) {
      const pulse = 0.45 + 0.55 * Math.abs(Math.sin(now * Math.PI));   // ~2 s
      for (const line of this._territoryLines) {
        const u = line.userData;
        let op = u.atWar ? pulse : u.baseOpacity;
        const fl = this._territoryFlash?.get?.(u.ownerId) ?? 0;
        if (fl > 0) op = Math.min(1, op + 0.5 * fl);
        line.material.opacity = op;
      }
    }
    // Pipeline HDR: Render → Bloom(próg 1.0) → OutputPass (ACES+sRGB).
    // Fallback: bezpośredni render (ACES aplikuje renderer, brak bloomu).
    if (this._composer) this._composer.render();
    else this._renderer.render(this._scene, this._camera);
    return true;
  }

  // Rzut świata (Three: wx, wy=wysokość, wz) → panel-LOGICZNE px {x, y, behind}.
  // wLogical/hLogical = logiczny rozmiar panelu (NIE device px) — chrome rysowany
  // jest w logicznych jednostkach overlayu.
  projectXYZ(wx, wy, wz, wLogical, hLogical) {
    if (!this._camera) return { x: 0, y: 0, behind: true };
    const v = new THREE.Vector3(wx, wy, wz).project(this._camera);
    return {
      x: (v.x * 0.5 + 0.5) * wLogical,
      y: (-v.y * 0.5 + 0.5) * hLogical,
      behind: v.z > 1 || v.z < -1,
    };
  }
  project(sys, wLogical, hLogical) {
    return this.projectXYZ(sys.x ?? 0, sys.z ?? 0, sys.y ?? 0, wLogical, hLogical);
  }

  _disposeGroup(group) {
    if (!group) return;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const o = group.children[i];
      o.traverse?.(ch => {
        if (ch.geometry) ch.geometry.dispose();
        if (ch.material) {
          // Glow tekstury są współdzielone w _glowCache — NIE dispose'uj tu.
          if (Array.isArray(ch.material)) ch.material.forEach(m => m.dispose());
          else ch.material.dispose();
        }
      });
      group.remove(o);
    }
  }

  dispose() {
    this._disposeGroup(this._starGroup);
    this._disposeGroup(this._ringGroup);
    this._disposeGroup(this._territoryGroup);
    if (this._territoryTex) { this._territoryTex.dispose(); this._territoryTex = null; }
    for (const t of this._glowCache.values()) t.dispose();
    this._glowCache.clear();
    if (this._bgTexture) { this._bgTexture.dispose(); this._bgTexture = null; }
    this._bgTried = false;
    if (this._composer) { this._composer.dispose?.(); this._composer = null; }
    this._bloomPass = null;
    if (this._renderer) {
      this._renderer.forceContextLoss?.();
      this._renderer.dispose();
      this._renderer = null;
    }
    this._scene = null; this._camera = null; this._canvas = null;
    this._starGroup = null; this._ringGroup = null; this._territoryGroup = null;
    this._sig = ''; this._ringSig = ''; this._territorySig = '';
    this._territoryDashMats = []; this._territoryLines = []; this._territoryFlash = null;
  }
}
