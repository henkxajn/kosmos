// TechSystem — zarządzanie drzewem technologii (Etap 38 — rozszerzony)
//
// Odpowiada za:
//   - śledzenie zbadanych technologii
//   - sprawdzanie warunków (prerequisites z OR, koszt badań, discovery soft-gate)
//   - obliczanie mnożników produkcji i konsumpcji
//   - nowe query methods: terrain unlock, factory speed, build time, autonomy, fuel, survival, research cost
//
// Komunikacja:
//   Nasłuchuje: 'tech:researchRequest' { techId } → próba zbadania
//   Emituje:    'tech:researched' { tech, restored }
//               'tech:researchFailed' { techId, reason }
//
// OR prerequisites:
//   requires: ['rocketry', ['ion_drives','plasma_drives'], 'fusion_power']
//   → rocketry AND (ion_drives OR plasma_drives) AND fusion_power

import EventBus from '../core/EventBus.js';
import { TECHS } from '../data/TechData.js';
import { t, getName } from '../i18n/i18n.js';

export class TechSystem {
  constructor(resourceSystem = null) {
    this.resourceSystem = resourceSystem;

    // Zbiór zbadanych id technologii
    this._researched = new Set();

    // Nasłuch żądań badań
    EventBus.on('tech:researchRequest', ({ techId }) => this._research(techId));
  }

  // ── API publiczne ──────────────────────────────────────────────────────────

  isResearched(id) {
    return this._researched.has(id);
  }

  /**
   * Sprawdź prerequisites technologii z obsługą OR.
   * requires: ['A', ['B','C'], 'D'] → A AND (B OR C) AND D
   * @returns {boolean}
   */
  checkPrerequisites(tech) {
    if (!tech.requires || tech.requires.length === 0) return true;
    for (const req of tech.requires) {
      if (Array.isArray(req)) {
        // OR — przynajmniej jeden musi być zbadany
        if (!req.some(r => this._researched.has(r))) return false;
      } else {
        // AND — musi być zbadany
        if (!this._researched.has(req)) return false;
      }
    }
    return true;
  }

  /**
   * Efektywny koszt badania z uwzględnieniem discovery soft-gate + research cost multiplier.
   * Bez odkrycia → 2× koszt; z odkryciem → 0.5× koszt.
   * @returns {{ research: number }}
   */
  getEffectiveCost(tech) {
    let baseCost = tech.cost?.research ?? 0;

    // Discovery soft-gate
    if (tech.requiresDiscovery) {
      const discovSys = window.KOSMOS?.discoverySystem;
      if (discovSys && discovSys.isDiscovered(tech.requiresDiscovery)) {
        baseCost = Math.ceil(baseCost * 0.5);
      } else {
        baseCost = Math.ceil(baseCost * 2);
      }
    }

    // Research cost multiplier z tech (np. quantum_computing -30%)
    const costMult = this.getResearchCostMultiplier();
    if (costMult !== 1.0) {
      baseCost = Math.ceil(baseCost * costMult);
    }

    return { research: baseCost };
  }

  // Lista technologii dostępnych do zbadania: prereqs spełnione, jeszcze nie zbadana
  getAvailable() {
    return Object.values(TECHS).filter(tech =>
      !this._researched.has(tech.id) &&
      this.checkPrerequisites(tech)
    );
  }

