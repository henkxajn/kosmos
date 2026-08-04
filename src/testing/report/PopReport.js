// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — PopReport (HTML raport, POP section)
// ───────────────────────────────────────────────────────────────
// Czysta funkcja renderPopReport(data) → samodzielny HTML string (inline
// CSS + inline SVG, ZERO zewnętrznych zależności — plik otwieralny offline).
// `data` = payload z balans-pop-telemetry.mjs (meta / seeds[] / panel).
//
// To SZKIELET Phase 2 — kolejne metryki (per-resource, ROI, ceny) wepną
// się w tę samą strukturę (sekcja + karty small-multiples). Trzymamy prosto
// i UCZCIWIE (brief): pokazujemy realną podstawę klasyfikacji, nie iluzję
// kompletności.
//
// Kolory = STATUS palette (dataviz skill, reserved): buffer=good, wasted=
// critical, bound=warning, tight/employed=neutral. buffer↔wasted są red-green
// (CVD ΔE 4.1) → NIGDY sam kolor: legenda+etykiety+werdykt tekstem+stała
// kolejność+TEKSTURA (ukośna kreska na „wasted"). Status = fixed (nie themowane).
// ═══════════════════════════════════════════════════════════════

// Kolory klas (status palette — fixed w obu trybach).
const CLASS_COLOR = {
  buffer: '#0ca30c',  // good
  wasted: '#d03b3b',  // critical
  bound:  '#fab219',  // warning
  tight:  '#8a8980',  // neutral (brak nadwyżki)
};
const CLASS_LABEL = {
  buffer: 'Buffer (zdrowa rezerwa)',
  wasted: 'Wasted (realny glut)',
  bound:  'Bound (POP-limited)',
  tight:  'Tight (brak luzu)',
};
const CLASS_ICON = { buffer: '✓', wasted: '✕', bound: '▲', tight: '·' };

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

// ── Główny render ────────────────────────────────────────────────
export function renderPopReport(data) {
  const meta = data?.meta ?? {};
  const seeds = data?.seeds ?? [];
  const panel = data?.panel ?? {};
  const verdict = panel.verdict ?? { outcome: 0, label: '—' };

  // Wspólny y-max (uczciwe porównanie między seedami) = max pop w całym panelu.
  let yMax = 1;
  for (const s of seeds) for (const r of (s.series ?? [])) yMax = Math.max(yMax, r.pop ?? 0);

  const verdictClass = verdict.outcome === 1 ? 'buffer' : verdict.outcome === 2 ? 'wasted'
    : verdict.outcome === 3 ? 'tight' : 'bound';

  return `<div class="viz-root">
${STYLE}
${HATCH_DEFS}
<header class="rp-head">
  <h1>BALANS 1.0 — Phase 2 · POP telemetry</h1>
  <p class="rp-meta">
    class <b>${esc(meta.planetClass ?? '?')}</b> · ${esc(String(meta.seeds ?? seeds.length))} seedów ·
    ${esc(String(meta.targetGy ?? '?'))} game-lat · jednostka: <b>game-years</b> (1 gy = 12 civ-yr) ·
    read-only instrument, <b>zero stałych balansu</b>
  </p>
</header>

${renderVerdict(panel, verdict, verdictClass)}

${renderMethodology(seeds, meta)}

${renderLegend()}

${renderAggregate(seeds)}

${renderTable(seeds)}

<h2 class="rp-h2">Per-seed — POP w czasie (employed / surplus wg klasy)</h2>
<p class="rp-note">Słupek = populacja danego roku: <b>employed</b> (szary) + <b>surplus</b> (kolor klasy).
  Wspólna skala Y (max ${yMax}) — seedy porównywalne. Wstążka „klasa" pod wykresem; wstążka „nogi" pokazuje,
  które ujście działa (absorpcja / ekspansja). Cienka linia = zabudowa % (inertna — patrz metodologia).</p>
<div class="rp-grid">
${seeds.map(s => renderSeedCard(s, yMax)).join('\n')}
</div>

<footer class="rp-foot">
  <p>${esc(meta.tool ?? 'BALANS 1.0 Phase 2 — POP telemetry')} · classifier: ${esc(meta.classifier ?? 'outlet-based (OR)')}</p>
  <p>${esc(meta.note ?? '')}</p>
</footer>
</div>`;
}

