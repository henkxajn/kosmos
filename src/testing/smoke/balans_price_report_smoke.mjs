// BALANS 1.0 — Phase 2 — PriceReport keeper (chroni renderer HTML raportu CEN).
// Czysta funkcja renderPriceReport(payload) → samodzielny HTML. Chroni:
// self-contained (zero http/script/src), ROZDZIAŁ DWÓCH WARSTW (audyt tabeli vs
// osiągalność — mają inną moc dowodową i raport nie ma prawa ich zlewać), UCZCIWOŚĆ
// (skrzynka założeń, W TYM to o jednostce bazowej i o kontrfaktyku ×1 wydobycie),
// rozróżnienie „zamierzony sink" vs „niewyjaśnione" (własny kolor + etykieta + tekstura),
// eskejp i odporność na niepełny payload.
//
//   T1  self-contained + komplet sekcji + DWA osobne werdykty
//   T2  skrzynka uczciwości: jednostka bazowa, kryterium wewnętrzne, dane rozstrzygają, dziury w cenniku
//   T3  status: kolory + ikony + legenda + tekstura (nigdy sam kolor)
//   T4  outcome → klasa werdyktu, osobno dla A i B
//   T5  wierność danym: poniżej wsadu, kontrfaktyk ×1, bloker, cena realna vs bazowa
//   T6  eskejp HTML + edge-case'y (pusty payload, brak pary A′, brak odstających)
//
// Uruchom: node src/testing/smoke/balans_price_report_smoke.mjs

