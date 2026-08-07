// ═══════════════════════════════════════════════════════════════
// WOJNA I POKÓJ 1.0 — D2/E7 — DiplomacyReport (HTML raport, MACIERZE AKCEPTACJI)
// ───────────────────────────────────────────────────────────────
// Czysta funkcja renderDiplomacyReport(data) → fragment HTML (inline CSS, ZERO
// zewnętrznych zależności — plik otwieralny offline). `data` = payload z
// balans-diplomacy-telemetry.mjs (meta / matrix / terms / seeds[] / panel).
//
// ⚠ TABELA, NIE WYKRES — wymóg fazy. To jest przyrząd strojenia wag: czyta się go
// szukając LICZBY w konkretnej komórce („od jakiej opinii xenofag podpisze pakt"),
// a nie oceniając kształt krzywej. Dlatego zero SVG i zero interpolacji.
//
// ⚠ UCZCIWOŚĆ JEST WYMOGIEM, nie ozdobą (Decyzja 2 fazy D2): termy bezczynne muszą
// być JAWNIE oznaczone, żeby nikt nie stroił wag względem termu zwracającego zero.
// Oznaczenie bierzemy z danych (status z katalogu E1), a zmierzony wpływ w sąsiedniej
// kolumnie jest jego dowodem — gdy się rozjadą, raport to pokazuje jako ⚠.
// ═══════════════════════════════════════════════════════════════

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const num = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : (Math.round(x * 10 ** d) / 10 ** d).toString());

// Etykiety statusów termów — słownik jest CZĘŚCIĄ oznaczenia, nie kosmetyką.
const STATUS_LABEL = {
  live:    ['DZIAŁA',   'good',    'liczy i ma źródło danych'],
  stub:    ['BEZCZYNNY', 'bad',    'zawsze 0 — naprawa poza tą fazą'],
  unfed:   ['BEZ ŹRÓDŁA', 'warn',  'liczy poprawnie, ale nikt nie zasila wejścia'],
  partial: ['CZĘŚCIOWY', 'warn',   'widzi tylko wycinek świata'],
};

// ── Główny render ────────────────────────────────────────────────
export function renderDiplomacyReport(data) {
  const meta   = data?.meta ?? {};
  const matrix = data?.matrix ?? null;
  const terms  = data?.terms ?? [];
  const seeds  = data?.seeds ?? [];
  const panel  = data?.panel ?? {};
  const v      = panel.verdict ?? { outcome: 0, label: '—' };
  const vCls   = v.outcome === 1 ? 'bad' : v.outcome === 2 ? 'good' : v.outcome === 3 ? 'warn' : 'neutral';

  return `<div class="viz-root">
${STYLE}
<header class="dp-head">
  <h1>WOJNA I POKÓJ 1.0 — D2/E7 · MACIERZE AKCEPTACJI</h1>
  <p class="dp-meta">
    class <b>${esc(meta.planetClass ?? '?')}</b> · ${esc(String(meta.seeds ?? seeds.length))} seedów ·
    ${esc(String(meta.targetGy ?? '?'))} game-lat · jednostka: <b>game-years</b> (1 gy = 12 civ-yr) ·
    read-only instrument, <b>zero stałych balansu, zero zmian w dyplomacji</b>
  </p>
</header>

${renderVerdict(panel, v, vCls, matrix)}
${renderLimits(meta, matrix, terms, panel)}
${renderMatrix(matrix)}
${renderTerms(terms)}
${renderObserved(panel, seeds)}

<footer class="dp-foot">
  <p>${esc(meta.tool ?? 'BALANS — D2/E7 diplomacy acceptance telemetry')}</p>
  <p>${esc(meta.note ?? '')}</p>
</footer>
</div>`;
}

