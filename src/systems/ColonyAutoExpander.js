// ═══════════════════════════════════════════════════════════════
// ColonyAutoExpander — Warstwa B AI: auto-rozbudowa kolonii
// ───────────────────────────────────────────────────────────────
// Działa dla kolonii należących do AI Empire (ownerEmpireId != null).
// Logikę implementujemy TYLKO dla archetypu 'industrialist'; pozostałe
// archetypy podpina się przez rozbudowę ARCHETYPE_TARGETS (mapa archetyp→dane).
//
// Dwa moduły decyzyjne, priorytet SURVIVAL > TARGET:
//   1. SURVIVAL RULES (reaktywne, co 1 civYear) — gdy kolonia poniżej progu,
//      rozwiązuj problem przeżycia ZANIM ruszysz target states.
//   2. TARGET STATES (deklaratywne, co 3 civYears) — dąż do INDUSTRIALIST_TARGETS.
//
// Źródło prawdy: src/data/targets/industrialist.js.
// Build/upgrade idą KOSZTOWO (z inventory) przez per-kolonia BuildingSystem
//   bezpośrednio (bypass guarda aktywnej kolonii — event planet:buildRequest
//   działa tylko dla window.KOSMOS.buildingSystem === aktywna).
// ═══════════════════════════════════════════════════════════════

import EventBus from '../core/EventBus.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';
import {
  INDUSTRIALIST_TARGETS,
  INDUSTRIALIST_SURVIVAL_THRESHOLDS,
} from '../data/targets/industrialist.js';

// Tempo decyzji (z architektury AI)
const TARGET_INTERVAL_CIVYEARS   = 3;   // Warstwa B: target actions co 3 civYears
const SURVIVAL_INTERVAL_CIVYEARS = 1;   // survival check co 1 civYear (głód nie czeka)

// Anti-thrashing — daj postawionemu budynkowi czas się włączyć
const SURVIVAL_ANTI_THRASH_CIVYEARS = 3;   // ta sama akcja survival nie częściej niż co 3y
const TARGET_COOLDOWN_CIVYEARS      = 1;   // cooldown między target actions na koloni

// Personality modifier — MVP: jeden mnożnik cooldownu na archetyp (baseline 1.0).
// Inne archetypy spowolnią/przyspieszą tempo (struktura gotowa, wartości później).
const ARCHETYPE_COOLDOWN_MULTIPLIER = {
  industrialist: 1.0,
  // diplomat:  1.5,
  // militarist: 0.7,
};

// Mapa archetyp → dane targetów. Dodanie archetypu = dopisanie wpisu.
const ARCHETYPE_DATA = {
  industrialist: {
    targets:   INDUSTRIALIST_TARGETS,
    survival:  INDUSTRIALIST_SURVIVAL_THRESHOLDS,
  },
};

// Twarda reguła terenu dla AI Industrialist (ostrzejsza niż gra — gra dopuszcza
// mine także na plains przez allowedCategories). Conduct gracza z nagrań:
//   kopalnie tylko w górach, farmy/studnie tylko na równinach.
const TERRAIN_RULE = {
  mine: 'mountains',
  farm: 'plains',
  well: 'plains',
};

// Kolejność priorytetu budowy w module TARGET (esencja → produkcja → reszta).
const BUILD_PRIORITY = [
  'farm', 'well', 'solar_farm', 'mine', 'factory', 'smelter',
  'habitat', 'shipyard', 'research_station', 'observatory',
];

// 3 consumer goods — pokrycie napędza prosperity (patrz FILOZOFIA w targets).
const CONSUMER_GOODS = ['basic_supplies', 'civilian_goods', 'neurostimulants'];

// Checkpointy targetów (gameYear → klucz). Sortowane rosnąco.
const CHECKPOINTS = [
  { gy: 10, key: 'gameYear_10' },
  { gy: 20, key: 'gameYear_20' },
  { gy: 30, key: 'gameYear_30' },
  { gy: 40, key: 'gameYear_40' },
];

