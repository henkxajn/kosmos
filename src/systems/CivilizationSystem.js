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
//   effectiveInterval = BASE_GROWTH_INTERVAL / (conditionMult × techMult × popScale)
//   conditionMult = prosperityGrowthMult × foodMod × housingMod
//   popScale = 1 / (1 + population / POP_SCALING_HALF) — logistyczne spowolnienie
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
// KRYZYSY
//   Niepokoje: prosperity < 15 przez 5 lat → −30% efficiency przez 10 lat
//   Głód: organics ≈ 0 przez 2 lata → emit civ:famine
//
// Komunikacja:
//   Nasłuchuje: time:tick, resource:changed, civ:addHousing, civ:removeHousing,
//               civ:employmentChanged, civ:lockPops, civ:unlockPops
//   Emituje:    civ:populationChanged, civ:epochChanged,
//               civ:popBorn, civ:popDied, civ:unrest, civ:unrestLifted, civ:famine

import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import { MOVEMENT_TYPES, IDENTITY_WEIGHTS, RESOLUTION_OPTIONS } from '../data/MovementsData.js';

// ── Epoki cywilizacyjne (progi POPowe) ──────────────────────────────────────
export const CIV_EPOCHS = [
  { id: 0, namePL: 'Pierwotna',    key: 'epoch.primitive',      minPop:  0 },
  { id: 1, namePL: 'Industrialna', key: 'epoch.industrial',     minPop: 10 },
  { id: 2, namePL: 'Kosmiczna',    key: 'epoch.space',          minPop: 30 },
  { id: 3, namePL: 'Międzyplan.',  key: 'epoch.interplanetary', minPop: 80 },
];

// ── Stałe populacji POP ─────────────────────────────────────────────────────
const DEFAULT_POP      = 2;    // startowa liczba POPów
const DEFAULT_HOUSING  = 0;    // housing pochodzi wyłącznie z budynków (colony_base = 4)
export const POP_PER_BUILDING = 0.25;  // domyślny koszt POP na budynek

// Konsumpcja per POP per rok gry (nowy system: food/water/energy)
import { POP_CONSUMPTION } from '../data/ResourcesData.js';
// POP_CONSUMPTION = { food: 3.0, water: 1.5, energy: 1.0 }

// Wzrost populacji
const BASE_GROWTH_INTERVAL = 12;  // lat na nowego POPa przy bazowych warunkach
const MIN_GROWTH_INTERVAL  = 8;   // minimalna liczba lat na POPa (cap)
const POP_SCALING_HALF     = 20;  // populacja przy której wzrost spada o 50% (logistyczny)

// Śmierć POPa
const STARVATION_YEARS = 5;  // lat głodu do straty POPa

// ── Progi kryzysów ──────────────────────────────────────────────────────────
const UNREST_PROSPERITY_THRESHOLD = 15;  // prosperity poniżej = ryzyko niepokojów
const UNREST_YEARS_NEEDED     = 5;
const UNREST_DURATION         = 10;
const FAMINE_YEARS_NEEDED     = 2;
const UNREST_RECOVERY_PROSPERITY = 25;   // prosperity powyżej = koniec licznika

// ── Domyślna struktura strat ──────────────────────────────────────────────
const DEFAULT_STRATA = () => ({
  laborer:    { count: 0, growthProgress: 0, satisfaction: 65 },
  miner:      { count: 0, growthProgress: 0, satisfaction: 55 },
  worker:     { count: 0, growthProgress: 0, satisfaction: 60 },
  scientist:  { count: 0, growthProgress: 0, satisfaction: 60 },
  merchant:   { count: 0, growthProgress: 0, satisfaction: 55 },
  engineer:   { count: 0, growthProgress: 0, satisfaction: 60 },
  bureaucrat: { count: 0, growthProgress: 0, satisfaction: 65 },
});

export const STRATA_TYPES = ['laborer', 'miner', 'worker', 'scientist', 'merchant', 'engineer', 'bureaucrat'];

