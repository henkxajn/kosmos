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

import { ORBITAL_ROLES, getOrbitRange, computeBodyRadius } from '../data/OrbitalRolesData.js';
import EntityManager from '../core/EntityManager.js';
import { createStarterModules } from '../data/StationModuleData.js';
import { ARCHETYPES, EMPIRE_COLOR_PALETTE } from '../data/EmpireData.js';

const SAVE_KEY = 'kosmos_save_v1';
const BACKUP_PREFIX = 'kosmos_save_backup_v';

export const CURRENT_VERSION     = 92;
export const MIN_SUPPORTED_VERSION = 4;

/**
 * Usuwa backupy migracji (`kosmos_save_backup_v{N}`) — każdy waży tyle co CAŁY save.
 *
 * Powstawały przy każdym bumpie wersji i NIGDY nie były sprzątane, a gra nie ma dla nich
 * ścieżki odczytu (odzysk = ręcznie w DevTools). Realnie zjadały większość quoty:
 * localStorage to 10 MiB liczone w UTF-16 (2 B/znak) = ~5,2 mln znaków na WSZYSTKIE klucze
 * razem — więc kilka kopii save'a wystarczyło, by zablokować zapis. Trwały backup gracza to
 * dziś plik `.json` na dysku (`src/utils/SaveFile.js`), nie localStorage.
 *
 * @param {object} [opts]
 * @param {number|null} [opts.keepVersion] — wersja, której backup zostawić (null = usuń wszystkie)
 * @returns {number} ile kluczy usunięto
 */
export function pruneMigrationBackups({ keepVersion = null } = {}) {
  let removed = 0;
  try {
    const keepKey = keepVersion === null ? null : `${BACKUP_PREFIX}${keepVersion}`;
    // Kopia listy kluczy PRZED usuwaniem — removeItem przenumerowuje indeksy w trakcie iteracji.
    // Storage API (length/key) zamiast Object.keys: to samo w przeglądarce, ale uczciwie testowalne.
    const keys = [];
    for (let i = 0; i < (localStorage.length ?? 0); i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (!k.startsWith(BACKUP_PREFIX) || k === keepKey) continue;
      localStorage.removeItem(k);
      removed++;
    }
    if (removed > 0) console.log(`[SaveMigration] Usunięto ${removed} backup(ów) migracji`);
  } catch (e) {
    console.warn('[SaveMigration] Sprzątanie backupów nieudane:', e?.message);
  }
  return removed;
}

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
  17: _migrateV17toV18,
  18: _migrateV18toV19,
  19: _migrateV19toV20,
  20: _migrateV20toV21,
  21: _migrateV21toV22,
  22: _migrateV22toV23,
  23: _migrateV23toV24,
  24: _migrateV24toV25,
  25: _migrateV25toV26,
  26: _migrateV26toV27,
  27: _migrateV27toV28,
  28: _migrateV28toV29,
  29: _migrateV29toV30,
  30: _migrateV30toV31,
  31: _migrateV31toV32,
  32: _migrateV32toV33,
  33: _migrateV33toV34,
  34: _migrateV34toV35,
  35: _migrateV35toV36,
  36: _migrateV36toV37,
  37: _migrateV37toV38,
  38: _migrateV38toV39,
  39: _migrateV39toV40,
  40: _migrateV40toV41,
  41: _migrateV41toV42,
  42: _migrateV42toV43,
  43: _migrateV43toV44,
  44: _migrateV44toV45,
  45: _migrateV45toV46,
  46: _migrateV46toV47,
  47: _migrateV47toV48,
  48: _migrateV48toV49,
  49: _migrateV49toV50,
  50: _migrateV50toV51,
  51: _migrateV51toV52,
  52: _migrateV52toV53,
  53: _migrateV53toV54,
  54: _migrateV54toV55,
  55: _migrateV55toV56,
  56: _migrateV56toV57,
  57: _migrateV57toV58,
  58: _migrateV58toV59,
  59: _migrateV59toV60,
  60: _migrateV60toV61,
  61: _migrateV61toV62,
  62: _migrateV62toV63,
  63: _migrateV63toV64,
  64: _migrateV64toV65,
  65: _migrateV65toV66,
  66: _migrateV66toV67,
  67: _migrateV67toV68,
  68: _migrateV68toV69,
  69: _migrateV69toV70,
  70: _migrateV70toV71,
  71: _migrateV71toV72,
  72: _migrateV72toV73,
  73: _migrateV73toV74,
  74: _migrateV74toV75,
  75: _migrateV75toV76,
  76: _migrateV76toV77,
  77: _migrateV77toV78,
  78: _migrateV78toV79,
  79: _migrateV79toV80,
  80: _migrateV80toV81,
  81: _migrateV81toV82,
  82: _migrateV82toV83,
  83: _migrateV83toV84,
  84: _migrateV84toV85,
  85: _migrateV85toV86,
  86: _migrateV86toV87,
  87: _migrateV87toV88,
  88: _migrateV88toV89,
  89: _migrateV89toV90,
  90: _migrateV90toV91,
  91: _migrateV91toV92,
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
  // Sprzątamy PRZED zapisem: backupy z poprzednich bumpów są bezużyteczne (zero czytelników),
  // a każdy zajmuje tyle co cały save — bez tego kolejny backup często nie miałby się gdzie zmieścić.
  pruneMigrationBackups();
  try {
    const backupKey = `${BACKUP_PREFIX}${fromVersion}`;
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
    // Slice 1: _migrateV75toV76 throw'uje clean break (incompatible save).
    // Owijamy try/catch żeby przekuć throw → error object kompatybilny z TitleScene/BootScene.
    try {
      migrated = fn(migrated);
    } catch (err) {
      console.error(`[SaveMigration] Migracja v${v}→v${v + 1} rzuciła błąd:`, err);
      return {
        error:   'incompatible_save',
        message: err?.message ?? `Migracja v${v}→v${v + 1} nie powiodła się.`,
      };
    }
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

// ── Migracja v17 → v18 ──────────────────────────────────────────────────────
// Dodaje: prosperity defaults per kolonia, usuwa morale z civ, dodaje nowe consumer goods

function _migrateV17toV18(data) {
  const c4x = data.civ4x;
  if (!c4x?.colonies) return data;

  // Nowe consumer goods commodity klucze
  const NEW_CONSUMER_GOODS = [
    'spare_parts', 'pharmaceuticals', 'life_support_filters',
    'synthetics', 'personal_electronics', 'gourmet_food', 'stimulants',
  ];

  for (const colony of c4x.colonies) {
    // Dodaj prosperity defaults
    if (!colony.prosperity) {
      colony.prosperity = {
        score: 50,
        targetProsperity: 50,
        epoch: 'early',
        epochScore: 0,
        consumerDemand: {},
        consumerProduction: {},
      };
    }

    // Usuń morale z civ
    if (colony.civ) {
      delete colony.civ.morale;
      delete colony.civ.moraleComponents;
      // Rename lowMoraleYears → lowProsperityYears
      if (colony.civ.lowMoraleYears !== undefined) {
        colony.civ.lowProsperityYears = colony.civ.lowMoraleYears;
        delete colony.civ.lowMoraleYears;
      }
    }

    // Dodaj nowe commodity klucze do inventory
    const inv = colony.resources?.inventory;
    if (inv) {
      for (const g of NEW_CONSUMER_GOODS) {
        if (inv[g] === undefined) inv[g] = 0;
      }
    }
  }

  return data;
}

// v18 → v19: mapa galaktyczna (galaxyData) — no-op
// Brak galaxyData w starym save = generator odtworzy ze starego seed gwiazdy
function _migrateV18toV19(data) {
  return data;
}

// ── Migracja v19 → v20 ──────────────────────────────────────────────────────
// Wielka reforma technologii (Etap 38): nowe drzewo tech (~55), nowe budynki,
// commodities, statki, generacje. Stary stan c4x niekompatybilny — kasujemy.
function _migrateV19toV20(data) {
  if (data.civ4x) data.civ4x = null;
  data.version = 20;
  return data;
}

// ── Migracja v20 → v21 ──────────────────────────────────────────────────────
// Dodaje: randomEventSystem (globalne), eventBonuses do prosperity per kolonia
function _migrateV20toV21(data) {
  const c4x = data.civ4x;
  if (!c4x) return data;

  // Dodaj randomEventSystem (null = brak aktywnych zdarzeń)
  if (!c4x.randomEventSystem) {
    c4x.randomEventSystem = null;
  }

  // Dodaj eventBonuses do prosperity per kolonia
  if (c4x.colonies) {
    for (const col of c4x.colonies) {
      if (col.prosperity && !col.prosperity.eventBonuses) {
        col.prosperity.eventBonuses = {};
      }
      // Alias: stare save mogą mieć col.prosperitySystem zamiast col.prosperity
      if (col.prosperitySystem && !col.prosperitySystem.eventBonuses) {
        col.prosperitySystem.eventBonuses = {};
      }
    }
  }

  return data;
}

// ── v21 → v22: Podróże międzygwiezdne — systemId na encjach, koloniach, statkach ──
function _migrateV21toV22(data) {
  const c4x = data.civ4x;

  // Dodaj systemId do kolonii
  if (c4x?.colonies) {
    for (const col of c4x.colonies) {
      if (!col.systemId) col.systemId = 'sys_home';
    }
  }

  // Dodaj systemId do statków
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v.systemId) v.systemId = 'sys_home';
    }
  }

  // Dodaj activeSystemId
  if (c4x && !c4x.activeSystemId) {
    c4x.activeSystemId = 'sys_home';
  }

  // Dodaj starSystemManager z jednym układem (home)
  if (c4x && !c4x.starSystemManager) {
    // Zbierz ID encji z danych save (gwiazda, planety, księżyce, planetoidy)
    const planetIds    = (data.planets || []).map(p => p.id);
    const moonIds      = (data.moons || []).map(m => m.id);
    const planetoidIds = (data.planetoids || []).map(p => p.id);
    const starId       = data.star?.id ?? null;

    c4x.starSystemManager = {
      activeSystemId: 'sys_home',
      systems: [{
        systemId:     'sys_home',
        starEntityId: starId,
        planetIds,
        moonIds,
        planetoidIds,
        explored:     true,
        warpBeacon:   null,
        jumpGate:     null,
      }],
    };
  }

  return data;
}

