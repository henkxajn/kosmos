// ProximitySystem — per-tick detection zbliżeń vessel↔vessel (M2a + M2b).
//
// Algorytm: O(n²/2) par z rotującym offsetem + budżet MAX_PAIRS_PER_TICK.
// Przy 100 vesseli pełne skanowanie zajmuje ~ceil(4950/500)=10 ticków.
//
// Dwa progi (M2b Commit 0, §11.5 dług z M2a):
//   Detection: enter <0.5 AU, exit ≥0.6 AU (hysteresis) — event proximityEnter/Exit.
//   Combat:    enter <0.15 AU, exit ≥0.20 AU (hysteresis) — event combatRangeEnter/Exit.
// VesselCombatSystem subskrybuje combatRangeEnter (nie filtruje po distanceAU).
// IntelSystem (M2b) subskrybuje proximityEnter dla observed contact upgrade.
//
// Feature flag: GAME_CONFIG.FEATURES.proximitySystem — lazy init w GameScene.
//
// Tick wywoływany synchronicznie z VesselManager._tick (PRZED MovementOrderSystem._tick),
// dzięki czemu kolejność jest deterministyczna: proximity → combat (event) →
// vessel:wrecked → MOS._onVesselWrecked → MOS._tick. Zob. master doc §5.
//
// Eventy:
//   vessel:proximityEnter    { vesselAId, vesselBId, distanceAU, sameFaction }
//   vessel:proximityExit     { vesselAId, vesselBId }
//   vessel:sensorLockEnter   { vesselAId, vesselBId, distanceAU, sameFaction }  (reforma detekcji — reveal tożsamości)
//   vessel:sensorLockExit    { vesselAId, vesselBId }
//   vessel:combatRangeEnter  { vesselAId, vesselBId, distanceAU, sameFaction }
//   vessel:combatRangeExit   { vesselAId, vesselBId }
//
// Flag sameFaction: true gdy ownerEmpireId obu pasuje. ProximitySystem NIE
// filtruje same-faction — emituje zawsze. Subscriber (VesselCombatSystem,
// IntelSystem) sam decyduje co z tym zrobić. Rozdzielenie odpowiedzialności
// ułatwia przyszłe use-cases (rally accumulation, escort hand-off).

import { isInService } from '../entities/Vessel.js';
import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';   // CS-PHYS-c (776) — pozycja ciała statku przy doku/orbicie
import { GAME_CONFIG } from '../config/GameConfig.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { isSameSystemStrict } from '../utils/SystemScope.js';   // AI STRIKES BACK S3/2 (SB59, Finding 151)
import { DETECTION_BASE_AU, vesselDetectionRangeAU } from '../utils/DetectionRange.js';   // ARKUSZ HUD H1 (D-HUD-3) — reguła zasięgu wykrycia