export class CivilizationSystem {
  constructor(initialOverride = {}, techSystem = null, planet = null) {
    this.techSystem = techSystem;
    this.planet = planet;  // referencja do planety — potrzebna do sprawdzania atmosfery
    this.resourceSystem = null;  // ustawiane przez ColonyManager / GameScene
    this.buildingSystem = null;  // ustawiane przez ColonyManager — potrzebne do strata demand
    this._colonyId = planet?.id ?? null;  // ID planety (kolonyId)

    // Populacja: strata (typowane grupy robocze)
    this._initStrata(initialOverride.population ?? DEFAULT_POP);

    // Miejsca mieszkalne (start: 4 — na 2 POPy + 2 miejsce na wzrost)
    this.housing = initialOverride.housing ?? DEFAULT_HOUSING;

    // Identity + Loyalty + Movements (Faza 8 — defaults)
    this.identity          = { score: 0, events: [], dominantType: 'laborer', traits: [] };
    this._loyaltyModifiers = [];
    this.activeMovements   = [];

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
    this._lowProsperityYears  = 0;
    this._unrestActive        = false;
    this._unrestRemainingYears = 0;
    this._famineYears         = 0;
    this._famineActive        = false;

    // ── Nasłuch zdarzeń ─────────────────────────────────────────────────
    // civDeltaYears = deltaYears × CIV_TIME_SCALE — wzrost POP, kryzysy biegną szybciej
    EventBus.on('time:tick', ({ civDeltaYears: deltaYears }) => this._update(deltaYears));

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

    // Rozwiazanie ruchu spolecznego (z UI — EventChoiceModal)
    EventBus.on('civ:resolveMovement', ({ movementType, resolutionId }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this.resolveMovement(movementType, resolutionId);
    });
  }

  // ── Publiczne metody modyfikacji stanu (bezpośrednie wywołania, bez EventBus) ──

  addHousing(amount) {
    this.housing += amount;
    EventBus.emit('civ:populationChanged', this._popSnapshot());
  }

  removeHousing(amount) {
    this.housing = Math.max(this.population, this.housing - amount);
    EventBus.emit('civ:populationChanged', this._popSnapshot());
  }

  changeEmployment(delta) {
    this._employedPops = Math.max(0, this._employedPops + delta);
    EventBus.emit('civ:populationChanged', this._popSnapshot());
  }

  lockPops(amount) {
    this._lockedPops += amount;
  }

  unlockPops(amount) {
    this._lockedPops = Math.max(0, this._lockedPops - amount);
  }

  // ── Strata: inicjalizacja i mutacja ─────────────────────────────────────

  /** Inicjalizacja strat — startowa populacja trafia do laborer */
  _initStrata(totalPop) {
    this.strata = DEFAULT_STRATA();
    this.strata.laborer.count = totalPop;
  }

  /** Getter backwards-compatible: suma count ze wszystkich strat */
  get population() {
    let sum = 0;
    for (const s of Object.values(this.strata)) sum += s.count;
    return sum;
  }

  /** Setter safety-net: przechwytuje stare przypisania `civSystem.population = X` */
  set population(val) {
    this.setPopulation(val);
  }

  /** Ustaw całkowitą populację (rozdziel proporcjonalnie lub do laborer) */
  setPopulation(total) {
    const current = this.population;
    if (total === current) return;
    if (current <= 0 || total <= 0) {
      // Reset: wszystko do laborer
      for (const s of Object.values(this.strata)) s.count = 0;
      this.strata.laborer.count = Math.max(0, total);
      return;
    }
    // Proporcjonalny podział
    const ratio = total / current;
    let assigned = 0;
    const types = STRATA_TYPES;
    for (let i = 0; i < types.length - 1; i++) {
      const s = this.strata[types[i]];
      s.count = Math.round(s.count * ratio);
      assigned += s.count;
    }
    // Ostatni typ dostaje resztę
    this.strata[types[types.length - 1]].count = Math.max(0, total - assigned);
    // Korekta: jeśli suma != total (błąd zaokrąglenia), dodaj/odejmij od laborer
    const diff = total - this.population;
    if (diff !== 0) this.strata.laborer.count = Math.max(0, this.strata.laborer.count + diff);
  }

  /** Dodaj POP do wskazanej straty */
  addPop(type = 'laborer', count = 1) {
    const s = this.strata[type] ?? this.strata.laborer;
    s.count += count;
  }

  /** Usuń POP — null = z najniższej satisfaction, lub z podanego typu */
  removePop(type = null, count = 1) {
    for (let i = 0; i < count; i++) {
      let target = type;
      if (!target) {
        // Znajdź typ z najniższą satisfaction i count > 0
        let lowestSat = Infinity;
        for (const [t, s] of Object.entries(this.strata)) {
          if (s.count > 0 && s.satisfaction < lowestSat) {
            lowestSat = s.satisfaction;
            target = t;
          }
        }
      }
      if (target && this.strata[target]) {
        this.strata[target].count = Math.max(0, this.strata[target].count - 1);
      }
    }
  }