import { renderPriceReport } from '../report/PriceReport.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Fixture w kształcie payloadu z balans-price-telemetry.mjs ────
const mkCom = (id, over = {}) => ({
  id, tier: over.tier ?? 1, price: over.price ?? 16,
  oreKr: over.oreKr ?? 12, directKr: over.directKr ?? 12, conventionKr: over.conventionKr ?? 15.6,
  acquisitionKr: over.acquisitionKr ?? 12, creditCost: over.creditCost ?? 0,
  ratioOre: over.ratioOre ?? 1.33, ratioDirect: over.ratioDirect ?? 1.33,
  ratioAcquisition: 1.33, conformance: over.conformance ?? 1.03,
  belowOre: !!over.belowOre, belowDirect: !!over.belowDirect, sinkMarked: !!over.sinkMarked,
  measurable: over.measurable !== false, priced: over.priced !== false, noDataReason: over.noDataReason ?? null,
  subCommodities: [], unpricedInputs: over.unpricedInputs ?? [], baseTime: 0.2, weight: 3.5,
  requiresTech: null, isConsumerGood: false, cls: over.cls ?? 'conforms',
});
const AUDIT = {
  commodities: {
    structural_alloys: mkCom('structural_alloys'),
    civilian_goods:    mkCom('civilian_goods', { price: 18, conformance: 1.63, cls: 'off_convention' }),
    automation_droid:  mkCom('automation_droid', {
      price: 450, oreKr: 7500, directKr: 7500, conventionKr: 9750, conformance: 0.046, creditCost: 500,
      ratioOre: 0.06, ratioDirect: 0.06, belowOre: true, belowDirect: true, sinkMarked: true, cls: 'design_sink' }),
    warp_cores:        mkCom('warp_cores', {
      tier: 5, price: 500, oreKr: 626, directKr: 1092, conventionKr: 1419.6, conformance: 0.352,
      ratioOre: 0.8, ratioDirect: 0.46, belowOre: true, belowDirect: true, cls: 'suspect_below_cost' }),
    fuel:              mkCom('fuel', { price: 3, measurable: false, cls: 'no_data', noDataReason: 'unpriced_input', unpricedInputs: ['H'] }),
    military_supplies: mkCom('military_supplies', { price: null, priced: false, measurable: false, cls: 'no_data', noDataReason: 'no_price_in_table' }),
  },
  resources: { Fe: { id: 'Fe', price: 1, priced: true, inRecipes: ['structural_alloys'] },
               energy: { id: 'energy', price: 1, priced: true, inRecipes: [] },
               H: { id: 'H', price: null, priced: false, inRecipes: ['fuel'] } },
  stats: {
    total: 6, measurable: 4, conforms: 1, off: 1, designSink: 1, suspect: 1, noData: 2, belowCost: 2,
    unpricedGoods: ['military_supplies'], unpricedInputGoods: ['fuel'],
    unpricedResources: ['H', 'research'], orphanPrices: [],
  },
  outliers: [{ id: 'automation_droid', conformance: 0.046, z: -16.5, cls: 'design_sink' },
             { id: 'warp_cores', conformance: 0.352, z: -5.4, cls: 'suspect_below_cost' }],
};
const CATALOG = {
  hull_small: { id: 'hull_small', kind: 'hull', name: 'Kadłub Mały', cost: { Fe: 60 }, res: { Fe: 60 }, com: {},
    krCost: 0, upkeepKrPerGy: 50, krDirect: 80, krEmbedded: 104, krLoaded: 184, krTicket: 130, totalKr: 184, requires: 'exploration' },
  automation_droid: { id: 'automation_droid', kind: 'droid', name: 'Droid', cost: { Fe: 1000 }, res: { Fe: 1000 }, com: {},
    krCost: 500, upkeepKrPerGy: 0, krDirect: 7500, krEmbedded: 0, krLoaded: 7500, krTicket: 7500, totalKr: 8000, requires: null },
  station_orbital_station: { id: 'station_orbital_station', kind: 'station', name: 'Stacja', cost: { Ti: 600 }, res: { Ti: 600 }, com: {},
    krCost: 0, upkeepKrPerGy: 0, krDirect: 2400, krEmbedded: 28860, krLoaded: 31260, krTicket: 5000, totalKr: 31260, requires: 'orbital_construction' },
};
const capex = (r, price, capexPerKr, from, source = 'measured', extra = {}) => ({
  resource: r, price, from, source, perGy: 100,
  capexPerUnit: capexPerKr * price, capexPerKr, relativeToMedian: capexPerKr / 1.16,
  impliedPrice: price * (capexPerKr / 1.16), impliedPriceFactor: capexPerKr / 1.16, ...extra,
});
const BASE_UNIT = {
  boosted: {
    ok: true, medianCapexPerKr: 1.164, n: 3,
    byResource: { energy: capex('energy', 1, 0.915, 'solar_farm'), Fe: capex('Fe', 1, 1.237, 'mine'), Ti: capex('Ti', 4, 3.003, 'mine') },
    pair: { a: 'energy', b: 'Fe', listedRatio: 1, impliedRatio: 0.74, skew: 0.74, missing: [] },
  },
  unboosted: {
    ok: true, medianCapexPerKr: 6.265, n: 3,
    byResource: { energy: capex('energy', 1, 0.915, 'solar_farm'), Fe: capex('Fe', 1, 8.525, 'mine'), Ti: capex('Ti', 4, 15.011, 'mine') },
    pair: { a: 'energy', b: 'Fe', listedRatio: 1, impliedRatio: 0.11, skew: 0.11, missing: [] },
  },
  capexNominal: {}, capexMeasured: {},
};
const PANEL = {
  seeds: 8,
  items: {
    hull_small: { seeds: 8, seedsAffordable: 7, medFirstAffordableGy: 5, medShare: 0.911, medHeadroom: 1.5, blocker: 'Fe', blockers: { Fe: 72 }, cls: 'normal', counts: {} },
    automation_droid: { seeds: 8, seedsAffordable: 7, medFirstAffordableGy: 8, medShare: 0.778, medHeadroom: 4.9, blocker: 'Fe', blockers: { Fe: 87 }, cls: 'normal', counts: {} },
    station_orbital_station: { seeds: 8, seedsAffordable: 0, medFirstAffordableGy: null, medShare: 0, medHeadroom: 0, blocker: 'structural_alloys', blockers: {}, cls: 'never', counts: {} },
  },
  ledgerPerGy: { trade: 7, wages: -52, fleet_upkeep: -108, droid_production: -17 },
  nameplateMed: { taxPerGy: 507, wagesPerGy: 70, fleetUpkeepPerGy: 150, tradePerGy: 0 },
  capexMeasured: {},
  medTaxResidualPerGy: 397, medNetKrPerGy: 163, medCreditsEnd: 7871, medCreditsMin: 549,
  medStockKrEnd: 490231, medCommodityKrEnd: 2273,
  localPriceMed: { Fe: 0.2, energy: 3, structural_alloys: 16, warp_cores: 1500 },
  classCounts: { normal: 8, never: 9, gating: 3 },
  verdictStatic: { outcome: 1, label: 'SUSPECT — 1 cen poniżej wsadu bez markera sinku', suspect: 1, outliers: 1, outlierIds: ['warp_cores'] },
  verdictDynamic: { outcome: 1, label: 'GATED — 9 pozycji nigdy nieosiągalnych', never: 9, gating: 3, trivialCount: 0, neverIds: ['station_orbital_station'], gatingIds: [] },
};
const SEEDS = [
  { seed: 'balans-gate1_1', crashed: false, planet: { name: 'Aurora' },
    summary: { creditsEnd: 11229 },
    series: [{ gy: 1, creditsAll: 500 }, { gy: 2, creditsAll: 900 }, { gy: 3, creditsAll: 1500 }] },
  { seed: 'balans-gate1_2', crashed: false, planet: { name: 'Borea' },
    summary: { creditsEnd: 516 },
    series: [{ gy: 1, creditsAll: 500 }, { gy: 2, creditsAll: 300 }, { gy: 3, creditsAll: 120 }] },
];
const PAYLOAD = {
  meta: {
    tool: 'BALANS 1.0 Phase 2 — PRICE telemetry', planetClass: 'REAL', seeds: 8, targetGy: 45,
    seedPrefix: 'balans-gate1', civPerGy: 12, mineRateMult: 5,
    thresholds: { CONVENTION_MARGIN: 1.3, CONVENTION_TOL: 1.35, OUTLIER_Z: 3.5, TRIVIAL_SHARE: 0.9, TRIVIAL_MULT: 10, GATE_LATE_GY: 10, GATE_SHARE: 0.5 },
    auditCriterion: 'własna konwencja cennika', adjudication: 'design vs suspect rozstrzygają DANE',
    affordModel: 'realna bramka gry', clockNote: 'dwa zegary', scope: 'kolonia macierzysta', note: 'read-only',
  },
  audit: AUDIT, catalog: CATALOG, baseUnit: BASE_UNIT, seeds: SEEDS, panel: PANEL,
};

