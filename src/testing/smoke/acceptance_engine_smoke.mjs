// D2 (WOJNA I POKÓJ 1.0, commit E1) — smoke: Acceptance Engine, czysta logika.
// Uruchom: node src/testing/smoke/acceptance_engine_smoke.mjs
//
// DOWÓD DEKOUPLINGU: STATYCZNE importy, ZERO shimów (window/localStorage/EventBus).
// Silnik ma dwie części — `evaluateWithContext` jest CZYSTA (dostaje snapshot), a cała
// nieczystość siedzi w `buildContext`. Jeśli ten plik przestanie się uruchamiać bez atrapy
// przeglądarki, znaczy że do części czystej wciekła zależność od stanu gry — to regresja.
//
// Pokrywa: integralność katalogu termów/czasowników, REGUŁĘ ANTY-PODWÓJNEGO-LICZENIA
// (kanały incydentów), matematykę (clamp, malejące przyrosty i odwrotność, szum, składanie
// wag, zaokrąglanie), KAŻDY term osobno, budowę rozbicia i sumowanie, progi i pre-warunki,
// KOTWICE PARYTETU dla trzech traktatów (cel E2), degradację przy braku danych, counterHint,
// pin bezczynności `relative_power` oraz parytet kluczy i18n pl↔en.

import {
  ACCEPTANCE_TERMS, ACCEPTANCE_TERM_IDS, TERM_STATUS,
  VERB_ACCEPTANCE, ACCEPTANCE_VERB_IDS, PRECONDITIONS,
  ARCHETYPE_WEIGHT_OVERRIDES, OBJECTIVE_WEIGHT_OVERRIDES,
  MEMORY_EVIDENCE_WEIGHTS, INCIDENT_CHANNELS, THIRD_PARTY_WEIGHTS,
  OFFER_HALF_KR, RECENT_REFUSAL_YEARS, ERRATIC_EPOCH_YEARS, MEMORY_WINDOW,
  COUNTER_HINT_MAX_GAP, COUNTER_HINT_KR_STEP,
} from '../../data/AcceptanceWeightData.js';
import {
  clampUnit, roundScore, diminishingReturns, inverseDiminishing,
  mixSeed, hashStringToInt, noiseUnit,
  resolveWeights, buildAcceptanceBreakdown, visibleBreakdown, sumScore, decide, counterHintFor,
} from '../../utils/AcceptanceMath.js';
import {
  AcceptanceEngine, TERM_EVALUATORS, checkPreconditions, evaluateWithContext,
} from '../../systems/diplomacy/AcceptanceEngine.js';
import { OPINION_MODIFIERS, CB_MEMORY_WINDOW } from '../../data/OpinionModifierData.js';
import { ARCHETYPES, EMPIRE_OBJECTIVES } from '../../data/EmpireData.js';
import plDict from '../../i18n/pl.js';
import enDict from '../../i18n/en.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const throws = (n, fn) => { let t = false; try { fn(); } catch { t = true; } ok(n, t); };

// Osobowość obu imperiów AI, które gra faktycznie generuje (industrialist + jego klon
// expansionist). Na niej stoją kotwice parytetu — czytamy z katalogu, nie z literałów,
// żeby zmiana wektora archetypu ZŁAMAŁA test, zamiast po cichu przesunąć granicę.
const ROSTER_PERSONALITY = ARCHETYPES.industrialist.personality;

/** Minimalny kontekst — pola, których nie podamy, mają dawać wkład 0. */
const mkCtx = (over = {}) => ({
  verb: 'trade_agreement',
  fromId: 'player', toId: 'emp_001',
  year: 100,
  opinion: 0, tension: 0, status: 'peace', treaties: [], memory: [],
  personality: {}, archetype: null, objective: null, traits: [],
  proposerAggression: 0,
  war: null,
  thirdParty: { isOurAlly: false, alliesOfOurEnemies: 0, atWarWithOurEnemy: 0 },
  verbCooldowns: {}, offer: null, erraticSeed: 0,
  ...over,
});

// ── P1: integralność katalogu ───────────────────────────────────────────────
console.log('--- P1: integralność katalogu termów i czasowników ---');
{
  ok('id termu == klucz katalogu', ACCEPTANCE_TERM_IDS.every(id => ACCEPTANCE_TERMS[id].id === id));
  ok('każdy term ma labelKey z prefiksem diplo.term.',
    ACCEPTANCE_TERM_IDS.every(id => String(ACCEPTANCE_TERMS[id].labelKey).startsWith('diplo.term.')));
  const statuses = new Set(Object.values(TERM_STATUS));
  ok('status każdego termu jest z enuma TERM_STATUS',
    ACCEPTANCE_TERM_IDS.every(id => statuses.has(ACCEPTANCE_TERMS[id].status)));
  ok('każdy term ma ewaluator, a każdy ewaluator ma wpis w katalogu',
    ACCEPTANCE_TERM_IDS.every(id => typeof TERM_EVALUATORS[id] === 'function')
    && Object.keys(TERM_EVALUATORS).every(id => !!ACCEPTANCE_TERMS[id]));
  ok('każdy term ma opisaną jednostkę i notę (dokumentacja dla strojącego)',
    ACCEPTANCE_TERM_IDS.every(id => !!ACCEPTANCE_TERMS[id].unit && !!ACCEPTANCE_TERMS[id].note));

  ok('id czasownika == klucz katalogu', ACCEPTANCE_VERB_IDS.every(id => VERB_ACCEPTANCE[id].id === id));
  ok('czasowniki używają wyłącznie znanych termów',
    ACCEPTANCE_VERB_IDS.every(v => Object.keys(VERB_ACCEPTANCE[v].terms).every(t => !!ACCEPTANCE_TERMS[t])));
  ok('każdy próg jest liczbą skończoną',
    ACCEPTANCE_VERB_IDS.every(v => Number.isFinite(VERB_ACCEPTANCE[v].threshold)));
  ok('pre-warunki czasowników są znane',
    ACCEPTANCE_VERB_IDS.every(v => (VERB_ACCEPTANCE[v].preconditions ?? []).every(p => !!PRECONDITIONS[p])));
  const personalityKeys = new Set(Object.keys(ROSTER_PERSONALITY));
  ok('personalityAxes wskazują ISTNIEJĄCE osie wektora archetypu',
    ACCEPTANCE_VERB_IDS.every(v => Object.keys(VERB_ACCEPTANCE[v].personalityAxes ?? {})
      .every(axis => personalityKeys.has(axis))));
  ok('każdy czasownik używający termu personality deklaruje osie',
    ACCEPTANCE_VERB_IDS.every(v => !VERB_ACCEPTANCE[v].terms.personality
      || Object.keys(VERB_ACCEPTANCE[v].personalityAxes ?? {}).length > 0));
  ok('czasowniki traktatowe deklarują treatyId i bramkę not_already_signed',
    ['trade_agreement', 'non_aggression', 'alliance'].every(v =>
      VERB_ACCEPTANCE[v].treatyId === v && VERB_ACCEPTANCE[v].preconditions.includes('not_already_signed')));
  ok('declare_war ŚWIADOMIE poza katalogiem (wojna jest jednostronna)', !VERB_ACCEPTANCE.declare_war);

  ok('nadpisania archetypów wskazują ISTNIEJĄCE archetypy',
    Object.keys(ARCHETYPE_WEIGHT_OVERRIDES).every(a => !!ARCHETYPES[a]));
  ok('nadpisania archetypów mnożą wyłącznie znane termy',
    Object.values(ARCHETYPE_WEIGHT_OVERRIDES).every(ov => Object.keys(ov.terms ?? {}).every(t => !!ACCEPTANCE_TERMS[t])));
  ok('industrialist i expansionist BEZ nadpisań (kotwica parytetu E2)',
    !ARCHETYPE_WEIGHT_OVERRIDES.industrialist && !ARCHETYPE_WEIGHT_OVERRIDES.expansionist);
  ok('nadpisania objective PUSTE w E1 (wypełnia E5 — ten pin ma wtedy PAŚĆ)',
    Object.keys(OBJECTIVE_WEIGHT_OVERRIDES).length === 0);
  ok('katalog objective z D1 nadal ma 6 pozycji (E5 będzie je nadpisywał)',
    EMPIRE_OBJECTIVES.length === 6);
}