  // ── Gettery publiczne ───────────────────────────────────────────────────

  get epochName() {
    const epoch = CIV_EPOCHS[this.epochIndex];
    return epoch?.key ? t(epoch.key) : (epoch?.namePL ?? t('epoch.primitive'));
  }
  get isUnrest()  { return this._unrestActive; }
  get isFamine()  { return this._famineActive; }

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

  // ── Wyświetlanie populacji (1 POP = 100,000 mieszkańców) ────────────────

  /** Populacja wyświetlana jako liczba mieszkańców */
  get displayPopulation() {
    let total = 0;
    for (const s of Object.values(this.strata)) {
      total += s.count + s.growthProgress;
    }
    return Math.round(total * 100_000);
  }

  /** Tempo wzrostu w mieszkańcach/rok (suma per-strata rates) */
  get populationGrowthRate() {
    if (this.population <= 0) return 0;
    let totalRate = 0;
    for (const type of STRATA_TYPES) {
      totalRate += this._calcStrataGrowthRate(type);
    }
    return Math.round(totalRate * 100_000);
  }

  /** Breakdown strat do UI */
  getStrataBreakdown() {
    const NAMES = {
      laborer:    { pl: 'Robotnicy',   en: 'Laborers',     icon: '👷' },
      miner:      { pl: 'Górnicy',     en: 'Miners',       icon: '⛏' },
      worker:     { pl: 'Fabryczni',   en: 'Workers',      icon: '🏭' },
      scientist:  { pl: 'Naukowcy',    en: 'Scientists',   icon: '🔬' },
      merchant:   { pl: 'Kupcy',       en: 'Merchants',    icon: '💰' },
      engineer:   { pl: 'Inżynierowie', en: 'Engineers',   icon: '⚙' },
      bureaucrat: { pl: 'Urzędnicy',   en: 'Bureaucrats',  icon: '🏢' },
    };
    const result = [];
    for (const type of STRATA_TYPES) {
      const s = this.strata[type];
      const n = NAMES[type];
      result.push({
        type,
        namePL:       n.pl,
        nameEN:       n.en,
        icon:         n.icon,
        count:        s.count,
        satisfaction: Math.round(s.satisfaction),
        displayPop:   Math.round((s.count + s.growthProgress) * 100_000),
      });
    }
    return result;
  }

  // ── Serializacja ────────────────────────────────────────────────────────

  serialize() {
    return {
      popFormat:            'strata',     // marker formatu (v27+)
      population:           this.population,  // backwards compat (computed)
      strata:               JSON.parse(JSON.stringify(this.strata)),
      identity:             this.identity ? JSON.parse(JSON.stringify(this.identity)) : null,
      loyaltyModifiers:     this._loyaltyModifiers ? [...this._loyaltyModifiers] : [],
      activeMovements:      this.activeMovements ? [...this.activeMovements] : [],
      housing:              this.housing,
      epochIndex:           this.epochIndex,
      growthProgress:       this._growthProgress,
      starvationYears:      this._starvationYears,
      employedPops:         this._employedPops,
      lockedPops:           this._lockedPops,
      lowProsperityYears:   this._lowProsperityYears,
      unrestActive:         this._unrestActive,
      unrestRemainingYears: this._unrestRemainingYears,
      famineYears:          this._famineYears,
      famineActive:         this._famineActive,
    };
  }

