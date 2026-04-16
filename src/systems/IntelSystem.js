// IntelSystem — poziomy wiedzy o obcych imperiach (mgła wojny)
//
// Domena `gameState.intel[empireId]` — per imperium. Poziomy:
//   unknown  — gracz o nim nie słyszał; marker na GalaxyMap ukryty
//   rumor    — słuchy (obserwatorium, sąsiedztwo) — pierścień szary, nazwa "???"
//   contact  — ktoś dotarł statkiem; kolor archetypu + nazwa
//   detailed — skan wojska/tech (away team, groundUnit:surveyComplete)
//
// Intent methods (wszystkie mutacje idą przez tę klasę):
//   advanceIntel(empireId, toLevel, reason)
//   addKnownTech(empireId, techId, reason)
//   recordColony(empireId, systemId, reason)
//   reportIncident(empireId, type, data)
//
// Auto-wykrywanie (subskrypcje EventBus):
//   vessel:arrived     → statek dotarł do ciała w systemie imperium → contact
//   observatory:discovered → skan ciała w systemie imperium → rumor
//   groundUnit:surveyComplete / anomalyFound → detailed (gdy unit na planecie obcej)
//
// Pasywny ticker: obserwatorium kolonii macierzystej emituje "nasłuch" —
// imperia w promieniu PASSIVE_RUMOR_LY podnoszą intel z unknown → rumor
// po PASSIVE_RUMOR_YEARS latach gry.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import gameState from '../core/GameState.js';

const LEVELS = ['unknown', 'rumor', 'contact', 'detailed'];
const LEVEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

const PASSIVE_RUMOR_LY     = 10.0;  // zasięg pasywnego "nasłuchu" w LY
const PASSIVE_RUMOR_YEARS  = 8.0;   // lata gry do ujawnienia rumoru
const INCIDENT_MAX         = 10;    // ile ostatnich incydentów trzymać per imperium

