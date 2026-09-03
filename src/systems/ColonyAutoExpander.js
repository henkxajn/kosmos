// ═══════════════════════════════════════════════════════════════
// ColonyAutoExpander — Warstwa B AI: auto-rozbudowa kolonii
// ───────────────────────────────────────────────────────────────
// Działa dla kolonii należących do AI Empire (ownerEmpireId != null).
// Logikę implementujemy TYLKO dla archetypu 'industrialist'; pozostałe
// archetypy podpina się przez rozbudowę ARCHETYPE_TARGETS (mapa archetyp→dane).
//
// Dwa moduły decyzyjne, priorytet SURVIVAL > TARGET:
//   1. SURVIVAL RULES (reaktywne, co 1 civYear) — gdy kolonia poniżej progu,
//      rozwiązuj problem przeżycia ZANIM ruszysz target states.
//   2. TARGET STATES (deklaratywne, co 3 civYears) — dąż do INDUSTRIALIST_TARGETS.
//
// Źródło prawdy: src/data/targets/industrialist.js.
// Build/upgrade idą KOSZTOWO (z inventory) przez per-kolonia BuildingSystem
//   bezpośrednio (bypass guarda aktywnej kolonii — event planet:buildRequest
//   działa tylko dla window.KOSMOS.buildingSystem === aktywna).
// ═══════════════════════════════════════════════════════════════

import EventBus from '../core/EventBus.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { POP_CONSUMPTION } from '../data/ResourcesData.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';
import { getTerrainRule } from '../data/ai/AiTerrainRules.js';
import {
  INDUSTRIALIST_TARGETS,
  INDUSTRIALIST_SURVIVAL_THRESHOLDS,
} from '../data/targets/industrialist.js';

// Tempo decyzji (z architektury AI)
const TARGET_INTERVAL_CIVYEARS   = 3;   // Warstwa B: target actions co 3 civYears
const SURVIVAL_INTERVAL_CIVYEARS = 1;   // survival check co 1 civYear (głód nie czeka)

// Anti-thrashing — daj postawionemu budynkowi czas się włączyć
const SURVIVAL_ANTI_THRASH_CIVYEARS = 3;   // ta sama akcja survival nie częściej niż co 3y
const TARGET_COOLDOWN_CIVYEARS      = 1;   // cooldown między target actions na koloni

// Personality modifier — MVP: jeden mnożnik cooldownu na archetyp (baseline 1.0).
// Inne archetypy spowolnią/przyspieszą tempo (struktura gotowa, wartości później).
const ARCHETYPE_COOLDOWN_MULTIPLIER = {
  industrialist: 1.0,
  expansionist:  1.0,   // S3.1a: klon Industrialist (to samo tempo rozbudowy kolonii)
  // diplomat:  1.5,
  // militarist: 0.7,
};

// Mapa archetyp → dane targetów. Dodanie archetypu = dopisanie wpisu.
const ARCHETYPE_DATA = {
  industrialist: {
    targets:   INDUSTRIALIST_TARGETS,
    survival:  INDUSTRIALIST_SURVIVAL_THRESHOLDS,
  },
  // Expansionist (S3.1a) to behawioralny KLON Industrialist na poziomie rozbudowy
  //   POJEDYNCZEJ kolonii — różni się TYLKO strategicColonization.maxExtraSystems
  //   (S3.1b), a to domena EmpireStrategySystem (kolonizacja galaktyczna), nie
  //   AutoExpandera. Auto-rozbudowa kolonii jest identyczna → współdzieli targets/
  //   survival Industrialist. Gdy S3.2 doda własną doktrynę warp/ekspansji,
  //   wydzielić osobny src/data/targets/expansionist.js i podmienić wpis.
  expansionist: {
    targets:   INDUSTRIALIST_TARGETS,
    survival:  INDUSTRIALIST_SURVIVAL_THRESHOLDS,
  },
};

// Reguły terenu AI (hard/soft) — współdzielone z EmpireColonyBootstrap przez
// src/data/ai/AiTerrainRules.js (mine/farm/well hard → odpowiednio mountains/
// plains; factory/smelter/habitat soft). Patrz getTerrainRule().

// Unreachable targets — gdy _build/_upgrade silent-failuje (np. brak technologii),
// nie próbuj tego budynku w kółko. Po REGISTER czekaj RETRY civYears i spróbuj raz
// (a nuż techy się odkryły); znów fail → ponowny backoff.
const UNREACHABLE_RETRY_CIVYEARS = 30;

// ── Anti-deadlock (Y1/Y2/Y3) ───────────────────────────────────────────────
// Rate limit kolejki rozbudowy per kolonia. Bez tego AutoExpander traktował każde
// 'queued' jako sukces i dosypywał w nieskończoność (death spiral: 88 budynków,
// nic nie produkuje). Limity sprzęgają AI z REALNĄ przepustowością kolonii.
//   - Build i upgrade to OSOBNE pule (różne limity), ale śledzone w JEDNEJ mapie
//     colony._caePendingBuilds (klucz = tileKey, unikalny — tile nie jest naraz
//     budowany i upgradeowany). Rozdział przez flagę rec.isUpgrade.
//   - Wartość 3 (build) wynika z obserwacji: gracz w nagraniu referencyjnym miał
//     typowo 1–2 budynki w budowie naraz; 3 to bezpieczny bufor. BuildingSystem
//     nie ma twardego maxConcurrentBuilds, więc limit egzekwuje AutoExpander.
// ── Finding 182 / D3 — bramka zamoznosci dla celow zapasu tier 3+ ────────────
// Cel zapasu tier 3+ (50, z startingSafetyStocks archetypu) wlacza sie DOPIERO, gdy
// kolonia jest realnie bogata. Powod jest ZMIERZONY, nie ostrozniosciowy: wariant bez
// bramki kosztowal ekspansje — imperia bez zadnej placowki 1/32 -> 3/32, obsada etatow
// 97% -> 94% (panel 16 seedow). Koszt spada na imperium UBOGIE, wiec bramka jest
// OCHRONA BIEDNEGO, nie przyspieszeniem bogatego.
//
// ⚠ ODSTEPSTWO OD LITERALNYCH PROGOW Z PODPISU (>20k dla wiekszosci, >5k dla Xe/Nt).
// Pomiar stanow PER RUDA w stolicach AI po 45 gy:
//   industrialist  Si 71k  Fe 45k  Cu 38k  C 33k | Hv 10.6k  Ti 10.2k  Xe 4.9k  Li 4.5k
//   expansionist   Si 62k  C 54k   H 47k   Li 17k | Fe 13k  Hv 9.3k  Ti 4.1k  Cu 2.8k  Xe 0.9k
// Setki tysiecy rudy istnieja TYLKO w agregacie i tylko na rudach POSPOLITYCH. Ti/Hv/Li
// nigdy nie dobijaja 20k, Xe rzadko 5k, a Nt jest ZEROWE u obu. Literalne progi trzymalyby
// bramke zamknieta niemal zawsze => zmiana bylaby no-opem. Dlatego zamoznosc mierzymy
// rudami POSPOLITYMI, a rud rzadkich NIE bramkujemy: to wlasnie one sa wsadem receptur,
// wiec warunek -produkuj dopiero, gdy masz duzo tego, co receptura zjada- bylby cykliczny.
// 225 / R4 — zapas ponad break-even karmicieli. Glod uderza ZANIM licznik pokaze deficyt,
// bo `empPenalty` reaguje z opoznieniem, a populacja spada skokowo.
const FEEDER_MARGIN = 1.25;

// 225 / R4 — ponizej tej obsady deficyt energii jest OBSADOWY, nie mocowy: dokladanie
// elektrowni dodaje wtedy etaty, ktorych nie ma kto obsadzic, i poglebia problem.
const STAFFING_CRITICAL = 0.35;

