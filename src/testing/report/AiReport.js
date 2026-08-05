// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — AiReport (HTML raport, sekcja IMPERIA AI)
// ───────────────────────────────────────────────────────────────
// Czysta funkcja renderAiReport(data) → samodzielny HTML string (inline CSS +
// inline SVG, ZERO zewnętrznych zależności — plik otwieralny offline).
// `data` = payload z balans-ai-telemetry.mjs (meta / seeds[] / panel / thresholds).
//
// Ten slice DIAGNOZUJE, więc raport ma inny ciężar niż poprzednie: najpierw
// werdykt i UCZCIWE GRANICE pomiaru, potem porównanie bazowe AI↔gracz, dopiero
// potem dziennik decyzji (co odpaliło, co się zablokowało, co było ciche).
//
// Kolory: gracz = neutralny, imperia = seria kategorialna. Nigdy sam kolor —
// każda seria ma też WZÓR LINII i etykietę; tabele powtarzają liczby wprost.
// ═══════════════════════════════════════════════════════════════

const SERIES_COLOR = ['#2a78d6', '#c98500', '#7a5af5', '#0ca30c'];   // imperia (kategorialne)
const SERIES_DASH  = ['0', '5 3', '2 2', '7 2 2 2'];                 // + wzór (CVD/greyscale)
const PLAYER_COLOR = '#52514e';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const num = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : (Math.round(x * 10 ** d) / 10 ** d).toString());

// ── Główny render ────────────────────────────────────────────────
export function renderAiReport(data) {
  const meta   = data?.meta ?? {};
  const seeds  = data?.seeds ?? [];
  const panel  = data?.panel ?? {};
  const v      = panel.verdict ?? { outcome: 0, label: '—' };
  const vCls   = v.outcome === 1 ? 'bad' : v.outcome === 2 ? 'good' : v.outcome === 3 ? 'warn' : 'neutral';

  // Stabilna kolejność i kolor imperium w CAŁYM raporcie (id → indeks serii).
  const empireIds = [...new Set(seeds.flatMap(s => (s.summary?.empires ?? []).map(e => e.empireId)))].sort();
  const colorOf = (id) => SERIES_COLOR[empireIds.indexOf(id) % SERIES_COLOR.length];
  const dashOf  = (id) => SERIES_DASH[empireIds.indexOf(id) % SERIES_DASH.length];

  return `<div class="viz-root">
${STYLE}
<header class="rp-head">
  <h1>BALANS 1.0 — Phase 2 · IMPERIA AI</h1>
  <p class="rp-meta">
    class <b>${esc(meta.planetClass ?? '?')}</b> · ${esc(String(meta.seeds ?? seeds.length))} seedów ·
    ${esc(String(meta.targetGy ?? '?'))} game-lat · jednostka: <b>game-years</b> (1 gy = 12 civ-yr) ·
    read-only instrument, <b>zero stałych balansu, zero zmian w logice AI</b>
  </p>
</header>

${renderVerdict(panel, v, vCls, seeds)}
${renderLimits(meta, seeds, panel)}
${renderBaseline(panel, seeds, empireIds, colorOf, dashOf)}
${renderMilestones(seeds, colorOf)}
${renderDecisions(panel, seeds)}
${renderBlockers(panel, seeds)}
${renderWarns(data)}

<footer class="rp-foot">
  <p>${esc(meta.tool ?? 'BALANS 1.0 Phase 2 — AI empire telemetry')}</p>
  <p>${esc(meta.note ?? '')}</p>
</footer>
</div>`;
}

