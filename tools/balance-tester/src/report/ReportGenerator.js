// ReportGenerator — generuje self-contained HTML z Chart.js CDN

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export class ReportGenerator {
  constructor(analysis, bottlenecks, spirals, dominant, pacing, techUsage, config, rawResults) {
    this.analysis = analysis;
    this.bottlenecks = bottlenecks;
    this.spirals = spirals;
    this.dominant = dominant;
    this.pacing = pacing;
    this.techUsage = techUsage;
    this.config = config;
    this._rawResults = rawResults ?? [];
  }

  generate(outputDir) {
    mkdirSync(outputDir, { recursive: true });
    const html = this._buildHTML();
    const path = join(outputDir, 'report.html');
    writeFileSync(path, html, 'utf-8');
    return path;
  }

  _buildHTML() {
    const a = this.analysis;
    const overall = a._overall;
    const comparison = a._comparison;

    // Health score
    const healthScore = this._calcHealthScore();

    return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KOSMOS Balance Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>
${this._getCSS()}
</style>
</head>
<body>

<header>
  <h1>KOSMOS — Balance Report</h1>
  <div class="subtitle">Automatyczny Playtester & Analizator Balansu</div>
  <div class="meta">${new Date().toISOString().slice(0, 10)} | ${overall?.runCount ?? 0} runów | ${this.config.years} lat/run</div>
</header>

<main>

<!-- ═══ EXECUTIVE SUMMARY ═══ -->
<section class="card">
  <h2>Executive Summary</h2>
  <div class="health-score ${healthScore >= 70 ? 'good' : healthScore >= 40 ? 'warn' : 'bad'}">
    <span class="score-value">${healthScore}</span>
    <span class="score-label">/ 100 Health Score</span>
  </div>
  ${this._renderFindings()}
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-num">${overall?.finalPopulation?.mean ?? '-'}</div>
      <div class="stat-label">Avg POP (finał)</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${overall?.finalMorale?.mean ?? '-'}</div>
      <div class="stat-label">Avg Morale</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${overall?.finalTechs?.mean ?? '-'}</div>
      <div class="stat-label">Avg Techs</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${overall?.aliveRate ?? '-'}%</div>
      <div class="stat-label">Survival Rate</div>
    </div>
  </div>
</section>

<!-- ═══ RESOURCE ECONOMY ═══ -->
<section class="card">
  <h2>Ekonomia Surowców</h2>
  <h3>Resource Curves (mean + P10-P90)</h3>
  <canvas id="chartResources" height="300"></canvas>

  <h3>Bottleneck Ranking</h3>
  ${this._renderBottlenecks()}
</section>

<!-- ═══ POPULATION & MORALE ═══ -->
<section class="card">
  <h2>Populacja i Morale</h2>
  <canvas id="chartPopulation" height="250"></canvas>
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-num">${overall?.counters?.popBirths?.mean ?? '-'}</div>
      <div class="stat-label">Avg Births</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${overall?.counters?.popDeaths?.mean ?? '-'}</div>
      <div class="stat-label">Avg Deaths</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${overall?.counters?.crisisUnrest?.mean ?? '-'}</div>
      <div class="stat-label">Avg Unrest</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${overall?.counters?.crisisFamine?.mean ?? '-'}</div>
      <div class="stat-label">Avg Famine</div>
    </div>
  </div>
</section>

<!-- ═══ TECH TREE ═══ -->
<section class="card">
  <h2>Drzewo Technologii</h2>
  ${this._renderTechUsage()}
</section>

<!-- ═══ STRATEGY COMPARISON ═══ -->
<section class="card">
  <h2>Porównanie Strategii</h2>
  ${comparison && comparison.length > 1 ? `<canvas id="chartRadar" height="300"></canvas>` : ''}
  ${this._renderStrategyTable(comparison)}
  ${this._renderDominantFindings()}
</section>

<!-- ═══ PACING ═══ -->
<section class="card">
  <h2>Pacing</h2>
  <div class="stat-grid">
    <div class="stat-box">
      <div class="stat-num">${this.pacing.avgIdleYears ?? '-'}</div>
      <div class="stat-label">Avg Idle Years</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${this.pacing.idlePct ?? '-'}%</div>
      <div class="stat-label">Idle Time %</div>
    </div>
  </div>
  ${this._renderPacingIssues()}
  <h3>Milestone Timing</h3>
  ${this._renderMilestoneTable()}
</section>

<!-- ═══ BOT ACTIVITY SUMMARY ═══ -->
<section class="card">
  <h2>Podsumowanie Aktywności Bota</h2>
  ${this._renderActivitySummary()}
</section>

<!-- ═══ DEATH SPIRALS ═══ -->
<section class="card">
  <h2>Death Spirals</h2>
  <div class="stat-grid">
    <div class="stat-box ${this.spirals.overallRate > 20 ? 'warn' : ''}">
      <div class="stat-num">${this.spirals.overallRate}%</div>
      <div class="stat-label">Overall Spiral Rate</div>
    </div>
  </div>
  ${this._renderSpirals()}
</section>

</main>

<script>
${this._getChartScripts(overall, comparison)}
<\/script>

<footer>
  <p>KOSMOS Balance Tester v1.0 — wygenerowano automatycznie</p>
</footer>

</body>
</html>`;
  }

  // ── Render helpers ──

  _renderFindings() {
    const findings = [];
    // Bottleneck
    if (this.bottlenecks.length > 0) {
      const top = this.bottlenecks[0];
      findings.push(`<span class="badge warn">BOTTLENECK</span> ${top.resource} — w ${top.runsAffectedPct}% runów`);
    }
    // Spirals
    if (this.spirals.overallRate > 15) {
      findings.push(`<span class="badge bad">SPIRAL</span> Death spiral w ${this.spirals.overallRate}% runów`);
    }
    // Dominant
    for (const f of (this.dominant.findings ?? [])) {
      const badge = f.severity === 'CRITICAL' ? 'bad' : 'warn';
      findings.push(`<span class="badge ${badge}">${f.severity}</span> ${f.message}`);
    }
    // Pacing
    for (const p of (this.pacing.pacingIssues ?? []).slice(0, 2)) {
      findings.push(`<span class="badge info">PACING</span> ${p.message}`);
    }
    if (findings.length === 0) {
      return '<p class="findings-ok">Brak krytycznych problemów z balansem.</p>';
    }
    return `<ul class="findings">${findings.map(f => `<li>${f}</li>`).join('')}</ul>`;
  }

  _renderBottlenecks() {
    if (this.bottlenecks.length === 0) return '<p>Brak zidentyfikowanych bottlenecków.</p>';
    return `<table><thead><tr><th>Surowiec</th><th>Runy (%)</th><th>Avg Events</th><th>Severity</th></tr></thead><tbody>
${this.bottlenecks.slice(0, 10).map(b => `<tr>
  <td><strong>${b.resource}</strong></td>
  <td>${b.runsAffectedPct}%</td>
  <td>${b.avgEventsPerRun}</td>
  <td>${b.severity.toFixed(0)}</td>
</tr>`).join('')}
</tbody></table>`;
  }

  _renderTechUsage() {
    const techs = this.techUsage.techs ?? [];
    if (techs.length === 0) return '<p>Brak danych o technologiach.</p>';
    return `<table><thead><tr><th>Tech</th><th>Usage %</th><th>Avg Timing</th><th>Impact</th><th>Status</th></tr></thead><tbody>
${techs.map(t => `<tr class="${t.isDead ? 'dead' : t.isOP ? 'op' : ''}">
  <td>${t.techId}</td>
  <td>${t.usagePct}%</td>
  <td>${t.avgTiming ?? '—'}</td>
  <td>${t.impactPct > 0 ? '+' : ''}${t.impactPct}%</td>
  <td>${t.isDead ? '<span class="badge bad">DEAD</span>' : t.isOP ? '<span class="badge warn">OP</span>' : 'OK'}</td>
</tr>`).join('')}
</tbody></table>`;
  }

  _renderStrategyTable(comparison) {
    if (!comparison || comparison.length === 0) return '';
    return `<table><thead><tr><th>#</th><th>Bot</th><th>Score (avg)</th><th>Avg POP</th><th>Avg Techs</th><th>Avg Morale</th><th>Survival</th></tr></thead><tbody>
${comparison.map((c, i) => `<tr>
  <td>${i + 1}</td>
  <td><strong>${c.botName}</strong></td>
  <td>${c.score.mean}</td>
  <td>${c.avgPop.toFixed(1)}</td>
  <td>${c.avgTechs.toFixed(1)}</td>
  <td>${c.avgMorale.toFixed(0)}</td>
  <td>${c.aliveRate}%</td>
</tr>`).join('')}
</tbody></table>`;
  }

  _renderDominantFindings() {
    const findings = this.dominant.findings ?? [];
    if (findings.length === 0) return '';
    return `<div class="findings-box">${findings.map(f =>
      `<p><span class="badge ${f.severity === 'CRITICAL' ? 'bad' : 'warn'}">${f.severity}</span> ${f.message}</p>` +
      (f.recommendation ? `<p class="recommendation">${f.recommendation}</p>` : '')
    ).join('')}</div>`;
  }

  _renderPacingIssues() {
    const issues = this.pacing.pacingIssues ?? [];
    if (issues.length === 0) return '<p class="findings-ok">Pacing w normie.</p>';
    return `<ul class="findings">${issues.map(p =>
      `<li><span class="badge ${p.severity === 'WARNING' ? 'warn' : 'info'}">${p.severity}</span> ${p.message}</li>`
    ).join('')}</ul>`;
  }

  _renderMilestoneTable() {
    const ms = this.analysis._overall?.milestones;
    if (!ms) return '';
    const rows = Object.entries(ms)
      .filter(([, v]) => v.reachedPct > 0)
      .map(([key, v]) => `<tr><td>${key}</td><td>${v.reachedPct}%</td><td>${v.median ?? '—'}</td><td>${v.p10 ?? '—'}</td><td>${v.p90 ?? '—'}</td></tr>`);
    return `<table><thead><tr><th>Milestone</th><th>Reached %</th><th>Median</th><th>P10</th><th>P90</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  _renderSpirals() {
    const spirals = this.spirals.spirals ?? [];
    if (spirals.length === 0) return '<p class="findings-ok">Brak wykrytych death spirali.</p>';
    return spirals.map(s => `<div class="spiral-card">
      <strong>${s.type}</strong> — ${s.frequency}% runów
      <p>${s.description}</p>
      ${s.avgOnsetYear ? `<p>Avg onset: rok ${s.avgOnsetYear}</p>` : ''}
    </div>`).join('');
  }

  _renderActivitySummary() {
    const o = this.analysis._overall;
    if (!o) return '<p>Brak danych.</p>';
    const c = o.counters ?? {};
    const d = o.decisionSummary ?? {};

    // Główne statystyki ekspedycji i kolonii
    const rows = [
      ['🚀 Ekspedycje wysłane (misje)', c.expeditionsSent?.mean ?? 0, c.expeditionsSent?.min ?? 0, c.expeditionsSent?.max ?? 0],
      ['🔭 Misje rozpoznawcze (recon)', c.reconMissions?.mean ?? 0, c.reconMissions?.min ?? 0, c.reconMissions?.max ?? 0],
      ['💥 Katastrofy ekspedycji', c.expeditionsDisaster?.mean ?? 0, c.expeditionsDisaster?.min ?? 0, c.expeditionsDisaster?.max ?? 0],
      ['🏠 Kolonie założone', c.coloniesFounded?.mean ?? 0, c.coloniesFounded?.min ?? 0, c.coloniesFounded?.max ?? 0],
      ['⛺ Outposty założone', c.outpostsFounded?.mean ?? 0, c.outpostsFounded?.min ?? 0, c.outpostsFounded?.max ?? 0],
      ['🔧 Statki zbudowane', c.shipsBuilt?.mean ?? 0, c.shipsBuilt?.min ?? 0, c.shipsBuilt?.max ?? 0],
      ['🏗️ Budynki postawione', c.totalBuildings?.mean ?? 0, c.totalBuildings?.min ?? 0, c.totalBuildings?.max ?? 0],
      ['⬆️ Ulepszenia budynków', c.totalUpgrades?.mean ?? 0, c.totalUpgrades?.min ?? 0, c.totalUpgrades?.max ?? 0],
      ['🗑️ Budynki rozebrane', c.totalDemolished?.mean ?? 0, c.totalDemolished?.min ?? 0, c.totalDemolished?.max ?? 0],
      ['🔬 Technologie zbadane', c.techsResearched?.mean ?? 0, c.techsResearched?.min ?? 0, c.techsResearched?.max ?? 0],
      ['👶 Narodziny POPów', c.popBirths?.mean ?? 0, c.popBirths?.min ?? 0, c.popBirths?.max ?? 0],
      ['💀 Śmierci POPów', c.popDeaths?.mean ?? 0, c.popDeaths?.min ?? 0, c.popDeaths?.max ?? 0],
    ];

    const tableRows = rows.map(([label, mean, min, max]) =>
      `<tr><td>${label}</td><td><strong>${typeof mean === 'number' ? mean.toFixed(1) : mean}</strong></td><td>${typeof min === 'number' ? min : min}</td><td>${typeof max === 'number' ? max : max}</td></tr>`
    ).join('');

    return `
    <table>
      <thead><tr><th>Metryka</th><th>Średnia</th><th>Min</th><th>Max</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <h3>Podział decyzji bota</h3>
    ${this._renderDecisionSummary()}`;
  }

  _renderDecisionSummary() {
    const o = this.analysis._overall;
    if (!o) return '';
    // Oblicz z raw results
    const results = this._getRawResults();
    if (!results || results.length === 0) return '';

    const totals = { totalDecisions: 0, buildDecisions: 0, techDecisions: 0, expeditionDecisions: 0, factoryDecisions: 0, idleYears: 0 };
    for (const r of results) {
      const d = r.decisionSummary ?? {};
      for (const k of Object.keys(totals)) totals[k] += (d[k] ?? 0);
    }
    const n = results.length;
    const items = [
      ['Budowa / Upgrade', totals.buildDecisions, totals.totalDecisions],
      ['Technologie', totals.techDecisions, totals.totalDecisions],
      ['Ekspedycje', totals.expeditionDecisions, totals.totalDecisions],
      ['Fabryka', totals.factoryDecisions, totals.totalDecisions],
      ['Idle (brak akcji)', totals.idleYears, totals.totalDecisions + totals.idleYears],
    ];

    return `<div class="stat-grid">${items.map(([label, count, total]) => {
      const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
      const avg = (count / n).toFixed(1);
      return `<div class="stat-box"><div class="stat-num">${pct}%</div><div class="stat-label">${label}<br><small>(avg ${avg}/run)</small></div></div>`;
    }).join('')}</div>`;
  }

  _getRawResults() {
    return this._rawResults ?? [];
  }

  // ── Health Score ──
  _calcHealthScore() {
    let score = 100;
    const o = this.analysis._overall;
    if (!o) return 0;

    // Deductions
    if (o.aliveRate < 100) score -= (100 - o.aliveRate) * 0.5;
    if (o.stableRate < 80) score -= (80 - o.stableRate) * 0.3;
    if (this.spirals.overallRate > 10) score -= this.spirals.overallRate * 0.5;
    if (this.bottlenecks.length > 0 && this.bottlenecks[0].runsAffectedPct > 50) score -= 10;
    if (this.pacing.idlePct > 20) score -= 10;
    for (const f of (this.dominant.findings ?? [])) {
      if (f.severity === 'CRITICAL') score -= 15;
      else if (f.severity === 'WARNING') score -= 8;
    }
    for (const t of (this.techUsage.deadTechs ?? [])) score -= 3;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ── Chart.js scripts ──
  _getChartScripts(overall, comparison) {
    const ts = overall?.timeSeriesAgg;
    if (!ts) return '';

    const years = JSON.stringify(ts.gameYear ?? []);

    // Resource chart (food, water, Fe)
    const foodMean = JSON.stringify(ts.food?.mean ?? []);
    const foodP10 = JSON.stringify(ts.food?.p10 ?? []);
    const foodP90 = JSON.stringify(ts.food?.p90 ?? []);
    const waterMean = JSON.stringify(ts.water?.mean ?? []);
    const feMean = JSON.stringify(ts.Fe?.mean ?? []);
    const energyMean = JSON.stringify(ts.energyBalance?.mean ?? []);

    // Population chart
    const popMean = JSON.stringify(ts.population?.mean ?? []);
    const popP10 = JSON.stringify(ts.population?.p10 ?? []);
    const popP90 = JSON.stringify(ts.population?.p90 ?? []);
    const moraleMean = JSON.stringify(ts.morale?.mean ?? []);

    let radarScript = '';
    if (comparison && comparison.length > 1) {
      const labels = JSON.stringify(['POP', 'Techs', 'Morale', 'Score', 'Survival']);
      const datasets = comparison.map(c => {
        const maxScore = Math.max(...comparison.map(cc => cc.score.mean));
        return `{
          label: '${c.botName}',
          data: [${(c.avgPop / 50 * 100).toFixed(0)}, ${(c.avgTechs / 13 * 100).toFixed(0)}, ${c.avgMorale.toFixed(0)}, ${(c.score.mean / (maxScore || 1) * 100).toFixed(0)}, ${c.aliveRate}],
          borderWidth: 2, fill: true, backgroundColor: 'rgba(${this._botColor(c.botName)}, 0.1)', borderColor: 'rgba(${this._botColor(c.botName)}, 0.8)'
        }`;
      });
      radarScript = `
new Chart(document.getElementById('chartRadar'), {
  type: 'radar',
  data: { labels: ${labels}, datasets: [${datasets.join(',')}] },
  options: { scales: { r: { beginAtZero: true, max: 100, ticks: { color: '#888' }, grid: { color: '#333' }, pointLabels: { color: '#ccc' } } }, plugins: { legend: { labels: { color: '#ccc' } } } }
});`;
    }

    return `
new Chart(document.getElementById('chartResources'), {
  type: 'line',
  data: {
    labels: ${years},
    datasets: [
      { label: 'Food (mean)', data: ${foodMean}, borderColor: '#4CAF50', fill: false, tension: 0.3 },
      { label: 'Food P10-P90', data: ${foodP10}, borderColor: 'transparent', backgroundColor: 'rgba(76,175,80,0.1)', fill: '+1', pointRadius: 0 },
      { label: '', data: ${foodP90}, borderColor: 'transparent', fill: false, pointRadius: 0 },
      { label: 'Water (mean)', data: ${waterMean}, borderColor: '#2196F3', fill: false, tension: 0.3 },
      { label: 'Fe (mean)', data: ${feMean}, borderColor: '#FF9800', fill: false, tension: 0.3 },
      { label: 'Energy (mean)', data: ${energyMean}, borderColor: '#FFD700', fill: false, tension: 0.3 },
    ]
  },
  options: { scales: { x: { ticks: { color: '#888' }, grid: { color: '#222' } }, y: { ticks: { color: '#888' }, grid: { color: '#222' } } }, plugins: { legend: { labels: { color: '#ccc' } } } }
});

new Chart(document.getElementById('chartPopulation'), {
  type: 'line',
  data: {
    labels: ${years},
    datasets: [
      { label: 'Population (mean)', data: ${popMean}, borderColor: '#E91E63', fill: false, tension: 0.3 },
      { label: 'Pop P10', data: ${popP10}, borderColor: 'transparent', backgroundColor: 'rgba(233,30,99,0.1)', fill: '+1', pointRadius: 0 },
      { label: 'Pop P90', data: ${popP90}, borderColor: 'transparent', fill: false, pointRadius: 0 },
      { label: 'Morale (mean)', data: ${moraleMean}, borderColor: '#9C27B0', fill: false, tension: 0.3, yAxisID: 'y1' },
    ]
  },
  options: { scales: { x: { ticks: { color: '#888' }, grid: { color: '#222' } }, y: { ticks: { color: '#888' }, grid: { color: '#222' } }, y1: { position: 'right', min: 0, max: 100, ticks: { color: '#9C27B0' }, grid: { drawOnChartArea: false } } }, plugins: { legend: { labels: { color: '#ccc' } } } }
});

${radarScript}
`;
  }

  _botColor(name) {
    const colors = {
      BalancedBot: '76,175,80',
      RushBot: '244,67,54',
      TurtleBot: '33,150,243',
      GreedyMinerBot: '255,152,0',
      ScienceBot: '156,39,176',
      RandomBot: '158,158,158',
    };
    return colors[name] ?? '200,200,200';
  }

  _getCSS() {
    return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0a1a; color: #ddd; padding: 20px; max-width: 1200px; margin: 0 auto; }
header { text-align: center; padding: 30px 0; border-bottom: 1px solid #333; margin-bottom: 30px; }
h1 { color: #FFD700; font-size: 2.2em; letter-spacing: 2px; }
.subtitle { color: #888; font-size: 1.1em; margin-top: 5px; }
.meta { color: #666; font-size: 0.9em; margin-top: 8px; }
h2 { color: #FFD700; font-size: 1.4em; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 8px; }
h3 { color: #ccc; font-size: 1.1em; margin: 15px 0 10px; }
.card { background: #111; border: 1px solid #222; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
.health-score { text-align: center; padding: 20px; margin-bottom: 15px; }
.health-score .score-value { font-size: 3em; font-weight: bold; }
.health-score .score-label { font-size: 1.1em; color: #888; margin-left: 10px; }
.health-score.good .score-value { color: #4CAF50; }
.health-score.warn .score-value { color: #FF9800; }
.health-score.bad .score-value { color: #F44336; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 15px 0; }
.stat-box { background: #1a1a2e; border: 1px solid #333; border-radius: 6px; padding: 12px; text-align: center; }
.stat-box.warn { border-color: #FF9800; }
.stat-num { font-size: 1.8em; font-weight: bold; color: #FFD700; }
.stat-label { font-size: 0.85em; color: #888; margin-top: 4px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em; }
th { background: #1a1a2e; color: #FFD700; padding: 8px 10px; text-align: left; }
td { padding: 6px 10px; border-bottom: 1px solid #222; }
tr:hover { background: #1a1a2e; }
tr.dead td { color: #F44336; }
tr.op td { color: #FF9800; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; font-weight: bold; margin-right: 5px; }
.badge.warn { background: #FF9800; color: #000; }
.badge.bad { background: #F44336; color: #fff; }
.badge.info { background: #2196F3; color: #fff; }
.findings { list-style: none; padding: 0; }
.findings li { padding: 6px 0; border-bottom: 1px solid #222; }
.findings-ok { color: #4CAF50; font-style: italic; }
.findings-box { background: #1a1a1a; border-left: 3px solid #FF9800; padding: 12px; margin: 10px 0; border-radius: 4px; }
.recommendation { color: #888; font-style: italic; margin-top: 4px; }
.spiral-card { background: #1a1a2e; border: 1px solid #333; border-radius: 6px; padding: 12px; margin: 8px 0; }
canvas { max-width: 100%; margin: 10px 0; }
footer { text-align: center; color: #444; padding: 20px; font-size: 0.8em; }
`;
  }
}
