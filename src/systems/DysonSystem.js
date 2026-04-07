// DysonSystem — megaprojekt Sfery Dysona (Faza D3)
//
// Budowa "katedralna": 20 segmentów w 4 fazach. Gracz dostarcza surowce kiedy
// chce i ile chce. Każdy ukończony segment daje +5 research/rok permanentnie.
// Visual progresja gwiazdy w ThreeRenderer (5 etapów wg getDysonVisualStage).
//
// Komunikacja:
//   Nasłuchuje:
//     'dyson:engineeringUnlocked'  → aktywuje Sferę + odblokowuje Phase 1
//     'dyson:collectorUnlocked'    → odblokowuje Phase 2 + Phase 3
//     'dyson:transmitterUnlocked'  → odblokowuje Phase 4
//     'dyson:jumpGateUnlocked'     → segment 20 dostępny do aktywacji
//   Emituje:
//     'dyson:panelUpdate'          → DysonOverlay (pełny stan)
//     'dyson:visualStageChanged'   → ThreeRenderer (etap 0-4)
//     'dyson:segmentCompleted'     → GameScene (popup + faction shift)
//
// Per-colony resources: dostawy spendowane z homePlanet.resourceSystem,
// research bonus rejestrowany na homePlanet (gdzie stoi dyson_command).

import { DYSON_SEGMENTS, DYSON_PHASES, getDysonVisualStage }
  from '../data/DysonData.js';
import EventBus from '../core/EventBus.js';

const RESEARCH_PER_SEGMENT = 5;
const RESEARCH_PRODUCER_ID = 'dyson_research_bonus';

// Helper: zwróć ResourceSystem kolonii domowej (gdzie stoi dyson_command)
// Fallback do active resourceSystem jeśli brak homePlanet.
function _getHomeResourceSystem() {
  const hp = window.KOSMOS?.homePlanet;
  if (hp) {
    const homeCol = window.KOSMOS?.colonyManager?.getColony(hp.id);
    if (homeCol?.resourceSystem) return homeCol.resourceSystem;
  }
  return window.KOSMOS?.resourceSystem ?? null;
}

export class DysonSystem {
  constructor() {
    // Stan segmentów: { segmentId: { delivered: {res: amount}, completed: bool } }
    this._segments = {};
    for (let i = 1; i <= 20; i++) {
      this._segments[i] = { delivered: {}, completed: false };
    }

    this._unlockedPhases = new Set();   // Set<phaseId>
    this._completedCount = 0;
    this._researchBonus  = 0;            // +5 per ukończony segment
    this._active         = false;        // true po dyson:engineeringUnlocked

    // Nasłuchuj odblokowań faz z TechSystem
    EventBus.on('dyson:engineeringUnlocked', () => {
      this._active = true;
      this._unlockedPhases.add('phase_1');
      EventBus.emit('dyson:panelUpdate', this._getState());
    });

    EventBus.on('dyson:collectorUnlocked', () => {
      this._unlockedPhases.add('phase_2');
      this._unlockedPhases.add('phase_3');
      EventBus.emit('dyson:panelUpdate', this._getState());
    });

    EventBus.on('dyson:transmitterUnlocked', () => {
      this._unlockedPhases.add('phase_4');
      EventBus.emit('dyson:panelUpdate', this._getState());
    });

    EventBus.on('dyson:jumpGateUnlocked', () => {
      // Segment 20 ma własny requiresTech — sprawdzane w deliver()
      EventBus.emit('dyson:panelUpdate', this._getState());
    });
  }

  // ── Publiczne API ─────────────────────────────────────────────────────

  // Sprawdź czy gracz może dostarczyć do segmentu — bez efektów ubocznych.
  // Zwraca { ok: true } LUB { ok: false, reason: '...', tech?: '...' }.
  // Reasons: 'notUnlocked' | 'invalidSegment' | 'alreadyCompleted' |
  //          'phaseNotUnlocked' | 'segmentTechRequired' | 'noResourceSystem'
  // Użycie: window.KOSMOS.dysonSystem.canDeliver(20)
  canDeliver(segmentId) {
    if (!this._active) return { ok: false, reason: 'notUnlocked' };
    if (segmentId < 1 || segmentId > 20) return { ok: false, reason: 'invalidSegment' };

    const seg    = this._segments[segmentId];
    const segDef = DYSON_SEGMENTS[segmentId];
    if (!seg || !segDef) return { ok: false, reason: 'invalidSegment' };
    if (seg.completed)   return { ok: false, reason: 'alreadyCompleted' };

    // Faza odblokowana?
    const phase = DYSON_PHASES.find(p => p.segments.includes(segmentId));
    if (!phase || !this._unlockedPhases.has(phase.id)) {
      return { ok: false, reason: 'phaseNotUnlocked' };
    }

    // Per-segment requiresTech (segment 20: jump_gate_construction)
    if (segDef.requiresTech) {
      const tSys = window.KOSMOS?.techSystem;
      if (!tSys?.isResearched?.(segDef.requiresTech)) {
        return { ok: false, reason: 'segmentTechRequired', tech: segDef.requiresTech };
      }
    }

    // Resource system dostępny?
    const resSys = _getHomeResourceSystem();
    if (!resSys) return { ok: false, reason: 'noResourceSystem' };

    return { ok: true };
  }

