// WOJNA I POKÓJ 1.0 — D2/E7 — smoke: czujnik DIPLOMACY (macierz + sonda + agregacja).
// Uruchom: node src/testing/smoke/balans_diplomacy_telemetry_smoke.mjs
//
// DLACZEGO ISTNIEJE: przyrząd nie ma browser live-gate'u. Zepsuty czujnik = zepsuty werdykt
// BEZ ŚLADU — a na tej macierzy stoi cała konwersja progów w E2. Ten keeper pilnuje, że
// macierz mierzy to, co deklaruje, i że oznaczenia uczciwości są DOWODZONE, nie deklarowane.
//
// ⚠ Czysta logika: macierz i sonda NIE potrzebują żywej gry (silnik jest czysty przy podanym
// kontekście). Klasa DiplomacyTelemetry czyta window.KOSMOS, więc jej sample() testujemy na
// wstrzykniętym globalu — to jedyne miejsce z atrapą.
//
// Pokrywa: kształt macierzy, KOTWICE PARYTETU (cel E2), degenerację, „na styk", sondę
// wrażliwości termów (rozróżnienie „nie da się ruszyć" vs „brak paliwa"), katalog termów,
// migawkę relacji, agregację i obie gałęzie outcome 3.

import {
  DiplomacyTelemetry, DIPLO_TELEMETRY_DEFAULTS, DIPLO_HEALTH,
  MATRIX_OPINION_GRID, matrixBaseContext, matrixConditionsNote,
  buildAcceptanceMatrix, probeTermImpact, termCatalogRows,
  relationSnapshot, summarizeSeed, aggregatePanel, verdict,
} from '../headless/DiplomacyTelemetry.js';
import {
  ACCEPTANCE_TERMS, ACCEPTANCE_TERM_IDS, ACCEPTANCE_VERB_IDS, VERB_ACCEPTANCE, TERM_STATUS,
} from '../../data/AcceptanceWeightData.js';
import { ARCHETYPE_IDS, EMPIRE_OBJECTIVES } from '../../data/EmpireData.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const MATRIX = buildAcceptanceMatrix();
const PROBE  = probeTermImpact();
const TERMS  = termCatalogRows(PROBE);
const cell = (a, o, v) => MATRIX.cells.find(c => c.archetype === a && c.objective === o && c.verb === v);

// ── T1: kształt macierzy ────────────────────────────────────────────────────
console.log('--- T1: kształt macierzy ---');
{
  ok('macierz pokrywa archetyp × agenda × czasownik',
    MATRIX.cells.length === ARCHETYPE_IDS.length * EMPIRE_OBJECTIVES.length * ACCEPTANCE_VERB_IDS.length);
  ok('każda komórka niesie próg, granicę i odsetek akceptacji',
    MATRIX.cells.every(c => Number.isFinite(c.threshold)
      && (c.minOpinion === null || Number.isFinite(c.minOpinion))
      && (c.blocked || Number.isFinite(c.acceptPct))));
  ok('siatka opinii zawiera DAWNE progi traktatów i punkt tuż pod każdym',
    [10, 25, 30, 9, 24, 29].every(v => MATRIX_OPINION_GRID.includes(v)));
  ok('siatka jest posortowana rosnąco (granica = PIERWSZA akceptacja)',
    MATRIX_OPINION_GRID.every((v, i) => i === 0 || v > MATRIX_OPINION_GRID[i - 1]));
  ok('minOpinion to NAJNIŻSZA akceptowana opinia — punkt tuż pod nią zawsze odmawia', (() => {
    // Sprawdzane WYKONANIEM na każdej niepustej komórce: przeliczamy siatkę o jeden krok
    // niżej i żądamy, żeby granica przeskoczyła. Inaczej „granica" byłaby dowolnym trafieniem.
    return MATRIX.cells.filter(c => c.minOpinion != null).every((c) => {
      const idx = MATRIX_OPINION_GRID.indexOf(c.minOpinion);
      if (idx <= 0) return true;                       // granica na pierwszym punkcie siatki
      const below = buildAcceptanceMatrix({
        verbs: [c.verb], archetypes: [c.archetype], objectives: [c.objective],
        opinionGrid: [MATRIX_OPINION_GRID[idx - 1]],
      });
      return below.cells[0].acceptPct === 0;
    });
  })());
  ok('warunki macierzy są UDOKUMENTOWANE w artefakcie (czytelnik wie, co trzymano stałe)',
    !!matrixConditionsNote().note && matrixConditionsNote().tension === 0);
  ok('pokój dostaje WŁASNE warunki bazowe (inaczej pre-warunek wyzerowałby kolumnę)', (() => {
    const p = matrixBaseContext('offer_peace');
    return p.status === 'war' && p.war && p.war.peaceCost > 0;
  })());
  ok('kolumna pokoju NIE jest zablokowana w macierzy',
    MATRIX.cells.filter(c => c.verb === 'offer_peace').every(c => !c.blocked));
}