// Stałe — użyte w detection + combat logic.
//   PROXIMITY_DETECTION_AU (enter), PROXIMITY_EXIT_AU (exit, hysteresis +20%),
//   COMBAT_ENGAGEMENT_AU  (enter combat, dla VesselCombatSystem),
//   COMBAT_EXIT_AU        (exit combat, hysteresis +33% vs engagement),
//   MAX_PAIRS_PER_TICK    (budget — pełne skanowanie w ~ceil(n²/2 / budget) ticków).
//
// M4 P3-7: PROXIMITY_DETECTION_AU staje się base value. Per-vessel próg
// dynamic via _getDetectionRangeAU (player z TechSystem.getMultiplier('sensor_range');
import { systemScaleOfEntity } from '../utils/SystemScale.js';   // CS-PHYS-b2 (D-CS-24)
import { closestApproach, maxFlightStepAU } from '../utils/SweptProximity.js';      // CS-PHYS-c (Finding 776)
// empire bez tech → base). Hysteresis ratio (×1.2) zachowany. Combat range
// pozostaje hardcoded — to fizyczne ograniczenie engagement, nie sensora.
export const PROXIMITY_DETECTION_AU = DETECTION_BASE_AU;   // 0,5 AU — ARKUSZ HUD H1: jedno źródło (`DetectionRange.js`)
export const PROXIMITY_EXIT_AU      = 0.6;
export const COMBAT_ENGAGEMENT_AU   = 0.15;
export const COMBAT_EXIT_AU         = 0.20;
export const MAX_PAIRS_PER_TICK     = 500;
// CS-PHYS-c (Finding 776) — granica skoku statku między próbkami: dłuższy skok = TELEPORT (ustawienie pozycji debugiem,
// przywrócenie, dociągnięcie) → tylko test punktowy. Zmianę układu i lot warp łapie osobno warunek systemId.
// Poprawka po kontroli właściciela: stały limit 1 AU odrzucał zwykły lot przy długim tiku (hull_small 2.5 AU/rok przy
// 1 r/s: tik > 0.40 s = krok > 1 AU; przycięcie ~0.72 s dało 1.8 AU na statek i walki nie było) — czyli sam przypadek 776.
// Granica = NAJWIĘKSZY możliwy przelot statku w tym tiku:
//   speedAU × mnożnik prędkości z tech (misje go stosują; iloczyn do ×7) × SWEEP_SPEED_MARGIN × dt tiku
//   + ruch ciała, przy którym statek stoi (dok / orbita: przesunięcie ciała + przeskok po orbicie wokół niego)
//   + SWEEP_STEP_FLOOR_AU.
// Jawne oznaczanie teleportów w miejscach zapisu pozycji odpadło: ~50 miejsc zapisu (misje, dok, cofanie w walce,
// stagery debug) — nowe łatwo przeoczyć; granica z prędkości × dt obejmuje je wszystkie bez dotykania producentów.
// Stałe SWEEP_SPEED_MARGIN / SWEEP_STEP_FLOOR_AU i wzór przelotu: `utils/SweptProximity.js` (wspólne z MOS).
export { SWEEP_SPEED_MARGIN, SWEEP_STEP_FLOOR_AU } from '../utils/SweptProximity.js';

// M4 P3-7: hysteresis ratio enter→exit dla dynamic detection.
const DETECTION_HYSTERESIS = 1.2;

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;
const CIV_TIME_SCALE = GAME_CONFIG.CIV_TIME_SCALE;   // civYears / rok fizyki (ProximitySystem dostaje civDy)

/**
 * Zwraca stabilny klucz pary vesseli — niezależny od kolejności (v1,v2) vs (v2,v1).
 * @param {string} idA
 * @param {string} idB
 * @returns {string}
 */
export function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

/**
 * Czy vessel nadaje się do proximity check (nie wrak + ma poprawną pozycję).
 * @param {object} v
 * @returns {boolean}
 */
function _isValidForProximity(v) {
  if (!v || v.isWreck) return false;
  // W2 — kadłub w REZERWIE nie uczestniczy w detekcji: nie wykrywa i nie jest wykrywany.
  // Poza oszczędnością budżetu par (500/tik) to jest wymóg PROJEKTU: magazyn ma być
  // widoczny jako POTENCJAŁ przez wywiad, a nie jako kontakt sensoryczny.
  if (!isInService(v)) return false;
  const p = v.position;
  if (!p) return false;
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return false;
  if (!isFinite(p.x) || !isFinite(p.y)) return false;
  return true;
}

/**
 * Próg wejścia w walkę pary [AU]: max(BAZA 0.15 AU × k układu, zasięg broni obu × 1.05) — M4 P3 hotfix3 + CS-PHYS-b2.
 * CS-PHYS-c — wyjęte z `_checkPair` bez zmiany wzoru (jedno źródło dla debug `csCollisionTest` i keeperów).
 */
export function combatEnterAUOf(v1, v2) {
  return Math.max(
    COMBAT_ENGAGEMENT_AU * systemScaleOfEntity(v1),   // CS-PHYS-b2 (D-CS-24) — skala układu pary
    _maxWeaponRangeAU(v1) * 1.05,
    _maxWeaponRangeAU(v2) * 1.05,
  );
}