export class ColonyAutoExpander {
  // MVP: AutoExpander współistnieje z EmpireColonyMaintenance.
  // Maintenance robi _reapplyAllRates co 1 civYear (Warstwa A residual).
  // AutoExpander buduje/upgrade'uje co 3 civYears (Warstwa B).
  // Cel długofalowy: po stabilizacji AutoExpander przejmie reapply i Maintenance znika.
  constructor() {
    this._survivalAcc = 0;
    this._targetAcc   = 0;

    this._onTick = ({ civDeltaYears }) => this._tick(civDeltaYears ?? 0);
    EventBus.on('time:tick', this._onTick);
  }

  stop() {
    EventBus.off('time:tick', this._onTick);
  }

  // ── Pętla czasu ─────────────────────────────────────────────────────────
  _tick(civDt) {
    this._survivalAcc += civDt;
    this._targetAcc   += civDt;

    const civYear = this._civYear();

    if (this._survivalAcc >= SURVIVAL_INTERVAL_CIVYEARS) {
      this._survivalAcc -= SURVIVAL_INTERVAL_CIVYEARS;
      this._runSurvival(civYear);
    }
    if (this._targetAcc >= TARGET_INTERVAL_CIVYEARS) {
      this._targetAcc -= TARGET_INTERVAL_CIVYEARS;
      this._runTargets(civYear);
    }
  }

  _civYear() {
    const gt = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    return Math.floor(gt * 12);
  }
  _gameYear() {
    return Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
  }

  // Kolonie AI obsługiwane przez TEN system (archetyp z ARCHETYPE_DATA, nie outpost).
  _managedColonies() {
    const cm  = window.KOSMOS?.colonyManager;
    const reg = window.KOSMOS?.empireRegistry;
    if (!cm || !reg) return [];
    return cm.getAllColonies().filter(c => {
      if (!c || c.ownerEmpireId == null) return false;
      if (c.isOutpost) return false;
      const arch = reg.get(c.ownerEmpireId)?.archetype;
      return !!ARCHETYPE_DATA[arch];
    });
  }

  _archetypeOf(colony) {
    return window.KOSMOS?.empireRegistry?.get(colony.ownerEmpireId)?.archetype ?? null;
  }

  // ── MODUŁ 1: SURVIVAL (co 1 civYear) ──────────────────────────────────────
  _runSurvival(civYear) {
    for (const colony of this._managedColonies()) {
      const arch = this._archetypeOf(colony);
      const TH   = ARCHETYPE_DATA[arch]?.survival;
      if (!TH) continue;

      const res = colony.resourceSystem;
      const civ = colony.civSystem;
      if (!res || !civ) continue;

      const pop = civ.population ?? 0;

      // 1) Energia — bilans poniżej progu → solar_farm (najwyższy priorytet, brownout psuje wszystko)
      if ((res.energy?.balance ?? 0) < (TH.energy_balance_min ?? 0)) {
        if (this._doSurvival(colony, 'energy', civYear)) {
          this._tryBuild(colony, 'solar_farm');
          continue;
        }
      }

      // 2) Żywność — ujemny bilans organics (deficyt) → farm na równinie.
      //    food_min_per_pop jest już wliczone w net rate (produkcja − konsumpcja),
      //    więc sygnałem survival jest net < 0 (kolonia traci żywność).
      if ((res.getPerYear?.('organics') ?? 0) < 0) {
        if (this._doSurvival(colony, 'food', civYear)) {
          this._tryBuild(colony, 'farm');
          continue;
        }
      }

      // 3) Housing — TYLKO na planecie bez oddychalnej atmosfery.
      const atmo = civ.planet?.atmosphere ?? colony.planet?.atmosphere ?? 'breathable';
      if (atmo !== 'breathable') {
        const ratio = TH.housing_min_ratio_no_atmosphere ?? 0.5;
        if ((civ.housing ?? 0) < pop * ratio) {
          if (this._doSurvival(colony, 'housing', civYear)) {
            this._tryBuild(colony, 'habitat');
            continue;
          }
        }
      }

      // 4) Prosperity — poniżej alarmu → zwiększ pokrycie consumer goods:
      //    upewnij się że jest fabryka w trybie reactive (produkuje dobra on-demand).
      if ((colony.prosperitySystem?.prosperity ?? 100) < (TH.prosperity_alarm ?? 0)) {
        if (this._doSurvival(colony, 'consumer_goods', civYear)) {
          if (this._countBuilding(colony, 'factory') === 0) {
            this._tryBuild(colony, 'factory');
          } else if (colony.factorySystem && colony.factorySystem.mode !== 'reactive') {
            colony.factorySystem.setMode('reactive');
          }
          continue;
        }
      }
    }
  }