// ── v23 → v24: Pending orders (budynki + statki) ─────────────────────────
function _migrateV23toV24(data) {
  if (data.civ4x?.colonies) {
    for (const c of data.civ4x.colonies) {
      c.pendingQueue      ??= [];
      c.pendingShipOrders ??= [];
    }
  }
  return data;
}

// ── v24 → v25: ObservatorySystem (pasywne skanowanie ciał) ─────────────────
function _migrateV24toV25(data) {
  if (data.civ4x) {
    data.civ4x.observatorySystem ??= { scanAccum: {}, discoveries: [] };
  }
  return data;
}

// ── v25 → v26: Outpost balans — prosperity=0, kara wydajności ────────────
function _migrateV25toV26(data) {
  if (data.civ4x?.colonies) {
    for (const c of data.civ4x.colonies) {
      if (c.isOutpost) {
        // Outpost: prosperity=0 (zamrożone, bez POPów)
        if (c.prosperitySystem) {
          c.prosperitySystem.prosperity = 0;
          c.prosperitySystem.targetProsperity = 0;
        }
      }
    }
  }
  return data;
}

// ── v22 → v23: Pola handlu cywilnego per-kolonia ──────────────────────────
function _migrateV22toV23(data) {
  if (data.civ4x?.colonies) {
    for (const c of data.civ4x.colonies) {
      c.credits                 ??= 0;
      c.creditsPerYear          ??= 0;
      c.tradeCapacity           ??= 0;
      c.activeTradeConnections  ??= [];
      c.tradeOverrides          ??= {};
    }
  }
  return data;
}

// ── v26 → v27: Strata system + robots→automation_droid + nowe commodities ───
function _migrateV26toV27(data) {
  const colonies = data.civ4x?.colonies;
  if (!colonies) return data;

  for (const col of colonies) {
    // ── 1. Rename robots → automation_droid w inventory ──────────────────
    const inv = col.resources?.inventory;
    if (inv) {
      if (inv.robots !== undefined) {
        inv.automation_droid = (inv.automation_droid ?? 0) + inv.robots;
        delete inv.robots;
      }
      // Nowe commodities — defaults
      inv.microcircuits       ??= 0;
      inv.automation_droid    ??= 0;
      inv.android_worker      ??= 0;
      inv.ai_chips            ??= 0;
      inv.ai_collective_node  ??= 0;
    }

    // ── 2. Rename robots → automation_droid w FactorySystem ─────────────
    const fs = col.factorySystem;
    if (fs) {
      // Alokacje
      if (fs.allocations) {
        for (const alloc of fs.allocations) {
          if (alloc.commodityId === 'robots') alloc.commodityId = 'automation_droid';
        }
      }
      // Kolejka
      if (fs.queue) {
        for (const item of fs.queue) {
          if (item.commodityId === 'robots') item.commodityId = 'automation_droid';
        }
      }
    }

    // ── 3. Rename robots → automation_droid w commodityCost budynków ────
    if (col.buildings) {
      for (const b of col.buildings) {
        if (b.commodityCost?.robots !== undefined) {
          b.commodityCost.automation_droid = (b.commodityCost.automation_droid ?? 0) + b.commodityCost.robots;
          delete b.commodityCost.robots;
        }
      }
    }

    // ── 4. Strata — rozbij population na 7 typów ───────────────────────
    const civ = col.civ ?? {};
    const pop = civ.population ?? 2;

    if (!civ.strata) {
      const laborerCount = Math.max(1, Math.ceil(pop * 0.5));
      const minerCount   = Math.floor(pop * 0.2);
      const workerCount  = Math.floor(pop * 0.1);
      const sciCount     = Math.floor(pop * 0.1);
      const merchCount   = Math.floor(pop * 0.05);
      const engCount     = Math.floor(pop * 0.05);
      const assigned     = laborerCount + minerCount + workerCount + sciCount + merchCount + engCount;

      civ.strata = {
        laborer:    { count: laborerCount + Math.max(0, pop - assigned), growthProgress: 0, satisfaction: 65 },
        miner:      { count: minerCount,    growthProgress: 0, satisfaction: 55 },
        worker:     { count: workerCount,   growthProgress: 0, satisfaction: 60 },
        scientist:  { count: sciCount,      growthProgress: 0, satisfaction: 60 },
        merchant:   { count: merchCount,    growthProgress: 0, satisfaction: 55 },
        engineer:   { count: engCount,      growthProgress: 0, satisfaction: 60 },
        bureaucrat: { count: 0,             growthProgress: 0, satisfaction: 65 },
      };
    }

    // ── 5. Identity + Loyalty + Movements defaults ──────────────────────
    civ.identity         ??= { score: 0, events: [], dominantType: 'laborer', traits: [] };
    civ.loyaltyModifiers ??= [];
    civ.activeMovements  ??= [];

    col.civ = civ;
  }

  return data;
}

// ── v27 → v28: syntheticSlot na tile'ach ────────────────────────────────
function _migrateV27toV28(data) {
  // syntheticSlot = null domyślnie — HexTile.restore() obsługuje ?? null
  // Brak dodatkowych zmian potrzebnych — pole jest opcjonalne
  return data;
}

// ── v28 → v29: Dodaj złoże Neutronium do metalicznych planetoidów ───────
function _migrateV28toV29(data) {
  const planetoids = data.planetoids || [];
  let ntCount = 0;
  const NT_MAX = 2;

  for (const p of planetoids) {
    if (p.planetoidType !== 'metallic') continue;
    if (!p.deposits) p.deposits = [];
    // Pomijaj jeśli już ma Nt
    if (p.deposits.some(d => d.resourceId === 'Nt')) { ntCount++; continue; }
    if (ntCount >= NT_MAX) continue;

    // Aktualizuj composition
    if (p.composition) p.composition.Nt = 2.5;

    // Deterministyczny PRNG z id (jak w DepositSystem)
    const seed = typeof p.id === 'string'
      ? p.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0)
      : (p.id || 0);
    const a = 1664525, c = 1013904223, m = 2 ** 32;
    let s = ((seed >>> 0) + 12345) >>> 0; // offset żeby nie powtórzyć istniejących losowań
    const rand = () => { s = (a * s + c) % m; return s / m; };

    // richness = 2.5 / (5 × 2) = 0.25 (niska zasobność)
    const richness = 0.25;
    const boosted = data.scenario === 'civilization_boosted' ? 10 : 1;
    const totalAmount = Math.round(richness * 10000 * boosted * (1 + rand() * 0.5));

    p.deposits.push({ resourceId: 'Nt', richness, totalAmount, remaining: totalAmount });
    ntCount++;
  }

  return data;
}

// ── v29 → v30: Napraw systemId na planetach/księżycach/planetoidach ─────
// Migracja v21→v22 dodała systemId do kolonii i statków, ale pominęła encje
// ciał niebieskich. Planety z obcych układów miały systemId=undefined →
// defaultowały do 'sys_home' przy save/restore.
function _migrateV29toV30(data) {
  const ssm = data.civ4x?.starSystemManager;
  if (!ssm?.systems) return data;

  // Zbuduj mapę entityId → systemId z danych StarSystemManager
  const idToSys = new Map();
  for (const sys of ssm.systems) {
    const sysId = sys.systemId;
    if (!sysId || sysId === 'sys_home') continue;
    for (const pid of (sys.planetIds || []))    idToSys.set(pid, sysId);
    for (const mid of (sys.moonIds || []))      idToSys.set(mid, sysId);
    for (const pid of (sys.planetoidIds || [])) idToSys.set(pid, sysId);
  }

  // Napraw systemId na planetach
  for (const p of (data.planets || [])) {
    const correctSys = idToSys.get(p.id);
    if (correctSys) p.systemId = correctSys;
  }
  // Napraw systemId na księżycach
  for (const m of (data.moons || [])) {
    const correctSys = idToSys.get(m.id);
    if (correctSys) m.systemId = correctSys;
  }
  // Napraw systemId na planetoidach
  for (const p of (data.planetoids || [])) {
    const correctSys = idToSys.get(p.id);
    if (correctSys) p.systemId = correctSys;
  }
  // Napraw systemId na dodatkowych gwiazdach
  for (const s of (data.stars || [])) {
    const sys = ssm.systems.find(ss => ss.starEntityId === s.id);
    if (sys) s.systemId = sys.systemId;
  }

  return data;
}

// ── Migracja v30 → v31 ────────────────────────────────────────────────────────
// Tożsamościowa (brak zmian strukturalnych)
function _migrateV30toV31(data) {
  return data;
}

// ── Migracja v31 → v32 ────────────────────────────────────────────────────────
// Automatyzacja fabryk: dodanie mode, priorityList, customTemplates, reactiveSourceOrder
function _migrateV31toV32(data) {
  const colonies = data.civ4x?.colonies;
  if (!colonies) return data;

  for (const col of colonies) {
    if (!col.factory) continue;
    // Dodaj nowe pola jeśli nie istnieją
    if (col.factory.mode === undefined) col.factory.mode = 'manual';
    if (!col.factory.priorityList) col.factory.priorityList = [];
    if (!col.factory.customTemplates) col.factory.customTemplates = [];
    if (!col.factory.reactiveSourceOrder) {
      col.factory.reactiveSourceOrder = ['build', 'fuel', 'consumption', 'trade', 'safety'];
    }
  }

  return data;
}

