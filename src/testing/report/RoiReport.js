// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — RoiReport (HTML raport, sekcja KOSZT↔WARTOŚĆ budynków)
// ───────────────────────────────────────────────────────────────
// Czysta funkcja renderRoiReport(data) → samodzielny HTML string (inline CSS
// + inline SVG, ZERO zewnętrznych zależności — plik otwieralny offline).
// `data` = payload z balans-roi-telemetry.mjs (meta / catalog / priceVsOre / seeds / panel).
//
// Struktura:
//   1. werdykt + kafle KPI        — czy koszt jest proporcjonalny do produkcji
//   2. skrzynka uczciwości        — WSZYSTKIE założenia wyceny i granice pomiaru
//   3. tor (a) produkcyjne        — zwrot w game-latach, skala LOGARYTMICZNA
//   4. z czego składa się koszt   — ruda widoczna vs ruda schowana w komponentach
//   5. tory (b) funkcjonalne      — mieszkania / nauka / handel, KAŻDY we własnej metryce
//   6. fabryka                    — przerób, wartość dodana, czas na komponenty
//   7. ulepszenia                 — koszt rośnie z poziomem, produkcja liniowo
//   8. katalog                    — pokrycie pomiaru + budynki bez mierzalnego wyjścia
//
// Kolory = STATUS palette (dataviz, reserved): fast=good, slow=warning,
// never=critical, nominal=info, none=neutral. good↔critical to para red-green →
// NIGDY sam kolor: legenda + ikona + etykieta + stała kolejność + TEKSTURA
// (ukośna kreska na „nigdy się nie zwraca").
//
// ⚠ Tokeny designu są świadomie ZDUPLIKOWANE z PopReport.js / ResourceReport.js:
// każdy raport to SAMODZIELNY artefakt HTML (otwierany offline, wysyłany
// pojedynczo), a tamte są zamkniętymi, zwalidowanymi artefaktami swoich slice'ów.
// ═══════════════════════════════════════════════════════════════

const STATE_COLOR = {
  fast:    '#0ca30c',  // good — zwraca się szybko
  mid:     '#2a78d6',  // info — zwraca się w rozsądnym czasie
  slow:    '#fab219',  // warning — zwraca się wolno
  never:   '#d03b3b',  // critical — nie zwraca się nigdy (brak dodatniego przepływu)
  none:    '#8a8980',  // neutral — brak metryki w tym slice
};
const STATE_LABEL = {
  fast:  'Zwrot ≤ 1 gy (natychmiast)',
  mid:   'Zwrot 1–10 gy',
  slow:  'Zwrot ≥ 10 gy (wolno)',
  never: 'Nie zwraca się (brak dodatniego przepływu)',
  none:  'Bez metryki w tym slice',
};
const STATE_ICON  = { fast: '✓', mid: '≡', slow: '▲', never: '✕', none: '·' };
const STATE_ORDER = ['fast', 'mid', 'slow', 'never', 'none'];

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n, d = 1) => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '∞';
  if (Math.abs(v) >= 10000) return Math.round(v).toLocaleString('pl-PL');
  return (Math.round(v * 10 ** d) / 10 ** d).toString();
};
const orDash = (n, d = 1) => (n == null ? '—' : num(n, d));
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const shortSeed = (s, prefix) => String(s).replace(new RegExp(`^${prefix ?? 'balans-gate1'}_`), 'seed_');

/** Stan zwrotu — ta sama drabina co progi pomiaru (knoby w meta.thresholds). */
export function paybackState(gy, thr = {}) {
  if (gy == null) return 'never';
  const fast = thr.PAYBACK_FAST_GY ?? 1, slow = thr.PAYBACK_SLOW_GY ?? 10;
  if (gy <= fast) return 'fast';
  if (gy < slow) return 'mid';
  return 'slow';
}

// ── Główny render ────────────────────────────────────────────────
export function renderRoiReport(data) {
  const meta    = data?.meta ?? {};
  const catalog = data?.catalog ?? {};
  const panel   = data?.panel ?? {};
  const seeds   = data?.seeds ?? [];
  const priceVsOre = data?.priceVsOre ?? {};
  const verdict = panel.verdict ?? { outcome: 2, label: '—' };
  const thr     = meta.thresholds ?? {};
  const prefix  = meta.seedPrefix ?? 'balans-gate1';

  const byType = panel.byType ?? {};
  const measured = Object.keys(byType).filter(id => catalog[id] && !catalog[id].isCapital);
  const inTrack = (id, tr) => (catalog[id]?.tracks ?? []).includes(tr);

  const prod = measured
    .filter(id => inTrack(id, 'productive') && byType[id].medPaybackGy != null)
    .sort((a, b) => byType[a].medPaybackGy - byType[b].medPaybackGy);
  const never = measured.filter(id => inTrack(id, 'productive') && byType[id].medPaybackGy == null);

  const vClass = verdict.outcome === 0 ? 'fast' : verdict.outcome === 1 ? 'slow' : 'none';

  return `<div class="viz-root">
${STYLE}
${HATCH_DEFS}
<header class="rr-head">
  <h1>BALANS 1.0 — Phase 2 · KOSZT ↔ WARTOŚĆ budynków (ROI)</h1>
  <p class="rr-meta">
    class <b>${esc(meta.planetClass ?? '?')}</b> · ${esc(String(meta.seeds ?? seeds.length))} seedów ·
    ${esc(String(meta.targetGy ?? '?'))} game-lat · jednostka: <b>game-years</b> (1 gy = 12 civ-yr) ·
    read-only instrument, <b>zero stałych balansu</b>
  </p>
</header>

${renderVerdict(panel, verdict, vClass, prod, never, thr)}

${renderHonesty(meta, panel, catalog, priceVsOre)}

${renderLegend()}

${renderProductive(prod, never, byType, catalog, thr, panel.verdictUnboosted, verdict.spread, panel.mineRateMult ?? 1)}

${renderCostSplit(catalog, panel)}

${renderFunctionalTracks(measured, byType, catalog, inTrack)}

${renderFactory(panel, catalog, priceVsOre, seeds, prefix)}

${renderUpgrades(catalog, prod)}

${renderCatalog(catalog, byType, measured, thr)}

<footer class="rr-foot">
  <p>${esc(meta.tool ?? 'BALANS 1.0 Phase 2 — ROI telemetry')} · koszt: ${esc(meta.costModel ?? '')}</p>
  <p>wartość: ${esc(meta.valueModel ?? '')}</p>
  <p>${esc(meta.scope ?? '')} · ${esc(meta.note ?? '')}</p>
</footer>
</div>`;
}