const html = renderPriceReport(PAYLOAD);

// ── T1: self-contained + sekcje + DWA werdykty ───────────────────
console.log('T1 — samodzielny HTML + komplet sekcji + DWA osobne werdykty');
{
  assert(html.length > 5000, `raport wyrenderowany (${html.length} znaków)`);
  assert(!/<script/i.test(html), 'zero <script> (raport jest statyczny)');
  assert(!/src\s*=|https?:\/\/|<link/i.test(html), 'zero zewnętrznych zasobów — plik otwieralny offline');
  assert(/<style>/.test(html) && /<svg/.test(html), 'styl i wykresy inline');
  assert(html.includes('Warstwa A — audyt tabeli'), 'sekcja: audyt tabeli');
  assert(html.includes('Warstwa A′ — jednostka bazowa'), 'sekcja: jednostka bazowa');
  assert(html.includes('Warstwa B — jak cennik gra'), 'sekcja: osiągalność');
  assert(html.includes('Pełny katalog cen'), 'sekcja: pełny katalog');
  assert(html.includes('Warstwa A · outcome 1') && html.includes('Warstwa B · outcome 1'),
    '⚠ DWA osobne werdykty (statyczny i dynamiczny) — nie zlane w jeden');
  assert(html.includes('dwie warstwy różnego rodzaju'),
    'raport mówi wprost, że warstwy mają inną moc dowodową');
}

// ── T2: skrzynka uczciwości ──────────────────────────────────────
console.log('T2 — skrzynka uczciwości: założenia wypowiedziane wprost');
{
  assert(html.includes('NIE MOŻE przyjąć swojej jednostki za daną'),
    '⚠ najważniejsze zastrzeżenie slice\'u: jednostka nie jest dana');
  assert(html.includes('ranking slice&#39;u ROI przesuwa się razem z nią') || html.includes('slice'),
    'powiedziane, co zależy od tej jednostki');
  assert(html.includes('Kryterium audytu jest WEWNĘTRZNE'), 'kryterium = własna konwencja tabeli');
  assert(html.includes('DESIGN vs BUG rozstrzygają DANE'), 'rozstrzyganie przez dane, nie przez instrument');
  assert(html.includes('Dwie miary wsadu'), 'ruda vs wsad rynkowy — powiedziane, że to inne liczby');
  assert(/wydobycie ×5/.test(html) && html.includes('Czytać ×1'),
    '⚠ kontrfaktyk ×1 wydobycie wskazany jako liczba do czytania');
  assert(html.includes('mierzy też politykę bota'), 'osiągalność nie jest czystą własnością cennika');
  assert(html.includes('REZYDUALNIE'), 'podatek: metoda liczenia ujawniona');
  assert(html.includes('H, research'), 'dziury w cenniku wymienione z nazwy');
}

