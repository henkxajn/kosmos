// BALANS 1.0 — Phase 2 — PopReport keeper (chroni renderer HTML raportu).
// Czysta funkcja renderPopReport(payload) → samodzielny HTML. Chroni:
// self-contained (zero http/script/src), sekcje (werdykt/metodologia/legenda/
// tabela/karty), teksturę „wasted", eskejp, mapowanie outcome→klasa, edge-case'y.
//
//   T1  self-contained + sekcje + karty per seed
//   T2  metodologia mówi wprost że zabudowa inertna → 2 nogi (wymóg Filipa)
//   T3  status kolory + tekstura wasted (nigdy sam kolor: legenda+ikona+hatch)
//   T4  outcome → klasa werdyktu (1=buffer 2=wasted 3=tight)
//   T5  eskejp HTML + edge-case'y (pusty payload, seed no-surplus, crash)

import { renderPopReport } from '../report/PopReport.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Fixture: payload w kształcie balans-pop-telemetry.mjs (meta / seeds[] / panel).
const mkSeed = (seed, over = {}) => ({
  seed, crashed: false,
  summary: { years: 3, surplusYears: 3, bufferYears: 3, wastedYears: 0, boundYears: 0,
    bufferShare: 1, wastedShare: 0, finalPop: 40, finalUnemployed: 8, finalBuildOutFrac: 0.18,
    finalFullColonies: 2, finalOutposts: 1, ...over.summary },
  series: over.series ?? [
    { gy: 0, pop: 16, employed: 16, unemployed: 0, class: 'tight', buildOutFrac: 0.03, homeAbsorbing: false, expansionActive: false, buildableTiles: 256 },
    { gy: 1, pop: 20, employed: 17, unemployed: 3, class: 'buffer', buildOutFrac: 0.05, homeAbsorbing: true, expansionActive: false, buildableTiles: 256 },
    { gy: 2, pop: 40, employed: 32, unemployed: 8, class: 'buffer', buildOutFrac: 0.18, homeAbsorbing: false, expansionActive: true, buildableTiles: 256 },
  ],
  ...over,
});
const fixture = {
  meta: { tool: 'BALANS test', planetClass: 'REAL', seeds: 2, targetGy: 45,
    thresholds: { BUILT_OUT_FRAC: 0.8, UNFILLED_EPS: 0.5, SURPLUS_EPS: 0.5 },
    unit: 'game-years', classifier: 'outlet-based (OR)', note: 'read-only' },
  seeds: [mkSeed('balans-gate1_1'), mkSeed('balans-gate1_7', {
    crashed: false,
    summary: { surplusYears: 3, bufferYears: 0, wastedYears: 3, boundYears: 0, bufferShare: 0, wastedShare: 1,
      finalPop: 31, finalUnemployed: 8, finalBuildOutFrac: 0.16, finalFullColonies: 1, finalOutposts: 0 },
    series: [
      { gy: 0, pop: 16, employed: 16, unemployed: 0, class: 'tight', buildOutFrac: 0.03, homeAbsorbing: false, expansionActive: false, buildableTiles: 256 },
      { gy: 1, pop: 24, employed: 16, unemployed: 8, class: 'wasted', buildOutFrac: 0.16, homeAbsorbing: false, expansionActive: false, buildableTiles: 256 },
      { gy: 2, pop: 31, employed: 23, unemployed: 8, class: 'wasted', buildOutFrac: 0.16, homeAbsorbing: false, expansionActive: false, buildableTiles: 256 },
    ],
  })],
  panel: { totalYears: 6, surplusYears: 6, bufferYears: 3, wastedYears: 3, boundYears: 0,
    surplusRate: 1, bufferShare: 0.5, wastedShare: 0.5,
    verdict: { outcome: 1, label: 'BUFFER — nadwyżka ma ujście', drop1: true } },
};

