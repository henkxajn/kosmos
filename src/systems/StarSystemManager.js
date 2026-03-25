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
   * @param {Object} galaxyStar — wpis z GalaxyGenerator (id, name, spectralType, mass, luminosity, ...)
   * @returns {StarSystemData}
   */
  generateAndRegister(galaxyStar) {
    const systemId = galaxyStar.id;

    // Już wygenerowany?
    if (this._systems.has(systemId)) return this._systems.get(systemId);

    // Wygeneruj układ z seeded PRNG (deterministyczny z galaxyStar.id)
    const generator = new SystemGenerator();
    const result = generator.generateForStar(galaxyStar);

    // Oznacz encje systemId
    result.star.systemId = systemId;
    result.planets.forEach(p => p.systemId = systemId);
    result.moons.forEach(m => m.systemId = systemId);
    result.planetoids.forEach(p => p.systemId = systemId);
    result.asteroids.forEach(a => a.systemId = systemId);
    result.comets.forEach(c => c.systemId = systemId);

    // Oznacz gwiazdę jako zbadaną w galaxyData
    galaxyStar.explored = true;

    const sysData = {
      systemId,
      galaxyStar,
      starEntityId:  result.star.id,
      planetIds:     result.planets.map(p => p.id),
      moonIds:       result.moons.map(m => m.id),
      planetoidIds:  result.planetoids.map(p => p.id),
      explored:      true,
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

    this._activeSystemId = data.activeSystemId || 'sys_home';

    for (const sd of data.systems) {
      this._systems.set(sd.systemId, {
        systemId:     sd.systemId,
        galaxyStar:   null,  // odtworzony z galaxyData jeśli potrzebne
        starEntityId: sd.starEntityId,
        planetIds:    sd.planetIds || [],
        moonIds:      sd.moonIds || [],
        planetoidIds: sd.planetoidIds || [],
        explored:     sd.explored ?? true,
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