// ── T2: KOTWICE PARYTETU — to jest cel E2 ───────────────────────────────────
console.log('--- T2: kotwice parytetu (dawne progi 60/75/80 dla rosteru gry) ---');
{
  // ⚠ E5 ZAWĘZIŁ TĘ KOTWICĘ: dawniej „granica X dla KAŻDEJ agendy", dziś „dla agendy
  // REFERENCYJNEJ". To świadome przebazowanie podpisanej własności E2, nie poluzowanie
  // testu — oś agendy z definicji przestała być no-opem, więc parytet „dla każdej agendy"
  // był od E5 nie do utrzymania. Kotwica przetrwała w mocniejszej formie: `merchant` NIE MA
  // nadpisania (AcceptanceWeightData), więc dawne progi 60/75/80 są nadal odtwarzane CO DO
  // PUNKTU, a nie „mniej więcej". Parytet ma punkt odniesienia; agenda ma rozrzut wokół niego.
  const REFERENCE_OBJECTIVE = 'merchant';
  const EXPECT = { trade_agreement: 10, non_aggression: 25, alliance: 30 };
  for (const archetype of ['industrialist', 'expansionist']) {
    for (const [verb, want] of Object.entries(EXPECT)) {
      ok(`${archetype} / ${verb}: granica ${want} dla agendy referencyjnej (parytet E2)`,
        cell(archetype, REFERENCE_OBJECTIVE, verb)?.minOpinion === want);
    }
  }
  // Odwrócony pin: dawniej „agenda NIE rusza jeszcze wyniku (E5 to zmieni)".
  // To jest headless'owy odpowiednik tezy live-gate'u E5.
  //
  // ⚠ Komórki ZABLOKOWANE (`acceptPct === null`) są z tego wyłączone i to NIE jest
  // ustępstwo: podłoga osobowości to pre-warunek sprawdzany PRZED liczeniem wag (ruling
  // E2 — osobowość jest PODŁOGĄ, nie termem, dowód `O ≥ 8·P`). Natura xenofaga zabrania
  // umowy handlowej niezależnie od tego, czego imperium akurat chce; gdyby agenda ruszała
  // te komórki, znaczyłoby to, że podłoga przestała być podłogą. Teza brzmi więc:
  // wszędzie tam, gdzie propozycja jest w ogóle OCENIANA, agenda zmienia wynik.
  const scored = (a, v) => EMPIRE_OBJECTIVES
    .map(o => cell(a, o, v))
    .filter(c => c && !c.blocked && c.acceptPct !== null);
  ok('agenda RUSZA wynik wszędzie, gdzie propozycja jest OCENIANA (teza gate\'u E5)',
    ARCHETYPE_IDS.every(a => ['trade_agreement', 'non_aggression', 'alliance'].every(v => {
      const cs = scored(a, v);
      return cs.length === 0 || new Set(cs.map(c => c.acceptPct)).size > 1;
    })));
  ok('…i dotyczy to ROSTERU gry, nie tylko archetypów egzotycznych',
    ['industrialist', 'expansionist'].every(a => ['trade_agreement', 'non_aggression', 'alliance']
      .every(v => new Set(scored(a, v).map(c => c.acceptPct)).size > 1)));
  ok('…a rozrzut jest UPORZĄDKOWANY: militarist nigdy nie jest łatwiejszy niż diplomat',
    ARCHETYPE_IDS.every(a => ACCEPTANCE_VERB_IDS.every(v =>
      (cell(a, 'militarist', v)?.threshold ?? 0) > (cell(a, 'diplomat', v)?.threshold ?? 0))));
  ok('akceptacja jest MONOTONICZNA po opinii (wyższa opinia nigdy nie szkodzi traktatowi)', (() => {
    const c = cell('industrialist', 'merchant', 'trade_agreement');
    // odsetek = udział siatki powyżej granicy ⇒ przy granicy 10 i siatce 16 pozycji: 9 pozycji ≥ 10
    const above = MATRIX_OPINION_GRID.filter(o => o >= c.minOpinion).length;
    return Math.abs(c.acceptPct - above / MATRIX_OPINION_GRID.length) < 1e-9;
  })());
}

