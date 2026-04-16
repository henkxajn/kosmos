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

export class DiplomacySystem {
  constructor() {
    this._tickAccum = 0;

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
    });

    // Gdy powstaje nowe imperium → dopisz relację peace/hostility=0
    EventBus.on('empire:created', ({ empireId }) => {
      if (!this.getRelation(empireId)) this._initRelation(empireId);
    });
  }

  // ── Read-only ─────────────────────────────────────────────────

  /** Klucz relacji gracz ↔ imperium */
  _key(empireId) { return `player_${empireId}`; }

  getRelation(empireId) {
    return gameState.get(`diplomacy.relations.${this._key(empireId)}`) ?? null;
  }

  getHostility(empireId) { return this.getRelation(empireId)?.hostility ?? 0; }
  getState(empireId)     { return this.getRelation(empireId)?.state ?? 'peace'; }

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

  declareWar(empireId, reason = '') {
    const rel = this._ensureRelation(empireId);
    if (rel.state === 'war') return false;
    const next = {
      ...rel,
      state: 'war',
      hostility: Math.max(rel.hostility, WAR_THRESHOLD),
      lastChangeYear: this._year(),
      warStartYear: this._year(),
      ultimatumStartYear: null,
    };
    this._setRelation(empireId, next, `war_declared_${reason}`);
    this.addIncident(empireId, 'war_declared', { reason });
    EventBus.emit('diplomacy:warDeclared', { empireId, reason });
    EventBus.emit('diplomacy:relationChanged', { empireId, hostility: next.hostility, state: 'war', reason });
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
      if ((rel.hostility ?? 0) >= ULTIMATUM_THRESHOLD) {
        this.declareWar(rel.empireId, 'ultimatum_expired');
      } else {
        // hostility spadło → anuluj ultimatum
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
