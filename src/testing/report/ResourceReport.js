// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — ResourceReport (HTML raport, sekcja ZASOBY)
// ───────────────────────────────────────────────────────────────
// Czysta funkcja renderResourceReport(data) → samodzielny HTML string (inline CSS
// + inline SVG, ZERO zewnętrznych zależności — plik otwieralny offline).
// `data` = payload z balans-resource-telemetry.mjs (meta / seeds[] / panel).
//
// Struktura (rozszerzalna — kolejne metryki dokładają sekcje tego samego kroju):
//   1. werdykt + kafle KPI          — kto wiąże panel
//   2. skrzynka uczciwości          — granice pomiaru + WADA POMIARU (konsumpcja POP)
//   3. tabela per zasób             — czy produkcja nadąża za konsumpcją
//   4. top blokery budowy           — również TOWARY (realny bloker bywa komponentem)
//   5. mapa stanów per seed         — KTÓRY zasób wiąże i KIEDY (oś X = game-lata)
//   6. przepływy per zasób          — produkcja vs konsumpcja vs magazyn, small multiples
//
// Kolory = STATUS palette (dataviz, reserved): binding=critical, tight=warning,
// ok=good, glut=info, inert=neutral. binding↔ok są red-green → NIGDY sam kolor:
// legenda + ikona + etykieta + stała kolejność + TEKSTURA (ukośna kreska na „binding").
//
// ⚠ Tokeny designu są świadomie ZDUPLIKOWANE z PopReport.js: oba pliki to
// SAMODZIELNE artefakty HTML (otwierane offline, wysyłane pojedynczo), a PopReport
// jest zamkniętym, zwalidowanym artefaktem POP slice'u — nie ruszamy go dla kosmetyki.
// ═══════════════════════════════════════════════════════════════

const STATE_COLOR = {
  binding: '#d03b3b',  // critical — wiąże
  tight:   '#fab219',  // warning — ciasno
  ok:      '#0ca30c',  // good
  glut:    '#2a78d6',  // info — nadmiar bez ujścia
  inert:   '#8a8980',  // neutral — nie uczestniczy
};
const STATE_LABEL = {
  binding: 'Binding (wiąże gospodarkę)',
  tight:   'Tight (ciasno / blokuje budowę)',
  ok:      'OK (zdrowo)',
  glut:    'Glut (nadmiar bez ujścia)',
  inert:   'Inert (zasób nie uczestniczy)',
};
const STATE_ICON = { binding: '✕', tight: '▲', ok: '✓', glut: '≡', inert: '·' };
const STATE_ORDER = ['binding', 'tight', 'ok', 'glut', 'inert'];

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n, d = 1) => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '∞';
  if (Math.abs(v) >= 10000) return Math.round(v).toLocaleString('pl-PL');
  return (Math.round(v * 10 ** d) / 10 ** d).toString();
};
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const shortSeed = (s, prefix) => String(s).replace(new RegExp(`^${prefix ?? 'balans-gate1'}_`), 'seed_');

// ── Główny render ────────────────────────────────────────────────
export function renderResourceReport(data) {
  const meta   = data?.meta ?? {};
  const seeds  = data?.seeds ?? [];
  const panel  = data?.panel ?? {};
  const ids    = meta.resourceIds ?? Object.keys(panel.byRes ?? {});
  const verdict = panel.verdict ?? { outcome: 0, label: '—' };
  const prefix = meta.seedPrefix ?? 'balans-gate1';

  // Zasoby „żywe" — takie, które w JAKIMKOLWIEK seedzie nie były przez cały czas inert.
  const active = ids.filter(id => (panel.byRes?.[id]?.inertYears ?? 0) < (panel.totalYears ?? 0));
  const inert  = ids.filter(id => !active.includes(id));

  const vClass = verdict.outcome === 0 ? 'ok' : verdict.outcome === 1 ? 'binding' : 'tight';

  return `<div class="viz-root">
${STYLE}
${HATCH_DEFS}
<header class="rr-head">
  <h1>BALANS 1.0 — Phase 2 · telemetria ZASOBÓW</h1>
  <p class="rr-meta">
    class <b>${esc(meta.planetClass ?? '?')}</b> · ${esc(String(meta.seeds ?? seeds.length))} seedów ·
    ${esc(String(meta.targetGy ?? '?'))} game-lat · jednostka: <b>game-years</b> (1 gy = 12 civ-yr),
    stawki przeliczone na game-year · read-only instrument, <b>zero stałych balansu</b>
  </p>
</header>

${renderVerdict(panel, verdict, vClass, active, inert)}

${renderHonesty(meta, panel, seeds, inert)}

${renderLegend()}

${renderPanelTable(panel, ids)}

${renderBlockers(panel)}

${renderStateMaps(seeds, active, prefix)}

${renderFlows(seeds, active, prefix)}

<footer class="rr-foot">
  <p>${esc(meta.tool ?? 'BALANS 1.0 Phase 2 — RESOURCE telemetry')} · klasyfikator: ${esc(meta.classifier ?? '')}</p>
  <p>${esc(meta.scope ?? '')} · ${esc(meta.note ?? '')}</p>
</footer>
</div>`;
}

