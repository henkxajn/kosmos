// ProsperitySystem — dobrobyt kolonii oparty na konsumpcji dóbr (per-kolonia)
//
// Oblicza demand na dobra konsumpcyjne, satisfaction, prosperity score.
// Consumer Factory auto-alokuje produkcję proporcjonalnie do demand.
//
// Komunikacja:
//   Nasłuchuje: 'time:tick'           → _update(deltaYears)
//   Emituje:    'prosperity:changed'  { prosperity, delta, planetId }
//               'epoch:changed'       { epoch, oldEpoch, epochScore }
//               'consumer:demandUpdate' { demands }
//               'consumer:shortage'   { goodId, ratio }
//               'resource:registerProducer' — rejestracja konsumpcji i produkcji

import EventBus from '../core/EventBus.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import {
  BASE_DEMAND,
  TEMP_MULTIPLIERS,
  ATMO_MULTIPLIERS,
  GRAV_MULTIPLIERS,
  EPOCHS,
  PROSPERITY_WEIGHTS,
  SATISFACTION_THRESHOLDS,
  LAYER_GOODS,
  PROSPERITY_EFFECTS,
} from '../data/ConsumerGoodsData.js';

export class ProsperitySystem {
  constructor(resourceSystem, civSystem, techSystem, planet) {
    this.resourceSystem = resourceSystem;
    this.civSystem = civSystem;
    this.techSystem = techSystem;
    this.planet = planet;  // potrzebny do mnożników środowiskowych

    this.prosperity = 50;        // początkowy score
    this.targetProsperity = 50;
    this.epoch = 'early';
    this.epochScore = 0;

    this._consumerDemand = {};    // demand per good per rok
    this._consumerProduction = {}; // produkcja per good per rok
    this._satisfaction = {};       // satisfaction per good (0-1)
    this._layerScores = {};        // score per warstwa

    // Bonusy prosperity z zdarzeń losowych: sourceId → { delta, remainingYears }
    this._eventBonuses = new Map();

    // Akumulator czasu (roczne przeliczanie)
    this._accumYears = 0;
    this._lastRegisteredDemand = null;  // guard: unikaj re-rejestracji
    this._lastRegisteredProd = null;

    // Permanentny bonus prosperity z odkryć (akumulowany)
    this._discoveryProsperityBonus = 0;

    this._setupListeners();
  }

  // ── Nasłuch zdarzeń ─────────────────────────────────────────────────────

  _setupListeners() {
    // civDeltaYears = deltaYears × CIV_TIME_SCALE — prosperity biegnie szybciej
    EventBus.on('time:tick', ({ civDeltaYears: deltaYears }) => this._update(deltaYears));
  }

  // ── Główna pętla ────────────────────────────────────────────────────────

  _update(deltaYears) {
    if (!window.KOSMOS?.civMode) return;

    this._accumYears += deltaYears;
    if (this._accumYears < 1) return;
    const years = Math.floor(this._accumYears);
    this._accumYears -= years;

    for (let y = 0; y < years; y++) this._yearlyUpdate();
  }

