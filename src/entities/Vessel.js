// Vessel — instancja statku kosmicznego
//
// Każdy statek zbudowany w Stoczni staje się indywidualnym obiektem
// z unikalnym ID, nazwą, pozycją, paliwem i statusem misji.
//
// Pozycja: x,y w px (jak CelestialBody — physics coords, 1 AU = AU_TO_PX px)
// State:   'docked' | 'in_transit' | 'orbiting'
// Status:  'idle' | 'on_mission' | 'refueling' | 'damaged'

import { SHIPS } from '../data/ShipsData.js';
import { calcShipStats } from '../data/ShipModulesData.js';
import { getNextName } from '../data/VesselNames.js';
import EntityManager from '../core/EntityManager.js';

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

  // Oblicz statystyki z kadłuba + modułów (uwzględnia masę)
  const modules = opts.modules || [];
  const stats = modules.length > 0
    ? calcShipStats(ship, modules)
    : null;

  // Paliwo — pełny bak domyślnie
  const fuelMax = opts.fuelMax ?? (stats?.fuelCapacity ?? ship.fuelCapacity ?? 8);
  const fuelCurrent = opts.fuel ?? fuelMax;
  const fuelPerAU = opts.fuelPerAU ?? (stats?.fuelPerAU ?? ship.fuelPerAU ?? 0.5);
  const fuelType = opts.fuelType ?? (stats?.fuelType ?? ship.fuelType ?? 'power_cells');
  const speedAU = opts.speedAU ?? (stats?.speed ?? ship.speedAU ?? ship.baseSpeedAU ?? 1.0);
  const cargoMax = opts.cargoMax ?? (stats?.cargo ?? ship.cargoCapacity ?? ship.baseCargoCapacity ?? 0);
  const totalMass = stats?.totalMass ?? (ship.baseMass ?? 30);

  // Sprawdź systemId z encji kolonii lub z aktywnego układu
  const entity = EntityManager.get(colonyId);
  const systemId = opts.systemId ?? entity?.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home';

  return {
    id,
    shipId,
    name,
    colonyId,
    homeColonyId: colonyId, // kolonia macierzysta (stała — nie zmienia się przy relokacji)
    systemId,               // układ gwiezdny w którym jest statek

    // Pozycja fizyczna w układzie (px, jak entity.x/y)
    position: {
      x,
      y,
      state: 'docked',    // 'docked' | 'in_transit' | 'orbiting'
      dockedAt: colonyId,  // id ciała gdy docked/orbiting
    },

    // Moduły zainstalowane na statku (lista ID z ShipModulesData)
    modules,

    // Generacja i typ paliwa (z modułów lub kadłuba)
    generation: ship.generation ?? 1,
    fuelType,

    // Masa statku (kadłub + moduły)
    totalMass,

    // Paliwo (obliczone z kadłuba + modułów + masa)
    fuel: {
      current: fuelCurrent,
      max: fuelMax,
      consumption: fuelPerAU,
      fuelType,
    },

    // Prędkość (AU/rok) — z kadłuba + modułów + masa
    speedAU,

    // Ładowność (tony) — z modułów
    cargoMax,

    // Misja (null gdy w hangarze)
    mission: null,

    // Stan statku
    status: 'idle', // 'idle' | 'on_mission' | 'refueling' | 'damaged'

    // Cargo — towary na pokładzie (commodityId → ilość sztuk)
    cargo: {},
    cargoUsed: 0, // tony (suma weight × qty)

    // Koloniści na pokładzie (POPy, osobne od cargo)
    colonists: 0,

    // Automatyzacja zachowań
    automation: {
      autoReturn: false,  // auto-powrót po zakończeniu misji
      autoRefuel: true,   // auto-tankowanie w hangarze
    },

    // Dziennik misji (max 20 wpisów, ring buffer)
    missionLog: [],

    // Statystyki statku
    stats: {
      distanceTraveled: 0, // AU
      missionsComplete: 0,
      resourcesHauled: 0,
      bodiesSurveyed: 0,
    },

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

// ── Dziennik misji ───────────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 20;

/**
 * Dodaj wpis do dziennika misji statku.
 * @param {object} vessel — instancja statku
 * @param {number} year — rok gry
 * @param {string} text — treść wpisu
 * @param {string} [type='info'] — typ: 'info'|'success'|'warning'|'danger'
 */
export function addMissionLog(vessel, year, text, type = 'info') {
  vessel.missionLog.push({ year, text, type });
  if (vessel.missionLog.length > MAX_LOG_ENTRIES) {
    vessel.missionLog = vessel.missionLog.slice(-MAX_LOG_ENTRIES);
  }
}

// ── Cargo ────────────────────────────────────────────────────────────────────

import { COMMODITIES } from '../data/CommoditiesData.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';

// Pobierz wagę towaru/surowca
function _getWeight(id) {
  return COMMODITIES[id]?.weight ?? MINED_RESOURCES[id]?.weight ?? HARVESTED_RESOURCES[id]?.weight ?? 1;
}

// Pobierz ilość z ResourceSystem (inventory Map) lub plain object
function _getAvailable(resSys, id) {
  if (resSys?.inventory instanceof Map) return resSys.inventory.get(id) ?? 0;
  if (resSys?.inventory) return resSys.inventory[id] ?? 0;
  return resSys?.get?.(id) ?? resSys?.[id] ?? 0;
}

/**
 * Załaduj towar na statek z inventory kolonii (ResourceSystem).
 * @param {object} vessel — instancja statku
 * @param {string} commodityId — id towaru lub surowca
 * @param {number} qty — żądana ilość
 * @param {object} resSys — ResourceSystem kolonii (ma spend/receive/inventory Map)
 * @returns {number} faktycznie załadowana ilość
 */
export function loadCargo(vessel, commodityId, qty, resSys) {
  const ship = SHIPS[vessel.shipId];
  // Użyj vessel.cargoMax (obliczone z modułów+masy) z fallbackiem na SHIPS
  const capacity = vessel.cargoMax ?? ship?.cargoCapacity ?? 0;
  if (qty <= 0 || capacity <= 0) return 0;

  const weight = _getWeight(commodityId);
  const freeSpace = capacity - (vessel.cargoUsed ?? 0);
  const maxBySpace = Math.floor(freeSpace / weight);
  const available = Math.floor(_getAvailable(resSys, commodityId));
  const actual = Math.min(qty, maxBySpace, available);
  if (actual <= 0) return 0;

  // Zabierz z inventory kolonii
  if (resSys?.spend) {
    resSys.spend({ [commodityId]: actual });
  }

  // Dodaj do cargo statku
  vessel.cargo[commodityId] = (vessel.cargo[commodityId] ?? 0) + actual;
  vessel.cargoUsed = (vessel.cargoUsed ?? 0) + actual * weight;

  return actual;
}

/**
 * Rozładuj towar ze statku do inventory kolonii (ResourceSystem).
 * @returns {number} faktycznie rozładowana ilość
 */
export function unloadCargo(vessel, commodityId, qty, resSys) {
  if (qty <= 0) return 0;

  const have = vessel.cargo[commodityId] ?? 0;
  const actual = Math.min(qty, have);
  if (actual <= 0) return 0;

  const weight = _getWeight(commodityId);

  // Dodaj do inventory kolonii
  if (resSys?.receive) {
    resSys.receive({ [commodityId]: actual });
  }

  // Zdejmij z cargo statku
  vessel.cargo[commodityId] -= actual;
  if (vessel.cargo[commodityId] <= 0) delete vessel.cargo[commodityId];
  vessel.cargoUsed = Math.max(0, (vessel.cargoUsed ?? 0) - actual * weight);

  return actual;
}

// ── Koloniści ─────────────────────────────────────────────────────────────────

/**
 * Załaduj kolonistów na statek (zablokuj POPy w kolonii źródłowej).
 * @param {object} vessel
 * @param {number} count — ile POPów załadować
 * @param {object} civSystem — CivilizationSystem kolonii źródłowej
 * @returns {number} faktycznie załadowanych
 */
export function loadColonists(vessel, count, civSystem) {
  if (count <= 0 || !civSystem) return 0;
  const cap = vessel.colonistCapacity ?? 0;
  const actual = Math.min(count, cap - (vessel.colonists ?? 0));
  if (actual <= 0) return 0;

  civSystem.lockPops?.(actual, 'colonist');
  vessel.colonists = (vessel.colonists ?? 0) + actual;
  return actual;
}

/**
 * Rozładuj kolonistów do kolonii docelowej.
 * @param {object} vessel
 * @param {object} civSystem — CivilizationSystem kolonii docelowej (null = POPy tracone)
 * @returns {number} rozładowanych
 */
export function unloadColonists(vessel, civSystem) {
  const count = vessel.colonists ?? 0;
  if (count <= 0) return 0;

  if (civSystem?.immigrate) {
    // Dodaj POPy do kolonii docelowej
    civSystem.immigrate({ colonists: count });
  } else if (civSystem?.unlockPops) {
    civSystem.unlockPops(count, 'colonist');
  }
  vessel.colonists = 0;
  return count;
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
