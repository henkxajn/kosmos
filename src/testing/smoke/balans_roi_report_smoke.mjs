// BALANS 1.0 — Phase 2 — RoiReport keeper (chroni renderer HTML raportu ROI).
// Czysta funkcja renderRoiReport(payload) → samodzielny HTML. Chroni:
// self-contained (zero http/script/src), komplet sekcji, UCZCIWOŚĆ (skrzynka założeń
// wyceny — bez niej ranking zwrotu wygląda na obiektywny, a stoi na tabeli cen gry
// i na scenariuszu boosted), rozdział torów (nauka NIGDY w rankingu produkcyjnym),
// teksturę „nie zwraca się", eskejp, mapowanie outcome→klasa werdyktu i wierność danym.
//
//   T1  self-contained + komplet sekcji
//   T2  skrzynka uczciwości: ceny, energia 1 Kr, boosted ×5, nauka bez ceny, płace, kopalnia plate/real
//   T3  status: kolory + ikony + legenda + tekstura (nigdy sam kolor)
//   T4  outcome → klasa werdyktu (0=fast 1=slow 2=none)
//   T5  wierność danym: ranking, skala log, skład kosztu, wiersz „nie zwraca się", stolica poza rankingiem
//   T6  eskejp HTML + edge-case'y (pusty payload, brak pomiarów, brak anomalii cenowych)
//
// Uruchom: node src/testing/smoke/balans_roi_report_smoke.mjs