  _yearlyUpdate() {
    // Outposty (pop=0) nie mają prosperity — brak konsumpcji, epok, demand
    const pop = this.civSystem?.population ?? 0;
    if (pop <= 0) return;

    const oldProsperity = this.prosperity;
    const oldEpoch = this.epoch;

    // 1. Oblicz demand
    this._calcAllDemands();

    // 2. Oblicz produkcję consumer factory
    this._updateConsumerProduction();

    // 3. Oblicz satisfaction per towar
    this._calcSatisfaction();

    // 4. Oblicz prosperity score per warstwa
    this._calcLayerScores();

    // 4b. Tick bonusów z zdarzeń losowych i dodaj do target
    for (const [sourceId, bonus] of this._eventBonuses) {
      bonus.remainingYears--;
      if (bonus.remainingYears <= 0) this._eventBonuses.delete(sourceId);
    }
    const eventBonus = this.getEventBonusTotal();
    if (eventBonus !== 0) {
      this.targetProsperity = Math.max(0, Math.min(100, this.targetProsperity + eventBonus));
    }

    // 4c. Permanentny bonus z technologii + odkryć — addytywny do targetProsperity
    const techBonus = this.techSystem?.getProsperityBonus() ?? 0;
    const permBonus = techBonus + this._discoveryProsperityBonus;
    this.targetProsperity = Math.min(100, this.targetProsperity + permBonus);

    // 4d. Bonus/koszt sieci handlowej (trade network)
    const tradeNetData = this._getTradeNetworkData();
    const tradeNetBonus = tradeNetData.bonus - tradeNetData.upkeep;
    if (tradeNetBonus !== 0) {
      this.targetProsperity = Math.min(100, this.targetProsperity + Math.max(-10, tradeNetBonus));
    }

    // 5. Zastosuj inercję: prosperity dąży do target
    const delta = (this.targetProsperity - this.prosperity) * 0.15;
    this.prosperity = Math.max(0, Math.min(100, this.prosperity + delta));

    // 6. Zarejestruj konsumpcję i produkcję w ResourceSystem
    this._syncConsumption();
    this._syncProduction();

    // 7. Emit events jeśli prosperity się zmieniło znacząco
    if (window.KOSMOS?.prosperitySystem === this) {
      const absDelta = Math.abs(this.prosperity - oldProsperity);
      if (absDelta >= 0.5) {
        EventBus.emit('prosperity:changed', {
          prosperity: this.prosperity,
          delta: this.prosperity - oldProsperity,
          planetId: this.planet?.id,
        });
      }

      // Sprawdź zmianę epoki
      const epochData = this._getCurrentEpoch();
      if (epochData.key !== oldEpoch) {
        this.epoch = epochData.key;
        EventBus.emit('epoch:changed', {
          epoch: this.epoch,
          oldEpoch,
          epochScore: this.epochScore,
        });
      }

      // Emit demand update (UI)
      EventBus.emit('consumer:demandUpdate', { demands: { ...this._consumerDemand } });

      // Shortage alerts
      for (const goodId in this._satisfaction) {
        if (this._satisfaction[goodId] < 0.3 && (this._consumerDemand[goodId] ?? 0) > 0) {
          const ratio = this._satisfaction[goodId];
          EventBus.emit('consumer:shortage', { goodId, ratio });
        }
      }
    }
  }

  // ── Obliczanie demand ───────────────────────────────────────────────────

  _calcAllDemands() {
    const pop = this.civSystem?.population ?? 0;
    const epochData = this._getCurrentEpoch();
    const unlockedGoods = epochData.unlockedGoods;
    const epochMult = epochData.demandMult;

    // Mnożniki środowiskowe z planety
    const tempKey = this._getTempKey(this.planet?.temperatureC);
    const atmoKey = this.planet?.atmosphere || 'none';
    const gravKey = this._getGravKey(this.planet?.surfaceGravity);

    const maturity = this._getMaturityFactor();

    // Wyczyść stare
    this._consumerDemand = {};

    for (const goodId of unlockedGoods) {
      const base = BASE_DEMAND[goodId] ?? 0;
      const tMult = TEMP_MULTIPLIERS[tempKey]?.[goodId] ?? 1.0;
      const aMult = ATMO_MULTIPLIERS[atmoKey]?.[goodId] ?? 1.0;
      const gMult = GRAV_MULTIPLIERS[gravKey]?.[goodId] ?? 1.0;

      this._consumerDemand[goodId] = base * tMult * aMult * gMult * epochMult * maturity * pop;
    }
  }

  _getTempKey(temperatureC) {
    if (temperatureC == null) return 'moderate';
    if (temperatureC > 77) return 'hot';
    if (temperatureC < -53) return 'cold';
    return 'moderate';
  }

  _getGravKey(surfaceGravity) {
    if (surfaceGravity == null) return 'normal';
    if (surfaceGravity < 0.4) return 'low';
    if (surfaceGravity > 1.5) return 'high';
    return 'normal';
  }

