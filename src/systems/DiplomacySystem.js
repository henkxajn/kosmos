// DiplomacySystem — relacje gracz ↔ obce imperia (WOJNA I POKÓJ 1.0, faza D1).
//
// FASADA: polityka + zdarzenia. Stan trzyma RelationsModel (jedyny pisarz
// gameState.diplomacy.relations), reputację ReputationLedger, matematykę OpinionMath,
// a wartości/tempa/etykiety katalog OpinionModifierData. Zewnętrzni wołający NIE
// dotykają surowego rekordu — dostają wartości albo projekcję (listPlayerRelations).
//
// DWIE OSIE, obie na parze:
//   opinia   — „co o was myślimy": Σ modyfikatorów, LICZONA, nigdy nie zapisywana,
//              z gotowym rozbiciem dla UI. Zastąpiła dawny skalar `trust`.
//   napięcie — „jak blisko wojny": dawny `hostility` 1:1, ta sama drabina
//              40 ostrzeżenie / 60 ultimatum / 80 auto-wojna i ten sam decay −5/rok cyw.
//
// Klucz pary: id posortowane leksykalnie, sklejone '__' ('emp_003__player').
// Schemat gotowy na pary AI↔AI (D5) — D1 nie tworzy żadnej.
//
// Intent methods (WYŁĄCZNE mutacje relacji):
//   changeTension / addOpinionModifier / removeOpinionModifier / addMemory
//   declareWar / offerPeace / signTreaty / breakTreaty
//
// Automatyczne reguły (handlery EventBus) — bez zmian względem stanu sprzed D1:
//   colony:founded / outpost:founded w systemie imperium → +30 napięcia
//   observatory:discovered w systemie imperium         → +10 napięcia (raz na imperium)
//   vessel:arrived w systemie imperium                 → modyfikator opinii wg typu statku
//   tick 1 rok cyw.: modyfikatory (ramp/decay) → reputacja → wygasłe rozejmy →
//                    decay napięcia → wygaśnięcie ultimatum → zaleganie w obcej przestrzeni

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { hasWeapons, canDoScience, canDoEnvoy } from '../entities/Vessel.js';
import { TREATY_TYPES } from '../data/TreatyData.js';
import { t } from '../i18n/i18n.js';
import { RelationsModel } from './diplomacy/RelationsModel.js';
import { ReputationLedger } from './diplomacy/ReputationLedger.js';
import { TENSION_THRESHOLDS, crossedUp } from '../utils/OpinionMath.js';
import {
  OPINION_MODIFIERS, OPINION_HOSTILE_MAX, OPINION_FRIENDLY_MIN, TRUCE_YEARS, CB_MEMORY_WINDOW,
} from '../data/OpinionModifierData.js';

// Id gracza jako strony relacji (dosłowne, nie prefiks).
const PLAYER = 'player';

// Progi drabiny — z OpinionMath, żeby model i fasada nie rozjechały się liczbami.
const WARNING_THRESHOLD   = TENSION_THRESHOLDS.warning;
const ULTIMATUM_THRESHOLD = TENSION_THRESHOLDS.ultimatum;
const WAR_THRESHOLD       = TENSION_THRESHOLDS.war;

// Decay napięcia podczas pokoju (na rok cyw.) + ile lat ciszy go odblokowuje.
// ⚠ NIE bramkowane flagą diplomacyDecay — to stara mechanika, nie nowy silnik.
const PEACE_DECAY       = 5.0;
const PEACE_QUIET_YEARS = 2.0;

// Czas na reakcję po ultimatum (lata cyw.).
const ULTIMATUM_GRACE_YEARS = 3.0;

// Napięcie, do którego schodzi relacja po zawarciu rozejmu.
const TRUCE_TENSION_CAP = 30;

// Kara za zaleganie statku badawczego w obcym układzie — co ile lat cyw. naliczana.
const TRESPASS_YEARS = 1.0;

// Traktat → modyfikator opinii, który z nim żyje i z nim ginie. Wyprowadzone
// z katalogu, żeby dodanie kolejnego traktatu-z-modyfikatorem nie wymagało edycji tutaj.
const TREATY_TO_MODIFIER = Object.fromEntries(
  Object.values(OPINION_MODIFIERS).filter(m => m.treatyId).map(m => [m.treatyId, m.id]),
);

