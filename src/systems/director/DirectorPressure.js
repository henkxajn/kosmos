// DirectorPressure — nacisk militarny L1–L2 (workstream C, Slice 1, commit S6).
//
// Sonda strefy granicznej + akcja `pressureResponse`: incydent dyplomatyczny na kanale OPINII
// (nigdy napięcia) + obronna odpowiedź zbrojna z szablonów przez ścieżkę produkcji z GATE 1.
//
// ⚠ CZTERY RZECZY, KTÓRE POCHODZĄ Z AUDYTU I Z PODPISANYCH DECYZJI:
//
//  1. KANAŁ OPINII, NIGDY NAPIĘCIE (decyzja 7). `tension` prowadzi po drabinie 40/60/80 WPROST
//     do automatycznej wojny, a nacisk L1–L2 ma z definicji GROZIĆ, nie wypowiadać. Ten plik
//     NIE WOŁA `changeTension` ani niczego, co je rusza — pilnuje tego keeper wykonaniem.
//     L3 (Slice 2, z czasownikami D4) będzie tym, co dopiero ruszy napięcie.
//
//  2. NOWY TYP INCYDENTU, NIE REUŻYCIE `military_presence` (decyzja 7). `military_presence`
//     NALICZA SIĘ JUŻ SAM przy wejściu uzbrojonego statku do układu imperium
//     (`DiplomacySystem._onVesselArrived`), więc reużycie podwoiłoby karę za jeden czyn.
//     Rozłączność jest tu GEOGRAFICZNA, nie umowna: `military_presence` dotyczy przestrzeni
//     ROSZCZONEJ, a nacisk — wyłącznie POWŁOKI GRANICZNEJ, a `InfluenceMap` trzyma oba zbiory
//     rozłącznie z konstrukcji (`classifyGalaxy`). Guard `!isClaimedBy` stoi mimo to jako
//     obrona w głąb — jeden wiersz w panelu dyplomacji to punkt nienegocjowalny GATE 3.
//
//  3. ODPOWIEDŹ IDZIE ŚCIEŻKĄ EKONOMICZNĄ (R-1 „economy executes"), czyli tym samym
//     `queueWarships`, który przeszedł GATE 1 — z jego guardami (stocznia, żeton R-3, załoga,
//     komodyty) i jego diagnostyką. Director NIE spawnuje okrętów nacisku znikąd.
//
//  4. R-4 — ŚWIADOMA KONSEKWENCJA: w oknie przed `ion_drives` imperium NIE MA czym odpowiedzieć.
//     Wtedy incydent dyplomatyczny WYSTĘPUJE mimo to, a `queueWarships` mówi wprost, czego
//     zabrakło (`director:shipRejected` z `no_module`). „Nacisk bez odpowiedzi" jest uczciwy
//     technologicznie i NIE JEST CICHY — to jest różnica między „reguła odmówiła"
//     a „reguły nikt nie podłączył".

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { hasWeapons } from '../../entities/Vessel.js';
import { DirectorProbes, DirectorGuards, DirectorActions } from './DirectorRegistry.js';

/** Szablon obrony układu (bez skoku) — szczebel L1. */
const TEMPLATE_DEFENDER = 'frigate_system_defender';
/** Szablony zdolne do skoku — szczebel L2 („możemy przyjść do was"). */
const TEMPLATE_ROAMERS  = ['frigate_laser_escort', 'frigate_missile_escort'];

export class DirectorPressure {
  /**
   * Kształt `director.posture` PO restore (decyzja 7 — `GameState.restore` podmienia domenę
   * w całości; pusty domyślny kształt = warunek „v100 bez migracji").
   */
  static initSubdomain() {
    if (!gameState.get('director.posture')) gameState.set('director.posture', {}, 'director_init');
  }

  _require(name) {
    const dep = window.KOSMOS?.[name];
    if (!dep) throw new Error(`[DirectorPressure] brak kolaboratora \`window.KOSMOS.${name}\``);
    return dep;
  }

  // ── Sonda: uzbrojone statki GRACZA w powłoce granicznej imperium ──────────

