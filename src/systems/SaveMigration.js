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

export const CURRENT_VERSION     = 12;
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