// ── P2: REGUŁA ANTY-PODWÓJNEGO-LICZENIA ─────────────────────────────────────
console.log('--- P2: anty-podwójne-liczenie (kanały incydentów) ---');
{
  // Reguła z planu D2 §6, dosłownie: co jest TERMEM, nie może być modyfikatorem opinii.
  ok('żaden id termu nie jest jednocześnie id modyfikatora opinii',
    ACCEPTANCE_TERM_IDS.every(id => !(id in OPINION_MODIFIERS)));
  ok('żaden id modyfikatora opinii nie jest id termu (odwrotny kierunek)',
    Object.keys(OPINION_MODIFIERS).every(id => !(id in ACCEPTANCE_TERMS)));

  // Zęby tej reguły: incydent wchodzi do wyniku DOKŁADNIE jednym kanałem.
  const channels = new Set(['opinion', 'tension', 'status', 'memory']);
  ok('każdy incydent ma zadeklarowany znany kanał',
    Object.values(INCIDENT_CHANNELS).every(c => channels.has(c)));
  ok('incydenty kanału `opinion` MAJĄ swój modyfikator w katalogu D1',
    Object.entries(INCIDENT_CHANNELS).filter(([, c]) => c === 'opinion')
      .every(([type]) => type in OPINION_MODIFIERS));
  ok('term `memory` punktuje WYŁĄCZNIE typy kanału `memory`',
    Object.keys(MEMORY_EVIDENCE_WEIGHTS).every(type => INCIDENT_CHANNELS[type] === 'memory'));
  ok('żaden dowód termu `memory` nie jest jednocześnie modyfikatorem opinii',
    Object.keys(MEMORY_EVIDENCE_WEIGHTS).every(type => !(type in OPINION_MODIFIERS)));
  ok('tabela dowodów PUSTA w D2 (wyłączne dowody dopisuje D4 — ten pin ma wtedy PAŚĆ)',
    Object.keys(MEMORY_EVIDENCE_WEIGHTS).length === 0);
  // Wszystkie typy, które DiplomacySystem.addMemory faktycznie dziś zapisuje.
  for (const type of ['military_presence', 'research_intrusion', 'trespassing',
    'territorial_violation', 'surveillance_scan', 'warning_issued',
    'ultimatum_issued', 'war_declared', 'peace_offered']) {
    ok(`incydent '${type}' ma przypisany kanał`, !!INCIDENT_CHANNELS[type]);
  }
  ok('okno pamięci akceptacji jest OSOBNĄ gałką od okna casus belli',
    MEMORY_WINDOW === 10 && CB_MEMORY_WINDOW === 10);
}

