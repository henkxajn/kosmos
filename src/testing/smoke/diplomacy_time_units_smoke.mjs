// D2/E6 (WOJNA I POKÓJ 1.0) — smoke: JEDNOSTKA CZASU dyplomacji + przestrojenie.
// Uruchom: node src/testing/smoke/diplomacy_time_units_smoke.mjs
//
// Ten plik jest KONTRAKTEM commita E6 i dowodem na live-gate'cie. Pinuje tabelę
// §Baseline z `docs/design/D2_PLAN.md` WYKONANIEM: przepuszcza prawdziwe
// `RelationsModel.tickModifiers` / `OpinionMath` przez kadencję produkcyjną
// (`DiplomacySystem` tyka raz na 1 rok CYWILIZACYJNY i podaje `dy = 1/CIV_TIME_SCALE`
// roku WYŚWIETLANEGO) i mierzy, po ilu krokach wpis znika.
//
// Dwie klasy asercji, i różnica między nimi jest CAŁĄ decyzją E6:
//
//   §R — PUNKTY ODNIESIENIA (zawężona decyzja 3, podpisana 2026-08-10). Mechanizmy
//        ŻYWE w zaszytym buildzie (ramp umowy handlowej i decay napięcia — ANI JEDEN
//        nie jest bramkowany flagą) muszą mieć odczuwalne tempo NIETKNIĘTE przez
//        unifikację. Pinujemy je CO DO CYFRY: 4,167 i 0,5 roku wyświetlanego.
//
//   §L — TEMPO USTALONE RAZ. Zanikanie modyfikatorów i reputacji siedzi za
//        `FEATURES.diplomacyDecay`, która do E6 była WYŁĄCZONA — w zaszytym buildzie
//        te tempa NIGDY nie działały, więc nie było odczuwalnego tempa do zachowania.
//        Cyfry zostały, jednostką stał się rok wyświetlany; wynikające życia są tutaj
//        pinowane, żeby kolejne strojenie (D4/D5) było WIDOCZNE, a nie ciche.
//
// Instrument do strojenia (nie test): src/testing/headless/probe-diplomacy-time-units.mjs

globalThis.window = globalThis.window ?? {};
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const { RelationsModel } = await import('../../systems/diplomacy/RelationsModel.js');
const { GAME_CONFIG }    = await import('../../config/GameConfig.js');
const { tensionAfterDecay, modifierYearsLeft } = await import('../../utils/OpinionMath.js');
const {
  OPINION_MODIFIERS, MODIFIER_EPSILON, TRUCE_YEARS,
} = await import('../../data/OpinionModifierData.js');
const { RECENT_REFUSAL_YEARS, ERRATIC_EPOCH_YEARS } = await import('../../data/AcceptanceWeightData.js');

const CIV  = GAME_CONFIG.CIV_TIME_SCALE;
const STEP = 1 / CIV;                 // dy jednego kroku kadencji, w latach WYŚWIETLANYCH
const r2   = (n) => Math.round(n * 100) / 100;
const r3   = (n) => Math.round(n * 1000) / 1000;

function makeStore() {
  const root = {};
  return {
    get(path) {
      if (!path) return root;
      let cur = root;
      for (const seg of path.split('.')) { if (cur == null) return undefined; cur = cur[seg]; }
      return cur;
    },
    set(path, value) {
      const segs = path.split('.');
      let cur = root;
      for (const seg of segs.slice(0, -1)) {
        if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = {};
        cur = cur[seg];
      }
      cur[segs.at(-1)] = value;
    },
  };
}
const mk = () => new RelationsModel(makeStore(), () => 0);

/** Tyka kadencją produkcyjną aż wpis zniknie. Zwraca lata WYŚWIETLANE. */
function fadeYears(modId, value) {
  const m = mk();
  m.addModifier('emp_x', 'player', modId, { value });
  let calls = 0;
  while (m.hasModifier('emp_x', 'player', modId) && calls < 100000) { m.tickModifiers(STEP); calls++; }
  return { calls, years: calls * STEP };
}

