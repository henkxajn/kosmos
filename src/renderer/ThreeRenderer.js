// Renderer Three.js — główna scena 3D układu słonecznego
// Wzorowany na space_4x_prototype.html
//
// Układ współrzędnych:
//   Fizyka gry: planet.x/y w jednostkach AU × 110
//   Three.js:   planet.x/y podzielone przez WORLD_SCALE (= 10)
//   → 1 AU = 11 jednostek Three.js (podobnie jak prototyp: dist 8-54)

import * as THREE         from 'three';
import { GLTFLoader }     from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }     from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import EventBus           from '../core/EventBus.js';
import EntityManager      from '../core/EntityManager.js';
import { GAME_CONFIG, STAR_TYPES } from '../config/GameConfig.js';
import { resolveTextureType, loadPlanetTextures, loadStarTextures, hashCode, TEXTURE_VARIANTS }
  from './PlanetTextureUtils.js';
import { RegionGenerator }    from '../map/RegionSystem.js';
import { BiomeMapGenerator }  from './BiomeMapGenerator.js';
import { PlanetShader }       from './PlanetShader.js';
import { GasGiantShader }    from './GasGiantShader.js';
import { ColonyBuildingMarkers } from './ColonyBuildingMarkers.js';
import { BUILDINGS, RESOURCE_ICONS } from '../data/BuildingsData.js';
import { loadAllTerrainTextures, texturesLoaded } from './TerrainTextures.js';
import { loadBuildingTextures } from './BuildingTextures.js';
import { vesselModelPath, vesselTargetSize, VESSEL_MODEL_DEFAULT }
  from './VesselModelResolver.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { buildShipEntry, toneColor } from '../ui/FleetPictureLogic.js';
import { THEME } from '../config/ThemeConfig.js';
import { gameplayToWorld } from '../utils/CoordTransform.js';
import { orbitalPositionAtDelta, futureMarkerDeltas, orbitTicksVisible } from '../ui/TacticalModeLogic.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { t } from '../i18n/i18n.js';
import {
  weaponColor as fxWeaponColor,
  FX_MAX_ACTIVE, FX_TRACER_MS, FX_FLASH_MS, FX_FLASH_DELAY_MS,
  FX_SHIELD_MS, FX_RING_MS, FX_PING_MS, FX_SHIELD_COLOR, FX_SCAN_COLOR,
} from '../config/CombatFxConfig.js';
import { resolveFxEndpointRaw, factionColorRaw, isEndpointVisibleByQuality,
  exhaustGradientColors, exhaustIntensityRaw, explosionColorRaw,
  EXPLOSION_RING_COLOR, WRECK_EMISSIVE_COLOR }
  from '../utils/VesselFxLogic.js';

const AU          = GAME_CONFIG.AU_TO_PX;   // 110
const WORLD_SCALE = 10;                      // dzielnik pozycji: AU×11 w 3D
// Warstwa selektywnego bloomu — obiekty tu przypisane (exhaust cone, wraki, eksplozje)
// bloomują; reszta sceny (gwiazda, tło, planety) NIE. Eliminuje niebieski veil na tle.
const BLOOM_LAYER = 1;
const S           = (v) => v / WORLD_SCALE; // skrót: skaluj pozycję
const SR          = (r) => r / WORLD_SCALE; // skaluj promień

const LIFE_GLOW_COL = 0x44ff88;

// ── Prediction cone (M2b C4) ────────────────────────────────────────────
// Wizualizacja niepewności intercept point: cyan trójkąt (fill + outline)
// per-vessel. Geom/mat tworzone raz, runtime tylko transform (scale.x =
// szerokość kąta, scale.z = długość zasięgu w world units).
const PREDICTION_CONE_FILL_COLOR  = 0x00ffff;
const PREDICTION_CONE_FILL_ALPHA  = 0.15;
const PREDICTION_CONE_LINE_COLOR  = 0x00ffff;
const PREDICTION_CONE_LINE_ALPHA  = 0.6;
const PREDICTION_CONE_BASE_ANGLE  = 0.5;   // rad — unit szerokości; runtime scale.x = angleWidth/baseAngle
const PREDICTION_CONE_Y           = 0.05;  // wysokość nad orbitami (Y=0), pod statkami (Y≥0.3)

// ── Sensor overlay (M4 P2) ──────────────────────────────────────────────
// Wzorzec 1:1 z prediction cones: per-vessel/per-colony Map cache, RingGeometry
// thin annulus (inner/outer w world units), MeshBasicMaterial transparent.
// Hook: vessel:positionUpdate (kolonie też re-syncowane — orbitują).
// Toggle: ui:sensorOverlayToggle event z BottomBar menu (radar row).
const SENSOR_RING_VESSEL_COLOR = 0x44ccff;  // cyan
const SENSOR_RING_COLONY_COLOR = 0xffcc44;  // amber/yellow
const SENSOR_RING_OPACITY      = 0.15;
const SENSOR_RING_SEGMENTS     = 96;        // gładkość okręgu
const SENSOR_RING_Y            = 0.04;      // tuż pod prediction cone (0.05), nad orbitami (0)
// Lv5 obserwatorium daje Infinity dla detection range — clamp do tej wartości
// żeby uniknąć NaN/over-the-horizon ring covering całej sceny.
const SENSOR_RING_MAX_COLONY_AU = 35.0;     // ≈ MAX_ORBIT_AU — cały układ widoczny

// ── Reforma obserwatorium — szara zasłona niezbadanego ciała (podgląd) ──
const BODY_VEIL_COLOR   = 0x8a8a99;         // szara mgła na niezbadanym ciele
const BODY_VEIL_OPACITY = 0.72;             // 0=widać, 1=ukryte (grey-out do czasu skanu)

// ── Marker wykrytego wroga (≥rumor) — pulsujący czerwony alert na mapie 3D ──
const ALERT_MARKER_COLOR = 0xff4466;        // czerwony (konwencja wroga, == factionColorRaw fallback)
const ALERT_MARKER_SCALE = 0.7;             // bazowa skala billboardu (encircle ~0.3 sprite statku)
const ALERT_MARKER_REF_DIST = 60;           // dystans kamery [WU] dający skalę bazową; dalej → skala rośnie (stały rozmiar ekranowy)
const TACTICAL_PING_COLOR      = 0x66ddff;  // F4 Dok: kolor ping-FX kliku wiersza (cyan, spójny z sensor ringiem)
const TACTICAL_PING_THROTTLE_MS = 180;      // F4 Dok: min. odstęp między pingami (koalescencja szybkich klików)
// 4f-2 — hover-podgląd trasy JEDNOZNACZNY: pełna nieprzezroczystość + jaśniejszy kolor + grubsza
// linia (linewidth honorowane tylko tam, gdzie GPU je wspiera; głównym leverem jest kolor+opacity).
// Bazowe linie w trybie Y lekko pogrubione podniesieniem bazowej opacity (0.4→0.55).
const ROUTE_LINE_HOVER_OPACITY = 1.0;       // F4 Dok: opacity routeLine statku pod kursorem doku
const ROUTE_LINE_BASE_OPACITY  = 0.55;      // baza materiału routeLine (mirror inline w tworzeniu; 4f-2 pogrub.)
const ROUTE_LINE_HOVER_COLOR   = 0x9fffe6;  // 4f-2: jasny cyan-biały dla trasy pod kursorem
const ROUTE_LINE_BASE_WIDTH    = 1;         // 4f-2: bazowa grubość (WebGL zwykle capuje do 1 px)
const ROUTE_LINE_HOVER_WIDTH   = 3;         // 4f-2: ×2+ grubość na hover (best-effort wg GPU)
// 4f-2 — puls „ducha ETA" statku pod kursorem: mocniejszy/szybszy (podgląd „który to statek").
const GHOST_PULSE_HOVER_MIN    = 0.35;      // dolna granica pulsu (głębszy kontrast)
const GHOST_PULSE_HOVER_MAX    = 1.0;       // górna granica pulsu (pełna jasność)
const GHOST_PULSE_HOVER_FREQ   = 7.5;       // częstotliwość pulsu (rad/s) — szybszy niż bazowy 3.2/6.0

// ── Fleet Command Console (Slice 0) — pierścień zaznaczenia/hover ────────────
// Slice 5 — cache tekstur insygniów per kolor frakcji (reuse, wzór ResourceIcons).
const _INSIGNIA_TEX_CACHE = new Map();      // colorHex → THREE.CanvasTexture

// ── POI sprites (M2b C7) ────────────────────────────────────────────────
// Wizualne markery 5 typów POI na mapie 3D: per-typ paleta cyan-shifted
// + symbol Unicode (Canvas → CanvasTexture → SpriteMaterial → THREE.Sprite).
// Texture cache per typ (5 textur total, reuse'owane przez wszystkie POI
// danego typu). Lifecycle event-driven (poi:created/deleted/updated) — bez
// per-frame sync (POI to obiekty static).
const POI_SPRITE_SIZE = 8;    // world units — POI na world-coord pozycjach (np. ~150 wu),
                              // kamera typowo 150+ wu od sprite'a; scale 0.6 dawał subpixel.
                              // Filip's visual review (post-C7): wartość 8 to balans widoczność
                              // vs nie-zaśmiecanie mapy. Vessele mają mniejszą scale (0.5-1.0)
                              // bo są blisko kamery (focus mode dist 0.5-3 wu).
const POI_SPRITE_Y    = 0.02; // tuż nad orbitami (Y=0), poniżej cone (Y=0.05) i vesseli (Y≥0.3)

const POI_TYPE_COLORS = Object.freeze({
  waypoint: 0x5588ff,  // cyan-blue (różny od cone cyan 0x00ffff)
  patrol:   0x33ff66,  // green
  picket:   0xff3333,  // red
  rally:    0xffaa22,  // amber
  ambush:   0xaa44ff,  // violet
});