// ── P3: matematyka ──────────────────────────────────────────────────────────
console.log('--- P3: matematyka (clamp, przyrosty, szum, składanie wag) ---');
{
  ok('clampUnit tnie do ±1', clampUnit(5) === 1 && clampUnit(-5) === -1 && clampUnit(0.4) === 0.4);
  ok('clampUnit degraduje śmieci do 0', clampUnit(undefined) === 0 && clampUnit('x') === 0 && clampUnit(NaN) === 0);

  ok('roundScore gasi szum zmiennoprzecinkowy', roundScore(13.999999999999998) === 14);
  ok('roundScore zachowuje realne ułamki', roundScore(27.6) === 27.6 && roundScore(-3.25) === -3.25);
  // Pin, który faktycznie ĆWICZY zaokrąglanie w ścieżce produkcyjnej: bez niego
  // 0.1 + 0.2 daje 0.30000000000000004 i wiersze przestają sumować się do wyniku.
  ok('sumScore zaokrągla sumę (0.1 + 0.2 === 0.3)',
    sumScore([{ value: 0.1 }, { value: 0.2 }]) === 0.3);
  ok('wartość wiersza jest zaokrąglona już przy budowie rozbicia',
    buildAcceptanceBreakdown({ opinion: 0.1 }, { opinion: 0.2 }, ACCEPTANCE_TERMS)[0].value === 0.02);

  ok('diminishingReturns: 0 → 0', diminishingReturns(0) === 0);
  ok('diminishingReturns: skala połówkowa → 0.5', Math.abs(diminishingReturns(OFFER_HALF_KR) - 0.5) < 1e-12);
  ok('diminishingReturns: podwojenie NIE podwaja efektu',
    Math.abs(diminishingReturns(2 * OFFER_HALF_KR) - 0.75) < 1e-12);
  ok('diminishingReturns rośnie monotonicznie', diminishingReturns(10) < diminishingReturns(100)
    && diminishingReturns(100) < diminishingReturns(1000));
  ok('diminishingReturns nie przekracza 1 i nasyca się na 1 (raw mieści się w kontrakcie termu)',
    diminishingReturns(1e9) === 1 && diminishingReturns(1e6) <= 1);
  ok('diminishingReturns: ujemna/śmieciowa kwota → 0, nie kara',
    diminishingReturns(-500) === 0 && diminishingReturns('x') === 0);
  ok('inverseDiminishing jest odwrotnością', Math.abs(inverseDiminishing(diminishingReturns(777)) - 777) < 1e-9);
  ok('inverseDiminishing: 0 → 0, 1 → nieskończoność',
    inverseDiminishing(0) === 0 && inverseDiminishing(1) === Infinity);

  ok('mixSeed zwraca uint32', [0, 1, 2, -5, 123456789].every(n => {
    const v = mixSeed(n); return Number.isInteger(v) && v >= 0 && v <= 0xFFFFFFFF;
  }));
  ok('mixSeed rozprasza SĄSIEDNIE seedy (lekcja 0b15d95)',
    Math.abs(noiseUnit(1) - noiseUnit(2)) > 0.1 && Math.abs(noiseUnit(2) - noiseUnit(3)) > 0.1);
  ok('noiseUnit mieści się w ±1 dla setki ziaren',
    Array.from({ length: 100 }, (_, i) => noiseUnit(hashStringToInt('s' + i)))
      .every(v => v >= -1 && v <= 1));
  ok('noiseUnit jest deterministyczny', noiseUnit(42) === noiseUnit(42));
  {
    // Rozrzut: 100 kolejnych ziaren nie może wpaść w jedną połowę zakresu.
    const vals = Array.from({ length: 100 }, (_, i) => noiseUnit(i));
    const neg = vals.filter(v => v < 0).length;
    ok('noiseUnit nie ma stronniczości znaku (30..70 na 100)', neg >= 30 && neg <= 70);
  }
  ok('hashStringToInt jest deterministyczny i różnicuje', hashStringToInt('a__b') === hashStringToInt('a__b')
    && hashStringToInt('a__b') !== hashStringToInt('a__c'));

  const cfg = { threshold: 10, terms: { opinion: 40, tension: -10 } };
  ok('resolveWeights bez nadpisań = tożsamość', (() => {
    const r = resolveWeights(cfg, []);
    return r.threshold === 10 && r.terms.opinion === 40 && r.terms.tension === -10;
  })());
  ok('resolveWeights: mnożnik wagi + dodatek do progu', (() => {
    const r = resolveWeights(cfg, [{ terms: { opinion: 0.5 }, thresholdDelta: +5 }]);
    return r.threshold === 15 && r.terms.opinion === 20 && r.terms.tension === -10;
  })());
  ok('resolveWeights składa DWA nadpisania (archetyp × objective)', (() => {
    const r = resolveWeights(cfg, [{ terms: { opinion: 0.5 }, thresholdDelta: +5 }, { terms: { opinion: 2 }, thresholdDelta: -3 }]);
    return r.threshold === 12 && r.terms.opinion === 40;
  })());
  ok('resolveWeights IGNORUJE nadpisanie termu, którego czasownik nie używa', (() => {
    const r = resolveWeights(cfg, [{ terms: { memory: 9 } }]);
    return !('memory' in r.terms);
  })());
  ok('resolveWeights toleruje null/undefined w liście nadpisań', (() => {
    const r = resolveWeights(cfg, [null, undefined]);
    return r.threshold === 10 && r.terms.opinion === 40;
  })());
  ok('resolveWeights NIE mutuje katalogu', VERB_ACCEPTANCE.trade_agreement.terms.opinion === 40
    && (() => { resolveWeights(VERB_ACCEPTANCE.trade_agreement, [{ terms: { opinion: 0 } }]);
                return VERB_ACCEPTANCE.trade_agreement.terms.opinion === 40; })());
}