  /**
   * Ile uzbrojonych statków gracza stoi w strefie GRANICZNEJ danego imperium.
   *
   * Liczymy OBECNOŚĆ, nie siłę — decyzja 5 („threat assessment zostaje poza Slice 1"): audyt R2
   * pokazał, że oba estymatory siły gracza są zepsute identycznie, a ich naprawa należy do
   * WAR_BACKBONE i mogłaby natychmiast wepchnąć imperia w AGGRESSIVE/WAR.
   */
  countArmedPlayerVesselsInBorder(empireId) {
    const imap = window.KOSMOS?.influenceMap;
    const vm   = window.KOSMOS?.vesselManager;
    if (!imap || !vm?.getAllVessels) return 0;

    let n = 0;
    for (const v of vm.getAllVessels()) {
      if (!v || v.isWreck) continue;
      // Statek GRACZA: brak właściciela albo jawne 'player' (kanon jak w ColonyManager).
      const owner = v.ownerEmpireId;
      if (owner && owner !== 'player') continue;
      if (!hasWeapons(v)) continue;                       // nacisk to OBECNOŚĆ ZBROJNA
      const sysId = v.systemId ?? 'sys_home';
      // ⚠ Rozłączność z `military_presence`: liczy się WYŁĄCZNIE powłoka graniczna.
      // Przestrzeń roszczona ma własny, już naliczany modyfikator (patrz nagłówek, punkt 2).
      if (imap.isClaimedBy(sysId, empireId)) continue;
      if (!imap.isInBorderZone(sysId, empireId)) continue;
      n++;
    }
    return n;
  }

  // ── AKCJA: odpowiedź na nacisk ────────────────────────────────────────────

  /**
   * @param {object} ctx    — kontekst reguły (`empireId`, `empire`, `year`, `ruleId`)
   * @param {{level?:number, count?:number}} params
   */
  pressureResponse(ctx, params = {}) {
    const { empireId, empire } = ctx;
    const level = Number(params.level ?? 1);
    const year  = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const seen  = this.countArmedPlayerVesselsInBorder(empireId);

    // 1. INCYDENT DYPLOMATYCZNY — zawsze, niezależnie od tego, czy imperium ma czym odpowiedzieć.
    //    Kanał OPINII (decyzja 7). Ani ta metoda, ani nic, co woła, nie rusza napięcia.
    const dipl = window.KOSMOS?.diplomacySystem;
    dipl?.addOpinionModifier?.(empireId, 'player', 'border_pressure', {
      source: `pressure_l${level}_${Math.round(year)}`,
    });
    dipl?.addMemory?.(empireId, 'border_pressure', { level, vessels: seen, year });

    // 2. POSTAWA OBRONNA — dane, nie render. Slice 2 może po tym sięgnąć; Slice 1 tylko zapisuje.
    gameState.set(`director.posture.${empireId}`, { level, sinceYear: year, vessels: seen }, 'director_posture');

    // 3. ODPOWIEDŹ ZBROJNA ścieżką z GATE 1. Może ODMÓWIĆ (brak techu/załogi/stoczni/żetonu) —
    //    i to jest dopuszczalny, UDOKUMENTOWANY wynik (R-4), nie awaria reguły.
    const prod = window.KOSMOS?.directorProduction;
    const results = [];
    if (prod?.queueWarships) {
      const count = Number(params.count ?? (level >= 2 ? 1 : 2));
      results.push(prod.queueWarships({ empireId, empire, ruleId: ctx.ruleId },
        { template: TEMPLATE_DEFENDER, count }));
      // L2 dokłada JEDEN okręt zdolny do skoku — „możemy przyjść do was".
      if (level >= 2) {
        results.push(prod.queueWarships({ empireId, empire, ruleId: ctx.ruleId },
          { template: this._pickRoamer(empireId, empire), count: 1 }));
      }
    }

    const queued = results.filter((r) => r?.ok).length;
    EventBus.emit('director:pressureIncident', {
      empireId, level, vessels: seen, queuedOrders: queued,
      refused: results.filter((r) => r && !r.ok).map((r) => r.reason),
    });
    return { level, seen, queued };
  }

