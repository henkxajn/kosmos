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
import { TECH_SLIDER_SHIFTS } from '../systems/FactionSystem.js';
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

  // Suma permanentnych bonusów prosperity z technologii
  getProsperityBonus() {
    let total = 0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'prosperityBonus') total += fx.amount;
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

  /**
   * Generyczny mnożnik dla dowolnej kategorii (M4 P3+).
   * Czyta effects typu `{ type: 'multiplier', category, value }`.
   * Używane przez DeepSpaceCombatSystem (weapon_range_short/medium/long/all,
   * weapon_tracking_medium/long) i ProximitySystem (sensor_range).
   * @param {string} category
   * @returns {number} łączny mnożnik (1.0 gdy żaden tech nie pasuje)
   */
  getMultiplier(category) {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech?.effects) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'multiplier' && fx.category === category) {
          m *= fx.value;
        }
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

  /** Ile slotów badawczych (1 bazowo + bonusy z tech, np. basic_computing) */
  getResearchSlots() {
    let slots = 1;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'researchSlots') slots += fx.amount;
      }
    }
    return slots;
  }

  /** Bazowy mnożnik adjacency (0 jeśli urban_planning nie zbadane, 0.1 domyślnie) */
  getAdjacencyMultiplier() {
    if (!this._researched.has('urban_planning')) return 0;
    return 0.1;  // +10% per sąsiad tej samej kategorii
  }

  /** Sprawdź czy moduł statku jest odblokowany przez zbadaną technologię */
  isModuleUnlocked(moduleId) {
    // Szukaj wśród zbadanych technologii efektu unlockShipModule
    for (const techId of this._researched) {
      const tech = TECHS[techId];
      if (!tech?.effects) continue;
      for (const eff of tech.effects) {
        if (eff.type === 'unlockShipModule' && eff.moduleId === moduleId) return true;
      }
    }
    return false;
  }

  // ── Opcja C v3: Ground unit archetype unlocks + military stat bonuses ─────

  /**
   * Sprawdź czy archetyp jednostki naziemnej jest odblokowany przez zbadaną technologię.
   * Archetypy bez żadnego `unlockArchetype` w TechData są uważane za bazowe
   * (shock_infantry, garrison_unit) — zawsze odblokowane.
   */
  isArchetypeUnlocked(archetypeId) {
    for (const techId of this._researched) {
      const tech = TECHS[techId];
      if (!tech?.effects) continue;
      for (const eff of tech.effects) {
        if (eff.type === 'unlockArchetype' && eff.archetypeId === archetypeId) return true;
      }
    }
    return false;
  }

  /**
   * Sprawdź czy statek jest odblokowany przez zbadaną technologię.
   * Statki bez `unlockShip` w TechData są bazowe (zawsze odblokowane).
   */
  isShipUnlocked(shipId) {
    for (const techId of this._researched) {
      const tech = TECHS[techId];
      if (!tech?.effects) continue;
      for (const eff of tech.effects) {
        if (eff.type === 'unlockShip' && eff.shipId === shipId) return true;
      }
    }
    return false;
  }

  /**
   * Sprawdź czy commodity jest odblokowany przez zbadaną technologię.
   * Commodity bez `unlockCommodity` w TechData jest bazowy.
   */
  isCommodityUnlocked(commodityId) {
    for (const techId of this._researched) {
      const tech = TECHS[techId];
      if (!tech?.effects) continue;
      for (const eff of tech.effects) {
        if (eff.type === 'unlockCommodity' && eff.commodityId === commodityId) return true;
      }
    }
    return false;
  }

  /**
   * Zagregowane bonusy militarne z `statBonus` effects.
   * @returns {{ org: number, morale: number, supplyCap: number }}
   */
  getTechStatBonuses() {
    let org = 0, morale = 0, supplyCap = 0;
    for (const techId of this._researched) {
      const tech = TECHS[techId];
      if (!tech?.effects) continue;
      for (const eff of tech.effects) {
        if (eff.type !== 'statBonus') continue;
        const amount = eff.amount ?? 0;
        if (eff.stat === 'militaryOrg')       org       += amount;
        if (eff.stat === 'militaryMorale')    morale    += amount;
        if (eff.stat === 'militarySupplyCap') supplyCap += amount;
      }
    }
    return { org, morale, supplyCap };
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

    // Sprawdź wymóg inventory (nie zużywa — tylko sprawdza posiadanie)
    if (tech.requiresInventory) {
      const resSys = this.resourceSystem;
      if (resSys) {
        for (const [goodId, qty] of Object.entries(tech.requiresInventory)) {
          const have = resSys.inventory?.get(goodId) ?? 0;
          if (have < qty) {
            EventBus.emit('tech:researchFailed', { techId, reason: `Wymaga w magazynie: ${goodId} ×${qty} (masz: ${have})` });
            return;
          }
        }
      }
    }

    // Sprawdź koszt badań (z discovery soft-gate) — sumuj research z WSZYSTKICH kolonii
    const effectiveCost = this.getEffectiveCost(tech);
    const researchNeeded = effectiveCost.research ?? 0;
    if (researchNeeded > 0) {
      const colMgr = window.KOSMOS?.colonyManager;
      const colonies = colMgr?.getAllColonies() ?? [];
      // Zbierz łączny research z wszystkich kolonii
      let totalResearch = 0;
      const sources = []; // { resourceSystem, available }
      for (const col of colonies) {
        const rs = col.resourceSystem;
        if (!rs) continue;
        const avail = rs.research?.amount ?? 0;
        if (avail > 0) {
          sources.push({ rs, avail });
          totalResearch += avail;
        }
      }
      // Fallback: jeśli brak ColonyManager, użyj aktywnego resourceSystem
      if (sources.length === 0 && this.resourceSystem) {
        const avail = this.resourceSystem.research?.amount ?? 0;
        sources.push({ rs: this.resourceSystem, avail });
        totalResearch = avail;
      }
      if (totalResearch < researchNeeded) {
        EventBus.emit('tech:researchFailed', { techId, reason: t('tech.noResearchPoints') });
        return;
      }
      // Pobierz koszt proporcjonalnie z każdej kolonii
      let remaining = researchNeeded;
      for (const src of sources) {
        const take = Math.min(src.avail, remaining);
        if (take > 0) {
          src.rs.research.amount = Math.max(0, src.rs.research.amount - take);
          remaining -= take;
        }
        if (remaining <= 0) break;
      }
    }

    this._researched.add(techId);
    EventBus.emit('tech:researched', { tech, restored: false });
    this.emitCompletionHooks(techId);
  }

  // Hooki odpalane po ukończeniu badania (faction slider, narrative, dyson).
  // Publiczna — ResearchSystem wywołuje ją bezpośrednio, bo omija _research().
  // Bez tego rozwidlenia hooki by się gubiły w głównym flow badań (multi-slot queue).
  emitCompletionHooks(techId) {
    // Faction shift — postęp w FTL = nadzieja na powrót → suwak w stronę Poszukiwaczy (Faza C1)
    const factionDelta = TECH_SLIDER_SHIFTS[techId];
    if (factionDelta) {
      EventBus.emit('faction:sliderShift', {
        delta:  factionDelta,
        reason: `${techId}_researched`,
      });
    }

    // Faza C5: kronika_lokalizacji to lore-tech który wyzwala narodziny frakcji
    // (FactionSystem.unlock + łańcuch eventów narracyjnych w GameScene handler)
    if (techId === 'kronika_lokalizacji') {
      EventBus.emit('narrative:earthLocated');
    }

    // Faza D2a: hooki Sfery Dysona — będą skonsumowane przez DysonSystem w Fazie D3.
    // Aktualnie emitowane do nikąd (no-op listenerów); brak crash.
    if (techId === 'dyson_engineering') {
      EventBus.emit('dyson:engineeringUnlocked');
    } else if (techId === 'dyson_collector') {
      EventBus.emit('dyson:collectorUnlocked');
    } else if (techId === 'dyson_transmitter') {
      EventBus.emit('dyson:transmitterUnlocked');
    } else if (techId === 'jump_gate_construction') {
      EventBus.emit('dyson:jumpGateUnlocked');
    }
  }
}
