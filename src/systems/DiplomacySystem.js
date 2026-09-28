// DiplomacySystem — relacje gracz ↔ obce imperia (WOJNA I POKÓJ 1.0, faza D1).
//
// FASADA: polityka + zdarzenia. Stan trzyma RelationsModel (jedyny pisarz
// gameState.diplomacy.relations), reputację ReputationLedger, matematykę OpinionMath,
// a wartości/tempa/etykiety katalog OpinionModifierData. Zewnętrzni wołający NIE
// dotykają surowego rekordu — dostają wartości albo projekcję (listPlayerRelations).
//
// DWIE OSIE, obie na parze:
//   opinia   — „co o was myślimy": Σ modyfikatorów, LICZONA, nigdy nie zapisywana,
//              z gotowym rozbiciem dla UI. Zastąpiła dawny skalar `trust`.
//   napięcie — „jak blisko wojny": dawny `hostility` 1:1, ta sama drabina
//              40 ostrzeżenie / 60 ultimatum / 80 auto-wojna i ten sam decay −5/rok cyw.
//
// Klucz pary: id posortowane leksykalnie, sklejone '__' ('emp_003__player').
// Schemat gotowy na pary AI↔AI (D5) — D1 nie tworzy żadnej.
//
// Intent methods (WYŁĄCZNE mutacje relacji):
//   changeTension / addOpinionModifier / removeOpinionModifier / addMemory
//   declareWar / offerPeace / signTreaty / breakTreaty
//
// Automatyczne reguły (handlery EventBus) — bez zmian względem stanu sprzed D1:
//   colony:founded / outpost:founded w systemie imperium → +30 napięcia
//   observatory:discovered w systemie imperium         → +10 napięcia (raz na imperium)
//   vessel:arrived w systemie imperium                 → modyfikator opinii wg typu statku
//   tick 1 rok cyw.: modyfikatory (ramp/decay) → reputacja → wygasłe rozejmy →
//                    decay napięcia → wygaśnięcie ultimatum → zaleganie w obcej przestrzeni

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { hasWeapons, canDoScience, canDoEnvoy, isEnemyVessel } from '../entities/Vessel.js';
import { TREATY_TYPES } from '../data/TreatyData.js';
import { t } from '../i18n/i18n.js';
import { RelationsModel } from './diplomacy/RelationsModel.js';
import { ReputationLedger } from './diplomacy/ReputationLedger.js';
import { AcceptanceEngine } from './diplomacy/AcceptanceEngine.js';
import { visibleBreakdown, refusalWindowYears } from '../utils/AcceptanceMath.js';
import {
  VERB_ACCEPTANCE, TERRITORIAL_MAX_SHARE,
  NON_VERB_COOLDOWN_YEARS, AI_PEACE_OFFER_COOLDOWN_KEY,
} from '../data/AcceptanceWeightData.js';
// WP-3 — czysta re-walidacja warunków pokoju (zero importów, świat wstrzykiwany).
import { planCessions, PLAYER_SIDE } from '../utils/CessionPlan.js';
import { TENSION_THRESHOLDS, crossedUp } from '../utils/OpinionMath.js';
import {
  OPINION_MODIFIERS, OPINION_HOSTILE_MAX, OPINION_FRIENDLY_MIN, TRUCE_YEARS, CB_MEMORY_WINDOW,
} from '../data/OpinionModifierData.js';

// Id gracza jako strony relacji (dosłowne, nie prefiks).
const PLAYER = 'player';

// Progi drabiny — z OpinionMath, żeby model i fasada nie rozjechały się liczbami.
const WARNING_THRESHOLD   = TENSION_THRESHOLDS.warning;
const ULTIMATUM_THRESHOLD = TENSION_THRESHOLDS.ultimatum;
const WAR_THRESHOLD       = TENSION_THRESHOLDS.war;

// Decay napięcia podczas pokoju + ile lat ciszy go odblokowuje. OBA w latach
// WYŚWIETLANYCH (D2/E6 — jedna jednostka dla całej dyplomacji).
// ⚠ NIE bramkowane flagą diplomacyDecay — to stara mechanika, nie nowy silnik, więc
// tempo jest tu ŻYWE i musi zostać odczuwalnie NIETKNIĘTE (zawężona decyzja 3).
// Dlatego 5,0/rok cyw. → 60,0/rok wyświetlany: to nie przyspieszenie, to TA SAMA
// prędkość w nowej jednostce (60 × 1/12 = 5 na krok kadencji). Zmierzone: napięcie
// 30 → 0 zajmuje 0,5 roku wyświetlanego przed i po (probe-diplomacy-time-units §C).
const PEACE_DECAY       = 60.0;
// Cisza wymagana przed wznowieniem decayu — od zawsze porównywana z `_year()`, czyli
// od zawsze w latach WYŚWIETLANYCH (komentarz milczał o jednostce). Wartość bez zmian.
const PEACE_QUIET_YEARS = 2.0;

// Czas na reakcję po ultimatum. ⚠ Komentarz mówił „lata cyw." i KŁAMAŁ: porównanie
// jedzie przez `_year()` = `gameTime`, więc to od zawsze były lata WYŚWIETLANE
// (3 wyświetlane = 36 cyw.). E6 poprawia opis, wartości NIE rusza — mechanizm jest żywy.
const ULTIMATUM_GRACE_YEARS = 3.0;

// Napięcie, do którego schodzi relacja po zawarciu rozejmu.
const TRUCE_TENSION_CAP = 30;

// Kara za zaleganie statku badawczego w obcym układzie — co ile lat naliczana.
// ⚠ Komentarz mówił „lat cyw." i KŁAMAŁ: i stempel (`entry.year`), i porównanie jadą
// przez `_year()`, więc to od zawsze był 1 rok WYŚWIETLANY (= 12 cyw.). Opis poprawiony,
// wartość nietknięta (mechanizm żywy).
const TRESPASS_YEARS = 1.0;

// Traktat → modyfikator opinii, który z nim żyje i z nim ginie. Wyprowadzone
// z katalogu, żeby dodanie kolejnego traktatu-z-modyfikatorem nie wymagało edycji tutaj.
const TREATY_TO_MODIFIER = Object.fromEntries(
  Object.values(OPINION_MODIFIERS).filter(m => m.treatyId).map(m => [m.treatyId, m.id]),
);

// Klucz i18n pre-warunku → string powodu w zdarzeniu `diplomacy:treatyRejected`.
// Dwie pierwsze wartości są DAWNE i słuchacze na nich stoją (UIManager pomija log dla
// `already_signed`, DiplomacyOverlay pomija flash). Pozostałe dwa powody istniały
// w silniku od E1/E2, ale nie miały jak wyjść — mapowanie zwijało je do `at_war`.
const REJECT_REASON_BY_KEY = {
  'diplo.reject.alreadySigned': 'already_signed',
  'diplo.reject.atWar':         'at_war',
  'diplo.reject.notAtWar':      'not_at_war',
  'diplo.reject.natureForbids': 'nature_forbids',
  // WP-2 — dwa powody terytorialne. Bez wiersza tutaj nowa blokada meldowałaby się
  // słuchaczom jako generyczne 'blocked' i gracz nie wiedziałby, CO odrzucono.
  'diplo.reject.capitalNotNegotiable':   'capital_not_negotiable',
  'diplo.reject.territoryNotNegotiable': 'territory_not_negotiable',
  // WP-3 — odmowy RE-WALIDACJI (bramka wykonania, nie bramka silnika D2).
  'diplo.reject.cessionTermsStale': 'cession_terms_stale',
  'diplo.reject.cessionHomeWorld':  'cession_home_world',
};

