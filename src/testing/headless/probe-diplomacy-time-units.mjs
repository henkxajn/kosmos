// PROBE — baseline jednostek czasu dyplomacji (WOJNA I POKÓJ 1.0, faza D2, przed commitem E6).
// Uruchom: node src/testing/headless/probe-diplomacy-time-units.mjs
//
// PO CO: podpisana decyzja 3 fazy D2 wymaga, by tabela §Baseline w `docs/design/D2_PLAN.md`
// była wypełniona POMIAREM przed commitem E6ers — inaczej „flip bez odczuwalnej zmiany tempa"
// jest niesprawdzalne na gate'cie. Ta sonda NIE liczy nic sama: przepuszcza prawdziwe
// `RelationsModel.tickModifiers` / `OpinionMath.decayModifiers` / `rampModifiers` przez
// dokładnie tę kadencję, którą stosuje `DiplomacySystem` (akumulator → CAŁE kroki),
// i mierzy, po ilu krokach modyfikator znika.
//
// ⚠ Dlaczego to nie jest to samo co dzielenie wartości przez tempo:
//   1. tick leci CAŁYMI krokami (`Math.floor(_tickAccum)`), więc 5/2 = 2,5 daje w praktyce 3;
//   2. wpis znika przy |value| < MODIFIER_EPSILON, a nie przy zerze — przy drobnym kroku
//      (dt = 1/12 roku wyświetlanego) obcięcie epsilonem zjada nawet pół roku.
// Obie różnice są niewidoczne w arytmetyce na kartce i widoczne w tej sondzie.
//
// Sonda jest READ-ONLY względem repo: nie dotyka katalogu, tempa podaje przez `opts`
// (`RelationsModel.addModifier` przyjmuje `decayPerYear`), więc mierzy WARIANTY bez edycji kodu.

globalThis.window = globalThis.window ?? {};
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

const { RelationsModel } = await import('../../systems/diplomacy/RelationsModel.js');
const { GAME_CONFIG }    = await import('../../config/GameConfig.js');
const { OPINION_MODIFIERS, MODIFIER_EPSILON } = await import('../../data/OpinionModifierData.js');
const { modifierYearsLeft, tensionAfterDecay } = await import('../../utils/OpinionMath.js');
const { RECENT_REFUSAL_YEARS, ERRATIC_EPOCH_YEARS } = await import('../../data/AcceptanceWeightData.js');

const CIV = GAME_CONFIG.CIV_TIME_SCALE;              // 12 lat cyw. = 1 rok wyświetlany

// Tempa napięcia i rozejmu żyją w DiplomacySystem/katalogu — kopiujemy WARTOŚCI, nie logikę
// (sonda nie instancjonuje fasady: ta ciągnie EventBus, EntityManager i window.KOSMOS).
const PEACE_DECAY           = 5.0;   // DiplomacySystem.js — na rok CYW.
const PEACE_QUIET_YEARS     = 2.0;   // DiplomacySystem.js — porównanie z _year() ⇒ lata WYŚWIETLANE
const ULTIMATUM_GRACE_YEARS = 3.0;   // DiplomacySystem.js — j.w.
const TRESPASS_YEARS        = 1.0;   // DiplomacySystem.js — j.w.
const TRUCE_TENSION_CAP     = 30;    // napięcie, do którego schodzi relacja po rozejmie

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

/**
 * Mierzy życie modyfikatora przez PRAWDZIWY tick.
 * @param modId   id z katalogu
 * @param rate    tempo podane tickowi (punkty na jednostkę `dt`)
 * @param dt      dt jednego wywołania ticku (1 = krok kadencji dzisiejszej: 1 rok cyw.)
 * @returns {{calls, value0, civYears, dispYears}}
 */
function measureFade(modId, rate, dt) {
  const store = makeStore();
  const m = new RelationsModel(store, () => 0);
  m.addModifier('emp_probe', 'player', modId, { decayPerYear: rate });
  const value0 = m.getOpinion('emp_probe', 'player');
  let calls = 0;
  // Limit: 100 lat wyświetlanych w krokach dt — łapie „nie zanika" bez zawieszenia sondy.
  const maxCalls = Math.ceil((100 * CIV) / (dt === 1 ? 1 : dt * CIV)) + 10;
  while (m.hasModifier('emp_probe', 'player', modId) && calls < maxCalls) {
    m.tickModifiers(dt);
    calls++;
  }
  const survived = m.hasModifier('emp_probe', 'player', modId);
  // dt == 1 ⇒ jednostka ticku to rok cyw. (stan dzisiejszy).
  // dt < 1  ⇒ jednostka ticku to rok WYŚWIETLANY, a kadencja została 1 rok cyw. (dt = 1/12).
  const civYears  = dt === 1 ? calls : calls * (dt * CIV);
  const dispYears = civYears / CIV;
  return { calls, value0, civYears, dispYears, survived };
}

