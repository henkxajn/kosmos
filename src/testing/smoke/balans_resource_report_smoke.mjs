// BALANS 1.0 — Phase 2 — ResourceReport keeper (chroni renderer HTML raportu zasobów).
// Czysta funkcja renderResourceReport(payload) → samodzielny HTML. Chroni:
// self-contained (zero http/script/src), komplet sekcji, UCZCIWOŚĆ (skrzynka granic
// pomiaru + wyeksponowana WADA POMIARU), teksturę „binding", eskejp, mapowanie
// outcome→klasa werdyktu, wierność danym i edge-case'y.
//
//   T1  self-contained + sekcje + karty per seed
//   T2  skrzynka uczciwości: granice pomiaru + wada „konsumpcja POP = 0" (i jej BRAK)
//   T3  status kolory + tekstura binding (nigdy sam kolor: legenda + ikona + hatch)
//   T4  outcome → klasa werdyktu (0=ok 1=binding 2=tight)
//   T5  wierność danym: tabela, top blokery (z TOWARAMI), mapa stanów pomija inert
//   T6  eskejp HTML + edge-case'y (pusty payload, brak wiązań, crash)
//
// Uruchom: node src/testing/smoke/balans_resource_report_smoke.mjs

import { renderResourceReport } from '../report/ResourceReport.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Fixture w kształcie payloadu z balans-resource-telemetry.mjs ──
const IDS = ['Fe', 'Ti', 'food', 'energy', 'research', 'Nt'];
const mkRes = (over = {}) => {
  const base = {};
  for (const id of IDS) {
    base[id] = { kind: id === 'energy' ? 'flow' : id === 'research' ? 'accumulator' : id === 'food' ? 'harvested' : 'mined',
      stock: 500, prod: 120, cons: 40, delta: 5, unaccOut: 75, netReg: 80, cover: 6,
      blockedBuilds: 0, pendingShort: 0, state: 'ok' };
  }
  base.Nt = { ...base.Nt, stock: 0, prod: 0, cons: 0, delta: 0, unaccOut: 0, cover: null, state: 'inert' };
  for (const [id, o] of Object.entries(over)) base[id] = { ...base[id], ...o };
  return base;
};
const mkRow = (gy, over = {}) => ({
  gy, res: mkRes(over.res ?? {}), commodityStock: { structural_alloys: 2 },
  blockedBuilds: over.blockedBuilds ?? { structural_alloys: 12, Fe: 3 },
  pendingByRes: {}, blockedCount: 15, affordableCount: over.affordableCount ?? 4,
  pendingQueue: 0, stalled: over.stalled ?? false, topBlocker: 'structural_alloys', topBlockerCount: 12,
  binding: over.binding ?? [], energyBalance: 12, energyAvail: 1, brownout: false,
  pop: 40, colonies: 2, popConsumptionZeroed: over.popConsumptionZeroed ?? false, activeIsHome: true,
});
const mkSummary = (over = {}) => {
  const byRes = {};
  for (const id of IDS) byRes[id] = { binding: 0, tight: 0, ok: 3, glut: 0, inert: 0, firstBindGy: null,
    blockedYears: 0, finalStock: 500, finalState: 'ok', finalCover: 6, meanProd: 120, meanCons: 40 };
  byRes.Nt = { ...byRes.Nt, ok: 0, inert: 3, finalState: 'inert', meanProd: 0, meanCons: 0 };
  return { years: 3, finalGy: 3, stalledYears: 0, firstStallGy: null, popConsZeroedFromGy: null,
    finalColonies: 2, finalPop: 40, finalBrownout: false, finalEnergyAvail: 1,
    byRes, topBlockerYears: { structural_alloys: 3 }, blockerYears: { structural_alloys: 3, Fe: 2 }, ...over };
};
const mkSeed = (seed, over = {}) => ({
  seed, crashed: over.crashed ?? false,
  summary: over.summary ?? mkSummary(),
  series: over.series ?? [mkRow(0), mkRow(1), mkRow(2), mkRow(3)],
});
const mkPanel = (over = {}) => ({
  seeds: 2, totalYears: 6, stalledYears: 0, seedsStalled: 0, seedsPopConsZeroed: 0,
  byRes: Object.fromEntries(IDS.map(id => [id, {
    bindingYears: id === 'Fe' ? 4 : 0, tightYears: id === 'Ti' ? 5 : 0, glutYears: 0,
    inertYears: id === 'Nt' ? 6 : 0, okYears: 6, blockedYears: 2,
    seedsBinding: id === 'Fe' ? 2 : 0, seedsGlutFinal: 0, seedsInertFinal: id === 'Nt' ? 2 : 0,
    earliestBindGy: id === 'Fe' ? 2 : null, meanProd: 120, meanCons: id === 'Nt' ? 0 : 40, keepsUp: true,
  }])),
  topBlockers: { structural_alloys: 6, electronic_systems: 2, Fe: 1 },
  verdict: { outcome: 1, label: 'BOUND BY Fe — jeden zasób wiąże gospodarkę', binder: 'Fe', share: 0.8, bindingYears: 5 },
  ...over,
});
const fixture = {
  meta: { tool: 'BALANS test', planetClass: 'REAL', seeds: 2, targetGy: 45, seedPrefix: 'balans-gate1',
    thresholds: { TIGHT_COVER_GY: 1, GLUT_COVER_GY: 20, STOCK_EPS: 1, FLOW_EPS: 0.01,
      ENERGY_TIGHT_FRAC: 0.05, ENERGY_GLUT_FRAC: 0.5 },
    unit: 'game-years', resourceIds: IDS, states: ['binding', 'tight', 'ok', 'glut', 'inert'],
    classifier: 'binding = gospodarka stoi I zasób blokuje', scope: 'kolonia macierzysta', note: 'read-only' },
  seeds: [mkSeed('balans-gate1_1'), mkSeed('balans-gate1_7', {
    summary: mkSummary({ stalledYears: 3, firstStallGy: 1, popConsZeroedFromGy: null }),
    series: [mkRow(0), mkRow(1, { stalled: true, affordableCount: 0, binding: ['Fe'], res: { Fe: { state: 'binding', stock: 4, blockedBuilds: 9 } } }),
      mkRow(2, { stalled: true, affordableCount: 0, binding: ['Fe'], res: { Fe: { state: 'binding', stock: 3, blockedBuilds: 9 } } }),
      mkRow(3, { stalled: true, affordableCount: 0, binding: ['Fe', 'Ti'], res: { Fe: { state: 'binding' }, Ti: { state: 'tight' } } })],
  })],
  panel: mkPanel(),
};