  restore(data) {
    if (!data) return;
    // Restore strata (v27+) lub fallback z population integer (legacy)
    if (data.strata) {
      this.strata = DEFAULT_STRATA();
      for (const type of STRATA_TYPES) {
        if (data.strata[type]) {
          this.strata[type].count          = data.strata[type].count          ?? 0;
          this.strata[type].growthProgress  = data.strata[type].growthProgress ?? 0;
          this.strata[type].satisfaction    = data.strata[type].satisfaction   ?? 50;
          this.strata[type]._lowSatYears   = data.strata[type]._lowSatYears   ?? 0;
          this.strata[type]._discontent    = data.strata[type]._discontent    ?? false;
        }
      }
    } else {
      // Legacy: cała populacja jako laborer
      this._initStrata(data.population ?? DEFAULT_POP);
    }

    // Identity + Loyalty + Movements (Faza 8 — defaults na razie)
    this.identity          = data.identity         ?? { score: 0, events: [], dominantType: 'laborer', traits: [] };
    this._loyaltyModifiers = data.loyaltyModifiers ?? [];
    this.activeMovements   = data.activeMovements  ?? [];

    this.epochIndex           = data.epochIndex           ?? 0;
    this._growthProgress      = data.growthProgress       ?? 0;
    this._starvationYears     = data.starvationYears      ?? 0;
    // employedPops ustawiane na 0 — zostanie ponownie obliczone przez BuildingSystem.restoreFromSave()
    // lockedPops przywracane z save (EventBus guard blokuje emisję z ExpeditionSystem.restore())
    this._employedPops        = 0;
    this._lockedPops          = data.lockedPops ?? 0;
    this.housing              = DEFAULT_HOUSING;
    this._lowProsperityYears  = data.lowProsperityYears   ?? 0;
    this._unrestActive        = data.unrestActive         ?? false;
    this._unrestRemainingYears= data.unrestRemainingYears ?? 0;
    this._famineYears         = data.famineYears          ?? 0;
    this._famineActive        = data.famineActive         ?? false;
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
    // Outposty (pop=0) nie mają głodu ani wzrostu
    if (this.population <= 0) return;

    // Cache resource ratios raz na yearly update (unika wielokrotnego obliczania)
    const foodRatio = this._resourceRatio('food') || this._resourceRatio('organics');

    // 0. Satisfakcja per-strata (przed wzrostem — wpływa na satMult)
    this._updateStrataSatisfaction();

    // 1. Wzrost populacji per-strata (demand-based)
    this._updateStrataGrowth();

    // 2. Śmierć POPa (głód) — przekaż cached foodRatio
    this._updatePopDeath(foodRatio);

    // 3. Kryzysy (prosperity-based)
    this._updateUnrest();
    this._updateFamine(foodRatio);

    // 4. Ruchy spoleczne + loyalty
    this._updateMovementsAndLoyalty();

    // 5. Epoka
    this._checkEpoch();

    // 6. Emituj (tylko aktywna kolonia → UI i BuildingSystem)
    if (window.KOSMOS?.civSystem === this) {
      EventBus.emit('civ:populationChanged', this._popSnapshot());
    }
  }

  // ── Wzrost populacji (akumulator) ───────────────────────────────────────

  _updatePopGrowth(foodRatio) {
    // Macierzysta planeta — nieograniczony housing, pomijamy blokadę
    const isHomePlanet = (this.planet && this.planet === window.KOSMOS?.homePlanet);

    // Brak miejsca → zero wzrostu (nie dotyczy planet z oddychalną atmosferą ani macierzystej)
    const atmo = this.planet?.atmosphere ?? 'breathable';
    const canLiveOutside = (atmo === 'breathable');
    if (!isHomePlanet && !canLiveOutside && this.population >= this.housing) {
      this._lastGrowth = 0;
      return;
    }

    const orgRatio  = foodRatio ?? (this._resourceRatio('food') || this._resourceRatio('organics'));
    const foodMod   = this._foodGrowthModifier(orgRatio);
    if (foodMod <= 0) { this._lastGrowth = 0; return; }

    const housingMod = this._housingGrowthModifier();
    if (housingMod <= 0) { this._lastGrowth = 0; return; }

    const conditionMult = (window.KOSMOS?.prosperitySystem?.getGrowthMultiplier() ?? 1.0) * foodMod * housingMod;
    const techMult      = this.techSystem?.getPopGrowthMultiplier() ?? 1.0;

    // Skalowanie logistyczne — im więcej POPów, tym wolniejszy wzrost
    const popScale = 1.0 / (1 + this.population / POP_SCALING_HALF);

    const effectiveInterval = BASE_GROWTH_INTERVAL / Math.max(0.01, conditionMult * techMult * popScale);
    const clampedInterval   = Math.max(MIN_GROWTH_INTERVAL, effectiveInterval);
    const growthRate        = 1.0 / clampedInterval;

    this._growthProgress += growthRate;

    if (this._growthProgress >= 1.0) {
      this._growthProgress -= 1.0;
      this.addPop('laborer');  // tymczasowo laborer — Faza 5 doda demand-based growth
      this._lastGrowth = 1;
      if (window.KOSMOS?.civSystem === this) {
        EventBus.emit('civ:popBorn', { population: this.population, strataType: 'laborer' });
      }
    } else {
      this._lastGrowth = 0;
    }
  }

  // ── Śmierć POPa ────────────────────────────────────────────────────────

