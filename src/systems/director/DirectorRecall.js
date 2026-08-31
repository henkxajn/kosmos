// DirectorRecall — POWRÓT OKRĘTU AI DO DOMU (Z2, „AI wraca po ataku", workstream B).
//
// PO CO TEN PLIK ISTNIEJE. Po uderzeniu okręt AI zostawał na orbicie planety GRACZA
// z `mission=null`, `movementOrder=null` (VO-3b) i `pendingOrder=null` — czyli spełniał
// WSZYSTKIE warunki `DirectorOffensive.strikeReadyVessels`. Skutek, ZMIERZONY przed kodem
// (`docs/design/AI_RECALL_PLAN.md` §2):
//   • drugie i każde kolejne uderzenie lądowało w TEJ SAMEJ CHWILI, w której zapadała decyzja
//     (rajder stał 0 AU od celu) — ostrzeżenie 0,0 roku zamiast 5,1;
//   • między uderzeniami trzymał orbitę gracza: zrywał pulę hubu orbitalnego
//     (`SystemPoolService._hostileWarshipInOrbit`) i doliczał się do KAŻDEJ kolejnej bitwy
//     (`EnemyAttackHandler:93-98` — rosnący stos bojowy bez budowania czegokolwiek);
//   • `war:peaceSigned` ma ZERO konsumentów, więc okupacja przeżywała POKÓJ.
//
// ⚠ POMIAR ZMIENIŁ PROJEKT, NIE POTWIERDZIŁ GO. Z2 nie jest slice'em o TEMPIE. Wiążącym
//   ograniczeniem kadencji jest `strike_player_target.cooldown = 5.0`, a rzut nasyca się do
//   100 % — powrót krótszy niż cooldown jest w liczbie uderzeń NIEWIDOCZNY (zmierzone: postój
//   3 lata ⇒ te same 19,8 uderzeń na 100 lat). Ten plik kupuje DOLOT i WOLNĄ ORBITĘ, nie rzadsze
//   ataki. Knob tempa został tam, gdzie był: w danych (`DirectorRuleData`).
//
// ── TRZY ZASADY, KTÓRE UKSZTAŁTOWAŁY TĘ REGUŁĘ ──────────────────────────────────────────────
//
//  1. ZAMIATACZ, NIE HOOK (D-Z2-1). Producentów stanu „uzbrojony okręt AI stoi poza domem" jest
//     SIEDEM (plan §1.2): zwycięstwo orbitalne EAH, remis DSCS, odwrót na ciało niczyje, odwrót
//     na ciało GRACZA, anulowany rozkaz w locie, stary zapis, dźwignia debugowa. Hook u każdego
//     z nich to dokładnie ta pułapka, którą repo nazwało po `131cc2e` („policz PRODUCENTÓW,
//     zanim uznasz klasę za utwardzoną"). Siedmiu producentów, JEDEN konsument.
//
//  2. AKCJA NIGDY NIE RZUCA. `AlienCivSystem` woła `tickEmpire` POZA własnym try/catch, a
//     `DirectorSystem._firePending` biegnie POZA per-regułowym. Wyjątek stąd zabiłby tik
//     KAŻDEGO imperium ustawionego po nas. Odmowy są RAPORTOWANE, nie rzucane.
//
//  3. ZERO AUTORSKICH PROGÓW (decyzja 22 planu W2). Nie ma tu „postoju K lat" ani „wracaj przy
//     sile X" — bo takich liczb nie da się dziś uzasadnić, a postój ≤ cooldown i tak jest
//     w kadencji niewidoczny. Decyzję niesie sam FAKT: okręt stoi poza domem i nie ma zajęcia.
//
// ⚠ CO TA REGUŁA CELOWO POMIJA — KURIERY (`hasWeapons`). Kurier AI to `hull_small` z ładownią;
//   jego powroty prowadzi `EmpireLogisticsSystem._advanceRouteCourier`, w miejscu, gdzie realnie
//   utyka. Ta sama granica co w `DirectorMobilization`.
//
// ⚠ DOM = `directorProduction.capitalOf` (kanon Directora: produkcja, doktryny, mobilizacja,
//   ofensywa). NIGDY `vessel.colonyId` — `VesselManager._onColonyDestroyed:1136-1153` przepisuje
//   je BEZ terminu właściciela na kolonię GRACZA (Finding 195), więc byłoby to odesłanie rajdera
//   w ręce przeciwnika. I nigdy `empire.homeSystemId` — pole istnieje, ale nie jest kanonem.

