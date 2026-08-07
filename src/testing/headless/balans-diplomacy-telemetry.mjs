// ═══════════════════════════════════════════════════════════════
// WOJNA I POKÓJ 1.0 — D2/E7 — DIPLOMACY telemetry runner
// Uruchom: node src/testing/headless/balans-diplomacy-telemetry.mjs [--class=REAL] [--seeds=8] [--gy=45]
// ───────────────────────────────────────────────────────────────
// Ten slice NIE waliduje stałej i NICZEGO nie naprawia — dostarcza PRZYRZĄD, którym
// E2 przelicza dawne progi traktatów (60/75/80) na wagi Acceptance Engine. Dlatego
// E7 wchodzi PRZED E2: strojenie wag bez macierzy to strojenie na wyczucie.
//
// Pytania slice'u:
//   • czy wagi w ogóle RÓŻNICUJĄ — czy któryś czasownik odpowiada tak samo przy każdym
//     archetypie i agendzie (wtedy jego wagi są stałą przebraną za gałkę)?
//   • gdzie leży granica decyzji dla każdej pary archetyp × agenda (minimalna opinia)?
//   • ile decyzji ląduje „na styk" (wynik zdominowany przez szum vs próg martwy)?
//   • czy ROZGRYWKA dociera w okolice tych granic — czy stroimy w próżni?
//   • które termy są bezczynne i CZY ICH ZMIERZONY WKŁAD to potwierdza (Decyzja 2 fazy)?
//
// Przebieg: TEN SAM wspólny `balans-driver.mjs` co POP/ZASOBY/ROI/CENY/AI, z JEDNĄ
// zmienioną zmienną względem panelu referencyjnego: `aiEmpires: true` (bez imperiów nie
// ma żadnych relacji do obserwowania). Zdarzenia losowe zostają WYŁĄCZONE.
// Wszystko w GAME-YEARS.
//
// ⚠ Macierz NIE zależy od przebiegu — jest czysta i deterministyczna (silnik odpytany
// na siatce). Seedy dokładają WYŁĄCZNIE obserwację: jakie opinie i napięcia gra
// naprawdę wytwarza. Te dwie rzeczy celowo nie są zmieszane.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runSeedPanel, CIV_PER_GY } from './balans-driver.mjs';
import {
  DiplomacyTelemetry, DIPLO_TELEMETRY_DEFAULTS, DIPLO_HEALTH,
  buildAcceptanceMatrix, probeTermImpact, termCatalogRows,
  summarizeSeed, aggregatePanel, verdict,
} from './DiplomacyTelemetry.js';
import { renderDiplomacyReport } from '../report/DiplomacyReport.js';

function arg(name, def) {
  const a = process.argv.find(s => s.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}
const PLANET_CLASS = arg('class', 'REAL');
const N_SEEDS      = parseInt(arg('seeds', '8'));
const TARGET_GY    = parseFloat(arg('gy', '45'));
const SEED_PREFIX  = arg('seed', 'balans-diplo');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'reports', 'balans');

const fmt = (n, d = 1) => (n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toString());
const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const shortSeed = (s) => String(s).replace(new RegExp(`^${SEED_PREFIX}_`), 'seed_');
const pad = (s, n) => String(s).padEnd(n);

console.log(`\n═══ WOJNA I POKÓJ D2/E7 — MACIERZE AKCEPTACJI — class=${PLANET_CLASS}, seeds=${N_SEEDS}, target=${TARGET_GY}gy ═══`);
console.log(`    driver: ten sam co POP/ZASOBY/ROI/CENY/AI + aiEmpires=true (zdarzenia losowe OFF)`);
console.log(`    macierz jest CZYSTA (nie zależy od seedów) — seedy dokładają obserwację przebiegu\n`);

// ── 1. MACIERZ (czysta — liczona raz, niezależnie od przebiegu) ──
const matrix = buildAcceptanceMatrix();
const probe  = probeTermImpact();
const terms  = termCatalogRows(probe);