// ── P4: KAŻDY term osobno ───────────────────────────────────────────────────
console.log('--- P4: termy pojedynczo (wejście → raw) ---');
{
  const T = TERM_EVALUATORS;
  const cfg = VERB_ACCEPTANCE.trade_agreement;

  ok('opinion: +100 → +1, −100 → −1, 0 → 0',
    T.opinion(mkCtx({ opinion: 100 })) === 1 && T.opinion(mkCtx({ opinion: -100 })) === -1
    && T.opinion(mkCtx({ opinion: 0 })) === 0);
  ok('opinion: poza skalą jest przycinane', T.opinion(mkCtx({ opinion: 500 })) === 1);

  ok('tension: ZAWSZE 0..+1 (kierunek niesie waga)',
    T.tension(mkCtx({ tension: 0 })) === 0 && T.tension(mkCtx({ tension: 100 })) === 1
    && T.tension(mkCtx({ tension: 60 })) === 0.6);

  ok('relative_power: STUB — zawsze 0, niezależnie od kontekstu',
    T.relative_power(mkCtx()) === 0 && T.relative_power(mkCtx({ war: { exhaustionSelf: 99 } })) === 0);

  ok('war_status: brak wojny → 0', T.war_status(mkCtx({ war: null })) === 0);
  ok('war_status: wyczerpanie PONIŻEJ ceny pokoju → ujemne',
    T.war_status(mkCtx({ war: { exhaustionSelf: 10, exhaustionOther: 10, peaceCost: 30 } })) < 0);
  ok('war_status: wyczerpanie POWYŻEJ ceny pokoju → dodatnie',
    T.war_status(mkCtx({ war: { exhaustionSelf: 60, exhaustionOther: 60, peaceCost: 30 } })) > 0);
  ok('war_status: liczy MINIMUM obu stron („obie strony muszą mieć exhaustion ≥ cena")',
    T.war_status(mkCtx({ war: { exhaustionSelf: 90, exhaustionOther: 10, peaceCost: 30 } }))
    === T.war_status(mkCtx({ war: { exhaustionSelf: 10, exhaustionOther: 90, peaceCost: 30 } })));
  ok('war_status: eksterminacja (cena 100) przy pełnym wyczerpaniu → 0, nie premia',
    T.war_status(mkCtx({ war: { exhaustionSelf: 100, exhaustionOther: 100, peaceCost: 100 } })) === 0);

  ok('personality: oś w środku skali → 0',
    T.personality(mkCtx({ personality: { trade: 0.5 } }), cfg) === 0);
  ok('personality: oś maksymalna → +1, minimalna → −1',
    T.personality(mkCtx({ personality: { trade: 1 } }), cfg) === 1
    && T.personality(mkCtx({ personality: { trade: 0 } }), cfg) === -1);
  ok('personality: BRAK osi / brak imperium → 0 (degradacja bez kary)',
    T.personality(mkCtx({ personality: {} }), cfg) === 0
    && T.personality(mkCtx({ personality: null }), cfg) === 0);
  ok('personality: ujemny współczynnik odwraca kierunek (agresja szkodzi paktowi)',
    T.personality(mkCtx({ personality: { aggression: 1 } }), VERB_ACCEPTANCE.non_aggression) === -1
    && T.personality(mkCtx({ personality: { aggression: 0 } }), VERB_ACCEPTANCE.non_aggression) === 1);
  ok('personality: dwie osie się sumują i są przycinane do ±1',
    T.personality(mkCtx({ personality: { aggression: 0, trade: 1 } }), VERB_ACCEPTANCE.alliance) === 1);

  ok('reputation: agresor 100 → −1, czysty → 0',
    T.reputation(mkCtx({ proposerAggression: 100 })) === -1 && T.reputation(mkCtx()) === 0);

  ok('offer: brak oferty → 0', T.offer(mkCtx({ offer: null })) === 0);
  ok('offer: skala połówkowa → ~0.5', Math.abs(T.offer(mkCtx({ offer: { credits: OFFER_HALF_KR } })) - 0.5) < 1e-12);

  ok('memory: pusta pamięć → 0', T.memory(mkCtx({ memory: [] })) === 0);
  ok('memory: typy Z INNEGO KANAŁU nie punktują (anty-podwójne-liczenie)',
    T.memory(mkCtx({ memory: [
      { type: 'military_presence' }, { type: 'territorial_violation' }, { type: 'war_declared' },
    ] })) === 0);

  ok('recent_refusal: brak odmowy → 0', T.recent_refusal(mkCtx()) === 0);
  ok('recent_refusal: odmowa przed chwilą → −1',
    T.recent_refusal(mkCtx({ year: 100, verbCooldowns: { trade_agreement: 100 } })) === -1);
  ok('recent_refusal: w połowie okresu → −0.5',
    T.recent_refusal(mkCtx({ year: 101, verbCooldowns: { trade_agreement: 100 } })) === -0.5);
  ok('recent_refusal: po upływie okresu → 0',
    T.recent_refusal(mkCtx({ year: 100 + RECENT_REFUSAL_YEARS, verbCooldowns: { trade_agreement: 100 } })) === 0);
  ok('recent_refusal: dotyczy TEGO czasownika, nie wszystkich',
    T.recent_refusal(mkCtx({ verb: 'alliance', year: 100, verbCooldowns: { trade_agreement: 100 } })) === 0);
  ok('recent_refusal: odmowa „z przyszłości" (wczytany zapis) → 0, nie premia',
    T.recent_refusal(mkCtx({ year: 90, verbCooldowns: { trade_agreement: 100 } })) === 0);

  ok('third_party: pusty układ → 0', T.third_party(mkCtx()) === 0);
  ok('third_party: sojusznik pomaga',
    T.third_party(mkCtx({ thirdParty: { isOurAlly: true } })) === THIRD_PARTY_WEIGHTS.our_ally);
  ok('third_party: sojusznik naszego wroga szkodzi',
    T.third_party(mkCtx({ thirdParty: { alliesOfOurEnemies: 1 } })) === THIRD_PARTY_WEIGHTS.ally_of_our_enemy);
  ok('third_party: wróg naszego wroga pomaga',
    T.third_party(mkCtx({ thirdParty: { atWarWithOurEnemy: 1 } })) === THIRD_PARTY_WEIGHTS.at_war_with_our_enemy);
  ok('third_party: składniki się sumują i są przycinane',
    T.third_party(mkCtx({ thirdParty: { alliesOfOurEnemies: 10 } })) === -1);

  ok('erratic_noise: BEZ cechy erratic → 0 (choćby ziarno było skrajne)',
    T.erratic_noise(mkCtx({ traits: [], erraticSeed: 12345 })) === 0
    && T.erratic_noise(mkCtx({ traits: ['other'], erraticSeed: 12345 })) === 0);
  ok('erratic_noise: Z cechą → deterministyczny szum w ±1', (() => {
    const c = mkCtx({ traits: ['erratic'], erraticSeed: 12345 });
    const v = TERM_EVALUATORS.erratic_noise(c);
    return v === TERM_EVALUATORS.erratic_noise(c) && v >= -1 && v <= 1 && v !== 0;
  })());
  ok('erratic_noise: inne ziarno → inny szum (epoka zmienia humor)',
    T.erratic_noise(mkCtx({ traits: ['erratic'], erraticSeed: 1 }))
    !== T.erratic_noise(mkCtx({ traits: ['erratic'], erraticSeed: 2 })));
}

