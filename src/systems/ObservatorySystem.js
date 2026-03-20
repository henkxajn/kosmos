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

// Typy ciał podlegające skanowaniu
const SCANNABLE_TYPES = ['planet', 'moon', 'planetoid', 'asteroid', 'comet'];

export class ObservatorySystem {
  constructor() {
    // Akumulator czasu skanowania per kolonia: Map<planetId, number>
    this._scanAccum = new Map();

    // Historia odkryć obserwatorium: [{ bodyId, bodyName, year, colonyName }]
    this._discoveries = [];

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
    return (def?.disasterReduction ?? 0.3) * level;
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

  // ── Tick skanowania ───────────────────────────────────────────────────

  _tickScan(civDeltaYears) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';

    // Znajdź najlepsze obserwatorium w imperium (najszybsze tempo)
    let bestColony = null;
    let bestLevel  = 0;
    let bestEntity = null;  // ciało niebieskie kolonii (do obliczania odległości)

    for (const col of colMgr.getAllColonies()) {
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