console.log('  ── 1. MACIERZ AKCEPTACJI — minimalna opinia przechodząca (── = pre-warunek blokuje) ──');
{
  const verbs = matrix.verbs;
  console.log(`     ${pad('archetyp/agenda', 30)}${verbs.map(v => pad(v, 19)).join('')}`);
  for (const a of matrix.archetypes) {
    for (const o of matrix.objectives) {
      const row = verbs.map(v => {
        const c = matrix.cells.find(x => x.archetype === a && x.objective === o && x.verb === v);
        if (!c) return pad('—', 19);
        if (c.blocked) return pad('──', 19);
        return pad(c.minOpinion == null ? 'nigdy' : `≥${c.minOpinion} (${pct(c.acceptPct)})`, 19);
      }).join('');
      console.log(`     ${pad(`${a} / ${o}`, 30)}${row}`);
    }
  }
  if (matrix.degenerate.length) {
    console.log(`\n     ⚠ BEZ ZRÓŻNICOWANIA: ${matrix.degenerate.map(d => `${d.verb} (${d.kind})`).join(', ')}`);
  } else {
    console.log('\n     ✓ każdy czasownik różnicuje po archetypie/agendzie');
  }
  console.log(`     decyzje „na styk" (±${DIPLO_TELEMETRY_DEFAULTS.NEAR_THRESHOLD_PTS} pkt): ` +
    `${matrix.nearThreshold.near}/${matrix.nearThreshold.total} = ${pct(matrix.nearThreshold.pct)}`);
}

// ── 2. KOTWICE PARYTETU (cel E2) ─────────────────────────────────
console.log('\n  ── 2. KOTWICE PARYTETU — roster gry vs dawne progi 60/75/80 ──');
{
  const EXPECT = { trade_agreement: 10, non_aggression: 25, alliance: 30 };
  for (const archetype of ['industrialist', 'expansionist']) {
    for (const [verb, want] of Object.entries(EXPECT)) {
      // Agenda nie może zmieniać parytetu, dopóki OBJECTIVE_WEIGHT_OVERRIDES jest puste (E5).
      const got = [...new Set(matrix.cells
        .filter(c => c.archetype === archetype && c.verb === verb)
        .map(c => c.minOpinion))];
      const okAll = got.length === 1 && got[0] === want;
      console.log(`     ${okAll ? '✓' : '✗'} ${pad(archetype, 15)}${pad(verb, 18)}` +
        `granica ${got.join('/')} (dawny próg ⇒ ${want})`);
    }
  }
}

// ── 3. TERMY — status deklarowany vs zmierzony wkład ─────────────
console.log('\n  ── 3. TERMY — uczciwość oznaczeń (Decyzja 2: bezczynne MUSZĄ być widoczne) ──');
console.log('     sonda podaje KAŻDEMU termowi skrajne wejście: 0 = nie da się go ruszyć niczym');
for (const t of terms) {
  const mark = t.inertUnexpected ? '⚠ NIESPÓJNY (deklarowany jako działający)'
    : t.cannotMove ? '← NIE DA SIĘ RUSZYĆ (stub / pusty katalog)'
    : t.worksButUnfed ? '← liczy poprawnie, ale w GRZE nikt go nie zasila'
    : '';
  console.log(`     ${pad(t.id, 18)}${pad(t.status, 10)}sonda |wkład| max = ${pad(fmt(t.probeMaxAbs), 8)}${mark}`);
}

// ── 4. Przebiegi — obserwacja żywych relacji ─────────────────────
const seeds = runSeedPanel({
  seeds: N_SEEDS, seedPrefix: SEED_PREFIX, planetClass: PLANET_CLASS, targetGy: TARGET_GY,
  makeTelemetry: () => new DiplomacyTelemetry(),
  opts: { aiEmpires: true },
});
for (const s of seeds) s.summary = summarizeSeed(s.series);
const agg = aggregatePanel(seeds.map(s => s.summary));
const v   = verdict(matrix, agg);