// ── Migracja v32 → v33 ────────────────────────────────────────────────────────
// Usunięcie consumer_factory — konwersja na factory
function _migrateV32toV33(data) {
  const colonies = data.civ4x?.colonies;
  if (!colonies) return data;

  for (const col of colonies) {
    if (!col.buildings) continue;
    for (const b of col.buildings) {
      if (b.buildingId === 'consumer_factory') {
        b.buildingId = 'factory';
      }
    }
    // Konwersja w constructionQueue
    if (col.constructionQueue) {
      for (const entry of Object.values(col.constructionQueue)) {
        if (entry.buildingId === 'consumer_factory') {
          entry.buildingId = 'factory';
        }
      }
    }
    // Konwersja w pendingQueue
    if (col.pendingQueue) {
      for (const entry of Object.values(col.pendingQueue)) {
        if (entry.buildingId === 'consumer_factory') {
          entry.buildingId = 'factory';
        }
      }
    }
  }

  return data;
}

// ── Migracja v33 → v34 ────────────────────────────────────────────────────────
// Dodanie pola colonists + modules do statków
function _migrateV33toV34(data) {
  const vm = data.civ4x?.vesselManager;
  if (!vm?.vessels) return data;

  for (const v of vm.vessels) {
    if (v.colonists === undefined) v.colonists = 0;
    if (!v.modules) v.modules = [];
  }

  return data;
}

// v34→v35: System milestones — historia kolonii, smoothedLoyalty, suppress history
function _migrateV34toV35(data) {
  const colonies = data.civ4x?.colonies;
  if (!colonies) return data;

  for (const col of colonies) {
    const civ = col.civ;
    if (!civ) continue;

    // Domyślna historia: milestone founding
    if (!civ.colonyHistory) {
      const foundingYear = data.gameYear ?? 0;
      civ.colonyHistory = [{
        year: foundingYear,
        type: 'founding',
        namePL: `Założenie kolonii ${col.name ?? 'Kolonia'}`,
        nameEN: `Founding of ${col.name ?? 'Colony'}`,
        icon: '🏗',
        loyaltyPerm: 0,
        identityValue: 3,
      }];
    }

    // Domyślny stan milestones
    if (!civ.milestoneState) {
      civ.milestoneState = {
        consecutiveHighProsperityYears: 0,
        consecutiveLowProsperityYears: 0,
        consecutiveFamineYears: 0,
        yearsWithoutTrade: 0,
        consecutiveHighTradeYears: 0,
        consecutiveHighResearchYears: 0,
        popAtReference: civ.population ?? 2,
        popReferenceYear: 0,
        lastMilestoneYear: {},
        colonyAge: 0,
        justSurvivedDisaster: false,
        justSurvivedCrisis: false,
      };
    }

    // Wygładzony loyalty
    if (civ.smoothedLoyalty === undefined) {
      // Oblicz z istniejących danych: weighted avg satisfaction
      let weighted = 0, total = 0;
      if (civ.strata) {
        for (const s of Object.values(civ.strata)) {
          weighted += (s.count ?? 0) * (s.satisfaction ?? 50);
          total += (s.count ?? 0);
        }
      }
      civ.smoothedLoyalty = total > 0 ? weighted / total : 80;
    }

    // Nowe tablice
    civ.suppressHistory     ??= [];
    civ.productionPenalties ??= [];
    civ.autonomousState     ??= false;
  }

  return data;
}

// ── v36 → v37: Tapered hex grid — wyczyść stare prostokątne gridy ──────────
// Nowe gridy (tapered) generowane on-the-fly przy otwarciu ColonyOverlay.
// Stare grid w save → null, wymusi regenerację z nowymi rozmiarami.
function _migrateV36toV37(data) {
  const colonies = data.civ4x?.colonies;
  if (!colonies) return data;
  for (const col of colonies) {
    // Wyczyść stary prostokątny grid — nowy tapered wygeneruje się przy otwarciu
    if (col.grid && !col.grid.tapered) {
      col.grid = null;
    }
  }
  return data;
}

// ── v39 → v40: Away Team + Full Scan — awayTeamUnitId w vessels ─────────────
function _migrateV39toV40(data) {
  // Nowe pole awayTeamUnitId domyślnie null w VesselManager.restore()
  // Nowy moduł science_away_team dodany do ShipModulesData — nie wymaga migracji
  return data;
}

// ── v40 → v41: Złoże Xe na planecie domowej ─────────────────────────────────
function _migrateV40toV41(data) {
  const homeId = data.civ4x?.homePlanetId;
  if (!homeId) return data;

  // Znajdź planetę domową w tablicy planet
  const planets = data.planets ?? [];
  const home = planets.find(p => p.id === homeId);
  if (!home) return data;

  // Dodaj złoże Xe jeśli brakuje
  if (!home.deposits) home.deposits = [];
  const hasXe = home.deposits.some(d => d.resourceId === 'Xe');
  if (!hasXe) {
    home.deposits.push({
      resourceId: 'Xe', richness: 1.0, totalAmount: 50, remaining: 50,
    });
  }
  return data;
}

// ── v41 → v42: Unit Design — szablony projektów statków ─────────────────────
function _migrateV41toV42(data) {
  if (data.civ4x) {
    data.civ4x.unitDesigns = data.civ4x.unitDesigns ?? [];
  }
  return data;
}

// ── v42 → v43: LeaderSystem — frakcja i przywódca ───────────────────────────
function _migrateV42toV43(data) {
  if (data.c4x) {
    data.c4x.leaderSystem = data.c4x.leaderSystem ?? null;
  }
  return data;
}

// ── v44 → v45: FactionSystem — suwak frakcji i napięcie ─────────────────────
function _migrateV44toV45(data) {
  if (data.civ4x) {
    data.civ4x.factionSystem = data.civ4x.factionSystem ?? {
      slider:         50,
      tension:        0,
      yearsInExtreme: 0,
      crisisActive:   false,
      accumYears:     0,
    };
  }
  return data;
}

// ── v45 → v46: FactionSystem — eventy narracyjne (Faza C3) ──────────────────
function _migrateV45toV46(data) {
  if (data.civ4x?.factionSystem) {
    data.civ4x.factionSystem.triggeredEvents      = data.civ4x.factionSystem.triggeredEvents      ?? [];
    data.civ4x.factionSystem.narrativeCrisisFired = data.civ4x.factionSystem.narrativeCrisisFired ?? false;
  }
  return data;
}

// ── v47 → v48: DysonSystem (Faza D3) ───────────────────────────────────────
// Megaprojekt Sfery Dysona — 20 segmentów w 4 fazach. Stan persistowany w c4x.dysonSystem.
// Legacy save: zainicjalizuj pustą Sferą (active=false, brak segmentów ukończonych).
function _migrateV47toV48(data) {
  if (!data.civ4x) return data;
  if (!data.civ4x.dysonSystem) {
    const segments = {};
    for (let i = 1; i <= 20; i++) {
      segments[i] = { delivered: {}, completed: false };
    }
    data.civ4x.dysonSystem = {
      segments,
      unlockedPhases: [],
      completedCount: 0,
      researchBonus:  0,
      active:         false,
    };
  }
  return data;
}

// ── v48 → v49: AutoPauseSystem — domyślne ustawienia auto-pauzy ─────────────
// Stare save'y nie miały AutoPauseSystem. Pole `autoPause` jest opcjonalne —
// jeśli nie ma w save, AutoPauseSystem ładuje defaults z localStorage albo
// hardkodowane DEFAULT_SETTINGS. Nic nie trzeba dopisywać do save.
function _migrateV48toV49(data) {
  if (data.civ4x) {
    data.civ4x.autoPause = data.civ4x.autoPause ?? null;
  }
  return data;
}

// ── v49 → v50: ScheduledEventSystem — zaplanowane zdarzenia co 3-5 civYears ──
// Stare save'y nie miały ScheduledEventSystem. Pole opcjonalne —
// jeśli null, system startuje ze świeżym akumulatorem i losowym interwałem.
function _migrateV49toV50(data) {
  if (data.civ4x) {
    data.civ4x.scheduledEventSystem = data.civ4x.scheduledEventSystem ?? null;
  }
  return data;
}

// ── v50 → v51: usunięcie TradeRouteManager, natywna pętla transportowa ──────
// TradeRouteManager usunięty. Stare trasy są odrzucane — gracz stworzy pętle od nowa.
// Pole `tradeRouteManager` w c4x ignorowane (może zostać, nie szkodzi).
function _migrateV50toV51(data) {
  if (data.civ4x) {
    // Drop stare trasy handlowe (player-created) — TradeRouteManager nie istnieje
    delete data.civ4x.tradeRouteManager;
  }
  return data;
}

// ── v53 → v54: Ground Unit recruitment queue (Opcja B) ────────────────────
// Dodaje colony.groundUnitQueues = [] dla każdej kolonii. ColonyManager używa
// tej kolejki do tick'owania budowy archetypów (1.0 civYear per jednostka).
function _migrateV53toV54(data) {
  if (data.civ4x?.colonies) {
    for (const col of data.civ4x.colonies) {
      col.groundUnitQueues = col.groundUnitQueues ?? [];
    }
  }
  return data;
}

