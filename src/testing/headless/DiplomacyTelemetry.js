// ═══════════════════════════════════════════════════════════════
// WOJNA I POKÓJ 1.0 — D2/E7 — DIPLOMACY telemetry (czujnik + agregacja)
// ───────────────────────────────────────────────────────────────
// PRZYRZĄD, NIE MECHANIKA. Ten moduł niczego w grze nie zmienia — mierzy, jak
// Acceptance Engine (E1) ocenia propozycje, żeby E2 przeliczał dawne progi 60/75/80
// na wagi Z POMIAREM W RĘKU, a nie na wyczucie (decyzja fazy: E7 wchodzi PRZED E2).
//
// Dwa niezależne źródła danych — i to jest sedno projektu tego przyrządu:
//
//   1. MACIERZ AKCEPTACJI (syntetyczna, CZYSTA) — silnik odpytany na siatce
//      `archetyp × objective × czasownik × opinia` przy USTALONYCH warunkach.
//      Nie potrzebuje żywej gry, jest deterministyczna i działa JUŻ TERAZ, zanim
//      cokolwiek zostanie wpięte (E2/E3). To jest artefakt strojenia.
//
//   2. OBSERWACJA ŻYWEGO PRZEBIEGU (szereg czasowy) — jakie opinie, napięcia i statusy
//      NAPRAWDĘ występują. Bez tego macierz jest tabelą hipotez: gdyby realna opinia
//      nigdy nie dobijała do 10, próg „opinia ≥ 10" byłby martwy, a tabela i tak
//      pokazywałaby ładne liczby.
//
// Razem odpowiadają na pytanie E2: „gdzie leży granica decyzji i czy gra w ogóle
// dociera w jej okolice".
//
// Wzór: AiTelemetry.js (kontrakt driver'a `sample(gy, ctx)` + `getSeries()`, kanał
// boczny wyciągany przez runner z instancji). ⚠ RÓŻNICA: ten czujnik NICZEGO NIE
// OPAKOWUJE — AiTelemetry monkey-patchuje metody systemów AI, tu wystarczy odczyt,
// więc nie ma czego odpinać i nie ma jak zmienić zachowania gry.
// ═══════════════════════════════════════════════════════════════

import { evaluateWithContext } from '../../systems/diplomacy/AcceptanceEngine.js';
import {
  ACCEPTANCE_TERMS, ACCEPTANCE_TERM_IDS, TERM_STATUS,
  VERB_ACCEPTANCE, ACCEPTANCE_VERB_IDS, MEMORY_EVIDENCE_WEIGHTS,
} from '../../data/AcceptanceWeightData.js';
import { ARCHETYPES, ARCHETYPE_IDS, EMPIRE_OBJECTIVES } from '../../data/EmpireData.js';

// KNOBY POMIARU (nie stałe gry).
export const DIPLO_TELEMETRY_DEFAULTS = {
  // Jak blisko progu decyzja liczy się jako „na styk" (punkty wyniku).
  NEAR_THRESHOLD_PTS: 5,
};

// Siatka opinii macierzy. ZAWIERA dawne progi traktatów (10 / 25 / 30) oraz punkt
// tuż pod każdym z nich — inaczej macierz nie potrafiłaby pokazać, czy parytet trzyma.
export const MATRIX_OPINION_GRID = [-80, -60, -40, -20, -10, 0, 9, 10, 20, 24, 25, 29, 30, 40, 60, 80];

/**
 * USTALONE WARUNKI macierzy — per czasownik, bo inaczej pre-warunki wyzerowałyby całą
 * tabelę (pokój poza wojną jest zablokowany twardo, nie oceniany punktami).
 * Wszystko poza opinią trzymamy w stanie neutralnym: mierzymy WAGI, nie scenariusz.
 */
