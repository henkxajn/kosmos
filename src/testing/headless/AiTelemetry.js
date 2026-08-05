// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — AiTelemetry (czujnik IMPERIÓW AI, READ-ONLY)
// ───────────────────────────────────────────────────────────────
// Ostatni slice Phase 2 i jedyny, który NIE waliduje stałej — DIAGNOZUJE
// PODEJRZANĄ REGRESJĘ. Teza: imperia AI grają REALNĄ ekonomią kolonii (te same
// ResourceSystem/CivilizationSystem/BuildingSystem/FactorySystem co gracz), więc
// Population 2.0 trafiła też w nie — ale warstwa DECYZYJNA AI (ColonyAutoExpander,
// EmpireStrategySystem) nigdy nie została do nowej ekonomii dostrojona.
//
// HARD-CONSTRAINT: instrument, nie regulator. Zero stałych balansu, zero zmian
// w logice AI. Wszystko poniżej to ODCZYTY + PRZEZROCZYSTE OPAKOWANIA (wrapper
// woła oryginał i zwraca jego wynik bez zmian). Naprawy = osobny łuk (WOJNA I POKÓJ).
//
// Trzy warstwy czujnika:
//   1. SZEREG CZASOWY per imperium — raz na GAME-YEAR, ta sama kadencja co POP/
//      ZASOBY/ROI/CENY (wspólny `balans-driver.mjs`).
//   2. DZIENNIK DECYZJI — opakowania na realnych metodach decyzyjnych. Każdy tick,
//      w którym warstwa AI COŚ oceniła i NIC nie zrobiła, zapisuje POWÓD; nie ma
//      cichego przejścia.
//   3. SONDA ZALEŻNOŚCI — architektura AI stoi na `window.KOSMOS?.x` (ciche no-opy).
//      Każdy taki odczyt jest tu jawnie sprawdzany: `undefined` to ZNALEZISKO, nie skip.
//
// ⚠ ODWZOROWANIE ŚCIEŻKI DECYZYJNEJ: `explainExpander` (i gra własnym
//   `EmpireStrategySystem.explainColonization`) podają powód w KOLEJNOŚCI PRIORYTETU
//   REALNEJ ŚCIEŻKI, nie w wygodnej dla raportu. Zmiana kolejności bramek w
//   `ColonyAutoExpander._runSurvival/_runTargets` MUSI być odzwierciedlona tutaj —
//   inaczej diagnoza nazwie zły powód.
// ═══════════════════════════════════════════════════════════════

import { BUILDINGS } from '../../data/BuildingsData.js';
// Limity kolejki czytamy z SYSTEMU (są eksportowane) — zero kopii knobów AI w harnessie.
import {
  MAX_PENDING_BUILDS_PER_COLONY,
  MAX_PENDING_UPGRADES_PER_COLONY,
} from '../../systems/ColonyAutoExpander.js';

// Zestaw budynków JEDNEJ placówki autonomicznej AI — kopia listy z
// EmpireStrategySystem.OUTPOST_BUILDINGS (tam prywatna stała modułu; tu tylko
// do rozbicia „czego brakuje", nie do podejmowania decyzji).
export const OUTPOST_BUILDINGS = ['autonomous_solar_farm', 'autonomous_mine'];

// Droid tier-1 — jedyny droid w build-cost placówki AI (patrz
// docs/audits/droid-entity-naming-check.md; android_worker NIE jest już w koszcie).
export const AI_DROID_ID = 'automation_droid';

// Zasoby śledzone w szeregu. `minerals` w grze to ALIAS na Fe (ResourceSystem:421),
// więc mierzymy Fe wprost; „alloys" z briefu = structural_alloys (towar, nie ruda).
export const TRACKED_STOCK = [
  'food', 'water', 'energy', 'Fe', 'Ti', 'Si', 'Cu', 'Li', 'C', 'Xe',
  'structural_alloys', AI_DROID_ID, 'research',
];

// KNOBY POMIARU (nie stałe gry) — kopiowane do meta wyniku.
export const AI_TELEMETRY_DEFAULTS = {
  RAW_DECISION_CAP: 4000,   // ile surowych wpisów dziennika trzymamy per seed (no-opy i tak agregujemy)
  DEFICIT_EPS:      1e-6,   // |x| ≤ to ≈ zero (porównania stanów magazynu)
};

