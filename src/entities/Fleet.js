// Fleet — encja logicznej grupy statków gracza (Player Fleet Groups, P1).
//
// To NIE jest statek — flota nie ma własnej pozycji/HP/paliwa. Pozycja = centroid
// członków, status = agregat statusów. Fleet jest podmiotem rozkazów flotowych
// (issueFleetOrder w FleetSystem fan-outuje do MOS), ale poszczególne statki
// dalej są egzekutorami ruchu.
//
// Authoritative źródło członkostwa: `memberIds[]`. `vessel.fleetId` to reactive
// in-memory mirror, odbudowywane z memberIds przy restore.

import { DEFAULT_DOCTRINE, isValidDoctrine } from '../data/FleetDoctrines.js';

let _nextFleetId = 1;

/**
 * Stwórz nową instancję Fleet.
 * @param {object} opts
 * @param {string} [opts.id]        — opcjonalnie wymuszony id (testy/restore)
 * @param {string} opts.name        — nazwa floty wybrana przez gracza
 * @param {string} [opts.doctrine]  — jedna z FLEET_DOCTRINES, domyślnie engage_in_range
 * @param {number} [opts.createdYear=0]
 * @returns {object} FleetInstance
 */
export function createFleet(opts) {
  if (!opts || typeof opts.name !== 'string' || !opts.name.trim()) {
    throw new Error('[Fleet] name jest wymagana');
  }
  const id = opts.id ?? `fleet_${_nextFleetId++}`;
  const doctrine = isValidDoctrine(opts.doctrine) ? opts.doctrine : DEFAULT_DOCTRINE;
  return {
    id,
    name: opts.name.trim(),
    doctrine,
    memberIds: [],                  // authoritative lista vesselId
    activeOrder: null,              // ustawiane przez FleetSystem.issueFleetOrder (P2)
    createdYear: opts.createdYear ?? 0,
    // autoDisbandWhenEmpty: true — stała wg decyzji gracza (plan §1.4).
    // Trzymane w polu (nie hardcoded w FleetSystem) by ewentualnie zwolnić tę
    // gwarancję per-fleet w przyszłości bez migracji.
    autoDisbandWhenEmpty: true,
  };
}

/**
 * Serializuj flotę do JSON-safe obiektu.
 */
export function serializeFleet(fleet) {
  if (!fleet) return null;
  return {
    id:                   fleet.id,
    name:                 fleet.name,
    doctrine:             fleet.doctrine,
    memberIds:            [...(fleet.memberIds ?? [])],
    activeOrder:          fleet.activeOrder ? { ..._cloneActiveOrder(fleet.activeOrder) } : null,
    createdYear:          fleet.createdYear ?? 0,
    autoDisbandWhenEmpty: fleet.autoDisbandWhenEmpty !== false,
  };
}

/**
 * Restore flotę z serialized obiektu (bez walidacji członków — to robi FleetSystem.restore).
 */
export function restoreFleet(data) {
  if (!data || !data.id) return null;
  return {
    id:                   data.id,
    name:                 data.name ?? data.id,
    doctrine:             isValidDoctrine(data.doctrine) ? data.doctrine : DEFAULT_DOCTRINE,
    memberIds:            Array.isArray(data.memberIds) ? [...data.memberIds] : [],
    activeOrder:          data.activeOrder ? _cloneActiveOrder(data.activeOrder) : null,
    createdYear:          data.createdYear ?? 0,
    autoDisbandWhenEmpty: data.autoDisbandWhenEmpty !== false,
  };
}

function _cloneActiveOrder(ao) {
  const clone = { ...ao };
  if (ao.targetPoint)    clone.targetPoint    = { ...ao.targetPoint };
  if (ao.memberOrderIds) clone.memberOrderIds = { ...ao.memberOrderIds };
  return clone;
}

// ── ID counter (save/restore) ────────────────────────────────────────────────

export function getNextFleetId() {
  return _nextFleetId;
}

export function setNextFleetId(n) {
  _nextFleetId = Math.max(1, Math.floor(n) || 1);
}