console.log('═══ D2/E6 — jednostka czasu dyplomacji ═══');
console.log(`CIV_TIME_SCALE=${CIV} · krok kadencji = ${r3(STEP)} roku wyświetlanego · epsilon=${MODIFIER_EPSILON}`);

// ── §R — PUNKTY ODNIESIENIA (odczuwalne tempo NIETKNIĘTE) ───────────────────
console.log('--- §R: punkty odniesienia zawężonej decyzji 3 ---');
{
  // R1 — ramp umowy handlowej 0 → +50. ŻYWY (ramp nigdy nie był za flagą).
  const m = mk();
  m.addModifier('emp_x', 'player', 'trade_partner', {});
  let calls = 0;
  while (m.getOpinion('emp_x', 'player') < OPINION_MODIFIERS.trade_partner.rampMax && calls < 100000) {
    m.tickModifiers(STEP); calls++;
  }
  ok(`R1: ramp 0→+50 zajmuje 4,167 roku wyświetlanego (zmierzone ${r3(calls * STEP)}) — tempo sprzed E6 CO DO CYFRY`,
    r3(calls * STEP) === 4.167);
  ok('R1b: to jest DOKŁADNIE 50 kroków kadencji, czyli dawne +1 na rok cywilizacyjny',
    calls === 50);

  // R2 — decay napięcia 30 → 0 przy PEACE_DECAY (przestrojone 5 → 60 = ta sama prędkość).
  const RATE = 60;                    // = PEACE_DECAY po unifikacji (DiplomacySystem)
  let t = 30, steps = 0;
  while (t > 0 && steps < 100000) { t = tensionAfterDecay(t, STEP, RATE); steps++; }
  ok(`R2: napięcie 30→0 zajmuje 0,5 roku wyświetlanego (zmierzone ${r3(steps * STEP)}) — tempo sprzed E6 CO DO CYFRY`,
    r3(steps * STEP) === 0.5);
  ok('R2b: to jest DOKŁADNIE 6 kroków kadencji, czyli dawne −5 na rok cywilizacyjny',
    steps === 6 && tensionAfterDecay(30, STEP, RATE) === 25);

  // R3 — ramp na kroku kadencji nadal wnosi równo +1 (parytet z `_tickTreaties`).
  const m3 = mk();
  m3.addModifier('emp_x', 'player', 'trade_partner', {});
  m3.tickModifiers(STEP);
  ok('R3: jeden krok kadencji = +1 opinii z rampu (parytet z dawnym _tickTreaties)',
    m3.getOpinion('emp_x', 'player') === 1);
}

