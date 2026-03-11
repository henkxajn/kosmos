// CivilizationSystem — system POP (Etap 18: Pierwsza Cywilizacja)
//
// MODEL POPULACJI POP (dyskretne jednostki)
//   POP = jednostka populacji (start: 2)
//   Każdy budynek wymaga POP_PER_BUILDING (0.25) POPa do obsługi
//   POPy konsumują 4 zasoby: organics, water, energy, minerals
//
// WZROST POPULACJI (akumulator ułamkowy)
//   _growthProgress += growthRate per rok
//   growthRate = 1 / effectiveInterval
//   effectiveInterval = BASE_GROWTH_INTERVAL / (conditionMult × techMult)
//   conditionMult = (morale/60) × foodMod × housingMod
//   Gdy _growthProgress >= 1.0 → nowy POP
//
// ŚMIERĆ POPa
//   Głód: organics ratio < 0.02 przez STARVATION_YEARS lat → -1 POP
//   Minimum: 1 POP (nie można wyginąć)
//
// ZATRUDNIENIE
//   employedPops = suma popCost aktywnych budynków
//   lockedPops   = POPy zablokowane przez ekspedycje
//   freePops     = population - employedPops - lockedPops
//   employmentPenalty = min(1, pop / (employed + locked)) — skaluje produkcję
//
// MODEL MORALE (6 składników → suma 0–100)
//   housing 0–20, food 0–20, water 0–15, energy 0–15,
//   employment 0–15 (nowy: oparty na freeRatio), safety 0–15
//
// KRYZYSY
//   Niepokoje: morale < 30 przez 5 lat → −30% efficiency przez 10 lat
//   Głód: organics ≈ 0 przez 2 lata → emit civ:famine
//
// Komunikacja:
//   Nasłuchuje: time:tick, resource:changed, civ:addHousing, civ:removeHousing,
//               civ:employmentChanged, civ:lockPops, civ:unlockPops
//   Emituje:    civ:populationChanged, civ:moraleChanged, civ:epochChanged,
//               civ:popBorn, civ:popDied, civ:unrest, civ:unrestLifted, civ:famine

import EventBus from '../core/EventBus.js';

// ── Epoki cywilizacyjne (progi POPowe) ──────────────────────────────────────
export const CIV_EPOCHS = [
  { id: 0, namePL: 'Pierwotna',    minPop:  0 },
  { id: 1, namePL: 'Industrialna', minPop: 10 },
  { id: 2, namePL: 'Kosmiczna',    minPop: 30 },
  { id: 3, namePL: 'Międzyplan.',  minPop: 80 },
];

// ── Stałe populacji POP ─────────────────────────────────────────────────────
const DEFAULT_POP      = 2;    // startowa liczba POPów
const DEFAULT_HOUSING  = 0;    // housing pochodzi wyłącznie z budynków (colony_base = 4)
export const POP_PER_BUILDING = 0.25;  // domyślny koszt POP na budynek

// Konsumpcja per POP per rok gry (nowy system: food/water/energy)
import { POP_CONSUMPTION } from '../data/ResourcesData.js';
// POP_CONSUMPTION = { food: 3.0, water: 1.5, energy: 1.0 }

// Wzrost populacji
const BASE_GROWTH_INTERVAL = 10;  // lat na nowego POPa przy bazowych warunkach
const MIN_GROWTH_INTERVAL  = 5;   // minimalna liczba lat na POPa (cap)

// Śmierć POPa
const STARVATION_YEARS = 5;  // lat głodu do straty POPa

// ── Stałe morale ────────────────────────────────────────────────────────────
const MORALE_INERTIA = 0.12;  // ile % dystansu do celu morale zmienia się na rok

// ── Progi kryzysów ──────────────────────────────────────────────────────────
const UNREST_THRESHOLD_MORALE = 30;
const UNREST_YEARS_NEEDED     = 5;
const UNREST_DURATION         = 10;
const FAMINE_YEARS_NEEDED     = 2;
const UNREST_RECOVERY_MORALE  = 40;

// Startowe wartości
const DEFAULT_MORALE = 50;

