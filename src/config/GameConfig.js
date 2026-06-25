// Konfiguracja gry i stałe fizyczne projektu KOSMOS

import { t } from '../i18n/i18n.js';

export const GAME_CONFIG = {
  // Wymiary ekranu (piksele)
  WIDTH: 1280,
  HEIGHT: 720,

  // Skala: ile pikseli = 1 AU (jednostka astronomiczna = ~150 mln km)
  AU_TO_PX: 110,

  // Czas gry — mnożniki: ile lat gry na sekundę realną
  // 1/365.25 (1d/s) | 3/365.25 (3d/s) | 7/365.25 (1t/s) | 1/12 (1m/s) | 1 (1r/s)
  TIME_MULTIPLIERS: [0, 1 / 365.25, 3 / 365.25, 7 / 365.25, 1 / 12, 1],

  // Etykiety przycisków UI (indeks 1:1 z TIME_MULTIPLIERS)
  TIME_MULTIPLIER_LABELS: ['PAUZA', '1d/s', '3d/s', '1t/s', '1m/s', '1r/s'],

  // Mnożnik czasu cywilizacyjnego — mechaniki 4X biegną N× szybciej niż fizyka orbitalna
  CIV_TIME_SCALE: 12,

  // Generacja układu planetarnego — liczba planet ustalana przez _rollPlanetCount() w SystemGenerator
  MIN_ORBIT_AU: 0.3,   // minimalna orbita od gwiazdy (AU)
  MAX_ORBIT_AU: 35.0,  // maksymalna orbita (AU) — zwiększone dla układów 8–11 planet (Neptun ~30 AU)

  // Dysk protoplanetarny
  DISK_MIN_PLANETESIMALS: 40,
  DISK_MAX_PLANETESIMALS: 60,
  DISK_MIN_AU: 0.1,
  DISK_MAX_AU: 12.0,

  // Tło
  BACKGROUND_COLOR: 0x0a0a1a,
  STAR_COUNT_BACKGROUND: 250,

  // ── Feature flagi (Milestone 1/2 — Combat Foundation) ────────────────────
  // Kill-switch dla nowych systemów. OFF-by-default — instancjonowane lazily
  // gdy flag=true (zob. GameScene._ensureMovementOrderSystem / ...Materializer).
  // Toggle z devtools: KOSMOS.debug.enableMovementOrders() / disable...().
  FEATURES: {
    // M1 — Targeting Foundation (save v65) — M4 P1: flip ON jako default (gracz nie potrzebuje devtools)
    movementOrders:       true,   // MovementOrderSystem (M1 Commit 4-6)
    fleetMaterialization: true,   // EmpireFleetMaterializer (M1 Commit 7)
    // M2a — Combat Core (save v66) — M4 P1: flip ON
    proximitySystem:      true,   // ProximitySystem — per-tick detection + events
    vesselCombat:         true,   // VesselCombatSystem — deep-space battles (wymaga proximitySystem)
    unifiedAggregator:    true,   // WarSystem._fleetArrived skip gdy materializationState='full'
    // M2a post-playtest freeze: drain zamrożony do M4 P4 reformy fuel/power cells.
    // Kod drain + PURSUE_DRAIN_MULT zostaje w VesselManager._tickEndurance — unfreeze
    // przez flip flagi w P4 gdy M4 wprowadzi pełny model fuel/endurance z hard-stop semantyką.
    enduranceDrainActive: false,  // _tickEndurance early return gdy off (brak drain/regen/events)
    // M2b — Intelligence + POI (save v67)
    intelContactState:    true,   // IntelSystem.vessels sub-domain + degradation (Commit 2 flipped)
    predictionCone:       true,   // prediction cone math (Commit 3); rendering w Commit 4
    poiSystem:            true,   // POIRegistry CRUD + handler poi:deleted (Commit 5 flipped); goToPOI/patrol runtime w C6
    // M3 P1.3 — UI orders interactive (rollback toggle: false → placeholder behavior z P1.1/P1.2)
    m3OrdersInteractive:  true,
    // ── M4 P1 — Activation + Notifications + Drift fix (save v69) ─────────
    m4DriftFix:           true,   // MovementOrderSystem._completeOrder vessel target → driftIdle + 5y auto-return
    m4Notifications:      true,   // UIManager subskrybuje empire:fleet*/battle:resolved/vessel:proximityEnter
    m4FuelAwareRetreat:   true,   // AutoRetreatSystem fallback low_fuel_drift zamiast hard fail
    // ── M4 P2 — Sensor overlay + Enemy ghosts + Minimap (save v70) ────────
    m4SensorOverlay:      true,   // ThreeRenderer._syncSensorOverlay (cyan/yellow rings) — rollback OFF dla regresji
    m4EnemyGhosts:        true,   // _syncVesselPositions intel-gated rendering (rumor/contact/detailed)
    m4MiniMap:            true,   // GalacticMiniMap overlay (klawisz M)
    // ── M4 P3 — Tick-based Deep-Space Combat (save v71) ───────────────────
    // Flip ON w P3-3 (fire exchange działa end-to-end). Gdy true: VCS deleguje
    // vessel:combatRangeEnter do DSCS (per-tick fire exchange zamiast instant
    // BattleSystem.resolveBattle). Gdy false: instant path z M4 P2 (rollback).
    m4DeepSpaceCombat:    true,
    // ── Player Fleet Groups (save v73) ────────────────────────────────────
    // Gracz tworzy nazwane floty z statków własnych. P1: CRUD + UI. P2: fleet
    // orders (sync ETA + speed cap). P3: doktryna (kite/hold/retreat_at_50).
    // Flip ON po P1 c5 (CRUD + UI gotowe, P2/P3 nie potrzebują flag-flip —
    // dodają semantykę nad bazą). System sam zawsze instancjowany gdy civMode.
    playerFleets:         true,
    // ── S3.4 — Light Diplomacy (save v85, bez migracji) ───────────────────
    // Oś trust + misje emisariuszy + efekty traktatów + bramkowe triggery
    // vessel:arrived (military_presence/research_intrusion/trespassing). OFF do
    // czasu live-gate (Stage 9 flip ON). Bramkuje: subskrypcję vessel:arrived,
    // tick traktatów (_tickTreaties), AI envoy (AlienCivSystem) i akcje w DiplomacyOverlay.
    lightDiplomacy:       true,
  },

  // ── M4 P2 — Sensor + Intel rendering tunables ────────────────────────────
  // Promień radarowy własnego vessela (AU). Cyan ring wokół każdego own
  // vessela; wzorowane na sensor lock range z M2a (proximity detection
  // pre-fight, 0.5 AU enter / 0.6 AU exit) ale wizualnie pokazujemy węższe
  // 0.3 AU jako "operacyjny zasięg sensora" (czytelność, nie zaśmiecanie mapy).
  SENSOR_LOCK_AU: 0.3,
  // Czas zaniku ghost rumor (gameYears). Po RUMOR_FADE_YEARS od ostatniego
  // obserwacji intel quality='rumor' opacity → 0 i ghost nie jest renderowany
  // (opacity ≤ 0.05 = skip). Pattern z plan §P2 R4.
  RUMOR_FADE_YEARS: 10,

  // ── UI tuning (M3 P1.5+) ────────────────────────────────────────────────
  // Universal tooltip system (Tooltip.js + TooltipContent.js).
  // tooltipDelayMs: delay przed show po hover. Filip D5=B (configurable).
  UI: {
    tooltipDelayMs: 500,
  },

  // ── M4 P3 — Weapon ranges + Combat disengage (AU) ────────────────────────
  // Bazowe zasięgi broni w AU (przed mnożnikami tech-mult). Konsumowane przez
  // DeepSpaceCombatSystem._resolveWeaponRange z fallback gdy module.rangeAU brak.
  // weapon_laser=0.05, weapon_kinetic=0.15, weapon_missile=0.30 (ShipModulesData).
  WEAPON_SHORT_AU:  0.05,
  WEAPON_MED_AU:    0.15,
  WEAPON_LONG_AU:   0.30,
  // Próg rozejścia żywych vesseli z combat — gdy wszystkie po jednej stronie
  // oddalą się > tej wartości od midpoint → encounter kończony jako draw.
  COMBAT_DISENGAGE_AU: 0.50,

  // ── Warp — twardy limit dystansu POJEDYNCZEGO skoku (LY) ────────────────────
  // Cel dalej niż to = WarpRouteSystem planuje multi-hop przez układy pośrednie
  // (każdy odcinek ≤ limit). Niezależny od pojemności baku (limit fizyczny napędu).
  WARP_MAX_JUMP_LY: 10,

  // ── M3 P3.1 — POI runtime tunables ───────────────────────────────────────
  // POIRuntimeSystem detection throttling i parametry per-type.
  // Detection runs co N time:tick events (~16ms each) — co 10 = ~167ms delay.
  poiDetectionTickInterval: 10,
  // Picket cooldown po triggered → game-days (rename z picketCooldownSeconds
  // dla semantic clarity — gameTime jest w latach, więc 30 dni = 30/365.25 lat).
  picketCooldownGameDays: 30,
  // Rally member gather range (gameplay px). Hardcoded MVP, per-rally konfig
  // w future. Vessel w tym promieniu od poi.center liczony jako "zebrany".
  rallyGatherRangePx: 50,
};