// ── Werdykt (banner + KPI tiles) ─────────────────────────────────
function renderVerdict(panel, verdict, verdictClass) {
  const outcomeText = {
    1: 'Metryka mierzyła zły sygnał — finding #1 to false alarm (drop)',
    2: 'Realny glut bez ujścia — bot gra inaczej niż gracz',
    3: 'Glut zniknął — nadwyżki prawie nie ma',
    0: 'Mieszane — brak dominującej klasy',
  }[verdict.outcome] ?? '';
  const tiles = [
    ['Lata z nadwyżką', `${panel.surplusYears ?? 0} / ${panel.totalYears ?? 0}`, pct(panel.surplusRate)],
    ['BUFFER (ujście)', pct(panel.bufferShare), `${panel.bufferYears ?? 0} lat`, 'buffer'],
    ['WASTED (glut)', pct(panel.wastedShare), `${panel.wastedYears ?? 0} lat`, 'wasted'],
    ['BOUND (POP-limited)', String(panel.boundYears ?? 0), 'lat', 'bound'],
  ];
  return `<section class="rp-verdict rp-${verdictClass}">
  <div class="rp-verdict-head">
    <span class="rp-badge rp-${verdictClass}">${CLASS_ICON[verdictClass] ?? ''} Outcome ${esc(String(verdict.outcome))}</span>
    <h2>${esc(verdict.label ?? '')}</h2>
  </div>
  <p class="rp-verdict-sub">${esc(outcomeText)}</p>
  <div class="rp-tiles">
    ${tiles.map(([lab, big, sub, cls]) => `<div class="rp-tile">
      <span class="rp-tile-lab">${esc(lab)}</span>
      <span class="rp-tile-big${cls ? ' rp-ink-' + cls : ''}">${esc(big)}</span>
      <span class="rp-tile-sub">${esc(sub)}</span>
    </div>`).join('')}
  </div>
</section>`;
}

// ── Metodologia (WYMAGANE): zabudowa inertna, klasyfikacja stoi na 2 nogach ──
function renderMethodology(seeds, meta) {
  // Realny zakres zabudowy z danych (pokaż że nigdy nie sięga progu).
  let boMin = 1, boMax = 0, buildable = 0;
  for (const s of seeds) for (const r of (s.series ?? [])) {
    if (typeof r.buildOutFrac === 'number') { boMin = Math.min(boMin, r.buildOutFrac); boMax = Math.max(boMax, r.buildOutFrac); }
    buildable = Math.max(buildable, r.buildableTiles ?? 0);
  }
  const thr = meta.thresholds ?? {};
  return `<section class="rp-method">
  <h3>⚠ Metodologia — na czym NAPRAWDĘ stoi klasyfikacja</h3>
  <p>Reguła jest <b>outlet-based (OR)</b> z trzema sygnałami ujścia: <b>zabudowa</b> (≥${pct(thr.BUILT_OUT_FRAC ?? 0.8)} kafli),
     <b>ekspansja</b>, <b>absorpcja</b> (etaty ludzkie rosną rok-do-roku). Ale przy tej skali mapy
     <b>noga „zabudowa" jest INERTNA — nigdy nie odpala</b>: mapy heksowe mają ~${buildable} zabudowywalnych
     kafli, których ani bot, ani gracz nie zapełnia (realny zakres w tym panelu: ${pct(boMin)}–${pct(boMax)}).</p>
  <p><b>Operacyjnie klasyfikacja stoi więc na DWÓCH nogach: ekspansja + absorpcja</b> — nie trzech.
     Sygnał zabudowy zostaje policzony i pokazany per-row (kompletność), ale <b>nie jest tu aktywnym sygnałem</b>.
     To świadoma granica pomiaru, nie iluzja kompletności — jak zamknięcie Phase 1 na uczciwym 7/8.</p>
</section>`;
}

