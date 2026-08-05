// BALANS 1.0 — Phase 2 — launcher keeper (chroni panel HTTP nad harnessem).
// Instrument nie ma bramki w przeglądarce (to nie UI gry), więc keeper jest
// jedyną siatką bezpieczeństwa: waliduje wejście, trasy, sandbox plików
// raportu ORAZ realne uruchomienie runnera end-to-end (nie stub).
//
//   T1  parseRunParams — domyślne / poprawne / odrzucone (klasa, seedy, gy)
//   T2  isSafeReportName + reportFileFor — whitelist nazw (anty path-traversal)
//   T3  serwer: panel 200 + self-contained + błędne trasy/JSON/parametry/raport
//   T4  end-to-end: POST /run odpala PRAWDZIWY runner → powstaje plik raportu,
//       a GET /report/<plik> go serwuje (uruchomienie minimalne: 1 seed, 2 gy)
//
// Uruchom: node src/testing/smoke/balans_launcher_smoke.mjs

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseRunParams, isSafeReportName, reportFileFor, createLauncherServer,
  RUN_LIMITS, REPORTS_DIR, RUNNER_PATH,
} from '../headless/balans-launcher.mjs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Klasa testowa — NIE nadpisuje artefaktów panelu (pop-report-REAL.html).
// Nieznany klucz ⇒ GameCore pomija injekcję złóż (jak REAL) — patrz GameCore.PLANET_CLASSES.
const SMOKE_CLASS = 'SMOKE';
const SMOKE_HTML  = join(REPORTS_DIR, `pop-report-${SMOKE_CLASS}.html`);
const SMOKE_JSON  = join(REPORTS_DIR, `pop-telemetry-${SMOKE_CLASS}.json`);
const cleanup = () => { for (const f of [SMOKE_HTML, SMOKE_JSON]) { try { rmSync(f, { force: true }); } catch {} } };

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
}

// ── T2: whitelist nazw raportu ────────────────────────────────────
console.log('\nT2 — isSafeReportName / reportFileFor (sandbox plików)');
{
  assert(reportFileFor('REAL') === 'pop-report-REAL.html', 'reportFileFor = kontrakt nazwy runnera');
  assert(isSafeReportName('pop-report-REAL.html'), 'REAL przechodzi');
  assert(isSafeReportName('pop-report-GOOD_FE.html'), 'GOOD_FE (podkreślenie) przechodzi');
  assert(!isSafeReportName('../../../package.json'), 'traversal odrzucony');
  assert(!isSafeReportName('pop-telemetry-REAL.json'), 'inny artefakt niż raport odrzucony');
  assert(!isSafeReportName('pop-report-REAL.html.bak'), 'doklejone rozszerzenie odrzucone');
  assert(!isSafeReportName(''), 'pusta nazwa odrzucona');
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
    assert(html.includes('id="run"'), 'panel ma przycisk Uruchom');
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

  // ── T4: end-to-end — PRAWDZIWY runner ───────────────────────────
  console.log('\nT4 — end-to-end: /run odpala prawdziwy runner → raport na dysku');
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
} finally {
  cleanup();
  await new Promise((r) => server.close(r));
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
