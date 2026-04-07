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

    // Runtime guard — gdy true, election event NIE jest re-emitowany aż do changeConsul()
    this._electionPending = false;

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

  // Faza C4: ustaw lidera BEZ frakcji (frakcje zostaną odblokowane po odkryciu Ziemi)
  // termYears=null → dożywotni do czasu unlocku, brak rotacji konsulów dopóki frakcje są zablokowane
  setLeaderNoFaction(leaderId, startYear = 0) {
    const leader = LEADERS[leaderId];
    if (!leader) return;
    this.activeLeader  = leaderId;
    this.activeFaction = null;
    this.termStartYear = startYear;
    this.termYears     = null;
    this._electionPending = false;

    EventBus.emit('leader:set', { leaderId, faction: null });
    EventBus.emit('leader:changed', {
      faction:    null,
      leader:     leaderId,
      leaderData: leader,
    });
  }

  // Faza C5: przypisz frakcję istniejącemu liderowi (po unlock FactionSystem)
  // Wywoływane z handlera narrative:earthLocated po odblokowaniu frakcji.
  assignFaction(factionId) {
    this.activeFaction = factionId;
    EventBus.emit('leader:factionAssigned', {
      leaderId: this.activeLeader,
      faction:  factionId,
    });
  }

  // Faza C5: konwertuj lidera Seekersów na Konsula z kadencją (rotacja co N lat)
  // Wywoływane z handlera narrative:earthLocated jeśli hidden_faction === 'seekers'.
  // termStartYear pozostaje z setLeaderNoFaction (rok 0 lub bieżący gameTime).
  convertToConsul() {
    const leader = LEADERS[this.activeLeader];
    if (!leader) return;
    this.termYears = leader.termYears ?? 15;
    // termStartYear ustawiamy na bieżący rok — kadencja Konsula liczy się od nominacji
    this.termStartYear = window.KOSMOS?.timeSystem?.gameTime ?? this.termStartYear;
    this._electionPending = false;
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

    // Re-arm: nowa kadencja rozpoczęta, można znowu wystawić election
    this._electionPending = false;

    EventBus.emit('leader:changed', {
      faction: this.activeFaction,
      leader:  newLeaderId,
      leaderData: leader,
    });
  }

  // Co tick (time:tick) sprawdź czy kadencja minęła — tylko Konsulowie (Poszukiwacze)
  // Emit jest jednorazowy: po wystawieniu czeka na changeConsul() zanim re-emituje
  _checkConsulTerm(currentYear) {
    if (!this.termYears) return;          // Konfederaci — dożywotni Archont
    if (this._electionPending)  return;    // event już wystawiony, czekamy na wybór
    if (currentYear - this.termStartYear < this.termYears) return;

    this._electionPending = true;
    EventBus.emit('leader:consulElectionNeeded', {
      currentConsul: this.activeLeader,
      year: currentYear,
    });
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

    // Defensywna naprawa: legacy save mógł nie mieć termYears dla Seekera —
    // bez tego wybory nigdy by nie ruszyły. Recompute z LEADERS.
    if (this.activeFaction === 'seekers' && this.termYears == null && this.activeLeader) {
      const leader = LEADERS[this.activeLeader];
      this.termYears = leader?.termYears ?? 15;
    }

    // Election guard zawsze startuje jako false po restore — jeśli próg jest przekroczony,
    // następny tick wystawi event jednorazowo (co jest pożądane).
    this._electionPending = false;
  }
}
