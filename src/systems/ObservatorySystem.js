// ObservatorySystem — "Oczy cywilizacji"
//
// Etap A: Pasywne skanowanie ciał niebieskich przez obserwatoria.
// Obserwatorium co pewien czas automatycznie odkrywa (explored=true)
// jedno niezbadane ciało w zasięgu. Tempo i zasięg zależą od poziomu.
//
// Etap B: Bonus do misji (redukcja katastrofy + yield bonus).
// Etap C: Wczesne ostrzeżenie przed zdarzeniami losowymi (TODO).
// Etap D: Prognoza kolizji (TODO).
// Etap E: Zakładka Observatory UI (TODO).
//
// Komunikacja:
//   Nasłuchuje: 'time:tick' { civDeltaYears }
//   Emituje:    'observatory:discovered' { body, discovered, colonyName }
//               'expedition:reconProgress' { body, discovered } (spójne z recon)

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { t }         from '../i18n/i18n.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { SystemGenerator } from '../generators/SystemGenerator.js';

// Zasięg detekcji wrogich statków per poziom obserwatorium (AU).
// Index 0 = brak obserwatorium — każda kolonia dostaje 1 AU pasywnego wzroku
// (planeta widzi własną orbitę). Lv4+ = ∞ (cały układ); Lv5/Lv6 dokładają radar LY
// galaktyczny (Stratcom, patrz STRATCOM_LY_BY_LEVEL w FleetManagerOverlay).
const VESSEL_DETECTION_RANGE = [1, 3, 6, 15, Infinity, Infinity, Infinity];

// Co ile civYears odświeżać pozycję ghost-sightingu już-wykrytych statków (throttle — ogranicza
// churn gameState/DebugLog przy ciągłej detekcji). Nowo wykryte ('added') zapisują się natychmiast.
const SIGHTING_REFRESH_YEARS = 1.0;

// Reforma detekcji — aktywny skan wrogiego statku (zadanie obserwatorium). Bazowy czas
// skanu w civYears; dzielony przez najwyższy poziom obserwatorium (lepszy radar = szybciej).
// Po ukończeniu rumor→contact (pełna tożsamość: nazwa/imperium/kadłub) zdalnie, bez statku.
const SCAN_DURATION_YEARS = 3.0;

// Ręczny skan ciała niebieskiego (reforma obserwatorium). Bazowy czas w civYears
// (~3 miesiące gry); dzielony przez najwyższy poziom obserwatorium (lepszy sprzęt = szybciej).
// Po ukończeniu ciało → explored (zgrubny poziom: kolonizacja + obecność surowców, bez ilości).
const BODY_SCAN_DURATION_YEARS = 0.25;

// Czasowy skan obcego układu z STRATCOM. Czas liczony w latach GRY (deltaYears z time:tick,
// NIE civYears) — stały 1 rok gry, niezależnie od poziomu obserwatorium (decyzja gracza).
const SYSTEM_SCAN_DURATION_YEARS = 1.0;

export class ObservatorySystem {
  constructor() {
    // Akumulator czasu skanowania per kolonia: Map<planetId, number>
    this._scanAccum = new Map();

    // Historia odkryć obserwatorium: [{ bodyId, bodyName, year, colonyName }]
    this._discoveries = [];

    // Detekcja wrogich statków — Set<vesselId> aktualnie widocznych przez jakąkolwiek
    // kolonię gracza. Rebuilt co tick, NIE persystuje w save (self-healing po load).
    this._detectedVesselIds = new Set();

    // Set ID statków dla których wyemitowano już komunikat "Wykryto wrogą jednostkę"
    // — unika spamu EventLoga gdy statek wchodzi/wychodzi z zasięgu kilka razy.
    this._reportedVesselSightings = new Set();

    // Reforma detekcji — aktywne skany wrogich statków: Map<vesselId, {progress, startedYear}>.
    // Progres akumuluje civDeltaYears (tylko gdy cel dalej wykryty); po SCAN_DURATION/level
    // → rumor→contact. Persystuje w save (serialize/restore).
    this._vesselScans = new Map();

    // Reforma obserwatorium — aktywne ręczne skany ciał niebieskich:
    // Map<bodyId, {progress, startedYear}>. Progres akumuluje civDeltaYears; po
    // BODY_SCAN_DURATION/level → body.explored=true (zgrubny). Persystuje w save.
    this._bodyScans = new Map();

    // Skan STRATCOM — aktywne czasowe skany obcych układów:
    // Map<systemId, {progress, startedYear, targetTier}>. Persystuje w save.
    this._systemScans = new Map();

    // Skan STRATCOM — ukończone wyniki: Map<systemId, {tier, counts}>.
    // tier: 1=liczba planet, 2=+księżyce, 3=wszystkie ciała (rozbicie). Persystuje w save.
    this._systemScanResults = new Map();

    // Rok gry
    this._gameYear = 0;

    // Nasłuch czasu — civDeltaYears (mechaniki 4X biegną szybciej) + deltaYears (lata gry:
    // skan STRATCOM liczy się w czasie GRY, nie civ, by trwał dokładnie 1 rok gry).
    EventBus.on('time:tick', ({ civDeltaYears, deltaYears }) => {
      if (!window.KOSMOS?.civMode) return;
      this._tickScan(civDeltaYears, deltaYears);
    });

    EventBus.on('time:display', ({ gameTime }) => {
      this._gameYear = gameTime;
    });
  }

