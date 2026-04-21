// EmpireRegistry — system-właściciel domeny gameState.empires
//
// Zgodnie z planem (docs/plan-war-diplomacy-ai.md): mutacje TYLKO przez intent methods.
// NIE wywołuj gameState.set('empires.*') spoza tej klasy. UI i inne systemy mają używać:
//   empireRegistry.createEmpire({...})
//   empireRegistry.addColony(empireId, systemId, planetId)
//   empireRegistry.changeTechLevel(empireId, +1, 'research_breakthrough')
//
// Stan (per imperium) w gameState.empires[empireId]:
//   { id, name, archetype, personality, homeSystemId, colonies[], tech{}, military{}, resources{}, createdYear }
//
// Tick: subskrybuje time:tick i co 1 civYear dokonuje abstract growth — skala
// zależy od personality.expansion / science. Nie modeluje to szczegółowej gospodarki,
// tylko "imperium żyje" (bez tickowania wszystko byłoby statyczne do pierwszej
// interakcji gracza).

import EventBus from '../core/EventBus.js';
import gameState from '../core/GameState.js';
import { ARCHETYPES } from '../data/EmpireData.js';

// Stała tempo wzrostu (abstrakt — balansować później)
const MILITARY_PER_YEAR_BASE = 3.0;   // baza dodawania do military.power
const TECH_PER_YEAR_BASE     = 0.05;  // baza akumulatora → 1 poziom co ~20 lat