// Kontrakt zależności warstwy decyzyjnej AI. KAŻDY wpis to REALNY odczyt
// `window.KOSMOS?.…` / `colony.…` na ścieżce decyzyjnej — z podaniem miejsca, które
// po cichu wychodzi bez akcji, gdy odczyt zwróci undefined.
export const DEP_LOOKUPS = [
  { key: 'empireRegistry',       scope: 'global', usedBy: 'EmpireStrategySystem._runForEmpire / ColonyAutoExpander._managedColonies' },
  { key: 'colonyManager',        scope: 'global', usedBy: 'EmpireStrategySystem._runForEmpire / _pickXeBody' },
  { key: 'starSystemManager',    scope: 'global', usedBy: 'EmpireStrategySystem._runForEmpire (home-system)' },
  { key: 'empireColonyBootstrap',scope: 'global', usedBy: 'EmpireStrategySystem._runForEmpire → EXEC (bootstrapColony/Outpost)' },
  { key: 'timeSystem',           scope: 'global', usedBy: 'oba systemy — _civYear()' },
  { key: 'galaxyData',           scope: 'global', usedBy: 'EmpireStrategySystem._pickTargetSystem (cross-system)' },
  { key: 'empireStrategySystem', scope: 'global', usedBy: 'warstwa C w ogóle (brak = zero kolonizacji AI)' },
  { key: 'colonyAutoExpander',   scope: 'global', usedBy: 'warstwa B w ogóle (brak = zero rozbudowy kolonii AI)' },
  { key: 'empireLogisticsSystem',scope: 'global', usedBy: 'kurierzy outpost↔stolica' },
  { key: 'empireResearchSystem', scope: 'global', usedBy: 'kolejka badań AI (m.in. warp → ekspansja cross-system)' },
];

// Te same odczyty, ale na koloni-macierzystej imperium.
export const MOTHER_DEPS = [
  { key: 'resourceSystem', usedBy: '_canAffordOutpost / _executeFullColony (debit)' },
  { key: 'civSystem',      usedBy: '_canAffordFullColony (freePops) / removePop' },
  { key: 'factorySystem',  usedBy: '_maybeOrderOutpostDroids (Build-N droidów — brak = placówki nigdy nie ruszą)' },
  { key: 'buildingSystem', usedBy: 'ColonyAutoExpander._tryBuild/_tryUpgrade' },
  { key: 'techSystem',     usedBy: 'bramka warp (canCross) + gating recept fabryki' },
];

// ── Koszty (czyste odczyty danych) ───────────────────────────────
/** Łączny koszt JEDNEJ placówki AI (solar + mine, surowce + towary; klucze wspólne SUMOWANE). */
export function outpostKitCost() {
  const all = {};
  for (const bId of OUTPOST_BUILDINGS) {
    const b = BUILDINGS[bId];
    for (const src of [b?.cost, b?.commodityCost]) {
      for (const [k, v] of Object.entries(src ?? {})) { if (v) all[k] = (all[k] ?? 0) + v; }
    }
  }
  return all;
}

/** Czego i ile brakuje macierzystej do placówki: [{ id, have, need, short }] (puste = stać). */
export function outpostShortfall(mother, kit = outpostKitCost()) {
  const res = mother?.resourceSystem;
  if (!res) return [];
  const out = [];
  for (const [id, need] of Object.entries(kit)) {
    const have = res.getAmount?.(id) ?? 0;
    if (have + AI_TELEMETRY_DEFAULTS.DEFICIT_EPS < need) {
      out.push({ id, have: round2(have), need, short: round2(need - have) });
    }
  }
  return out;
}

// ── Migawka kolonii (wspólna dla macierzystej AI i domowej gracza) ──
export function colonySnapshot(colony) {
  if (!colony) return null;
  const civ = colony.civSystem;
  const res = colony.resourceSystem;
  const bs  = colony.buildingSystem;

  let jobs = 0, workers = 0, synthetic = 0, unfilled = 0;
  for (const r of (civ?.getWorkforceBreakdown?.() ?? [])) {
    jobs      += (r.jobs ?? 0);
    workers   += (r.workers ?? 0);
    synthetic += (r.synthetic ?? 0);
    unfilled  += Math.max(0, (r.jobs ?? 0) - (r.workers ?? 0) - (r.synthetic ?? 0));
  }

  const stock = {}, flow = {};
  for (const id of TRACKED_STOCK) {
    stock[id] = round2(res?.getAmount?.(id) ?? 0);
    flow[id]  = round2(res?.getPerYear?.(id) ?? 0);
  }

  const byType = {};
  for (const entry of (bs?._active?.values?.() ?? [])) {
    const id = entry.building?.id ?? entry.buildingId;
    if (id) byType[id] = (byType[id] ?? 0) + 1;
  }

  const pop = civ?.population ?? 0;
  return {
    pop,
    humans:      round2(civ?.humans ?? pop),
    employed:    civ?.employed ?? 0,
    unemployed:  civ?.unemployed ?? 0,
    emplRate:    jobs > 0 ? round3((workers + synthetic) / jobs) : null,   // obsada etatów (ludzie + droidy)
    growth:      round3(civ?.getAnnualGrowth?.() ?? 0),                    // POP/civ-rok (przed promocją)
    satisfaction: Math.round(civ?.satisfaction ?? 0),
    housing:     Math.round(civ?.housing ?? 0),
    jobs, workers, synthetic,
    unfilledJobs: round2(unfilled),
    credits:     Math.round(colony.credits ?? 0),
    prosperity:  Math.round(colony.prosperitySystem?.prosperity ?? 0),
    stock, flow,
    energyBalance: round2(res?.energy?.balance ?? 0),
    brownout:      !!res?.energy?.brownout,
    buildings:     byType,
    buildingCount: Object.values(byType).reduce((a, b) => a + b, 0),
    constructionQueue: bs?._constructionQueue?.size ?? 0,
    pendingQueue:      bs?._pendingQueue?.size ?? 0,
  };
}

