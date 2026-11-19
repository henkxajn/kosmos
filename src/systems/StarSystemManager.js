// StarSystemManager — centralny rejestr układów gwiezdnych
//
// Zarządza wieloma układami: rejestracja, leniwa generacja, przełączanie widoku.
// Encje wszystkich odwiedzonych układów żyją w jednym EntityManager (pole entity.systemId).
// PhysicsSystem tickuje Keplera per-gwiazda (tanie sin/cos).
// ThreeRenderer renderuje tylko aktywny układ.
//
// Eventy emitowane:
//   system:switched { systemId, star }
//   system:generated { systemId, star, planets }

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { SystemGenerator } from '../generators/SystemGenerator.js';
import { DepositSystem }   from './DepositSystem.js';
import { isSystemExplored, HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { assignSurfaceSeeds } from '../utils/SurfaceSeed.js';
import { assignBodyArchetype, archetypeContext } from '../utils/BodyArchetypeLogic.js';

export class StarSystemManager {
  constructor() {
    // Rejestr odwiedzonych układów: systemId → StarSystemData
    this._systems = new Map();

    // Aktywnie renderowany układ
    this._activeSystemId = null;

    // Nasłuch budowy orbitalnej infrastruktury
    EventBus.on('orbital:buildBeacon', ({ systemId }) => {
      this.buildBeacon(systemId);
      EventBus.emit('orbital:beaconBuilt', { systemId });
    });
    EventBus.on('orbital:buildJumpGate', ({ systemId, connectedTo }) => {
      this.buildJumpGate(systemId, connectedTo);
      EventBus.emit('orbital:jumpGateBuilt', { systemId, connectedTo });
    });
  }

  // ── Gettery ────────────────────────────────────────────────────────────────

  get activeSystemId() { return this._activeSystemId; }

  getSystem(systemId)  { return this._systems.get(systemId) || null; }
  getAllSystems()       { return Array.from(this._systems.values()); }
  getActiveSystem()    { return this._systems.get(this._activeSystemId) || null; }

  // ── Rejestracja home system (przy starcie gry) ─────────────────────────────

  /**
   * Rejestruje istniejący (już wygenerowany) układ jako home system.
   * Nadaje entity.systemId = 'sys_home' wszystkim encjom.
   */
  registerHomeSystem(star, planets, moons, planetoids) {
    const systemId = 'sys_home';
    this._activeSystemId = systemId;

    // Oznacz encje systemId
    star.systemId = systemId;
    planets.forEach(p => p.systemId = systemId);
    moons.forEach(m => m.systemId = systemId);
    planetoids.forEach(p => p.systemId = systemId);

    // Asteroidy i komety też
    for (const a of EntityManager.getByType('asteroid'))  a.systemId = systemId;
    for (const c of EntityManager.getByType('comet'))     c.systemId = systemId;

    const sysData = {
      systemId,
      galaxyStar:    null,  // home nie ma wpisu galaxy (sam jest centrum)
      starEntityId:  star.id,
      planetIds:     planets.map(p => p.id),
      moonIds:       moons.map(m => m.id),
      planetoidIds:  planetoids.map(p => p.id),
      explored:      true,
      warpBeacon:    null,
      jumpGate:      null,
    };
    this._systems.set(systemId, sysData);
    return sysData;
  }

  // ── Leniwa generacja nowego układu ──────────────────────────────────────────

  /**
   * Generuje układ gwiezdny dla danej gwiazdy z galaktyki i rejestruje encje.
   *
   * ⚠ NIE OZNACZA UKŁADU JAKO ZBADANEGO — i to jest treść poprawki Findingów 186/187.
   *   Ta funkcja zapalała `galaxyStar.explored` i lustro `sysData.explored` dla KAŻDEGO
   *   wywołania, a wołają ją także zdarzenia, które z eksploracją gracza nie mają nic wspólnego:
   *   bootstrap imperium AI (`EmpireColonyBootstrap:610`) i przylot DOWOLNEGO statku, w tym
   *   rajdera AI (`VesselManager._tickInterstellar`). Generacja układu to fakt techniczny
   *   (leniwe stworzenie encji), nie akt poznania. Oznaczanie należy do wołającego, przez
   *   `markSystemExplored` — jedynego pisarza kanonu.
   *
   * @param {Object} galaxyStar — wpis z GalaxyGenerator (id, name, spectralType, mass, luminosity, ...)
   * @param {Object} [galaxyData] — rekord świata (`seed` + stempel `seededSystems`), z którego pochodzi
   *   `galaxyStar`. Wołający, który go ma, podaje go JAWNIE (CS-3a-fix); domyślnie leniwy dostęp 4X.
   * @returns {StarSystemData}
   */
  generateAndRegister(galaxyStar, galaxyData = window.KOSMOS?.galaxyData) {
    const systemId = galaxyStar.id;

    // Już wygenerowany?
    if (this._systems.has(systemId)) return this._systems.get(systemId);

    // Wygeneruj układ z seeded PRNG (deterministyczny z galaxyStar.id; w świecie seedowanym także
    // z galaxySeed — D-CS-17). Tryb i seed pochodzą z REKORDU ŚWIATA (worldSeedContext), nie z bieżącej
    // flagi — ta sama droga co ObservatorySystem → peekCountsForStar (CS-3a-fix).
    const seedCtx = SystemGenerator.worldSeedContext(galaxyData);
    const galaxySeed = seedCtx.galaxySeed;
    const generator = new SystemGenerator();
    // CS-PHYS-a — model klimatu z REKORDU ŚWIATA (stempel climateModel), nie z bieżącej flagi (D-CS-19 §3.8)
    const result = generator.generateForStar(galaxyStar, seedCtx, SystemGenerator.worldClimateModel(galaxyData));

    // Oznacz encje systemId
    result.star.systemId = systemId;
    result.planets.forEach(p => p.systemId = systemId);
    result.moons.forEach(m => m.systemId = systemId);
    result.planetoids.forEach(p => p.systemId = systemId);
    result.asteroids.forEach(a => a.systemId = systemId);
    result.comets.forEach(c => c.systemId = systemId);

    // CS-3a — ziarna powierzchni: czysty hash PO generacji (nie rzut ze strumienia układu),
    // ordinal = indeks w tablicy generatora (kolejność wstawienia do EntityManager).
    assignSurfaceSeeds({ planet: result.planets, moon: result.moons, planetoid: result.planetoids }, galaxySeed);

    // CS-3b — tidallyLocked + archetyp ciała: czysta funkcja zapisanych parametrów + klasy gwiazdy, PO ziarnach
    // (remis rozstrzyga surfaceSeed), bez rzutów RNG. Zamrożone od teraz (D-CS-2).
    // CS-3b-v2: kontekst = gwiazda (klasa + jasność → strumień), rodzice i strefy księżyców układu.
    const starCtx = archetypeContext(result.star, result.planets, result.moons);
    for (const b of [...result.planets, ...result.moons, ...result.planetoids]) assignBodyArchetype(b, starCtx);

    const sysData = {
      systemId,
      galaxyStar,
      starEntityId:  result.star.id,
      planetIds:     result.planets.map(p => p.id),
      moonIds:       result.moons.map(m => m.id),
      planetoidIds:  result.planetoids.map(p => p.id),
      // Lustro stanu wiedzy — NIEAUTORYTATYWNE (patrz `utils/SystemExploration.js`).
      // Trzymane, bo idzie do zapisu; czytane przez nikogo. Prawdą jest `galaxyStar.explored`.
      explored:      isSystemExplored(galaxyStar),
      warpBeacon:    null,
      jumpGate:      null,
    };
    this._systems.set(systemId, sysData);

    EventBus.emit('system:generated', {
      systemId,
      star: result.star,
      planets: result.planets,
    });

    return sysData;
  }

  /**
   * CS-3a — `surfaceSeed ??=` dla WSZYSTKICH planet / księżyców / planetoid w EntityManager.
   * Wołane raz przy starcie sceny, gdy `galaxyData.seed` już istnieje: nowa gra (układ domowy
   * powstaje PRZED galaktyką) i wczytanie (stary zapis bez ziaren). Ordinal = indeks ciała danego
   * rodzaju w jego układzie w kolejności EntityManager == kolejności zapisu (SurfaceSeed.js).
   * @returns {number} liczba nadanych ziaren
   */
  assignMissingSurfaceSeeds(galaxySeed) {
    return assignSurfaceSeeds({
      planet:    EntityManager.getByType('planet'),
      moon:      EntityManager.getByType('moon'),
      planetoid: EntityManager.getByType('planetoid'),
    }, galaxySeed);
  }

  /**
   * CS-3b — `tidallyLocked ??=` i `bodyArchetype ??=` dla WSZYSTKICH planet / księżyców / planetoid w EntityManager.
   * Wołane raz przy starcie sceny ZARAZ PO `assignMissingSurfaceSeeds` (archetyp potrzebuje ziarna do remisu):
   * nowa gra — układ domowy PO mutacjach planety domowej (makeHomeworldBreathable), więc dom gracza dostaje archetyp
   * z parametrów po mutacji; wczytanie — stary zapis bez archetypów. Gwiazda = encja 'star' z tym samym systemId.
   * Ciało, które ma już archetyp, ZACHOWUJE go (D-CS-2).
   * CS-3b-v2: kontekst per układ (archetypeContext: jasność gwiazdy, rodzice + strefy księżyców). Dom gracza jest
   * terran przez klauzulę biosfery (lifeScore 100 z generateCivScenario, priorytet 90); dom AI — w bootstrapie.
   * @returns {number} liczba nadanych archetypów
   */
  assignMissingArchetypes() {
    const starById = new Map();
    for (const st of EntityManager.getByType('star')) {
      const sid = st.systemId ?? HOME_SYSTEM_ID;
      if (!starById.has(sid)) starById.set(sid, st);
    }
    const bySys = new Map();   // systemId → ciała układu per rodzaj
    for (const kind of ['planet', 'moon', 'planetoid']) {
      for (const b of EntityManager.getByType(kind)) {
        const sid = b.systemId ?? HOME_SYSTEM_ID;
        if (!bySys.has(sid)) bySys.set(sid, { planet: [], moon: [], planetoid: [] });
        bySys.get(sid)[kind].push(b);
      }
    }
    let assigned = 0;
    for (const [sid, g] of bySys) {
      const ctx = archetypeContext(starById.get(sid) ?? null, g.planet, g.moon);
      for (const kind of ['planet', 'moon', 'planetoid']) {
        for (const b of g[kind]) {
          if (assignBodyArchetype(b, ctx)) assigned++;
        }
      }
    }
    return assigned;
  }

  // ── Przełączanie aktywnego układu ──────────────────────────────────────────

  /**
   * Przełącza widok 3D na inny układ gwiezdny.
   * ThreeRenderer przebudowuje scenę, UI aktualizuje nagłówek.
   */
  switchActiveSystem(systemId) {
    const sysData = this._systems.get(systemId);
    if (!sysData) {
      console.warn(`[StarSystemManager] Nieznany układ: ${systemId}`);
      return false;
    }

    this._activeSystemId = systemId;
    window.KOSMOS.activeSystemId = systemId;

    const star = EntityManager.get(sysData.starEntityId);
    if (!star) {
      console.error(`[StarSystemManager] Brak gwiazdy encji: ${sysData.starEntityId}`);
      return false;
    }

    const planets    = EntityManager.getByTypeInSystem('planet', systemId);
    const moons      = EntityManager.getByTypeInSystem('moon', systemId);
    const planetoids = EntityManager.getByTypeInSystem('planetoid', systemId);

    // ThreeRenderer przebudowuje scenę
    const renderer = window.KOSMOS?.threeRenderer;
    if (renderer) {
      renderer.switchSystem(star, planets, [], moons);
    }

    // UIManager aktualizuje nagłówek
    EventBus.emit('system:switched', { systemId, star });

    return true;
  }

  // ── Pomocnicze ──────────────────────────────────────────────────────────────

  /** Znajdź systemId na podstawie entityId */
  getSystemOfEntity(entityId) {
    const entity = EntityManager.get(entityId);
    return entity?.systemId || null;
  }

  /** Kolonie w danym układzie */
  getSystemColonies(systemId) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return [];
    return colMgr.getAllColonies().filter(c => {
      const entity = EntityManager.get(c.planetId);
      return entity?.systemId === systemId;
    });
  }

  /** Czy dany układ ma warp beacon? */
  hasBeacon(systemId) {
    const sys = this._systems.get(systemId);
    return sys?.warpBeacon != null;
  }

  /** Czy dany układ ma jump gate? */
  hasJumpGate(systemId) {
    const sys = this._systems.get(systemId);
    return sys?.jumpGate != null;
  }

  /** Zbuduj warp beacon w układzie */
  buildBeacon(systemId) {
    const sys = this._systems.get(systemId);
    if (!sys) return;
    sys.warpBeacon = {
      builtYear: window.KOSMOS?.timeSystem?.gameTime ?? 0,
    };
    // Aktualizuj galaxyStar jeśli istnieje
    const gd = window.KOSMOS?.galaxyData;
    if (gd) {
      const gs = gd.systems.find(s => s.id === systemId);
      if (gs) gs.warpBeacon = true;
    }
  }

  /** Zbuduj jump gate w układzie (wymaga gate na drugim końcu!) */
  buildJumpGate(systemId, connectedTo = null) {
    const sys = this._systems.get(systemId);
    if (!sys) return;
    sys.jumpGate = {
      builtYear:   window.KOSMOS?.timeSystem?.gameTime ?? 0,
      connectedTo: connectedTo,
    };
    const gd = window.KOSMOS?.galaxyData;
    if (gd) {
      const gs = gd.systems.find(s => s.id === systemId);
      if (gs) gs.jumpGate = true;
    }
  }

  // ── Serializacja ──────────────────────────────────────────────────────────

  serialize() {
    const systems = [];
    for (const [id, sys] of this._systems) {
      systems.push({
        systemId:     sys.systemId,
        starEntityId: sys.starEntityId,
        planetIds:    sys.planetIds,
        moonIds:      sys.moonIds,
        planetoidIds: sys.planetoidIds,
        explored:     sys.explored,
        warpBeacon:   sys.warpBeacon ? { ...sys.warpBeacon } : null,
        jumpGate:     sys.jumpGate ? { ...sys.jumpGate } : null,
      });
    }
    return {
      activeSystemId: this._activeSystemId,
      systems,
    };
  }

  restore(data) {
    if (!data?.systems) return;

    // Zawsze startuj z home system — renderer jest inicjalizowany z home
    // Użytkownik może przełączyć ręcznie przez Outliner/GalaxyMap
    this._activeSystemId = 'sys_home';
    window.KOSMOS.activeSystemId = 'sys_home';

    for (const sd of data.systems) {
      this._systems.set(sd.systemId, {
        systemId:     sd.systemId,
        galaxyStar:   null,  // odtworzony z galaxyData jeśli potrzebne
        starEntityId: sd.starEntityId,
        planetIds:    sd.planetIds || [],
        moonIds:      sd.moonIds || [],
        planetoidIds: sd.planetoidIds || [],
        // FAIL-CLOSED (było `?? true`): brak pola w zapisie nie może znaczyć „gracz to zna".
        // Dom zna się z definicji. Lustro NIE jest źródłem prawdy — zostaje takie, jakie było
        // w zapisie, i nikt go nie czyta (kanon pyta `galaxyStar`, dowiązywaną niżej).
        explored:     sd.explored ?? (sd.systemId === HOME_SYSTEM_ID),
        warpBeacon:   sd.warpBeacon || null,
        jumpGate:     sd.jumpGate || null,
      });
    }

    // Powiąż galaxyStar z galaxyData
    const gd = window.KOSMOS?.galaxyData;
    if (gd) {
      for (const sys of this._systems.values()) {
        if (sys.systemId === 'sys_home') continue;
        const gs = gd.systems.find(s => s.id === sys.systemId);
        if (gs) sys.galaxyStar = gs;
      }
    }
  }
}