// ── Werdykt + kafle ──────────────────────────────────────────────
function renderVerdict(panel, v, vCls, seeds) {
  const outcomeText = {
    1: 'AI zostaje w tyle mimo zaprojektowanej przewagi startowej — podejrzenie z briefu POTWIERDZONE',
    2: 'AI nadąża za graczem — podejrzewana regresja NIE potwierdzona',
    3: 'Wynik MIESZANY — część imperiów ekspanduje, część stoi w miejscu',
    0: 'Brak danych',
  }[v.outcome] ?? '';
  const tiles = [
    ['Pierwsza placówka AI', `${num(panel.medFirstOutpostGy)} gy`, `próg: ${num(panel.thresholdFirstOutpostGy ?? 2)} gy`, v.outcome === 1 ? 'bad' : 'good'],
    ['Imperia bez placówki', `${panel.neverOutpost ?? 0}/${panel.empiresObserved ?? 0}`, 'przez cały przebieg', (panel.neverOutpost ?? 0) > 0 ? 'bad' : 'good'],
    ['Ciała na koniec', `${num(panel.medAiColoniesEnd)} vs ${num(panel.medPlayerColoniesEnd)}`, 'AI vs GRACZ (mediana)'],
    ['Obsada etatów', `${pct(panel.medAiEmplRateEnd)} vs ${pct(panel.medPlayerEmplRateEnd)}`, 'AI vs GRACZ (mediana)', (panel.medAiEmplRateEnd ?? 1) < 0.9 ? 'bad' : 'good'],
  ];
  return `<section class="rp-verdict rp-edge-${vCls}">
  <div class="rp-verdict-head">
    <span class="rp-badge rp-${vCls}">Outcome ${esc(String(v.outcome))}</span>
    <h2>${esc(v.label)}</h2>
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

// ── Granice pomiaru (WYMAGANE — uczciwość ponad kompletnością) ───
function renderLimits(meta, seeds, panel) {
  // Ile RÓŻNYCH układów macierzystych AI widział panel — to decyduje o niezależności próby.
  const homeSystems = new Set();
  for (const s of seeds) for (const e of (s.series?.[0]?.empires ?? [])) if (e.homeSystemId) homeSystems.add(e.homeSystemId);
  const empires = panel.empiresObserved ?? 0;
  return `<section class="rp-method">
  <h3>⚠ Granice tego pomiaru — przeczytaj przed wnioskami</h3>
  <ul>
    <li><b>Próba AI nie jest tak niezależna, jak sugeruje liczba wierszy.</b> Seed losuje układ
      <i>gracza</i>; imperia AI startują w tych samych ${homeSystems.size} układach w każdym przebiegu.
      ${empires} wierszy imperiów to realnie <b>${homeSystems.size} sytuacje × ${seeds.length} powtórzeń</b>,
      a nie ${empires} niezależnych losowań. Powtarzalność wyniku mówi tu „to nie przypadek", ale
      <b>nie</b> „to zachodzi dla dowolnego startu AI".</li>
    <li><b>Krzywa gracza w tym przebiegu nie jest identyczna z panelem referencyjnym</b>
      (POP/ZASOBY/ROI/CENY). Włączenie imperiów zmienia losowania PRNG i dokłada tickujące kolonie,
      więc gracz porównywany jest <b>wewnątrz tego samego przebiegu</b> — i tylko tak wolno go czytać.</li>
    <li><b>Sam harness miał martwą warstwę AI</b> do tego slice'u: headless spawnował imperia, ale nigdy
      nie tworzył warstw B/C, a <code>window.KOSMOS.empireColonyBootstrap</code> był <code>undefined</code>.
      To ta sama klasa cichej degradacji, którą slice mierzy w grze — dlatego sonda zależności jest
      częścią instrumentu, a nie ciekawostką.</li>
    <li><b>Powody decyzji są odwzorowaniem ścieżki decyzyjnej</b>, nie drugą implementacją doktryny:
      warstwa C używa własnego <code>explainColonization</code> gry, warstwa B — lustra o tej samej
      kolejności bramek. Zmiana kolejności w grze wymaga zmiany tutaj.</li>
    <li><b>Zdarzenia losowe wyłączone</b> (jedna zmienna naraz względem panelu referencyjnego), więc ten
      przebieg nie mówi nic o odporności AI na katastrofy.</li>
  </ul>
</section>`;
}

// ── Porównanie bazowe AI vs gracz (small multiples per seed) ─────
function renderBaseline(panel, seeds, empireIds, colorOf, dashOf) {
  let maxBodies = 1, maxPop = 1, maxGy = 1;
  for (const s of seeds) for (const r of (s.series ?? [])) {
    maxGy = Math.max(maxGy, r.gy ?? 0);
    maxBodies = Math.max(maxBodies, (r.player?.coloniesFull ?? 0) + (r.player?.outposts ?? 0));
    maxPop = Math.max(maxPop, r.player?.home?.pop ?? 0);
    for (const e of (r.empires ?? [])) {
      maxBodies = Math.max(maxBodies, (e.coloniesFull ?? 0) + (e.outposts ?? 0));
      maxPop = Math.max(maxPop, e.mother?.pop ?? 0);
    }
  }
  const legend = `<div class="rp-legend">
    <span class="rp-leg-item"><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="${PLAYER_COLOR}" stroke-width="2.4"/></svg> GRACZ (bot referencyjny)</span>
    ${empireIds.map(id => `<span class="rp-leg-item"><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="${colorOf(id)}" stroke-width="2" stroke-dasharray="${dashOf(id)}"/></svg> ${esc(id)}</span>`).join('')}
  </div>`;

  const cards = seeds.map(s => {
    const series = s.series ?? [];
    const bodies = renderLines(series, maxGy, maxBodies, empireIds, colorOf, dashOf,
      (r) => (r.player?.coloniesFull ?? 0) + (r.player?.outposts ?? 0),
      (e) => (e.coloniesFull ?? 0) + (e.outposts ?? 0));
    const pops = renderLines(series, maxGy, maxPop, empireIds, colorOf, dashOf,
      (r) => r.player?.home?.pop ?? 0,
      (e) => e.mother?.pop ?? 0);
    const warns = s.health?.warns?.length ?? 0;
    return `<div class="rp-card">
      <div class="rp-card-head"><b>${esc(shortSeed(s.seed))}</b>
        <span class="rp-badge ${warns ? 'rp-bad' : 'rp-good'}">${warns} WARN</span>
        ${s.crashed ? '<span class="rp-badge rp-bad">⚠ crash</span>' : ''}</div>
      <div class="rp-mini-lab">ciała (kolonie + placówki) · maks ${maxBodies}</div>
      ${bodies}
      <div class="rp-mini-lab">populacja macierzystej · maks ${maxPop}</div>
      ${pops}
    </div>`;
  }).join('\n');

  return `<h2 class="rp-h2">Porównanie bazowe — AI vs GRACZ na tym samym przebiegu</h2>
  <p class="rp-note">AI ma <b>zaprojektowaną przewagę startową</b> (darmowe budynki startowe, darmowe techy,
    startowe zapasy), więc na tych wykresach <b>nie powinno</b> systematycznie zostawać w tyle. Oś X = game-lata,
    wspólna skala Y dla wszystkich seedów (porównywalność).</p>
  ${legend}
  <div class="rp-grid">${cards}</div>`;
}

/** Linie: gracz (ciągła, neutralna) + każde imperium (kolor + wzór). Czysty SVG. */
function renderLines(series, maxGy, maxY, empireIds, colorOf, dashOf, playerFn, empireFn) {
  const W = 300, H = 96, padL = 24, padB = 14, padT = 6;
  const plotW = W - padL - 6, plotH = H - padT - padB;
  const xOf = (gy) => padL + (maxGy > 0 ? (gy / maxGy) * plotW : 0);
  const yOf = (v)  => padT + plotH - (maxY > 0 ? (v / maxY) * plotH : 0);

  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const playerPts = series.map(r => [xOf(r.gy), yOf(playerFn(r))]);
  let lines = `<path d="${path(playerPts)}" fill="none" stroke="${PLAYER_COLOR}" stroke-width="2.2"/>`;
  for (const id of empireIds) {
    const pts = series.map(r => {
      const e = (r.empires ?? []).find(x => x.empireId === id);
      return e ? [xOf(r.gy), yOf(empireFn(e))] : null;
    }).filter(Boolean);
    if (pts.length < 2) continue;
    lines += `<path d="${path(pts)}" fill="none" stroke="${colorOf(id)}" stroke-width="1.8" stroke-dasharray="${dashOf(id)}"/>`;
  }
  const axis = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" class="rp-axis"/>
    <line x1="${padL}" y1="${padT + plotH}" x2="${W - 6}" y2="${padT + plotH}" class="rp-axis"/>
    <text x="${padL - 4}" y="${padT + 6}" text-anchor="end" class="rp-tick">${maxY}</text>
    <text x="${padL - 4}" y="${padT + plotH}" text-anchor="end" class="rp-tick">0</text>
    <text x="${W - 6}" y="${H - 3}" text-anchor="end" class="rp-tick">${maxGy} gy</text>`;
  return `<svg class="rp-svg" viewBox="0 0 ${W} ${H}" role="img">${axis}${lines}</svg>`;
}