// ── Migawka imperium ─────────────────────────────────────────────
export function empireSnapshot(empire, kit = outpostKitCost()) {
  const K   = globalThis.window?.KOSMOS ?? {};
  const reg = K.empireRegistry;
  const cols = reg?.getColoniesByEmpire?.(empire.id) ?? [];
  const homeSystemId = empire.homeSystemId ?? null;

  let full = 0, outposts = 0, fullHome = 0, outHome = 0, fullOther = 0, outOther = 0, totalPop = 0;
  const systems = new Set();
  for (const c of cols) {
    if (!c) continue;
    systems.add(c.systemId);
    const atHome = c.systemId === homeSystemId;
    if (c.isOutpost) { outposts++; atHome ? outHome++ : outOther++; }
    else             { full++;     atHome ? fullHome++ : fullOther++; totalPop += c.civSystem?.population ?? 0; }
  }

  const mother = cols.find(c => c && !c.isOutpost && c.resourceSystem && c.civSystem) ?? null;
  const strat  = K.empireStrategySystem;

  // Powód decyzji = WŁASNY read-only mirror gry (nie druga implementacja doktryny).
  let explain = null;
  try { explain = strat?.explainColonization?.(empire) ?? null; } catch (e) { explain = { reason: `explain threw: ${e.message}` }; }

  // Zlecenie Build-N droidów + prawdziwy powód stallu fabryki (diagnostyka gry).
  let droidOrder = null, droidStall = null;
  const fs = mother?.factorySystem;
  if (fs) {
    droidOrder = fs.getDroidOrder?.(AI_DROID_ID) ?? null;
    const alloc = (fs.getAllocations?.() ?? []).find(a => a.commodityId === AI_DROID_ID);
    droidStall = alloc?.stallReason ?? null;
  }

  return {
    empireId: empire.id, name: empire.name ?? empire.id, archetype: empire.archetype ?? null, homeSystemId,
    coloniesFull: full, outposts,
    homeSys:  { full: fullHome,  outposts: outHome },
    otherSys: { full: fullOther, outposts: outOther },
    systems: systems.size,
    totalPop,
    mother: colonySnapshot(mother),
    motherId: mother?.planetId ?? null,
    outpostShort: outpostShortfall(mother, kit),
    canOutpost: explain?.canOutpost ?? null,
    canFull:    explain?.canFull ?? null,
    decision:   explain?.decision ?? (explain?.active === false ? 'PASYWNE' : null),
    reason:     explain?.reason ?? null,
    xeOutposts: explain?.xeOutposts ?? null,
    ntOutposts: explain?.ntOutposts ?? null,
    droidOrder, droidStall,
    droidsStored:   round2(mother?.resourceSystem?.getAmount?.(AI_DROID_ID) ?? 0),
    droidsInstalled: mother?.civSystem?.getWorkforceBreakdown?.()
      ?.reduce((a, r) => a + (r.synthetic ?? 0), 0) ?? 0,
    atWar: !!K.warSystem?.getWarWith?.(empire.id),
    depsMissing: MOTHER_DEPS.filter(d => !mother || mother[d.key] == null).map(d => d.key),
  };
}

// ── Sonda zależności (undefined = ZNALEZISKO) ────────────────────
export function probeDependencies() {
  const K = globalThis.window?.KOSMOS ?? {};
  return DEP_LOOKUPS.map(d => ({ ...d, resolved: K[d.key] != null }));
}

