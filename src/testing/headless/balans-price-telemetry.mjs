// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — PRICE telemetry runner (slice CENY / osiągalność)
// Uruchom: node src/testing/headless/balans-price-telemetry.mjs [--class=REAL] [--seeds=8] [--gy=45]
// ───────────────────────────────────────────────────────────────
// Slice CENY ma DWIE WARSTWY i ten runner drukuje obie, świadomie ROZDZIELONE:
//
//   A/A′ — AUDYT TABELI (statyczny, `PriceAudit.js`): czy cena towaru pokrywa jego
//          wsad? które ceny odstają? czy jednostka bazowa (energia = 1 Kr = 1 Fe)
//          jest ugruntowana, czy to konwencja, na której wiszą wnioski slice'u ROI?
//   B    — OSIĄGALNOŚĆ (dynamiczna, `PriceTelemetry.js`): przez TEN SAM wspólny
//          `balans-driver.mjs` co POP / ZASOBY / ROI (identyczny boot, bot i budżet
//          akcji), więc mierzona krzywa jest DOKŁADNIE ta sama. Ile Kr gracz zarabia,
//          na co je wydaje, co i kiedy staje się osiągalne.
//
// Pytania slice'u (mierzymy, NIE naprawiamy — HARD #1):
//   • które ceny są poniżej wsadu i które z nich są zamierzone (marker w danych)?
//   • czy 1 energii naprawdę jest warta 1 Fe — czy to arbitralna jednostka?
//   • jaka jest luka „chcę → stać mnie" w GAME-LATACH i co realnie bramkuje?
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
  PRICE_DEFAULTS, PRICE_CLASS, CIV_PER_GY,
  auditPriceTable, staticVerdict, capexTable, assessBaseUnit, buildPurchaseCatalog,
} from './PriceAudit.js';
import {
  PriceTelemetry, AFFORD_CLASS, KR_BUCKETS, summarizeSeed, aggregatePanel, dynamicVerdict,
} from './PriceTelemetry.js';
import { RoiTelemetry } from './RoiTelemetry.js';

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

console.log(`\n═══ BALANS Phase 2 — CENY — class=${PLANET_CLASS}, seeds=${N_SEEDS}, target=${TARGET_GY}gy ═══`);
console.log(`    (class=REAL ⇒ realny generator, bez injekcji złóż — panel Phase 1)\n`);

const fmt = (n, d = 1) => (n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toString());
const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const shortSeed = (s) => String(s).replace(new RegExp(`^${SEED_PREFIX}_`), 'seed_');

// ═══════════════════════════════════════════════════════════════
// WARSTWA A — audyt tabeli (nie wymaga symulacji)
// ═══════════════════════════════════════════════════════════════
const audit = auditPriceTable();
const vStatic = staticVerdict(audit);

console.log('── WARSTWA A — AUDYT TABELI CEN (statyczny; kryterium = własna konwencja cennika ×'
  + PRICE_DEFAULTS.CONVENTION_MARGIN + ') ──');
console.log(`  towary: ${audit.stats.total} · wycenialne: ${audit.stats.measurable} · w konwencji: ${audit.stats.conforms}`
  + ` · odstające od konwencji: ${audit.stats.off} · poniżej wsadu: ${audit.stats.belowCost}`
  + ` (sink z danych ${audit.stats.designSink} / NIEWYJAŚNIONE ${audit.stats.suspect}) · bez danych: ${audit.stats.noData}`);

const below = Object.values(audit.commodities)
  .filter(c => c.belowOre || c.belowDirect)
  .sort((a, b) => (a.ratioOre ?? 9) - (b.ratioOre ?? 9));
