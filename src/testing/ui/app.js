// ═══════════════════════════════════════════════════════════════
// KOSMOS QA Console — frontend logic (vanilla JS)
// ═══════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────
const state = {
  activeTab: 'run',
  activeRunId: null,
  selectedReport: null,
  logsOffset: 0,
  mode: 'quick',
};

// ── Tab switching ────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
    state.activeTab = tabId;
    if (tabId === 'reports') loadReports();
    if (tabId === 'runs') loadRuns();
  });
});

// ── Bot selection ────────────────────────────────────────────
document.querySelectorAll('input[name="bot"]').forEach(radio => {
  radio.addEventListener('change', updateFormVisibility);
});

// ── Mode selection ──────────────────────────────────────────
document.querySelectorAll('.btn-mode').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.toggle('active', b === btn));
    state.mode = btn.dataset.mode;
    document.getElementById('custom-row').style.display = state.mode === 'custom' ? 'grid' : 'none';
    updateCmdPreview();
  });
});

// ── Custom inputs ───────────────────────────────────────────
['games', 'years', 'seed', 'concurrency'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateCmdPreview);
});

document.getElementById('isolated').addEventListener('change', (e) => {
  document.getElementById('concurrency-row').style.display = e.target.checked ? 'flex' : 'none';
  updateCmdPreview();
});

document.getElementById('script-select').addEventListener('change', updateCmdPreview);
document.getElementById('weights-select').addEventListener('change', updateCmdPreview);

function updateFormVisibility() {
  const bot = document.querySelector('input[name="bot"]:checked')?.value;
  document.getElementById('script-row').classList.toggle('visible', bot === 'scripted');
  document.getElementById('weights-row').classList.toggle('visible', bot === 'evo');
  updateCmdPreview();
}

function buildConfig() {
  const bot = document.querySelector('input[name="bot"]:checked')?.value ?? 'rule';
  const mode = state.mode;
  const config = { bot };
  if (mode === 'custom') {
    config.games = parseInt(document.getElementById('games').value);
    config.years = parseInt(document.getElementById('years').value);
  } else {
    config.mode = mode;
  }
  const seed = document.getElementById('seed').value.trim();
  if (seed) config.seed = seed;
  const isolated = document.getElementById('isolated').checked;
  if (isolated) {
    config.isolated = true;
    config.concurrency = parseInt(document.getElementById('concurrency').value);
  }
  if (bot === 'scripted') {
    const sel = document.getElementById('script-select').value;
    if (sel) config.script = sel;
  }
  if (bot === 'evo') {
    const sel = document.getElementById('weights-select').value;
    if (sel) config.evoWeights = sel;
  }
  config.quiet = true;
  return config;
}

function updateCmdPreview() {
  const cfg = buildConfig();
  const args = ['node', 'src/testing/runner/run.js'];
  for (const [k, v] of Object.entries(cfg)) {
    if (v === true) args.push(`--${k}`);
    else if (v !== false && v !== undefined && v !== null) args.push(`--${k}=${v}`);
  }
  document.getElementById('cmd-preview').textContent = args.join(' ');
}

// ── Start run ───────────────────────────────────────────────
document.getElementById('btn-run').addEventListener('click', async () => {
  const config = buildConfig();
  document.getElementById('btn-run').disabled = true;
  document.getElementById('output-panel').style.display = 'block';
  document.getElementById('output-actions').style.display = 'none';
  document.getElementById('output-log').textContent = '';
  document.getElementById('run-status').textContent = 'uruchamianie...';
  document.getElementById('run-status').className = 'status-badge running';

  try {
    const resp = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
    const { runId } = await resp.json();
    state.activeRunId = runId;
    state.logsOffset = 0;
    pollRun();
  } catch (err) {
    appendLog(`[ERROR] ${err.message}`);
    document.getElementById('run-status').textContent = 'error';
    document.getElementById('run-status').className = 'status-badge error';
    document.getElementById('btn-run').disabled = false;
  }
});