// ── P5: rozbicie i sumowanie ────────────────────────────────────────────────
console.log('--- P5: rozbicie akceptacji + sumowanie ---');
{
  const rows = buildAcceptanceBreakdown(
    { opinion: 0.5, tension: 0.2, memory: 0 },
    { opinion: 40, tension: -10, memory: 20 },
    ACCEPTANCE_TERMS,
  );
  ok('rozbicie zwraca wiersz na KAŻDY term czasownika (także zerowy — telemetria E7)', rows.length === 3);
  ok('wartość wiersza = raw × waga', rows.find(r => r.term === 'opinion').value === 20);
  ok('ujemna waga odwraca znak (napięcie szkodzi umowie)', rows.find(r => r.term === 'tension').value === -2);
  ok('kolejność malejąco po |wartość|', rows[0].term === 'opinion' && rows[1].term === 'tension');
  ok('wiersz niesie labelKey i status z katalogu',
    rows[0].labelKey === 'diplo.term.opinion' && rows[0].status === TERM_STATUS.LIVE);
  ok('nieznany term degraduje etykietę do id (panel się nie wywala)',
    buildAcceptanceBreakdown({ zzz: 1 }, { zzz: 5 }, ACCEPTANCE_TERMS)[0].labelKey === 'zzz');
  ok('sumScore = suma wkładów', sumScore(rows) === 18);
  ok('wiersze sumują się do wyniku CO DO CYFRY',
    roundScore(rows.reduce((s, r) => s + r.value, 0)) === sumScore(rows));
  ok('visibleBreakdown usuwa wiersze zerowe (nie udajemy mechaniki)',
    visibleBreakdown(rows).length === 2 && visibleBreakdown(rows).every(r => r.value !== 0));
  ok('remis |wartość| rozstrzygany po id (stabilna kolejność)', (() => {
    const r = buildAcceptanceBreakdown({ opinion: 1, memory: -1 }, { opinion: 10, memory: 10 }, ACCEPTANCE_TERMS);
    return r[0].term === 'memory' && r[1].term === 'opinion';
  })());
  ok('decide: próg jest domykający (≥, nie >)', decide(10, 10) && !decide(9.999, 10));
}

// ── P6: pre-warunki (twarde blokady) ────────────────────────────────────────
console.log('--- P6: pre-warunki ---');
{
  const trade = VERB_ACCEPTANCE.trade_agreement;
  ok('not_at_war: pokój przechodzi', checkPreconditions(mkCtx({ status: 'peace' }), trade).blocked === false);
  ok('not_at_war: wojna blokuje z powodem', (() => {
    const r = checkPreconditions(mkCtx({ status: 'war' }), trade);
    return r.blocked === true && r.reasonKey === 'diplo.reject.atWar';
  })());
  ok('not_already_signed: obowiązujący traktat blokuje', (() => {
    const r = checkPreconditions(mkCtx({ treaties: [{ id: 'trade_agreement' }] }), trade);
    return r.blocked === true && r.reasonKey === 'diplo.reject.alreadySigned';
  })());
  ok('not_already_signed: INNY traktat nie blokuje',
    checkPreconditions(mkCtx({ treaties: [{ id: 'alliance' }] }), trade).blocked === false);
  ok('at_war (pokój): brak wojny blokuje propozycję pokoju', (() => {
    const r = checkPreconditions(mkCtx({ status: 'peace' }), VERB_ACCEPTANCE.offer_peace);
    return r.blocked === true && r.reasonKey === 'diplo.reject.notAtWar';
  })());
  ok('at_war (pokój): w czasie wojny przechodzi',
    checkPreconditions(mkCtx({ status: 'war' }), VERB_ACCEPTANCE.offer_peace).blocked === false);
  ok('emisariusz ŚWIADOMIE bez bramki wojny (sonda pokojowa jest dozwolona)',
    checkPreconditions(mkCtx({ status: 'war' }), VERB_ACCEPTANCE.improve_relations).blocked === false);
  throws('nieznany pre-warunek RZUCA (literówka nie znika po cichu)',
    () => checkPreconditions(mkCtx(), { preconditions: ['nie_ma_takiego'] }));

  const blocked = evaluateWithContext(mkCtx({ verb: 'trade_agreement', status: 'war' }));
  ok('blokada: decision=false, blocked=true, PUSTE rozbicie (oceny nie było)',
    blocked.decision === false && blocked.blocked === true && blocked.breakdown.length === 0
    && blocked.score === 0 && blocked.counterHint === null);
}

// ── P7: KOTWICE PARYTETU — cel retrofitu w E2 ───────────────────────────────
console.log('--- P7: parytet z dawnymi progami 60/75/80 (roster industrialist/expansionist) ---');
{
  // Dawna reguła (DiplomacySystem.proposeTreaty przed D2), przez mostek trust = 50 + opinia:
  //   trade_agreement  trade ≥ 0.5 && trust ≥ 60  ⇒ opinia ≥ 10
  //   non_aggression   aggr  ≤ 0.4 && trust ≥ 75  ⇒ opinia ≥ 25
  //   alliance         aggr  ≤ 0.3 && trust ≥ 80  ⇒ opinia ≥ 30
  // Oba imperia AI w grze mają aggression 0.3 / trade 0.9, więc bramki osobowości przechodzą
  // i jedyną realną bramką jest opinia. ⚠ Parytet obowiązuje przy NAPIĘCIU 0 — dawny kod
  // napięcia nie czytał, a term `tension` je waży (zmiana zamierzona, mierzona przez E7).
  const at = (verb, opinion) => evaluateWithContext(mkCtx({
    verb, opinion, personality: ROSTER_PERSONALITY, archetype: 'industrialist', tension: 0,
  }));
  const boundary = (verb, expected) => {
    ok(`${verb}: opinia ${expected} AKCEPTOWANA (dawny próg)`, at(verb, expected).decision === true);
    ok(`${verb}: opinia ${expected - 1} ODRZUCONA (punkt poniżej dawnego progu)`, at(verb, expected - 1).decision === false);
  };
  boundary('trade_agreement', 10);
  boundary('non_aggression', 25);
  boundary('alliance', 30);

  ok('parytet trzyma się też dla expansionist (klon wektora industrialist)',
    ARCHETYPES.expansionist.personality.trade === ROSTER_PERSONALITY.trade
    && ARCHETYPES.expansionist.personality.aggression === ROSTER_PERSONALITY.aggression);

  // Świadome ODEJŚCIE od dawnego zachowania — kierunek znaku napięcia (backbone §2.1).
  const nap = (tension) => evaluateWithContext(mkCtx({
    verb: 'non_aggression', opinion: 20, tension, personality: ROSTER_PERSONALITY, archetype: 'industrialist',
  }));
  ok('ZMIANA: napięcie SPRZYJA paktowi o nieagresji', nap(80).score > nap(0).score);
  const ali = (tension) => evaluateWithContext(mkCtx({
    verb: 'alliance', opinion: 40, tension, personality: ROSTER_PERSONALITY, archetype: 'industrialist',
  }));
  ok('ZMIANA: napięcie SZKODZI sojuszowi', ali(80).score < ali(0).score);
}