  // Dostarcz surowce do segmentu — zwraca { ok, delivered? } albo { ok:false, reason }
  // resources: { Fe: 1000, Si: 500, ... } — ile gracz CHCE dostarczyć (max)
  // System pobierze tylko tyle ile trzeba i ile gracz ma w magazynie.
  deliver(segmentId, resources) {
    // Wszystkie pre-checks deleguj do canDeliver() — pojedyncze źródło prawdy
    const can = this.canDeliver(segmentId);
    if (!can.ok) return can;

    const seg    = this._segments[segmentId];
    const segDef = DYSON_SEGMENTS[segmentId];
    const resSys = _getHomeResourceSystem();

    // Cost reduction z orbital_fabricator (level × 10%, max -50% przy lv5)
    const fabricatorLv = window.KOSMOS?.buildingSystem?._getBuildingLevel?.('orbital_fabricator') ?? 0;
    const costMult = Math.max(0.5, 1.0 - (fabricatorLv * 0.10));

    // Oblicz ile faktycznie pobrać per surowiec
    const toDeliver = {};
    for (const [res, requested] of Object.entries(resources)) {
      if (!(res in segDef.cost)) continue;
      const baseCost  = segDef.cost[res];
      const effective = Math.ceil(baseCost * costMult);
      const delivered = seg.delivered[res] ?? 0;
      const remaining = Math.max(0, effective - delivered);
      const wanted    = Math.min(requested, remaining);
      if (wanted <= 0) continue;

      // Sprawdź dostępność w magazynie
      const available = resSys.getAmount?.(res) ?? 0;
      const actual    = Math.min(wanted, available);
      if (actual <= 0) continue;
      toDeliver[res] = actual;
    }

    if (Object.keys(toDeliver).length === 0) {
      return { ok: false, reason: 'nothingToDeliver' };
    }

    // Pobierz surowce (ResourceSystem.spend bierze obiekt — jedna transakcja)
    const spent = resSys.spend?.(toDeliver);
    if (spent === false) {
      // canAfford failed (race condition) — bez zmian stanu
      return { ok: false, reason: 'spendFailed' };
    }

    // Zarejestruj dostawę
    for (const [res, amount] of Object.entries(toDeliver)) {
      seg.delivered[res] = (seg.delivered[res] ?? 0) + amount;
    }

    // Sprawdź ukończenie segmentu (z uwzględnieniem cost reduction)
    if (this._isSegmentComplete(segmentId, costMult)) {
      seg.completed = true;
      this._onSegmentCompleted(segmentId);
    }

    EventBus.emit('dyson:panelUpdate', this._getState());
    return { ok: true, delivered: toDeliver };
  }

  // Convenience: dostarcz max ze wszystkich brakujących surowców (UI helper)
  deliverMax(segmentId) {
    const segDef = DYSON_SEGMENTS[segmentId];
    if (!segDef) return { ok: false, reason: 'invalidSegment' };
    // Wystarczy podać Infinity dla każdego surowca — deliver() obetnie do remaining/available
    const request = {};
    for (const res of Object.keys(segDef.cost)) {
      request[res] = Infinity;
    }
    return this.deliver(segmentId, request);
  }

  // Convenience: dostarcz X% bazowego kosztu z każdego surowca (UI helper)
  // percent: 0.10 = 10%, 0.25 = 25% itp.
  // deliver() i tak obetnie do dostępności w magazynie i remaining w segmencie.
  deliverPercent(segmentId, percent = 0.10) {
    const segDef = DYSON_SEGMENTS[segmentId];
    if (!segDef) return { ok: false, reason: 'invalidSegment' };
    const request = {};
    for (const [res, needed] of Object.entries(segDef.cost)) {
      // Min 1 jednostka per surowiec żeby procent <1% nie zwracał 0
      request[res] = Math.max(1, Math.ceil(needed * percent));
    }
    return this.deliver(segmentId, request);
  }

  // Postęp segmentu (0.0-1.0) — uwzględnia cost reduction
  getProgress(segmentId) {
    const seg    = this._segments[segmentId];
    const segDef = DYSON_SEGMENTS[segmentId];
    if (!seg || !segDef) return 0;

    const fabricatorLv = window.KOSMOS?.buildingSystem?._getBuildingLevel?.('orbital_fabricator') ?? 0;
    const costMult = Math.max(0.5, 1.0 - (fabricatorLv * 0.10));

    let totalNeeded    = 0;
    let totalDelivered = 0;
    for (const [res, baseNeeded] of Object.entries(segDef.cost)) {
      const effective = Math.ceil(baseNeeded * costMult);
      totalNeeded    += effective;
      totalDelivered += Math.min(seg.delivered[res] ?? 0, effective);
    }
    return totalNeeded > 0 ? totalDelivered / totalNeeded : 0;
  }