// ═══════════════════════════════════════════════════════════════
// DZIENNIK DECYZJI — przezroczyste opakowania na REALNYCH metodach
// ═══════════════════════════════════════════════════════════════
// Każde opakowanie: wywołaj oryginał → zapisz co się stało → zwróć NIEZMIENIONY
// wynik. Zero wpływu na przebieg gry (jedyny koszt to czas zapisu do tablicy).

const BUILD_OK = new Set(['built', 'construction', 'queued', 'upgraded']);

export function attachDecisionHooks(sink, opts = {}) {
  const K     = globalThis.window?.KOSMOS ?? {};
  const strat = K.empireStrategySystem;
  const cae   = K.colonyAutoExpander;
  const undo  = [];

  if (!strat) sink.dep('empireStrategySystem', 'warstwa C nie istnieje — ZERO decyzji kolonizacyjnych AI');
  if (!cae)   sink.dep('colonyAutoExpander',   'warstwa B nie istnieje — ZERO rozbudowy kolonii AI');

  // ⚠ `undo` przywraca ORYGINALNĄ REFERENCJĘ (nie wersję związaną) — inaczej powtórne
  //   attach/detach nakładałoby opakowania warstwami zamiast je zdejmować.
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const original = obj[name];
    obj[name] = make(original.bind(obj));
    undo.push(() => { obj[name] = original; });
  };

  // ── Warstwa C — kolonizacja ────────────────────────────────────
  wrap(strat, '_executeAutonomousOutpost', (orig) => function (empire, mother, systemId, planetId, civYear, cfg) {
    const r = orig(empire, mother, systemId, planetId, civYear, cfg);
    sink.action({
      system: 'strategy', kind: 'outpost', empireId: empire?.id, planetId, systemId,
      outcome: r?.ok ? 'fired' : 'failed', reason: r?.error ?? null,
    });
    return r;
  });

  wrap(strat, '_executeFullColony', (orig) => function (empire, mother, systemId, planetId, civYear, cfg) {
    const r = orig(empire, mother, systemId, planetId, civYear, cfg);
    sink.action({
      system: 'strategy', kind: 'colony', empireId: empire?.id, planetId, systemId,
      outcome: r?.ok ? 'fired' : 'failed', reason: r?.error ?? null,
    });
    return r;
  });

  // Zamówienie droidów pod placówkę — jedyne ogniwo, które AI samo „dokłada".
  wrap(strat, '_maybeOrderOutpostDroids', (orig) => function (empire, mother, systemId, bodyIds, civYear, cfg) {
    const before = mother?.factorySystem?.getDroidOrder?.(AI_DROID_ID)?.qty ?? 0;
    const r = orig(empire, mother, systemId, bodyIds, civYear, cfg);
    if (!mother?.factorySystem) {
      sink.dep(`mother.factorySystem@${empire?.id}`, 'brak fabryki macierzystej — Build-N droidów NIGDY nie powstanie');
    } else {
      const after = mother.factorySystem.getDroidOrder?.(AI_DROID_ID)?.qty ?? 0;
      if (after !== before) {
        sink.action({ system: 'strategy', kind: 'droid_order', empireId: empire?.id, outcome: 'fired',
          reason: null, detail: { from: before, to: after } });
      }
    }
    return r;
  });

  // Cały przebieg imperium: gdy NIC nie padło — zapisz POWÓD (nigdy cichy skip).
  wrap(strat, '_runForEmpire', (orig) => function (empire, civYear) {
    const before = sink.actionCount('strategy');
    const r = orig(empire, civYear);
    if (sink.actionCount('strategy') === before) {
      let ex = null;
      try { ex = strat.explainColonization(empire, civYear); } catch (e) { ex = { reason: `explain threw: ${e.message}` }; }
      sink.noop({
        system: 'strategy', module: 'colonization', empireId: empire?.id,
        reason: normalizeStrategyReason(ex),
      });
    }
    return r;
  });

  // ── Warstwa B — rozbudowa kolonii ──────────────────────────────
  wrap(cae, '_tryBuild', (orig) => function (colony, buildingId, meta = {}) {
    const outcome = orig(colony, buildingId, meta);
    sink.action({
      system: 'expander', kind: 'build', empireId: colony?.ownerEmpireId, colonyId: colony?.planetId,
      buildingId, module: meta.module ?? '?', outcome, effective: BUILD_OK.has(outcome), reason: meta.why ?? null,
    });
    return outcome;
  });

  wrap(cae, '_tryUpgrade', (orig) => function (colony, buildingId, targetLevel, meta = {}) {
    const outcome = orig(colony, buildingId, targetLevel, meta);
    sink.action({
      system: 'expander', kind: 'upgrade', empireId: colony?.ownerEmpireId, colonyId: colony?.planetId,
      buildingId, module: meta.module ?? '?', outcome, effective: BUILD_OK.has(outcome), reason: meta.why ?? null,
    });
    return outcome;
  });

  for (const [method, moduleName] of [['_runSurvival', 'survival'], ['_runTargets', 'target']]) {
    wrap(cae, method, (orig) => function (civYear) {
      const before = sink.actionsByColony('expander');
      const r = orig(civYear);
      const after = sink.actionsByColony('expander');
      let managed = [];
      try { managed = cae._managedColonies() ?? []; } catch { managed = []; }
      for (const colony of managed) {
        const id = colony?.planetId;
        const seen = (after.get(id) ?? []).slice((before.get(id) ?? []).length);
        if (seen.some(a => a.effective)) continue;   // coś realnie ruszyło
        sink.noop({
          system: 'expander', module: moduleName, empireId: colony?.ownerEmpireId, colonyId: id,
          reason: seen.length
            ? `próby bez skutku: ${[...new Set(seen.map(a => `${a.kind}:${a.outcome}`))].join(',')}`
            : explainExpander(cae, colony, civYear, moduleName),
        });
      }
      return r;
    });
  }

  return () => { for (const fn of undo.reverse()) fn(); };
}

