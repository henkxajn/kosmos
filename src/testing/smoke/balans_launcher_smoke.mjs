// BALANS 1.0 — Phase 2 — launcher keeper (chroni panel HTTP nad harnessem).
// Instrument nie ma bramki w przeglądarce (to nie UI gry), więc keeper jest
// jedyną siatką bezpieczeństwa: waliduje wejście, trasy, sandbox plików
// raportu ORAZ realne uruchomienie runnera end-to-end (nie stub).
//
//   T1  parseRunParams — domyślne / poprawne / odrzucone (metryka, klasa, seedy, gy)
//   T2  isSafeReportName + reportFileFor — whitelist nazw per metryka (anty traversal)
//   T3  serwer: panel 200 + self-contained + błędne trasy/JSON/parametry/raport
//   T4  end-to-end POP: POST /run odpala PRAWDZIWY runner → powstaje plik raportu,
//       a GET /report/<plik> go serwuje (uruchomienie minimalne: 1 seed, 2 gy)
//   T5  end-to-end ZASOBY: ta sama trasa z metric=resources odpala runner ZASOBÓW
//       (regresja realnego buga: domyślka `runner` w createLauncherServer nadpisywała
//        wybór metryki i „Zasoby" odpalały runner POP)
//   T6  end-to-end ROI: metric=roi odpala runner ROI (ta sama regresja, trzecia metryka)
//   T7  end-to-end CENY: metric=prices odpala runner CEN (czwarta metryka tą samą trasą)
//   T8  end-to-end AI: metric=ai odpala runner IMPERIÓW AI (piąta i ostatnia metryka Phase 2)
//
// Uruchom: node src/testing/smoke/balans_launcher_smoke.mjs

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseRunParams, isSafeReportName, reportFileFor, createLauncherServer,
  RUN_LIMITS, REPORTS_DIR, RUNNER_PATH, METRICS, DEFAULT_METRIC, PANEL_DEFAULT_METRIC,
} from '../headless/balans-launcher.mjs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Klasa testowa — NIE nadpisuje artefaktów panelu (pop-report-REAL.html).
// Nieznany klucz ⇒ GameCore pomija injekcję złóż (jak REAL) — patrz GameCore.PLANET_CLASSES.
const SMOKE_CLASS = 'SMOKE';
const SMOKE_HTML  = join(REPORTS_DIR, `pop-report-${SMOKE_CLASS}.html`);
const SMOKE_JSON  = join(REPORTS_DIR, `pop-telemetry-${SMOKE_CLASS}.json`);
const SMOKE_RES_HTML = join(REPORTS_DIR, `resource-report-${SMOKE_CLASS}.html`);
const SMOKE_RES_JSON = join(REPORTS_DIR, `resource-telemetry-${SMOKE_CLASS}.json`);
const SMOKE_ROI_HTML = join(REPORTS_DIR, `roi-report-${SMOKE_CLASS}.html`);
const SMOKE_ROI_JSON = join(REPORTS_DIR, `roi-telemetry-${SMOKE_CLASS}.json`);
const SMOKE_PRC_HTML = join(REPORTS_DIR, `price-report-${SMOKE_CLASS}.html`);
const SMOKE_PRC_JSON = join(REPORTS_DIR, `price-telemetry-${SMOKE_CLASS}.json`);
const SMOKE_AI_HTML  = join(REPORTS_DIR, `ai-report-${SMOKE_CLASS}.html`);
const SMOKE_AI_JSON  = join(REPORTS_DIR, `ai-telemetry-${SMOKE_CLASS}.json`);
const cleanup = () => {
  for (const f of [SMOKE_HTML, SMOKE_JSON, SMOKE_RES_HTML, SMOKE_RES_JSON, SMOKE_ROI_HTML, SMOKE_ROI_JSON,
    SMOKE_PRC_HTML, SMOKE_PRC_JSON, SMOKE_AI_HTML, SMOKE_AI_JSON]) {
    try { rmSync(f, { force: true }); } catch {}
  }
};

