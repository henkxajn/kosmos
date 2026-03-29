// Główna scena gry — zarządza symulacją układu słonecznego
// Przepisana: bez Phasera, czyste JS + Three.js renderer
//
// Inicjalizuje wszystkie systemy, ThreeRenderer, UIManager.
// Komunikacja wyłącznie przez EventBus.

import EventBus              from '../core/EventBus.js';
import EntityManager         from '../core/EntityManager.js';
import { PhysicsSystem }     from '../systems/PhysicsSystem.js';
import { TimeSystem }        from '../systems/TimeSystem.js';
import { AccretionSystem }   from '../systems/AccretionSystem.js';
import { StabilitySystem }   from '../systems/StabilitySystem.js';
import { PlayerActionSystem } from '../systems/PlayerActionSystem.js';
import { LifeSystem }        from '../systems/LifeSystem.js';
import { GravitySystem }     from '../systems/GravitySystem.js';
import { AudioSystem }       from '../systems/AudioSystem.js';
import { SaveSystem }        from '../systems/SaveSystem.js';
import { ResourceSystem }    from '../systems/ResourceSystem.js';
import { CivilizationSystem } from '../systems/CivilizationSystem.js';
import { BuildingSystem }    from '../systems/BuildingSystem.js';
import { TechSystem }        from '../systems/TechSystem.js';
import { MissionSystem }    from '../systems/MissionSystem.js';
import { ColonyManager }      from '../systems/ColonyManager.js';
import { VesselManager }      from '../systems/VesselManager.js';
import { RandomEventSystem }  from '../systems/RandomEventSystem.js';
import { FactorySystem }      from '../systems/FactorySystem.js';
import { DepositSystem }         from '../systems/DepositSystem.js';
import { ImpactDamageSystem }    from '../systems/ImpactDamageSystem.js';
import { TradeRouteManager }    from '../systems/TradeRouteManager.js';
import { CivilianTradeSystem }  from '../systems/CivilianTradeSystem.js';
import TradeLog                 from '../systems/TradeLog.js';
import { ResearchSystem }      from '../systems/ResearchSystem.js';
import { DiscoverySystem }     from '../systems/DiscoverySystem.js';
import { ObservatorySystem }  from '../systems/ObservatorySystem.js';
import { CollisionForecast } from '../systems/CollisionForecast.js';
import { DiskPhaseSystem }   from '../systems/DiskPhaseSystem.js';
import { showEventNotification, showImpactNotification, showMovementModal } from '../ui/EventChoiceModal.js';
import { showIntroSequence }     from '../ui/IntroModal.js';
import { initMissionEvents, queueMissionEvent } from '../ui/MissionEventModal.js';
import { formatStatLine, formatStatLineWithCursor } from '../ui/TerminalPopupBase.js';
import { SystemGenerator }   from '../generators/SystemGenerator.js';
import { GalaxyGenerator }   from '../generators/GalaxyGenerator.js';
import { StarSystemManager } from '../systems/StarSystemManager.js';
import { Star }              from '../entities/Star.js';
import { Planet }            from '../entities/Planet.js';
import { Moon }              from '../entities/Moon.js';
import { Planetoid }         from '../entities/Planetoid.js';
import { ThreeRenderer }     from '../renderer/ThreeRenderer.js';
import { ThreeCameraController } from '../renderer/ThreeCameraController.js';
import { UIManager }         from './UIManager.js';
import { PlanetScene }       from './PlanetScene.js';
import { GAME_CONFIG }       from '../config/GameConfig.js';
import { TECHS }             from '../data/TechData.js';          // POWER TEST
import { BUILDINGS }         from '../data/BuildingsData.js';     // POWER TEST
import { TERRAIN_TYPES }     from '../map/HexTile.js';            // POWER TEST
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js'; // grid do auto-build
import { t } from '../i18n/i18n.js';