// 225 — podloga obsady w liczeniu REALNEJ wydajnosci karmiciela. Bez niej przy obsadzie ~0
// cel wychodzilby w nieskonczonosc; z nia cap obsadzalnosci i tak go przycina.
const FEEDER_STAFFING_FLOOR = 0.25;
// S4a (D-S4-1): margines budżetu pracy — ile job-units wolno mieć PONAD pracowników warstwy.
const LABOR_BUDGET_MARGIN = 2;

const WEALTH_ORES      = ['Fe', 'Si', 'Cu', 'C'];
const WEALTH_THRESHOLD = 20000;   // jednostki rudy, KAZDA z WEALTH_ORES osobno
// 246 / E3H — pasmo histerezy na `wealthFrac` (= min po WEALTH_ORES z stock/WEALTH_THRESHOLD).
//   ⚠ PASMO, nie prog. Sam cel skalowany (bez histerezy) migocze: `round((target-1)*frac)` dla
//   MAŁYCH celów tier 3+ zaokrągla się do 0 albo 1, a KAŻDE ponowne wejście popytu do skanu jest
//   szansą na wyparcie pozycji build|consumption w wywołaniu ze związanym budżetem FP. ZMIERZONE:
//   3376 przejść przez zero i 1,78 wyparcia/1k (sam cel) wobec 880 i 0,08 (z pasmem) — pasmo E0
//   to [0 ; 0,32]. ⚠ Podłoga `max(2, scaled)` była MIERZONA I PRZEGRAłA (2,63/1k): trzyma popyt
//   tier 3+ na stałe włączony, więc konkuruje w KAŻDYM związanym wywołaniu.
//   Progi PROWIZORYCZNE — wyprowadzone z punktu pracy ekspansjonisty (frac ≈ 0,25 na obu galaktykach),
//   NIE z trajektorii churnu; `CHAIN_ENTRY_PLAN.md` §11.3 zapisuje tę lukę wprost.
const WEALTH_OPEN  = 0.20;   // zatrzask OTWIERA sie, gdy wealthFrac >= tyle
const WEALTH_CLOSE = 0.12;   // ...i ZAMYKA dopiero ponizej tego (pasmo 8 pp)

export const MAX_PENDING_BUILDS_PER_COLONY   = 3;
export const MAX_PENDING_UPGRADES_PER_COLONY = 2;

// Pending build bez postępu dłużej niż to → uznaj za prawdziwy fail (POP nigdy nie
// dojdą), anuluj zamówienie i oznacz buildingId jako unreachable.
const PENDING_STUCK_CIVYEARS = 30;

// Tile który zwrócił [fail] z _tryBuild → backoff dłuższy niż buildingId (teren się
// nie zmienia). Wykluczany w _findFreeTile do retryAtCivYear.
const TILE_BLACKLIST_CIVYEARS = 60;

// Throttle logów "queue full" / "rest" — nie spamuj co 1 civYear.
const QUEUE_LOG_INTERVAL_CIVYEARS = 30;

// Kolejność priorytetu budowy w module TARGET (esencja → produkcja → reszta).
const BUILD_PRIORITY = [
  'farm', 'well', 'solar_farm', 'mine', 'factory', 'smelter',
  'habitat', 'shipyard', 'research_station', 'observatory',
];

// 3 consumer goods — pokrycie napędza prosperity (patrz FILOZOFIA w targets).
const CONSUMER_GOODS = ['basic_supplies', 'civilian_goods', 'neurostimulants'];

// Checkpointy targetów (gameYear → klucz). Sortowane rosnąco.
const CHECKPOINTS = [
  { gy: 10, key: 'gameYear_10' },
  { gy: 20, key: 'gameYear_20' },
  { gy: 30, key: 'gameYear_30' },
  { gy: 40, key: 'gameYear_40' },
];

export class ColonyAutoExpander {
  // MVP: AutoExpander współistnieje z EmpireColonyMaintenance.
  // Maintenance robi _reapplyAllRates co 1 civYear (Warstwa A residual).
  // AutoExpander buduje/upgrade'uje co 3 civYears (Warstwa B).
  // Cel długofalowy: po stabilizacji AutoExpander przejmie reapply i Maintenance znika.
  constructor() {
    this._survivalAcc = 0;
    this._targetAcc   = 0;

    // Devtool: logi akcji w konsoli. Włącz: KOSMOS.colonyAutoExpander._verbose = true.
    this._verbose = false;

    this._onTick = ({ civDeltaYears }) => this._tick(civDeltaYears ?? 0);
    EventBus.on('time:tick', this._onTick);
  }

  stop() {
    EventBus.off('time:tick', this._onTick);
  }

  // Log akcji (gated _verbose):
  //   [ColonyAutoExpander] [<colonyName>] <module>: <akcja> (cy=<civYear>) — <kontekst>
  _log(colony, module, action, context, civYear) {
    if (!this._verbose) return;
    const name = colony?.name ?? colony?.planetId ?? '?';
    const ctx  = context ? ` — ${context}` : '';
    console.log(`[ColonyAutoExpander] [${name}] ${module}: ${action} (cy=${civYear})${ctx}`);
  }

  // ── Pętla czasu ─────────────────────────────────────────────────────────
  _tick(civDt) {
    this._survivalAcc += civDt;
    this._targetAcc   += civDt;

    const civYear = this._civYear();

    if (this._survivalAcc >= SURVIVAL_INTERVAL_CIVYEARS) {
      this._survivalAcc -= SURVIVAL_INTERVAL_CIVYEARS;
      this._runSurvival(civYear);
    }
    if (this._targetAcc >= TARGET_INTERVAL_CIVYEARS) {
      this._targetAcc -= TARGET_INTERVAL_CIVYEARS;
      this._runTargets(civYear);
    }
  }

  _civYear() {
    const gt = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    return Math.floor(gt * 12);
  }
  _gameYear() {
    return Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
  }

  // Kolonie AI obsługiwane przez TEN system (archetyp z ARCHETYPE_DATA, nie outpost).
  _managedColonies() {
    const cm  = window.KOSMOS?.colonyManager;
    const reg = window.KOSMOS?.empireRegistry;
    if (!cm || !reg) return [];
    return cm.getAllColonies().filter(c => {
      if (!c || c.ownerEmpireId == null) return false;
      if (c.isOutpost) return false;
      const arch = reg.get(c.ownerEmpireId)?.archetype;
      return !!ARCHETYPE_DATA[arch];
    });
  }

  _archetypeOf(colony) {
    return window.KOSMOS?.empireRegistry?.get(colony.ownerEmpireId)?.archetype ?? null;
  }

