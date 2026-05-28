// ═══════════════════════════════════════════════════════════════
// EmpireStrategySystem — Warstwa C AI: strategiczne decyzje kolonizacji
// ───────────────────────────────────────────────────────────────
// Slice 2 / Sesja 2. Decyduje KIEDY / GDZIE / CO kolonizuje każde AI imperium,
// debetuje surowce/POP z kolonii macierzystej i woła EXEC layer
// (EmpireColonyBootstrap), który KREDYTUJE nową kolonię/outpost.
//
// Trzy poziomy abstrakcji (zachowane):
//   DATA: archetyp (INDUSTRIALIST.strategicColonization — progi/preferencje)
//   LOGIC: TEN system (kiedy + scoring + decision tree + księgowość)
//   EXEC: EmpireColonyBootstrap (sam mechanizm tworzenia — NIE dotykamy)
//
// Doktryna Industrialist (priorytet):
//   P1  — pierwszy outpost Xe (autonomiczny solar + mine)
//   P2  — drugi outpost Xe (do targetXeOutposts)
//   P3  — pełna kolonia na rocky z atmosferą oddychalną (po ≥1 outpoście Xe)
//   Fb  — fallback: pełna kolonia na dowolnym rocky (bez atmosfery też OK)
//
// KLUCZOWE realia API (różne od pseudokodu w briefie):
//   - resourceSystem.spend(costs) — ATOMIC verify-then-debit, zwraca FALSE
//     (NIE rzuca) gdy nie stać → debit bez try/catch; tylko bootstrap* rzuca.
//   - resourceSystem.receive(gains) — kredyt, nigdy nie failuje (rollback).
//   - resourceSystem.canAfford(costs) — read-only pre-check (decision tree).
//   - civSystem.freePops (getter) / removePop(type=null,n) / addPop('laborer',n).
//   - bootstrapColony seeduje POP+zasoby nowej kolonii z options → tu tylko DEBIT.
//
// Wzorzec ticku skopiowany z ColonyAutoExpander (konstruktor subskrybuje
// time:tick, deps czytane leniwie z window.KOSMOS w ticku).
// ═══════════════════════════════════════════════════════════════

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { ARCHETYPES } from '../data/EmpireData.js';

// Tempo decyzji (z architektury AI: A=1, B=3, C=5 civYears)
const STRATEGY_INTERVAL_CIVYEARS = 5;

// Minimum viable outpost (addendum): solar + mine RAZEM, w jednej akcji.
// Sam solar bez mine nic nie wydobywa — spalone structural_alloys + androidy.
const OUTPOST_BUILDINGS = ['autonomous_solar_farm', 'autonomous_mine'];

// Domyślne progi doktryny — fallback per-klucz gdy archetyp nie ma
// strategicColonization (inne archetypy / brak bloku). Industrialist nadpisuje
// je w EmpireArchetypeIndustrialist.js (te same wartości — decyzja Filipa).
const DEFAULTS = {
  targetXeOutposts:       2,    // ile outpostów Xe zabezpieczyć (P1 + P2)
  targetNtOutposts:       1,    // ile outpostów Nt (Neutronium) zabezpieczyć (P5) — Slice 2 S3
  popTransferSize:        2,    // ile POP wysłać na pełną kolonię (suma ≥ 2)
  minFreePops:            8,    // min freePops macierzystej by uruchomić full-colony
  minFoodTransfer:        200,  // próg = transfer (minimum wg promptu, bez bufora)
  minWaterTransfer:       200,
  blacklistDurationCy:    30,   // backoff ciała-celu po failure
  requireBreathableForP3: true, // P3 wymaga atmosfery oddychalnej (fallback nie)
};

export class EmpireStrategySystem {
  constructor() {
    // Blacklist NA INSTANCJI (per planetId) — nie na koloni: macierzysta może się
    // zmienić, a blacklistujemy ciało-cel galaktycznie. Map{planetId→{sinceCivYear,retryAtCivYear}}.
    this._blacklist = new Map();
    this._acc       = 0;       // akumulator civDeltaYears
    this._verbose   = false;   // KOSMOS.empireStrategySystem._verbose = true

    this._onTick = ({ civDeltaYears }) => this._tick(civDeltaYears ?? 0);
    EventBus.on('time:tick', this._onTick);
  }