// ── Poll run for updates ────────────────────────────────────
async function pollRun() {
  if (!state.activeRunId) return;
  try {
    const resp = await fetch(`/api/run/${state.activeRunId}?offset=${state.logsOffset}`);
    const data = await resp.json();
    if (data.logs?.length) {
      data.logs.forEach(l => appendLog(l));
      state.logsOffset = data.logsOffset;
    }
    const statusEl = document.getElementById('run-status');
    statusEl.textContent = data.status;
    statusEl.className = `status-badge ${data.status}`;
    if (data.status === 'running') {
      setTimeout(pollRun, 500);
    } else {
      // Done
      document.getElementById('btn-run').disabled = false;
      document.getElementById('output-actions').style.display = 'flex';
      if (data.reportFile) {
        document.getElementById('btn-view-report').onclick = () => {
          document.querySelector('.tab[data-tab="reports"]').click();
          setTimeout(() => loadReports().then(() => selectReport(data.reportFile)), 300);
        };
      } else {
        document.getElementById('btn-view-report').style.display = 'none';
      }
      document.getElementById('btn-new-run').onclick = () => {
        document.getElementById('output-panel').style.display = 'none';
      };
    }
  } catch (err) {
    appendLog(`[POLL ERROR] ${err.message}`);
  }
}

function appendLog(line) {
  const log = document.getElementById('output-log');
  log.textContent += line + '\n';
  log.scrollTop = log.scrollHeight;
}

// ── Reports ─────────────────────────────────────────────────
document.getElementById('btn-refresh-reports').addEventListener('click', loadReports);

async function loadReports() {
  const body = document.getElementById('reports-list-body');
  body.innerHTML = '<div class="muted">Ładowanie...</div>';
  try {
    const resp = await fetch('/api/reports');
    const { reports } = await resp.json();
    if (reports.length === 0) {
      body.innerHTML = '<div class="muted">Brak raportów. Uruchom pierwszy test!</div>';
      return;
    }
    body.innerHTML = '';
    for (const r of reports) {
      const div = document.createElement('div');
      div.className = 'report-item';
      div.dataset.file = r.file;
      div.innerHTML = `
        <div class="ri-name">${r.file}</div>
        <div class="ri-meta">${formatDate(r.mtime)} · ${formatSize(r.size)}</div>
      `;
      div.addEventListener('click', () => selectReport(r.file));
      body.appendChild(div);
    }
    // Lazy-load summary badges
    for (const r of reports) {
      try {
        const rr = await fetch(`/api/report/${r.file}`);
        const d = await rr.json();
        const agg = d.aggregate ?? {};
        const crashCount = agg.crashed ?? 0;
        const badgeClass = crashCount > 0 ? 'crash' : 'ok';
        const badgeText = crashCount > 0 ? `${crashCount} crash` : 'OK';
        const item = body.querySelector(`[data-file="${r.file}"]`);
        if (item) {
          const badge = document.createElement('span');
          badge.className = `ri-badge ${badgeClass}`;
          badge.textContent = `${badgeText} · ${agg.games ?? '?'}g · ${agg.avgYears ?? '?'}y · ${agg.runName ?? ''}`;
          item.appendChild(badge);
        }
      } catch {}
    }
  } catch (err) {
    body.innerHTML = `<div class="muted">Błąd: ${err.message}</div>`;
  }
}

async function selectReport(file) {
  state.selectedReport = file;
  document.querySelectorAll('.report-item').forEach(r => r.classList.toggle('selected', r.dataset.file === file));
  const detail = document.getElementById('report-detail-body');
  detail.innerHTML = '<div class="muted">Ładowanie raportu...</div>';
  try {
    const resp = await fetch(`/api/report/${file}`);
    const data = await resp.json();
    renderReport(data, detail);
  } catch (err) {
    detail.innerHTML = `<div class="muted">Błąd: ${err.message}</div>`;
  }
}

