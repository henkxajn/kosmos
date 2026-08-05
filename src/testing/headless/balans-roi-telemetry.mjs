// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — ROI telemetry runner (slice KOSZT↔WARTOŚĆ budynków)
// Uruchom: node src/testing/headless/balans-roi-telemetry.mjs [--class=REAL] [--seeds=8] [--gy=45]
// ───────────────────────────────────────────────────────────────
// Napędza TĘ SAMĄ grę co gate2-report, POP i ZASOBY (wspólny `balans-driver.mjs`:
// identyczny boot / bot / budżet 4 akcji na civYear), ale próbkuje KOSZT i WARTOŚĆ
// budynków raz na GAME-YEAR (RoiTelemetry) i zapisuje szereg do JSON.
//
// Pytania slice'u (mierzymy, NIE naprawiamy):
//   • ile budynek NAPRAWDĘ kosztuje (ruda + ruda schowana w komponentach)?
//   • ile realnie daje (przepływ netto z żywej gry) i po ilu game-latach się zwraca?
//   • które budynki dają mało jak na swój koszt — i czy koszty są proporcjonalne?
//   • ile prawdziwego kosztu przechodzi przez FABRYKĘ (wątek z slice'u ZASOBY)?
//
// Budynki NIE-towarowe (mieszkania / nauka / handel / reszta) mają WŁASNE metryki
// i są raportowane OSOBNO — świadomie bez wspólnego mianownika.
//
// Domyślnie class=REAL (nieznany klucz → BEZ injekcji złóż = realny generator,
// panel z Phase 1: REAL / 8 seedów / 45 gy). WSZYSTKO w game-years (HARD #3).
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runSeedPanel } from './balans-driver.mjs';
import {
  RoiTelemetry, ROI_TELEMETRY_DEFAULTS, TRACK, CIV_PER_GY,
  buildCostTable, summarizeSeed, aggregatePanel, panelVerdict, factoryTimeGy, commodityPriceVsOre,
} from './RoiTelemetry.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { renderRoiReport } from '../report/RoiReport.js';

function arg(name, def) {
  const a = process.argv.find(s => s.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}
const PLANET_CLASS = arg('class', 'REAL');
const N_SEEDS      = parseInt(arg('seeds', '8'));
const TARGET_GY    = parseFloat(arg('gy', '45'));
const SEED_PREFIX  = arg('seed', 'balans-gate1');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'reports', 'balans');

console.log(`\n═══ BALANS Phase 2 — ROI telemetry — class=${PLANET_CLASS}, seeds=${N_SEEDS}, target=${TARGET_GY}gy ═══`);
console.log(`    (class=REAL ⇒ realny generator, bez injekcji złóż — panel Phase 1)\n`);

// ── Run panel ─────────────────────────────────────────────────────
const seeds = runSeedPanel({
  seeds: N_SEEDS, seedPrefix: SEED_PREFIX, planetClass: PLANET_CLASS, targetGy: TARGET_GY,
  makeTelemetry: () => new RoiTelemetry(),
  // Koszt zależy od PLANETY (dopłata środowiskowa) → tabela kosztów liczona per seed.
  onSeed: (r) => ({
    costs: buildCostTable(r.home.planet),
    homePlanet: r.home.planet,          // referencja robocza (NIE trafia do JSON-a)
    planet: {
      name: r.home.planet?.name ?? '?',
      atmosphere: r.home.planet?.atmosphere ?? '?',
      gravity: round1(r.home.planet?.surfaceGravity ?? 0),
      tempC: round1(r.home.planet?.temperatureC ?? 0),
    },
  }),
});
for (const s of seeds) s.summary = summarizeSeed(s.series, s.costs);

const costTables = seeds.map(s => s.costs);
const catalog = costTables[0] ?? {};
const priceVsOre = commodityPriceVsOre();
const agg = aggregatePanel(seeds.map(s => s.summary), costTables);
const verdict = panelVerdict(agg, catalog);
// Werdykt KONTRFAKTYCZNY: ten sam pomiar bez mnożnika wydobycia scenariusza boosted (×5).
// Nie zastępuje werdyktu — pokazuje, ile z rozrzutu jest własnością CENNIKA, a ile scenariusza.
const verdictUnboosted = panelVerdict(agg, catalog, undefined, 'medPaybackUnboostedGy');

const shortSeed = (s) => String(s).replace(new RegExp(`^${SEED_PREFIX}_`), 'seed_');
const fmt = (n, d = 1) => (n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toString());
const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');