if (below.length) {
  console.log('\n  CENY PONIŻEJ WSADU — rozdzielone wg MARKERA W DANYCH (nie wg mojej oceny):');
  console.log('  towar                  | cena  | ruda (rekur.) | wsad rynkowy | ×ruda | ×rynek | +Kr/szt | klasa');
  console.log('  -----------------------+-------+---------------+--------------+-------+--------+---------+---------------');
  for (const c of below) {
    console.log(`  ${c.id.padEnd(22)} | ${fmt(c.price, 0).padStart(5)} | ${fmt(c.oreKr, 0).padStart(13)} | ` +
      `${fmt(c.directKr, 0).padStart(12)} | ${fmt(c.ratioOre, 2).padStart(5)} | ${fmt(c.ratioDirect, 2).padStart(6)} | ` +
      `${(c.creditCost ? fmt(c.creditCost, 0) : '—').padStart(7)} | ${c.cls}`);
  }
  console.log('    design_sink = DANE niosą marker sinku (isDroidUnit / creditCost) → prawdopodobnie zamierzone');
  console.log('    suspect_below_cost = brak wyjaśnienia w danych → kandydat na błąd cennika (decyzja: Filip)');
}

const off = Object.values(audit.commodities).filter(c => c.cls === PRICE_CLASS.OFF)
  .sort((a, b) => (b.conformance ?? 0) - (a.conformance ?? 0));
if (off.length) {
  console.log('\n  ODCHYLENIA OD KONWENCJI TABELI (cena pokrywa wsad, ale nie trzyma reguły ×1.3):');
  for (const c of off) {
    console.log(`    ${c.id.padEnd(22)} cena ${fmt(c.price, 0).padStart(5)} Kr vs konwencja ${fmt(c.conventionKr, 0).padStart(6)} Kr → ×${fmt(c.conformance, 2)}`);
  }
}
if (audit.outliers.length) {
  console.log('\n  ODSTAJĄCE (robust z-score na log zgodności, próg |z| ≥ ' + PRICE_DEFAULTS.OUTLIER_Z + '):');
  for (const o of audit.outliers) console.log(`    ${o.id.padEnd(22)} ×${fmt(o.conformance, 3)} konwencji  z=${fmt(o.z, 1)}  [${o.cls}]`);
}
if (audit.stats.noData) {
  console.log('\n  BEZ DANYCH — i to są DWA różne braki:');
  if (audit.stats.unpricedGoods.length)
    console.log(`    brak ceny w tabeli (poza handlem): ${audit.stats.unpricedGoods.join(', ')}`);
  if (audit.stats.unpricedInputGoods.length)
    console.log(`    nieceniony surowiec we wsadzie:   ${audit.stats.unpricedInputGoods.join(', ')}` +
      ` (surowce bez ceny: ${audit.stats.unpricedResources.join(', ')})`);
}
console.log(`\n  ► WERDYKT A (outcome ${vStatic.outcome}): ${vStatic.label}`);

// ═══════════════════════════════════════════════════════════════
// WARSTWA B — przebieg panelu
// ═══════════════════════════════════════════════════════════════
const seeds = runSeedPanel({
  seeds: N_SEEDS, seedPrefix: SEED_PREFIX, planetClass: PLANET_CLASS, targetGy: TARGET_GY,
  makeTelemetry: () => new PriceTelemetry(),
  // Koszt zależy od PLANETY (dopłata środowiskowa) → katalog i nakład liczone per seed.
  onSeed: (r) => ({
    catalog: buildPurchaseCatalog(r.home.planet),
    capexNominal: capexTable(r.home.planet),
    planet: {
      name: r.home.planet?.name ?? '?',
      atmosphere: r.home.planet?.atmosphere ?? '?',
      gravity: round1(r.home.planet?.surfaceGravity ?? 0),
      tempC: round1(r.home.planet?.temperatureC ?? 0),
    },
  }),
});
for (const s of seeds) s.summary = summarizeSeed(s.series, s.catalog);

const catalog = seeds[0]?.catalog ?? {};
const agg = aggregatePanel(seeds.map(s => s.summary), catalog);
const vDynamic = dynamicVerdict(agg, catalog);