export class DiplomacySystem {
  constructor() {
    this._tickAccum = 0;
    // Transient tracker zalegania (vesselId → {systemId, year}); NIE serializowany.
    this._trespassTracking = new Map();

    this.relations  = new RelationsModel();
    this.reputation = new ReputationLedger();

    EventBus.on('colony:founded',  ({ colony }) => this._onColonyFounded(colony, 'colony'));
    EventBus.on('outpost:founded', ({ colony }) => this._onColonyFounded(colony, 'outpost'));
    EventBus.on('observatory:discovered', ({ body }) => this._onObservatoryScan(body));

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      // Modyfikatory starzeją się PRZED handlerami, które je dodają — świeży wpis
      // nie może zanikać w tym samym ticku, w którym powstał.
      this.relations.tickModifiers(steps);
      this.reputation.tick(steps);
      this._tickTruces();
      // Kolejność decay → ultimatum → zaleganie zachowana ze stanu sprzed D1.
      this._tickTensionDecay(steps);
      this._tickUltimatumExpiry();
      this._tickTrespassing();
    });

    // Nowe imperium → relacja peace/napięcie 0 + wpis reputacji.
    EventBus.on('empire:created', ({ empireId }) => {
      if (!empireId) return;
      this.relations.ensure(PLAYER, empireId);
      this.reputation.ensure(empireId);
    });

    // Pierwszy kontakt: zapewnij relację (opinia 0 = dawny neutralny trust 50).
    EventBus.on('intel:contactEstablished', ({ empireId }) => {
      if (empireId) this.relations.ensure(PLAYER, empireId);
    });

    EventBus.on('vessel:arrived', ({ vessel, mission }) => this._onVesselArrived(vessel, mission));
  }

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  // ── Odczyt: opinia ────────────────────────────────────────────────────────

  /** Opinia `ofId` o `aboutId` (−100..+100). Brak relacji → 0. */
  getOpinion(ofId, aboutId) { return this.relations.getOpinion(ofId, aboutId); }

  /** Opinia imperium O GRACZU — kierunek, który bramkuje akceptacje. */
  getOpinionOfPlayer(empireId) { return this.relations.getOpinion(empireId, PLAYER); }

  /** Rozbicie opinii do UI: [{ id, label, labelKey, value, yearsLeft, persistent }]. */
  getOpinionBreakdown(ofId, aboutId) {
    return this.relations.getBreakdown(ofId, aboutId)
      .map(e => ({ ...e, label: t(e.labelKey) }));
  }

  /**
   * Pasmo statusu relacji: hostile / neutral / friendly / ally.
   * Progi to lustro dawnych progów trustu (≤29 / ≥65) przesunięte o −50;
   * „sojusznik" nadal WYŁĄCZNIE z traktatu, nie z liczby (dawny BUG5).
   */
  getOpinionBand(empireId) {
    if (this.hasTreaty(empireId, 'alliance')) return 'ally';
    const op = this.getOpinionOfPlayer(empireId);
    if (op <= OPINION_HOSTILE_MAX)  return 'hostile';
    if (op >= OPINION_FRIENDLY_MIN) return 'friendly';
    return 'neutral';
  }

  /**
   * ── MOSTEK D2 — USUŃ razem z Acceptance Engine ──
   * Opinia wyrażona w skali dawnego trustu (0-100, 50 = neutralnie), żeby progi
   * akceptacji traktatów i bramka AI-envoy dawały PRZED i PO D1 ten sam wynik.
   * Dokładnie trzy wywołania: proposeTreaty, AlienCivSystem._maybeLaunchAIEnvoy,
   * DiplomacyOverlay (dostępność przycisków).
   */
  getTrustEquivalent(empireId) {
    return Math.max(0, Math.min(100, 50 + this.getOpinionOfPlayer(empireId)));
  }

  // ── Odczyt: napięcie / status / pamięć ────────────────────────────────────

  getTension(empireId) { return this.relations.getTension(PLAYER, empireId); }
  getStatus(empireId)  { return this.relations.getStatus(PLAYER, empireId); }

  /** Ile lat cyw. zostało rozejmu (0 = brak rozejmu / już wygasł). */
  getTruceYearsLeft(empireId) {
    const until = this.relations.getTruceUntilYear(PLAYER, empireId);
    if (until == null) return 0;
    return Math.max(0, until - this._year());
  }

  /** Ostatnie `limit` wpisów pamięci relacji (dowody dla casus belli i UI). */
  getMemory(empireId, limit = CB_MEMORY_WINDOW) {
    return this.relations.getMemory(PLAYER, empireId, limit);
  }

  getReputation(id) { return this.reputation.get(id); }

  // ── Odczyt: projekcje list (UI) ───────────────────────────────────────────

  /**
   * Relacje gracza jako PROJEKCJA — świadomie nie surowy rekord, żeby jego kształt
   * pozostał prywatny (audyt R9/R12) i żeby pary AI↔AI z D5 nie wyciekły tu przypadkiem.
   */
  listPlayerRelations() {
    return this.relations.listPairsWith(PLAYER).map((rel) => {
      const empireId = rel.a === PLAYER ? rel.b : rel.a;
      return {
        empireId,
        opinion:            this.relations.getOpinion(empireId, PLAYER),
        tension:            rel.tension ?? 0,
        status:             rel.status ?? 'peace',
        truceYearsLeft:     this.getTruceYearsLeft(empireId),
        treaties:           rel.treaties ?? [],
        memory:             rel.memory ?? [],
        ultimatumStartYear: rel.ultimatumStartYear ?? null,
      };
    });
  }

  /** Jak wyżej, ale tylko imperia o intelu ≥ rumor (ukrywa nieodkryte). */
  listVisiblePlayerRelations() {
    const intelSys = window.KOSMOS?.intelSystem;
    return this.listPlayerRelations()
      .filter(r => (intelSys ? intelSys.isAtLeast(r.empireId, 'rumor') : true));
  }

  // ── Mutacje: opinia ───────────────────────────────────────────────────────

  /**
   * Dodaje/odświeża modyfikator opinii. Braki uzupełnia katalog; tryb łączenia
   * (refresh / accumulate) też stamtąd. @returns {number} nowa opinia.
   */
  addOpinionModifier(ofId, aboutId, modId, opts = {}) {
    const opinion = this.relations.addModifier(ofId, aboutId, modId, opts);
    EventBus.emit('diplomacy:opinionChanged', {
      ofId, aboutId, modId, value: opts.value ?? OPINION_MODIFIERS[modId]?.defaultValue,
      opinion, reason: opts.source ?? '',
    });
    return opinion;
  }

  removeOpinionModifier(ofId, aboutId, modId) {
    const removed = this.relations.removeModifier(ofId, aboutId, modId);
    if (removed) {
      EventBus.emit('diplomacy:opinionChanged', {
        ofId, aboutId, modId, value: 0, opinion: this.relations.getOpinion(ofId, aboutId), reason: 'removed',
      });
    }
    return removed;
  }

  // ── Mutacje: napięcie + drabina eskalacji ────────────────────────────────

  /**
   * Port dawnego changeHostility 1:1 — te same progi, te same skutki, ta sama
   * kolejność (stan wojny ustawiany PRZED zrywaniem traktatów, żeby re-entrantne
   * changeTension z breakTreaty trafiło na idempotentny guard).
   */
  changeTension(empireId, delta, reason = '') {
    if (!delta) return;
    const oldT = this.getTension(empireId);
    const newT = Math.max(0, Math.min(100, oldT + delta));
    if (newT === oldT) return;
    this.relations.setTension(PLAYER, empireId, newT, `tension_${delta > 0 ? '+' : ''}${delta}_${reason}`);
    const status = this.getStatus(empireId);

    EventBus.emit('diplomacy:relationChanged', { empireId, tension: newT, status, delta, reason });

    // Eskalacja tylko przy WZROŚCIE napięcia.
    if (delta <= 0) return;
    if (crossedUp(oldT, newT, WARNING_THRESHOLD)) {
      EventBus.emit('diplomacy:warning', { empireId, tension: newT, reason });
      this.addMemory(empireId, 'warning_issued', { reason });
    }
    if (crossedUp(oldT, newT, ULTIMATUM_THRESHOLD) && status !== 'war') {
      this.relations.setUltimatumStart(PLAYER, empireId, this._year(), 'ultimatum_start');
      EventBus.emit('diplomacy:ultimatum', { empireId, tension: newT, graceYears: ULTIMATUM_GRACE_YEARS, reason });
      this.addMemory(empireId, 'ultimatum_issued', { reason });
    }
    if (crossedUp(oldT, newT, WAR_THRESHOLD) && status !== 'war') {
      this.declareWar(empireId, 'hostility_threshold');
    }
  }

  // ── Mutacje: pamięć ───────────────────────────────────────────────────────

  addMemory(empireId, type, payload = {}) {
    return this.relations.addMemory(PLAYER, empireId, type, payload);
  }

  // ── Mutacje: wojna i pokój ────────────────────────────────────────────────

  declareWar(empireId, reason = '') {
    if (this.getStatus(empireId) === 'war') return false;
    // Pakt o nieagresji blokuje wojnę z inicjatywy AI/auto (gracz może mimo to).
    if (reason !== 'player_action' && this.hasTreaty(empireId, 'non_aggression')) return false;

    // Stan wojny NAJPIERW — idempotentny guard dla re-entrantnego changeTension.
    this.relations.setStatus(PLAYER, empireId, 'war', {}, `war_declared_${reason}`);
    this.relations.setTension(PLAYER, empireId, Math.max(this.getTension(empireId), WAR_THRESHOLD), 'war_declared');
    this.relations.setUltimatumStart(PLAYER, empireId, null, 'war_declared');
    this.addMemory(empireId, 'war_declared', { reason });

    // Wojna zrywa WSZYSTKIE traktaty (każde zerwanie dokłada +15 napięcia).
    for (const tr of [...this.relations.getTreaties(PLAYER, empireId)]) this.breakTreaty(empireId, tr.id);

    // Dawniej: „wojna zeruje trust" (bezpowrotnie). Teraz trwały modyfikator, zdejmowany
    // przy pokoju — relacje mogą się odbudować, zamiast zostać na zawsze na zerze.
    this.addOpinionModifier(empireId, PLAYER, 'at_war', { source: `war_${reason}` });

    EventBus.emit('diplomacy:warDeclared', { empireId, reason });
    EventBus.emit('diplomacy:relationChanged', { empireId, tension: this.getTension(empireId), status: 'war', reason });
    return true;
  }

  offerPeace(empireId, reason = '') {
    if (this.getStatus(empireId) !== 'war') return false;
    const until = this._year() + TRUCE_YEARS;
    this.relations.setStatus(PLAYER, empireId, 'truce', { truceUntilYear: until }, `peace_${reason}`);
    this.relations.setTension(PLAYER, empireId, Math.min(this.getTension(empireId), TRUCE_TENSION_CAP), 'peace');
    // Koniec strzelaniny: at_war ustępuje miejsca śladowi po wojnie.
    this.removeOpinionModifier(empireId, PLAYER, 'at_war');
    this.addOpinionModifier(empireId, PLAYER, 'recent_war', { source: `peace_${reason}` });
    this.addMemory(empireId, 'peace_offered', { reason });
    EventBus.emit('diplomacy:peaceSigned', { empireId, reason });
    EventBus.emit('diplomacy:relationChanged', { empireId, tension: this.getTension(empireId), status: 'truce', reason });
    return true;
  }

  // ── Mutacje: traktaty ─────────────────────────────────────────────────────

  hasTreaty(empireId, treatyId) { return this.relations.hasTreaty(PLAYER, empireId, treatyId); }

  /** Hook handlu cross-empire — czy obowiązuje umowa handlowa. */
  hasTradeAgreement(empireId) { return this.hasTreaty(empireId, 'trade_agreement'); }

  signTreaty(empireId, treaty) {
    if (!this.relations.addTreaty(PLAYER, empireId, treaty)) return false;
    // Traktat ze sprzężonym modyfikatorem (umowa handlowa → trade_partner, narastający).
    const modId = TREATY_TO_MODIFIER[treaty.id];
    if (modId) this.addOpinionModifier(empireId, PLAYER, modId, { source: `treaty_${treaty.id}` });
    EventBus.emit('diplomacy:treatyOffered', { empireId, treaty });
    return true;
  }

  breakTreaty(empireId, treatyId) {
    if (!this.relations.removeTreaty(PLAYER, empireId, treatyId)) return false;
    // Modyfikator żyje tak długo jak traktat — razem z nim przepada narosła wartość.
    const modId = TREATY_TO_MODIFIER[treatyId];
    if (modId) this.removeOpinionModifier(empireId, PLAYER, modId);
    this.changeTension(empireId, +15, 'treaty_broken');
    return true;
  }

  /**
   * Gracz proponuje traktat. AI ocenia wg personality × opinii (przez mostek D2,
   * więc progi 60/75/80 wypadają tam, gdzie przed D1).
   */
  proposeTreaty(empireId, treatyId) {
    const def = TREATY_TYPES[treatyId];
    if (!def) return false;
    // Dawniej nieosiągalne (wojna zerowała trust, więc każdy próg padał). Przy modelu
    // modyfikatorów at_war −40 już tego nie gwarantuje → jawna bramka.
    if (this.getStatus(empireId) === 'war') {
      EventBus.emit('diplomacy:treatyRejected', { empireId, treatyId, reason: 'at_war' });
      return false;
    }
    if (this.hasTreaty(empireId, treatyId)) {
      EventBus.emit('diplomacy:treatyRejected', { empireId, treatyId, reason: 'already_signed' });
      return false;
    }
    const pers  = window.KOSMOS?.empireRegistry?.get(empireId)?.personality ?? {};
    const trust = this.getTrustEquivalent(empireId);
    let accept = false;
    if (treatyId === 'trade_agreement') {
      accept = (pers.trade ?? 0) >= 0.5 && trust >= 60;
    } else if (treatyId === 'non_aggression') {
      accept = (pers.aggression ?? 1) <= 0.4 && trust >= 75;
    } else if (treatyId === 'alliance') {
      accept = (pers.aggression ?? 1) <= 0.3 && trust >= 80;
    }
    if (accept) {
      this.signTreaty(empireId, { id: treatyId });
      EventBus.emit('diplomacy:treatyAccepted', { empireId, treatyId });
      return true;
    }
    EventBus.emit('diplomacy:treatyRejected', { empireId, treatyId, reason: 'declined' });
    return false;
  }

  // ── Automatyczne handlery ─────────────────────────────────────────────────

  _onColonyFounded(colony, kind) {
    if (!colony?.planetId) return;
    const body = EntityManager.get(colony.planetId);
    if (!body?.systemId) return;
    const empireId = window.KOSMOS?.galaxyData?.systems?.find(s => s.id === body.systemId)?.empireId;
    if (!empireId) return;
    this.changeTension(empireId, +30, `player_${kind}_in_their_space`);
    this.addMemory(empireId, 'territorial_violation', { planetId: colony.planetId, systemId: body.systemId, kind });
  }

  _onObservatoryScan(body) {
    if (!body?.systemId) return;
    const empireId = window.KOSMOS?.galaxyData?.systems?.find(s => s.id === body.systemId)?.empireId;
    if (!empireId) return;
    // +10 tylko raz na imperium — inaczej każdy kolejny skanowany obiekt nabijałby napięcie.
    const seen = this.relations.getMemory(PLAYER, empireId, Infinity).some(i => i.type === 'surveillance_scan');
    if (seen) return;
    this.changeTension(empireId, +10, 'observatory_scan');
    this.addMemory(empireId, 'surveillance_scan', { systemId: body.systemId });
  }

  /** Statek gracza wszedł do układu obcego imperium → modyfikator opinii wg typu. */
  _onVesselArrived(vessel, mission) {
    if (!GAME_CONFIG.FEATURES?.lightDiplomacy) return;
    if (!vessel) return;
    const isPlayer = (vessel.ownerEmpireId == null || vessel.ownerEmpireId === PLAYER);
    if (!isPlayer) return;
    const empireId = this._resolveArrivalEmpire(vessel, mission);
    if (!empireId) return;

    // Emisariusz obsłużony przez misję (abstrakcyjną) — bez kary tutaj.
    if (canDoEnvoy(vessel)) return;

    if (hasWeapons(vessel)) {
      this.addOpinionModifier(empireId, PLAYER, 'military_presence', { source: `vessel_${vessel.id}` });
      this.addMemory(empireId, 'military_presence', { vesselId: vessel.id });
    } else if (canDoScience(vessel)) {
      this.addOpinionModifier(empireId, PLAYER, 'research_intrusion', { source: `vessel_${vessel.id}` });
      this.addMemory(empireId, 'research_intrusion', { vesselId: vessel.id });
      const sysId = this._resolveArrivalSystemId(vessel, mission);
      if (sysId) this._trespassTracking.set(vessel.id, { systemId: sysId, year: this._year() });
    }
    // cargo / inne → bez kary
  }

  _resolveArrivalSystemId(vessel, mission) {
    if (vessel?.systemId) return vessel.systemId;
    const targetId = mission?.targetId;
    if (targetId) {
      const body = EntityManager.get(targetId);
      if (body?.systemId) return body.systemId;
    }
    return null;
  }

  _resolveArrivalEmpire(vessel, mission) {
    const sysId = this._resolveArrivalSystemId(vessel, mission);
    if (!sysId) return null;
    return window.KOSMOS?.galaxyData?.systems?.find(s => s.id === sysId)?.empireId ?? null;
  }

  _tickTrespassing() {
    if (!GAME_CONFIG.FEATURES?.lightDiplomacy) return;
    if (this._trespassTracking.size === 0) return;
    const vMgr = window.KOSMOS?.vesselManager;
    const currentYear = this._year();
    for (const [vesselId, entry] of [...this._trespassTracking]) {
      const vessel = vMgr?.getVessel?.(vesselId);
      if (!vessel || vessel.isWreck ||
          (vessel.systemId ?? 'sys_home') !== entry.systemId ||
          vessel.position?.state !== 'orbiting') {
        this._trespassTracking.delete(vesselId);
        continue;
      }
      if ((currentYear - entry.year) >= TRESPASS_YEARS && canDoScience(vessel)) {
        const empireId = window.KOSMOS?.galaxyData?.systems?.find(s => s.id === entry.systemId)?.empireId;
        if (empireId) {
          this.addOpinionModifier(empireId, PLAYER, 'trespassing', { source: `vessel_${vesselId}` });
          this.addMemory(empireId, 'trespassing', { vesselId });
        }
        entry.year = currentYear;   // nalicz raz na okres
      }
    }
  }

  // ── Tickery ───────────────────────────────────────────────────────────────

  /**
   * Wygasłe rozejmy → pokój. Naprawa audytu R7: dotąd 'truce' był stanem
   * TERMINALNYM, więc decay napięcia zamierał na zawsze po pierwszej wojnie.
   */
  _tickTruces() {
    for (const { a, b } of this.relations.tickTruces(this._year())) {
      const empireId = a === PLAYER ? b : a;
      this.relations.setStatus(PLAYER, empireId, 'peace', {}, 'truce_expired');
      // Ślad po wojnie — zwykle dołożony już przy offerPeace; „if absent" łapie
      // rozejmy ze starych zapisów, które nigdy przez tamtą ścieżkę nie przeszły.
      if (!this.relations.hasModifier(empireId, PLAYER, 'recent_war')) {
        this.addOpinionModifier(empireId, PLAYER, 'recent_war', { source: 'truce_expired' });
      }
      EventBus.emit('diplomacy:relationChanged', {
        empireId, tension: this.getTension(empireId), status: 'peace', delta: 0, reason: 'truce_expired',
      });
    }
  }

  _tickTensionDecay(years) {
    const currentYear = this._year();
    for (const rel of this.relations.listPairsWith(PLAYER)) {
      if (rel.status !== 'peace') continue;
      const lastMemoryYear = (rel.memory ?? []).at(-1)?.year ?? null;
      if (lastMemoryYear != null && (currentYear - lastMemoryYear) < PEACE_QUIET_YEARS) continue;
      if ((rel.tension ?? 0) <= 0) continue;
      const empireId = rel.a === PLAYER ? rel.b : rel.a;
      this.changeTension(empireId, -PEACE_DECAY * years, 'peace_decay');
    }
  }

  _tickUltimatumExpiry() {
    const currentYear = this._year();
    for (const rel of this.relations.listPairsWith(PLAYER)) {
      if (rel.status === 'war') continue;
      if (rel.ultimatumStartYear == null) continue;
      if (currentYear - rel.ultimatumStartYear < ULTIMATUM_GRACE_YEARS) continue;
      const empireId = rel.a === PLAYER ? rel.b : rel.a;
      if ((rel.tension ?? 0) >= ULTIMATUM_THRESHOLD && !this.hasTreaty(empireId, 'non_aggression')) {
        this.declareWar(empireId, 'ultimatum_expired');
      } else {
        // Napięcie spadło LUB chroni pakt o nieagresji → anuluj ultimatum.
        this.relations.setUltimatumStart(PLAYER, empireId, null, 'ultimatum_expired_cooled');
      }
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  /** Dopasuj relacje i reputację do istniejących imperiów (po restore lub spawnie). */
  initForAllEmpires() {
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return;
    const ids = reg.listAll().map(e => e.id);
    for (const id of ids) this.relations.ensure(PLAYER, id);
    // ⚠ Konieczne: GameState.restore() merguje tylko klucze najwyższego poziomu,
    // więc zapis sprzed istnienia pod-klucza `reputation` wraca bez niego.
    this.reputation.initForIds(ids);
  }
}