  /**
   * Czy imperium jest GOTOWE na szczebel L2 — czyli czy L1 już wobec niego padł, i to
   * w POPRZEDNIM roku wyświetlanym.
   *
   * 🔴 DEFEKT Z GATE 3, naprawiony tutaj. L1 i L2 to dwie NIEZALEŻNE reguły katalogu
   * z NIEZALEŻNYMI rzutami, a `DirectorSystem` ocenia obie w każdym ticku. Nic nie wymagało,
   * żeby L1 padł pierwszy — więc przy ciężkim nacisku (≥3 okręty) L2 był uprawniony od
   * pierwszego tiku i wygrywał własny rzut ZANIM L1 zdążył trafić. Zmierzone: dla seedów
   * `emp_D` i `emp_G` PIERWSZY incydent imperium miał `level: 2`. Do tego obie reguły potrafiły
   * paść w TYM SAMYM roku, dając dwa incydenty za jedną sytuację.
   *
   * Inwariant (orzeczenie Filipa): **pierwszy incydent imperium ZAWSZE jest L1.**
   *
   * Warunek „w poprzednim roku" (a nie tylko „padł") załatwia oba objawy naraz: blokuje
   * podwójne odpalenie w jednym roku i wymusza, żeby nacisk PRZETRWAŁ do kolejnego roku,
   * zanim urośnie do L2. Ścieżki eskalacji NIE dotyka — `escalatesTo` jest rozstrzygane
   * wewnątrz oceny L1 i nie sprawdza guardów L2.
   *
   * Stan czytamy per (reguła, imperium) — klucz `military_pressure_l1|<empireId>` — więc
   * imperia są od siebie odizolowane z konstrukcji.
   */
  isEscalationReady(empireId, year) {
    const st = gameState.get(`director.rules.military_pressure_l1|${empireId}`);
    const last = st?.lastFiredYear;
    if (last == null) return false;                    // L1 nigdy nie padł → L2 niedostępny
    return Number(year) > Number(last);                // ten sam rok → jeszcze nie (bez dubla)
  }

  /**
   * Który roamer wybiera imperium na L2 — deterministycznie z osobowości i id.
   * Agresywne wolą rakiety (uderzenie), ostrożne lasery (obrona). Bez `Math.random`,
   * żeby przebieg gate'u był powtarzalny.
   */
  _pickRoamer(empireId, empire) {
    const aggr = Number(empire?.personality?.aggression ?? 0.5);
    if (aggr >= 0.6) return 'frigate_missile_escort';
    if (aggr <= 0.4) return 'frigate_laser_escort';
    let h = 0;
    for (const ch of String(empireId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return TEMPLATE_ROAMERS[h % TEMPLATE_ROAMERS.length];
  }
}

/** Rejestracja nazw (wzór `registerProductionGuards` / `registerFirstContactBehaviors`). */
export function registerPressureBehaviors(instance, { allowOverride = false } = {}) {
  DirectorProbes.register('armedPlayerVesselsInBorderZone',
    ({ empireId }) => instance.countArmedPlayerVesselsInBorder(empireId), { allowOverride });

  DirectorActions.register('pressureResponse',
    (ctx, params) => instance.pressureResponse(ctx, params), { allowOverride });

  // Bramka szczebla L2 — patrz `isEscalationReady`. Bez niej pierwszy incydent imperium
  // potrafił być L2 (zmierzone w GATE 3), bo obie reguły rzucają niezależnie.
  DirectorGuards.register('pressureEscalationReady',
    ({ empireId, year }) => instance.isEscalationReady(empireId, year), { allowOverride });

  // Guard czytelności: nacisk nie ma sensu wobec imperium, z którym już trwa wojna —
  // wtedy obecność zbrojna nie jest „naciskiem", tylko po prostu wojną.
  DirectorGuards.register('empireNotAtWarWithPlayer', ({ empireId }) => {
    const dipl = window.KOSMOS?.diplomacySystem;
    if (!dipl) throw new Error('[DirectorPressure] brak `window.KOSMOS.diplomacySystem`');
    return dipl.getStatus(empireId) !== 'war';
  }, { allowOverride: true });   // współdzielony z S5 — override świadomy, ta sama semantyka
}