// ── Tabela per seed ───────────────────────────────────────────────
console.log('seed     | POP | kol | typy budynków | FP | fabryka Kr/gy (wart. dodana) | kopalnia nameplate/realny');
console.log('---------+-----+-----+---------------+----+------------------------------+--------------------------');
for (const s of seeds) {
  const m = s.summary;
  console.log(
    `${shortSeed(s.seed).padEnd(8)} | ${String(m.finalPop).padStart(3)} | ${String(m.finalColonies).padStart(3)} | ` +
    `${String(Object.keys(m.measured).length).padStart(13)} | ${String(m.factory.points).padStart(2)} | ` +
    `${(fmt(m.factory.producedKrPerGy, 0) + ' (' + fmt(m.factory.valueAddedKrPerGy, 0) + ')').padStart(28)} | ` +
    `${fmt(m.mineNameplateRatio, 2).padStart(24)}${s.crashed ? ' (CRASH)' : ''}`);
}

// ── Tor (a): budynki PRODUKCYJNE — twarde ROI ─────────────────────
// Stolica wypada ze WSZYSTKICH rankingów: koszt 0 i stawiana automatycznie (nie jest wyborem gracza).
const measuredIds = Object.keys(agg.byType).filter(id => !catalog[id]?.isCapital);
const inTrack = (id, tr) => (catalog[id]?.tracks ?? []).includes(tr);
const prodRows = measuredIds
  .filter(id => inTrack(id, TRACK.PRODUCTIVE) && agg.byType[id].medPaybackGy != null)
  .sort((a, b) => agg.byType[a].medPaybackGy - agg.byType[b].medPaybackGy);

console.log(`\n── TOR (a) BUDYNKI PRODUKCYJNE — zwrot w GAME-LATACH (mierzone, ${prodRows.length} typów) ──`);
console.log('budynek              | koszt Kr | komp. | Kr/gy/lv | ZWROT gy | ×1 wydob. | +płace gy | płace% | seedy | nominal gy');
console.log('---------------------+----------+-------+----------+----------+-----------+-----------+--------+-------+-----------');
for (const id of prodRows) {
  const a = agg.byType[id], c = catalog[id];
  console.log(
    `${id.padEnd(20)} | ${fmt(a.krLoaded, 0).padStart(8)} | ` +
    `${pct(a.embeddedShare).padStart(5)} | ${fmt(a.medKrPerGyPerLevel, 0).padStart(8)} | ${fmt(a.medPaybackGy, 2).padStart(8)} | ` +
    `${fmt(a.medPaybackUnboostedGy, 2).padStart(9)} | ${fmt(a.medPaybackWithWagesGy, 2).padStart(9)} | ` +
    `${pct(a.medKrPerGyPerLevel > 0 ? a.medWageKrPerGyPerLevel / a.medKrPerGyPerLevel : null).padStart(6)} | ` +
    `${String(a.seeds).padStart(5)} | ${fmt(c?.nominalPaybackGy, 2).padStart(10)}`);
}

// ── Tor (b): budynki NIE-TOWAROWE — własne metryki, OSOBNO ────────
const housingRows = measuredIds.filter(id => inTrack(id, TRACK.HOUSING));
if (housingRows.length) {
  console.log('\n── TOR (b1) MIESZKALNE — koszt za miejsce POP (NIE mieszać z ROI produkcyjnym) ──');
  console.log('budynek              | koszt Kr | miejsca/lv | Kr / miejsce | komp. | utrzymanie Kr/gy | kategoria');
  for (const id of housingRows.sort((x, y) => (agg.byType[x].krLoaded ?? 0) - (agg.byType[y].krLoaded ?? 0))) {
    const a = agg.byType[id], c = catalog[id];
    const perSlot = a.medHousingPerLevel > 0 ? a.krLoaded / a.medHousingPerLevel : null;
    console.log(`${id.padEnd(20)} | ${fmt(a.krLoaded, 0).padStart(8)} | ${fmt(a.medHousingPerLevel, 1).padStart(10)} | ` +
      `${fmt(perSlot, 1).padStart(12)} | ${pct(a.embeddedShare).padStart(5)} | ${fmt(-(a.medKrPerGyPerLevel ?? 0), 1).padStart(16)} | ` +
      `${c.category}${c.tags.length ? ' (' + c.tags.join(',') + ')' : ''}`);
  }
}
const researchRows = measuredIds.filter(id => inTrack(id, TRACK.RESEARCH));
if (researchRows.length) {
  console.log('\n── TOR (b2) NAUKA — koszt za nauka/gy (research NIE MA ceny w tabeli gry) ──');
  console.log('budynek              | koszt Kr | nauka/gy/lv | Kr za 1 nauka/gy | komp. | płace Kr/gy/lv');
  for (const id of researchRows.sort((x, y) => (agg.byType[y].medResearchPerGyPerLevel ?? 0) - (agg.byType[x].medResearchPerGyPerLevel ?? 0))) {
    const a = agg.byType[id];
    const perR = a.medResearchPerGyPerLevel > 0 ? a.krLoaded / a.medResearchPerGyPerLevel : null;
    console.log(`${id.padEnd(20)} | ${fmt(a.krLoaded, 0).padStart(8)} | ${fmt(a.medResearchPerGyPerLevel, 1).padStart(11)} | ` +
      `${fmt(perR, 1).padStart(16)} | ${pct(a.embeddedShare).padStart(5)} | ${fmt(a.medWageKrPerGyPerLevel, 1).padStart(14)}`);
  }
}

