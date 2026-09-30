// AcceptanceEngine — JEDEN ewaluator każdej propozycji dyplomatycznej
// (WOJNA I POKÓJ 1.0, faza D2, commit E1).
//
// Koniec „always yes" (audyt §4.5, R5): każda propozycja — w OBU kierunkach, gracz↔AI
// i docelowo AI↔AI — przechodzi przez to samo sito i zwraca ROZBICIE, które UI renderuje
// dosłownie. Silnik wie, JAK oceniać; nie wie, czym jest sojusz.
//
// ⚠ E1 NIE JEST WPIĘTY. Nic w src/systems ani src/ui tego jeszcze nie importuje — dokładnie
// jak C1 w D1. Retrofit trzech traktatów to E2, pokój i emisariusz to E3.
//
// Podział odpowiedzialności fazy D2:
//   AcceptanceWeightData.js  → dane (termy, wagi, progi, nadpisania) — BALANS TYLKO TAM
//   AcceptanceMath.js        → matematyka (sumowanie, rozbicie, próg, counterHint)
//   AcceptanceEngine.js      → ewaluatory termów + budowa kontekstu (TEN plik)
//
// ⚠ DWUCZĘŚCIOWOŚĆ JEST CELOWA. `evaluateWithContext(ctx)` jest CZYSTA — dostaje gotowy
// snapshot i nie dotyka niczego żywego, więc smoke testuje silnik bez atrapy przeglądarki.
// Cała nieczystość (odczyt window.KOSMOS) siedzi w `buildContext`. Term NIGDY nie dostaje
// kolaboratora, tylko dane — inaczej „czysty" test badałby atrapy, a nie logikę.
//
// ⚠ GŁOŚNA AWARIA (audyt R12): brak DiplomacySystem / EmpireRegistry przy budowie kontekstu
// RZUCA. To nie jest stan gry, tylko błąd wpięcia. Systemy OPCJONALNE (WarSystem — bo pokój
// bez wojny nie istnieje, TimeSystem, galaxyData) degradują się do udokumentowanej wartości.

import {
  ACCEPTANCE_TERMS, VERB_ACCEPTANCE, PRECONDITIONS,
  ARCHETYPE_WEIGHT_OVERRIDES, OBJECTIVE_WEIGHT_OVERRIDES,
  MEMORY_EVIDENCE_WEIGHTS, THIRD_PARTY_WEIGHTS,
  OFFER_HALF_KR, ERRATIC_EPOCH_YEARS, MEMORY_WINDOW,
  TERRITORIAL_BASE_VALUE, TERRITORIAL_HALF, TERRITORIAL_RECAPTURE_MULT,
  TERRITORIAL_FATIGUE_RELIEF, TERRITORIAL_MAX_SHARE,
} from '../../data/AcceptanceWeightData.js';
import {
  clampUnit, diminishingReturns, noiseUnit, hashStringToInt,
  resolveWeights, buildAcceptanceBreakdown, sumScore, decide, counterHintFor,
  refusalWindowYears,
} from '../../utils/AcceptanceMath.js';
// Czyste dane (plik bez importów) — statyczny import NIE psuje czystości modułu.
// To jest miejsce, w którym `peaceCost` dostaje swojego PIERWSZEGO czytelnika w kodzie.
import { CASUS_BELLI } from '../../data/CasusBelliData.js';
// WP-R — czas blokady zbrojeń. ⚠ Plik balansu dyplomacji jest CZYSTYMI DANYMI (zero importów),
// więc statyczny import nie psuje czystości modułu — ten sam argument, co przy `CASUS_BELLI`
// wyżej. Termin mieszka tam, gdzie `NAP_YEARS` i `TRUCE_YEARS` (D-WPR-2), a nie w katalogu wag.
import { REPARATIONS_YEARS } from '../../data/OpinionModifierData.js';
// W1-3 — JEDNA formuła przewagi siły, wspólna z doktrynami (czysty util, nie system).
import { relativePowerRaw } from '../../utils/ThreatMath.js';
// WP-2 — JEDNA miara rozwoju ciała, wspólna ze strefami wpływów (wariant C planu).
import { colonyDevScore } from '../../utils/ColonyDevScore.js';

// Środek skali osi osobowości — brak osi / brak imperium ma dawać wkład 0, nie karę.
const PERSONALITY_NEUTRAL = 0.5;

// WP-2 — id strony GRACZA. Silnik jest SYMETRYCZNY (ocenia i gracz, i AI), więc potrzebuje
// własnego miejsca na ten literał. DiplomacySystem ma swój PLAYER, ale to FASADA
// gracz-centryczna — import stamtąd odwróciłby zależność (silnik nie zna fasady).
const PLAYER_ID = 'player';