// ── Legenda (kolor + ikona + etykieta — nigdy sam kolor) ─────────
function renderLegend() {
  const items = ['buffer', 'wasted', 'bound', 'tight'].map(c => {
    const sw = c === 'wasted'
      ? `<span class="rp-sw" style="background:${CLASS_COLOR[c]};background-image:${HATCH_CSS}"></span>`
      : `<span class="rp-sw" style="background:${CLASS_COLOR[c]}"></span>`;
    return `<span class="rp-leg-item">${sw}<b>${CLASS_ICON[c]}</b> ${esc(CLASS_LABEL[c])}</span>`;
  }).join('');
  return `<div class="rp-legend">${items}
    <span class="rp-leg-item"><span class="rp-sw rp-sw-emp"></span> Employed (obsadzeni)</span>
  </div>`;
}

// ── Agregat: poziome słupki per seed (buffer|bound|wasted lat nadwyżkowych) ──
function renderAggregate(seeds) {
  const W = 640, rowH = 26, padL = 120, padR = 60, barW = W - padL - padR;
  let maxSurplus = 1;
  for (const s of seeds) maxSurplus = Math.max(maxSurplus, s.summary?.surplusYears ?? 0);
  const rows = seeds.map((s, i) => {
    const m = s.summary ?? {};
    const y = i * rowH;
    const scale = (n) => (n / maxSurplus) * barW;
    const bufW = scale(m.bufferYears ?? 0), bndW = scale(m.boundYears ?? 0), wasW = scale(m.wastedYears ?? 0);
    let x = padL;
    const seg = (w, cls, n) => {
      if (w <= 0) return '';
      const fill = cls === 'wasted' ? 'url(#hatchWasted)' : CLASS_COLOR[cls];
      const r = `<rect x="${x + 1}" y="${y + 4}" width="${Math.max(0, w - 2)}" height="${rowH - 10}" rx="2" fill="${fill}"><title>${esc(s.seed)} — ${CLASS_LABEL[cls]}: ${n} lat</title></rect>`;
      x += w; return r;
    };
    // stała kolejność L→R: buffer | bound | wasted (pozycja niesie znaczenie, nie tylko kolor)
    const segs = seg(bufW, 'buffer', m.bufferYears ?? 0) + seg(bndW, 'bound', m.boundYears ?? 0) + seg(wasW, 'wasted', m.wastedYears ?? 0);
    const isWasted = (m.wastedShare ?? 0) >= 0.5;
    const label = `${esc(s.seed.replace(/^balans-gate1_/, 'seed_'))}`;
    return `<text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="rp-svg-lab${isWasted ? ' rp-ink-wasted' : ''}">${label}</text>
      ${segs}
      <text x="${padL + barW + 6}" y="${y + rowH / 2 + 4}" class="rp-svg-num">${m.surplusYears ?? 0}</text>`;
  }).join('\n');
  return `<h2 class="rp-h2">Panel — lata z nadwyżką rozbite na klasy (per seed)</h2>
  <p class="rp-note">Kolejność stała: <b>buffer</b> → <b>bound</b> → <b>wasted</b> (pozycja = znaczenie). Liczba po prawej = wszystkie lata z nadwyżką.
    Seed z przewagą wasted podświetlony.</p>
  <svg class="rp-svg" viewBox="0 0 ${W} ${seeds.length * rowH + 8}" role="img" aria-label="Lata nadwyżkowe wg klasy per seed">
    ${rows}
  </svg>`;
}

