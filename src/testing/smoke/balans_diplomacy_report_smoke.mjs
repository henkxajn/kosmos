// WOJNA I POKÓJ 1.0 — D2/E7 — smoke: renderer raportu DIPLOMACY (macierze akceptacji).
// Uruchom: node src/testing/smoke/balans_diplomacy_report_smoke.mjs
//
// Para do `balans_diplomacy_telemetry_smoke` — tam czujnik, tu prezentacja. Raport jest
// ARTEFAKTEM REGRESJI dla E2, więc jego kontrakt jest tak samo wiążący jak liczby:
//   T1 samodzielność (offline, zero zewnętrznych zasobów) + komplet sekcji
//   T2 sekcja GRANIC pomiaru — bez niej macierz kłamie przez przemilczenie
//   T3 MACIERZ JAKO TABELA (wymóg fazy: tabela, nie wykres) + kotwice parytetu w treści
//   T4 termy bezczynne JAWNIE oznaczone (Decyzja 2) + ⚠ przy niespójności
//   T5 obserwacja przebiegu + rozróżnienie obu gałęzi outcome 3
//   T6 escaping i przypadki brzegowe (pusty payload nie może wywalić raportu)

import { renderDiplomacyReport } from '../report/DiplomacyReport.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── Atrapa payloadu w kształcie, który zapisuje runner ──────────────────────
const mkCell = (archetype, objective, verb, over = {}) => ({
  archetype, objective, verb, threshold: 28, blocked: false,
  acceptPct: 0.5, minOpinion: 10, scoreAtZero: 24, marginAtZero: -4, ...over,
});
const fixture = {
  meta: { planetClass: 'REAL', seeds: 2, targetGy: 45, tool: 'test', note: 'nota stopki' },
  matrix: {
    verbs: ['trade_agreement', 'offer_peace'],
    archetypes: ['industrialist', 'xenophage'],
    objectives: ['merchant', 'militarist'],
    opinionGrid: [-20, 0, 10, 30],
    conditions: { tension: 0, memory: 'puste', offer: 'brak', traits: 'brak (bez erratic)', note: 'zmienną jest tylko opinia' },
    nearPts: 5,
    nearThreshold: { total: 64, near: 8, pct: 0.125 },
    degenerate: [],
    cells: [
      mkCell('industrialist', 'merchant', 'trade_agreement'),
      mkCell('industrialist', 'merchant', 'offer_peace', { minOpinion: -20, acceptPct: 1 }),
      mkCell('industrialist', 'militarist', 'trade_agreement'),
      mkCell('industrialist', 'militarist', 'offer_peace', { blocked: true, acceptPct: null }),
      mkCell('xenophage', 'merchant', 'trade_agreement', { minOpinion: null, acceptPct: 0 }),
      mkCell('xenophage', 'merchant', 'offer_peace', { minOpinion: null, acceptPct: 0 }),
      mkCell('xenophage', 'militarist', 'trade_agreement', { minOpinion: null, acceptPct: 0 }),
      mkCell('xenophage', 'militarist', 'offer_peace', { minOpinion: null, acceptPct: 0 }),
    ],
  },
  terms: [
    { id: 'opinion', labelKey: 'diplo.term.opinion', status: 'live', note: 'Koń roboczy. Reuse D1.',
      weights: { trade_agreement: 40, offer_peace: 20 }, probeMaxAbs: 50, cannotMove: false, inertUnexpected: false, worksButUnfed: false },
    // ⚠ Fixture SYNTETYCZNY — nie odwzorowuje katalogu gry, tylko ćwiczy renderer na WSZYSTKICH
    //   czterech statusach. Po W1-3 `relative_power` jest LIVE, więc wiersz STUB nosi tu odtąd
    //   nazwę zmyśloną: gdyby zostawić prawdziwe id, fixture twierdziłby nieprawdę o katalogu.
    //   Sam wiersz ZOSTAJE — renderer musi umieć narysować STUB-a, jeśli kiedyś wróci, a
    //   skasowanie go zmniejszyłoby pokrycie zamiast poprawić spójność.
    { id: 'przyklad_stub', labelKey: 'diplo.term.relativePower', status: 'stub', note: 'Syntetyczny wiersz — pokrycie etykiety BEZCZYNNY.',
      weights: { trade_agreement: 10, offer_peace: 30 }, probeMaxAbs: 0, cannotMove: true, inertUnexpected: false, worksButUnfed: false },
    { id: 'reputation', labelKey: 'diplo.term.reputation', status: 'unfed', note: 'K-2: nic nie podnosi agresji do D4.',
      weights: { trade_agreement: 15 }, probeMaxAbs: 20, cannotMove: false, inertUnexpected: false, worksButUnfed: true },
    { id: 'third_party', labelKey: 'diplo.term.thirdParty', status: 'partial', note: 'K-5: pary AI↔AI dopiero w D5.',
      weights: { trade_agreement: 10 }, probeMaxAbs: 20, cannotMove: false, inertUnexpected: false, worksButUnfed: true },
  ],
  seeds: [
    { seed: 'balans-diplo_1', crashed: false, summary: { empiresObserved: 2, opinionMin: 0, opinionMed: 0, opinionMax: 0, tensionMax: 0, warYears: 0, anyTreaty: false } },
    { seed: 'balans-diplo_2', crashed: false, summary: { empiresObserved: 2, opinionMin: -5, opinionMed: 0, opinionMax: 12, tensionMax: 30, warYears: 3, anyTreaty: true } },
  ],
  panel: {
    seeds: 2, medOpinionMin: -2.5, medOpinionMax: 6, medTensionMax: 15,
    seedsWithAnyDiplomacy: 1, wiredEverywhere: true,
    verdict: { outcome: 2, label: 'Macierz różnicuje' },
  },
};

