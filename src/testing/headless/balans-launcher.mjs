// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — LAUNCHER (lokalny panel HTTP nad harnessem)
// Uruchom: node src/testing/headless/balans-launcher.mjs [--port=7333]
// ───────────────────────────────────────────────────────────────
// CIENKA nakładka na istniejącą ścieżkę uruchomienia: zamiast komendy
// w terminalu — formularz w przeglądarce (metryka / seedy / game-lata / klasa
// planety), przycisk Uruchom, a po zakończeniu link do wygenerowanego raportu
// (`<prefix>-report-<class>.html`). Ten sam ekran co raport → jedna powierzchnia.
//
// ŚWIADOMIE POZA ZAKRESEM (brief): kont, bazy danych, historii uruchomień,
// streamingu postępu na żywo, frameworków. Run → czekaj → otwórz raport.
//
// Nie liczy NICZEGO sam: `spawn` odpala TEN SAM runner co terminal
// (`balans-pop-telemetry.mjs` / `balans-resource-telemetry.mjs`), z tymi samymi
// flagami. Zero stałych balansu, zero wpływu na logikę gry/bota.
// Wszystko w GAME-YEARS (HARD #3).
//
// METRYKI: panel obsługuje każdą metrykę Phase 2 (POP, zasoby, kolejne) — jeden
// rejestr `METRICS` mapuje metrykę na runner i nazwę pliku raportu. Dodanie metryki
// = jeden wpis (runner musi przyjmować --class/--seeds/--gy i zapisywać
// `<prefix>-report-<CLASS>.html` do REPORTS_DIR).
//
// Eksporty (dla keepera): METRICS / parseRunParams / reportFileFor / isSafeReportName /
// runHarness / createLauncherServer. Serwer startuje TYLKO gdy plik jest
// uruchomiony bezpośrednio (import w teście nie nasłuchuje).
// ═══════════════════════════════════════════════════════════════

import { createServer as httpCreateServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const REPORTS_DIR  = join(__dirname, '..', 'reports', 'balans');
export const DEFAULT_PORT = 7333;

// Rejestr metryk. `prefix` jest KONTRAKTEM nazwy pliku runnera (patrz isSafeReportName).
export const METRICS = {
  pop: {
    runner: join(__dirname, 'balans-pop-telemetry.mjs'),
    prefix: 'pop-report',
    label:  'POP — populacja (zdrowa rezerwa vs glut)',
  },
  resources: {
    runner: join(__dirname, 'balans-resource-telemetry.mjs'),
    prefix: 'resource-report',
    label:  'ZASOBY — produkcja / konsumpcja / co wiąże gospodarkę',
  },
  roi: {
    runner: join(__dirname, 'balans-roi-telemetry.mjs'),
    prefix: 'roi-report',
    label:  'ROI — koszt budynku vs to, co budynek daje',
  },
  prices: {
    runner: join(__dirname, 'balans-price-telemetry.mjs'),
    prefix: 'price-report',
    label:  'CENY — audyt cennika + osiągalność (co bramkuje)',
  },
};
export const DEFAULT_METRIC = 'pop';   // domyślna metryka API (kompatybilność wstecz)

// Metryka preselekcjonowana w panelu = NAJNOWSZA (ostatni wpis rejestru). Panel zawsze
// wysyła `metric` jawnie, więc domyślka API (`pop`) zostaje nietknięta — bez dwuznaczności.
// Wyliczane z rejestru, nie wpisane na sztywno: nowa metryka nie wymaga edycji panelu.
export const PANEL_DEFAULT_METRIC = Object.keys(METRICS)[Object.keys(METRICS).length - 1];

// Kompatybilność wstecz: ścieżka runnera POP (pierwsza metryka slice'u).
export const RUNNER_PATH = METRICS.pop.runner;

// Limity wejścia panelu (ochrona przed pomyłką „45000 seedów", nie balans).
export const RUN_LIMITS = {
  SEEDS_MAX:  32,
  GY_MAX:     200,
  TIMEOUT_MS: 20 * 60 * 1000,   // twardy bezpiecznik na zawieszony run
  TAIL_LINES: 24,               // ile ostatnich linii stdout wraca do panelu
  BODY_MAX:   4096,             // limit ciała POST /run
};

// Klasy panelu (GameCore.PLANET_CLASSES + REAL = nieznany klucz ⇒ bez injekcji).
export const PLANET_CLASS_CHOICES = [
  ['REAL',    'REAL — realny generator (bez injekcji złóż)'],
  ['GOOD_FE', 'GOOD_FE — Fe 1.0 (odpowiednik realnego home)'],
  ['MEDIAN',  'MEDIAN — Fe 0.6 (świat wtórnej kolonii)'],
  ['POOR',    'POOR — Fe 0.3 (świat wtórnej kolonii, ubogi)'],
];

// ── Walidacja parametrów (czysta — keeper testuje ją wprost) ─────
export function parseRunParams(raw = {}) {
  const metric = String(raw.metric ?? DEFAULT_METRIC).trim();
  if (!Object.prototype.hasOwnProperty.call(METRICS, metric))
    return { ok: false, error: `metryka: ${Object.keys(METRICS).join(' | ')}` };

  const cls = String(raw.class ?? raw.planetClass ?? 'REAL').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,15}$/.test(cls))
    return { ok: false, error: 'klasa planety: A-Z, 0-9, _ (1-16 znaków, zaczyna literą)' };

  const seeds = Number(raw.seeds ?? 8);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > RUN_LIMITS.SEEDS_MAX)
    return { ok: false, error: `seedy: liczba całkowita 1..${RUN_LIMITS.SEEDS_MAX}` };

  const gy = Number(raw.gy ?? 45);
  if (!Number.isFinite(gy) || gy < 1 || gy > RUN_LIMITS.GY_MAX)
    return { ok: false, error: `game-lata: 1..${RUN_LIMITS.GY_MAX}` };

  return { ok: true, params: { metric, planetClass: cls, seeds, gy } };
}

