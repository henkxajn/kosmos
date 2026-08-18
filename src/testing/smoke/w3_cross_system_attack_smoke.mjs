// W3 — keeper spójności układu w rozkazach (commit W3-4b, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: GATE 2 przerwał się na REALNYM defekcie, którego GATE 1 nie mógł złapać, bo tamten boot
// przypadkiem umieścił wszystkich w `sys_home`. Rozkazy ruchu są z konstrukcji WEWNĄTRZUKŁADOWE
// (współrzędne liczone od gwiazdy, a gwiazda każdego układu stoi w (0,0)), ale identyfikatory
// ciał i statków są GLOBALNE. Wrogi okręt z `sys_061` dostał więc rozkaz uderzenia na planetę
// gracza w `sys_home`, poleciał do JEJ współrzędnych odmierzonych od SWOJEJ gwiazdy, wylądował
// w losowym miejscu `sys_061` — i zameldował się jako **zadokowany przy ciele, którego w jego
// układzie nie ma**. Bitwa i dominacja orbitalna zaksięgowały się dla układu NAPASTNIKA.
//
// ⚠ D4 mówi: PRAWDZIWA PODRÓŻ Z MACIERZYSTEGO UKŁADU AI. Cross-system nie jest przypadkiem
//    brzegowym — jest scenariuszem PODSTAWOWYM W3-5, bo stolica AI prawie nigdy nie dzieli
//    układu z graczem.
//
//   T1  ⚠ FAIL-FIRST: rozkaz `attack` na ciało z INNEGO układu jest ODRZUCANY przez
//       `MovementOrderSystem` (`target_other_system`). KONTROLA PINU: ten sam cel w TYM SAMYM
//       układzie dalej przechodzi.
//   T2  ⚠ FAIL-FIRST: `OrderService.issueAttack` na cel międzygwiezdny robi SKOK (composite),
//       a nie lot w pustkę; po skoku sam wydaje rozkaz uderzenia i misja ma typ `attack`.
//   T3  ⚠ FAIL-FIRST: szew przylotu NIE dokuje do ciała spoza układu statku (druga linia obrony
//       dla misji z zapisu). KONTROLA PINU: ciało z WŁASNEGO układu dokuje normalnie.
//   T4  ta sama klasa w rozkazach celowanych w STATEK: pościg/przechwyt/engage na cel z innego
//       układu odrzucane tym samym powodem. KONTROLA PINU: cel w tym samym układzie przechodzi.
//   T5  `SystemScope` — kontrakt `undefined` (stary zapis ⇒ `sys_home`) vs `null` (tranzyt
//       międzygwiezdny ⇒ nie wiemy ⇒ fail-open). Sklejenie obu twierdziłoby, że statek
//       w warpie jest w domu.
//   T6  i18n powodu w OBU słownikach (klucz budowany INTERPOLACJĄ — `check-i18n` go nie widzi).
//
// ⚠ Harness nie montuje MOS ani OrderService — stawiamy je ręcznie (wzór `w3_seams_smoke`).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { createVessel } from '../../entities/Vessel.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { systemIdOf, isSameSystem } from '../../utils/SystemScope.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
/** Kadłub zdolny do skoku — `warp_tank` daje `warpFuel.max > 0` (wzór eskorty z katalogu AI). */
const RAIDER  = ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  window.KOSMOS.orderService = new OrderService();
  return core;
}

/** Ciało AI w INNYM układzie niż gracz — scena, której GATE 1 przypadkiem nie miał. */
function foreignBody(core) {
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const col = core.colonyManager.getAllColonies().find(c => c.ownerEmpireId === empireId);
  const body = EntityManager.get(col?.planetId);
  return { empireId, body };
}