// ── 1. Werdykt + kafle ───────────────────────────────────────────
function renderVerdict(panel, verdict, vClass, prod, never, thr = {}) {
  const tiles = [
    ['Rozrzut zwrotu', verdict.spread != null ? `${num(verdict.spread, 1)}×` : '—',
      verdict.best ? `${esc(verdict.best)} ${num(verdict.bestPaybackGy, 2)} gy → ${esc(verdict.worst)} ${num(verdict.worstPaybackGy, 2)} gy` : 'brak danych', vClass],
    ['Koszt przez fabrykę', pct(panel.medEmbeddedShare), 'mediana katalogu — ruda schowana w komponentach', 'slow'],
    ['Zmierzone / katalog', `${panel.measuredTypes ?? 0} / ${panel.catalogSize ?? 0}`,
      'reszta liczona NOMINALNIE z danych', 'none'],
    ['Nie zwracają się', String(never.length), 'zmierzone, bez dodatniego przepływu', 'never'],
  ];
  return `<section class="rr-verdict rr-b-${vClass}">
  <div class="rr-verdict-head">
    <span class="rr-badge rr-bg-${vClass}">${STATE_ICON[vClass] ?? ''} Outcome ${esc(String(verdict.outcome))}</span>
    <h2>${esc(verdict.label ?? '')}</h2>
  </div>
  <p class="rr-verdict-sub">Zwrot = <b>koszt w pełni obciążony</b> (ruda bezpośrednia + ruda schowana w komponentach)
     ÷ <b>zmierzony przepływ netto</b> budynku (produkcja − utrzymanie − energia), w game-latach.
     Rozrzut ponad <b>${num(thr.SPREAD_FLAT ?? 10, 0)}×</b> czytamy jako „koszty nieproporcjonalne do produkcji".
     Budynki nie-towarowe (mieszkania, nauka, handel) mają <b>własne</b> metryki niżej — świadomie bez wspólnego mianownika.</p>
  <div class="rr-tiles">
    ${tiles.map(([lab, big, sub, cls]) => `<div class="rr-tile">
      <span class="rr-tile-lab">${esc(lab)}</span>
      <span class="rr-tile-big rr-ink-${cls}">${big}</span>
      <span class="rr-tile-sub">${sub}</span>
    </div>`).join('')}
  </div>
</section>`;
}