// ── Tabela (wymagany „table view" — dane liczbowo) ───────────────
function renderTable(seeds) {
  const rows = seeds.map(s => {
    const m = s.summary ?? {};
    const sv = (m.surplusYears ?? 0) === 0 ? 'no-surplus'
      : (m.wastedShare ?? 0) >= 0.5 ? 'WASTED' : (m.bufferShare ?? 0) >= 0.5 ? 'buffer' : 'mixed';
    const svCls = sv === 'WASTED' ? 'rp-ink-wasted' : sv === 'buffer' ? 'rp-ink-buffer' : '';
    return `<tr>
      <td>${esc(s.seed.replace(/^balans-gate1_/, 'seed_'))}</td>
      <td class="num">${m.finalPop ?? 0}</td>
      <td class="num">${m.finalUnemployed ?? 0}</td>
      <td class="num">${pct(m.finalBuildOutFrac)}</td>
      <td class="num">${m.finalFullColonies ?? 0}/${m.finalOutposts ?? 0}</td>
      <td class="num">${m.surplusYears ?? 0}</td>
      <td class="num rp-ink-buffer">${m.bufferYears ?? 0}</td>
      <td class="num rp-ink-wasted">${m.wastedYears ?? 0}</td>
      <td class="num">${m.boundYears ?? 0}</td>
      <td class="${svCls}">${sv}${s.crashed ? ' ⚠crash' : ''}</td>
    </tr>`;
  }).join('\n');
  return `<details class="rp-details" open><summary>Tabela — dane liczbowe (table view)</summary>
  <table class="rp-table">
    <thead><tr>
      <th>seed</th><th class="num">pop</th><th class="num">unemp</th><th class="num">zabudowa</th>
      <th class="num">kol/outp</th><th class="num">surplusY</th><th class="num">buffer</th>
      <th class="num">wasted</th><th class="num">bound</th><th>werdykt</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></details>`;
}

// ── Karta seeda: słupki POP + wstążki (klasa, nogi) + linia zabudowy ──
function renderSeedCard(s, yMax) {
  const series = (s.series ?? []).filter(r => r != null);
  const m = s.summary ?? {};
  const sv = (m.surplusYears ?? 0) === 0 ? 'tight'
    : (m.wastedShare ?? 0) >= 0.5 ? 'wasted' : 'buffer';
  const title = s.seed.replace(/^balans-gate1_/, 'seed_');

  const W = 300, H = 120, padL = 26, padB = 4, padT = 8;
  const plotW = W - padL - 6, plotH = H - padT - padB;
  const n = series.length || 1;
  const bw = plotW / n;
  const yOf = (v) => padT + plotH - (v / yMax) * plotH;

  // Słupki: employed (neutral) + surplus (kolor klasy), 2px przerwa między segmentami.
  let bars = '', boLine = '';
  const boPts = [];
  series.forEach((r, i) => {
    const x = padL + i * bw + 0.6;
    const w = Math.max(0.8, bw - 1.2);
    const empH = ((r.employed ?? 0) / yMax) * plotH;
    const surH = ((r.unemployed ?? 0) / yMax) * plotH;
    const empY = padT + plotH - empH;
    const empRect = empH > 0.4
      ? `<rect x="${x.toFixed(1)}" y="${empY.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, empH).toFixed(1)}" rx="1" class="rp-emp"><title>gy${r.gy}: employed ${r.employed}</title></rect>` : '';
    let surRect = '';
    if (surH > 0.4) {
      const gap = empH > 0.4 ? 1.5 : 0;
      const surTop = empY - gap - surH;
      const fill = r.class === 'wasted' ? 'url(#hatchWasted)' : CLASS_COLOR[r.class] ?? CLASS_COLOR.tight;
      surRect = `<rect x="${x.toFixed(1)}" y="${surTop.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, surH).toFixed(1)}" rx="1" fill="${fill}"><title>gy${r.gy}: surplus ${r.unemployed} — ${CLASS_LABEL[r.class] ?? r.class}</title></rect>`;
    }
    bars += empRect + surRect;
    boPts.push(`${(padL + i * bw + bw / 2).toFixed(1)},${yOf(yMax * (r.buildOutFrac ?? 0)).toFixed(1)}`);
  });
  // Linia zabudowy (inertna — cienka, przerywana, de-emphasized). Skala: buildOutFrac × yMax (na tej samej osi, faktycznie nisko).
  boLine = `<polyline points="${boPts.join(' ')}" fill="none" class="rp-boline"/>`;

  // Oś Y (0 i yMax) — recessive.
  const axis = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" class="rp-axis"/>
    <text x="${padL - 4}" y="${padT + 4}" text-anchor="end" class="rp-tick">${yMax}</text>
    <text x="${padL - 4}" y="${padT + plotH}" text-anchor="end" class="rp-tick">0</text>`;

  // Wstążki: klasa + nogi (absorpcja/ekspansja).
  const ribClass = ribbon(series, padL, bw, 'class');
  const ribLegs = legsRibbon(series, padL, bw);

  return `<div class="rp-card rp-edge-${sv}">
    <div class="rp-card-head">
      <b>${esc(title)}</b>
      <span class="rp-badge rp-${sv}">${CLASS_ICON[sv]} ${sv === 'wasted' ? 'WASTED' : sv === 'tight' ? 'tight' : 'buffer'}</span>
      ${s.crashed ? '<span class="rp-badge rp-wasted">⚠ crash</span>' : ''}
    </div>
    <svg class="rp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="POP w czasie — ${esc(title)}">
      ${axis}${bars}${boLine}
    </svg>
    <div class="rp-rib-wrap">
      <span class="rp-rib-lab">klasa</span>
      <svg class="rp-rib" viewBox="0 0 ${W} 10" preserveAspectRatio="none">${ribClass}</svg>
    </div>
    <div class="rp-rib-wrap">
      <span class="rp-rib-lab">nogi</span>
      <svg class="rp-rib" viewBox="0 0 ${W} 12" preserveAspectRatio="none">${ribLegs}</svg>
    </div>
    <div class="rp-card-foot">
      <span>final pop <b>${m.finalPop ?? 0}</b> · unemp <b>${m.finalUnemployed ?? 0}</b></span>
      <span>kol/outp <b>${m.finalFullColonies ?? 0}/${m.finalOutposts ?? 0}</b> · surplusY <b>${m.surplusYears ?? 0}</b></span>
    </div>
  </div>`;
}

// Wstążka klasy — kafel per rok kolorowany klasą.
function ribbon(series, padL, bw, mode) {
  const n = series.length || 1;
  return series.map((r, i) => {
    const x = (padL + i * bw);
    const fill = r.class === 'wasted' ? 'url(#hatchWasted)' : CLASS_COLOR[r.class] ?? CLASS_COLOR.tight;
    return `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(0.6, bw).toFixed(1)}" height="10" fill="${fill}"><title>gy${r.gy}: ${CLASS_LABEL[r.class] ?? r.class}</title></rect>`;
  }).join('');
}