import { DirectorProbes, DirectorActions } from './DirectorRegistry.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { isEnemyVessel, hasWeapons, isInService } from '../../entities/Vessel.js';

export class DirectorRecall {
  /** Ciało stolicy imperium — kanon, jak w produkcji/doktrynach/mobilizacji/ofensywie. */
  _capitalBodyId(empireId) {
    return window.KOSMOS?.directorProduction?.capitalOf?.(empireId)?.planetId ?? null;
  }

  /** Układ macierzysty imperium = układ jego stolicy. `null` gdy stolicy nie ma (D-Z2-10). */
  homeSystemIdOf(empireId) {
    const capId = this._capitalBodyId(empireId);
    if (!capId) return null;
    return EntityManager.get(capId)?.systemId ?? null;
  }

  /**
   * Czy okręt czeka na WŁASNĄ bitwę w oknie batchowania `EnemyAttackHandler` (500 ms realnych)?
   *
   * ⚠ Ryzyko R1 planu, nie ostrożność: `_resolveBatchedBattle` zbiera uczestników po
   * `state==='orbiting'`, więc odesłany w tym oknie rajder (`in_transit`) UCIEKŁBY z bitwy,
   * którą sam wywołał.
   * @private
   */
  _awaitingBatchedBattle(vesselId) {
    const pending = window.KOSMOS?.enemyAttackHandler?._pendingBattles;
    if (!pending?.values) return false;
    for (const rec of pending.values()) {
      if (rec?.arrivedVesselIds?.has?.(vesselId)) return true;
    }
    return false;
  }

  /** @private — reużyty predykat starcia (D-Z2-5). Nowej nazwy NIE dokładamy: ta ma już
   *  sześciu konsumentów cross-system, a druga byłaby drugim słownikiem na to samo. */
  _inActiveEncounter(vesselId) {
    const dscs = window.KOSMOS?.deepSpaceCombatSystem;
    if (!dscs?._findActiveEncounterContaining) return false;
    return !!dscs._findActiveEncounterContaining(vesselId);
  }

  /**
   * ZAMIATACZ — uzbrojone okręty imperium, które stoją POZA jego układem macierzystym
   * i nie mają zajęcia. Jeden konsument dla wszystkich siedmiu producentów (zasada 1).
   *
   * ⚠ Bramka flagi stoi TUTAJ, nie tylko w sondzie: `aiStrikeRecall = false` ma znaczyć
   * „zachowanie sprzed slice'u", a nie „reguła milczy, ale zamiatacz i tak liczy".
   */
  strandedWarshipsAwayFromHome(empireId) {
    if (GAME_CONFIG.FEATURES?.aiStrikeRecall === false) return [];
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return [];
    const homeSys = this.homeSystemIdOf(empireId);
    if (!homeSys) return [];                                  // bez stolicy nie ma dokąd wracać (D-Z2-10)

    const out = [];
    for (const v of vMgr._vessels.values()) {
      if (!v || v.isWreck) continue;
      if (!isEnemyVessel(v)) continue;
      if ((v.ownerEmpireId ?? v.owner) !== empireId) continue;
      if (!hasWeapons(v)) continue;                           // kurier ma własną ścieżkę (nagłówek)
      if (!isInService(v)) continue;                          // rezerwa nie lata
      if ((v.systemId ?? 'sys_home') === homeSys) continue;   // już w domu
      if (v.mission) continue;                                // ma zajęcie
      if (v.movementOrder) continue;                          // pod rozkazem (np. trwający odwrót)
      if (v.pendingOrder) continue;                           // composite w toku
      if (this._inActiveEncounter(v.id)) continue;            // ⚠ nie wyciągamy nikogo z bitwy
      if (this._awaitingBatchedBattle(v.id)) continue;        // ⚠ ryzyko R1
      out.push(v);
    }
    return out;
  }