/** Nazwa pliku raportu (kontrakt runnera: `<prefix>-report-<class>.html`). */
export function reportFileFor(planetClass, metric = DEFAULT_METRIC) {
  const m = METRICS[metric] ?? METRICS[DEFAULT_METRIC];
  return `${m.prefix}-${planetClass}.html`;
}

/** Whitelist nazw serwowanych z katalogu raportów (anty path-traversal).
 *  Wzorzec budowany z rejestru METRICS — nowa metryka NIE wymaga edycji regexpu. */
const REPORT_NAME_RE = new RegExp(
  `^(?:${Object.values(METRICS).map(m => m.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})-[A-Z][A-Z0-9_]{0,15}\\.html$`);
export function isSafeReportName(name) {
  return typeof name === 'string' && REPORT_NAME_RE.test(name);
}

// ── Uruchomienie runnera (spawn bez shella — argumenty jako tablica) ──
export function runHarness(params, opts = {}) {
  const metric     = params.metric ?? DEFAULT_METRIC;
  const runner     = opts.runner ?? (METRICS[metric] ?? METRICS[DEFAULT_METRIC]).runner;
  const reportsDir = opts.reportsDir ?? REPORTS_DIR;
  const timeoutMs  = opts.timeoutMs ?? RUN_LIMITS.TIMEOUT_MS;

  return new Promise((resolve) => {
    const args = [runner, `--class=${params.planetClass}`, `--seeds=${params.seeds}`, `--gy=${params.gy}`];
    const started = Date.now();
    const lines = [];
    let timedOut = false, done = false;

    const collect = (buf) => {
      for (const l of String(buf).split(/\r?\n/)) {
        if (!l.trim()) continue;
        lines.push(l);
        if (lines.length > 400) lines.shift();   // ring — panel i tak bierze ogon
      }
    };

    const finish = (exitCode, errorMsg) => {
      if (done) return; done = true;
      clearTimeout(killer);
      const reportFile = reportFileFor(params.planetClass, metric);
      const reportExists = existsSync(join(reportsDir, reportFile));
      resolve({
        ok: exitCode === 0 && reportExists && !timedOut,
        exitCode, timedOut, error: errorMsg ?? null,
        durationMs: Date.now() - started,
        metric, params, reportFile, reportExists,
        reportUrl: reportExists ? `/report/${reportFile}` : null,
        tail: lines.slice(-RUN_LIMITS.TAIL_LINES),
      });
    };

    let child;
    try {
      child = spawn(process.execPath, args, {
        cwd: dirname(runner),
        env: { ...process.env, KOSMOS_QUIET: '1' },
      });
    } catch (err) { finish(-1, String(err?.message ?? err)); return; }

    const killer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (err) => finish(-1, String(err?.message ?? err)));
    child.on('close', (code) => finish(code ?? -1, timedOut ? `przekroczono limit ${Math.round(timeoutMs / 1000)}s` : null));
  });
}

