// Findingi 150 + Z2 — keeper: JEDNA BITWA = JEDNO OGŁOSZENIE (plan: docs/design/BATTLE_NARRATION_PLAN.md).
//
// PO CO: `DeepSpaceCombatSystem._finalizeBattle:1068` emituje `battle:resolved` z `warId: null`,
// po czym `WarSystem._classifyBattle:198` księguje starcie przez `recordBattle`, a ta emituje
// PONOWNIE (`:314`) — już z `warId`. Ten sam wynik szedł więc do KAŻDEGO subskrybenta dwa razy,
// w dwóch różnych kształtach. ⚠ To NIE jest defekt kosmetyczny — zmierzone konsekwencje:
//   • `AutoRetreatSystem` wydawał DRUGI rozkaz odwrotu tym samym statkom, a paliwo pobierane jest
//     PRZY WYDANIU (`MovementOrderSystem:924`) ⇒ podwójna opłata paliwowa za jedną ucieczkę;
//   • `GameScene:2383` pisał DWA wpisy do Dziennika o jednej walce, dwoma różnymi schematami
//     etykietowania (jeden poprawny, jeden odwrócony — Finding 155);
//   • `GameScene._battleQueue` NIE deduplikuje po `battleId`, więc drugi wpis otwierał pełny modal
//     kina „ENGAGEMENT IMMINENT" (pauzujący grę) wbrew decyzji Slice 1 „deep-space = baner".
//
// ⚠ WARUNEK OSIĄGALNOŚCI (korekta rejestru, zmierzona w źródle): podwójny emit dotyczy WYŁĄCZNIE
//   producentów, którzy emitują SAMI, a potem zostają doksięgowani — czyli DSCS i VCS.
//   `EnemyAttackHandler` woła `recordBattle` WPROST (W1-4), więc ogłasza dokładnie raz. Dlatego
//   naprawa siedzi w `_classifyBattle` (jedyne wejście re-entrantne), a nie u producentów:
//   to ta sama lekcja co `131cc2e`, tylko odwrócona — jeden szew pokrywa DSCS, VCS i przyszłych.
//
//   T1  bitwa DSCS w zadeklarowanej wojnie ogłaszana DOKŁADNIE RAZ (fail-first: 2)
//   T2  ⚠ KONTROLA PINU: księgowanie NIETKNIĘTE (exhaustion, war.battles[], dominacja,
//       `recordBattle` wołane raz) — inaczej T1 dałoby się „naprawić" wycięciem księgowania
//   T3  szew EAH (`recordBattle` BEZ opts) NADAL ogłasza, i to z `warId` — ochrona przed
//       nadgorliwym zastosowaniem `announce:false`
//   T4  potyczka bez wojny: jedno ogłoszenie + `war:skirmish` (widelec W3-2 nietknięty)
//   T5  `AutoRetreatSystem` wydaje JEDEN rozkaz i pobiera paliwo RAZ (fail-first: 2 i 2x)
//   T6  ⚠ PIN ZNANEGO LIMITU (Finding 156): w `gameState.battles` zostają DWA rekordy jednej
//       bitwy, o niepowiązanych id. Naprawa 150 tego NIE rusza — pin stoi, żeby nikt nie uznał
//       tego za załatwione.
//   T7  ⚠ PIN Z2/D2 — KOLEJNOŚĆ SUBSKRYBENTÓW JEST KONTRAKTEM. Po naprawie jedynym ogłoszeniem
//       bitwy DSCS jest emit producenta, czyli SPRZED księgowania. Spójność świata dla dalszych
//       konsumentów bierze się WYŁĄCZNIE stąd, że `EventBus.emit` jest synchroniczny w kolejności
//       rejestracji (`EventBus.js:31`), a `WarSystem` powstaje PRZED `InvasionSystem`
//       (`GameScene.js:318/319`, headless `GameCore:197/198`) — więc `recordBattle` domyka księgi
//       WEWNĄTRZ tego samego emitu. T7 pinuje to WYKONANIEM w obie strony i sprawdza, że kształt
//       DSCS w ogóle nie dociera do bramki desantu.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { createVessel } from '../../entities/Vessel.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { AutoRetreatSystem } from '../../systems/AutoRetreatSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}
const empireOf = (core) => core.empireRegistry.listAll()[0]?.id;