  /** Sonda wyzwalacza: czy jest KOGO ściągać. */
  countStranded(empireId) {
    return this.strandedWarshipsAwayFromHome(empireId).length;
  }

  /**
   * Akcja `recallVessels` — odeślij do `params.count` okrętów na orbitę stolicy.
   *
   * ⚠ Porcja, nie hurt — z tego samego powodu co w mobilizacji: `count` domyślnie równy
   *   `MAX_STRIKE_SIZE` (3), czyli tyle, ile imperium wysyła w JEDNYM uderzeniu. To nie jest
   *   wymyślony próg, tylko lustro rozmiaru eskadry.
   * ⚠ Nigdy nie rzuca (zasada 2). Odmowa jest ZDARZENIEM, bo `DebugLog` nie ma publicznego
   *   `push` — nasłuchuje nazw z `TRACKED_EVENTS`.
   * ⚠ `no_capital` jest w ścieżce REGUŁY nieosiągalny (sonda zwraca 0, więc trigger nie
   *   przechodzi) i to jest w porządku: żyje w wywołaniu WPROST i w audycie — tak samo jak
   *   `no_idle_hull` w `DirectorOffensive`. Powód ma być prawdomówny, nie koniecznie częsty.
   */
  recallVessels(ctx, params = {}) {
    const empireId = ctx?.empireId;
    if (!empireId) return;
    if (GAME_CONFIG.FEATURES?.aiStrikeRecall === false) return;

    const os = window.KOSMOS?.orderService;
    if (!os?.issueRecall) {
      EventBus.emit('director:recallRefused', { empireId, reason: 'no_order_service' });
      return;
    }
    const capitalBodyId = this._capitalBodyId(empireId);
    const homeSystemId  = this.homeSystemIdOf(empireId);
    if (!capitalBodyId || !homeSystemId) {
      EventBus.emit('director:recallRefused', { empireId, reason: 'no_capital' });
      return;
    }

    const want = Math.max(1, Number(params.count) || 1);
    let started = 0;
    const refused = [];
    try {
      for (const v of this.strandedWarshipsAwayFromHome(empireId)) {
        if (started >= want) break;
        const r = os.issueRecall(v.id, { homeSystemId, capitalBodyId });
        if (r?.ok) { started++; continue; }
        refused.push(`${v.id}:${r?.reason ?? 'unknown'}`);
      }
    } catch (e) {
      EventBus.emit('director:recallRefused',
        { empireId, reason: 'action_threw', detail: String(e?.message ?? e) });
      return;
    }

    if (refused.length > 0) {
      EventBus.emit('director:recallRefused', { empireId, reason: 'order_refused', detail: refused.join(', ') });
    }
    if (started > 0) {
      // Fakt goły — BEZ nazwy imperium i bez wpisu do Dziennika gracza. Powrót jest dla gracza
      // widoczny przez SKUTEK (wolna orbita), nie przez meldunek o cudzych rozkazach.
      EventBus.emit('director:recalled', {
        empireId, count: started, homeSystemId,
        year: ctx?.year ?? (window.KOSMOS?.timeSystem?.gameTime ?? 0),
      });
    }
  }
}

/**
 * Rejestracja nazw katalogowych. ⚠ MUSI biec PRZED `new DirectorSystem()` — konstruktor
 * rozwiązuje każdą nazwę z katalogu i RZUCA przy braku.
 *
 * ⚠ Reguła `recall_strike_force` NIE MA guardu (D-Z2-8) — także wojny. To jest zamierzone:
 * `war:peaceSigned` ma ZERO konsumentów, więc bez tego okupacja orbity gracza przeżywałaby
 * pokój. Zamiatanie po pokoju wychodzi tu za darmo.
 */
export function registerRecallBehaviors(instance, { allowOverride = false } = {}) {
  DirectorProbes.register('strandedWarshipsAwayFromHome',
    ({ empireId }) => instance.countStranded(empireId), { allowOverride });

  DirectorActions.register('recallVessels',
    (ctx, params) => instance.recallVessels(ctx, params), { allowOverride });
}

export default DirectorRecall;