export class IntelSystem {
  constructor() {
    this._tickAccum = 0;
    this._rumorAccum = {}; // empireId → float (lata w zasięgu)

    // Auto-wykrywanie przez eventy
    EventBus.on('vessel:arrived', ({ vessel, mission }) => this._onVesselArrived(vessel, mission));
    EventBus.on('observatory:discovered', (ev) => this._onObservatoryDiscovered(ev));
    EventBus.on('groundUnit:surveyComplete', (ev) => this._onGroundSurvey(ev));
    EventBus.on('groundUnit:anomalyFound', (ev) => this._onGroundSurvey(ev));

    // Pasywny ticker (civDeltaYears — mechanika 4X)
    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      this._passiveTick(steps);
    });

    // Gdy powstaje nowe imperium → dopisz mu intel.level='unknown'
    EventBus.on('empire:created', ({ empireId }) => {
      if (!this.get(empireId)) this._initIntelRecord(empireId);
    });
    EventBus.on('empire:destroyed', ({ empireId }) => {
      // Zachowujemy zapis intel (historia) — tylko stop-aktualizujemy
      delete this._rumorAccum[empireId];
    });
  }

  // ── Read-only ────────────────────────────────────────────────

  get(empireId) { return gameState.get(`intel.${empireId}`) ?? null; }
  getLevel(empireId) { return this.get(empireId)?.level ?? 'unknown'; }
  isAtLeast(empireId, level) {
    return LEVEL_RANK[this.getLevel(empireId)] >= LEVEL_RANK[level];
  }
  listKnown() {
    // Zwróć tylko imperia o intel >= rumor (unknown = niepoznane)
    const intel = gameState.get('intel') ?? {};
    return Object.entries(intel)
      .filter(([, v]) => LEVEL_RANK[v?.level ?? 'unknown'] >= 1)
      .map(([empireId, v]) => ({ empireId, ...v }));
  }

  // ── Intent methods ───────────────────────────────────────────

  /**
   * Podnosi poziom intelu do `toLevel` (nie obniża). Idempotentne.
   */
  advanceIntel(empireId, toLevel, reason = '') {
    if (!LEVEL_RANK.hasOwnProperty(toLevel)) return false;
    const emp = window.KOSMOS?.empireRegistry?.get(empireId);
    if (!emp) return false;

    const rec = this._ensureIntelRecord(empireId);
    const oldRank = LEVEL_RANK[rec.level ?? 'unknown'];
    const newRank = LEVEL_RANK[toLevel];
    if (newRank <= oldRank) return false;

    const oldLevel = rec.level;
    const updated = { ...rec, level: toLevel };

    // Przy contact: od razu ujawnij 1 znany fakt (archetyp + liczba kolonii)
    if (newRank >= LEVEL_RANK.contact) {
      updated.knownColonies = [...(updated.knownColonies ?? [])];
      for (const c of emp.colonies ?? []) {
        if (!updated.knownColonies.includes(c.systemId)) updated.knownColonies.push(c.systemId);
      }
    }
    // Przy detailed: ujawnij przybliżoną siłę wojskową
    if (newRank >= LEVEL_RANK.detailed) {
      updated.knownMilitary = Math.round(emp.military?.power ?? 0);
    }

    gameState.set(`intel.${empireId}`, updated, reason);
    EventBus.emit('intel:levelChanged', { empireId, oldLevel, newLevel: toLevel, reason });

    if (newRank >= LEVEL_RANK.contact && oldRank < LEVEL_RANK.contact) {
      EventBus.emit('intel:contactEstablished', { empireId, via: reason });
    }
    return true;
  }

  /** Dopisz znaną technologię imperium (nie duplikuje). */
  addKnownTech(empireId, techId, reason = '') {
    const rec = this._ensureIntelRecord(empireId);
    if ((rec.knownTech ?? []).includes(techId)) return false;
    const next = { ...rec, knownTech: [...(rec.knownTech ?? []), techId] };
    gameState.set(`intel.${empireId}`, next, reason);
    EventBus.emit('intel:reportGenerated', { empireId, kind: 'tech', techId, reason });
    return true;
  }

  /** Zapisz, że widzieliśmy imperium w konkretnym układzie. */
  recordColony(empireId, systemId, reason = '') {
    const rec = this._ensureIntelRecord(empireId);
    if ((rec.knownColonies ?? []).includes(systemId)) return false;
    const next = { ...rec, knownColonies: [...(rec.knownColonies ?? []), systemId] };
    gameState.set(`intel.${empireId}`, next, reason);
    return true;
  }

  /** Dopisz incydent do historii (atak, skan, incident dyplomatyczny). */
  reportIncident(empireId, type, data = {}) {
    const rec = this._ensureIntelRecord(empireId);
    const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const incidents = [...(rec.lastIncidents ?? []), { year, type, data }];
    while (incidents.length > INCIDENT_MAX) incidents.shift();
    const next = { ...rec, lastIncidents: incidents };
    gameState.set(`intel.${empireId}`, next, `incident_${type}`);
    EventBus.emit('intel:reportGenerated', { empireId, kind: 'incident', type, data });
  }

  // ── Event handlers ───────────────────────────────────────────

  _onVesselArrived(vessel, mission) {
    const systemId = this._resolveSystemIdFromMission(vessel, mission);
    if (!systemId) return;
    const empireId = this._findEmpireOfSystem(systemId);
    if (!empireId) return;
    this.recordColony(empireId, systemId, 'vessel_arrived');
    this.advanceIntel(empireId, 'contact', `vessel_arrived:${mission?.targetId ?? systemId}`);
  }

  _onObservatoryDiscovered({ body }) {
    if (!body?.systemId) return;
    const empireId = this._findEmpireOfSystem(body.systemId);
    if (!empireId) return;
    this.recordColony(empireId, body.systemId, 'observatory_discovered');
    this.advanceIntel(empireId, 'rumor', `observatory:${body.id}`);
  }

  _onGroundSurvey({ planetId }) {
    if (!planetId) return;
    const body = EntityManager.get(planetId);
    if (!body?.systemId) return;
    const empireId = this._findEmpireOfSystem(body.systemId);
    if (!empireId) return;
    this.advanceIntel(empireId, 'detailed', `ground_survey:${planetId}`);
  }

  // ── Pasywny tick — obserwatorium nasłuchuje ─────────────────

  _passiveTick(yearsPassed) {
    // Obserwatorium macierzystej kolonii — posłuch pobliskich imperiów
    const homePlanet = window.KOSMOS?.homePlanet;
    if (!homePlanet) return;
    const homeSystemId = homePlanet.systemId ?? 'sys_home';

    const galaxy = window.KOSMOS?.galaxyData;
    if (!galaxy?.systems?.length) return;
    const homeGalSys = galaxy.systems.find(s => s.id === homeSystemId);
    if (!homeGalSys) return;

    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return;

    // Dla każdego imperium sprawdź czy JAKAKOLWIEK kolonia jest w zasięgu
    for (const emp of reg.listAll()) {
      if (this.isAtLeast(emp.id, 'rumor')) continue; // już odkryte
      const inRange = (emp.colonies ?? []).some(col => {
        const gs = galaxy.systems.find(s => s.id === col.systemId);
        if (!gs) return false;
        const dx = gs.x - homeGalSys.x, dy = gs.y - homeGalSys.y, dz = (gs.z ?? 0) - (homeGalSys.z ?? 0);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return d <= PASSIVE_RUMOR_LY;
      });
      if (!inRange) continue;

      this._rumorAccum[emp.id] = (this._rumorAccum[emp.id] ?? 0) + yearsPassed;
      if (this._rumorAccum[emp.id] >= PASSIVE_RUMOR_YEARS) {
        this.advanceIntel(emp.id, 'rumor', 'passive_listening');
      }
    }
  }

  // ── Wewnętrzne ───────────────────────────────────────────────

  _initIntelRecord(empireId) {
    const rec = {
      level:          'unknown',
      knownTech:      [],
      knownMilitary:  null,
      knownColonies:  [],
      lastIncidents:  [],
    };
    gameState.set(`intel.${empireId}`, rec, 'intel_init');
    return rec;
  }

  _ensureIntelRecord(empireId) {
    return this.get(empireId) ?? this._initIntelRecord(empireId);
  }

  _findEmpireOfSystem(systemId) {
    // Najszybsza ścieżka: empireId na galaxyData.systems
    const galaxy = window.KOSMOS?.galaxyData;
    const gs = galaxy?.systems?.find(s => s.id === systemId);
    if (gs?.empireId) return gs.empireId;
    // Fallback: przeszukaj empireRegistry (gdyby syncToGalaxyData nie zadziałał)
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return null;
    for (const emp of reg.listAll()) {
      if (emp.homeSystemId === systemId) return emp.id;
      if ((emp.colonies ?? []).some(c => c.systemId === systemId)) return emp.id;
    }
    return null;
  }

  _resolveSystemIdFromMission(vessel, mission) {
    if (!mission) return null;
    // 1) Entity target (body) ma systemId
    if (mission.targetId) {
      const body = EntityManager.get(mission.targetId);
      if (body?.systemId) return body.systemId;
      // 2) Target może być wpisem w galaxyData (system-level target)
      const galaxy = window.KOSMOS?.galaxyData;
      const gs = galaxy?.systems?.find(s => s.id === mission.targetId);
      if (gs) return gs.id;
    }
    // 3) Fallback: systemId statku
    return vessel?.systemId ?? null;
  }

  // Inicjalizacja dla wszystkich imperiów wygenerowanych ZANIM system powstał
  // (np. EmpireGenerator pobiegł przed konstruktorem IntelSystem w GameScene).
  initForAllEmpires() {
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return;
    for (const emp of reg.listAll()) {
      if (!this.get(emp.id)) this._initIntelRecord(emp.id);
    }
  }
}