// ── T1: self-contained + sekcje ───────────────────────────────────
console.log('T1 — self-contained HTML + komplet sekcji + karty per seed');
{
  const html = renderResourceReport(fixture);
  assert(typeof html === 'string' && html.length > 2000, 'zwraca niepusty HTML string');
  assert(!/https?:\/\//.test(html), 'zero URL http/https (self-contained)');
  assert(!/<script/i.test(html) && !/\ssrc=/.test(html), 'zero <script> i src= (self-contained)');
  assert(/rr-verdict/.test(html) && /rr-method/.test(html) && /rr-legend/.test(html) && /rr-table/.test(html),
    'sekcje: werdykt + metodologia + legenda + tabela');
  assert(/rr-grid/.test(html) && /rr-flows/.test(html), 'sekcje: mapa stanów per seed + przepływy per zasób');
  assert(html.includes('BOUND BY Fe'), 'etykieta werdyktu z payloadu');
  const cards = (html.match(/rr-card rr-edge/g) ?? []).length;
  assert(cards === 2, `karty per seed = 2 (było ${cards})`);
  assert(/game-year/.test(html) && /1 gy = 12 civ-yr/.test(html), 'jednostka nazwana wprost: game-years (HARD #3)');
  assert(html.includes('seed_1') && html.includes('seed_7') && !html.includes('balans-gate1_1'),
    'nazwy seedów skrócone wg seedPrefix z meta');
}

// ── T2: uczciwość — granice pomiaru + wada pomiaru ────────────────
console.log('\nT2 — skrzynka uczciwości: granice pomiaru + WADA POMIARU (obecna i nieobecna)');
{
  const clean = renderResourceReport(fixture);
  assert(/reszta/i.test(clean) && /nameplate/i.test(clean),
    'metodologia nazywa „resztę bilansu" i lukę nameplate-vs-realna produkcja');
  assert(/polarn/i.test(clean), 'metodologia przyznaje przybliżenie modyfikatora polarnego kafla');
  assert(/macierzyst/i.test(clean), 'metodologia podaje zakres: kolonia macierzysta');
  assert(/COMMODITIES|[Tt]owary/.test(clean), 'metodologia tłumaczy, czemu towary są tylko blokerami');
  // ⚠ szukamy BLOKU (class="rr-defect"), nie samej reguły CSS — ta jest w stylu zawsze
  assert(!/class="rr-defect"/.test(clean), 'brak seedów z wadą → blok wady NIE jest pokazywany (bez straszenia na pusto)');

  const defective = {
    ...fixture,
    seeds: [mkSeed('balans-gate1_1', { summary: mkSummary({ popConsZeroedFromGy: 29 }) }), fixture.seeds[1]],
    panel: mkPanel({ seedsPopConsZeroed: 1 }),
  };
  const d = renderResourceReport(defective);
  assert(/class="rr-defect"/.test(d), 'seed z wadą → blok wady pomiaru wyrenderowany');
  assert(/civilization_consumption/.test(d), 'wada nazwana po nazwie producenta w grze');
  assert(/gy29/.test(d), 'podany ROK (w game-latach), od którego pomiar jest niewiarygodny');
  assert(/1\/2/.test(d), 'podany zasięg: ile seedów dotkniętych');
  assert(/BALANS_PHASE2_RESOURCES/.test(d), 'wskazany dokument z mechanizmem i decyzją „nie naprawiamy"');
  assert(/Fe\/Si\/Cu|nietkni/.test(d), 'powiedziane wprost, które zasoby POZOSTAJĄ wiarygodne');
}

// ── T3: kolory statusów + tekstura ────────────────────────────────
console.log('\nT3 — status kolory + tekstura binding (nigdy sam kolor)');
{
  const html = renderResourceReport(fixture);
  assert(html.includes('#d03b3b'), 'binding = critical #d03b3b');
  assert(html.includes('#fab219'), 'tight = warning #fab219');
  assert(html.includes('#0ca30c'), 'ok = good #0ca30c');
  assert(html.includes('#2a78d6'), 'glut = info #2a78d6');
  assert(html.includes('id="hatchBinding"') && html.includes('url(#hatchBinding)'),
    'binding wypełniany TEKSTURĄ (CVD/greyscale robustness)');
  assert(/Binding \(wiąże gospodarkę\)/.test(html) && /Glut \(nadmiar bez ujścia\)/.test(html),
    'legenda: pełne etykiety stanów (nie sam kolor)');
  assert(/✕/.test(html) && /≡/.test(html), 'legenda: ikony per stan');
}

// ── T4: outcome → klasa werdyktu ──────────────────────────────────
console.log('\nT4 — outcome → klasa werdyktu');
{
  const h0 = renderResourceReport({ ...fixture, panel: mkPanel({ verdict: { outcome: 0, label: 'x' } }) });
  assert(/rr-verdict rr-b-ok/.test(h0), 'outcome 0 (nic nie wiąże) → banner rr-b-ok');
  const h1 = renderResourceReport({ ...fixture, panel: mkPanel({ verdict: { outcome: 1, label: 'x', binder: 'Fe', share: 1 } }) });
  assert(/rr-verdict rr-b-binding/.test(h1), 'outcome 1 (dominant) → banner rr-b-binding');
  const h2 = renderResourceReport({ ...fixture, panel: mkPanel({ verdict: { outcome: 2, label: 'x', binder: 'Ti', share: 0.4 } }) });
  assert(/rr-verdict rr-b-tight/.test(h2), 'outcome 2 (mieszane) → banner rr-b-tight');
}

// ── T5: wierność danym ────────────────────────────────────────────
console.log('\nT5 — wierność danym (tabela / blokery / mapa stanów)');
{
  const html = renderResourceReport(fixture);
  // tabela: wiersz per zasób z listy meta
  for (const id of IDS) assert(new RegExp(`<td><b>${id}</b></td>`).test(html), `tabela ma wiersz zasobu ${id}`);
  assert(/structural_alloys/.test(html), 'top blokery zawierają TOWAR (nie tylko surowce)');
  assert(/electronic_systems/.test(html), 'top blokery: drugi towar z payloadu');
  // mapa stanów: inert nie rysowany (mniej szumu) — Nt jest inert we WSZYSTKICH latach
  const mapLabels = (html.match(/class="rr-map-lab">/g) ?? []).length;
  assert(mapLabels > 0, 'mapa stanów ma etykiety wierszy (zasobów)');
  assert(!/rr-map-lab">Nt</.test(html), 'zasób inert przez cały panel NIE zaśmieca mapy stanów');
  assert(/Nt/.test(html), 'ale inert jest wymieniony (tabela + lista w metodologii) — kompletność');
  // stan „stoi" na karcie seeda
  assert(/stoi 3 lat \(od gy1\)/.test(html), 'karta seeda podaje ile lat gospodarka stała i od kiedy');
  assert(/Wiąże panel/.test(html) && /Gospodarka STOI/.test(html), 'kafle KPI: kto wiąże + ile lat stoi');
}

// ── T6: eskejp + edge-case'y ──────────────────────────────────────
console.log('\nT6 — eskejp HTML + edge-case (pusty payload, brak wiązań, crash)');
{
  const evil = { ...fixture, seeds: [mkSeed('<img src=x onerror=1>')] };
  const he = renderResourceReport(evil);
  assert(!he.includes('<img src=x'), 'nazwa seeda z HTML zeskejpowana (brak wstrzyknięcia)');
  assert(he.includes('&lt;img'), 'znaki < > zamienione na encje');

  let threw = false, empty = '';
  try { empty = renderResourceReport({}); } catch { threw = true; }
  assert(!threw && typeof empty === 'string' && empty.length > 200, 'pusty payload {} → nie rzuca, zwraca HTML');

  const noBind = renderResourceReport({ ...fixture, panel: mkPanel({ verdict: { outcome: 0, label: 'NO BINDING', binder: null, share: 0 }, topBlockers: {} }) });
  assert(/NO BINDING/.test(noBind) && !/rr-svg-lab/.test(noBind.split('Główny bloker')[1] ?? ''),
    'brak blokerów → sekcja blokerów pominięta, raport dalej się renderuje');

  const crashed = renderResourceReport({ ...fixture, seeds: [mkSeed('balans-gate1_1', { crashed: true })] });
  assert(/crash/.test(crashed), 'crashed seed → badge crash w karcie');
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
