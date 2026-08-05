// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — RESOURCE telemetry runner (slice ZASOBY)
// Uruchom: node src/testing/headless/balans-resource-telemetry.mjs [--class=REAL] [--seeds=8] [--gy=45]
// ───────────────────────────────────────────────────────────────
// Napędza TĘ SAMĄ grę co gate2-report i POP slice (wspólny `balans-driver.mjs`:
// identyczny boot / bot / budżet 4 akcji na civYear), ale próbkuje ekonomię
// SUROWCOWĄ raz na GAME-YEAR (ResourceTelemetry) i zapisuje szereg do JSON + HTML.
//
// Pytania slice'u (mierzymy, NIE naprawiamy):
//   • czy produkcja nadąża za konsumpcją — per zasób?
//   • który zasób WIĄŻE gospodarkę, kiedy i jak często (panel seedów)?
//   • które zasoby są martwe (INERT) albo bez ujścia (GLUT)?
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
  ResourceTelemetry, RESOURCE_TELEMETRY_DEFAULTS, RESOURCE_IDS, RES_STATE,
  summarizeSeed, aggregatePanel, panelVerdict,
} from './ResourceTelemetry.js';
import { renderResourceReport } from '../report/ResourceReport.js';

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

// ── Run panel ─────────────────────────────────────────────────────
console.log(`\n═══ BALANS Phase 2 — RESOURCE telemetry — class=${PLANET_CLASS}, seeds=${N_SEEDS}, target=${TARGET_GY}gy ═══`);
console.log(`    (class=REAL ⇒ realny generator, bez injekcji złóż — panel Phase 1)\n`);

const seeds = runSeedPanel({
  seeds: N_SEEDS, seedPrefix: SEED_PREFIX, planetClass: PLANET_CLASS, targetGy: TARGET_GY,
  makeTelemetry: () => new ResourceTelemetry(),
});
for (const s of seeds) s.summary = summarizeSeed(s.series);
const agg = aggregatePanel(seeds.map(s => s.summary));
const verdict = panelVerdict(agg);

const shortSeed = (s) => String(s).replace(new RegExp(`^${SEED_PREFIX}_`), 'seed_');

// ── Tabela per seed ───────────────────────────────────────────────
console.log('seed     | stall lat (od gy) | wiążące zasoby (lata)        | top bloker (lata)          | popCons=0 od');
console.log('---------+-------------------+------------------------------+----------------------------+-------------');
for (const s of seeds) {
  const m = s.summary;
  const bind = RESOURCE_IDS.filter(id => m.byRes[id].binding > 0)
    .sort((a, b) => m.byRes[b].binding - m.byRes[a].binding)
    .slice(0, 3).map(id => `${id}:${m.byRes[id].binding}`).join(' ') || '—';
  const top = Object.entries(m.topBlockerYears).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([k, v]) => `${k}:${v}`).join(' ') || '—';
  console.log(
    `${shortSeed(s.seed).padEnd(8)} | ${String(m.stalledYears).padStart(3)}${m.firstStallGy != null ? ` (gy${String(m.firstStallGy).padStart(2)})` : '     '}      | ` +
    `${bind.padEnd(28)} | ${top.padEnd(26)} | ${m.popConsZeroedFromGy != null ? 'gy' + m.popConsZeroedFromGy : '—'}${s.crashed ? ' (CRASH)' : ''}`);
}

// ── Tabela per zasób (panel) ──────────────────────────────────────
console.log(`\n── PANEL per zasób (${agg.totalYears} seed-lat, gy≥1; stawki na GAME-YEAR) ──`);
console.log('zasób    | śr.prod | śr.cons | nadąża | binding | tight |  glut | inert | seedy-bind | 1. bind');
console.log('---------+---------+---------+--------+---------+-------+-------+-------+------------+--------');
for (const id of RESOURCE_IDS) {
  const a = agg.byRes[id];
  console.log(`${id.padEnd(8)} | ${fmt(a.meanProd).padStart(7)} | ${fmt(a.meanCons).padStart(7)} | ` +
    `${(a.keepsUp ? 'tak' : 'NIE').padStart(6)} | ${String(a.bindingYears).padStart(7)} | ${String(a.tightYears).padStart(5)} | ` +
    `${String(a.glutYears).padStart(5)} | ${String(a.inertYears).padStart(5)} | ${String(a.seedsBinding).padStart(10)} | ` +
    `${a.earliestBindGy != null ? 'gy' + a.earliestBindGy : '—'}`);
}

