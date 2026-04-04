// BotInterface — klasa bazowa dla strategii AI
// Każdy bot ocenia priorytety i wykonuje najlepszą akcję
//
// v3: fix kaskady energia→research, lepsze water, upgrade gating, multi-kolonia

export class BotInterface {
  /**
   * @param {HeadlessRuntime} runtime
   * @param {object} config — per-bot modyfikatory wag
   */
  constructor(runtime, config = {}) {
    this.runtime = runtime;
    this.config = config;
    this.name = 'BaseBot';
    // Pamięć bota (utrzymywana między decyzjami)
    this._lastFactoryAlloc = null;
    this._factoryBatchCount = 0;    // ile batchy wyprodukowano z rzędu tego samego commodity
    this._lastColonyYear = -999;    // cooldown kolonizacji
  }

  /**
   * Podejmij decyzję na podstawie stanu gry.
   * Zwraca { action, type, params } lub null (idle).
   * @param {object} state — z runtime.getState()
   */
  decide(state) {
    // AUTO: factory produkcja — co tick sprawdzaj inventory i produkuj
    this._autoAllocateFactory(this.runtime, state);

    const priorities = this.evaluatePriorities(state);

    // Sortuj wg score malejąco
    priorities.sort((a, b) => b.score - a.score);

    // Wykonaj pierwszą akcję z score > 0
    for (const p of priorities) {
      if (p.score <= 0) continue;
      const result = p.action();
      if (result) return { type: p.type, name: p.name, ...result };
    }

    return null; // idle
  }

  /**
   * Ewaluuj priorytety — do nadpisania przez subklasy.
   * Zwraca tablicę { name, type, score, action }
   */
  evaluatePriorities(state) {
    const mod = this.config;
    const r = this.runtime;
    const s = state;
    const pop = s.colony.population;
    const foodCons = pop * 2.5;
    const waterCons = pop * 1.5;

    return [
      // ── KRYTYCZNE: kryzys food ──
      {
        name: 'fix_food_crisis',
        type: 'build',
        score: this._foodCrisisScore(s, foodCons) + (mod.food ?? 0),
        action: () => this._buildByType(r, 'farm'),
      },
      // ── KRYTYCZNE: kryzys water ──
      {
        name: 'fix_water_crisis',
        type: 'build',
        score: this._waterCrisisScore(s, waterCons) + (mod.water ?? 0),
        action: () => this._buildByType(r, 'well'),
      },
      // ── KRYTYCZNE: kryzys energy ──
      {
        name: 'fix_energy_crisis',
        type: 'build',
        score: this._energyCrisisScore(s) + (mod.energy ?? 0),
        action: () => this._buildEnergy(r, s),
      },
      // ── PROAKTYWNE: food na przyszły POP ──
      {
        name: 'proactive_food',
        type: 'build',
        score: this._proactiveFoodScore(s) + (mod.proactive_food ?? 0),
        action: () => this._buildByType(r, 'farm'),
      },
      // ── PROAKTYWNE: water na przyszły POP ──
      {
        name: 'proactive_water',
        type: 'build',
        score: this._proactiveWaterScore(s) + (mod.proactive_water ?? 0),
        action: () => this._buildByType(r, 'well'),
      },
      // ── Housing ──
      {
        name: 'build_housing',
        type: 'build',
        score: this._housingScore(s) + (mod.housing ?? 0),
        action: () => this._buildByType(r, 'habitat'),
      },
      // ── Research tech ──
      {
        name: 'research_tech',
        type: 'tech',
        score: this._techScore(s) + (mod.tech ?? 0),
        action: () => this._researchBestTech(r, s),
      },
      // ── Upgrade budynków ──
      {
        name: 'upgrade_building',
        type: 'upgrade',
        score: this._upgradeScore(s) + (mod.upgrade ?? 0),
        action: () => this._upgradeBest(r, s),
      },
      // ── Mine (reaktywna) ──
      {
        name: 'build_mine',
        type: 'build',
        score: this._mineScore(s) + (mod.mine ?? 0),
        action: () => this._buildByType(r, 'mine'),
      },
      // ── Mine (PROAKTYWNA — wykryj wyczerpywanie Fe) ──
      {
        name: 'proactive_mine',
        type: 'build',
        score: this._proactiveMineScore(s) + (mod.proactive_mine ?? 0),
        action: () => this._buildByType(r, 'mine'),
      },
      // ── Factory ──
      {
        name: 'build_factory',
        type: 'build',
        score: this._factoryScore(s) + (mod.factory ?? 0),
        action: () => this._buildByType(r, 'factory'),
      },
      // ── Research station ──
      {
        name: 'build_research',
        type: 'build',
        score: this._researchBuildScore(s) + (mod.research_station ?? 0),
        action: () => this._buildByType(r, 'research_station'),
      },
      // ── Factory allocation (inteligentna) ──
      {
        name: 'allocate_factory',
        type: 'factory',
        score: this._factoryAllocScore(s) + (mod.factoryAlloc ?? 0),
        action: () => this._allocateFactorySmart(r, s),
      },
      // ── Consumer factory (prosperity → pop growth) ──
      {
        name: 'build_consumer_factory',
        type: 'build',
        score: this._consumerFactoryScore(s) + (mod.consumer_factory ?? 0),
        action: () => this._buildByType(r, 'consumer_factory'),
      },
      // ── Launch pad (port kosmiczny) ──
      {
        name: 'build_launch_pad',
        type: 'build',
        score: this._launchPadScore(s) + (mod.launch_pad ?? 0),
        action: () => this._buildByType(r, 'launch_pad'),
      },
      // ── Shipyard ──
      {
        name: 'build_shipyard',
        type: 'build',
        score: this._shipyardScore(s) + (mod.shipyard ?? 0),
        action: () => this._buildByType(r, 'shipyard'),
      },
      // ── Build ship ──
      {
        name: 'build_ship',
        type: 'build',
        score: this._shipBuildScore(s) + (mod.ship ?? 0),
        action: () => this._buildShipSmart(r, s),
      },
      // ── Send recon ──
      {
        name: 'send_recon',
        type: 'expedition',
        score: this._reconScore(s) + (mod.recon ?? 0),
        action: () => this._sendRecon(r, s),
      },
      // ── Send colony ──
      {
        name: 'send_colony',
        type: 'expedition',
        score: this._colonyScore(s) + (mod.colony ?? 0),
        action: () => this._sendColony(r, s),
      },
      // ── Proaktywna energia (przed budową budynków) ──
      {
        name: 'proactive_energy',
        type: 'build',
        score: this._proactiveEnergyScore(s) + (mod.proactive_energy ?? 0),
        action: () => this._buildEnergy(r, s),
      },
      // ── Wyślij transport (cargo ship z prefabami → outpost) ──
      {
        name: 'send_transport',
        type: 'expedition',
        score: this._transportScore(s) + (mod.transport ?? 0),
        action: () => this._sendTransportOutpost(r, s),
      },
      // ── Upgrade outpost do kolonii (colony ship) ──
      {
        name: 'upgrade_outpost',
        type: 'expedition',
        score: this._upgradeOutpostScore(s) + (mod.upgradeOutpost ?? 0),
        action: () => this._sendColonyUpgrade(r, s),
      },
    ];
  }

  // ── Scoring functions ──────────────────────────────────────────────────────

  // KRYZYS FOOD: negatywny bilans lub niski zapas
  _foodCrisisScore(s, consumption) {
    const foodPerYear = s.resources.perYear.food ?? 0;
    const foodStock = s.resources.inventory.food ?? 0;
    if (foodPerYear < -consumption * 0.5) return 95;
    if (foodPerYear < 0) return 85;
    if (foodStock < 30 && foodPerYear < consumption * 0.3) return 72;
    return 0;
  }

