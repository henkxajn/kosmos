// W1 — keeper termu `relative_power` (commit W1-3, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: term zwracał twarde `0` od D2/E1 przy AUTORSKICH, niezerowych wagach (trade_agreement 10,
// non_aggression 20, alliance 20, offer_peace 30 + hegemon ×1.5). W1-3 daje mu wreszcie źródło
// danych. Ten keeper pilnuje trzech rzeczy naraz: że term LICZY, że zachowuje CZYSTOŚĆ, i — co
// najważniejsze — że jego odblokowanie NIE ruszyło kotwic parytetu z E2.
//
//   T1  kontrakt wartości: raw ∈ ⟨−1, +1⟩, znak „+1 = OCENIAJĄCY SŁABSZY" (backbone §2.1)
//   T2  ⚠ DEGRADACJA do 0 bez `ctx.strength` — zabezpieczenie kotwic parytetu E2 (decyzja 5)
//   T3  term jest CZYSTY: czyta wyłącznie ctx, nie sięga po kolaboratora
//   T4  wszystkie CZTERY czasowniki z niezerową wagą faktycznie ruszają wynik
//   T5  `buildContext` wstrzykuje siłę z ThreatAssessment we WŁAŚCIWEJ perspektywie
//   T6  status katalogu = LIVE i nie ma już ŻADNEGO stubu
//
// ⚠ T2 jest sercem tego pliku. Gdyby term nie degradował, `DiplomacyTelemetry.matrixBaseContext`
//    (który buduje kontekst literałem) zacząłby liczyć czwarty term i progi 10/25/30 z E2
//    przestałyby się odtwarzać. Dowód, że tak nie jest: `diplomacy_d1_smoke` przechodzi 83/83
//    BEZ EDYCJI po tym commicie.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { createVessel } from '../../entities/Vessel.js';
import { TERM_EVALUATORS, evaluateWithContext, AcceptanceEngine } from '../../systems/diplomacy/AcceptanceEngine.js';
import { ACCEPTANCE_TERMS, TERM_STATUS, VERB_ACCEPTANCE } from '../../data/AcceptanceWeightData.js';
import { matrixBaseContext } from '../../testing/headless/DiplomacyTelemetry.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const term = TERM_EVALUATORS.relative_power;

// ── T1 — kontrakt wartości i znaku ──────────────────────────────────────────
// ⚠ ODWRÓCONE W W1-3b — orzeczenie orkiestratora. W1-3 wypuścił znak przeciwny
//   (+1 = oceniający SILNIEJSZY), co przeczy DIPLOMACY_BACKBONE §2.1 („weaker side more
//   agreeable"): dominujące AI podpisywało wszystko, a przy `offer_peace` WYGRYWAJĄCY
//   chętniej godził się na pokój. Backbone jest autorytetem; magnitudy wag nietknięte.
//   Ten blok jest pinem KIERUNKU — regresja znaku ma go zaczerwienić natychmiast.
console.log('T1 — raw ∈ ⟨−1, +1⟩, znak: +1 = OCENIAJĄCY SŁABSZY (backbone §2.1)');
{
  assert(term({ strength: { self: 100, other: 100 } }) === 0, 'T1: siły równe ⇒ 0');
  assert(term({ strength: { self: 0, other: 1000 } }) === 1,
    'T1: OCENIAJĄCY bez floty ⇒ +1 (słabsza strona bardziej ugodowa)');
  assert(term({ strength: { self: 1000, other: 0 } }) === -1,
    'T1: PROPONUJĄCY bez floty ⇒ −1 (silny oceniający mniej ugodowy — naciska przewagę)');
  assert(approx(term({ strength: { self: 100, other: 300 } }), 0.5),
    'T1: oceniający słabszy 1:3 ⇒ +0.5');
  assert(approx(term({ strength: { self: 300, other: 100 } }),
                -term({ strength: { self: 100, other: 300 } })),
    'T1: antysymetria — zamiana stron odwraca znak');

  const extremes = [
    term({ strength: { self: 1e12, other: 1 } }),
    term({ strength: { self: 1, other: 1e12 } }),
    term({ strength: { self: -50, other: 10 } }),      // wejście bez sensu, ale nie może wybuchnąć
    term({ strength: { self: 0, other: 0 } }),
  ];
  assert(extremes.every(v => Number.isFinite(v) && v >= -1 && v <= 1),
    `T1: skrajne wejścia nie wychodzą poza pasmo [${extremes.map(v => v.toFixed(3))}]`);
}