// ── Rejestr termów ──────────────────────────────────────────────────────────
//
// Term = CZYSTA funkcja (ctx, verbCfg) → raw ∈ −1..+1. Znak wyniku niesie sam term
// TAM, gdzie kierunek jest jego własnością (opinia, reputacja); tam, gdzie kierunek
// zależy od czasownika (napięcie), term zwraca wielkość 0..+1, a znak niesie WAGA.
export const TERM_EVALUATORS = {
  /** Opinia OCENIAJĄCEGO o PROPONUJĄCYM. Reuse D1 — zero nowej matematyki. */
  opinion: (ctx) => clampUnit((Number(ctx.opinion) || 0) / 100),

  /** Napięcie pary. ZAWSZE 0..+1 — kierunek ustawia znak wagi w VERB_ACCEPTANCE. */
  tension: (ctx) => clampUnit((Number(ctx.tension) || 0) / 100),

  /**
   * Układ sił między stronami ∈ ⟨−1, +1⟩. Żywy od W1-3, kierunek naprawiony w W1-3b.
   *
   * ⚠ ZNAK: **+1 = OCENIAJĄCY jest SŁABSZY** („słabsza strona bardziej ugodowa").
   * To jest intencja podpisana w `DIPLOMACY_BACKBONE §2.1` i to ona jest autorytetem.
   * W1-3 wypuścił kierunek ODWROTNY (+1 = oceniający silniejszy), przez co dominujące
   * militarnie imperium podpisywało wszystko, słabe odmawiało, a przy `offer_peace`
   * (waga 30) WYGRYWAJĄCY chętniej siadał do stołu — czyli na odwrót niż w rzeczywistości,
   * gdzie wygrywający naciska przewagę, a przegrywający szuka pokoju.
   * Wagi z D2 były autorskie, ale powstały PRZECIW STUBOWI zwracającemu 0 — kierunku nikt
   * wtedy nie zwalidował, bo nie było czego walidować. MAGNITUDY wag zostają nietknięte
   * (to jest domena D4); zmienia się wyłącznie semantyka znaku.
   *
   * Stąd argumenty podane ODWROTNIE: `relativePowerRaw(other, self)` daje wartość dodatnią,
   * gdy PROPONUJĄCY jest silniejszy, czyli gdy oceniający jest słabszy. Sama formuła
   * w `ThreatMath` zachowuje naturalne znaczenie („o ile A dominuje nad B") — używają jej
   * też doktryny (W1-5) i tam odwrócenie byłoby mylące. Inwersja należy do TEGO termu.
   *
   * Odblokowała ten term nie naprawa estymatora (R2/W1-1 niczego nie przesunęła, refutacja
   * K-1), tylko ŹRÓDŁO SIŁY PO OBU STRONACH: `ThreatAssessment` liczy ją z realnych kadłubów,
   * a `buildContext` wstrzykuje wynik jako `ctx.strength`.
   *
   * ⚠ Term zostaje CZYSTY — czyta WYŁĄCZNIE ctx, nigdy kolaboratora (decyzja 5). Brak pola
   * `strength` ⇒ surowe 0, bo tak wygląda kontekst przyrządu strojenia wag
   * (`DiplomacyTelemetry.matrixBaseContext` nie podaje siły) i tak chronimy kotwice
   * parytetu z E2.
   */
  relative_power: (ctx) => {
    const s = ctx.strength;
    if (!s || s.self == null || s.other == null) return 0;
    return clampUnit(relativePowerRaw(s.other, s.self));
  },

  /**
   * Wyczerpanie wojną kontra cena pokoju z casus belli — jedyny konsument `peaceCost`,
   * który do D2 nie miał ŻADNEGO czytelnika w kodzie.
   *
   * Bierzemy MINIMUM z obu stron, bo tak brzmi intencja zapisana w danych
   * („obie strony muszą mieć exhaustion >= 30", CasusBelliData). Dziś obie wartości
   * i tak rosną symetrycznie (jedynym producentem jest recordBattle: +15 × exhaustionRate
   * dla obu stron naraz), więc minimum nic nie psuje, a przeżyje asymetrię z WAR_BACKBONE.
   */
  war_status: (ctx) => {
    const war = ctx.war;
    if (!war) return 0;
    const mine   = Number(war.exhaustionSelf)  || 0;
    const theirs = Number(war.exhaustionOther) || 0;
    const cost   = Number(war.peaceCost) || 0;
    return clampUnit((Math.min(mine, theirs) - cost) / 100);
  },

  /**
   * Rzut wektora osobowości OCENIAJĄCEGO na osie wskazane przez czasownik.
   * Oś 0..1 → (oś − 0.5) × 2 ∈ −1..+1, przemnożona przez współczynnik czasownika.
   * Nieznany archetyp / brak imperium → wszystkie osie neutralne → 0 (degradacja bez kary).
   */
  personality: (ctx, verbCfg) => {
    const axes = verbCfg?.personalityAxes ?? {};
    let sum = 0;
    for (const [axis, coeff] of Object.entries(axes)) {
      const v = Number(ctx.personality?.[axis]);
      const normalized = (Number.isFinite(v) ? v : PERSONALITY_NEUTRAL) - PERSONALITY_NEUTRAL;
      sum += (Number(coeff) || 0) * normalized * 2;
    }
    return clampUnit(sum);
  },

  /**
   * Globalna reputacja PROPONUJĄCEGO (infamy). K-2: ledger istnieje i zanika, ale nic
   * jeszcze nie PODNOSI agresji — raisery to D4. Term liczy poprawnie, wejście jest zerem.
   */
  reputation: (ctx) => clampUnit(-(Number(ctx.proposerAggression) || 0) / 100),

  /**
   * Łapówka dołączona do propozycji, z malejącymi przyrostami.
   * K-4: D2 nie daje UI oferty (czasownik `gift` jest w D4), więc w praktyce zawsze 0.
   */
  offer: (ctx) => clampUnit(diminishingReturns(Number(ctx.offer?.credits) || 0, OFFER_HALF_KR)),

  /**
   * Dowody z pierścienia pamięci relacji — WYŁĄCZNIE typy, które nie mają innego kanału
   * (patrz INCIDENT_CHANNELS). Dziś MEMORY_EVIDENCE_WEIGHTS jest puste, więc term zwraca 0:
   * to nie niedoróbka, tylko konsekwencja reguły anty-podwójnego-liczenia — wszystko, co
   * dzisiejszy kod zapisuje, wchodzi już do wyniku przez opinię albo napięcie.
   */
  memory: (ctx) => {
    let sum = 0;
    for (const entry of (ctx.memory ?? [])) {
      sum += Number(MEMORY_EVIDENCE_WEIGHTS[entry?.type]) || 0;
    }
    return clampUnit(sum);
  },

  /**
   * „Właśnie powiedzieliśmy nie" — koniec spamowania przyciskiem.
   * Liniowo od −1 tuż po odmowie do 0 po upływie OKNA TEGO CZASOWNIKA. Stan
   * (`verbCooldowns` na rekordzie pary) pisze od E4 `RelationsModel.noteVerbRefusal` —
   * jedyny pisarz.
   *
   * ⚠ WP-4 / C4: okno jest PER CZASOWNIK (`refusalCooldownYears`, D-WP-4 dał
   *   `offer_peace` jeden rok), a rachunek mieszka w `refusalWindowYears` — tej samej
   *   funkcji, z której czyta fasada. Dwie kopie tego rachunku rozjechałyby liczbę
   *   pokazywaną graczowi z liczbą, którą liczy silnik.
   *
   * ⚠ Waga 0 (D-WP-4 dla pokoju) NIE jest obsługiwana tutaj: term dalej zwraca surowy
   *   raw, a zerowanie robi WAGA w katalogu. Gdyby term sam zwracał 0, telemetria E7
   *   straciłaby informację „stempel jest, tylko nic nie waży".
   */
  recent_refusal: (ctx) => {
    // ── DS-3 / D-DS-7(B) — DAR OTWIERA ROZMOWĘ PONOWNIE ────────────────────────────
    // Propozycja niosąca kredyty NIE płaci za świeżą odmowę. Bez tego wyjątku dar jest
    // STRUKTURALNIE bezsilny: kara `recent_refusal` ma wagę 25, a `offer` nasyca się na +20,
    // więc ZMIERZONO, że po odmowie nawet MILION Kr daje score −5 przy progu 10 (sonda DS-3).
    // ⚠ To NIE jest obejście anty-spamu: sam dar musi i tak domknąć lukę BAZOWĄ, a odmowa
    //   osłodzonej propozycji stempluje normalnie — gracz dostaje JEDNĄ płatną próbę, nie łańcuch.
    // ⚠ Zasięg jest zakresowany przez to, KTO karmi `offer`: dziś wyłącznie modal odmowy
    //   traktatu. Stół pokoju oferty nie składa (reparacje = WP-R), więc `offer_peace` nietknięty.
    if (Number(ctx.offer?.credits) > 0) return 0;
    const refusedYear = Number(ctx.verbCooldowns?.[ctx.verb]);
    if (!Number.isFinite(refusedYear)) return 0;
    const elapsed = (Number(ctx.year) || 0) - refusedYear;
    if (!(elapsed >= 0)) return 0;                       // odmowa „z przyszłości" (wczytany zapis) — ignoruj
    const windowYears = refusalWindowYears(VERB_ACCEPTANCE[ctx.verb]);
    if (!(windowYears > 0)) return 0;                    // okno zerowe ⇒ nie ma czego wygaszać
    const left = windowYears - elapsed;
    return left <= 0 ? 0 : -clampUnit(left / windowYears);
  },

  /**
   * Układ sojuszy wokół pary. K-5: pary AI↔AI instancjonuje dopiero D5, więc w D2 term
   * widzi wyłącznie relacje gracz↔AI plus wojny — składniki „sojusznik naszego wroga"
   * będą prawie zawsze zerowe. Wchodzi strukturalnie, nie udaje działającej mechaniki.
   */
  third_party: (ctx) => {
    const tp = ctx.thirdParty ?? {};
    const sum =
      (tp.isOurAlly ? THIRD_PARTY_WEIGHTS.our_ally : 0) +
      (Number(tp.alliesOfOurEnemies) || 0) * THIRD_PARTY_WEIGHTS.ally_of_our_enemy +
      (Number(tp.atWarWithOurEnemy)  || 0) * THIRD_PARTY_WEIGHTS.at_war_with_our_enemy;
    return clampUnit(sum);
  },

  /**
   * Szum imperiów z cechą `erratic` (import z MOO). DETERMINISTYCZNY w obrębie epoki
   * ERRATIC_EPOCH_YEARS: gracz nie może klikać tego samego przycisku aż trafi.
   * Rzut samej cechy przy generacji imperium dokłada E5 — do tego czasu traits[] jest puste.
   */
  erratic_noise: (ctx) => {
    if (!Array.isArray(ctx.traits) || !ctx.traits.includes('erratic')) return 0;
    return clampUnit(noiseUnit(ctx.erraticSeed));
  },

  /**
   * WP-2 — warunki TERYTORIALNE propozycji pokoju. Ile boli to, co zmienia właściciela.
   *
   * ⚠ To jest GRADACJA, nie granica. „Czy w ogóle jest na stole" rozstrzygają pre-warunki
   *   `territorial_capital` / `territorial_ceiling` — rachunek, dlaczego waga tego nie
   *   uniesie, stoi w nocie katalogu przy tym termie.
   *
   * ⚠ CZYSTY: cały odczyt świata (wycena ciał, pula oddawalna, księga zdobyczy) siedzi
   *   w `_buildTermsContext`. Tutaj jest wyłącznie arytmetyka na gotowym snapshocie —
   *   dzięki temu telemetria E7 rusza term literałem, bez stawiania świata.
   *
   * ⚠ Cesja BEZ stron (`fromEmpireId`/`toEmpireId`) nie liczy się do ŻADNEJ strony.
   *   Kierunek jest własnością wołającego; zgadywanie go tutaj zamieniłoby błąd wołającego
   *   w cichą zmianę ceny pokoju.
   */
  territorial_terms: (ctx) => {
    const cessions = ctx.terms?.cessions;
    if (!Array.isArray(cessions) || cessions.length === 0) return 0;

    const self = ctx.toId;
    let demand = 0, gain = 0;
    for (const c of cessions) {
      // Zwrot ZDOBYCZY liczy się taniej — patrz TERRITORIAL_RECAPTURE_MULT.
      const v = (Number(c?.devValue) || 0) * (c?.recaptured ? TERRITORIAL_RECAPTURE_MULT : 1);
      if (c?.fromEmpireId === self)    demand += v;
      else if (c?.toEmpireId === self) gain   += v;
    }

    // Ulga wyczerpania: wojna ponad cenę pokoju obniża ODCZUWANĄ cenę cesji. Poniżej ceny
    // pokoju ulga jest UJEMNA (żądanie boli bardziej) — świadomie, lustro `war_status`.
    const relief = clampUnit(
      ((Number(ctx.war?.exhaustionSelf) || 0) - (Number(ctx.war?.peaceCost) || 0)) / 100,
    ) * TERRITORIAL_FATIGUE_RELIEF;

    return clampUnit(
      diminishingReturns(gain, TERRITORIAL_HALF)
      - diminishingReturns(demand * (1 - relief), TERRITORIAL_HALF),
    );
  },

  /**
   * WP-R / D-WPR-3 — REPARACJE: ile boli oddanie prawa do zbrojeń.
   *
   * ⚠ ZAWSZE ≤ 0. Reparacji żąda wyłącznie gracz (D-WPR-5), więc term nie ma gałęzi „zysku" —
   *   w odróżnieniu od `territorial_terms`, gdzie cesja może iść w OBIE strony.
   * ⚠ ULGA WYCZERPANIA liczona TĄ SAMĄ formułą co `territorial_terms` wyżej, i to jest
   *   podpisane (D-WPR-3: „modulowany wyczerpaniem jak territorial"). Osią jest
   *   `exhaustionSelf` — wyczerpanie OCENIAJĄCEGO, nie minimum obu stron (to drugie jest osią
   *   `war_status`). W grze obie rosną razem (`recordBattle` podnosi symetrycznie), więc tabela
   *   decyzyjna z fazy A obowiązuje; asymetrię z WAR_BACKBONE ten term przeżyje.
   * ⚠ CZYTA WYŁĄCZNIE `ctx.terms.reparations` i `ctx.war` — zero nowych odczytów świata, więc
   *   biała lista `AcceptanceEngine._kosmos()` zostaje NIETKNIĘTA (pułapka, która ugryzła W1-3
   *   i WP-2: klucz pominięty w tej liście nie rzuca, tylko cicho degraduje term do zera).
   */
  reparations: (ctx) => {
    const years = Number(ctx.terms?.reparations?.years) || 0;
    if (years <= 0) return 0;
    const relief = clampUnit(
      ((Number(ctx.war?.exhaustionSelf) || 0) - (Number(ctx.war?.peaceCost) || 0)) / 100,
    ) * TERRITORIAL_FATIGUE_RELIEF;
    return -clampUnit((years / REPARATIONS_YEARS) * (1 - relief));
  },
};