// ── v54 → v55: Opcja C v3 — Supply/Org/Morale + Barracks + upkeep ─────────
// Dodaje:
//   - colony._pendingPopReturns = [] (kolejka reintegracji POPów po śmierci unitów)
//   - colony.commodities.military_supplies = 0 (nowy commodity T2, produkowany w fabryce)
//   - Stare unity bez supply → przyznaj full supply, org=baseOrg, morale=baseMorale
//     żeby nie umarły natychmiast po loadzie (GroundUnitManager.restore też ma defaults,
//     to fallback dla danych które nie przejdą przez restore).
function _migrateV54toV55(data) {
  if (data.civ4x?.colonies) {
    for (const col of data.civ4x.colonies) {
      col._pendingPopReturns = col._pendingPopReturns ?? [];
      if (col.commodities && col.commodities.military_supplies == null) {
        col.commodities.military_supplies = 0;
      }
    }
  }

  // Ground units — zainicjalizuj supply/org/morale dla starych save'ów.
  // Defaulty: pełny supply (100), org=10, morale=10, bez transportStatus.
  // Dokładne wartości per-archetype nadpisze GroundUnitManager.restore z arch.base*.
  if (data.civ4x?.groundUnitManager?.units) {
    for (const u of data.civ4x.groundUnitManager.units) {
      u.supply            = u.supply            ?? null;   // null → restore wstawi domyślne
      u.supplyCap         = u.supplyCap         ?? null;
      u.org               = u.org               ?? null;
      u.maxOrg            = u.maxOrg            ?? null;
      u.maxMorale         = u.maxMorale         ?? null;
      u.supplyConsumption = u.supplyConsumption ?? null;
      u.transportStatus   = u.transportStatus   ?? null;
      u.prevStatus        = u.prevStatus        ?? null;
      u.unpaidYears       = u.unpaidYears       ?? 0;
      u.popCost           = u.popCost           ?? 0;
    }
  }

  return data;
}

// ── v52 → v53: Ground Unit System (archetypy + zdolności + miny + capture) ──
// Dodaje:
//   - gameState.minefields: {} (domena dla lay_minefield)
//   - groundUnitManager.captureProgress: [] (capture_building ability)
//   - groundUnitManager.passiveAccum: 0 (akumulator tick passive abilities)
// Istniejące jednostki (infantry/mech/garrison/science_rover) pozostają bez zmian —
// GroundUnitManager rozpoznaje legacy typy w restore() i nie dotyka ich kształtu.
function _migrateV52toV53(data) {
  if (data.civ4x) {
    // Domena minefields w reactive store
    if (data.civ4x.gameState) {
      data.civ4x.gameState.minefields = data.civ4x.gameState.minefields ?? {};
    }
    // Nowe pola managera
    if (data.civ4x.groundUnitManager) {
      data.civ4x.groundUnitManager.captureProgress = data.civ4x.groundUnitManager.captureProgress ?? [];
      data.civ4x.groundUnitManager.passiveAccum    = data.civ4x.groundUnitManager.passiveAccum ?? 0;
    }
  }
  return data;
}

// ── v51 → v52: GameState reactive store (Faza 0 planu war/diplomacy/AI) ─────
// Nowe domeny (empires, intel, diplomacy, wars, battles, invasions) trafiają do
// window.KOSMOS.gameState — jedyne źródło prawdy dla NOWEGO kodu. Istniejące
// systemy pozostają nietknięte. Stare save'y nie miały tego pola — dodajemy
// pustą strukturę, GameState.restore() dopełni brakujące domeny defaultami.
function _migrateV51toV52(data) {
  if (data.civ4x) {
    data.civ4x.gameState = data.civ4x.gameState ?? {
      empires:   {},
      intel:     {},
      diplomacy: { relations: {} },
      wars:      {},
      battles:   {},
      invasions: {},
    };
  }
  return data;
}

// ── v46 → v47: FactionSystem narodziny frakcji (Faza C4 + C5) ──────────────
// Faza C4: frakcje nie istnieją na starcie — odblokowują się po odkryciu Ziemi.
//   • Wszystkie istniejące save są retroaktywnie zablokowane (locked=true)
//   • Lider z legacy save traci frakcję (była ustawiana przez stary FactionSelectScene)
// Faza C5: dodatkowe pola FactionSystem dla łańcucha narodzin frakcji.
//   • _unlockedYear (rok unlock) — używane przez `two_sides_emerge` event
//   • _sabotageTriggered — guard żeby first_sabotage nie powtarzał się
function _migrateV46toV47(data) {
  if (data.civ4x?.factionSystem) {
    // Faza C4
    data.civ4x.factionSystem.locked            = data.civ4x.factionSystem.locked            ?? true;
    // Faza C5
    data.civ4x.factionSystem.unlockedYear      = data.civ4x.factionSystem.unlockedYear      ?? null;
    data.civ4x.factionSystem.sabotageTriggered = data.civ4x.factionSystem.sabotageTriggered ?? false;
  }
  if (data.civ4x?.leaderSystem) {
    // Jeśli factionSystem jest locked → wyzeruj activeFaction lidera (frakcja "nieznana")
    if (data.civ4x.factionSystem?.locked) {
      data.civ4x.leaderSystem.activeFaction = null;
      // termYears też wyzeruj — w trybie locked nie ma rotacji konsulów
      data.civ4x.leaderSystem.termYears = null;
    }
  }
  return data;
}

// ── v43 → v44: Naprawa outpostów — pending builds z zerowym kosztem ──────────
// Bug: found_outpost nie przenosił cargo do outpostu, budynki utknęły w pending
// Fix: wyzeruj koszt pending buildów na outpostach — _tickPendingQueue zrealizuje je natychmiast
function _migrateV43toV44(data) {
  const colonies = data.civ4x?.colonies;
  if (!colonies) return data;

  for (const col of colonies) {
    if (!col.isOutpost) continue;
    if (!col.pendingQueue?.length) continue;

    for (const pending of col.pendingQueue) {
      pending.cost = {};     // koszt opłacony przy wysyłce — zeruj
      pending.popCost = 0;   // outpost nie wymaga POPów
    }
  }
  return data;
}

// ── v38 → v39: System anomalii — nowe pola anomalyDetected/anomalyRevealed ──
function _migrateV38toV39(data) {
  // Pola anomalyDetected/anomalyRevealed domyślnie false w HexTile.restore()
  // Migracja nie musi nic robić — defensywne defaults wystarczą
  return data;
}

// ── v37 → v38: System jednostek naziemnych (GroundUnitManager) ──────────────
function _migrateV37toV38(data) {
  if (data.civ4x) {
    data.civ4x.groundUnitManager = data.civ4x.groundUnitManager ?? null;
  }
  return data;
}

// ── v35 → v36: pendingOutpostOrders per kolonia ─────────────────────────────
function _migrateV35toV36(data) {
  const colonies = data.civ4x?.colonies;
  if (!colonies) return data;
  for (const col of colonies) {
    if (!col.pendingOutpostOrders) col.pendingOutpostOrders = [];
  }
  return data;
}

// ── v55 → v56: EventLogSystem (zunifikowany dziennik zdarzeń) ───────────────
// Nowe pole: data.civ4x.eventLog = { entries: [], nextId: 1 }.
// Stare save'y nie mają dziennika — start z pustym.
function _migrateV55toV56(data) {
  if (data.civ4x && data.civ4x.eventLog == null) {
    data.civ4x.eventLog = { entries: [], nextId: 1 };
  }
  return data;
}

// ── v56 → v57: ProductionRequestBoard + per-kolonia acceptsExportOrders ─────
// Board zaczyna pusty. Każda kolonia dostaje domyślne preferencje eksportu:
//   { enabled: true, tiers: { 1: true, 2: true, 3: false, 4: false } }
// (Tier 1-2 przyjmowane automatycznie, Tier 3+ wymaga explicit opt-in).
// FactorySystem per-kolonia dostaje pole _everProducedHere = [] (set commodityId
// które kolonia kiedykolwiek wyprodukowała — zawęża safety stock demand).
function _migrateV56toV57(data) {
  if (!data.civ4x) return data;

  if (data.civ4x.productionRequestBoard == null) {
    data.civ4x.productionRequestBoard = {
      openRequests:   [],
      nextId:         1,
      totalCreated:   0,
      totalFulfilled: 0,
      totalExpired:   0,
    };
  }

  const colonies = data.civ4x.colonies;
  if (Array.isArray(colonies)) {
    for (const col of colonies) {
      if (col.acceptsExportOrders == null) {
        col.acceptsExportOrders = {
          enabled: true,
          tiers:   { 1: true, 2: true, 3: false, 4: false },
        };
      }
      if (col.factorySystem && col.factorySystem.everProducedHere == null) {
        // Import z istniejących alokacji — jeśli coś było alokowane/produkowane,
        // zakładamy że ta kolonia produkuje to lokalnie.
        const seen = new Set();
        for (const a of (col.factorySystem.allocations ?? [])) {
          if ((a.produced ?? 0) > 0) seen.add(a.commodityId);
        }
        col.factorySystem.everProducedHere = [...seen];
      }
    }
  }
  return data;
}

// ── v57 → v58: garrison_unit Deploy/Pack state machine ─────────────────────
// Nowe pola per-jednostka: deployState ('mobile'|'deploying'|'deployed'|'packing'),
// stateTimer (civYears pozostałe do zakończenia tranzytu, 0 gdy nie w tranzycie).
// Legacy garrisony były stacjonarne (mov=0) → defaulujemy do 'deployed' żeby
// nie zmieniać wartości bojowej istniejących save'ów. Nowe spawny z Koszar
// (po tej wersji) startują w 'mobile' — ustawiane w GroundUnitManager.createUnit.
function _migrateV57toV58(data) {
  const units = data.civ4x?.groundUnitManager?.units;
  if (!Array.isArray(units)) return data;
  for (const u of units) {
    if (u.archetypeId === 'garrison_unit' && u.deployState == null) {
      u.deployState = 'deployed';
      u.stateTimer  = 0;
    }
  }
  return data;
}

