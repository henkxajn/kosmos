// WP-2 — keeper TERMU TERYTORIALNEGO i SUFITU CESJI (W4-simple, WOJNA I POKÓJ).
//
// PO CO: WP-2 dokłada do silnika D2 dwanasty term (`territorial_terms`) ORAZ dwa
// pre-warunki, które domykają decyzję D-WP-8 („wyczerpanie NIE daje graczowi wszystkiego").
// Ten plik pinuje OBA mechanizmy osobno, bo odpowiadają na RÓŻNE pytania:
//
//   term          → ILE to boli (gradacja; zawsze może zostać przeważony przez tło)
//   pre-warunek   → CZY to w ogóle jest na stole (blokada; NIEZALEŻNA od sumy)
//
// ⚠ DLACZEGO NIE SAM TERM (zmierzone w FAZIE A-bis, sonda poza repo):
//   przy tle 48,50 (exh 100) term o wadze 35 odejmuje najwyżej 35 punktów, więc nawet
//   NIESKOŃCZONE żądanie kończy się wynikiem +13,50 ≥ próg 0 — czyli „TAK". Weto w samym
//   termie wymagałoby wagi > 187,6 (dziś osiągalne maksimum tła), a przy wadze > 135,4
//   przestaje przechodzić ZWYKŁA cesja wielkości dojrzałej kolonii. Okno jest PUSTE:
//   żadna waga nie wetuje niezawodnie i jednocześnie nie zabija normalnych cesji.
//   Stąd blokada mieszka w PRECONDITION_CHECKS — istniejącym, zaprojektowanym kanale
//   odmowy („Twarde blokady sprawdzane PRZED liczeniem… Blokada nie ma rozbicia: ma powód").
//
// ⚠ IMPORTY SĄ NAMESPACE'OWE I DYNAMICZNE — CELOWO. Keeper musi dać się uruchomić na
//   drzewie SPRZED naprawy (fail-first). Statyczny `import { TERRITORIAL_MAX_SHARE }`
//   z modułu, który tego jeszcze nie eksportuje, wywala CAŁY plik na etapie linkowania
//   ESM i ŻADEN pin nie dostaje koloru. Namespace (`import * as AWD`) degraduje brakujący
//   eksport do `undefined`, a nowy moduł ładujemy `await import()` w try/catch.
//   (Lekcja zapisana: „pin musi DEGRADOWAĆ, nie PRZERYWAĆ" — na poziomie SYMBOLU.)
//
// Uruchom: node src/testing/smoke/wp_territorial_terms_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { ARCHETYPES } from '../../data/EmpireData.js';
import { clampUnit, diminishingReturns, roundScore } from '../../utils/AcceptanceMath.js';

import * as AWD from '../../data/AcceptanceWeightData.js';
import * as AE from '../../systems/diplomacy/AcceptanceEngine.js';

// Moduł POWSTAJE w tym slice — dynamicznie, żeby fail-first miał kolory.
let colonyDevScore = null;
try { ({ colonyDevScore } = await import('../../utils/ColonyDevScore.js')); } catch { /* fail-first */ }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 0.01) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

// ── Narzędzia pinów źródłowych (lustro `wp_peace_seams_smoke`) ──────────────
// ⚠ CRLF (§270): źródło czytamy PO NORMALIZACJI — drzewo autora bywa mieszane,
//   kanoniczny checkout jest LF; pin pytający dysk o EOL pada w jednym z nich.
// ⚠ KOMENTARZE ZDEJMOWANE: inaczej pin „kod NIE odwołuje się do X" łapie własne
//   wyjaśnienie zostawione obok.
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));
const callRe = (name) => new RegExp('\\.\\s*' + name + '\\s*(?:\\?\\.)?\\s*\\(', 'g');

function prodFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'i18n' || e === 'testing' || e === 'node_modules') continue;
      prodFiles(p, out);
    } else if (e.endsWith('.js') || e.endsWith('.mjs')) out.push(p);
  }
  return out;
}
const PROD = prodFiles();

// ── Fixture'y świata ────────────────────────────────────────────────────────
//
// ⚠ KAŻDY `world()` DOSTAJE WŁASNE ID IMPERIUM. `gameState` jest singletonem modułu, więc
//   relacje, pamięć i cooldowny pary ('player', EMP) PRZEŻYWAJĄ między światami w jednym
//   procesie. Bez tego T21 („blokada nie stempluje") czytałby `peace_refused` zostawione
//   przez T11b — czyli pin świeciłby czerwono z powodu SĄSIADA, nie kodu.
let EMP_N = 0;
let EMP = 'emp_wp2_0';   // nadpisywane przez world(); testy CZYSTE używają PURE_EVAL
const T = AWD.ACCEPTANCE_TERMS ?? {};
const VA = AWD.VERB_ACCEPTANCE ?? {};
const EV = AE.TERM_EVALUATORS ?? {};

/** Id oceniającego w testach CZYSTYCH (bez świata) — stały, bo nie dotyka gameState. */
const PURE_EVAL = 'emp_eval';

/** Kolonia-atrapa o zadanym devScore (pop + aktywne budynki), devValue = BASE + devScore. */
function col(planetId, devScore, extra = {}) {
  const buildings = 5;
  return {
    planetId,
    systemId: 'sys_x',
    ownerEmpireId: 'emp_owner',
    civSystem: { population: devScore - buildings },
    buildingSystem: { _active: new Map(Array.from({ length: buildings }, (_, i) => [String(i), {}])) },
    ...extra,
  };
}

/**
 * Buduje świat i zwraca { dipl, engine, K, counts, EMP }.
 * `cols` — kolonie OCENIAJĄCEGO, pierwsza z `capital:true` jest stolicą kanonu.
 */