// ── Kamienie milowe (tabela) ─────────────────────────────────────
function renderMilestones(seeds, colorOf) {
  const rows = seeds.flatMap(s => (s.summary?.empires ?? []).map(e => `<tr>
    <td>${esc(shortSeed(s.seed))}</td>
    <td><span class="rp-dot" style="background:${colorOf(e.empireId)}"></span>${esc(e.name)}</td>
    <td>${esc(e.archetype)}</td>
    <td class="num${e.firstOutpostGy == null ? ' rp-ink-bad' : ''}">${e.firstOutpostGy == null ? 'NIGDY' : num(e.firstOutpostGy)}</td>
    <td class="num">${e.first3ColoniesGy == null ? '—' : num(e.first3ColoniesGy)}</td>
    <td class="num">${e.coloniesEnd + e.outpostsEnd}</td>
    <td class="num">${e.popStart} → ${e.popEnd}</td>
    <td class="num${(e.emplRateEnd ?? 1) < 0.9 ? ' rp-ink-bad' : ''}">${pct(e.emplRateEnd)}</td>
    <td class="num">${num(e.unfilledEnd, 1)}</td>
    <td class="num">${e.buildingsEnd}</td>
    <td class="num">${e.droidsStoredEnd} / ${e.droidsInstalledEnd}</td>
    <td class="rp-reason">${esc(e.reasonEnd ?? '—')}</td>
  </tr>`)).join('\n');
  return `<h2 class="rp-h2">Kamienie milowe per imperium (game-lata)</h2>
  <p class="rp-note">„droidy" = w magazynie / zainstalowane w budynkach. Ostatnia kolumna to POWÓD ostatniej
    decyzji prosto z narzędzia diagnostycznego gry (<code>explainColonization</code>).</p>
  <table class="rp-table">
    <thead><tr><th>seed</th><th>imperium</th><th>archetyp</th><th class="num">1. placówka</th>
      <th class="num">3 ciała</th><th class="num">ciał</th><th class="num">POP</th><th class="num">obsada</th>
      <th class="num">wolne etaty</th><th class="num">budynki</th><th class="num">droidy</th><th>powód na koniec</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Dziennik decyzji ─────────────────────────────────────────────
function renderDecisions(panel, seeds) {
  const byKind = new Map();
  for (const s of seeds) for (const a of (s.decisions?.actions ?? [])) {
    const k = `${a.system}:${a.kind}:${a.outcome}`;
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  const maxAct = Math.max(1, ...byKind.values());
  const actRows = [...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const eff = /:(fired|built|construction|queued|upgraded)$/.test(k);
    return `<tr><td><code>${esc(k)}</code></td><td class="num">${n}</td>
      <td class="rp-barcell"><span class="rp-bar ${eff ? 'rp-bar-good' : 'rp-bar-bad'}" style="width:${(n / maxAct * 100).toFixed(1)}%"></span></td></tr>`;
  }).join('');

  const noopRoll = new Map();
  for (const s of seeds) for (const n of (s.decisions?.noops ?? [])) {
    const k = `${n.system}|${n.module}|${n.reasonKey}`;
    const rec = noopRoll.get(k) ?? { ...n, count: 0 };
    rec.count += n.count;
    noopRoll.set(k, rec);
  }
  const maxNoop = Math.max(1, ...[...noopRoll.values()].map(r => r.count));
  const noopRows = [...noopRoll.values()].sort((a, b) => b.count - a.count).map(n => `<tr>
    <td>${esc(n.system)}</td><td>${esc(n.module)}</td><td><code>${esc(n.reasonKey)}</code></td>
    <td class="num">${n.count}</td>
    <td class="rp-barcell"><span class="rp-bar rp-bar-warn" style="width:${(n.count / maxNoop * 100).toFixed(1)}%"></span></td>
    <td class="rp-reason">${esc(n.sample ?? '')}</td></tr>`).join('');

  const deps = new Set(seeds.flatMap(s => (s.decisions?.deps ?? []).map(d => `${d.key}: ${d.note}`)));
  const depsHtml = deps.size
    ? `<p class="rp-bad-note">‼ ZNALEZISKO — odczyt rozwiązany do <code>undefined</code> na ścieżce decyzyjnej:</p>
       <ul>${[...deps].map(d => `<li><code>${esc(d)}</code></li>`).join('')}</ul>`
    : `<p class="rp-note">Sonda zależności: wszystkie odczyty <code>window.KOSMOS.*</code> na ścieżce decyzyjnej
       rozwiązane w każdym roku każdego seeda — <b>żadna decyzja nie umarła po cichu z tego powodu</b>.</p>`;

  return `<h2 class="rp-h2">Dziennik decyzji — co odpaliło, co się zablokowało, co było ciche</h2>
  ${depsHtml}
  <div class="rp-two">
    <div>
      <h3 class="rp-h3">Podjęte próby (skuteczne = zielone)</h3>
      <table class="rp-table"><thead><tr><th>system:rodzaj:wynik</th><th class="num">ile</th><th></th></tr></thead>
        <tbody>${actRows}</tbody></table>
    </div>
    <div>
      <h3 class="rp-h3">„Oceniło i nic nie zrobiło" — z POWODEM</h3>
      <table class="rp-table"><thead><tr><th>system</th><th>moduł</th><th>powód</th><th class="num">ile</th><th></th><th>przykład</th></tr></thead>
        <tbody>${noopRows}</tbody></table>
    </div>
  </div>`;
}

// ── Blokery zestawu placówki ─────────────────────────────────────
function renderBlockers(panel, seeds) {
  const roll = new Map();
  for (const s of seeds) for (const e of (s.summary?.empires ?? [])) {
    for (const it of (e.outpostShortEnd ?? [])) {
      const rec = roll.get(it.id) ?? { id: it.id, empires: 0, sum: 0 };
      rec.empires++; rec.sum += it.short;
      roll.set(it.id, rec);
    }
  }
  const total = panel.empiresObserved ?? 1;
  const rows = [...roll.values()].sort((a, b) => b.empires - a.empires).map(r => `<tr>
    <td><code>${esc(r.id)}</code></td>
    <td class="num">${r.empires}/${total}</td>
    <td class="rp-barcell"><span class="rp-bar rp-bar-bad" style="width:${(r.empires / total * 100).toFixed(1)}%"></span></td>
    <td class="num">${num(r.sum / Math.max(1, r.empires), 1)}</td>
  </tr>`).join('');
  const stalls = new Map();
  for (const s of seeds) for (const r of (s.series ?? [])) for (const e of (r.empires ?? [])) {
    if (e.droidStall?.kind) stalls.set(e.droidStall.kind, (stalls.get(e.droidStall.kind) ?? 0) + 1);
  }
  const stallHtml = stalls.size
    ? `<p class="rp-note">Powód stallu produkcji droida (lata × imperia, prosto z <code>FactorySystem.getStallReason</code>):
       ${[...stalls.entries()].map(([k, n]) => `<b>${esc(k)}</b>=${n}`).join(' · ')}</p>` : '';
  return `<h2 class="rp-h2">Co blokuje pierwszą placówkę AI</h2>
  <p class="rp-note">Rozbicie zestawu (autonomiczny solar + kopalnia) na pozycje, których NIE MA w magazynie
    macierzystej na koniec przebiegu. To odpowiedź na „czy stall AI to ta sama ściana komponentów co u gracza".</p>
  <table class="rp-table"><thead><tr><th>pozycja</th><th class="num">u ilu imperiów</th><th></th><th class="num">średni brak</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">brak — zestaw osiągalny wszędzie</td></tr>'}</tbody></table>
  ${stallHtml}`;
}

// ── Progi zdrowia (WARN) ─────────────────────────────────────────
function renderWarns(data) {
  const seeds = data?.seeds ?? [];
  const roll = new Map();
  for (const s of seeds) for (const w of (s.health?.warns ?? [])) {
    const rec = roll.get(w.code) ?? { code: w.code, count: 0, sample: w.detail, seeds: new Set() };
    rec.count++; rec.seeds.add(s.seed);
    roll.set(w.code, rec);
  }
  const rows = [...roll.values()].sort((a, b) => b.count - a.count).map(r => `<tr>
    <td><code>${esc(r.code)}</code></td><td class="num">${r.count}</td><td class="num">${r.seeds.size}</td>
    <td class="rp-reason">${esc(r.sample)}</td></tr>`).join('');
  const th = data?.thresholds ?? {};
  return `<h2 class="rp-h2">Progi zdrowia imperium — naruszenia</h2>
  <p class="rp-note">Progi są <b>wstępne i przestrajalne</b> (kryteria pomiaru, nie stałe gry):
    <code>${esc(JSON.stringify(th))}</code>. Naruszenie = linia WARN, nigdy zmiana w grze.</p>
  <table class="rp-table"><thead><tr><th>kod</th><th class="num">naruszeń</th><th class="num">seedów</th><th>przykład</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">brak naruszeń</td></tr>'}</tbody></table>`;
}

