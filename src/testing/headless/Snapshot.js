// ═══════════════════════════════════════════════════════════════
// Snapshot — bogata migawka stanu gry (metryki + imperium + floty)
// ─────────────────────────────────────────────────────────────
// KOSMOS nie ma łatwego fast-forward cloning. Zamiast pełnej izolacji
// rolloutów MCTS zbieramy bogaty state-snapshot z metrykami per-tick:
//   pop, prosperity, housing, energy flow, resources + rates,
//   buildings by category, vessels by status, colonies, empires, observatory.
// ═══════════════════════════════════════════════════════════════

/**
 * Agreguj budynki kolonii po kategorii (B.2 — wsparcie per-kolonia).
 * Zwraca { buildingCount, buildingsByCategory } w tym samym kształcie co
 * top-level buildingsByCategory w capture(). Helper additive — istniejący
 * top-level blok pozostaje nietknięty.
 */
function _aggregateColonyBuildings(buildingSystem) {
  const byCat = {};
  let count = 0;
  const active = buildingSystem?._active;
  if (active) {
    for (const [, entry] of active) {
      const id  = entry.building?.id ?? entry.buildingId;
      const lvl = entry.level ?? 1;
      count++;
      const cat = entry.building?.category ?? 'other';
      if (!byCat[cat]) byCat[cat] = { count: 0, totalLevels: 0, byId: {} };
      byCat[cat].count++;
      byCat[cat].totalLevels += lvl;
      byCat[cat].byId[id] = (byCat[cat].byId[id] ?? 0) + 1;
    }
  }
  return { buildingCount: count, buildingsByCategory: byCat };
}