// Typy gwiazd z parametrami fizycznymi
// masa: masy słoneczne | luminosity: jasności słoneczne | temperature: Kelwiny
export const STAR_TYPES = {
  M: {
    get name() { return t('star.M'); },
    mass: 0.3,
    luminosity: 0.04,
    temperature: 3500,
    color: 0xff6b47,
    glowColor: 0xff3311,
    habitableZone: { min: 0.10, max: 0.35 },
    weight: 3,
    texType: 'star_M',
    corona: {
      glowScale: 6.0, glowOpacity: 1.0,
      brightness: 3.5,   // mocniejsze overexposure (ciemne kolory)
      whitePower: 0.8,    // szersze białe centrum
    },
  },
  K: {
    get name() { return t('star.K'); },
    mass: 0.7,
    luminosity: 0.4,
    temperature: 4500,
    color: 0xffaa55,
    glowColor: 0xff8822,
    habitableZone: { min: 0.40, max: 1.05 },
    weight: 2,
    texType: 'star_K',
    corona: {
      glowScale: 6.5, glowOpacity: 1.0,
      brightness: 3.2,
      whitePower: 0.9,
    },
  },
  G: {
    get name() { return t('star.G'); },
    mass: 1.0,
    luminosity: 1.0,
    temperature: 5800,
    color: 0xfffacd,
    glowColor: 0xffee66,
    habitableZone: { min: 0.85, max: 1.70 },
    weight: 2,
    texType: 'star_G',
    corona: {
      glowScale: 7.0, glowOpacity: 1.0,
      brightness: 2.8,
      whitePower: 1.2,
    },
  },
  F: {
    get name() { return t('star.F'); },
    mass: 1.4,
    luminosity: 3.0,
    temperature: 7000,
    color: 0xffffff,
    glowColor: 0xddddff,
    habitableZone: { min: 1.45, max: 2.95 },
    weight: 1,
    texType: 'star_F',
    corona: {
      glowScale: 8.0, glowOpacity: 1.0,
      brightness: 2.5,   // białe = mniej potrzebne overexposure
      whitePower: 1.5,
    },
  },
};