// ── Serwer (nie nasłuchuje — caller robi .listen) ────────────────
export function createLauncherServer(opts = {}) {
  const reportsDir = opts.reportsDir ?? REPORTS_DIR;
  // ⚠ CELOWO bez domyślnej wartości: `undefined` pozwala `runHarness` wybrać runner
  // z rejestru METRICS wg metryki. Domyślka (np. RUNNER_PATH) nadpisywałaby wybór
  // metryki i panel „Zasoby" odpalałby runner POP.
  const runner     = opts.runner;
  const timeoutMs  = opts.timeoutMs ?? RUN_LIMITS.TIMEOUT_MS;
  let running = false;   // jeden run naraz (harness i tak jest CPU-bound)

  const json = (res, code, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  };

  return httpCreateServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    // Panel
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      const html = renderPanel();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html) });
      res.end(html);
      return;
    }

    // Gotowy raport z dysku (tylko whitelistowane nazwy)
    if (req.method === 'GET' && path.startsWith('/report/')) {
      const name = basename(decodeURIComponent(path.slice('/report/'.length)));
      if (!isSafeReportName(name)) { json(res, 400, { ok: false, error: 'niedozwolona nazwa raportu' }); return; }
      const file = join(reportsDir, name);
      if (!existsSync(file)) { json(res, 404, { ok: false, error: 'brak raportu — uruchom najpierw run' }); return; }
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length });
      res.end(body);
      return;
    }

    // Uruchomienie harnessu
    if (req.method === 'POST' && path === '/run') {
      if (running) { json(res, 409, { ok: false, error: 'run już trwa — poczekaj na zakończenie' }); return; }
      let body = '';
      let tooBig = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > RUN_LIMITS.BODY_MAX) { tooBig = true; req.destroy(); }
      });
      req.on('end', () => {
        if (tooBig) { json(res, 413, { ok: false, error: 'ciało żądania za duże' }); return; }
        let raw = {};
        try { raw = body ? JSON.parse(body) : {}; } catch { json(res, 400, { ok: false, error: 'niepoprawny JSON' }); return; }
        const parsed = parseRunParams(raw);
        if (!parsed.ok) { json(res, 400, { ok: false, error: parsed.error }); return; }

        running = true;
        runHarness(parsed.params, { runner, reportsDir, timeoutMs })
          .then((result) => { running = false; json(res, 200, result); })
          .catch((err)   => { running = false; json(res, 500, { ok: false, error: String(err?.message ?? err) }); });
      });
      return;
    }

    json(res, 404, { ok: false, error: 'nie znaleziono' });
  });
}