  // Anti-thrash: nie powtarzaj tej samej akcji survival przez X civYears.
  _doSurvival(colony, type, civYear) {
    const last = colony._caeLastSurvivalAction;
    if (last && last.type === type && (civYear - last.civYear) < SURVIVAL_ANTI_THRASH_CIVYEARS) {
      return false;
    }
    colony._caeLastSurvivalAction = { type, civYear };
    return true;
  }

  // ── MODUŁ 2: TARGET STATES (co 3 civYears) ───────────────────────────────
  _runTargets(civYear) {
    const gy = this._gameYear();

    for (const colony of this._managedColonies()) {
      const arch = this._archetypeOf(colony);
      const data = ARCHETYPE_DATA[arch];
      if (!data) continue;

      // Cooldown target action (× mnożnik archetypu).
      const mult = ARCHETYPE_COOLDOWN_MULTIPLIER[arch] ?? 1.0;
      const last = colony._caeLastTargetAction;
      if (last && (civYear - last.civYear) < TARGET_COOLDOWN_CIVYEARS * mult) continue;

      const cp = this._stepCheckpoint(data.targets, gy);
      if (!cp) continue;

      // safetyStocks — interpolacja liniowa, aplikowana jako demandBonus (tani setting,
      //   nie liczone jako "action" z cooldownem).
      this._applySafetyStocks(colony, data.targets, gy);

      // colonies_count — IGNOROWANE. To domena EconAI / Warstwy C (kolonizacja
      //   abstrakcyjna na poziomie galaktyki), nie auto-rozbudowy pojedynczej kolonii.

      // a) COUNTS (step function) — zbuduj pierwszy brakujący budynek wg priorytetu.
      for (const buildingId of BUILD_PRIORITY) {
        const want = cp.buildings[buildingId]?.count ?? 0;
        if (want <= 0) continue;
        if (this._countBuilding(colony, buildingId) < want) {
          if (this._tryBuild(colony, buildingId)) {
            // Nowa fabryka → tryb reactive (conduct: nowe fabryki reactive).
            if (buildingId === 'factory') colony.factorySystem?.setMode('reactive');
            colony._caeLastTargetAction = { type: `build:${buildingId}`, civYear };
          }
          break; // jedna akcja na tick
        }
      }
      if (colony._caeLastTargetAction?.civYear === civYear) continue;

      // b) AVGLEVELS (interpolacja) — gdy counts spełnione, podnoś poziomy stopniowo.
      for (const buildingId of BUILD_PRIORITY) {
        const targetLevel = this._interpLevel(data.targets, buildingId, gy);
        if (targetLevel == null) continue;
        if (this._tryUpgrade(colony, buildingId, targetLevel)) {
          colony._caeLastTargetAction = { type: `upgrade:${buildingId}`, civYear };
          break; // jedna akcja na tick
        }
      }
    }
  }

  // Step function: najwyższy checkpoint ≤ gy. Poniżej gy10 → celuj w gameYear_10.
  // Po gy40 → gameYear_40 jako stała.
  _stepCheckpoint(targets, gy) {
    let chosen = CHECKPOINTS[0];
    for (const cp of CHECKPOINTS) {
      if (gy >= cp.gy) chosen = cp;
    }
    return targets[chosen.key] ?? null;
  }