// ── 2. Skrzynka uczciwości ───────────────────────────────────────
function renderHonesty(meta, panel, catalog, priceVsOre) {
  const thr = meta.thresholds ?? {};
  const below = Object.entries(priceVsOre).filter(([, v]) => v.belowOre)
    .sort((a, b) => (a[1].ratio ?? 0) - (b[1].ratio ?? 0));
  const unpriced = new Set();
  for (const c of Object.values(catalog)) for (const k of (c.unpricedOut ?? [])) unpriced.add(k);
  const mineRatio = panel.medMineNameplateRatio;

  return `<section class="rr-method">
  <h3>⚠ Metodologia — co ten pomiar naprawdę mierzy (i czego nie)</h3>
  <ul>
    <li><b>Wspólna miara toru produkcyjnego to Kr wg WŁASNEJ tabeli gry</b>
      (<code>TradeValuesData.BASE_PRICE</code> — ta sama, po której handluje <code>CivilianTradeSystem</code>),
      nie wymyślone wagi. <b>Obie strony sprowadzone do rudy</b>: koszt = ruda bezpośrednia + ruda rozwinięta
      z komponentów, wyjście = zasoby/energia po cenie tej samej tabeli. To <b>najważniejsze założenie</b>
      całego raportu: gdyby ceny gry były źle wyskalowane względem siebie, ranking zwrotu też byłby.
      Ceny mają WŁASNY slice — tutaj są przyjęte, nie oceniane.</li>
    <li><b>Energia jest wyceniona 1 Kr</b> (tabela gry), czyli 1:1 z żelazem. Cała wartość elektrowni wisi
      na tej jednej liczbie — czytaj ich pozycję w rankingu z tą świadomością.</li>
    <li><b>Nauka NIE MA ceny</b> w tabeli gry${unpriced.size ? ` (jak i: <b>${[...unpriced].map(esc).join(', ')}</b>)` : ''} —
      dlatego laboratoria <b>nie mogą</b> wejść do wspólnego rankingu. To brak danych, nie wybór metodologiczny;
      mają własną metrykę „Kr kosztu za 1 nauka/gy".</li>
    <li><b>Scenariusz przebiegu</b>: <code>civilization_boosted</code> (parytet z POP i ZASOBAMI) —
      <b>kopalnie ×5, złoża ×10, fabryka ×1.5</b>. Zwrot kopalń jest w tym przebiegu ok. <b>5× szybszy</b>
      niż w scenariuszu standardowym; kolumna „nominalnie" (z danych) tego mnożnika nie zawiera.</li>
    <li><b>MIERZONE vs NOMINALNE.</b> Mierzone = żywe <code>effectiveRates</code> (teren, tech, obsada, poziom,
      utrzymanie, energia) + realny urobek kopalń (<code>getMineOutputEstimate</code>: obsada × dostępność
      energii × wyczerpanie złoża). Nominalne = surowe <code>rates</code> z danych na poziomie 1, dla budynków,
      których bot nigdy nie postawił. Każdy wiersz jest oznaczony.</li>
    ${mineRatio != null ? `<li><b>Tooltip kopalni w grze pokazuje ×${num(mineRatio, 2)} realnego urobku</b> —
      rozbicie <code>ResourceSystem</code> nie stosuje obsady ani throttlingu brownoutu. Do zwrotu użyto liczby
      <b>realnej</b>, nie tej z tooltipa (wątek §5 slice'u ZASOBY, teraz per budynek).</li>` : ''}
    <li><b>Koszt budowy liczony realną formułą gry</b> (<code>computeBuildResourceCost/CommodityCost</code>
      z dopłatą środowiskową planety), ale z <code>latBuildCost = 1</code> — modyfikator polarny zna tylko
      <code>_build</code> z kafla, więc koszt na kaflach polarnych jest <b>zaniżony</b> (ta sama granica co w slice ZASOBY).</li>
    <li><b>Płace są POZA nagłówkowym zwrotem</b>, choć w tej samej walucie: pochodzą z innej puli (kredyty,
      nie magazyn surowców). Tabela pokazuje wariant „+płace" obok — czytelnik ma obie liczby.</li>
    <li><b>Zakres</b>: kolonia <b>macierzysta</b>, poziom 1 (przepływ normalizowany na poziom).
      Kolonie wtórne i placówki poza slice'em.</li>
    <li>Progi (knoby POMIARU, nie balansu): szybki zwrot ≤ <b>${num(thr.PAYBACK_FAST_GY, 1)}</b> gy,
      wolny ≥ <b>${num(thr.PAYBACK_SLOW_GY, 1)}</b> gy, „koszty proporcjonalne" gdy rozrzut ≤
      <b>${num(thr.SPREAD_FLAT, 0)}×</b>, ROI mierzone dopiero po <b>${num(thr.MIN_YEARS, 0)}</b> seed-latach istnienia.</li>
  </ul>
  ${below.length ? `<p class="rr-defect"><b>⚠ ${below.length} towarów gra wycenia PONIŻEJ rudy w ich recepturze.</b>
     ${below.map(([id, v]) => `<code>${esc(id)}</code> ${num(v.price, 0)} Kr vs ${num(v.oreKr, 0)} Kr rudy (×${num(v.ratio, 2)})`).join(' · ')}.
     Dlatego „wartość dodana" fabryki potrafi wyjść <b>ujemna</b> — to własność CENNIKA, nie fabryki.
     Przy droidach jest to jawna decyzja projektowa (sink produkcyjny, komentarz w <code>TradeValuesData</code>).
     <b>Ceny to osobny slice — tutaj tylko odnotowane, nie rozstrzygnięte.</b></p>` : ''}
</section>`;
}

// ── Legenda ──────────────────────────────────────────────────────
function renderLegend() {
  const items = STATE_ORDER.map(s => {
    const sw = s === 'never'
      ? `<span class="rr-sw" style="background:${STATE_COLOR[s]};background-image:${HATCH_CSS}"></span>`
      : `<span class="rr-sw" style="background:${STATE_COLOR[s]}"></span>`;
    return `<span class="rr-leg-item">${sw}<b>${STATE_ICON[s]}</b> ${esc(STATE_LABEL[s])}</span>`;
  }).join('');
  return `<div class="rr-legend">${items}</div>`;
}

// ── 3. Tor (a): budynki produkcyjne ──────────────────────────────
function renderProductive(prod, never, byType, catalog, thr, vUn = null, spread = null, mineMult = 1) {
  if (prod.length === 0 && never.length === 0) return '';

  // Skala LOGARYTMICZNA — zwroty rozciągają się przez ~3 rzędy wielkości.
  const vals = prod.map(id => byType[id].medPaybackGy).filter(v => v > 0);
  const lo = Math.min(0.05, ...(vals.length ? vals : [0.05]));
  const hi = Math.max(10, ...(vals.length ? vals : [10]));
  const l0 = Math.log10(lo), l1 = Math.log10(hi);
  const W = 720, padL = 168, padR = 78, rowH = 22, barW = W - padL - padR;
  const xOf = (v) => padL + ((Math.log10(Math.max(lo, v)) - l0) / Math.max(1e-9, l1 - l0)) * barW;

  const ticks = [];
  for (let e = Math.floor(l0); e <= Math.ceil(l1); e++) {
    const v = 10 ** e;
    if (v < lo || v > hi * 1.2) continue;
    ticks.push(`<line x1="${xOf(v).toFixed(1)}" y1="0" x2="${xOf(v).toFixed(1)}" y2="${prod.length * rowH}" class="rr-grid"/>
      <text x="${xOf(v).toFixed(1)}" y="${prod.length * rowH + 11}" class="rr-tick">${v >= 1 ? v : v.toFixed(2)} gy</text>`);
  }

  const bars = prod.map((id, i) => {
    const a = byType[id], y = i * rowH;
    const st = paybackState(a.medPaybackGy, thr);
    const x = xOf(a.medPaybackGy);
    return `<text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="rr-svg-lab">${esc(id)}</text>
      <rect x="${padL}" y="${y + 4}" width="${Math.max(1, x - padL).toFixed(1)}" height="${rowH - 9}" rx="2" fill="${STATE_COLOR[st]}" opacity=".85"><title>${esc(id)}: zwrot ${num(a.medPaybackGy, 2)} gy — koszt ${num(a.krLoaded, 0)} Kr, przepływ ${num(a.medKrPerGyPerLevel, 0)} Kr/gy na poziom</title></rect>
      <text x="${(x + 6).toFixed(1)}" y="${y + rowH / 2 + 4}" class="rr-svg-num">${num(a.medPaybackGy, 2)} gy</text>`;
  }).join('\n');

  const rows = prod.map(id => {
    const a = byType[id], c = catalog[id];
    const st = paybackState(a.medPaybackGy, thr);
    const wageShare = a.medKrPerGyPerLevel > 0 ? a.medWageKrPerGyPerLevel / a.medKrPerGyPerLevel : null;
    return `<tr>
      <td><b>${esc(id)}</b> <span class="rr-mut">${esc(c.category)}</span></td>
      <td class="num">${num(a.krLoaded, 0)}</td>
      <td class="num">${pct(a.embeddedShare)}</td>
      <td class="num">${num(a.medKrPerGyPerLevel, 0)}</td>
      <td class="num rr-ink-${st}">${STATE_ICON[st]} ${num(a.medPaybackGy, 2)}</td>
      <td class="num rr-mut">${orDash(a.medPaybackUnboostedGy, 2)}</td>
      <td class="num">${orDash(a.medPaybackWithWagesGy, 2)}</td>
      <td class="num">${pct(wageShare)}</td>
      <td class="num">${a.measuredOn ?? 0}/${a.seeds ?? 0}</td>
      <td class="num rr-mut">${c.nominalPaybackGy != null ? num(c.nominalPaybackGy, 2) : '—'}</td>
    </tr>`;
  }).join('\n');

  const neverRows = never.map(id => {
    const a = byType[id], c = catalog[id];
    return `<tr class="rr-row-never">
      <td><b>${esc(id)}</b> <span class="rr-mut">${esc(c.category)}</span></td>
      <td class="num">${num(a.krLoaded, 0)}</td>
      <td class="num">${pct(a.embeddedShare)}</td>
      <td class="num rr-ink-never">${num(a.medKrPerGyPerLevel, 0)}</td>
      <td class="num rr-ink-never" colspan="5">${STATE_ICON.never} nie zwraca się — przepływ netto ujemny</td>
      <td class="num rr-mut">${c.nominalPaybackGy != null ? num(c.nominalPaybackGy, 2) : '—'}</td>
    </tr>`;
  }).join('\n');

  return `<h2 class="rr-h2">Tor (a) — budynki PRODUKCYJNE: po ilu game-latach budynek się zwraca</h2>
  <p class="rr-note">Oś X <b>logarytmiczna</b> (zwroty rozciągają się przez kilka rzędów wielkości).
    Zwrot = koszt w pełni obciążony ÷ zmierzony przepływ netto <b>na poziom</b>. Krótszy słupek = lepiej.</p>
  <svg class="rr-svg" viewBox="0 0 ${W} ${prod.length * rowH + 18}" role="img" aria-label="Zwrot budynków produkcyjnych">${ticks.join('')}${bars}</svg>
  <table class="rr-table">
    <thead><tr>
      <th>budynek</th><th class="num">koszt&nbsp;Kr</th><th class="num">w&nbsp;komponentach</th>
      <th class="num">Kr/gy&nbsp;na&nbsp;poziom</th><th class="num">ZWROT&nbsp;gy</th><th class="num">×1&nbsp;wydob.</th><th class="num">+płace&nbsp;gy</th>
      <th class="num">płace&nbsp;%</th><th class="num">seedy</th><th class="num">nominalnie&nbsp;gy</th>
    </tr></thead>
    <tbody>${rows}${neverRows}</tbody>
  </table>
  ${vUn && vUn.spread != null ? `<p class="rr-note rr-callout">⚖ <b>Kontrfaktycznie, bez mnożnika wydobycia scenariusza (×${num(mineMult, 0)}):</b>
    rozrzut zwrotu spada z <b>${num(spread, 2)}×</b> do <b>${num(vUn.spread, 2)}×</b>
    (${esc(vUn.best)} ${num(vUn.bestPaybackGy, 2)} gy … ${esc(vUn.worst)} ${num(vUn.worstPaybackGy, 2)} gy).
    Kolumna „×1 wydob." to ta sama ZMIERZONA seria z urobkiem kopalń podzielonym przez mnożnik scenariusza —
    czysta arytmetyka, nie drugi przebieg. Różnica między tymi dwiema liczbami to <b>udział scenariusza</b>
    w werdykcie; reszta jest własnością cennika.</p>` : ''}
  <p class="rr-note">„nominalnie" = ten sam rachunek na surowych danych (poziom 1, bez terenu/tech/obsady) —
    różnica mierzone↔nominalne to wpływ bonusów terenu i technologii. Kopalnie nie mają nominalnej stawki
    (<code>rates: {}</code> — urobek liczy się dynamicznie ze złóż), stąd „—”.</p>`;
}

// ── 4. Z czego składa się koszt ──────────────────────────────────
function renderCostSplit(catalog, panel) {
  const rows = Object.values(catalog)
    .filter(c => !c.isCapital && c.cost.krLoaded > 0)
    .sort((a, b) => b.cost.krLoaded - a.cost.krLoaded)
    .slice(0, 24);
  if (rows.length === 0) return '';
  const max = rows[0].cost.krLoaded || 1;
  const W = 720, padL = 168, padR = 96, rowH = 20, barW = W - padL - padR;

  const bars = rows.map((c, i) => {
    const y = i * rowH;
    const wD = (c.cost.krDirect / max) * barW;
    const wE = (c.cost.krEmbedded / max) * barW;
    return `<text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="rr-svg-lab">${esc(c.id)}</text>
      <rect x="${padL}" y="${y + 3}" width="${Math.max(0.5, wD).toFixed(1)}" height="${rowH - 8}" fill="${STATE_COLOR.mid}"><title>${esc(c.id)}: ruda bezpośrednia ${num(c.cost.krDirect, 0)} Kr</title></rect>
      <rect x="${(padL + wD).toFixed(1)}" y="${y + 3}" width="${Math.max(0.5, wE).toFixed(1)}" height="${rowH - 8}" fill="${STATE_COLOR.slow}"><title>${esc(c.id)}: ruda schowana w komponentach ${num(c.cost.krEmbedded, 0)} Kr (${pct(c.cost.embeddedShare)})</title></rect>
      <text x="${(padL + wD + wE + 6).toFixed(1)}" y="${y + rowH / 2 + 4}" class="rr-svg-num">${num(c.cost.krLoaded, 0)} Kr · ${pct(c.cost.embeddedShare)}</text>`;
  }).join('\n');

  return `<h2 class="rr-h2">Z czego składa się prawdziwy koszt — ruda widoczna vs ruda schowana w komponentach</h2>
  <p class="rr-note">
    <span class="rr-key" style="background:${STATE_COLOR.mid}"></span> ruda z <code>cost</code> (to widzi gracz) ·
    <span class="rr-key" style="background:${STATE_COLOR.slow}"></span> ruda rozwinięta z <code>commodityCost</code> (fabryka).
    Mediana całego katalogu: <b>${pct(panel.medEmbeddedShare)}</b> prawdziwego kosztu przechodzi przez fabrykę.
    24 najdroższe budynki.</p>
  <svg class="rr-svg" viewBox="0 0 ${W} ${rows.length * rowH + 6}" role="img" aria-label="Skład kosztu budynków">${bars}</svg>`;
}

// ── 5. Tory (b): metryki funkcjonalne ────────────────────────────
function renderFunctionalTracks(measured, byType, catalog, inTrack) {
  const housing = measured.filter(id => inTrack(id, 'housing'));
  const research = measured.filter(id => inTrack(id, 'research'));
  const trade = measured.filter(id => inTrack(id, 'trade'));

  const hTable = housing.length ? `<div class="rr-panel">
    <h3>Mieszkalne — Kr za jedno miejsce POP</h3>
    <table class="rr-table"><thead><tr><th>budynek</th><th class="num">koszt Kr</th><th class="num">miejsca/lv</th>
      <th class="num">Kr / miejsce</th><th class="num">utrzymanie Kr/gy</th><th>kategoria</th></tr></thead><tbody>
    ${housing.sort((a, b) => (byType[a].krLoaded ?? 0) - (byType[b].krLoaded ?? 0)).map(id => {
      const a = byType[id], c = catalog[id];
      const per = a.medHousingPerLevel > 0 ? a.krLoaded / a.medHousingPerLevel : null;
      return `<tr><td><b>${esc(id)}</b></td><td class="num">${num(a.krLoaded, 0)}</td>
        <td class="num">${num(a.medHousingPerLevel, 0)}</td><td class="num">${orDash(per, 1)}</td>
        <td class="num">${num(Math.max(0, -(a.medKrPerGyPerLevel ?? 0)), 1)}</td>
        <td class="rr-mut">${esc(c.category)}${c.tags.length ? ` (${esc(c.tags.join(','))})` : ''}</td></tr>`;
    }).join('')}
    </tbody></table>
    <p class="rr-note">⚠ budynek trafia tu przez samo pole <code>housing &gt; 0</code> — jeśli kolumna „kategoria"
      mówi co innego niż <code>population</code>, mieszkania są jego <b>skutkiem ubocznym</b>, nie funkcją.</p>
  </div>` : '';

  const rTable = research.length ? `<div class="rr-panel">
    <h3>Nauka — Kr kosztu za 1 nauka/gy</h3>
    <table class="rr-table"><thead><tr><th>budynek</th><th class="num">koszt Kr</th><th class="num">nauka/gy na lv</th>
      <th class="num">Kr za 1 nauka/gy</th><th class="num">w komponentach</th><th class="num">płace Kr/gy</th></tr></thead><tbody>
    ${research.sort((a, b) => (byType[b].medResearchPerGyPerLevel ?? 0) - (byType[a].medResearchPerGyPerLevel ?? 0)).map(id => {
      const a = byType[id];
      const per = a.medResearchPerGyPerLevel > 0 ? a.krLoaded / a.medResearchPerGyPerLevel : null;
      return `<tr><td><b>${esc(id)}</b></td><td class="num">${num(a.krLoaded, 0)}</td>
        <td class="num">${num(a.medResearchPerGyPerLevel, 1)}</td><td class="num">${orDash(per, 1)}</td>
        <td class="num">${pct(a.embeddedShare)}</td><td class="num">${num(a.medWageKrPerGyPerLevel, 1)}</td></tr>`;
    }).join('')}
    </tbody></table>
    <p class="rr-note">Nauka nie ma ceny w tabeli gry, więc <b>nie ma tu zwrotu w game-latach</b> — jest koszt
      za jednostkę tempa. Porównywalne między laboratoriami, <b>nieporównywalne</b> z torem produkcyjnym.</p>
  </div>` : '';

  const tTable = trade.length ? `<div class="rr-panel">
    <h3>Handlowe — przepustowość i zasięg</h3>
    <table class="rr-table"><thead><tr><th>budynek</th><th class="num">koszt Kr</th><th class="num">utrzymanie Kr/gy</th>
      <th>efekty z danych</th></tr></thead><tbody>
    ${trade.map(id => {
      const a = byType[id], c = catalog[id];
      return `<tr><td><b>${esc(id)}</b></td><td class="num">${num(a.krLoaded, 0)}</td>
        <td class="num">${num(Math.max(0, -(a.medKrPerGyPerLevel ?? 0)), 1)}</td>
        <td class="rr-mut">${esc(c.tags.join(', ') || '—')}</td></tr>`;
    }).join('')}
    </tbody></table>
    <p class="rr-note">Kredyty z handlu powstają w <code>CivilianTradeSystem</code> na poziomie CAŁEJ kolonii —
      przypisanie ich pojedynczemu budynkowi wymagałoby własnego pomiaru. Tutaj: koszt i deklarowany efekt.</p>
  </div>` : '';

  if (!hTable && !rTable && !tTable) return '';
  return `<h2 class="rr-h2">Tory (b) — budynki nie-towarowe, każdy we WŁASNEJ metryce</h2>
  <p class="rr-note">Świadomie <b>bez</b> wspólnego mianownika z torem (a): wymuszona wspólna liczba wyglądałaby
    na porównywalną, a nie byłaby.</p>
  <div class="rr-panels">${hTable}${rTable}${tTable}</div>`;
}

// ── 6. Fabryka ───────────────────────────────────────────────────
function renderFactory(panel, catalog, priceVsOre, seeds, prefix) {
  const f = panel.factory ?? {};
  const facCost = catalog.factory?.cost?.krLoaded ?? null;
  const perSeed = (seeds ?? []).map(s => `<tr>
    <td>${esc(shortSeed(s.seed, prefix))}</td>
    <td class="num">${num(s.summary?.factory?.points ?? 0, 0)}</td>
    <td class="num">${num(s.summary?.factory?.producedKrPerGy ?? 0, 0)}</td>
    <td class="num">${num(s.summary?.factory?.inputKrPerGy ?? 0, 0)}</td>
    <td class="num ${(s.summary?.factory?.valueAddedKrPerGy ?? 0) < 0 ? 'rr-ink-never' : 'rr-ink-fast'}">${num(s.summary?.factory?.valueAddedKrPerGy ?? 0, 0)}</td>
    <td class="num">${orDash(s.summary?.mineNameplateRatio, 2)}</td>
  </tr>`).join('');

  return `<h2 class="rr-h2">Fabryka — wątek, który wraca z każdego slice'u</h2>
  <p class="rr-note">Slice ZASOBY pokazał, że gospodarkę wiąże <b>komponent</b>, nie ruda. Ten slice dokłada
    drugą połowę: <b>${pct(panel.medEmbeddedShare)}</b> prawdziwego kosztu budynku przechodzi przez fabrykę, więc
    przepustowość fabryki jest w praktyce <b>walutą budowy</b>.</p>
  <table class="rr-table">
    <thead><tr><th>seed</th><th class="num">punkty</th><th class="num">wyjście Kr/gy</th>
      <th class="num">ruda Kr/gy</th><th class="num">wartość dodana</th><th class="num">kopalnia plate/real</th></tr></thead>
    <tbody>${perSeed}</tbody>
  </table>
  <p class="rr-note">Koszt samego budynku <code>factory</code>: <b>${orDash(facCost, 0)} Kr</b> w pełni obciążony
    (${pct(catalog.factory?.cost?.embeddedShare)} przez… fabrykę — pierwszy punkt produkcji trzeba kupić za komponenty,
    które można zrobić tylko w fabryce; startowa kolonia dostaje zapas na rozruch).
    Ujemna „wartość dodana" na części seedów <b>nie</b> znaczy, że fabryka niszczy wartość — patrz skrzynka
    uczciwości: kilka towarów gra wycenia poniżej ich rudy (droidy są takim sinkiem z założenia).</p>`;
}

// ── 7. Ulepszenia ────────────────────────────────────────────────
function renderUpgrades(catalog, prod) {
  const ids = prod.slice(0, 10).filter(id => catalog[id]?.upgrade2);
  if (ids.length === 0) return '';
  const rows = ids.map(id => {
    const c = catalog[id];
    const l1 = c.cost.krLoaded, u2 = c.upgrade2?.krLoaded ?? null, u3 = c.upgrade3?.krLoaded ?? null;
    return `<tr>
      <td><b>${esc(id)}</b></td>
      <td class="num">${num(l1, 0)}</td>
      <td class="num">${orDash(u2, 0)}</td>
      <td class="num">${orDash(u3, 0)}</td>
      <td class="num">${u2 != null && l1 > 0 ? num(u2 / l1, 2) + '×' : '—'}</td>
      <td class="num">${u3 != null && l1 > 0 ? num(u3 / l1, 2) + '×' : '—'}</td>
    </tr>`;
  }).join('');
  return `<h2 class="rr-h2">Ulepszenia — koszt rośnie z poziomem, produkcja rośnie liniowo</h2>
  <p class="rr-note">Formuła gry (<code>_upgrade</code>): koszt surowców = baza × poziom × 1.2, komponenty
    dopiero od Lv3 (× poziom−1). Produkcja rośnie <b>× poziom</b> (liniowo). Czyli każdy kolejny poziom kupuje
    <b>ten sam</b> przyrost produkcji za coraz większą cenę — a Lv2, który nie płaci komponentów, bywa
    <b>tańszy niż postawienie nowego budynku</b> dającego dokładnie tyle samo.</p>
  <table class="rr-table">
    <thead><tr><th>budynek</th><th class="num">budowa Lv1</th><th class="num">→ Lv2</th><th class="num">→ Lv3</th>
      <th class="num">Lv2 / Lv1</th><th class="num">Lv3 / Lv1</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── 8. Katalog ───────────────────────────────────────────────────
function renderCatalog(catalog, byType, measured, thr) {
  const all = Object.values(catalog).filter(c => !c.isCapital);
  const neverBuilt = all.filter(c => !measured.includes(c.id));
  const nominalProd = neverBuilt.filter(c => c.tracks.includes('productive') && c.nominalPaybackGy != null)
    .sort((a, b) => a.nominalPaybackGy - b.nominalPaybackGy);
  const noValue = neverBuilt.filter(c => c.tracks.includes('other'))
    .sort((a, b) => b.cost.krLoaded - a.cost.krLoaded);

  const nominalRows = nominalProd.map(c => {
    const st = paybackState(c.nominalPaybackGy, thr);
    return `<tr>
      <td><b>${esc(c.id)}</b> <span class="rr-mut">${esc(c.category)}</span></td>
      <td class="num">${num(c.cost.krLoaded, 0)}</td>
      <td class="num">${pct(c.cost.embeddedShare)}</td>
      <td class="num">${num(c.nominalKrPerGy, 0)}</td>
      <td class="num rr-ink-${st}">${STATE_ICON[st]} ${num(c.nominalPaybackGy, 2)}</td>
      <td class="rr-mut">${c.requires ? esc(c.requires) : '—'}</td>
    </tr>`;
  }).join('');

  const otherRows = noValue.map(c => `<tr>
    <td><b>${esc(c.id)}</b> <span class="rr-mut">${esc(c.category)}</span></td>
    <td class="num">${num(c.cost.krLoaded, 0)}</td>
    <td class="num">${pct(c.cost.embeddedShare)}</td>
    <td class="rr-mut">${esc(c.tags.join(', ') || '—')}</td>
  </tr>`).join('');

  return `<h2 class="rr-h2">Katalog — pokrycie pomiaru</h2>
  <p class="rr-note">Bot postawił <b>${measured.length}</b> z <b>${all.length}</b> budynków (bez stolicy).
    Reszta ma policzony koszt i ROI <b>NOMINALNE z danych</b> (poziom 1, bez terenu/tech/obsady) —
    to nie są liczby zmierzone i tak są oznaczone.</p>
  ${nominalProd.length ? `<h3 class="rr-h3">Produkcyjne, nigdy nie postawione — ROI nominalne</h3>
  <table class="rr-table"><thead><tr><th>budynek</th><th class="num">koszt Kr</th><th class="num">w komponentach</th>
    <th class="num">nominalnie Kr/gy</th><th class="num">zwrot gy</th><th>tech</th></tr></thead>
    <tbody>${nominalRows}</tbody></table>` : ''}
  ${noValue.length ? `<h3 class="rr-h3">Bez mierzalnego wyjścia w tym slice — widoczny jest sam koszt</h3>
  <p class="rr-note">Obrona, ustrój, kultura, infrastruktura: ich wartość nie jest przepływem zasobów, więc
    ROI byłoby wymyślone. Pokazujemy, ile kosztują i jakie efekty deklarują dane.</p>
  <table class="rr-table"><thead><tr><th>budynek</th><th class="num">koszt Kr</th><th class="num">w komponentach</th>
    <th>efekty z danych</th></tr></thead><tbody>${otherRows}</tbody></table>` : ''}`;
}

// ── SVG hatch (tekstura na „nie zwraca się") ─────────────────────
const HATCH_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <pattern id="hatchNever" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
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
.rr-h3{font-size:14px;margin:18px 0 4px;font-weight:620}
.rr-note{color:var(--ink2);font-size:12.5px;margin:0 0 10px}
.rr-mut{color:var(--muted)}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em;background:var(--surface);
  border:1px solid var(--border);border-radius:4px;padding:0 4px}
.rr-verdict{margin:18px 0;padding:16px 18px;border-radius:10px;border:1px solid var(--border);
  background:var(--card);border-left:5px solid var(--axis)}
.rr-verdict.rr-b-never{border-left-color:#d03b3b} .rr-verdict.rr-b-slow{border-left-color:#fab219}
.rr-verdict.rr-b-fast{border-left-color:#0ca30c} .rr-verdict.rr-b-none{border-left-color:#8a8980}
.rr-verdict-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rr-verdict-head h2{font-size:17px;margin:0;font-weight:640}
.rr-verdict-sub{color:var(--ink2);font-size:13px;margin:6px 0 0}
.rr-badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;font-weight:650;color:#fff;background:var(--muted)}
.rr-bg-never{background:#d03b3b} .rr-bg-slow{background:#fab219;color:#3a2a00}
.rr-bg-fast{background:#0ca30c} .rr-bg-mid{background:#2a78d6} .rr-bg-none{background:#8a8980}
.rr-tiles{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
.rr-tile{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:150px;
  display:flex;flex-direction:column;gap:2px;flex:1 1 150px}
.rr-tile-lab{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.rr-tile-big{font-size:24px;font-weight:680}
.rr-tile-sub{font-size:12px;color:var(--ink2)}
.rr-ink-never{color:#d03b3b} .rr-ink-slow{color:#c98500} .rr-ink-fast{color:#0ca30c}
.rr-ink-mid{color:#2a78d6} .rr-ink-none{color:#8a8980}
.rr-method{margin:16px 0;padding:14px 16px;border-radius:10px;background:var(--surface);border:1px dashed var(--axis)}
.rr-method h3{margin:0 0 8px;font-size:14.5px;font-weight:640}
.rr-method ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink2)}
.rr-method li{margin-bottom:5px}
.rr-callout{margin:6px 0 10px;padding:8px 11px;border-radius:8px;background:var(--surface);
  border-left:3px solid #2a78d6}
.rr-defect{margin:10px 0 0;padding:10px 12px;border-radius:8px;font-size:13px;color:var(--ink);
  background:rgba(250,178,25,.12);border:1px solid rgba(250,178,25,.55)}
.rr-legend{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 4px;font-size:12.5px;color:var(--ink2)}
.rr-leg-item{display:inline-flex;align-items:center;gap:6px}
.rr-sw{width:14px;height:14px;border-radius:3px;display:inline-block;border:1px solid var(--border)}
.rr-key{width:11px;height:11px;border-radius:2px;display:inline-block;vertical-align:baseline;border:1px solid var(--border)}
.rr-svg{width:100%;height:auto;background:var(--surface);border-radius:8px;border:1px solid var(--border);margin-bottom:8px}
.rr-svg-lab{font-size:11px;fill:var(--ink2)} .rr-svg-num{font-size:11px;fill:var(--muted)}
.rr-tick{font-size:9px;fill:var(--muted);text-anchor:middle}
.rr-grid{stroke:var(--grid);stroke-width:1}
.rr-table{border-collapse:collapse;font-size:12px;width:100%;font-variant-numeric:tabular-nums;margin-bottom:4px}
.rr-table th,.rr-table td{border-bottom:1px solid var(--grid);padding:4px 8px;text-align:left}
.rr-table th{color:var(--muted);font-weight:600} .rr-table .num{text-align:right}
.rr-row-never td{background:rgba(208,59,59,.06)}
.rr-panels{display:flex;flex-direction:column;gap:14px;margin-top:8px}
.rr-panel{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
.rr-panel h3{margin:0 0 8px;font-size:14px;font-weight:640}
.rr-foot{margin-top:32px;padding-top:12px;border-top:1px solid var(--grid);color:var(--muted);font-size:11.5px}
.rr-foot p{margin:2px 0}
</style>`;

export default renderRoiReport;
