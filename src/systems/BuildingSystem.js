// BuildingSystem — logika budowania i zarządzania instalacjami na mapie hex
//
// NOWY SYSTEM: poziomy budynków (1–10), koszty w surowcach+commodities,
// kopalnia → wydobycie z deposits, energyCost per budynek, fabryka → punkty produkcji
// CZAS BUDOWY: budynki z buildTime > 0 trafiają do kolejki budowy
//
// Komunikacja:
//   Nasłuchuje: 'planet:buildRequest'    { tile, buildingId }
//               'planet:demolishRequest' { tile }
//               'planet:upgradeRequest'  { tile }
//   Emituje:    'planet:buildResult'     { success, tile, buildingId, reason, underConstruction? }
//               'planet:demolishResult'  { success, tile, reason, cancelled? }
//               'planet:upgradeResult'   { success, tile, reason, underConstruction? }
//               'planet:constructionComplete' { tileKey, buildingId, isUpgrade, planetId }
//               'planet:constructionProgress' { planetId }
//               'planet:pendingFulfilled'    { tileKey, buildingId, isUpgrade, planetId }
//               'resource:registerProducer' → do ResourceSystem
//               'resource:removeProducer'   → do ResourceSystem
//               'civ:addHousing'            → do CivilizationSystem
//               'civ:removeHousing'         → do CivilizationSystem

import EventBus from '../core/EventBus.js';
import { BUILDINGS }      from '../data/BuildingsData.js';
import { COMMODITIES }    from '../data/CommoditiesData.js';
import { TERRAIN_TYPES, evaluatePlacement }  from '../map/HexTile.js';
import { TECHS }          from '../data/TechData.js';
import { HexGrid }        from '../map/HexGrid.js';
import { POP_PER_BUILDING } from '../systems/CivilizationSystem.js';
import { DepositSystem }    from '../systems/DepositSystem.js';
import { BUILDING_SLIDER_SHIFTS } from '../systems/FactionSystem.js';
import { getTerrainRule }  from '../data/ai/AiTerrainRules.js';
import { t, getName }      from '../i18n/i18n.js';
import { envMultiplier, computeBuildResourceCost, computeBuildCommodityCost } from '../data/EnvironmentCost.js';
import { GAME_CONFIG }     from '../config/GameConfig.js';
import { BASE_MINE_RATE }  from '../data/ResourcesData.js';

// Maksymalny poziom budynku — base 10, tech nie potrzebny
const BASE_MAX_LEVEL = 10;

// Outpost: max budynków (bez colony_base/stolica)
const OUTPOST_MAX_BUILDINGS = 5;

// Outpost: kara wydajności autonomicznych budynków (brak ludzi do nadzoru)
const OUTPOST_EFFICIENCY = 0.6;

// Helper: sprawdza czy obiekt ma klucze (bez alokacji tablicy)
function hasKeys(obj) { for (const _ in obj) return true; return false; }

export class BuildingSystem {
  constructor(resourceSystem = null, civSystem = null, techSystem = null) {
    this.resourceSystem = resourceSystem;
    this.civSystem      = civSystem;
    this.techSystem     = techSystem;

    // Rejestr aktywnych producentów:
    //   tileKey → { building, baseRates, effectiveRates, housing, popCost, jobs, level, designation }
    this._active = new Map();

    // Slice 5C.2: memo greedy-fill (activeKey → frakcja obsady), unieważniane w _reapplyAllRates.
    this._greedyStaffCache = null;
    // Slice 5C.2: czy MY spauzowaliśmy fabryki (priorytet+budowa) — nie nadpisuj ręcznego OFFLINE gracza.
    this._factoryPausedByPriority = false;
    this._pausingSelf = false;             // guard: własne setProductionEnabled ≠ zewnętrzny toggle gracza (review)
    this._factoryPauseSuppressed = false;  // gracz przejął przełącznik w bieżącym epizodzie budowy priorytetowej

    // Kolejka budowy:
    //   tileKey → { buildingId, progress, buildTime, tileR, tileType, isUpgrade?, targetLevel? }
    this._constructionQueue = new Map();

    // Oczekujące zamówienia (brak surowców → czeka aż będą dostępne):
    //   tileKey → { tileKey, buildingId, cost, isUpgrade, targetLevel, tileR, tileType, queuedAt }
    this._pendingQueue = new Map();

    // Wysokość siatki (do obliczania modyfikatora polarnego)
    this._gridHeight = 0;

    // Referencja na deposits ciała niebieskiego (ustawiana przez GameScene)
    this._deposits = null;

    // Referencja na factorySystem (do punktów produkcji)
    this._factorySystem = null;

    // ID planety (do filtrowania zdarzeń losowych)
    this._planetId = null;

    // Flaga outpost — pomija POP w build/deploy/upgrade/activate
    this._isOutpost = false;

    // Flaga: nowa kolonia wymaga portu kosmicznego jako pierwszej infrastruktury
    this._requiresSpaceportFirst = false;

    // Flaga RegionSystem — dezaktywuje modyfikator polarny (region.r = 0 zawsze)
    this._isRegionMode = false;

    // Referencja na HexGrid — potrzebna do adjacency bonus (ustawiana z ColonyOverlay)
    this._grid = null;

    // Guard: tylko aktywna kolonia przetwarza żądania budowy/rozbiórki
    EventBus.on('planet:buildRequest', ({ tile, buildingId }) => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._build(tile, buildingId);
    });

