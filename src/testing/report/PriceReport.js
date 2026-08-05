// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — PriceReport (HTML raport, slice CENY)
// ───────────────────────────────────────────────────────────────
// Czysta funkcja renderPriceReport(data) → samodzielny HTML string (inline CSS
// + inline SVG, ZERO zewnętrznych zależności — plik otwieralny offline).
// `data` = payload z balans-price-telemetry.mjs (meta / audit / catalog / baseUnit /
// seeds / panel).
//
// ⚠ NACZELNA ZASADA UKŁADU: slice ma DWIE warstwy różnego rodzaju i raport MUSI je
// trzymać osobno — audyt TABELI (statyczny, prawda o danych) i OSIĄGALNOŚĆ (dynamiczna,
// prawda o przebiegu). Zlanie ich w jedną narrację sugerowałoby, że mają tę samą moc
// dowodową. Mają inną: warstwa A jest deterministyczna, warstwa B zależy od polityki bota.
//
// Struktura:
//   1. dwa werdykty + kafle KPI      — osobno A (tabela) i B (osiągalność)
//   2. skrzynka uczciwości           — założenia, W TYM to o jednostce bazowej
//   3. WARSTWA A  — ceny poniżej wsadu (design vs suspect), zgodność z konwencją, odstające
//   4. WARSTWA A′ — jednostka bazowa: nakład na 1 Kr wartości, kontrfaktyk ×1 wydobycie
//   5. WARSTWA B  — księga Kr, krzywa kredytów, osiągalność + BLOKERY, cena realna w grze
//   6. katalog cen                   — pełna tabela audytu
//
// Kolory = STATUS palette (dataviz, reserved): good/info/warning/critical/neutral.
// good↔critical to para red-green → NIGDY sam kolor: legenda + ikona + etykieta +
// stała kolejność + TEKSTURA na klasie krytycznej.
//
// ⚠ Tokeny designu są świadomie ZDUPLIKOWANE z PopReport / ResourceReport / RoiReport:
// każdy raport to SAMODZIELNY artefakt HTML (otwierany offline, wysyłany pojedynczo),
// a tamte są zamkniętymi, zwalidowanymi artefaktami swoich slice'ów.
// ═══════════════════════════════════════════════════════════════

const C = {
  good:     '#0ca30c',   // zgodne / osiągalne
  info:     '#2a78d6',   // neutralna informacja / zwykłe
  warn:     '#fab219',   // odchylenie / bramkuje
  crit:     '#d03b3b',   // niewyjaśnione / nieosiągalne
  neutral:  '#8a8980',   // brak danych
  design:   '#8a5cd6',   // sink oznaczony w danych — WŁASNY kolor, nie „błąd"
};

const CLS_META = {
  conforms:           { c: C.good,    i: '✓', l: 'W konwencji tabeli (cena ≈ wsad ×1.3)' },
  off_convention:     { c: C.info,    i: '≡', l: 'Poza konwencją, ale pokrywa wsad' },
  design_sink:        { c: C.design,  i: '◆', l: 'Poniżej wsadu — marker sinku W DANYCH (droid / creditCost)' },
  suspect_below_cost: { c: C.crit,    i: '✕', l: 'Poniżej wsadu BEZ wyjaśnienia w danych' },
  no_data:            { c: C.neutral, i: '·', l: 'Bez ceny albo z niecenionym surowcem we wsadzie' },
};
const CLS_ORDER = ['conforms', 'off_convention', 'design_sink', 'suspect_below_cost', 'no_data'];

const AFF_META = {
  trivial: { c: C.good,    i: '✓', l: 'Trywialnie osiągalne (prawie zawsze, z zapasem)' },
  normal:  { c: C.info,    i: '≡', l: 'Osiągalne przez większość przebiegu' },
  gating:  { c: C.warn,    i: '▲', l: 'Bramkuje — osiągalne późno albo rzadko' },
  never:   { c: C.crit,    i: '✕', l: 'Nigdy osiągalne w horyzoncie panelu' },
};
const AFF_ORDER = ['trivial', 'normal', 'gating', 'never'];

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

// ── Główny render ────────────────────────────────────────────────
export function renderPriceReport(data) {
  const meta    = data?.meta ?? {};
  const audit   = data?.audit ?? { commodities: {}, resources: {}, stats: {}, outliers: [] };
  const catalog = data?.catalog ?? {};
  const panel   = data?.panel ?? {};
  const seeds   = data?.seeds ?? [];
  const baseUnit = data?.baseUnit ?? {};
  const vA = panel.verdictStatic ?? { outcome: 2, label: '—' };
  const vB = panel.verdictDynamic ?? { outcome: 2, label: '—' };
  const thr = meta.thresholds ?? {};
  const prefix = meta.seedPrefix ?? 'balans-gate1';
  _AUDIT = audit;    // sekcja B czyta ceny bazowe przez `basePriceOf` (patrz niżej)

  return `<div class="viz-root">
${STYLE}
${HATCH_DEFS}
<header class="rr-head">
  <h1>BALANS 1.0 — Phase 2 · CENY (audyt cennika + osiągalność)</h1>
  <p class="rr-meta">
    class <b>${esc(meta.planetClass ?? '?')}</b> · ${esc(String(meta.seeds ?? seeds.length))} seedów ·
    ${esc(String(meta.targetGy ?? '?'))} game-lat · jednostka: <b>game-years</b> (1 gy = 12 civ-yr) ·
    read-only instrument, <b>zero stałych balansu</b>
  </p>
  <p class="rr-meta rr-split">Ten slice ma <b>dwie warstwy różnego rodzaju</b> i raport trzyma je osobno:
    <b>A — audyt TABELI</b> (statyczny, prawda o danych; nie zależy od przebiegu) oraz
    <b>B — OSIĄGALNOŚĆ</b> (dynamiczna, zależy też od polityki bota). Nie mają tej samej mocy dowodowej.</p>
</header>

${renderVerdicts(vA, vB, audit, panel, thr)}

${renderHonesty(meta, audit, baseUnit, panel)}

${renderLayerA(audit, thr)}

${renderLayerAPrime(baseUnit, meta)}

${renderLayerB(panel, catalog, seeds, prefix, thr)}

${renderCatalogTable(audit)}

<footer class="rr-foot">
  <p>${esc(meta.tool ?? 'BALANS 1.0 Phase 2 — PRICE telemetry')}</p>
  <p>kryterium audytu: ${esc(meta.auditCriterion ?? '')} · rozstrzyganie: ${esc(meta.adjudication ?? '')}</p>
  <p>osiągalność: ${esc(meta.affordModel ?? '')} · zegary: ${esc(meta.clockNote ?? '')}</p>
  <p>${esc(meta.scope ?? '')} · ${esc(meta.note ?? '')}</p>
</footer>
</div>`;
}

