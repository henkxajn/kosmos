// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — AI health thresholds (progi zdrowia imperiów AI)
// ───────────────────────────────────────────────────────────────
// Progi WSTĘPNE (brief slice'u), do przestrojenia — NIE są stałą balansu gry.
// To kryteria POMIARU: „czego oczekujemy po żywym imperium", żeby móc powiedzieć
// czy AI stoi. Naruszenie = linia WARN w raporcie, NIGDY zmiana w grze (HARD #1).
//
// Wszystko w GAME-LATACH (HARD #3). Czyste funkcje — keeper testuje je wprost,
// bez bootowania gry.
//
// ⚠ WOJNA jako kontekst, nie wymówka: próg „populacja rośnie" brief warunkuje
//   frazą „absent war". Nie tłumimy więc warna po cichu — oznaczamy go flagą
//   `duringWar`, żeby czytelnik raportu sam rozstrzygnął, czy spadek jest
//   wyjaśniony walką, czy to awaria ekonomii.
// ═══════════════════════════════════════════════════════════════

export const AI_HEALTH_THRESHOLDS = {
  FIRST_OUTPOST_GY:   2,      // pierwsza NOWA placówka w ~2 game-lata
  COLONIES_TARGET:    3,      // „3+ ciał" (pełne kolonie + placówki)
  COLONIES_BY_GY:     10,     // …do ~8-10 gy (bierzemy łagodniejszy koniec pasma)
  POP_DECLINE_YEARS:  3,      // ≥3 lata z rzędu spadku = trwały spadek (nie szum)
  DEFICIT_GY:         1,      // żaden zasób przetrwania nie stoi na zerze dłużej niż 1 gy
  // ⚠ TYLKO zasoby MAGAZYNOWANE. `energy` NIE jest tu celowo: w grze nie ma magazynu
  //   energii — `getAmount('energy')` zwraca BILANS (produkcja − pobór), więc „zero"
  //   znaczy „sieć wysycona co do joula", a nie „brak energii". Liczone stockiem dawało
  //   4/4 imperiów fałszywie na czerwono od gy 0. Energia ma własne sprawdzenie niżej
  //   (ujemny bilans / brownout) — ten sam próg czasu, właściwa wielkość.
  SURVIVAL_RESOURCES: ['food', 'water'],
  STOCK_EPS:          1.0,    // magazyn ≤ to ≈ pusty (parytet z ResourceTelemetry.STOCK_EPS)
};

export const WARN_CODES = {
  NO_FIRST_OUTPOST:  'AI_NO_FIRST_OUTPOST',
  SLOW_FIRST_OUTPOST:'AI_SLOW_FIRST_OUTPOST',
  FEW_COLONIES:      'AI_FEW_COLONIES',
  POP_DECLINE:       'AI_POP_DECLINE',
  RESOURCE_ZERO:     'AI_RESOURCE_ZERO',
  ENERGY_DEFICIT:    'AI_ENERGY_DEFICIT',
  NO_MOTHER:         'AI_NO_MOTHER_COLONY',
};

/**
 * Ocena progów dla JEDNEGO przebiegu (jednego seeda).
 * @param {Array}  series — szereg AiTelemetry (rows: { gy, empires[], player })
 * @param {object} [cfg]  — nadpisania progów
 * @returns {{ warns: Array, checks: Array }} — warns = naruszenia, checks = wszystkie
 *          wykonane sprawdzenia (także zdane; „nie sprawdzono" ma status 'n/a')
 */
