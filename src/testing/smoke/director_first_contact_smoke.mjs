// S5 — keeper łańcucha pierwszego kontaktu (workstream C, Slice 1). Spec testów: §Tests planu.
//
//   T1  rzut NIE startuje poniżej L5 (próg = bramka narracyjna, decyzja 3)
//   T2  jednostka rzutu = rok WYŚWIETLANY (decyzja 2) — silnik honoruje `roll.unit`
//   T3  `once` naprawdę raz — TAKŻE po round-tripie zapisu
//   T4  przelot: spawn → kurs → despawn na wyjściu; kurs przeżywa zapis
//   T5  jeden beat, nie dwa (decyzja 5) + `_reportedVesselSightings` w round-tripie
//   T6  zestrzelenie: modyfikator opinii + wpis pamięci (decyzja 4)
//   T7  katalog + rejestry: reguła waliduje się, nazwy rozwiązywalne, i18n PL+EN

import '../headless/env.js';                 // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { validateRule, rollChancePct } from '../../utils/DirectorRuleMath.js';
import { DirectorSystem } from '../../systems/director/DirectorSystem.js';
import { DirectorProbes, DirectorGuards, DirectorActions } from '../../systems/director/DirectorRegistry.js';
import { OPINION_MODIFIERS } from '../../data/OpinionModifierData.js';
import { DirectorFirstContact, registerFirstContactBehaviors } from '../../systems/director/DirectorFirstContact.js';
import { DirectorPressure, registerPressureBehaviors } from '../../systems/director/DirectorPressure.js';
import { DirectorDoctrine, registerDoctrineBehaviors } from '../../systems/director/DirectorDoctrine.js';
import { DirectorProduction, registerProductionGuards } from '../../systems/director/DirectorProduction.js';
import { DirectorMobilization, registerMobilizationBehaviors } from '../../systems/director/DirectorMobilization.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';

// ⚠ Rejestracja MUSI poprzedzać konstrukcję `DirectorSystem` — walidacja katalogu rozwiązuje
// nazwy i RZUCA na nieznanej (audyt R12). Ta sama kolejność obowiązuje w `GameScene`; test
// złapał ją pierwszy, bo pierwotnie miał ją odwrotnie.
registerFirstContactBehaviors(new DirectorFirstContact(), { allowOverride: true });
// Katalog niesie TAKZE reguly S6 (nacisk L1/L2) — silnik waliduje CALY katalog, wiec ich nazwy
// tez musza byc w rejestrach, inaczej konstrukcja `DirectorSystem` rzuca (audyt R12).
registerPressureBehaviors(new DirectorPressure(), { allowOverride: true });
// W1-5 — katalog ma teraz reguły doktryn, a konstruktor DirectorSystem waliduje KAŻDĄ nazwę
// i RZUCA na nieznanej (decyzja 7). Bez tej rejestracji keeper wywala się na starcie — i to
// jest zachowanie ZAMIERZONE, nie kruchość testu.
registerDoctrineBehaviors(new DirectorDoctrine(), { allowOverride: true });
registerMobilizationBehaviors(new DirectorMobilization(), { allowOverride: true });
// W3-5: katalog niesie regule wyboru celu (`strike_player_target`), wiec jej nazwy TEZ musza
// byc w rejestrach — konstruktor DirectorSystem waliduje CALY katalog i rzuca na nieznanej.
registerOffensiveBehaviors(new DirectorOffensive(), { allowOverride: true });
// W2-7: reguła mobilizacji używa guardu `empireHasFreeCrew` z rejestratora PRODUKCJI,
// więc katalog nie zwaliduje się bez obu rodzin naraz.
registerProductionGuards(new DirectorProduction(), { allowOverride: true });