export class DiplomacySystem {
  constructor() {
    this._tickAccum = 0;
    // Transient tracker zalegania (vesselId → {systemId, year}); NIE serializowany.
    this._trespassTracking = new Map();

    this.relations  = new RelationsModel();
    this.reputation = new ReputationLedger();

    EventBus.on('colony:founded',  ({ colony }) => this._onColonyFounded(colony, 'colony'));
    EventBus.on('outpost:founded', ({ colony }) => this._onColonyFounded(colony, 'outpost'));
    EventBus.on('observatory:discovered', ({ body }) => this._onObservatoryScan(body));

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      // ── D2/E6 — JEDYNY punkt konwersji jednostek w całej dyplomacji ──────────
      // KADENCJA zostaje 1 rok CYWILIZACYJNY (12× na rok wyświetlany) — dzięki temu
      // rozdzielczość jest drobna, a `_tickTrespassing`/`_tickUltimatumExpiry`/
      // `_tickTruces` (od zawsze na zegarze WYŚWIETLANYM) nie tracą reaktywności.
      // Zmienia się wyłącznie JEDNOSTKA `dy` podawanej konsumentom TEMP: od E6 wszystkie
      // tempa dyplomacji są „na rok WYŚWIETLANY" — ten sam zegar, który widzi gracz
      // (`timeSystem.gameTime`) i którym mierzą TRUCE_YEARS / RECENT_REFUSAL_YEARS /
      // ERRATIC_EPOCH_YEARS. Wzór konwersji: `DepositReadoutLogic` (dzielenie przez
      // CIV_TIME_SCALE poza widokiem).
      const dy = steps / GAME_CONFIG.CIV_TIME_SCALE;   // lata WYŚWIETLANE
      // Modyfikatory starzeją się PRZED handlerami, które je dodają — świeży wpis
      // nie może zanikać w tym samym ticku, w którym powstał.
      this.relations.tickModifiers(dy);
      this.reputation.tick(dy);
      this._tickTruces();
      // Kolejność decay → ultimatum → zaleganie zachowana ze stanu sprzed D1.
      this._tickTensionDecay(dy);
      this._tickUltimatumExpiry();
      this._tickTrespassing();
    });

    // Nowe imperium → relacja peace/napięcie 0 + wpis reputacji.
    EventBus.on('empire:created', ({ empireId }) => {
      if (!empireId) return;
      this.relations.ensure(PLAYER, empireId);
      this.reputation.ensure(empireId);
    });

    // Pierwszy kontakt: zapewnij relację (opinia 0 = dawny neutralny trust 50).
    EventBus.on('intel:contactEstablished', ({ empireId }) => {
      if (empireId) this.relations.ensure(PLAYER, empireId);
    });

    EventBus.on('vessel:arrived', ({ vessel, mission }) => this._onVesselArrived(vessel, mission));
  }

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  // ── Odczyt: opinia ────────────────────────────────────────────────────────

  /** Opinia `ofId` o `aboutId` (−100..+100). Brak relacji → 0. */
  getOpinion(ofId, aboutId) { return this.relations.getOpinion(ofId, aboutId); }

  /** Opinia imperium O GRACZU — kierunek, który bramkuje akceptacje. */
  getOpinionOfPlayer(empireId) { return this.relations.getOpinion(empireId, PLAYER); }

  /** Rozbicie opinii do UI: [{ id, label, labelKey, value, yearsLeft, persistent }]. */
  getOpinionBreakdown(ofId, aboutId) {
    return this.relations.getBreakdown(ofId, aboutId)
      .map(e => ({ ...e, label: t(e.labelKey) }));
  }

  /**
   * Pasmo statusu relacji: hostile / neutral / friendly / ally.
   * Progi to lustro dawnych progów trustu (≤29 / ≥65) przesunięte o −50;
   * „sojusznik" nadal WYŁĄCZNIE z traktatu, nie z liczby (dawny BUG5).
   */
  getOpinionBand(empireId) {
    if (this.hasTreaty(empireId, 'alliance')) return 'ally';
    const op = this.getOpinionOfPlayer(empireId);
    if (op <= OPINION_HOSTILE_MAX)  return 'hostile';
    if (op >= OPINION_FRIENDLY_MIN) return 'friendly';
    return 'neutral';
  }

  // ── MOSTEK D2 `getTrustEquivalent` — USUNIĘTY w E3 ──
  // Tłumaczył opinię na skalę dawnego trustu (0-100, 50 = neutralnie), żeby progi
  // akceptacji dawały przed i po D1 ten sam wynik. Konsumentów ubywało kolejno:
  // E2 zdjął `proposeTreaty`, `DiplomacyOverlay` i zrzut `GameScene.debug` (czwarte
  // wywołanie, o którym plan nie wiedział — mówił o trzech), E3 zdejmuje ostatni:
  // bramkę AI-envoy w `AlienCivSystem`, która czyta teraz opinię wprost.
  // Warunek zamknięcia D2 (`grep -rn "getTrustEquivalent" src/` puste) — spełniony.

  // ── Odczyt: napięcie / status / pamięć ────────────────────────────────────

  getTension(empireId) { return this.relations.getTension(PLAYER, empireId); }
  getStatus(empireId)  { return this.relations.getStatus(PLAYER, empireId); }

  /**
   * Ile lat WYŚWIETLANYCH zostało rozejmu (0 = brak rozejmu / już wygasł).
   * ⚠ Docstring mówił „lat cyw." i kłamał od D1 — liczy się z `_year()` = `gameTime`.
   */
  getTruceYearsLeft(empireId) {
    const until = this.relations.getTruceUntilYear(PLAYER, empireId);
    if (until == null) return 0;
    return Math.max(0, until - this._year());
  }

  /**
   * Ile lat WYŚWIETLANYCH zostało z łaski po ultimatum (0 = brak ultimatum / już minęła).
   * Istnieje, żeby `ULTIMATUM_GRACE_YEARS` miało JEDNEGO właściciela: panel liczył ten
   * licznik z wklejonego literału `3`, czyli z drugiej, niepowiązanej kopii stałej —
   * przestrojenie łaski rozjechałoby UI z silnikiem po cichu.
   */
  getUltimatumYearsLeft(empireId) {
    const rel = this.relations.getOrNull(PLAYER, empireId);
    if (rel?.ultimatumStartYear == null) return 0;
    return Math.max(0, (rel.ultimatumStartYear + ULTIMATUM_GRACE_YEARS) - this._year());
  }

  /** Ostatnie `limit` wpisów pamięci relacji (dowody dla casus belli i UI). */
  getMemory(empireId, limit = CB_MEMORY_WINDOW) {
    return this.relations.getMemory(PLAYER, empireId, limit);
  }

  getReputation(id) { return this.reputation.get(id); }

  // ── Odczyt: projekcje list (UI) ───────────────────────────────────────────

  /**
   * Relacje gracza jako PROJEKCJA — świadomie nie surowy rekord, żeby jego kształt
   * pozostał prywatny (audyt R9/R12) i żeby pary AI↔AI z D5 nie wyciekły tu przypadkiem.
   */
  listPlayerRelations() {
    return this.relations.listPairsWith(PLAYER).map((rel) => {
      const empireId = rel.a === PLAYER ? rel.b : rel.a;
      return {
        empireId,
        opinion:            this.relations.getOpinion(empireId, PLAYER),
        tension:            rel.tension ?? 0,
        status:             rel.status ?? 'peace',
        truceYearsLeft:     this.getTruceYearsLeft(empireId),
        treaties:           rel.treaties ?? [],
        memory:             rel.memory ?? [],
        ultimatumStartYear: rel.ultimatumStartYear ?? null,
      };
    });
  }

  /** Jak wyżej, ale tylko imperia o intelu ≥ rumor (ukrywa nieodkryte). */
  listVisiblePlayerRelations() {
    const intelSys = window.KOSMOS?.intelSystem;
    return this.listPlayerRelations()
      .filter(r => (intelSys ? intelSys.isAtLeast(r.empireId, 'rumor') : true));
  }

  // ── Mutacje: opinia ───────────────────────────────────────────────────────

  /**
   * Dodaje/odświeża modyfikator opinii. Braki uzupełnia katalog; tryb łączenia
   * (refresh / accumulate) też stamtąd. @returns {number} nowa opinia.
   */
  addOpinionModifier(ofId, aboutId, modId, opts = {}) {
    const opinion = this.relations.addModifier(ofId, aboutId, modId, opts);
    EventBus.emit('diplomacy:opinionChanged', {
      ofId, aboutId, modId, value: opts.value ?? OPINION_MODIFIERS[modId]?.defaultValue,
      opinion, reason: opts.source ?? '',
    });
    return opinion;
  }

  removeOpinionModifier(ofId, aboutId, modId) {
    const removed = this.relations.removeModifier(ofId, aboutId, modId);
    if (removed) {
      EventBus.emit('diplomacy:opinionChanged', {
        ofId, aboutId, modId, value: 0, opinion: this.relations.getOpinion(ofId, aboutId), reason: 'removed',
      });
    }
    return removed;
  }

  // ── Mutacje: napięcie + drabina eskalacji ────────────────────────────────

  /**
   * Port dawnego changeHostility 1:1 — te same progi, te same skutki, ta sama
   * kolejność (stan wojny ustawiany PRZED zrywaniem traktatów, żeby re-entrantne
   * changeTension z breakTreaty trafiło na idempotentny guard).
   */
  changeTension(empireId, delta, reason = '') {
    if (!delta) return;
    const oldT = this.getTension(empireId);
    const newT = Math.max(0, Math.min(100, oldT + delta));
    if (newT === oldT) return;
    this.relations.setTension(PLAYER, empireId, newT, `tension_${delta > 0 ? '+' : ''}${delta}_${reason}`);
    const status = this.getStatus(empireId);

    EventBus.emit('diplomacy:relationChanged', { empireId, tension: newT, status, delta, reason });

    // Eskalacja tylko przy WZROŚCIE napięcia.
    if (delta <= 0) return;
    if (crossedUp(oldT, newT, WARNING_THRESHOLD)) {
      EventBus.emit('diplomacy:warning', { empireId, tension: newT, reason });
      this.addMemory(empireId, 'warning_issued', { reason });
    }
    if (crossedUp(oldT, newT, ULTIMATUM_THRESHOLD) && status !== 'war') {
      this.relations.setUltimatumStart(PLAYER, empireId, this._year(), 'ultimatum_start');
      EventBus.emit('diplomacy:ultimatum', { empireId, tension: newT, graceYears: ULTIMATUM_GRACE_YEARS, reason });
      this.addMemory(empireId, 'ultimatum_issued', { reason });
    }
    if (crossedUp(oldT, newT, WAR_THRESHOLD) && status !== 'war') {
      this.declareWar(empireId, 'hostility_threshold');
    }
  }

  // ── Mutacje: pamięć ───────────────────────────────────────────────────────

  addMemory(empireId, type, payload = {}) {
    return this.relations.addMemory(PLAYER, empireId, type, payload);
  }

  // ── Mutacje: wojna i pokój ────────────────────────────────────────────────

  declareWar(empireId, reason = '') {
    if (this.getStatus(empireId) === 'war') return false;
    // Pakt o nieagresji blokuje wojnę z inicjatywy AI/auto (gracz może mimo to).
    if (reason !== 'player_action' && this.hasTreaty(empireId, 'non_aggression')) return false;

    // Stan wojny NAJPIERW — idempotentny guard dla re-entrantnego changeTension.
    this.relations.setStatus(PLAYER, empireId, 'war', {}, `war_declared_${reason}`);
    this.relations.setTension(PLAYER, empireId, Math.max(this.getTension(empireId), WAR_THRESHOLD), 'war_declared');
    this.relations.setUltimatumStart(PLAYER, empireId, null, 'war_declared');
    this.addMemory(empireId, 'war_declared', { reason });

    // Wojna zrywa WSZYSTKIE traktaty (każde zerwanie dokłada +15 napięcia).
    for (const tr of [...this.relations.getTreaties(PLAYER, empireId)]) this.breakTreaty(empireId, tr.id);

    // Dawniej: „wojna zeruje trust" (bezpowrotnie). Teraz trwały modyfikator, zdejmowany
    // przy pokoju — relacje mogą się odbudować, zamiast zostać na zawsze na zerze.
    this.addOpinionModifier(empireId, PLAYER, 'at_war', { source: `war_${reason}` });

    EventBus.emit('diplomacy:warDeclared', { empireId, reason });
    EventBus.emit('diplomacy:relationChanged', { empireId, tension: this.getTension(empireId), status: 'war', reason });
    return true;
  }

  /**
   * Ocena propozycji pokoju BEZ jej składania. Główny term to `war_status`:
   * wyczerpanie obu stron kontra `casusBelli.peaceCost` — pole, które do D2 nie miało
   * w kodzie ANI JEDNEGO czytelnika. Casus belli wybrał `inferCasusBelli` z okna
   * CB_MEMORY_WINDOW pamięci relacji (D1/C-3), więc cena pokoju wynika z tego,
   * co się między nami DZIAŁO, a nie z parametru wojny wziętego znikąd.
   *
   * WP-2 — `terms` to WARUNKI propozycji ({ cessions: [{ bodyId, fromEmpireId, toEmpireId }] }).
   * Parametr jest OPCJONALNY i domyślnie `null`, więc wszyscy dotychczasowi wołający zostają
   * bez zmian, a silnik dla propozycji bez cesji nie wykonuje ANI JEDNEGO dodatkowego odczytu
   * świata (regresja zero z konstrukcji — patrz `AcceptanceEngine._buildTermsContext`).
   *
   * @param {string} empireId
   * @param {Object|null} [terms] — warunki terytorialne albo null
   */
  evaluatePeace(empireId, terms = null) {
    return this._acceptance().evaluateProposal(PLAYER, empireId, { verb: 'offer_peace', terms });
  }

  /** Ocena przyjęcia delegacji. Cel MOŻE odmówić — pierwszy raz w historii gry. */
  evaluateEnvoy(empireId) {
    return this._acceptance().evaluateProposal(PLAYER, empireId, { verb: 'improve_relations' });
  }

  /**
   * D2/E4 — stempluje świeżą odmowę, przez co term `recent_refusal` przechodzi
   * UNFED → LIVE. To JEDYNY pisarz `verbCooldowns`; ewaluator i wagi stoją od E1
   * i do tej pory czytały pusty obiekt.
   *
   * Wołane WYŁĄCZNIE po odmowie OCENIONEJ. Blokada pre-warunku (trwa wojna, traktat
   * już podpisany) świadomie NIE stempluje: nikt nas nie odrzucił, propozycja w ogóle
   * nie doszła do oceny, a karanie za nią kaskadowałoby absurdem (nie można prosić
   * o sojusz w czasie wojny ⇒ kara za próbę ⇒ trudniej o sojusz po wojnie).
   *
   * @param {string} empireId
   * @param {string} verb — id czasownika z VERB_ACCEPTANCE (traktaty = ich własne id)
   */
  noteRefusal(empireId, verb) {
    return this.relations.noteVerbRefusal(PLAYER, empireId, verb);
  }

  /** Rok ostatniej odmowy czasownika albo null — dla UI („spróbuj ponownie za…"). */
  getRefusedYear(empireId, verb) {
    return this.relations.getVerbRefusedYear(PLAYER, empireId, verb);
  }

  /**
   * Ile lat GRY świeża odmowa jeszcze obciąża ten czasownik albo blokuje ponowną próbę
   * (0 = już nie). Liczone TUTAJ, bo okno mieszka w katalogu wag, którego UI nie
   * importuje (pin P14). Modal odmowy i przycisk pokoju zamieniają to na licznik lat —
   * bez tego gracz dostaje blokadę, nie wiedząc, jak długo potrwa.
   *
   * ⚠ WP-4 / C4: okno jest PER CZASOWNIK (`refusalCooldownYears`; D-WP-4 dał
   *   `offer_peace` jeden rok zamiast dwóch). Rachunek reużywa `refusalWindowYears` —
   *   tej samej funkcji, z której czyta ewaluator termu.
   */
  getRefusalYearsLeft(empireId, verb) {
    const year = this.getRefusedYear(empireId, verb);
    if (year == null) return 0;
    return Math.max(0, (year + refusalWindowYears(this._cooldownCfg(verb))) - this._year());
  }

  /**
   * Konfiguracja OKNA dla klucza księgi cooldownów — jedna ścieżka odczytu dla obu rodzin.
   *
   * Księga `verbCooldowns` trzyma rok zdarzenia dla czasowników (odmowa propozycji) ORAZ dla
   * kluczy nie-czasownikowych (WP-4 / C3: cooldown depeszy pokojowej AI). Te drugie nie mają
   * progu ani wag, więc nie mogą mieszkać w `VERB_ACCEPTANCE` — mają własną, płaską mapę
   * okien. Nieznany klucz ⇒ `null` ⇒ `refusalWindowYears` daje `RECENT_REFUSAL_YEARS`.
   */
  _cooldownCfg(verb) {
    if (VERB_ACCEPTANCE[verb]) return VERB_ACCEPTANCE[verb];
    const years = NON_VERB_COOLDOWN_YEARS[verb];
    return years == null ? null : { refusalCooldownYears: years };
  }

  /**
   * Ile lat GRY AI milczy po odpowiedzianej depeszy pokojowej (0 = może prosić znów).
   *
   * ⚠ ISTNIEJE, ŻEBY KLUCZ NIE WYCIEKŁ Z FASADY. Pin P14 (`acceptance_engine_smoke`)
   *   dopuszcza import modułów `Acceptance*` WYŁĄCZNIE w tym pliku, a klucz i okno depeszy
   *   mieszkają w katalogu wag. `WarSystem` (który decyduje, kiedy wysłać depeszę) i panel
   *   depeszy (który ją zamyka) pytają więc TUTAJ, zamiast trzymać trzecią i czwartą kopię
   *   literału `ai_peace_offer`.
   */
  getAiPeaceOfferCooldown(empireId) {
    return this.getRefusalYearsLeft(empireId, AI_PEACE_OFFER_COOLDOWN_KEY);
  }

  /**
   * Depesza pokojowa ODPOWIEDZIANA (odrzucona albo skierowana do stołu) — zapisz cooldown.
   *
   * ⚠ NIE dotyka `offer_peace`: odmowa CUDZEJ oferty nie jest spamowaniem własnym
   *   przyciskiem. Przyjęcie oferty i zamknięcie bez odpowiedzi cooldownu NIE zapisują
   *   (podpis D-WP-3) — inaczej gracz płaciłby za cudzy ruch, a AI nie mogłoby poprosić
   *   znów, gdy jego własna oferta straciła ważność w drodze.
   */
  noteAiPeaceOfferAnswered(empireId) {
    return this.noteRefusal(empireId, AI_PEACE_OFFER_COOLDOWN_KEY);
  }

  /**
   * Czy świeża odmowa tego czasownika kosztuje PUNKTY, czy tylko blokuje ponowną próbę.
   *
   * ⚠ WŁASNOŚĆ CZASOWNIKA, NIE PARY — i to jest zmierzone, nie założone: `resolveWeights`
   *   mnoży wagę przez nadpisania archetypu i celu, a 0 jest pochłaniające
   *   (0 × cokolwiek = 0), więc waga wyzerowana w KATALOGU nie wróci dla żadnej pary.
   *   Dlatego brak tu argumentu `empireId` i dlatego nie ma go po co dokładać.
   *
   * Istnieje dla modalu odmowy: po D-WP-4 `offer_peace` NIC nie obciąża, więc zdanie
   * „świeża odmowa obciąża kolejną próbę" byłoby tam po prostu nieprawdą. Nieznany
   * czasownik ⇒ `false`: nie udajemy kary, której katalog nie zna (dotyczy klucza
   * `ai_peace_offer`, którym C3 zapisuje cooldown depeszy AI).
   */
  isRefusalPenalised(verb) {
    return (Number(VERB_ACCEPTANCE[verb]?.terms?.recent_refusal) || 0) !== 0;
  }

  /**
   * Wiersze rozbicia warte pokazania graczowi (bez zerowych wkładów) — projekcja dla UI.
   *
   * ⚠ ISTNIEJE PO TO, ŻEBY UI NIE IMPORTOWAŁO `AcceptanceMath`. Pin P14 w
   * `acceptance_engine_smoke` trzyma import silnika WYŁĄCZNIE w tym pliku, a modal
   * odmowy (E4) potrzebuje dokładnie tego jednego filtra. Skopiowanie predykatu do UI
   * dałoby drugą definicję „co warto pokazać" — a to jest decyzja modelu (K-2/K-5:
   * wiersz o wartości 0 udaje działającą mechanikę), nie decyzja panelu.
   */
  getVisibleBreakdown(result) {
    return visibleBreakdown(result?.breakdown ?? []);
  }

  /**
   * WP-4 (C1) — PROJEKCJA STOŁU POKOJU dla panelu Wojny: co da się ZAŻĄDAĆ, co da się
   * ZAOFEROWAĆ, ile to warte i gdzie stoi sufit. Lustro `getVisibleBreakdown`: panel nie
   * importuje silnika, a decyzja „ile co jest warte" zostaje w jednym miejscu.
   *
   * ⚠ ISTNIEJE Z POWODU PINU P14, nie z wygody. `acceptance_engine_smoke` trzyma import
   *   `Acceptance*` — RÓWNIEŻ `AcceptanceWeightData.js` — wyłącznie w tym pliku. Panel nie
   *   może więc ani zaimportować `TERRITORIAL_BASE_VALUE`, ani policzyć `colonyDevScore`:
   *   pierwsze łamie pin, drugie tworzy DRUGĄ definicję wyceny obok silnika.
   *
   * ⚠ WYCENA NIE JEST TU LICZONA. Budujemy propozycję ze WSZYSTKICH kandydujących ciał
   *   i czytamy gotowy snapshot `_buildTermsContext` (`ctx.terms`) — ten sam, którym ocenia
   *   się realną propozycję. Dzięki temu „ile to boli" i „co widzi gracz" nie mogą się
   *   rozjechać (keeper T1 pinuje to RÓWNOŚCIĄ WYKONANIOWĄ, nie obietnicą).
   *
   * ⚠ DWA ŹRÓDŁA ZNACZNIKA `capital`, i to jest konieczne: silnik liczy `capital` wyłącznie
   *   wobec OCENIAJĄCEGO (`_capitalBodyIdOf(K, toId)`), więc dla ciał GRACZA wracałoby zawsze
   *   `false`. Dom gracza bierzemy z `colony.isHomePlanet` — tego SAMEGO pola, którym kanon
   *   silnika rozwiązuje dom gracza. Jedno pole, dwie ścieżki odczytu, nie dwie definicje.
   *
   * ⚠ `countsToCeiling` to LUSTRO pre-warunku `territorial_ceiling` (własne, nie-odbite ciała
   *   oceniającego). Panel sumuje tę flagę i NIE zna reguły; keeper T3 pinuje równoważność
   *   „suma > ceiling ⟺ blokada `territoryNotNegotiable`", więc zmiana reguły w silniku
   *   zapala czerwone światło tutaj, a nie po cichu rozjeżdża pasek w UI.
   *
   * ⚠ KOSZTOWNE (czyta kolonie, księgę zdobyczy, opinię, siłę) — wołający MUSI cache'ować.
   *   `WarOverlay` przelicza przy otwarciu / zmianie wojny / zmianie zaznaczenia / roku ≥ 1,
   *   NIGDY w `draw()`.
   *
   * @param {string} empireId
   * @returns {{ demand: Array, offer: Array, heldValue: number|null, ceiling: number|null }}
   */
  getPeaceTable(empireId) {
    const K = window.KOSMOS;
    const colMgr = K?.colonyManager;
    const reg = K?.empireRegistry;
    const empty = { demand: [], offer: [], heldValue: null, ceiling: null };
    if (!colMgr || !reg || !empireId) return empty;

    const aiCols = reg.getColoniesByEmpire?.(empireId) ?? [];
    const plCols = colMgr.getPlayerColonies?.() ?? [];
    const aiIds = aiCols.map(c => c?.planetId).filter(Boolean);
    const plIds = plCols.map(c => c?.planetId).filter(Boolean);
    if (aiIds.length === 0 && plIds.length === 0) return empty;

    const cessions = [
      ...aiIds.map(bodyId => ({ bodyId, fromEmpireId: empireId, toEmpireId: PLAYER })),
      ...plIds.map(bodyId => ({ bodyId, fromEmpireId: PLAYER, toEmpireId: empireId })),
    ];
    const ctx = this._acceptance().buildContext(PLAYER, empireId, { verb: 'offer_peace', terms: { cessions } });
    const rows = ctx?.terms?.cessions ?? [];
    const heldValue = ctx?.terms?.heldValue ?? null;
    const playerHomeId = plCols.find(c => c?.isHomePlanet)?.planetId ?? null;

    // Nazwa: WŁASNE ciało nazywa się kolonią gracza, CUDZE — samym ciałem. Nie pokazujemy
    // graczowi nazwy, którą wróg nadał swojej koloni (ta sama polityka co odznaki na mapie).
    const nameOf = (bodyId, own) => (own ? colMgr.getColony?.(bodyId)?.name : null)
      ?? EntityManager.get(bodyId)?.name ?? bodyId;

    const decorate = (r) => {
      const own = r.fromEmpireId === PLAYER;
      return {
        bodyId:          r.bodyId,
        name:            nameOf(r.bodyId, own),
        devValue:        r.devValue,
        capital:         own ? (r.bodyId != null && r.bodyId === playerHomeId) : r.capital === true,
        recaptured:      r.recaptured === true,
        countsToCeiling: !own && r.recaptured !== true,
      };
    };

    return {
      demand:    rows.filter(r => r.fromEmpireId === empireId).map(decorate),
      offer:     rows.filter(r => r.fromEmpireId === PLAYER).map(decorate),
      heldValue,
      ceiling:   heldValue == null ? null : TERRITORIAL_MAX_SHARE * heldValue,
    };
  }

  /**
   * Propozycja pokoju — D2/E3: PIERWSZE W HISTORII sprawdzenie (audyt R5).
   *
   * Do tej pory `offerPeace` ustawiał rozejm bezwarunkowo: jedyną bramką było „trwa wojna".
   * Teraz decyduje silnik, a `casusBelli.peaceCost` wreszcie coś kosztuje — wojna
   * eksterminacyjna (peaceCost 100) jest praktycznie nie do zakończenia rozmową, dokładnie
   * jak opisuje ją katalog.
   *
   * ⚠ HISTORIA, KTÓRA JUŻ SIĘ ZAMKNĘŁA — i trzeba ją znać, czytając `playerInitiated`.
   *   Do D2/E3 „exhaustion 100 ⇒ pokój" było obejściem; E3 zamienił je w propozycję jak
   *   każdą inną (wyczerpanie = WIELKI TERM, nie bypass). W WP-4 auto-pokój PRZESTAŁ
   *   ISTNIEĆ PO OBU STRONACH: C3 zamienił gałąź AI na depeszę do gracza, a C5 gałąź
   *   gracza na jeden meldunek („czas rozważyć pokój"). Skutek dla TEJ metody: od C5
   *   `playerInitiated: false` NIE MA ŻADNEGO produkcyjnego wołającego — zmierzone.
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.playerInitiated=true] — czy to ŚWIADOMA propozycja gracza.
   *   Jedna flaga, dwie konsekwencje (bo obie wynikają z tego samego faktu):
   *     1. tylko świadoma propozycja STEMPLUJE `recent_refusal`,
   *     2. tylko świadoma propozycja zasługuje na modal odmowy (E4 czyta to z payloadu).
   *
   *   ⚠ PO C5 `false` NIE MA PRODUKCYJNEGO WOŁAJĄCEGO (zmierzone: jedynym był
   *   `WarSystem` w gałęzi gracza, usunięty w C5). Kontrakt ZOSTAJE, bo opisuje regułę,
   *   nie jednego klienta: propozycja, której gracz nie złożył świadomie, nie ma prawa
   *   ani stemplować cooldownu, ani pauzować gry modalem. Pinują go testy
   *   (`acceptance_refusal_smoke` R3/R4). Powód historyczny, wart zapamiętania: gdy
   *   auto-pokój ponawiał się przy KAŻDEJ bitwie, stemplowanie dałoby parze w praktyce
   *   STAŁE −20 na `offer_peace` i zakleszczyłoby wojnę. Od C4 ta kara i tak jest zerowa
   *   (D-WP-4), a cooldown trwa rok — ale reguła „nieświadoma propozycja nie stempluje"
   *   jest szersza niż okoliczności, które ją wymusiły.
   *
   * @param {boolean} [opts.stampRefusal=playerInitiated] — czy ocena odmowna ma zapisać
   *   cooldown (D-WP-16). OSOBNA dźwignia od `playerInitiated`, choć domyślnie ta sama
   *   wartość: propozycja może być w pełni świadoma (modal, rozbicie, wpis pamięci)
   *   i JEDNOCZEŚNIE nie zasługiwać na cooldown. Tego potrzebuje przyjęcie oferty pokoju
   *   OD AI: gracz nie spamuje przyciskiem, tylko odpowiada na depeszę, a gdy świat zdążył
   *   się zmienić i ocena wypadnie odmownie, blokowanie mu WŁASNEGO przycisku byłoby karą
   *   za cudzą propozycję.
   */
  offerPeace(empireId, reason = '', {
    playerInitiated = true, terms = null, stampRefusal = playerInitiated,
  } = {}) {
    if (this.getStatus(empireId) !== 'war') return false;

    const result = this.evaluatePeace(empireId, terms);

    // WP-2 — BLOKADA PRE-WARUNKU. Lustro `proposeTreaty` (ta sama gałąź, ten sam powód):
    // blokada NIE jest odmową ocenianą punktami, więc nie stempluje `recent_refusal` ani nie
    // zapisuje `peace_refused` — nikt nas nie odrzucił, propozycja w ogóle nie doszła do oceny.
    // ⚠ Do WP-2 ta gałąź BYŁA NIEOSIĄGALNA (jedynym pre-warunkiem pokoju był `at_war`, a wyżej
    //   stoi wczesny `return` na braku wojny) i dlatego jej BRAK nie bolał. Sufit cesji czyni
    //   ją osiągalną PO RAZ PIERWSZY — utwardzenie wchodzi w tym samym commicie, co jego powód.
    if (result.blocked) {
      EventBus.emit('diplomacy:peaceRejected', { empireId, reason, result, playerInitiated });
      return false;
    }

    if (!result.decision) {
      this.addMemory(empireId, 'peace_refused', { reason });
      // WP-4 / C4: stempel ZOSTAJE, ale od D-WP-4 jest zapisem COOLDOWNU, nie kary
      // punktowej (waga `recent_refusal` dla pokoju = 0). `stampRefusal` — patrz D-WP-16.
      if (stampRefusal) this.noteRefusal(empireId, 'offer_peace');
      EventBus.emit('diplomacy:peaceRejected', { empireId, reason, result, playerInitiated });
      return false;
    }

    // ⚠ WP-3 — RE-WALIDACJA PRZED JAKĄKOLWIEK MUTACJĄ (D-WP-9 = ABORT, fail-closed).
    //   Akceptacja AI dotyczyła PEŁNEGO zestawu warunków; wykonanie „części" podpisałoby
    //   pokój na warunkach, których nikt nie zaakceptował. Powód jedzie KANAŁEM BLOKADY
    //   (`result.blocked` + `reasonKey`), bo modal odmowy renderuje wyłącznie
    //   `result.reasonKey` — inaczej gracz zobaczyłby „nieznany powód".
    //   Stempla NIE ma z tego samego powodu co przy blokadzie: nikt nas nie odrzucił.
    const plan = planCessions(terms?.cessions, this._cessionWorld(empireId));
    if (!plan.ok) {
      EventBus.emit('diplomacy:peaceRejected', {
        empireId, reason, playerInitiated,
        result: {
          verb: result.verb, fromId: result.fromId, toId: result.toId, threshold: result.threshold,
          score: 0, decision: false, blocked: true, reasonKey: plan.reasonKey,
          breakdown: [], counterHint: null,
        },
      });
      return false;
    }

    // ⚠ WP-3 — WYKONANIE PRZED ZAMKNIĘCIEM WOJNY (D-WP-11). Wojna zamyka się dopiero na
    //   `emit('diplomacy:peaceSigned')` (`WarSystem._onPeaceSigned` → `active:false`), a księga
    //   zdobyczy zapisuje WYŁĄCZNIE przy aktywnej wojnie. ZMIERZONE: cesja przed emitem daje
    //   wpis `via:'cession'`, po emicie — ZERO wpisów. To nie jest kwestia gustu.
    this._executeCessions(plan.steps);

    const until = this._year() + TRUCE_YEARS;
    this.relations.setStatus(PLAYER, empireId, 'truce', { truceUntilYear: until }, `peace_${reason}`);
    this.relations.setTension(PLAYER, empireId, Math.min(this.getTension(empireId), TRUCE_TENSION_CAP), 'peace');
    // Koniec strzelaniny: at_war ustępuje miejsca śladowi po wojnie.
    this.removeOpinionModifier(empireId, PLAYER, 'at_war');
    this.addOpinionModifier(empireId, PLAYER, 'recent_war', { source: `peace_${reason}` });
    this.addMemory(empireId, 'peace_offered', { reason });

    // ⚠ WP-3 — WYMUSZONY NAP (D-WP-1 + D-WP-10): każdy pokój niesie pakt o nieagresji.
    //   `signTreaty` jest czystym mutatorem — ŚWIADOMIE omija ocenę D2, bo to WARUNEK
    //   pokoju, nie propozycja do rozważenia. Idempotentny: `addTreaty` odrzuca duplikat id.
    //   ⚠ Co to realnie daje (ZMIERZONE): NAP BRAMKUJE `declareWar` z inicjatywy AI/auto,
    //     czego rozejm dziś NIE robi. Gracza nie wiąże (`player_action` omija bramkę) —
    //     złamanie kosztuje +15 napięcia przez `breakTreaty`. Czas trwania: DS-1.
    this.signTreaty(empireId, TREATY_TYPES.non_aggression);

    EventBus.emit('diplomacy:peaceSigned', { empireId, reason, result });
    EventBus.emit('diplomacy:relationChanged', { empireId, tension: this.getTension(empireId), status: 'truce', reason });
    return true;
  }

  /**
   * WP-3 — świat dla czystej re-walidacji (`CessionPlan.planCessions`). JEDYNE miejsce,
   * które dla cesji dotyka żywych systemów; sama reguła zostaje czysta i node-testowalna.
   *
   * ⚠ NORMALIZACJA WŁAŚCICIELA: kolonia gracza ma `ownerEmpireId === null`, a księga zdobyczy
   *   i propozycje mówią stringiem `'player'`. Tłumaczymy TUTAJ, żeby `planCessions`
   *   porównywał wyłącznie stringi (ten sam kanon co `WarSystem._recordCapture`).
   */
  _cessionWorld(empireId) {
    const K = () => window.KOSMOS;
    return {
      sides: [PLAYER, empireId],
      ownerOf: (bodyId) => {
        const col = K()?.colonyManager?.getColony?.(bodyId);
        if (!col) return null;                          // ciało bez kolonii — nie ma czego oddawać
        return col.ownerEmpireId ?? PLAYER_SIDE;
      },
      isHomeBody: (bodyId, ownerId) => {
        if (ownerId === PLAYER_SIDE) {
          return !!K()?.colonyManager?.getColony?.(bodyId)?.isHomePlanet;
        }
        // Kanon stolicy AI — ten sam, którego używa WP-2, produkcja, doktryny i mobilizacja.
        return K()?.directorProduction?.capitalOf?.(ownerId)?.planetId === bodyId;
      },
    };
  }

  /**
   * WP-3 — wykonanie cesji istniejącą mechaniką zmiany rąk. Wołane WYŁĄCZNIE po udanej
   * re-walidacji i WYŁĄCZNIE przy wciąż aktywnej wojnie (patrz D-WP-11 w `offerPeace`).
   *
   * ⚠ KIERUNEK NIE JEST SYMETRYCZNY I TO JEST ZMIERZONE, NIE STYLISTYCZNE:
   *   AI→gracz  → `captureColonyForPlayer`, bo TYLKO ona woła `EmpireRegistry.removeColony`;
   *   gracz→AI  → `transferColony`, bo gracz nie ma wpisu w rejestrze imperiów.
   *   Użycie `transferColony(bodyId, null)` dla kierunku AI→gracz zostawiłoby oddane ciało
   *   w `emp.colonies` (ZMIERZONE) — a `heldValue` i `capitalOf` z WP-2 czytają
   *   dokładnie tę listę, więc AI liczyłoby do swojej puli ciało, którego już nie ma.
   *
   * ⚠ `reason: 'cession'` jest NOŚNY: `CAPTURE_VIA_BY_REASON` mapuje go na `via:'cession'`
   *   w księdze zdobyczy, a narracja (toast / dzwonek / Dziennik) rozgałęzia się na nim, żeby
   *   cesja nie dziedziczyła czerwonego alarmu „Kolonia utracona".
   */
  _executeCessions(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return;
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    for (const step of steps) {
      if (!step.toPlayer) this._undockOwnFleet(step.bodyId);
      if (step.toPlayer) colMgr.captureColonyForPlayer?.(step.bodyId, 'cession');
      else               colMgr.transferColony?.(step.bodyId, step.to, 'cession');
    }
  }

  /**
   * WP-3 / D-WP-12 — flota GRACZA zadokowana przy oddawanym ciele wychodzi na orbitę.
   *
   * ⚠ BEZ TEGO CESJA NISZCZY FLOTĘ. `transferColony` kasuje każdy statek z hangaru w stanie
   *   `docked` (ZMIERZONE: 2/2 zniszczone) — przy desancie to jest poprawne, przy podpisie
   *   pokoju byłoby ukrytą ceną, której gracz nigdzie nie widzi. `undockToOrbit` to istniejące
   *   API (trzech wołających w UI), instant, bez paliwa; po nim statek ma `orbiting`, więc
   *   `transferColony` go pomija, a `VesselManager` re-homuje go na `colony:captured` (W3-1).
   *
   * ⚠ WYPYCHAMY WYŁĄCZNIE FLOTĘ GRACZA. Cudzy statek zadokowany przy tym samym ciele ginie
   *   jak dotąd — cesja jest umową o terytorium, nie amnestią dla obcych hangarów.
   */
  _undockOwnFleet(bodyId) {
    const K = window.KOSMOS;
    const vm = K?.vesselManager;
    const fleet = K?.colonyManager?.getColony?.(bodyId)?.fleet;
    if (!vm || !Array.isArray(fleet)) return;
    for (const vesselId of [...fleet]) {
      const v = vm.getVessel?.(vesselId);
      if (!v || v.position?.state !== 'docked') continue;
      if (isEnemyVessel(v)) continue;
      vm.undockToOrbit?.(vesselId);
    }
  }

  // ── Mutacje: traktaty ─────────────────────────────────────────────────────

  hasTreaty(empireId, treatyId) { return this.relations.hasTreaty(PLAYER, empireId, treatyId); }

  /** Hook handlu cross-empire — czy obowiązuje umowa handlowa. */
  hasTradeAgreement(empireId) { return this.hasTreaty(empireId, 'trade_agreement'); }

  signTreaty(empireId, treaty) {
    if (!this.relations.addTreaty(PLAYER, empireId, treaty)) return false;
    // Traktat ze sprzężonym modyfikatorem (umowa handlowa → trade_partner, narastający).
    const modId = TREATY_TO_MODIFIER[treaty.id];
    if (modId) this.addOpinionModifier(empireId, PLAYER, modId, { source: `treaty_${treaty.id}` });
    EventBus.emit('diplomacy:treatyOffered', { empireId, treaty });
    return true;
  }

  breakTreaty(empireId, treatyId) {
    if (!this.relations.removeTreaty(PLAYER, empireId, treatyId)) return false;
    // Modyfikator żyje tak długo jak traktat — razem z nim przepada narosła wartość.
    const modId = TREATY_TO_MODIFIER[treatyId];
    if (modId) this.removeOpinionModifier(empireId, PLAYER, modId);
    this.changeTension(empireId, +15, 'treaty_broken');
    return true;
  }

  /**
   * Silnik akceptacji — JEDEN na system, tworzony leniwie.
   *
   * ⚠ Kolaboratorzy wstrzykiwani PROXY, nie odczytem `window.KOSMOS.diplomacySystem`:
   * ten system JEST systemem dyplomacji, więc szukanie siebie w globalu byłoby
   * niepotrzebnym punktem awarii (kolejność wpięcia, testy z własnym stubem).
   * Reszta kolaboratorów leci przez getter, więc nadal jest leniwa.
   */
  _acceptance() {
    if (!this._acceptanceEngine) {
      const self = this;
      this._acceptanceEngine = new AcceptanceEngine({
        get diplomacySystem() { return self; },
        get empireRegistry()  { return window.KOSMOS?.empireRegistry; },
        get warSystem()       { return window.KOSMOS?.warSystem; },
        get timeSystem()      { return window.KOSMOS?.timeSystem; },
        get galaxyData()      { return window.KOSMOS?.galaxyData; },
        // W1-3 — źródło siły dla termu `relative_power`. ⚠ Ta lista jest BIAŁĄ LISTĄ, nie
        // przezroczystym proxy na window.KOSMOS: pominięcie klucza NIE rzuca, tylko sprawia,
        // że `buildContext` widzi `undefined` i wstrzykuje `strength: null` — term degraduje
        // do zera i całe odblokowanie z W1-3 jest martwe, po cichu. Dokładnie tak się stało
        // przy pierwszym podejściu; złapał to `acceptance_relpower_smoke` T5.
        get threatAssessment(){ return window.KOSMOS?.threatAssessment; },
        // WP-2 — źródła WARUNKÓW TERYTORIALNYCH: wycena ciał i pula oddawalna
        // (`colonyManager`) oraz kanon ciała domowego (`directorProduction.capitalOf`).
        // ⚠ DRUGI RAZ TA SAMA PUŁAPKA, o której ostrzega komentarz wyżej: bez tych dwóch
        //   wierszy `_buildTermsContext` widzi `undefined`, więc KAŻDE ciało wycenia się na
        //   samo TERRITORIAL_BASE_VALUE, pula schodzi do `null` (sufit przestaje blokować),
        //   a stolica przestaje być rozpoznawana — cały D-WP-8 umiera PO CICHU, przy zielonych
        //   testach czystego silnika. Złapał to keeper WP-2 (T12c/T12d), tak jak W1-3 złapał
        //   `acceptance_relpower_smoke` T5.
        get colonyManager()   { return window.KOSMOS?.colonyManager; },
        get directorProduction(){ return window.KOSMOS?.directorProduction; },
      });
    }
    return this._acceptanceEngine;
  }

  /**
   * Ocena propozycji BEZ jej składania — dla UI (dostępność przycisku) i dla AI.
   * Zwraca pełny wynik silnika razem z rozbiciem; nic nie zmienia.
   */
  evaluateTreaty(empireId, treatyId) {
    return this._acceptance().evaluateProposal(PLAYER, empireId, { verb: treatyId });
  }

  /**
   * Gracz proponuje traktat — D2/E2: decyzję podejmuje Acceptance Engine.
   *
   * Zniknęły stąd inline'owe progi 60/75/80 ORAZ mostek `getTrustEquivalent`; twarde
   * bramki (wojna, traktat już podpisany) są teraz PRE-WARUNKAMI czasownika, więc
   * istnieje jedno miejsce, w którym „nie" ma powód. Powody odmowy zachowują dawne
   * stringi (`at_war` / `already_signed` / `declined`), bo słuchacze ich używają;
   * NOWE jest `breakdown` w zdarzeniu odmowy — E4 rysuje z niego modal.
   *
   * ⚠ PARYTET: dla obu archetypów, które gra faktycznie generuje (industrialist i jego
   * klon expansionist), granice decyzji wypadają DOKŁADNIE na dawnych progach —
   * opinia 10 / 25 / 30. Rozbieżności dla innych wektorów osobowości są zmierzone
   * i opisane w raporcie E2 (macierz z E7); w skrócie: sumy ważonej nie da się
   * dopasować do dawnej KONIUNKCJI dwóch bramek bez zgniecenia wszystkich pozostałych
   * termów do szumu.
   */
  proposeTreaty(empireId, treatyId) {
    const def = TREATY_TYPES[treatyId];
    if (!def) return false;

    const result = this.evaluateTreaty(empireId, treatyId);

    if (result.blocked) {
      // Mapowanie klucza pre-warunku na string powodu (kontrakt słuchaczy).
      //
      // ⚠ E4: było `reasonKey === alreadySigned ? 'already_signed' : 'at_war'` — ternary
      // bez trzeciej gałęzi, więc KAŻDA inna blokada meldowała się jako „trwa wojna".
      // Dotąd niewidoczne: podłoga osobowości była nieosiągalna klikiem (przycisk wyszarzony,
      // bo bramka pytała silnik o decyzję). Flip przycisków z tego commitu ją odsłania,
      // więc diagnostyka musi odtwarzać REALNĄ ścieżkę decyzyjną, a nie jej skrót.
      // Dawne wartości (`already_signed`, `at_war`) zachowane co do znaku — słuchacze
      // rozpoznają je bez zmian.
      const reason = REJECT_REASON_BY_KEY[result.reasonKey] ?? 'blocked';
      EventBus.emit('diplomacy:treatyRejected', { empireId, treatyId, reason, result });
      return false;
    }
    if (result.decision) {
      this.signTreaty(empireId, { id: treatyId });
      EventBus.emit('diplomacy:treatyAccepted', { empireId, treatyId, result });
      return true;
    }
    // Odmowa OCENIONA (nie blokada pre-warunku wyżej) → stempel na `recent_refusal`.
    this.noteRefusal(empireId, treatyId);
    EventBus.emit('diplomacy:treatyRejected', { empireId, treatyId, reason: 'declined', result });
    return false;
  }

  // ── Automatyczne handlery ─────────────────────────────────────────────────

  /**
   * Kolonia/placówka założona w cudzym układzie → +30 napięcia i wpis pamięci.
   *
   * ⚠ D2/E8 — BRAMKA WŁAŚCICIELA (przeniesione z D1, gdzie było poza zakresem jako zmiana
   * zachowania). `colony:founded` / `outpost:founded` lecą dla KAŻDEJ kolonii, także dla
   * kolonii imperiów AI — a ten handler przypisywał każde takie założenie GRACZOWI
   * (`reason: player_${kind}_in_their_space`) i podbijał napięcie na parze gracz↔właściciel
   * układu. Skutki były dwa, oba bezpodstawne: kolonizacja AI w cudzym układzie podnosiła
   * napięcie GRACZA wobec właściciela, a kolonizacja AI we WŁASNYM układzie podnosiła
   * napięcie gracza wobec tego samego imperium (bo `empireId` wychodził na samego siebie).
   * Gracz nie zrobił nic w obu przypadkach.
   *
   * Predykat jest lustrem `ColonyManager.isPlayerColony` (kolonie gracza mają
   * `ownerEmpireId` null/undefined albo jawnie 'player'). Świadomie NIE importujemy
   * `ColonyManager` — systemy komunikują się przez EventBus/`window.KOSMOS`, a to jest
   * dwuwierszowy warunek, nie logika warta cross-importu.
   *
   * Ścieżka AI↔AI (napięcie MIĘDZY imperiami po kolonizacji) należy do **D5**, gdzie pary
   * AI↔AI w ogóle powstają — tutaj byłaby zapisem do relacji, której nikt nie tworzy
   * (podpisana decyzja 5 fazy).
   */
  _onColonyFounded(colony, kind) {
    if (!colony?.planetId) return;
    const owner = colony.ownerEmpireId;
    if (owner && owner !== PLAYER) return;
    const body = EntityManager.get(colony.planetId);
    if (!body?.systemId) return;
    const empireId = window.KOSMOS?.galaxyData?.systems?.find(s => s.id === body.systemId)?.empireId;
    if (!empireId) return;
    this.changeTension(empireId, +30, `player_${kind}_in_their_space`);
    this.addMemory(empireId, 'territorial_violation', { planetId: colony.planetId, systemId: body.systemId, kind });
  }

  _onObservatoryScan(body) {
    if (!body?.systemId) return;
    const empireId = window.KOSMOS?.galaxyData?.systems?.find(s => s.id === body.systemId)?.empireId;
    if (!empireId) return;
    // +10 tylko raz na imperium — inaczej każdy kolejny skanowany obiekt nabijałby napięcie.
    const seen = this.relations.getMemory(PLAYER, empireId, Infinity).some(i => i.type === 'surveillance_scan');
    if (seen) return;
    this.changeTension(empireId, +10, 'observatory_scan');
    this.addMemory(empireId, 'surveillance_scan', { systemId: body.systemId });
  }

  /** Statek gracza wszedł do układu obcego imperium → modyfikator opinii wg typu. */
  _onVesselArrived(vessel, mission) {
    if (!GAME_CONFIG.FEATURES?.lightDiplomacy) return;
    if (!vessel) return;
    const isPlayer = (vessel.ownerEmpireId == null || vessel.ownerEmpireId === PLAYER);
    if (!isPlayer) return;
    const empireId = this._resolveArrivalEmpire(vessel, mission);
    if (!empireId) return;

    // Emisariusz obsłużony przez misję (abstrakcyjną) — bez kary tutaj.
    if (canDoEnvoy(vessel)) return;

    if (hasWeapons(vessel)) {
      this.addOpinionModifier(empireId, PLAYER, 'military_presence', { source: `vessel_${vessel.id}` });
      this.addMemory(empireId, 'military_presence', { vesselId: vessel.id });
    } else if (canDoScience(vessel)) {
      this.addOpinionModifier(empireId, PLAYER, 'research_intrusion', { source: `vessel_${vessel.id}` });
      this.addMemory(empireId, 'research_intrusion', { vesselId: vessel.id });
      const sysId = this._resolveArrivalSystemId(vessel, mission);
      if (sysId) this._trespassTracking.set(vessel.id, { systemId: sysId, year: this._year() });
    }
    // cargo / inne → bez kary
  }

  _resolveArrivalSystemId(vessel, mission) {
    if (vessel?.systemId) return vessel.systemId;
    const targetId = mission?.targetId;
    if (targetId) {
      const body = EntityManager.get(targetId);
      if (body?.systemId) return body.systemId;
    }
    return null;
  }

  _resolveArrivalEmpire(vessel, mission) {
    const sysId = this._resolveArrivalSystemId(vessel, mission);
    if (!sysId) return null;
    return window.KOSMOS?.galaxyData?.systems?.find(s => s.id === sysId)?.empireId ?? null;
  }

  _tickTrespassing() {
    if (!GAME_CONFIG.FEATURES?.lightDiplomacy) return;
    if (this._trespassTracking.size === 0) return;
    const vMgr = window.KOSMOS?.vesselManager;
    const currentYear = this._year();
    for (const [vesselId, entry] of [...this._trespassTracking]) {
      const vessel = vMgr?.getVessel?.(vesselId);
      if (!vessel || vessel.isWreck ||
          (vessel.systemId ?? 'sys_home') !== entry.systemId ||
          vessel.position?.state !== 'orbiting') {
        this._trespassTracking.delete(vesselId);
        continue;
      }
      if ((currentYear - entry.year) >= TRESPASS_YEARS && canDoScience(vessel)) {
        const empireId = window.KOSMOS?.galaxyData?.systems?.find(s => s.id === entry.systemId)?.empireId;
        if (empireId) {
          this.addOpinionModifier(empireId, PLAYER, 'trespassing', { source: `vessel_${vesselId}` });
          this.addMemory(empireId, 'trespassing', { vesselId });
        }
        entry.year = currentYear;   // nalicz raz na okres
      }
    }
  }

  // ── Tickery ───────────────────────────────────────────────────────────────

  /**
   * Wygasłe rozejmy → pokój. Naprawa audytu R7: dotąd 'truce' był stanem
   * TERMINALNYM, więc decay napięcia zamierał na zawsze po pierwszej wojnie.
   */
  _tickTruces() {
    for (const { a, b } of this.relations.tickTruces(this._year())) {
      const empireId = a === PLAYER ? b : a;
      this.relations.setStatus(PLAYER, empireId, 'peace', {}, 'truce_expired');
      // Ślad po wojnie — zwykle dołożony już przy offerPeace; „if absent" łapie
      // rozejmy ze starych zapisów, które nigdy przez tamtą ścieżkę nie przeszły.
      if (!this.relations.hasModifier(empireId, PLAYER, 'recent_war')) {
        this.addOpinionModifier(empireId, PLAYER, 'recent_war', { source: 'truce_expired' });
      }
      EventBus.emit('diplomacy:relationChanged', {
        empireId, tension: this.getTension(empireId), status: 'peace', delta: 0, reason: 'truce_expired',
      });
    }
  }

  /** @param {number} dy — lata WYŚWIETLANE od ostatniego wywołania (D2/E6). */
  _tickTensionDecay(dy) {
    const currentYear = this._year();
    for (const rel of this.relations.listPairsWith(PLAYER)) {
      if (rel.status !== 'peace') continue;
      const lastMemoryYear = (rel.memory ?? []).at(-1)?.year ?? null;
      if (lastMemoryYear != null && (currentYear - lastMemoryYear) < PEACE_QUIET_YEARS) continue;
      if ((rel.tension ?? 0) <= 0) continue;
      const empireId = rel.a === PLAYER ? rel.b : rel.a;
      this.changeTension(empireId, -PEACE_DECAY * dy, 'peace_decay');
    }
  }

  _tickUltimatumExpiry() {
    const currentYear = this._year();
    for (const rel of this.relations.listPairsWith(PLAYER)) {
      if (rel.status === 'war') continue;
      if (rel.ultimatumStartYear == null) continue;
      if (currentYear - rel.ultimatumStartYear < ULTIMATUM_GRACE_YEARS) continue;
      const empireId = rel.a === PLAYER ? rel.b : rel.a;
      if ((rel.tension ?? 0) >= ULTIMATUM_THRESHOLD && !this.hasTreaty(empireId, 'non_aggression')) {
        this.declareWar(empireId, 'ultimatum_expired');
      } else {
        // Napięcie spadło LUB chroni pakt o nieagresji → anuluj ultimatum.
        this.relations.setUltimatumStart(PLAYER, empireId, null, 'ultimatum_expired_cooled');
      }
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  /** Dopasuj relacje i reputację do istniejących imperiów (po restore lub spawnie). */
  initForAllEmpires() {
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return;
    const ids = reg.listAll().map(e => e.id);
    for (const id of ids) this.relations.ensure(PLAYER, id);
    // ⚠ Konieczne: GameState.restore() merguje tylko klucze najwyższego poziomu,
    // więc zapis sprzed istnienia pod-klucza `reputation` wraca bez niego.
    this.reputation.initForIds(ids);
  }
}