console.log('\n  ── 4. OBSERWACJA PRZEBIEGU — czy gra dociera w okolice progów ──');
console.log(`     ${pad('seed', 12)}${pad('imperiów', 10)}${pad('opinia min', 12)}${pad('mediana', 10)}${pad('max', 8)}${pad('napięcie max', 14)}${pad('lat wojny', 11)}traktat?`);
for (const s of seeds) {
  const m = s.summary;
  console.log(`     ${pad(shortSeed(s.seed), 12)}${pad(m.empiresObserved, 10)}${pad(fmt(m.opinionMin), 12)}` +
    `${pad(fmt(m.opinionMed), 10)}${pad(fmt(m.opinionMax), 8)}${pad(fmt(m.tensionMax), 14)}` +
    `${pad(m.warYears, 11)}${m.anyTreaty ? 'tak' : 'nie'}`);
}
console.log(`     mediana zasięgu opinii: ${fmt(agg.medOpinionMin)} … ${fmt(agg.medOpinionMax)} ` +
  `(próg umowy handlowej = ${DIPLO_HEALTH.OPINION_REACH_MIN})`);
if (!agg.wiredEverywhere) console.log('     ⚠ w części seedów brakowało DiplomacySystem/EmpireRegistry — te wiersze nic nie mierzą');

// ── 5. Werdykt ───────────────────────────────────────────────────
console.log(`\n  ► WERDYKT (outcome ${v.outcome}): ${v.label}`);
console.log(`  crashes: ${seeds.filter(s => s.crashed).length}/${seeds.length}` +
  `  · knoby pomiaru: ${JSON.stringify(DIPLO_TELEMETRY_DEFAULTS)}  · 1 gy = ${CIV_PER_GY} civ-lat`);

// ── 6. Zapis JSON + HTML (kontrakt launchera: `<prefix>-<CLASS>.html`) ──
mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  meta: {
    tool: 'WOJNA I POKÓJ 1.0 — D2/E7 diplomacy acceptance telemetry (przyrząd strojenia wag, nie mechanika)',
    planetClass: PLANET_CLASS, seeds: N_SEEDS, targetGy: TARGET_GY, seedPrefix: SEED_PREFIX,
    civPerGy: CIV_PER_GY,
    knobs: { ...DIPLO_TELEMETRY_DEFAULTS },
    unit: 'game-years (1 gy = 12 civ-yr)',
    run: 'wspólny balans-driver + aiEmpires=true (imperia AI żyją); zdarzenia losowe WYŁĄCZONE',
    scope: 'Acceptance Engine (D2/E1) odpytany na siatce archetyp × agenda × czasownik × opinia + obserwacja relacji w przebiegu',
    note: 'read-only instrument — zero stałych balansu, zero zmian w dyplomacji; silnik NIE jest jeszcze wpięty w rozgrywkę (retrofit = E2/E3)',
  },
  thresholds: { ...DIPLO_HEALTH },
  matrix: { ...matrix, nearPts: DIPLO_TELEMETRY_DEFAULTS.NEAR_THRESHOLD_PTS },
  terms, probe,
  seeds: seeds.map(s => ({ seed: s.seed, crashed: s.crashed, summary: s.summary, series: s.series })),
  panel: { ...agg, verdict: v },
};
const jsonPath = join(OUT_DIR, `diplomacy-telemetry-${PLANET_CLASS}.json`);
writeFileSync(jsonPath, JSON.stringify(payload));

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>WOJNA I POKÓJ D2/E7 — MACIERZE AKCEPTACJI (${PLANET_CLASS})</title>` +
  `<style>html,body{margin:0}</style></head><body>${renderDiplomacyReport(payload)}</body></html>`;
const htmlPath = join(OUT_DIR, `diplomacy-report-${PLANET_CLASS}.html`);
writeFileSync(htmlPath, html);

console.log(`\n  JSON:   ${jsonPath}`);
console.log(`  RAPORT: ${htmlPath}\n`);