function measureRamp(modId, ratePerUnit, dt) {
  const store = makeStore();
  const m = new RelationsModel(store, () => 0);
  m.addModifier('emp_probe', 'player', modId, {});
  const def = OPINION_MODIFIERS[modId];
  const target = def.rampMax;
  let calls = 0;
  const maxCalls = 100000;
  // Ramp czyta tempo Z KATALOGU (rampModifiers dostaje catalog), więc warianty tempa
  // symulujemy skalowaniem dt — matematycznie tożsame (step = |rate| × dt).
  const dtScaled = dt * (ratePerUnit / def.rampPerYear);
  while (m.getOpinion('emp_probe', 'player') < target && calls < maxCalls) {
    m.tickModifiers(dtScaled);
    calls++;
  }
  const civYears  = dt === 1 ? calls : calls * (dt * CIV);
  return { calls, civYears, dispYears: civYears / CIV, reached: m.getOpinion('emp_probe', 'player') };
}

/** Napięcie: ile kroków do zera przy danym tempie i dt (czysta funkcja z OpinionMath). */
function measureTension(t0, ratePerUnit, dt) {
  let t = t0, calls = 0;
  while (t > 0 && calls < 100000) { t = tensionAfterDecay(t, dt, ratePerUnit); calls++; }
  const civYears = dt === 1 ? calls : calls * (dt * CIV);
  return { calls, civYears, dispYears: civYears / CIV, end: t };
}

const f3 = (n) => Number(n.toFixed(3));
const pl = (n) => String(n).replace('.', ',');

console.log('='.repeat(78));
console.log('PROBE — baseline jednostek czasu dyplomacji (przed E6)');
console.log('='.repeat(78));
console.log(`CIV_TIME_SCALE = ${CIV}  (1 rok wyświetlany = ${CIV} lat cywilizacyjnych)`);
console.log(`MODIFIER_EPSILON = ${MODIFIER_EPSILON}  (wpis znika przy |value| poniżej tej wartości)`);
console.log(`FEATURES.diplomacyDecay (stan zaszyty w repo) = ${GAME_CONFIG.FEATURES.diplomacyDecay}`);
console.log('');

// ── §A — czy w ogóle jest co mierzyć: gałąź flagi ────────────────────────────
console.log('--- §A — czy decay modyfikatorów w OGÓLE dziś działa (gałąź flagi) ---');
for (const flag of [false, true]) {
  GAME_CONFIG.FEATURES.diplomacyDecay = flag;
  const r = measureFade('envoy_goodwill', OPINION_MODIFIERS.envoy_goodwill.decayPerYear, 1);
  console.log(`  flaga=${String(flag).padEnd(5)} → envoy_goodwill ${r.survived ? 'NIE ZANIKA NIGDY (∞)' : `zanika po ${r.civYears} lat cyw.`}`);
}
GAME_CONFIG.FEATURES.diplomacyDecay = true;   // dalsze pomiary = stan PO flipie E6
console.log('  ⇒ pomiary decayu poniżej robione przy fladze ON, bo to jest stan po E6.');
console.log('');

// ── §B — tabela §Baseline: modyfikatory ─────────────────────────────────────
const MODS = ['envoy_goodwill', 'military_presence', 'recent_war', 'legacy_relations',
              'their_envoy', 'research_intrusion', 'trespassing'];
// legacy_relations ma defaultValue 0 (wartość wnosi migracja) — mierzymy przy +30 z tabeli planu.
const VALUE_OVERRIDE = { legacy_relations: 30 };

console.log('--- §B — życie modyfikatora: DZIŚ vs dwa warianty po unifikacji ---');
console.log('  (a) tempo ×12  → per rok WYŚWIETLANY, odczuwalne tempo IDENTYCZNE jak dziś');
console.log('  (b) tempo bez zmian → liczba reinterpretowana jako per rok WYŚWIETLANY (12× wolniej)');
console.log('');
const header = ['modyfikator', 'wart.', 'tempo', 'DZIŚ cyw', 'DZIŚ wyśw', 'UI dziś',
                '(a) wyśw', '(b) wyśw', 'UI (b)'];