// ── Top blokery (WSZYSTKIE klucze kosztu — surowce I towary) ──────
console.log('\n── Top blokery budowy (ile seed-lat dany klucz był głównym blokerem) ──');
const topAll = Object.entries(agg.topBlockers).sort((a, b) => b[1] - a[1]).slice(0, 8);
for (const [k, v] of topAll) console.log(`  ${k.padEnd(22)} ${String(v).padStart(4)} seed-lat`);

// ── Werdykt ───────────────────────────────────────────────────────
console.log(`\n  ► WERDYKT (outcome ${verdict.outcome}): ${verdict.label}`);
if (verdict.binder) console.log(`    dominant: ${verdict.binder} (${Math.round(verdict.share * 100)}% wiążących seed-lat, razem ${verdict.bindingYears})`);
console.log(`    gospodarka STOI (0 osiągalnych budynków): ${agg.stalledYears}/${agg.totalYears} seed-lat na ${agg.seedsStalled}/${agg.seeds} seedach`);
if (agg.seedsPopConsZeroed > 0) {
  console.log(`\n  ⚠ UWAGA POMIAROWA: na ${agg.seedsPopConsZeroed}/${agg.seeds} seedach konsumpcja POP (food/water/energy)`);
  console.log('    ZNIKA z rejestru producentów macierzystej kolonii → od tego roku food/water/energy');
  console.log('    NIE są wiarygodne. Mechanizm + zasięg: docs/BALANS_PHASE2_RESOURCES.md');
}

// ── Zapis JSON + HTML ─────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
// `row.stock` to pole WEWNĘTRZNE (wątek delty rok-do-roku) — duplikuje res[id].stock,
// więc nie trafia do artefaktu (JSON i tak jest duży: 14 zasobów × lata × seedy).
const slim = (series) => series.map(({ stock, ...rest }) => rest);
const payload = {
  meta: {
    tool: 'BALANS 1.0 Phase 2 — RESOURCE telemetry (resources vertical slice)',
    planetClass: PLANET_CLASS, seeds: N_SEEDS, targetGy: TARGET_GY, seedPrefix: SEED_PREFIX,
    thresholds: { ...RESOURCE_TELEMETRY_DEFAULTS },
    unit: 'game-years (1 gy = 12 civ-yr); stawki przeliczone na game-year',
    resourceIds: RESOURCE_IDS,
    states: Object.values(RES_STATE),
    classifier: 'binding = gospodarka stoi (0 osiągalnych budynków) I zasób blokuje, ALBO magazyn pusty i drenuje',
    scope: 'kolonia macierzysta; towary (COMMODITIES) tylko jako blokery + stan magazynu',
    note: 'read-only instrument — zero stałych balansu; logika gry i polityka bota nietknięte',
  },
  seeds: seeds.map(s => ({ seed: s.seed, crashed: s.crashed, summary: s.summary, series: slim(s.series) })),
  panel: { ...agg, verdict },
};
const jsonPath = join(OUT_DIR, `resource-telemetry-${PLANET_CLASS}.json`);
writeFileSync(jsonPath, JSON.stringify(payload));

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>BALANS Phase 2 — RESOURCE telemetry (${PLANET_CLASS})</title>` +
  `<style>html,body{margin:0}</style></head><body>${renderResourceReport(payload)}</body></html>`;
const htmlPath = join(OUT_DIR, `resource-report-${PLANET_CLASS}.html`);
writeFileSync(htmlPath, html);

console.log(`\n  JSON:   ${jsonPath}`);
console.log(`  RAPORT: ${htmlPath}`);
console.log(`  crashes: ${seeds.filter(s => s.crashed).length}/${seeds.length}\n`);

function fmt(n) { return (Math.round((n ?? 0) * 10) / 10).toString(); }