export class ProximitySystem {
  /**
   * @param {import('./VesselManager.js').VesselManager} vesselManager
   */
  constructor(vesselManager) {
    this._vm = vesselManager;
    /** @type {Set<string>} aktywne pary (obecnie w zasięgu proximity detection <0.5 AU) */
    this._activePairs = new Set();
    /** @type {Set<string>} aktywne pary w combat range (<0.15 AU) */
    this._activeCombatPairs = new Set();
    /** @type {Set<string>} aktywne pary w sensor-lock (reforma detekcji — reveal tożsamości) */
    this._activeSensorLockPairs = new Set();
    /** @type {number} offset do rotacji iteracji w _tick (budget handling) */
    this._iterationOffset = 0;
    /** CS-PHYS-c (Finding 776) — pozycje statków z końca poprzedniego tiku: id → { x, y, systemId } (początek odcinka) */
    this._prevSamples = new Map();

    // Cleanup aktywnych par gdy którykolwiek vessel ginie — zapobiega
    // false-positive przy reuse vessel ID w przyszłości.
    this._onVesselWrecked = (e) => this._handleVesselWrecked(e);
    EventBus.on('vessel:wrecked', this._onVesselWrecked);

    // P3 polish (2026-05-20) — battle finalize → wyczyść _activeCombatPairs dla
    // par participantA × participantB. Bez tego po retreat enemy, gdy dist
    // pomiędzy player a uciekającym enemy < combatExitAU, _activeCombatPairs
    // nie jest czyszczone i `!isCombat` filter w _checkPair NIE emit'uje
    // nowego combatRangeEnter → player kite hover bez walki.
    this._onBattleResolved = (e) => this._handleBattleResolved(e);
    EventBus.on('battle:resolved', this._onBattleResolved);
  }

  /**
   * P3 polish — battle finalize cleanup. Po zakończonej walce wyczyść
   * _activeCombatPairs dla par participantA × participantB, żeby następny
   * _checkPair mógł re-emit combatRangeEnter (gdy dist nadal < combatEnter).
   * @private
   */
  _handleBattleResolved({ result }) {
    if (!result?.participantA?.vesselIds || !result?.participantB?.vesselIds) return;
    const aIds = result.participantA.vesselIds;
    const bIds = result.participantB.vesselIds;
    for (const a of aIds) {
      for (const b of bIds) {
        this._activeCombatPairs.delete(pairKey(a, b));
      }
    }
  }

  /**
   * Per-tick detection proximity z budget rotation.
   * @param {number} civDy — civDeltaYears
   */
  _tick(civDy) {
    if (!GAME_CONFIG.FEATURES?.proximitySystem) return;
    if (!civDy || civDy <= 0) return;
    // CS-PHYS-c (776) — dt wywołania [lata fizyki] dla granicy skoku: większy z bieżącego i poprzedniego (przejście PRZED
    // ruchem widzi ruch słuchaczy tiku z poprzedniej klatki, policzony jej dt)
    this._sweepDtYears = Math.max(civDy, this._lastCivDy ?? 0) / CIV_TIME_SCALE;
    this._lastCivDy = civDy;
    this._sweepSpeedMult = Math.max(1, globalThis.window?.KOSMOS?.techSystem?.getShipSpeedMultiplier?.() ?? 1);
    if (!this._vm?._vessels?.size) return;

    const vessels = [];
    for (const v of this._vm._vessels.values()) {
      if (_isValidForProximity(v)) vessels.push(v);
    }
    const n = vessels.length;
    if (n < 2) { this._samplePositions(vessels); return; }

    const maxPairs = MAX_PAIRS_PER_TICK;
    let checked = 0;
    const startIdx = n > 0 ? (this._iterationOffset % n) : 0;

    // Faza 1: od startIdx do końca
    for (let i = startIdx; checked < maxPairs && i < n; i++) {
      for (let j = i + 1; checked < maxPairs && j < n; j++) {
        this._checkPair(vessels[i], vessels[j]);
        checked++;
      }
    }
    // Faza 2: wrap-around od 0 do startIdx, gdy budget wystarczy
    for (let i = 0; checked < maxPairs && i < startIdx; i++) {
      for (let j = i + 1; checked < maxPairs && j < n; j++) {
        this._checkPair(vessels[i], vessels[j]);
        checked++;
      }
    }

    // Rotacja offsetu — gwarantuje progres nawet gdy budget < total pairs.
    //   Cap przez n*n (odpowiednik "całego cyklu par") dla stabilności.
    this._iterationOffset = (this._iterationOffset + checked) % Math.max(1, n * n);
    this._samplePositions(vessels);
  }

