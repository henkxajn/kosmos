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
import { MILESTONE_DEFINITIONS, MILESTONE_BY_TYPE, CULTURAL_TRAITS } from '../data/MilestonesData.js';
// Population 2.0 (Faza 1) — stałe wzrostu/satysfakcji + reużyty dren podatkowy
import {
  BASE_GROWTH_RATE, planetGrowthMod, MAX_GROWTH_PER_YEAR, GROWTH_TAPER_SCALE,   // Slice 5A: cap + taper
  SAT_BASE, SAT_W_EMP, SAT_K_UNEMP, SAT_W_CROWD, SAT_CROWD_START, SAT_CROWD_SPAN, SAT_W_TAX,
  BASE_WAGE, MIGRATION_FRICTION, FOCUS_BONUS_MAX,   // Population 2.0 Faza 2: zatrudnienie/płace/focus
} from '../data/PopulationData.js';
import { taxSatisfactionDrain } from '../data/ConsumerGoodsData.js';
import { GAME_CONFIG } from '../config/GameConfig.js';   // Slice 5C.1: FEATURES.popAllocation2 (kill-switch)

// ── Epoki cywilizacyjne (progi POPowe) ──────────────────────────────────────
export const CIV_EPOCHS = [
  { id: 0, namePL: 'Pierwotna',    key: 'epoch.primitive',      minPop:   0 },
  { id: 1, namePL: 'Industrialna', key: 'epoch.industrial',     minPop:  40 },  // Population 2.0: ×4 (było 10)
  { id: 2, namePL: 'Kosmiczna',    key: 'epoch.space',          minPop: 120 },  // ×4 (było 30)
  { id: 3, namePL: 'Międzyplan.',  key: 'epoch.interplanetary', minPop: 320 },  // ×4 (było 80)
];

// ── Stałe populacji POP ─────────────────────────────────────────────────────
const DEFAULT_POP      = 8;    // startowa liczba POPów (Population 2.0: ×4 redenominacja, było 2)
const DEFAULT_HOUSING  = 0;    // housing pochodzi wyłącznie z budynków (colony_base = 4)
export const POP_PER_BUILDING = 0.25;  // domyślny koszt POP na budynek

// Konsumpcja per POP per rok gry (nowy system: food/water/energy)
import { POP_CONSUMPTION } from '../data/ResourcesData.js';
import { systemBelongsToPlayer } from '../utils/ColonyOwnership.js';
// POP_CONSUMPTION = { food: 2.5, water: 1.5, energy: 1.0 }

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
const FAMINE_YEARS_NEEDED     = 1;  // v57: nowe kryterium (yearsLeft<1 + flow<0) jest rygorystyczne, więc skracamy do 1 roku
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