/** Normalizacja powodu z `explainColonization` do krótkiego klucza + pełny tekst. */
export function normalizeStrategyReason(ex) {
  const raw = ex?.reason ?? 'brak danych';
  if (ex?.active === false && /PASYWNE/i.test(raw))        return `passive_no_mother | ${raw}`;
  if (/archetyp nieznany/i.test(raw))                       return `unmanaged_archetype | ${raw}`;
  if (/niewygenerowany/i.test(raw))                         return `system_not_generated | ${raw}`;
  if (/osiągnięte/i.test(raw))                              return `targets_saturated | ${raw}`;
  if (/BRAK wolnego ciała/i.test(raw))                      return `no_free_body | ${raw}`;
  if (/nie stać na outpost/i.test(raw))                     return `cannot_afford_outpost | ${raw}`;
  if (/nie stać na pełną kolonię/i.test(raw))               return `cannot_afford_colony | ${raw}`;
  return `other | ${raw}`;
}

/**
 * Read-only mirror ścieżki `ColonyAutoExpander._runSurvival` / `_runTargets`:
 * DLACZEGO moduł nic nie zrobił dla tej kolonii. Kolejność sprawdzeń = kolejność
 * REALNYCH bramek w systemie (patrz nagłówek pliku — kontrakt odwzorowania).
 */
export function explainExpander(cae, colony, civYear, moduleName) {
  if (!colony) return 'no_colony';
  let counts = { builds: 0, upgrades: 0 };
  try { counts = cae._pendingCounts(colony); } catch { /* prywatne API harnessu — brak = 0 */ }

  // Wspólne: kolejka budowy pełna (jedyny hamulec po zniesieniu bramki POP w Fazie 2).
  const buildFull = counts.builds   >= MAX_PENDING_BUILDS_PER_COLONY;
  const upFull    = counts.upgrades >= MAX_PENDING_UPGRADES_PER_COLONY;

  if (moduleName === 'survival') {
    if (buildFull) return `queue_full | kolejka budowy ${counts.builds}/${MAX_PENDING_BUILDS_PER_COLONY} — survival odpoczywa`;
    const last = colony._caeLastSurvivalAction;
    if (last && (civYear - last.civYear) < 3) return `anti_thrash | ostatnia akcja '${last.type}' w cy=${last.civYear}`;
    const un = [...(colony._caeUnreachableTargets?.keys() ?? [])];
    if (un.length) return `unreachable_backoff | ${un.join(',')}`;
    return 'healthy | żaden próg survival nie przekroczony';
  }

  // target
  const last = colony._caeLastTargetAction;
  if (last && (civYear - last.civYear) < 1) return `cooldown | ostatnia akcja target w cy=${last.civYear}`;
  if (buildFull && upFull) return `queue_full | budowa ${counts.builds}/${MAX_PENDING_BUILDS_PER_COLONY}, ulepszenia ${counts.upgrades}/${MAX_PENDING_UPGRADES_PER_COLONY}`;
  const un = [...(colony._caeUnreachableTargets?.keys() ?? [])];
  if (un.length) return `unreachable_backoff | ${un.join(',')}`;
  if (buildFull) return `build_queue_full | budowa ${counts.builds}/${MAX_PENDING_BUILDS_PER_COLONY} (ulepszenia wolne, brak kandydata)`;
  return 'targets_met | checkpoint zaspokojony (nic do zbudowania/ulepszenia)';
}

