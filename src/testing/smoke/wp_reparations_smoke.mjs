// WP-R / C1 — keeper REPARACJI (D-WPR-1..6, silnik).
//
// PO CO: D-WP-1 podpisał reparacje jako BLOKADĘ PRODUKCJI WOJENNEJ AI, nie kredyty („AI płaci"
// odrzucone jako fikcja). Ten keeper pilnuje trzech rzeczy naraz: że warunek DOJEŻDŻA do oceny,
// że wykonanie stawia timer TYLKO na żądanie gracza, i że blokada realnie zamyka OBIE drogi AI
// do nowej siły bojowej.
//
// ⚠ DRÓG JEST DWIE, I TO JEST SEDNO D-WPR-1 (zmierzone w fazie A):
//   (1) PRODUKCJA — `pressureResponse` → `queueWarships` → `startShipBuild`. To JEDYNA
//       produkcyjna ścieżka okrętu wojennego AI w normalnej grze (kurier `EmpireLogisticsSystem`
//       buduje `hull_small` z ładownią; do `queueStationShip` AI nie sięga wcale, a jego stacja
//       powstaje `starterModules: false` — jest ŻETONEM, nie fabryką).
//   (2) MOBILIZACJA — każdy kadłub AI schodzi ze stoczni do REZERWY (`serviceState: 'stored'`),
//       a `mobilize_reserve` obsadza go załogą. Reguła ma guard `empireOutgunnedByPlayer`, więc
//       odpala DOKŁADNIE wtedy, gdy gracz jest silniejszy — czyli tuż po wygranej wojnie.
//   Zablokowanie samej (1) znaczyłoby: „nie wolno wam budować, ale wolno uzbroić wszystko, co
//   macie" — i to w jedynym momencie, w którym (2) i tak by odpaliła.
//
// ⚠ OBA ODCZYTY DYPLOMACJI SĄ FAIL-OPEN i to jest rozstrzygnięcie pomiarowe, nie ostrożność:
//   CZTERY keepery Directora nie wpinają `diplomacySystem`, a rzucenie (wzór
//   `empireNotAtWarWithPlayer`) zamieniłoby „fixture bez warstwy dyplomacji" w „produkcja
//   niemożliwa". Blokada musi być POZYTYWNYM stwierdzeniem, nigdy wnioskiem z nieobecności (T7d/T8e).
//
// ⚠ LICZNIK EKSPORTÓW pliku balansu (14 → 15) pinuje `wp_treaty_slot` T5e i TYLKO ON — reguła
//   z close-outu DS-1: pin na liczbie eksportów WSPÓLNEGO pliku ma DOKŁADNIE JEDNEGO właściciela.
//
// Uruchom: node src/testing/smoke/wp_reparations_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { AcceptanceEngine, TERM_EVALUATORS } from '../../systems/diplomacy/AcceptanceEngine.js';
import { VERB_ACCEPTANCE, ACCEPTANCE_TERMS, TERRITORIAL_FATIGUE_RELIEF } from '../../data/AcceptanceWeightData.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { DirectorGuards } from '../../systems/director/DirectorRegistry.js';
import DirectorProduction from '../../systems/director/DirectorProduction.js';
import DirectorMobilization, { registerMobilizationBehaviors } from '../../systems/director/DirectorMobilization.js';

// ⚠ NAMESPACE + `?? null`: `REPARATIONS_YEARS` RODZI SIĘ w tym commicie, a fail-first biegnie na
//   kotwicy — statyczny import nieistniejącego eksportu wywala plik na linkowaniu ESM i ŻADEN pin
//   nie dostaje koloru, także zielone kontrole (lekcja „pin musi DEGRADOWAĆ, nie PRZERYWAĆ").
import * as OMD from '../../data/OpinionModifierData.js';
const REPARATIONS_YEARS = OMD.REPARATIONS_YEARS ?? null;
const YEARS = REPARATIONS_YEARS ?? 10;          // do arytmetyki, żeby reszta pinów liczyła

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
/** Wywołanie, które DEGRADUJE do `undefined` zamiast zabijać przebieg. */
const call = (obj, m, ...a) => (typeof obj?.[m] === 'function' ? obj[m](...a) : undefined);

// ── Piny źródłowe ───────────────────────────────────────────────────────────
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));