  _getMaturityFactor() {
    // Wiek kolonii (tymczasowo: totalYears jako przybliżenie)
    const age = window.KOSMOS.timeSystem?.gameTime ?? 0;
    const pop = this.civSystem?.population ?? 0;

    // Startuje od 0.3 — pionierzy mają podstawowe potrzeby od dnia 1
    // Rośnie do 1.0: ageFactor osiąga 1.0 po ~53 latach
    const ageFactor = Math.min(1.0, 0.3 + (age / 75));

    // popFactor: 0.3 przy pop=0, 1.0 przy pop>=10.5
    const popFactor = Math.min(1.0, 0.3 + (pop / 15));

    // Odległość od macierzystej — hamuje TYLKO młode/małe kolonie
    let distFactor = 1.0;
    if (pop < 15 && this.prosperity < 50) {
      const dist = this._getDistanceFromHome();
      distFactor = Math.max(0.6, 1.0 - dist * 0.03);
    }

    // ŚREDNIA zamiast mnożenia — unika katastrofy "0 × cokolwiek = 0"
    return ((ageFactor + popFactor) / 2) * distFactor;
  }

  _getTradeNetworkData() {
    // Odczytaj dane sieci handlowej z ColonyManager
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr || !this.planet) return { bonus: 0, upkeep: 0 };

    const colony = colMgr.getColony(this.planet.id);
    if (!colony) return { bonus: 0, upkeep: 0 };

    const connections = colony.activeTradeConnections ?? [];
    if (connections.length === 0) return { bonus: 0, upkeep: 0 };

    // Bonus: min(15, count * 3)
    const bonus = Math.min(15, connections.length * 3);

    // Upkeep: sum(2 * distanceFactor per połączenie)
    let upkeep = 0;
    for (const conn of connections) {
      const dist = conn.distance ?? 0;
      let distFactor;
      if (dist < 5) distFactor = 1.0;
      else if (dist < 15) distFactor = 1.5;
      else distFactor = 2.0;
      upkeep += 2 * distFactor;
    }

