// DiplomacySystem — relacje gracz ↔ obce imperia (Faza 3)
//
// Domena: gameState.diplomacy.relations[key] = {
//   state, hostility 0-100, trust 0-100, treaties[], lastIncidents[],
//   lastChangeYear, ultimatumStartYear
// }
//
// Klucz pary: 'player_{empireId}' (Faza 3 — tylko gracz vs imperium).
// Inter-empire relacje (emp_A_emp_B) przyjdą w Fazie 7 z faktycznym AI.
//
// Stany: peace / truce / war / alliance (treaty-driven).
// Hostility: 0 spokój, 100 pełna wrogość — progi:
//   40  → ostrzeżenie (event diplomacy:warning)
//   60  → ultimatum (event diplomacy:ultimatum — 3 lata gry gracz ma zareagować)
//   80+ → auto war (event diplomacy:warDeclared + state='war')
//
// Intent methods (WYŁĄCZNE mutacje diplomacy.relations):
//   changeHostility(empireId, delta, reason)
//   declareWar(empireId, reason)
//   offerPeace(empireId, reason)
//   signTreaty(empireId, treaty)
//   breakTreaty(empireId, treatyId)
//   addIncident(empireId, type, data)
//
// Automatyczne reguły (handlery EventBus):
//   colony:founded / outpost:founded → jeśli w systemie imperium → +30 hostility
//   observatory:discovered w systemie imperium → +10 hostility
//   Tick co 1 civYear: peace bez incydentu w ostatnim roku → -5 hostility

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import gameState from '../core/GameState.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { hasWeapons, canDoScience, canDoEnvoy } from '../entities/Vessel.js';
import { TREATY_TYPES } from '../data/TreatyData.js';

// Progi hostility
const WARNING_THRESHOLD  = 40;
const ULTIMATUM_THRESHOLD = 60;
const WAR_THRESHOLD       = 80;

// Decay podczas pokoju (na civYear)
const PEACE_DECAY = 5.0;
// Ile civYears cichych wymaganych do decay
const PEACE_QUIET_YEARS = 2.0;

// Czas trwania ultimatum (civYears gracza)
const ULTIMATUM_GRACE_YEARS = 3.0;

const INCIDENT_MAX = 10;

// ── S3.4 Light Diplomacy — oś trust (0-100, 50=neutral) ──────────────────
// Display gracza: (trust-50)/5 → −10..+10. Hostility/wojna BEZ zmian.
const TRUST_NEUTRAL      = 50;
// Progi statusu (display + bramki UI/AI/traktatów)
const TRUST_HOSTILE_MAX  = 29;   // 0-29   → wrogi
const TRUST_FRIENDLY_MIN = 65;   // 65-79  → przyjazny
const TRUST_ALLY_MIN     = 80;   // 80-100 → sojusznik
// Zmiany trust z misji emisariuszy (Stage 3)
const ENVOY_TRUST_ARRIVAL = 5;   // +5 w połowie misji (arrival @1.5y)
const ENVOY_TRUST_RETURN  = 5;   // +5 po powrocie (return @3.0y) → +10/misję
// Kary za obecność w przestrzeni obcych (Stage 4)
const MILITARY_PRESENCE_PENALTY  = -5;
const RESEARCH_INTRUSION_PENALTY = -3;
const TRESPASS_PENALTY           = -5;
const TRESPASS_YEARS             = 1.0;  // civYears w systemie obcego do naliczenia kary
// Roczny przyrost trust z aktywnych traktatów (Stage 5)
const TRADE_AGREEMENT_TRUST_YEAR = 2;
const PACT_TRUST_YEAR            = 1;