// ── T3: różnicowanie i „na styk" ────────────────────────────────────────────
console.log('--- T3: czy wagi są gałką (różnicowanie) ---');
{
  ok('żaden czasownik nie jest zdegenerowany', MATRIX.degenerate.length === 0);
  ok('detektor degeneracji ŁAPIE czasownik odpowiadający wszędzie tak samo', (() => {
    // Czasownik z progiem nieosiągalnym ⇒ zawsze odmowa ⇒ always_reject.
    const m = buildAcceptanceMatrix({
      verbs: ['trade_agreement'], archetypes: ['industrialist'], objectives: ['merchant'],
      opinionGrid: [-100, -90],
    });
    return m.degenerate.length === 1 && m.degenerate[0].kind === 'always_reject';
  })());
  ok('detektor łapie też „zawsze akceptuje"', (() => {
    const m = buildAcceptanceMatrix({
      verbs: ['improve_relations'], archetypes: ['trader'], objectives: ['merchant'],
      opinionGrid: [60, 80],
    });
    return m.degenerate.length === 1 && m.degenerate[0].kind === 'always_accept';
  })());
  ok('odsetek decyzji „na styk" jest policzony i mieści się w progu zdrowia',
    Number.isFinite(MATRIX.nearThreshold.pct) && MATRIX.nearThreshold.pct <= DIPLO_HEALTH.NEAR_THRESHOLD_PCT_MAX);
  ok('„na styk" liczone względem knoba, nie na sztywno', DIPLO_TELEMETRY_DEFAULTS.NEAR_THRESHOLD_PTS > 0);
  ok('xenofag i rój odmawiają traktatów — PARYTET z dawną bramką osobowości',
    ['xenophage', 'swarm'].every(a => ['trade_agreement', 'non_aggression', 'alliance']
      .every(v => cell(a, 'militarist', v)?.minOpinion === null)));
}