// Konfiguracja typów planet — albedo, kolory, cechy wizualne
// albedo: współczynnik odbicia światła [0=czarne ciało, 1=pełne odbicie]
export const PLANET_TYPE_CONFIG = {
  hot_rocky: {
    albedo:        0.05,
    glowColor:     0xff5500,
    // lawa, rdzawa skała, ciemny bazalt, rozżarzona magma, soot
    colorVariants: [0xc84820, 0xd05028, 0xb83818, 0xe05830,
                    0xa83010, 0xd84018, 0x885040, 0xe87848, 0x786050],
    hasRings:      false,
    glowIntensity: 0.15,
  },
  rocky: {
    albedo:        0.15,
    glowColor:     null,
    colorVariants: null,         // kolor zależy od temperatury (getRockyColor)
    hasRings:      false,
    glowIntensity: 0,
  },
  gas: {
    albedo:        0.35,
    glowColor:     null,
    // Paleta zróżnicowana — inspirowane realnymi egzoplanetami i ciałami Układu Słonecznego
    // Ciepłe    (~20%): klasyczny Jowisz/Saturn — złoto, beż, karmel
    // Chłodne   (~25%): Uran/Neptun-like — błękit, teal, akwamaryn
    // Rdzawe    (~20%): brązowe karły, żelaziste — ceglaste, terakota, rdzawy brąz
    // Fioletowe (~15%): egzotyczne atmosfery z siarką/jodem — liliowe, śliwkowe
    // Zielone   (~10%): metan/chlor — oliwkowe, ciemnozielone
    // Szare     (~10%): chłodne gazowe, chmury amoniakalowe — grafitowe, stalowe
    colorVariants: [
      // Ciepłe — Jowisz/Saturn
      0xd4a860, 0xc89848, 0xe8c070, 0xb88840,
      // Chłodne — Uran/Neptun
      0x50a8d0, 0x4090c0, 0x60b8d8, 0x38a0c8, 0x70c0d0,
      // Rdzawe — brązowe karły, żelaziste atmosfery
      0xb86040, 0xc87050, 0xa05030, 0xd08060, 0x904028,
      // Fioletowe — egzotyczne (siarka, jod, fotochemia)
      0x9060b0, 0xa870c0, 0x7850a0, 0xb880c8, 0x806098,
      // Zielone — metan, chlor, siarkowodór
      0x608050, 0x507040, 0x6a9058, 0x486038,
      // Szare/stalowe — zimne gazowe, chmury amoniakalowe
      0x7888a0, 0x6878a8, 0x8898b0, 0x586880,
    ],
    hasRings:      false,
    glowIntensity: 0,
  },
  ice: {
    albedo:        0.50,
    glowColor:     null,
    // lodowo-niebieskie, szaro-białe, niebieskawa biel, zieleń Neptuna
    colorVariants: [0x80b8d8, 0xa0d0e8, 0x88c0d8, 0x90c8e0,
                    0xc0d8e8, 0xd0e8f0, 0x90b0c8, 0xa8d8e0,
                    0x78a8c0, 0x60a8c8],
    hasRings:      true,
    glowIntensity: 0,
  },
};
