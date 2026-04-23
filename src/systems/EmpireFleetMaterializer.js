// EmpireFleetMaterializer — "strength → vessels" (shadow fleet, Alt D z design doca §7).
//
// Abstract fleet (w EmpireRegistry) ma strength. Gdy zbliża się do sys_home,
// my materializujemy ją na konkretne vessele w VesselManager; strength → 0.
// Straty vesseli zmniejszają fleet.materializedVesselIds; gdy pusto → destroyFleet.
//
// Triggery w M1 (§7.1): TYLKO fleet.destSystemId === 'sys_home' i
// (etaYear - gameYear) ≤ 2 civYears. Inne przypadki abstract-only.
//
// Budżety:
//   MAX_MATERIALIZE_PER_TICK=2 (ile flot per tick)
//   MAX_MATERIALIZED_VESSELS_PER_FLEET=8 (cap per-flota w FleetCompositionPolicy)
//   MAX_TOTAL_MATERIALIZED_VESSELS=40 (soft global cap, odracza materializację)
//
// Feature flag GAME_CONFIG.FEATURES.fleetMaterialization sterowany z GameScene.

import EventBus    from '../core/EventBus.js';
import gameState   from '../core/GameState.js';
import { createVessel } from '../entities/Vessel.js';
import { composeFromStrength } from '../data/FleetCompositionPolicy.js';

const MAX_MATERIALIZE_PER_TICK       = 2;
const MAX_TOTAL_MATERIALIZED_VESSELS = 40;
const ETA_WINDOW_CIV_YEARS           = 2;

export class EmpireFleetMaterializer {
  /**
   * @param {VesselManager} vesselManager
   * @param {EmpireRegistry} empireRegistry
   */
  constructor(vesselManager, empireRegistry) {
    if (!vesselManager) throw new Error('[EmpireFleetMaterializer] vesselManager wymagany');
    this._vm = vesselManager;
    this._er = empireRegistry ?? null;

    /** @type {Map<string, {empireId, fleetId}>} */
    this._pending = new Map();

    this._totalMaterialized = 0;

    this._onFleetMoved    = (e) => this._onFleetMovedHandler(e);
    this._onVesselWrecked = (e) => this._onVesselWreckedHandler(e);
    this._onTick          = (e) => this._onTickHandler(e);

    EventBus.on('empire:fleetMoved', this._onFleetMoved);
    EventBus.on('vessel:wrecked',    this._onVesselWrecked);
    EventBus.on('time:tick',         this._onTick);

    // Po load — zlicz już istniejące materializedVesselIds (soft cap correctness).
    this._rebuildMaterializedCount();
  }

