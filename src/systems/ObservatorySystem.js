// ObservatorySystem — "Oczy cywilizacji"
//
// Etap A: Pasywne skanowanie ciał niebieskich przez obserwatoria.
// Obserwatorium co pewien czas automatycznie odkrywa (explored=true)
// jedno niezbadane ciało w zasięgu. Tempo i zasięg zależą od poziomu.
//
// Etap B: Bonus do misji (redukcja katastrofy + yield bonus).
// Etap C: Wczesne ostrzeżenie przed zdarzeniami losowymi (TODO).
// Etap D: Prognoza kolizji (TODO).
// Etap E: Zakładka Observatory UI (TODO).
//
// Komunikacja:
//   Nasłuchuje: 'time:tick' { civDeltaYears }
//   Emituje:    'observatory:discovered' { body, discovered, colonyName }
//               'expedition:reconProgress' { body, discovered } (spójne z recon)

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { t }         from '../i18n/i18n.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { isEnemyVessel } from '../entities/Vessel.js';

// Typy ciał podlegające skanowaniu
const SCANNABLE_TYPES = ['planet', 'moon', 'planetoid', 'asteroid', 'comet'];

// Zasięg detekcji wrogich statków per poziom obserwatorium (AU).
// Index 0 = brak obserwatorium — każda kolonia dostaje 1 AU pasywnego wzroku
// (planeta widzi własną orbitę). Lv4+ = ∞ (cały układ); Lv5/Lv6 dokładają radar LY
// galaktyczny (Stratcom, patrz STRATCOM_LY_BY_LEVEL w FleetManagerOverlay).
const VESSEL_DETECTION_RANGE = [1, 3, 6, 15, Infinity, Infinity, Infinity];

// Co ile civYears odświeżać pozycję ghost-sightingu już-wykrytych statków (throttle — ogranicza
// churn gameState/DebugLog przy ciągłej detekcji). Nowo wykryte ('added') zapisują się natychmiast.
const SIGHTING_REFRESH_YEARS = 1.0;