export function matrixBaseContext(verb) {
  const base = {
    verb, fromId: 'player', toId: 'emp_probe', year: 0,
    opinion: 0, tension: 0, status: 'peace', treaties: [], memory: [],
    personality: {}, archetype: null, objective: null, traits: [],
    proposerAggression: 0, war: null,
    thirdParty: { isOurAlly: false, alliesOfOurEnemies: 0, atWarWithOurEnemy: 0 },
    verbCooldowns: {}, offer: null, erraticSeed: 0,
  };
  if (verb === 'offer_peace') {
    // Wojna w połowie drogi do ceny pokoju incydentu granicznego — punkt, w którym
    // pozostałe termy jeszcze coś znaczą (przy exhaustion 0 war_status przygniata wszystko).
    return { ...base, status: 'war', war: { exhaustionSelf: 45, exhaustionOther: 45, peaceCost: 30 } };
  }
  return base;
}

/** Opis warunków do stopki raportu — czytelnik musi wiedzieć, co było trzymane stałe. */
export function matrixConditionsNote() {
  return {
    tension: 0,
    status: 'peace (pokój: war, exhaustion 45/45, peaceCost 30)',
    memory: 'puste', reputation: 0, offer: 'brak', traits: 'brak (bez erratic)',
    thirdParty: 'brak sojuszy i wspólnych wrogów',
    note: 'Zmienną jest WYŁĄCZNIE opinia — macierz mierzy wagi, nie scenariusz.',
  };
}

// ── Macierz akceptacji (CZYSTA — nie potrzebuje żywej gry) ──────────────────

/**
 * Odpytuje silnik na siatce archetyp × objective × czasownik × opinia.
 *
 * @returns {{
 *   verbs, archetypes, objectives, opinionGrid, conditions,
 *   cells: Array<{ archetype, objective, verb, threshold, acceptPct, minOpinion,
 *                  scoreAtZero, marginAtZero, blocked }>,
 *   termImpact: Object,   // termId → { maxAbs, nonZeroCells, declaredStatus }
 *   nearThreshold: { total, near, pct },
 *   degenerate: Array<{ verb, kind }>,
 * }}
 */
export function buildAcceptanceMatrix(opts = {}) {
  const cfg        = { ...DIPLO_TELEMETRY_DEFAULTS, ...opts };
  const verbs      = opts.verbs      ?? ACCEPTANCE_VERB_IDS;
  const archetypes = opts.archetypes ?? ARCHETYPE_IDS;
  const objectives = opts.objectives ?? EMPIRE_OBJECTIVES;
  const grid       = opts.opinionGrid ?? MATRIX_OPINION_GRID;

  const cells = [];
  let total = 0, near = 0;

  for (const archetype of archetypes) {
    const personality = ARCHETYPES[archetype]?.personality ?? {};
    for (const objective of objectives) {
      for (const verb of verbs) {
        const base = { ...matrixBaseContext(verb), archetype, objective, personality };
        let accepted = 0, minOpinion = null, threshold = null, blocked = false;
        let scoreAtZero = null;

        for (const opinion of grid) {
          const r = evaluateWithContext({ ...base, opinion });
          threshold = r.threshold;
          if (r.blocked) { blocked = true; continue; }
          total++;
          if (r.decision) { accepted++; if (minOpinion == null) minOpinion = opinion; }
          if (Math.abs(r.score - r.threshold) <= cfg.NEAR_THRESHOLD_PTS) near++;
          if (opinion === 0) scoreAtZero = r.score;
        }

        cells.push({
          archetype, objective, verb, threshold, blocked,
          acceptPct: blocked ? null : accepted / grid.length,
          minOpinion,
          scoreAtZero,
          marginAtZero: scoreAtZero == null ? null : Math.round((scoreAtZero - threshold) * 100) / 100,
        });
      }
    }
  }

  // Degeneracja = czasownik, który przy WSZYSTKICH archetypach i agendach odpowiada
  // tak samo. Wagi, które nie różnicują, nie są gałką — są stałą przebraną za gałkę.
  const degenerate = [];
  for (const verb of verbs) {
    const vc = cells.filter(c => c.verb === verb && !c.blocked);
    if (vc.length === 0) continue;
    if (vc.every(c => c.acceptPct === 1)) degenerate.push({ verb, kind: 'always_accept' });
    else if (vc.every(c => c.acceptPct === 0)) degenerate.push({ verb, kind: 'always_reject' });
    else if (new Set(vc.map(c => c.acceptPct)).size === 1) degenerate.push({ verb, kind: 'no_variation' });
  }

  return {
    verbs, archetypes, objectives, opinionGrid: grid,
    conditions: matrixConditionsNote(),
    cells,
    nearThreshold: { total, near, pct: total ? near / total : null },
    degenerate,
  };
}