// ── A′: nakład NOMINALNY (dane) scalony z MIERZONYM (żywa gra ma kopalnie) ──
// Mierzony wygrywa tam, gdzie istnieje — to ta sama liczba, ale z terenem, tech i obsadą.
const capexNominal = seeds[0]?.capexNominal ?? {};
const capexMerged = { ...capexNominal };
for (const [r, v] of Object.entries(agg.capexMeasured ?? {})) capexMerged[r] = v;
// Kontrfaktycznie: ×1 wydobycie (mnożnik scenariusza dotyka WYŁĄCZNIE kopalń).
const capexMergedUn = {};
for (const [r, v] of Object.entries(capexMerged)) {
  capexMergedUn[r] = v.capexPerKrUnboosted != null
    ? { ...v, capexPerKr: v.capexPerKrUnboosted } : v;
}
const baseUnit   = assessBaseUnit(capexMerged);
const baseUnitUn = assessBaseUnit(capexMergedUn);
const mineMult   = RoiTelemetry.mineRateMult();

console.log('\n── WARSTWA A′ — JEDNOSTKA BAZOWA: czy 1 energii naprawdę jest warta 1 Fe? ──');
console.log('  nakład = koszt budynku w pełni obciążony ÷ (przepływ netto na GAME-ROK) ÷ CENA zasobu');
console.log('  → gdyby cennik odzwierciedlał nakład produkcyjny, kolumna „Kr nakładu / 1 Kr/gy" byłaby PODOBNA dla wszystkich\n');
console.log('  zasób    | cena | źródło                 | przepływ/gy | Kr nakładu / 1 Kr/gy | ×1 wydob. | vs mediana | cena implikowana');
console.log('  ---------+------+------------------------+-------------+----------------------+-----------+------------+-----------------');
for (const r of Object.values(baseUnit.byResource ?? {}).sort((a, b) => a.capexPerKr - b.capexPerKr)) {
  const un = capexMerged[r.resource]?.capexPerKrUnboosted;
  console.log(`  ${r.resource.padEnd(8)} | ${fmt(r.price, 0).padStart(4)} | ${String(r.from ?? '—').padEnd(22)} | ` +
    `${fmt(r.perGy, 0).padStart(11)} | ${fmt(r.capexPerKr, 3).padStart(20)} | ${fmt(un, 3).padStart(9)} | ` +
    `${('×' + fmt(r.relativeToMedian, 2)).padStart(10)} | ${fmt(r.impliedPrice, 2).padStart(16)}`);
}
if (baseUnit.pair?.a) {
  const p = baseUnit.pair, pu = baseUnitUn.pair;
  console.log(`\n  PARA POD LUPĄ (${p.a} vs ${p.b}): cennik mówi ×${fmt(p.listedRatio, 2)}, nakład mówi ×${fmt(p.impliedRatio, 2)}` +
    ` → rozjazd ×${fmt(p.skew, 2)}`);
  if (pu?.skew != null && mineMult !== 1) {
    console.log(`  kontrfaktycznie przy ×1 wydobyciu (scenariusz daje ×${mineMult}): nakład ×${fmt(pu.impliedRatio, 2)} → rozjazd ×${fmt(pu.skew, 2)}`);
    console.log('  ⚠ to jest TA SAMA zmierzona seria z urobkiem kopalń podzielonym przez mnożnik scenariusza — nie drugi przebieg');
  }
}

// ── Tabela per seed ───────────────────────────────────────────────
console.log('\n── PRZEBIEG — Kr per seed (wszystko na GAME-ROK) ──');
console.log('seed     | POP | kol | kredyty koniec | min | podatek/gy (rezyd.) | handel/gy | płace/gy | flota/gy | netto/gy');
console.log('---------+-----+-----+----------------+-----+---------------------+-----------+----------+----------+---------');
for (const s of seeds) {
  const m = s.summary, l = m.ledgerPerGy ?? {};
  console.log(
    `${shortSeed(s.seed).padEnd(8)} | ${String(m.finalPop).padStart(3)} | ${String(m.finalColonies).padStart(3)} | ` +
    `${fmt(m.creditsEnd, 0).padStart(14)} | ${fmt(m.creditsMin, 0).padStart(3)} | ${fmt(m.taxResidualPerGy, 0).padStart(19)} | ` +
    `${fmt(l.trade, 0).padStart(9)} | ${fmt(l.wages, 0).padStart(8)} | ${fmt(l.fleet_upkeep, 0).padStart(8)} | ` +
    `${fmt(m.netKrPerGy, 0).padStart(8)}${s.crashed ? ' (CRASH)' : ''}`);
}

