// SaveMigration — centralny łańcuch migracji save'ów
//
// Każda nowa wersja save'a ma dedykowaną funkcję migracji:
//   v4 → v5 → v6 → v7 → ...
//
// Przy ładowaniu save'a:
//   1. Backup starego save do localStorage (kosmos_save_backup_v{N})
//   2. Łańcuchowa migracja: data.version → CURRENT_VERSION
//   3. Zapis zmigrowanego save'a do localStorage
//
// Obsługa błędów:
//   - Save z przyszłości (version > CURRENT) → { error: 'future_version' }
//   - Save zbyt stary (version < MIN_SUPPORTED) → { error: 'too_old' }

const SAVE_KEY = 'kosmos_save_v1';

export const CURRENT_VERSION     = 17;
export const MIN_SUPPORTED_VERSION = 4;

// ── Mapa migracji: fromVersion → funkcja(data) → data ──────────────────────
const MIGRATIONS = {
  4: _migrateV4toV5,
  5: _migrateV5toV6,
  6: _migrateV6toV7,
  7: _migrateV7toV8,
  8: _migrateV8toV9,
  9: _migrateV9toV10,
  10: _migrateV10toV11,
  11: _migrateV11toV12,
  12: _migrateV12toV13,
  13: _migrateV13toV14,
  14: _migrateV14toV15,
  15: _migrateV15toV16,
  16: _migrateV16toV17,
};

// ── Główna funkcja migracji ─────────────────────────────────────────────────

/**
 * Migruje dane save'a do aktualnej wersji.
 * @param {Object} data — surowe dane z localStorage (JSON.parse)
 * @returns {Object} — zmigrowane dane LUB { error: string, message: string }
 */
export function migrate(data) {
  if (!data || typeof data.version !== 'number') {
    // Brak wersji — traktuj jako aktualną (nowy save)
    return data;
  }

  const fromVersion = data.version;

  // Save z przyszłości
  if (fromVersion > CURRENT_VERSION) {
    return {
      error:   'future_version',
      message: `Save pochodzi z nowszej wersji gry (v${fromVersion}). Zaktualizuj grę.`,
    };
  }

  // Save zbyt stary
  if (fromVersion < MIN_SUPPORTED_VERSION) {
    return {
      error:   'too_old',
      message: `Save jest zbyt stary (v${fromVersion}). Minimalna wspierana wersja: v${MIN_SUPPORTED_VERSION}.`,
    };
  }

  // Już aktualna
  if (fromVersion === CURRENT_VERSION) {
    return data;
  }

  // ── Backup starego save'a ──────────────────────────────────────────────
  try {
    const backupKey = `kosmos_save_backup_v${fromVersion}`;
    localStorage.setItem(backupKey, JSON.stringify(data));
    console.log(`[SaveMigration] Backup save v${fromVersion} → ${backupKey}`);
  } catch (e) {
    console.warn('[SaveMigration] Nie udało się zapisać backupu:', e.message);
  }

  // ── Łańcuchowa migracja ────────────────────────────────────────────────
  let migrated = data;
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    const fn = MIGRATIONS[v];
    if (!fn) {
      console.error(`[SaveMigration] Brak migracji v${v}→v${v + 1}!`);
      return {
        error:   'missing_migration',
        message: `Brak migracji z wersji ${v} do ${v + 1}.`,
      };
    }
    console.log(`[SaveMigration] Migracja v${v} → v${v + 1}...`);
    migrated = fn(migrated);
    migrated.version = v + 1;
  }

  // ── Persist zmigrowany save ────────────────────────────────────────────
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
    console.log(`[SaveMigration] Save zmigrowany v${fromVersion} → v${CURRENT_VERSION}`);
  } catch (e) {
    console.warn('[SaveMigration] Nie udało się zapisać zmigrowanego save:', e.message);
  }

  return migrated;
}