  stop() { EventBus.off('time:tick', this._onTick); }

  // ── Serializacja (#2 save/restore AI) ─────────────────────────────────────
  // _blacklist = backoff ciał-celów kolonizacji po failure (Map{planetId →
  //   {sinceCivYear, retryAtCivYear}}). Bez round-tripu AI po load natychmiast
  //   ponawia nieudane cele w pierwszym ticku Warstwy C.
  serialize() {
    return { blacklist: [...this._blacklist.entries()] };
  }

  restore(data) {
    if (data && Array.isArray(data.blacklist)) {
      this._blacklist = new Map(data.blacklist);
    }
  }

  // Log akcji (gated _verbose):
  //   [EmpireStrategySystem] [<empireName>] <msg> — <ctx>
  _log(empire, msg, ctx = '') {
    if (!this._verbose) return;
    const name = empire?.name ?? empire?.id ?? '?';
    console.log(`[EmpireStrategySystem] [${name}] ${msg}${ctx ? ' — ' + ctx : ''}`);
  }

  // ── Pętla czasu ─────────────────────────────────────────────────────────
  _tick(civDt) {
    this._acc += civDt;
    if (this._acc < STRATEGY_INTERVAL_CIVYEARS) return;
    this._acc -= STRATEGY_INTERVAL_CIVYEARS;

    const civYear = this._civYear();
    for (const empire of this._managedEmpires()) {
      // Jedno rzucające imperium nie blokuje pozostałych.
      try { this._runForEmpire(empire, civYear); }
      catch (e) { console.error(`[EmpireStrategySystem] runForEmpire ${empire?.id} threw:`, e); }
    }
  }

  _civYear() { return Math.floor((window.KOSMOS?.timeSystem?.gameTime ?? 0) * 12); }