// ── Pre-warunki ─────────────────────────────────────────────────────────────
// Twarde blokady sprawdzane PRZED liczeniem — odpowiednik tego, co dziś robi
// `proposeTreaty`, zanim w ogóle spojrzy na progi. Blokada nie ma rozbicia: ma powód.
const PRECONDITION_CHECKS = {
  not_at_war:         (ctx) => ctx.status !== 'war',
  at_war:             (ctx) => ctx.status === 'war',
  /**
   * ⚠ DS-2/C1 — WYJĄTEK ODNOWIENIA, bramkowany DWOMA warunkami NARAZ:
   *   `ctx.renew === true`        — wołający JAWNIE prosi o odnowienie (fasada
   *                                 `DiplomacySystem.renewTreaty`, nigdy `proposeTreaty`),
   *   `verbCfg.renewable === true`— i ten traktat W OGÓLE wolno odnawiać (dziś: pakt).
   * Sama flaga w propozycji NIE wystarcza — inaczej `renew:true` przepuściłoby ponowne
   * podpisanie sojuszu, które nie znaczy nic. Pre-warunek zostaje na liście czasownika,
   * więc `acceptance_engine` :90 („czasowniki traktatowe deklarują tę bramkę”) jest cały.
   */
  not_already_signed: (ctx, verbCfg) =>
    (ctx.renew === true && verbCfg?.renewable === true) ||
    !verbCfg?.treatyId || !(ctx.treaties ?? []).some(t => t?.id === verbCfg.treatyId),
  /**
   * „Nasza natura na to nie pozwala" — podłoga osobowości (E2).
   * Odtwarza PIERWSZĄ bramkę dawnej koniunkcji (`pers.trade >= 0.5` itd.) jako twardy
   * warunek, a nie jako składnik punktacji. Powód w AcceptanceWeightData: osobowość
   * jako TERM wymagałaby wagi opinii ≥ 8× większej, co zgniata resztę termów do szumu.
   * Brak osi w wektorze → środek skali (0.5), więc nieznane imperium nie jest karane.
   */
  personality_floor: (ctx, verbCfg) => {
    const floor = verbCfg?.personalityFloor;
    if (!floor) return true;
    const raw = Number(ctx.personality?.[floor.axis]);
    const v = Number.isFinite(raw) ? raw : PERSONALITY_NEUTRAL;
    if (floor.min != null && v < floor.min) return false;
    if (floor.max != null && v > floor.max) return false;
    return true;
  },

  /**
   * WP-2 (D-WP-8) — ciało DOMOWE nigdy nie jest na stole. Całe imperium można wziąć
   * wyłącznie podbojem; przy stole nie ma czego o nie licytować.
   * Chronimy to, co oceniającemu się ZABIERA — znacznik na ciele płynącym w jego stronę
   * nie blokuje niczego.
   */
  territorial_capital: (ctx) => {
    const cessions = ctx.terms?.cessions;
    if (!Array.isArray(cessions) || cessions.length === 0) return true;
    return !cessions.some(c => c?.capital === true && c?.fromEmpireId === ctx.toId);
  },

  /**
   * WP-2 (D-WP-8) — SUFIT CESJI. Oceniający oddaje co najwyżej TERRITORIAL_MAX_SHARE swojej
   * puli ODDAWALNEJ; żądanie ponad tę część odpada NIEZALEŻNIE od wyczerpania.
   *
   * ⚠ `demand_own` liczy WYŁĄCZNIE ciała z puli własnej oceniającego. Zwroty zdobyczy
   *   wypadają PO OBU STRONACH nierówności (z żądania i z puli) — to jedna zasada, nie dwa
   *   wyjątki: sufit rządzi wyłącznie WŁASNYM, nie-stołecznym terytorium.
   *
   * ⚠ `demand_own === 0` ⇒ sufit NIGDY nie blokuje, także przy pustej puli. Inaczej AI
   *   sprowadzone do samej stolicy nie mogłoby nawet ODDAĆ tego, co zabrało graczowi.
   *
   * ⚠ `heldValue == null` (nierozwiązywalne — brak ColonyManager) PRZEPUSZCZA, a `0`
   *   (rozwiązane, pusto) BLOKUJE. To NIE jest ta sama wartość: fail-closed przy `null`
   *   zaciemniłby `probeTermImpact`, który pomija `blocked` i zmierzyłby ten term jako
   *   bezczynny — czyli przyrząd strojenia wag zacząłby kłamać o działającej mechanice.
   */
  territorial_ceiling: (ctx) => {
    const cessions = ctx.terms?.cessions;
    if (!Array.isArray(cessions) || cessions.length === 0) return true;

    let demandOwn = 0;
    for (const c of cessions) {
      if (c?.fromEmpireId !== ctx.toId || c?.recaptured) continue;
      demandOwn += Number(c?.devValue) || 0;
    }
    if (demandOwn <= 0) return true;

    const held = ctx.terms?.heldValue;
    if (held == null) return true;
    return demandOwn <= TERRITORIAL_MAX_SHARE * held;
  },
};