// ── Migracja v4 → v5 ────────────────────────────────────────────────────────
// Absorbuje: GameScene.js linie 199-220 (single-colony → multi-colony)
// v4: civ4x.resources/civ/buildings/fleet na top-level
// v5: civ4x.colonies[] z per-kolonia danymi

function _migrateV4toV5(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  // Już w formacie v5 (colonies array)
  if (c4x.colonies?.length > 0) return data;

  // Brak danych 4X — nic do migracji
  if (!c4x.civMode) return data;

  const homePlanetId = c4x.homePlanetId ?? null;

  // Owij top-level dane w colonies[]
  const colony = {
    planetId:     homePlanetId,
    isHomePlanet: true,
    name:         null, // zostanie ustawiona z encji przy restore
    founded:      0,
    resources:    c4x.resources ?? null,
    civ:          c4x.civ ?? null,
    buildings:    c4x.buildings ?? [],
    fleet:        c4x.fleet ?? [],
    shipQueues:   c4x.shipQueue ? [c4x.shipQueue] : (c4x.shipQueues ?? []),
    allowImmigration: true,
    allowEmigration:  true,
  };

  c4x.colonies        = [colony];
  c4x.activePlanetId  = homePlanetId;
  c4x.tradeRoutes     = c4x.tradeRoutes ?? [];
  c4x.lastTradeYear   = c4x.lastTradeYear ?? 0;
  c4x.lastMigrationYear = c4x.lastMigrationYear ?? 0;

  // Wyczyść stare top-level pola (opcjonalne — nie przeszkadzają)
  delete c4x.resources;
  delete c4x.civ;
  delete c4x.buildings;
  delete c4x.fleet;
  delete c4x.shipQueue;

  return data;
}

// ── Migracja v5 → v6 ────────────────────────────────────────────────────────
// Absorbuje: ResourceSystem.restore() inline migracja (minerals→Fe, organics→food)
// Absorbuje: CivilizationSystem.restore() inline migracja (stary format pop)
// Absorbuje: ColonyManager.restore() shipQueue→shipQueues

function _migrateV5toV6(data) {
  const c4x = data.civ4x;
  if (!c4x?.colonies) return data;

  for (const col of c4x.colonies) {
    // ── Migracja zasobów: stary format (minerals/organics/water/energy/research) → inventory ──
    if (col.resources && !col.resources.inventory) {
      const inv = {};
      for (const [key, saved] of Object.entries(col.resources)) {
        if (key === 'minerals') {
          inv.Fe = saved.amount ?? 0;
        } else if (key === 'organics') {
          inv.food = saved.amount ?? 0;
        } else if (key === 'water') {
          inv.water = saved.amount ?? 0;
        }
        // energy — flow, nie przywracamy stockpile
        // research — obsłużony niżej
      }
      const researchAmount = col.resources.research?.amount ?? 0;
      col.resources = {
        inventory: inv,
        research:  researchAmount,
      };
    }

    // ── Migracja populacji: stary format (populacja w tysiącach) → discrete POP ──
    if (col.civ && !col.civ.popFormat && col.civ.population > 100) {
      col.civ.population = Math.max(2, Math.round(col.civ.population / 50));
      col.civ.popFormat  = 'discrete';
    }

    // ── Migracja floty: shipQueue (single) → shipQueues (tablica) ──
    if (col.shipQueue && !col.shipQueues) {
      col.shipQueues = [col.shipQueue];
      delete col.shipQueue;
    } else if (!col.shipQueues) {
      col.shipQueues = [];
    }
  }

  return data;
}

// ── Migracja v6 → v7 ────────────────────────────────────────────────────────
// Ustanowienie łańcucha — upewnij się że kluczowe pola istnieją

function _migrateV6toV7(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  // Upewnij się że exploredBodies istnieje
  if (!c4x.exploredBodies) {
    c4x.exploredBodies = [];
  }

  // Upewnij się że vesselManager istnieje
  if (!c4x.vesselManager) {
    c4x.vesselManager = null;
  }

  // Per-kolonia: upewnij się że factorySystem i shipQueues istnieją
  if (c4x.colonies) {
    for (const col of c4x.colonies) {
      if (!col.factorySystem) col.factorySystem = null;
      if (!col.shipQueues)    col.shipQueues = [];
      if (!col.fleet)         col.fleet = [];
    }
  }

  return data;
}