const rows = [];
for (const id of MODS) {
  const def  = OPINION_MODIFIERS[id];
  const rate = def.decayPerYear;
  const val  = VALUE_OVERRIDE[id] ?? def.defaultValue;

  // DZIŚ: dt = 1 rok cyw., tempo z katalogu.
  const store = makeStore();
  const m = new RelationsModel(store, () => 0);
  m.addModifier('emp_probe', 'player', id, { value: val, decayPerYear: rate });
  const modEntry = store.get('diplomacy.relations')[Object.keys(store.get('diplomacy.relations'))[0]]
    .opinionModifiers.find(x => x.id === id);
  const uiToday = modifierYearsLeft(modEntry);
  let calls = 0;
  while (m.hasModifier('emp_probe', 'player', id) && calls < 5000) { m.tickModifiers(1); calls++; }
  const todayCiv = calls;

  // (a) tempo ×12, dt = 1/12 roku wyświetlanego na krok kadencji (kadencja bez zmian).
  const A = measureFadeWithValue(id, val, rate * CIV, 1 / CIV);
  // (b) tempo bez zmian, dt = 1/12.
  const B = measureFadeWithValue(id, val, rate, 1 / CIV);
  const uiB = modifierYearsLeft({ value: val, decayPerYear: rate });

  rows.push([id, String(val), String(rate), String(todayCiv), pl(f3(todayCiv / CIV)),
             String(uiToday), pl(f3(A.dispYears)), pl(f3(B.dispYears)), String(uiB)]);
}

function measureFadeWithValue(modId, value, rate, dt) {
  const store = makeStore();
  const m = new RelationsModel(store, () => 0);
  m.addModifier('emp_probe', 'player', modId, { value, decayPerYear: rate });
  let calls = 0;
  const maxCalls = 200000;
  while (m.hasModifier('emp_probe', 'player', modId) && calls < maxCalls) { m.tickModifiers(dt); calls++; }
  const civYears = dt === 1 ? calls : calls * (dt * CIV);
  return { calls, civYears, dispYears: civYears / CIV, survived: m.hasModifier('emp_probe', 'player', modId) };
}

const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
const line = (cells) => '  ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ');
console.log(line(header));
console.log('  ' + widths.map(w => '-'.repeat(w)).join('-+-'));
rows.forEach(r => console.log(line(r)));
console.log('');

// ── §C — mechanizmy ŻYWE dziś (ramp + decay napięcia): felt-rate 1:1 ────────
console.log('--- §C — mechanizmy ŻYWE dziś (nie bramkowane flagą) ---');
const rampDef = OPINION_MODIFIERS.trade_partner;
const rToday = measureRamp('trade_partner', rampDef.rampPerYear, 1);
const rA     = measureRamp('trade_partner', rampDef.rampPerYear * CIV, 1 / CIV);
const rB     = measureRamp('trade_partner', rampDef.rampPerYear, 1 / CIV);
console.log(`  trade_partner ramp 0→${rampDef.rampMax} (tempo ${rampDef.rampPerYear}/rok):`);
console.log(`    DZIŚ:  ${rToday.civYears} lat cyw. = ${pl(f3(rToday.dispYears))} lat wyświetlanych`);
console.log(`    (a) ×${CIV}: ${pl(f3(rA.dispYears))} lat wyświetlanych  ${f3(rA.dispYears) === f3(rToday.dispYears) ? '← IDENTYCZNE' : '← ROZJAZD'}`);
console.log(`    (b) bez zmian: ${pl(f3(rB.dispYears))} lat wyświetlanych (${f3(rB.dispYears / rToday.dispYears)}× dłużej)`);

const tToday = measureTension(TRUCE_TENSION_CAP, PEACE_DECAY, 1);
const tA     = measureTension(TRUCE_TENSION_CAP, PEACE_DECAY * CIV, 1 / CIV);
const tB     = measureTension(TRUCE_TENSION_CAP, PEACE_DECAY, 1 / CIV);
console.log(`  napięcie ${TRUCE_TENSION_CAP}→0 (PEACE_DECAY ${PEACE_DECAY}/rok):`);
console.log(`    DZIŚ:  ${tToday.civYears} lat cyw. = ${pl(f3(tToday.dispYears))} lat wyświetlanych`);
console.log(`    (a) ×${CIV} (= ${PEACE_DECAY * CIV}/rok wyśw.): ${pl(f3(tA.dispYears))} lat wyświetlanych  ${f3(tA.dispYears) === f3(tToday.dispYears) ? '← IDENTYCZNE' : '← ROZJAZD'}`);
console.log(`    (b) bez zmian: ${pl(f3(tB.dispYears))} lat wyświetlanych (${f3(tB.dispYears / tToday.dispYears)}× dłużej)`);
console.log('');

