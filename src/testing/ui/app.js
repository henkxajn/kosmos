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
  const finalStats = agg.finalStats ?? {};

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

  // Imperium avg stats
  const finalStatBoxes = [
    { label: 'AVG POP', value: finalStats.avg_pop ?? '—', cls: '' },
    { label: 'AVG HOUSING', value: finalStats.avg_housing ?? '—', cls: '' },
    { label: 'AVG PROSPERITY', value: finalStats.avg_prosperity ?? '—', cls: (finalStats.avg_prosperity ?? 0) >= 50 ? 'ok' : 'warn' },
    { label: 'AVG MORALE', value: finalStats.avg_morale ?? '—', cls: '' },
    { label: 'AVG COLONIES', value: finalStats.avg_colonies ?? '—', cls: '' },
    { label: 'AVG TECHS', value: finalStats.avg_techs ?? '—', cls: '' },
    { label: 'AVG BUILDINGS', value: finalStats.avg_buildings ?? '—', cls: '' },
    { label: 'AVG VESSELS', value: finalStats.avg_vessels ?? '—', cls: '' },
    { label: 'AVG CREDITS', value: finalStats.avg_credits ?? '—', cls: '' },
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

  // ── WNIOSKI (najwyższy priorytet — na górze, nad wszystkim) ──
  const conclusions = agg.conclusions ?? [];
  if (conclusions.length > 0) {
    html += `<h3 class="section-title">── WNIOSKI (${conclusions.length})</h3>`;
    html += `<div class="conclusions-list">`;
    for (const c of conclusions) {
      const sevIcon = c.severity === 'critical' ? '🔴' : c.severity === 'warning' ? '🟡' : '🟢';
      html += `<div class="conclusion-card sev-${c.severity}" data-cat="${c.category}">
        <div class="cc-header">
          <span class="cc-sev">${sevIcon} ${c.severity.toUpperCase()}</span>
          <span class="cc-cat">[${c.category}]</span>
          <span class="cc-title">${escapeHtml(c.title)}</span>
        </div>
        <div class="cc-body">
          <div class="cc-evidence"><strong>Dowód:</strong> ${escapeHtml(c.evidence ?? '—')}</div>
          <div class="cc-suggestion"><strong>Sugestia:</strong> ${escapeHtml(c.suggestion ?? '—')}</div>
        </div>
      </div>`;
    }
    html += `</div>`;
  }

  // Final stats — imperium średnie
  html += `<h3 class="section-title">── ŚREDNIE IMPERIUM (KONIEC GRY)</h3>`;
  html += `<div class="report-header-grid">`;
  for (const s of finalStatBoxes) {
    html += `<div class="stat-box"><div class="s-label">${s.label}</div><div class="s-value ${s.cls}">${s.value}</div></div>`;
  }
  html += `</div>`;

  // Event totals
  const evT = agg.eventTotals ?? {};
  const evEntries = Object.entries(evT).filter(([, v]) => typeof v === 'number' && v > 0).sort((a, b) => b[1] - a[1]);
  if (evEntries.length > 0) {
    const maxEv = evEntries[0][1];
    html += `<h3 class="section-title">── WYDARZENIA (SUMA)</h3><div class="bar-chart">`;
    for (const [k, v] of evEntries) {
      const pct = (v / maxEv * 100).toFixed(1);
      const color = k === 'popDied' || k === 'coloniesDestroyed' || k === 'missionsFailed' ? 'var(--danger)' :
                   k === 'popBorn' || k === 'techsResearched' || k === 'coloniesFounded' || k === 'vesselsCreated' ? 'var(--success)' :
                   'var(--accent)';
      html += `<div class="bar-row">
        <div class="bar-label">${k}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,transparent,${color})"></div></div>
        <div class="bar-value">${v}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Shortages
  const shortages = agg.shortageByResource ?? {};
  const shortEntries = Object.entries(shortages).sort((a, b) => b[1] - a[1]);
  if (shortEntries.length > 0) {
    const maxSh = shortEntries[0][1];
    html += `<h3 class="section-title">── BRAKI SUROWCÓW (ILE RAZY)</h3><div class="bar-chart">`;
    for (const [k, v] of shortEntries) {
      const pct = (v / maxSh * 100).toFixed(1);
      html += `<div class="bar-row">
        <div class="bar-label">${k}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,transparent,var(--danger))"></div></div>
        <div class="bar-value">${v}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Ships built
  const ships = agg.shipsBuiltByType ?? {};
  const shipEntries = Object.entries(ships).sort((a, b) => b[1] - a[1]);
  if (shipEntries.length > 0) {
    html += `<h3 class="section-title">── STATKI ZBUDOWANE</h3><div class="bar-chart">`;
    const maxS = shipEntries[0][1];
    for (const [k, v] of shipEntries) {
      const pct = (v / maxS * 100).toFixed(1);
      html += `<div class="bar-row">
        <div class="bar-label">${k}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-value">${v}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Tech by branch
  const techByBranch = agg.techsByBranch ?? {};
  const techEntries = Object.entries(techByBranch).sort((a, b) => b[1] - a[1]);
  if (techEntries.length > 0) {
    html += `<h3 class="section-title">── TECHNOLOGIE PO GAŁĘZIACH</h3><div class="bar-chart">`;
    const maxT = techEntries[0][1];
    for (const [k, v] of techEntries) {
      const pct = (v / maxT * 100).toFixed(1);
      html += `<div class="bar-row">
        <div class="bar-label">${k}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-value">${v}</div>
      </div>`;
    }
    html += `</div>`;
  }

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
    html += `<h3 class="section-title">── WSZYSTKIE GRY (${games.length}) — klik = szczegóły z wykresami</h3>`;
    html += `<table class="games-table">
      <thead><tr>
        <th>ID</th><th>Seed</th><th>Outcome</th><th>Years</th><th>Pop</th><th>Hous</th><th>Prosp</th><th>Bldg</th><th>Techs</th><th>Vess</th><th>Colonies</th><th>Credits</th><th>Errors</th><th>Flags</th>
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
        <td>${fs.housing ?? '?'}</td>
        <td>${fs.prosperity ?? '?'}</td>
        <td>${fs.buildings ?? '?'}</td>
        <td>${fs.techs ?? '?'}</td>
        <td>${fs.vessels?.total ?? 0}</td>
        <td>${fs.colonies ?? 1}</td>
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
  const fs = game.finalState ?? {};
  const es = game.eventSummary ?? {};

  overlay.innerHTML = `
    <div class="game-detail-panel">
      <div class="panel-header">
        <span>GRA: ${game.id} · seed: ${game.seed ?? '?'}</span>
        <button class="btn-small" onclick="this.closest('.game-detail-overlay').remove()">✕</button>
      </div>
      <div class="panel-body">
        <div class="report-header-grid">
          <div class="stat-box"><div class="s-label">OUTCOME</div><div class="s-value ${game.outcome === 'crash' ? 'danger' : 'ok'}">${game.outcome}</div></div>
          <div class="stat-box"><div class="s-label">YEARS</div><div class="s-value">${game.civYearsCompleted?.toFixed?.(0) ?? '?'}</div></div>
          <div class="stat-box"><div class="s-label">POP</div><div class="s-value ${(fs.pop ?? 0) > 5 ? 'ok' : 'warn'}">${fs.pop ?? '?'}</div></div>
          <div class="stat-box"><div class="s-label">HOUSING</div><div class="s-value">${fs.housing ?? '?'}</div></div>
          <div class="stat-box"><div class="s-label">PROSPERITY</div><div class="s-value ${(fs.prosperity ?? 0) >= 50 ? 'ok' : 'warn'}">${fs.prosperity ?? '?'}</div></div>
          <div class="stat-box"><div class="s-label">TECHS</div><div class="s-value">${fs.techs ?? '?'}</div></div>
          <div class="stat-box"><div class="s-label">BUILDINGS</div><div class="s-value">${fs.buildings ?? '?'}</div></div>
          <div class="stat-box"><div class="s-label">VESSELS</div><div class="s-value">${fs.vessels?.total ?? 0}</div></div>
          <div class="stat-box"><div class="s-label">COLONIES</div><div class="s-value">${fs.colonies ?? 1}</div></div>
          <div class="stat-box"><div class="s-label">CREDITS</div><div class="s-value">${fs.credits ?? '?'}</div></div>
        </div>

        ${renderEventSummary(es)}

        ${game.metricsSnapshots?.length ? `
          <h3 class="section-title">── WYKRESY W CZASIE</h3>
          <div id="detail-charts-${game.id}" class="chart-grid"></div>
        ` : ''}

        ${renderSection('AKCJE (udane builds ~' + (es.buildSuccess ?? 0) + '/' + (game.actions?.build ?? 0) + ')', Object.entries(game.actions ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—')}
        ${renderSection('FLAGI', (game.flags ?? []).join(', ') || 'brak')}

        ${game.events?.length ? `
          <h3 class="section-title">── TIMELINE WYDARZEŃ (${game.events.length})</h3>
          <div class="event-timeline">${renderEventTimeline(game.events)}</div>
        ` : ''}

        ${renderFinalStateDetails(fs)}

        ${(game.errors?.length ?? 0) > 0 ? `
          <h3 class="section-title">── BŁĘDY</h3>
          ${game.errors.slice(0, 20).map(e => `
            <div class="crash-item">
              <div class="c-msg">${escapeHtml(e.message ?? '?')}</div>
              <div class="c-meta">civYear: ${e.civYear ?? '?'} ${e.lastAction ? ' · lastAction: ' + e.lastAction.type : ''}</div>
              ${e.stack ? `<pre style="margin:6px 0 0;font-size:10px;color:var(--text-secondary);background:var(--bg-primary);padding:8px;border:1px solid var(--border);overflow-x:auto;">${escapeHtml(e.stack)}</pre>` : ''}
            </div>`).join('')}
        ` : ''}
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Render SVG line charts po dodaniu do DOM
  if (game.metricsSnapshots?.length) {
    const chartsRoot = document.getElementById(`detail-charts-${game.id}`);
    if (chartsRoot) renderMetricsCharts(chartsRoot, game.metricsSnapshots);
  }
}

/** Rozszerzony finalState — przyjazny format (nie JSON raw) */
function renderFinalStateDetails(fs) {
  if (!fs) return '';
  let html = `<h3 class="section-title">── KOLONIE</h3>`;
  if (fs.coloniesList?.length > 0) {
    html += `<table class="games-table"><thead><tr><th>Nazwa</th><th>Home</th><th>POP</th><th>Housing</th><th>Prosperity</th><th>Buildings</th><th>Credits</th></tr></thead><tbody>`;
    for (const c of fs.coloniesList) {
      html += `<tr>
        <td>${c.name}</td>
        <td>${c.isHomePlanet ? '🏛 HOME' : (c.isOutpost ? '⛺ outpost' : '')}</td>
        <td>${c.pop}</td>
        <td>${c.housing}</td>
        <td>${c.prosperity}</td>
        <td>${c.buildings}</td>
        <td>${c.credits}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  if (fs.buildingsByCategory) {
    html += `<h3 class="section-title">── BUDYNKI WG KATEGORII</h3><div class="bar-chart">`;
    const entries = Object.entries(fs.buildingsByCategory).map(([cat, d]) => [cat, d.count ?? 0, d.byId ?? {}]);
    entries.sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] ?? 1;
    for (const [cat, count, byId] of entries) {
      const pct = (count / max * 100).toFixed(1);
      const ids = Object.entries(byId).map(([k,v]) => `${k}×${v}`).join(', ');
      html += `<div class="bar-row">
        <div class="bar-label">${cat}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-value" style="white-space:nowrap">${count}: ${ids}</div>
      </div>`;
    }
    html += `</div>`;
  }

  if (fs.inventory) {
    html += `<h3 class="section-title">── INWENTARZ KOŃCOWY</h3>`;
    const entries = Object.entries(fs.inventory).sort((a, b) => b[1] - a[1]);
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;font-size:11px;">`;
    for (const [k, v] of entries) {
      const rate = fs.rates?.[k] ?? 0;
      const rateColor = rate > 0 ? 'var(--success)' : rate < 0 ? 'var(--danger)' : 'var(--text-dim)';
      html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);padding:6px 10px;">
        <span style="color:var(--text-primary)">${k}:</span> <strong>${v}</strong>
        ${rate !== 0 ? `<span style="color:${rateColor};font-size:10px;margin-left:6px;">${rate > 0 ? '+' : ''}${rate}/y</span>` : ''}
      </div>`;
    }
    html += `</div>`;
  }

  if (fs.empires?.length > 0) {
    html += `<h3 class="section-title">── OBCE IMPERIA</h3>`;
    html += `<table class="games-table"><thead><tr><th>Nazwa</th><th>Archetype</th><th>FSM</th><th>Tech</th><th>Military</th><th>Colonies</th><th>Hostility</th></tr></thead><tbody>`;
    for (const e of fs.empires) {
      const hostColor = e.hostility >= 70 ? 'danger' : e.hostility >= 40 ? 'warn' : 'ok';
      html += `<tr>
        <td>${e.name}</td>
        <td>${e.archetype ?? '?'}</td>
        <td style="color:var(--text-dim)">${e.fsmState}</td>
        <td>${e.tech}</td>
        <td>${e.military}</td>
        <td>${e.colonies}</td>
        <td class="status-${hostColor === 'ok' ? 'ok' : hostColor === 'warn' ? 'warn' : 'fail'}">${e.hostility}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }
  return html;
}

function renderEventSummary(es) {
  if (!es || Object.keys(es).length === 0) return '';
  const pairs = [
    ['🟢 popBorn', es.popBorn], ['🔴 popDied', es.popDied],
    ['🧠 techsResearched', es.techsResearched],
    ['🚀 vesselsCreated', es.vesselsCreated], ['🚀 vesselsLaunched', es.vesselsLaunched],
    ['🏘 coloniesFounded', es.coloniesFounded], ['⛺ outpostsFounded', es.outpostsFounded],
    ['💥 coloniesDestroyed', es.coloniesDestroyed],
    ['🔭 observatoryDiscoveries', es.observatoryDiscoveries],
    ['✅ missionsComplete', es.missionsComplete], ['❌ missionsFailed', es.missionsFailed],
    ['⚡ randomEvents', es.randomEvents], ['🛡 randomEventsBlocked', es.randomEventsBlocked],
    ['🔨 buildSuccess', es.buildSuccess], ['⚒ upgradeSuccess', es.upgradeSuccess],
    ['⚠ shortages', es.shortages],
  ].filter(([, v]) => (v ?? 0) > 0);
  if (pairs.length === 0) return '';
  let html = `<h3 class="section-title">── WYDARZENIA W GRZE</h3>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;font-size:11px;margin-bottom:14px;">`;
  for (const [label, v] of pairs) {
    html += `<div style="background:var(--bg-secondary);border:1px solid var(--border);padding:6px 10px;">
      <span style="color:var(--text-primary)">${label}:</span> <strong>${v}</strong>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function renderEventTimeline(events) {
  if (!events?.length) return '—';
  const grouped = {};
  for (const e of events.slice(0, 100)) {
    const key = e.civYear;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  }
  const iconMap = {
    popBorn: '🟢', popDied: '🔴',
    techResearched: '🧠',
    vesselCreated: '🚀', vesselLaunched: '🚀',
    colonyFounded: '🏘', outpostFounded: '⛺',
    colonyDestroyed: '💥',
    observatoryDiscovered: '🔭',
    missionDisaster: '❌',
    randomEvent: '⚡',
    shortage: '⚠',
    gameOver: '☠',
  };
  const rows = Object.entries(grouped).sort((a, b) => a[0] - b[0]).map(([y, evs]) => {
    const cells = evs.map(e => {
      const icon = iconMap[e.type] ?? '·';
      const detail = e.techId ?? e.bodyName ?? e.resource ?? e.eventId ?? e.reason ?? '';
      return `<span class="tl-event" title="${escapeHtml(e.type + (detail ? ': '+detail : ''))}">${icon}${detail ? ' <span class="tl-det">'+escapeHtml(detail)+'</span>' : ''}</span>`;
    }).join(' ');
    return `<div class="tl-row"><span class="tl-year">y${y}</span><span class="tl-events">${cells}</span></div>`;
  }).join('');
  return rows;
}

/** Render line charts from metricsSnapshots */
function renderMetricsCharts(root, snapshots) {
  if (!snapshots?.length) return;

  const groups = [
    { title: 'POPULACJA', keys: ['pop', 'housing'],
      colors: ['#00ffb4', '#66bbff'] },
    { title: 'BUDYNKI / TECH / KOLONIE / STATKI',
      keys: ['buildings', 'techs', 'colonies', 'vesselsTotal'],
      transform: { vesselsTotal: s => s.vessels?.total ?? 0 },
      colors: ['#ffcc66', '#ff99ff', '#66ffaa', '#ff8888'] },
    { title: 'PROSPERITY / MORALE',
      keys: ['prosperity', 'morale'],
      colors: ['#00ee88', '#ffcc66'] },
    { title: 'FOOD (inventory + rate/y)',
      keys: ['resFood', 'rateFood'],
      colors: ['#66ffaa', '#ffbb66'] },
    { title: 'WATER',
      keys: ['resWater', 'rateWater'],
      colors: ['#66aaff', '#ffbb66'] },
    { title: 'ENERGY FLOW',
      keys: ['energyProduction', 'energyConsumption', 'energyBalance'],
      colors: ['#00ee88', '#ff6666', '#ffcc66'] },
    { title: 'RESEARCH',
      keys: ['research', 'researchRate'],
      colors: ['#ff99ff', '#ffbb66'] },
    { title: 'CREDITS',
      keys: ['credits'],
      colors: ['#ffcc66'] },
  ];

  for (const g of groups) {
    // Przygotuj dane per key
    const series = g.keys.map((k, i) => {
      const data = snapshots.map(s => {
        const v = g.transform?.[k] ? g.transform[k](s) : (s[k] ?? 0);
        return { x: s.civYear, y: v };
      });
      return { name: k, data, color: g.colors[i] };
    });
    const chart = document.createElement('div');
    chart.className = 'chart-box';
    chart.appendChild(renderSVGLineChart(series, g.title));
    root.appendChild(chart);
  }
}

/** Własny SVG line chart — zero deps */
function renderSVGLineChart(series, title) {
  const W = 600, H = 180, PAD = 40;
  const allPoints = series.flatMap(s => s.data);
  if (allPoints.length === 0) {
    const div = document.createElement('div');
    div.innerHTML = `<div class="chart-title">${title}</div><div class="muted">brak danych</div>`;
    return div;
  }
  const xs = allPoints.map(p => p.x);
  const ys = allPoints.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs) || 1;
  let yMin = Math.min(0, ...ys), yMax = Math.max(...ys);
  if (yMax === yMin) yMax = yMin + 1;
  const padY = (yMax - yMin) * 0.1;
  yMin -= padY; yMax += padY;

  const sx = x => PAD + (x - xMin) / (xMax - xMin || 1) * (W - 2*PAD);
  const sy = y => H - PAD - (y - yMin) / (yMax - yMin || 1) * (H - 2*PAD);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'line-chart');

  // Axes
  const zeroY = yMin <= 0 && yMax >= 0 ? sy(0) : null;
  svg.innerHTML = `
    <rect x="0" y="0" width="${W}" height="${H}" fill="var(--bg-primary)" />
    <line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD}" y2="${H-PAD}" stroke="var(--border)"/>
    <line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H-PAD}" stroke="var(--border)"/>
    ${zeroY !== null && zeroY < H-PAD && zeroY > PAD ? `<line x1="${PAD}" y1="${zeroY}" x2="${W-PAD}" y2="${zeroY}" stroke="var(--border-light)" stroke-dasharray="3,3"/>` : ''}
    <text x="${PAD}" y="${PAD-6}" fill="var(--text-dim)" font-size="10" font-family="monospace">${yMax.toFixed(1)}</text>
    <text x="${PAD}" y="${H-PAD+14}" fill="var(--text-dim)" font-size="10" font-family="monospace">${yMin.toFixed(1)} | y${xMin}...y${xMax}</text>
  `;

  // Lines
  for (const s of series) {
    if (s.data.length < 2) continue;
    const d = s.data.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', s.color);
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    // Dots
    for (const p of s.data) {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', sx(p.x).toFixed(1));
      c.setAttribute('cy', sy(p.y).toFixed(1));
      c.setAttribute('r', '2.5');
      c.setAttribute('fill', s.color);
      svg.appendChild(c);
    }
  }

  // Legend
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<div class="chart-title">${title}</div>`;
  wrapper.appendChild(svg);
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  for (const s of series) {
    const lastVal = s.data[s.data.length - 1]?.y ?? 0;
    legend.innerHTML += `<span class="lg-item"><span class="lg-dot" style="background:${s.color}"></span>${s.name} <span class="lg-val">${typeof lastVal === 'number' ? lastVal.toFixed(1) : lastVal}</span></span>`;
  }
  wrapper.appendChild(legend);
  return wrapper;
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
