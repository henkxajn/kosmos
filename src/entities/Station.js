// Station — encja stacji orbitalnej (osobny typ 'station', NIE Vessel). S3.3b-S2 fundament.
// Pozycja zarządzana przez OrbitalSpaceSystem (rola 'station' → GEO, anchored, omega=0),
// nie przez komponent Keplera (orbital = null → fizyka orbitalna jej nie tyka).
// S3.4 FAZA 1: encja rozszerzona o moduły (modules[]), populację załogi (pop) i kolejkę budowy
// modułów (pendingModuleOrders[]). popCapacity liczone DYNAMICZNIE z modułów habitat (getter).

import { CelestialBody } from './CelestialBody.js';
import { StationDepot } from './StationDepot.js';
import { STATION_MODULES } from '../data/StationModuleData.js';

export class Station extends CelestialBody {
  constructor(config) {
    super({
      ...config,
      type:         'station',
      mass:         config.mass ?? 0.0001,        // znikoma — fizyka i tak nie tyka stacji
      visualRadius: config.visualRadius || 3,
      color:        config.color || 0x44aaff,
      glowColor:    null,
    });

    // Pozycja z OrbitalSpaceSystem (sferyczne r/θ/φ), nie z komponentu Keplera.
    this.orbital = null;

    this.bodyId        = config.bodyId ?? null;        // ciało wokół którego orbituje
    this.ownerEmpireId = config.ownerEmpireId ?? 'player';
    // S3.4c (D1) — kolonia-matka (płatnik z budowy). Stampowana przy createStation / spawnStation,
    // serializowana (wzór Vessel.homeColonyId). Rozwiązanie matki dla magazynu/TC: resolveHomeColony
    // (fallbacki per-body/parent/jedyna gdy brak/nieaktualny). null = sierota → własny depot.
    this.ownerColonyId = config.ownerColonyId ?? null;
    this.tier          = config.tier ?? 1;             // tier 1 = baza (bez modułów)
    this.stationType   = config.stationType ?? 'orbital_station';
    this.createdYear   = config.createdYear ?? 0;

    // Depot paliwa (S3.3b-S3) — façade resourceSystem-podobny (fuel + warp_cores, pojemność unlimited).
    // Tankowanie statków (VesselManager._refuelTank) i ręczny rozładunek gracza (CargoLoadModal/
    // unloadCargo) operują na tym samym obiekcie przez kontrakt inventory(Map)+receive/spend/getAmount.
    // S3.4c (D2) — depot-jako-proxy: przekazujemy back-ref `this`, by depot mógł LAZY rozwiązać
    // kolonię-matkę i delegować receive/spend/getAmount/inventory do jej resourceSystem (stacja z
    // matką = wspólny magazyn). Bez matki (sierota) depot używa własnej Mapy z config.depot.
    this.depot = new StationDepot(config.depot, this);

    this.systemId      = config.systemId ?? 'sys_home';
    this.explored      = true;                          // własna stacja — zawsze „znana"

    // ── S3.4 FAZA 1 — moduły, populacja załogi, kolejka budowy modułów ────────
    // modules: lista instancji { id, moduleType, level, active } (wg planu — lista, NIE mapa).
    this.modules             = config.modules ?? [];
    // pop: aktualna załoga stacji (serializowana). popCapacity = pochodna (getter niżej).
    this.pop                 = config.pop ?? 0;
    // Kolejka budowy modułów — wzór colony.pendingStationOrders, ale trzymana NA ENCJI stacji.
    this.pendingModuleOrders = config.pendingModuleOrders ?? [];
    // S3.4 FAZA 2 — kolejka budowy statków w stoczni orbitalnej (mirror colony.shipQueues).
    // Serializowana; brak w starym save v90 → [] przez ?? (bez migracji, precedens refuelAutomatically).
    this.shipQueues          = config.shipQueues ?? [];
  }

  // popCapacity — pochodna pojemność załogi: Σ (efekt popCapacity modułu × poziom) po modułach
  // habitat. NIE serializowana (S3.4 FAZA 1 decyzja #1: liczona z modules przy każdym odczycie),
  // więc dodanie/usunięcie/ulepszenie habitatu automatycznie zmienia pojemność stacji.
  get popCapacity() {
    let cap = 0;
    for (const m of this.modules) {
      const def = STATION_MODULES[m.moduleType];
      if (def && def.popCapacity) cap += def.popCapacity * (m.level || 1);
    }
    return cap;
  }

  // tradeCapacity — pochodna (S3.4 FAZA 2, decyzja #3): Σ tradeCapacityByLevel po AKTYWNYCH modułach
  // trade. Tylko WYSTAWIONA (realne wpięcie w CivilianTradeSystem = przyszły slice). Niesertializowana.
  get tradeCapacity() {
    let tc = 0;
    for (const m of this.modules) {
      if (m.active === false) continue;
      const def = STATION_MODULES[m.moduleType];
      if (def && def.tradeCapacityByLevel) tc += def.tradeCapacityByLevel[(m.level || 1) - 1] ?? 0;
    }
    return tc;
  }

  // hasActiveShipyard — czy stacja ma DZIAŁAJĄCĄ stocznię (gate kolejki budowy statków). Pochodna.
  get hasActiveShipyard() {
    return this.modules.some(m => m.active !== false && m.moduleType === 'shipyard');
  }
}