// ── Sonda wrażliwości termów (osobno od macierzy — i to jest ISTOTNE) ───────
//
// ⚠ POWÓD ISTNIENIA: pierwsza wersja tego przyrządu mierzyła wkład termów NA MACIERZY
// i wyszło, że `tension` ma wkład 0 — bo macierz trzyma napięcie na zerze z założenia
// (zmienną jest tylko opinia). Term DZIAŁAJĄCY wyglądał na martwy przez konstrukcję
// pomiaru, a nie przez stan kodu. Dlatego uczciwość termów mierzy OSOBNA sonda, która
// każdemu termowi podaje jego SKRAJNE wejście i patrzy, czy wynik drgnie.
//
// Rozróżnienie, które z tego wychodzi, jest dokładnie tym, czego wymaga Decyzja 2 fazy:
//   probeMaxAbs = 0  ⇒ term NIE JEST W STANIE ruszyć wyniku niczym (stub albo pusty katalog)
//   probeMaxAbs > 0 przy statusie ≠ live ⇒ term liczy, ale w GRZE nikt go nie zasila
const TERM_PROBES = {
  opinion:        [{ opinion: 100 }, { opinion: -100 }],
  tension:        [{ tension: 100 }],
  relative_power: [{ tension: 100, opinion: 100 }],   // nic nie może go ruszyć — o to chodzi
  war_status:     [{ status: 'war', war: { exhaustionSelf: 100, exhaustionOther: 100, peaceCost: 0 } },
                   { status: 'war', war: { exhaustionSelf: 0,   exhaustionOther: 0,   peaceCost: 100 } }],
  personality:    [{ personality: { aggression: 0, expansion: 0, secrecy: 0, trade: 0, science: 0 } },
                   { personality: { aggression: 1, expansion: 1, secrecy: 1, trade: 1, science: 1 } }],
  reputation:     [{ proposerAggression: 100 }],
  offer:          [{ offer: { credits: 1e6 } }],
  memory:         [{ memory: Object.keys(MEMORY_EVIDENCE_WEIGHTS).map(type => ({ type })) }],
  recent_refusal: [{ year: 0, verbCooldowns: {} }],   // uzupełniane per czasownik niżej
  third_party:    [{ thirdParty: { isOurAlly: true, alliesOfOurEnemies: 10, atWarWithOurEnemy: 0 } },
                   { thirdParty: { isOurAlly: false, alliesOfOurEnemies: 0, atWarWithOurEnemy: 10 } }],
  erratic_noise:  [{ traits: ['erratic'], erraticSeed: 1 }, { traits: ['erratic'], erraticSeed: 7 },
                   { traits: ['erratic'], erraticSeed: 99 }, { traits: ['erratic'], erraticSeed: 12345 }],
};

/**
 * Dla każdego termu i każdego czasownika: największy |wkład|, jaki term potrafi wnieść,
 * gdy poda mu się skrajne wejście. Czysta, niezależna od przebiegu.
 * @returns {Object} termId → { maxAbs, byVerb: {verb: maxAbs}, declaredStatus }
 */