// ── Migracja v58 → v59 ──────────────────────────────────────────────────────
// Faza desantu: pola na vessel (troopBay/canDropTroops/orbitalStrike), fleet
// (hasTroopTransport/troopCapacity), gameState.orbitalDominance.
function _migrateV58toV59(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!Array.isArray(v.groundUnits)) v.groundUnits = [];
      if (v.troopCapacity == null) v.troopCapacity = 0;
      if (v.troopBayUsed == null) v.troopBayUsed = 0;
      if (v.canDropTroops == null) v.canDropTroops = false;
      if (v.orbitalStrike === undefined) v.orbitalStrike = null;
    }
  }

  // Obce floty — hasTroopTransport (domyślnie false dla legacy save)
  const empires = data.gameState?.empires ?? data.empires;
  if (empires && typeof empires === 'object') {
    for (const emp of Object.values(empires)) {
      if (!emp?.fleets) continue;
      for (const f of emp.fleets) {
        if (f.hasTroopTransport == null) f.hasTroopTransport = false;
        if (f.troopCapacity == null) f.troopCapacity = 0;
      }
    }
  }

  // orbitalDominance — pusty obiekt (stary save = brak historii bitew)
  if (data.gameState && !data.gameState.orbitalDominance) {
    data.gameState.orbitalDominance = {};
  }

  return data;
}

// ── Migracja v60 → v61 ──────────────────────────────────────────────────────
// Victoria 2 stack combat: ranged units support target (null domyślnie)
function _migrateV60toV61(data) {
  const units = data.civ4x?.groundUnitManager?.units;
  if (Array.isArray(units)) {
    for (const u of units) {
      if (u.supportTarget === undefined) u.supportTarget = null;
    }
  }
  return data;
}

// ── Migracja v61 → v62 ──────────────────────────────────────────────────────
// Grupy bojowe Ctrl+1..9 w ColonyOverlay: nowe pole controlGroups (pusty default)
function _migrateV61toV62(data) {
  if (data.civ4x && !data.civ4x.colonyOverlay) {
    data.civ4x.colonyOverlay = { controlGroups: {} };
  } else if (data.civ4x?.colonyOverlay && !data.civ4x.colonyOverlay.controlGroups) {
    data.civ4x.colonyOverlay.controlGroups = {};
  }
  return data;
}

// ── Migracja v62 → v63 ──────────────────────────────────────────────────────
// ArmySystem: nowe pole data.civ4x.armySystem z pustą tablicą armii
function _migrateV62toV63(data) {
  if (data.civ4x && !data.civ4x.armySystem) {
    data.civ4x.armySystem = { armies: [], nextId: 1 };
  }
  return data;
}

// ── Migracja v63 → v64 ──────────────────────────────────────────────────────
// OrbitalSpaceSystem — sferyczne przestrzenie orbitalne wokół planet.
// Dla każdego vessela z stanem 'orbiting' generujemy deterministyczną orbitę
// (r, θ, φ) z hasha vesselId, w preferowanym zakresie radialnym wg roli.
// Wraki trafiają do graveyard range (1.2–1.5); żywe statki do LEO/MEO.
function _migrateV63toV64(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (!c4x) return data;

  // Jeśli orbitalSpace już istnieje (nowa gra rozpoczęta w v64+) — pomiń
  if (c4x.orbitalSpace) return data;

  const spheres = {};
  const vessels = c4x.vesselManager?.vessels ?? [];

  // Prosty FNV-1a hash (powiela logikę w OrbitalSpaceSystem dla determinizmu)
  const hashStr = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < (s?.length ?? 0); i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };

  // Rezolucja roli z migracji — prosty heurystyczny wariant (bez modułów API)
  const resolveRoleFromSave = (v) => {
    if (v.isWreck) return 'wreck';
    const modules = v.modules ?? [];
    const hasWeapon = modules.some(m => typeof m === 'string' && m.startsWith('weapon_'));
    const hasScience = modules.some(m => {
      const id = typeof m === 'string' ? m : m?.id;
      return id === 'science_lab' || id === 'deep_scanner' || id === 'quantum_scanner';
    });
    if (hasScience) return 'science';
    if (hasWeapon)  return 'warship';
    if ((v.cargoMax ?? 0) > 0) return 'cargo';
    return 'default';
  };

  // Index planet/moon z save dla szybkiego lookup body radius
  const bodiesById = new Map();
  for (const p of (data.planets ?? [])) bodiesById.set(p.id, p);
  for (const m of (data.moons ?? [])) bodiesById.set(m.id, m);
  for (const pd of (data.planetoids ?? [])) bodiesById.set(pd.id, pd);

  for (const v of vessels) {
    if (v.position?.state !== 'orbiting' || !v.position.dockedAt) continue;
    const planetId = v.position.dockedAt;
    const role = resolveRoleFromSave(v);
    const roleDef = ORBITAL_ROLES[role] ?? ORBITAL_ROLES.default;

    // Znajdź body w save i policz bodyRadius (skala adekwatna do planety)
    const body = bodiesById.get(planetId) ?? null;
    const bodyRadius = computeBodyRadius(body);
    const range = getOrbitRange(role, bodyRadius);

    const h = hashStr(v.id ?? String(Math.random()));
    const r   = range.rMin + ((h & 0xFF) / 255) * (range.rMax - range.rMin);
    const θ   = ((h >>> 8) & 0xFFFF) / 0xFFFF * 2 * Math.PI;
    const φ   = roleDef.phiCenter + (((h >>> 24) & 0xFF) / 255 - 0.5) * 2 * roleDef.phiDelta;

    if (!spheres[planetId]) spheres[planetId] = [];
    spheres[planetId].push({
      objectId: v.id,
      role,
      r,
      theta0: θ,
      phi:    φ,
      omega:  role === 'station' ? 0 : roleDef.omegaBase,
      anchored: role === 'station',
      spawnYear: v.wreckedAt ?? 0,
    });
  }

  c4x.orbitalSpace = { spheres };
  return data;
}

// ── Migracja v64 → v65 ──────────────────────────────────────────────────────
// Milestone 1 (Targeting Foundation) — schema defaults:
//   (a) vessel.endurance (stub, baseline drain/regen odtwarzane przy restore z modułów)
//   (b) vessel.movementOrder (null — brak aktywnego rozkazu)
//   (c) empire.fleets[].materializedVesselIds / materializationState / lastMaterializedAt
// Uwaga: vessel.velocity celowo NIE jest migrowane — pole derived, liczone z delty pozycji
//        per tick (patrz docs/design/milestone-1-targeting-foundation.md §2.1).
function _migrateV64toV65(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (!c4x) return data;

  // (a) + (b) — vessels
  const vessels = c4x.vesselManager?.vessels ?? [];
  for (const v of vessels) {
    if (!v.endurance) {
      v.endurance = {
        current:      100,
        max:          100,
        lastDepleted: null,
        // drainPerYear/regenPerYear — NIE serializujemy; restore pobiera z hull/modułów
      };
    }
    if (v.movementOrder === undefined) v.movementOrder = null;
  }

  // (c) — empire fleets shadow materialization slots
  const empires = data.gameState?.empires ?? data.empires;
  if (empires && typeof empires === 'object') {
    for (const emp of Object.values(empires)) {
      if (!emp?.fleets) continue;
      for (const f of emp.fleets) {
        if (!Array.isArray(f.materializedVesselIds)) f.materializedVesselIds = [];
        if (!f.materializationState) f.materializationState = 'abstract';
        if (f.lastMaterializedAt === undefined) f.lastMaterializedAt = null;
      }
    }
  }

  return data;
}

// ── Migracja v65 → v66 ──────────────────────────────────────────────────────
// Milestone 2a (Combat Core) — schema defaults:
//   (a) vessel.wreckLocation (null — set przy deep-space wreck, commit 5)
//   (b) vessel.movementOrder.retreatFromBattleId (null — marker dla auto-retreat orderów)
//   (c) battleRec.location: string → { systemId, planetId: null, point: null }
// Feature flagi proximitySystem/vesselCombat/unifiedAggregator czyta się
// z GAME_CONFIG.FEATURES — save ich nie trzyma.
function _migrateV65toV66(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x) {
    // (a) + (b) — vessels
    const vessels = c4x.vesselManager?.vessels ?? [];
    for (const v of vessels) {
      if (v.wreckLocation === undefined) v.wreckLocation = null;
      if (v.movementOrder && v.movementOrder.retreatFromBattleId === undefined) {
        v.movementOrder.retreatFromBattleId = null;
      }
    }
  }

  // (c) — battleRec.location legacy string → object
  const gs = data.gameState;
  if (gs?.battles && typeof gs.battles === 'object') {
    for (const br of Object.values(gs.battles)) {
      if (!br || typeof br !== 'object') continue;
      if (typeof br.location === 'string') {
        br.location = { systemId: br.location, planetId: null, point: null };
      } else if (!br.location) {
        br.location = { systemId: 'sys_home', planetId: null, point: null };
      }
    }
  }

  return data;
}