  /**
   * CS-PHYS-c (Finding 776) — zapamiętaj pozycje końca tiku (początek odcinka w następnym). Statek nieważny w tym tiku
   * (w doku, w rezerwie, wrak) wypada z mapy → po powrocie pierwszy tik ma tylko test punktowy.
   * @private
   */
  _samplePositions(vessels) {
    const next = new Map();
    for (const v of vessels) {
      const p = v.position;
      const s = { x: p.x, y: p.y, systemId: v.systemId ?? null };
      // statek w doku / na orbicie jedzie z ciałem — pozycja ciała do granicy skoku (_maxSweepStepPx)
      if ((p.state === 'docked' || p.state === 'orbiting') && p.dockedAt) {
        const b = EntityManager.get(p.dockedAt);
        if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) { s.bodyId = p.dockedAt; s.bx = b.x; s.by = b.y; }
      }
      next.set(v.id, s);
    }
    this._prevSamples = next;
  }

  /**
   * CS-PHYS-c (776) — największy możliwy skok statku od próbki w tym tiku [px] (opis przy SWEEP_SPEED_MARGIN wyżej).
   * Ruch z ciałem: |Δ ciała| + odległość od ciała w próbce + odległość od ciała teraz (nierówność trójkąta — obejmuje
   * każdy przeskok po orbicie wokół ciała).
   * @private
   */
  _maxSweepStepPx(v, p) {
    const flyAU = maxFlightStepAU(v.speedAU, this._sweepSpeedMult, this._sweepDtYears);
    let carryPx = 0;
    if (p.bodyId) {
      const b = EntityManager.get(p.bodyId);
      if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) {
        carryPx = Math.hypot(b.x - p.bx, b.y - p.by) + Math.hypot(p.x - p.bx, p.y - p.by)
          + Math.hypot(v.position.x - b.x, v.position.y - b.y);
      }
    }
    return flyAU * AU_TO_PX + carryPx;
  }

  /**
   * CS-PHYS-c (Finding 776) — najmniejsze zbliżenie pary w ostatnim tiku (ruch obu statków z poprzedniego tiku do
   * bieżącego). null, gdy przemiatanie pominięte (powód: `_sweptProbe`). Para obserwowana debugiem (`_sweepWatch`,
   * csCollisionTest) dostaje wpis na każde wywołanie: powód pominięcia albo zbliżenie, plus skok statku.
   * @private
   * @returns {{ distAU: number, t: number, a: {x:number,y:number}, b: {x:number,y:number}, stepAU: number }|null}
   */
  _sweptApproach(v1, v2) {
    const r = this._sweptProbe(v1, v2);
    const w = this._sweepWatch?.get?.(pairKey(v1.id, v2.id));
    if (w) w.push(r.skip ? { skip: r.skip, stepAU: r.stepAU ?? null, maxStepAU: r.maxStepAU ?? null } : { distAU: r.distAU, stepAU: r.stepAU });
    return r.skip ? null : r;
  }

  /**
   * CS-PHYS-c (776) — przemiatanie albo powód pominięcia: flagOff · noPrevSample (pierwszy tik / statek wrócił do gry) ·
   * systemChanged (skok warp, zmiana układu) · teleportGuard (skok > _maxSweepStepPx).
   * @private
   */
  _sweptProbe(v1, v2) {
    if (!GAME_CONFIG.FEATURES?.sweptProximity) return { skip: 'flagOff' };
    const p1 = this._prevSamples.get(v1.id), p2 = this._prevSamples.get(v2.id);
    if (!p1 || !p2) return { skip: 'noPrevSample' };
    if (p1.systemId !== (v1.systemId ?? null) || p2.systemId !== (v2.systemId ?? null)) return { skip: 'systemChanged' };
    const s1 = Math.hypot(v1.position.x - p1.x, v1.position.y - p1.y);
    const s2 = Math.hypot(v2.position.x - p2.x, v2.position.y - p2.y);
    const m1 = this._maxSweepStepPx(v1, p1), m2 = this._maxSweepStepPx(v2, p2);
    if (s1 > m1) return { skip: 'teleportGuard', stepAU: s1 / AU_TO_PX, maxStepAU: m1 / AU_TO_PX };
    if (s2 > m2) return { skip: 'teleportGuard', stepAU: s2 / AU_TO_PX, maxStepAU: m2 / AU_TO_PX };
    const ca = closestApproach(p1, v1.position, p2, v2.position);
    return { distAU: ca.dist / AU_TO_PX, t: ca.t, a: ca.a, b: ca.b, stepAU: Math.max(s1, s2) / AU_TO_PX };
  }

  /**
   * Sprawdź parę vesseli — oblicz dystans, porównaj z hysteresis,
   * emit enter/exit jeśli przekraczamy próg.
   * @param {object} v1
   * @param {object} v2
   */
  _checkPair(v1, v2) {
    const key = pairKey(v1.id, v2.id);
    // Guard międzyukładowy (fix 2026-07-15): każdy układ ma własną ramkę współrzędnych
    // wyśrodkowaną na swojej gwieździe (x=0,y=0), więc statki z RÓŻNYCH układów mają
    // zbliżone surowe x/y (oba blisko własnej gwiazdy). Bez tego raw hypot dawał fałszywe
    // zbliżenie — gracz w sys_home „wykrywał" wroga w sys_061 (~0.2 AU), co podbijało intel
    // do rumor/contact (obcy wpadał na listę floty, choć mapa filtrująca po systemId ich nie
    // pokazywała) i groziło fantomową bitwą międzyukładową. Detekcja/walka liczy się WYŁĄCZNIE
    // w obrębie jednego układu. Różne układy = dystans ∞ → gałęzie enter nie odpalą, a pary
    // aktywne (gdy statek zmienił układ) zamkną się przez gałęzie exit poniżej.
    // ⚠ AI STRIKES BACK S3/2 (SB59, Finding 151): kanon `isSameSystemStrict` (fail-CLOSED). Statek W SKOKU
    //   (`systemId === null`) nie jest w ŻADNYM układzie — własna koercja `?? 'sys_home'` łapała także `null`, więc
    //   statek w skoku „był” w domu, na współrzędnych sprzed skoku (detekcja, intel, zasięg walki). Brak pola
    //   (stary zapis) = `sys_home` — bez zmian.
    const sameSystem = isSameSystemStrict(v1, v2);
    const dx = v1.position.x - v2.position.x;
    const dy = v1.position.y - v2.position.y;
    const distPx = Math.hypot(dx, dy);
    const distAU = sameSystem ? (distPx / AU_TO_PX) : Infinity;
    const isPaired = this._activePairs.has(key);
    // CS-PHYS-c (Finding 776) — najmniejsze zbliżenie w tym tiku (≤ distAU); poza układem / bez próbki — jak punkt.
    const swept = sameSystem ? this._sweptApproach(v1, v2) : null;
    const nearAU = swept ? Math.min(distAU, swept.distAU) : distAU;

    // M4 P3-7 — dynamic detection threshold per vessel pair. Wygrywa większy
    // sensor (np. player ze zbadanym advanced_sensors_2 wykrywa z 0.75 AU;
    // empire bez tech sees go z 0.5 AU; pair entry threshold = 0.75 AU).
    const enterAU = Math.max(this._getDetectionRangeAU(v1), this._getDetectionRangeAU(v2));
    const exitAU  = enterAU * DETECTION_HYSTERESIS;

    if (!isPaired && nearAU < enterAU) {
      this._activePairs.add(key);
      const sameFaction = (v1.ownerEmpireId ?? null) === (v2.ownerEmpireId ?? null);
      EventBus.emit('vessel:proximityEnter', {
        vesselAId:  v1.id,
        vesselBId:  v2.id,
        distanceAU: nearAU,
        sameFaction,
        ...(distAU < enterAU ? {} : { swept: true }),   // CS-PHYS-c — wyłącznie z przemiatania
      });
    } else if (isPaired && distAU >= exitAU) {
      this._activePairs.delete(key);
      EventBus.emit('vessel:proximityExit', {
        vesselAId: v1.id,
        vesselBId: v2.id,
      });
    }
    // W pasie hysteresis (enterAU .. exitAU) — no-op dla spójności.

    // Trzeci próg: sensor-lock (reforma detekcji) — reveal tożsamości wroga BEZ walki.
    // Gdy własny statek gracza zbliży się na SENSOR_LOCK_AU×tech do wroga → emit
    // vessel:sensorLockEnter; IntelSystem podbija intel rumor→contact (advanceVesselContact,
    // BYPASS dystansowego progu w _observeVessel). Próg leży MIĘDZY detection (rumor)
    // a combat (0.15). Liczy się tylko gdy któryś vessel to gracz (enemy lock=0).
    if (GAME_CONFIG.FEATURES?.sensorLockContact) {
      const isLocked    = this._activeSensorLockPairs.has(key);
      const lockEnterAU = Math.max(this._getSensorLockAU(v1), this._getSensorLockAU(v2));
      if (lockEnterAU > 0) {
        const lockExitAU = lockEnterAU * DETECTION_HYSTERESIS;
        if (!isLocked && nearAU < lockEnterAU) {
          this._activeSensorLockPairs.add(key);
          const sameFaction = (v1.ownerEmpireId ?? null) === (v2.ownerEmpireId ?? null);
          EventBus.emit('vessel:sensorLockEnter', {
            vesselAId:  v1.id,
            vesselBId:  v2.id,
            distanceAU: nearAU,
            sameFaction,
            ...(distAU < lockEnterAU ? {} : { swept: true }),   // CS-PHYS-c
          });
        } else if (isLocked && distAU >= lockExitAU) {
          this._activeSensorLockPairs.delete(key);
          EventBus.emit('vessel:sensorLockExit', { vesselAId: v1.id, vesselBId: v2.id });
        }
      }
    }

    // Drugi próg: combat range. M4 P3 hotfix3 — DYNAMIC per pair:
    // combat enter = max(BASE 0.15, weapon range obu vesseli × 1.05).
    // Vessel z missile (0.30 AU) inicjuje combat z 0.30 AU; frigate z kinetic
    // (0.15) z 0.15. Pair = max obu — DSCS startEngagement gdy któryś jest w
    // stanie strzelać. Zatrzymuje enemy via _freezeAsStationary zanim minie
    // player vessel; player kontynuuje zbliżanie do swojej weapon range.
    // Hysteresis: exit = enter × 1.33 (zachowane ratio z hardcoded 0.15/0.20).
    const isCombat = this._activeCombatPairs.has(key);
    const combatEnterAU = combatEnterAUOf(v1, v2);   // CS-PHYS-c — wspólna reguła (też dla csCollisionTest)
    const combatExitAU = combatEnterAU * (COMBAT_EXIT_AU / COMBAT_ENGAGEMENT_AU);  // ratio 1.333

    // P3 polish #2 (2026-05-20) — defensywne re-emit gdy pair "zaschła" w
    // _activeCombatPairs bez aktywnego encountera (np. startEngagement
    // failed by team-up gather lub _inCombatState rejected jednego z vesseli).
    // Bez tego: pair zostaje stale 'true', combat NIE wystartuje a player kite
    // hover'uje bez walki. Self-heal: gdy isCombat=true, dist<combatEnter, ale
    // DSCS nie ma żadnego encountera dla tych ID → wyczyść flag, niech następna
    // iteracja emit'uje świeży combatRangeEnter.
    if (isCombat && distAU < combatEnterAU) {
      const dscs = window.KOSMOS?.deepSpaceCombatSystem;
      if (dscs?._findActiveEncounterContaining) {
        const enc1 = dscs._findActiveEncounterContaining(v1.id);
        const enc2 = dscs._findActiveEncounterContaining(v2.id);
        if (!enc1 && !enc2) {
          this._activeCombatPairs.delete(key);
          // Fall-through — re-emit za chwilę przez `!isCombat` branch poniżej.
        }
      }
    }
    const isCombatRefreshed = this._activeCombatPairs.has(key);

    if (!isCombatRefreshed && nearAU < combatEnterAU) {
      // Bugfix 2026-05-21 (task #13): nie emituj combatRangeEnter gdy
      // któryś vessel jest docked. DSCS i tak zrejekutje (NOT in combat
      // state) → bez tej skrótki ProximitySystem emituje co tick, VCS
      // deleguje, DSCS odrzuca → log spam. Docked w hangarze nie walczą.
      if (v1.position?.state === 'docked' || v2.position?.state === 'docked') {
        return;
      }
      const sameFaction = (v1.ownerEmpireId ?? null) === (v2.ownerEmpireId ?? null);
      // CS-PHYS-c (Finding 776) — wejście WYŁĄCZNIE z przemiatania (statki minęły się między tikami): strony różnych
      // frakcji wracają do punktu największego zbliżenia, zanim DSCS je zamrozi — inaczej starcie zaczynałoby się
      // z pozycji po minięciu, poza zasięgiem broni (strażnik „nikt nie może zadać obrażeń” odmówiłby startu).
      const sweptOnly = !(distAU < combatEnterAU);
      if (sweptOnly && !sameFaction) {
        v1.position.x = swept.a.x; v1.position.y = swept.a.y;
        v2.position.x = swept.b.x; v2.position.y = swept.b.y;
      }
      this._activeCombatPairs.add(key);
      EventBus.emit('vessel:combatRangeEnter', {
        vesselAId:  v1.id,
        vesselBId:  v2.id,
        distanceAU: nearAU,
        sameFaction,
        ...(sweptOnly ? { swept: true } : {}),   // CS-PHYS-c
      });
    } else if (isCombatRefreshed && distAU >= combatExitAU) {
      this._activeCombatPairs.delete(key);
      EventBus.emit('vessel:combatRangeExit', {
        vesselAId: v1.id,
        vesselBId: v2.id,
      });
    }
  }

  /**
   * M4 P3-7 — dynamic detection range per vessel.
   *
   * Player vessel: sensorRangeAU kadłuba × TechSystem.getMultiplier('sensor_range'). Empire
   * vessel: BASE × 1.0 (empire tech state nie jest yet trackowany w grze;
   * P5 doda EmpireTechState i empire-specific multipliers).
   *
   * Fallback gdy techSystem niedostępny → BASE (sensowny default).
   *
   * @private
   * @param {object} vessel
   * @returns {number} detection range w AU
   */
  _getDetectionRangeAU(vessel) {
    // ARKUSZ HUD H1 (D-HUD-3, Finding 505) — reguła w `DetectionRange.vesselDetectionRangeAU` (ta sama funkcja liczy
    // promień radaru HUD): gracz — sensorRangeAU kadłuba × mnożnik techu sensorów; wróg — płaska baza (tech imperium
    // nie śledzony — P5). Zapas bazy / mnożnika 1, gdy VesselManager / TechSystem niedostępny (headless bez KOSMOS).
    return vesselDetectionRangeAU(vessel, {
      vesselManager: window.KOSMOS?.vesselManager,
      techSystem:    window.KOSMOS?.techSystem,
    });
  }

  /**
   * Reforma detekcji — zasięg sensor-lock (reveal tożsamości) per vessel.
   *
   * Tylko statki GRACZA identyfikują wroga (reveal = wiedza gracza); wróg → 0
   * (nie podbija intelu gracza). Próg = SENSOR_LOCK_AU (0.3 AU) × mnożnik techu
   * sensorów — skaluje się razem z zasięgiem wykrycia. Pair lock = max obu = lock gracza.
   *
   * @private
   * @param {object} vessel
   * @returns {number} sensor-lock range w AU (0 dla wroga)
   */
  _getSensorLockAU(vessel) {
    const isPlayer = (vessel.ownerEmpireId == null || vessel.ownerEmpireId === 'player');
    if (!isPlayer) return 0;
    const techSys = window.KOSMOS?.techSystem;
    const mult    = techSys?.getMultiplier ? techSys.getMultiplier('sensor_range') : 1.0;
    return GAME_CONFIG.SENSOR_LOCK_AU * mult * systemScaleOfEntity(vessel);   // CS-PHYS-b2
  }

  /**
   * Cleanup aktywnych par (detection + combat) po wreckowaniu vessela.
   * Zapobiega false-positive gdy ID zostaje reużyte (teoretyczne future-proof).
   * NIE emitujemy proximityExit/combatRangeExit — wreck to terminal state;
   * konsumenci (VesselCombatSystem, IntelSystem M2b) słuchają vessel:wrecked osobno.
   * @param {{vesselId: string}} e
   */
  _handleVesselWrecked({ vesselId }) {
    if (!vesselId) return;
    if (this._activePairs.size === 0 && this._activeCombatPairs.size === 0
        && this._activeSensorLockPairs.size === 0) return;
    const prefix1 = `${vesselId}|`;
    const suffix1 = `|${vesselId}`;
    for (const key of [...this._activePairs]) {
      if (key.startsWith(prefix1) || key.endsWith(suffix1)) {
        this._activePairs.delete(key);
      }
    }
    for (const key of [...this._activeCombatPairs]) {
      if (key.startsWith(prefix1) || key.endsWith(suffix1)) {
        this._activeCombatPairs.delete(key);
      }
    }
    for (const key of [...this._activeSensorLockPairs]) {
      if (key.startsWith(prefix1) || key.endsWith(suffix1)) {
        this._activeSensorLockPairs.delete(key);
      }
    }
  }

  destroy() {
    EventBus.off('vessel:wrecked', this._onVesselWrecked);
    this._activePairs.clear();
    this._activeCombatPairs.clear();
    this._activeSensorLockPairs.clear();
    this._iterationOffset = 0;
  }

  /**
   * Debug: lista aktywnych par proximity (detection <0.5 AU).
   * @returns {string[][]}
   */
  getProximityPairs() {
    return [...this._activePairs].map(k => k.split('|'));
  }

  /**
   * Debug: lista aktywnych par w combat range (<0.15 AU).
   * @returns {string[][]}
   */
  getCombatPairs() {
    return [...this._activeCombatPairs].map(k => k.split('|'));
  }

  /**
   * Lista other-vessel IDs które mają aktywną parę proximity (detection <0.5 AU)
   * z podanym vesselem. Używane przez IntelSystem (M2b) do multi-observer check
   * w _onVesselProximityExit — jeśli inny player vessel nadal obserwuje cel,
   * positionKnown nie jest resetowane.
   * @param {string} vesselId
   * @returns {string[]}
   */
  getActivePairsFor(vesselId) {
    const out = [];
    for (const key of this._activePairs) {
      const [a, b] = key.split('|');
      if (a === vesselId) out.push(b);
      else if (b === vesselId) out.push(a);
    }
    return out;
  }
}