// ── P8: pełna ocena — próg, decyzja, nadpisania archetypu ───────────────────
console.log('--- P8: pełna ocena i nadpisania archetypu ---');
{
  const base = { opinion: 30, personality: ROSTER_PERSONALITY, tension: 0 };
  const neutral = evaluateWithContext(mkCtx({ verb: 'trade_agreement', ...base, archetype: 'industrialist' }));
  const xeno    = evaluateWithContext(mkCtx({ verb: 'trade_agreement', ...base, archetype: 'xenophage' }));
  ok('xenofag ma WYŻSZY próg niż roster bazowy', xeno.threshold > neutral.threshold);
  ok('xenofag mniej ceni opinię (mnożnik 0.7)',
    xeno.breakdown.find(r => r.term === 'opinion').weight < neutral.breakdown.find(r => r.term === 'opinion').weight);
  ok('ta sama propozycja: roster akceptuje, xenofag odrzuca',
    neutral.decision === true && xeno.decision === false);
  ok('nieznany archetyp → brak nadpisań, ocena się nie wywala', (() => {
    const r = evaluateWithContext(mkCtx({ verb: 'trade_agreement', ...base, archetype: 'nie_ma_takiego' }));
    return r.threshold === neutral.threshold && Number.isFinite(r.score);
  })());
  ok('wynik niesie komplet pól kontraktu', (() => {
    const k = Object.keys(neutral).sort().join(',');
    return k === 'blocked,breakdown,counterHint,decision,fromId,reasonKey,score,threshold,toId,verb';
  })());
  ok('nadpisanie objective jest DZIŚ no-opem (E5 to zmieni)', (() => {
    const withObj = evaluateWithContext(mkCtx({ verb: 'trade_agreement', ...base, archetype: 'industrialist', objective: 'merchant' }));
    return withObj.score === neutral.score && withObj.threshold === neutral.threshold;
  })());
  throws('nieznany czasownik RZUCA (propozycja spoza katalogu = błąd wołającego)',
    () => evaluateWithContext(mkCtx({ verb: 'nie_ma_takiego' })));

  // Pokój: wyczerpanie wojną jest głównym argumentem (E3 to wpina).
  const peace = (exh, cost) => evaluateWithContext(mkCtx({
    verb: 'offer_peace', status: 'war', opinion: -40, tension: 80,
    personality: ROSTER_PERSONALITY, archetype: 'industrialist',
    war: { exhaustionSelf: exh, exhaustionOther: exh, peaceCost: cost },
  }));
  ok('pokój ODRZUCONY przy niskim wyczerpaniu', peace(10, 30).decision === false);
  ok('pokój PRZYJĘTY przy wysokim wyczerpaniu', peace(80, 30).decision === true);
  ok('peaceCost realnie waży (droższy casus belli → trudniejszy pokój)',
    peace(50, 30).score > peace(50, 70).score);
  ok('peaceCost ma wreszcie czytelnika: wyczerpanie 60 vs cena 30 i 100 daje INNĄ decyzję',
    peace(60, 30).decision === true && peace(60, 100).decision === false);
}

// ── P9: degradacja przy braku danych ────────────────────────────────────────
console.log('--- P9: degradacja (brak danych ≠ wyjątek) ---');
{
  const bare = evaluateWithContext({ verb: 'trade_agreement' });
  ok('kontekst niemal pusty → wynik liczbowy, bez wyjątku', Number.isFinite(bare.score));
  ok('kontekst niemal pusty → same zera w rozbiciu', bare.breakdown.every(r => r.value === 0));
  ok('brak wojny → term war_status nie psuje oceny pokoju',
    Number.isFinite(evaluateWithContext({ verb: 'offer_peace', status: 'war' }).score));
  ok('emisariusz od neutralnego imperium jest domyślnie PRZYJMOWANY (dziś zawsze tak)',
    evaluateWithContext(mkCtx({ verb: 'improve_relations', personality: ROSTER_PERSONALITY, archetype: 'industrialist' })).decision === true);
  ok('emisariusz ODRZUCONY przez wrogie imperium w stanie wojny',
    evaluateWithContext(mkCtx({
      verb: 'improve_relations', status: 'war', opinion: -60, tension: 90,
      personality: ARCHETYPES.xenophage.personality, archetype: 'xenophage',
    })).decision === false);
}

// ── P10: pin bezczynności — nie stroić wag względem zera ────────────────────
console.log('--- P10: termy bezczynne (K-1..K-5) ---');
{
  ok('relative_power ma status STUB', ACCEPTANCE_TERMS.relative_power.status === TERM_STATUS.STUB);
  const rich = mkCtx({
    opinion: 50, tension: 50, personality: ROSTER_PERSONALITY, archetype: 'industrialist',
    proposerAggression: 80, war: { exhaustionSelf: 50, exhaustionOther: 50, peaceCost: 30 }, status: 'war',
  });
  for (const verb of ACCEPTANCE_VERB_IDS) {
    if (!VERB_ACCEPTANCE[verb].terms.relative_power) continue;
    const r = evaluateWithContext({ ...rich, verb, status: verb === 'offer_peace' ? 'war' : 'peace' });
    const row = r.breakdown.find(x => x.term === 'relative_power');
    ok(`relative_power wnosi DOKŁADNIE 0 w '${verb}' (mimo niezerowej wagi)`, row && row.value === 0 && row.weight !== 0);
  }
  ok('reputation ma status UNFED (raisery agresji dopiero w D4)',
    ACCEPTANCE_TERMS.reputation.status === TERM_STATUS.UNFED);
  ok('reputation JEST policzalny, gdy ktoś wreszcie podniesie agresję',
    TERM_EVALUATORS.reputation(mkCtx({ proposerAggression: 50 })) === -0.5);
  ok('third_party ma status PARTIAL (pary AI↔AI dopiero w D5)',
    ACCEPTANCE_TERMS.third_party.status === TERM_STATUS.PARTIAL);
  ok('offer / memory / recent_refusal / erratic_noise oznaczone jako UNFED',
    ['offer', 'memory', 'recent_refusal', 'erratic_noise']
      .every(id => ACCEPTANCE_TERMS[id].status === TERM_STATUS.UNFED));
  ok('termy z realnym źródłem w D2 oznaczone jako LIVE',
    ['opinion', 'tension', 'personality', 'war_status']
      .every(id => ACCEPTANCE_TERMS[id].status === TERM_STATUS.LIVE));
}

