// DirectorMobilization — decyzja mobilizacyjna AI (WOJNA I POKÓJ 1.0, workstream B, W2-7).
//
// PO CO TEN PLIK ISTNIEJE. Po W2-2 każdy kadłub schodzący ze stoczni ląduje w REZERWIE, a po
// W2-4 wyjście z rezerwy kosztuje POP i trwa miesiąc. Gracz ma na to przycisk (W2-6); AI nie
// miało NIC — jego floty stały w magazynie bezterminowo. Ten plik jest brakującą decyzją:
// KIEDY obce imperium uznaje, że warto zdjąć ludzi z hali fabrycznej i obsadzić okręty.
//
// ── TRZY ZASADY, KTÓRE UKSZTAŁTOWAŁY TĘ REGUŁĘ ──────────────────────────────────────────────
//
//  1. ZERO AUTORSKICH PROGÓW (decyzja 22 planu W2). Nie zgadujemy „mobilizuj przy sile 0.8×",
//     bo takiej liczby nie da się dziś uzasadnić — strojenie należy do E7/BALANS, z macierzami
//     w ręku. Zamiast progu mamy PORÓWNANIE: mobilizuj, dopóki gracz ma w SŁUŻBIE więcej siły
//     niż my. Punkt równowagi (parytet) nie jest liczbą do wystrojenia, tylko własnością
//     modelu — i sam zatrzymuje wyścig, gdy imperium dogoni gracza.
//
//  2. AKCJA NIGDY NIE RZUCA. `AlienCivSystem` woła `tickEmpire` POZA własnym try/catch, a
//     `DirectorSystem._firePending` biegnie POZA per-regułowym try/catch. Wyjątek stąd zabiłby
//     tik KAŻDEGO imperium ustawionego po nas w pętli — razem z jego EconAI i MilitaryAI.
//     Dlatego wszystko jest w try/catch, a odmowy są RAPORTOWANE, nie rzucane.
//
//  3. MOBILIZACJA JEST WIDOCZNA (R-B: „mobilizacja to zdarzenie, nie cicha zmiana stanu").
//     Emitujemy `director:mobilized`, ale BEZ nazwy imperium w Dzienniku gracza — bramkę
//     jakości kontaktu zakłada `NotificationCenter`. Tu tylko fakt + audyt w `DebugLog`.
//
// ⚠ CO TA REGUŁA CELOWO POMIJA: KURIERY. Filtr `hasWeapons` przepuszcza wyłącznie okręty
//   bojowe, a kurier AI to `hull_small` z ładownią. Logistyka budzi się osobno, w miejscu
//   gdzie realnie utyka (`EmpireLogisticsSystem` — dispatch kuriera), bo tam jest ID statku
//   i tam widać, że coś nie ruszyło. Reguła nacisku nie jest miejscem na logistykę.

import { DirectorProbes, DirectorGuards, DirectorActions } from './DirectorRegistry.js';
import EventBus from '../../core/EventBus.js';
import { isEnemyVessel, hasWeapons, isInService } from '../../entities/Vessel.js';
import { PLAYER_OWNER_ID } from '../ThreatAssessment.js';

export class DirectorMobilization {
  /** Ciało stolicy imperium. Kanon: WYŁĄCZNIE przez `directorProduction.capitalOf`
   *  (ta sama definicja co produkcja i doktryny — inaczej „gdzie AI buduje" i „gdzie AI
   *  obsadza" rozjechałyby się po cichu). */
  _capitalBodyId(empireId) {
    const cap = window.KOSMOS?.directorProduction?.capitalOf?.(empireId);
    return cap?.planetId ?? null;
  }

  /**
   * Uzbrojone kadłuby imperium stojące w REZERWIE przy stolicy.
   * Lustro `DirectorDoctrine._idleArmedAtCapital`, z odwróconym filtrem służby — doktryna
   * bierze to, co JEST w służbie, mobilizacja to, co dopiero ma nią zostać. Rozłączne zbiory.
   */
  storedWarshipsAtCapital(empireId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return [];
    const capitalId = this._capitalBodyId(empireId);
    if (!capitalId) return [];
    const out = [];
    for (const v of vMgr._vessels.values()) {
      if (!v || v.isWreck) continue;
      if (!isEnemyVessel(v)) continue;                        // tylko kadłuby AI
      if ((v.ownerEmpireId ?? v.owner) !== empireId) continue;
      if (!hasWeapons(v)) continue;                           // kurier ma własną ścieżkę (patrz nagłówek)
      if (isInService(v)) continue;                           // już obsadzony
      if ((v.serviceState ?? 'active') === 'mobilizing') continue;   // przejście już trwa
      if (v.position?.dockedAt !== capitalId) continue;       // rezerwa TEJ stoczni
      out.push(v);
    }
    return out;
  }

  /** Sonda wyzwalacza: czy jest KOGO obsadzać. */
  countStoredWarshipsAtCapital(empireId) {
    return this.storedWarshipsAtCapital(empireId).length;
  }