export class DiplomacySystem {
  constructor() {
    this._tickAccum = 0;
    // S3.4 — transient tracker trespassingu (vesselId → {systemId, year}); NIE serializowany.
    this._trespassTracking = new Map();

    // Automatyczne reguły — przez EventBus
    EventBus.on('colony:founded',  ({ colony }) => this._onColonyFounded(colony, 'colony'));
    EventBus.on('outpost:founded', ({ colony }) => this._onColonyFounded(colony, 'outpost'));
    EventBus.on('observatory:discovered', ({ body }) => this._onObservatoryScan(body));

    // Tick decay
    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      this._tickDecay(steps);
      this._tickUltimatumExpiry(steps);
      this._tickTrespassing();      // S3.4 — kara za zaleganie w przestrzeni obcych
      this._tickTreaties(steps);    // S3.4 — przyrost trust z aktywnych traktatów
    });

    // Gdy powstaje nowe imperium → dopisz relację peace/hostility=0
    EventBus.on('empire:created', ({ empireId }) => {
      if (!this.getRelation(empireId)) this._initRelation(empireId);
    });

    // S3.4 — pierwszy kontakt: zapewnij relację (trust już 50 z _initRelation;
    // NIE resetuj — wyzerowałoby ewentualną karę z równoczesnego vessel:arrived).
    EventBus.on('intel:contactEstablished', ({ empireId }) => {
      if (empireId) this._ensureRelation(empireId);
    });

    // S3.4 — triggery relacji: gracz w przestrzeni obcego imperium → kara trust.
    EventBus.on('vessel:arrived', ({ vessel, mission }) => this._onVesselArrived(vessel, mission));
  }

  // ── Read-only ─────────────────────────────────────────────────

  /** Klucz relacji gracz ↔ imperium */
  _key(empireId) { return `player_${empireId}`; }

  getRelation(empireId) {
    return gameState.get(`diplomacy.relations.${this._key(empireId)}`) ?? null;
  }

  getHostility(empireId) { return this.getRelation(empireId)?.hostility ?? 0; }
  getState(empireId)     { return this.getRelation(empireId)?.state ?? 'peace'; }

  // ── S3.4 trust (read-only) ───────────────────────────────────────────
  getTrust(empireId)     { return this.getRelation(empireId)?.trust ?? TRUST_NEUTRAL; }

  /** Status trust dla UI/AI/bramek traktatów: hostile/neutral/friendly/ally. */
  getTrustStatus(empireId) {
    if (this.hasTreaty(empireId, 'alliance')) return 'ally';   // BUG5 — ally tylko traktatem
    const tr = this.getTrust(empireId);
    if (tr <= TRUST_HOSTILE_MAX)  return 'hostile';
    if (tr >= TRUST_FRIENDLY_MIN) return 'friendly';           // 65+ = friendly (max bez sojuszu)
    return 'neutral';
  }

  listAll() {
    const rels = gameState.get('diplomacy.relations') ?? {};
    return Object.entries(rels).map(([key, rel]) => ({ key, ...rel }));
  }

  /** Lista relacji tylko z imperiami o intel >= rumor (ukrywa unknown). */
  listVisible() {
    const intelSys = window.KOSMOS?.intelSystem;
    return this.listAll().filter(r => {
      const empireId = r.empireId;
      if (!empireId) return false;
      return intelSys ? intelSys.isAtLeast(empireId, 'rumor') : true;
    });
  }

  // ── Intent methods ───────────────────────────────────────────

  changeHostility(empireId, delta, reason = '') {
    if (!delta) return;
    const rel = this._ensureRelation(empireId);
    const oldH = rel.hostility;
    const newH = Math.max(0, Math.min(100, oldH + delta));
    if (newH === oldH) return;

    const next = {
      ...rel,
      hostility: newH,
      lastChangeYear: this._year(),
    };
    this._setRelation(empireId, next, `hostility_${delta > 0 ? '+' : ''}${delta}_${reason}`);

    EventBus.emit('diplomacy:relationChanged', {
      empireId, hostility: newH, state: next.state, delta, reason,
    });

    // Progi eskalacji — tylko przy wzroście hostility
    if (delta > 0) {
      if (oldH < WARNING_THRESHOLD && newH >= WARNING_THRESHOLD) {
        EventBus.emit('diplomacy:warning', { empireId, hostility: newH, reason });
        this.addIncident(empireId, 'warning_issued', { reason });
      }
      if (oldH < ULTIMATUM_THRESHOLD && newH >= ULTIMATUM_THRESHOLD && next.state !== 'war') {
        const ultNext = { ...next, ultimatumStartYear: this._year() };
        this._setRelation(empireId, ultNext, 'ultimatum_start');
        EventBus.emit('diplomacy:ultimatum', { empireId, hostility: newH, graceYears: ULTIMATUM_GRACE_YEARS, reason });
        this.addIncident(empireId, 'ultimatum_issued', { reason });
      }
      if (oldH < WAR_THRESHOLD && newH >= WAR_THRESHOLD && next.state !== 'war') {
        this.declareWar(empireId, 'hostility_threshold');
      }
    }
  }

  /**
   * S3.4 — zmień trust (0-100). Mirror changeHostility, ale BEZ progów
   * eskalacji i BEZ decay. Emituje diplomacy:trustChanged.
   */
  changeTrust(empireId, delta, reason = '') {
    if (!delta) return;
    const rel = this._ensureRelation(empireId);
    const oldT = rel.trust ?? TRUST_NEUTRAL;
    const newT = Math.max(0, Math.min(100, oldT + delta));
    if (newT === oldT) return;
    const next = { ...rel, trust: newT, lastChangeYear: this._year() };
    this._setRelation(empireId, next, `trust_${delta > 0 ? '+' : ''}${delta}_${reason}`);
    EventBus.emit('diplomacy:trustChanged', { empireId, trust: newT, delta, reason });
  }

  declareWar(empireId, reason = '') {
    const rel = this._ensureRelation(empireId);
    if (rel.state === 'war') return false;
    // S3.4 — pakt o nieagresji blokuje wojnę z inicjatywy AI/auto (gracz może mimo to).
    if (reason !== 'player_action' && this.hasTreaty(empireId, 'non_aggression')) return false;
    // BUG4 — ustaw stan wojny NAJPIERW (idempotentny guard dla re-entrant changeHostility).
    const warRel = {
      ...rel,
      state: 'war',
      hostility: Math.max(rel.hostility, WAR_THRESHOLD),
      lastChangeYear: this._year(),
      warStartYear: this._year(),
      ultimatumStartYear: null,
    };
    this._setRelation(empireId, warRel, `war_declared_${reason}`);
    this.addIncident(empireId, 'war_declared', { reason });
    // BUG4 — wojna zrywa WSZYSTKIE traktaty + duży spadek trust.
    for (const tr of [...(warRel.treaties ?? [])]) this.breakTreaty(empireId, tr.id);
    // BUG A — wojna zeruje trust (driveto 0), niezależnie od wartości startowej.
    const currentTrust = this.getTrust(empireId);
    this.changeTrust(empireId, -currentTrust, 'war_declared');
    EventBus.emit('diplomacy:warDeclared', { empireId, reason });
    EventBus.emit('diplomacy:relationChanged', { empireId, hostility: this.getHostility(empireId), state: 'war', reason });
    return true;
  }

  offerPeace(empireId, reason = '') {
    const rel = this._ensureRelation(empireId);
    if (rel.state !== 'war') return false;
    const next = {
      ...rel,
      state: 'truce',
      hostility: Math.min(rel.hostility, 30), // pokój przynosi oddech
      lastChangeYear: this._year(),
      warStartYear: null,
    };
    this._setRelation(empireId, next, `peace_${reason}`);
    this.addIncident(empireId, 'peace_offered', { reason });
    EventBus.emit('diplomacy:peaceSigned', { empireId, reason });
    EventBus.emit('diplomacy:relationChanged', { empireId, hostility: next.hostility, state: 'truce', reason });
    return true;
  }

  signTreaty(empireId, treaty) {
    if (!treaty?.id) return false;
    const rel = this._ensureRelation(empireId);
    if ((rel.treaties ?? []).some(t => t.id === treaty.id)) return false;
    const next = {
      ...rel,
      treaties: [...(rel.treaties ?? []), { ...treaty, signedYear: this._year() }],
      lastChangeYear: this._year(),
    };
    this._setRelation(empireId, next, `treaty_${treaty.id}`);
    EventBus.emit('diplomacy:treatyOffered', { empireId, treaty });
    return true;
  }

  breakTreaty(empireId, treatyId) {
    const rel = this._ensureRelation(empireId);
    const existing = (rel.treaties ?? []).some(t => t.id === treatyId);
    if (!existing) return false;
    const next = {
      ...rel,
      treaties: (rel.treaties ?? []).filter(t => t.id !== treatyId),
      lastChangeYear: this._year(),
    };
    this._setRelation(empireId, next, `treaty_broken_${treatyId}`);
    // Zerwanie traktatu = -20 trust, +15 hostility
    this.changeHostility(empireId, +15, 'treaty_broken');
    return true;
  }

  addIncident(empireId, type, data = {}) {
    const rel = this._ensureRelation(empireId);
    const incidents = [...(rel.lastIncidents ?? []), { year: this._year(), type, data }];
    while (incidents.length > INCIDENT_MAX) incidents.shift();
    const next = { ...rel, lastIncidents: incidents };
    this._setRelation(empireId, next, `incident_${type}`);
  }

  // ── S3.4 — Traktaty (efekty + heurystyka akceptacji AI) ──────────────────

  /** Czy relacja ma aktywny traktat danego typu. */
  hasTreaty(empireId, treatyId) {
    return (this.getRelation(empireId)?.treaties ?? []).some(tr => tr.id === treatyId);
  }

  /** Hook dla S3.5 — czy obowiązuje umowa handlowa z imperium. */
  hasTradeAgreement(empireId) {
    return this.hasTreaty(empireId, 'trade_agreement');
  }

  /**
   * Gracz proponuje traktat. AI ocenia wg personality × trust. Zwraca true gdy
   * zaakceptowano. Emituje diplomacy:treatyAccepted | diplomacy:treatyRejected.
   */
  proposeTreaty(empireId, treatyId) {
    const def = TREATY_TYPES[treatyId];
    if (!def) return false;
    if (this.hasTreaty(empireId, treatyId)) {
      EventBus.emit('diplomacy:treatyRejected', { empireId, treatyId, reason: 'already_signed' });
      return false;
    }
    const pers  = window.KOSMOS?.empireRegistry?.get(empireId)?.personality ?? {};
    const trust = this.getTrust(empireId);
    let accept = false;
    if (treatyId === 'trade_agreement') {
      accept = (pers.trade ?? 0) >= 0.5 && trust >= 60;
    } else if (treatyId === 'non_aggression') {
      accept = (pers.aggression ?? 1) <= 0.4 && trust >= 75;
    } else if (treatyId === 'alliance') {
      accept = (pers.aggression ?? 1) <= 0.3 && trust >= 80;   // BUG5d
    }
    if (accept) {
      this.signTreaty(empireId, { id: treatyId });
      EventBus.emit('diplomacy:treatyAccepted', { empireId, treatyId });
      return true;
    }
    EventBus.emit('diplomacy:treatyRejected', { empireId, treatyId, reason: 'declined' });
    return false;
  }

  /** Roczny przyrost trust z aktywnych traktatów (skip relacji w stanie wojny). */
  _tickTreaties(years) {
    if (!GAME_CONFIG.FEATURES?.lightDiplomacy) return;
    for (const rel of this.listAll()) {
      if (rel.state === 'war') continue;
      const treaties = rel.treaties ?? [];
      if (treaties.length === 0) continue;
      for (const tr of treaties) {
        const def = TREATY_TYPES[tr.id];
        if (!def?.yearlyTrust) continue;
        this.changeTrust(rel.empireId, def.yearlyTrust * years, 'treaty_active');
      }
    }
  }

  // ── Automatyczne handlery ────────────────────────────────────

  _onColonyFounded(colony, kind) {
    if (!colony) return;
    const planetId = colony.planetId;
    if (!planetId) return;
    const body = EntityManager.get(planetId);
    if (!body?.systemId) return;
    // Sprawdź czy system jest we władaniu jakiegoś imperium
    const galaxy = window.KOSMOS?.galaxyData;
    const gs = galaxy?.systems?.find(s => s.id === body.systemId);
    const empireId = gs?.empireId;
    if (!empireId) return;

    this.changeHostility(empireId, +30, `player_${kind}_in_their_space`);
    this.addIncident(empireId, 'territorial_violation', { planetId, systemId: body.systemId, kind });
  }

  _onObservatoryScan(body) {
    if (!body?.systemId) return;
    const galaxy = window.KOSMOS?.galaxyData;
    const gs = galaxy?.systems?.find(s => s.id === body.systemId);
    const empireId = gs?.empireId;
    if (!empireId) return;
    // +10 tylko raz na imperium — żeby nie nabijać za każdy kolejny skanowany obiekt
    const rel = this.getRelation(empireId);
    const hasScanIncident = (rel?.lastIncidents ?? []).some(i => i.type === 'surveillance_scan');
    if (hasScanIncident) return;
    this.changeHostility(empireId, +10, 'observatory_scan');
    this.addIncident(empireId, 'surveillance_scan', { systemId: body.systemId });
  }

  // ── S3.4 — triggery relacji (vessel:arrived) + trespassing ───────────────

  /**
   * Gracz wszedł statkiem do systemu obcego imperium → kara trust wg typu statku.
   * Payload vessel:arrived = { vessel, mission } (NIE {vesselId, systemId}).
   */
  _onVesselArrived(vessel, mission) {
    if (!GAME_CONFIG.FEATURES?.lightDiplomacy) return;
    if (!vessel) return;
    // tylko statki gracza
    const isPlayer = (vessel.ownerEmpireId == null || vessel.ownerEmpireId === 'player');
    if (!isPlayer) return;
    const empireId = this._resolveArrivalEmpire(vessel, mission);
    if (!empireId) return;

    // Emisariusz obsłużony przez misję (abstrakcyjny) — bez kary tutaj.
    if (canDoEnvoy(vessel)) return;

    if (hasWeapons(vessel)) {
      this.changeTrust(empireId, MILITARY_PRESENCE_PENALTY, 'military_presence');
      this.addIncident(empireId, 'military_presence', { vesselId: vessel.id });
    } else if (canDoScience(vessel)) {
      this.changeTrust(empireId, RESEARCH_INTRUSION_PENALTY, 'research_intrusion');
      this.addIncident(empireId, 'research_intrusion', { vesselId: vessel.id });
      // śledź do naliczenia trespassing po TRESPASS_YEARS
      const sysId = this._resolveArrivalSystemId(vessel, mission);
      if (sysId) this._trespassTracking.set(vessel.id, { systemId: sysId, year: this._year() });
    }
    // cargo / inne → bez kary
  }

  /** System, do którego dotarł statek (vessel.systemId lub systemId ciała z misji). */
  _resolveArrivalSystemId(vessel, mission) {
    if (vessel?.systemId) return vessel.systemId;
    const targetId = mission?.targetId;
    if (targetId) {
      const body = EntityManager.get(targetId);
      if (body?.systemId) return body.systemId;
    }
    return null;
  }

  /** Imperium-właściciel systemu, do którego dotarł statek (lub null). */
  _resolveArrivalEmpire(vessel, mission) {
    const sysId = this._resolveArrivalSystemId(vessel, mission);
    if (!sysId) return null;
    const galaxy = window.KOSMOS?.galaxyData;
    return galaxy?.systems?.find(s => s.id === sysId)?.empireId ?? null;
  }

  /** Naliczanie trespassing: statek badawczy > TRESPASS_YEARS w systemie obcego. */
  _tickTrespassing() {
    if (!GAME_CONFIG.FEATURES?.lightDiplomacy) return;
    if (this._trespassTracking.size === 0) return;
    const vMgr = window.KOSMOS?.vesselManager;
    const currentYear = this._year();
    for (const [vesselId, entry] of [...this._trespassTracking]) {
      const vessel = vMgr?.getVessel?.(vesselId);
      // statek zniknął / opuścił system / nie orbituje → przestań śledzić
      if (!vessel || vessel.isWreck ||
          (vessel.systemId ?? 'sys_home') !== entry.systemId ||
          vessel.position?.state !== 'orbiting') {
        this._trespassTracking.delete(vesselId);
        continue;
      }
      if ((currentYear - entry.year) >= TRESPASS_YEARS && canDoScience(vessel)) {
        const empireId = window.KOSMOS?.galaxyData?.systems?.find(s => s.id === entry.systemId)?.empireId;
        if (empireId) {
          this.changeTrust(empireId, TRESPASS_PENALTY, 'trespassing');
          this.addIncident(empireId, 'trespassing', { vesselId });
        }
        entry.year = currentYear;   // nalicz raz na okres
      }
    }
  }

  // ── Tickery ──────────────────────────────────────────────────

  _tickDecay(years) {
    const currentYear = this._year();
    for (const rel of this.listAll()) {
      if (rel.state !== 'peace') continue;
      const lastIncident = (rel.lastIncidents ?? []).at(-1)?.year ?? null;
      if (lastIncident != null && (currentYear - lastIncident) < PEACE_QUIET_YEARS) continue;
      if ((rel.hostility ?? 0) <= 0) continue;
      this.changeHostility(rel.empireId, -PEACE_DECAY * years, 'peace_decay');
    }
  }

  _tickUltimatumExpiry(years) {
    const currentYear = this._year();
    for (const rel of this.listAll()) {
      if (rel.state === 'war') continue;
      if (rel.ultimatumStartYear == null) continue;
      if (currentYear - rel.ultimatumStartYear < ULTIMATUM_GRACE_YEARS) continue;
      // Czas ultimatum upłynął → auto war jeśli hostility nadal >= ULTIMATUM_THRESHOLD
      if ((rel.hostility ?? 0) >= ULTIMATUM_THRESHOLD && !this.hasTreaty(rel.empireId, 'non_aggression')) {
        this.declareWar(rel.empireId, 'ultimatum_expired');
      } else {
        // hostility spadło LUB pakt o nieagresji → anuluj ultimatum
        const next = { ...rel, ultimatumStartYear: null };
        this._setRelation(rel.empireId, next, 'ultimatum_expired_cooled');
      }
    }
  }

  // ── Pomocnicze ───────────────────────────────────────────────

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  _initRelation(empireId) {
    const rel = {
      empireId,
      state:              'peace',
      hostility:          0,
      trust:              50,
      treaties:           [],
      lastIncidents:      [],
      lastChangeYear:     this._year(),
      ultimatumStartYear: null,
      warStartYear:       null,
    };
    this._setRelation(empireId, rel, 'relation_init');
    return rel;
  }

  _ensureRelation(empireId) {
    return this.getRelation(empireId) ?? this._initRelation(empireId);
  }

  _setRelation(empireId, rel, reason) {
    gameState.set(`diplomacy.relations.${this._key(empireId)}`, rel, reason);
  }

  /** Dopasuj relacje do istniejących imperiów (po restore lub spawn). */
  initForAllEmpires() {
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return;
    for (const emp of reg.listAll()) {
      if (!this.getRelation(emp.id)) this._initRelation(emp.id);
    }
  }
}