/**
 * @returns {{ blocked: boolean, reasonKey: string|null }}
 * ⚠ Rzuca na nieznany pre-warunek — literówka w katalogu nie może zniknąć po cichu.
 */
export function checkPreconditions(ctx, verbCfg) {
  for (const id of (verbCfg?.preconditions ?? [])) {
    const check = PRECONDITION_CHECKS[id];
    if (!check) throw new Error(`[AcceptanceEngine] Nieznany pre-warunek: '${id}'`);
    if (!check(ctx, verbCfg)) {
      return { blocked: true, reasonKey: PRECONDITIONS[id]?.reasonKey ?? id };
    }
  }
  return { blocked: false, reasonKey: null };
}

// ── Ocena (CZYSTA — wejściem jest gotowy kontekst) ──────────────────────────

/**
 * Ocenia propozycję na podstawie SNAPSHOTU. Zero odczytów świata — to jest funkcja,
 * którą testuje smoke i którą wołają obie ścieżki (gracz→AI i AI→gracz).
 *
 * @param {Object} ctx — patrz `buildContext` (kontrakt pól opisany tam)
 * @returns {{
 *   verb, fromId, toId, score, threshold, decision, blocked, reasonKey,
 *   breakdown: Array<{term,labelKey,status,raw,weight,value}>, counterHint
 * }}
 * ⚠ Rzuca na nieznany czasownik — propozycja spoza katalogu to błąd wołającego.
 */