// ── Migracja v66 → v67 ──────────────────────────────────────────────────────
// Milestone 2b (Intelligence + POI) — schema defaults:
//   (a) gameState.pois = {} (POIRegistry; Commit 5 zacznie używać)
//   (b) gameState.intel.vessels = {} (IntelSystem.vessels sub-domain; Commit 2)
//   (c) vessel.movementOrder pola: poiId/predictionCone/patrolWaypointIndex/
//       patrolDirection/escorteeId — wymagane przez Commits 3/6/7.
// Feature flagi intelContactState/predictionCone/poiSystem czyta się z
// GAME_CONFIG.FEATURES — save ich nie trzyma. Defaults runtime w MOS
// (3 issue methods) — patrz Commit 1 raport.
function _migrateV66toV67(data) {
  const gs = data.gameState ?? {};

  // (a) POI registry init (Commit 5 utworzy POIRegistry i będzie wpisywał poi_*)
  if (!gs.pois) gs.pois = {};

  // (b) IntelSystem.vessels sub-domain (Commit 2 wypełni przy obserwacjach)
  if (!gs.intel) gs.intel = {};
  if (!gs.intel.vessels) gs.intel.vessels = {};

  // Re-attach gameState gdy data.gameState było undefined (legacy edge case).
  if (!data.gameState) data.gameState = gs;

  // (c) vessel.movementOrder pola — defaults dla aktywnych orderów
  const c4x = data.civ4x ?? data.c4x;
  const vessels = c4x?.vesselManager?.vessels ?? [];
  for (const v of vessels) {
    if (!v.movementOrder) continue;
    if (v.movementOrder.poiId === undefined)               v.movementOrder.poiId = null;
    if (v.movementOrder.predictionCone === undefined)      v.movementOrder.predictionCone = null;
    if (v.movementOrder.patrolWaypointIndex === undefined) v.movementOrder.patrolWaypointIndex = 0;
    if (v.movementOrder.patrolDirection === undefined)     v.movementOrder.patrolDirection = 1;
    if (v.movementOrder.escorteeId === undefined)          v.movementOrder.escorteeId = null;
  }

  return data;
}

// ── Migracja v67 → v68 ──────────────────────────────────────────────────────
// M3 P3.1 (Picket + Rally runtime systems) — runtime fields dla POI:
//   - triggered: false           — picket alarm fired (cooldown active)
//   - cooldownEndsAt: null       — gameTime po którym picket może znów triggerować
//   - complete: false            — rally zebrany (one-time event)
//   - currentMembers: 0          — liczba vessels w zasięgu rally (UI display)
//   - completedYear: null        — gameTime gdy rally zebrany
// Backward compatible — old saves load OK z lazy default pattern, ale tutaj
// nadajemy explicit defaults dla deterministic state.
function _migrateV67toV68(data) {
  const gs = data.gameState ?? {};
  const pois = gs.pois ?? {};
  for (const poiId in pois) {
    const poi = pois[poiId];
    if (!poi || typeof poi !== 'object') continue;
    if (poi.triggered === undefined)      poi.triggered = false;
    if (poi.cooldownEndsAt === undefined) poi.cooldownEndsAt = null;
    if (poi.complete === undefined)       poi.complete = false;
    if (poi.currentMembers === undefined) poi.currentMembers = 0;
    if (poi.completedYear === undefined)  poi.completedYear = null;
  }
  if (!data.gameState) data.gameState = gs;
  return data;
}

// ── Migracja v68 → v69 ──────────────────────────────────────────────────────
// M4 P1 — Activation + Notifications + Drift fix.
// Nowe pola per-vessel (oba lazy-defaultowane w MOS i AutoRetreatSystem, ale
// nadajemy explicit defaults dla deterministic state przy restore):
//   - vessel.driftIdle: null          — drift state po pursue/intercept na vessel target
//     ({ sinceYear, autoReturnYear } gdy aktywny; null gdy nie ma)
//   - vessel.lowFuelDrift: null       — marker auto-retreat low fuel fallback
//     ({ sinceYear, destPlanetId, originBattleId })
//
// Vessels are stored under c4x.vesselManager.vessels — spójnie z poprzednimi
// migracjami (V59toV60 itp.).
function _migrateV68toV69(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v || typeof v !== 'object') continue;
      if (v.driftIdle === undefined)     v.driftIdle = null;
      if (v.lowFuelDrift === undefined)  v.lowFuelDrift = null;
    }
  }
  return data;
}

// ── Migracja v69 → v70 ──────────────────────────────────────────────────────
// M4 P2 — Sensor overlay + Enemy ghosts + MiniMap + Wraki battle history.
//   - uiPrefs.sensorOverlayVisible (BottomBar Radar toggle) — default false
//   - vessel.lastBattleId / lastBattleYear (Battle history per vessel) —
//     stampowane przez VesselManager battle:resolved listener. Stare save
//     przed P2 nie mają tej info — null jako sensowny default
//     (FleetManagerOverlay renderuje "Brak rekordu bitwy").
// ── Migracja v70 → v71 (M4 P3 — Tick-based Deep-Space Combat) ──────────────
// - deepSpaceEngagements: persist encounter state (Map<id, encounter>) między
//   sesjami. Save mid-combat → restore tworzy DSCS._activeEncounters z tymi
//   danymi. Encounter zawiera vesselStates Map (serializowany jako object).
//   Default {} — istniejące save (v70) nie mają combat w toku.
// - vessel.movementOrder.engageTargetId: shorthand dla DSCS._pickTarget
//   (engage priority). Lazy default null — wszystkie istniejące orders
//   (moveToPoint/pursue/intercept/escort) nie mają engageTargetId.
function _migrateV70toV71(data) {
  // Encounter records (DSCS state — persist between sessions)
  const c4x = data.civ4x ?? data.c4x;
  if (c4x) {
    if (c4x.deepSpaceEngagements === undefined) c4x.deepSpaceEngagements = {};
  }

  // Vessel engage order target (lazy default null)
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v || typeof v !== 'object') continue;
      if (v.movementOrder && v.movementOrder.engageTargetId === undefined) {
        v.movementOrder.engageTargetId = null;
      }
    }
  }
  return data;
}

// ── Migracja v71 → v72 ──────────────────────────────────────────────────────
// NotificationCenter — silent notifications (odkrycia ciał bez pauzy gry).
//   - c4x.notificationCenter: { items[], nextId } — default puste.
// Stare save (v71) nie miały żadnych notyfikacji, więc puste są właściwym defaultem.
function _migrateV71toV72(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x) {
    if (c4x.notificationCenter === undefined) {
      c4x.notificationCenter = { items: [], nextId: 1 };
    }
  }
  return data;
}

// ── Migracja v72 → v73 (Player Fleet Groups, P1) ────────────────────────────
// - c4x.playerFleets: { fleets: [], nextId: 1 } — rejestr logicznych grup statków.
//   Default puste — stare save (v72) nie znały koncepcji floty.
// - per vessel: v.fleetId ??= null. Reactive mirror członkostwa; authoritative
//   to playerFleets.fleets[].memberIds. Po restore FleetSystem re-ustawi pole
//   na podstawie memberIds (na razie wszystkie null).
// - data.uiPrefs.selectedFleetId: null — UI overlay state (P2 wykorzystuje
//   przy fleet-context selekcji; w P1 zarezerwowane).
// v74 → v75: HP persistence (P3 polish). Vessels NIE regenerują się
// automatycznie po bitwie — combatDamage stampowany w DSCS._finalizeBattle
// dla żywych ocalałych. _buildVesselState czyta przy następnej bitwie.
// Lazy default null (vessel bez bitwy = pełne HP).
function _migrateV74toV75(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v || typeof v !== 'object') continue;
      if (v.combatDamage === undefined) v.combatDamage = null;
    }
  }
  return data;
}

// v75 → v76: Slice 1 — Empire AI ECS Economy. CLEAN BREAK.
// Refaktor EmpireRegistry usunął scalary military.power/resources.production/tech.level,
// zmienił colonies na [colonyId, ...] (string array), dodał currentStrategy,
// kolonie dostały pole ownerEmpireId. Imperium AI startuje z REALNĄ kolonią
// typu Colony (EmpireColonyBootstrap) zamiast abstrakcyjnych scalarów.
//
// Stary save v75 jest niekompatybilny ze nową strukturą empire/colony — nie
// migrujemy, tylko sygnalizujemy gracza żeby zaczął nową grę.
function _migrateV75toV76(_data) {
  throw new Error(
    'Save v75 niekompatybilny ze Slice 1. Imperium AI zostało przepisane. ' +
    'Rozpocznij nową grę. (Save v75 incompatible with Slice 1. Empire AI rewritten. Please start new game.)'
  );
}

// v76 → v77: Slice 2 S3 — EmpireLogisticsSystem (logistyka AI route-based).
// Nowe pola:
//   (a) empire.logistics — stan tras kurierskich per imperium (gameState.empires).
//       { routes:[], reserve:[], pendingBuildRoute:null, stats:{built,dispatched,delivered} }.
//       EmpireLogisticsSystem lazy-defaultuje to też w runtime (_ensureLogistics),
//       ale stampujemy explicit dla deterministycznego stanu po restore.
//   (b) vessel.assignedRouteId — ID trasy kuriera (null dla nie-kurierów).
function _migrateV76toV77(data) {
  // (a) empire.logistics — empires żyją w gameState (pod civ4x.gameState.empires;
  //     defensywnie sprawdzamy też alternatywne lokalizacje znane z innych migracji).
  const empires =
    data.civ4x?.gameState?.empires ??
    data.c4x?.gameState?.empires ??
    data.gameState?.empires ??
    data.empires;
  if (empires && typeof empires === 'object') {
    for (const emp of Object.values(empires)) {
      if (!emp || typeof emp !== 'object') continue;
      if (!emp.logistics) {
        emp.logistics = {
          routes:           [],
          reserve:          [],
          pendingBuildRoute: null,
          stats:            { built: 0, dispatched: 0, delivered: 0 },
        };
      }
    }
  }

  // (b) vessel.assignedRouteId — lazy default null
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v || typeof v !== 'object') continue;
      if (v.assignedRouteId === undefined) v.assignedRouteId = null;
    }
  }

  return data;
}