const POI_TYPE_SYMBOLS = Object.freeze({
  waypoint: '⌖',
  patrol:   '↻',
  picket:   '⛨',
  rally:    '⊕',
  ambush:   '⊗',
});

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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setSize(W, H);
    // Supersampling ×1.5 (SSAA) — antyaliasing dla całej sceny 3D, w tym cienkich
    // linii orbit i kierunku lotu (gdzie MSAA bywa niewystarczający). Cap 2 = koszt
    // ograniczony. Composery (bloom/final) używają tego samego ratio (spójność RT↔ekran).
    this._pixelRatio = Math.min((window.devicePixelRatio || 1) * 1.5, 2);
    this.renderer.setPixelRatio(this._pixelRatio);
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
    this.camera = new THREE.PerspectiveCamera(55, W / H, 0.001, 5000);
    this.camera.position.set(0, 35, 50);
    this.camera.lookAt(0, 0, 0);

    // ── Post-processing: SELECTIVE bloom (tylko warstwa BLOOM_LAYER) ───────
    // Dwa composery (wzór three.js webgl_postprocessing_unreal_bloom_selective):
    //   bloomComposer  — renderuje TYLKO obiekty na BLOOM_LAYER (camera.layers.set),
    //                    reszta sceny niewidoczna → czarne tło → bloom liczony
    //                    wyłącznie z exhaust/wraków/eksplozji. renderToScreen=false.
    //   finalComposer  — pełna scena (clear 0x020405) + mixPass domieszkuje bloom +
    //                    OutputPass (linear→sRGB). renderuje na ekran.
    // Efekt: bloom NIE dotyka gwiazdy/tła/planet → zero niebieskiego veilu.
    // Antyaliasing: supersampling (setPixelRatio ×1.5 wyżej) — NIE MSAA na RT
    // (samples+HalfFloat = czarny prostokąt na części sterowników). Composery
    // dziedziczą pixelRatio renderera przez setPixelRatio.
    this._bloomComposer = null;
    this._finalComposer = null;
    this._bloomPass     = null;
    try {
      const pr = this._pixelRatio;

      // — bloomComposer (bloom-only) —
      const bloomRender = new RenderPass(this.scene, this.camera);
      bloomRender.clearColor = new THREE.Color(0x000000);  // czarne tło bloom-passu
      bloomRender.clearAlpha = 1;
      const bloomComposer = new EffectComposer(this.renderer);
      bloomComposer.renderToScreen = false;
      bloomComposer.setPixelRatio(pr);
      bloomComposer.setSize(W, H);
      bloomComposer.addPass(bloomRender);
      // threshold 0 — w bloom-passie widać TYLKO emitery (reszta czarna), więc
      // nie trzeba progować jasności; strength/radius sterują intensywnością glow.
      const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.8, 0.4, 0.0);
      bloomComposer.addPass(bloom);

      // — finalComposer (pełna scena + domieszka bloomu) —
      const finalRender = new RenderPass(this.scene, this.camera);
      finalRender.clearColor = new THREE.Color(0x020405);  // oryginalne tło sceny
      finalRender.clearAlpha = 1;
      const mixPass = new ShaderPass(
        new THREE.ShaderMaterial({
          uniforms: {
            baseTexture:  { value: null },
            bloomTexture: { value: bloomComposer.renderTarget2.texture },
          },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
            void main(){ gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }`,
        }),
        'baseTexture',
      );
      mixPass.needsSwap = true;
      const finalComposer = new EffectComposer(this.renderer);
      finalComposer.setPixelRatio(pr);
      finalComposer.setSize(W, H);
      finalComposer.addPass(finalRender);
      finalComposer.addPass(mixPass);
      finalComposer.addPass(new OutputPass());

      this._bloomComposer = bloomComposer;
      this._finalComposer = finalComposer;
      this._bloomPass     = bloom;
    } catch (err) {
      console.warn('[ThreeRenderer] Selective bloom init failed — fallback direct render:', err);
      this._bloomComposer = null;
      this._finalComposer = null;
    }

    // ── Obsługa zmiany rozmiaru okna ──────────────────────────
    window.addEventListener('resize', () => {
      const nW = window.innerWidth, nH = window.innerHeight;
      this.renderer.setSize(nW, nH);
      this._bloomComposer?.setSize(nW, nH);  // resizuje też UnrealBloomPass
      this._finalComposer?.setSize(nW, nH);  // renderTarget2 (bloomTexture) pozostaje ważny
      this.camera.aspect = nW / nH;
      this.camera.updateProjectionMatrix();
      this._applyFocusViewOffset();   // re-aplikuj przesunięcie podglądu obserwatorium (nowe wymiary)
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
    this._stations     = new Map();   // stationId → { mesh } (S3.3b-S2, anchored orbital object)
    this._predictionConeMeshes = new Map();  // vesselId → { fillMesh, lineMesh, group } (M2b C4)
    this._sensorRingMeshes     = new Map();  // key (`v_xxx` | `col_xxx`) → { mesh, type, radiusAU } (M4 P2)
    this._poiSprites           = new Map();  // poiId → { sprite, type } (M2b C7)
    this._poiTextureCache      = new Map();  // type → CanvasTexture (5 entries, M2b C7)
    this._tradeLines   = [];          // THREE.Line[] — linie handlu cywilnego

    // ── Fleet Command Console (Slice 0) — wspólny silnik FX + selekcja ──────
    // _activeEffects: efemeryczne efekty {mesh,startTime,lifetime,kind,...}
    //   drenowane co klatkę w _startLoop (real-time, niezależne od pauzy gry).
    // _fxGroup: leniwie tworzony Group (scena może jeszcze nie istnieć w ctor).
    this._activeEffects        = [];
    this._fxGroup              = null;
    this._selectedVesselId     = null;       // mirror UIManager (ui:selectionChanged)
    this._factionColorCache    = new Map();  // ownerEmpireId → 0xRRGGBB
    this._engagementMarkers    = new Map();  // encounterId → { mesh, geom, mat } (znacznik starcia, TTL)
    this._bodyVeil             = null;       // { bodyId, mesh, geom, mat } — szara zasłona niezbadanego ciała (podgląd obserwatorium)
    this._focusViewOffset      = null;       // { fracX, fracY } — przesunięcie widoku 3D w podglądzie obserwatorium
    this._observatoryPreviewActive = false;  // czy overlay obserwatorium jest otwarty (podgląd ciała)
    this._focusEncounterId     = null;       // Slice 1 — kamera śledzi midpoint bitwy
    this._insigniaSprites      = new Map();  // vesselId → Sprite (Slice 5 — insygnia frakcji, intel-gated)
    this._enemyAlertMarkers    = new Map();  // vesselId → Sprite (pulsujący czerwony marker wroga ≥rumor)
    this._tacticalGlyphs       = new Map();  // F2 tryb Y: vesselId → Sprite-glif (stały rozmiar ekranowy)
    this._tacticalHiddenModels = new Map();  // F2: vesselId → [dzieci wrappera ukryte na czas trybu]
    this._tacticalGhosts       = new Map();  // F2: vesselId → Sprite-duch ETA w punkcie celu misji
    this._tacticalHoverVid     = null;       // F4 Dok: vesselId pod kursorem w doku (hover-podgląd: routeLine jaśniej + puls ducha)
    this._tacticalHoverYear    = null;       // F4 Dok OŚ: rok pod kursorem na osi → marker pozycji planety celu w tym roku
    this._lastTacticalPingMs   = 0;          // F4 Dok: throttle ping-FX przy kliku wiersza
    this._tacticalOrbitStyled  = null;       // 2g: [{m, opacity, transparent}] — restore restyle orbit
    this._tacticalGrid         = null;       // 2g: Group — subtelna siatka taktyczna
    this._tacticalOrbitMarkers = new Map();  // 2g: klucz → Sprite (chevron/tik przyszłej pozycji/ETA)
    this._alertReticleTex      = null;       // współdzielona tekstura reticle (lazy)

    // ── Cache modeli 3D statków ─────────────────────────────────
    this._shipModelTemplates = new Map(); // modelPath → THREE.Group (oryginał)
    this._shipModelPromises  = new Map(); // modelPath → Promise — deduplikacja równoległych load
    this._missingModelPaths  = new Set(); // modelPath → brak pliku (route prosto do DEFAULT)
    this._gltfLoader = new GLTFLoader();
    // Preload — ładuj templaty GLB z wyprzedzeniem, żeby statki dostały model od razu.
    // Deduplikacja przez promise cache: równoczesne wywołania dla tego samego pliku
    // czekają na TEN SAM request (bez tego binary chunk GLB mógł się fragmentować).
    this._preloadShipModels();

    // ── Cywilne świetliki handlowe ───────────────────────────
    this._tradeFireflies   = [];     // Array of { sprite, route, t, speed }
    this._tradeFireflyTex  = null;   // współdzielona tekstura glow

    // ── Thumbnail cache (Observatory live preview) ──────────────
    this._thumbCache = new Map();    // bodyId → { dataUrl, timestamp }
    this._thumbRT    = null;         // współdzielony WebGLRenderTarget
    this._thumbScene = null;         // tymczasowa scena do thumbnailów
    this._thumbCam   = null;         // kamera do thumbnailów
    this._tradeRoutes      = [];     // dane tras: [{ fromId, toId, intensity, fromXZ, toXZ }]
    this._tradeFireflyPool = 60;     // max cząsteczek

    // ── Ikony budynków na planecie (widok kosmiczny, bliski zoom) ──
    this._colonyMarkers = new ColonyBuildingMarkers();

    // Tryb widoczności orbit: 'all' | 'planets_moons' | 'planetoids'
    this._orbitFilter = 'planetoids'; // domyślny — planetoidy widoczne, planety wg reguł

    // Współdzielona tekstura kropki życia — tworzona raz
    this._lifeDotTex    = ThreeRenderer._createLifeDotTexture();
    this._playerDotTex  = ThreeRenderer._createPlayerDotTexture();

    // ── Małe ciała i dysk ─────────────────────────────────────
    this._diskPoints      = null;
    this._smallBodyPoints = null;

    // ── Licznik do periodycznego odświeżania orbit ───────────
    this._orbitRebuildCounter = 0;
    // S3.4 FAZA 5 — stare romby _colonyLabels USUNIĘTE (zastąpione MapLabelLayer, overlay 2D).
    // Selekcja ciała działa przez raycast planety/księżyca (_entityByUUID), nie przez romb.

    // ── Gwiazda ───────────────────────────────────────────────
    this._star      = null;
    this._starGroup = null;
    this._starLight = null;
    this._starCoronaUniform  = null;  // referencja do uTime korony
    this._starTwinkleUniform = null;  // referencja do uTime migotania gwiazd tła
    this._starPromCount      = 0;     // liczba protuberancji

    // ── Faza D3: Sfera Dysona — wizualne pierścienie wokół gwiazdy ──
    this._dysonStage      = 0;
    this._dysonRingsGroup = null;
    // Zachowane oryginalne wartości lighta — restore przy stage 0 (dla idempotencji)
    this._starLightOrigColor     = 0xffeedd;
    this._starLightOrigIntensity = 1.5;

    // ── Raycaster ─────────────────────────────────────────────
    this._ray   = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._hoverPlanetId = null;

    // ── Śledzenie kamery (focus na planecie/księżycu/statku) ───────
    this._focusEntityId = null;
    this._focusVesselId = null;  // śledzenie statku w locie
    this._focusStationId = null; // S3.3b-S4a — focus kamery na stację (camera-only, bez selekcji)

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
      // M4 P2 — radar rings: colonies orbit z planetami, więc re-sync co physics tick
      // (vessel:positionUpdate nie odpala się gdy brak vesseli w ruchu).
      if (this._sensorRingMeshes.size > 0 || window.KOSMOS?.uiPrefs?.sensorOverlayVisible) {
        this._syncSensorOverlay();
      }
    }));

    // S3.3b-S2 — stacje orbitalne (encje, NIE vessele). Mesh dodawany/usuwany event-driven;
    // pozycja co klatkę przez _tickOrbitingStations (anchored → bez rotacji wokół planety).
    EventBus.on('station:created',   safe(({ station })   => this._addStationMesh(station)));
    EventBus.on('station:destroyed', safe(({ stationId }) => this._removeStationMesh(stationId)));

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
      const activeSys = window.KOSMOS?.activeSystemId ?? 'sys_home';
      // Pokaż sprite tylko jeśli statek jest w aktywnym układzie
      if (vessel.systemId && vessel.systemId !== activeSys) return;
      // Usuń stary sprite jeśli istnieje (np. redispatch z orbity)
      if (this._vessels.has(vessel.id)) {
        this._removeVesselSprite(vessel.id);
      }
      this._addVesselSprite(vessel);
    }));
    EventBus.on('vessel:returning', safe(({ vessel }) => {
      const activeSys = window.KOSMOS?.activeSystemId ?? 'sys_home';
      if (vessel.systemId && vessel.systemId !== activeSys) return;
      // Przebuduj sprite + linię trasy aby celowała w punkt powrotu
      if (this._vessels.has(vessel.id)) {
        this._removeVesselSprite(vessel.id);
      }
      this._addVesselSprite(vessel);
    }));
    EventBus.on('vessel:docked', safe(({ vessel }) => {
      if (this._focusVesselId === vessel.id) this._focusVesselId = null;
      this._removeVesselSprite(vessel.id);
    }));
    EventBus.on('vessel:positionUpdate', safe(({ vessels }) => {
      this._syncVesselPositions(vessels);
      this._syncPredictionCones();   // M2b C4 — origin/dir/scale per active intercept
      this._syncSensorOverlay();     // M4 P2 — radar rings (vessels + colonies)
    }));
    // M4 P2 — toggle radar z BottomBar; pełny re-sync (lub teardown gdy off)
    EventBus.on('ui:sensorOverlayToggle', safe(({ visible }) => {
      if (!visible) {
        this._disposeAllSensorRings();
      } else {
        this._syncSensorOverlay();
      }
    }));
    // M4 P3 hotfix — sensor range zmienia się gdy obserwatorium budowane/zburzone.
    // Bez tego sensor ring zostawał z poprzednim radiusem (stale visual).
    EventBus.on('planet:buildResult',     safe(() => this._syncSensorOverlay()));
    EventBus.on('planet:demolishResult',  safe(() => this._syncSensorOverlay()));
    EventBus.on('planet:upgradeResult',   safe(() => this._syncSensorOverlay()));
    // Fog-of-war — ObservatorySystem zmienia widoczność wrogiego statku.
    // M4 P2: deleguje do _applyVesselIntelVisibility — uwzględnia rumor ghost
    // (sprite może pozostać widoczny w positionLastKnown nawet gdy detected=false).
    EventBus.on('vessel:detectionChanged', safe(({ vesselId, detected }) => {
      const entry = this._vessels.get(vesselId);
      if (!entry) return;
      // Wraki są widoczne ZAWSZE (zniszczony statek nie ma mgły wojny)
      if (entry.isWreck) { entry.sprite.visible = true; return; }
      if (GAME_CONFIG.FEATURES.m4EnemyGhosts) {
        const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
        if (vessel) this._applyVesselIntelVisibility(vessel, entry);
      } else {
        entry.sprite.visible = !!detected;
        if (entry.routeLine) entry.routeLine.visible = !!detected;
      }
    }));
    // M4 P2 — intel quality zmienia się (proximity_observation / aged_out / manual).
    // Re-apply rendering pojedynczego vessela bez czekania na vessel:positionUpdate.
    EventBus.on('intel:vesselContactChanged', safe(({ vesselId }) => {
      const entry = this._vessels.get(vesselId);
      if (!entry) return;
      const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      if (vessel) this._applyVesselIntelVisibility(vessel, entry);
    }));
    // Wrak — zmiana wizualna (szary, bez linii trasy, orbituje statycznie wokół
    // planety. Wcześniej było "dryfuj statycznie" ale wrak lądował w środku mesh'a
    // planety (y=0.02 < promień planety) i znikał wizualnie).
    EventBus.on('vessel:wrecked', safe(({ vesselId, vessel }) => {
      const entry = this._vessels.get(vesselId);
      if (!entry) return;
      // Eksplozja w miejscu zniszczenia — PRZED zamianą na wrak (pozycja jeszcze
      // żywa). Gated fcCombatFx. Kula ognia + pierścień uderzeniowy (_spawnExplosion).
      if (GAME_CONFIG.FEATURES?.fcCombatFx) {
        this._spawnExplosion(entry.sprite.position, vesselTargetSize(vessel));
      }
      entry.isWreck = true;
      entry.sprite.visible = true;
      // Usuń linię trasy — wrak nie leci nigdzie
      if (entry.routeLine) {
        this.scene.remove(entry.routeLine);
        entry.routeLine.geometry?.dispose();
        entry.routeLine.material?.dispose();
        entry.routeLine = null;
      }
      // Orbit cache dla wraka — wyższa warstwa Y + wolna orbita + losowa faza.
      // To tworzy "cmentarzysko orbitalne" oddzielone wizualnie od żywych statków
      // gracza, które krążą na niskiej orbicie z typową prędkością.
      const dockedAt = vessel?.position?.dockedAt;
      if (dockedAt) {
        let bodyR = 0.06;
        const pEntry = this._planets.get(dockedAt);
        if (pEntry) {
          const ent = this._entityByUUID.get(pEntry.mesh.uuid);
          bodyR = ent ? this._getEntityRadius(ent) : 0.1;
        } else if (this._moons.has(dockedAt)) {
          bodyR = 0.03;
        } else if (this._planetoids.has(dockedAt)) {
          bodyR = 0.02;
        }
        entry._orbiting = {
          bodyId: dockedAt,
          orbitR: Math.max(0.5, bodyR * 6.0),
          isWreck: true,
          initAngle: Math.random() * Math.PI * 2,
        };
      } else {
        entry._orbiting = null;
      }
      // Wizualne — wypalony czarny z ledwo czerwoną poświatą. Wypiera rdzawy
      // odcień który za bardzo upodabniał wrak do naturalnego koloru cargo3d.glb.
      const wreckCol = new THREE.Color(0x1a1a1a);
      if (entry.isModel3D) {
        entry.sprite.traverse(child => {
          if (!child.isMesh || !child.material) return;
          const mat = child.material.clone();
          if (mat.color)    mat.color.copy(wreckCol);
          if (mat.emissive) {
            if (GAME_CONFIG.FEATURES?.fcCombatFx) {
              // Żarzący się wrak — dogorywające reaktory (mocna poświata + bloom).
              mat.emissive.setHex(WRECK_EMISSIVE_COLOR);
              if (mat.emissiveIntensity != null) mat.emissiveIntensity = 0.5;
            } else {
              mat.emissive.setHex(0x110000);  // legacy: ledwo widoczna czerwień
            }
          }
          if (mat.metalness != null) mat.metalness = 0.3;
          if (mat.roughness != null) mat.roughness = 1.0;
          if (mat.opacity != null)   mat.opacity   = 1.0;
          mat.transparent = false;
          child.material = mat;
          // Selective bloom — żarzący się wrak świeci (emissive w passie bloom).
          if (GAME_CONFIG.FEATURES?.fcCombatFx) child.layers.enable(BLOOM_LAYER);
        });
        // Losowy tilt — wrak przechylony, sygnalizuje uszkodzony kadłub
        entry.sprite.rotation.z = (Math.random() - 0.5) * 0.6;
        entry.sprite.rotation.x = (Math.random() - 0.5) * 0.4;
        entry.enemyTint = true;  // dispose cloned materials on remove
      } else if (entry.sprite.material) {
        // Sprite billboard — podmień teksturę na ikonę wraku (ciemnoszara + rdza)
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const c = canvas.getContext('2d');
        c.fillStyle = '#554438'; c.strokeStyle = '#221100'; c.lineWidth = 2;
        // Rysuj szczątki — złamany kadłub, odłamki
        c.fillRect(6, 14, 20, 5);
        c.fillRect(12, 6, 5, 20);
        c.strokeRect(6, 14, 20, 5);
        c.strokeRect(12, 6, 5, 20);
        c.fillStyle = '#663322';
        c.fillRect(4, 4, 3, 3);   // odłamek lewy góra
        c.fillRect(26, 26, 3, 3); // odłamek prawy dół
        const tex = new THREE.CanvasTexture(canvas);
        entry.sprite.material.map?.dispose?.();
        entry.sprite.material.map = tex;
        entry.sprite.material.opacity = 1.0;
        entry.sprite.material.transparent = true;  // sprite musi mieć transparent dla alfy PNG
        entry.sprite.material.needsUpdate = true;
        if (entry.tex) entry.tex.dispose();
        entry.tex = tex;
      }
    }));

    // ── M2b C7: POI sprites lifecycle (event-driven, brak per-frame sync) ──
    // Subskrypcje aktywne od konstruktora; CRUD POI po starcie auto-rejestruje
    // sprites. Restore z save'a — GameScene woła `initPOISpritesFromState()`
    // po `poiRegistry.initPOISubdomain()` (gameState.restore nie emituje
    // poi:created dla zsynchronizowanych POI).
    EventBus.on('poi:created', safe(({ poi }) => this._addPOISprite(poi)));
    EventBus.on('poi:deleted', safe(({ poiId }) => this._removePOISprite(poiId)));
    EventBus.on('poi:updated', safe(({ poiId, poi }) => this._updatePOISprite(poiId, poi)));

    // ── Handel cywilny: linie + świetliki ───────────────────
    EventBus.on('trade:connectionsUpdated', safe(({ connections }) => {
      this._updateTradeLines(connections);
      this._updateTradeFireflyRoutes(connections);
    }));

    // ── Śledzenie kamery po kliknięciu ciała ─────────────────
    EventBus.on('body:selected', safe(({ entity }) => {
      this._focusEntityId = entity.id;
      this._focusVesselId = null; // przerwij śledzenie statku
      this._focusStationId = null;
      // Księżyce — pozwól na głębszy zoom (r=0.015–0.04, potrzeba bliskiej kamery)
      if (this._cameraController) {
        this._cameraController.setMinDist(entity.type === 'moon' ? 0.15 : 0.3);
      }
      this._updateCameraFocus();
      // Auto-zoom na każde kliknięte ciało (oprócz gwiazdy)
      if (this._cameraController && entity.type !== 'star') {
        const r = this._getEntityRadius(entity);
        const idealDist = Math.max(r * 6, 0.8);
        // Zbliżaj gdy kamera daleko — nie cofaj jeśli gracz już blisko
        if (this._cameraController._targetDist > idealDist * 1.5) {
          this._cameraController.setTargetDist(idealDist);
        }
      }
      // Ikony budynków na kolonizowaną planetę
      const colMgr = window.KOSMOS?.colonyManager;
      if (colMgr?.hasColony(entity.id)) {
        const r = this._getEntityRadius(entity);
        const colony = colMgr.getColony(entity.id);
        const pEntry = this._planets.get(entity.id);
        if (colony?.grid && pEntry) {
          this._colonyMarkers.show(pEntry.group, r, colony.grid, entity.id);
        }
      } else {
        this._colonyMarkers.hide();
      }
      // Pokaż orbitę planetoidy po kliknięciu
      this._showPlanetoidOrbit(entity.id, 0.35);
      // Pokaż orbitę księżyca po kliknięciu (ukryta domyślnie)
      this._hideAllMoonOrbits();
      if (entity.type === 'moon') this._showMoonOrbit(entity.id);
      // Odśwież orbity — zaznaczona planeta dostaje złotą orbitę
      this._rebuildAllOrbits();
    }));

    EventBus.on('body:deselected', safe(() => {
      this._focusEntityId = null;
      this._focusVesselId = null;
      this._focusStationId = null;
      // Ukryj ikony budynków kolonii + tooltip
      this._colonyMarkers.hide();
      this._hideColonyTooltip();
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

    // Odśwież ikony budynków po budowie/rozbiórce (jeśli ta planeta jest focused)
    const refreshMarkers = () => {
      if (!this._colonyMarkers.entityId || !this._focusEntityId) return;
      const colony = window.KOSMOS?.colonyManager?.getColony(this._colonyMarkers.entityId);
      if (colony?.grid) this._colonyMarkers.refresh(colony.grid);
    };
    EventBus.on('planet:buildResult',          safe(refreshMarkers));
    EventBus.on('planet:demolishResult',       safe(refreshMarkers));
    EventBus.on('planet:constructionComplete', safe(refreshMarkers));

    // Fleet Command Console (Slice 0) — mirror zaznaczenia z UIManager
    // (wskaźnik = ramki 2D w UIManager._drawSelectionBrackets).
    EventBus.on('ui:selectionChanged', safe(({ vesselId }) => {
      this._selectedVesselId = vesselId ?? null;
    }));

    // Fleet Command Console (Slice 1) — smugi walki na żywej mapie (FX-only).
    EventBus.on('combat:roundFx', safe((p) => this._onCombatRoundFx(p)));

    // Fix#3 — bitwy orbitalne/abstrakcyjne (EnemyAttackHandler/WarSystem, „stare zasady",
    // statki niefizycznie blisko) NIE mają combat:roundFx. Syntezujemy „imitację" walki
    // (burst smug+błysków) przy planecie/celu, żeby walka była WIDOCZNA na mapie.
    EventBus.on('battle:resolved', safe((p) => this._onBattleResolvedFx(p)));

    // Slice 1 — łagodny auto-focus kamery gdy gracz wchodzi w starcie (wide framing).
    // Domyślnie ON (gracz chce widzieć bitwy); close-up = klik statku / „Obserwuj bitwę".
    EventBus.on('vessel:engaged', safe(({ sideA = [], sideB = [], location }) => {
      if (!GAME_CONFIG.FEATURES?.fcCombatFx) return;
      if (window.KOSMOS?.uiPrefs?.battleAutoFocus === false) return;
      const vm = window.KOSMOS?.vesselManager;
      const playerIn = [...sideA, ...sideB].some(id => {
        const v = vm?.getVessel?.(id); return v && !isEnemyVessel(v);
      });
      if (!playerIn || !this._cameraController) return;
      const p = location?.point;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      this._cameraController.focusOn(S(p.x), S(p.y));  // wide — nie slam zoom
      this._cameraController.setTargetDist(Math.min(this._cameraController._targetDist, 6));
    }));

    // Slice 1 — kamera „Obserwuj bitwę" (mirror vessel:focus, close-up na midpoint).
    EventBus.on('camera:watchBattle', safe(({ x, y }) => {
      if (!this._cameraController || !Number.isFinite(x) || !Number.isFinite(y)) return;
      this._focusEntityId = null; this._focusVesselId = null; this._focusStationId = null;
      this._focusEncounterId = { x, y };
      this._cameraController.setMinDist(0.005);  // bliski zoom — można obejrzeć model
      this._cameraController.focusOnInstant(S(x), S(y), 0.3);
      this._cameraController.setTargetDist(Math.min(this._cameraController._targetDist, 1.2));
    }));

    // Slice 2 — efekty skanu (snop + pierścień + ping ukończenia). Eventy już lecą.
    EventBus.on('expedition:reconProgress', safe((p) => this._onReconProgress(p)));
    EventBus.on('expedition:reconComplete', safe((p) => {
      if (!GAME_CONFIG.FEATURES?.fcScanFx) return;
      const disc = p?.discovered;
      if (Array.isArray(disc)) for (const b of disc) if (b && Number.isFinite(b.x)) this._spawnScanPing(b.x, b.y);
    }));
    EventBus.on('observatory:discovered', safe((p) => {
      if (!GAME_CONFIG.FEATURES?.fcScanFx) return;
      const b = p?.body;
      if (b && Number.isFinite(b.x)) this._spawnScanPing(b.x, b.y);
    }));

    // Slice 6 — pulsy startu/przybycia (satysfakcjonujące sprzężenie zwrotne ruchu).
    EventBus.on('vessel:launched', safe(({ vessel }) => this._spawnMovementPulse(vessel, 0x88ffcc)));
    EventBus.on('vessel:arrived',  safe(({ vessel }) => this._spawnMovementPulse(vessel, 0x88ddff)));
    EventBus.on('vessel:docked',   safe(({ vessel }) => this._spawnMovementPulse(vessel, 0x88ddff)));

    // Centruj kamerę na statku (kliknięcie w liście floty / Outliner)
    EventBus.on('vessel:focus', safe(({ vesselId }) => {
      if (!this._cameraController) return;
      const entry = this._vessels.get(vesselId);
      if (entry) {
        // Statek w locie/orbicie — śledź go (co klatkę, bez lerpa)
        const pos = entry.sprite.position;
        this._focusEntityId = null;
        this._focusVesselId = vesselId;
        this._focusStationId = null;
        this._focusEncounterId = null;
        // Fix#5: minDist 0.005→0.05 (najbliższy nie absurdalnie blisko), auto-zoom do
        // POŚREDNIEGO ~0.9 (model widoczny + kontekst); gracz może doscrollować bliżej.
        this._cameraController.setMinDist(0.05);
        this._cameraController.focusOnInstant(pos.x, pos.z, pos.y);
        this._cameraController.setTargetDist(Math.min(this._cameraController._targetDist, 0.9));
      } else {
        // Statek zadokowany (brak sprite'a — schowany w hangarze/stacji) — centruj na ciele/stacji dokowania.
        const vessel = window.KOSMOS?.vesselManager?.getVessel(vesselId);
        const dockedAt = vessel?.position?.dockedAt;
        if (dockedAt) {
          // 4f-4 — dok przy STACJI: statek nie ma sprite'a, więc fokusujemy stację istniejącym
          // kanałem station:focus (kamera na stację; mirror kliku etykiety/mesh stacji).
          if (this._stations.has(dockedAt)) {
            EventBus.emit('station:focus', { stationId: dockedAt });
            return;
          }
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

    // Centruj kamerę na stacji (klik w scenie 3D) — TYLKO kamera, BEZ selekcji/panelu (S3.3b-S4a).
    // Mirror vessel:focus; _updateCameraFocus śledzi stację co klatkę (anchored, ale planeta orbituje).
    EventBus.on('station:focus', safe(({ stationId }) => {
      if (!this._cameraController) return;
      const entry = this._stations.get(stationId);
      if (!entry?.mesh) return;
      const pos = entry.mesh.position;
      this._focusEntityId  = null;   // przerwij focus ciała
      this._focusVesselId  = null;   // przerwij focus statku
      this._focusStationId = stationId;
      this._cameraController.setMinDist(0.005);  // bliski zoom — można podziwiać stację
      this._cameraController.focusOnInstant(pos.x, pos.z, pos.y);
      this._cameraController.setTargetDist(Math.min(this._cameraController._targetDist, 0.3)); // framing — tunable
    }));

    // Zmiana trybu widoczności orbit (z menu)
    EventBus.on('orbits:filterChanged', safe(({ mode }) => {
      this.setOrbitFilter(mode);
    }));

    // Hover na ciało → pokaż orbitę tymczasowo (planeta/planetoid) + HZ (gwiazda)
    EventBus.on('planet:hover', safe(({ entityId }) => {
      // Przywróć domyślną widoczność orbit planetoidów (nie zaznaczonych)
      const showPlanetoids = this._orbitFilter === 'all' || this._orbitFilter === 'planetoids';
      this._planetoidOrbits.forEach((line, id) => {
        if (id !== this._focusEntityId) {
          line.material.opacity = 0.12;
          line.visible = showPlanetoids;
        }
      });
      if (entityId) this._showPlanetoidOrbit(entityId, 0.20);

      // Hover na planetę → pokaż jej orbitę złotą tymczasowo
      this._orbits.forEach((line, id) => {
        if (id === this._focusEntityId) return; // zaznaczona — nie ruszaj
        if (id === entityId) {
          line.visible = true;
          line.material.color.setHex(0xffc832);
          line.material.opacity = 0.5;
        } else {
          // Przywróć domyślny stan (ukryta chyba że home/kolonia)
          this._restoreOrbitDefaults(id, line);
        }
      });
    }));
  }

  // ── Inicjalizacja układu ─────────────────────────────────────
  initSystem(star, planets, planetesimals, moons = []) {
    // Ładuj tekstury terenu — po załadowaniu przebuduj diffuse planet
    loadAllTerrainTextures().then(() => this._rebakePlanetTextures());
    // Ładuj tekstury PNG budynków dla mapy 2D kolonii (async, cichy fallback do emoji)
    loadBuildingTextures();

    this.renderStar(star);
    planets.forEach(p => this.addPlanetMesh(p));
    moons.forEach(m => this._addMoonMesh(m));
    this._initPlanetoids();
    this._rebuildAllOrbits();
    if (planetesimals?.length > 0) this._updateDiskPoints(planetesimals);
    // Skala 3D ↔ tactical — ramkuj kamerę do zasięgu układu. Przy starcie kontroler
    // jeszcze niewpięty (no-op) → setCameraController woła to ponownie; przy switchSystem
    // kontroler już jest → ramka odświeża się na nowy układ.
    this._frameActiveSystem();
  }

  // ── Przełączanie układu gwiezdnego (dispose + reinit) ──────────────────
  // Wywoływane przez StarSystemManager.switchActiveSystem()
  switchSystem(star, planets, planetesimals, moons = []) {
    this._disposeAllMeshes();
    this.initSystem(star, planets, planetesimals, moons);
    this._restoreActiveSystemVesselSprites();
    this._restoreActiveSystemStations();   // 4f-B: stacje aktywnego układu wracają po switchSystem
    // F2/2g: tryb taktyczny przeżywa zmianę układu (chip-switch w trybie Y) —
    // stare materiały orbit zdisposowane ze sceną → restyle świeżych + nowa siatka;
    // markery ruchu starego układu sprzątnięte (odbudują się w syncu).
    if (window.KOSMOS?.tacticalMode?.isActive) {
      this._disposeTacticalGrid();
      this._disposeAllTacticalOrbitMarkers();
      this._tacticalOrbitStyled = null;
      this.setTacticalStyle(true);
    }
  }

  // Slice 1e (Obraz Operacyjny F1) — po przebudowie sceny statki aktywnego układu
  // wracają NATYCHMIAST. _disposeAllMeshes czyści _vessels, a lazy re-add w
  // _syncVesselPositions działa dopiero na vessel:positionUpdate (tick czasu) —
  // przy PAUZIE po powrocie do układu sprite'y nie istniały → getVesselScreenPosition
  // zwracał null → plakietki/strzałki/klastry znikały (chipy zostawały, bo nie
  // potrzebują pozycji). Idempotentne (_addVesselSprite guard na istniejący entry);
  // docked pomijane (hangar — spójnie z _syncVesselPositions).
  _restoreActiveSystemVesselSprites() {
    const vm = window.KOSMOS?.vesselManager;
    if (!vm?.getAllVessels) return;
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    for (const v of vm.getAllVessels()) {
      if (v.systemId !== sysId) continue;
      if (v.position?.state === 'docked') continue;
      this._addVesselSprite(v);
    }
  }

  // Śledztwo znikającej stacji — KANDYDAT B (fix): _disposeAllMeshes czyści _stations, a
  // `station:created` NIE re-firuje przy switchSystem → stacja gracza znikała NA STAŁE po
  // przełączeniu na inny układ (chip) i powrocie. Mirror _restoreActiveSystemVesselSprites:
  // po przebudowie sceny re-dodaj stacje aktywnego układu. Idempotentne (_addStationMesh
  // guard na _stations.has), więc bezpieczne przy wielokrotnym wywołaniu / spójne z reszcie.
  _restoreActiveSystemStations() {
    const ss = window.KOSMOS?.stationSystem;
    if (!ss?.getAllStations) return;
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    for (const st of ss.getAllStations()) {
      if ((st.systemId ?? 'sys_home') !== sysId) continue;
      this._addStationMesh(st);
    }
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

    // Stacje orbitalne (S3.3b-S2) — dispose Group (hub + ring) i wyczyść mapę
    for (const [, entry] of this._stations) {
      if (entry.mesh) {
        entry.mesh.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        this.scene.remove(entry.mesh);
      }
    }
    this._stations.clear();

    // Trade lines + fireflies
    this._clearTradeLines();
    this._clearTradeFireflies();

    // Gwiazda
    if (this._starGroup) {
      this._starGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this.scene.remove(this._starGroup);
      this._starGroup = null;
    }

    // Faza D3: dispose pierścieni Sfery Dysona razem z gwiazdą
    if (this._dysonRingsGroup) {
      this._dysonRingsGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this.scene.remove(this._dysonRingsGroup);
      this._dysonRingsGroup = null;
      this._dysonStage = 0;
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

    // Prediction cones (M2b C4) — switchSystem nie zostawia ghost mesh
    this._disposeAllPredictionCones();

    // Sensor rings (M4 P2) — switchSystem nie zostawia ghost ringów
    this._disposeAllSensorRings();

    // Markery wykrytych wrogów — switchSystem nie zostawia ghost markerów
    this._disposeAllEnemyAlertMarkers();

    // POI sprites (M2b C7) — switchSystem nie zostawia ghost markerów
    this._disposeAllPOISprites();

    // Reset
    this._entityByUUID.clear();
    this._clickable = [];
    this._focusEntityId = null;
    this._focusVesselId = null;
    this._focusStationId = null;
    this._star = null;
    this._starClickMesh = null;
  }

  // ── Gwiazda (kolorowy rdzeń + białe centrum + kolorowe promieniowanie) ──
  renderStar(star) {
    this._star = star;
    // Promień gwiazdy skalowany masą: M(0.3)→0.8, K(0.7)→1.0, G(1.0)→1.2, F(1.4)→1.4
    const starMass = star.mass ?? 1.0;
    const r = Math.max(0.6, Math.min(1.6, 0.6 + starMass * 0.6));
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
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
      }));
      sp.scale.setScalar(scale);
      return sp;
    };

    // ── [1] Glow wewnętrzny — silny biały bloom zakrywający rdzeń ──
    group.add(_glowSprite(512, [
      [0.0,  `rgba(255,255,255,1.0)`],
      [0.06, `rgba(255,255,255,0.9)`],
      [0.12, `rgba(255,255,255,0.6)`],
      [0.20, `rgba(${cr},${cg},${cb},0.30)`],
      [0.32, `rgba(${cr},${cg},${cb},0.10)`],
      [0.50, `rgba(${glR},${glG},${glB},0.03)`],
      [0.75, `rgba(${glR},${glG},${glB},0.005)`],
      [1.0,  `rgba(${glR},${glG},${glB},0.0)`],
    ], 1.0, r * 7.0));

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

    // Niewidoczna sfera klikalna — większa od wizualnej gwiazdy
    const clickGeo = new THREE.SphereGeometry(r * 2.5, 16, 16);
    const clickMat = new THREE.MeshBasicMaterial({ visible: false });
    const clickMesh = new THREE.Mesh(clickGeo, clickMat);
    this._starClickMesh = clickMesh;
    group.add(clickMesh);
    this._clickable.push(clickMesh);
    this._entityByUUID.set(clickMesh.uuid, star);

    this.scene.add(group);
    this._starGroup = group;
    this._starCoronaUniform = null;
    this._starPromCount = 0;

    // Zaktualizuj PointLight
    this._starLight.color = color;
    this._starLight.position.set(S(star.x), 0, S(star.y));
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

  // Promień encji w jednostkach Three.js (planeta/księżyc/planetoid/gwiazda)
  _getEntityRadius(entity) {
    if (entity.type === 'planet') return ThreeRenderer._planetRadius(entity);
    if (entity.type === 'moon') return Math.max(0.015, Math.min(0.04, 0.015 + (entity.physics?.mass ?? 0.001) * 1.5));
    if (entity.type === 'planetoid') return 0.02;
    if (entity.type === 'star') return 1.6;
    return 0.1;
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

  // ── Bake diffuse texture planety ────────────────────────────────────────────
  // Priorytet: tekstury terenu z mapy 2D → fallback na shader proceduralny
  _bakePlanetTexture(planet) {
    // ── Tryb 1: mapa kolorów z tekstur terenu (1:1 z mapą 2D) ──────────────
    if (texturesLoaded()) {
      const isHome = planet.id === window.KOSMOS?.homePlanet?.id;
      const grid = PlanetMapGenerator.generate(planet, isHome);
      if (grid) {
        const colorMap = BiomeMapGenerator.generateColorMap(grid, planet);
        if (colorMap) return colorMap;
      }
    }

    // ── Tryb 2: fallback — shader proceduralny (RegionSystem + GLSL) ────────
    return this._bakeShaderTexture(planet);
  }

  // Stary shader bake — fallback gdy tekstury terenu niedostępne
  _bakeShaderTexture(planet) {
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

  // ── Przebuduj diffuse tekstury planet po załadowaniu tekstur terenu ────────
  // Async: jedna planeta na klatkę → bez zamrażania UI
  async _rebakePlanetTextures() {
    if (!texturesLoaded()) return;

    const entries = [...this._planets.entries()]
      .filter(([, e]) => e.planet && e.planet.planetType !== 'gas' && e.mesh?.material?.map);
    const total = entries.length;
    if (total === 0) { window._hideLoadingScreen?.(); return; }

    window._updateLoading?.(60, 'Generowanie tekstur planet...');
    let count = 0;

    for (let i = 0; i < entries.length; i++) {
      const [id, entry] = entries[i];
      const progress = 60 + (i / total) * 35; // 60–95%
      window._updateLoading?.(progress, `Tekstura planety ${i + 1}/${total}...`);

      // Oddaj kontrolę przeglądarce — pozwól przerysować loading screen
      await new Promise(r => setTimeout(r, 0));

      let newTex = null;
      try {
        newTex = this._bakePlanetTexture(entry.planet);
      } catch (err) {
        console.warn('[ThreeRenderer] Rebake error:', entry.planet.id, err);
      }
      if (newTex) {
        const oldTex = entry.mesh.material.map;
        entry.mesh.material.map = newTex;
        entry.mesh.material.needsUpdate = true;
        if (oldTex) oldTex.dispose();
        count++;
      }
    }

    // Rebake księżyców
    for (const [, entry] of this._moons) {
      if (!entry.moon || !entry.mesh?.material?.map) continue;
      await new Promise(r => setTimeout(r, 0));
      try {
        const tex = this._bakePlanetTexture(entry.moon);
        if (tex) {
          const old = entry.mesh.material.map;
          entry.mesh.material.map = tex;
          entry.mesh.material.needsUpdate = true;
          if (old) old.dispose();
          count++;
        }
      } catch (e) { /* cichy */ }
    }

    // Rebake planetoidów
    for (const [, entry] of this._planetoids) {
      if (!entry.planetoid || !entry.mesh?.material?.map) continue;
      await new Promise(r => setTimeout(r, 0));
      try {
        const tex = this._bakePlanetTexture(entry.planetoid);
        if (tex) {
          const old = entry.mesh.material.map;
          entry.mesh.material.map = tex;
          entry.mesh.material.needsUpdate = true;
          if (old) old.dispose();
          count++;
        }
      } catch (e) { /* cichy */ }
    }

    window._updateLoading?.(100, 'Gotowe!');
    await new Promise(r => setTimeout(r, 200));
    window._hideLoadingScreen?.();

    if (count) console.log(`[ThreeRenderer] Rebake: ${count} tekstur (planety+księżyce+planetoidy)`);
  }

  // ── Planeta mesh ─────────────────────────────────────────────
  addPlanetMesh(planet) {
    if (this._planets.has(planet.id)) return;

    const seed = hashCode(String(planet.id));
    const r    = ThreeRenderer._planetRadius(planet);

    // Cache typ tekstury i wariant — inne systemy (ColonyOverlay) użyją tego samego
    if (!planet._cachedTexType) {
      planet._cachedTexType = resolveTextureType(planet);
      planet._cachedTexVariant = (seed % TEXTURE_VARIANTS) + 1;
    }

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
      let bakedDiffuse = null;
      try {
        bakedDiffuse = this._bakePlanetTexture(planet);
      } catch (err) {
        console.warn('[ThreeRenderer] _bakePlanetTexture error:', planet.id, err);
      }
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
    // M3 P1.2 — userData dla raycaster (atmoMesh/cloudMesh mają inne userData
    // bez kosmosType, więc filter automatycznie odfiltruje tylko core mesh).
    mesh.userData = { kosmosType: 'planet', planetId: planet.id };
    group.add(mesh);

    // Warstwa chmur — tylko rocky z atmosferą (nie gas)
    const hasValidAtmo = !isGas && planet.atmosphere && planet.atmosphere !== 'none' && planet.atmosphere !== 'brak';
    if (hasValidAtmo) {
      const cloudMesh = this._createSystemCloudMesh(r);
      if (cloudMesh) {
        cloudMesh.userData.isCloud = true;
        group.add(cloudMesh);
      }
    }

    // Atmosfera Rayleigh — tylko planety skaliste z atmosferą (NIE gas giganty)
    const hasAtmo = !isGas && planet.atmosphere && planet.atmosphere !== 'none' && planet.atmosphere !== 'brak';
    if (hasAtmo) {
      const atmoColor    = new THREE.Color(planet.visual.glowColor ?? 0x4488ff);
      const atmoScale    = 1.08;
      const atmoStrength = 0.55;

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
    this._planets.set(planet.id, { group, mesh, planet });
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
    if (!this._cameraController) return;

    // Helper: focusOn z guardem NaN. W podglądzie obserwatorium — twardy lock
    // (focusOnInstant, bez lerp-lag) → ciało stoi w miejscu mimo ruchu po orbicie.
    const safeFocus = (x, z, y = 0) => {
      if (isNaN(x) || isNaN(z)) return;
      if (this._observatoryPreviewActive) this._cameraController.focusOnInstant(x, z, y);
      else this._cameraController.focusOn(x, z);
    };

    // Śledzenie stacji (anchored do planety, ale planeta orbituje — kamera nadąża). S3.3b-S4a.
    if (this._focusStationId) {
      const sEntry = this._stations.get(this._focusStationId);
      if (sEntry?.mesh) {
        const p = sEntry.mesh.position;
        if (!isNaN(p.x) && !isNaN(p.z)) this._cameraController.focusOnSmooth(p.x, p.z, p.y);
        return;
      }
      this._focusStationId = null; // stacja zniknęła (destroy) — self-heal
    }

    // Śledzenie statku w locie (co klatkę, wygładzone — eliminuje drganie)
    if (this._focusVesselId) {
      const vEntry = this._vessels.get(this._focusVesselId);
      if (vEntry) {
        const pos = vEntry.sprite.position;
        if (!isNaN(pos.x) && !isNaN(pos.z)) {
          this._cameraController.focusOnSmooth(pos.x, pos.z, pos.y);
        }
        return;
      }
      // Statek zniknął (zadokował) — przerwij śledzenie
      this._focusVesselId = null;
    }

    if (!this._focusEntityId) return;

    // Sprawdź planety
    const pEntry = this._planets.get(this._focusEntityId);
    if (pEntry) { safeFocus(pEntry.group.position.x, pEntry.group.position.z, pEntry.group.position.y); return; }
    // Sprawdź księżyce
    const mEntry = this._moons.get(this._focusEntityId);
    if (mEntry) { safeFocus(mEntry.mesh.position.x, mEntry.mesh.position.z, mEntry.mesh.position.y); return; }
    // Sprawdź planetoidy
    const pdEntry = this._planetoids.get(this._focusEntityId);
    if (pdEntry) { safeFocus(pdEntry.mesh.position.x, pdEntry.mesh.position.z, pdEntry.mesh.position.y); }
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
        float t=uTime;
        vec3 drift=vec3(t*0.06, t*0.015, t*0.025);
        vec3 sp=vSpherePos+drift;
        float n=sphereNoise(sp,3.0)*0.500
              +sphereNoise(sp,6.2)*0.250
              +sphereNoise(sp,12.5)*0.125
              +sphereNoise(sp,25.0)*0.063;
        n=n*0.5+0.5;
        float evolve=sphereNoise(vSpherePos+vec3(t*0.04,-t*0.03,t*0.02),2.0)*0.12;
        n+=evolve;
        float cloudMask=smoothstep(0.48,0.70,n);
        if(cloudMask<0.01){discard;}
        vec3 toStar=normalize(uLightDir-vWorldPos);
        float rawDiff=dot(vWorldNormal,toStar);
        float diff=max(rawDiff,0.0);
        float lit=0.30+0.70*diff;
        vec3 cloudColor=vec3(0.95,0.97,1.00)*lit;
        float nightFade=smoothstep(-0.15,0.2,rawDiff);
        float fresnel=1.0-max(dot(vNormal,vViewDir),0.0);
        float edgeFade=1.0-pow(fresnel,2.5)*0.5;
        float alpha=cloudMask*0.88*edgeFade*(0.05+0.95*nightFade);
        gl_FragColor=vec4(cloudColor,alpha);
      }
    `;
    const mat = new THREE.ShaderMaterial({
      vertexShader: cloudVert, fragmentShader: cloudFrag,
      uniforms: {
        uTime:     { value: 0.0 },
        uLightDir: { value: new THREE.Vector3(0, 0, 0) },
      },
      transparent: true, depthWrite: false, depthTest: false, side: THREE.FrontSide,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.025, 32, 32), mat);
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

    // Linie handlu cywilnego — aktualizuj pozycje endpointów
    if (this._tradeLines.length > 0) this._syncTradeLinePositions();

    // Planetoidy: synchronizuj pozycje meshów
    this._syncPlanetoidPositions();

    // Aktualizuj wizualne orbity statków (animacja co klatkę). Stacje PRZED statkami — statek
    // orbitujący stację czyta mesh stacji z TEJ klatki (bez 1-klatkowego opóźnienia).
    this._tickOrbitingStations();
    this._tickOrbitingVessels();

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
    const showMoons = this._orbitFilter === 'all' || this._orbitFilter === 'planets_moons';
    ring.visible = showMoons;  // widoczność wg filtra orbit
    ring.material.opacity = showMoons ? 0.15 : 0;
    parentEntry.group.add(ring);

    // Sfera księżyca — w scenie, pozycja synchronizowana z moon.x/y
    // Promień oparty o masę: 0.0001–0.015 M⊕ → r = 0.015–0.04 (zawsze mniejsze od planet)
    const r   = Math.max(0.015, Math.min(0.04, 0.015 + (moon.physics?.mass ?? 0.001) * 1.5));
    const geo = new THREE.SphereGeometry(r, 24, 16);

    // Tekstura: terrain-based diffuse (hex grid → generateColorMap) lub PBR fallback
    let mat;
    try {
      const bakedDiffuse = this._bakePlanetTexture(moon);
      if (bakedDiffuse) {
        const texType = resolveTextureType(moon);
        const seed = hashCode(moon.id || 'moon');
        let normalMap = null, roughnessMap = null;
        if (texType) {
          const variant = (seed % TEXTURE_VARIANTS) + 1;
          const maps = loadPlanetTextures(texType, variant);
          normalMap = maps.normal;
          roughnessMap = maps.roughness;
        }
        mat = new THREE.MeshStandardMaterial({
          map: bakedDiffuse, normalMap, roughnessMap, metalness: 0.02,
        });
      }
    } catch (e) { /* cichy fallback */ }
    if (!mat) {
      const texType = resolveTextureType(moon);
      if (texType) {
        const seed = hashCode(moon.id || 'moon');
        const maps = loadPlanetTextures(texType, (seed % TEXTURE_VARIANTS) + 1);
        mat = new THREE.MeshStandardMaterial({
          map: maps.diffuse, normalMap: maps.normal, roughnessMap: maps.roughness, metalness: 0.02,
        });
      } else {
        mat = new THREE.MeshStandardMaterial({ color: moon.visual?.color ?? 0x888888, roughness: 0.85, metalness: 0.02 });
      }
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(S(moon.x), 0, S(moon.y));
    // Raycaster (resolveTargetFromHits) — patrz planetoida: bez kosmosType księżyc
    // był pomijany w castRay → moveToPoint bez targetBodyId → statek dryfował w punkcie
    // zamiast śledzić orbitujący księżyc. Ustawiamy id → moveToPoint wchodzi na orbitę.
    mesh.userData = { kosmosType: 'moon', moonId: moon.id };
    this.scene.add(mesh);

    this._clickable.push(mesh);
    this._entityByUUID.set(mesh.uuid, moon);
    this._moons.set(moon.id, { mesh, ring, parentEntry, moon });
  }

  // Pokaż orbitę konkretnego księżyca
  _showMoonOrbit(moonId) {
    const entry = this._moons.get(moonId);
    if (!entry?.ring) return;
    entry.ring.material.opacity = 0.30;
    entry.ring.visible = true;
  }

  // Ukryj/pokaż orbity księżyców (wg filtra)
  _hideAllMoonOrbits() {
    const show = this._orbitFilter === 'all' || this._orbitFilter === 'planets_moons';
    this._moons.forEach(entry => {
      if (entry.ring) {
        entry.ring.material.opacity = show ? 0.15 : 0;
        entry.ring.visible = show;
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

  // Przywraca domyślny stan widoczności orbity (ukryta chyba że home/kolonia/orbitFilter)
  _restoreOrbitDefaults(planetId, line) {
    const isHomePlanet = planetId === window.KOSMOS?.homePlanet?.id;
    const colMgr = window.KOSMOS?.colonyManager;
    const isColonized = colMgr ? colMgr.getColony(planetId) != null : false;
    const showAll = this._orbitFilter === 'all' || this._orbitFilter === 'planets_moons';
    if (isHomePlanet) {
      line.visible = true;
      line.material.color.setHex(0x007852);
      line.material.opacity = 0.15;
    } else if (isColonized) {
      line.visible = true;
      line.material.color.setHex(0x005540);
      line.material.opacity = 0.10;
    } else if (showAll) {
      line.visible = true;
      line.material.opacity = 0.08;
    } else {
      line.visible = false;
    }
  }

  // Zmienia tryb widoczności orbit: 'all' | 'planets_moons' | 'planetoids'
  setOrbitFilter(mode) {
    this._orbitFilter = mode;
    this._applyOrbitFilter();
  }

  // Aktualizuje widoczność wszystkich orbit wg aktualnego filtra
  _applyOrbitFilter() {
    // Orbity planet — przebuduj (uwzględnia _orbitFilter w _restoreOrbitDefaults)
    this._orbits.forEach((line, id) => {
      if (id === this._focusEntityId) return; // zaznaczona — nie ruszaj
      this._restoreOrbitDefaults(id, line);
    });

    // Orbity księżyców
    this._hideAllMoonOrbits();

    // Orbity planetoidów
    this._hideAllPlanetoidOrbits();
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
    if (planet.id === window.KOSMOS?.homePlanet?.id) color = 0x007852;
    if (planet.orbitalStability < 0.5) color = 0x553322;   // niestabilna — ciemny czerwony
    if (planet.isSelected)             color = 0x00ccff;   // zaznaczona — info blue

    // Widoczność i jasność: domyślnie ukryte, wyjątki dla home/koloni
    const isHomePlanet = planet.id === window.KOSMOS?.homePlanet?.id;
    const colMgr = window.KOSMOS?.colonyManager;
    const isColonized = colMgr ? colMgr.getColony(planet.id) != null : false;
    const isFocused = planet.id === this._focusEntityId;
    let orbitVisible = false;
    let orbitOpacity = 0.35;
    const showPlanets = this._orbitFilter === 'all' || this._orbitFilter === 'planets_moons';
    if (isFocused) {
      orbitVisible = true; orbitOpacity = 0.7; color = 0xffc832; // złota orbita — zaznaczona
    } else if (isHomePlanet) {
      orbitVisible = true; orbitOpacity = 0.15; // homePlanet — zawsze widoczna, przyciemniona
    } else if (isColonized) {
      orbitVisible = true; orbitOpacity = 0.10; // kolonizowana — widoczna, przyciemniona
    } else if (showPlanets) {
      orbitVisible = true; orbitOpacity = 0.08; // filtr — przyciemniona
    }

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
        color: new THREE.Color(color), transparent: true, opacity: orbitOpacity,
      })
    );
    line.visible = orbitVisible;
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

      // Tekstura: terrain-based diffuse (hex grid) lub PBR fallback
      const isMetallic = p.planetoidType === 'metallic';
      let mat;
      try {
        const bakedDiffuse = this._bakePlanetTexture(p);
        if (bakedDiffuse) {
          const texType = resolveTextureType(p);
          let normalMap = null, roughnessMap = null;
          if (texType) {
            const seed = hashCode(String(p.id));
            const maps = loadPlanetTextures(texType, (seed % TEXTURE_VARIANTS) + 1);
            normalMap = maps.normal;
            roughnessMap = maps.roughness;
          }
          mat = new THREE.MeshStandardMaterial({
            map: bakedDiffuse, normalMap, roughnessMap,
            metalness: isMetallic ? 0.25 : 0.05,
          });
        }
      } catch (e) { /* cichy fallback */ }
      if (!mat) {
        const texType = resolveTextureType(p);
        if (texType) {
          const seed = hashCode(String(p.id));
          const maps = loadPlanetTextures(texType, (seed % TEXTURE_VARIANTS) + 1);
          mat = new THREE.MeshStandardMaterial({
            map: maps.diffuse, normalMap: maps.normal, roughnessMap: maps.roughness,
            metalness: isMetallic ? 0.25 : 0.05,
          });
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: p.visual?.color ?? 0x998877, metalness: 0.05, roughness: 0.7,
          });
        }
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(S(p.x), 0, S(p.y));
      // Raycaster (resolveTargetFromHits) — bez kosmosType planetoida była pomijana
      // w castRay (filter findKosmosNode) → PPM zwracał target 'empty' → moveToPoint bez
      // targetBodyId → statek leciał do STATYCZNEGO punktu i dryfował, gdy planetoida
      // orbitowała dalej (fix bug: „statek stoi, planetoida leci"). Ustawiamy id ciała →
      // moveToPoint śledzi ruchome ciało i wchodzi na orbitę.
      mesh.userData = { kosmosType: 'planetoid', planetoidId: p.id };
      this.scene.add(mesh);

      this._clickable.push(mesh);
      this._entityByUUID.set(mesh.uuid, p);
      this._planetoids.set(p.id, { mesh, planetoid: p });

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

  // Przywróć domyślną widoczność orbit planetoidów (wg filtra)
  _hideAllPlanetoidOrbits() {
    const show = this._orbitFilter === 'all' || this._orbitFilter === 'planetoids';
    this._planetoidOrbits.forEach(line => {
      line.material.opacity = 0.12;
      line.visible = show;
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
    line.visible = this._orbitFilter === 'all' || this._orbitFilter === 'planetoids';
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
      // Faza D3: synchronizuj też pierścienie Dysona z gwiazdą
      if (this._dysonRingsGroup) {
        this._dysonRingsGroup.position.set(S(star.x), 0, S(star.y));
      }
    }
  }

  // ── Faza D3: Wizualna progresja gwiazdy z postępem Sfery Dysona ──
  // stage: 0 = normalna gwiazda, 1-4 = etapy Sfery (1 segm/2 wyraźne/3 przyciemnione/4 fioletowe)
  // Wywoływane z GameScene listener'a 'dyson:visualStageChanged'
  updateStarForDyson(stage) {
    if (stage === this._dysonStage) return;
    this._dysonStage = stage;
    if (!this._starGroup || !this._starLight) return;

    // Reset światła do oryginału przy każdej zmianie (idempotencja)
    this._starLight.color.setHex(this._starLightOrigColor);
    this._starLight.intensity = this._starLightOrigIntensity;

    switch (stage) {
      case 0:
        // Normalna gwiazda — usuń pierścienie jeśli były
        this._addDysonRings(0);
        break;
      case 1:
      case 2:
        // Pierścienie ledwo widoczne / wyraźne — bez zmian światła
        this._addDysonRings(stage);
        break;
      case 3:
        // Gwiazda przysłonięta — zmniejsz jasność
        this._starLight.intensity = 0.8;
        this._addDysonRings(stage);
        break;
      case 4:
        // Gwiazda prawie niewidoczna, fioletowe światło
        this._starLight.intensity = 0.3;
        this._starLight.color.setHex(0x9933cc);
        this._addDysonRings(stage);
        break;
    }
  }

  _addDysonRings(stage) {
    // Dispose poprzednich pierścieni
    if (this._dysonRingsGroup) {
      this.scene.remove(this._dysonRingsGroup);
      this._dysonRingsGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this._dysonRingsGroup = null;
    }

    if (stage === 0) return;

    this._dysonRingsGroup = new THREE.Group();

    // Parametry per etap (rings = ile pierścieni, scale = mnożnik radius)
    // Zmniejszone w D3-fix — wcześniejsze wartości zajmowały cały ekran.
    const configs = {
      1: { rings: 1, opacity: 0.08, color: 0x8888aa, scale: 1.5 },
      2: { rings: 2, opacity: 0.12, color: 0x6699bb, scale: 1.8 },
      3: { rings: 3, opacity: 0.15, color: 0x4488cc, scale: 2.2 },
      4: { rings: 3, opacity: 0.20, color: 0x9933cc, scale: 2.5 },
    };
    const cfg = configs[stage];
    if (!cfg) return;

    // Bazowy promień gwiazdy: 1.6 (stała z _getEntityRadius dla 'star')
    const starRadius = 1.6;

    for (let i = 0; i < cfg.rings; i++) {
      const radius = starRadius * cfg.scale * (1 + i * 0.3);
      const geo    = new THREE.RingGeometry(radius * 0.97, radius, 64);
      const mat    = new THREE.MeshBasicMaterial({
        color:        cfg.color,
        transparent:  true,
        opacity:      cfg.opacity * (1 - i * 0.1),
        side:         THREE.DoubleSide,
        depthWrite:   false,
      });
      const ring = new THREE.Mesh(geo, mat);
      // Płaszczyzna ekliptyki + lekkie nachylenia per pierścień
      ring.rotation.x = Math.PI / 2 + (i * 0.05);
      ring.rotation.z = i * 0.1;
      this._dysonRingsGroup.add(ring);
    }

    // Pozycja zsynchronizowana z gwiazdą
    if (this._starGroup) {
      this._dysonRingsGroup.position.copy(this._starGroup.position);
    }
    this.scene.add(this._dysonRingsGroup);
  }

  // ── Kliknięcie (raycasting) ───────────────────────────────────
  // screenX/Y w CSS-pikselach (e.clientX) — normalizujemy przez window.innerWidth/H
  handleClick(screenX, screenY) {
    // Najpierw vessel/wrak — jeśli hover ma ustawiony, klik jest zamiarowy.
    // Bez tego klik w pobliżu statku (ale obok mesh'a planet) trafiałby do
    // `body:deselected` → kamera lata na gwiazdę.
    const vid = this._hoverVesselId ?? this._getVesselAtScreen?.(screenX, screenY, 40);
    if (vid) {
      EventBus.emit('vessel:focus', { vesselId: vid });
      return true;
    }

    this._mouse.x =  (screenX / window.innerWidth)  * 2 - 1;
    this._mouse.y = -(screenY / window.innerHeight) * 2 + 1;
    this._ray.setFromCamera(this._mouse, this.camera);

    // Stacja orbitalna — focus kamery (BEZ selekcji; mesh nie w _clickable). PRZED ciałami,
    // bo stacja orbituje blisko planety (klik w stację nie ma zaznaczać planety za nią). S3.3b-S4a.
    if (this._stations.size > 0) {
      const sMeshes = [];
      for (const e of this._stations.values()) if (e.mesh) sMeshes.push(e.mesh);
      const sHits = this._ray.intersectObjects(sMeshes, true); // recursive — child mesh GLB/placeholder
      if (sHits.length > 0) {
        let o = sHits[0].object;
        while (o && !o.userData?.stationId) o = o.parent;      // walk-up do Group z userData
        if (o?.userData?.stationId) {
          const sid = o.userData.stationId;
          EventBus.emit('station:focus',    { stationId: sid }); // kamera (S3.3b-S4a, bez zmian)
          EventBus.emit('station:selected', { stationId: sid }); // S4-2 — otwiera StationPanel
          return true;
        }
      }
    }

    const hits = this._ray.intersectObjects(this._clickable);
    if (hits.length > 0) {
      const entity = this._entityByUUID.get(hits[0].object.uuid);
      if (entity) { EventBus.emit('body:selected', { entity }); return true; }
    }
    EventBus.emit('body:deselected');
    return false;
  }

  // Zwraca encję pod kursorem BEZ emitowania eventów (do dblclick)
  // Pozycja planety na ekranie (px) — dla animacji przejścia do ColonyOverlay
  getScreenPosition(entityId) {
    const pEntry = this._planets.get(entityId);
    if (!pEntry) return null;
    const pos = pEntry.group.position.clone();
    pos.project(this.camera);
    return {
      x: (pos.x * 0.5 + 0.5) * window.innerWidth,
      y: (-pos.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // S4-2 — pozycja stacji na ekranie (px) dla StationPanel (anchored, podąża za orbitującym ciałem).
  // Mirror getScreenPosition, ale czyta _stations i zwraca null gdy stacja za kamerą (NDC z poza [-1,1])
  // — wtedy panel zaczepia fallback zamiast rysować poza ekranem.
  getStationScreenPosition(stationId) {
    const entry = this._stations.get(stationId);
    if (!entry?.mesh) return null;
    const pos = entry.mesh.position.clone();
    pos.project(this.camera);
    if (pos.z < -1 || pos.z > 1) return null;
    return {
      x: (pos.x * 0.5 + 0.5) * window.innerWidth,
      y: (-pos.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // Redesign UI v1 (Slice 1) — ogólna pozycja ekranowa DOWOLNEGO ciała
  // (planeta/księżyc/planetoida/gwiazda) dla pływającego panelu BottomContext.
  // Mirror getStationScreenPosition (z-clamp), ale getScreenPosition pokrywał tylko
  // planety → tu obsługujemy wszystkie typy. getWorldPosition (księżyce mogą być
  // zagnieżdżone). Zwraca null gdy ciało za kamerą (NDC z poza [-1,1]).
  getBodyScreenPosition(entityId) {
    if (!entityId) return null;
    let obj = null;
    const pe = this._planets.get(entityId);
    if (pe) obj = pe.group;
    if (!obj) { const me = this._moons.get(entityId);      if (me) obj = me.mesh; }
    if (!obj) { const ae = this._planetoids.get(entityId); if (ae) obj = ae.mesh; }
    if (!obj && this._starGroup) {
      const star = EntityManager.getByType('star')?.[0];
      if (star && star.id === entityId) obj = this._starGroup;
    }
    if (!obj) return null;
    const tmp = this._tmpLabelVec ?? (this._tmpLabelVec = new THREE.Vector3());
    obj.getWorldPosition(tmp);
    tmp.project(this.camera);
    if (tmp.z < -1 || tmp.z > 1) return null;
    return {
      x: (tmp.x * 0.5 + 0.5) * window.innerWidth,
      y: (-tmp.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // FAZA 5 (S3.4) — bieżący dystans kamery orbitalnej (zakres ~3..450) dla fade/scale etykiet mapy.
  // null gdy kontroler nie podpięty (headless / przed initem).
  getCameraDistance() {
    return this._cameraController?._dist ?? null;
  }

  // B1 (W2.1): epoka ruchu kamery — UIManager odświeża overlay 2D (etykiety + ramki selekcji)
  // co klatkę, gdy ta wartość rośnie (kamera w ruchu). 0 gdy kontroler niepodpięty (headless).
  getCameraMoveEpoch() {
    return this._cameraController?.moveEpoch ?? 0;
  }

  // Flag: pokaż labele wszystkich widocznych obiektów (toggle CTRL).
  // UIManager w draw() czyta ten flag przez getAllVisibleLabels() i rysuje.
  setShowAllLabels(on) { this._showAllLabels = !!on; }

  // Zbierz pozycje screen-space dla wszystkich ciał i statków.
  // Wołane przez UIManager gdy _showAllLabels === true.
  // Zwraca: [{ id, name, x, y, kind, color }]. Kind: planet|moon|planetoid|star|vessel|wreck|enemy
  getAllVisibleLabels() {
    if (!this._showAllLabels) return [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const tmp = this._tmpLabelVec ?? (this._tmpLabelVec = new THREE.Vector3());
    const out = [];

    const project = (mesh) => {
      if (!mesh) return null;
      mesh.getWorldPosition(tmp);
      tmp.project(this.camera);
      if (tmp.z < -1 || tmp.z > 1) return null;  // poza frustum
      return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
    };

    // Gwiazda
    if (this._starGroup) {
      const s = project(this._starGroup);
      if (s) {
        const star = EntityManager.getByType('star')?.[0];
        out.push({ id: star?.id ?? 'star', name: star?.name ?? 'Gwiazda', x: s.x, y: s.y, kind: 'star', color: '#ffd866' });
      }
    }
    // Planety
    for (const [id, entry] of this._planets) {
      const p = project(entry.group);
      if (!p) continue;
      const ent = this._entityByUUID.get(entry.mesh.uuid);
      out.push({ id, name: ent?.name ?? id, x: p.x, y: p.y, kind: 'planet', color: '#9effc4' });
    }
    // Księżyce
    for (const [id, entry] of this._moons) {
      const p = project(entry.mesh);
      if (!p) continue;
      const ent = this._entityByUUID.get(entry.mesh.uuid);
      out.push({ id, name: ent?.name ?? id, x: p.x, y: p.y, kind: 'moon', color: '#b0b0c0' });
    }
    // Planetoidy
    for (const [id, entry] of this._planetoids) {
      const p = project(entry.mesh);
      if (!p) continue;
      const ent = this._entityByUUID.get(entry.mesh.uuid);
      out.push({ id, name: ent?.name ?? id, x: p.x, y: p.y, kind: 'planetoid', color: '#a08060' });
    }
    // Statki (żywe + wraki, różne kolory)
    const vMgr = window.KOSMOS?.vesselManager;
    for (const [id, entry] of this._vessels) {
      const p = project(entry.sprite);
      if (!p || !entry.sprite.visible) continue;
      const vessel = vMgr?.getVessel(id);
      const isEnemy = !!entry.enemyTint || !!vessel?.isEnemy;
      const isWreck = !!entry.isWreck;
      const color = isWreck ? '#888'
                  : isEnemy ? '#ff4466'
                  :           '#44cc66';
      // Fog-of-war tożsamości: wrogi ghost (intel < contact) = etykieta „?" bez nazwy.
      let label = vessel?.name ?? id;
      if (isEnemy && !isWreck) {
        const q = window.KOSMOS?.intelSystem?.getVesselContact?.(id)?.quality ?? 'unknown';
        if (q !== 'contact' && q !== 'detailed') label = '?';
      }
      out.push({
        id,
        name: label,
        x: p.x, y: p.y,
        kind: isWreck ? 'wreck' : (isEnemy ? 'enemy' : 'vessel'),
        color,
      });
    }
    // Stacje orbitalne (S4-2) — etykieta nazwy w trybie CTRL (pomiń gdy mesh za kamerą/poza ekranem).
    for (const s of EntityManager.getByType('station')) {
      const p = this.getStationScreenPosition(s.id);
      if (!p) continue;
      out.push({ id: s.id, name: s.name ?? s.id, x: p.x, y: p.y, kind: 'station', color: '#8fb8ff' });
    }
    return out;
  }

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

    // Standard hover na ciała niebieskie (raycast BEZ ingerencji w statki)
    const hits  = this._ray.intersectObjects(this._clickable);
    const newId = hits.length > 0
      ? (this._entityByUUID.get(hits[0].object.uuid)?.id ?? null)
      : null;
    if (newId !== this._hoverPlanetId) {
      this._hoverPlanetId = newId;
      EventBus.emit('planet:hover', { entityId: newId });
    }

    // Hover statku — screen-space picking (bez modyfikacji sceny/hitboxów)
    const vesselHover = this._getVesselAtScreen(screenX, screenY);
    if (vesselHover) {
      if (vesselHover !== this._hoverVesselId) {
        this._hoverVesselId = vesselHover;
      }
      this._showVesselTooltip(vesselHover, screenX, screenY);
      return;
    }
    if (this._hoverVesselId) {
      this._hoverVesselId = null;
    }

    // Tooltip — aktywny tylko przy bliskim zoomie i gdy overlay NIE jest otwarty
    const focusId = this._focusEntityId;
    if (!focusId || !this._colonyMarkers.isShown || window.KOSMOS?.overlayManager?.isAnyOpen()) {
      this._hideColonyTooltip();
      return;
    }

    // Sprawdź hover na marker budynku
    const markerHit = this._colonyMarkers.hitTest(this._ray);
    if (markerHit?.buildingId) {
      this._showBuildingTooltip(markerHit, screenX, screenY);
      return;
    }

    // Sprawdź hover na planetę (podsumowanie kolonii)
    if (newId && newId === focusId) {
      const colMgr = window.KOSMOS?.colonyManager;
      if (colMgr?.hasColony(newId)) {
        this._showColonyTooltip(newId, screenX, screenY);
        return;
      }
    }

    this._hideColonyTooltip();
  }

  // ── Tooltip budynku (hover na marker sprite) ──────────────────────────
  _showBuildingTooltip(markerHit, sx, sy) {
    const { buildingId, tileKey } = markerHit;
    const b = BUILDINGS[buildingId];
    if (!b) { this._hideColonyTooltip(); return; }

    // Pobierz efektywne stawki z BuildingSystem
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(this._colonyMarkers.entityId);
    const bSys = colony?.buildingSystem;
    const entry = bSys?._active?.get(tileKey);
    const level = entry?.level ?? markerHit.level ?? 1;
    const rates = entry?.effectiveRates ?? entry?.baseRates ?? b.rates;

    let html = `<b>${b.icon ?? ''} ${b.namePL ?? b.id}</b> Lv.${level}`;

    // Produkcja
    if (rates) {
      for (const [res, rate] of Object.entries(rates)) {
        if (rate === 0) continue;
        const color = rate > 0 ? '#88ff88' : '#ff8888';
        const sign = rate > 0 ? '+' : '';
        html += `<br><span style="color:${color}">${sign}${typeof rate === 'number' ? rate.toFixed(1) : rate} ${res}/rok</span>`;
      }
    }
    // Maintenance
    if (b.maintenance) {
      for (const [res, cost] of Object.entries(b.maintenance)) {
        html += `<br><span style="color:#ff8888">-${cost} ${res}/rok</span>`;
      }
    }
    if (b.energyCost) html += `<br><span style="color:#ffdd44">⚡ -${b.energyCost} energy/rok</span>`;
    if (b.popCost) html += `<br>👤 ${b.popCost} POP`;
    if (b.housing) html += `<br>🏠 +${b.housing} housing`;

    this._showColonyTooltipEl(html, sx, sy);
  }

  // ── Tooltip kolonii (hover na planetę) ────────────────────────────────
  _showColonyTooltip(entityId, sx, sy) {
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(entityId);
    if (!colony) { this._hideColonyTooltip(); return; }

    const civ = colony.civSystem;
    const pop = civ?.population ?? 0;
    const housing = civ?.housing ?? 0;
    const freePops = Math.max(0, pop - (civ?._employedPops ?? 0));

    let html = `<b>${colony.planet?.name ?? entityId}</b>`;
    html += `<br>👤 POP: ${pop}/${housing} (wolne: ${freePops})`;

    // Lista budynków
    const buildingSummary = {};
    let totalEnergy = 0;
    if (colony.buildingSystem?._active) {
      for (const [key, entry] of colony.buildingSystem._active) {
        if (key.startsWith('capital_')) continue;
        const bid = entry.building?.id;
        if (!bid) continue;
        const lv = entry.level ?? 1;
        if (!buildingSummary[bid]) buildingSummary[bid] = [];
        buildingSummary[bid].push(lv);
        // Bilans energii
        const rates = entry.effectiveRates ?? entry.baseRates;
        if (rates?.energy) totalEnergy += rates.energy;
      }
    }

    if (Object.keys(buildingSummary).length > 0) {
      html += '<br><b>Budynki:</b>';
      for (const [bid, levels] of Object.entries(buildingSummary)) {
        const b = BUILDINGS[bid];
        if (!b) continue;
        const lvStr = levels.length === 1 ? `Lv.${levels[0]}` : levels.map(l => `Lv.${l}`).join(', ');
        html += `<br>${b.icon ?? ''} ${b.namePL ?? bid} ${lvStr}`;
      }
    }

    // Bilans energii
    html += `<br><br><b>⚡ Energia:</b> <span style="color:${totalEnergy >= 0 ? '#88ff88' : '#ff8888'}">${totalEnergy >= 0 ? '+' : ''}${totalEnergy.toFixed(1)}/rok</span>`;

    this._showColonyTooltipEl(html, sx, sy);
  }

  // Screen-space picking statków: rzutuj pozycję wrapera/sprite na ekran
  // i zwróć vesselId najbliższego w promieniu thresholdPx. Bez modyfikacji sceny.
  _getVesselAtScreen(sx, sy, thresholdPx = 28) {
    if (!this._vessels || this._vessels.size === 0) return null;
    const canvas = this.renderer?.domElement;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const cw = rect.width, ch = rect.height;
    const tmp = this._tmpPickVec ?? (this._tmpPickVec = new THREE.Vector3());
    let best = null;
    let bestDist = thresholdPx * thresholdPx;
    for (const [vid, entry] of this._vessels) {
      const obj = entry?.sprite;
      if (!obj) continue;
      obj.getWorldPosition(tmp);
      tmp.project(this.camera);
      // Poza frustum (głównie: za kamerą) — pomiń
      if (tmp.z < -1 || tmp.z > 1) continue;
      const vx = (tmp.x * 0.5 + 0.5) * cw + rect.left;
      const vy = (-tmp.y * 0.5 + 0.5) * ch + rect.top;
      const dx = vx - sx;
      const dy = vy - sy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) { bestDist = d2; best = vid; }
    }
    return best;
  }

  // Slice 8 (box-select) — ID własnych żywych statków w prostokącie ekranu (client px).
  // Współrzędne jak _getVesselAtScreen (canvas bounding rect). Tylko own (brak wroga/wraka).
  _getOwnVesselsInScreenRect(x0, y0, x1, y1) {
    const out = [];
    if (!this._vessels || this._vessels.size === 0) return out;
    const canvas = this.renderer?.domElement;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const cw = rect.width, ch = rect.height;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const tmp = this._tmpPickVec ?? (this._tmpPickVec = new THREE.Vector3());
    for (const [vid, entry] of this._vessels) {
      const obj = entry?.sprite;
      if (!obj) continue;
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vid);
      if (!v || v.isWreck || isEnemyVessel(v)) continue;   // tylko własne żywe
      obj.getWorldPosition(tmp);
      tmp.project(this.camera);
      if (tmp.z < -1 || tmp.z > 1) continue;
      const vx = (tmp.x * 0.5 + 0.5) * cw + rect.left;
      const vy = (-tmp.y * 0.5 + 0.5) * ch + rect.top;
      if (vx >= minX && vx <= maxX && vy >= minY && vy <= maxY) out.push(vid);
    }
    return out;
  }

  // ── Tooltip statku (hover na vessel sprite/model) ─────────────────────
  _showVesselTooltip(vesselId, sx, sy) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(vesselId);
    if (!vessel) { this._hideColonyTooltip(); return; }

    // Fog-of-war tożsamości: wrogi statek bez pełnego kontaktu (rumor/unknown) = ghost
    // „pozycja bez tożsamości". Pełne info (nazwa/misja/cargo) tylko przy intel ≥ contact
    // (bliskie spotkanie proximity). Bez tej bramki hover na ghoście zdradzał wszystko —
    // niwecząc sens reformy detekcji obserwatorium.
    if (isEnemyVessel(vessel)) {
      const q = window.KOSMOS?.intelSystem?.getVesselContact?.(vesselId)?.quality ?? 'unknown';
      if (q !== 'contact' && q !== 'detailed') {
        this._showColonyTooltipEl(
          `<b style="color:#ff8888">❓ ${t('intel.unidentifiedContact')}</b>` +
          `<br><span style="opacity:0.7">${t('intel.unidentifiedHint')}</span>`,
          sx, sy);
        return;
      }
    }

    const mSys = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
    const missions = mSys?._missions ?? mSys?._expeditions ?? [];
    const mission = missions.find(m => m.vesselId === vesselId && m.status !== 'completed') ?? null;

    // Kolor nagłówka = kolor cargo = zielony mint; inaczej biały
    let html = `<b style="color:#88ff99">🚀 ${vessel.name}</b>`;

    if (mission) {
      const typeIcon = mission.type === 'transport' ? '📦'
                     : mission.type === 'recon' || mission.type === 'survey' ? '🔭'
                     : mission.type === 'colony' ? '🏗'
                     : mission.type === 'mining' ? '⛏' : '🚀';
      const legBadge = mission.loop ? ' 🔁' : '';
      html += `<br><span style="opacity:0.85">${typeIcon} → ${mission.targetName ?? '?'}${legBadge}</span>`;
      // ETA
      const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      let eta = null;
      if (mission.status === 'returning') eta = mission.returnYear;
      else if (mission.status === 'en_route') eta = mission.arrivalYear;
      if (eta != null && eta > now) {
        const delta = eta - now;
        html += `<br><span style="opacity:0.75">ETA ${delta.toFixed(1)} lat</span>`;
      }
      // Etap pętli
      if (mission.loop && mission.leg) {
        const legLabel = { outbound: 'W drodze tam', return: 'Powrót', waiting_reload: 'Czeka (paliwo)', waiting_return_cargo: 'Czeka (paliwo)' }[mission.leg] ?? mission.leg;
        html += `<br><span style="color:#b0c4b0">Etap: ${legLabel}</span>`;
      }
    } else {
      const stateLabel = vessel.position?.state === 'docked' ? 'W hangarze'
                       : vessel.position?.state === 'orbiting' ? 'Na orbicie' : 'Bezczynny';
      html += `<br><span style="opacity:0.7">${stateLabel}</span>`;
    }

    // Cargo top-3
    const cargoEntries = Object.entries(vessel.cargo ?? {}).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]);
    if (cargoEntries.length > 0) {
      html += `<br><b style="color:#66aa88">📦 Cargo:</b>`;
      const top = cargoEntries.slice(0, 3);
      for (const [id, qty] of top) {
        const icon = RESOURCE_ICONS[id] ?? ALL_RESOURCES[id]?.icon ?? COMMODITIES[id]?.icon ?? '•';
        const name = ALL_RESOURCES[id]?.namePL ?? COMMODITIES[id]?.namePL ?? id;
        html += `<br>${icon} ${name} ×${qty}`;
      }
      if (cargoEntries.length > 3) {
        html += `<br><span style="opacity:0.7">+${cargoEntries.length - 3} więcej</span>`;
      }
    }

    // Manifest planowany (plan misji) — gdy różny od aktualnego cargo
    if (mission?.cargo) {
      const planEntries = Object.entries(mission.cargo).filter(([, q]) => q > 0);
      const diffFromBoard = planEntries.some(([id, q]) => (vessel.cargo?.[id] ?? 0) !== q);
      if (planEntries.length > 0 && diffFromBoard) {
        html += `<br><span style="opacity:0.65; color:#a0a0c0">Plan: ${planEntries.slice(0, 3).map(([id, q]) => (RESOURCE_ICONS[id] ?? ALL_RESOURCES[id]?.icon ?? COMMODITIES[id]?.icon ?? '•') + q).join(' ')}${planEntries.length > 3 ? ' +' + (planEntries.length - 3) : ''}</span>`;
      }
    }

    this._showColonyTooltipEl(html, sx, sy);
  }

  // ── DOM tooltip element ───────────────────────────────────────────────
  _showColonyTooltipEl(html, sx, sy) {
    if (!this._colonyTooltipEl) {
      const el = document.createElement('div');
      el.id = 'colony-3d-tooltip';
      el.style.cssText = `
        position:fixed; z-index:40; pointer-events:none;
        display:none; max-width:280px; padding:8px 10px;
        background:rgba(6,12,20,0.95); border:1px solid #1a6e50;
        border-radius:4px; font-family:'Courier New',monospace;
        font-size:11px; color:#b0c4b0; line-height:1.4;
      `;
      document.body.appendChild(el);
      this._colonyTooltipEl = el;
    }
    this._colonyTooltipEl.innerHTML = html;
    this._colonyTooltipEl.style.display = 'block';
    this._colonyTooltipEl.style.left = `${Math.min(sx + 14, window.innerWidth - 300)}px`;
    this._colonyTooltipEl.style.top = `${Math.min(sy - 10, window.innerHeight - 250)}px`;
  }

  _hideColonyTooltip() {
    if (this._colonyTooltipEl) this._colonyTooltipEl.style.display = 'none';
  }

  // ── Suspend/resume (Faza 5 — BattleView3D przejmuje canvas) ──
  // Gdy _renderingEnabled=false, pętla żyje (odbiera eventy) ale nic nie rysuje
  // na głównej scenie. BattleView3D używa tego samego canvas i renderera.
  suspend() { this._renderingEnabled = false; }
  resume()  { this._renderingEnabled = true;  }

  // ── Pętla renderowania ────────────────────────────────────────
  _startLoop() {
    // Faza 5: bramka na rendering (BattleView3D zawiesza przy starciu)
    if (this._renderingEnabled === undefined) this._renderingEnabled = true;

    const loop = () => {
      requestAnimationFrame(loop);

      // Pomiń rendering gdy kontekst WebGL utracony
      if (this._contextLost) return;
      // Faza 5: BattleView3D przejął canvas — nie rysujemy głównej sceny
      if (!this._renderingEnabled) return;

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

        // Podgląd obserwatorium — twardy lock kamery na ciele co klatkę (przed update, bez lerp-lag).
        if (this._observatoryPreviewActive) this._updateCameraFocus();

        // Aktualizuj kamerę (płynny zoom + orbit)
        if (this._cameraController) this._cameraController.update();

        // Animacja świetlików handlowych
        if (this._tradeFireflies.length > 0) this._animateTradeFireflies(t);

        // Ikony budynków na planecie (visibility + pulsowanie)
        const camDist = this._cameraController?._dist ?? 100;
        this._colonyMarkers.tick(0.016, camDist);

        // Animacja chmur — niezaleznie od pauzy gry (real-time)
        this._tickClouds();

        // Fleet Command Console — drenuj efemeryczne FX (real-time) + pierścienie selekcji + znaczniki starć + kometa trasy
        this._updateActiveEffects(performance.now());
        // Fix#4: 3D pierścień selekcji USUNIĘTY (za duży/obscuring) — wskaźnik = ramki 2D
        // (UIManager._drawSelectionBrackets, screen-constant, widoczne z daleka).
        this._tickEngagementMarkers(performance.now());
        // _tickEngineTrails USUNIĘTE — zastąpione stożkiem wydechu (_applyExhaust).
        // Stary trail spawnował zieloną additive-kulę w środku statku (kolor frakcji).
        this._syncInsignia();
        this._syncEnemyAlertMarkers();   // pulsujący czerwony marker wykrytego wroga (≥rumor)
        this._syncTacticalGlyphs();      // F2 tryb Y — glify-billboardy (no-op poza trybem)
        this._syncBodyScanVeil();        // reforma obserwatorium — szara zasłona niezbadanego ciała w podglądzie

        // Selective bloom (fallback: bezpośredni render gdy composery padły)
        if (this._bloomComposer && this._finalComposer) this._renderSelectiveBloom();
        else this.renderer.render(this.scene, this.camera);
      } catch (err) {
        console.error('[ThreeRenderer] Render loop error:', err);
      }
    };
    loop();
  }

  // Selective bloom — dwa przebiegi:
  //   1) bloom-only: camera.layers=BLOOM_LAYER → renderują się TYLKO emitery
  //      (exhaust/wraki/eksplozje) na czarnym tle → bloomComposer liczy glow.
  //   2) final: camera.layers przywrócone → pełna scena + mixPass domieszkuje bloom.
  // Gwiazda/tło/planety (layer 0) są niewidoczne w passie 1 → NIE bloomują.
  _renderSelectiveBloom() {
    const cam = this.camera;
    const savedMask = cam.layers.mask;
    cam.layers.set(BLOOM_LAYER);       // tylko warstwa bloom
    this._bloomComposer.render();
    cam.layers.mask = savedMask;       // przywróć pełną widoczność
    this._finalComposer.render();
  }

  // Animacja chmur — co klatkę, niezaleznie od pauzy gry
  _tickClouds() {
    for (const [, entry] of this._planets) {
      for (const child of entry.group.children) {
        if (child.userData.isCloud && child.material?.uniforms?.uTime) {
          child.material.uniforms.uTime.value += 0.016;
        }
      }
    }
  }

  getCamera() { return this.camera; }

  // ── M3 P1.2 — public accessors dla raycaster (GameScene._resolveClickTarget) ─
  // getScene/getCanvas — Three.js scene + WebGL canvas dla mouseToNDC.
  // getRaycaster — reuse istniejącej instancji this._ray (nie twórz nowej per klik).
  getScene() { return this.scene; }
  getCanvas() { return this.renderer?.domElement ?? this.canvas; }
  getRaycaster() { return this._ray; }

  // Rejestracja kontrolera kamery (ustawiany przez GameScene)
  setCameraController(ctrl) {
    this._cameraController = ctrl;
    this._frameActiveSystem();  // ramka startowa układu (skala 3D ↔ tactical)
  }

  // ── Skala 3D ↔ tactical: ramka startowa kamery ────────────────────────
  // Maks. promień orbitalny aktywnego układu (AU) — IDENTYCZNA logika co mapa
  // taktyczna (planety + planetoidy). Margines kadru jest w SYSTEM_FIT_DIST_PER_AU,
  // więc tu zwracamy surowy maksymalny zasięg (bez paddingu ×1.15 mapy taktycznej).
  _computeSystemExtentAU() {
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    let maxOrbitAU = 1;  // AU
    for (const p of (EntityManager.getByTypeInSystem('planet', sysId) || [])) {
      const a = p.orbital?.a ?? 0;  // AU
      if (a > maxOrbitAU) maxOrbitAU = a;
    }
    for (const pd of (EntityManager.getByTypeInSystem('planetoid', sysId) || [])) {
      const a = pd.orbital?.a ?? 0;  // AU
      if (a > maxOrbitAU) maxOrbitAU = a;
    }
    return maxOrbitAU;
  }

  // Dopasuj kamerę tak, by cały układ był widoczny przy starcie/zmianie układu
  // (odpowiednik fit-to-bounds mapy taktycznej). No-op gdy kontroler niewpięty.
  _frameActiveSystem() {
    if (!this._cameraController?.frameSystem) return;
    this._cameraController.frameSystem(this._computeSystemExtentAU());
  }

  // ── Vessel sprites ──────────────────────────────────────────────────

  // ── Modele 3D statków ──────────────────────────────────────────
  // Plik modelu i rozmiar wybierane przez VesselModelResolver wg napędu
  // (nonwarp/warp) i klasy (small/medium/large × science/cargo/colony + frigate/
  // destroyer/battleship). 24 pliki `<klucz>.glb` w assets/models/ships/;
  // brakujący plik → VESSEL_MODEL_DEFAULT (`default.glb`). Skala = normalizacja
  // bounding-box do VESSEL_TARGET_SIZE (resolver), więc dowolny model gracza
  // renderuje się spójnie bez ręcznego dobierania mnożnika per plik.

  // Stacja orbitalna — model GLB (S3.3b-S4a).
  // STATION_MODEL_MAP keyed po station.stationType → gotowe pod przyszły potrójny moduł / Tier 2.
  static STATION_MODEL_MAP = { orbital_station: 'assets/models/stations/Ring_Station.glb' };
  static STATION_MODEL_DEFAULT = 'assets/models/stations/Ring_Station.glb';
  // Native bbox max 1.911 j. × 0.015 ≈ 0.029 j. średnicy (~rozmiar księżyca lub mniejszy).
  // Live-gate 2026-06-06: 0.037→0.030 dalej za duża (wielkość planety, nieproporcjonalna) → 0.015.
  // Proporcje > rozmiar na mapie (focus+zoom rozwiązuje widoczność z daleka). STOP-IF-WRONG.
  static STATION_SCALE = 0.015;
  // Pierścień leży natywnie w płaszczyźnie XY modelu (oś cienka = Z); +π/2 wokół X kładzie go
  // płasko w równikowej płaszczyźnie orbitalnej (halo) — mirror placeholder ring.rotation.x.
  static STATION_MODEL_ROT_X = Math.PI / 2;
  // 1.0 = default GLTFLoader (brak KHR_materials_emissive_strength). Tunable gdyby okna za matowe
  // pod NoToneMapping (bez ruszania globalnego tone mappingu — decyzja Filipa).
  static STATION_EMISSIVE_INTENSITY = 1.0;
  // Tint stalowo-niebieski — mnożnik na baseColor (chłodny technologiczny metal; neutralizuje
  // pomarańcz czerwonej gwiazdy). Nakładany na KLON materiału (nie współdzielony template).
  // Tunable: jaśniejszy 0xaabbdd jeśli za ciemno / bardziej stalowy 0x7f93c0 jeśli za mało chłodu.
  static STATION_TINT = 0x8899bb;

  /**
   * Dodaj statek na mapie 3D — model GLB lub sprite (fallback).
   */
  _addVesselSprite(vessel) {
    if (this._vessels.has(vessel.id)) return;

    // Resolver wybiera plik wg napędu+klasy. Jeśli już wiemy że pliku brak
    // (poprzedni load 404) — od razu DEFAULT, bez ponownego nieudanego fetcha.
    const resolved = vesselModelPath(vessel);
    const modelPath = this._missingModelPaths.has(resolved) ? VESSEL_MODEL_DEFAULT : resolved;
    this._addVesselModel3D(vessel, modelPath);
  }

  /**
   * Dodaj model 3D statku (GLB) na mapie.
   */
  _addVesselModel3D(vessel, modelPath) {
    const isEnemy = isEnemyVessel(vessel);
    const color = isEnemy ? 0xff4466 : 0x44cc66;  // crimson dla wroga, cargo-green dla gracza

    // Pozycja startowa
    const px = S(vessel.position?.x ?? 0);
    const pz = S(vessel.position?.y ?? 0);

    const placeModel = (template) => {
      // Nie duplikuj jeśli async callback przyszedł za późno
      if (this._vessels.has(vessel.id)) return;

      // Wrapper Group — pozycja i obrót aplikowane na wrapperze,
      // model wewnątrz wycentrowany przez offset
      const wrapper = new THREE.Group();
      // M3 P1.2 — userData dla raycaster (walk-up parent z child mesh GLB).
      wrapper.userData = { kosmosType: 'vessel', vesselId: vessel.id };

      const model = template.clone();

      // Normalizacja rozmiaru: skaluj model tak, by jego największy wymiar
      // odpowiadał docelowemu rozmiarowi klasy (VESSEL_TARGET_SIZE). Robi to
      // dowolny model gracza o nieznanej skali natywnej spójnym wizualnie.
      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
      const vScale = vesselTargetSize(vessel) / maxDim;
      model.scale.set(vScale, vScale, vScale);

      // Wycentruj geometrię modelu (GLB może mieć offset) — po przeskalowaniu
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center); // przesunięcie do centrum (0,0,0)

      wrapper.add(model);

      // ── Exhaust cone (plume silnika) — child wrappera, NIE modelu ──────────
      // Dziedziczy yaw + banking (aplikowane na wrapperze co klatkę).
      // Live-test: dziób modeli jest w lokalnym −X, więc RUFA = lokalne +X
      // (box.max.x − center.x = +halfWidthX). Stożek obrócony rotation.z=+π/2:
      // apex(+Y)→−X (ku kadłubowi), szeroka podstawa(−Y)→+X (plume za rufą).
      // Apex przy krawędzi rufy (rearX), baza trailing coneLen w tył.
      // Rozmiar zmniejszony ~60% (radius) / do ~połowy kadłuba (length) po live-teście.
      // Modulacja opacity/scale.x w _syncVesselPositions → _applyExhaust.
      let exhaustCone = null;
      if (GAME_CONFIG.FEATURES?.fcCombatFx && !vessel.isWreck) {
        const size = box.getSize(new THREE.Vector3());
        const rearX = box.max.x - center.x;                // rufa w układzie wrappera (+halfWidthX)
        const coneRadius = Math.max(0.012, size.y * 0.04); // ujście dyszy (było 0.08)
        const coneLen    = Math.max(0.03, size.x * 0.02);  // krótka, ~2% kadłuba (było 0.04)
        // 32 segmenty (gładkie krawędzie) + gradient wierzchołkowy RGBA:
        // apex(+Y, przy rufie) jasny + alpha 1, baza(−Y, koniec smugi) alpha 0 →
        // zanikająca smuga plazmowa zamiast twardego stożka.
        const geo = new THREE.ConeGeometry(coneRadius, coneLen, 32, 1, true);
        const grad = exhaustGradientColors({ isEnemy });
        const posAttr = geo.attributes.position;
        const colAttr = new Float32Array(posAttr.count * 4);
        for (let i = 0; i < posAttr.count; i++) {
          const t = (posAttr.getY(i) + coneLen / 2) / coneLen;  // 0=baza(−Y), 1=apex(+Y)
          colAttr[i * 4 + 0] = grad.base.r + (grad.apex.r - grad.base.r) * t;
          colAttr[i * 4 + 1] = grad.base.g + (grad.apex.g - grad.base.g) * t;
          colAttr[i * 4 + 2] = grad.base.b + (grad.apex.b - grad.base.b) * t;
          colAttr[i * 4 + 3] = t;                                // alpha apex1 → baza0
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colAttr, 4));
        const exMat = new THREE.MeshBasicMaterial({
          vertexColors: true, transparent: true, opacity: 0.35, // subtelne (było 0.5)
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        exhaustCone = new THREE.Mesh(geo, exMat);
        exhaustCone.rotation.z = Math.PI / 2;              // baza(−Y) → +X (plume za rufą)
        exhaustCone.position.set(rearX + coneLen / 2, 0, 0); // apex przy rufie, baza w tył
        exhaustCone.renderOrder = 2;
        exhaustCone.visible = false;                        // domyślnie zgaszony (idle)
        exhaustCone.layers.enable(BLOOM_LAYER);             // selective bloom — TYLKO smuga świeci
        wrapper.add(exhaustCone);
      }

      // Pozycja — lekko nad płaszczyzną orbitalną
      wrapper.position.set(px, 0.3, pz);

      // Obrót dziobem w kierunku celu
      if (vessel.mission) {
        const m = vessel.mission;
        const isReturn = m.phase === 'returning';
        let tx = isReturn ? (m.returnTargetX ?? m.liveOriginX ?? 0) : (m.liveTargetX ?? m.targetX ?? 0);
        let ty = isReturn ? (m.returnTargetY ?? m.liveOriginY ?? 0) : (m.liveTargetY ?? m.targetY ?? 0);
        const dx = tx - (vessel.position?.x ?? 0);
        const dy = ty - (vessel.position?.y ?? 0);
        if (dx !== 0 || dy !== 0) {
          // atan2 na płaszczyźnie XZ + korekta osi modelu (dziób wzdłuż +X w GLB)
          wrapper.rotation.y = Math.atan2(dx, dy) + Math.PI / 2;
        }
      }

      // Materiały: zachowaj oryginalne z GLB (gracz) / crimson (wróg) / szary (wrak).
      // Klonujemy, bo materiały GLB są współdzielone z template cache — bez klonu tint
      // rozlałby się na wszystkie statki tego samego modelu (także gracza).
      const isWreck = !!vessel.isWreck;
      const redTint  = new THREE.Color(0xff4466);
      // Wrak — wypalony czarny (kontrast z naturalnym pomarańczowym cargo3d.glb).
      // Wcześniejszy rdzawy #554438 był zbyt podobny do żywych statków.
      // Emissive ciemnoczerwony (0x110000) — ledwo widoczna poświata dogorywających
      // reaktorów, nie ognista aura.
      const wreckColor = new THREE.Color(0x1a1a1a);
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        if (!child.material) return;
        if (isWreck) {
          const mat = child.material.clone();
          if (mat.color)    mat.color.copy(wreckColor);
          if (mat.emissive) mat.emissive.setHex(0x110000);  // ledwo widoczna czerwień
          if (mat.metalness != null)  mat.metalness  = 0.3;
          if (mat.roughness != null)  mat.roughness  = 1.0;  // zupełnie matowy (spalony)
          if (mat.opacity != null)    mat.opacity    = 1.0;
          mat.transparent = false;
          child.material = mat;
        } else if (isEnemy) {
          const mat = child.material.clone();
          if (mat.color)    mat.color.lerp(redTint, 0.55);
          if (mat.emissive) mat.emissive.setHex(0x880022);
          child.material = mat;
        }
      });

      // Wrak — lekki tilt (przechylony kadłub — sygnalizuje uszkodzenie).
      // Bez scale-up — rdzawy kolor wystarczy żeby odróżnić od żywego statku.
      if (isWreck) {
        wrapper.rotation.z = (Math.random() - 0.5) * 0.6;  // ±0.3 rad ≈ ±17°
        wrapper.rotation.x = (Math.random() - 0.5) * 0.4;
      }

      this.scene.add(wrapper);

      // Linia trasy — wraki NIE mają trasy (nic nie lecą)
      let routeLine = null;
      if (vessel.mission && !isWreck) {
        const m = vessel.mission;
        const isReturn = m.phase === 'returning';
        let tx = isReturn ? (m.returnTargetX ?? m.liveOriginX ?? 0) : (m.liveTargetX ?? m.targetX ?? 0);
        let ty = isReturn ? (m.returnTargetY ?? m.liveOriginY ?? 0) : (m.liveTargetY ?? m.targetY ?? 0);
        if (isNaN(tx)) tx = 0;
        if (isNaN(ty)) ty = 0;
        let vx = vessel.position.x, vy = vessel.position.y;
        if (isNaN(vx)) vx = 0;
        if (isNaN(vy)) vy = 0;
        const points = [
          new THREE.Vector3(S(vx), 0.3, S(vy)),  // start: statek (nad płaszczyzną)
          new THREE.Vector3(S(tx), 0.0, S(ty)),   // cel: planeta (na równiku)
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({
          color: this._orderLineColor(vessel), dashSize: 0.3, gapSize: 0.15,
          transparent: true, opacity: ROUTE_LINE_BASE_OPACITY, linewidth: ROUTE_LINE_BASE_WIDTH,
        });
        routeLine = new THREE.Line(geo, lineMat);
        routeLine.computeLineDistances();
        this.scene.add(routeLine);
      }

      // Wrogi statek: początkowa widoczność. Wrak jest widoczny ZAWSZE.
      // M4 P2: jeśli m4EnemyGhosts ON, wywołamy _applyVesselIntelVisibility po
      // _vessels.set — uwzględnia intel quality (rumor/contact/detailed).
      // W przeciwnym wypadku legacy fog-of-war z ObservatorySystem (binarne).
      if (isWreck) {
        wrapper.visible = true;
      } else if (isEnemy && !GAME_CONFIG.FEATURES.m4EnemyGhosts) {
        const obs = window.KOSMOS?.observatorySystem;
        const detected = obs?.isVesselDetected?.(vessel.id) ?? false;
        wrapper.visible = detected;
        if (routeLine) routeLine.visible = detected;
      }

      this._vessels.set(vessel.id, {
        sprite: wrapper, routeLine, color, isModel3D: true,
        enemyTint: isEnemy || isWreck,  // wszystkie sklonowane materiały do dispose
        isWreck,
        exhaust: exhaustCone,           // stożek wydechu (może być null) — modulowany co tick
        _exhaustPhase: Math.random() * Math.PI * 2,  // desync flickeru między statkami
      });

      // M4 P2 — po set: apply intel visibility (rumor ghost / contact dim / detailed)
      if (isEnemy && !isWreck && GAME_CONFIG.FEATURES.m4EnemyGhosts) {
        const entry = this._vessels.get(vessel.id);
        this._applyVesselIntelVisibility(vessel, entry);
      }

      // Wrak — ustaw orbit cache natychmiast, na wyższej warstwie Y niż żywe statki.
      // Flag `isWreck` + `initAngle` pozwalają _calcVisualOrbitFromCache użyć
      // wolnej orbity i wysokiej warstwy cmentarzyska.
      if (isWreck && vessel.position?.dockedAt) {
        entry.isWreck = true;
        const bodyId = vessel.position.dockedAt;
        let bodyR = 0.06;
        const pE = this._planets.get(bodyId);
        if (pE) {
          const ent = this._entityByUUID.get(pE.mesh.uuid);
          bodyR = ent ? this._getEntityRadius(ent) : 0.1;
        } else if (this._moons.has(bodyId)) {
          bodyR = 0.03;
        } else if (this._planetoids.has(bodyId)) {
          bodyR = 0.02;
        }
        entry._orbiting = {
          bodyId,
          orbitR: Math.max(0.5, bodyR * 6.0),
          isWreck: true,
          initAngle: Math.random() * Math.PI * 2,  // losowa faza startowa
        };
      } else if (isWreck && vessel.wreckLocation && vessel.position.dockedAt == null) {
        // M2a deep-space wrak — brak orbity, sprite zamrożony w wreckLocation.
        // Ustawiamy pozycję natychmiast (save/load — sprite inaczej ląduje w (0,0,0)).
        const wx = isNaN(vessel.wreckLocation.x) ? 0 : vessel.wreckLocation.x;
        const wy = isNaN(vessel.wreckLocation.y) ? 0 : vessel.wreckLocation.y;
        wrapper.position.set(S(wx), 0.45, S(wy));
      }
    };

    // Użyj promise-based cache — gwarantuje że równoległe wywołania dla tego
    // samego path dzielą JEDEN request (bez podwójnego pobierania 18 MB pliku)
    this._loadShipModel(modelPath)
      .then(template => placeModel(template))
      .catch(err => {
        console.warn(`[ThreeRenderer] GLB load failed (retry za 400ms): ${modelPath}`, err);
        // Retry po delayu — przeglądarka mogła zwolnić zasoby
        setTimeout(() => {
          this._loadShipModel(modelPath)
            .then(template => placeModel(template))
            .catch(err2 => {
              // Konkretny model klasy nie istnieje (np. gracz nie wgrał pliku) →
              // oznacz jako brakujący i spróbuj DEFAULT, dopiero potem sprite.
              this._missingModelPaths.add(modelPath);
              if (modelPath !== VESSEL_MODEL_DEFAULT) {
                console.warn(`[ThreeRenderer] Brak modelu ${modelPath} — fallback na DEFAULT (${VESSEL_MODEL_DEFAULT})`);
                this._loadShipModel(VESSEL_MODEL_DEFAULT)
                  .then(template => placeModel(template))
                  .catch(err3 => {
                    console.error(`[ThreeRenderer] DEFAULT GLB też nie wczytany — sprite dla ${vessel.name}`, err3);
                    this._addVesselSpriteFallback(vessel);
                  });
              } else {
                console.error(`[ThreeRenderer] DEFAULT GLB nie wczytany — sprite dla ${vessel.name}`, err2);
                this._addVesselSpriteFallback(vessel);
              }
            });
        }, 400);
      });
  }

  // Jeden load per modelPath (deduplikacja). Zwraca Promise<gltf.scene>.
  // Template trafia też do _shipModelTemplates (synchroniczny cache check).
  _loadShipModel(modelPath) {
    if (this._shipModelTemplates.has(modelPath)) {
      return Promise.resolve(this._shipModelTemplates.get(modelPath));
    }
    if (this._shipModelPromises.has(modelPath)) {
      return this._shipModelPromises.get(modelPath);
    }
    const p = new Promise((resolve, reject) => {
      this._gltfLoader.load(
        modelPath,
        (gltf) => {
          this._shipModelTemplates.set(modelPath, gltf.scene);
          resolve(gltf.scene);
        },
        undefined,
        (err) => {
          // Usuń z promise cache żeby retry mógł stworzyć nową promesę
          this._shipModelPromises.delete(modelPath);
          reject(err);
        }
      );
    });
    this._shipModelPromises.set(modelPath, p);
    return p;
  }

  // Preload modelu DEFAULT — gwarantuje natychmiastowy fallback dla statków z save.
  // Modeli per-klasa (18 plików) NIE preloadujemy: są duże i większość może nie
  // istnieć — ładują się leniwie przy pierwszym statku danej klasy (cache w
  // _loadShipModel deduplikuje, _missingModelPaths zapobiega ponownym 404).
  _preloadShipModels() {
    this._loadShipModel(VESSEL_MODEL_DEFAULT).catch(err => {
      console.warn(`[ThreeRenderer] Preload DEFAULT GLB failed: ${VESSEL_MODEL_DEFAULT}`, err);
    });
  }

  /**
   * Fallback: dodaj sprite statku na mapie 3D (Canvas 2D billboard).
   */
  _addVesselSpriteFallback(vessel) {
    if (this._vessels.has(vessel.id)) return;

    const isEnemy = isEnemyVessel(vessel);

    // Kolor wg generacji statku (trail + sprite)
    const typeColors = {
      science_vessel:  0x4488ff,
      cargo_ship:      0x44cc66,
    };
    const gen = vessel.generation ?? 1;
    const color = isEnemy
      ? 0xff4466
      : (typeColors[vessel.shipId] ?? 0x44cc66);  // fallback = cargo_ship

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
    } else {
      // Prostokąt z ładownią — cargo_ship i domyślny fallback
      c.fillRect(7, 4, 18, 16);
      c.fillRect(9, 20, 14, 8);
      c.strokeRect(7, 4, 18, 16);
      c.strokeRect(9, 20, 14, 8);
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
    // M3 P1.2 — kosmosType dla raycaster filter (zachowano legacy 'type' dla wstecznej kompat).
    sprite.userData = { kosmosType: 'vessel', type: 'vessel', vesselId: vessel.id };

    this.scene.add(sprite);

    // Linia trasy (przerywana, 2 punkty: statek → cel)
    let routeLine = null;
    if (vessel.mission) {
      const m = vessel.mission;
      const isReturn = m.phase === 'returning';
      let tx = isReturn ? (m.returnTargetX ?? m.liveOriginX ?? 0) : (m.liveTargetX ?? m.targetX ?? 0);
      let ty = isReturn ? (m.returnTargetY ?? m.liveOriginY ?? 0) : (m.liveTargetY ?? m.targetY ?? 0);
      if (isNaN(tx)) tx = 0;
      if (isNaN(ty)) ty = 0;
      let vx = vessel.position.x, vy = vessel.position.y;
      if (isNaN(vx)) vx = 0;
      if (isNaN(vy)) vy = 0;
      const points = [
        new THREE.Vector3(S(vx), 0.3, S(vy)),  // start: statek (nad płaszczyzną)
        new THREE.Vector3(S(tx), 0.0, S(ty)),   // cel: planeta (na równiku)
      ];

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineDashedMaterial({
        color: this._orderLineColor(vessel), dashSize: 0.3, gapSize: 0.15,
        transparent: true, opacity: ROUTE_LINE_BASE_OPACITY, linewidth: ROUTE_LINE_BASE_WIDTH,
      });
      routeLine = new THREE.Line(geo, lineMat);
      routeLine.computeLineDistances();
      this.scene.add(routeLine);
    }

    // Wrogi fallback sprite — widoczność initial. M4 P2 intel-aware ścieżka
    // po _vessels.set (wymaga entry); fallback legacy gdy flag off.
    if (isEnemy && !GAME_CONFIG.FEATURES.m4EnemyGhosts) {
      const obs = window.KOSMOS?.observatorySystem;
      const detected = obs?.isVesselDetected?.(vessel.id) ?? false;
      sprite.visible = detected;
      if (routeLine) routeLine.visible = detected;
    }

    this._vessels.set(vessel.id, { sprite, routeLine, tex, color, enemyTint: isEnemy });

    // M4 P2 — apply intel ghosts dla fallback sprite (po set, helper iteruje sprite materials)
    if (isEnemy && GAME_CONFIG.FEATURES.m4EnemyGhosts) {
      this._applyVesselIntelVisibility(vessel, this._vessels.get(vessel.id));
    }
  }

  /**
   * Usuń sprite statku z mapy 3D.
   */
  _removeVesselSprite(vesselId) {
    const entry = this._vessels.get(vesselId);
    if (!entry) return;

    this.scene.remove(entry.sprite);

    if (entry.isModel3D) {
      // Model 3D — dispose geometrii klonów (materiały współdzielone z templatem,
      // chyba że to wrogi statek, gdzie każdy mesh dostał sklonowany materiał z tintem).
      const disposeMats = !!entry.enemyTint;
      entry.sprite.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        if (disposeMats && child.material) child.material.dispose();
      });
    } else {
      // Sprite billboard — dispose materiału i tekstury
      entry.sprite.material.dispose();
      if (entry.tex) entry.tex.dispose();
    }

    // Stożek wydechu — materiał additive statku GRACZA nie jest kryty warunkiem
    // enemyTint w traverse wyżej (disposeMats=false), więc dispose jawnie.
    if (entry.exhaust) {
      entry.exhaust.geometry?.dispose();
      entry.exhaust.material?.dispose();
    }

    // Jeśli skończony hover był na tym statku — wyczyść
    if (this._hoverVesselId === vesselId) this._hoverVesselId = null;

    if (entry.routeLine) {
      this.scene.remove(entry.routeLine);
      entry.routeLine.geometry.dispose();
      entry.routeLine.material.dispose();
    }
    this._vessels.delete(vesselId);
  }

  /**
   * Co-klatkowa animacja orbitujących obiektów (statków, wraków, stacji, satelit).
   * Pozycja pobierana z OrbitalSpaceSystem — centralny rejestr sferycznych
   * koordynatów (r, θ, φ) z gwarantowanym min-angular-spacing między obiektami.
   * Żywe statki rotują się w kierunku ruchu orbitalnego; wraki zachowują statyczny
   * tilt z chwili zniszczenia (nadany w vessel:wrecked handler).
   */
  _tickOrbitingVessels() {
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    const vm = window.KOSMOS?.vesselManager;
    const tSec = performance.now() * 0.001;
    for (const [id, entry] of this._vessels) {
      // Fix desync 3D↔tactical (M4): statek w stanie 'orbiting' z dockedAt=null jest w
      // WOLNEJ PRZESTRZENI (engage / pursue-hold / drift), NIE orbituje ciała — jego
      // pozycję bierzemy z realnego vessel.position.x/y. Bez tego nieaktualna orbita w
      // OrbitalSpaceSystem (nie zwalniana po _issueEngage, bo engage nie przechodzi przez
      // in_transit/dock) pinowała sprite do ciała macierzystego (~1 AU), podczas gdy statek
      // walczył 16 AU dalej (tactical czyta x/y wprost → był poprawny). dockedAt to źródło
      // prawdy: bodyId ⇒ orbita, null ⇒ wolna przestrzeń. Wraki pomijamy (mają graveyard-
      // orbit lub wreckLocation w _syncVesselPositions).
      const v = vm?.getVessel?.(id);
      if (v && !v.isWreck && v.position?.state === 'orbiting' && v.position?.dockedAt == null) {
        const vx = isNaN(v.position.x) ? 0 : v.position.x;
        const vy = isNaN(v.position.y) ? 0 : v.position.y;
        entry.sprite.position.set(S(vx), 0.3, S(vy));
        continue;
      }
      if (!orbital) continue;
      const orb = orbital.getOrbit(id);
      if (!orb) continue;
      // Pozycja planety w world-space
      const pEntry = this._planets.get(orb.planetId);
      const planetPos = pEntry
        ? { x: pEntry.group.position.x, z: pEntry.group.position.z }
        : this._moons.get(orb.planetId)
          ? { x: this._moons.get(orb.planetId).mesh.position.x, z: this._moons.get(orb.planetId).mesh.position.z }
          : this._planetoids.get(orb.planetId)
            ? { x: this._planetoids.get(orb.planetId).mesh.position.x, z: this._planetoids.get(orb.planetId).mesh.position.z }
            // Slice 8b — statek orbitujący STACJĘ (dock/undock przy stacji) — śledzi mesh stacji
            // (która sama podąża za planetą). Bez tego sprite zamarzał (stacja NIE w _planets/_moons).
            : this._stations.get(orb.planetId)
              ? { x: this._stations.get(orb.planetId).mesh.position.x, z: this._stations.get(orb.planetId).mesh.position.z }
              : null;
      if (!planetPos) continue;
      const pos = orbital.getPosition(id, planetPos, tSec);
      if (!pos) continue;
      entry.sprite.position.set(pos.x, pos.y, pos.z);
      // Żywe statki: obrót w kierunku ruchu orbity. Wraki/stacje: bez rotacji.
      if (entry.isModel3D && !entry.isWreck && !orb.anchored) {
        entry.sprite.rotation.y = pos.theta + Math.PI;
      }
    }
  }

  /**
   * Dodaj mesh stacji orbitalnej. Proceduralny placeholder (rdzeń-sfera + pierścień-torus) pojawia
   * się NATYCHMIAST, a model GLB (S3.3b-S4a) doładowuje się async i podmienia placeholder — 16 MB
   * ładuje się kilka s, bez placeholdera stacja „znika". NIE w _clickable (selekcja = S3.3b-S4).
   * Pozycja co klatkę w _tickOrbitingStations (anchored, bez rotacji).
   */
  _addStationMesh(station) {
    if (!station?.id || this._stations.has(station.id)) return;
    const col = station.visual?.color ?? 0x44aaff;

    // 1) Proceduralny placeholder NATYCHMIAST — pokrywa ~kilkusekundowe ładowanie GLB
    //    i jest trwałym fallbackiem, gdyby load się nie powiódł.
    const group = new THREE.Group();
    // Rdzeń — mała sfera
    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x8899aa, emissive: 0x223344, roughness: 0.5, metalness: 0.6 })
    );
    group.add(hub);
    // Pierścień dokujący — torus leżący w płaszczyźnie równikowej (halo)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.02, 0.006, 10, 28),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.3 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // userData na Group — raycast w handleClick mapuje hit (child mesh GLB/placeholder) → stationId (focus kamery).
    group.userData = { kosmosType: 'station', stationId: station.id };
    this.scene.add(group);
    this._stations.set(station.id, { mesh: group, isModel3D: false, placeholder: [hub, ring] });
    // 9f: natychmiastowe pozycjonowanie — spawn na twardej pauzie nie zostaje w origin.
    this._tickOrbitingStations();

    // 2) Async GLB → podmiana placeholdera (mirror _addVesselModel3D: _loadShipModel + retry-once;
    //    finalny fallback = placeholder zostaje, nie sprite).
    const modelPath = ThreeRenderer.STATION_MODEL_MAP[station.stationType] ?? ThreeRenderer.STATION_MODEL_DEFAULT;
    const t0 = performance.now();
    this._loadShipModel(modelPath)
      .then(template => this._swapStationModel(station.id, template, t0))
      .catch(err => {
        console.warn(`[ThreeRenderer] Station GLB load failed (retry za 400ms): ${modelPath}`, err);
        setTimeout(() => {
          this._loadShipModel(modelPath)
            .then(template => this._swapStationModel(station.id, template, t0))
            .catch(err2 => {
              console.error(`[ThreeRenderer] Station GLB load failed finalnie: ${modelPath} — placeholder zostaje`, err2);
            });
        }, 400);
      });
  }

  /**
   * Podmień proceduralny placeholder stacji na model GLB (S3.3b-S4a). Mirror placeModel z
   * _addVesselModel3D: clone template (geometria/materiały współdzielone z _shipModelTemplates),
   * scale, wycentruj (Box3), połóż pierścień płasko, ustaw emissiveIntensity. Guard-first: stacja
   * mogła zostać usunięta w trakcie ładowania albo być już podmieniona.
   */
  _swapStationModel(stationId, template, t0) {
    const entry = this._stations.get(stationId);
    if (!entry || entry.isModel3D) return;

    const model = template.clone();
    const s = ThreeRenderer.STATION_SCALE;
    model.scale.set(s, s, s);

    // Wycentruj geometrię (GLB origin ~0, ale spójnie z vesselem)
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    // Pierścień płasko w płaszczyźnie orbitalnej (mirror placeholder ring.rotation.x)
    model.rotation.x = ThreeRenderer.STATION_MODEL_ROT_X;

    const tint = new THREE.Color(ThreeRenderer.STATION_TINT);
    model.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      if (!child.material) return;
      const mat = child.material.clone();                 // tint NIE przebarwi współdzielonego templatu
      if (mat.color)    mat.color.copy(tint);             // mnożnik baseColor → chłodny stalowy metal
      if (mat.emissive) mat.emissiveIntensity = ThreeRenderer.STATION_EMISSIVE_INTENSITY; // okna nietknięte
      child.material = mat;
    });

    // Podmiana children tej samej Group: usuń placeholder (własne zasoby → dispose), dodaj GLB.
    const group = entry.mesh;
    for (const ph of (entry.placeholder ?? [])) {
      group.remove(ph);
      ph.geometry?.dispose?.();
      ph.material?.dispose?.();
    }
    group.add(model);
    entry.isModel3D = true;
    entry.tintedMats = true;   // materiały sklonowane (tint) → _removeStationMesh musi je dispose
    entry.placeholder = null;

    // Pomiar dla live-gate (dane, nie zgadywanie): czas load+swap + VRAM (geometries/textures).
    const dt = (performance.now() - t0).toFixed(0);
    console.info(`[ThreeRenderer] Station GLB '${stationId}' load+swap: ${dt}ms; renderer.info.memory=`, this.renderer?.info?.memory);
  }

  /** Usuń mesh stacji. Dispose świadomy isModel3D (mirror _removeVesselSprite). */
  _removeStationMesh(stationId) {
    if (this._focusStationId === stationId) this._focusStationId = null; // przerwij focus kamery
    const entry = this._stations.get(stationId);
    if (!entry) return;
    if (entry.mesh) {
      this.scene.remove(entry.mesh);
      if (entry.isModel3D) {
        // Geometria współdzielona (benign re-upload). Materiał: dispose TYLKO klonu tintu (tintedMats);
        // .dispose() NIE rusza współdzielonych tekstur (żyją w templacie cache).
        entry.mesh.traverse(child => {
          if (!child.isMesh) return;
          child.geometry?.dispose?.();
          if (entry.tintedMats && child.material) child.material.dispose();
        });
      } else {
        // Proceduralny placeholder — własne geometrie i materiały.
        entry.mesh.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      }
    }
    this._stations.delete(stationId);
  }

  /**
   * Co-klatkowa pozycja stacji — z OrbitalSpaceSystem (anchored → zamrożona względem
   * planety, ale podąża za nią gdy planeta orbituje). Mirror _tickOrbitingVessels; bez rotacji.
   */
  _tickOrbitingStations() {
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (!orbital || this._stations.size === 0) return;
    const tSec = performance.now() * 0.001;
    for (const [id, entry] of this._stations) {
      const orb = orbital.getOrbit(id);
      if (!orb) continue;
      const pEntry = this._planets.get(orb.planetId);
      const planetPos = pEntry
        ? { x: pEntry.group.position.x, z: pEntry.group.position.z }
        : this._moons.get(orb.planetId)
          ? { x: this._moons.get(orb.planetId).mesh.position.x, z: this._moons.get(orb.planetId).mesh.position.z }
          : this._planetoids.get(orb.planetId)
            ? { x: this._planetoids.get(orb.planetId).mesh.position.x, z: this._planetoids.get(orb.planetId).mesh.position.z }
            : null;
      if (!planetPos) continue;
      const pos = orbital.getPosition(id, planetPos, tSec);
      if (!pos) continue;
      entry.mesh.position.set(pos.x, pos.y, pos.z);
      // Anchored — brak rotacji wokół planety i brak self-spin (stacja statyczna).
    }
  }

  /**
   * Szybka wersja obliczenia orbity (z cache'owanych danych ciała, bez lookup entity).
   * Dla wraków używa innej warstwy Y i wolniejszej prędkości — cmentarzysko
   * orbitalne leży "ponad" płaszczyzną żywych statków, żeby nie kolidować wizualnie.
   */
  _calcVisualOrbitFromCache(cache, vesselId) {
    const { bodyId, orbitR, isWreck, initAngle } = cache;
    // Zaktualizuj pozycję ciała (może się poruszać)
    let bodyX, bodyZ;
    const pEntry = this._planets.get(bodyId);
    if (pEntry) { bodyX = pEntry.group.position.x; bodyZ = pEntry.group.position.z; }
    if (bodyX == null) {
      const mEntry = this._moons.get(bodyId);
      if (mEntry) { bodyX = mEntry.mesh.position.x; bodyZ = mEntry.mesh.position.z; }
    }
    if (bodyX == null) {
      const pdEntry = this._planetoids.get(bodyId);
      if (pdEntry) { bodyX = pdEntry.mesh.position.x; bodyZ = pdEntry.mesh.position.z; }
    }
    if (bodyX == null) return null;

    let angle;
    let oy;
    if (isWreck) {
      // Wrak: losowa stała faza + wolna orbita + wysoka warstwa Y (cmentarzysko)
      const orbitSpeed = 0.05;  // 8× wolniej niż żywe statki
      angle = (initAngle ?? 0) + (performance.now() * 0.001) * orbitSpeed;
      oy = 0.45;  // znacznie wyżej niż 0.02 żywych — wizualnie osobna warstwa
    } else {
      const idHash = hashCode(vesselId);
      const phaseOffset = (idHash % 1000) / 1000 * Math.PI * 2;
      const orbitSpeed = 0.4;
      angle = (performance.now() * 0.001) * orbitSpeed + phaseOffset;
      oy = 0.02;
    }

    return {
      ox: bodyX + orbitR * Math.cos(angle),
      oz: bodyZ + orbitR * Math.sin(angle),
      oy,
      angle,
    };
  }

  /**
   * Synchronizuj pozycje vessel sprites z danymi z VesselManager.
   */
  /**
   * Oblicz wizualną pozycję orbitalną statku wokół ciała.
   * Czysto wizualne — nie zmienia danych w VesselManager.
   * @returns {{ ox, oz, oy, angle }|null} — pozycja w Three.js lub null
   */
  _calcVisualOrbit(vessel, entry) {
    const bodyId = vessel.position?.dockedAt ?? vessel.mission?.targetId;
    if (!bodyId) return null;

    // Znajdź wizualną pozycję i promień ciała
    let bodyX, bodyZ, bodyR;
    const pEntry = this._planets.get(bodyId);
    if (pEntry) {
      bodyX = pEntry.group.position.x;
      bodyZ = pEntry.group.position.z;
      const entity = this._entityByUUID.get(pEntry.mesh.uuid);
      bodyR = entity ? this._getEntityRadius(entity) : 0.1;
    }
    if (bodyX == null) {
      const mEntry = this._moons.get(bodyId);
      if (mEntry) {
        bodyX = mEntry.mesh.position.x;
        bodyZ = mEntry.mesh.position.z;
        const entity = this._entityByUUID.get(mEntry.mesh.uuid);
        bodyR = entity ? this._getEntityRadius(entity) : 0.03;
      }
    }
    if (bodyX == null) {
      const pdEntry = this._planetoids.get(bodyId);
      if (pdEntry) {
        bodyX = pdEntry.mesh.position.x;
        bodyZ = pdEntry.mesh.position.z;
        bodyR = 0.02;
      }
    }
    if (bodyX == null) return null;

    // Promień orbity — 2× promień ciała (minimum 0.06 żeby nie wchodzić w mesh)
    const orbitR = Math.max(0.06, bodyR * 2.0);

    // Kąt orbity — czas + offset per statek (deterministyczny z ID)
    const idHash = hashCode(vessel.id);
    const phaseOffset = (idHash % 1000) / 1000 * Math.PI * 2; // unikalne fazy
    const orbitSpeed = 0.4; // rad/s — pełna orbita ~15.7s
    const angle = (performance.now() * 0.001) * orbitSpeed + phaseOffset;

    const ox = bodyX + orbitR * Math.cos(angle);
    const oz = bodyZ + orbitR * Math.sin(angle);
    const oy = 0.02; // tuż nad równikiem

    return { ox, oz, oy, angle, orbitR, bodyX, bodyZ };
  }

  _syncVesselPositions(vessels) {
    const activeSys = window.KOSMOS?.activeSystemId ?? 'sys_home';
    for (const vessel of vessels) {
      const inActiveSys = vessel.systemId === activeSys;
      const entry = this._vessels.get(vessel.id);

      // Statek nie należy do aktywnego układu → usuń sprite jeśli istnieje
      if (!inActiveSys) {
        if (entry) this._removeVesselSprite(vessel.id);
        continue;
      }

      // Slice 8b — statek ZADOKOWANY nie ma sprite'a (schowany w hangarze/stacji). RACE: gdy dock
      // odpala w tym samym _updatePositions ticku co arrival, vessel:positionUpdate{vessels:moving}
      // niesie zadokowany statek → poniższe `_addVesselSprite` ODTWARZAŁO sprite (statek „wracał").
      // Usuń sprite jeśli istnieje i NIE odtwarzaj — docked = niewidoczny.
      if (vessel.position?.state === 'docked') {
        if (entry) this._removeVesselSprite(vessel.id);
        continue;
      }

      if (!entry) {
        // Vessel w tranzycie ale nie ma sprite'a → stwórz
        this._addVesselSprite(vessel);
        continue;
      }
      // Guard NaN — pozycja statku
      const vx = isNaN(vessel.position.x) ? 0 : vessel.position.x;
      const vy = isNaN(vessel.position.y) ? 0 : vessel.position.y;

      // S3.5a-1 — maintenance tint PRZED rozgałęzieniem stanu: orbiting statki robią `continue`
      //   niżej (linia ~3960), więc wywołanie na końcu pętli ich nie obejmowało → immobilized
      //   orbiter zostawał bez szarości. Player-only (no-op dla wrogów/wraków w samym helperze).
      this._applyVesselMaintenanceTint(vessel, entry);

      // Exhaust cone — PRZED rozgałęzieniem stanu (orbiting robi `continue` niżej):
      // pełny plume w tranzycie, zgaszony przy orbiting/docked/wrak.
      this._applyExhaust(vessel, entry);

      // ── Statek orbituje ciało — pozycja zarządzana przez OrbitalSpaceSystem ──
      // `_tickOrbitingVessels()` co klatkę pobiera pozycję z centralnego rejestru
      // i ustawia sprite. Tu tylko usuwamy routeLine (nie lecimy nigdzie).
      if (vessel.position?.state === 'orbiting') {
        if (entry.routeLine) {
          this.scene.remove(entry.routeLine);
          entry.routeLine.geometry.dispose();
          entry.routeLine.material.dispose();
          entry.routeLine = null;
        }
        // M2a: deep-space wrak (isWreck + wreckLocation + brak dockedAt) — wrak
        // nie ma orbity w OrbitalSpaceSystem, więc _tickOrbitingVessels go nie
        // poruszy. Sprite pozostawiłby ostatnią pozycję (lub (0,0,0) po load).
        // Ustawiamy pozycję z wreckLocation (wyższa warstwa Y — cmentarzysko).
        if (vessel.isWreck && vessel.wreckLocation && vessel.position.dockedAt == null) {
          const wx = isNaN(vessel.wreckLocation.x) ? 0 : vessel.wreckLocation.x;
          const wy = isNaN(vessel.wreckLocation.y) ? 0 : vessel.wreckLocation.y;
          entry.sprite.position.set(S(wx), 0.45, S(wy));
        } else if (!vessel.isWreck && vessel.position.dockedAt == null) {
          // Spójność z _tickOrbitingVessels: orbiting w wolnej przestrzeni (engage/drift,
          // dockedAt=null) — pozycja z real x,y, NIE z nieaktualnej orbity macierzystej.
          entry.sprite.position.set(S(vx), 0.3, S(vy));
        }
        continue;
      }

      // ── Statek w locie — linia trasy + opadanie ku celowi ────────
      if (vessel.mission) {
        const m = vessel.mission;
        const isReturn = m.phase === 'returning';
        // Cel: outbound → liveTargetX/Y (aktualizowany co tick), return → returnTargetX/Y (śledzony live)
        let tx = isReturn ? (m.returnTargetX ?? m.liveOriginX ?? 0) : (m.liveTargetX ?? m.targetX ?? 0);
        let ty = isReturn ? (m.returnTargetY ?? m.liveOriginY ?? 0) : (m.liveTargetY ?? m.targetY ?? 0);
        if (isNaN(tx)) tx = 0;
        if (isNaN(ty)) ty = 0;

        // Oblicz wysokość Y — statek opada ku planecie w miarę zbliżania
        const dx = tx - vx;
        const dy = ty - vy;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);
        const ox = m.originX ?? m.liveOriginX ?? vx;
        const oy = m.originY ?? m.liveOriginY ?? vy;
        const totalDist = Math.sqrt((tx - ox) * (tx - ox) + (ty - oy) * (ty - oy));
        const ratio = totalDist > 0 ? Math.min(1, distToTarget / totalDist) : 0;
        const shipY = 0.3 * ratio;

        entry.sprite.position.set(S(vx), shipY, S(vy));

        // Model 3D — obróć dziobem w kierunku celu (+ Slice 6 banking roll w skręcie)
        if (entry.isModel3D) {
          if (dx !== 0 || dy !== 0) {
            const yaw = Math.atan2(dx, dy) + Math.PI / 2;
            if (GAME_CONFIG.FEATURES?.fcMovementFx && entry._prevYaw != null) {
              let dYaw = yaw - entry._prevYaw;
              while (dYaw >  Math.PI) dYaw -= 2 * Math.PI;
              while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
              const targetRoll = Math.max(-0.5, Math.min(0.5, dYaw * 12));  // przechył ∝ zmiana kursu
              entry.sprite.rotation.z += (targetRoll - entry.sprite.rotation.z) * 0.15;  // lerp do 0 gdy prosto
            }
            entry._prevYaw = yaw;
            entry.sprite.rotation.y = yaw;
          }
        }

        if (!entry.routeLine) {
          const savedColor = entry.color ?? 0xaaaaaa;
          const pts = [
            new THREE.Vector3(S(vx), shipY, S(vy)),
            new THREE.Vector3(S(tx), 0.0, S(ty)),
          ];
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const lineMat = new THREE.LineDashedMaterial({
            color: this._orderLineColor(vessel), dashSize: 0.3, gapSize: 0.15,
            transparent: true, opacity: ROUTE_LINE_BASE_OPACITY, linewidth: ROUTE_LINE_BASE_WIDTH,
          });
          entry.routeLine = new THREE.Line(geo, lineMat);
          entry.routeLine.computeLineDistances();
          this.scene.add(entry.routeLine);
        } else {
          const posArr = entry.routeLine.geometry.attributes.position.array;
          posArr[0] = S(vx); posArr[1] = shipY; posArr[2] = S(vy);
          posArr[3] = S(tx); posArr[4] = 0.0;   posArr[5] = S(ty);
          entry.routeLine.geometry.attributes.position.needsUpdate = true;
          entry.routeLine.computeLineDistances();
        }
      } else {
        // Brak misji — statek na stałej wysokości
        entry.sprite.position.set(S(vx), 0.3, S(vy));
        if (entry.routeLine) {
          this.scene.remove(entry.routeLine);
          entry.routeLine.geometry.dispose();
          entry.routeLine.material.dispose();
          entry.routeLine = null;
        }
      }

      // M4 P2 — enemy intel-gated rendering (rumor ghost / contact dim / detailed full)
      this._applyVesselIntelVisibility(vessel, entry);
      // maintenance tint — patrz wyżej (przeniesione PRZED rozgałęzienie stanu, by objąć orbiterów)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // S3.5a-1 — Maintenance tint (immobilized player vessels)
  // ─────────────────────────────────────────────────────────────
  // Statek gracza z >=2 latami zaległego utrzymania floty (VesselManager.isImmobilized)
  // dostaje szary tint + opacity 0.6. Cache _origColorHex/_origOpacity per materiał,
  // przywracane gdy statek znów opłacony. Rozłączne z intel-tint (intel = enemy-only).
  _applyVesselMaintenanceTint(vessel, entry) {
    if (!entry || entry.isWreck) return;
    if (isEnemyVessel(vessel)) return;   // ścieżka intel zarządza wrogami
    const immobilized = window.KOSMOS?.vesselManager?.isImmobilized?.(vessel) ?? false;
    if (entry._maintImmobilized === immobilized) return;   // bez zmian — pomiń
    entry._maintImmobilized = immobilized;

    const applyToMat = (mat) => {
      if (!mat) return;
      if (mat.color && mat.userData._maintOrigColorHex === undefined) {
        mat.userData._maintOrigColorHex = mat.color.getHex();
      }
      if (mat.userData._maintOrigOpacity === undefined) {
        mat.userData._maintOrigOpacity = mat.opacity ?? 1.0;
        mat.userData._maintOrigTransparent = mat.transparent ?? false;
      }
      if (immobilized) {
        if (mat.color) mat.color.setRGB(0.5, 0.5, 0.5);
        mat.opacity = 0.6 * (mat.userData._maintOrigOpacity ?? 1.0);
        mat.transparent = true;
      } else {
        if (mat.color && mat.userData._maintOrigColorHex !== undefined) {
          mat.color.setHex(mat.userData._maintOrigColorHex);
        }
        mat.opacity = mat.userData._maintOrigOpacity ?? 1.0;
        mat.transparent = mat.userData._maintOrigTransparent ?? false;
      }
      mat.needsUpdate = true;
    };
    if (entry.sprite?.isSprite) {
      applyToMat(entry.sprite.material);
    } else {
      entry.sprite?.traverse?.(child => {
        if ((child.isMesh || child.isSprite) && child.material) applyToMat(child.material);
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // M4 P2 — Enemy ghosts (intel-gated rendering)
  // ─────────────────────────────────────────────────────────────
  // Per wrogi vessel: quality z IntelSystem.getVesselContact → rendering:
  //   unknown  → sprite.visible=false (fog of war)
  //   rumor    → ghost w positionLastKnown, opacity 0.3 × fade(yearsAgo/RUMOR_FADE_YEARS)
  //   contact  → sprite w aktualnej pozycji, opacity 0.5
  //   detailed → pełny sprite (opacity 1.0)
  // Fallback gdy FEATURES.m4EnemyGhosts=false: legacy fog-of-war via
  // ObservatorySystem.isVesselDetected (binary visible).

  _applyVesselIntelVisibility(vessel, entry) {
    if (!entry || entry.isWreck) return;
    if (!isEnemyVessel(vessel)) return;

    // Legacy ścieżka — binarna widoczność z ObservatorySystem
    if (!GAME_CONFIG.FEATURES.m4EnemyGhosts) {
      const detected = window.KOSMOS?.observatorySystem?.isVesselDetected?.(vessel.id) ?? false;
      entry.sprite.visible = detected;
      if (entry.routeLine) entry.routeLine.visible = detected;
      return;
    }

    const intelSys = window.KOSMOS?.intelSystem;
    const rec = intelSys?.getVesselContact?.(vessel.id) ?? null;
    const obsSys = window.KOSMOS?.observatorySystem;
    const detected = obsSys?.isVesselDetected?.(vessel.id) ?? false;

    // Quality z intel + override przez aktualną detekcję. Detekcja obserwatorium to ZDALNY radar —
    // gwarantuje min. 'rumor' (ghost position-only, bez tożsamości), NIE 'contact'. Pełny 'contact'
    // (żywy + tożsamość) rezerwujemy dla bliskiego spotkania proximity. Bump unknown→rumor łata
    // wyścig eventów per tick (detekcja zadziałała, zanim recordSighting zapisał rekord intel).
    let quality = rec?.quality ?? 'unknown';
    if (detected && quality === 'unknown') quality = 'rumor';

    if (quality === 'unknown') {
      entry.sprite.visible = false;
      if (entry.routeLine) entry.routeLine.visible = false;
      entry.intelQuality = 'unknown';
      return;
    }

    let opacity = 1.0;
    let posOverride = null;
    if (quality === 'rumor') {
      const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      const lastSeen = rec?.lastSeenYear ?? gameYear;
      const yearsAgo = Math.max(0, gameYear - lastSeen);
      const fade = Math.max(0, 1 - yearsAgo / GAME_CONFIG.RUMOR_FADE_YEARS);
      opacity = 0.3 * fade;
      if (opacity <= 0.05) {
        entry.sprite.visible = false;
        if (entry.routeLine) entry.routeLine.visible = false;
        entry.intelQuality = 'rumor';
        entry.intelOpacity = 0;
        return;
      }
      // Zamroź sprite w ostatnio znanej pozycji (nie aktualnej)
      posOverride = rec?.positionLastKnown ?? null;
    } else if (quality === 'contact') {
      opacity = 0.5;
    } else {
      opacity = 1.0;
    }

    entry.sprite.visible = true;
    // routeLine widoczna tylko dla 'detailed' — niższe quality nie ujawniają trasy
    if (entry.routeLine) entry.routeLine.visible = (quality === 'detailed');

    this._applyVesselOpacity(entry, opacity);

    if (posOverride && Number.isFinite(posOverride.x) && Number.isFinite(posOverride.y)) {
      entry.sprite.position.set(S(posOverride.x), 0.3, S(posOverride.y));
    }

    entry.intelQuality = quality;
    entry.intelOpacity = opacity;
  }

  _applyVesselOpacity(entry, opacity) {
    if (entry.intelOpacity === opacity) return;
    // Sprite billboard (fallback path) — bezpośrednio .material; nie wchodzi
    // do traverse jako Mesh. Modele GLB — Group z dziećmi Mesh.
    const applyToMat = (mat) => {
      if (!mat) return;
      if (mat.userData._origOpacity === undefined) {
        mat.userData._origOpacity = mat.opacity ?? 1.0;
        mat.userData._origTransparent = mat.transparent ?? false;
      }
      const base = mat.userData._origOpacity ?? 1.0;
      mat.opacity = opacity * base;
      mat.transparent = opacity < 1.0 || mat.userData._origTransparent;
      mat.needsUpdate = true;
    };
    if (entry.sprite?.isSprite) {
      applyToMat(entry.sprite.material);
    } else {
      entry.sprite?.traverse?.(child => {
        if (child.isMesh && child.material) applyToMat(child.material);
        else if (child.isSprite && child.material) applyToMat(child.material);
      });
    }
  }

  // ── Linie handlu cywilnego ──────────────────────────────────────────

  _syncTradeLinePositions() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    for (const line of this._tradeLines) {
      const ud = line.userData;
      if (!ud?.fromId || !ud?.toId) continue;
      const colA = colMgr.getColony(ud.fromId);
      const colB = colMgr.getColony(ud.toId);
      if (!colA?.planet || !colB?.planet) continue;
      const posArr = line.geometry.attributes.position.array;
      posArr[0] = S(colA.planet.x); posArr[1] = 0.05; posArr[2] = S(colA.planet.y);
      posArr[3] = S(colB.planet.x); posArr[4] = 0.05; posArr[5] = S(colB.planet.y);
      line.geometry.attributes.position.needsUpdate = true;
      line.computeLineDistances();
    }
  }

  _clearTradeLines() {
    for (const line of this._tradeLines) {
      line.geometry?.dispose();
      line.material?.dispose();
      this.scene.remove(line);
    }
    this._tradeLines = [];
  }

  _updateTradeLines(connections) {
    this._clearTradeLines();
    if (!connections || connections.length === 0) return;

    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    const activeSys = window.KOSMOS?.activeSystemId ?? 'sys_home';

    for (const conn of connections) {
      const colA = colMgr.getColony(conn.fromId);
      const colB = colMgr.getColony(conn.toId);
      if (!colA?.planet || !colB?.planet) continue;
      // Pokaż tylko połączenia w aktywnym układzie
      if ((colA.systemId ?? 'sys_home') !== activeSys) continue;
      if ((colB.systemId ?? 'sys_home') !== activeSys) continue;

      const ax = colA.planet.x;
      const ay = colA.planet.y;
      const bx = colB.planet.x;
      const by = colB.planet.y;
      if (isNaN(ax) || isNaN(ay) || isNaN(bx) || isNaN(by)) continue;

      // Kolor wg gradient (intensywność handlu)
      const gradient = conn.gradient ?? 0;
      const intensity = Math.min(1, gradient * 3); // 0→0.33 gradient = full intensity
      const r = 0.3 + intensity * 0.7;
      const g = 0.7 + intensity * 0.3;
      const b = 0.3;
      const color = new THREE.Color(r, g, b);

      const points = [
        new THREE.Vector3(S(ax), 0.05, S(ay)),
        new THREE.Vector3(S(bx), 0.05, S(by)),
      ];

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineDashedMaterial({
        color,
        dashSize: 0.5,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.08 + intensity * 0.07, // subtelne — główny efekt to świetliki
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      line.userData = { fromId: conn.fromId, toId: conn.toId };
      this.scene.add(line);
      this._tradeLines.push(line);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Cywilne świetliki handlowe (Trade Fireflies)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Tworzy współdzieloną teksturę diamentowej gwiazdki dla świetlików handlu (32×32).
   * Kształt: romb (diament) z 4 promieniami krzyżowymi, białe/niebieskawe centrum.
   */
  static _createFireflyTexture() {
    const size = 32;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    // Czyste tło
    ctx.clearRect(0, 0, size, size);

    // 1. Delikatna poświata (duży radial gradient)
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.9);
    glowGrad.addColorStop(0.0, 'rgba(200,220,255,0.35)');
    glowGrad.addColorStop(0.3, 'rgba(160,200,255,0.15)');
    glowGrad.addColorStop(0.7, 'rgba(120,170,255,0.05)');
    glowGrad.addColorStop(1.0, 'rgba(100,150,255,0.0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, size, size);

    // 2. Cztery promienie krzyżowe (cienkie linie glow)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let angle = 0; angle < 4; angle++) {
      const rad = (angle * Math.PI) / 2;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const rayLen = cx * 0.85;
      const rayGrad = ctx.createLinearGradient(
        cx, cy, cx + dx * rayLen, cy + dy * rayLen
      );
      rayGrad.addColorStop(0.0, 'rgba(220,235,255,0.9)');
      rayGrad.addColorStop(0.3, 'rgba(180,210,255,0.5)');
      rayGrad.addColorStop(0.7, 'rgba(140,180,255,0.15)');
      rayGrad.addColorStop(1.0, 'rgba(100,150,255,0.0)');
      ctx.strokeStyle = rayGrad;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * rayLen, cy + dy * rayLen);
      ctx.stroke();
    }

    // 3. Cztery ukośne promienie (krótsze, cieńsze — efekt diamentu)
    for (let angle = 0; angle < 4; angle++) {
      const rad = (angle * Math.PI) / 2 + Math.PI / 4;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const rayLen = cx * 0.5;
      const rayGrad = ctx.createLinearGradient(
        cx, cy, cx + dx * rayLen, cy + dy * rayLen
      );
      rayGrad.addColorStop(0.0, 'rgba(200,220,255,0.6)');
      rayGrad.addColorStop(0.5, 'rgba(160,190,255,0.2)');
      rayGrad.addColorStop(1.0, 'rgba(120,160,255,0.0)');
      ctx.strokeStyle = rayGrad;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * rayLen, cy + dy * rayLen);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Jasne centrum — mały romb (diament)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const dSize = 3.0;
    ctx.beginPath();
    ctx.moveTo(cx, cy - dSize);       // góra
    ctx.lineTo(cx + dSize, cy);       // prawo
    ctx.lineTo(cx, cy + dSize);       // dół
    ctx.lineTo(cx - dSize, cy);       // lewo
    ctx.closePath();
    const diamGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dSize);
    diamGrad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    diamGrad.addColorStop(0.5, 'rgba(220,240,255,0.8)');
    diamGrad.addColorStop(1.0, 'rgba(180,210,255,0.3)');
    ctx.fillStyle = diamGrad;
    ctx.fill();
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Przelicz trasy i dopasuj pulę świetlików.
   * Wywoływane z trade:connectionsUpdated.
   */
  _updateTradeFireflyRoutes(connections) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) { this._clearTradeFireflies(); return; }

    // Oblicz transfers per trasa (dane z CivilianTradeSystem)
    const civTrade = window.KOSMOS?.civilianTradeSystem;
    const lastTransfers = civTrade?.getLastTransfers() ?? [];

    // Buduj trasy z intensywnością
    const newRoutes = [];
    const activeSys = window.KOSMOS?.activeSystemId ?? 'sys_home';
    if (connections) {
      for (const conn of connections) {
        const colA = colMgr.getColony(conn.fromId);
        const colB = colMgr.getColony(conn.toId);
        if (!colA?.planet || !colB?.planet) continue;
        // Pokaż tylko trasy w aktywnym układzie
        if ((colA.systemId ?? 'sys_home') !== activeSys) continue;
        if ((colB.systemId ?? 'sys_home') !== activeSys) continue;

        // Oblicz intensywność handlu (sumuj Kr z transferów)
        let krTotal = 0;
        for (const tr of lastTransfers) {
          if ((tr.fromId === conn.fromId && tr.toId === conn.toId) ||
              (tr.fromId === conn.toId && tr.toId === conn.fromId)) {
            krTotal += (tr.exportKr ?? 0) + (tr.importKr ?? 0);
          }
        }
        // Przelicz na roczne (tick = 0.5 civYear)
        const krPerYear = krTotal * 2;

        // Ile świetlików per trasa — 0 gdy brak realnego handlu
        let count;
        if (krPerYear < 1)        count = 0;  // brak transferu → brak wizualizacji
        else if (krPerYear < 20)  count = 1;
        else if (krPerYear < 60)  count = 2;
        else if (krPerYear < 120) count = 3;
        else if (krPerYear < 250) count = 5;
        else if (krPerYear < 500) count = 8;
        else                      count = 12;

        newRoutes.push({
          fromId: conn.fromId,
          toId: conn.toId,
          count,
          intensity: Math.min(1, krPerYear / 300),
          distance: conn.distance ?? 5,
        });
      }
    }
    this._tradeRoutes = newRoutes;

    // Przelicz łączną liczbę potrzebnych świetlików
    let totalNeeded = 0;
    for (const r of newRoutes) totalNeeded += r.count;
    totalNeeded = Math.min(totalNeeded, this._tradeFireflyPool);

    // Recycle / twórz / usuwaj świetliki
    this._resizeFireflyPool(totalNeeded);

    // Przydziel świetliki do tras
    let idx = 0;
    for (const route of this._tradeRoutes) {
      for (let i = 0; i < route.count && idx < this._tradeFireflies.length; i++, idx++) {
        const ff = this._tradeFireflies[idx];
        ff.route = route;
        ff.t = Math.random(); // losowa faza startowa
        // Prędkość: szybsza na krótkich trasach, wolniejsza na długich
        ff.speed = 0.15 + Math.random() * 0.1 + (1 / Math.max(1, route.distance)) * 0.1;
        // Losowy kierunek (A→B lub B→A)
        ff.reverse = Math.random() < 0.5;
        // Losowa wysokość łuku
        ff.arcHeight = 0.2 + Math.random() * 0.4 + Math.min(0.4, route.distance * 0.03);
        // Intensywność → jasność
        ff.brightness = 0.5 + route.intensity * 0.5;
        // Fade-in: nowe gwiazdki pojawiają się płynnie
        if (ff.fadeAlpha === undefined || ff.fadeAlpha < 0.01) ff.fadeAlpha = 0;
        ff.fadeTarget = 1;
        ff.sprite.visible = true;
      }
    }
    // Nadmiarowe: fade-out zamiast natychmiastowego ukrywania
    for (; idx < this._tradeFireflies.length; idx++) {
      this._tradeFireflies[idx].fadeTarget = 0;
      // route zostawiamy do animacji fade-out (usuniemy po zaniku)
    }
  }

  _resizeFireflyPool(targetSize) {
    // Lazy-init tekstury
    if (!this._tradeFireflyTex) {
      this._tradeFireflyTex = ThreeRenderer._createFireflyTexture();
    }

    const current = this._tradeFireflies.length;

    // Dodaj brakujące
    for (let i = current; i < targetSize; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this._tradeFireflyTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.25);
      sprite.visible = false;
      this.scene.add(sprite);
      this._tradeFireflies.push({
        sprite,
        route: null,
        t: 0,
        speed: 0.2,
        reverse: false,
        arcHeight: 0.3,
        brightness: 0.7,
        fadeAlpha: 0,
        fadeTarget: 0,
      });
    }

    // Usuń nadmiarowe
    while (this._tradeFireflies.length > targetSize) {
      const ff = this._tradeFireflies.pop();
      ff.sprite.material.dispose();
      this.scene.remove(ff.sprite);
    }
  }

  /**
   * Animuj świetliki — wywoływane co frame w render loop.
   * Każdy świetlik leci po łuku parabolicznym (oś Y) między dwoma koloniami.
   */
  _animateTradeFireflies(elapsedTime) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    const dt = 0.016; // ~60fps krok (stały, nie zależy od realnego dt)

    for (const ff of this._tradeFireflies) {
      // Animuj fadeAlpha w stronę fadeTarget (fade-in / fade-out)
      const target = ff.fadeTarget ?? 1;
      if (ff.fadeAlpha === undefined) ff.fadeAlpha = 1;
      if (ff.fadeAlpha < target)      ff.fadeAlpha = Math.min(target, ff.fadeAlpha + dt * 1.5);
      else if (ff.fadeAlpha > target) ff.fadeAlpha = Math.max(target, ff.fadeAlpha - dt * 1.5);

      // Po pełnym fade-out: ukryj i zwolnij trasę
      if (ff.fadeAlpha < 0.01 && target === 0) {
        ff.sprite.visible = false;
        ff.route = null;
        continue;
      }

      if (!ff.route || !ff.sprite.visible) continue;

      // Aktualizuj pozycję na trasie
      ff.t += ff.speed * dt;
      if (ff.t >= 1) {
        ff.t -= 1;
        ff.reverse = !ff.reverse; // odwróć kierunek po dotarciu
      }

      // Pobierz pozycje kolonii (aktualne — planety się ruszają)
      const colA = colMgr.getColony(ff.route.fromId);
      const colB = colMgr.getColony(ff.route.toId);
      if (!colA?.planet || !colB?.planet) { ff.sprite.visible = false; continue; }

      const ax = S(colA.planet.x), az = S(colA.planet.y);
      const bx = S(colB.planet.x), bz = S(colB.planet.y);

      // Parametr t (0→1) z opcjonalnym odwróceniem
      const p = ff.reverse ? (1 - ff.t) : ff.t;

      // Pozycja: interpolacja liniowa XZ + łuk paraboliczny Y
      const px = ax + (bx - ax) * p;
      const pz = az + (bz - az) * p;
      const py = ff.arcHeight * Math.sin(p * Math.PI); // parabola: 0→max→0

      ff.sprite.position.set(px, py, pz);

      // Dynamiczny rozmiar: mniejszy na krańcach, większy w środku łuku
      const scaleFactor = 0.18 + Math.sin(p * Math.PI) * 0.12;
      ff.sprite.scale.setScalar(scaleFactor);

      // Fade-in/out na krańcach trasy + iskrzenie gwiazdki
      const edgeFade = Math.sin(p * Math.PI);  // 0→1→0
      const sparkle = 0.7 + Math.sin(elapsedTime * 8 + ff.t * 30) * 0.2
                          + Math.sin(elapsedTime * 13 + ff.t * 17) * 0.1;
      // Płynne pojawianie/znikanie (fadeAlpha animowane w _updateTradeFireflyRoutes)
      const fadeAlpha = ff.fadeAlpha ?? 1;
      ff.sprite.material.opacity = ff.brightness * edgeFade * sparkle * fadeAlpha;
    }
  }

  _clearTradeFireflies() {
    for (const ff of this._tradeFireflies) {
      ff.sprite.material.dispose();
      this.scene.remove(ff.sprite);
    }
    this._tradeFireflies = [];
    this._tradeRoutes = [];
    if (this._tradeFireflyTex) {
      this._tradeFireflyTex.dispose();
      this._tradeFireflyTex = null;
    }
  }

  // ── Live thumbnail ciała niebieskiego (Observatory) ──────────────────
  // Renderuje offscreen snapshot mesha planety/księżyca/planetoidu
  // z oświetleniem zbliżonym do głównej sceny. Zwraca data URL (PNG).
  // Cache: wynik ważny przez THUMB_TTL ms — nie renderuj co frame.

  static THUMB_SIZE = 256;
  static THUMB_TTL  = 10000; // 10s cache

  /**
   * Zwraca data URL (image/png) live-renderu danego ciała.
   * Null jeśli mesh nie istnieje (np. niezbadane ciało).
   */
  renderBodyThumbnail(bodyId) {
    // Sprawdź cache
    const cached = this._thumbCache.get(bodyId);
    if (cached && (performance.now() - cached.timestamp < ThreeRenderer.THUMB_TTL)) {
      return cached.dataUrl;
    }

    // Znajdź mesh ciała
    const meshInfo = this._findBodyMesh(bodyId);
    if (!meshInfo) return null;

    const SZ = ThreeRenderer.THUMB_SIZE;

    // Lazy-init zasobów thumbnail
    if (!this._thumbRT) {
      this._thumbRT = new THREE.WebGLRenderTarget(SZ, SZ, {
        format: THREE.RGBAFormat,
        type:   THREE.UnsignedByteType,
      });
      this._thumbScene = new THREE.Scene();
      this._thumbScene.background = new THREE.Color(0x020405);
      this._thumbCam = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    }

    const scene = this._thumbScene;
    const cam   = this._thumbCam;

    // Wyczyść scenę z poprzednich obiektów
    while (scene.children.length > 0) scene.remove(scene.children[0]);

    // Sklonuj mesh planety (geometria + materiał współdzielone — bez kopiowania GPU)
    const { mesh: srcMesh, radius, children } = meshInfo;
    const clone = new THREE.Mesh(srcMesh.geometry, srcMesh.material);
    clone.rotation.copy(srcMesh.rotation);

    const thumbGroup = new THREE.Group();
    thumbGroup.add(clone);

    // Dodaj chmury i atmosferę (klony child meshy)
    if (children) {
      for (const child of children) {
        const c = new THREE.Mesh(child.geometry, child.material);
        c.rotation.copy(child.rotation);
        c.scale.copy(child.scale);
        c.renderOrder = child.renderOrder;
        thumbGroup.add(c);
      }
    }

    scene.add(thumbGroup);

    // Oświetlenie — PointLight imituje gwiazdę z lewej-góry
    const lightColor = this._starLight?.color?.clone() ?? new THREE.Color(0xffeedd);
    const light = new THREE.PointLight(lightColor, 1.5, 0, 0);
    light.position.set(-radius * 4, radius * 2, radius * 4);
    scene.add(light);

    // Delikatne ambient — żeby noc nie była całkowicie czarna
    const ambient = new THREE.AmbientLight(0x222233, 0.15);
    scene.add(ambient);

    // Aktualizuj uLightDir dla atmosfery (jeśli jest shader z uniformem)
    for (const child of thumbGroup.children) {
      if (child.material?.uniforms?.uLightDir) {
        child.material.uniforms.uLightDir.value.copy(light.position);
      }
    }

    // Kamera — patrzy na planetę z dystansu proporcjonalnego do promienia
    const dist = radius * 3.2;
    cam.position.set(-dist * 0.3, dist * 0.15, dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    // Render do offscreen RT
    this.renderer.setRenderTarget(this._thumbRT);
    this.renderer.render(scene, cam);
    this.renderer.setRenderTarget(null);

    // Odczytaj piksele → canvas → data URL
    const pixels = new Uint8Array(SZ * SZ * 4);
    this.renderer.readRenderTargetPixels(this._thumbRT, 0, 0, SZ, SZ, pixels);

    const canvas = document.createElement('canvas');
    canvas.width = SZ; canvas.height = SZ;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(SZ, SZ);

    // WebGL readPixels → Y-flipped
    for (let y = 0; y < SZ; y++) {
      const srcRow = (SZ - 1 - y) * SZ * 4;
      const dstRow = y * SZ * 4;
      imgData.data.set(pixels.subarray(srcRow, srcRow + SZ * 4), dstRow);
    }
    ctx.putImageData(imgData, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');

    // Cleanup tymczasowych obiektów ze sceny (materiały/geometrie NIE dispose — współdzielone)
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    light.dispose();
    ambient.dispose();

    // Cache
    this._thumbCache.set(bodyId, { dataUrl, timestamp: performance.now() });
    return dataUrl;
  }

  /** Znajdź mesh ciała po ID — szuka w planetach, księżycach, planetoidach */
  _findBodyMesh(bodyId) {
    // Planety
    const pEntry = this._planets.get(bodyId);
    if (pEntry) {
      const entity = EntityManager.get(bodyId);
      const radius = entity ? ThreeRenderer._planetRadius(entity) : 1;
      // Zbierz child meshe (chmury, atmosfera) z grupy
      const children = [];
      for (const child of pEntry.group.children) {
        if (child !== pEntry.mesh && child.isMesh) {
          children.push(child);
        }
      }
      return { mesh: pEntry.mesh, radius, children };
    }

    // Księżyce
    const mEntry = this._moons.get(bodyId);
    if (mEntry) {
      const r = mEntry.mesh.geometry.parameters?.radius ?? 0.05;
      return { mesh: mEntry.mesh, radius: r, children: null };
    }

    // Planetoidy
    const plEntry = this._planetoids.get(bodyId);
    if (plEntry) {
      const r = plEntry.mesh.geometry.parameters?.radius ?? 0.03;
      return { mesh: plEntry.mesh, radius: r, children: null };
    }

    return null;
  }

  /** Wyczyść cache thumbnailów (np. przy zmianie sceny) */
  clearThumbnailCache() {
    this._thumbCache.clear();
  }

  // ─────────────────────────────────────────────────────────────
  // Prediction cones (M2b C4) — wizualizacja niepewności intercept
  // ─────────────────────────────────────────────────────────────
  // Per-vessel cyan trójkąt rośnie/kurczy się/obraca w real-time wzdłuż
  // trajektorii vessel→IP. Origin = vessel.position (px), dir = unit vector
  // do IP, angleWidth = niepewność per intel quality + target velocity,
  // rangeAU = dystans do IP. Math: PredictionConeMath (C3). Hook:
  // vessel:positionUpdate (po _syncVesselPositions). Cleanup: _disposeAllMeshes.

  _syncPredictionCones() {
    if (!GAME_CONFIG.FEATURES.predictionCone) {
      if (this._predictionConeMeshes.size > 0) this._disposeAllPredictionCones();
      return;
    }
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;

    const activeIds = new Set();
    for (const v of vMgr._vessels.values()) {
      const order = v.movementOrder;
      if (!order) continue;
      if (order.type !== 'intercept') continue;
      if (order.status !== 'active') continue;
      if (!order.predictionCone) continue;
      if (v.isWreck) continue;
      activeIds.add(v.id);
      this._upsertPredictionCone(v.id, order.predictionCone);
    }
    for (const id of [...this._predictionConeMeshes.keys()]) {
      if (!activeIds.has(id)) this._disposePredictionCone(id);
    }
  }

  _upsertPredictionCone(vesselId, cone) {
    let entry = this._predictionConeMeshes.get(vesselId);
    if (!entry) {
      entry = this._createPredictionConeMesh();
      this.scene.add(entry.group);
      this._predictionConeMeshes.set(vesselId, entry);
    }
    this._updatePredictionConeTransform(entry, cone);
  }

  _createPredictionConeMesh() {
    const tan = Math.tan(PREDICTION_CONE_BASE_ANGLE);
    const v0 = new THREE.Vector3(0, 0, 0);
    const v1 = new THREE.Vector3( tan, 0, 1);
    const v2 = new THREE.Vector3(-tan, 0, 1);

    const fillGeom = new THREE.BufferGeometry().setFromPoints([v0, v1, v2]);
    fillGeom.setIndex([0, 1, 2]);
    const fillMat = new THREE.MeshBasicMaterial({
      color: PREDICTION_CONE_FILL_COLOR,
      transparent: true,
      opacity: PREDICTION_CONE_FILL_ALPHA,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(fillGeom, fillMat);

    // Outline: 0 → right → left → 0 (zamknięty trójkąt)
    const lineGeom = new THREE.BufferGeometry().setFromPoints([v0, v1, v2, v0]);
    const lineMat = new THREE.LineBasicMaterial({
      color: PREDICTION_CONE_LINE_COLOR,
      transparent: true,
      opacity: PREDICTION_CONE_LINE_ALPHA,
    });
    const lineMesh = new THREE.Line(lineGeom, lineMat);

    const group = new THREE.Group();
    group.add(fillMesh);
    group.add(lineMesh);
    return { fillMesh, lineMesh, group };
  }

  _updatePredictionConeTransform(entry, cone) {
    const { group } = entry;
    // Origin: vessel position (px) → world units
    group.position.set(S(cone.originX), PREDICTION_CONE_Y, S(cone.originY));
    group.rotation.y = Math.atan2(cone.dirX, cone.dirY);
    // ↑ Argumenty odwrócone vs standardowe atan2(y,x). Powód: cone forward = +Z
    //   (lokalne), rotation.y mierzona od +X axis CCW. Dla world dir
    //   (X=dirX, Z=dirY), żeby +Z lokalne wskazywało na ten kierunek,
    //   rotation = atan2(dirX, dirY). Match z vessel sprite convention atan2(dx, dy).
    const angleScale  = cone.angleWidth / PREDICTION_CONE_BASE_ANGLE;
    const lengthWorld = S(cone.rangeAU * AU);
    group.scale.set(angleScale, 1, lengthWorld);
  }

  _disposePredictionCone(vesselId) {
    const entry = this._predictionConeMeshes.get(vesselId);
    if (!entry) return;
    this.scene.remove(entry.group);
    entry.fillMesh.geometry.dispose();
    entry.fillMesh.material.dispose();
    entry.lineMesh.geometry.dispose();
    entry.lineMesh.material.dispose();
    this._predictionConeMeshes.delete(vesselId);
  }

  _disposeAllPredictionCones() {
    for (const id of [...this._predictionConeMeshes.keys()]) {
      this._disposePredictionCone(id);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Sensor overlay (M4 P2) — cyan ring wokół własnych vesseli +
  // yellow ring wokół własnych kolonii (obserwatorium detection).
  // ─────────────────────────────────────────────────────────────
  // Wzorzec 1:1 z _syncPredictionCones: Map cache, mark&sweep każdego
  // syncu (activeKeys), dispose dla nieaktywnych. Lifecycle:
  // - vessel:positionUpdate → re-sync wszystkich (pozycje vesseli + kolonii
  //   się zmieniają — planety orbitują).
  // - ui:sensorOverlayToggle (off) → _disposeAllSensorRings.
  // Reaguje na FEATURES.m4SensorOverlay (rollback flag) oraz na
  // window.KOSMOS.uiPrefs.sensorOverlayVisible (player toggle).

  _syncSensorOverlay() {
    if (!GAME_CONFIG.FEATURES.m4SensorOverlay) {
      if (this._sensorRingMeshes.size > 0) this._disposeAllSensorRings();
      return;
    }
    const visible = window.KOSMOS?.uiPrefs?.sensorOverlayVisible === true;
    if (!visible) {
      if (this._sensorRingMeshes.size > 0) this._disposeAllSensorRings();
      return;
    }

    const activeKeys = new Set();
    const activeSys = window.KOSMOS?.activeSystemId ?? 'sys_home';

    // 1) Własne vessele — cyan ring SENSOR_LOCK_AU
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr) {
      for (const v of vMgr._vessels.values()) {
        if (v.isWreck) continue;
        if (isEnemyVessel(v)) continue;
        if (v.systemId && v.systemId !== activeSys) continue;
        if (!v.position || isNaN(v.position.x) || isNaN(v.position.y)) continue;
        const key = `v_${v.id}`;
        activeKeys.add(key);
        this._upsertSensorRing(
          key, v.position.x, v.position.y,
          GAME_CONFIG.SENSOR_LOCK_AU,
          SENSOR_RING_VESSEL_COLOR,
        );
      }
    }

    // 2) Własne kolonie — yellow ring (obserwatorium detection range)
    const colMgr = window.KOSMOS?.colonyManager;
    const obsSys = window.KOSMOS?.observatorySystem;
    if (colMgr) {
      for (const col of colMgr.getAllColonies()) {
        if ((col.systemId ?? 'sys_home') !== activeSys) continue;
        const planet = col.planet ?? EntityManager.get(col.planetId);
        if (!planet || isNaN(planet.x) || isNaN(planet.y)) continue;
        // Bazowo 1 AU; obserwatorium rozszerza. obsSys może nie istnieć w sandboxie.
        let rangeAU = 1.0;
        if (obsSys?.getVesselDetectionRangeAU) {
          rangeAU = obsSys.getVesselDetectionRangeAU(col) ?? 1.0;
        }
        if (!Number.isFinite(rangeAU)) rangeAU = SENSOR_RING_MAX_COLONY_AU;
        rangeAU = Math.min(rangeAU, SENSOR_RING_MAX_COLONY_AU);
        if (rangeAU <= 0) continue;
        const key = `col_${col.planetId}`;
        activeKeys.add(key);
        this._upsertSensorRing(
          key, planet.x, planet.y, rangeAU,
          SENSOR_RING_COLONY_COLOR,
        );
      }
    }

    // 3) Mark & sweep — usuń ringi dla zniknięcych encji
    for (const k of [...this._sensorRingMeshes.keys()]) {
      if (!activeKeys.has(k)) this._disposeSensorRing(k);
    }
  }

  _upsertSensorRing(key, worldX, worldY, radiusAU, color) {
    const radiusWU = S(radiusAU * AU);
    let entry = this._sensorRingMeshes.get(key);
    if (!entry || entry.radiusAU !== radiusAU || entry.color !== color) {
      if (entry) this._disposeSensorRing(key);
      // Cienki annulus: inner 99% × outer (1px-ish w world units zależnie od zoom,
      // ale Three.js RingGeometry wymaga konkretnych liczb). Stała szerokość
      // = ~3% promienia daje widoczny ring od 0.1 AU do 35 AU.
      const inner = radiusWU * 0.985;
      const outer = radiusWU;
      const geom = new THREE.RingGeometry(inner, outer, SENSOR_RING_SEGMENTS);
      const mat  = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: SENSOR_RING_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;  // płaszczyzna XZ (ekliptyka)
      this.scene.add(mesh);
      entry = { mesh, geom, mat, radiusAU, color };
      this._sensorRingMeshes.set(key, entry);
    }
    entry.mesh.position.set(S(worldX), SENSOR_RING_Y, S(worldY));
  }

  _disposeSensorRing(key) {
    const entry = this._sensorRingMeshes.get(key);
    if (!entry) return;
    this.scene.remove(entry.mesh);
    entry.geom.dispose();
    entry.mat.dispose();
    this._sensorRingMeshes.delete(key);
  }

  _disposeAllSensorRings() {
    for (const k of [...this._sensorRingMeshes.keys()]) {
      this._disposeSensorRing(k);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Fleet Command Console (Slice 0) — wspólny silnik FX + helpery selekcji/intel
  // ════════════════════════════════════════════════════════════════════════

  // Pozycja statku na ekranie (px) — luka API (getScreenPosition jest planet-only).
  // Mirror getStationScreenPosition: rzut world→NDC z z-clampem; null gdy za kamerą.
  // Źródło prawdy dla 2D-zakotwiczonych UI per-statek (ramki, paski HP — Slice 4).
  getVesselScreenPosition(vesselId) {
    const entry = this._vessels.get(vesselId);
    if (!entry?.sprite) return null;
    const tmp = this._tmpLabelVec ?? (this._tmpLabelVec = new THREE.Vector3());
    entry.sprite.getWorldPosition(tmp);
    tmp.project(this.camera);
    if (tmp.z < -1 || tmp.z > 1) return null;
    return {
      x: (tmp.x * 0.5 + 0.5) * window.innerWidth,
      y: (-tmp.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // Kolor frakcji statku (cache per ownerEmpireId). Own=mint, enemy=archetyp, wrak=szary.
  // Używany przez smugi walki, tint insygniów, kolor linii rozkazu, pierścień selekcji.
  _factionColorHex(vessel) {
    if (!vessel) return 0x888888;
    if (vessel.isWreck) return factionColorRaw({ isWreck: true });
    if (!isEnemyVessel(vessel)) return factionColorRaw({ isEnemy: false });
    const empId = vessel.ownerEmpireId ?? null;
    if (empId && this._factionColorCache.has(empId)) return this._factionColorCache.get(empId);
    const emp = empId ? window.KOSMOS?.empireRegistry?.get?.(empId) : null;
    const archColor = emp?.archetype ? (ARCHETYPES?.[emp.archetype]?.color ?? null) : null;
    const col = factionColorRaw({ isEnemy: true, archetypeColor: archColor });
    if (empId) this._factionColorCache.set(empId, col);
    return col;
  }

  // Centralna bramka fog-of-war: czy wrogi statek jest „widoczny" dla gracza
  // (intel ≥ contact)? Own zawsze true. Używana przez pickability/insygnia/PPM.
  // Chroni reformę detekcji obserwatorium — bez niej smugi/selekcja zdradzają wroga.
  _isEnemyEndpointVisible(vesselId) {
    const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    if (!v) return false;
    const isEnemy = isEnemyVessel(v);
    const q = isEnemy ? (window.KOSMOS?.intelSystem?.getVesselContact?.(vesselId)?.quality ?? 'unknown') : null;
    return isEndpointVisibleByQuality(isEnemy, q);
  }

  // Targetowalny dla rozkazów (engage/pursue) = own LUB wróg WYKRYTY (≥rumor, radar blip).
  // Luźniej niż _isEnemyEndpointVisible (≥contact): pozycję znamy już przy rumor, więc
  // można nakazać atak na kontakt radarowy (statek doleci i zaangażuje przy zbliżeniu).
  _isEnemyTargetable(vesselId) {
    const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    if (!v) return false;
    if (!isEnemyVessel(v)) return true;
    const q = window.KOSMOS?.intelSystem?.getVesselContact?.(vesselId)?.quality ?? 'unknown';
    return q === 'rumor' || q === 'contact' || q === 'detailed';
  }

  // Resolver endpointu FX → {wx, wz, visible} w world coords (po S()).
  // own→live; enemy unknown→visible:false (BRAK FX); rumor→positionLastKnown (NIE live);
  // contact/detailed→live. Jedyne źródło reguły dla smug walki (snapshot vs leak).
  _resolveFxEndpoint(vesselId) {
    const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    if (!v || !v.position) return null;
    const isEnemy = isEnemyVessel(v);
    const rec = isEnemy ? (window.KOSMOS?.intelSystem?.getVesselContact?.(vesselId) ?? null) : null;
    const raw = resolveFxEndpointRaw({
      isEnemy,
      livePos: { x: v.position.x, y: v.position.y },
      quality: rec?.quality ?? null,
      positionLastKnown: rec?.positionLastKnown ?? null,
    });
    if (!raw) return null;
    return { wx: S(raw.x), wz: S(raw.y), visible: raw.visible };
  }

  // ── Wspólny silnik FX ──────────────────────────────────────────────────
  // Spawn efemerycznego efektu. cfg: {lifetime, kind, baseScale?, baseOpacity?,
  // delay?, onTick?(ef,progress)}. Twardy cap FX_MAX_ACTIVE (drop-oldest).
  // _fxGroup tworzony leniwie (scena istnieje dopiero po _setup).
  _spawnFx(mesh, cfg = {}) {
    if (!mesh) return null;
    if (!this._fxGroup) {
      this._fxGroup = new THREE.Group();
      this._fxGroup.name = 'fcFxGroup';
      this.scene.add(this._fxGroup);
    }
    while (this._activeEffects.length >= FX_MAX_ACTIVE) {
      this._disposeFx(this._activeEffects.shift());
    }
    this._fxGroup.add(mesh);
    const ef = {
      mesh,
      startTime: performance.now(),
      lifetime:    cfg.lifetime    ?? FX_TRACER_MS,
      kind:        cfg.kind        ?? 'tracer',
      baseScale:   cfg.baseScale   ?? (mesh.scale?.x ?? 1),
      baseOpacity: cfg.baseOpacity ?? (mesh.material?.opacity ?? 1),
      delay:       cfg.delay       ?? 0,
      onTick:      cfg.onTick      ?? null,
    };
    this._activeEffects.push(ef);
    return ef;
  }

  _disposeFx(ef) {
    if (!ef?.mesh) return;
    if (this._fxGroup) this._fxGroup.remove(ef.mesh);
    ef.mesh.geometry?.dispose?.();
    ef.mesh.material?.dispose?.();
  }

  // Drenuj _activeEffects co klatkę (real-time, w _startLoop — niezależne od pauzy).
  // Port _updateEffects z BattleView3D + obsługa delay (błysk po smudze).
  _updateActiveEffects(nowMs) {
    if (!this._activeEffects.length) return;
    const keep = [];
    for (const ef of this._activeEffects) {
      const age = nowMs - ef.startTime - ef.delay;
      if (age < 0) { ef.mesh.visible = false; keep.push(ef); continue; }  // czeka na delay
      if (age > ef.lifetime) { this._disposeFx(ef); continue; }
      ef.mesh.visible = true;
      const progress = age / ef.lifetime;
      const mat = ef.mesh.material;
      switch (ef.kind) {
        case 'tracer':
        case 'beam':
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
          break;
        case 'flash':
          if (mat) mat.opacity = 0.9 * (1 - progress);
          ef.mesh.scale.setScalar(ef.baseScale * (1 + progress * 2));
          break;
        case 'shieldRing':
        case 'ring':
        case 'pulse':
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
          ef.mesh.scale.setScalar(ef.baseScale * (1 + progress * 2));
          break;
        case 'ping':
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
          ef.mesh.scale.setScalar(ef.baseScale * (1 + progress * 3));
          break;
        case 'trail':  // smuga silnika — gaśnie i lekko się kurczy (zostaje za statkiem)
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
          ef.mesh.scale.setScalar(ef.baseScale * (1 - 0.5 * progress));
          break;
        case 'explosion': {  // kula ognia: scale 0→3, kolor biały→pomarańcz→czerwony
          const c = explosionColorRaw(progress);
          if (mat) {
            if (mat.color) mat.color.setRGB(c.r, c.g, c.b);
            mat.opacity = 1 - progress * progress;  // trzyma jasność, szybki zanik na końcu
          }
          ef.mesh.scale.setScalar(ef.baseScale * (0.001 + progress * 3));
          break;
        }
        case 'explosionRing':  // pierścień uderzeniowy: radius 0→target (scale)
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
          ef.mesh.scale.setScalar(ef.baseScale * Math.max(0.001, progress));
          break;
        default:
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
      }
      if (ef.onTick) ef.onTick(ef, progress);
      keep.push(ef);
    }
    this._activeEffects = keep;
  }

  // Modulacja stożka wydechu wg stanu statku. Pełny plume w tranzycie, zgaszony
  // przy orbiting/docked/wrak. Wołane z _syncVesselPositions PRZED rozgałęzieniem
  // stanu (orbiterzy robią `continue`, więc call na końcu pętli by ich pominął).
  _applyExhaust(vessel, entry) {
    const cone = entry?.exhaust;
    if (!cone) return;
    if (!GAME_CONFIG.FEATURES?.fcCombatFx) { cone.visible = false; return; }
    const intensity = exhaustIntensityRaw({
      state:   vessel?.position?.state,
      isWreck: !!(vessel?.isWreck || entry.isWreck),
    });
    if (intensity <= 0) { cone.visible = false; return; }
    cone.visible = true;
    // Lekki flicker (throb silnika) — desync per statek przez _exhaustPhase.
    const flick = 0.8 + 0.2 * Math.sin(performance.now() * 0.02 + (entry._exhaustPhase ?? 0));
    if (cone.material) cone.material.opacity = 0.35 * intensity * flick;  // subtelne (było 0.5)
    cone.scale.x = intensity * (0.85 + 0.3 * flick);
  }

  // Eksplozja zniszczonego statku — kula ognia (scale 0→3, biały→pomarańcz→czerwony)
  // + pierścień uderzeniowy (radius 0→bboxSize×2). pos = world coords (sprite.position).
  _spawnExplosion(pos, bboxSize) {
    if (!pos) return;
    const b = Math.max(0.2, bboxSize || 0.5);
    // Kula ognia — MeshBasicMaterial + additive (świeci z bloomem).
    const sph = new THREE.Mesh(
      new THREE.SphereGeometry(b * 0.4, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    sph.position.copy(pos);
    sph.layers.enable(BLOOM_LAYER);   // selective bloom — kula ognia świeci
    this._spawnFx(sph, { kind: 'explosion', lifetime: 600, baseScale: 1, baseOpacity: 1 });
    // Pierścień uderzeniowy — płasko w płaszczyźnie orbitalnej, radius 0→b×2.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(b * 1.75, b * 2.0, 32),
      new THREE.MeshBasicMaterial({
        color: EXPLOSION_RING_COLOR, transparent: true, opacity: 0.8,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    ring.layers.enable(BLOOM_LAYER);  // selective bloom — pierścień świeci
    this._spawnFx(ring, { kind: 'explosionRing', lifetime: 800, baseScale: 1, baseOpacity: 0.8 });
  }

  // ── Slice 1 — smugi walki na żywej mapie (FX-only, z combat:roundFx) ─────
  _onCombatRoundFx(payload) {
    if (!GAME_CONFIG.FEATURES?.fcCombatFx) return;
    if (window.KOSMOS?.uiPrefs?.combatFxVisible === false) return;
    const events = payload?.events ?? [];
    let stagger = 0;
    for (const ev of events) {
      const aw = this._combatEndpointWorld(ev.attacker, ev.aPos);
      const tw = this._combatEndpointWorld(ev.target, ev.tPos);
      if (!aw || !tw) continue;  // któryś endpoint fog-gated (wróg unknown) → skip, brak przecieku
      const delay = (stagger++ % 8) * 40;  // rozłóż salwę po ~0..280ms (czytelność, nie 1-frame)
      this._spawnCombatTracer(aw, tw, ev.category, ev.hit, ev.blockedByShield, delay);
    }
    // Znacznik starcia (midpoint) — żeby gracz zauważył walkę nawet zoom-out.
    const mp = payload?.midpoint;
    if (mp && Number.isFinite(mp.x) && Number.isFinite(mp.y)) {
      this._upsertEngagementMarker(payload.encounterId, mp.x, mp.y);
    }
  }

  // Fix#3 — FX dla bitew orbitalnych/abstrakcyjnych (bez per-rundy combat:roundFx).
  _onBattleResolvedFx(payload) {
    if (!GAME_CONFIG.FEATURES?.fcCombatFx) return;
    if (window.KOSMOS?.uiPrefs?.combatFxVisible === false) return;
    const result = payload?.result;
    if (!result) return;
    const pA = result.participantA, pB = result.participantB;
    const loc = result.location;
    let playerIn = pA?.empireId === 'player' || pB?.empireId === 'player'
                || pA?.type === 'player' || pB?.type === 'player';
    // Fallback: bitwa przy kolonii gracza (obrona orbitalna — kształt participantów bywa różny).
    if (!playerIn && loc?.planetId && window.KOSMOS?.colonyManager?.isPlayerColony?.(loc.planetId)) {
      playerIn = true;
    }
    if (!playerIn) return;
    if (loc?.point && Number.isFinite(loc.point.x)) return;  // deep-space → combat:roundFx już rysuje
    let fx = null, fy = null;
    if (loc?.planetId) {
      const planet = EntityManager.get(loc.planetId);
      if (planet && Number.isFinite(planet.x)) { fx = planet.x; fy = planet.y; }
    }
    if (fx == null) {
      const hp = window.KOSMOS?.homePlanet;
      if (hp && Number.isFinite(hp.x)) { fx = hp.x; fy = hp.y; }
    }
    if (fx == null) return;
    this._spawnBattleBurst(fx, fy);
  }

  // Burst „imitacji" walki wokół celu (gameplay coords). Wall-clock (widoczny przy każdej prędkości).
  _spawnBattleBurst(gx, gy) {
    const cx = S(gx), cz = S(gy);
    const R = 0.6;
    const COLORS = [0x60E0FF, 0xFFD060, 0xFF6060];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + i * 0.7;  // deterministyczny rozrzut
      const ex = cx + Math.cos(a) * R, ez = cz + Math.sin(a) * R;
      const col = COLORS[i % 3];
      const delay = (i % 8) * 110;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ex, 0.3, ez), new THREE.Vector3(cx, 0.3, cz)]),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 }),
      );
      this._spawnFx(line, { kind: 'tracer', lifetime: FX_TRACER_MS, baseOpacity: 0.9, delay });
      if (i % 2 === 0) {
        const flash = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
        flash.position.set(cx + Math.cos(a) * R * 0.5, 0.3, cz + Math.sin(a) * R * 0.5);
        this._spawnFx(flash, { kind: 'flash', lifetime: FX_FLASH_MS, baseScale: 1, delay: delay + 120 });
      }
    }
    this._upsertEngagementMarker('orbital_' + Math.round(gx) + '_' + Math.round(gy), gx, gy);
  }

  // Endpoint smugi → world coords {x,z} z bramką fog-of-war. Preferuj live/intel,
  // fallback snapshot (vessel zginął). null = pomiń (wróg niewykryty).
  _combatEndpointWorld(vesselId, snapPos) {
    const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    if (v && isEnemyVessel(v) && !this._isEnemyEndpointVisible(vesselId)) return null;  // fog-of-war
    // Fix#3 — pozycja DOKŁADNIE tam, gdzie statek jest RYSOWANY (sprite X/Y/Z), żeby smugi
    // łączyły realne tekstury (wcześniej _resolveFxEndpoint dawał tylko X/Z + Y=0.3 → rozjazd).
    const entry = this._vessels.get(vesselId);
    if (entry?.sprite?.visible) {
      const p = entry.sprite.position;
      if (Number.isFinite(p.x)) return { x: p.x, y: p.y, z: p.z };
    }
    if (snapPos && Number.isFinite(snapPos.x) && Number.isFinite(snapPos.y)) {
      return { x: S(snapPos.x), y: 0.3, z: S(snapPos.y) };  // vessel zginął — snapshot
    }
    return null;
  }

  _spawnCombatTracer(aw, tw, category, hit, blockedByShield, delay = 0) {
    const color = fxWeaponColor(category);
    const ay = aw.y ?? 0.3, ty = tw.y ?? 0.3;  // poziom RYSOWANEGO statku (fix#3)
    const pts = [ new THREE.Vector3(aw.x, ay, aw.z), new THREE.Vector3(tw.x, ty, tw.z) ];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: hit ? 0.9 : 0.4 });
    this._spawnFx(new THREE.Line(geom, mat), {
      kind: 'tracer', lifetime: FX_TRACER_MS, baseOpacity: hit ? 0.9 : 0.4, delay,
    });
    if (!hit) return;
    // Błysk trafienia (expand 1→3, fade) — na celu, mniejszy (fix#4: za mocne).
    const fMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), fMat);
    flash.position.set(tw.x, ty, tw.z);
    this._spawnFx(flash, { kind: 'flash', lifetime: FX_FLASH_MS, baseScale: 1, baseOpacity: 0.85, delay: delay + FX_FLASH_DELAY_MS });
    // Pierścień tarczy gdy trafienie zablokowane.
    if (blockedByShield > 0) {
      const sMat = new THREE.MeshBasicMaterial({ color: FX_SHIELD_COLOR, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.10, 18), sMat);
      ring.position.set(tw.x, ty, tw.z); ring.rotation.x = -Math.PI / 2;
      this._spawnFx(ring, { kind: 'shieldRing', lifetime: FX_SHIELD_MS, baseScale: 1, baseOpacity: 0.8, delay: delay + FX_FLASH_DELAY_MS });
    }
  }

  // ── Znacznik starcia (persistent, mark&sweep TTL) ────────────────────────
  _upsertEngagementMarker(encounterId, gx, gy) {
    if (!encounterId) return;
    let entry = this._engagementMarkers.get(encounterId);
    if (!entry) {
      const geom = new THREE.RingGeometry(0.25, 0.32, 36);
      const mat  = new THREE.MeshBasicMaterial({ color: 0xff5544, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      this.scene.add(mesh);
      entry = { mesh, geom, mat, _lastTouch: 0 };
      this._engagementMarkers.set(encounterId, entry);
    }
    entry.mesh.position.set(S(gx), 0.05, S(gy));
    entry._lastTouch = performance.now();
  }

  _disposeEngagementMarker(encounterId) {
    const e = this._engagementMarkers.get(encounterId);
    if (!e) return;
    this.scene.remove(e.mesh); e.geom.dispose(); e.mat.dispose();
    this._engagementMarkers.delete(encounterId);
  }

  _disposeAllEngagementMarkers() {
    for (const k of [...this._engagementMarkers.keys()]) this._disposeEngagementMarker(k);
  }

  // Puls + auto-expire (combat:roundFx przestaje karmić gdy bitwa się kończy).
  _tickEngagementMarkers(nowMs) {
    if (!this._engagementMarkers.size) return;
    const tt = this._clock.getElapsedTime();
    for (const [id, e] of [...this._engagementMarkers]) {
      if (nowMs - (e._lastTouch ?? 0) > 1600) { this._disposeEngagementMarker(id); continue; }
      e.mat.opacity = 0.5 * (0.55 + 0.45 * Math.sin(tt * 4));
      e.mesh.scale.setScalar(1 + 0.1 * Math.sin(tt * 4));
    }
  }

  // ── Slice 2 — efekty skanu (FX-only, z eventów rekonu/odkrycia) ──────────
  _onReconProgress(payload) {
    if (!GAME_CONFIG.FEATURES?.fcScanFx) return;
    const body = payload?.body;
    if (!body || !Number.isFinite(body.x) || !Number.isFinite(body.y)) return;
    // Origin snopa = pozycja skanującego statku (tylko gdy znamy expedition.vesselId).
    let origin = null;
    const vid = payload?.expedition?.vesselId;
    const vp = vid ? window.KOSMOS?.vesselManager?.getVessel?.(vid)?.position : null;
    if (vp && Number.isFinite(vp.x) && Number.isFinite(vp.y)) origin = { x: vp.x, y: vp.y };
    this._spawnScanFx(origin, body.x, body.y);
  }

  _spawnScanFx(origin, gx, gy) {
    const bx = S(gx), bz = S(gy);
    // Pierścień skanu rozszerzający się na ciele (większy + dłuższy = widoczny).
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.30, 32),
      new THREE.MeshBasicMaterial({ color: FX_SCAN_COLOR, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.position.set(bx, 0.05, bz); ring.rotation.x = -Math.PI / 2;
    this._spawnFx(ring, { kind: 'ring', lifetime: FX_RING_MS, baseScale: 1, baseOpacity: 0.7 });
    // Snop od statku do ciała (gdy znamy origin).
    if (origin) {
      const pts = [ new THREE.Vector3(S(origin.x), 0.3, S(origin.y)), new THREE.Vector3(bx, 0.1, bz) ];
      const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: FX_SCAN_COLOR, transparent: true, opacity: 0.5 }));
      this._spawnFx(beam, { kind: 'beam', lifetime: FX_RING_MS, baseOpacity: 0.5 });
    }
  }

  _spawnScanPing(gx, gy) {
    if (!GAME_CONFIG.FEATURES?.fcScanFx) return;
    const ping = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 32),
      new THREE.MeshBasicMaterial({ color: FX_SCAN_COLOR, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }),
    );
    ping.position.set(S(gx), 0.05, S(gy)); ping.rotation.x = -Math.PI / 2;
    this._spawnFx(ping, { kind: 'ping', lifetime: FX_PING_MS, baseScale: 1, baseOpacity: 1 });
  }

  // ── Reforma obserwatorium — podgląd ciała (przesunięcie widoku + szara zasłona) ──
  // Overlay obserwatorium woła enter/exit; kamera już fokusuje wybrane ciało (body:selected).
  // enter: przesuwa render 3D tak, by ciało trafiło w prawą-dolną część ekranu (pod danymi).
  enterObservatoryPreview(fracX, fracY) {
    this._observatoryPreviewActive = true;
    this._focusViewOffset = { fracX, fracY };
    this._applyFocusViewOffset();
  }

  exitObservatoryPreview() {
    this._observatoryPreviewActive = false;
    this._focusViewOffset = null;
    this.camera?.clearViewOffset?.();
    this._disposeBodyVeil();
  }

  // Przesunięcie renderu tak, by wyfokusowane ciało (środek NDC) trafiło w zadany punkt ekranu.
  // fracX/fracY = przesunięcie celu względem środka (ułamek szer./wys.). setViewOffset przelicza
  // się przy resize (fullWidth/Height muszą być aktualne) → wołane też w handlerze resize.
  _applyFocusViewOffset() {
    if (!this.camera?.setViewOffset) return;
    if (!this._focusViewOffset) { this.camera.clearViewOffset?.(); return; }
    const W = window.innerWidth, H = window.innerHeight;
    const { fracX, fracY } = this._focusViewOffset;
    this.camera.setViewOffset(W, H, -fracX * W, -fracY * H, W, H);
  }

  // Szara zasłona na wybranym, NIEZBADANYM ciele w podglądzie obserwatorium (fog-of-war).
  // Znika automatycznie gdy body.explored=true (po skanie) → efekt „grey-out → reveal".
  _syncBodyScanVeil() {
    let veilId = null;
    if (this._observatoryPreviewActive && this._focusEntityId) {
      const body = EntityManager.get(this._focusEntityId);
      if (body && !body.explored) veilId = this._focusEntityId;  // grey-out tylko niezbadane
    }
    if (!veilId) { this._disposeBodyVeil(); return; }

    const info = this._findBodyMesh(veilId);
    if (!info?.mesh) { this._disposeBodyVeil(); return; }

    if (!this._bodyVeil || this._bodyVeil.bodyId !== veilId) {
      this._disposeBodyVeil();
      const geom = new THREE.SphereGeometry(1, 24, 16);
      const mat  = new THREE.MeshBasicMaterial({
        color: BODY_VEIL_COLOR, transparent: true, opacity: BODY_VEIL_OPACITY, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      this.scene.add(mesh);
      this._bodyVeil = { bodyId: veilId, mesh, geom, mat };
    }
    // Kotwicz do rzeczywistej pozycji świata mesha (planeta może być w grupie/orbicie).
    const wp = info.mesh.getWorldPosition(this._tmpVeilVec ?? (this._tmpVeilVec = new THREE.Vector3()));
    this._bodyVeil.mesh.position.copy(wp);
    this._bodyVeil.mesh.scale.setScalar(info.radius * 1.03);
  }

  _disposeBodyVeil() {
    if (!this._bodyVeil) return;
    this.scene.remove(this._bodyVeil.mesh);
    this._bodyVeil.geom.dispose();
    this._bodyVeil.mat.dispose();
    this._bodyVeil = null;
  }

  // ── Slice 3 — kolor linii rozkazu wg typu ────────────────────────────────
  // Rollback fcOrderLines=false → kolor frakcji (stare zachowanie).
  _orderLineColor(vessel) {
    if (!GAME_CONFIG.FEATURES?.fcOrderLines) return this._factionColorHex(vessel);
    switch (vessel?.movementOrder?.type) {
      case 'engage':              return 0xff5544;  // czerwony — atak
      case 'pursue':
      case 'intercept':           return 0xffaa44;  // amber — pościg
      case 'patrol':              return 0x44ccff;  // cyan — patrol
      case 'retreat':             return 0xcc88ff;  // fiolet — odwrót
      case 'moveToPoint':         return 0x66ddaa;  // zielony — ruch
      default:
        return (vessel && !isEnemyVessel(vessel)) ? 0x66ddaa : 0xff8866;
    }
  }

  // ── Slice 6 — puls startu/przybycia statku (FX harness) ──────────────────
  _spawnMovementPulse(vessel, color) {
    if (!GAME_CONFIG.FEATURES?.fcMovementFx) return;
    const p = vessel?.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.13, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.position.set(S(p.x), 0.3, S(p.y)); ring.rotation.x = -Math.PI / 2;
    this._spawnFx(ring, { kind: 'pulse', lifetime: FX_RING_MS, baseScale: 1, baseOpacity: 0.8 });
  }

  // Miękka tekstura glow (radial) — współdzielona dla smug silnika (i innych FX).
  _getGlowTex() {
    if (this._fcGlowTex) return this._fcGlowTex;
    const sz = 64;
    const cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const c = cv.getContext('2d');
    // Skondensowany rdzeń + szybki spadek (fix#4a: było zbyt rozproszone/duże).
    const g = c.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    g.addColorStop(0,    'rgba(255,255,255,1)');
    g.addColorStop(0.16, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.08)');
    g.addColorStop(1,    'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, sz, sz);
    this._fcGlowTex = new THREE.CanvasTexture(cv);
    this._fcGlowTex.needsUpdate = true;
    return this._fcGlowTex;
  }

  // _tickEngineTrails USUNIĘTE (2026-07-01) — stary efekt silnika: additive-glow
  // sprite w kolorze frakcji (mint 0x44cc66 dla gracza) spawnowany w ŚRODKU statku
  // podczas lotu → wyglądał jak zielona kula ze środka kadłuba. Zastąpiony stożkiem
  // wydechu (_addVesselModel3D → entry.exhaust, modulowany w _applyExhaust).
  // Helper _getGlowTex zostaje (potencjalny reuse dla innych FX).

  // ── Slice 5 — insygnia frakcji (billboard nad statkiem, intel-gated) ─────
  // Osobny overlay mark&sweep (jak sensor ringi) — unika threadowania async
  // model-swap + intel-visibility. Wróg widoczny TYLKO ≥contact (brak przecieku tożsamości).
  static _createInsigniaTexture(colorHex) {
    if (_INSIGNIA_TEX_CACHE.has(colorHex)) return _INSIGNIA_TEX_CACHE.get(colorHex);
    const sz = 64;
    const cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const c = cv.getContext('2d');
    const hex = '#' + (colorHex >>> 0).toString(16).padStart(6, '0').slice(-6);
    c.strokeStyle = hex; c.fillStyle = hex; c.lineWidth = 7; c.lineJoin = 'round';
    c.globalAlpha = 0.95;
    c.beginPath();                         // szewron
    c.moveTo(sz * 0.22, sz * 0.64);
    c.lineTo(sz * 0.50, sz * 0.30);
    c.lineTo(sz * 0.78, sz * 0.64);
    c.stroke();
    c.beginPath();                         // kropka pod szewronem
    c.arc(sz * 0.50, sz * 0.74, sz * 0.07, 0, Math.PI * 2); c.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    _INSIGNIA_TEX_CACHE.set(colorHex, tex);
    return tex;
  }

  _syncInsignia() {
    if (!GAME_CONFIG.FEATURES?.fcInsignia) { if (this._insigniaSprites.size) this._disposeAllInsignia(); return; }
    const vm = window.KOSMOS?.vesselManager;
    if (!vm) { if (this._insigniaSprites.size) this._disposeAllInsignia(); return; }
    const active = new Set();
    for (const [vid, entry] of this._vessels) {
      if (!entry?.sprite?.visible) continue;       // ukryty ghost (unknown) → brak insygniów
      const v = vm.getVessel?.(vid);
      if (!v || v.isWreck) continue;
      if (isEnemyVessel(v) && !this._isEnemyEndpointVisible(vid)) continue;  // wróg tylko ≥contact
      active.add(vid);
      this._upsertInsignia(vid, entry, v);
    }
    for (const k of [...this._insigniaSprites.keys()]) if (!active.has(k)) this._disposeInsignia(k);
  }

  _upsertInsignia(vid, entry, vessel) {
    const col = this._factionColorHex(vessel);
    let ins = this._insigniaSprites.get(vid);
    if (!ins || ins._col !== col) {
      if (ins) this._disposeInsignia(vid);
      const tex = ThreeRenderer._createInsigniaTexture(col);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(0.32, 0.32, 0.32);
      sp._col = col;
      this.scene.add(sp);
      ins = sp;
      this._insigniaSprites.set(vid, ins);
    }
    const p = entry.sprite.position;
    ins.position.set(p.x, p.y + 0.4, p.z);
    ins.material.opacity = entry.intelOpacity ?? 1.0;  // dopasuj do ghost-opacity (contact 0.5)
  }

  _disposeInsignia(vid) {
    const ins = this._insigniaSprites.get(vid);
    if (!ins) return;
    this.scene.remove(ins);
    ins.material?.dispose?.();   // tekstura (map) współdzielona z cache — NIE dispose
    this._insigniaSprites.delete(vid);
  }

  _disposeAllInsignia() {
    for (const k of [...this._insigniaSprites.keys()]) this._disposeInsignia(k);
  }

  // ── Faza 2 (Obraz Operacyjny) — glify trybu taktycznego ────────────────────
  // Billboard-glif o stałym rozmiarze EKRANOWYM (wzór _syncEnemyAlertMarkers)
  // nad każdym statkiem; model GLB (DZIECI wrappera) ukrywany na czas trybu —
  // NIGDY cały wrapper (jego .visible bramkuje insygnia/markery/labele, a pozycja
  // kotwiczy wszystkie nakładki). Cache tekstur per (glif|kolor) — wzór insygniów.
  // Słownik ról/tonów WYŁĄCZNIE z FleetPictureLogic (twarda reguła planu §0).

  // Stałe tuningu trybu Y (2g — nazwane do oceny wizualnej Filipa):
  static TACTICAL_GLYPH_SCALE = 0.66;   // rozmiar glifu (+~20% vs 0.55 z 2c)
  static TACTICAL_ORBIT_ALPHA = 0.55;   // wyraźne orbity w trybie (normalnie ~0.2-0.3)
  static TACTICAL_GRID_ALPHA  = 0.05;   // subtelna siatka tła (0 = wyłączona)
  // 2h — wskaźniki ruchu w skali EKRANU (playtest F2-D: nieczytelne przy zoom-out):
  static TACTICAL_TICK_SCALE   = 0.95;  // bazowy rozmiar tika/etykiety (× distFactor)
  static TACTICAL_CHEV_SCALE   = 0.55;  // bazowy rozmiar chevronu (× distFactor)
  static TACTICAL_ETA_SCALE    = 1.15;  // znacznik ⏱rok celu (× distFactor)
  static TACTICAL_ZOOM_FAR     = 250;   // dist ≥ → mniej tików, większe (count 1, krok ×2, rozmiar ×1.25)
  static TACTICAL_ZOOM_NEAR    = 80;    // dist ≤ → gęściej, mniejsze (count 3, rozmiar ×0.85)

  static _glyphTexCache = new Map();
  static _createGlyphTexture(glyph, colorHex) {
    const key = `${glyph}|${colorHex}`;
    const cached = ThreeRenderer._glyphTexCache.get(key);
    if (cached) return cached;
    const sz = 96;
    const cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const c = cv.getContext('2d');
    c.font = `bold ${Math.round(sz * 0.6)}px sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = sz * 0.08;   // obwódka — czytelność
    c.strokeText(glyph, sz / 2, sz / 2 + sz * 0.03);
    c.fillStyle = colorHex;
    c.fillText(glyph, sz / 2, sz / 2 + sz * 0.03);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    ThreeRenderer._glyphTexCache.set(key, tex);
    return tex;
  }

  // ctx dla buildShipEntry — wpięcia świata (jak MapLabelLayer).
  _buildPictureCtx() {
    const K = window.KOSMOS;
    const vm = K?.vesselManager;
    const dscs = K?.deepSpaceCombatSystem;
    return {
      gameYear:      K?.timeSystem?.gameTime ?? 0,
      fleetSystem:   K?.fleetSystem ?? null,
      combatCheck:   dscs?._findActiveEncounterContaining
        ? (id) => !!dscs._findActiveEncounterContaining(id) : null,
      isImmobilized: vm?.isImmobilized ? (v) => vm.isImmobilized(v) : null,
    };
  }

  // ── F4 Dok taktyczny: hover-podgląd + ping ─────────────────────────────────
  // Ustawia statek pod kursorem doku. Rozjaśnienie routeLine = event-driven set
  // opacity materiału (dla WŁASNYCH nikt nie nadpisuje per-frame — trzyma się);
  // puls ducha ETA czyta _tacticalHoverVid w _upsertTacticalGhost (per-frame).
  setTacticalHoverVid(vid) {
    const next = vid ?? null;
    if (this._tacticalHoverVid === next) return;
    const prev = this._tacticalHoverVid;
    this._tacticalHoverVid = next;
    this._setRouteLineHover(prev, false);
    this._setRouteLineHover(next, true);
  }

  _setRouteLineHover(vid, on) {
    if (!vid) return;
    const mat = this._vessels.get(vid)?.routeLine?.material;
    if (!mat) return;
    // 4f-2 — hover: pełna opacity + jasny kolor + grubsza linia; zdjęcie: powrót do bazy (kolor
    // z rodzaju rozkazu — _orderLineColor odzwierciedla bieżący stan; opacity/width bazowe).
    if (on) {
      mat.opacity   = ROUTE_LINE_HOVER_OPACITY;
      mat.linewidth = ROUTE_LINE_HOVER_WIDTH;
      mat.color?.set?.(ROUTE_LINE_HOVER_COLOR);
    } else {
      mat.opacity   = ROUTE_LINE_BASE_OPACITY;
      mat.linewidth = ROUTE_LINE_BASE_WIDTH;
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vid);
      if (v && mat.color?.set) mat.color.set(this._orderLineColor(v));
    }
  }

  // Rok pod kursorem na OSI doku → marker „gdzie będzie planeta celu w tym roku"
  // (rysowany w _syncTacticalOrbitMarkers dla HOVEROWANEGO statku). null = brak.
  setTacticalHoverYear(year) {
    const next = Number.isFinite(year) ? year : null;
    if (this._tacticalHoverYear === next) return;
    this._tacticalHoverYear = next;
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  // Krótki „ping" (pierścień ripple) na pozycji statku — feedback selekcji w doku BEZ
  // ruszania kamery. Throttle koalescuje szybkie kliki; auto-dispose przez silnik FX.
  pingVessel(vesselId) {
    if (!vesselId) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - (this._lastTacticalPingMs || 0) < TACTICAL_PING_THROTTLE_MS) return;
    this._lastTacticalPingMs = now;
    // Pozycja: sprite.position = gotowy world (orbita/dok); fallback vessel.position → S().
    const sp = this._vessels.get(vesselId)?.sprite;
    let x, y, z;
    if (sp?.visible && sp.position) { x = sp.position.x; y = sp.position.y; z = sp.position.z; }
    else {
      const p = window.KOSMOS?.vesselManager?.getVessel?.(vesselId)?.position;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      x = S(p.x); y = 0.3; z = S(p.y);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.13, 24),
      new THREE.MeshBasicMaterial({ color: TACTICAL_PING_COLOR, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.position.set(x, y, z);
    ring.rotation.x = -Math.PI / 2;
    this._spawnFx(ring, { kind: 'ping', lifetime: FX_PING_MS, baseScale: 1, baseOpacity: 1 });
  }

  _syncTacticalGlyphs() {
    if (window.KOSMOS?.tacticalMode?.isActive !== true) {
      if (this._tacticalGlyphs.size) this._disposeAllTacticalGlyphs();
      return;   // poza trybem: jeden boolean — zero kosztów
    }
    const vm = window.KOSMOS?.vesselManager;
    if (!vm) return;
    const camPos = this.camera?.position;
    const pictureCtx = this._buildPictureCtx();
    const aliveIds = new Set();
    for (const [vid, entry] of this._vessels) {
      if (!entry?.sprite?.visible) continue;                      // intel-ghost unknown → nic
      const v = vm.getVessel?.(vid);
      if (!v || v.isWreck) continue;
      const enemy = isEnemyVessel(v);
      if (enemy && !this._isEnemyTargetable(vid)) continue;       // wróg ≥rumor
      const pict = buildShipEntry(v, pictureCtx);
      if (!pict || pict.isWreck) continue;   // wraki bez glifów trybu Y (model wraka zostaje)
      const anon = enemy && !this._isEnemyEndpointVisible(vid);   // rumor → rola ukryta
      const glyph = anon ? '?' : pict.glyph;
      const colorHex = enemy ? this._factionColorHex(v)
        : (toneColor(pict.tone, THEME) ?? THEME.text);

      let sp = this._tacticalGlyphs.get(vid);
      const key = `${glyph}|${colorHex}`;
      if (!sp || sp._glyphKey !== key) {
        if (sp) this._disposeTacticalGlyph(vid, /*keepModelHidden*/ true);
        sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: ThreeRenderer._createGlyphTexture(glyph, colorHex),
          transparent: true, depthWrite: false, depthTest: false,
        }));
        sp.renderOrder = 30;
        sp._glyphKey = key;
        this.scene.add(sp);
        this._tacticalGlyphs.set(vid, sp);
      }
      const p = entry.sprite.position;
      sp.position.set(p.x, p.y + 0.02, p.z);
      // Stały rozmiar ekranowy — kompensacja dystansu (wzór ALERT_MARKER_REF_DIST).
      const distFactor = camPos ? Math.max(0.5, camPos.distanceTo(sp.position) / ALERT_MARKER_REF_DIST) : 1;
      sp.scale.setScalar(ThreeRenderer.TACTICAL_GLYPH_SCALE * distFactor);
      sp.material.opacity = entry.intelOpacity ?? 1.0;            // ghost-opacity wrogów
      this._hideVesselModel(vid, entry);
      aliveIds.add(vid);

      // ── Duch ETA (2d) — WYŁĄCZNIE własne statki z celem misji; rok z
      // buildShipEntry (zero lokalnych ETA); 'moving' → ~rok + puls.
      if (!enemy && v.mission && Number.isFinite(v.mission.targetX)
          && Number.isFinite(v.mission.targetY) && pict.eta) {
        this._upsertTacticalGhost(vid, v, pict, glyph, colorHex, camPos);
      } else if (this._tacticalGhosts.has(vid)) {
        this._disposeTacticalGhost(vid);
      }
    }
    for (const k of [...this._tacticalGlyphs.keys()]) if (!aliveIds.has(k)) this._disposeTacticalGlyph(k);
    for (const k of [...this._tacticalGhosts.keys()]) if (!aliveIds.has(k)) this._disposeTacticalGhost(k);
    // 2g — wskaźniki ruchu ciał (chevron + tiki przyszłych pozycji + ETA celu).
    this._syncTacticalOrbitMarkers(camPos);
  }

  // Tekstura ducha: glif-OUTLINE + etykieta `⏱rok` (moving → `~rok`). Cache per treść.
  static _ghostTexCache = new Map();
  static _createGhostTexture(glyph, colorHex, etaLabel) {
    const key = `${glyph}|${colorHex}|${etaLabel}`;
    const cached = ThreeRenderer._ghostTexCache.get(key);
    if (cached) return cached;
    const w = 128, h = 96;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.strokeStyle = colorHex; c.lineWidth = 3;
    c.font = `bold 44px sans-serif`;
    c.strokeText(glyph, w / 2, 34);              // sam OBRYS — „przyszły stan", nie obiekt
    c.font = `bold 20px sans-serif`;
    c.fillStyle = colorHex;
    c.fillText(etaLabel, w / 2, 76);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    ThreeRenderer._ghostTexCache.set(key, tex);
    return tex;
  }

  _upsertTacticalGhost(vid, vessel, pict, glyph, colorHex, camPos) {
    const world = gameplayToWorld({ x: vessel.mission.targetX, y: vessel.mission.targetY });
    if (!world) { this._disposeTacticalGhost(vid); return; }
    const moving = pict.eta.confidence === 'moving';
    const yr = Number.isFinite(pict.eta.year) ? Math.round(pict.eta.year) : null;
    const etaLabel = yr === null ? '⏱?' : (moving ? `~${yr}` : `⏱${yr}`);
    const key = `${glyph}|${colorHex}|${etaLabel}`;
    let sp = this._tacticalGhosts.get(vid);
    if (!sp || sp._ghostKey !== key) {
      if (sp) this._disposeTacticalGhost(vid);
      sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ThreeRenderer._createGhostTexture(glyph, colorHex, etaLabel),
        transparent: true, depthWrite: false, depthTest: false,
      }));
      sp.renderOrder = 29;
      sp._ghostKey = key;
      this.scene.add(sp);
      this._tacticalGhosts.set(vid, sp);
    }
    sp.position.set(world.worldX, 0.02, world.worldZ);
    const distFactor = camPos ? Math.max(0.5, camPos.distanceTo(sp.position) / ALERT_MARKER_REF_DIST) : 1;
    sp.scale.set(0.8 * distFactor, 0.6 * distFactor, 1);
    // F4 Dok — hover w doku: mocniejszy/szybszy puls (podgląd „który to statek").
    // Inaczej: 'moving' pulsuje (cel ruchomy — ETA przybliżone); firm = spokojna półprzezroczystość.
    const hovered = vid === this._tacticalHoverVid;
    sp.material.opacity = hovered
      ? GHOST_PULSE_HOVER_MIN + (GHOST_PULSE_HOVER_MAX - GHOST_PULSE_HOVER_MIN)
          * (0.5 + 0.5 * Math.sin(this._clock.getElapsedTime() * GHOST_PULSE_HOVER_FREQ))
      : (moving
          ? 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(this._clock.getElapsedTime() * 3.2))
          : 0.55);
  }

  _disposeTacticalGhost(vid) {
    const sp = this._tacticalGhosts.get(vid);
    if (!sp) return;
    this.scene.remove(sp);
    sp.material?.dispose?.();   // tekstura z cache — NIE dispose
    this._tacticalGhosts.delete(vid);
  }

  // ── Warstwa nawigacyjna trybu Y (2g — KOREKTA kierunku po playteście) ──────
  // Dim ciał WYCOFANY: planety/księżyce zostają w pełnej jasności; „stół sztabowy"
  // = DODANA informacja: wyraźne orbity + subtelna siatka + wskaźniki ruchu ciał.
  // Materiały statków jak dotąd nietykane (intelOpacity wrogów bez konfliktu).
  setTacticalStyle(on) {
    if (on === !!this._tacticalOrbitStyled) return;   // idempotentne
    if (on) {
      // Orbity WYRAŹNE (stała alfa; kolor zostaje — stonowany z materiału).
      const rec = [];
      const boost = (line) => {
        const m = line?.material;
        if (!m) return;
        rec.push({ m, opacity: m.opacity, transparent: m.transparent });
        m.transparent = true;
        m.opacity = ThreeRenderer.TACTICAL_ORBIT_ALPHA;
      };
      for (const [, line] of this._orbits) boost(line);
      for (const [, line] of this._planetoidOrbits) boost(line);
      this._tacticalOrbitStyled = rec;
      this._buildTacticalGrid();
    } else {
      for (const { m, opacity, transparent } of this._tacticalOrbitStyled ?? []) {
        m.opacity = opacity;
        m.transparent = transparent;
      }
      this._tacticalOrbitStyled = null;
      this._disposeTacticalGrid();
    }
  }

  // Subtelna siatka taktyczna — koncentryczne pierścienie co „ładny" krok AU.
  _buildTacticalGrid() {
    this._disposeTacticalGrid();
    const extentAU = this._computeSystemExtentAU?.() ?? 25;
    const step = extentAU > 20 ? 5 : extentAU > 8 ? 2 : 1;   // AU
    const group = new THREE.Group();
    const SEG = 128;
    const worldPerAU = gameplayToWorld({ x: GAME_CONFIG.AU_TO_PX, y: 0 })?.worldX
      - gameplayToWorld({ x: 0, y: 0 })?.worldX;
    if (!Number.isFinite(worldPerAU) || worldPerAU === 0) return;
    for (let au = step; au <= extentAU + step * 0.5; au += step) {
      const r = au * worldPerAU;
      const pts = [];
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x88bbcc, transparent: true,
        opacity: ThreeRenderer.TACTICAL_GRID_ALPHA, depthWrite: false,
      });
      group.add(new THREE.Line(geo, mat));
    }
    group.renderOrder = -1;
    this.scene.add(group);
    this._tacticalGrid = group;
  }

  _disposeTacticalGrid() {
    if (!this._tacticalGrid) return;
    this.scene.remove(this._tacticalGrid);
    this._tacticalGrid.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    this._tacticalGrid = null;
  }

  // ── Wskaźniki ruchu ciał (2g pkt 2/3) — chevron kierunku + tiki przyszłych
  // pozycji (+N lat, interwał adaptacyjny do okresu) + znacznik ETA na orbicie
  // ciała docelowego ZAZNACZONEGO statku (synergia z duchem ETA). Geometria z
  // TacticalModeLogic (czysta, ten sam łańcuch Keplera co PhysicsSystem).
  static _orbitTickTexCache = new Map();
  static _createOrbitTickTexture(label, colorHex) {
    const key = `${label}|${colorHex}`;
    const cached = ThreeRenderer._orbitTickTexCache.get(key);
    if (cached) return cached;
    const w = 128, h = 64;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = colorHex;
    c.beginPath(); c.arc(w / 2, 13, 6, 0, Math.PI * 2); c.fill();   // kropka na orbicie
    // 2h: font podbity 18→26 px (etykiety '+N' czytelne przy pełnym kadrze układu)
    c.font = 'bold 26px sans-serif';
    c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 5;
    c.strokeText(label, w / 2, 42);
    c.fillText(label, w / 2, 42);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    ThreeRenderer._orbitTickTexCache.set(key, tex);
    return tex;
  }

  _syncTacticalOrbitMarkers(camPos) {
    const star = this._star;
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const alive = new Set();
    const upsert = (key, tex, gp, scaleW, scaleH) => {
      const world = gameplayToWorld(gp);
      if (!world) return;
      let sp = this._tacticalOrbitMarkers.get(key);
      if (!sp || sp._tex !== tex) {
        if (sp) { this.scene.remove(sp); sp.material?.dispose?.(); }
        sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.85,
        }));
        sp.renderOrder = 28;
        sp._tex = tex;
        this.scene.add(sp);
        this._tacticalOrbitMarkers.set(key, sp);
      }
      sp.position.set(world.worldX, 0.01, world.worldZ);
      const df = camPos ? Math.max(0.5, camPos.distanceTo(sp.position) / ALERT_MARKER_REF_DIST) : 1;
      sp.scale.set(scaleW * df, scaleH * df, 1);
      alive.add(key);
    };

    // 2h — adaptacja wskaźników do ZOOMU kamery: daleki kadr → mniej tików,
    // większe; bliski → gęściej, mniejsze. Rozmiary bazowe × distFactor w upsert
    // (stały rozmiar EKRANOWY — kryterium: czytelne przy pełnym kadrze I zbliżeniu).
    const camDist = this._cameraController?._dist ?? 85;
    const far  = camDist >= ThreeRenderer.TACTICAL_ZOOM_FAR;
    const near = camDist <= ThreeRenderer.TACTICAL_ZOOM_NEAR;
    const tickCount = far ? 1 : near ? 3 : 2;
    const tickStepMult = far ? 2 : 1;
    // Fix 2: bump skali przy dalekim kadrze 1.25→1.45 (czytelność tików zewnętrznych).
    const sizeMult = far ? 1.45 : near ? 0.85 : 1;
    const tickW = ThreeRenderer.TACTICAL_TICK_SCALE * sizeMult;
    const chevW = ThreeRenderer.TACTICAL_CHEV_SCALE * sizeMult;
    // Fix 2 (#tactical-tick-declutter): promień orbity na EKRANIE (przybliżenie
    // centralne: px/world = (H/2) / (dist·tan(fov/2))) — tiki tylko gdy
    // orbitTicksVisible (> TICK_MIN_ORBIT_PX); chevrony na wszystkich orbitach.
    const fovRad = (this.camera?.fov ?? 55) * Math.PI / 180;
    const pxPerWorld = ((window.innerHeight || 720) / 2) / (camDist * Math.tan(fovRad / 2));
    const w0 = gameplayToWorld({ x: 0, y: 0 });
    const w1 = gameplayToWorld({ x: GAME_CONFIG.AU_TO_PX, y: 0 });
    const worldPerAU = (w1 && w0) ? Math.abs(w1.worldX - w0.worldX) : 0;

    for (const [pid] of this._planets) {
      const body = EntityManager.get(pid);
      const orb = body?.orbital;
      if (!orb || !Number.isFinite(orb.T)) continue;
      // Chevron kierunku ruchu: pozycja za mały krok czasu → strzałka „➤" obrócona.
      const now = orbitalPositionAtDelta(orb, 0, GAME_CONFIG.AU_TO_PX, star?.x ?? 0, star?.y ?? 0);
      const ahead = orbitalPositionAtDelta(orb, orb.T / 72, GAME_CONFIG.AU_TO_PX, star?.x ?? 0, star?.y ?? 0);
      if (now && ahead) {
        const tex = ThreeRenderer._createOrbitTickTexture('➤', '#9fd8e8');
        const key = `chev:${pid}`;
        upsert(key, tex, { x: now.x + (ahead.x - now.x) * 2.5, y: now.y + (ahead.y - now.y) * 2.5 }, chevW, chevW * 0.5);
        const sp = this._tacticalOrbitMarkers.get(key);
        // Obrót spritu w płaszczyźnie ekranu wg kierunku ruchu (gameplay XY → world XZ).
        if (sp) sp.material.rotation = -Math.atan2(ahead.y - now.y, ahead.x - now.x);
      }
      // Tiki przyszłych pozycji (+N lat — adaptacyjnie do okresu orbity I zoomu);
      // Fix 2: TYLKO orbity dostatecznie duże na ekranie (wewnętrzne = czyste).
      if (orbitTicksVisible((orb.a ?? 0) * worldPerAU * pxPerWorld)) {
        for (const { dt, label } of futureMarkerDeltas(orb.T, tickCount, tickStepMult)) {
          const p = orbitalPositionAtDelta(orb, dt, GAME_CONFIG.AU_TO_PX, star?.x ?? 0, star?.y ?? 0);
          if (!p) continue;
          upsert(`tick:${pid}:${dt}`, ThreeRenderer._createOrbitTickTexture(label, '#7fb8cc'), p, tickW, tickW * 0.5);
        }
      }
    }

    // Znacznik ETA planety docelowej ZAZNACZONEGO statku: „planeta będzie wtedy TAM".
    const selId = window.KOSMOS?.uiManager?.getSelectedVesselId?.();
    const selV = selId ? window.KOSMOS?.vesselManager?.getVessel?.(selId) : null;
    const tgt = selV?.mission?.targetId ? EntityManager.get(selV.mission.targetId) : null;
    const etaYear = selV?.mission?.arrivalYear;
    if (tgt?.orbital && Number.isFinite(etaYear) && etaYear > gameYear) {
      const p = orbitalPositionAtDelta(tgt.orbital, etaYear - gameYear, GAME_CONFIG.AU_TO_PX,
                                       star?.x ?? 0, star?.y ?? 0);
      if (p) {
        upsert(`eta:${selId}`, ThreeRenderer._createOrbitTickTexture(`⏱${Math.round(etaYear)}`, '#ffd479'),
               p, ThreeRenderer.TACTICAL_ETA_SCALE * sizeMult, ThreeRenderer.TACTICAL_ETA_SCALE * sizeMult * 0.5);
      }
    }

    // F4 Dok OŚ — hover paska osi: „gdzie będzie planeta celu HOVEROWANEGO statku w roku X"
    // (cyan, odróżnia od żółtego markera ETA zaznaczonego). Pomija gdy hover==zaznaczony.
    const hovId = this._tacticalHoverVid;
    const hovYear = this._tacticalHoverYear;
    if (hovId && hovId !== selId && Number.isFinite(hovYear) && hovYear > gameYear) {
      const hv = window.KOSMOS?.vesselManager?.getVessel?.(hovId);
      const htgt = hv?.mission?.targetId ? EntityManager.get(hv.mission.targetId) : null;
      if (htgt?.orbital) {
        const hp = orbitalPositionAtDelta(htgt.orbital, hovYear - gameYear, GAME_CONFIG.AU_TO_PX,
                                          star?.x ?? 0, star?.y ?? 0);
        if (hp) upsert(`hover:${hovId}`, ThreeRenderer._createOrbitTickTexture(`~${Math.round(hovYear)}`, '#66ddff'),
                       hp, ThreeRenderer.TACTICAL_ETA_SCALE * sizeMult, ThreeRenderer.TACTICAL_ETA_SCALE * sizeMult * 0.5);
      }
    }

    for (const k of [...this._tacticalOrbitMarkers.keys()]) {
      if (!alive.has(k)) {
        const sp = this._tacticalOrbitMarkers.get(k);
        this.scene.remove(sp);
        sp.material?.dispose?.();
        this._tacticalOrbitMarkers.delete(k);
      }
    }
  }

  _disposeAllTacticalOrbitMarkers() {
    for (const k of [...this._tacticalOrbitMarkers.keys()]) {
      const sp = this._tacticalOrbitMarkers.get(k);
      this.scene.remove(sp);
      sp.material?.dispose?.();
      this._tacticalOrbitMarkers.delete(k);
    }
  }

  // Ukryj DZIECI wrappera (model GLB + exhaust) — refs do restore; sprite-fallback
  // (brak dzieci) zostaje widoczny pod glifem (rzadki przypadek, nieszkodliwy).
  _hideVesselModel(vid, entry) {
    if (this._tacticalHiddenModels.has(vid)) return;
    const kids = entry.sprite?.children;
    if (!kids?.length) return;
    const hidden = [];
    for (const k of kids) if (k.visible) { k.visible = false; hidden.push(k); }
    this._tacticalHiddenModels.set(vid, hidden);
  }

  _disposeTacticalGlyph(vid, keepModelHidden = false) {
    const sp = this._tacticalGlyphs.get(vid);
    if (sp) {
      this.scene.remove(sp);
      sp.material?.dispose?.();   // tekstura (map) z cache — NIE dispose
      this._tacticalGlyphs.delete(vid);
    }
    if (!keepModelHidden) {
      const hidden = this._tacticalHiddenModels.get(vid);
      if (hidden) for (const k of hidden) k.visible = true;
      this._tacticalHiddenModels.delete(vid);
    }
  }

  _disposeAllTacticalGlyphs() {
    for (const k of [...this._tacticalGlyphs.keys()]) this._disposeTacticalGlyph(k);
    for (const k of [...this._tacticalGhosts.keys()]) this._disposeTacticalGhost(k);
    this._disposeAllTacticalOrbitMarkers();
    // Modele mogły zostać ukryte bez żywego glifu (np. statek zniknął z intelu) —
    // domknij wszystkie pozostałe restore'y.
    for (const [vid, hidden] of this._tacticalHiddenModels) {
      for (const k of hidden) k.visible = true;
      this._tacticalHiddenModels.delete(vid);
    }
  }

  // ── Pulsujący marker wykrytego wroga (≥rumor) — alert na mapie 3D ──────────
  // Czerwony reticle-billboard (zawsze ku kamerze) wokół KAŻDEGO wrogiego statku
  // wykrytego przez statek LUB obserwatorium (intel ≥ rumor — gate _isEnemyTargetable).
  // Pozycja = entry.sprite.position (przy rumor zamrożona na positionLastKnown przez
  // _applyVesselIntelVisibility → BRAK przecieku mgły wojny; tożsamość nie ujawniona —
  // marker to tylko „tu jest wróg"). Mark&sweep (wzór _syncInsignia) + wspólny puls.
  _getAlertReticleTex() {
    if (this._alertReticleTex) return this._alertReticleTex;
    const sz = 64;
    const cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const c = cv.getContext('2d');
    // Biały reticle (tint przez material.color) — pierścień + 4 ticki celownika.
    c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.lineCap = 'round';
    const cx = sz / 2, cy = sz / 2, r0 = sz * 0.32, r1 = sz * 0.46;
    c.beginPath(); c.arc(cx, cy, r0, 0, Math.PI * 2); c.stroke();
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.stroke();
    }
    this._alertReticleTex = new THREE.CanvasTexture(cv);
    this._alertReticleTex.needsUpdate = true;
    return this._alertReticleTex;
  }

  _syncEnemyAlertMarkers() {
    if (!GAME_CONFIG.FEATURES?.fcEnemyAlertMarker) {
      if (this._enemyAlertMarkers.size) this._disposeAllEnemyAlertMarkers();
      return;
    }
    const vm = window.KOSMOS?.vesselManager;
    if (!vm) { if (this._enemyAlertMarkers.size) this._disposeAllEnemyAlertMarkers(); return; }
    const tt = this._clock.getElapsedTime();
    const pulse = 0.5 + 0.5 * Math.sin(tt * 3.2);   // 0..1, wspólna faza (radar-sync)
    const opacity = 0.35 + 0.55 * pulse;            // 0.35..0.90 — nigdy niewidoczny
    const pulseScale = ALERT_MARKER_SCALE * (1 + 0.16 * pulse);
    const camPos = this.camera?.position;            // skala wg dystansu → stały rozmiar EKRANOWY
    const active = new Set();
    for (const [vid, entry] of this._vessels) {
      if (!entry?.sprite?.visible) continue;          // ukryty/wyblakły ghost → brak markera
      const v = vm.getVessel?.(vid);
      if (!v || v.isWreck) continue;
      if (!isEnemyVessel(v)) continue;                // tylko wrogowie (NIE własne statki)
      if (!this._isEnemyTargetable(vid)) continue;    // intel ≥ rumor (gate quality)
      active.add(vid);
      let m = this._enemyAlertMarkers.get(vid);
      if (!m) {
        m = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._getAlertReticleTex(), color: ALERT_MARKER_COLOR,
          transparent: true, depthWrite: false,
        }));
        this.scene.add(m);
        this._enemyAlertMarkers.set(vid, m);
      }
      const p = entry.sprite.position;
      m.position.set(p.x, p.y, p.z);
      m.material.opacity = opacity;
      // Skaluj wielkością proporcjonalnie do dystansu kamery — billboard o stałym rozmiarze
      // świata KURCZY się ekranowo przy oddaleniu (znikał z dalekiego zoomu). Mnożnik
      // dist/REF_DIST utrzymuje ~stały rozmiar na ekranie od bliska po cały układ.
      const distFactor = camPos ? Math.max(0.5, camPos.distanceTo(m.position) / ALERT_MARKER_REF_DIST) : 1;
      m.scale.setScalar(pulseScale * distFactor);
    }
    for (const k of [...this._enemyAlertMarkers.keys()]) if (!active.has(k)) this._disposeEnemyAlertMarker(k);
  }

  _disposeEnemyAlertMarker(vid) {
    const m = this._enemyAlertMarkers.get(vid);
    if (!m) return;
    this.scene.remove(m);
    m.material?.dispose?.();   // tekstura (map) współdzielona z _alertReticleTex — NIE dispose
    this._enemyAlertMarkers.delete(vid);
  }

  _disposeAllEnemyAlertMarkers() {
    for (const k of [...this._enemyAlertMarkers.keys()]) this._disposeEnemyAlertMarker(k);
  }

  // ─────────────────────────────────────────────────────────────
  // POI sprites (M2b C7) — wizualne markery POI na mapie 3D
  // ─────────────────────────────────────────────────────────────
  // 5 typów × cyan-shifted paleta + symbol Unicode (Canvas → CanvasTexture →
  // SpriteMaterial → THREE.Sprite). Texture cache per typ — reuse'owane przez
  // wszystkie POI tego typu (np. 100 patrol POI = 1 texture). Lifecycle
  // event-driven na poi:created/deleted/updated. Init z gameState po load
  // przez `initPOISpritesFromState()` (woła GameScene).
  //
  // userData na sprite: { poiId, poiName, poiType } — gotowe pod tooltip
  // raycaster w M3 (D4 deferral z C7 plan mode).

  /**
   * Tworzy CanvasTexture z symbolem Unicode + ringu w kolorze typu. Cache per typ —
   * pierwsza POI danego typu tworzy texture, kolejne reuse'ują.
   */
  _getOrCreatePOITexture(type) {
    if (this._poiTextureCache.has(type)) return this._poiTextureCache.get(type);

    const symbol = POI_TYPE_SYMBOLS[type] ?? '?';
    const color  = POI_TYPE_COLORS[type] ?? 0xffffff;
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Tło: subtelne wypełnienie circle (alpha 0.3)
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();

    // Outline ring (alpha 0.9)
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Symbol w centrum (alpha 1.0). y=34 zamiast 32 dla optycznej centracji
    // glyphów (większość symboli ma baseline poniżej geometric center).
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 1.0)`;
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 32, 34);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this._poiTextureCache.set(type, texture);
    return texture;
  }

  /**
   * Center point per typ POI:
   *   waypoint → poi.point
   *   patrol   → poi.waypoints[0] (pierwszy waypoint jako "kotwica")
   *   rally/picket/ambush → poi.center
   */
  _resolvePOICenter(poi) {
    if (poi.type === 'waypoint') return poi.point;
    if (poi.type === 'patrol')   return poi.waypoints?.[0] ?? null;
    if (poi.type === 'rally' || poi.type === 'picket' || poi.type === 'ambush') {
      return poi.center;
    }
    return null;
  }

  _addPOISprite(poi) {
    if (!GAME_CONFIG.FEATURES.poiSystem) return;
    if (!poi || !poi.id) return;
    if (this._poiSprites.has(poi.id)) return;  // already exists

    const point = this._resolvePOICenter(poi);
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return;

    const texture = this._getOrCreatePOITexture(poi.type);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    // M3 P3.1 — runtime state visual: triggered picket / complete rally → ×1.3 scale
    // (texture jest cache'owana per type, więc kolor nie zmienia się; scale to
    // simple, low-risk indicator).
    const scaleMul = (poi.type === 'picket' && poi.triggered) ? 1.3
                  : (poi.type === 'rally'  && poi.complete)  ? 1.2
                  : 1.0;
    sprite.scale.set(POI_SPRITE_SIZE * scaleMul, POI_SPRITE_SIZE * scaleMul, 1);
    sprite.position.set(S(point.x), POI_SPRITE_Y, S(point.y));
    // M3 P1.2 — kosmosType dla raycaster (P1.5 tooltip reuse'uje ten sam userData).
    sprite.userData = { kosmosType: 'poi', poiId: poi.id, poiName: poi.name, poiType: poi.type };

    this.scene.add(sprite);
    this._poiSprites.set(poi.id, { sprite, type: poi.type });
  }

  _removePOISprite(poiId) {
    const entry = this._poiSprites.get(poiId);
    if (!entry) return;
    this.scene.remove(entry.sprite);
    entry.sprite.material.dispose();
    // Texture zostaje w cache — reuse'owana przez inne POI tego typu.
    // Pełen dispose textur w `_disposeAllPOISprites` (switchSystem reset).
    this._poiSprites.delete(poiId);
  }

  _updatePOISprite(poiId, poi) {
    const entry = this._poiSprites.get(poiId);
    if (!entry) {
      // Sprite nie istniał (np. po load, lub flag flip mid-game). Utwórz.
      this._addPOISprite(poi);
      return;
    }
    const point = this._resolvePOICenter(poi);
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      entry.sprite.position.set(S(point.x), POI_SPRITE_Y, S(point.y));
    }
    if (entry.sprite.userData) entry.sprite.userData.poiName = poi.name;
    // M3 P3.1 — runtime state: scale change zwracający informację o triggered/complete
    const scaleMul = (poi.type === 'picket' && poi.triggered) ? 1.3
                  : (poi.type === 'rally'  && poi.complete)  ? 1.2
                  : 1.0;
    entry.sprite.scale.set(POI_SPRITE_SIZE * scaleMul, POI_SPRITE_SIZE * scaleMul, 1);
  }

  _disposeAllPOISprites() {
    for (const id of [...this._poiSprites.keys()]) {
      this._removePOISprite(id);
    }
    // Pełen cleanup texturek — switchSystem zaczyna od czystej karty.
    for (const tex of this._poiTextureCache.values()) {
      tex.dispose();
    }
    this._poiTextureCache.clear();
  }

  /**
   * Public API — GameScene woła po `poiRegistry.initPOISubdomain()`
   * (zarówno przy nowej grze jak i po `gameState.restore()`). Skanuje
   * istniejące POI w gameState i tworzy sprites. Idempotent — duplicate
   * call nie tworzy ghost sprites (`_addPOISprite` filtruje istniejące).
   */
  initPOISpritesFromState() {
    if (!GAME_CONFIG.FEATURES.poiSystem) return;
    const pois = window.KOSMOS?.gameState?.get?.('pois') ?? {};
    for (const poi of Object.values(pois)) {
      this._addPOISprite(poi);
    }
  }
}