// ── Migracja v7 → v8 ────────────────────────────────────────────────────────
// Dodaje: tradeRouteManager, visitCounts w expeditions, queue w factorySystem

function _migrateV7toV8(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  // Dodaj tradeRouteManager
  if (!c4x.tradeRouteManager) {
    c4x.tradeRouteManager = null;
  }

  // Dodaj visitCounts do expeditions
  if (c4x.expeditions && !c4x.expeditions.visitCounts) {
    c4x.expeditions.visitCounts = {};
  }

  // Per-kolonia: dodaj queue do factorySystem
  if (c4x.colonies) {
    for (const col of c4x.colonies) {
      if (col.factorySystem && !col.factorySystem.queue) {
        col.factorySystem.queue = [];
      }
    }
  }

  return data;
}

// ── Migracja v8 → v9 ────────────────────────────────────────────────────────
// Dodaje nowe commodities do inventory, migracja mining_robots → robots

function _migrateV8toV9(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  // Nowe commodity klucze dodane w v9
  const NEW_COMMODITIES = [
    'concrete_mix', 'copper_wiring', 'habitat_modules', 'water_recyclers',
    'robots', 'fusion_cores', 'nanotech_filters', 'antimatter_cells',
  ];

  if (c4x.colonies) {
    for (const col of c4x.colonies) {
      const inv = col.resources?.inventory;
      if (inv) {
        // Dodaj nowe commodity klucze z default 0
        for (const key of NEW_COMMODITIES) {
          if (inv[key] === undefined) inv[key] = 0;
        }
        // Migracja: mining_robots → robots (defensywne)
        if (inv.mining_robots !== undefined) {
          inv.robots = (inv.robots || 0) + inv.mining_robots;
          delete inv.mining_robots;
        }
      }
    }
  }

  return data;
}

// ── Migracja v9 → v10 ───────────────────────────────────────────────────────
// Dodaje: constructionQueue per kolonia, prefab commodities w inventory, cargo w vessels

function _migrateV9toV10(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  // Nowe commodity klucze (prefabrykaty)
  const PREFAB_COMMODITIES = [
    'prefab_mine', 'prefab_solar_farm', 'prefab_habitat', 'prefab_autonomous_mine',
    'prefab_autonomous_solar_farm',
  ];

  if (c4x.colonies) {
    for (const col of c4x.colonies) {
      // Dodaj constructionQueue jeśli brak
      if (!col.constructionQueue) col.constructionQueue = [];

      // Dodaj prefab klucze do inventory
      const inv = col.resources?.inventory;
      if (inv) {
        for (const key of PREFAB_COMMODITIES) {
          if (inv[key] === undefined) inv[key] = 0;
        }
      }
    }
  }

  // Dodaj cargo do vessels (stare save'y nie mają)
  if (c4x.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v.cargo) v.cargo = {};
      if (v.cargoUsed === undefined) v.cargoUsed = 0;
    }
  }

  return data;
}

// ── Migracja v10 → v11 ──────────────────────────────────────────────────────
// Dodaje: isOutpost flag per kolonia

function _migrateV10toV11(data) {
  const c4x = data.civ4x;
  if (!c4x?.colonies) return data;

  for (const col of c4x.colonies) {
    if (col.isOutpost === undefined) col.isOutpost = false;
  }

  return data;
}

// ── Migracja v11 → v12 ──────────────────────────────────────────────────────
// Dodaje 2 półprzewodniki do inventory kolonii macierzystej (jeśli brak)