  // ── Wewnętrzna logika ─────────────────────────────────────────────────

  _isSegmentComplete(segmentId, costMult = null) {
    const seg    = this._segments[segmentId];
    const segDef = DYSON_SEGMENTS[segmentId];
    if (costMult === null) {
      const fabricatorLv = window.KOSMOS?.buildingSystem?._getBuildingLevel?.('orbital_fabricator') ?? 0;
      costMult = Math.max(0.5, 1.0 - (fabricatorLv * 0.10));
    }
    for (const [res, baseNeeded] of Object.entries(segDef.cost)) {
      const effective = Math.ceil(baseNeeded * costMult);
      if ((seg.delivered[res] ?? 0) < effective) return false;
    }
    return true;
  }

  _onSegmentCompleted(segmentId) {
    this._completedCount++;
    this._researchBonus += RESEARCH_PER_SEGMENT;

    // Aktualizuj research producer (na home colony — gdzie stoi dyson_command)
    this._updateResearchProducer();

    // Etap wizualny gwiazdy
    const newStage = getDysonVisualStage(this._completedCount);
    EventBus.emit('dyson:visualStageChanged', {
      stage:          newStage,
      completedCount: this._completedCount,
      segmentId,
    });

    // Event narracyjny — popup + faction shift (handler w GameScene)
    const def = DYSON_SEGMENTS[segmentId];
    EventBus.emit('dyson:segmentCompleted', {
      segmentId,
      completedCount: this._completedCount,
      segmentNamePL:  def.namePL,
      segmentNameEN:  def.nameEN,
    });
  }

  // Re-rejestracja research producer (po segment complete LUB restore)
  _updateResearchProducer() {
    const resSys = _getHomeResourceSystem();
    if (!resSys) return;
    resSys.removeProducer?.(RESEARCH_PRODUCER_ID);
    if (this._researchBonus > 0) {
      resSys.registerProducer?.(RESEARCH_PRODUCER_ID, { research: this._researchBonus });
    }
  }

  // Snapshot stanu dla DysonOverlay UI
  _getState() {
    return {
      active:         this._active,
      completedCount: this._completedCount,
      researchBonus:  this._researchBonus,
      unlockedPhases: [...this._unlockedPhases],
      stage:          getDysonVisualStage(this._completedCount),
      segments:       Object.fromEntries(
        Object.entries(this._segments).map(([id, seg]) => [
          id,
          {
            completed: seg.completed,
            progress:  this.getProgress(Number(id)),
            delivered: { ...seg.delivered },
            cost:      DYSON_SEGMENTS[Number(id)].cost,
          },
        ])
      ),
    };
  }

  // Publiczny snapshot (alias dla UI/save)
  getState() { return this._getState(); }

  // Publiczny getter — używany przez triggery endgame (Faza D4)
  get completedCount() { return this._completedCount; }
  get isActive()       { return this._active; }

  // Wymuś emisję dyson:panelUpdate — odświeża DysonOverlay bez restartu gry.
  // Użycie z konsoli: window.KOSMOS.dysonSystem.forceUpdate()
  // Przydatne gdy panel wisi w starym stanie (np. po debug w devtools).
  forceUpdate() {
    EventBus.emit('dyson:panelUpdate', this._getState());
  }

  // Dyson Progress multiplier z LeaderSystem (Viktor Havel ×3)
  // Uwaga: tu tylko zwracamy mnożnik — żeby go FAKTYCZNIE zastosować, użyj
  // przy obliczaniu kosztów lub szybkości budowy. Aktualnie hint dla przyszłej impl.
  getDysonProgressMultiplier() {
    return window.KOSMOS?.leaderSystem?.getMultiplier?.('dysonProgress') ?? 1.0;
  }

  // ── Serialize / Restore ───────────────────────────────────────────────

  serialize() {
    return {
      segments:       this._segments,
      unlockedPhases: [...this._unlockedPhases],
      completedCount: this._completedCount,
      researchBonus:  this._researchBonus,
      active:         this._active,
    };
  }

  restore(data) {
    if (!data) return;
    // Defensywnie: jeśli segments brak, zainicjalizuj puste
    if (data.segments && typeof data.segments === 'object') {
      this._segments = data.segments;
      // Defensywne dopełnienie brakujących segmentów (np. po dodaniu nowych w przyszłości)
      for (let i = 1; i <= 20; i++) {
        if (!this._segments[i]) {
          this._segments[i] = { delivered: {}, completed: false };
        }
      }
    }
    this._unlockedPhases = new Set(data.unlockedPhases ?? []);
    this._completedCount = data.completedCount ?? 0;
    this._researchBonus  = data.researchBonus  ?? 0;
    this._active         = data.active         ?? false;

    // Re-rejestracja research producer po restore (research bonus jest persistowany,
    // ale producer w ResourceSystem nie — trzeba odtworzyć)
    this._updateResearchProducer();
  }
}