export function evaluateThresholds(series, cfg = {}) {
  const TH = { ...AI_HEALTH_THRESHOLDS, ...cfg };
  const warns = [], checks = [];
  if (!Array.isArray(series) || series.length === 0) return { warns, checks };

  const lastGy = series[series.length - 1]?.gy ?? 0;
  const ids = [...new Set(series.flatMap(r => (r.empires ?? []).map(e => e.empireId)))];

  for (const id of ids) {
    const track = series.map(r => ({ gy: r.gy, e: (r.empires ?? []).find(x => x.empireId === id) }))
                        .filter(x => x.e);
    if (!track.length) continue;
    const name = track[track.length - 1].e.name ?? id;
    const add = (status, code, detail, extra = {}) => {
      const rec = { status, code, empireId: id, name, detail, ...extra };
      checks.push(rec);
      if (status === 'warn') warns.push(rec);
    };

    // 1) Pierwsza placówka w FIRST_OUTPOST_GY.
    const firstOutpost = track.find(x => (x.e.outposts ?? 0) > 0)?.gy ?? null;
    if (firstOutpost == null) {
      add('warn', WARN_CODES.NO_FIRST_OUTPOST,
        `ŻADNEJ placówki przez cały przebieg (${lastGy} gy); próg: ${TH.FIRST_OUTPOST_GY} gy`, { gy: null });
    } else if (firstOutpost > TH.FIRST_OUTPOST_GY) {
      add('warn', WARN_CODES.SLOW_FIRST_OUTPOST,
        `pierwsza placówka dopiero w ${firstOutpost} gy (próg ${TH.FIRST_OUTPOST_GY} gy — ${round1(firstOutpost / TH.FIRST_OUTPOST_GY)}× za późno)`,
        { gy: firstOutpost });
    } else {
      add('ok', WARN_CODES.SLOW_FIRST_OUTPOST, `pierwsza placówka w ${firstOutpost} gy`, { gy: firstOutpost });
    }

    // 2) COLONIES_TARGET ciał do COLONIES_BY_GY.
    if (lastGy < TH.COLONIES_BY_GY) {
      add('n/a', WARN_CODES.FEW_COLONIES, `przebieg krótszy (${lastGy} gy) niż punkt kontrolny ${TH.COLONIES_BY_GY} gy`);
    } else {
      const at = nearestAt(track, TH.COLONIES_BY_GY);
      const bodies = (at?.e.coloniesFull ?? 0) + (at?.e.outposts ?? 0);
      if (bodies < TH.COLONIES_TARGET) {
        add('warn', WARN_CODES.FEW_COLONIES,
          `w ${TH.COLONIES_BY_GY} gy tylko ${bodies} ciał (próg ${TH.COLONIES_TARGET}+)`, { gy: TH.COLONIES_BY_GY, bodies });
      } else {
        add('ok', WARN_CODES.FEW_COLONIES, `w ${TH.COLONIES_BY_GY} gy: ${bodies} ciał`, { gy: TH.COLONIES_BY_GY, bodies });
      }
    }

    // 3) Populacja rośnie (poza wojną). Trwały spadek = ≥ POP_DECLINE_YEARS lat z rzędu.
    const pops = track.map(x => x.e.mother?.pop ?? 0);
    const dec = longestDecline(pops);
    if (dec.len >= TH.POP_DECLINE_YEARS) {
      const fromGy = track[dec.startIdx]?.gy ?? null, toGy = track[dec.endIdx]?.gy ?? null;
      const duringWar = track.slice(dec.startIdx, dec.endIdx + 1).some(x => x.e.atWar);
      add('warn', WARN_CODES.POP_DECLINE,
        `populacja macierzystej spada ${dec.len} lat z rzędu (${pops[dec.startIdx]}→${pops[dec.endIdx]}, gy ${fromGy}→${toGy})` +
        (duringWar ? ' — W TRAKCIE WOJNY (kontekst, nie usprawiedliwienie)' : ' — BEZ wojny'),
        { gy: fromGy, duringWar, years: dec.len });
    } else {
      add('ok', WARN_CODES.POP_DECLINE, `brak trwałego spadku populacji (najdłuższa seria: ${dec.len} lat)`);
    }

    // 4) Zasób przetrwania na zerze dłużej niż DEFICIT_GY.
    for (const resId of TH.SURVIVAL_RESOURCES) {
      const zero = longestRun(track.map(x => (x.e.mother?.stock?.[resId] ?? 1) <= TH.STOCK_EPS));
      if (zero.len > TH.DEFICIT_GY) {
        add('warn', WARN_CODES.RESOURCE_ZERO,
          `${resId}: magazyn na zerze przez ${zero.len} gy z rzędu (od gy ${track[zero.startIdx]?.gy}; próg > ${TH.DEFICIT_GY} gy)`,
          { gy: track[zero.startIdx]?.gy, resource: resId, years: zero.len });
      } else {
        add('ok', WARN_CODES.RESOURCE_ZERO, `${resId}: brak trwałego zera (najdłużej ${zero.len} gy)`, { resource: resId });
      }
    }

    // 4b) Energia — właściwą wielkością jest BILANS/brownout, nie magazyn (patrz nota przy progach).
    const energyBad = longestRun(track.map(x =>
      x.e.mother ? (x.e.mother.brownout === true || (x.e.mother.energyBalance ?? 0) < 0) : false));
    if (energyBad.len > TH.DEFICIT_GY) {
      add('warn', WARN_CODES.ENERGY_DEFICIT,
        `energia: ujemny bilans / brownout przez ${energyBad.len} gy z rzędu (od gy ${track[energyBad.startIdx]?.gy}; próg > ${TH.DEFICIT_GY} gy)`,
        { gy: track[energyBad.startIdx]?.gy, resource: 'energy', years: energyBad.len });
    } else {
      add('ok', WARN_CODES.ENERGY_DEFICIT, `energia: brak trwałego deficytu (najdłużej ${energyBad.len} gy)`, { resource: 'energy' });
    }

    // 5) Brak macierzystej = imperium PASYWNE (warstwa C pomija je co tick).
    if (!track[track.length - 1].e.mother) {
      add('warn', WARN_CODES.NO_MOTHER,
        'brak pełnej kolonii macierzystej na koniec przebiegu → warstwa C pomija imperium w KAŻDYM ticku');
    }
  }

  return { warns, checks };
}