// ═══════════════════════════════════════════════════════════════
// Czujnik (kontrakt driver'a: sample(gy, ctx) + getSeries())
// ═══════════════════════════════════════════════════════════════
export class AiTelemetry {
  constructor(opts = {}) {
    this.cfg = { ...AI_TELEMETRY_DEFAULTS, ...opts };
    this._rows      = [];
    this._actions   = [];                 // surowe akcje (build/upgrade/outpost/colony/droid_order)
    this._byColony  = new Map();          // colonyId → [akcje] (do detekcji no-op per kolonia)
    this._counts    = { strategy: 0, expander: 0 };
    this._noops     = new Map();          // `${system}|${module}|${reasonKey}` → { count, firstGy, lastGy, colonies:Set }
    this._deps      = new Map();          // key → { key, note, firstGy, count }
    this._gy        = 0;
    this._attached  = false;
    this._detach    = null;
    this._kit       = outpostKitCost();
    this._sink      = this._makeSink();
  }

  _makeSink() {
    const self = this;
    return {
      action(a) {
        a.gy = self._gy;
        self._counts[a.system] = (self._counts[a.system] ?? 0) + 1;
        if (self._actions.length < self.cfg.RAW_DECISION_CAP) self._actions.push(a);
        if (a.colonyId) {
          if (!self._byColony.has(a.colonyId)) self._byColony.set(a.colonyId, []);
          self._byColony.get(a.colonyId).push(a);
        }
      },
      noop(n) {
        const reasonKey = String(n.reason ?? '?').split('|')[0].trim();
        const key = `${n.system}|${n.module}|${reasonKey}`;
        let rec = self._noops.get(key);
        if (!rec) {
          rec = { system: n.system, module: n.module, reasonKey, sample: n.reason,
                  count: 0, firstGy: self._gy, lastGy: self._gy, subjects: new Set() };
          self._noops.set(key, rec);
        }
        rec.count++;
        rec.lastGy = self._gy;
        rec.subjects.add(n.colonyId ?? n.empireId ?? '?');
      },
      dep(key, note) {
        let rec = self._deps.get(key);
        if (!rec) { rec = { key, note, firstGy: self._gy, count: 0 }; self._deps.set(key, rec); }
        rec.count++;
      },
      actionCount(system) { return self._counts[system] ?? 0; },
      actionsByColony()   { return self._byColony; },
    };
  }

  /** Migawka roku `gy`. Przy gy=0 dowiązuje opakowania (systemy AI istnieją po boocie). */
  sample(gy, ctx) {
    this._gy = Math.round(gy);
    if (!this._attached) {
      this._attached = true;
      this._detach = attachDecisionHooks(this._sink);
    }

    const K   = globalThis.window?.KOSMOS ?? {};
    const reg = K.empireRegistry;
    const empires = (reg?.listAll?.() ?? []).map(e => empireSnapshot(e, this._kit));

    const row = {
      gy: this._gy,
      empires,
      player: AiTelemetry.playerSnapshot(ctx),
      deps: probeDependencies(),
    };
    this._rows.push(row);
    return row;
  }

  getSeries() { return this._rows.slice(); }

  /** Dziennik decyzji: akcje (surowe) + no-opy (zagregowane) + braki zależności. */
  getDecisions() {
    return {
      actions: this._actions.slice(),
      actionsTotal: { ...this._counts },
      truncated: this._counts.strategy + this._counts.expander > this.cfg.RAW_DECISION_CAP,
      noops: [...this._noops.values()]
        .map(r => ({ ...r, subjects: [...r.subjects] }))
        .sort((a, b) => b.count - a.count),
      deps: [...this._deps.values()],
    };
  }

  detach() { if (this._detach) { this._detach(); this._detach = null; this._attached = false; } }

  /** Strona GRACZA — ten sam przebieg, do porównania bazowego (brief §4). */
  static playerSnapshot(ctx) {
    const cm = ctx?.colonyManager;
    const cols = cm?.getPlayerColonies?.() ?? [];
    let full = 0, outposts = 0, totalPop = 0;
    for (const c of cols) {
      if (c.isOutpost) outposts++;
      else { full++; totalPop += c.civSystem?.population ?? 0; }
    }
    return {
      coloniesFull: full, outposts, totalPop,
      home: colonySnapshot(ctx?.home),
    };
  }
}