import { renderRoiReport, paybackState } from '../report/RoiReport.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Fixture w kształcie payloadu z balans-roi-telemetry.mjs ──────
const mkCost = (dir, emb) => ({
  direct: { Fe: dir }, commodity: { structural_alloys: 2 }, embedded: { Fe: emb }, loaded: { Fe: dir + emb },
  krDirect: dir, krEmbedded: emb, krLoaded: dir + emb, krTicket: dir + emb * 1.3,
  embeddedShare: (dir + emb) > 0 ? emb / (dir + emb) : 0, credits: 0, unpriced: [], unknown: [], cyclic: [],
});
const mkCat = (id, over = {}) => ({
  id, category: over.category ?? 'mining', namePL: id, isCapital: !!over.isCapital, isMine: !!over.isMine,
  requires: over.requires ?? null, buildTime: 1, maxLevel: 10, jobs: 1, popType: 'laborer', housing: over.housing ?? 0,
  tracks: over.tracks ?? ['productive'], tags: over.tags ?? [],
  cost: over.cost ?? mkCost(30, 130),
  nominalRates: { Fe: 5 }, nominalKrPerGy: over.nominalKrPerGy ?? 60,
  nominalPaybackGy: over.nominalPaybackGy ?? 2.5, unpricedOut: over.unpricedOut ?? [],
  upgrade2: { level: 2, direct: { Fe: 48 }, commodity: {}, krLoaded: 48 },
  upgrade3: { level: 3, direct: { Fe: 72 }, commodity: { structural_alloys: 4 }, krLoaded: 372 },
});
const CATALOG = {
  colony_base:  mkCat('colony_base', { isCapital: true, category: 'population', cost: mkCost(0, 0), tracks: ['productive', 'housing'], housing: 16 }),
  mine:         mkCat('mine', { isMine: true, nominalPaybackGy: null }),
  solar_farm:   mkCat('solar_farm', { category: 'energy' }),
  hydro_pump:   mkCat('hydro_pump', { category: 'food' }),          // zmierzony, ale bez dodatniego przepływu
  habitat:      mkCat('habitat', { category: 'population', tracks: ['housing'], housing: 12 }),
  observatory:  mkCat('observatory', { category: 'research', tracks: ['research'], unpricedOut: ['research'] }),
  trade_hub:    mkCat('trade_hub', { category: 'market', tracks: ['trade'], tags: ['tcBonus'] }),
  defense_tower: mkCat('defense_tower', { category: 'military', tracks: ['other'], tags: ['disasterReduction'] }),
  geothermal:   mkCat('geothermal', { category: 'energy', nominalPaybackGy: 0.96, requires: null }),
  factory:      mkCat('factory', { category: 'mining', cost: mkCost(65, 231) }),
};
const mkType = (over = {}) => ({
  seeds: 8, years: 40, maxCount: 6, medKrPerGyPerLevel: 500, medPaybackGy: 0.32,
  medPaybackWithWagesGy: 0.34, minPaybackGy: 0.2, maxPaybackGy: 0.5, medWageKrPerGyPerLevel: 12,
  medHousingPerLevel: 0, medResearchPerGyPerLevel: 0, medMineStaff: null,
  krLoaded: 160, embeddedShare: 0.81, measuredOn: 8, unpricedOut: [], ...over,
});
const PANEL = {
  seeds: 8, measuredTypes: 7, catalogSize: 10,
  medEmbeddedShare: 0.71, medMineNameplateRatio: 1.94,
  factory: { medPoints: 3, medValueAddedKrPerGy: -298, medProducedKrPerGy: 1200, medInputKrPerGy: 1498 },
  byType: {
    colony_base: mkType({ medPaybackGy: 0, krLoaded: 0 }),
    mine:        mkType({ medPaybackGy: 0.07, medKrPerGyPerLevel: 3264, krLoaded: 216, medMineStaff: 0.9 }),
    solar_farm:  mkType({ medPaybackGy: 2.33, medKrPerGyPerLevel: 132, krLoaded: 307 }),
    hydro_pump:  mkType({ medPaybackGy: null, medKrPerGyPerLevel: -40, krLoaded: 200 }),
    habitat:     mkType({ medPaybackGy: null, medKrPerGyPerLevel: -49, medHousingPerLevel: 12, krLoaded: 303 }),
    observatory: mkType({ medPaybackGy: null, medKrPerGyPerLevel: -50, medResearchPerGyPerLevel: 105.8, krLoaded: 314, unpricedOut: ['research'] }),
    trade_hub:   mkType({ medPaybackGy: null, medKrPerGyPerLevel: -30, krLoaded: 202 }),
  },
  verdict: { outcome: 1, label: 'SKEWED — 33.3× rozrzutu zwrotu (solar_farm vs mine)', spread: 33.3,
    best: 'mine', bestPaybackGy: 0.07, worst: 'solar_farm', worstPaybackGy: 2.33, n: 2 },
};
const PAYLOAD = {
  meta: {
    tool: 'BALANS 1.0 Phase 2 — ROI telemetry', planetClass: 'REAL', seeds: 8, targetGy: 45,
    seedPrefix: 'balans-gate1', civPerGy: 12,
    thresholds: { PAYBACK_FAST_GY: 1, PAYBACK_SLOW_GY: 10, SPREAD_FLAT: 10, MIN_YEARS: 2, RATE_EPS: 0.001, MAX_RECIPE_DEPTH: 8 },
    costModel: 'w pełni obciążony', valueModel: 'MIERZONE + NOMINALNE',
    scope: 'kolonia macierzysta; scenariusz civilization_boosted', note: 'read-only instrument',
  },
  catalog: CATALOG,
  priceVsOre: {
    structural_alloys: { price: 16, oreKr: 12, credits: 0, ratio: 1.33, belowOre: false },
    automation_droid:  { price: 450, oreKr: 7500, credits: 500, ratio: 0.06, belowOre: true },
  },
  seeds: [
    { seed: 'balans-gate1_1', crashed: false, planet: { name: 'Home', atmosphere: 'breathable' },
      summary: { factory: { points: 3, producedKrPerGy: 1200, inputKrPerGy: 1498, valueAddedKrPerGy: -298 }, mineNameplateRatio: 1.94 } },
    { seed: 'balans-gate1_2', crashed: false, planet: { name: 'Home2', atmosphere: 'thin' },
      summary: { factory: { points: 2, producedKrPerGy: 900, inputKrPerGy: 700, valueAddedKrPerGy: 200 }, mineNameplateRatio: 2.1 } },
  ],
  panel: PANEL,
};