function world({ cols = [], captures = [], exh = 100, playerCols = [], noColonyManager = false } = {}) {
  EMP = 'emp_wp2_' + (++EMP_N);
  const capt = typeof captures === 'function' ? captures(EMP) : captures;
  GAME_CONFIG.FEATURES.lightDiplomacy = true;
  GAME_CONFIG.FEATURES.diplomacyDecay = false;

  const all = [...cols, ...playerCols];
  const byId = new Map(all.map((c) => [c.planetId, c]));
  const empires = new Map([[EMP, {
    id: EMP, name: EMP, archetype: 'industrialist',
    personality: { ...ARCHETYPES.industrialist.personality },
    objective: 'merchant', traits: [],
    colonies: cols.map((c) => c.planetId),
  }]]);
  const wars = new Map([[EMP, {
    id: 'war_wp2', active: true, casusBelli: 'border_incident',
    exhaustion: { player: exh, [EMP]: exh }, captures: capt,
  }]]);

  const counts = { owned: 0, capital: 0, captures: 0 };
  const capitalCol = cols.find((c) => c.capital) ?? null;

  const K = {
    timeSystem: { gameTime: 100 },
    galaxyData: { seed: 4242, systems: [] },
    empireRegistry: {
      get: (id) => empires.get(id),
      listAll: () => [...empires.values()],
      getColoniesByEmpire: (id) => { counts.owned++; return (empires.get(id)?.colonies ?? []).map((p) => byId.get(p)).filter(Boolean); },
    },
    warSystem: {
      getWarWith: (id) => wars.get(id) ?? null,
      getCaptures: (warId) => { counts.captures++; return wars.get(EMP)?.id === warId ? capt : []; },
    },
    directorProduction: { capitalOf: (id) => { counts.capital++; return id === EMP ? capitalCol : null; } },
  };
  if (!noColonyManager) {
    K.colonyManager = {
      getColony: (id) => byId.get(id) ?? null,
      getPlayerColonies: () => { counts.owned++; return playerCols; },
    };
  }
  window.KOSMOS = K;

  const dipl = new DiplomacySystem();
  K.diplomacySystem = dipl;
  dipl.declareWar(EMP, 'player_action');           // `offer_peace` ma pre-warunek `at_war`

  const engine = new AE.AcceptanceEngine();
  return { dipl, engine, K, counts, byId, EMP };
}

/** Kontekst CZYSTY dla termu / pre-warunków (bez świata) — lustro matrixBaseContext. */
function ctxPure({ terms = undefined, exh = 100, peaceCost = 30, toId = PURE_EVAL } = {}) {
  return {
    verb: 'offer_peace', fromId: 'player', toId, year: 0,
    opinion: 0, tension: 100, status: 'war', treaties: [], memory: [],
    personality: {}, archetype: null, objective: null, traits: [],
    proposerAggression: 0,
    war: { warId: 'war_wp2', casusBelli: 'border_incident', peaceCost, exhaustionSelf: exh, exhaustionOther: exh },
    thirdParty: { isOurAlly: false, alliesOfOurEnemies: 0, atWarWithOurEnemy: 0 },
    strength: { self: 1000, other: 1000 },
    verbCooldowns: {}, offer: null, erraticSeed: 0,
    ...(terms === undefined ? {} : { terms }),
  };
}
/** Cesja: ciało odbierane OCENIAJĄCEMU (demand), chyba że podasz inne strony. */
const cede = (bodyId, devValue, extra = {}) => ({
  bodyId, fromEmpireId: PURE_EVAL, toEmpireId: 'player', devValue, recaptured: false, capital: false, ...extra,
});

// ════════════════════════════════════════════════════════════════════════════
// T0 — KONTROLA NARZĘDZIA (bez niej piny źródłowe i negatywne są jałową zielenią)
// ════════════════════════════════════════════════════════════════════════════
console.log('T0 — kontrola narzędzia');
{
  const SYNTH = 'a.getCaptures(1); b?.getCaptures(2); c.getCaptures?.(3);';
  assert((SYNTH.match(callRe('getCaptures')) ?? []).length === 3,
    'T0a: `callRe` łapie wszystkie trzy formy wołania — inaczej piny źródłowe mierzą ciszę regexu');
  assert(stripComments('const a = 1; // territorial_ceiling\n/* territorial_ceiling */ const b = 2;')
    .includes('territorial_ceiling') === false,
    'T0b: `stripComments` zdejmuje OBA rodzaje komentarzy — inaczej pin „kod tego nie robi" ' +
    'łapie własny komentarz o tym, że tego nie robi');
  assert(PROD.length > 100 && !PROD.some((p) => p.includes('testing')),
    'T0c: skan produkcyjny widzi realne drzewo (' + PROD.length + ' plików) i NIE obejmuje `src/testing`');
  assert(typeof EV === 'object' && typeof VA.offer_peace === 'object',
    'T0d: namespace importy działają — `TERM_EVALUATORS` i `VERB_ACCEPTANCE` są widoczne ' +
    '(brakujące eksporty degradują do undefined, nie wywalają pliku)');
}

// ════════════════════════════════════════════════════════════════════════════
// T1 — KATALOG (dane): term, dwa pre-warunki, stałe. Plik balansu bez importów.
// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — katalog: term `territorial_terms`, pre-warunki, stałe');
{
  const def = T.territorial_terms;
  assert(!!def && def.id === 'territorial_terms' && def.labelKey === 'diplo.term.territorialTerms',
    'T1a: `ACCEPTANCE_TERMS.territorial_terms` istnieje, `id` równa się kluczowi, labelKey = ' +
    '`diplo.term.territorialTerms`');
  assert(!!def && def.status === AWD.TERM_STATUS?.UNFED,
    'T1b: status UNFED — term liczy poprawnie, ale kanału warunków pokoju nie karmi jeszcze ŻADNE UI ' +
    '(D-WP-1 = WP-5); status LIVE zapaliłby telemetrii fałszywy alarm „term bez paliwa"');
  assert(VA.offer_peace?.terms?.territorial_terms === 35,
    'T1c: waga w `offer_peace` = 35 (podpisana; sufit, nie waga, robi robotę D-WP-8)');
  assert(JSON.stringify(VA.offer_peace?.preconditions) ===
    JSON.stringify(['at_war', 'territorial_capital', 'territorial_ceiling']),
    'T1d: `offer_peace.preconditions` deklaruje OBA nowe pre-warunki, a `territorial_capital` ' +
    'stoi PRZED `territorial_ceiling` — `checkPreconditions` zwraca PIERWSZY, który padł, ' +
    'więc kolejność JEST kontraktem powodu odmowy (pinowane wykonaniem w T5)');
  assert(AWD.PRECONDITIONS?.territorial_capital?.reasonKey === 'diplo.reject.capitalNotNegotiable'
    && AWD.PRECONDITIONS?.territorial_ceiling?.reasonKey === 'diplo.reject.territoryNotNegotiable',
    'T1e: katalog `PRECONDITIONS` ma oba wpisy z własnymi kluczami i18n (dwa różne powody, nie jeden wspólny)');
  assert(AWD.TERRITORIAL_BASE_VALUE === 2 && AWD.TERRITORIAL_HALF === 200
    && AWD.TERRITORIAL_RECAPTURE_MULT === 0.5 && AWD.TERRITORIAL_FATIGUE_RELIEF === 0.5
    && AWD.TERRITORIAL_MAX_SHARE === 0.5,
    'T1f: stałe podpisane przez właściciela (BASE 2 / HALF 200 / RECAPTURE 0.5 / FATIGUE 0.5 / SHARE 0.5)');
  const w = VA.offer_peace?.terms ?? {};
  assert(Object.entries(w).every(([k, v]) => k === 'war_status' || Math.abs(v) <= w.war_status),
    'T1g (KONTROLA): `war_status` pozostaje NAJCIĘŻSZYM termem pokoju — waga 35 nie przewraca ' +
    'hierarchii, na której stoi `acceptance_peace_envoy_smoke`');
  assert(!/^\s*import\s/m.test(readClean('data', 'AcceptanceWeightData.js')),
    'T1h: plik balansu NADAL ma ZERO importów (P12) — stałe terytorialne nie wciągnęły GameConfig');
}