// ── T4: SONDA WRAŻLIWOŚCI — uczciwość jako DOWÓD, nie deklaracja ────────────
console.log('--- T4: sonda wrażliwości termów (Decyzja 2 fazy) ---');
{
  ok('sonda pokrywa każdy term katalogu', ACCEPTANCE_TERM_IDS.every(id => !!PROBE[id]));
  ok('relative_power: NIE DA SIĘ RUSZYĆ niczym (STUB — audyt R2)',
    PROBE.relative_power.maxAbs === 0 && ACCEPTANCE_TERMS.relative_power.status === TERM_STATUS.STUB);
  ok('relative_power ma mimo to NIEZEROWE wagi (WAR_BACKBONE dostaje od czego zacząć)',
    Object.values(PROBE.relative_power.byVerb).length > 0
    && ACCEPTANCE_VERB_IDS.some(v => (VERB_ACCEPTANCE[v].terms.relative_power ?? 0) > 0));
  ok('memory: NIE DA SIĘ RUSZYĆ, bo katalog dowodów jest pusty (znalezisko R9)',
    PROBE.memory.maxAbs === 0);
  ok('termy DZIAŁAJĄCE dają się ruszyć (żadnego ⚠ NIESPÓJNY)',
    TERMS.filter(t => t.status === TERM_STATUS.LIVE).every(t => t.probeMaxAbs > 0)
    && TERMS.every(t => t.inertUnexpected === false));
  // ⚠ `recent_refusal` ZDJĘTY z listy w E4: dostał pisarza (`noteVerbRefusal`) i jest LIVE.
  // Sonda dalej go rusza — teraz pilnuje go asercja wyżej („termy DZIAŁAJĄCE dają się ruszyć").
  ok('termy bez paliwa LICZĄ poprawnie — to jest treść markerów K-2/K-4/K-5',
    ['reputation', 'offer', 'third_party', 'erratic_noise']
      .every(id => PROBE[id].maxAbs > 0 && ACCEPTANCE_TERMS[id].status !== TERM_STATUS.LIVE));
  ok('rozróżnienie „nie da się ruszyć" vs „brak paliwa" jest wystawione osobnymi flagami',
    TERMS.find(t => t.id === 'relative_power').cannotMove === true
    && TERMS.find(t => t.id === 'relative_power').worksButUnfed === false
    && TERMS.find(t => t.id === 'reputation').cannotMove === false
    && TERMS.find(t => t.id === 'reputation').worksButUnfed === true);
  ok('⚠ NIESPÓJNY zapala się, gdy term DZIAŁAJĄCY okaże się nieruchomy', (() => {
    // Symulacja: podstawiamy sondę, w której `opinion` (status live) ma wkład 0.
    const fake = { ...PROBE, opinion: { maxAbs: 0, byVerb: {}, declaredStatus: TERM_STATUS.LIVE } };
    return termCatalogRows(fake).find(t => t.id === 'opinion').inertUnexpected === true;
  })());
  ok('sonda mierzy per czasownik, nie tylko globalnie',
    Object.keys(PROBE.opinion.byVerb).length === ACCEPTANCE_VERB_IDS.length);
  ok('war_status ruszany JEST tylko przez pokój (pozostałe czasowniki go nie używają)',
    Object.keys(PROBE.war_status.byVerb).length === 1 && PROBE.war_status.byVerb.offer_peace > 0);
  ok('katalog termów niesie wagi per czasownik i klucz i18n',
    TERMS.every(t => !!t.labelKey && typeof t.weights === 'object'));
}

// ── T5: migawka relacji z żywej gry ─────────────────────────────────────────
console.log('--- T5: migawka relacji (odczyt, ZERO mutacji) ---');
{
  const calls = [];
  const dipl = {
    getOpinionOfPlayer: (id) => { calls.push('opinion'); return 17; },
    getTension: () => 42, getStatus: () => 'truce', getOpinionBand: () => 'neutral',
    getReputation: () => ({ aggression: 8 }),
    relations: { getTreaties: () => [{ id: 'trade_agreement' }], getMemory: () => [{}, {}, {}] },
  };
  const snap = relationSnapshot(dipl, 'emp_001');
  ok('migawka niesie opinię, napięcie, status, traktaty, pamięć i reputację',
    snap.opinion === 17 && snap.tension === 42 && snap.status === 'truce'
    && snap.treaties[0] === 'trade_agreement' && snap.memoryN === 3 && snap.aggression === 8);
  ok('migawka czyta opinię IMPERIUM O GRACZU (kierunek, który bramkuje akceptacje)', calls.includes('opinion'));
  ok('brak DiplomacySystem → null zamiast wyjątku', relationSnapshot(null, 'emp_001') === null);

  // sample() na wstrzykniętym globalu — jedyne miejsce z atrapą w tym keeperze.
  const prevWindow = globalThis.window;
  globalThis.window = { KOSMOS: {
    diplomacySystem: dipl,
    empireRegistry: { listAll: () => [{ id: 'emp_001', archetype: 'industrialist', objective: 'merchant', traits: [] }] },
    warSystem: { listActive: () => [{ id: 'w1' }] },
  } };
  const tel = new DiplomacyTelemetry();
  const row = tel.sample(7);
  globalThis.window = prevWindow;
  ok('sample() zwraca wiersz z rokiem, imperiami i licznikiem wojen',
    row.gy === 7 && row.empires.length === 1 && row.warsActive === 1);
  ok('sample() liczy maxTension (sygnał detektora DIPLOMACY_DEAD)', row.maxTension === 42);
  ok('sample() raportuje, czy kolaboratorzy w ogóle są wpięci',
    row.wired.diplomacySystem === true && row.wired.empireRegistry === true);
  ok('getSeries() zwraca kopię, nie żywą tablicę', tel.getSeries() !== tel._rows && tel.getSeries().length === 1);
  ok('getMatrix() liczy macierz LENIWIE i cache’uje', tel.getMatrix() === tel.getMatrix());
}