// ── Świat dyplomatyczny ─────────────────────────────────────────────────────
const empires = new Map(); const colonies = new Map(); const wars = new Map();
function world(year, { exh = 100 } = {}) {
  empires.clear(); colonies.clear(); wars.clear();
  gameState.reset?.(); EventBus.clear?.();
  window.KOSMOS = {
    timeSystem: { gameTime: year },
    empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
    galaxyData: { seed: 4242, systems: [] },
    intelSystem: { getLevel: () => 'contact', isAtLeast: () => true },
    colonyManager: { getColony: (id) => colonies.get(id), getAllColonies: () => [...colonies.values()] },
    warSystem: { getWarWith: (id) => wars.get(id) ?? null, getCaptures: () => [] },
  };
  empires.set('emp_001', { id: 'emp_001', name: 'Liga', archetype: 'militarist',
    personality: { aggression: 0.3, trade: 0.5 }, traits: [], colonies: [] });
  wars.set('emp_001', { id: 'w1', aggressor: 'player', defender: 'emp_001', active: true,
    casusBelli: 'border_incident', exhaustion: { player: exh, emp_001: exh }, captures: [] });
  const dipl = new DiplomacySystem();
  window.KOSMOS.diplomacySystem = dipl;
  dipl.relations.setStatus('player', 'emp_001', 'war', {}, 'fixture');
  return dipl;
}
const REP = (years = YEARS) => ({ reparations: { years } });
const rowOf = (r, term) => (r?.breakdown ?? []).find(b => b?.term === term) ?? null;
const valOf = (r, term) => Number(rowOf(r, term)?.value ?? NaN);

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — stała i waga: jedno źródło, wartości podpisane');
{
  assert(REPARATIONS_YEARS === 10,
    'T1a: `REPARATIONS_YEARS` istnieje w pliku balansu i wynosi 10 (jest: ' + REPARATIONS_YEARS + ')');
  assert(OMD.NAP_YEARS === REPARATIONS_YEARS && OMD.TRUCE_YEARS === REPARATIONS_YEARS,
    'T1b: JEDEN ZEGAR z paktem i rozejmem (D-WPR-2) — wszystkie trzy po ' + OMD.NAP_YEARS + ' lat');
  assert(VERB_ACCEPTANCE.offer_peace.terms.reparations === 25,
    'T1c: waga termu w katalogu = 25 (jest: ' + VERB_ACCEPTANCE.offer_peace.terms.reparations + ')');
  assert(ACCEPTANCE_TERMS.reparations?.labelKey === 'diplo.term.reparations',
    'T1d: term ma wpis w `ACCEPTANCE_TERMS` z kluczem etykiety (modal odmowy renderuje `labelKey`)');
  const verbsWithRep = Object.entries(VERB_ACCEPTANCE)
    .filter(([, v]) => v.terms?.reparations != null).map(([k]) => k);
  assert(verbsWithRep.length === 1 && verbsWithRep[0] === 'offer_peace',
    'T1e: DOKŁADNIE jeden czasownik zna ten term (' + verbsWithRep.join(', ')
    + ') — reparacje są warunkiem POKOJU, nie uniwersalną gałką');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — term: raw ∝ lata, ulga wyczerpania, NIGDY dodatni');
{
  const f = TERM_EVALUATORS.reparations;
  assert(typeof f === 'function', 'T2a: ewaluator termu ISTNIEJE — jest co mierzyć');
  const ctx = (years, exh) => ({ terms: years > 0 ? { reparations: { years } } : null,
    war: { exhaustionSelf: exh, peaceCost: 30 } });
  assert(f && f(ctx(0, 30)) === 0 && f(ctx(YEARS, 30)) === -1,
    'T2b: brak warunku → 0; pełne ' + YEARS + ' lat bez ulgi → −1 (jest: '
    + (f ? f(ctx(YEARS, 30)) : NaN) + ')');
  assert(f && Math.abs(f(ctx(YEARS / 2, 30)) - (-0.5)) < 1e-9,
    'T2c: raw jest PROPORCJONALNY do lat — połowa terminu boli połowę (' + (f ? f(ctx(YEARS / 2, 30)) : NaN) + ')');
  const relief100 = Math.max(0, Math.min(1, (100 - 30) / 100)) * TERRITORIAL_FATIGUE_RELIEF;
  assert(f && Math.abs(f(ctx(YEARS, 100)) - (-(1 - relief100))) < 1e-9,
    'T2d: ULGA WYCZERPANIA liczona TĄ SAMĄ formułą co `territorial_terms` (' + (f ? f(ctx(YEARS, 100)) : NaN)
    + ' przy uldze ' + relief100.toFixed(2) + ')');
  assert(f && f(ctx(YEARS * 10, 30)) === -1,
    'T2e: raw CLAMPOWANY — dziesięciokrotny termin nie robi z termu weta (' + (f ? f(ctx(YEARS * 10, 30)) : NaN) + ')');
  const anyPositive = [0, 1, YEARS, YEARS * 5].some(y => [0, 30, 50, 100].some(e => (f ? f(ctx(y, e)) : 0) > 0));
  assert(f && anyPositive === false,
    'T2f: term NIGDY nie jest dodatni — reparacji żąda wyłącznie gracz (D-WPR-5), więc nie ma gałęzi zysku');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — tabela decyzyjna z fazy A odtworzona PRAWDZIWĄ oceną');
{
  const expect = { 30: [10.00, -15.00, false], 50: [21.00, -1.50, false], 100: [48.50, 32.25, true] };
  for (const exh of [30, 50, 100]) {
    const dipl = world(600, { exh });
    const bare = dipl.evaluatePeace('emp_001', null);
    const rep = dipl.evaluatePeace('emp_001', REP());
    const [eBare, eRep, eDec] = expect[exh];
    // ⚠ KONTROLA mierzy WYŁĄCZNIE tło — ta liczba jest prawdą po OBU stronach naprawy,
    //   bo term bez warunku nic nie wnosi. „Wiersz termu jest zerowy” to już stwierdzenie
    //   o ISTNIENIU termu, więc należy do pinu naprawy (T3b), nie do kontroli.
    assert(Math.abs(bare.score - eBare) < 0.01,
      'T3a[exh ' + exh + '] (KONTROLA PINU): tło bez warunku = ' + eBare + ' (jest: '
      + bare.score.toFixed(2) + ') — jest od czego odejmować');
    assert(valOf(bare, 'reparations') === 0 && Math.abs(rep.score - eRep) < 0.01
      && rep.decision === eDec,
      'T3b[exh ' + exh + ']: wiersz termu bez warunku ZEROWY, a z reparacjami ' + eRep
      + ' / decyzja ' + eDec + ' (jest: ' + rep.score.toFixed(2) + ' / ' + rep.decision + ')');
  }
  // ⚠ Sedno kalibracji: NIE weto. Rozbite AI musi móc zakończyć wojnę mimo reparacji.
  const d100 = world(600, { exh: 100 });
  const rep100 = d100.evaluatePeace('emp_001', REP());
  // ⚠ ŚWIADEK `value < 0`: bez niego pin przechodzi JAŁOWO na drzewie, na którym termu NIE MA
  //   (decyzja jest wtedy `true`, bo nic nie odjęto). Zmierzone fail-firstem.
  assert(valOf(rep100, 'reparations') < 0 && rep100.decision === true,
    'T3c: przy exh 100 term REALNIE odejmuje (' + valOf(rep100, 'reparations').toFixed(2)
    + '), a pokój i tak przechodzi — waga 25 NIE jest wetem, więc rozbite imperium nigdy '
    + 'nie zablokuje zakończenia wojny o ten warunek');
  const d30 = world(600, { exh: 30 });
  assert(d30.evaluatePeace('emp_001', null).decision === true
    && d30.evaluatePeace('emp_001', REP()).decision === false,
    'T3d: przy exh 30 (= peaceCost) sam pokój przechodzi, a pokój Z REPARACJAMI już nie — '
    + 'przewrót leży POWYŻEJ minimum pokoju, czyli tam, gdzie go podpisano');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — `_buildTermsContext`: same reparacje MUSZĄ dojechać do oceny');
{
  const dipl = world(600, { exh: 50 });
  const eng = new AcceptanceEngine();
  const bare = eng.buildContext('player', 'emp_001', { verb: 'offer_peace' });
  assert(bare.terms === null,
    'T4a (KONTROLA PINU): propozycja BEZ warunków nadal daje `terms === null` — regresja zero '
    + '(to jest pin `wp_peace_seams` T1c2 i ma zostać prawdziwy)');
  const repOnly = eng.buildContext('player', 'emp_001', { verb: 'offer_peace', terms: REP() });
  assert(repOnly.terms != null && repOnly.terms.reparations?.years === YEARS,
    'T4b: propozycja z SAMYMI reparacjami daje kontekst z warunkiem ('
    + JSON.stringify(repOnly.terms) + ') — to był JEDYNY realny defekt znaleziony w fazie A');
  assert(Array.isArray(repOnly.terms?.cessions) && repOnly.terms.cessions.length === 0,
    'T4c: … z PUSTĄ listą cesji, więc `territorial_terms` zwraca 0, a oba pre-warunki '
    + 'terytorialne wychodzą wczesnym `true`');
  const repEval = new DiplomacySystem().evaluatePeace ? dipl.evaluatePeace('emp_001', REP()) : null;
  // ⚠ ŚWIADEK: wiersz REPARACJI musi być niezerowy — inaczej „nie jest blokowana, a terytorialny
  //   zerowy” jest prawdą także tam, gdzie warunek w ogóle nie dojechał do oceny.
  assert(repEval && repEval.blocked !== true && valOf(repEval, 'reparations') < 0
    && valOf(repEval, 'territorial_terms') === 0,
    'T4d: ocena pokoju z SAMYMI reparacjami nie jest blokowana, wiersz reparacji LICZY ('
    + valOf(repEval, 'reparations').toFixed(2) + '), a terytorialny jest zerowy');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT5 — wykonanie: timer TYLKO na żądanie gracza (D-WP-13)');
{
  const dipl = world(700, { exh: 100 });
  const imposed = []; EventBus.on('diplomacy:reparationsImposed', (p) => imposed.push(p));
  assert(dipl.offerPeace('emp_001', 'probe', { terms: null }) === true,
    'T5a (KONTROLA PINU): pokój STATUS QUO przechodzi — jest co porównać');
  assert(call(dipl, 'getReparationsYearsLeft', 'emp_001') === 0 && imposed.length === 0,
    'T5b: … i NIE ustawia timera ani nie emituje zdarzenia (D-WP-13: blokada jest zawsze CZYNNYM '
    + 'żądaniem gracza, nigdy skutkiem ubocznym pokoju — tą samą ścieżką idzie akceptacja depeszy AI)');

  const d2 = world(800, { exh: 100 });
  const imposed2 = []; EventBus.on('diplomacy:reparationsImposed', (p) => imposed2.push(p));
  const ok = d2.offerPeace('emp_001', 'probe', { terms: REP() });
  assert(ok === true && call(d2, 'getReparationsYearsLeft', 'emp_001') === YEARS,
    'T5c: pokój Z REPARACJAMI przechodzi i nakłada ' + YEARS + ' lat blokady (jest: '
    + call(d2, 'getReparationsYearsLeft', 'emp_001') + ')');
  assert(ok === true && imposed2.length === 1 && imposed2[0].untilYear === 800 + YEARS,
    'T5d: DOKŁADNIE jedno `diplomacy:reparationsImposed` z rokiem końca ('
    + JSON.stringify(imposed2[0]) + ')');
  assert(ok === true && call(d2, 'isUnderReparations', 'emp_001') === true,
    'T5e: `isUnderReparations` — JEDNO źródło odpowiedzi dla obu bramek — mówi TAK');
  assert(ok === true && d2.getStatus('emp_001') === 'truce'
    && d2.hasTreaty('emp_001', 'non_aggression'),
    'T5f (KONTROLA PINU): reszta pokoju NIETKNIĘTA — rozejm stoi i wymuszony NAP jest podpisany');

  // Round-trip: pole pary jedzie za darmo, bez migracji (v101).
  const blob = JSON.parse(JSON.stringify(gameState.serialize()));
  gameState.reset?.(); gameState.restore(blob);
  const d3 = new DiplomacySystem(); window.KOSMOS.diplomacySystem = d3;
  assert(call(d3, 'getReparationsYearsLeft', 'emp_001') === YEARS,
    'T5g: blokada PRZEŻYWA round-trip zapisu — pole jedzie w rekordzie pary, zero migracji (v101)');

  // Stary zapis: rekord BEZ pola czyta się jako brak blokady.
  const key = d3.relations.key('player', 'emp_001');
  const rel = gameState.get('diplomacy.relations')[key];
  const { reparationsUntilYear, ...stripped } = rel;
  gameState.set('diplomacy.relations.' + key, stripped, 'test_old_shape');
  assert(reparationsUntilYear === 800 + YEARS
    && call(d3, 'getReparationsYearsLeft', 'emp_001') === 0
    && call(d3, 'isUnderReparations', 'emp_001') === false,
    'T5h: rekord ze STAREGO zapisu (bez pola) czyta się jako BRAK blokady — `?? null`, bez bumpu wersji');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT6 — ticker: gaśnie RAZ, czyści pole, drugi tik milczy');
{
  const dipl = world(900, { exh: 100 });
  dipl.offerPeace('emp_001', 'probe', { terms: REP() });
  assert(call(dipl, 'isUnderReparations', 'emp_001') === true,
    'T6a: blokada stoi przed przewinięciem zegara — jest co wygaszać');
  const expired = []; EventBus.on('diplomacy:reparationsExpired', (p) => expired.push(p));
  const tick = () => EventBus.emit('time:tick',
    { deltaYears: 1 / GAME_CONFIG.CIV_TIME_SCALE, civDeltaYears: 1 });

  window.KOSMOS.timeSystem.gameTime = 900 + YEARS - 1;
  for (let i = 0; i < 13; i++) tick();
  assert(expired.length === 0 && call(dipl, 'isUnderReparations', 'emp_001') === true,
    'T6b: rok PRZED końcem — cisza, blokada trwa (' + expired.length + ' zdarzeń)');

  window.KOSMOS.timeSystem.gameTime = 900 + YEARS + 0.1;
  for (let i = 0; i < 13; i++) tick();
  assert(expired.length === 1 && expired[0].empireId === 'emp_001',
    'T6c: po terminie DOKŁADNIE jedno `diplomacy:reparationsExpired` (' + expired.length + ')');
  assert(call(dipl.relations, 'getReparationsUntilYear', 'player', 'emp_001') === null
    && call(dipl, 'isUnderReparations', 'emp_001') === false,
    'T6d: pole WYCZYSZCZONE, nie zostawione z przeszłym rokiem — martwy termin w zapisie byłby '
    + 'dokładnie tym „lustrem stanu", przed którym ostrzega arc 186/187');
  for (let i = 0; i < 13; i++) tick();
  assert(expired.length === 1,
    'T6e: kolejne tiki MILCZĄ (' + expired.length + ') — beat nie powtarza się co rok');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT7 — DROGA 1: produkcja okrętów (`queueWarships`)');
{
  const capital = {
    planetId: 'p_cap', isOutpost: false, ownerEmpireId: 'emp_001',
    techSystem: { isResearched: () => true },
    resourceSystem: { getAmount: () => 0, canAfford: () => true, spend: () => {} },
    civSystem: { freePops: 20, convertToStrata: () => {}, lockPops: () => {} },
    shipQueues: [], pendingShipOrders: [],
    factorySystem: { setDemandBonus: () => {}, getSafetyStockTarget: () => 0,
      isKnownCommodity: () => true, setMode: () => {} },
  };
  const built = [];
  const standProd = (shipyard = 2) => {
    window.KOSMOS = {
      timeSystem: { gameTime: 1000 },
      empireRegistry: {
        getColoniesByEmpire: (id) => (id === 'emp_001' ? [capital] : []),
        get: (id) => ({ id, archetype: 'industrialist' }),
      },
      colonyManager: {
        _getShipyardLevel: () => shipyard,
        getAllColonies: () => [capital],
        getColony: (id) => (id === capital.planetId ? capital : null),
        startShipBuild: (planetId, shipId, modules) => { built.push({ shipId, modules }); return { ok: true }; },
      },
      stationSystem: { getAllStations: () => [{ id: 'st', ownerEmpireId: 'emp_001' }] },
    };
  };
  const prod = new DirectorProduction();
  const order = (template = 'frigate_laser_escort') =>
    prod.queueWarships({ empireId: 'emp_001', empire: { archetype: 'industrialist' } },
      { template, count: 1 });

  standProd();
  const before = order();
  assert(before?.ok === true && built.length === 1,
    'T7a (KONTROLA PINU): BEZ reparacji produkcja przechodzi (' + JSON.stringify(before) + ') — '
    + 'fixture jest sprawny, więc odmowa niżej będzie o reparacjach, nie o zepsutym stanowisku');

  // Reparacje: dokładamy WYŁĄCZNIE warstwę dyplomacji, reszta stanowiska bez zmian.
  window.KOSMOS.diplomacySystem = { isUnderReparations: (id) => id === 'emp_001' };
  const rejected = [];
  EventBus.on('director:shipRejected', (p) => rejected.push(p));
  const builtBefore = built.length;
  const res = order();
  assert(res?.ok === false && res.reason === 'reparations',
    'T7b: Z REPARACJAMI `queueWarships` ODMAWIA z powodem `reparations` (' + JSON.stringify(res) + ')');
  assert(built.length === builtBefore,
    'T7c: … i NIC nie trafia do stoczni (' + builtBefore + ' → ' + built.length + ')');
  assert(rejected.length === 1 && rejected[0].reason === 'reparations',
    'T7d: odmowa leci istniejącym kanałem `director:shipRejected` — zero nowej diagnostyki');

  // KOLEJNOŚĆ DIAGNOZY: braki STRUKTURALNE przed bramką POLITYCZNĄ.
  window.KOSMOS.colonyManager._getShipyardLevel = () => 0;
  assert(order()?.reason === 'no_shipyard',
    'T7e (KONTROLA PINU): imperium BEZ stoczni słyszy `no_shipyard`, nie `reparations` — kolejność sprawdzeń = '
    + 'kolejność diagnozy (reason ma odtwarzać realną ścieżkę, nie kolejność dopisywania guardów)');
  window.KOSMOS.colonyManager._getShipyardLevel = () => 2;
  window.KOSMOS.stationSystem = { getAllStations: () => [] };
  assert(order()?.reason === 'reparations',
    'T7f: … ale reparacje wyprzedzają ŻETON stacji — bramka stoi między `no_shipyard` '
    + 'a `no_orbital_station`, dokładnie jak podpisano');

  // FAIL-OPEN: brak warstwy dyplomacji nie jest dowodem, że reparacje trwają.
  standProd();
  window.KOSMOS.diplomacySystem = null;
  const noDipl = order();
  assert(noDipl?.ok === true,
    'T7g: BEZ `diplomacySystem` produkcja idzie dalej (fail-OPEN) — cztery keepery Directora nie '
    + 'wpinają tej warstwy, a rzucenie zamieniłoby fixture w „produkcja niemożliwa"');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT8 — DROGA 2: mobilizacja rezerwy (`mobilize_reserve`)');
{
  assert(Array.isArray(DIRECTOR_RULES.mobilize_reserve?.guard)
    && DIRECTOR_RULES.mobilize_reserve.guard.includes('empireNotUnderReparations'),
    'T8a: reguła katalogu ma guard `empireNotUnderReparations` ('
    + (DIRECTOR_RULES.mobilize_reserve?.guard ?? []).join(', ') + ')');
  assert((DIRECTOR_RULES.mobilize_reserve?.guard ?? []).includes('empireOutgunnedByPlayer'),
    'T8b (KONTROLA PINU): stare guardy ZOSTAJĄ — reparacje dokładają warunek, nie zastępują go');

  const mob = new DirectorMobilization();
  registerMobilizationBehaviors(mob, { allowOverride: true });
  const guard = DirectorGuards.has('empireNotUnderReparations')
    ? DirectorGuards.resolve('empireNotUnderReparations') : null;
  // ⚠ Wołanie przez wrapper: na drzewie BEZ guardu `guard(...)` rzuca i zabija CAŁY przebieg,
  //   więc żaden pin niżej nie dostaje koloru (ta sama lekcja co `call()` wyżej).
  const askGuard = () => (typeof guard === 'function' ? guard({ empireId: 'emp_001' }) : undefined);
  assert(typeof guard === 'function', 'T8c: guard jest ZAREJESTROWANY pod nazwą, której żąda katalog reguł');

  const deployed = [];
  const stored = [{ id: 'v1' }, { id: 'v2' }];
  window.KOSMOS = {
    timeSystem: { gameTime: 1000 },
    vesselManager: { deployVessel: (id) => { deployed.push(id); return { ok: true }; } },
    diplomacySystem: { isUnderReparations: () => false },
  };
  mob.storedWarshipsAtCapital = () => stored;        // omijamy rejestr statków — mierzymy BRAMKĘ

  assert(askGuard() === true, 'T8d: guard bez reparacji PRZEPUSZCZA (inaczej blokowałby mobilizację zawsze)');
  mob.mobilizeVessels({ empireId: 'emp_001' }, { count: 2 });
  assert(deployed.length === 2,
    'T8e (KONTROLA PINU): bez reparacji akcja REALNIE obsadza rezerwę (' + deployed.length + ') — '
    + 'inaczej pin niżej mierzyłby martwą ścieżkę');

  window.KOSMOS.diplomacySystem = { isUnderReparations: (id) => id === 'emp_001' };
  const refused = []; EventBus.on('director:mobilizeRejected', (p) => refused.push(p));
  const deployedBefore = deployed.length;
  mob.mobilizeVessels({ empireId: 'emp_001' }, { count: 2 });
  assert(askGuard() === false,
    'T8f: guard Z reparacjami ZAMYKA regułę — rzut i cooldown nie są marnowane');
  assert(deployed.length === deployedBefore,
    'T8g: … a akcja wołana WPROST (devtools, przyszłe reguły) też nie obsadza nikogo ('
    + deployedBefore + ' → ' + deployed.length + ')');
  assert(refused.length === 1 && refused[0].reason === 'reparations',
    'T8h: odmowa jest SŁYSZALNA (`director:mobilizeRejected`) — dla AI nie ma innej powierzchni, '
    + 'więc cisza byłaby nie do odróżnienia od „reguły nikt nie podłączył"');

  window.KOSMOS.diplomacySystem = null;
  assert(askGuard() === true,
    'T8i: BEZ warstwy dyplomacji guard przepuszcza (fail-OPEN) — świadomie INACZEJ niż '
    + '`empireNotAtWarWithPlayer`, który rzuca: tam brak odpowiedzi jest groźny, tu jest odpowiedzią NEGATYWNĄ');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT9 — piny źródłowe: biała lista, audyt, zasięg bramki');
{
  const eng = readClean('systems', 'diplomacy', 'AcceptanceEngine.js');
  const evalBody = eng.slice(eng.indexOf('reparations: (ctx)'), eng.indexOf('reparations: (ctx)') + 600);
  assert(evalBody.length > 0 && /ctx\.terms\?\.reparations/.test(evalBody) && /ctx\.war\?\./.test(evalBody),
    'T9a: ewaluator czyta WYŁĄCZNIE `ctx.terms.reparations` i `ctx.war`');
  assert(evalBody.length > 0 && !/_kosmos|window\.KOSMOS|this\._deps/.test(evalBody),
    'T9b (pin BIAŁEJ LISTY): term NIE sięga po świat, więc `AcceptanceEngine._kosmos()` zostaje '
    + 'NIETKNIĘTE — klucz pominięty w tamtej liście nie rzuca, tylko CICHO degraduje term do zera '
    + '(pułapka, która ugryzła W1-3 i WP-2)');
  const dbg = readClean('core', 'DebugLog.js');
  assert(/'diplomacy:reparationsImposed'/.test(dbg) && /'diplomacy:reparationsExpired'/.test(dbg),
    'T9c: OBA zdarzenia w `TRACKED_EVENTS` — reguła W3: nowy powód odmowy dołącza do audytu '
    + 'w TYM SAMYM commicie');
  const vm = readClean('systems', 'VesselManager.js');
  const mobSrc = readClean('systems', 'director', 'DirectorMobilization.js');
  // ⚠ ŚWIADEK `mobSrc`: „VesselManager nie zna reparacji” jest prawdą także tam, gdzie NIKT
  //   ich nie zna. Pin ma znaczyć „bramka stoi U DECYDENTA, nie u wykonawcy” — więc decydent
  //   musi ją mieć.
  assert(/isUnderReparations/.test(mobSrc) && !/isUnderReparations/.test(vm),
    'T9d: bramkę zna DECYDENT (`DirectorMobilization`), a NIE `VesselManager` — blokada nie '
    + 'dotyka `deployVessel`, bo TAMTĘDY chodzi gracz (D-WPR-1): rozmieszczanie WŁASNEJ floty '
    + 'zostaje wolne');
  const dipl = readClean('systems', 'DiplomacySystem.js');
  const exec = dipl.slice(dipl.indexOf('setReparationsUntilYear(PLAYER, empireId, repUntil'));
  assert(exec.length > 0 && dipl.indexOf('planCessions(terms?.cessions') < dipl.indexOf('setReparationsUntilYear(PLAYER, empireId, repUntil'),
    'T9e: timer stawiany PO re-walidacji cesji — pokój, który się nie wykona, nie zostawia blokady');
}

console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail ? 1 : 0);
