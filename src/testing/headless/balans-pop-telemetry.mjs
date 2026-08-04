// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — POP telemetry runner (POP vertical slice)
// Uruchom: node src/testing/headless/balans-pop-telemetry.mjs [--class=REAL] [--seeds=8] [--gy=45]
// ───────────────────────────────────────────────────────────────
// Napędza TĘ SAMĄ grę co gate2-report (identyczny boot / bot / budżet 4
// akcji na civYear), ale zamiast kamieni milowych — próbkuje ekonomię POP
// raz na GAME-YEAR (PopTelemetry) i zapisuje szereg czasowy do JSON.
//
// Cel slice'u: rozstrzygnąć finding #1 (POP-glut) miarą zdrowy/zmarnowany
// wg definicji Filipa. Trzy możliwe wyniki:
//   (1) BUFFER — nadwyżka ma ujście (metryka mierzyła zły sygnał → #1 false alarm)
//   (2) WASTED — realny glut bez ujścia (bot gra inaczej niż gracz)
//   (3) GONE   — nadwyżki prawie nie ma (stan po zmianach slidera)
// MIERZYMY, nie naprawiamy: runner drukuje werdykt, niczego nie zmienia.
//
// Domyślnie class=REAL (nieznany klucz → BEZ injekcji złóż = realny generator,
// panel z Phase 1: REAL / 8 seedów / 45 gy). WSZYSTKO w game-years (HARD #3).
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { reseed } from './env.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import { ActionCatalog } from '../actions/ActionCatalog.js';
import ActionAdapter from '../actions/ActionAdapter.js';
import { RuleBot } from '../bots/RuleBot.js';
import { PopTelemetry, POP_TELEMETRY_DEFAULTS } from './PopTelemetry.js';

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

// ── Jedna gra: identyczny driver co gate2-report + próbkowanie POP/game-year ──
function runOne(seed) {
  reseed(seed);
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: PLANET_CLASS });
  const K = window.KOSMOS;
  const home = core.colonyManager.getColony(K.homePlanet.id);
  const catalog = new ActionCatalog({ colonyManager: core.colonyManager, techSystem: core.techSystem, resourceSystem: core.resourceSystem, buildingSystem: core.buildingSystem, vesselManager: core.vesselManager, civSystem: core.civSystem, starSystemManager: core.starSystemManager });
  const bot = new RuleBot();
  const gy = () => K.timeSystem.gameTime;

  const tel = new PopTelemetry();
  const ctx = { home, colonyManager: core.colonyManager, vesselManager: core.vesselManager };
  tel.sample(0, ctx);          // baseline t=0
  let lastGy = 0;

  // Bot: 4 akcje na civYear (identyczny budżet co gate2-report — ta sama krzywa).
  const ticker = new Ticker(core.timeSystem);
  ticker.onCivYear(() => {
    for (let d = 0; d < 4; d++) {
      let a; try { a = bot.decideAction({ homeAlive: true }, catalog); } catch { continue; }
      if (a) { try { ActionAdapter.execute(a); } catch {} }
    }
  });
  // Próbkuj POP raz na pełny GAME-YEAR (12 civYear ticków = 1 gy).
  ticker.onTick(() => {
    const g = Math.floor(gy());
    if (g > lastGy) { lastGy = g; tel.sample(g, ctx); }
  });
  ticker.run(TARGET_GY * 12, { tickSize: 1.0 });

  return { seed, series: tel.getSeries(), crashed: ticker._crashed };
}

// ── Podsumowanie per seed (lata z gy≥1) ──────────────────────────
function summarize(series) {
  const rows = series.filter(r => r.gy >= 1);
  const byClass = { tight: 0, bound: 0, buffer: 0, wasted: 0 };
  let surplusYears = 0, bufferYears = 0, wastedYears = 0, boundYears = 0;
  for (const r of rows) {
    byClass[r.class] = (byClass[r.class] ?? 0) + 1;
    if (r.unemployed > POP_TELEMETRY_DEFAULTS.SURPLUS_EPS) {
      surplusYears++;
      if (r.class === 'buffer') bufferYears++;
      else if (r.class === 'wasted') wastedYears++;
      else if (r.class === 'bound') boundYears++;
    }
  }
  const last = rows[rows.length - 1] ?? {};
  return {
    years: rows.length, byClass,
    surplusYears, bufferYears, wastedYears, boundYears,
    bufferShare: surplusYears ? bufferYears / surplusYears : 0,
    wastedShare: surplusYears ? wastedYears / surplusYears : 0,
    finalPop: last.pop ?? 0, finalUnemployed: last.unemployed ?? 0,
    finalBuildOutFrac: last.buildOutFrac ?? 0,
    finalFullColonies: last.fullColonies ?? 0, finalOutposts: last.outposts ?? 0,
  };
}