  // Imperia obsługiwane przez TEN system — wszystkie z znanym archetypem
  // (gracza NIE ma w EmpireRegistry).
  _managedEmpires() {
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg?.listAll) return [];
    return reg.listAll().filter(e => !!ARCHETYPES[e?.archetype]);
  }

  // Konfig doktryny: archetyp nadpisuje DEFAULTS per-klucz; działa też bez bloku.
  _config(empire) {
    const block = ARCHETYPES[empire?.archetype]?.strategicColonization;
    return block ? { ...DEFAULTS, ...block } : { ...DEFAULTS };
  }

  // ── Decyzja per imperium (P1 > P2 > P3 > fallback) ────────────────────────
  _runForEmpire(empire, civYear) {
    const reg = window.KOSMOS?.empireRegistry;
    const cm  = window.KOSMOS?.colonyManager;
    const ssm = window.KOSMOS?.starSystemManager;
    const eb  = window.KOSMOS?.empireColonyBootstrap;
    if (!reg || !cm || !ssm || !eb) return;

    const cfg    = this._config(empire);
    const mother = this._pickMotherColony(empire);
    if (!mother) { this._log(empire, 'brak macierzystej kolonii — skip'); return; }

    const systemId = empire.homeSystemId ?? mother.systemId;
    const sys = ssm.getSystem?.(systemId);
    if (!sys) { this._log(empire, 'home-system niewygenerowany — skip', systemId); return; }

    const bodyIds = [
      ...(sys.planetIds ?? []),
      ...(sys.moonIds ?? []),
      ...(sys.planetoidIds ?? []),
    ];

    // #14: outposty są teraz w EmpireRegistry (bootstrapAutonomousOutpost woła addColony)
    //   → liczymy przez getColoniesByEmpire (jedno źródło prawdy, koniec skanu bodyIds).
    //   Ciało Xe+Nt liczy się do OBU złóż → P5 nie buduje dubla na ciele z outpostem.
    const empOutposts = reg.getColoniesByEmpire(empire.id).filter(c => c.isOutpost);
    const xeOutposts = empOutposts.filter(c => this._hasDeposit(EntityManager.get(c.planetId), 'Xe')).length;
    const ntOutposts = empOutposts.filter(c => this._hasDeposit(EntityManager.get(c.planetId), 'Nt')).length;

    const targetXe = cfg.targetXeOutposts ?? DEFAULTS.targetXeOutposts;
    const targetNt = cfg.targetNtOutposts ?? DEFAULTS.targetNtOutposts;

    const canOutpost = this._canAffordOutpost(mother);
    const canFull    = this._canAffordFullColony(mother, cfg);

    // Najlepsze ciało Nt (null gdy brak zdobywalnego) — liczone RAZ, używane przez
    // P5 (build) ORAZ P3 (waiver: gdy brak ciała Nt P3 nie czeka na nieosiągalny Nt).
    const ntBody = this._pickNtBody(empire, bodyIds, civYear);

    // P1: pierwszy outpost Xe (brak żadnego). Gdy stać na outpost ale brak ciała Xe
    //     → FALL THROUGH (nie no-op) do dalszych priorytetów.
    if (xeOutposts === 0 && canOutpost) {
      const target = this._pickXeBody(empire, bodyIds, civYear);
      if (target) return void this._executeAutonomousOutpost(empire, mother, systemId, target, civYear, cfg);
    }

    // P2: kolejny outpost Xe (do targetXeOutposts).
    if (xeOutposts >= 1 && xeOutposts < targetXe && canOutpost) {
      const target = this._pickXeBody(empire, bodyIds, civYear);
      if (target) return void this._executeAutonomousOutpost(empire, mother, systemId, target, civYear, cfg);
    }

    // P5: outpost Nt (po zabezpieczeniu wszystkich Xe). Bramka WARUNKOWA — fall-through
    //     gdy ntBody===null (brak zdobywalnego ciała Nt) → brak deadlocku (waiver Filipa).
    if (xeOutposts >= targetXe && ntOutposts < targetNt && canOutpost && ntBody) {
      return void this._executeAutonomousOutpost(empire, mother, systemId, ntBody, civYear, cfg);
    }

    // P3: pełna kolonia na rocky z atmosferą oddychalną — DOPIERO po zabezpieczeniu
    //     Xe (targetXe) ORAZ Nt (targetNt LUB brak zdobywalnego ciała Nt → waiver).
    const ntSatisfied = ntOutposts >= targetNt || ntBody === null;
    if (xeOutposts >= targetXe && ntSatisfied && canFull) {
      const target = this._pickFullColonyBody(empire, bodyIds, civYear, cfg.requireBreathableForP3);
      if (target) return void this._executeFullColony(empire, mother, systemId, target, civYear, cfg);
    }

    // Fallback: pełna kolonia na dowolnym rocky (bez atmosfery też OK). Łapie etapy
    //   pośrednie (mamy outpost Xe, nie stać na kolejny, stać na kolonię) — ekspansja
    //   nie stoi w miejscu.
    if (canFull) {
      const target = this._pickFullColonyBody(empire, bodyIds, civYear, false);
      if (target) return void this._executeFullColony(empire, mother, systemId, target, civYear, cfg);
    }

    // P4 (Warstwa 3 — porty / heavy cargo) — odłożone do Slice 4 (stub, BEZ budowy).
    this._log(empire, 'brak akcji w tym ticku (P4 port deferred)',
      `xe=${xeOutposts}/${targetXe} nt=${ntOutposts}/${targetNt} ntBody=${ntBody ?? '∅'} canOutpost=${canOutpost} canFull=${canFull}`);
  }

  // Macierzysta = pierwsza kolonia !isOutpost (źródło POP/zasobów); null gdy brak.
  _pickMotherColony(empire) {
    const colonies = window.KOSMOS?.empireRegistry?.getColoniesByEmpire?.(empire.id) ?? [];
    for (const c of colonies) {
      if (c && !c.isOutpost && c.resourceSystem && c.civSystem) return c;
    }
    return null;
  }

  // ── Bramki dostępności (read-only) ────────────────────────────────────────
  // ADDENDUM: liczy SUMĘ solar+mine. Jak nie stać na OBA → ścieżka outpost pominięta.
  _canAffordOutpost(mother) {
    return mother.resourceSystem.canAfford(this._outpostCombinedCost());
  }

  _canAffordFullColony(mother, cfg) {
    const freePops = mother.civSystem.freePops ?? 0;
    if (freePops < cfg.minFreePops) return false;
    // Decyzja "minimum wg promptu": próg = transfer (200), bez bufora.
    if (mother.resourceSystem.getAmount('food')  < cfg.minFoodTransfer)  return false;
    if (mother.resourceSystem.getAmount('water') < cfg.minWaterTransfer) return false;
    return mother.resourceSystem.canAfford(this._fullColonyResourceTransfer(cfg));
  }

  // ── Koszty ───────────────────────────────────────────────────────────────
  // SUMA solar+mine: cost {Si,Cu,Ti,Fe} (rozłączne) + commodity (współdzielone klucze
  // → mergeCosts DODAJE). Jeden obiekt do spend()/canAfford() (commodities i surowce
  // bazowe są w tym samym inventory).
  _outpostCombinedCost() {
    let all = {};
    for (const bId of OUTPOST_BUILDINGS) {
      const b = BUILDINGS[bId];
      all = this.mergeCosts(all, b?.cost ?? {});
      all = this.mergeCosts(all, b?.commodityCost ?? {});
    }
    return all;
  }

  _buildingCost(buildingId) {
    const b = BUILDINGS[buildingId];
    return this.mergeCosts(b?.cost ?? {}, b?.commodityCost ?? {});
  }

  _fullColonyResourceTransfer(cfg) {
    // Minimum wymagane przez bootstrapColony (food/water ≥ 200). Bez mineral-startera
    // — budynki startowe stawiane za darmo, mine ramuje produkcję.
    return { food: cfg.minFoodTransfer, water: cfg.minWaterTransfer };
  }

  // ── Wybór + scoring kandydatów (pomija zajęte i zblacklistowane) ──────────
  /**
   * Wybiera najlepsze ciało z złożem Xe na outpost autonomiczny.
   * @param {Object}   empire   — obiekt imperium (z EmpireRegistry)
   * @param {string[]} bodyIds  — TABLICA id encji kandydatów (planetIds+moonIds+planetoidIds),
   *                              NIE systemId. Decision tree przekazuje rozwiniętą tablicę.
   * @param {number}   civYear  — bieżący civYear (do sprawdzenia blacklisty)
   * @returns {string|null} planetId najlepszego kandydata lub null
   */
  _pickXeBody(empire, bodyIds, civYear) {
    if (!Array.isArray(bodyIds)) {
      console.warn(`[EmpireStrategySystem] _pickXeBody: bodyIds nie jest tablicą (otrzymano: ${typeof bodyIds}) — zwracam null`);
      return null;
    }
    const cm = window.KOSMOS?.colonyManager;
    let best = null, bestScore = -Infinity;
    for (const id of bodyIds) {
      if (cm.getColony(id)) continue;                  // zajęte (gracz / imperium)
      if (this._isBlacklisted(id, civYear)) continue;
      const ent = EntityManager.get(id);
      if (!ent || !this._hasDeposit(ent, 'Xe')) continue;
      const score = this._scoreXeOutpostCandidate(ent);
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  /**
   * Wybiera najlepsze ciało ze złożem Nt (Neutronium) na outpost autonomiczny (Slice 2 S3, P5).
   * Analogiczny do _pickXeBody (pomija zajęte i zblacklistowane) — reużywa scoring outpostu
   * (premiuje Xe+Nt razem, richness, małe ciała). Zwraca null gdy brak zdobywalnego ciała Nt
   * (P5 waiver → P3 nie czeka na nieosiągalny Nt).
   * @param {Object}   empire   — obiekt imperium
   * @param {string[]} bodyIds  — TABLICA id encji kandydatów (NIE systemId)
   * @param {number}   civYear  — bieżący civYear (blacklist)
   * @returns {string|null} planetId najlepszego kandydata Nt lub null
   */
  _pickNtBody(empire, bodyIds, civYear) {
    if (!Array.isArray(bodyIds)) {
      console.warn(`[EmpireStrategySystem] _pickNtBody: bodyIds nie jest tablicą (otrzymano: ${typeof bodyIds}) — zwracam null`);
      return null;
    }
    const cm = window.KOSMOS?.colonyManager;
    let best = null, bestScore = -Infinity;
    for (const id of bodyIds) {
      if (cm.getColony(id)) continue;                  // zajęte (gracz / imperium)
      if (this._isBlacklisted(id, civYear)) continue;
      const ent = EntityManager.get(id);
      if (!ent || !this._hasDeposit(ent, 'Nt')) continue;
      const score = this._scoreXeOutpostCandidate(ent);  // reuse — premiuje Nt (+8) i Xe
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  /**
   * Wybiera najlepszą rocky planetę na pełną kolonię.
   * @param {Object}   empire         — obiekt imperium
   * @param {string[]} bodyIds        — TABLICA id encji kandydatów (NIE systemId)
   * @param {number}   civYear        — bieżący civYear (blacklist)
   * @param {boolean}  breathableOnly — true: tylko atmosfera oddychalna (P3); false: dowolny rocky (fallback)
   * @returns {string|null} planetId lub null
   */
  _pickFullColonyBody(empire, bodyIds, civYear, breathableOnly) {
    if (!Array.isArray(bodyIds)) {
      console.warn(`[EmpireStrategySystem] _pickFullColonyBody: bodyIds nie jest tablicą (otrzymano: ${typeof bodyIds}) — zwracam null`);
      return null;
    }
    const cm = window.KOSMOS?.colonyManager;
    let best = null, bestScore = -Infinity;
    for (const id of bodyIds) {
      if (cm.getColony(id)) continue;
      if (this._isBlacklisted(id, civYear)) continue;
      const ent = EntityManager.get(id);
      if (!ent || !this._isColonizableRocky(ent)) continue;
      if (breathableOnly && ent.atmosphere !== 'breathable') continue;
      const score = this._scoreFullColonyCandidate(ent);
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  _scoreXeOutpostCandidate(ent) {
    let score = 0;
    const xe = (ent.deposits ?? []).find(d => d.resourceId === 'Xe' && d.remaining > 0);
    if (xe) score += 20 + (xe.richness ?? 1) * 10 + Math.min(20, (xe.remaining ?? 0) / 1000);
    // Bonus za Nt (drugi rzadki — idealnie Xe+Nt)
    if ((ent.deposits ?? []).some(d => d.resourceId === 'Nt' && d.remaining > 0)) score += 8;
    // Preferuj małe ciała (księżyc/planetoid) na outposty
    if (ent.moonType || ent.planetoidType) score += 6;
    // Bonus za pospolite minerały (mine produkuje też je)
    for (const d of ent.deposits ?? []) {
      if (d.remaining > 0 && (d.resourceId === 'Fe' || d.resourceId === 'Ti' || d.resourceId === 'Cu')) score += 2;
    }
    return score;
  }

  _scoreFullColonyCandidate(ent) {
    let score = 0;
    if (ent.atmosphere === 'breathable') score += 30;
    else if (ent.atmosphere === 'thin' || ent.atmosphere === 'dense') score += 5;
    if (ent.planetType === 'rocky') score += 10;
    for (const d of ent.deposits ?? []) {
      if (d.remaining > 0 && d.resourceId === 'Fe') score += 2;
    }
    return score;
  }

  // ── EXEC: autonomiczny outpost (ATOMIC — addendum) ────────────────────────
  _executeAutonomousOutpost(empire, mother, systemId, planetId, civYear, cfg) {
    const eb  = window.KOSMOS?.empireColonyBootstrap;
    const res = mother.resourceSystem;

    const allDebits = this._outpostCombinedCost();
    // Atomic: spend() zwraca false bez debetowania gdy nie stać (race-condition guard).
    if (!res.spend(allDebits)) {
      this._log(empire, 'outpost abort: spend=false', planetId);
      return { error: 'cannot_afford' };
    }

    // Bootstrap #1 — solar. Throw → PEŁNY refund (nic nie powstało) + blacklist.
    try {
      eb.bootstrapAutonomousOutpost(empire.id, systemId, planetId, 'autonomous_solar_farm');
    } catch (e) {
      res.receive(allDebits);
      this._blacklistPlanet(planetId, civYear, cfg);
      this._log(empire, 'outpost solar throw → full refund + blacklist', `${planetId}: ${e.message}`);
      return { error: 'solar_failed' };
    }

    // Bootstrap #2 — mine. Throw → outpost z solar JUŻ istnieje, refund TYLKO mine.
    try {
      eb.bootstrapAutonomousOutpost(empire.id, systemId, planetId, 'autonomous_mine');
    } catch (e) {
      res.receive(this._buildingCost('autonomous_mine'));
      this._blacklistPlanet(planetId, civYear, cfg);
      this._log(empire, 'outpost mine throw → partial refund (mine) + blacklist', `${planetId}: ${e.message}`);
      return { error: 'mine_failed', partial: true };
    }

    EventBus.emit('ai:strategyOutpostFounded', { empireId: empire.id, planetId, systemId, civYear });
    this._log(empire, 'outpost założony (solar + mine)', planetId);
    return { ok: true, planetId };
  }

  // ── EXEC: pełna kolonia (debit zasobów + POP, rollback przy throw) ─────────
  _executeFullColony(empire, mother, systemId, planetId, civYear, cfg) {
    const eb  = window.KOSMOS?.empireColonyBootstrap;
    const res = mother.resourceSystem;
    const civ = mother.civSystem;

    const transfer = this._fullColonyResourceTransfer(cfg);
    if (!res.spend(transfer)) {
      this._log(empire, 'full colony abort: spend=false', planetId);
      return { error: 'cannot_afford' };
    }

    // POP po udanym spend. STAŁA strata (laborer) → rollback dokładny
    // (removePop(null,…) wybierałby wg satysfakcji = nieodwracalne).
    const popN = cfg.popTransferSize;
    civ.removePop('laborer', popN);

    try {
      eb.bootstrapColony(empire.id, systemId, planetId, {
        startPop:       { laborer: popN },
        startResources: { ...transfer },
        archetypeId:    empire.archetype,
      });
    } catch (e) {
      // Nowa kolonia NIE powstała → rollback OBU (zasoby + POP) + blacklist.
      res.receive(transfer);
      civ.addPop('laborer', popN);
      this._blacklistPlanet(planetId, civYear, cfg);
      this._log(empire, 'full colony throw → refund zasoby+POP + blacklist', `${planetId}: ${e.message}`);
      return { error: 'colony_failed' };
    }

    EventBus.emit('ai:strategyColonyFounded', { empireId: empire.id, planetId, systemId, pop: popN, civYear });
    this._log(empire, 'pełna kolonia założona', `${planetId} pop=${popN}`);
    return { ok: true, planetId };
  }

  // ── Blacklist (per ciało, na instancji) ───────────────────────────────────
  _blacklistPlanet(planetId, civYear, cfg) {
    const dur = cfg?.blacklistDurationCy ?? DEFAULTS.blacklistDurationCy;
    this._blacklist.set(planetId, { sinceCivYear: civYear, retryAtCivYear: civYear + dur });
  }

  _isBlacklisted(planetId, civYear) {
    const rec = this._blacklist.get(planetId);
    if (!rec) return false;
    if (civYear >= rec.retryAtCivYear) { this._blacklist.delete(planetId); return false; }
    return true;
  }

  // ── Helpery ────────────────────────────────────────────────────────────────
  // Łączy dwa obiekty kosztów DODAJĄC przy kolizji kluczy (NIE {...a,...b} —
  // commodity solar/mine współdzielą structural_alloys/android_worker/power_cells).
  mergeCosts(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (!v) continue;
      out[k] = (out[k] ?? 0) + v;
    }
    return out;
  }

  // Deposits zawsze obecne na encji (brak fog-of-war dla danych) — AI czyta wprost.
  _hasDeposit(entity, resourceId) {
    return !!entity?.deposits?.some(d => d.resourceId === resourceId && d.remaining > 0);
  }

  // Pełna kolonia = rocky planeta (powierzchnia do osiedlenia). Atmosfera bramkowana
  // przez caller (P3 breathable / fallback any).
  _isColonizableRocky(entity) {
    return entity?.planetType === 'rocky';
  }
}

export default EmpireStrategySystem;