// ── 1. Werdykt + kafle ───────────────────────────────────────────
function renderVerdict(panel, verdict, vClass, active, inert) {
  const stalledShare = panel.totalYears ? (panel.stalledYears ?? 0) / panel.totalYears : 0;
  const glutted = Object.entries(panel.byRes ?? {}).filter(([, v]) => v.seedsGlutFinal > 0).length;
  const tiles = [
    ['Wiąże panel', verdict.binder ?? '—', verdict.binder ? `${pct(verdict.share)} wiążących lat` : 'brak', 'binding'],
    ['Gospodarka STOI', `${panel.stalledYears ?? 0} / ${panel.totalYears ?? 0}`, `${pct(stalledShare)} seed-lat · ${panel.seedsStalled ?? 0}/${panel.seeds ?? 0} seedów`, 'tight'],
    ['Zasoby w nadmiarze', String(glutted), 'kończą z zapasem bez ujścia', 'glut'],
    ['Zasoby martwe', String(inert.length), 'zero produkcji i konsumpcji', 'inert'],
  ];
  return `<section class="rr-verdict rr-b-${vClass}">
  <div class="rr-verdict-head">
    <span class="rr-badge rr-bg-${vClass}">${STATE_ICON[vClass] ?? ''} Outcome ${esc(String(verdict.outcome))}</span>
    <h2>${esc(verdict.label ?? '')}</h2>
  </div>
  <p class="rr-verdict-sub">Wiąże = gospodarka stoi (żaden budynek nie jest osiągalny) i ten zasób jest wśród blokerów,
     albo magazyn pusty i drenuje. „Stoi" liczone z realnych reguł gry (tech + kafel + koszt + <code>canAfford</code>).</p>
  <div class="rr-tiles">
    ${tiles.map(([lab, big, sub, cls]) => `<div class="rr-tile">
      <span class="rr-tile-lab">${esc(lab)}</span>
      <span class="rr-tile-big rr-ink-${cls}">${esc(big)}</span>
      <span class="rr-tile-sub">${esc(sub)}</span>
    </div>`).join('')}
  </div>
</section>`;
}

