// ResearchSystem — zarządzanie kolejką i postępem badań
//
// Globalny system: jedna kolejka badań dla całej cywilizacji.
// Stawka badań = suma research.perYear ze WSZYSTKICH kolonii.
//
// Komunikacja:
//   Nasłuchuje: 'time:tick' → postęp badań
//   Emituje:    'tech:researched' { tech, restored: false }
//               'research:progressed' { techId, progress, cost }
//               'research:started' { techId }
//
// API:
//   queueTech(techId)    → dodaj do kolejki (lub startuj jeśli nic nie badane)
//   dequeueTech(techId)  → usuń z kolejki / anuluj aktywne
//   canResearch(techId)  → bool
//   getProgress()        → 0..1
//   getETA(currentYear)  → rok zakończenia lub null
//   getTotalRate()       → suma research/rok ze wszystkich kolonii
//   serialize() / restore(data)

import EventBus from '../core/EventBus.js';
import { TECHS } from '../data/TechData.js';

export class ResearchSystem {
  constructor(techSystem) {
    this.techSystem = techSystem;

    this.currentResearch = null;   // string | null — aktualnie badana tech
    this.researchProgress = 0;     // punkty zainwestowane w current
    this.researchQueue = [];       // string[] — kolejka tech IDs

    // Nasłuch time:tick
    EventBus.on('time:tick', ({ deltaYears }) => this._tick(deltaYears));
  }

  // ── Tick — wywoływany co ramkę gry ──────────────────────────────────────

  _tick(deltaYears) {
    if (!window.KOSMOS?.civMode) return;

    // Auto-start następnej z kolejki
    if (!this.currentResearch && this.researchQueue.length > 0) {
      this.currentResearch = this.researchQueue.shift();
      this.researchProgress = 0;
      EventBus.emit('research:started', { techId: this.currentResearch });
    }
    if (!this.currentResearch) return;

    const tech = TECHS[this.currentResearch];
    if (!tech) { this.currentResearch = null; return; }

    // Efektywny koszt z discovery soft-gate + research cost multiplier
    const effectiveCost = this.techSystem.getEffectiveCost(tech).research;

    // Pobierz punkty badań z puli research.amount (zużyj wyprodukowane)
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    let pointsThisTick = 0;
    for (const col of colMgr.getAllColonies()) {
      const rs = col.resourceSystem;
      if (!rs) continue;
      const available = rs.research?.amount ?? 0;
      if (available > 0) {
        const needed = effectiveCost - this.researchProgress - pointsThisTick;
        const drain = Math.min(available, Math.max(0, needed));
        if (drain > 0) {
          rs.research.amount -= drain;
          pointsThisTick += drain;
        }
      }
    }
    this.researchProgress += pointsThisTick;

    if (this.researchProgress >= effectiveCost) {
      this._completeTech(tech);
    }
  }

  _completeTech(tech) {
    // Deleguj odkrycie do TechSystem (efekty, mnożniki)
    this.techSystem._researched.add(tech.id);
    this.currentResearch = null;
    this.researchProgress = 0;

    EventBus.emit('tech:researched', { tech, restored: false });

    // Auto-start następnej
    if (this.researchQueue.length > 0) {
      this.currentResearch = this.researchQueue.shift();
      this.researchProgress = 0;
      EventBus.emit('research:started', { techId: this.currentResearch });
    }
  }

  // Zużyj zgromadzone punkty badań ze wszystkich kolonii jako natychmiastowy postęp
  _consumeAccumulatedResearch() {
    if (!this.currentResearch) return;
    const tech = TECHS[this.currentResearch];
    if (!tech) return;
    const effectiveCost = this.techSystem.getEffectiveCost(tech).research;
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    for (const col of colMgr.getAllColonies()) {
      const rs = col.resourceSystem;
      if (!rs) continue;
      const available = rs.research?.amount ?? 0;
      if (available > 0) {
        const needed = effectiveCost - this.researchProgress;
        const drain = Math.min(available, Math.max(0, needed));
        if (drain > 0) {
          rs.research.amount -= drain;
          this.researchProgress += drain;
        }
      }
    }

    // Natychmiastowe odkrycie jeśli pula wystarczyła
    if (this.researchProgress >= effectiveCost) {
      this._completeTech(tech);
    }
  }

  // ── API publiczne ────────────────────────────────────────────────────────

  canResearch(techId) {
    const tech = TECHS[techId];
    if (!tech) return false;
    if (this.techSystem.isResearched(techId)) return false;
    // Deleguj do TechSystem.checkPrerequisites (obsługuje OR)
    return this.techSystem.checkPrerequisites(tech);
  }

  queueTech(techId) {
    if (!this.canResearch(techId)) return false;
    if (this.researchQueue.includes(techId)) return false;
    if (this.currentResearch === techId) return false;

    if (!this.currentResearch) {
      // Nic nie jest badane — startuj od razu
      this.currentResearch = techId;
      this.researchProgress = 0;
      // Zużyj zgromadzone punkty badań jako natychmiastowy postęp
      this._consumeAccumulatedResearch();
      EventBus.emit('research:started', { techId });
    } else {
      this.researchQueue.push(techId);
    }
    return true;
  }

  dequeueTech(techId) {
    this.researchQueue = this.researchQueue.filter(id => id !== techId);
    if (this.currentResearch === techId) {
      this.currentResearch = this.researchQueue.shift() ?? null;
      this.researchProgress = 0;
      if (this.currentResearch) {
        EventBus.emit('research:started', { techId: this.currentResearch });
      }
    }
  }

  getProgress() {
    if (!this.currentResearch) return 0;
    const tech = TECHS[this.currentResearch];
    if (!tech) return 0;
    const effectiveCost = this.techSystem.getEffectiveCost(tech).research;
    return this.researchProgress / effectiveCost;
  }

  getETA(currentYear) {
    if (!this.currentResearch) return null;
    const tech = TECHS[this.currentResearch];
    if (!tech) return null;
    const effectiveCost = this.techSystem.getEffectiveCost(tech).research;
    const remaining = effectiveCost - this.researchProgress;
    const rate = this.getTotalRate();
    if (rate <= 0) return Infinity;
    return currentYear + remaining / rate;
  }

  getTotalRate() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return 0;
    let total = 0;
    for (const col of colMgr.getAllColonies()) {
      total += col.resourceSystem?.research?.perYear ?? 0;
    }
    return total;
  }

  // ── Serializacja ─────────────────────────────────────────────────────────

  serialize() {
    return {
      currentResearch: this.currentResearch,
      researchProgress: this.researchProgress,
      researchQueue: [...this.researchQueue],
    };
  }

  restore(data) {
    if (!data) return;
    this.currentResearch = data.currentResearch ?? null;
    this.researchProgress = data.researchProgress ?? 0;
    this.researchQueue = data.researchQueue ?? [];
  }
}