const html = renderDiplomacyReport(fixture);

// ── T1: samodzielność + komplet sekcji ──────────────────────────────────────
console.log('--- T1: samodzielny fragment + sekcje ---');
{
  ok('zwraca fragment viz-root (skeleton HTML dokłada runner)', html.startsWith('<div class="viz-root">'));
  ok('ZERO zewnętrznych zasobów — plik ma się otwierać offline',
    !/<script/i.test(html) && !/src\s*=/i.test(html) && !/https?:\/\//i.test(html) && !/<link/i.test(html));
  ok('styl jest inline (własny prefiks dp-, bez kolizji z rp-/rr-)',
    html.includes('<style>') && html.includes('.dp-table') && !html.includes('.rp-table'));
  ok('nagłówek niesie klasę planety, liczbę seedów i JEDNOSTKĘ',
    html.includes('REAL') && html.includes('game-years'));
  for (const sec of ['Granice tego pomiaru', 'Macierz akceptacji', 'Termy —', 'Obserwacja przebiegu']) {
    ok(`sekcja obecna: „${sec}"`, html.includes(sec));
  }
  ok('stopka niesie notę z meta', html.includes('nota stopki'));
}

// ── T2: granice pomiaru — uczciwość ponad kompletnością ─────────────────────
console.log('--- T2: sekcja granic pomiaru ---');
{
  ok('mówi WPROST, ile termów nie liczy się w pełni', /3 z 4 termów nie liczy się w pełni/.test(html));
  ok('wymienia bezczynne termy z nazwy',
    html.includes('relative_power') && html.includes('reputation') && html.includes('third_party'));
  ok('ZAKAZUJE kompensowania bezczynnych kolumn wagami innych termów',
    /nie wolno\s*\n?\s*stroić wag/i.test(html.replace(/<[^>]+>/g, '')));
  ok('mówi, że macierz jest syntetyczna i co trzymano stałe',
    html.includes('SYNTETYCZNA') && html.includes('napięcie 0'));
  ok('mówi, że silnik NIE jest jeszcze wpięty w rozgrywkę', /nie jest jeszcze wpięty/.test(html));
  ok('podaje jedyną zmienioną zmienną przebiegu', html.includes('aiEmpires: true'));
}

// ── T3: MACIERZ JAKO TABELA (wymóg fazy) ────────────────────────────────────
console.log('--- T3: macierz renderuje się jako TABELA ---');
{
  ok('to <table>, nie <svg> — wymóg fazy „tabela, nie wykres"',
    html.includes('<table class="dp-table dp-matrix"') && !html.includes('<svg'));
  ok('nagłówki kolumn = czasowniki', html.includes('>trade_agreement<') && html.includes('>offer_peace<'));
  ok('wiersze = archetyp × agenda (archetyp scalony rowspan)',
    html.includes('rowspan="2"') && html.includes('>industrialist<') && html.includes('>xenophage<'));
  ok('komórka pokazuje GRANICĘ opinii i odsetek', html.includes('≥10') && html.includes('50%'));
  ok('brak akceptacji renderuje się jako „nigdy", nie jako puste pole', html.includes('nigdy'));
  ok('komórka zablokowana pre-warunkiem jest odróżniona od odmowy', html.includes('dp-blocked'));
  ok('tooltip komórki niesie próg i margines przy opinii 0', html.includes('title="próg 28'));
  ok('siatka opinii jest WYPISANA (czytelnik wie, na czym liczono odsetek)',
    html.includes('-20, 0, 10, 30'));
  ok('KOTWICE PARYTETU są w treści raportu — cel E2 jest widoczny w artefakcie',
    html.includes('trade_agreement ≥10') && html.includes('non_aggression ≥25') && html.includes('alliance ≥30'));
  ok('macierz szeroka ma własny scroll (nie rozwala układu strony)', html.includes('dp-scroll'));
}

// ── T4: oznaczenia uczciwości (Decyzja 2) ───────────────────────────────────
console.log('--- T4: termy bezczynne JAWNIE oznaczone ---');
{
  ok('tabela termów pokazuje wagi per czasownik', html.includes('>40<') && html.includes('>30<'));
  ok('relative_power oznaczony jako BEZCZYNNY', /relative_power/.test(html) && html.includes('BEZCZYNNY'));
  ok('kolumna sondy jest DOWODEM statusu, a nie jego powtórzeniem', html.includes('sonda |wkład|'));
  ok('zero w sondzie jest wyróżnione wizualnie', html.includes('dp-cell-no'));
  // ⚠ ODWRÓCONE W W1-3. Do W1-2 raport tłumaczył, DLACZEGO term ma zero (audyt R2 → WAR_BACKBONE).
  //   Teraz term ŻYJE, więc raport musi tłumaczyć co innego: skąd bierze dane i dlaczego mimo to
  //   jego wkład w TEJ macierzy jest bliski zeru (kontekst bazowy trzyma siły RÓWNE — inaczej
  //   przesunęłyby się kotwice parytetu z E2). Pin trzyma OBIE połowy tego wyjaśnienia.
  ok('raport tłumaczy, skąd relative_power bierze dane (ThreatAssessment)',
    html.includes('ThreatAssessment'));
  ok('…i dlaczego jego wkład w macierzy jest mimo to zerowy (siły RÓWNE w kontekście bazowym)',
    html.includes('ŻYWY od W1-3') && /siły\s+RÓWNE/.test(html));
  ok('raport tłumaczy, dlaczego memory ma zero (pusty katalog dowodów, D4)',
    html.includes('katalog dowodów') && html.includes('D4'));
  ok('rozróżnia „nie da się ruszyć" od „brak paliwa w grze"',
    html.includes('nie da się ruszyć') && html.includes('brak paliwa'));
  ok('status UNFED/PARTIAL ma własną etykietę, nie jest zlany z BEZCZYNNY',
    html.includes('BEZ ŹRÓDŁA') && html.includes('CZĘŚCIOWY'));
  ok('⚠ NIESPÓJNY pojawia się, gdy term DZIAŁA ale sonda go nie ruszyła', (() => {
    const bad = { ...fixture, terms: [{ ...fixture.terms[0], probeMaxAbs: 0, cannotMove: true, inertUnexpected: true }] };
    return renderDiplomacyReport(bad).includes('NIESPÓJNY');
  })());
  ok('bez niespójności ⚠ NIE jest pokazywane (brak fałszywego alarmu)', !html.includes('NIESPÓJNY'));
}

// ── T5: obserwacja przebiegu ────────────────────────────────────────────────
console.log('--- T5: obserwacja przebiegu ---');
{
  ok('tabela seedów z zasięgiem opinii i napięcia', html.includes('seed_1') && html.includes('seed_2'));
  ok('skraca prefiks seeda do czytelnej formy', !html.includes('balans-diplo_1'));
  ok('tłumaczy, po co ta sekcja (macierz bez niej to tabela hipotez)', html.includes('tabelą hipotez'));
  ok('wskazuje próg zasięgu opinii, przy którym strojenie ma sens', /dobija do <b>10<\/b>/.test(html));
  ok('kafel werdyktu niesie outcome i etykietę', html.includes('Outcome 2') && html.includes('Macierz różnicuje'));
  ok('ostrzega, gdy brakowało kolaboratorów w części seedów', (() => {
    const unwired = { ...fixture, panel: { ...fixture.panel, wiredEverywhere: false } };
    return renderDiplomacyReport(unwired).includes('zabrakło DiplomacySystem');
  })());
  ok('degeneracja czasownika jest wykrzyczana nad tabelą', (() => {
    const degen = { ...fixture, matrix: { ...fixture.matrix, degenerate: [{ verb: 'alliance', kind: 'always_reject' }] } };
    const h = renderDiplomacyReport(degen);
    return h.includes('bez zróżnicowania') && h.includes('always_reject');
  })());
}

// ── T6: escaping + przypadki brzegowe ───────────────────────────────────────
console.log('--- T6: escaping i brzegi ---');
{
  const evil = renderDiplomacyReport({
    ...fixture,
    meta: { ...fixture.meta, planetClass: '<img src=x onerror=alert(1)>', note: 'a & b < c' },
  });
  ok('HTML z danych jest escapowany', !evil.includes('<img src=x') && evil.includes('&lt;img'));
  ok('ampersand i < w nocie escapowane', evil.includes('a &amp; b &lt; c'));
  ok('pusty payload nie wywala raportu', (() => {
    const h = renderDiplomacyReport({});
    return typeof h === 'string' && h.startsWith('<div class="viz-root">');
  })());
  ok('brak macierzy → komunikat zamiast wyjątku', renderDiplomacyReport({}).includes('brak danych'));
  ok('brak seedów → tabela obserwacji z placeholderem',
    renderDiplomacyReport({ matrix: fixture.matrix, terms: fixture.terms }).includes('brak danych'));
  ok('undefined w liczbach renderuje się jako „—", nie NaN', (() => {
    const h = renderDiplomacyReport({ ...fixture, panel: { verdict: { outcome: 0, label: '—' } } });
    return h.includes('—') && !h.includes('NaN');
  })());
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