// ── 2. Skrzynka uczciwości (granice pomiaru + wada pomiaru) ──────
function renderHonesty(meta, panel, seeds, inert) {
  const thr = meta.thresholds ?? {};
  const zeroSeeds = (seeds ?? []).filter(s => s.summary?.popConsZeroedFromGy != null);
  const zeroList = zeroSeeds.map(s => `${esc(shortSeed(s.seed, meta.seedPrefix))} (od gy${s.summary.popConsZeroedFromGy})`).join(', ');
  const defect = zeroSeeds.length === 0 ? '' : `
  <p class="rr-defect"><b>⛔ WADA POMIARU — konsumpcja POP znika z rejestru.</b>
     Na <b>${zeroSeeds.length}/${seeds.length}</b> seedach producent <code>civilization_consumption</code> kolonii
     macierzystej zostaje nadpisany zerami (food/water/energy = 0) mimo populacji &gt; 0: ${zeroList}.
     Od tego roku <b>food / water / energy nie są wiarygodne</b> (zapasy puchną, bo nikt ich nie je) —
     traktuj je jako „brak pomiaru", nie jako wynik balansu. Zasoby kopalne (Fe/Si/Cu/Ti/C/Li/Hv) są nietknięte.
     Mechanizm, zasięg i dlaczego NIE naprawiamy tego w tym slice: <code>docs/BALANS_PHASE2_RESOURCES.md</code>.</p>`;
  return `<section class="rr-method">
  <h3>⚠ Metodologia — co ten pomiar naprawdę mierzy (i czego nie)</h3>
  <ul>
    <li><b>Produkcja / konsumpcja</b> = ROZBICIE GRY (<code>ResourceSystem.getResourceBreakdown</code>) — dokładnie ta
      liczba, którą gracz widzi w tooltipie (kopalnie + budynki + POP + fabryka), przeliczona na game-year.</li>
    <li><b>Magazyn i jego zmiana</b> = ground truth. Różnica <i>(prod − cons) − Δmagazyn</i> to <b>„reszta"</b>:
      jednorazowe wydatki (budowa, statki, bursty fabryki, paliwo) <b>ORAZ</b> luka nameplate-vs-realna produkcja
      (np. throttling kopalń przy brownoucie). Tych dwóch <b>nie rozdzielamy</b> — świadoma granica.</li>
    <li><b>Blokada budowy</b> liczona realną formułą gry (<code>computeBuildResourceCost/CommodityCost</code> +
      <code>canAfford</code>) dla budynków tech-legalnych z wolnym legalnym kaflem. Modyfikator polarny kafla = 1
      → koszt najtańszego wariantu (zaniża na kaflach polarnych).</li>
    <li><b>Towary</b> (COMMODITIES) wchodzą tylko jako <b>blokery</b> + stan magazynu — ich produkcja to fabryka
      (<code>spend/receive</code>), nie rejestr producentów; to osobny slice (finding #2, factory-pacing).</li>
    <li><b>Zakres</b>: kolonia <b>macierzysta</b> (jak POP slice). Kolonie wtórne i placówki poza tym slice'em.</li>
    <li>Progi klasyfikacji (knoby POMIARU, nie balansu): ciasno &lt; <b>${num(thr.TIGHT_COVER_GY, 2)}</b> gy zapasu,
      nadmiar ≥ <b>${num(thr.GLUT_COVER_GY, 2)}</b> gy zapasu, pusty magazyn ≤ <b>${num(thr.STOCK_EPS, 2)}</b>.</li>
    ${inert.length ? `<li><b>Zasoby nieobecne w grze</b> (zero produkcji, konsumpcji i ruchu przez cały panel):
      <b>${inert.map(esc).join(', ')}</b> — pokazane w tabeli dla kompletności, bez wykresów.</li>` : ''}
  </ul>${defect}
</section>`;
}

// ── Legenda ──────────────────────────────────────────────────────
function renderLegend() {
  const items = STATE_ORDER.map(s => {
    const sw = s === 'binding'
      ? `<span class="rr-sw" style="background:${STATE_COLOR[s]};background-image:${HATCH_CSS}"></span>`
      : `<span class="rr-sw" style="background:${STATE_COLOR[s]}"></span>`;
    return `<span class="rr-leg-item">${sw}<b>${STATE_ICON[s]}</b> ${esc(STATE_LABEL[s])}</span>`;
  }).join('');
  return `<div class="rr-legend">${items}</div>`;
}

