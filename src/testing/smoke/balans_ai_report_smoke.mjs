// BALANS 1.0 — Phase 2 — AiReport keeper (chroni renderer HTML raportu AI).
// Czysta funkcja renderAiReport(payload) → samodzielny HTML. Ten raport DIAGNOZUJE,
// więc keeper pilnuje nie tylko „czy się renderuje", ale też czy niesie rzeczy, bez
// których diagnoza kłamie: granice pomiaru, powody no-opów, blokery i ZNALEZISKO
// o nierozwiązanych zależnościach.
//
//   T1  self-contained (zero http/script/src) + wszystkie sekcje
//   T2  granice pomiaru: liczba UKŁADÓW AI, nie liczba wierszy (uczciwość próby)
//   T3  porównanie bazowe: linia gracza + linia KAŻDEGO imperium (kolor + WZÓR)
//   T4  dziennik decyzji: akcje, no-opy z powodem, sonda zależności (obie gałęzie)
//   5   blokery zestawu + powód stallu droida
//   T6  progi/WARN-y + outcome→klasa werdyktu
//   T7  eskejp HTML + edge-case'y (pusty payload, brak imperiów, NIGDY placówki)

import { renderAiReport } from '../report/AiReport.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Fixture w kształcie payloadu balans-ai-telemetry.mjs ──────────
const mkEmpireRow = (id, over = {}) => ({
  empireId: id, name: id === 'emp_001' ? 'Konsorcjum' : 'Pochód',
  archetype: id === 'emp_001' ? 'industrialist' : 'expansionist',
  coloniesEnd: 1, outpostsEnd: id === 'emp_001' ? 2 : 0,
  firstOutpostGy: id === 'emp_001' ? 13 : null, first3ColoniesGy: id === 'emp_001' ? 15 : null,
  popStart: 6, popEnd: id === 'emp_001' ? 135 : 31, popPeak: 135,
  emplRateEnd: id === 'emp_001' ? 0.94 : 0.28, unfilledEnd: 12.5,
  buildingsEnd: 48, creditsEnd: 300, droidsStoredEnd: 2, droidsInstalledEnd: 4,
  decisionEnd: 'BRAK AKCJI', reasonEnd: 'outposty pominięte: nie stać na outpost (canAffordOutpost=false)',
  outpostShortEnd: id === 'emp_001' ? [] : [{ id: 'Ti', have: 0, need: 15, short: 15 }],
  atWarEver: false, popDeclineYears: 0, ...over,
});
const mkSeriesRow = (gy, over = {}) => ({
  gy,
  player: { coloniesFull: 1 + Math.floor(gy / 20), outposts: 0, home: { pop: 16 + gy * 2, buildingCount: 10 + gy } },
  empires: [
    { empireId: 'emp_001', name: 'Konsorcjum', archetype: 'industrialist', homeSystemId: 'sys_061',
      coloniesFull: 1, outposts: gy >= 13 ? 2 : 0, mother: { pop: 6 + gy * 3, stock: {}, },
      droidStall: gy < 13 ? { kind: 'missing_ingredient' } : null, outpostShort: [] },
    { empireId: 'emp_002', name: 'Pochód', archetype: 'expansionist', homeSystemId: 'sys_040',
      coloniesFull: 1, outposts: 0, mother: { pop: 6 + gy, stock: {} },
      droidStall: null, outpostShort: [{ id: 'Ti', have: 0, need: 15, short: 15 }] },
  ],
  ...over,
});
const mkSeed = (seed, over = {}) => ({
  seed, crashed: false,
  summary: { empires: [mkEmpireRow('emp_001'), mkEmpireRow('emp_002')],
    player: { coloniesEnd: 4, outpostsEnd: 1, popEnd: 79, popStart: 16, buildingsEnd: 47, emplRateEnd: 1.02, creditsEnd: 900, firstExpansionGy: 8 },
    decisions: { actionsTotal: { strategy: 12, expander: 900 }, effective: 240, topNoops: [], depsMissing: [] } },
  series: [mkSeriesRow(0), mkSeriesRow(10), mkSeriesRow(20), mkSeriesRow(45)],
  health: { warns: [
    { code: 'AI_NO_FIRST_OUTPOST', empireId: 'emp_002', name: 'Pochód', detail: 'ŻADNEJ placówki przez cały przebieg (45 gy); próg: 2 gy' },
    { code: 'AI_FEW_COLONIES', empireId: 'emp_001', name: 'Konsorcjum', detail: 'w 10 gy tylko 1 ciał (próg 3+)' },
  ], checks: [] },
  decisions: {
    actions: [
      { system: 'strategy', kind: 'outpost', outcome: 'fired', effective: undefined },
      { system: 'expander', kind: 'build', outcome: 'queued', effective: true },
      { system: 'expander', kind: 'build', outcome: 'fail', effective: false },
    ],
    noops: [
      { system: 'strategy', module: 'colonization', reasonKey: 'cannot_afford_outpost', count: 1133, sample: 'cannot_afford_outpost | nie stać na outpost' },
      { system: 'expander', module: 'survival', reasonKey: 'unreachable_backoff', count: 4642, sample: 'unreachable_backoff | build:solar_farm' },
    ],
    deps: [],
  },
  ...over,
});
const fixture = {
  meta: { tool: 'BALANS test AI', planetClass: 'REAL', seeds: 2, targetGy: 45, note: 'read-only' },
  thresholds: { FIRST_OUTPOST_GY: 2, COLONIES_TARGET: 3, COLONIES_BY_GY: 10 },
  seeds: [mkSeed('balans-gate1_1'), mkSeed('balans-gate1_2')],
  panel: {
    empiresObserved: 4, neverOutpost: 2, medFirstOutpostGy: 13, medFirst3ColoniesGy: 15,
    medAiColoniesEnd: 2, medPlayerColoniesEnd: 5, medAiPopEnd: 55, medPlayerPopEnd: 73,
    medAiBuildingsEnd: 41, medPlayerBuildingsEnd: 45, medAiEmplRateEnd: 0.6, medPlayerEmplRateEnd: 1.02,
    medAiUnfilledEnd: 49, thresholdFirstOutpostGy: 2,
    verdict: { outcome: 1, label: 'regresja POTWIERDZONA — AI kończy z medianą 2 ciał vs gracz 5' },
  },
};