export class CivilizationSystem {
  constructor(initialOverride = {}, techSystem = null) {
    this.techSystem = techSystem;

    // Populacja: dyskretne POPy (start: 2)
    this.population = initialOverride.population ?? DEFAULT_POP;

    // Miejsca mieszkalne (start: 4 — na 2 POPy + 2 miejsce na wzrost)
    this.housing = initialOverride.housing ?? DEFAULT_HOUSING;

    // Morale 0–100
    this.morale       = initialOverride.morale ?? DEFAULT_MORALE;
    this.moraleTarget = this.morale;

    // Komponenty morale — publiczne, czytane przez PlanetScene widget
    this.moraleComponents = { housing: 0, food: 0, water: 0, energy: 0, employment: 0, safety: 0 };

    // Epoka (indeks do CIV_EPOCHS)
    this.epochIndex = 0;

    // Snapshot surowców (z resource:changed)
    this._resourceSnap = {};

    // ── System POP ──────────────────────────────────────────────────────
    this._growthProgress  = 0;     // akumulator wzrostu 0.0–1.0
    this._starvationYears = 0;     // licznik lat głodu
    this._employedPops    = 0;     // POPy zatrudnione przez budynki
    this._lockedPops      = 0;     // POPy zablokowane (ekspedycje itp.)

    // Bufor lat i ostatni przyrost
    this._accumYears = 0;
    this._lastGrowth = 0;

    // Ostatnia zarejestrowana populacja (optymalizacja konsumpcji)
    this._registeredPop = -1;

    // ── Stan kryzysów ───────────────────────────────────────────────────
    this._lowMoraleYears      = 0;
    this._unrestActive        = false;
    this._unrestRemainingYears = 0;
    this._famineYears         = 0;
    this._famineActive        = false;

    // ── Nasłuch zdarzeń ─────────────────────────────────────────────────
    EventBus.on('time:tick', ({ deltaYears }) => this._update(deltaYears));

    // Zasoby — tylko aktywna kolonia nasłuchuje
    EventBus.on('resource:changed', ({ resources }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this._resourceSnap = resources;
    });

    // Startowa konsumpcja w ResourceSystem
    setTimeout(() => this._syncConsumption(), 0);

    // Housing z budynków Habitat — tylko aktywna kolonia
    EventBus.on('civ:addHousing', ({ amount }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this.housing += amount;
      EventBus.emit('civ:populationChanged', this._popSnapshot());
    });

    EventBus.on('civ:removeHousing', ({ amount }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this.housing = Math.max(this.population, this.housing - amount);
      EventBus.emit('civ:populationChanged', this._popSnapshot());
    });

    // Zatrudnienie z BuildingSystem (budowa/rozbiórka) — tylko aktywna kolonia
    EventBus.on('civ:employmentChanged', ({ delta }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this._employedPops = Math.max(0, this._employedPops + delta);
      EventBus.emit('civ:populationChanged', this._popSnapshot());
    });

    // Blokowanie/odblokowywanie POPów — tylko aktywna kolonia
    EventBus.on('civ:lockPops',   ({ amount }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this._lockedPops += amount;
    });
    EventBus.on('civ:unlockPops', ({ amount }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this._lockedPops = Math.max(0, this._lockedPops - amount);
    });
  }

  // ── Gettery publiczne ───────────────────────────────────────────────────

  get epochName() { return CIV_EPOCHS[this.epochIndex]?.namePL ?? 'Pierwotna'; }
  get isUnrest()  { return this._unrestActive; }
  get isFamine()  { return this._famineActive; }

  // Efektywność produkcji: morale/100
  get productionEfficiency() { return this.morale / 100; }

  // Wolne POPy dostępne do budowy/ekspedycji
  get freePops() {
    return Math.max(0, this.population - this._employedPops - this._lockedPops);
  }

  // Kara za brak siły roboczej (gdy POP zginie a budynki stoją)
  // Skaluje produkcję budynków proporcjonalnie
  get employmentPenalty() {
    const needed = this._employedPops + this._lockedPops;
    if (needed <= 0 || this.population >= needed) return 1.0;
    return this.population / needed;
  }

  // ── Serializacja ────────────────────────────────────────────────────────

  serialize() {
    return {
      popFormat:            'discrete',   // marker formatu POP (v4+)
      population:           this.population,
      housing:              this.housing,
      morale:               this.morale,
      epochIndex:           this.epochIndex,
      growthProgress:       this._growthProgress,
      starvationYears:      this._starvationYears,
      employedPops:         this._employedPops,
      lockedPops:           this._lockedPops,
      lowMoraleYears:       this._lowMoraleYears,
      unrestActive:         this._unrestActive,
      unrestRemainingYears: this._unrestRemainingYears,
      famineYears:          this._famineYears,
      famineActive:         this._famineActive,
    };
  }

