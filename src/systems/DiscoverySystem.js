// DiscoverySystem — system odkryć naukowych
//
// Odkrycia to unikalne zdarzenia podczas misji naukowych.
// Przy raporcie z misji scientific losowane jest max 1 odkrycie z puli pasujących.
// Odkrycia są unikalne — raz odkryte, nie powtarzają się.
//
// Komunikacja (EventBus):
//   Nasłuchuje:
//     discovery:roll → _rollDiscovery() — losowanie odkrycia po misji naukowej
//   Emituje:
//     discovery:found → { discovery, expedition } — odkrycie znalezione

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { DISCOVERIES, DISCOVERY_LIST } from '../data/DiscoveryData.js';
import { SHIPS } from '../data/ShipsData.js';

export class DiscoverySystem {
  constructor() {
    this._discovered = new Set();  // ID odkrytych
    this._milestones = new Set();  // ID osiągniętych milestones

    // Nasłuch EventBus
    EventBus.on('discovery:roll', (data) => this._rollDiscovery(data));
  }

  // ── Publiczne API ──────────────────────────────────────────────────────

  /** Czy odkrycie zostało już znalezione? */
  isDiscovered(discoveryId) {
    return this._discovered.has(discoveryId);
  }

  /** Czy milestone osiągnięty? */
  hasMilestone(milestoneId) {
    return this._milestones.has(milestoneId);
  }

  /** Pobierz listę odkrytych ID */
  getDiscoveredIds() {
    return [...this._discovered];
  }

  // ── Losowanie odkrycia ─────────────────────────────────────────────────

  /**
   * Losuj odkrycie po zakończeniu misji naukowej.
   * @param {object} data
   * @param {object} data.expedition — dane ekspedycji
   * @param {string} data.bodyId — ID ciała docelowego
   * @param {string} data.bodyType — typ ciała (planet, moon, planetoid, asteroid, comet)
   * @param {number} data.distanceAU — odległość od gwiazdy (AU)
   */
  _rollDiscovery({ expedition, bodyId, bodyType, distanceAU }) {
    // Pobierz dane ciała
    const body = this._findBody(bodyId);
    const planetType = body?.planetType ?? body?.subType ?? null;
    const lifeScore  = body?.lifeScore ?? 0;

    // Policz planety w układzie
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const planetCount = EntityManager.getByTypeInSystem('planet', sysId).length;

    // Bonus z Fusion Explorer (+50% szans)
    let discoveryBonus = 1.0;
    if (expedition?.vesselId) {
      const vMgr = window.KOSMOS?.vesselManager;
      const vessel = vMgr?.getVessel(expedition.vesselId);
      if (vessel) {
        const shipDef = SHIPS[vessel.shipId];
        if (shipDef?.discoveryBonus) {
          discoveryBonus += shipDef.discoveryBonus;
        }
      }
    }

    // Filtruj eligible odkrycia
    const eligible = DISCOVERY_LIST.filter(disc => {
      // Unikalne — nie powtarzaj
      if (this._discovered.has(disc.id)) return false;

      const c = disc.conditions;

      // Typ ciała
      if (c.bodyType && c.bodyType.length > 0) {
        if (!c.bodyType.includes(bodyType)) return false;
      }

      // Podtyp planety
      if (c.planetType && c.planetType.length > 0) {
        if (!planetType || !c.planetType.includes(planetType)) return false;
      }

      // Wymagany tech
      if (c.requiredTech) {
        const tSys = window.KOSMOS?.techSystem;
        if (!tSys?.isResearched(c.requiredTech)) return false;
      }

      // Odległość od gwiazdy
      if (c.minDistance != null && distanceAU < c.minDistance) return false;
      if (c.maxDistance != null && distanceAU > c.maxDistance) return false;

      // LifeScore
      if (c.minLifeScore != null && lifeScore < c.minLifeScore) return false;

      // Min planet w układzie
      if (c.minPlanets != null && planetCount < c.minPlanets) return false;

      return true;
    });

    if (eligible.length === 0) return;

    // Losuj max 1 odkrycie — iteruj eligible, roll per each
    for (const disc of eligible) {
      const effectiveChance = disc.chance * discoveryBonus;
      const roll = Math.random() * 100;
      if (roll < effectiveChance) {
        this._discover(disc, expedition, bodyId);
        return; // max 1 per misja
      }
    }
  }

  // ── Zastosowanie odkrycia ──────────────────────────────────────────────

  _discover(disc, expedition, bodyId) {
    this._discovered.add(disc.id);

    const effects = disc.effects;

    // Bonus research natychmiastowy
    if (effects.research && effects.research > 0) {
      const resSys = window.KOSMOS?.resourceSystem;
      if (resSys) resSys.receive({ research: effects.research });
    }

    // Bonus prosperity permanentny (do aktywnej kolonii)
    if (effects.prosperity && effects.prosperity > 0) {
      const prospSys = window.KOSMOS?.prosperitySystem;
      if (prospSys) {
        prospSys.addDiscoveryBonus(effects.prosperity);
      }
    }

    // Nowy deposit na celu
    if (effects.deposit && bodyId) {
      const body = this._findBody(bodyId);
      if (body) {
        if (!body.deposits) body.deposits = [];
        body.deposits.push({
          resourceId: effects.deposit,
          richness: effects.depositRichness ?? 0.5,
          remaining: 9999,
        });
      }
    }

    // Milestone
    if (effects.milestone && effects.milestoneId) {
      this._milestones.add(effects.milestoneId);
    }

    // Emituj event — MissionEventModal wyświetli popup
    EventBus.emit('discovery:found', {
      discovery: disc,
      expedition,
      bodyId,
    });
  }

  // ── Helpery ────────────────────────────────────────────────────────────

  _findBody(bodyId) {
    const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
    for (const t of TYPES) {
      const found = EntityManager.getByType(t).find(b => b.id === bodyId);
      if (found) return found;
    }
    return null;
  }

  // ── Serializacja ───────────────────────────────────────────────────────

  serialize() {
    return {
      discovered: [...this._discovered],
      milestones: [...this._milestones],
    };
  }

  restore(data) {
    this._discovered.clear();
    this._milestones.clear();
    if (data?.discovered) {
      for (const id of data.discovered) this._discovered.add(id);
    }
    if (data?.milestones) {
      for (const id of data.milestones) this._milestones.add(id);
    }
  }
}