// v77 → v78: Save/restore kolonii AI (#2) + outposty w EmpireRegistry (#14).
// Nowe pola w civ4x:
//   (a) empireTech — map empireId → researched[] (per-empire aiTech). Stare save:
//       puste {} → GameScene re-link fallbackuje na archetype.startingTechs.
//   (b) empireStrategy — { blacklist: [] } (EmpireStrategySystem backoff celów).
// ownerEmpireId/aiTech są re-linkowane w runtime z emp.colonies (bez pola na kolonii),
// więc migracja ustawia tylko lazy defaults. Outposty starych save NIE były w
// emp.colonies (pre-#14) → po load zostają graczem (fix-forward — AI save nigdy nie
// round-tripował). Pełne kolonie AI BYŁY w emp.colonies → re-link je naprawia.
function _migrateV77toV78(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x && typeof c4x === 'object') {
    if (!c4x.empireTech || typeof c4x.empireTech !== 'object') c4x.empireTech = {};
    if (!c4x.empireStrategy || typeof c4x.empireStrategy !== 'object') {
      c4x.empireStrategy = { blacklist: [] };
    }
  }
  return data;
}

// v78 → v79: S3.0a — spłaszczenie paliwa 3→2. fuelType power_cells/plasma_cores → 'fuel'.
//   (1) statki: root vessel.fuelType + nested vessel.fuel.fuelType remap (zachowaj fuel.current/max).
//   (2) kolonie: inventory.fuel ??= 30 — by istniejące statki mogły tankować (nowe gry: grant 50).
//   (3) power_cells/plasma_cores w inventory ZOSTAJĄ (commodity budowlane) — brak akcji.
//   warp_cores NIE jest ruszany (engine_warp niezmieniony).
function _migrateV78toV79(data) {
  const c4x = data.civ4x ?? data.c4x;
  // (1) remap fuelType na statkach (root + nested)
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v || typeof v !== 'object') continue;
      if (v.fuelType === 'power_cells' || v.fuelType === 'plasma_cores') v.fuelType = 'fuel';
      if (v.fuel && (v.fuel.fuelType === 'power_cells' || v.fuel.fuelType === 'plasma_cores')) {
        v.fuel.fuelType = 'fuel';
      }
    }
  }
  // (2) startowy zapas fuel w koloniach (stopgap dla starych save)
  if (Array.isArray(c4x?.colonies)) {
    for (const col of c4x.colonies) {
      const inv = col.resources?.inventory;
      if (inv && inv.fuel == null) inv.fuel = 30;
    }
  }
  return data;
}

// v79 → v80: S3.0a (b) — Wodór jako surowiec. Backfill złóż H jest entity-level w GameScene
//   (_restoreSystem, wymaga DepositSystem + composition). Tu tylko nowy klucz inventory.
//   Nowe gry: ResourceSystem seeduje H:0; generateDeposits robi złoża H automatycznie.
function _migrateV79toV80(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (Array.isArray(c4x?.colonies)) {
    for (const col of c4x.colonies) {
      const inv = col.resources?.inventory;
      if (inv && inv.H == null) inv.H = 0;
    }
  }
  return data;
}

// v80 → v81: S3.0a (e) — pętla transportowa best-effort.
// Dodaje trwały `outboundCargoSpec` (spec ładunku wylotowego) + trackery produktywności
// (`_lastOutLoaded`, `_lastRetLoaded`, `_unproductiveNotified`) do misji-pętli.
// outboundCargoSpec odzyskiwany z żywego `cargo`, gdy save złapany w trakcie legu outbound;
// inaczej {} (manifest wylotowy fizycznie nieobecny — był ręczny w starym modelu waiting_reload).
function _migrateV80toV81(data) {
  const c4x = data.civ4x ?? data.c4x;
  const block = c4x?.missions ?? c4x?.expeditions;
  const missions = block?.missions ?? block?.expeditions;
  if (Array.isArray(missions)) {
    for (const m of missions) {
      if (!m || typeof m !== 'object' || !m.loop) continue;
      if (m.outboundCargoSpec == null) {
        m.outboundCargoSpec = (m.leg === 'outbound' && m.cargo && Object.keys(m.cargo).length > 0)
          ? { ...m.cargo }   // odzysk z manifestu wylotowego w locie
          : {};              // nieodzyskiwalny — pętla poleci pusto na wylocie
      }
      if (m._lastOutLoaded === undefined) {
        m._lastOutLoaded = Object.values(m.outboundCargoSpec).reduce((s, v) => s + (v ?? 0), 0);
      }
      if (m._lastRetLoaded === undefined)        m._lastRetLoaded = 0;
      if (m._unproductiveNotified === undefined) m._unproductiveNotified = false;
    }
  }
  return data;
}

// v81 → v82: S3.0b S1 — model dwu-bakowy (fuel in-system + warpFuel skoki).
// Każdy statek dostaje bak warpFuel (warp_cores). Bak in-system ZAWSZE 'fuel'
// (porzucenie "ostatni silnik wygrywa"). RESCUE dla statków legacy-warp: stary
// pojedynczy bak trzymał warp_cores → przenosimy do warpFuel, in-system reset do
// świeżej rezerwy 'fuel'. Statki bez Komory Warp: warpFuel.max=0 (nie skaczą).
function _migrateV81toV82(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v || typeof v !== 'object') continue;
      // Wykryj statek warp: stary pojedynczy bak trzymał warp_cores (definitywny sygnał — skutek
      // "ostatni silnik wygrywa") LUB ma moduł engine_warp. fuel.fuelType jest pierwszorzędne.
      const oldFuelWasWarp = !!(v.fuel && v.fuel.fuelType === 'warp_cores');
      const isLegacyWarp = oldFuelWasWarp || (Array.isArray(v.modules) && v.modules.includes('engine_warp'));
      v.fuelType = 'fuel';   // root: bak in-system ZAWSZE fuel

      if (oldFuelWasWarp) {
        // RESCUE: stary pojedynczy bak trzymał warp_cores → przenieś do nowego baku warp.
        v.warpFuel = {
          current:     v.fuel.current ?? 0,
          max:         Math.max(v.fuel.max ?? 0, 5),
          consumption: 0.5,
          fuelType:    'warp_cores',
        };
        // Świeża rezerwa in-system (statek nie utknie po reformie).
        v.fuel = { current: 8, max: 8, consumption: 0.5, fuelType: 'fuel' };
      } else {
        if (v.fuel && typeof v.fuel === 'object') v.fuel.fuelType = 'fuel';
        if (v.warpFuel == null) {   // lazy default — bez Komory Warp: max 0
          v.warpFuel = { current: 0, max: isLegacyWarp ? 5 : 0, consumption: 0.5, fuelType: 'warp_cores' };
        }
      }
    }
  }
  return data;
}

// v82 → v83: S3.2 S2 — model badań AI (EmpireResearchSystem).
//   empire.research = { queueIndex, progress } — postęp kolejki badań per imperium.
//   Empires żyją w gameState (round-trip), więc nowe pole serializuje się samo;
//   migracja stampuje lazy default na starych save (mirror v76→v77 empire.logistics).
//   EmpireResearchSystem._ensureResearch też defaultuje w runtime (belt-and-suspenders).
function _migrateV82toV83(data) {
  const empires =
    data.civ4x?.gameState?.empires ??
    data.c4x?.gameState?.empires ??
    data.gameState?.empires ??
    data.empires;
  if (empires && typeof empires === 'object') {
    for (const emp of Object.values(empires)) {
      if (!emp || typeof emp !== 'object') continue;
      if (!emp.research || typeof emp.research !== 'object') {
        emp.research = { queueIndex: 0, progress: 0 };
      }
    }
  }
  return data;
}

