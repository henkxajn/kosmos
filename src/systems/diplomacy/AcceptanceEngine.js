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
  OFFER_HALF_KR, RECENT_REFUSAL_YEARS, ERRATIC_EPOCH_YEARS, MEMORY_WINDOW,
} from '../../data/AcceptanceWeightData.js';
import {
  clampUnit, diminishingReturns, noiseUnit, hashStringToInt,
  resolveWeights, buildAcceptanceBreakdown, sumScore, decide, counterHintFor,
} from '../../utils/AcceptanceMath.js';
// Czyste dane (plik bez importów) — statyczny import NIE psuje czystości modułu.
// To jest miejsce, w którym `peaceCost` dostaje swojego PIERWSZEGO czytelnika w kodzie.
import { CASUS_BELLI } from '../../data/CasusBelliData.js';
// W1-3 — JEDNA formuła przewagi siły, wspólna z doktrynami (czysty util, nie system).
import { relativePowerRaw } from '../../utils/ThreatMath.js';

// Środek skali osi osobowości — brak osi / brak imperium ma dawać wkład 0, nie karę.
const PERSONALITY_NEUTRAL = 0.5;

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
   * Przewaga siły OCENIAJĄCEGO nad PROPONUJĄCYM ∈ ⟨−1, +1⟩. Żywy od W1-3.
   *
   * Do W1-3 był twardym `() => 0`. Odblokowała go nie naprawa estymatora (R2/W1-1 — ta
   * niczego nie przesunęła, refutacja K-1), tylko ŹRÓDŁO SIŁY PO OBU STRONACH:
   * `ThreatAssessment` liczy ją z realnych kadłubów, a `buildContext` wstrzykuje wynik
   * jako `ctx.strength`.
   *
   * ⚠ Term zostaje CZYSTY — czyta WYŁĄCZNIE ctx, nigdy kolaboratora (decyzja 5). Brak pola
   * `strength` ⇒ surowe 0, bo tak wygląda kontekst przyrządu strojenia wag
   * (`DiplomacyTelemetry.matrixBaseContext` nie podaje siły) i tak chronimy kotwice
   * parytetu z E2. Formuła (a−b)/(a+b) jest wspólna z doktrynami — `ThreatMath`.
   */
  relative_power: (ctx) => {
    const s = ctx.strength;
    if (!s || s.self == null || s.other == null) return 0;
    return clampUnit(relativePowerRaw(s.self, s.other));
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
   * Liniowo od −1 tuż po odmowie do 0 po RECENT_REFUSAL_YEARS. Stan (`verbCooldowns`
   * na rekordzie pary) pisze od E4 `RelationsModel.noteVerbRefusal` — jedyny pisarz.
   */
  recent_refusal: (ctx) => {
    const refusedYear = Number(ctx.verbCooldowns?.[ctx.verb]);
    if (!Number.isFinite(refusedYear)) return 0;
    const elapsed = (Number(ctx.year) || 0) - refusedYear;
    if (!(elapsed >= 0)) return 0;                       // odmowa „z przyszłości" (wczytany zapis) — ignoruj
    const left = RECENT_REFUSAL_YEARS - elapsed;
    return left <= 0 ? 0 : -clampUnit(left / RECENT_REFUSAL_YEARS);
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
};

// ── Pre-warunki ─────────────────────────────────────────────────────────────
// Twarde blokady sprawdzane PRZED liczeniem — odpowiednik tego, co dziś robi
// `proposeTreaty`, zanim w ogóle spojrzy na progi. Blokada nie ma rozbicia: ma powód.
const PRECONDITION_CHECKS = {
  not_at_war:         (ctx) => ctx.status !== 'war',
  at_war:             (ctx) => ctx.status === 'war',
  not_already_signed: (ctx, verbCfg) =>
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

      war:         this._buildWarContext(K, fromId, toId),
      thirdParty:  this._buildThirdPartyContext(rel, fromId, toId),
      strength:    this._buildStrengthContext(K, fromId, toId),

      // Od E4 zapisywane przez `RelationsModel.noteVerbRefusal`. `?? {}` zostaje: stare
      // zapisy (i pary sprzed pierwszej odmowy) nie mają tego pola, a pusta mapa jest
      // poprawną wartością domyślną — dlatego pole NIE potrzebowało bumpu wersji zapisu.
      verbCooldowns: pairRel?.verbCooldowns ?? {},

      offer: proposal.offer ?? null,

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