export function evaluateWithContext(ctx) {
  const verbCfg = VERB_ACCEPTANCE[ctx?.verb];
  if (!verbCfg) throw new Error(`[AcceptanceEngine] Nieznany czasownik: '${ctx?.verb}'`);

  const weights = resolveWeights(verbCfg, [
    ARCHETYPE_WEIGHT_OVERRIDES[ctx.archetype],
    OBJECTIVE_WEIGHT_OVERRIDES[ctx.objective],
  ]);

  const base = {
    verb: verbCfg.id, fromId: ctx.fromId ?? null, toId: ctx.toId ?? null,
    threshold: weights.threshold,
  };

  // Blokada twarda — bez wyniku i bez rozbicia. Pusta lista, nie „score 0":
  // zero punktów sugerowałoby ocenę na styk, a tu oceny w ogóle nie było.
  const pre = checkPreconditions(ctx, verbCfg);
  if (pre.blocked) {
    return { ...base, score: 0, decision: false, blocked: true, reasonKey: pre.reasonKey, breakdown: [], counterHint: null };
  }

  const rawByTerm = {};
  for (const termId of Object.keys(weights.terms)) {
    const evaluate = TERM_EVALUATORS[termId];
    if (!evaluate) throw new Error(`[AcceptanceEngine] Czasownik '${verbCfg.id}' żąda nieznanego termu: '${termId}'`);
    rawByTerm[termId] = evaluate(ctx, verbCfg);
  }

  const breakdown = buildAcceptanceBreakdown(rawByTerm, weights.terms, ACCEPTANCE_TERMS);
  const score     = sumScore(breakdown);
  const decision  = decide(score, weights.threshold);

  return {
    ...base,
    score,
    decision,
    blocked: false,
    reasonKey: null,
    breakdown,
    // Emitowane od E1, świadomie bez konsumenta — UI kontrofert jest poza 1.0 (backbone §0).
    counterHint: decision ? null : counterHintFor(score, weights.threshold, weights.terms, {
      offerAlready: Number(ctx.offer?.credits) || 0,
    }),
  };
}

