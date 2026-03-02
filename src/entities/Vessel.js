// Vessel — instancja statku kosmicznego
//
// Każdy statek zbudowany w Stoczni staje się indywidualnym obiektem
// z unikalnym ID, nazwą, pozycją, paliwem i statusem misji.
//
// Pozycja: x,y w px (jak CelestialBody — physics coords, 1 AU = AU_TO_PX px)
// State:   'docked' | 'in_transit' | 'orbiting'
// Status:  'idle' | 'on_mission' | 'refueling' | 'damaged'

import { SHIPS } from '../data/ShipsData.js';
import { getNextName } from '../data/VesselNames.js';

let _nextVesselId = 1;

/**
 * Stwórz nową instancję statku.
 * @param {string} shipId — typ z ShipsData ('science_vessel', 'cargo_ship', ...)
 * @param {string} colonyId — id kolonii macierzystej (planetId)
 * @param {object} [opts] — opcjonalne: name, x, y, fuel
 * @returns {object} VesselInstance
 */
export function createVessel(shipId, colonyId, opts = {}) {
  const ship = SHIPS[shipId];
  if (!ship) throw new Error(`[Vessel] Nieznany typ statku: ${shipId}`);

  const id = `v_${_nextVesselId++}`;
  const name = opts.name || getNextName(shipId);

  // Pozycja startowa = pozycja kolonii macierzystej
  const x = opts.x ?? 0;
  const y = opts.y ?? 0;

  // Paliwo — pełny bak domyślnie
  const fuelMax = ship.fuelCapacity ?? 8;
  const fuelCurrent = opts.fuel ?? fuelMax;

  return {
    id,
    shipId,
    name,
    colonyId,

    // Pozycja fizyczna w układzie (px, jak entity.x/y)
    position: {
      x,
      y,
      state: 'docked',    // 'docked' | 'in_transit' | 'orbiting'
      dockedAt: colonyId,  // id ciała gdy docked/orbiting
    },

    // Paliwo (Tier 1: power_cells)
    fuel: {
      current: fuelCurrent,
      max: fuelMax,
      consumption: ship.fuelPerAU ?? 0.5, // power_cells / AU
    },

    // Misja (null gdy w hangarze)
    mission: null,

    // Stan statku
    status: 'idle', // 'idle' | 'on_mission' | 'refueling' | 'damaged'

    // Doświadczenie (przyszłość — weteran = bonus)
    experience: 0,
  };
}

// ── Metody operujące na instancji vessel ─────────────────────────────────────

/**
 * Efektywny zasięg statku (AU) na aktualnym paliwie.
 */
export function effectiveRange(vessel) {
  if (!vessel.fuel.consumption || vessel.fuel.consumption <= 0) return Infinity;
  return vessel.fuel.current / vessel.fuel.consumption;
}

/**
 * Czy statek może dotrzeć na odległość distAU (w jedną stronę)?
 */
export function canReach(vessel, distAU) {
  return effectiveRange(vessel) >= distAU;
}

/**
 * Zużyj paliwo na podróż o distAU.
 * @returns {number} faktycznie zużyte paliwo
 */
export function consumeFuel(vessel, distAU) {
  const cost = distAU * vessel.fuel.consumption;
  const used = Math.min(cost, vessel.fuel.current);
  vessel.fuel.current = Math.max(0, vessel.fuel.current - used);
  return used;
}

/**
 * Zatankuj statek o amount power_cells (nie przekroczy max).
 * @returns {number} faktycznie zatankowane
 */
export function refuel(vessel, amount) {
  const space = vessel.fuel.max - vessel.fuel.current;
  const added = Math.min(amount, space);
  vessel.fuel.current += added;
  return added;
}

/**
 * Czy statek wymaga tankowania (nie pełny bak)?
 */
export function needsRefuel(vessel) {
  return vessel.fuel.current < vessel.fuel.max;
}

/**
 * Pobierz definicję typu statku z ShipsData.
 */
export function getShipDef(vessel) {
  return SHIPS[vessel.shipId] ?? null;
}

// ── Zarządzanie ID ───────────────────────────────────────────────────────────

/**
 * Ustaw następny ID (przy restore ze save).
 */
export function setNextVesselId(id) {
  _nextVesselId = id;
}

/**
 * Pobierz aktualny nextId (do serializacji).
 */
export function getNextVesselId() {
  return _nextVesselId;
}