  restore(data) {
    if (!data) return;
    // Po migracji SaveMigration: zawsze discrete POP (v6+)
    this.population = data.population ?? DEFAULT_POP;

    this.morale               = data.morale               ?? DEFAULT_MORALE;
    this.epochIndex           = data.epochIndex           ?? 0;
    this._growthProgress      = data.growthProgress       ?? 0;
    this._starvationYears     = data.starvationYears      ?? 0;
    // employedPops ustawiane na 0 — zostanie ponownie obliczone przez BuildingSystem.restoreFromSave()
    // lockedPops przywracane z save (EventBus guard blokuje emisję z ExpeditionSystem.restore())
    this._employedPops        = 0;
    this._lockedPops          = data.lockedPops ?? 0;
    this.housing              = DEFAULT_HOUSING;
    this._lowMoraleYears      = data.lowMoraleYears       ?? 0;
    this._unrestActive        = data.unrestActive         ?? false;
    this._unrestRemainingYears= data.unrestRemainingYears ?? 0;
    this._famineYears         = data.famineYears          ?? 0;
    this._famineActive        = data.famineActive         ?? false;
    this.moraleTarget         = this.morale;
    this._registeredPop       = -1;
    this._syncConsumption();
  }

  // ── Główna pętla ────────────────────────────────────────────────────────

  _update(deltaYears) {
    // Nie przetwarzaj populacji dopóki gracz nie przejmie cywilizacji
    if (!window.KOSMOS?.civMode) return;
    this._accumYears += deltaYears;
    if (this._accumYears < 1) return;
    const years = Math.floor(this._accumYears);
    this._accumYears -= years;
    for (let y = 0; y < years; y++) this._yearlyUpdate();
    this._syncConsumption();
  }

  _yearlyUpdate() {
    // Outposty (pop=0) nie mają głodu, morale ani wzrostu
    if (this.population <= 0) return;

    // Cache resource ratios raz na yearly update (unika wielokrotnego obliczania)
    const foodRatio = this._resourceRatio('food') || this._resourceRatio('organics');

    // 1. Oblicz moraleTarget z komponentów (przekaż cached ratios)
    //    Tech bonus wliczony do targetu (statyczny offset, nie per-year)
    const techMoraleBonus = this.techSystem?.getMoraleBonus() ?? 0;
    this.moraleTarget = Math.min(100, this._calcMoraleTarget(foodRatio) + techMoraleBonus);

    // 2. Zmiana morale (inercja — bez osobnego tech bonus)
    const inertia   = (this.moraleTarget - this.morale) * MORALE_INERTIA;
    this.morale     = Math.max(0, Math.min(100, this.morale + inertia));

    // 3. Wzrost populacji (przekaż cached foodRatio)
    this._updatePopGrowth(foodRatio);

    // 4. Śmierć POPa (głód) — przekaż cached foodRatio
    this._updatePopDeath(foodRatio);

    // 5. Kryzysy
    this._updateUnrest();
    this._updateFamine(foodRatio);

    // 6. Epoka
    this._checkEpoch();

    // 7. Emituj (tylko aktywna kolonia → UI i BuildingSystem)
    if (window.KOSMOS?.civSystem === this) {
      EventBus.emit('civ:populationChanged', this._popSnapshot());
      EventBus.emit('civ:moraleChanged', {
        morale:     this.morale,
        target:     this.moraleTarget,
        components: this.moraleComponents, // referencja — bez kopiowania (read-only w UI)
        efficiency: this.productionEfficiency,
      });
    }
  }

  // ── Wzrost populacji (akumulator) ───────────────────────────────────────

  _updatePopGrowth(foodRatio) {
    // Brak miejsca → zero wzrostu
    if (this.population >= this.housing) {
      this._lastGrowth = 0;
      return;
    }

    const orgRatio  = foodRatio ?? (this._resourceRatio('food') || this._resourceRatio('organics'));
    const foodMod   = this._foodGrowthModifier(orgRatio);
    if (foodMod <= 0) { this._lastGrowth = 0; return; }

    const housingMod = this._housingGrowthModifier();
    if (housingMod <= 0) { this._lastGrowth = 0; return; }

    const conditionMult = (this.morale / 60) * foodMod * housingMod;
    const techMult      = this.techSystem?.getPopGrowthMultiplier() ?? 1.0;

    const effectiveInterval = BASE_GROWTH_INTERVAL / Math.max(0.01, conditionMult * techMult);
    const clampedInterval   = Math.max(MIN_GROWTH_INTERVAL, effectiveInterval);
    const growthRate        = 1.0 / clampedInterval;

    this._growthProgress += growthRate;

    if (this._growthProgress >= 1.0) {
      this._growthProgress -= 1.0;
      this.population += 1;
      this._lastGrowth = 1;
      if (window.KOSMOS?.civSystem === this) {
        EventBus.emit('civ:popBorn', { population: this.population });
      }
    } else {
      this._lastGrowth = 0;
    }
  }

