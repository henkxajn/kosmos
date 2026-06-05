// Vessel — instancja statku kosmicznego
//
// Każdy statek zbudowany w Stoczni staje się indywidualnym obiektem
// z unikalnym ID, nazwą, pozycją, paliwem i statusem misji.
//
// Pozycja: x,y w px (jak CelestialBody — physics coords, 1 AU = AU_TO_PX px)
// State:   'docked' | 'in_transit' | 'orbiting'
// Status:  'idle' | 'on_mission' | 'refueling' | 'damaged'

import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipStats, getModuleCapabilities, SHIP_MODULES } from '../data/ShipModulesData.js';
import { getNextName } from '../data/VesselNames.js';
import { getTransportSize } from '../data/unitArchetypes.js';
import EntityManager from '../core/EntityManager.js';

let _nextVesselId = 1;

// Endurance baseline per rola (Milestone 1 — stub).
// Uwaga: cyfry są placeholderami; prawdziwy balans + pursuit multiplier w M2.
//   drain: ubytek endurance per civYear (jednostki CIV_TIME_SCALE).
//   regen: odzysk per civYear gdy docked.
const _ENDURANCE_DEFAULTS = {
  warship:   { drain: 2, regen: 20 },
  assault:   { drain: 2, regen: 20 },
  transport: { drain: 2, regen: 20 },
  cargo:     { drain: 2, regen: 20 },
  colony:    { drain: 2, regen: 20 },
  science:   { drain: 1, regen: 20 },
  scout:     { drain: 1, regen: 20 },
  default:   { drain: 2, regen: 20 },
};

// Legacy shipId → rola (dla starych statków bez modułów).
const _LEGACY_SHIP_ROLE = {
  science_vessel: 'science',
  cargo_ship:     'cargo',
  colony_ship:    'colony',
};

/**
 * Zwraca baseline endurance drain/regen (AU/civYear) dla vessela.
 * Używane w createVessel() oraz w VesselManager.restore() — drain/regen
 * nie są serializowane, tylko odtwarzane z modułów/kadłuba.
 *
 * TODO M2: getEnduranceDefaults(vessel) → odczyt z hull.enduranceSpec + modułów
 *   (reactor_core, life_support, etc.). Pursuit multiplier także w M2.
 * @param {object} vessel — instancja lub obiekt z polami modules/shipId
 * @returns {{ drain: number, regen: number }}
 */
export function getEnduranceDefaults(vessel) {
  let role;
  if (Array.isArray(vessel?.modules) && vessel.modules.length > 0) {
    role = _primaryRoleForModules(vessel.modules);
  } else {
    role = _LEGACY_SHIP_ROLE[vessel?.shipId] ?? 'default';
  }
  return _ENDURANCE_DEFAULTS[role] ?? _ENDURANCE_DEFAULTS.default;
}

// Primary role dla listy moduli — używane przy auto-naming (przed zbudowaniem vessel instance).
function _primaryRoleForModules(moduleIds) {
  let hasColony = false, hasTroop = false, hasDropPods = false;
  let hasWeapon = false, hasScience = false, hasCargo = false;
  for (const id of moduleIds) {
    const m = SHIP_MODULES[id];
    if (!m) continue;
    if (id === 'habitat_pod' || id === 'cryo_pod') hasColony = true;
    if (m.stats?.troopCapacity > 0) hasTroop = true;
    if (m.stats?.enablesPlanetLanding) hasDropPods = true;
    if (m.slotType === 'weapon') hasWeapon = true;
    if (id === 'science_lab' || id === 'deep_scanner' || id === 'quantum_scanner') hasScience = true;
    if (m.stats?.cargoAdd > 0) hasCargo = true;
  }
  if (hasColony) return 'colony';
  if (hasTroop && hasWeapon) return 'assault';
  if (hasTroop) return 'transport';
  if (hasWeapon) return 'warship';
  if (hasScience) return 'science';
  if (hasCargo) return 'cargo';
  return 'scout';
}

/**
 * Stwórz nową instancję statku.
 * @param {string} shipId — typ z ShipsData ('science_vessel', 'cargo_ship', ...)
 * @param {string} colonyId — id kolonii macierzystej (planetId)
 * @param {object} [opts] — opcjonalne: name, x, y, fuel
 * @returns {object} VesselInstance
 */