// ── Silnik (jedyne miejsce, które dotyka żywych systemów) ───────────────────

export class AcceptanceEngine {
  /**
   * @param {Object|null} deps — wstrzyknięcie kolaboratorów (testy / headless).
   *   null ⇒ leniwy odczyt z window.KOSMOS przy każdym wywołaniu (wzór OrderService:
   *   zero cross-importów systemów, kolejność konstruowania bez znaczenia).
   */
  constructor(deps = null) {
    this._deps = deps;
  }

  _kosmos() {
    return this._deps ?? globalThis.KOSMOS ?? null;
  }

  /**
   * Snapshot świata dla termów. Kontrakt pól — patrz komentarze przy `TERM_EVALUATORS`.
   *
   * ⚠ Czyta RelationsModel (`dipl.relations`), a nie fasadę DiplomacySystem: fasada jest
   * GRACZ-CENTRYCZNA (`getTension(empireId)` zakłada, że drugą stroną jest gracz), a silnik
   * musi być symetryczny — inaczej D5 (pary AI↔AI) wymagałby drugiej ścieżki.
   */
  buildContext(fromId, toId, proposal = {}) {
    const K = this._kosmos();
    const dipl = K?.diplomacySystem;
    const reg  = K?.empireRegistry;
    // Głośno: brak tych dwóch to błąd wpięcia, nie stan gry (audyt R12).
    if (!dipl?.relations) throw new Error('[AcceptanceEngine] Brak DiplomacySystem — nie ma czego oceniać');
    if (!reg)             throw new Error('[AcceptanceEngine] Brak EmpireRegistry — nie ma czyjej osobowości czytać');

    const rel     = dipl.relations;
    const evaluator = reg.get(toId) ?? null;      // null gdy oceniającym jest GRACZ — poprawne
    const year    = Number(K?.timeSystem?.gameTime) || 0;
    const verb    = proposal.verb;

    const pairRel = rel.getOrNull(fromId, toId);

    // WP-2 — kontekst wojny liczony RAZ: czyta go term `war_status` i (przez `war.warId`)
    // wycena warunków terytorialnych. Dwa odczyty rozjechałyby się przy pierwszej zmianie.
    const war = this._buildWarContext(K, fromId, toId);

    return {
      verb,
      fromId,
      toId,
      year,
      opinion:  rel.getOpinion(toId, fromId),
      tension:  rel.getTension(fromId, toId),
      status:   rel.getStatus(fromId, toId),
      treaties: rel.getTreaties(fromId, toId),
      memory:   rel.getMemory(fromId, toId, MEMORY_WINDOW),

      personality: evaluator?.personality ?? {},
      archetype:   evaluator?.archetype ?? null,
      objective:   evaluator?.objective ?? null,
      traits:      evaluator?.traits ?? [],

      proposerAggression: dipl.getReputation?.(fromId)?.aggression ?? 0,

      war,
      terms:       this._buildTermsContext(K, fromId, toId, proposal, war),
      thirdParty:  this._buildThirdPartyContext(rel, fromId, toId),
      strength:    this._buildStrengthContext(K, fromId, toId),

      // Od E4 zapisywane przez `RelationsModel.noteVerbRefusal`. `?? {}` zostaje: stare
      // zapisy (i pary sprzed pierwszej odmowy) nie mają tego pola, a pusta mapa jest
      // poprawną wartością domyślną — dlatego pole NIE potrzebowało bumpu wersji zapisu.
      verbCooldowns: pairRel?.verbCooldowns ?? {},

      offer: proposal.offer ?? null,

      // DS-2/C1 — intencja ODNOWIENIA, nie stan świata. Domyślnie `false`, więc każda
      // ścieżka, która o nią nie prosi (w tym `proposeTreaty`), jest bramkowana jak dotąd.
      renew: proposal.renew === true,

      // Ziarno szumu: para × czasownik × EPOKA × seed galaktyki. Epoka sprawia, że
      // „humor" imperium trzyma się przez ERRATIC_EPOCH_YEARS zamiast losować co klik.
      erraticSeed: hashStringToInt(
        `${fromId}|${toId}|${verb}|${Math.floor(year / ERRATIC_EPOCH_YEARS)}|${K?.galaxyData?.seed ?? 0}`,
      ),
    };
  }

