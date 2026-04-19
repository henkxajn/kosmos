// ═══════════════════════════════════════════════════════════════
// ActionCatalog — enumeruje legalne akcje w aktualnym stanie
// ─────────────────────────────────────────────────────────────
// Ma 2 tryby:
//   listLegal({categories, limit}) — pełna lista (RuleBot)
//   sample({weights}) — losowa akcja z ważonym rozkładem kategorii (RandomBot)
// ═══════════════════════════════════════════════════════════════

import { BUILDINGS } from '../../data/BuildingsData.js';
import { TECHS } from '../../data/TechData.js';
import { SHIPS } from '../../data/ShipsData.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { TERRAIN_TYPES } from '../../map/HexTile.js';
import EntityManager from '../../core/EntityManager.js';
import { ACTION_TYPES } from './ActionAdapter.js';

// Domyślne wagi dla RandomBot (suma nie musi być 1)
export const DEFAULT_WEIGHTS = {
  build:     0.30,
  upgrade:   0.10,
  research:  0.20,
  expedition: 0.10,
  buildShip:  0.08,
  factoryEnqueue: 0.05,
  demolish:  0.02,
  wait:      0.15,
};

export class ActionCatalog {
  constructor({ colonyManager, techSystem, resourceSystem, buildingSystem, vesselManager, civSystem, starSystemManager }) {
    this.colonyManager = colonyManager;
    this.techSystem = techSystem;
    this.resourceSystem = resourceSystem;
    this.buildingSystem = buildingSystem;
    this.vesselManager = vesselManager;
    this.civSystem = civSystem;
    this.starSystemManager = starSystemManager;
  }

  /** Aktywna kolonia — per-kolonia systemy pochodzą stąd */
  _getActive() {
    const cm = this.colonyManager;
    const homeId = window.KOSMOS?.homePlanet?.id;
    const active = cm?._activePlanetId ?? homeId;
    return active ? cm?.getColony(active) : null;
  }

  // ── Kategoria: BUILD ──────────────────────────────────────────────────────
  // Opcja `buildingId` — zwróć tylko akcje dla konkretnego budynku (pomija limit z innych).
  // Bez tego limit=80 mógł wyczerpać się na wcześniejszych budynkach z wielu tiles
  // i factory (10 pozycja w BUILDINGS) nie mieściła się w wynikach.
  listBuildActions({ limit = 100, buildingId = null, perBuilding = null } = {}) {
    const active = this._getActive();
    if (!active?.grid) return [];
    const bSys = active.buildingSystem;
    const techSys = this.techSystem;
    const resSys = active.resourceSystem;
    if (!bSys || !techSys || !resSys) return [];

    const actions = [];
    const tiles = active.grid.toArray();
    // Priorytetyzuj wolne hexy
    const freeTiles = tiles.filter(t => {
      const terrain = TERRAIN_TYPES[t.type];
      return terrain?.buildable && !t.buildingId && !t.damaged && !t.underConstruction;
    });

    // Przegląd budynków z techami
    for (const building of Object.values(BUILDINGS)) {
      // Stolica nie-buildable przez gracza (auto-placed)
      if (building.isCapital) continue;
      // Filtr po konkretnym buildingId (gdy podany)
      if (buildingId && building.id !== buildingId) continue;
      // Tech gate
      if (building.requires && !techSys.isResearched(building.requires)) continue;
      // Czy stać nas (surowce + commodities)?
      const cost = { ...(building.cost ?? {}), ...(building.commodityCost ?? {}) };
      if (Object.keys(cost).length > 0 && !resSys.canAfford(cost)) continue;

      // Dla każdego budynku opcjonalnie limituj liczbę tiles (perBuilding) — równomierne pokrycie
      let pushedThisBuilding = 0;
      for (const tile of freeTiles) {
        if (!bSys._canBuildOnTile(tile, building)) continue;
        actions.push({ type: ACTION_TYPES.BUILD, tile, buildingId: building.id });
        pushedThisBuilding++;
        if (perBuilding && pushedThisBuilding >= perBuilding) break;
        if (actions.length >= limit) return actions;
      }
    }
    return actions;
  }