/** Zrób bogatą migawkę z aktywnego state */
export function capture(core) {
  const K = window.KOSMOS;
  const active = K?.colonyManager?.getColony?.(K?.colonyManager?._activePlanetId ?? K?.homePlanet?.id);

  // ── Inventory + rates ──
  const inventory = {};
  const rates = {};
  const resSys = active?.resourceSystem;
  if (resSys) {
    const inv = resSys.inventory ?? resSys._inventory;
    if (inv) for (const [k, v] of inv) if (v > 0.01) inventory[k] = Math.round(v * 100) / 100;
    const peryr = resSys._inventoryPerYear;
    if (peryr) for (const [k, v] of peryr) if (Math.abs(v) > 0.001) rates[k] = Math.round(v * 100) / 100;
  }

  // ── Energy flow ──
  const energy = {
    production: resSys?.energy?.production ?? 0,
    consumption: resSys?.energy?.consumption ?? 0,
    balance: resSys?.energy?.balance ?? 0,
    brownout: resSys?.energy?.brownout ?? false,
  };

  // ── Buildings by category ──
  const buildings = {};
  const buildingsByCategory = {};
  let buildingCount = 0;
  if (active?.buildingSystem?._active) {
    for (const [tileKey, entry] of active.buildingSystem._active) {
      const id = entry.building?.id ?? entry.buildingId;
      const lvl = entry.level ?? 1;
      buildings[tileKey] = { id, level: lvl };
      buildingCount++;
      // Category aggregation
      const cat = entry.building?.category ?? 'other';
      if (!buildingsByCategory[cat]) buildingsByCategory[cat] = { count: 0, totalLevels: 0, byId: {} };
      buildingsByCategory[cat].count++;
      buildingsByCategory[cat].totalLevels += lvl;
      buildingsByCategory[cat].byId[id] = (buildingsByCategory[cat].byId[id] ?? 0) + 1;
    }
  }

  // ── Safety stocks (demandBonus) + tryb fabryki aktywnej kolonii (B.2) ──
  // demandBonus: Map<commodityId, number> → object. Target zapasu = base + bonus.
  const demandBonus = active?.factorySystem?._demandBonus
    ? Object.fromEntries(active.factorySystem._demandBonus)
    : {};
  const factoryMode = active?.factorySystem?._mode ?? null;

  // ── Vessels by status + byType (shipId) ──
  // byType: rozbicie floty per typ statku (kurier AI = 'hull_small'). Konsument:
  //   src/data/targets/industrialist.js (wcześniej pusty — known bug Opcji B).
  const vesselsByStatus = { docked: 0, in_transit: 0, orbiting: 0, away_team: 0, total: 0 };
  const vesselsByType = {};
  if (core.vesselManager?.getAllVessels) {
    const all = core.vesselManager.getAllVessels();
    for (const v of all) {
      vesselsByStatus.total++;
      const s = v.status ?? 'unknown';
      vesselsByStatus[s] = (vesselsByStatus[s] ?? 0) + 1;
      const ty = v.shipId ?? 'unknown';
      vesselsByType[ty] = (vesselsByType[ty] ?? 0) + 1;
    }
  }
  vesselsByStatus.byType = vesselsByType;

  // ── Missions ──
  const missionsByStatus = { active: 0, completed: 0, failed: 0, total: 0 };
  const mSys = core.missionSystem ?? core.expeditionSystem;
  if (mSys) {
    const missions = mSys._missions ?? mSys.missions;
    const list = missions instanceof Map ? Array.from(missions.values()) : Array.isArray(missions) ? missions : Object.values(missions ?? {});
    for (const m of list) {
      missionsByStatus.total++;
      const s = m?.status;
      if (s === 'in_transit' || s === 'in_flight' || s === 'orbiting') missionsByStatus.active++;
      else if (s === 'completed' || s === 'returning') missionsByStatus.completed++;
      else if (s === 'failed' || s === 'disaster') missionsByStatus.failed++;
    }
  }

  // ── Colonies ──
  const coloniesList = [];
  if (core.colonyManager?.getAllColonies) {
    for (const col of core.colonyManager.getAllColonies()) {
      const colBuildAgg = _aggregateColonyBuildings(col.buildingSystem);
      const colFactory  = col.factorySystem;
      coloniesList.push({
        id: col.planetId,
        name: col.name ?? '?',
        isHomePlanet: col.isHomePlanet ?? false,
        isOutpost: col.isOutpost ?? false,
        pop: col.civSystem?.population ?? 0,
        housing: col.civSystem?.housing ?? 0,
        prosperity: Math.round(col.prosperitySystem?.prosperity ?? 0),
        buildings: col.buildingSystem?._active?.size ?? 0,
        credits: Math.round(col.credits ?? 0),
        // ── Decyzje gracza per-kolonia ──
        // B.2: safety stocks (demandBonus) + tryb fabryki
        factorySystem: {
          demandBonus: colFactory?._demandBonus ? Object.fromEntries(colFactory._demandBonus) : {},
          mode:        colFactory?._mode ?? null,
        },
        // B.2: rozkład budynków per kategoria (count/totalLevels/byId)
        buildingsByCategory: colBuildAgg.buildingsByCategory,
        // B.3/B.4: stan decyzji handlowo-migracyjnych (rezultat trade:setOverride + polityka migracji)
        allowImmigration: col.allowImmigration ?? null,
        tradeOverrides:   col.tradeOverrides ? { ...col.tradeOverrides } : {},
      });
    }
  }

  // ── Empires ──
  const empiresList = [];
  if (core.empireRegistry?.listAll) {
    for (const emp of core.empireRegistry.listAll()) {
      const hostility = core.diplomacySystem?.getHostility?.(emp.id) ?? 0;
      empiresList.push({
        id: emp.id,
        name: emp.name ?? emp.id,
        archetype: emp.archetype,
        tech: emp.tech?.level ?? 0,
        military: Math.round(emp.military?.power ?? 0),
        colonies: emp.colonies?.length ?? 0,
        hostility: Math.round(hostility),
        fsmState: core.alienCivSystem?.getState?.(emp.id) ?? 'unknown',
      });
    }
  }

  // ── Observatory ──
  const observatory = {
    discoveries: core.observatorySystem?._discoveries?.length ?? 0,
    maxLevel: core.observatorySystem?.getMaxObservatoryLevel?.() ?? 0,
  };

  // ── Tech details ──
  const researched = Array.from(core.techSystem?._researched ?? []);
  const researchAmount = Math.round(resSys?.getAmount?.('research') ?? 0);
  const researchPerYear = Math.round(rates.research ?? 0);

  // ── Active colony details ──
  const activeProsperity = active?.prosperitySystem?.prosperity ?? 0;

  return {
    civYear: Math.floor((core.timeSystem?.gameTime ?? 0) * 12),
    gameTime: core.timeSystem?.gameTime ?? 0,

    // POP & housing
    pop: active?.civSystem?.population ?? 0,
    housing: active?.civSystem?.housing ?? 0,
    prosperity: Math.round(activeProsperity),

    // Resources
    inventory,
    rates,             // per-year production/consumption per resource
    energy,

    // Buildings
    buildingCount,
    buildings,
    buildingsByCategory,

    // Safety stocks + tryb fabryki (aktywna kolonia) — B.2
    demandBonus,
    factoryMode,

    // Research
    researched,
    researchedCount: researched.length,
    researchAmount,
    researchPerYear,

    // Fleet
    vessels: vesselsByStatus,

    // Missions
    missions: missionsByStatus,

    // Colonies
    coloniesList,
    colonies: coloniesList.length,

    // Empires
    empires: empiresList,

    // Observatory
    observatory,

    // Credits
    credits: Math.round(active?.credits ?? 0),
    creditsPerYear: Math.round(active?.creditsPerYear ?? 0),

    // Health
    homeAlive: !!K?.homePlanet && K?.civMode === true,
  };
}

/** Porównaj dwa snapshoty — zwraca delta */
export function diff(s1, s2) {
  if (!s1 || !s2) return null;
  const d = {
    civYearDelta: s2.civYear - s1.civYear,
    popDelta: s2.pop - s1.pop,
    researchedDelta: s2.researchedCount - s1.researchedCount,
    buildingDelta: s2.buildingCount - s1.buildingCount,
    coloniesDelta: s2.colonies - s1.colonies,
    vesselsDelta: (s2.vessels?.total ?? 0) - (s1.vessels?.total ?? 0),
    prosperityDelta: (s2.prosperity ?? 0) - (s1.prosperity ?? 0),
    inventoryDelta: {},
  };
  const allKeys = new Set([...Object.keys(s1.inventory ?? {}), ...Object.keys(s2.inventory ?? {})]);
  for (const k of allKeys) {
    const a = s1.inventory?.[k] ?? 0;
    const b = s2.inventory?.[k] ?? 0;
    if (Math.abs(b - a) > 0.5) d.inventoryDelta[k] = Math.round((b - a) * 100) / 100;
  }
  return d;
}

export function equals(s1, s2) {
  if (!s1 || !s2) return false;
  if (s1.civYear !== s2.civYear) return false;
  if (s1.pop !== s2.pop) return false;
  if (s1.researchedCount !== s2.researchedCount) return false;
  if (s1.buildingCount !== s2.buildingCount) return false;
  return true;
}

export default { capture, diff, equals };