function spawnHull(core, { owner = null, name = 'Kadłub', x = 0, y = 0 } = {}) {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel('hull_frigate', home.id, {
    name, modules: [...WARSHIP], x, y, systemId: 'sys_home',
  });
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  v.position.state = 'orbiting';
  v.position.dockedAt = null;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

/** Prawdziwe starcie DSCS zakończone `_finalizeBattle` — szew, w którym siedzi `warId: null`. */
function deepSpaceBattle(core, empireId, winner = 'A', retreated = null) {
  const mine  = spawnHull(core, { name: 'Mój okręt',  x: 0, y: 0 });
  const their = spawnHull(core, { owner: empireId, name: 'Ich okręt', x: 1, y: 1 });
  const dscs = new DeepSpaceCombatSystem(core.vesselManager);
  const enc = dscs.startEngagement(mine.id, their.id);
  if (enc) dscs._finalizeBattle(enc, winner, retreated);
  return { enc, mine, their };
}

const collectResolved = () => {
  const seen = [];
  const cb = (p) => seen.push(p);
  EventBus.on('battle:resolved', cb);
  return { seen, stop: () => EventBus.off('battle:resolved', cb) };
};

// ── T1 — jedno ogłoszenie na jedną bitwę ────────────────────────────────────
console.log('T1 — bitwa DSCS w zadeklarowanej wojnie ogłaszana DOKŁADNIE RAZ');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');

  const { seen, stop } = collectResolved();
  deepSpaceBattle(core, empireId, 'A');
  stop();

  assert(seen.length === 1,
    `T1: battle:resolved wyemitowane RAZ (${seen.length}) — przed naprawą były DWA`);
  // Z3 (świadomy limit): jedyne ogłoszenie pochodzi od producenta, więc niesie warId=null,
  // mimo że bitwa JEST zaksięgowana w wojnie. Wiedza nie ginie (war.battles[] + rekord),
  // ale event jej nie niesie — konsumentów warId w ładunku jest dokładnie trzech i wszyscy
  // trzej wychodzą na tym lepiej (ścieżka B GameScene liczy tożsamość z uczestników).
  assert(seen[0]?.warId == null,
    `T1: …i jest to ogłoszenie PRODUCENTA (warId=${JSON.stringify(seen[0]?.warId)}) — Z3, świadomy limit`);
}

// ── T2 — KONTROLA PINU: księgowanie nietknięte ──────────────────────────────
console.log('T2 — ⚠ KONTROLA PINU: cisza dotyczy OGŁOSZENIA, nie KSIĘGOWANIA');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');
  const before = core.warSystem.getWarWith(empireId);
  const exBefore = JSON.stringify(before.exhaustion);
  const battlesBefore = before.battles.length;

  let recordCalls = 0;
  const orig = core.warSystem.recordBattle.bind(core.warSystem);
  core.warSystem.recordBattle = (...a) => { recordCalls++; return orig(...a); };

  deepSpaceBattle(core, empireId, 'B');       // wygrywa AI → dominacja na imperium

  core.warSystem.recordBattle = orig;
  const after = core.warSystem.getWarWith(empireId);

  assert(recordCalls === 1, `T2: recordBattle wołane DOKŁADNIE raz (${recordCalls})`);
  assert(after.battles.length === battlesBefore + 1,
    `T2: w wojnie przybyła DOKŁADNIE jedna bitwa (${battlesBefore} → ${after.battles.length})`);
  assert(JSON.stringify(after.exhaustion) !== exBefore,
    `T2: wyczerpanie NALICZONE (${exBefore} → ${JSON.stringify(after.exhaustion)}) — nie wycięliśmy księgowania`);
  const dom = gameState.get('orbitalDominance.sys_home');
  assert(dom?.controllerId === empireId,
    `T2: dominacja orbitalna USTAWIONA (${JSON.stringify(dom)}) — _updateOrbitalDominance biegnie jak przedtem`);
}