    EventBus.on('planet:demolishRequest', ({ tile }) => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._demolish(tile);
    });

    EventBus.on('planet:upgradeRequest', ({ tile }) => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._upgrade(tile);
    });

    // Po zbadaniu technologii przelicz effectiveRates wszystkich budynków
    // BEZ guardu — tech jest globalne, wszystkie kolonie muszą przeliczyć stawki
    EventBus.on('tech:researched', () => this._reapplyAllRates());

    // Kara efficiency podczas niepokojów społecznych (−30% produkcji przez 10 lat)
    this._civPenalty = 1.0;
    EventBus.on('civ:unrest', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._civPenalty = 0.7; this._reapplyAllRates();
    });
    EventBus.on('civ:unrestLifted', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._civPenalty = 1.0; this._reapplyAllRates();
    });

    // Przelicz raty po zmianie populacji (per-building laborEfficiency)
    EventBus.on('civ:popBorn', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._reapplyAllRates();
    });
    // Faza 3 BUG 1: przeliczenie stawek po alokacji siły roboczej wywołuje TERAZ CivilizationSystem
    // BEZPOŚREDNIO na swoim buildingSystem (this.buildingSystem._reapplyAllRates po _allocateWorkforce)
    // — działa dla każdej kolonii bez guardu window.KOSMOS. Osobny listener zbędny.
    EventBus.on('civ:popDied', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._reapplyAllRates();
    });

    // Przelicz raty po zdarzeniu losowym (production multiplier)
    EventBus.on('randomEvent:occurred', ({ planetId }) => {
      if (this._planetId && planetId === this._planetId) this._reapplyAllRates();
    });
    EventBus.on('randomEvent:expired', ({ planetId }) => {
      if (this._planetId && planetId === this._planetId) this._reapplyAllRates();
    });

    // Master-switch produkcji: fabryki offline/online → przelicz stawki, by
    // budynki 'factory' przestały/wznowiły pobór energii (per kolonia).
    EventBus.on('factory:productionEnabledChanged', ({ colonyId }) => {
      if (this._planetId && colonyId === this._planetId) {
        // Slice 5C.2 (review): ZEWNĘTRZNY toggle (gracz w UI, nie nasza pauza) → oddaj zarządzanie pauzą
        // priorytetu I zsupresuj do końca epizodu (nie ruszaj fabryk, których gracz świadomie dotknął).
        if (!this._pausingSelf) { this._factoryPausedByPriority = false; this._factoryPauseSuppressed = true; }
        this._reapplyAllRates();
      }
    });

    // Tick: budowa + wydobycie surowców z deposits przez kopalnie + pending queue
    // civDeltaYears = deltaYears × CIV_TIME_SCALE — mechaniki 4X biegną szybciej
    this._onTick = ({ civDeltaYears: deltaYears }) => {
      this._tickConstruction(deltaYears);
      this._updateFactoryPause();   // Slice 5C.2: pauza/wznów fabryk wg (priorytet + stan kolejki budowy)
      this._tickMineExtraction(deltaYears);
      this._tickConverters(deltaYears);
      this._tickPendingQueue();
      // Faza C5: mediation_center pasywnie redukuje napięcie frakcji
      // (3/rok × civDeltaYears, tylko gdy mediation_center jest aktywne na kolonii)
      this._tickMediation(deltaYears);
    };
    EventBus.on('time:tick', this._onTick);

    // Faza C5: faction:sliderChanged → przelicz stawki (modifier zmienia się ze strefą)
    // BEZ guardu `buildingSystem !== this` — slider jest globalny, wszystkie kolonie
    // muszą przeliczyć (analogicznie do tech:researched).
    EventBus.on('faction:sliderChanged', () => this._reapplyAllRates());
    // Faza C5: faction:unlocked → przelicz stawki (locked → false zmienia getModifier)
    EventBus.on('faction:unlocked', () => this._reapplyAllRates());
  }

  // Faza C5: czy na tej kolonii jest aktywne mediation_center
  _isMediationActive() {
    for (const entry of this._active.values()) {
      if (entry.building?.id === 'mediation_center') return true;
    }
    return false;
  }

  // Faza D3: zwróć poziom najwyższego budynku o danym ID na tej kolonii (lub 0)
  // Używane np. przez DysonSystem dla orbital_fabricator cost reduction.
  _getBuildingLevel(buildingId) {
    let maxLevel = 0;
    for (const entry of this._active.values()) {
      if (entry.building?.id === buildingId) {
        const lv = entry.level ?? 1;
        if (lv > maxLevel) maxLevel = lv;
      }
    }
    return maxLevel;
  }

  // Faza C5: tick redukcji napięcia frakcji przez mediation_center
  _tickMediation(deltaYears) {
    if (deltaYears <= 0) return;
    if (!this._isMediationActive()) return;
    const fSys = window.KOSMOS?.factionSystem;
    if (!fSys || fSys.isLocked) return;
    // Active mediation: -3 napięcia × civDeltaYears
    fSys.tension = Math.max(0, fSys.tension - (3 * deltaYears));
  }

  // ── Ustaw deposits i factorySystem ──────────────────────────────────────
  setDeposits(deposits) { this._deposits = deposits; }
  setFactorySystem(fs) { this._factorySystem = fs; }
  setRegionMode(isRegion) { this._isRegionMode = !!isRegion; }
  setPlanetId(id) { this._planetId = id; }

  // ── Sprawdź czy kolonia ma port kosmiczny ────────────────────────────────
  hasSpaceport() {
    for (const [, entry] of this._active) {
      if (entry.building.isSpaceport) return true;
    }
    // Sprawdź też w kolejce budowy
    for (const [, constr] of this._constructionQueue) {
      if (BUILDINGS[constr.buildingId]?.isSpaceport) return true;
    }
    return false;
  }

  // ── Licznik budynków na outpoście (bez stolica/spaceport) ────────────────
  _countOutpostBuildings() {
    let count = 0;
    for (const [key, entry] of this._active) {
      if (key.startsWith('capital_')) continue;
      if (entry.building.isSpaceport) continue;
      count++;
    }
    // Dolicz budynki w kolejce budowy
    for (const [, constr] of this._constructionQueue) {
      const b = BUILDINGS[constr.buildingId];
      if (b?.isSpaceport) continue;
      count++;
    }
    return count;
  }

  // ── Pobierz max level budynku ────────────────────────────────────────────
  getMaxLevel() {
    return BASE_MAX_LEVEL;
  }

  // ── Pobierz level budynku na tile ───────────────────────────────────────
  getBuildingLevel(tileKey) {
    return this._active.get(tileKey)?.level ?? 1;
  }

  // ── Query metody dla CivilizationSystem (strata demand) ─────────────────

  /** Zapotrzebowanie na dany typ straty (suma jobs budynków z matching popType, BRUTTO — z
   *  syntetykami). getSlotDemand ZOSTAJE brutto (liczba etatów strukturalnie; employment/UI),
   *  a konsumenci netują syntetyki (getSyntheticJobs) SAMI: pressure/alokacja (Faza 2) ORAZ
   *  _getBuildingLaborEfficiency (Faza 4 — demand netto → budynki obsadzone droidem nie rozcieńczają
   *  ludzkiej efektywności same-strata). Kwirk PHASE4_TODO rozwiązany w Fazie 4 (net w efficiency). */
  /** Slice 5C.2 (gate fix): budynek PAUSED zwalnia zapotrzebowanie na pracę (0 etatów) — jego pracownicy
   *  stają się bezrobotni w tym samym ticku (rekoncyliacja alokacji), satysfakcja reaguje realnym bezrobociem.
   *  Gated FEATURES.popAllocation2Priority (flag OFF = paused ignorowany, demand jak dotąd). */
  _isEntryPaused(entry) {
    return GAME_CONFIG.FEATURES?.popAllocation2Priority === true && entry?.designation === 'paused';
  }

  getSlotDemand(strataType) {
    let demand = 0;
    for (const entry of this._active.values()) {
      if (this._isEntryPaused(entry)) continue;   // paused = 0 etatów (uwalnia demand → eviction)
      const pType = entry.building?.popType ?? 'laborer';
      if (pType === strataType && (entry.jobs ?? 0) > 0) {
        demand += entry.jobs * entry.level;
      }
    }
    return demand;
  }

  /** Droid-per-job: etaty danej straty obsadzone przez DROIDY (jednostki) — 1 droid = 1 etat,
   *  budynek może mieszać ludzi i droidy (§4.1). Netowane z ludzkiego zapotrzebowania w alokacji
   *  siły roboczej i z licznika pressure (CivilizationSystem). */
  getSyntheticJobs(strataType) {
    if (!this._grid) return 0;
    let synth = 0;
    for (const [tileKey, entry] of this._active.entries()) {
      if (this._isEntryPaused(entry)) continue;   // Slice 5C.2: paused = idle (droidy też nie liczą etatów)
      const pType = entry.building?.popType ?? 'laborer';
      if (pType !== strataType || (entry.jobs ?? 0) <= 0) continue;
      synth += this._tileDroidCount(entry, tileKey);
    }
    return synth;
  }

  /** Droid-per-job: suma WSZYSTKICH droidów (jednostek) po stratach — jeden przebieg _active.
   *  Konsument employmentu (freePops/needsImmigrants) netuje syntetyki SAM — droid uwalnia człowieka
   *  do puli bezrobotnych, więc jego etat NIE może być liczony jako ludzkie zatrudnienie (§3.4). */
  getSyntheticJobsTotal() {
    if (!this._grid) return 0;
    let synth = 0;
    for (const [tileKey, entry] of this._active.entries()) {
      if ((entry.jobs ?? 0) <= 0 || this._isEntryPaused(entry)) continue;   // Slice 5C.2: paused idle
      synth += this._tileDroidCount(entry, tileKey);
    }
    return synth;
  }

  /** Droid-per-job: liczba AKTYWNYCH droidów w budynku = min(slot.count, jobs×level). Clamp (D5)
   *  broni przed nadmiarem (downgrade trimuje droidy, ale odczyt zabezpiecza się dodatkowo). */
  _tileDroidCount(entry, tileKey) {
    if (!entry || !this._grid) return 0;
    const [q, r] = tileKey.split(',').map(Number);
    const slot = this._grid.get(q, r)?.syntheticSlot;
    if (!slot) return 0;
    return Math.min(slot.count ?? 0, (entry.jobs ?? 0) * (entry.level ?? 1));
  }

  /** Faza 4 (UI): liczba zainstalowanych droidów (JEDNOSTEK, nie budynków). commodityId=null → wszystkie.
   *  Instalacja KONSUMUJE droida z magazynu, więc licznik magazynu ≠ liczba zainstalowanych jednostek. */
  countInstalledSynthetics(commodityId = null) {
    if (!this._grid) return 0;
    let n = 0;
    this._grid.forEach(tile => {
      const slot = tile?.syntheticSlot;
      if (slot && (commodityId == null || slot.commodityId === commodityId)) n += (slot.count ?? 0);
    });
    return n;
  }

  /** Frakcja obsady kopalni [0..1] — reużywa D2 labor efficiency (_getBuildingLaborEfficiency:
   *  autonomiczne/outpost/jobs=0 → 1.0, droidy w slocie liczą się), clamp ≤1.0. Wspólne źródło
   *  dla gate'u wydobycia (_tickMineExtraction), satysfakcji górników (getMineEfficiency) i UI
   *  (getMineOutputEstimate). Clamp ≤1.0 — droid-bonus 1.4× poza tym cutem (doc §8 Faza 5). */
  _mineStaffFraction(building, tileKey) {
    return Math.min(1, this._getBuildingLaborEfficiency(building, tileKey));
  }

  /** Efektywność kopalń: level-ważona średnia frakcji obsady (0-1). Spójne z gate'em wydobycia —
   *  napędza satysfakcję straty 'miner' (CivilizationSystem._calcStrataSatisfaction). Autonomiczne
   *  i droid-obsadzone kopalnie ×1.0. BEZ podłogi (satysfakcja odzwierciedla realną obsadę). */
  getMineEfficiency() {
    let lvl = 0, staffed = 0;
    for (const [tileKey, entry] of this._active.entries()) {
      const b = entry.building;
      if (!(b?.isMine || b?.id === 'mine')) continue;
      const level = entry.level ?? 1;
      lvl += level;
      staffed += level * this._mineStaffFraction(b, tileKey);
    }
    return lvl > 0 ? staffed / lvl : 0.5;
  }

  /** UI (Report 2): szacowany roczny urobek POJEDYNCZEJ kopalni z obsadą + dostępnością energii —
   *  NIE mutuje złóż (odwzorowuje wzór DepositSystem.extractFromDeposits). Zwraca { staff, gains }
   *  albo null gdy to nie kopalnia / brak złóż. Panel budynku pokazuje „Wydobycie/rok (×staff)". */
  getMineOutputEstimate(tileKey) {
    const entry = this._active.get(tileKey);
    const b = entry?.building;
    if (!b || !(b.isMine || b.id === 'mine') || !this._deposits?.length) return null;
    const staff = Math.max(GAME_CONFIG.MINE_STAFF_FLOOR, this._mineStaffFraction(b, tileKey));
    const grid  = (b.energyCost ?? 0) > 0;
    const avail = grid ? (this.resourceSystem?.getEnergyAvailability?.() ?? 1) : 1;
    const rateMult = window.KOSMOS?.scenario === 'civilization_boosted' ? 5 : 1;
    // asteroid_mining ×2 dla planetoid/asteroid (parytet z _tickMineExtraction)
    let bodyMult = 1;
    const bodyType = this._planetId ? window.KOSMOS?.colonyManager?.getColony?.(this._planetId)?.planet?.type : null;
    if ((bodyType === 'planetoid' || bodyType === 'asteroid') && this.techSystem?.isResearched?.('asteroid_mining')) bodyMult = 2;
    const effLevel = (entry.level ?? 1) * staff * avail * rateMult * bodyMult;
    const deps = b.mineResource ? this._deposits.filter(d => d.resourceId === b.mineResource) : this._deposits;
    const gains = {};
    for (const d of deps) {
      if ((d.remaining ?? 0) <= 0) continue;   // złoże wyczerpane — pomiń
      const out = effLevel * BASE_MINE_RATE * (d.richness ?? 1) * (d.remaining / d.totalAmount);
      // BEZ skip out<=0: nieobsadzona kopalnia (staff 0 = twarda bramka) pokazuje surowce przy
      // +0.0 — uczciwy stan „×0.00, nic nie wydobywa" zamiast pustego panelu.
      const key = b.refineTo ? b.refineTo : d.resourceId;
      gains[key] = (gains[key] ?? 0) + (b.refineTo ? out * (b.refineRatio ?? 1) : out);
    }
    return { staff, gains };
  }

  /** Efektywność fabryk: ratio aktywnych vs total (0-1) */
  getFactoryOutputRatio() {
    let total = 0, producing = 0;
    for (const entry of this._active.values()) {
      const id = entry.building?.id;
      if (id === 'factory') {
        total++;
        producing++;
      }
    }
    return total > 0 ? producing / total : 0.5;
  }

  /** % zaawansowanych budynków działających (nuclear, fusion, shipyard etc.) */
  getAdvancedBuildingsUptime() {
    let total = 0, running = 0;
    for (const entry of this._active.values()) {
      const req = entry.building?.requires;
      if (req && (entry.jobs ?? 0) > 0) {
        total++;
        running++;  // na razie zakładamy 100% uptime — Faza 6 doda real check
      }
    }
    return total > 0 ? running / total : 0.5;
  }

  // ── Synthetic units: install/remove ─────────────────────────────────────

  /** Mapa droidTier → mnożnik wydajności budynku (obsada syntetyczna). Faza 4: 1 (droid) jawnie ×1.4. */
  static SYNTH_EFFICIENCY = { 1: 1.4, 2: 1.7 };

  /** Faza 4: upkeep energii aktywnego slotu syntetycznego (energii/rok, per slot). Magazyn = 0. */
  static SYNTH_ENERGY_UPKEEP = { 1: 2, 2: 6 };

  /** Faza 4: dozwolone straty per droidTier. tier 1 (droid) = prosta praca; tier 2 (android) =
   *  BEZ ograniczenia (undefined → preserve dotychczasowe zachowanie; doc §4.2, zawężenie w epicu AI). */
  static ALLOWED_SYNTH_STRATA = { 1: ['laborer', 'miner', 'worker'] };

  /** Faza 4: priorytet doboru droida do instalacji (tier-1 subject Fazy 4 najpierw, potem android). */
  static DROID_INSTALL_PRIORITY = ['automation_droid', 'android_worker'];

  /** Faza 4 (droid-per-job): podgląd instalacji droida (stan przycisku UI, BEZ konsumpcji). Zwraca
   *  bieżący stan `{count, jobs}` + droida do instalacji (priorytet tier-1, ograniczony do zainstalowanego
   *  tieru — jeden tier na budynek, D6) albo powód blokady (`building_full`/`tier_mismatch`/…). */
  previewSyntheticInstall(tileKey) {
    const entry = this._active.get(tileKey);
    if (!entry) return { ok: false, reason: 'no_building', count: 0, jobs: 0 };
    if (entry.building?.isAutonomous || (entry.jobs ?? 0) === 0) return { ok: false, reason: 'autonomous_building', count: 0, jobs: 0 };
    const jobs = (entry.jobs ?? 0) * (entry.level ?? 1);
    const [q, r] = tileKey.split(',').map(Number);
    const slot = this._grid?.get(q, r)?.syntheticSlot;
    const count = Math.min(slot?.count ?? 0, jobs);
    const popType = entry.building.popType ?? 'laborer';
    if (count >= jobs) return { ok: false, reason: 'building_full', count, jobs };
    // Jeden tier na budynek: gdy slot istnieje, kandydat MUSI mieć ten sam tier.
    const candidates = slot
      ? BuildingSystem.DROID_INSTALL_PRIORITY.filter(cid => (COMMODITIES[cid]?.droidTier ?? 1) === slot.tier)
      : BuildingSystem.DROID_INSTALL_PRIORITY;
    let techLocked = false;   // Slice 5B: kandydat w zapasie + strata OK, ale requiresTech niezbadany.
    for (const cid of candidates) {
      if ((this.resourceSystem?.getAmount?.(cid) ?? 0) < 1) continue;
      const tier = COMMODITIES[cid]?.droidTier ?? 1;
      const allowed = BuildingSystem.ALLOWED_SYNTH_STRATA[tier];
      if (allowed && !allowed.includes(popType)) continue;
      const reqTech = COMMODITIES[cid]?.requiresTech;
      if (reqTech && this.techSystem?.isResearched && !this.techSystem.isResearched(reqTech)) { techLocked = true; continue; }
      return { ok: true, commodityId: cid, tier, count, jobs };
    }
    // Żaden kandydat nie pasuje — rozróżnij powód.
    if (slot) {
      const otherStock = BuildingSystem.DROID_INSTALL_PRIORITY.some(cid =>
        (COMMODITIES[cid]?.droidTier ?? 1) !== slot.tier && (this.resourceSystem?.getAmount?.(cid) ?? 0) >= 1);
      return { ok: false, reason: otherStock ? 'tier_mismatch' : 'no_commodity', count, jobs };
    }
    // Tech-lock ma priorytet nad strata (kandydat był w zapasie i strata-OK, tylko tech brak).
    if (techLocked) return { ok: false, reason: 'requires_tech', count, jobs };
    const anyStock = BuildingSystem.DROID_INSTALL_PRIORITY.some(cid => (this.resourceSystem?.getAmount?.(cid) ?? 0) >= 1);
    return { ok: false, reason: anyStock ? 'strata_not_allowed' : 'no_commodity', count, jobs };
  }

  /**
   * Zainstaluj syntetyczną jednostkę w budynku.
   * @param {string} tileKey — klucz hexa "q,r"
   * @param {string} commodityId — np. 'android_worker'
   * @returns {{ success: boolean, reason?: string }}
   */
  installSynthetic(tileKey, commodityId) {
    const entry = this._active.get(tileKey);
    if (!entry) return { success: false, reason: 'no_building' };

    // Sprawdź czy budynek akceptuje syntetyki (musi mieć jobs > 0 i nie być autonomiczny)
    if (entry.building.isAutonomous || (entry.jobs ?? 0) === 0) {
      return { success: false, reason: 'autonomous_building' };
    }

    // Sprawdź tile
    const [q, r] = tileKey.split(',').map(Number);
    const tile = this._grid?.get(q, r);
    if (!tile) return { success: false, reason: 'no_tile' };

    // Droid-per-job: 1 droid = 1 etat. Budynek pomieści do jobs×level droidów.
    const jobs = (entry.jobs ?? 0) * (entry.level ?? 1);
    const slot = tile.syntheticSlot;
    const count = Math.min(slot?.count ?? 0, jobs);
    if (count >= jobs) return { success: false, reason: 'building_full' };

    // Sprawdź commodity w inventory (Faza 4 fix: ResourceSystem trzyma inventory jako Map —
    // stary `resourceSystem._inventory[id]` NIE ISTNIAŁ [martwy kod], używamy getAmount/spend).
    if ((this.resourceSystem?.getAmount?.(commodityId) ?? 0) < 1) {
      return { success: false, reason: 'no_commodity' };
    }

    // Pobierz tier z commodity definition
    const tier = COMMODITIES[commodityId]?.droidTier ?? 1;

    // Jeden tier na budynek (D6): odrzuć instalację innego tieru niż już zainstalowany.
    if (slot && slot.tier !== tier) return { success: false, reason: 'tier_mismatch' };

    // Faza 4: allowedStrata per droidTier — droid tier 1 obsadza TYLKO prostą pracę
    // (laborer/miner/worker); tier 2 (android) bez ograniczenia (undefined). Odrzuć inaczej.
    const allowed = BuildingSystem.ALLOWED_SYNTH_STRATA[tier];
    if (allowed && !allowed.includes(entry.building.popType ?? 'laborer')) {
      return { success: false, reason: 'strata_not_allowed' };
    }

    // Slice 5B (decyzja 2, live-gate point 2): tech gate na INSTALACJI — droid z `requiresTech`
    // (android_worker → android_engineering) wymaga zbadania tech NAWET gdy jest w magazynie
    // (nie tylko przy produkcji). tier-1 automation_droid ma requiresTech null → brak gate. Bez tego
    // gracz z resztką android_worker (np. po swapie build-cost) instalował go w budynki tier-2 bez tech.
    const reqTech = COMMODITIES[commodityId]?.requiresTech;
    if (reqTech && this.techSystem?.isResearched && !this.techSystem.isResearched(reqTech)) {
      return { success: false, reason: 'requires_tech' };
    }

    // Zużyj JEDNEGO droida i dodaj do budynku (nowy slot z count=1 albo inkrementacja).
    this.resourceSystem.spend({ [commodityId]: 1 });
    if (slot) slot.count = count + 1;
    else tile.syntheticSlot = { commodityId, tier, count: 1 };

    // FIX A: natychmiastowa realokacja + przelicz stawki (wyparty człowiek od razu ewakuowany).
    this._reallocateAndRefresh();

    EventBus.emit('building:syntheticInstalled', { tileKey, commodityId, tier, count: tile.syntheticSlot.count });
    return { success: true };
  }

  /**
   * Usuń JEDNEGO droida z budynku (droid-per-job). Ostatni → wyczyść slot.
   * Slice 5C.1 (RULE CHANGE, flag popAllocation2): deinstalacja ZWRACA droida do magazynu
   * (`resourceSystem.receive`) — planowa deinstalacja ≠ katastrofa. Demolish (`_demolish`) i
   * downgrade-trim (`_upgrade` Lv−) DALEJ NISZCZĄ (destrukcja budynku). Flag OFF = niszczenie (Faza 4).
   */
  removeSynthetic(tileKey) {
    const [q, r] = tileKey.split(',').map(Number);
    const tile = this._grid?.get(q, r);
    if (!tile?.syntheticSlot) return { success: false, reason: 'no_synthetic' };

    const slot = tile.syntheticSlot;
    const { commodityId } = slot;

    // Droid-per-job: zdejmij JEDNEGO droida. count→0 = null.
    const remaining = (slot.count ?? 1) - 1;
    if (remaining <= 0) tile.syntheticSlot = null;
    else slot.count = remaining;

    // Slice 5C.1: zwróć droida do magazynu (deinstalacja planowa). Flag OFF = niszczenie (bez zwrotu).
    const returned = GAME_CONFIG.FEATURES?.popAllocation2 === true;
    if (returned) this.resourceSystem?.receive?.({ [commodityId]: 1 });

    // FIX A: natychmiastowa realokacja + przelicz stawki (etat wraca do ludzi od razu).
    this._reallocateAndRefresh();

    EventBus.emit('building:syntheticRemoved', { tileKey, commodityId, count: Math.max(0, remaining), returned });
    return { success: true, returned };
  }

  // ── Slice 5C.1: instalacja/deinstalacja droida PER WARSTWA (auto-pick budynku, bez pickera UI) ──
  /** Budynki straty przyjmujące droida (jobs>0, nie autonomiczne) na tej kolonii — z metadanymi obsady. */
  _strataDroidBuildings(strataType) {
    const out = [];
    if (!this._grid) return out;
    for (const [tileKey, entry] of this._active.entries()) {
      const b = entry.building;
      if (!b || (b.popType ?? 'laborer') !== strataType) continue;
      if (b.isAutonomous || (entry.jobs ?? 0) === 0) continue;
      const jobs = (entry.jobs ?? 0) * (entry.level ?? 1);
      const droids = this._tileDroidCount(entry, tileKey);
      out.push({ tileKey, jobs, droids, open: jobs - droids });
    }
    return out;
  }

  /** [+] per warstwa: zainstaluj droida w budynku tej straty z NAJNIŻSZĄ obsadą droidów (najwięcej
   *  wolnych slotów). Reużywa installSynthetic (koszt/tier/strata/spend/realokacja). AUTO-PICK, bez pickera. */
  installSyntheticForStrata(strataType) {
    const cands = this._strataDroidBuildings(strataType).filter(c => c.open > 0);
    if (!cands.length) return { success: false, reason: 'no_open_slot' };
    // Najniższa obsada = najwięcej wolnych slotów (najbardziej potrzebny). Tie: mniej droidów.
    cands.sort((a, b) => (b.open - a.open) || (a.droids - b.droids));
    for (const c of cands) {
      const prev = this.previewSyntheticInstall(c.tileKey);
      if (!prev.ok) continue;   // np. tier_mismatch/requires_tech na tym budynku — spróbuj następny
      return this.installSynthetic(c.tileKey, prev.commodityId);
    }
    // Żaden budynek nie przyjął — zwróć powód pierwszego kandydata (diagnostyka UI).
    const first = this.previewSyntheticInstall(cands[0].tileKey);
    return { success: false, reason: first.reason ?? 'no_commodity' };
  }

  /** [−] per warstwa: usuń droida z budynku tej straty (najwięcej droidów najpierw). Zwraca droida
   *  do magazynu (rule change 5C.1 przez removeSynthetic). */
  removeSyntheticForStrata(strataType) {
    const cands = this._strataDroidBuildings(strataType).filter(c => c.droids > 0);
    if (!cands.length) return { success: false, reason: 'no_synthetic' };
    cands.sort((a, b) => b.droids - a.droids);   // najwięcej droidów najpierw
    return this.removeSynthetic(cands[0].tileKey);
  }

  /**
   * Slice 5B — bulk „Autonomizuj": wypełnij WSZYSTKIE wolne sloty budynku droidami jednym ruchem
   * (pętla po installSynthetic — zero duplikacji logiki koszt/capacity/tier/strata/spend/realokacja).
   * Typ droida wg straty (tier split, dec. 2): laborer/miner/worker → automation_droid (tier-1);
   * pozostałe (engineer/scientist/merchant/bureaucrat) → android_worker (tier-2, wymaga
   * android_engineering). Konsumuje droidy z magazynu; przy niedoborze instaluje ILE SIĘ DA (partial)
   * i zwraca shortfall. FULL-COLONY only (outpost → reason 'outpost_not_supported', 5B.2).
   * @returns {{ success:boolean, installed:number, shortfall:number, droidType?:string, reason?:string }}
   */
  autonomizeBuilding(tileKey) {
    const entry = this._active.get(tileKey);
    if (!entry) return { success: false, installed: 0, shortfall: 0, reason: 'no_building' };
    if (this._isOutpost) return { success: false, installed: 0, shortfall: 0, reason: 'outpost_not_supported' };
    if (entry.building?.isAutonomous || (entry.jobs ?? 0) === 0) {
      return { success: false, installed: 0, shortfall: 0, reason: 'nothing_to_autonomize' };
    }
    const jobs = (entry.jobs ?? 0) * (entry.level ?? 1);
    const [q, r] = tileKey.split(',').map(Number);
    const installed0 = this._grid?.get(q, r)?.syntheticSlot?.count ?? 0;
    const openSlots = jobs - installed0;
    if (openSlots <= 0) return { success: false, installed: 0, shortfall: 0, reason: 'already_autonomous' };

    // Typ droida wg straty budynku (tier split). ALLOWED_SYNTH_STRATA[1] = proste strata (tier-1).
    const popType = entry.building?.popType ?? 'laborer';
    const tier1Ok = BuildingSystem.ALLOWED_SYNTH_STRATA[1]?.includes(popType);
    const droidType = tier1Ok ? 'automation_droid' : 'android_worker';

    const available = this.resourceSystem?.getAmount?.(droidType) ?? 0;
    // Informacyjny gate tech: tier-2 (android) bez badania android_engineering i bez droidów w magazynie
    // → surface 'requires_tech' zamiast mylącego 'no_droids' (gracz nie może ich wyprodukować).
    if (!tier1Ok && available < 1 && this.techSystem?.isResearched
        && !this.techSystem.isResearched('android_engineering')) {
      return { success: false, installed: 0, shortfall: openSlots, droidType, reason: 'requires_tech' };
    }
    if (available < 1) return { success: false, installed: 0, shortfall: openSlots, droidType, reason: 'no_droids' };

    const toInstall = Math.min(Math.floor(available), openSlots);
    let installed = 0, lastReason = null;
    for (let i = 0; i < toInstall; i++) {
      const res = this.installSynthetic(tileKey, droidType);
      if (res.success) installed++;
      else { lastReason = res.reason; break; }
    }
    const shortfall = openSlots - installed;
    return {
      success: installed > 0, installed, shortfall, droidType,
      reason: installed > 0 ? undefined : (lastReason ?? 'install_failed'),
    };
  }

  /** FIX A: natychmiastowa realokacja siły roboczej po zmianie slotu syntetycznego. Reużywa DOKŁADNIE
   *  ścieżkę roczną (_yearlyUpdate): civSystem._allocateWorkforce() → this._reapplyAllRates(). Bez tego
   *  wyparci ludzie tkwili w stracie do najbliższego rocznego ticku (gracz widział „2 ludzi + droid",
   *  bezrobocie skakało rok później). Emit civ:populationChanged tylko dla AKTYWNEJ kolonii (odśwież UI). */
  _reallocateAndRefresh() {
    // Slice 5C.1: mid-year (install/remove droida) → tylko re-fill wolnych etatów, BEZ zaawansowania
    // migracji (akumulator friction advance = roczny; idempotencja przy wielokrotnym strzale/rok).
    this.civSystem?._allocateWorkforce?.(false);
    this._reapplyAllRates();
    if (this.civSystem && window.KOSMOS?.civSystem === this.civSystem) {
      EventBus.emit('civ:populationChanged', this.civSystem._popSnapshot());
    }
  }

  /** FIX B (dane dialogu wyparcia): ilu ludzi straci etat przez instalację droida w tym budynku
   *  (displaced; 0 gdy nieobsadzony) i ile jest WOLNYCH ludzkich etatów na całej kolonii (freeSlots —
   *  absorpcja wypartych; freeSlots<displaced → nadwyżka → bezrobotni). Czysta funkcja odczytu stanu. */
  getSyntheticDisplacement(tileKey) {
    const entry = this._active.get(tileKey);
    const civ = this.civSystem;
    if (!entry || !civ || (entry.jobs ?? 0) <= 0) return { displaced: 0, freeSlots: 0, staffed: false };
    // Droid-per-job: instalacja dokłada JEDNEGO droida → automatyzuje 1 KOLEJNY etat (delta=1).
    const jobs  = (entry.jobs ?? 0) * (entry.level ?? 1);
    const count = this._tileDroidCount(entry, tileKey);
    if (count >= jobs) return { displaced: 0, freeSlots: 0, staffed: false };   // pełny — instalacja zablokowana
    const popType = entry.building?.popType ?? 'laborer';
    const workers   = civ.getStrataWorkers(popType);
    const humanJobs = civ._humanJobs(popType);   // BRUTTO − synth, PRZED tą instalacją
    // Redukcja obsadzonych ludzkich etatów o 1 marginalny etat = 0 lub 1 wyparty pracownik.
    const displaced = Math.max(0, Math.min(workers, humanJobs) - Math.min(workers, Math.max(0, humanJobs - 1)));
    // Wolne ludzkie etaty na całej kolonii (absorpcja): Σ max(0, humanJobs − workers) po stratach.
    let freeSlots = 0;
    for (const type of Object.keys(civ.strata)) {
      freeSlots += Math.max(0, civ._humanJobs(type) - civ.getStrataWorkers(type));
    }
    return { displaced, freeSlots, staffed: displaced > 0 };
  }

  /** Downgrade/demolish (D5): ile droidów ZNISZCZY rozbiórka tego budynku (dla ostrzeżenia UI
   *  „Zniszczy N droidów"). Downgrade Lv>1: nadmiar ponad jobs×(level−1). Pełna rozbiórka: wszystkie. */
  getDemolishDroidLoss(tileKey) {
    const entry = this._active.get(tileKey);
    if (!entry) return 0;
    const [q, r] = tileKey.split(',').map(Number);
    const slot = this._grid?.get(q, r)?.syntheticSlot;
    if (!slot) return 0;
    const level = entry.level ?? 1;
    const jobs  = entry.building?.jobs ?? 0;
    const count = Math.min(slot.count ?? 0, jobs * level);
    if (level > 1) return Math.max(0, count - jobs * (level - 1));   // downgrade zostawia niższy J
    return count;   // pełna rozbiórka niszczy wszystkie
  }

  // ── Aktywacja budynku (wspólna logika dla nowej budowy i zakończenia construction) ──

  _activateBuilding(tileKey, buildingId, tileR, tileType, isCapital = false) {
    const building = BUILDINGS[buildingId];
    if (!building) return;

    const level = 1;
    // Zbuduj minimalny tile-like obiekt do obliczenia stawek
    // Pobierz prawdziwy tile z gridu (dla anomalyEffect) lub fallback
    const realTile = this._grid?.get(...tileKey.split(',').map(Number));
    const tileLike = realTile ?? { r: tileR, type: tileType, key: tileKey, anomalyEffect: null };

    const baseRates  = this._calcBaseRates(building, tileLike, level);
    const activeKey  = isCapital ? `capital_${tileKey}` : tileKey;
    const producerId = isCapital ? `capital_${tileKey}` : `building_${tileKey}`;
    const popCost = this._isOutpost ? 0 : (building.popCost ?? POP_PER_BUILDING);  // oryginał (serialize compat)
    const jobs    = this._isOutpost ? 0 : (building.jobs ?? 0);                     // Population 2.0: etaty (×4)

    // ⚠ Faza 3 BUG 1 (root-cause): wpis do _active ORAZ obsada (convertToStrata) MUSZĄ poprzedzić
    // liczenie effectiveRates. Inaczej getSlotDemand(popType) NIE liczy tego budynku (demand=0 →
    // guard empPenalty=1.0), a strata nie ma jeszcze pracowników → budynek rejestrował PEŁNĄ
    // energię/produkcję mimo braku obsady (staffing-scaled energy nie działało w LIVE bilansie).
    // Wpis z pustymi effectiveRates — uzupełniany PO obsadzie.
    this._active.set(activeKey, {
      building, baseRates, effectiveRates: {},
      housing: building.housing,
      popCost,
      jobs,
      level,
      producerId,
      designation: 'active',   // Slice 5C.2: tri-state {active/paused/priority}
    });

    // Zatrudnienie (pomiń w outpost) — obsadź stratę PRZED liczeniem stawek.
    if (jobs > 0 && !this._isOutpost && this.civSystem) {
      // Konwertuj wolnego POPa z innej strata jeśli brakuje w wymaganej
      const pType = building.popType ?? 'laborer';
      this.civSystem.convertToStrata(pType, jobs);
      this.civSystem.changeEmployment(jobs);
    }

    // Teraz budynek jest w _active i strata obsadzona → POPRAWNY empPenalty (obsada per strata).
    this._greedyStaffCache = null;   // Slice 5C.2 (review): nowy budynek zmienił _active/obsadę → świeży greedy
    const effectiveRates = this._applyTechMultipliers(baseRates, building, activeKey);
    this._active.get(activeKey).effectiveRates = effectiveRates;
    // Zarejestruj produkcję (bezpośrednio — unika cross-colony bleed)
    if (hasKeys(effectiveRates) && this.resourceSystem) {
      this.resourceSystem.registerProducer(producerId, effectiveRates);
    }

    // Housing (bezpośrednio na własnym civSystem) — isHabitat: tylko dedykowane
    // habitaty liczą się do wzrostu populacji na planetach non-breathable.
    if (building.housing > 0 && this.civSystem) {
      this.civSystem.addHousing(building.housing, !!building.isHabitat);
    }

    // Fabryka: dodaj punkt produkcji
    if (buildingId === 'factory' && this._factorySystem) {
      this._factorySystem.setTotalPoints(this._factorySystem.totalPoints + 1);
    }

    // Invaliduj cache mine level jeśli zbudowano kopalnię
    if (building.isMine || buildingId === 'mine') this._mineLevelDirty = true;

    // Przelicz stawki sąsiadów (adjacency bonus — Etap 38)
    this._reapplyNeighborRates(tileKey);

    // Faction shift — budynki frakcyjne przesuwają suwak (Faza C1)
    // Działa tylko gdy buildingId istnieje w BUILDING_SLIDER_SHIFTS
    const factionDelta = BUILDING_SLIDER_SHIFTS[buildingId];
    if (factionDelta && !isCapital) {
      EventBus.emit('faction:sliderShift', {
        delta:  factionDelta,
        reason: `${buildingId}_built`,
      });
    }

    // Faza D2b: hooki narracyjne dla cultural buildings — placeholders dla Faza D4
    // (no-op listenerów; brak crash; konsumowane przez UI/narrative system w przyszłości)
    if (buildingId === 'memory_vault') {
      EventBus.emit('narrative:memoryVaultBuilt');
    } else if (buildingId === 'mission_archive') {
      EventBus.emit('ui:missionArchiveBuilt');
    }
  }

  // ── Budowa ──────────────────────────────────────────────────────────────

  _build(tile, buildingId) {
    const building = BUILDINGS[buildingId];
    if (!building) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.unknownBuilding') });
      return;
    }

    const isCapital = !!building.isCapital;

    if (!isCapital && tile.isOccupied) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.tileOccupied') });
      return;
    }

    // Bramka teren+klimat (jedno źródło prawdy) — emituj KONKRETNY powód (teren/klimat).
    const placement = evaluatePlacement(tile, building, {
      techSystem: this.techSystem,
      planet: this._resolveOwnPlanet(),
    });
    if (!placement.ok) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: t(placement.reason) });
      return;
    }

    // Sprawdzenie wymaganej technologii
    if (building.requires) {
      const hastech = this.techSystem?.isResearched(building.requires) ?? false;
      if (!hastech) {
        const tech = TECHS[building.requires];
        const techName = tech ? getName(tech, 'tech') : building.requires;
        EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.requiresTech', techName) });
        return;
      }
    }

    // Faza D2b: budynek-prereq — wymaga aktywnego budynku w TEJ samej kolonii
    // (np. heritage_dome wymaga mission_archive). Sprawdza _active per-tej-kolonii BuildingSystem.
    if (building.requiresBuilding) {
      let hasPrereqBuilding = false;
      for (const entry of this._active.values()) {
        if (entry.building?.id === building.requiresBuilding) {
          hasPrereqBuilding = true;
          break;
        }
      }
      if (!hasPrereqBuilding) {
        const prereqDef = BUILDINGS[building.requiresBuilding];
        const prereqName = prereqDef ? getName(prereqDef, 'building') : building.requiresBuilding;
        EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.requiresBuilding', prereqName) });
        return;
      }
    }

    // Faza C5: gating frakcyjny — budynki frakcyjne wymagają odblokowanych frakcji,
    // a niektóre dodatkowo określonej pozycji suwaka.
    if (building.requiresFactionUnlocked || building.factionGating) {
      const fSys = window.KOSMOS?.factionSystem;
      if (!fSys || fSys.isLocked) {
        EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.factionLocked') });
        return;
      }
      if (building.factionGating) {
        const slider = fSys.slider ?? 50;
        const { slider: op, value } = building.factionGating;
        let pass = false;
        if (op === '>') pass = slider > value;
        else if (op === '<') pass = slider < value;
        else if (op === '>=') pass = slider >= value;
        else if (op === '<=') pass = slider <= value;
        else pass = true;
        if (!pass) {
          EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.factionSliderRequired', `${op}${value}`) });
          return;
        }
      }
    }

    // Reguła "spaceport first" usunięta — budowanie nie wymaga portu kosmicznego

    // Outpost: tylko budynki autonomiczne (popCost=0 lub isAutonomous)
    if (this._isOutpost && !isCapital && !building.isSpaceport) {
      const isAllowedOnOutpost = building.isAutonomous || (building.jobs ?? 0) === 0;
      if (!isAllowedOnOutpost) {
        EventBus.emit('planet:buildResult', {
          success: false, tile,
          reason: t('ui.outpostAutonomousOnly'),
        });
        return;
      }

      // Outpost: max OUTPOST_MAX_BUILDINGS budynków (bez stolica/spaceport)
      const outpostCount = this._countOutpostBuildings();
      if (outpostCount >= OUTPOST_MAX_BUILDINGS) {
        EventBus.emit('planet:buildResult', {
          success: false, tile,
          reason: t('ui.outpostMaxBuildings', OUTPOST_MAX_BUILDINGS),
        });
        return;
      }
    }

    // Modyfikator polarny (wyłączony dla RegionSystem — polarność wbudowana w biom)
    const latMod = (!this._isRegionMode && this._gridHeight > 0)
      ? HexGrid.getLatitudeModifier(tile.r, this._gridHeight)
      : { production: 1.0, buildCost: 1.0, label: null };

    // Oblicz koszt surowców: modyfikator polarny (latMod) × dopłata środowiskowa (Stage 2).
    // Wspólny helper z UI (computeBuildResourceCost) → podgląd == rzeczywisty koszt dla części środowiskowej.
    const actualCost = {};
    Object.assign(actualCost, computeBuildResourceCost(building, this._resolveOwnPlanet(), latMod.buildCost));
    // Commodity cost: bez modyfikatora polarnego, ale Z dopłatą środowiskową (Stage 3 Part A) —
    // ta sama premia % co surowce, żeby harsh planeta nie była do obejścia komponentami.
    Object.assign(actualCost, computeBuildCommodityCost(building, this._resolveOwnPlanet()));

    // Habitat na planecie z atmosferą thick/dense — nie wymaga habitat_modules
    if (buildingId === 'habitat') {
      const atmo = window.KOSMOS?.homePlanet?.atmosphere;
      if (atmo === 'thick' || atmo === 'dense') {
        delete actualCost.pressure_modules;
      }
    }

    // Surcharge Si na ekstremalnych planetach (brak atmo, gorąco, zimno)
    if (this._isPlanetExtreme() && (building.jobs ?? 0) > 0 && !building.isAutonomous) {
      actualCost.Si = (actualCost.Si || 0) + 5;
    }

    // Mutex: farm vs synthesized_food_plant (nie mogą istnieć na tej samej planecie)
    if (building.isSynthFood) {
      for (const entry of this._active.values()) {
        if (entry.building.id === 'farm') {
          EventBus.emit('planet:buildResult', {
            success: false, tile,
            reason: t('ui.farmConflictSynth'),
          });
          return;
        }
      }
    }
    if (buildingId === 'farm') {
      for (const entry of this._active.values()) {
        if (entry.building.isSynthFood) {
          EventBus.emit('planet:buildResult', {
            success: false, tile,
            reason: t('ui.synthConflictFarm'),
          });
          return;
        }
      }
    }

    // Sprawdzenie POPów i surowców — brak → dodaj do pending queue
    const popCost = this._isOutpost ? 0 : (building.popCost ?? POP_PER_BUILDING);
    const jobs    = this._isOutpost ? 0 : (building.jobs ?? 0);
    // Orbital Logistics Hub — koszt budowy może pochodzić ze WSPÓLNEJ puli (matka+księżyce); off-pool = surowy ResourceSystem.
    const buildStore = window.KOSMOS?.systemPoolService?.getStore(this.resourceSystem) ?? this.resourceSystem;
    const canAffordResources = !(buildStore && hasKeys(actualCost) && !buildStore.canAfford(actualCost));
    // Population 2.0 Faza 2: budowa NIE wymaga wolnych POP (§1/§3.4 — płynna obsada). Budynek
    // dodaje wolne etaty i działa understaffed (min(1, staffing)), aż alokacja przydzieli ludzi.
    // Do pending queue trafia WYŁĄCZNIE z braku surowców.
    if (!canAffordResources) {
      const tileKey = tile.key;
      this._pendingQueue.set(tileKey, {
        tileKey,
        buildingId,
        cost: { ...actualCost },
        popCost,
        jobs,
        isUpgrade: false,
        targetLevel: null,
        tileR: tile.r,
        tileType: tile.type,
        queuedAt: window.KOSMOS?.timeSystem?.gameTime ?? 0,
      });
      tile.pendingBuild = buildingId;
      EventBus.emit('planet:buildResult', { success: true, tile, buildingId, queued: true });
      EventBus.emit('planet:buildQueued', { tile, buildingId, cost: { ...actualCost } });
      return;
    }

    // Pobierz koszt (z puli jeśli aktywna)
    if (buildStore && hasKeys(actualCost)) {
      buildStore.spend(actualCost);
    }

    // Czas budowy (z mnożnikiem tech — AI Core itp. + anomalia build_modifier)
    const rawBuildTime = building.buildTime ?? 0;
    const btMult = this.techSystem?.getBuildTimeMultiplier() ?? 1.0;
    const anomalyBtMult = (tile.anomalyEffect?.type === 'build_modifier' && tile.anomalyEffect.buildTimeMult)
      ? tile.anomalyEffect.buildTimeMult : 1.0;
    const buildTime = rawBuildTime * btMult * anomalyBtMult;

    if (buildTime > 0 && !isCapital) {
      // Budowa z opóźnieniem — dodaj do kolejki
      const tileKey = tile.key;
      this._constructionQueue.set(tileKey, {
        buildingId,
        progress: 0,
        buildTime,
        tileR: tile.r,
        tileType: tile.type,
      });
      tile.underConstruction = { buildingId, progress: 0, buildTime };
      EventBus.emit('planet:buildResult', { success: true, tile, buildingId, underConstruction: true });
      return;
    }

    // Natychmiastowa budowa (buildTime === 0 lub stolica)
    if (isCapital) {
      tile.capitalBase = true;
    } else {
      tile.buildingId = buildingId;
      tile.buildingLevel = 1;
    }

    this._activateBuilding(tile.key, buildingId, tile.r, tile.type, isCapital);
    EventBus.emit('planet:buildResult', { success: true, tile, buildingId });
  }

  // ── Ulepszenie budynku ──────────────────────────────────────────────────

  _upgrade(tile) {
    if (!tile.buildingId) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.noBuilding') });
      return;
    }

    // Nie można ulepszać podczas trwającej budowy/upgrade/pending na tym hexie
    if (tile.underConstruction) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.constructionInProgress') });
      return;
    }
    if (tile.pendingBuild) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.buildQueued') });
      return;
    }

    const entry = this._active.get(tile.key);
    if (!entry) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.noActiveBuilding') });
      return;
    }

    const building = entry.building;
    const currentLevel = entry.level || 1;
    const maxLevel = this.getMaxLevel();

    if (currentLevel >= maxLevel) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.maxLevel', maxLevel) });
      return;
    }

    const nextLevel = currentLevel + 1;

    // Koszt ulepszenia: baseCost × level × 1.2 × dopłata środowiskowa (Stage 3 — pełna siła jak
    // budowa, tylko część SUROWCOWA; commodityCost bez zmian, spójnie z computeBuildResourceCost).
    // Planeta TEJ kolonii (nie homePlanet); fail-open: brak planety → envMultiplier=1. Zamyka lukę
    // „upgrade omija premię środowiskową" z REFORM_STAGE2_REPORT (Part B, known scope gap).
    const upgradeEnvMult = envMultiplier(building.category, this._resolveOwnPlanet(), { building });
    const upgradeCost = {};
    if (building.cost) {
      for (const [k, v] of Object.entries(building.cost)) {
        upgradeCost[k] = Math.ceil(v * nextLevel * 1.2 * upgradeEnvMult);
      }
    }
    // Commodities od poziomu 3 — Z dopłatą środowiskową (Stage 3 Part A; ta sama premia % co surowce).
    if (nextLevel >= 3 && building.commodityCost) {
      for (const [k, v] of Object.entries(building.commodityCost)) {
        upgradeCost[k] = Math.ceil(v * (nextLevel - 1) * upgradeEnvMult);
      }
    }

    // Sprawdzenie POPów i surowców — brak → dodaj do pending queue
    const popCost = this._isOutpost ? 0 : (entry.popCost ?? building.popCost ?? POP_PER_BUILDING);
    const jobs    = this._isOutpost ? 0 : (entry.jobs ?? building.jobs ?? 0);
    // Orbital Logistics Hub — koszt upgrade może pochodzić ze wspólnej puli; off-pool = surowy ResourceSystem.
    const upgradeStore = window.KOSMOS?.systemPoolService?.getStore(this.resourceSystem) ?? this.resourceSystem;
    const canAffordUpgrade = !(upgradeStore && hasKeys(upgradeCost) && !upgradeStore.canAfford(upgradeCost));
    // Population 2.0 Faza 2: upgrade NIE wymaga wolnych POP (§3.4 — płynna obsada). Pending
    // tylko z braku surowców; dodatkowe etaty obsadza alokacja.
    if (!canAffordUpgrade) {
      const tileKey = tile.key;
      this._pendingQueue.set(tileKey, {
        tileKey,
        buildingId: building.id,
        cost: { ...upgradeCost },
        popCost,
        jobs,
        isUpgrade: true,
        targetLevel: nextLevel,
        tileR: tile.r,
        tileType: tile.type,
        queuedAt: window.KOSMOS?.timeSystem?.gameTime ?? 0,
      });
      tile.pendingBuild = building.id;
      EventBus.emit('planet:upgradeResult', { success: true, tile, queued: true });
      EventBus.emit('planet:upgradeQueued', { tile, cost: { ...upgradeCost } });
      return;
    }

    // Pobierz koszt (z puli jeśli aktywna)
    if (upgradeStore && hasKeys(upgradeCost)) {
      upgradeStore.spend(upgradeCost);
    }

    // Czas budowy upgrade: bazowy × 0.5
    const upgradeTime = (building.buildTime ?? 0) * 0.5;

    if (upgradeTime > 0) {
      // Upgrade z opóźnieniem — budynek działa normalnie na starym poziomie
      const tileKey = tile.key;
      this._constructionQueue.set(tileKey, {
        buildingId: building.id,
        progress: 0,
        buildTime: upgradeTime,
        tileR: tile.r,
        tileType: tile.type,
        isUpgrade: true,
        targetLevel: nextLevel,
      });
      tile.underConstruction = { buildingId: building.id, progress: 0, buildTime: upgradeTime, isUpgrade: true };
      EventBus.emit('planet:upgradeResult', { success: true, tile, underConstruction: true });
      return;
    }

    // Natychmiastowy upgrade (buildTime === 0)
    this._applyUpgrade(tile, entry, building, nextLevel, jobs);
    EventBus.emit('planet:upgradeResult', { success: true, tile, level: nextLevel });
  }

  // Wspólna logika natychmiastowego ulepszenia
  _applyUpgrade(tile, entry, building, nextLevel, jobs) {
    // Zatrudnienie — upgrade wymaga dodatkowych etatów (bezpośrednio)
    if (jobs > 0 && this.civSystem) {
      const pType = building.popType ?? 'laborer';
      this.civSystem.convertToStrata(pType, jobs);
      this.civSystem.changeEmployment(jobs);
    }

    // Aktualizuj level
    entry.level = nextLevel;
    tile.buildingLevel = nextLevel;

    // Przelicz stawki z nowym levelem. Slice 5C.2 (review): null greedy cache (level/obsada zmienione) +
    // przekaż tile.key do _applyTechMultipliers → paused guard działa (upgrade paused NIE wskrzesza
    // producenta) I greedy/synth-upkeep spójne z _reapplyAllRates.
    this._greedyStaffCache = null;
    entry.baseRates = this._calcBaseRates(building, tile, nextLevel);
    entry.effectiveRates = this._applyTechMultipliers(entry.baseRates, building, tile.key);

    const producerId = `building_${tile.key}`;
    if (hasKeys(entry.effectiveRates) && this.resourceSystem) {
      this.resourceSystem.registerProducer(producerId, entry.effectiveRates);
    } else if (this.resourceSystem) {
      this.resourceSystem.removeProducer(producerId);   // puste (np. paused) → wyrejestruj (bez stale producenta)
    }

    // Housing: każdy kolejny level dodaje housing (np. habitat +3/lv)
    if (building.housing > 0) {
      entry.housing = (entry.housing || 0) + building.housing;
      if (this.civSystem) this.civSystem.addHousing(building.housing, !!building.isHabitat);
    }

    // Fabryka: dodaj punkt produkcji za każdy level powyżej 1
    if (building.id === 'factory' && this._factorySystem) {
      this._recalcFactoryPoints();
    }

    // Invaliduj cache mine level jeśli ulepszono kopalnię
    if (building.id === 'mine' || building.isMine) this._mineLevelDirty = true;
  }

  // ── Rozbiórka ───────────────────────────────────────────────────────────

  _demolish(tile) {
    this._greedyStaffCache = null;   // Slice 5C.2 (review): usunięcie/downgrade zmienia _active/obsadę → świeży greedy
    // Anulowanie oczekującego zamówienia (pending)
    if (tile.pendingBuild) {
      const pendingId = tile.pendingBuild;
      this.cancelPending(tile.key);
      EventBus.emit('planet:demolishResult', { success: true, tile, cancelled: true, buildingId: pendingId });
      return;
    }

    // Anulowanie budowy w toku
    if (tile.underConstruction) {
      const uc = tile.underConstruction;
      const building = BUILDINGS[uc.buildingId];
      const tileKey = tile.key;

      // Usuń z kolejki
      this._constructionQueue.delete(tileKey);
      tile.underConstruction = null;

      // Zwrot 50% kosztu budowy (tylko dla nowej budowy, nie upgrade)
      if (!uc.isUpgrade && building && this.resourceSystem) {
        const refund = {};
        if (building.cost) {
          for (const [k, v] of Object.entries(building.cost)) {
            refund[k] = Math.floor(v * 0.5);
          }
        }
        if (building.commodityCost) {
          for (const [k, v] of Object.entries(building.commodityCost)) {
            refund[k] = Math.floor(v / 2);
          }
        }
        if (hasKeys(refund)) {
          this.resourceSystem.receive(refund);
        }
      }

      // Zwrot 50% kosztu upgrade
      if (uc.isUpgrade && building && this.resourceSystem) {
        const targetLevel = uc.targetLevel ?? 2;
        const refund = {};
        if (building.cost) {
          for (const [k, v] of Object.entries(building.cost)) {
            refund[k] = Math.floor(Math.ceil(v * targetLevel * 1.2) * 0.5);
          }
        }
        if (targetLevel >= 3 && building.commodityCost) {
          for (const [k, v] of Object.entries(building.commodityCost)) {
            refund[k] = Math.floor(Math.ceil(v * (targetLevel - 1)) / 2);
          }
        }
        if (hasKeys(refund)) {
          this.resourceSystem.receive(refund);
        }
      }

      EventBus.emit('planet:demolishResult', { success: true, tile, cancelled: true, buildingId: uc.buildingId });
      return;
    }

    if (!tile.buildingId) {
      EventBus.emit('planet:demolishResult', { success: false, tile, reason: t('ui.noBuilding') });
      return;
    }

    const buildingDef = BUILDINGS[tile.buildingId];
    if (buildingDef?.isColonyBase || buildingDef?.isCapital) {
      EventBus.emit('planet:demolishResult', { success: false, tile, reason: t('ui.capitalIndestructible') });
      return;
    }

    // Nie pozwól na rozbiórkę ostatniego portu kosmicznego
    if (buildingDef?.isSpaceport && this._requiresSpaceportFirst) {
      let spaceportCount = 0;
      for (const [, e] of this._active) {
        if (e.building.isSpaceport) spaceportCount++;
      }
      if (spaceportCount <= 1) {
        EventBus.emit('planet:demolishResult', {
          success: false, tile, reason: t('ui.cannotDemolishSpaceport'),
        });
        return;
      }
    }

    const entry     = this._active.get(tile.key);
    const buildingId = tile.buildingId;
    const building  = BUILDINGS[buildingId];
    const level     = entry?.level ?? 1;

    // ── Downgrade (Lv > 1): obniż o 1 poziom ──────────────────────
    if (level > 1) {
      const refund = {};
      // Zwrot surowców: floor(ceil(baseCost × level × 1.2) × 0.5)
      if (building?.cost) {
        for (const [k, v] of Object.entries(building.cost)) {
          refund[k] = Math.floor(Math.ceil(v * level * 1.2) * 0.5);
        }
      }
      // Zwrot commodities (tylko gdy level >= 3 — wydano je przy upgrade do 3+)
      if (level >= 3 && building?.commodityCost) {
        for (const [k, v] of Object.entries(building.commodityCost)) {
          const spent = Math.ceil(v * (level - 1));
          refund[k] = Math.floor(spent / 2);
        }
      }

      // Oddaj surowce i commodities
      if (this.resourceSystem && hasKeys(refund)) {
        this.resourceSystem.receive(refund);
      }

      // Obniż poziom
      const newLevel = level - 1;
      entry.level = newLevel;
      tile.buildingLevel = newLevel;

      // Droid-per-job (D5): nowy J może być < count droidów → zniszcz nadmiar (bez zwrotu, jak remove).
      if (tile.syntheticSlot) {
        const newJ = (building?.jobs ?? 0) * newLevel;
        if ((tile.syntheticSlot.count ?? 0) > newJ) {
          if (newJ <= 0) tile.syntheticSlot = null;
          else tile.syntheticSlot.count = newJ;
        }
      }

      // Przelicz stawki na nowy (niższy) level — z tile.key, by synth upkeep/efficiency się uwzględniły
      entry.baseRates = this._calcBaseRates(building, tile, newLevel);
      entry.effectiveRates = this._applyTechMultipliers(entry.baseRates, building, tile.key);

      const producerId = `building_${tile.key}`;
      if (hasKeys(entry.effectiveRates) && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, entry.effectiveRates);
      }

      // Fabryka: przelicz punkty produkcji
      if (buildingId === 'factory' && this._factorySystem) {
        this._recalcFactoryPoints();
      }

      // Odejmij housing za obniżony poziom (np. habitat -3/lv)
      if (building?.housing > 0) {
        entry.housing = Math.max(0, (entry.housing || 0) - building.housing);
        if (this.civSystem) this.civSystem.removeHousing(building.housing, !!building.isHabitat);
      }

      // Zwolnij POPy za obniżony poziom (bezpośrednio)
      const downgradeJobs = entry.jobs ?? building?.jobs ?? 0;
      if (downgradeJobs > 0 && this.civSystem) {
        this.civSystem.changeEmployment(-downgradeJobs);
      }

      // Invaliduj cache mine level jeśli rozebrano kopalnię
      if (buildingId === 'mine' || building?.isMine) this._mineLevelDirty = true;

      EventBus.emit('planet:demolishResult', {
        success: true, tile, buildingId,
        downgrade: true, newLevel,
      });
      return;
    }

    // ── Pełna rozbiórka (Lv 1) ──────────────────────────────────────

    // Usuń producenta (bezpośrednio)
    if (this.resourceSystem) {
      this.resourceSystem.removeProducer(`building_${tile.key}`);
    }

    // Housing (bezpośrednio)
    if (entry?.housing > 0 && this.civSystem) {
      this.civSystem.removeHousing(entry.housing, !!entry.building?.isHabitat);
    }

    // Zwrot 50% kosztu budowy (surowce + commodities)
    if (building && this.resourceSystem) {
      const refund = {};
      if (building.cost) {
        for (const [k, v] of Object.entries(building.cost)) {
          refund[k] = Math.floor(v * 0.5);
        }
      }
      if (building.commodityCost) {
        for (const [k, v] of Object.entries(building.commodityCost)) {
          refund[k] = Math.floor(v / 2);
        }
      }
      if (hasKeys(refund)) {
        this.resourceSystem.receive(refund);
      }
    }

    // Fabryka: odejmij punkty produkcji
    if (buildingId === 'factory' && this._factorySystem) {
      this._recalcFactoryPoints();
    }

    // Zwolnij POPy (bezpośrednio)
    const jobs = entry?.jobs ?? building?.jobs ?? 0;
    if (jobs > 0 && this.civSystem) {
      this.civSystem.changeEmployment(-jobs);
    }

    // Invaliduj cache mine level jeśli rozebrano kopalnię
    if (buildingId === 'mine' || building?.isMine) this._mineLevelDirty = true;

    tile.buildingId = null;
    tile.buildingLevel = 1;
    tile.syntheticSlot = null;   // droid-per-job: pełna rozbiórka niszczy droidy (były na tym budynku)
    this._active.delete(tile.key);

    EventBus.emit('planet:demolishResult', { success: true, tile, buildingId });
  }

  // ── Tick budowy — progresja construction queue ────────────────────────

  _tickConstruction(deltaYears) {
    if (this._constructionQueue.size === 0) return;

    const completed = [];

    for (const [tileKey, entry] of this._constructionQueue) {
      entry.progress += deltaYears;

      if (entry.progress >= entry.buildTime) {
        completed.push(tileKey);
      }
    }

    // Powiadom UI o postępie budowy (pasek progresu)
    // planetId — żeby ColonyOverlay zsynchronizował grid TEJ kolonii (nie tylko aktualnie wyświetlanej)
    if (completed.length < this._constructionQueue.size) {
      EventBus.emit('planet:constructionProgress', { planetId: this._planetId });
    }

    for (const tileKey of completed) {
      const entry = this._constructionQueue.get(tileKey);
      this._constructionQueue.delete(tileKey);

      if (entry.isUpgrade) {
        // Upgrade zakończony — zaktualizuj level w _active
        const activeEntry = this._active.get(tileKey);
        if (activeEntry) {
          const building = activeEntry.building;
          const nextLevel = entry.targetLevel ?? (activeEntry.level + 1);
          const jobs = activeEntry.jobs ?? building?.jobs ?? 0;

          // Użyj tile-like do _applyUpgrade
          const tileLike = { key: tileKey, r: entry.tileR, type: entry.tileType, buildingLevel: activeEntry.level, buildingId: building.id };
          this._applyUpgrade(tileLike, activeEntry, building, nextLevel, jobs);
        }
      } else {
        // Nowa budowa zakończona — aktywuj budynek
        this._activateBuilding(tileKey, entry.buildingId, entry.tileR, entry.tileType, false);
      }

      EventBus.emit('planet:constructionComplete', {
        tileKey,
        buildingId: entry.buildingId,
        isUpgrade: entry.isUpgrade,
        planetId: this._planetId,
      });
    }
  }

  // ── Tick pending queue — sprawdź czy zamówienia mogą ruszyć ──────────

  _tickPendingQueue() {
    if (this._pendingQueue.size === 0) return;

    // Zbierz klucze do iteracji (nie modyfikujemy Map podczas for..of)
    const keys = [...this._pendingQueue.keys()];

    for (const tileKey of keys) {
      const order = this._pendingQueue.get(tileKey);
      if (!order) continue;

      // Sprawdź środki (re-check — stan mógł się zmienić po poprzednim fulfillment). Pula jeśli aktywna.
      const pendingStore = window.KOSMOS?.systemPoolService?.getStore(this.resourceSystem) ?? this.resourceSystem;
      if (hasKeys(order.cost) && !pendingStore?.canAfford(order.cost)) continue;

      // Population 2.0 Faza 2: pending fulfilluje się na samych surowcach — brak wolnych POP
      // NIE blokuje (§3.4 płynna obsada). Bramka POP usunięta świadomie.

      // ── Fulfill — usuń z pending, pobierz koszt, uruchom budowę ──
      this._pendingQueue.delete(tileKey);

      if (hasKeys(order.cost)) {
        pendingStore.spend(order.cost);
      }

      if (order.isUpgrade) {
        const entry = this._active.get(tileKey);
        if (entry) {
          const building = entry.building;
          const upgradeTime = (building.buildTime ?? 0) * 0.5;

          if (upgradeTime > 0) {
            this._constructionQueue.set(tileKey, {
              buildingId: building.id,
              progress: 0,
              buildTime: upgradeTime,
              tileR: order.tileR,
              tileType: order.tileType,
              isUpgrade: true,
              targetLevel: order.targetLevel,
            });
          } else {
            const tileLike = { key: tileKey, r: order.tileR, type: order.tileType, buildingLevel: entry.level, buildingId: building.id };
            this._applyUpgrade(tileLike, entry, building, order.targetLevel, neededPop);
          }
        }
      } else {
        const building = BUILDINGS[order.buildingId];
        const rawBuildTime = building?.buildTime ?? 0;
        const btMult = this.techSystem?.getBuildTimeMultiplier() ?? 1.0;
        const buildTime = rawBuildTime * btMult;

        if (buildTime > 0) {
          this._constructionQueue.set(tileKey, {
            buildingId: order.buildingId,
            progress: 0,
            buildTime,
            tileR: order.tileR,
            tileType: order.tileType,
          });
        } else {
          this._activateBuilding(tileKey, order.buildingId, order.tileR, order.tileType, false);
        }
      }

      EventBus.emit('planet:pendingFulfilled', {
        tileKey,
        buildingId: order.buildingId,
        isUpgrade: order.isUpgrade,
        planetId: this._planetId,
      });
    }
  }

  // ── Anuluj budowę w toku (z outliner / UI) ─────────────────────────────

  cancelConstruction(tileKey) {
    const entry = this._constructionQueue.get(tileKey);
    if (!entry) return;
    // Znajdź tile w gridzie
    const [q, r] = tileKey.split(',').map(Number);
    const tile = this._grid?.get(q, r);
    if (tile) {
      // Deleguj do _demolish — obsłuży zwrot kosztów i czyszczenie
      this._demolish(tile);
    }
  }

  // ── Anuluj oczekujące zamówienie ────────────────────────────────────────

  cancelPending(tileKey) {
    const order = this._pendingQueue.get(tileKey);
    if (!order) return;
    this._pendingQueue.delete(tileKey);
    // Tile pendingBuild jest czyszczony przez _syncBuildingIds() po evencie
    EventBus.emit('planet:pendingCancelled', { tileKey });
  }

  // ── Demand z pending orders (dla CivilianTradeSystem) ────────────────

  /**
   * Auto-umieść budynek na pierwszym pasującym hexie (bez kosztu surowców).
   * Używane przy: auto-spaceport z colony ship, outpost + budynek z cargo,
   * bootstrap kolonii imperium AI (EmpireColonyBootstrap, Slice 1).
   * @param {string} buildingId
   * @param {Object} [opts] — opcje placementu
   * @param {string[]} [opts.preferredTerrain] — priorytet terenu (Faza 1, hard hint);
   *        jeśli istnieje wolny hex z tej listy, wybiera najmniej polarny.
   *        Bez preferredTerrain → Faza 2: scoring wg AiTerrainRules + polar penalty.
   * @returns {boolean} true jeśli udało się postawić
   */
  autoPlaceBuilding(buildingId, opts = {}) {
    const building = BUILDINGS[buildingId];
    if (!building) return false;

    // Idempotencja stolicy: nie stawiaj drugiej, jeśli już istnieje. Stolica może
    // być postawiona dwiema ścieżkami (autoPlaceBuilding w _onColonyFounded ORAZ
    // fallback w ColonyOverlay._getGrid) — bez tego guardu powstałyby dwie.
    if (building.isCapital) {
      for (const key of this._active.keys()) {
        if (key.startsWith('capital_')) return false;
      }
    }

    const grid = this._grid;
    if (!grid || typeof grid.forEach !== 'function') return false;

    const rows = grid.height ?? 10;
    const preferred = Array.isArray(opts.preferredTerrain) && opts.preferredTerrain.length > 0
      ? opts.preferredTerrain
      : null;

    // Reguła terenu AI — JEDNO źródło prawdy współdzielone z ColonyAutoExpander.
    //   _findFreeTile i EmpireColonyBootstrap._placeBuildingSmart (AiTerrainRules.js).
    const rule = getTerrainRule(buildingId);
    const hardTerrains = rule?.mode === 'hard' ? rule.terrains : null;
    const softTerrains = rule?.mode === 'soft' ? rule.terrains : null;

    // Wspólny predykat "wolny + buildowalny hex".
    const isFreeHex = (tile) => {
      if (tile.buildingId) return false;
      if (tile.capitalBase) return false;
      if (tile.underConstruction) return false;
      if (tile.pendingBuild) return false;
      return TERRAIN_TYPES[tile.type]?.buildable === true;
    };

    // POLAR_PENALTY: zsynchronizowane z ColonyAutoExpander._findFreeTile (-5/-2).
    //   Jeśli zmieniasz tu wartości, zmień też tam i w
    //   EmpireColonyBootstrap._placeBuildingSmart — trzy kopie tej samej skali.
    const polarPenalty = (r) => {
      if (r === 0 || r === rows - 1) return -5;
      if (r === 1 || r === rows - 2) return -2;
      return 0;
    };

    // Faza 1 — jawny preferredTerrain od callera (hard hint). Fix: czytamy
    //   tile.type, nie nieistniejące tile.terrain (przez co Faza 1 była martwa).
    //   Wśród pasujących preferowanych wybieramy najmniej polarny.
    let placedKey = null;
    let placedTile = null;
    if (preferred) {
      let bestScore = -Infinity;
      grid.forEach(tile => {
        if (!isFreeHex(tile)) return;
        if (!preferred.includes(tile.type)) return;
        const score = polarPenalty(tile.r);
        if (score > bestScore) {
          bestScore  = score;
          placedKey  = tile.key ?? `${tile.q},${tile.r}`;
          placedTile = tile;
        }
      });
    }

    // Faza 2 — scoring-based selection (wzór _findFreeTile): soft-bonus za teren
    //   z reguły AI + polar penalty. enforceHard=true → wymuś hardTerrains,
    //   fallback na dowolny buildowalny DOPIERO gdy żaden hex z listy nie wolny
    //   (nie blokuj dropu — nigdy nie wymuszaj bieguna jeśli jest cokolwiek innego).
    if (!placedTile) {
      const pick = (enforceHard) => {
        let best = null, bestKey = null, bestScore = -Infinity;
        grid.forEach(tile => {
          if (!isFreeHex(tile)) return;
          if (enforceHard && hardTerrains && !hardTerrains.includes(tile.type)) return;
          let score = 0;
          if (softTerrains && softTerrains.includes(tile.type)) score += 10;
          score += polarPenalty(tile.r);
          if (score > bestScore) {
            bestScore = score;
            best      = tile;
            bestKey   = tile.key ?? `${tile.q},${tile.r}`;
          }
        });
        return { best, bestKey };
      };
      let res = pick(!!hardTerrains);
      if (!res.best && hardTerrains) res = pick(false);  // fallback poza hard-listę
      placedTile = res.best;
      placedKey  = res.bestKey;
    }

    if (!placedTile) return false;

    const key = placedKey;
    const tile = placedTile;

    // Stolica: specjalna logika (virtualny budynek, capitalBase flag)
    const isCapital = !!building.isCapital;
    if (isCapital) {
      tile.capitalBase = true;
    } else {
      tile.buildingId = buildingId;
      tile.buildingLevel = 1;
    }

    // Deleguj do wspólnej aktywacji — rejestracja produkcji, zatrudnienia, housing,
    // konwersji strata, faction shift, factory points itd.
    this._activateBuilding(key, buildingId, tile.r, tile.type, isCapital);

    return true;
  }

  getPendingDemand() {
    const demand = {};
    for (const [, order] of this._pendingQueue) {
      for (const [resId, qty] of Object.entries(order.cost)) {
        demand[resId] = (demand[resId] ?? 0) + qty;
      }
    }
    return demand;
  }

  // ── Przywracanie zapisanego stanu ───────────────────────────────────────

  restoreFromSave(buildings) {
    let totalJobs = 0;
    let totalHousing = 0;
    let totalHabitatHousing = 0;   // tylko dedykowane habitaty (isHabitat) — limit wzrostu non-breathable

    for (const b of buildings) {
      const building = BUILDINGS[b.buildingId];
      if (!building) continue;

      const isCapital = !!building.isCapital;
      const level = b.level ?? 1;

      const baseRates      = b.baseRates || b.effectiveRates || {};
      const effectiveRates = this._applyTechMultipliers(baseRates, building);

      const activeKey  = isCapital ? (b.tileKey.startsWith('capital_') ? b.tileKey : `capital_${b.tileKey}`) : b.tileKey;
      const producerId = isCapital ? `capital_${b.tileKey.replace('capital_', '')}` : `building_${b.tileKey}`;
      const popCost    = this._isOutpost ? 0 : (b.popCost ?? building.popCost ?? POP_PER_BUILDING);  // oryginał (compat)
      const jobs       = this._isOutpost ? 0 : (building.jobs ?? 0);  // Population 2.0: z żywej definicji (stare+nowe save → ×4)
      const housing    = b.housing || 0;

      // Slice 5C.2: paused (flag) → produkcja idle (nie rejestruj producenta). designation ?? 'active' (soft, bez migracji).
      const designation = b.designation ?? 'active';
      const paused = GAME_CONFIG.FEATURES?.popAllocation2Priority === true && designation === 'paused';
      const effRates = paused ? {} : effectiveRates;
      if (hasKeys(effRates) && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, effRates);
      }
      this._active.set(activeKey, {
        building, baseRates, effectiveRates: effRates,
        housing,
        popCost,
        jobs,
        level,
        producerId,
        designation,
      });
      totalJobs += paused ? 0 : jobs * level;   // Slice 5C.2 (gate fix): paused nie liczy etatów (spójne z getSlotDemand)
      totalHousing += housing;  // housing już skumulowany (per-level) w serialize()
      if (building.isHabitat) totalHabitatHousing += housing;
    }

    if (this.civSystem) {
      // Przelicz zatrudnienie z budynków
      if (totalJobs > 0) {
        this.civSystem._employedPops = Math.max(0, this.civSystem._employedPops + totalJobs);
      }
      // Przelicz housing z budynków (analogicznie — bezpośrednio, nie przez EventBus)
      if (totalHousing > 0) {
        this.civSystem.housing += totalHousing;
      }
      // Habitat housing (limit wzrostu populacji na planetach non-breathable)
      if (totalHabitatHousing > 0) {
        this.civSystem.habitatHousing += totalHabitatHousing;
      }
    }

    // Przelicz punkty fabryczne po restore
    if (this._factorySystem) {
      this._recalcFactoryPoints();
    }
  }

  restoreFromGrid(grid) {
    grid.forEach(tile => {
      if (!tile.buildingId) return;  // pomiń puste i underConstruction-only
      const building = BUILDINGS[tile.buildingId];
      if (!building) return;

      const level = tile.buildingLevel ?? 1;
      const baseRates      = this._calcBaseRates(building, tile, level);
      const effectiveRates = this._applyTechMultipliers(baseRates, building);
      const producerId     = `building_${tile.key}`;

      if (hasKeys(effectiveRates) && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, effectiveRates);
      }
      this._active.set(tile.key, {
        building, baseRates, effectiveRates,
        housing: building.housing,
        popCost: building.popCost ?? POP_PER_BUILDING,
        jobs: building.jobs ?? 0,
        level,
        producerId,
        designation: tile.buildingDesignation ?? 'active',   // Slice 5C.2 (grid-carried, soft)
      });
    });

    if (this._factorySystem) {
      this._recalcFactoryPoints();
    }
  }

  // Z4: rozłącz ticker per-kolonia (ColonyManager.removeColony).
  dispose() {
    if (this._onTick) EventBus.off('time:tick', this._onTick);
    this._onTick = null;
  }

  // ── Serializacja ────────────────────────────────────────────────────────

  serialize() {
    const buildings = [];
    this._active.forEach((entry, tileKey) => {
      buildings.push({
        tileKey,
        buildingId:     entry.building.id,
        baseRates:      { ...(entry.baseRates || {}) },
        effectiveRates: { ...(entry.effectiveRates || {}) },
        housing:        entry.housing || 0,
        popCost:        entry.popCost ?? 0.25,
        level:          entry.level ?? 1,
        designation:    entry.designation ?? 'active',   // Slice 5C.2 (soft, bez migracji)
      });
    });
    return buildings;
  }

  // Serializacja kolejki budowy (oddzielnie — przez ColonyManager)
  serializeQueue() {
    const queue = [];
    for (const [tileKey, entry] of this._constructionQueue) {
      const item = {
        tileKey,
        buildingId: entry.buildingId,
        progress:   entry.progress,
        buildTime:  entry.buildTime,
        tileR:      entry.tileR,
        tileType:   entry.tileType,
      };
      if (entry.isUpgrade) {
        item.isUpgrade   = true;
        item.targetLevel = entry.targetLevel;
      }
      queue.push(item);
    }
    return queue;
  }

  // Przywracanie kolejki budowy (z ColonyManager.restore)
  restoreQueue(queue) {
    if (!Array.isArray(queue)) return;
    for (const item of queue) {
      this._constructionQueue.set(item.tileKey, {
        buildingId: item.buildingId,
        progress:   item.progress ?? 0,
        buildTime:  item.buildTime ?? 1,
        tileR:      item.tileR ?? 0,
        tileType:   item.tileType ?? 'plains',
        isUpgrade:  item.isUpgrade ?? false,
        targetLevel: item.targetLevel,
      });
    }
  }

  // Serializacja pending queue (oddzielnie — przez ColonyManager)
  serializePendingQueue() {
    const pending = [];
    for (const [, order] of this._pendingQueue) {
      pending.push({ ...order });
    }
    return pending;
  }

  // Przywracanie pending queue (z ColonyManager.restore)
  restorePendingQueue(pending) {
    if (!Array.isArray(pending)) return;
    for (const item of pending) {
      this._pendingQueue.set(item.tileKey, {
        tileKey:     item.tileKey,
        buildingId:  item.buildingId,
        cost:        item.cost ?? {},
        isUpgrade:   item.isUpgrade ?? false,
        targetLevel: item.targetLevel ?? null,
        tileR:       item.tileR ?? 0,
        tileType:    item.tileType ?? 'plains',
        queuedAt:    item.queuedAt ?? 0,
      });
    }
  }

  // ── Prywatne ────────────────────────────────────────────────────────────

  _isPlanetExtreme() {
    const planet = window.KOSMOS?.homePlanet;
    if (!planet) return false;
    return planet.atmosphere === 'none'
      || (planet.temperatureC != null && planet.temperatureC > 150)
      || (planet.temperatureC != null && planet.temperatureC < -100);
  }

  // Planeta TEJ kolonii (multi-colony-safe) — NIE window.KOSMOS.homePlanet (bug audytu).
  // Fail-open: brak referencji → null → bramka klimatyczna pomijana (nigdy nie blokuje na braku danych).
  _resolveOwnPlanet() {
    return window.KOSMOS?.colonyManager?.getColony(this._planetId)?.planet ?? null;
  }

  _canBuildOnTile(tile, building) {
    // Deleguje do jednego źródła prawdy (teren + klimat). Zachowuje kontrakt =>bool dla 3 callerów.
    return evaluatePlacement(tile, building, {
      techSystem: this.techSystem,
      planet: this._resolveOwnPlanet(),
    }).ok;
  }

  // Oblicz stawki bazowe z uwzględnieniem poziomu budynku
  // Efekt poziomu: rate × level (liniowy — upgrade podwaja produkcję)
  _calcBaseRates(building, tile, level = 1) {
    const hasRates = building.rates && hasKeys(building.rates);
    const hasEnergyCost = building.energyCost && building.energyCost > 0;
    const hasMaintenance = building.maintenance && hasKeys(building.maintenance);

    // Anomalia na hexie — efekt tile-level (np. miningBonus, building_multiplier, passive_resource)
    const anomalyEff = tile.anomalyEffect ?? null;

    // Jeśli brak rates I brak energyCost I brak maintenance I brak anomaly passive → naprawdę puste
    const hasAnomalyPassive = anomalyEff?.type === 'passive_resource' && anomalyEff.resource;
    if (!hasRates && !hasEnergyCost && !hasMaintenance && !hasAnomalyPassive) return {};

    const terrain = TERRAIN_TYPES[tile.type];
    const bonuses = terrain?.yieldBonus ?? {};
    const multiplier = bonuses[building.category] ?? bonuses.default ?? 1.0;

    // Kara klimatyczna (Stage 1): budynek open-air (flaga requiresOpenAirClimate — farm) na
    // cienkiej atmosferze → ×0.5 do produkcji żywności. Planeta TEJ kolonii (nie homePlanet).
    // Stackuje MULTIPLIKATYWNIE z terenowym multiplier (np. ice_sheet 0.8 × 0.5 = 0.4).
    const climatePlanet = this._resolveOwnPlanet();
    const climateFoodMult = (building.requiresOpenAirClimate && climatePlanet?.atmosphere === 'thin') ? 0.5 : 1.0;

    const latMod = (!this._isRegionMode && this._gridHeight > 0)
      ? HexGrid.getLatitudeModifier(tile.r, this._gridHeight)
      : { production: 1.0, buildCost: 1.0, label: null };

    // Mnożnik poziomu: liniowy — Lv2 = 2x, Lv3 = 3x produkcji
    const levelMult = level;

    // ── Anomaly: mnożnik budynku na hexie (building_multiplier) ──
    let anomalyBuildingMult = 1.0;
    if (anomalyEff?.type === 'building_multiplier' && anomalyEff.buildingId === building.id) {
      anomalyBuildingMult = anomalyEff.multiplier ?? 1.0;
    }

    // ── Anomaly: bonus wydobycia (tile_yield_bonus) — dotyczy budynków kategorii mining ──
    let anomalyMiningMult = 1.0;
    if (anomalyEff?.type === 'tile_yield_bonus' && anomalyEff.miningBonus && building.category === 'mining') {
      anomalyMiningMult = 1.0 + anomalyEff.miningBonus;
    }

    // ── Anomaly: bonus planetarny (food bonus) ──
    let anomalyFoodMult = 1.0;
    const anomalySys = window.KOSMOS?.anomalyEffectSystem;
    if (anomalySys && this._planetId) {
      const foodBonus = anomalySys.getFoodBonus(this._planetId);
      if (foodBonus > 0 && building.category === 'food') {
        anomalyFoodMult = 1.0 + foodBonus;
      }
    }

    const anomalyMult = anomalyBuildingMult * anomalyMiningMult * anomalyFoodMult;

    const base = {};
    if (hasRates) {
      const rates = building.rates;
      for (const key in rates) {
        const val = rates[key];
        if (key === 'research') {
          base[key] = val * latMod.production * levelMult * anomalyMult;
        } else if (val < 0) {
          // Konsumpcja rośnie liniowo z levelem: Lv2 = 2×, Lv3 = 3×
          base[key] = val * levelMult;
        } else {
          base[key] = val * multiplier * (key === 'food' ? climateFoodMult : 1) * latMod.production * levelMult * anomalyMult;
        }
      }
    }

    // ── Anomaly: pasywny zasób z hexa (passive_resource) — dodaj do produkcji budynku ──
    if (hasAnomalyPassive) {
      const res = anomalyEff.resource;
      const amt = anomalyEff.amount ?? 0;
      base[res] = (base[res] ?? 0) + amt;
    }

    // ── Anomaly: pasywny zasób z tile_yield_bonus (np. +0.5 Hv/rok) ──
    if (anomalyEff?.type === 'tile_yield_bonus' && anomalyEff.passiveResource && anomalyEff.passiveAmount) {
      const res = anomalyEff.passiveResource;
      const amt = anomalyEff.passiveAmount;
      base[res] = (base[res] ?? 0) + amt;
    }

    // Dopłata środowiskowa do UTRZYMANIA (połowa siły — Stage 2). climatePlanet rozwiązany wyżej
    // (planeta TEJ kolonii, nie homePlanet). Fail-open: brak planety → envUpkeep=1.
    const envUpkeep = envMultiplier(building.category, climatePlanet, { half: true, building });

    // Master-switch: gdy fabryki tej kolonii są OFFLINE, budynek 'factory'
    // przechodzi w pełny idle — zero poboru energii I zero utrzymania (surowce).
    // Spójne z gate produkcji w FactorySystem (zero składników receptur).
    const factoryOffline = building.id === 'factory'
      && this._factorySystem && !this._factorySystem.isProductionEnabled();

    // Dodatkowa konsumpcja energii (energyCost z definicji budynku)
    if (hasEnergyCost && !factoryOffline) {
      base.energy = (base.energy ?? 0) - building.energyCost * levelMult * envUpkeep;
    }

    // Maintenance — stały koszt utrzymania per level (ujemne stawki surowców)
    if (hasMaintenance && !factoryOffline) {
      for (const [res, amount] of Object.entries(building.maintenance)) {
        base[res] = (base[res] ?? 0) - amount * levelMult * envUpkeep;
      }
    }

    return base;
  }

  /**
   * Oblicz mnożnik adjacency bonus dla budynku na danym hexie.
   * Warunek: zbadane urban_planning.
   * Bonus: 1.0 + (count sąsiadów tej samej kategorii × adjMultiplier)
   */
  _calcAdjacencyBonus(tileKey, building) {
    const adjMult = this.techSystem?.getAdjacencyMultiplier() ?? 0;
    if (adjMult === 0 || !this._grid) return 1.0;

    const parts = tileKey.split(',');
    const q = parseInt(parts[0], 10);
    const r = parseInt(parts[1], 10);
    if (isNaN(q) || isNaN(r)) return 1.0;

    const neighbors = this._grid.getNeighbors(q, r);
    let count = 0;
    for (const nb of neighbors) {
      const nbKey = `${nb.q},${nb.r}`;
      const nbEntry = this._active.get(nbKey);
      if (nbEntry && nbEntry.building.category === building.category) {
        count++;
      }
    }
    return 1.0 + count * adjMult;
  }

  /**
   * Przelicz stawki sąsiadów danego hexa (po budowie/rozbiórce).
   */
  _reapplyNeighborRates(tileKey) {
    if (!this._grid) return;
    const parts = tileKey.split(',');
    const q = parseInt(parts[0], 10);
    const r = parseInt(parts[1], 10);
    if (isNaN(q) || isNaN(r)) return;

    const neighbors = this._grid.getNeighbors(q, r);
    for (const nb of neighbors) {
      const nbKey = `${nb.q},${nb.r}`;
      const entry = this._active.get(nbKey);
      if (!entry) continue;
      const newEffective = this._applyTechMultipliers(entry.baseRates, entry.building, nbKey);
      entry.effectiveRates = newEffective;
      if (hasKeys(newEffective) && this.resourceSystem) {
        const pid = entry.producerId ?? `building_${nbKey}`;
        this.resourceSystem.registerProducer(pid, newEffective);
      }
    }
  }

  // ── Slice 5C.2: within-stratum greedy staffing (priorytet + stabilny porządek) ──────────────
  /** Rozwiąż przekazany tileKey na klucz w _active (obsługuje prefiks capital_). null gdy brak budynku. */
  _resolveActiveKey(tileKey) {
    if (this._active.has(tileKey)) return tileKey;
    const cap = `capital_${tileKey}`;
    if (this._active.has(cap)) return cap;
    return null;
  }
  /** Frakcja ludzkiej obsady budynku wg GREEDY (memo per _reapplyAllRates). 1.0 gdy nie znaleziony. */
  _greedyStaffFor(activeKey) {
    if (!this._greedyStaffCache) this._greedyStaffCache = this._buildGreedyStaffCache();
    return this._greedyStaffCache.get(activeKey) ?? 1.0;
  }
  /** Zbuduj mapę activeKey → frakcja obsady: per strata, priorytet najpierw, potem stabilny porządek;
   *  ludzie (strataCount, wraz z zablokowanymi — spójnie z uniform) napełniają budynki po kolei do
   *  pojemności ludzkiej (J − droidy). Suma obsadzonych = min(strataCount, humanDemand) jak w uniform. */
  _buildGreedyStaffCache() {
    const cache = new Map();
    const byStrata = {};
    for (const [activeKey, entry] of this._active) {
      const b = entry.building;
      if (!b || b.isAutonomous || (entry.jobs ?? 0) === 0 || this._isEntryPaused(entry)) continue;   // Slice 5C.2: paused nie konkuruje o pracowników
      (byStrata[b.popType ?? 'laborer'] ??= []).push(activeKey);
    }
    for (const st of Object.keys(byStrata)) {
      const keys = byStrata[st].sort((a, b) => {
        const pa = this._active.get(a).designation === 'priority' ? 1 : 0;
        const pb = this._active.get(b).designation === 'priority' ? 1 : 0;
        if (pa !== pb) return pb - pa;                 // priorytet najpierw
        return a < b ? -1 : a > b ? 1 : 0;             // stabilny porządek (activeKey)
      });
      let remaining = this.civSystem?.strata?.[st]?.count ?? 0;
      for (const activeKey of keys) {
        const entry = this._active.get(activeKey);
        const J = (entry.jobs ?? 0) * (entry.level ?? 1);
        const plain = activeKey.startsWith('capital_') ? activeKey.slice(8) : activeKey;
        const D = this._tileDroidCount(entry, plain);
        const humanCap = Math.max(0, J - D);
        const assigned = Math.min(humanCap, remaining);
        remaining -= assigned;
        cache.set(activeKey, humanCap > 0 ? assigned / humanCap : 1.0);
      }
    }
    return cache;
  }

  // ── Slice 5C.2: tri-state designation (active/paused/priority) + factory-pause ──────────────
  /** Σ ludzkich etatów budynków PRIORITY danej straty (netto droidów) — pull dla transient bumpu alokacji. */
  getPriorityHumanJobs(strataType) {
    if (GAME_CONFIG.FEATURES?.popAllocation2Priority !== true) return 0;
    let sum = 0;
    for (const [activeKey, entry] of this._active) {
      if (entry.designation !== 'priority') continue;
      const b = entry.building;
      if (!b || (b.popType ?? 'laborer') !== strataType || b.isAutonomous || (entry.jobs ?? 0) === 0) continue;
      const J = (entry.jobs ?? 0) * (entry.level ?? 1);
      const plain = activeKey.startsWith('capital_') ? activeKey.slice(8) : activeKey;
      sum += Math.max(0, J - this._tileDroidCount(entry, plain));
    }
    return sum;
  }

  /** Odczyt desygnacji budynku (UI). */
  getBuildingDesignation(tileKey) {
    return this._active.get(this._resolveActiveKey(tileKey) ?? tileKey)?.designation ?? 'active';
  }

  /** Ustaw desygnację budynku {active/paused/priority}. paused → produkcja idle; priority → transient
   *  bump straty (pull) + pauza fabryk podczas budowy. Realokacja + przelicz stawki + factory-pause. */
  setBuildingDesignation(tileKey, designation) {
    if (!['active', 'paused', 'priority'].includes(designation)) return { success: false, reason: 'bad_designation' };
    const activeKey = this._resolveActiveKey(tileKey);
    if (!activeKey) return { success: false, reason: 'no_building' };
    const entry = this._active.get(activeKey);
    if (entry.designation === designation) return { success: true, designation, unchanged: true };
    const oldDes = entry.designation;
    entry.designation = designation;
    // Slice 5C.2 (gate fix): paused ZWALNIA etaty (jak rozbiórka pracy) → _employedPops spójne z getSlotDemand
    // (freePops ≈ unemployed). changeEmployment przy przejściu do/z paused; potem rekoncyliacja alokacji ewakuuje
    // pracowników do bezrobocia (same-tick), a przy wznowieniu re-absorbuje. Gated flagą.
    if (GAME_CONFIG.FEATURES?.popAllocation2Priority === true && this.civSystem && (entry.jobs ?? 0) > 0) {
      const jobs = (entry.jobs ?? 0) * (entry.level ?? 1);
      if (oldDes === 'paused' && designation !== 'paused') this.civSystem.changeEmployment(jobs);
      else if (oldDes !== 'paused' && designation === 'paused') this.civSystem.changeEmployment(-jobs);
    }
    // Priorytet/pauza zmieniają efektywny target/demand → realokuj (mid-year, bez churnu migracji) + przelicz
    // stawki (greedy invalid + paused rates); _reallocateAndRefresh emituje też civ:populationChanged (UI).
    this._reallocateAndRefresh();
    this._updateFactoryPause();
    EventBus.emit('building:designationChanged', { tileKey: activeKey, designation });
    return { success: true, designation };
  }

  /** Pauza fabryk komodytowych gdy istnieje budynek PRIORITY I trwa budowa (uwalnia surowce — early-Fe).
   *  Model epizodu (review): pauzujemy TYLKO gdy fabryki ON; jeśli gracz przejmie przełącznik (zewn. toggle
   *  → subskrypcja czyści `_factoryPausedByPriority` i ustawia `_factoryPauseSuppressed`) — nie ruszamy fabryk
   *  do KOŃCA epizodu (shouldPause→false), wtedy re-arm. Wznawiamy tylko NASZĄ pauzę. `_pausingSelf` odróżnia
   *  własne setProductionEnabled od gracza. Wołane per-tick (_update) + na zmianę desygnacji. */
  _updateFactoryPause() {
    const fs = this._factorySystem;
    if (!fs?.setProductionEnabled) return;
    const resumeSelf = () => { this._pausingSelf = true; fs.setProductionEnabled(true); this._pausingSelf = false; this._factoryPausedByPriority = false; };
    if (GAME_CONFIG.FEATURES?.popAllocation2Priority !== true) {
      if (this._factoryPausedByPriority) resumeSelf();
      this._factoryPauseSuppressed = false;
      return;
    }
    let hasPriority = false;
    for (const e of this._active.values()) if (e.designation === 'priority') { hasPriority = true; break; }
    const shouldPause = hasPriority && this._constructionQueue.size > 0;
    if (!shouldPause) {                                  // koniec epizodu → wznów naszą pauzę + re-arm
      if (this._factoryPausedByPriority) resumeSelf();
      this._factoryPauseSuppressed = false;
      return;
    }
    if (this._factoryPauseSuppressed) return;            // gracz przejął przełącznik w tym epizodzie — nie ruszamy
    if (!this._factoryPausedByPriority && fs.isProductionEnabled()) {
      this._pausingSelf = true; fs.setProductionEnabled(false); this._pausingSelf = false;
      this._factoryPausedByPriority = true;
    }
  }

  /** Per-budynkowe labor efficiency oparte o matching strata type lub syntheticSlot */
  _getBuildingLaborEfficiency(building, tileKey = null) {
    if (!building || !this.civSystem?.strata) return 1.0;
    // Autonomiczne / jobs=0 → pełna wydajność
    if (building.isAutonomous || (building.jobs ?? 0) === 0) return 1.0;
    // Singularność: tech allBuildingsAutonomous
    if (this.techSystem?.isAllAutonomous?.()) return 1.0;

    // Ludzki popyt straty NETTO (− droidy): budynki obsadzone droidem NIE konkurują o ludzką pulę
    // pracy, więc ludzkie budynki tej samej straty nie są rozcieńczane. strata-wide human staffing.
    const strataType  = building.popType ?? 'laborer';
    const strataCount = this.civSystem.strata[strataType]?.count ?? 0;
    const humanDemand = this.getSlotDemand(strataType) - this.getSyntheticJobs(strataType);
    // Slice 5C.2: within-stratum GREEDY fill (flag) — budynki tej straty napełniane po kolei do 100%
    // (priorytet najpierw, potem stabilny porządek) zamiast UNIFORM (każdy ×strataCount/humanDemand).
    // Suma obsadzonych etatów zachowana (tylko dystrybucja się zmienia). Flag OFF / brak tileKey = uniform (5C.1).
    const gk = (GAME_CONFIG.FEATURES?.popAllocation2Priority === true && tileKey) ? this._resolveActiveKey(tileKey) : null;
    const humanStaff = gk ? this._greedyStaffFor(gk)
                          : (humanDemand > 0 ? Math.min(1.0, strataCount / humanDemand) : 1.0);

    // Droid-per-job (D2): efficiency = (D×SYNTH_EFF[tier] + (J−D)×humanStaff) / J. Pełny-droid budynek
    // = ×tier, pół-droid = pół bonusu (zgodne z 1+(eff−1)×D/J przy pełnej obsadzie ludzi), a
    // niedobsadzona ludzka reszta poprawnie ciągnie wynik w dół (D2 „understaffed-safe").
    if (tileKey && this._grid) {
      const [q, r] = tileKey.split(',').map(Number);
      const slot  = this._grid.get(q, r)?.syntheticSlot;
      const entry = this._active.get(tileKey);
      const J = (building.jobs ?? 0) * (entry?.level ?? 1);
      const D = Math.min(slot?.count ?? 0, J);
      if (slot && D > 0 && J > 0) {
        const eff = BuildingSystem.SYNTH_EFFICIENCY[slot.tier] ?? 1.4;
        return (D * eff + (J - D) * humanStaff) / J;
      }
    }

    // Budynek czysto ludzki: strata-wide staffing.
    return humanStaff;
  }

  _applyTechMultipliers(baseRates, building, tileKey = null) {
    // Slice 5C.2: budynek PAUSED (flag) → produkcja I konsumpcja idle (puste stawki → _reapplyAllRates
    // wyrejestruje producenta; droidy też idle → brak upkeepu). Sprawdzane po activeKey w _active.
    if (tileKey && GAME_CONFIG.FEATURES?.popAllocation2Priority === true
        && this._active.get(tileKey)?.designation === 'paused') return {};
    // Droid-per-job (D3): upkeep energii PER DROID (2/6 × liczba droidów) — liczony NIEZALEŻNIE od
    // baseRates (budynek bez własnych stawek też obciąża energię przez droidy). Doliczany niżej.
    let synthUpkeep = 0;
    if (tileKey && this._grid) {
      const [sq, sr] = tileKey.split(',').map(Number);
      const slot = this._grid.get(sq, sr)?.syntheticSlot;
      if (slot) {
        const entry = this._active.get(tileKey);
        const J = (building?.jobs ?? 0) * (entry?.level ?? 1);
        const D = Math.min(slot.count ?? 0, J);
        const perUnit = BuildingSystem.SYNTH_ENERGY_UPKEEP[slot.tier] ?? BuildingSystem.SYNTH_ENERGY_UPKEEP[1];
        synthUpkeep = perUnit * D;
      }
    }
    if (!hasKeys(baseRates)) return synthUpkeep > 0 ? { energy: -synthUpkeep } : {};

    // Per-budynkowe labor efficiency (zamiast globalnego employmentPenalty)
    const empPenalty = this._getBuildingLaborEfficiency(building, tileKey);

    const isAutonomous = building.isAutonomous || (building.jobs ?? 0) === 0;
    const isSingularity = this.techSystem?.isAllAutonomous?.() ?? false;

    // Adjacency bonus (Etap 38) — mnożnik produkcji z sąsiadów tej samej kategorii
    const adjBonus = tileKey ? this._calcAdjacencyBonus(tileKey, building) : 1.0;

    // Autonomiczna wydajność bonus (AI tech)
    const autoEfficiency = (isAutonomous && !isSingularity)
      ? (this.techSystem?.getAutonomousEfficiency() ?? 1.0)
      : 1.0;

    // Outpost: kara wydajności ×0.6 — brak ludzi do nadzoru/konserwacji
    const outpostPenalty = this._isOutpost ? OUTPOST_EFFICIENCY : 1.0;

    // Mnożnik lojalności (0.6 do 1.05) i kara z negocjacji ruchów społecznych
    const loyaltyMult = this.civSystem?.getLoyaltyProductionMultiplier?.() ?? 1.0;
    const penaltyMult = this.civSystem?.getProductionPenaltyMultiplier?.() ?? 1.0;

    // Faza C5: faction zone modifier — pobierany raz, używany per-key niżej
    // (getModifier zwraca 1.0 gdy locked lub w strefie balanced)
    const facSys = window.KOSMOS?.factionSystem;
    const facResearchMult  = facSys?.getModifier?.('research')           ?? 1.0;
    const facIndustryMult  = facSys?.getModifier?.('industryProduction') ?? 1.0;
    // industryProduction stosujemy do "ciężkiego przemysłu": autonomous mining + factory category
    const isHeavyIndustry  = isAutonomous && (building.category === 'mining' || building.category === 'synthetic' || building.id === 'factory');

    const effective = {};
    for (const key in baseRates) {
      const val = baseRates[key];
      if (val > 0) {
        const techMult = this.techSystem?.getProductionMultiplier(key) ?? 1.0;
        // Mnożnik z aktywnych zdarzeń losowych (per-kolonia)
        const eventMult = this._planetId
          ? (window.KOSMOS?.randomEventSystem?.getProductionMultiplierForColony(this._planetId, key) ?? 1.0)
          : 1.0;
        // Faza C5: faction modifier per-key
        let factionMult = 1.0;
        if (key === 'research')  factionMult = facResearchMult;
        else if (isHeavyIndustry) factionMult = facIndustryMult;
        const result = val * techMult * eventMult * this._civPenalty * empPenalty * adjBonus * autoEfficiency * outpostPenalty * loyaltyMult * penaltyMult * factionMult;
        effective[key] = Number.isFinite(result) ? result : 0;
      } else if (val < 0) {
        const techMult = this.techSystem?.getConsumptionMultiplier(key) ?? 1.0;
        // Population 2.0 Faza 3: zużycie ENERGII skaluje się obsadą — 20% standby dla wybudowanego-
        // nieobsadzonego, pełny pobór przy pełnej obsadzie. TYLKO strona konsumpcji (produkcja plantów
        // skaluje się przez empPenalty w gałęzi val>0). Autonomiczne: empPenalty=1 → max(0.2,1)=1 (bez zmian).
        const energyStaffMult = (key === 'energy') ? Math.max(0.2, empPenalty) : 1.0;
        effective[key] = val * techMult * energyStaffMult;
      } else {
        effective[key] = val;
      }
    }

    // Faza 4: dolicz upkeep slotu syntetycznego (flat, NIE skalowany obsadą; magazyn=0). Recompute
    // na install/remove przez _reapplyAllRates → widoczne w energyChain (effectiveRates.energy).
    if (synthUpkeep > 0) effective.energy = (effective.energy ?? 0) - synthUpkeep;
    return effective;
  }

  _reapplyAllRates() {
    this._greedyStaffCache = null;   // Slice 5C.2: unieważnij memo greedy-fill (obsada mogła się zmienić)
    for (const [activeKey, entry] of this._active) {
      // Przelicz baseRates z tile (uwzględnia anomalyEffect)
      const tileKey = activeKey.startsWith('capital_') ? activeKey.replace('capital_', '') : activeKey;
      const parts = tileKey.split(',');
      const tile = this._grid?.get(parseInt(parts[0], 10), parseInt(parts[1], 10));
      if (tile && entry.building) {
        const level = entry.level ?? 1;
        entry.baseRates = this._calcBaseRates(entry.building, tile, level);
      }

      const newEffective = this._applyTechMultipliers(entry.baseRates, entry.building, activeKey);
      entry.effectiveRates = newEffective;

      if (this.resourceSystem) {
        const pid = entry.producerId ?? (activeKey.startsWith('capital_') ? activeKey : `building_${activeKey}`);
        // Puste stawki (np. fabryka OFFLINE = zero energii/utrzymania) → wyrejestruj,
        // inaczej zostałby STARY producent z poprzednimi (pobierającymi) stawkami.
        if (hasKeys(newEffective)) this.resourceSystem.registerProducer(pid, newEffective);
        else this.resourceSystem.removeProducer(pid);
      }
    }
    // Population 2.0 (Report 2): obsada mogła się zmienić (roczna realokacja siły roboczej,
    // instalacja/usunięcie droida, tech, faction) → unieważnij cache poziomów kopalń, by
    // wydobycie przeliczyło się z nową frakcją obsady w następnym _tickMineExtraction.
    this._mineLevelDirty = true;
  }

  // Przelicz sumaryczne punkty fabryczne ze wszystkich fabryk
  _recalcFactoryPoints() {
    if (!this._factorySystem) return;
    let total = 0;
    for (const entry of this._active.values()) {
      if (entry.building.id === 'factory') {
        total += entry.level ?? 1;
      }
    }
    this._factorySystem.setTotalPoints(total);
  }

  // Tick: wydobycie surowców z deposits przez kopalnie (wszystkie kolonie)
  _tickMineExtraction(deltaYears) {
    if (!this._deposits || this._deposits.length === 0) return;
    if (!this.resourceSystem) return;

    // Cache: generyczne kopalnie (wydobywają WSZYSTKIE złoża) vs restricted (mineResource → 1 surowiec).
    // S3.0a c-fix: rafineria atmosferyczna (mineResource:'H') wydobywa wyłącznie wodór.
    // S3.0a c-r2 (Opcja A): refineTo konwertuje zmineowany surowiec OD RAZU w produkt (H→fuel,
    // H NIE trafia do inventory). Invalidowany przy budowie/rozbiórce kopalni.
    // ZAŁOŻENIE: energyCost jest polem statycznym danych budynku — żaden tech/moduł w
    // kodzie go nie mutuje na zbudowanej kopalni. Jeśli to się zmieni, split grid/ungated
    // (oraz klucz grup restricted) muszą to uwzględnić. Zweryfikowano: 2026-07-16.
    if (this._mineLevelDirty !== false) {
      let genericGrid = 0;     // kopalnie generyczne z sieci (energyCost>0) — bramkowane brownoutem
      let genericUngated = 0;  // generyczne z własnym reaktorem (energyCost==0) — poza bramką
      let rawLevel = 0;        // suma SUROWYCH poziomów (nameplate) — do licznika kopalń w breakdown UI
      // restricted: key `${mineResource}>${refineTo||''}>${grid}` → {mineResource, refineTo, ratio, level, grid}.
      // grid W KLUCZU: grid i ungated kopalnie tego samego surowca NIGDY nie łączą się w jedną
      // grupę (inaczej own-reactor byłaby błędnie duszona przez OR). grid stały per-grupa.
      // Population 2.0 (Report 2): poziom WAŻONY OBSADĄ górników — pełna obsada ×1, niedobsadzona
      // <1 (podłoga MINE_STAFF_FLOOR), autonomiczna/outpost/droid ×1. Cache invalidowany też przez
      // _reapplyAllRates (obsada dynamiczna) — nie tylko build/demolish jak dawniej.
      const restricted = new Map();
      for (const [tileKey, entry] of this._active.entries()) {
        const b = entry.building;
        if (!(b.isMine || b.id === 'mine')) continue;
        const rawLvl = entry.level ?? 1;
        rawLevel += rawLvl;
        const staff = Math.max(GAME_CONFIG.MINE_STAFF_FLOOR, this._mineStaffFraction(b, tileKey));
        const lvl = rawLvl * staff;   // poziom efektywny (ważony obsadą)
        const grid = (b.energyCost ?? 0) > 0;   // >0 = pobiera z sieci; 0 = własny reaktor
        if (b.mineResource) {
          const refineTo = b.refineTo ?? null;
          const ratio = b.refineRatio ?? 1.0;
          const key = `${b.mineResource}>${refineTo ?? ''}>${grid}`;
          const grp = restricted.get(key) ?? { mineResource: b.mineResource, refineTo, ratio, level: 0, grid };
          grp.level += lvl;
          restricted.set(key, grp);
        } else if (grid) {
          genericGrid += lvl;
        } else {
          genericUngated += lvl;
        }
      }
      this._cachedMineLevelGrid = genericGrid;
      this._cachedMineLevelUngated = genericUngated;
      // Suma EFEKTYWNA (ważona obsadą) — czytniki breakdownu UI (ResourceSystem/EconomyOverlay)
      // pokazują dochód mineralny spójny z realnym gate'em obsady (nadal bez throttlingu brownout).
      this._cachedMineLevel = genericGrid + genericUngated;
      this._cachedMineLevelRaw = rawLevel;   // nameplate — licznik kopalń w breakdown (integer)
      this._cachedRestrictedMines = restricted;
      this._mineLevelDirty = false;
    }
    if (this._cachedMineLevelGrid === 0 && this._cachedMineLevelUngated === 0 &&
        (this._cachedRestrictedMines?.size ?? 0) === 0) return;

    // Bramka brownout: dostępność energii skaluje POZIOM WEJŚCIOWY kopalń z sieci
    // (NIE zwrócony wynik). outputPerYear jest liniowy w mineLevel → skaluje i wydobycie,
    // i depletion złoża. avail=0 → złoże NIETKNIĘTE (mnożenie wyniku niszczyłoby rezerwy).
    const avail = this.resourceSystem.getEnergyAvailability();

    // Zbierz wydobycie: generyczne (wszystkie złoża) + restricted (1 surowiec, opcjonalnie konwertowany).
    let gains = null;
    const merge = (g) => {
      if (!g) return;
      if (!gains) gains = {};
      for (const k in g) gains[k] = (gains[k] ?? 0) + g[k];
    };
    if (this._cachedMineLevelGrid > 0) {
      merge(DepositSystem.extractFromDeposits(this._deposits, this._cachedMineLevelGrid * avail, deltaYears));
    }
    if (this._cachedMineLevelUngated > 0) {
      merge(DepositSystem.extractFromDeposits(this._deposits, this._cachedMineLevelUngated, deltaYears));
    }
    if (this._cachedRestrictedMines) {
      for (const grp of this._cachedRestrictedMines.values()) {
        const filtered = this._deposits.filter(d => d.resourceId === grp.mineResource);
        if (!filtered.length) continue;
        const g = DepositSystem.extractFromDeposits(filtered, grp.level * (grp.grid ? avail : 1), deltaYears);
        if (!g) continue;
        if (grp.refineTo) {
          // Opcja A: zmineowany surowiec konwertowany OD RAZU w produkt (medium, nie towar).
          // H ze złoża → fuel; H NIE trafia do inventory. Złoże depletuje → produkcja maleje (gate naturalny).
          const minedAmt = g[grp.mineResource] ?? 0;
          if (minedAmt > 0) merge({ [grp.refineTo]: minedAmt * grp.ratio });
        } else {
          merge(g);   // restricted bez refineTo: surowiec do inventory (jak zwykła kopalnia 1-surowcowa)
        }
      }
    }

    // Faza D2a hook: asteroid_mining ×2 dla planetoid/asteroid
    if (gains && hasKeys(gains)) {
      const colMgr = window.KOSMOS?.colonyManager;
      const colony = this._planetId ? colMgr?.getColony(this._planetId) : null;
      const bodyType = colony?.planet?.type;
      const isAsteroidBody = bodyType === 'planetoid' || bodyType === 'asteroid';
      const hasAsteroidMining = this.techSystem?.isResearched?.('asteroid_mining') ?? false;
      if (isAsteroidBody && hasAsteroidMining) {
        for (const k in gains) gains[k] *= 2.0;
      }
    }

    // Dodaj wydobyte surowce do inventory
    if (gains && hasKeys(gains)) {
      this.resourceSystem.receive(gains);
    }
  }

  // Tick: rafinerie naziemne — konwersja surowca z INVENTORY na produkt (input-gated).
  // Odróżnienie od _tickMineExtraction (Opcja A): tamta rafinuje H prosto ze złoża,
  // ta pobiera zmagazynowany surowiec (np. fuel_refinery: H → fuel). Bramkowane
  // dostępnością wejścia (clamp do stanu magazynu) — NIE tworzy produktu z niczego,
  // dlatego nie używa producer rates ResourceSystem (te nie input-gatują ujemnych wejść).
  _tickConverters(deltaYears) {
    if (!this.resourceSystem || this._active.size === 0) return;

    // Agreguj zdolność przerobową per para `from>to` (jednostek wejścia / rok).
    let pairs = null;
    for (const entry of this._active.values()) {
      const b = entry.building;
      if (!b.convertFrom || !b.convertTo) continue;
      const cap = (b.convertRate ?? 0) * (entry.level ?? 1);
      if (cap <= 0) continue;
      const key = `${b.convertFrom}>${b.convertTo}`;
      if (!pairs) pairs = new Map();
      const p = pairs.get(key) ?? { from: b.convertFrom, to: b.convertTo, ratio: b.convertRatio ?? 1.0, cap: 0 };
      p.cap += cap;
      pairs.set(key, p);
    }
    if (!pairs) return;

    // Per para: zużyj min(zdolność, dostępne) wejścia → wyprodukuj wyjście wg ratio.
    // Orbital Logistics Hub — wejście ciągnie z puli (matka+księżyce); wyjście deponuje LOKALNIE.
    const convStore = window.KOSMOS?.systemPoolService?.getStore(this.resourceSystem) ?? this.resourceSystem;
    for (const p of pairs.values()) {
      const want = p.cap * deltaYears;                      // jednostek wejścia
      const used = Math.min(want, convStore.getAmount(p.from));
      if (used <= 0) continue;
      convStore.spend({ [p.from]: used });
      this.resourceSystem.receive({ [p.to]: used * p.ratio });   // deposit LOKALNY (reguła)
    }
  }
}