  // PROAKTYWNE FOOD: planuj farmę ZANIM populacja urośnie
  // Przy CIV_TIME_SCALE=12: pop rośnie szybko, farmy muszą wyprzedzać!
  _proactiveFoodScore(s) {
    const pop = s.colony.population;
    const foodPerYear = s.resources.perYear.food ?? 0;
    const futureConsumption = (pop + 2) * 2.5;
    const currentConsumption = pop * 2.5;
    // ZERO produkcji food → KRYTYCZNE
    if (foodPerYear <= 0) return 72;
    // Nie wystarczy na pop+2 (z 20% marginesem) → WYSOKI priorytet
    if (foodPerYear < futureConsumption * 1.2) return 68;
    // Ledwo wystarcza na obecnych (z 30% marginesem)
    if (foodPerYear < currentConsumption * 1.3) return 55;
    // Przy wyższej populacji (8+): planuj na pop+3
    if (pop >= 8 && foodPerYear < (pop + 3) * 2.5 * 1.1) return 42;
    return 0;
  }

  // KRYZYS WATER
  _waterCrisisScore(s, consumption) {
    const waterPerYear = s.resources.perYear.water ?? 0;
    const waterStock = s.resources.inventory.water ?? 0;
    if (waterPerYear < -consumption * 0.5) return 92;
    if (waterPerYear < 0) return 82;
    if (waterStock < 20 && waterPerYear < consumption * 0.3) return 68;
    return 0;
  }

  // PROAKTYWNE WATER: planuj studnię na przyszły POP
  _proactiveWaterScore(s) {
    const pop = s.colony.population;
    const waterPerYear = s.resources.perYear.water ?? 0;
    const waterStock = s.resources.inventory.water ?? 0;
    const futureConsumption = (pop + 1) * 1.5;
    // ZERO produkcji water → buduj studnię natychmiast!
    if (waterPerYear <= 0) return 70;
    // Nie wystarczy na pop+1 (z 20% marginesem)
    if (waterPerYear < futureConsumption * 1.2) return 58;
    // Ledwo wystarcza na obecnych (z 30% marginesem)
    if (waterPerYear < pop * 1.5 * 1.3) return 48;
    // Niski zapas + produkcja nie daje dużego marginesu
    if (waterStock < 25 && waterPerYear < pop * 1.5 * 2.0) return 40;
    // Przy wyższej populacji: planuj na pop+2
    if (pop >= 5 && waterPerYear < (pop + 2) * 1.5 * 1.1) return 35;
    return 0;
  }

  // KRYZYS ENERGII
  _energyCrisisScore(s) {
    if (s.resources.energyBalance < -10) return 93;
    if (s.resources.energyBalance < 0) return 88;
    if (s.resources.energyBalance < 2) return 65;
    return 0;
  }

  // PROAKTYWNA ENERGIA: zapas na budynki + populację (energy: 1.0/POP/civYear)
  _proactiveEnergyScore(s) {
    const balance = s.resources.energyBalance ?? 0;
    const pop = s.colony.population;
    // Krytycznie mało — prawie brownout
    if (balance < 3) return 75;
    // Planuj na przyszłość: pop rośnie → energy consumption rośnie
    // Każdy POP + każdy nowy budynek zjada energy
    const futureNeed = (pop + 3) * 1.0 + 10; // ~10 energy na przyszłe budynki
    if (balance < futureNeed * 0.3) return 62;
    if (balance < 8) return 45;
    if (balance < 15) return 25;
    return 0;
  }

  // HOUSING: buduj habitat PROAKTYWNIE — POP rush wymaga ciągłego housing
  _housingScore(s) {
    const gap = s.colony.housing - s.colony.population;
    if (gap > 3) return 0;

    // ── SPACE SAVING: ograniczaj housing gdy zbieramy Fe na port ──
    const hasRocketry = s.tech.researched.includes('rocketry');
    const hasLaunchPad = s.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    const savingForPort = hasRocketry && !hasLaunchPad;

    const inv = s.resources.inventory;
    const hasComm = (inv.steel_plates ?? 0) >= 4 &&
                    (inv.habitat_modules ?? 0) >= 3 &&
                    (inv.water_recyclers ?? 0) >= 2 &&
                    (inv.electronics ?? 0) >= 1;
    if (!hasComm) {
      // Bez commodities: NADAL daj wysoki score gdy gap=0 (factory alloc się poprawi)
      if (gap <= 0) return savingForPort ? 35 : 50;
      if (gap <= 1) return savingForPort ? 0 : 30;
      return 0;
    }
    if (savingForPort) {
      // W trybie oszczędzania: buduj housing TYLKO gdy pop zablokowany (gap<=0)
      // ale z niższym score żeby kopalnie i fabryka miały priorytet
      if (gap <= 0) return 52; // niższe niż normalne 88 ale wyższe niż 0
      return 0; // nie buduj wyprzedzająco — oszczędzaj Fe
    }
    if (gap <= 0) return 88;   // POP zablokowany! Najwyższy priorytet
    if (gap <= 1) return 68;   // planuj wyprzedzająco
    if (gap <= 2) return 45;
    if (gap <= 3) return 22;   // margines bezpieczeństwa
    return 0;
  }

  // TECH: badaj gdy stać
  _techScore(s) {
    if (s.tech.available.length === 0) return 0;
    const cheapest = s.tech.available.reduce((a, b) => a.cost < b.cost ? a : b);
    const canAfford = s.resources.researchAmount >= cheapest.cost;

    // BOOTSTRAP: metallurgy → factory jest KRYTYCZNY early game
    // Bez metallurgy nie da się zbudować fabryki → commodities się skończą → dead end
    // Score 68: przegrywa z proactive_energy (65+12=77) ale wygrywa z research_station (58)
    const hasMetallurgy = s.tech.researched.includes('metallurgy');
    const factoryCount = s.buildings.active.filter(b => b.buildingId === 'factory').length;
    if (!hasMetallurgy && factoryCount === 0 && canAfford) {
      const metallurgy = s.tech.available.find(t => t.id === 'metallurgy');
      if (metallurgy && s.resources.researchAmount >= metallurgy.cost) return 68;
    }

    if (canAfford) return 62;
    if (s.resources.researchAmount >= cheapest.cost * 0.9) return 38;
    if (s.resources.researchAmount >= cheapest.cost * 0.7) return 22;
    return 0;
  }