  // ── MODUŁ 1: SURVIVAL (co 1 civYear) ──────────────────────────────────────
  _runSurvival(civYear) {
    for (const colony of this._managedColonies()) {
      const arch = this._archetypeOf(colony);
      const TH   = ARCHETYPE_DATA[arch]?.survival;
      if (!TH) continue;

      const res = colony.resourceSystem;
      const civ = colony.civSystem;
      if (!res || !civ) continue;

      const pop = civ.population ?? 0;

      // Y1/Y2: pogodź kolejkę z realnym stanem (usuń ukończone, porzuć stuck) i
      //   ustal czy wolno jeszcze coś budować. Population 2.0 Faza 2: budowa NIE wymaga
      //   wolnych POP (§3.4 płynna obsada) — jedynym hamulcem jest limit kolejki, NIE brak
      //   rąk. Budynki działają understaffed; alokacja dośle ludzi, a wzrost je zapełni.
      this._syncTier3SafetyDemand(colony);
      this._reconcilePending(colony, civYear);
      this._syncGridFromActive(colony);   // #3: grid AI niesynchronizowany przez UI — re-derive z _active przed _findFreeTile
      const pendingBuilds = this._pendingCounts(colony).builds;
      const restFromBuilds = pendingBuilds >= MAX_PENDING_BUILDS_PER_COLONY;
      if (restFromBuilds) this._logQueueThrottled(colony, civYear, pendingBuilds);

      // 0) Housing cap — pop osiągnął housing → wzrost STOI. Najwyższy priorytet:
      //    bez wolnych POP żadna inna akcja (build/upgrade kosztujący POP) się nie
      //    wykona. Działa na KAŻDEJ planecie (oddychalna atmosfera chroni przed karą
      //    brak-housing, ale nie odblokowuje wzrostu). Bufor 10% (housing_buffer_ratio).
      const housing      = civ.housing ?? 0;
      const bufferRatio  = TH.housing_buffer_ratio ?? 1.1;
      if (!restFromBuilds && pop > 0 && housing < pop * bufferRatio
          && !this._isUnreachable(colony, 'build:habitat', civYear)) {
        if (this._doSurvival(colony, 'housing_cap', civYear)) {
          this._survivalBuildOutcome(colony, 'habitat', civYear, `pop ${pop}/${housing} housing cap (target ${(pop * bufferRatio).toFixed(1)})`);
          continue;
        }
      }

      // 1) Energia — bilans poniżej progu → solar_farm (najwyższy priorytet, brownout psuje wszystko)
      const bal = res.energy?.balance ?? 0;
      // ⚠ 226 / R4 — PĘTLA ŚMIERCI, ZMIERZONA. Ta gałąź dokłada elektrownię przy KAŻDYM ujemnym
      // bilansie, a `solar_farm` ma `popCost 0.25`, więc każda dokłada ETAT. Gdy deficyt jest
      // OBSADOWY (`empPenalty = laborer/demand → 0`), nowa elektrownia produkuje ZERO
      // (`_applyTechMultipliers`: produkcja × empPenalty) i tylko pogłębia niedobór rąk.
      // ZMIERZONE na `DirectorHarness`: solar 11 → 28 → 30 przy `laborer = 0` i `avail = 0.00`
      // przez cały czas — trzydzieści elektrowni nie dało ANI JEDNEJ jednostki energii.
      // ⇒ przy krytycznej obsadzie NIE budujemy mocy; ratunkiem jest żywność, nie panele.
      // Bramka pod `aiScaleBasicInfra` (ta sama intencja co reguła kolejności: nie pogłębiaj deficytu).
      const _lab = colony.civSystem?.strata?.laborer?.count ?? 0;
      const _dem = colony.buildingSystem?.getSlotDemand?.('laborer') ?? 0;
      const _obsadaKrytyczna = GAME_CONFIG.FEATURES?.aiScaleBasicInfra !== false
        && _dem > 0 && (_lab / _dem) < STAFFING_CRITICAL;
      if (!_obsadaKrytyczna && !restFromBuilds && bal < (TH.energy_balance_min ?? 0)
          && !this._isUnreachable(colony, 'build:solar_farm', civYear)) {
        if (this._doSurvival(colony, 'energy', civYear)) {
          this._survivalBuildOutcome(colony, 'solar_farm', civYear, `energy balance ${bal.toFixed(1)}`);
          continue;
        }
      }

      // 2) Żywność — ujemny bilans organics (deficyt) → farm na równinie.
      //    food_min_per_pop jest już wliczone w net rate (produkcja − konsumpcja),
      //    więc sygnałem survival jest net < 0 (kolonia traci żywność).
      const orgRate = res.getPerYear?.('organics') ?? 0;
      if (!restFromBuilds && orgRate < 0
          && !this._isUnreachable(colony, 'build:farm', civYear)) {
        if (this._doSurvival(colony, 'food', civYear)) {
          this._survivalBuildOutcome(colony, 'farm', civYear, `organics rate ${orgRate.toFixed(1)}`);
          continue;
        }
      }

      // 3) Housing — TYLKO na planecie bez oddychalnej atmosfery.
      const atmo = civ.planet?.atmosphere ?? colony.planet?.atmosphere ?? 'breathable';
      if (!restFromBuilds && atmo !== 'breathable') {
        const ratio = TH.housing_min_ratio_no_atmosphere ?? 0.5;
        if ((civ.housing ?? 0) < pop * ratio
            && !this._isUnreachable(colony, 'build:habitat', civYear)) {
          if (this._doSurvival(colony, 'housing', civYear)) {
            this._survivalBuildOutcome(colony, 'habitat', civYear, `housing ${civ.housing ?? 0}/${(pop * ratio).toFixed(1)} (atmo=${atmo})`);
            continue;
          }
        }
      }

      // 4) Prosperity — poniżej alarmu → zwiększ pokrycie consumer goods:
      //    upewnij się że jest fabryka w trybie reactive (produkuje dobra on-demand).
      const prosp = colony.prosperitySystem?.prosperity ?? 100;
      if (prosp < (TH.prosperity_alarm ?? 0)) {
        if (this._doSurvival(colony, 'consumer_goods', civYear)) {
          if (!restFromBuilds && this._countBuilding(colony, 'factory') === 0) {
            // #4: factory requires:metallurgy → bez techu silent 'fail'. Guard unreachable
            //   (30cy) zamiast retry co 3cy. setMode reactive niżej działa niezależnie.
            if (!this._isUnreachable(colony, 'build:factory', civYear)) {
              this._survivalBuildOutcome(colony, 'factory', civYear, `prosperity ${Math.round(prosp)} (brak fabryki)`);
            }
          } else if (colony.factorySystem && colony.factorySystem.mode !== 'reactive') {
            colony.factorySystem.setMode('reactive');
            this._log(colony, 'survival', 'setMode reactive', `prosperity ${Math.round(prosp)}`, civYear);
          }
          continue;
        }
      }
    }
  }

  // Anti-thrash: nie powtarzaj tej samej akcji survival przez X civYears.
  _doSurvival(colony, type, civYear) {
    const last = colony._caeLastSurvivalAction;
    if (last && last.type === type && (civYear - last.civYear) < SURVIVAL_ANTI_THRASH_CIVYEARS) {
      return false;
    }
    colony._caeLastSurvivalAction = { type, civYear };
    return true;
  }

  // Survival build z guardem unreachable (mirror _runTargets:317-330). _findFreeTile
  // może podać tile który _build odrzuci non-tech (tile.damaged / zła kategoria terenu /
  // hard-terrain fallback / farm↔synth mutex) → outcome 'fail'. Backoff 30cy zamiast
  // spamu co 3cy + churn tile'i. Root-cause → ROADMAP "_findFreeTile root-cause".
  // Caller poprzedza _isUnreachable(build:<id>) w warunku branch (short-circuit przed
  // _doSurvival, by nie palić anti-thrash gdy w backoffie).
  _survivalBuildOutcome(colony, buildingId, civYear, why) {
    const key = `build:${buildingId}`;
    const outcome = this._tryBuild(colony, buildingId, { module: 'survival', civYear, why });
    if (this._isBuildSuccess(outcome)) this._clearUnreachable(colony, key);
    else if (outcome === 'fail') this._markUnreachable(colony, key, civYear, { module: 'survival' });
    return outcome;
  }