// ── 3. Tabela panelu per zasób ───────────────────────────────────
function renderPanelTable(panel, ids) {
  const rows = ids.map(id => {
    const a = panel.byRes?.[id] ?? {};
    const keeps = a.meanCons > 0 ? (a.keepsUp ? '<span class="rr-ink-ok">tak</span>' : '<span class="rr-ink-binding">NIE</span>') : '<span class="rr-mut">—</span>';
    return `<tr>
      <td><b>${esc(id)}</b></td>
      <td class="num">${num(a.meanProd)}</td>
      <td class="num">${num(a.meanCons)}</td>
      <td class="num">${keeps}</td>
      <td class="num rr-ink-binding">${a.bindingYears ?? 0}</td>
      <td class="num rr-ink-tight">${a.tightYears ?? 0}</td>
      <td class="num rr-ink-ok">${a.okYears ?? 0}</td>
      <td class="num rr-ink-glut">${a.glutYears ?? 0}</td>
      <td class="num rr-mut">${a.inertYears ?? 0}</td>
      <td class="num">${a.seedsBinding ?? 0}</td>
      <td class="num">${a.earliestBindGy != null ? 'gy' + a.earliestBindGy : '—'}</td>
      <td class="num">${a.blockedYears ?? 0}</td>
    </tr>`;
  }).join('\n');
  return `<h2 class="rr-h2">Panel per zasób — czy produkcja nadąża za konsumpcją</h2>
  <p class="rr-note">Średnie stawki na <b>game-year</b> (średnia po wszystkich seed-latach). Kolumny stanów = ile
    seed-lat zasób spędził w danym stanie. „blok-lat" = lata, w których ten zasób blokował ≥1 budynek.</p>
  <table class="rr-table">
    <thead><tr>
      <th>zasób</th><th class="num">śr. prod/gy</th><th class="num">śr. cons/gy</th><th class="num">nadąża</th>
      <th class="num">binding</th><th class="num">tight</th><th class="num">ok</th><th class="num">glut</th>
      <th class="num">inert</th><th class="num">seedy&nbsp;bind</th><th class="num">1.&nbsp;bind</th><th class="num">blok-lat</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── 4. Top blokery (w tym towary) ────────────────────────────────
function renderBlockers(panel) {
  const entries = Object.entries(panel.topBlockers ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (entries.length === 0) return '';
  const max = entries[0][1] || 1;
  const W = 640, rowH = 24, padL = 160, padR = 50, barW = W - padL - padR;
  const rows = entries.map(([k, v], i) => {
    const y = i * rowH;
    const w = (v / max) * barW;
    return `<text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="rr-svg-lab">${esc(k)}</text>
      <rect x="${padL}" y="${y + 4}" width="${Math.max(1, w).toFixed(1)}" height="${rowH - 10}" rx="2" fill="${STATE_COLOR.tight}"><title>${esc(k)}: ${v} seed-lat jako główny bloker</title></rect>
      <text x="${padL + w + 6}" y="${y + rowH / 2 + 4}" class="rr-svg-num">${v}</text>`;
  }).join('\n');
  return `<h2 class="rr-h2">Główny bloker budowy — ile seed-lat</h2>
  <p class="rr-note">Klucz kosztu, którego brak blokował NAJWIĘCEJ budynków w danym roku. Uwzględnia <b>towary</b>
    (komponenty), nie tylko surowce — realnym wąskim gardłem bywa komponent, nie ruda.</p>
  <svg class="rr-svg" viewBox="0 0 ${W} ${entries.length * rowH + 8}" role="img" aria-label="Top blokery budowy">${rows}</svg>`;
}

// ── 5. Mapa stanów per seed (który zasób wiąże i KIEDY) ──────────
function renderStateMaps(seeds, active, prefix) {
  if (seeds.length === 0 || active.length === 0) return '';
  const cards = seeds.map(s => {
    const series = (s.series ?? []).filter(r => r);
    const n = series.length || 1;
    const W = 320, labW = 46, rowH = 11, plotW = W - labW - 6;
    const cw = plotW / n;
    const H = active.length * rowH + 14;
    let body = '';
    active.forEach((id, ri) => {
      const y = ri * rowH;
      body += `<text x="${labW - 5}" y="${y + rowH - 2.5}" text-anchor="end" class="rr-map-lab">${esc(id)}</text>`;
      series.forEach((r, i) => {
        const st = r.res?.[id]?.state ?? 'inert';
        if (st === 'inert') return;   // puste = nie uczestniczy (mniej szumu)
        const fill = st === 'binding' ? 'url(#hatchBinding)' : STATE_COLOR[st];
        const e = r.res[id];
        body += `<rect x="${(labW + i * cw).toFixed(1)}" y="${y + 1}" width="${Math.max(0.6, cw).toFixed(1)}" height="${rowH - 2}" fill="${fill}"><title>gy${r.gy} ${id}: ${STATE_LABEL[st]} — magazyn ${num(e.stock)}, prod ${num(e.prod)}/gy, cons ${num(e.cons)}/gy${e.blockedBuilds ? `, blokuje ${e.blockedBuilds} budynków` : ''}</title></rect>`;
      });
    });
    // oś X — co 10 gy
    const lastGy = series[series.length - 1]?.gy ?? 0;
    let axis = '';
    for (let g = 0; g <= lastGy; g += 10) {
      const i = series.findIndex(r => r.gy === g);
      if (i < 0) continue;
      axis += `<text x="${(labW + i * cw).toFixed(1)}" y="${active.length * rowH + 11}" class="rr-tick">${g}</text>`;
    }
    const m = s.summary ?? {};
    const stalled = (m.stalledYears ?? 0) > 0;
    return `<div class="rr-card ${stalled ? 'rr-edge-binding' : 'rr-edge-ok'}">
      <div class="rr-card-head">
        <b>${esc(shortSeed(s.seed, prefix))}</b>
        ${stalled ? `<span class="rr-badge rr-bg-binding">✕ stoi ${m.stalledYears} lat (od gy${m.firstStallGy})</span>` : '<span class="rr-badge rr-bg-ok">✓ nie stoi</span>'}
        ${s.crashed ? '<span class="rr-badge rr-bg-binding">⚠ crash</span>' : ''}
      </div>
      <svg class="rr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa stanów zasobów — ${esc(shortSeed(s.seed, prefix))}">${body}${axis}</svg>
      <div class="rr-card-foot">
        <span>kolonie <b>${m.finalColonies ?? 0}</b> · POP <b>${m.finalPop ?? 0}</b></span>
        <span>${m.popConsZeroedFromGy != null ? `<span class="rr-ink-binding">konsumpcja POP = 0 od gy${m.popConsZeroedFromGy}</span>` : 'konsumpcja POP OK'}</span>
      </div>
    </div>`;
  }).join('\n');
  return `<h2 class="rr-h2">Który zasób wiąże i KIEDY — mapa stanów per seed</h2>
  <p class="rr-note">Wiersz = zasób, kolumna = <b>game-rok</b> (oś X w gy). Puste pole = zasób nie uczestniczy w tym roku.
    Najedź na komórkę — magazyn, produkcja, konsumpcja, liczba blokowanych budynków.</p>
  <div class="rr-grid">${cards}</div>`;
}

// ── 6. Przepływy per zasób (small multiples po seedach) ──────────
function renderFlows(seeds, active, prefix) {
  const cards = active.map(id => {
    // Wspólne skale w obrębie zasobu — seedy porównywalne między sobą.
    let flowMax = 1e-6, stockMax = 1e-6;
    for (const s of seeds) for (const r of (s.series ?? [])) {
      const e = r.res?.[id]; if (!e) continue;
      flowMax = Math.max(flowMax, e.prod ?? 0, e.cons ?? 0);
      stockMax = Math.max(stockMax, e.stock ?? 0);
    }
    const minis = seeds.map(s => {
      const series = (s.series ?? []).filter(r => r);
      const n = series.length || 1;
      const W = 150, H = 56, mid = H / 2, bw = W / n;
      let bars = '';
      const pts = [];
      series.forEach((r, i) => {
        const e = r.res?.[id]; if (!e) return;
        const x = i * bw;
        const w = Math.max(0.6, bw - 0.3);
        const ph = ((e.prod ?? 0) / flowMax) * (mid - 2);
        const ch = ((e.cons ?? 0) / flowMax) * (mid - 2);
        if (ph > 0.3) bars += `<rect x="${x.toFixed(1)}" y="${(mid - ph).toFixed(1)}" width="${w.toFixed(1)}" height="${ph.toFixed(1)}" fill="${STATE_COLOR.ok}" opacity=".75"><title>gy${r.gy}: produkcja ${num(e.prod)}/gy</title></rect>`;
        if (ch > 0.3) bars += `<rect x="${x.toFixed(1)}" y="${mid.toFixed(1)}" width="${w.toFixed(1)}" height="${ch.toFixed(1)}" fill="${STATE_COLOR.binding}" opacity=".75"><title>gy${r.gy}: konsumpcja ${num(e.cons)}/gy</title></rect>`;
        pts.push(`${(x + bw / 2).toFixed(1)},${(H - ((e.stock ?? 0) / stockMax) * (H - 3)).toFixed(1)}`);
      });
      const stockLine = `<polyline points="${pts.join(' ')}" fill="none" class="rr-stockline"/>`;
      const bind = series.map((r, i) => {
        const e = r.res?.[id];
        if (!e || e.state !== 'binding') return '';
        return `<rect x="${(i * bw).toFixed(1)}" y="${H - 3}" width="${Math.max(0.6, bw).toFixed(1)}" height="3" fill="url(#hatchBinding)"><title>gy${r.gy}: wiąże</title></rect>`;
      }).join('');
      const fin = s.summary?.byRes?.[id] ?? {};
      return `<div class="rr-mini">
        <div class="rr-mini-head">${esc(shortSeed(s.seed, prefix))} <span class="rr-mut">${num(fin.finalStock)}</span></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(id)} — ${esc(shortSeed(s.seed, prefix))}">
          <line x1="0" y1="${mid}" x2="${W}" y2="${mid}" class="rr-axis"/>${bars}${stockLine}${bind}
        </svg>
      </div>`;
    }).join('');
    return `<div class="rr-flowcard">
      <div class="rr-flow-head"><b>${esc(id)}</b>
        <span class="rr-mut">skala przepływu ±${num(flowMax)}/gy · magazyn max ${num(stockMax)}</span></div>
      <div class="rr-minis">${minis}</div>
    </div>`;
  }).join('\n');
  return `<h2 class="rr-h2">Przepływy per zasób — produkcja vs konsumpcja vs magazyn</h2>
  <p class="rr-note">Każdy panel = jeden zasób, w środku po jednym mini-wykresie na seed (oś X = game-lata).
    Nad osią <span class="rr-ink-ok">produkcja</span>, pod osią <span class="rr-ink-binding">konsumpcja</span>
    (wspólna skala w obrębie zasobu), cienka linia = <b>magazyn</b> (własna skala, wspólna w obrębie zasobu).
    Kreskowany pasek u dołu = lata, w których zasób <b>wiązał</b>. Liczba przy nazwie seeda = magazyn na koniec.</p>
  <div class="rr-flows">${cards}</div>`;
}

// ── SVG hatch (tekstura na „binding" — CVD/greyscale robustness) ──
const HATCH_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <pattern id="hatchBinding" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
    <rect width="5" height="5" fill="#d03b3b"/>
    <line x1="0" y1="0" x2="0" y2="5" stroke="#7a1f1f" stroke-width="1.6"/>
  </pattern>
</defs></svg>`;
const HATCH_CSS = `repeating-linear-gradient(45deg,#7a1f1f 0 1.6px,#d03b3b 1.6px 5px)`;