// ── Katalog: czego bot nigdy nie postawił (koszt + ROI NOMINALNE z danych) ──
const never = Object.keys(catalog).filter(id => !measuredIds.includes(id) && !catalog[id].isCapital);
console.log(`\n── KATALOG: ${agg.measuredTypes}/${agg.catalogSize} typów zmierzonych; ${never.length} nigdy nie postawionych (ROI NOMINALNE z danych) ──`);
const neverProd = never.filter(id => catalog[id].tracks.includes(TRACK.PRODUCTIVE) && catalog[id].nominalPaybackGy != null)
  .sort((a, b) => catalog[a].nominalPaybackGy - catalog[b].nominalPaybackGy);
for (const id of neverProd) {
  const c = catalog[id];
  console.log(`  ${id.padEnd(24)} koszt ${fmt(c.cost.krLoaded, 0).padStart(6)} Kr · komp. ${pct(c.cost.embeddedShare).padStart(4)} · ` +
    `nominalnie ${fmt(c.nominalKrPerGy, 0).padStart(6)} Kr/gy → zwrot ${fmt(c.nominalPaybackGy, 2)} gy` +
    (c.requires ? ` · tech ${c.requires}` : ''));
}
const noValue = never.filter(id => catalog[id].tracks.includes(TRACK.OTHER));
if (noValue.length) {
  console.log(`\n  BEZ MIERZALNEGO WYJŚCIA (${noValue.length}) — koszt widoczny, wartość poza tym slice'em:`);
  for (const id of noValue.sort((a, b) => catalog[b].cost.krLoaded - catalog[a].cost.krLoaded)) {
    const c = catalog[id];
    console.log(`    ${id.padEnd(24)} ${fmt(c.cost.krLoaded, 0).padStart(6)} Kr · komp. ${pct(c.cost.embeddedShare).padStart(4)} · efekty: ${c.tags.join(',') || '—'}`);
  }
}

// ── Fabryka — wątek z slice'u ZASOBY ──────────────────────────────
const facPoints = agg.factory.medPoints || 1;
const facSpeed  = seeds[0]?.summary?.factory?.speedMult ?? 1;
console.log(`\n── FABRYKA (wątek slice'u ZASOBY) — ${facPoints} punktów, prędkość ×${fmt(facSpeed, 2)} ──`);
console.log(`  przerób: ${fmt(agg.factory.medProducedKrPerGy, 0)} Kr/gy wyjścia − ${fmt(agg.factory.medInputKrPerGy, 0)} Kr/gy rudy` +
  ` = wartość dodana ${fmt(agg.factory.medValueAddedKrPerGy, 0)} Kr/gy (mediana panelu)`);
const facCost = catalog.factory?.cost?.krLoaded ?? 0;
console.log(`  koszt budynku „factory": ${fmt(facCost, 0)} Kr w pełni obciążony (${pct(catalog.factory?.cost?.embeddedShare)} przez fabrykę)` +
  ` → zwrot ${fmt(facCost > 0 && agg.factory.medValueAddedKrPerGy > 0 ? facCost / (agg.factory.medValueAddedKrPerGy / facPoints) : null, 2)} gy na punkt`);
console.log(`  udział kosztu przechodzącego przez fabrykę — mediana CAŁEGO katalogu: ${pct(agg.medEmbeddedShare)}`);
const below = Object.entries(priceVsOre).filter(([, v]) => v.belowOre);
if (below.length) {
  console.log(`  ⚠ ${below.length} towarów gra wycenia PONIŻEJ rudy w recepturze (dlatego „wartość dodana" potrafi być ujemna):`);
  for (const [id, v] of below.sort((a, b) => a[1].ratio - b[1].ratio)) {
    console.log(`      ${id.padEnd(22)} cena ${fmt(v.price, 0).padStart(5)} Kr vs ruda ${fmt(v.oreKr, 0).padStart(6)} Kr (×${fmt(v.ratio, 2)})${v.credits ? ' + ' + fmt(v.credits, 0) + ' Kr/szt.' : ''}`);
  }
  console.log('    (ceny to OSOBNY slice — tu tylko odnotowane, bez rozstrzygania)');
}
console.log('\n  czas fabryki na komponenty budynku (gy WYŁĄCZNEGO przerobu przy obecnych punktach):');
const facTimeRows = [...prodRows, ...housingRows].slice(0, 12)
  .map(id => [id, factoryTimeGy(BUILDINGS[id], seeds[0]?.homePlanet ?? null, { points: facPoints, speedMult: facSpeed })]);
