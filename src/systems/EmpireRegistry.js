// EmpireRegistry — system-właściciel domeny gameState.empires
//
// Slice 1 refactor: usunięte abstrakcyjne scalary (military.power, tech.level,
// resources.production, _growAll). Imperium ma realne kolonie typu Colony
// w ColonyManager, które żyją ekonomicznie samoczynnie. EmpireRegistry trzyma
// tylko metadane (id, name, archetype, personality, colonies, fleets).
//
// Mutacje TYLKO przez intent methods (nie gameState.set spoza tej klasy).
//
// Stan (per imperium) w gameState.empires[empireId]:
//   {
//     id, name, namePL, nameEN,
//     archetype, personality,
//     homeSystemId,
//     colonies: [colonyId, ...],       // string array — planetId z ColonyManager
//     currentStrategy: { focus, startedYear },  // Faza 2: EmpireStrategicAI
//     fleets: [...],
//     createdYear
//   }
//
// Faza 1: brak time:tick subscription — kolonie tickują przez własne systemy.

import EventBus from '../core/EventBus.js';
import gameState from '../core/GameState.js';
import { ARCHETYPES } from '../data/EmpireData.js';

export class EmpireRegistry {
  constructor() {
    // Slice 1: brak abstract growth — kolonie żyją same.
  }

  // ── Czytanki (read-only) ─────────────────────────────────────

  get(empireId)    { return gameState.get(`empires.${empireId}`) ?? null; }
  listAll()        { return Object.values(gameState.get('empires') ?? {}); }
  listIds()        { return Object.keys(gameState.get('empires') ?? {}); }
  count()          { return this.listIds().length; }

  // ── Intent methods (mutacje) ─────────────────────────────────

  /**
   * Rejestruje nowe imperium w gameState.
   * @param {Object} p — { id, name?, archetype, homeSystemId?, colonies?, currentStrategy?, fleets? }
   *                     personality kopiowana z archetypu.
   * @returns {Object} zapisane imperium
   */
  createEmpire(p) {
    if (!p?.id) throw new Error('[EmpireRegistry] createEmpire: brak id');
    if (gameState.get(`empires.${p.id}`)) {
      console.warn(`[EmpireRegistry] Imperium ${p.id} już istnieje — pomijam create`);
      return gameState.get(`empires.${p.id}`);
    }
    const arch = ARCHETYPES[p.archetype];
    if (!arch) throw new Error(`[EmpireRegistry] Nieznany archetyp: ${p.archetype}`);

    const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const emp = {
      id:           p.id,
      name:         p.name ?? arch.namePL,
      namePL:       p.namePL ?? p.name ?? arch.namePL,
      nameEN:       p.nameEN ?? p.name ?? arch.nameEN,
      archetype:    p.archetype,
      personality:  { ...arch.personality },
      homeSystemId: p.homeSystemId ?? null,
      // Slice 1: colonies to array colonyId stringów (planetId z ColonyManager).
      colonies:     Array.isArray(p.colonies) ? [...p.colonies] : [],
      // Faza 2: EmpireStrategicAI co 8 civYears mutuje currentStrategy.
      currentStrategy: p.currentStrategy ?? { focus: null, startedYear: year },
      fleets:       Array.isArray(p.fleets) ? [...p.fleets] : [],
      createdYear:  p.createdYear ?? year,
    };
    gameState.set(`empires.${p.id}`, emp, 'empire_created');
    EventBus.emit('empire:created', { empireId: p.id, archetype: p.archetype, homeSystemId: emp.homeSystemId });
    return emp;
  }

