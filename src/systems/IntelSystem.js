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
import { GAME_CONFIG } from '../config/GameConfig.js';

const LEVELS = ['unknown', 'rumor', 'contact', 'detailed'];
const LEVEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

const PASSIVE_RUMOR_LY     = 10.0;  // zasięg pasywnego "nasłuchu" w LY
const PASSIVE_RUMOR_YEARS  = 8.0;   // lata gry do ujawnienia rumoru
const INCIDENT_MAX         = 10;    // ile ostatnich incydentów trzymać per imperium

// M2b Commit 2 — vessel sub-domain (gameState.intel.vessels)
const VESSEL_TIMEOUT_FIRST  = 5;    // detailed → contact (civYears bez kontaktu)
const VESSEL_TIMEOUT_SECOND = 10;   // contact → rumor
const VESSEL_TIMEOUT_THIRD  = 20;   // rumor → removed
const VESSEL_LEVEL_RANK = Object.freeze({
  unknown:  0,
  rumor:    1,
  contact:  2,
  detailed: 3,
});
const VESSEL_CONTACT_DISTANCE_AU = 0.3; // <0.3 AU → contact, >=0.3 → rumor

export class IntelSystem {
  constructor() {
    this._tickAccum = 0;
    this._rumorAccum = {}; // empireId → float (lata w zasięgu)

    // Auto-wykrywanie przez eventy
    EventBus.on('vessel:arrived', ({ vessel, mission }) => this._onVesselArrived(vessel, mission));
    EventBus.on('observatory:discovered', (ev) => this._onObservatoryDiscovered(ev));
    EventBus.on('groundUnit:surveyComplete', (ev) => this._onGroundSurvey(ev));
    EventBus.on('groundUnit:anomalyFound', (ev) => this._onGroundSurvey(ev));

    // M2b Commit 2 — vessel observations + degradation (gated przez FEATURES.intelContactState)
    // ProximitySystem emituje DWA eventy dla dwóch threshold'ów:
    //   proximityEnter    przy <0.5 AU (detection)  → distanceAU>=0.3 zwykle → 'rumor'
    //   combatRangeEnter  przy <0.15 AU (combat)   → distanceAU<0.3       → 'contact'
    // Bez subskrypcji combatRangeEnter quality utykałaby na 'rumor' gdy player
    // pursue dochodzi do THREAT_RADIUS 0.15 AU bez ponownego proximityEnter.
    EventBus.on('vessel:proximityEnter',    (e) => this._onVesselProximityEnter(e));
    EventBus.on('vessel:combatRangeEnter',  (e) => this._onVesselProximityEnter(e));
    EventBus.on('vessel:proximityExit',     (e) => this._onVesselProximityExit(e));
    EventBus.on('vessel:wrecked',           (e) => this._onVesselWrecked(e));

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
    // Slice 1: emp.colonies to [colonyId, ...] — systemId odczytujemy z ColonyManager.
    if (newRank >= LEVEL_RANK.contact) {
      updated.knownColonies = [...(updated.knownColonies ?? [])];
      const colMgr = window.KOSMOS?.colonyManager;
      for (const colonyId of emp.colonies ?? []) {
        const col = colMgr?.getColony(colonyId);
        const sysId = col?.systemId ?? null;
        if (sysId && !updated.knownColonies.includes(sysId)) {
          updated.knownColonies.push(sysId);
        }
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

    // M2b Commit 2 — vessel contact degradation (gated)
    if (GAME_CONFIG.FEATURES.intelContactState) {
      this._tickVesselDegradation(yearsPassed);
    }
  }

  // ── Vessel sub-domain (M2b Commit 2) ─────────────────────────
  // Stan: gameState.intel.vessels[vesselId] = {
  //   quality, firstSeenYear, lastSeenYear, positionKnown, positionLastKnown,
  //   strengthEstimate, hullKnown, modulesKnown
  // }
  // Subskrypcje: vessel:proximityEnter/Exit/wrecked. Wszystkie mutacje gated
  // przez FEATURES.intelContactState (defensive — bezpieczny mid-game flag toggle).

  _year() {
    return window.KOSMOS?.timeSystem?.gameTime ?? 0;
  }

  _isPlayerVessel(v) {
    return v?.ownerEmpireId === 'player' || v?.owner === 'player';
  }

  _getOrInitVesselRecord(vesselId) {
    const existing = gameState.get(`intel.vessels.${vesselId}`);
    if (existing) return existing;
    return {
      quality:           'unknown',
      firstSeenYear:     this._year(),
      lastSeenYear:      this._year(),
      positionKnown:     false,
      positionLastKnown: null,
      strengthEstimate:  null,
      hullKnown:         false,
      modulesKnown:      false,
    };
  }

  _estimateStrength(vessel) {
    const real = vessel?.combatStrength ?? vessel?.power ?? 1;
    const noise = 0.5 + Math.random();  // 0.5 .. 1.5 → ±50%
    return Math.round(real * noise);
  }

  // Zwraca {observedId, observed} jeśli dokładnie jeden vessel z pary jest player; else null
  _resolveObservedFromPair(vesselAId, vesselBId) {
    const vm = window.KOSMOS?.vesselManager;
    if (!vm) return null;
    const vA = vm.getVessel(vesselAId);
    const vB = vm.getVessel(vesselBId);
    const pA = this._isPlayerVessel(vA);
    const pB = this._isPlayerVessel(vB);
    if (pA && !pB) return { observedId: vesselBId, observed: vB };
    if (pB && !pA) return { observedId: vesselAId, observed: vA };
    return null;
  }

  _onVesselProximityEnter({ vesselAId, vesselBId, distanceAU, sameFaction } = {}) {
    if (!GAME_CONFIG.FEATURES.intelContactState) return;
    if (sameFaction) return;
    const r = this._resolveObservedFromPair(vesselAId, vesselBId);
    if (!r) return;
    this._observeVessel(r.observedId, r.observed, distanceAU);
  }

  _observeVessel(vesselId, vessel, distanceAU) {
    const newQuality = (distanceAU < VESSEL_CONTACT_DISTANCE_AU) ? 'contact' : 'rumor';
    const rec = this._getOrInitVesselRecord(vesselId);
    const oldQuality = rec.quality;
    const oldRank = VESSEL_LEVEL_RANK[oldQuality] ?? 0;
    const newRank = VESSEL_LEVEL_RANK[newQuality] ?? 0;

    // Position i lastSeenYear ZAWSZE update gdy obserwujemy
    const updated = {
      ...rec,
      lastSeenYear:      this._year(),
      positionKnown:     true,
      positionLastKnown: vessel?.position
        ? { x: vessel.position.x, y: vessel.position.y }
        : rec.positionLastKnown,
      strengthEstimate:  rec.strengthEstimate ?? this._estimateStrength(vessel),
    };

    // Quality podnoś tylko w górę (no-downgrade w observation)
    if (newRank > oldRank) {
      updated.quality = newQuality;
      gameState.set(`intel.vessels.${vesselId}`, updated, 'proximity_observation');
      EventBus.emit('intel:vesselContactChanged', {
        vesselId,
        oldQuality,
        newQuality,
        reason: 'proximity_observation',
      });
    } else {
      gameState.set(`intel.vessels.${vesselId}`, updated, 'proximity_observation');
    }
  }

  _onVesselProximityExit({ vesselAId, vesselBId, sameFaction } = {}) {
    if (!GAME_CONFIG.FEATURES.intelContactState) return;
    if (sameFaction) return;
    const r = this._resolveObservedFromPair(vesselAId, vesselBId);
    if (!r) return;
    if (this._stillObservedByAnyPlayerVessel(r.observedId)) return;
    const rec = gameState.get(`intel.vessels.${r.observedId}`);
    if (!rec) return;
    gameState.set(`intel.vessels.${r.observedId}`, {
      ...rec,
      positionKnown: false,
      // positionLastKnown UNCHANGED — kontrakt z UI (M3 question-mark / dim sprite)
    }, 'proximity_lost');
  }

  _stillObservedByAnyPlayerVessel(targetVesselId) {
    const ps = window.KOSMOS?.proximitySystem;
    if (!ps?.getActivePairsFor) return false;
    const vm = window.KOSMOS?.vesselManager;
    if (!vm) return false;
    for (const otherId of ps.getActivePairsFor(targetVesselId)) {
      const v = vm.getVessel(otherId);
      if (this._isPlayerVessel(v)) return true;
    }
    return false;
  }

  _onVesselWrecked({ vesselId } = {}) {
    if (!GAME_CONFIG.FEATURES.intelContactState) return;
    if (!vesselId) return;
    const vessels = gameState.get('intel.vessels') ?? {};
    if (!vessels[vesselId]) return;  // nie obserwowaliśmy — nic do zrobienia
    const rec = vessels[vesselId];
    const copy = { ...vessels };
    delete copy[vesselId];
    gameState.set('intel.vessels', copy, 'vessel_wrecked');
    EventBus.emit('intel:vesselContactLost', {
      vesselId,
      lastKnownPosition: rec.positionLastKnown,
      reason: 'wrecked',
    });
  }

  _tickVesselDegradation(yearsPassed) {
    if (!GAME_CONFIG.FEATURES.intelContactState) return; // defense-in-depth (devtools direct call)
    if (!yearsPassed) return;
    const vessels = gameState.get('intel.vessels') ?? {};
    const ids = Object.keys(vessels);
    if (!ids.length) return;
    const now = this._year();
    let copy = null; // lazy clone — modyfikujemy tylko jeśli coś się zmienia

    for (const id of ids) {
      const rec = vessels[id];
      if (!rec) continue;
      // Skip gdy vessel jest w zasięgu — _observeVessel update'uje lastSeenYear ciągle
      if (rec.positionKnown) continue;
      const age = now - (rec.lastSeenYear ?? now);

      if (age >= VESSEL_TIMEOUT_THIRD) {
        copy = copy ?? { ...vessels };
        delete copy[id];
        EventBus.emit('intel:vesselContactLost', {
          vesselId: id,
          lastKnownPosition: rec.positionLastKnown,
          reason: 'timeout',
        });
        continue;
      }

      let newQuality = rec.quality;
      if (age >= VESSEL_TIMEOUT_SECOND && VESSEL_LEVEL_RANK[rec.quality] >= 2) {
        newQuality = 'rumor';
      } else if (age >= VESSEL_TIMEOUT_FIRST && VESSEL_LEVEL_RANK[rec.quality] >= 3) {
        newQuality = 'contact';
      }
      if (newQuality !== rec.quality) {
        copy = copy ?? { ...vessels };
        copy[id] = { ...rec, quality: newQuality };
        EventBus.emit('intel:vesselContactChanged', {
          vesselId: id,
          oldQuality: rec.quality,
          newQuality,
          reason: 'vessel_contact_aged_out',
        });
      }
    }

    if (copy) gameState.set('intel.vessels', copy, 'vessel_contact_aged_out');
  }

  // ── Public API (M2b Commit 2) ────────────────────────────────

  getVesselContact(vesselId) {
    return gameState.get(`intel.vessels.${vesselId}`) ?? null;
  }

  advanceVesselContact(vesselId, quality, reason) {
    if (!VESSEL_LEVEL_RANK.hasOwnProperty(quality)) return false;
    const rec = this._getOrInitVesselRecord(vesselId);
    const oldQuality = rec.quality;
    if (VESSEL_LEVEL_RANK[quality] <= VESSEL_LEVEL_RANK[oldQuality]) return false;
    const updated = { ...rec, quality, lastSeenYear: this._year() };
    gameState.set(`intel.vessels.${vesselId}`, updated, reason ?? 'manual_advance');
    EventBus.emit('intel:vesselContactChanged', {
      vesselId, oldQuality, newQuality: quality, reason: reason ?? 'manual',
    });
    return true;
  }

  // Sighting zdalny (radar obserwatorium) — pośredni kontakt position-only, BEZ identyfikacji.
  // W odróżnieniu od _observeVessel (proximity): brak dystansu, jawna jakość (domyślnie 'rumor'),
  // positionKnown=false → render jako zamrożony ghost (nie żywy blob). Zapisuje/odświeża
  // positionLastKnown + lastSeenYear; quality podnosi tylko w górę; emituje event wyłącznie przy
  // realnej zmianie quality (reszta = ciche odświeżenie pozycji, ogranicza churn DebugLog).
  recordSighting(vesselId, vessel, quality = 'rumor') {
    if (!GAME_CONFIG.FEATURES.intelContactState) return false;
    if (this._isPlayerVessel(vessel)) return false;            // AI-leak guard: statek gracza nigdy
    if (!VESSEL_LEVEL_RANK.hasOwnProperty(quality)) return false;
    const rec = this._getOrInitVesselRecord(vesselId);
    const oldQuality = rec.quality;
    const oldRank = VESSEL_LEVEL_RANK[oldQuality] ?? 0;
    const newRank = VESSEL_LEVEL_RANK[quality] ?? 0;
    const updated = {
      ...rec,
      lastSeenYear:      this._year(),
      positionLastKnown: vessel?.position
        ? { x: vessel.position.x, y: vessel.position.y }
        : rec.positionLastKnown,
      strengthEstimate:  rec.strengthEstimate ?? this._estimateStrength(vessel),
    };
    if (newRank > oldRank) {
      updated.quality = quality;
      gameState.set(`intel.vessels.${vesselId}`, updated, 'observatory_sighting');
      EventBus.emit('intel:vesselContactChanged', {
        vesselId, oldQuality, newQuality: quality, reason: 'observatory_sighting',
      });
    } else {
      gameState.set(`intel.vessels.${vesselId}`, updated, 'observatory_sighting');
    }
    return true;
  }

  degradeVesselContact(vesselId, toQuality, reason) {
    if (!VESSEL_LEVEL_RANK.hasOwnProperty(toQuality)) return false;
    const rec = gameState.get(`intel.vessels.${vesselId}`);
    if (!rec) return false;
    const oldQuality = rec.quality;
    if (VESSEL_LEVEL_RANK[toQuality] >= VESSEL_LEVEL_RANK[oldQuality]) return false;
    const updated = { ...rec, quality: toQuality };
    gameState.set(`intel.vessels.${vesselId}`, updated, reason ?? 'manual_degrade');
    EventBus.emit('intel:vesselContactChanged', {
      vesselId, oldQuality, newQuality: toQuality, reason: reason ?? 'manual',
    });
    return true;
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

  // M2b Commit 2 — inicjalizacja vessel sub-domain.
  // Wywoływane przez GameScene PO gameState.reset() / restore() (constructor
  // init byłby bezskuteczny, bo GameScene resetuje state po instancjacji).
  // SaveMigration v66→v67 dodaje intel.vessels przy load starszego save'a;
  // tu jest fallback dla New Game v67 i save'ów które przeszły migrację bez
  // tego pola (defense-in-depth). Idempotentne — nie nadpisuje istniejącego.
  // Uwaga: pois init odłożony do Commit 5 (POIRegistry — system-właściciel
  // inicjalizuje swój sub-domain, symetria z intel.vessels).
  initVesselSubdomain() {
    const intel = gameState.get('intel') ?? {};
    if (!intel.vessels) {
      gameState.set('intel.vessels', {}, 'm2b_init');
    }
  }
}
