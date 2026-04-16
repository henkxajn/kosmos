#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// KOSMOS QA UI — lokalny HTTP server dla narzędzia wizualnego
// ─────────────────────────────────────────────────────────────
// Zero dependencies (tylko node:http + node:fs + node:child_process).
// Uruchom: node src/testing/ui/server.js
// Otwórz:  http://localhost:4455
// ═══════════════════════════════════════════════════════════════

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const REPORTS_DIR  = path.join(PROJECT_ROOT, 'src/testing/reports');
const SCRIPTS_DIR  = path.join(PROJECT_ROOT, 'src/testing/scripts');
const RUNNER_PATH  = path.join(PROJECT_ROOT, 'src/testing/runner/run.js');
const UI_DIR       = __dirname;

const PORT = parseInt(process.env.KOSMOS_UI_PORT || '4455');

// ── In-memory store dla aktywnych/zakończonych runów ────────────────
const runs = new Map(); // runId → { status, logs, reportFile, startedAt, config, exitCode }

// ── MIME types ──────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

// ── Helpers ─────────────────────────────────────────────────────────
function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function sendText(res, text, contentType = 'text/plain; charset=utf-8', status = 200) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}
function sendError(res, status, msg) {
  sendJSON(res, { error: msg }, status);
}
function sendFile(res, filePath, contentType) {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    sendError(res, 404, `File not found: ${filePath}`);
  }
}
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function listReports() {
  try {
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json') && f.startsWith('run-'))
      .map(f => {
        const full = path.join(REPORTS_DIR, f);
        const stat = fs.statSync(full);
        return { file: f, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    return files;
  } catch (err) {
    return [];
  }
}
function listScripts() {
  try {
    return fs.readdirSync(SCRIPTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ file: f, path: path.join(SCRIPTS_DIR, f) }));
  } catch (err) {
    return [];
  }
}

// ── Uruchomienie runu ───────────────────────────────────────────────
function startRun(config) {
  const runId = randomUUID().slice(0, 8);
  const runState = {
    runId,
    status: 'running',
    logs: [],
    reportFile: null,
    startedAt: new Date().toISOString(),
    config,
    exitCode: null,
  };
  runs.set(runId, runState);

  // Zapamiętaj mtime najnowszego pliku PRZED runem, żeby wykryć nowy
  const preExistingFiles = new Set(listReports().map(r => r.file));

  // Zbuduj argumenty CLI
  const args = [RUNNER_PATH];
  if (config.mode)        args.push(`--mode=${config.mode}`);
  if (config.games)       args.push(`--games=${config.games}`);
  if (config.years)       args.push(`--years=${config.years}`);
  if (config.bot)         args.push(`--bot=${config.bot}`);
  if (config.seed)        args.push(`--seed=${config.seed}`);
  if (config.scenario)    args.push(`--scenario=${config.scenario}`);
  if (config.isolated)    args.push('--isolated');
  if (config.concurrency) args.push(`--concurrency=${config.concurrency}`);
  if (config.quiet)       args.push('--quiet');
  if (config.script)      args.push(`--script=${config.script}`);
  if (config.evoWeights)  args.push(`--evo-weights=${config.evoWeights}`);

  runState.logs.push(`$ node ${args.join(' ')}`);

  const child = spawn('node', args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, KOSMOS_QUIET: '1' },
  });

  child.stdout.on('data', chunk => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) runState.logs.push(line);
    }
  });
  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) runState.logs.push(`[stderr] ${line}`);
    }
  });
  child.on('error', err => {
    runState.logs.push(`[ERROR] ${err.message}`);
    runState.status = 'error';
  });
  child.on('exit', code => {
    runState.exitCode = code;
    runState.status = code === 0 ? 'finished' : 'crashed';
    // Znajdź nowy plik JSON raportu utworzony podczas runu
    const currentFiles = listReports();
    const newFile = currentFiles.find(r => !preExistingFiles.has(r.file));
    if (newFile) runState.reportFile = newFile.file;
    runState.logs.push(`[done] exit code: ${code}, report: ${runState.reportFile ?? 'none'}`);
  });

  return runId;
}

// ── Routing ─────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    // CORS — tylko local dev, but safe default
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ── Static files ──
    if (pathname === '/' || pathname === '/index.html') {
      return sendFile(res, path.join(UI_DIR, 'index.html'), MIME['.html']);
    }
    if (pathname === '/style.css') return sendFile(res, path.join(UI_DIR, 'style.css'), MIME['.css']);
    if (pathname === '/app.js')    return sendFile(res, path.join(UI_DIR, 'app.js'),    MIME['.js']);

    // ── API ──

    // GET /api/reports — lista raportów
    if (pathname === '/api/reports' && req.method === 'GET') {
      return sendJSON(res, { reports: listReports() });
    }

    // GET /api/report/:file — pobierz raport
    if (pathname.startsWith('/api/report/') && req.method === 'GET') {
      const file = decodeURIComponent(pathname.slice('/api/report/'.length));
      // Security: deny path traversal
      if (file.includes('..') || file.includes('/') || file.includes('\\')) {
        return sendError(res, 400, 'invalid filename');
      }
      const full = path.join(REPORTS_DIR, file);
      if (!fs.existsSync(full)) return sendError(res, 404, 'report not found');
      return sendFile(res, full, MIME['.json']);
    }

    // GET /api/scripts — lista dostępnych ScriptedBot skryptów
    if (pathname === '/api/scripts' && req.method === 'GET') {
      return sendJSON(res, { scripts: listScripts() });
    }

    // POST /api/run — uruchom test
    if (pathname === '/api/run' && req.method === 'POST') {
      const body = await readBody(req);
      const runId = startRun(body);
      return sendJSON(res, { runId });
    }

    // GET /api/run/:id — status runa (polling)
    if (pathname.startsWith('/api/run/') && req.method === 'GET') {
      const runId = pathname.slice('/api/run/'.length);
      const state = runs.get(runId);
      if (!state) return sendError(res, 404, 'run not found');
      // Wyślij tylko ostatnie N logów (żeby nie wysyłać GB przez HTTP)
      const offset = parseInt(url.searchParams.get('offset') ?? '0');
      const logs = state.logs.slice(offset);
      return sendJSON(res, {
        runId,
        status: state.status,
        exitCode: state.exitCode,
        startedAt: state.startedAt,
        reportFile: state.reportFile,
        logsOffset: state.logs.length,
        logs,
      });
    }

    // GET /api/runs — lista aktywnych/ostatnich runów
    if (pathname === '/api/runs' && req.method === 'GET') {
      const list = Array.from(runs.values()).map(r => ({
        runId: r.runId,
        status: r.status,
        startedAt: r.startedAt,
        reportFile: r.reportFile,
        config: r.config,
      }));
      return sendJSON(res, { runs: list });
    }

    return sendError(res, 404, `no route: ${req.method} ${pathname}`);

  } catch (err) {
    console.error('[server]', err);
    return sendError(res, 500, err?.message ?? String(err));
  }
});

server.listen(PORT, () => {
  console.log(`╔════════════════════════════════════════════╗`);
  console.log(`║  KOSMOS QA Console                         ║`);
  console.log(`║  http://localhost:${PORT}                        ║`);
  console.log(`║  reports: ${REPORTS_DIR.slice(-36).padEnd(34)} ║`);
  console.log(`╚════════════════════════════════════════════╝`);
  console.log(`Press Ctrl+C to stop`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down KOSMOS QA Console...');
  server.close();
  process.exit(0);
});
