// D2/E2 (WOJNA I POKÓJ 1.0) — smoke: retrofit trzech traktatów na Acceptance Engine.
// Uruchom: node src/testing/smoke/acceptance_retrofit_smoke.mjs
//
// Para do `acceptance_engine_smoke` (tam SILNIK w izolacji, tu SZEW w systemie).
// PARYTET end-to-end pilnują dodatkowo NIETKNIĘTE suity D1 — `diplomacy_d1_smoke`
// przechodzi 83/83 bez jednej poprawki, i to jest mocniejszy dowód niż cokolwiek
// napisane tutaj: te asercje powstały PRZED silnikiem i opisują dawne zachowanie.
//
// Ten plik pilnuje rzeczy, których tamte suity nie widzą:
//   R1 decyzję podejmuje SILNIK (zdarzenia niosą pełny wynik z rozbiciem)
//   R2 PODŁOGA OSOBOWOŚCI odtwarza pierwszą bramkę dawnej koniunkcji
//   R3 próg = dawny próg opinii (10/25/30) — po zdjęciu osobowości z termów
//   R4 panel NIE MA już własnych progów (koniec kopii 65/80/80)
//   R5 mostek `getTrustEquivalent` zniknął z retrofitowanych ścieżek
//   R6 `threatened_by_you` usunięty razem z kluczami i18n (Decyzja 1)

import '../headless/env.js';   // shim window/localStorage/document/THREE (pierwszy!)