// ── Panel (samodzielny HTML: inline CSS + inline JS, zero zewnętrznych zasobów) ──
export function renderPanel() {
  const options = PLANET_CLASS_CHOICES
    .map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
  // Panel preselekcjonuje NAJNOWSZĄ metrykę (PANEL_DEFAULT_METRIC); domyślna metryka API
  // to nadal `pop` (kompatybilność wstecz) — panel zawsze wysyła `metric` jawnie.
  const metricOptions = Object.entries(METRICS)
    .map(([v, m]) => `<option value="${v}"${v === PANEL_DEFAULT_METRIC ? ' selected' : ''}>${m.label}</option>`).join('');
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BALANS 1.0 — launcher</title>
<style>
:root{color-scheme:light dark;
  --surface:#fcfcfb; --plane:#f9f9f7; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --card:#fff; --accent:#2a78d6;}
@media (prefers-color-scheme:dark){:root{
  --surface:#1a1a19; --plane:#0d0d0d; --ink:#fff; --ink2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --card:#161615; --accent:#5aa0f0;}}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--plane);color:var(--ink);
  line-height:1.45;max-width:760px;margin:0 auto;padding:26px 20px 60px}
h1{font-size:21px;margin:0 0 4px;font-weight:650}
.sub{color:var(--ink2);font-size:13px;margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px}
.row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.f{display:flex;flex-direction:column;gap:4px;flex:1 1 150px}
label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
input,select{font:inherit;font-size:14px;padding:7px 9px;border-radius:7px;border:1px solid var(--axis);
  background:var(--surface);color:var(--ink)}
.hint{font-size:11.5px;color:var(--muted);margin:-8px 0 14px}
button{font:inherit;font-weight:640;font-size:14px;padding:9px 20px;border-radius:8px;border:1px solid transparent;
  background:var(--accent);color:#fff;cursor:pointer}
button[disabled]{opacity:.55;cursor:progress}
#status{margin-top:16px;font-size:13.5px;color:var(--ink2);min-height:20px}
#status b{color:var(--ink)}
.err{color:#d03b3b}.good{color:#0ca30c}
a.report{display:inline-block;margin-top:10px;padding:9px 16px;border-radius:8px;font-weight:640;font-size:14px;
  text-decoration:none;background:#0ca30c;color:#fff}
pre{margin-top:14px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;
  font-size:11.5px;color:var(--ink2);overflow-x:auto;white-space:pre;max-height:320px}
footer{margin-top:26px;padding-top:12px;border-top:1px solid var(--grid);color:var(--muted);font-size:11.5px}
</style></head><body>
<h1>BALANS 1.0 — launcher</h1>
<p class="sub">Cienka nakładka na runnery telemetrii Phase 2. Wybierz metrykę, uruchom harness, otwórz raport.
  Jednostka: <b>game-years</b> (1 gy = 12 civ-yr). Instrument read-only — <b>zero stałych balansu</b>.</p>

<div class="card">
  <div class="row">
    <div class="f" style="flex:1 1 100%"><label for="metric">metryka</label><select id="metric">${metricOptions}</select></div>
  </div>
  <div class="row">
    <div class="f"><label for="cls">klasa planety</label><select id="cls">${options}</select></div>
    <div class="f"><label for="seeds">seedy</label><input id="seeds" type="number" min="1" max="${RUN_LIMITS.SEEDS_MAX}" step="1" value="8"></div>
    <div class="f"><label for="gy">game-lata</label><input id="gy" type="number" min="1" max="${RUN_LIMITS.GY_MAX}" step="1" value="45"></div>
  </div>
  <p class="hint">Panel Phase 1/2 = REAL · 8 seedów · 45 gy (kilka minut). Krótki test: 1 seed · 5 gy.</p>
  <button id="run">▶ Uruchom</button>
  <div id="status"></div>
  <div id="out"></div>
</div>

<footer>Runner, bot i stałe gry nietknięte — panel tylko odpala tę samą komendę co terminal.</footer>

<script>
const $ = (id) => document.getElementById(id);
let t0 = 0, timer = null;
function tick() { $('status').innerHTML = '⏳ Trwa run… <b>' + Math.round((Date.now() - t0) / 1000) + ' s</b>'; }
$('run').addEventListener('click', async () => {
  const btn = $('run');
  btn.disabled = true; $('out').innerHTML = '';
  t0 = Date.now(); tick(); timer = setInterval(tick, 500);
  try {
    const res = await fetch('/run', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metric: $('metric').value, class: $('cls').value, seeds: Number($('seeds').value), gy: Number($('gy').value) }),
    });
    const d = await res.json();
    clearInterval(timer);
    const secs = Math.round((d.durationMs ?? (Date.now() - t0)) / 1000);
    if (d.ok) {
      $('status').innerHTML = '<span class="good">✓ Gotowe</span> — ' + secs + ' s, kod wyjścia ' + d.exitCode;
      $('out').innerHTML = '<a class="report" href="' + d.reportUrl + '" target="_blank" rel="noopener">Otwórz raport — ' + d.reportFile + '</a>';
    } else {
      $('status').innerHTML = '<span class="err">✗ Run nieudany</span> — ' + (d.error ? d.error : 'kod wyjścia ' + d.exitCode);
    }
    if (d.tail && d.tail.length) {
      const pre = document.createElement('pre');
      pre.textContent = d.tail.join('\\n');
      $('out').appendChild(pre);
    }
  } catch (err) {
    clearInterval(timer);
    $('status').innerHTML = '<span class="err">✗ Błąd sieci</span> — ' + err;
  } finally { btn.disabled = false; }
});
</script>
</body></html>`;
}

// ── Start tylko przy bezpośrednim uruchomieniu (import w keeperze nie nasłuchuje) ──
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const portArg = process.argv.find(s => s.startsWith('--port='));
  const port = Number(portArg ? portArg.split('=')[1] : (process.env.BALANS_PORT ?? DEFAULT_PORT));
  const server = createLauncherServer();
  server.listen(port, () => {
    console.log('\n═══ BALANS 1.0 — launcher ═══');
    console.log(`  panel:   http://localhost:${port}`);
    for (const [k, m] of Object.entries(METRICS)) console.log(`  runner ${k.padEnd(9)} ${m.runner}`);
    console.log(`  raporty: ${REPORTS_DIR}`);
    console.log('  (Ctrl+C kończy)\n');
  });
}