// ── T2 — DEGRADACJA (decyzja 5) — kotwica parytetu E2 ───────────────────────
console.log('T2 — brak ctx.strength ⇒ surowe 0 (zabezpieczenie kotwic parytetu E2)');
{
  assert(term({}) === 0,                                  'T2: pusty ctx ⇒ 0');
  assert(term({ strength: null }) === 0,                  'T2: strength === null ⇒ 0');
  assert(term({ strength: undefined }) === 0,             'T2: strength === undefined ⇒ 0');
  assert(term({ strength: { self: 100 } }) === 0,         'T2: POŁOWA pola (brak `other`) ⇒ 0, nie NaN');
  assert(term({ strength: { other: 100 } }) === 0,        'T2: POŁOWA pola (brak `self`) ⇒ 0, nie NaN');

  // ⚠ Sedno: kontekst przyrządu strojenia wag MUSI dawać dokładnie 0, inaczej progi
  //   parytetu z E2 przestają się odtwarzać. Sprawdzamy na PRAWDZIWYM matrixBaseContext,
  //   nie na atrapie — inaczej pin nie dotykałby rzeczywistego przyrządu.
  for (const verb of ['trade_agreement', 'non_aggression', 'alliance', 'offer_peace']) {
    assert(term(matrixBaseContext(verb)) === 0,
      `T2: matrixBaseContext('${verb}') daje wkład 0 — siły są RÓWNE z założenia`);
  }
}

// ── T3 — czystość: term nie sięga po kolaboratora ───────────────────────────
console.log('T3 — term jest CZYSTY (czyta wyłącznie ctx)');
{
  // Term wywołany BEZ jakiegokolwiek window.KOSMOS musi działać. Gdyby sięgał po
  // ThreatAssessment (zamiast czytać ctx), rzuciłby albo zwrócił coś innego.
  const savedKosmos = window.KOSMOS;
  try {
    window.KOSMOS = undefined;
    assert(term({ strength: { self: 100, other: 900 } }) === 0.8,
      'T3: liczy poprawnie przy CAŁKOWICIE odciętym window.KOSMOS (0.8 gdy oceniający słabszy 1:9)');
    assert(term({}) === 0, 'T3: degraduje poprawnie przy odciętym window.KOSMOS');
  } finally {
    window.KOSMOS = savedKosmos;
  }

  // Determinizm: ta sama ctx ⇒ ta sama wartość, bez ukrytego stanu.
  const ctx = { strength: { self: 421, other: 137 } };
  assert(term(ctx) === term(ctx) && term(ctx) === term({ ...ctx }),
    'T3: deterministyczny — brak ukrytego stanu między wywołaniami');
}

// ── T4 — wszystkie cztery czasowniki faktycznie ruszają wynik ───────────────
console.log('T4 — cztery czasowniki z niezerową wagą REALNIE zmieniają wynik');
{
  // ⚠ Dwie pułapki, obie złapane przy pierwszym uruchomieniu tego keepera:
  //  (a) `non_aggression` (aggression ≤ 0.4) i `alliance` (≤ 0.3) mają `personalityFloor` z E2,
  //      a `matrixBaseContext` podaje puste `personality` — propozycja jest wtedy ZABLOKOWANA
  //      pre-warunkiem (`blocked: true`, PUSTY breakdown) i wynik wynosi 0 niezależnie od
  //      termów. Bez gołębiej osobowości mierzylibyśmy blokadę zamiast wkładu termu.
  //  (b) skrajne wejście MUSI być dokładnie ±1, żeby porównywać z wagą bez tolerancji:
  //      (10000−1)/10001 = 0.9998, więc wkład wychodził 29.994 zamiast 30. Zero po drugiej
  //      stronie daje raw równe dokładnie ±1.
  // aggression 0.2 przechodzi OBIE podłogi (0.4 i 0.3) — sprawdzane jawnie niżej.
  const PASSING_PERSONALITY = { aggression: 0.2, expansion: 0.5, secrecy: 0.5, trade: 0.9, science: 0.7 };
  const verbs = ['trade_agreement', 'non_aggression', 'alliance', 'offer_peace'];
  for (const verb of verbs) {
    const w = VERB_ACCEPTANCE[verb]?.terms?.relative_power ?? 0;
    assert(w > 0, `T4: '${verb}' ma niezerową wagę relative_power (${w})`);

    const base   = { ...matrixBaseContext(verb), archetype: 'trader', personality: PASSING_PERSONALITY };
    // `weakEval` = oceniający miażdżąco SŁABSZY ⇒ raw +1 ⇒ WYŻSZY wynik (backbone §2.1).
    const weakEval   = { ...base, strength: { self: 0, other: 10000 } };
    const strongEval = { ...base, strength: { self: 10000, other: 0 } };

    const rBase       = evaluateWithContext(base);
    const rWeakEval   = evaluateWithContext(weakEval);     // słaby oceniający ⇒ wynik W GÓRĘ
    const rStrongEval = evaluateWithContext(strongEval);   // silny oceniający ⇒ wynik W DÓŁ

    // Bez tej asercji trzy poniższe przechodziłyby na zablokowanej propozycji (score 0 = 0 = 0).
    assert(rBase.blocked !== true && rBase.breakdown.length > 0,
      `T4: '${verb}' — propozycja jest OCENIANA, nie zablokowana pre-warunkiem (podłoga osobowości)`);
    const rowBase = rBase.breakdown.find(x => x.term === 'relative_power');
    assert(rowBase && rowBase.value === 0,
      `T4: '${verb}' — przy siłach równych wkład to DOKŁADNIE 0`);
    assert(rWeakEval.score > rBase.score && rStrongEval.score < rBase.score,
      `T4: '${verb}' — SŁABOŚĆ oceniającego PODNOSI, jego PRZEWAGA obniża wynik ` +
      `(${rStrongEval.score.toFixed(2)} < ${rBase.score.toFixed(2)} < ${rWeakEval.score.toFixed(2)})`);
    assert(approx(rWeakEval.score - rBase.score, w) && approx(rBase.score - rStrongEval.score, w),
      `T4: '${verb}' — skrajny układ sił przesuwa wynik DOKŁADNIE o wagę (${w} pkt)`);
  }
}