const EventBus        = (await import('../../core/EventBus.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { DiplomacySystem } = await import('../../systems/DiplomacySystem.js');
const { OPINION_MODIFIERS } = await import('../../data/OpinionModifierData.js');
const { VERB_ACCEPTANCE, PRECONDITIONS } = await import('../../data/AcceptanceWeightData.js');
const { ARCHETYPES } = await import('../../data/EmpireData.js');
const plDict = (await import('../../i18n/pl.js')).default;
const enDict = (await import('../../i18n/en.js')).default;
const { readFileSync } = await import('node:fs');
const { resolve, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── Scaffold ────────────────────────────────────────────────────────────────
GAME_CONFIG.FEATURES.lightDiplomacy = true;
GAME_CONFIG.FEATURES.diplomacyDecay = false;

const empires = new Map();
const timeSys = { gameTime: 0 };
window.KOSMOS = {
  timeSystem: timeSys,
  empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
  galaxyData: { seed: 12345, systems: [] },
};
const dipl = new DiplomacySystem();
window.KOSMOS.diplomacySystem = dipl;

/** Imperium o WEKTORZE archetypu z katalogu — nie zmyślamy osobowości. */
const addEmpire = (id, archetype) => {
  empires.set(id, { id, name: id, archetype, personality: { ...ARCHETYPES[archetype].personality }, objective: 'merchant', traits: [] });
  return id;
};
const seedOpinion = (id, value) => dipl.addOpinionModifier(id, 'player', 'legacy_relations', { value, source: 'test' });

// ── R1: decyzję podejmuje silnik ────────────────────────────────────────────
console.log('--- R1: proposeTreaty przechodzi przez Acceptance Engine ---');
{
  addEmpire('emp_r1', 'industrialist');
  seedOpinion('emp_r1', 10);
  let accepted = null, rejected = null;
  const offA = EventBus.on('diplomacy:treatyAccepted', (e) => { accepted = e; });
  const offR = EventBus.on('diplomacy:treatyRejected', (e) => { rejected = e; });

  ok('evaluateTreaty ocenia BEZ składania propozycji', (() => {
    const r = dipl.evaluateTreaty('emp_r1', 'trade_agreement');
    return r.decision === true && !dipl.hasTreaty('emp_r1', 'trade_agreement');
  })());
  ok('propozycja przyjęta, zdarzenie niesie PEŁNY wynik silnika',
    dipl.proposeTreaty('emp_r1', 'trade_agreement') === true
    && accepted?.result?.score >= accepted?.result?.threshold
    && Array.isArray(accepted.result.breakdown) && accepted.result.breakdown.length > 0);
  ok('rozbicie niesie klucze i18n termów (E4 renderuje je dosłownie)',
    accepted.result.breakdown.every(r => String(r.labelKey).startsWith('diplo.term.')));

  addEmpire('emp_r1b', 'industrialist');
  seedOpinion('emp_r1b', 5);
  ok('propozycja odrzucona punktami → reason `declined` + rozbicie w zdarzeniu',
    dipl.proposeTreaty('emp_r1b', 'trade_agreement') === false
    && rejected.reason === 'declined' && rejected.result.decision === false
    && rejected.result.breakdown.length > 0);
  ok('odmowa punktowa niesie counterHint (emitowany, konsument w przyszłości)',
    rejected.result.counterHint === null || rejected.result.counterHint.addOffer.credits > 0);

  ok('traktat już podpisany → dawny reason `already_signed`, BEZ rozbicia', (() => {
    dipl.proposeTreaty('emp_r1', 'trade_agreement');
    return rejected.reason === 'already_signed' && rejected.result.blocked === true
      && rejected.result.breakdown.length === 0;
  })());
  ok('stan wojny → dawny reason `at_war`', (() => {
    addEmpire('emp_r1c', 'industrialist');
    dipl.declareWar('emp_r1c', 'player_action');
    return dipl.proposeTreaty('emp_r1c', 'trade_agreement') === false && rejected.reason === 'at_war';
  })());
  if (typeof offA === 'function') offA();
  if (typeof offR === 'function') offR();
}

// ── R2: podłoga osobowości = pierwsza bramka dawnej koniunkcji ──────────────
console.log('--- R2: podłoga osobowości ---');
{
  // Dawniej: `pers.trade >= 0.5` / `pers.aggression <= 0.4` / `<= 0.3`.
  // Xenofag (trade 0.1, aggression 0.9) nie przechodził ŻADNEJ — i dalej nie przechodzi,
  // przy DOWOLNEJ opinii. To jest parytet, nie nowa surowość.
  addEmpire('emp_xeno', 'xenophage');
  seedOpinion('emp_xeno', 100);
  for (const verb of ['trade_agreement', 'non_aggression', 'alliance']) {
    const r = dipl.evaluateTreaty('emp_xeno', verb);
    ok(`xenofag: ${verb} zablokowany podłogą mimo opinii 100`,
      r.blocked === true && r.reasonKey === PRECONDITIONS.personality_floor.reasonKey);
  }
  ok('podłoga blokuje TWARDO — bez rozbicia i bez wyniku (oceny nie było)',
    dipl.evaluateTreaty('emp_xeno', 'alliance').breakdown.length === 0);
  ok('rój (trade 0.0) też odbija się od podłogi umowy handlowej', (() => {
    addEmpire('emp_swarm', 'swarm');
    seedOpinion('emp_swarm', 100);
    return dipl.evaluateTreaty('emp_swarm', 'trade_agreement').blocked === true;
  })());
  ok('handlarz (trade 0.9, aggression 0.3) przechodzi WSZYSTKIE podłogi', (() => {
    addEmpire('emp_trader', 'trader');
    seedOpinion('emp_trader', 100);
    return ['trade_agreement', 'non_aggression', 'alliance']
      .every(v => dipl.evaluateTreaty('emp_trader', v).blocked === false);
  })());
  ok('każdy traktat deklaruje podłogę na ISTNIEJĄCEJ osi wektora osobowości',
    ['trade_agreement', 'non_aggression', 'alliance'].every(v => {
      const f = VERB_ACCEPTANCE[v].personalityFloor;
      return f && Object.prototype.hasOwnProperty.call(ARCHETYPES.industrialist.personality, f.axis);
    }));
  ok('powód „natura nie pozwala" ma klucz i18n w pl i en',
    !!plDict['diplo.reject.natureForbids'] && !!enDict['diplo.reject.natureForbids']
    && plDict['diplo.reject.natureForbids'] !== enDict['diplo.reject.natureForbids']);
}

// ── R3: próg = DAWNY próg opinii ────────────────────────────────────────────
console.log('--- R3: granice decyzji = dawne progi 60/75/80 ---');
{
  // Dawny mostek: trust = 50 + opinia ⇒ progi 60/75/80 to opinia 10/25/30.
  const boundary = (verb, want) => {
    const id = `emp_b_${verb}`;
    addEmpire(id, 'industrialist');
    seedOpinion(id, want);
    ok(`${verb}: opinia ${want} PRZECHODZI (dawny próg)`, dipl.evaluateTreaty(id, verb).decision === true);
    seedOpinion(id, want - 1);
    ok(`${verb}: opinia ${want - 1} ODPADA (punkt poniżej dawnego progu)`, dipl.evaluateTreaty(id, verb).decision === false);
  };
  boundary('trade_agreement', 10);
  boundary('non_aggression', 25);
  boundary('alliance', 30);
  ok('osobowość NIE jest już termem traktatów (jest podłogą)',
    ['trade_agreement', 'non_aggression', 'alliance']
      .every(v => VERB_ACCEPTANCE[v].terms.personality == null));
  ok('progi są wprost dawnymi progami opinii × waga/100',
    VERB_ACCEPTANCE.trade_agreement.threshold === 10 * VERB_ACCEPTANCE.trade_agreement.terms.opinion / 100
    && VERB_ACCEPTANCE.non_aggression.threshold === 25 * VERB_ACCEPTANCE.non_aggression.terms.opinion / 100
    && VERB_ACCEPTANCE.alliance.threshold === 30 * VERB_ACCEPTANCE.alliance.terms.opinion / 100);
  ok('pokój i emisariusz ZACHOWUJĄ osobowość jako term (brak dawnej reguły do odtworzenia)',
    VERB_ACCEPTANCE.offer_peace.terms.personality > 0
    && VERB_ACCEPTANCE.improve_relations.terms.personality > 0);
}

// ── R4/R5: koniec drugiej kopii progów i mostka ─────────────────────────────
console.log('--- R4/R5: panel bez własnych progów, mostek zdjęty ze ścieżek ---');
{
  const overlaySrc = readFileSync(resolve(SRC, 'ui/DiplomacyOverlay.js'), 'utf8');
  ok('panel NIE trzyma już progów 65/80/80', !/trustEq\s*>=\s*(65|80)/.test(overlaySrc));
  ok('panel NIE woła mostka getTrustEquivalent', !/getTrustEquivalent/.test(overlaySrc));
  ok('panel pyta o dostępność SILNIK (evaluateTreaty)', /evaluateTreaty/.test(overlaySrc));

  const systemSrc = readFileSync(resolve(SRC, 'systems/DiplomacySystem.js'), 'utf8');
  const proposeBody = systemSrc.slice(systemSrc.indexOf('proposeTreaty(empireId, treatyId)'));
  ok('proposeTreaty NIE zawiera już inline progów 60/75/80',
    !/>=\s*60|>=\s*75|>=\s*80/.test(proposeBody.slice(0, 1400)));
  ok('proposeTreaty NIE woła mostka', !/getTrustEquivalent/.test(proposeBody.slice(0, 1400)));

  const sceneSrc = readFileSync(resolve(SRC, 'scenes/GameScene.js'), 'utf8');
  ok('zrzut diagnostyczny GameScene NIE woła już mostka', !/getTrustEquivalent/.test(sceneSrc));

  // Mostek nadal ISTNIEJE — ma dokładnie jednego konsumenta (bramka AI-envoy), znika w E3.
  ok('mostek wciąż istnieje jako metoda (ostatni konsument = AlienCivSystem, E3)',
    typeof dipl.getTrustEquivalent === 'function');
  const alienSrc = readFileSync(resolve(SRC, 'systems/AlienCivSystem.js'), 'utf8');
  ok('JEDYNY pozostały wołający mostka to AlienCivSystem (do zdjęcia w E3)',
    /getTrustEquivalent/.test(alienSrc));
}

// ── R6: Decyzja 1 wykonana ──────────────────────────────────────────────────
console.log('--- R6: threatened_by_you usunięty (napięcie liczy TERM) ---');
{
  ok('wpis zniknął z katalogu modyfikatorów', OPINION_MODIFIERS.threatened_by_you === undefined);
  ok('klucze i18n zniknęły z pl i en',
    plDict['diplo.mod.threatenedByYou'] === undefined && enDict['diplo.mod.threatenedByYou'] === undefined);
  ok('dodanie modyfikatora po nazwie RZUCA (nie wraca tylnymi drzwiami)', (() => {
    let threw = false;
    try { dipl.addOpinionModifier('emp_r1', 'player', 'threatened_by_you'); } catch { threw = true; }
    return threw;
  })());
  ok('napięcie wchodzi do decyzji jako TERM — i ma znak zależny od czasownika',
    VERB_ACCEPTANCE.non_aggression.terms.tension > 0 && VERB_ACCEPTANCE.alliance.terms.tension < 0);
  ok('napięcie REALNIE przesuwa wynik paktu (a nie tylko siedzi w katalogu)', (() => {
    addEmpire('emp_tens', 'industrialist');
    seedOpinion('emp_tens', 20);
    const calm = dipl.evaluateTreaty('emp_tens', 'non_aggression').score;
    dipl.relations.setTension('player', 'emp_tens', 80, 'test');
    const tense = dipl.evaluateTreaty('emp_tens', 'non_aggression').score;
    return tense > calm;
  })());
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