function renderReport(data, root) {
  const agg = data.aggregate ?? {};
  const games = data.games ?? [];
  const crashed = agg.crashed ?? 0;
  const crashRate = agg.crashRate ?? '0.0%';

  const statBoxes = [
    { label: 'GIER', value: agg.games ?? games.length, cls: '' },
    { label: 'CRASHÓW', value: crashed, cls: crashed > 0 ? 'danger' : 'ok' },
    { label: 'CRASH RATE', value: crashRate, cls: crashed > 0 ? 'danger' : 'ok' },
    { label: 'FINISHED', value: agg.finished ?? '?', cls: 'ok' },
    { label: 'GAME OVER', value: agg.gameOver ?? 0, cls: (agg.gameOver ?? 0) > 0 ? 'warn' : '' },
    { label: 'AVG YEARS', value: agg.avgYears ?? '?', cls: '' },
    { label: 'AVG MS/GRA', value: agg.avgMs ?? '?', cls: '' },
    { label: 'TOTAL TIME', value: agg.elapsedMs ? `${(agg.elapsedMs/1000).toFixed(1)}s` : '?', cls: '' },
  ];

  let html = `<div class="report-header-grid">`;
  for (const s of statBoxes) {
    html += `<div class="stat-box"><div class="s-label">${s.label}</div><div class="s-value ${s.cls}">${s.value}</div></div>`;
  }
  html += `</div>`;

  // Meta
  html += `<div style="font-size:11px;color:var(--text-dim);margin-bottom:20px;">
    Run: <span style="color:var(--text-primary)">${agg.runName ?? data.runName ?? '?'}</span>
  </div>`;

  // Actions chart
  const actions = agg.actionTotals ?? {};
  const actionKeys = Object.entries(actions).sort((a, b) => b[1] - a[1]);
  if (actionKeys.length > 0) {
    const maxAct = actionKeys[0][1];
    html += `<h3 class="section-title">── DYSTRYBUCJA AKCJI</h3><div class="bar-chart">`;
    for (const [k, v] of actionKeys) {
      const pct = (v / maxAct * 100).toFixed(1);
      html += `<div class="bar-row">
        <div class="bar-label">${k}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-value">${v}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Flag histogram
  const flags = agg.flagHistogram ?? {};
  const flagKeys = Object.entries(flags).sort((a, b) => b[1] - a[1]);
  if (flagKeys.length > 0) {
    const totalGames = agg.games ?? games.length;
    html += `<h3 class="section-title">── BOTTLENECK FLAGS</h3><div class="bar-chart">`;
    for (const [k, v] of flagKeys) {
      const pct = (v / totalGames * 100).toFixed(0);
      html += `<div class="bar-row">
        <div class="bar-label">${k}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(255,204,102,0.2),var(--warning))"></div></div>
        <div class="bar-value">${v}/${totalGames} (${pct}%)</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Crashes
  const uc = agg.uniqueCrashes ?? [];
  if (uc.length > 0) {
    html += `<h3 class="section-title">── UNIKALNE CRASHY (TOP 10)</h3>`;
    for (const c of uc.slice(0, 10)) {
      html += `<div class="crash-item">
        <div class="c-header">
          <span class="c-count">${c.count}×</span>
          <span class="c-msg">${escapeHtml(c.message)}</span>
        </div>
        <div class="c-meta">
          ${c.lastAction ? `lastAction: ${c.lastAction.type}${c.lastAction.buildingId ? ' ' + c.lastAction.buildingId : ''}` : ''}
          ${c.civYear != null ? ` · civYear: ${typeof c.civYear === 'number' ? c.civYear.toFixed(1) : c.civYear}` : ''}
          ${c.firstGame ? ` · firstGame: ${c.firstGame}` : ''}
        </div>
        ${c.stack ? `<details style="margin-top:6px;"><summary style="color:var(--text-dim);font-size:10px;cursor:pointer;">stack trace</summary><pre style="margin:6px 0 0;font-size:10px;color:var(--text-secondary);background:var(--bg-primary);padding:8px;border:1px solid var(--border);overflow-x:auto;">${escapeHtml(c.stack)}</pre></details>` : ''}
      </div>`;
    }
  }

  // Games table
  if (games.length > 0) {
    html += `<h3 class="section-title">── WSZYSTKIE GRY (${games.length})</h3>`;
    html += `<table class="games-table">
      <thead><tr>
        <th>ID</th><th>Seed</th><th>Outcome</th><th>Years</th><th>Pop</th><th>Bldg</th><th>Techs</th><th>Credits</th><th>Errors</th><th>Flags</th>
      </tr></thead><tbody>`;
    for (const g of games) {
      const outcome = g.outcome ?? '?';
      const ocls = outcome === 'crash' ? 'status-fail' : outcome === 'finished' ? 'status-ok' : 'status-warn';
      const fs = g.finalState ?? {};
      html += `<tr data-game-id="${g.id}">
        <td>${g.id}</td>
        <td style="color:var(--text-dim)">${g.seed ?? '?'}</td>
        <td class="${ocls}">${outcome}</td>
        <td>${g.civYearsCompleted?.toFixed?.(0) ?? '?'}</td>
        <td>${fs.pop ?? '?'}</td>
        <td>${fs.buildings ?? '?'}</td>
        <td>${fs.techs ?? '?'}</td>
        <td>${fs.credits?.toFixed?.(0) ?? '?'}</td>
        <td>${g.errorCount ?? g.errors?.length ?? 0}</td>
        <td style="font-size:10px;color:var(--text-dim)">${(g.flags ?? []).join(', ')}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  root.innerHTML = html;

  // Klik w wiersz gry → modal ze szczegółami
  root.querySelectorAll('.games-table tbody tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const id = tr.dataset.gameId;
      const g = games.find(x => x.id === id);
      if (g) showGameDetail(g);
    });
  });
}

function showGameDetail(game) {
  const overlay = document.createElement('div');
  overlay.className = 'game-detail-overlay';
  overlay.innerHTML = `
    <div class="game-detail-panel">
      <div class="panel-header">
        <span>GRA: ${game.id}</span>
        <button class="btn-small" onclick="this.closest('.game-detail-overlay').remove()">✕</button>
      </div>
      <div class="panel-body">
        <div class="report-header-grid">
          <div class="stat-box"><div class="s-label">OUTCOME</div><div class="s-value ${game.outcome === 'crash' ? 'danger' : 'ok'}">${game.outcome}</div></div>
          <div class="stat-box"><div class="s-label">YEARS</div><div class="s-value">${game.civYearsCompleted?.toFixed?.(0) ?? '?'}</div></div>
          <div class="stat-box"><div class="s-label">ERRORS</div><div class="s-value ${(game.errorCount??0) > 0 ? 'danger' : ''}">${game.errorCount ?? game.errors?.length ?? 0}</div></div>
          <div class="stat-box"><div class="s-label">TIME</div><div class="s-value">${game.elapsedMs ?? '?'}ms</div></div>
        </div>

        ${renderSection('AKCJE', Object.entries(game.actions ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—')}
        ${renderSection('FLAGI', (game.flags ?? []).join(', ') || '—')}

        ${game.metricsSnapshots?.length ? `
          <h3 class="section-title">── METRYKI W CZASIE</h3>
          ${renderMetricsTable(game.metricsSnapshots)}
        ` : ''}

        ${(game.errors?.length ?? 0) > 0 ? `
          <h3 class="section-title">── BŁĘDY</h3>
          ${game.errors.slice(0, 20).map(e => `
            <div class="crash-item">
              <div class="c-msg">${escapeHtml(e.message ?? '?')}</div>
              <div class="c-meta">civYear: ${e.civYear ?? '?'} ${e.lastAction ? ' · lastAction: ' + e.lastAction.type : ''}</div>
              ${e.stack ? `<pre style="margin:6px 0 0;font-size:10px;color:var(--text-secondary);background:var(--bg-primary);padding:8px;border:1px solid var(--border);overflow-x:auto;">${escapeHtml(e.stack)}</pre>` : ''}
            </div>`).join('')}
        ` : ''}

        ${game.finalState ? `
          <h3 class="section-title">── FINAL STATE</h3>
          <pre style="background:var(--bg-primary);border:1px solid var(--border);padding:10px;font-size:11px;">${JSON.stringify(game.finalState, null, 2)}</pre>
        ` : ''}
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function renderSection(title, content) {
  return `<h3 class="section-title">── ${title}</h3><div style="font-size:12px;color:var(--text-primary);padding:4px 0;">${content}</div>`;
}

function renderMetricsTable(snapshots) {
  if (!snapshots.length) return '';
  const keys = Object.keys(snapshots[0]).filter(k => k !== 'civYear');
  let html = `<table class="games-table"><thead><tr><th>civYear</th>`;
  for (const k of keys) html += `<th>${k}</th>`;
  html += `</tr></thead><tbody>`;
  for (const s of snapshots) {
    html += `<tr><td>${s.civYear}</td>`;
    for (const k of keys) html += `<td>${typeof s[k] === 'number' ? s[k].toFixed(1) : s[k] ?? '—'}</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

// ── Runs tab ─────────────────────────────────────────────────
document.getElementById('btn-refresh-runs').addEventListener('click', loadRuns);

async function loadRuns() {
  const body = document.getElementById('runs-list-body');
  body.innerHTML = '<div class="muted">Ładowanie...</div>';
  try {
    const resp = await fetch('/api/runs');
    const { runs } = await resp.json();
    if (runs.length === 0) {
      body.innerHTML = '<div class="muted">Brak aktywnych runów w tej sesji.</div>';
      return;
    }
    body.innerHTML = runs.map(r => `
      <div class="report-item">
        <div class="ri-name">${r.runId} · ${r.config?.bot ?? '?'} · ${r.config?.mode ?? 'custom'}</div>
        <div class="ri-meta">${formatDate(r.startedAt)} · ${r.status}</div>
        <span class="ri-badge ${r.status === 'finished' ? 'ok' : r.status === 'running' ? 'warn' : 'crash'}">${r.status}</span>
        ${r.reportFile ? `<button class="btn-small" onclick="(async()=>{document.querySelector('.tab[data-tab=\\'reports\\']').click();await loadReports();await selectReport('${r.reportFile}');})()">📊 Raport</button>` : ''}
      </div>
    `).join('');
  } catch (err) {
    body.innerHTML = `<div class="muted">Błąd: ${err.message}</div>`;
  }
}

// ── Helpers ──────────────────────────────────────────────────
function formatDate(iso) {
  try { return new Date(iso).toLocaleString('pl-PL'); } catch { return iso; }
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)}KB`;
  return `${(bytes/1024/1024).toFixed(2)}MB`;
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ─────────────────────────────────────────────────────
(async function init() {
  updateFormVisibility();
  updateCmdPreview();

  // Załaduj listę skryptów
  try {
    const resp = await fetch('/api/scripts');
    const { scripts } = await resp.json();
    const sel = document.getElementById('script-select');
    for (const s of scripts) {
      const opt = document.createElement('option');
      opt.value = s.path;
      opt.textContent = s.file;
      sel.appendChild(opt);
    }
  } catch {}

  // EvoWeights — tylko jeśli istnieje
  try {
    const resp = await fetch('/api/report/evo_weights.json');
    if (resp.ok) {
      const sel = document.getElementById('weights-select');
      const opt = document.createElement('option');
      opt.value = 'src/testing/reports/evo_weights.json';
      opt.textContent = 'evo_weights.json (wytrenowane)';
      sel.appendChild(opt);
    }
  } catch {}
})();

// Expose dla onclick w HTML
window.loadReports = loadReports;
window.selectReport = selectReport;