// Metadane strat (dwujęzyczne — reguła PL+EN) — jedno źródło dla getStrataBreakdown +
// getWorkforceBreakdown (Population 2.0 Faza 2, zakładka Workforce).
export const STRATA_META = {
  laborer:    { pl: 'Robotnicy',    en: 'Laborers',    icon: '👷' },
  miner:      { pl: 'Górnicy',      en: 'Miners',      icon: '⛏' },
  worker:     { pl: 'Fabryczni',    en: 'Workers',     icon: '🏭' },
  scientist:  { pl: 'Naukowcy',     en: 'Scientists',  icon: '🔬' },
  merchant:   { pl: 'Kupcy',        en: 'Merchants',   icon: '💰' },
  engineer:   { pl: 'Inżynierowie', en: 'Engineers',   icon: '⚙' },
  bureaucrat: { pl: 'Urzędnicy',    en: 'Bureaucrats', icon: '🏢' },
};

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

    // Housing pochodzący WYŁĄCZNIE z dedykowanych habitatów (habitat/arkologia/
    // habitat orbitalny — flaga isHabitat w BuildingsData). Bazowe housing ze
    // Stolicy/Portu zapewnia schronienie (przeżycie), ale NIE liczy się do wzrostu
    // populacji na planetach bez oddychalnej atmosfery. Na breathable nieistotne.
    this.habitatHousing = initialOverride.habitatHousing ?? 0;

    // Identity + Loyalty + Movements
    this.identity          = { score: 0, events: [], dominantType: 'laborer', traits: [] };
    this._loyaltyModifiers = [];
    this.activeMovements   = [];

    // Historia kolonii (milestones) — permanentne wpisy kształtujące identity i loyalty
    this.colonyHistory     = [];
    this._milestoneState   = this._defaultMilestoneState();
    this._smoothedLoyalty  = 80;  // wygładzony loyalty (inercja)
    this._suppressHistory  = [];  // [{ year, movementType }] do eskalacji suppress
    this._productionPenalties = [];  // [{ mult, remainingYears }] z negotiate resolution
    this._autonomousState  = false;
    this._traitCheckAccum  = 0;  // akumulator lat do sprawdzania traitów (co 10 lat)

    // Epoka (indeks do CIV_EPOCHS)
    this.epochIndex = 0;

    // Snapshot surowców — lazy cache (Patch v5 Slice 1).
    // Wcześniej pole bezpośrednio aktualizowane przez handler `resource:changed`,
    // ale guard `isActive` na emit w ResourceSystem blokował event dla kolonii AI →
    // _resourceSnap = {} → _resourceRatio('food')=0 → spirala śmierci AI.
    // Teraz getter `_resourceSnap` odczytuje on-demand z this.resourceSystem.snapshot().
    this._snapCache = null;

    // ── System POP ──────────────────────────────────────────────────────
    this._growthProgress  = 0;     // Population 2.0: ułamek `humans` (floor(humans)=Σ strata + unemployed, §2.5)
    this._unemployed      = 0;     // Population 2.0 Faza 2 §3.2: pula bezrobotnych (POZA stratami; §2.3 —
                                   //   koniec nieskończonego laborera). floor(humans)=Σ strata + _unemployed.
    this._focusBonus      = {};    // Faza 2 §2.6: slider focus per strata (demandBonus, wirtualne etaty → pressure).
                                   //   Slice 5C.1: używane TYLKO gdy FEATURES.popAllocation2=OFF (rollback Faza 3).
    // Slice 5C.1 (Allocation 2.0): focus = docelowy UDZIAŁ (share 0..1) straty w mobilnej puli
    // human-jobs. Alokacja dąży do tej kompozycji (Etap-1 additive overlay + Etap-2 migracja
    // z ułamkowym akumulatorem friction). Pusty target ≡ dzisiejsza alokacja ekonomiczna (AI, Faza 3).
    this._focusTarget           = {};   // { strataType → share 0..1 }
    this._focusMigrationProgress = {};  // { "src>dst" → akumulator friction 0..1 (małe straty trickle) }
    // Slice 5C.2: transient bump target-share z budynków PRIORYTETOWYCH liczony PULL-em z BuildingSystem
    // (stateless — bez pola/stale; budynki niosą desygnację w save → po restore automatycznie odzwierciedlone).
    this.satisfaction     = 50;    // Population 2.0 §3.5: satysfakcja kolonii 0-100 → prosperity infra
    this._starvationYears = 0;     // licznik lat głodu
    this._employedPops    = 0;     // POPy zatrudnione przez budynki
    this._lockedPerStrata = {};    // POPy zablokowane per strata (załogi statków itp.)

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

    // Jeśli nowa kolonia (nie restore) — dodaj milestone founding
    // (wywoływane po ustawieniu window.KOSMOS.game przez kolonie tworzone z poziomu kodu)

    // ── Nasłuch zdarzeń ─────────────────────────────────────────────────
    // civDeltaYears = deltaYears × CIV_TIME_SCALE — wzrost POP, kryzysy biegną szybciej
    this._onTick = ({ civDeltaYears: deltaYears }) => this._update(deltaYears);
    EventBus.on('time:tick', this._onTick);

    // Zasoby — invalidacja lazy cache (Patch v5). Handler odpalany tylko dla
    // aktywnej kolonii gracza (emit `resource:changed` guarded w ResourceSystem),
    // ale to wystarcza — getter i tak będzie czytał świeży snapshot przy najbliższym
    // dostępie. AI kolonie nie odbierają eventu, lecz `_snapCache=null` przed każdym
    // yearly iteration w `_update` zapewnia świeżość po stronie AI.
    EventBus.on('resource:changed', () => {
      if (window.KOSMOS?.civSystem !== this) return;
      this._snapCache = null;
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
    // Strata-aware: { amount, strataType } lub legacy { amount }
    EventBus.on('civ:lockPops',   ({ amount, strataType }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this.lockPops(amount, strataType);
    });
    EventBus.on('civ:unlockPops', ({ amount, strataType }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      this.unlockPops(amount, strataType);
    });

    // Rozwiazanie ruchu spolecznego (z UI — EventChoiceModal)
    EventBus.on('civ:resolveMovement', ({ movementType, resolutionId }) => {
      if (window.KOSMOS?.civSystem !== this) return;
      if (!systemBelongsToPlayer(this, 'civSystem')) return;   // D2=W1 (OG-3) — obrona w głąb
      this.resolveMovement(movementType, resolutionId);
    });
  }

  // Lazy snapshot surowców (Patch v5 Slice 1). Cache invalidowany w `_update`
  // przed każdą yearly iteracją + przez handler `resource:changed` dla aktywnej
  // kolonii gracza. Alias `food = organics`: ResourceSystem.snapshot() zawsze
  // zwraca `organics` (legacy proxy z _syncLegacyProxy), nie `food`. Kod używa
  // fallback `_resourceRatio('food') || _resourceRatio('organics')`, więc
  // dorzucamy `food` żeby `_resourceSnap.food !== undefined` (wymóg testu).
  get _resourceSnap() {
    if (!this._snapCache) {
      const snap = this.resourceSystem?.snapshot?.() ?? {};
      if (snap.organics && !snap.food) {
        snap.food = snap.organics;
      }
      this._snapCache = snap;
    }
    return this._snapCache;
  }

  // ── Publiczne metody modyfikacji stanu (bezpośrednie wywołania, bez EventBus) ──

  addHousing(amount, isHabitat = false) {
    this.housing += amount;
    if (isHabitat) this.habitatHousing += amount;
    EventBus.emit('civ:populationChanged', this._popSnapshot());
  }

  removeHousing(amount, isHabitat = false) {
    this.housing = Math.max(this.population, this.housing - amount);
    if (isHabitat) this.habitatHousing = Math.max(0, this.habitatHousing - amount);
    EventBus.emit('civ:populationChanged', this._popSnapshot());
  }

  changeEmployment(delta) {
    this._employedPops = Math.max(0, this._employedPops + delta);
    EventBus.emit('civ:populationChanged', this._popSnapshot());
  }

  lockPops(amount, strataType = null) {
    if (strataType && strataType !== 'mix') {
      this._lockedPerStrata[strataType] = (this._lockedPerStrata[strataType] ?? 0) + amount;
    } else {
      // Legacy lub 'mix': rozłóż proporcjonalnie na strata z wolnymi POPami
      this._distributeLock(amount);
    }
  }

  unlockPops(amount, strataType = null) {
    if (strataType && strataType !== 'mix') {
      this._lockedPerStrata[strataType] = Math.max(0, (this._lockedPerStrata[strataType] ?? 0) - amount);
    } else {
      // Legacy lub 'mix': odblokuj proporcjonalnie
      this._distributeUnlock(amount);
    }
  }

  /** Rozłóż lock na strata z wolnymi POPami (proporcjonalnie do surplus) */
  _distributeLock(amount) {
    const free = [];
    for (const type of STRATA_TYPES) {
      const avail = this.freeInStrata(type);
      if (avail > 0) free.push({ type, avail });
    }
    if (free.length === 0) {
      // Fallback: wrzuć do laborer
      this._lockedPerStrata.laborer = (this._lockedPerStrata.laborer ?? 0) + amount;
      return;
    }
    const total = free.reduce((s, e) => s + e.avail, 0);
    let remaining = amount;
    for (const { type, avail } of free) {
      const share = Math.min(remaining, amount * (avail / total));
      this._lockedPerStrata[type] = (this._lockedPerStrata[type] ?? 0) + share;
      remaining -= share;
    }
    // Reszta (błędy zaokrągleń)
    if (remaining > 0.001) {
      this._lockedPerStrata[free[0].type] = (this._lockedPerStrata[free[0].type] ?? 0) + remaining;
    }
  }

  /** Odblokuj proporcjonalnie z zablokowanych strat */
  _distributeUnlock(amount) {
    const locked = [];
    for (const type of STRATA_TYPES) {
      const val = this._lockedPerStrata[type] ?? 0;
      if (val > 0) locked.push({ type, val });
    }
    if (locked.length === 0) return;
    const total = locked.reduce((s, e) => s + e.val, 0);
    for (const { type, val } of locked) {
      const share = amount * (val / total);
      this._lockedPerStrata[type] = Math.max(0, (this._lockedPerStrata[type] ?? 0) - share);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // W2 — księga załóg okrętów (R-B / R-C, decyzja 18)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Trzy operacje na jednej osi: załoga schodzi z rynku pracy przy ROZMIESZCZENIU,
  // wraca przy WYCOFANIU, GINIE przy stracie okrętu. Mechanizmem jest istniejąca blokada
  // (`_lockedPerStrata`) — załoga wciąż JEST ludźmi kolonii (liczy się do populacji, je,
  // mieszka), przestaje tylko być dostępna do pracy.
  //
  // ⚠ TRZY PUŁAPKI, KTÓRE TE METODY ZAMYKAJĄ (audyt W2 §C-3/§C-4 + krytyk kompletności):
  //
  //  1. `removePop(type, count)` iteruje `for (i = 0; i < count; i++)`, więc dla count=0.4
  //     wykonuje pętlę RAZ i zabija CAŁEGO człowieka — 2.5× za dużo (5× dla hull_small).
  //     Załogi kadłubów są UŁAMKOWE z definicji (0.2 / 0.4 / 0.6 / 1.0 po redenominacji ×4),
  //     więc śmierć musi być akumulatorowa. Nośnikiem ułamka jest `_growthProgress` — ta sama
  //     część ułamkowa `humans`, która akumuluje wzrost. Dzięki temu `humans` spada DOKŁADNIE
  //     o załogę w tej samej chwili, a inwariant floor(humans) = Σ strata + _unemployed trzyma
  //     (pętla nie pozwala `_growthProgress` zejść poniżej zera).
  //
  //  2. Zwolnienie NIETYPOWANE (`_distributeUnlock`) zdejmuje proporcjonalnie do AKTUALNYCH
  //     blokad, a nie do tego, co ta załoga wzięła. Ponieważ `_lockedPerStrata` dzieli worek
  //     z jednostkami naziemnymi (lock TYPOWANY na `laborer`), wycofanie okrętu zjadałoby lock
  //     garnizonu — a jego własne, typowane zwolnienie klamruje się potem do zera (`:288`)
  //     i te POPy zostają zablokowane NA ZAWSZE. Dlatego `commitCrew` ZWRACA rozkład, a
  //     `releaseCrew`/`killCrew` przyjmują go z powrotem i zdejmują TYPOWANIE, wpis po wpisie.
  //
  //  3. `removePop(null, …)` wybiera warstwę o NAJNIŻSZEJ SATYSFAKCJI i jest ŚLEPY NA BLOKADY —
  //     potrafi zbić `strata.count` poniżej `_lockedPerStrata` tej warstwy, łamiąc inwariant
  //     `locked ⊆ employed`. Śmierć załogi używa więc `_removeUnlockedPop`, który zabiera
  //     człowieka spoza blokad (bezrobotny → najtańsza warstwa z wolnym człowiekiem).

  /** Warstwy posortowane po płacy bazowej ROSNĄCO; remis rozstrzyga kolejność STRATA_TYPES
   *  (deterministycznie — miner/worker i merchant/bureaucrat mają równe stawki). */
  _strataByWageAsc() {
    return [...STRATA_TYPES].sort((a, b) =>
      ((BASE_WAGE[a] ?? 0) - (BASE_WAGE[b] ?? 0)) || (STRATA_TYPES.indexOf(a) - STRATA_TYPES.indexOf(b)));
  }

  /** Ile blokady warstwa jest w stanie UNIEŚĆ realnymi ludźmi (count − to, co już zablokowane). */
  _hostableIn(type) {
    return Math.max(0, (this.strata[type]?.count ?? 0) - (this._lockedPerStrata[type] ?? 0));
  }

  /**
   * W2 (R-B, decyzja 18) — zabierz `amount` POP na załogę okrętu.
   * Źródło w kolejności: (1) BEZROBOTNI, (2) EKSMISJA z warstwy o NAJNIŻSZEJ płacy —
   * mobilizacja ściąga ludzi z hali fabrycznej. Bez (2) rozmieszczenie byłoby niewykonalne
   * przy projektowanej równowadze AI `freePops ≈ 0`, więc NIE bramkujemy na `freePops`.
   *
   * ALL-OR-NOTHING: pół załogi nie obsadza okrętu, więc przy braku ludzi nic się nie dzieje.
   * ⚠ Własny pre-check jest KONIECZNY — `lockPops` nie ma kanału odmowy i na kolonii z zerową
   *   populacją (outpost) zapisałby całą blokadę na `laborer` bez pokrycia (`:302-305`).
   *
   * @param {number} amount — POP (ułamkowe)
   * @returns {{ ok: boolean, taken: number, byStrata: Object<string,number> }}
   */
  commitCrew(amount) {
    const want = Number(amount) || 0;
    if (want <= 0) return { ok: false, taken: 0, byStrata: {} };

    // Pojemność = ludzie zdolni ponieść blokadę: nieobciążeni pracownicy + bezrobotni.
    let capacity = this._unemployed;
    for (const type of STRATA_TYPES) capacity += this._hostableIn(type);
    if (capacity < want - 1e-9) return { ok: false, taken: 0, byStrata: {} };

    const order = this._strataByWageAsc();
    const host  = order[0];                       // najtańsza praca ustępuje pierwsza

    // (1) Bezrobotni najpierw. Blokada mieszka na WARSTWIE, a bezrobotni w żadnej nie siedzą —
    //     przenosimy więc CAŁE osoby do najtańszej warstwy, żeby miały co unieść. Ułamek 0.4
    //     też wymaga jednej całej osoby (strata.count jest całkowite); nadwyżka wróci do puli
    //     przy najbliższej alokacji (`_allocateWorkforce` krok 1 — blokada ją tam ochroni).
    const needHosts = Math.max(0, Math.ceil(want - 1e-9) - this._hostableIn(host));
    if (needHosts > 0 && this._unemployed > 0) {
      const take = Math.min(needHosts, this._unemployed);
      this.strata[host].count += take;
      this._unemployed        -= take;
    }

    // (2) Rozłóż blokadę po warstwach wg płacy ROSNĄCO.
    const byStrata = {};
    let remaining = want;
    for (const type of order) {
      if (remaining <= 1e-9) break;
      const hostable = this._hostableIn(type);
      if (hostable <= 0) continue;
      const chunk = Math.min(remaining, hostable);
      this._lockedPerStrata[type] = (this._lockedPerStrata[type] ?? 0) + chunk;
      byStrata[type] = (byStrata[type] ?? 0) + chunk;
      remaining -= chunk;
    }

    this._registeredPop = -1;                     // wymuś przeliczenie konsumpcji/etatów
    EventBus.emit('civ:populationChanged', this._popSnapshot());
    return { ok: true, taken: want - remaining, byStrata };
  }

  /**
   * W2 (decyzja 19) — załoga wraca do puli. Zdejmuje DOKŁADNIE to, co `commitCrew` wzięło,
   * warstwa po warstwie (patrz pułapka 2 wyżej). Populacja się nie zmienia — ludzie żyją.
   * @param {Object<string,number>} byStrata — rozkład z `commitCrew`
   * @returns {number} suma zwolnionych POP
   */
  releaseCrew(byStrata) {
    let sum = 0;
    for (const [type, amt] of Object.entries(byStrata ?? {})) {
      const n = Number(amt) || 0;
      if (n <= 0) continue;
      this._lockedPerStrata[type] = Math.max(0, (this._lockedPerStrata[type] ?? 0) - n);
      sum += n;
    }
    if (sum > 0) {
      this._registeredPop = -1;
      EventBus.emit('civ:populationChanged', this._popSnapshot());
    }
    return sum;
  }

  /**
   * W2 (R-C) — załoga GINIE razem z okrętem. Zwalnia blokadę (etat wraca na rynek) i zabija
   * dokładnie tylu ludzi, ilu było w załodze — z ułamkiem włącznie (pułapka 1 wyżej).
   * @param {Object<string,number>} byStrata — rozkład z `commitCrew`
   * @returns {{ crew: number, wholeDied: number }} crew = ubytek `humans`, wholeDied = pełne osoby
   */
  killCrew(byStrata) {
    const crew = this.releaseCrew(byStrata);
    if (crew <= 0) return { crew: 0, wholeDied: 0 };

    this._growthProgress -= crew;
    let wholeDied = 0, guard = 0;
    while (this._growthProgress < -1e-9 && guard++ < 10000) {
      if (!this._removeUnlockedPop()) { this._growthProgress = 0; break; }   // kolonia wymarła
      this._growthProgress += 1;
      wholeDied++;
    }
    if (this._growthProgress < 0) this._growthProgress = 0;                  // szum float

    if (wholeDied > 0) {
      // Zdarzenie potrzebne mechanice, nie Dziennikowi: pilnuje warunku końca gry
      // (`GameScene`) i wymusza przeliczenie stawek (`BuildingSystem`). Wpis do Dziennika
      // robi `civ:crewLost` z nazwą okrętu — inaczej gracz dostałby dwie linie o jednym zdarzeniu.
      EventBus.emit('civ:popDied', {
        cause: 'ship_crew_lost', population: this.population, planetId: this.planet?.id ?? null,
      });
    }
    EventBus.emit('civ:populationChanged', this._popSnapshot());
    return { crew, wholeDied };
  }

  /** Zabierz jednego CAŁEGO człowieka spoza blokad: bezrobotny → najtańsza warstwa z wolnym
   *  człowiekiem → (ostatecznie) ktokolwiek, przycinając przy tym jego blokadę, żeby
   *  `locked ⊆ employed` nie pękło. @returns {boolean} czy kogoś zabrano */
  _removeUnlockedPop() {
    if (this._unemployed > 0) { this._unemployed -= 1; return true; }
    for (const type of this._strataByWageAsc()) {
      if (this._hostableIn(type) >= 1) { this.strata[type].count -= 1; return true; }
    }
    // Kolonia złożona wyłącznie z zablokowanych (same załogi/garnizony).
    for (const type of this._strataByWageAsc()) {
      const s = this.strata[type];
      if ((s?.count ?? 0) <= 0) continue;
      s.count -= 1;
      if ((this._lockedPerStrata[type] ?? 0) > s.count) this._lockedPerStrata[type] = s.count;
      return true;
    }
    return false;
  }

  // ── Konwersja strata (rekrutacja do innego zawodu) ──────────────────────

  /**
   * Konwertuj wolnego POPa z dowolnej strata do docelowej.
   * Np. wolny laborer → miner gdy budujemy kopalnię a brak wolnych górników.
   * @returns {boolean} true jeśli udało się skonwertować
   */
  convertToStrata(targetType, amount) {
    if (amount <= 0) return true;
    const target = this.strata[targetType];
    if (!target) return false;

    // Szybka ścieżka: wolne POPy już pokrywają żądanie
    if (this.freeInStrata(targetType) >= amount) return true;

    // Strata count są liczbami całkowitymi — przy fractional popCost (np. 0.5) i tak
    // potrzeba jednego pełnego POPa, żeby obsadzić dowolny ułamek. Liczymy ile POPów
    // w sumie potrzeba: demand z budynków (getSlotDemand) już zawiera nowo dodany budynek,
    // a amount + locked pokrywa pending crew lock (convertToStrata wywołane przed lockPops).
    const bSys = this.buildingSystem;
    const totalDemand = bSys?.getSlotDemand?.(targetType) ?? 0;
    const locked = this._lockedPerStrata[targetType] ?? 0;
    const needed = Math.max(
      Math.ceil(totalDemand + locked - 1e-6),
      Math.ceil(amount      + locked - 1e-6),
    );
    let wholeDeficit = needed - target.count;
    if (wholeDeficit <= 0) return true;

    // Population 2.0 Faza 2: najpierw z puli bezrobotnych (naturalne obsadzenie nowego etatu,
    // bez podbierania pracowników innym stratom).
    if (this._unemployed > 0) {
      const take = Math.min(wholeDeficit, this._unemployed);
      target.count += take;
      this._unemployed -= take;
      wholeDeficit -= take;
    }
    if (wholeDeficit <= 0) return true;

    // Szukaj wolnych POPów w innych stratach (priorytet: laborer)
    const donors = STRATA_TYPES.filter(t => t !== targetType);
    donors.sort((a, b) => (a === 'laborer' ? -1 : b === 'laborer' ? 1 : 0));

    for (const donorType of donors) {
      if (wholeDeficit <= 0) break;
      const donor = this.strata[donorType];
      const freeWhole = Math.floor(this.freeInStrata(donorType));
      if (freeWhole <= 0) continue;

      const take = Math.min(wholeDeficit, freeWhole);
      donor.count -= take;
      target.count += take;
      wholeDeficit -= take;
    }

    return wholeDeficit <= 0;
  }

  // ── Migracja cywilna (handel cywilny — CivilianTradeSystem) ─────────────

  /**
   * Emigracja: zabierz osoby z kolonii do migracji cywilnej.
   * Population 2.0 Faza 2 (§2.3): emigrują BEZROBOTNI — mobilna pula. Zatrudnieni trzymają
   * etaty; po alokacji strata nie mają nadwyżki, więc źródłem jest wyłącznie `_unemployed`.
   * @param {number} fraction — ilu ludzi (całkowita część) najwyżej zabrać
   * @returns {{ breakdown: Object<string,number> }} — { unemployed: n } (immigrate rozumie klucz)
   */
  emigrate(fraction) {
    if (fraction <= 0 || this.population <= 0) return { breakdown: {} };
    const n = Math.min(Math.floor(fraction), this._unemployed);
    if (n <= 0) return { breakdown: {} };
    this._unemployed -= n;

    this._registeredPop = -1; // wymuś przeliczenie konsumpcji
    this._syncConsumption();
    EventBus.emit('civ:populationChanged', this._popSnapshot());
    return { breakdown: { unemployed: n } };
  }

  /**
   * Imigracja: dodaj ułamek POPa do kolonii (rozkład strata z emigracji).
   * @param {Object<string,number>} breakdown — ile dodać do każdej strata
   */
  immigrate(breakdown) {
    if (!breakdown) return;
    for (const [type, amount] of Object.entries(breakdown)) {
      if (amount <= 0) continue;
      // Population 2.0 Faza 2: przybysze wchodzą jako BEZROBOTNI (alokacja wchłonie ich do
      // wolnych etatów w następnym przebiegu, §3.2).
      if (type === 'unemployed') { this._unemployed += Math.round(amount); continue; }
      if (!this.strata[type]) continue;
      // Dodaj do growthProgress; jeśli ≥1 → promuj do count
      this.strata[type].growthProgress += amount;
      while (this.strata[type].growthProgress >= 1.0) {
        this.strata[type].growthProgress -= 1.0;
        this.strata[type].count += 1;
      }
    }

    this._registeredPop = -1;
    this._syncConsumption();
    EventBus.emit('civ:populationChanged', this._popSnapshot());
  }

  /**
   * Wskaźnik bezrobocia (Population 2.0 Faza 2): unemployed / population.
   * Realna pochodna z puli bezrobotnych (§3.2) — zasila satysfakcję (§3.5) i próg
   * migracji cywilnej. W stanie ustalonym ≈ freePops/population (patrz komentarz
   * przy `freePops`; test steady-state pilnuje zbieżności obu miar).
   */
  get unemploymentRate() {
    if (this.population <= 0) return 0;
    return this._unemployed / this.population;
  }

  /**
   * Czy kolonia potrzebuje imigrantów (jest demand na POPy)?
   * housing > population ORAZ budynki potrzebują więcej ludzi niż mają
   */
  get needsImmigrants() {
    if (this.population <= 0) return false;
    if (this.effectiveHousing <= this.population) return false; // brak mieszkań
    // Sprawdź czy budynki mają niezaspokojony demand (etaty droidów NIE tworzą popytu na ludzi — net §3.4)
    const needed = Math.max(0, this._employedPops - this._syntheticJobsTotal()) + this._lockedPops;
    return needed > this.population * 0.85; // >85% zatrudnionych = brakuje rąk do pracy
  }

  // ── Strata: inicjalizacja i mutacja ─────────────────────────────────────

  /** Inicjalizacja strat — startowa populacja trafia do laborer */
  _initStrata(totalPop) {
    this.strata = DEFAULT_STRATA();
    this.strata.laborer.count = totalPop;
  }

  /** Suma count ze wszystkich strat = zatrudnieni (workers). Population 2.0 Faza 2:
   *  strata NIE zawierają już nadwyżki (nadwyżka → _unemployed, §2.3). */
  get _strataCount() {
    let sum = 0;
    for (const s of Object.values(this.strata)) sum += s.count;
    return sum;
  }

  /** Getter backwards-compatible: CAŁKOWITA populacja = zatrudnieni (Σ strata) + bezrobotni.
   *  Population 2.0 Faza 2 (Model B): SUMA niezmieniona względem Fazy 1 — nadwyżka, która
   *  wcześniej pęczniała w `laborer`, siedzi teraz w `_unemployed`. Konsumpcja/housing/
   *  progi liczą się jak dawniej (bezrobotni to też ludzie). */
  get population() {
    return this._strataCount + this._unemployed;
  }

  /** Population 2.0: kanoniczna liczba ludzi (float). floor(humans)=Σ strata + _unemployed (§2.5). */
  get humans() { return this.population + this._growthProgress; }

  /** Bezrobotni (pochodna per tick, §3.2). Inwariant: floor(humans) = Σ strata + unemployed. */
  get unemployed() { return this._unemployed; }

  /** Setter safety-net: przechwytuje stare przypisania `civSystem.population = X` */
  set population(val) {
    this.setPopulation(val);
  }

  /** Ustaw całkowitą populację (rozdziel proporcjonalnie lub do laborer).
   *  Population 2.0 Faza 2: zeruje pulę bezrobotnych — cały `total` trafia do strat
   *  (alokacja per-tick i tak przeliczy zatrudnienie/bezrobocie). */
  setPopulation(total) {
    this._unemployed = 0;
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

  /** Usuń POP — null = z najniższej satisfaction, lub z podanego typu.
   *  Population 2.0 Faza 2: gdy brak zatrudnionych do usunięcia → zabiera z puli bezrobotnych
   *  (kolonia całkowicie bezrobotna też może tracić ludzi; inwariant zachowany). */
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
      if (target && (this.strata[target]?.count ?? 0) > 0) {
        this.strata[target].count -= 1;
      } else if (this._unemployed > 0) {
        this._unemployed -= 1;
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

  // Suma zablokowanych POPów (backward compat)
  get _lockedPops() {
    let sum = 0;
    for (const v of Object.values(this._lockedPerStrata)) sum += v;
    return sum;
  }

  /** Czy to planeta macierzysta (nieograniczony housing) */
  get isHomePlanet() {
    return this.planet && this.planet === window.KOSMOS?.homePlanet;
  }

  /** Efektywny housing = Σ housing. Population 2.0 (Decision 1): macierzysta NIE ma już
   *  nieograniczonego housingu — wzrost capowany przez Σ housing jak wszędzie (skończony). */
  get effectiveHousing() {
    return this.housing;
  }

  /**
   * Efektywny housing z dedykowanych habitatów — limit wzrostu populacji na
   * planetach bez oddychalnej atmosfery (∞ na macierzystej). Bazowe housing
   * (Stolica/Port) NIE wlicza się tu — daje schronienie, nie miejsce na wzrost.
   */
  get effectiveHabitatHousing() {
    if (this.isHomePlanet) return Infinity;
    return this.habitatHousing;
  }

  // Wolne POPy dostępne do budowy/ekspedycji.
  // Population 2.0 Faza 2 (Model B): formuła CELOWO niezmieniona — ~40 konsumentów
  // (ekspedycje, załogi, jednostki naziemne, AI, UI) polega na jej semantyce.
  // Ponieważ `population` = Σ strata + unemployed, a `_employedPops` = Σ etatów, w stanie
  // ustalonym freePops ≈ _unemployed (test steady-state pilnuje tolerancji; rozjazd = fail).
  // Przyszły refactor hook: gdy lock/expedition przejdą na pulę bezrobotnych, ten getter
  // można zredukować do `return this._unemployed`. Do tego czasu — bez zmian.
  //
  // Faza 4 fix: `_employedPops` jest BRUTTO (zawiera etaty obsadzone droidami). Etat syntetyczny
  // NIE zajmuje ludzkiego zatrudnienia — człowiek zwolniony przez droida wraca do puli bezrobotnych
  // (liczonej w `population`). Bez netowania każdy droid drenował freePops o swój etat → „0 wolnych"
  // mimo bezrobotnych (rekrutacja zablokowana). Netujemy syntetyki (wzór konsumenta employmentu, jak
  // getSlotDemand-konsumenci §3.4) → przywraca inwariant freePops ≈ _unemployed. Clamp neta broni
  // przed rzadkim desync (writer employedPops vs slot).
  get freePops() {
    const netEmployed = Math.max(0, this._employedPops - this._syntheticJobsTotal());
    return Math.max(0, this.population - netEmployed - this._lockedPops);
  }

  /**
   * Wolne POPy w danej strata (count - demand - locked)
   */
  freeInStrata(strataType) {
    const s = this.strata[strataType];
    if (!s) return 0;
    const demand = this.buildingSystem?.getSlotDemand(strataType) ?? 0;
    const locked = this._lockedPerStrata[strataType] ?? 0;
    return Math.max(0, s.count - demand - locked);
  }

  /**
   * Zablokowane POPy w danej strata
   */
  lockedInStrata(strataType) {
    return this._lockedPerStrata[strataType] ?? 0;
  }

  // Kara za brak siły roboczej (gdy POP zginie a budynki stoją)
  // Skaluje produkcję budynków proporcjonalnie
  get employmentPenalty() {
    // Etaty obsadzone droidami netowane (nie wymagają ludzi, §3.4). Getter obecnie bez konsumentów —
    // netowanie dla spójności i bezpieczeństwa przy ew. reaktywacji.
    const needed = Math.max(0, this._employedPops - this._syntheticJobsTotal()) + this._lockedPops;
    if (needed <= 0 || this.population >= needed) return 1.0;
    return this.population / needed;
  }

  // ── Wyświetlanie populacji (1 POP = 100,000 mieszkańców) ────────────────

  /** Population 2.0: wyświetlana populacja = floor(humans) (jednostki POP, bez ułamków). */
  get displayPopulation() {
    return Math.floor(this.humans);
  }

  /**
   * JEDYNA metryka tempa wzrostu (Population 2.0): float z `_computeLogisticGrowth` PRZED
   * promocją do całkowitych jednostek, w JEDNOSTKACH POP / rok cywilny (NIE mieszkańcy — bez
   * konwersji ×100k). WSZYSTKIE UI czytają TO. Legacy `populationGrowthRate` USUNIĘTE,
   * `_lastGrowth` (binarny flag born>0?1:0) MARTWY — nie mylić z tempem.
   */
  getAnnualGrowth() {
    if (this.population <= 0) return 0;
    return this._computeLogisticGrowth();
  }

  /** Breakdown strat do UI */
  getStrataBreakdown() {
    const NAMES = STRATA_META;
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
        displayPop:   s.count,   // Population 2.0: jednostki POP (bez ×100k)
      });
    }
    return result;
  }

  /** Domyślny stan counterów do milestones */
  _defaultMilestoneState() {
    return {
      consecutiveHighProsperityYears: 0,
      consecutiveLowProsperityYears: 0,
      consecutiveFamineYears: 0,
      yearsWithoutTrade: 0,
      consecutiveHighTradeYears: 0,
      consecutiveHighResearchYears: 0,
      popAtReference: 0,
      popReferenceYear: 0,
      lastMilestoneYear: {},    // { type → year } dla cooldownów
      colonyAge: 0,             // lata istnienia kolonii (civYears)
      justSurvivedDisaster: false,
      justSurvivedCrisis: false,
    };
  }

  /** Dodaj milestone founding (wywoływać po utworzeniu kolonii, nie przy restore) */
  initFoundingMilestone() {
    if (this.colonyHistory.length > 0) return;  // już ma historię (restore)
    this.addMilestone('founding');
    this._milestoneState.popAtReference = this.population;
    this._milestoneState.popReferenceYear = 0;
  }

  // Z4: rozłącz ticker per-kolonia (ColonyManager.removeColony).
  dispose() {
    if (this._onTick) EventBus.off('time:tick', this._onTick);
    this._onTick = null;
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
      colonyHistory:        JSON.parse(JSON.stringify(this.colonyHistory)),
      milestoneState:       JSON.parse(JSON.stringify(this._milestoneState)),
      smoothedLoyalty:      this._smoothedLoyalty,
      suppressHistory:      [...this._suppressHistory],
      productionPenalties:  [...this._productionPenalties],
      autonomousState:      this._autonomousState,
      housing:              this.housing,
      habitatHousing:       this.habitatHousing,   // diagnostyka; restore przelicza z budynków
      epochIndex:           this.epochIndex,
      growthProgress:       this._growthProgress,
      unemployed:           this._unemployed,           // Population 2.0 Faza 2: pula bezrobotnych
      focusBonus:           { ...this._focusBonus },     // Faza 2: slider focus per strata (flag OFF)
      focusTarget:          { ...this._focusTarget },     // Slice 5C.1: docelowy share per strata
      focusMigrationProgress: { ...this._focusMigrationProgress },  // Slice 5C.1: akumulator friction
      satisfaction:         this.satisfaction,
      starvationYears:      this._starvationYears,
      employedPops:         this._employedPops,
      lockedPops:           this._lockedPops,           // backward compat (sum)
      lockedPerStrata:      { ...this._lockedPerStrata },
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

    // Identity + Loyalty + Movements
    this.identity          = data.identity         ?? { score: 0, events: [], dominantType: 'laborer', traits: [] };
    this._loyaltyModifiers = data.loyaltyModifiers ?? [];
    this.activeMovements   = data.activeMovements  ?? [];

    // Historia kolonii (milestones)
    this.colonyHistory        = data.colonyHistory        ?? [];
    this._milestoneState      = { ...this._defaultMilestoneState(), ...(data.milestoneState ?? {}) };
    this._smoothedLoyalty     = data.smoothedLoyalty       ?? 80;
    this._suppressHistory     = data.suppressHistory      ?? [];
    this._productionPenalties = data.productionPenalties  ?? [];
    this._autonomousState     = data.autonomousState      ?? false;
    this._traitCheckAccum     = 0;

    this.epochIndex           = data.epochIndex           ?? 0;
    this._growthProgress      = data.growthProgress       ?? 0;
    this._unemployed          = data.unemployed           ?? 0;   // Population 2.0 Faza 2 (stary save → 0)
    this._focusBonus          = data.focusBonus ? { ...data.focusBonus } : {};
    this._focusTarget           = data.focusTarget ? { ...data.focusTarget } : {};              // Slice 5C.1 (stary save → {})
    this._focusMigrationProgress = data.focusMigrationProgress ? { ...data.focusMigrationProgress } : {};
    this.satisfaction         = data.satisfaction         ?? 50;
    this._starvationYears     = data.starvationYears      ?? 0;
    // employedPops ustawiane na 0 — zostanie ponownie obliczone przez BuildingSystem.restoreFromSave()
    // lockedPerStrata przywracane z save (EventBus guard blokuje emisję z ExpeditionSystem.restore())
    this._employedPops        = 0;
    if (data.lockedPerStrata) {
      this._lockedPerStrata = { ...data.lockedPerStrata };
    } else {
      // Legacy: cały lockedPops trafia do laborer
      this._lockedPerStrata = {};
      const legacyLocked = data.lockedPops ?? 0;
      if (legacyLocked > 0) this._lockedPerStrata.laborer = legacyLocked;
    }
    this.housing              = DEFAULT_HOUSING;
    this.habitatHousing       = 0;   // przeliczany z budynków w BuildingSystem.restoreFromSave
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
    for (let y = 0; y < years; y++) {
      this._snapCache = null;  // Patch v5: świeży snapshot per yearly iteration
      this._yearlyUpdate();
    }
    this._syncConsumption();
  }

  _yearlyUpdate() {
    // Outposty (pop=0) nie mają głodu ani wzrostu
    if (this.population <= 0) return;

    // Cache resource ratios raz na yearly update (unika wielokrotnego obliczania)
    const foodRatio = this._resourceRatio('food') || this._resourceRatio('organics');

    // 0a. Alokacja siły roboczej (Population 2.0 Faza 2 §3.2) — PRZED satysfakcją, by
    //     bezrobocie było świeże. Wolne etaty zasysają bezrobotnych + migracja z tarciem.
    this._allocateWorkforce();
    // Faza 3 BUG 1: obsada zmieniła się → przelicz stawki budynków TEJ kolonii BEZPOŚREDNIO, by
    // ZUŻYCIE ENERGII (skalowane obsadą, max(0.2,staffing)) i produkcja trafiły do LIVE bilansu.
    // Wywołanie na własnym buildingSystem (nie event z guardem window.KOSMOS) → działa dla KAŻDEJ
    // kolonii (aktywnej i w tle); wcześniej event tylko dla aktywnej zostawiał tło ze stale stawkami.
    this.buildingSystem?._reapplyAllRates?.();

    // 0b. Satisfakcja per-strata (loyalty) + kolonii (Population 2.0 §3.5 → prosperity)
    this._updateStrataSatisfaction();
    this._updateSatisfaction();

    // 1. Wzrost populacji — logistyczny na `humans` (Population 2.0 §3.1). Nowi = bezrobotni.
    this._updateLogisticGrowth();

    // 2. Śmierć POPa (głód) — przekaż cached foodRatio
    this._updatePopDeath(foodRatio);

    // 3. Kryzysy (prosperity-based)
    this._updateUnrest();
    this._updateFamine();  // v57: czyta _resourceSnap wewnętrznie, bez parametru

    // 4. Ruchy spoleczne + loyalty
    this._updateMovementsAndLoyalty();

    // 5. Milestones + identity + cultural traits
    this._yearlyMilestoneCheck();
    this._updateIdentityFromHistory();
    this._tickProductionPenalties();

    // 5b. Cultural traits (co 10 lat cywilnych)
    this._traitCheckAccum = (this._traitCheckAccum ?? 0) + 1;
    if (this._traitCheckAccum >= 10) {
      this._traitCheckAccum = 0;
      this._checkTraitsFromHistory();
    }

    // 6. Epoka
    this._checkEpoch();

    // 6. Emituj (tylko aktywna kolonia → UI i BuildingSystem)
    if (window.KOSMOS?.civSystem === this) {
      EventBus.emit('civ:populationChanged', this._popSnapshot());
    }
  }

  // ── Wzrost populacji ────────────────────────────────────────────────────
  // (Slice 5D: martwy akumulator `_updatePopGrowth` USUNIĘTY — Population 2.0 wzrost
  //  liczy `_computeLogisticGrowth`/`_updateLogisticGrowth` niżej. Zero produkcyjnych wołaczy.)

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
        EventBus.emit('civ:popDied', {
          cause:      'exposure',
          population: this.population,
          planetId:   this._colonyId,
          colonyName: this.planet?.name ?? 'kolonia',
        });
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
          EventBus.emit('civ:popDied', {
            cause:      'starvation',
            population: this.population,
            planetId:   this._colonyId,
            colonyName: this.planet?.name ?? 'kolonia',
          });
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
        EventBus.emit('civ:unrestLifted', {
          planetId:   this._colonyId,
          colonyName: this.planet?.name ?? 'kolonia',
        });
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
          reason:        t('log.unrestReason', UNREST_YEARS_NEEDED),
          yearsInCrisis: UNREST_YEARS_NEEDED,
          planetId:      this._colonyId,
          colonyName:    this.planet?.name ?? 'kolonia',
        });
      }
    } else if (prosperity >= UNREST_RECOVERY_PROSPERITY) {
      this._lowProsperityYears = 0;
    }
  }

  _updateFamine() {
    // Nowe kryterium (v57): głód tylko gdy zapas < 1 rok konsumpcji I flow ujemny.
    // Stare kryterium (ratio < 0.02 przez 2 lata) dawało fałszywe alerty gdy amount=0
    // chwilowo lub gdy snapshot był niezsynchronizowany z faktycznym stanem.
    const foodRes = this._resourceSnap.food ?? this._resourceSnap.organics;
    if (!foodRes) {
      if (this._famineActive) this._famineActive = false;
      this._famineYears = 0;
      return;
    }

    const consumption = this.population * POP_CONSUMPTION.food;
    const yearsLeft = consumption > 0 ? (foodRes.amount ?? 0) / consumption : Infinity;
    const netFlow   = foodRes.perYear ?? 0;

    // Głód: mniej niż 1 rok zapasu AND produkcja < konsumpcji (netFlow < 0)
    const isStarving = yearsLeft < 1.0 && netFlow < 0;

    if (isStarving) {
      this._famineYears++;
      if (this._famineYears >= FAMINE_YEARS_NEEDED && !this._famineActive) {
        this._famineActive = true;
        EventBus.emit('civ:famine', {
          severity:   'severe',
          planetId:   this._colonyId,
          colonyName: this.planet?.name ?? 'kolonia',
          yearsLeft:  yearsLeft,
        });
      }
    } else {
      if (this._famineActive) {
        this._famineActive = false;
        EventBus.emit('civ:famineLifted', {
          planetId:   this._colonyId,
          colonyName: this.planet?.name ?? 'kolonia',
        });
      }
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
          planetId: this._colonyId,   // bramka Dziennika — epoka kolonii AI nie jest epoką gracza
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
    // Brak zapotrzebowania → naturalny wzrost (nie zero), żeby populacja rosła
    // laborer: 0.5 (główna siła robocza rośnie szybko)
    // reszta: 0.15 (naturalny przyrost niezależnie od demand)
    const minDemand = type === 'laborer' ? 0.5 : 0.15;

    const foodRatio = this._resourceRatio('food') || this._resourceRatio('organics');
    const foodMod   = this._foodGrowthModifier(foodRatio);
    const housingMod = this._housingGrowthModifier();
    const condMult  = (window.KOSMOS?.prosperitySystem?.getGrowthMultiplier() ?? 1.0) * Math.max(0.1, foodMod) * Math.max(0.1, housingMod);
    const satMult   = strata.satisfaction > 40 ? 1.0
                    : strata.satisfaction > 20 ? 0.5 : 0.1;

    const BASE = 0.08;  // bazowy przyrost per rok cywilny
    return BASE * Math.max(demand, minDemand) * condMult * satMult;
  }

  /** Satisfakcja danej straty (0-1) → przechowywana jako 0-100 */
  _calcStrataSatisfaction(type) {
    const foodRatio  = Math.min(1, this._resourceRatio('food') || this._resourceRatio('organics'));
    const waterRatio = Math.min(1, this._resourceRatio('water'));
    const housingOk  = this.effectiveHousing >= this.population ? 1.0 : (this.housing / Math.max(1, this.population));
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

  // (Slice 5D: martwy `_updateStrataGrowth` USUNIĘTY — zastąpiony przez _updateLogisticGrowth;
  //  zero produkcyjnych wołaczy. Rollback = git.)

  // ── Population 2.0: wzrost logistyczny + satysfakcja kolonii ─────────────

  /** Growth/rok wg logistyki (§3.1) — bez mutacji. Capacity = Σ housing (Decision 1). */
  _computeLogisticGrowth() {
    // Bramka non-breathable ZACHOWANA: bez dedykowanych habitatów brak wzrostu.
    const canLiveOutside = (this.planet?.atmosphere ?? 'breathable') === 'breathable';
    if (!canLiveOutside && this.population >= this.effectiveHabitatHousing) return 0;

    const capacity = this.housing;              // Σ housing wszystkich budynków (skończony)
    const humans = this.humans;
    if (capacity <= 0 || humans >= capacity) return 0;

    const prosperityMult = window.KOSMOS?.prosperitySystem?.getGrowthMultiplier() ?? 1.0;
    const factionMult    = window.KOSMOS?.factionSystem?.getModifier?.('popGrowth') ?? 1.0;
    // Slice 5A: taper bazowego tempa przy dużej populacji (per-capita slowdown, głównie ogon).
    const taper = GROWTH_TAPER_SCALE / (GROWTH_TAPER_SCALE + humans);
    const rate = BASE_GROWTH_RATE * prosperityMult * planetGrowthMod(this.planet) * factionMult * taper;
    const growth = rate * humans * (1 - humans / capacity);
    // Slice 5A: ABSOLUTNY cap /civYear (0.25 → plateau ~3 POP/gameYr @×12) — usuwa runaway w peaku (h=cap/2 → ~2.3) → koniec skoku bezrobocia.
    return Math.max(0, Math.min(MAX_GROWTH_PER_YEAR, growth));
  }

  /** Wzrost logistyczny — akrecja do `_growthProgress`; pełna jednostka → nowy BEZROBOTNY.
   *  Population 2.0 Faza 2 (§3.2): nowi ludzie wchodzą jako bezrobotni; alokacja (Etap 1)
   *  wchłania ich do wolnych etatów w następnym przebiegu. */
  _updateLogisticGrowth() {
    const growth = this._computeLogisticGrowth();
    if (growth <= 0) { this._lastGrowth = 0; return; }
    this._growthProgress += growth;
    let born = 0, guard = 0;
    while (this._growthProgress >= 1.0 && guard++ < 10000) {
      this._growthProgress -= 1.0;
      this._unemployed += 1;
      born++;
      if (window.KOSMOS?.civSystem === this) {
        EventBus.emit('civ:popBorn', {
          population: this.population, strataType: 'unemployed',
          planetId: this._colonyId, colonyName: this.planet?.name ?? 'kolonia',
        });
      }
    }
    this._lastGrowth = born > 0 ? 1 : 0;
  }

  // ── Population 2.0 Faza 2: zatrudnienie, płace, alokacja siły roboczej ─────

  /** Etaty budynkowe straty (brutto, wraz z syntetykami — jak getSlotDemand). */
  getStrataJobs(type)   { return this.buildingSystem?.getSlotDemand?.(type) ?? 0; }
  /** Etaty straty obsadzone przez syntetyki (netowane z popytu na ludzi, §3.4). */
  _syntheticJobs(type)  { return this.buildingSystem?.getSyntheticJobs?.(type) ?? 0; }
  /** Suma etatów obsadzonych syntetykami (wszystkie straty) — do netowania w freePops/needsImmigrants. */
  _syntheticJobsTotal() { return this.buildingSystem?.getSyntheticJobsTotal?.() ?? 0; }
  /** Realne etaty dla LUDZI = brutto − syntetyki. Alokacja obsadza tylko te. */
  _humanJobs(type)      { return Math.max(0, this.getStrataJobs(type) - this._syntheticJobs(type)); }
  /** Zatrudnieni w stracie (workers) = count (zawiera zablokowanych — spójne z produkcją). */
  getStrataWorkers(type){ return this.strata[type]?.count ?? 0; }

  /** Górny limit slidera focus straty = 25% etatów brutto (całkowite kroki, §2.6).
   *  Faza 2 fix: strata z 1–3 etatami dostaje min. 1 krok (inaczej slider znikał). */
  _focusCap(type) {
    const jobs = this.getStrataJobs(type);
    return jobs > 0 ? Math.max(1, Math.floor(FOCUS_BONUS_MAX * jobs)) : 0;
  }
  /** demandBonus (slider focus) straty — clamp do [0, cap]. */
  getStrataFocus(type)  { return Math.max(0, Math.min(this._focusCap(type), Math.round(this._focusBonus[type] ?? 0))); }
  /** Ustaw slider focus straty (intent method z UI). Nie tworzy realnych etatów — tylko pressure.
   *  Slice 5C.1: używane TYLKO gdy popAllocation2=OFF (stary slider int-focus). */
  setStrataFocus(type, value) {
    if (!this.strata[type]) return;
    this._focusBonus[type] = Math.max(0, Math.min(this._focusCap(type), Math.round(value ?? 0)));
  }

  // ── Slice 5C.1 (Allocation 2.0): focus = docelowy UDZIAŁ (share) ────────────
  /** Docelowy udział straty w mobilnej puli human-jobs (0..1). 0 = neutralny (bez targetu). */
  getStrataTarget(type)  { return Math.max(0, Math.min(1, this._focusTarget[type] ?? 0)); }
  /** Ustaw docelowy share straty (intent method z UI, suwak share-%). Clamp [0,1]; nie tworzy etatów. */
  setStrataTarget(type, value) {
    if (!this.strata[type]) return;
    const v = Math.max(0, Math.min(1, value ?? 0));
    if (v <= 0) delete this._focusTarget[type];   // pusty target = neutral (Σ ≤ 100% guard w alokacji)
    else this._focusTarget[type] = v;
  }
  // ── Slice 5C.2: transient target-bump z budynków PRIORYTETOWYCH (pull, stateless) ────────────
  /** Efektywny docelowy share straty = player target + priorytet-bump (gated), clamp [0,1]. Priorytet-bump
   *  = Σ ludzkich etatów budynków priority tej straty / mobilePool — świeże (bez push/stale; budynki niosą
   *  desygnację w save → po restore automatycznie odzwierciedlone). Cap Σ w _targetHeadcounts (normalizacja). */
  _effectiveTargetShare(type) {
    const base = Math.max(0, this._focusTarget[type] ?? 0);
    let bump = 0;
    if (GAME_CONFIG.FEATURES?.popAllocation2Priority === true) {
      const pjobs = this.buildingSystem?.getPriorityHumanJobs?.(type) ?? 0;
      const pool = this._mobileJobPool();
      if (pjobs > 0 && pool > 0) bump = pjobs / pool;
    }
    return Math.min(1, base + bump);
  }

  /** Czy gracz ustawił JAKIKOLWIEK target (>0) LUB istnieje transient bump (priorytet)? Pusty ≡
   *  dzisiejsza alokacja ekonomiczna (AI, Faza 3). */
  _hasAnyTarget() {
    for (const type of STRATA_TYPES) if (this._effectiveTargetShare(type) > 0) return true;
    return false;
  }
  /** Mobilna pula human-jobs = Σ realnych etatów dla ludzi (netto droidów; §3.4). Baza dla targetHeadcount. */
  _mobileJobPool() {
    let sum = 0;
    for (const type of STRATA_TYPES) sum += this._humanJobs(type);
    return sum;
  }
  /** Slice 5C.2: stan suwaka gracza (wskaźnik UI — cisza mechaniki myliła live-gate 5C.1):
   *  'off' (suwak 0) | 'unreachable' (za mało etatów tej straty by osiągnąć share) |
   *  'inactive_no_shortage' (osiągnięty lub PEŁNA obsada kolonii — brak niedoboru do rozdzielenia) |
   *  'active' (jest slack, target realnie ściąga). Liczony z SUWAKA gracza (nie transient bump). */
  /** Slice 5C.2 UX: podgląd docelowej liczby pracowników dla share GRACZA (≈N osób) + delta do obecnej
   *  obsady. `target` = osiągalny (capped do etatów), `desired` = surowy (przed capem, dla „unreachable"). */
  getTargetHeadcountPreview(type) {
    const share = this._focusTarget[type] ?? 0;
    const pool = this._mobileJobPool();
    const humanJobs = this._humanJobs(type);
    const desired = Math.floor(share * pool);
    const target = Math.min(humanJobs, desired);
    const current = this.getStrataWorkers(type);
    return { share, target, desired, current, delta: target - current, capped: desired > humanJobs };
  }
  getTargetState(type) {
    const share = this._focusTarget[type] ?? 0;
    if (share <= 0) return 'off';
    const humanJobs = this._humanJobs(type);
    const desired   = Math.floor(share * this._mobileJobPool());
    if (desired > humanJobs) return 'unreachable';
    if (this.getStrataWorkers(type) >= Math.min(humanJobs, desired)) return 'inactive_no_shortage';
    let openTotal = 0;
    for (const t of STRATA_TYPES) openTotal += Math.max(0, this._humanJobs(t) - this.getStrataWorkers(t));
    if (this._unemployed <= 0 && openTotal <= 0) return 'inactive_no_shortage';   // pełna obsada — nic do rozdzielenia
    return 'active';
  }

  /** Pressure straty (§3.3): (effDemand − workers − syntheticJobs) / effDemand, clamp[0,1].
   *  Slice 5C.1 (F10): pod popAllocation2 pressure = CZYSTY sygnał wage-scarcity (effDemand=grossJobs,
   *  BEZ focusu → koniec double-count focus→wage). Flag OFF = Faza 3 (effDemand=grossJobs+focus).
   *  Przy neutralnym focusie (=0) obie gałęzie dają identyczną wartość → kontrakt ekonomii byte-identical. */
  getStrataPressure(type) {
    const focusTerm = GAME_CONFIG.FEATURES?.popAllocation2 ? 0 : this.getStrataFocus(type);
    const effDemand = this.getStrataJobs(type) + focusTerm;
    if (effDemand <= 0) return 0;
    const raw = (effDemand - this.getStrataWorkers(type) - this._syntheticJobs(type)) / effDemand;
    return Math.max(0, Math.min(1, raw));
  }
  /** Płaca straty (§3.3): baseWage × (1 + pressure), cap ×2 (pressure∈[0,1]). */
  getStrataWage(type)      { return (BASE_WAGE[type] ?? 1) * (1 + this.getStrataPressure(type)); }
  /** Koszt pracy straty (Faza 3 hook): workers × wage. Faza 2: TYLKO liczony/eksponowany. */
  getStrataLaborCost(type) { return this.getStrataWorkers(type) * this.getStrataWage(type); }
  /** Sumaryczny koszt utrzymania siły roboczej (Faza 3: wydatek imperium — płace). */
  getTotalLaborCost() {
    let sum = 0;
    for (const type of STRATA_TYPES) sum += this.getStrataLaborCost(type);
    return sum;
  }

  /** Zatrudnieni (workers) = Σ strata = population − unemployed. Baza podatku (Faza 3, §3.7):
   *  bezrobotni ORAZ etaty obsadzone syntetykami płacą 0 (żadne nie mają workera w stracie).
   *  Zablokowani (crew/ekspedycje) SĄ zatrudnieni — trzymają etaty → płacą podatek i pobierają płacę. */
  get employed() { return this._strataCount; }

  /** Udział przemysłu w zatrudnieniu (§3.7): {laborer,miner,worker}/wszyscy zatrudnieni; 0 gdy brak. */
  getIndustryEmploymentShare() {
    const emp = this._strataCount;
    if (emp <= 0) return 0;
    const ind = (this.strata.laborer?.count ?? 0) + (this.strata.miner?.count ?? 0) + (this.strata.worker?.count ?? 0);
    return ind / emp;
  }

  /** Breakdown zatrudnienia do UI (zakładka Workforce) + Faza 3. */
  getWorkforceBreakdown() {
    const rows = [];
    for (const type of STRATA_TYPES) {
      const meta = STRATA_META[type] ?? { pl: type, en: type, icon: '•' };
      rows.push({
        type,
        namePL:    meta.pl,
        nameEN:    meta.en,
        icon:      meta.icon,
        jobs:      this._humanJobs(type),         // realne etaty dla ludzi (bez syntetyków)
        grossJobs: this.getStrataJobs(type),
        synthetic: this._syntheticJobs(type),
        workers:   this.getStrataWorkers(type),
        locked:    this._lockedPerStrata[type] ?? 0,
        pressure:  this.getStrataPressure(type),
        wage:      this.getStrataWage(type),
        focus:     this.getStrataFocus(type),         // flag OFF (int-focus slider)
        focusCap:  this._focusCap(type),
        target:    this.getStrataTarget(type),        // Slice 5C.1: docelowy share (0..1)
        // Termometr obsady: (POP + droidy) / etaty brutto, clamp [0,1]. Kolumna Droidy = synthetic.
        staffing:  (() => { const g = this.getStrataJobs(type); return g > 0 ? Math.min(1, (this.getStrataWorkers(type) + this._syntheticJobs(type)) / g) : 0; })(),
      });
    }
    return rows;
  }

  /** Dostępni do ruchu = całkowici odblokowani workers (floor — zablokowani ułamkowo NIE ruszają
   *  strata.count z całkowitości; crew NIGDY nie migruje). */
  _unlockedWorkers(type) {
    return Math.max(0, Math.floor(this.strata[type].count - (this._lockedPerStrata[type] ?? 0)));
  }

  /**
   * Alokacja siły roboczej (§3.2 / Slice 5C.1) — raz na rok cywilny (advanceMigration=true), PRZED
   * satysfakcją. Inwariant floor(humans) = Σ strata + _unemployed utrzymany: każdy ruch przenosi 1
   * osobę między pulą bezrobotnych a stratą (Etap 1) lub między stratami (Etap 2) — suma zachowana.
   * Zablokowani (załogi/ekspedycje) NIGDY nie migrują i nie stają się bezrobotni.
   *
   * @param {boolean} advanceMigration — Slice 5C.1: czy zaawansować MIGRACJĘ (Etap 2 / akumulator
   *   friction). true = ścieżka roczna (_yearlyUpdate); false = ścieżka mid-year
   *   (_reallocateAndRefresh przy install/remove droida) → tylko re-fill wolnych etatów (Etap 1),
   *   bez churnu migracji → idempotencja + kadencja roczna akumulatora. Pod flagą OFF migracja
   *   Fazy 3 działa jak dotąd (każde wywołanie).
   */
  _allocateWorkforce(advanceMigration = true) {
    if (!this.buildingSystem) return;   // abstrakcyjna kolonia bez budynków — pomiń (PHASE5_TODO: AI)

    // 0) Normalizacja CAŁKOWITOŚCI (Faza 3 BUG 3): `_lockedPerStrata` bywa UŁAMKOWE (crew rozdzielone
    //    proporcjonalnie przez _distributeLock) → dawniej `count − locked` wciekał ułamek do strata.count
    //    i _unemployed. Tu: floor każdej straty, reszta → bezrobotni; suma ludzi (całkowici) zachowana,
    //    inwariant floor(humans)=Σstrata+U trzyma. Czyści też legacy ułamki ze starych sesji.
    const totalPeople = Math.round(this._strataCount + this._unemployed);
    let assigned = 0;
    for (const type of STRATA_TYPES) { const c = Math.floor(this.strata[type].count); this.strata[type].count = c; assigned += c; }
    this._unemployed = Math.max(0, totalPeople - assigned);

    // 1) Rekoncyliacja utraty etatów (rozbiórka/downgrade/uszkodzenie): workers ponad realny
    //    popyt (poza zablokowanymi) → bezrobotni. To spina desync-fixy Fazy 1 (ImpactDamageSystem,
    //    RandomEventSystem zdejmują etaty przez changeEmployment → tutaj nadmiar staje się U).
    for (const type of STRATA_TYPES) {
      const s = this.strata[type];
      const evictable = Math.max(0, this._unlockedWorkers(type) - this._humanJobs(type));   // całkowite (floor unlocked)
      if (evictable > 0) { s.count -= evictable; this._unemployed += evictable; }
    }

    // Snapshot płac + pressure PO rekoncyliacji — deterministyczne priorytety.
    const wage = {}, pressure = {};
    for (const type of STRATA_TYPES) { wage[type] = this.getStrataWage(type); pressure[type] = this.getStrataPressure(type); }

    // Slice 5C.1: pusty target ≡ dzisiejsza alokacja EKONOMICZNA (AI, un-focused player, flag OFF).
    // Gdy gracz ustawił JAKIKOLWIEK target — alokacja dąży do kompozycji (Etap-1 additive overlay +
    // Etap-2 migracja z ułamkowym akumulatorem friction ku warstwom pod-targetowym).
    const targeted = (GAME_CONFIG.FEATURES?.popAllocation2 === true) && this._hasAnyTarget();
    if (targeted) {
      this._allocateStage1Targeted(wage, pressure);
      if (advanceMigration) this._allocateStage2Targeted(wage);
    } else {
      this._allocateStage1Economic(wage, pressure);
      // Flag OFF = Faza 3 dokładnie (migracja przy każdym wywołaniu); flag ON neutral = migracja roczna.
      if (advanceMigration || GAME_CONFIG.FEATURES?.popAllocation2 !== true) this._allocateStage2Economic(wage);
    }
  }

  // ── Etap 1/2 EKONOMICZNE (Faza 3 verbatim) — flag OFF + flag ON gdy brak targetu ────────────
  /** Etap 1 (bez tarcia) — wolne etaty zasysają bezrobotnych wg PRESSURE malejąco (tie-break: płaca).
   *  §3.2 (Faza 3): pressure zamiast płacy — inaczej focus na warstwach o niskiej baseWage (laborer)
   *  jest bezużyteczny. Kontrakt „pusty target ≡ dzisiejsza alokacja" — ta metoda jest DOKŁADNIE Fazą 3. */
  _allocateStage1Economic(wage, pressure) {
    let guard = 0;
    while (this._unemployed > 0 && guard++ < 100000) {
      let bestType = null, bestP = -Infinity, bestW = -Infinity;
      for (const type of STRATA_TYPES) {
        const open = this._humanJobs(type) - this.strata[type].count;
        if (open <= 0) continue;
        if (pressure[type] > bestP || (pressure[type] === bestP && wage[type] > bestW)) {
          bestP = pressure[type]; bestW = wage[type]; bestType = type;
        }
      }
      if (!bestType) break;
      this.strata[bestType].count += 1;
      this._unemployed -= 1;
    }
  }

  /** Etap 2 (z tarciem) — migracja między stratami: max 10% straty źródłowej / rok, tylko do
   *  ŚCIŚLE wyższej płacy z wolnym etatem. Zablokowani zostają. (Faza 3 verbatim.) */
  _allocateStage2Economic(wage) {
    const cap = {}, moved = {};
    for (const type of STRATA_TYPES) cap[type] = Math.floor(MIGRATION_FRICTION * this.strata[type].count);
    for (const src of STRATA_TYPES) {
      for (const dst of STRATA_TYPES) {
        if (dst === src || wage[dst] <= wage[src]) continue;           // tylko ściśle wyższa płaca
        const open = this._humanJobs(dst) - this.strata[dst].count;
        if (open <= 0) continue;
        const n = Math.min(cap[src] - (moved[src] ?? 0), open, this._unlockedWorkers(src));
        if (n <= 0) continue;
        this.strata[src].count -= n;
        this.strata[dst].count += n;
        moved[src] = (moved[src] ?? 0) + n;
      }
    }
  }

  // ── Etap 1/2 TARGET-GUIDED (Slice 5C.1) — gdy gracz ustawił docelowy share ──────────────────
  /** Docelowa liczba pracowników per strata = share × mobilePool. Suwaki są niezależne → gdy
   *  Σshare>1 skalujemy proporcjonalnie (target jako wagi względne, cap Σ≤100%). Per-strata cap do
   *  `_humanJobs` (nie można celować w więcej etatów niż istnieje). { type → int } tylko dla targetów. */
  _targetHeadcounts() {
    const pool = this._mobileJobPool();
    // Slice 5C.2: efektywny share = player target + transient bump (priorytet). Σ>1 → normalizacja
    // proporcjonalna (cap Σ≤100%, obejmuje bump — nadwyżka clamp).
    let sumShare = 0;
    for (const type of STRATA_TYPES) sumShare += this._effectiveTargetShare(type);
    const norm = sumShare > 1 ? 1 / sumShare : 1;
    const out = {};
    for (const type of STRATA_TYPES) {
      const share = this._effectiveTargetShare(type);
      if (share <= 0) continue;
      out[type] = Math.min(this._humanJobs(type), Math.floor(share * norm * pool));
    }
    return out;
  }

  /** Etap 1 target-guided — additive overlay: wolne etaty zasysają bezrobotnych wg klucza
   *  (targetDeficit desc, pressure desc, wage desc). Warstwy pod-targetowe prowadzą, reszta
   *  ekonomicznie (targetDeficit=0). Przy braku targetu klucz kolapsuje do Fazy 3 (pressure/wage). */
  _allocateStage1Targeted(wage, pressure) {
    const target = this._targetHeadcounts();
    let guard = 0;
    while (this._unemployed > 0 && guard++ < 100000) {
      let best = null; let bDef = -1, bP = -Infinity, bW = -Infinity;
      for (const type of STRATA_TYPES) {
        const open = this._humanJobs(type) - this.strata[type].count;
        if (open <= 0) continue;
        const deficit = Math.max(0, (target[type] ?? 0) - this.strata[type].count);   // 0 dla neutralnych
        if (best === null
            || deficit > bDef
            || (deficit === bDef && pressure[type] > bP)
            || (deficit === bDef && pressure[type] === bP && wage[type] > bW)) {
          best = type; bDef = deficit; bP = pressure[type]; bW = wage[type];
        }
      }
      if (best === null) break;
      this.strata[best].count += 1;
      this._unemployed -= 1;
    }
  }

  /** Etap 2 target-guided — migracja ku warstwom pod-targetowym z UŁAMKOWYM akumulatorem friction
   *  (F4): dla pary (src>dst) `_focusMigrationProgress += 0.10 × unlocked(src)`/rok; ruch = floor
   *  akumulatora (małe straty trickle: 3 workers → 0.3/rok → ruch po ~kilku latach). Dawcy: nad-targetowe
   *  / neutralne z mobilnymi (najniższa płaca dawcy najpierw); odbiorcy sort deficit desc, wage tie-break (F3). */
  _allocateStage2Targeted(wage) {
    const target = this._targetHeadcounts();
    const deficitOf = (t) => (target[t] ?? 0) - this.strata[t].count;
    const dsts = STRATA_TYPES
      .filter(t => deficitOf(t) > 0 && (this._humanJobs(t) - this.strata[t].count) > 0)
      .sort((a, b) => (deficitOf(b) - deficitOf(a)) || (wage[b] - wage[a]));   // większy deficit → wcześniej; tie: wyższa płaca (F3)
    for (const dst of dsts) {
      // Dawcy: nad-targetowe (surplus ponad ich target) najpierw, potem neutralne; najniższa płaca dawcy najpierw.
      // Warstwa targetowana i SAMA pod swoim targetem (deficit>0) NIE jest dawcą — potrzebuje ludzi, nie oddaje.
      // Bez tego dwie wzajemnie pod-targetowe warstwy okradałyby się w kółko (limit cycle, review 5C.1); przy
      // braku dawcy nad-/neutralnego poprawnym zachowaniem jest BRAK ruchu.
      const surplusOf = (t) => this.strata[t].count - ((target[t] ?? this.strata[t].count));
      const donors = STRATA_TYPES
        .filter(src => src !== dst && this._unlockedWorkers(src) > 0 && !(this._effectiveTargetShare(src) > 0 && deficitOf(src) > 0))
        .sort((a, b) => (surplusOf(b) - surplusOf(a)) || (wage[a] - wage[b]));
      for (const src of donors) {
        const open = this._humanJobs(dst) - this.strata[dst].count;
        const deficit = deficitOf(dst);
        if (open <= 0 || deficit <= 0) break;
        const key = src + '>' + dst;
        const prog = (this._focusMigrationProgress[key] ?? 0) + MIGRATION_FRICTION * this._unlockedWorkers(src);
        const n = Math.min(Math.floor(prog), open, deficit, this._unlockedWorkers(src));
        if (n > 0) {
          this.strata[src].count -= n;
          this.strata[dst].count += n;
          this._focusMigrationProgress[key] = prog - n;
        } else {
          this._focusMigrationProgress[key] = prog;   // trickle — carry akumulatora do przyszłego roku
        }
      }
    }
  }

  /** Satysfakcja kolonii (0-100, §3.5) — zasila warstwę infrastructure prosperity. */
  _updateSatisfaction() {
    const capacity = Math.max(1, this.housing);
    const crowding = Math.max(0, this.humans / capacity - SAT_CROWD_START) / SAT_CROWD_SPAN;
    const unemploymentRate = this.unemploymentRate;   // Population 2.0 Faza 2: realna pochodna (§3.2)
    const taxEffect = -taxSatisfactionDrain(window.KOSMOS?.colonyManager?.taxRate ?? 0.08) * SAT_W_TAX;
    const raw = SAT_BASE
              + SAT_W_EMP * Math.max(0, 1 - unemploymentRate * SAT_K_UNEMP)   // Slice 5A: floor-at-0 (człon nie schodzi w minus przy ekstremalnym bezrobociu)
              - SAT_W_CROWD * crowding
              + taxEffect;
    this.satisfaction = Math.max(0, Math.min(100, raw));
  }

  // ── Slice 5C.2 (F9): breakdown wzrostu i satysfakcji dla tooltipów (pure, unit-testowalne) ──
  /** Rozbicie tempa wzrostu (§3.1) — składniki `_computeLogisticGrowth` bez mutacji. `growth` = wynik
   *  identyczny z `getAnnualGrowth()` (przy population>0); `blockReason` wyjaśnia zero. */
  getGrowthBreakdown() {
    const canLiveOutside = (this.planet?.atmosphere ?? 'breathable') === 'breathable';
    const capacity = this.housing;
    const humans = this.humans;
    const prosperityMult = window.KOSMOS?.prosperitySystem?.getGrowthMultiplier() ?? 1.0;
    const factionMult    = window.KOSMOS?.factionSystem?.getModifier?.('popGrowth') ?? 1.0;
    const planetMod = planetGrowthMod(this.planet);
    const taper = GROWTH_TAPER_SCALE / (GROWTH_TAPER_SCALE + humans);
    const rate = BASE_GROWTH_RATE * prosperityMult * planetMod * factionMult * taper;
    const logistic = (humans > 0 && capacity > 0) ? humans * (1 - humans / capacity) : 0;
    const raw = rate * logistic;
    let blockReason = null;
    if (!canLiveOutside && this.population >= this.effectiveHabitatHousing) blockReason = 'no_habitat';
    else if (capacity <= 0) blockReason = 'no_housing';
    else if (humans >= capacity) blockReason = 'at_capacity';
    else if (raw > MAX_GROWTH_PER_YEAR) blockReason = 'rate_capped';
    // Review: getAnnualGrowth() zwraca 0 przy population<=0 — tooltip musi się zgadzać z footerem.
    const hardZero = this.population <= 0 || blockReason === 'no_habitat' || blockReason === 'no_housing' || blockReason === 'at_capacity';
    if (this.population <= 0 && !blockReason) blockReason = 'no_pop';
    return {
      base: BASE_GROWTH_RATE, prosperityMult, planetMod, factionMult, taper,
      capacity, humans, fillFrac: capacity > 0 ? Math.min(1, humans / capacity) : 1,
      raw, cap: MAX_GROWTH_PER_YEAR, capped: raw > MAX_GROWTH_PER_YEAR,
      growth: hardZero ? 0 : Math.max(0, Math.min(MAX_GROWTH_PER_YEAR, raw)),
      blockReason,
    };
  }

  /** Rozbicie satysfakcji (§3.5) — składniki `_updateSatisfaction` bez mutacji. */
  getSatisfactionBreakdown() {
    const capacity = Math.max(1, this.housing);
    const crowding = Math.max(0, this.humans / capacity - SAT_CROWD_START) / SAT_CROWD_SPAN;
    const unemploymentRate = this.unemploymentRate;
    const taxRate = window.KOSMOS?.colonyManager?.taxRate ?? 0.08;
    const empTerm   = SAT_W_EMP * Math.max(0, 1 - unemploymentRate * SAT_K_UNEMP);
    const crowdTerm = -SAT_W_CROWD * crowding;
    const taxTerm   = -taxSatisfactionDrain(taxRate) * SAT_W_TAX;
    const raw = SAT_BASE + empTerm + crowdTerm + taxTerm;
    return {
      base: SAT_BASE, empTerm, crowdTerm, taxTerm,
      unemploymentRate, crowding, taxRate,
      satisfaction: Math.max(0, Math.min(100, raw)),
    };
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
    return Math.max(0, Math.min(100, this._smoothedLoyalty ?? 80));
  }

  /** Oblicz docelową lojalność i wygładź (wywoływane w _updateMovementsAndLoyalty) */
  _recalcLoyalty() {
    // Population 2.0 Faza 2: mianownik = Σ strata (zatrudnieni), NIE population (która zawiera
    // teraz bezrobotnych) — inaczej pula bezrobotnych rozcieńczałaby średnią satysfakcję strat.
    // Wpływ bezrobocia na kolonię idzie osobno przez satisfaction (§3.5).
    const total = this._strataCount;
    if (total === 0) { this._smoothedLoyalty = 80; return; }

    // Baza: weighted avg satisfaction strat
    let weighted = 0;
    for (const [, s] of Object.entries(this.strata)) {
      weighted += s.count * s.satisfaction;
    }
    const baseLoyalty = weighted / total;

    // Permanentne modyfikatory z historii
    const historyOffset = (this.colonyHistory ?? []).reduce((sum, m) => sum + (m.loyaltyPerm ?? 0), 0);

    // Dynamiczne czynniki (prosperity, handel, odległość)
    let dynamicDelta = 0;
    const prosperity = window.KOSMOS?.prosperitySystem?.prosperity ?? 50;
    if (prosperity > 70)      dynamicDelta += 1.5;
    else if (prosperity > 50) dynamicDelta += 0.3;
    else if (prosperity > 25) dynamicDelta -= 0.5;
    else                      dynamicDelta -= 2.0;

    // Trasy handlowe z homeworld
    const tradeSys = window.KOSMOS?.civilianTradeSystem;
    const homeTradeCount = tradeSys?.getConnectionsToHome?.(this._colonyId) ?? 0;
    dynamicDelta += Math.min(5, homeTradeCount * 1.0);
    const colonyAge = this._milestoneState?.colonyAge ?? 0;
    if (homeTradeCount === 0 && colonyAge > 20) dynamicDelta -= 1.0;

    // Odległość od homeworld
    const homePlanet = window.KOSMOS?.homePlanet;
    if (homePlanet && this.planet && this.planet !== homePlanet) {
      const dx = (this.planet.physics?.x ?? 0) - (homePlanet.physics?.x ?? 0);
      const dy = (this.planet.physics?.y ?? 0) - (homePlanet.physics?.y ?? 0);
      const distAU = Math.sqrt(dx * dx + dy * dy);
      dynamicDelta -= 0.1 * distAU;
    }

    // Amplifikator identity: wysoka tożsamość = namiętne zmiany lojalności
    const amplifier = 0.5 + (this.identity?.score ?? 0) / 100;
    const amplifiedDelta = dynamicDelta * amplifier;

    // Decaying modifiers (z ruchów społecznych)
    const modSum = (this._loyaltyModifiers ?? []).reduce((s, m) => s + m.value, 0);

    // Penalty z cech kulturowych (martyrs_colony -10)
    let traitPenalty = 0;
    for (const traitId of (this.identity?.traits ?? [])) {
      const trait = CULTURAL_TRAITS[traitId];
      if (trait?.loyaltyPenalty) traitPenalty += trait.loyaltyPenalty;
    }

    // Autonomia: cap loyalty na 55
    const autonomyCap = this._autonomousState ? 55 : 100;

    // Wpływ podatków na lojalność (odczyt globalnego taxRate, liniowa interpolacja)
    const taxRate = window.KOSMOS?.colonyManager?.taxRate ?? 0.08;
    const taxOffset = taxRate <= 0.05 ? 5
                    : taxRate <= 0.12 ? 0
                    : -(taxRate - 0.12) / 0.13 * 25;  // 0→-25 liniowo 12%→25%

    const target = Math.min(autonomyCap, baseLoyalty + historyOffset + amplifiedDelta + modSum + traitPenalty + taxOffset);

    // Inercja — loyalty dąży do target (15% per rok)
    this._smoothedLoyalty += (target - this._smoothedLoyalty) * 0.15;
    this._smoothedLoyalty = Math.max(0, Math.min(100, this._smoothedLoyalty));
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
      startYear:  Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0),
      strength:   movDef.strength,
      resolved:   false,
    };
    this.activeMovements.push(movement);

    // Milestone: revolution (lub separatism_crisis)
    const milestoneType = forceType === 'separatism' ? 'separatism_crisis' : 'revolution';
    this.addMilestone(milestoneType, {
      movementName: movDef.namePL,
      movementNameEN: movDef.nameEN,
    });

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

    // Modyfikator lojalnosci (decaying)
    if (resolution.loyaltyDelta !== 0) {
      this.addLoyaltyModifier(resolution.loyaltyDelta, `movement_${movementType}_${resolutionId}`);
    }

    // Identity event (legacy system — zachowany dla kompatybilności)
    if (resolution.identityEvent) {
      this._addIdentityEvent(resolution.identityEvent);
    }

    // Milestone z resolution
    if (resolutionId === 'negotiate') {
      this.addMilestone('reconciliation');
      // Kara produkcji -5% na 5 lat
      if (resolution.productionMult && resolution.productionYears) {
        this._productionPenalties.push({
          mult: resolution.productionMult,
          remainingYears: resolution.productionYears,
        });
      }
    } else if (resolutionId === 'suppress') {
      this.addMilestone('suppression');
      // Zapamiętaj suppress do eskalacji
      const year = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
      this._suppressHistory.push({ year, movementType });
      // Eskalacja: 2× suppress w 30 lat → automatyczny separatyzm
      const recent = this._suppressHistory.filter(s => (year - s.year) < 30);
      if (recent.length >= 2 && !this.activeMovements.find(m => m.type === 'separatism')) {
        this._triggerMovement(null, 'separatism');
      }
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
      year: Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0),
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
        year:      Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0),
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

    // Przelicz loyalty (nowy system z historyOffset + dynamiczne)
    this._recalcLoyalty();

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
      growthRate:        this.getAnnualGrowth(),
      housing:           this.effectiveHousing,
      growth:            this._lastGrowth,   // DEAD: binarny flag (born>0?1:0), NIE tempo — użyj growthRate
      growthProgress:    this._growthProgress,
      freePops:          this.freePops,
      employedPops:      this._employedPops,
      unemployed:        this._unemployed,   // Population 2.0 Faza 2
      lockedPops:        this._lockedPops,
      epoch:             this.epochName,
      isUnrest:          this._unrestActive,
      isFamine:          this._famineActive,
      loyalty:           this.loyalty,
      activeMovements:   this.activeMovements.length,
      identityScore:     this.identity.score,
    };
  }

  // ── Milestones — kamienie milowe historii kolonii ─────────────────────────

  /** Dodaj milestone do historii (ręcznie — z ruchów, budynków itp.) */
  addMilestone(type, extraContext = {}) {
    const def = MILESTONE_BY_TYPE[type];
    if (!def) return;

    const year = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);

    // Sprawdź cooldown
    const lastYear = this._milestoneState.lastMilestoneYear[type] ?? -Infinity;
    if (def.cooldown && (year - lastYear) < def.cooldown) return;

    // Sprawdź unikalność
    if (def.unique && this.colonyHistory.some(h => h.type === type)) return;

    const colName = this.planet?.name ?? 'Kolonia';
    const col = { name: colName, year, ...extraContext };

    const entry = {
      year,
      type,
      namePL:        typeof def.namePL === 'function' ? def.namePL(col) : def.namePL,
      nameEN:        typeof def.nameEN === 'function' ? def.nameEN(col) : def.nameEN,
      icon:          def.icon,
      loyaltyPerm:   def.loyaltyPerm ?? 0,
      identityValue: def.identityValue ?? 0,
    };
    this.colonyHistory.push(entry);
    this._milestoneState.lastMilestoneYear[type] = year;

    // Callback po triggerze (np. reset counterów)
    if (def.onTrigger) def.onTrigger(this._milestoneState);

    // Emit event (EventLog + opcjonalnie auto-pause)
    if (window.KOSMOS?.civSystem === this) {
      EventBus.emit('civ:milestoneReached', {
        colony: this._colonyId,
        colonyName: colName,
        milestone: entry,
        crisis: !!def.crisis,
      });
    }
  }

  /** Sprawdź milestones co rok — aktualizuj countery i triggeruj automatyczne */
  _yearlyMilestoneCheck() {
    const st = this._milestoneState;
    st.colonyAge = (st.colonyAge ?? 0) + 1;

    // Aktualizuj countery na podstawie bieżącego stanu
    const prosperity = window.KOSMOS?.prosperitySystem?.prosperity ?? 50;
    if (prosperity > 80) {
      st.consecutiveHighProsperityYears = (st.consecutiveHighProsperityYears ?? 0) + 1;
      st.consecutiveLowProsperityYears = 0;
    } else if (prosperity < 25) {
      st.consecutiveLowProsperityYears = (st.consecutiveLowProsperityYears ?? 0) + 1;
      st.consecutiveHighProsperityYears = 0;
    } else {
      st.consecutiveHighProsperityYears = 0;
      st.consecutiveLowProsperityYears = 0;
    }

    // Głód
    if (this._famineActive) {
      st.consecutiveFamineYears = (st.consecutiveFamineYears ?? 0) + 1;
    } else {
      // Jeśli famine się skończyło właśnie — milestone crisis_survived
      if (st.consecutiveFamineYears > 0) {
        st.justSurvivedCrisis = true;
      }
      st.consecutiveFamineYears = 0;
    }

    // Unrest end → crisis_survived
    if (!this._unrestActive && st._wasUnrest) {
      st.justSurvivedCrisis = true;
    }
    st._wasUnrest = this._unrestActive;

    // Handel
    const tradeSys = window.KOSMOS?.civilianTradeSystem;
    const tradeCount = tradeSys?.getConnectionsToHome?.(this._colonyId) ?? 0;
    if (tradeCount > 0) {
      st.consecutiveHighTradeYears = (st.consecutiveHighTradeYears ?? 0) + 1;
      st.yearsWithoutTrade = 0;
    } else {
      st.yearsWithoutTrade = (st.yearsWithoutTrade ?? 0) + 1;
      st.consecutiveHighTradeYears = 0;
    }
    st.activeTradeRoutes = tradeCount;

    // Research output
    const resSnap = this._resourceSnap?.research;
    const researchPerYear = resSnap?.perYear ?? 0;
    if (researchPerYear >= 200) {
      st.consecutiveHighResearchYears = (st.consecutiveHighResearchYears ?? 0) + 1;
    } else {
      st.consecutiveHighResearchYears = 0;
    }

    // Population boom (×3 w ciągu 30 lat)
    if (st.popAtReference <= 0 || st.popReferenceYear <= 0) {
      st.popAtReference = this.population;
      st.popReferenceYear = st.colonyAge;
    }
    const popAge = st.colonyAge - st.popReferenceYear;
    if (popAge >= 30) {
      if (this.population >= st.popAtReference * 3) {
        st.popTripled = true;
      }
      // Reset reference co 30 lat
      st.popAtReference = this.population;
      st.popReferenceYear = st.colonyAge;
    }

    // Sprawdź każdy milestone z condition
    for (const def of MILESTONE_DEFINITIONS) {
      if (typeof def.condition !== 'function') continue;
      if (!def.condition(st)) continue;

      // Unique check
      if (def.unique && this.colonyHistory.some(h => h.type === def.type)) continue;

      // Cooldown check
      const year = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
      const lastYear = st.lastMilestoneYear[def.type] ?? -Infinity;
      if (def.cooldown && (year - lastYear) < def.cooldown) continue;

      this.addMilestone(def.type);
    }
  }

  /** Przelicz identity z historii kolonii */
  _updateIdentityFromHistory() {
    if (!this.colonyHistory || this.colonyHistory.length === 0) return;

    this.identity.score = Math.min(100, Math.max(0,
      this.colonyHistory.reduce((sum, m) => sum + (m.identityValue ?? 0), 0)
    ));

    // Dominant type: strata z największą populacją
    let maxCount = 0;
    for (const [type, s] of Object.entries(this.strata)) {
      if (s.count > maxCount) {
        maxCount = s.count;
        this.identity.dominantType = type;
      }
    }
  }

  /** Sprawdź cechy kulturowe na podstawie historii (co 10 lat civYears) */
  _checkTraitsFromHistory() {
    if (!this.colonyHistory || this.colonyHistory.length === 0) return;
    if (!this.identity.traits) this.identity.traits = [];

    for (const [id, trait] of Object.entries(CULTURAL_TRAITS)) {
      if (this.identity.traits.includes(id)) continue;
      if (typeof trait.condition !== 'function') continue;

      if (trait.condition(this.colonyHistory, this.identity.score)) {
        this.identity.traits.push(id);

        if (window.KOSMOS?.civSystem === this) {
          EventBus.emit('civ:traitUnlocked', {
            colony: this._colonyId,
            colonyName: this.planet?.name ?? 'Kolonia',
            traitId: id,
            trait,
          });
        }
      }
    }
  }

  /** Tick production penalties (z negotiate resolution — -5% na 5 lat) */
  _tickProductionPenalties() {
    if (!this._productionPenalties) return;
    for (let i = this._productionPenalties.length - 1; i >= 0; i--) {
      this._productionPenalties[i].remainingYears--;
      if (this._productionPenalties[i].remainingYears <= 0) {
        this._productionPenalties.splice(i, 1);
      }
    }
  }

  // ── Publiczne API dla BuildingSystem ──────────────────────────────────────

  /** Mnożnik produkcji z lojalności (0.6 do 1.05) */
  getLoyaltyProductionMultiplier() {
    const l = this.loyalty;
    if (l > 70) return 1.05;
    if (l > 30) return 1.0;
    if (l > 15) return 0.80;
    return 0.60;
  }

  /** Mnożnik produkcji z production penalties (negotiate) */
  getProductionPenaltyMultiplier() {
    if (!this._productionPenalties || this._productionPenalties.length === 0) return 1.0;
    let mult = 1.0;
    for (const p of this._productionPenalties) {
      mult += p.mult;
    }
    return Math.max(0.5, mult);
  }

  /** Bonusy produkcji z cech kulturowych { mining, factory, research, trade, all, hostile } */
  getTraitProductionBonus() {
    const bonus = { mining: 0, factory: 0, research: 0, trade: 0, all: 0, hostile: 0 };
    if (!this.identity?.traits) return bonus;
    for (const traitId of this.identity.traits) {
      const trait = CULTURAL_TRAITS[traitId];
      if (!trait?.productionBonus) continue;
      for (const [key, val] of Object.entries(trait.productionBonus)) {
        bonus[key] = (bonus[key] ?? 0) + val;
      }
    }
    return bonus;
  }

  /** Czy kolonia jest autonomiczna (separatyzm) */
  get isAutonomous() { return this._autonomousState; }
  set isAutonomous(val) { this._autonomousState = !!val; }
}