// Wstążka „nogi" — górna połowa=absorpcja (niebieski), dolna=ekspansja (zielony); wypełniona gdy sygnał aktywny.
function legsRibbon(series, padL, bw) {
  return series.map((r, i) => {
    const x = (padL + i * bw);
    const w = Math.max(0.6, bw);
    const abs = r.homeAbsorbing ? `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="5" fill="#2a78d6"><title>gy${r.gy}: absorpcja (etaty rosną)</title></rect>` : '';
    const exp = r.expansionActive ? `<rect x="${x.toFixed(1)}" y="6" width="${w.toFixed(1)}" height="5" fill="#0ca30c"><title>gy${r.gy}: ekspansja aktywna</title></rect>` : '';
    return abs + exp;
  }).join('');
}

// ── SVG hatch (tekstura na „wasted" — CVD/greyscale robustness) ───
const HATCH_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <pattern id="hatchWasted" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
    <rect width="5" height="5" fill="#d03b3b"/>
    <line x1="0" y1="0" x2="0" y2="5" stroke="#7a1f1f" stroke-width="1.6"/>
  </pattern>
</defs></svg>`;
const HATCH_CSS = `repeating-linear-gradient(45deg,#7a1f1f 0 1.6px,#d03b3b 1.6px 5px)`;

// ── Styl (CSS custom props: light + dark; system sans; recessive chrome) ──
const STYLE = `<style>
.viz-root{color-scheme:light;
  --surface:#fcfcfb; --plane:#f9f9f7; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --emp:#b9b8ae; --card:#ffffff;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); background:var(--plane);
  max-width:1100px; margin:0 auto; padding:24px 20px 60px; line-height:1.45;}
@media (prefers-color-scheme:dark){.viz-root{color-scheme:dark;
  --surface:#1a1a19; --plane:#0d0d0d; --ink:#fff; --ink2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --emp:#4a4a46; --card:#161615;}}
.viz-root *{box-sizing:border-box}
.rp-head h1{font-size:22px;margin:0 0 4px;font-weight:650}
.rp-meta{color:var(--ink2);font-size:13px;margin:0}
.rp-h2{font-size:16px;margin:28px 0 6px;font-weight:620}
.rp-note{color:var(--ink2);font-size:12.5px;margin:0 0 10px}
.rp-verdict{margin:18px 0;padding:16px 18px;border-radius:10px;border:1px solid var(--border);
  background:var(--card);border-left:5px solid var(--axis)}
.rp-verdict.rp-buffer{border-left-color:#0ca30c} .rp-verdict.rp-wasted{border-left-color:#d03b3b}
.rp-verdict.rp-bound{border-left-color:#fab219} .rp-verdict.rp-tight{border-left-color:#8a8980}
.rp-verdict-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rp-verdict-head h2{font-size:17px;margin:0;font-weight:640}
.rp-verdict-sub{color:var(--ink2);font-size:13px;margin:6px 0 0}
.rp-badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;font-weight:650;color:#fff;background:var(--muted)}
.rp-badge.rp-buffer{background:#0ca30c} .rp-badge.rp-wasted{background:#d03b3b}
.rp-badge.rp-bound{background:#fab219;color:#3a2a00} .rp-badge.rp-tight{background:#8a8980}
.rp-tiles{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
.rp-tile{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:120px;display:flex;flex-direction:column;gap:2px}
.rp-tile-lab{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.rp-tile-big{font-size:24px;font-weight:680}
.rp-tile-sub{font-size:12px;color:var(--ink2)}
.rp-ink-buffer{color:#0ca30c} .rp-ink-wasted{color:#d03b3b} .rp-ink-bound{color:#c98500}
.rp-method{margin:16px 0;padding:14px 16px;border-radius:10px;background:var(--surface);border:1px dashed var(--axis)}
.rp-method h3{margin:0 0 8px;font-size:14.5px;font-weight:640}
.rp-method p{margin:0 0 8px;font-size:13px;color:var(--ink2)}
.rp-legend{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 4px;font-size:12.5px;color:var(--ink2)}
.rp-leg-item{display:inline-flex;align-items:center;gap:6px}
.rp-sw{width:14px;height:14px;border-radius:3px;display:inline-block;border:1px solid var(--border)}
.rp-sw-emp{background:var(--emp)}
.rp-svg{width:100%;height:auto;background:var(--surface);border-radius:8px;border:1px solid var(--border)}
.rp-svg-lab{font-size:11px;fill:var(--ink2)} .rp-svg-lab.rp-ink-wasted{fill:#d03b3b;font-weight:650}
.rp-svg-num{font-size:11px;fill:var(--muted)}
.rp-emp{fill:var(--emp)} .rp-axis{stroke:var(--axis);stroke-width:1} .rp-tick{font-size:9px;fill:var(--muted)}
.rp-boline{stroke:var(--muted);stroke-width:1;stroke-dasharray:2 2;opacity:.65}
.rp-details{margin:8px 0 4px} .rp-details summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:8px}
.rp-table{border-collapse:collapse;font-size:12px;width:100%;font-variant-numeric:tabular-nums}
.rp-table th,.rp-table td{border-bottom:1px solid var(--grid);padding:4px 8px;text-align:left}
.rp-table th{color:var(--muted);font-weight:600} .rp-table .num{text-align:right}
.rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:8px}
.rp-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;border-top:3px solid var(--axis)}
.rp-card.rp-edge-buffer{border-top-color:#0ca30c} .rp-card.rp-edge-wasted{border-top-color:#d03b3b} .rp-card.rp-edge-tight{border-top-color:#8a8980}
.rp-card-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px}
.rp-card-head b{flex:0 0 auto}
.rp-rib-wrap{display:flex;align-items:center;gap:6px;margin-top:5px}
.rp-rib-lab{font-size:9.5px;color:var(--muted);width:34px;flex:0 0 34px;text-align:right}
.rp-rib{width:100%;height:auto;display:block}
.rp-card-foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-top:7px;font-size:11px;color:var(--ink2)}
.rp-foot{margin-top:32px;padding-top:12px;border-top:1px solid var(--grid);color:var(--muted);font-size:11.5px}
.rp-foot p{margin:2px 0}
</style>`;

export default renderPopReport;