// ── Werdykt + kafle ──────────────────────────────────────────────
function renderVerdict(panel, v, vCls, matrix) {
  const outcomeText = {
    1: 'Któryś czasownik odpowiada tak samo przy KAŻDYM archetypie i agendzie — jego wagi nie są gałką, tylko stałą w przebraniu. Poprawić PRZED E2.',
    2: 'Macierz różnicuje decyzje, a przebieg dociera w okolice progów — E2 może przeliczać dawne progi na wagi z pomiarem w ręku.',
    3: 'Macierz różnicuje, ale obserwowana opinia nie sięga granic decyzji — strojenie odbywałoby się w próżni.',
    0: 'Brak danych',
  }[v.outcome] ?? '';
  const nt = matrix?.nearThreshold ?? {};
  const tiles = [
    ['Komórki macierzy', num(matrix?.cells?.length), `${num(matrix?.archetypes?.length)} archetypów × ${num(matrix?.objectives?.length)} agend × ${num(matrix?.verbs?.length)} czasowników`],
    ['Decyzje „na styk"', pct(nt.pct), `${num(nt.near)} z ${num(nt.total)} w ±${num(matrix?.nearPts ?? 5)} pkt od progu`],
    ['Czasowniki zdegenerowane', num(matrix?.degenerate?.length ?? 0), 'odpowiadają identycznie wszędzie', (matrix?.degenerate?.length ?? 0) > 0 ? 'bad' : 'good'],
    ['Opinia w przebiegu', `${num(panel.medOpinionMin)} … ${num(panel.medOpinionMax)}`, 'mediana min/max po seedach'],
  ];
  return `<section class="dp-verdict dp-edge-${vCls}">
  <div class="dp-verdict-head">
    <span class="dp-badge dp-${vCls}">Outcome ${esc(String(v.outcome))}</span>
    <h2>${esc(v.label)}</h2>
  </div>
  <p class="dp-verdict-sub">${esc(outcomeText)}</p>
  <div class="dp-tiles">
    ${tiles.map(([lab, big, sub, cls]) => `<div class="dp-tile">
      <span class="dp-tile-lab">${esc(lab)}</span>
      <span class="dp-tile-big${cls ? ' dp-ink-' + cls : ''}">${esc(big)}</span>
      <span class="dp-tile-sub">${esc(sub)}</span>
    </div>`).join('')}
  </div>
</section>`;
}

// ── Granice pomiaru (WYMAGANE — uczciwość ponad kompletnością) ───
function renderLimits(meta, matrix, terms, panel) {
  const inert = terms.filter(t => t.status !== 'live');
  const c = matrix?.conditions ?? {};
  return `<section class="dp-method">
  <h3>⚠ Granice tego pomiaru — przeczytaj przed strojeniem wag</h3>
  <ul>
    <li><b>${inert.length} z ${terms.length} termów nie liczy się w pełni w D2</b>:
      ${inert.map(t => `<code>${esc(t.id)}</code>`).join(', ') || '—'}.
      Ich wagi są w katalogu AUTORSKIE, ale wkład jest zerowy albo cząstkowy — <b>nie wolno
      stroić wag pozostałych termów tak, żeby „skompensować" te kolumny</b>. Szczegóły
      i powód w tabeli termów niżej.</li>
    <li><b>Macierz jest SYNTETYCZNA i to jest jej zaleta.</b> Silnik odpytujemy na siatce
      przy warunkach trzymanych stałe (napięcie ${esc(String(c.tension ?? '—'))},
      pamięć ${esc(String(c.memory ?? '—'))}, oferta ${esc(String(c.offer ?? '—'))},
      cechy ${esc(String(c.traits ?? '—'))}). Zmienną jest wyłącznie opinia — mierzymy WAGI,
      nie scenariusz. Liczby z tabeli NIE są prognozą częstości w rozgrywce.</li>
    <li><b>Dlatego obok macierzy jest sekcja OBSERWACJI.</b> Tabela hipotez bez sprawdzenia,
      czy gra w ogóle dociera w okolice progu, potrafi wyglądać zdrowo przy martwej granicy
      decyzji. Obserwowana opinia w tym przebiegu: <b>${num(panel.medOpinionMin)} … ${num(panel.medOpinionMax)}</b>.</li>
    <li><b>Silnik nie jest jeszcze wpięty w rozgrywkę</b> (E1 stoi samodzielnie; retrofit to E2/E3).
      Obserwacje pokazują więc relacje, które gra wytwarza DZIŚ — i to jest właściwe odniesienie
      dla parytetu, bo E2 ma nie zmienić wyniku dla tych samych wejść.</li>
    <li><b>Jedna zmieniona zmienna względem panelu referencyjnego</b>: <code>aiEmpires: true</code>
      (imperia AI żyją, żeby były jakiekolwiek relacje). Zdarzenia losowe zostają wyłączone.</li>
  </ul>
</section>`;
}