  /**
   * Guard — odczyt `ThreatAssessment` BEZ ani jednej autorskiej stałej (zasada 1).
   *
   * „Gracz ma w SŁUŻBIE więcej niż my" — obie strony liczone tą samą miarą (`getStrength`,
   * czyli wyłącznie kadłuby obsadzone), więc rezerwa NIE liczy się żadnej ze stron. To jest
   * dokładnie sens rozdziału siła/potencjał z W2-2: magazyn nikogo nie odstrasza.
   *
   * Konsekwencje przyjęte świadomie: (a) gracz bez okrętów w służbie ⇒ nikt nie mobilizuje
   * (wzajemna deeskalacja — magazyny stoją po obu stronach); (b) po osiągnięciu parytetu
   * mobilizacja USTAJE sama, bez progu, który trzeba by stroić.
   */
  isOutgunnedByPlayer(empireId) {
    const ta = window.KOSMOS?.threatAssessment;
    if (!ta?.getStrength) return false;                       // brak modułu ⇒ brak decyzji (nie zgadujemy)
    return ta.getStrength(PLAYER_OWNER_ID) > ta.getStrength(empireId);
  }

  /**
   * Akcja `mobilizeVessels` — obsadź do `params.count` kadłubów z rezerwy stolicy.
   *
   * ⚠ Porcjami, nie hurtem. Mobilizacja podnosi `getStrength` imperium, a to jest LICZNIK
   *   `milRatio` w `AlienCivSystem` — opróżnienie magazynu w jednym kroku potrafiłoby
   *   przeskoczyć próg wojny w ciągu jednego roku cywilizacyjnego. Porcja + `roll` + cooldown
   *   rozkładają to na lata.
   * ⚠ Nigdy nie rzuca (zasada 2). Odmowa `deployVessel` jest zapisywana w `DebugLog`, bo dla
   *   AI nie ma żadnej innej powierzchni — inaczej „reguła odpaliła, nic się nie stało" byłoby
   *   nie do odróżnienia od „reguła nie odpaliła".
   */
  mobilizeVessels(ctx, params = {}) {
    const empireId = ctx?.empireId;
    const want = Math.max(1, Number(params.count) || 1);
    const vMgr = window.KOSMOS?.vesselManager;
    if (!empireId || !vMgr?.deployVessel) return;

    let started = 0;
    const refused = [];
    try {
      for (const v of this.storedWarshipsAtCapital(empireId)) {
        if (started >= want) break;
        const res = vMgr.deployVessel(v.id);
        if (res?.ok) { started++; continue; }
        refused.push(`${v.id}:${res?.reason ?? 'unknown'}`);
      }
    } catch (e) {
      // Ścieżka audytu, nie Dziennik gracza. `DebugLog` nie ma publicznego `push` — nasłuchuje
      // ZDARZEŃ (TRACKED_EVENTS), więc odmowa musi być zdarzeniem, żeby w ogóle istniała.
      EventBus.emit('director:mobilizeRejected', { empireId, reason: 'action_threw', detail: String(e?.message ?? e) });
      return;
    }

    // ⚠ Odmowa jest tu równie ważna jak sukces (audyt R12, wzór `director:flybyRejected`):
    //   dla AI nie ma ŻADNEJ innej powierzchni, więc bez tego „reguła odpaliła i nic się nie
    //   stało" byłoby nie do odróżnienia od „reguły nikt nie podłączył".
    if (refused.length > 0) {
      EventBus.emit('director:mobilizeRejected', { empireId, reason: 'deploy_refused', detail: refused.join(', ') });
    }

    if (started > 0) {
      // Fakt goły: BEZ nazwy imperium i bez wpisu do Dziennika. Bramkę jakości kontaktu
      // zakłada `NotificationCenter` — gate przy ODBIORCY, bo producentów może być więcej.
      EventBus.emit('director:mobilized', {
        empireId,
        count: started,
        year: ctx?.year ?? (window.KOSMOS?.timeSystem?.gameTime ?? 0),
      });
    }
  }
}

/**
 * Rejestracja nazw katalogowych. ⚠ MUSI biec PRZED `new DirectorSystem()` — konstruktor
 * rozwiązuje każdą nazwę z katalogu i RZUCA przy braku. `allowOverride` jak w pozostałych
 * rejestratorach (`registerDoctrineBehaviors`, `registerProductionGuards`).
 *
 * ⚠ `empireHasFreeCrew` NIE jest tu rejestrowany — istnieje od Slice'u 1 w
 * `DirectorProduction` (zarejestrowany, a do dziś nieużywany przez żadną regułę). W2-7 jest
 * jego pierwszym konsumentem; podwójna rejestracja RZUCIŁABY (rejestr zabrania kolizji nazw).
 */
export function registerMobilizationBehaviors(instance, { allowOverride = false } = {}) {
  DirectorProbes.register('storedWarshipsAtCapital',
    ({ empireId }) => instance.countStoredWarshipsAtCapital(empireId), { allowOverride });

  DirectorGuards.register('empireOutgunnedByPlayer',
    ({ empireId }) => instance.isOutgunnedByPlayer(empireId), { allowOverride });

  DirectorActions.register('mobilizeVessels',
    (ctx, params) => instance.mobilizeVessels(ctx, params), { allowOverride });
}

export default DirectorMobilization;