  _updatePopDeath(cachedFoodRatio) {
    if (this.population <= 0) return;  // kolonia wymarła

    // Śmierć z braku atmosfery + habitatu — natychmiastowa (1 POP/rok)
    // Na planecie bez oddychalnej atmosfery, housing = 0 oznacza brak schronienia
    // W przeciwieństwie do głodu, brak powietrza ZABIJA WSZYSTKICH (min 0, nie 1)
    const atmo = this.planet?.atmosphere ?? 'breathable';
    const needsShelter = (atmo === 'none' || atmo === 'thin' || atmo === 'dense' || atmo === 'toxic');
    if (needsShelter && this.housing <= 0) {
      this.removePop();
      if (window.KOSMOS?.civSystem === this) {
        EventBus.emit('civ:popDied', { cause: 'exposure', population: this.population });
      }
      return;
    }

    if (this.population <= 1) return;  // minimum 1 POP (głód nie zabija ostatniego)

    // Śmierć z głodu — 5 lat bez jedzenia
    const foodRatio = cachedFoodRatio ?? (this._resourceRatio('food') || this._resourceRatio('organics'));

    if (foodRatio < 0.02) {
      this._starvationYears++;
      if (this._starvationYears >= STARVATION_YEARS) {
        this.removePop();  // ginie najniższa satisfaction
        this._starvationYears = 0;
        if (window.KOSMOS?.civSystem === this) {
          EventBus.emit('civ:popDied', { cause: 'starvation', population: this.population });
        }
      }
    } else {
      this._starvationYears = 0;
    }
  }

  // ── Kryzysy ─────────────────────────────────────────────────────────────