function _migrateV11toV12(data) {
  const c4x = data.civ4x;
  if (!c4x?.colonies) return data;

  for (const col of c4x.colonies) {
    const inv = col.resources?.inventory;
    if (inv && (inv.semiconductors === undefined || inv.semiconductors === 0)) {
      // Tylko kolonia macierzysta dostaje bonus startowy
      if (col.isHomePlanet) {
        inv.semiconductors = 2;
      } else if (inv.semiconductors === undefined) {
        inv.semiconductors = 0;
      }
    }
  }

  return data;
}

// ── Migracja v12 → v13 ──────────────────────────────────────────────────────
// Dodaje: vessel fields (homeColonyId, automation, missionLog, stats)
// Rename: expeditions → missions (backward compat)

function _migrateV12toV13(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  // Dodaj nowe pola do vessels
  if (c4x.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v.homeColonyId) v.homeColonyId = v.colonyId;
      if (!v.automation) v.automation = { autoReturn: false, autoRefuel: true };
      if (!v.missionLog) v.missionLog = [];
      if (!v.stats) v.stats = { distanceTraveled: 0, missionsComplete: 0, resourcesHauled: 0, bodiesSurveyed: 0 };
    }
  }

  // Rename expeditions → missions (zachowaj oba klucze dla backward compat)
  if (c4x.expeditions && !c4x.missions) {
    c4x.missions = c4x.expeditions;
  }

  return data;
}

// ── Migracja v13 → v14 ──────────────────────────────────────────────────────
// Dodaje: researchSystem (kolejka badań) do civ4x

function _migrateV13toV14(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  if (!c4x.researchSystem) {
    c4x.researchSystem = {
      currentResearch: null,
      researchProgress: 0,
      researchQueue: [],
    };
  }

  return data;
}

// ── Migracja v14 → v15 ──────────────────────────────────────────────────────
// Dodaje: maintenance do budynków (ujemne stawki), colony_base rates (food+research)
// Musi zmodyfikować zapisane baseRates/effectiveRates, bo restoreFromSave() ich nie przelicza

function _migrateV14toV15(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  // Maintenance per budynek — wartości z BuildingsData.js v15
  const MAINT = {
    mine:           { Fe: 1 },
    solar_farm:     { Si: 1 },
    coal_plant:     { Fe: 1, C: 1 },
    geothermal:     { Fe: 1 },
    habitat:        { Fe: 1 },
    research_station: { Cu: 1, Si: 1 },
    factory:        { Fe: 1 },
    smelter:        { Fe: 2, C: 2 },
    nuclear_plant:  { Ti: 1, Li: 1 },
    launch_pad:     { Fe: 2, Ti: 1 },
    shipyard:       { Fe: 3, Ti: 1 },
    synthesized_food_plant: { Cu: 1 },
    autonomous_mine: { Fe: 1 },
    autonomous_solar_farm: { Si: 1 },
    fusion_reactor: { Ti: 2, Li: 1 },
    terraformer:    { Ti: 1, Si: 1 },
  };

  // Iteruj kolonie i dodaj maintenance do baseRates/effectiveRates
  const colonies = c4x.colonies ?? [];
  for (const colony of colonies) {
    const buildings = colony.buildings ?? [];
    for (const b of buildings) {
      const maint = MAINT[b.buildingId];
      const level = b.level ?? 1;

      // Dodaj maintenance jako ujemne stawki
      if (maint && b.baseRates) {
        for (const [res, amount] of Object.entries(maint)) {
          b.baseRates[res] = (b.baseRates[res] ?? 0) - amount * level;
        }
      }
      if (maint && b.effectiveRates) {
        for (const [res, amount] of Object.entries(maint)) {
          b.effectiveRates[res] = (b.effectiveRates[res] ?? 0) - amount * level;
        }
      }

      // Colony base: dodaj bazową produkcję food+research
      if (b.buildingId === 'colony_base') {
        if (b.baseRates) {
          b.baseRates.food = (b.baseRates.food ?? 0) + 3;
          b.baseRates.research = (b.baseRates.research ?? 0) + 2;
        }
        if (b.effectiveRates) {
          b.effectiveRates.food = (b.effectiveRates.food ?? 0) + 3;
          b.effectiveRates.research = (b.effectiveRates.research ?? 0) + 2;
        }
      }
    }
  }

  return data;
}

