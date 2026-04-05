// LeaderSystem — system przywódców i frakcji (Faza B)
//
// Aplikuje bonusy przywódcy. Dla Poszukiwaczy: co 15 lat emituje event wyborów Konsula.
// Bonusy nie są jeszcze aplikowane mechanicznie (Faza B5) — system udostępnia getMultiplier().

import { LEADERS, FACTIONS, SEEKER_CONSULS } from '../data/LeaderData.js';
import EventBus from '../core/EventBus.js';

export class LeaderSystem {
  constructor() {
    this.activeFaction = null;
    this.activeLeader  = null;
    this.termStartYear = 0;
    this.termYears     = null;  // null = dożywotni (Konfederaci)
    this.consulHistory = [];    // lista poprzednich Konsulów [{id, startYear, endYear}]

    EventBus.on('time:tick', ({ civDeltaYears, gameTime }) => {
      this._checkConsulTerm(gameTime);
    });
  }

  // Ustaw frakcję i przywódcę na starcie gry
  setLeader(factionId, leaderId, startYear = 0) {
    this.activeFaction = factionId;
    this.activeLeader  = leaderId;
    this.termStartYear = startYear;

    const leader = LEADERS[leaderId];
    this.termYears = leader?.termYears ?? null;

    EventBus.emit('leader:changed', {
      faction: factionId,
      leader:  leaderId,
      leaderData: leader,
    });
  }

  // Zmiana Konsula (po wyborach)
  changeConsul(newLeaderId, currentYear) {
    // Zakończ kadencję aktualnego
    if (this.activeLeader) {
      this.consulHistory.push({
        id: this.activeLeader,
        startYear: this.termStartYear,
        endYear: currentYear,
      });
    }

    this.activeLeader  = newLeaderId;
    this.termStartYear = currentYear;

    const leader = LEADERS[newLeaderId];
    this.termYears = leader?.termYears ?? 15;

    EventBus.emit('leader:changed', {
      faction: this.activeFaction,
      leader:  newLeaderId,
      leaderData: leader,
    });
  }

  // Co 15 lat dla Poszukiwaczy — sprawdź czy kadencja minęła
  _checkConsulTerm(currentYear) {
    if (!this.termYears) return;  // Konfederaci — dożywotni
    if (currentYear - this.termStartYear >= this.termYears) {
      EventBus.emit('leader:consulElectionNeeded', {
        currentConsul: this.activeLeader,
        year: currentYear,
      });
    }
  }

  // Pobierz aktywny mnożnik dla danego stat
  getMultiplier(stat) {
    if (!this.activeLeader) return 1.0;
    const leader = LEADERS[this.activeLeader];
    if (!leader) return 1.0;

    const bonus = leader.bonuses?.find(b => b.stat === stat);
    if (bonus?.mult) return bonus.mult;

    const malus = leader.maluses?.find(m => m.stat === stat);
    if (malus?.mult) return malus.mult;

    return 1.0;
  }

  // Pobierz wartość bonusu (dla statów typu value, np. stabilityFloor)
  getValue(stat) {
    if (!this.activeLeader) return null;
    const leader = LEADERS[this.activeLeader];
    if (!leader) return null;

    const bonus = leader.bonuses?.find(b => b.stat === stat);
    if (bonus?.value !== undefined) return bonus.value;

    const malus = leader.maluses?.find(m => m.stat === stat);
    if (malus?.value !== undefined) return malus.value;

    return null;
  }

  // Dane aktywnej frakcji
  getFaction() {
    return this.activeFaction ? FACTIONS[this.activeFaction] : null;
  }

  // Dane aktywnego przywódcy
  getLeader() {
    return this.activeLeader ? LEADERS[this.activeLeader] : null;
  }

  // Dostępni kandydaci na Konsula (bez aktualnego)
  getAvailableConsuls() {
    return SEEKER_CONSULS
      .filter(id => id !== this.activeLeader)
      .map(id => LEADERS[id]);
  }

  serialize() {
    return {
      activeFaction: this.activeFaction,
      activeLeader:  this.activeLeader,
      termStartYear: this.termStartYear,
      termYears:     this.termYears,
      consulHistory: this.consulHistory,
    };
  }

  restore(data) {
    if (!data) return;
    this.activeFaction = data.activeFaction ?? null;
    this.activeLeader  = data.activeLeader  ?? null;
    this.termStartYear = data.termStartYear ?? 0;
    this.termYears     = data.termYears     ?? null;
    this.consulHistory = data.consulHistory  ?? [];
  }
}