// ── Księga Kr — mediana panelu ────────────────────────────────────
console.log('\n── KSIĘGA Kr (mediana panelu, na GAME-ROK) — realizacja, nie deklaracja ──');
console.log(`  podatek (REZYDUALNIE — nie emituje zdarzenia): ${fmt(agg.medTaxResidualPerGy, 0)} Kr/gy`);
for (const b of KR_BUCKETS) {
  const v = agg.ledgerPerGy?.[b];
  if (v == null || v === 0) continue;
  console.log(`  ${b.padEnd(22)} ${fmt(v, 0).padStart(8)} Kr/gy`);
}
console.log(`  NETTO                  ${fmt(agg.medNetKrPerGy, 0).padStart(8)} Kr/gy` +
  `  (kredyty na koniec: ${fmt(agg.medCreditsEnd, 0)}, minimum przebiegu: ${fmt(agg.medCreditsMin, 0)})`);
const np = agg.nameplateMed ?? {};
console.log(`  „z metki" na koniec: podatek ${fmt(np.taxPerGy, 0)} · płace ${fmt(np.wagesPerGy, 0)} · flota ${fmt(np.fleetUpkeepPerGy, 0)} · handel ${fmt(np.tradePerGy, 0)} Kr/gy`);
console.log(`  siła nabywcza magazynu: ${fmt(agg.medStockKrEnd, 0)} Kr w rudzie + ${fmt(agg.medCommodityKrEnd, 0)} Kr w towarach`);

// ── Osiągalność ───────────────────────────────────────────────────
const CLS_ORDER = [AFFORD_CLASS.NEVER, AFFORD_CLASS.GATING, AFFORD_CLASS.NORMAL, AFFORD_CLASS.TRIVIAL];
const CLS_LABEL = {
  [AFFORD_CLASS.NEVER]: 'NIGDY', [AFFORD_CLASS.GATING]: 'BRAMKUJE',
  [AFFORD_CLASS.NORMAL]: 'zwykłe', [AFFORD_CLASS.TRIVIAL]: 'TRYWIALNE',
};
console.log('\n── OSIĄGALNOŚĆ — „chcę → stać mnie" w GAME-LATACH (realna bramka gry: canAfford + kredyty) ──');
console.log('pozycja                   | rodzaj      | koszt Kr | +Kr  | utrzym/gy | 1.raz gy | lat | naraz | seedy | BLOKER      | klasa     | tech');
console.log('--------------------------+-------------+----------+------+-----------+----------+-----+-------+-------+-------------+-----------+------');
const rows = Object.entries(agg.items ?? {})
  .sort((a, b) => CLS_ORDER.indexOf(a[1].cls) - CLS_ORDER.indexOf(b[1].cls)
    || (catalog[b[0]]?.totalKr ?? 0) - (catalog[a[0]]?.totalKr ?? 0));
for (const [id, v] of rows) {
  const c = catalog[id] ?? {};
  console.log(`${id.padEnd(25)} | ${String(c.kind ?? '?').padEnd(11)} | ${fmt(c.krLoaded, 0).padStart(8)} | ` +
    `${fmt(c.krCost, 0).padStart(4)} | ${fmt(c.upkeepKrPerGy, 0).padStart(9)} | ${fmt(v.medFirstAffordableGy, 0).padStart(8)} | ` +
    `${pct(v.medShare).padStart(3)} | ${fmt(v.medHeadroom, 1).padStart(5)} | ${(v.seedsAffordable + '/' + v.seeds).padStart(5)} | ` +
    `${String(v.blocker ?? '—').padEnd(11)} | ${CLS_LABEL[v.cls].padEnd(9)} | ${c.requires ? c.requires.slice(0, 18) : '—'}`);
}
console.log('  „seedy" = na ilu seedach pozycja BYŁA kiedykolwiek osiągalna; klasa panelu przy remisie wybiera GORSZĄ.');
console.log('  „BLOKER" = klucz kosztu, którego magazyn najczęściej NIE pokrywał (Kr = zabrakło kredytów).');
console.log(`\n  ► WERDYKT B (outcome ${vDynamic.outcome}): ${vDynamic.label}`);
if (vDynamic.neverIds?.length) {
  console.log('    ⚠ „nigdy" NIE rozdziela ceny od bramki technologicznej — kolumna „tech" pokazuje, które pozycje');
  console.log('      były w ogóle zablokowane technologią u tego bota (osobna przyczyna niż cena).');
}