// ── Werdykt panelowy → jeden z 3 wyników brief'u ─────────────────
function panelVerdict(panel) {
  const { totalYears, surplusYears, bufferYears, wastedYears } = panel;
  const surplusRate = totalYears ? surplusYears / totalYears : 0;
  const wastedShare = surplusYears ? wastedYears / surplusYears : 0;
  const bufferShare = surplusYears ? bufferYears / surplusYears : 0;
  if (surplusRate < 0.25)
    return { outcome: 3, label: 'GLUT GONE — nadwyżki prawie nie ma (POP wiąże)', drop1: true };
  if (wastedShare >= 0.5)
    return { outcome: 2, label: 'REAL WASTED GLUT — nadwyżka bez ujścia (bot gra inaczej)', drop1: false };
  if (bufferShare >= 0.5)
    return { outcome: 1, label: 'BUFFER — nadwyżka ma ujście (finding #1 = false alarm, drop)', drop1: true };
  return { outcome: 0, label: 'MIXED — brak dominującej klasy (raportuj rozkład)', drop1: false };
}

// ── Run panel ─────────────────────────────────────────────────────
console.log(`\n═══ BALANS Phase 2 — POP telemetry — class=${PLANET_CLASS}, seeds=${N_SEEDS}, target=${TARGET_GY}gy ═══`);
console.log(`    (class=REAL ⇒ realny generator, bez injekcji złóż — panel Phase 1)\n`);

const seeds = [];
const agg = { totalYears: 0, surplusYears: 0, bufferYears: 0, wastedYears: 0, boundYears: 0 };
for (let i = 1; i <= N_SEEDS; i++) {
  const r = runOne(`${SEED_PREFIX}_${i}`);
  const summary = summarize(r.series);
  seeds.push({ seed: r.seed, crashed: r.crashed, series: r.series, summary });
  agg.totalYears  += summary.years;
  agg.surplusYears += summary.surplusYears;
  agg.bufferYears += summary.bufferYears;
  agg.wastedYears += summary.wastedYears;
  agg.boundYears  += summary.boundYears;
}
const verdict = panelVerdict(agg);

// ── Tabela per seed ───────────────────────────────────────────────
const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
console.log('seed        | pop | unemp | bldOut | col/out | surpY | buffer | wasted | bound | seed-verdict');
console.log('------------+-----+-------+--------+---------+-------+--------+--------+-------+-------------');
for (const s of seeds) {
  const m = s.summary;
  const sv = m.surplusYears === 0 ? 'no-surplus'
    : m.wastedShare >= 0.5 ? 'WASTED'
    : m.bufferShare >= 0.5 ? 'buffer'
    : 'mixed';
  console.log(
    `${String(s.seed).padEnd(11)} | ${String(m.finalPop).padStart(3)} | ${String(m.finalUnemployed).padStart(5)} | ` +
    `${pct(m.finalBuildOutFrac)}   | ${String(m.finalFullColonies + '/' + m.finalOutposts).padStart(7)} | ` +
    `${String(m.surplusYears).padStart(5)} | ${String(m.bufferYears).padStart(6)} | ${String(m.wastedYears).padStart(6)} | ` +
    `${String(m.boundYears).padStart(5)} | ${sv}${s.crashed ? ' (CRASH)' : ''}`);
}

// ── Werdykt panelowy ──────────────────────────────────────────────
const surplusRate = agg.totalYears ? agg.surplusYears / agg.totalYears : 0;
const bufferShare = agg.surplusYears ? agg.bufferYears / agg.surplusYears : 0;
const wastedShare = agg.surplusYears ? agg.wastedYears / agg.surplusYears : 0;
console.log(`\n── PANEL (${agg.totalYears} seed-lat, gy≥1) ──`);
console.log(`  lata z nadwyżką (unemp>0.5):   ${agg.surplusYears}/${agg.totalYears}  (${pct(surplusRate).trim()})`);
console.log(`  z tego BUFFER (ma ujście):     ${agg.bufferYears}  (${pct(bufferShare).trim()} nadwyżkowych lat)`);
console.log(`  z tego WASTED (bez ujścia):    ${agg.wastedYears}  (${pct(wastedShare).trim()} nadwyżkowych lat)`);
console.log(`  z tego BOUND (etaty wolne):    ${agg.boundYears}`);
console.log(`\n  ► WERDYKT (outcome ${verdict.outcome}): ${verdict.label}`);
console.log('    (outcome 1=metryka mierzyła zły sygnał · 2=realny glut · 3=glut zniknął · 0=mieszane)');

// ── Zapis JSON ────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  meta: {
    tool: 'BALANS 1.0 Phase 2 — POP telemetry (POP vertical slice)',
    planetClass: PLANET_CLASS, seeds: N_SEEDS, targetGy: TARGET_GY, seedPrefix: SEED_PREFIX,
    thresholds: { ...POP_TELEMETRY_DEFAULTS },
    unit: 'game-years (1 gy = 12 civ-yr)',
    classifier: 'outlet-based (OR): surplus with builtOut OR expansion = buffer; neither = wasted',
    note: 'read-only instrument — zero balance constants changed; bot decision policy untouched',
  },
  seeds: seeds.map(s => ({ seed: s.seed, crashed: s.crashed, summary: s.summary, series: s.series })),
  panel: { ...agg, surplusRate, bufferShare, wastedShare, verdict },
};
const jsonPath = join(OUT_DIR, `pop-telemetry-${PLANET_CLASS}.json`);
writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
console.log(`\n  JSON: ${jsonPath}`);
console.log(`  crashes: ${seeds.filter(s => s.crashed).length}/${seeds.length}\n`);