    return { bonus, upkeep };
  }

  _getDistanceFromHome() {
    if (!this.planet) return 0;
    try {
      // Dynamiczny import nie jest potrzebny — użyj DistanceUtils jeśli dostępny
      const home = window.KOSMOS?.homePlanet;
      if (!home || home === this.planet) return 0;
      // Prosta odległość orbitalna
      const aHome = home.orbital?.a ?? 0;
      const aPlanet = this.planet.orbital?.a ?? 0;
      return Math.abs(aHome - aPlanet);
    } catch {
      return 0;
    }
  }

  // ── Satisfaction ────────────────────────────────────────────────────────

  _calcSatisfaction() {
    // Wyczyść stare
    this._satisfaction = {};

    for (const goodId in this._consumerDemand) {
      const demand = this._consumerDemand[goodId];
      if (demand <= 0) {
        // NIE dodawaj do _satisfaction — pomijany w calcLayerSatisfaction
        continue;
      }

      // Satisfaction = ciągła zdolność pokrycia popytu (produkcja vs demand)
      // Stock NIE liczy się — jednorazowy zapas nie oznacza trwałej satysfakcji
      const production = this._consumerProduction[goodId] ?? 0;
      const ratio = production / demand;

      this._satisfaction[goodId] = this._ratioToSatisfaction(ratio);
    }
  }

  _ratioToSatisfaction(ratio) {
    // Progi z SATISFACTION_THRESHOLDS (od najwyższego)
    for (const threshold of SATISFACTION_THRESHOLDS) {
      if (ratio >= threshold.minRatio) return threshold.satisfaction;
    }
    return 0;
  }

  // ── Layer scores i prosperity ───────────────────────────────────────────

  _calcLayerScores() {
    // Wymarła kolonia — zeruj wszystko
    if ((this.civSystem?.population ?? 0) <= 0) {
      this._layerScores = { survival: 0, infrastructure: 0, functioning: 0, comfort: 0, luxury: 0 };
      this.targetProsperity = 0;
      return;
    }

    // Survival (food, water, energy) — z ResourceSystem
    const survivalSat = this._calcSurvivalSatisfaction();

    // Infrastructure (housing, employment) — z CivSystem
    const infraSat = this._calcInfrastructureSatisfaction();

    // Consumer goods layers
    const funcSat = this._calcLayerSatisfaction('functioning');
    const comfSat = this._calcLayerSatisfaction('comfort');
    const luxSat = this._calcLayerSatisfaction('luxury');

    this._layerScores = {
      survival: survivalSat,
      infrastructure: infraSat,
      functioning: funcSat,
      comfort: comfSat,
      luxury: luxSat,
    };

    this.targetProsperity =
      survivalSat * PROSPERITY_WEIGHTS.survival +
      infraSat * PROSPERITY_WEIGHTS.infrastructure +
      funcSat * PROSPERITY_WEIGHTS.functioning +
      comfSat * PROSPERITY_WEIGHTS.comfort +
      luxSat * PROSPERITY_WEIGHTS.luxury;
  }

  _calcSurvivalSatisfaction() {
    // Sprawdź bilans food, water, energy
    const pop = this.civSystem?.population ?? 1;
    let total = 0;
    let count = 0;

    // Food
    const foodStock = this.resourceSystem?.inventory?.get('food') ?? 0;
    const foodRate = this._getPerYear('food');
    const foodNeed = pop * 3.0;  // POP_CONSUMPTION.food
    if (foodNeed > 0) {
      total += this._ratioToSatisfaction((foodStock + Math.max(0, foodRate)) / foodNeed);
      count++;
    }

    // Water
    const waterStock = this.resourceSystem?.inventory?.get('water') ?? 0;
    const waterRate = this._getPerYear('water');
    const waterNeed = pop * 1.5;  // POP_CONSUMPTION.water
    if (waterNeed > 0) {
      total += this._ratioToSatisfaction((waterStock + Math.max(0, waterRate)) / waterNeed);
      count++;
    }

    // Energy — bilans (nie inventory)
    const energyBalance = this.resourceSystem?.energy?.balance ?? 0;
    const energyProd = this.resourceSystem?.energy?.production ?? 1;
    if (energyProd > 0) {
      total += this._ratioToSatisfaction((energyProd + energyBalance) / energyProd);
      count++;
    }

    return count > 0 ? total / count : 1.0;
  }

  _calcInfrastructureSatisfaction() {
    const pop = this.civSystem?.population ?? 1;
    const housing = this.civSystem?.housing ?? 0;
    const employed = this.civSystem?.employedPops ?? 0;
    const locked = this.civSystem?.lockedPops ?? 0;

    // Housing ratio
    const housingRatio = pop > 0 ? housing / pop : 1.0;
    const housingSat = this._ratioToSatisfaction(housingRatio);

    // Employment — freePops > 0 to dobrze (nie ma przeludnienia bezrobotnych)
    const totalNeeded = employed + locked;
    const empRatio = pop > 0 ? Math.min(1.5, pop / Math.max(1, totalNeeded)) : 1.0;
    const empSat = this._ratioToSatisfaction(empRatio);

    return (housingSat + empSat) / 2;
  }

  _calcLayerSatisfaction(layerKey) {
    const goods = LAYER_GOODS[layerKey];
    if (!goods || goods.length === 0) return 0;

    const epochData = this._getCurrentEpoch();
    const unlockedGoods = epochData.unlockedGoods;

    let total = 0;
    let count = 0;
    for (const goodId of goods) {
      // Licz tylko ODBLOKOWANE towary w tej epoce
      if (!unlockedGoods.includes(goodId)) continue;

      if (goodId in this._satisfaction) {
        total += this._satisfaction[goodId];
        count++;
      } else {
        // Odblokowany ale demand = 0 (np. maturity niska) → sat = 0
        total += 0;
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }

  _getPerYear(resourceId) {
    // Oblicz netto perYear dla zasobu z producentów
    const producers = this.resourceSystem?._producers;
    if (!producers) return 0;
    let sum = 0;
    for (const rates of producers.values()) {
      if (rates[resourceId]) sum += rates[resourceId];
    }
    return sum;
  }

  // ── Consumer Factory: auto-produkcja ────────────────────────────────────

  _updateConsumerProduction() {
    // Odczytaj rzeczywistą produkcję consumer goods z FactorySystem
    this._consumerProduction = {};

    const factSys = this._getFactorySystem();
    if (!factSys) return;

    const allocs = factSys.getAllocations();
    const CONSUMER_GOODS = ['basic_supplies', 'civilian_goods', 'neurostimulants'];

    for (const alloc of allocs) {
      if (!CONSUMER_GOODS.includes(alloc.commodityId)) continue;
      if (alloc.paused) continue;
      // timePerUnit = civYears na 1 sztukę; produkcja = 1 / timePerUnit per rok
      if (alloc.timePerUnit > 0) {
        this._consumerProduction[alloc.commodityId] = 1 / alloc.timePerUnit;
      }
    }
  }

  _getFactorySystem() {
    // Znajdź FactorySystem dla tej kolonii
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return null;
    for (const col of colMgr.getAllColonies()) {
      if (col.planet === this.planet || col.planetId === this.planet?.id) {
        return col.factorySystem;
      }
    }
    return null;
  }

  _getBuildingSystem() {
    // Znajdź BuildingSystem dla tej kolonii
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return null;
    for (const col of colMgr.getAllColonies()) {
      if (col.planet === this.planet || col.planetId === this.planet?.id) {
        return col.buildingSystem;
      }
    }
    return null;
  }

  _hasIngredients(recipe, productionAmount) {
    if (!this.resourceSystem) return false;
    for (const resId in recipe) {
      const needed = recipe[resId] * productionAmount;
      if ((this.resourceSystem.inventory.get(resId) ?? 0) < needed) return false;
    }
    return true;
  }

  _maxProducibleFraction(recipe, productionAmount) {
    if (!this.resourceSystem) return 0;
    let minFraction = 1.0;
    for (const resId in recipe) {
      const needed = recipe[resId] * productionAmount;
      if (needed <= 0) continue;
      const available = this.resourceSystem.inventory.get(resId) ?? 0;
      const fraction = available / needed;
      if (fraction < minFraction) minFraction = fraction;
    }
    return Math.max(0, Math.min(1, minFraction));
  }

  _consumeIngredients(recipe, productionAmount) {
    if (!this.resourceSystem) return;
    const costs = {};
    for (const resId in recipe) {
      costs[resId] = recipe[resId] * productionAmount;
    }
    this.resourceSystem.spend(costs);
  }

  // ── Rejestracja konsumpcji/produkcji w ResourceSystem ───────────────────

  _syncConsumption() {
    if (!window.KOSMOS?.civMode) return;
    // Guard: tylko aktywna kolonia rejestruje przez EventBus
    if (window.KOSMOS?.prosperitySystem !== this) return;

    const rates = {};
    for (const goodId in this._consumerDemand) {
      rates[goodId] = -this._consumerDemand[goodId];  // ujemny = konsumpcja
    }

    // Unikaj re-rejestracji identycznych stawek
    const key = JSON.stringify(rates);
    if (key === this._lastRegisteredDemand) return;
    this._lastRegisteredDemand = key;

    EventBus.emit('resource:registerProducer', {
      id: 'prosperity_consumption',
      rates,
    });
  }

  _syncProduction() {
    // Produkcja consumer goods realizowana przez FactorySystem (receive do inventory)
    // ProsperitySystem tylko odczytuje stawki do satisfaction — nie rejestruje producenta
  }

  // ── Epoki ───────────────────────────────────────────────────────────────

  _getCurrentEpoch() {
    this._recalcEpochScore();

    // Znajdź najwyższą epokę której próg spełniony
    const epochs = Object.entries(EPOCHS).reverse();
    for (const [key, data] of epochs) {
      if (this.epochScore >= data.minScore) return { ...data, key };
    }
    return { ...EPOCHS.early, key: 'early' };
  }

  _recalcEpochScore() {
    // UWAGA: tymczasowo obliczane per-kolonia; docelowo globalnie
    const techPoints = (this.techSystem?._researched?.size ?? 0) * 20;
    const avgProsperity = this.prosperity;
    const totalPop = this.civSystem?.population ?? 0;

    this.epochScore = techPoints + Math.floor(avgProsperity / 10) * 15 + Math.floor(totalPop / 5) * 10;
  }

  // ── Metody publiczne ────────────────────────────────────────────────────

  // ── Permanentny bonus z odkryć ──────────────────────────────────────

  addDiscoveryBonus(amount) {
    this._discoveryProsperityBonus += amount;
  }

  getPermanentBonus() {
    const techBonus = this.techSystem?.getProsperityBonus() ?? 0;
    return techBonus + this._discoveryProsperityBonus;
  }

  // ── Event bonuses (zdarzenia losowe) ────────────────────────────────

  addEventBonus(sourceId, delta, durationYears) {
    this._eventBonuses.set(sourceId, { delta, remainingYears: durationYears });
  }

  removeEventBonus(sourceId) {
    this._eventBonuses.delete(sourceId);
  }

  getEventBonusTotal() {
    let total = 0;
    for (const bonus of this._eventBonuses.values()) {
      total += bonus.delta;
    }
    return total;
  }

  getGrowthMultiplier() {
    for (const effect of PROSPERITY_EFFECTS) {
      if (this.prosperity <= effect.maxProsperity) return effect.growthMult;
    }
    return PROSPERITY_EFFECTS[PROSPERITY_EFFECTS.length - 1].growthMult;
  }

  getResearchMultiplier() {
    for (const effect of PROSPERITY_EFFECTS) {
      if (this.prosperity <= effect.maxProsperity) return effect.researchMult;
    }
    return PROSPERITY_EFFECTS[PROSPERITY_EFFECTS.length - 1].researchMult;
  }

  hasCrisisRisk() {
    return this.prosperity < 15;
  }

  getDemand(goodId) {
    return this._consumerDemand[goodId] ?? 0;
  }

  getProduction(goodId) {
    return this._consumerProduction[goodId] ?? 0;
  }

  getSatisfaction(goodId) {
    return this._satisfaction[goodId] ?? 0;
  }

  getLayerScores() {
    return { ...this._layerScores };
  }

  // ── Serializacja ────────────────────────────────────────────────────────

  serialize() {
    // Serializuj event bonuses jako plain object
    const eventBonuses = {};
    for (const [k, v] of this._eventBonuses) {
      eventBonuses[k] = { delta: v.delta, remainingYears: v.remainingYears };
    }
    return {
      prosperity: this.prosperity,
      targetProsperity: this.targetProsperity,
      epoch: this.epoch,
      epochScore: this.epochScore,
      consumerDemand: { ...this._consumerDemand },
      consumerProduction: { ...this._consumerProduction },
      eventBonuses,
      discoveryProsperityBonus: this._discoveryProsperityBonus,
    };
  }

  restore(data) {
    if (!data) return;
    this.prosperity = data.prosperity ?? 50;
    this.targetProsperity = data.targetProsperity ?? 50;
    this.epoch = data.epoch ?? 'early';
    this.epochScore = data.epochScore ?? 0;
    this._consumerDemand = data.consumerDemand ?? {};
    this._consumerProduction = data.consumerProduction ?? {};
    this._discoveryProsperityBonus = data.discoveryProsperityBonus ?? 0;
    // Przywróć event bonuses
    this._eventBonuses = new Map();
    if (data.eventBonuses) {
      for (const [k, v] of Object.entries(data.eventBonuses)) {
        this._eventBonuses.set(k, { delta: v.delta, remainingYears: v.remainingYears });
      }
    }
  }
}