// ── MACIERZ AKCEPTACJI — główny artefakt ─────────────────────────
function renderMatrix(matrix) {
  if (!matrix?.cells?.length) return '<h2 class="dp-h2">Macierz akceptacji</h2><p class="dp-note">brak danych</p>';
  const { verbs, archetypes, objectives, cells } = matrix;
  const key = (a, o, v) => `${a}|${o}|${v}`;
  const byKey = new Map(cells.map(c => [key(c.archetype, c.objective, c.verb), c]));

  const head = `<tr><th>archetyp</th><th>agenda</th>${verbs.map(v =>
    `<th class="num">${esc(v)}</th>`).join('')}</tr>`;

  const body = archetypes.map(a => objectives.map((o, oi) => {
    const cellsRow = verbs.map(v => {
      const c = byKey.get(key(a, o, v));
      if (!c) return '<td class="num">—</td>';
      if (c.blocked) return '<td class="num dp-blocked" title="pre-warunek blokuje w tych warunkach">—</td>';
      const cls = c.acceptPct === 0 ? ' dp-cell-no' : c.acceptPct === 1 ? ' dp-cell-all' : '';
      const minOp = c.minOpinion == null ? 'nigdy' : `≥${c.minOpinion}`;
      return `<td class="num${cls}" title="próg ${num(c.threshold)} pkt · wynik przy opinii 0: ${num(c.scoreAtZero, 1)} (margines ${num(c.marginAtZero, 1)})">` +
        `<b>${esc(minOp)}</b><span class="dp-sub"> ${pct(c.acceptPct)}</span></td>`;
    }).join('');
    const archCell = oi === 0
      ? `<td rowspan="${objectives.length}" class="dp-arch">${esc(a)}</td>` : '';
    return `<tr>${archCell}<td class="dp-obj">${esc(o)}</td>${cellsRow}</tr>`;
  }).join('')).join('');

  const degen = (matrix.degenerate ?? []).length
    ? `<p class="dp-bad-note">⚠ Czasowniki bez zróżnicowania: ${matrix.degenerate.map(d =>
        `<code>${esc(d.verb)}</code> (${esc(d.kind)})`).join(', ')} — ich wagi nie są gałką strojenia.</p>`
    : '';

  return `<h2 class="dp-h2">Macierz akceptacji — archetyp × agenda × czasownik</h2>
  <p class="dp-note">W komórce: <b>minimalna opinia</b>, przy której propozycja przechodzi, oraz
    (mniejszym drukiem) <b>odsetek siatki opinii</b>, który akceptuje. Siatka:
    <code>${esc((matrix.opinionGrid ?? []).join(', '))}</code>. Najedź na komórkę, by zobaczyć próg
    w punktach i margines przy opinii 0. „—" = pre-warunek blokuje twardo (nie było oceny).</p>
  ${degen}
  <div class="dp-scroll"><table class="dp-table dp-matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  <p class="dp-note">Kotwice parytetu z E1 (roster gry: <code>industrialist</code> i <code>expansionist</code>):
    <code>trade_agreement ≥10</code> · <code>non_aggression ≥25</code> · <code>alliance ≥30</code> —
    dokładnie dawne progi 60/75/80 przeliczone przez mostek <code>trust = 50 + opinia</code>.
    <b>E2 ma te trzy komórki utrzymać</b>; każda inna zmiana jest zamierzona i mierzona tą tabelą.</p>`;
}