// ── T1: walidacja parametrów ──────────────────────────────────────
console.log('T1 — parseRunParams (domyślne / poprawne / odrzucone)');
{
  const def = parseRunParams({});
  assert(def.ok && def.params.planetClass === 'REAL' && def.params.seeds === 8 && def.params.gy === 45,
    'domyślne = REAL / 8 seedów / 45 gy (panel Phase 1)');

  const ok = parseRunParams({ class: 'good_fe', seeds: '3', gy: '12' });
  assert(ok.ok && ok.params.planetClass === 'GOOD_FE' && ok.params.seeds === 3 && ok.params.gy === 12,
    'klasa normalizowana do UPPER, liczby ze stringów');

  assert(parseRunParams({ class: '../../etc/passwd' }).ok === false, 'klasa ze slashami odrzucona');
  assert(parseRunParams({ class: 'REAL; rm -rf /' }).ok === false, 'klasa ze spacją/średnikiem odrzucona');
  assert(parseRunParams({ class: '' }).ok === false, 'pusta klasa odrzucona');
  assert(parseRunParams({ class: '9BAD' }).ok === false, 'klasa zaczynająca się cyfrą odrzucona');

  assert(parseRunParams({ seeds: 0 }).ok === false, 'seeds=0 odrzucone');
  assert(parseRunParams({ seeds: RUN_LIMITS.SEEDS_MAX + 1 }).ok === false, `seeds>${RUN_LIMITS.SEEDS_MAX} odrzucone`);
  assert(parseRunParams({ seeds: 2.5 }).ok === false, 'seeds ułamkowe odrzucone');
  assert(parseRunParams({ seeds: 'osiem' }).ok === false, 'seeds nieliczbowe odrzucone');
  assert(parseRunParams({ gy: 0 }).ok === false, 'gy=0 odrzucone');
  assert(parseRunParams({ gy: RUN_LIMITS.GY_MAX + 1 }).ok === false, `gy>${RUN_LIMITS.GY_MAX} odrzucone`);
  assert(parseRunParams({ seeds: RUN_LIMITS.SEEDS_MAX, gy: RUN_LIMITS.GY_MAX }).ok === true, 'górne granice przechodzą');

  // metryka (rejestr METRICS)
  assert(def.params.metric === DEFAULT_METRIC, `brak metryki → domyślna '${DEFAULT_METRIC}' (kompatybilność wstecz)`);
  assert(parseRunParams({ metric: 'resources' }).params.metric === 'resources', 'metric=resources przechodzi');
  assert(parseRunParams({ metric: 'roi' }).params.metric === 'roi', 'metric=roi przechodzi (trzecia metryka slice\'u)');
  assert(parseRunParams({ metric: 'nie_ma_takiej' }).ok === false, 'nieznana metryka odrzucona (runner nie zgadywany)');
  assert(parseRunParams({ metric: '../pop' }).ok === false, 'metryka ze ścieżką odrzucona');
  assert(parseRunParams({ metric: 'constructor' }).ok === false, 'metryka z prototypu Object odrzucona (hasOwnProperty)');
}

// ── T2: whitelist nazw raportu ────────────────────────────────────
console.log('\nT2 — isSafeReportName / reportFileFor (sandbox plików)');
{
  assert(reportFileFor('REAL') === 'pop-report-REAL.html', 'reportFileFor = kontrakt nazwy runnera');
  assert(reportFileFor('REAL', 'resources') === 'resource-report-REAL.html', 'nazwa raportu per metryka');
  assert(isSafeReportName('pop-report-REAL.html'), 'REAL przechodzi');
  assert(isSafeReportName('pop-report-GOOD_FE.html'), 'GOOD_FE (podkreślenie) przechodzi');
  assert(reportFileFor('REAL', 'roi') === 'roi-report-REAL.html', 'nazwa raportu ROI = kontrakt runnera');
  assert(isSafeReportName('resource-report-GOOD_FE.html'), 'raport zasobów przechodzi (whitelist z METRICS)');
  assert(isSafeReportName('roi-report-REAL.html'), 'raport ROI przechodzi (whitelist budowana z rejestru, nie z ręcznego regexpu)');
  assert(!isSafeReportName('roi-telemetry-REAL.json'), 'JSON ROI nie jest serwowany');
  assert(!isSafeReportName('../../../package.json'), 'traversal odrzucony');
  assert(!isSafeReportName('pop-telemetry-REAL.json'), 'inny artefakt niż raport odrzucony');
  assert(!isSafeReportName('resource-telemetry-REAL.json'), 'JSON zasobów też nie jest serwowany');
  assert(!isSafeReportName('pop-report-REAL.html.bak'), 'doklejone rozszerzenie odrzucone');
  assert(!isSafeReportName(''), 'pusta nazwa odrzucona');
  assert(Object.values(METRICS).every(m => existsSync(m.runner)),
    `każda metryka w rejestrze wskazuje ISTNIEJĄCY runner (${Object.keys(METRICS).join(', ')})`);
}