// ── §L — TEMPO ZANIKANIA USTALONE RAZ (tabela §B1) ──────────────────────────
console.log('--- §L: życie modyfikatorów w latach WYŚWIETLANYCH (tabela §B1) ---');
{
  const flagBefore = GAME_CONFIG.FEATURES.diplomacyDecay;
  GAME_CONFIG.FEATURES.diplomacyDecay = true;      // §L mierzy stan PO flipie, jawnie

  // [modId, wartość, oczekiwane lata wyświetlane, oczekiwany odczyt UI]
  const TABLE = [
    ['envoy_goodwill',      5,   4.583,  5],
    ['military_presence',  -5,   2.333,  3],
    ['recent_war',        -15,   7.333,  8],
    ['legacy_relations',   30,  14.75,  15],
    ['their_envoy',         3,   2.5,    3],
    ['research_intrusion', -3,   1.333,  2],
    ['trespassing',        -5,   2.333,  3],
  ];
  for (const [id, value, years, ui] of TABLE) {
    const got = fadeYears(id, value);
    ok(`L: ${id} (${value}, tempo ${OPINION_MODIFIERS[id].decayPerYear}/rok wyśw.) gaśnie po ${years} roku wyśw. (zmierzone ${r3(got.years)})`,
      r3(got.years) === years);
    ok(`L-UI: ${id} — panel pokazuje „${ui}" i to są teraz lata WYŚWIETLANE`,
      modifierYearsLeft({ value, decayPerYear: OPINION_MODIFIERS[id].decayPerYear }) === ui);
  }

  // Pasmo: KAŻDE życie mieści się w tym samym rzędzie wielkości co stałe pisane świadomie
  // (rozejm 10, epoka humoru 10, łaska po ultimatum 3, karencja odmowy 2). To jest cała
  // teza §B4 — po unifikacji dyplomacja mówi jedną skalą czasu.
  const lives = TABLE.map(([id, v]) => fadeYears(id, v).years);
  ok(`L-pasmo: wszystkie życia w przedziale 1–15 lat wyświetlanych (min ${r2(Math.min(...lives))}, max ${r2(Math.max(...lives))})`,
    Math.min(...lives) >= 1 && Math.max(...lives) <= 15);

  // §B5 — TEST ROZSTRZYGAJĄCY: dwie nogi emisariusza MUSZĄ współistnieć.
  // Misja trwa 5,0 lat wyświetlanych (MissionSystem: dotarcie +2,5, powrót +5,0), tryb
  // ACCUMULATE ma je zsumować. Gdyby tempo było 12× szybsze (wariant odrzucony), noga 1
  // wygasałaby PRZED powrotem i „sumowanie" nie miałoby czego sumować.
  const GAP = 2.5;                                  // lata wyświetlane między nogami
  const m = mk();
  m.addModifier('emp_x', 'player', 'envoy_goodwill', {});          // noga 1: dotarcie
  for (let i = 0; i < Math.round(GAP * CIV); i++) m.tickModifiers(STEP);
  const aliveAtReturn = m.hasModifier('emp_x', 'player', 'envoy_goodwill');
  const valueAtReturn = m.getOpinion('emp_x', 'player');
  m.addModifier('emp_x', 'player', 'envoy_goodwill', {});          // noga 2: powrót
  const total = m.getOpinion('emp_x', 'player');
  ok('B5a: dobra wola z DOTARCIA jeszcze ŻYJE w chwili powrotu emisariusza (2,5 roku wyśw. później)',
    aliveAtReturn === true);
  ok(`B5b: nogi się SUMUJĄ — ${r2(valueAtReturn)} + 5 = ${r2(total)} (tryb ACCUMULATE ma co sumować)`,
    total > 5 && r2(total) === r2(valueAtReturn + 5));
  ok('B5c: decay bierze swoje w czasie drogi powrotnej (suma < nominalne +10 — to POPRAWNE)',
    total < 10);

  GAME_CONFIG.FEATURES.diplomacyDecay = flagBefore;
  ok('L-higiena: flaga przywrócona po bloku', GAME_CONFIG.FEATURES.diplomacyDecay === flagBefore);
}

// ── §U — jedna jednostka w całym katalogu ───────────────────────────────────
console.log('--- §U: stałe, które JUŻ były w latach wyświetlanych (bez zmian) ---');
{
  ok('U1: TRUCE_YEARS = 10 lat wyświetlanych (bez zmian)', TRUCE_YEARS === 10);
  ok('U2: RECENT_REFUSAL_YEARS = 2 lata wyświetlane (bez zmian)', RECENT_REFUSAL_YEARS === 2);
  ok('U3: ERRATIC_EPOCH_YEARS = 10 lat wyświetlanych (bez zmian — E5 przeszło z tą wartością)',
    ERRATIC_EPOCH_YEARS === 10);
  ok('U4: rampPerYear przestrojone 1 → 12 (ta sama prędkość, nowa jednostka)',
    OPINION_MODIFIERS.trade_partner.rampPerYear === 12);
  ok('U5: tempa ZANIKANIA nietknięte cyfrowo (envoy 1, wojna/obecność/osad 2)',
    OPINION_MODIFIERS.envoy_goodwill.decayPerYear === 1
    && OPINION_MODIFIERS.recent_war.decayPerYear === 2
    && OPINION_MODIFIERS.military_presence.decayPerYear === 2
    && OPINION_MODIFIERS.legacy_relations.decayPerYear === 2);
}


console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail > 0 ? 1 : 0);