// ── P11: counterHint ────────────────────────────────────────────────────────
console.log('--- P11: counterHint (emitowany, świadomie bez konsumenta) ---');
{
  const w = { opinion: 40, offer: 20 };
  ok('propozycja przyjęta → brak podpowiedzi', counterHintFor(30, 28, w) === null);
  ok('mała luka → konkretna kwota w kredytach', (() => {
    const h = counterHintFor(24, 28, w);
    return !!h && h.addOffer.credits > 0 && h.addOffer.credits % COUNTER_HINT_KR_STEP === 0;
  })());
  ok('większa luka → większa sugerowana kwota',
    counterHintFor(20, 28, w).addOffer.credits > counterHintFor(26, 28, w).addOffer.credits);
  ok('luka ponad COUNTER_HINT_MAX_GAP → brak podpowiedzi (odmowa merytoryczna)',
    counterHintFor(-100, COUNTER_HINT_MAX_GAP + 1, w) === null);
  ok('czasownik bez termu offer → brak podpowiedzi', counterHintFor(20, 28, { opinion: 40 }) === null);
  ok('luka większa niż cała waga oferty → brak podpowiedzi (nieosiągalne)',
    counterHintFor(0, 25, { offer: 20 }) === null);
  ok('podpowiedź uwzględnia JUŻ dołożoną ofertę', (() => {
    const a = counterHintFor(24, 28, w, { offerAlready: 0 });
    const b = counterHintFor(24, 28, w, { offerAlready: 400 });
    return !!a && !!b && b.addOffer.credits > a.addOffer.credits;   // dalej po krzywej ⇒ drożej
  })());
  ok('odrzucona ocena niesie counterHint w wyniku', (() => {
    const r = evaluateWithContext(mkCtx({
      verb: 'trade_agreement', opinion: 2, personality: ROSTER_PERSONALITY, archetype: 'industrialist',
    }));
    return r.decision === false && r.counterHint !== null && r.counterHint.addOffer.credits > 0;
  })());
}

// ── P12: i18n — parytet pl↔en dla nowych kluczy ─────────────────────────────
console.log('--- P12: i18n (klucze rozwiązywane dynamicznie — check-i18n ich NIE waliduje) ---');
{
  // t(row.labelKey) jest dla check-i18n wywołaniem DYNAMICZNYM, więc brak klucza nie
  // zablokowałby commita. Parytet pilnujemy tutaj — wzór diplomacy_d1_smoke.
  const termKeys = ACCEPTANCE_TERM_IDS.map(id => ACCEPTANCE_TERMS[id].labelKey);
  const reasonKeys = Object.values(PRECONDITIONS).map(p => p.reasonKey);
  for (const k of [...termKeys, ...reasonKeys]) {
    ok(`klucz '${k}' istnieje w pl i en`, !!plDict[k] && !!enDict[k]);
  }
  ok('etykiety PL i EN są RÓŻNE (nie skopiowano polskiego do en.js)',
    termKeys.every(k => plDict[k] !== enDict[k]));
  ok('klucze powodów mają prefiks diplo.reject.', reasonKeys.every(k => k.startsWith('diplo.reject.')));
  ok('epoka szumu erratic jest zadeklarowana (E5 z niej korzysta)', ERRATIC_EPOCH_YEARS > 0);
}