// ── T5 — buildContext wstrzykuje siłę we WŁAŚCIWEJ perspektywie ─────────────
console.log('T5 — buildContext: `self` = OCENIAJĄCY (toId), `other` = PROPONUJĄCY (fromId)');
{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });

  const empireId = core.empireRegistry.listAll()[0]?.id;
  const home = window.KOSMOS.homePlanet;

  // Wrogi kadłub — stawiany RĘCZNIE (harness nie montuje stationSystem, patrz war_seams).
  const enemy = createVessel('hull_cruiser', home.id, {
    name: 'Krążownik AI', modules: ['engine_ion', 'armor_heavy', 'weapon_missile'],
    x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  enemy.ownerEmpireId = empireId; enemy.owner = empireId; enemy.isEnemy = true;
  core.vesselManager._vessels.set(enemy.id, enemy);
  core.threatAssessment.invalidate();

  const eng = core.diplomacySystem._acceptance();
  // Gracz PROSI imperium (fromId=player, toId=empire) ⇒ oceniającym jest imperium.
  const ctx = eng.buildContext('player', empireId, { verb: 'trade_agreement' });

  assert(!!ctx.strength, 'T5: buildContext dokłada pole `strength`');
  assert(ctx.strength.self === core.threatAssessment.getStrength(empireId),
    `T5: `.trim() + '`self` to siła OCENIAJĄCEGO (imperium: ' + `${ctx.strength.self})`);
  assert(ctx.strength.other === core.threatAssessment.getPlayerStrength(),
    `T5: `.trim() + '`other` to siła PROPONUJĄCEGO (gracz: ' + `${ctx.strength.other})`);
  assert(ctx.strength.self > ctx.strength.other,
    `T5: imperium z krążownikiem jest silniejsze od bezflotowego gracza ` +
    `(${ctx.strength.self} > ${ctx.strength.other})`);
  assert(term(ctx) < 0,
    `T5: …więc term daje UJEMNY wkład (${term(ctx).toFixed(3)}) — silny oceniający jest MNIEJ ugodowy ` +
    '(backbone §2.1: to SŁABSZA strona szuka porozumienia)');

  // Perspektywa ODWROTNA — te same dwie strony, zamienione role.
  const rev = eng.buildContext(empireId, 'player', { verb: 'trade_agreement' });
  assert(rev.strength.self === ctx.strength.other && rev.strength.other === ctx.strength.self,
    'T5: zamiana ról zamienia pola — perspektywa jest OCENIAJĄCEGO, nie gracza');
  assert(approx(term(rev), -term(ctx)),
    'T5: …i odwraca znak wkładu (symetria pary, wymóg D5 dla AI↔AI)');

  // Brak modułu ⇒ null ⇒ degradacja. Ta ścieżka jest ŚWIADOMA (decyzja 5), nie cichym no-opem.
  const savedTa = window.KOSMOS.threatAssessment;
  try {
    window.KOSMOS.threatAssessment = undefined;
    const bare = new AcceptanceEngine().buildContext('player', empireId, { verb: 'trade_agreement' });
    assert(bare.strength === null, 'T5: bez ThreatAssessment pole `strength` jest null (nie rzuca)');
    assert(term(bare) === 0, 'T5: …a term degraduje do 0');
  } finally {
    window.KOSMOS.threatAssessment = savedTa;
  }
}

// ── T6 — katalog: LIVE i ani jednego stubu ──────────────────────────────────
console.log('T6 — katalog termów: relative_power LIVE, zero stubów');
{
  assert(ACCEPTANCE_TERMS.relative_power.status === TERM_STATUS.LIVE,
    'T6: status katalogu = LIVE');
  assert(Object.values(ACCEPTANCE_TERMS).every(t => t.status !== TERM_STATUS.STUB),
    'T6: w katalogu NIE MA już ani jednego termu STUB — to był ostatni');
  assert(/ThreatAssessment/.test(ACCEPTANCE_TERMS.relative_power.note),
    'T6: nota wskazuje ŹRÓDŁO danych (ThreatAssessment), nie tylko fakt odblokowania');
  // `third_party` ZOSTAJE bezczynny do D5 — pilnujemy, żeby nikt go nie „odblokował" przy okazji.
  assert(ACCEPTANCE_TERMS.third_party.status === TERM_STATUS.PARTIAL,
    'T6: third_party NADAL PARTIAL (pary AI↔AI dopiero w D5) — W1-3 go nie dotknął');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
