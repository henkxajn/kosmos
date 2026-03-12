// MetricsCollector — centralna akumulacja danych per run
// Zbiera time series, milestones, countery

export class MetricsCollector {
  /**
   * @param {string} runId — unikalny id runu
   * @param {string} botName — nazwa bota
   * @param {number} seed — seed PRNG
   */
  constructor(runId, botName, seed) {
    this.runId = runId;
    this.botName = botName;
    this.seed = seed;

    // ── Time series (próbkowane co SAMPLE_INTERVAL lat) ──
    this.SAMPLE_INTERVAL = 5; // lat gry
    this._lastSampleYear = -this.SAMPLE_INTERVAL;

    this.timeSeries = {
      gameYear: [],
      population: [],
      morale: [],
      housing: [],
      Fe: [], C: [], Si: [], Cu: [], Ti: [], Li: [],
      food: [], water: [],
      energyBalance: [],
      researchPerYear: [],
      researchAmount: [],
      buildingCount: [],
      techCount: [],
      colonyCount: [],
    };

    // ── Milestones (rok gry) ──
    this.milestones = {
      firstFarm: null,
      firstMine: null,
      firstFactory: null,
      firstResearchStation: null,
      firstHabitat: null,
      firstShipyard: null,
      firstShip: null,
      firstRecon: null,
      firstColony: null,
      pop5: null, pop10: null, pop20: null, pop50: null,
      techMetallurgy: null, techRocketry: null,
      techExploration: null, techColonization: null,
      epochIndustrial: null, epochSpace: null,
      energyPositive: null,
      foodSelfSufficient: null,
      firstCrisis: null, firstFamine: null, firstPopDeath: null,
    };

    // ── Countery ──
    this.counters = {
      totalBuildings: 0,
      totalDemolished: 0,
      totalUpgrades: 0,
      techsResearched: 0,
      expeditionsSent: 0,
      expeditionsDisaster: 0,
      coloniesFounded: 0,
      outpostsFounded: 0,
      popBirths: 0,
      popDeaths: 0,
      crisisUnrest: 0,
      crisisFamine: 0,
      shipsBuilt: 0,
      reconMissions: 0,
      shortageEvents: {},
    };

    // ── Decision log ──
    this.decisionSummary = {
      totalDecisions: 0,
      buildDecisions: 0,
      techDecisions: 0,
      expeditionDecisions: 0,
      factoryDecisions: 0,
      idleYears: 0,
    };

    // ── Aktualny stan (cache dla time series) ──
    this._currentState = null;
    this._gameYear = 0;
    this._energyWasPositive = false;
    this._foodWasSufficient = false;
  }

  /** Wywoływany co tick (z EventBusBridge) */
  onTick(gameTime) {
    this._gameYear = gameTime;
  }

  /** Aktualizuj cache stanu (wywoływane z SuiteRunner po bot.decide) */
  updateState(state) {
    this._currentState = state;
    this._gameYear = state.gameYear;

    // Próbkuj time series
    if (this._gameYear - this._lastSampleYear >= this.SAMPLE_INTERVAL) {
      this._sampleTimeSeries(state);
      this._lastSampleYear = this._gameYear;
    }

    // Sprawdź milestones ciągłe
    if (!this._energyWasPositive && state.resources.energyBalance > 0) {
      this._energyWasPositive = true;
      this._setMilestone('energyPositive');
    }
    if (!this._foodWasSufficient && (state.resources.perYear.food ?? 0) > 0) {
      this._foodWasSufficient = true;
      this._setMilestone('foodSelfSufficient');
    }
  }

  /** Próbkuj time series */
  _sampleTimeSeries(state) {
    const ts = this.timeSeries;
    ts.gameYear.push(Math.round(state.gameYear));
    ts.population.push(state.colony.population);
    ts.morale.push(Math.round(state.colony.morale));
    ts.housing.push(state.colony.housing);
    ts.Fe.push(Math.round(state.resources.inventory.Fe ?? 0));
    ts.C.push(Math.round(state.resources.inventory.C ?? 0));
    ts.Si.push(Math.round(state.resources.inventory.Si ?? 0));
    ts.Cu.push(Math.round(state.resources.inventory.Cu ?? 0));
    ts.Ti.push(Math.round(state.resources.inventory.Ti ?? 0));
    ts.Li.push(Math.round(state.resources.inventory.Li ?? 0));
    ts.food.push(Math.round(state.resources.inventory.food ?? 0));
    ts.water.push(Math.round(state.resources.inventory.water ?? 0));
    ts.energyBalance.push(Number((state.resources.energyBalance ?? 0).toFixed(1)));
    ts.researchPerYear.push(Number((state.resources.researchPerYear ?? 0).toFixed(1)));
    ts.researchAmount.push(Math.round(state.resources.researchAmount ?? 0));
    ts.buildingCount.push(state.buildings.active.length);
    ts.techCount.push(state.tech.researched.length);
    ts.colonyCount.push(1); // TODO: multi-kolonia tracking
  }

  // ── Event handlers (z EventBusBridge) ──────────────────────────────────────

  onResourceChanged(resources, inventory) {
    // Dane przechwycone w updateState — tu nic nie robimy
  }