// ── 1. Dwa werdykty + kafle ──────────────────────────────────────
function renderVerdicts(vA, vB, audit, panel, thr) {
  const st = audit.stats ?? {};
  const clsA = vA.outcome === 0 ? 'good' : vA.outcome === 1 ? 'crit' : 'none';
  const clsB = vB.outcome === 0 ? 'good' : vB.outcome === 1 ? 'warn' : 'none';
  const cc = panel.classCounts ?? {};

  const tiles = [
    ['Poniżej wsadu', `${st.belowCost ?? 0}`,
      `${st.designSink ?? 0} z markerem w danych · <b>${st.suspect ?? 0} niewyjaśnionych</b>`, 'crit'],
    ['W konwencji tabeli', `${st.conforms ?? 0}/${st.measurable ?? 0}`,
      `reguła cennika: wsad ×${num(thr.CONVENTION_MARGIN ?? 1.3, 2)}`, 'good'],
    ['Nigdy osiągalne', `${cc.never ?? 0}`, 'pozycji katalogu zakupów', 'crit'],
    ['Bramkujące', `${cc.gating ?? 0}`, `późno (> ${num(thr.GATE_LATE_GY ?? 10, 0)} gy) albo rzadko`, 'warn'],
    ['Netto Kr', `${num(panel.medNetKrPerGy ?? 0, 0)}`, 'mediana panelu, na game-rok', 'info'],
  ];

  return `<section class="rr-verdicts">
  <div class="rr-verdict rr-b-${clsA}">
    <div class="rr-verdict-head">
      <span class="rr-badge rr-bg-${clsA}">Warstwa A · outcome ${esc(String(vA.outcome))}</span>
      <h2>${esc(vA.label ?? '')}</h2>
    </div>
    <p class="rr-verdict-sub">Audyt <b>tabeli</b>: czy cena towaru pokrywa to, co zjada jego receptura, i czy
      trzyma się <b>własnej konwencji cennika</b> („koszt surowców × ${num(thr.CONVENTION_MARGIN ?? 1.3, 2)}",
      wpisanej w dokumentacji <code>TradeValuesData</code>). Kryterium jest <b>wewnętrzne</b> — mierzymy zgodność
      danych z ich własną regułą, nie z wymyślonym standardem.</p>
  </div>
  <div class="rr-verdict rr-b-${clsB}">
    <div class="rr-verdict-head">
      <span class="rr-badge rr-bg-${clsB}">Warstwa B · outcome ${esc(String(vB.outcome))}</span>
      <h2>${esc(vB.label ?? '')}</h2>
    </div>
    <p class="rr-verdict-sub">Osiągalność w <b>realnym przebiegu</b>: czy gracza stać na to, co gra oferuje —
      pytana <b>realną bramką gry</b> (<code>canAfford</code> + stan kredytów). ⚠ „nigdy" nie rozdziela ceny od
      bramki technologicznej; przy każdej pozycji jest kolumna <b>tech</b> i <b>bloker</b>.</p>
  </div>
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
function renderHonesty(meta, audit, baseUnit, panel) {
  const thr = meta.thresholds ?? {};
  const st = audit.stats ?? {};
  const pair = baseUnit.boosted?.pair ?? {};
  const pairUn = baseUnit.unboosted?.pair ?? {};
  const mm = meta.mineRateMult ?? 1;

  return `<section class="rr-method">
  <h3>⚠ Metodologia — co ten pomiar naprawdę mierzy (i czego nie)</h3>
  <ul>
    <li><b>To jedyny slice, który NIE MOŻE przyjąć swojej jednostki za daną.</b> POP / ZASOBY / ROI liczą
      w Kr wg <code>BASE_PRICE</code>. Tutaj sama ta tabela jest przedmiotem badania — dlatego warstwa A′
      pyta wprost, czy relacja <b>energia = 1 Kr = 1 Fe</b> jest ugruntowana. Jeśli nie jest, <b>ranking
      slice'u ROI przesuwa się razem z nią</b>.</li>
    <li><b>Kryterium audytu jest WEWNĘTRZNE.</b> Tabela deklaruje własną regułę („koszt surowców × 1.3");
      mierzymy zgodność z NIĄ. Odchylenie jest więc faktem o danych, nie moją opinią o tym, ile coś
      „powinno" kosztować.</li>
    <li><b>DESIGN vs BUG rozstrzygają DANE.</b> Towar poniżej wsadu dostaje etykietę „prawdopodobnie
      zamierzony" tylko wtedy, gdy niesie marker sinku (<code>isDroidUnit</code> / <code>creditCost &gt; 0</code>).
      Reszta jest oznaczona jako <b>niewyjaśniona</b> i <b>NIE jest rozstrzygana</b> — to decyzja projektanta,
      nie instrumentu.</li>
    <li><b>Dwie miary wsadu, świadomie nie zlane w jedną.</b> „Ruda" = rekurencyjne rozwinięcie receptury do
      surowców (co gospodarka naprawdę oddaje). „Wsad rynkowy" = półprodukty po ICH cenie (co płaci kupujący).
      Dla <code>warp_cores</code> te liczby dają ×0.80 i ×0.46 — inny obraz tej samej ceny.</li>
    ${pair.a ? `<li><b>Jednostka bazowa a scenariusz.</b> Panel referencyjny to <code>civilization_boosted</code>
      (<b>wydobycie ×${num(mm, 0)}</b>). Mnożnik dotyka WYŁĄCZNIE kopalń, więc nakład na 1 Kr rudy jest w tym
      przebiegu ${num(mm, 0)}× tańszy, a nakład na 1 Kr energii bez zmian. Raport pokazuje <b>obie</b> liczby:
      ${esc(pair.a)}:${esc(pair.b)} rozjeżdża się ×${num(pair.skew, 2)} jak zmierzono i
      ×${num(pairUn.skew, 2)} przy ×1 wydobyciu. <b>Czytać ×1.</b></li>` : ''}
    <li><b>Nakład (warstwa A′) to nie to samo co cena.</b> Liczy koszt budynku ÷ przepływ netto ÷ cena, na
      stawkach <b>nominalnych</b> tam, gdzie brak pomiaru (slice ROI pokazał, że nominalne zaniżają realny wynik
      2–3×). Porównanie jest WZGLĘDNE między zasobami; budynek wieloproduktowy dostaje cały koszt przypisany
      do każdego wyjścia. Wartości <b>mierzone to migawka z KOŃCA przebiegu</b> — dla kopalń zawiera więc stan
      wyczerpania złóż i poziom techniki z tego momentu, nie średnią z całej gry.</li>
    <li><b>Dwie soczewki wartości mogą pokazywać co innego</b> — i to jest wynik, nie usterka: „ile kosztuje
      wyprodukowanie" (nakład, wyżej) to nie to samo co „jak rzadkie jest w grze" (mnożnik niedoboru w sekcji B).
      Gdy obie rozjeżdżają się dla tej samej pary zasobów, cena bazowa nie jest ugruntowana w żadnej z nich.</li>
    <li><b>Osiągalność mierzy też politykę bota, nie tylko cenę.</b> Pozycja „nigdy" bywa niekupiona, bo bot nie
      odblokował technologii albo nigdy jej nie chciał. Kolumna <b>tech</b> i <b>bloker</b> są po to, żeby nie
      pomylić „za drogie" z „niedostępne".</li>
    <li><b>Podatek liczony REZYDUALNIE.</b> Wpływ z podatku nie emituje zdarzenia, więc księga bierze go jako
      Δkredytów − suma zdarzeń. Rozjazd z liczbą „z metki" (<code>calculateTaxIncome</code>) jest w tabeli obok.</li>
    <li><b>Dwa zegary.</b> ${esc(meta.clockNote ?? '')} — każde przeliczenie jest podpisane w kodzie czujnika.</li>
    ${st.unpricedResources?.length ? `<li><b>Dziury w cenniku.</b> Surowce bez ceny:
      <b>${st.unpricedResources.map(esc).join(', ')}</b>${st.unpricedGoods?.length ? `; towary bez ceny (poza handlem):
      <b>${st.unpricedGoods.map(esc).join(', ')}</b>` : ''}${st.unpricedInputGoods?.length ? `; towary, których wsadu nie da się
      wycenić: <b>${st.unpricedInputGoods.map(esc).join(', ')}</b>` : ''}. Te pozycje są wyłączone z audytu — brak
      danych, nie wynik.</li>` : ''}
    <li><b>Zakres</b>: kolonia <b>macierzysta</b>, katalog zakupów bez budynków (te mierzy slice ROI, a ich
      blokowanie slice ZASOBY). Progi (knoby POMIARU, nie balansu): tolerancja konwencji
      ×${num(thr.CONVENTION_TOL, 2)}, outlier |z| ≥ ${num(thr.OUTLIER_Z, 1)}, „trywialne" = ≥
      ${pct(thr.TRIVIAL_SHARE)} lat i zapas ≥ ${num(thr.TRIVIAL_MULT, 0)}×, „bramkuje" = pierwszy raz później
      niż ${num(thr.GATE_LATE_GY, 0)} gy albo poniżej ${pct(thr.GATE_SHARE)} lat.</li>
  </ul>
</section>`;
}

// ── 3. WARSTWA A ─────────────────────────────────────────────────
function renderLayerA(audit, thr) {
  const rows = Object.values(audit.commodities ?? {});
  const below = rows.filter(c => c.belowOre || c.belowDirect)
    .sort((a, b) => (a.ratioOre ?? 9) - (b.ratioOre ?? 9));
  const measurable = rows.filter(c => c.measurable && c.conformance > 0)
    .sort((a, b) => a.conformance - b.conformance);

  // Wykres zgodności — skala LOG, bo cena to relacja multiplikatywna (×0.05 i ×20 są
  // symetryczne). Linia 1.0 = dokładnie konwencja tabeli.
  const W = 720, padL = 178, padR = 84, rowH = 18, barW = W - padL - padR;
  const vals = measurable.map(c => c.conformance);
  const lo = Math.min(0.01, ...(vals.length ? vals : [0.01]));
  const hi = Math.max(2, ...(vals.length ? vals : [2]));
  const l0 = Math.log10(lo), l1 = Math.log10(hi);
  const xOf = (v) => padL + ((Math.log10(Math.max(lo, v)) - l0) / Math.max(1e-9, l1 - l0)) * barW;
  const H = measurable.length * rowH + 18;

  const ticks = [];
  for (let e = Math.floor(l0); e <= Math.ceil(l1); e++) {
    const v = 10 ** e;
    if (v < lo || v > hi * 1.2) continue;
    ticks.push(`<line x1="${xOf(v).toFixed(1)}" y1="0" x2="${xOf(v).toFixed(1)}" y2="${measurable.length * rowH}" class="rr-grid"/>
      <text x="${xOf(v).toFixed(1)}" y="${measurable.length * rowH + 11}" class="rr-tick">×${v}</text>`);
  }
  const one = xOf(1);
  const bars = measurable.map((c, i) => {
    const y = i * rowH, x = xOf(c.conformance);
    const m = CLS_META[c.cls] ?? CLS_META.no_data;
    const x0 = Math.min(one, x), w = Math.max(1, Math.abs(x - one));
    const fill = c.cls === 'suspect_below_cost' ? 'url(#hatchCrit)' : m.c;
    return `<text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="rr-svg-lab">${esc(c.id)}</text>
      <rect x="${x0.toFixed(1)}" y="${y + 3}" width="${w.toFixed(1)}" height="${rowH - 7}" rx="2" fill="${fill}" opacity=".9"><title>${esc(c.id)}: cena ${num(c.price, 0)} Kr, konwencja ${num(c.conventionKr, 0)} Kr → ×${num(c.conformance, 2)}</title></rect>
      <text x="${(Math.max(x, one) + 6).toFixed(1)}" y="${y + rowH / 2 + 4}" class="rr-svg-num">×${num(c.conformance, 2)}</text>`;
  }).join('\n');

  const belowRows = below.map(c => {
    const m = CLS_META[c.cls];
    return `<tr class="${c.cls === 'suspect_below_cost' ? 'rr-row-crit' : ''}">
      <td><b>${esc(c.id)}</b> <span class="rr-mut">T${esc(String(c.tier ?? '?'))}</span></td>
      <td class="num">${num(c.price, 0)}</td>
      <td class="num">${num(c.oreKr, 0)}</td>
      <td class="num">${num(c.directKr, 0)}</td>
      <td class="num">×${num(c.ratioOre, 2)}</td>
      <td class="num">×${num(c.ratioDirect, 2)}</td>
      <td class="num">${c.creditCost ? num(c.creditCost, 0) : '—'}</td>
      <td style="color:${m.c}"><b>${m.i}</b> ${c.cls === 'design_sink' ? 'zamierzony sink' : 'NIEWYJAŚNIONE'}</td>
      <td class="rr-mut">${c.sinkMarked ? 'marker w danych: ' + (c.creditCost ? 'creditCost' : 'isDroidUnit') : 'brak markera'}</td>
    </tr>`;
  }).join('');

  const outRows = (audit.outliers ?? []).map(o => `<tr>
    <td><b>${esc(o.id)}</b></td><td class="num">×${num(o.conformance, 3)}</td>
    <td class="num">${num(o.z, 1)}</td>
    <td style="color:${(CLS_META[o.cls] ?? CLS_META.no_data).c}">${(CLS_META[o.cls] ?? CLS_META.no_data).i} ${esc(o.cls)}</td>
  </tr>`).join('');

  return `<h2 class="rr-h2">Warstwa A — audyt tabeli: czy cena pokrywa to, co receptura zjada?</h2>
  ${renderLegend(CLS_ORDER, CLS_META)}
  <p class="rr-note">Słupek mierzy odległość ceny od <b>własnej konwencji tabeli</b> (wsad ×${num(thr.CONVENTION_MARGIN ?? 1.3, 2)}).
    Oś <b>logarytmiczna</b>, linia w ×1.0 = dokładnie konwencja; w lewo = taniej niż reguła, w prawo = drożej.
    Klasa „niewyjaśnione" ma dodatkowo <b>teksturę</b>, nie tylko kolor.</p>
  <svg class="rr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Zgodność cen z konwencją tabeli">
    ${ticks.join('')}
    <line x1="${one.toFixed(1)}" y1="0" x2="${one.toFixed(1)}" y2="${measurable.length * rowH}" class="rr-axis-line"/>
    ${bars}
  </svg>

  ${below.length ? `<h3 class="rr-h3">Ceny PONIŻEJ wsadu — rozdzielone wg markera w danych</h3>
  <p class="rr-note">To jest odpowiedź na wątek z slice'u ROI (§6). <b>Nie rozstrzygamy</b>, które z tych cen są
    błędem — pokazujemy, które niosą w danych ślad świadomej decyzji (opłata Kr per sztuka / flaga droida),
    a które nie niosą żadnego.</p>
  <table class="rr-table">
    <thead><tr><th>towar</th><th class="num">cena</th><th class="num">ruda (rekur.)</th><th class="num">wsad rynkowy</th>
      <th class="num">×ruda</th><th class="num">×rynek</th><th class="num">+Kr/szt</th><th>klasa</th><th>podstawa klasy</th></tr></thead>
    <tbody>${belowRows}</tbody>
  </table>` : ''}

  ${outRows ? `<h3 class="rr-h3">Odstające od konwencji (robust z-score na logarytmie, |z| ≥ ${num(thr.OUTLIER_Z, 1)})</h3>
  <p class="rr-note">Mediana + MAD zamiast średniej i odchylenia — inaczej jeden skrajny sink przesunąłby próg
    i schował umiarkowane odchylenia.</p>
  <table class="rr-table"><thead><tr><th>towar</th><th class="num">×konwencji</th><th class="num">z</th><th>klasa</th></tr></thead>
    <tbody>${outRows}</tbody></table>` : ''}`;
}

// ── 4. WARSTWA A′ — jednostka bazowa ─────────────────────────────
function renderLayerAPrime(baseUnit, meta) {
  const b = baseUnit.boosted ?? {};
  const un = baseUnit.unboosted ?? {};
  const rows = Object.values(b.byResource ?? {}).sort((a, b2) => a.capexPerKr - b2.capexPerKr);
  if (!rows.length) return '';
  const mm = meta.mineRateMult ?? 1;
  const pair = b.pair ?? {}, pairUn = un.pair ?? {};

  const W = 720, padL = 96, padR = 120, rowH = 26, barW = W - padL - padR;
  const maxV = Math.max(...rows.map(r => Math.max(r.capexPerKr, un.byResource?.[r.resource]?.capexPerKr ?? 0)));
  const xw = (v) => Math.max(1, (v / (maxV || 1)) * barW);

  const bars = rows.map((r, i) => {
    const y = i * rowH;
    const uv = un.byResource?.[r.resource]?.capexPerKr ?? r.capexPerKr;
    const isMine = (r.capexPerKr !== uv);
    return `<text x="${padL - 8}" y="${y + 12}" text-anchor="end" class="rr-svg-lab">${esc(r.resource)}</text>
      <rect x="${padL}" y="${y + 3}" width="${xw(r.capexPerKr).toFixed(1)}" height="8" rx="2" fill="${C.info}"><title>${esc(r.resource)}: ${num(r.capexPerKr, 3)} Kr nakładu na 1 Kr/gy (jak zmierzono, ${esc(String(r.from))})</title></rect>
      <rect x="${padL}" y="${y + 13}" width="${xw(uv).toFixed(1)}" height="8" rx="2" fill="${isMine ? C.warn : C.neutral}" opacity="${isMine ? 0.95 : 0.45}"><title>${esc(r.resource)}: ${num(uv, 3)} przy ×1 wydobyciu${isMine ? ' (kopalnia — mnożnik scenariusza zdjęty)' : ' (bez zmian — nie z kopalni)'}</title></rect>
      <text x="${(padL + Math.max(xw(r.capexPerKr), xw(uv)) + 6).toFixed(1)}" y="${y + 15}" class="rr-svg-num">${num(r.capexPerKr, 2)} → ${num(uv, 2)}</text>`;
  }).join('\n');

  const table = rows.map(r => {
    const u = un.byResource?.[r.resource];
    return `<tr>
      <td><b>${esc(r.resource)}</b></td>
      <td class="num">${num(r.price, 1)}</td>
      <td class="rr-mut">${esc(String(r.from ?? '—'))}${r.source === 'measured' ? ' <span class="rr-tag">mierzone</span>' : ' <span class="rr-tag rr-tag-n">nominalne</span>'}</td>
      <td class="num">${orDash(r.perGy, 0)}</td>
      <td class="num">${num(r.capexPerKr, 3)}</td>
      <td class="num">${orDash(u?.capexPerKr, 3)}</td>
      <td class="num">×${num(r.relativeToMedian, 2)}</td>
      <td class="num">${num(r.impliedPrice, 2)}</td>
    </tr>`;
  }).join('');

  return `<h2 class="rr-h2">Warstwa A′ — jednostka bazowa: czy 1 energii naprawdę jest warta 1 Fe?</h2>
  <p class="rr-note">Slice ROI (i każda liczba w Kr w tym projekcie) stoi na relacji <b>energia = 1 Kr = 1 Fe</b>.
    Sprawdzamy ją JEDYNYM testem możliwym wewnątrz danych gry: <b>ile nakładu trzeba, żeby wyprodukować 1 Kr
    wartości danego zasobu</b> (koszt budynku w pełni obciążony ÷ przepływ netto na game-rok ÷ cena). Gdyby cennik
    odzwierciedlał nakład produkcyjny, ta liczba byłaby <b>podobna dla wszystkich zasobów</b>. Rozjazd = skrzywienie
    jednostki bazowej, mierzalne, nie uznaniowe.</p>
  <p class="rr-note">
    <span class="rr-key" style="background:${C.info}"></span> jak zmierzono (scenariusz z wydobyciem ×${num(mm, 0)}) ·
    <span class="rr-key" style="background:${C.warn}"></span> przy ×1 wydobyciu — <b>zmiana dotyczy WYŁĄCZNIE
    zasobów z kopalni</b>, bo tylko ich dotyczy mnożnik scenariusza. Krótszy słupek = tańszy nakład.</p>
  <svg class="rr-svg" viewBox="0 0 ${W} ${rows.length * rowH + 6}" role="img" aria-label="Nakład na jednostkę wartości">${bars}</svg>

  ${pair.a ? `<div class="rr-callout rr-callout-big">
    <b>Para pod lupą — ${esc(pair.a)} vs ${esc(pair.b)}:</b> cennik mówi <b>×${num(pair.listedRatio, 2)}</b>,
    nakład mówi <b>×${num(pair.impliedRatio, 2)}</b> → rozjazd <b>×${num(pair.skew, 2)}</b>.
    ${pairUn.skew != null && mm !== 1 ? `Kontrfaktycznie <b>przy ×1 wydobyciu</b>: nakład ×${num(pairUn.impliedRatio, 2)}
      → rozjazd <b>×${num(pairUn.skew, 2)}</b>. To ta sama zmierzona seria z urobkiem kopalń podzielonym przez
      mnożnik scenariusza — nie drugi przebieg. <b>Wersja ×1 jest tą, którą należy czytać jako własność cennika</b>;
      różnica między liczbami to udział scenariusza.` : ''}
  </div>` : ''}

  <table class="rr-table">
    <thead><tr><th>zasób</th><th class="num">cena</th><th>najtańsze źródło</th><th class="num">przepływ/gy</th>
      <th class="num">Kr nakładu / 1 Kr&nbsp;wartości</th><th class="num">przy ×1 wydob.</th>
      <th class="num">vs mediana</th><th class="num">cena implikowana</th></tr></thead>
    <tbody>${table}</tbody>
  </table>
  <p class="rr-note">„Cena implikowana" = ile musiałaby wynosić cena zasobu, żeby jego nakład zrównał się z medianą
    panelu. To <b>nie jest rekomendacja</b> — to przeliczenie pokazujące, jak daleko od siebie stoją cennik i
    nakład wewnątrz tych samych danych. Rozstrzygnięcie należy do projektanta.</p>`;
}

// ── 5. WARSTWA B — księga Kr, krzywa kredytów, osiągalność ───────
function renderLayerB(panel, catalog, seeds, prefix, thr) {
  const led = panel.ledgerPerGy ?? {};
  const np = panel.nameplateMed ?? {};

  // Księga: przychód (podatek rezydualny + handel) vs wydatki.
  const inRows = [
    ['podatek (rezydualnie)', panel.medTaxResidualPerGy ?? 0, np.taxPerGy],
    ['handel cywilny', led.trade ?? 0, np.tradePerGy],
  ];
  const outRows = Object.entries(led).filter(([k, v]) => v < 0)
    .sort((a, b) => a[1] - b[1])
    .map(([k, v]) => [k, v, k === 'wages' ? np.wagesPerGy : k === 'fleet_upkeep' ? np.fleetUpkeepPerGy : null]);

  const ledgerTable = `<table class="rr-table">
    <thead><tr><th>pozycja</th><th class="num">realizacja Kr/gy</th><th class="num">„z metki" Kr/gy</th><th>uwaga</th></tr></thead>
    <tbody>
      ${inRows.map(([k, v, n]) => `<tr><td>${esc(k)}</td><td class="num rr-ink-good">+${num(v, 0)}</td>
        <td class="num rr-mut">${n == null ? '—' : num(n, 0)}</td>
        <td class="rr-mut">${k.startsWith('podatek') ? 'nie emituje zdarzenia — liczony rezydualnie' : ''}</td></tr>`).join('')}
      ${outRows.map(([k, v, n]) => `<tr><td>${esc(k)}</td><td class="num rr-ink-crit">${num(v, 0)}</td>
        <td class="num rr-mut">${n == null ? '—' : num(n, 0)}</td>
        <td class="rr-mut">${k === 'droid_production' ? 'opłata Kr per sztuka (sink z receptury)' : ''}</td></tr>`).join('')}
      <tr class="rr-row-sum"><td><b>NETTO</b></td><td class="num"><b>${num(panel.medNetKrPerGy ?? 0, 0)}</b></td>
        <td class="num rr-mut">—</td>
        <td class="rr-mut">kredyty na koniec ${num(panel.medCreditsEnd ?? 0, 0)} · minimum przebiegu ${num(panel.medCreditsMin ?? 0, 0)}</td></tr>
    </tbody></table>`;

  // Krzywa kredytów — wszystkie seedy, jedna oś.
  const curves = renderCreditCurve(seeds, prefix);

  // Osiągalność.
  const items = Object.entries(panel.items ?? {})
    .sort((a, b) => AFF_ORDER.indexOf(b[1].cls) - AFF_ORDER.indexOf(a[1].cls)
      || (catalog[b[0]]?.totalKr ?? 0) - (catalog[a[0]]?.totalKr ?? 0));
  const affRows = items.map(([id, v]) => {
    const c = catalog[id] ?? {};
    const m = AFF_META[v.cls] ?? AFF_META.never;
    return `<tr class="${v.cls === 'never' ? 'rr-row-crit' : ''}">
      <td><b>${esc(id)}</b> <span class="rr-mut">${esc(c.kind ?? '')}</span></td>
      <td class="num">${num(c.krLoaded ?? 0, 0)}</td>
      <td class="num">${c.krCost ? num(c.krCost, 0) : '—'}</td>
      <td class="num">${c.upkeepKrPerGy ? num(c.upkeepKrPerGy, 0) : '—'}</td>
      <td class="num">${orDash(v.medFirstAffordableGy, 0)}</td>
      <td class="num">${pct(v.medShare)}</td>
      <td class="num">${orDash(v.medHeadroom, 1)}</td>
      <td class="num">${v.seedsAffordable ?? 0}/${v.seeds ?? 0}</td>
      <td><code>${esc(v.blocker ?? '—')}</code></td>
      <td style="color:${m.c}"><b>${m.i}</b> ${esc(v.cls)}</td>
      <td class="rr-mut">${c.requires ? esc(c.requires) : '—'}</td>
    </tr>`;
  }).join('');

  // Cena realna w grze vs bazowa.
  const lp = panel.localPriceMed ?? {};
  const priceRows = Object.entries(lp)
    .map(([id, real]) => [id, real])
    .filter(([, real]) => Number.isFinite(real))
    .sort((a, b) => b[1] - a[1]);

  return `<h2 class="rr-h2">Warstwa B — jak cennik gra: dochód Kr, osiągalność, co bramkuje</h2>
  <h3 class="rr-h3">Księga Kr — mediana panelu, na game-rok</h3>
  <p class="rr-note">„Realizacja" pochodzi ze zdarzeń gry i z ruchu stanu kredytów; „z metki" to stawka, którą gra
    deklaruje na końcu przebiegu. Rozjazd między nimi nie jest błędem pomiaru — stawka „z metki" opisuje koniec
    przebiegu, realizacja cały przebieg.</p>
  ${ledgerTable}

  ${curves}

  <h3 class="rr-h3">Osiągalność — „chcę → stać mnie" w game-latach</h3>
  ${renderLegend(AFF_ORDER, AFF_META)}
  <p class="rr-note">Pytamy <b>realną bramkę gry</b> (<code>canAfford</code> per klucz + stan kredytów), więc
    kolumna <b>bloker</b> mówi, czego konkretnie zabrakło najczęściej (<code>Kr</code> = kredytów).
    „ile naraz" = mediana liczby sztuk, na które było stać w danym roku. <b>seedy</b> = na ilu seedach pozycja
    była kiedykolwiek osiągalna — klasa panelu przy remisie wybiera gorszą.</p>
  <table class="rr-table">
    <thead><tr><th>pozycja</th><th class="num">koszt Kr</th><th class="num">+Kr</th><th class="num">utrzym./gy</th>
      <th class="num">1. raz gy</th><th class="num">lat panelu</th><th class="num">ile naraz</th><th class="num">seedy</th>
      <th>bloker</th><th>klasa</th><th>tech</th></tr></thead>
    <tbody>${affRows}</tbody>
  </table>

  <h3 class="rr-h3">Cena REALNA w grze vs cena bazowa</h3>
  <p class="rr-note">Gra ma <b>własny</b> mechanizm wyceny bieżącej (<code>BASE_PRICE × scarcityMultiplier</code>,
    czytany przez <code>CivilianTradeSystem.getLocalPrice</code>). To najlepszy dostępny sprawdzian cen bazowych:
    pokazuje, ile gra <i>sama</i> uważa, że dane dobro jest warte w trakcie rozgrywki. Mnożnik ×3 = maksymalny
    niedobór, ×0.2–0.3 = nadwyżka.</p>
  <table class="rr-table">
    <thead><tr><th>towar / surowiec</th><th class="num">bazowa</th><th class="num">realna (mediana)</th><th class="num">×mnożnik</th></tr></thead>
    <tbody>${priceRows.map(([id, real]) => {
      const base = basePriceOf(id);
      const mult = base ? real / base : null;
      const cls = mult == null ? '' : mult >= 2.5 ? 'rr-ink-crit' : mult <= 0.35 ? 'rr-ink-good' : '';
      return `<tr><td><b>${esc(id)}</b></td><td class="num">${orDash(base, 2)}</td>
        <td class="num">${num(real, 2)}</td><td class="num ${cls}">${mult == null ? '—' : '×' + num(mult, 2)}</td></tr>`;
    }).join('')}</tbody>
  </table>`;
}

// Cena bazowa z audytu. Sekcja B dostaje tylko `panel`/`catalog`, a potrzebuje cen bazowych
// do zestawienia z ceną realną — uchwyt jest ustawiany na wejściu `renderPriceReport`
// (render jest synchroniczny i jednowątkowy, więc nie ma tu wyścigu).
let _AUDIT = null;
function basePriceOf(id) {
  const c = _AUDIT?.commodities?.[id];
  if (c) return c.price;
  return _AUDIT?.resources?.[id]?.price ?? null;
}

// Krzywa kredytów per seed.
function renderCreditCurve(seeds, prefix) {
  const series = (seeds ?? []).map(s => ({
    seed: shortSeed(s.seed, prefix),
    pts: (s.series ?? []).filter(r => r && r.gy != null).map(r => [r.gy, r.creditsAll ?? 0]),
  })).filter(s => s.pts.length > 1);
  if (!series.length) return '';
  const maxGy = Math.max(...series.flatMap(s => s.pts.map(p => p[0])));
  const maxKr = Math.max(1, ...series.flatMap(s => s.pts.map(p => p[1])));
  const W = 720, H = 190, padL = 54, padR = 14, padT = 10, padB = 24;
  const xOf = (gy) => padL + (gy / Math.max(1, maxGy)) * (W - padL - padR);
  const yOf = (kr) => H - padB - (kr / maxKr) * (H - padT - padB);

  const paths = series.map((s, i) => {
    const d = s.pts.map((p, j) => `${j ? 'L' : 'M'}${xOf(p[0]).toFixed(1)},${yOf(p[1]).toFixed(1)}`).join('');
    return `<path d="${d}" fill="none" stroke="${C.info}" stroke-width="1.4" opacity="${0.25 + 0.5 / series.length}"><title>${esc(s.seed)}</title></path>`;
  }).join('');

  const yTicks = [0, 0.5, 1].map(f => {
    const kr = maxKr * f;
    return `<line x1="${padL}" y1="${yOf(kr).toFixed(1)}" x2="${W - padR}" y2="${yOf(kr).toFixed(1)}" class="rr-grid"/>
      <text x="${padL - 6}" y="${(yOf(kr) + 3).toFixed(1)}" text-anchor="end" class="rr-tick rr-tick-l">${num(kr, 0)}</text>`;
  }).join('');
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const gy = Math.round(maxGy * f);
    return `<text x="${xOf(gy).toFixed(1)}" y="${H - 6}" class="rr-tick">${gy} gy</text>`;
  }).join('');

  return `<h3 class="rr-h3">Kredyty w czasie — wszystkie seedy</h3>
  <p class="rr-note">Oś Y: stan kredytów wszystkich kolonii gracza (Kr). Każda linia to jeden seed.
    Płaska krzywa przy dodatnim netto = gracz nie ma na co wydawać; opadająca = utrzymanie zjada dochód.</p>
  <svg class="rr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kredyty w czasie">${yTicks}${xTicks}${paths}</svg>`;
}

// ── 6. Pełny katalog cen ─────────────────────────────────────────
function renderCatalogTable(audit) {
  const rows = Object.values(audit.commodities ?? {})
    .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || (b.price ?? 0) - (a.price ?? 0));
  if (!rows.length) return '';
  const body = rows.map(c => {
    const m = CLS_META[c.cls] ?? CLS_META.no_data;
    return `<tr>
      <td><b>${esc(c.id)}</b></td>
      <td class="num">T${esc(String(c.tier ?? '?'))}</td>
      <td class="num">${c.price == null ? '—' : num(c.price, 1)}</td>
      <td class="num">${c.measurable ? num(c.oreKr, 0) : '—'}</td>
      <td class="num">${c.measurable ? num(c.directKr, 0) : '—'}</td>
      <td class="num">${c.measurable ? num(c.conventionKr, 0) : '—'}</td>
      <td class="num">${c.conformance == null ? '—' : '×' + num(c.conformance, 2)}</td>
      <td class="num">${c.creditCost ? num(c.creditCost, 0) : '—'}</td>
      <td style="color:${m.c}"><b>${m.i}</b> ${esc(c.cls)}${c.noDataReason ? ` <span class="rr-mut">(${esc(c.noDataReason)})</span>` : ''}</td>
    </tr>`;
  }).join('');
  return `<h2 class="rr-h2">Pełny katalog cen — audyt wiersz po wierszu</h2>
  <p class="rr-note">„ruda" = rekurencyjne rozwinięcie receptury do surowców; „wsad rynkowy" = półprodukty po ich
    cenie; „konwencja" = wsad rynkowy × marża deklarowana przez tabelę.</p>
  <table class="rr-table">
    <thead><tr><th>towar</th><th class="num">tier</th><th class="num">cena</th><th class="num">ruda</th>
      <th class="num">wsad rynkowy</th><th class="num">konwencja</th><th class="num">×konwencji</th>
      <th class="num">+Kr/szt</th><th>klasa</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

// ── Legenda ──────────────────────────────────────────────────────
function renderLegend(order, metaMap) {
  return `<div class="rr-legend">${order.map(k => {
    const m = metaMap[k];
    const sw = k === 'suspect_below_cost'
      ? `<span class="rr-sw" style="background:${m.c};background-image:${HATCH_CSS}"></span>`
      : `<span class="rr-sw" style="background:${m.c}"></span>`;
    return `<span class="rr-leg-item">${sw}<b>${m.i}</b> ${esc(m.l)}</span>`;
  }).join('')}</div>`;
}

// ── SVG hatch (tekstura na klasie krytycznej) ────────────────────
const HATCH_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <pattern id="hatchCrit" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
    <rect width="5" height="5" fill="#d03b3b"/>
    <line x1="0" y1="0" x2="0" y2="5" stroke="#7a1f1f" stroke-width="1.6"/>
  </pattern>
</defs></svg>`;
const HATCH_CSS = `repeating-linear-gradient(45deg,#7a1f1f 0 1.6px,#d03b3b 1.6px 5px)`;

// ── Styl ─────────────────────────────────────────────────────────
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
.rr-split{margin-top:6px;padding:8px 11px;border-radius:8px;background:var(--surface);border-left:3px solid #2a78d6}
.rr-h2{font-size:16px;margin:30px 0 6px;font-weight:620}
.rr-h3{font-size:14px;margin:20px 0 4px;font-weight:620}
.rr-note{color:var(--ink2);font-size:12.5px;margin:0 0 10px}
.rr-mut{color:var(--muted)}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em;background:var(--surface);
  border:1px solid var(--border);border-radius:4px;padding:0 4px}
.rr-verdicts{margin:18px 0}
.rr-verdict{margin:0 0 10px;padding:14px 16px;border-radius:10px;border:1px solid var(--border);
  background:var(--card);border-left:5px solid var(--axis)}
.rr-verdict.rr-b-crit{border-left-color:#d03b3b} .rr-verdict.rr-b-warn{border-left-color:#fab219}
.rr-verdict.rr-b-good{border-left-color:#0ca30c} .rr-verdict.rr-b-none{border-left-color:#8a8980}
.rr-verdict-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rr-verdict-head h2{font-size:16.5px;margin:0;font-weight:640}
.rr-verdict-sub{color:var(--ink2);font-size:13px;margin:6px 0 0}
.rr-badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;font-weight:650;color:#fff;background:var(--muted)}
.rr-bg-crit{background:#d03b3b} .rr-bg-warn{background:#fab219;color:#3a2a00}
.rr-bg-good{background:#0ca30c} .rr-bg-info{background:#2a78d6} .rr-bg-none{background:#8a8980}
.rr-tiles{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.rr-tile{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:140px;
  display:flex;flex-direction:column;gap:2px;flex:1 1 140px}
.rr-tile-lab{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.rr-tile-big{font-size:24px;font-weight:680}
.rr-tile-sub{font-size:12px;color:var(--ink2)}
.rr-ink-crit{color:#d03b3b} .rr-ink-warn{color:#c98500} .rr-ink-good{color:#0ca30c}
.rr-ink-info{color:#2a78d6} .rr-ink-none{color:#8a8980}
.rr-method{margin:16px 0;padding:14px 16px;border-radius:10px;background:var(--surface);border:1px dashed var(--axis)}
.rr-method h3{margin:0 0 8px;font-size:14.5px;font-weight:640}
.rr-method ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink2)}
.rr-method li{margin-bottom:5px}
.rr-callout{margin:6px 0 10px;padding:8px 11px;border-radius:8px;background:var(--surface);border-left:3px solid #2a78d6}
.rr-callout-big{font-size:13.5px;padding:12px 14px;color:var(--ink)}
.rr-legend{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0 6px;font-size:12.5px;color:var(--ink2)}
.rr-leg-item{display:inline-flex;align-items:center;gap:6px}
.rr-sw{width:14px;height:14px;border-radius:3px;display:inline-block;border:1px solid var(--border)}
.rr-key{width:11px;height:11px;border-radius:2px;display:inline-block;vertical-align:baseline;border:1px solid var(--border)}
.rr-svg{width:100%;height:auto;background:var(--surface);border-radius:8px;border:1px solid var(--border);margin-bottom:8px}
.rr-svg-lab{font-size:11px;fill:var(--ink2)} .rr-svg-num{font-size:11px;fill:var(--muted)}
.rr-tick{font-size:9px;fill:var(--muted);text-anchor:middle}
.rr-tick-l{text-anchor:end}
.rr-grid{stroke:var(--grid);stroke-width:1}
.rr-axis-line{stroke:var(--axis);stroke-width:1.5;stroke-dasharray:3 2}
.rr-table{border-collapse:collapse;font-size:12px;width:100%;font-variant-numeric:tabular-nums;margin-bottom:4px}
.rr-table th,.rr-table td{border-bottom:1px solid var(--grid);padding:4px 8px;text-align:left}
.rr-table th{color:var(--muted);font-weight:600} .rr-table .num{text-align:right}
.rr-row-crit td{background:rgba(208,59,59,.06)}
.rr-row-sum td{border-top:2px solid var(--axis)}
.rr-tag{font-size:10px;padding:0 5px;border-radius:9px;background:rgba(42,120,214,.16);color:#2a78d6}
.rr-tag-n{background:rgba(138,137,128,.18);color:#8a8980}
.rr-foot{margin-top:32px;padding-top:12px;border-top:1px solid var(--grid);color:var(--muted);font-size:11.5px}
.rr-foot p{margin:2px 0}
</style>`;

export default renderPriceReport;