  // ── Śmierć POPa ────────────────────────────────────────────────────────

  _updatePopDeath(cachedFoodRatio) {
    if (this.population <= 1) return;  // minimum 1 POP

    const foodRatio = cachedFoodRatio ?? (this._resourceRatio('food') || this._resourceRatio('organics'));

    if (foodRatio < 0.02) {
      this._starvationYears++;
      if (this._starvationYears >= STARVATION_YEARS) {
        this.population = Math.max(1, this.population - 1);
        this._starvationYears = 0;
        if (window.KOSMOS?.civSystem === this) {
          EventBus.emit('civ:popDied', { cause: 'starvation', population: this.population });
        }
      }
    } else {
      this._starvationYears = 0;
    }
  }

  // ── Morale (6 składników → 0–100) ──────────────────────────────────────

  _calcMoraleTarget(cachedFoodRatio) {
    // 1. Housing (0–20)
    const popRatio = this.housing > 0 ? this.population / this.housing : 1;
    const housing  = popRatio <= 0.50 ? 20
                   : popRatio <= 0.80 ? 10
                   : 0;

    // 2. Żywność (0–20) — nowy system: food (fallback: organics)
    const orgRatio = cachedFoodRatio ?? (this._resourceRatio('food') || this._resourceRatio('organics'));
    const food     = orgRatio > 0.50 ? 20
                   : orgRatio > 0.20 ? 12
                   : orgRatio > 0.05 ? 4
                   : 0;

    // 3. Woda (0–15)
    const watRatio = this._resourceRatio('water');
    const water    = watRatio > 0.40 ? 15
                   : watRatio > 0.15 ? 9
                   : watRatio > 0.05 ? 3
                   : 0;

    // 4. Energia (0–15)
    const engRatio = this._resourceRatio('energy');
    const energy   = engRatio > 0.20 ? 15
                   : engRatio > 0.10 ? 8
                   : engRatio > 0.05 ? 3
                   : 0;

    // 5. Zatrudnienie (0–15) — niski freeRatio = pełne zatrudnienie = dobrze
    const freeRatio  = this.population > 0 ? this.freePops / this.population : 1;
    const employment = freeRatio <= 0.1 ? 15
                     : freeRatio <= 0.3 ? 8
                     : freeRatio <= 0.5 ? 3
                     : 0;

    // 6. Bezpieczeństwo (0–15)
    const stability = window.KOSMOS?.homePlanet?.orbitalStability ?? 1.0;
    const safety    = stability > 0.80 ? 15
                    : stability > 0.60 ? 8
                    : stability > 0.40 ? 3
                    : 0;

    // 7. Crowding penalty (0 do -12) — więcej POPów = gorsza jakość życia
    const crowdingPenalty = Math.min(12, Math.max(0, (this.population - 5) * 2));

    this.moraleComponents = { housing, food, water, energy, employment, safety, crowding: -crowdingPenalty };
    return housing + food + water + energy + employment + safety - crowdingPenalty;
  }

  // ── Kryzysy ─────────────────────────────────────────────────────────────

  _updateUnrest() {
    if (this._unrestActive) {
      this._unrestRemainingYears--;
      if (this._unrestRemainingYears <= 0) {
        this._unrestActive = false;
        this._lowMoraleYears = 0;
        EventBus.emit('civ:unrestLifted', {});
      }
      return;
    }

    if (this.morale < UNREST_THRESHOLD_MORALE) {
      this._lowMoraleYears++;
      if (this._lowMoraleYears >= UNREST_YEARS_NEEDED) {
        this._unrestActive         = true;
        this._unrestRemainingYears = UNREST_DURATION;
        this._lowMoraleYears       = 0;
        EventBus.emit('civ:unrest', {
          reason:       `Morale cywilizacji zbyt niskie przez ${UNREST_YEARS_NEEDED} lat`,
          yearsInCrisis: UNREST_YEARS_NEEDED,
        });
      }
    } else if (this.morale >= UNREST_RECOVERY_MORALE) {
      this._lowMoraleYears = 0;
    }
  }

  _updateFamine(organicsRatio) {
    const isStarving = organicsRatio < 0.02;

    if (isStarving) {
      this._famineYears++;
      if (this._famineYears >= FAMINE_YEARS_NEEDED && !this._famineActive) {
        this._famineActive = true;
        EventBus.emit('civ:famine', { severity: 'severe' });
      }
    } else {
      if (this._famineActive) this._famineActive = false;
      this._famineYears = 0;
    }
  }