export function probeTermImpact(opts = {}) {
  const verbs = opts.verbs ?? ACCEPTANCE_VERB_IDS;
  const out = Object.fromEntries(ACCEPTANCE_TERM_IDS.map(id => [id, {
    maxAbs: 0, byVerb: {}, declaredStatus: ACCEPTANCE_TERMS[id].status,
  }]));

  for (const verb of verbs) {
    const base = matrixBaseContext(verb);
    for (const termId of ACCEPTANCE_TERM_IDS) {
      if (VERB_ACCEPTANCE[verb].terms[termId] == null) continue;   // czasownik nie używa termu
      const patches = (TERM_PROBES[termId] ?? [{}]).map(p =>
        termId === 'recent_refusal' ? { ...p, verbCooldowns: { [verb]: 0 } } : p);
      let best = 0;
      for (const patch of patches) {
        const r = evaluateWithContext({ ...base, ...patch, verb });
        if (r.blocked) continue;
        const row = r.breakdown.find(x => x.term === termId);
        if (row) best = Math.max(best, Math.abs(row.value));
      }
      out[termId].byVerb[verb] = best;
      out[termId].maxAbs = Math.max(out[termId].maxAbs, best);
    }
  }
  return out;
}

/**
 * Katalog termów do tabeli wag: status Z DANYCH (E1) + wagi per czasownik + zmierzony
 * wpływ. ⚠ To jest wymóg Decyzji 2 fazy: kolumna siły MUSI być jawnie oznaczona jako
 * BEZCZYNNA, żeby nikt nie stroił wag względem termu zwracającego zero. Oznaczenie
 * bierzemy z danych, a `measuredMaxAbs` jest jego DOWODEM (albo zaprzeczeniem).
 */
export function termCatalogRows(probe = null) {
  return ACCEPTANCE_TERM_IDS.map(id => {
    const def = ACCEPTANCE_TERMS[id];
    const weights = {};
    for (const verb of ACCEPTANCE_VERB_IDS) {
      const w = VERB_ACCEPTANCE[verb].terms[id];
      if (w != null) weights[verb] = w;
    }
    const impact = probe?.[id] ?? null;
    return {
      id, labelKey: def.labelKey, status: def.status, unit: def.unit, note: def.note,
      weights,
      // Największy |wkład| przy SKRAJNYM wejściu — czyli „czy ten term w ogóle potrafi
      // ruszyć wynik". Zero ⇒ nie potrafi niczym (stub albo pusty katalog dowodów).
      probeMaxAbs: impact ? impact.maxAbs : null,
      probeByVerb: impact ? impact.byVerb : null,
      cannotMove: impact ? impact.maxAbs === 0 : null,
      // ⚠ Term deklarowany jako DZIAŁAJĄCY, którego nie da się ruszyć niczym — oznaczenie
      // kłamie albo kod jest martwy. Raport pokazuje to jako ⚠, bo strojenie jego wagi
      // byłoby stratą czasu.
      inertUnexpected: impact ? (impact.maxAbs === 0 && def.status === TERM_STATUS.LIVE) : null,
      // Odwrotny rozjazd: term potrafi ruszyć wynik, ale w GRZE nikt go nie zasila.
      // To jest uczciwa treść markerów K-2 / K-4 / K-5 — nie „nie działa", tylko „nie ma paliwa".
      worksButUnfed: impact ? (impact.maxAbs > 0 && def.status !== TERM_STATUS.LIVE) : null,
    };
  });
}

// ── Obserwacja żywego przebiegu ─────────────────────────────────────────────

/** Migawka relacji gracz↔imperium z ŻYWEJ gry. Sam odczyt — zero mutacji. */
export function relationSnapshot(dipl, empireId) {
  if (!dipl) return null;
  return {
    empireId,
    opinion:  dipl.getOpinionOfPlayer?.(empireId) ?? 0,
    tension:  dipl.getTension?.(empireId) ?? 0,
    status:   dipl.getStatus?.(empireId) ?? 'peace',
    treaties: (dipl.relations?.getTreaties?.('player', empireId) ?? []).map(t => t?.id),
    memoryN:  (dipl.relations?.getMemory?.('player', empireId, 99) ?? []).length,
    aggression: dipl.getReputation?.(empireId)?.aggression ?? 0,
    band:     dipl.getOpinionBand?.(empireId) ?? null,
  };
}

export class DiplomacyTelemetry {
  constructor(opts = {}) {
    this.cfg     = { ...DIPLO_TELEMETRY_DEFAULTS, ...opts };
    this._rows   = [];
    this._matrix = null;
  }