// ── Podsumowanie seeda / panelu ──────────────────────────────────
/** Podsumowanie JEDNEGO przebiegu: kamienie milowe AI + porównanie z graczem. */
export function summarizeSeed(series, decisions) {
  const last = series[series.length - 1] ?? { empires: [], player: {} };
  const empires = (last.empires ?? []).map(e => {
    const id = e.empireId;
    const track = series.map(r => (r.empires ?? []).find(x => x.empireId === id)).filter(Boolean);
    const firstOutpostGy = firstGyWhere(series, id, s => s.outposts > 0);
    const first2ColoniesGy = firstGyWhere(series, id, s => (s.coloniesFull + s.outposts) >= 2);
    const first3ColoniesGy = firstGyWhere(series, id, s => (s.coloniesFull + s.outposts) >= 3);
    const popSeries = track.map(s => s.mother?.pop ?? 0);
    return {
      empireId: id, name: e.name, archetype: e.archetype,
      coloniesEnd: e.coloniesFull, outpostsEnd: e.outposts, systemsEnd: e.systems,
      firstOutpostGy, first2ColoniesGy, first3ColoniesGy,
      popStart: popSeries[0] ?? 0, popEnd: popSeries[popSeries.length - 1] ?? 0,
      popPeak: Math.max(0, ...popSeries),
      emplRateEnd: e.mother?.emplRate ?? null,
      jobsEnd: e.mother?.jobs ?? 0, workersEnd: e.mother?.workers ?? 0,
      unfilledEnd: e.mother?.unfilledJobs ?? 0,
      buildingsEnd: e.mother?.buildingCount ?? 0,
      creditsEnd: e.mother?.credits ?? 0,
      droidsStoredEnd: e.droidsStored, droidsInstalledEnd: e.droidsInstalled,
      decisionEnd: e.decision, reasonEnd: e.reason,
      outpostShortEnd: e.outpostShort,
      atWarEver: series.some(r => (r.empires ?? []).some(x => x.empireId === id && x.atWar)),
      popDeclineYears: countDecline(popSeries),
      zeroStockYears: countZeroStock(track),
    };
  });

  const p = last.player ?? {};
  const playerTrack = series.map(r => r.player).filter(Boolean);
  return {
    empires,
    player: {
      coloniesEnd: p.coloniesFull ?? 0, outpostsEnd: p.outposts ?? 0,
      popEnd: p.home?.pop ?? 0, popStart: playerTrack[0]?.home?.pop ?? 0,
      buildingsEnd: p.home?.buildingCount ?? 0,
      emplRateEnd: p.home?.emplRate ?? null,
      creditsEnd: p.home?.credits ?? 0,
      firstExpansionGy: firstGyPlayer(series, s => (s.coloniesFull + s.outposts) >= 2),
    },
    decisions: {
      actionsTotal: decisions?.actionsTotal ?? {},
      effective: (decisions?.actions ?? []).filter(a => a.effective || a.outcome === 'fired').length,
      topNoops: (decisions?.noops ?? []).slice(0, 8)
        .map(n => ({ system: n.system, module: n.module, reasonKey: n.reasonKey, count: n.count, sample: n.sample })),
      depsMissing: (decisions?.deps ?? []).map(d => d.key),
    },
  };
}

