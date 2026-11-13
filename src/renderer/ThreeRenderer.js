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
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass }       from 'three/addons/postprocessing/SMAAPass.js';   // ARC CV-5 (decyzja 41) — wygładzanie krawędzi na High
import EventBus           from '../core/EventBus.js';
import EntityManager      from '../core/EntityManager.js';
import { GAME_CONFIG, STAR_TYPES } from '../config/GameConfig.js';
import { resolveTextureType, loadPlanetTextures, loadStarTextures, hashCode, TEXTURE_VARIANTS,
         resolveMaxAnisotropy, setMaxAnisotropy }
  from './PlanetTextureUtils.js';
import { RegionGenerator }    from '../map/RegionSystem.js';
import { BiomeMapGenerator }  from './BiomeMapGenerator.js';
import { PlanetShader }       from './PlanetShader.js';
import { GasGiantShader }    from './GasGiantShader.js';
import { SunShader }         from './SunShader.js';
import { AtmosphereShader }  from './AtmosphereShader.js';
import { withLogDepthVertex, withLogDepthFragment } from './LogDepthChunks.js';
import { rendererRandom } from './RendererRng.js';   // ARC CV-0b (Finding 612) — losowanie wizualne poza strumieniem gry
import { PresentationClock } from './combat/PresentationClock.js';   // ARC CV-2a (D-CV-10) — zegar prezentacji: pauza = pauza
import { FxEngine, LIVE_CV_FX } from './combat/FxEngine.js';         // ARC CV-2a — silnik FX walki na pulach (flaga cvFxEngine)
import { createSkyStarMaterial } from './StarPointShader.js';   // NIEBO — PSF gwiazd tła
import { atmoStrengthFor, densityMul, discFade } from './AtmosphereLogic.js';
import { sunDiscPx, sunDetailLevel, granFadeEdges, integratePhase,
         classGranParams, granAmplitude, promEnvelope, limbWeight } from './SunAnimationLogic.js';
import { ColonyBuildingMarkers } from './ColonyBuildingMarkers.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { loadAllTerrainTextures, texturesLoaded } from './TerrainTextures.js';
import { loadBuildingTextures } from './BuildingTextures.js';
import { vesselModelPath, vesselTargetSize, vesselSizeClass, VESSEL_MODEL_DEFAULT, VESSEL_TARGET_SIZE }
  from './VesselModelResolver.js';
import { STAGE, solveStage, bandEdgesWU, apparentEdges, pairKey, encounterClusters, encounterParticipants,
  pickStageField, stagePointLogical, stagePointDrawn, shellBaseAt } from './combat/BattleStageLogic.js';   // ARC CV-3a1 — scena bitwy; CV-3a2 — klik i klastry; CV-3a3 — skorupa
import { stageBlend, stageBlendFloored, lengthPx } from './combat/SemanticZoomLogic.js';            // ARC CV-3a1 — zoom semantyczny (CV-6b — podłoga, decyzja 20)
import { motionSegment, motionAt, targetVelocity } from './combat/StageMotionLogic.js';            // ARC CV-6b — ruch sceny ciągły w prędkości
import { createChoreo, choreoSeed, choreoClassOf, choreoEnvelope, postureOf, pickFacingTarget, constrainChoreo, quatFromYawPitchRoll,
  stepChoreo2Offset, stepChoreo2Facing, stepChoreo2Engine } from './combat/ChoreographyLogic.js';   // ARC CV-3b / CV-3c — choreografia (lot wzdłuż kursu)
import { ShipHardpointsCache, slotOfModelPath, yawToward, orbitYaw, bankRoll, INCOMING_DIR, SHIP_MODEL_DIR,
  REST_YAW_CANONICAL, wreckTiltQuaternion, has1kVariant, modelPath1k } from './ShipHardpoints.js';   // ARC CV-1a — hardpointy, rama kanoniczna (kurs spoczynkowy i wrak jak OFF); CV-2b — wariant 1K
import { buildShipRig, disposeShipRig, paintRigMaterials, paintRigRim, lightTestPattern, NOZZLE_KEY_HEX } from './ShipModelRig.js';      // ARC CV-1a — statek w ramie kanonicznej; CV-3c — wylot dysz
import { LightPointPool } from './ShipLightPoints.js';                                                // ARC CV-1a — punkty świetlne `lights[]`
import { LIGHT_POOL_MAX, bloomInputSize } from '../data/CombatFxPresets.js';                          // ARC CV-2b — presety jakości (tabela §2.10); CV-5 — bloom w px CSS
import { initialGfxLevel, normalizeGfxLevel, nextGfxLevelInCycle, readRendererString, resolveGfxSettings, writeStoredGfxLevel,
  QualityThrottle, LIVE_GFX_THROTTLE } from './combat/QualityPreset.js';                             // ARC CV-2b — wykrycie, zapis, dławienie
import { CombatLightPool } from './combat/LightPool.js';                                              // ARC CV-2b — stała pula świateł (D-CV-18)
import { CombatCueBus, cueWeaponOfCategory, cueSizeOfClass, screenPan } from './combat/CombatCueBus.js';   // ARC CV-2b — szyna sygnałów walki (F8)
import { CombatLedger, pickTurret, ledgerRng, ledgerHash, LEDGER_INFO_LEGEND } from './combat/CombatLedgerLogic.js';   // ARC CV-4a — rejestr salw (język broni, flaga cvWeapons)
import { CvOrbital } from './CvOrbital.js';     // ARC CV-8a — powtórka bitwy orbitalnej na scenie planety
import { CvDirector } from './CvDirector.js';   // ARC CV-7 — kamera reżysera, spowolnienie bohatera, wstrząs, 9:16, tryb nagrywania, nagrywarka rolek
import { KC_SHARED, KC_SCORCH_MAX, setKeyColourWreckState, setKeyColourScorch, setKeyColourScorchHeat, setKeyColourScorchCount } from './KeyColourEmission.js';   // ARC CV-1a — wspólne mnożniki maski; CV-5 — wypalanie wraku; CV-4b — osmalenia
import { ShieldStates, bubbleAxes, ellipsoidPoint, hullPoint, scorchEnabled, allocScorch, scorchHeat, SHIELD_RIPPLES_MAX, SCORCH_MAX } from './combat/ShieldLogic.js';   // ARC CV-4b — osłony i pancerz
import { ShieldBubblePool } from './combat/ShieldBubbles.js';                                         // ARC CV-4b — pula baniek osłon
import { explosionPlan, explosionBudget, explosionClassOf, explosionSeed, damageStateOf, wreckHeatAt, wreckBurnColor, wreckFireWindow,
  wreckDrift, wreckConverge, sputterGate, emitterTicks, seedUnit as expSeedUnit, wreckAfterDrift } from './combat/ExplosionLogic.js';   // ARC CV-5 — wybuchy, uszkodzenia, wraki; CV-3c — dryf po bitwie
import { isStationInActiveSystem } from './StationRenderLogic.js';
import { COMBAT_WATCH, watchSafeRect, capBillboardWorld, watchFxScale, autoFocusFollowStep, glideRetarget, glideStep,
  centroidOf, fitWatchFrameOffset, viewOffsetFrame } from './CombatWatchLogic.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { LIVE_SKY, buildSkyCatalog, skyFrom, allocSkyBuffers, skySeedOf, skyKnobSnapshot, skyKnobsChanged,
         nearestRealSystems, skyDirectionTo, lookAnglesFor, SKY_LOOK, formatLy }
  from '../utils/SkyCatalog.js';   // NIEBO (ARC GALAXY) — niebo z katalogu galaktyki
import { systemRevealFromWorld } from '../utils/SystemRevealWorld.js';   // NIEBO — kanon mgły wojny (jeden punkt składania)
import { GalaxyPlate } from './GalaxyPlate.js';   // ARC GALAXY G1 — płyta galaktyki w tej samej scenie (F1)
import { GALAXY_K, GALAXY_LAYER, CAMERA_FAR, GALAXY_FADE_MS, GALAXY_PICK_HALF_PX, LIVE_GALAXY, pickGalaxyStar }
  from '../ui/GalaxyModeLogic.js';
import { makeHudProjector } from '../ui/HudProjection.js';   // ARC GALAXY G1 — rzut gwiazd płyty (ten sam co warstwa HUD)
import { GalaxyTerritory } from './GalaxyTerritory.js';     // ARC GALAXY G2-3 — terytorium na płycie (rozlane światło, zasłony)
import { buildPlateTerritoryPayload, plateTerritoryVisibility, plateOwnerHalos, plateRiserIds } from '../ui/GalaxyTerritoryLogic.js';
import { subPixelHidden } from '../ui/GalaxyFlightLogic.js'; // ARC GALAXY G2-1 — siatki poniżej 0,5 px chowane w trakcie lotu
import { systemIdOf } from '../utils/SystemScope.js';   // ARKUSZ UI U3-2 — termin układu pingu (Finding 477)
import { buildShipEntry, toneColor } from '../ui/FleetPictureLogic.js';
import { CLICK_INTENT, clickObject, resolveClickIntent, readClickSelection, applyClickIntent } from '../ui/ClickIntentLogic.js';   // ARKUSZ UI U1-3 (D-UI-5)
import { getMapInsets } from '../ui/MapInsets.js';   // ARKUSZ UI U2-2 / U4-2 — wcięcia kadru „Obserwuj” (outlinery, pas dolny)
import { THEME, themeEpoch } from '../config/ThemeConfig.js';
import { COSMIC } from '../config/LayoutConfig.js';
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
  isEngagementInView, watchBattleAction,
  isPlayerEngagement, isEndpointVisibleInCombat,
  exhaustGradientColors, exhaustIntensityRaw, explosionColorRaw,
  rumorGhostHold }
  from '../utils/VesselFxLogic.js';
import { orbitClockSec, simClockMs } from '../utils/SimClock.js';   // POLISH P1 (CP5, Finding 452) — zegar kąta orbit (jak logika); paczka B — puls celownika
import { planetOrbitStyle, moonOrbitStyle, planetoidOrbitStyle, applyOrbitStyle, orbitPalette,
  hudOrbitSyncKey } from './HudOrbitLogic.js';   // ARKUSZ HUD H0 (D-HUD-7) — orbity w kolorach motywu
// ARKUSZ HUD paczka B — chip [O] (`uiPrefs.hudLayers.orbits`), celownik wroga w rytmie alertu; kolory 3D w rolach motywu
// (D-HUD-16). Radar, trasy i etykiety rysuje warstwa HUD 2D (`HudLayer`); od B-Z bez flag HUD i bez dawnych ścieżek 3D.
import { readHudLayers } from '../ui/HudLayerChipsLogic.js';
import { hudRoleHex } from '../ui/HudPalette.js';

const AU          = GAME_CONFIG.AU_TO_PX;   // 110
const WORLD_SCALE = 10;                      // dzielnik pozycji: AU×11 w 3D
// ── Pipeline HDR (2026-07-20, analiza-grafiki-mapy-3d.md) ────────────────
// Scena liczona w linear HDR → JEDEN pełnoekranowy UnrealBloom z progiem 1.0 →
// ACES filmic → sRGB (OutputPass). Bloomują wyłącznie piksele HDR (>1.0):
// rdzeń/korona gwiazdy, smugi silników, eksplozje, żarzące wraki. Cała reszta
// (tło, planety, markery ≤1.0) NIE bloomuje → czerń zostaje czernią, zero veilu.
// Zastąpiło warstwę selektywnego bloomu (BLOOM_LAYER) i 2 composery.
// Wzmocnienia HDR emiterów FX (dobrane pod próg 1.0 z uwzgl. opacity/flicker):
const FX_HDR_EXHAUST   = 4.5;  // gain vertex-colors smugi (opacity 0.35 × flicker ~0.8 → apex ~1.3)
const FX_HDR_EXPLOSION = 2.5;  // gain kuli ognia
// ARC CV-5 (Finding 706) — [ms czasu realnego] jak długo znacznik sceny przebudowywanego statku czeka na nowy sprite (model GLB
// po zmianie presetu tekstur wstawia się asynchronicznie; pierwszy wariant 1K bywa pobierany setki ms).
const STAGE_REBUILD_KEEP_MS = 10000;
// Mnożnik promienia JASNEJ, nieprzezroczystej tarczy rdzenia gwiazdy. Tarcza jest
// JEDYNYM elementem słońca realnie zasłaniającym ciała (korona = poświata addytywna,
// bloom = post-process — nic nie zasłaniają). Większy = większy dysk = zasłania więcej
// ciał przechodzących za słońcem. Strojenie na żywym obrazie.
const STAR_CORE_SCALE = 3.0;
// Wykładnik kompresji percepcyjnej jasności gwiazdy (FEATURES.starClassLighting).
// STAR_TYPES.luminosity ma rozpiętość ×75 (M 0.04 → F 3.0); podniesienie do ^0.22
// sprowadza ją do ×2.6, więc klasa gwiazdy jest CZYTELNA, a układ czerwonego karła
// nadal da się grać (nie tonie w czerni). Strojenie na żywym obrazie.
const STAR_LUMINOSITY_EXP = 0.22;
// ── V-267 — czy ręcznie pisane shadery piszą głębię LOGARYTMICZNĄ ────────────
// ⚠ FUNKCJA, nie stała modułowa. Stała zamroziłaby flagę na czas IMPORTU, więc
//   przestawienie jej w konsoli nie złapałoby się NAWET po zmianie układu — a to
//   jedyna ścieżka rollbacku, jaką gate ma bez edycji pliku i F5.
// ⚠ Idiom „brak klucza = OFF" (liveGasShaders / liveSunShader / dayNightAtmosphere).
const logDepthOn = () => !!GAME_CONFIG.FEATURES?.sceneDepthUnification;
// ── Pokrętła warstwy chmur (V-278) ───────────────────────────────────────────
// ⚠ Gate stroi to JEDNYM tokenem z konsoli: KOSMOS.threeRenderer.cloudTuning.ALPHA = 0.4
//   — _tickClouds przepisuje wynik do uniformów KAŻDEJ klatki, więc zmiana łapie się
//   natychmiast, dla wszystkich planet, bez restartu i bez rebuildu materiału.
// ⚠ WSZYSTKIE PIĘĆ PÓL JEST ŻYWYCH (reguła V-266: pole przed swoim czytelnikiem to
//   zaślepka nazwana jak funkcja). Cztery idą uniformem, DRIFT_MULT mnoży krok czasu.
// ⚠ WARTOŚCI SĄ DZISIEJSZYMI LITERAŁAMI CO DO BITU — ten commit jest liczbowo
//   neutralny. Warstwa jest dziś praktycznie niewidoczna (V-271: chmury przegrywają
//   test głębi na całej tarczy), więc pokrętła powstają ZANIM będzie co stroić —
//   inaczej gate nie miałby czym odpowiedzieć na pytanie „czy nie za głośno".
const LIVE_CLOUDS = {
  ALPHA:       0.88,  // mistrz alfy warstwy (było zaszyte 0.88)
  COVERAGE_LO: 0.48,  // dolny próg smoothstep maski — NIŻEJ = więcej chmur
  COVERAGE_HI: 0.70,  // górny próg maski
  NIGHT_FLOOR: 0.05,  // rezydualna alfa po stronie nocnej (reszta skaluje się sama)
  // ⚠ DRIFT_MULT NIE jest uniformem i to jest cała jego poprawność. uTime jest
  //   AKUMULOWANE (`+= dt`), a shader liczy dryf jako `t * 0.06`, więc mnożnik wpisany
  //   do SHADERA byłby SKOKIEM POŁOŻENIA, nie zmianą prędkości — dokładnie V-270
  //   w gazowcu. Mnożymy KROK po stronie JS (D-V2u), więc pokrętło zmienia tempo.
  DRIFT_MULT:  1.00,
};
// Ambient sceny (FEATURES.starClassLighting): baza = wartość z _buildLights, oraz
// chłodniejszy wariant dla gwiazd M/K. Czerwony karzeł oświetla scenę ciepło i słabo,
// więc lekko chłodniejsze wypełnienie utrzymuje kontrast barwny nocnej strony zamiast
// zlewać ją z pomarańczem gwiazdy. G/F (i flaga OFF) dostają bazę CO DO BITU.
// ⚠ ZMIERZONE, NIE ZAŁOŻONE (D-V0c, wartości PROWIZORYCZNE — finalna kalibracja
// okiem na live-gate V0). Chłodzimy PRZESUNIĘCIEM ODCIENIA (błękit w górę), nie
// ściemnianiem: pierwsza próba (0x0d1420 @ 0.15) ciągnęła wszystkie kanały w dół
// i dawała deltę LINIOWĄ (0,0,0) — czyli była mierzalnym no-opem.
//   base 0x101a26          → linear8 (1,3,5)
//   cool 0x0a1c4d @ 0.6    → linear8 (1,3,13)   = sRGB 0x0d1b41
//   delta liniowa          → (0,0,8)  ⇒ błękit ×2.6 przy ~stałej luminancji
//   delta sRGB8            → (−3,+1,+27)
// ⚠ lerp liczy się w przestrzeni LINIOWEJ (ColorManagement r171), więc wynik sRGB
//   NIE jest naiwnym środkiem: przewidywano rgb(12,27,61), wyszło rgb(13,27,65).
// Czułość MIX (ten sam kolor docelowy), linear8 błękitu: 0.15→7 · 0.3→9 · 0.6→13
//   · 0.8→16 · 1.0→19. To jest pokrętło do strojenia okiem.
const AMBIENT_BASE_HEX     = 0x101a26;
const AMBIENT_COOL_COLOR   = new THREE.Color(0x0a1c4d);
const AMBIENT_COOL_MIX     = 0.6;                  // 60% ku chłodnemu (patrz ⚠ wyżej)
const AMBIENT_COOL_CLASSES = new Set(['M', 'K']);  // tylko chłodne, słabe gwiazdy
const S           = (v) => v / WORLD_SCALE; // skrót: skaluj pozycję
const SR          = (r) => r / WORLD_SCALE; // skaluj promień

const LIFE_GLOW_COL = 0x44ff88;

// ── Prediction cone (M2b C4) ────────────────────────────────────────────
// Wizualizacja niepewności intercept point: trójkąt (fill + outline) per-vessel. Geom/mat tworzone raz, runtime tylko
// transform (scale.x = szerokość kąta, scale.z = długość zasięgu w world units). ARKUSZ HUD paczka B (D-HUD-16) — kolor
// w roli `primary` motywu (dawniej cyjan 0x00ffff), po zmianie motywu przemalowany (`_syncHud3dColors`).
const PREDICTION_CONE_FILL_ALPHA  = 0.15;
const PREDICTION_CONE_LINE_ALPHA  = 0.6;
const PREDICTION_CONE_BASE_ANGLE  = 0.5;   // rad — unit szerokości; runtime scale.x = angleWidth/baseAngle
const PREDICTION_CONE_Y           = 0.05;  // wysokość nad orbitami (Y=0), pod statkami (Y≥0.3)

// ── Reforma obserwatorium — szara zasłona niezbadanego ciała (podgląd) ──
const BODY_VEIL_COLOR   = 0x8a8a99;         // szara mgła na niezbadanym ciele
const BODY_VEIL_OPACITY = 0.72;             // 0=widać, 1=ukryte (grey-out do czasu skanu)

// ── Marker wykrytego wroga (≥rumor) — pulsujący alert na mapie 3D ──
// ARKUSZ HUD paczka B (D-HUD-16) — kolor w roli `alert` motywu (dawniej 0xff4466), `_syncHud3dColors` po zmianie motywu.
const ALERT_MARKER_SCALE = 0.7;           // bazowa skala billboardu (encircle ~0.3 sprite statku)
const ALERT_MARKER_REF_DIST = 60;           // dystans kamery [WU] dający skalę bazową; dalej → skala rośnie (stały rozmiar ekranowy)
const ALERT_MARKER_PULSE_MAX = 1.16;        // szczyt pulsu celownika (1 + 0,16 · puls) — limit ekranowy liczony dla szczytu
// POLISH P2a (CP14 — limit ekranowy także dla efektów walki przy „Obserwuj”): rodzaje efektów w rozmiarze świata,
// które z bliska zakrywały kadr (sonda P2a, scena 3 na 2: pierścień osłony rośnie do 0,30 j. promienia).
const FX_WATCH_CAPPED = new Set(['explosion']);   // CV-Z — dawne smugi, błyski i pierścienie walki usunięte
const _WATCH_V = new THREE.Vector3();       // POLISH P2a — wektor roboczy głębi widoku (`_viewDepth`)
const _STAGE_V = new THREE.Vector3();       // ARC CV-3a1 — środek sceny bitwy (dystans kamery → zoom semantyczny)
// ARC CV-3b — choreografia: kwaterniony i wektor tymczasowe (kurs na węźle `canon` rigu — bez alokacji THREE co klatkę)
const _CHQ_A = new THREE.Quaternion(), _CHQ_C = new THREE.Quaternion(), _CHQ_D = new THREE.Quaternion();
const _CHV = new THREE.Vector3();
// F4 Dok: ping-FX kliku wiersza — ARKUSZ HUD paczka B (D-HUD-16): kolor w roli `primary` (dawniej 0x66ddff, `_spawnFx`).
const TACTICAL_PING_THROTTLE_MS = 180;     // F4 Dok: min. odstęp między pingami (koalescencja szybkich klików)
// ARC CV-2a — zdarzenia, którymi `fxStats` etykietuje długie klatki (subskrypcja tylko na czas pomiaru).
const FX_STATS_EVENTS = ['vessel:engaged', 'combat:roundFx', 'vessel:wrecked', 'battle:resolved', 'vessel:created', 'vessel:removed',
  'vessel:launched', 'vessel:arrived', 'vessel:firstSighting', 'notify:added', 'time:stateChanged', 'system:switched', 'ui:toast', 'game:save'];
// ARKUSZ UI U3-2 (Finding 487) — minimalny promień rdzenia sprite'a statku (px ekranu) dla kliku NA TARCZY ciała.
const VESSEL_CORE_PICK_PX = 6;
// 4f-2 — puls „ducha ETA" statku pod kursorem: mocniejszy/szybszy (podgląd „który to statek").
const GHOST_PULSE_HOVER_MIN    = 0.35;      // dolna granica pulsu (głębszy kontrast)
const GHOST_PULSE_HOVER_MAX    = 1.0;       // górna granica pulsu (pełna jasność)
const GHOST_PULSE_HOVER_FREQ   = 7.5;       // częstotliwość pulsu (rad/s) — szybszy niż bazowy 3.2/6.0

const _GAS_LIGHT_DIR = new THREE.Vector3();
const _SUN_TO_CAM    = new THREE.Vector3(); // scratch — kierunek gwiazda→kamera (S4) // scratch — kierunek do gwiazdy (C1a, bez alokacji per klatkę)

// ── Krok czasu animacji REAL-TIME (C2 / Finding 250) ─────────────────────
// Do C2 animacje real-time (chmury skalistych planet, żywy gazowiec) szły po ZASZYTYM
// 0.016 s na klatkę, czyli zakładały równe 60 fps. Skutek: przy 30 fps chmury i burze
// płynęły O POŁOWĘ za wolno, przy 120 fps dwa razy za szybko — tempo zależało od
// wydajności maszyny, a nie od zegara.
// ⚠ SUFIT JEST OBOWIĄZKOWY, nie ostrożnościowy: requestAnimationFrame zamiera w karcie
// w tle, a sama pętla renderowania ma jeszcze bramkę _contextLost (do CV-8b także
// _renderingEnabled — kino BattleView3D przejmowało canvas na czas starcia). Powrót po minucie
// dostarczyłby dt liczone w SEKUNDACH i jednym skokiem teleportowałby każdą warstwę
// chmur i każdą burzę. 0.1 s = 6 klatek przy 60 fps: spadki wydajności przechodzą,
// skok w czasie nie.
const ANIM_DT_MAX_S   = 0.1;      // [s] sufit kroku animacji real-time
const ANIM_DT_FIRST_S = 1 / 60;   // [s] pierwsza klatka — nie ma jeszcze poprzedniego stempla

// ⚠ Obrót gwiazdy (V-260) mieszka teraz w SunShader.LIVE_SUN.OMEGA_RAD_PER_S — obiecana
//   w commicie 033e794 migracja stałej do pokrętła gate'u. Konsument: _tickClouds.
//   Pokrętło jest w rad/s, nie w °/s jak LIVE_GAS.OMEGA_DEG (D-S1-a): stroi się je
//   odczytem rotation.y, więc jednostka pokrętła i sondy musi się zgadzać.
// ⚠ Obrót zostaje POZA flagą liveSunShader (D-V2z): OFF nie przywraca defektu klasy V-250.

// Zmierzony krok animacji w sekundach. Wydzielone z _tickClouds, żeby dawało się
// sprawdzić WYKONANIEM bez konstruowania całego renderera.
export function animDeltaSeconds(nowMs, lastMs) {
  if (!Number.isFinite(lastMs)) return ANIM_DT_FIRST_S;
  const dt = (nowMs - lastMs) / 1000;
  if (!(dt > 0)) return 0;                    // zegar cofnięty albo ta sama klatka
  return Math.min(dt, ANIM_DT_MAX_S);
}

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
  waypoint: 0x5588ff,  // cyan-blue (różny od stożka przechwycenia)
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

// ── ARC CV-5 (pozycja 0 — Finding 704) — bloom w pikselach CSS ─────────────────────────────────────────────────────────
// `UnrealBloomPass` liczy mipy od rozmiaru, który poda mu composer (bufor rysowania = CSS × gęstość renderera), a jądra rozmycia
// są w tekselach mipów — przy gęstszym buforze (dawne nadpróbkowanie High) poświata była węższa i słabsza w pikselach CSS. Podklasa
// pyta funkcję rozmiaru (`sizeFn`, renderer → `bloomInputSize`): przy presetach — CSS × gęstość odniesienia (Medium), ta sama przy
// każdym presecie; bez presetów — rozmiar bufora jak dziś (co do bitu). Kompozyt i tak próbkuje mip dwuliniowo do pełnego bufora.
class CvBloomPass extends UnrealBloomPass {
  setSize(width, height) {
    const s = typeof this.sizeFn === 'function' ? this.sizeFn(width, height) : null;
    super.setSize(s ? s.w : width, s ? s.h : height);
  }
}

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
    // Pipeline HDR: scena w linear HDR, ACES filmic tone mapping + sRGB na wyjściu.
    // W torze composera tone mapping aplikuje OutputPass (render do RT jest surowy);
    // w fallbacku direct-render aplikuje go renderer sam — spójny wynik w obu torach.
    this.renderer.toneMapping    = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;   // strojenie globalnej ekspozycji: 1.0–1.3
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1); // prawdziwa czerń kosmosu
    // Anizotropia — policzona RAZ (getMaxAnisotropy i tak cache'uje w capabilities)
    // i zarejestrowana w module tekstur, który obsługuje planety/gwiazdy. Tekstury
    // tworzone lokalnie (pierścienie) czytają this._maxAniso.
    this._maxAniso = resolveMaxAnisotropy(this.renderer);
    setMaxAnisotropy(this._maxAniso);

    // C1b — JEDEN token strojenia ruchu gazowców dla live gate'u:
    //   KOSMOS.threeRenderer.gasTuning.OMEGA_DEG = 12
    // _tickGasMaterials czyta to co klatkę, więc działa natychmiast i globalnie.
    this.gasTuning = GasGiantShader.LIVE_GAS;

    // S1 — ten sam kontrakt dla gwiazdy: KOSMOS.threeRenderer.sunTuning.OMEGA_RAD_PER_S = 0.06
    // ⚠ To ALIAS, nie kopia. _tickSunMaterials czyta SunShader.LIVE_SUN wprost, więc pokrętło
    //   działa TYLKO dopóki oba wskazują ten sam obiekt. Żadnego spreadu, żadnego clone'a —
    //   inaczej konsola zmienia pole, którego nikt nie czyta (w gasTuning tak właśnie
    //   zachowują się cztery pola wpisywane raz przy budowie materiału).
    this.sunTuning  = SunShader.LIVE_SUN;
    this._sunDiscPx = 0;    // średnica tarczy [CSS px] — liczona w _tickSunMaterials
    this._sunDetail = 0;    // poziom drabiny oktaw (0/1/2)
    this._sunGranU     = null;  // uniformy ŻYWEGO rdzenia (null przy fladze OFF)
    this._sunBoilPhase = 0;     // [rad] AKUMULOWANA faza kipienia (D-V2u)
    this._sunBoilMult  = 1;     // mnożnik tempa z klasy gwiazdy
    this._sunFreqMult  = 1;     // mnożnik skali komórek z klasy gwiazdy

    // V3 / A0 — ten sam kontrakt dla powłoki atmosfery:
    //   KOSMOS.threeRenderer.atmoTuning.STRENGTH = 0.1
    // ⚠ ALIAS, nie kopia i nie spread — _tickAtmoMaterials czyta AtmosphereShader.LIVE_ATMO
    //   przez ten sam obiekt. Kopia sprawiłaby, że konsola zmienia pole, którego nikt nie
    //   czyta (tak zachowują się cztery pola gasTuning wpisywane raz przy budowie materiału).
    this.atmoTuning = AtmosphereShader.LIVE_ATMO;

    // V4 / D1 (V-278) — ten sam kontrakt dla warstwy chmur:
    //   KOSMOS.threeRenderer.cloudTuning.ALPHA = 0.4
    // ⚠ ALIAS, nie kopia i nie spread — _tickClouds czyta LIVE_CLOUDS przez ten sam
    //   obiekt (lekcja sunTuning: kopia sprawia, że konsola zmienia pole, którego
    //   nikt nie czyta).
    this.cloudTuning = LIVE_CLOUDS;
    // NIEBO — ten sam kontrakt dla nieba z katalogu: KOSMOS.threeRenderer.skyTuning.SLOPE = 0.35
    // ⚠ ALIAS LIVE_SKY (nie kopia): _tickSky porównuje go co klatkę z migawką i przelicza niebo przy zmianie
    //   (FILLER_COUNT przebudowuje katalog). Kopia oznaczałaby pokrętło, którego nikt nie czyta.
    this.skyTuning = LIVE_SKY;
    // ARC CV-2a — ten sam kontrakt dla silnika FX walki: KOSMOS.threeRenderer.cvTuning.BEAM_CORE = 4
    // ⚠ ALIAS LIVE_CV_FX (nie kopia): `FxEngine.update` przepisuje go co klatkę do uniformów — kopia byłaby pokrętłem bez czytelnika.
    this.cvTuning = LIVE_CV_FX;
    // ARC CV-1a (flaga `cvModels`) — hardpointy modeli (pamięć na slot; brak pliku ⇒ wartości zapasowe, nigdy oczekiwanie),
    // pula punktów świetlnych (leniwie, przy pierwszym statku ze światłami), przełączniki deweloperskie (konsola).
    this._shipHardpoints = new ShipHardpointsCache({
      fetchJson: (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)),
    });
    this._shipLightPool = null;
    this._cvIncoming = false;        // KOSMOS.debug.cvIncoming(1) — modele z `incoming/` dla slotów z indeksu (podgląd przed CV-1b)
    this._cvIncomingSlots = null;    // Set slotów z `hardpoints/incoming/index.json`
    this._cvLightTest = false;       // KOSMOS.debug.cvLightTest(1) — testowy wzór punktów świetlnych (do CV-1c nikt ich nie kliknął)
    this._sunCoronaU     = null;  // uniformy ŻYWEJ korony (null przy fladze OFF)
    this._sunStreamerPhase = 0;   // [rad] AKUMULOWANA faza dryfu smug (D-V2u)
    this._sunBreathPhase   = 0;   // [rad] AKUMULOWANA faza oddechu korony
    this._sunPromSlots = [];      // 4 sloty protuberancji (kotwice ŚWIATOWE, D-V2x)
    this._sunPromTime  = 0;       // [s] AKUMULOWANY czas cyklu życia
    this._sunCoreRadius = 1;      // promień widocznej tarczy [WU] — do maski sylwetki
    this._sunQuadHalf   = 1;      // połowa boku quada korony [WU]

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
      this.renderer.setClearColor(0x000000, 1);
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
      // ⚠ needsUpdate wskrzesza tylko tekstury z danymi po stronie CPU — setTexture2D
      // pomija upload dla isRenderTargetTexture, więc cele bake'u gazowców przepadły
      // razem z kontekstem i three ich nie odtworzy. Trzeba upiec je od nowa; dawna
      // ścieżka CanvasTexture wracała sama z canvasu.
      // Odroczone, jedna planeta na klatkę (wzór _rebakePlanetTextures), bo:
      //  (a) bake woła renderer.render(), które MILCZĄCO wychodzi przy _isContextLost —
      //      dziś ratuje nas tylko to, że three rejestruje swój listener w konstruktorze
      //      renderera, czyli WCZEŚNIEJ niż ten; odroczenie zdejmuje tę zależność,
      //  (b) trzy przebiegi na gazowca to setki ms — najgorszy moment na zamrożenie
      //      wątku to chwila zaraz po resecie GPU.
      // Własny try na KAŻDĄ planetę: jeden rzut nie może zostawić reszty gazowców z
      // teksturami wyrzuconymi z cache (addPlanetMesh ma early-return, a
      // _rebakePlanetTextures filtruje gas — nikt by ich już nie odzyskał).
      try { GasGiantShader.disposeGasTexturesFor(this.renderer); }
      catch (e) { console.error('[ThreeRenderer] gas cache drop failed:', e); }
      (async () => {
        const gasIds = [];
        this._planets.forEach(({ planet }, id) => {
          if (planet?.planetType === 'gas') gasIds.push(id);
        });
        for (const id of gasIds) {
          await new Promise(r => setTimeout(r, 0));
          if (this._contextLost) return;    // kolejna utrata — posprząta następny restore
          const entry = this._planets.get(id);
          if (!entry) continue;
          try { this._updatePlanetMesh(entry.planet); }
          catch (e) { console.error('[ThreeRenderer] gas re-bake failed:', id, e); }
        }
      })();
    });

    // ── Scena ─────────────────────────────────────────────────
    this.scene = new THREE.Scene();

    // ── Kamera perspektywiczna ─────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(55, W / H, 0.001, 5000);
    this.camera.position.set(0, 35, 50);
    this.camera.lookAt(0, 0, 0);

    // ── Post-processing: pełnoekranowy bloom HDR (próg 1.0) ────────────────
    // JEDEN composer: RenderPass → UnrealBloomPass(threshold=1.0) → OutputPass
    // (ACES + linear→sRGB). Render do RT jest surowy (bez tone mappingu) — próg
    // bloomu działa na wartościach HDR sceny; dopiero OutputPass mapuje na ekran.
    // Bloomują wyłącznie piksele >1.0 (gwiazda, korona, FX HDR) → tło/planety
    // zostają nietknięte, czerń jest czernią. Scena renderuje się RAZ na klatkę
    // (dawny selective bloom robił 2 pełne przebiegi).
    // Antyaliasing: supersampling (setPixelRatio ×1.5 wyżej) — NIE MSAA na RT
    // (samples+HalfFloat = czarny prostokąt na części sterowników).
    this._composer  = null;
    this._bloomPass = null;
    try {
      const pr = this._pixelRatio;
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(pr);
      composer.setSize(W, H);
      composer.addPass(new RenderPass(this.scene, this.camera));
      // strength 0.5 / radius 0.0 / threshold 1.0. Kształt halo ustawiają JAWNE wagi
      // mipów niżej — parametr radius musi zostać 0, bo jego wewnętrzny lerp
      // (mix(f, 1.2-f, radius)) z powrotem podbija najniższe mipy, których
      // bilinear-upsample rysuje subtelny „kwadrat" wokół gwiazdy na czerni.
      const bloom = new CvBloomPass(new THREE.Vector2(W, H), 0.5, 0.0, 1.0);
      bloom.sizeFn = (w, h) => this._bloomInputSize(w, h);   // ARC CV-5 (704) — rozmiar mipów z funkcji (px CSS przy presetach)
      // Wagi mipów composite'u (domyślne [1,.8,.6,.4,.2]): tłumimy 2 najniższe —
      // szeroki miękki zanik zapewnia korona gwiazdy, bloom robi ciasny glare.
      try { bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.7, 0.4, 0.15, 0.03]; } catch (e) {}
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      this._composer  = composer;
      this._bloomPass = bloom;
    } catch (err) {
      console.warn('[ThreeRenderer] HDR composer init failed — fallback direct render:', err);
      this._composer = null;   // fallback: renderer.render (ACES+sRGB aplikuje renderer, brak bloomu)
    }

    // ── Obsługa zmiany rozmiaru okna ──────────────────────────
    window.addEventListener('resize', () => {
      const nW = window.innerWidth, nH = window.innerHeight;
      this.renderer.setSize(nW, nH);
      this._composer?.setSize(nW, nH);  // resizuje też UnrealBloomPass
      this.camera.aspect = nW / nH;
      this.camera.updateProjectionMatrix();
      this._applyFocusViewOffset();   // re-aplikuj przesunięcie podglądu obserwatorium (nowe wymiary)
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
    this._vessels      = new Map();   // vesselId → { sprite, … }
    this._stations     = new Map();   // stationId → { mesh } (S3.3b-S2, anchored orbital object)
    this._predictionConeMeshes = new Map();  // vesselId → { fillMesh, lineMesh, group } (M2b C4)
    this._poiSprites           = new Map();  // poiId → { sprite, type } (M2b C7)
    this._poiTextureCache      = new Map();  // type → CanvasTexture (5 entries, M2b C7)
    this._tradeLines   = [];          // THREE.Line[] — linie handlu cywilnego

    // ── Fleet Command Console (Slice 0) — wspólny silnik FX + selekcja ──────
    // _activeEffects: efemeryczne efekty {mesh,startTime,lifetime,kind,...}
    //   drenowane co klatkę w _startLoop (real-time, niezależne od pauzy gry).
    // _fxGroup: leniwie tworzony Group (scena może jeszcze nie istnieć w ctor).
    this._activeEffects        = [];
    this._fxGroup              = null;
    // ARC CV-2a — zegar prezentacji (płynie krokiem klatki tylko, gdy gra biegnie; bez nadrabiania po pauzie — D-CV-10)
    // i silnik FX walki z pulami (leniwie, przy pierwszej salwie pod flagą `cvFxEngine`); pomiar `KOSMOS.debug.fxStats()`.
    this._presClock            = new PresentationClock();
    this._fxEngine             = null;
    // ARC CV-7 (D-CV-23 / D-CV-24) — kamera reżysera: harmonogram ujęć, spowolnienie bohatera (mnożnik tempa
    // OBU zegarów prezentacji — `_presRate`, 1 = bez zmian), wstrząs, przewodnik 9:16, tryb nagrywania. Chip domyślnie wyłączony.
    this._presRate             = 1;
    this._cvDir                = new CvDirector(this);
    // ARC CV-8a (D-CV-25 / D-CV-26 / D-CV-27) — powtórka bitwy orbitalnej (starcia wirtualne dla sceny, rejestru,
    // paska walki i reżysera; wraki wstrzymane do zniszczenia w powtórce). Bez powtórek w toku — każde zapytanie zwraca „brak”.
    this._cvOrb                = new CvOrbital(this);
    this.cvOrbital             = this._cvOrb;
    // ARC CV-4a (flaga `cvWeapons`) — rejestr salw (leniwie, przy pierwszej rundzie pod flagą): harmonogram strzałów w czasie
    // prezentacji, HP / osłona pokazywane, zniszczenie w chwili trafienia zabijającego; licznik kolejki wieżyczek na statek.
    this._cvLedger             = null;
    this._cvWpnTurretTurn      = new Map();
    this._cvWpnStats           = { rounds: 0, shots: 0, hidden: 0, killsShown: 0, wreckDeduped: 0, wreckDeferred: 0, wreckUnknown: 0 };
    // ARC CV-5 (flaga `cvDamage`) — stan wybuchów, stanów uszkodzeń i wraków (leniwie, `_cvDmgState`): zegar efektów uszkodzeń
    // (zegar prezentacji × `cvTuning.FX_TIME_SCALE`), sekwencje śmierci okrętów, liczniki. Flaga OFF — null, nic się nie dzieje.
    this._cvDmg                = null;
    // ARC CV-5 — statki zniszczone narzędziem `KOSMOS.debug.cvExplode` (tylko prezentacja — logika ich nie zna): przebudowa
    // sprite'ów (zmiana presetu, układu) odtwarza je jako wrak, wystygły od razu — jak zniszczenie pokazane z rejestru salw.
    this._cvDebugKilled        = new Set();
    // ARC CV-5 — chwila wybuchu każdego okrętu (zegar efektów uszkodzeń) w tej sesji: wrak odbudowany (zmiana presetu, układu)
    // jest WYSTYGŁY, ale dryf i obrót biegną dalej z tej samej osi czasu — bez skoku położenia i orientacji.
    this._cvWreckEpoch         = new Map();
    this._fxStatsRun           = null;
    this._fxStatsLast          = null;
    this._selectedVesselId     = null;       // mirror UIManager (ui:selectionChanged)
    this._factionColorCache    = new Map();  // ownerEmpireId → 0xRRGGBB
    this._bodyVeil             = null;       // { bodyId, mesh, geom, mat } — szara zasłona niezbadanego ciała (podgląd obserwatorium)
    this._focusViewOffset      = null;       // { fracX, fracY } — przesunięcie widoku 3D w podglądzie obserwatorium
    this._observatoryPreviewActive = false;  // czy overlay obserwatorium jest otwarty (podgląd ciała)
    this._focusEncounterId     = null;       // Slice 1 — kamera śledzi midpoint bitwy
    // POLISH P2a (CP13) — „Obserwuj / Watch”: kamera śledzi środek walki, dystans z dopasowania do rozpiętości
    // uczestników. null | { encounterId, fitDist, minDistBefore, minDistSet, goal, dist } — `_updateWatchCamera`.
    this._watch                = null;
    // POLISH P2b (D1, Finding 467) — auto-fokus starcia śledzi środek walki: null | { encounterId, goal } —
    // `_updateAutoFocusCamera`; cel — oś kadru sceny bitwy (`_stageWatchFit`).
    this._autoFocus            = null;
    this._frameNo              = 0;          // licznik klatek pętli renderu
    this._glideLastMs          = null;       // POLISH P2b (D3, Finding 461) — czas realny ostatniej klatki płynnego zbliżenia
    // ARC CV-3a1 — SCENA BITWY (flaga `cvStage`): znaczniki sprite'ów sceny (vesselId → { base, drawn, w, k, cluster }),
    // stan klastrów starć (clusterId → { key, sol, offsets }), zegar prezentacji wejścia / wyjścia ze sceny, statystyka
    // klatki (fxStats, stageInfo), klaster każdego starcia z tej klatki, przesunięcie ekranowe kadru walki (Finding 643).
    this._stageMarks           = new Map();
    this._stageState           = new Map();
    this._stageClock           = new PresentationClock();
    this._stageFrame           = null;
    this._stageClusterOf       = new Map();
    this._stageParticipants    = new Set();  // CV-3a3 (Finding 666 (b)) — uczestnicy klastrów starć w widoku z tej klatki
    this._stageEdges           = null;
    this._stageFitCache        = new Map();
    this._stageFitFrame        = -1;
    this._combatViewOffset     = null;
    // POLISH P2a (CP17) — statki aktywnych starć z udziałem gracza (zmiana zbioru → ponowne nałożenie widoczności wywiadu).
    this._combatRevealed       = new Set();
    this._enemyAlertMarkers    = new Map();  // vesselId → Sprite (pulsujący czerwony marker wroga ≥rumor)
    this._tacticalGlyphs       = new Map();  // F2 tryb Y: vesselId → Sprite-glif (stały rozmiar ekranowy)
    this._tacticalHiddenModels = new Map();  // F2: vesselId → [dzieci wrappera ukryte na czas trybu]
    this._tacticalGhosts       = new Map();  // F2: vesselId → Sprite-duch ETA w punkcie celu misji
    this._cleanView            = false;      // SHIFT-hold „czysty widok": ukryj linie/pierścienie/glify (tylko ciała + modele statków)
    this._tacticalHoverVid     = null;       // F4 Dok: vesselId pod kursorem w doku (hover-podgląd: trasa HUD + puls ducha)
    this._tacticalHoverYear    = null;       // F4 Dok OŚ: rok pod kursorem na osi → marker pozycji planety celu w tym roku
    this._lastTacticalPingMs   = 0;          // F4 Dok: throttle ping-FX przy kliku wiersza
    this._tacticalOrbitStyled  = null;       // 2g: [{m, opacity, transparent}] — restore restyle orbit
    this._tacticalGrid         = null;       // 2g: Group — subtelna siatka taktyczna
    this._tacticalOrbitMarkers = new Map();  // 2g: klucz → Sprite (chevron/tik przyszłej pozycji/ETA)
    this._alertReticleTex      = null;       // współdzielona tekstura reticle (lazy)

    // ── Cinematic intro (start nowej gry) ───────────────────────
    // Driver kamery per-frame (rejestrowany przez GameScene) wołany w pętli
    // renderowania TUŻ PRZED cameraController.update(). Sygnał gotowości tekstur
    // (_texturesReady) — intro czeka na to przed lotem, by planeta nie „doskoczyła".
    this._cinematicDriver       = null;      // fn(nowMs) | null
    this._texturesReadyResolved = false;
    this._texturesReady         = new Promise((res) => { this._resolveTexturesReady = res; });

    // ── Cache modeli 3D statków ─────────────────────────────────
    this._shipModelTemplates = new Map(); // modelPath → THREE.Group (oryginał)
    this._shipModelPromises  = new Map(); // modelPath → Promise — deduplikacja równoległych load
    this._missingModelPaths  = new Set(); // modelPath → brak pliku (route prosto do DEFAULT)
    this._shipTexVariant     = new WeakMap(); // ARC CV-2b — szablon modelu → '1k' (wariant `<slot>@1k.glb`); brak wpisu = 2K
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
    this._hudOrbitKey     = null;   // ARKUSZ HUD H0 — klucz przebudowy orbit (`_syncHudOrbits`; null — przed pierwszą klatką)
    this._hudOrbitLayerOff = false; // paczka B — chip [O] wyłączony w ostatniej klatce (`_syncHudOrbits`)
    this._hudHoverOrbitId = null;   // ARKUSZ HUD H0 — ciało pod kursorem (styl orbit)

    // Współdzielona tekstura kropki życia — tworzona raz
    this._lifeDotTex    = ThreeRenderer._createLifeDotTexture();
    this._playerDotTex  = ThreeRenderer._createPlayerDotTexture();

    // ── Małe ciała i dysk ─────────────────────────────────────
    this._diskPoints      = null;
    this._smallBodyPoints = null;

    // ── Licznik do periodycznego odświeżania orbit ───────────
    this._orbitRebuildCounter = 0;
    // S3.4 FAZA 5 — stare romby _colonyLabels USUNIĘTE (zastąpione MapLabelLayer, overlay 2D; od ARKUSZA HUD B-Z —
    // warstwa etykiet HUD).
    // Selekcja ciała działa przez raycast planety/księżyca (_entityByUUID), nie przez romb.

    // ── Gwiazda ───────────────────────────────────────────────
    this._star      = null;
    this._starGroup = null;
    this._starLight = null;
    this._ambient   = null;           // AmbientLight — barwa przestrajana klasą gwiazdy
    this._starCore   = null;          // mesh rdzenia — NAZWANY uchwyt (V-266)
    this._starCorona = null;          // billboard korony HDR (sync quaternion w pętli)
    this._starTwinkleUniform = null;  // referencja do uTime migotania gwiazd tła
    // NIEBO (D-GX-4/6) — kopuła nieba za kamerą { group, points, nebula } (null, zanim `_buildBackground` ją zbuduje),
    // katalog galaktyki (null, zanim galaktyka istnieje — niebo PUSTE), układ, z którego patrzymy.
    this._sky         = null;
    this._skyCatalog  = null;
    this._skyGalaxy   = null;
    this._skyBuf      = null;
    this._skySystemId = 'sys_home';
    this._skyKnobSnap = null;
    this._skyStats    = null;
    this._skyLabelsForced = false;   // NIEBO — przyrząd bramki: etykiety nieba bez CTRL (KOSMOS.debug.skyMarks(1)); rysuje HudSkyLabelLayer
    // ARC GALAXY G1 (GALAXY_PLAN.md §4 G1) — tryb galaktyki: płyta (leniwie, przy pierwszym wejściu), stan trybu (ustawia
    // `GalaxyModeController` przez `setGalaxyMode`), początek rozjaśnienia płyty (twarde cięcie 0,25 s), pokrętła wyglądu
    // płyty z konsoli — KOSMOS.threeRenderer.galaxyTuning.SIZE_GAIN = 6 (ALIAS `LIVE_GALAXY`, nie kopia).
    this._galaxyK       = GALAXY_K;   // [j. / ly] — skala płyty dla `getHudView().worldPerLY` (S1)
    this._galaxyPlate   = null;
    this._galaxyActive  = false;
    this._galaxyFadeT0  = 0;
    this._galaxyHoverId = null;
    this.galaxyTuning   = LIVE_GALAXY;
    // ARC GALAXY G2 — lot (stan klatki od sterownika `GalaxyModeController`: gaśnięcie obiektów układu,
    // płyty, prawdziwych gwiazd nieba, krycie chromu), terytorium płyty (leniwie), przeliczenie ładunku (zdarzenie
    // `territory:changed` albo co `GALAXY_LOOK_MS` — mgła wywiadu zmienia tryb terytorium bez zdarzenia pola).
    this._galaxyFlight       = null;   // { kind, systemFade, plateFade, realFade, chromeAlpha }
    this._galaxyChromeAlpha  = null;   // krycie podwarstw HUD trybu galaktyki w trakcie lotu (`null` — poza lotem)
    this._galaxyTerritory    = null;
    this._galaxyTerrDirty    = true;
    this._galaxyLookNext     = 0;
    this._galaxyLookStats    = { payloadMs: 0, applyMs: 0, rebuilds: 0, gridLy: null };
    EventBus.on('territory:changed', () => { this._galaxyTerrDirty = true; });
    // G2-2 — skan układu ukończony: jasność gwiazdy płyty wg mgły (miejsce poznane) od razu, bez ponownego wejścia w tryb.
    this._galaxyPlateCtx     = null;
    EventBus.on('observatory:systemScanned', () => this._refreshGalaxyPlateLook());
    // ⚠ V-266 — USUNIĘTE: _starCoronaUniform („referencja do uTime korony") oraz
    //   _starPromCount („liczba protuberancji"). Oba były zapisywane dwa razy
    //   i NIGDY nieczytane; `git log -S` pokazuje, że weszły MARTWE już w c02574f,
    //   czyli były zaślepkami NAZEWNICZYMI, nie pozostałością po działającym kodzie.
    //   Nazwane dokładnie jak dwie rzeczy, które buduje V2 (uTime korony, protuberancje),
    //   zwracały w grepie fałszywy trop „to już istnieje". Uchwyty V2 powstają z zerowego
    //   stanu i z własnymi nazwami — nie wskrzeszać tych.

    // ── Faza D3: Sfera Dysona — wizualne pierścienie wokół gwiazdy ──
    this._dysonStage      = 0;
    this._dysonRingsGroup = null;
    // Wartości BAZOWE lighta (= _buildLights, pipeline HDR). Czyta je
    // _starLightBaseline: kolor już tylko jako fallback „nie ma gwiazdy",
    // intensywność jako mnożnik bazowy przed skalowaniem klasą (^0.22).
    this._starLightOrigColor     = 0xfff1de;
    this._starLightOrigIntensity = 2.8;

    // ── Raycaster ─────────────────────────────────────────────
    this._ray   = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._hoverPlanetId = null;

    // ── Śledzenie kamery (focus na planecie/księżycu/statku) ───────
    // ⚠ ARKUSZ UI U1-2 (D-UI-5): `_focusEntityId` = WYŁĄCZNIE cel kamery (śledzenie ciała, blokada podglądu
    //   obserwatorium); zaznaczenie ciała (złota orbita, wyjątki filtra orbit, znaczniki kolonii, zasłona podglądu) —
    //   `_selectedEntityId`. Dawniej jedno pole niosło oba znaczenia, więc zaznaczenie zawsze ruszało kamerę.
    this._focusEntityId = null;
    this._selectedEntityId = null;
    this._focusVesselId = null;  // śledzenie statku w locie
    this._focusStationId = null; // S3.3b-S4a — focus kamery na stację (camera-only, bez selekcji)
    // ARKUSZ UI U1-3 (D-UI-5): pamięć pingu wroga (decyzja 2d — drugi klik = focus), wynik pickera kliku dla sceny (jeden
    // picker na gest) i fokus statku czekający na sprite (po przełączeniu układu model GLB wstawia się asynchronicznie).
    this._pingedEnemyId      = null;
    this.lastClickPick       = null;
    this._pendingVesselFocus = null;

    // ── Referencja do kontrolera kamery (ustawiana z zewnątrz) ─
    this._cameraController = null;

    // ── Czas (do animacji gwiazdy) ────────────────────────────
    this._clock = new THREE.Clock();

    // ARC CV-2b (flaga `cvPresets`, D-CV-17 / D-CV-18) — preset jakości: zapisany NA MASZYNIE albo wykryty z napisu renderera
    // WebGL; zastosowany PRZED zbudowaniem tła (niebo bierze gęstość pikseli presetu) — gęstość pikseli, bloom, pula świateł
    // zbudowana RAZ (w spoczynku jasność 0), tekstury statków przy stawianiu. Flaga OFF — nic się nie zmienia (dzisiejsza
    // gęstość i bloom, bez puli). Szyna sygnałów walki (`_cueBus`) — leniwie, przy pierwszej salwie pod flagą. Pokrętła
    // dławienia: KOSMOS.threeRenderer.gfxThrottleTuning.
    this.gfxThrottleTuning = LIVE_GFX_THROTTLE;
    this._fxLightPool      = null;
    this._cueBus           = null;
    this._gfxApplied       = null;
    this._gfx              = this._initGfxState();
    this._applyGfx('init');

    this._buildBackground();
    this._buildLights();
    this._setupEventBus();
    // ARC CV-5 (Finding 644) — silnik FX walki budowany i ROZGRZEWANY przy starcie (programy wszystkich pul, bufory atrybutów):
    // pierwsza salwa i pierwszy wybuch nie płacą kompilacji w klatce gry.
    try { this._ensureFxEngine(); } catch (err) { console.warn('[ThreeRenderer] FX engine prewarm failed:', err); }
    this._startLoop();
  }

  // ── ARC CV-2b — presety jakości grafiki walki (flaga `cvPresets`; plan §2.10, D-CV-17 / D-CV-18) ─────────────────────────
  // Poziom startowy: zapisany na tej maszynie (localStorage `kosmos_gfx_quality`, try / catch) albo wykryty z napisu renderera.
  _initGfxState() {
    let rendererString = '';
    try { rendererString = readRendererString(this.renderer.getContext()); } catch { rendererString = ''; }
    const init = initialGfxLevel({ rendererString });
    return { level: init.level, source: init.source, rendererString, throttle: new QualityThrottle(LIVE_GFX_THROTTLE),
      lastFrameT: null, base: null, eff: null };
  }

  // Zastosuj preset (gęstość pikseli, bloom, liczba świateł puli, wariant tekstur statków, wygładzanie). CV-Z — dawne ustawienia
  // bez presetów (gęstość min(dpr × 1,5, 2), bloom w px bufora, bez świateł puli) usunięte z flagą `cvPresets`. Zmienia WYŁĄCZNIE
  // to, co się różni od stanu renderera (gęstość ustawiana tylko przy zmianie — przypisanie rozmiaru kanwy ją czyści); zmiana wariantu
  // tekstur przebudowuje statki aktywnego układu (`cvRebuildVesselSprites`).
  _applyGfx(reason = 'apply') {
    const g = this._gfx;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const prev = this._gfxApplied;
    g.base = resolveGfxSettings(g.level, { dpr });
    g.eff = resolveGfxSettings(g.level, { dpr, throttle: g.throttle.level });
    const { pixelRatio: pr, bloom, lights, textures } = g.eff;
    const aa = g.eff.aa ?? 'none';
    if (!this._fxLightPool && this.scene) {
      this._fxLightPool = new CombatLightPool({ THREE, parent: this.scene, capacity: LIGHT_POOL_MAX, tuning: this.cvTuning });
    }
    // ARC CV-5 (pozycja 0 — Finding 704) — bloom w px CSS (przed zmianą gęstości: composer przelicza rozmiary passów)
    const bloomModeChanged = this._bloomCssPx !== true;
    this._bloomCssPx = true;
    if (pr !== this._pixelRatio) this._setRendererPixelRatio(pr);
    else if (bloomModeChanged) this._syncBloomSize?.();
    if (this._bloomPass && this._bloomPass.enabled !== bloom) this._bloomPass.enabled = bloom;
    this._syncSmaa?.(aa === 'smaa');   // ARC CV-5 (decyzja 41) — SMAA wyłącznie na High (pass tworzony przy pierwszym użyciu)
    this._fxLightPool?.setCount(lights);
    this._gfxApplied = { on: true, level: g.level, pixelRatio: pr, bloom, lights, textures, aa, reason };
    if (prev && prev.textures !== textures) this.cvRebuildVesselSprites();
    if (prev) window.KOSMOS?.hudLayer?.wake?.();   // kanwa HUD bierze gęstość renderera (`hudPixelRatio`)
    return this._gfxApplied;
  }

  // Gęstość pikseli: renderer, composer (bufory bloomu), punkty w pikselach urządzenia (niebo, płyta galaktyki).
  _setRendererPixelRatio(pr) {
    this._pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this._composer?.setPixelRatio?.(pr);
    const sky = this._sky?.points?.material?.uniforms?.uPx;
    if (sky) sky.value = pr;
    const plate = this._galaxyPlate?.material?.uniforms?.uPx;
    if (plate) plate.value = pr;
  }

  // ARC CV-5 (pozycja 0 — Finding 704) — rozmiar wejścia mipów bloomu dla `CvBloomPass.setSize(w, h)` (w, h = bufor rysowania:
  // CSS × gęstość composera). Presety włączone — CSS × gęstość odniesienia (Medium), niezależnie od gęstości presetu; wyłączone —
  // rozmiar bufora (dzisiejszy, co do bitu). Wołane także w konstruktorze, zanim composer trafi do `this._composer`.
  _bloomInputSize(w, h) {
    const pr = this._composer?._pixelRatio ?? this._pixelRatio ?? 1;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    return bloomInputSize({ cssW: w / pr, cssH: h / pr, dpr, pixelRatio: pr, cssPx: !!this._bloomCssPx });
  }

  // ARC CV-5 (704) — przelicz rozmiar mipów bloomu bez zmiany gęstości (pierwsze zastosowanie presetu).
  _syncBloomSize() {
    const b = this._bloomPass, c = this._composer;
    if (!b || !c) return;
    const pr = c._pixelRatio ?? this._pixelRatio ?? 1;
    b.setSize((c._width ?? window.innerWidth) * pr, (c._height ?? window.innerHeight) * pr);
  }

  // ARC CV-5 (decyzja 41) — SMAA po OutputPass (na obrazie po tone mappingu i sRGB — wykrywanie krawędzi w przestrzeni, w której
  // je widać; przed OutputPass rdzenie HDR i ciemne kadłuby dawałyby złe progi). Pass tworzony przy PIERWSZYM włączeniu (dwa bufory
  // pełnej rozdzielczości — nie na Medium / Low) i dokładany na koniec composera; wyłączony — OutputPass znów rysuje na ekran
  // (composer: ostatni WŁĄCZONY pass). Błąd tworzenia — bez SMAA, gra działa dalej.
  _syncSmaa(on) {
    const c = this._composer;
    if (!c) return;
    if (on && !this._smaaPass && !this._smaaFailed) {
      try {
        const p = new SMAAPass(1, 1);
        c.addPass(p);   // `addPass` ustawia rozmiar passa z composera (CSS × gęstość)
        this._smaaPass = p;
      } catch (err) {
        this._smaaFailed = true;
        console.warn('[ThreeRenderer] SMAA init failed — High bez wygładzania:', err);
      }
    }
    if (this._smaaPass) this._smaaPass.enabled = !!on;
  }

  /** Poziom presetu (☰ „Grafika”). */
  get gfxLevel() { return this._gfx.level; }

  /**
   * ARC CV-2b — ustaw preset (☰ „Grafika”, `KOSMOS.debug.gfx(0|1|2)`): zapis na maszynie (try / catch), zastosowanie od razu.
   * @param {string|number} level — 'low' | 'medium' | 'high' albo 0 / 1 / 2
   */
  applyGfxPreset(level, { persist = true } = {}) {
    const lv = normalizeGfxLevel(level);
    if (!lv) return { ok: false, reason: 'bad_level', level };
    this._gfx.level = lv;
    this._gfx.source = 'set';
    this._gfx.throttle.reset();
    const saved = persist ? writeStoredGfxLevel(lv) : false;
    this._applyGfx('preset');
    return { ok: true, saved, ...this.cvGfxInfo() };
  }

  /** ☰ „Grafika”: High → Medium → Low → High. */
  cycleGfxPreset() { return this.applyGfxPreset(nextGfxLevelInCycle(this._gfx.level)); }

  // Raz na klatkę (po `_tickCvFx`): dławienie automatyczne (czas klatki w walce) i obwiednia świateł puli na zegarze prezentacji.
  _tickGfx() {
    const g = this._gfx;
    const now = performance.now();
    const dt = g.lastFrameT == null ? 0 : now - g.lastFrameT;
    g.lastFrameT = now;
    const inCombat = (this._stageFrame?.clusters ?? 0) > 0 || !!this._fxEngine?.hasActive();
    if (g.throttle.step(dt, { inCombat, base: g.base })) {
      // Dławienie zmienia WYŁĄCZNIE budżety efektów drugorzędnych (dla CV-4b / CV-5) — gęstość, bloom, światła i tekstury zostają.
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      g.eff = resolveGfxSettings(g.level, { dpr, throttle: g.throttle.level });
    }
    this._fxLightPool?.update(this._lightClockMs?.() ?? this._presClock.nowMs, { visible: !this._galaxyActive && !this._galaxyFlight });
  }

  // ARC CV-5 — zegar świateł puli: zegar efektów uszkodzeń (wybuchy — także w zwolnionym tempie `FX_TIME_SCALE`), bez stanu CV-5 —
  // zegar prezentacji (jak w CV-2b).
  _lightClockMs() {
    return this._cvDmg ? this._cvDmg.now : this._presClock.nowMs;
  }

  /** ARC CV-2b — `KOSMOS.debug.gfx()`: preset, źródło, napis renderera, zastosowane ustawienia, budżety, dławienie, pula, sygnały. */
  cvGfxInfo() {
    const g = this._gfx, e = g.eff;
    return {
      level: g.level, source: g.source, renderer: g.rendererString,
      pixelRatio: this._pixelRatio, bloom: this._bloomPass ? this._bloomPass.enabled !== false : false,
      // ARC CV-5 (pozycja 0) — wygładzanie (SMAA na High) i szerokości mipów bloomu w pikselach bufora (px CSS × gęstość odniesienia)
      aa: this._smaaPass?.enabled ? 'smaa' : 'none', bloomMips: this._bloomPass?.renderTargetsHorizontal?.map?.((rt) => rt.width) ?? null,
      lights: this._fxLightPool?.count ?? 0, textures: this._gfxApplied?.textures ?? '2k',
      budgets: e ? { particles: e.particles, debris: e.debris, smoke: e.smoke, embers: e.embers, damageSmoke: e.damageSmoke,
        shieldRipples: e.shieldRipples, throttled: [...e.throttled] } : null,
      throttle: g.throttle.stats(), lightPool: this._fxLightPool?.stats() ?? null, cues: this._cueBus?.stats() ?? null,
      shipTextures: this.cvShipTextureMemory(),
    };
  }

  /**
   * ARC CV-2b — pamięć tekstur statków aktywnego układu (unikalne tekstury materiałów, szer. × wys. × 4 B, mipmapy × 4/3) i warianty
   * modeli (1K / 2K). Oszacowanie — dekodowany obraz na GPU, niezależnie od rozmiaru pliku.
   */
  cvShipTextureMemory() {
    const seen = new Set();
    let bytes = 0, maxW = 0;
    const variants = { '1k': 0, '2k': 0 };
    const KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'];
    for (const [, e] of this._vessels) {
      if (e.texVariant) variants[e.texVariant] = (variants[e.texVariant] ?? 0) + 1;
      e.sprite?.traverse?.((o) => {
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) for (const k of KEYS) {
          const tx = m[k];
          if (!tx || seen.has(tx)) continue;
          seen.add(tx);
          const w = tx.image?.width ?? 0, h = tx.image?.height ?? 0;
          if (w > maxW) maxW = w;
          bytes += w * h * 4 * (tx.generateMipmaps !== false ? 4 / 3 : 1);
        }
      });
    }
    return { textures: seen.size, mb: Number((bytes / (1024 * 1024)).toFixed(1)), maxSize: maxW, variants,
      gpuTextures: this.renderer?.info?.memory?.textures ?? null };
  }

  /**
   * ARC CV-2b — `KOSMOS.debug.cvLightFlash()`: błysk światła puli w środku oglądanej bitwy (albo w celu kamery) — instrument puli
   * (High i Medium: kadłuby wokół rozjaśniają się na ~0,6 s; Low: odmowa — 0 świateł). Zegar prezentacji: w pauzie błysk stoi.
   */
  cvLightFlash() {
    const pool = this._fxLightPool;
    if (!pool) return { ok: false, reason: 'no_pool' };
    let x = 0, y = 0.3, z = 0, n = 0;
    for (const id of this._stageParticipants ?? []) {
      const e = this._vessels.get(id);
      if (!e?.sprite?.visible) continue;
      x += e.sprite.position.x; y += e.sprite.position.y; z += e.sprite.position.z; n++;
    }
    if (n > 0) { x /= n; y /= n; z /= n; }
    else {
      const tgt = this._cameraController?._target ?? null;
      if (tgt && Number.isFinite(tgt.x)) { x = tgt.x; y = tgt.y; z = tgt.z; }
    }
    const slot = pool.flash(x, y, z, 0xffd8a0, this._lightClockMs?.() ?? this._presClock.nowMs);
    return { ok: slot >= 0, slot, at: [Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))], ships: n, pool: pool.stats() };
  }

  // ── Tło: niebo z katalogu galaktyki (NIEBO, D-GX-4) ───────────────────────────────────────────────────────────
  // Kopuła za kamerą (`_buildSkyDome`): gwiazdy PSF z katalogu galaktyki + mgławica, przeliczane przy switchSystem
  // i przy podłączeniu galaktyki. Dawna powłoka 7 000 punktów z Math.random (ścieżka OFF flagi `skyCatalog`)
  // usunięta w ARC GALAXY G5 — flaga na stałe ON.
  _buildBackground() {
    this._buildSkyDome();
  }

  // ── Mgławica (NIEBO: wyjęta z _buildBackground CO DO ZNAKU — poza `return` zamiast `this.scene.add`) ──────────
  // Część kopuły nieba (grupa za kamerą, `_buildSkyDome`).
  _buildNebula() {
    // ── Mgławica — bardzo subtelna struktura FBM, peak luminancji ~0.014 linear
    // (na ekranie ~10-14/255 po ACES). Struktura i głębia bez rozjaśniania tła;
    // pas „drogi mlecznej" wokół nachylonej płaszczyzny. Statyczna (bez uniformów).
    const nebMat = new THREE.ShaderMaterial({
      // ⚠ D-D3 — KOPUŁA NIEBA, nie uczestnik testu głębi. Mgławica jest rysowana
      //   PIERWSZA (renderOrder -2) na WYCZYSZCZONYM buforze i nigdy do niego nie
      //   pisze, więc jej test głębi jest no-opem w obie strony — a chunki kosztowałyby
      //   zapis gl_FragDepth na PEŁNOEKRANOWYM przebiegu najcięższego shadera sceny.
      //   Wyłączenie testu mówi to wprost i nic nie zmienia wizualnie.
      side: THREE.BackSide, depthWrite: false, depthTest: !logDepthOn(),
      uniforms: { uPeak: { value: 0.014 } },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position);
          gl_Position = projectionMatrix * (modelViewMatrix * vec4(position, 1.0)); }`,
      fragmentShader: `varying vec3 vDir; uniform float uPeak;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          float a=hash(i),           b=hash(i+vec3(1,0,0)), c=hash(i+vec3(0,1,0)), d=hash(i+vec3(1,1,0));
          float e=hash(i+vec3(0,0,1)), g=hash(i+vec3(1,0,1)), h2=hash(i+vec3(0,1,1)), j=hash(i+vec3(1,1,1));
          return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h2,j,f.x), f.y), f.z); }
        float fbm(vec3 p){ float v = 0.0, amp = 0.5;
          for (int k = 0; k < 4; k++) { v += amp * noise(p); p *= 2.13; amp *= 0.5; } return v; }
        void main(){
          vec3 axis = normalize(vec3(0.25, 1.0, 0.18));
          float band = 1.0 - smoothstep(0.0, 0.55, abs(dot(vDir, axis)));
          float n = fbm(vDir * 5.0) * 0.65 + fbm(vDir * 13.0) * 0.35;
          n = max(0.0, n - 0.42) * 1.7;
          float m = band * n;
          vec3 cold = vec3(0.35, 0.55, 0.85);   // zimny gaz
          vec3 warm = vec3(0.85, 0.55, 0.35);   // pył
          vec3 tint = mix(cold, warm, noise(vDir * 3.0));
          gl_FragColor = vec4(tint * m * uPeak, 1.0); }`,
      transparent: false, blending: THREE.AdditiveBlending,
    });
    const nebula = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 32), nebMat);
    nebula.renderOrder = -2;   // rysuj przed resztą (additive na czystym tle)
    return nebula;
  }

  // ── NIEBO (D-GX-4) — kopuła nieba za kamerą ─────────────────────────────────────────────────────────────────
  // Gwiazdy i mgławica w JEDNEJ grupie, której położenie = położenie kamery (pętla renderu): obraz nieba zależy
  // wyłącznie od ORIENTACJI kamery, więc jest ciągły przez każde przejście z konstrukcji (F2) i nie ma paralaksy kamery
  // wobec gwiazd 300–1 000 j. dalej. Gwiazdy jak mgławica (D-D3): lista nieprzezroczysta, renderOrder −1, bez testu
  // i zapisu głębi, addytywnie — planety zawsze je zasłaniają (koniec Finding 591).
  // ⚠ Zanim galaktyka istnieje, niebo jest PUSTE (punkty niewidoczne) — nigdy pole z Math.random (D-GX-6). Katalog
  //   podłącza setSkyGalaxy, wołane z GameScene zaraz po zmintowaniu albo wczytaniu `galaxyData`.
  _buildSkyDome() {
    const group = new THREE.Group();
    group.name = 'skyDome';
    const mat = createSkyStarMaterial(THREE, { pixelRatio: this._pixelRatio, realFade: 1.0 });
    const points = new THREE.Points(new THREE.BufferGeometry(), mat);
    points.renderOrder   = -1;      // po mgławicy (−2), przed resztą sceny (0)
    points.frustumCulled = false;   // kopuła otacza kamerę; sfera ograniczająca pustej geometrii wycinałaby ją
    points.visible       = false;   // do pierwszego przeliczenia z katalogu (setSkyGalaxy)
    group.add(points);
    const nebula = this._buildNebula();
    group.add(nebula);
    this.scene.add(group);
    this._sky = { group, points, nebula };
    this._starTwinkleUniform = mat.uniforms.uTime;   // oddech ±5 % — ten sam licznik w pętli co dawne niebo
    this._starScaleUniform   = null;
  }

  /**
   * NIEBO (D-GX-6) — podłącz galaktykę: katalog z `galaxyData.systems` + ziarna i przeliczenie nieba dla układu,
   * z którego patrzymy. Wołane RAZ z GameScene po zmintowaniu / wczytaniu `galaxyData` — wczytanie nie przechodzi
   * przez switchSystem (StarSystemManager.restore wymusza dom), więc to wywołanie pokrywa ścieżkę wczytania.
   * Bez kopuły — no-op. Brak galaktyki ⇒ niebo puste.
   */
  setSkyGalaxy(galaxyData) {
    if (!this._sky) return null;
    this._skyGalaxy = galaxyData ?? null;
    this._rebuildSkyCatalog();
    return this._recomputeSky('galaxy');
  }

  _rebuildSkyCatalog() {
    const gd = this._skyGalaxy;
    this._skyCatalog  = gd ? buildSkyCatalog(gd.systems, skySeedOf(gd), { fillerCount: LIVE_SKY.FILLER_COUNT }) : null;
    this._skyKnobSnap = skyKnobSnapshot(LIVE_SKY);
  }

  /** NIEBO — przelicz kierunki / kolor / intensywność / rozmiar nieba z katalogu dla `_skySystemId`. */
  _recomputeSky(reason = 'recompute') {
    const sky = this._sky;
    if (!sky) return null;
    const cat = this._skyCatalog, points = sky.points;
    if (!cat) {
      points.visible = false;
      this._skyStats = { reason, count: 0, ms: 0, systemId: this._skySystemId };
      return this._skyStats;
    }
    const t0 = performance.now();
    if (!this._skyBuf || this._skyBuf.capacity < cat.N) {
      const b = allocSkyBuffers(cat.N), geo = new THREE.BufferGeometry();
      geo.setAttribute('position',   new THREE.BufferAttribute(b.pos, 3));
      geo.setAttribute('color',      new THREE.BufferAttribute(b.color, 3));
      geo.setAttribute('aIntensity', new THREE.BufferAttribute(b.intensity, 1));
      geo.setAttribute('aSize',      new THREE.BufferAttribute(b.size, 1));
      geo.setAttribute('aPhase',     new THREE.BufferAttribute(b.phase, 1));
      geo.setAttribute('aReal',      new THREE.BufferAttribute(b.real, 1));
      points.geometry.dispose();
      points.geometry = geo;
      this._skyBuf = b;
    }
    const res = skyFrom(cat, this._skySystemId, this._skyBuf, LIVE_SKY);
    const attrs = points.geometry.attributes;
    for (const name of ['position', 'color', 'aIntensity', 'aSize', 'aPhase', 'aReal']) attrs[name].needsUpdate = true;
    points.geometry.setDrawRange(0, res.count);
    points.visible = res.count > 0;
    this._skyStats = { ...res, reason, ms: performance.now() - t0, systemId: this._skySystemId,
      N: cat.N, filler: cat.fillerCount, real: cat.realCount };
    return this._skyStats;
  }

  /** NIEBO — pokrętła `skyTuning` co klatkę; przeliczenie wyłącznie przy zmianie (FILLER_COUNT — nowy katalog). */
  _tickSky() {
    const ch = skyKnobsChanged(this._skyKnobSnap, LIVE_SKY);
    if (!ch.changed) return;
    if (ch.rebuild) this._rebuildSkyCatalog();
    else this._skyKnobSnap = skyKnobSnapshot(LIVE_SKY);
    this._recomputeSky('tuning');
  }

  // ── NIEBO: przyrząd bramki — KOSMOS.threeRenderer.getSkyInfo() ───────────────────────────────────────────────
  // Stan kopuły, katalogu i OSTATNIEGO przeliczenia (czas w ms, liczba punktów, najjaśniejszy prawdziwy układ,
  // stosunek strumieni najjaśniejszy prawdziwy / najjaśniejsze tło). Kopuła (`dome`) powstaje przy starcie gry.
  getSkyInfo() {
    const cat = this._skyCatalog, st = this._skyStats;
    const ratio = st && st.maxFillerFlux > 0 ? st.maxRealFlux / st.maxFillerFlux : null;
    return {
      dome: !!this._sky, galaxy: !!this._skyGalaxy, systemId: this._skySystemId,
      catalog: cat ? { N: cat.N, real: cat.realCount, filler: cat.fillerCount, seed: cat.seed, streamSeed: cat.streamSeed } : null,
      drawn: st?.count ?? 0, lastReason: st?.reason ?? null, lastMs: st ? +st.ms.toFixed(3) : null,
      brightestReal: st?.brightestRealId ?? null,
      maxRealI: st?.maxRealI != null ? +st.maxRealI.toFixed(3) : null,
      maxFillerI: st?.maxFillerI != null ? +st.maxFillerI.toFixed(3) : null,
      realOverFillerFlux: ratio != null ? +ratio.toFixed(1) : null,
      realsAboveMaxFiller: st?.realsAboveMaxFiller ?? null,
      marks: this._skyLabelsForced === true,
      knobs: { ...LIVE_SKY },
    };
  }

  // ── NIEBO: przyrządy bramki (DEBUG — nie funkcja gry, nie w uiPrefs; los w G5) ───────────────────────────────────
  // KOSMOS.debug.skyLookHome() / skyLookAt(n) / skyMarks(1|0) — bez cudzysłowów (do wklejenia w konsolę). skyLookHome /
  // skyLookAt obracają kamerę z każdego układu, także w czystym widoku SHIFT. skyMarks(1) wymusza etykiety nieba (podwarstwa
  // HUD `HudSkyLabelLayer`) BEZ CTRL — zastępuje wyłącznie CTRL: SHIFT, tryb Y i overlay chowają je dalej (reguła warstwy).

  /** Obróć kamerę (TYLKO θ / φ; dystans i cel bez zmian) ku gwieździe domu widzianej z aktywnego układu. */
  skyLookHome() {
    if (!this._sky || !this._skyCatalog) { console.warn('[sky] niebo z katalogu nieaktywne (brak kopuły albo galaktyki)'); return null; }
    if (this._skySystemId === 'sys_home') {
      console.log('[sky] jesteś w domu — dom nie jest gwiazdą twojego nieba (skyLookAt(1) — najbliższy sąsiad)');
      return null;
    }
    const index = this._skyCatalog.index.get('sys_home');
    return index == null ? null : this._skyLookAtIndex(index, 'Dom');
  }

  /** Obróć kamerę ku `n`-temu najbliższemu prawdziwemu układowi (1 = najbliższy) widzianemu z aktywnego układu. */
  skyLookAt(n = 1) {
    if (!this._sky || !this._skyCatalog) { console.warn('[sky] niebo z katalogu nieaktywne (brak kopuły albo galaktyki)'); return null; }
    const list = nearestRealSystems(this._skyCatalog, this._skySystemId);
    if (!list.length) return null;
    const k = Math.min(list.length, Math.max(1, Math.floor(Number(n) || 1)));
    if (k !== n) console.warn(`[sky] skyLookAt(${n}) → ${k} (zakres 1…${list.length})`);
    return this._skyLookAtIndex(list[k - 1].index, `#${k}`);
  }

  /** Etykiety nieba bez CTRL (przyrząd bramki): 1 — wymuś, 0 — tylko CTRL. Rysuje podwarstwa HUD (`HudSkyLabelLayer`). */
  setSkyMarks(on) {
    this._skyLabelsForced = !!on;
    window.KOSMOS?.hudLayer?.wake?.();
    console.log(`[sky] etykiety nieba bez CTRL: ${this._skyLabelsForced ? 'ON' : 'OFF'}`);
    return this._skyLabelsForced;
  }

  _skyLookAtIndex(index, label) {
    const cc = this._cameraController, cat = this._skyCatalog;
    const dir = skyDirectionTo(cat, this._skySystemId, index);
    if (!cc || !dir) return null;
    const a = lookAnglesFor(dir, SKY_LOOK.OFFSET_RAD);
    cc._goalTheta = null; cc._goalPhi = null;
    cc._theta = a.theta; cc._phi = a.phi;
    const id = cat.ids[index];
    const sys = (window.KOSMOS?.galaxyData?.systems ?? []).find((s) => String(s.id) === String(id));
    let revealed = false;
    try { revealed = systemRevealFromWorld(window.KOSMOS, sys).name === true; } catch { revealed = false; }
    const name = revealed ? (sys?.name ?? id) : '???';
    const b = this._skyBuf;
    let I = null;
    if (b) for (let k = 0; k < b.count; k++) if (b.src[k] === index) { I = b.intensity[k]; break; }
    const Itxt = I == null ? '—' : I.toFixed(2).replace('.', ',');
    console.log(`[sky] ${label}: ${name} [${id}] · ${formatLy(dir.distLy)} · I ${Itxt}`
      + ` · gwiazda ${(a.offsetRad * 180 / Math.PI).toFixed(1).replace('.', ',')}° nad środkiem kadru${a.clamped ? ' (φ przycięte)' : ''}`);
    return { label, id, name, distLy: +dir.distLy.toFixed(2), intensity: I == null ? null : +I.toFixed(3),
      theta: +a.theta.toFixed(4), phi: +a.phi.toFixed(4), clamped: a.clamped };
  }

  // ── ARC GALAXY G1 — tryb galaktyki w tej samej scenie (GALAXY_PLAN.md §4 G1; F1, D-GX-1/2/3, R2, R3) ─────────────
  // Płyta to grupa sceny na warstwie `GALAXY_LAYER`; tryb przełącza WARSTWĘ KAMERY (system — 0, jak przed krokiem;
  // galaktyka — tylko płyta + kopuła nieba), płaszczyznę dalszą (5 000 → 40 000) i gaśnie 71 prawdziwych gwiazd nieba
  // (`uRealFade` 0 — punkty płyty je zastępują; kierunki nieba zostają z ostatniego aktywnego układu, D-GX-6). Obiekty
  // układu zostają w scenie bez zmian (warstwa 0 — niewidoczne dla kamery galaktyki); wybory trybu układu nie biegną
  // (gałąź na górze `handleClick` / `handleMouseMove` — R2: ukryte siatki dalej łapią raycast).

  /** Płyta galaktyki — leniwie przy pierwszym wejściu; kopuła nieba dostaje warstwę płyty (widoczna w obu trybach). */
  _ensureGalaxyPlate() {
    if (this._galaxyPlate) return this._galaxyPlate;
    const plate = new GalaxyPlate(THREE, { pixelRatio: this._pixelRatio, logDepth: logDepthOn() });
    this.scene.add(plate.group);
    this._sky?.points?.layers?.enable?.(GALAXY_LAYER);
    this._sky?.nebula?.layers?.enable?.(GALAXY_LAYER);
    this._galaxyPlate = plate;
    return plate;
  }

  /**
   * Przełączenie sceny (woła `GalaxyModeController`): warstwa kamery, płaszczyzna dalsza, płyta, prawdziwe gwiazdy nieba.
   * Kamery NIE rusza (widok ustawia kontroler kamery — `applyView`).
   * @param {boolean} on
   * @param {{ systems?:Array, activeId?:string, selectedId?:string|null, brightOf?:Function }} [ctx]
   */
  setGalaxyMode(on, ctx = {}) {
    on = !!on;
    const cam = this.camera;
    // ARC GALAXY G2-1 — przejście LOGICZNE w trakcie lotu: warstwy kamery, płaszczyzna dalsza, gaśnięcie płyty i prawdziwych
    // gwiazd nieba należą do sterownika lotu (`setGalaxyFlightFrame` / `endGalaxyFlight`); tu tylko stan trybu (R2 — wybory
    // trybu układu nie biegną) i start rozjaśnienia chromu (`chromeT0`).
    if (ctx.flight === true) {
      if (on) {
        this._galaxyFadeT0 = Number.isFinite(ctx.chromeT0) ? ctx.chromeT0 : performance.now();
        if (this._hoverPlanetId != null) { this._hoverPlanetId = null; EventBus.emit('planet:hover', { entityId: null }); }
        this._hoverVesselId = null;
        this._hideColonyTooltip();
      } else {
        cam.layers.set(0);
        cam.far = CAMERA_FAR.system;
        cam.updateProjectionMatrix();
        this._galaxyPlate?.setVisible(false);
        this._galaxyPlate?.setFade(0);
        if (this._galaxyHoverId != null) {
          const layer = typeof document !== 'undefined' ? document.getElementById('event-layer') : null;
          if (layer) layer.style.cursor = 'default';
        }
        this._galaxyHoverId = null;
      }
      this._galaxyActive = on;
      return;
    }
    if (on) {
      const plate = this._ensureGalaxyPlate();
      this._galaxyPlateCtx = ctx;
      plate.setSystems(ctx.systems ?? [], { brightOf: ctx.brightOf });
      plate.setAnchor(ctx.systems ?? [], ctx.activeId);
      plate.setSelected(ctx.selectedId ?? null);
      plate.setFade(0);
      plate.setVisible(true);
      this._galaxyFadeT0 = performance.now();
      cam.layers.set(GALAXY_LAYER);
      cam.far = CAMERA_FAR.galaxy;
      // Najechanie trybu układu gaśnie (ciało, statek, podpowiedź budynku) — wybory układu nie biegną w trybie galaktyki.
      if (this._hoverPlanetId != null) { this._hoverPlanetId = null; EventBus.emit('planet:hover', { entityId: null }); }
      this._hoverVesselId = null;
      this._hideColonyTooltip();
    } else {
      this._galaxyPlate?.setVisible(false);
      this._galaxyPlate?.setFade(0);
      cam.layers.set(0);
      cam.far = CAMERA_FAR.system;
      if (this._galaxyHoverId != null) {
        const layer = typeof document !== 'undefined' ? document.getElementById('event-layer') : null;
        if (layer) layer.style.cursor = 'default';
      }
      this._galaxyHoverId = null;
    }
    cam.updateProjectionMatrix();
    const u = this._sky?.points?.material?.uniforms?.uRealFade;
    if (u) u.value = on ? 0 : 1;
    this._galaxyActive = on;
  }

  /** G2-2 — ponowna jasność gwiazd płyty (mgła: miejsce poznane po skanie) z kontekstu ostatniego wejścia w tryb. */
  _refreshGalaxyPlateLook() {
    const plate = this._galaxyPlate, ctx = this._galaxyPlateCtx;
    if (!plate || !ctx) return;
    plate.setSystems(ctx.systems ?? [], { brightOf: ctx.brightOf });
  }

  /** Zaznaczona gwiazda płyty (halo) — woła kontroler przy każdej zmianie zaznaczenia. */
  setGalaxySelected(id) { this._galaxyPlate?.setSelected(id ?? null); }

  // Polecenie kamery na obiekt UKŁADU (fokus statku / ciała / stacji, „Obserwuj”, przebudowa sceny) w trybie galaktyki —
  // najpierw wyjście z trybu (kamera systemu z migawki 1:1), potem polecenie jak zawsze. Poza trybem — nic.
  _leaveGalaxyFor(reason) {
    if (this._galaxyActive) window.KOSMOS?.galaxyMode?.exit?.(reason);
  }

  /** Gwiazdy płyty w świecie [j.] (aktywny układ w początku) — warstwa HUD i wybór gwiazdy. */
  getGalaxyStarsWorld() {
    return (this._galaxyActive && this._galaxyPlate) ? this._galaxyPlate.starsWorld() : [];
  }

  /** Gwiazda pod punktem okna (px CSS) — najbliższy środek wśród rzutów (`pickGalaxyStar`, reguła Findingu 109). */
  galaxyStarAt(rawX, rawY) {
    if (!this._galaxyActive || !this._galaxyPlate) return null;
    const view = this.getHudView();
    if (!view) return null;
    const K = window.KOSMOS;
    const s = K?.uiScale > 0 ? K.uiScale : Math.min(view.cssW / 1280, view.cssH / 720);
    const proj = makeHudProjector({ ...view, uiScale: s });
    if (!proj) return null;
    const pts = [];
    for (const st of this._galaxyPlate.starsWorld()) {
      const p = proj.point(st.x, st.y, st.z);
      if (p) pts.push({ id: st.id, x: p.x, y: p.y });
    }
    return pickGalaxyStar(pts, rawX / s, rawY / s, GALAXY_PICK_HALF_PX);
  }

  /** ARC GALAXY G3-B — punkt okna (px CSS) gwiazdy płyty albo `null` (za kamerą): przyrządy bramki (`KOSMOS.debug.galaxyWarpMenuAt`). */
  galaxyStarScreen(systemId) {
    if (!this._galaxyActive || !this._galaxyPlate) return null;
    const view = this.getHudView();
    if (!view) return null;
    const K = window.KOSMOS;
    const s = K?.uiScale > 0 ? K.uiScale : Math.min(view.cssW / 1280, view.cssH / 720);
    const proj = makeHudProjector({ ...view, uiScale: s });
    const st = proj ? this._galaxyPlate.starsWorld().find((q) => String(q.id) === String(systemId)) : null;
    const p = st ? proj.point(st.x, st.y, st.z) : null;
    return p ? { x: p.x * s, y: p.y * s } : null;
  }

  // Klik w trybie galaktyki: gwiazda (zaznaczenie / dwuklik = wejście) albo pustka (odznaczenie) — decyduje kontroler.
  _galaxyClick(sx, sy) {
    const id = this.galaxyStarAt(sx, sy);
    this.lastClickPick = { vesselId: null, object: id != null ? 'galaxyStar' : null };
    window.KOSMOS?.galaxyMode?.onPlateClick?.(id, performance.now());
    return id != null;
  }

  // Najechanie w trybie galaktyki: gwiazda pod kursorem (kursor „rączka”); bez najechania ciał i statków układu.
  _galaxyHover(sx, sy) {
    const id = window.KOSMOS?.uiManager?.isOverUI?.(sx, sy) === true ? null : this.galaxyStarAt(sx, sy);
    if (id !== this._galaxyHoverId) {
      this._galaxyHoverId = id;
      const layer = typeof document !== 'undefined' ? document.getElementById('event-layer') : null;
      if (layer) layer.style.cursor = id != null ? 'pointer' : 'default';
    }
  }

  // Pętla renderu — rozjaśnienie płyty po wejściu (czas realny), pokrętła wyglądu, oddech punktów (zegar nieba).
  _tickGalaxyPlate(t) {
    const plate = this._galaxyPlate;
    if (!plate || !(this._galaxyActive || this._galaxyFlight)) return;
    if (!this._galaxyFlight) {   // G2-1 — w trakcie lotu gaśnięciem płyty steruje sterownik lotu
      const k = Math.min(1, Math.max(0, (performance.now() - this._galaxyFadeT0) / GALAXY_FADE_MS));
      if (plate.fade !== k) plate.setFade(k);
    }
    plate.tick();
    plate.setTime(t);
    this._tickGalaxyLook(t);
  }

  // ── ARC GALAXY G2-1 — lot kamery między układem a płytą (oś czasu — `GalaxyFlightLogic`, sterownik — `GalaxyModeController`) ──
  // Wylot: obie warstwy kamery (układ gaśnie, płyta się rozjaśnia), far galaktyki; wlot: do przełączenia sama płyta, potem
  // układ (`setGalaxyMode(false, { flight: true })`). Obiekty układu gasną w RENDERZE (`_applyFlightFade` przed
  // `composer.render()` i cofnięte zaraz po nim — reszta gry nigdy nie widzi zmienionego krycia ani widoczności).

  /** Początek lotu: płyta przygotowana (wylot — zakotwiczona, zgaszona, widoczna), warstwy i far kamery. */
  beginGalaxyFlight(kind, ctx = {}) {
    const cam = this.camera;
    const plate = this._ensureGalaxyPlate();
    if (kind === 'out') {
      this._galaxyPlateCtx = ctx;
      plate.setSystems(ctx.systems ?? [], { brightOf: ctx.brightOf });
      plate.setAnchor(ctx.systems ?? [], ctx.activeId);
      plate.setSelected(ctx.selectedId ?? null);
      plate.setFade(0);
      plate.setVisible(true);
      cam.layers.set(0);
      cam.layers.enable(GALAXY_LAYER);
      if (this._hoverPlanetId != null) { this._hoverPlanetId = null; EventBus.emit('planet:hover', { entityId: null }); }
      this._hoverVesselId = null;
      this._hideColonyTooltip();
    } else {
      cam.layers.set(GALAXY_LAYER);
    }
    cam.far = CAMERA_FAR.galaxy;
    cam.updateProjectionMatrix();
    this._galaxyFlight = { kind, systemFade: kind === 'out' ? 1 : 0, plateFade: kind === 'out' ? 0 : 1,
      realFade: kind === 'out' ? 1 : 0, chromeAlpha: kind === 'out' ? 0 : 1 };
    this._galaxyChromeAlpha = this._galaxyFlight.chromeAlpha;
    this._galaxyTerrDirty = true;
  }

  /** Klatka lotu (sterownik): gaśnięcie obiektów układu, płyty, prawdziwych gwiazd nieba, krycie chromu galaktyki. */
  setGalaxyFlightFrame({ systemFade = 1, plateFade = 0, realFade = 1, chromeAlpha = null } = {}) {
    const f = this._galaxyFlight;
    if (!f) return;
    f.systemFade = systemFade; f.plateFade = plateFade; f.realFade = realFade; f.chromeAlpha = chromeAlpha;
    this._galaxyPlate?.setFade(plateFade);
    const u = this._sky?.points?.material?.uniforms?.uRealFade;
    if (u) u.value = realFade;
    this._galaxyChromeAlpha = Number.isFinite(chromeAlpha) ? chromeAlpha : null;
  }

  /** Koniec lotu: scena trybu docelowego (`'galaxy'` — sama płyta w pełni; `'system'` — sam układ, płyta schowana). */
  endGalaxyFlight(mode) {
    const cam = this.camera;
    this._galaxyFlight = null;
    this._galaxyChromeAlpha = null;
    const u = this._sky?.points?.material?.uniforms?.uRealFade;
    if (mode === 'galaxy') {
      cam.layers.set(GALAXY_LAYER);
      cam.far = CAMERA_FAR.galaxy;
      this._galaxyPlate?.setVisible(true);
      this._galaxyPlate?.setFade(1);
      if (u) u.value = 0;
    } else {
      cam.layers.set(0);
      cam.far = CAMERA_FAR.system;
      this._galaxyPlate?.setVisible(false);
      this._galaxyPlate?.setFade(0);
      if (u) u.value = 1;
    }
    cam.updateProjectionMatrix();
  }

  /** Kotwica płyty [ly, osie świata] — położenie aktywnego układu (warstwa HUD: rzut punktów galaktyki spoza gwiazd). */
  getGalaxyAnchorLy() {
    const a = this._galaxyPlate?._anchor;
    return a ? { x: a.x, y: a.y, z: a.z } : { x: 0, y: 0, z: 0 };
  }

  /**
   * Gaśnięcie obiektów UKŁADU w trakcie lotu — wyłącznie na czas renderu: linie, punkty i sprite'y z materiałem przezroczystym
   * dostają krycie × `systemFade` (materiał wspólny — raz), nieprzezroczyste chowają się przy `systemFade` < 0,5; siatki chowają
   * się, gdy tarcza w rzucie ma poniżej 0,5 px (`subPixelHidden`). Zwraca funkcję cofającą (wołaną zaraz po renderze).
   */
  _applyFlightFade() {
    const f = this._galaxyFlight;
    const cam = this.camera;
    if (!f || !cam || !(cam.layers.mask & 1)) return null;
    const fade = Math.max(0, Math.min(1, f.systemFade));
    const skip = new Set([this._sky?.group, this._galaxyPlate?.group].filter(Boolean));
    const mats = new Map(), hidden = [];
    const focal = cam.projectionMatrix.elements[5] * ((window.innerHeight || 720) / 2);
    const V = cam.matrixWorldInverse.elements;
    const sph = this._flightSph ?? (this._flightSph = new THREE.Sphere());
    const hide = (o) => { if (o.visible) { o.visible = false; hidden.push(o); } };
    for (const root of this.scene.children) {
      if (skip.has(root)) continue;
      root.traverseVisible((o) => {
        if (!(o.layers.mask & 1)) return;
        if (o.isLine || o.isPoints || o.isSprite) {
          if (fade <= 0.001) { hide(o); return; }
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          let opaque = false;
          for (const m of ms) { if (!m) continue; if (m.transparent) { if (!mats.has(m)) mats.set(m, m.opacity); } else opaque = true; }
          if (opaque && fade < 0.5) hide(o);
          return;
        }
        if (o.isMesh) {
          const g = o.geometry;
          if (!g) return;
          if (!g.boundingSphere) g.computeBoundingSphere();
          if (!g.boundingSphere) return;
          sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
          const c = sph.center;
          const depth = -(V[2] * c.x + V[6] * c.y + V[10] * c.z + V[14]);
          if (subPixelHidden(sph.radius, depth, focal)) hide(o);
        }
      });
    }
    for (const [m, op] of mats) m.opacity = op * fade;
    return () => {
      for (const [m, op] of mats) m.opacity = op;
      for (const o of hidden) o.visible = true;
    };
  }

  // ── ARC GALAXY G2-3 — terytorium, aureole własności, słupki ─────────────────────────────────────────────────────────
  _tickGalaxyLook(t) {
    const plate = this._galaxyPlate;
    const K = window.KOSMOS;
    if (!plate) {
      if (this._galaxyTerritory) this._galaxyTerritory.group.visible = false;
      return;
    }
    if (!this._galaxyTerritory) {
      this._galaxyTerritory = new GalaxyTerritory(THREE, { layer: GALAXY_LAYER, logDepth: logDepthOn() });
      plate.group.add(this._galaxyTerritory.group);
      this._galaxyTerrDirty = true;
    }
    const terr = this._galaxyTerritory;
    terr.group.visible = true;
    const now = performance.now();
    // Pokrętło siatki pola (D-GX-15): zmiana → przeliczenie `TerritoryField` na nowej siatce.
    const cfgT = GAME_CONFIG.TERRITORY;
    const gk = Number(LIVE_GALAXY.TERR_GRID_LY);
    if (cfgT && gk > 0.1 && cfgT.GRID_LY !== gk) { cfgT.GRID_LY = gk; K?.territoryField?.recompute?.(); this._galaxyTerrDirty = true; }
    if (this._galaxyTerrDirty || now >= this._galaxyLookNext) {
      this._galaxyTerrDirty = false;
      this._galaxyLookNext = now + 1000;
      const t0 = performance.now();
      const tf = K?.territoryField, intel = K?.intelSystem, war = K?.warSystem, ts = K?.territoryService;
      const territories = tf?.getAllTerritories?.() ?? [];
      const vis = plateTerritoryVisibility(territories, { intelLevelOf: (o) => intel?.getLevel?.(o), isAtWarWith: (o) => !!war?.getWarWith?.(o) });
      const payload = buildPlateTerritoryPayload(territories, vis);
      const t1 = performance.now();
      const dimHex = this._hud3dHex?.('dim') ?? hudRoleHex('dim');
      const rebuilt = terr.apply(payload, { colorOf: (hex) => new THREE.Color(hex), outlineColor: new THREE.Color(dimHex), iso: cfgT?.ISO ?? 0.5 });
      const t2 = performance.now();
      this._galaxyLookStats = { payloadMs: +(t1 - t0).toFixed(3), applyMs: +(t2 - t1).toFixed(3), rebuilds: terr._rebuilds, rebuilt,
        gridLy: cfgT?.GRID_LY ?? null, owners: payload.layers.length };
      // Aureole własności (C) i słupki (układy gracza + zaznaczona).
      const systems = K?.galaxyData?.systems ?? [];
      plate.setOwnerHalos(plateOwnerHalos({ systems, ownerOf: (id) => ts?.getSystemOwner?.(id) ?? null,
        colorOf: (o) => ts?.getEmpireColor?.(o) ?? '#888888', intelAtLeast: (o, lvl) => intel?.isAtLeast?.(o, lvl) === true }));
    }
    const owned = (K?.territoryService?.getOwnedSystems?.('player') ?? []).map((o) => o.systemId);
    plate.setRisers(plateRiserIds({ ownedIds: owned, selectedId: K?.galaxyMode?.selectedSystemId ?? null }),
      this._hud3dHex?.('primary') ?? hudRoleHex('primary'));
    terr.tick({ time: t, fade: plate.fade, knobs: LIVE_GALAXY });
  }

  /** Odczyt bramki: `KOSMOS.debug.galaxyTerritoryInfo()` — terytorium płyty, pole, aureole, słupki, koszt przeliczenia. */
  getGalaxyTerritoryInfo() {
    const tf = window.KOSMOS?.territoryField;
    const all = tf?.getAllTerritories?.() ?? [];
    return {
      field: all.map((td) => ({ ownerId: td.ownerId, color: td.color, loops: td.loops?.length ?? 0, field: td.field?.length ?? 0,
        grid: td.maskBounds ? `${td.maskBounds.nx}x${td.maskBounds.ny}@${(+td.maskBounds.cell).toFixed(3)}` : null })),
      plate: this._galaxyTerritory?.info?.() ?? null,
      stats: { ...this._galaxyLookStats },
      ownerHalos: this._galaxyPlate?.ownerHalos?.geometry?.drawRange?.count ?? 0,
      risers: this._galaxyPlate?._riserIds?.length ?? 0,
    };
  }

  /** Odczyt bramki: `KOSMOS.threeRenderer.getGalaxyInfo()` — tryb, kamera (warstwa, far, dystans), płyta. */
  getGalaxyInfo() {
    const cc = this._cameraController, r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : null);
    return {
      active: this._galaxyActive, K: GALAXY_K, layerMask: this.camera.layers.mask, far: this.camera.far,
      camera: cc ? { mode: cc.mode, dist: r1(cc._dist), targetDist: r1(cc._targetDist), minDist: r1(cc.minDist), maxDist: r1(cc.maxDist),
        theta: +cc._theta.toFixed(4), phi: +cc._phi.toFixed(4), target: { x: r1(cc._goalTarget.x), y: r1(cc._goalTarget.y), z: r1(cc._goalTarget.z) } } : null,
      skyRealFade: this._sky?.points?.material?.uniforms?.uRealFade?.value ?? null,
      plate: this._galaxyPlate?.info() ?? null,
      flight: this._galaxyFlight ? { ...this._galaxyFlight } : null,   // ARC GALAXY G2-1
      chromeAlpha: this._galaxyChromeAlpha,
    };
  }

  // ── Oświetlenie ──────────────────────────────────────────────
  _buildLights() {
    // Ambient — słabe, chłodne wypełnienie (nocna strona LEDWO czytelna, nie szara).
    // Wartości pod ACES (ściemnia midtony ~20% względem NoToneMapping).
    // Uchwyt trzymany, bo renderStar przestraja BARWĘ wypełnienia wg klasy gwiazdy
    // (_applyAmbientForClass). Konstrukcja i intensywność bez zmian.
    this._ambient = new THREE.AmbientLight(AMBIENT_BASE_HEX, 0.4);
    this.scene.add(this._ambient);
    // PointLight od gwiazdy — decay=0: brak fizycznego tłumienia (r171 domyślnie decay=2
    // co przy intensity=2.0 i odl.=11j daje 2/121≈0.017 = czarny).
    // distance=0 = brak limitu zasięgu. Intensywność 2.8 kompensuje krzywą ACES.
    this._starLight = new THREE.PointLight(0xfff1de, 2.8, 0, 0);
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
    // Finding 582 — statek usunięty POZA walką (`VesselManager.destroyVessel`): sprite i śledzenie kamery jak przy doku,
    //   bez pulsu „dokowania” (dawniej usunięcie szło przez fałszywy `vessel:docked`).
    EventBus.on('vessel:removed', safe(({ vesselId }) => {
      if (this._focusVesselId === vesselId) this._focusVesselId = null;
      this._removeVesselSprite(vesselId);
    }));
    EventBus.on('vessel:positionUpdate', safe(({ vessels }) => {
      this._syncVesselPositions(vessels);
      this._syncPredictionCones();   // M2b C4 — origin/dir/scale per active intercept
    }));
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
    // Wrak — zmiana wizualna (szary, orbituje statycznie wokół
    // planety. Wcześniej było "dryfuj statycznie" ale wrak lądował w środku mesh'a
    // planety (y=0.02 < promień planety) i znikał wizualnie).
    EventBus.on('vessel:wrecked', safe(({ vesselId, vessel }) => {
      // ARC CV-8a — bitwa orbitalna w powtórce: zamiana we wrak czeka na zniszczenie okrętu w powtórce (`CvOrbital.afterKill`);
      // wraki z `EnemyAttackHandler` przychodzą ZARAZ po rozstrzygnięciu, zanim powtórka cokolwiek pokaże.
      if (this._cvOrb?.deferWreck?.(vesselId, vessel)) return;
      this._onVesselWreckedView(vesselId, vessel);
    }));
    this._onVesselWreckedView = (vesselId, vessel) => {
      const entry = this._vessels.get(vesselId);
      if (!entry) return;
      // ARC CV-4a (flaga `cvWeapons`) — zniszczenie pokazane już w chwili trafienia zabijającego (rejestr salw): bez drugiej
      // eksplozji i sygnału; trafienie zabijające jeszcze w locie — eksplozja i wygląd wraku w jego chwili (`_cvWpnPresentKill`).
      // Bramka pyta rejestr TAKŻE przy fladze OFF (kontrola właściciela 2026-11-12): `cvWeapons(0)` w trakcie bitwy zostawiał
      // zniszczenia pokazane przy trafieniu, a koniec bitwy dawał im drugą eksplozję. Bez rejestru (sesja tylko OFF) — `null`,
      // dzisiejsza ścieżka co do bitu.
      const cvKill = this._cvWpnWreckGate?.(vesselId, entry) ?? null;
      // Eksplozja w miejscu zniszczenia — PRZED zamianą na wrak (pozycja jeszcze
      // żywa). Gated fcCombatFx. Kula ognia + pierścień uderzeniowy (_spawnExplosion).
      if (GAME_CONFIG.FEATURES?.fcCombatFx && !cvKill?.skipBoom) {
        this._spawnExplosion(entry.sprite.position, vesselTargetSize(vessel), { id: vesselId, vessel });   // ARC CV-5 — kontekst wybuchu warstwowego
        this._cueDestroyed(vesselId, vessel, entry);   // ARC CV-2b — sygnał „zniszczony”
      }
      entry.isWreck = true;
      entry.sprite.visible = true;
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
          initAngle: rendererRandom() * Math.PI * 2,
        };
      } else {
        entry._orbiting = null;
        this._cvDmgConverge?.(vesselId, entry, vessel);   // ARC CV-5 (Finding 627) — wrak w wolnej przestrzeni zbiega do pozycji logicznej
      }
      // Wizualne — wypalony czarny z ledwo czerwoną poświatą. Wypiera rdzawy
      // odcień który za bardzo upodabniał wrak do naturalnego koloru cargo3d.glb.
      const wreckCol = new THREE.Color(0x1a1a1a);
      // ARC CV-1a — statek w ramie kanonicznej: materiały są już WŁASNYMI klonami statku (Finding 624) — wygląd wraku na nich,
      // bez ponownego klonowania (dawna ścieżka klonowała drugi raz i nie zwalniała klonów wroga); żar idzie uniformem maski
      // (Finding 620 — wreszcie widoczny), smuga i punkty świetlne gasną.
      if (entry.canonical && entry.rig) {
        if (!cvKill?.skipLook) {   // ARC CV-4a — wygląd wraku już (albo dopiero) w chwili trafienia zabijającego
          paintRigMaterials(THREE, entry.rig.materials, 'wreck', { burnHot: !!GAME_CONFIG.FEATURES?.fcCombatFx });
          if (entry.rig.exhaust) entry.rig.exhaust.visible = false;
          if (entry.rig.lights) { this._shipLightPool?.release(entry.rig.lights); entry.rig.lights = null; }
          this._cvTiltWreck(entry.sprite);   // pochylenie jak ścieżka OFF (przechył wokół dziobu był innym obrazem)
          if (this._cvDmgOn?.()) this._cvDmgWreckLook?.(vesselId, entry);   // ARC CV-5 — szwy stygnące zamiast czerwieni całego kadłuba
        }
        entry.enemyTint = true;   // jak ścieżka OFF — etykiety CTRL (kolor wraku); zwalnianie rozstrzyga `canonical`
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
    };

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

    // ── Zaznaczenie ciała + (opcjonalnie) śledzenie kamery ──
    // ARKUSZ UI U1-2 (D-UI-5): `body:selected { entity, focus }` — `focus` domyślnie `true`, więc emitenci spoza reguły
    // klik/focus (Dziennik, Obserwatorium, Dowództwo, starty scenariusza / intro) zachowują dzisiejsze zachowanie;
    // pierwszy klik reguły emituje `focus: false` → zaznaczenie i karta ciała, kamera STOI.
    EventBus.on('body:selected', safe(({ entity, focus = true }) => {
      // ARC GALAXY G1 — polecenie kamery na ciało układu wraca z trybu galaktyki (samo zaznaczenie — nie).
      if (focus !== false) this._leaveGalaxyFor?.('focus');
      this._selectedEntityId = entity.id;
      this._pingedEnemyId = null;   // U1-3: inne zaznaczenie — pamięć pingu wroga gaśnie
      if (focus !== false) {
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
      // ARKUSZ HUD H0 — orbity w stylu ze stanu (zaznaczona — rola `primary`): planetoidy i pierścienie księżyców
      // przestylowane, planety przebudowane.
      this._hudRestylePlanetoidOrbits();
      this._hudRestyleMoonRings();
      this._rebuildAllOrbits();
    }));

    // ARKUSZ UI U1-2 (decyzja 2a, Finding 473): odznaczenie (klik w pustkę, ✕ karty ciała) czyści ZAZNACZENIE i kończy
    // śledzenie obiektu — kamera STOI, bez żadnego polecenia ruchu. Dawne `focusOn(gwiazda)` zostawiało dystans fokusu,
    // więc kamera kończyła WEWNĄTRZ tarczy gwiazdy (zmierzone, Polonia gy79: 3,583 j. od środka po ciele, 0,9 po
    // statku, przy promieniu tarczy 3,6). „Obserwuj” i auto-fokus starcia — bez zmian (kończą się jak dotąd).
    EventBus.on('body:deselected', safe((p) => {
      this._selectedEntityId = null;
      this._pingedEnemyId = null;
      // REFORMA ZAKŁADEK T2 (D-TR-5 (a)): zamiana przypięcia ciało → stacja (`reason: 'pin_swap'` — 1. klik w stację) zdejmuje
      // ZAZNACZENIE ciała, ale nie śledzenie kamery ani jej progu — 1. klik bez polecenia kamery (D-UI-5), jak dziś. Literał =
      // `LabelPinLogic.PIN_SWAP_REASON` (keeper `label_pin_smoke` pinuje zgodność; słuchacz bez importu — keepery go kompilują).
      const swap = p?.reason === 'pin_swap';
      if (!swap) {
        this._focusEntityId = null;
        this._focusVesselId = null;
        this._focusStationId = null;
      }
      // Ukryj ikony budynków kolonii + tooltip
      this._colonyMarkers.hide();
      this._hideColonyTooltip();
      // Przywróć domyślny min zoom (sam próg — kamera się nie rusza)
      if (this._cameraController && !swap) this._cameraController.setMinDist(0.3);
      // ARKUSZ HUD H0 — orbity w stylu ze stanu (bez zaznaczenia)
      this._hudRestylePlanetoidOrbits();
      this._hudRestyleMoonRings();
      this._rebuildAllOrbits();
    }));

    // Odśwież ikony budynków po budowie/rozbiórce (jeśli ta planeta jest focused)
    const refreshMarkers = () => {
      if (!this._colonyMarkers.entityId || !this._selectedEntityId) return;
      const colony = window.KOSMOS?.colonyManager?.getColony(this._colonyMarkers.entityId);
      if (colony?.grid) this._colonyMarkers.refresh(colony.grid);
    };
    EventBus.on('planet:buildResult',          safe(refreshMarkers));
    EventBus.on('planet:demolishResult',       safe(refreshMarkers));
    EventBus.on('planet:constructionComplete', safe(refreshMarkers));

    // Fleet Command Console (Slice 0) — mirror zaznaczenia z UIManager
    // (wskaźnik = ramki 2D w UIManager._drawSelectionBrackets).
    EventBus.on('ui:selectionChanged', safe(({ vesselId }) => {
      this._pingedEnemyId = null;   // U1-3: inne zaznaczenie — pamięć pingu wroga gaśnie
      this._selectedVesselId = vesselId ?? null;
    }));

    // Fleet Command Console (Slice 1) — smugi walki na żywej mapie (FX-only).
    // ARC CV-4a (flaga `cvWeapons`) — język broni i rejestr salw: osobny słuchacz z PEŁNYM ładunkiem (numer rundy, ziarno starcia);
    // salwa CV-2a (`_cvFxRoundFx`) pod tą flagą ustępuje, więc strzał rysuje się raz.
    EventBus.on('combat:roundFx', safe((p) => this._cvWpnRoundFx(p)));

    // ARC CV-8a / CV-8b — bitwa orbitalna (EnemyAttackHandler, klucz `fx`) gra jako powtórka na scenie planety (`CvOrbital.handle` —
    // idempotentne, woła je też `GameScene`; poza oglądanym układzie — sam baner). CV-8b (D-CV-27 (a)) wycofało „imitację” walki
    // (16 kresek wokół planety, `_spawnBattleBurst`) razem z kinem BattleView3D.
    EventBus.on('battle:resolved', safe((p) => this._cvOrb?.handle?.(p)));

    // Slice 1 — łagodny auto-focus kamery gdy gracz wchodzi w starcie (wide framing).
    // Domyślnie ON (gracz chce widzieć bitwy); close-up = klik statku / „Obserwuj bitwę".
    EventBus.on('vessel:engaged', safe(({ sideA = [], sideB = [], location, encounterId }) => {
      if (!GAME_CONFIG.FEATURES?.fcCombatFx) return;
      if (window.KOSMOS?.uiPrefs?.battleAutoFocus === false) return;
      if (this._galaxyActive) return;   // ARC GALAXY G1 — automat nie wyrywa gracza z trybu galaktyki
      // POLISH P2a (CP7, Finding 453) — starcie w innym układzie: kamera zostaje (punkt starcia jest w ramce INNEGO układu).
      if (!isEngagementInView({ encounterSystemId: location?.systemId, activeSystemId: window.KOSMOS?.activeSystemId })) return;
      // POLISH P2a (CP13) — gracz obserwuje inną walkę („Obserwuj”): nowe starcie nie zabiera mu kamery.
      if (this._watch) return;
      // ARC CV-7 — włączony reżyser (chip) prowadzi bitwę w widoku sam — auto-fokus ustępuje (inaczej przestawiłby kamerę, a reżyser
      // odczytałby to jako przejęcie przez gracza).
      if (this._cvDir?.wantsBattles?.()) return;
      const vm = window.KOSMOS?.vesselManager;
      const playerIn = [...sideA, ...sideB].some(id => {
        const v = vm?.getVessel?.(id); return v && !isEnemyVessel(v);
      });
      if (!playerIn || !this._cameraController) return;
      const p = location?.point;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      // POLISH P2a (CP17, Finding 459) — cel i dystans NATYCHMIAST: kamera ma być na miejscu przed pierwszą salwą (runda 1
      // pada po ~64 ms; dawny lerp dolatywał z kadru układu 1408 ms — rundy 1–4 mijały przed dolotem). Kadr szeroki
      // (≤ 6 j.) jak dotąd; zbliżenie — „Obserwuj” albo klik statku.
      this._cameraController.focusOnInstant(S(p.x), S(p.y));
      this._cameraController.snapDist(Math.min(this._cameraController._targetDist, 6));
      // POLISH P2b (D1, Finding 467) — od następnej klatki cel ŚLEDZI walkę (`_updateAutoFocusCamera`: uczestnicy
      // wyśrodkowani nad panelem walki); dawniej stał w punkcie startu, a walka odpływała od niego o ~0,1 AU (kamera
      // patrzyła na pierścień, nie na statki).
      // Dotychczasowy fokus ciała / statku / stacji przerwany — inaczej `_updateCameraFocus` co tik ciągnąłby kamerę z walki.
      this._focusEntityId = null; this._focusVesselId = null; this._focusStationId = null; this._focusEncounterId = null;
      const g0 = this._cameraController._goalTarget;
      this._autoFocus = { encounterId: encounterId ?? null, goal: { x: g0.x, y: g0.y, z: g0.z } };
    }));

    // POLISH P2a (CP17, Findingi 455, 462) — wróg w starciu z graczem: pełne krycie i smugi od startu starcia (przed salwą
    // otwierającą); dołączający do starcia — tak samo. Koniec starcia łapie `_syncCombatReveal` w pętli renderu.
    EventBus.on('vessel:engaged', safe(() => this._syncCombatReveal()));
    EventBus.on('vessel:joinedCombat', safe(() => this._syncCombatReveal()));

    // Slice 1 — kamera „Obserwuj bitwę" (mirror vessel:focus, close-up na midpoint).
    // POLISH P2a (CP7, Finding 453) — starcie w INNYM układzie: najpierw widok przełączony na układ starcia
    // (`starSystemManager.switchActiveSystem` — ta sama droga co chipy układów), potem kadr; nieznany układ — nic.
    EventBus.on('camera:watchBattle', safe(({ encounterId, systemId, x, y }) => {
      if (!this._cameraController || !Number.isFinite(x) || !Number.isFinite(y)) return;
      this._leaveGalaxyFor?.('watch');   // ARC GALAXY G1 — „Obserwuj” = widok układu
      const act = watchBattleAction({ encounterSystemId: systemId, activeSystemId: window.KOSMOS?.activeSystemId });
      if (!act.frame) return;
      if (act.switchTo && window.KOSMOS?.starSystemManager?.switchActiveSystem?.(act.switchTo) !== true) return;
      this._focusEntityId = null; this._focusVesselId = null; this._focusStationId = null;
      this._focusEncounterId = { x, y };
      // POLISH P2a (CP13, Finding 458) — kamera ŚLEDZI walkę (środek sprite'ów żywych uczestników, dystans z dopasowania
      // do ich rozpiętości z marginesem, [MIN_DIST; MAX_DIST]); dawniej kadr stałego punktu startu z bliska (≤ 1,2 j.),
      // od którego walka odpływała, a statki lądowały przy krawędzi pod nakładkami.
      this._startWatch(encounterId ?? null, x, y);
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

    // ⚠ Finding 663 (dodatek 1 i decyzja właściciela 37, 2026-11-11) — BEZ pierścieni ruchu statku: dawne pulsy Slice 6 przy
    //   starcie, przylocie i doku (`vessel:launched` / `vessel:arrived` / `vessel:docked`, `_spawnMovementPulse`) usunięte;
    //   nic innego od nich nie zależało (pin: `sb2b_pulse_scope_smoke`).

    // Centruj kamerę na statku (kliknięcie w liście floty / Outliner)
    EventBus.on('vessel:focus', safe(({ vesselId }) => {
      if (!this._cameraController) return;
      this._leaveGalaxyFor?.('focus');   // ARC GALAXY G1 — kamera na statek = widok układu
      this._pendingVesselFocus = null;
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
          // Finding 532: dok przy PLANETOIDZIE (placówka) — ta sama mapa, z której rysowane są placówki
          // (`getBodyWorldInfo`); dawniej szukano tylko w planetach i księżycach, więc 2. klik
          // w statek zadokowany przy planetoidzie nie ruszał kamery ani nie otwierał karty ciała (reguła D-UI-5).
          const pdEntry = this._planetoids.get(dockedAt);
          const entity = pEntry ? this._entityByUUID.get(pEntry.mesh.uuid)
                                : mEntry ? this._entityByUUID.get(mEntry.mesh.uuid)
                                : pdEntry ? this._entityByUUID.get(pdEntry.mesh.uuid) : null;
          const pos = pEntry?.group?.position ?? mEntry?.mesh?.position ?? pdEntry?.mesh?.position;
          if (pos) {
            this._focusEntityId = dockedAt;
            this._cameraController.focusOn(pos.x, pos.z);
            // Zaznacz ciało — feedback wizualny (orbita, glow)
            if (entity) EventBus.emit('body:selected', { entity });
          }
        } else if (vessel?.position && Number.isFinite(vessel.position.x) && Number.isFinite(vessel.position.y)
                   && (vessel.systemId === undefined ? 'sys_home' : vessel.systemId) === (window.KOSMOS?.activeSystemId ?? 'sys_home')) {
          // ARKUSZ UI U1-3 (§7.8, Finding 478): statek bez sprite'a w OGLĄDANYM układzie — po przełączeniu układu model
          // GLB wstawia się asynchronicznie (obietnica loadera, także z pamięci podręcznej). Cel kamery od razu na pozycji
          // logicznej; śledzenie przejmie sprite, gdy stanie (`_applyPendingVesselFocus`), o ile kamery nie przejął
          // w międzyczasie nikt inny (cel bez zmian — wzór „Obserwuj”). Dawniej: cichy no-op.
          const cc = this._cameraController;
          this._focusEntityId = null; this._focusVesselId = null; this._focusStationId = null; this._focusEncounterId = null;
          cc.setMinDist(0.05);
          cc.focusOnInstant(S(vessel.position.x), S(vessel.position.y), 0.3);
          cc.setTargetDist(Math.min(cc._targetDist, 0.9));
          const g = cc._goalTarget;
          this._pendingVesselFocus = { vesselId, goal: { x: g.x, y: g.y, z: g.z } };
        }
      }
    }));

    // ARKUSZ UI U1-3: otwarcie panelu stacji to inne zaznaczenie — pamięć pingu wroga gaśnie (decyzja 2d).
    EventBus.on('station:selected', safe(() => {
      this._pingedEnemyId = null;
    }));

    // Centruj kamerę na stacji (klik w scenie 3D) — TYLKO kamera, BEZ selekcji/panelu (S3.3b-S4a).
    // Mirror vessel:focus; _updateCameraFocus śledzi stację co klatkę (anchored, ale planeta orbituje).
    EventBus.on('station:focus', safe(({ stationId }) => {
      if (!this._cameraController) return;
      this._leaveGalaxyFor?.('focus');   // ARC GALAXY G1 — kamera na stację = widok układu
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
      // ARKUSZ HUD H0 (D-HUD-7) — styl orbit ze stanu (najechanie zapamiętane; „Żadne” — tylko zaznaczona).
      this._hudHoverOrbitId = entityId ?? null;
      this._hudRestyleOrbits();
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
    // ARC GALAXY G1 — przebudowa sceny układu zawsze w trybie układu: najpierw wyjście z galaktyki (kamera systemu
    // z migawki), potem kadr nowego układu (`frameSystem` w `initSystem`). Wejście w układ z galaktyki = wyjście + przełączenie.
    this._leaveGalaxyFor?.('switch');
    this._disposeAllMeshes();
    this.initSystem(star, planets, planetesimals, moons);
    // NIEBO (D-GX-6) — niebo z nowego układu: przelicz kierunki / kolor / rozmiar katalogu (no-op bez kopuły i przed
    // galaktyką). `star.systemId` = id z galaxyData (StarSystemManager oznacza nim każdą encję układu).
    this._skySystemId = star?.systemId ?? window.KOSMOS?.activeSystemId ?? this._skySystemId;
    this._recomputeSky('switchSystem');
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
  // przy PAUZIE po powrocie do układu sprite'y nie istniały → pozycja ekranowa statku
  // brakowała → plakietki/strzałki/klastry znikały (dziś etykiety warstwy HUD czytają
  // `getVesselWorldPosition` — ten sam warunek). Idempotentne (_addVesselSprite guard na istniejący entry);
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
  // Filtr układu siedzi w _addStationMesh (JEDNO źródło reguły) — tu tylko iterujemy rejestr.
  _restoreActiveSystemStations() {
    const ss = window.KOSMOS?.stationSystem;
    if (!ss?.getAllStations) return;
    for (const st of ss.getAllStations()) this._addStationMesh(st);
  }

  // Usuń wszystkie meshe z bieżącej sceny (planety, księżyce, gwiazda, orbity, itp.)
  _disposeAllMeshes() {
    // Planety
    for (const [id, entry] of this._planets) {
      if (entry.group) {
        entry.group.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            GasGiantShader.disposeLiveGasPalette(obj.material);  // C1a — paleta żywego gazowca
            obj.material.dispose();
          }
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
      this._starCore   = null;   // rdzeń był dzieckiem groupy (już zdisposowany)
      this._sunGranU   = null;   // uniformy żywego rdzenia znikają razem z materiałem
      this._sunCoronaU = null;   // to samo dla żywej korony
      this._sunPromSlots = [];
      this._starCorona = null;   // billboard korony był dzieckiem groupy (już zdisposowany)
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

    // Markery wykrytych wrogów — switchSystem nie zostawia ghost markerów
    this._disposeAllEnemyAlertMarkers();

    // POI sprites (M2b C7) — switchSystem nie zostawia ghost markerów
    this._disposeAllPOISprites();

    // Reset
    this._entityByUUID.clear();
    this._clickable = [];
    this._focusEntityId = null;
    this._selectedEntityId = null;
    this._pingedEnemyId = null;
    this._pendingVesselFocus = null;
    this._focusVesselId = null;
    this._focusStationId = null;
    this._star = null;
    this._starClickMesh = null;
  }

  // ── Baza PointLighta gwiazdy — JEDNO ŹRÓDŁO PRAWDY ───────────────────────
  // Czytają ją DWA miejsca: renderStar (budowa układu) i updateStarForDyson
  // (reset przy zmianie etapu Sfery). Wcześniej to drugie wpisywało zaszyte
  // _starLightOrigColor/_starLightOrigIntensity, więc KAŻDA zmiana etapu Dysona
  // gasiła barwę TEJ gwiazdy na generyczne 0xfff1de — i przez aliasing obiektu
  // Color (renderStar:`_starLight.color = color`, ten sam obiekt siedzi w
  // coreMat.uniforms.uColor) przemalowywała też POWIERZCHNIĘ gwiazdy.
  // ⚠ Kolor jest naprawiany BEZWARUNKOWO (defekt tożsamości gwiazdy, ortogonalny
  //   do skalowania klasą); flagą objęta jest wyłącznie INTENSYWNOŚĆ.
  _starLightBaseline(star = this._star) {
    const spec   = star?.spectralType || 'G';
    const stData = STAR_TYPES[spec] || STAR_TYPES.G;
    const lum    = Math.max(stData.luminosity ?? 1.0, 1e-6);
    const scaled = GAME_CONFIG.FEATURES?.starClassLighting !== false;
    return {
      // Fallback na _starLightOrigColor tylko gdy gwiazdy nie ma (wywołanie
      // przed renderStar) — przy żywej gwieździe zawsze jej własna barwa.
      colorHex:  star?.visual?.color ?? this._starLightOrigColor,
      intensity: scaled
        ? this._starLightOrigIntensity * Math.pow(lum, STAR_LUMINOSITY_EXP)
        : this._starLightOrigIntensity,
      // Chłodniejszy ambient TYLKO dla M/K i TYLKO przy fladze ON.
      ambientCool: scaled && AMBIENT_COOL_CLASSES.has(spec),
    };
  }

  // Barwa ambientu wg klasy gwiazdy. ⚠ SYMETRYCZNIE Z KONSTRUKCJI: zawsze zaczyna
  // od bazy, więc przeskok układu M → F nie zostawia schłodzonego wypełnienia po
  // poprzedniej gwieździe (a G/F i flaga OFF dostają 0x101a26 co do bitu).
  // Intensywność (0.4) NIE jest ruszana — zmieniamy wyłącznie odcień.
  _applyAmbientForClass(cool) {
    if (!this._ambient) return;
    this._ambient.color.setHex(AMBIENT_BASE_HEX);
    if (cool) this._ambient.color.lerp(AMBIENT_COOL_COLOR, AMBIENT_COOL_MIX);
  }

  // ── Gwiazda (kolorowy rdzeń + białe centrum + kolorowe promieniowanie) ──
  renderStar(star) {
    this._star = star;
    // Promień gwiazdy skalowany masą: M(0.3)→0.8, K(0.7)→1.0, G(1.0)→1.2, F(1.4)→1.4
    const starMass = star.mass ?? 1.0;
    const r = Math.max(0.6, Math.min(1.6, 0.6 + starMass * 0.6));
    const color = new THREE.Color(star.visual.color);

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

    // ── [0] Rdzeń — shader HDR: wyjście LINIOWE >1 (bez własnego Reinharda).
    // ACES (OutputPass) mapuje szczyt, bloom (próg 1.0) robi glare z realnie
    // jasnych pikseli. Limb darkening + granulacja z tekstury emission zostają.
    const texType = stData.texType || `star_${spec}`;
    const variant = (hashCode(star.id || 'star') % TEXTURE_VARIANTS) + 1;
    const texMaps = loadStarTextures(texType, variant);

    // ⚠ `color` jest przekazywany jako INSTANCJA (nie kopia) — alias V-248, od którego
    //   zależy fioletowa gwiazda na etapie 4 Sfery Dysona. Szczegóły w JSDoc fabryki.
    const liveSun = !!GAME_CONFIG.FEATURES.liveSunShader;
    const granCls = classGranParams({ temperature: stData.temperature ?? 5800 });
    this._sunFreqMult  = granCls.freqMult;
    this._sunBoilMult  = granCls.boilMult;
    this._sunBoilPhase = 0;
    const coreMat = SunShader.createStarCoreMaterial({
      emissionMap: texMaps.emission,
      sharedColor: color,
      brightness,
      whitePower,
      live: liveSun,
      seed: liveSun ? SunShader.sunSeedFromId(star.id) : null,
      granFreqMult: granCls.freqMult,
      logDepth: logDepthOn(),
    });
    // Uchwyt uniformów żywej granulacji — null przy OFF, więc każdy konsument bramkuje
    // się na NIM, a nie na fladze (wzór D-V1: bramka stoi na MATERIALE, nie na typie).
    this._sunGranU = liveSun ? coreMat.uniforms : null;
    // ⚠ Nazwany uchwyt rdzenia (V-266). Do commita 033e794 obrót czytał
    //   `_starGroup.children[0]` — kontrakt POZYCYJNY, który przy zmianie kolejności
    //   budowy grupy łamie się CICHO (bez wyjątku, bez logu: kręci się nie ten mesh,
    //   a granulacja staje). V2 dokłada dzieci tej grupy, więc indeks znika ZANIM
    //   zdąży to zrobić.
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(r * STAR_CORE_SCALE, 64, 64), coreMat);
    group.add(coreMesh);
    this._starCore = coreMesh;

    // ── [1] Korona — JEDEN billboard shaderowy (float = zero bandingu 8-bit).
    // Zanik wykładniczy DO ZERA przed krawędzią plane'a (żadnych ogonów alpha,
    // które robiły szarą mgłę), lekko HDR przy rdzeniu (uGain ~1.75): bloom
    // dostaje OKRĄGŁE źródło energii → miękki glare bez kwadratu mip-blura.
    // Zastępuje dawne 3 sprite'y canvas (glow ×7/×21/×42 — patrz analiza).
    const coronaCol = new THREE.Color(star.visual.glowColor ?? star.visual.color)
      .lerp(new THREE.Color(1, 1, 1), 0.5);   // 50% ku bieli — naturalniejszy glare
    // Maska sylwetki i rzut kotwic potrzebują OBU promieni w jednostkach świata.
    this._sunCoreRadius = r * STAR_CORE_SCALE;
    this._sunQuadHalf   = r * glowScale * 1.1;   // = coronaSize / 2
    this._sunPromSlots  = liveSun ? SunShader.promSlotsFor(star.id) : [];
    this._sunPromTime   = 0;
    const coronaMat = SunShader.createStarCoronaMaterial({
      coronaColor: coronaCol,
      gain: 0.95 * glowOpacity,   // <1.0 = korona NIE karmi bloomu (czysty gradient)
      live: liveSun,
      seed: liveSun ? SunShader.sunSeedFromId(star.id) : null,
      glowHex:    star.visual.glowColor ?? star.visual.color,
      quadHalf:   this._sunQuadHalf,
      coreRadius: this._sunCoreRadius,
      logDepth: logDepthOn(),
    });
    this._sunCoronaU       = liveSun ? coronaMat.uniforms : null;
    this._sunStreamerPhase = 0;
    this._sunBreathPhase   = 0;
    const coronaSize = r * glowScale * 2.2;   // G: 1.2×7×2.2 ≈ 18.5 j. (wciąż ~3× mniej niż stary sprite [3])
    const corona = new THREE.Mesh(new THREE.PlaneGeometry(coronaSize, coronaSize), coronaMat);
    corona.renderOrder = 2;
    corona.material.userData._baseGain = coronaMat.uniforms.uGain.value;   // baza „oddechu" w pętli
    group.add(corona);
    this._starCorona = corona;   // billboard: quaternion syncowany w _startLoop

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

    // Zaktualizuj PointLight. ⚠ PRZYPISANIE (nie .copy) jest celowo zachowane:
    // `color` to TEN SAM obiekt co coreMat.uniforms.uColor, więc etap 4 Dysona
    // (fioletowe światło) przemalowuje także tarczę gwiazdy — istniejące,
    // zamierzone zachowanie. Intensywność idzie z bazy (klasa gwiazdy).
    const lightBase = this._starLightBaseline(star);
    this._starLight.color = color;
    this._starLight.intensity = lightBase.intensity;
    this._starLight.position.set(S(star.x), 0, S(star.y));
    // Ambient — ustawiany przy KAŻDEJ gwieździe (nie tylko M/K), inaczej przejście
    // na jaśniejszy układ zostawiłoby chłodne wypełnienie poprzedniego.
    this._applyAmbientForClass(lightBase.ambientCool);
    // ARKUSZ UI poprawka 501 — podłoga zoomu przy gwieździe z promienia TEJ tarczy (`_sunCoreRadius`, z którego powstał
    // rdzeń); przy starcie kontroler jeszcze niewpięty — promień podaje wtedy `setCameraController`.
    this._cameraController?.setStarCoreRadius?.(this._sunCoreRadius);
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
    // Pierścienie to płaski dysk oglądany niemal zawsze pod ostrym kątem —
    // największy zysk z anizotropii w całej scenie (tekstura 512×1 rozciągnięta
    // po całym promieniu; bez niej szczeliny Cassiniego rozmywają się w smugę).
    rTex.anisotropy = this._maxAniso;
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
    // ⚠ Finding 251: materiał, geometria i scena są WSPÓŁDZIELONE między wywołaniami.
    // Dawniej powstawały i były zwalniane per ciało, a material.dispose() kasuje wpis
    // etapu shadera w WebGLShaderCache (usedTimes→0), więc następny materiał z tym samym
    // źródłem dostawał nowy id → nowy programCacheKey → PEŁNA rekompilacja w ANGLE.
    // Ta ścieżka biegnie RAZ NA KAŻDE ciało skaliste/lodowe (planety, księżyce,
    // planetoidy) przy starcie układu — zanim wczytają się tekstury terenu i przejmie
    // je tryb 1 (_rebakePlanetTextures).
    // ⚠ NIE ZWALNIAĆ tego materiału w teardownie per ciało.
    const uniforms = PlanetShader.createBakeUniforms(planet, biomeMap);
    if (!this._planetBakeCtx) {
      const material = new THREE.ShaderMaterial({
        vertexShader:   PlanetShader.bakeVertexShader,
        fragmentShader: PlanetShader.bakeFragmentShader,
        uniforms,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
      this._planetBakeCtx = {
        material, scene,
        cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      };
    } else {
      // Stabilna referencja obiektu uniformów: three czyta materialProperties.uniforms
      // przy każdym uploadzie, więc przepisujemy WARTOŚCI zamiast podmieniać obiekt
      // (podmiana wymagałaby needsUpdate → przebudowy programu). Zbiory kluczy identyczne
      // z konstrukcji — oba z PlanetShader.createBakeUniforms.
      const target = this._planetBakeCtx.material.uniforms;
      for (const key in uniforms) {
        if (target[key]) target[key].value = uniforms[key].value;
      }
    }

    // 4. Fullscreen quad + ortho camera (współdzielone)
    const bakeScene = this._planetBakeCtx.scene;
    const cam       = this._planetBakeCtx.cam;

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

    // 7. Cleanup tymczasowych zasobów GPU (materiał i geometria ZOSTAJĄ — patrz punkt 3)
    rt.dispose();
    biomeMap.dispose();
    // BiomeMap jest per ciało — odepnij zwolnioną teksturę od współdzielonych uniformów
    if (this._planetBakeCtx.material.uniforms.uBiomeMap?.value === biomeMap) {
      this._planetBakeCtx.material.uniforms.uBiomeMap.value = null;
    }

    return tex;
  }

  // ── Przebuduj diffuse tekstury planet po załadowaniu tekstur terenu ────────
  // Async: jedna planeta na klatkę → bez zamrażania UI
  async _rebakePlanetTextures() {
    if (!texturesLoaded()) { this._markTexturesReady(); return; }

    const entries = [...this._planets.entries()]
      .filter(([, e]) => e.planet && e.planet.planetType !== 'gas' && e.mesh?.material?.map);
    const total = entries.length;
    if (total === 0) { window._hideLoadingScreen?.(); this._markTexturesReady(); return; }

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
    this._markTexturesReady();

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
      if (GAME_CONFIG.FEATURES.liveGasShaders) {
        // ŻYWY shader (C1a) — diffuse liczony per-fragment, bez tekstur.
        // OFF → ścieżka bake'u niżej, nietknięta (materiał żywy nie powstaje w ogóle).
        material = GasGiantShader.createLiveGasMaterial(planet);
      } else {
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
      // V3 — GLSL i uniformy mieszkają w AtmosphereShader.js. Literał ścieżki OFF jest
      // przeniesiony CO DO ZNAKU i przypięty sumą SHA-256 w keeperze; wariant żywy stoi
      // OBOK, nie zamiast (three kluczuje cache programów po treści źródła).
      // ⚠ Bramka stoi TUTAJ, u wołającego — wzór liveGasShaders. Przy fladze OFF materiał
      //   żywy NIE POWSTAJE W OGÓLE, a moduł shadera nie musi importować GameConfig.
      const atmoMesh = new THREE.Mesh(
        new THREE.SphereGeometry(r * AtmosphereShader.ATMO_SCALE, 32, 32),
        GAME_CONFIG.FEATURES.dayNightAtmosphere
          ? AtmosphereShader.createLiveAtmosphereMaterial(planet, logDepthOn())
          : AtmosphereShader.createAtmosphereMaterial(planet, logDepthOn())
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
    // ⚠ D-V1k — NIEUTWARDZONY BLIŹNIAK addPlanetMesh (ta sama klasa co Finding 246):
    // paleta żywego materiału jest JEGO własnością, a Material.dispose() nie rusza
    // tekstur, więc bez tej linii każdy update gazowca (kolizja, planet:updated,
    // przywrócenie kontekstu) zostawiałby osieroconą DataTexture.
    GasGiantShader.disposeLiveGasPalette(mesh.material);
    mesh.material.dispose();
    const isGas = planet.planetType === 'gas';
    if (isGas) {
      if (GAME_CONFIG.FEATURES.liveGasShaders) {
        mesh.material = GasGiantShader.createLiveGasMaterial(planet);
      } else {
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
        // Tekstury PBR z loadPlanetTextures są w _textureCache — nie dispose'uj.
        // Paleta żywego gazowca (C1a) jest natomiast WŁASNOŚCIĄ materiału — no-op
        // dla wszystkich pozostałych materiałów.
        GasGiantShader.disposeLiveGasPalette(obj.material);
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
    // ⚠ Finding 246 — NIEUTWARDZONY BLIŹNIAK tego samego wycieku: usunięcie planety
    // (kolizja / wyrzucenie z układu / entity:removed) też zdejmowało linię orbity ze
    // sceny bez zwolnienia zasobów. Rzadsze niż _rebuildAllOrbits, ale ta sama klasa —
    // zostawienie go byłoby miną (wzór: removeColony:667).
    const orb = this._orbits.get(id);
    if (orb) {
      this.scene.remove(orb);
      orb.geometry?.dispose();
      orb.material?.dispose();
      this._orbits.delete(id);
    }

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
    // ARC GALAXY G1 — w trybie galaktyki śledzenie obiektu układu wstrzymane (cel kamery = płyta); po wyjściu wraca.
    // G2-1 — także w trakcie lotu (kamera należy do sterownika lotu).
    if (!this._cameraController || this._galaxyActive || this._galaxyFlight) return;

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
      uniform float uCloudAlpha;
      uniform vec2  uCloudCoverage;
      uniform float uCloudNightFloor;
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
        float cloudMask=smoothstep(uCloudCoverage.x,uCloudCoverage.y,n);
        if(cloudMask<0.01){discard;}
        vec3 toStar=normalize(uLightDir-vWorldPos);
        float rawDiff=dot(vWorldNormal,toStar);
        float diff=max(rawDiff,0.0);
        float lit=0.30+0.70*diff;
        vec3 cloudColor=vec3(0.95,0.97,1.00)*lit;
        float nightFade=smoothstep(-0.15,0.2,rawDiff);
        float fresnel=1.0-max(dot(vNormal,vViewDir),0.0);
        float edgeFade=1.0-pow(fresnel,2.5)*0.5;
        float alpha=cloudMask*uCloudAlpha*edgeFade*(uCloudNightFloor+(1.0-uCloudNightFloor)*nightFade);
        gl_FragColor=vec4(cloudColor,alpha);
      }
    `;
    const mat = new THREE.ShaderMaterial({
      vertexShader:   logDepthOn() ? withLogDepthVertex(cloudVert)   : cloudVert,
      fragmentShader: logDepthOn() ? withLogDepthFragment(cloudFrag) : cloudFrag,
      uniforms: {
        uTime:     { value: 0.0 },
        uLightDir: { value: new THREE.Vector3(0, 0, 0) },
        // V-278 — pokrętła gate'u. Wartości startowe = dzisiejsze literały; _tickClouds
        // przepisuje je z LIVE_CLOUDS co klatkę, więc konsola działa bez rebuildu.
        uCloudAlpha:      { value: LIVE_CLOUDS.ALPHA },
        uCloudCoverage:   { value: new THREE.Vector2(LIVE_CLOUDS.COVERAGE_LO, LIVE_CLOUDS.COVERAGE_HI) },
        uCloudNightFloor: { value: LIVE_CLOUDS.NIGHT_FLOOR },
      },
      // depthTest:true — chmury (sfera 1.025× promienia) są PRZED powierzchnią, więc
      // dalej rysują się nad planetą, ale są prawidłowo ZASŁANIANE przez ciała bliżej
      // kamery (np. tarczę słońca). depthWrite:false — nie blokują innych warstw planety.
      transparent: true, depthWrite: false, depthTest: true, side: THREE.FrontSide,
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
      // ⚠ D-257 — spin geometrii POMIJA żywy shader gazowca. Ten mesh miał DWA
      // niezależne ruchy naraz: ten spin (zegar GRY — staje przy pauzie, +0.003 rad
      // na KLATKĘ, więc tempo zależało od FPS gracza, a nie od czegokolwiek w grze)
      // oraz dryf pasów liczony w shaderze (zegar REALNY, uGasTime). Znaki są
      // PRZECIWNE, więc gracz widział ich RÓŻNICĘ, a pod pauzą czysty shader — stąd
      // wrażenie, że dryf odwraca się przy pauzie (Finding 257). Odwrócenie
      // następowało, gdy 0.1719·fps > OMEGA_DEG, czyli powyżej ~70 fps przy ω=12.
      // ⚠ Bramka stoi na MATERIALE, nie na planetType: ścieżka bake (liveGasShaders
      // OFF) i wszystkie planety skaliste zachowują spin BEZ ZMIAN — tam jest on
      // jedynym ruchem, jaki mają.
      if (!entry.mesh.material?.userData?.gasUniforms) entry.mesh.rotation.y += 0.003;


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
      this._hudRebuildPlanetoidOrbits();
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
      new THREE.LineBasicMaterial({ color: 0x445566, transparent: true }),
    );
    this._hudStyleMoonRing(moon.id, ring);   // ARKUSZ HUD H0 — styl ze stanu: kolor z motywu, krycie × 0,8, filtr orbit
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
    sprite._phase = rendererRandom() * Math.PI * 2;
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

  // Zmienia tryb widoczności orbit: 'all' | 'planets_moons' | 'planetoids'
  setOrbitFilter(mode) {
    this._orbitFilter = mode;
    this._applyOrbitFilter();
  }

  // Aktualizuje widoczność wszystkich orbit wg aktualnego filtra (ARKUSZ HUD H0 — styl ze stanu; „Żadne”: tylko zaznaczona —
  // 511, 3b).
  _applyOrbitFilter() {
    this._hudRestyleOrbits();
  }

  // ── Orbity eliptyczne ─────────────────────────────────────────
  _rebuildAllOrbits() {
    // ⚠ Finding 246: linie były tylko ZDEJMOWANE ze sceny — geometria i materiał
    // zostawały na GPU. Funkcja biegnie co ~180 klatek (~3 s) ORAZ na ośmiu
    // zdarzeniach, więc przy ~9 planetach osierocało to ~9 par geometria+materiał
    // co trzy sekundy przez całą partię.
    // Dispose jest tu BEZPIECZNY — sprawdzone, nie założone: _buildOrbit tworzy oba
    // obiekty ŚWIEŻO per planeta i trzyma je wyłącznie w this._orbits; dwa inne
    // miejsca w tym pliku (_disposeAllMeshes i bliźniaczy _hudRebuildPlanetoidOrbits)
    // disposują dokładnie te same obiekty od dawna. Linie handlu i pierścienie
    // księżyców mają własne geometrie/materiały i własny cykl życia.
    this._orbits.forEach(line => {
      this.scene.remove(line);
      line.geometry?.dispose();
      line.material?.dispose();
    });
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
      new THREE.LineBasicMaterial({ color: 0x003828, transparent: true }),
    );
    this.scene.add(line);
    this._orbits.set(planet.id, line);
    this._hudStylePlanetOrbit(planet, line);   // ARKUSZ HUD H0 — styl ze stanu: kolory z motywu, krycie × 0,8
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

  // Buduje linię orbity jednej planetoidy (styl ze stanu — filtr, zaznaczenie, najechanie)
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
      new THREE.LineBasicMaterial({ color: 0x554433, transparent: true }),
    );
    this.scene.add(line);
    this._planetoidOrbits.set(planetoid.id, line);
    this._hudStylePlanetoidOrbit(planetoid.id, line);   // ARKUSZ HUD H0 — styl ze stanu: kolor z motywu, krycie × 0,8
  }

  // ── ARKUSZ HUD H0 — orbity w kolorach motywu (D-HUD-7, D-HUD-15) ─────────────────────────────────────────
  // Styl KAŻDEJ orbity liczony ze stanu (filtr, zaznaczenie `_selectedEntityId`, najechanie, dom / kolonia, stabilność,
  // czysty widok, chip [O]) i z tokenów motywu (`HudOrbitLogic`). Dawny styl (hexy — ścieżka OFF `hudOrbits`) usunięty w B-Z.

  // Co klatkę (pętla renderu — także w pauzie): klucz = epoka motywu (`applyPreset` / `applyTheme`, np. F7 w trakcie gry)
  // + dom gracza (po wczytaniu zapisu dom ustawia blok odroczony `GameScene` — Finding 510: orbity domu i kolonii widoczne na
  // pauzie bez biegu gry); zmiana klucza ⇒ pełne odświeżenie.
  _syncHudOrbits() {
    const key = hudOrbitSyncKey(themeEpoch(), window.KOSMOS?.homePlanet?.id ?? null);
    // Paczka B (B-3) — chip [O]: zmiana stanu warstwy ⇒ przestylowanie bez przebudowy geometrii (także w pauzie).
    const layerOff = this._hudOrbitsLayerOff?.() === true;
    if (key === this._hudOrbitKey) {
      if (layerOff !== (this._hudOrbitLayerOff === true)) {
        this._hudOrbitLayerOff = layerOff;
        this._hudRestyleOrbits();
      }
      return;
    }
    this._hudOrbitKey = key;
    this._hudOrbitLayerOff = layerOff;
    this._hudRefreshAllOrbits();
  }

  // Paczka B (B-3) — czy chip [O] wyłączył orbity (`uiPrefs.hudLayers.orbits === false`).
  _hudOrbitsLayerOff() {
    return readHudLayers(window.KOSMOS?.uiPrefs).orbits === false;
  }

  // Pełne odświeżenie orbit: planety i planetoidy od zera, pierścienie księżyców przestylowane.
  _hudRefreshAllOrbits() {
    this._rebuildAllOrbits();
    this._hudRebuildPlanetoidOrbits();
    this._hudRestyleMoonRings();
    if (this._cleanView) this._applyCleanViewVisibility(true);   // SHIFT trwa — nowe linie też ukryte
  }

  // Orbity planetoid od zera (styl ze stanu — `_buildPlanetoidOrbit`): co ~180 klatek i przy pełnym odświeżeniu.
  _hudRebuildPlanetoidOrbits() {
    this._planetoidOrbits.forEach((line) => {
      this.scene.remove(line);
      line.geometry?.dispose();
      line.material?.dispose();
    });
    this._planetoidOrbits.clear();
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    EntityManager.getByTypeInSystem('planetoid', sysId).forEach((p) => this._buildPlanetoidOrbit(p));
  }

  // Stan wspólny partii stylowania: filtr, czysty widok, barwy z motywu (liczone raz na partię).
  // Paczka B (B-3) — chip [O] wyłączony = filtr „Żadne” (wybór z menu ☰ nietknięty; orbita zaznaczonego zostaje — 3b).
  _hudOrbitState() {
    const filter = this._hudOrbitsLayerOff?.() === true ? 'none' : this._orbitFilter;
    return { filter, cleanView: this._cleanView === true, palette: orbitPalette() };
  }

  _hudStylePlanetOrbit(planet, line, st = this._hudOrbitState()) {
    const colMgr = window.KOSMOS?.colonyManager;
    applyOrbitStyle(line, planetOrbitStyle({
      ...st,
      isHome: planet.id === window.KOSMOS?.homePlanet?.id,
      isColonized: colMgr ? colMgr.getColony(planet.id) != null : false,
      unstable: planet.orbitalStability < 0.5,
      selected: planet.id === this._selectedEntityId,
      hovered: planet.id === this._hudHoverOrbitId,
    }));
  }

  _hudStyleMoonRing(moonId, ring, st = this._hudOrbitState()) {
    applyOrbitStyle(ring, moonOrbitStyle({ ...st, selected: moonId === this._selectedEntityId }));
  }

  _hudStylePlanetoidOrbit(id, line, st = this._hudOrbitState()) {
    applyOrbitStyle(line, planetoidOrbitStyle({
      ...st,
      selected: id === this._selectedEntityId,
      hovered: id === this._hudHoverOrbitId,
    }));
  }

  _hudRestylePlanetOrbits(st = this._hudOrbitState()) {
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    for (const p of EntityManager.getByTypeInSystem('planet', sysId)) {
      const line = this._orbits.get(p.id);
      if (line) this._hudStylePlanetOrbit(p, line, st);
    }
  }

  _hudRestyleMoonRings(st = this._hudOrbitState()) {
    this._moons.forEach((e, id) => { if (e.ring) this._hudStyleMoonRing(id, e.ring, st); });
  }

  _hudRestylePlanetoidOrbits(st = this._hudOrbitState()) {
    this._planetoidOrbits.forEach((line, id) => this._hudStylePlanetoidOrbit(id, line, st));
  }

  _hudRestyleOrbits() {
    const st = this._hudOrbitState();
    this._hudRestylePlanetOrbits(st);
    this._hudRestyleMoonRings(st);
    this._hudRestylePlanetoidOrbits(st);
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
  // ⚠ Finding 247: funkcja biegła z `physics:updated`, czyli CO KLATKĘ, i BEZWARUNKOWO
  // demontowała chmurę punktów (scene.remove + 2× dispose) zanim w ogóle sprawdziła, czy
  // jest co rysować. Przy `FEATURES.smallBodies=false` (domyślnie) encje nie powstają,
  // więc cała ta praca była jałowa. Teraz wyjścia stoją PRZED demontażem.
  // ⚠ Sprzątanie MUSI zostać osiągalne w obu wyjściach: przy wyłączeniu flagi w locie
  //   albo przejściu do układu bez małych ciał chmura zostałaby w scenie NA ZAWSZE.
  //   Dlatego to `_disposeSmallBodyPoints()` (no-op gdy nie ma czego zwalniać), a nie
  //   goły `return`.
  _syncSmallBodies() {
    if (GAME_CONFIG.FEATURES?.smallBodies === false) { this._disposeSmallBodyPoints(); return; }

    const sbSysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const bodies = [
      ...EntityManager.getByTypeInSystem('asteroid', sbSysId),
      ...EntityManager.getByTypeInSystem('comet', sbSysId),
    ];
    if (!bodies.length) { this._disposeSmallBodyPoints(); return; }

    // Ścieżka szybka: liczba ciał się nie zmieniła → nadpisz bufory W MIEJSCU.
    // Skład może być inny (kometa zginęła, asteroida powstała) — dlatego wypełniamy
    // TAKŻE kolory, nie tylko pozycje.
    const geo   = this._smallBodyPoints?.geometry;
    const pAttr = geo?.getAttribute('position');
    const cAttr = geo?.getAttribute('color');
    if (pAttr && cAttr && pAttr.count === bodies.length) {
      this._fillSmallBodyBuffers(bodies, pAttr.array, cAttr.array);
      pAttr.needsUpdate = true;
      cAttr.needsUpdate = true;
      return;
    }

    // Zmieniła się liczba ciał → pełna przebudowa (rzadka).
    this._disposeSmallBodyPoints();
    const pos = new Float32Array(bodies.length * 3);
    const col = new Float32Array(bodies.length * 3);
    this._fillSmallBodyBuffers(bodies, pos, col);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    this._smallBodyPoints = new THREE.Points(g,
      new THREE.PointsMaterial({ size: 0.3, vertexColors: true }));
    this.scene.add(this._smallBodyPoints);
  }

  // Zwalnia chmurę małych ciał. No-op, gdy nie ma czego zwalniać.
  _disposeSmallBodyPoints() {
    if (!this._smallBodyPoints) return;
    this.scene.remove(this._smallBodyPoints);
    this._smallBodyPoints.geometry.dispose();
    this._smallBodyPoints.material.dispose();
    this._smallBodyPoints = null;
  }

  // Wypełnia bufory pozycji i koloru — JEDNO źródło prawdy dla ścieżki in-place
  // i dla pełnej przebudowy (inaczej obie rozjechałyby się przy zmianie palety).
  _fillSmallBodyBuffers(bodies, pos, col) {
    bodies.forEach((b, i) => {
      const bx = isNaN(b.x) ? 0 : b.x;
      const by = isNaN(b.y) ? 0 : b.y;
      pos[i*3] = S(bx); pos[i*3+1] = 0; pos[i*3+2] = S(by);
      if (b.type === 'comet') { col[i*3]=0.7; col[i*3+1]=0.8; col[i*3+2]=1.0; }
      else { const v = 0.45; col[i*3]=v; col[i*3+1]=v; col[i*3+2]=v; }
    });
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

    // Reset światła do BAZY tej gwiazdy przy każdej zmianie (idempotencja).
    // ⚠ Baza, nie zaszyte 0xfff1de/2.8 — inaczej każda zmiana etapu Dysona
    // kasowała barwę i klasę gwiazdy (patrz _starLightBaseline).
    const base = this._starLightBaseline();
    this._starLight.color.setHex(base.colorHex);
    this._starLight.intensity = base.intensity;

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

    // ── V-261 — pierścienie nie mogą leżeć WEWNĄTRZ tarczy ────────────────────
    // Baza 1.6 to `_getEntityRadius('star')`, czyli promień SPRZED `STAR_CORE_SCALE`.
    // Archeologia: pierścienie (8a26066, 2026-04-07) poprzedzają powiększenie tarczy
    // (a666a07, 2026-07-21) — skala nigdy nie została z tamtą zmianą uzgodniona.
    // Tarcza ma dziś 2,34 (M) … 4,32 (F) WU, więc pierścień etapu 1 (2,40) leży
    // W ŚRODKU tarczy na K, G i F, a etap 2 traci na F oba pierścienie.
    //
    // ⚠ Dziś to jeszcze WIDAĆ — i tylko dlatego, że V-267 pozwala im rysować się PO
    //   tarczy. Po naprawie głębi zniknęłyby CAŁKOWICIE, czyli etap 1 przestałby
    //   istnieć wizualnie na K/G/F. Dlatego ta poprawka wchodzi PRZED naprawą głębi:
    //   żaden commit w sekwencji nie ma prawa nieść tej regresji.
    //
    // ⚠ PODŁOGA, a nie przeskalowanie bazy. Podstawienie `starRadius = tarcza`
    //   (kuszące, bo to jedna linia) mnoży WSZYSTKO: etap 4 na G idzie 6,40 → 14,40 WU,
    //   na F → 17,28, czyli wprost w problem „zajmowały cały ekran", pod który
    //   dobrano `scale` w D3-fix. Podłoga podnosi TYLKO to, co i tak było niewidoczne:
    //   M bez zmian, G outer 6,40 → 6,45, F 6,40 → 7,74.
    //
    // ⚠ Prześwit NIE jest nową magiczną liczbą: to stosunek, w jakim pierścień etapu 4
    //   stoi DZIŚ nad tarczą gwiazdy typu G (4,00 WU wobec 3,60 WU). Bierzemy
    //   najciaśniejszy prześwit, jaki gra już wypuściła i który przeszedł oko.
    const DYSON_CLEARANCE = 4.0 / 3.6;
    // `_sunCoreRadius` jest ustawiane w renderStar PRZED `_starGroup`, a updateStarForDyson
    // wychodzi wcześniej przy `!this._starGroup` — więc na tej ścieżce jest zawsze aktualne.
    const base = Math.max(1.6 * cfg.scale, this._sunCoreRadius * DYSON_CLEARANCE);

    for (let i = 0; i < cfg.rings; i++) {
      const radius = base * (1 + i * 0.3);
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
  // ARKUSZ UI U1-3 (D-UI-5, decyzja 2 a–d): reguła klik/focus (`ClickIntentLogic`) — 1. klik w statek / stację / ciało
  // = zaznaczenie + okno, kamera STOI; 2. klik w ten sam obiekt = focus; wróg: 1. klik ping, 2. klik focus; gwiazda:
  // focus = domyślny widok układu. `mods.ctrl` — CTRL+klik własnego statku przełącza zbiór (robi to scena), bez kamery.
  // JEDEN picker na gest: wynik (`lastClickPick`) czyta `GameScene._handleTacticalLeftClick` w tym samym geście —
  // dawniej scena miała własne pickery (`_getVesselAtScreen` bez preferencji statku najechanego; raycast sceny, który
  // przy kliku obok statku zwracał „pustkę” — zmierzone, U1).
  handleClick(screenX, screenY, mods = {}) {
    // ARC GALAXY G1 (R2) — tryb galaktyki: wybór gwiazdy płyty; pickery trybu układu (statek, stacja, ciała) NIE biegną.
    if (this._galaxyActive) return this._galaxyClick(screenX, screenY);
    const K = window.KOSMOS;
    const env = { K, emit: (name, payload) => EventBus.emit(name, payload) };
    // Obiekt w scenie leży w OGLĄDANYM układzie (scena rysuje tylko jego) — cel kliku bierze ten układ wprost.
    const sys = readClickSelection(K).activeSystemId;
    // Najpierw vessel/wrak — jeśli hover ma ustawiony, klik jest zamiarowy.
    const vid = this._pickVesselForClick(screenX, screenY);
    this.lastClickPick = { vesselId: vid ?? null };
    if (vid) {
      const v = K?.vesselManager?.getVessel?.(vid);
      if (v && isEnemyVessel(v)) {
        clickObject({ type: 'enemy', id: vid, systemId: sys }, env);     // decyzja 2d: ping celu / focus
      } else if (!mods.ctrl) {
        // Własny statek: zaznaczenie robi scena (CTRL, tryb celowania) z TEGO pickera; tu kamera — tylko gdy klik
        // jest DRUGI (statek jest bieżącym zaznaczeniem, lider przy N == 1).
        const target = { type: 'vessel', id: vid, systemId: sys };
        const intent = resolveClickIntent(target, readClickSelection(K));
        if (intent !== CLICK_INTENT.SELECT) applyClickIntent(target, intent, env);
      }
      return true;
    }

    this._mouse.x =  (screenX / window.innerWidth)  * 2 - 1;
    this._mouse.y = -(screenY / window.innerHeight) * 2 + 1;
    this._ray.setFromCamera(this._mouse, this.camera);

    // Stacja orbitalna (mesh nie w _clickable) — PRZED ciałami, bo stacja orbituje blisko planety (klik w stację nie ma
    // zaznaczać planety za nią). S3.3b-S4a. 1. klik = przypięcie stacji (stan `StationPanel`), 2. klik = kamera (`station:focus`).
    if (this._stations.size > 0) {
      const sMeshes = [];
      for (const e of this._stations.values()) if (e.mesh) sMeshes.push(e.mesh);
      const sHits = this._ray.intersectObjects(sMeshes, true); // recursive — child mesh GLB/placeholder
      if (sHits.length > 0) {
        let o = sHits[0].object;
        while (o && !o.userData?.stationId) o = o.parent;      // walk-up do Group z userData
        if (o?.userData?.stationId) {
          const sid = o.userData.stationId;
          this.lastClickPick.object = 'station';   // REFORMA ZAKŁADEK T3 (D-TR-14) — scena: klik stacji nie odznacza statku
          clickObject({ type: 'station', id: sid, systemId: sys }, env);
          return true;
        }
      }
    }

    const hits = this._ray.intersectObjects(this._clickable);
    if (hits.length > 0) {
      const entity = this._entityByUUID.get(hits[0].object.uuid);
      if (entity) {
        this.lastClickPick.object = 'body';     // REFORMA ZAKŁADEK T3 (D-TR-14) — scena: klik ciała nie odznacza statku
        clickObject({ type: 'body', id: entity.id, entity, systemId: sys }, env);
        return true;
      }
    }
    EventBus.emit('body:deselected');
    return false;
  }

  // ARKUSZ UI U1-3 — picker statku dla kliku: najechany statek, inaczej najbliższy w promieniu 40 px; wyłącznie sprite'y
  // WIDOCZNE (wróg ukryty mgłą wojny nie jest celem kliku — ping / kamera zdradzałyby jego położenie).
  // ARKUSZ UI U3-2 (Finding 487): kursor NA TARCZY ciała — statek wygrywa tylko w obrębie RDZENIA swojego sprite'a
  // (`_vesselCorePickPx`; nie 40 px i nie „najechany” z 28 px), reszta tarczy należy do ciała. Poza tarczami — bez zmian.
  _pickVesselForClick(sx, sy) {
    if (this._isOnBodyDisc?.(sx, sy)) return this._getVesselAtScreen?.(sx, sy, VESSEL_CORE_PICK_PX, true, true) ?? null;
    const hv = this._hoverVesselId;
    if (hv && this._vessels.get(hv)?.sprite?.visible) return hv;
    return this._getVesselAtScreen?.(sx, sy, 40, true) ?? null;
  }

  // ARKUSZ UI U1-3 (decyzja 2d) — pierwszy klik we wrogi statek: ping celu, kamera stoi; ping zapamiętany jako
  // „bieżące zaznaczenie” wroga (wroga nie da się zaznaczyć — `addToSelection` go odrzuca), więc drugi klik = focus.
  // Pamięć gaśnie przy każdym innym zaznaczeniu (statek, ciało, stacja, odznaczenie) i zmianie układu.
  pingEnemyTarget(vesselId) {
    if (!vesselId) return;
    this.pingVessel(vesselId);
    this._pingedEnemyId = vesselId;
  }

  // S4-2 — pozycja stacji na ekranie (px) — dawniej dla pływającego panelu stacji (usunięty w REFORMIE ZAKŁADEK T4)
  // i plakietek stacji `MapLabelLayer` (usunięte w ARKUSZU HUD B-Z); dziś dla etykiet CTRL (`getAllVisibleLabels`).
  // Zwraca null, gdy stacja za kamerą (NDC z poza [-1,1]) — wtedy etykieta się nie rysuje.
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

  // B1 (W2.1): epoka ruchu kamery — UIManager odświeża overlay 2D (etykiety + ramki selekcji)
  // co klatkę, gdy ta wartość rośnie (kamera w ruchu). 0 gdy kontroler niepodpięty (headless).
  getCameraMoveEpoch() {
    return this._cameraController?.moveEpoch ?? 0;
  }

  // ── ARKUSZ HUD H1 (D-HUD-1 (a)) — odczyty dla warstwy HUD 2D (`HudLayer`); rzut liczy czysty `HudProjection` ──────
  // Widok kamery: macierze (kolumnowe — kopie `Matrix4.elements`), FOV, okno (px CSS), skala świata (j. na 1 AU).
  // `updateMatrixWorld` — macierz widoku aktualna także wtedy, gdy pętla HUD biegnie przed renderem tej klatki.
  getHudView() {
    const cam = this.camera;
    if (!cam) return null;
    cam.updateMatrixWorld();
    return {
      view: cam.matrixWorldInverse.elements.slice(),
      proj: cam.projectionMatrix.elements.slice(),
      fovDeg: cam.fov,
      cssW: window.innerWidth,
      cssH: window.innerHeight,
      worldPerAU: AU / WORLD_SCALE,
      worldPerLY: this._galaxyK ?? null,   // ARC GALAXY G1 (S1) — skala płyty galaktyki [j. / ly]
    };
  }

  // Środek ciała w świecie (j.) i promień tarczy (j.; 0 — stacja) — planeta, księżyc, planetoida, gwiazda, stacja.
  getBodyWorldInfo(entityId) {
    if (!entityId) return null;
    let obj = null, mesh = null;
    const pe = this._planets.get(entityId);
    if (pe) { obj = pe.group; mesh = pe.mesh; }
    if (!obj) { const me = this._moons.get(entityId);      if (me) obj = mesh = me.mesh; }
    if (!obj) { const ae = this._planetoids.get(entityId); if (ae) obj = mesh = ae.mesh; }
    if (!obj) { const se = this._stations.get(entityId);   if (se?.mesh) obj = se.mesh; }
    if (!obj && this._starGroup) {
      const star = EntityManager.getByType('star')?.[0];
      if (star && star.id === entityId) { obj = this._starGroup; mesh = this._starCore ?? null; }
    }
    if (!obj) return null;
    const tmp = this._tmpHudVec ?? (this._tmpHudVec = new THREE.Vector3());
    obj.getWorldPosition(tmp);
    const out = { x: tmp.x, y: tmp.y, z: tmp.z, r: 0 };
    const g = mesh?.geometry;
    if (g) {
      if (!g.boundingSphere) g.computeBoundingSphere();
      const ws = mesh.getWorldScale(tmp);
      out.r = (g.boundingSphere?.radius ?? 0) * Math.max(ws.x, ws.y, ws.z);
    }
    return out;
  }

  // Pozycja sprite'a statku w świecie (j.) — `null`, gdy statek nie ma sprite'a (inny układ, zadokowany).
  getVesselWorldPosition(vesselId) {
    const sp = this._vessels.get(vesselId)?.sprite;
    if (!sp) return null;
    const tmp = this._tmpHudVec ?? (this._tmpHudVec = new THREE.Vector3());
    sp.getWorldPosition(tmp);
    return { x: tmp.x, y: tmp.y, z: tmp.z };
  }

  // ARKUSZ HUD paczka A — środek sprite'a statku (j.) i promień jego modelu (j.): połowa rozmiaru docelowego × skala świata
  // wrappera — ten sam rachunek co rdzeń kliku (`_vesselCorePickPx`). `null` bez sprite'a. Etykiety HUD (prześwit nitki) i karta
  // statku z boku modelu (493).
  getVesselWorldInfo(vesselId) {
    const sp = this._vessels.get(vesselId)?.sprite;
    if (!sp) return null;
    const tmp = this._tmpHudVec ?? (this._tmpHudVec = new THREE.Vector3());
    sp.getWorldPosition(tmp);
    const out = { x: tmp.x, y: tmp.y, z: tmp.z, r: 0 };
    const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    const ws = sp.getWorldScale?.(this._tmpPickScale ?? (this._tmpPickScale = new THREE.Vector3()));
    if (v && ws) out.r = (vesselTargetSize(v) / 2) * Math.max(ws.x, ws.y, ws.z);
    return out;
  }

  // ARC CV-6a — kierunek DZIOBU statku w świecie (jednostkowy) z macierzy sprite'a: rama kanoniczna (`entry.canonical`, CV-1a) —
  // dziób w lokalnym +Z, ścieżka OFF / billboard — dziób w lokalnym −X (dawna orientacja modeli). Choreografia (kurs, pochylenie)
  // jest w macierzy, więc to kurs RYSOWANY. `null` bez sprite'a albo dla billboardu (bez modelu — kurs nieznany).
  /** ARC CV-7 — kamera reżysera (chip paska walki, `KOSMOS.debug.cvDirector` / `directorInfo` / `cv916` / `cvCapture`). */
  get cvDirector() { return this._cvDir; }

  getVesselBowWorld(vesselId) {
    const e = this._vessels.get(vesselId);
    const sp = e?.sprite;
    if (!sp || !e.isModel3D) return null;
    sp.updateMatrixWorld?.();
    const m = sp.matrixWorld?.elements;
    if (!m) return null;
    const x = e.canonical ? m[8] : -m[0], y = e.canonical ? m[9] : -m[1], z = e.canonical ? m[10] : -m[2];
    const l = Math.hypot(x, y, z);
    return l > 1e-9 ? { x: x / l, y: y / l, z: z / l } : null;
  }

  // ARKUSZ HUD paczka A (493) — środek stacji (j.) i promień jej modelu (j.; sfera prostopadłościanu modelu w świecie,
  // liczona raz na model — stacja nie obraca się; placeholder → GLB przelicza). `null`, gdy stacji nie ma w scenie.
  getStationWorldInfo(stationId) {
    const e = this._stations.get(stationId);
    if (!e?.mesh) return null;
    const tmp = this._tmpHudVec ?? (this._tmpHudVec = new THREE.Vector3());
    e.mesh.getWorldPosition(tmp);
    const out = { x: tmp.x, y: tmp.y, z: tmp.z, r: 0 };
    if (e._hudR == null || e._hudRModel !== e.isModel3D) {
      const box = new THREE.Box3().setFromObject(e.mesh);
      const sph = box.isEmpty() ? null : box.getBoundingSphere(new THREE.Sphere());
      e._hudR = sph && Number.isFinite(sph.radius) ? sph.radius : 0;
      e._hudRModel = e.isModel3D;
    }
    out.r = e._hudR;
    return out;
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
    // ARC CV-6a, decyzja właściciela 46 (1) — uczestników bitwy w widoku nazywa przy CTRL warstwa taktyczna (przy ich ikonach, rozkład bez
    // kupy); tu ich pomijamy. Flaga OFF — etykiety CTRL jak dziś.
    const tacPart = this._stageParticipants;   // ARC CV-6a — uczestnicy bitwy w widoku: nazwy przy ikonach warstwy taktycznej
    for (const [id, entry] of this._vessels) {
      if (tacPart?.has?.(id)) continue;
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
    // ARC GALAXY G1 (R2) — tryb galaktyki: najechanie gwiazdy płyty; raycast ciał i picker statków NIE biegną.
    if (this._galaxyActive) { this._galaxyHover(screenX, screenY); return; }
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
      // REFORMA ZAKŁADEK T1 (D-TR-2 (a)) / T4 — statek opisuje rozwinięcie etykiety HUD; podpowiedź DOM statku usunięta.
      this._hideColonyTooltip();
      return;
    }
    if (this._hoverVesselId) {
      this._hoverVesselId = null;
    }

    // Tooltip — aktywny tylko przy bliskim zoomie i gdy overlay NIE jest otwarty
    const focusId = this._selectedEntityId;   // U1-2: zaznaczenie (nie cel kamery)
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

    // Kolonię opisuje rozwinięcie etykiety HUD (REFORMA ZAKŁADEK T1, 533); podpowiedź DOM kolonii usunięta w T4 — z elementu
    // `#colony-3d-tooltip` korzysta już tylko podpowiedź budynku (K3) wyżej.
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
    if (b.jobs) html += `<br>👤 ${b.jobs} POP`;
    if (b.housing) html += `<br>🏠 +${b.housing} housing`;

    this._showColonyTooltipEl(html, sx, sy);
  }

  // ARKUSZ UI U3-2 (Finding 487) — czy punkt ekranu leży na WIDOCZNEJ tarczy ciała. Raycast `_clickable` (planety,
  // księżyce, planetoidy — ich siatki to tarcze); gwiazda ma tam niewidoczną sferę klikalną 2,5× większą od tarczy, więc
  // dla gwiazdy liczy się wyłącznie jej rdzeń (`_starCore`).
  _isOnBodyDisc(sx, sy) {
    const ent = this.getEntityAtScreen?.(sx, sy);
    if (!ent) return false;
    if (ent.type !== 'star') return true;
    return !!this._starCore && this._ray.intersectObject(this._starCore, false).length > 0;
  }

  // ARKUSZ UI U3-2 (Finding 487) — promień rdzenia sprite'a statku w px ekranu: połowa rozmiaru docelowego modelu
  // (`vesselTargetSize` — największy wymiar po normalizacji, × skala świata wrappera) w rzucie perspektywicznym; nie
  // mniej niż `VESSEL_CORE_PICK_PX` (model w typowym kadrze ma 1–3 px).
  _vesselCorePickPx(vesselId, obj, viewportH) {
    const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    const cam = this.camera;
    if (!v || !obj || !cam?.fov || !cam.position) return VESSEL_CORE_PICK_PX;
    const ws = obj.getWorldScale?.(this._tmpPickScale ?? (this._tmpPickScale = new THREE.Vector3()));
    const scale = ws ? Math.max(ws.x, ws.y, ws.z) : 1;
    const pos = obj.getWorldPosition?.(this._tmpPickPos ?? (this._tmpPickPos = new THREE.Vector3()));
    const dist = pos ? cam.position.distanceTo(pos) : 0;
    if (!(dist > 0)) return VESSEL_CORE_PICK_PX;
    const pxPerUnit = (viewportH / 2) / (dist * Math.tan((cam.fov * Math.PI / 180) / 2));
    return Math.max(VESSEL_CORE_PICK_PX, (vesselTargetSize(v) / 2) * scale * pxPerUnit);
  }

  // Screen-space picking statków: rzutuj pozycję wrapera/sprite na ekran
  // i zwróć vesselId najbliższego w promieniu thresholdPx. Bez modyfikacji sceny.
  // `coreOnly` (U3-2, Finding 487): promień per statek = rdzeń jego sprite'a (`_vesselCorePickPx`), nie mniej niż próg.
  _getVesselAtScreen(sx, sy, thresholdPx = 28, visibleOnly = false, coreOnly = false) {
    if (!this._vessels || this._vessels.size === 0) return null;
    const canvas = this.renderer?.domElement;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const cw = rect.width, ch = rect.height;
    const tmp = this._tmpPickVec ?? (this._tmpPickVec = new THREE.Vector3());
    let best = null;
    let bestDist = coreOnly ? Infinity : thresholdPx * thresholdPx;
    for (const [vid, entry] of this._vessels) {
      const obj = entry?.sprite;
      if (!obj || (visibleOnly && !obj.visible)) continue;   // U1-3: klik — tylko widoczne
      obj.getWorldPosition(tmp);
      tmp.project(this.camera);
      // Poza frustum (głównie: za kamerą) — pomiń
      if (tmp.z < -1 || tmp.z > 1) continue;
      const vx = (tmp.x * 0.5 + 0.5) * cw + rect.left;
      const vy = (-tmp.y * 0.5 + 0.5) * ch + rect.top;
      const dx = vx - sx;
      const dy = vy - sy;
      const d2 = dx * dx + dy * dy;
      if (coreOnly) {
        const lim = Math.max(thresholdPx, this._vesselCorePickPx?.(vid, obj, ch) ?? thresholdPx);
        if (d2 > lim * lim) continue;
      }
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

  // ── DOM tooltip element (podpowiedź budynku K3 — podpowiedzi kolonii i statku usunięte w REFORMIE ZAKŁADEK T4) ──
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

  // ── Cinematic intro (start nowej gry) ──────────────────────────
  // Driver kamery per-frame — GameScene rejestruje fn(nowMs) wołaną w pętli
  // renderowania TUŻ PRZED cameraController.update() (własny dt; lerpy kontrolera
  // driver neutralizuje przez _targetDist/_goalTarget). null = brak lotu.
  setCinematicDriver(fn) { this._cinematicDriver = fn; }

  // Sygnał gotowości tekstur planet — rozwiązywany w _rebakePlanetTextures na
  // WSZYSTKICH wyjściach. Intro czeka na to (z 6 s backstopem w GameScene) przed
  // lotem, żeby planeta nie zmieniała tekstury w trakcie zbliżenia (recon F17.1).
  whenTexturesReady() { return this._texturesReady; }
  _markTexturesReady() {
    if (this._texturesReadyResolved) return;
    this._texturesReadyResolved = true;
    this._resolveTexturesReady?.();
  }

  // ── SHIFT „czysty widok" (cinematic) ──────────────────────────
  // Ukrywa nakładki 3D (linie orbit/tras/handlu, pierścienie sensorów, stożki
  // predykcji, markery wroga, glify taktyczne), zostawiając gwiazdę, planety,
  // księżyce, planetoidy i modele statków. Dekoracyjne pierścienie planet są
  // dziećmi grupy planety → nietknięte. Wywoływane przez GameScene przy Shift.
  setCleanView(active) {
    active = !!active;
    if (this._cleanView === active) return;
    this._cleanView = active;
    // active=true → ukryj; false → przywróć widoczność (syncy skorygują fog-edge
    // na najbliższym zdarzeniu detekcji).
    this._applyCleanViewVisibility(active);
  }

  _applyCleanViewVisibility(hidden) {
    // Cache oryginalnej widoczności w userData._cvVis: orbity/pierścienie mają
    // widoczność zależną od filtra/focusu (nie zawsze true), więc na wyjściu
    // MUSIMY przywrócić stan sprzed ukrycia, nie ślepe true. Obiekty odtwarzane
    // co klatkę (nowy Line/Sprite) dostają świeży _cvVis przy pierwszym ukryciu.
    const each = (obj) => {
      if (!obj) return;
      if (hidden) {
        if (obj.userData._cvVis === undefined) obj.userData._cvVis = obj.visible;
        obj.visible = false;
      } else if (obj.userData._cvVis !== undefined) {
        obj.visible = obj.userData._cvVis;
        delete obj.userData._cvVis;
      } else {
        obj.visible = true;
      }
    };
    for (const [, line] of this._orbits)              each(line);
    for (const [, line] of this._planetoidOrbits)     each(line);
    for (const [, e] of this._moons)                  each(e?.ring);
    for (const [, sp] of this._tacticalOrbitMarkers)  each(sp);
    for (const line of this._tradeLines)              each(line);
    for (const f of this._tradeFireflies)             each(f?.sprite);
    for (const [, e] of this._predictionConeMeshes)   each(e?.group);
    for (const [, sp] of this._enemyAlertMarkers)     each(sp);
    for (const [, sp] of this._tacticalGlyphs)        each(sp);
    // ARKUSZ HUD H0 — widoczność orbit po wyjściu z czystego widoku liczona z preferencji (filtr, zaznaczenie, najechanie),
    // nie z `_cvVis`: linie przebudowane w trakcie SHIFT nie mają `_cvVis` i wracałyby wszystkie.
    if (!hidden) this._hudRestyleOrbits();
  }

  // ── Pętla renderowania ────────────────────────────────────────
  _startLoop() {
    // ARC CV-8b — bramka `_renderingEnabled` (BattleView3D zawieszał główną scenę na czas kina) wycofana razem z kinem.
    const loop = () => {
      requestAnimationFrame(loop);

      // Pomiń rendering gdy kontekst WebGL utracony
      if (this._contextLost) return;

      try {
        if (this._fxStatsRun) this._fxStatsBegin();   // ARC CV-2a — pomiar fxStats (wyłącznie w trakcie pomiaru)
        const t = this._clock.getElapsedTime();
        this._frameNo++;   // POLISH P2b — klatka pętli renderu (pamięć środka uczestników starcia na jedną klatkę)
        // ARC CV-7 — mnożnik tempa prezentacji tej klatki (spowolnienie bohatera / doganianie) PRZED tikami obu zegarów prezentacji.
        this._cvDir?.tickWarp(performance.now());

        // Aktualizuj migotanie gwiazd tła
        if (this._starTwinkleUniform) this._starTwinkleUniform.value = t;

        // Korona gwiazdy — billboard + oddech.
        // ⚠ Obrót rdzenia NIE JEST już tutaj: przeniesiony do _tickClouds, jedynego
        //   miejsca w tym pliku, gdzie krok czasu jest ZMIERZONY (V-260).
        if (this._starCorona) {
          // Billboard — plane zawsze frontem do kamery (group ma tylko pozycję, bez rotacji)
          this._starCorona.quaternion.copy(this.camera.quaternion);
          // Delikatne „oddychanie" jasności korony (±3%).
          // ⚠ Faza jest AKUMULOWANA w _tickClouds, a NIE brana z this._clock (U6).
          //   THREE.Clock zwraca POZYCJĘ na osi czasu ściennego i liczy dalej, gdy pętla
          //   stoi — a stoi przy utracie kontekstu (do CV-8b także przez całe kino
          //   BattleView3D). Po powrocie oddech przeskakiwałby o długość przerwy.
          //   Dla samego sinusa to drobiazg, ale smugi korony jadą na tej samej rodzinie
          //   faz i tam skok jest widoczny jako cięcie. Jedna rodzina, jeden zegar.
          const gU = this._starCorona.material.uniforms?.uGain;
          const base = this._starCorona.material.userData._baseGain;
          if (gU && base !== undefined) {
            gU.value = base * (1 + Math.sin(this._sunBreathPhase) * SunShader.LIVE_SUN.BREATH_AMP);
          }
        }

        // Podgląd obserwatorium — twardy lock kamery na ciele co klatkę (przed update, bez lerp-lag).
        if (this._observatoryPreviewActive) this._updateCameraFocus();

        // Cinematic intro — driver kamery tuż PRZED update kontrolera (własny dt).
        // Pętla łyka wyjątki (catch niżej), więc izolujemy driver i wyłączamy przy błędzie,
        // żeby jeden zły frame nie zablokował gracza w zamrożonej kamerze.
        if (this._cinematicDriver) {
          try { this._cinematicDriver(performance.now()); }
          catch (err) {
            console.error('[ThreeRenderer] Cinematic driver error:', err);
            this._cinematicDriver = null;
          }
        }

        // POLISH P2a (CP13) — „Obserwuj”: cel i dystans kamery z kadru walki (co klatkę, także w pauzie gry).
        // POLISH P2b (D3, Finding 461) — płynne zbliżenie uczestników oglądanego starcia, PRZED kamerą i efektami (kadr
        // „Obserwuj”, auto-fokus, końce smug i paski HP czytają pozycje sprite'ów z tej klatki).
        this._unstageVessels();          // ARC CV-3a1 — sprite'y sceny na pozycje bez sceny (piszą je ruch płynny i orbity)
        this._tickCombatGlide();
        this._tickBattleStage();         // ARC CV-3a1 — scena bitwy: pozycje rysowane (prawo sceny × zoom semantyczny)
        // ARC CV-7 — kamera reżysera: przejęcie przez gracza (stan kontrolera ≠ ostatni zapis), harmonogram, kadr, strażnicy, zapis.
        this._cvDir?.tickCamera();
        // ARC GALAXY G1 — w trybie galaktyki kamera należy do płyty: „Obserwuj” i auto-fokus starcia wstrzymane (wracają po wyjściu).
        if (this._watch && !this._galaxyActive && !this._galaxyFlight) this._updateWatchCamera();
        // POLISH P2b (D1, Finding 467) — auto-fokus starcia: cel śledzi środek walki (co klatkę, także w pauzie gry).
        if (this._autoFocus && !this._galaxyActive && !this._galaxyFlight) this._updateAutoFocusCamera();

        // Aktualizuj kamerę (płynny zoom + orbit)
        if (this._cameraController) this._cameraController.update();
        this._syncCombatViewOffset();    // ARC CV-3a1 (Finding 643) — kompozycja kadru walki przesunięciem ekranowym
        this._cvDir?.applyShake();       // ARC CV-7 — wstrząs kamery (wyłącznie prezentacja; następna klatka liczy kamerę od nowa)

        // NIEBO (D-GX-4) — kopuła nieba jedzie z kamerą (obraz nieba zależy tylko od ORIENTACJI — ciągły z konstrukcji);
        // pokrętła nieba co klatkę (przeliczenie tylko przy zmianie). `_sky` = null tylko przed zbudowaniem kopuły.
        if (this._sky) { this._sky.group.position.copy(this.camera.position); this._tickSky(); }
        // ARC GALAXY G1 — płyta: rozjaśnienie po wejściu (0,25 s), pokrętła `galaxyTuning`, oddech punktów (G2 — także w locie,
        // terytorium, aureole, słupki).
        if (this._galaxyActive || this._galaxyFlight) this._tickGalaxyPlate(t);

        // Animacja świetlików handlowych
        if (this._tradeFireflies.length > 0) this._animateTradeFireflies(t);

        // Ikony budynków na planecie (visibility + pulsowanie)
        const camDist = this._cameraController?._dist ?? 100;
        this._colonyMarkers.tick(0.016, camDist);

        // Animacja chmur — niezaleznie od pauzy gry (real-time)
        this._tickClouds();
        this._tickGasMaterials();        // C1a — uDetail + kierunek światła żywych gazowców
        this._tickSunMaterials();        // S1 — drabina gwiazdy (bramkowane liveSunShader)
        this._tickAtmoMaterials();       // V3/A0 — siła powłoki atmosfery (bramkowane dayNightAtmosphere)
        this._syncHudOrbits();           // ARKUSZ HUD H0 — orbity w kolorach motywu: epoka motywu, dom (510), chip [O]

        // Fleet Command Console — drenuj efemeryczne FX (real-time) + pierścienie selekcji + znaczniki starć + kometa trasy
        this._updateActiveEffects(performance.now());
        this._tickCvFx();                // ARC CV-2a — zegar prezentacji + silnik FX walki (flaga OFF i nic w locie — nic)
        this._tickCvModels();            // ARC CV-1a — pokrętła modeli do uniformów maski i puli świateł (flaga OFF bez puli — nic)
        this._tickGfx();                 // ARC CV-2b — preset jakości: dławienie w walce, obwiednia świateł puli (flaga OFF — tylko porównanie)
        // Fix#4: 3D pierścień selekcji USUNIĘTY (za duży/obscuring) — wskaźnik = ramki 2D
        // (UIManager._drawSelectionBrackets, screen-constant, widoczne z daleka).
        // ARC CV-3a1 (Finding 642) / CV-6b2 / CV-Z — pierścień starcia usunięty: bitwę oznacza scena, pasek walki i znak warstwy taktycznej.
        this._syncCombatReveal();        // POLISH P2a (CP17) — koniec starcia z graczem: widoczność wg wywiadu
        // _tickEngineTrails USUNIĘTE — zastąpione stożkiem wydechu (_applyExhaust).
        // Stary trail spawnował zieloną additive-kulę w środku statku (kolor frakcji).
        // POLISH P2a (CP14) — macierz widoku z TEJ klatki (kontroler właśnie przestawił kamerę; render przelicza ją dopiero
        // później): limit rozmiaru ekranowego pasków HP i celownika wroga bez opóźnienia o klatkę. Dawniej na początku
        // `_syncInsignia` — insygnia frakcji usunięte (ZNACZNIK STATKU SM-Z: znacznik statku rysuje warstwa HUD 2D).
        this.camera.updateMatrixWorld();
        this._syncEnemyAlertMarkers();   // pulsujący czerwony marker wykrytego wroga (≥rumor)
        this._syncTacticalGlyphs();      // F2 tryb Y — glify-billboardy (no-op poza trybem)
        this._syncBodyScanVeil();        // reforma obserwatorium — szara zasłona niezbadanego ciała w podglądzie
        this._syncHud3dColors();         // ARKUSZ HUD paczka B (D-HUD-16) — kolory 3D w rolach motywu (nowe i po zmianie motywu)

        // SHIFT „czysty widok" — po WSZYSTKICH syncach (część odtwarza obiekty co klatkę)
        // wymuś ukrycie linii/pierścieni/glifów, zostaw gwiazdę, planety i modele statków.
        if (this._cleanView) this._applyCleanViewVisibility(true);

        // Pipeline HDR: Render → Bloom(próg 1.0) → OutputPass (ACES+sRGB).
        // Fallback: bezpośredni render gdy composer padł (ACES aplikuje renderer, brak bloomu).
        // ARC GALAXY G2-1 — w trakcie lotu obiekty układu gasną TYLKO na czas renderu (cofnięte zaraz po nim).
        const undoFlight = this._galaxyFlight ? this._applyFlightFade() : null;
        try {
          if (this._composer) this._composer.render();
          else this.renderer.render(this.scene, this.camera);
        } finally {
          if (undoFlight) undoFlight();
        }
        // ARC CV-7 — nagrywarka rolek (F10): kopia klatki płótna 3D TUŻ PO renderze (bufor WebGL ważny w tym samym zadaniu).
        this._cvDir?.reel?.onFrame();
        if (this._fxStatsRun) this._fxStatsEnd();     // ARC CV-2a — po pełnej klatce (wszystkie przebiegi composera)
      } catch (err) {
        console.error('[ThreeRenderer] Render loop error:', err);
      }
    };
    loop();
  }

  // Żywe gazowce (C1a) — dwa uniformy odświeżane co klatkę, niezależnie od pauzy gry:
  //  · uGasLightDirView — kierunek do gwiazdy w przestrzeni WIDOKU; bramkuje rim
  //    (N·L), żeby świeciła wyłącznie oświetlona krawędź tarczy.
  //  · uGasDetail — drabina 0/1/2 wg ŚREDNICY TARCZY NA EKRANIE (nie wg samego
  //    dystansu): px = 2r · (H/2) / (d · tan(fov/2)).
  // Koszt: per gazowiec 1 distanceTo (sqrt) + sub/normalize/transformDirection
  // (~20 flopów) + kilka skalarów. Przy 1-3 gazowcach w układzie to szum pomiarowy;
  // pętla i tak przechodzi po this._planets tuż obok (_tickClouds).
  _tickGasMaterials() {
    if (!GAME_CONFIG.FEATURES.liveGasShaders) return;
    const cam = this.camera;
    if (!cam) return;

    const halfH   = (window.innerHeight || 720) / 2;
    const tanHalf = Math.tan(((cam.fov ?? 55) * Math.PI / 180) / 2);
    const starPos = this._starGroup ? this._starGroup.position : null;
    const T = GasGiantShader.LIVE_GAS;

    for (const [, entry] of this._planets) {
      const u = entry.mesh?.material?.userData?.gasUniforms;
      if (!u) continue;

      if (starPos) {
        _GAS_LIGHT_DIR.copy(starPos).sub(entry.group.position).normalize()
          .transformDirection(cam.matrixWorldInverse);
        u.uGasLightDirView.value.copy(_GAS_LIGHT_DIR);
      }

      // Strojenie ruchu czytane z LIVE_GAS KAŻDEJ klatki — to jest ta ścieżka, dzięki
      // której gate zmienia ω jednym tokenem w konsoli i widzi efekt bez restartu.
      u.uGasOmega.value      = T.OMEGA_DEG * Math.PI / 180;
      u.uGasOmegaShear.value = T.OMEGA_SHEAR;
      u.uGasStormMotion.value.set(T.STORM_BREATH, T.STORM_BREATH_HZ, T.STORM_SPIN);

      const dist = cam.position.distanceTo(entry.group.position);
      const r    = entry.mesh.geometry?.parameters?.radius ?? 1;
      const px   = 2 * r * halfH / Math.max(dist * tanHalf, 1e-4);
      const lvl  = px >= T.DETAIL_PX_FULL ? 2 : (px >= T.DETAIL_PX_MED ? 1 : 0);
      u.uGasDetail.value = Math.min(lvl, T.DETAIL_CAP);
    }
  }

  // ── V3 / A0: księgowość powłoki atmosfery (lustro _tickGasMaterials) ────────
  // ⚠ Ta funkcja NIGDY nie liczy dt. Atmosfera nie ma animacji, a dekret C1b („krok
  //   czasu ma JEDNO miejsce", _tickClouds) zostaje nietknięty.
  // ⚠ Stoi w PĘTLI RENDEROWANIA, a nie w _syncPlanetMeshes, i to jest cała decyzja
  //   D-V3j: _syncPlanetMeshes biegnie z physics:updated, czyli STOI PRZY PAUZIE — gate
  //   przekręciłby pokrętło, nie zobaczył zmiany i wyciągnął wniosek o czymś innym
  //   (dokładnie awaria PROM_DRIFT z re-gate'u S4). Zapis uLightDir zostaje tam, gdzie
  //   był (_syncPlanetMeshes): kierunek światła zmienia się tylko wtedy, gdy ciała się
  //   poruszają, i ten zapis jest sprzed slice'u, więc stoi POZA flagą.
  // ⚠ Wszystkie dziewięć pokręteł czytane jest KAŻDEJ klatki — to jest cały kontrakt
  //   „jeden token w konsoli": KOSMOS.threeRenderer.atmoTuning.STRENGTH = 0.1 przygasza
  //   pierścień natychmiast i globalnie, bez restartu i bez rebuildu materiału.
  _tickAtmoMaterials() {
    if (!GAME_CONFIG.FEATURES.dayNightAtmosphere) return;
    const cam = this.camera;
    if (!cam) return;

    const vh  = window.innerHeight || 720;
    const fov = cam.fov ?? 55;
    const T   = AtmosphereShader.LIVE_ATMO;

    for (const [, entry] of this._planets) {
      for (const child of entry.group.children) {
        if (!child.userData.isAtmosphere) continue;
        const u = child.material?.uniforms;
        if (!u?.uStrength) continue;
        u.uStrength.value = atmoStrengthFor(entry.planet?.atmosphere, T);
        // Średnica tarczy [CSS px] — REUSE sunDiscPx, a nie trzecia kopia tego wzoru.
        // Konsument (discFade, D-V3f) dochodzi w A1; tutaj karmi wyłącznie przyrząd
        // KOSMOS.debug.atmoInfo(), żeby gate widział POLICZONE liczby o commit
        // wcześniej, niż cokolwiek od nich zależy (wzór getSunInfo z S1).
        const px = sunDiscPx({
          radiusWorld:      entry.mesh?.geometry?.parameters?.radius ?? 1,
          distance:         cam.position.distanceTo(entry.group.position),
          viewportHeightPx: vh,
          fovDeg:           fov,
        });
        child.userData.atmoDiscPx = px;

        // ⚠ Pozostałe cztery pokrętła istnieją TYLKO w wariancie żywym. Guard nie jest
        //   ozdobą: flagę da się przełączyć w konsoli PO zbudowaniu materiałów, a wtedy
        //   ta pętla trafia na materiał ścieżki OFF, który ma dokładnie trzy uniformy.
        if (!u.uTermWidth) continue;
        u.uTermWidth.value   = T.TERM_WIDTH;
        u.uTwilightMix.value = T.TWILIGHT_MIX;
        u.uNightFloor.value  = T.NIGHT_FLOOR;
        u.uDiscFade.value    = discFade(px, T.FADE_PX_LO, T.FADE_PX_HI);
      }
    }
  }

  // ── V3 / A0: przyrząd gate'u — KOSMOS.debug.atmoInfo() ──────────────────────
  // ⚠ Wzór getSunInfo: przy fladze OFF _tickAtmoMaterials w ogóle nie biegnie, więc
  //   discPx jest NIEAKTUALNE. Zwracamy null zamiast starej liczby — przyrząd, który
  //   nie odróżnia „nie zmierzono" od „zmierzono", jest gorszy niż brak przyrządu.
  //   uStrength czytane jest ze ŻYWEGO uniformu, więc jest ważne niezależnie od flagi.
  getAtmoInfo() {
    const flag = !!GAME_CONFIG.FEATURES.dayNightAtmosphere;
    const T = AtmosphereShader.LIVE_ATMO;
    const shells = [];
    for (const [id, entry] of this._planets) {
      for (const child of entry.group.children) {
        if (!child.userData.isAtmosphere) continue;
        const klasa = entry.planet?.atmosphere ?? '?';
        shells.push({
          planeta:   entry.planet?.name ?? id,
          klasa,
          zywy:      !!child.material?.uniforms?.uTermWidth,
          uStrength: child.material?.uniforms?.uStrength?.value ?? null,
          mnoznik:   densityMul(klasa, T),
          uDiscFade: child.material?.uniforms?.uDiscFade?.value ?? null,
          discPx:    flag ? (child.userData.atmoDiscPx ?? null) : null,
        });
      }
    }
    return { flag, active: flag, knobs: { ...T }, count: shells.length, shells };
  }
  // ── S1: księgowość zależna od KAMERY (lustro _tickGasMaterials) ─────────────
  // ⚠ Ta funkcja NIGDY nie liczy dt. Zmierzony krok ma jedno miejsce — _tickClouds —
  //   i dekret C1b zabrania go rozdzielać. Od S2 uSunTime i wszystkie fazy też idą tam.
  // ⚠ LIVE_SUN czytane KAŻDEJ klatki: to jest cały kontrakt „jeden token w konsoli".
  //   Wartość wpisana raz przy budowie materiału NIE jest pokrętłem (w gasTuning są
  //   cztery takie pola i poking ich nie robi nic).
  _tickSunMaterials() {
    if (!GAME_CONFIG.FEATURES.liveSunShader) return;
    const cam = this.camera;
    if (!cam || !this._starCore || !this._starGroup) return;
    const T = SunShader.LIVE_SUN;

    this._sunDiscPx = sunDiscPx({
      radiusWorld:      this._starCore.geometry?.parameters?.radius ?? 1,
      distance:         cam.position.distanceTo(this._starGroup.position),
      viewportHeightPx: window.innerHeight || 720,
      fovDeg:           cam.fov ?? 55,
    });
    this._sunDetail = sunDetailLevel(this._sunDiscPx, {
      pxFull: T.DETAIL_PX_FULL, pxMed: T.DETAIL_PX_MED, cap: T.DETAIL_CAP,
    });

    const u = this._sunGranU;
    if (!u) return;
    u.uSunDetail.value    = this._sunDetail;
    u.uGranAmp.value      = granAmplitude(this._sunDiscPx,
                              { pxMin: T.SURF_PX_MIN, pxFull: T.SURF_PX_FULL });
    u.uGranMix.value      = T.GRAN_MIX;
    u.uGranContrast.value = T.GRAN_CONTRAST;
    u.uGranWarp.value     = T.GRAN_WARP;
    u.uGranFreq.value     = T.GRAN_FREQ * this._sunFreqMult;

    // Brzegi bramki progu bloomu — liczone CO KLATKĘ, i to jest celowe.
    // ⚠ uColor bywa mutowane W MIEJSCU przez alias V-248 (etap 4 Sfery Dysona robi
    //   setHex na świetle, a to TA SAMA instancja Color). Nie ma kanału powiadomienia
    //   o tej mutacji, więc jedynym sposobem, żeby bramka nadążyła za Dysonem BEZ
    //   gałęzi per-etap, jest przeliczać ją bezwarunkowo. Koszt: ~80 iteracji bisekcji
    //   na klatkę, czyli nic wobec jednego fragmentu tarczy.
    const c = u.uColor.value;
    const lumaA = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * u.uBrightness.value;
    const fade = granFadeEdges({
      lumaA,
      whiteCoef:   u.uBrightness.value * 0.45,
      whitePower:  u.uWhitePower.value,
      granNeutral: SunShader.emissionMeanFor(this._star?.spectralType),
      band:        T.GUARD_BAND,
    });
    u.uGranFadeLo.value = fade.lo;
    u.uGranFadeHi.value = fade.hi;

    const cu = this._sunCoronaU;
    if (!cu) return;
    // Baza kamery w przestrzeni ŚWIATA — z niej fragment odtwarza kierunek na niebie,
    // dzięki czemu smugi należą do gwiazdy, a nie do ekranu (D-V2h). Quad niesie
    // kwaternion kamery, więc jego lokalne x/y TO SĄ te dwie osie.
    const e = cam.matrixWorld.elements;
    cu.uSunCamRight.value.set(e[0], e[1], e[2]);
    cu.uSunCamUp.value.set(e[4], e[5], e[6]);
    cu.uSunDetail.value     = this._sunDetail;
    cu.uStreamerDepth.value = T.STREAMER_DEPTH;
    cu.uStreamerGain.value  = T.STREAMER_GAIN;
    cu.uCoronaGuard.value   = T.CORONA_GUARD;

    // ── Protuberancje (S4) ────────────────────────────────────────────────
    cu.uStarCenterWorld.value.copy(this._starGroup.position);
    cu.uCamPosWorld.value.copy(cam.position);
    cu.uQuadHalf.value   = this._sunQuadHalf;
    cu.uCoreRadius.value = this._sunCoreRadius;

    // ⚠ Rampa po px NIE chowa protuberancji z powodu bloomu — podprogowość zapewnia
    //   sufit korony (D-V2k). Ta rampa istnieje wyłącznie po to, żeby łuk szerokości
    //   dwóch pikseli nie migotał przy szerokim planie.
    const promVis = granAmplitude(this._sunDiscPx,
                      { pxMin: T.PROM_PX_MIN, pxFull: T.PROM_PX_FULL });
    const toCam = _SUN_TO_CAM.copy(cam.position).sub(this._starGroup.position).normalize();
    const scale = this._sunCoreRadius / Math.max(this._sunQuadHalf, 1e-6);
    const halfW = T.PROM_HALFW * scale;
    let any = 0;
    const slotU  = [cu.uProm0,  cu.uProm1,  cu.uProm2,  cu.uProm3];
    const slotUB = [cu.uPromB0, cu.uPromB1, cu.uPromB2, cu.uPromB3];
    for (let i = 0; i < 4; i++) {
      const sl = this._sunPromSlots[i];
      if (!sl) { slotU[i].value.set(0, 0, 0, 0); continue; }
      const env  = promEnvelope(this._sunPromTime, sl).env;
      const limb = limbWeight(sl.anchor.dot(toCam), T.PROM_LIMB_BAND);
      const inten = env * limb * promVis;
      if (inten > 0.002) any = 1;
      // Rzut kotwicy na przestrzeń quada: quad niesie kwaternion kamery, więc jego
      // lokalne x/y TO SĄ osie kamery — rzut to dwa iloczyny skalarne.
      slotU[i].value.set(
        sl.anchor.dot(cu.uSunCamRight.value) * scale,
        sl.anchor.dot(cu.uSunCamUp.value)    * scale,
        halfW, inten);
      slotUB[i].value.set(sl.height, sl.seed, sl.phase, 0);
    }
    cu.uPromAny.value = any;
  }

  // ── S1: przyrząd gate'u — KOSMOS.debug.sunInfo(granNeutral) ─────────────────
  // Jedyny konsument granFadeEdges w S1. Shader dostanie brzegi dopiero w S2, więc gate
  // widzi POLICZONE liczby o commit wcześniej, niż cokolwiek od nich zależy.
  // ⚠ granNeutral jest PARAMETREM, nie tabelą: średnie jasności map emission zmierzono
  //   offline (M 0.693 · K 0.782 · G 0.907 · F 1.012) i S1 celowo ich nie wpisuje na
  //   sztywno — dane bez konsumenta to dokładnie to, co usunął V-266. Domyślne 1.0
  //   znaczy „granulacja na neutralu".
  getSunInfo(granNeutral = null) {
    const flag = !!GAME_CONFIG.FEATURES.liveSunShader;
    if (!this._starCore) return { flag, active: false, reason: 'brak gwiazdy' };
    // ⚠ discPx/detail liczy _tickSunMaterials, które przy fladze OFF w ogóle nie biegnie —
    //   więc przy OFF są NIEAKTUALNE. Zwracamy null zamiast starej liczby: przyrząd, który
    //   nie odróżnia „nie zmierzono" od „zmierzono", jest gorszy niż brak przyrządu.
    //   lumaA i fade liczą się ze świeżych uniformów, więc są ważne niezależnie od flagi.
    const u = this._starCore.material?.uniforms;
    const c = u?.uColor?.value;
    if (!c) return { flag, active: false, reason: 'brak uniformu uColor' };

    // uColor jest LINIOWY (THREE.Color konwertuje sRGB→linear pod ColorManagement),
    // a bramka bloomu waży Rec.709 — te same wagi, co LuminosityHighPassShader.
    const luma709   = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const brightness = u.uBrightness?.value ?? 0;
    const whitePower = u.uWhitePower?.value ?? 1;
    const T = SunShader.LIVE_SUN;
    // ⚠ Domyślnie ZMIERZONA średnia mapy emission tej klasy — czyli dokładnie to, czego
    //   używa shader. Podaj własną liczbę, żeby zobaczyć brzegi przy innym neutralu.
    const neutral = granNeutral ?? SunShader.emissionMeanFor(this._star?.spectralType);
    const fade = granFadeEdges({
      lumaA: luma709 * brightness, whiteCoef: brightness * 0.45,
      whitePower, granNeutral: neutral, band: T.GUARD_BAND,
    });
    return {
      flag, active: flag,
      spectralType: this._star?.spectralType ?? '?',
      brightness, whitePower, granNeutral: neutral,
      granAmp: this._sunGranU ? this._sunGranU.uGranAmp.value : null,
      boilPhase: this._sunBoilPhase,
      lumaA:  luma709 * brightness,
      discPx: flag ? this._sunDiscPx : null,
      detail: flag ? this._sunDetail : null,
      omegaRadPerSec: T.OMEGA_RAD_PER_S,
      omegaDegPerSec: T.OMEGA_RAD_PER_S * 180 / Math.PI,
      fade,   // { cross, lo, hi } — cross === null gdy tarcza nie przecina progu
    };
  }

  // Animacja chmur + gazowca + OBROTU GWIAZDY — co klatkę, niezaleznie od pauzy gry
  // ⚠ C1b/D-V1d: żywy gazowiec dostaje uTime TUTAJ, tym samym krokiem co chmury — oba
  // są real-time i oba miały ten sam dług (Finding 250, naprawiony w C2). Dlatego stoją
  // w JEDNYM miejscu; nie przenosić gazowca do _tickGasMaterials, bo rozdzieliłoby to
  // krok czasu na dwa punkty i następna poprawka musiałaby trafić w oba.
  // ⚠ Krok jest ZMIERZONY (animDeltaSeconds), nie zaszyty — i CELOWO nie jest
  // współdzielony z innymi konsumentami kroku w tym pliku: _colonyMarkers.tick(0.016)
  // i _animateTradeFireflies mają własne zaszyte 0.016 i ZOSTAJĄ nietknięte — zmiana
  // ich tempa to osobna decyzja, nie skutek uboczny tej.
  _tickClouds() {
    const now = performance.now();
    const dt  = animDeltaSeconds(now, this._lastAnimTickMs);
    this._lastAnimTickMs = now;
    if (dt === 0) return;

    // Obrót gwiazdy — ten sam ZMIERZONY krok co chmury i gazowiec (V-260).
    // ⚠ Stoi TUTAJ, a nie w pętli renderowania, z tego samego powodu co gazowiec:
    //   krok czasu ma JEDNO miejsce (dekret C1b wyżej).
    // ⚠ Przez integratePhase, nie przez `+=`: akumulacja fazy jest KONTRAKTEM (D-V2u),
    //   a kontrakt bez konsumenta jest atrapą. Arytmetycznie to dokładnie to samo działanie.
    if (this._starCore) {
      this._starCore.rotation.y =
        integratePhase(this._starCore.rotation.y, SunShader.LIVE_SUN.OMEGA_RAD_PER_S, dt);
    }
    // Kipienie granulacji — TEN SAM zmierzony krok co obrót, chmury i gazowiec.
    // ⚠ Faza jest AKUMULOWANA, nie liczona jako ω·t (D-V2u): inaczej przekręcenie
    //   BOIL_HZ na gate'cie teleportowałoby wzór zamiast zmienić jego tempo (V-270).
    if (this._sunGranU) {
      this._sunBoilPhase = integratePhase(
        this._sunBoilPhase, SunShader.LIVE_SUN.BOIL_HZ * this._sunBoilMult, dt);
      this._sunGranU.uBoilPhase.value = this._sunBoilPhase;
    }
    // Oddech korony — POZA bramką żywego materiału, bo dotyczy obu ścieżek: przy fladze
    // OFF pętla renderowania nadal wpisuje uGain z tej fazy.
    this._sunBreathPhase = integratePhase(this._sunBreathPhase, SunShader.LIVE_SUN.BREATH_HZ, dt);
    if (this._sunCoronaU) {
      this._sunStreamerPhase = integratePhase(
        this._sunStreamerPhase, SunShader.LIVE_SUN.STREAMER_DRIFT, dt);
      this._sunCoronaU.uStreamerPhase.value = this._sunStreamerPhase;
      // Zegar cyklu życia protuberancji — ten sam zmierzony krok co reszta.
      this._sunPromTime += dt;
      this._sunCoronaU.uPromTime.value = this._sunPromTime;
    }

    for (const [, entry] of this._planets) {
      const gasU = entry.mesh?.material?.userData?.gasUniforms;
      if (gasU) gasU.uGasTime.value += dt;
      for (const child of entry.group.children) {
        if (child.userData.isCloud && child.material?.uniforms?.uTime) {
          const cu = child.material.uniforms;
          // ⚠ Mnożnik tempa działa na KROKU, nie w shaderze (D-V2u / anti-V-270):
          //   uTime jest akumulowane, więc mnożnik po stronie GLSL teleportowałby wzór.
          cu.uTime.value += dt * LIVE_CLOUDS.DRIFT_MULT;
          // Pozostałe cztery pokrętła przepisywane BEZWARUNKOWO co klatkę — inaczej
          // konsola zmieniałaby pole, którego nikt nie czyta (lekcja PROM_GAIN/BAKED).
          if (cu.uCloudAlpha)      cu.uCloudAlpha.value = LIVE_CLOUDS.ALPHA;
          if (cu.uCloudCoverage)   cu.uCloudCoverage.value.set(LIVE_CLOUDS.COVERAGE_LO, LIVE_CLOUDS.COVERAGE_HI);
          if (cu.uCloudNightFloor) cu.uCloudNightFloor.value = LIVE_CLOUDS.NIGHT_FLOOR;
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
    // ARKUSZ UI poprawka 501 — promień tarczy gwiazdy dla podłogi zoomu (`GameScene.create` woła `initSystem` → `renderStar`
    // PRZED wpięciem kontrolera).
    ctrl?.setStarCoreRadius?.(this._star ? this._sunCoreRadius : 0);
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

  // ── ARKUSZ UI U1-1 (D-UI-5 §7.9; Findingi 471, 472, 473) — domyślny widok układu ─────────────────────────────────
  // Jedna droga „wróć do widoku układu”: klawisz Home, klik w BIEŻĄCY układ (Outliner, chip mapy), focus na gwieździe.
  // Zeruje WSZYSTKIE pola kamery — śledzenie ciała / statku / stacji, punkt walki, „Obserwuj” (`_endWatch` oddaje
  // minDist sprzed obserwacji), auto-fokus starcia — inaczej pętla renderu cofałaby reset w następnej klatce (472),
  // potem kadr `frameSystem`: cel = gwiazda, dystans = zasięg układu × 20 w [70; 450]. Każdy automatyczny ruch kamery
  // z celem na gwieździe kończy się w tym kadrze, nigdy bliżej (wymóg z bramki U0). Zaznaczenie (karta ciała, okno
  // statku, złota orbita) — bez zmian. Podgląd obserwatorium i lot intro trzymają kamerę — wtedy nic.
  resetToSystemView() {
    if (!this._cameraController?.frameSystem) return false;
    if (this._galaxyActive) return false;   // ARC GALAXY G1 — w trybie galaktyki nie ma kadru układu (Home = preset galaktyki)
    if (this._observatoryPreviewActive || this._cinematicDriver) return false;
    if (this._watch) this._endWatch();
    this._autoFocus        = null;
    this._focusEncounterId = null;
    this._focusEntityId    = null;
    this._focusVesselId    = null;
    this._focusStationId   = null;
    this._cameraController.setMinDist(0.3);   // domyślny min zoom (fokus statku / stacji go obniża)
    this._frameActiveSystem();
    return true;
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
    if (this._cvOrb?.holdsHidden?.(vessel.id)) return;   // ARC CV-8a — okręt z hangaru: wrak dopiero po zniszczeniu w powtórce

    // Resolver wybiera plik wg napędu+klasy. Jeśli już wiemy że pliku brak
    // (poprzedni load 404) — od razu DEFAULT, bez ponownego nieudanego fetcha.
    const resolved = vesselModelPath(vessel);
    const modelPath = this._missingModelPaths.has(resolved) ? VESSEL_MODEL_DEFAULT : resolved;
    // ARC CV-1a — przełącznik deweloperski `KOSMOS.debug.cvIncoming(1)`: slot z indeksu `hardpoints/incoming/index.json` bierze
    // model z `incoming/` (podgląd modelu właściciela PRZED podmianą slotu — CV-1b).
    const incoming = this._cvIncomingPathFor(modelPath);
    this._addVesselModel3D(vessel, incoming ?? modelPath);
  }

  /** ARC CV-1a — ścieżka modelu z `incoming/` dla slotu z indeksu (przełącznik `cvIncoming` włączony), inaczej null. */
  _cvIncomingPathFor(modelPath) {
    if (!this._cvIncoming || !this._cvIncomingSlots) return null;
    const s = slotOfModelPath(modelPath);
    if (!s || s.variant !== 'slot' || !this._cvIncomingSlots.has(s.slot)) return null;
    const p = INCOMING_DIR + s.slot + '.glb';
    return this._missingModelPaths.has(p) ? null : p;
  }

  /**
   * Dodaj model 3D statku (GLB) na mapie — ARC CV-1a: rama kanoniczna z pliku hardpointów (CV-Z — dawna ścieżka modeli bez ramy,
   * ze wspólnymi materiałami szablonu i zwalnianiem jego geometrii, usunięta razem z flagą `cvModels`).
   */
  _addVesselModel3D(vessel, modelPath) {
    this._addVesselModelCv(vessel, modelPath);
  }

  /**
   * ARC CV-1a — statek w RAMIE KANONICZNEJ (`ShipModelRig`): model obrócony kwaternionem ramy z pliku
   * hardpointów (dziób → +Z, D-CV-11), smuga w dyszy z pliku (Finding 619), WŁASNE klony materiałów z maską koloru-klucza
   * (Finding 624; tint wroga i żar wraku uniformami — Finding 620), punkty świetlne `lights[]`. Wrapper, pozycja, widoczność,
   * wywiad, fokus i pamięć orbity wraku — jak ścieżka OFF (`_addVesselModel3D`). Hardpointy wczytywane RÓWNOLEGLE z GLB;
   * brak pliku ⇒ wartości zapasowe, bez czekania. Błąd STAWIANIA nie wpada w łańcuch zapasowy ładowania (dawniej błąd kodu
   * oznaczał poprawny model jako brakujący — Finding 625).
   */
  _addVesselModelCv(vessel, modelPath) {
    const isEnemy = isEnemyVessel(vessel);
    const color = isEnemy ? 0xff4466 : 0x44cc66;
    const px = S(vessel.position?.x ?? 0);
    const pz = S(vessel.position?.y ?? 0);
    const slotInfo = slotOfModelPath(modelPath) ?? { slot: 'default', variant: 'slot' };

    const placeModel = ([template, hardpoints]) => {
      if (this._vessels.has(vessel.id)) return;
      const isWreck = (this._cvVisWreck?.(vessel) ?? !!vessel?.isWreck);   // ARC CV-8a — wrak powtórki bitwy orbitalnej dopiero po zniszczeniu
      // ARC CV-4a — okręt, którego zniszczenie rejestr salw już pokazał, przebudowany w trakcie bitwy (np. zmiana presetu tekstur):
      // od razu wygląd wraku, bez smugi i świateł (wrakiem w logice zostanie dopiero na końcu bitwy).
      const killedLook = !isWreck && (this._cvLedger?.killState?.(vessel.id) === 'shown'
        || this._cvDebugKilled?.has(vessel.id) === true);   // ARC CV-5 — zniszczenie z `cvExplode`
      const key = `${slotInfo.variant}/${slotInfo.slot}`;
      const hp = this._cvLightTest ? this._cvLightTestDoc(key, template, hardpoints) : hardpoints;
      const rig = buildShipRig({
        THREE, template, hardpoints: hp, targetSize: vesselTargetSize(vessel),
        kind: isWreck || killedLook ? 'wreck' : (isEnemy ? 'enemy' : 'own'),
        lightPool: hp.lights?.length ? this._cvLightPool() : null, lightKey: key + (this._cvLightTest ? '#test' : ''),
        exhaust: GAME_CONFIG.FEATURES?.fcCombatFx && !isWreck && !killedLook ? { gradient: exhaustGradientColors({ isEnemy }), hdr: FX_HDR_EXHAUST } : null,
        burnHot: !!GAME_CONFIG.FEATURES?.fcCombatFx,
        enemyRimHex: this._hud3dHex?.('alert') ?? null,   // obwódka wroga w roli `alert` motywu (zmiana motywu — `_tickCvModels`)
      });
      const wrapper = rig.root;
      wrapper.userData = { kosmosType: 'vessel', vesselId: vessel.id };
      wrapper.position.set(px, 0.3, pz);
      // Kurs spoczynkowy (kontrola właściciela CV-1a): bez znanego kierunku dziób w świecie −X — jak ścieżka OFF (model z dziobem
      // −X przy kursie 0); kurs 0 ramy kanonicznej to dziób +Z, czyli stojący wróg w bitwie obracał się o 90° (burtą).
      wrapper.rotation.y = REST_YAW_CANONICAL;
      // Kurs dziobem ku celowi — w ramie kanonicznej bez dawnej poprawki „+ π/2” (dziób w lokalnym +Z). ⚠ Misja zastępcza rozkazu
      // („Zaangażuj” — bez współrzędnych) daje cel (0, 0), czyli gwiazdę — tak samo na ścieżce OFF i przed CV-1a (Finding 681, CV-3b).
      if (vessel.mission) {
        const m = vessel.mission;
        const isReturn = m.phase === 'returning';
        const tx = isReturn ? (m.returnTargetX ?? m.liveOriginX ?? 0) : (m.liveTargetX ?? m.targetX ?? 0);
        const ty = isReturn ? (m.returnTargetY ?? m.liveOriginY ?? 0) : (m.liveTargetY ?? m.targetY ?? 0);
        const dx = tx - (vessel.position?.x ?? 0);
        const dy = ty - (vessel.position?.y ?? 0);
        if (dx !== 0 || dy !== 0) wrapper.rotation.y = yawToward(dx, dy, true);
      }
      if (isWreck) this._cvTiltWreck(wrapper);
      this.scene.add(wrapper);
      if (isWreck) {
        wrapper.visible = true;
      } else if (isEnemy && !GAME_CONFIG.FEATURES.m4EnemyGhosts) {
        wrapper.visible = window.KOSMOS?.observatorySystem?.isVesselDetected?.(vessel.id) ?? false;
      }
      const entry = {
        sprite: wrapper, color, isModel3D: true, canonical: true, rig, slot: slotInfo.slot, slotVariant: slotInfo.variant,
        texVariant: this._shipTexVariant?.get?.(template) ?? '2k',   // ARC CV-2b — tekstury modelu (1K — presety Medium / Low)
        // ⚠ `enemyTint` znaczy tu to samo co na ścieżce OFF (wróg albo wrak): czytają go etykiety CTRL (`getAllVisibleLabels` —
        // kolor i mgła tożsamości „?”). Zwalnianie materiałów rozstrzyga `entry.canonical` (rig), nie to pole.
        enemyTint: isEnemy || isWreck,
        isWreck, exhaust: rig.exhaust, _exhaustPhase: rendererRandom() * Math.PI * 2,
      };
      this._vessels.set(vessel.id, entry);
      if (killedLook) { entry.cvKilled = true; this._cvWpnKillLook(vessel.id, entry); }   // ARC CV-4a — przechył i zgaszenie jak w chwili zniszczenia
      else if (isWreck && this._cvDmgOn?.()) this._cvDmgWreckLook?.(vessel.id, entry);   // ARC CV-5 — wrak odbudowany: od razu wystygły (bez powtórki wybuchu)
      // ARC CV-3c (Finding 709) — wyloty startują ukryte, a poza walką zapala je `_applyExhaust` dopiero przy aktualizacji pozycji (gra
      // w ruchu): model, który dochodzi na PAUZIE (parada `cvParade`, wczytanie, przebudowa po zmianie presetu, zmiana układu), nie miał
      // wylotu do wznowienia — statek warp ratował pierścień emisji w teksturze, niewarpowy nie miał nic. Stan wylotu od razu po rigu.
      else this._applyExhaust?.(vessel, entry);
      this._cvShdReapplyScorch?.(vessel.id, entry);   // ARC CV-4b — osmalenia kadłuba po przebudowie (High)
      if (isEnemy && !isWreck && GAME_CONFIG.FEATURES.m4EnemyGhosts) this._applyVesselIntelVisibility(vessel, entry);
      this._applyPendingVesselFocus(vessel.id);   // U1-3 — fokus, o który poproszono, zanim sprite stał
      if (isWreck && vessel.position?.dockedAt) {
        const bodyId = vessel.position.dockedAt;
        let bodyR = 0.06;
        const pE = this._planets.get(bodyId);
        if (pE) {
          const ent = this._entityByUUID.get(pE.mesh.uuid);
          bodyR = ent ? this._getEntityRadius(ent) : 0.1;
        } else if (this._moons.has(bodyId)) bodyR = 0.03;
        else if (this._planetoids.has(bodyId)) bodyR = 0.02;
        entry._orbiting = { bodyId, orbitR: Math.max(0.5, bodyR * 6.0), isWreck: true, initAngle: rendererRandom() * Math.PI * 2 };
      } else if (isWreck && vessel.wreckLocation && vessel.position.dockedAt == null) {
        const wx = isNaN(vessel.wreckLocation.x) ? 0 : vessel.wreckLocation.x;
        const wy = isNaN(vessel.wreckLocation.y) ? 0 : vessel.wreckLocation.y;
        wrapper.position.set(S(wx), 0.45, S(wy));
      }
    };
    const place = (res) => {
      try { placeModel(res); } catch (e) { console.error(`[ThreeRenderer] model: błąd stawiania statku ${vessel.id} (${modelPath})`, e); }
    };
    const load = (path) => {
      const s = slotOfModelPath(path) ?? { slot: 'default', variant: 'slot' };
      // ARC CV-2b — tekstury 1K (presety Medium / Low): najpierw hardpointy slotu (z pamięci po pierwszym
      // statku), bo to one mówią, czy wariant `<slot>@1k.glb` istnieje (`has1kVariant`); bez wariantu — model 2K jak dziś.
      if (!this._gfxWants1k?.() || s.variant !== 'slot') return Promise.all([this._loadShipModel(path), this._shipHardpoints.load(s.slot, s.variant)]);
      return this._shipHardpoints.load(s.slot, s.variant).then((hp) => this._loadShipModelVariant(path, hp).then((tpl) => [tpl, hp]));
    };

    load(modelPath).then(place).catch((err) => {
      // Model z `incoming/` niedostępny (plik usunięty po CV-1b) — od razu model slotu, bez 404 przy następnych statkach.
      if (slotInfo.variant === 'incoming') {
        this._missingModelPaths.add(modelPath);
        console.warn(`[ThreeRenderer] cvIncoming: brak ${modelPath} — model slotu`, err);
        this._addVesselModelCv(vessel, SHIP_MODEL_DIR + slotInfo.slot + '.glb');
        return;
      }
      console.warn(`[ThreeRenderer] GLB load failed (retry za 400ms): ${modelPath}`, err);
      setTimeout(() => {
        this._loadShipModel(modelPath).then(() => load(modelPath).then(place)).catch((err2) => {
          this._missingModelPaths.add(modelPath);
          if (modelPath !== VESSEL_MODEL_DEFAULT) {
            console.warn(`[ThreeRenderer] Brak modelu ${modelPath} — fallback na DEFAULT (${VESSEL_MODEL_DEFAULT})`);
            load(VESSEL_MODEL_DEFAULT).then(place).catch((err3) => {
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

  /**
   * ARC CV-1a — losowe pochylenie wraku (przy stawianiu i przy zamianie żywego statku we wrak) RÓWNOWAŻNE ścieżce OFF: te same
   * losowania w tej samej kolejności (z, potem x), ten sam obraz w świecie (`wreckTiltQuaternion` — Euler OFF na modelu
   * z dziobem −X zamiast przechyłu wokół dziobu). Kurs wrappera (obrót Y) zostaje.
   */
  _cvTiltWreck(wrapper) {
    const rz = (rendererRandom() - 0.5) * 0.6;   // ±0,3 rad ≈ ±17° (jak ścieżka OFF)
    const rx = (rendererRandom() - 0.5) * 0.4;
    const q = wreckTiltQuaternion(wrapper.rotation.y, rx, rz);
    wrapper.quaternion.set(q[0], q[1], q[2], q[3]);
  }

  /** ARC CV-1a — pula punktów świetlnych (leniwie; chunki log-depth jak reszta sceny). */
  _cvLightPool() {
    if (!this._shipLightPool) this._shipLightPool = new LightPointPool({ THREE, logDepth: logDepthOn() });
    return this._shipLightPool;
  }

  /**
   * ARC CV-1a — `KOSMOS.debug.cvLightTest(1)`: dokument z TESTOWYM wzorem punktów świetlnych dla slotu, który ich nie ma
   * (do Workshopu CV-1c nikt ich nie kliknął) — punkty NA kadłubie (wierzchołki siatki: czubek dziobu, burty w połowie
   * długości, grzbiet, dwa przy rufie). Plik z własnymi `lights[]` zostaje bez zmian. Pamięć na slot (stała tożsamość listy
   * ⇒ jedna geometria puli na slot).
   */
  _cvLightTestDoc(key, template, hp) {
    if (Array.isArray(hp.lights) && hp.lights.length > 0) return hp;
    this._cvLightTestDocs = this._cvLightTestDocs ?? new Map();
    const have = this._cvLightTestDocs.get(key);
    if (have && have.base === hp) return have.doc;
    const doc = { ...hp, lights: lightTestPattern(THREE, template, hp.frame) };
    this._cvLightTestDocs.set(key, { base: hp, doc });
    return doc;
  }

  /** ARC CV-1a — przebuduj sprite'y statków aktywnego układu (przełączniki `cvModels`, `cvIncoming`, `cvLightTest`). */
  cvRebuildVesselSprites() {
    const ids = [...this._vessels.keys()];
    // ARC CV-5 (Finding 706) — znaczniki sceny przebudowywanych statków ZOSTAJĄ, aż nowy sprite stanie (model GLB wstawia się
    // asynchronicznie): bez tego `_unstageVessels` kasował znacznik w przerwie, a nowy wchodził na scenę od zera przez JOIN_MS na
    // zegarze, który w ZATRZYMANEJ bitwie stoi — statki zostawały w skali prawdziwej do wznowienia gry.
    if (this._stageMarks?.size) {
      const until = performance.now() + STAGE_REBUILD_KEEP_MS;
      for (const id of ids) if (this._stageMarks.has(id)) (this._stageKeep ??= new Map()).set(id, until);
    }
    for (const id of ids) this._removeVesselSprite(id);
    this._restoreActiveSystemVesselSprites();
    return { rebuilt: ids.length };
  }

  /** ARC CV-1a — `KOSMOS.debug.cvIncoming(1|0)`: modele z `incoming/` dla slotów z indeksu (podgląd przed CV-1b). */
  async cvSetIncoming(on) {
    this._cvIncoming = !!on;
    if (this._cvIncoming && !this._cvIncomingSlots) this._cvIncomingSlots = await this._shipHardpoints.loadIncomingIndex();
    const rb = this.cvRebuildVesselSprites();
    return { cvIncoming: this._cvIncoming, slots: [...(this._cvIncomingSlots ?? [])], ...rb };
  }

  /** ARC CV-1a — `KOSMOS.debug.cvLightTest(1|0)`: testowy wzór punktów świetlnych na slotach bez `lights[]`. */
  cvSetLightTest(on) {
    this._cvLightTest = !!on;
    const rb = this.cvRebuildVesselSprites();
    return { cvLightTest: this._cvLightTest, ...rb };
  }

  /** ARC CV-1a — `KOSMOS.debug.modelInfo()`: statki w ramie kanonicznej, hardpointy (plik / zapas), pula świateł. */
  cvModelInfo() {
    const ships = [];
    for (const [id, e] of this._vessels) {
      ships.push({ id, canonical: !!e.canonical, slot: e.slot ?? null, variant: e.slotVariant ?? null,
        lights: e.rig?.lights ? e.rig.lights.geometry?.instanceCount ?? 0 : 0, exhaust: !!e.exhaust, wreck: !!e.isWreck });
    }
    return {
      cvIncoming: this._cvIncoming, cvLightTest: this._cvLightTest,
      canonical: ships.filter((s) => s.canonical).length, legacy: ships.filter((s) => !s.canonical).length,
      hardpoints: this._shipHardpoints.stats(), lightPool: this._shipLightPool?.stats() ?? null, ships,
    };
  }

  // ARC CV-1a — raz na klatkę: pokrętła modeli (`cvTuning.MODEL_*`) do wspólnych uniformów maski (wzmocnienie, tint, żar,
  // światło czytelności: wypełnienie, obwódka, sufit) i puli punktów świetlnych (rozmiar piksela, wzmocnienie, podłoga); po
  // zmianie motywu — obwódka wrogów w nowej roli `alert`.
  _tickCvModels() {
    const T = this.cvTuning;
    KC_SHARED.uKcGainMul.value = T.MODEL_KC_GAIN ?? 1;
    KC_SHARED.uKcTintMul.value = T.MODEL_ENEMY_TINT ?? 1;
    KC_SHARED.uKcBurnMul.value = T.MODEL_WRECK_BURN ?? 1;
    KC_SHARED.uKcFillMul.value = T.MODEL_FILL ?? 0;
    KC_SHARED.uKcRimMul.value = T.MODEL_RIM_GAIN ?? 0;
    KC_SHARED.uKcRimPow.value = T.MODEL_RIM_POWER ?? 4;
    KC_SHARED.uKcLiftCeil.value = T.MODEL_LIFT_CEIL ?? 0.95;
    KC_SHARED.uKcRoughMin.value = T.MODEL_ROUGH_MIN ?? 0;   // ARC CV-4b (Finding 707) — podłoga szorstkości żywych kadłubów
    KC_SHARED.uKcSpecCap.value = T.MODEL_SPEC_CAP ?? 0;     // ARC CV-4b (Finding 707) — kolano bezpośredniego odblasku
    KC_SHARED.uKcScorchDark.value = T.SCORCH_DARK ?? 0.72;  // ARC CV-4b — osmalenia: przyciemnienie albedo
    KC_SHARED.uKcScorchGlow.value = T.SCORCH_GLOW ?? 2.2;   // ARC CV-4b — osmalenia: żar świeżego brzegu
    const ep = themeEpoch();
    if (this._cvRimEpoch !== ep) {
      this._cvRimEpoch = ep;
      const alert = this._hud3dHex('alert');
      for (const [, e] of this._vessels) {
        if (e.canonical && e.rig && !e.isWreck) paintRigRim(THREE, e.rig.materials, e.enemyTint ? 'enemy' : 'own', alert);
      }
    }
    this._shipLightPool?.update({ fovDeg: this.camera?.fov ?? 55, viewportH: window.innerHeight || 1,
      gain: T.MODEL_LIGHT_GAIN, minPx: T.MODEL_LIGHT_MIN_PX, fadePx: T.MODEL_LIGHT_FADE_PX, fadeEndPx: T.MODEL_LIGHT_FADE_END_PX });
  }

  // ARC CV-2b — czy statki dostają tekstury 1K (preset Medium / Low).
  _gfxWants1k() { return this._gfxApplied?.textures === '1k'; }

  // ARC CV-2b — model w wariancie 1K, gdy slot go ma (`has1kVariant` — stempel normalizatora); błąd wczytania wariantu ⇒ model 2K
  // (ścieżka 1K zapamiętana jako brakująca — bez ponownych żądań). Szablon oznaczony wariantem (`_shipTexVariant`).
  _loadShipModelVariant(path, hp) {
    const p1k = has1kVariant(hp) ? modelPath1k(path) : null;
    if (!p1k || this._missingModelPaths.has(p1k)) return this._loadShipModel(path);
    return this._loadShipModel(p1k).then((tpl) => { this._shipTexVariant.set(tpl, '1k'); return tpl; }, (err) => {
      this._missingModelPaths.add(p1k);
      console.warn(`[ThreeRenderer] cvPresets: brak wariantu 1K ${p1k} — model 2K`, err);
      return this._loadShipModel(path);
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
    // Trasę statku rysuje warstwa HUD 2D (`HudRouteLayer`; dawne linie tras 3D usunięte w ARKUSZU HUD B-Z).

    // Wrogi fallback sprite — widoczność initial. M4 P2 intel-aware ścieżka
    // po _vessels.set (wymaga entry); fallback legacy gdy flag off.
    if (isEnemy && !GAME_CONFIG.FEATURES.m4EnemyGhosts) {
      const obs = window.KOSMOS?.observatorySystem;
      const detected = obs?.isVesselDetected?.(vessel.id) ?? false;
      sprite.visible = detected;
    }

    this._vessels.set(vessel.id, { sprite, tex, color, enemyTint: isEnemy });

    // M4 P2 — apply intel ghosts dla fallback sprite (po set, helper iteruje sprite materials)
    if (isEnemy && GAME_CONFIG.FEATURES.m4EnemyGhosts) {
      this._applyVesselIntelVisibility(vessel, this._vessels.get(vessel.id));
    }
    this._applyPendingVesselFocus(vessel.id);   // U1-3 — fokus, o który poproszono, zanim sprite stał
  }

  // ARKUSZ UI U1-3 — sprite statku stanął: dokończ fokus zgłoszony, zanim istniał (`vessel:focus` po przełączeniu
  // układu), o ile cel kamery jest wciąż ten, który wtedy ustawiono (nikt inny kamery nie przejął).
  _applyPendingVesselFocus(vesselId) {
    const p = this._pendingVesselFocus;
    if (!p || p.vesselId !== vesselId) return;
    this._pendingVesselFocus = null;
    const g = this._cameraController?._goalTarget;
    if (!g || Math.abs(g.x - p.goal.x) > 1e-6 || Math.abs(g.y - p.goal.y) > 1e-6 || Math.abs(g.z - p.goal.z) > 1e-6) return;
    EventBus.emit('vessel:focus', { vesselId });
  }

  /**
   * Usuń sprite statku z mapy 3D.
   */
  _removeVesselSprite(vesselId) {
    const entry = this._vessels.get(vesselId);
    if (!entry) return;

    this.scene.remove(entry.sprite);

    if (entry.canonical) {
      // ARC CV-1a — rig posiada WŁASNE klony materiałów, smugę i punkty świetlne (wracają do puli); geometria szablonu jest
      // WSPÓLNA dla wszystkich statków slotu — bez `dispose` (dawne zwalnianie na klonie wymuszało ponowne wgranie bufora).
      disposeShipRig(entry.rig, this._shipLightPool);
      entry.exhaust = null;
    } else {
      // Sprite billboard — dispose materiału i tekstury
      entry.sprite.material.dispose();
      if (entry.tex) entry.tex.dispose();
    }

    // Stożek wydechu (statek bez rigu) — dispose jawnie.
    if (entry.exhaust) {
      entry.exhaust.geometry?.dispose();
      entry.exhaust.material?.dispose();
    }

    // Jeśli skończony hover był na tym statku — wyczyść
    if (this._hoverVesselId === vesselId) this._hoverVesselId = null;

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
    // POLISH P1 (CP5) — kąt orbity z TEGO SAMEGO zegara co pozycja logiczna (`VesselManager._updatePositions`):
    // przy czasie realnym sprite po każdej pauzie wyprzedzałby statek (pauza zatrzymuje zegar klatek, nie czas realny).
    const tSec = orbitClockSec();
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
      // ARC CV-6a (Finding 633) — duch `rumor` stoi w położeniu ostatnio znanym (bez zapisu żywego — orbita ciała i wolna przestrzeń).
      const ghost = v ? this._rumorGhostPos(v, entry) : null;
      if (ghost) { if (ghost.hold !== true) entry.sprite.position.set(S(ghost.x), 0.3, S(ghost.y)); continue; }
      if (v && !v.isWreck && v.position?.state === 'orbiting' && v.position?.dockedAt == null) {
        const vx = isNaN(v.position.x) ? 0 : v.position.x;
        const vy = isNaN(v.position.y) ? 0 : v.position.y;
        this._placeFreeVessel(id, entry, vx, vy);   // POLISH P2b (D3, Finding 461) — w oglądanym starciu: płynnie
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
      this._setSpriteBase(id, entry, pos.x, pos.y, pos.z);   // ARC CV-3a3 — uczestnik sceny przy ciele: baza do znacznika, sprite rysowany
      // Żywe statki: obrót w kierunku ruchu orbity. Wraki/stacje: bez rotacji.
      if (entry.isModel3D && !entry.isWreck && !orb.anchored) {
        // ARC CV-1a (Finding 622) — rama kanoniczna: dziób ZGODNIE z ruchem orbity (dawne `θ + π`, ścieżka OFF bez zmian).
        entry.sprite.rotation.y = entry.canonical ? orbitYaw(pos.theta, orb.omega, true) : pos.theta + Math.PI;
      }
    }
  }

  /**
   * Dodaj mesh stacji orbitalnej. Proceduralny placeholder (rdzeń-sfera + pierścień-torus) pojawia
   * się NATYCHMIAST, a model GLB (S3.3b-S4a) doładowuje się async i podmienia placeholder — 16 MB
   * ładuje się kilka s, bez placeholdera stacja „znika". NIE w _clickable (selekcja = S3.3b-S4).
   * Pozycja co klatkę w _tickOrbitingStations (anchored, bez rotacji).
   *
   * BRAMKA UKŁADU: mesh powstaje TYLKO dla stacji z aktywnego układu (mirror vessel:launched).
   * Siedzi TU, a nie przy subskrypcji, bo obie ścieżki (station:created — w tym batch z restore,
   * gdzie gra zawsze wraca do sys_home — oraz _restoreActiveSystemStations po switchSystem)
   * są nią wtedy objęte automatycznie, a przyszły trzeci caller nie może jej obejść.
   */
  _addStationMesh(station) {
    if (!station?.id || this._stations.has(station.id)) return;
    if (!isStationInActiveSystem(station, window.KOSMOS?.activeSystemId)) return;
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
    const tSec = orbitClockSec();   // POLISH P1 (CP5) — ten sam zegar co `_tickOrbitingVessels`
    for (const [id, entry] of this._stations) {
      if (!entry.mesh) continue;
      const orb = orbital.getOrbit(id);
      // INWARIANT: brak orbity / brak ciała kotwiczącego w scenie ⇒ nie ma jak spozycjonować meshu,
      // więc go NIE rysujemy (dawniej zostawał w origin = fałszywa ikonka przy gwieździe).
      if (!orb) { entry.mesh.visible = false; continue; }
      const pEntry = this._planets.get(orb.planetId);
      const planetPos = pEntry
        ? { x: pEntry.group.position.x, z: pEntry.group.position.z }
        : this._moons.get(orb.planetId)
          ? { x: this._moons.get(orb.planetId).mesh.position.x, z: this._moons.get(orb.planetId).mesh.position.z }
          : this._planetoids.get(orb.planetId)
            ? { x: this._planetoids.get(orb.planetId).mesh.position.x, z: this._planetoids.get(orb.planetId).mesh.position.z }
            : null;
      if (!planetPos) { entry.mesh.visible = false; continue; }
      const pos = orbital.getPosition(id, planetPos, tSec);
      if (!pos) { entry.mesh.visible = false; continue; }
      entry.mesh.position.set(pos.x, pos.y, pos.z);
      entry.mesh.visible = true;
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
      // i ustawia sprite.
      if (vessel.position?.state === 'orbiting') {
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
          // POLISH P2b (D3, Finding 461) — uczestnik oglądanego starcia: płynnie (`_placeFreeVessel`).
          // ARC CV-6a (Finding 633) — duch `rumor` zostaje w położeniu ostatnio znanym (bez zapisu żywego).
          const ghost = this._rumorGhostPos(vessel, entry);
          if (ghost) { if (ghost.hold !== true) entry.sprite.position.set(S(ghost.x), 0.3, S(ghost.y)); }
          else this._placeFreeVessel(vessel.id, entry, vx, vy);
        }
        continue;
      }

      // ── Statek w locie — opadanie ku celowi (trasę rysuje warstwa HUD 2D) ────────
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

        // ARC CV-3a3 (po kontroli właściciela — Finding 662 (a) czyni to codziennym: statek w locie WEWNĄTRZ bitwy) — przez
        // `_setSpriteBase`, jak zapis orbity (R9): uczestnik sceny zostaje rysowany na scenie, nowa baza czeka w znaczniku.
        // Zapis wprost odsłaniał statek w skali prawdziwej czytelnikom między tikiem a klatką (warstwa HUD, klik; zmierzone
        // w grze: odczyt skakał o 26–31 L); bez znacznika (poza sceną, flaga OFF) — zapis wprost, jak dotąd.
        this._setSpriteBase(vessel.id, entry, S(vx), shipY, S(vy));

        // Model 3D — obróć dziobem w kierunku celu (+ Slice 6 banking roll w skręcie)
        if (entry.isModel3D) {
          if (dx !== 0 || dy !== 0) {
            // ARC CV-1a — rama kanoniczna (`entry.canonical`): dziób w lokalnym +Z ⇒ bez „+ π/2”; obrót Z wrappera jest
            // tam PRAWDZIWYM przechyłem wokół osi dziobu (przy dziobie w −X był pochyleniem nosa), więc znak — w stronę skrętu.
            const yaw = entry.canonical ? yawToward(dx, dy, true) : Math.atan2(dx, dy) + Math.PI / 2;
            if (GAME_CONFIG.FEATURES?.fcMovementFx && entry._prevYaw != null) {
              let dYaw = yaw - entry._prevYaw;
              while (dYaw >  Math.PI) dYaw -= 2 * Math.PI;
              while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
              const targetRoll = entry.canonical ? bankRoll(dYaw, true) : Math.max(-0.5, Math.min(0.5, dYaw * 12));  // przechył ∝ zmiana kursu
              entry.sprite.rotation.z += (targetRoll - entry.sprite.rotation.z) * 0.15;  // lerp do 0 gdy prosto
            }
            entry._prevYaw = yaw;
            entry.sprite.rotation.y = yaw;
          }
        }

      } else {
        // Brak misji — statek na stałej wysokości
        entry.sprite.position.set(S(vx), 0.3, S(vy));
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

  // ARC CV-6a (Finding 633) — położenie DUCHA `rumor` (ostatnio znane) dla statku, którego sprite ma je trzymać, także w stanie
  // `orbiting` (orbita ciała, wolna przestrzeń); `{ hold: true }` — trzymaj bez położenia (wywiad bez `positionLastKnown` — nie
  // śledzimy żywego); `null` — zwykły zapis żywego położenia (własny, `contact` / `detailed`, ujawniony w starciu, flaga duchów OFF).
  _rumorGhostPos(vessel, entry) {
    if (!entry || entry.isWreck || entry.intelQuality !== 'rumor') return null;
    if (!rumorGhostHold({ isEnemy: isEnemyVessel(vessel), quality: entry.intelQuality, revealed: this._isCombatRevealed(vessel.id),
      ghostsOn: !!GAME_CONFIG.FEATURES.m4EnemyGhosts })) return null;
    const lk = window.KOSMOS?.intelSystem?.getVesselContact?.(vessel.id)?.positionLastKnown ?? null;
    return lk && Number.isFinite(lk.x) && Number.isFinite(lk.y) ? { x: lk.x, y: lk.y } : { hold: true };
  }

  _applyVesselIntelVisibility(vessel, entry) {
    if (!entry || entry.isWreck) return;
    if (!isEnemyVessel(vessel)) return;

    // POLISH P2a (CP17, Findingi 455, 462) — wróg w aktywnym starciu z graczem: widoczny w pełnym kryciu, w żywej pozycji.
    // ARC CV-8a — także napastnik powtórki bitwy orbitalnej (atak na kolonię gracza = starcie z graczem — reguła P2a CP17)
    const revealed = this._isCombatRevealed(vessel.id) || (this._cvOrb?.revealed?.(vessel.id) ?? false);

    // Legacy ścieżka — binarna widoczność z ObservatorySystem
    if (!GAME_CONFIG.FEATURES.m4EnemyGhosts) {
      const detected = (window.KOSMOS?.observatorySystem?.isVesselDetected?.(vessel.id) ?? false) || revealed;
      entry.sprite.visible = detected;
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

    if (quality === 'unknown' && !revealed) {
      entry.sprite.visible = false;
      entry.intelQuality = 'unknown';
      return;
    }

    let opacity = 1.0;
    let posOverride = null;
    if (revealed) {
      opacity = 1.0;                       // ujawniony w starciu — pełne krycie, pozycja żywa (bez ducha `rumor`)
    } else if (quality === 'rumor') {
      const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      const lastSeen = rec?.lastSeenYear ?? gameYear;
      const yearsAgo = Math.max(0, gameYear - lastSeen);
      const fade = Math.max(0, 1 - yearsAgo / GAME_CONFIG.RUMOR_FADE_YEARS);
      opacity = 0.3 * fade;
      if (opacity <= 0.05) {
        entry.sprite.visible = false;
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
        ff.t = rendererRandom(); // losowa faza startowa
        // Prędkość: szybsza na krótkich trasach, wolniejsza na długich
        ff.speed = 0.15 + rendererRandom() * 0.1 + (1 / Math.max(1, route.distance)) * 0.1;
        // Losowy kierunek (A→B lub B→A)
        ff.reverse = rendererRandom() < 0.5;
        // Losowa wysokość łuku
        ff.arcHeight = 0.2 + rendererRandom() * 0.4 + Math.min(0.4, route.distance * 0.03);
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
    const coneHex = this._hud3dHex('primary');   // paczka B (D-HUD-16) — rola `primary` motywu
    const fillMat = new THREE.MeshBasicMaterial({
      color: coneHex,
      transparent: true,
      opacity: PREDICTION_CONE_FILL_ALPHA,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(fillGeom, fillMat);

    // Outline: 0 → right → left → 0 (zamknięty trójkąt)
    const lineGeom = new THREE.BufferGeometry().setFromPoints([v0, v1, v2, v0]);
    const lineMat = new THREE.LineBasicMaterial({
      color: coneHex,
      transparent: true,
      opacity: PREDICTION_CONE_LINE_ALPHA,
    });
    const lineMesh = new THREE.Line(lineGeom, lineMat);

    const group = new THREE.Group();
    group.add(fillMesh);
    group.add(lineMesh);
    return { fillMesh, lineMesh, group, hudEpoch: themeEpoch() };
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

  // ════════════════════════════════════════════════════════════════════════
  // Fleet Command Console (Slice 0) — wspólny silnik FX + helpery selekcji/intel
  // ════════════════════════════════════════════════════════════════════════

  // Kolor frakcji statku (cache per ownerEmpireId). Own=mint, enemy=archetyp, wrak=szary.
  // Używany przez paski HP starcia i glify trybu Y (wróg).
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
  // (intel ≥ contact)? Own zawsze true. Używana przez pickability/PPM.
  // Chroni reformę detekcji obserwatorium — bez niej smugi/selekcja zdradzają wroga.
  _isEnemyEndpointVisible(vesselId) {
    const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    if (!v) return false;
    const isEnemy = isEnemyVessel(v);
    const q = isEnemy ? (window.KOSMOS?.intelSystem?.getVesselContact?.(vesselId)?.quality ?? 'unknown') : null;
    // POLISH P2a (CP17) — wróg w aktywnym starciu z graczem jest widoczny niezależnie od wywiadu (salwa otwierająca).
    return isEndpointVisibleInCombat({ isEnemy, quality: q, inPlayerEngagement: isEnemy && this._isCombatRevealed(vesselId) });
  }

  // POLISH P2a (CP17) — uczestnik aktywnego starcia DSCS, w którym walczy gracz.
  _isCombatRevealed(vesselId) {
    return isPlayerEngagement(window.KOSMOS?.deepSpaceCombatSystem?._findActiveEncounterContaining?.(vesselId));
  }

  // POLISH P2a (CP17) — zbiór statków aktywnych starć z udziałem gracza; przy zmianie (start, dołączenie, koniec starcia)
  // ponowne nałożenie widoczności wywiadu: w starciu — pełne krycie, po końcu — wg jakości wywiadu.
  _syncCombatReveal() {
    const now = new Set();
    for (const e of window.KOSMOS?.deepSpaceCombatSystem?.listActive?.() ?? []) {
      if (!isPlayerEngagement(e)) continue;
      for (const id of [...(e.sideA?.vesselIds ?? []), ...(e.sideA?.joinedVesselIds ?? []),
        ...(e.sideB?.vesselIds ?? []), ...(e.sideB?.joinedVesselIds ?? [])]) now.add(id);
    }
    const prev = this._combatRevealed;
    if (!now.size && !prev.size) return;
    const vm = window.KOSMOS?.vesselManager;
    for (const id of new Set([...now, ...prev])) {
      if (now.has(id) === prev.has(id)) continue;
      const v = vm?.getVessel?.(id);
      const entry = this._vessels.get(id);
      if (v && entry) this._applyVesselIntelVisibility(v, entry);
    }
    this._combatRevealed = now;
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

  // ARC CV-0b (Finding 612) — przyrząd bramki właściciela: tworzy, klonuje i niszczy obiekty THREE i losuje z
  // `rendererRandom`; licznik losowań gry zakłada `countGameDraws` (src/debug/RngWatch.js) wokół tego wywołania.
  // Obiekty nie trafiają do sceny. Konsola: KOSMOS.debug.rngCheck() — oczekiwane gameDraws: 0.
  debugRngCheck(n = 200) {
    const uuids = [];
    for (let i = 0; i < n; i++) {
      const geo = new THREE.SphereGeometry(0.01, 6, 6), mat = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(geo, mat);
      const lineGeo = new THREE.BufferGeometry(), lineMat = new THREE.LineBasicMaterial(), line = new THREE.Line(lineGeo, lineMat);
      const spriteMat = new THREE.SpriteMaterial(), sprite = new THREE.Sprite(spriteMat);
      const tex = new THREE.Texture(), group = new THREE.Group(), copy = mesh.clone();
      group.add(mesh, line, sprite, copy);
      uuids.push(geo.uuid, mat.uuid, mesh.uuid, lineGeo.uuid, lineMat.uuid, line.uuid, spriteMat.uuid, sprite.uuid,
        tex.uuid, tex.source.uuid, group.uuid, copy.uuid);
      geo.dispose(); mat.dispose(); lineGeo.dispose(); lineMat.dispose(); spriteMat.dispose(); tex.dispose();
      rendererRandom();
    }
    return { objects: uuids.length, uniqueUuids: new Set(uuids).size, rendererDraws: n };
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
    // ARKUSZ HUD paczka B (D-HUD-16) — `cfg.hudRole` (`primary` / `foreign` / `alert`): kolor materiału z roli motywu.
    if (cfg.hudRole) mesh.material?.color?.setHex?.(this._hud3dHex(cfg.hudRole));
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
    // POLISH P2a (CP14) — przy „Obserwuj” efekt walki nie większy na ekranie niż w kadrze auto-fokusu (`watchFxScale`);
    // macierz widoku bieżąca (pętla renderu woła to przed `render`). Poza „Obserwuj” — bez zmian.
    const watchFx = !!this._watch;
    if (watchFx) this.camera.updateMatrixWorld();
    for (const ef of this._activeEffects) {
      const age = nowMs - ef.startTime - ef.delay;
      if (age < 0) { ef.mesh.visible = false; keep.push(ef); continue; }  // czeka na delay
      if (age > ef.lifetime) { this._disposeFx(ef); continue; }
      ef.mesh.visible = true;
      const progress = age / ef.lifetime;
      const mat = ef.mesh.material;
      switch (ef.kind) {
        case 'beam':
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
          break;
        case 'ring':
        case 'ping':
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
          ef.mesh.scale.setScalar(ef.baseScale * (1 + progress * 3));
          break;
        case 'explosion': {  // kula ognia: scale 0→3, kolor biały→pomarańcz→czerwony
          const c = explosionColorRaw(progress);
          if (mat) {
            // ×FX_HDR_EXPLOSION — wartości >1 przekraczają próg bloomu (pipeline HDR)
            if (mat.color) mat.color.setRGB(c.r * FX_HDR_EXPLOSION, c.g * FX_HDR_EXPLOSION, c.b * FX_HDR_EXPLOSION);
            mat.opacity = 1 - progress * progress;  // trzyma jasność, szybki zanik na końcu
          }
          ef.mesh.scale.setScalar(ef.baseScale * (0.001 + progress * 3));
          break;
        }
        default:
          if (mat) mat.opacity = ef.baseOpacity * (1 - progress);
      }
      if (watchFx && FX_WATCH_CAPPED.has(ef.kind)) ef.mesh.scale.multiplyScalar(watchFxScale(this._viewDepth(ef.mesh.position)));
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
    if (entry._choreoExhaust) return;   // ARC CV-3b — statek na scenie z choreografią: smugą rządzi `_choreoExhaust` (co klatkę)
    if (!GAME_CONFIG.FEATURES?.fcCombatFx) { cone.visible = false; return; }
    const intensity = exhaustIntensityRaw({
      state:   vessel?.position?.state,
      isWreck: !!((this._cvVisWreck?.(vessel) ?? !!vessel?.isWreck) || entry.isWreck || entry.cvKilled),   // ARC CV-4a — zniszczenie pokazane: smuga zgaszona (CV-8a — wrak powtórki dopiero po zniszczeniu)
    });
    // Lekki flicker (throb silnika) — desync per statek przez _exhaustPhase. ARC CV-3b (Finding 677): faza z zegara prezentacji,
    // sceny bitwy — pauza zatrzymuje także smugi poza walką (§2.12-4).
    const flickMs = this._stageClock ? this._stageClock.nowMs : performance.now();
    const flick = 0.8 + 0.2 * Math.sin(flickMs * 0.02 + (entry._exhaustPhase ?? 0));
    if (this._nozzleGlowSet?.(entry, intensity, flick)) return;   // ARC CV-3c (`cvChoreo2`) — wylot dysz zamiast stożka (także w locie)
    if (intensity <= 0) { cone.visible = false; return; }
    cone.visible = true;
    if (cone.material) cone.material.opacity = 0.35 * intensity * flick;  // subtelne (było 0.5)
    // ARC CV-1a (Finding 619) — rama kanoniczna: smuga jednostkowa z czubkiem w dyszy z pliku hardpointów — długość i promień
    // z pokręteł `cvTuning.MODEL_PLUME_*` CO KLATKĘ (dawniej podłogi 0,03 × 0,024 WU — 1,9 L — wygrywały zawsze), migotanie
    // zmienia DŁUGOŚĆ smugi (dawne `scale.x` po obrocie π/2 zmieniało jej grubość).
    if (entry.canonical) {
      const T = this.cvTuning;
      const rad = Math.max(entry.rig?.nozzleR ?? 0.04, T.MODEL_PLUME_R_MIN ?? 0.03) * (T.MODEL_PLUME_R_MUL ?? 1);
      cone.scale.set(rad, (T.MODEL_PLUME_LEN ?? 0.8) * intensity * (0.85 + 0.3 * flick), rad);
      return;
    }
    cone.scale.x = intensity * (0.85 + 0.3 * flick);
  }

  // Eksplozja zniszczonego statku — kula ognia (scale 0→3, biały→pomarańcz→czerwony)
  // + pierścień uderzeniowy (radius 0→bboxSize×2). pos = world coords (sprite.position).
  // ARC CV-5 (flaga `cvDamage`) — z kontekstem (`ctx` = { id, vessel } — zniszczenie z rejestru salw albo `vessel:wrecked`): wybuch
  // WARSTWOWY w pulach silnika FX (`_cvDmgExplode` — sekwencja klasy, rozmiar z długości kadłuba, światło puli, dym, odłamki). Flaga OFF
  // albo bez kontekstu — dzisiejsza łata niżej, co do bitu.
  _spawnExplosion(pos, bboxSize, ctx = null) {
    if (!pos) return;
    if (ctx && this._cvDmgOn?.() && this._cvDmgExplode?.(ctx.id, ctx.vessel ?? null, pos, bboxSize)) return;
    // ARC CV-3a3 (Finding 653 (d), decyzja właściciela §3.2-11) — kula ognia w skali KADŁUBA: szczyt promienia (po wzroście ×3)
    // = rozmiar kadłuba × `cvTuning.STAGE_FIREBALL_K`, bez podłogi 0,2 j. i bez limitu ekranowego „Obserwuj” (kula idzie za statkiem
    // na ekranie). CV-Z — dawna podłoga i płaski pierścień uderzeniowy usunięte razem ze ścieżką bez sceny.
    const r0 = Math.max(1e-4, (this.cvTuning?.STAGE_FIREBALL_K ?? 1.5) * (bboxSize || VESSEL_TARGET_SIZE.frigate) / 3);
    // Kula ognia — MeshBasicMaterial + additive. Kolor HDR (×FX_HDR_EXPLOSION,
    // per-frame w _updateActiveEffects) przekracza próg bloomu → świeci naturalnie.
    const sph = new THREE.Mesh(
      new THREE.SphereGeometry(r0, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    sph.position.copy(pos);
    this._spawnFx(sph, { kind: 'explosion', lifetime: 600, baseScale: 1, baseOpacity: 1,
      onTick: (ef, p) => { ef.mesh.scale.setScalar(ef.baseScale * (0.001 + p * 3)); } });
  }

  // ── ARC CV-2b — szyna sygnałów walki (plan §2.9, F8, D-CV-19) ─────────────────────────────────────────
  // Szyna leniwie, przy pierwszej salwie / pierwszym wraku pod flagą; funkcje rzutu i wysyłki zbudowane RAZ (bez alokacji THREE
  // w klatce). Pozycja sygnału = pozycja RYSOWANA statku w chwili wysyłki (scena bitwy), panorama z przestrzeni kamery.
  _ensureCueBus() {
    if (this._cueBus) return this._cueBus;
    this._cueBus = new CombatCueBus({ tuning: this.cvTuning });
    const v = new THREE.Vector3();
    this._cueFlushOpts = {
      visible: true,
      resolvePos: (id) => { const e = this._vessels.get(id); return e?.sprite?.visible ? e.sprite.position : null; },
      project: (x, y, z, out) => {
        const cam = this.camera;
        if (!cam) return;
        v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
        out.pan = screenPan(v.x, v.z, Math.tan((cam.fov * Math.PI / 180) / 2) * (cam.aspect || 1));
        const cp = cam.position;
        out.dist = Math.hypot(x - cp.x, y - cp.y, z - cp.z);
      },
    };
    this._cueEmit = (cue) => EventBus.emit('combatfx:cue', cue);
    return this._cueBus;
  }

  // Wybuch wraku → „destroyed” (rozmiar z klasy kadłuba), od razu — razem z kulą ognia `_spawnExplosion`.
  _cueDestroyed(vesselId, vessel, entry) {
    const p = entry?.sprite?.position;
    if (!p) return;
    const cues = this._ensureCueBus();
    cues.schedule(this._presClock?.nowMs ?? 0, 'destroyed', null, cueSizeOfClass(vesselSizeClass(vessel)), p.x, p.y, p.z,
      vessel?.lastBattleId ?? null, vesselId ?? null);
  }

  // Raz na klatkę z `_tickCvFx`: sygnały, których czas nadszedł → `combatfx:cue` (tryb galaktyki — przepadają).
  _flushCues() {
    const o = this._cueFlushOpts;
    o.visible = !this._galaxyActive && !this._galaxyFlight;
    this._cueBus.flush(this._presClock.nowMs, this._cueEmit, o);
  }

  // ── ARC CV-4a — język broni i rejestr salw (flaga `cvWeapons`; plan §2.4, D-CV-8, D-CV-9; Findingi 614, 615, 637, 655 (i)) ──
  // Runda oglądanego starcia → rejestr (`CombatLedger.addRound`: harmonogram w czasie prezentacji) → efekty w pulach silnika
  // z czasami z rejestru (ładowanie lasera → wiązka; błysk wylotu → pocisk → iskry; start rakiety → tor łukiem; pudło leci za
  // cel), strzał z wieżyczki pliku hardpointów; sygnały walki w chwilach rejestru. HP pokazywane i zniszczenie — `_cvWpnTick`.
  // Bramka mgły wojny jak w CV-2a (`_combatEndpointWorld`): niewidoczny koniec — bez efektu i bez sygnału (rejestr i tak liczy
  // HP pokazywane). CV-Z — jedyna ścieżka salw (dawna salwa CV-2a `_cvFxRoundFx` i jej słuchacz `_onCombatRoundFx` usunięte).
  _cvWpnRoundFx(payload) {
    const F = GAME_CONFIG.FEATURES;
    if (!F?.fcCombatFx) return;
    if (!isEngagementInView({ encounterSystemId: payload?.systemId, activeSystemId: window.KOSMOS?.activeSystemId })) return;
    const events = payload?.events ?? [];
    if (!events.length || payload.encounterId == null || !Number.isFinite(payload.round)) return;
    const eng = this._ensureFxEngine();
    const led = this._cvLedger ?? (this._cvLedger = new CombatLedger({ tuning: this.cvTuning }));
    const R = window.KOSMOS?.timeSystem?.combatRoundMs?.() ?? 1150;   // zapas = domyślna klucza (CV-3c, decyzja 44 (1))
    const L = VESSEL_TARGET_SIZE.frigate;
    const gapL = (ev) => {
      const a = this._vessels.get(ev.attacker)?.sprite, t = this._vessels.get(ev.target)?.sprite;
      return a?.visible && t?.visible ? a.position.distanceTo(t.position) / L : NaN;
    };
    const rec = led.addRound({ encounterId: payload.encounterId, round: payload.round, seed: payload.seed ?? 0, events,
      nowMs: this._presClock.nowMs, roundMs: R, gapL });
    if (!rec) return;
    this._cvWpnStats.rounds++;
    if (this._cvShdOn?.()) this._cvShdPlanRound(rec, events);   // ARC CV-4b — bańka czy poszycie, rozpad (przed rysunkiem strzałów)
    const cues = this._ensureCueBus?.() ?? null;
    for (const x of rec.entries) this._cvWpnSpawn(eng, x, events[x.index], rec, cues, led);
  }

  // Jeden wpis rejestru → efekty (czasy bezwzględne zegara prezentacji). Końce śledzone: wieżyczka (tryb 2 — punkt modelu, obraca
  // się ze statkiem) albo przesunięcie w świecie (tryb 1); punkt trafienia — na kadłubie od strony strzelca, pudło — obok celu i dalej.
  _cvWpnSpawn(eng, x, ev, rec, cues, led) {
    // ARC CV-8a — strzał w pulę obrony planety: efekt na emiterze z ziarna wpisu (kopia wpisu wyłącznie dla rysunku — rejestr bez zmian)
    const fxT = this._cvOrb?.fxTarget?.(x);
    if (fxT) x = { ...x, target: fxT };
    // ARC CV-8a — powtórka bitwy orbitalnej: końce z kleju (sprite okrętu albo punkt na powierzchni: emiter, pula obrony, hangar);
    // atak na kolonię gracza to starcie z graczem — napastnik ujawniony jak w starciu DSCS z graczem (P2a CP17), bez bramki wywiadu
    const orbE = this._cvOrb?.isOrbitalEncounter?.(x.encounterId) ?? false;
    const aw = orbE ? this._cvOrb.endpoint(x.attacker) : this._combatEndpointWorld(x.attacker, ev?.aPos);
    const tw = orbE ? this._cvOrb.endpoint(x.target) : this._combatEndpointWorld(x.target, ev?.tPos);
    if (!aw || !tw) { this._cvWpnStats.hidden++; return; }   // mgła wojny — brak efektu i sygnału (brak przecieku)
    const T = this.cvTuning;
    const R = rec.R;
    const L = VESSEL_TARGET_SIZE.frigate;
    const vm = window.KOSMOS?.vesselManager;
    const av = vm?.getVessel?.(x.attacker), tv = vm?.getVessel?.(x.target);
    const aSize = av ? vesselTargetSize(av) : L, tSize = tv ? vesselTargetSize(tv) : L;
    const color = fxWeaponColor(x.category);
    const mz = this._cvWpnMuzzle(x.attacker, aw, tw, aSize);
    const mx = mz.x, my = mz.y, mzz = mz.z, mMode = mz.mode, mox = mz.ox, moy = mz.oy, moz = mz.oz;
    // kierunek strzelec → cel, oś prostopadła z ziarna (pudło, łuk rakiety)
    let dx = tw.x - mx, dy = (tw.y ?? 0.3) - my, dz = tw.z - mzz;
    const dl = Math.hypot(dx, dy, dz) || 1e-6;
    dx /= dl; dy /= dl; dz /= dl;
    const upX = Math.abs(dy) > 0.9 ? 1 : 0, upY = Math.abs(dy) > 0.9 ? 0 : 1;
    let p1x = dy * 0 - dz * upY, p1y = dz * upX - dx * 0, p1z = dx * upY - dy * upX;   // d × up
    const p1l = Math.hypot(p1x, p1y, p1z) || 1;
    p1x /= p1l; p1y /= p1l; p1z /= p1l;
    const p2x = dy * p1z - dz * p1y, p2y = dz * p1x - dx * p1z, p2z = dx * p1y - dy * p1x;   // d × p1
    const ang = x.u2 * Math.PI * 2;
    const px = p1x * Math.cos(ang) + p2x * Math.sin(ang), py = p1y * Math.cos(ang) + p2y * Math.sin(ang), pz = p1z * Math.cos(ang) + p2z * Math.sin(ang);
    // punkt końcowy względem środka celu (tryb 1): trafienie — kadłub od strony strzelca; pudło — obok celu i dalej za nim
    let ox, oy, oz;
    // ARC CV-4b (flaga `cvShields`) — trafienie kończy się na BAŃCE, dopóki osłona trzyma (plan rundy), inaczej na POSZYCIU (pod bańką);
    // rama kanoniczna — punkt modelu (tryb 2: obraca się ze statkiem). Flaga OFF — punkt CV-4a co do bitu.
    const shdEp = x.hit && x.shd && this._cvShdOn?.() ? this._cvShdEndPoint(x, tw, dx, dy, dz, tSize) : null;
    const endMode = shdEp ? shdEp.mode : 1;
    if (shdEp) { ox = shdEp.ox; oy = shdEp.oy; oz = shdEp.oz; }
    else if (x.hit) { const k = -0.35 * tSize; ox = dx * k; oy = dy * k; oz = dz * k; }
    else {
      const off = Math.max(0.5 * L, (T.WPN_MISS_OFFSET ?? 0.9) * tSize), over = Math.max(0, T.WPN_MISS_OVERSHOOT ?? 0.6) * dl;
      ox = px * off + dx * over; oy = py * off + dy * over; oz = pz * off + dz * over;
    }
    const tyy = tw.y ?? 0.3;
    const bx = shdEp ? shdEp.x : tw.x + ox, by = shdEp ? shdEp.y : tyy + oy, bz = shdEp ? shdEp.z : tw.z + oz;
    const alpha = x.hit ? 0.95 : 0.55;
    if (x.kind === 'laser') {
      eng.spawnMote({ t0: x.chargeAt, life: Math.max(1, x.fireAt - x.chargeAt), x: mx, y: my, z: mzz, color, alpha: 0.95,
        size: (T.WPN_CHARGE_K ?? 0.6) * aSize, kind: 2, grow: 1.8, minPx: 3, maxPx: 28, id: x.attacker, mode: mMode, ox: mox, oy: moy, oz: moz });
      eng.spawnBeam({ t0: x.fireAt, life: Math.max(1, x.beamEnd - x.fireAt), ax: mx, ay: my, az: mzz, bx, by, bz, color, alpha,
        aId: x.attacker, aMode: mMode, aox: mox, aoy: moy, aoz: moz, bId: x.target, bMode: endMode, box: ox, boy: oy, boz: oz });
    } else {
      const missile = x.kind === 'missile';
      eng.spawnMote({ t0: x.fireAt, life: Math.max(1, (missile ? 0.08 : (T.WPN_MUZZLE_LIFE ?? 0.1)) * R), x: mx, y: my, z: mzz,
        color: missile ? 0xffb070 : color, alpha: 1, size: (T.WPN_MUZZLE_K ?? 0.55) * aSize * (missile ? 0.7 : 1), kind: 1, grow: 1.6,
        minPx: 3, maxPx: 26, id: x.attacker, mode: mMode, ox: mox, oy: moy, oz: moz });
      const arc = missile ? Math.max(0, T.WPN_MISSILE_ARC ?? 0.3) * dl : 0;
      const ux = px, uy = py + 0.6, uz = pz;   // łuk rakiety: w bok z ziarna i w górę
      const ul = Math.hypot(ux, uy, uz) || 1;
      const flight = x.hit ? x.flight : x.flight * (1 + Math.max(0, T.WPN_MISS_OVERSHOOT ?? 0.6));
      // ARC CV-3c (decyzja 44 (7), `cvChoreo2`) — rakieta pod SMAA (High): kompensacja cienkiej smugi (głowa, szerokość — pokrętła
      // `WPN_SMAA_MISSILE_*`); bez SMAA — wartości CV-4a co do bitu
      // decyzja 45 (5) — także pocisk kinetyczny (`WPN_SMAA_KIN_*`)
      const smaaK = !!this._smaaPass?.enabled;
      eng.spawnBolt({ t0: x.fireAt, flight, trail: Math.max(1, (missile ? (T.WPN_MISSILE_TRAIL ?? 0.18) : (T.WPN_TRACER_LEN ?? 0.08)) * R),
        ax: mx, ay: my, az: mzz, bx, by, bz, cx: ux / ul * arc, cy: uy / ul * arc, cz: uz / ul * arc, color, alpha,
        widthMul: missile ? (T.WPN_MISSILE_WIDTH_MUL ?? 1.25) * (smaaK ? (T.WPN_SMAA_MISSILE_WIDTH_K ?? 1) : 1) : (smaaK ? (T.WPN_SMAA_KIN_WIDTH_K ?? 1) : 1),
        head: missile ? (T.WPN_MISSILE_HEAD ?? 2.5) * (smaaK ? (T.WPN_SMAA_MISSILE_HEAD_K ?? 1) : 1) : (T.WPN_KIN_HEAD ?? 1.2) * (smaaK ? (T.WPN_SMAA_KIN_HEAD_K ?? 1) : 1),
        miss: !x.hit, aId: x.attacker, aMode: mMode, aox: mox, aoy: moy, aoz: moz, bId: x.target, bMode: endMode, box: ox, boy: oy, boz: oz });
    }
    if (x.hit) this._cvWpnImpact(eng, x, bx, by, bz, ox, oy, oz, -dx, -dy, -dz, tSize, R, endMode);
    this._cvWpnStats.shots++;
    if (cues) {
      const weapon = cueWeaponOfCategory(x.category);
      cues.schedule(x.fireAt, 'fire', weapon, av ? cueSizeOfClass(vesselSizeClass(av)) : null, mx, my, mzz, x.encounterId, x.attacker);
      if (x.hit) cues.schedule(x.impactAt, x.blocked > 0 ? 'shieldHit' : 'impact', weapon, tv ? cueSizeOfClass(vesselSizeClass(tv)) : null,
        bx, by, bz, x.encounterId, x.target);
      // ARC CV-4b — rozpad osłony w chwili trafienia, które ją zbija (plan rundy; pokaz rozpadu w tej samej klatce — `_cvShdImpacts`)
      if (x.shd?.collapse) {
        cues.schedule(x.impactAt, 'shieldDown', null, tv ? cueSizeOfClass(vesselSizeClass(tv)) : null, bx, by, bz, x.encounterId, x.target);
        if (this._cvShd) this._cvShd.stats.cues++;   // odczyt `shieldInfo().liczniki.cues` — sygnały rozpadu z bitwy i z konsoli
      }
      if (x.killed) {
        const kAt = led.killAt(x.target);
        if (Number.isFinite(kAt)) cues.schedule(kAt, 'kill', null, tv ? cueSizeOfClass(vesselSizeClass(tv)) : null, tw.x, tyy, tw.z, x.encounterId, x.target);
      }
    }
  }

  // Trafienie: kadłub (obrażenia > 0) — iskry od kadłuba, żar, biały błysk; same osłony — cyjanowe iskry i poświata (bańka osłony
  // z falą — CV-4b). Liczba iskier z budżetu cząstek presetu (CV-2b). Kierunki iskier z ziarna wpisu (bez losowania gry).
  _cvWpnImpact(eng, x, bx, by, bz, ox, oy, oz, nx, ny, nz, tSize, R, mode = 1, tShift = 0, asHull = false) {
    const T = this.cvTuning;
    const L = VESSEL_TARGET_SIZE.frigate;
    // ARC CV-4b (flaga `cvShields`) — trafienie w BAŃKĘ: falę rysuje bańka osłony (`ShieldBubbles`) — bez iskier i bez łaty cyjanowej; trafienie
    // rozbijające z nadmiarem (`dmg` > 0) — iskry i żar CV-4a na POSZYCIU chwilę po błysku rozpadu (nadmiar przebija przez pancerz).
    if (!asHull && x.shd?.onBubble && this._cvShdOn?.()) {
      if (!x.shd.collapse || !(x.dmg > 0)) return;
      const delay = Math.max(0, T.SHD_HULL_DELAY ?? 0.035) * R;
      if (x.shdHull) {
        const w = this._cvShdHullW ?? (this._cvShdHullW = { x: 0, y: 0, z: 0 });
        if (!this._cvWpnResolveLocal(x.target, x.shdHull[0], x.shdHull[1], x.shdHull[2], w)) return;
        this._cvWpnImpact(eng, x, w.x, w.y, w.z, x.shdHull[0], x.shdHull[1], x.shdHull[2], nx, ny, nz, tSize, R, 2, delay, true);
      } else if (x.shdHullW) {
        const h = x.shdHullW;
        this._cvWpnImpact(eng, x, bx - ox + h[0], by - oy + h[1], bz - oz + h[2], h[0], h[1], h[2], nx, ny, nz, tSize, R, 1, delay, true);
      }
      return;
    }
    const t0 = x.impactAt + tShift;
    const missile = x.kind === 'missile';
    const hull = x.dmg > 0;
    const budget = this._gfx?.eff?.particles ?? 16000;
    const base = Math.max(0, T.WPN_SPARKS ?? 10) * (missile ? 1.5 : 1) * (hull ? 1 : 0.5);
    const n = base > 0 ? Math.max(1, Math.round(base * Math.min(1, budget / 16000))) : 0;
    const rnd = ledgerRng(x.seed);
    // ARC CV-3c (decyzja właściciela 44 (9) — „iskry i żar w zwolnionym tempie znikają dość szybko”) — skutki trafienia (iskry, żar, błysk)
    // to efekty uszkodzeń: idą w tempie `FX_TIME_SCALE` jak wybuchy (zegar efektów CV-5). Chwila trafienia zostaje w czasie prezentacji
    // (rejestr salw), życie × 1 / skala, prędkość iskier × skala — ten sam tor w zwolnionym tempie (ruch motka: p₀ + v·wiek·(1 − p / 2)).
    const fxS = Math.min(4, Math.max(0.05, Number(T.FX_TIME_SCALE ?? 1) || 1)), lifeK = 1 / fxS;
    const speed = Math.max(0, T.WPN_SPARK_SPEED ?? 3) * L / Math.max(1, R) * fxS;
    const sparkCol = hull ? 0xffd8a0 : FX_SHIELD_COLOR;
    for (let i = 0; i < n; i++) {
      let vx = nx + (rnd() * 2 - 1) * 0.9, vy = ny + (rnd() * 2 - 1) * 0.9, vz = nz + (rnd() * 2 - 1) * 0.9;
      const vl = Math.hypot(vx, vy, vz) || 1;
      const sp = speed * (0.5 + 0.7 * rnd()) / vl;
      eng.spawnMote({ t0, life: Math.max(1, (T.WPN_SPARK_LIFE ?? 0.35) * R * (0.6 + 0.4 * rnd()) * lifeK), x: bx, y: by, z: bz,
        vx: vx * sp, vy: vy * sp, vz: vz * sp, color: sparkCol, alpha: 1, size: (T.WPN_SPARK_SIZE ?? 0.18) * L, kind: 0, grow: 0.5,
        minPx: 1.5, maxPx: 6, id: x.target, mode, ox, oy, oz });
    }
    if (hull) {
      eng.spawnMote({ t0, life: Math.max(1, (T.WPN_GLOW_LIFE ?? 0.5) * R * lifeK), x: bx, y: by, z: bz, color: 0xff6a20, alpha: 0.9,
        size: (T.WPN_GLOW_K ?? 0.8) * tSize * (missile ? 1.4 : 1), kind: 1, grow: 1.3, minPx: 3, maxPx: 48, id: x.target, mode, ox, oy, oz });
      eng.spawnMote({ t0, life: Math.max(1, 0.08 * R * lifeK), x: bx, y: by, z: bz, color: 0xffffff, alpha: 1, size: 0.5 * tSize * (missile ? 1.5 : 1),
        kind: 1, grow: 1.6, minPx: 4, maxPx: 32, id: x.target, mode, ox, oy, oz });
    } else {
      eng.spawnMote({ t0, life: Math.max(1, 0.2 * R * lifeK), x: bx, y: by, z: bz, color: FX_SHIELD_COLOR, alpha: 0.8, size: 0.6 * tSize,
        kind: 1, grow: 1.4, minPx: 3, maxPx: 36, id: x.target, mode, ox, oy, oz });
    }
  }

  // Punkt w przestrzeni modelu statku → świat (wieżyczki śledzone co klatkę): rama kanoniczna — przez `canon` (kwaternion ramy
  // z choreografią, skala = rozmiar statku) i wrapper; inny rysunek — przesunięcie obrócone kwaternionem sprite'a.
  _cvWpnResolveLocal(id, lx, ly, lz, out) {
    const e = this._vessels.get(id);
    if (!e?.sprite?.visible) return false;
    const v = this._cvWpnV ?? (this._cvWpnV = new THREE.Vector3());
    if (e.canonical && e.rig?.canon) {
      const s = e.rig.canon.scale.x;
      v.set(lx * s, ly * s, lz * s).applyQuaternion(e.rig.canon.quaternion).applyQuaternion(e.sprite.quaternion).add(e.sprite.position);
    } else {
      v.set(lx, ly, lz).applyQuaternion(e.sprite.quaternion).add(e.sprite.position);
    }
    out.x = v.x; out.y = v.y; out.z = v.z;
    return true;
  }

  // Wylot strzału: wieżyczka z najlepszym namiarem na cel (`weapons[]` z pliku hardpointów; równe — po kolei), inaczej punkt na
  // kadłubie ku celowi z przewagą dziobu (sloty bez wieżyczek). Zwraca wspólny obiekt (skopiuj przed kolejnym wywołaniem).
  _cvWpnMuzzle(id, aw, tw, size) {
    const out = this._cvWpnMz ?? (this._cvWpnMz = { x: 0, y: 0, z: 0, mode: 1, ox: 0, oy: 0, oz: 0, turret: -1 });
    const e = this._vessels.get(id);
    const tl = this._cvWpnTL ?? (this._cvWpnTL = []);
    const turrets = e?.canonical ? e.rig?.weapons : null;
    if (turrets?.length && e.sprite?.visible) {
      tl.length = 0;
      for (let i = 0; i < turrets.length; i++) {
        const q = this._cvWpnTW?.[i] ?? ((this._cvWpnTW ??= [])[i] = { x: 0, y: 0, z: 0 });
        const p = turrets[i].p;
        this._cvWpnResolveLocal(id, p[0], p[1], p[2], q);
        tl.push(q);
      }
      const turn = this._cvWpnTurretTurn.get(id) ?? 0;
      const k = pickTurret({ turrets: tl, center: e.sprite.position, target: tw, counter: turn, tieCos: this.cvTuning.WPN_TURRET_TIE ?? 0.12 });
      this._cvWpnTurretTurn.set(id, turn + 1);
      const p = turrets[k].p;
      out.mode = 2; out.ox = p[0]; out.oy = p[1]; out.oz = p[2]; out.turret = k;
      out.x = tl[k].x; out.y = tl[k].y; out.z = tl[k].z;
      return out;
    }
    out.turret = -1;
    const v = this._cvWpnV ?? (this._cvWpnV = new THREE.Vector3());
    if (e?.canonical && e.rig?.canon && e.sprite?.visible) {
      // kierunek na cel w przestrzeni modelu → punkt na kadłubie: wzdłuż dziobu do 0,42, w bok 0,10 (model: najdłuższa oś = 1)
      const qi = this._cvWpnQ ?? (this._cvWpnQ = new THREE.Quaternion());
      v.set(tw.x - e.sprite.position.x, (tw.y ?? 0.3) - e.sprite.position.y, tw.z - e.sprite.position.z);
      qi.copy(e.sprite.quaternion).invert(); v.applyQuaternion(qi);
      qi.copy(e.rig.canon.quaternion).invert(); v.applyQuaternion(qi);
      v.normalize();
      const b = e.rig.frameBow ?? [-1, 0, 0];
      const along = v.x * b[0] + v.y * b[1] + v.z * b[2];
      const lx = v.x - b[0] * along, ly = v.y - b[1] * along, lz = v.z - b[2] * along;
      const k = 0.42 * Math.max(0.25, along);
      out.mode = 2; out.ox = b[0] * k + lx * 0.1; out.oy = b[1] * k + ly * 0.1; out.oz = b[2] * k + lz * 0.1;
      this._cvWpnResolveLocal(id, out.ox, out.oy, out.oz, out);
      return out;
    }
    // inny rysunek (sprite, model bez ramy): przesunięcie w świecie ku celowi
    let dx = tw.x - aw.x, dy = (tw.y ?? 0.3) - (aw.y ?? 0.3), dz = tw.z - aw.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const k = 0.35 * (size || VESSEL_TARGET_SIZE.frigate) / dl;
    out.mode = 1; out.ox = dx * k; out.oy = dy * k; out.oz = dz * k;
    out.x = aw.x + out.ox; out.y = (aw.y ?? 0.3) + out.oy; out.z = aw.z + out.oz;
    return out;
  }

  // Raz na klatkę (z `_tickCvFx`): rejestr do chwili prezentacji — trafienia (HP pokazywane schodzi samo, `presented`),
  // zniszczenia w swojej chwili (`_cvWpnPresentKill`); sprzątanie co ~2 s.
  _cvWpnTick() {
    const led = this._cvLedger;
    const now = this._presClock.nowMs;
    const { kills, impacts } = led.advance(now);
    if (impacts.length && (this._cvShd || this._cvShdOn?.())) this._cvShdImpacts?.(impacts);   // ARC CV-4b — fale, rozpad, osmalenia
    if (impacts.length) this._cvDir?.onImpacts(impacts);   // ARC CV-7 — wstrząs przy bliskich wielkich trafieniach
    for (const id of kills) this._cvWpnPresentKill(id);
    if (!(this._cvWpnPruneAt > now - 2000)) {
      this._cvWpnPruneAt = now;
      led.prune(now, new Set(this._cvEncList().map((e) => e.id)));   // ARC CV-8a — także starcia wirtualne powtórek
    }
  }

  // Zniszczenie w chwili trafienia zabijającego (D-CV-9, Findingi 615 / 655 (i)): dzisiejsza eksplozja (łata do CV-5), wygląd wraku
  // (materiały, smuga i światła gasną, przechył), sygnały „kill” (zaplanowany przy rundzie) i „destroyed” (z eksplozją). Okręt
  // przestaje strzelać z konstrukcji rejestru, choreografia przechodzi w postawę „wyłączony” (`aliveOf`). Późny `vessel:wrecked`
  // (koniec bitwy) — bez drugiego pokazu (`_cvWpnWreckGate`). Dokładnie raz na okręt — pilnuje tego flaga `entry.cvKilled`.
  _cvWpnPresentKill(id) {
    if (this._cvOrb?.presentKill?.(id)) return;   // ARC CV-8a — okręt z hangaru: wybuch na emiterze, sprite wraku po nim
    const e = this._vessels.get(id);
    if (!e || e.cvKilled) return;
    e.cvKilled = true;
    const v = window.KOSMOS?.vesselManager?.getVessel?.(id) ?? null;
    if (e.sprite?.visible && GAME_CONFIG.FEATURES?.fcCombatFx) {
      this._spawnExplosion(e.sprite.position, v ? vesselTargetSize(v) : VESSEL_TARGET_SIZE.frigate, { id, vessel: v });   // ARC CV-5 — kontekst
      this._cueDestroyed(id, v, e);
    }
    this._cvWpnKillLook(id, e);
    this._cvWpnStats.killsShown++;
    this._cvDir?.onKillShown(id);   // ARC CV-7 — wstrząs przy wybuchu w kadrze
    this._cvOrb?.afterKill?.(id);   // ARC CV-8a — zaległa zamiana we wrak okrętu bitwy orbitalnej (bez drugiej eksplozji)
  }

  // Wygląd wraku w chwili zniszczenia — rama kanoniczna (ten sam rysunek co zamiana we wrak przy `vessel:wrecked`); przechył: statek
  // z choreografią — narasta w `_choreoOrient` przez `WPN_KILL_TILT_MS` (choreografia pisze kurs co klatkę), bez — od razu jak OFF.
  // Inny rysunek (model bez ramy, sprite) — wygląd zostaje dla `vessel:wrecked` (eksplozja i gaśnięcie już teraz).
  _cvWpnKillLook(id, e) {
    if (!(e.canonical && e.rig)) return;
    paintRigMaterials(THREE, e.rig.materials, 'wreck', { burnHot: !!GAME_CONFIG.FEATURES?.fcCombatFx });
    if (e.rig.exhaust) e.rig.exhaust.visible = false;
    // ARC CV-3c — wyloty dysz gasną w chwili pokazanego zniszczenia (nie czekają na `_applyExhaust`: statek, który stanął — orbita, dryf —
    // nie dostaje już aktualizacji pozycji; pomiar w grze: wylot `cvExplode` świecił na wraku przez cały wybuch)
    for (const g of e.rig.glows ?? []) g.group.visible = false;
    if (e.rig.lights) { this._shipLightPool?.release(e.rig.lights); e.rig.lights = null; }
    const rz = (rendererRandom() - 0.5) * 0.6;   // ±0,3 rad — jak `_cvTiltWreck`
    const rx = (rendererRandom() - 0.5) * 0.4;
    e.cvKillTilt = { rx, rz, at: this._presClock.nowMs };
    if (!this._stageMarks?.get?.(id)?.ch) {
      const q = wreckTiltQuaternion(e.sprite.rotation.y, rx, rz);
      e.sprite.quaternion.set(q[0], q[1], q[2], q[3]);
    }
    e.cvWreckLook = true;
    if (this._cvDmgOn?.()) this._cvDmgWreckLook?.(id, e);   // ARC CV-5 — szwy stygnące od chwili wybuchu (odbudowany — od razu wystygły)
  }

  // `vessel:wrecked`, gdy rejestr istnieje (także po `cvWeapons(0)` w trakcie bitwy): zniszczenie już pokazane — bez drugiej
  // eksplozji i sygnału, wygląd zostaje; zaplanowane, jeszcze nie pokazane (trafienie zabijające w locie, gdy logika kończy bitwę)
  // — eksplozja i wygląd (rama kanoniczna) w chwili trafienia; okręt nieznany rejestrowi (bitwa poza widokiem, bez salwy, salwy po
  // przełączeniu na OFF) — dzisiejsza zamiana, odnotowana jako pokazana (jeden pokaz).
  _cvWpnWreckGate(vesselId, entry) {
    const led = this._cvLedger;
    if (!led || !entry) return null;
    const st = led.killState(vesselId);
    if (entry.cvKilled || st === 'shown') { this._cvWpnStats.wreckDeduped++; return { skipBoom: true, skipLook: !!entry.cvWreckLook }; }
    if (st === 'pending') { entry.cvWreckPending = true; this._cvWpnStats.wreckDeferred++; return { skipBoom: true, skipLook: !!(entry.canonical && entry.rig) }; }
    led.markKillShown(vesselId, this._presClock?.nowMs ?? 0);
    entry.cvKilled = true;
    this._cvWpnStats.wreckUnknown++;
    return null;
  }

  // ── ARC CV-4b — OSŁONY I PANCERZ (flaga `cvShields`; plan §2.4, §2.10; Finding 653 (b)) ──────────────────────────────────────
  // Plan rundy (`ShieldStates.planRound` — w chwili nadejścia, wpisy rejestru w kolejności trafień): strzał kończy się na BAŃCE, dopóki
  // osłona trzyma (koniec wiązki / pocisku tam, gdzie strzał spotyka elipsoidę bańki), inaczej na POSZYCIU (elipsoida wpisana w kadłub —
  // pod bańką); trafienie zbijające osłonę do zera (`shieldAfter` ≤ ε) — rozpad + sygnał `shieldDown` w chwili trafienia. Pokaz trafienia
  // (`_cvShdImpacts`, z `_cvWpnTick`): fala na bańce, rozpad, osmalenie kadłuba (High). Co klatkę (`_cvShdTick`): zegar efektów osłon
  // (prezentacja × FX_TIME_SCALE — pauza = pauza), próbki osłony POKAZYWANEJ (regeneracja — słaba fala, po rozpadzie powrót bańki), bańki
  // z puli (`ShieldBubbles`: pozycja i obrót sprite'a × rama kanoniczna — idą za sceną i choreografią), żar osmaleń. Statek bez osłony —
  // bez bańki. Wynik bitwy nietknięty (keeper `cv_fx_results` A9).

  /** Czy ścieżka CV-4b działa: efekty walki (`fcCombatFx`). */
  _cvShdOn() {
    const F = GAME_CONFIG.FEATURES;
    return !!F?.fcCombatFx;
  }

  _cvShdState() {
    if (this._cvShd) return this._cvShd;
    this._cvShd = {
      states: new ShieldStates({ tuning: this.cvTuning }),
      now: 0,                 // [ms] zegar efektów osłon (krok prezentacji × FX_TIME_SCALE)
      landed: new Map(),      // id → osłona zabrana przez trafienia pokazane w tej klatce (regeneracja = wzrost BEZ nich)
      scorch: new Map(),      // id → plamy osmalenia [{ t0, p:[x,y,z] }] (przestrzeń modelu)
      debug: new Map(),       // id → { sh, max, virtual, n } — `cvShieldHit` poza bitwą
      seen: new Set(),
      seeds: new Map(),
      v: new THREE.Vector3(), qi: new THREE.Quaternion(), u: { x: 0, y: 0, z: 0 }, p: {}, h: {},
      ep: { mode: 1, ox: 0, oy: 0, oz: 0, x: 0, y: 0, z: 0 },
      scorchOn: false,
      stats: { planned: 0, ripples: 0, collapses: 0, regens: 0, reforms: 0, hullHits: 0, scorch: 0, debugHits: 0, cues: 0 },
    };
    return this._cvShd;
  }

  /** Pula baniek (RAZ; rozgrzewka programu przy budowie — bez przycięcia przy pierwszym trafieniu). */
  _ensureShieldBubbles() {
    if (this._shieldBubbles) return this._shieldBubbles;
    if (!this._fxGroup) this._ensureFxEngine();
    this._shieldBubbles = new ShieldBubblePool({ THREE, parent: this._fxGroup, logDepth: logDepthOn() });
    this._shieldBubblesPrewarm = this._shieldBubbles.prewarm(this.renderer, this.camera);
    return this._shieldBubbles;
  }

  /** Budżet fal na bańkę z presetu (High 8 / Medium 4 / Low 1; presety OFF — High). */
  _cvShdRipples() {
    const n = this._gfx?.eff?.shieldRipples ?? null;
    return Number.isFinite(n) ? Math.max(1, Math.min(SHIELD_RIPPLES_MAX, n)) : SHIELD_RIPPLES_MAX;
  }

  /** Kierunek świata → przestrzeń statku: rama kanoniczna (sprite × rama, przestrzeń modelu) albo sam obrót sprite'a. */
  _cvShdDir(e, dx, dy, dz, out) {
    const st = this._cvShd;
    if (e?.canonical && e.rig?.canon) st.qi.copy(e.sprite.quaternion).multiply(e.rig.canon.quaternion).invert();
    else if (e?.sprite) st.qi.copy(e.sprite.quaternion).invert();
    else return null;
    st.v.set(dx, dy, dz).applyQuaternion(st.qi);
    out.x = st.v.x; out.y = st.v.y; out.z = st.v.z;
    return out;
  }

  /** Plan rundy osłon: pole ładunku `shieldAfter` na wpisach, osłona pokazywana i maks. z `vesselStates` starcia (pierwsze spojrzenie). */
  _cvShdPlanRound(rec, events) {
    const st = this._cvShdState();
    const led = this._cvLedger;
    const enc = this._cvEncList().find((e) => e.id === rec.encounterId) ?? null;
    for (const x of rec.entries) {
      const sa = Number(events[x.index]?.shieldAfter);
      x.shieldAfter = Number.isFinite(sa) ? sa : Infinity;   // brak pola (stary ładunek) — nigdy rozpad
    }
    st.states.planRound(rec.entries, (id) => {
      const s = enc?.vesselStates?.get?.(id);
      if (!s) return null;
      return { presented: led ? led.presented(id, s.hp, s.shieldHP, s.hpStart, s.shieldHPStart).shield : Math.max(0, s.shieldHP), max: s.shieldHPStart };
    });
    st.stats.planned += rec.entries.length;
  }

  /**
   * Punkt końcowy trafienia wg planu: na BAŃCE (elipsoida z półwymiarów kadłuba — `bubbleAxes`) albo na POSZYCIU (`hullPoint`), w kierunku
   * strzelca. Rama kanoniczna — punkt modelu (tryb 2) + świat; inny rysunek — przesunięcie w świecie (sfera 0,55 × rozmiar / 0,35 × rozmiar).
   * Zapisuje na wpisie `shdDir` (kierunek fali na sferze bańki), `shdHull` (punkt poszycia w przestrzeni modelu — iskry nadmiaru, osmalenie)
   * albo `shdHullW` (przesunięcie poszycia w świecie). Zwraca wspólny obiekt (skopiuj przed kolejnym wywołaniem).
   */
  _cvShdEndPoint(x, tw, dx, dy, dz, tSize) {
    const st = this._cvShdState();
    const e = this._vessels.get(x.target);
    const out = st.ep;
    const T = this.cvTuning;
    const onBubble = !!x.shd?.onBubble;
    if (e?.canonical && e.rig?.half && this._cvShdDir(e, -dx, -dy, -dz, st.u)) {
      const hp = hullPoint(e.rig.half, st.u.x, st.u.y, st.u.z, T, st.h);
      x.shdHull = [hp.x, hp.y, hp.z];
      let p = hp;
      if (onBubble) {
        p = ellipsoidPoint(bubbleAxes(e.rig.half, T), st.u.x, st.u.y, st.u.z, st.p);
        x.shdDir = [p.sx, p.sy, p.sz];
      }
      out.mode = 2; out.ox = p.x; out.oy = p.y; out.oz = p.z;
      if (!this._cvWpnResolveLocal(x.target, p.x, p.y, p.z, out)) { out.x = tw.x; out.y = tw.y ?? 0.3; out.z = tw.z; }
      return out;
    }
    const k = -(onBubble ? 0.55 : 0.35) * tSize;
    out.mode = 1; out.ox = dx * k; out.oy = dy * k; out.oz = dz * k;
    out.x = tw.x + out.ox; out.y = (tw.y ?? 0.3) + out.oy; out.z = tw.z + out.oz;
    x.shdHull = null;
    x.shdHullW = [-dx * 0.35 * tSize, -dy * 0.35 * tSize, -dz * 0.35 * tSize];
    if (onBubble && this._cvShdDir(e, -dx, -dy, -dz, st.u)) {
      const l = Math.hypot(st.u.x, st.u.y, st.u.z) || 1;
      x.shdDir = [st.u.x / l, st.u.y / l, st.u.z / l];
    }
    return out;
  }

  /** Trafienia pokazane w tej klatce (rejestr): fala na bańce / rozpad wg planu, osłona zabrana (regeneracja), osmalenie kadłuba (High). */
  _cvShdImpacts(impacts) {
    const st = this._cvShdState();
    const ripN = this._cvShdRipples();
    for (const x of impacts) {
      if (!x?.hit || !x.shd) continue;
      if (x.blocked > 0) st.landed.set(x.target, (st.landed.get(x.target) ?? 0) + x.blocked);
      const dir = x.shdDir ? { sx: x.shdDir[0], sy: x.shdDir[1], sz: x.shdDir[2] } : null;
      const r = st.states.impact(x, dir, st.now, { ripples: ripN });
      if (r?.ripple >= 0) st.stats.ripples++;
      if (r?.collapse) st.stats.collapses++;
      if (x.shd.hull && x.dmg > 0) {
        st.stats.hullHits++;
        if (x.shdHull) this._cvShdScorch(x.target, x.shdHull);
      }
    }
  }

  /** Raz na klatkę (z `_tickCvFx`, po rejestrze): zegar efektów osłon, próbki osłony pokazywanej, bańki, żar osmaleń. */
  _cvShdTick() {
    const on = this._cvShdOn();
    const st = this._cvShd ?? (on ? this._cvShdState() : null);
    if (!st) return;
    const T = this.cvTuning;
    st.now += (this._presClock?.lastStepMs ?? 0) * Math.max(0, Number(T?.FX_TIME_SCALE ?? 1) || 0);
    const seen = st.seen;
    seen.clear();
    if (on) {
      const K = window.KOSMOS;
      const led = this._cvLedger;
      for (const enc of this._cvEncList()) {
        if (!isEngagementInView({ encounterSystemId: enc.location?.systemId, activeSystemId: K?.activeSystemId })) continue;
        for (const [id, s] of enc.vesselStates ?? []) {
          if (!(s.shieldHPStart > 0)) continue;   // statek bez osłony — bez bańki
          const pr = led ? led.presented(id, s.hp, s.shieldHP, s.hpStart, s.shieldHPStart).shield : Math.max(0, s.shieldHP);
          const r = st.states.sample(id, { presented: pr, max: s.shieldHPStart, landed: st.landed.get(id) ?? 0, now: st.now });
          if (r?.shimmer) { if (r.reform) st.stats.reforms++; else st.stats.regens++; }
          seen.add(id);
        }
      }
      for (const [id, d] of st.debug) {
        if (seen.has(id)) continue;
        st.states.sample(id, { presented: d.sh, max: d.max, landed: st.landed.get(id) ?? 0, now: st.now });
        seen.add(id);
      }
    }
    st.landed.clear();
    const pool = this._shieldBubbles ?? (on && st.states.ships.size ? this._ensureShieldBubbles() : null);
    if (pool) this._cvShdBubbles(pool, st, seen);
    this._cvShdScorchTick(st);
  }

  // Bańki: stan → slot puli (przekształcenie z TEJ klatki — scena i choreografia już ustawiły sprite), uniformy; koniec — slot zwolniony.
  _cvShdBubbles(pool, st, seen) {
    const T = this.cvTuning;
    pool.root.visible = !this._galaxyActive;
    const sh = pool.shared;
    sh.uCore.value = T.SHD_CORE ?? 1.5; sh.uRim.value = T.SHD_RIM ?? 2.0; sh.uRimPow.value = Math.max(0.5, T.SHD_RIM_POW ?? 6);
    sh.uBack.value = T.SHD_BACK ?? 0.35; sh.uShell.value = T.SHD_SHELL ?? 0;
    sh.uCell.value = T.SHD_CELL ?? 6.5; sh.uCellGain.value = T.SHD_CELL_GAIN ?? 0.55; sh.uRipMs.value = Math.max(1, T.SHD_RIPPLE_MS ?? 720);
    sh.uRipSpeed.value = T.SHD_RIPPLE_SPEED ?? 2.6; sh.uRipWidth.value = Math.max(0.01, T.SHD_RIPPLE_WIDTH ?? 0.085);
    sh.uFlickHz.value = T.SHD_FLICKER_HZ ?? 11; sh.uColMs.value = Math.max(1, T.SHD_COLLAPSE_MS ?? 900);
    sh.uColFlash.value = T.SHD_COLLAPSE_FLASH ?? 1.8; sh.uShMs.value = Math.max(1, T.SHD_SHIMMER_MS ?? 650);
    sh.uTimeS.value = (st.now / 1000) % 600;
    const ripN = this._cvShdRipples();
    const ripMs = Math.max(1, T.SHD_RIPPLE_MS ?? 720);
    const vm = window.KOSMOS?.vesselManager;
    for (const [id, s] of st.states.ships) {
      const e = this._vessels.get(id);
      const dead = !e?.sprite || e.cvKilled || e.isWreck;
      const v = dead ? null : st.states.visual(id, st.now);
      if (!v?.visible || !e.sprite.visible) {
        pool.release(id);
        if (dead || (!seen.has(id) && !st.debug.has(id))) st.states.drop(id);
        continue;
      }
      const slot = pool.acquire(id, st.now);
      const m = slot.mesh;
      const grow = v.collapseAge >= 0 ? 1 + Math.max(0, T.SHD_COLLAPSE_GROW ?? 0.14) * (v.collapseAge / Math.max(1, T.SHD_COLLAPSE_MS ?? 900)) : 1;
      m.position.copy(e.sprite.position);
      if (e.canonical && e.rig?.canon && e.rig.half) {
        const ax = bubbleAxes(e.rig.half, T);
        const sc = e.rig.canon.scale.x * grow;
        m.quaternion.copy(e.sprite.quaternion).multiply(e.rig.canon.quaternion);
        m.scale.set(ax[0] * sc, ax[1] * sc, ax[2] * sc);
      } else {
        const ves = vm?.getVessel?.(id);
        m.quaternion.copy(e.sprite.quaternion);
        m.scale.setScalar(0.55 * (ves ? vesselTargetSize(ves) : VESSEL_TARGET_SIZE.frigate) * grow);
      }
      const u = slot.u;
      u.uFade.value = v.fade; u.uBright.value = v.bright; u.uFlicker.value = v.flicker; u.uCrisp.value = v.crisp;
      u.uCol.value = v.collapseAge; u.uSh.value = v.shimmerAge; u.uShGain.value = v.shimmerGain; u.uCount.value = ripN;
      let seed = st.seeds.get(id);
      if (seed === undefined) { seed = (ledgerHash('cv4b-cells', id) % 997) / 7.3; st.seeds.set(id, seed); }
      u.uSeed.value = seed;
      const ra = u.uRip.value, am = u.uRipAmp.value;
      for (let i = 0; i < SHIELD_RIPPLES_MAX; i++) {
        const r = s.ripples[i];
        const age = st.now - r.t0;
        const o = i * 4;
        ra[o] = r.sx; ra[o + 1] = r.sy; ra[o + 2] = r.sz;
        ra[o + 3] = i < ripN && age >= 0 && age < ripMs ? age : -1;
        am[i] = r.amp;
      }
      m.visible = true;
    }
  }

  // Osmalenie kadłuba w punkcie modelu (High): pula statku (najstarsza zastępowana), na wszystkie materiały rigu (przestrzeń geometrii siatki).
  _cvShdScorch(id, p) {
    if (!scorchEnabled(this._gfx?.eff ?? null)) return;
    const st = this._cvShdState();
    const e = this._vessels.get(id);
    if (!(e?.canonical && e.rig?.scorchXf?.length)) return;
    let list = st.scorch.get(id);
    if (!list) { list = []; st.scorch.set(id, list); }
    const k = allocScorch(list, Math.min(SCORCH_MAX, KC_SCORCH_MAX), st.now);
    list[k].p[0] = p[0]; list[k].p[1] = p[1]; list[k].p[2] = p[2];
    this._cvShdApplyScorch(e, list, st.now);
    st.scorchOn = true;
    st.stats.scorch++;
  }

  _cvShdApplyScorch(e, list, now) {
    const T = this.cvTuning;
    const r = Math.max(1e-4, T.SCORCH_R ?? 0.085);
    for (const xf of e.rig?.scorchXf ?? []) {
      const m = xf.inv;
      for (let i = 0; i < list.length; i++) {
        const p = list[i].p;
        setKeyColourScorch(xf.mat, i,
          m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
          m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
          m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
          r / (xf.s2m || 1), scorchHeat(now - list[i].t0, T));
      }
      setKeyColourScorchCount(xf.mat, list.length);
    }
  }

  // Żar plam stygnie (tylko dopóki coś jest ciepłe); preset bez osmaleń (Medium / Low) — plamy zdjęte; statek usunięty — zapis zdjęty.
  _cvShdScorchTick(st) {
    if (!st.scorchOn) return;
    const on = scorchEnabled(this._gfx?.eff ?? null);
    const T = this.cvTuning;
    const cool = Math.max(1, T.SCORCH_COOL_MS ?? 1800);
    for (const [id, list] of st.scorch) {
      const e = this._vessels.get(id);
      if (!e) { st.scorch.delete(id); continue; }
      if (!on) {
        for (const xf of e.rig?.scorchXf ?? []) setKeyColourScorchCount(xf.mat, 0);
        st.scorch.delete(id);
        continue;
      }
      let hot = false;
      for (const s of list) if (st.now - s.t0 < cool + 50) { hot = true; break; }
      if (!hot) continue;
      for (const xf of e.rig?.scorchXf ?? []) for (let i = 0; i < list.length; i++) setKeyColourScorchHeat(xf.mat, i, scorchHeat(st.now - list[i].t0, T));
    }
    if (!st.scorch.size) st.scorchOn = false;
  }

  /** Rig przebudowany (zmiana presetu, wczytanie): osmalenia statku wracają na nowe materiały (High). */
  _cvShdReapplyScorch(id, e) {
    const list = this._cvShd?.scorch?.get?.(id);
    if (!list?.length || !(e?.canonical && e.rig?.scorchXf?.length)) return;
    if (!scorchEnabled(this._gfx?.eff ?? null)) return;
    this._cvShdApplyScorch(e, list, this._cvShd.now);
  }

  /**
   * ARC CV-4b — `KOSMOS.debug.cvShieldHit(...)`: trafienie w osłonę statku poza bitwą (parada / bitwa po końcu) — tylko prezentacja: każde
   * wywołanie zabiera ~42 % osłony (`maxHint` — osłona z modułów; brak — osłona wirtualna 35), trzecie ją rozbija, kolejne trafiają kadłub
   * (iskry, żar, osmalenie na High). Kierunek — od strony kamery z rozrzutem z ziarna. Zwolnione tempo: `cvTuning.FX_TIME_SCALE`.
   */
  cvShieldHitVessel(id, { maxHint = 0 } = {}) {
    if (!this._cvShdOn()) return { ok: false, reason: 'cvShields_off' };
    const e = this._vessels.get(id);
    if (!e?.sprite?.visible) return { ok: false, reason: 'not_visible' };
    if (e.cvKilled || e.isWreck) return { ok: false, reason: 'wreck' };
    if (window.KOSMOS?.deepSpaceCombatSystem?._findActiveEncounterContaining?.(id)) return { ok: false, reason: 'in_battle' };
    const st = this._cvShdState();
    const eng = this._ensureFxEngine();
    this._ensureShieldBubbles();
    const v = window.KOSMOS?.vesselManager?.getVessel?.(id) ?? null;
    let d = st.debug.get(id);
    if (!d) {
      const mx = Number(maxHint) > 0 ? Number(maxHint) : 35;
      d = { max: mx, sh: mx, virtual: !(Number(maxHint) > 0), n: 0 };
      st.debug.set(id, d);
    }
    d.n++;
    const sp = e.sprite.position, cp = this.camera.position;
    const rnd = ledgerRng(ledgerHash('cv4b-hit', id, d.n));
    let ux = cp.x - sp.x, uy = cp.y - sp.y, uz = cp.z - sp.z;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux = ux / ul + (rnd() * 2 - 1) * 0.6; uy = uy / ul + (rnd() * 2 - 1) * 0.6; uz = uz / ul + (rnd() * 2 - 1) * 0.6;
    const ul2 = Math.hypot(ux, uy, uz) || 1;
    const dx = -ux / ul2, dy = -uy / ul2, dz = -uz / ul2;   // kierunek strzału (strzelec → cel)
    const full = 0.42 * d.max;
    const blocked = Math.min(d.sh, full);
    const dmg = blocked < full ? Math.max(1, full - blocked) : 0;   // nadmiar przez pancerz — minimum 1 jak w DSCS
    const before = d.sh;
    d.sh = Math.max(0, d.sh - blocked);
    const now = this._presClock?.nowMs ?? 0;
    const R = window.KOSMOS?.timeSystem?.combatRoundMs?.() ?? 1150;
    const x = { encounterId: null, round: d.n, index: 0, attacker: null, target: id, kind: 'kinetic', category: 'medium', hit: true,
      dmg, blocked, shieldAfter: d.sh, killed: false, fireAt: now, impactAt: now, seed: ledgerHash('cv4b-hit-fx', id, d.n), u1: rnd(), u2: rnd(), u3: rnd() };
    st.states.planRound([x], () => ({ presented: before, max: d.max }));
    const tSize = v ? vesselTargetSize(v) : VESSEL_TARGET_SIZE.frigate;
    const ep = this._cvShdEndPoint(x, sp, dx, dy, dz, tSize);
    this._cvWpnImpact(eng, x, ep.x, ep.y, ep.z, ep.ox, ep.oy, ep.oz, -dx, -dy, -dz, tSize, R, ep.mode);
    this._cvShdImpacts([x]);
    {
      const cues = this._ensureCueBus?.();
      const size = v ? cueSizeOfClass(vesselSizeClass(v)) : null;
      cues?.schedule(now, x.shd.onBubble ? 'shieldHit' : 'impact', 'kinetic', size, ep.x, ep.y, ep.z, null, id);
      if (x.shd.collapse) { cues?.schedule(now, 'shieldDown', null, size, ep.x, ep.y, ep.z, null, id); st.stats.cues++; }
    }
    st.stats.debugHits++;
    return { ok: true, id, name: v?.name ?? id, hit: d.n, shield: Number(d.sh.toFixed(2)), max: d.max, virtualShield: d.virtual,
      onBubble: x.shd.onBubble, collapse: x.shd.collapse, hull: x.shd.hull && dmg > 0,
      scorch: (st.scorch.get(id)?.length ?? 0), fxTimeScale: this.cvTuning?.FX_TIME_SCALE ?? 1, paused: !!window.KOSMOS?.timeSystem?.isPaused };
  }

  /** ARC CV-4b — odczyt: stan osłon (bańka podniesiona / opadła, siła, fale), pula baniek, osmalenia, liczniki, budżet fal presetu. */
  cvShieldInfo() {
    const st = this._cvShd;
    const vm = window.KOSMOS?.vesselManager;
    const ships = [];
    if (st) {
      for (const [id, s] of st.states.ships) {
        const v = st.states.visual(id, st.now);
        ships.push({ statek: vm?.getVessel?.(id)?.name ?? id, maks: s.max, sila: Number((s.frac ?? 0).toFixed(3)), banka: s.dispUp ? 'trzyma' : 'opadla',
          widoczna: !!v?.visible, fale: s.stats.ripples, rozpady: s.stats.collapses, regeneracje: s.stats.regens, powroty: s.stats.reforms,
          osmalenia: st.scorch.get(id)?.length ?? 0 });
      }
    }
    return { on: this._cvShdOn(), fxTimeScale: this.cvTuning?.FX_TIME_SCALE ?? 1,
      faleNaBanke: this._cvShdRipples(), osmaleniaWlaczone: scorchEnabled(this._gfx?.eff ?? null),
      zegarMs: st ? Math.round(st.now) : null, statki: ships, liczniki: st ? { ...st.stats, plan: { ...st.states.stats } } : null,
      pula: this._shieldBubbles?.stats() ?? null, rozgrzewka: this._shieldBubblesPrewarm ?? null };
  }

  // ── ARC CV-5 — WYBUCHY, STANY USZKODZEŃ, PŁONĄCE WRAKI (flaga `cvDamage`; plan §2.5, §2.10; Findingi 615, 618, 619, 620, 627,
  // 641, 644, 702) ───────────────────────────────────────────────────────────────────────────────────────────────────────
  // Zegar efektów uszkodzeń = krok zegara prezentacji × `cvTuning.FX_TIME_SCALE` (zwolnione tempo wyłącznie prezentacji; pauza =
  // pauza). Śmierć okrętu (trafienie zabijające z rejestru salw albo `vessel:wrecked`) → plan klasy (`ExplosionLogic.explosionPlan`:
  // wybuchy wtórne w punktach uszkodzeń kadłuba, potem główny — błysk, smuga anamorficzna, płaty kuli ognia, fala uderzeniowa,
  // odłamki, żar, dym, światło puli, sygnał `explosion`), wpisy wypuszczane w swojej chwili w BIEŻĄCEJ pozycji statku. Wrak — szwy
  // stygnące w 10–20 s (wstawka koloru-klucza, `uKcBurnMode` 1), 1–2 pożary gasnące, dryf i obrót w kopercie (choreografia), zbieżność
  // do pozycji logicznej po końcu bitwy (Finding 627). Stany uszkodzeń z HP POKAZYWANEGO: dym ≤ 75 %, ogień ≤ 50 %, krztuszący się
  // silnik ≤ 25 %. Budżety z presetu (`explosionBudget`); strzałów nic tu nie dotyka. Wynik bitwy nietknięty (keeper `cv_fx_results` A8).

  /** Czy ścieżka CV-5 działa: efekty walki (`fcCombatFx`). */
  _cvDmgOn() {
    const F = GAME_CONFIG.FEATURES;
    return !!F?.fcCombatFx;
  }

  _cvDmgState() {
    if (this._cvDmg) return this._cvDmg;
    this._cvDmg = { now: this._presClock?.nowMs ?? 0, prev: this._presClock?.nowMs ?? 0, seqs: [],
      p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0 },
      stats: { explosions: 0, frigate: 0, destroyer: 0, battleship: 0, secondaries: 0, lights: 0, lightsRefused: 0, debris: 0, cues: 0,
        dmgSmoke: 0, dmgFire: 0, sputterSparks: 0, wreckFires: 0, wrecksBurning: 0, converged: 0 } };
    return this._cvDmg;
  }

  // Raz na klatkę (z `_tickCvFx`, przed przesłaniem pul): zegar efektów, sekwencje wybuchów, wraki (żar, pożary, zbieżność), stany
  // uszkodzeń żywych uczestników oglądanych starć. Flaga OFF przy żywym stanie — sekwencje i wraki dobiegają, nowych emiterów brak.
  _cvDmgTick() {
    const on = this._cvDmgOn();
    const st = this._cvDmg ?? (on ? this._cvDmgState() : null);
    if (!st) return;
    const scale = Math.max(0, Number(this.cvTuning?.FX_TIME_SCALE ?? 1) || 0);
    st.prev = st.now;
    st.now += (this._presClock?.lastStepMs ?? 0) * scale;
    KC_SHARED.uKcTime.value = st.now;                                   // iskry zimnych wraków migają na zegarze efektów
    KC_SHARED.uKcSeamFreq.value = this.cvTuning?.WRECK_SEAM_FREQ ?? 9;
    const eng = this._fxEngine ?? (on ? this._ensureFxEngine() : null);
    if (!eng) return;
    for (let i = st.seqs.length - 1; i >= 0; i--) if (this._cvDmgRunSeq(eng, st.seqs[i], st.now)) st.seqs.splice(i, 1);
    this._cvDmgWrecks(eng, st, on);
    if (on) this._cvDmgStates(eng, st);
  }

  /**
   * Śmierć okrętu (wywołuje `_spawnExplosion` z kontekstem): plan klasy i sekwencja w czasie efektów. Zwraca false, gdy statek nie ma
   * rysunku (dzisiejsza ścieżka nic by nie pokazała tak samo).
   */
  _cvDmgExplode(id, vessel, pos, size) {
    const e = id != null ? this._vessels.get(id) : null;
    if (!e?.sprite) return false;
    const st = this._cvDmgState();
    const eng = this._ensureFxEngine();
    const cls = explosionClassOf(vessel ? vesselSizeClass(vessel) : null);
    const Ls = size > 0 ? size : (vessel ? vesselTargetSize(vessel) : VESSEL_TARGET_SIZE.frigate);
    const seed = explosionSeed(id, vessel?.lastBattleId ?? '');
    const budget = explosionBudget(this._gfx?.eff ?? null);
    const plan = explosionPlan({ cls, lengthWU: Ls, seed, budget, tuning: this.cvTuning });
    const seq = { id, plan, t0: st.now, next: 0, cls, Ls, enemy: vessel ? isEnemyVessel(vessel) : false,
      last: { x: pos?.x ?? e.sprite.position.x, y: pos?.y ?? e.sprite.position.y, z: pos?.z ?? e.sprite.position.z },
      encId: window.KOSMOS?.deepSpaceCombatSystem?._findActiveEncounterContaining?.(id)?.id ?? vessel?.lastBattleId ?? null };
    st.seqs.push(seq);
    e.cvBlastAt = st.now;
    e.cvWreckSeed = seed;
    e.cvWreckCls = cls;
    this._cvWreckEpoch?.set(id, { t0: st.now, seed, cls });   // oś dryfu dla wraku odbudowanego w tej sesji
    st.stats.explosions++;
    st.stats[cls] = (st.stats[cls] ?? 0) + 1;
    st.stats.secondaries += plan.secondaries.length;
    if (this._cvDmgRunSeq(eng, seq, st.now)) st.seqs.splice(st.seqs.indexOf(seq), 1);   // błysk (i wtórny w chwili 0) jeszcze w tej klatce
    return true;
  }

  // Punkt uszkodzenia `idx` statku → świat (`out`) i opis śledzenia (tryb 2 — punkt modelu, obraca się ze statkiem); bez rigu — przesunięcie
  // w świecie wzdłuż kadłuba (tryb 1). Statek bez rysunku — ostatnia znana pozycja sekwencji (`fallback`).
  _cvDmgPoint(id, e, idx, Ls, out, fallback = null) {
    const pts = e?.canonical ? e.rig?.damagePoints : null;
    const p = pts?.[((idx % 3) + 3) % 3] ?? null;
    if (p && e.sprite?.visible && this._cvWpnResolveLocal(id, p[0], p[1], p[2], out)) {
      out.mode = 2; out.ox = p[0]; out.oy = p[1]; out.oz = p[2];
      return out;
    }
    const base = e?.sprite?.visible ? e.sprite.position : fallback;
    const k = (idx === 0 ? 0.25 : idx === 1 ? 0 : -0.26) * (Ls || VESSEL_TARGET_SIZE.frigate);
    out.mode = 1; out.ox = k; out.oy = 0.04 * (Ls || 0); out.oz = 0;
    out.x = (base?.x ?? 0) + out.ox; out.y = (base?.y ?? 0.3) + out.oy; out.z = (base?.z ?? 0) + out.oz;
    return out;
  }

  // Wpisy planu, których chwila nadeszła → pule (pozycja statku TERAZ — dryf sceny i wraku nie odrywa wybuchu od kadłuba). True — koniec.
  _cvDmgRunSeq(eng, seq, now) {
    const sp = seq.plan.spawns;
    const st = this._cvDmg;
    const e = this._vessels.get(seq.id);
    const vis = !!e?.sprite?.visible;
    if (vis) { seq.last.x = e.sprite.position.x; seq.last.y = e.sprite.position.y; seq.last.z = e.sprite.position.z; }
    const scale = Math.max(1e-3, Number(this.cvTuning?.FX_TIME_SCALE ?? 1) || 1);
    while (seq.next < sp.length) {
      const r = sp[seq.next];
      const at = seq.t0 + r.at;
      if (at > now + 1e-6) break;
      seq.next++;
      if (this._galaxyActive) continue;   // tryb galaktyki — sekwencja biegnie dalej bez rysunku
      const a = typeof r.anchor === 'number' ? this._cvDmgPoint(seq.id, e, r.anchor, seq.Ls, st.p, seq.last) : null;
      const cx = a ? a.x : seq.last.x, cy = a ? a.y : seq.last.y, cz = a ? a.z : seq.last.z;
      const sd = expSeedUnit(r.seed ?? 0, 3);
      switch (r.kind) {
        case 'flash':
          eng.spawnBlast({ t0: at, life: r.life, kind: 0, x: cx, y: cy, z: cz, size: r.size, color: 0xfff1d0, minPx: 7, seed01: sd });
          break;
        case 'streak':
          eng.spawnBlast({ t0: at, life: r.life, kind: 1, x: cx, y: cy, z: cz, size: r.size, color: 0xd8e6ff, minPx: 22, seed01: sd, aspect: r.aspect });
          break;
        case 'lobe':
          eng.spawnBlast({ t0: at, life: r.life, kind: 2, x: cx + r.ox, y: cy + r.oy, z: cz + r.oz, vx: r.vx, vy: r.vy, vz: r.vz,
            size: r.size, color: 0xffffff, alpha: 1, minPx: 5, seed01: sd });
          break;
        case 'ring': {
          const up = this._cvDmgUp ?? (this._cvDmgUp = new THREE.Vector3());
          up.set(0, 1, 0);
          if (vis) up.applyQuaternion(e.sprite.quaternion);
          eng.spawnBlast({ t0: at, life: r.life, kind: 5, x: cx, y: cy, z: cz, size: r.size, color: 0xffc890, alpha: 1, seed01: sd, axis: [up.x, up.y, up.z] });
          break;
        }
        case 'ember':
          eng.spawnBlast({ t0: at, life: r.life, kind: 3, x: cx + r.ox, y: cy + r.oy, z: cz + r.oz, vx: r.vx, vy: r.vy, vz: r.vz,
            size: r.size, color: 0xffd090, alpha: 1, minPx: 1.6, seed01: sd });
          break;
        case 'smoke':
          eng.spawnBlast({ t0: at, life: r.life, kind: 6, x: cx + r.ox, y: cy + r.oy, z: cz + r.oz, vx: r.vx, vy: r.vy, vz: r.vz,
            size: r.size, color: 0x2a2521, alpha: 0.78, minPx: 4, seed01: sd });
          break;
        case 'debris':
          eng.spawnDebris({ t0: at, life: r.life, x: cx + r.ox, y: cy + r.oy, z: cz + r.oz, vx: r.vx, vy: r.vy, vz: r.vz,
            ax: r.axis[0], ay: r.axis[1], az: r.axis[2], spin: r.spin, size: r.size, sx: r.stretch[0], sy: r.stretch[1], sz: r.stretch[2],
            shade: r.shade, color: seq.enemy ? 0x5c4844 : 0x50565e,
            // ARC CV-3c (`cvChoreo2`, decyzja 44 (7)) — nieregularne odłamki blachy (wariant z ziarna wpisu), żar tylko na krawędziach
            shape: 1 + ((r.seed >>> 0) % 4), edgeHot: true });
          st.stats.debris++;
          break;
        case 'light': {
          const pool = this._fxLightPool;
          const slot = pool ? pool.flash(cx, cy, cz, this.cvTuning?.EXP_LIGHT_COLOR ?? 0xffb070, at,
            { intensity: r.peak, range: r.range, attackMs: r.attack, holdMs: 0, fadeMs: r.fade }) : -1;
          if (slot >= 0) st.stats.lights++; else st.stats.lightsRefused++;
          break;
        }
        case 'cue': {
          const cues = this._ensureCueBus?.();
          cues?.schedule((this._presClock?.nowMs ?? 0) + Math.max(0, at - now) / scale, 'explosion', null, r.size, cx, cy, cz, seq.encId, seq.id);
          st.stats.cues++;
          break;
        }
        default: break;
      }
    }
    return seq.next >= sp.length;
  }

  /**
   * Wygląd wraku CV-5: szwy stygnące od chwili wybuchu (`e.cvBlastAt` na zegarze efektów); wrak odbudowany (wczytanie, zmiana układu,
   * przebudowa po zmianie presetu) — od razu wystygły, bez powtórki wybuchu. Pożary w punktach uszkodzeń (okna `wreckFireWindow`).
   */
  _cvDmgWreckLook(id, e) {
    if (!(e?.canonical && e.rig)) return;
    const st = this._cvDmgState();
    const v = window.KOSMOS?.vesselManager?.getVessel?.(id) ?? null;
    const ep = this._cvWreckEpoch?.get(id) ?? null;   // odbudowany w tej sesji: oś dryfu, ziarno i klasa z chwili wybuchu
    const cls = e.cvWreckCls ?? ep?.cls ?? explosionClassOf(v ? vesselSizeClass(v) : null);
    const seed = e.cvWreckSeed ?? ep?.seed ?? explosionSeed(id, v?.lastBattleId ?? '');
    const t0 = Number.isFinite(e.cvBlastAt) ? e.cvBlastAt : null;
    const tDrift = t0 ?? ep?.t0 ?? null;   // żar odbudowanego — wystygły (t0 null), dryf i obrót — dalej z tej samej osi
    let fireEnd = 0;
    for (let i = 0; i < 3; i++) { const w = wreckFireWindow(i, cls, seed, this.cvTuning); if (w) fireEnd = Math.max(fireEnd, w.end); }
    e.cvWreck = { t0, tDrift, seed, cls, heat: -1, fireEnd, last: t0 ?? st.now, conv: e.cvWreck?.conv ?? null, tumbleBaked: false };
    // ARC CV-3c — wrak odbudowany po dryfie z tej sesji: to samo przesunięcie od pozycji logicznej (bez powtórki obrotu)
    // (podstawa — pozycja sprite'a przy pierwszym kroku: odbudowa stawia go na pozycji logicznej PO tym wywołaniu)
    if (Number.isFinite(ep?.afterT0) && e.sprite && !e.cvWreck.conv) {
      e.cvWreck.after = { t0: ep.afterT0, base: null, q0: null, rotate: false, done: false };
    } else if (t0 != null && e.isWreck && e.cvWreckPending && e.sprite && !e.cvWreck.conv) {
      // ARC CV-3c — zniszczenie odroczone do trafienia w locie, pokazane PO zbieżności (wrak stoi już w miejscu śmierci): dryf rusza od
      // wybuchu — z bieżącej pozycji i obrotu (przechył wraku; obrót łapany przy pierwszym kroku), łagodnie od zera
      e.cvWreck.after = { t0: st.now, base: null, q0: null, rotate: true, done: false };
      if (ep) ep.afterT0 = st.now;
    }
    this._cvDmgPaintHeat(e, t0 == null ? wreckHeatAt(Infinity, this.cvTuning) : 1);
    st.stats.wrecksBurning++;
  }

  // Żar wraku → uniformy materiałów (tryb 1): barwa szwów × wzmocnienie × żar, iskry zimnego kadłuba rosną, gdy żar opada.
  _cvDmgPaintHeat(e, heat) {
    const T = this.cvTuning;
    const c = this._cvDmgCol ?? (this._cvDmgCol = [0, 0, 0]);
    wreckBurnColor(heat, c);
    const g = (T?.WRECK_BURN_GAIN ?? 2.2) * Math.pow(Math.max(0, heat), 0.85);
    const eg = (T?.WRECK_EMBER_GAIN ?? 1.3) * (0.25 + 0.75 * (1 - heat));
    const burn = this._cvDmgBurn ?? (this._cvDmgBurn = [0, 0, 0]);
    const ember = this._cvDmgEmber ?? (this._cvDmgEmber = [0, 0, 0]);
    burn[0] = c[0] * g; burn[1] = c[1] * g; burn[2] = c[2] * g;
    ember[0] = 1.0 * eg; ember[1] = 0.24 * eg; ember[2] = 0.035 * eg;
    for (const mat of e.rig?.materials ?? []) setKeyColourWreckState(mat, { mode: 1, heat, burn, ember });
    if (e.cvWreck) e.cvWreck.heat = heat;
  }

  // Wraki: żar (tylko gdy się zmienia), pożary w punktach uszkodzeń (gasną), zbieżność do pozycji logicznej (Finding 627).
  _cvDmgWrecks(eng, st, on) {
    const T = this.cvTuning;
    const B = on ? explosionBudget(this._gfx?.eff ?? null) : null;
    for (const [id, e] of this._vessels) {
      const w = e.cvWreck;
      if (!w) continue;
      const tK = w.t0 == null ? Infinity : st.now - w.t0;
      const heat = wreckHeatAt(tK, T);
      if (Math.abs(heat - w.heat) > 1e-4) this._cvDmgPaintHeat(e, heat);
      if (w.conv) {
        const c = wreckConverge(w.conv.from, w.conv.to, st.now - w.conv.t0, T?.WRECK_CONVERGE_MS ?? 5000);
        this._setSpriteBase(id, e, c.x, c.y, c.z);
        if (c.done) {
          w.conv = null; st.stats.converged++;
          // ARC CV-3c (decyzja 44 (5), `cvChoreo2`) — dryf po bitwie od pozycji logicznej (miejsce śmierci), pokrzywiony obrót, staje.
          // Zniszczenie odroczone do trafienia w locie i jeszcze niepokazane (`cvWreckPending` bez `cvKilled`) — statek wygląda na żywy:
          // bez dryfu; rusza z wybuchem (`_cvDmgWreckLook`). Pomiar w grze: 2 z 14 wraków traciły dryf (stan wraku odtworzony przy wybuchu).
          if (e.sprite && !(e.cvWreckPending && !e.cvKilled)) {
            const q = e.sprite.quaternion;
            w.after = { t0: st.now, base: { x: c.x, y: c.y, z: c.z }, q0: [q.x, q.y, q.z, q.w], rotate: true, done: false };
            const ep = this._cvWreckEpoch?.get(id);
            if (ep) ep.afterT0 = st.now;
          }
        }
      } else if (w.after && !w.after.done) this._cvWreckAfterStep(id, e, w, st);
      if (!on || !B?.dmgFire || w.t0 == null || !(tK < w.fireEnd) || !e.sprite?.visible || this._galaxyActive) { w.last = st.now; continue; }
      const Ls = (window.KOSMOS?.vesselManager?.getVessel?.(id) ? vesselTargetSize(window.KOSMOS.vesselManager.getVessel(id)) : VESSEL_TARGET_SIZE.frigate);
      const t0 = st.prev - w.t0, t1 = st.now - w.t0;
      for (let i = 0; i < 3; i++) {
        const win = wreckFireWindow(i, w.cls, w.seed, T);
        if (!win || t1 <= win.start || t0 >= win.end) continue;
        const every = (T?.DMG_FIRE_EVERY_MS ?? 110) * 1.25;
        const tk = emitterTicks(Math.max(t0, win.start), Math.min(t1, win.end), every, every * expSeedUnit(w.seed, 60 + i));
        if (!tk.count) continue;
        const a = this._cvDmgPoint(id, e, i, Ls, st.q);
        for (let k = 0; k < tk.count; k++) {
          const tt = tk.first + k * every;
          const u = (tt - win.start) / Math.max(1, win.end - win.start);
          const sz = (T?.DMG_FIRE_K ?? 0.17) * Ls * (1.15 - 0.8 * u) * (0.85 + 0.3 * expSeedUnit(w.seed, 900 + k + 50 * i));
          const life = (T?.DMG_FIRE_MS ?? 420) * (1.1 - 0.4 * u);
          eng.spawnBlast({ t0: w.t0 + tt, life, kind: 4, x: a.x, y: a.y, z: a.z, size: sz, color: 0xffa040, alpha: 1, minPx: 2,
            seed01: expSeedUnit(w.seed, 300 + k + 31 * i), id, mode: a.mode, ox: a.ox, oy: a.oy, oz: a.oz, until: w.t0 + tt + life });
          st.stats.wreckFires++;
          if (B.dmgSmoke && (k + i) % 2 === 0) {
            eng.spawnBlast({ t0: w.t0 + tt, life: (T?.DMG_SMOKE_MS ?? 1900) * 1.2, kind: 7, x: a.x, y: a.y, z: a.z,
              vx: 0, vy: 0.08 * Ls / 1000, vz: 0, size: (T?.DMG_SMOKE_K ?? 0.42) * Ls * 1.3, color: 0x232022, alpha: 0.55, minPx: 3,
              seed01: expSeedUnit(w.seed, 700 + k + 13 * i), id, mode: a.mode, ox: a.ox, oy: a.oy, oz: a.oz, until: w.t0 + tt });
            st.stats.dmgSmoke++;
          }
        }
      }
      w.last = st.now;
    }
  }

  // Stany uszkodzeń żywych uczestników oglądanych starć — z HP POKAZYWANEGO (rejestr salw; bez rejestru — logiczne).
  _cvDmgStates(eng, st) {
    const K = window.KOSMOS;
    const encs = this._cvEncList();
    if (!encs.length || this._galaxyActive) return;
    const T = this.cvTuning;
    const B = explosionBudget(this._gfx?.eff ?? null);
    const led = this._cvLedger ?? null;
    const vm = K?.vesselManager;
    for (const enc of encs) {
      if (!isEngagementInView({ encounterSystemId: enc.location?.systemId, activeSystemId: K?.activeSystemId })) continue;
      for (const [id, s] of enc.vesselStates ?? []) {
        const e = this._vessels.get(id);
        if (!e) continue;
        if (!e.sprite?.visible || e.cvKilled || e.isWreck) { e.cvDmgSputter = null; continue; }
        const hp = led ? led.presented(id, s.hp, s.shieldHP, s.hpStart, s.shieldHPStart).hp : Math.max(0, s.hp);
        const frac = s.hpStart > 0 ? hp / s.hpStart : 1;
        const ds = damageStateOf(frac, T);
        e.cvDmgLevel = ds.level;
        const seed = e.cvDmgSeed ?? (e.cvDmgSeed = explosionSeed('dmg', id));
        e.cvDmgSputter = ds.sputter ? sputterGate(st.now, seed, T) : null;
        if (!ds.level) continue;
        const v = vm?.getVessel?.(id);
        const Ls = v ? vesselTargetSize(v) : VESSEL_TARGET_SIZE.frigate;
        // dym: punkty 0 (≤ 75 %), 0–1 (≤ 50 %), 0–2 (≤ 25 %); ogień: punkt 0 (≤ 50 %), 0–1 (≤ 25 %)
        for (let i = 0; i < ds.level; i++) {
          const smokeOn = B.dmgSmoke, fireOn = B.dmgFire && ds.fire && i < ds.level - 1;
          if (!smokeOn && !fireOn) continue;
          let a = null;
          if (smokeOn) {
            const every = T?.DMG_SMOKE_EVERY_MS ?? 170;
            const tk = emitterTicks(st.prev, st.now, every, every * expSeedUnit(seed, 10 + i));
            for (let k = 0; k < tk.count; k++) {
              a ??= this._cvDmgPoint(id, e, i, Ls, st.q);
              const tt = tk.first + k * every;
              const u1 = expSeedUnit(seed, Math.floor(tt / every) * 7 + i), u2 = expSeedUnit(seed, Math.floor(tt / every) * 11 + i + 3);
              const heavy = ds.fire ? 1 : 0;
              eng.spawnBlast({ t0: tt, life: (T?.DMG_SMOKE_MS ?? 1900) * (0.8 + 0.4 * u1), kind: 7, x: a.x, y: a.y, z: a.z,
                vx: (u1 - 0.5) * 0.12 * Ls / 1000, vy: (0.05 + 0.08 * u2) * Ls / 1000, vz: (u2 - 0.5) * 0.12 * Ls / 1000,
                size: (T?.DMG_SMOKE_K ?? 0.42) * Ls * (0.8 + 0.4 * u2) * (1 + 0.35 * heavy), color: heavy ? 0x1e1c1e : 0x55585e,
                alpha: heavy ? 0.6 : 0.38, minPx: 3, seed01: u1, id, mode: a.mode, ox: a.ox, oy: a.oy, oz: a.oz, until: tt });
              st.stats.dmgSmoke++;
            }
          }
          if (fireOn) {
            const every = T?.DMG_FIRE_EVERY_MS ?? 110;
            const tk = emitterTicks(st.prev, st.now, every, every * expSeedUnit(seed, 20 + i));
            for (let k = 0; k < tk.count; k++) {
              a ??= this._cvDmgPoint(id, e, i, Ls, st.q);
              const tt = tk.first + k * every;
              const u = expSeedUnit(seed, Math.floor(tt / every) * 5 + i + 1);
              const life = (T?.DMG_FIRE_MS ?? 420) * (0.85 + 0.3 * u);
              eng.spawnBlast({ t0: tt, life, kind: 4, x: a.x, y: a.y, z: a.z, size: (T?.DMG_FIRE_K ?? 0.17) * Ls * (0.8 + 0.45 * u), color: 0xffa040,
                alpha: 1, minPx: 2, seed01: u, id, mode: a.mode, ox: a.ox, oy: a.oy, oz: a.oz, until: tt + life });
              st.stats.dmgFire++;
            }
          }
        }
        // krztuszący się silnik: iskry z dyszy w chwilach zakrztuszenia (budżet cząstek > 0)
        if (ds.sputter && B.particleScale > 0 && e.cvDmgSputter < 1) {
          const every = T?.DMG_SPARK_EVERY_MS ?? 300;
          const tk = emitterTicks(st.prev, st.now, every, every * expSeedUnit(seed, 40));
          const nz = e.canonical ? e.rig?.nozzle : null;
          if (tk.count && nz && this._cvWpnResolveLocal(id, nz.p[0], nz.p[1], nz.p[2], st.p) && this._cvWpnResolveLocal(id, nz.p[0] + nz.d[0] * 0.3, nz.p[1] + nz.d[1] * 0.3, nz.p[2] + nz.d[2] * 0.3, st.q)) {
            const dx = st.q.x - st.p.x, dy = st.q.y - st.p.y, dz = st.q.z - st.p.z;
            const dl = Math.hypot(dx, dy, dz) || 1;
            for (let k = 0; k < tk.count; k++) {
              const tt = tk.first + k * every;
              const n = Math.max(1, Math.round(4 * B.particleScale));
              for (let j = 0; j < n; j++) {
                const u = expSeedUnit(seed, Math.floor(tt) + 13 * j), w2 = expSeedUnit(seed, Math.floor(tt) + 29 * j + 1);
                const sp = (1.5 + 2.5 * u) * Ls / 1000;
                eng.spawnBlast({ t0: tt, life: 260 + 240 * w2, kind: 3, x: st.p.x, y: st.p.y, z: st.p.z,
                  vx: (dx / dl + (u - 0.5) * 0.8) * sp, vy: (dy / dl + (w2 - 0.5) * 0.8) * sp, vz: (dz / dl + (u - w2) * 0.8) * sp,
                  size: 0.06 * Ls, color: 0xffd090, alpha: 1, minPx: 1.4, seed01: u });
                st.stats.sputterSparks++;
              }
            }
          }
        }
      }
    }
  }

  /** Dryf wraku na scenie (choreografia, postawa „wyłączony”): przesunięcie w kopercie klasy z ziarna, na zegarze efektów; null — brak. */
  _cvDmgDrift(id, envWU) {
    if (!this._cvDmgOn?.()) return null;
    const w = this._vessels.get(id)?.cvWreck;
    const tD = w?.tDrift ?? w?.t0 ?? null;
    if (!w || tD == null || !(envWU > 0)) return null;
    return wreckDrift({ seed: w.seed, tMs: (this._cvDmg?.now ?? 0) - tD, envWU, tuning: this.cvTuning });
  }

  /** Obrót wraku (kwaternion wspólny — skopiuj przed kolejnym wywołaniem) albo null (bez wraku CV-5, po końcu choreografii). */
  _cvDmgTumble(e) {
    const w = e?.cvWreck;
    const tD = w?.tDrift ?? w?.t0 ?? null;
    if (!w || tD == null || w.tumbleBaked || !this._cvDmgOn?.()) return null;
    const d = wreckDrift({ seed: w.seed, tMs: (this._cvDmg?.now ?? 0) - tD, envWU: 0, tuning: this.cvTuning });
    const q = this._cvTumbleQ ?? (this._cvTumbleQ = new THREE.Quaternion());
    const ax = this._cvTumbleAx ?? (this._cvTumbleAx = new THREE.Vector3());
    return q.setFromAxisAngle(ax.set(d.ax, d.ay, d.az), d.angle);
  }

  /**
   * ARC CV-3c (decyzja właściciela 44 (5), flaga `cvChoreo2`) — krok dryfu wraku PO BITWIE (`ExplosionLogic.wreckAfterDrift`): pozycja =
   * pozycja logiczna z końca zbieżności + przesunięcie gasnące, kurs wrappera = kurs z końca zbieżności × obrót gasnący; na zegarze efektów
   * (pauza = pauza, `FX_TIME_SCALE`). Po ustaniu — koniec kroków (wrak zostaje tam, gdzie stanął). Wrak odbudowany w tej sesji (zmiana
   * układu, przebudowa) wraca na to samo przesunięcie (`_cvWreckEpoch.afterT0`), bez obrotu.
   */
  _cvWreckAfterStep(id, e, w, st) {
    if (!e?.sprite) return;
    const a = w.after;
    if (!a.base) { const p = this._spriteBase(id, e); a.base = { x: p.x, y: p.y, z: p.z }; }
    if (a.rotate && !a.q0) { const q0 = e.sprite.quaternion; a.q0 = [q0.x, q0.y, q0.z, q0.w]; }   // start przy wybuchu odroczonym — obrót bieżący
    const d = wreckAfterDrift({ seed: w.seed, tMs: st.now - a.t0, L: VESSEL_TARGET_SIZE.frigate, tuning: this.cvTuning });
    this._setSpriteBase(id, e, a.base.x + d.x, a.base.y + d.y, a.base.z + d.z);
    if (a.rotate && a.q0) {
      const q = this._cvAfterQ ?? (this._cvAfterQ = new THREE.Quaternion());
      const ax = this._cvAfterAx ?? (this._cvAfterAx = new THREE.Vector3());
      q.setFromAxisAngle(ax.set(d.ax, d.ay, d.az), d.angle);
      e.sprite.quaternion.set(a.q0[0], a.q0[1], a.q0[2], a.q0[3]).multiply(q);
    }
    if (d.done) a.done = true;
  }

  /** Wrak w wolnej przestrzeni po końcu bitwy → pozycja logiczna (`wreckLocation`, wysokość jak przy odbudowie) przez `WRECK_CONVERGE_MS`. */
  _cvDmgConverge(id, e, v) {
    if (!this._cvDmgOn?.() || !e?.sprite || !v?.wreckLocation || v.position?.dockedAt) return;
    const st = this._cvDmgState();
    const wx = Number.isFinite(v.wreckLocation.x) ? v.wreckLocation.x : 0, wy = Number.isFinite(v.wreckLocation.y) ? v.wreckLocation.y : 0;
    const from = this._spriteBase(id, e);
    const to = { x: S(wx), y: 0.45, z: S(wy) };
    if (!e.cvWreck) e.cvWreck = { t0: null, seed: explosionSeed(id), cls: 'destroyer', heat: wreckHeatAt(Infinity, this.cvTuning), fireEnd: 0, last: st.now, conv: null, tumbleBaked: false };
    e.cvWreck.conv = { from, to, t0: st.now };
  }

  /**
   * ARC CV-5 — `KOSMOS.debug.cvExplode(...)`: wybuch statku (tylko prezentacja — logika nietknięta) z wyglądem wraku, jak przy
   * zniszczeniu w bitwie. Do strojenia i nagrań (zwolnione tempo: `cvTuning.FX_TIME_SCALE`).
   */
  cvExplodeVessel(id) {
    if (!this._cvDmgOn()) return { ok: false, reason: 'cvDamage_off' };
    const e = this._vessels.get(id);
    if (!e?.sprite?.visible) return { ok: false, reason: 'not_visible' };
    if (e.cvKilled || e.isWreck) return { ok: false, reason: 'already_wreck' };
    const v = window.KOSMOS?.vesselManager?.getVessel?.(id) ?? null;
    this._spawnExplosion(e.sprite.position, v ? vesselTargetSize(v) : VESSEL_TARGET_SIZE.frigate, { id, vessel: v });
    e.cvKilled = true;
    (this._cvDebugKilled ??= new Set()).add(id);
    this._cvWpnKillLook(id, e);
    const seq = this._cvDmg?.seqs?.[this._cvDmg.seqs.length - 1];
    return { ok: true, id, name: v?.name ?? id, cls: e.cvWreckCls ?? null, mainAtMs: seq?.plan?.mainAt ?? 0, endMs: Math.round(seq?.plan?.endMs ?? 0),
      fxTimeScale: this.cvTuning?.FX_TIME_SCALE ?? 1 };
  }

  /** ARC CV-5 — odczyt: liczniki wybuchów, wraków i stanów uszkodzeń; sekwencje w toku; zegar efektów; pule. */
  cvDamageInfo() {
    const st = this._cvDmg;
    const wrecks = [];
    // ARC CV-3c — `dryf`: dryf i obrót wraku po końcu sceny (`cvChoreo2`) — w toku / stoi; '—' bez dryfu
    for (const [id, e] of this._vessels) if (e.cvWreck) wrecks.push({ id, heat: Number((e.cvWreck.heat ?? 0).toFixed(3)), conv: !!e.cvWreck.conv,
      dryf: e.cvWreck.after ? (e.cvWreck.after.done ? 'stoi' : 'w toku') : '—' });
    const levels = { 1: 0, 2: 0, 3: 0 };
    for (const [, e] of this._vessels) if (!e.cvKilled && !e.isWreck && e.cvDmgLevel > 0) levels[e.cvDmgLevel] = (levels[e.cvDmgLevel] ?? 0) + 1;
    const ps = this._fxEngine?.stats()?.pools;
    return { on: this._cvDmgOn(), fxTimeScale: this.cvTuning?.FX_TIME_SCALE ?? 1,
      dmgMs: st ? Math.round(st.now) : null, sequences: st?.seqs?.length ?? 0, stats: st ? { ...st.stats } : null,
      damageLevels: { dym: levels[1], ogien: levels[2], krztuszenie: levels[3] }, wrecks,
      pools: ps ? { smoke: ps.smoke, blast: ps.blast, debris: ps.debris } : null, prewarm: this._fxPrewarm ?? null };
  }

  /**
   * ARC CV-4a — HP / osłona POKAZYWANE uczestnika (pasek walki, paski 3D): stan logiczny + obrażenia trafień jeszcze nie pokazanych.
   * Brak rejestru — null (czytelnik zostaje przy stanie logicznym).
   */
  cvPresentedState(vesselId, st) {
    if (!this._cvLedger || !st) return null;
    const pr = this._cvLedger.presented(vesselId, st.hp, st.shieldHP, st.hpStart, st.shieldHPStart);
    return { hp: pr.hp, shield: pr.shield, pending: pr.pending, killed: this._vessels.get(vesselId)?.cvKilled === true };
  }

  /** ARC CV-4a — czy zdarzenie rundy (starcie, runda, indeks) zostało już pokazane (log paska walki). */
  cvEventShown(encounterId, round, index) {
    if (!this._cvLedger) return true;
    return this._cvLedger.isEventShown(encounterId, round, index);
  }

  /**
   * ARC CV-4a — `KOSMOS.debug.ledgerInfo()`: rejestr salw — per starcie liczniki od jego początku (`wTymStarciu`) i ostatnie rundy
   * (zdarzenia, opóźnienie startu i rozpiętość trafień w R, zniszczenia), kontrola HP pokazywane vs logiczne uczestników aktywnych
   * starć, liczniki od wczytania strony (`odZaladowaniaStrony` — sumy wszystkich starć), `legenda`.
   */
  cvLedgerInfo({ rounds = 6 } = {}) {
    const led = this._cvLedger;
    const r2 = (x) => (Number.isFinite(x) ? Number(x.toFixed(2)) : null);
    if (!led) return { ledger: null, odZaladowaniaStrony: { renderer: { ...this._cvWpnStats } }, legenda: LEDGER_INFO_LEGEND };
    const now = this._presClock.nowMs;
    const vm = window.KOSMOS?.vesselManager;
    const nameOf = (id) => vm?.getVessel?.(id)?.name ?? id;
    const active = new Set(this._cvEncList().map((e) => e.id));
    const encs = led.encounterIds().map((id) => ({
      starcie: id, aktywne: active.has(id), wTymStarciu: led.encounterStats(id),
      rundy: led.roundsOf(id).sort((a, b) => a.round - b.round).slice(-rounds).map((r) => ({
        runda: r.round, zdarzen: r.entries.length, trafien: r.entries.filter((x) => x.hit).length,
        opoznienieR: r2((r.startMs - r.arriveMs) / r.roundMs), rozpietoscR: r2((r.lastImpactAt - r.startMs) / r.R), tempoR: r2(r.R / r.roundMs),
        pokazane: r.entries.filter((x) => x.impacted).length, zniszczenia: r.entries.filter((x) => x.killed).map((x) => nameOf(x.target)),
        strzalyPoZniszczeniu: r.stats.violations, poza_kolejnoscia: r.stats.outOfOrder,
      })),
    }));
    const hp = [];
    for (const enc of this._cvEncList()) {
      for (const [id, s] of enc.vesselStates ?? []) {
        const pr = led.presented(id, s.hp, s.shieldHP, s.hpStart, s.shieldHPStart);
        hp.push({ statek: nameOf(id), hpLogika: r2(Math.max(0, s.hp)), hpPokazane: r2(pr.hp), czeka: pr.pending, zniszczenie: led.killState(id) ?? '—' });
      }
    }
    const zgodne = hp.filter((h) => h.czeka === 0).every((h) => h.hpLogika === h.hpPokazane);
    return { presMs: Math.round(now), starcia: encs, hp, hpBezCzekajacychZgodne: zgodne,
      odZaladowaniaStrony: { rejestr: { ...led.stats, czekajace: led.pendingCount() }, renderer: { ...this._cvWpnStats } }, legenda: LEDGER_INFO_LEGEND };
  }

  // Silnik budowany RAZ (pule = rozgrzewka); potem zero obiektów THREE na strzał. Końce wiązek i iskry idą za sprite'ami
  // statków (widocznymi).
  _ensureFxEngine() {
    if (this._fxEngine) return this._fxEngine;
    if (!this._fxGroup) {
      this._fxGroup = new THREE.Group();
      this._fxGroup.name = 'fcFxGroup';
      this.scene.add(this._fxGroup);
    }
    this._fxEngine = new FxEngine({
      THREE, parent: this._fxGroup, logDepth: logDepthOn(), nowMs: this._presClock.nowMs,
      // ARC CV-8a — końce bez sprite'a w powtórce bitwy orbitalnej: emitery obrony, pula obrony, okręty w hangarach (`CvOrbital.anchorPos`)
      resolve: (id) => { const e = this._vessels.get(id); return e?.sprite?.visible ? e.sprite.position : (this._cvOrb?.anchorPos?.(id) ?? null); },
      // ARC CV-4a — punkt w przestrzeni modelu (wieżyczka) → świat, co klatkę (statek obraca się z choreografią)
      resolveLocal: (id, x, y, z, out) => this._cvWpnResolveLocal(id, x, y, z, out),
    });
    // ARC CV-5 (Finding 644) — rozgrzewka: programy wszystkich pul (strzały, wybuchy, dym, odłamki) i bufory przed pierwszym użyciem
    this._fxPrewarm = this._fxEngine.prewarm?.(this.renderer, this.camera) ?? null;
    if (this._cvShdOn?.()) this._ensureShieldBubbles?.();   // ARC CV-4b — pula baniek i jej program przed pierwszym trafieniem
    return this._fxEngine;
  }

  // Raz na klatkę: zegar prezentacji (krok klatki czasu realnego tylko, gdy gra biegnie — pauza = pauza, po wznowieniu bez
  // nadrabiania) i silnik. Flaga OFF i nic w locie — wyjście (dzisiejsza pętla co do bitu). Tryb galaktyki — efekty ukryte.
  _tickCvFx() {
    const ts = window.KOSMOS?.timeSystem;
    this._presClock.tick(performance.now(), { paused: !!ts?.isPaused || ts?.multiplier === 0, rate: this._presRate ?? 1 });   // CV-7 — mnożnik tempa
    // ARC CV-5 — zegar efektów uszkodzeń, sekwencje wybuchów, stany uszkodzeń, wraki (przed przesłaniem pul — nowe cząstki w tej klatce)
    if (this._cvDmg || this._cvDmgOn?.()) this._cvDmgTick?.();
    this._fxEngine?.update({ nowMs: this._presClock.nowMs, dmgNowMs: this._cvDmg?.now, camera: this.camera, viewportH: window.innerHeight || 1,
      visible: !this._galaxyActive,
      smaa: !!this._smaaPass?.enabled });   // ARC CV-3c (decyzja 45 (5)) — wiązki pod SMAA
    this._cvOrb?.tick?.();   // ARC CV-8a — rundy powtórek bitew orbitalnych do rejestru salw (zegar prezentacji), koniec, przerwanie
    if (this._cvLedger) this._cvWpnTick?.();   // ARC CV-4a — rejestr salw: trafienia (HP pokazywane), zniszczenia w swojej chwili
    if (this._cvShd || this._cvShdOn?.()) this._cvShdTick?.();   // ARC CV-4b — osłony: próbki, bańki (po przekształceniach sceny), osmalenia
    if (this._cueBus) this._flushCues();   // ARC CV-2b — sygnały walki, których czas nadszedł (zegar prezentacji)
  }

  // ARC CV-2a — KOSMOS.debug.fxStats(): pomiar N klatek pętli renderu — czas klatki (odstęp między klatkami: to widzi
  // gracz, z rasteryzacją; p50 / p95 / średnia / maks.), czas JS pętli, wywołania i trójkąty renderera zsumowane po
  // wszystkich przebiegach composera, stan pul silnika FX oraz 5 NAJDŁUŻSZYCH klatek z chwilą i etykietą (zdarzenia gry od
  // poprzedniej klatki, przyrost programów / geometrii / tekstur). Wynik w konsoli po N klatkach; w trakcie — postęp.
  cvFxStats(frames = 300) {
    const live = this._fxEngine?.stats() ?? null;
    if (this._fxStatsRun) return { sampling: true, done: this._fxStatsRun.n, of: this._fxStatsRun.frames, live, last: this._fxStatsLast };
    const n = Math.max(30, Math.min(3000, Math.floor(Number(frames) || 300)));
    const info = this.renderer.info;
    this._fxStatsRun = { frames: n, n: 0, prev: null, cur: null, t0: 0, start: performance.now(), autoReset: info.autoReset,
      frameMs: new Float64Array(n), loopMs: new Float64Array(n), calls: new Float64Array(n), tris: new Float64Array(n),
      peak: { beam: 0, tracer: 0, spark: 0, legacy: 0, wbeam: 0, bolt: 0, mote: 0, smoke: 0, blast: 0, debris: 0 },   // ARC CV-4a — pule języka broni; CV-5 — uszkodzeń
      // CV-2a (diagnoza 7) — długie klatki: co zaszło MIĘDZY dwiema klatkami (zdarzenia gry, nowe programy cieniowania,
      // przesłane geometrie / tekstury). Odstęp klatki i zbiera to, co działo się po początku klatki i − 1.
      events: new Map(), offs: [], labels: new Array(n), atMs: new Float64Array(n), curLabel: '', mem: null,
      // ARC CV-3a1 — przerwy w rysowaniu przeglądarki (karta ukryta, okno bez fokusu: rAF wstrzymany albo dławiony) —
      // nasłuch zdarzeń okna WYŁĄCZNIE w trakcie pomiaru; etykieta odstępu mówi to sama (wcześniej przerwy 2–85 s bez opisu).
      winHiddenSeen: false, winBlurSeen: false, winFocusSeen: false, windowGaps: 0,
      // ARC CV-3a1 — scena bitwy: klatki ze sceną, klatki ze skalą awaryjną (§3.1-2), najwięcej klastrów i złych pasm.
      // ARC CV-3a3 (Finding 652) — rozwiązania prowadnicy w oknie pomiaru (raz na rundę na klaster; dawniej co klatkę ruchu płynnego).
      stage: { framesStaged: 0, framesFallback: 0, clustersMax: 0, misbandedMax: 0, solves: 0 } };
    const r = this._fxStatsRun;
    for (const ev of FX_STATS_EVENTS) {
      const fn = () => r.events.set(ev, (r.events.get(ev) ?? 0) + 1);
      EventBus.on(ev, fn);
      r.offs.push(() => EventBus.off(ev, fn));
    }
    if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.addEventListener && window.addEventListener) {
      const onVis = () => { if (document.hidden) r.winHiddenSeen = true; };
      const onBlur = () => { r.winBlurSeen = true; };
      const onFocus = () => { r.winFocusSeen = true; };
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      r.offs.push(() => document.removeEventListener('visibilitychange', onVis));
      r.offs.push(() => window.removeEventListener('blur', onBlur));
      r.offs.push(() => window.removeEventListener('focus', onFocus));
    }
    info.autoReset = false;
    console.log(`[fxStats] pomiar ${n} klatek — wynik w konsoli za ok. ${Math.max(1, Math.round(n / 60))} s`);
    return { sampling: true, frames: n, live, last: this._fxStatsLast };
  }

  _fxStatsBegin() {
    const r = this._fxStatsRun;
    const now = performance.now();
    r.cur = r.prev != null ? now - r.prev : null;   // pierwsza klatka pomiaru nie ma odstępu
    r.prev = now;
    r.t0 = now;
    // Etykieta odstępu: zdarzenia od poprzedniej klatki + przyrost programów / geometrii / tekstur (kompilacja, upload).
    const info = this.renderer.info;
    const mem = { prog: info.programs?.length ?? 0, geo: info.memory?.geometries ?? 0, tex: info.memory?.textures ?? 0 };
    const parts = [];
    if (r.mem) {
      if (mem.prog > r.mem.prog) parts.push(`+${mem.prog - r.mem.prog} prog`);
      if (mem.geo > r.mem.geo) parts.push(`+${mem.geo - r.mem.geo} geo`);
      if (mem.tex > r.mem.tex) parts.push(`+${mem.tex - r.mem.tex} tex`);
    }
    for (const [ev, c] of r.events) parts.push(c > 1 ? `${ev}×${c}` : ev);
    // ARC CV-3a1 — okno: karta ukryta w trakcie odstępu (albo nadal) / utrata albo powrót fokusu w trakcie odstępu, albo
    // okno bez fokusu przez cały długi odstęp (> 50 ms) — to przerwa rysowania przeglądarki, nie gra.
    const hiddenNow = typeof document !== 'undefined' && !!document.hidden;
    const unfocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' && !document.hasFocus();
    let winGap = false;
    if (r.winHiddenSeen || hiddenNow) { parts.push('ukryte okno'); winGap = true; }
    else if (r.winBlurSeen || r.winFocusSeen || (unfocused && r.cur != null && r.cur > 50)) { parts.push('brak fokusu'); winGap = true; }
    if (winGap && r.cur != null) r.windowGaps++;
    r.winHiddenSeen = false; r.winBlurSeen = false; r.winFocusSeen = false;
    r.curLabel = parts.join(' · ');
    r.events.clear();
    r.mem = mem;
    info.reset();
  }

  _fxStatsEnd() {
    const r = this._fxStatsRun;
    if (r.cur != null) {
      const i = r.n++;
      r.frameMs[i] = r.cur;
      r.loopMs[i] = performance.now() - r.t0;
      r.calls[i] = this.renderer.info.render.calls;
      r.tris[i] = this.renderer.info.render.triangles;
      r.labels[i] = r.curLabel;
      r.atMs[i] = r.t0 - r.start;
      const st = this._fxEngine?.stats();
      if (st) {
        r.peak.beam = Math.max(r.peak.beam, st.pools.beam.active);
        r.peak.tracer = Math.max(r.peak.tracer, st.pools.tracer.active);
        r.peak.spark = Math.max(r.peak.spark, st.pools.spark.active);
        r.peak.wbeam = Math.max(r.peak.wbeam, st.pools.wbeam?.active ?? 0);   // ARC CV-4a
        r.peak.bolt = Math.max(r.peak.bolt, st.pools.bolt?.active ?? 0);
        r.peak.mote = Math.max(r.peak.mote, st.pools.mote?.active ?? 0);
        r.peak.smoke = Math.max(r.peak.smoke, st.pools.smoke?.active ?? 0);   // ARC CV-5
        r.peak.blast = Math.max(r.peak.blast, st.pools.blast?.active ?? 0);
        r.peak.debris = Math.max(r.peak.debris, st.pools.debris?.active ?? 0);
      }
      r.peak.legacy = Math.max(r.peak.legacy, this._activeEffects.length);
      const sf = this._stageFrame;
      if (sf && sf.clusters > 0) {
        r.stage.framesStaged++;
        if (sf.fallback > 0) r.stage.framesFallback++;
        r.stage.clustersMax = Math.max(r.stage.clustersMax, sf.clusters);
        r.stage.misbandedMax = Math.max(r.stage.misbandedMax, sf.misbanded);
      }
      if (sf) r.stage.solves += sf.solves ?? 0;
    }
    if (r.n < r.frames) return;
    this.renderer.info.autoReset = r.autoReset;
    for (const off of r.offs) off();
    this._fxStatsRun = null;
    const q = (arr, p) => { const v = Array.from(arr).sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.round(p * (v.length - 1)))]; };
    const avg = (arr) => Array.from(arr).reduce((a, b) => a + b, 0) / (arr.length || 1);
    const r2 = (x) => Number(x.toFixed(2));
    const order = Array.from(r.frameMs.keys()).sort((a, b) => r.frameMs[b] - r.frameMs[a]);
    const longest = order.slice(0, 5).map((i) => ({ ms: r2(r.frameMs[i]), atMs: Math.round(r.atMs[i]), frame: i, label: r.labels[i] || '—' }));
    const rep = {
      frames: r.frames, frameMsP50: r2(q(r.frameMs, 0.5)), frameMsP95: r2(q(r.frameMs, 0.95)), fps: r2(1000 / avg(r.frameMs)),
      frameMsMean: r2(avg(r.frameMs)), frameMsMax: r2(Math.max(...r.frameMs)), longFrames: Array.from(r.frameMs).filter((x) => x > 50).length,
      loopMsP50: r2(q(r.loopMs, 0.5)), loopMsP95: r2(q(r.loopMs, 0.95)),
      callsAvg: Math.round(avg(r.calls)), callsMax: Math.max(...r.calls), trisAvg: Math.round(avg(r.tris)), trisMax: Math.max(...r.tris),
      peakActive: r.peak, pools: this._fxEngine?.stats()?.pools ?? null, longest,
      windowGaps: r.windowGaps, stage: { ...r.stage, solvesPerSec: r2(r.stage.solves / Math.max(1e-9, Array.from(r.frameMs).reduce((a, b) => a + b, 0) / 1000)) },
      pixelRatio: this._pixelRatio,
      // ARC CV-2b — preset jakości: poziom, bloom, światła puli, tekstury, stan dławienia (poziom i zdjęte efekty), sygnały walki.
      gfx: {
        level: this._gfx?.level ?? null,
        bloom: this._bloomPass ? this._bloomPass.enabled !== false : false, lights: this._fxLightPool?.count ?? 0,
        textures: this._gfxApplied?.textures ?? '2k', throttle: this._gfx?.throttle?.stats() ?? null,
        lightPool: this._fxLightPool?.stats() ?? null, cues: this._cueBus?.stats() ?? null,
        aa: this._smaaPass?.enabled ? 'smaa' : 'none',   // ARC CV-5 (decyzja 41)
      },
      dmg: this._cvDmg ? { ...this._cvDmg.stats } : null, prewarm: this._fxPrewarm ?? null,   // ARC CV-5 — wybuchy, wraki, rozgrzewka
    };
    this._fxStatsLast = rep;
    console.log(`[fxStats] ${rep.frames} klatek: klatka p50 ${rep.frameMsP50} ms / p95 ${rep.frameMsP95} ms / śr. ${rep.frameMsMean} ms `
      + `/ maks. ${rep.frameMsMax} ms (${rep.fps} kl./s, klatek > 50 ms: ${rep.longFrames}), JS pętli p50 ${rep.loopMsP50} / p95 ${rep.loopMsP95} ms, `
      + `wywołania śr. ${rep.callsAvg} (maks. ${rep.callsMax}), trójkąty śr. ${rep.trisAvg}, szczyt pul: wiązki ${r.peak.beam}, `
      + `smugi ${r.peak.tracer}, iskry ${r.peak.spark}, stare FX ${r.peak.legacy}`
      + (r.peak.wbeam + r.peak.bolt + r.peak.mote > 0 ? ` (język broni: wiązki ${r.peak.wbeam}, pociski ${r.peak.bolt}, punkty ${r.peak.mote})` : '')
      + (r.peak.smoke + r.peak.blast + r.peak.debris > 0 ? ` (uszkodzenia: dym ${r.peak.smoke}, wybuchy ${r.peak.blast}, odłamki ${r.peak.debris})` : '')
      + `; przerwy okna (ukryte / bez fokusu): ${r.windowGaps}; `
      + `scena: klatki ${r.stage.framesStaged}, skala awaryjna ${r.stage.framesFallback}, klastry maks. ${r.stage.clustersMax}, złe pasma maks. ${r.stage.misbandedMax}, `
      + `rozwiązania prowadnicy ${r.stage.solves} (${rep.stage.solvesPerSec}/s)`
      + `; grafika ${rep.gfx.level} (gęstość ${r2(rep.pixelRatio)}, bloom ${rep.gfx.bloom ? 'tak' : 'nie'}, światła ${rep.gfx.lights}, `
      + `tekstury ${rep.gfx.textures}), dławienie: poziom ${rep.gfx.throttle?.level ?? 0}${rep.gfx.throttle?.dropped?.length ? ' — ' + rep.gfx.throttle.dropped.join(', ') : ''}, `
      + `sygnały wysłane ${rep.gfx.cues?.emitted ?? 0}`);
    console.table(longest);
    if (rep.pools) console.table(rep.pools);
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

  // ── POLISH P2b (D3, Finding 461) — płynne zbliżenie w starciu (wyłącznie rysowanie) ─────────────────────────────
  // Statek w wolnej przestrzeni (`orbiting`, `dockedAt` null). Uczestnik AKTYWNEGO starcia w oglądanym układzie: sprite
  // PŁYNIE do pozycji logicznej przez jedną rundę czasu realnego (`combatRoundMs()`) — krok zbliżenia
  // (`_closeToWeaponRange`) pada raz na rundę, dawniej sprite skakał o ≈ 0,028 AU co rundę (setki px przy „Obserwuj”).
  // Poza starciem — od razu (jak dotąd); ruch rozpoczęty w starciu dobiega do końca, jeśli cel się nie zmienił. Logika
  // walki nietknięta: renderer czyta pozycję logiczną, nie pisze jej.
  _placeFreeVessel(vid, entry, vx, vy) {
    const to = { x: S(vx), z: S(vy) };
    const p = entry.sprite.position;
    const enc = window.KOSMOS?.deepSpaceCombatSystem?._findActiveEncounterContaining?.(vid);
    const inCombat = !!enc?.isActive
      && isEngagementInView({ encounterSystemId: enc.location?.systemId, activeSystemId: window.KOSMOS?.activeSystemId });
    const g = entry.glide;
    const finishing = !!g && !g.done && Math.abs(g.to.x - to.x) <= 1e-9 && Math.abs(g.to.z - to.z) <= 1e-9;
    if (!inCombat && !finishing) {
      entry.glide = null;
      // ARC CV-7 (Finding 711) — statek sceny trzymanej po końcu logiki: zapis bazy (sprite zostaje rysowany na scenie także między
      // klatkami — dawniej skakał do skali prawdziwej przy każdym tiku fizyki i wracał w następnej klatce).
      this._setSpriteBase(vid, entry, to.x, 0.3, to.z);
      return;
    }
    if (!g) {   // pierwszy raz w starciu — sprite już stoi w pozycji logicznej, ruch od następnego kroku
      entry.glide = { from: { ...to }, to, elapsedMs: 0, durMs: 1, done: true };
      p.set(to.x, 0.3, to.z);
      return;
    }
    // ARC CV-3a1 — start ruchu z pozycji BEZ sceny (`_spriteBase`): między klatkami sprite uczestnika sceny trzyma pozycję
    // rysowaną, a ruch płynny żyje w przestrzeni logicznej.
    entry.glide = glideRetarget(g, to, this._spriteBase(vid, entry), window.KOSMOS?.timeSystem?.combatRoundMs?.() ?? 1150);   // zapas = domyślna klucza
  }

  // Co klatkę (także w pauzie gry — wtedy ruch stoi, jak starcie): sprite'y w ruchu o krok czasu realnego klatki.
  _tickCombatGlide() {
    const now = performance.now();
    const dt = this._glideLastMs == null ? 0 : now - this._glideLastMs;
    this._glideLastMs = now;
    const paused = !!window.KOSMOS?.timeSystem?.isPaused;
    const vm = window.KOSMOS?.vesselManager;
    for (const [id, e] of this._vessels) {
      const g = e.glide;
      if (!g) continue;
      const v = vm?.getVessel?.(id);
      if (!v || v.isWreck || e.isWreck || v.position?.state !== 'orbiting' || v.position?.dockedAt != null) { e.glide = null; continue; }
      if (g.done || paused) continue;
      const st = glideStep(g, dt);
      g.elapsedMs = st.elapsedMs; g.done = st.done;
      e.sprite.position.set(st.x, 0.3, st.z);
    }
  }

  // ── ARC CV, krok CV-3a1 — SCENA BITWY (D-CV-2 (a), D-CV-3 (a), §3.1-2, Finding 638; CV-3a3 — D-CV-4 (a), 652) ──────────
  // Przybliżona bitwa w oglądanym układzie: uczestnicy rysowani w lokalnej scenie wokół środka bitwy z odległościami
  // ściśniętymi prawem sceny (`BattleStageLogic` — prowadnica par, każda para w swoim paśmie), stopień z rozmiaru fregaty
  // na ekranie (`SemanticZoomLogic`). Jedna scena na klaster starć w jednym miejscu (638). Pozycja BEZ sceny (bazowa) — to,
  // co piszą ruch płynny i orbity; scena przesuwa sprite o (scena − baza) × blend × wejście. Pozycji logicznych nie pisze
  // nikt (F1); wszystko, co czyta sprite (smugi, etykiety HUD, nawiasy, klik, kadr „Obserwuj”), idzie za sceną samo.
  // CV-3a3: bitwa przy ciele — grupa unieruchomionych przy ciele na skorupie (D-CV-4, `BattleStageLogic.solveStage({ shell })`);
  // ciało bez rysunku — bitwa bez sceny. Prowadnica raz na rundę, przesunięcia płyną przez rundę (Finding 652).
  // CV-6b (decyzja właściciela 20 — D-CV-3 zmienione): stopień sceny z podłogą `cvTuning.STAGE_BLEND_FLOOR` (domyślnie 1) —
  // bitwa w widoku jest ściśnięta przy KAŻDYM zoomie, także w kadrze układu; wejście i wyjście ze sceny bez zmian (JOIN_MS).

  // Początek klatki: sprite uczestnika sceny wraca na pozycję bazową — chyba że od poprzedniej klatki ktoś zapisał mu nową
  // (zdarzenia ruchu i orbit między klatkami piszą pozycję bazową wprost): wtedy bazą jest ta nowa.
  _unstageVessels() {
    if (!this._stageMarks.size) return;
    for (const [id, m] of this._stageMarks) {
      const e = this._vessels.get(id);
      if (!e?.sprite) { if (!this._stageKept?.(id)) this._stageMarks.delete(id); continue; }   // ARC CV-5 (706) — przebudowa w toku
      const p = e.sprite.position;
      if (p.x === m.drawn.x && p.y === m.drawn.y && p.z === m.drawn.z) p.set(m.base.x, m.base.y, m.base.z);
    }
  }

  // ARC CV-3a3 — zapis pozycji BAZOWEJ sprite'a MIĘDZY klatkami (orbita ciała — `_tickOrbitingVessels` na `physics:updated`).
  // Uczestnik sceny (znacznik): sprite zostaje w pozycji RYSOWANEJ — nowa baza idzie przez `_stagePlace` z celem i stopniem
  // ostatniej klatki (powrót do skali prawdziwej — z jego przesunięciem). Bez tego każdy czytelnik między tikiem fizyki
  // a następną klatką renderu (warstwa HUD — własna pętla, klik, sonda) widział pozycję BEZ sceny: przy bitwie przy ciele
  // etykiety i znaczniki statków z orbity skakały co tik między orbitą a skorupą (zmierzone w grze: prędkość względna
  // rysowana średnio 637 L/s przy medianie 1,3 L/s). Bez znacznika — zapis wprost, jak dotąd.
  _setSpriteBase(vid, entry, x, y, z) {
    const m = this._stageMarks.get(vid);
    if (!m || !(m.releasing ? m.rel : m.tgt)) { entry.sprite.position.set(x, y, z); return; }
    const av = m.avoidId != null ? (this.getBodyWorldInfo?.(m.avoidId) ?? null) : null;
    const avoid = av ? { x: av.x, y: Number.isFinite(av.y) ? av.y : 0, z: av.z, r: av.r + STAGE.SHELL_FLOOR_L * VESSEL_TARGET_SIZE.frigate } : null;
    const base = { x, y, z };
    if (m.releasing) this._stagePlace(vid, entry, base, { x: x + m.rel.x, y: y + m.rel.y, z: z + m.rel.z }, m.w, avoid);
    else {
      const o = m.choreo;   // ARC CV-3b — przesunięcie choreografii z ostatniej klatki (sprite zostaje tam, gdzie był rysowany)
      this._stagePlace(vid, entry, base, o ? { x: m.tgt.x + o.x, y: m.tgt.y + o.y, z: m.tgt.z + o.z } : m.tgt, m.k, avoid);
    }
  }

  // ARC CV-5 (Finding 706) — czy znacznik sceny statku ma przetrwać brak sprite'a (przebudowa po zmianie presetu: nowy model
  // wstawia się asynchronicznie). Wygasłe wpisy znikają przy okazji.
  _stageKept(id) {
    const k = this._stageKeep;
    if (!k?.size) return false;
    const until = k.get(id);
    if (until == null) return false;
    if (until > performance.now()) return true;
    k.delete(id);
    return false;
  }

  // Pozycja BEZ sceny sprite'a (między klatkami sprite uczestnika sceny trzyma pozycję rysowaną).
  _spriteBase(vid, entry) {
    const p = entry.sprite.position;
    const m = this._stageMarks.get(vid);
    if (m && p.x === m.drawn.x && p.y === m.drawn.y && p.z === m.drawn.z) return { x: m.base.x, y: m.base.y, z: m.base.z };
    return { x: p.x, y: p.y, z: p.z };
  }

  // `tgt` / `tgtFrame` (CV-3a3, Finding 652) — cel sceny wyświetlany w ostatniej klatce (świat): nowe rozwiązanie płynie od
  // niego, także gdy klaster zmienił id albo się połączył; `stale` (CV-3a3, Finding 626) — pozycja sprite'a unieruchomionego
  // przy ciele bez orbity w chwili wejścia na scenę (z niej baza wchodzi na skorupę przez JOIN_MS); `avoidId` — ciało skorupy
  // (powrót do skali prawdziwej też je omija).
  _stageMark(vid) {
    const m = { w: 0, k: 0, base: { x: 0, y: 0, z: 0 }, drawn: { x: NaN, y: NaN, z: NaN }, cluster: null, releasing: false, rel: null,
      tgt: null, tgtFrame: -1, stale: null, avoidId: null };
    this._stageMarks.set(vid, m);
    return m;
  }

  // JEDYNE miejsce zapisu pozycji rysowanej uczestnika sceny: baza + (cel sceny − baza) × k; pamięta bazę i to, co zapisał.
  // ARC CV-3a3 (D-CV-4) — `avoid` {x, y, z, r} (ciało skorupy, r = promień z podłogą): punkt pośredni wewnątrz kuli wypychany
  // promieniowo na jej powierzchnię — statek z orbity po drugiej stronie planety nie przelatuje przez nią w trakcie zoomu.
  _stagePlace(vid, entry, base, target, k, avoid = null) {
    const m = this._stageMarks.get(vid) ?? this._stageMark(vid);
    const p = entry.sprite.position;
    p.set(base.x + (target.x - base.x) * k, base.y + (target.y - base.y) * k, base.z + (target.z - base.z) * k);
    if (avoid) {
      const vx = p.x - avoid.x, vy = p.y - avoid.y, vz = p.z - avoid.z, d = Math.hypot(vx, vy, vz);
      if (d < avoid.r && d > 1e-12) p.set(avoid.x + vx / d * avoid.r, avoid.y + vy / d * avoid.r, avoid.z + vz / d * avoid.r);
    }
    m.base.x = base.x; m.base.y = base.y; m.base.z = base.z;
    m.drawn.x = p.x; m.drawn.y = p.y; m.drawn.z = p.z;
    m.k = k;
  }

  // Klastry starć oglądanego układu (Finding 638): uczestnicy, starcia, czy ktoś stoi na orbicie ciała.
  // ARC CV-3a2 — klaster z pozycji LOGICZNYCH uczestników (`encounterClusters`): to samo źródło co karta walki (jeden wiersz
  // na klaster) i baner wyniku (jeden na klaster); dawniej środek z pozycji sprite'ów (różnica — ruch płynny ≤ 1 rundy).
  _stageClusters() {
    const out = this._stageClustersDscs();
    // ARC CV-8a — powtórki bitew orbitalnych w widoku: klaster na ciało (skorupa = ciało, rozwiązanie formacji
    // planety — `CvOrbital.solveStage`); bez powtórek — lista DSCS co do obiektu.
    const orb = this._cvOrb?.stageClusters?.() ?? [];
    return orb.length ? out.concat(orb) : out;
  }

  _stageClustersDscs() {
    const K = window.KOSMOS;
    let act = K?.deepSpaceCombatSystem?.listActive?.() ?? [];
    // ARC CV-7 (Finding 711) — starcie skończone w logice ZOSTAJE na scenie, dopóki rejestr salw ma dla niego coś
    // do pokazania (najwyżej 3 R czasu prezentacji): logika kończy bitwę w chwili nadejścia ostatniej rundy, a jej trafienia
    // zabijające rejestr pokazuje do ~1 R później — dawniej scena rozchodziła się do skali prawdziwej PRZED ostatnim zniszczeniem
    // (bohater ostatniego okrętu strony grał bez sceny, kadr szeroki gonił rozbiegające się statki). Obiekt starcia — tylko odczyt.
    if (this._cvLedger) {
      const L = this._stageLinger ?? (this._stageLinger = new Map());
      const now = this._presClock?.nowMs ?? 0;
      const R = K?.timeSystem?.combatRoundMs?.() ?? 1150;
      const live = new Set(act.map((e) => e.id));
      for (const e of act) L.set(e.id, { enc: e, endedAt: null });
      let extra = null;
      for (const [id, rec] of L) {
        if (live.has(id)) continue;
        if (rec.endedAt == null) rec.endedAt = now;
        if (!this._cvLedger.hasPending([id]) || now - rec.endedAt > 3 * R || now < rec.endedAt) { L.delete(id); continue; }
        (extra ??= []).push(rec.enc);
      }
      if (extra) act = [...act, ...extra];
    } else if (this._stageLinger?.size) this._stageLinger.clear();
    if (!act.length) return [];
    const inView = act.filter((enc) => isEngagementInView({ encounterSystemId: enc.location?.systemId, activeSystemId: K?.activeSystemId }));
    if (!inView.length) return [];
    const vm = K?.vesselManager;
    const byId = new Map(inView.map((e) => [e.id, e]));
    const logical = (id) => { const q = vm?.getVessel?.(id)?.position; return q ? { x: S(q.x), y: S(q.y) } : null; };
    return encounterClusters(inView, logical, STAGE.CLUSTER_AU * GAME_CONFIG.AU_TO_PX / WORLD_SCALE).map((cl) => {
      const ids = [...new Set(cl.encounterIds.flatMap((eid) => encounterParticipants(byId.get(eid))))].sort();
      // ARC CV-3a3 (D-CV-4) — uczestnicy przy ciele (`dockedAt`): ciało skorupy = ciało większości z nich (remis — mniejsze id);
      // unieruchomieni przy INNYM ciele rysują się jak wolni.
      const byBody = new Map();
      for (const id of ids) {
        const v = vm?.getVessel?.(id);
        const d = v && !v.isWreck ? v.position?.dockedAt : null;
        if (d != null) byBody.set(d, (byBody.get(d) ?? 0) + 1);
      }
      let shellBodyId = null, best = 0;
      for (const [b, k] of byBody) if (k > best || (k === best && String(b) < String(shellBodyId))) { best = k; shellBodyId = b; }
      const pinnedIds = new Set(shellBodyId == null ? [] : ids.filter((id) => { const v = vm?.getVessel?.(id); return !!v && !v.isWreck && v.position?.dockedAt === shellBodyId; }));
      return { ...cl, ids, pinned: byBody.size > 0, pinnedIds, shellBodyId, encs: cl.encounterIds.map((eid) => byId.get(eid)).filter(Boolean) };
    });
  }

  // Co klatkę (także w pauzie gry — kółko zmienia stopień sceny; wejście i wyjście ze sceny stoją): scena każdego klastra.
  // ARC CV-3a3 (Finding 652) — prowadnica RAZ NA RUNDĘ: klucz rozwiązania = runda każdego starcia klastra + skład (+ ciało
  // skorupy), NIE pozycje. Dawniej klucz trzymał pozycje bazowe, które w trakcie ruchu płynnego zmieniały się co klatkę, więc
  // prowadnica z ciepłym startem liczyła się co klatkę i przesuwała statki względem siebie o kilka L na sekundę („pływanie” —
  // 17 × ruch logiki przy 1/3 zoomu; koszt — Finding 647). Wejście prowadnicy = pozycje LOGICZNE (koniec ruchu płynnego rundy);
  // przesunięcia sceny (względem początku układu klastra: środka uczestników bez sceny albo — przy skorupie — rysowanego środka
  // ciała) płyną LINIOWO od celu wyświetlanego w poprzedniej klatce do nowego rozwiązania przez jedną rundę czasu prezentacji
  // (pauza = pauza). Ruch z bliska = ruch logiki z rundy na rundę, nie prowadnicy.
  _tickBattleStage() {
    this._stageClusterOf.clear();
    this._stageParticipants.clear();
    const ts = window.KOSMOS?.timeSystem;
    const dt = this._stageClock.tick(performance.now(), { paused: !!ts?.isPaused || ts?.multiplier === 0, rate: this._presRate ?? 1 });   // CV-7 — mnożnik tempa
    const clusters = (this._galaxyActive || this._galaxyFlight) ? [] : this._stageClusters();
    if (!clusters.length && !this._stageMarks.size) { this._stageFrame = null; this._stageState.clear(); return; }
    const L = VESSEL_TARGET_SIZE.frigate;
    const edges = this._stageEdges ?? (this._stageEdges = bandEdgesWU(
      [GAME_CONFIG.WEAPON_SHORT_AU, GAME_CONFIG.WEAPON_MED_AU, GAME_CONFIG.WEAPON_LONG_AU], GAME_CONFIG.AU_TO_PX / WORLD_SCALE));
    const H = window.innerHeight || 1;
    const vm = window.KOSMOS?.vesselManager;
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    const roundMs = ts?.combatRoundMs?.() ?? 1150;   // zapas = domyślna klucza
    // ARC CV-3c (decyzja 44 (2)) — rozsunięcie sceny: prawo, podłogi i koperta choreografii razem (`BattleStageLogic.spreadLaw`);
    // pokrętło czytane CO KLATKĘ — zmiana wchodzi w klucz rozwiązania, więc scena przestawia się odcinkiem ruchu (bez skoku).
    const spreadK = Number(this.cvTuning?.STAGE_SPREAD);
    const spread = Number.isFinite(spreadK) && spreadK > 0 ? Math.min(4, Math.max(0.25, spreadK)) : 1;
    const seen = new Set();
    const frame = { clusters: 0, staged: 0, fallback: 0, misbanded: 0, solves: 0, list: [] };
    for (const cl of clusters) {
      const info = { id: cl.id, encounterIds: cl.encounterIds, encs: cl.encs, ids: cl.ids, members: 0, pinned: cl.pinned, shellBodyId: cl.shellBodyId ?? null,
        blend: 0, curve: 0, pxL: 0, fallback: false, misbanded: 0, misbandedBefore: 0, passes: 0, centre: null, rIn: 0, scale: null, join: 0,
        solves: 0, shell: null };
      for (const eid of cl.encounterIds) this._stageClusterOf.set(eid, info);
      for (const id of cl.ids) this._stageParticipants.add(id);   // Finding 666 (b) — także klaster bez sceny (ciało bez rysunku)
      frame.list.push(info);
      // ARC CV-3a3 (D-CV-4) — skorupa: rysowany środek i promień ciała, przy którym stoją unieruchomieni uczestnicy; ciało bez
      // rysunku — bitwa bez sceny (jak przed CV-3a3).
      const body = cl.shellBodyId != null ? (this.getBodyWorldInfo?.(cl.shellBodyId) ?? null) : null;
      const shellBody = body && Number.isFinite(body.x) && Number.isFinite(body.z) && body.r >= 0 ? body : null;
      if (cl.pinned && !shellBody) continue;
      const pts = [], inp = [], keyIds = [];
      for (const id of cl.ids) {
        const e = this._vessels.get(id);
        if (!e?.sprite || e.sprite.visible === false) {
          // ARC CV-5 (Finding 706) — statek w przebudowie sprite'a (zmiana presetu: model wstaje asynchronicznie) zostaje w SKŁADZIE
          // klucza: prowadnica nie liczy się bez niego od nowa. Zmierzone w grze: ciepły start z podzbioru przestawiał szyk
          // zatrzymanej bitwy o 1–3,4 L (k i choreografia co do bitu), a nowy sprite wchodził od razu w nowy cel.
          if (!e?.sprite && this._stageKept?.(id)) keyIds.push(id);
          continue;
        }
        keyIds.push(id);
        const v = vm?.getVessel?.(id);
        const p = e.sprite.position;   // baza (po `_unstageVessels` i ruchu płynnym)
        const side = v && isEnemyVessel(v) ? String(v.ownerEmpireId ?? 'enemy') : 'player';
        pts.push({ id, side, x: p.x, y: p.y, z: p.z });
        const lp = v?.position;   // wejście prowadnicy: pozycja LOGICZNA (koniec ruchu płynnego rundy)
        inp.push({ id, side, x: Number.isFinite(lp?.x) ? S(lp.x) : p.x, y: p.y, z: Number.isFinite(lp?.y) ? S(lp.y) : p.z });
      }
      info.members = pts.length;
      if (pts.length < 2) {
        // ARC CV-5 (Finding 706) — klaster w przebudowie sprite'ów (zmiana presetu): stan prowadnicy ZOSTAJE — bez tego sprzątanie
        // na końcu metody kasowało go w przerwie, a nowe sprite'y dostawały świeże rozwiązanie (zmierzone: szyk przestawiony o 1–3,4 L).
        if (keyIds.length >= 2) { const kst = this._stageState.get(cl.id); if (kst) kst.frame = this._frameNo; }
        continue;
      }
      const c = { x: 0, y: 0, z: 0 };
      for (const q of pts) { c.x += q.x; c.y += q.y; c.z += q.z; }
      c.x /= pts.length; c.y /= pts.length; c.z /= pts.length;
      // Układ celów: przy skorupie — ciało TERAZ (bitwa idzie za ciałem, które krąży wokół gwiazdy: ≈ 1,3 L na rundę przy orbicie
      // 1 AU); w wolnej przestrzeni — ŚWIAT. ARC CV-6b (zgłoszenie właściciela 2026-11-09 — „bitwy się zacinają”): dawniej początkiem
      // wolnej bitwy był środek pozycji BAZOWYCH, więc cały węzeł jechał na ruchu płynnym logiki — jego cele przychodzą co ~150 ms
      // tików fizyki, a ruch kończy się przed kolejnym celem (zmierzone w grze: stawanie i szarpnięcia całej bitwy). Cele w świecie
      // pochodzą z rozwiązania (pozycje LOGICZNE w chwili rundy) — ruch płynny logiki nie dosięga już statków na scenie (stopień 1).
      const fid = shellBody ? `b:${cl.shellBodyId}` : 'w';
      const origin = shellBody ? { x: shellBody.x, y: Number.isFinite(shellBody.y) ? shellBody.y : 0, z: shellBody.z } : { x: 0, y: 0, z: 0 };
      let key = '';
      for (const enc of cl.encs ?? []) key += `${enc.id}:${enc.currentRound ?? 0};`;
      key += '#' + keyIds.join(',') + (shellBody ? `@${cl.shellBodyId}` : '') + (spread !== 1 ? `|s${spread}` : '');
      let st = this._stageState.get(cl.id);
      if (!st) {
        st = { key: null, sol: null, offsets: null, from: new Map(), to: new Map(), seg: new Map(), el: 0, dur: 1, frame: -1, solves: 0, stagePos: new Map() };
        // Klaster zmienił id (skończyło się starcie o najmniejszym id): ciepły start z poprzedniego stanu tych samych statków.
        const prevIds = new Set(pts.map((q) => this._stageMarks.get(q.id)?.cluster).filter((x) => x != null && x !== cl.id));
        if (prevIds.size === 1) st.offsets = this._stageState.get([...prevIds][0])?.offsets ?? null;
      }
      // Czas od ostatniego rozwiązania (zegar prezentacji, pauza = pauza; BEZ klamry — po końcu odcinka statek jedzie dalej,
      // `StageMotionLogic`; dawna klamra do jednej rundy zatrzymywała przesunięcia 1–2 klatki przed każdą rundą).
      st.el += dt;
      if (key !== st.key || !st.sol) {
        // Pary pierwszeństwa: strzelec → cel z ostatniej rundy każdego starcia klastra (to gracz czyta jako zasięg) — pełne
        // przyciąganie do prawa sceny; reszta par — kompromis prowadnicy.
        const priority = new Set();
        for (const enc of cl.encs ?? []) for (const ev of enc?.timeline?.[enc.timeline.length - 1]?.events ?? []) priority.add(pairKey(ev.attacker, ev.target));
        const cIn = { x: 0, y: c.y, z: 0 };
        for (const q of inp) { cIn.x += q.x; cIn.z += q.z; }
        cIn.x /= inp.length; cIn.z /= inp.length;
        st.sol = cl.orbital   // ARC CV-8a — scena planety: formacja powtórki bitwy orbitalnej (napastnicy na łuku, obrońcy na skorupie)
          ? this._cvOrb.solveStage(cl, inp, shellBody, L, spread)
          : solveStage({ points: inp, centre: cIn, L, edges, prevOffsets: st.offsets, priority,
            shell: shellBody ? { body: shellBody, pinned: cl.pinnedIds } : null, opts: spread !== 1 ? { SPREAD: spread } : {} });
        st.offsets = st.sol.offsets;
        // ARC CV-6b — RUCH CIĄGŁY W PRĘDKOŚCI: każdy statek dostaje odcinek Hermite'a od pozycji i prędkości wyświetlanej TERAZ
        // (odcinek tego klastra; po zmianie id klastra — cel i prędkość z poprzedniej klatki; nowy uczestnik — od razu w celu)
        // do nowego rozwiązania, z prędkością końcową = ruch celu z rundy na rundę (ten sam układ celów). Dawniej przejście
        // LINIOWE kończyło się przed następną rundą i ruszało od nowa z inną prędkością — na każdej granicy rund pauza i szarpnięcie.
        const dur = Math.max(1, roundMs);
        const segs = new Map();
        st.from.clear(); st.to.clear();
        for (const q of pts) {
          const s = st.sol.pos.get(q.id);
          if (!s) continue;
          const T = { x: s.x - origin.x, y: s.y - origin.y, z: s.z - origin.z };
          const m = this._stageMarks.get(q.id) ?? this._stageMark(q.id);
          const old = st.seg.get(q.id);
          let cur = null;
          if (old) cur = motionAt(old, st.el);
          else if (m.tgt && m.tgtFrame === this._frameNo - 1) {
            const v = m.tgtFid === fid ? m.tgtV : null;   // prędkość w innym układzie celów (ciało ↔ świat) — od zera
            cur = { p: { x: m.tgt.x - origin.x + (v?.x ?? 0) * dt, y: m.tgt.y - origin.y + (v?.y ?? 0) * dt, z: m.tgt.z - origin.z + (v?.z ?? 0) * dt }, v };
          }
          const v1 = m.lastT && m.lastTFid === fid ? targetVelocity(T, m.lastT, dur) : null;
          segs.set(q.id, motionSegment({ p0: cur?.p ?? T, v0: cur?.v ?? undefined, p1: T, v1: v1 ?? undefined, durMs: dur }));
          st.from.set(q.id, cur?.p ?? T); st.to.set(q.id, T);
          m.lastT = T; m.lastTFid = fid;
        }
        st.seg = segs;
        st.el = 0; st.dur = dur;
        st.key = key; st.solves++; frame.solves++;
        // Pole kliku (D-CV-5): środek LOGICZNY prowadnicy w układzie celów (przy skorupie idzie za ciałem jak cele; w wolnej
        // przestrzeni — punkt świata) i przesunięcie: przy skorupie sztywne przesunięcie skorupy, w wolnej przestrzeni — o ile
        // węzeł wyświetlany odbiega od rozwiązania w trakcie ruchu (niżej, co klatkę).
        st.cInRel = { x: cIn.x - origin.x, z: cIn.z - origin.z };
        st.shift = st.sol.shell?.shift ? { x: st.sol.shell.shift.x, z: st.sol.shell.shift.z } : null;
      }
      st.frame = this._frameNo;
      this._stageState.set(cl.id, st);
      const sol = st.sol;
      // Cele wyświetlane tej klatki: początek układu + odcinek ruchu (`StageMotionLogic.motionAt`); prędkości — dla ciągłości
      // przy zmianie klastra (znacznik statku).
      st.stagePos.clear();
      const vel = new Map();
      const dc = { x: 0, y: 0, z: 0 };
      for (const q of pts) {
        const seg = st.seg.get(q.id);
        if (!seg) continue;
        const mo = motionAt(seg, st.el);
        const t = { x: origin.x + mo.p.x, y: origin.y + mo.p.y, z: origin.z + mo.p.z };
        st.stagePos.set(q.id, t);
        vel.set(q.id, mo.v);
        dc.x += t.x; dc.y += t.y; dc.z += t.z;
      }
      const nT = st.stagePos.size || 1;
      const dcm = { x: dc.x / nT, y: dc.y / nT, z: dc.z / nT };
      // Stopień sceny z odległości kamery do środka RYSOWANEJ bitwy (przy skorupie — grupa obok ciała, nie środek ciała).
      // ARC CV-6b (decyzja właściciela 20 — D-CV-3 zmienione): podłoga stopnia (`cvTuning.STAGE_BLEND_FLOOR`, domyślnie 1) —
      // bitwa w widoku zostaje ściśnięta przy KAŻDYM zoomie (z daleka skala prawdziwa rozrzucała ją po orbitach, a wiązki
      // przecinały planetę); krzywa zoomu (`curve`) zostaje miarą (odczyty, ikony taktyczne CV-6a).
      const depthAt = st.stagePos.size ? dcm : c;
      const pxL = lengthPx({ length: L, depth: this.camera.position.distanceTo(_STAGE_V.set(depthAt.x, depthAt.y, depthAt.z)), fovDeg: this.camera.fov, H });
      const curve = stageBlend(pxL);
      const blend = stageBlendFloored(pxL, this.cvTuning?.STAGE_BLEND_FLOOR);
      // Pole kliku (D-CV-5): środek LOGICZNY prowadnicy, promień ściskania prowadnicy, przesunięcie. Przy skorupie — sztywne
      // przesunięcie skorupy (grupa rysowana obok ciała jest tą samą mapą promieniową przesuniętą o nie; dawniej środek = grupa
      // RYSOWANA dla obu stron — statek wysłany pod kursor stawał na scenie 6–11 L dalej, zmierzone). W wolnej przestrzeni
      // (CV-6b) — o ile środek węzła wyświetlanego odbiega od środka rozwiązania w trakcie ruchu (odcinki Hermite'a) — dokładnie
      // tam, gdzie scena rysuje.
      const shellOn = !!(shellBody && sol.shell);
      const fieldCentre = st.cInRel ? { x: origin.x + st.cInRel.x, y: c.y, z: origin.z + st.cInRel.z } : c;
      const fieldShift = shellOn ? st.shift
        : (st.stagePos.size ? { x: dcm.x - fieldCentre.x, z: dcm.z - fieldCentre.z } : null);
      Object.assign(info, { blend, curve, pxL, fallback: sol.fallback, misbanded: sol.misbanded, misbandedBefore: sol.misbandedBefore,
        law: sol.law ?? null, spread: sol.spread ?? 1,   // ARC CV-3c — prawo użyte (pole kliku, pasma choreografii)
        passes: sol.passes, centre: fieldCentre, rIn: sol.rIn, shift: fieldShift, scale: sol.fallback ? (sol.scale ?? null) : null,
        solves: st.solves, shell: shellOn ? { bodyR: sol.shell.bodyR, source: sol.shell.u.source, excluded: sol.shell.excluded, pinned: sol.shell.pinned } : null });
      let wSum = 0, wN = 0, kPin = 0;   // ARC CV-3a2 — średnie wejście uczestników w scenę (pole kliku: stopień × wejście)
      // ARC CV-3a3 — kula skorupy (ciało + podłoga): żaden punkt pośredni zoomu nie wchodzi w ciało (`_stagePlace`, `avoid`).
      const avoid = shellOn ? { x: shellBody.x, y: origin.y, z: shellBody.z, r: shellBody.r + STAGE.SHELL_FLOOR_L * L } : null;
      // ARC CV-3b / CV-3c — choreografia: lot wzdłuż kursu na kotwicach sceny (rzut pasm — D-CV-6), w jednostkach sceny ROZSUNIĘTEJ
      // (L × spread: koperta, sufit pionu, podłoga kolizji, margines pasm).
      const Lc = L * (sol.spread ?? 1);
      const choreo = this._choreoCluster(cl, st, pts, dt, Lc, avoid, info, vel);
      for (const q of pts) {
        const target = st.stagePos.get(q.id);
        if (!target) continue;
        const m = this._stageMarks.get(q.id) ?? this._stageMark(q.id);
        if (m.releasing) { m.releasing = false; m.rel = null; }
        m.w = Math.min(1, m.w + dt / STAGE.JOIN_MS);   // dołączający wchodzi w scenę przez JOIN_MS czasu prezentacji
        m.cluster = cl.id;
        let base = q;
        // Finding 626 — unieruchomiony przy ciele BEZ orbity (w logice: środek ciała; sprite dotąd stał tam, gdzie statek
        // przypięto): baza tuż za skorupą w kierunku grupy; wchodzi na nią z ostatniej pozycji sprite'a przez JOIN_MS.
        if (shellOn && cl.pinnedIds?.has?.(q.id) && !orbital?.getOrbit?.(q.id)) {
          if (!m.stale) m.stale = { x: q.x, y: q.y, z: q.z };
          const vb = shellBaseAt(shellBody, sol.shell.u, kPin++, L, { latticeL: STAGE.DECONFLICT_L * (sol.spread ?? 1) });
          base = { x: m.stale.x + (vb.x - m.stale.x) * m.w, y: m.stale.y + (vb.y - m.stale.y) * m.w, z: m.stale.z + (vb.z - m.stale.z) * m.w };
        }
        // ARC CV-3b — cel rysowany = kotwica + przesunięcie choreografii; `m.tgt` zostaje kotwicą (ciągłość ruchu sceny przy zmianie
        // klastra — CV-6b), przesunięcie w `m.choreo` (zapis bazy między klatkami — `_setSpriteBase`).
        const off = choreo?.get(q.id) ?? null;
        this._stagePlace(q.id, this._vessels.get(q.id), base, off ? { x: target.x + off.x, y: target.y + off.y, z: target.z + off.z } : target,
          blend * m.w, avoid);
        m.tgt = target; m.tgtFrame = this._frameNo;
        m.choreo = off;
        m.tgtV = vel.get(q.id) ?? null; m.tgtFid = fid;   // ARC CV-6b — prędkość wyświetlana (ciągłość przy zmianie klastra)
        m.avoidId = shellOn ? cl.shellBodyId : null;
        wSum += m.w; wN++;
        seen.add(q.id);
      }
      info.join = wN ? wSum / wN : 0;
      if (choreo) this._choreoPose(st, choreo, dt, Lc, info);   // ARC CV-3b — kurs (dziób ku celowi) i silnik po zapisie pozycji
      frame.clusters++; frame.staged += pts.length;
      if (sol.fallback) frame.fallback++;
      frame.misbanded = Math.max(frame.misbanded, sol.misbanded);
    }
    // Wyjście ze sceny (koniec starcia, inny układ, galaktyka, bitwa przy ciele bez rysunku ciała): powrót do skali prawdziwej
    // przez JOIN_MS.
    for (const [id, m] of this._stageMarks) {
      if (seen.has(id)) continue;
      const e = this._vessels.get(id);
      if (!e?.sprite) { if (!this._stageKept?.(id)) this._stageMarks.delete(id); continue; }   // ARC CV-5 (706) — przebudowa w toku
      if (!m.releasing) {
        m.releasing = true;
        m.lastT = null; m.tgtV = null;   // ARC CV-6b — ruch sceny od nowa przy kolejnej bitwie (bez prędkości z poprzedniej)
        m.rel = { x: m.drawn.x - m.base.x, y: m.drawn.y - m.base.y, z: m.drawn.z - m.base.z };
        m.w = Number.isFinite(m.rel.x) && Number.isFinite(m.rel.y) && Number.isFinite(m.rel.z) ? 1 : 0;
      }
      m.w = Math.max(0, m.w - dt / STAGE.JOIN_MS);
      if (m.w <= 0) { if (m.ch) this._choreoEnd(id, e, m); this._stageMarks.delete(id); continue; }   // sprite już na bazie (`_unstageVessels`)
      if (m.ch) this._choreoRelease(id, e, m);   // ARC CV-3b — kurs i silnik wracają razem z pozycją (JOIN_MS)
      const p = e.sprite.position;
      const base = { x: p.x, y: p.y, z: p.z };
      // ARC CV-3a3 — powrót ze skorupy też omija ciało (ciało w bieżącym miejscu — krąży wokół gwiazdy).
      const av = m.avoidId != null ? (this.getBodyWorldInfo?.(m.avoidId) ?? null) : null;
      this._stagePlace(id, e, base, { x: base.x + m.rel.x, y: base.y + m.rel.y, z: base.z + m.rel.z }, m.w,
        av ? { x: av.x, y: Number.isFinite(av.y) ? av.y : 0, z: av.z, r: av.r + STAGE.SHELL_FLOOR_L * VESSEL_TARGET_SIZE.frigate } : null);
    }
    for (const [cid, st] of this._stageState) if (st.frame !== this._frameNo) this._stageState.delete(cid);
    this._stageFrame = frame;
  }

  // ARC CV-8a — akcesory starć dla warstwy wizualnej: starcia DSCS + starcia WIRTUALNE powtórek bitew orbitalnych (`CvOrbital`).
  // Bez powtórek w toku — dokładnie lista / obiekt DSCS (ścieżka sprzed CV-8a). Logika gry tych akcesorów nie używa.
  _cvEncList() {
    const a = window.KOSMOS?.deepSpaceCombatSystem?.listActive?.() ?? [];
    const o = this._cvOrb?.encounters?.();
    return o?.length ? a.concat(o) : a;
  }

  _cvEncById(id) {
    return window.KOSMOS?.deepSpaceCombatSystem?._activeEncounters?.get?.(id) ?? this._cvOrb?.byId?.(id) ?? null;
  }

  /** ARC CV-8a — wrak w PREZENTACJI: wrak logiki, chyba że powtórka bitwy orbitalnej wstrzymuje jego zamianę do zniszczenia w powtórce. */
  _cvVisWreck(v) {
    return !!v?.isWreck && !(this._cvOrb?.wreckDeferred?.(v.id) ?? false);
  }

  _cvEncOf(vesselId) {
    return window.KOSMOS?.deepSpaceCombatSystem?._findActiveEncounterContaining?.(vesselId) ?? this._cvOrb?.encOf?.(vesselId) ?? null;
  }

  /** ARC CV-3a1 — o ile scena przesuwa sprite statku (0 — skala prawdziwa; > 0 — rysowany ≠ bez sceny). HUD: radar. */
  getVesselStageBlend(vesselId) {
    return this._stageMarks.get(vesselId)?.k ?? 0;
  }

  // ── ARC CV, kroki CV-3b / CV-3c — CHOREOGRAFIA (F4, D-CV-6, D-CV-7; Findingi 622, 681; decyzja 44 (3)) ───────────────────
  // Na kotwicy sceny (cel wyświetlany — `st.stagePos`) statek dostaje przesunięcie w kopercie klasy, kurs ku celowi (pancernik
  // burtą) i jasność silnika (`ChoreographyLogic`). Niezmiennik D-CV-6: rzut par (`constrainChoreo`) — żadna para nie zmienia
  // pasma odległości na scenie. Przesunięcie dokładane do celu sceny przed `_stagePlace` (jedyna ścieżka zapisu pozycji
  // rysowanej). Kurs — na węźle `canon` rigu: wrapper zostaje tym, kto kurs pisze (lot z misją, orbita ciała, wrak); statek
  // wolny w przestrzeni (nikt mu kursu nie pisze — Finding 622) dostaje na wrapperze kurs pokazywany, więc po bitwie zostaje
  // tak, jak stał. Silnik — smuga rigu co klatkę na zegarze prezentacji. Wejście (dołączenie do sceny) przez `JOIN_MS`; pauza —
  // wszystko stoi (przesunięcia z poprzedniej klatki co do bitu). CV-Z — taniec w kopercie CV-3b usunięty: lot wzdłuż kursu (CV-3c)
  // jest jedynym trybem.
  _choreoCluster(cl, st, pts, dt, L, shell, info, vel = null) {
    const K = window.KOSMOS;
    const vm = K?.vesselManager, fs = K?.fleetSystem;
    const T = this.cvTuning;
    const anchors = st.stagePos;
    // starcie każdego statku i cel strzału z ostatniej rundy
    const encOf = new Map(), lastTgt = new Map();
    for (const enc of cl.encs ?? []) {
      for (const id of encounterParticipants(enc)) encOf.set(id, enc);
      const evs = enc?.timeline?.[enc.timeline.length - 1]?.events;
      if (evs) for (const ev of evs) if (ev && ev.attacker != null && ev.target != null) lastTgt.set(ev.attacker, ev.target);
    }
    // ARC CV-4a (flaga `cvWeapons`) — „żywy” do POKAZANEGO zniszczenia (rejestr salw): okręt zabity w logice, którego trafienie
    // zabijające jeszcze leci, dalej tańczy i celuje; od chwili trafienia — postawa „wyłączony” (silnik gaśnie, bez skrętu).
    const wpnLed = this._cvLedger ?? null;
    const aliveOf = (id) => {
      if (wpnLed) { if (this._vessels.get(id)?.cvKilled) return false; if (wpnLed.killState(id) === 'pending') return true; }
      const hp = encOf.get(id)?.vesselStates?.get?.(id)?.hp; return !(Number.isFinite(hp) && hp <= 0);
    };
    const bySide = new Map();
    for (const q of pts) {
      const a = anchors.get(q.id);
      if (!a) continue;
      if (!bySide.has(q.side)) bySide.set(q.side, []);
      bySide.get(q.side).push({ id: q.id, alive: aliveOf(q.id), x: a.x, y: a.y, z: a.z });
    }
    const paused = !(dt > 0);
    const ids = [], offsets = new Map(), env = new Map();
    const postures = {};
    let allKept = paused;   // pauza: wszystkie przesunięcia z poprzedniej klatki — bez kroku i bez rzutu (poza co do bitu)
    // ARC CV-3c (decyzja 44 (3)) — lot wzdłuż kursu; krawędzie pasm z prawa UŻYTEGO (rozsunięcie).
    const app = apparentEdges(this._stageEdges, st.sol?.law ?? undefined);
    // ARC CV-3c — podłoga kolizji w L PRAWDZIWYCH (modele nie rosną z rozsunięciem — rośnie tylko odstęp): 1 / rozsunięcie w jednostkach
    // sceny `L`; najbliższy odstęp kotwic każdego statku (ciasnota pętli CV-3c — gęsty szyk dostaje mniejsze pętle).
    const floorScale = 1 / Math.max(1e-6, st.sol?.spread ?? 1);
    const nearest = new Map();
    {
      const list = pts.map((q) => [q.id, anchors.get(q.id)]).filter(([, a]) => !!a);
      for (let i = 0; i < list.length; i++) {
        let mn = Infinity;
        const a = list[i][1];
        for (let j = 0; j < list.length; j++) if (j !== i) { const b = list[j][1]; mn = Math.min(mn, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)); }
        nearest.set(list[i][0], mn);
      }
    }
    for (const q of pts) {
      const A = anchors.get(q.id);
      if (!A) continue;
      const m = this._stageMarks.get(q.id) ?? this._stageMark(q.id);
      m.cw = Math.max(0, Math.min(1, (m.cw ?? 0) + dt / STAGE.JOIN_MS));
      const v = vm?.getVessel?.(q.id);
      const enc = encOf.get(q.id);
      if (!m.ch) m.ch = createChoreo(choreoSeed(enc?.id ?? cl.id, q.id), choreoClassOf(v ? vesselSizeClass(v) : null));
      const ch = m.ch;
      const mo = v?.movementOrder;
      const posture = postureOf({ alive: aliveOf(q.id), retreating: mo?._retreatFromCombat === true || mo?.retreatFromBattleId != null,
        doctrine: fs?.getVesselFleet?.(q.id)?.doctrine ?? null, preferMaxRange: mo?.preferMaxRange === true });
      ch.posture = posture;
      postures[posture] = (postures[posture] ?? 0) + 1;
      const enemies = [];
      for (const [side, arr] of bySide) if (side !== q.side) for (const r of arr) enemies.push(r);
      const pick = pickFacingTarget({ anchor: A, prevTargetId: ch.targetId, eventTargetId: lastTgt.get(q.id) ?? null,
        engageTargetId: mo?.type === 'engage' ? (mo.targetEntityId ?? null) : null, enemies });
      ch.targetId = pick?.id ?? null;
      ch.aimPoint = pick?.point ?? null;
      ids.push(q.id);
      env.set(q.id, choreoEnvelope(ch.cls, L, T));
      const dx = (pick?.point?.x ?? A.x) - A.x, dy = (pick?.point?.y ?? A.y) - A.y, dz = (pick?.point?.z ?? A.z) - A.z;
      const g = Math.hypot(dx, dy, dz);
      // Prędkość kotwicy [j./ms] (odcinek ruchu sceny) → [L/s] — spokój przy przestawianiu szyku. Wyprzedzenie: największa prędkość
      // z planu ruchu rundy w oknie `CHOREO_CALM_AHEAD` (odcinek jest znany od rozwiązania) — pomiar na żywym silniku: bez niego
      // przesunięcia ~0,26 L wchodziły w przyspieszenie kotwicy do 5–7 L/s, a rzut pasm łamał je pojedynczymi klatkami do 3,9 L/s.
      const va = vel?.get?.(q.id);
      let vPeak = va ? Math.hypot(va.x, va.y, va.z) : 0;
      const seg = st.seg?.get?.(q.id), ahead = Math.max(0, T.CHOREO_CALM_AHEAD ?? 300);
      if (seg && ahead > 0) {
        const n = Math.max(1, Math.ceil(ahead / 100));
        for (let i = 1; i <= n; i++) { const w = motionAt(seg, (st.el ?? 0) + ahead * i / n).v; vPeak = Math.max(vPeak, Math.hypot(w.x, w.y, w.z)); }
      }
      const cin = { dtMs: dt, posture, threat: g > 1e-9 ? { dir: { x: dx / g, y: dy / g, z: dz / g }, gap: g } : null, L,
        anchorSpeedL: vPeak * 1000 / L };
      // ARC CV-3c — rama pętli od NAJBLIŻSZEGO żywego przeciwnika (histereza 15 %), nie od celu strzału: cel zmienia się co rundę, a pętla
      // przypięta do niego obracała się wokół kotwicy (zmierzone na prawdziwym kleju: statek jechał bokiem). Strzela wieżyczka (CV-4a).
      let lt = null, ld = Infinity;
      for (const r of enemies) if (r.alive) { const d = Math.hypot(r.x - A.x, r.y - A.y, r.z - A.z); if (d < ld) { ld = d; lt = r; } }
      const cur = ch.loopTgt != null ? enemies.find((r) => r.id === ch.loopTgt && r.alive) : null;
      if (cur && lt && cur.id !== lt.id) {
        const dc = Math.hypot(cur.x - A.x, cur.y - A.y, cur.z - A.z);
        if (!(ld < 0.85 * dc)) { lt = cur; ld = dc; }
      }
      ch.loopTgt = lt?.id ?? null;
      const lThreat = lt && ld > 1e-9 ? { dir: { x: (lt.x - A.x) / ld, y: (lt.y - A.y) / ld, z: (lt.z - A.z) / ld }, gap: ld } : cin.threat;
      const o = stepChoreo2Offset(ch, { ...cin, app, nearestGap: nearest.get(q.id) ?? Infinity, floorScale, threat: lThreat }, T);
      ch.mode2 = true;
      ch.c2 = 1;
      ch.anchorVel = va ?? null;   // [j./ms] prędkość kotwicy (odcinek sceny) — kurs CV-3c idzie za kotwicą + wzorem
      if (!m.choreo) allKept = false;
      // ARC CV-5 — wrak dryfuje w kopercie klasy (deterministycznie z ziarna statku, od zera w chwili zniszczenia; pauza — klatka niżej
      // bierze przesunięcia poprzedniej klatki co do bitu)
      const dr = posture === 'disabled' ? (this._cvDmgDrift?.(q.id, env.get(q.id)) ?? null) : null;
      offsets.set(q.id, { x: (o.x + (dr?.x ?? 0)) * m.cw, y: (o.y + (dr?.y ?? 0)) * m.cw, z: (o.z + (dr?.z ?? 0)) * m.cw });
    }
    if (!ids.length) return null;
    let res = null;
    if (allKept) for (const id of ids) offsets.set(id, this._stageMarks.get(id).choreo);
    else {
      res = constrainChoreo({ ids, anchors, offsets, app, L, floorScale,
        weights: env, envelopes: env, vertMax: Math.max(0, T?.CHOREO_VERT ?? 0.6) * L, shell,
        warm: st.choreoWarm ?? (st.choreoWarm = new Map()), warmDecay: paused ? 1 : undefined });
    }
    if (info) {
      let sum = 0, max = 0;
      for (const id of ids) { const o = offsets.get(id); const l = Math.hypot(o.x, o.y, o.z) / L; sum += l; if (l > max) max = l; }
      const prev = info.choreo;
      info.choreo = { ships: ids.length, meanL: sum / ids.length, maxL: max, postures,
        clamped: res ? res.clamped : (prev?.clamped ?? 0), halved: res ? res.halved : (prev?.halved ?? 0), zeroed: res ? res.zeroed : (prev?.zeroed ?? 0),
        bowDeg: prev?.bowDeg ?? null, flightDeg: prev?.flightDeg ?? null,
        mode2: ids.filter((id) => this._stageMarks.get(id)?.ch?.mode2).length };
    }
    return offsets;
  }

  /** ARC CV-3b — kurs (dziób ku celowi / burta / odwrót od zagrożenia) i silnik statków klastra po zapisie pozycji rysowanych. */
  _choreoPose(st, offsets, dt, L, info) {
    const T = this.cvTuning;
    const anchors = st.stagePos;
    const vm = window.KOSMOS?.vesselManager;
    const errs = [];
    let flight = null;   // ARC CV-3c — kąt dziób ↔ ruch rysowany
    for (const [id, o] of offsets) {
      const e = this._vessels.get(id), m = this._stageMarks.get(id), ch = m?.ch;
      if (!e?.sprite || !ch) continue;
      const A = anchors.get(id);
      if (!A) continue;
      const sx = A.x + o.x, sy = A.y + o.y, sz = A.z + o.z;
      let aim = null;
      const At = ch.targetId != null ? anchors.get(ch.targetId) : null;
      if (At) { const ot = offsets.get(ch.targetId); aim = { x: At.x + (ot?.x ?? 0) - sx, y: At.y + (ot?.y ?? 0) - sy, z: At.z + (ot?.z ?? 0) - sz }; }
      else if (ch.aimPoint) aim = { x: ch.aimPoint.x - sx, y: ch.aimPoint.y - sy, z: ch.aimPoint.z - sz };
      if (e.canonical && e.rig?.canon && e.rig.frameQuat) {
        let initYaw = 0, initPitch = 0;
        if (ch.yaw == null) {   // pierwszy krok: kurs, z którym sprite stał (zwrot ku celowi widać — Finding 681)
          _CHV.set(0, 0, 1).applyQuaternion(e.sprite.quaternion);
          initYaw = Math.atan2(_CHV.x, _CHV.z); initPitch = Math.asin(Math.max(-1, Math.min(1, _CHV.y)));
        }
        {
          // ARC CV-3c — dziób za RUCHEM RYSOWANYM (prędkość sprite'a z tej klatki: kotwica, pętla i poprawka rzutu pasm), wygładzonym
          // `CHOREO2_VEL_TAU` × mnożnik klasy (`CHOREO2_CLASS.velTauK`): statek nie jedzie bokiem także wtedy, gdy rzut odchyla pętlę w gęstym
          // szyku, a kotwice błądzą z rundy na rundę (~0,2 L — prowadnica sceny, CV-6b) — duży okręt uśrednia to błądzenie dłużej, zamiast gonić
          // każdy zwrot (pomiar na prawdziwym kleju: pancernik 30 °/s z wygładzeniem 120 ms stał w nasyceniu skrętu połowę czasu). Pierwsza
          // klatka — prędkość zamierzona (kotwica + wzór pętli).
          const k2 = (m.cw ?? 1) * (ch.c2 ?? 1), va = ch.anchorVel, vp = ch.f2?.vel;
          const vInt = { x: (va?.x ?? 0) + (vp?.x ?? 0) * k2, y: (va?.y ?? 0) + (vp?.y ?? 0) * k2, z: (va?.z ?? 0) + (vp?.z ?? 0) * k2 };
          const p = e.sprite.position, lp = ch.lastDrawn;
          const a = dt > 0 ? 1 - Math.exp(-dt / Math.max(1, (T?.CHOREO2_VEL_TAU ?? 120) * (ch.velTauK ?? 1))) : 0;
          if (ch.headLoop) {
            // pancernik (`CHOREO2_CLASS.headLoop`): własna pętla (~0,1 L/s) jest wolniejsza od błądzenia kotwic, którego 30 °/s nie dogoni —
            // dziób za pętlą (postać zamknięta) i za przestawianiem szyku od `CHOREO2_DRIFT_V0` [L/s sceny] (podchodzenie, odwrót)
            const sA = va ? Math.hypot(va.x, va.y, va.z) * 1000 / L : 0;
            const d0 = T?.CHOREO2_DRIFT_V0 ?? 0.35, d1 = Math.max(d0 + 1e-6, T?.CHOREO2_DRIFT_V1 ?? 1.0);
            const u = Math.max(0, Math.min(1, (sA - d0) / (d1 - d0))), wA = u * u * (3 - 2 * u);
            const vl = { x: (va?.x ?? 0) * wA + (vp?.x ?? 0) * k2, y: (va?.y ?? 0) * wA + (vp?.y ?? 0) * k2, z: (va?.z ?? 0) * wA + (vp?.z ?? 0) * k2 };
            const s0 = ch.velDrawnS ?? vl;
            ch.velDrawnS = { x: s0.x + (vl.x - s0.x) * a, y: s0.y + (vl.y - s0.y) * a, z: s0.z + (vl.z - s0.z) * a };
          } else if (lp && dt > 0) {
            const vd = { x: (p.x - lp.x) / dt, y: (p.y - lp.y) / dt, z: (p.z - lp.z) / dt };
            const s0 = ch.velDrawnS ?? vd;
            ch.velDrawnS = { x: s0.x + (vd.x - s0.x) * a, y: s0.y + (vd.y - s0.y) * a, z: s0.z + (vd.z - s0.z) * a };
          } else if (!ch.velDrawnS) ch.velDrawnS = vInt;
          ch.velInt = ch.velDrawnS;
        }
        const f = stepChoreo2Facing(ch, { dtMs: dt, posture: ch.posture, vel: ch.velDrawnS, aim, L, initYaw, initPitch }, T);
        ch.q = f.q;
        this._choreoOrient(id, e, m, m.cw ?? 1);
        if (aim && ch.posture !== 'retreat' && ch.posture !== 'disabled') {
          const al = Math.hypot(aim.x, aim.y, aim.z) || 1;
          const bx = Math.sin(f.yaw) * Math.cos(f.pitch), by = Math.sin(f.pitch), bz = Math.cos(f.yaw) * Math.cos(f.pitch);
          const ang = Math.acos(Math.max(-1, Math.min(1, (bx * aim.x + by * aim.y + bz * aim.z) / al))) / Math.PI * 180;
          errs.push(ch.cls === 'battleship' ? Math.abs(90 - ang) : ang);
          // ARC CV-3c — kąt dziób ↔ ruch RYSOWANY (różnica pozycji sprite'a między klatkami; przy prędkości > 0,05 L/s)
          const p = e.sprite.position, lp = ch.lastDrawn;
          if (lp && dt > 0) {
            const vx = (p.x - lp.x) / dt, vy = (p.y - lp.y) / dt, vz = (p.z - lp.z) / dt, vl = Math.hypot(vx, vy, vz);
            if (vl * 1000 / L > 0.05) (flight ??= []).push(Math.acos(Math.max(-1, Math.min(1, (bx * vx + by * vy + bz * vz) / vl))) / Math.PI * 180);
          }
        }
        if (dt > 0) ch.lastDrawn = { x: e.sprite.position.x, y: e.sprite.position.y, z: e.sprite.position.z };
      }
      const vi = ch.velInt;
      const lvl = stepChoreo2Engine(ch, { dtMs: dt, posture: ch.posture, L, speed: vi ? Math.hypot(vi.x, vi.y, vi.z) : 0 }, T);
      ch.engineOut = lvl;
      const v = vm?.getVessel?.(id);
      const raw = exhaustIntensityRaw({ state: v?.position?.state, isWreck: !!((this._cvVisWreck?.(v) ?? !!v?.isWreck) || e.isWreck || e.cvKilled) });
      this._choreoExhaust(e, e.cvKilled ? 0 : raw + (lvl - raw) * (m.cw ?? 1));   // ARC CV-4a — zniszczony: silnik gaśnie od razu
    }
    if (info?.choreo && errs.length) {
      errs.sort((a, b) => a - b);
      info.choreo.bowDeg = { median: errs[Math.floor(errs.length / 2)], max: errs[errs.length - 1] };
    }
    if (info?.choreo && flight?.length) {
      flight.sort((a, b) => a - b);
      info.choreo.flightDeg = { median: flight[Math.floor(flight.length / 2)], max: flight[flight.length - 1], n: flight.length };
    }
  }

  /**
   * ARC CV-3b — kurs pokazywany z wagą (wejście / wyjście przez JOIN_MS). Statek wolny w przestrzeni (nikt mu kursu nie pisze —
   * Finding 622): na wrapperze SAM kurs choreografii (po bitwie zostaje co do kąta), a pochylenie i przechył × waga przez `canon`
   * (delta × kwaternion ramy pliku hardpointów) — wyjście gasi je bez ruszania kursu (slerp całego kwaternionu przesuwał kurs
   * o kilka stopni przy pochyleniu z przechyłem). Wrapper w rękach piszącego kurs (lot z misją, orbita ciała, wrak): kurs
   * pokazywany = slerp(wrapper, choreografia, waga), delta przez `canon`.
   */
  _choreoOrient(id, e, m, weight) {
    const ch = m?.ch;
    if (!ch?.q) return;
    const wrapper = e.sprite, canon = e.rig.canon, fq = e.rig.frameQuat;
    const v = window.KOSMOS?.vesselManager?.getVessel?.(id);
    const w = Math.max(0, Math.min(1, weight));
    if (!this._choreoHeadingOwned(id, v, e)) {
      wrapper.rotation.set(0, ch.yaw, 0);
      const d = quatFromYawPitchRoll(0, ch.pitch * w, ch.roll * w);
      _CHQ_A.set(d[0], d[1], d[2], d[3]);
    } else {
      _CHQ_C.set(ch.q[0], ch.q[1], ch.q[2], ch.q[3]);
      _CHQ_D.copy(wrapper.quaternion);
      if (w >= 1) _CHQ_D.copy(_CHQ_C); else _CHQ_D.slerp(_CHQ_C, w);
      _CHQ_A.copy(wrapper.quaternion).invert().multiply(_CHQ_D);
    }
    // ARC CV-4a — przechył wraku w chwili zniszczenia (rejestr salw): pochylenie i przechył w ramie statku, narasta przez
    // `WPN_KILL_TILT_MS` na zegarze prezentacji (choreografia pisze kurs co klatkę, więc przechył jedzie tutaj).
    const kt = e.cvKillTilt;
    if (kt) {
      const kw = Math.max(0, Math.min(1, (this._presClock.nowMs - kt.at) / Math.max(1, this.cvTuning?.WPN_KILL_TILT_MS ?? 300)));
      const d = quatFromYawPitchRoll(0, kt.rz * kw, kt.rx * kw);
      const kq = this._cvKillQ ?? (this._cvKillQ = new THREE.Quaternion());
      _CHQ_A.multiply(kq.set(d[0], d[1], d[2], d[3]));
    }
    const tb = this._cvDmgTumble?.(e);   // ARC CV-5 — powolny obrót wraku (zegar efektów uszkodzeń; pauza = pauza)
    if (tb) _CHQ_A.multiply(tb);
    canon.quaternion.set(fq[0], fq[1], fq[2], fq[3]).premultiply(_CHQ_A);
  }

  /** ARC CV-3b — czy wrapperowi pisze kurs ktoś inny (lot z misją, orbita ciała, wrak); statek wolny — nie. */
  _choreoHeadingOwned(id, v, e) {
    if (e?.isWreck || (this._cvVisWreck?.(v) ?? !!v?.isWreck)) return true;
    if (v?.position?.state === 'in_transit' && v?.mission) return true;
    if (v?.position?.dockedAt != null) {
      const orb = window.KOSMOS?.orbitalSpaceSystem?.getOrbit?.(id);
      if (orb && !orb.anchored) return true;
    }
    return false;
  }

  /** ARC CV-3b — wyjście ze sceny (koniec bitwy): kurs i silnik wracają do stanu bez choreografii razem z pozycją (waga `m.w`). */
  _choreoRelease(id, e, m) {
    const ch = m.ch;
    if (!ch || !e?.sprite) return;
    const w = Math.max(0, Math.min(1, (m.cw ?? 1) * m.w));
    if (e.canonical && e.rig?.canon && e.rig.frameQuat && ch.q) this._choreoOrient(id, e, m, w);
    const v = window.KOSMOS?.vesselManager?.getVessel?.(id);
    const raw = exhaustIntensityRaw({ state: v?.position?.state, isWreck: !!((this._cvVisWreck?.(v) ?? !!v?.isWreck) || e.isWreck || e.cvKilled) });
    this._choreoExhaust(e, e.cvKilled ? 0 : raw + ((ch.engineOut ?? 0) - raw) * w);
  }

  /** ARC CV-3b — koniec choreografii statku: `canon` z powrotem na kwaternion ramy, smuga z powrotem do `_applyExhaust`. */
  _choreoEnd(id, e, m) {
    // ARC CV-4a — przechył wraku z chwili zniszczenia (`cvKillTilt`, nakładany dotąd w `_choreoOrient`) zostaje we wrapperze: obraz
    // tuż przed końcem (wrapper · przechył · rama) == obraz po nim — wrak nie prostuje się po bitwie.
    if (e?.cvKillTilt && e.sprite) {
      const d = quatFromYawPitchRoll(0, e.cvKillTilt.rz, e.cvKillTilt.rx);
      const kq = this._cvKillQ ?? (this._cvKillQ = new THREE.Quaternion());
      e.sprite.quaternion.multiply(kq.set(d[0], d[1], d[2], d[3]));
      e.cvKillTilt = null;
    }
    // ARC CV-5 — obrót wraku z ostatniej klatki zostaje we wrapperze (koniec bitwy: wrak nie wraca do kursu sprzed obrotu), dalej stoi
    const tb = e ? this._cvDmgTumble?.(e) : null;
    if (tb && e.sprite) { e.sprite.quaternion.multiply(tb); e.cvWreck.tumbleBaked = true; }
    if (e?.rig?.canon && e.rig.frameQuat) { const fq = e.rig.frameQuat; e.rig.canon.quaternion.set(fq[0], fq[1], fq[2], fq[3]); }
    if (e) {
      e._choreoExhaust = false;
      const v = window.KOSMOS?.vesselManager?.getVessel?.(id);
      if (v) this._applyExhaust(v, e);
      else { if (e.exhaust) e.exhaust.visible = false; for (const g of e.rig?.glows ?? []) g.group.visible = false; }
    }
    if (m) { m.ch = null; m.choreo = null; m.cw = 0; }
  }

  /** ARC CV-3b — smuga silnika w walce (jak `_applyExhaust`, ale jasność z choreografii i migotanie na zegarze prezentacji). */
  _choreoExhaust(e, intensity) {
    const cone = e?.exhaust;
    if (!cone) return;
    e._choreoExhaust = true;
    if (e.cvDmgSputter != null) intensity *= e.cvDmgSputter;   // ARC CV-5 — krztuszący się silnik (≤ 25 % HP)
    const flick = 0.8 + 0.2 * Math.sin(this._stageClock.nowMs * 0.02 + (e._exhaustPhase ?? 0));
    // ARC CV-3c (`cvChoreo2`) — wylot dysz zamiast stożka: jasność z choreografii, zakrztuszenie migocze wylotem (iskry z dyszy — CV-5)
    if (this._nozzleGlowSet?.(e, intensity, flick)) return;
    if (!GAME_CONFIG.FEATURES?.fcCombatFx || e.isWreck || !(intensity > 0.002)) { cone.visible = false; return; }
    cone.visible = true;
    if (cone.material) cone.material.opacity = 0.35 * intensity * flick;
    if (e.canonical) {
      const T = this.cvTuning;
      const rad = Math.max(e.rig?.nozzleR ?? 0.04, T.MODEL_PLUME_R_MIN ?? 0.03) * (T.MODEL_PLUME_R_MUL ?? 1);
      cone.scale.set(rad, (T.MODEL_PLUME_LEN ?? 0.8) * intensity * (0.85 + 0.3 * flick), rad);
      return;
    }
    cone.scale.x = intensity * (0.85 + 0.3 * flick);
  }

  /**
   * ARC CV-3c (decyzja właściciela 44 (4), flaga `cvChoreo2`) — WYLOT DYSZ zamiast stożka smugi: rdzeń HDR w otworze dyszy (ponad
   * progiem bloomu), miękka poświata i krótki słaby błysk ciągu (długość ∝ ciąg²), cyjan statków warp. Jasność `intensity` (0..1 —
   * choreografia w walce, `exhaustIntensityRaw` w locie; zakrztuszenie już wliczone), migotanie `flick` na zegarze prezentacji
   * (pauza = pauza). Zwraca true, gdy rysuje wylot (stożek schowany); false — flaga OFF albo statek bez wylotów (ścieżka stożka bez
   * zmian, wyloty schowane). Pokrętła `cvTuning.NOZZLE_*` czytane co klatkę.
   */
  _nozzleGlowSet(e, intensity, flick = 1) {
    const gl = e?.rig?.glows;
    if (!gl?.length) return false;
    const F = GAME_CONFIG.FEATURES;
    if (e.exhaust) e.exhaust.visible = false;
    const I = !F?.fcCombatFx || e.isWreck || e.cvKilled ? 0 : Math.max(0, Math.min(1.5, Number(intensity) || 0));
    const on = I > 0.002;
    const T = this.cvTuning ?? {};
    const k = Math.min(1, I);
    // decyzja właściciela 45 (4) — preset Niska: sam rdzeń wylotu (bez poświaty i błysku ciągu); Wysoka / Średnia — pełny wylot
    const coreOnly = this._gfx?.level === 'low';
    for (const g of gl) {
      g.group.visible = on;
      if (!on) continue;
      g.halo.visible = !coreOnly;
      const r = g.r * (T.NOZZLE_R_MUL ?? 1);
      const cs = (T.NOZZLE_CORE_K ?? 2.0) * r * (0.85 + 0.25 * I) * (0.94 + 0.06 * flick);
      g.core.scale.set(cs, cs, 1);
      g.core.material.color.setHex(NOZZLE_KEY_HEX).multiplyScalar((T.NOZZLE_CORE ?? 3.2) * (0.35 + 0.65 * k) * (0.9 + 0.1 * flick));
      const hs = (T.NOZZLE_HALO_K ?? 5.5) * r * (0.7 + 0.45 * I);
      g.halo.scale.set(hs, hs, 1);
      g.halo.material.color.setHex(NOZZLE_KEY_HEX).multiplyScalar((T.NOZZLE_HALO ?? 0.5) * k);
      const fl = (T.NOZZLE_FLARE_LEN ?? 3.2) * r * k * k * (0.85 + 0.3 * flick);
      g.flare.visible = !coreOnly && fl > r * 0.05;
      const fw = (T.NOZZLE_FLARE_W ?? 1.6) * r;
      g.flare.scale.set(fw, fw, Math.max(1e-6, fl));
      g.flare.material.color.setHex(NOZZLE_KEY_HEX).multiplyScalar((T.NOZZLE_FLARE ?? 0.6) * k);
    }
    return true;
  }

  // ── ARC CV-3a2 (D-CV-5) — POLE KLIKU SCENY: punkt pod kursorem (rysowany) ↔ punkt bez sceny (logiczny) ─────────────────
  // Pola klastrów z tej klatki (`_tickBattleStage`): środek uczestników bez sceny, promień ściskania rIn, stopień sceny ×
  // średnie wejście w scenę, skala awaryjna. Pole jest mapą promieniową z soczewką (`BattleStageLogic.fieldMap`) — poza
  // LENS_OUT·rIn od środka tożsamość. Poza flagą, w galaktyce, dla innego układu niż oglądany i bez sceny — brak pól: klik
  // bez zmian. ARC CV-3a3 — bitwa przy ciele: pole wokół środka LOGICZNEGO grupy przesunięte o przesunięcie skorupy (`shift`)
  // — grupa rysowana obok ciała (ciało bez rysunku — bez sceny, bez pola).
  _stageFields(systemId) {
    if (this._galaxyActive || this._galaxyFlight) return [];
    if (systemId != null && systemId !== (window.KOSMOS?.activeSystemId ?? null)) return [];
    const out = [];
    for (const c of this._stageFrame?.list ?? []) {
      const blend = (c.blend ?? 0) * (c.join ?? 0);
      if (!c.centre || !(c.rIn > 0) || !(blend > 0)) continue;
      out.push({ id: c.id, centre: { x: c.centre.x, z: c.centre.z }, rIn: c.rIn, blend, scale: c.scale ?? null,
        shift: c.shift ? { x: c.shift.x, z: c.shift.z } : null,   // CV-3a3 — przy skorupie: pole przesunięte (D-CV-5)
        ...(c.law ? { law: c.law } : {}) });   // CV-3c — pole z prawem ROZSUNIĘTEJ sceny (klik pod kursorem przy każdym `STAGE_SPREAD`)
    }
    return out;
  }

  /** ARC CV-3a2 (D-CV-5) — punkt RYSOWANY (XZ świata, np. przecięcie promienia kliku) → punkt bez sceny; poza scenami bez zmian. */
  stageLogicalOf(systemId, wx, wz) {
    const f = pickStageField(this._stageFields(systemId), { x: wx, z: wz });
    if (!f) return { x: wx, z: wz, staged: false };
    const q = stagePointLogical({ x: wx, z: wz }, f);
    return { x: q.x, z: q.z, staged: true, cluster: f.id, blend: f.blend };
  }

  /** ARC CV-3a2 — punkt bez sceny (XZ świata) → punkt RYSOWANY w polu sceny (brzeg soczewki ten sam w obu przestrzeniach). */
  stageWorldOf(systemId, lx, lz) {
    const f = pickStageField(this._stageFields(systemId), { x: lx, z: lz });
    if (!f) return { x: lx, z: lz, staged: false };
    const q = stagePointDrawn({ x: lx, z: lz }, f);
    return { x: q.x, z: q.z, staged: true, cluster: f.id, blend: f.blend };
  }

  /**
   * ARC CV-3a1 — KOSMOS.debug.stageInfo(): scena każdego klastra z tej klatki — uczestnicy, starcia, stopień sceny, fregata
   * w px, prowadnica (złe pasma przed / po, skala awaryjna), odstępy RYSOWANE par strzelec → cel z ostatniej rundy w L
   * (według broni) obok odstępu logicznego w AU.
   */
  stageInfo() {
    const L = VESSEL_TARGET_SIZE.frigate;
    const fr = this._stageFrame;
    const rows = [];
    for (const c of fr?.list ?? []) {
      const gaps = {};
      for (const enc of c.encs ?? []) {
        const last = enc?.timeline?.[enc.timeline.length - 1];
        for (const ev of last?.events ?? []) {
          const a = this._vessels.get(ev.attacker)?.sprite?.position, b = this._vessels.get(ev.target)?.sprite?.position;
          if (!a || !b) continue;
          const g = a.distanceTo(b) / L;
          const k = String(ev.weapon ?? '?').replace(/^weapon_/, '');
          const r = gaps[k] ?? (gaps[k] = { min: Infinity, max: 0, au: [] });
          r.min = Math.min(r.min, g); r.max = Math.max(r.max, g);
          if (Number.isFinite(ev.distanceAU)) r.au.push(ev.distanceAU);
        }
      }
      const fmt = (r) => `${r.min.toFixed(1)}–${r.max.toFixed(1)} L (logicznie ${Math.min(...r.au).toFixed(3)}–${Math.max(...r.au).toFixed(3)} AU)`;
      rows.push({
        klaster: c.id, starcia: c.encounterIds.length, statki: c.members, przyCiele: c.pinned, blend: +c.blend.toFixed(3),
        // ARC CV-6b (decyzja 20) — `blend` = stopień użyty (z podłogą), `krzywa` = sama krzywa zoomu semantycznego (miara)
        krzywa: +(c.curve ?? 0).toFixed(3),
        fregataPx: +c.pxL.toFixed(1), zlePasmaPrzed: c.misbandedBefore, zlePasma: c.misbanded, awaryjna: c.fallback,
        // ARC CV-3a3 — rozwiązania prowadnicy od początku sceny klastra (raz na rundę — Finding 652); skorupa przy ciele (D-CV-4)
        rozwiazania: c.solves ?? 0, cialo: c.shell ? c.shellBodyId : (c.pinned ? `${c.shellBodyId} (bez rysunku — bez sceny)` : '—'),
        kierunek: c.shell?.source ?? '—',
        laser: gaps.laser ? fmt(gaps.laser) : '—', kinetyk: gaps.kinetic ? fmt(gaps.kinetic) : '—', rakiety: gaps.missile ? fmt(gaps.missile) : '—',
        // ARC CV-3b — choreografia: statki · średnie / największe przesunięcie od kotwicy [L]; postawy; odchyłka dziobu od celu
        // (pancernik — burty od ±90°) mediana / max [°]; pary poprawione przez rzut pasm w tej klatce (awaryjnie: połowienia / zera)
        choreo: c.choreo ? `${c.choreo.ships} · ${c.choreo.meanL.toFixed(2)} / ${c.choreo.maxL.toFixed(2)} L` : '—',
        postawy: c.choreo ? Object.entries(c.choreo.postures).map(([k, n]) => `${k} ${n}`).join(' · ') : '—',
        dziob: c.choreo?.bowDeg ? `${c.choreo.bowDeg.median.toFixed(0)}° / ${c.choreo.bowDeg.max.toFixed(0)}°` : '—',
        // ARC CV-3c — tryb choreografii (lot wzdłuż kursu — statki w trybie 2) i kąt dziób ↔ ruch rysowany mediana / max [°]
        lot: c.choreo ? `${c.choreo.mode2 ?? 0} / ${c.choreo.ships}` + (c.choreo.flightDeg ? ` · dziób↔ruch ${c.choreo.flightDeg.median.toFixed(1)}° / ${c.choreo.flightDeg.max.toFixed(0)}°` : '') : '—',
        rozsuniecie: +(c.spread ?? 1).toFixed(2),
        rzut: c.choreo ? `${c.choreo.clamped} par` + (c.choreo.halved || c.choreo.zeroed ? ` · awaryjnie ${c.choreo.halved} / ${c.choreo.zeroed}` : '') : '—',
      });
    }
    console.table(rows);
    return { clusters: rows };
  }

  // ARC CV-3a1 (Finding 643) — kadr walki z osią NA bitwie: cel = środek RYSOWANYCH żywych, widocznych uczestników klastra
  // (wysokość statków — kółko jedzie do statków); kompozycja nad kartą walki przesunięciem ekranowym
  // (`_syncCombatViewOffset`). Pamięć na jedną klatkę.
  // ARC CV-3a2 (Finding 648, decyzja właściciela (b)) — dystans „Obserwuj” z dopasowania PEŁNEJ sceny (rozwiązanie prowadnicy,
  // stopień 1): „Obserwuj” samo nurkuje w kino, bez kółka. Dopasowanie do pozycji RYSOWANYCH nie nurkuje — przy stopniu ≈ 0
  // (próg zoomu semantycznego jest płaski, smoothstep od 4 px) kadr zatrzymuje się ≈ 2,6 j. przy stopniu ~3 % (zmierzone,
  // plan §4 CV-3a2). W dystansie kina stopień < 1 (bardzo rozległy klaster) — kilka kroków ku najbliższemu dystansowi, przy
  // którym bitwa rysowana przy TYM stopniu mieści się w kadrze. Klaster bez sceny (CV-3a3: przy ciele bez rysunku) — kadr
  // w skali prawdziwej; bitwa przy ciele z rysunkiem — kadr na grupie przy skorupie (nurkuje jak każda scena).
  _stageWatchFit(enc) {
    const cc = this._cameraController;
    if (!cc || !enc?.id) return null;
    if (this._stageFitFrame !== this._frameNo) { this._stageFitCache.clear(); this._stageFitFrame = this._frameNo; }
    if (this._stageFitCache.has(enc.id)) return this._stageFitCache.get(enc.id);
    const cl = this._stageClusterOf.get(enc.id);
    const encs = cl?.encs?.length ? cl.encs : [enc];
    const drawn = [], base = [], drawnIds = [];
    // ARC CV-6b (zgłoszenie właściciela 2026-11-09 — zacinanie): kadr ze WSZYSTKICH rysowanych uczestników, także zniszczonych
    // w trakcie starcia (DSCS trzyma ich w starciu do końca, sprite stoi na scenie — Finding 615). Dawniej tylko żywi: każde
    // zniszczenie przesuwało oś kadru skokiem — zmierzone w grze: 4 z 4 klatek ze zniszczeniem szarpnęły cel kamery (10–49 L/s).
    for (const en of encs) {
      const ids = [...(en.sideA?.vesselIds ?? []), ...(en.sideA?.joinedVesselIds ?? []),
        ...(en.sideB?.vesselIds ?? []), ...(en.sideB?.joinedVesselIds ?? [])];
      for (const id of ids) {
        const e = this._vessels.get(id);
        if (!e?.sprite?.visible) continue;
        const p = e.sprite.position;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        drawn.push({ x: p.x, y: p.y, z: p.z });
        base.push(this._spriteBase(id, e));
        drawnIds.push(id);
      }
    }
    if (!drawn.length) { this._stageFitCache.set(enc.id, null); return null; }
    const W = window.innerWidth || 1, H = window.innerHeight || 1;
    const ins = getMapInsets(window.KOSMOS);
    const safe = watchSafeRect({ W, H, uiScale: window.KOSMOS?.uiScale ?? 1, hudRect: window.KOSMOS?.combatHud?.getPanelRect?.() ?? null,
      topBarH: COSMIC.TOP_BAR_H, bottomH: ins.bottom, rightW: ins.right, leftW: ins.left });
    // ARC CV-3b — oś kadru z pozycji rysowanych BEZ przesunięć choreografii (koperta ≤ 1 L, fazy losowe — średnia falowałaby
    // osią kamery); bez choreografii — dokładnie pozycje rysowane jak dotąd.
    let pivotPts = drawn;
    for (let i = 0; i < drawnIds.length; i++) {
      const m = this._stageMarks.get(drawnIds[i]), o = m?.choreo;
      if (!o) continue;
      if (pivotPts === drawn) pivotPts = drawn.slice();
      const p = drawn[i];
      pivotPts[i] = { x: p.x - o.x * m.k, y: p.y - o.y * m.k, z: p.z - o.z * m.k };
    }
    const pivot = centroidOf(pivotPts);
    const fitAt = (pts) => fitWatchFrameOffset({ points: pts, pivot: centroidOf(pts), theta: cc._theta, phi: cc._phi,
      fovDeg: this.camera.fov, aspect: this.camera.aspect, W, H, safe });
    // ARC CV-3a3 — cele sceny WYŚWIETLANE tej klatki (rozwiązanie rundy z płynnym przejściem — Finding 652; przy ciele — grupa
    // przy skorupie, D-CV-4); klaster bez sceny (ciało bez rysunku) — brak celów.
    const sp = cl ? this._stageState.get(cl.id)?.stagePos : null;
    // Pozycja sceny × WEJŚCIE statku w scenę (`_stageMarks.w`, 500 ms czasu prezentacji — w pauzie stoi): przed wejściem kadr
    // zostaje w skali prawdziwej, nurkowanie rusza razem ze zbieraniem się statków (zmierzone: dopasowanie do pełnej sceny
    // w pauzie przed wejściem dawało 0,4 j. przy statkach w skali prawdziwej — 8 / 20 w kadrze).
    const staged = sp?.size ? drawnIds.map((id, i) => {
      const q = sp.get(id), w = this._stageMarks.get(id)?.w ?? 0, b = base[i];
      return q ? { x: b.x + (q.x - b.x) * w, y: b.y + (q.y - b.y) * w, z: b.z + (q.z - b.z) * w } : b;
    }) : null;
    let fit = staged ? fitAt(staged) : null;
    // ARC CV-6b (decyzja 20) — stopień w dystansie kadru z tą samą podłogą co scena (przy podłodze 1 bitwa rysowana = scena przy
    // każdym dystansie, więc kadr na pozycjach sceny jest dokładny i pętla kończy się od razu).
    for (let k = 0; fit && k < 4; k++) {
      const b = stageBlendFloored(lengthPx({ length: VESSEL_TARGET_SIZE.frigate, depth: fit.dist, fovDeg: this.camera.fov, H }), this.cvTuning?.STAGE_BLEND_FLOOR);
      if (b >= 0.999) break;
      const f2 = fitAt(base.map((q, i) => ({ x: q.x + (staged[i].x - q.x) * b, y: q.y + (staged[i].y - q.y) * b, z: q.z + (staged[i].z - q.z) * b })));
      if (!f2 || !(f2.dist > fit.dist + 1e-9)) break;
      fit = f2;
    }
    const cinema = !!fit;
    if (!fit) fit = fitAt(base);
    const out = { target: pivot, dist: fit?.dist ?? cc._targetDist, fits: !!fit?.fits, cinema, centroid: pivot, points: drawn, base, safe, W, H };
    this._stageFitCache.set(enc.id, out);
    return out;
  }

  // ARC CV-3a1 (Finding 638) — jedna bitwa = klaster starć: gdy obserwowane starcie się skończyło, a klaster trwa, kamera
  // przechodzi na inne aktywne starcie tego klastra (lista starć klastra z poprzedniej klatki).
  _stageSuccessor(encounterId, clusterIds) {
    for (const eid of clusterIds ?? []) {
      if (eid === encounterId) continue;
      const e = this._cvEncById(eid);
      if (e?.isActive) return e;
    }
    return null;
  }

  // ARC CV-3a1 (Finding 643) — kompozycja kadru walki przesunięciem EKRANOWYM (statki nad kartą walki), bez przesuwania
  // celu kamery: kółko jedzie do środka bitwy. Co klatkę po `update()` kontrolera, przy „Obserwuj” albo auto-fokusie pod
  // scenie bitwy; wygaszane płynnie. Podgląd obserwatorium ma własne przesunięcie — wtedy nic tu nie robimy.
  _syncCombatViewOffset() {
    const cam = this.camera;
    if (!cam?.setViewOffset || this._observatoryPreviewActive) { this._combatViewOffset = null; return; }
    const cc = this._cameraController;
    let goal = null;
    const encId = this._watch?.encounterId ?? this._autoFocus?.encounterId ?? null;
    if (cc && encId && !this._galaxyActive && !this._galaxyFlight) {
      const enc = this._cvEncById(encId);
      const fit = enc?.isActive ? this._stageWatchFit(enc) : null;
      if (fit) {
        const r = viewOffsetFrame({ points: fit.points, pivot: { x: cc._target.x, y: cc._target.y, z: cc._target.z }, d: cc._dist,
          theta: cc._theta, phi: cc._phi, fovDeg: cam.fov, aspect: cam.aspect, W: fit.W, H: fit.H, safe: fit.safe });
        if (r.ok) goal = r.offset;
      }
    }
    if (!goal && !this._combatViewOffset) return;
    const cur = this._combatViewOffset ?? { x: 0, y: 0 };
    const nx = cur.x + ((goal?.x ?? 0) - cur.x) * 0.25, ny = cur.y + ((goal?.y ?? 0) - cur.y) * 0.25;
    if (!goal && Math.abs(nx) < 0.5 && Math.abs(ny) < 0.5) { this._combatViewOffset = null; cam.clearViewOffset(); return; }
    this._combatViewOffset = { x: nx, y: ny };
    const W = window.innerWidth || 1, H = window.innerHeight || 1;
    cam.setViewOffset(W, H, -nx, -ny, W, H);
  }

  // ── POLISH P2a (CP13, Finding 458) — „Obserwuj / Watch”: kamera śledzi walkę ──────────────────────────────
  // Start: cel kamery od razu w kadrze walki (jak dotąd `focusOnInstant`), dystans dochodzi lerpem kontrolera; minDist
  // na czas obserwacji ≤ `ZOOM_MIN_DIST` (gracz może przybliżyć kółkiem), po końcu wraca do wartości sprzed.
  // Co klatkę (`_updateWatchCamera`): kadr z pozycji SPRITE'ÓW (statek na orbicie ciała jest rysowany na wysokości orbity —
  // pozycja logiczna jest płaska; audyt P2 §10.3), cel — szybkie śledzenie `focusOnSmooth`. Koniec: starcie się skończyło albo
  // nie jest w oglądanym układzie, albo kamerę przejął ktoś inny (inny fokus, reset H, zmiana układu — cel ≠ ostatni
  // ustawiony); samo kółko (dystans ≠ ostatni ustawiony) kończy wyłącznie dopasowanie dystansu.
  _startWatch(encounterId, x, y) {
    const cc = this._cameraController;
    if (!cc) return;
    if (this._watch) this._endWatch();
    const minDistBefore = cc._minDist;
    const enc = encounterId ? this._cvEncById(encounterId) : null;
    if (!enc?.isActive) {
      // Brak aktywnego starcia (ładunek bez id albo starcie już rozstrzygnięte) — dawny kadr punktu startu (bez śledzenia).
      cc.setMinDist(0.005);
      cc.focusOnInstant(S(x), S(y), 0.3);
      cc.setTargetDist(Math.min(cc._targetDist, 1.2));
      return;
    }
    cc.setMinDist(Math.min(minDistBefore, COMBAT_WATCH.ZOOM_MIN_DIST));
    this._watch = { encounterId, fitDist: true, minDistBefore, minDistSet: cc._minDist, goal: null, dist: null, clusterIds: null };
    // ARC CV-3a1 (Finding 643) — kadr z osią na bitwie (`_stageWatchFit`).
    const fit = this._stageWatchFit(enc);
    if (fit) {
      cc.focusOnInstant(fit.target.x, fit.target.z, fit.target.y);
      cc.setTargetDist(fit.dist);
    } else {
      // Sprite'y uczestników jeszcze nie stoją: po przełączeniu widoku na układ starcia model GLB wstawia się
      // asynchronicznie (obietnica loadera, także z pamięci podręcznej) — cel od razu na punkcie starcia, kadr i dystans
      // dopasuje pierwsza klatka ze sprite'ami (`_updateWatchCamera`). Dawniej: stały kadr ≤ 1,2 j. bez śledzenia.
      cc.focusOnInstant(S(x), S(y), 0.3);
    }
    this._watch.goal = { x: cc._goalTarget.x, y: cc._goalTarget.y, z: cc._goalTarget.z };
    this._watch.dist = cc._targetDist;
  }

  _updateWatchCamera() {
    const w = this._watch;
    const cc = this._cameraController;
    if (!w || !cc) { this._watch = null; return; }
    const g = cc._goalTarget;
    if (w.goal && (Math.abs(g.x - w.goal.x) > 1e-6 || Math.abs(g.y - w.goal.y) > 1e-6 || Math.abs(g.z - w.goal.z) > 1e-6)) {
      this._endWatch();   // kamerę przejął inny fokus / reset / zmiana układu
      return;
    }
    if (w.fitDist && w.dist != null && Math.abs(cc._targetDist - w.dist) > 1e-6) w.fitDist = false;   // kółko gracza
    let enc = this._cvEncById(w.encounterId);
    // ARC CV-3a1 (Finding 638) — jedna bitwa = klaster starć
    if (!enc?.isActive) { const nx = this._stageSuccessor(w.encounterId, w.clusterIds); if (nx) { w.encounterId = nx.id; enc = nx; } }
    w.clusterIds = this._stageClusterOf.get(enc?.id)?.encounterIds ?? null;
    if (!enc?.isActive || !isEngagementInView({ encounterSystemId: enc.location?.systemId, activeSystemId: window.KOSMOS?.activeSystemId })) {
      this._endWatch();
      return;
    }
    const fit = this._stageWatchFit(enc);   // ARC CV-3a1 (643)
    if (!fit) return;
    // Cel — szybkie śledzenie (`focusOnSmooth`, jak kamera na wybranym statku): sam lerp 0,08 na klatkę (`flyTo`) zostawiał
    // kamerę ~12 klatek ruchu za walką — przy dystansie rzędu 0,4 j. formacja wyjeżdżała z kadru, a statek lecący ku
    // kamerze potrafił w nią wjechać (sonda P2a w prawdziwej grze, scena 3 na 2). Dystans — lerp kontrolera.
    cc.focusOnSmooth(fit.target.x, fit.target.z, fit.target.y);
    if (w.fitDist) cc.setTargetDist(fit.dist);
    w.goal = { x: g.x, y: g.y, z: g.z };
    w.dist = cc._targetDist;
  }

  _endWatch() {
    const w = this._watch;
    this._watch = null;
    const cc = this._cameraController;
    if (!w || !cc) return;
    if (cc._minDist === w.minDistSet) {
      cc.setMinDist(w.minDistBefore);
      if (cc._targetDist < w.minDistBefore) cc.setTargetDist(cc._targetDist);
    }
  }

  // POLISH P2b (D1, Finding 467) — auto-fokus starcia śledzi walkę (ta sama logika co „Obserwuj”: kadr
  // `_computeWatchFit`, cel `_autoFocusTarget` — uczestnicy wyśrodkowani nad panelem walki, szybkie śledzenie
  // `focusOnSmooth`; bez dopasowania dystansu). Koniec — `autoFocusFollowStep`.
  _updateAutoFocusCamera() {
    const a = this._autoFocus;
    const cc = this._cameraController;
    if (!a || !cc) { this._autoFocus = null; return; }
    let enc = a.encounterId ? this._cvEncById(a.encounterId) : null;
    if (a.encounterId) {   // ARC CV-3a1 (Finding 638) — jedna bitwa = klaster starć
      if (!enc?.isActive) { const nx = this._stageSuccessor(a.encounterId, a.clusterIds); if (nx) { a.encounterId = nx.id; enc = nx; } }
      a.clusterIds = this._stageClusterOf.get(enc?.id)?.encounterIds ?? null;
    }
    const g = cc._goalTarget;
    const step = autoFocusFollowStep({
      watching: !!this._watch, active: !!enc?.isActive,
      inView: isEngagementInView({ encounterSystemId: enc?.location?.systemId, activeSystemId: window.KOSMOS?.activeSystemId }),
      goal: g, lastGoal: a.goal, centre: enc?.isActive ? this._autoFocusTarget(enc) : null,
    });
    if (step.end) { this._autoFocus = null; return; }
    if (step.target) cc.focusOnSmooth(step.target.x, step.target.z, step.target.y);
    a.goal = { x: g.x, y: g.y, z: g.z };
  }

  // POLISH P2b (D1, Finding 467) — cel auto-fokusu: uczestnicy wyśrodkowani w prostokącie bezpiecznym kadru „Obserwuj”
  // (ekran bez pasków UI i panelu walki — nie pod kartą) przy BIEŻĄCYM dystansie kamery: `watchTargetAt`, ta sama reguła
  // co „Obserwuj”, bez dopasowania dystansu. Środek uczestników na środku ekranu stawiał część z nich pod panelem walki
  // (sonda P2b w prawdziwej grze, scena 3 na 2: obaj strażnicy pod kartą we wszystkich klatkach auto-fokusu).
  // Bez sprite'ów — null (cel bez zmian).
  _autoFocusTarget(enc) {
    return this._stageWatchFit(enc)?.target ?? null;   // ARC CV-3a1 (643) — oś na bitwie
  }

  // Głębia punktu w przestrzeni widoku kamery [j.] — rozmiar billboardu na ekranie zależy od głębi, nie od odległości.
  _viewDepth(pos) {
    _WATCH_V.copy(pos).applyMatrix4(this.camera.matrixWorldInverse);
    return -_WATCH_V.z;
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
    if (this._observatoryPreviewActive && this._selectedEntityId) {
      const body = EntityManager.get(this._selectedEntityId);
      if (body && !body.explored) veilId = this._selectedEntityId;  // grey-out tylko niezbadane
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

  // ── Faza 2 (Obraz Operacyjny) — glify trybu taktycznego ────────────────────
  // Billboard-glif o stałym rozmiarze EKRANOWYM (wzór _syncEnemyAlertMarkers)
  // nad każdym statkiem; model GLB (DZIECI wrappera) ukrywany na czas trybu —
  // NIGDY cały wrapper (jego .visible bramkuje markery, etykiety i znacznik statku w HUD, a pozycja
  // kotwiczy wszystkie nakładki). Cache tekstur per (glif|kolor).
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

  // ctx dla buildShipEntry — wpięcia świata (jak warstwa etykiet HUD).
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
  // Ustawia statek pod kursorem doku: podświetla jego trasę na warstwie HUD (`HudRouteLayer` czyta `_tacticalHoverVid`);
  // puls ducha ETA czyta _tacticalHoverVid w _upsertTacticalGhost (per-frame).
  setTacticalHoverVid(vid) {
    const next = vid ?? null;
    if (this._tacticalHoverVid === next) return;
    this._tacticalHoverVid = next;
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
  // ARKUSZ UI U3-2 (Finding 477): termin układu — statek bez widocznego sprite'a pinguje się po `vessel.position` tylko,
  // gdy leży w OGLĄDANYM układzie (współrzędne są lokalne dla układu); statek z innego układu albo w tranzycie warp —
  // odmowa (`false`), zamiast pierścienia w ramce cudzego układu.
  pingVessel(vesselId) {
    if (!vesselId) return false;
    const K = window.KOSMOS;
    const sp = this._vessels.get(vesselId)?.sprite;
    const vessel = K?.vesselManager?.getVessel?.(vesselId) ?? null;
    if (!(sp?.visible && sp.position)) {
      const viewed = K?.activeSystemId ?? K?.starSystemManager?.activeSystemId ?? 'sys_home';
      if (!vessel || systemIdOf(vessel) !== viewed) return false;
    }
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - (this._lastTacticalPingMs || 0) < TACTICAL_PING_THROTTLE_MS) return false;
    this._lastTacticalPingMs = now;
    // Pozycja: sprite.position = gotowy world (orbita/dok); fallback vessel.position → S().
    let x, y, z;
    if (sp?.visible && sp.position) { x = sp.position.x; y = sp.position.y; z = sp.position.z; }
    else {
      const p = vessel?.position;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      x = S(p.x); y = 0.3; z = S(p.y);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.13, 24),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.position.set(x, y, z);
    ring.rotation.x = -Math.PI / 2;
    // ARKUSZ HUD paczka B (D-HUD-16) — kolor w roli `primary` motywu nadaje `_spawnFx`.
    this._spawnFx(ring, { kind: 'ping', lifetime: FX_PING_MS, baseScale: 1, baseOpacity: 1, hudRole: 'primary' });
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
  // marker to tylko „tu jest wróg"). Mark&sweep + wspólny puls.
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
    // ARKUSZ HUD paczka B (D-HUD-12) — puls okresowy na zegarze SYMULACJI (pauza — celownik stoi; przed pierwszym tikiem —
    // pełny), a w czasie alertu tego wroga celownik pulsuje w rytmie alertu (jeden rysunek z pierścieniami alertu warstwy
    // HUD — `HudFocusLayer` ich wtedy nie rysuje).
    const sim = simClockMs();
    const pulse = sim == null ? 1 : 0.5 + 0.5 * Math.sin((sim / 1000) * 3.2);
    const hud = window.KOSMOS?.hudLayer;
    const alertHex = this._hud3dHex('alert');   // paczka B (D-HUD-16) — rola `alert` motywu
    const camPos = this.camera?.position;            // skala wg dystansu → stały rozmiar EKRANOWY
    const active = new Set();
    // ARC CV-3a3 (Finding 653 (a), decyzja właściciela §3.2-11 — ŁATA do CV-6a) — celownik statku NA SCENIE
    // gaśnie ze stopniem sceny statku (w skali prawdziwej — jak dotąd), w kinie go nie ma: znacznik zdjęty, więc pierścienie
    // alertu rysuje wtedy warstwa HUD sama (`HudLayer` — `crosshair` = znacznik istnieje).
    // Finding 666 (b) (decyzja właściciela 2026-11-09): uczestnik klastra starć W WIDOKU (`_stageParticipants`, z `_tickBattleStage`)
    // nie dostaje celownika przy ŻADNYM zoomie — wroga oznaczają romby warstwy HUD; ostateczne oznaczenie — CV-6a. Wygaszanie ze
    // stopniem zostaje tylko dla statków schodzących ze sceny po końcu starcia (już nie uczestnicy, znacznik jeszcze wraca).
    const fadeK = this.cvTuning?.STAGE_RETICLE_FADE_K ?? 0.25;
    for (const [vid, entry] of this._vessels) {
      if (!entry?.sprite?.visible) continue;          // ukryty/wyblakły ghost → brak markera
      const v = vm.getVessel?.(vid);
      if (!v || v.isWreck) continue;
      if (!isEnemyVessel(v)) continue;                // tylko wrogowie (NIE własne statki)
      if (!this._isEnemyTargetable(vid)) continue;    // intel ≥ rumor (gate quality)
      if (this._stageParticipants.has(vid)) continue;   // Finding 666 (b) — uczestnik bitwy w widoku: bez celownika
      const stageFade = 1 - Math.min(1, (this._stageMarks.get(vid)?.k ?? 0) / Math.max(1e-6, fadeK));
      if (stageFade <= 1e-3) continue;
      active.add(vid);
      let m = this._enemyAlertMarkers.get(vid);
      if (!m) {
        m = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._getAlertReticleTex(), color: alertHex,
          transparent: true, depthWrite: false,
        }));
        this.scene.add(m);
        this._enemyAlertMarkers.set(vid, m);
      }
      if (m.userData.hudHex !== alertHex) { m.material.color.setHex(alertHex); m.userData.hudHex = alertHex; }   // motyw
      // Paczka B — w czasie alertu obwiednia alertu zastępuje puls okresowy (dwa impulsy, potem jak dotąd).
      const env = hud?.alertEnvelopeFor?.(vid) ?? 0;
      const pv = env > 0 ? env : pulse;
      const opacity = 0.35 + 0.55 * pv;            // 0.35..0.90 — nigdy niewidoczny
      const pulseScale = ALERT_MARKER_SCALE * (1 + 0.16 * pv);
      const p = entry.sprite.position;
      m.position.set(p.x, p.y, p.z);
      m.material.opacity = opacity * stageFade;
      // Skaluj wielkością proporcjonalnie do dystansu kamery — billboard o stałym rozmiarze
      // świata KURCZY się ekranowo przy oddaleniu (znikał z dalekiego zoomu). Mnożnik
      // dist/REF_DIST utrzymuje ~stały rozmiar na ekranie od bliska po cały układ.
      const distFactor = camPos ? Math.max(0.5, camPos.distanceTo(m.position) / ALERT_MARKER_REF_DIST) : 1;
      // POLISH P2a (CP14, Finding 458) — limit rozmiaru EKRANOWEGO: poniżej dystansu 30 j. (współczynnik 0,5) celownik
      // rósł na ekranie (119–138 px przy „Obserwuj”). Limit liczony dla szczytu pulsu — puls zostaje w każdym rozmiarze.
      const base = capBillboardWorld(ALERT_MARKER_SCALE * distFactor, { capPx: COMBAT_WATCH.RETICLE_MAX_PX / ALERT_MARKER_PULSE_MAX,
        depth: this._viewDepth(m.position), fovDeg: this.camera.fov, H: window.innerHeight || 1 });
      m.scale.setScalar(base * (pulseScale / ALERT_MARKER_SCALE));
    }
    for (const k of [...this._enemyAlertMarkers.keys()]) if (!active.has(k)) this._disposeEnemyAlertMarker(k);
  }

  // ── ARKUSZ HUD paczka B (D-HUD-16) — kolory 3D w rolach motywu ─────────────────────────────────────────────────
  // Rola HUD (`primary` / `foreign` / `alert`) jako 0xRRGGBB bieżącego motywu (`HudPalette.hudRoleHex`); pamięć na epokę
  // motywu (`themeEpoch` — `applyPreset` / `applyTheme`, np. F7 w trakcie gry).
  _hud3dHex(role) {
    const ep = themeEpoch();
    if (this._hud3dHexEpoch !== ep || !this._hud3dHexMemo) { this._hud3dHexEpoch = ep; this._hud3dHexMemo = {}; }
    return this._hud3dHexMemo[role] ?? (this._hud3dHexMemo[role] = hudRoleHex(role));
  }

  // Co klatkę (pętla renderu, przed rysunkiem — także w pauzie): stożki przechwycenia (rola `primary`) i pierścienie starcia
  // (`alert`) w barwie bieżącego motywu — pierścień tworzony bez koloru dostaje ją przed pierwszym rysunkiem, istniejące —
  // po zmianie motywu. Celownik wroga barwi `_syncEnemyAlertMarkers`, efekty krótkotrwałe (ping, puls) — `_spawnFx`.
  _syncHud3dColors() {
    const ep = themeEpoch();
    if (this._predictionConeMeshes.size) {
      for (const [, e] of this._predictionConeMeshes) {
        if (e.hudEpoch === ep) continue;
        const hex = this._hud3dHex('primary');
        e.fillMesh?.material?.color?.setHex(hex);
        e.lineMesh?.material?.color?.setHex(hex);
        e.hudEpoch = ep;
      }
    }
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