  /** Migawka roku `gy`. Kontrakt driver'a. Czyta ŻYWY stan z window.KOSMOS. */
  sample(gy) {
    const K    = globalThis.window?.KOSMOS ?? {};
    const dipl = K.diplomacySystem;
    const reg  = K.empireRegistry;
    const wars = K.warSystem?.listActive?.() ?? [];

    const empires = (reg?.listAll?.() ?? []).map(e => ({
      ...relationSnapshot(dipl, e.id),
      archetype: e.archetype ?? null,
      objective: e.objective ?? null,
      traits:    Array.isArray(e.traits) ? e.traits.slice() : [],
    }));

    const row = {
      gy: Math.round(gy),
      empires,
      warsActive: wars.length,
      // Sygnał, na którym stoi detektor DIPLOMACY_DEAD — po E3/E6 może zacząć zapalać się
      // z innego powodu niż dotąd, więc mierzymy go od razu, zanim cokolwiek wpięto.
      maxTension: empires.reduce((m, e) => Math.max(m, e?.tension ?? 0), 0),
      // Kolaboratory silnika obecne? Brak = pomiar bez wartości (ta sama klasa cichej
      // degradacji, którą sonda zależności łapie w slice'ie AI).
      wired: { diplomacySystem: !!dipl, empireRegistry: !!reg, warSystem: !!K.warSystem },
    };
    this._rows.push(row);
    return row;
  }

  getSeries() { return this._rows.slice(); }

  /** Kanał boczny: macierz. Liczona RAZ (czysta, niezależna od przebiegu). */
  getMatrix() {
    if (!this._matrix) this._matrix = buildAcceptanceMatrix(this.cfg);
    return this._matrix;
  }
}

// ── Agregacja ───────────────────────────────────────────────────────────────