/** Zwinięcie WARN-ów z całego panelu: kod → { count, empires, seeds, sample }. */
export function rollupWarns(perSeedWarns) {
  const roll = new Map();
  perSeedWarns.forEach((warns, seedIdx) => {
    for (const w of warns) {
      const rec = roll.get(w.code) ?? { code: w.code, count: 0, empires: new Set(), seeds: new Set(), sample: w.detail };
      rec.count++;
      rec.empires.add(`${seedIdx}:${w.empireId}`);
      rec.seeds.add(seedIdx);
      roll.set(w.code, rec);
    }
  });
  return [...roll.values()]
    .map(r => ({ ...r, empires: r.empires.size, seeds: r.seeds.size }))
    .sort((a, b) => b.count - a.count);
}

/** Sformatowana linia WARN (jedno miejsce prawdy dla konsoli i raportu HTML). */
export function formatWarn(w) {
  return `⚠ WARN  ${w.code.padEnd(22)} ${String(w.name ?? w.empireId).slice(0, 22).padEnd(22)} — ${w.detail}`;
}

// ── helpery (czyste) ─────────────────────────────────────────────
function nearestAt(track, gy) {
  let best = null;
  for (const x of track) { if (x.gy <= gy) best = x; else break; }
  return best ?? track[0] ?? null;
}
/** Najdłuższa seria ŚCISŁYCH spadków; zwraca długość + indeksy krańców. */
function longestDecline(vals) {
  let best = { len: 0, startIdx: 0, endIdx: 0 }, cur = 0, start = 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] < vals[i - 1]) {
      if (cur === 0) start = i - 1;
      cur++;
      if (cur > best.len) best = { len: cur, startIdx: start, endIdx: i };
    } else cur = 0;
  }
  return best;
}
/** Najdłuższa seria `true` w tablicy boolean. */
function longestRun(flags) {
  let best = { len: 0, startIdx: 0 }, cur = 0, start = 0;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      if (cur === 0) start = i;
      cur++;
      if (cur > best.len) best = { len: cur, startIdx: start };
    } else cur = 0;
  }
  return best;
}
function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }

export default evaluateThresholds;