// ── Module helpers ────────────────────────────────────────────────────

/**
 * Max effective weapon range AU vessela — z modules.stats.rangeAU,
 * z uwzględnieniem tech multipliers (weapon_range_<category> × weapon_range_all).
 *
 * Why: MovementOrderSystem._tickEngageOrder utrzymuje optimal range = tech-adjusted
 * maxRangeAU × 0.95. Jeśli ProximitySystem._checkPair używa raw range, optimal
 * (np. kinetic 0.224 AU z techami) leży POZA combat threshold (raw 0.1575 AU)
 * → engage hoveruje bez wpadania w combat. Symetria z _computeMaxWeaponRangeAU
 * w MOS rozwiązuje ten rozjazd.
 *
 * Tech mults tylko dla player vessela (empire bez tech state — P5).
 *
 * @param {object} vessel
 * @returns {number}
 */
function _maxWeaponRangeAU(vessel) {
  let maxAU = 0;
  const isPlayer = (vessel.ownerEmpireId == null || vessel.ownerEmpireId === 'player');
  const techSys = window.KOSMOS?.techSystem;
  for (const modId of vessel.modules ?? []) {
    const mod = SHIP_MODULES?.[modId];
    if (!mod?.stats?.rangeAU) continue;
    const category = mod.stats.category ?? mod.stats.range ?? 'medium';
    let mult = 1.0;
    if (isPlayer && techSys?.getMultiplier) {
      mult *= techSys.getMultiplier(`weapon_range_${category}`);
      mult *= techSys.getMultiplier('weapon_range_all');
    }
    const effective = mod.stats.rangeAU * mult;
    if (effective > maxAU) maxAU = effective;
  }
  return maxAU * systemScaleOfEntity(vessel);   // CS-PHYS-b2 (D-CS-24) — skala układu statku
}