// ════════════════════════════════════════════════════════════════════════════
// T2 — TERM JEST CZYSTĄ FUNKCJĄ (ctx, verbCfg) → raw ∈ −1..+1, zero świata
// ════════════════════════════════════════════════════════════════════════════
console.log('T2 — term czysty: gradacja, zwrot zdobyczy, ulga wyczerpania, clamp');
{
  const f = EV.territorial_terms;
  assert(typeof f === 'function', 'T2a: ewaluator `territorial_terms` istnieje w TERM_EVALUATORS');

  if (typeof f === 'function') {
    assert(f(ctxPure({})) === 0 && f(ctxPure({ terms: null })) === 0
      && f(ctxPure({ terms: { cessions: [], heldValue: null } })) === 0,
      'T2b: brak cesji (brak pola / null / pusta lista) → raw dokładnie 0 — term nie dokłada ' +
      'szumu do propozycji bez warunków');

    const small = f(ctxPure({ terms: { cessions: [cede('b1', 82)], heldValue: null } }));
    const big = f(ctxPure({ terms: { cessions: [cede('b1', 82), cede('b2', 197)], heldValue: null } }));
    assert(small < 0 && big < small,
      'T2c: żądanie od OCENIAJĄCEGO daje raw ujemny i rośnie z wielkością żądania ' +
      `(1 ciało ${small.toFixed(3)} → 2 ciała ${big.toFixed(3)})`);

    const gain = f(ctxPure({ terms: { cessions: [{ ...cede('b1', 197), fromEmpireId: 'player', toEmpireId: PURE_EVAL }], heldValue: null } }));
    assert(gain > 0,
      'T2d: ciało oddawane OCENIAJĄCEMU daje raw dodatni — term jest dwustronny, a nie karą');

    const plain = f(ctxPure({ terms: { cessions: [cede('b1', 197)], heldValue: null } }));
    const recap = f(ctxPure({ terms: { cessions: [cede('b1', 197, { recaptured: true })], heldValue: null } }));
    const halfV = f(ctxPure({ terms: { cessions: [cede('b1', 197 * AWD.TERRITORIAL_RECAPTURE_MULT)], heldValue: null } }));
    assert(recap > plain && near(recap, halfV, 1e-9),
      'T2e: zwrot ZDOBYCZY boli dokładnie ×RECAPTURE_MULT taniej — oddanie cudzego ciała nie ' +
      'jest tą samą stratą co oddanie własnego');

    const hot = f(ctxPure({ terms: { cessions: [cede('b1', 197)], heldValue: null }, exh: 100 }));
    const cold = f(ctxPure({ terms: { cessions: [cede('b1', 197)], heldValue: null }, exh: 30 }));
    assert(hot > cold,
      `T2f: ulga wyczerpania — to samo żądanie boli mniej przy exh 100 (${hot.toFixed(3)}) ` +
      `niż przy exh 30 (${cold.toFixed(3)})`);

    const huge = f(ctxPure({ terms: { cessions: [cede('b1', 1e9)], heldValue: null } }));
    assert(huge === -1,
      'T2g: clamp — żądanie nieskończone daje DOKŁADNIE −1 (to jest sufit termu i dlatego sam ' +
      'term nie może wetować: 35 punktów nie przebije tła 48,50)');

    const noSides = f(ctxPure({ terms: { cessions: [{ bodyId: 'b1', devValue: 197 }], heldValue: null } }));
    assert(noSides === 0,
      'T2h: cesja BEZ stron (`fromEmpireId`/`toEmpireId`) nie liczy się do żadnej strony — ' +
      'świadoma degradacja: term nie zgaduje kierunku, który ma przyjść od wołającego');

    const saved = globalThis.KOSMOS;
    globalThis.KOSMOS = undefined; window.KOSMOS = undefined;
    const pure = f(ctxPure({ terms: { cessions: [cede('b1', 82)], heldValue: 246 } }));
    globalThis.KOSMOS = saved; window.KOSMOS = saved;
    assert(near(pure, small),
      'T2i (KONTROLA CZYSTOŚCI): term policzony z WYŁĄCZONYM `window.KOSMOS` daje ten sam wynik ' +
      '— cały odczyt świata siedzi w `buildContext`, nie w ewaluatorze');

    const expected = clampUnit(
      diminishingReturns(0, AWD.TERRITORIAL_HALF)
      - diminishingReturns(82 * (1 - clampUnit((100 - 30) / 100) * AWD.TERRITORIAL_FATIGUE_RELIEF), AWD.TERRITORIAL_HALF));
    assert(near(small, expected, 1e-9),
      'T2j: wzór zgadza się ze stałymi z katalogu co do cyfry (a nie „mniej więcej")');
  } else {
    for (let i = 0; i < 9; i++) assert(false, 'T2b-T2j: pominięte — brak ewaluatora');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// T3 — PRE-WARUNEK `territorial_capital`
// ════════════════════════════════════════════════════════════════════════════
console.log('T3 — ciało domowe nigdy nie jest na stole');
{
  const run = (terms) => AE.evaluateWithContext(ctxPure({ terms }));
  const capital = run({ cessions: [cede('cap', 197, { capital: true })], heldValue: 1000 });
  assert(capital.blocked === true && capital.reasonKey === 'diplo.reject.capitalNotNegotiable'
    && capital.breakdown.length === 0 && capital.decision === false,
    'T3a: żądanie stolicy OCENIAJĄCEGO → `blocked`, powód `capitalNotNegotiable`, rozbicie PUSTE ' +
    '(blokada nie ma rozbicia — ma powód)');
  const notCapital = run({ cessions: [cede('cap', 197, { capital: false })], heldValue: 1000 });
  assert(notCapital.blocked === false,
    'T3b (KONTROLA PINU): TO SAMO ciało o tej samej wartości, tylko bez znacznika `capital`, ' +
    'przechodzi — T3a mierzy znacznik stolicy, a nie wielkość żądania');
  const gainCapital = run({ cessions: [{ ...cede('cap', 197, { capital: true }), fromEmpireId: 'player', toEmpireId: PURE_EVAL }], heldValue: 1000 });
  assert(gainCapital.blocked === false,
    'T3c: ciało oznaczone `capital` płynące DO oceniającego nie blokuje — chronimy to, co mu się ' +
    'zabiera, a nie sam znacznik');
  assert(run(undefined).blocked === false && run(null).blocked === false,
    'T3d: propozycja BEZ warunków nie dotyka nowych pre-warunków w ogóle');
}

// ════════════════════════════════════════════════════════════════════════════
// T4 — PRE-WARUNEK `territorial_ceiling`
// ════════════════════════════════════════════════════════════════════════════
console.log('T4 — sufit cesji: SHARE × held');
{
  const run = (terms) => AE.evaluateWithContext(ctxPure({ terms }));
  const over = run({ cessions: [cede('a', 82), cede('b', 82)], heldValue: 246 });
  assert(over.blocked === true && over.reasonKey === 'diplo.reject.territoryNotNegotiable'
    && over.breakdown.length === 0,
    'T4a: 164 > 0,5 × 246 = 123 → `blocked` z powodem `territoryNotNegotiable`');
  const under = run({ cessions: [cede('a', 82)], heldValue: 246 });
  assert(under.blocked === false,
    'T4b (KONTROLA PINU): 82 ≤ 123 przechodzi do oceny — sufit tnie WIELKOŚĆ żądania, ' +
    'a nie sam fakt cesji');
  assert(run({ cessions: [], heldValue: 246 }).blocked === false,
    'T4c: pusta lista cesji nie blokuje');
}

// ════════════════════════════════════════════════════════════════════════════
// T5 — KOLEJNOŚĆ PRE-WARUNKÓW jest kontraktem powodu odmowy
// ════════════════════════════════════════════════════════════════════════════
console.log('T5 — kolejność: stolica przed sufitem');
{
  const both = AE.evaluateWithContext(ctxPure({
    terms: { cessions: [cede('cap', 197, { capital: true }), cede('a', 82), cede('b', 82)], heldValue: 246 },
  }));
  assert(both.reasonKey === 'diplo.reject.capitalNotNegotiable',
    'T5a: żądanie, które łamie OBA warunki naraz, melduje STOLICĘ — bo `territorial_capital` ' +
    'jest zadeklarowany pierwszy; gracz dostaje powód najbliższy sednu odmowy');
  const onlyCeiling = AE.evaluateWithContext(ctxPure({
    terms: { cessions: [cede('a', 82), cede('b', 82)], heldValue: 246 },
  }));
  assert(onlyCeiling.reasonKey === 'diplo.reject.territoryNotNegotiable',
    'T5b (KONTROLA PINU): ten sam nadmiar BEZ stolicy melduje sufit — T5a mierzy kolejność, ' +
    'a nie to, że capital jest jedynym powodem, jaki silnik potrafi zwrócić');
}

// ════════════════════════════════════════════════════════════════════════════
// T6 — `recaptured` czyta OSTATNI wpis księgi per bodyId (findLast), NIE `some`
//
// ⚠ Księga `captures` jest APPEND-ONLY BEZ deduplikacji — `WarSystem` mówi to wprost:
//   „księga ma być HISTORIĄ, a nie migawką, inaczej stół pokoju nie odróżni «oddaj, co
//   zdobyłeś» od «oddaj, co właśnie odbiłem»". Ciało, które zmieniło ręce dwa razy, ma
//   DWA wpisy i `some()` zwróciłoby `true` także wtedy, gdy oceniający już go nie trzyma.
// ════════════════════════════════════════════════════════════════════════════
console.log('T6 — zdobycz rozstrzyga OSTATNI wpis księgi, nie jakikolwiek');
{
  const CAPT_ONCE = (E) => [{ bodyId: 'x1', fromEmpireId: 'player', toEmpireId: E, year: 10, via: 'invasion' }];
  const CAPT_TWICE = (E) => [
    { bodyId: 'x1', fromEmpireId: 'player', toEmpireId: E, year: 10, via: 'invasion' },
    { bodyId: 'x1', fromEmpireId: E, toEmpireId: 'player', year: 20, via: 'invasion' },
  ];
  const mk = (captures) => {
    const { engine } = world({
      cols: [col('cap', 195, { capital: true }), col('c1', 80), col('x1', 195)],
      captures,
    });
    return engine.buildContext('player', EMP, {
      verb: 'offer_peace',
      terms: { cessions: [{ bodyId: 'x1', fromEmpireId: EMP, toEmpireId: 'player' }] },
    });
  };
  const once = mk(CAPT_ONCE);
  const twice = mk(CAPT_TWICE);
  assert(once?.terms?.cessions?.[0]?.recaptured === true,
    'T6a: ciało zdobyte przez oceniającego na proponującym → `recaptured: true`');
  assert(twice?.terms?.cessions?.[0]?.recaptured === false,
    'T6b: to samo ciało ODBITE z powrotem przez proponującego → `recaptured: false`, bo ' +
    'OSTATNI wpis mówi, że oceniający go już nie zdobył');
  const someWouldSay = CAPT_TWICE(EMP).some((e) => e.bodyId === 'x1' && e.toEmpireId === EMP);
  assert(someWouldSay === true && twice?.terms?.cessions?.[0]?.recaptured === false,
    'T6c (KONTROLA PINU): `some()` na TEJ SAMEJ księdze powiedziałoby `true` — pokazane ' +
    'wykonaniem, więc T6b nie może przejść przy implementacji przez `some`');
  const src = readClean('systems', 'diplomacy', 'AcceptanceEngine.js');
  assert(/getCaptures\s*\?\.\s*\(|\?\.\s*getCaptures\s*\(/.test(src),
    'T6d: `getCaptures` czytane przez `?.` — atrapy `warSystem` bez tej metody (dwie w repo) ' +
    'degradują do pustej księgi, a nie wywalają oceny');
}

// ════════════════════════════════════════════════════════════════════════════
// T7 — `heldValue` = DEFINICJA (B): pula ODDAWALNA oceniającego
//
// ⚠ Definicja (A) („wszystko, co trzyma") została ODRZUCONA POMIAREM w FAZIE A-bis:
//   stolica i ciała zdobyte na graczu pompowały sufit, więc im większa stolica AI i im
//   więcej zabrało graczowi, tym WIĘCEJ jego kolonii dało się wziąć przy stole. Przy
//   (A)+0,5 całe terytorium poza stolicą przechodziło — czyli sufit nie robił nic.
// ════════════════════════════════════════════════════════════════════════════
console.log('T7 — pula oddawalna: bez stolicy, bez zdobyczy, z żywego świata');
{
  const CAPT = (E) => [{ bodyId: 'x1', fromEmpireId: 'player', toEmpireId: E, year: 10, via: 'invasion' }];
  const { engine } = world({
    cols: [col('cap', 195, { capital: true }), col('c1', 80), col('c2', 80), col('c3', 80), col('x1', 195)],
    captures: CAPT,
  });
  const ctx = engine.buildContext('player', EMP, {
    verb: 'offer_peace', terms: { cessions: [{ bodyId: 'c1', fromEmpireId: EMP, toEmpireId: 'player' }] },
  });
  const held = ctx?.terms?.heldValue;
  assert(held === 246,
    `T7a: held = 3 × (2 + 80) = 246 — stolica (197) i ciało zdobyte na graczu (197) NIE wchodzą ` +
    `(zmierzone: ${held})`);
  const withAll = 197 + 82 * 3 + 197;
  assert(withAll === 640 && held !== withAll,
    'T7b (KONTROLA PINU): definicja (A) dałaby 640, czyli sufit 320 > cała pula oddawalna 246 ' +
    '— pokazane liczbą, żeby nikt nie „uprościł" tego z powrotem');
  assert(ctx?.terms?.cessions?.[0]?.devValue === 82,
    'T7c: devValue cesji = BASE + colonyDevScore (2 + 80), liczone z ŻYWEJ kolonii');

  const playerHome = col('p_home', 100, { ownerEmpireId: null, isHomePlanet: true });
  const playerC2 = col('p_c2', 40, { ownerEmpireId: null });
  const w2 = world({ cols: [col('cap', 195, { capital: true })], playerCols: [playerHome, playerC2] });
  const ctxP = w2.engine.buildContext(EMP, 'player', {
    verb: 'offer_peace', terms: { cessions: [{ bodyId: 'p_c2', fromEmpireId: 'player', toEmpireId: EMP }] },
  });
  assert(ctxP?.terms?.heldValue === 42,
    'T7d: SYMETRIA — gdy oceniającym jest GRACZ, pulę liczą getPlayerColonies + isHomePlanet ' +
    `(2 + 40 = 42, dom 102 wykluczony; zmierzone: ${ctxP?.terms?.heldValue})`);
}

// ════════════════════════════════════════════════════════════════════════════
// T8 — DEGRADACJA: `null` (brak świata) ≠ `0` (rozwiązane, pusto)
// ════════════════════════════════════════════════════════════════════════════
console.log('T8 — degradacja held: null przepuszcza, 0 blokuje tylko realne żądanie');
{
  const { engine } = world({ cols: [col('cap', 195, { capital: true })], noColonyManager: true });
  const ctx = engine.buildContext('player', EMP, {
    verb: 'offer_peace', terms: { cessions: [{ bodyId: 'c9', fromEmpireId: EMP, toEmpireId: 'player' }] },
  });
  assert(ctx?.terms?.heldValue === null,
    'T8a: brak `colonyManager` → `heldValue = null` (nierozwiązywalne), a NIE 0 — rozróżnienie ' +
    'jest całym mechanizmem degradacji');
  assert(AE.evaluateWithContext(ctx).blocked === false,
    'T8b: `held == null` PRZEPUSZCZA — brak świata to stan headless, nie „AI nie ma czego oddać". ' +
    'Fail-closed zaciemniłby też `probeTermImpact`, który pomija `blocked` i zmierzyłby term jako 0');
}

// ════════════════════════════════════════════════════════════════════════════
// T9 — REGRESJA ZERO: propozycja bez warunków nie zmienia się ANI W JEDNYM BAJCIE
// ════════════════════════════════════════════════════════════════════════════
console.log('T9 — regresja zero dla propozycji bez warunków');
{
  const { dipl, engine, counts } = world({ cols: [col('cap', 195, { capital: true }), col('c1', 80)] });
  const before = { ...counts };
  const a = dipl.evaluatePeace(EMP);
  const b = dipl.evaluatePeace(EMP, null);
  assert(a.score === b.score && a.decision === b.decision && a.blocked === b.blocked
    && JSON.stringify(a.breakdown) === JSON.stringify(b.breakdown),
    'T9a: `evaluatePeace(id)` i `evaluatePeace(id, null)` są IDENTYCZNE co do wyniku i co do ' +
    'każdego wiersza rozbicia');
  const ctx = engine.buildContext('player', EMP, { verb: 'offer_peace' });
  assert(ctx.terms === null,
    'T9b: `ctx.terms === null` dla propozycji bez cesji — pole istnieje (szew jest widoczny), ' +
    'ale NIC nie jest liczone');
  assert(counts.owned === before.owned && counts.capital === before.capital,
    'T9c: ZERO odczytów świata (getColoniesByEmpire / capitalOf) przy propozycji bez cesji — ' +
    'to jest cała treść „liczone wyłącznie gdy cessions niepuste"');
  const mid = { ...counts };
  engine.buildContext('player', EMP, {
    verb: 'offer_peace', terms: { cessions: [{ bodyId: 'c1', fromEmpireId: EMP, toEmpireId: 'player' }] },
  });
  assert(counts.owned > mid.owned && counts.capital > mid.capital,
    'T9d (KONTROLA PINU): z cesjami te same liczniki ROSNĄ — bez tego T9c przechodziłby jałowo ' +
    '(„nic nie liczy, bo licznik jest zepsuty")');
  assert(a.breakdown.some((r) => r.term === 'territorial_terms' && r.value === 0),
    'T9e: term JEST w rozbiciu z wkładem 0 — telemetria E7 musi widzieć kolumnę bezczynną, ' +
    'a gate (A) musi mieć gdzie odczytać wkład');
}

// ════════════════════════════════════════════════════════════════════════════
// T10 — TABELA DECYZYJNA na ŻYWYM silniku (kotwice zmierzone w FAZIE A-bis)
// ════════════════════════════════════════════════════════════════════════════
console.log('T10 — kotwice tabeli decyzyjnej');
{
  const mk = (exh) => world({
    cols: [col('cap', 195, { capital: true }), col('c1', 80), col('c2', 80), col('c3', 80)],
    exh,
  });
  const { dipl } = mk(100);
  const bare = dipl.evaluatePeace(EMP);
  assert(near(bare.score, 48.50),
    `T10a: tło przy exh 100 / tension 100 / peaceCost 30 = 48,50 (zmierzone: ${bare.score}) — ` +
    'kotwica, wobec której waga 35 jest za lekka na weto');

  const one = dipl.evaluatePeace(EMP, { cessions: [{ bodyId: 'c1', fromEmpireId: EMP, toEmpireId: 'player' }] });
  const row = one.breakdown.find((r) => r.term === 'territorial_terms');
  assert(one.blocked === false && one.decision === true && row && row.value < 0,
    `T10b: 1 kolonia (82 z puli 246) przy exh 100 — przechodzi sufit, dostaje UJEMNY wkład ` +
    `${row ? row.value : '—'} i mimo to kończy się zgodą (${one.score}); term gradację robi, ` +
    'wet nie stawia');

  for (const exh of [30, 50, 100]) {
    const w = mk(exh);
    const half = w.dipl.evaluatePeace(EMP, {
      cessions: [{ bodyId: 'c1', fromEmpireId: EMP, toEmpireId: 'player' },
        { bodyId: 'c2', fromEmpireId: EMP, toEmpireId: 'player' }],
    });
    assert(half.blocked === true && half.reasonKey === 'diplo.reject.territoryNotNegotiable',
      `T10c@exh${exh}: połowa terytorium (164 > 123) blokowana NIEZALEŻNIE od wyczerpania — ` +
      'to jest zdanie D-WP-8 wyrażone wykonaniem');
  }
  const noCeiling = AE.evaluateWithContext(ctxPure({
    terms: {
      cessions: [{ ...cede('c1', 82) }, { ...cede('c2', 82) }],
      heldValue: null,                                  // degradacja = sufit nieaktywny
    },
  }));
  assert(noCeiling.blocked === false && noCeiling.decision === true,
    'T10d (KONTROLA PINU): TA SAMA propozycja z wyłączonym sufitem kończy się ZGODĄ ' +
    `(${noCeiling.score}) — czyli T10c mierzy SUFIT, a nie to, że suma i tak by odmówiła`);
}

// ════════════════════════════════════════════════════════════════════════════
// T11 — `offerPeace` utwardzony na `blocked` (bliźniak `proposeTreaty`)
// ════════════════════════════════════════════════════════════════════════════
console.log('T11 — blokada NIE stempluje odmowy');
{
  const { dipl } = world({ cols: [col('cap', 195, { capital: true })] });
  const BLOCKED = { verb: 'offer_peace', score: 0, decision: false, blocked: true,
    reasonKey: 'diplo.reject.territoryNotNegotiable', breakdown: [], counterHint: null };
  dipl.evaluatePeace = () => BLOCKED;
  const before = dipl.getRefusedYear(EMP, 'offer_peace');
  const okB = dipl.offerPeace(EMP, 'player_action');
  const memB = (dipl.relations.getMemory('player', EMP, 999) ?? []).filter((m) => m.type === 'peace_refused').length;
  assert(okB === false && memB === 0 && dipl.getRefusedYear(EMP, 'offer_peace') === before,
    'T11a: blokada → `false`, ZERO wpisów `peace_refused`, ZERO stempla `recent_refusal` — ' +
    'nikt nas nie odrzucił, propozycja w ogóle nie doszła do oceny');

  const REFUSED = { ...BLOCKED, blocked: false, reasonKey: null, score: -5, breakdown: [{ term: 'opinion', value: -5 }] };
  dipl.evaluatePeace = () => REFUSED;
  const okR = dipl.offerPeace(EMP, 'player_action');
  const memR = (dipl.relations.getMemory('player', EMP, 999) ?? []).filter((m) => m.type === 'peace_refused').length;
  assert(okR === false && memR === 1 && dipl.getRefusedYear(EMP, 'offer_peace') !== before,
    'T11b (KONTROLA PINU): odmowa OCENIONA stempluje jak dotąd — T11a mierzy `blocked`, ' +
    'a nie to, że stemplowanie w ogóle umarło');

  const src = readClean('systems', 'DiplomacySystem.js');
  const body = src.slice(src.indexOf('offerPeace('), src.indexOf('offerPeace(') + 1400);
  assert(body.indexOf('result.blocked') > 0 && body.indexOf('result.blocked') < body.indexOf('!result.decision'),
    'T11c (pin ŹRÓDŁOWY): gałąź `result.blocked` stoi PRZED gałęzią `!result.decision` — ' +
    'lustro `proposeTreaty`; odwrotna kolejność cicho przywraca defekt');
}

// ════════════════════════════════════════════════════════════════════════════
// T12 — `evaluatePeace(empireId, terms = null)` (wariant T1e z FAZY A)
// ════════════════════════════════════════════════════════════════════════════
console.log('T12 — sygnatura kanału warunków pokoju');
{
  const src = readClean('systems', 'DiplomacySystem.js');
  assert(/evaluatePeace\s*\(\s*empireId\s*,\s*terms\s*=\s*null\s*\)/.test(src),
    'T12a (pin ŹRÓDŁOWY): `evaluatePeace(empireId, terms = null)` — kanał jest OPCJONALNY, ' +
    'więc wszyscy dzisiejsi wołający zostają bez zmian');
  assert(/evaluateProposal\(\s*PLAYER\s*,\s*empireId\s*,\s*\{\s*verb:\s*'offer_peace'\s*,\s*terms\s*\}\s*\)/.test(src),
    'T12b (pin ŹRÓDŁOWY): `terms` jedzie do silnika tą samą propozycją, bez drugiego kanału');
  const { dipl } = world({ cols: [col('cap', 195, { capital: true }), col('c1', 80)] });
  const r = dipl.evaluatePeace(EMP, { cessions: [{ bodyId: 'cap', fromEmpireId: EMP, toEmpireId: 'player' }] });
  assert(r.blocked === true && r.reasonKey === 'diplo.reject.capitalNotNegotiable',
    'T12c: warunki podane fasadzie DOJEŻDŻAJĄ do pre-warunków (end-to-end przez DiplomacySystem)');

  // ⚠ T12d — DRUGI RAZ TA SAMA PUŁAPKA CO W1-3. `DiplomacySystem._acceptance()` wstrzykuje
  //   kolaboratorów BIAŁĄ LISTĄ getterów, a nie przezroczystym proxy na `window.KOSMOS`.
  //   Pominięcie klucza NIE rzuca: `_buildTermsContext` widzi `undefined`, więc KAŻDE ciało
  //   wycenia się na samo BASE, pula schodzi do `null` (sufit przestaje blokować), a stolica
  //   przestaje być rozpoznawana — cały D-WP-8 umiera PO CICHU przy zielonych testach
  //   czystego silnika. ZMIERZONE w tym slice'ie: przed dołożeniem tych dwóch wierszy
  //   żądanie 164 przy puli 246 kończyło się `blocked: false, score 48.19`.
  // ⚠ Kotwicą jest DEFINICJA metody, nie pierwsze wystąpienie nazwy: `_acceptance()` pada
  //   najpierw jako WOŁANIE (`this._acceptance().evaluateProposal`) kilkaset linii wyżej,
  //   a okno liczone od niego nie sięga ciała metody — pin mierzyłby wtedy ciszę.
  const accAt = src.indexOf('_acceptance() {');
  const accSrc = accAt < 0 ? '' : src.slice(accAt, accAt + 2000);
  assert(/get colonyManager\s*\(\)/.test(accSrc) && /get directorProduction\s*\(\)/.test(accSrc),
    'T12d (pin ŹRÓDŁOWY): biała lista `_acceptance()` wstrzykuje `colonyManager` ORAZ ' +
    '`directorProduction` — bez nich mechanizm terytorialny degraduje się do zera bez ' +
    'jednego komunikatu (lustro `acceptance_relpower_smoke` T5)');
  assert(/get threatAssessment\s*\(\)/.test(accSrc),
    'T12e (KONTROLA PINU): regex trafia też w getter, który stał tam WCZEŚNIEJ — T12d nie ' +
    'przechodzi przez przypadkowo dopasowany fragment pliku');
}

// ════════════════════════════════════════════════════════════════════════════
// T13 — i18n: trzy klucze × dwa języki + mostek powodów
// ════════════════════════════════════════════════════════════════════════════
console.log('T13 — i18n i mostek REJECT_REASON_BY_KEY');
{
  const pl = norm(readFileSync(join(SRC, 'i18n', 'pl.js'), 'utf8'));
  const en = norm(readFileSync(join(SRC, 'i18n', 'en.js'), 'utf8'));
  const KEYS = ['diplo.term.territorialTerms', 'diplo.reject.territoryNotNegotiable', 'diplo.reject.capitalNotNegotiable'];
  assert(KEYS.every((k) => pl.includes(`'${k}'`)) && KEYS.every((k) => en.includes(`'${k}'`)),
    'T13a: wszystkie trzy klucze istnieją w PL I EN (parytet — inaczej `check-i18n` pada)');
  assert(!KEYS.some((k) => pl.includes(`'${k}'`) && en.includes(`'${k}'`) === false),
    'T13b: żaden klucz nie jest jednojęzyczny');
  const dsrc = readClean('systems', 'DiplomacySystem.js');
  assert(dsrc.includes("'diplo.reject.territoryNotNegotiable':") && dsrc.includes("'diplo.reject.capitalNotNegotiable':"),
    'T13c: `REJECT_REASON_BY_KEY` ma oba wiersze — bez nich `diplomacy:treatyRejected` zwijałby ' +
    'nowe powody do generycznego `blocked`');
  assert(!pl.includes("'diplo.reject.zonkNotNegotiable'"),
    'T13d (KONTROLA PINU): klucz, którego nie ma, NIE jest w słowniku — T13a nie przechodzi ' +
    'przez zepsute wyszukiwanie');
}

// ════════════════════════════════════════════════════════════════════════════
// T14 — `ColonyDevScore` (wariant C): JEDNO źródło wzoru rozwoju
// ════════════════════════════════════════════════════════════════════════════
console.log('T14 — wspólny wzór devScore (wariant C)');
{
  assert(typeof colonyDevScore === 'function',
    'T14a: `src/utils/ColonyDevScore.js` istnieje i eksportuje `colonyDevScore`');
  if (typeof colonyDevScore === 'function') {
    assert(colonyDevScore(col('t', 80)) === 80 && colonyDevScore(null) === 0 && colonyDevScore({}) === 0,
      'T14b: liczy `population + aktywne budynki`, a brak pól degraduje do 0 (nie rzuca)');
    const { TerritoryService } = await import('../../systems/TerritoryService.js');
    const cols = [col('a', 80, { ownerEmpireId: null, systemId: 'sys_t' }),
      col('b', 40, { ownerEmpireId: null, systemId: 'sys_t' })];
    window.KOSMOS = { colonyManager: { getAllColonies: () => cols }, stationSystem: { getAllStations: () => [] } };
    const ts = new TerritoryService();
    const viaService = ts.getSystemDevScore('sys_t');
    const viaHelper = cols.reduce((s, c) => s + colonyDevScore(c), 0);
    ts.dispose();
    assert(viaService === viaHelper && viaService === 120,
      `T14c: RÓWNOŚĆ WYKONANIOWA — TerritoryService i helper dają tę samą liczbę ` +
      `(${viaService} = ${viaHelper}); wariant C miał ZNIEŚĆ drugą kopię wzoru, nie dołożyć trzeciej`);
    const tsrc = readClean('systems', 'TerritoryService.js');
    assert(/colonyDevScore\s*\(/.test(tsrc) && !/civSystem\?\.\s*population\s*\?\?\s*0/.test(tsrc),
      'T14d (pin ŹRÓDŁOWY): `TerritoryService` WOŁA helper i nie trzyma już inline\'owej kopii wzoru');
  } else {
    for (let i = 0; i < 3; i++) assert(false, 'T14b-T14d: pominięte — brak modułu');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// T15-T22 — PINY PODPISANE PRZEZ WŁAŚCICIELA (jeden do jednego z listy)
// ════════════════════════════════════════════════════════════════════════════
console.log('T15-T22 — piny podpisane');
{
  const FULL = () => world({
    cols: [col('cap', 195, { capital: true }), col('c1', 80), col('c2', 80), col('c3', 80)], exh: 100,
  });

  // T15 — żądanie ponad sufit odrzucone przy exh 100
  {
    const { dipl } = FULL();
    const r = dipl.evaluatePeace(EMP, {
      cessions: [{ bodyId: 'c1', fromEmpireId: EMP, toEmpireId: 'player' },
        { bodyId: 'c2', fromEmpireId: EMP, toEmpireId: 'player' },
        { bodyId: 'c3', fromEmpireId: EMP, toEmpireId: 'player' }],
    });
    assert(r.blocked === true && r.reasonKey === 'diplo.reject.territoryNotNegotiable',
      'T15: całe terytorium (246 > 123) odrzucone przy exh 100 — wyczerpanie NIE daje wszystkiego');
    const ctlPure = AE.evaluateWithContext(ctxPure({
      terms: { cessions: [cede('c1', 82), cede('c2', 82), cede('c3', 82)], heldValue: null },
    }));
    assert(ctlPure.blocked === false && ctlPure.decision === true,
      `T15-ctl (KONTROLA PINU): ta sama propozycja bez sufitu kończy się ZGODĄ (${ctlPure.score}) — ` +
      'sama suma termów odmowy NIE produkuje');
  }

  // T16 — zwrot zdobyczy nie liczy się do sufitu
  {
    const CAPT = (E) => [{ bodyId: 'x1', fromEmpireId: 'player', toEmpireId: E, year: 10, via: 'invasion' }];
    const COLS = () => [col('cap', 195, { capital: true }), col('c1', 80), col('x1', 195)];
    const { dipl } = world({ cols: COLS(), captures: CAPT, exh: 100 });
    const back = dipl.evaluatePeace(EMP, { cessions: [{ bodyId: 'x1', fromEmpireId: EMP, toEmpireId: 'player' }] });
    assert(back.blocked === false,
      'T16: zwrot ciała zdobytego w TEJ wojnie (devValue 197 > sufit 123) NIE blokuje — ' +
      'to nie jest terytorium oceniającego');
    const { dipl: d2 } = world({ cols: COLS(), captures: [], exh: 100 });
    const own = d2.evaluatePeace(EMP, { cessions: [{ bodyId: 'x1', fromEmpireId: EMP, toEmpireId: 'player' }] });
    assert(own.blocked === true && own.reasonKey === 'diplo.reject.territoryNotNegotiable',
      'T16-ctl (KONTROLA PINU): TO SAMO ciało bez wpisu w księdze zdobyczy JEST blokowane — ' +
      'T16 mierzy księgę, a nie wielkość ciała');
  }

  // T17 — ciało domowe odrzucone przy exh 100
  {
    const { dipl } = FULL();
    const r = dipl.evaluatePeace(EMP, { cessions: [{ bodyId: 'cap', fromEmpireId: EMP, toEmpireId: 'player' }] });
    assert(r.blocked === true && r.reasonKey === 'diplo.reject.capitalNotNegotiable',
      'T17: stolica odrzucona przy exh 100 — „całe imperium tylko przez podbój"');
    const { dipl: d2 } = world({
      cols: [col('cap', 195), col('c1', 80), col('c2', 80), col('c3', 80)], exh: 100,   // BEZ stolicy
    });
    const r2 = d2.evaluatePeace(EMP, { cessions: [{ bodyId: 'cap', fromEmpireId: EMP, toEmpireId: 'player' }] });
    assert(r2.reasonKey !== 'diplo.reject.capitalNotNegotiable',
      'T17-ctl (KONTROLA PINU): to samo ciało w imperium BEZ rozwiązanej stolicy nie jest chronione ' +
      'znacznikiem domu — T17 mierzy kanon `capitalOf`, a nie id ciała');
  }

  // T18 — fixture graniczny: 123 przechodzi, 124 blokuje (held 246)
  {
    const at = (v) => AE.evaluateWithContext(ctxPure({ terms: { cessions: [cede('b', v)], heldValue: 246 } })).blocked;
    assert(at(122) === false && at(123) === false && at(124) === true,
      'T18: granica sufitu jest OSTRA i leży dokładnie na SHARE × held (122/123 przechodzą, ' +
      '124 blokuje) — sufit nie zabija cesji „prawie pod progiem"');
  }

  // T19 — sufit liczony z ŻYWEGO stanu posiadania
  {
    const demandC1 = (E) => ({ cessions: [{ bodyId: 'c1', fromEmpireId: E, toEmpireId: 'player' }] });
    const wRich = world({ cols: [col('cap', 195, { capital: true }), col('c1', 80), col('c2', 80), col('c3', 80)] });
    const rich = wRich.dipl.evaluatePeace(wRich.EMP, demandC1(wRich.EMP));
    const wPoor = world({ cols: [col('cap', 195, { capital: true }), col('c1', 80)] });
    const poor = wPoor.dipl.evaluatePeace(wPoor.EMP, demandC1(wPoor.EMP));
    assert(rich.blocked === false && poor.blocked === true
      && poor.reasonKey === 'diplo.reject.territoryNotNegotiable',
      'T19: TO SAMO żądanie (82) przechodzi przy puli 246, a blokuje po utracie dwóch kolonii ' +
      '(pula 82, sufit 41) — sufit czyta ŻYWY stan, nie migawkę');
  }

  // T20 — degradacja held (null przepuszcza / 0 blokuje przy demand_own > 0)
  {
    const nullHeld = AE.evaluateWithContext(ctxPure({ terms: { cessions: [cede('b', 999)], heldValue: null } }));
    const zeroHeld = AE.evaluateWithContext(ctxPure({ terms: { cessions: [cede('b', 82)], heldValue: 0 } }));
    assert(nullHeld.blocked === false && zeroHeld.blocked === true
      && zeroHeld.reasonKey === 'diplo.reject.territoryNotNegotiable',
      'T20: `held == null` (brak świata) przepuszcza NAWET żądanie 999; `held === 0` (rozwiązane, ' +
      'pusto) blokuje żądanie 82 — null i zero to DWA różne stany, nie jeden falsy');
  }

  // T21 — blokada nie stempluje odmowy (lustro T11a, na liście podpisu osobno)
  {
    const { dipl } = world({ cols: [col('cap', 195, { capital: true })] });
    dipl.evaluatePeace = () => ({ verb: 'offer_peace', score: 0, decision: false, blocked: true,
      reasonKey: 'diplo.reject.capitalNotNegotiable', breakdown: [], counterHint: null });
    const y0 = dipl.getRefusedYear(EMP, 'offer_peace');
    dipl.offerPeace(EMP, 'player_action');
    assert(dipl.getRefusedYear(EMP, 'offer_peace') === y0
      && (dipl.relations.getMemory('player', EMP, 999) ?? []).every((m) => m.type !== 'peace_refused'),
      'T21: `offerPeace` na blokadzie nie zostawia ANI wpisu pamięci, ANI cooldownu — inaczej ' +
      'gracz dostawałby karę `recent_refusal` za propozycję, której nikt nie ocenił');
  }

  // T22 — held === 0: same zwroty przechodzą; propozycja bez terms nie dotyka pre-warunków
  {
    const CAPT = (E) => [{ bodyId: 'x1', fromEmpireId: 'player', toEmpireId: E, year: 10, via: 'invasion' }];
    const { dipl } = world({ cols: [col('cap', 195, { capital: true }), col('x1', 195)], captures: CAPT, exh: 100 });
    const onlyBack = dipl.evaluatePeace(EMP, { cessions: [{ bodyId: 'x1', fromEmpireId: EMP, toEmpireId: 'player' }] });
    assert(onlyBack.blocked === false,
      'T22a: pula oddawalna = 0 (AI ma tylko stolicę i zdobycz), a SAME zwroty zdobyczy i tak ' +
      'przechodzą — `demand_own = 0` ⇒ sufit nigdy nie blokuje, niezależnie od held');
    const bare = dipl.evaluatePeace(EMP);
    assert(bare.blocked === false && bare.breakdown.length > 0,
      'T22b: zwykły `offer_peace` BEZ warunków do tego samego AI idzie STARĄ ścieżką — ' +
      'ocena z rozbiciem, zero pre-warunków terytorialnych w grze');
  }
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