// ── Styl (CSS custom props: light + dark; system sans; recessive chrome) ──
const STYLE = `<style>
.viz-root{color-scheme:light;
  --surface:#fcfcfb; --plane:#f9f9f7; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --card:#ffffff;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); background:var(--plane);
  max-width:1180px; margin:0 auto; padding:24px 20px 60px; line-height:1.45;}
@media (prefers-color-scheme:dark){.viz-root{color-scheme:dark;
  --surface:#1a1a19; --plane:#0d0d0d; --ink:#fff; --ink2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --card:#161615;}}
.viz-root *{box-sizing:border-box}
.rr-head h1{font-size:22px;margin:0 0 4px;font-weight:650}
.rr-meta{color:var(--ink2);font-size:13px;margin:0}
.rr-h2{font-size:16px;margin:30px 0 6px;font-weight:620}
.rr-note{color:var(--ink2);font-size:12.5px;margin:0 0 10px}
.rr-mut{color:var(--muted)}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em;background:var(--surface);
  border:1px solid var(--border);border-radius:4px;padding:0 4px}
.rr-verdict{margin:18px 0;padding:16px 18px;border-radius:10px;border:1px solid var(--border);
  background:var(--card);border-left:5px solid var(--axis)}
.rr-verdict.rr-b-binding{border-left-color:#d03b3b} .rr-verdict.rr-b-tight{border-left-color:#fab219}
.rr-verdict.rr-b-ok{border-left-color:#0ca30c}
.rr-verdict-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rr-verdict-head h2{font-size:17px;margin:0;font-weight:640}
.rr-verdict-sub{color:var(--ink2);font-size:13px;margin:6px 0 0}
.rr-badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;font-weight:650;color:#fff;background:var(--muted)}
.rr-bg-binding{background:#d03b3b} .rr-bg-tight{background:#fab219;color:#3a2a00}
.rr-bg-ok{background:#0ca30c} .rr-bg-glut{background:#2a78d6} .rr-bg-inert{background:#8a8980}
.rr-tiles{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
.rr-tile{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:140px;display:flex;flex-direction:column;gap:2px}
.rr-tile-lab{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.rr-tile-big{font-size:24px;font-weight:680}
.rr-tile-sub{font-size:12px;color:var(--ink2)}
.rr-ink-binding{color:#d03b3b} .rr-ink-tight{color:#c98500} .rr-ink-ok{color:#0ca30c}
.rr-ink-glut{color:#2a78d6} .rr-ink-inert{color:#8a8980}
.rr-method{margin:16px 0;padding:14px 16px;border-radius:10px;background:var(--surface);border:1px dashed var(--axis)}
.rr-method h3{margin:0 0 8px;font-size:14.5px;font-weight:640}
.rr-method ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink2)}
.rr-method li{margin-bottom:5px}
.rr-defect{margin:10px 0 0;padding:10px 12px;border-radius:8px;font-size:13px;color:var(--ink);
  background:rgba(208,59,59,.10);border:1px solid rgba(208,59,59,.45)}
.rr-legend{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 4px;font-size:12.5px;color:var(--ink2)}
.rr-leg-item{display:inline-flex;align-items:center;gap:6px}
.rr-sw{width:14px;height:14px;border-radius:3px;display:inline-block;border:1px solid var(--border)}
.rr-svg{width:100%;height:auto;background:var(--surface);border-radius:8px;border:1px solid var(--border)}
.rr-svg-lab{font-size:11px;fill:var(--ink2)} .rr-svg-num{font-size:11px;fill:var(--muted)}
.rr-map-lab{font-size:8px;fill:var(--ink2)} .rr-tick{font-size:8px;fill:var(--muted);text-anchor:middle}
.rr-axis{stroke:var(--axis);stroke-width:1}
.rr-stockline{stroke:var(--ink);stroke-width:1;opacity:.55;vector-effect:non-scaling-stroke}
.rr-table{border-collapse:collapse;font-size:12px;width:100%;font-variant-numeric:tabular-nums;margin-bottom:4px}
.rr-table th,.rr-table td{border-bottom:1px solid var(--grid);padding:4px 8px;text-align:left}
.rr-table th{color:var(--muted);font-weight:600} .rr-table .num{text-align:right}
.rr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin-top:8px}
.rr-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;border-top:3px solid var(--axis)}
.rr-card.rr-edge-binding{border-top-color:#d03b3b} .rr-card.rr-edge-ok{border-top-color:#0ca30c}
.rr-card-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;flex-wrap:wrap}
.rr-card-foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-top:7px;font-size:11px;color:var(--ink2)}
.rr-flows{display:flex;flex-direction:column;gap:12px;margin-top:8px}
.rr-flowcard{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
.rr-flow-head{display:flex;gap:10px;align-items:baseline;font-size:13px;margin-bottom:6px}
.rr-flow-head .rr-mut{font-size:11px}
.rr-minis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.rr-mini{display:flex;flex-direction:column;gap:2px}
.rr-mini-head{font-size:10px;color:var(--ink2)}
.rr-mini svg{width:100%;height:56px;background:var(--surface);border:1px solid var(--border);border-radius:5px}
.rr-foot{margin-top:32px;padding-top:12px;border-top:1px solid var(--grid);color:var(--muted);font-size:11.5px}
.rr-foot p{margin:2px 0}
</style>`;

export default renderResourceReport;