// ── Migracja v15 → v16 ──────────────────────────────────────────────────────
// Dodaje: requiresSpaceportFirst per kolonia, nowe prefab commodities (spaceport)

function _migrateV15toV16(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  const colonies = c4x.colonies ?? [];
  for (const col of colonies) {
    // Flaga requiresSpaceportFirst — home planet zwolniony, reszta: sprawdź czy ma launch_pad
    if (col.isHomePlanet) {
      col.requiresSpaceportFirst = false;
    } else {
      const buildings = col.buildings ?? [];
      const hasPort = buildings.some(b =>
        b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport'
      );
      col.requiresSpaceportFirst = !hasPort;
    }

    // Dodaj nowe prefab klucze do inventory
    const inv = col.resources?.inventory;
    if (inv) {
      if (inv.prefab_spaceport === undefined) inv.prefab_spaceport = 0;
      if (inv.prefab_autonomous_spaceport === undefined) inv.prefab_autonomous_spaceport = 0;
    }
  }

  return data;
}

// ── Migracja v16 → v17 ──────────────────────────────────────────────────────
// Dodaje: surfaceRadius, surfaceGravity, temperatureC do planet/księżyców/planetoidów
// Konwertuje: breathableAtmosphere → atmosphere='breathable'

function _migrateV16toV17(data) {
  // Helper: promień z masy (bez jitter — deterministyczny dla migracji)
  function calcR(mass, type) {
    if (type === 'gas') return 3.5 * Math.pow(mass, 0.12);
    if (type === 'ice') return Math.pow(mass, 0.24);
    return Math.pow(mass, 0.27);
  }

  // Planety
  for (const p of (data.planets || [])) {
    const mass = p.mass ?? 1;
    const R = calcR(mass, p.planetType ?? 'rocky');
    if (p.surfaceRadius  == null) p.surfaceRadius  = R;
    if (p.surfaceGravity == null) p.surfaceGravity = mass / (R * R);
    if (p.temperatureC   == null) p.temperatureC   = (p.temperatureK ?? 273) - 273.15;
    // breathableAtmosphere → atmosphere = 'breathable'
    if (p.breathableAtmosphere && p.atmosphere !== 'breathable') {
      p.atmosphere = 'breathable';
    }
    // Zsynchronizuj surface.temperature
    if (p.surface) p.surface.temperature = p.temperatureC;
  }

  // Księżyce
  for (const m of (data.moons || [])) {
    const mass = m.mass ?? 0.001;
    const type = m.moonType === 'icy' ? 'ice' : 'rocky';
    const R = calcR(mass, type);
    if (m.surfaceRadius  == null) m.surfaceRadius  = R;
    if (m.surfaceGravity == null) m.surfaceGravity = mass / (R * R);
    if (m.temperatureC   == null) m.temperatureC   = (m.temperatureK ?? 223) - 273.15;
    if (m.surface) m.surface.temperature = m.temperatureC;
  }

  // Planetoidy
  for (const p of (data.planetoids || [])) {
    const mass = p.mass ?? 0.01;
    const R = calcR(mass, 'rocky');
    if (p.surfaceRadius  == null) p.surfaceRadius  = R;
    if (p.surfaceGravity == null) p.surfaceGravity = mass / (R * R);
    if (p.temperatureK   == null && p.surface?.temperature != null) {
      p.temperatureK = p.surface.temperature + 273.15;
    }
    if (p.temperatureC == null) {
      p.temperatureC = p.temperatureK != null ? p.temperatureK - 273.15 : (p.surface?.temperature ?? -100);
    }
    if (p.surface) p.surface.temperature = p.temperatureC;
  }

  data.version = 17;
  return data;
}