// ── T1: self-contained + sekcje + karty ───────────────────────────
console.log('T1 — self-contained HTML + sekcje + karty per seed');
{
  const html = renderPopReport(fixture);
  assert(typeof html === 'string' && html.length > 500, 'zwraca niepusty HTML string');
  assert(!/https?:\/\//.test(html), 'zero URL http/https (self-contained)');
  assert(!/<script/i.test(html) && !/\ssrc=/.test(html), 'zero <script> i src= (self-contained)');
  assert(html.includes('BUFFER — nadwyżka ma ujście'), 'zawiera etykietę werdyktu');
  assert(/rp-verdict/.test(html) && /rp-legend/.test(html) && /rp-table/.test(html), 'sekcje: verdict + legend + table');
  const cards = (html.match(/rp-card rp-edge/g) ?? []).length;
  assert(cards === 2, `karty per seed = 2 (było ${cards})`);
  assert(html.includes('table view') || html.includes('Tabela'), 'obecny table view (tabela liczbowa)');
}

// ── T2: metodologia — zabudowa inertna, 2 nogi (wymóg Filipa) ─────
console.log('\nT2 — metodologia mówi wprost: zabudowa inertna → 2 nogi');
{
  const html = renderPopReport(fixture);
  assert(/INERTNA/.test(html), 'metodologia: „zabudowa INERTNA"');
  assert(/DW[ÓO]CH nogach/.test(html), 'metodologia: „stoi na DWÓCH nogach" (ekspansja+absorpcja)');
  assert(html.includes('256'), 'metodologia podaje realny rozmiar mapy (~256 kafli)');
}

// ── T3: status kolory + tekstura wasted ───────────────────────────
console.log('\nT3 — status kolory + tekstura wasted (nigdy sam kolor)');
{
  const html = renderPopReport(fixture);
  assert(html.includes('#0ca30c'), 'buffer = good #0ca30c'); // green
  assert(html.includes('#d03b3b'), 'wasted = critical #d03b3b'); // red
  assert(html.includes('id="hatchWasted"'), 'zdefiniowana tekstura hatchWasted');
  assert(html.includes('url(#hatchWasted)'), 'wasted wypełniany teksturą (CVD/greyscale robustness)');
  // legenda niesie ikonę+etykietę (nie sam kolor)
  assert(/Buffer \(zdrowa rezerwa\)/.test(html) && /Wasted \(realny glut\)/.test(html), 'legenda: etykiety klas (nie sam kolor)');
}

// ── T4: outcome → klasa werdyktu ──────────────────────────────────
console.log('\nT4 — outcome → klasa werdyktu (1=buffer 2=wasted 3=tight)');
{
  const h1 = renderPopReport({ ...fixture, panel: { ...fixture.panel, verdict: { outcome: 1, label: 'x' } } });
  assert(/rp-verdict rp-buffer/.test(h1), 'outcome 1 → banner rp-buffer');
  const h2 = renderPopReport({ ...fixture, panel: { ...fixture.panel, verdict: { outcome: 2, label: 'x' } } });
  assert(/rp-verdict rp-wasted/.test(h2), 'outcome 2 → banner rp-wasted');
  const h3 = renderPopReport({ ...fixture, panel: { ...fixture.panel, verdict: { outcome: 3, label: 'x' } } });
  assert(/rp-verdict rp-tight/.test(h3), 'outcome 3 → banner rp-tight');
}

// ── T5: eskejp + edge-case'y ──────────────────────────────────────
console.log('\nT5 — eskejp HTML + edge-case (pusty, no-surplus, crash)');
{
  // eskejp: nazwa seeda z HTML → zeskejpowana (brak surowego <img)
  const evil = { ...fixture, seeds: [mkSeed('<img src=x onerror=1>')] };
  const he = renderPopReport(evil);
  assert(!he.includes('<img src=x'), 'nazwa seeda z HTML zeskejpowana (brak wstrzyknięcia)');
  assert(he.includes('&lt;img'), 'znaki < > zamienione na encje');
  // pusty payload nie wywala
  let threw = false; let empty = '';
  try { empty = renderPopReport({}); } catch { threw = true; }
  assert(!threw && typeof empty === 'string', 'pusty payload {} → nie rzuca, zwraca string');
  // crash badge
  const crashed = { ...fixture, seeds: [mkSeed('balans-gate1_1', { crashed: true })] };
  assert(/crash/.test(renderPopReport(crashed)), 'crashed seed → badge crash w karcie');
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
