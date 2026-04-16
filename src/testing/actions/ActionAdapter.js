// ═══════════════════════════════════════════════════════════════
// ActionAdapter — tłumaczy abstrakcyjną akcję botową na EventBus.emit
// ─────────────────────────────────────────────────────────────
// Akcja ma format: { type: '<typ>', ...payload }
// ActionAdapter.execute(action) emituje odpowiedni event KOSMOS'a.
// Zwraca { emitted: boolean, event: string, reason?: string }
// ═══════════════════════════════════════════════════════════════

import EventBus from '../../core/EventBus.js';

export const ACTION_TYPES = {
  BUILD:         'build',
  UPGRADE:       'upgrade',
  DEMOLISH:      'demolish',
  RESEARCH:      'research',
  EXPEDITION:    'expedition',
  BUILD_SHIP:    'buildShip',
  FACTORY_ENQUEUE: 'factoryEnqueue',
  FACTORY_DEQUEUE: 'factoryDequeue',
  FACTORY_SET_MODE: 'factorySetMode',
  WAIT:          'wait',
};

/** Emit akcję jako EventBus event. Zwraca metadane. */
export function execute(action) {
  if (!action || !action.type) return { emitted: false, reason: 'no_type' };

  switch (action.type) {
    case ACTION_TYPES.BUILD:
      if (!action.tile || !action.buildingId) return { emitted: false, reason: 'missing_tile_or_building' };
      EventBus.emit('planet:buildRequest', { tile: action.tile, buildingId: action.buildingId });
      return { emitted: true, event: 'planet:buildRequest' };

    case ACTION_TYPES.UPGRADE:
      if (!action.tile) return { emitted: false, reason: 'missing_tile' };
      EventBus.emit('planet:upgradeRequest', { tile: action.tile });
      return { emitted: true, event: 'planet:upgradeRequest' };

    case ACTION_TYPES.DEMOLISH:
      if (!action.tile) return { emitted: false, reason: 'missing_tile' };
      EventBus.emit('planet:demolishRequest', { tile: action.tile });
      return { emitted: true, event: 'planet:demolishRequest' };

    case ACTION_TYPES.RESEARCH:
      if (!action.techId) return { emitted: false, reason: 'missing_tech' };
      EventBus.emit('tech:researchRequest', { techId: action.techId });
      return { emitted: true, event: 'tech:researchRequest' };

    case ACTION_TYPES.EXPEDITION:
      if (!action.missionType || !action.targetId) return { emitted: false, reason: 'missing_expedition_args' };
      EventBus.emit('expedition:sendRequest', {
        type: action.missionType,
        targetId: action.targetId,
        vesselId: action.vesselId ?? null,
        cargo: action.cargo ?? null,
      });
      return { emitted: true, event: 'expedition:sendRequest' };

    case ACTION_TYPES.BUILD_SHIP:
      if (!action.shipId) return { emitted: false, reason: 'missing_ship' };
      EventBus.emit('fleet:buildRequest', {
        shipId: action.shipId,
        modules: action.modules ?? [],
        planetId: action.planetId ?? window.KOSMOS?.homePlanet?.id,
      });
      return { emitted: true, event: 'fleet:buildRequest' };

    case ACTION_TYPES.FACTORY_ENQUEUE:
      if (!action.commodityId) return { emitted: false, reason: 'missing_commodity' };
      EventBus.emit('factory:enqueue', {
        commodityId: action.commodityId,
        qty: action.qty ?? 1,
      });
      return { emitted: true, event: 'factory:enqueue' };

    case ACTION_TYPES.FACTORY_DEQUEUE:
      EventBus.emit('factory:dequeue', { index: action.index ?? 0 });
      return { emitted: true, event: 'factory:dequeue' };

    case ACTION_TYPES.FACTORY_SET_MODE:
      if (!action.mode) return { emitted: false, reason: 'missing_mode' };
      EventBus.emit('factory:setMode', { mode: action.mode });
      return { emitted: true, event: 'factory:setMode' };

    case ACTION_TYPES.WAIT:
      return { emitted: true, event: null, noop: true };

    default:
      return { emitted: false, reason: `unknown_action_type: ${action.type}` };
  }
}

export default { execute, ACTION_TYPES };