// ── T3 — szew EAH nadal ogłasza, i to z warId ───────────────────────────────
console.log('T3 — recordBattle BEZ opts (szew EnemyAttackHandler) ogłasza normalnie, z warId');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');
  const war = core.warSystem.getWarWith(empireId);

  const { seen, stop } = collectResolved();
  // Dosłowny kształt z EnemyAttackHandler:205 — wywołanie WPROST, bez opts.
  core.warSystem.recordBattle(war.id, {
    winner: 'B', lossesA: 1, lossesB: 0,
    location: { systemId: 'sys_home', planetId: window.KOSMOS.homePlanet.id, point: null },
    participantA: { type: 'vessel_group', empireId, vesselIds: [] },
    participantB: { type: 'player', empireId: 'player', systemId: 'sys_home' },
  });
  stop();

  assert(seen.length === 1, `T3: ogłoszone RAZ (${seen.length})`);
  assert(seen[0]?.warId === war.id,
    `T3: …i Z warId (${seen[0]?.warId}) — announce:false NIE rozlało się na wywołania wprost`);
}

// ── T4 — widelec W3-2 nietknięty ────────────────────────────────────────────
console.log('T4 — starcie BEZ wojny nadal idzie w POTYCZKĘ i ogłasza się raz');
{
  const core = boot();
  const empireId = empireOf(core);

  const skirmishes = [];
  const onSk = (p) => skirmishes.push(p);
  EventBus.on('war:skirmish', onSk);
  const { seen, stop } = collectResolved();

  deepSpaceBattle(core, empireId, 'A');

  stop();
  EventBus.off('war:skirmish', onSk);

  assert(seen.length === 1, `T4: jedno ogłoszenie (${seen.length})`);
  assert(skirmishes.length === 1, `T4: …i jedna potyczka (${skirmishes.length}) — widelec bez zmian`);
  assert(!core.warSystem.getWarWith(empireId), 'T4: potyczka NIE tworzy wojny');
}

// ── T5 — odwrót: jeden rozkaz, jedno pobranie paliwa ────────────────────────
console.log('T5 — ⚠ SZKODA STANOWA: AutoRetreat wydaje JEDEN rozkaz i pobiera paliwo RAZ');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');

  // MOS + AutoRetreat montujemy PO boot() — GameCore.boot woła EventBus.clear(), więc
  // subskrypcja z konstruktora AutoRetreat zniknęłaby (znana pułapka jałowej kontroli pinu).
  const mos = new MovementOrderSystem(core.vesselManager);
  window.KOSMOS.movementOrderSystem = mos;
  const ars = new AutoRetreatSystem(core.vesselManager, core.colonyManager, mos);

  const issued = [], failed = [];
  const onIssued = (p) => issued.push(p);
  const onFailed = (p) => failed.push(p);
  EventBus.on('vessel:autoRetreatIssued', onIssued);
  EventBus.on('vessel:autoRetreatFailed', onFailed);

  // winner A (gracz), retreated B (AI) — żywi uciekinierzy zostają, side-level wrak pominięty.
  const { their } = deepSpaceBattle(core, empireId, 'A', 'B');
  const fuelStart = their.fuel?.max ?? 0;
  const fuelEnd   = their.fuel?.current ?? 0;
  const burned    = fuelStart - fuelEnd;

  EventBus.off('vessel:autoRetreatIssued', onIssued);
  EventBus.off('vessel:autoRetreatFailed', onFailed);
  ars.destroy?.();

  assert(issued.length + failed.length > 0,
    `T5: AutoRetreat W OGÓLE zareagował (wydane ${issued.length}, odmowy ${failed.length}) — ` +
    'bez tego reszta T5 mierzyłaby ciszę');
  assert(issued.length <= 1,
    `T5: rozkaz odwrotu wydany NAJWYŻEJ raz (${issued.length}) — przed naprawą DWA razy, ` +
    'a drugi kasował pierwszy przez preempcję');
  // Paliwo pobierane jest PRZY WYDANIU (MovementOrderSystem:924), także pod bypassFuelCheck,
  // a każdy kolejny rozkaz płaci PEŁNY kurs od nowa.
  // ⚠ PIN MUSI PORÓWNYWAĆ Z KOSZTEM JEDNEGO KURSU, nie z pojemnością baku. Pierwsza wersja
  //   asertowała „spalone ≤ połowa baku" i PRZESZŁA na niepoprawionym kodzie (zmierzone
  //   fail-first: 0.82 z 25.00 przy DWÓCH rozkazach) — czyli nie mierzyła niczego. Kurs
  //   odwrotu jest o rzędy wielkości tańszy niż bak, więc podwojenie w tym progu ginie.
  const legCost = their.mission?.fuelCost ?? 0;
  assert(issued.length === 0 || (legCost > 0 && burned <= legCost * 1.05),
    `T5: paliwo pobrane RAZ (spalone ${burned.toFixed(3)} przy koszcie kursu ${legCost.toFixed(3)}) — ` +
    'przed naprawą stosunek wynosił 2.0');
}