/** Panel N seedów → mediany + rozstrzygnięcie „czy AI zostaje w tyle za graczem". */
export function aggregatePanel(summaries) {
  const empRows = summaries.flatMap(s => s.empires);
  const med = (arr) => {
    const v = arr.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const byArchetype = {};
  for (const r of empRows) {
    const a = r.archetype ?? '?';
    (byArchetype[a] ??= []).push(r);
  }

  const aiColonies = empRows.map(r => r.coloniesEnd + r.outpostsEnd);
  const plColonies = summaries.map(s => s.player.coloniesEnd + s.player.outpostsEnd);
  const aiPop = empRows.map(r => r.popEnd);
  const plPop = summaries.map(s => s.player.popEnd);
  const aiBld = empRows.map(r => r.buildingsEnd);
  const plBld = summaries.map(s => s.player.buildingsEnd);

  // Zlicz no-opy z całego panelu (klucz = system|moduł|powód).
  const noopRoll = new Map();
  for (const s of summaries) for (const n of s.decisions.topNoops ?? []) {
    const k = `${n.system}|${n.module}|${n.reasonKey}`;
    const rec = noopRoll.get(k) ?? { ...n, count: 0, seeds: 0 };
    rec.count += n.count; rec.seeds++;
    noopRoll.set(k, rec);
  }

  return {
    seeds: summaries.length,
    empiresObserved: empRows.length,
    byArchetype: Object.fromEntries(Object.entries(byArchetype).map(([a, rows]) => [a, {
      n: rows.length,
      medFirstOutpostGy: med(rows.map(r => r.firstOutpostGy)),
      medColoniesEnd: med(rows.map(r => r.coloniesEnd + r.outpostsEnd)),
      medPopEnd: med(rows.map(r => r.popEnd)),
      neverOutpost: rows.filter(r => r.firstOutpostGy == null).length,
    }])),
    medFirstOutpostGy:   med(empRows.map(r => r.firstOutpostGy)),
    medFirst3ColoniesGy: med(empRows.map(r => r.first3ColoniesGy)),
    neverOutpost:        empRows.filter(r => r.firstOutpostGy == null).length,
    medAiColoniesEnd: med(aiColonies), medPlayerColoniesEnd: med(plColonies),
    medAiPopEnd: med(aiPop),           medPlayerPopEnd: med(plPop),
    medAiBuildingsEnd: med(aiBld),     medPlayerBuildingsEnd: med(plBld),
    medAiEmplRateEnd: med(empRows.map(r => r.emplRateEnd)),
    medPlayerEmplRateEnd: med(summaries.map(s => s.player.emplRateEnd)),
    medAiUnfilledEnd: med(empRows.map(r => r.unfilledEnd)),
    medPlayerFirstExpansionGy: med(summaries.map(s => s.player.firstExpansionGy)),
    warSeeds: empRows.filter(r => r.atWarEver).length,
    noops: [...noopRoll.values()].sort((a, b) => b.count - a.count),
    depsMissing: [...new Set(summaries.flatMap(s => s.decisions.depsMissing ?? []))],
  };
}

/**
 * Werdykt slice'u — czy podejrzewana regresja jest realna.
 *   1 = AI zostaje w tyle mimo przewagi startowej (regresja POTWIERDZONA)
 *   2 = AI nadąża/wyprzedza (regresja NIEpotwierdzona)
 *   3 = mieszane (część imperiów startuje, część stoi)
 *   0 = brak danych
 */
export function verdict(agg) {
  if (!agg || !agg.empiresObserved) return { outcome: 0, label: 'brak imperiów AI w przebiegu — nie ma czego mierzyć' };
  const aiC = agg.medAiColoniesEnd ?? 0, plC = agg.medPlayerColoniesEnd ?? 0;
  const lags = aiC < plC || (agg.medFirstOutpostGy == null) || (agg.medFirstOutpostGy > 10);
  const stalled = agg.neverOutpost;
  if (lags && stalled === agg.empiresObserved) {
    return { outcome: 1, label: `regresja POTWIERDZONA — ŻADNE imperium (${stalled}/${agg.empiresObserved}) nie założyło placówki w całym przebiegu` };
  }
  if (lags) {
    return { outcome: 1, label: `regresja POTWIERDZONA — AI kończy z medianą ${aiC} ciał vs gracz ${plC}; pierwsza placówka mediana ${agg.medFirstOutpostGy ?? '—'} gy (próg 2 gy)` };
  }
  if (stalled > 0) {
    return { outcome: 3, label: `mieszane — ${stalled}/${agg.empiresObserved} imperiów nie ruszyło, reszta ekspanduje` };
  }
  return { outcome: 2, label: `regresja NIEpotwierdzona — AI ${aiC} ciał vs gracz ${plC}, pierwsza placówka ${agg.medFirstOutpostGy} gy` };
}

// ── Drobne helpery ───────────────────────────────────────────────
function firstGyWhere(series, empireId, pred) {
  for (const r of series) {
    const s = (r.empires ?? []).find(x => x.empireId === empireId);
    if (s && pred(s)) return r.gy;
  }
  return null;
}
function firstGyPlayer(series, pred) {
  for (const r of series) if (r.player && pred(r.player)) return r.gy;
  return null;
}
/** Ile lat z rzędu populacja spada (najdłuższa seria) — sygnał „sustained decline". */
function countDecline(pops) {
  let best = 0, cur = 0;
  for (let i = 1; i < pops.length; i++) {
    if (pops[i] < pops[i - 1]) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}
/** Ile lat któryś ze śledzonych zasobów przetrwania stał na zerze (food/water/energy). */
function countZeroStock(track) {
  const out = {};
  for (const id of ['food', 'water', 'energy']) {
    out[id] = track.filter(s => (s.mother?.stock?.[id] ?? 1) <= AI_TELEMETRY_DEFAULTS.DEFICIT_EPS).length;
  }
  return out;
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function round3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }

export default AiTelemetry;