// ── Tabela termów: wagi + STATUS (wymóg Decyzji 2) ───────────────
function renderTerms(terms) {
  if (!terms.length) return '';
  const verbs = [...new Set(terms.flatMap(t => Object.keys(t.weights ?? {})))];
  const rows = terms.map(t => {
    const [lab, cls, why] = STATUS_LABEL[t.status] ?? [t.status, 'neutral', ''];
    const warnMark = t.inertUnexpected
      ? ' <span class="dp-badge dp-bad" title="deklarowany jako działający, ale sonda nie ruszyła go niczym">⚠ NIESPÓJNY</span>' : '';
    const verdictCell = t.cannotMove
      ? '<b>nie da się ruszyć</b>'
      : t.worksButUnfed ? 'liczy — brak paliwa w grze' : 'liczy i ma paliwo';
    return `<tr class="${t.status !== 'live' ? 'dp-row-inert' : ''}">
      <td><code>${esc(t.id)}</code>${warnMark}</td>
      <td><span class="dp-badge dp-${cls}">${esc(lab)}</span></td>
      ${verbs.map(v => `<td class="num">${t.weights?.[v] == null ? '·' : esc(String(t.weights[v]))}</td>`).join('')}
      <td class="num${t.cannotMove ? ' dp-cell-no' : ''}">${num(t.probeMaxAbs, 1)}</td>
      <td class="dp-reason">${esc(verdictCell.replace(/<\/?b>/g, ''))} · ${esc(why)}${why ? ' — ' : ''}${esc(firstSentence(t.note))}</td>
    </tr>`;
  }).join('');
  return `<h2 class="dp-h2">Termy — wagi per czasownik i UCZCIWY status</h2>
  <p class="dp-note">Kolumna <b>sonda |wkład|</b> to największa wartość bezwzględna, jaką term potrafi
    wnieść, gdy poda mu się SKRAJNE wejście. Zero oznacza, że termu <b>nie da się ruszyć niczym</b>.
    To jest dowód statusu, a nie jego powtórzenie:</p>
  <ul class="dp-note dp-ul">
    <li><code>relative_power</code> — 0 przy niezerowych wagach. Tak ma być: to STUB, dopóki audyt R2
      nie zostanie naprawiony w WAR_BACKBONE. <b>Nie stroić wag pozostałych termów pod tę kolumnę.</b></li>
    <li><code>memory</code> — 0, bo katalog dowodów jest PUSTY: każdy typ incydentu, który gra dziś
      zapisuje, wchodzi do wyniku innym kanałem (opinia albo napięcie), a wyłączne dowody zdrady
      dopisuje dopiero D4.</li>
    <li>termy z wkładem &gt; 0 przy statusie innym niż DZIAŁA <b>liczą poprawnie — po prostu nikt ich
      w grze nie zasila</b> (reputacja rośnie dopiero od D4, oferty nie ma UI, cechę erratic rzuca E5).
      To rozróżnienie jest całą treścią oznaczeń K-2 / K-4 / K-5.</li>
  </ul>
  <p class="dp-note">Term oznaczony <b>DZIAŁA</b> z wkładem 0 dostaje ⚠ — wtedy oznaczenie kłamie
    albo kod jest martwy.</p>
  <div class="dp-scroll"><table class="dp-table"><thead><tr>
    <th>term</th><th>status</th>${verbs.map(v => `<th class="num">${esc(v)}</th>`).join('')}
    <th class="num">sonda |wkład|</th><th>werdykt · dlaczego</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function firstSentence(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  const i = t.indexOf('. ');
  return i > 0 ? t.slice(0, i + 1) : t;
}

// ── Obserwacja żywego przebiegu ──────────────────────────────────
function renderObserved(panel, seeds) {
  const rows = seeds.map(s => {
    const sm = s.summary ?? {};
    return `<tr>
      <td><code>${esc(shortSeed(s.seed))}</code></td>
      <td class="num">${num(sm.empiresObserved)}</td>
      <td class="num">${num(sm.opinionMin)}</td>
      <td class="num">${num(sm.opinionMed)}</td>
      <td class="num">${num(sm.opinionMax)}</td>
      <td class="num">${num(sm.tensionMax)}</td>
      <td class="num">${num(sm.warYears)}</td>
      <td class="num">${sm.anyTreaty ? 'tak' : 'nie'}</td>
    </tr>`;
  }).join('');
  const wiredWarn = panel.wiredEverywhere === false
    ? '<p class="dp-bad-note">⚠ W części seedów zabrakło DiplomacySystem albo EmpireRegistry — te wiersze nic nie mierzą.</p>'
    : '';
  return `<h2 class="dp-h2">Obserwacja przebiegu — czy gra dociera w okolice progów</h2>
  <p class="dp-note">Bez tej sekcji macierz jest tabelą hipotez. Jeśli obserwowana opinia nigdy nie
    dobija do <b>10</b>, granica umowy handlowej leży poza zasięgiem rozgrywki i strojenie wag
    niczego nie zmieni — trzeba wtedy ruszyć ŹRÓDŁA opinii (emisariusze, handel), nie progi.</p>
  ${wiredWarn}
  <table class="dp-table"><thead><tr>
    <th>seed</th><th class="num">imperiów</th><th class="num">opinia min</th><th class="num">mediana</th>
    <th class="num">max</th><th class="num">napięcie max</th><th class="num">lat wojny</th><th class="num">traktat?</th>
  </tr></thead><tbody>${rows || '<tr><td colspan="8">brak danych</td></tr>'}</tbody></table>
  <p class="dp-note">„lat wojny" liczone jako suma imperium-lat w stanie <code>war</code>.
    Napięcie max zasila detektor <code>DIPLOMACY_DEAD</code> — po E3/E6 może zacząć zapalać się
    z innego powodu niż dotąd, więc mierzymy je od początku fazy.</p>`;
}

function shortSeed(s) { return String(s).replace(/^balans-[a-z0-9]+_/, 'seed_'); }

// ── Styl (light + dark; wspólny język z AiReport, własny prefiks dp-) ──
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
.dp-head h1{font-size:22px;margin:0 0 4px;font-weight:650}
.dp-meta{color:var(--ink2);font-size:13px;margin:0}
.dp-h2{font-size:16px;margin:30px 0 6px;font-weight:620}
.dp-note{color:var(--ink2);font-size:12.5px;margin:0 0 10px}
.dp-bad-note{color:#d03b3b;font-size:13px;font-weight:620;margin:0 0 6px}
.dp-verdict{margin:18px 0;padding:16px 18px;border-radius:10px;border:1px solid var(--border);
  background:var(--card);border-left:5px solid var(--axis)}
.dp-verdict.dp-edge-bad{border-left-color:#d03b3b} .dp-verdict.dp-edge-good{border-left-color:#0ca30c}
.dp-verdict.dp-edge-warn{border-left-color:#fab219} .dp-verdict.dp-edge-neutral{border-left-color:#8a8980}
.dp-verdict-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dp-verdict-head h2{font-size:17px;margin:0;font-weight:640}
.dp-verdict-sub{color:var(--ink2);font-size:13px;margin:6px 0 0}
.dp-badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11.5px;font-weight:650;color:#fff;background:var(--muted)}
.dp-badge.dp-bad{background:#d03b3b} .dp-badge.dp-good{background:#0ca30c}
.dp-badge.dp-warn{background:#fab219;color:#3a2a00} .dp-badge.dp-neutral{background:#8a8980}
.dp-tiles{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
.dp-tile{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:150px;display:flex;flex-direction:column;gap:2px}
.dp-tile-lab{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.dp-tile-big{font-size:22px;font-weight:680}
.dp-tile-sub{font-size:12px;color:var(--ink2)}
.dp-ink-bad{color:#d03b3b} .dp-ink-good{color:#0ca30c}
.dp-method{margin:16px 0;padding:14px 16px;border-radius:10px;background:var(--surface);border:1px dashed var(--axis)}
.dp-method h3{margin:0 0 8px;font-size:14.5px;font-weight:640}
.dp-method ul{margin:0;padding-left:18px} .dp-method li{font-size:13px;color:var(--ink2);margin-bottom:6px}
.dp-scroll{overflow-x:auto}
.dp-table{border-collapse:collapse;font-size:12px;width:100%;font-variant-numeric:tabular-nums;margin-bottom:6px}
.dp-table th,.dp-table td{border-bottom:1px solid var(--grid);padding:4px 8px;text-align:left;vertical-align:top}
.dp-table th{color:var(--muted);font-weight:600} .dp-table .num{text-align:right}
.dp-matrix td.num{white-space:nowrap}
.dp-sub{color:var(--muted);font-size:11px}
.dp-arch{font-weight:650;background:var(--surface);vertical-align:middle}
.dp-obj{color:var(--ink2)}
.dp-cell-no{color:#d03b3b} .dp-cell-all{color:#0ca30c} .dp-blocked{color:var(--muted)}
.dp-row-inert{background:var(--surface)}
.dp-reason{color:var(--ink2);font-size:11.5px;max-width:420px}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px}
.dp-foot{margin-top:32px;padding-top:12px;border-top:1px solid var(--grid);color:var(--muted);font-size:11.5px}
.dp-foot p{margin:2px 0}
</style>`;

export default renderDiplomacyReport;