  // ── Kategoria: UPGRADE ────────────────────────────────────────────────────
  listUpgradeActions({ limit = 50 } = {}) {
    const active = this._getActive();
    if (!active?.grid) return [];
    const bSys = active.buildingSystem;
    if (!bSys?._active) return [];
    const actions = [];
    for (const [tileKey, entry] of bSys._active.entries()) {
      // Stolica i wirtualne — skip (klucz zaczyna się od 'capital_')
      if (tileKey.startsWith('capital_')) continue;
      const building = BUILDINGS[entry.building?.id ?? entry.buildingId];
      if (!building || building.isCapital) continue;
      const maxLv = building.maxLevel ?? 10;
      if ((entry.level ?? 1) >= maxLv) continue;
      const tile = active.grid.getByKey?.(tileKey) ?? active.grid._map?.get?.(tileKey);
      if (!tile) continue;
      actions.push({ type: ACTION_TYPES.UPGRADE, tile });
      if (actions.length >= limit) break;
    }
    return actions;
  }

  // ── Kategoria: DEMOLISH ───────────────────────────────────────────────────
  listDemolishActions({ limit = 30 } = {}) {
    const active = this._getActive();
    if (!active?.grid) return [];
    const bSys = active.buildingSystem;
    if (!bSys?._active) return [];
    const actions = [];
    for (const [tileKey, entry] of bSys._active.entries()) {
      if (tileKey.startsWith('capital_')) continue;
      const building = BUILDINGS[entry.building?.id ?? entry.buildingId];
      if (!building || building.isCapital) continue;
      const tile = active.grid.getByKey?.(tileKey) ?? active.grid._map?.get?.(tileKey);
      if (!tile) continue;
      actions.push({ type: ACTION_TYPES.DEMOLISH, tile });
      if (actions.length >= limit) break;
    }
    return actions;
  }

  // ── Kategoria: RESEARCH ───────────────────────────────────────────────────
  listResearchActions() {
    const techSys = this.techSystem;
    if (!techSys) return [];
    const available = techSys.getAvailable?.() ?? [];
    return available.map(tech => ({ type: ACTION_TYPES.RESEARCH, techId: tech.id }));
  }

  // ── Kategoria: EXPEDITION ─────────────────────────────────────────────────
  listExpeditionActions({ limit = 40 } = {}) {
    const techSys = this.techSystem;
    const bSys = this.buildingSystem;
    const vMgr = this.vesselManager;
    const active = this._getActive();
    if (!techSys || !bSys || !active) return [];

    // Wymagania: rocketry + launch_pad
    if (!techSys.isResearched('rocketry')) return [];
    const hasLaunchPad = Array.from(active.buildingSystem?._active?.values() ?? [])
      .some(e => (e.building?.id ?? e.buildingId) === 'launch_pad');
    if (!hasLaunchPad) return [];

    // Dostępne statki zadokowane w home colony
    const vessels = vMgr?.getAllVessels?.() ?? [];
    const docked = vessels.filter(v => v.colonyId === active.planetId && v.status === 'docked');
    if (docked.length === 0) return [];

    // Cele — najbliższe ciała w układzie (planety + moons + planetoids)
    const bodies = [];
    const entities = EntityManager.getAll?.() ?? [];
    for (const e of entities) {
      if (e.type === 'star') continue;
      if (e.id === active.planetId) continue;
      bodies.push(e);
    }

    const actions = [];
    const missionTypes = ['recon', 'mining', 'scientific'];
    for (const vessel of docked.slice(0, 3)) {
      for (const body of bodies.slice(0, limit)) {
        for (const mt of missionTypes) {
          // Proste: mining/scientific wymagają explored=true
          if ((mt === 'mining' || mt === 'scientific') && !body.explored) continue;
          actions.push({
            type: ACTION_TYPES.EXPEDITION,
            missionType: mt,
            targetId: body.id,
            vesselId: vessel.id,
          });
          if (actions.length >= limit) return actions;
        }
      }
    }
    return actions;
  }