// v84 → v85: S3.3b-S3b — magazyn OGÓLNY stacji (HUB handlowy). fuelStore/fuelCapacity (placeholder, 0)
//   → depot lazy {} (lub {fuel} gdy fuelStore>0 z debug). Magazyn przyjmuje dowolne towary (StationDepot
//   bez filtra). stationSystem null/brak na starych save → pętla pominięta (Array.isArray). Idempotentne (!s.depot).
// v85 → v86: utrzymanie floty — licznik nieopłaconych lat per vessel (S3.5a-1).
//   WYMUSZONY reset do 0 (nie tylko default dla undefined): stare save mogły mieć zawyżone
//   unpaidYears z buggy cadence per-civYear (12×/rok gry) → statki na starcie immobilized mimo
//   dodatnich kredytów. Reset = czysty start. Ścieżka: data.civ4x.vesselManager.vessels[].
// ── v86 → v87: Reforma EconomyOverlay — gracz produkuje wyłącznie reactive ──
// UI usuwa tryby manual/priority dla gracza → wymuś reactive na fabrykach
// serializowanych kolonii (= kolonie gracza; AI rekonstruowane osobno).
// + dodaj puste jednorazowe zlecenie (one-shot).
// v87 → v88: Warp multi-hop (WarpRouteSystem) — lazy default vessel.warpRoute=null.
//   Restore i tak robi `&& Array.isArray` fallback, ale stamp tutaj dla spójności
//   łańcucha wersji (konwencja repo). Brak innych zmian formatu.
// v89 → v90: S3.4 FAZA 1 — stacje orbitalne dostają moduły + populację załogi.
// Istniejące stacje: wyposażenie startowe (1× habitat + 1× power_atom, wzór createStation),
// pop=0, pusta kolejka modułów. Nowe pola round-tripują przez StationSystem.serialize/restore
// (constructor Station: ?? default). stationSystem null/brak (save bez stacji) → pętla nie
// rusza (guard Array.isArray) — jak _migrateV84toV85. popCapacity NIE jest polem (pochodna z modules).
// ── Migracja v90 → v91 (Strefy wpływów — kolor tożsamości imperiów) ──────────
// empire.color: stare imperia bez koloru → deterministyczny dobór (id posortowane):
//   archetyp → pierwszy wolny slot EMPIRE_COLOR_PALETTE, z wykluczeniem koloru gracza.
// player.empireColor: seedowane '#33ccff' (createDefaultState i tak je doda przy
//   restore, ale zapisujemy jawnie dla spójności save'a). Idempotentna.
// ── Migracja v91 → v92 (Zunifikowana warstwa rozkazów — Slice A/C) ───────────
// (a) Self-heal systemId: stare save'y zwijały systemId tranzytowy (null) do
//     'sys_home' (serialize ?? 'sys_home' + _migrateV21toV22:801). Statek, którego
//     faza minęła 'warp_transit', już nigdy nie odpali arrival-hooka (:2197) →
//     był trwale mis-homed w rejestrze. Tu: warp_transit → null (przywróć znacznik),
//     inaczej systemId := mission.toSystemId (napraw przylot).
// (b) vessel.pendingOrder default null (druga noga rozkazu composite — Slice C).
// (c) Defensywnie: mission.originSystemId/destSystemId default 'sys_home' (Slice E;
//     odczyt i tak ma ?? 'sys_home', ale unikamy undefined w traffic).
// Idempotentna.
function _migrateV91toV92(data) {
  const c4x = data.civ4x ?? data.c4x;
  for (const v of (c4x?.vesselManager?.vessels ?? [])) {
    if (!v || typeof v !== 'object') continue;
    const m = v.mission;
    if (m && m.type === 'interstellar_jump' && m.toSystemId) {
      if (m.phase === 'warp_transit') v.systemId = null;                 // przywróć tranzyt
      else if (v.systemId !== m.toSystemId) v.systemId = m.toSystemId;   // napraw mis-homed
    }
    if (v.pendingOrder === undefined) v.pendingOrder = null;
  }
  const block = c4x?.missions ?? c4x?.expeditions;
  const missions = block?.missions ?? block?.expeditions;
  if (Array.isArray(missions)) {
    for (const mm of missions) {
      if (!mm || typeof mm !== 'object') continue;
      if (mm.originSystemId === undefined) mm.originSystemId = 'sys_home';
      if (mm.destSystemId   === undefined) mm.destSystemId   = 'sys_home';
    }
  }
  return data;
}

function _migrateV90toV91(data) {
  const gs = data.civ4x?.gameState ?? data.gameState;
  if (!gs) return data;
  gs.player ??= {};
  gs.player.empireColor ??= '#33ccff';
  const empires = gs.empires;
  if (empires && typeof empires === 'object') {
    const used = new Set([String(gs.player.empireColor).toLowerCase()]);
    for (const emp of Object.values(empires)) if (emp?.color) used.add(String(emp.color).toLowerCase());
    for (const id of Object.keys(empires).sort()) {
      const emp = empires[id];
      if (!emp || emp.color) continue;
      const arch = ARCHETYPES[emp.archetype]?.color;
      let color = (arch && !used.has(arch.toLowerCase())) ? arch : null;
      if (!color) color = EMPIRE_COLOR_PALETTE.find(c => !used.has(c.toLowerCase())) ?? arch ?? '#888888';
      emp.color = color;
      used.add(color.toLowerCase());
    }
  }
  return data;
}

function _migrateV89toV90(data) {
  const c4x = data.civ4x ?? data.c4x;
  const stations = c4x?.stationSystem;
  if (Array.isArray(stations)) {
    for (const s of stations) {
      if (!s || typeof s !== 'object') continue;
      if (!Array.isArray(s.modules) || s.modules.length === 0) s.modules = createStarterModules();
      if (typeof s.pop !== 'number') s.pop = 0;
      if (!Array.isArray(s.pendingModuleOrders)) s.pendingModuleOrders = [];
    }
  }
  return data;
}

function _migrateV87toV88(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (v && typeof v === 'object' && v.warpRoute === undefined) v.warpRoute = null;
    }
  }
  return data;
}

// v88→v89 — reforma obserwatorium: dwupoziomowy intel ciał.
// Nowe pole `analyzed` (poziom szczegółowy). Stary save: ciała `explored` (przez
// stary pasywny skan) pokazywały PEŁNE złoża → backfill analyzed=explored zachowuje
// to wyświetlanie. Inwariant: analyzed ⇒ explored. Ciała są top-level (data.planets/...).
function _migrateV88toV89(data) {
  for (const p of (data.planets    || [])) if (p.analyzed == null) p.analyzed = !!p.explored;
  for (const m of (data.moons      || [])) if (m.analyzed == null) m.analyzed = !!m.explored;
  for (const p of (data.planetoids || [])) if (p.analyzed == null) p.analyzed = !!p.explored;
  return data;
}

function _migrateV86toV87(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.colonies) {
    for (const c of c4x.colonies) {
      if (c?.factorySystem) {
        c.factorySystem.mode = 'reactive';   // force (nadpisuje manual/priority ze starych save)
        c.factorySystem.oneShotJob ??= null;
      }
    }
  }
  return data;
}

function _migrateV85toV86(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v || typeof v !== 'object') continue;
      v.unpaidYears = 0;   // force reset (nie ?? — celowo nadpisuje zawyżone wartości ze starych save)
    }
  }
  return data;
}

function _migrateV84toV85(data) {
  const c4x = data.civ4x ?? data.c4x;
  const stations = c4x?.stationSystem;
  if (Array.isArray(stations)) {
    for (const s of stations) {
      if (!s.depot) s.depot = (s.fuelStore > 0) ? { fuel: s.fuelStore } : {};
      delete s.fuelStore;
      delete s.fuelCapacity;
    }
  }
  return data;
}

// v83 → v84: S3.3b-S2 — stacje orbitalne. Encje w civ4x.stationSystem (StationSystem.serialize),
//   orbita w civ4x.orbitalSpace (OrbitalSpaceSystem) — oba round-tripują przez własne serializery.
//   Tu tylko lazy-default pendingStationOrders per-kolonia (Wariant A: instant materialize, brak
//   pól started/progress). stationSystem null/brak na starych save → StationSystem.restore(null)
//   to no-op (guard Array.isArray) — encji stacji po prostu nie ma.
function _migrateV83toV84(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x && Array.isArray(c4x.colonies)) {
    for (const col of c4x.colonies) {
      if (!Array.isArray(col.pendingStationOrders)) col.pendingStationOrders = [];
    }
  }
  return data;
}

// v73 → v74: Player Fleet Groups P3 (Doctrine effects).
// Każda flota dostaje retreatThreshold (default 0.5) — konfigurowalny próg
// auto-wycofania dla doctrine='retreat_at_50' (FleetSystem._tickCivYears).
// Lazy default — restoreFleet i tak robi clamp + fallback, ale stamp tutaj
// dla explicitness w serialized data.
function _migrateV73toV74(data) {
  const c4x = data.civ4x ?? data.c4x;
  const pf  = c4x?.playerFleets;
  if (pf?.fleets && Array.isArray(pf.fleets)) {
    for (const f of pf.fleets) {
      if (!f || typeof f !== 'object') continue;
      if (f.retreatThreshold === undefined) f.retreatThreshold = 0.5;
    }
  }
  return data;
}

function _migrateV72toV73(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x) {
    if (c4x.playerFleets === undefined) {
      c4x.playerFleets = { fleets: [], nextId: 1 };
    }
    if (c4x.vesselManager?.vessels) {
      for (const v of c4x.vesselManager.vessels) {
        if (!v || typeof v !== 'object') continue;
        if (v.fleetId === undefined) v.fleetId = null;
      }
    }
  }
  data.uiPrefs ??= {};
  if (data.uiPrefs.selectedFleetId === undefined) {
    data.uiPrefs.selectedFleetId = null;
  }
  return data;
}

function _migrateV69toV70(data) {
  // uiPrefs (per-save preferences UI)
  data.uiPrefs ??= {};
  if (data.uiPrefs.sensorOverlayVisible === undefined) {
    data.uiPrefs.sensorOverlayVisible = false;
  }

  // Vessels — battle history pola
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (!v || typeof v !== 'object') continue;
      if (v.lastBattleId === undefined)   v.lastBattleId   = null;
      if (v.lastBattleYear === undefined) v.lastBattleYear = null;
    }
  }
  return data;
}

// ── Migracja v59 → v60 ──────────────────────────────────────────────────────
// Capability refactor:
//   - vessel.colonistCapacity (ustawiane z modułów habitat_pod/cryo_pod lub legacy ship)
//   - fleet.embarkedTroops[] (konkretne archetypy załadowane na obcych flotach)
function _migrateV59toV60(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (c4x?.vesselManager?.vessels) {
    for (const v of c4x.vesselManager.vessels) {
      if (v.colonistCapacity == null) {
        // Legacy: ustaw na podstawie starego shipId (bez modułów)
        if (v.shipId === 'colony_ship') v.colonistCapacity = 3;
        else v.colonistCapacity = 0;
      }
    }
  }

  // Obce floty — embarkedTroops (pusta lista dla legacy; nowe floty AI wypełniają w EmpireGenerator)
  const empires = data.gameState?.empires ?? data.empires;
  if (empires && typeof empires === 'object') {
    for (const emp of Object.values(empires)) {
      if (!emp?.fleets) continue;
      for (const f of emp.fleets) {
        if (!Array.isArray(f.embarkedTroops)) f.embarkedTroops = [];
      }
    }
  }

  return data;
}
