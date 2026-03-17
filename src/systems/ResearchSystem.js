// ResearchSystem — zarządzanie kolejką i postępem badań (multi-slot)
//
// Globalny system: jedna kolejka badań dla całej cywilizacji.
// Stawka badań = suma research.perYear ze WSZYSTKICH kolonii.
// Punkty dzielone równo między aktywne sloty.
//
// Sloty: bazowo 1, basic_computing dodaje +1 (łącznie 2).
// TechSystem.getResearchSlots() → maksymalna liczba równoczesnych badań.
//
// Komunikacja:
//   Nasłuchuje: 'time:tick' → postęp badań
//   Emituje:    'tech:researched' { tech, restored: false }
//               'research:started' { techId }
//
// API:
//   queueTech(techId)    → dodaj do kolejki (lub aktywuj jeśli wolny slot)
//   dequeueTech(techId)  → usuń z kolejki / anuluj aktywne
//   canResearch(techId)  → bool
//   getActiveResearch()  → [{ techId, progress }]
//   getProgressOf(techId)→ 0..1
//   getMaxSlots()        → int
//   getETAof(techId, yr) → rok zakończenia lub null
//   getTotalRate()       → suma research/rok ze wszystkich kolonii
//   serialize() / restore(data)

import EventBus from '../core/EventBus.js';
import { TECHS } from '../data/TechData.js';

export class ResearchSystem {
  constructor(techSystem) {
    this.techSystem = techSystem;

    // Aktywne badania: tablica { techId, progress }
    this.activeResearch = [];   // max = getMaxSlots()
    this.researchQueue = [];    // string[] — kolejka tech IDs

    // Kompatybilność wsteczna — stare API (read-only gettery)
    // TechOverlay i inne systemy mogą nadal czytać currentResearch/researchProgress
    Object.defineProperty(this, 'currentResearch', {
      get: () => this.activeResearch.length > 0 ? this.activeResearch[0].techId : null,
      enumerable: false,
    });
    Object.defineProperty(this, 'researchProgress', {
      get: () => this.activeResearch.length > 0 ? this.activeResearch[0].progress : 0,
      enumerable: false,
    });

    // Nasłuch time:tick
    EventBus.on('time:tick', ({ deltaYears }) => this._tick(deltaYears));
  }

  // ── Tick — wywoływany co ramkę gry ──────────────────────────────────────

  _tick(deltaYears) {
    if (!window.KOSMOS?.civMode) return;

    // Auto-fill wolnych slotów z kolejki
    this._fillSlots();
    if (this.activeResearch.length === 0) return;

    // Zbierz punkty badań ze wszystkich kolonii
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    let totalPoints = 0;
    for (const col of colMgr.getAllColonies()) {
      const rs = col.resourceSystem;
      if (!rs) continue;
      const available = rs.research?.amount ?? 0;
      if (available > 0) {
        rs.research.amount = 0;
        totalPoints += available;
      }
    }
    if (totalPoints <= 0) return;

    // Podziel punkty równo między aktywne sloty
    const activeCount = this.activeResearch.length;
    const perSlot = totalPoints / activeCount;

    // Rozdziel i sprawdź ukończenie (iteracja od końca — splice bezpieczny)
    const completed = [];
    for (let i = 0; i < this.activeResearch.length; i++) {
      const slot = this.activeResearch[i];
      const tech = TECHS[slot.techId];
      if (!tech) { completed.push(i); continue; }
      const cost = this.techSystem.getEffectiveCost(tech).research;
      const needed = cost - slot.progress;
      const applied = Math.min(perSlot, needed);
      slot.progress += applied;

      // Zwróć nadmiar do pierwszej kolonii (rzadkie, ale czyste)
      const surplus = perSlot - applied;
      if (surplus > 0) {
        const firstCol = colMgr.getAllColonies()[0];
        if (firstCol?.resourceSystem) {
          firstCol.resourceSystem.research.amount += surplus;
        }
      }

      if (slot.progress >= cost) {
        completed.push(i);
      }
    }

    // Ukończ badania (od końca, żeby indeksy się nie przesuwały)
    for (let i = completed.length - 1; i >= 0; i--) {
      const idx = completed[i];
      const slot = this.activeResearch[idx];
      const tech = TECHS[slot.techId];
      this.activeResearch.splice(idx, 1);
      if (tech) {
        this.techSystem._researched.add(tech.id);
        EventBus.emit('tech:researched', { tech, restored: false });
      }
    }

    // Uzupełnij sloty po ukończeniach
    if (completed.length > 0) {
      this._fillSlots();
    }
  }

  /** Uzupełnij wolne sloty z kolejki */
  _fillSlots() {
    const maxSlots = this.getMaxSlots();
    while (this.activeResearch.length < maxSlots && this.researchQueue.length > 0) {
      const techId = this.researchQueue.shift();
      // Sprawdź czy tech nadal ważne (mogło się odkryć z drugiego slotu)
      if (this.techSystem.isResearched(techId)) continue;
      this.activeResearch.push({ techId, progress: 0 });
      EventBus.emit('research:started', { techId });
    }
  }

