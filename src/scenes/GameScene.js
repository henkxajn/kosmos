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
import { ExpeditionSystem }  from '../systems/ExpeditionSystem.js';
import { ColonyManager }      from '../systems/ColonyManager.js';
import { RandomEventSystem }  from '../systems/RandomEventSystem.js';
import { DiskPhaseSystem }   from '../systems/DiskPhaseSystem.js';
import { showEventNotification } from '../ui/EventChoiceModal.js';
import { SystemGenerator }   from '../generators/SystemGenerator.js';
import { Star }              from '../entities/Star.js';
import { Planet }            from '../entities/Planet.js';
import { Moon }              from '../entities/Moon.js';
import { ThreeRenderer }     from '../renderer/ThreeRenderer.js';
import { ThreeCameraController } from '../renderer/ThreeCameraController.js';
import { UIManager }         from './UIManager.js';
import { PlanetScene }       from './PlanetScene.js';
import { PlanetGlobeScene }    from './PlanetGlobeScene.js';
import { GAME_CONFIG }       from '../config/GameConfig.js';

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
    this.uiManager.addInfo('Układ planetarny uformowany');

    // Blokada kamery gdy kursor nad elementem UI
    this.cameraController._isOverUI = (x, y) => this.uiManager.isOverUI(x, y);

    // ── Pozostałe systemy ──────────────────────────────────────
    this.accretionSystem   = new AccretionSystem({ planetesimals, star });
    this.stabilitySystem   = new StabilitySystem(star);
    this.playerActionSystem = new PlayerActionSystem(star);
    this.lifeSystem        = new LifeSystem(star);
    this.gravitySystem     = new GravitySystem(star);
    this.audioSystem       = new AudioSystem();
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
    this.buildingSystem  = new BuildingSystem(this.resourceSystem, this.civSystem, this.techSystem);
    this.expeditionSystem = new ExpeditionSystem(this.resourceSystem);
    this.colonyManager   = new ColonyManager(this.techSystem);
    this.randomEventSystem = new RandomEventSystem();

    window.KOSMOS.civMode          = false;
    window.KOSMOS.homePlanet       = null;
    window.KOSMOS.buildingSystem   = this.buildingSystem;
    window.KOSMOS.resourceSystem   = this.resourceSystem;
    window.KOSMOS.civSystem        = this.civSystem;
    window.KOSMOS.techSystem       = this.techSystem;
    window.KOSMOS.expeditionSystem = this.expeditionSystem;
    window.KOSMOS.colonyManager    = this.colonyManager;
    window.KOSMOS.timeSystem       = this.timeSystem;
    window.KOSMOS.randomEventSystem = this.randomEventSystem;

    // ── Przywrócenie stanu 4X ──────────────────────────────────
    const c4x = savedData?.civ4x;
    if (c4x?.civMode) {
      window.KOSMOS.civMode = true;

      // Save v5: multi-kolonia (colonies array)
      if (c4x.colonies?.length > 0) {
        // Przywróć tech (globalne)
        if (c4x.techs) this.techSystem.restore(c4x.techs);
        // Przywróć kolonie przez ColonyManager (tworzy per-kolonia ResourceSystem, CivSystem, BuildingSystem)
        this.colonyManager.restore(c4x, this.buildingSystem);
        // Ustaw homePlanet i aktywne systemy
        const homePlanetId = c4x.homePlanetId ?? c4x.colonies.find(c => c.isHomePlanet)?.planetId;
        if (homePlanetId) {
          setTimeout(() => {
            const hp = this.colonyManager._findEntity(homePlanetId);
            if (hp) {
              window.KOSMOS.homePlanet = hp;
              hp.explored = true;
              // Księżyce planety domowej — zawsze zbadane
              for (const m of EntityManager.getByType('moon')) {
                if (m.parentPlanetId === hp.id) m.explored = true;
              }
            }
            // Przywróć aktywne systemy z homePlanet (per-kolonia instancje)
            const homeCol = this.colonyManager.getColony(homePlanetId);
            if (homeCol) {
              window.KOSMOS.resourceSystem  = homeCol.resourceSystem;
              window.KOSMOS.civSystem       = homeCol.civSystem;
              window.KOSMOS.buildingSystem  = homeCol.buildingSystem;
              this.resourceSystem  = homeCol.resourceSystem;
              this.civSystem       = homeCol.civSystem;
              this.buildingSystem  = homeCol.buildingSystem;
              this.expeditionSystem.resourceSystem = homeCol.resourceSystem;
              this.techSystem.resourceSystem      = homeCol.resourceSystem;
              const gridSizes = { rocky: 10, hot_rocky: 6, ice: 6, gas: 6 };
              this.buildingSystem._gridHeight = gridSizes[hp?.planetType] ?? 10;
            }
          }, 0);
        }
        // Migracja save v4→v5: globalne budynki → przypisz do homePlanet
        if (c4x.buildings?.length > 0 && homePlanetId) {
          const homeCol = this.colonyManager.getColony(homePlanetId);
          if (homeCol?.buildingSystem) {
            homeCol.buildingSystem.restoreFromSave(c4x.buildings);
          }
        }
        if (c4x.expeditions) this.expeditionSystem.restore(c4x.expeditions);
      } else {
        // Save v4: stary format (single-colony) → migruj
        if (c4x.resources) this.resourceSystem.restore(c4x.resources);
        if (c4x.techs)     this.techSystem.restore(c4x.techs);
        if (c4x.civ)       this.civSystem.restore(c4x.civ);
        if (c4x.buildings?.length > 0) this.buildingSystem.restoreFromSave(c4x.buildings);
        if (c4x.expeditions) this.expeditionSystem.restore(c4x.expeditions);
        // Zarejestruj homePlanet jako kolonię w ColonyManager
        if (c4x.homePlanetId) {
          setTimeout(() => {
            const hp = EntityManager.getByType('planet').find(p => p.id === c4x.homePlanetId);
            if (hp) {
              window.KOSMOS.homePlanet = hp;
              hp.explored = true;
              // Księżyce planety domowej — zawsze zbadane
              for (const m of EntityManager.getByType('moon')) {
                if (m.parentPlanetId === hp.id) m.explored = true;
              }
              this.colonyManager.registerHomePlanet(hp, this.resourceSystem, this.civSystem, this.buildingSystem);
              const gridSizes = { rocky: 10, hot_rocky: 6, ice: 6, gas: 6 };
              this.buildingSystem._gridHeight = gridSizes[hp.planetType] ?? 10;
            }
          }, 0);
        }
      }
      if (c4x.civ?.unrestActive) {
        this.buildingSystem._civPenalty = 0.7;
        this.buildingSystem._reapplyAllRates();
      }
    }

    // ── PlanetScene (mapa hex) ─────────────────────────────────
    const planetCanvas = document.getElementById('planet-canvas');
    this.planetScene   = new PlanetScene(planetCanvas, this.timeSystem);

    // ── PlanetGlobeScene (3D mapa planety) ──────────────────────
    this.planetGlobeScene = new PlanetGlobeScene(planetCanvas, this.timeSystem);

    // Przejście do mapy planety — globus 3D jako domyślna mapa
    EventBus.on('planet:colonize', ({ planet }) => {
      if (this.planetScene.isOpen || this.planetGlobeScene?.isOpen) return;
      window.KOSMOS.civMode    = true;
      window.KOSMOS.homePlanet = planet;
      planet.explored = true;
      // Księżyce planety domowej — zawsze zbadane
      for (const m of EntityManager.getByType('moon')) {
        if (m.parentPlanetId === planet.id) m.explored = true;
      }
      // Startowe zasoby dla nowej kolonii
      if (window.KOSMOS.edenScenario) {
        // Eden: tryb testowy — nieograniczone zasoby i nauka
        const INF = 999999;
        for (const key of ['minerals', 'energy', 'organics', 'water', 'research']) {
          this.resourceSystem.setCapacity(key, INF);
        }
        this.resourceSystem.receive({
          minerals: INF, energy: INF, organics: INF, water: INF, research: INF,
        });
      } else {
        this.resourceSystem.receive({
          minerals: 100, energy: 100, organics: 100, water: 100, research: 100,
        });
      }
      // Zarejestruj jako pierwszą kolonię w ColonyManager (z per-kolonia BuildingSystem)
      this.colonyManager.registerHomePlanet(planet, this.resourceSystem, this.civSystem, this.buildingSystem);
      const idx = this.timeSystem.multiplierIndex;
      this.planetGlobeScene.open(planet, idx);
    });
    EventBus.on('planet:openMap', ({ planet }) => {
      if (this.planetScene.isOpen || this.planetGlobeScene?.isOpen) return;
      const idx = this.timeSystem.multiplierIndex;
      this.planetGlobeScene.open(planet, idx);
    });
    EventBus.on('planet:openGlobe', ({ planet }) => {
      if (this.planetGlobeScene.isOpen) return;
      if (this.planetScene.isOpen) return;
      const idx = this.timeSystem.multiplierIndex;
      this.planetGlobeScene.open(planet, idx);
    });
    // Otwórz mapę kolonii po założeniu
    EventBus.on('colony:founded', ({ colony }) => {
      if (this.planetGlobeScene?.isOpen || this.planetScene?.isOpen) return;
      // Automatycznie otwórz mapę nowo założonej kolonii
      const idx = this.timeSystem.multiplierIndex;
      this.planetGlobeScene.open(colony.planet, idx);
    });

    // Kolizja — akrecja nowej planety z ThreeRenderer (EventBus obsługuje wewnątrz)
    EventBus.on('accretion:newPlanet', (planet) => {
      // ThreeRenderer subskrybuje 'accretion:newPlanet' samodzielnie
    });

    // Powiadomienia o zdarzeniach losowych
    EventBus.on('randomEvent:occurred', ({ event, colonyName }) => {
      showEventNotification(event, colonyName);
    });

    // Keyboard input (DOM)
    this._setupKeyboard();

    // Obsługa input z event layer
    this._setupMouseInput(eventLayer);

    // Nowa gra
    EventBus.on('game:new', () => { SaveSystem.clearSave(); window.location.reload(); });

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

  // ── Generowanie / przywracanie układu ─────────────────────────

  _generateFreshSystem(cx, cy) {
    const generator = new SystemGenerator();
    const result    = window.KOSMOS?.edenScenario
      ? generator.generateEdenScenario()
      : generator.generate();
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
    EntityManager.add(star);

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
        composition:       pd.composition,
      });
      p.lifeScore        = pd.lifeScore        || 0;
      p.orbitalStability = pd.orbitalStability || 1.0;
      p.age              = pd.age              || 0;
      p.surface          = { ...(pd.surface || {}) };
      p.explored         = pd.explored         || false;
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
      });
      m.age      = md.age      || 0;
      m.explored = md.explored || false;
      EntityManager.add(m);
      return m;
    });

    const maxId = [data.star, ...data.planets, ...(data.moons || [])]
      .map(e => { const m = String(e.id).match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
      .reduce((a, b) => Math.max(a, b), 0);
    EntityManager._nextId = maxId + 1;

    window.KOSMOS.savedData = null;
    return { star, planets, moons, planetesimals: [], asteroids: [], comets: [], planetoids: [] };
  }

  // ── Klawiatura ─────────────────────────────────────────────────
  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
        case 'Digit1': EventBus.emit('time:setMultiplier', { index: 1 }); EventBus.emit('time:play'); break;
        case 'Digit2': EventBus.emit('time:setMultiplier', { index: 2 }); EventBus.emit('time:play'); break;
        case 'Digit3': EventBus.emit('time:setMultiplier', { index: 3 }); EventBus.emit('time:play'); break;
        case 'Digit4': EventBus.emit('time:setMultiplier', { index: 4 }); EventBus.emit('time:play'); break;
        case 'Digit5': EventBus.emit('time:setMultiplier', { index: 5 }); EventBus.emit('time:play'); break;
        case 'BracketLeft':  EventBus.emit('time:slower'); break;
        case 'BracketRight': EventBus.emit('time:faster'); break;
        // Akcje gracza zablokowane w trybie 4X (civMode)
        case 'KeyQ': if (!window.KOSMOS?.civMode) EventBus.emit('action:stabilize');  break;
        case 'KeyW': if (!window.KOSMOS?.civMode) EventBus.emit('action:nudgeToHz');  break;
        case 'KeyE': if (!window.KOSMOS?.civMode) EventBus.emit('action:bombard');    break;
      }
    });
  }

  // ── Mysz: rozdziela kliknięcia między UI a Three.js ───────────
  // Nasłuchuje na window (gwarantuje odbiór niezależnie od z-index warstw)
  _setupMouseInput(eventLayer) {
    window.addEventListener('click', (e) => {
      // Ignoruj gdy PlanetScene lub PlanetGlobeScene jest aktywne
      if (this.planetScene?.isOpen || this.planetGlobeScene?.isOpen) return;
      // Ignoruj jeśli to był drag kamery (nie kliknięcie)
      if (this.cameraController.wasDrag) return;

      const x = e.clientX;
      const y = e.clientY;

      // Najpierw UI, potem 3D
      if (!this.uiManager.handleClick(x, y)) {
        this.threeRenderer.handleClick(x, y);
      }
    });

    // Dwuklik na planetę/księżyc → od razu otwórz mapę/globus
    // Fallback: jeśli raycast nie trafi (planeta za mała przy dalekim zoomie),
    // użyj encji zaznaczonej przez klik (który fire'uje przed dblclick)
    window.addEventListener('dblclick', (e) => {
      if (this.planetScene?.isOpen || this.planetGlobeScene?.isOpen) return;

      let entity = this.threeRenderer.getEntityAtScreen(e.clientX, e.clientY);
      if (!entity || (entity.type !== 'planet' && entity.type !== 'moon')) {
        // Fallback: użyj aktualnie zaznaczonej encji (z klik → body:selected)
        const focusId = this.threeRenderer._focusEntityId;
        if (focusId) entity = EntityManager.get(focusId);
      }
      if (!entity) return;

      // Tryb cywilizacyjny + ciało z kolonią → otwórz globus
      if (window.KOSMOS?.civMode && this.colonyManager.hasColony(entity.id)) {
        EventBus.emit('planet:openGlobe', { planet: entity });
        return;
      }

      // Planeta z życiem (lifeScore > 80) → kolonizuj (otworzy globus)
      if (!window.KOSMOS?.civMode && entity.type === 'planet' && entity.lifeScore > 80) {
        EventBus.emit('planet:colonize', { planet: entity });
      }
    });

    window.addEventListener('mousemove', (e) => {
      // Ignoruj gdy PlanetScene lub PlanetGlobeScene jest aktywne
      if (this.planetScene?.isOpen || this.planetGlobeScene?.isOpen) return;

      const x = e.clientX;
      const y = e.clientY;

      this.uiManager.handleMouseMove(x, y);
      this.threeRenderer.handleMouseMove(x, y);
    });
  }
}