const html = renderRoiReport(PAYLOAD);

// ── T1: self-contained + sekcje ───────────────────────────────────
console.log('T1 — samodzielny HTML + komplet sekcji');
{
  assert(!/<script/i.test(html), 'brak <script> (raport nie wykonuje kodu)');
  assert(!/\ssrc=/i.test(html) && !/<link/i.test(html), 'brak zewnętrznych zasobów (src/link)');
  assert(!/https?:\/\//i.test(html), 'brak adresów http (plik działa offline)');
  assert(!/@import/i.test(html), 'brak @import w CSS');
  assert(html.includes('<style>'), 'styl inline (samodzielny artefakt)');
  for (const s of ['KOSZT ↔ WARTOŚĆ', 'Metodologia', 'Tor (a)', 'Tory (b)', 'Fabryka', 'Ulepszenia', 'Katalog',
    'Z czego składa się prawdziwy koszt']) {
    assert(html.includes(s), `sekcja obecna: „${s}"`);
  }
  assert(html.includes('game-years') && html.includes('1 gy = 12 civ-yr'), 'jednostka game-year zadeklarowana (HARD #3)');
  assert(html.includes('zero stałych balansu'), 'deklaracja „instrument, nie regulator" w nagłówku');
}

// ── T2: skrzynka uczciwości ───────────────────────────────────────
console.log('T2 — skrzynka uczciwości: WSZYSTKIE założenia wyceny jawne');
{
  assert(html.includes('BASE_PRICE'), 'źródło cen nazwane wprost (tabela gry, nie wymyślone wagi)');
  assert(/najważniejsze założenie/i.test(html), 'wycena oznaczona jako główne założenie raportu');
  assert(html.includes('Energia jest wyceniona 1 Kr'), 'cena energii wystawiona osobno (cała wartość elektrowni na niej wisi)');
  assert(html.includes('civilization_boosted') && html.includes('kopalnie ×5'),
    '⚠ scenariusz boosted (kopalnie ×5) ujawniony — inaczej zwrot kopalń jest 5× zawyżony');
  assert(/Nauka <b>NIE MA<\/b> ceny|Nauka NIE MA/.test(html) || html.includes('NIE MA</b> ceny'),
    'brak ceny nauki wyjaśniony jako brak DANYCH, nie wybór metodologiczny');
  assert(html.includes('latBuildCost'), 'granica „koszt najtańszego kafla" (modyfikator polarny) wymieniona');
  assert(html.includes('Płace są POZA'), 'płace jawnie poza nagłówkowym zwrotem (i pokazane obok)');
  assert(html.includes('×1.94') && html.includes('tooltip'), 'luka „tooltip kopalni vs realny urobek" w skrzynce');
  assert(html.includes('MIERZONE') && html.includes('NOMINALNE'), 'rozróżnienie mierzone/nominalne zadeklarowane');
  assert(html.includes('macierzysta'), 'zakres (kolonia macierzysta) podany');
  assert(html.includes('PAYBACK_FAST') === false && html.includes('szybki zwrot ≤'), 'progi opisane po ludzku, nie nazwami stałych');

  // Anomalia cenowa — pokazana, ale NIE rozstrzygnięta
  assert(html.includes('PONIŻEJ rudy'), 'towary tańsze niż ich ruda wyeksponowane (wyjaśniają ujemną wartość dodaną)');
  assert(html.includes('automation_droid'), 'konkretny towar nazwany');
  assert(html.includes('osobny slice'), 'ceny odesłane do własnego slice\'u — bez rozstrzygania tutaj');

  const noAnomaly = renderRoiReport({ ...PAYLOAD, priceVsOre: { structural_alloys: { price: 16, oreKr: 12, ratio: 1.33, belowOre: false } } });
  assert(!noAnomaly.includes('PONIŻEJ rudy'), 'brak anomalii cenowych ⇒ brak czerwonej ramki (nie straszymy bez powodu)');
}

// ── T3: status — nigdy sam kolor ──────────────────────────────────
console.log('T3 — status: kolor + ikona + etykieta + tekstura');
{
  assert(html.includes('#0ca30c') && html.includes('#d03b3b') && html.includes('#fab219') && html.includes('#2a78d6'),
    'paleta STATUS (good/critical/warning/info) obecna');
  assert(html.includes('hatchNever') || html.includes('repeating-linear-gradient'),
    'tekstura na „nie zwraca się" (czytelne w skali szarości / dla CVD)');
  assert(html.includes('rr-legend') && html.includes('Zwrot ≤ 1 gy'), 'legenda z opisem progów');
  assert(html.includes('✓') && html.includes('✕') && html.includes('▲'), 'ikony stanów (nie tylko kolor)');
  assert(html.includes('prefers-color-scheme:dark'), 'wariant ciemny (raport czytelny w obu motywach)');

  assert(paybackState(0.5, PAYLOAD.meta.thresholds) === 'fast', 'drabina stanu: ≤1 gy → fast');
  assert(paybackState(3, PAYLOAD.meta.thresholds) === 'mid', 'drabina stanu: 1–10 gy → mid');
  assert(paybackState(50, PAYLOAD.meta.thresholds) === 'slow', 'drabina stanu: ≥10 gy → slow');
  assert(paybackState(null, PAYLOAD.meta.thresholds) === 'never', 'brak zwrotu → never (nie „bardzo wolno")');
}

// ── T4: outcome → klasa werdyktu ──────────────────────────────────
console.log('T4 — outcome → klasa werdyktu');
{
  const mk = (o) => renderRoiReport({ ...PAYLOAD, panel: { ...PANEL, verdict: { ...PANEL.verdict, outcome: o } } });
  assert(mk(0).includes('rr-b-fast'), 'outcome 0 (proporcjonalne) → obwódka „good"');
  assert(mk(1).includes('rr-b-slow'), 'outcome 1 (skewed) → obwódka „warning"');
  assert(mk(2).includes('rr-b-none'), 'outcome 2 (brak danych) → obwódka neutralna, NIE alarm');
  assert(html.includes('Outcome 1') && html.includes('SKEWED'), 'etykieta werdyktu wypisana dosłownie');
  assert(html.includes('33.3×'), 'rozrzut zwrotu na kaflu KPI');
}

// ── T5: wierność danym ────────────────────────────────────────────
console.log('T5 — wierność danym: ranking, skala log, skład kosztu, tory');
{
  assert(html.includes('logarytmiczna'), 'skala osi zadeklarowana (zwroty przez kilka rzędów wielkości)');
  const iMine = html.indexOf('>mine<'), iSolar = html.indexOf('>solar_farm<');
  assert(iMine > 0 && iSolar > 0 && iMine < iSolar, 'ranking od najszybszego zwrotu (mine przed solar_farm)');
  assert(html.includes('0.07') && html.includes('2.33'), 'zmierzone zwroty w tabeli');
  assert(html.includes('rr-row-never') && html.includes('nie zwraca się'),
    'budynek produkcyjny bez dodatniego przepływu ma WŁASNY wiersz (nie znika z tabeli)');

  // Stolica: koszt 0 → nie może stanąć na czele rankingu
  const head = html.slice(html.indexOf('Tor (a)'), html.indexOf('Z czego składa'));
  assert(!head.includes('colony_base'), '⚠ stolica (koszt 0, stawiana automatycznie) poza rankingiem produkcyjnym');

  // Tory funkcjonalne rozdzielone
  const fn = html.slice(html.indexOf('Tory (b)'), html.indexOf('Fabryka —'));
  assert(fn.includes('habitat') && fn.includes('Kr / miejsce'), 'tor mieszkalny: koszt za miejsce POP');
  assert(fn.includes('observatory') && fn.includes('Kr za 1 nauka/gy'), 'tor nauki: koszt za tempo, BEZ zwrotu w latach');
  assert(fn.includes('trade_hub'), 'tor handlu obecny');
  assert(!fn.includes('nie zwraca się'), 'tory funkcjonalne nie udają, że „się nie zwracają" — mają inną metrykę');
  assert(fn.includes('skutkiem ubocznym'), 'ostrzeżenie o budynkach, które mają housing przy okazji');

  // Skład kosztu
  assert(html.includes('71%'), 'mediana udziału komponentów w koszcie na kaflu KPI');
  assert(html.includes('ruda z <code>cost</code>') && html.includes('commodityCost'),
    'legenda składu kosztu: co widzi gracz vs co jest schowane');

  // Fabryka
  const fac = html.slice(html.indexOf('Fabryka —'));
  assert(fac.includes('seed_1') && fac.includes('seed_2'), 'tabela fabryki per seed (skrócone nazwy seedów)');
  assert(fac.includes('-298') || fac.includes('−298'), 'ujemna wartość dodana pokazana wprost, nie ukryta');
  assert(fac.includes('walutą budowy'), 'wniosek: przepustowość fabryki = waluta budowy (wątek slice\'u ZASOBY)');

  // Ulepszenia
  const up = html.slice(html.indexOf('Ulepszenia'));
  assert(up.includes('baza × poziom × 1.2'), 'formuła ulepszenia z gry wypisana');
  assert(up.includes('tańszy niż postawienie nowego budynku'), 'własność Lv2 bez komponentów wyeksponowana');

  // Katalog
  const cat = html.slice(html.indexOf('Katalog —'));
  assert(cat.includes('geothermal'), 'budynek nigdy nie postawiony trafia do sekcji nominalnej');
  assert(cat.includes('defense_tower') && cat.includes('disasterReduction'),
    'budynek bez mierzalnego wyjścia: koszt + efekty z danych zamiast wymyślonego ROI');
  assert(cat.includes('NOMINALNE'), 'wyraźnie oznaczone, że to nie są liczby zmierzone');
}

// ── T6: eskejp + edge-case'y ──────────────────────────────────────
console.log('T6 — eskejp HTML + edge-case\'y');
{
  const evil = renderRoiReport({
    ...PAYLOAD,
    catalog: { ...CATALOG, '<img src=x onerror=alert(1)>': mkCat('<img src=x onerror=alert(1)>', { tracks: ['other'] }) },
    panel: { ...PANEL, verdict: { ...PANEL.verdict, label: '<script>alert(1)</script>' } },
  });
  assert(!evil.includes('<script>alert(1)</script>'), 'etykieta werdyktu eskejpowana');
  assert(!evil.includes('onerror=alert(1)>'), 'id budynku eskejpowany');
  assert(evil.includes('&lt;script&gt;'), 'eskejp widoczny jako encje');

  const empty = renderRoiReport({});
  assert(typeof empty === 'string' && empty.includes('viz-root'), 'pusty payload nie wywraca renderera');
  assert(empty.includes('Outcome 2'), 'pusty payload → outcome 2 (brak danych), nie fałszywy werdykt');

  const noMeasure = renderRoiReport({ ...PAYLOAD, panel: { ...PANEL, byType: {}, measuredTypes: 0 } });
  assert(!noMeasure.includes('Tor (a)'), 'brak zmierzonych budynków ⇒ sekcja rankingu znika (zamiast pustej tabeli)');
  assert(noMeasure.includes('Katalog'), 'katalog (koszt + ROI nominalne) zostaje nawet bez pomiarów');

  const crashed = renderRoiReport({ ...PAYLOAD, seeds: [{ ...PAYLOAD.seeds[0], crashed: true, summary: {} }] });
  assert(typeof crashed === 'string' && crashed.includes('Fabryka'), 'seed bez podsumowania (crash) nie wywraca raportu');
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