function spawnAt(core, body, { owner = null, modules = WARSHIP, name = 'Kadłub' } = {}) {
  const v = createVessel('hull_frigate', body.id, {
    name, modules: [...modules], x: body.x ?? 0, y: body.y ?? 0, systemId: body.systemId,
  });
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  v.position.state = 'orbiting';
  v.position.dockedAt = body.id;
  v.mission = null; v.movementOrder = null;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

// ── T1 — rozkaz wewnątrzukładowy odmawia celu z innego układu ───────────────
console.log('T1 — ⚠ `attack` na ciało z INNEGO układu jest ODRZUCANY (a nie leci w pustkę)');
{
  const core = boot();
  const { empireId, body: aiBody } = foreignBody(core);
  const home = window.KOSMOS.homePlanet;
  const mos = window.KOSMOS.movementOrderSystem;

  assert(aiBody.systemId !== home.systemId,
    `T1: scena jest naprawdę międzygwiezdna (AI w ${aiBody.systemId}, gracz w ${home.systemId}) — ` +
    'dokładnie tego GATE 1 nie miał, bo tamten boot postawił wszystkich w jednym układzie');

  const v = spawnAt(core, aiBody, { owner: empireId, name: 'Napastnik' });
  const res = mos.issueOrder(v.id, {
    type: 'attack', targetBodyId: home.id, issuedBy: 'w3_4b_probe', bypassFuelCheck: true,
  });

  assert(res?.ok === false && res?.reason === 'target_other_system',
    `T1 SEDNO: odmowa z powodem \`${res?.reason}\`. Przed W3-4b rozkaz PRZECHODZIŁ, statek leciał ` +
    'do współrzędnych planety gracza odmierzonych od WŁASNEJ gwiazdy i lądował w losowym ' +
    'miejscu swojego układu');
  assert(!v.mission && !v.movementOrder,
    'T1: odmowa nie zostawia śmieci — statek nie rusza się nigdzie');

  // KONTROLA PINU: cel w TYM SAMYM układzie dalej przechodzi (bramka pilnuje układu, nie ataku).
  const ownBodies = EntityManager.getByTypeInSystem('planet', aiBody.systemId) ?? [];
  const sameSysTarget = ownBodies.find(b => b.id !== aiBody.id) ?? aiBody;
  const ok = mos.issueOrder(v.id, {
    type: 'attack', targetBodyId: sameSysTarget.id, issuedBy: 'w3_4b_probe', bypassFuelCheck: true,
  });
  assert(ok?.ok === true && v.mission?.type === 'attack',
    `T1 KONTROLA PINU: uderzenie na cel we WŁASNYM układzie przechodzi (${ok?.reason ?? 'ok'}) — ` +
    'bramka odróżnia układ, a nie blokuje ataków w ogóle');
}

// ── T2 — OrderService robi PRAWDZIWĄ podróż ─────────────────────────────────
console.log('T2 — ⚠ `OrderService.issueAttack` na cel międzygwiezdny SKACZE (D4: prawdziwa podróż)');
{
  const core = boot();
  const { empireId, body: aiBody } = foreignBody(core);
  const home = window.KOSMOS.homePlanet;
  const os = window.KOSMOS.orderService;

  const v = spawnAt(core, aiBody, { owner: empireId, modules: RAIDER, name: 'Rajder' });
  assert(v.warpFuel?.max > 0,
    `T2: rajder ma bak warp (${v.warpFuel?.max}) — filtr doboru sił to \`warpFuel.max > 0\` (D4)`);

  // ⚠ `?.` wyłącznie po to, żeby run z NIEnaprawionym kodem RAPORTOWAŁ czerwień zamiast się
  //    wywrócić na braku metody — dowód fail-first ma pokazać CAŁY obraz, nie pierwszy wyjątek.
  const res = os.issueAttack?.(v.id, { targetBodyId: home.id });
  assert(res?.ok === true && res?.composite === true,
    `T2 SEDNO: fasada zwraca composite (${JSON.stringify(res)}) — czyli NAJPIERW skok, dopiero ` +
    'potem podejście wewnątrz układu');
  assert(v.mission?.type === 'interstellar_jump',
    `T2: misja to \`${v.mission?.type}\` — statek naprawdę leci między gwiazdami (gracz ma to ` +
    'zobaczyć sensorami, nie zastać pod planetą)');
  assert(v.pendingOrder?.kind === 'attack' && v.pendingOrder?.targetId === home.id,
    'T2: zamiar uderzenia czeka w `pendingOrder` (serializowalny — przeżyje zapis w locie)');

  // Dolot skoku: ta sama ścieżka co w grze — zdarzenie przylotu domyka composite.
  window.KOSMOS.timeSystem.gameTime = (v.mission?.arrivalYear ?? 0) + 0.001;
  core.vesselManager._updatePositions(0.01);

  assert(v.systemId === home.systemId,
    `T2: po skoku statek JEST w układzie celu (${v.systemId})`);
  assert(v.mission?.type === 'attack' && v.mission?.targetId === home.id,
    `T2 SEDNO: fasada sama wydała uderzenie po przylocie (misja \`${v.mission?.type}\`) — ` +
    'łańcuch skok→uderzenie domyka się bez udziału gracza');
  assert(v.pendingOrder == null,
    'T2: `pendingOrder` skonsumowany — dostawa jednokrotna, bez ryzyka podwójnego rozkazu');
}

// ── T3 — szew przylotu nie dokuje do obcego ciała ───────────────────────────
console.log('T3 — ⚠ przylot NIE dokuje do ciała spoza układu statku (druga linia obrony)');
{
  const core = boot();
  const { empireId, body: aiBody } = foreignBody(core);
  const home = window.KOSMOS.homePlanet;

  // Misja zbudowana RĘCZNIE — tak, jakby przyszła ze starego zapisu albo ze ścieżki, która
  // powstanie później i obejdzie bramkę wydania rozkazu.
  const v = spawnAt(core, aiBody, { owner: empireId, name: 'Zabłąkany' });
  v.position.state = 'in_transit';
  v.position.dockedAt = null;
  v.status = 'on_mission';
  v.mission = {
    type: 'attack', targetId: home.id, targetName: home.name,
    startX: v.position.x, startY: v.position.y,
    targetX: home.x ?? 0, targetY: home.y ?? 0,
    waypoints: [], departYear: 0, arrivalYear: 0.5, originId: aiBody.id, fuelCost: 0,
  };

  window.KOSMOS.timeSystem.gameTime = 1.0;
  core.vesselManager._updatePositions(0.01);

  assert(v.position.dockedAt == null,
    `T3 SEDNO: statek NIE jest zadokowany (\`${v.position.dockedAt}\`) przy ciele z ` +
    `${home.systemId}, stojąc w ${v.systemId}. Przed W3-4b właśnie tak wyglądał stan po ` +
    'przylocie — dok przy ciele, którego w tym układzie nie ma');
  assert(v.systemId === aiBody.systemId,
    'T3: …i statek NIE teleportował się do cudzego układu — nadal jest tam, gdzie był');

  // KONTROLA PINU: ciało z WŁASNEGO układu dokuje normalnie (guard nie zabija zwykłych przylotów).
  const own = (EntityManager.getByTypeInSystem('planet', aiBody.systemId) ?? [])
    .find(b => b.id !== aiBody.id) ?? aiBody;
  const v2 = spawnAt(core, aiBody, { owner: empireId, name: 'Zwykły przylot' });
  v2.position.state = 'in_transit';
  v2.position.dockedAt = null;
  v2.mission = {
    type: 'attack', targetId: own.id, targetName: own.name,
    startX: 0, startY: 0, targetX: own.x ?? 0, targetY: own.y ?? 0,
    waypoints: [], departYear: 0, arrivalYear: 1.5, originId: aiBody.id, fuelCost: 0,
  };
  window.KOSMOS.timeSystem.gameTime = 2.0;
  core.vesselManager._updatePositions(0.01);
  assert(v2.position.dockedAt === own.id,
    `T3 KONTROLA PINU: przylot do ciała z WŁASNEGO układu dokuje normalnie (${v2.position.dockedAt}) — ` +
    'guard odróżnia układ, a nie blokuje dokowania w ogóle');
}

// ── T4 — ta sama klasa w rozkazach na STATEK ────────────────────────────────
console.log('T4 — pościg/przechwyt/engage na cel z innego układu też odrzucane');
{
  const core = boot();
  const { empireId, body: aiBody } = foreignBody(core);
  const home = window.KOSMOS.homePlanet;
  const mos = window.KOSMOS.movementOrderSystem;

  const hunter = spawnAt(core, aiBody, { owner: empireId, name: 'Myśliwy' });
  const preyFar = spawnAt(core, home, { name: 'Zwierzyna daleko' });   // statek gracza w sys_home
  const preyNear = spawnAt(core, aiBody, { name: 'Zwierzyna blisko' });
  // ⚠ Odsuń w TYM SAMYM układzie: stojąc na tym samym ciele cel jest `target_already_in_range`
  //   i kontrola pinu mierzyłaby zupełnie inną bramkę niż ta, o którą tu chodzi.
  preyNear.position.x = (aiBody.x ?? 0) + 400;
  preyNear.position.y = (aiBody.y ?? 0) + 400;
  preyNear.position.dockedAt = null;

  for (const type of ['pursue', 'intercept', 'engage']) {
    const r = mos.issueOrder(hunter.id, { type, targetEntityId: preyFar.id, issuedBy: 'w3_4b_probe' });
    assert(r?.ok === false && r?.reason === 'target_other_system',
      `T4: \`${type}\` na cel z innego układu odrzucone (\`${r?.reason}\`) — bez tego rozkaz gonił ` +
      'współrzędne odmierzone od CUDZEJ gwiazdy');
  }

  // KONTROLA PINU: ten sam rozkaz na cel w TYM SAMYM układzie przechodzi.
  const ok = mos.issueOrder(hunter.id, { type: 'pursue', targetEntityId: preyNear.id, issuedBy: 'w3_4b_probe' });
  assert(ok?.ok === true,
    `T4 KONTROLA PINU: pościg za celem we WŁASNYM układzie przechodzi (${ok?.reason ?? 'ok'})`);
}

// ── T5 — kontrakt SystemScope ───────────────────────────────────────────────
console.log('T5 — `SystemScope`: `undefined` ⇒ sys_home, `null` ⇒ tranzyt (fail-open)');
{
  assert(systemIdOf({ systemId: 'sys_042' }) === 'sys_042', 'T5: jawny układ czytany wprost');
  assert(systemIdOf({}) === 'sys_home',
    'T5: BRAK pola (stary zapis, sprzed multi-system) ⇒ `sys_home`');
  assert(systemIdOf({ systemId: null }) === null,
    'T5: `null` ZOSTAJE `null` — to świadome „między układami" (tranzyt warp), nie brak danych');
  assert(systemIdOf(null) === null, 'T5: brak encji ⇒ null');

  assert(isSameSystem({ systemId: 'sys_a' }, { systemId: 'sys_a' }) === true, 'T5: te same układy');
  assert(isSameSystem({ systemId: 'sys_a' }, { systemId: 'sys_b' }) === false, 'T5: różne układy');
  assert(isSameSystem({ systemId: null }, { systemId: 'sys_b' }) === true,
    'T5 SEDNO: statek W TRANZYCIE nie jest blokowany — bramka na podstawie NIEWIEDZY zamieniłaby ' +
    'ten defekt na cichy paraliż floty');
  assert(isSameSystem({}, { systemId: 'sys_home' }) === true,
    'T5: stary statek bez pola pasuje do `sys_home` (a nie do wszystkiego)');
  assert(isSameSystem({}, { systemId: 'sys_b' }) === false,
    'T5 KONTROLA PINU: …i NIE pasuje do dowolnego innego układu — fail-open dotyczy `null`, nie braku');
}

// ── T6 — i18n powodu ────────────────────────────────────────────────────────
console.log('T6 — klucz powodu w OBU słownikach (budowany interpolacją, checker go nie widzi)');
{
  const k = 'vessel.reasonTargetOtherSystem';
  assert(typeof PL[k] === 'string' && PL[k].length > 0, `T6: PL ma \`${k}\``);
  assert(typeof EN[k] === 'string' && EN[k].length > 0, `T6: EN ma \`${k}\``);
  assert(PL['vessel.reasonNieMaTakiego'] === undefined,
    'T6 KONTROLA PINU: nieistniejący klucz jest `undefined` — słownik naprawdę jest sprawdzany');
}

// ── T7 — księga bierze układ CELU, nie napastnika ───────────────────────────
console.log('T7 — ⚠ bitwa i dominacja księgują układ CELU (nie napastnika)');
{
  const core = boot();
  const { empireId, body: aiBody } = foreignBody(core);
  const home = window.KOSMOS.homePlanet;
  const eah = new EnemyAttackHandler();

  window.KOSMOS.diplomacySystem?.declareWar?.(empireId, 'w3_4b_probe');
  const warId = core.warSystem.getWarWith(empireId)?.id;
  assert(!!warId, 'T7: wojna zadeklarowana — jest do czego księgować');

  // ⚠ Scena to stan NIESPÓJNY: statek stoi w swoim układzie, a jest zadokowany przy ciele
  //   gracza. Od W3-4b-1 nie da się go już WYTWORZYĆ rozkazem — ale MOŻNA go WCZYTAĆ
  //   z zapisu zrobionego przed poprawką (dokładnie taki zapis powstał na GATE 2).
  //   Dlatego księgowanie musi być odporne SAMO Z SIEBIE, a nie polegać na bramce wyżej.
  const v = spawnAt(core, aiBody, { owner: empireId, name: 'Zabłąkany napastnik' });
  v.position.dockedAt = home.id;               // dok przy ciele z sys_home…
  v.systemId = aiBody.systemId;                // …stojąc w układzie AI

  eah._pendingBattles.set(home.id, {
    arrivedVesselIds: new Set([v.id]),
    firstVesselYear: window.KOSMOS.timeSystem.gameTime ?? 0,
    timerId: null,
  });
  eah._resolveBatchedBattle(home.id);

  const war = core.warSystem.getWar(warId);
  const lastBattleId = war?.battles?.[war.battles.length - 1];
  const rec = lastBattleId ? gameState.get(`battles.${lastBattleId}`) : null;

  assert(rec?.location?.systemId === home.systemId,
    `T7 SEDNO: bitwa zapisana w układzie CELU (${rec?.location?.systemId}), nie napastnika ` +
    `(${aiBody.systemId}). Przed W3-4b rekord był wewnętrznie sprzeczny: planeta z ` +
    `${home.systemId} „położona" w ${aiBody.systemId}`);
  assert(gameState.get(`orbitalDominance.${home.systemId}`) != null,
    'T7: dominacja orbitalna zapisana dla układu CELU — bo tam właśnie ktoś trzyma orbitę');
  assert(gameState.get(`orbitalDominance.${aiBody.systemId}`) == null,
    `T7 SEDNO: …i NIE dla ${aiBody.systemId}, gdzie nikt nie walczył. To jest ta liczba, ` +
    'która na GATE 2 wskazywała zwycięzcę w układzie bez jednej strony');
  assert(rec?.participantB?.systemId === home.systemId,
    'T7: uczestnik-gracz też opisany układem celu (jeden układ odniesienia w całym rekordzie)');
}

// ── T8 — nie ma gracza, nie ma bitwy ────────────────────────────────────────
console.log('T8 — ⚠ uderzenie w układ BEZ gracza nie fabrykuje obrońcy i nie księguje strat');
{
  const core = boot();
  const { empireId, body: aiBody } = foreignBody(core);
  const eah = new EnemyAttackHandler();

  window.KOSMOS.diplomacySystem?.declareWar?.(empireId, 'w3_4b_probe');
  const warId = core.warSystem.getWarWith(empireId)?.id;

  // KONTROLA PINU NAJPIERW: obrońca-widmo NAPRAWDĘ istnieje w silniku — to on był
  // przeciwnikiem AI na GATE 2. Bez tego „brak bitwy" byłby nieodróżnialny od atrapy.
  const phantom = core.warSystem._buildPlayerBattleUnit(aiBody.systemId);
  assert(phantom?.hp === 100 && (phantom?.weapons?.length ?? 0) === 0,
    `T8 KONTROLA PINU: \`_buildPlayerBattleUnit\` dla obcego układu DALEJ oddaje widmo ` +
    `(hp=${phantom?.hp}, broni=${phantom?.weapons?.length}) — sto wytrzymałości i ZERO broni. ` +
    'Nie zmieniamy tej funkcji (ma innych konsumentów); odcinamy DROGĘ do niej.');
  assert(core.warSystem.hasPlayerPresenceInSystem?.(aiBody.systemId) === false,
    'T8: predykat obecności mówi wprost — gracza tam NIE MA');

  const exhaustBefore = JSON.stringify(core.warSystem.getWar(warId)?.exhaustion);
  const battlesBefore = core.warSystem.getWar(warId)?.battles?.length ?? 0;

  const v = spawnAt(core, aiBody, { owner: empireId, name: 'Napastnik donikąd' });
  eah._pendingBattles.set(aiBody.id, {
    arrivedVesselIds: new Set([v.id]),
    firstVesselYear: window.KOSMOS.timeSystem.gameTime ?? 0,
    timerId: null,
  });
  eah._resolveBatchedBattle(aiBody.id);

  const warAfter = core.warSystem.getWar(warId);
  assert(JSON.stringify(warAfter?.exhaustion) === exhaustBefore,
    `T8 SEDNO: wyczerpanie BEZ ZMIAN (${exhaustBefore}). Przed W3-4b gracz dostawał tu udział ` +
    'przegranego za bitwę, w której nie miał ani jednego statku ani jednej kolonii');
  assert((warAfter?.battles?.length ?? 0) === battlesBefore,
    'T8: żaden wpis nie trafił do rejestru bitew — nie było bitwy');
  assert(gameState.get(`orbitalDominance.${aiBody.systemId}`) == null,
    'T8: i nikt nie „zdobył" dominacji nad układem, w którym nie było z kim walczyć');

  // KONTROLA PINU: gdy gracz JEST obecny, bitwa dochodzi do skutku normalnie.
  const guard = spawnAt(core, aiBody, { name: 'Strażnik gracza' });
  guard.position.dockedAt = null;
  assert(core.warSystem.hasPlayerPresenceInSystem?.(aiBody.systemId) === true,
    'T8 KONTROLA PINU: jeden statek gracza wystarczy, by obecność była prawdziwa…');
  eah._pendingBattles.set(aiBody.id, {
    arrivedVesselIds: new Set([v.id]),
    firstVesselYear: window.KOSMOS.timeSystem.gameTime ?? 0,
    timerId: null,
  });
  eah._resolveBatchedBattle(aiBody.id);
  assert((core.warSystem.getWar(warId)?.battles?.length ?? 0) === battlesBefore + 1,
    'T8 KONTROLA PINU: …i wtedy bitwa JEST księgowana — bramka odcina brak przeciwnika, ' +
    'a nie bitwy w ogóle');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