  // Łączny mnożnik produkcji dla podanego surowca
  getProductionMultiplier(resource) {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'modifier' && fx.resource === resource) {
          m *= fx.multiplier;
        }
      }
    }
    return m;
  }

  // Łączny mnożnik konsumpcji dla podanego surowca
  getConsumptionMultiplier(resource) {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'consumptionMultiplier' && fx.resource === resource) {
          m *= fx.multiplier;
        }
      }
    }
    return m;
  }

  // Suma bonusów moraleBonus
  getMoraleBonus() {
    let total = 0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'moraleBonus') total += fx.amount;
      }
    }
    return total;
  }

  // Łączny mnożnik wzrostu populacji
  getPopGrowthMultiplier() {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'popGrowthBonus') m *= fx.multiplier;
      }
    }
    return m;
  }

  // Łączna redukcja szansy katastrofy (w procentach)
  getDisasterReduction() {
    let total = 0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'disasterReduction') total += fx.amount;
      }
    }
    return total;
  }

  // Łączny mnożnik prędkości statków
  getShipSpeedMultiplier() {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'shipSpeedMultiplier') m *= fx.multiplier;
      }
    }
    return m;
  }

  // ── Nowe query methods (Etap 38) ──────────────────────────────────────────

  /**
   * Dodatkowe kategorie budynków odblokowane na terenie przez tech.
   * @returns {string[]} tablica kategorii
   */
  getTerrainUnlocks(terrainType) {
    const categories = [];
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'terrainUnlock' && fx.terrain === terrainType) {
          categories.push(...fx.categories);
        }
      }
    }
    return categories;
  }

  /** Łączny mnożnik prędkości fabryk */
  getFactorySpeedMultiplier() {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'factorySpeedMultiplier') m *= fx.multiplier;
      }
    }
    return m;
  }

  /** Łączny mnożnik czasu budowy budynków (mniejszy = szybciej) */
  getBuildTimeMultiplier() {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'buildTimeMultiplier') m *= fx.multiplier;
      }
    }
    return m;
  }

  /** Łączny mnożnik wydajności budynków autonomicznych */
  getAutonomousEfficiency() {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'autonomousEfficiency') m *= fx.multiplier;
      }
    }
    return m;
  }

  /** Łączny mnożnik zużycia paliwa (mniejszy = mniej paliwa) */
  getFuelEfficiency() {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'fuelEfficiency') m *= fx.multiplier;
      }
    }
    return m;
  }

  /** Łączna szansa przeżycia katastrofy (0–1; >0 = statek wraca uszkodzony) */
  getShipSurvivalChance() {
    let total = 0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'shipSurvival') total += fx.amount;
      }
    }
    return Math.min(total, 1.0);
  }

  /** Łączny mnożnik kosztu badań (mniejszy = tańsze badania) */
  getResearchCostMultiplier() {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'researchCostMultiplier') m *= fx.multiplier;
      }
    }
    return m;
  }

  /** Czy zbadano Singularność (wszystkie budynki autonomiczne) */
  isAllAutonomous() {
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'allBuildingsAutonomous') return true;
      }
    }
    return false;
  }

  /** Bazowy mnożnik adjacency (0 jeśli urban_planning nie zbadane, 0.1 domyślnie) */
  getAdjacencyMultiplier() {
    if (!this._researched.has('urban_planning')) return 0;
    return 0.1;  // +10% per sąsiad tej samej kategorii
  }

  // ── Serializacja ──────────────────────────────────────────────────────────

  serialize() {
    return { researched: [...this._researched] };
  }

  restore(data) {
    const list = data?.researched ?? [];
    for (const id of list) {
      if (TECHS[id]) {
        this._researched.add(id);
        EventBus.emit('tech:researched', { tech: TECHS[id], restored: true });
      }
    }
  }

  // ── Prywatne ──────────────────────────────────────────────────────────────

  _research(techId) {
    const tech = TECHS[techId];
    if (!tech) {
      EventBus.emit('tech:researchFailed', { techId, reason: t('tech.unknownTech') });
      return;
    }
    if (this._researched.has(techId)) {
      EventBus.emit('tech:researchFailed', { techId, reason: t('tech.alreadyResearched') });
      return;
    }

    // Sprawdź prerequisites (z obsługą OR)
    if (!this.checkPrerequisites(tech)) {
      for (const req of tech.requires) {
        if (Array.isArray(req)) {
          if (!req.some(r => this._researched.has(r))) {
            const names = req.map(r => getName(TECHS[r] ?? { id: r }, 'tech')).join(' / ');
            EventBus.emit('tech:researchFailed', { techId, reason: t('tech.requires', names) });
            return;
          }
        } else if (!this._researched.has(req)) {
          const reqName = getName(TECHS[req] ?? { id: req }, 'tech');
          EventBus.emit('tech:researchFailed', { techId, reason: t('tech.requires', reqName) });
          return;
        }
      }
      return;
    }

    // Sprawdź koszt badań (z discovery soft-gate)
    if (this.resourceSystem) {
      const effectiveCost = this.getEffectiveCost(tech);
      if (!this.resourceSystem.canAfford(effectiveCost)) {
        EventBus.emit('tech:researchFailed', { techId, reason: t('tech.noResearchPoints') });
        return;
      }
      this.resourceSystem.spend(effectiveCost);
    }

    this._researched.add(techId);
    EventBus.emit('tech:researched', { tech, restored: false });
  }
}