// ── T6 — PIN ZNANEGO LIMITU (Finding 156) ───────────────────────────────────
console.log('T6 — ⚠ PIN LIMITU: jedna bitwa DSCS-w-wojnie ZOSTAWIA DWA rekordy (Finding 156)');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');

  deepSpaceBattle(core, empireId, 'A');

  const ids = Object.keys(gameState.get('battles') ?? {});
  const fromDscs = ids.filter(id => id.startsWith('battle_ds_'));
  const fromWar  = ids.filter(id => !id.startsWith('battle_ds_'));

  assert(fromDscs.length === 1 && fromWar.length === 1,
    `T6: DWA rekordy jednej bitwy (DSCS: ${fromDscs.join()} | wojenny: ${fromWar.join()}) — ` +
    'naprawa 150 dotyczy OGŁOSZEŃ, nie rekordów; Finding 156 otwarty');
  assert(fromDscs[0] !== fromWar[0],
    'T6: …i ich id są NIEPOWIĄZANE — z id DSCS nie da się dojść do rekordu wojennego');
}

// ── T7 — PIN Z2/D2: kolejność subskrybentów jest kontraktem ─────────────────
console.log('T7 — ⚠ PIN Z2/D2: spójność świata trzyma się KOLEJNOŚCI subskrybentów');
{
  const core = boot();
  const empireId = empireOf(core);
  core.diplomacySystem.declareWar(empireId, 'keeper');

  // Sonda rejestrowana PO boot() → stoi ZA WarSystem, dokładnie jak InvasionSystem
  // (GameCore:197/198, GameScene:318/319). Czyta świat W CHWILI ogłoszenia.
  let domAtAnnounce;
  const probe = ({ result }) => {
    const sys = result?.location?.systemId;
    domAtAnnounce = gameState.get(`orbitalDominance.${sys}`)?.controllerId ?? null;
  };
  EventBus.on('battle:resolved', probe);

  const invasionEvents = [];
  const onInv = (p) => invasionEvents.push(p);
  EventBus.on('invasion:blocked', onInv);
  EventBus.on('invasion:launched', onInv);

  deepSpaceBattle(core, empireId, 'B');       // AI wygrywa orbitę

  assert(domAtAnnounce === empireId,
    `T7a: konsument ZA WarSystem widzi dominację JUŻ ZAKSIĘGOWANĄ (${domAtAnnounce}) — ` +
    'recordBattle domyka księgi WEWNĄTRZ tego samego, synchronicznego emitu');

  assert(invasionEvents.length === 0,
    `T7b: kształt DSCS NIE dociera do bramki desantu (${invasionEvents.length} zdarzeń invasion:*) — ` +
    'obie strony to vessel_group, a _onVesselGroupVictory wymaga participantB.type === player');

  // ⚠ KONTROLA PINU dla T7b: ten sam listener MUSI zareagować na kształt EAH. Bez tego T7b
  //   mierzyłby ciszę martwego subskrybenta i świeciłby na zielono także wtedy, gdyby
  //   InvasionSystem w ogóle nie był wpięty.
  gameState.set('orbitalDominance.sys_home', { controllerId: 'player', year: 0 }, 'keeper_reset');
  EventBus.emit('battle:resolved', {
    warId: null, battleId: 'b_eah_shape',
    result: {
      winner: 'A', lossesA: 0, lossesB: 1,
      location: { systemId: 'sys_home', planetId: window.KOSMOS.homePlanet.id, point: null },
      participantA: { type: 'vessel_group', empireId, vesselIds: [] },
      participantB: { type: 'player', empireId: 'player', systemId: 'sys_home' },
    },
  });
  assert(invasionEvents.length > 0,
    `T7c: KONTROLA PINU — kształt EAH JEST oceniany przez bramkę desantu ` +
    `(${invasionEvents.map(e => e.reason ?? 'launched').join()}), więc T7b nie mierzy ciszy`);

  EventBus.off('battle:resolved', probe);
  EventBus.off('invasion:blocked', onInv);
  EventBus.off('invasion:launched', onInv);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