  onShortage(resource, deficit) {
    this.counters.shortageEvents[resource] =
      (this.counters.shortageEvents[resource] || 0) + 1;
  }

  onPopBorn(population) {
    this.counters.popBirths++;
    if (!this.milestones.pop5 && population >= 5) this._setMilestone('pop5');
    if (!this.milestones.pop10 && population >= 10) this._setMilestone('pop10');
    if (!this.milestones.pop20 && population >= 20) this._setMilestone('pop20');
    if (!this.milestones.pop50 && population >= 50) this._setMilestone('pop50');
  }

  onPopDied(cause, population) {
    this.counters.popDeaths++;
    this._setMilestone('firstPopDeath');
  }

  onEpochChanged(epoch) {
    if (epoch === 1) this._setMilestone('epochIndustrial');
    if (epoch === 2) this._setMilestone('epochSpace');
  }

  onCrisis(type) {
    if (type === 'unrest') {
      this.counters.crisisUnrest++;
      this._setMilestone('firstCrisis');
    }
    if (type === 'famine') {
      this.counters.crisisFamine++;
      this._setMilestone('firstFamine');
    }
  }

  onCrisisLifted(type) {
    // Tracking recovery — na razie tylko counter
  }

  onTechResearched(techId) {
    this.counters.techsResearched++;
    const map = {
      metallurgy: 'techMetallurgy',
      rocketry: 'techRocketry',
      exploration: 'techExploration',
      colonization: 'techColonization',
    };
    if (map[techId]) this._setMilestone(map[techId]);
  }

  onBuildResult(success, buildingId, reason) {
    if (success) {
      this.counters.totalBuildings++;
      const map = {
        farm: 'firstFarm', mine: 'firstMine', factory: 'firstFactory',
        research_station: 'firstResearchStation', habitat: 'firstHabitat',
        shipyard: 'firstShipyard',
      };
      if (map[buildingId]) this._setMilestone(map[buildingId]);
    }
  }

  onConstructionComplete(buildingId) {
    // Budowa ukończona — milestone już ustawiony w onBuildResult
  }

  onUpgrade(buildingId, level) {
    this.counters.totalUpgrades++;
  }

  onDemolish(success, downgrade) {
    if (success) {
      if (downgrade) this.counters.totalUpgrades--; // downgrade = cofnięcie upgrade'u
      else this.counters.totalDemolished++;
    }
  }

  onShipCompleted(shipId) {
    this.counters.shipsBuilt++;
    this._setMilestone('firstShip');
  }

  onReconComplete(scope, discovered) {
    this.counters.reconMissions++;
    this._setMilestone('firstRecon');
  }

  onExpeditionDisaster(expedition) {
    this.counters.expeditionsDisaster++;
  }

  onColonyFounded(planetId) {
    this.counters.coloniesFounded++;
    this._setMilestone('firstColony');
  }

  onOutpostFounded(colony) {
    this.counters.outpostsFounded++;
  }

  onMissionReport(expedition, gained, multiplier) {
    this.counters.expeditionsSent++;
  }

  // ── Decision tracking (wywoływane z SuiteRunner) ──

  recordDecision(type) {
    this.decisionSummary.totalDecisions++;
    if (type === 'build' || type === 'upgrade') this.decisionSummary.buildDecisions++;
    else if (type === 'tech') this.decisionSummary.techDecisions++;
    else if (type === 'expedition') this.decisionSummary.expeditionDecisions++;
    else if (type === 'factory') this.decisionSummary.factoryDecisions++;
    else if (type === 'idle') this.decisionSummary.idleYears++;
  }

  // ── Helper ──

  _setMilestone(name) {
    if (this.milestones[name] === null) {
      this.milestones[name] = Math.round(this._gameYear);
    }
  }

  /** Finalizuj dane i zwróć kompletny raport runu */
  finalize(finalState) {
    return {
      runId: this.runId,
      seed: this.seed,
      botName: this.botName,
      timeSeries: this.timeSeries,
      milestones: this.milestones,
      counters: this.counters,
      decisionSummary: this.decisionSummary,
      finalState: {
        gameYear: finalState.gameYear,
        population: finalState.colony.population,
        morale: finalState.colony.morale,
        epoch: finalState.colony.epoch,
        techsResearched: finalState.tech.researched,
        buildings: this._countBuildings(finalState.buildings.active),
        buildingLevels: this._countBuildingLevels(finalState.buildings.active),
        colonyCount: 1, // TODO
        exploredBodies: finalState.system?.exploredBodies ?? 0,
        totalBodies: finalState.system?.totalBodies ?? 0,
        isAlive: finalState.colony.population > 0,
        isStable: !finalState.colony.isUnrest && !finalState.colony.isFamine,
        isGameOver: finalState.isGameOver,
      },
    };
  }

  _countBuildings(active) {
    const counts = {};
    for (const b of active) {
      counts[b.buildingId] = (counts[b.buildingId] || 0) + 1;
    }
    return counts;
  }

  _countBuildingLevels(active) {
    const levels = {};
    for (const b of active) {
      const key = b.buildingId;
      if (!levels[key]) levels[key] = [];
      levels[key].push(b.level ?? 1);
    }
    return levels;
  }
}