  /** Zużyj zgromadzone punkty badań jako natychmiastowy postęp (przy queueTech) */
  _consumeAccumulatedResearch() {
    if (this.activeResearch.length === 0) return;
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    let totalPoints = 0;
    for (const col of colMgr.getAllColonies()) {
      const rs = col.resourceSystem;
      if (!rs) continue;
      const available = rs.research?.amount ?? 0;
      if (available > 0) {
        rs.research.amount = 0;
        totalPoints += available;
      }
    }
    if (totalPoints <= 0) return;

    const activeCount = this.activeResearch.length;
    const perSlot = totalPoints / activeCount;

    const completed = [];
    for (let i = 0; i < this.activeResearch.length; i++) {
      const slot = this.activeResearch[i];
      const tech = TECHS[slot.techId];
      if (!tech) { completed.push(i); continue; }
      const cost = this.techSystem.getEffectiveCost(tech).research;
      const needed = cost - slot.progress;
      const applied = Math.min(perSlot, needed);
      slot.progress += applied;
      const surplus = perSlot - applied;
      if (surplus > 0) {
        const firstCol = colMgr.getAllColonies()[0];
        if (firstCol?.resourceSystem) {
          firstCol.resourceSystem.research.amount += surplus;
        }
      }
      if (slot.progress >= cost) completed.push(i);
    }

    for (let i = completed.length - 1; i >= 0; i--) {
      const idx = completed[i];
      const slot = this.activeResearch[idx];
      const tech = TECHS[slot.techId];
      this.activeResearch.splice(idx, 1);
      if (tech) {
        this.techSystem._researched.add(tech.id);
        EventBus.emit('tech:researched', { tech, restored: false });
      }
    }
  }

  // ── API publiczne ────────────────────────────────────────────────────────

  getMaxSlots() {
    return this.techSystem?.getResearchSlots() ?? 1;
  }

  getActiveResearch() {
    return this.activeResearch;
  }

  canResearch(techId) {
    const tech = TECHS[techId];
    if (!tech) return false;
    if (this.techSystem.isResearched(techId)) return false;
    return this.techSystem.checkPrerequisites(tech);
  }

  isActive(techId) {
    return this.activeResearch.some(s => s.techId === techId);
  }

  queueTech(techId) {
    if (!this.canResearch(techId)) return false;
    if (this.researchQueue.includes(techId)) return false;
    if (this.isActive(techId)) return false;

    const maxSlots = this.getMaxSlots();
    if (this.activeResearch.length < maxSlots) {
      // Wolny slot — startuj od razu
      this.activeResearch.push({ techId, progress: 0 });
      this._consumeAccumulatedResearch();
      EventBus.emit('research:started', { techId });
    } else {
      this.researchQueue.push(techId);
    }
    return true;
  }

  dequeueTech(techId) {
    // Usuń z kolejki
    this.researchQueue = this.researchQueue.filter(id => id !== techId);

    // Usuń z aktywnych
    const idx = this.activeResearch.findIndex(s => s.techId === techId);
    if (idx !== -1) {
      this.activeResearch.splice(idx, 1);
      // Uzupełnij z kolejki
      this._fillSlots();
    }
  }

  /** Postęp 0..1 dla konkretnego techId (lub pierwszego aktywnego jeśli brak arg) */
  getProgress(techId) {
    if (techId) {
      const slot = this.activeResearch.find(s => s.techId === techId);
      if (!slot) return 0;
      const tech = TECHS[slot.techId];
      if (!tech) return 0;
      return slot.progress / this.techSystem.getEffectiveCost(tech).research;
    }
    // Kompatybilność wsteczna — pierwszy slot
    if (this.activeResearch.length === 0) return 0;
    const slot = this.activeResearch[0];
    const tech = TECHS[slot.techId];
    if (!tech) return 0;
    return slot.progress / this.techSystem.getEffectiveCost(tech).research;
  }

  getProgressOf(techId) {
    return this.getProgress(techId);
  }

  getETA(currentYear, techId) {
    const slot = techId
      ? this.activeResearch.find(s => s.techId === techId)
      : this.activeResearch[0];
    if (!slot) return null;
    const tech = TECHS[slot.techId];
    if (!tech) return null;
    const cost = this.techSystem.getEffectiveCost(tech).research;
    const remaining = cost - slot.progress;
    const rate = this.getTotalRate();
    if (rate <= 0) return Infinity;
    // Punkty dzielone między sloty
    const activeCount = this.activeResearch.length;
    const ratePerSlot = rate / activeCount;
    return currentYear + remaining / ratePerSlot;
  }

  getETAof(techId, currentYear) {
    return this.getETA(currentYear, techId);
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
      activeResearch: this.activeResearch.map(s => ({ techId: s.techId, progress: s.progress })),
      researchQueue: [...this.researchQueue],
    };
  }

  restore(data) {
    if (!data) return;

    // Kompatybilność z v19 (stary format: currentResearch + researchProgress)
    if (data.currentResearch !== undefined && data.activeResearch === undefined) {
      this.activeResearch = data.currentResearch
        ? [{ techId: data.currentResearch, progress: data.researchProgress ?? 0 }]
        : [];
    } else {
      this.activeResearch = (data.activeResearch ?? []).map(s => ({
        techId: s.techId,
        progress: s.progress ?? 0,
      }));
    }
    this.researchQueue = data.researchQueue ?? [];
  }
}