export class GameScene {
  // canvas3D — element #three-canvas
  // uiCanvas  — element #ui-canvas
  // eventLayer — element #event-layer (zbiera mysz)
  start(canvas3D, uiCanvas, eventLayer) {
    EntityManager.clear();
    EventBus.clear();

    // Środek ekranu (gwiazda zawsze tu)
    const cx = GAME_CONFIG.WIDTH  / 2;
    const cy = GAME_CONFIG.HEIGHT / 2;

    // ── Systemy gry ────────────────────────────────────────────
    this.timeSystem    = new TimeSystem();
    this.physicsSystem = new PhysicsSystem();

    // Generowanie / przywrócenie układu
    const savedData = window.KOSMOS?.savedData || null;
    const { star, planets, moons = [], planetesimals, asteroids = [], comets = [], planetoids = [] } =
      savedData
        ? this._restoreSystem(savedData, cx, cy)
        : this._generateFreshSystem(cx, cy);

    this.star = star;

    // ── StarSystemManager — rejestr układów gwiezdnych ───────
    this.starSystemManager = new StarSystemManager();
    this.starSystemManager.registerHomeSystem(star, planets, moons, planetoids);
    window.KOSMOS.starSystemManager = this.starSystemManager;
    window.KOSMOS.activeSystemId    = 'sys_home';

    // ── Three.js renderer ──────────────────────────────────────
    this.threeRenderer = new ThreeRenderer(canvas3D);

    // Inicjalizuj pozycje planet zanim renderer wyrenderuje pierwszą klatkę
    this.physicsSystem.update(0.001);

    this.threeRenderer.initSystem(star, planets, planetesimals, moons);

    // ── Kontroler kamery ───────────────────────────────────────
    // ThreeCameraController nasłuchuje na window (nie potrzebuje eventLayer)
    this.cameraController = new ThreeCameraController(
      this.threeRenderer.getCamera()
    );
    // Podpięcie kontrolera do renderera (update() wywoływany w render loop)
    this.threeRenderer.setCameraController(this.cameraController);

    // ── UI ─────────────────────────────────────────────────────
    this.uiManager = new UIManager(uiCanvas);
    this.uiManager.addInfo(t('dialog.systemFormed'));

    // Blokada kamery gdy kursor nad elementem UI
    this.cameraController._isOverUI = (x, y) => this.uiManager.isOverUI(x, y);

    // ── Pozostałe systemy ──────────────────────────────────────
    const isGenerator = window.KOSMOS?.scenario === 'generator';

    // Systemy fizyki symulacyjnej — aktywne tylko w trybie Generator
    if (isGenerator) {
      this.accretionSystem    = new AccretionSystem({ planetesimals, star });
      this.stabilitySystem    = new StabilitySystem(star);
      this.playerActionSystem = new PlayerActionSystem(star);
      this.gravitySystem      = new GravitySystem(star);
    }

    this.lifeSystem        = new LifeSystem(star);
    this.audioSystem       = window.KOSMOS.audioSystem || new AudioSystem();
    this.diskPhaseSystem   = new DiskPhaseSystem(this.timeSystem);
    this.saveSystem        = new SaveSystem(star, this.timeSystem);

    // Przywróć czas gry z save
    if (savedData?.gameTime) {
      this.timeSystem.gameTime = savedData.gameTime;
    }

    // ── Systemy 4X ─────────────────────────────────────────────
    this.resourceSystem  = new ResourceSystem();
    this.techSystem      = new TechSystem(this.resourceSystem);
    this.civSystem       = new CivilizationSystem({}, this.techSystem);
    this.civSystem.resourceSystem = this.resourceSystem;
    this.buildingSystem  = new BuildingSystem(this.resourceSystem, this.civSystem, this.techSystem);
    this.civSystem.buildingSystem = this.buildingSystem;
    this.factorySystem   = new FactorySystem(this.resourceSystem);
    this.buildingSystem.setFactorySystem(this.factorySystem);
    this.expeditionSystem = new MissionSystem(this.resourceSystem);
    this.missionSystem    = this.expeditionSystem; // alias — ten sam obiekt
    this.colonyManager   = new ColonyManager(this.techSystem);
    this.vesselManager   = new VesselManager();
    this.tradeRouteManager = new TradeRouteManager();
    this.civilianTradeSystem = new CivilianTradeSystem(this.colonyManager);
    this.tradeLog          = new TradeLog();
    this.randomEventSystem = new RandomEventSystem();
    this.impactDamageSystem = new ImpactDamageSystem(this.colonyManager);
    this.researchSystem    = new ResearchSystem(this.techSystem);
    this.discoverySystem   = new DiscoverySystem();
    this.observatorySystem = new ObservatorySystem();
    this.collisionForecast = new CollisionForecast();

    window.KOSMOS.civMode          = false;
    window.KOSMOS.homePlanet       = null;
    window.KOSMOS.buildingSystem   = this.buildingSystem;
    window.KOSMOS.resourceSystem   = this.resourceSystem;
    window.KOSMOS.civSystem        = this.civSystem;
    window.KOSMOS.techSystem       = this.techSystem;
    window.KOSMOS.factorySystem    = this.factorySystem;
    window.KOSMOS.prosperitySystem = null;  // tworzony per-kolonia w ColonyManager
    window.KOSMOS.expeditionSystem = this.expeditionSystem;
    window.KOSMOS.missionSystem    = this.missionSystem;
    window.KOSMOS.colonyManager    = this.colonyManager;
    window.KOSMOS.vesselManager    = this.vesselManager;
    window.KOSMOS.overlayManager   = this.uiManager.overlayManager;
    window.KOSMOS.tradeRouteManager = this.tradeRouteManager;
    window.KOSMOS.civilianTradeSystem = this.civilianTradeSystem;
    window.KOSMOS.tradeLog         = this.tradeLog;
    window.KOSMOS.timeSystem       = this.timeSystem;
    window.KOSMOS.randomEventSystem = this.randomEventSystem;
    window.KOSMOS.researchSystem   = this.researchSystem;
    window.KOSMOS.discoverySystem  = this.discoverySystem;
    window.KOSMOS.observatorySystem = this.observatorySystem;
    window.KOSMOS.collisionForecast = this.collisionForecast;
    window.KOSMOS.threeRenderer    = this.threeRenderer;

    // ── Dane galaktyczne (okoliczne układy gwiezdne) ──────────
    window.KOSMOS.galaxyData = savedData?.civ4x?.galaxyData
      ?? GalaxyGenerator.generate(star.id, star.name, star.spectralType);

    // ── Przywrócenie stanu 4X ──────────────────────────────────
    const c4x = savedData?.civ4x;
    if (c4x?.civMode) {
      window.KOSMOS.civMode = true;

      // Po migracji SaveMigration: save zawsze ma colonies[] (v5+)
      // Przywróć tech (globalne)
      if (c4x.techs) this.techSystem.restore(c4x.techs);
      if (c4x.researchSystem) this.researchSystem.restore(c4x.researchSystem);
      // Przywróć kolonie przez ColonyManager (tworzy per-kolonia ResourceSystem, CivSystem, BuildingSystem)
      if (c4x.colonies?.length > 0) {
        this.colonyManager.restore(c4x, this.buildingSystem);
      }
      // Ustaw homePlanet i aktywne systemy
      const homePlanetId = c4x.homePlanetId ?? c4x.colonies?.find(c => c.isHomePlanet)?.planetId;
      if (homePlanetId) {
        setTimeout(() => {
          const hp = this.colonyManager._findEntity(homePlanetId);
          if (hp) {
            window.KOSMOS.homePlanet = hp;
            hp.explored = true;
          }
          // Przywróć aktywne systemy z homePlanet (per-kolonia instancje)
          const homeCol = this.colonyManager.getColony(homePlanetId);
          if (homeCol) {
            window.KOSMOS.resourceSystem  = homeCol.resourceSystem;
            window.KOSMOS.civSystem       = homeCol.civSystem;
            window.KOSMOS.buildingSystem  = homeCol.buildingSystem;
            if (homeCol.factorySystem) {
              window.KOSMOS.factorySystem = homeCol.factorySystem;
              this.factorySystem = homeCol.factorySystem;
            }
            if (homeCol.prosperitySystem) {
              window.KOSMOS.prosperitySystem = homeCol.prosperitySystem;
            }
            this.resourceSystem  = homeCol.resourceSystem;
            this.civSystem       = homeCol.civSystem;
            this.buildingSystem  = homeCol.buildingSystem;
            this.expeditionSystem.resourceSystem = homeCol.resourceSystem;
            this.techSystem.resourceSystem      = homeCol.resourceSystem;
            const gridSizes = { rocky: 10, hot_rocky: 6, ice: 6, gas: 6 };
            this.buildingSystem._gridHeight = gridSizes[hp?.planetType] ?? 10;
            if (hp?.deposits) this.buildingSystem.setDeposits(hp.deposits);
          }
          // Po swapie KOSMOS: wymuś ponowną rejestrację konsumpcji POP
          // (przy restore() guard EventBus blokował emit bo KOSMOS wskazywał na stary ResourceSystem)
          for (const col of this.colonyManager.getAllColonies()) {
            col.civSystem._registeredPop = -1;
            col.civSystem.forceConsumptionSync(col.resourceSystem);
          }
        }, 0);
      }
      if (c4x.missions || c4x.expeditions) this.expeditionSystem.restore(c4x.missions ?? c4x.expeditions);
      // Przywróć VesselManager
      if (c4x.vesselManager) {
        this.vesselManager.restore(c4x.vesselManager);
      }
      // Przywróć DiscoverySystem
      if (c4x.discoverySystem) {
        this.discoverySystem.restore(c4x.discoverySystem);
      }
      // Przywróć RandomEventSystem
      if (c4x.randomEventSystem) {
        this.randomEventSystem.restore(c4x.randomEventSystem);
      }
      // Przywróć ObservatorySystem
      if (c4x.observatorySystem) {
        this.observatorySystem.restore(c4x.observatorySystem);
      }
      // Przywróć CollisionForecast
      if (c4x.collisionForecast) {
        this.collisionForecast.restore(c4x.collisionForecast);
      }
      // Walidacja misji — teraz VesselManager jest przywrócony, można sprawdzić statki
      this.expeditionSystem.validateMissions();
      // Przywróć TradeRouteManager
      if (c4x.tradeRouteManager) {
        this.tradeRouteManager.restore(c4x.tradeRouteManager);
      }
      // Przywróć TradeLog
      if (c4x.tradeLog) {
        this.tradeLog.restore(c4x.tradeLog);
      }
      // Migracja starych save: fleet[] ze stringami → vessel instances
      this._migrateStringFleets();
      // Kick tras handlowych — po restore nie ma vessel:docked, trzeba ręcznie
      this.tradeRouteManager.kickAfterRestore();
      if (c4x.civ?.unrestActive) {
        this.buildingSystem._civPenalty = 0.7;
        this.buildingSystem._reapplyAllRates();
      }
      // Przywróć StarSystemManager (wieloukładowy save)
      if (c4x.starSystemManager) {
        this.starSystemManager.restore(c4x.starSystemManager);
      }
    }

    // ── PlanetScene (mapa hex) ─────────────────────────────────
    const planetCanvas = document.getElementById('planet-canvas');
    this.planetScene   = new PlanetScene(planetCanvas, this.timeSystem);

    // ── Nawigacja do kolonii → ColonyOverlay ─────────────────────
    EventBus.on('planet:colonize', ({ planet }) => {
      this._setupColony(planet);
      this.colonyManager.switchActiveColony(planet.id);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    EventBus.on('planet:openMap', ({ planet }) => {
      this.colonyManager.switchActiveColony(planet.id);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    EventBus.on('planet:openGlobe', ({ planet }) => {
      this.colonyManager.switchActiveColony(planet.id);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    EventBus.on('colony:founded', ({ colony }) => {
      this.colonyManager.switchActiveColony(colony.planetId);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    EventBus.on('outpost:founded', ({ colony }) => {
      this.colonyManager.switchActiveColony(colony.planetId);
      this.uiManager?.overlayManager?.openPanel('colony');
    });

    // Kolizja — akrecja nowej planety z ThreeRenderer (EventBus obsługuje wewnątrz)
    EventBus.on('accretion:newPlanet', (planet) => {
      // ThreeRenderer subskrybuje 'accretion:newPlanet' samodzielnie
    });

    // Powiadomienia o zdarzeniach losowych
    EventBus.on('randomEvent:occurred', ({ event, colonyName }) => {
      showEventNotification(event, colonyName);
    });
    // Prognoza kolizji — alert z obserwatorium (isHomePlanet = dowolna kolonia gracza)
    EventBus.on('observatory:collisionAlert', ({ bodyA, bodyB, yearsUntil, margin, isHomePlanet }) => {
      if (isHomePlanet) {
        // Kolizja z planetą kolonii gracza — pauza + duży alert
        this.timeSystem?.pause();
        const nameA = bodyA.name ?? '?';
        const nameB = bodyB.name ?? '?';
        this.uiManager?.addInfo(`🔭 ${t('log.collisionForecastHome', nameA, nameB, Math.round(yearsUntil), margin)}`);
      }
    });

    // Ostrzeżenie obserwatorium — zbliżające się zdarzenie
    EventBus.on('randomEvent:warning', ({ event, colonyName, yearsUntil }) => {
      const name = t(`event.${event.id}.name`) !== `event.${event.id}.name`
        ? t(`event.${event.id}.name`) : (event.namePL ?? event.id);
      this.uiManager?.addInfo(`🔭 ${t('log.observatoryWarning', event.icon ?? '⚠', name, colonyName, yearsUntil)}`);
    });
    // Zdarzenie zablokowane przez obronę
    EventBus.on('randomEvent:blocked', ({ event, colonyName }) => {
      const name = t(`event.${event.id}.name`) !== `event.${event.id}.name`
        ? t(`event.${event.id}.name`) : (event.namePL ?? event.id);
      this.uiManager?.addInfo(`🛡 ${name} — ${t('eventChoice.blocked')} [${colonyName}]`);
    });

    // Powiadomienia o uderzeniach kosmicznych (pauzuj grę przy poważnych)
    EventBus.on('impact:colonyDamage', (data) => {
      if (data.severity === 'heavy' || data.severity === 'extinction') {
        EventBus.emit('time:pause');
      }
      showImpactNotification(data);
    });

    // Ruchy spoleczne — modal z wyborem gracza
    EventBus.on('civ:movementStarted', async (data) => {
      EventBus.emit('time:pause');
      const resolutionId = await showMovementModal(data);
      EventBus.emit('civ:resolveMovement', { movementType: data.movementId, resolutionId });
      EventBus.emit('time:resume');
    });

    // Milestones historii kolonii — log + opcjonalnie pauza
    EventBus.on('civ:milestoneReached', ({ colonyName, milestone, crisis }) => {
      const lang = window.KOSMOS?.lang ?? 'pl';
      const name = lang === 'en' ? milestone.nameEN : milestone.namePL;
      const icon = milestone.icon ?? '●';
      this.uiManager?.addInfo(`${icon} ${colonyName}: ${name}`);
      if (crisis) {
        EventBus.emit('time:pause');
      }
    });

    // Cechy kulturowe — log
    EventBus.on('civ:traitUnlocked', ({ colonyName, trait }) => {
      const lang = window.KOSMOS?.lang ?? 'pl';
      const name = lang === 'en' ? trait.nameEN : trait.namePL;
      this.uiManager?.addInfo(`${trait.icon} ${colonyName}: ${t('eventLog.traitUnlocked') || 'Nowa cecha'} — ${name}`);
    });

    // Flaga przetrwania katastrofy — z RandomEventSystem do CivilizationSystem
    EventBus.on('randomEvent:occurred', ({ event }) => {
      if (event?.severity === 'catastrophe' || event?.severity === 'heavy') {
        const civ = window.KOSMOS?.civSystem;
        if (civ?._milestoneState) {
          civ._milestoneState.justSurvivedDisaster = true;
        }
      }
    });

    // Popupy misji (pauza + powiadomienie)
    initMissionEvents();

    // Popup: kolonia/placówka utracona (zniszczenie ciała niebieskiego)
    EventBus.on('colony:destroyed', ({ planetId, colonyName, reason, isOutpost, population, destroyedVesselIds }) => {
      // Zamknij ColonyOverlay (removeColony przełączyła aktywną kolonię, ale overlay jest stale)
      if (this.uiManager?.overlayManager?.isAnyOpen()) {
        this.uiManager.overlayManager.closeActive();
      }

      const reasonPL = reason === 'collision' ? t('log.planetaryCollision')
        : reason === 'ejected' ? t('log.ejectedFromSystem')
        : t('log.bodyDestroyed');

      const typeLabel = isOutpost ? t('colony.outpost') : t('colony.colony');
      const vesselCount = destroyedVesselIds?.length ?? 0;

      let stats = '';
      stats += formatStatLine(typeLabel.toUpperCase(), colonyName, 'at-stat-neg');
      stats += formatStatLine(t('colony.reason'), reasonPL, 'at-stat-neg');
      if (population > 0) {
        stats += formatStatLine('POPULACJA', `−${population} POP`, 'at-stat-neg');
      }
      if (vesselCount > 0) {
        stats += formatStatLine('STATKI', `−${vesselCount} utraconych`, 'at-stat-neg');
      }
      stats += formatStatLineWithCursor('STATUS', t('colony.irrecoverablyLost'), 'at-stat-neg');

      queueMissionEvent({
        severity: 'danger',
        barTitle: '⚠ ALARM KRYTYCZNY ⚠',
        svgKey: 'disaster',
        svgLabel: typeLabel.toUpperCase() + '<br>UTRACONA',
        prompt: '> COLONY_LOST.EXE_',
        headline: `${typeLabel.toUpperCase()}<br>UTRACONA`,
        description: `${typeLabel} ${colonyName} została bezpowrotnie utracona.`,
        contentHTML: stats,
      });
    });

    // Keyboard input (DOM)
    this._setupKeyboard();

    // Obsługa input z event layer
    this._setupMouseInput(eventLayer);

    // Nowa gra
    EventBus.on('game:new', () => { SaveSystem.clearSave(); window.location.reload(); });

    // ── Przełączenie układu — aktywuj pierwszą kolonię w nowym układzie ──
    EventBus.on('system:switched', ({ systemId, star }) => {
      const colMgr = window.KOSMOS?.colonyManager;
      if (!colMgr) return;
      const cols = colMgr.getAllColonies().filter(c => {
        const body = EntityManager.get(c.planetId);
        return body?.systemId === systemId;
      });
      if (cols.length > 0) {
        colMgr.switchActiveColony(cols[0].planetId);
      } else {
        // Brak kolonii w tym układzie — wyzeruj dane zasobów w UI
        EventBus.emit('resource:changed', {
          resources: { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 },
          deltaPerYear: { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 },
          inventory: {},
          invPerYear: {},
          energyFlow: { production: 0, consumption: 0, net: 0 },
        });
      }
    });

    // ── Game Over — planeta gracza zniszczona ──────────────────
    this._gameOver = false;
    const checkHomeDestroyed = (planet, reason) => {
      if (this._gameOver) return;
      if (!window.KOSMOS?.civMode || !window.KOSMOS?.homePlanet) return;
      if (planet?.id !== window.KOSMOS.homePlanet.id) return;
      this._gameOver = true;
      // Pauzuj grę
      EventBus.emit('time:pause');
      // Zamknij mapę planety / overlay jeśli otwarte
      this.uiManager?.overlayManager?.closeActive();
      if (this.planetScene?.isOpen) this.planetScene.close();
      // Wyłącz tryb 4X
      window.KOSMOS.civMode = false;
      // Emituj event game over — UIManager pokaże ekran końca gry
      EventBus.emit('game:over', { reason, planetName: planet.name });
    };

    // Safety net: entity:removed odpala się PRZED body:collision (bo EntityManager.remove() jest wywołany wcześniej)
    EventBus.on('entity:removed', ({ entity }) => {
      if (entity?.id === window.KOSMOS?.homePlanet?.id) {
        checkHomeDestroyed(entity, 'collision');
      }
    });

    // Kolizja planetarna — oba ciała tracą życie
    EventBus.on('body:collision', ({ winner, loser }) => {
      [winner, loser].forEach(p => {
        if (p?.id === window.KOSMOS?.homePlanet?.id) {
          checkHomeDestroyed(p, 'collision');
        }
      });
    });
    // Życie wymarło (np. warunki klimatyczne, kolizja)
    EventBus.on('life:extinct', ({ planet, reason }) => {
      checkHomeDestroyed(planet, reason ?? 'extinction');
    });
    // Planeta wyrzucona z układu (ejekcja orbitalna)
    EventBus.on('planet:ejected', ({ planet }) => {
      checkHomeDestroyed(planet, 'ejected');
    });

    // Populacja macierzystej planety spadła do 0 (katastrofa ekspedycji, głód, ekspozycja, zdarzenie losowe)
    EventBus.on('civ:popDied', ({ cause, population }) => {
      if (this._gameOver) return;
      if (!window.KOSMOS?.civMode || !window.KOSMOS?.homePlanet) return;
      // Sprawdź populację kolonii macierzystej (nie aktywnej kolonii — ta może być inna)
      const homePlanetId = window.KOSMOS.homePlanet.id;
      const colMgr = window.KOSMOS.colonyManager;
      const homeColony = colMgr?.getColony(homePlanetId);
      if (!homeColony) return;
      const homePop = homeColony.civSystem?.population ?? 0;
      if (homePop <= 0) {
        checkHomeDestroyed(window.KOSMOS.homePlanet, cause ?? 'population_extinct');
      }
    });

    // Focus kamery na encji (z Outlinera — klik na ekspedycję)
    EventBus.on('camera:focusTarget', ({ targetId }) => {
      if (!targetId) return;
      const entity = EntityManager.get(targetId);
      if (entity) {
        EventBus.emit('body:selected', { entity });
      }
    });

    // ── Auto-kolonizacja w scenariuszu Cywilizacja / Power Test ───────────
    // Nowa gra: intro (transmisja rządowa → nazwy) → kolonizacja → globus
    if (!savedData && this._civPlanetId) {
      const isPowerTest = window.KOSMOS?.scenario === 'power_test';
      const isBoosted   = window.KOSMOS?.scenario === 'civilization_boosted';

      setTimeout(async () => {
        const civPlanet = EntityManager.get(this._civPlanetId);
        if (!civPlanet) return;

        // Pauzuj grę na czas intro
        EventBus.emit('time:pause');

        // Focus kamery na planecie macierzystej + bliski zoom
        EventBus.emit('body:selected', { entity: civPlanet });
        this.cameraController._targetDist = 8;

        // POWER TEST — pomijamy intro, domyślne nazwy
        if (isPowerTest) {
          // Kolonizuj planetę
          this._setupColony(civPlanet);
          // Ogromne zasoby startowe
          this._setupPowerTestResources();
          // Zbadaj WSZYSTKIE technologie
          this._setupPowerTestTechs();
          // Populacja 100 POP (wystarczająca na wszystkie budynki)
          this.civSystem.setPopulation(100);
          // Domyślne nazwy
          window.KOSMOS.civName = 'Test Empire';
          civPlanet.name = 'Test Capital';
          const colony = this.colonyManager.getColony(civPlanet.id);
          if (colony) colony.name = 'Test Capital';
          // Flota startowa: 1× science_vessel, 1× cargo_ship
          this._spawnPowerTestFleet(civPlanet.id);
          // Generuj grid i auto-buduj
          const grid = PlanetMapGenerator.generate(civPlanet, true);
          // Ustaw gridHeight w BuildingSystem (potrzebne do modyfikatora polarnego)
          if (this.buildingSystem) this.buildingSystem._gridHeight = grid.height;
          this._autoBuildPowerTest(grid);
          // Otwórz ColonyOverlay (stolica auto-place w _openGlobe)
          this.colonyManager.switchActiveColony(civPlanet.id);
          this.uiManager?.overlayManager?.openPanel('colony');
          return;
        }

        // BOOSTED — scenariusz "Nowa Gra 2": intro → boosted budynki + 3 POP + tech
        if (isBoosted) {
          await new Promise(r => setTimeout(r, 1200));
          const { civName, capitalName } = await showIntroSequence();
          this._setupColony(civPlanet);
          window.KOSMOS.civName = civName;
          civPlanet.name = capitalName;
          const colony = this.colonyManager.getColony(civPlanet.id);
          if (colony) colony.name = capitalName;
          // Zbadaj technologie wymagane dla dodatkowych budynków
          this._setupBoostedTechs();
          // 4 POPy (3 zużyte przez budynki + 1 zapas na wzrost)
          this.civSystem.setPopulation(4);
          // Generuj grid i postaw budynki (standardowe + boosted)
          const grid = PlanetMapGenerator.generate(civPlanet, true);
          if (this.buildingSystem) this.buildingSystem._gridHeight = grid.height;
          this._autoPlaceBoostedBuildings(grid);
          this.colonyManager.switchActiveColony(civPlanet.id);
          this.uiManager?.overlayManager?.openPanel('colony');
          return;
        }

        // Czekaj na animację kamery (lerp do planety)
        await new Promise(r => setTimeout(r, 1200));

        // Sekwencja intro: transmisja rządowa → nazwa cywilizacji → nazwa stolicy
        const { civName, capitalName } = await showIntroSequence();

        // Kolonizuj planetę (bez otwierania globusa)
        this._setupColony(civPlanet);

        // Zapisz nazwy
        window.KOSMOS.civName = civName;
        civPlanet.name = capitalName;
        const colony = this.colonyManager.getColony(civPlanet.id);
        if (colony) colony.name = capitalName;

        // Generuj grid i postaw budynki startowe
        const grid = PlanetMapGenerator.generate(civPlanet, true);
        if (this.buildingSystem) this.buildingSystem._gridHeight = grid.height;
        this._autoPlaceStarterBuildings(grid);
        // Otwórz ColonyOverlay (stolica auto-place w _openGlobe)
        this.colonyManager.switchActiveColony(civPlanet.id);
        this.uiManager?.overlayManager?.openPanel('colony');
      }, 100);
    }
    // Przywrócenie civName z save
    if (savedData?.civ4x?.civName) {
      window.KOSMOS.civName = savedData.civ4x.civName;
    }

    // ── Muzyka tła ─────────────────────────────────────────────
    // Ładuj i startuj muzykę (autoplay po kliknięciu użytkownika w TitleScene)
    this.audioSystem.startMusic('game');

    // ── Pętla gry ─────────────────────────────────────────────
    // TimeSystem.update(deltaMs) emituje 'time:tick' → wszystkie systemy
    let lastTime = performance.now();
    const gameLoop = (now) => {
      const deltaMs = now - lastTime;
      lastTime = now;
      this.timeSystem.update(deltaMs);
      requestAnimationFrame(gameLoop);
    };
    requestAnimationFrame(gameLoop);
  }

  // ── Konfiguracja kolonii (wyciągnięte z planet:colonize) ───────
  _setupColony(planet) {
    window.KOSMOS.civMode    = true;
    window.KOSMOS.homePlanet = planet;
    planet.explored = true;
    // Podłącz referencję planety do CivSystem (potrzebne do sprawdzania atmosfery)
    this.civSystem.planet = planet;
    // Księżyce planety domowej — wymagają rozpoznania statkiem naukowym
    // Startowe zasoby (surowce + commodities T1/T2)
    this.resourceSystem.receive({
      Fe: 200, C: 150, Si: 100, Cu: 50, Ti: 20, Li: 10, Hv: 4,
      food: 100, water: 100, research: 100,
      structural_alloys: 15, polymer_composites: 10, conductor_bundles: 8,
      power_cells: 12, electronic_systems: 6, extraction_systems: 5,
      pressure_modules: 4, reactive_armor: 4, compact_bioreactor: 3,
      automation_droid: 0, semiconductor_arrays: 2, propulsion_systems: 0,
      plasma_cores: 0, metamaterials: 0, quantum_processors: 0, warp_cores: 0,
    });
    // Zarejestruj jako pierwszą kolonię w ColonyManager (z per-kolonia BuildingSystem)
    this.buildingSystem.setDeposits(planet.deposits ?? []);
    this.colonyManager.registerHomePlanet(planet, this.resourceSystem, this.civSystem, this.buildingSystem);
  }

  // ── Migracja starych save: fleet[] ze stringami → vessel instances ──
  _migrateStringFleets() {
    const colMgr = this.colonyManager;
    const vMgr = this.vesselManager;
    if (!colMgr || !vMgr) return;

    for (const colony of colMgr.getAllColonies()) {
      if (!colony.fleet || colony.fleet.length === 0) continue;
      // Sprawdź czy fleet zawiera stare stringi (typy statków)
      const hasStrings = colony.fleet.some(f => typeof f === 'string' && !f.startsWith('v_'));
      if (hasStrings) {
        colony.fleet = vMgr.migrateStringFleet(colony.fleet, colony.planetId);
      }
    }
  }

  // ── POWER TEST — metody pomocnicze ─────────────────────────────

  // POWER TEST — ogromne zasoby startowe
  _setupPowerTestResources() {
    this.resourceSystem.receive({
      Fe: 99999, C: 99999, Si: 99999, Cu: 99999, Ti: 99999, Li: 99999,
      Hv: 99999, Xe: 99999, Nt: 99999,
      food: 99999, water: 99999, research: 10000,
      structural_alloys: 9999, polymer_composites: 9999, conductor_bundles: 9999,
      power_cells: 9999, electronic_systems: 9999, extraction_systems: 9999,
      pressure_modules: 9999, reactive_armor: 9999, compact_bioreactor: 9999,
      automation_droid: 9999, semiconductor_arrays: 9999, propulsion_systems: 9999,
      plasma_cores: 9999, metamaterials: 9999,
      android_worker: 9999, quantum_processors: 9999, warp_cores: 9999,
      basic_supplies: 9999, civilian_goods: 9999, neurostimulants: 9999,
    });
  }

  // POWER TEST — zbadaj wszystkie technologie
  _setupPowerTestTechs() {
    const allTechIds = Object.keys(TECHS);
    this.techSystem.restore({ researched: allTechIds });
  }

  // POWER TEST — flota startowa (1× science_vessel, 1× cargo_ship, 1× heavy_freighter)
  _spawnPowerTestFleet(planetId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const colony = this.colonyManager.getColony(planetId);
    if (!vMgr || !colony) return;
    for (const shipId of [
      'science_vessel', 'cargo_ship',
    ]) {
      const vessel = vMgr.createAndRegister(shipId, planetId);
      colony.fleet.push(vessel.id);
    }
  }

  // POWER TEST — auto-budowa budynków (grid przekazany jako parametr)
  _autoBuildPowerTest(grid) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!grid || !bSys) return;

    // Zbierz wolne, budowlane tile'y (nie ocean, nie damaged, nie zajęte)
    const allTiles = grid.toArray();
    const freeTiles = allTiles.filter(t => {
      const terrain = TERRAIN_TYPES[t.type];
      return terrain?.buildable && !t.isOccupied && !t.damaged;
    });

    // Priorytet: plains → desert → mountains → tundra → crater → reszta
    const terrainPriority = ['plains', 'desert', 'mountains', 'tundra', 'crater', 'forest', 'ice_sheet', 'wasteland', 'volcano'];
    freeTiles.sort((a, b) => {
      const ai = terrainPriority.indexOf(a.type);
      const bi = terrainPriority.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Lista budynków do postawienia — WSZYSTKIE dostępne typy
    const buildPlan = [
      // Podstawowe (wysoki poziom)
      { id: 'habitat',               level: 10, count: 2 },
      { id: 'solar_farm',            level: 10, count: 2 },
      { id: 'mine',                  level: 10, count: 2 },
      { id: 'farm',                  level: 10, count: 1 },
      { id: 'well',                  level: 10, count: 1 },
      { id: 'factory',               level: 10, count: 2 },
      { id: 'research_station',      level: 10, count: 1 },
      { id: 'launch_pad',            level: 3,  count: 1 },
      { id: 'shipyard',              level: 3,  count: 2 },
      // Energetyka
      { id: 'coal_plant',            level: 3,  count: 1 },
      { id: 'geothermal',            level: 3,  count: 1 },
      { id: 'nuclear_plant',         level: 3,  count: 1 },
      { id: 'fusion_reactor',        level: 3,  count: 1 },
      // Przemysł
      { id: 'smelter',               level: 3,  count: 1 },
      { id: 'antimatter_factory',    level: 1,  count: 1 },
      // Autonomiczne
      { id: 'autonomous_mine',       level: 3,  count: 1 },
      { id: 'autonomous_solar_farm', level: 3,  count: 1 },
      { id: 'autonomous_spaceport',  level: 1,  count: 1 },
      { id: 'synthesized_food_plant',level: 3,  count: 1 },
      // Badawcze
      { id: 'observatory',           level: 1,  count: 1 },
      { id: 'data_center',           level: 1,  count: 1 },
      { id: 'genetics_lab',          level: 1,  count: 1 },
      { id: 'ai_core',               level: 1,  count: 1 },
      // Populacja / mega
      { id: 'arcology_building',     level: 1,  count: 1 },
      { id: 'orbital_habitat',       level: 1,  count: 1 },
      // Kosmiczne
      { id: 'orbital_mine',          level: 1,  count: 1 },
      { id: 'terraformer',           level: 1,  count: 1 },
      { id: 'vacuum_generator',      level: 1,  count: 1 },
      // Obrona
      { id: 'defense_tower',         level: 3,  count: 1 },
      { id: 'defense_grid',          level: 1,  count: 1 },
      // Infrastruktura międzygwiezdna
      { id: 'warp_beacon',           level: 1,  count: 1 },
      { id: 'jump_gate',             level: 1,  count: 1 },
    ];

    const entries = [];  // dane do restoreFromSave
    const usedTiles = new Set();

    for (const plan of buildPlan) {
      const building = BUILDINGS[plan.id];
      if (!building) continue;

      for (let n = 0; n < plan.count; n++) {
        // Znajdź tile pasujący do tego budynku
        const tile = this._findTileForBuilding(freeTiles, building, usedTiles);
        if (!tile) continue;

        usedTiles.add(tile.key);
        tile.buildingId    = plan.id;
        tile.buildingLevel = plan.level;

        // Oblicz baseRates z uwzględnieniem terenu i poziomu
        const baseRates = bSys._calcBaseRates(building, tile, plan.level);

        // Skumulowane housing (per level)
        const housing = (building.housing || 0) * plan.level;

        entries.push({
          tileKey:    tile.key,
          buildingId: plan.id,
          baseRates,
          housing,
          popCost:    building.popCost ?? 0.25,
          level:      plan.level,
        });
      }
    }

    // Przywróć budynki przez restoreFromSave (przelicza housing, employment, factory points)
    if (entries.length > 0) {
      bSys.restoreFromSave(entries);
    }
    // ColonyOverlay odświeży globus automatycznie przy otwarciu
  }

  // POWER TEST — znajdź wolny tile pasujący do budynku
  _findTileForBuilding(freeTiles, building, usedTiles) {
    for (const tile of freeTiles) {
      if (usedTiles.has(tile.key)) continue;
      const terrain = TERRAIN_TYPES[tile.type];
      if (!terrain?.buildable) continue;

      // terrainOnly: tylko określone typy terenu
      if (building.terrainOnly) {
        if (building.terrainOnly.includes(tile.type)) return tile;
        continue;
      }
      // terrainAny: dowolny buildable tile
      if (building.terrainAny) return tile;
      // Standardowe: category musi być w allowedCategories
      if (terrain.allowedCategories.includes(building.category)) return tile;
    }
    return null;
  }

  // ── Auto-budowa startowych budynków (nowa gra, scenariusz Cywilizacja) ──
  // Stawia farm, well, solar_farm na odpowiednich hexach — bez kosztów surowcowych
  _autoPlaceStarterBuildings(grid) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!grid || !bSys) return;

    const allTiles = grid.toArray();
    const freeTiles = allTiles.filter(t => {
      const terrain = TERRAIN_TYPES[t.type];
      return terrain?.buildable && !t.isOccupied && !t.damaged;
    });

    // Sortuj: tereny z bonusami najpierw
    const terrainPriority = ['plains', 'desert', 'ice_sheet', 'forest', 'mountains', 'tundra', 'crater', 'wasteland', 'volcano'];
    freeTiles.sort((a, b) => {
      const ai = terrainPriority.indexOf(a.type);
      const bi = terrainPriority.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Farm na hex ze stolicą (wirtualna — hex wolny), well i solar_farm na osobnych hexach
    const buildPlan = [
      { id: 'farm',       level: 1, count: 1 },
      { id: 'well',       level: 1, count: 1 },
      { id: 'solar_farm', level: 1, count: 1 },
    ];

    const entries = [];
    const usedTiles = new Set();

    // Stolica jest wirtualna (capitalBase=true, ale hex wolny) — farm na niej
    const capitalTile = allTiles.find(t => t.capitalBase === true);

    for (const plan of buildPlan) {
      const building = BUILDINGS[plan.id];
      if (!building) continue;

      let tile;
      // Farm → na hex ze stolicą (najlepsza lokalizacja, plains z bonusem food)
      if (plan.id === 'farm' && capitalTile && !usedTiles.has(capitalTile.key)) {
        tile = capitalTile;
      } else {
        tile = this._findTileForBuilding(freeTiles, building, usedTiles);
      }
      if (!tile) continue;

      usedTiles.add(tile.key);
      tile.buildingId    = plan.id;
      tile.buildingLevel = plan.level;

      const baseRates = bSys._calcBaseRates(building, tile, plan.level);
      const housing   = (building.housing || 0) * plan.level;

      entries.push({
        tileKey:    tile.key,
        buildingId: plan.id,
        baseRates,
        housing,
        popCost:    building.popCost ?? 0.25,
        level:      plan.level,
      });
    }

    if (entries.length > 0) {
      bSys.restoreFromSave(entries);
    }

    // ColonyOverlay odświeży globus automatycznie przy otwarciu
  }

  // ── Auto-budowa startowych budynków — scenariusz "Nowa Gra 2" (boosted) ──
  // Standardowe 3 + habitat Lv1, launch_pad Lv1, shipyard Lv1, solar_farm Lv3
  _autoPlaceBoostedBuildings(grid) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!grid || !bSys) return;

    const allTiles = grid.toArray();
    const freeTiles = allTiles.filter(t => {
      const terrain = TERRAIN_TYPES[t.type];
      return terrain?.buildable && !t.isOccupied && !t.damaged;
    });

    const terrainPriority = ['plains', 'desert', 'ice_sheet', 'forest', 'mountains', 'tundra', 'crater', 'wasteland', 'volcano'];
    freeTiles.sort((a, b) => {
      const ai = terrainPriority.indexOf(a.type);
      const bi = terrainPriority.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Standardowe + dodatkowe budynki dla boosted
    const buildPlan = [
      { id: 'farm',          level: 1, count: 1 },
      { id: 'well',          level: 1, count: 1 },
      { id: 'solar_farm',    level: 1, count: 1 },
      { id: 'habitat',       level: 1, count: 1 },
      { id: 'launch_pad',    level: 1, count: 1 },
      { id: 'shipyard',      level: 1, count: 1 },
      { id: 'solar_farm',    level: 3, count: 1 },
    ];

    const entries = [];
    const usedTiles = new Set();

    // Stolica jest wirtualna (capitalBase=true, hex wolny) — farm na niej
    const capitalTile = allTiles.find(t => t.capitalBase === true);

    for (const plan of buildPlan) {
      // Tymczasowo usuwamy requires z definicji — w boosted wszystkie budynki dostępne od startu
      const building = { ...BUILDINGS[plan.id] };
      if (!building.id) continue;
      delete building.requires; // odblokuj budynek bez tech

      for (let n = 0; n < plan.count; n++) {
        let tile;
        if (plan.id === 'farm' && n === 0 && capitalTile && !usedTiles.has(capitalTile.key)) {
          tile = capitalTile;
        } else {
          tile = this._findTileForBuilding(freeTiles, building, usedTiles);
        }
        if (!tile) continue;

        usedTiles.add(tile.key);
        tile.buildingId    = plan.id;
        tile.buildingLevel = plan.level;

        const baseRates = bSys._calcBaseRates(building, tile, plan.level);
        const housing   = (building.housing || 0) * plan.level;

        entries.push({
          tileKey:    tile.key,
          buildingId: plan.id,
          baseRates,
          housing,
          popCost:    building.popCost ?? 0.25,
          level:      plan.level,
        });
      }
    }

    if (entries.length > 0) {
      bSys.restoreFromSave(entries);
    }
  }

  // ── Zbadaj technologie wymagane dla budynków boosted ──────────
  _setupBoostedTechs() {
    // Tech wymagane: orbital_survey → rocketry (launch_pad), exploration (shipyard)
    // Odblokowane od startu — gracz nie musi ich badać
    // Nuclear power NIE odblokowany — gracz musi sam zbadać
    const techIds = ['orbital_survey', 'rocketry', 'exploration', 'basic_computing', 'automation'];
    this.techSystem.restore({ researched: techIds });
  }

  // ── Generowanie / przywracanie układu ─────────────────────────

  _generateFreshSystem(cx, cy) {
    const generator = new SystemGenerator();

    // POWER TEST — scenariusz testowy z dużym układem
    const isPowerTest = window.KOSMOS?.scenario === 'power_test';
    const isBoosted   = window.KOSMOS?.scenario === 'civilization_boosted';
    const result = isPowerTest
      ? generator.generatePowerTestScenario()
      : generator.generateCivScenario();

    // Zachowaj id planety z cywilizacją do auto-kolonizacji
    this._civPlanetId = result.civPlanetId;
    // Gwiazda zawsze w centrum układu współrzędnych Three.js (0, 0)
    result.star.x = 0;
    result.star.y = 0;
    return result;
  }

  _restoreSystem(data, cx, cy) {
    const star = new Star({
      id:           data.star.id,
      name:         data.star.name,
      spectralType: data.star.spectralType,
      mass:         data.star.mass,
      luminosity:   data.star.luminosity,
    });
    // Gwiazda zawsze w centrum Three.js (0, 0)
    star.x = 0;
    star.y = 0;
    star.systemId = data.star.systemId ?? 'sys_home';
    EntityManager.add(star);

    // Przywróć dodatkowe gwiazdy (inne układy, Etap 40)
    if (data.stars?.length > 0) {
      for (const sd of data.stars) {
        const otherStar = new Star({
          id: sd.id, name: sd.name, spectralType: sd.spectralType,
          mass: sd.mass, luminosity: sd.luminosity,
        });
        otherStar.x = 0;
        otherStar.y = 0;
        otherStar.systemId = sd.systemId ?? 'sys_home';
        EntityManager.add(otherStar);
      }
    }

    const planets = data.planets.map(pd => {
      const p = new Planet({
        id:                pd.id,
        name:              pd.name,
        planetType:        pd.planetType,
        a:                 pd.a,
        e:                 pd.e,
        T:                 pd.T,
        M:                 pd.M,
        inclinationOffset: pd.inclinationOffset,
        mass:              pd.mass,
        visualRadius:      pd.visualRadius,
        albedo:            pd.albedo,
        atmosphere:        pd.atmosphere,
        color:             pd.color,
        glowColor:         pd.glowColor,
        temperatureK:      pd.temperatureK,
        temperatureC:      pd.temperatureC,
        surfaceRadius:     pd.surfaceRadius,
        surfaceGravity:    pd.surfaceGravity,
        composition:       pd.composition,
      });
      p.lifeScore        = pd.lifeScore        || 0;
      p.orbitalStability = pd.orbitalStability || 1.0;
      p.age              = pd.age              || 0;
      p.surface          = { ...(pd.surface || {}) };
      p.explored         = pd.explored         || false;
      p.systemId         = pd.systemId         ?? 'sys_home';
      // Przywróć złoża z save (v6)
      if (pd.deposits?.length > 0) {
        p.deposits = pd.deposits.map(d => ({ ...d }));
      }
      EntityManager.add(p);
      return p;
    });

    // Przywróć księżyce
    const moons = (data.moons || []).map(md => {
      const m = new Moon({
        id:                md.id,
        name:              md.name,
        a:                 md.a,
        e:                 md.e,
        // Migracja save'ów: stare T z KeplerMath (>0.5 lat) zastąp krótkim wizualnym
        T:                 (md.T > 0.5) ? 0.014 + Math.random() * 0.06 : md.T,
        M:                 md.M,
        inclinationOffset: md.inclinationOffset,
        mass:              md.mass,
        visualRadius:      md.visualRadius,
        color:             md.color,
        parentPlanetId:    md.parentPlanetId,
        moonType:          md.moonType || 'rocky',
        composition:       md.composition || null,
        temperatureK:      md.temperatureK || null,
        temperatureC:      md.temperatureC ?? null,
        surfaceRadius:     md.surfaceRadius ?? null,
        surfaceGravity:    md.surfaceGravity ?? null,
        atmosphere:        md.atmosphere || 'none',
      });
      m.age      = md.age      || 0;
      m.explored = md.explored || false;
      m.systemId = md.systemId ?? 'sys_home';
      // Przywróć złoża z save (v6)
      if (md.deposits?.length > 0) {
        m.deposits = md.deposits.map(d => ({ ...d }));
      }
      EntityManager.add(m);
      return m;
    });

    // Przywróć planetoidy
    const planetoids = (data.planetoids || []).map(pd => {
      const p = new Planetoid({
        id:                pd.id,
        name:              pd.name,
        planetoidType:     pd.planetoidType || 'silicate',
        a:                 pd.a,
        e:                 pd.e,
        T:                 pd.T,
        M:                 pd.M,
        inclinationOffset: pd.inclinationOffset,
        mass:              pd.mass,
        visualRadius:      pd.visualRadius,
        color:             pd.color,
        temperatureK:      pd.temperatureK,
        temperatureC:      pd.temperatureC,
        surfaceRadius:     pd.surfaceRadius,
        surfaceGravity:    pd.surfaceGravity,
        composition:       pd.composition,
      });
      p.explored = pd.explored || false;
      p.systemId = pd.systemId ?? 'sys_home';
      // Przywróć złoża z save
      if (pd.deposits?.length > 0) {
        p.deposits = pd.deposits.map(d => ({ ...d }));
      }
      EntityManager.add(p);
      return p;
    });

    // Wygeneruj brakujące złoża (migracja ze starszych save'ów)
    const depSys = new DepositSystem();
    depSys.resetNeutroniumCount();
    for (const p of planets) {
      if (!p.deposits || p.deposits.length === 0) depSys.generateDeposits(p);
    }
    for (const m of moons) {
      if (!m.deposits || m.deposits.length === 0) depSys.generateDeposits(m);
    }
    for (const p of planetoids) {
      if (!p.deposits || p.deposits.length === 0) depSys.generateDeposits(p);
    }

    const maxId = [data.star, ...data.planets, ...(data.moons || []), ...(data.planetoids || [])]
      .map(e => { const m = String(e.id).match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
      .reduce((a, b) => Math.max(a, b), 0);
    EntityManager._nextId = maxId + 1;

    window.KOSMOS.savedData = null;

    // Napraw systemId encji na podstawie StarSystemManager (obejście: registerHomeSystem nadpisuje)
    const ssmData = data.civ4x?.starSystemManager;
    if (ssmData?.systems) {
      const idToSys = new Map();
      for (const sys of ssmData.systems) {
        if (!sys.systemId || sys.systemId === 'sys_home') continue;
        for (const pid of (sys.planetIds || []))    idToSys.set(pid, sys.systemId);
        for (const mid of (sys.moonIds || []))      idToSys.set(mid, sys.systemId);
        for (const pid of (sys.planetoidIds || [])) idToSys.set(pid, sys.systemId);
      }
      for (const p of planets)    { const s = idToSys.get(p.id); if (s) p.systemId = s; }
      for (const m of moons)      { const s = idToSys.get(m.id); if (s) m.systemId = s; }
      for (const p of planetoids) { const s = idToSys.get(p.id); if (s) p.systemId = s; }
    }

    // Zwróć tylko encje home system (registerHomeSystem nadpisuje systemId!)
    const homePlanets    = planets.filter(p => (p.systemId ?? 'sys_home') === 'sys_home');
    const homeMoons      = moons.filter(m => (m.systemId ?? 'sys_home') === 'sys_home');
    const homePlanetoids = planetoids.filter(p => (p.systemId ?? 'sys_home') === 'sys_home');

    return { star, planets: homePlanets, moons: homeMoons, planetesimals: [], asteroids: [], comets: [], planetoids: homePlanetoids };
  }

  // ── Klawiatura ─────────────────────────────────────────────────
  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Deleguj klawisze do aktywnego overlay (np. Escape w buildMode, strzałki)
      if (this.uiManager.overlayManager.isAnyOpen()) {
        const ov = this.uiManager.overlayManager.overlays[this.uiManager.overlayManager.active];
        if (ov?.handleKeyDown && ov.handleKeyDown(e.key)) return;
        // Escape — zamknij aktywny overlay (jeśli overlay nie skonsumował)
        if (e.key === 'Escape') {
          this.uiManager.overlayManager.closeActive();
          return;
        }
      }

      // Escape — zamknij dialog potwierdzenia (jeśli widoczny)
      if (e.key === 'Escape' && this.uiManager._confirmDialog?.visible) {
        this.uiManager._confirmDialog = { visible: false };
        return;
      }

      // Escape — toggle menu (gdy brak overlay)
      if (e.key === 'Escape') {
        if (!this.planetScene?.isOpen) {
          this.uiManager._bottomBar.toggleMenu();
        }
        return;
      }

      // Klawisze overlay (F/P/E/T) — civMode
      if (window.KOSMOS?.civMode) {
        if (this.uiManager.overlayManager.handleKey(e.key)) return;
      }

      const ts = this.timeSystem;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          ts.isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
          break;
        case 'KeyH':
          this.threeRenderer._focusEntityId = null;
          this.cameraController.resetToCenter();
          break;
        case 'Digit1': EventBus.emit('time:setMultiplier', { index: 1 }); EventBus.emit('time:play'); break; // 1d/s
        case 'Digit2': EventBus.emit('time:setMultiplier', { index: 2 }); EventBus.emit('time:play'); break; // 1t/s
        case 'Digit3': EventBus.emit('time:setMultiplier', { index: 3 }); EventBus.emit('time:play'); break; // 1m/s
        case 'Digit4': EventBus.emit('time:setMultiplier', { index: 4 }); EventBus.emit('time:play'); break; // 1r/s
        case 'Digit5': EventBus.emit('time:setMultiplier', { index: 5 }); EventBus.emit('time:play'); break; // 10r/s
        case 'Digit6': EventBus.emit('time:setMultiplier', { index: 6 }); EventBus.emit('time:play'); break; // 10kr/s
        case 'BracketLeft':  EventBus.emit('time:slower'); break;
        case 'BracketRight': EventBus.emit('time:faster'); break;
        case 'KeyQ': if (!window.KOSMOS?.civMode) EventBus.emit('action:stabilize');  break;
        case 'KeyW': if (!window.KOSMOS?.civMode) EventBus.emit('action:nudgeToHz');  break;
        case 'KeyE': if (!window.KOSMOS?.civMode) EventBus.emit('action:bombard');    break;
        case 'F7':
          e.preventDefault();
          this._toggleThemeOverlay();
          break;
      }
    });
  }

  // ── Theme overlay (F7) ───────────────────────────────────────────
  async _toggleThemeOverlay() {
    if (!this._themeOverlay) {
      const { ThemeOverlay } = await import('../ui/ThemeOverlay.js');
      this._themeOverlay = new ThemeOverlay();
    }
    this._themeOverlay.toggle();
  }

  // ── Mysz: rozdziela kliknięcia między UI a Three.js ───────────
  // Nasłuchuje na window (gwarantuje odbiór niezależnie od z-index warstw)
  _setupMouseInput(eventLayer) {
    window.addEventListener('click', (e) => {
      if (this.planetScene?.isOpen) return;
      // Blokuj kliknięcia gdy DOM modal/menu jest na wierzchu
      if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return;
      if (e.target.closest && e.target.closest('.kosmos-menu-panel')) return;
      // Ignoruj drag kamery — ale NIE gdy overlay jest otwarty
      // (overlay blokuje kamerę przez isOverUI, więc _hasMoved jest stałe)
      const wasDrag = this.cameraController.wasDrag;
      this.cameraController._hasMoved = false;
      if (wasDrag && !this.uiManager.overlayManager.isAnyOpen()) return;

      const x = e.clientX;
      const y = e.clientY;

      // Najpierw UI, potem 3D
      if (!this.uiManager.handleClick(x, y)) {
        this.threeRenderer.handleClick(x, y);
      }
    });

    // Dwuklik na planetę/księżyc → otwórz ColonyOverlay
    window.addEventListener('dblclick', (e) => {
      if (this.planetScene?.isOpen) return;
      if (this.uiManager?.overlayManager?.isAnyOpen()) return;

      let entity = this.threeRenderer.getEntityAtScreen(e.clientX, e.clientY);
      if (!entity || (entity.type !== 'planet' && entity.type !== 'moon')) {
        const focusId = this.threeRenderer._focusEntityId;
        if (focusId) entity = EntityManager.get(focusId);
      }
      if (!entity) return;

      // Tryb cywilizacyjny + ciało z kolonią → otwórz ColonyOverlay z animacją
      if (window.KOSMOS?.civMode && this.colonyManager.hasColony(entity.id)) {
        this.colonyManager.switchActiveColony(entity.id);
        const screenPos = this.threeRenderer.getScreenPosition(entity.id);
        this.uiManager.overlayManager.openPanel('colony', {
          originX: screenPos?.x ?? window.innerWidth / 2,
          originY: screenPos?.y ?? window.innerHeight / 2,
        });
        return;
      }

      // Planeta z życiem (lifeScore > 80) → kolonizuj
      if (!window.KOSMOS?.civMode && entity.type === 'planet' && entity.lifeScore > 80) {
        EventBus.emit('planet:colonize', { planet: entity });
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.planetScene?.isOpen) return;
      if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return;
      this.uiManager.handleMouseDown(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', (e) => {
      if (this.planetScene?.isOpen) return;
      if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return;
      this.uiManager.handleMouseUp(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.planetScene?.isOpen) return;

      const x = e.clientX;
      const y = e.clientY;

      this.uiManager.handleMouseMove(x, y);
      this.threeRenderer.handleMouseMove(x, y);
    });
  }
}