  // ── MODUŁ 2: TARGET STATES (co 3 civYears) ───────────────────────────────
  _runTargets(civYear) {
    const gy = this._gameYear();

    for (const colony of this._managedColonies()) {
      const arch = this._archetypeOf(colony);
      const data = ARCHETYPE_DATA[arch];
      if (!data) continue;

      // Cooldown target action (× mnożnik archetypu).
      const mult = ARCHETYPE_COOLDOWN_MULTIPLIER[arch] ?? 1.0;
      const last = colony._caeLastTargetAction;
      if (last && (civYear - last.civYear) < TARGET_COOLDOWN_CIVYEARS * mult) continue;

      const cp = this._stepCheckpoint(data.targets, gy);
      if (!cp) continue;

      // safetyStocks — interpolacja liniowa, aplikowana jako demandBonus (tani setting,
      //   nie liczone jako "action" z cooldownem).
      this._applySafetyStocks(colony, data.targets, gy, civYear);

      // colonies_count — IGNOROWANE. To domena EconAI / Warstwy C (kolonizacja
      //   abstrakcyjna na poziomie galaktyki), nie auto-rozbudowy pojedynczej kolonii.

      // Y1/Y2: pogodź kolejkę i sprawdź limity zanim dosypiemy nowe targety.
      this._reconcilePending(colony, civYear);
      this._syncGridFromActive(colony);   // #3: jw. — przed _tryUpgrade/_findFreeTile
      const counts = this._pendingCounts(colony);
      const buildQueueFull   = counts.builds   >= MAX_PENDING_BUILDS_PER_COLONY;
      const upgradeQueueFull = counts.upgrades >= MAX_PENDING_UPGRADES_PER_COLONY;
      if (buildQueueFull && upgradeQueueFull) {
        this._logQueueThrottled(colony, civYear, counts.builds);
        continue;
      }

      // a) COUNTS (step function) — zbuduj pierwszy brakujący budynek wg priorytetu.
      //    Silent fail (np. brak techu) → zarejestruj unreachable i przejdź do
      //    następnego budynku z priorytetu (zamiast pętlić się w nieskończoność).
      if (!buildQueueFull) for (const buildingId of this._buildOrder(colony)) {
        const want = this._targetCount(colony, cp, buildingId);
        if (want <= 0) continue;
        const cur = this._countBuilding(colony, buildingId);
        if (cur >= want) continue;

        const key = `build:${buildingId}`;
        if (this._isUnreachable(colony, key, civYear)) continue;  // w backoffie — pomiń

        const outcome = this._tryBuild(colony, buildingId, { module: 'target', civYear, why: `count ${cur}/${want} @gy${gy}` });
        if (this._isBuildSuccess(outcome)) {
          this._clearUnreachable(colony, key);
          // Nowa fabryka → tryb reactive (conduct: nowe fabryki reactive).
          if (buildingId === 'factory') {
            colony.factorySystem?.setMode('reactive');
            this._log(colony, 'target', 'setMode reactive', 'nowa fabryka', civYear);
          }
          colony._caeLastTargetAction = { type: key, civYear };
          break; // jedna akcja na tick
        }
        if (outcome === 'fail') {
          // silent fail — _build nie zwrócił built/construction/queued (brak techu itd.)
          this._markUnreachable(colony, key, civYear, { module: 'target' });
        }
        // outcome 'no_tile'/'invalid' → po prostu spróbuj następny budynek (bez backoffu)
      }
      if (colony._caeLastTargetAction?.civYear === civYear) continue;

      // b) AVGLEVELS (interpolacja) — gdy counts spełnione, podnoś poziomy stopniowo.
      if (!upgradeQueueFull) for (const buildingId of BUILD_PRIORITY) {
        const targetLevel = this._interpLevel(data.targets, buildingId, gy);
        if (targetLevel == null) continue;

        const key = `upgrade:${buildingId}`;
        if (this._isUnreachable(colony, key, civYear)) continue;

        const outcome = this._tryUpgrade(colony, buildingId, targetLevel, { module: 'target', civYear, why: `lerp →L${targetLevel} @gy${gy}` });
        if (outcome === 'upgraded' || outcome === 'queued') {
          // 'queued' = upgrade przyjęty, czeka na surowce/POP — to NIE silent fail.
          this._clearUnreachable(colony, key);
          colony._caeLastTargetAction = { type: key, civYear };
          break; // jedna akcja na tick
        }
        if (outcome === 'fail') {
          this._markUnreachable(colony, key, civYear, { module: 'target' });
        }
        // outcome 'no_candidate' → brak budynku do ulepszenia, spróbuj następny
      }
    }
  }

  // Step function: najwyższy checkpoint ≤ gy. Poniżej gy10 → celuj w gameYear_10.
  // Po gy40 → gameYear_40 jako stała.
  _stepCheckpoint(targets, gy) {
    let chosen = CHECKPOINTS[0];
    for (const cp of CHECKPOINTS) {
      if (gy >= cp.gy) chosen = cp;
    }
    return targets[chosen.key] ?? null;
  }