// ── §D — stałe, które JUŻ są w latach wyświetlanych (weryfikacja jednostki) ──
console.log('--- §D — stałe porównywane z _year() = gameTime ⇒ JUŻ lata WYŚWIETLANE ---');
const { TRUCE_YEARS } = await import('../../data/OpinionModifierData.js');
const alreadyDisplayed = [
  ['TRUCE_YEARS',           TRUCE_YEARS,           'OpinionModifierData',  'komentarz mówi „lata gry" — ZGODNY'],
  ['RECENT_REFUSAL_YEARS',  RECENT_REFUSAL_YEARS,  'AcceptanceWeightData', 'komentarz mówi „lata GRY" — ZGODNY'],
  ['ERRATIC_EPOCH_YEARS',   ERRATIC_EPOCH_YEARS,   'AcceptanceWeightData', 'komentarz mówi „lata GRY" — ZGODNY'],
  ['PEACE_QUIET_YEARS',     PEACE_QUIET_YEARS,     'DiplomacySystem',      'komentarz NIE PODAJE jednostki'],
  ['ULTIMATUM_GRACE_YEARS', ULTIMATUM_GRACE_YEARS, 'DiplomacySystem',      '⚠ komentarz mówi „lata cyw." — KŁAMIE'],
  ['TRESPASS_YEARS',        TRESPASS_YEARS,        'DiplomacySystem',      '⚠ komentarz mówi „lat cyw." — KŁAMIE'],
];
for (const [name, val, where, note] of alreadyDisplayed) {
  console.log(`  ${name.padEnd(22)} = ${String(val).padStart(4)} lat wyśw. (= ${String(val * CIV).padStart(4)} lat cyw.)  [${where}]  ${note}`);
}
console.log('');

// ── §E — spójność pasma: co jest długie, co krótkie w zegarze GRACZA ────────
console.log('--- §E — pasmo czasów dyplomacji w zegarze GRACZA (lata wyświetlane) ---');
const band = [
  ['rozejm po wojnie (TRUCE_YEARS)',                TRUCE_YEARS,                      'żywe'],
  ['karencja odmowy (RECENT_REFUSAL_YEARS)',        RECENT_REFUSAL_YEARS,             'żywe'],
  ['epoka humoru erratic (ERRATIC_EPOCH_YEARS)',    ERRATIC_EPOCH_YEARS,              'żywe'],
  ['cisza przed decayem napięcia (PEACE_QUIET)',    PEACE_QUIET_YEARS,                'żywe'],
  ['łaska po ultimatum (ULTIMATUM_GRACE)',          ULTIMATUM_GRACE_YEARS,            'żywe'],
  ['ślad po wojnie recent_war — DZIŚ',              rows.find(r => r[0] === 'recent_war')[4].replace(',', '.'), 'MARTWE (flaga off)'],
  ['ślad po wojnie recent_war — wariant (b)',       rows.find(r => r[0] === 'recent_war')[7].replace(',', '.'), 'po E6'],
  ['dobra wola z emisariusza — DZIŚ',               rows.find(r => r[0] === 'envoy_goodwill')[4].replace(',', '.'), 'MARTWE (flaga off)'],
  ['dobra wola z emisariusza — wariant (b)',        rows.find(r => r[0] === 'envoy_goodwill')[7].replace(',', '.'), 'po E6'],
];
band.sort((x, y) => Number(y[1]) - Number(x[1]));
for (const [what, yrs, status] of band) {
  console.log(`  ${pl(String(yrs)).padStart(7)} lat wyśw.  ${String(what).padEnd(44)} [${status}]`);
}
console.log('');