for (const [id, t] of facTimeRows.sort((a, b) => b[1] - a[1])) console.log(`    ${id.padEnd(24)} ${fmt(t, 2)} gy`);

// ── Werdykt ───────────────────────────────────────────────────────
console.log(`\n  ► WERDYKT (outcome ${verdict.outcome}): ${verdict.label}`);
if (verdict.best) {
  console.log(`    najszybszy zwrot: ${verdict.best} (${fmt(verdict.bestPaybackGy, 2)} gy) · najwolniejszy: ${verdict.worst} (${fmt(verdict.worstPaybackGy, 2)} gy)`);
}
if (verdictUnboosted.spread != null && verdict.spread != null) {
  console.log(`    kontrfaktycznie BEZ mnożnika wydobycia scenariusza (×${RoiTelemetry.mineRateMult()}): rozrzut ${fmt(verdictUnboosted.spread, 2)}× ` +
    `(outcome ${verdictUnboosted.outcome}) — ${verdictUnboosted.best} ${fmt(verdictUnboosted.bestPaybackGy, 2)} gy … ${verdictUnboosted.worst} ${fmt(verdictUnboosted.worstPaybackGy, 2)} gy`);
}
if (agg.medMineNameplateRatio != null) {
  console.log(`    ⚠ kopalnie: tooltip gry pokazuje ×${fmt(agg.medMineNameplateRatio, 2)} realnego urobku (obsada + brownout nie są w rozbiciu)`);
}

// ── Zapis JSON + HTML ─────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
// `series` niesie migawkę per typ budynku na każdy game-rok — raport go NIE potrzebuje
// (czyta podsumowania), ale zostaje w JSON-ie jako surowe dane do dalszych analiz.
const payload = {
  meta: {
    tool: 'BALANS 1.0 Phase 2 — ROI telemetry (building cost↔value vertical slice)',
    planetClass: PLANET_CLASS, seeds: N_SEEDS, targetGy: TARGET_GY, seedPrefix: SEED_PREFIX,
    thresholds: { ...ROI_TELEMETRY_DEFAULTS },
    civPerGy: CIV_PER_GY,
    unit: 'game-years (1 gy = 12 civ-yr); stawki przeliczone na game-year',
    priceSource: 'TradeValuesData.BASE_PRICE (własna tabela wyceny gry) — koszt i wyjście sprowadzone do Kr RUDY',
    costModel: 'w pełni obciążony = ruda z cost + ruda rozwinięta z commodityCost (rekurencyjnie przez COMMODITIES.recipe); latBuildCost=1',
    valueModel: 'MIERZONE: effectiveRates żywej gry + realny urobek kopalń (getMineOutputEstimate); NOMINALNE (z danych) dla budynków nigdy nie postawionych',
    tracks: Object.values(TRACK),
    scope: 'kolonia macierzysta; scenariusz civilization_boosted (kopalnie ×5, złoża ×10, fabryka ×1.5) — parytet z POP i ZASOBAMI',
    note: 'read-only instrument — zero stałych balansu; logika gry i polityka bota nietknięte',
  },
  catalog,
  priceVsOre,
  seeds: seeds.map(s => ({
    seed: s.seed, crashed: s.crashed, planet: s.planet, summary: s.summary, series: s.series,
  })),
  panel: { ...agg, verdict, verdictUnboosted, mineRateMult: RoiTelemetry.mineRateMult() },
};
const jsonPath = join(OUT_DIR, `roi-telemetry-${PLANET_CLASS}.json`);
writeFileSync(jsonPath, JSON.stringify(payload));

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>BALANS Phase 2 — ROI telemetry (${PLANET_CLASS})</title>` +
  `<style>html,body{margin:0}</style></head><body>${renderRoiReport(payload)}</body></html>`;
const htmlPath = join(OUT_DIR, `roi-report-${PLANET_CLASS}.html`);
writeFileSync(htmlPath, html);

console.log(`\n  JSON:   ${jsonPath}`);
console.log(`  RAPORT: ${htmlPath}`);
console.log(`  crashes: ${seeds.filter(s => s.crashed).length}/${seeds.length}\n`);

function round1(n) { return Math.round((n ?? 0) * 10) / 10; }