  // ── API publiczne ─────────────────────────────────────────────────────

  // Najwyższy poziom obserwatorium w danej kolonii
  getObservatoryLevel(colonyId) {
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(colonyId);
    if (!colony?.buildingSystem) return 0;

    let maxLevel = 0;
    colony.buildingSystem._active.forEach(entry => {
      if (entry.building.id === 'observatory') {
        maxLevel = Math.max(maxLevel, entry.level);
      }
    });
    return maxLevel;
  }

  // Najwyższy poziom obserwatorium w CAŁYM imperium
  getMaxObservatoryLevel() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return 0;

    let maxLevel = 0;
    for (const col of colMgr.getAllColonies()) {
      if (col.ownerEmpireId) continue;   // tylko kolonie gracza (radar/ostrzeżenia należą do gracza)
      if (!col.buildingSystem) continue;
      col.buildingSystem._active.forEach(entry => {
        if (entry.building.id === 'observatory') {
          maxLevel = Math.max(maxLevel, entry.level);
        }
      });
    }
    return maxLevel;
  }

  // Redukcja ryzyka katastrofy z obserwatorium w danej kolonii (%)
  getDisasterReduction(colonyId) {
    const level = this.getObservatoryLevel(colonyId);
    if (level <= 0) return 0;
    const def = BUILDINGS.observatory;
    // Klamra 0.9 — przy Lv6 surowe 0.3×6=1.8 (180%) dawałoby pełną/ujemną immunizację.
    return Math.min(0.9, (def?.disasterReduction ?? 0.3) * level);
  }

  // Bonus do yield misji z obserwatorium w danej kolonii (mnożnik, np. 0.15)
  getMissionYieldBonus(colonyId) {
    const level = this.getObservatoryLevel(colonyId);
    if (level <= 0) return 0;
    const def = BUILDINGS.observatory;
    return (def?.missionYieldBonus ?? 0.05) * level;
  }

  // Lata wyprzedzenia ostrzeżenia (max w imperium)
  getWarningYears() {
    const level = this.getMaxObservatoryLevel();
    if (level <= 0) return 0;
    const def = BUILDINGS.observatory;
    return (def?.warningYears ?? 0.5) * level;
  }

  // Lista odkryć obserwatorium
  getDiscoveries() {
    return [...this._discoveries];
  }

  // ── Detekcja wrogich statków (fog-of-war) ──────────────────────────────

  // Zasięg detekcji statków dla konkretnej kolonii (AU).
  // Bazowo 1 AU dla dowolnej żywej kolonii; obserwatorium rozszerza wg VESSEL_DETECTION_RANGE.
  getVesselDetectionRangeAU(colony) {
    if (!colony?.buildingSystem) return 0;
    let lvl = 0;
    colony.buildingSystem._active.forEach(entry => {
      if (entry.building.id === 'observatory') {
        lvl = Math.max(lvl, entry.level);
      }
    });
    const idx = Math.min(lvl, VESSEL_DETECTION_RANGE.length - 1);
    return VESSEL_DETECTION_RANGE[idx];
  }

  // Czy konkretny statek jest aktualnie wykryty?
  isVesselDetected(vesselId) {
    return this._detectedVesselIds.has(vesselId);
  }

  // Snapshot wszystkich wykrytych statków (defensywna kopia).
  getDetectedVesselIds() {
    return new Set(this._detectedVesselIds);
  }

  // ── Aktywny skan wrogiego statku (reforma detekcji) ────────────────────

  // Czas skanu w civYears = baza / max poziom obserwatorium (lepszy radar = szybciej).
  _getScanDurationYears() {
    return SCAN_DURATION_YEARS / Math.max(1, this.getMaxObservatoryLevel());
  }

  // Rozpocznij skan wrogiego statku → po czasie rumor→contact (zdalna identyfikacja).
  // Walidacja: feature ON, cel wykryty, intel < contact, nie skanowany już.
  startVesselScan(vesselId) {
    if (!GAME_CONFIG.FEATURES?.observatoryVesselScan) return false;
    if (!vesselId || this._vesselScans.has(vesselId)) return false;
    if (!this._detectedVesselIds.has(vesselId)) return false;   // tylko wykryte (rumor)
    const intelSys = window.KOSMOS?.intelSystem;
    const q = intelSys?.getVesselContact?.(vesselId)?.quality;
    if (q === 'contact' || q === 'detailed') return false;       // już zidentyfikowany
    this._vesselScans.set(vesselId, { progress: 0, startedYear: this._gameYear });
    EventBus.emit('observatory:vesselScanStarted', { vesselId, durationYears: this._getScanDurationYears() });
    return true;
  }

  // Anuluj trwający skan.
  cancelVesselScan(vesselId, reason = 'manual') {
    if (!this._vesselScans.has(vesselId)) return false;
    this._vesselScans.delete(vesselId);
    EventBus.emit('observatory:vesselScanCancelled', { vesselId, reason });
    return true;
  }

  // Postęp skanu dla statku: { progress, durationYears, pct } | null.
  getVesselScanProgress(vesselId) {
    const scan = this._vesselScans.get(vesselId);
    if (!scan) return null;
    const durationYears = this._getScanDurationYears();
    return {
      progress: scan.progress,
      durationYears,
      pct: durationYears > 0 ? Math.min(1, scan.progress / durationYears) : 0,
    };
  }

  // Wszystkie aktywne skany (do UI).
  getActiveVesselScans() {
    const out = [];
    const durationYears = this._getScanDurationYears();
    for (const [vesselId, scan] of this._vesselScans) {
      out.push({
        vesselId,
        progress: scan.progress,
        durationYears,
        pct: durationYears > 0 ? Math.min(1, scan.progress / durationYears) : 0,
      });
    }
    return out;
  }

  // Tick aktywnych skanów. Progres tylko gdy cel dalej wykryty; cel zniknął (wrak/
  // brak encji) → anuluj; cel zidentyfikowany inną drogą (proximity/walka) → cichy drop.
  _tickVesselScans(civDeltaYears = 0) {
    if (this._vesselScans.size === 0) return;
    const vMgr     = window.KOSMOS?.vesselManager;
    const intelSys = window.KOSMOS?.intelSystem;
    for (const [vesselId, scan] of [...this._vesselScans]) {
      const vessel = vMgr?.getVessel?.(vesselId);
      if (!vessel || vessel.isWreck) {                 // cel zniknął
        this.cancelVesselScan(vesselId, 'target_lost');
        continue;
      }
      const q = intelSys?.getVesselContact?.(vesselId)?.quality;
      if (q === 'contact' || q === 'detailed') {        // zidentyfikowany inną drogą — drop bez notyfikacji
        this._vesselScans.delete(vesselId);
        continue;
      }
      if (!this._detectedVesselIds.has(vesselId)) continue;  // poza zasięgiem — pauza (bez progresu)
      scan.progress += civDeltaYears;
      if (scan.progress >= this._getScanDurationYears()) {
        this._completeVesselScan(vesselId, vessel);
      }
    }
  }

  _completeVesselScan(vesselId, vessel) {
    this._vesselScans.delete(vesselId);
    const intelSys = window.KOSMOS?.intelSystem;
    intelSys?.advanceVesselContact?.(vesselId, 'contact', 'observatory_scan');
    EventBus.emit('observatory:vesselScanComplete', { vesselId, vessel });
  }

  // ── Ręczny skan ciała niebieskiego (reforma obserwatorium) ─────────────
  // Zgrubny skan (~3 mies. gry) ujawnia obecność + jakość surowców i umożliwia
  // kolonizację (explored=true). Dokładne ilości złóż dopiero po statku naukowym (analyzed).

  // Czas skanu ciała w civYears = baza / max poziom obserwatorium (lepszy sprzęt = szybciej).
  _getBodyScanDurationYears() {
    return BODY_SCAN_DURATION_YEARS / Math.max(1, this.getMaxObservatoryLevel());
  }

  // Ile ciał można skanować RÓWNOCZEŚNIE w układzie (zależne od poziomu obserwatorium):
  // brak obserwatorium → 0; Lv1-2 → 1; Lv3 → 2; Lv4+ → 3.
  getMaxConcurrentBodyScans() {
    const lvl = this.getMaxObservatoryLevel();
    if (lvl <= 0) return 0;
    if (lvl < 3)  return 1;
    if (lvl === 3) return 2;
    return 3;
  }

  // Rozpocznij ręczny skan ciała. Walidacja: feature ON, jest obserwatorium,
  // encja istnieje, jeszcze niezbadana (nie explored), nie skanowana już, w limicie.
  startBodyScan(bodyId) {
    if (!GAME_CONFIG.FEATURES?.observatoryBodyScan) return false;
    if (!bodyId || this._bodyScans.has(bodyId)) return false;
    if (this.getMaxObservatoryLevel() <= 0) return false;   // wymaga obserwatorium
    // Limit równoczesnych skanów wg poziomu obserwatorium (Lv3=2, Lv4+=3).
    const limit = this.getMaxConcurrentBodyScans();
    if (this._bodyScans.size >= limit) {
      EventBus.emit('observatory:bodyScanRejected', { bodyId, reason: 'scan_limit', limit });
      return false;
    }
    const body = EntityManager.get(bodyId);
    if (!body) return false;
    if (body.explored) return false;                        // już zbadane (zgrubnie lub szczegółowo)
    this._bodyScans.set(bodyId, { progress: 0, startedYear: this._gameYear });
    EventBus.emit('observatory:bodyScanStarted', { bodyId, durationYears: this._getBodyScanDurationYears() });
    return true;
  }

  // Anuluj trwający skan ciała.
  cancelBodyScan(bodyId, reason = 'manual') {
    if (!this._bodyScans.has(bodyId)) return false;
    this._bodyScans.delete(bodyId);
    EventBus.emit('observatory:bodyScanCancelled', { bodyId, reason });
    return true;
  }

  // Postęp skanu ciała: { progress, durationYears, pct } | null.
  getBodyScanProgress(bodyId) {
    const scan = this._bodyScans.get(bodyId);
    if (!scan) return null;
    const durationYears = this._getBodyScanDurationYears();
    return {
      progress: scan.progress,
      durationYears,
      pct: durationYears > 0 ? Math.min(1, scan.progress / durationYears) : 0,
    };
  }

  // Wszystkie aktywne skany ciał (do UI + FX 3D).
  getActiveBodyScans() {
    const out = [];
    const durationYears = this._getBodyScanDurationYears();
    for (const [bodyId, scan] of this._bodyScans) {
      out.push({
        bodyId,
        progress: scan.progress,
        durationYears,
        pct: durationYears > 0 ? Math.min(1, scan.progress / durationYears) : 0,
      });
    }
    return out;
  }

  // Tick aktywnych skanów ciał. Brak obserwatorium → anuluj; brak encji (inny
  // układ/warp) → pauza (bez progresu); ciało już explored (statek dotarł wcześniej)
  // → cichy drop; inaczej akumuluj i po czasie ukończ.
  _tickBodyScans(civDeltaYears = 0) {
    if (this._bodyScans.size === 0) return;
    const noObservatory = this.getMaxObservatoryLevel() <= 0;
    for (const [bodyId, scan] of [...this._bodyScans]) {
      if (noObservatory) { this.cancelBodyScan(bodyId, 'no_observatory'); continue; }
      const body = EntityManager.get(bodyId);
      if (!body) continue;                                  // inny układ/warp — pauza
      if (body.explored) { this._bodyScans.delete(bodyId); continue; }  // statek dotarł wcześniej
      scan.progress += civDeltaYears;
      if (scan.progress >= this._getBodyScanDurationYears()) {
        this._completeBodyScan(bodyId, body);
      }
    }
  }

  // Ukończenie skanu ciała → explored (zgrubny). Reużywa 'observatory:discovered'
  // (ping FX w ThreeRenderer + NotificationCenter/EventLog + log odkryć).
  _completeBodyScan(bodyId, body) {
    this._bodyScans.delete(bodyId);
    body.explored = true;   // poziom zgrubny — kolonizacja odblokowana, obecność surowców widoczna
    const colonyName = this._getScanColonyName();
    this._discoveries.push({
      bodyId,
      bodyName:   body.name ?? bodyId,
      year:       this._gameYear,
      colonyName,
    });
    EventBus.emit('observatory:discovered', { body, discovered: [body], colonyName });
  }

  // Nazwa kolonii-obserwatorium dla logu odkryć (best-effort; skan jest imperium-wide).
  _getScanColonyName() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr) {
      for (const col of colMgr.getAllColonies()) {
        if (col.ownerEmpireId || !col.buildingSystem) continue;
        let hasObs = false;
        col.buildingSystem._active.forEach(e => { if (e.building.id === 'observatory') hasObs = true; });
        if (hasObs) return col.name ?? col.planetId;
      }
    }
    return window.KOSMOS?.homePlanet?.name ?? t('observatory.title');
  }

  // ── Czasowy skan obcego układu (STRATCOM) ──────────────────────────────
  // Zdalny skan gwiazdy ujawnia liczbę ciał układu, BEZ jego eksploracji/kolonizacji.
  // Tier wg poziomu obserwatorium: Lv2→planety, Lv3-4→+księżyce, Lv5+→wszystkie ciała.

  // Tier danych ujawniany przy danym poziomie obserwatorium (0 = nie można skanować).
  getSystemScanTierForLevel(level) {
    if (level < 2)   return 0;
    if (level === 2) return 1;   // liczba planet
    if (level < 5)   return 2;   // Lv3-4: +księżyce
    return 3;                    // Lv5+: wszystkie ciała (rozbicie)
  }

  // Najwyższy tier jaki gracz może teraz osiągnąć (wg aktualnego obserwatorium).
  getMaxSystemScanTier() {
    return this.getSystemScanTierForLevel(this.getMaxObservatoryLevel());
  }

  // Ile układów można skanować RÓWNOCZEŚNIE (ta sama krzywa co skan ciał):
  // Lv1-2 → 1, Lv3 → 2, Lv4+ → 3. (Lv<2 i tak nie może skanować — tier 0.)
  getMaxConcurrentSystemScans() {
    return this.getMaxConcurrentBodyScans();
  }

  // Czas skanu układu = stały 1 rok GRY (nie zależy od poziomu obserwatorium).
  _getSystemScanDurationYears() {
    return SYSTEM_SCAN_DURATION_YEARS;
  }

  // Wpis galaxyStar dla danego systemId (źródło seeda do peek).
  _getGalaxyStar(systemId) {
    const gd = window.KOSMOS?.galaxyData;
    return gd?.systems?.find(s => s.id === systemId) ?? null;
  }

  // Rozpocznij skan układu. Walidacja: feature ON, obserwatorium Lv2+, układ obcy
  // (nie home), istnieje w galaxyData, nie skanowany już, i jest CO ujawnić (docelowy
  // tier > już-osiągnięty). Zwraca true gdy skan wystartował.
  startSystemScan(systemId) {
    if (!GAME_CONFIG.FEATURES?.observatorySystemScan) return false;
    if (!systemId || this._systemScans.has(systemId)) return false;
    const targetTier = this.getMaxSystemScanTier();
    if (targetTier <= 0) {                                   // wymaga obserwatorium Lv2+
      EventBus.emit('observatory:systemScanRejected', { systemId, reason: 'needs_level' });
      return false;
    }
    // Limit równoczesnych skanów układów (Lv2 → 1, Lv3 → 2, Lv4+ → 3).
    const limit = this.getMaxConcurrentSystemScans();
    if (this._systemScans.size >= limit) {
      EventBus.emit('observatory:systemScanRejected', { systemId, reason: 'scan_limit', limit });
      return false;
    }
    const gs = this._getGalaxyStar(systemId);
    if (!gs || gs.isHome) {                                  // home znany; nieistniejący układ pomijamy
      EventBus.emit('observatory:systemScanRejected', { systemId, reason: 'invalid_target' });
      return false;
    }
    const prev = this._systemScanResults.get(systemId);
    if (prev && prev.tier >= targetTier) {                  // już wiemy tyle (lub więcej)
      EventBus.emit('observatory:systemScanRejected', { systemId, reason: 'already_scanned' });
      return false;
    }
    this._systemScans.set(systemId, { progress: 0, startedYear: this._gameYear, targetTier });
    EventBus.emit('observatory:systemScanStarted', { systemId, targetTier, durationYears: this._getSystemScanDurationYears() });
    return true;
  }

  // Anuluj trwający skan układu.
  cancelSystemScan(systemId, reason = 'manual') {
    if (!this._systemScans.has(systemId)) return false;
    this._systemScans.delete(systemId);
    EventBus.emit('observatory:systemScanCancelled', { systemId, reason });
    return true;
  }

  // Postęp skanu układu: { progress, durationYears, targetTier, pct } | null.
  getSystemScanProgress(systemId) {
    const scan = this._systemScans.get(systemId);
    if (!scan) return null;
    const durationYears = this._getSystemScanDurationYears();
    return {
      progress:   scan.progress,
      durationYears,
      targetTier: scan.targetTier,
      pct: durationYears > 0 ? Math.min(1, scan.progress / durationYears) : 0,
    };
  }

  // Ukończony wynik skanu układu: { tier, counts } | null.
  getSystemScanResult(systemId) {
    return this._systemScanResults.get(systemId) ?? null;
  }

  // Wszystkie aktywne skany układów (do UI).
  getActiveSystemScans() {
    const out = [];
    const durationYears = this._getSystemScanDurationYears();
    for (const [systemId, scan] of this._systemScans) {
      out.push({
        systemId,
        progress:   scan.progress,
        durationYears,
        targetTier: scan.targetTier,
        pct: durationYears > 0 ? Math.min(1, scan.progress / durationYears) : 0,
      });
    }
    return out;
  }

  // Tick aktywnych skanów układów (akumuluje lata GRY). Brak obserwatorium Lv2+ → anuluj.
  _tickSystemScans(gameDeltaYears = 0) {
    if (this._systemScans.size === 0) return;
    const canScan = this.getMaxSystemScanTier() > 0;
    for (const [systemId, scan] of [...this._systemScans]) {
      if (!canScan) { this.cancelSystemScan(systemId, 'no_observatory'); continue; }
      scan.progress += gameDeltaYears;
      if (scan.progress >= this._getSystemScanDurationYears()) {
        this._completeSystemScan(systemId, scan);
      }
    }
  }

  _completeSystemScan(systemId, scan) {
    this._systemScans.delete(systemId);
    const counts = this._countSystemBodies(systemId);
    if (!counts) return;                                     // brak danych (np. usunięty układ)
    this._systemScanResults.set(systemId, { tier: scan.targetTier, counts });
    EventBus.emit('observatory:systemScanned', { systemId, tier: scan.targetTier, counts });
  }

  // Policz ciała układu. Jeśli już wygenerowany (encje w EntityManager) → licz je
  // (źródło prawdy). Inaczej deterministyczny peek z seeda (spójny z późniejszą eksploracją).
  _countSystemBodies(systemId) {
    const planets = EntityManager.getByTypeInSystem('planet', systemId);
    if (planets.length > 0) {
      const c = {
        planets:    planets.length,
        moons:      EntityManager.getByTypeInSystem('moon', systemId).length,
        planetoids: EntityManager.getByTypeInSystem('planetoid', systemId).length,
        asteroids:  EntityManager.getByTypeInSystem('asteroid', systemId).length,
        comets:     EntityManager.getByTypeInSystem('comet', systemId).length,
      };
      c.total = c.planets + c.moons + c.planetoids + c.asteroids + c.comets;
      return c;
    }
    const gs = this._getGalaxyStar(systemId);
    if (!gs) return null;
    return new SystemGenerator().peekCountsForStar(gs);
  }

  // ── Tick skanowania ───────────────────────────────────────────────────

  _tickScan(civDeltaYears, gameDeltaYears = 0) {
    // Detekcja statków działa continuous — wykrycie wroga nie może czekać jak
    // ręczny skan ciała. Każdy tick rebuildsowi Set i emituje diff.
    this._tickVesselDetection(civDeltaYears);

    // Aktywne skany wrogich statków (reforma detekcji) — po _tickVesselDetection,
    // bo czyta świeży _detectedVesselIds (progres tylko gdy cel dalej wykryty).
    this._tickVesselScans(civDeltaYears);

    // Ręczne skany ciał niebieskich (reforma obserwatorium — zastąpił pasywny auto-skan).
    this._tickBodyScans(civDeltaYears);

    // Czasowe skany obcych układów (STRATCOM) — w czasie GRY (deltaYears), nie civ.
    this._tickSystemScans(gameDeltaYears);
  }

  // Rebuild zbioru wykrytych wrogich statków na podstawie zasięgów wszystkich kolonii gracza.
  // Statek jest "detected" gdy leży w zasięgu JAKIEJKOLWIEK kolonii (OR nie SUM).
  // Zasięg per kolonia = max z VESSEL_DETECTION_RANGE dla jej obserwatorium.
  _tickVesselDetection(civDeltaYears = 0) {
    const colMgr = window.KOSMOS?.colonyManager;
    const vMgr   = window.KOSMOS?.vesselManager;
    if (!colMgr || !vMgr) return;

    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    // Tylko kolonie GRACZA — radar/detekcja należą do gracza; obserwatoria AI nie zasilają jego widoku.
    const colonies = colMgr.getAllColonies().filter(c => {
      if (c.ownerEmpireId) return false;
      const cs = c.planet?.systemId ?? c.systemId ?? sysId;
      return cs === sysId;
    });

    const currentlyDetected = new Set();
    const detectedVessels   = new Map();  // id → vessel (do odświeżania ghost-sightingu)

    // Wczesne wyjście gdy brak kolonii gracza w aktywnym systemie — nic nie widzimy
    if (colonies.length > 0) {
      const allVessels = vMgr.getAllVessels?.() ?? [];
      for (const v of allVessels) {
        if (!isEnemyVessel(v) || v.isWreck) continue;   // wrak nie jest „kontaktem" (znika z listy/skanu)
        if ((v.systemId ?? sysId) !== sysId) continue;

        for (const col of colonies) {
          const range = this.getVesselDetectionRangeAU(col);
          if (range <= 0) continue;
          const colPos = col.planet ?? EntityManager.get(col.planetId);
          if (!colPos) continue;
          const dist = DistanceUtils.euclideanAU(
            { x: colPos.x ?? 0, y: colPos.y ?? 0 },
            { x: v.position?.x ?? 0, y: v.position?.y ?? 0 }
          );
          if (dist <= range) {
            currentlyDetected.add(v.id);
            detectedVessels.set(v.id, v);
            break;  // wystarczy jedna kolonia
          }
        }
      }
    }

    const intelSys = window.KOSMOS?.intelSystem;

    // Diff z poprzednim stanem — emituj zmiany visibility
    const added = [];
    const removed = [];
    currentlyDetected.forEach(id => { if (!this._detectedVesselIds.has(id)) added.push(id); });
    this._detectedVesselIds.forEach(id => { if (!currentlyDetected.has(id)) removed.push(id); });

    // Throttlowane odświeżenie pozycji ghost-sightingu już-wykrytych statków (nie co tick — churn).
    // Działa też w steady-state (przed early-return); nowo wykryte dostają świeży zapis niżej.
    this._sightingRefreshAccum = (this._sightingRefreshAccum ?? 0) + civDeltaYears;
    if (this._sightingRefreshAccum >= SIGHTING_REFRESH_YEARS) {
      this._sightingRefreshAccum = 0;
      for (const [id, v] of detectedVessels) {
        if (this._detectedVesselIds.has(id)) intelSys?.recordSighting?.(id, v, 'rumor');
      }
    }

    if (added.length === 0 && removed.length === 0) return;

    this._detectedVesselIds = currentlyDetected;

    const evtLog = window.KOSMOS?.eventLogSystem;
    const reg    = window.KOSMOS?.empireRegistry;

    for (const id of added) {
      const v = detectedVessels.get(id) ?? vMgr.getVessel?.(id) ?? null;
      EventBus.emit('vessel:detectionChanged', { vesselId: id, detected: true, vessel: v });

      if (!v) continue;

      // Per-vessel intel: zdalny sighting obserwatorium = 'rumor' (pozycja bez identyfikacji).
      // Faktyczny 'contact' (żywy + tożsamość) przychodzi z proximity / vessel:arrived / battle.
      intelSys?.recordSighting?.(id, v, 'rumor');

      // Intel poziomu IMPERIUM — osobny tor (ujawnia istnienie imperium, nie konkretny statek).
      const empId = v.ownerEmpireId ?? v.owner;
      if (empId && empId !== 'player') {
        intelSys?.advanceIntel?.(empId, 'rumor', 'vessel_sighted');
      }

      // EventLog + popup alert — tylko PIERWSZE wykrycie w sesji.
      if (!this._reportedVesselSightings.has(id)) {
        this._reportedVesselSightings.add(id);
        const empName = (empId && reg?.get?.(empId)?.name) ? reg.get(empId).name : 'nieznane imperium';
        // Fog-of-war tożsamości: detekcja obserwatorium = rumor (pozycja bez identyfikacji).
        // Log NIE ujawnia nazwy statku — tylko fakt wykrycia kontaktu. Pełne dane = proximity.
        evtLog?.push({
          text:      `🔭 Wykryto niezidentyfikowany kontakt w układzie.`,
          channel:   'intel',
          severity:  'warn',
          entityRef: id,
        });
        // Dedykowany event dla GameScene — popup z pauzą gry
        EventBus.emit('vessel:firstSighting', {
          vessel: v,
          empireId: empId,
          empireName: empName,
        });
      }
    }

    for (const id of removed) {
      EventBus.emit('vessel:detectionChanged', { vesselId: id, detected: false });
    }
  }

  // ── Serializacja ──────────────────────────────────────────────────────

  serialize() {
    const scanAccum = {};
    this._scanAccum.forEach((val, key) => { scanAccum[key] = val; });

    // Reforma detekcji — aktywne skany wrogich statków (Map→obj).
    const vesselScans = {};
    this._vesselScans.forEach((val, key) => { vesselScans[key] = val; });

    // Reforma obserwatorium — aktywne ręczne skany ciał (Map→obj).
    const bodyScans = {};
    this._bodyScans.forEach((val, key) => { bodyScans[key] = val; });

    // Skan STRATCOM — aktywne skany układów + ukończone wyniki (Map→obj).
    const systemScans = {};
    this._systemScans.forEach((val, key) => { systemScans[key] = val; });
    const systemScanResults = {};
    this._systemScanResults.forEach((val, key) => { systemScanResults[key] = val; });

    return {
      scanAccum,
      discoveries: this._discoveries,
      vesselScans,
      bodyScans,
      systemScans,
      systemScanResults,
    };
  }

  restore(data) {
    if (!data) return;

    // Przywróć akumulatory
    if (data.scanAccum) {
      for (const [key, val] of Object.entries(data.scanAccum)) {
        this._scanAccum.set(key, val);
      }
    }

    // Przywróć historię odkryć
    if (Array.isArray(data.discoveries)) {
      this._discoveries = data.discoveries;
    }

    // Reforma detekcji — aktywne skany (defensywny default = brak; bez migracji save v88).
    for (const [key, val] of Object.entries(data.vesselScans ?? {})) {
      this._vesselScans.set(key, val);
    }

    // Reforma obserwatorium — aktywne ręczne skany ciał (defensywny default = brak).
    for (const [key, val] of Object.entries(data.bodyScans ?? {})) {
      this._bodyScans.set(key, val);
    }

    // Skan STRATCOM — aktywne skany + wyniki (defensywny default = brak; bez migracji save v89).
    for (const [key, val] of Object.entries(data.systemScans ?? {})) {
      this._systemScans.set(key, val);
    }
    for (const [key, val] of Object.entries(data.systemScanResults ?? {})) {
      this._systemScanResults.set(key, val);
    }
  }
}
