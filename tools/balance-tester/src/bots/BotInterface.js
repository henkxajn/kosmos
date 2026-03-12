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
  // Przy szybkim wzroście POP (interval=10) farma MUSI wygrywać z energią/research
  _proactiveFoodScore(s) {
    const pop = s.colony.population;
    const foodPerYear = s.resources.perYear.food ?? 0;
    const futureConsumption = (pop + 1) * 2.5;
    const currentConsumption = pop * 2.5;
    // ZERO produkcji food → KRYTYCZNE, buduj farmę natychmiast!
    if (foodPerYear <= 0) return 72;
    // Nie wystarczy na pop+1 (z 20% marginesem) → NAJWYŻSZY proaktywny score
    if (foodPerYear < futureConsumption * 1.2) return 68;
    // Ledwo wystarcza na obecnych (z 30% marginesem)
    if (foodPerYear < currentConsumption * 1.3) return 55;
    // Przy wyższej populacji (5+): planuj na pop+2 — więcej marginesu
    if (pop >= 5 && foodPerYear < (pop + 2) * 2.5 * 1.1) return 42;
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

  // PROAKTYWNA ENERGIA: zapas na budynki z energyCost (research_station=6, factory=5 itp.)
  _proactiveEnergyScore(s) {
    const balance = s.resources.energyBalance ?? 0;
    const solarCount = s.buildings.active.filter(b => b.buildingId === 'solar_farm').length;
    const researchCount = s.buildings.active.filter(b => b.buildingId === 'research_station').length;
    if (balance < 3) return 72; // krytycznie mało — prawie kryzys
    // Po 2 solar_farmach (energy ~10-14): wystarczy na factory(5)+research(6)
    // Nie buduj 3. solar_farm kosztem Si — pozwól mine/factory/research_station najpierw
    if (solarCount >= 2 && balance >= 5) return 0;
    // KLUCZOWE: energia na stację badawczą (energyCost=6 + margines 2)
    if (researchCount === 0 && balance < 8) return 55;
    if (balance < 5) return 45;
    if (balance < 8) return 25;
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

  // UPGRADE: ulepszaj istniejące budynki — upgrade > nowy budynek (lepsza wartość)
  // Sprawdza DOSTĘPNOŚĆ (surowce) żeby nie blokować decyzji innymi akcjami
  _upgradeScore(s) {
    const active = s.buildings.active;
    if (active.length === 0) return 0;

    const hasResearchStation = active.some(b => b.buildingId === 'research_station');
    if (!hasResearchStation) return 8;

    if (s.resources.energyBalance < 3) return 5;

    // ── FE SAVING MODE: gdy zbieramy na port kosmiczny, WSTRZYMAJ upgrade'y ──
    const hasRocketry = s.tech.researched.includes('rocketry');
    const hasLaunchPad = active.some(b => b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    if (hasRocketry && !hasLaunchPad) {
      const Fe = s.resources.inventory.Fe ?? 0;
      if (Fe < 1500) return 5;
    }

    const inv = s.resources.inventory;
    // ── MAX LEVEL CAP: ogranicz upgrade żeby oszczędzać Fe na port kosmiczny ──
    // Kopalnie: BEZ LIMITU (produkują Fe, upgrade się zwraca)
    // Inne budynki: max Lv2 przed portem (Lv3+ kosztuje setki Fe)
    const maxLevelDefault = hasLaunchPad ? 5 : 2;

    // Dynamiczny priorytet: habitat wyżej gdy housing gap mały
    const housingGap = s.colony.housing - s.colony.population;
    const upgradePriority = housingGap <= 1
      ? ['habitat', 'mine', 'farm', 'well', 'research_station', 'solar_farm', 'factory', 'shipyard']
      : ['mine', 'farm', 'well', 'research_station', 'solar_farm', 'habitat', 'factory', 'shipyard'];

    for (const bid of upgradePriority) {
      // Kopalnie: bez limitu (produkują Fe), inne: maxLevelDefault
      const maxLevel = (bid === 'mine') ? 5 : maxLevelDefault;
      const building = active.find(b => b.buildingId === bid && (b.level ?? 1) < maxLevel);
      if (!building) continue;

      const level = building.level ?? 1;
      const nextLevel = level + 1;
      // Wstępne sprawdzenie kosztów — nie blokuj decyzji gdy nie stać
      const bData = this.runtime.getBuildingsData()[bid];
      if (bData?.cost) {
        let canAfford = true;
        for (const [res, amount] of Object.entries(bData.cost)) {
          if ((inv[res] ?? 0) < Math.ceil(amount * nextLevel * 1.2)) { canAfford = false; break; }
        }
        if (!canAfford) continue; // pomiń ten budynek, sprawdź następny
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

      const levelBonus = (5 - level) * 4;
      const yieldMult = building.yieldBonus ?? 1.0;
      return Math.round((45 + levelBonus) * yieldMult);
    }
    return 0; // nic do upgrade'u (nie stać lub max level)
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

  // RESEARCH STATION: produkuje research points — KRYTYCZNA infrastruktura!
  _researchBuildScore(s) {
    const count = s.buildings.active.filter(b => b.buildingId === 'research_station').length;
    if (count >= 3) return 0;
    // Sprawdź czy stać nas energetycznie (research_station energyCost=10)
    const canAffordEnergy = s.resources.energyBalance >= 10;
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

    // Priorytet: science_vessel → colony_ship → cargo_ship → kolejne
    if (sciVessels === 0) return 45;
    if (colonyShips === 0 && s.tech.researched.includes('colonization')) return 40;
    if (cargoShips === 0 && s.tech.researched.includes('interplanetary_logistics')) return 35;
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
    // Cooldown 50 lat między koloniami (nie wysyłaj dwóch naraz)
    const yearsSinceLast = (s.gameYear ?? 0) - this._lastColonyYear;
    if (yearsSinceLast < 50) return 0;
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
    const mineCount = s.buildings.active.filter(b => b.buildingId === 'mine').length;
    const hasDeposits = s.deposits.some(d => d.remaining > 0);
    const factoryCount = s.buildings.active.filter(b => b.buildingId === 'factory').length;

    // Czy planujemy stocznię / statki?
    const hasRocketry = s.tech.researched.includes('rocketry') || s.tech.researched.includes('exploration');
    const hasShipyard = s.buildings.active.some(b => b.buildingId === 'shipyard');
    const hasLaunchPad = s.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');

    // ── SPACE PHASE: port kosmiczny wymaga OGROMNYCH ilości surowców + commodities ──
    // launch_pad BAZOWY koszt: Fe:1200, Ti:600, Cu:300
    // launch_pad COMMODITIES: hull_armor:80, electronics:60, steel_plates:120, concrete_mix:40
    // STRATEGIA: kopalnie produkują w tle. Commodities BEZ Fe/Ti produkuj od razu.
    // Fe/Ti-consuming commodities: produkuj PO JEDNYM (nie jednocześnie!) z małym buforem.
    if (hasRocketry && !hasLaunchPad) {
      const Fe = inv.Fe ?? 0;
      const Ti = inv.Ti ?? 0;
      const hullNeeded = hasShipyard ? 84 : 90;
      const elecNeeded = hasShipyard ? 63 : 67;
      const steelNeeded = hasShipyard ? 128 : 136;
      const pcNeeded = hasShipyard ? 10 : 13;

      // ZAWSZE: commodities BEZ Fe i Ti (electronics, power_cells, copper_wiring)
      if ((inv.electronics ?? 0) < elecNeeded) needs.push('electronics');
      if ((inv.power_cells ?? 0) < pcNeeded) needs.push('power_cells');
      if ((inv.copper_wiring ?? 0) < (hasShipyard ? 2 : 4)) needs.push('copper_wiring');

      // Fe-consuming commodities: produkuj gdy Fe > bazowy koszt (1200) + bufor na 1 batch
      // Fabryka zjada Fe STOPNIOWO (batch po 4 szt), kopalnie uzupełniają w tle
      // steel: Fe:8/szt × 4 = 32 Fe per batch → Fe > 1232
      // concrete: Fe:6/szt × 4 = 24 Fe per batch → Fe > 1224
      // hull_armor: Fe:6/szt × 4 = 24 Fe + Ti:8/szt × 4 = 32 Ti per batch
      const steelDone = (inv.steel_plates ?? 0) >= steelNeeded;
      const concreteDone = (inv.concrete_mix ?? 0) >= 40;
      const hullDone = (inv.hull_armor ?? 0) >= hullNeeded;

      // Sekwencyjna: steel → concrete → hull_armor (nie jednocześnie!)
      if (!steelDone && Fe > 1240) needs.push('steel_plates');
      else if (!concreteDone && Fe > 1230) needs.push('concrete_mix');
      else if (!hullDone && Fe > 1230 && Ti > 650) needs.push('hull_armor');

      return [...new Set(needs)];
    }

    // ── POST-SPACEPORT: statki potrzebują hull_armor + electronics ──
    if (hasRocketry && hasLaunchPad && hasShipyard) {
      if ((inv.hull_armor ?? 0) < 12) needs.push('hull_armor');
      if ((inv.electronics ?? 0) < 6) needs.push('electronics');
      if ((inv.power_cells ?? 0) < 6) needs.push('power_cells');
      if ((inv.steel_plates ?? 0) < 8) needs.push('steel_plates');
    }

    // ── Tier 1: ZAWSZE potrzebne (buduj rotacyjnie) ──
    if ((inv.steel_plates ?? 0) < 6) needs.push('steel_plates');
    if ((inv.copper_wiring ?? 0) < 3) needs.push('copper_wiring');
    if ((inv.polymer_composites ?? 0) < 3) needs.push('polymer_composites');
    if ((inv.concrete_mix ?? 0) < 3) needs.push('concrete_mix');

    // ── Tier 2: kontekstowe — produkuj to czego bot FAKTYCZNIE potrzebuje ──

    // Housing commodities — PRIORYTET gdy housing gap mały (proaktywnie!)
    if (housingGap <= 2) {
      if ((inv.habitat_modules ?? 0) < 3) needs.push('habitat_modules');
      if ((inv.water_recyclers ?? 0) < 2) needs.push('water_recyclers');
    }

    // Mining drills — gdy mamy złoża i chcemy kopać
    if (hasDeposits && mineCount < 3) {
      if ((inv.mining_drills ?? 0) < 3) needs.push('mining_drills');
    }

    // Power cells — paliwo + budynki + statki
    if ((inv.power_cells ?? 0) < 4) needs.push('power_cells');

    // Electronics — stacje badawcze, fabryki
    if ((inv.electronics ?? 0) < 3) needs.push('electronics');

    // Hull armor — zapas na przyszłą stocznię
    if ((inv.hull_armor ?? 0) < 2) needs.push('hull_armor');

    // Deduplikacja (na wypadek podwójnego dodania)
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
    // Nuclear jeśli ma tech
    let result = this._buildByType(runtime, 'nuclear_plant');
    if (result) return result;
    // Geothermal na wulkanie
    result = this._buildByType(runtime, 'geothermal');
    if (result) return result;
    // Solar farm (standard)
    result = this._buildByType(runtime, 'solar_farm');
    if (result) return result;
    // Coal plant — fallback jeśli nie stać na solar (tańszy na Si/Cu)
    return this._buildByType(runtime, 'coal_plant');
  }

  _researchBestTech(runtime, state) {
    if (state.tech.available.length === 0) return null;
    // Priorytet tech (odzwierciedla strategię gracza)
    const priority = [
      'metallurgy', 'hydroponics', 'efficient_solar',
      'orbital_survey',                     // gateway do rocketry + +40% research
      'rocketry',                           // odblokuj launch_pad
      'exploration',                        // odblokuj shipyard + science_vessel
      'advanced_mining', 'urban_planning',
      'nuclear_power', 'deep_drilling',
      'colonization',                       // odblokuj colony_ship
      'advanced_materials', 'genetic_engineering', 'arcology',
      'interplanetary_logistics',
      'advanced_navigation', 'space_mining',
      'ion_drives', 'emergency_protocols',
      'exotic_materials', 'food_synthesis', 'fusion_power',
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
  // Preferuj budynki na tile'ach z wyższym yieldBonus (mountains dla mine, plains dla farm)
  _upgradeBest(runtime, state) {
    const active = state.buildings.active;
    // Priorytet upgrade: mine i farm pierwsze (fundament ekonomii)
    const upgradePriority = ['mine', 'farm', 'well', 'research_station', 'solar_farm', 'factory', 'shipyard'];

    for (const bid of upgradePriority) {
      const candidates = active.filter(b => b.buildingId === bid && (b.level ?? 1) < 5);
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

  // FACTORY ALLOC: inteligentna alokacja z rotacją
  _allocateFactorySmart(runtime, state) {
    const needs = this._getNeededCommodities(state);
    if (needs.length === 0) {
      // Nic pilnego — produkuj steel jako default (jeśli stać)
      const fallback = this._canProduceCommodity('steel_plates', state) ? 'steel_plates' : 'copper_wiring';
      runtime.allocateFactory(fallback, state.factory.totalPoints);
      runtime.setFactoryTarget(fallback, 4);
      this._lastFactoryAlloc = fallback;
      this._factoryBatchCount = 0;
      return { commodityId: fallback, qty: 4 };
    }

    // FILTRUJ: usuń commodities na które nie stać (brak surowców na recept)
    const affordableNeeds = needs.filter(c => this._canProduceCommodity(c, state));

    if (affordableNeeds.length === 0) {
      // Nie stać na żaden potrzebny commodity — produkuj najtańszy co możemy
      const cheap = ['copper_wiring', 'polymer_composites', 'concrete_mix', 'steel_plates'];
      const fallback = cheap.find(c => this._canProduceCommodity(c, state));
      if (!fallback) return null; // kompletny brak surowców
      runtime.allocateFactory(fallback, state.factory.totalPoints);
      runtime.setFactoryTarget(fallback, 2);
      this._lastFactoryAlloc = fallback;
      return { commodityId: fallback, qty: 2 };
    }

    let target = affordableNeeds[0];

    // ── SPACE PHASE: dedykowana produkcja bez rotacji ──
    const hasRocketry = state.tech.researched.includes('rocketry');
    const hasLaunchPad = state.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    const inv = state.resources.inventory;

    // ── HOUSING OVERRIDE: habitat_modules mają priorytet gdy housing gap <= 0 ──
    const housingGap = state.colony.housing - state.colony.population;
    if (housingGap <= 0 && affordableNeeds.includes('habitat_modules') &&
        this._canProduceCommodity('habitat_modules', state)) {
      const totalPoints = state.factory.totalPoints;
      runtime.allocateFactory('habitat_modules', totalPoints);
      runtime.setFactoryTarget('habitat_modules', 4);
      this._lastFactoryAlloc = 'habitat_modules';
      return { commodityId: 'habitat_modules', qty: 4 };
    }
    // Water recyclers: potrzebne razem z habitat_modules dla habitat
    if (housingGap <= 1 && affordableNeeds.includes('water_recyclers') &&
        (inv.water_recyclers ?? 0) < 2 && this._canProduceCommodity('water_recyclers', state)) {
      const totalPoints = state.factory.totalPoints;
      runtime.allocateFactory('water_recyclers', totalPoints);
      runtime.setFactoryTarget('water_recyclers', 3);
      this._lastFactoryAlloc = 'water_recyclers';
      return { commodityId: 'water_recyclers', qty: 3 };
    }

    if (hasRocketry && !hasLaunchPad) {
      // Etapowa produkcja: _getNeededCommodities filtruje wg Fe/Ti progów
      // Sekwencyjna — produkuj to co needs wskazuje (steel→concrete→hull po kolei)
      const spaceTarget = affordableNeeds.find(c => this._canProduceCommodity(c, state));
      if (spaceTarget) {
        // MAŁE batche (4) żeby fabryka nie zjadła zbyt dużo Fe naraz
        const batchSize = 4;
        const totalPoints = state.factory.totalPoints;
        runtime.allocateFactory(spaceTarget, totalPoints);
        runtime.setFactoryTarget(spaceTarget, batchSize);
        this._lastFactoryAlloc = spaceTarget;
        return { commodityId: spaceTarget, qty: batchSize };
      }
    }

    // ── Normalna ROTACJA: po ukończeniu batcha tego samego commodity, przejdź do następnego ──
    if (this._lastFactoryAlloc === target && affordableNeeds.length > 1) {
      this._factoryBatchCount++;
      if (this._factoryBatchCount >= 2) {
        // Po 2 batchach tego samego → wymuś rotację
        target = affordableNeeds[1];
        this._factoryBatchCount = 0;
      }
    } else if (this._lastFactoryAlloc !== target) {
      this._factoryBatchCount = 0;
    }

    // Mniejsze batche = szybsza rotacja
    const batchSize = 4;
    const totalPoints = state.factory.totalPoints;
    runtime.allocateFactory(target, totalPoints);
    runtime.setFactoryTarget(target, batchSize);
    this._lastFactoryAlloc = target;
    return { commodityId: target, qty: batchSize };
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