// ── Serwer na porcie efemerycznym (T3+T4) ─────────────────────────
const server = createLauncherServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  // ── T3: trasy ───────────────────────────────────────────────────
  console.log('\nT3 — serwer: panel + trasy błędne');
  {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    assert(res.status === 200, 'GET / → 200');
    assert(/text\/html/.test(res.headers.get('content-type') ?? ''), 'panel serwowany jako text/html');
    assert(html.includes('id="seeds"') && html.includes('id="gy"') && html.includes('id="cls"'),
      'panel ma pola: seedy / game-lata / klasa');
    assert(html.includes('id="metric"') && Object.keys(METRICS).every(k => html.includes(`value="${k}"`)),
      `panel ma wybór metryki ze WSZYSTKIMI metrykami rejestru (${Object.keys(METRICS).join(', ')})`);
    assert(html.includes('id="run"'), 'panel ma przycisk Uruchom');
    assert(PANEL_DEFAULT_METRIC === Object.keys(METRICS)[Object.keys(METRICS).length - 1],
      `panel preselekcjonuje NAJNOWSZĄ metrykę rejestru ('${PANEL_DEFAULT_METRIC}') — wyliczane, nie wpisane na sztywno`);
    assert(html.includes(`value="${PANEL_DEFAULT_METRIC}" selected`), 'preselekcja widoczna w HTML panelu');
    assert(DEFAULT_METRIC === 'pop', 'domyślka API zostaje `pop` (kompatybilność wstecz) mimo nowej metryki');
    assert(/game-years/.test(html), 'panel nazywa jednostkę game-years (HARD #3)');
    assert(!/https?:\/\//.test(html.replace(/http:\/\/localhost/g, '')), 'zero zewnętrznych URL (self-contained)');
    assert(!/\ssrc=/.test(html), 'zero zewnętrznych src= (CSS i JS inline)');

    assert((await fetch(`${base}/nie-ma`)).status === 404, 'nieznana trasa → 404');

    const badJson = await fetch(`${base}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    assert(badJson.status === 400, 'POST /run z niepoprawnym JSON → 400');

    const badParams = await fetch(`${base}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seeds: 999 }) });
    const bp = await badParams.json();
    assert(badParams.status === 400 && bp.ok === false && typeof bp.error === 'string',
      'POST /run z seeds poza limitem → 400 + powód (runner NIE odpalony)');

    const traversal = await fetch(`${base}/report/${encodeURIComponent('../../../package.json')}`);
    assert(traversal.status === 400, 'GET /report z traversalem → 400');

    const missing = await fetch(`${base}/report/pop-report-NOPE.html`);
    assert(missing.status === 404, 'GET /report nieistniejącego pliku → 404');
  }

  // ── T4: end-to-end — PRAWDZIWY runner (POP) ─────────────────────
  console.log('\nT4 — end-to-end POP: /run odpala prawdziwy runner → raport na dysku');
  {
    assert(existsSync(RUNNER_PATH), 'runner istnieje pod ścieżką z launchera');
    cleanup();   // pre-clean: istnienie po runie = plik POWSTAŁ w tym runie
    assert(!existsSync(SMOKE_HTML), 'przed runem brak pliku raportu (pre-clean)');

    const t0 = Date.now();
    const res = await fetch(`${base}/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ class: SMOKE_CLASS, seeds: 1, gy: 2 }),
    });
    const d = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    assert(res.status === 200 && d.ok === true, `POST /run → 200 ok (${secs}s, kod ${d.exitCode})`);
    assert(d.exitCode === 0 && d.timedOut === false, 'runner zakończył się kodem 0, bez timeoutu');
    assert(d.reportFile === `pop-report-${SMOKE_CLASS}.html`, 'zwrócona nazwa raportu = kontrakt runnera');
    assert(d.reportUrl === `/report/pop-report-${SMOKE_CLASS}.html`, 'zwrócony link do raportu');
    assert(existsSync(SMOKE_HTML), 'plik raportu POWSTAŁ na dysku');
    assert(existsSync(SMOKE_JSON), 'plik JSON telemetrii też powstał (ta sama ścieżka co terminal)');
    assert(Array.isArray(d.tail) && d.tail.some(l => /WERDYKT|PANEL/.test(l)),
      'ogon stdout niesie wynik runnera (dowód: to REALNY runner, nie stub)');

    const rep = await fetch(`${base}${d.reportUrl}`);
    const html = await rep.text();
    assert(rep.status === 200, 'GET zwróconego linku → 200');
    assert(html.includes('BALANS') && html.includes('rp-verdict'), 'serwowany plik to raport POP (renderPopReport)');
  }

  // ── T5: end-to-end ZASOBY (regresja: metryka wybiera runner) ────
  console.log('\nT5 — end-to-end ZASOBY: metric=resources odpala runner ZASOBÓW (nie POP)');
  {
    cleanup();
    assert(!existsSync(SMOKE_RES_HTML) && !existsSync(SMOKE_HTML), 'przed runem brak obu raportów (pre-clean)');

    const t0 = Date.now();
    const res = await fetch(`${base}/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metric: 'resources', class: SMOKE_CLASS, seeds: 1, gy: 2 }),
    });
    const d = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    assert(res.status === 200 && d.ok === true, `POST /run (resources) → 200 ok (${secs}s, kod ${d.exitCode})`);
    assert(d.metric === 'resources' && d.reportFile === `resource-report-${SMOKE_CLASS}.html`,
      'zwrócona metryka i nazwa raportu = kontrakt runnera zasobów');
    assert(existsSync(SMOKE_RES_HTML) && existsSync(SMOKE_RES_JSON), 'artefakty ZASOBÓW powstały na dysku');
    // ⚠ REGRESJA REALNEGO BUGA: domyślka `runner` w createLauncherServer nadpisywała
    //   wybór metryki → „Zasoby" po cichu odpalały runner POP i podmieniały jego artefakt.
    assert(!existsSync(SMOKE_HTML), 'runner POP NIE został odpalony (brak artefaktu POP)');
    assert(Array.isArray(d.tail) && d.tail.some(l => /WERDYKT|PANEL per zasób/.test(l)),
      'ogon stdout niesie wynik runnera ZASOBÓW (dowód: właściwy proces)');

    const rep = await fetch(`${base}${d.reportUrl}`);
    const html = await rep.text();
    assert(rep.status === 200, 'GET linku do raportu zasobów → 200');
    assert(html.includes('telemetria ZASOBÓW') && html.includes('rr-verdict'),
      'serwowany plik to raport ZASOBÓW (renderResourceReport)');
  }

  // ── T6: end-to-end ROI (trzecia metryka tą samą trasą) ──────────
  console.log('\nT6 — end-to-end ROI: metric=roi odpala runner ROI (nie POP, nie ZASOBY)');
  {
    cleanup();
    assert(!existsSync(SMOKE_ROI_HTML) && !existsSync(SMOKE_HTML) && !existsSync(SMOKE_RES_HTML),
      'przed runem brak raportów wszystkich trzech metryk (pre-clean)');

    const t0 = Date.now();
    const res = await fetch(`${base}/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metric: 'roi', class: SMOKE_CLASS, seeds: 1, gy: 2 }),
    });
    const d = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    assert(res.status === 200 && d.ok === true, `POST /run (roi) → 200 ok (${secs}s, kod ${d.exitCode})`);
    assert(d.metric === 'roi' && d.reportFile === `roi-report-${SMOKE_CLASS}.html`,
      'zwrócona metryka i nazwa raportu = kontrakt runnera ROI');
    assert(existsSync(SMOKE_ROI_HTML) && existsSync(SMOKE_ROI_JSON), 'artefakty ROI powstały na dysku');
    assert(!existsSync(SMOKE_HTML) && !existsSync(SMOKE_RES_HTML),
      'runnery POP i ZASOBÓW NIE zostały odpalone (rejestr wybiera właściwy proces)');
    assert(Array.isArray(d.tail) && d.tail.some(l => /WERDYKT|TOR \(a\)/.test(l)),
      'ogon stdout niesie wynik runnera ROI (dowód: właściwy proces)');

    const rep = await fetch(`${base}${d.reportUrl}`);
    const html = await rep.text();
    assert(rep.status === 200, 'GET linku do raportu ROI → 200');
    assert(html.includes('KOSZT ↔ WARTOŚĆ') && html.includes('rr-verdict'),
      'serwowany plik to raport ROI (renderRoiReport)');
  }

  // ── T7: end-to-end CENY (czwarta metryka tą samą trasą) ─────────
  console.log('\nT7 — end-to-end CENY: metric=prices odpala runner CEN (nie POP / ZASOBY / ROI)');
  {
    cleanup();
    assert(!existsSync(SMOKE_PRC_HTML) && !existsSync(SMOKE_ROI_HTML) && !existsSync(SMOKE_HTML) && !existsSync(SMOKE_RES_HTML),
      'przed runem brak raportów wszystkich czterech metryk (pre-clean)');

    const t0 = Date.now();
    const res = await fetch(`${base}/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metric: 'prices', class: SMOKE_CLASS, seeds: 1, gy: 2 }),
    });
    const d = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    assert(res.status === 200 && d.ok === true, `POST /run (prices) → 200 ok (${secs}s, kod ${d.exitCode})`);
    assert(d.metric === 'prices' && d.reportFile === `price-report-${SMOKE_CLASS}.html`,
      'zwrócona metryka i nazwa raportu = kontrakt runnera CEN');
    assert(existsSync(SMOKE_PRC_HTML) && existsSync(SMOKE_PRC_JSON), 'artefakty CEN powstały na dysku');
    assert(!existsSync(SMOKE_HTML) && !existsSync(SMOKE_RES_HTML) && !existsSync(SMOKE_ROI_HTML),
      'runnery POP / ZASOBÓW / ROI NIE zostały odpalone (rejestr wybiera właściwy proces)');
    assert(Array.isArray(d.tail) && d.tail.some(l => /WERDYKT B|OSIĄGALNOŚĆ/.test(l)),
      'ogon stdout niesie wynik runnera CEN (dowód: właściwy proces)');

    const rep = await fetch(`${base}${d.reportUrl}`);
    const html = await rep.text();
    assert(rep.status === 200, 'GET linku do raportu CEN → 200');
    assert(html.includes('Warstwa A — audyt tabeli') && html.includes('Warstwa B — jak cennik gra'),
      'serwowany plik to raport CEN — i niesie OBIE warstwy (renderPriceReport)');
  }

  // ── T8: end-to-end AI (piąta metryka — domyka Phase 2) ──────────
  console.log('\nT8 — end-to-end AI: metric=ai odpala runner IMPERIÓW (nie POP / ZASOBY / ROI / CENY)');
  {
    cleanup();
    assert(!existsSync(SMOKE_AI_HTML), 'przed runem brak raportu AI (pre-clean)');

    const t0 = Date.now();
    const res = await fetch(`${base}/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metric: 'ai', class: SMOKE_CLASS, seeds: 1, gy: 2 }),
    });
    const d = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    assert(res.status === 200 && d.ok === true, `POST /run (ai) → 200 ok (${secs}s, kod ${d.exitCode})`);
    assert(d.metric === 'ai' && d.reportFile === `ai-report-${SMOKE_CLASS}.html`,
      'zwrócona metryka i nazwa raportu = kontrakt runnera AI');
    assert(existsSync(SMOKE_AI_HTML) && existsSync(SMOKE_AI_JSON), 'artefakty AI powstały na dysku');
    assert(!existsSync(SMOKE_HTML) && !existsSync(SMOKE_RES_HTML) && !existsSync(SMOKE_ROI_HTML) && !existsSync(SMOKE_PRC_HTML),
      'runnery POP / ZASOBÓW / ROI / CEN NIE zostały odpalone (rejestr wybiera właściwy proces)');
    assert(Array.isArray(d.tail) && d.tail.some(l => /SONDA ZALEŻNOŚCI|PORÓWNANIE BAZOWE|WERDYKT/.test(l)),
      'ogon stdout niesie wynik runnera AI (dowód: właściwy proces)');

    const rep = await fetch(`${base}${d.reportUrl}`);
    const html = await rep.text();
    assert(rep.status === 200, 'GET linku do raportu AI → 200');
    assert(html.includes('IMPERIA AI') && html.includes('Granice tego pomiaru'),
      'serwowany plik to raport AI — z sekcją GRANIC pomiaru (bez niej diagnoza kłamie)');
  }
} finally {
  cleanup();
  await new Promise((r) => server.close(r));
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