  /**
   * Kontekst siły dla termu `relative_power` (W1-3). Perspektywa OCENIAJĄCEGO:
   * `self` = siła `toId` (ten, kto decyduje), `other` = siła `fromId` (ten, kto prosi).
   *
   * ⚠ Brak `ThreatAssessment` → `null`, NIE wyjątek — i to jest decyzja, nie niedbalstwo
   * (decyzja 5). Term ma się wtedy zdegradować do surowego 0, bo dokładnie tak działa
   * `DiplomacyTelemetry.matrixBaseContext`: buduje kontekst literałem, BEZ pola siły,
   * żeby kotwice parytetu z E2 (progi 10/25/30) mierzyły się w świecie bez tego termu.
   * Gdyby brak modułu rzucał, przyrząd strojenia wag przestałby się uruchamiać.
   * Degradacja jest PINOWANA (`acceptance_relpower_smoke`), więc nie jest cichym no-opem.
   */
  _buildStrengthContext(K, fromId, toId) {
    const ta = K?.threatAssessment;
    if (!ta) return null;
    return { self: ta.getStrength(toId), other: ta.getStrength(fromId) };
  }

  /**
   * Kontekst wojny dla termu `war_status`. Brak WarSystem albo brak wojny → null
   * (to jest STAN GRY, nie błąd wpięcia — większość propozycji pada w pokoju).
   */
  _buildWarContext(K, fromId, toId) {
    const warSys = K?.warSystem;
    if (!warSys?.getWarWith) return null;
    // Fasada WarSystem jest gracz-centryczna tak samo jak DiplomacySystem: pyta o wojnę
    // Z IMPERIUM. Bierzemy tę stronę pary, która imperium jest (D5 rozszerzy o AI↔AI).
    const empireId = (fromId === 'player') ? toId : fromId;
    const war = warSys.getWarWith(empireId);
    if (!war?.active) return null;

    const casusBelli = war.casusBelli ?? null;
    return {
      warId:           war.id ?? null,
      casusBelli,
      // Nieznany/brakujący CB → cennik incydentu granicznego, dokładnie jak
      // WarSystem przy liczeniu exhaustionRate (`CASUS_BELLI[...] ?? border_incident`).
      peaceCost:       Number((CASUS_BELLI[casusBelli] ?? CASUS_BELLI.border_incident)?.peaceCost) || 0,
      // war.exhaustion jest kluczowane ID STRONY ('player' | empireId), nie rolą.
      exhaustionSelf:  Number(war.exhaustion?.[toId])   || 0,
      exhaustionOther: Number(war.exhaustion?.[fromId]) || 0,
    };
  }

  /**
   * WP-2 — snapshot WARUNKÓW TERYTORIALNYCH propozycji. JEDYNE miejsce, które dla tej
   * mechaniki dotyka żywych systemów; term i pre-warunki dostają gotowe liczby.
   *
   * ⚠ LICZONE WYŁĄCZNIE, GDY PROPOZYCJA NIESIE CESJE. Zwracamy `null` dla każdej
   *   propozycji bez `terms.cessions` — i to jest cała regresja zero tego slice'u:
   *   zwykły `offer_peace` nie wykonuje ANI JEDNEGO dodatkowego odczytu świata
   *   (pinowane licznikami wywołań w keeperze, T9c/T9d).
   *
   * Kształt: { cessions: [{ bodyId, fromEmpireId, toEmpireId, devValue, recaptured, capital }],
   *            heldValue: number|null }
   *
   * @returns {Object|null}
   */
  _buildTermsContext(K, fromId, toId, proposal, war) {
    const cessions = proposal?.terms?.cessions;
    const hasCessions = Array.isArray(cessions) && cessions.length > 0;
    // WP-R — REPARACJE SĄ OSOBNYM WARUNKIEM, więc snapshot musi powstać także BEZ cesji.
    // ⚠ To był jedyny realny defekt znaleziony w fazie A: wczesny `return null` na braku cesji
    //   czynił pokój „status quo + blokada zbrojeń" NIEWIDZIALNYM dla silnika (ZMIERZONE:
    //   `terms: { reparations: { years: 10 } }` → `ctx.terms === null`), a to najbardziej
    //   prawdopodobny ruch gracza.
    // ⚠ Regresja zero: propozycja BEZ żadnych warunków nadal daje `null` (pin `wp_peace_seams`
    //   T1c2), a `territorial_terms` przy `cessions: []` zwraca 0 (pin `wp_territorial_terms`).
    //   Oba pre-warunki terytorialne wychodzą wtedy wczesnym `true`.
    const repYears = Number(proposal?.terms?.reparations?.years) || 0;
    if (!hasCessions && repYears <= 0) return null;
    const reparations = repYears > 0 ? { years: repYears } : null;
    // Bez cesji NIE liczymy puli oddawalnej — `heldValue` jest wejściem wyłącznie dla sufitu,
    // a sufit przy pustej liście i tak wychodzi wczesnym `true`.
    if (!hasCessions) return { cessions: [], heldValue: null, reparations };

    const colMgr = K?.colonyManager ?? null;
    const capitalBodyId = this._capitalBodyIdOf(K, toId);
    const wasTakenByEvaluator = this._captureResolver(K, war, fromId, toId);

    const devValueOf = (bodyId) =>
      TERRITORIAL_BASE_VALUE + colonyDevScore(colMgr?.getColony?.(bodyId) ?? null);

    const rows = cessions.map(c => ({
      bodyId:       c?.bodyId ?? null,
      fromEmpireId: c?.fromEmpireId ?? null,
      toEmpireId:   c?.toEmpireId ?? null,
      devValue:     devValueOf(c?.bodyId),
      recaptured:   wasTakenByEvaluator(c?.bodyId),
      capital:      c?.bodyId != null && c?.bodyId === capitalBodyId,
    }));

    // Pula ODDAWALNA oceniającego (definicja (B) — patrz TERRITORIAL_MAX_SHARE):
    // jego własne ciała BEZ domu i BEZ tego, co w tej wojnie zabrał proponującemu.
    const own = this._ownColoniesOf(K, toId);
    const heldValue = own == null ? null : own.reduce((sum, col) => {
      const id = col?.planetId;
      if (id == null || id === capitalBodyId || wasTakenByEvaluator(id)) return sum;
      return sum + TERRITORIAL_BASE_VALUE + colonyDevScore(col);
    }, 0);

    return { cessions: rows, heldValue, reparations };
  }