  // Interpolacja liniowa avgLevel budynku między checkpointami (po gy40 — stała).
  _interpLevel(targets, buildingId, gy) {
    // Znajdź dolny/górny checkpoint.
    let low = CHECKPOINTS[0], high = CHECKPOINTS[CHECKPOINTS.length - 1];
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (gy >= CHECKPOINTS[i].gy) { low = CHECKPOINTS[i]; high = CHECKPOINTS[i + 1] ?? CHECKPOINTS[i]; }
    }
    const lv = targets[low.key]?.buildings[buildingId]?.avgLevel;
    const hv = targets[high.key]?.buildings[buildingId]?.avgLevel;
    if (lv == null && hv == null) return null;
    if (low.key === high.key || lv == null || hv == null) return Math.round(lv ?? hv);
    const frac = Math.max(0, Math.min(1, (gy - low.gy) / (high.gy - low.gy)));
    return Math.round(lv + (hv - lv) * frac);
  }

  // ═══ 225 / R4 — KARMICIELE SKALOWANI POPULACJĄ ════════════════════════════════════════
  //
  // ⚠ PRZESŁANKA SLICE'U ZOSTAŁA OBALONA POMIAREM I TO JEST TREŚĆ TEJ SEKCJI.
  // Hipoteza brzmiała „ekspander nie skaluje podstaw: żywności, wody ANI energii".
  // ZMIERZONE (`DirectorHarness`, stolica AI, gy 0→30):
  //     gy 0  pop 24  laborer 12  solar  6  farm 2  prod  56,7  avail 1,00  food +17,6
  //     gy 5  pop 23  laborer  9  solar 12  farm 2  prod  74,8  avail 1,00  food  +3,5
  //     gy10  pop 19  laborer  7  solar 12  farm 2  prod 104,8  avail 1,00  food  −8,9  GŁÓD
  //     gy15  pop 11  laborer  0  solar 13  farm 2  prod   0    avail 0
  //     gy20  pop  4  laborer  0  solar 13  farm 2  prod   0    avail 0
  // ⇒ ENERGIA NIE JEST PROBLEMEM: ekspander buduje 6 → 13 elektrowni (cel w `targets` mówi 5,
  //   dobudowuje moduł survival). Skalowanie energii byłoby NO-OPEM i, co gorsza, wyglądałoby
  //   na naprawę. Zapaść jest w ŻYWNOŚCI: `farm` stoi na 2 przez wszystkie checkpointy, więc
  //   `food/rok` spada wraz ze wzrostem populacji (17,6 → 3,5 → −8,9), w gy 10 wchodzi GŁÓD,
  //   populacja wali się 24 → 3, `laborer` → 0, a wtedy `empPenalty = laborer/demand = 0/37`
  //   GASI WSZYSTKIE 13 ELEKTROWNI (`_applyTechMultipliers`: produkcja × empPenalty).
  //   Dopiero stąd `avail = 0` → kopalnie nie wydobywają (`BuildingSystem:2519`), fabryka nie
  //   akumuluje postępu (`FactorySystem:897`), `Fe = 0` na zawsze.
  // ⇒ Ciemna stolica jest OBJAWEM GŁODU, nie brakiem elektrowni. Dlatego R4 skaluje
  //   WYŁĄCZNIE żywność i wodę; energia zostaje nietknięta (kill-switch dotyczy całości).
  //
  // Próg jest arytmetyczny, nie zgadywany: `POP_CONSUMPTION.food = 0,625`/POP/civY przy
  // `farm.rates.food = 10` daje break-even 16 POP na farmę (woda: 0,375 przy 6 → 16 POP).
  // MARGIN = 1,25 — kolonia ma jeść z zapasem, bo `empPenalty` reaguje na głód z opóźnieniem.
  _feederTarget(colony, buildingId) {
    const def = BUILDINGS[buildingId];
    const resId = buildingId === 'farm' ? 'food' : 'water';
    const perBuilding = def?.rates?.[resId] ?? 0;
    const perPop = POP_CONSUMPTION[resId] ?? 0;
    if (perBuilding <= 0 || perPop <= 0) return 0;
    const pop = Math.max(1, colony.civSystem?.population ?? 0);

    // ⚠ POPRAWKA ZMIERZONA — pierwsza wersja liczyła przeciw NOMINALNEJ wydajności (`rates.food = 10`),
    // a realna to `10 × empPenalty`. Przy obsadzie 0,3 farma daje 3, nie 10, więc cel wychodził
    // ~3× za niski: ZMIERZONE `_feederTarget = 2` przy pop 19, czyli TYLE SAMO co cel statyczny —
    // skalowanie było BEZCZYNNE dokładnie tam, gdzie miało ratować. Liczymy więc przeciw
    // wydajności REALNEJ (z podłogą, żeby przy obsadzie ~0 nie wyjść w nieskończoność).
    const staffing = this._colonyStaffing(colony);
    const realOutput = perBuilding * Math.max(FEEDER_STAFFING_FLOOR, staffing);
    const potrzeba = Math.ceil((pop * perPop * FEEDER_MARGIN) / realOutput);

    // ⚠ WARUNEK OBSADY (rozszerzenie podpisane przez właściciela, nie preferencja): karmiciel
    // NIESIE `popCost` DOKŁADNIE TAK JAK ELEKTROWNIA (`farm.popCost 0.25`). Potrojenie celu przy
    // niskiej obsadzie odbudowałoby pętlę 226 DRZWIAMI ŻYWNOŚCIOWYMI: nowe farmy dodałyby etaty,
    // których nikt nie obsadzi, obniżyły `empPenalty` wszystkim i zmniejszyły produkcję żywności.
    // Dlatego cel jest CAPOWANY do poziomu, który ta kolonia jest w stanie OBSADZIĆ.
    const jobsPer = Math.max(1, def?.jobs ?? 1);
    const wolneRece = Math.max(0, (colony.civSystem?.strata?.laborer?.count ?? 0)
                                - (colony.buildingSystem?.getSlotDemand?.('laborer') ?? 0));
    const obsadzalne = this._countBuilding(colony, buildingId) + Math.floor(wolneRece / jobsPer);
    return Math.max(0, Math.min(potrzeba, obsadzalne));
  }

  /** Obsada ludzka warstwy `laborer` w tej kolonii [0..1] — ten sam iloraz, którym
   *  `_getBuildingLaborEfficiency` mnoży PRODUKCJĘ każdego budynku tej warstwy. */
  _colonyStaffing(colony) {
    const lab = colony.civSystem?.strata?.laborer?.count ?? 0;
    const dem = colony.buildingSystem?.getSlotDemand?.('laborer') ?? 0;
    if (dem <= 0) return 1;
    return Math.max(0, Math.min(1, lab / dem));
  }

  /** Cel liczby budynku: karmiciele DYNAMICZNIE (nigdy poniżej checkpointu), reszta z tabeli. */
  _targetCount(colony, cp, buildingId) {
    const staticWant = cp.buildings[buildingId]?.count ?? 0;
    if (GAME_CONFIG.FEATURES?.aiScaleBasicInfra === false) return staticWant;
    if (buildingId !== 'farm' && buildingId !== 'well') return staticWant;
    return Math.max(staticWant, this._feederTarget(colony, buildingId));
  }

  /**
   * Kolejność budowy. ⚠ PRZY DEFICYCIE ENERGII KARMICIELE IDĄ PRZED KONSUMENTAMI —
   * inaczej ten sam tik dokłada farmę i fabrykę, a fabryka ciągnie prąd, którego farma
   * jeszcze nie daje. Kolejność: energia → żywność/woda → reszta (bez zmiany zawartości
   * `BUILD_PRIORITY`, tylko permutacja).
   */
  _buildOrder(colony) {
    if (GAME_CONFIG.FEATURES?.aiScaleBasicInfra === false) return BUILD_PRIORITY;
    const avail = colony.resourceSystem?.getEnergyAvailability?.() ?? 1;
    if (avail >= 1) return BUILD_PRIORITY;

    // ⚠ POPRAWKA ZMIERZONA — pierwsza wersja tej reguły MIAŁA WŁASNĄ PĘTLĘ ZWROTNĄ.
    // Podpisany kształt brzmiał „przy deficycie: energia → żywność/woda → reszta". Przy
    // `avail = 0` ZMIERZONO, że stolica dobudowuje elektrownie **11 → 28 → 30**, a każda
    // dokłada ETAT (`solar_farm.popCost 0.25`), którego nie ma kto obsadzić — więc pogłębia
    // dokładnie ten `empPenalty = laborer/demand`, przez który produkcja jest zerowa.
    // Budowanie mocy, gdy zerowa jest OBSADA, nie dodaje ani jednej jednostki energii.
    // ⇒ gdy deficyt jest OBSADOWY (brak robotników), pierwsi są KARMICIELE, nie energia:
    //   to żywność odbudowuje populację, a populacja dopiero uruchamia istniejące elektrownie.
    const laborer = colony.civSystem?.strata?.laborer?.count ?? 0;
    const demand  = colony.buildingSystem?.getSlotDemand?.('laborer') ?? 0;
    const obsadaKrytyczna = demand > 0 && (laborer / demand) < STAFFING_CRITICAL;

    const power   = BUILD_PRIORITY.filter(id => id === 'solar_farm');
    const feeders = BUILD_PRIORITY.filter(id => id === 'farm' || id === 'well');
    const reszta  = BUILD_PRIORITY.filter(id => !power.includes(id) && !feeders.includes(id));
    return obsadaKrytyczna ? [...feeders, ...power, ...reszta] : [...power, ...feeders, ...reszta];
  }

  // safetyStocks — interpolacja liniowa per commodity, aplikacja przez setDemandBonus.
  _applySafetyStocks(colony, targets, gy, civYear) {
    if (!colony.factorySystem?.setDemandBonus) return;
    let low = CHECKPOINTS[0], high = CHECKPOINTS[CHECKPOINTS.length - 1];
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (gy >= CHECKPOINTS[i].gy) { low = CHECKPOINTS[i]; high = CHECKPOINTS[i + 1] ?? CHECKPOINTS[i]; }
    }
    const loStocks = targets[low.key]?.safetyStocks ?? {};
    const hiStocks = targets[high.key]?.safetyStocks ?? {};
    const frac = (low.key === high.key) ? 0 : Math.max(0, Math.min(1, (gy - low.gy) / (high.gy - low.gy)));
    const cache = colony._caeStockCache ?? (colony._caeStockCache = {});
    const commodities = new Set([...Object.keys(loStocks), ...Object.keys(hiStocks)]);
    for (const c of commodities) {
      const lo  = loStocks[c] ?? 0;
      const hi  = hiStocks[c] ?? lo;
      const val = Math.round(lo + (hi - lo) * frac);
      if (cache[c] === val) continue;            // loguj tylko zmiany (mniej szumu)
      colony.factorySystem.setDemandBonus(c, val);
      this._log(colony, 'target', `setDemandBonus ${c}=${val}`, `${low.key}→${high.key} t=${frac.toFixed(2)}`, civYear);
      cache[c] = val;
    }
  }

  // ── Helpery build/upgrade (kosztowo, per-kolonia, bypass guarda) ──────────

  _countBuilding(colony, buildingId) {
    const active = colony.buildingSystem?._active;
    if (!active) return 0;
    let n = 0;
    for (const entry of active.values()) {
      if ((entry.building?.id ?? entry.buildingId) === buildingId) n++;
    }
    return n;
  }

  // Znajdź wolny, budowalny hex respektujący regułę terenu AI; unikaj biegunów.
  //   hard (mine/farm/well) → tylko terrains[]; fallback na dowolny buildowalny
  //     DOPIERO gdy żaden hex z listy nie jest wolny (loguj warning).
  //   soft (factory/smelter/habitat) → +score dla terrains[], inne akceptowalne.
  _findFreeTile(colony, buildingId) {
    const grid = colony.buildingSystem?._grid;
    if (!grid || typeof grid.forEach !== 'function') return null;
    const rule = getTerrainRule(buildingId);
    const hardTerrains = rule?.mode === 'hard' ? rule.terrains : null;
    const softTerrains = rule?.mode === 'soft' ? rule.terrains : null;
    const rows = grid.height ?? 10;
    const civYear = this._civYear();

    // enforceHard=true → filtruj do hardTerrains; false → bez filtra (fallback).
    const pick = (enforceHard) => {
      let best = null, bestScore = -Infinity;
      grid.forEach(tile => {
        if (tile.buildingId || tile.capitalBase || tile.underConstruction || tile.pendingBuild) return;
        if (this._isTileBlacklisted(colony, tile.key, civYear)) return;  // Y3: tile [fail]
        const terrain = TERRAIN_TYPES[tile.type];
        if (!terrain?.buildable) return;
        if (enforceHard && hardTerrains && !hardTerrains.includes(tile.type)) return;

        // Lekki scoring: preferowany teren (soft) > unikanie biegunów.
        let score = 0;
        if (softTerrains && softTerrains.includes(tile.type)) score += 10;
        if (tile.r === 0 || tile.r === rows - 1) score -= 5;
        else if (tile.r === 1 || tile.r === rows - 2) score -= 2;
        if (score > bestScore) { bestScore = score; best = tile; }
      });
      return best;
    };

    if (hardTerrains) {
      const strict = pick(true);
      if (strict) return strict;
      // Brak wolnego hexa z hard-listy → fallback na dowolny (nie blokuj rozbudowy).
      const fb = pick(false);
      if (fb) this._log(colony, 'terrain',
        `${buildingId} fallback poza ${hardTerrains.join('/')}`, `→ ${fb.type} (${fb.q},${fb.r})`, this._civYear());
      return fb;
    }
    return pick(false);
  }

  // Próba budowy: znajdź hex, wywołaj kosztowy _build (sam sprawdzi surowce/tech/POP;
  // gdy brak surowców/POP — _build queue'uje). Zwraca outcome string:
  //   'built'/'construction'/'queued' — sukces (akcja podjęta)
  //   'fail'    — _build silent-failował (brak techu/walidacji — nie zmienił tile)
  //   'no_tile' — brak wolnego hexa pasującego regule terenu
  //   'invalid' — nieznany building lub brak _build
  /**
   * S4a / Finding 233 — BUDŻET PRACY (D-S4-1, podpisane 2026-09-02: odczyt „workers", margines +2).
   *
   * Nie buduj i nie ulepszaj, jeśli WYNIKOWE job-units tej warstwy (`getSlotDemand` liczy
   * `jobs × level`) przekroczyłyby liczbę pracowników TEJ WARSTWY + `LABOR_BUDGET_MARGIN`.
   *
   * ⚠ ODCZYT „WORKERS", NIE „POPULATION" — wybrany TABELĄ, nie instynktem. Budżet wobec całej
   *   populacji (`pop+2` / `pop×1.1`) dawał pierwszy kadłub w gy22/gy29 przy 3:1 przepisaniu
   *   warstwy; budżet wobec pracowników warstwy dał gy21/gy21 na OBU ziarnach, popyt 42→11,
   *   obsadę farm 21%→82% i Fe 2 408→43 168. Margines +2 i +10% różnią się o jeden etat i dają
   *   gy22 vs gy36 na tym samym ziarnie — to WARIANCJA, nie ranking; stabilny jest ODCZYT.
   *
   * ⚠ ŚWIADOMY SUFIT (D-S4-2): pracownicy warstwy pojawiają się tylko tam, gdzie są etaty, więc
   *   `workers + 2` jest sufitem SAMOSPEŁNIAJĄCYM — warstwa laborer stoi na ~11 job-units mimo
   *   potrojenia populacji. PRZYJĘTE przy tej skali (11 job-units żywi i zasila stolicę 47-pop;
   *   kontrola Sargas: 2 obsadzone farmy żywią 103 pop). Próba „rośnij gdy pełna obsada" zamroziła
   *   sufit NIŻEJ (10) — kolejny wymyślony człon to pułapka strażnik-zamiast-lekarstwa. TRIPWIRE
   *   w rejestrze (Finding 237): wrócić, gdy stolice AI zbliżą się do ~100 pop albo gdy otworzy
   *   się gałąź cywilna techu.
   *
   * ⚠ HOUSING NIGDY NIE BRAMKOWANY: `habitat.jobs === 0` (jawnie, `BuildingsData` — `popCost>0`
   *   powodował deadlock housing-capu), więc reguła go nie widzi i wzrost populacji zostaje wolny.
   * ⚠ TO NIE JEST LEKARSTWO: przy `workers = 0` budżet wynosi 2 i kolonia nie odbuduje się sama —
   *   popyt AI jest monotonicznie niemalejący (Finding 235, brak zdejmowania). ZMIERZONE: S4a bez
   *   S1 nie ratuje niczego (pop 4, obsada farm 0%, zero kadłubów w 60 gy). Lekarstwem jest S1.
   */
  _overLaborBudget(colony, buildingId) {
    if (GAME_CONFIG.FEATURES?.aiLaborBudget !== true) return false;   // flaga OFF = zachowanie sprzed S4
    const def = BUILDINGS[buildingId];
    if (!def) return false;
    const jobs = def.jobs ?? 0;
    if (jobs <= 0) return false;                       // habitat i budynki autonomiczne — poza regułą
    const bSys = colony.buildingSystem, civ = colony.civSystem;
    if (!bSys?.getSlotDemand || !civ?.strata) return false;   // fail-open: nierozpoznany kształt koloni
    const strataType = def.popType ?? 'laborer';
    const workers = civ.strata[strataType]?.count ?? 0;
    return (bSys.getSlotDemand(strataType) + jobs) > (workers + LABOR_BUDGET_MARGIN);
  }

  _tryBuild(colony, buildingId, meta = {}) {
    if (this._overLaborBudget(colony, buildingId)) return 'no_labor';   // S4a — bez backoffu, próbuj następny
    if (!BUILDINGS[buildingId]) return 'invalid';
    const bSys = colony.buildingSystem;
    if (typeof bSys?._build !== 'function') return 'invalid';
    const tile = this._findFreeTile(colony, buildingId);
    if (!tile) return 'no_tile';
    bSys._build(tile, buildingId);
    // Wynik z flag tile (instant / w budowie / w kolejce na surowce-POP).
    // Brak którejkolwiek flagi = silent fail (np. brak technologii) → 'fail'.
    const outcome = tile.buildingId === buildingId ? 'built'
                  : tile.underConstruction          ? 'construction'
                  : tile.pendingBuild               ? 'queued' : 'fail';
    this._log(colony, meta.module ?? 'target',
      `build ${buildingId} @ ${tile.type} tile (${tile.q},${tile.r}) [${outcome}]`,
      meta.why, meta.civYear);
    const civYear = meta.civYear ?? this._civYear();
    // Y1: śledź zamówienia odroczone (construction/queued) by ograniczyć kolejkę.
    if (outcome === 'construction' || outcome === 'queued') {
      this._trackPending(colony, tile.key, buildingId, false, civYear);
    }
    // Y3: tile zwrócił [fail] (np. poza zasięgiem, niezdatny) → blacklist na backoff,
    //   żeby nie spamować tej samej lokacji co civYear.
    if (outcome === 'fail') this._blacklistTile(colony, tile, civYear);
    return outcome;
  }

  // Próba upgrade: znajdź budynek tego typu poniżej docelowego poziomu i ulepsz.
  // Skanuje grid (tile.buildingId/buildingLevel). Dla kolonii AI grid NIE jest
  // synchronizowany przez ColonyOverlay._syncTileBuildings (UI — tylko kolonie
  // otwarte przez gracza), więc spójność zapewnia _syncGridFromActive() wołane
  // przed tym skanem w _runSurvival/_runTargets (re-derive z bSys._active — źródła
  // prawdy — + queue). Naprawia #3: budynki AutoExpandera (buildTime>0 → tylko
  // _active) stają się kandydatami do upgrade, a stale underConstruction czyszczone.
  // Zwraca outcome string:
  //   'upgraded'     — sukces natychmiastowy (poziom wzrósł) lub start budowy upgrade'u
  //   'queued'       — sukces odroczony: _upgrade przyjął, czeka na surowce/POP
  //                    (tile.pendingBuild) — to NIE silent fail (mirror _build 'queued')
  //   'fail'         — _upgrade silent-failował (brak techu/maxLevel — bez zmiany tile)
  //   'no_candidate' — brak budynku tego typu poniżej docelowego poziomu
  _tryUpgrade(colony, buildingId, targetLevel, meta = {}) {
    if (this._overLaborBudget(colony, buildingId)) return 'no_labor';   // S4a — ULEPSZENIE to ~98% blokad
    const bSys = colony.buildingSystem;
    if (typeof bSys?._upgrade !== 'function') return 'no_candidate';
    const grid = bSys._grid;
    if (!grid || typeof grid.forEach !== 'function') return 'no_candidate';

    let candidate = null;
    grid.forEach(tile => {
      if (candidate) return;
      if (tile.buildingId !== buildingId) return;
      if (tile.underConstruction || tile.pendingBuild) return;
      const lvl = tile.buildingLevel ?? 1;
      if (lvl < targetLevel) candidate = tile;
    });
    if (!candidate) return 'no_candidate';

    const lvlBefore = candidate.buildingLevel ?? 1;
    bSys._upgrade(candidate);

    // Rozróżnij wynik z flag tile (analogicznie do _tryBuild):
    //   poziom wzrósł / underConstruction → 'upgraded' (akcja podjęta)
    //   pendingBuild                      → 'queued'   (przyjęte, czeka na surowce/POP)
    //   nic z powyższych                  → 'fail'     (silent fail: brak techu/maxLevel)
    const lvlAfter = candidate.buildingLevel ?? 1;
    const civYear  = meta.civYear ?? this._civYear();
    if (lvlAfter > lvlBefore || candidate.underConstruction) {
      this._log(colony, meta.module ?? 'target',
        `upgrade ${buildingId} L${lvlBefore}→L${lvlBefore + 1}`, meta.why, meta.civYear);
      // Y1: instant level-up nie obciąża kolejki; tylko trwająca budowa upgrade'u.
      if (candidate.underConstruction) this._trackPending(colony, candidate.key, buildingId, true, civYear);
      return 'upgraded';
    }
    if (candidate.pendingBuild) {
      this._log(colony, meta.module ?? 'target',
        `upgrade ${buildingId} L${lvlBefore}→L${lvlBefore + 1} [queued]`, meta.why, meta.civYear);
      this._trackPending(colony, candidate.key, buildingId, true, civYear);  // Y1
      return 'queued';
    }
    return 'fail';   // silent fail (brak techu / maxLevel)
  }

  _isBuildSuccess(outcome) {
    return outcome === 'built' || outcome === 'construction' || outcome === 'queued';
  }

  // ── Y1/Y2: monitor kolejki pendingBuilds (anti-deadlock) ────────────────────

  // Zapisz odroczone zamówienie (construction/queued) postawione przez AI.
  // Klucz = tileKey (unikalny). isUpgrade rozdziela pulę build vs upgrade.
  _trackPending(colony, tileKey, buildingId, isUpgrade, civYear) {
    const m = colony._caePendingBuilds || (colony._caePendingBuilds = new Map());
    if (!m.has(tileKey)) m.set(tileKey, { buildingId, isUpgrade, queuedAtCivYear: civYear });
  }

  // Liczba aktywnych zamówień w obu pulach (po rozdzieleniu build/upgrade).
  _pendingCounts(colony) {
    let builds = 0, upgrades = 0;
    const m = colony._caePendingBuilds;
    if (m) for (const rec of m.values()) { if (rec.isUpgrade) upgrades++; else builds++; }
    return { builds, upgrades };
  }

  // Pogódź mapę z realnym stanem BuildingSystem:
  //   - wpis którego NIE ma już w _pendingQueue ani _constructionQueue → ukończony,
  //     usuń ze śledzenia (zwolnij slot kolejki).
  //   - wpis w _pendingQueue dłużej niż PENDING_STUCK_CIVYEARS → prawdziwy fail
  //     (POP/surowce nigdy nie dojdą): anuluj zamówienie, wyczyść tile, oznacz
  //     buildingId jako unreachable, usuń ze śledzenia.

  /**
   * D3 — wlacz/wylacz cele zapasu tier 3+ w zaleznosci od zamoznosci kolonii.
   * AI-ONLY z konstrukcji: ColonyAutoExpander tyka wylacznie kolonie imperiow,
   * wiec kolonie gracza NIE sa tu nigdy dotykane (warunek D1 izolacji).
   * Zrodlem celow jest startingSafetyStocks archetypu — ta sama tabela, ktora
   * bootstrap wpisuje na starcie; tu tylko przelaczamy ja w czasie.
   */
  _syncTier3SafetyDemand(colony) {
    const fs = colony?.factorySystem;
    const res = colony?.resourceSystem;
    if (!fs || !res) return;
    const empId = colony.ownerEmpireId;
    if (!empId) return;                       // paranoja: kolonia gracza tu nie trafia
    const arch = ARCHETYPES[window.KOSMOS?.empireRegistry?.get?.(empId)?.archetype];
    const stocks = arch?.startingSafetyStocks;
    if (!stocks) return;

    // 246 / E3H — dwie sciezki. OFF = `d44af5e` co do bitu (bramka binarna all-4).
    const scaled = GAME_CONFIG.FEATURES?.aiTier3ScaledEntry !== false;

    if (!scaled) {
      const rich = WEALTH_ORES.every(ore => (res.getAmount?.(ore) ?? 0) >= WEALTH_THRESHOLD);
      for (const [cid, target] of Object.entries(stocks)) {
        const def = COMMODITIES[cid];
        if (!def || (def.tier ?? 0) < 3) continue;   // tier 1-2 NIETKNIETE — poza zakresem podpisu
        // bonus = cel - baza; baza dla tier 3+ wynosi 1 (FactorySystem.getSafetyStockTarget)
        fs.setDemandBonus(cid, rich ? Math.max(0, target - 1) : 0);
      }
      return;
    }

    // Zamoznosc jako UDZIAL progu, nie bit: najslabsza z rud bramki decyduje.
    let frac = 1;
    for (const ore of WEALTH_ORES) {
      frac = Math.min(frac, ((res.getAmount?.(ore) ?? 0) / WEALTH_THRESHOLD));
    }
    frac = Math.max(0, Math.min(1, frac));

    // ⚠ ZATRZASK NIE JEST SERIALIZOWANY (D-E3-2). Po wczytaniu zapisu pole jest `undefined`,
    //   czyli falsy — i to JEST odbudowa fail-closed: kolonia wczytana WEWNATRZ pasma startuje
    //   zamknieta i otwiera sie dopiero przy najblizszym przejsciu >= WEALTH_OPEN. Deterministyczne
    //   i konserwatywne; save v101 bez migracji. Precedens: rekoncyliacja ksiegi popytu (217).
    let open = colony._tier3Latch === true;
    if (!open && frac >= WEALTH_OPEN) open = true;
    else if (open && frac < WEALTH_CLOSE) open = false;
    colony._tier3Latch = open;

    for (const [cid, target] of Object.entries(stocks)) {
      const def = COMMODITIES[cid];
      if (!def || (def.tier ?? 0) < 3) continue;   // tier 1-2 NIETKNIETE — poza zakresem podpisu
      // Po otwarciu cel jest PROPORCJONALNY, z podloga 1 — zeby pozycja o malym `target` nie
      // zaokraglala sie z powrotem do zera i nie wnosila churnu, ktory pasmo wlasnie usuwa.
      fs.setDemandBonus(cid, open ? Math.max(1, Math.round(Math.max(0, target - 1) * frac)) : 0);
    }
  }

  _reconcilePending(colony, civYear) {
    const m = colony._caePendingBuilds;
    if (!m || m.size === 0) return;
    const bSys = colony.buildingSystem;
    const pendQ = bSys?._pendingQueue;
    const consQ = bSys?._constructionQueue;
    for (const [tileKey, rec] of [...m]) {
      const inPending = pendQ?.has(tileKey);
      const inConstr  = consQ?.has(tileKey);
      if (!inPending && !inConstr) { m.delete(tileKey); continue; }  // ukończone/zniknęło
      if (inPending && (civYear - rec.queuedAtCivYear) > PENDING_STUCK_CIVYEARS) {
        const key = `${rec.isUpgrade ? 'upgrade' : 'build'}:${rec.buildingId}`;
        bSys.cancelPending?.(tileKey);
        const tile = this._tileByKey(colony, tileKey);
        if (tile) tile.pendingBuild = null;   // AI colony: _syncBuildingIds nie poleci
        this._markUnreachable(colony, key, civYear, { module: 'queue' });
        this._log(colony, 'queue',
          `queue stuck: ${rec.buildingId} @ ${tileKey} pending since cy=${rec.queuedAtCivYear}, no progress — abandoning`,
          null, civYear);
        m.delete(tileKey);
      }
    }
  }

  _tileByKey(colony, tileKey) {
    const grid = colony.buildingSystem?._grid;
    if (!grid || typeof grid.forEach !== 'function') return null;
    let found = null;
    grid.forEach(t => { if (!found && t.key === tileKey) found = t; });
    return found;
  }

  // ── #3: Sync grid z _active (AI-only reconcile) ─────────────────────────────
  // Kolonie AI nie są synchronizowane przez ColonyOverlay._syncTileBuildings (UI —
  // tylko kolonie otwarte przez gracza w _gridCache[planetId]). Bez tego budynki
  // postawione przez _build (buildTime>0 → construction queue → _activateBuilding
  // ustawia tylko _active, NIE grid) nie dostają tile.buildingId/buildingLevel,
  // a underConstruction po ukończeniu nigdy nie jest czyszczone → _tryUpgrade/
  // _findFreeTile widzą stale grid (AI realizuje count, nie avgLevel — utyka na Lv1).
  //
  // Pełna przebudowa grid IN-PLACE z 3 źródeł prawdy (dokładny mirror
  // ColonyOverlay._syncTileBuildings:453-490). Wołane PRZED build/upgrade w obu
  // modułach. Pełny reset czyści osierocone underConstruction po ukończeniu (krok 1
  // zeruje, krok 3 re-set tylko żywe wpisy queue) — to jest rdzeń fixu #3.
  _syncGridFromActive(colony) {
    const bSys = colony.buildingSystem;
    const grid = bSys?._grid;
    if (!grid || typeof grid.forEach !== 'function') return;

    // 1) Reset stanu budynków. NIE ruszamy tile.type/anomalyEffect (generacja mapy).
    grid.forEach(tile => {
      tile.buildingId = null; tile.buildingLevel = 1;
      tile.capitalBase = false; tile.underConstruction = null; tile.pendingBuild = null;
    });

    // 2) Aktywne budynki (źródło prawdy: entry.building.id + entry.level).
    //    R1 (KRYTYCZNE): stolica to wirtualny budynek pod kluczem 'capital_q,r' —
    //    ustaw TYLKO capitalBase i continue (NIE stempluj buildingId), inaczej po
    //    resecie _findFreeTile zabudowałby hex stolicy. Wzorzec: _syncTileBuildings:462-466.
    for (const [key, entry] of bSys._active) {
      if (key.startsWith('capital_')) {
        const [cq, cr] = key.slice(8).split(',').map(Number);
        const ct = grid.get(cq, cr);
        if (ct) ct.capitalBase = true;
        continue;
      }
      const [q, r] = key.split(',').map(Number);
      const t = grid.get(q, r);
      if (t) {
        t.buildingId    = entry.building?.id ?? entry.buildingId;
        t.buildingLevel = entry.level ?? 1;
      }
    }

    // 3) Budowa w toku → underConstruction (tylko żywe wpisy construction queue).
    if (bSys._constructionQueue) {
      for (const [key, constr] of bSys._constructionQueue) {
        const [q, r] = key.split(',').map(Number);
        const t = grid.get(q, r);
        if (t) t.underConstruction = constr;
      }
    }

    // 4) Oczekujące (brak surowców/POP) → pendingBuild.
    if (bSys._pendingQueue) {
      for (const [key, order] of bSys._pendingQueue) {
        const [q, r] = key.split(',').map(Number);
        const t = grid.get(q, r);
        if (t) t.pendingBuild = order.buildingId ?? order.building?.id;
      }
    }
  }

  // Throttled log "queue full / rest" (raz na QUEUE_LOG_INTERVAL_CIVYEARS).
  _logQueueThrottled(colony, civYear, pendingBuilds) {
    if (!this._verbose) return;
    const last = colony._caeQueueLogCivYear ?? -Infinity;
    if (civYear - last < QUEUE_LOG_INTERVAL_CIVYEARS) return;
    colony._caeQueueLogCivYear = civYear;
    const pending = [...(colony._caePendingBuilds?.values() ?? [])]
      .map(r => `${r.buildingId}${r.isUpgrade ? '(up)' : ''}`).join(', ');
    this._log(colony, 'queue',
      `queue full (${pendingBuilds}/${MAX_PENDING_BUILDS_PER_COLONY}), skipping new builds`,
      `pending: ${pending}`, civYear);
  }

  // ── Y3: tile blacklist (anti-loop na [fail] tej samej lokacji) ──────────────

  _isTileBlacklisted(colony, tileKey, civYear) {
    const rec = colony._caeBlacklistedTiles?.get(tileKey);
    if (!rec) return false;
    if (civYear >= rec.retryAtCivYear) {
      colony._caeBlacklistedTiles.delete(tileKey);  // backoff minął — odblokuj
      return false;
    }
    return true;
  }

  _blacklistTile(colony, tile, civYear) {
    const m = colony._caeBlacklistedTiles || (colony._caeBlacklistedTiles = new Map());
    const retryAtCivYear = civYear + TILE_BLACKLIST_CIVYEARS;
    m.set(tile.key, { sinceCivYear: civYear, retryAtCivYear });
    this._log(colony, 'terrain',
      `tile (${tile.q},${tile.r}) blacklisted (fail)`, `retry @cy=${retryAtCivYear}`, civYear);
  }

  // ── Unreachable targets (anti-loop na silent fail) ──────────────────────────

  // True gdy budynek jest w okresie backoffu (silent-failował, czekamy na retry).
  // Gdy minął retryAtCivYear → false (czas spróbować ponownie) + log próby retry.
  _isUnreachable(colony, key, civYear) {
    const m = colony._caeUnreachableTargets;
    const rec = m?.get(key);
    if (!rec) return false;
    if (civYear >= rec.retryAtCivYear) {
      this._log(colony, 'target', `${key} retry attempt`, `unreachable since cy=${rec.sinceCivYear}`, civYear);
      return false; // wypuść próbę — jeśli znów fail, _markUnreachable ustawi nowy backoff
    }
    return true;
  }

  // Zarejestruj/odśwież backoff dla silent-failującego budynku.
  // STAŁY interwał: retryAtCivYear = sinceCivYear + 30 (bez exp backoffu). Każda
  // nieudana próba (pierwsza i każda kolejna po retry) kotwiczy okno od TERAZ —
  // sinceCivYear = civYear bieżącej porażki → przewidywalne, równe 30-cy odstępy.
  _markUnreachable(colony, key, civYear, meta = {}) {
    const m = colony._caeUnreachableTargets || (colony._caeUnreachableTargets = new Map());
    const sinceCivYear   = civYear;
    const retryAtCivYear = sinceCivYear + UNREACHABLE_RETRY_CIVYEARS;
    m.set(key, { sinceCivYear, retryAtCivYear });
    this._log(colony, meta.module ?? 'target',
      `${key} unreachable (silent fail)`, `retry @cy=${retryAtCivYear}`, civYear);
  }

  _clearUnreachable(colony, key) {
    colony._caeUnreachableTargets?.delete(key);
  }
}

export default ColonyAutoExpander;