  // Interpolacja liniowa avgLevel budynku między checkpointami (po gy40 — stała).
  _interpLevel(targets, buildingId, gy) {
    // Znajdź dolny/górny checkpoint.
    let low = CHECKPOINTS[0], high = CHECKPOINTS[CHECKPOINTS.length - 1];
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (gy >= CHECKPOINTS[i].gy) { low = CHECKPOINTS[i]; high = CHECKPOINTS[i + 1] ?? CHECKPOINTS[i]; }
    }
    const lv = targets[low.key]?.buildings[buildingId]?.avgLevel;
    const hv = targets[high.key]?.buildings[buildingId]?.avgLevel;
    if (lv == null && hv == null) return null;
    if (low.key === high.key || lv == null || hv == null) return Math.round(lv ?? hv);
    const frac = Math.max(0, Math.min(1, (gy - low.gy) / (high.gy - low.gy)));
    return Math.round(lv + (hv - lv) * frac);
  }

  // safetyStocks — interpolacja liniowa per commodity, aplikacja przez setDemandBonus.
  _applySafetyStocks(colony, targets, gy) {
    if (!colony.factorySystem?.setDemandBonus) return;
    let low = CHECKPOINTS[0], high = CHECKPOINTS[CHECKPOINTS.length - 1];
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (gy >= CHECKPOINTS[i].gy) { low = CHECKPOINTS[i]; high = CHECKPOINTS[i + 1] ?? CHECKPOINTS[i]; }
    }
    const loStocks = targets[low.key]?.safetyStocks ?? {};
    const hiStocks = targets[high.key]?.safetyStocks ?? {};
    const frac = (low.key === high.key) ? 0 : Math.max(0, Math.min(1, (gy - low.gy) / (high.gy - low.gy)));
    const commodities = new Set([...Object.keys(loStocks), ...Object.keys(hiStocks)]);
    for (const c of commodities) {
      const lo = loStocks[c] ?? 0;
      const hi = hiStocks[c] ?? lo;
      colony.factorySystem.setDemandBonus(c, Math.round(lo + (hi - lo) * frac));
    }
  }

  // ── Helpery build/upgrade (kosztowo, per-kolonia, bypass guarda) ──────────

  _countBuilding(colony, buildingId) {
    const active = colony.buildingSystem?._active;
    if (!active) return 0;
    let n = 0;
    for (const entry of active.values()) {
      if ((entry.building?.id ?? entry.buildingId) === buildingId) n++;
    }
    return n;
  }

  // Znajdź wolny, budowalny hex respektujący twardą regułę terenu; unikaj biegunów.
  _findFreeTile(colony, buildingId) {
    const grid = colony.buildingSystem?._grid;
    if (!grid || typeof grid.forEach !== 'function') return null;
    const requiredTerrain = TERRAIN_RULE[buildingId] ?? null;
    const rows = grid.height ?? 10;

    let best = null, bestScore = -Infinity;
    grid.forEach(tile => {
      if (tile.buildingId || tile.capitalBase || tile.underConstruction || tile.pendingBuild) return;
      const terrain = TERRAIN_TYPES[tile.type];
      if (!terrain?.buildable) return;
      if (requiredTerrain && tile.type !== requiredTerrain) return; // twarda reguła AI

      // Lekki scoring: unikaj biegunów (kara latitude), preferuj środek mapy.
      let score = 0;
      if (tile.r === 0 || tile.r === rows - 1) score -= 5;
      else if (tile.r === 1 || tile.r === rows - 2) score -= 2;
      if (score > bestScore) { bestScore = score; best = tile; }
    });
    return best;
  }

  // Próba budowy: znajdź hex, wywołaj kosztowy _build (sam sprawdzi surowce/tech/POP;
  // gdy brak — _build queue'uje, co też jest „akcją"). Zwraca true gdy podjęto próbę.
  _tryBuild(colony, buildingId) {
    if (!BUILDINGS[buildingId]) return false;
    const bSys = colony.buildingSystem;
    if (typeof bSys?._build !== 'function') return false;
    const tile = this._findFreeTile(colony, buildingId);
    if (!tile) return false;
    bSys._build(tile, buildingId);
    return true;
  }

  // Próba upgrade: znajdź budynek tego typu poniżej docelowego poziomu i ulepsz.
  _tryUpgrade(colony, buildingId, targetLevel) {
    const bSys = colony.buildingSystem;
    if (typeof bSys?._upgrade !== 'function') return false;
    const grid = bSys._grid;
    if (!grid || typeof grid.forEach !== 'function') return false;

    let candidate = null;
    grid.forEach(tile => {
      if (candidate) return;
      if (tile.buildingId !== buildingId) return;
      if (tile.underConstruction || tile.pendingBuild) return;
      const lvl = tile.buildingLevel ?? 1;
      if (lvl < targetLevel) candidate = tile;
    });
    if (!candidate) return false;
    bSys._upgrade(candidate);
    return true;
  }
}

export default ColonyAutoExpander;