  /**
   * Rejestruje kolonię (colonyId) jako należącą do imperium.
   * Jednocześnie ustawia colony.ownerEmpireId = empireId na obiekcie kolonii
   * (jeśli ColonyManager już ma tę kolonię).
   *
   * Slice 1 nowy signature: addColony(empireId, colonyId).
   *
   * @param {string} empireId
   * @param {string} colonyId — planetId z ColonyManager (kolonie są indexed po planetId)
   * @returns {boolean} true jeśli dodano, false jeśli duplikat lub błąd
   */
  addColony(empireId, colonyId) {
    const emp = this.get(empireId);
    if (!emp || !colonyId) return false;
    if (emp.colonies.includes(colonyId)) return false;

    const next = [...emp.colonies, colonyId];
    gameState.set(`empires.${empireId}.colonies`, next, 'empire_colony_added');

    // Slice 1 hook: ownerEmpireId na obiekcie kolonii (jeśli już istnieje)
    const colony = window.KOSMOS?.colonyManager?.getColony(colonyId);
    if (colony) colony.ownerEmpireId = empireId;

    EventBus.emit('empire:colonyAdded', { empireId, colonyId });
    return true;
  }

  /**
   * Wycofuje kolonię z imperium. Jeśli była ostatnia → empire:destroyed.
   *
   * @param {string} empireId
   * @param {string} colonyId
   */
  removeColony(empireId, colonyId) {
    const emp = this.get(empireId);
    if (!emp || !colonyId) return false;
    const next = emp.colonies.filter(id => id !== colonyId);
    if (next.length === emp.colonies.length) return false;

    gameState.set(`empires.${empireId}.colonies`, next, 'empire_colony_removed');
    EventBus.emit('empire:colonyRemoved', { empireId, colonyId });

    if (next.length === 0) this.destroyEmpire(empireId, 'no_colonies_left');
    return true;
  }

  // ── Backward compat stubs (Slice 1) ─────────────────────────
  // Stary EconAI/MilitaryAI nadal wywołują te metody przez AlienCivSystem._tickAll.
  // Faza 2 usunie stare AI — wtedy te stuby pójdą razem z nimi.
  // No-op żeby nie crashować — abstrakcyjne scalary military.power/resources.production
  // już nie istnieją w gameState.empires (Slice 1 refactor).
  updateMilitaryPower(_empireId, _delta, _reason = '') { /* no-op */ }
  updateResource(_empireId, _key, _delta, _reason = '') { /* no-op */ }
  changeTechLevel(_empireId, _delta, _reason = '')      { /* no-op */ }

  /**
   * Ustawia strategic focus imperium (Faza 2: EmpireStrategicAI).
   */
  setStrategicFocus(empireId, focus, reason = '') {
    const emp = this.get(empireId);
    if (!emp) return;
    const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const oldFocus = emp.currentStrategy?.focus ?? null;
    gameState.set(
      `empires.${empireId}.currentStrategy`,
      { focus, startedYear: year },
      reason || 'strategy_changed'
    );
    EventBus.emit('ai:strategicShift', { empireId, oldFocus, newFocus: focus, reason });
  }

  // ── Floty obcych imperiów (Faza 4) ──────────────────────────
  // Abstrakcyjna flota: { id, strength, systemId, destSystemId?, etaYear?, morale? }
  // W Slice 1 imperium AI nie ma startowych flot (nie produkuje statków).

  listFleets(empireId) {
    const emp = this.get(empireId);
    return emp?.fleets ?? [];
  }

  /** Spawnuje flotę w domyślnie home-system imperium (lub podanym). */
  spawnFleet(empireId, params = {}) {
    const emp = this.get(empireId);
    if (!emp) return null;
    const fleets = [...(emp.fleets ?? [])];
    const fleetId = params.id ?? `fleet_${empireId}_${fleets.length + 1}`;
    const systemId = params.systemId ?? emp.homeSystemId;
    const fleet = {
      id:           fleetId,
      strength:     params.strength ?? 100,
      systemId,
      destSystemId: null,
      etaYear:      null,
      morale:       params.morale ?? 1.0,
      createdYear:  window.KOSMOS?.timeSystem?.gameTime ?? 0,
      hasTroopTransport: params.hasTroopTransport ?? false,
      troopCapacity:     params.troopCapacity ?? 0,
      embarkedTroops:    params.embarkedTroops ?? [],
    };
    fleets.push(fleet);
    gameState.set(`empires.${empireId}.fleets`, fleets, 'fleet_spawned');
    EventBus.emit('empire:fleetSpawned', { empireId, fleet });
    return fleet;
  }