export function createVessel(shipId, colonyId, opts = {}) {
  const ship = SHIPS[shipId] ?? HULLS[shipId];
  if (!ship) throw new Error(`[Vessel] Nieznany typ statku: ${shipId}`);

  const id = `v_${_nextVesselId++}`;

  // Auto-nazwa: capability-based (rola z modułów) gdy modules podane, legacy pool dla starych typów
  let name = opts.name;
  if (!name) {
    if (opts.modules?.length > 0 && HULLS[shipId]) {
      name = getNextName(`role_${_primaryRoleForModules(opts.modules)}`);
    } else {
      name = getNextName(shipId);
    }
  }

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
  const fuelType = opts.fuelType ?? (stats?.fuelType ?? ship.fuelType ?? 'fuel');
  // S3.0b S1: bak warp (warp_cores) — max>0 tylko gdy statek ma moduł Komora Warp (warpCapacityAdd).
  //   Nowy statek startuje PUSTY (warp_cores drogie — tankuje z kolonii przez _tickRefueling).
  const warpFuelMax     = opts.warpFuelMax     ?? (stats?.warpFuelCapacity ?? 0);
  const warpFuelPerLY   = opts.warpFuelPerLY   ?? (stats?.fuelPerLY ?? 0);
  const warpFuelCurrent = opts.warpFuelCurrent ?? 0;
  const speedAU = opts.speedAU ?? (stats?.speed ?? ship.speedAU ?? ship.baseSpeedAU ?? 1.0);
  const cargoMax = opts.cargoMax ?? (stats?.cargo ?? ship.cargoCapacity ?? ship.baseCargoCapacity ?? 0);
  const totalMass = stats?.totalMass ?? (ship.baseMass ?? 30);

  // Troop transport + orbital strike (Faza desantu)
  const troopCapacity = stats?.troopCapacity ?? 0;
  const canDropTroops = !!stats?.canDropTroops;
  const orbitalStrikeSpec = stats?.orbitalStrike ?? null;

  // Pojemność kolonistów — z modułów (habitat_pod/cryo_pod) lub legacy z SHIPS
  const colonistCapacity = opts.colonistCapacity
    ?? stats?.colonistCapacity
    ?? ship.colonistCapacity
    ?? 0;

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

    // Deep-space wrak — zamrożona pozycja (x,y) gdy vessel został zniszczony
    // poza orbitą ciała (dockedAt === null). Dla żywych vesseli i wraków
    // orbitujących ciała — null. Ustawiane przez _turnIntoWreck w M2a Commit 5.
    wreckLocation: null,

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
      fuelType,                 // S3.0b S1: po reformie ZAWSZE 'fuel' (calcShipStats nie nadpisuje już z silnika)
    },

    // S3.0b S1: NOWY bak warp_cores — paliwo skoków międzygwiezdnych (osobny dren od in-system).
    //   max>0 tylko gdy statek ma moduł Komora Warp; inaczej 0 → nie skacze.
    warpFuel: {
      current: warpFuelCurrent,
      max: warpFuelMax,
      consumption: warpFuelPerLY,   // warp_cores / LY (z silnika warp)
      fuelType: 'warp_cores',
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
    colonistCapacity,

    // Troop transport (Faza desantu) — jednostki naziemne w ładowni
    groundUnits: [],              // [unitId] — przechowywane w GroundUnitManager z transportStatus='loaded'
    troopCapacity,                // pojemność z modułów (Σ troop_bay_*.troopCapacity)
    troopBayUsed: 0,              // suma transportSize załadowanych jednostek
    canDropTroops,                // flag z modułu drop_pods

    // Orbital strike (Faza desantu) — bateria bombardowania orbitalnego
    // null gdy brak modułu, inaczej { damage, cooldownYears, ammoCapacity, ammoType, ammoCurrent, cooldownUntilYear }
    orbitalStrike: orbitalStrikeSpec ? {
      ...orbitalStrikeSpec,
      ammoCurrent: 0,
      cooldownUntilYear: 0,
    } : null,

    // Automatyzacja zachowań
    automation: {
      autoReturn: false,  // auto-powrót po zakończeniu misji
      autoRefuel: true,   // auto-tankowanie w hangarze
    },

    // S3.3b-S3b — auto-tankowanie przy doku (kolonia/stacja). Default true (zero regresji); gracz
    // wyłącza per-statek dla kurierów pętli (by nie zjadały dostarczonego paliwa). Gate w _tickRefueling.
    refuelAutomatically: opts.refuelAutomatically ?? true,

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

    // ── Milestone 1 — Targeting Foundation ────────────────────────────────
    // Velocity: efektywna prędkość w AU/rok (z delty pozycji per tick).
    //   - derived state, NIE serializowane (resync przy pierwszym _updatePositions po load).
    //   - updatedYear: gameYear ostatniej aktualizacji.
    velocity: {
      vx:          0,
      vy:          0,
      updatedYear: 0,
    },

    // Endurance: stamina operacyjna (0..100%).
    //   drainPerYear/regenPerYear pochodne z roli/modułów (helper getEnduranceDefaults).
    //   current/max/lastDepleted serializowane; drain/regen odtwarzane przy restore.
    endurance: (() => {
      const d = getEnduranceDefaults({ shipId, modules });
      return {
        current:       100,
        max:           100,
        drainPerYear:  d.drain,
        regenPerYear:  d.regen,
        lastDepleted:  null,
      };
    })(),

    // MovementOrder: rozkaz ruchu militarnego (moveToPoint/pursue/intercept/patrol/escort).
    //   null = brak orderu, ruch sterowany wyłącznie przez mission (legacy path).
    movementOrder: null,

    // ── Player Fleet Groups (P1) ──────────────────────────────────────────
    // ID floty (Fleet.id) do której należy statek; null = nie zgrupowany.
    // Reactive mirror — authoritative: Fleet.memberIds[]. Ustawiane wyłącznie
    // przez FleetSystem.addMember/removeMember; ZAKAZ ręcznej mutacji.
    fleetId: null,
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

// ── Warp (skoki międzygwiezdne) — lustro helperów in-system dla baku warpFuel ──
// S3.0b S1. warpRange zwraca 0 (NIE Infinity) gdy brak silnika warp — statek bez
// napędu warp ma zerowy zasięg skoku, nie nieskończony (celowa asymetria vs effectiveRange).

export function warpRange(vessel) {
  const wf = vessel.warpFuel;
  if (!wf || !wf.consumption || wf.consumption <= 0) return 0;
  return wf.current / wf.consumption;
}

export function canJump(vessel, distLY) {
  const wf = vessel.warpFuel;
  if (!wf || wf.max <= 0 || !wf.consumption || wf.consumption <= 0) return false;
  return warpRange(vessel) >= distLY;
}

export function consumeWarpFuel(vessel, distLY) {
  const wf = vessel.warpFuel;
  if (!wf) return 0;
  const cost = distLY * (wf.consumption ?? 0);
  const used = Math.min(cost, wf.current);
  wf.current = Math.max(0, wf.current - used);
  return used;
}

export function needsWarpRefuel(vessel) {
  const wf = vessel.warpFuel;
  return !!wf && wf.max > 0 && wf.current < wf.max;
}

export function refuelWarp(vessel, amount) {
  const wf = vessel.warpFuel;
  if (!wf) return 0;
  const added = Math.min(amount, wf.max - wf.current);
  wf.current += added;
  return added;
}

/**
 * Pobierz definicję typu statku z ShipsData.
 */
export function getShipDef(vessel) {
  return SHIPS[vessel.shipId] ?? HULLS[vessel.shipId] ?? null;
}

// ── Ownership / wrogość ─────────────────────────────────────────────────────
// Jedno źródło prawdy: kto nie jest graczem, jest wrogi (w MVP brak frakcji neutralnych
// z własnymi statkami). Helper tolerancyjny — honoruje trzy pola ustawiane historycznie
// przez kod spawningu (SpawnTestEnemy.js ustawia wszystkie trzy): `isEnemy`, `owner`,
// `ownerEmpireId`. Statki gracza nie mają żadnego z tych pól → false.

export function isEnemyVessel(vessel) {
  if (!vessel) return false;
  if (vessel.isEnemy === true) return true;
  if (vessel.owner && vessel.owner !== 'player') return true;
  if (vessel.ownerEmpireId && vessel.ownerEmpireId !== 'player') return true;
  return false;
}

// ── Capability helpers (capability-based role identity) ─────────────────────
// Zastępują stare `shipId === 'colony_ship'` itd. — rola statku wynika z modułów.
// `vessel.modules` = lista ID z ShipModulesData. Legacy ships bez modules →
// fallback na flagi z SHIPS[shipId] (isColonizer, shipId === 'cargo_ship' itd.).

/**
 * Czy statek ma dany moduł (po ID)?
 */
export function hasModule(vessel, moduleId) {
  return Array.isArray(vessel?.modules) && vessel.modules.includes(moduleId);
}

/**
 * Set capabilities statku z modułów (reużywa helper z ShipModulesData).
 * Zwraca Set<string>: 'colony', 'cargo', 'survey', 'deep_scan', 'anomaly_hunt',
 * 'troop_transport', 'planet_landing', 'orbital_strike', 'warp'.
 */
export function getCapabilities(vessel) {
  if (!vessel) return new Set();
  return getModuleCapabilities(vessel.modules ?? []);
}

/**
 * Statek potrafi kolonizować — ma moduł habitacyjny + pojemność na kolonistów.
 * Legacy: SHIPS[shipId]?.isColonizer === true.
 */
export function canColonize(vessel) {
  if (!vessel) return false;
  if ((vessel.colonistCapacity ?? 0) > 0) return true;
  if (hasModule(vessel, 'habitat_pod') || hasModule(vessel, 'cryo_pod')) return true;
  // Legacy fallback
  const def = getShipDef(vessel);
  return !!def?.isColonizer;
}

/**
 * Statek potrafi wozić ładunki (ma cargo bay).
 */
export function canHaulCargo(vessel) {
  if (!vessel) return false;
  return (vessel.cargoMax ?? 0) > 0;
}

/**
 * Statek potrafi prowadzić badania (lab pokładowy / skaner).
 */
export function canDoScience(vessel) {
  if (!vessel) return false;
  if (hasModule(vessel, 'science_lab') || hasModule(vessel, 'deep_scanner') || hasModule(vessel, 'quantum_scanner')) return true;
  return getCapabilities(vessel).has('survey');
}

/**
 * Statek potrafi rozpoznanie (recon) — przynajmniej survey lub science.
 */
export function canDoRecon(vessel) {
  if (!vessel) return false;
  const caps = getCapabilities(vessel);
  if (caps.has('survey') || caps.has('deep_scan')) return true;
  return canDoScience(vessel);
}

/**
 * Statek potrafi zejść Away Team na powierzchnię.
 */
export function canDeployAwayTeam(vessel) {
  return hasModule(vessel, 'science_away_team');
}

/**
 * Statek ma broń (dowolną wieżę/wyrzutnię).
 */
export function hasWeapons(vessel) {
  if (!vessel?.modules) return false;
  for (const modId of vessel.modules) {
    const m = SHIP_MODULES[modId];
    if (m?.slotType === 'weapon') return true;
  }
  return false;
}

/**
 * Prymarna rola statku — używana do wyboru puli nazw i etykiety UI.
 * Priorytet: colony > warship(z troop_bay) > transport > warship > science > cargo > scout.
 */
export function getPrimaryRole(vessel) {
  if (!vessel) return 'scout';
  if (canColonize(vessel))                        return 'colony';
  if (vessel.canDropTroops || (vessel.troopCapacity ?? 0) > 0) {
    return hasWeapons(vessel) ? 'assault' : 'transport';
  }
  if (hasWeapons(vessel))                         return 'warship';
  if (canDoScience(vessel))                       return 'science';
  if (canHaulCargo(vessel))                       return 'cargo';
  return 'scout';
}

/**
 * Etykieta roli PL (do UI — „Statek Badawczy", „Transporter Desantowy" itd.)
 */
export function getRoleLabelPL(vessel) {
  const role = getPrimaryRole(vessel);
  switch (role) {
    case 'colony':    return 'Osadnik Kolonizacyjny';
    case 'assault':   return 'Krążownik Desantowy';
    case 'transport': return 'Transportowiec';
    case 'warship':   return 'Okręt Bojowy';
    case 'science':   return 'Statek Badawczy';
    case 'cargo':     return 'Frachtowiec';
    case 'scout':     return 'Zwiadowca';
    default:          return 'Statek';
  }
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
  const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
  // Użyj vessel.cargoMax (obliczone z modułów+masy) z fallbackiem na SHIPS/HULLS
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

// ── Ground Units (Opcja C v3) — transport freeze supply ──────────────────────

/**
 * Załaduj jednostkę naziemną do ładowni statku.
 * Ustawia `transportStatus='loaded'` — SupplyCoverageSystem pomija taką jednostkę,
 * co oznacza ZERO konsumpcji supply podczas transportu (FROZEN/hibernacja).
 *
 * Walidacja (Faza desantu):
 *  - statek musi mieć troopCapacity > 0 (moduł troop_bay_*)
 *  - transportSize jednostki + troopBayUsed ≤ troopCapacity
 *  - garrison_unit w trybie 'deployed' jest automatycznie przełączany na 'mobile'
 *    (transport wymaga trybu mobilnego — deploy następuje ręcznie po zrzucie)
 *
 * @param {object} vessel — instancja statku
 * @param {object} unit   — jednostka naziemna z GroundUnitManager
 * @returns {{ok:boolean, reason?:string}}
 */
export function loadGroundUnit(vessel, unit) {
  if (!vessel || !unit) return { ok: false, reason: 'invalid_args' };
  if (!vessel.groundUnits) vessel.groundUnits = [];

  if (vessel.groundUnits.includes(unit.id)) return { ok: false, reason: 'already_loaded' };

  const capacity = vessel.troopCapacity ?? 0;
  if (capacity <= 0) return { ok: false, reason: 'no_troop_bay' };

  const size = getTransportSize(unit.archetypeId);
  const used = vessel.troopBayUsed ?? 0;
  if (used + size > capacity) return { ok: false, reason: 'no_space' };

  // Garrison w trybie deployed → przełącz na mobile (nie transportujemy bunkra)
  if (unit.archetypeId === 'garrison_unit' && unit.deployState === 'deployed') {
    unit.deployState = 'mobile';
    unit.deployTimer = 0;
  }

  // Zapamiętaj poprzedni status żeby przywrócić przy unload
  unit.prevStatus      = unit.status ?? 'idle';
  unit.status          = 'in_cargo';
  unit.transportStatus = 'loaded';

  vessel.groundUnits.push(unit.id);
  vessel.troopBayUsed = used + size;
  return { ok: true };
}

/**
 * Rozładuj jednostkę naziemną na docelowej planecie.
 * Przywraca poprzedni status (idle/attacking/...) i czyści transportStatus.
 * Supply jednostki NIE zmienia się przez czas transportu.
 *
 * @param {object} vessel — instancja statku
 * @param {object} unit   — jednostka
 * @param {string} planetId
 * @param {number} q
 * @param {number} r
 */
export function unloadGroundUnit(vessel, unit, planetId, q, r) {
  if (!vessel || !unit) return false;

  unit.planetId = planetId ?? unit.planetId;
  if (q != null) unit.q = q;
  if (r != null) unit.r = r;

  unit.status          = unit.prevStatus ?? 'idle';
  unit.prevStatus      = null;
  unit.transportStatus = null;

  if (vessel.groundUnits) {
    vessel.groundUnits = vessel.groundUnits.filter(id => id !== unit.id);
  }
  const size = getTransportSize(unit.archetypeId);
  vessel.troopBayUsed = Math.max(0, (vessel.troopBayUsed ?? 0) - size);
  return true;
}

/**
 * Zrzut desantowy jednostki z ładowni na wrogą planetę.
 * Wymaga: canDropTroops (moduł drop_pods) + dominacji orbitalnej (sprawdza caller).
 * Garrison zostaje w trybie mobile — deploy ręczny po zrzucie (2 civY).
 *
 * @param {object} vessel
 * @param {object} unit — jednostka z groundUnits
 * @param {string} planetId — planeta docelowa
 * @param {number} q
 * @param {number} r
 * @returns {{ok:boolean, reason?:string}}
 */
export function dropTroop(vessel, unit, planetId, q, r) {
  if (!vessel || !unit) return { ok: false, reason: 'invalid_args' };
  if (!vessel.canDropTroops) return { ok: false, reason: 'no_drop_pods' };
  if (!vessel.groundUnits?.includes(unit.id)) return { ok: false, reason: 'not_loaded' };

  unloadGroundUnit(vessel, unit, planetId, q, r);
  return { ok: true };
}

/**
 * Wystrzel ostrzał orbitalny na hex docelowy.
 * Zużywa 1 orbital_shells, ustawia cooldown. Sprawdza: ammo > 0, cooldown OK.
 * Caller musi sprawdzić dominację orbitalną przed wywołaniem.
 *
 * @param {object} vessel
 * @param {number} currentYear — aktualny rok gry (do cooldownu)
 * @returns {{ok:boolean, reason?:string, damage?:number}}
 */
export function fireOrbitalStrike(vessel, currentYear) {
  const os = vessel.orbitalStrike;
  if (!os) return { ok: false, reason: 'no_battery' };
  if ((os.ammoCurrent ?? 0) <= 0) return { ok: false, reason: 'no_ammo' };
  if (currentYear < (os.cooldownUntilYear ?? 0)) return { ok: false, reason: 'cooldown' };

  os.ammoCurrent -= 1;
  os.cooldownUntilYear = currentYear + (os.cooldownYears ?? 0.5);
  return { ok: true, damage: os.damage ?? 20 };
}

/**
 * Załaduj orbital_shells z cargo kolonii do baterii.
 * @returns {number} faktycznie załadowane
 */
export function loadOrbitalShells(vessel, qty, resSys) {
  if (!vessel.orbitalStrike) return 0;
  const os = vessel.orbitalStrike;
  const space = (os.ammoCapacity ?? 10) - (os.ammoCurrent ?? 0);
  if (space <= 0 || qty <= 0) return 0;
  const available = Math.floor(_getAvailable(resSys, 'orbital_shells'));
  const actual = Math.min(qty, space, available);
  if (actual <= 0) return 0;
  if (resSys?.spend) resSys.spend({ orbital_shells: actual });
  os.ammoCurrent = (os.ammoCurrent ?? 0) + actual;
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
 * Załaduj kolonistów na statek (fizycznie usuń POPy z kolonii źródłowej).
 * Koloniści lecą na nową planetę — nie wracają do puli wolnej przez "lock".
 * @param {object} vessel
 * @param {number} count — ile POPów załadować
 * @param {object} civSystem — CivilizationSystem kolonii źródłowej
 * @returns {number} faktycznie załadowanych
 */
export function loadColonists(vessel, count, civSystem) {
  if (count <= 0 || !civSystem) return 0;
  const cap = vessel.colonistCapacity ?? 0;
  const free = Math.floor(civSystem.freePops ?? 0);
  // Limit: kapacitet statku, dostępna populacja, żądana liczba
  const actual = Math.max(0, Math.min(count, cap - (vessel.colonists ?? 0), free));
  if (actual <= 0) return 0;

  // Fizycznie usuń POPy ze źródła (najniższa satisfaction → najpierw)
  civSystem.removePop?.(null, actual);
  vessel.colonists = (vessel.colonists ?? 0) + actual;
  return actual;
}

/**
 * Rozładuj kolonistów do kolonii docelowej (dodaj jako 'laborer').
 * @param {object} vessel
 * @param {object} civSystem — CivilizationSystem kolonii docelowej (null = POPy tracone)
 * @returns {number} rozładowanych
 */
export function unloadColonists(vessel, civSystem) {
  const count = vessel.colonists ?? 0;
  if (count <= 0) return 0;

  // Dodaj POPy do kolonii docelowej jako 'laborer' (najniższa strata)
  if (civSystem?.addPop) {
    civSystem.addPop('laborer', count);
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