  // ── Epoka ───────────────────────────────────────────────────────────────

  _checkEpoch() {
    for (let i = CIV_EPOCHS.length - 1; i > this.epochIndex; i--) {
      if (this.population >= CIV_EPOCHS[i].minPop) {
        this.epochIndex = i;
        EventBus.emit('civ:epochChanged', {
          epoch:   CIV_EPOCHS[i],
          message: `Cywilizacja wkroczyła w epokę: ${CIV_EPOCHS[i].namePL}`,
        });
        break;
      }
    }
  }

  // ── Konsumpcja POPów w ResourceSystem ───────────────────────────────────

  _syncConsumption() {
    // Nie rejestruj konsumpcji przed aktywacją civMode
    if (!window.KOSMOS?.civMode) return;
    const pop = this.population;
    if (pop === this._registeredPop) return;
    this._registeredPop = pop;

    // Nowy system: food/water/energy (bez minerals)
    const foodMult = this.techSystem?.getConsumptionMultiplier('food') ??
                     this.techSystem?.getConsumptionMultiplier('organics') ?? 1.0;
    const watMult  = this.techSystem?.getConsumptionMultiplier('water') ?? 1.0;

    EventBus.emit('resource:registerProducer', {
      id:    'civilization_consumption',
      rates: {
        food:   -(pop * POP_CONSUMPTION.food   * foodMult),
        water:  -(pop * POP_CONSUMPTION.water  * watMult),
        energy: -(pop * POP_CONSUMPTION.energy),
      },
    });
  }

  /**
   * Wymuś rejestrację konsumpcji bezpośrednio w podanym ResourceSystem.
   * Używane po restore(), gdy EventBus guard blokuje emit (KOSMOS jeszcze nie swapnięty).
   */
  forceConsumptionSync(resourceSystem) {
    if (!resourceSystem) return;
    const pop = this.population;
    if (pop <= 0) return;
    this._registeredPop = pop;

    const foodMult = this.techSystem?.getConsumptionMultiplier('food') ??
                     this.techSystem?.getConsumptionMultiplier('organics') ?? 1.0;
    const watMult  = this.techSystem?.getConsumptionMultiplier('water') ?? 1.0;

    resourceSystem.registerProducer('civilization_consumption', {
      food:   -(pop * POP_CONSUMPTION.food   * foodMult),
      water:  -(pop * POP_CONSUMPTION.water  * watMult),
      energy: -(pop * POP_CONSUMPTION.energy),
    });
  }

  // ── Pomocnicze ──────────────────────────────────────────────────────────

  _resourceRatio(key) {
    const res = this._resourceSnap[key];
    if (!res) return 0;
    // Nowy system: brak capacity (unlimited) — obliczamy ratio z perYear i amount
    if (!res.capacity || res.capacity <= 0 || res.capacity >= 99999) {
      // Dla inventory resources: ratio = ilość / (roczna konsumpcja × 10)
      // Daje 1.0 gdy mamy zapas na 10 lat konsumpcji
      const consumption = Math.abs(res.perYear < 0 ? res.perYear : 0);
      if (consumption <= 0) return res.amount > 0 ? 1.0 : 0;
      return Math.min(1.0, res.amount / (consumption * 10));
    }
    return res.amount / res.capacity;
  }

  // Modyfikator wzrostu na podstawie zapasów jedzenia
  _foodGrowthModifier(orgRatio) {
    if (orgRatio > 0.60) return 1.5;   // nadwyżka
    if (orgRatio > 0.30) return 1.0;   // wystarczy
    if (orgRatio > 0.10) return 0.4;   // racjonowanie
    return 0.0;                         // głód = zero wzrostu
  }

  // Modyfikator wzrostu na podstawie dostępnego housingu
  _housingGrowthModifier() {
    if (this.housing <= 0) return 0.0;
    const ratio = this.population / this.housing;
    if (ratio < 0.70) return 1.3;  // dużo miejsca
    if (ratio < 1.00) return 1.0;  // wystarczy
    return 0.0;                     // brak miejsca
  }

  // Snapshot dla civ:populationChanged
  _popSnapshot() {
    return {
      population:     this.population,
      housing:        this.housing,
      growth:         this._lastGrowth,
      growthProgress: this._growthProgress,
      freePops:       this.freePops,
      employedPops:   this._employedPops,
      lockedPops:     this._lockedPops,
      morale:         this.morale,
      moraleTarget:   this.moraleTarget,
      efficiency:     this.productionEfficiency,
      epoch:          this.epochName,
      isUnrest:       this._unrestActive,
      isFamine:       this._famineActive,
    };
  }
}