  /** Uruchom flotę w drogę do systemu docelowego (ETA w civYears). */
  moveFleet(empireId, fleetId, destSystemId, etaYears) {
    const emp = this.get(empireId);
    if (!emp) return false;
    const fleets = [...(emp.fleets ?? [])];
    const idx = fleets.findIndex(f => f.id === fleetId);
    if (idx < 0) return false;
    const currentYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    fleets[idx] = {
      ...fleets[idx],
      destSystemId,
      etaYear: currentYear + etaYears,
    };
    gameState.set(`empires.${empireId}.fleets`, fleets, 'fleet_moved');
    EventBus.emit('empire:fleetMoved', { empireId, fleetId, destSystemId, etaYear: fleets[idx].etaYear });
    return true;
  }

  /** Aktualizuje siłę floty (straty/wzmocnienia). */
  updateFleetStrength(empireId, fleetId, newStrength, reason = '') {
    const emp = this.get(empireId);
    if (!emp) return false;
    const fleets = [...(emp.fleets ?? [])];
    const idx = fleets.findIndex(f => f.id === fleetId);
    if (idx < 0) return false;
    fleets[idx] = { ...fleets[idx], strength: Math.max(0, newStrength) };
    gameState.set(`empires.${empireId}.fleets`, fleets, reason);
    if (fleets[idx].strength <= 0) {
      this.destroyFleet(empireId, fleetId, 'destroyed_in_battle');
    }
    return true;
  }

  destroyFleet(empireId, fleetId, reason = '') {
    const emp = this.get(empireId);
    if (!emp) return false;
    const fleets = (emp.fleets ?? []).filter(f => f.id !== fleetId);
    gameState.set(`empires.${empireId}.fleets`, fleets, `fleet_destroyed_${reason}`);
    EventBus.emit('empire:fleetDestroyed', { empireId, fleetId, reason });
    return true;
  }

  /** Kasuje imperium ze stanu. */
  destroyEmpire(empireId, reason = '') {
    const emp = this.get(empireId);
    if (!emp) return false;
    const empires = { ...(gameState.get('empires') ?? {}) };
    delete empires[empireId];
    gameState.set('empires', empires, 'empire_destroyed');
    EventBus.emit('empire:destroyed', { empireId, reason });
    return true;
  }

  /**
   * Po restore (gameState załadowany z save) — zsynchronizuj empireId na galaxyData.
   * Wywoływane z GameScene po GalaxyGenerator.generate / po gameState.restore.
   *
   * Slice 1: colonies to string array, więc systemId odczytujemy z ColonyManager.
   */
  syncToGalaxyData(galaxyData) {
    if (!galaxyData?.systems) return;
    // Wyczyść stare empireId
    for (const sys of galaxyData.systems) {
      if (sys.empireId) sys.empireId = null;
    }
    const colMgr = window.KOSMOS?.colonyManager;
    for (const emp of this.listAll()) {
      // Home system zaznaczamy na wszelki wypadek
      if (emp.homeSystemId) {
        const gs = galaxyData.systems.find(s => s.id === emp.homeSystemId);
        if (gs && !gs.empireId) gs.empireId = emp.id;
      }
      // Każda kolonia (po colonyId → systemId)
      for (const colonyId of emp.colonies ?? []) {
        const colony = colMgr?.getColony(colonyId);
        const sysId  = colony?.systemId ?? null;
        if (!sysId) continue;
        const gs = galaxyData.systems.find(s => s.id === sysId);
        if (gs) gs.empireId = emp.id;
      }
    }
  }
}