  // UPGRADE: ulepszaj istniejące budynki — priorytet: factory→Lv4, mine, farm, solar
  _upgradeScore(s) {
    const active = s.buildings.active;
    if (active.length === 0) return 0;
    if (s.resources.energyBalance < 3) return 5;

    const inv = s.resources.inventory;
    const hasLaunchPad = active.some(b => b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    const housingGap = s.colony.housing - s.colony.population;

    // Priorytet upgrade'ów: mine→Lv3 MINIMUM (więcej Ti/Fe/Cu!) → factory→Lv4 → reszta
    // Mine Lv3 = 3× wydobycie → odblokuje Ti na hull_armor → cargo_ship → outposty
    const upgradePriority = [
      { bid: 'mine', targetLv: 3, priority: 70 },          // KRYTYCZNE: mine Lv3 minimum!
      { bid: 'factory', targetLv: 4, priority: 65 },       // factory Lv4 = szybka produkcja
      { bid: 'mine', targetLv: 5, priority: 55 },          // mine dalej do Lv5
      { bid: 'solar_farm', targetLv: 3, priority: 52 },    // energy na budynki
      { bid: 'farm', targetLv: 3, priority: 50 },          // food na POP
      { bid: 'consumer_factory', targetLv: 3, priority: 48 },
      { bid: 'well', targetLv: 3, priority: 45 },
      { bid: 'habitat', targetLv: housingGap <= 1 ? 3 : 2, priority: 42 },
      { bid: 'research_station', targetLv: 3, priority: 40 },
      { bid: 'shipyard', targetLv: 2, priority: 35 },
    ];

    for (const { bid, targetLv, priority } of upgradePriority) {
      // Znajdź NAJNIŻSZY level tego budynku (upgrade od najmniejszego)
      const candidates = active.filter(b => b.buildingId === bid && (b.level ?? 1) < targetLv);
      if (candidates.length === 0) continue;
      const building = candidates.reduce((a, b) => (a.level ?? 1) < (b.level ?? 1) ? a : b);

      const level = building.level ?? 1;
      const nextLevel = level + 1;
      const bData = this.runtime.getBuildingsData()[bid];
      // Sprawdź koszt surowców
      if (bData?.cost) {
        let canAfford = true;
        for (const [res, amount] of Object.entries(bData.cost)) {
          if ((inv[res] ?? 0) < Math.ceil(amount * nextLevel * 1.2)) { canAfford = false; break; }
        }
        if (!canAfford) continue;
      }
      // Sprawdź commodities (Lv3+)
      if (nextLevel >= 3 && bData?.commodityCost) {
        let canAfford = true;
        for (const [res, amount] of Object.entries(bData.commodityCost)) {
          if ((inv[res] ?? 0) < Math.ceil(amount * (nextLevel - 1))) { canAfford = false; break; }
        }
        if (!canAfford) continue;
      }
      // Sprawdź POP
      const popCost = bData?.popCost ?? 0.25;
      if (popCost > 0 && (this.runtime.civSystem?.freePops ?? 0) < popCost) continue;

      return priority;
    }
    return 0;
  }

  // MINE: buduj kopalnię jeśli są złoża I mamy wymagane commodities
  // Gracz buduje 2-3 kopalnie w pierwszych 20 latach — kopalnie = fundament
  _mineScore(s) {
    const deposits = s.deposits.filter(d => d.remaining > 0);
    if (deposits.length === 0) return 0;
    const inv = s.resources.inventory;
    // Sprawdź energię — kopalnia wymaga 2 energy balance
    const energyBalance = s.resources.energyBalance ?? 0;
    const mineEnergyCost = 2;
    if (energyBalance < mineEnergyCost) return 0; // brak energii → nie buduj
    // Sprawdź czy mamy commodities na mine (steel_plates:3, mining_drills:2, power_cells:1)
    const hasComm = (inv.steel_plates ?? 0) >= 3 &&
                    (inv.mining_drills ?? 0) >= 2 &&
                    (inv.power_cells ?? 0) >= 1;
    const mineCount = s.buildings.active.filter(b => b.buildingId === 'mine').length;
    if (!hasComm) {
      return mineCount === 0 ? 15 : 5;
    }
    // ── SPACE SAVING: więcej kopalni na port kosmiczny ──
    const hasRocketry = s.tech.researched.includes('rocketry');
    const hasLaunchPad = s.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    if (hasRocketry && !hasLaunchPad) {
      if (mineCount === 0) return 88;
      if (mineCount === 1) return 65;
      if (mineCount === 2) return 55;
      if (mineCount === 3) return 42;
      return 15;
    }
    if (mineCount >= 4) return 8;
    if (mineCount >= 3) return 25;
    if (mineCount >= 2) return 38;
    if (mineCount >= 1) return 52;
    return 58; // pierwsza kopalnia = krytyczna
  }

  // PROAKTYWNA KOPALNIA: buduj ZANIM zabraknie Fe!
  // Gracz inwestuje w kopalnie agresywnie — 2-3 kopalnie w pierwszych 20 lat
  _proactiveMineScore(s) {
    const deposits = s.deposits.filter(d => d.remaining > 0);
    if (deposits.length === 0) return 0;
    // Sprawdź energię — kopalnia wymaga 2 energy balance
    const energyBalance = s.resources.energyBalance ?? 0;
    if (energyBalance < 2) return 0; // brak energii → nie buduj, daj szansę proactive_energy

    const mineCount = s.buildings.active.filter(b => b.buildingId === 'mine').length;
    const inv = s.resources.inventory;
    const Fe = inv.Fe ?? 0;
    const hasComm = (inv.steel_plates ?? 0) >= 3 &&
                    (inv.mining_drills ?? 0) >= 2 &&
                    (inv.power_cells ?? 0) >= 1;

    // ZERO kopalni — krytyczne!
    if (mineCount === 0) {
      if (Fe < 20 || !hasComm) return 0;
      if (Fe < 80) return 88;
      if (Fe < 160) return 72;
      return 55;
    }
    // 1 kopalnia — dodaj drugą (zawsze, nie tylko gdy Fe niskie)
    if (mineCount === 1 && hasComm) {
      if (Fe < 60) return 65;
      return 45;
    }
    // ── SPACE SAVING: potrzebujemy DUŻO Fe (1200+) → buduj 3. i 4. kopalnię ──
    const hasRocketry = s.tech.researched.includes('rocketry');
    const hasLaunchPad = s.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    if (hasRocketry && !hasLaunchPad && hasComm) {
      if (mineCount === 2) return 62; // 3. kopalnia KRYTYCZNA
      if (mineCount === 3 && Fe < 800) return 48; // 4. kopalnia gdy Fe ciągle niskie
    }

    // 2 kopalnie — trzecia gdy planujemy ekspansję
    if (mineCount === 2 && hasComm && Fe < 100) return 35;
    return 0;
  }

  // FACTORY: potrzebna do produkcji commodities
  _factoryScore(s) {
    const hasMetallurgy = s.tech.researched.includes('metallurgy');
    if (!hasMetallurgy) return 0;
    const factoryCount = s.buildings.active.filter(b => b.buildingId === 'factory').length;
    if (factoryCount >= 3) return 5;
    // BOOTSTRAP: pierwsza fabryka jest KLUCZOWA — bez niej commodities się skończą → dead end
    if (factoryCount === 0) return 78; // wygrywaj z proactive_energy (65/77)
    // 2. fabryka: WAŻNA — podwaja prędkość produkcji commodities (krytyczne dla space phase)
    const hasRocketry = s.tech.researched.includes('rocketry') || s.tech.researched.includes('exploration');
    if (factoryCount === 1) {
      // Przed space phase: średni priorytet
      if (!hasRocketry) return 32;
      // W space phase: 2. fabryka jest KRYTYCZNA (hull_armor produkcja jest wąskim gardłem)
      return 52;
    }
    if (factoryCount >= 2) return 18;
    return 28;
  }

  // CONSUMER FACTORY: towary konsumpcyjne → prosperity → wzrost POP
  // Gracz buduje consumer_factory zaraz po factory — to podstawa!
  _consumerFactoryScore(s) {
    const hasMetallurgy = s.tech.researched.includes('metallurgy');
    if (!hasMetallurgy) return 0;
    const cfCount = s.buildings.active.filter(b => b.buildingId === 'consumer_factory').length;
    const factoryCount = s.buildings.active.filter(b => b.buildingId === 'factory').length;
    const energyBalance = s.resources.energyBalance ?? 0;
    if (energyBalance < 8) return 0; // consumer_factory: energyCost=8
    const prosperity = s.colony.prosperity ?? 50;
    const pop = s.colony.population;

    // Pierwsza consumer_factory — buduj zaraz po factory!
    if (cfCount === 0 && factoryCount >= 1) {
      if (prosperity < 30) return 75; // kryzys prosperity
      if (pop >= 6) return 68; // wystarczająco POPów → potrzebują consumer goods
      return 55; // nawet wcześnie — warto mieć
    }
    // Druga consumer_factory — gdy prosperity spada poniżej progu
    if (cfCount === 1) {
      if (prosperity < 25) return 65; // silny brak coverage
      if (prosperity < 40) return 45;
      return 12;
    }
    if (cfCount >= 2) return 5;
    return 0;
  }

  // RESEARCH STATION: produkuje research points — KRYTYCZNA infrastruktura!
  _researchBuildScore(s) {
    const count = s.buildings.active.filter(b => b.buildingId === 'research_station').length;
    if (count >= 3) return 0;
    // Sprawdź czy stać nas energetycznie (research_station energyCost=6)
    const canAffordEnergy = s.resources.energyBalance >= 6;
    if (count === 0) {
      // Brak stacji = brak dochodu research → priorytet!
      if (!canAffordEnergy) return 5; // nie próbuj — niech proactive_energy zadziała
      return 58; // WYSOKI: musi być przed mine (48) i factory (42)
    }
    if (count === 1) return canAffordEnergy ? 28 : 5;
    if (count === 2) return canAffordEnergy ? 12 : 0;
    return 0;
  }

  // FACTORY ALLOC: alokuj inteligentnie z rotacją (nie zawsze steel!)
  _factoryAllocScore(s) {
    if (s.factory.totalPoints <= 0) return 0;

    // Brak alokacji? Musimy natychmiast alokować!
    if (s.factory.allocations.length === 0) {
      return 68;
    }

    // Batch ukończony — trzeba zmienić/kontynuować
    const allDone = s.factory.allocations.every(a => a.targetQty > 0 && a.produced >= a.targetQty);
    if (allDone) return 55;

    // Factory STALLED: bieżąca alokacja wymaga surowca którego nie mamy
    // np. steel_plates wymaga Fe:8 ale Fe=5 → factory nic nie produkuje → zmień target!
    if (s.factory.allocations.length > 0 && !allDone) {
      const stalled = this._isFactoryStalled(s);
      if (stalled) return 60; // zmień alokację na coś co może produkować
    }

    // ── SPACE PHASE: wymuszaj produkcję commodities na port kosmiczny ──
    const hasRocketry = s.tech.researched.includes('rocketry');
    const hasLaunchPad = s.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    if (hasRocketry && !hasLaunchPad) {
      const inv = s.resources.inventory;
      const Fe = inv.Fe ?? 0;
      const Ti = inv.Ti ?? 0;

      // Jeśli fabryka JUŻ produkuje coś potrzebnego — nie przerywaj!
      const spaceCommodities = ['steel_plates', 'concrete_mix', 'hull_armor', 'electronics', 'power_cells', 'copper_wiring'];
      const currentlyProducing = this._lastFactoryAlloc;
      const batchInProgress = s.factory.allocations.some(a => a.targetQty > 0 && a.produced < a.targetQty);
      if (batchInProgress && spaceCommodities.includes(currentlyProducing)) {
        return 0; // kontynuuj obecną produkcję
      }

      // Bezpieczne (bez Fe/Ti) ZAWSZE
      if ((inv.electronics ?? 0) < 67 && this._canProduceCommodity('electronics', s)) return 56;
      if ((inv.power_cells ?? 0) < 13 && this._canProduceCommodity('power_cells', s)) return 54;
      // Sekwencja Fe-commodities z niskim progiem
      const steelDone = (inv.steel_plates ?? 0) >= 128;
      const concreteDone = (inv.concrete_mix ?? 0) >= 40;
      const hullDone = (inv.hull_armor ?? 0) >= 86;
      if (!steelDone && Fe > 1240 && this._canProduceCommodity('steel_plates', s)) return 58;
      if (steelDone && !concreteDone && Fe > 1230 && this._canProduceCommodity('concrete_mix', s)) return 58;
      if (steelDone && concreteDone && !hullDone && Fe > 1230 && Ti > 650 && this._canProduceCommodity('hull_armor', s)) return 58;
    }

    // Pilna zmiana: housing critical i nie produkujemy habitat_modules
    const housingGap = s.colony.housing - s.colony.population;
    if (housingGap <= 0 && this._lastFactoryAlloc !== 'habitat_modules' &&
        (s.resources.inventory.habitat_modules ?? 0) < 3) {
      return 52;
    }

    return 0; // produkcja w toku
  }

  // Sprawdź czy fabryka jest zablokowana — nie ma surowców na bieżący commodity
  _isFactoryStalled(s) {
    if (!this._lastFactoryAlloc) return false;
    // Lookup recipe tego commodity
    const COMMODITY_RECIPES = {
      steel_plates:       { Fe: 8, C: 4 },
      polymer_composites: { C: 12, Si: 4 },
      concrete_mix:       { Si: 10, Fe: 6, C: 4 },
      copper_wiring:      { Cu: 10, C: 2 },
      power_cells:        { Li: 6, Cu: 4, Si: 2 },
      electronics:        { Si: 8, Cu: 6, C: 2 },
      mining_drills:      { C: 10, Fe: 6, W: 2 },
      habitat_modules:    { Ti: 6, Fe: 5, Si: 4, Cu: 3 },
      water_recyclers:    { Cu: 6, Si: 4, Fe: 2 },
      hull_armor:         { Ti: 8, Fe: 6, W: 4 },
      microcircuits:      { Si: 8, Cu: 4, C: 2 },
      prefab_autonomous_mine:       { Fe: 35, Cu: 10, Ti: 10 },
      prefab_autonomous_solar_farm: { Si: 22, Cu: 12, Ti: 6, Fe: 8 },
    };
    const recipe = COMMODITY_RECIPES[this._lastFactoryAlloc];
    if (!recipe) return false;

    const inv = s.resources.inventory;
    for (const [res, amount] of Object.entries(recipe)) {
      if ((inv[res] ?? 0) < amount) return true; // brak surowca!
    }
    return false;
  }

  // PORT KOSMICZNY: buduj gdy mamy tech + WSZYSTKIE zasoby (base + commodities)
  _launchPadScore(s) {
    const hasRocketry = s.tech.researched.includes('rocketry');
    if (!hasRocketry) return 0;
    const hasPad = s.buildings.active.some(b => b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    if (hasPad) return 0;
    const inv = s.resources.inventory;
    // Sprawdź BAZOWY koszt: Fe:1200, Ti:600, Cu:300
    const hasBase = (inv.Fe ?? 0) >= 1200 && (inv.Ti ?? 0) >= 600 && (inv.Cu ?? 0) >= 300;
    if (!hasBase) return 0;
    // Sprawdź commodity koszt: hull_armor:80, electronics:60, steel_plates:120, concrete_mix:40
    const hasComm = (inv.hull_armor ?? 0) >= 80 && (inv.electronics ?? 0) >= 60 &&
                    (inv.steel_plates ?? 0) >= 120 && (inv.concrete_mix ?? 0) >= 40;
    if (!hasComm) return 0;
    // WSZYSTKO gotowe — NAJWYŻSZY priorytet!
    return 92;
  }

  _shipyardScore(s) {
    const hasRocketry = s.tech.researched.includes('rocketry');
    const hasExploration = s.tech.researched.includes('exploration');
    if (!hasRocketry && !hasExploration) return 0;
    const count = s.buildings.active.filter(b => b.buildingId === 'shipyard').length;
    if (count >= 2) return 0;
    if (count >= 1) return 10;
    // Nie sprawdzaj commodities — _buildByType i tak to zweryfikuje
    // Daj wysoki priorytet żeby bot zaczął produkować potrzebne commodities
    return 55;
  }

  // SHIP BUILD: buduj statki inteligentnie
  _shipBuildScore(s) {
    const shipyard = s.buildings.active.find(b => b.buildingId === 'shipyard');
    if (!shipyard) return 0;
    // Wymaga portu kosmicznego — bez niego statek nie poleci nigdzie
    const hasPad = s.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    if (!hasPad) return 0;
    // Nie buduj gdy stocznia już coś buduje
    const colony = this.runtime.colonyManager?.getColony(this.runtime.homePlanet?.id);
    const queues = colony?.shipQueues ?? [];
    const activeBuilds = queues.filter(q => q !== null).length;
    if (activeBuilds > 0) return 0; // czekaj na zakończenie
    const fleet = s.fleet.allVessels || [];
    const sciVessels = fleet.filter(v => v.shipId === 'science_vessel').length;
    const colonyShips = fleet.filter(v => v.shipId === 'colony_ship').length;
    const cargoShips = fleet.filter(v => v.shipId === 'cargo_ship').length;

    // Sprawdź czy mamy PEŁNY koszt na docelowy statek (surowce + commodities)
    const inv = s.resources.inventory;
    const nextShip = sciVessels === 0 ? 'science_vessel'
      : (colonyShips === 0 && s.tech.researched.includes('colonization')) ? 'colony_ship'
      : 'cargo_ship';
    // Pełne koszty (base + commodities) — muszą matchować ShipsData
    const SHIP_FULL_COSTS = {
      science_vessel: { Fe: 100, Ti: 20, Cu: 15, hull_armor: 4, electronics: 3, power_cells: 2, copper_wiring: 2 },
      colony_ship: { Fe: 200, Ti: 40, Cu: 20, Si: 20, hull_armor: 10, electronics: 5, power_cells: 4, habitat_modules: 6, copper_wiring: 3 },
      cargo_ship: { Fe: 150, Ti: 25, Cu: 15, hull_armor: 7, electronics: 2, power_cells: 4, copper_wiring: 1 },
    };
    const needed = SHIP_FULL_COSTS[nextShip] ?? {};
    for (const [res, amount] of Object.entries(needed)) {
      if ((inv[res] ?? 0) < amount) return 0; // nie stać
    }

    // Priorytet: science_vessel → cargo_ship → colony_ship → kolejne
    if (sciVessels === 0) return 45;
    if (cargoShips === 0) return 40; // cargo ship ASAP po science vessel (outposty!)
    if (colonyShips === 0 && s.tech.researched.includes('colonization')) return 38;
    if (sciVessels < 2) return 28;
    if (fleet.length < 5) return 22;
    return 5;
  }

  // RECON: wysyłaj eksplorację
  _reconScore(s) {
    const fleet = s.fleet.allVessels || [];
    const idle = fleet.filter(v =>
      v.shipId === 'science_vessel' &&
      (v.position?.state === 'docked' || v.status === 'idle')
    );
    if (idle.length === 0) return 0;
    if (s.system.exploredBodies >= s.system.totalBodies) return 0;
    // Wymaga portu kosmicznego
    const hasPad = s.buildings.active.some(b => b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    if (!hasPad) return 0;
    return 42;
  }

  // COLONY: wysyłaj colony ship na zbadaną planetę
  _colonyScore(s) {
    if (!s.tech.researched.includes('colonization')) return 0;
    // Wymaga portu kosmicznego
    const hasPad = s.buildings.active.some(b => b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    if (!hasPad) return 0;
    const fleet = s.fleet.allVessels || [];
    const colonyShip = fleet.find(v =>
      v.shipId === 'colony_ship' &&
      (v.position?.state === 'docked' || v.status === 'idle')
    );
    if (!colonyShip) return 0;
    // Cooldown 10 lat między koloniami
    const yearsSinceLast = (s.gameYear ?? 0) - this._lastColonyYear;
    if (yearsSinceLast < 10) return 0;
    // Szukaj zbadanej planety do kolonizacji
    const em = this.runtime.getEntityManager();
    const exploredPlanets = em.getAll().filter(e =>
      e.type === 'planet' && e.explored && e.id !== this.runtime.homePlanet?.id
    );
    if (exploredPlanets.length === 0) return 0;
    return 38;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Jakie commodities potrzebujemy? Kontekstowe — patrz co bot chce budować następne */
  _getNeededCommodities(s) {
    const inv = s.resources.inventory;
    const needs = [];
    const pop = s.colony.population;
    const housingGap = s.colony.housing - pop;
    const hasShipyard = s.buildings.active.some(b => b.buildingId === 'shipyard');
    const hasLaunchPad = s.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    const hasRocketry = s.tech.researched.includes('rocketry') || s.tech.researched.includes('exploration');
    const fleet = s.fleet.allVessels || [];
    const sciVessels = fleet.filter(v => v.shipId === 'science_vessel').length;
    const cargoShips = fleet.filter(v => v.shipId === 'cargo_ship').length;
    const year = s.gameYear ?? 0;

    // ── SPACE PHASE (standardowy): budowa launch_pad ──
    if (hasRocketry && !hasLaunchPad) {
      const Fe = inv.Fe ?? 0;
      const Ti = inv.Ti ?? 0;
      if ((inv.electronics ?? 0) < 67) needs.push('electronics');
      if ((inv.power_cells ?? 0) < 13) needs.push('power_cells');
      if ((inv.copper_wiring ?? 0) < 4) needs.push('copper_wiring');
      if ((inv.steel_plates ?? 0) < 136 && Fe > 1240) needs.push('steel_plates');
      else if ((inv.concrete_mix ?? 0) < 40 && Fe > 1230) needs.push('concrete_mix');
      else if ((inv.hull_armor ?? 0) < 90 && Fe > 1230 && Ti > 650) needs.push('hull_armor');
      return [...new Set(needs)];
    }

    // ══════════════════════════════════════════════════════════════
    // PRIORYTET 1: Commodities na STATKI (science_vessel → cargo_ship)
    // ══════════════════════════════════════════════════════════════
    if (hasLaunchPad && hasShipyard) {
      // science_vessel: hull_armor:4, electronics:3, power_cells:2, copper_wiring:2
      if (sciVessels === 0) {
        if ((inv.hull_armor ?? 0) < 4) needs.push('hull_armor');
        if ((inv.electronics ?? 0) < 3) needs.push('electronics');
        if ((inv.power_cells ?? 0) < 2) needs.push('power_cells');
        if ((inv.copper_wiring ?? 0) < 2) needs.push('copper_wiring');
      }
      // cargo_ship: hull_armor:7, electronics:2, power_cells:4, copper_wiring:1
      if (sciVessels >= 1 && cargoShips === 0) {
        if ((inv.hull_armor ?? 0) < 7) needs.push('hull_armor');
        if ((inv.electronics ?? 0) < 2) needs.push('electronics');
        if ((inv.power_cells ?? 0) < 4) needs.push('power_cells');
        if ((inv.copper_wiring ?? 0) < 1) needs.push('copper_wiring');
      }
    }

    // ══════════════════════════════════════════════════════════════
    // PRIORYTET 2: PREFABY na outposty (po cargo ship lub planowaniu)
    // ══════════════════════════════════════════════════════════════
    if (hasLaunchPad && (cargoShips > 0 || sciVessels >= 1)) {
      // Autonomous mine + solar → basic outpost
      if ((inv.prefab_autonomous_mine ?? 0) < 1) needs.push('prefab_autonomous_mine');
      if ((inv.prefab_autonomous_solar_farm ?? 0) < 1) needs.push('prefab_autonomous_solar_farm');
      // Microcircuits (potrzebne na prefaby T2) — produkuj jeśli brak
      if ((inv.microcircuits ?? 0) < 4) needs.push('microcircuits');
    }

    // ══════════════════════════════════════════════════════════════
    // PRIORYTET 3: Tier 1 basics (rotacyjnie)
    // ══════════════════════════════════════════════════════════════
    if ((inv.steel_plates ?? 0) < 8) needs.push('steel_plates');
    if ((inv.copper_wiring ?? 0) < 4) needs.push('copper_wiring');
    if ((inv.polymer_composites ?? 0) < 4) needs.push('polymer_composites');
    if ((inv.concrete_mix ?? 0) < 4) needs.push('concrete_mix');

    // ══════════════════════════════════════════════════════════════
    // PRIORYTET 4: Housing + mining commodities
    // ══════════════════════════════════════════════════════════════
    if (housingGap <= 2) {
      if ((inv.habitat_modules ?? 0) < 3) needs.push('habitat_modules');
      if ((inv.water_recyclers ?? 0) < 2) needs.push('water_recyclers');
    }
    if ((inv.power_cells ?? 0) < 6) needs.push('power_cells');
    if ((inv.electronics ?? 0) < 4) needs.push('electronics');
    if ((inv.hull_armor ?? 0) < 4) needs.push('hull_armor');

    // ══════════════════════════════════════════════════════════════
    // PRIORYTET 5: Zapas prefabów (po pierwszym outpoście)
    // ══════════════════════════════════════════════════════════════
    const outposts = (s.colonies ?? []).filter(c => c.isOutpost).length;
    if (outposts > 0 && cargoShips > 0) {
      if ((inv.prefab_autonomous_mine ?? 0) < 2) needs.push('prefab_autonomous_mine');
      if ((inv.prefab_autonomous_solar_farm ?? 0) < 2) needs.push('prefab_autonomous_solar_farm');
    }

    return [...new Set(needs)];
  }

  // ── Action executors ──────────────────────────────────────────────────────

  _buildByType(runtime, buildingId) {
    const tile = runtime.findBestTile(buildingId);
    if (!tile) { this._lastBuildFail = `${buildingId}:no_tile`; return null; }
    const building = runtime.getBuildingsData()[buildingId];
    if (!building) { this._lastBuildFail = `${buildingId}:no_data`; return null; }
    // Sprawdź koszt surowców
    if (building.cost && !runtime.resourceSystem.canAfford(building.cost)) { this._lastBuildFail = `${buildingId}:cost`; return null; }
    // Sprawdź commodity cost
    if (building.commodityCost && !runtime.resourceSystem.canAfford(building.commodityCost)) { this._lastBuildFail = `${buildingId}:commodity`; return null; }
    // Sprawdź tech requirement
    if (building.requires) {
      const researched = runtime.techSystem?._researched ?? new Set();
      if (!researched.has(building.requires)) { this._lastBuildFail = `${buildingId}:tech`; return null; }
    }
    // Sprawdź POP
    const freePops = runtime.civSystem.freePops ?? 0;
    if ((building.popCost ?? 0.25) > 0 && freePops < (building.popCost ?? 0.25)) { this._lastBuildFail = `${buildingId}:pop(${freePops.toFixed(2)})`; return null; }
    // Sprawdź energię
    if ((building.energyCost ?? 0) > 0 && (runtime.resourceSystem?.energy?.balance ?? 0) < building.energyCost) { this._lastBuildFail = `${buildingId}:energy`; return null; }

    runtime.buildOnTile(tile.key, buildingId);
    return { buildingId, tileKey: tile.key };
  }

  _buildEnergy(runtime, state) {
    // Nuclear jeśli ma tech (najlepsza energy)
    let result = this._buildByType(runtime, 'nuclear_plant');
    if (result) return result;
    // Coal plant PREFEROWANY — energy:18 (vs solar:10), tańszy na Si/Cu
    result = this._buildByType(runtime, 'coal_plant');
    if (result) return result;
    // Geothermal na wulkanie
    result = this._buildByType(runtime, 'geothermal');
    if (result) return result;
    // Solar farm — fallback
    return this._buildByType(runtime, 'solar_farm');
  }

  _researchBestTech(runtime, state) {
    if (state.tech.available.length === 0) return null;
    // Priorytet tech: energy/food boosty → ekspansja → zaawansowane
    // efficient_solar (+20% energy), hydroponics (+25% food), bio_recycling (-20% food consumption)
    // nuclear_power (+40% energy), food_synthesis (+20% food) — mid-game boosty
    const priority = [
      'metallurgy',                         // gateway do factory
      'efficient_solar',                    // +20% energy — PRIORYTET!
      'hydroponics',                        // +25% food — PRIORYTET!
      'bio_recycling',                      // -20% food consumption
      'orbital_survey',                     // gateway do rocketry
      'rocketry',                           // odblokuj launch_pad
      'exploration',                        // odblokuj shipyard + science_vessel
      'basic_computing',                    // gateway do automation
      'automation',                         // autonomous buildings
      'nuclear_power',                      // +40% energy — mid-game boost
      'colonization',                       // odblokuj colony_ship
      'advanced_mining', 'urban_planning',
      'deep_drilling',
      'food_synthesis',                     // +20% food (late)
      'medicine',                           // prosperity bonus
      'advanced_materials', 'genetic_engineering',
      'interplanetary_logistics',
      'advanced_navigation', 'space_mining',
      'arcology',                           // -10% food consumption + housing 8
      'ion_drives', 'emergency_protocols',
      'exotic_materials', 'fusion_power',
      'quantum_physics', 'fusion_drives', 'terraforming',
      'antimatter_propulsion',
    ];
    const available = state.tech.available;
    for (const techId of priority) {
      const tech = available.find(t => t.id === techId);
      if (tech && state.resources.researchAmount >= tech.cost) {
        runtime.researchTech(techId);
        return { techId };
      }
    }
    // Fallback: najtańszy dostępny
    const cheapest = available.reduce((a, b) => a.cost < b.cost ? a : b);
    if (state.resources.researchAmount >= cheapest.cost) {
      runtime.researchTech(cheapest.id);
      return { techId: cheapest.id };
    }
    return null;
  }

  // UPGRADE: znajdź najlepszy budynek do ulepszenia
  // Mine→Lv3 minimum! Potem factory→Lv4. Reszta do Lv3.
  _upgradeBest(runtime, state) {
    const active = state.buildings.active;
    const housingGap = state.colony.housing - state.colony.population;
    // Priorytet zsynchronizowany z _upgradeScore
    const upgradePriority = [
      { bid: 'mine', targetLv: 3 },
      { bid: 'factory', targetLv: 4 },
      { bid: 'mine', targetLv: 5 },
      { bid: 'solar_farm', targetLv: 3 },
      { bid: 'farm', targetLv: 3 },
      { bid: 'consumer_factory', targetLv: 3 },
      { bid: 'well', targetLv: 3 },
      { bid: 'habitat', targetLv: housingGap <= 1 ? 3 : 2 },
      { bid: 'research_station', targetLv: 3 },
      { bid: 'shipyard', targetLv: 2 },
    ];

    for (const { bid, targetLv } of upgradePriority) {
      const candidates = active.filter(b => b.buildingId === bid && (b.level ?? 1) < targetLv);
      if (candidates.length === 0) continue;

      // Sortuj: najniższy level, a przy równym — wyższy yieldBonus tile'a
      candidates.sort((a, b) => {
        const levelDiff = (a.level ?? 1) - (b.level ?? 1);
        if (levelDiff !== 0) return levelDiff;
        // Preferuj tile z wyższym bonusem (upgrade tam daje więcej)
        return (b.yieldBonus ?? 1.0) - (a.yieldBonus ?? 1.0);
      });
      const best = candidates[0];

      // Sprawdź koszt upgrade (level+1)
      // WAŻNE: mnożnik 1.2 (identyczny z BuildingSystem._upgrade, nie 1.5!)
      const building = runtime.getBuildingsData()[bid];
      if (!building) continue;
      const nextLevel = (best.level ?? 1) + 1;
      const upgradeCost = {};
      for (const [res, amount] of Object.entries(building.cost || {})) {
        upgradeCost[res] = Math.ceil(amount * nextLevel * 1.2);
      }
      if (!runtime.resourceSystem.canAfford(upgradeCost)) {
        this._lastBuildFail = `upgrade_${bid}:cost(Lv${nextLevel})`;
        continue;
      }

      // Sprawdź commodity cost dla upgrade level ≥ 3
      if (nextLevel >= 3 && building.commodityCost) {
        const commCost = {};
        for (const [res, amount] of Object.entries(building.commodityCost)) {
          commCost[res] = Math.ceil(amount * (nextLevel - 1));
        }
        if (!runtime.resourceSystem.canAfford(commCost)) {
          this._lastBuildFail = `upgrade_${bid}:commodity(Lv${nextLevel})`;
          continue;
        }
      }

      // Sprawdź POP (BuildingSystem._upgrade sprawdza freePops >= popCost)
      const popCost = building.popCost ?? 0.25;
      const freePops = runtime.civSystem?.freePops ?? 0;
      if (popCost > 0 && freePops < popCost) {
        this._lastBuildFail = `upgrade_${bid}:pop(free=${freePops.toFixed(2)})`;
        continue;
      }

      runtime.upgradeBuilding(best.tileKey);
      return { buildingId: bid, tileKey: best.tileKey, newLevel: nextLevel };
    }
    this._lastBuildFail = 'upgrade:none_affordable';
    return null;
  }

  // SHIP BUILD: inteligentny wybór statku
  _buildShipSmart(runtime, state) {
    // GUARD: stocznia musi istnieć
    const shipyard = state.buildings.active.find(b => b.buildingId === 'shipyard');
    if (!shipyard) return null;

    const fleet = state.fleet.allVessels || [];
    const sciVessels = fleet.filter(v => v.shipId === 'science_vessel').length;
    const colonyShips = fleet.filter(v => v.shipId === 'colony_ship').length;
    const cargoShips = fleet.filter(v => v.shipId === 'cargo_ship').length;

    let shipId;
    if (sciVessels === 0) {
      shipId = 'science_vessel';
    } else if (colonyShips === 0 && state.tech.researched.includes('colonization')) {
      shipId = 'colony_ship';
    } else if (cargoShips === 0 && state.tech.researched.includes('interplanetary_logistics')) {
      shipId = 'cargo_ship';
    } else if (sciVessels < 2) {
      shipId = 'science_vessel';
    } else {
      shipId = 'cargo_ship';
    }

    runtime.startShipBuild(shipId);
    return { shipId };
  }

  _sendRecon(runtime, state) {
    const fleet = state.fleet.allVessels || [];
    const idle = fleet.find(v =>
      v.shipId === 'science_vessel' &&
      (v.position?.state === 'docked' || v.status === 'idle')
    );
    if (!idle) return null;
    // Wyślij full_system recon (odkryje wiele ciał sekwencyjnie)
    runtime.sendExpedition('recon', 'full_system', idle.id);
    return { type: 'recon', vesselId: idle.id };
  }

  // COLONY: wyślij colony ship na zbadaną planetę
  _sendColony(runtime, state) {
    const fleet = state.fleet.allVessels || [];
    const colonyShip = fleet.find(v =>
      v.shipId === 'colony_ship' &&
      (v.position?.state === 'docked' || v.status === 'idle')
    );
    if (!colonyShip) return null;

    // Znajdź zbadaną rocky planetę do kolonizacji
    const em = runtime.getEntityManager();
    const targets = em.getAll().filter(e =>
      e.type === 'planet' && e.explored && e.id !== runtime.homePlanet?.id &&
      (e.planetType === 'rocky' || e.planetType === 'ocean' || e.planetType === 'ice')
    );
    if (targets.length === 0) return null;

    // Wybierz najbliższą
    const homePlanet = runtime.homePlanet;
    targets.sort((a, b) => {
      const distA = Math.hypot((a.x ?? 0) - (homePlanet.x ?? 0), (a.y ?? 0) - (homePlanet.y ?? 0));
      const distB = Math.hypot((b.x ?? 0) - (homePlanet.x ?? 0), (b.y ?? 0) - (homePlanet.y ?? 0));
      return distA - distB;
    });

    const target = targets[0];
    this._lastColonyYear = this.runtime.getGameYear();
    runtime.sendExpedition('colonize', target.id, colonyShip.id);
    return { type: 'colonize', targetId: target.id, vesselId: colonyShip.id };
  }

  // TRANSPORT: wyślij cargo ship z prefabami na zbadaną planetę → outpost
  _transportScore(s) {
    const fleet = s.fleet.allVessels || [];
    // Potrzebujemy idle cargo shipa
    const idleCargo = fleet.find(v =>
      (v.shipId === 'cargo_ship' || v.shipId === 'heavy_freighter' || v.shipId === 'bulk_freighter') &&
      (v.position?.state === 'docked' || v.status === 'idle')
    );
    if (!idleCargo) return 0;
    // Potrzebujemy zbadanej planety/księżyca bez kolonii
    const colonies = s.colonies ?? [];
    const colonizedIds = new Set(colonies.map(c => c.planetId));
    // Sprawdź explored bodies bez kolonii
    const em = this.runtime.getEntityManager();
    const targets = em.getAll().filter(e =>
      e.explored && !colonizedIds.has(e.id) && e.id !== this.runtime.homePlanet?.id &&
      (e.type === 'planet' || e.type === 'moon' || e.type === 'planetoid')
    );
    if (targets.length === 0) return 0;
    // Potrzebujemy prefabów: minimum autonomous_mine + autonomous_solar_farm
    const inv = s.resources.inventory;
    const hasPrefabs = (inv.prefab_autonomous_mine ?? 0) >= 1 &&
                       (inv.prefab_autonomous_solar_farm ?? 0) >= 1;
    if (!hasPrefabs) return 0;
    // Sprawdź paliwo
    if ((idleCargo.fuel?.current ?? 0) < 2) return 0;
    return 40;
  }

  _sendTransportOutpost(runtime, state) {
    const fleet = state.fleet.allVessels || [];
    const idleCargo = fleet.find(v =>
      (v.shipId === 'cargo_ship' || v.shipId === 'heavy_freighter' || v.shipId === 'bulk_freighter') &&
      (v.position?.state === 'docked' || v.status === 'idle')
    );
    if (!idleCargo) return null;

    // Znajdź cel: preferuj księżyce macierzystej planety (szybki transport!)
    // Zwłaszcza te z Pt (platyna — rzadka, wartościowa)
    const colonies = state.colonies ?? [];
    const colonizedIds = new Set(colonies.map(c => c.planetId));
    const em = runtime.getEntityManager();
    const homePlanet = runtime.homePlanet;
    const homeId = homePlanet?.id;
    const targets = em.getAll().filter(e =>
      e.explored && !colonizedIds.has(e.id) && e.id !== homeId &&
      (e.type === 'planet' || e.type === 'moon' || e.type === 'planetoid')
    );
    if (targets.length === 0) return null;

    // Sortuj: księżyce home first, potem Pt, potem odległość
    targets.sort((a, b) => {
      // Księżyce macierzystej planety mają priorytet (bliski transport!)
      const aMoon = (a.type === 'moon' && a.parentId === homeId) ? 1 : 0;
      const bMoon = (b.type === 'moon' && b.parentId === homeId) ? 1 : 0;
      if (aMoon !== bMoon) return bMoon - aMoon;
      // Pt bonus (platyna — rzadka)
      const aPt = (a.composition?.Pt > 0.01) ? 1 : 0;
      const bPt = (b.composition?.Pt > 0.01) ? 1 : 0;
      if (aPt !== bPt) return bPt - aPt;
      // Potem odległość
      const distA = Math.hypot((a.x ?? 0) - (homePlanet.x ?? 0), (a.y ?? 0) - (homePlanet.y ?? 0));
      const distB = Math.hypot((b.x ?? 0) - (homePlanet.x ?? 0), (b.y ?? 0) - (homePlanet.y ?? 0));
      return distA - distB;
    });
    const target = targets[0];

    // Załaduj prefaby na statek
    const inv = state.resources.inventory;
    const prefabsToLoad = [
      'prefab_autonomous_mine',
      'prefab_autonomous_solar_farm',
      'prefab_autonomous_spaceport',
    ];
    for (const pf of prefabsToLoad) {
      const qty = inv[pf] ?? 0;
      if (qty > 0) runtime.loadCargo(idleCargo.id, pf, Math.min(qty, 2));
    }
    // Załaduj też trochę surowców startowych
    for (const res of ['Fe', 'C', 'Si', 'Cu', 'food', 'water']) {
      const have = inv[res] ?? 0;
      const toLoad = Math.min(Math.floor(have * 0.1), 50); // max 10% lub 50
      if (toLoad > 5) runtime.loadCargo(idleCargo.id, res, toLoad);
    }

    // Wyślij transport
    runtime.sendTransport(target.id, idleCargo.id);
    return { type: 'transport', targetId: target.id, vesselId: idleCargo.id };
  }

  // UPGRADE OUTPOST: wyślij colony ship na istniejący outpost
  _upgradeOutpostScore(s) {
    const fleet = s.fleet.allVessels || [];
    const idleColonyShip = fleet.find(v =>
      v.shipId === 'colony_ship' &&
      (v.position?.state === 'docked' || v.status === 'idle')
    );
    if (!idleColonyShip) return 0;
    // Potrzebujemy istniejącego outpostu
    const outposts = (s.colonies ?? []).filter(c => c.isOutpost);
    if (outposts.length === 0) return 0;
    // Sprawdź paliwo
    if ((idleColonyShip.fuel?.current ?? 0) < 2) return 0;
    return 38;
  }

  _sendColonyUpgrade(runtime, state) {
    const fleet = state.fleet.allVessels || [];
    const colonyShip = fleet.find(v =>
      v.shipId === 'colony_ship' &&
      (v.position?.state === 'docked' || v.status === 'idle')
    );
    if (!colonyShip) return null;
    const outposts = (state.colonies ?? []).filter(c => c.isOutpost);
    if (outposts.length === 0) return null;
    // Wybierz outpost z najlepszym potencjałem (pierwszy dostępny)
    const target = outposts[0];
    runtime.sendColonyShip(target.planetId, colonyShip.id);
    this._lastColonyYear = runtime.getGameYear();
    return { type: 'colony_upgrade', targetId: target.planetId, vesselId: colonyShip.id };
  }

  // AUTO FACTORY: wywoływana automatycznie co tick (nie jako akcja bota)
  // Sprawdza inventory i ustawia produkcję wg sekwencyjnej listy
  _autoAllocateFactory(runtime, state) {
    const inv = state.resources.inventory;
    const totalPoints = state.factory.totalPoints;
    if (totalPoints <= 0) return;

    // Jeśli fabryka aktywnie produkuje → nie zmieniaj
    const allocs = state.factory.allocations ?? [];
    const active = allocs.find(a => a.points > 0 && a.targetQty > 0 && a.produced < a.targetQty);
    if (active) return;

    // Sekwencyjna lista: produkuj to czego brakuje
    const plan = [
      { id: 'steel_plates', target: 12 },
      { id: 'power_cells', target: 6 },
      { id: 'copper_wiring', target: 5 },
      { id: 'mining_drills', target: 4 },
      { id: 'electronics', target: 4 },
      { id: 'concrete_mix', target: 4 },
      { id: 'polymer_composites', target: 4 },
      { id: 'hull_armor', target: 8 },
      { id: 'habitat_modules', target: 4 },
      { id: 'water_recyclers', target: 3 },
      { id: 'microcircuits', target: 4 },
      { id: 'prefab_autonomous_mine', target: 2 },
      { id: 'prefab_autonomous_solar_farm', target: 2 },
    ];

    for (const { id, target } of plan) {
      if ((inv[id] ?? 0) >= target) continue;
      if (!this._canProduceCommodity(id, state)) continue;
      const qty = target - (inv[id] ?? 0);
      runtime.allocateFactory(id, totalPoints);
      runtime.setFactoryTarget(id, qty);
      return;
    }
    // Default: steel
    if (this._canProduceCommodity('steel_plates', state)) {
      runtime.allocateFactory('steel_plates', totalPoints);
      runtime.setFactoryTarget('steel_plates', 10);
    }
  }

  // FACTORY ALLOC: legacy action (niższy priorytet, factory auto robi swoje)
  _allocateFactorySmart(runtime, state) {
    const inv = state.resources.inventory;
    const totalPoints = state.factory.totalPoints;
    if (totalPoints <= 0) return null;

    // Jeśli fabryka już coś produkuje i nie skończyła → nie zmieniaj
    const allocs = state.factory.allocations ?? [];
    const active = allocs.find(a => a.points > 0 && a.targetQty > 0 && a.produced < a.targetQty);
    if (active) {
      return { commodityId: active.commodityId, qty: active.targetQty - active.produced };
    }

    // Sekwencyjna lista produkcji: sprawdź inventory, produkuj to czego brakuje
    const productionPlan = [
      // KROK 1: basic commodities na upgrade mine/factory
      { id: 'steel_plates', target: 10 },
      { id: 'power_cells', target: 6 },
      { id: 'copper_wiring', target: 4 },
      { id: 'mining_drills', target: 4 },
      { id: 'electronics', target: 4 },
      // KROK 2: hull_armor na statki (science_vessel:4, cargo_ship:7)
      { id: 'hull_armor', target: 8 },
      // KROK 3: concrete + polymer na budynki
      { id: 'concrete_mix', target: 4 },
      { id: 'polymer_composites', target: 4 },
      // KROK 4: housing commodities
      { id: 'habitat_modules', target: 4 },
      { id: 'water_recyclers', target: 3 },
      // KROK 5: prefaby na outposty (microcircuits + prefab autonomous)
      { id: 'microcircuits', target: 4 },
      { id: 'prefab_autonomous_mine', target: 2 },
      { id: 'prefab_autonomous_solar_farm', target: 2 },
    ];

    // Znajdź pierwszy commodity poniżej targetu
    for (const { id, target } of productionPlan) {
      const have = inv[id] ?? 0;
      if (have >= target) continue;
      if (!this._canProduceCommodity(id, state)) continue;
      const qty = target - have;
      runtime.allocateFactory(id, totalPoints);
      runtime.setFactoryTarget(id, qty);
      this._lastFactoryAlloc = id;
      return { commodityId: id, qty };
    }

    // Wszystko na targecie → odśwież steel jako default
    if (this._canProduceCommodity('steel_plates', state)) {
      runtime.allocateFactory('steel_plates', totalPoints);
      runtime.setFactoryTarget('steel_plates', 10);
      this._lastFactoryAlloc = 'steel_plates';
      return { commodityId: 'steel_plates', qty: 10 };
    }
    return null;
  }

  // Sprawdź czy stać nas na produkcję danego commodity (czy mamy surowce na receptę)
  _canProduceCommodity(commodityId, state) {
    const COMMODITY_RECIPES = {
      steel_plates:       { Fe: 8, C: 4 },
      polymer_composites: { C: 12, Si: 4 },
      concrete_mix:       { Si: 10, Fe: 6, C: 4 },
      copper_wiring:      { Cu: 10, C: 2 },
      power_cells:        { Li: 6, Cu: 4, Si: 2 },
      electronics:        { Si: 8, Cu: 6, C: 2 },
      mining_drills:      { C: 10, Fe: 6, W: 2 },
      habitat_modules:    { Ti: 6, Fe: 5, Si: 4, Cu: 3 },
      water_recyclers:    { Cu: 6, Si: 4, Fe: 2 },
      hull_armor:         { Ti: 8, Fe: 6, W: 4 },
      microcircuits:      { Si: 8, Cu: 4, C: 2 },
      prefab_autonomous_mine:       { Fe: 35, Cu: 10, Ti: 10 },
      prefab_autonomous_solar_farm: { Si: 22, Cu: 12, Ti: 6, Fe: 8 },
    };
    const recipe = COMMODITY_RECIPES[commodityId];
    if (!recipe) return true; // nieznany — spróbuj
    const inv = state.resources.inventory;
    for (const [res, amount] of Object.entries(recipe)) {
      if ((inv[res] ?? 0) < amount) return false;
    }
    return true;
  }
}