  _rebuildMaterializedCount() {
    this._totalMaterialized = 0;
    const empires = gameState.get('empires') ?? {};
    for (const emp of Object.values(empires)) {
      for (const fleet of (emp.fleets ?? [])) {
        if (Array.isArray(fleet.materializedVesselIds)) {
          this._totalMaterialized += fleet.materializedVesselIds.length;
        }
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Ręczne wywołanie materializacji (debug / cheat).
   * @returns {{ vesselIds: string[], strengthConsumed: number }}
   */
  materializeFleet(empireId, fleetId, opts = {}) {
    const emp = gameState.get(`empires.${empireId}`);
    if (!emp) return { vesselIds: [], strengthConsumed: 0 };
    const fleet = emp.fleets?.find(f => f.id === fleetId);
    if (!fleet) return { vesselIds: [], strengthConsumed: 0 };
    if (fleet.materializationState === 'full') {
      console.warn(`[EmpireFleetMaterializer] ${fleetId} już materialized`);
      return { vesselIds: [], strengthConsumed: 0 };
    }

    const vesselDefs = composeFromStrength(fleet.strength ?? 0, emp);
    if (vesselDefs.length === 0) return { vesselIds: [], strengthConsumed: 0 };

    const strengthConsumed = fleet.strength ?? 0;
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    // Spawn pozycja: blisko homePlanet gracza (wrogie floty trafiają na orbitę).
    //   Jeśli homePlanet brak (edge case) — użyj 0,0 z offset.
    const homePlanet = window.KOSMOS?.homePlanet;
    const spawnBaseX = homePlanet?.x ?? 0;
    const spawnBaseY = homePlanet?.y ?? 0;
    const spawnSysId = homePlanet?.systemId ?? 'sys_home';

    const vesselIds = [];
    for (let i = 0; i < vesselDefs.length; i++) {
      const def = vesselDefs[i];
      // Offset w promieniu ~100 px (deterministyczny wg index — żeby test powtarzalny).
      const angle = (i / vesselDefs.length) * Math.PI * 2;
      const r = 80;
      const sx = spawnBaseX + Math.cos(angle) * r;
      const sy = spawnBaseY + Math.sin(angle) * r;

      let vessel;
      try {
        vessel = createVessel(def.hullId, homePlanet?.id ?? 'sys_home', {
          modules:  def.modules,
          x: sx, y: sy,
          systemId: spawnSysId,
          name:     `${emp.namePL ?? emp.name ?? 'Alien'} ${def.role} ${i + 1}`,
        });
      } catch (e) {
        console.warn(`[EmpireFleetMaterializer] createVessel fail dla ${def.hullId}:`, e.message);
        continue;
      }
      vessel.ownerEmpireId = empireId;
      vessel.owner         = empireId;
      vessel.isEnemy       = true;
      vessel.position.state    = 'orbiting';
      vessel.position.dockedAt = null;
      vessel.status            = 'idle';

      this._vm._vessels.set(vessel.id, vessel);
      vesselIds.push(vessel.id);

      EventBus.emit('vessel:created',  { vessel });
      EventBus.emit('vessel:launched', { vessel });
    }

    if (vesselIds.length === 0) {
      console.warn(`[EmpireFleetMaterializer] Fleet ${fleetId} — nie udało się stworzyć ani jednego vessela`);
      return { vesselIds: [], strengthConsumed: 0 };
    }

    // Update fleet state w gameState (immutable via EmpireRegistry style — set całej fleets[]).
    const fleets = [...(emp.fleets ?? [])];
    const idx = fleets.findIndex(f => f.id === fleetId);
    fleets[idx] = {
      ...fleets[idx],
      materializedVesselIds: vesselIds,
      materializationState:  'full',
      lastMaterializedAt:    gameYear,
      strength:              0,  // full consumption — §7.3
    };
    gameState.set(`empires.${empireId}.fleets`, fleets, 'fleet_materialized');

    this._totalMaterialized += vesselIds.length;

    EventBus.emit('empire:fleetMaterialized', {
      empireId, fleetId, vesselIds, strengthConsumed,
    });
    EventBus.emit('vessel:positionUpdate', { vessels: vesselIds.map(id => this._vm.getVessel(id)).filter(Boolean) });

    return { vesselIds, strengthConsumed };
  }

  /**
   * Dematerializuj flotę (gdy wszystkie vessele zginęły lub force-cleanup).
   */
  dematerializeFleet(empireId, fleetId, reason = 'all_vessels_lost') {
    const emp = gameState.get(`empires.${empireId}`);
    if (!emp) return;
    const fleet = emp.fleets?.find(f => f.id === fleetId);
    if (!fleet) return;

    // Oddaj budżet global cap
    this._totalMaterialized = Math.max(0, this._totalMaterialized - (fleet.materializedVesselIds?.length ?? 0));

    const fleets = (emp.fleets ?? []).filter(f => f.id !== fleetId);
    gameState.set(`empires.${empireId}.fleets`, fleets, `fleet_dematerialized_${reason}`);

    EventBus.emit('empire:fleetDematerialized', { empireId, fleetId, reason });

    // Także trigger destroyFleet na EmpireRegistry (spójność z istniejącym pipeline).
    this._er?.destroyFleet?.(empireId, fleetId, reason);
  }

  destroy() {
    EventBus.off('empire:fleetMoved', this._onFleetMoved);
    EventBus.off('vessel:wrecked',    this._onVesselWrecked);
    EventBus.off('time:tick',         this._onTick);
    this._pending.clear();
  }

  // ── Handlers ────────────────────────────────────────────────

  /**
   * Flota ruszyła do sys_home i ETA blisko → dodaj do pending.
   * W _onTickHandler per tick budget budgetuje realną materializację.
   */
  _onFleetMovedHandler({ empireId, fleetId, destSystemId, etaYear }) {
    if (destSystemId !== 'sys_home') return;
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    if (etaYear != null && (etaYear - gameYear) > ETA_WINDOW_CIV_YEARS) {
      // Za wcześnie — NIE dodajemy do pending; _onTick sprawdzi ponownie gdy ETA się zbliży.
      // Alternatywa: dodać i odrzucać w _shouldMaterialize. Prościej — wait for closer.
      return;
    }
    this._pending.set(`${empireId}:${fleetId}`, { empireId, fleetId });
  }

  _onTickHandler({ civDeltaYears }) {
    if (!civDeltaYears || civDeltaYears <= 0) return;
    if (this._pending.size === 0) return;

    let budget = MAX_MATERIALIZE_PER_TICK;
    for (const [key, { empireId, fleetId }] of [...this._pending]) {
      if (budget <= 0) break;

      // Check czy flota istnieje i wciąż powinna być materialized
      const emp = gameState.get(`empires.${empireId}`);
      const fleet = emp?.fleets?.find(f => f.id === fleetId);
      if (!fleet) {
        this._pending.delete(key);  // flota zniknęła
        continue;
      }
      if (fleet.materializationState !== 'abstract') {
        this._pending.delete(key);
        continue;
      }
      // Global cap — odrocz jeśli pełno.
      if (this._totalMaterialized >= MAX_TOTAL_MATERIALIZED_VESSELS) {
        // Zostaw w pending, spróbuj ponownie w kolejnym tick (gdy wraki się posprzątają).
        continue;
      }

      this.materializeFleet(empireId, fleetId);
      this._pending.delete(key);
      budget--;
    }
  }

  /**
   * Vessel wrecked — jeśli należy do materialized fleet, update lub destroy.
   */
  _onVesselWreckedHandler({ vessel }) {
    if (!vessel?.ownerEmpireId) return;

    const empireId = vessel.ownerEmpireId;
    const emp = gameState.get(`empires.${empireId}`);
    if (!emp?.fleets) return;

    for (const fleet of emp.fleets) {
      if (!Array.isArray(fleet.materializedVesselIds)) continue;
      const idx = fleet.materializedVesselIds.indexOf(vessel.id);
      if (idx < 0) continue;

      // Usuń vesselId z fleet.materializedVesselIds (immutable update).
      const fleets = [...(emp.fleets ?? [])];
      const fidx = fleets.findIndex(f => f.id === fleet.id);
      const newIds = [...fleet.materializedVesselIds];
      newIds.splice(idx, 1);
      fleets[fidx] = { ...fleets[fidx], materializedVesselIds: newIds };
      gameState.set(`empires.${empireId}.fleets`, fleets, 'fleet_vessel_lost');

      this._totalMaterialized = Math.max(0, this._totalMaterialized - 1);

      EventBus.emit('empire:fleetMaterializedVesselLost', {
        empireId, fleetId: fleet.id, vesselId: vessel.id,
        remainingStrength: 0,  // M1: strength już 0 po full materialization
      });

      // Gdy flota pusta i była 'full' → destroyFleet.
      if (newIds.length === 0 && fleets[fidx].materializationState === 'full') {
        this.dematerializeFleet(empireId, fleet.id, 'all_vessels_lost');
      }
      return;
    }
  }
}