export class EmpireRegistry {
  constructor() {
    this._tickAccum = 0;
    this._techAccum = {};   // empireId → float (akumulator do techLevel)

    // Growth tick przez civDeltaYears (mechanika 4X, nie fizyka)
    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      // Krok co 1 civYear, żeby nie miotać eventami przy każdym sub-tickowaniu
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      this._growAll(steps);
    });
  }

  // ── Czytanki (read-only) ─────────────────────────────────────

  get(empireId)    { return gameState.get(`empires.${empireId}`) ?? null; }
  listAll()        { return Object.values(gameState.get('empires') ?? {}); }
  listIds()        { return Object.keys(gameState.get('empires') ?? {}); }
  count()          { return this.listIds().length; }

  // ── Intent methods (mutacje) ─────────────────────────────────

  /**
   * Rejestruje nowe imperium w gameState.
   * @param {Object} p — { id, name, archetype, homeSystemId, colonies?, tech?, military?, resources? }
   *                     personality zostaje skopiowana z archetypu.
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
      colonies:     Array.isArray(p.colonies) ? [...p.colonies] : [],
      tech:         p.tech      ?? { level: 1, focus: this._defaultTechFocus(p.archetype) },
      military:     p.military  ?? { power: 100 },
      resources:    p.resources ?? { production: 50 },
      createdYear:  p.createdYear ?? year,
    };
    gameState.set(`empires.${p.id}`, emp, 'empire_created');
    EventBus.emit('empire:created', { empireId: p.id, archetype: p.archetype, homeSystemId: emp.homeSystemId });
    return emp;
  }

  /** Dodaje kolonię (rejestrację, że imperium zajmuje system/planetę) */
  addColony(empireId, systemId, planetId = null) {
    const emp = this.get(empireId);
    if (!emp) return false;
    // Duplikaty: ten sam system+planetId → noop
    if (emp.colonies.some(c => c.systemId === systemId && c.planetId === planetId)) return false;
    const next = [...emp.colonies, { systemId, planetId }];
    gameState.set(`empires.${empireId}.colonies`, next, 'empire_colony_added');
    EventBus.emit('empire:colonyAdded', { empireId, systemId, planetId });
    return true;
  }

  /** Usuwa kolonię. Jeśli to była ostatnia → empire:destroyed. */
  removeColony(empireId, systemId, planetId = null) {
    const emp = this.get(empireId);
    if (!emp) return false;
    const next = emp.colonies.filter(c =>
      !(c.systemId === systemId && (planetId == null || c.planetId === planetId))
    );
    if (next.length === emp.colonies.length) return false;
    gameState.set(`empires.${empireId}.colonies`, next, 'empire_colony_removed');
    EventBus.emit('empire:colonyRemoved', { empireId, systemId, planetId });
    if (next.length === 0) this.destroyEmpire(empireId, 'no_colonies_left');
    return true;
  }

  /** Zmiana abstract military.power (dodatnia/ujemna). */
  updateMilitaryPower(empireId, delta, reason = '') {
    const emp = this.get(empireId);
    if (!emp) return;
    const oldVal = emp.military?.power ?? 0;
    const newVal = Math.max(0, oldVal + delta);
    gameState.set(`empires.${empireId}.military.power`, newVal, reason);
  }

  /** Zmiana wartości w empire.resources (np. production). */
  updateResource(empireId, key, delta, reason = '') {
    const emp = this.get(empireId);
    if (!emp) return;
    const resources = { ...(emp.resources ?? {}) };
    const oldVal = resources[key] ?? 0;
    resources[key] = Math.max(0, oldVal + delta);
    gameState.set(`empires.${empireId}.resources`, resources, reason);
  }

  /** Zmiana techLevel (int). Emituje empire:techAdvanced na wzrost. */
  changeTechLevel(empireId, delta, reason = '') {
    const emp = this.get(empireId);
    if (!emp) return;
    const oldLv = emp.tech?.level ?? 1;
    const newLv = Math.max(1, oldLv + delta);
    gameState.set(`empires.${empireId}.tech.level`, newLv, reason);
    if (newLv > oldLv) EventBus.emit('empire:techAdvanced', { empireId, from: oldLv, to: newLv, reason });
  }

  // ── Floty obcych imperiów (Faza 4) ──────────────────────────
  // Abstrakcyjna flota: { id, strength, systemId, destSystemId?, etaYear?, morale? }
  // Przemieszczanie + walka obsługiwane przez WarSystem.

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
      // Faza desantu: transport wojsk (bez tego flota toczy tylko bitwy orbitalne)
      hasTroopTransport: params.hasTroopTransport ?? false,
      troopCapacity:     params.troopCapacity ?? 0,
      // Faza desantu B: konkretne archetypy załadowane na statkach desantowych.
      // Gracz robi to samo przez CargoLoadModal → loadGroundUnit. AI generuje
      // listę w EmpireGenerator przy spawnu floty (wg archetypu).
      // Format: ['shock_infantry', 'rocket_artillery', ...]
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
    delete this._techAccum[empireId];
    return true;
  }

  // ── Wewnętrzne ───────────────────────────────────────────────

  _growAll(yearsPassed) {
    // Kopia, bo destroyEmpire może zmienić strukturę
    const emps = this.listAll().slice();
    for (const emp of emps) {
      const p = emp.personality || {};
      // Military power: proporcjonalne do liczby kolonii × personality.expansion
      const colMult = Math.max(1, emp.colonies?.length ?? 1);
      const milDelta = MILITARY_PER_YEAR_BASE * colMult * (0.4 + 0.6 * (p.expansion ?? 0.5)) * yearsPassed;
      if (milDelta > 0) this.updateMilitaryPower(emp.id, milDelta, 'tick_growth');

      // Tech: akumulator, co ciułanie 1.0 → level +1
      const techDelta = TECH_PER_YEAR_BASE * (0.3 + 0.7 * (p.science ?? 0.5)) * yearsPassed;
      this._techAccum[emp.id] = (this._techAccum[emp.id] || 0) + techDelta;
      if (this._techAccum[emp.id] >= 1.0) {
        const steps = Math.floor(this._techAccum[emp.id]);
        this._techAccum[emp.id] -= steps;
        this.changeTechLevel(emp.id, steps, 'tick_research');
      }
    }
  }

  _defaultTechFocus(archetype) {
    switch (archetype) {
      case 'xenophage':    return 'military';
      case 'isolationist': return 'defense';
      case 'trader':       return 'economy';
      case 'hegemon':      return 'military';
      case 'swarm':        return 'biology';
      default:             return 'general';
    }
  }

  /**
   * Po restore (gameState załadowany z save) — zsynchronizuj empireId na galaxyData.
   * Wywoływane z GameScene po GalaxyGenerator.generate / po gameState.restore.
   */
  syncToGalaxyData(galaxyData) {
    if (!galaxyData?.systems) return;
    // Najpierw wyczyść — na wypadek gdyby imperium zniknęło
    for (const sys of galaxyData.systems) {
      if (sys.empireId) sys.empireId = null;
    }
    // Rozpisz: home + colonies na galaxyData
    for (const emp of this.listAll()) {
      for (const col of emp.colonies ?? []) {
        const gs = galaxyData.systems.find(s => s.id === col.systemId);
        if (gs) gs.empireId = emp.id;
      }
      // Home też na wszelki wypadek (gdyby nie było w colonies)
      if (emp.homeSystemId) {
        const gs = galaxyData.systems.find(s => s.id === emp.homeSystemId);
        if (gs && !gs.empireId) gs.empireId = emp.id;
      }
    }
  }
}
