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

export const CURRENT_VERSION     = 7;
export const MIN_SUPPORTED_VERSION = 4;

// ── Mapa migracji: fromVersion → funkcja(data) → data ──────────────────────
const MIGRATIONS = {
  4: _migrateV4toV5,
  5: _migrateV5toV6,
  6: _migrateV6toV7,
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