  /**
   * WP-2 — ciało DOMOWE właściciela. Kanon, nie trzecia definicja:
   *   AI    → `DirectorProduction.capitalOf` (to samo źródło, co produkcja, doktryny,
   *           mobilizacja, recall i IntelSystem);
   *   gracz → `colony.isHomePlanet` (jedyny znacznik domu, jaki gra stawia).
   *
   * ⚠ Imperium BEZ rozwiązanej stolicy (same placówki) nie ma ciała chronionego — wszystko
   *   jest wtedy oddawalne DO SUFITU. Świadome (podpis D-WP-8), nie przeoczenie.
   */
  _capitalBodyIdOf(K, ownerId) {
    if (ownerId === PLAYER_ID) {
      const cols = K?.colonyManager?.getPlayerColonies?.() ?? null;
      return cols?.find(c => c?.isHomePlanet)?.planetId ?? null;
    }
    return K?.directorProduction?.capitalOf?.(ownerId)?.planetId ?? null;
  }

  /**
   * WP-2 — ciała, które oceniający TRZYMA. `null` = nierozwiązywalne (brak ColonyManager),
   * co JEST czymś innym niż pusta lista — patrz pre-warunek `territorial_ceiling`.
   */
  _ownColoniesOf(K, ownerId) {
    const colMgr = K?.colonyManager;
    if (!colMgr) return null;
    if (ownerId === PLAYER_ID) return colMgr.getPlayerColonies?.() ?? null;
    return K?.empireRegistry?.getColoniesByEmpire?.(ownerId) ?? null;
  }

  /**
   * WP-2 — predykat „czy OCENIAJĄCY zdobył to ciało na PROPONUJĄCYM w tej wojnie".
   *
   * ⚠ ROZSTRZYGA OSTATNI WPIS KSIĘGI, NIE JAKIKOLWIEK. `WarSystem` mówi to wprost:
   *   księga `captures` jest append-only BEZ deduplikacji i ma być HISTORIĄ, a nie
   *   migawką — „inaczej stół pokoju nie odróżni «oddaj, co zdobyłeś» od «oddaj, co właśnie
   *   odbiłem»". Ciało, które zmieniło ręce dwa razy, ma dwa wpisy: `some()` odpowiedziałoby
   *   `true` także wtedy, gdy oceniający już go NIE trzyma.
   *
   * ⚠ `getCaptures` przez `?.` — atrapy `warSystem` w testach nie mają tej metody
   *   (dwie w repo) i mają degradować do pustej księgi, a nie wywalać oceny.
   */
  _captureResolver(K, war, fromId, toId) {
    const warId = war?.warId ?? null;
    const captures = warId ? (K?.warSystem?.getCaptures?.(warId) ?? []) : [];
    if (!Array.isArray(captures) || captures.length === 0) return () => false;
    return (bodyId) => {
      if (bodyId == null) return false;
      for (let i = captures.length - 1; i >= 0; i--) {
        const e = captures[i];
        if (e?.bodyId !== bodyId) continue;
        return e.toEmpireId === toId && e.fromEmpireId === fromId;
      }
      return false;
    };
  }

  /**
   * Kto z kim trzyma. K-5: w D2 istnieją wyłącznie pary z graczem, więc realnie
   * wypełni się co najwyżej `isOurAlly`. Kod jest już symetryczny — D5 tylko doda pary.
   */
  _buildThirdPartyContext(rel, fromId, toId) {
    const isOurAlly = rel.hasTreaty(fromId, toId, 'alliance');

    // Wrogowie OCENIAJĄCEGO (bez proponującego — ten wchodzi przez `status`/pre-warunki).
    const enemies = rel.listPairsWith(toId)
      .filter(r => r.status === 'war')
      .map(r => (r.a === toId ? r.b : r.a))
      .filter(id => id !== fromId);

    let alliesOfOurEnemies = 0;
    let atWarWithOurEnemy  = 0;
    for (const enemyId of enemies) {
      if (enemyId === fromId) continue;
      if (rel.hasTreaty(fromId, enemyId, 'alliance')) alliesOfOurEnemies++;
      if (rel.getStatus(fromId, enemyId) === 'war')   atWarWithOurEnemy++;
    }
    return { isOurAlly, alliesOfOurEnemies, atWarWithOurEnemy };
  }

  /**
   * JEDYNE publiczne wejście dla wołających z gry.
   * @param {string} fromId — proponujący ('player' albo id imperium)
   * @param {string} toId   — oceniający
   * @param {Object} proposal — { verb, offer? }
   */
  evaluateProposal(fromId, toId, proposal = {}) {
    return evaluateWithContext(this.buildContext(fromId, toId, proposal));
  }
}