// ── T1: self-contained + sekcje ───────────────────────────────────
console.log('T1 — self-contained HTML + sekcje');
{
  const html = renderAiReport(fixture);
  assert(typeof html === 'string' && html.length > 2000, 'zwraca niepusty HTML string');
  assert(!/https?:\/\//.test(html), 'zero URL http/https (otwieralny offline)');
  assert(!/<script/i.test(html) && !/\ssrc=/.test(html), 'zero <script> i src=');
  assert(html.includes('regresja POTWIERDZONA'), 'niesie etykietę werdyktu');
  assert(/rp-verdict/.test(html) && /rp-method/.test(html) && /rp-table/.test(html), 'sekcje: werdykt + granice + tabele');
  assert(/Porównanie bazowe/.test(html) && /Dziennik decyzji/.test(html) && /Co blokuje/.test(html) && /Progi zdrowia/.test(html),
    'wszystkie cztery sekcje merytoryczne obecne');
  // `undefined` pada w raporcie CELOWO — w prozie o martwej warstwie AI w harnessie
  // (`<code>undefined</code>`). Sprawdzamy WYCIEK do pozycji DANYCH: poza spanami <code>.
  const dataOnly = html.replace(/<code>[\s\S]*?<\/code>/g, '');
  assert(!/undefined|NaN/.test(dataOnly), 'brak wycieku „undefined"/„NaN" do komórek danych');
}

// ── T2: granice pomiaru (uczciwość próby) ─────────────────────────
console.log('T2 — granice pomiaru mówią o UKŁADACH, nie o liczbie wierszy');
{
  const html = renderAiReport(fixture);
  assert(/2 sytuacje × 2 powtórzeń/.test(html),
    'raport wprost redukuje 4 wiersze imperiów do 2 sytuacji × 2 seedy (fixture ma 2 układy AI)');
  assert(/empireColonyBootstrap/.test(html), 'granice wymieniają martwą warstwę AI w samym harnessie');
  assert(/Zdarzenia losowe wyłączone/.test(html), 'granice mówią o wyłączonych zdarzeniach losowych');
  assert(/panelem referencyjnym/.test(html), 'granice ostrzegają, że krzywa gracza ≠ panel referencyjny');
}

// ── T3: porównanie bazowe — linie gracza i imperiów ───────────────
console.log('T3 — porównanie bazowe: gracz + KAŻDE imperium, kolor ORAZ wzór');
{
  const html = renderAiReport(fixture);
  const dashed = (html.match(/stroke-dasharray/g) ?? []).length;
  assert(dashed >= 2, `serie imperiów mają WZÓR linii, nie tylko kolor (${dashed} wystąpień)`);
  assert(html.includes('emp_001') && html.includes('emp_002'), 'legenda wymienia oba imperia');
  const cards = (html.match(/rp-card"/g) ?? []).length;
  assert(cards === 2, `karta per seed (${cards})`);
  assert(/Konsorcjum/.test(html) && /Pochód/.test(html), 'tabela kamieni milowych zawiera nazwy imperiów');
  assert(/NIGDY/.test(html), 'imperium bez placówki oznaczone słowem NIGDY (nie pustą komórką)');
}

// ── T4: dziennik decyzji + sonda zależności (obie gałęzie) ────────
console.log('T4 — dziennik decyzji + sonda zależności');
{
  const html = renderAiReport(fixture);
  assert(/strategy:outpost:fired/.test(html), 'akcje zliczone per system:rodzaj:wynik');
  assert(/cannot_afford_outpost/.test(html) && /4642|9284/.test(html), 'no-opy z POWODEM i licznikiem');
  assert(/żadna decyzja nie umarła po cichu/.test(html), 'gałąź „wszystkie zależności OK" mówi to wprost');

  const broken = JSON.parse(JSON.stringify(fixture));
  broken.seeds[0].decisions.deps = [{ key: 'empireColonyBootstrap', note: 'brak → EXEC nigdy nie ruszy', count: 3 }];
  const html2 = renderAiReport(broken);
  assert(/ZNALEZISKO/.test(html2), 'nierozwiązana zależność renderuje się jako ZNALEZISKO, nie jako cichy brak');
  assert(/brak → EXEC nigdy nie ruszy/.test(html2), 'ZNALEZISKO niesie notatkę o miejscu użycia');
}

// ── T5: blokery + stall droida ────────────────────────────────────
console.log('T5 — blokery zestawu placówki + powód stallu droida');
{
  const html = renderAiReport(fixture);
  assert(/>Ti</.test(html) || /<code>Ti<\/code>/.test(html), 'brakująca pozycja zestawu wymieniona z nazwy');
  assert(/2\/4/.test(html), 'bloker podany jako „u ilu imperiów" (2/4)');
  assert(/missing_ingredient/.test(html), 'powód stallu produkcji droida z FactorySystem.getStallReason');
}

// ── T6: progi + outcome → klasa werdyktu ──────────────────────────
console.log('T6 — progi/WARN-y + mapowanie outcome na klasę');
{
  const html = renderAiReport(fixture);
  assert(/AI_NO_FIRST_OUTPOST/.test(html) && /AI_FEW_COLONIES/.test(html), 'kody WARN w tabeli');
  assert(/FIRST_OUTPOST_GY/.test(html), 'progi wypisane wprost (przestrajalne, nie ukryte)');
  assert(/rp-edge-bad/.test(html), 'outcome 1 → krawędź „bad"');
  const good = JSON.parse(JSON.stringify(fixture));
  good.panel.verdict = { outcome: 2, label: 'regresja NIEpotwierdzona' };
  assert(/rp-edge-good/.test(renderAiReport(good)), 'outcome 2 → krawędź „good"');
  const mixed = JSON.parse(JSON.stringify(fixture));
  mixed.panel.verdict = { outcome: 3, label: 'mieszane' };
  assert(/rp-edge-warn/.test(renderAiReport(mixed)), 'outcome 3 → krawędź „warn"');
}

// ── T7: eskejp + edge-case'y ──────────────────────────────────────
console.log('T7 — eskejp HTML + edge-case\'y');
{
  const evil = JSON.parse(JSON.stringify(fixture));
  evil.panel.verdict.label = '<img src=x onerror=alert(1)> & "cudzysłów"';
  evil.seeds[0].summary.empires[0].name = '<b>zły</b>';
  const html = renderAiReport(evil);
  assert(!/<img src=x/.test(html) && /&lt;img src=x/.test(html), 'HTML w etykiecie werdyktu ESKEJPOWANY');
  assert(!/<b>zły<\/b>/.test(html) && /&lt;b&gt;zły/.test(html), 'HTML w nazwie imperium ESKEJPOWANY');
  assert(/&amp;/.test(html), '& eskejpowany');

  assert(typeof renderAiReport({}) === 'string', 'pusty payload → nie rzuca');
  assert(typeof renderAiReport(null) === 'string', 'null → nie rzuca');
  const noEmp = JSON.parse(JSON.stringify(fixture));
  noEmp.seeds = [{ seed: 's', crashed: true, summary: { empires: [], player: {} }, series: [], health: { warns: [] }, decisions: { actions: [], noops: [], deps: [] } }];
  noEmp.panel = { empiresObserved: 0, verdict: { outcome: 0, label: 'brak imperiów' } };
  const emptyHtml = renderAiReport(noEmp);
  assert(/brak imperiów/.test(emptyHtml) && /crash/.test(emptyHtml), 'brak imperiów + crash → raport nadal się renderuje i to mówi');
}

console.log(`\n═══ ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