const med = (xs) => {
  const a = xs.filter(x => Number.isFinite(x)).sort((p, q) => p - q);
  if (a.length === 0) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Podsumowanie JEDNEGO seeda: co realnie działo się z relacjami przez przebieg. */
export function summarizeSeed(series = []) {
  const last = series.at(-1) ?? null;
  const allOpinions = [], allTensions = [];
  let warYears = 0, treatyYears = 0, anyTreaty = false;
  for (const r of series) {
    for (const e of (r.empires ?? [])) {
      allOpinions.push(e.opinion);
      allTensions.push(e.tension);
      if (e.status === 'war') warYears++;
      if ((e.treaties ?? []).length > 0) { treatyYears++; anyTreaty = true; }
    }
  }
  // ⚠ Rozróżnienie, bez którego werdykt kłamie: „opinia nigdy nie drgnęła" to zwykle
  // własność PRZEBIEGU (bot referencyjny nie prowadzi rozmów), a nie zbyt słabych źródeł
  // opinii w grze. Te dwie diagnozy prowadzą do zupełnie różnych działań.
  const opinionEverMoved = allOpinions.some(o => (o ?? 0) !== 0);
  const tensionEverMoved = allTensions.some(t => (t ?? 0) !== 0);
  return {
    empiresObserved: last?.empires?.length ?? 0,
    opinionMin: allOpinions.length ? Math.min(...allOpinions) : null,
    opinionMax: allOpinions.length ? Math.max(...allOpinions) : null,
    opinionMed: med(allOpinions),
    tensionMax: allTensions.length ? Math.max(...allTensions) : null,
    tensionMed: med(allTensions),
    opinionEverMoved, tensionEverMoved,
    warYears, treatyYears, anyTreaty,
    warsActiveEnd: last?.warsActive ?? 0,
    wired: last?.wired ?? null,
    endOpinions: (last?.empires ?? []).map(e => ({ empireId: e.empireId, opinion: e.opinion, tension: e.tension, status: e.status })),
  };
}

export function aggregatePanel(summaries = []) {
  const s = summaries.filter(Boolean);
  return {
    seeds: s.length,
    empiresObserved: med(s.map(x => x.empiresObserved)),
    medOpinionMax: med(s.map(x => x.opinionMax)),
    medOpinionMin: med(s.map(x => x.opinionMin)),
    medOpinionMed: med(s.map(x => x.opinionMed)),
    medTensionMax: med(s.map(x => x.tensionMax)),
    seedsWithWar:    s.filter(x => x.warYears > 0).length,
    seedsWithTreaty: s.filter(x => x.anyTreaty).length,
    seedsWithAnyDiplomacy: s.filter(x => x.opinionEverMoved || x.tensionEverMoved).length,
    wiredEverywhere: s.every(x => x.wired?.diplomacySystem && x.wired?.empireRegistry),
  };
}

// ── Progi zdrowia przyrządu (kryteria pomiaru, NIE stałe gry) ───────────────
export const DIPLO_HEALTH = {
  // Macierz, w której czasownik zachowuje się identycznie wszędzie, nie nadaje się do strojenia.
  MAX_DEGENERATE_VERBS: 0,
  // Zbyt wiele decyzji „na styk" = wynik zdominowany przez szum, za mało = próg martwy.
  NEAR_THRESHOLD_PCT_MAX: 0.35,
  // Opinia obserwowana w grze musi SIĘGAĆ dawnego progu umowy handlowej (10),
  // inaczej granica decyzji leży poza zasięgiem rozgrywki.
  OPINION_REACH_MIN: 10,
};

/**
 * Werdykt PRZYRZĄDU, nie rozgrywki (E7 mierzy silnik, zanim cokolwiek go używa):
 *   1 = macierz nie różnicuje ⇒ wagi są stałą przebraną za gałkę (do naprawy PRZED E2)
 *   2 = macierz różnicuje ⇒ instrument gotowy dla E2
 *   3 = macierz różnicuje, ale obserwacja NIC nie orzeka albo źródła opinii są za słabe
 *   0 = brak danych
 *
 * ⚠ Outcome 3 ma DWA różne powody i mylenie ich prowadzi do zupełnie innych działań:
 *   (a) przebieg referencyjny w ogóle nie ćwiczy dyplomacji — bot nie prowadzi rozmów,
 *       więc opinia stoi na zerze. To własność HARNESSU, nie gry: macierz zostaje jedynym
 *       źródłem prawdy dla E2, a obserwacja po prostu milczy.
 *   (b) dyplomacja się dzieje, ale opinia nie dobija do dawnych progów — WTEDY i tylko
 *       wtedy problemem są ŹRÓDŁA opinii (emisariusze, handel), a nie progi.
 */
export function verdict(matrix, agg) {
  if (!matrix || !agg || !agg.seeds) return { outcome: 0, label: 'Brak danych' };
  if ((matrix.degenerate?.length ?? 0) > DIPLO_HEALTH.MAX_DEGENERATE_VERBS) {
    return {
      outcome: 1,
      label: `Macierz nie różnicuje dla ${matrix.degenerate.length} czasownik(ów) — wagi do poprawy przed E2`,
    };
  }
  if ((agg.seedsWithAnyDiplomacy ?? 0) === 0) {
    return {
      outcome: 3,
      label: 'Macierz różnicuje; przebieg referencyjny NIE ćwiczy dyplomacji (bot nie prowadzi rozmów, ' +
             'opinia i napięcie stoją na zerze) — obserwacja nie orzeka, macierz zostaje jedynym źródłem dla E2',
    };
  }
  const reach = agg.medOpinionMax ?? 0;
  if (reach < DIPLO_HEALTH.OPINION_REACH_MIN) {
    return {
      outcome: 3,
      label: `Dyplomacja się dzieje, ale opinia sięga tylko ${reach} (próg umowy handlowej ${DIPLO_HEALTH.OPINION_REACH_MIN}) ` +
             '— to problem ŹRÓDEŁ opinii, nie progów',
    };
  }
  return { outcome: 2, label: 'Macierz różnicuje i przebieg dociera w okolice progów — instrument gotowy dla E2' };
}

export default DiplomacyTelemetry;
