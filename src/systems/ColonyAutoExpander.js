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
import { getTerrainRule } from '../data/ai/AiTerrainRules.js';
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

// Reguły terenu AI (hard/soft) — współdzielone z EmpireColonyBootstrap przez
// src/data/ai/AiTerrainRules.js (mine/farm/well hard → odpowiednio mountains/
// plains; factory/smelter/habitat soft). Patrz getTerrainRule().

// Unreachable targets — gdy _build/_upgrade silent-failuje (np. brak technologii),
// nie próbuj tego budynku w kółko. Po REGISTER czekaj RETRY civYears i spróbuj raz
// (a nuż techy się odkryły); znów fail → ponowny backoff.
const UNREACHABLE_RETRY_CIVYEARS = 30;

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

    // Devtool: logi akcji w konsoli. Włącz: KOSMOS.colonyAutoExpander._verbose = true.
    this._verbose = false;

    this._onTick = ({ civDeltaYears }) => this._tick(civDeltaYears ?? 0);
    EventBus.on('time:tick', this._onTick);
  }

  stop() {
    EventBus.off('time:tick', this._onTick);
  }

  // Log akcji (gated _verbose):
  //   [ColonyAutoExpander] [<colonyName>] <module>: <akcja> (cy=<civYear>) — <kontekst>
  _log(colony, module, action, context, civYear) {
    if (!this._verbose) return;
    const name = colony?.name ?? colony?.planetId ?? '?';
    const ctx  = context ? ` — ${context}` : '';
    console.log(`[ColonyAutoExpander] [${name}] ${module}: ${action} (cy=${civYear})${ctx}`);
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

      // 0) Housing cap — pop osiągnął housing → wzrost STOI. Najwyższy priorytet:
      //    bez wolnych POP żadna inna akcja (build/upgrade kosztujący POP) się nie
      //    wykona. Działa na KAŻDEJ planecie (oddychalna atmosfera chroni przed karą
      //    brak-housing, ale nie odblokowuje wzrostu). Bufor 10% (housing_buffer_ratio).
      const housing      = civ.housing ?? 0;
      const bufferRatio  = TH.housing_buffer_ratio ?? 1.1;
      if (pop > 0 && housing < pop * bufferRatio) {
        if (this._doSurvival(colony, 'housing_cap', civYear)) {
          this._tryBuild(colony, 'habitat', { module: 'survival', civYear, why: `pop ${pop}/${housing} housing cap (target ${(pop * bufferRatio).toFixed(1)})` });
          continue;
        }
      }

      // 1) Energia — bilans poniżej progu → solar_farm (najwyższy priorytet, brownout psuje wszystko)
      const bal = res.energy?.balance ?? 0;
      if (bal < (TH.energy_balance_min ?? 0)) {
        if (this._doSurvival(colony, 'energy', civYear)) {
          this._tryBuild(colony, 'solar_farm', { module: 'survival', civYear, why: `energy balance ${bal.toFixed(1)}` });
          continue;
        }
      }

      // 2) Żywność — ujemny bilans organics (deficyt) → farm na równinie.
      //    food_min_per_pop jest już wliczone w net rate (produkcja − konsumpcja),
      //    więc sygnałem survival jest net < 0 (kolonia traci żywność).
      const orgRate = res.getPerYear?.('organics') ?? 0;
      if (orgRate < 0) {
        if (this._doSurvival(colony, 'food', civYear)) {
          this._tryBuild(colony, 'farm', { module: 'survival', civYear, why: `organics rate ${orgRate.toFixed(1)}` });
          continue;
        }
      }

      // 3) Housing — TYLKO na planecie bez oddychalnej atmosfery.
      const atmo = civ.planet?.atmosphere ?? colony.planet?.atmosphere ?? 'breathable';
      if (atmo !== 'breathable') {
        const ratio = TH.housing_min_ratio_no_atmosphere ?? 0.5;
        if ((civ.housing ?? 0) < pop * ratio) {
          if (this._doSurvival(colony, 'housing', civYear)) {
            this._tryBuild(colony, 'habitat', { module: 'survival', civYear, why: `housing ${civ.housing ?? 0}/${(pop * ratio).toFixed(1)} (atmo=${atmo})` });
            continue;
          }
        }
      }

      // 4) Prosperity — poniżej alarmu → zwiększ pokrycie consumer goods:
      //    upewnij się że jest fabryka w trybie reactive (produkuje dobra on-demand).
      const prosp = colony.prosperitySystem?.prosperity ?? 100;
      if (prosp < (TH.prosperity_alarm ?? 0)) {
        if (this._doSurvival(colony, 'consumer_goods', civYear)) {
          if (this._countBuilding(colony, 'factory') === 0) {
            this._tryBuild(colony, 'factory', { module: 'survival', civYear, why: `prosperity ${Math.round(prosp)} (brak fabryki)` });
          } else if (colony.factorySystem && colony.factorySystem.mode !== 'reactive') {
            colony.factorySystem.setMode('reactive');
            this._log(colony, 'survival', 'setMode reactive', `prosperity ${Math.round(prosp)}`, civYear);
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
      this._applySafetyStocks(colony, data.targets, gy, civYear);

      // colonies_count — IGNOROWANE. To domena EconAI / Warstwy C (kolonizacja
      //   abstrakcyjna na poziomie galaktyki), nie auto-rozbudowy pojedynczej kolonii.

      // a) COUNTS (step function) — zbuduj pierwszy brakujący budynek wg priorytetu.
      //    Silent fail (np. brak techu) → zarejestruj unreachable i przejdź do
      //    następnego budynku z priorytetu (zamiast pętlić się w nieskończoność).
      for (const buildingId of BUILD_PRIORITY) {
        const want = cp.buildings[buildingId]?.count ?? 0;
        if (want <= 0) continue;
        const cur = this._countBuilding(colony, buildingId);
        if (cur >= want) continue;

        const key = `build:${buildingId}`;
        if (this._isUnreachable(colony, key, civYear)) continue;  // w backoffie — pomiń

        const outcome = this._tryBuild(colony, buildingId, { module: 'target', civYear, why: `count ${cur}/${want} @gy${gy}` });
        if (this._isBuildSuccess(outcome)) {
          this._clearUnreachable(colony, key);
          // Nowa fabryka → tryb reactive (conduct: nowe fabryki reactive).
          if (buildingId === 'factory') {
            colony.factorySystem?.setMode('reactive');
            this._log(colony, 'target', 'setMode reactive', 'nowa fabryka', civYear);
          }
          colony._caeLastTargetAction = { type: key, civYear };
          break; // jedna akcja na tick
        }
        if (outcome === 'fail') {
          // silent fail — _build nie zwrócił built/construction/queued (brak techu itd.)
          this._markUnreachable(colony, key, civYear, { module: 'target' });
        }
        // outcome 'no_tile'/'invalid' → po prostu spróbuj następny budynek (bez backoffu)
      }
      if (colony._caeLastTargetAction?.civYear === civYear) continue;

      // b) AVGLEVELS (interpolacja) — gdy counts spełnione, podnoś poziomy stopniowo.
      for (const buildingId of BUILD_PRIORITY) {
        const targetLevel = this._interpLevel(data.targets, buildingId, gy);
        if (targetLevel == null) continue;

        const key = `upgrade:${buildingId}`;
        if (this._isUnreachable(colony, key, civYear)) continue;

        const outcome = this._tryUpgrade(colony, buildingId, targetLevel, { module: 'target', civYear, why: `lerp →L${targetLevel} @gy${gy}` });
        if (outcome === 'upgraded' || outcome === 'queued') {
          // 'queued' = upgrade przyjęty, czeka na surowce/POP — to NIE silent fail.
          this._clearUnreachable(colony, key);
          colony._caeLastTargetAction = { type: key, civYear };
          break; // jedna akcja na tick
        }
        if (outcome === 'fail') {
          this._markUnreachable(colony, key, civYear, { module: 'target' });
        }
        // outcome 'no_candidate' → brak budynku do ulepszenia, spróbuj następny
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
  _applySafetyStocks(colony, targets, gy, civYear) {
    if (!colony.factorySystem?.setDemandBonus) return;
    let low = CHECKPOINTS[0], high = CHECKPOINTS[CHECKPOINTS.length - 1];
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (gy >= CHECKPOINTS[i].gy) { low = CHECKPOINTS[i]; high = CHECKPOINTS[i + 1] ?? CHECKPOINTS[i]; }
    }
    const loStocks = targets[low.key]?.safetyStocks ?? {};
    const hiStocks = targets[high.key]?.safetyStocks ?? {};
    const frac = (low.key === high.key) ? 0 : Math.max(0, Math.min(1, (gy - low.gy) / (high.gy - low.gy)));
    const cache = colony._caeStockCache ?? (colony._caeStockCache = {});
    const commodities = new Set([...Object.keys(loStocks), ...Object.keys(hiStocks)]);
    for (const c of commodities) {
      const lo  = loStocks[c] ?? 0;
      const hi  = hiStocks[c] ?? lo;
      const val = Math.round(lo + (hi - lo) * frac);
      if (cache[c] === val) continue;            // loguj tylko zmiany (mniej szumu)
      colony.factorySystem.setDemandBonus(c, val);
      this._log(colony, 'target', `setDemandBonus ${c}=${val}`, `${low.key}→${high.key} t=${frac.toFixed(2)}`, civYear);
      cache[c] = val;
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

  // Znajdź wolny, budowalny hex respektujący regułę terenu AI; unikaj biegunów.
  //   hard (mine/farm/well) → tylko terrains[]; fallback na dowolny buildowalny
  //     DOPIERO gdy żaden hex z listy nie jest wolny (loguj warning).
  //   soft (factory/smelter/habitat) → +score dla terrains[], inne akceptowalne.
  _findFreeTile(colony, buildingId) {
    const grid = colony.buildingSystem?._grid;
    if (!grid || typeof grid.forEach !== 'function') return null;
    const rule = getTerrainRule(buildingId);
    const hardTerrains = rule?.mode === 'hard' ? rule.terrains : null;
    const softTerrains = rule?.mode === 'soft' ? rule.terrains : null;
    const rows = grid.height ?? 10;

    // enforceHard=true → filtruj do hardTerrains; false → bez filtra (fallback).
    const pick = (enforceHard) => {
      let best = null, bestScore = -Infinity;
      grid.forEach(tile => {
        if (tile.buildingId || tile.capitalBase || tile.underConstruction || tile.pendingBuild) return;
        const terrain = TERRAIN_TYPES[tile.type];
        if (!terrain?.buildable) return;
        if (enforceHard && hardTerrains && !hardTerrains.includes(tile.type)) return;

        // Lekki scoring: preferowany teren (soft) > unikanie biegunów.
        let score = 0;
        if (softTerrains && softTerrains.includes(tile.type)) score += 10;
        if (tile.r === 0 || tile.r === rows - 1) score -= 5;
        else if (tile.r === 1 || tile.r === rows - 2) score -= 2;
        if (score > bestScore) { bestScore = score; best = tile; }
      });
      return best;
    };

    if (hardTerrains) {
      const strict = pick(true);
      if (strict) return strict;
      // Brak wolnego hexa z hard-listy → fallback na dowolny (nie blokuj rozbudowy).
      const fb = pick(false);
      if (fb) this._log(colony, 'terrain',
        `${buildingId} fallback poza ${hardTerrains.join('/')}`, `→ ${fb.type} (${fb.q},${fb.r})`, this._civYear());
      return fb;
    }
    return pick(false);
  }

  // Próba budowy: znajdź hex, wywołaj kosztowy _build (sam sprawdzi surowce/tech/POP;
  // gdy brak surowców/POP — _build queue'uje). Zwraca outcome string:
  //   'built'/'construction'/'queued' — sukces (akcja podjęta)
  //   'fail'    — _build silent-failował (brak techu/walidacji — nie zmienił tile)
  //   'no_tile' — brak wolnego hexa pasującego regule terenu
  //   'invalid' — nieznany building lub brak _build
  _tryBuild(colony, buildingId, meta = {}) {
    if (!BUILDINGS[buildingId]) return 'invalid';
    const bSys = colony.buildingSystem;
    if (typeof bSys?._build !== 'function') return 'invalid';
    const tile = this._findFreeTile(colony, buildingId);
    if (!tile) return 'no_tile';
    bSys._build(tile, buildingId);
    // Wynik z flag tile (instant / w budowie / w kolejce na surowce-POP).
    // Brak którejkolwiek flagi = silent fail (np. brak technologii) → 'fail'.
    const outcome = tile.buildingId === buildingId ? 'built'
                  : tile.underConstruction          ? 'construction'
                  : tile.pendingBuild               ? 'queued' : 'fail';
    this._log(colony, meta.module ?? 'target',
      `build ${buildingId} @ ${tile.type} tile (${tile.q},${tile.r}) [${outcome}]`,
      meta.why, meta.civYear);
    return outcome;
  }

  // TECH DEBT (odkryte przy bug A, 2026-05-25): kandydaci do upgrade są szukani po
  //   grid tile.buildingId, ale grid to MIRROR UI przebudowywany przez
  //   ColonyOverlay._syncTileBuildings — synchronizowany TYLKO dla kolonii z
  //   _gridCache[planetId] (czyli kiedykolwiek otwartych przez gracza). Źródłem
  //   prawdy jest bSys._active (entry.level). Konsekwencje dla kolonii AI (nigdy
  //   nie otwieranych w ColonyOverlay):
  //     - budynki bootstrapowe (grid.buildingId ustawiony przez
  //       EmpireColonyBootstrap._placeBuildingSmart) SĄ upgrade'owalne;
  //     - budynki postawione przez sam AutoExpander przez _build (buildTime>0 →
  //       construction queue → _activateBuilding ustawia tylko _active, NIE grid)
  //       NIE dostają grid.buildingId → nie są kandydatami do upgrade;
  //     - po starcie upgrade'u grid.underConstruction na nie-synchronizowanej koloni
  //       nie jest czyszczony → ponowny upgrade tego hexa bywa blokowany.
  //   Docelowy fix (poza scope bugfixów A/B): czytać kandydatów z bSys._active
  //   (źródło prawdy) + sprawdzać busy-state przez _constructionQueue/_pendingQueue
  //   zamiast flag grid tile. Wymaga ostrożności (BuildingSystem._upgrade też czyta
  //   stale tile.underConstruction/pendingBuild i może odrzucić).
  //
  // Próba upgrade: znajdź budynek tego typu poniżej docelowego poziomu i ulepsz.
  // Zwraca outcome string:
  //   'upgraded'     — sukces natychmiastowy (poziom wzrósł) lub start budowy upgrade'u
  //   'queued'       — sukces odroczony: _upgrade przyjął, czeka na surowce/POP
  //                    (tile.pendingBuild) — to NIE silent fail (mirror _build 'queued')
  //   'fail'         — _upgrade silent-failował (brak techu/maxLevel — bez zmiany tile)
  //   'no_candidate' — brak budynku tego typu poniżej docelowego poziomu
  _tryUpgrade(colony, buildingId, targetLevel, meta = {}) {
    const bSys = colony.buildingSystem;
    if (typeof bSys?._upgrade !== 'function') return 'no_candidate';
    const grid = bSys._grid;
    if (!grid || typeof grid.forEach !== 'function') return 'no_candidate';

    let candidate = null;
    grid.forEach(tile => {
      if (candidate) return;
      if (tile.buildingId !== buildingId) return;
      if (tile.underConstruction || tile.pendingBuild) return;
      const lvl = tile.buildingLevel ?? 1;
      if (lvl < targetLevel) candidate = tile;
    });
    if (!candidate) return 'no_candidate';

    const lvlBefore = candidate.buildingLevel ?? 1;
    bSys._upgrade(candidate);

    // Rozróżnij wynik z flag tile (analogicznie do _tryBuild):
    //   poziom wzrósł / underConstruction → 'upgraded' (akcja podjęta)
    //   pendingBuild                      → 'queued'   (przyjęte, czeka na surowce/POP)
    //   nic z powyższych                  → 'fail'     (silent fail: brak techu/maxLevel)
    const lvlAfter = candidate.buildingLevel ?? 1;
    if (lvlAfter > lvlBefore || candidate.underConstruction) {
      this._log(colony, meta.module ?? 'target',
        `upgrade ${buildingId} L${lvlBefore}→L${lvlBefore + 1}`, meta.why, meta.civYear);
      return 'upgraded';
    }
    if (candidate.pendingBuild) {
      this._log(colony, meta.module ?? 'target',
        `upgrade ${buildingId} L${lvlBefore}→L${lvlBefore + 1} [queued]`, meta.why, meta.civYear);
      return 'queued';
    }
    return 'fail';   // silent fail (brak techu / maxLevel)
  }

  _isBuildSuccess(outcome) {
    return outcome === 'built' || outcome === 'construction' || outcome === 'queued';
  }

  // ── Unreachable targets (anti-loop na silent fail) ──────────────────────────

  // True gdy budynek jest w okresie backoffu (silent-failował, czekamy na retry).
  // Gdy minął retryAtCivYear → false (czas spróbować ponownie) + log próby retry.
  _isUnreachable(colony, key, civYear) {
    const m = colony._caeUnreachableTargets;
    const rec = m?.get(key);
    if (!rec) return false;
    if (civYear >= rec.retryAtCivYear) {
      this._log(colony, 'target', `${key} retry attempt`, `unreachable since cy=${rec.sinceCivYear}`, civYear);
      return false; // wypuść próbę — jeśli znów fail, _markUnreachable ustawi nowy backoff
    }
    return true;
  }

  // Zarejestruj/odśwież backoff dla silent-failującego budynku.
  // STAŁY interwał: retryAtCivYear = sinceCivYear + 30 (bez exp backoffu). Każda
  // nieudana próba (pierwsza i każda kolejna po retry) kotwiczy okno od TERAZ —
  // sinceCivYear = civYear bieżącej porażki → przewidywalne, równe 30-cy odstępy.
  _markUnreachable(colony, key, civYear, meta = {}) {
    const m = colony._caeUnreachableTargets || (colony._caeUnreachableTargets = new Map());
    const sinceCivYear   = civYear;
    const retryAtCivYear = sinceCivYear + UNREACHABLE_RETRY_CIVYEARS;
    m.set(key, { sinceCivYear, retryAtCivYear });
    this._log(colony, meta.module ?? 'target',
      `${key} unreachable (silent fail)`, `retry @cy=${retryAtCivYear}`, civYear);
  }

  _clearUnreachable(colony, key) {
    colony._caeUnreachableTargets?.delete(key);
  }
}

export default ColonyAutoExpander;