  _updateUnrest() {
    const prosperity = window.KOSMOS?.prosperitySystem?.prosperity ?? 50;

    if (this._unrestActive) {
      this._unrestRemainingYears--;
      if (this._unrestRemainingYears <= 0) {
        this._unrestActive = false;
        this._lowProsperityYears = 0;
        EventBus.emit('civ:unrestLifted', {});
      }
      return;
    }

    if (prosperity < UNREST_PROSPERITY_THRESHOLD) {
      this._lowProsperityYears++;
      if (this._lowProsperityYears >= UNREST_YEARS_NEEDED) {
        this._unrestActive         = true;
        this._unrestRemainingYears = UNREST_DURATION;
        this._lowProsperityYears   = 0;
        EventBus.emit('civ:unrest', {
          reason:       t('log.unrestReason', UNREST_YEARS_NEEDED),
          yearsInCrisis: UNREST_YEARS_NEEDED,
        });
      }
    } else if (prosperity >= UNREST_RECOVERY_PROSPERITY) {
      this._lowProsperityYears = 0;
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
        const epochObj = CIV_EPOCHS[i];
        const epochName = epochObj.key ? t(epochObj.key) : epochObj.namePL;
        EventBus.emit('civ:epochChanged', {
          epoch:   epochObj,
          message: t('epoch.entered', epochName),
        });
        break;
      }
    }
  }

  // ── Strata: demand, growth, satisfaction ────────────────────────────────

  /** Zapotrzebowanie na daną stratę (0-1): (potrzebni - obecni) / potrzebni */
  _calcStrataDemand(type) {
    const needed  = this.buildingSystem?.getSlotDemand(type) ?? 0;
    const current = this.strata[type].count;
    if (needed <= 0) return type === 'laborer' ? 0.3 : 0;  // laborer zawsze ma bazowy demand
    return Math.max(0, Math.min(1, (needed - current) / Math.max(1, needed)));
  }

  /** Tempo wzrostu danej straty per rok cywilny */
  _calcStrataGrowthRate(type) {
    const strata = this.strata[type];
    const demand  = this._calcStrataDemand(type);
    if (demand <= 0 && strata.count > 0) return 0;  // brak zapotrzebowania, nie rośnie

    const foodRatio = this._resourceRatio('food') || this._resourceRatio('organics');
    const foodMod   = this._foodGrowthModifier(foodRatio);
    const housingMod = this._housingGrowthModifier();
    const condMult  = (window.KOSMOS?.prosperitySystem?.getGrowthMultiplier() ?? 1.0) * Math.max(0.1, foodMod) * Math.max(0.1, housingMod);
    const satMult   = strata.satisfaction > 40 ? 1.0
                    : strata.satisfaction > 20 ? 0.5 : 0.1;

    const BASE = 0.08;  // bazowy przyrost per rok cywilny
    return BASE * Math.max(demand, 0.05) * condMult * satMult;
  }

  /** Satisfakcja danej straty (0-1) → przechowywana jako 0-100 */
  _calcStrataSatisfaction(type) {
    const foodRatio  = Math.min(1, this._resourceRatio('food') || this._resourceRatio('organics'));
    const waterRatio = Math.min(1, this._resourceRatio('water'));
    const housingOk  = this.housing >= this.population ? 1.0 : (this.housing / Math.max(1, this.population));
    const energyOk   = (() => {
      const e = this._resourceSnap.energy;
      if (!e) return 0.5;
      return (e.perYear ?? 0) >= 0 ? 1.0 : Math.max(0, 1 + (e.perYear / 20));
    })();

    switch (type) {
      case 'laborer':
        return foodRatio * 0.40 + waterRatio * 0.25 + housingOk * 0.20 + energyOk * 0.15;

      case 'miner': {
        const mineEff = this.buildingSystem?.getMineEfficiency() ?? 0.5;
        return mineEff * 0.30 + foodRatio * 0.40 + housingOk * 0.15 + energyOk * 0.15;
      }

      case 'worker': {
        const factoryOut = this.buildingSystem?.getFactoryOutputRatio() ?? 0.5;
        return factoryOut * 0.40 + foodRatio * 0.30 + energyOk * 0.20 + housingOk * 0.10;
      }

      case 'scientist': {
        const r = this._resourceSnap.research;
        const researchRate = Math.min(1, (r?.perYear ?? 0) / 20);
        return researchRate * 0.40 + housingOk * 0.25 + foodRatio * 0.20 + energyOk * 0.15;
      }

      case 'merchant': {
        const credits = window.KOSMOS?.civilianTradeSystem?.getCreditsPerYear?.(this._colonyId) ?? 0;
        const routes  = window.KOSMOS?.civilianTradeSystem?.getActiveConnectionCount?.() ?? 0;
        return Math.min(1, credits / 10) * 0.30 + Math.min(1, routes / 3) * 0.30 + foodRatio * 0.20 + housingOk * 0.20;
      }

      case 'engineer': {
        const advUp = this.buildingSystem?.getAdvancedBuildingsUptime() ?? 0.5;
        return advUp * 0.40 + foodRatio * 0.30 + energyOk * 0.30;
      }

      case 'bureaucrat':
        return housingOk * 0.30 + foodRatio * 0.30 + energyOk * 0.20 + waterRatio * 0.20;
    }
    return 0.5;
  }

  /** Aktualizacja wzrostu per-strata (zastępuje stary akumulator) */
  _updateStrataGrowth() {
    const isHomePlanet = (this.planet && this.planet === window.KOSMOS?.homePlanet);
    const atmo = this.planet?.atmosphere ?? 'breathable';
    const canLiveOutside = (atmo === 'breathable');

    // Brak miejsca → zero wzrostu (nie dotyczy planet z oddychalną atmosferą ani macierzystej)
    if (!isHomePlanet && !canLiveOutside && this.population >= this.housing) {
      this._lastGrowth = 0;
      return;
    }

    let anyBorn = false;
    for (const type of STRATA_TYPES) {
      const s = this.strata[type];
      const rate = this._calcStrataGrowthRate(type);
      s.growthProgress += rate;

      if (s.growthProgress >= 1.0) {
        s.growthProgress -= 1.0;
        s.count += 1;
        anyBorn = true;
        if (window.KOSMOS?.civSystem === this) {
          EventBus.emit('civ:popBorn', { population: this.population, strataType: type });
        }
      }
    }
    this._lastGrowth = anyBorn ? 1 : 0;
  }

  /** Aktualizacja satisfakcji per-strata (co rok cywilny) */
  _updateStrataSatisfaction() {
    for (const type of STRATA_TYPES) {
      const s = this.strata[type];
      if (s.count <= 0) continue;
      const raw = this._calcStrataSatisfaction(type);
      // Smooth: powoli zbliża się do wartości docelowej (inercja 0.3)
      s.satisfaction += (raw * 100 - s.satisfaction) * 0.3;
      s.satisfaction = Math.max(0, Math.min(100, s.satisfaction));
    }
  }

  // ── Loyalty (computed property) ─────────────────────────────────────────

  /** Lojalnosc kolonii (0-100): srednia wazona satisfaction + modifiers historyczne */
  get loyalty() {
    const total = this.population;
    if (total === 0) return 80;
    let weighted = 0;
    for (const [, s] of Object.entries(this.strata)) {
      weighted += s.count * s.satisfaction;
    }
    const base = weighted / total;
    const modSum = (this._loyaltyModifiers ?? []).reduce((s, m) => s + m.value, 0);
    return Math.max(0, Math.min(100, base + modSum));
  }

  /** Dodaj modifier lojalnosci (zanika decayPerYear per rok) */
  addLoyaltyModifier(value, source, decayPerYear = 2) {
    this._loyaltyModifiers.push({ value, source, decayPerYear });
  }

  // ── Ruchy spoleczne ───────────────────────────────────────────────────

  /** Sprawdz czy ktoras strata jest na tyle niezadowolona ze tworzy ruch */
  _checkMovements() {
    for (const [type, s] of Object.entries(this.strata)) {
      if (s.count === 0) continue;
      const alreadyActive = this.activeMovements.find(m => m.strataType === type);
      if (alreadyActive) continue;

      // Faza 1: Niezadowolenie (log, bez pauzy)
      if (s.satisfaction < 30) {
        s._lowSatYears = (s._lowSatYears ?? 0) + 1;
        if (s._lowSatYears >= 3 && !s._discontent) {
          s._discontent = true;
          if (window.KOSMOS?.civSystem === this) {
            EventBus.emit('civ:strataDiscontent', { type, satisfaction: s.satisfaction });
          }
        }
      } else {
        s._lowSatYears = 0;
        s._discontent = false;
      }

      // Faza 2: Ruch (pauza + modal)
      if (s._discontent && s.satisfaction < 20 && s._lowSatYears >= 6) {
        this._triggerMovement(type);
      }
    }

    // Separatyzm: identity > 55 AND loyalty < 35
    if (this.identity.score > 55 && this.loyalty < 35) {
      if (!this.activeMovements.find(m => m.type === 'separatism')) {
        this._triggerMovement(null, 'separatism');
      }
    }
  }

  /** Uruchom ruch spoleczny */
  _triggerMovement(strataType, forceType = null) {
    // Znajdz typ ruchu
    let movDef = null;
    if (forceType) {
      movDef = MOVEMENT_TYPES[forceType];
    } else {
      for (const def of Object.values(MOVEMENT_TYPES)) {
        if (def.strataType === strataType) { movDef = def; break; }
      }
    }
    if (!movDef) return;

    const movement = {
      type:       movDef.id,
      strataType: movDef.strataType,
      startYear:  window.KOSMOS?.game?.gameYear ?? 0,
      strength:   movDef.strength,
      resolved:   false,
    };
    this.activeMovements.push(movement);

    if (window.KOSMOS?.civSystem === this) {
      EventBus.emit('civ:movementStarted', {
        colony:     this._colonyId,
        strataType: movDef.strataType,
        movementId: movDef.id,
        namePL:     movDef.namePL,
        nameEN:     movDef.nameEN,
        demands:    movDef.demandsPL,
        strength:   movDef.strength,
      });
    }
  }

  /** Rozwiaz ruch spoleczny (wywolywane z UI po wyborze gracza) */
  resolveMovement(movementType, resolutionId) {
    const idx = this.activeMovements.findIndex(m => m.type === movementType && !m.resolved);
    if (idx < 0) return;

    const resolution = RESOLUTION_OPTIONS[resolutionId];
    if (!resolution) return;

    // Modyfikator lojalnosci
    if (resolution.loyaltyDelta !== 0) {
      this.addLoyaltyModifier(resolution.loyaltyDelta, `movement_${movementType}_${resolutionId}`);
    }

    // Identity event
    if (resolution.identityEvent) {
      this._addIdentityEvent(resolution.identityEvent);
    }

    // Usun ruch
    this.activeMovements.splice(idx, 1);

    // Reset discontent na stracie
    const mov = MOVEMENT_TYPES[movementType];
    if (mov?.strataType && this.strata[mov.strataType]) {
      this.strata[mov.strataType]._lowSatYears = 0;
      this.strata[mov.strataType]._discontent = false;
    }

    if (window.KOSMOS?.civSystem === this) {
      EventBus.emit('civ:movementResolved', {
        colony:     this._colonyId,
        strataType: mov?.strataType,
        outcome:    resolutionId,
      });
    }
  }

  // ── Identity ──────────────────────────────────────────────────────────

  /** Dodaj zdarzenie identitarne */
  _addIdentityEvent(eventType) {
    const weight = IDENTITY_WEIGHTS[eventType] ?? 0;
    if (weight === 0) return;

    this.identity.events.push({
      type: eventType,
      year: window.KOSMOS?.game?.gameYear ?? 0,
    });

    // Przelicz score
    this.identity.score = Math.min(100, Math.max(0,
      this.identity.events.reduce((s, e) => s + (IDENTITY_WEIGHTS[e.type] ?? 0), 0)
    ));

    // Dominant type: strata z najwieksza populacja
    let maxCount = 0;
    for (const [type, s] of Object.entries(this.strata)) {
      if (s.count > maxCount) { maxCount = s.count; this.identity.dominantType = type; }
    }

    if (window.KOSMOS?.civSystem === this) {
      EventBus.emit('civ:identityEvent', {
        colony:    this._colonyId,
        eventType,
        year:      window.KOSMOS?.game?.gameYear ?? 0,
        score:     this.identity.score,
      });
    }
  }

  /** Aktualizacja loyalty modifiers (decay) i ruchow — co rok cywilny */
  _updateMovementsAndLoyalty() {
    // Decay loyalty modifiers
    for (let i = this._loyaltyModifiers.length - 1; i >= 0; i--) {
      const m = this._loyaltyModifiers[i];
      if (m.value > 0) {
        m.value = Math.max(0, m.value - m.decayPerYear);
      } else {
        m.value = Math.min(0, m.value + m.decayPerYear);
      }
      if (Math.abs(m.value) < 0.5) this._loyaltyModifiers.splice(i, 1);
    }

    // Sprawdz nowe ruchy
    this._checkMovements();

    // Emit loyalty changed (tylko aktywna kolonia)
    if (window.KOSMOS?.civSystem === this) {
      EventBus.emit('civ:loyaltyChanged', {
        colony:  this._colonyId,
        loyalty: this.loyalty,
      });
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

    const rates = {
      food:   -(pop * POP_CONSUMPTION.food   * foodMult),
      water:  -(pop * POP_CONSUMPTION.water  * watMult),
      energy: -(pop * POP_CONSUMPTION.energy),
    };

    // Rejestruj bezpośrednio w swoim ResourceSystem (nie EventBus — unika cross-colony bleed)
    if (this.resourceSystem) {
      this.resourceSystem.registerProducer('civilization_consumption', rates);
    } else {
      EventBus.emit('resource:registerProducer', { id: 'civilization_consumption', rates });
    }
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
    if (orgRatio > 0.60) return 1.2;   // nadwyżka — umiarkowany bonus
    if (orgRatio > 0.30) return 1.0;   // wystarczy
    if (orgRatio > 0.10) return 0.4;   // racjonowanie
    return 0.0;                         // głód = zero wzrostu
  }

  // Modyfikator wzrostu na podstawie dostępnego housingu
  // Na planecie z oddychalną atmosferą ludzie mogą żyć na zewnątrz — housing to bonus, nie wymóg
  // Na macierzystej planecie (homePlanet) housing jest neutralny (1.0) — nie trzeba habitatów, ale nie daje bonusu
  _housingGrowthModifier() {
    // Macierzysta planeta — oddychalna atmosfera, ale housing nie daje darmowego bonusu
    if (this.planet && this.planet === window.KOSMOS?.homePlanet) return 1.0;

    const atmo = this.planet?.atmosphere ?? 'breathable';
    const canLiveOutside = (atmo === 'breathable');

    if (this.housing <= 0) {
      return canLiveOutside ? 0.7 : 0.0;  // na zewnątrz wolniej, ale mogą
    }
    const ratio = this.population / this.housing;
    if (ratio < 0.70) return 1.2;  // dużo miejsca — bonus za inwestowanie w habitaty
    if (ratio < 1.00) return 1.0;  // wystarczy
    return canLiveOutside ? 0.7 : 0.0;  // przekroczony housing — na zewnątrz wolniej
  }

  // Snapshot dla civ:populationChanged
  _popSnapshot() {
    return {
      population:        this.population,
      displayPopulation: this.displayPopulation,
      growthRate:        this.populationGrowthRate,
      housing:           this.housing,
      growth:            this._lastGrowth,
      growthProgress:    this._growthProgress,
      freePops:          this.freePops,
      employedPops:      this._employedPops,
      lockedPops:        this._lockedPops,
      epoch:             this.epochName,
      isUnrest:          this._unrestActive,
      isFamine:          this._famineActive,
      loyalty:           this.loyalty,
      activeMovements:   this.activeMovements.length,
      identityScore:     this.identity.score,
    };
  }
}