// ── P13: buildContext — jedyna nieczysta część silnika ──────────────────────
console.log('--- P13: buildContext (kolaboratorzy WSTRZYKNIĘCI, bez atrapy przeglądarki) ---');
{
  // Konstruktor przyjmuje `deps` zamiast czytać window.KOSMOS — dlatego tę część da się
  // przetestować BEZ shimowania globali (czyli bez łamania dowodu dekouplingu z nagłówka).
  const calls = [];
  const mkDeps = (over = {}) => ({
    timeSystem: { gameTime: 250 },
    galaxyData: { seed: 12345 },
    diplomacySystem: {
      getReputation: (id) => ({ aggression: id === 'player' ? 40 : 0 }),
      relations: {
        getOpinion: (ofId, aboutId) => { calls.push(['getOpinion', ofId, aboutId]); return 33; },
        getTension: () => 55,
        getStatus:  () => 'peace',
        getTreaties: () => [{ id: 'trade_agreement' }],
        getMemory:  (a, b, limit) => { calls.push(['getMemory', limit]); return [{ type: 'war_declared' }]; },
        getOrNull:  () => ({ verbCooldowns: { alliance: 249 } }),
        hasTreaty:  () => false,
        listPairsWith: () => [],
      },
    },
    empireRegistry: {
      get: (id) => (id === 'emp_001'
        ? { id, archetype: 'industrialist', objective: 'merchant', traits: ['erratic'], personality: ROSTER_PERSONALITY }
        : null),
    },
    warSystem: { getWarWith: () => null },
    ...over,
  });

  const eng = new AcceptanceEngine(mkDeps());
  const ctx = eng.buildContext('player', 'emp_001', { verb: 'alliance', offer: { credits: 300 } });

  ok('kontekst przenosi rok gry z TimeSystem', ctx.year === 250);
  ok('KIERUNEK opinii: czytamy opinię OCENIAJĄCEGO o PROPONUJĄCYM, nie odwrotnie',
    calls.some(c => c[0] === 'getOpinion' && c[1] === 'emp_001' && c[2] === 'player'));
  ok('kontekst przenosi napięcie, status i traktaty pary',
    ctx.tension === 55 && ctx.status === 'peace' && ctx.treaties[0].id === 'trade_agreement');
  ok('pamięć czytana WŁASNYM oknem akceptacji', calls.some(c => c[0] === 'getMemory' && c[1] === MEMORY_WINDOW));
  ok('osobowość / archetyp / objective / cechy brane od OCENIAJĄCEGO',
    ctx.personality === ROSTER_PERSONALITY && ctx.archetype === 'industrialist'
    && ctx.objective === 'merchant' && ctx.traits.includes('erratic'));
  ok('reputacja brana od PROPONUJĄCEGO (to jego infamia waży)', ctx.proposerAggression === 40);
  ok('verbCooldowns czytane z rekordu pary (E4 je tam zapisze)', ctx.verbCooldowns.alliance === 249);
  ok('oferta przechodzi z propozycji', ctx.offer.credits === 300);
  ok('brak aktywnej wojny → war === null (to stan gry, nie błąd)', ctx.war === null);
  ok('ziarno szumu jest liczbą i zależy od czasownika', (() => {
    const other = eng.buildContext('player', 'emp_001', { verb: 'trade_agreement' });
    return Number.isInteger(ctx.erraticSeed) && ctx.erraticSeed !== other.erraticSeed;
  })());
  ok('ziarno szumu jest STAŁE w obrębie epoki, a zmienia się po jej upływie', (() => {
    const sameEpoch = new AcceptanceEngine(mkDeps({ timeSystem: { gameTime: 250 + ERRATIC_EPOCH_YEARS - 1 } }))
      .buildContext('player', 'emp_001', { verb: 'alliance' }).erraticSeed;
    const nextEpoch = new AcceptanceEngine(mkDeps({ timeSystem: { gameTime: 250 + ERRATIC_EPOCH_YEARS } }))
      .buildContext('player', 'emp_001', { verb: 'alliance' }).erraticSeed;
    return sameEpoch === ctx.erraticSeed && nextEpoch !== ctx.erraticSeed;
  })());
  ok('ziarno szumu zależy od seeda galaktyki (dwie partie ≠ ten sam humor)',
    new AcceptanceEngine(mkDeps({ galaxyData: { seed: 999 } }))
      .buildContext('player', 'emp_001', { verb: 'alliance' }).erraticSeed !== ctx.erraticSeed);

  ok('evaluateProposal spina kontekst z oceną i zwraca decyzję', (() => {
    const r = new AcceptanceEngine(mkDeps()).evaluateProposal('player', 'emp_001', { verb: 'alliance' });
    return typeof r.decision === 'boolean' && r.verb === 'alliance' && r.breakdown.length > 0;
  })());
  ok('twardy pre-warunek działa na ŻYWYM kontekście (traktat już obowiązuje)', (() => {
    const r = new AcceptanceEngine(mkDeps()).evaluateProposal('player', 'emp_001', { verb: 'trade_agreement' });
    return r.blocked === true && r.reasonKey === 'diplo.reject.alreadySigned';
  })());

  // Wojna: kontekst musi wziąć wyczerpanie po ID STRONY, nie po roli agresor/obrońca.
  ok('kontekst wojny mapuje wyczerpanie po id strony i cenę pokoju z casus belli', (() => {
    const withWar = new AcceptanceEngine(mkDeps({
      warSystem: { getWarWith: () => ({ id: 'w1', active: true, casusBelli: 'ideology', exhaustion: { player: 20, emp_001: 70 } }) },
    })).buildContext('player', 'emp_001', { verb: 'offer_peace' });
    return withWar.war.exhaustionSelf === 70 && withWar.war.exhaustionOther === 20 && withWar.war.peaceCost === 70;
  })());
  ok('nieznany casus belli → cennik incydentu granicznego (jak w WarSystem)', (() => {
    const w = new AcceptanceEngine(mkDeps({
      warSystem: { getWarWith: () => ({ id: 'w2', active: true, casusBelli: 'nie_ma_takiego', exhaustion: {} }) },
    })).buildContext('player', 'emp_001', { verb: 'offer_peace' });
    return w.war.peaceCost === 30;
  })());
  ok('zakończona wojna → war === null', (() => {
    const w = new AcceptanceEngine(mkDeps({
      warSystem: { getWarWith: () => ({ id: 'w3', active: false, exhaustion: {} }) },
    })).buildContext('player', 'emp_001', { verb: 'offer_peace' });
    return w.war === null;
  })());
  ok('brak WarSystem → war === null, bez wyjątku (system OPCJONALNY)', (() => {
    const w = new AcceptanceEngine(mkDeps({ warSystem: undefined }))
      .buildContext('player', 'emp_001', { verb: 'offer_peace' });
    return w.war === null;
  })());
  ok('brak imperium (oceniającym jest GRACZ) → osobowość neutralna, bez wyjątku', (() => {
    const w = new AcceptanceEngine(mkDeps()).buildContext('emp_001', 'player', { verb: 'alliance' });
    return w.archetype === null && Object.keys(w.personality).length === 0;
  })());

  // Głośna awaria (audyt R12): brak WYMAGANYCH kolaboratorów to błąd wpięcia, nie stan gry.
  throws('brak DiplomacySystem RZUCA', () => new AcceptanceEngine({ empireRegistry: { get: () => null } })
    .buildContext('player', 'emp_001', { verb: 'alliance' }));
  throws('brak EmpireRegistry RZUCA', () => new AcceptanceEngine({ diplomacySystem: mkDeps().diplomacySystem })
    .buildContext('player', 'emp_001', { verb: 'alliance' }));
  throws('brak kolaboratorów w ogóle RZUCA (a nie po cichu zwraca „tak")',
    () => new AcceptanceEngine().buildContext('player', 'emp_001', { verb: 'alliance' }));
}

// ── P14: E1 STOI SAMODZIELNIE — zero wpięć ──────────────────────────────────
console.log('--- P14: brak wpięć (E1 jak C1 w D1) ---');
{
  // Warunek zamknięcia E1 z planu: nic w grze jeszcze tego nie importuje. Sprawdzamy
  // wykonaniem, a nie obietnicą w opisie commita — retrofit to E2 (traktaty) i E3 (pokój/envoy).
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join, resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs)$/.test(name)) continue;
      if (full.includes('testing')) continue;                    // testy MAJĄ importować
      if (/Acceptance(WeightData|Math|Engine)\.js$/.test(name)) continue;   // moduły fazy same siebie
      const src = readFileSync(full, 'utf8');
      if (/AcceptanceEngine|AcceptanceMath|AcceptanceWeightData/.test(src)) hits.push(full.slice(SRC.length + 1));
    }
  };
  walk(SRC);
  ok(`silnik nie jest jeszcze przez nic importowany${hits.length ? ' — ZNALEZIONO: ' + hits.join(', ') : ''}`,
    hits.length === 0);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