function shortSeed(s) { return String(s).replace(/^balans-gate1_/, 'seed_'); }

// ── Styl (light + dark; recessive chrome — wspólny język z PopReport) ──
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
.rp-head h1{font-size:22px;margin:0 0 4px;font-weight:650}
.rp-meta{color:var(--ink2);font-size:13px;margin:0}
.rp-h2{font-size:16px;margin:30px 0 6px;font-weight:620}
.rp-h3{font-size:13.5px;margin:14px 0 6px;font-weight:620;color:var(--ink2)}
.rp-note{color:var(--ink2);font-size:12.5px;margin:0 0 10px}
.rp-bad-note{color:#d03b3b;font-size:13px;font-weight:620;margin:0 0 6px}
.rp-verdict{margin:18px 0;padding:16px 18px;border-radius:10px;border:1px solid var(--border);
  background:var(--card);border-left:5px solid var(--axis)}
.rp-verdict.rp-edge-bad{border-left-color:#d03b3b} .rp-verdict.rp-edge-good{border-left-color:#0ca30c}
.rp-verdict.rp-edge-warn{border-left-color:#fab219} .rp-verdict.rp-edge-neutral{border-left-color:#8a8980}
.rp-verdict-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rp-verdict-head h2{font-size:17px;margin:0;font-weight:640}
.rp-verdict-sub{color:var(--ink2);font-size:13px;margin:6px 0 0}
.rp-badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;font-weight:650;color:#fff;background:var(--muted)}
.rp-badge.rp-bad{background:#d03b3b} .rp-badge.rp-good{background:#0ca30c} .rp-badge.rp-warn{background:#fab219;color:#3a2a00}
.rp-tiles{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
.rp-tile{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:140px;display:flex;flex-direction:column;gap:2px}
.rp-tile-lab{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.rp-tile-big{font-size:22px;font-weight:680}
.rp-tile-sub{font-size:12px;color:var(--ink2)}
.rp-ink-bad{color:#d03b3b} .rp-ink-good{color:#0ca30c}
.rp-method{margin:16px 0;padding:14px 16px;border-radius:10px;background:var(--surface);border:1px dashed var(--axis)}
.rp-method h3{margin:0 0 8px;font-size:14.5px;font-weight:640}
.rp-method ul{margin:0;padding-left:18px} .rp-method li{font-size:13px;color:var(--ink2);margin-bottom:6px}
.rp-legend{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 8px;font-size:12.5px;color:var(--ink2)}
.rp-leg-item{display:inline-flex;align-items:center;gap:6px}
.rp-svg{width:100%;height:auto;background:var(--surface);border-radius:8px;border:1px solid var(--border)}
.rp-axis{stroke:var(--axis);stroke-width:1} .rp-tick{font-size:9px;fill:var(--muted)}
.rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;margin-top:8px}
.rp-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px}
.rp-card-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px}
.rp-mini-lab{font-size:10.5px;color:var(--muted);margin:6px 0 2px}
.rp-table{border-collapse:collapse;font-size:12px;width:100%;font-variant-numeric:tabular-nums;margin-bottom:6px}
.rp-table th,.rp-table td{border-bottom:1px solid var(--grid);padding:4px 8px;text-align:left;vertical-align:top}
.rp-table th{color:var(--muted);font-weight:600} .rp-table .num{text-align:right}
.rp-reason{color:var(--ink2);font-size:11.5px;max-width:420px}
.rp-two{display:grid;grid-template-columns:minmax(280px,1fr) minmax(320px,1.6fr);gap:18px}
@media (max-width:900px){.rp-two{grid-template-columns:1fr}}
.rp-barcell{width:120px} .rp-bar{display:block;height:9px;border-radius:2px;background:var(--muted)}
.rp-bar-good{background:#0ca30c} .rp-bar-bad{background:#d03b3b} .rp-bar-warn{background:#fab219}
.rp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px}
.rp-foot{margin-top:32px;padding-top:12px;border-top:1px solid var(--grid);color:var(--muted);font-size:11.5px}
.rp-foot p{margin:2px 0}
</style>`;

export default renderAiReport;