// ── T6: agregacja i werdykt ─────────────────────────────────────────────────
console.log('--- T6: agregacja + obie gałęzie outcome 3 ---');
{
  const mkSeries = (opinions, tensions = null) => opinions.map((o, i) => ({
    gy: i, warsActive: 0, maxTension: (tensions ?? opinions.map(() => 0))[i],
    wired: { diplomacySystem: true, empireRegistry: true, warSystem: true },
    empires: [{ empireId: 'emp_001', opinion: o, tension: (tensions ?? opinions.map(() => 0))[i], status: 'peace', treaties: [] }],
  }));

  const flat = summarizeSeed(mkSeries([0, 0, 0]));
  ok('seed bez dyplomacji: opinia nigdy nie drgnęła', flat.opinionEverMoved === false && flat.opinionMax === 0);

  const live = summarizeSeed(mkSeries([0, 5, 22]));
  ok('seed z dyplomacją: min/mediana/max policzone', live.opinionMin === 0 && live.opinionMax === 22 && live.opinionEverMoved === true);

  const warSeries = mkSeries([0, -30]);
  warSeries[1].empires[0].status = 'war';
  warSeries[1].empires[0].treaties = ['non_aggression'];
  const warS = summarizeSeed(warSeries);
  ok('lata wojny i traktaty zliczone', warS.warYears === 1 && warS.anyTreaty === true);

  const aggFlat = aggregatePanel([flat, flat]);
  const aggLive = aggregatePanel([live, live]);
  ok('agregat liczy medianę zasięgu opinii', aggLive.medOpinionMax === 22);
  ok('agregat liczy, ile seedów w ogóle ćwiczyło dyplomację',
    aggFlat.seedsWithAnyDiplomacy === 0 && aggLive.seedsWithAnyDiplomacy === 2);

  ok('outcome 0 przy braku danych', verdict(MATRIX, null).outcome === 0);
  ok('outcome 1 gdy macierz nie różnicuje', (() => {
    const degen = { ...MATRIX, degenerate: [{ verb: 'alliance', kind: 'always_reject' }] };
    return verdict(degen, aggLive).outcome === 1;
  })());
  ok('outcome 3 (a): przebieg NIE ćwiczy dyplomacji — etykieta mówi o przebiegu, nie o progach', (() => {
    const v = verdict(MATRIX, aggFlat);
    return v.outcome === 3 && /NIE ćwiczy dyplomacji/.test(v.label);
  })());
  ok('outcome 3 (b): dyplomacja jest, ale opinia nie dobija do progu — etykieta mówi o ŹRÓDŁACH', (() => {
    const weak = aggregatePanel([summarizeSeed(mkSeries([0, 3, 4]))]);
    const v = verdict(MATRIX, weak);
    return v.outcome === 3 && /ŹRÓDEŁ/.test(v.label);
  })());
  ok('outcome 2 gdy macierz różnicuje i przebieg dociera do progu', verdict(MATRIX, aggLive).outcome === 2);
  ok('próg zasięgu opinii = dawny próg umowy handlowej', DIPLO_HEALTH.OPINION_REACH_MIN === 10);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