export class ObservatorySystem {
  constructor() {
    // Akumulator czasu skanowania per kolonia: Map<planetId, number>
    this._scanAccum = new Map();

    // Historia odkryć obserwatorium: [{ bodyId, bodyName, year, colonyName }]
    this._discoveries = [];

    // Detekcja wrogich statków — Set<vesselId> aktualnie widocznych przez jakąkolwiek
    // kolonię gracza. Rebuilt co tick, NIE persystuje w save (self-healing po load).
    this._detectedVesselIds = new Set();

    // Set ID statków dla których wyemitowano już komunikat "Wykryto wrogą jednostkę"
    // — unika spamu EventLoga gdy statek wchodzi/wychodzi z zasięgu kilka razy.
    this._reportedVesselSightings = new Set();

    // Rok gry
    this._gameYear = 0;

    // Nasłuch czasu — civDeltaYears (mechaniki 4X biegną szybciej)
    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!window.KOSMOS?.civMode) return;
      this._tickScan(civDeltaYears);
    });

    EventBus.on('time:display', ({ gameTime }) => {
      this._gameYear = gameTime;
    });
  }

  // ── API publiczne ─────────────────────────────────────────────────────

  // Najwyższy poziom obserwatorium w danej kolonii
  getObservatoryLevel(colonyId) {
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(colonyId);
    if (!colony?.buildingSystem) return 0;

    let maxLevel = 0;
    colony.buildingSystem._active.forEach(entry => {
      if (entry.building.id === 'observatory') {
        maxLevel = Math.max(maxLevel, entry.level);
      }
    });
    return maxLevel;
  }

  // Najwyższy poziom obserwatorium w CAŁYM imperium
  getMaxObservatoryLevel() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return 0;

    let maxLevel = 0;
    for (const col of colMgr.getAllColonies()) {
      if (col.ownerEmpireId) continue;   // tylko kolonie gracza (radar/ostrzeżenia należą do gracza)
      if (!col.buildingSystem) continue;
      col.buildingSystem._active.forEach(entry => {
        if (entry.building.id === 'observatory') {
          maxLevel = Math.max(maxLevel, entry.level);
        }
      });
    }
    return maxLevel;
  }

  // Redukcja ryzyka katastrofy z obserwatorium w danej kolonii (%)
  getDisasterReduction(colonyId) {
    const level = this.getObservatoryLevel(colonyId);
    if (level <= 0) return 0;
    const def = BUILDINGS.observatory;
    // Klamra 0.9 — przy Lv6 surowe 0.3×6=1.8 (180%) dawałoby pełną/ujemną immunizację.
    return Math.min(0.9, (def?.disasterReduction ?? 0.3) * level);
  }

  // Bonus do yield misji z obserwatorium w danej kolonii (mnożnik, np. 0.15)
  getMissionYieldBonus(colonyId) {
    const level = this.getObservatoryLevel(colonyId);
    if (level <= 0) return 0;
    const def = BUILDINGS.observatory;
    return (def?.missionYieldBonus ?? 0.05) * level;
  }

  // Lata wyprzedzenia ostrzeżenia (max w imperium)
  getWarningYears() {
    const level = this.getMaxObservatoryLevel();
    if (level <= 0) return 0;
    const def = BUILDINGS.observatory;
    return (def?.warningYears ?? 0.5) * level;
  }

  // Lista odkryć obserwatorium
  getDiscoveries() {
    return [...this._discoveries];
  }

  // ── Detekcja wrogich statków (fog-of-war) ──────────────────────────────

  // Zasięg detekcji statków dla konkretnej kolonii (AU).
  // Bazowo 1 AU dla dowolnej żywej kolonii; obserwatorium rozszerza wg VESSEL_DETECTION_RANGE.
  getVesselDetectionRangeAU(colony) {
    if (!colony?.buildingSystem) return 0;
    let lvl = 0;
    colony.buildingSystem._active.forEach(entry => {
      if (entry.building.id === 'observatory') {
        lvl = Math.max(lvl, entry.level);
      }
    });
    const idx = Math.min(lvl, VESSEL_DETECTION_RANGE.length - 1);
    return VESSEL_DETECTION_RANGE[idx];
  }

  // Czy konkretny statek jest aktualnie wykryty?
  isVesselDetected(vesselId) {
    return this._detectedVesselIds.has(vesselId);
  }

  // Snapshot wszystkich wykrytych statków (defensywna kopia).
  getDetectedVesselIds() {
    return new Set(this._detectedVesselIds);
  }

  // ── Tick skanowania ───────────────────────────────────────────────────

  _tickScan(civDeltaYears) {
    // Detekcja statków działa continuous — wykrycie wroga nie może czekać 6 lat jak
    // pierwsze odkrycie ciała niebieskiego. Każdy tick rebuildsowi Set i emituje diff.
    this._tickVesselDetection(civDeltaYears);

    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';

    // Znajdź najlepsze obserwatorium w imperium (najszybsze tempo)
    let bestColony = null;
    let bestLevel  = 0;
    let bestEntity = null;  // ciało niebieskie kolonii (do obliczania odległości)

    for (const col of colMgr.getAllColonies()) {
      if (col.ownerEmpireId) continue;   // skan ciał napędza obserwatorium gracza, nie AI
      if (!col.buildingSystem) continue;
      let colLevel = 0;
      col.buildingSystem._active.forEach(entry => {
        if (entry.building.id === 'observatory') {
          colLevel = Math.max(colLevel, entry.level);
        }
      });
      if (colLevel > bestLevel) {
        bestLevel = colLevel;
        bestColony = col;
        bestEntity = col.planet ?? this._findEntity(col.planetId);
      }
    }

    if (bestLevel <= 0 || !bestColony) return;

    // Parametry skanowania
    const def = BUILDINGS.observatory;
    const interval = (def?.scanInterval ?? 0.5) / bestLevel;  // civYears
    const baseRange = def?.scanRange ?? 8;
    const range = bestLevel >= 5 ? Infinity : baseRange + bestLevel * 4;  // AU

    // Akumuluj czas (max 1 odkrycie per tick — clamp nadmiar)
    const colId = bestColony.planetId;
    const accum = (this._scanAccum.get(colId) ?? 0) + civDeltaYears;

    if (accum < interval) {
      this._scanAccum.set(colId, accum);
      return;
    }

    // Zużyj interwał, clamp resztę żeby nie kumulować przy szybkim czasie
    this._scanAccum.set(colId, Math.min(accum - interval, interval * 0.5));

    // Znajdź niezbadane ciała w zasięgu
    const candidates = this._getUnexploredBodies(sysId, bestEntity, range);
    if (candidates.length === 0) return;

    // Wybierz najbliższe
    const target = candidates[0];  // posortowane wg odległości

    // Odkryj ciało
    target.body.explored = true;
    const discovered = [target.body];

    // Auto-discover księżyce (jeśli odkryto planetę)
    if (target.body.type === 'planet') {
      const moons = EntityManager.getByTypeInSystem('moon', sysId)
        .filter(m => m.parentPlanetId === target.body.id && !m.explored);
      moons.forEach(m => { m.explored = true; });
      discovered.push(...moons);
    }

    // Zapisz w historii
    const entry = {
      bodyId:     target.body.id,
      bodyName:   target.body.name ?? target.body.id,
      year:       this._gameYear,
      colonyName: bestColony.name ?? bestColony.planetId,
    };
    this._discoveries.push(entry);

    // Emituj zdarzenia
    EventBus.emit('observatory:discovered', {
      body: target.body,
      discovered,
      colonyName: bestColony.name,
    });

    // Spójne z recon — inne systemy mogą nasłuchiwać tego samego eventu
    EventBus.emit('expedition:reconProgress', {
      body: target.body,
      discovered,
    });
  }

  // Rebuild zbioru wykrytych wrogich statków na podstawie zasięgów wszystkich kolonii gracza.
  // Statek jest "detected" gdy leży w zasięgu JAKIEJKOLWIEK kolonii (OR nie SUM).
  // Zasięg per kolonia = max z VESSEL_DETECTION_RANGE dla jej obserwatorium.
  _tickVesselDetection(civDeltaYears = 0) {
    const colMgr = window.KOSMOS?.colonyManager;
    const vMgr   = window.KOSMOS?.vesselManager;
    if (!colMgr || !vMgr) return;

    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    // Tylko kolonie GRACZA — radar/detekcja należą do gracza; obserwatoria AI nie zasilają jego widoku.
    const colonies = colMgr.getAllColonies().filter(c => {
      if (c.ownerEmpireId) return false;
      const cs = c.planet?.systemId ?? c.systemId ?? sysId;
      return cs === sysId;
    });

    const currentlyDetected = new Set();
    const detectedVessels   = new Map();  // id → vessel (do odświeżania ghost-sightingu)

    // Wczesne wyjście gdy brak kolonii gracza w aktywnym systemie — nic nie widzimy
    if (colonies.length > 0) {
      const allVessels = vMgr.getAllVessels?.() ?? [];
      for (const v of allVessels) {
        if (!isEnemyVessel(v)) continue;
        if ((v.systemId ?? sysId) !== sysId) continue;

        for (const col of colonies) {
          const range = this.getVesselDetectionRangeAU(col);
          if (range <= 0) continue;
          const colPos = col.planet ?? EntityManager.get(col.planetId);
          if (!colPos) continue;
          const dist = DistanceUtils.euclideanAU(
            { x: colPos.x ?? 0, y: colPos.y ?? 0 },
            { x: v.position?.x ?? 0, y: v.position?.y ?? 0 }
          );
          if (dist <= range) {
            currentlyDetected.add(v.id);
            detectedVessels.set(v.id, v);
            break;  // wystarczy jedna kolonia
          }
        }
      }
    }

    const intelSys = window.KOSMOS?.intelSystem;

    // Diff z poprzednim stanem — emituj zmiany visibility
    const added = [];
    const removed = [];
    currentlyDetected.forEach(id => { if (!this._detectedVesselIds.has(id)) added.push(id); });
    this._detectedVesselIds.forEach(id => { if (!currentlyDetected.has(id)) removed.push(id); });

    // Throttlowane odświeżenie pozycji ghost-sightingu już-wykrytych statków (nie co tick — churn).
    // Działa też w steady-state (przed early-return); nowo wykryte dostają świeży zapis niżej.
    this._sightingRefreshAccum = (this._sightingRefreshAccum ?? 0) + civDeltaYears;
    if (this._sightingRefreshAccum >= SIGHTING_REFRESH_YEARS) {
      this._sightingRefreshAccum = 0;
      for (const [id, v] of detectedVessels) {
        if (this._detectedVesselIds.has(id)) intelSys?.recordSighting?.(id, v, 'rumor');
      }
    }

    if (added.length === 0 && removed.length === 0) return;

    this._detectedVesselIds = currentlyDetected;

    const evtLog = window.KOSMOS?.eventLogSystem;
    const reg    = window.KOSMOS?.empireRegistry;

    for (const id of added) {
      const v = detectedVessels.get(id) ?? vMgr.getVessel?.(id) ?? null;
      EventBus.emit('vessel:detectionChanged', { vesselId: id, detected: true, vessel: v });

      if (!v) continue;

      // Per-vessel intel: zdalny sighting obserwatorium = 'rumor' (pozycja bez identyfikacji).
      // Faktyczny 'contact' (żywy + tożsamość) przychodzi z proximity / vessel:arrived / battle.
      intelSys?.recordSighting?.(id, v, 'rumor');

      // Intel poziomu IMPERIUM — osobny tor (ujawnia istnienie imperium, nie konkretny statek).
      const empId = v.ownerEmpireId ?? v.owner;
      if (empId && empId !== 'player') {
        intelSys?.advanceIntel?.(empId, 'rumor', 'vessel_sighted');
      }

      // EventLog + popup alert — tylko PIERWSZE wykrycie w sesji.
      if (!this._reportedVesselSightings.has(id)) {
        this._reportedVesselSightings.add(id);
        const empName = (empId && reg?.get?.(empId)?.name) ? reg.get(empId).name : 'nieznane imperium';
        // Fog-of-war tożsamości: detekcja obserwatorium = rumor (pozycja bez identyfikacji).
        // Log NIE ujawnia nazwy statku — tylko fakt wykrycia kontaktu. Pełne dane = proximity.
        evtLog?.push({
          text:      `🔭 Wykryto niezidentyfikowany kontakt w układzie.`,
          channel:   'intel',
          severity:  'warn',
          entityRef: id,
        });
        // Dedykowany event dla GameScene — popup z pauzą gry
        EventBus.emit('vessel:firstSighting', {
          vessel: v,
          empireId: empId,
          empireName: empName,
        });
      }
    }

    for (const id of removed) {
      EventBus.emit('vessel:detectionChanged', { vesselId: id, detected: false });
    }
  }

  // Zbierz niezbadane ciała w zasięgu, posortowane wg odległości orbitalnej
  _getUnexploredBodies(systemId, fromEntity, rangeAU) {
    const result = [];
    const fromA = fromEntity?.orbital?.a ?? 0;

    for (const type of SCANNABLE_TYPES) {
      for (const body of EntityManager.getByTypeInSystem(type, systemId)) {
        if (body.explored) continue;

        // Odległość orbitalna (stabilna)
        const bodyA = body.orbital?.a ?? 0;
        const dist = Math.abs(bodyA - fromA);

        if (dist <= rangeAU) {
          result.push({ body, dist });
        }
      }
    }

    // Sortuj wg odległości (najbliższe najpierw)
    result.sort((a, b) => a.dist - b.dist);
    return result;
  }

  // Helper: znajdź encję po ID
  _findEntity(id) {
    return EntityManager.get(id) ?? null;
  }

  // ── Serializacja ──────────────────────────────────────────────────────

  serialize() {
    const scanAccum = {};
    this._scanAccum.forEach((val, key) => { scanAccum[key] = val; });

    return {
      scanAccum,
      discoveries: this._discoveries,
    };
  }

  restore(data) {
    if (!data) return;

    // Przywróć akumulatory
    if (data.scanAccum) {
      for (const [key, val] of Object.entries(data.scanAccum)) {
        this._scanAccum.set(key, val);
      }
    }

    // Przywróć historię odkryć
    if (Array.isArray(data.discoveries)) {
      this._discoveries = data.discoveries;
    }
  }
}