let pass = 0, fail = 0;
const A = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const codeOnly = (p) => readFileSync(p, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Ciało JEDNEGO subskrybenta — pin nie może być spełniony przez SĄSIEDNI kod (nauka z audytu). */
function handlerBody(src, ev) {
  const i = src.indexOf(`EventBus.on('${ev}'`);
  if (i < 0) return '';
  const next = src.indexOf('EventBus.on(', i + 12);
  return src.slice(i, next > i ? next : src.length);
}

const RULE = DIRECTOR_RULES.first_contact;

// Świat-atrapa: minimum, którego dotyka reguła i akcja.
function stubWorld({ obsLevel = 5, status = 'peace', year = 100 } = {}) {
  const opinions = [], memories = [];
  window.KOSMOS = {
    timeSystem: { gameTime: year },
    observatorySystem: { getMaxObservatoryLevel: () => obsLevel },
    diplomacySystem: {
      getStatus: () => status,
      addOpinionModifier: (ofId, aboutId, modId, opts) => opinions.push({ ofId, aboutId, modId, opts }),
      addMemory: (empireId, type, payload) => memories.push({ empireId, type, payload }),
    },
    empireRegistry: { get: (id) => ({ id, name: 'Kartel Vega', archetype: 'industrialist', personality: { science: 0.5 } }) },
    intelSystem: { advanceIntel: () => {} },
    homePlanet: { id: 'p_home', x: 0, y: 0 },
    vesselManager: { _vessels: new Map(), getVessel(id) { return this._vessels.get(id); } },
  };
  return { opinions, memories };
}

// ── T1/T2/T3 — wyzwalacz, jednostka rzutu, `once` ───────────────────────────
console.log('\nT1/T2/T3: próg L5, jednostka rzutu, „raz na zawsze"');
{
  A(RULE?.trigger?.gte === 5 && RULE.trigger.probe === 'playerObservatoryLevel',
    'T1a: wyzwalacz to obserwatorium ≥ L5');

  gameState.set('director', { rules: {}, pending: {}, flybys: {} }, 'test');
  stubWorld({ obsLevel: 4 });
  let fired = 0;
  const off = (d) => { if (d?.action === 'scienceFlyby') fired++; };
  EventBus.on('director:ruleFired', off);

  const ds = new DirectorSystem();
  for (let i = 0; i < 60; i++) ds.tickEmpire('emp_001', { personality: { science: 1 } });
  A(fired === 0, `T1b: przy L4 reguła NIE odpala nawet po 60 krokach (odpaleń: ${fired})`);

  // T2 — jednostka. `tickEmpire` woła się raz na rok CYWILIZACYJNY (1/12 wyświetlanego),
  // więc bez bramki „jedna próba na rok" 10 prób zeszłoby w 0,83 roku wyświetlanego.
  gameState.set('director', { rules: {}, pending: {}, flybys: {} }, 'test');
  stubWorld({ obsLevel: 5, year: 100 });
  const ds2 = new DirectorSystem();
  for (let i = 0; i < 11; i++) ds2.tickEmpire('emp_002', { personality: { science: 0.5 } });
  const st2 = gameState.get('director.rules.first_contact|emp_002') ?? {};
  A((st2.attempts ?? 0) <= 1,
    `T2a: 11 tików w TYM SAMYM roku wyświetlanym = najwyżej JEDNA próba (było ${st2.attempts ?? 0})`);

  // Rok idzie do przodu → próby przyrastają po jednej na rok.
  for (let y = 101; y <= 105; y++) {
    window.KOSMOS.timeSystem.gameTime = y;
    for (let i = 0; i < 12; i++) ds2.tickEmpire('emp_002', { personality: { science: 0.5 } });
  }
  const st3 = gameState.get('director.rules.first_contact|emp_002') ?? {};
  A((st3.attempts ?? 0) <= 6 || st3.firedOnce === true,
    `T2b: po 5 latach wyświetlanych prób jest ≤ 6, nie 60 (jest ${st3.attempts ?? 0}, firedOnce=${st3.firedOnce})`);
  A(rollChancePct(1, RULE.roll) === 10 && rollChancePct(4, RULE.roll) === 40,
    'T2c: krzywa rzutu 10 % +10 pkt/rok (wartość oczekiwana ~3,7 roku)');
  EventBus.off('director:ruleFired', off);
  EventBus.clear();
}
{
  // T3 — `once` przeżywa round-trip zapisu: stan reguły siedzi w gameState, więc
  // serializacja domeny i jej odtworzenie NIE może odblokować drugiego przelotu.
  gameState.set('director', { rules: {}, pending: {}, flybys: {} }, 'test');
  stubWorld({ obsLevel: 5, year: 200 });
  DirectorActions.register('scienceFlyby', () => {}, { allowOverride: true });
  const ds = new DirectorSystem();
  let firedTotal = 0;
  const h = (d) => { if (d?.ruleId === 'first_contact') firedTotal++; };
  EventBus.on('director:ruleFired', h);
  for (let y = 200; y < 240; y++) {
    window.KOSMOS.timeSystem.gameTime = y;
    ds.tickEmpire('emp_003', { personality: { science: 1 } });
  }
  A(firedTotal === 1, `T3a: reguła odpaliła DOKŁADNIE raz w 40 latach (było ${firedTotal})`);

  const snapshot = JSON.parse(JSON.stringify(gameState.get('director')));
  gameState.set('director', snapshot, 'test_roundtrip');        // symulacja save→load
  const ds2 = new DirectorSystem();
  for (let y = 240; y < 280; y++) {
    window.KOSMOS.timeSystem.gameTime = y;
    ds2.tickEmpire('emp_003', { personality: { science: 1 } });
  }
  A(firedTotal === 1, `T3b: po round-tripie zapisu NIE odpala drugi raz (łącznie ${firedTotal})`);
  EventBus.off('director:ruleFired', h);
  EventBus.clear();
}

// ── T4 — przelot: spawn, kurs, despawn ──────────────────────────────────────
console.log('\nT4: przelot — spawn, kurs przez układ, despawn na wyjściu');
{
  gameState.set('director', { rules: {}, pending: {}, flybys: {} }, 'test');
  stubWorld({ obsLevel: 5, year: 300 });
  const fc = new DirectorFirstContact();
  registerFirstContactBehaviors(fc, { allowOverride: true });

  const id = fc.scienceFlyby({ empireId: 'emp_001', empire: { archetype: 'industrialist' } }, {});
  A(!!id, 'T4a: sonda powstała');
  const v = window.KOSMOS.vesselManager.getVessel(id);
  A(v?.ownerEmpireId === 'emp_001' && v?.isEnemy === true,
    'T4b: własność ostemplowana (statek AI, nie „niczyj" — pułapka isEnemyVessel)');
  A(fc.isFlyby(id) === true, 'T4c: rejestr przelotów zna statek');

  const fb = fc.getFlyby(id);
  A(fb && fb.fromX !== fb.toX, 'T4d: kurs ma dwa różne końce (przelot NA WYLOT, nie postój)');

  // Kurs w gameState, NIE na obiekcie statku — `VesselManager.serialize` ma białą listę pól.
  const VM = codeOnly('src/systems/VesselManager.js');
  A(!/flyby/i.test(VM), 'T4e: kurs NIE jest polem statku (białą listę serializacji ominąłby po cichu)');

  const startX = v.position.x;
  window.KOSMOS.timeSystem.gameTime = 303;
  EventBus.emit('time:tick', { deltaYears: 3 });
  A(v.position.x !== startX, 'T4f: sonda RUSZA się z upływem lat');
  A(window.KOSMOS.vesselManager.getVessel(id), 'T4g: …i w połowie kursu wciąż istnieje');

  window.KOSMOS.timeSystem.gameTime = 307;   // poza endYear (start 300 + 6)
  EventBus.emit('time:tick', { deltaYears: 4 });
  A(!window.KOSMOS.vesselManager.getVessel(id), 'T4h: po wyjściu z układu sonda ZNIKA (despawn)');
  A(fc.isFlyby(id) === false, 'T4i: …i rejestr nie zostaje ze zjawą');
  fc.dispose(); EventBus.clear();
}

// ── T8 — MESH PO WCZYTANIU + lewary gate'u (rozbieżność 1 i punkt 3 z GATE 2) ──
console.log('\nT8: sonda ogłasza ruch kanałem vessel:positionUpdate + lewary');
{
  gameState.set('director', { rules: {}, pending: {}, flybys: {} }, 'test');
  stubWorld({ obsLevel: 5, year: 500 });
  const fc = new DirectorFirstContact();

  // (a) ROOT CAUSE rozbieżności 1: sonda to jedyny statek, którego NIE rusza
  // `VesselManager._updatePositions`, więc nie trafiała do `moving[]`. A `vessel:positionUpdate`
  // jest JEDYNYM kanałem, którym `ThreeRenderer._syncVesselPositions` leniwie odtwarza sprite
  // (`if (!entry) _addVesselSprite`). Bez tej emisji po wczytaniu zapisu mapa była pusta.
  const id = fc.scienceFlyby({ empireId: 'emp_001', empire: {} }, {});
  const seen = [];
  const h = ({ vessels }) => seen.push(...(vessels ?? []).map((v) => v.id));
  EventBus.on('vessel:positionUpdate', h);
  window.KOSMOS.timeSystem.gameTime = 502;
  EventBus.emit('time:tick', { deltaYears: 2 });
  A(seen.includes(id), 'T8a: ruch sondy jest OGŁASZANY przez vessel:positionUpdate (kanal sprite-ow)');
  EventBus.off('vessel:positionUpdate', h);

  // (b) Ścieżka restore w GameScene — druga połowa naprawy (klasa „restore odtwarza stan, nie mesh").
  const GS2 = codeOnly('src/scenes/GameScene.js');
  A(/_restoreActiveSystemVesselSprites\?\.\(\)/.test(GS2),
    'T8b: po wczytaniu zapisu GameScene zasiewa sprite-y statkow aktywnego ukladu');
  const TR = codeOnly('src/renderer/ThreeRenderer.js');
  A(/_restoreActiveSystemVesselSprites\(\)\s*\{/.test(TR),
    'T8c: …a seeder istnieje i jest idempotentny (guard w _addVesselSprite)');

  // (c) Lewar: teleport MUSI przesuwać też kurs, inaczej tick cofnie go przy najbliższym tiku.
  const fb0 = fc.getFlyby(id);
  const ok = fc.shiftFlybyCourse(id, 1000, -500);
  const fb1 = fc.getFlyby(id);
  A(ok === true && fb1.fromX === fb0.fromX + 1000 && fb1.toY === fb0.toY - 500,
    'T8d: shiftFlybyCourse przesuwa OBA końce kursu');
  const v = window.KOSMOS.vesselManager.getVessel(id);
  v.position.x += 1000; v.position.y -= 500;
  const px = v.position.x;
  window.KOSMOS.timeSystem.gameTime = 503;
  EventBus.emit('time:tick', { deltaYears: 1 });
  A(Math.abs(v.position.x - px) < 900,
    'T8e: po przesunięciu kursu tick NIE cofa teleportu (sonda leci dalej z nowego miejsca)');
  A(fc.shiftFlybyCourse('nie_ma_takiego', 1, 1) === false, 'T8f: nie-przelot → false, bez rzutu');

  // (d) Wolny/bliski przelot — bez tego zestrzelenie jest nietestowalne na żywo.
  const id2 = fc.scienceFlyby({ empireId: 'emp_009', empire: {} }, { durationYears: 60, radiusPx: 220 });
  const fb2 = fc.getFlyby(id2);
  A(fb2.endYear - fb2.startYear === 60, 'T8g: durationYears honorowane (wolny przelot)');
  A(Math.hypot(fb2.fromX, fb2.fromY) < 400, 'T8h: radiusPx honorowane (sonda blisko domu)');
  const REG = codeOnly('src/scenes/GameScene.js');
  A(/teleportVessel:/.test(REG) && /flybyNearHome:/.test(REG),
    'T8i: oba lewary wystawione w KOSMOS.debug');
  fc.dispose(); EventBus.clear();
}

// ── T5 — jeden beat, nie dwa ────────────────────────────────────────────────
console.log('\nT5: Director przejmuje beat (decyzja 5) + sightingi w round-tripie');
{
  const GS = codeOnly('src/scenes/GameScene.js');
  A(/firstContactFlyby/.test(handlerBody(GS, 'vessel:firstSighting')),
    'T5a: generyczny popup GameScene ustępuje, gdy to przelot pierwszego kontaktu');

  const OBS = codeOnly('src/systems/ObservatorySystem.js');
  A(/firstContactFlyby:\s*window\.KOSMOS\?\.directorFirstContact/.test(OBS),
    'T5b: ObservatorySystem oznacza wykrycie przelotu flagą');
  A(/reportedSightings:\s*\[\.\.\.this\._reportedVesselSightings\]/.test(OBS),
    'T5c: `_reportedVesselSightings` JEST serializowany (bez tego beat wracał po przeładowaniu)');
  A(/data\.reportedSightings\s*\?\?\s*\[\]/.test(OBS),
    'T5d: …i odtwarzany z defensywnym defaultem (brak pola w starym zapisie = brak migracji)');
  A(!/'nieznane imperium'|Wykryto niezidentyfikowany kontakt/.test(OBS),
    'T5e: dwa zahardkodowane łańcuchy PL na tej trasie zastąpione kluczami i18n');
}

// ── T6 — zestrzelenie przelotu ──────────────────────────────────────────────
console.log('\nT6: zestrzelenie sondy — modyfikator opinii + pamięć (decyzja 4)');
{
  gameState.set('director', { rules: {}, pending: {}, flybys: {} }, 'test');
  const w = stubWorld({ obsLevel: 5, year: 400 });
  const fc = new DirectorFirstContact();
  const id = fc.scienceFlyby({ empireId: 'emp_007', empire: {} }, {});

  EventBus.emit('vessel:wrecked', { vesselId: id });
  A(w.opinions.some((o) => o.modId === 'first_contact_kill' && o.ofId === 'emp_007'),
    'T6a: zestrzelenie dokłada modyfikator opinii `first_contact_kill`');
  A(w.memories.some((m) => m.type === 'first_contact_kill'), 'T6b: …oraz wpis pamięci imperium');
  A(fc.isFlyby(id) === false, 'T6c: rozliczony przelot znika z rejestru (bez podwójnej kary)');

  // Naturalne wyjście NIE może być liczone jako zestrzelenie — `_despawn` czyści wpis
  // PRZED emisją `vessel:destroyed`, więc handler nie ma czego rozliczyć.
  const before = w.opinions.length;
  const id2 = fc.scienceFlyby({ empireId: 'emp_008', empire: {} }, {});
  window.KOSMOS.timeSystem.gameTime = 420;
  EventBus.emit('time:tick', { deltaYears: 20 });
  A(w.opinions.length === before,
    'T6d: naturalne opuszczenie układu NIE jest karane jak zestrzelenie');
  A(!window.KOSMOS.vesselManager.getVessel(id2), 'T6e: …a sonda i tak znika');
  fc.dispose(); EventBus.clear();
}

// ── T7 — katalog, rejestry, i18n ────────────────────────────────────────────
console.log('\nT7: katalog reguł, rejestry nazw, i18n PL+EN');
{
  A(Object.keys(validateRule(RULE)).length === 0 || validateRule(RULE).length === 0
    || JSON.stringify(validateRule(RULE)) === '[]',
    `T7a: reguła first_contact przechodzi walidator (${JSON.stringify(validateRule(RULE))})`);
  A(RULE.cooldown?.once === true, 'T7b: cooldown `once` — pierwszy kontakt zdarza się raz');
  A(RULE.roll?.unit === 'displayedYear', 'T7c: jednostka rzutu zadeklarowana DOSŁOWNIE');
  A(DirectorProbes.has('playerObservatoryLevel'), 'T7d: sonda zarejestrowana');
  A(DirectorGuards.has('empireNotAtWarWithPlayer'), 'T7e: guard zarejestrowany');
  A(DirectorActions.has('scienceFlyby'), 'T7f: akcja zarejestrowana');
  A(!!OPINION_MODIFIERS.first_contact_kill && OPINION_MODIFIERS.first_contact_kill.defaultValue < 0,
    'T7g: `first_contact_kill` istnieje i jest DUŻYM minusem');

  const pl = readFileSync('src/i18n/pl.js', 'utf8');
  const en = readFileSync('src/i18n/en.js', 'utf8');
  for (const k of ['director.firstContactTitle', 'director.firstContactBody', 'director.firstContactBar',
                   'director.unknownEmpire', 'director.flybyProbeName', 'log.unidentifiedContact',
                   'diplo.mod.firstContactKill']) {
    A(pl.includes(`'${k}'`) && en.includes(`'${k}'`), `T7h/${k}: klucz w PL I EN`);
  }

  // Guard wojny — reguła nie wysyła sondy do imperium, z którym gracz już wojuje.
  stubWorld({ obsLevel: 5, status: 'war' });
  A(DirectorGuards.resolve('empireNotAtWarWithPlayer')({ empireId: 'emp_001' }) === false,
    'T7i: guard odsiewa imperium w stanie wojny');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