// ── §F — ile razy „humor" erratic zmieni się w partii ───────────────────────
console.log('--- §F — epoka erratic a długość partii ---');
for (const campaign of [20, 40, 60]) {
  const epochs = Math.floor(campaign / ERRATIC_EPOCH_YEARS);
  console.log(`  partia ${String(campaign).padStart(3)} lat wyśw. → ${String(epochs).padStart(2)} zmian humoru przy ERRATIC_EPOCH_YEARS=${ERRATIC_EPOCH_YEARS}`);
}
for (const epoch of [3, 5]) {
  console.log(`  (wariant) ERRATIC_EPOCH_YEARS=${epoch} → partia 40 lat wyśw. = ${Math.floor(40 / epoch)} zmian humoru`);
}
// Czy zmiana epoki psuje liczbę referencyjną gate'u E5 (mierzoną w roku 0)?
console.log(`  rok 0: floor(0/10)=${Math.floor(0 / 10)}, floor(0/3)=${Math.floor(0 / 3)} ⇒ ziarno w roku 0 ${Math.floor(0 / 10) === Math.floor(0 / 3) ? 'IDENTYCZNE (liczba referencyjna E5 przeżywa)' : 'RÓŻNE'}`);
console.log('');

// ── §G — TEST SPÓJNOŚCI: czy dwie nogi emisariusza mogą współistnieć ────────
// Misja emisariusza (MissionSystem._launchEnvoy) jest abstrakcyjna i trwa 5,0 lat
// WYŚWIETLANYCH: dotarcie w +2,5 (+5 opinii), powrót w +5,0 (kolejne +5, tryb
// `accumulate` ⇒ obiecane +10). Ten test sprawdza WYKONANIEM, czy pierwsza noga
// jeszcze żyje, gdy ląduje druga — przy każdym z trzech temp.
console.log('--- §G — dwie nogi emisariusza: czy +5 z dotarcia dożywa powrotu? ---');
const ENVOY_ARRIVAL_DISP = 2.5;   // MissionSystem.js:1511
const ENVOY_RETURN_DISP  = 5.0;   // MissionSystem.js:1512
const GAP_DISP = ENVOY_RETURN_DISP - ENVOY_ARRIVAL_DISP;   // 2,5 roku wyśw. między nogami

function envoyLegsSum(rate, dt) {
  const store = makeStore();
  const m = new RelationsModel(store, () => 0);
  // noga 1 — dotarcie
  m.addModifier('emp_probe', 'player', 'envoy_goodwill', { decayPerYear: rate });
  // przeleć GAP w krokach kadencji (kadencja zawsze 1 rok cyw.)
  const stepsPerDisp = dt === 1 ? CIV : 1 / dt / CIV * CIV;   // dt=1 ⇒ 12 kroków/rok wyśw.
  const steps = Math.round(dt === 1 ? GAP_DISP * CIV : GAP_DISP * CIV);
  for (let i = 0; i < steps; i++) m.tickModifiers(dt);
  const aliveAtReturn = m.hasModifier('emp_probe', 'player', 'envoy_goodwill');
  const valueAtReturn = m.getOpinion('emp_probe', 'player');
  // noga 2 — powrót (accumulate)
  m.addModifier('emp_probe', 'player', 'envoy_goodwill', { decayPerYear: rate });
  return { aliveAtReturn, valueAtReturn, total: m.getOpinion('emp_probe', 'player'), steps, stepsPerDisp };
}

const gRate = OPINION_MODIFIERS.envoy_goodwill.decayPerYear;
const gToday = envoyLegsSum(gRate, 1);              // dziś: tempo/rok cyw., dt = 1 rok cyw.
const gA     = envoyLegsSum(gRate * CIV, 1 / CIV);  // (a) tempo ×12, dt = 1/12 roku wyśw.
const gB     = envoyLegsSum(gRate, 1 / CIV);        // (b) tempo bez zmian
console.log(`  odstęp między nogami: ${pl(GAP_DISP)} roku wyświetlanego (= ${GAP_DISP * CIV} lat cyw.)`);
for (const [name, g] of [['DZIŚ (flaga ON)', gToday], ['(a) tempo ×12', gA], ['(b) bez zmian', gB]]) {
  console.log(`  ${name.padEnd(16)} → noga 1 przy powrocie: ${g.aliveAtReturn ? `ŻYJE (${pl(f3(g.valueAtReturn))})` : 'WYGASŁA'}` +
              ` ⇒ suma po obu nogach: ${pl(f3(g.total))} ${g.total >= 10 ? '(obiecane +10 ✓)' : '(obietnica +10 NIE dowieziona ✗)'}`);
}
console.log('  ⚠ MissionSystem.js:52 obiecuje „tryb accumulate sumuje je do +10".');
console.log('');

console.log('='.repeat(78));
console.log('KONIEC. Liczby z §B/§C/§G wchodzą do tabeli §Baseline w docs/design/D2_PLAN.md.');
console.log('='.repeat(78));