// ── T3: status — nigdy sam kolor ─────────────────────────────────
console.log('T3 — kolor + ikona + etykieta + tekstura');
{
  assert(html.includes('rr-legend'), 'legenda obecna');
  assert(html.includes('zamierzony sink') && html.includes('NIEWYJAŚNIONE'),
    'obie klasy „poniżej wsadu" mają ETYKIETĘ SŁOWNĄ, nie tylko kolor');
  assert(html.includes('hatchCrit') && html.includes('url(#hatchCrit)'),
    'klasa krytyczna ma TEKSTURĘ (nie polega na czerwieni)');
  assert(html.includes('#8a5cd6'), 'sink projektowy ma WŁASNY kolor — nie jest malowany jak błąd');
  assert(html.includes('◆') && html.includes('✕') && html.includes('✓'), 'ikony klas obecne');
}

// ── T4: outcome → klasa werdyktu ─────────────────────────────────
console.log('T4 — outcome → klasa werdyktu (osobno A i B)');
{
  const ok = renderPriceReport({ ...PAYLOAD, panel: { ...PANEL,
    verdictStatic: { outcome: 0, label: 'COHERENT' }, verdictDynamic: { outcome: 0, label: 'AFFORDABLE' } } });
  assert(ok.includes('rr-b-good') && ok.includes('COHERENT') && ok.includes('AFFORDABLE'), 'outcome 0 → klasa „dobra"');
  assert(html.includes('rr-b-crit'), 'outcome 1 warstwy A → klasa krytyczna (niewyjaśnione ceny)');
  assert(html.includes('rr-b-warn'), 'outcome 1 warstwy B → klasa ostrzegawcza (bramkowanie ≠ błąd danych)');
  const nod = renderPriceReport({ ...PAYLOAD, panel: { ...PANEL,
    verdictStatic: { outcome: 2, label: 'NO DATA' }, verdictDynamic: { outcome: 2, label: 'NO DATA' } } });
  assert(nod.includes('rr-b-none'), 'outcome 2 → klasa neutralna');
}

// ── T5: wierność danym ───────────────────────────────────────────
console.log('T5 — wierność danym');
{
  assert(html.includes('warp_cores') && html.includes('×0.46'),
    'warp_cores pokazany z OBIEMA miarami (×0.8 rudy, ×0.46 rynku)');
  assert(html.includes('creditCost') || html.includes('isDroidUnit'),
    'przy sinku widać, CO w danych go oznacza (podstawa klasy)');
  assert(html.includes('×0.11'), 'kontrfaktyk ×1 wydobycie wypisany liczbą');
  assert(html.includes('0.915') && html.includes('8.525'), 'nakład: obie wersje (zmierzona i ×1) w tabeli');
  assert(html.includes('structural_alloys') && html.includes('bloker'), 'bloker pozycji katalogu widoczny');
  assert(html.includes('orbital_construction'), 'bramka tech obok „nigdy" — żeby nie mylić z ceną');
  assert(html.includes('397') && html.includes('163'), 'księga Kr: podatek rezydualny i netto');
  assert(html.includes('×15') || html.includes('×3'), 'cena realna vs bazowa jako mnożnik');
  assert(/Kredyty w czasie/.test(html) && (html.match(/<path d="M/g) ?? []).length >= 2,
    'krzywa kredytów: jedna linia na seed');
}

// ── T6: eskejp + edge-case'y ─────────────────────────────────────
console.log('T6 — eskejp HTML + odporność na niepełny payload');
{
  const evil = renderPriceReport({ ...PAYLOAD, meta: { ...PAYLOAD.meta, scope: '<img src=x onerror=alert(1)>' } });
  assert(!evil.includes('<img src=x'), 'wstrzyknięty HTML z danych jest eskejpowany');
  assert(evil.includes('&lt;img'), 'eskejp zachowuje treść (widać, co było w danych)');

  const empty = renderPriceReport({});
  assert(typeof empty === 'string' && empty.includes('viz-root'), 'pusty payload nie wywraca renderu');
  assert(!/undefined|NaN/.test(empty.replace(/undefined-safe/g, '')), 'pusty payload bez „undefined"/„NaN" w treści');

  const noPair = renderPriceReport({ ...PAYLOAD, baseUnit: {
    boosted: { ok: true, medianCapexPerKr: 1, byResource: { energy: capex('energy', 1, 1, 'solar_farm') }, pair: { missing: ['Fe'] } },
    unboosted: { ok: true, byResource: {}, pair: { missing: ['Fe'] } } } });
  assert(!noPair.includes('Para pod lupą'), 'brak pary do porównania → sekcja nie udaje wyniku');

  const noOut = renderPriceReport({ ...PAYLOAD, audit: { ...AUDIT, outliers: [] } });
  assert(!noOut.includes('Odstające od konwencji'), 'brak odstających → brak pustej tabeli');
}

console.log(`\n═══ PriceReport keeper: ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