// ── Cena realna w grze vs cena bazowa ─────────────────────────────
console.log('\n── CENA REALNA W GRZE (BASE_PRICE × własny mnożnik niedoboru gry, mediana panelu) ──');
console.log('  towar/surowiec         | bazowa | realna | ×mnożnik');
const lp = agg.localPriceMed ?? {};
const lpRows = Object.entries(lp)
  .map(([id, real]) => [id, real, catalogPrice(id)])
  .filter(([, real, base]) => base != null && real != null)
  .sort((a, b) => (b[1] / b[2]) - (a[1] / a[2]));
for (const [id, real, base] of lpRows.slice(0, 12)) {
  console.log(`  ${id.padEnd(22)} | ${fmt(base, 1).padStart(6)} | ${fmt(real, 1).padStart(6)} | ×${fmt(real / base, 2)}`);
}
console.log('  … (pełna lista w raporcie HTML)');

// ── Zapis JSON + HTML ─────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  meta: {
    tool: 'BALANS 1.0 Phase 2 — PRICE telemetry (price-table audit + affordability vertical slice)',
    planetClass: PLANET_CLASS, seeds: N_SEEDS, targetGy: TARGET_GY, seedPrefix: SEED_PREFIX,
    thresholds: { ...PRICE_DEFAULTS },
    civPerGy: CIV_PER_GY,
    mineRateMult: mineMult,
    unit: 'game-years (1 gy = 12 civ-yr); stawki przeliczone na game-year',
    priceSource: 'TradeValuesData.BASE_PRICE + COMMODITIES.recipe (własna tabela i receptury gry)',
    auditCriterion: 'własna konwencja cennika: cena = koszt surowców × 1.3 (dokumentacja TradeValuesData)',
    adjudication: 'design vs suspect rozstrzygają DANE (isDroidUnit / creditCost), nie autor pomiaru',
    affordModel: 'realna bramka gry: ResourceSystem.canAfford(koszt) + stan kredytów kolonii',
    clockNote: 'przepływy Kr chodzą na zegarze GRY (podatek/flota per rok gry); handel cywilny i utrzymanie jednostek naziemnych per civ-rok → ×12',
    scope: 'kolonia macierzysta; scenariusz civilization_boosted (kopalnie ×5, złoża ×10, fabryka ×1.5) — parytet z POP / ZASOBAMI / ROI',
    note: 'read-only instrument — zero stałych balansu; logika gry i polityka bota nietknięte',
  },
  audit,
  catalog,
  baseUnit: { boosted: baseUnit, unboosted: baseUnitUn, capexNominal, capexMeasured: agg.capexMeasured },
  seeds: seeds.map(s => ({
    seed: s.seed, crashed: s.crashed, planet: s.planet, summary: s.summary, series: s.series,
  })),
  panel: { ...agg, verdictStatic: vStatic, verdictDynamic: vDynamic },
};
const jsonPath = join(OUT_DIR, `price-telemetry-${PLANET_CLASS}.json`);
writeFileSync(jsonPath, JSON.stringify(payload));

console.log(`\n  JSON:   ${jsonPath}`);
console.log(`  crashes: ${seeds.filter(s => s.crashed).length}/${seeds.length}\n`);

function round1(n) { return Math.round((n ?? 0) * 10) / 10; }
function catalogPrice(id) {
  const c = audit.commodities[id];
  if (c) return c.price;
  return audit.resources[id]?.price ?? null;
}