  // ── Kategoria: BUILD_SHIP ─────────────────────────────────────────────────
  listBuildShipActions() {
    const techSys = this.techSystem;
    const active = this._getActive();
    if (!techSys || !active?.buildingSystem) return [];

    // Wymagane: shipyard
    const hasShipyard = Array.from(active.buildingSystem._active?.values() ?? [])
      .some(e => (e.building?.id ?? e.buildingId) === 'shipyard');
    if (!hasShipyard) return [];

    // SHIPS może być pusty jeśli legacy. Sprawdzamy.
    const ships = SHIPS ?? {};
    const resSys = active.resourceSystem;
    const actions = [];
    for (const ship of Object.values(ships)) {
      if (ship.requires && !techSys.isResearched(ship.requires)) continue;
      const cost = { ...(ship.cost ?? {}), ...(ship.commodityCost ?? {}) };
      if (Object.keys(cost).length > 0 && resSys && !resSys.canAfford(cost)) continue;
      actions.push({ type: ACTION_TYPES.BUILD_SHIP, shipId: ship.id, planetId: active.planetId });
    }
    return actions;
  }

  // ── Kategoria: FACTORY_ENQUEUE ────────────────────────────────────────────
  listFactoryActions() {
    const active = this._getActive();
    if (!active?.factorySystem) return [];
    const techSys = this.techSystem;
    const actions = [];
    for (const com of Object.values(COMMODITIES ?? {})) {
      if (com.requires && techSys && !techSys.isResearched(com.requires)) continue;
      actions.push({ type: ACTION_TYPES.FACTORY_ENQUEUE, commodityId: com.id, qty: 1 });
    }
    return actions;
  }

  // ── API: listLegal — zwraca listę wszystkich legalnych akcji ──────────────
  listLegal({ categories = ['build', 'upgrade', 'research', 'expedition', 'buildShip'], limits = {} } = {}) {
    const all = [];
    if (categories.includes('build'))       all.push(...this.listBuildActions({ limit: limits.build ?? 100 }));
    if (categories.includes('upgrade'))     all.push(...this.listUpgradeActions({ limit: limits.upgrade ?? 50 }));
    if (categories.includes('demolish'))    all.push(...this.listDemolishActions({ limit: limits.demolish ?? 30 }));
    if (categories.includes('research'))    all.push(...this.listResearchActions());
    if (categories.includes('expedition'))  all.push(...this.listExpeditionActions({ limit: limits.expedition ?? 40 }));
    if (categories.includes('buildShip'))   all.push(...this.listBuildShipActions());
    if (categories.includes('factoryEnqueue')) all.push(...this.listFactoryActions());
    return all;
  }

  /** Zwróć liczebność per kategoria (diagnostyka) */
  getCounts() {
    return {
      build:      this.listBuildActions({ limit: 9999 }).length,
      upgrade:    this.listUpgradeActions({ limit: 9999 }).length,
      demolish:   this.listDemolishActions({ limit: 9999 }).length,
      research:   this.listResearchActions().length,
      expedition: this.listExpeditionActions({ limit: 9999 }).length,
      buildShip:  this.listBuildShipActions().length,
      factoryEnqueue: this.listFactoryActions().length,
    };
  }

  // ── API: sample — ważona kategorią akcja losowa ───────────────────────────
  sample({ weights = DEFAULT_WEIGHTS, rand = Math.random } = {}) {
    // Użyj ważonego losowania kategorii. Jeśli brak akcji w kategorii → fallback.
    const categories = Object.keys(weights);
    const totalWeight = categories.reduce((s, c) => s + (weights[c] ?? 0), 0);
    if (totalWeight <= 0) return { type: ACTION_TYPES.WAIT };

    // Losuj kategorię + sprawdź
    const shuffled = [...categories].sort(() => rand() - 0.5);
    for (const cat of shuffled) {
      if (cat === 'wait') return { type: ACTION_TYPES.WAIT };
      const list = this._listByCategory(cat);
      if (list.length === 0) continue;
      // Losuj akcję z listy
      return list[Math.floor(rand() * list.length)];
    }
    return { type: ACTION_TYPES.WAIT };
  }

  _listByCategory(cat) {
    switch (cat) {
      case 'build':         return this.listBuildActions({ limit: 80 });
      case 'upgrade':       return this.listUpgradeActions({ limit: 30 });
      case 'demolish':      return this.listDemolishActions({ limit: 15 });
      case 'research':      return this.listResearchActions();
      case 'expedition':    return this.listExpeditionActions({ limit: 20 });
      case 'buildShip':     return this.listBuildShipActions();
      case 'factoryEnqueue': return this.listFactoryActions();
      default: return [];
    }
  }
}

export default ActionCatalog;
