// W3 — keeper szwów przed slice'em ofensywnym (commit W3-0, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: audyt W3 (`docs/design/W3_PLAN.md`) OBALIŁ trzy przesłanki, na których slice był
// zakrojony (C-1 desant AI, C-2 doktryny, C-3 materializator), i znalazł TRZY ZEPSUTE FUNDAMENTY
// pod funkcjami, które W3 ma dowieźć (§Context). Cały kształt slice'u stoi na tych faktach.
// Ten keeper pinuje je WYKONANIEM — każda asercja jest napisana PRZECIW DZISIEJSZEMU zachowaniu,
// więc kolejne commity W3 MUSZĄ ją świadomie odwrócić. Pin, którego nikt nie odwraca, jest
// pinem luki (wzór `director_seams_smoke` T6 / `war_seams_smoke` T3-T4-T6).
//
//   T1  S2+S3: rozkaz AI na ciało GRACZA rodzi misję `move_to_point`, a EnemyAttackHandler
//              bramkuje `attack` ⇒ PRZYLOT NIE WYWOŁUJE BITWY. Brakujące ogniwo uderzenia
//              w stolicę — odwraca W3-4.
//   T2  S5:    ⚠ ODWRÓCONE W W3-2. Do W3-2 pinował DZIURĘ KSIĘGOWĄ: bitwa DSCS w trakcie
//              ZADEKLAROWANEJ wojny omijała `recordBattle` (zero exhaustion, zero wpisu).
//              Teraz pinuje STAN SZWU: surowy emit dalej niesie `warId: null` (producent NIE
//              księguje — P3), a księguje WarSystem. Szczegóły: `w3_battle_booking_smoke`.
//   T3  S6:    ⚠ ODWRÓCONE W W3-3. Do W3-3 pinował LUKĘ: `orbitalDominance` nie przeżywał
//              serialize→restore (klucz spoza `createDefaultState`), więc po reloadzie bramka
//              desantu oddawała orbitę, której nikt nie odbił. Teraz pinuje STAN SZWU: klucz
//              jest zadeklarowany i przeżywa. Skutek dla bramki: `w3_dominance_persist_smoke`.
//   T4  C-5:   ⚠ ODWRÓCONE W W3-1 — pierwszy pin luki z tego pliku, który doczekał się naprawy.
//              Do W3-1 pinował DEFEKT: imperium trzymało id kolonii, a `getColoniesByEmpire`
//              jej nie widziało ⇒ AI nie czerpało z podboju NIC. Teraz pinuje STAN SZWU:
//              podbój zostaje. Szczegółowe pokrycie (tech, galaxyData, ostatnia kolonia,
//              sprzątanie) mieszka w `w3_conquest_persists_smoke`.
//   T5  C-2:   `_holdAtHome` wydaje `moveToPoint` BEZ `targetPoint` ⇒ silnik odrzuca rozkaz
//              powodem `missing_target_point`. Odwraca W3-4.
//   T6  S12:   jednostka legacy ginie od PIERWSZEGO trafienia (brak pola `morale`), a po
//              serialize→restore dostaje `morale: 100` i już nie ginie. Dziura determinizmu
//              WIĘKSZA niż R13. ⚠ NIE odwraca jej żaden commit W3 — to pin przekazany
//              slice'owi „GROUND" (decyzja D5), zapisany tu, żeby nie wyparował między slice'ami.
//
// ⚠ Harness NIE montuje: `stationSystem`, `Director*`, `MovementOrderSystem`,
//    `DeepSpaceCombatSystem`, `EnemyAttackHandler`, `CombatSystem`. Każdy z nich stawiamy tu
//    RĘCZNIE (wzór: `war_seams_smoke` T6 dla EAH, `war_doctrine_smoke` boot() dla MOS+doktryny).
// ⚠ ŻETON STACJI (R-3): bez `stationSystem` AI nie produkuje okrętów wojennych SAMO
//    (`DirectorProduction.js:359` → `no_orbital_station`). Dlatego KAŻDY kadłub stawiamy tu
//    ręcznie i ten keeper ŚWIADOMIE NIE MIERZY produkcji AI — mierzy szwy, przez które ta
//    produkcja potem przechodzi. Pomiar podłużny (ile kadłubów, po ilu latach, na ilu seedach)
//    należy do sondy, gdzie żeton trzeba zasiać, inaczej sonda mierzy CISZĘ.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { createVessel } from '../../entities/Vessel.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { DirectorDoctrine, registerDoctrineBehaviors } from '../../systems/director/DirectorDoctrine.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  // ⚠ ZAWSZE nowa instancja MOS, nigdy reużyta: każdy boot() ma NOWY VesselManager, a MOS
  //   trzyma referencję do swojego (lekcja z `war_doctrine_smoke` boot()).
  window.KOSMOS.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  return core;
}

/** Kadłub wstawiony wprost do rejestru — patrz nota o żetonie stacji w nagłówku. */
function spawnHull(core, { owner = null, name = 'Kadłub', x = 0, y = 0, dockedAt = null } = {}) {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel('hull_frigate', home.id, {
    name, modules: [...WARSHIP], x, y, systemId: 'sys_home',
  });
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  v.position.state = 'orbiting';
  v.position.dockedAt = dockedAt;
  v.mission = null;
  v.movementOrder = null;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

const empireOf = (core) => core.empireRegistry.listAll()[0]?.id;

// ── T1 — S2+S3: rozkaz AI na ciało gracza NIE rodzi bitwy ───────────────────
console.log('T1 — S2+S3: przylot AI nad ciało GRACZA nie wywołuje bitwy (misja to `move_to_point`, EAH chce `attack`)');
{
  const core = boot();
  const empireId = empireOf(core);
  const home = window.KOSMOS.homePlanet;
  const mos = window.KOSMOS.movementOrderSystem;

  const v = spawnHull(core, { owner: empireId, name: 'Napastnik', x: 500, y: 500 });

  // Rozkaz WŁAŚCIWYM kanałem AI: ten sam kształt co `DirectorDoctrine._sendOnPatrol`
  // (ciało + punkt zapasowy + bypassFuelCheck), tylko celem jest planeta GRACZA.
  const res = mos.issueOrder(v.id, {
    type: 'moveToPoint',
    targetBodyId: home.id,
    targetPoint: { x: home.x ?? 0, y: home.y ?? 0 },
    issuedBy: 'w3_seams_probe',
    bypassFuelCheck: true,
  });
  assert(res?.ok === true,
    `T1: kanał rozkazów AI PRZYJMUJE rozkaz na ciało gracza (${res?.reason ?? 'ok'}) — ` +
    'blokady nie ma, więc to nie tu leży brak ataku');

  assert(v.mission?.type === 'move_to_point',
    `T1: MOS zbudował misję typu \`${v.mission?.type}\` — a EnemyAttackHandler bramkuje \`attack\` ` +
    '(EnemyAttackHandler.js:41). To jest CAŁE brakujące ogniwo uderzenia w stolicę.');

  const eah = new EnemyAttackHandler();
  eah._onVesselArrived(v, v.mission);
  assert(eah._pendingBattles.size === 0,
    'T1: przylot z misją `move_to_point` NIE otwiera bitwy (0 oczekujących) — flota AI może ' +
    'dolecieć nad planetę gracza i NIC się nie dzieje');

  // KONTROLA PINU — bez niej „0 bitew" jest nieodróżnialne od atrapy, która nigdy nic nie otwiera.
  const attacker = spawnHull(core, { owner: empireId, name: 'Napastnik z misją ataku', x: 10, y: 10 });
  attacker.mission = { type: 'attack', targetId: home.id, targetName: home.name ?? 'dom' };
  eah._onVesselArrived(attacker, attacker.mission);
  assert(eah._pendingBattles.size === 1,
    `T1 KONTROLA PINU: TEN SAM kadłub z \`mission.type='attack'\` otwiera bitwę (${eah._pendingBattles.size}) — ` +
    'rurociąg orbitalny DZIAŁA i czeka wyłącznie na producenta tej misji (dziś: cheat debugowy)');

  // Sprzątamy 500 ms timery batchowania, żeby nie odpaliły w trakcie kolejnych testów.
  for (const e of eah._pendingBattles.values()) if (e.timerId) clearTimeout(e.timerId);
  eah._pendingBattles.clear();
}

// ── T2 — S5: bitwa DSCS omija księgowanie wojny ─────────────────────────────
console.log('T2 — S5: bitwa DSCS w trakcie wojny omija `recordBattle` (zero exhaustion, zero wpisu)');
{
  const core = boot();
  const empireId = empireOf(core);
  const warSys = core.warSystem;

  core.diplomacySystem.declareWar(empireId, 'w3_seams_probe');
  const warBefore = warSys.getWarWith?.(empireId);
  assert(!!warBefore?.active,
    `T2: wojna ISTNIEJE przed bitwą (${warBefore?.id ?? '—'}) — pin ma z czym porównywać, nie z nullem`);

  const exhaustBefore = JSON.stringify(warBefore.exhaustion);
  const battlesBefore = warBefore.battles.length;

  let recordBattleCalls = 0;
  const origRecord = warSys.recordBattle.bind(warSys);
  warSys.recordBattle = (...a) => { recordBattleCalls++; return origRecord(...a); };

  const resolved = [];
  const onResolved = (p) => resolved.push(p);
  EventBus.on('battle:resolved', onResolved);

  // Dwa kadłuby OBOK SIEBIE (team-up gather liczy dystans od midpointu), w stanie bojowym.
  const mine  = spawnHull(core, { name: 'Mój okręt',   x: 0, y: 0 });
  const their = spawnHull(core, { owner: empireId, name: 'Ich okręt', x: 1, y: 1 });

  const dscs = new DeepSpaceCombatSystem(core.vesselManager);
  const enc = dscs.startEngagement(mine.id, their.id);
  assert(!!enc, 'T2: DSCS otworzył starcie dla pary kadłubów w stanie bojowym');

  if (enc) {
    // Wołamy FINALIZE wprost: rundy DSCS są bramkowane ZEGAREM REALNYM
    // (`ROUND_INTERVAL_MS`), więc pętla ticków w headless nie posunęłaby starcia.
    // Szew, który tu mierzymy — emit `warId` + (nie)wywołanie `recordBattle` — mieszka
    // właśnie w `_finalizeBattle`, więc pin trafia w silnik, nie w parafrazę.
    dscs._finalizeBattle(enc, 'A', null);
  }

  EventBus.off('battle:resolved', onResolved);
  warSys.recordBattle = origRecord;

  const warAfter = warSys.getWarWith?.(empireId);
  assert(resolved.length > 0, `T2: DSCS wyemitował battle:resolved (${resolved.length})`);
  // ⚠ ODWRÓCONE W W3-2 — drugi pin luki z tego pliku, który doczekał się naprawy (po T4).
  //   DSCS DALEJ wpisuje `warId: null` na sztywno — i to jest w porządku, bo producent bitwy
  //   ma być czystym dostawcą wyniku (backbone P3). Zmieniło się to, że `WarSystem` przestał
  //   takie starcie ODSYŁAĆ Z NICZYM, gdy strony są w stanie wojny.
  assert(resolved.some(p => p?.warId == null),
    'T2: surowy emit DSCS nadal niesie `warId: null` (DeepSpaceCombatSystem.js:1007) — ' +
    'producent nie księguje, od tego jest WarSystem');
  assert(recordBattleCalls === 1,
    `T2: …ale `.trim() + `\`recordBattle\` przechodzi DOKŁADNIE raz (${recordBattleCalls}) — ` +
    'przed W3-2 było tu ZERO (trzecia cicha ścieżka)');
  assert(JSON.stringify(warAfter?.exhaustion) !== exhaustBefore,
    `T2: exhaustion RUSZYŁO ${exhaustBefore} → ${JSON.stringify(warAfter?.exhaustion)} — wojnę ` +
    'toczoną w przestrzeni głębokiej da się wreszcie zakończyć wyczerpaniem (55-punktowy człon ' +
    'akceptacji pokoju przestał być ślepy na tę walkę)');
  assert(warAfter?.battles.length === battlesBefore + 1,
    `T2: `.trim() + `\`war.battles[]\` urosło (${battlesBefore} → ${warAfter?.battles.length}) — ` +
    'WarOverlay czyta tę tablicę, więc bitwa jest widoczna też dla gracza');
  // Szczegóły (asymetria po wyniku, wyczerpujący widelec, brak re-entrancji, bramka D5,
  // obojętność na `lossesA/B`) mieszkają w `w3_battle_booking_smoke`.
}

// ── T3 — S6: dominacja orbitalna przeżywa wczytanie (ODWRÓCONE w W3-3) ──────
console.log('T3 — S6 naprawione: `orbitalDominance` przeżywa serialize→restore');
{
  boot();
  gameState.set('orbitalDominance.sys_home', { controllerId: 'player', year: 5 }, 'w3_seams_probe');
  gameState.set('invasions.inv_probe', { id: 'inv_probe', active: true }, 'w3_seams_probe');

  assert(gameState.get('orbitalDominance.sys_home')?.controllerId === 'player',
    'T3: dominacja ZAPISANA w żywym stanie — bramka desantu (FleetActions.js:553) ma co czytać');

  const blob = gameState.serialize();
  assert(!!blob?.orbitalDominance?.sys_home,
    'T3: …i trafia do zapisu (serialize nigdy jej nie gubił — strata była po stronie ODCZYTU)');

  gameState.restore(blob);

  assert(gameState.get('orbitalDominance.sys_home')?.controllerId === 'player',
    'T3: po restore dominacja JEST. Do W3-3 znikała, bo `GameState.restore` scala WYŁĄCZNIE ' +
    'klucze najwyższego poziomu z `createDefaultState`, a tego tam nie było — teraz jest. ' +
    'Konsekwencja gameplayowa (bramka desantu po reloadzie): `w3_dominance_persist_smoke` T3');

  // KONTROLA PINU: mechanizm dalej działa NA DEKLARACJI, nie na deep-merge — domena
  // NIEzadeklarowana ma dalej ginąć, inaczej pin wyżej niczego nie dowodzi.
  assert(gameState.get('invasions.inv_probe')?.id === 'inv_probe',
    'T3 KONTROLA PINU: `invasions` przeżywa TĘ SAMĄ podróż…');
  gameState.set('nieZadeklarowanaDomena.x', 1, 'w3_seams_probe');
  gameState.restore(gameState.serialize());
  assert(gameState.get('nieZadeklarowanaDomena') == null,
    'T3 KONTROLA PINU: …a domena NIEzadeklarowana dalej jest wyrzucana — czyli dominację ' +
    'trzyma przy życiu DEKLARACJA, i skasowanie jej wróciłoby prosto do defektu S6');
}

// ── T4 — C-5: podbój ZOSTAJE (ODWRÓCONE w W3-1) ─────────────────────────────
console.log('T4 — C-5 naprawione: po `transferColony` imperium ma ID i ŻYWĄ kolonię');
{
  const core = boot();
  const empireId = empireOf(core);
  const reg = core.empireRegistry;

  // KONTROLA PINU NAJPIERW: resolver W OGÓLE działa dla kolonii, które imperium naprawdę ma.
  const ownBefore = reg.getColoniesByEmpire(empireId);
  const idsBefore = (reg.get(empireId)?.colonies ?? []).length;
  assert(idsBefore > 0 && ownBefore.length === idsBefore,
    `T4 KONTROLA PINU: `.trim() + `\`getColoniesByEmpire\` rozwiązuje WSZYSTKIE własne kolonie ` +
    `AI (${ownBefore.length}/${idsBefore}) — resolver jest sprawny`);

  const victim = core.colonyManager.getPlayerColonies()[0];
  assert(!!victim, `T4: jest kolonia gracza do przejęcia (${victim?.planetId})`);

  const ok = core.colonyManager.transferColony(victim.planetId, empireId, 'w3_seams_probe');
  assert(ok === true, 'T4: transfer wykonany');

  const idsAfter = reg.get(empireId)?.colonies ?? [];
  const resolvedAfter = reg.getColoniesByEmpire(empireId);

  assert(idsAfter.includes(victim.planetId),
    'T4: imperium DOSTAŁO id zdobytej kolonii do `empires[].colonies`');
  // ⚠ ODWRÓCONE W W3-1. Do W3-1 obie asercje niżej pinowały DEFEKT (resolver zwracał pudło,
  //   jedno id wisiało w próżni). Teraz pinują naprawę — a `w3_conquest_persists_smoke`
  //   dowodzi, co z tego wynika: zdobycz produkuje, stempel przeżywa wczytanie zapisu,
  //   a pokonane imperium dotrwa do stołu.
  assert(resolvedAfter.some(c => c?.planetId === victim.planetId),
    'T4: …i `getColoniesByEmpire` ZWRACA ją jako żywy obiekt — `transferColony` przerzuca ' +
    'własność W MIEJSCU (D7), zamiast kasować kolonię');
  assert(resolvedAfter.length === idsAfter.length,
    `T4: żadne id nie wisi w próżni (${resolvedAfter.length} kolonii / ${idsAfter.length} id) — ` +
    'produkcja, badania i logistyka AI widzą zdobycz; przed W3-1 było tu 1 na 2');
}

// ── T5 — C-2: garnizon nie potrafi wrócić do stolicy ────────────────────────
console.log('T5 — C-2: `_holdAtHome` wydaje rozkaz BEZ `targetPoint` → `missing_target_point`');
{
  const core = boot();
  const empireId = empireOf(core);
  const mos = window.KOSMOS.movementOrderSystem;

  const doctrine = new DirectorDoctrine();
  registerDoctrineBehaviors(doctrine, { allowOverride: true });
  window.KOSMOS.directorDoctrine = doctrine;

  const cap = core.colonyManager.getAllColonies().find(c => c.ownerEmpireId === empireId) ?? null;
  window.KOSMOS.directorProduction = { capitalOf: () => cap };
  assert(!!cap, `T5: jest kolonia AI pełniąca rolę stolicy (${cap?.planetId})`);

  // Okręt POZA stolicą — dokładnie ten przypadek, w którym `_holdAtHome` przestaje być
  // wczesnym returnem „już na miejscu" i musi WYDAĆ rozkaz.
  const v = spawnHull(core, { owner: empireId, name: 'Garnizon w drodze', x: 900, y: 900 });
  assert(v.position.dockedAt !== cap.planetId,
    'T5: okręt NIE jest zadokowany przy stolicy — więc doktryna musi wydać rozkaz, a nie trzymać pozycję');

  const seen = [];
  const origIssue = mos.issueOrder.bind(mos);
  mos.issueOrder = (id, spec, opts) => { const r = origIssue(id, spec, opts); seen.push({ spec, r }); return r; };

  const held = doctrine._holdAtHome(v, empireId);

  mos.issueOrder = origIssue;

  assert(held === false,
    'T5: `_holdAtHome` ZAWIÓDŁ — garnizon, który odszedł od stolicy, nie potrafi do niej wrócić');
  assert(seen.length === 1 && seen[0].spec.targetPoint === undefined,
    'T5: …bo spec nie niesie `targetPoint` (DirectorDoctrine.js:140-143), choć komentarz przy ' +
    'bliźniaczym `_sendOnPatrol` (:162-165) wymienia ten wymóg wprost');
  assert(seen[0]?.r?.reason === 'missing_target_point',
    `T5: silnik odrzuca go powodem \`${seen[0]?.r?.reason}\` — walidator wymaga punktu dla ` +
    '`moveToPoint` (MovementOrderTypes.js:52-58)');
  assert(!v.movementOrder,
    'T5: okręt zostaje BEZ rozkazu i wypada z rostera — „doktryna obrony domu" nie broni niczego');

  // KONTROLA PINU: TEN SAM rozkaz z punktem PRZECHODZI — wina jest w brakującym polu,
  // nie w kanale, nie w kadłubie, nie w bramce paliwa.
  const withPoint = origIssue(v.id, {
    type: 'moveToPoint', targetBodyId: cap.planetId,
    targetPoint: { x: 0, y: 0 }, issuedBy: 'w3_seams_probe', bypassFuelCheck: true,
  });
  assert(withPoint?.ok === true,
    `T5 KONTROLA PINU: ten sam rozkaz Z punktem przechodzi (${withPoint?.reason ?? 'ok'}) — ` +
    'defekt to JEDNO brakujące pole, nie zepsuty kanał');
}

// ── T6 — S12: jednostka legacy ginie od pierwszego trafienia; po wczytaniu nie ──
console.log('T6 — S12: jednostka legacy pada od PIERWSZEGO trafienia, a po serialize→restore już nie');
{
  const core = boot();
  const empireId = empireOf(core);
  const gum = core.groundUnitManager;
  const planetId = window.KOSMOS.homePlanet.id;

  window.KOSMOS.combatSystem = new CombatSystem();

  const a = gum.createUnit('infantry', planetId, 0, 0);
  const b = gum.createUnit('infantry', planetId, 0, 0, { owner: empireId });

  assert(!!a && !!b, 'T6: dwie jednostki legacy stoją na tym samym heksie');
  assert(a.morale === undefined && b.morale === undefined,
    'T6: jednostka legacy NIE MA pola `morale` (archetypy z INVASION_UNIT_POOLS nie niosą ' +
    'morale/org/supply) — i to jest cały mechanizm defektu');
  assert(a.hp > 1 && b.hp > 1, `T6: obie mają zapas HP (${a.hp}/${b.hp}) — więc śmierć nie będzie „od obrażeń"`);

  const disbanded = [];
  const onDisband = (p) => disbanded.push(p);
  EventBus.on('groundUnit:disbanded', onDisband);

  window.KOSMOS.combatSystem.tick(1.0);   // jedna runda

  EventBus.off('groundUnit:disbanded', onDisband);

  assert(disbanded.length > 0,
    `T6: po JEDNEJ rundzie rozwiązano ${disbanded.length} jednostk(i) — `.trim() +
    '`morale ?? 0` po trafieniu daje 0, a ten sam przebieg zamiata wszystko z morale ≤ 0 ' +
    '(CombatSystem.js:302-303 → :232-241)');
  // ⚠ Mierzymy HP ROZWIĄZANYCH, nie ocalałych: przy pełnym zamiecie lista ocalałych jest PUSTA,
  //   a `[].every(...)` przechodzi VACUOUSLY — czyli pin nie sprawdzałby niczego. Referencje
  //   `a`/`b` żyją dalej po usunięciu z rejestru, więc czytamy ich ostatnie HP wprost.
  const goneIds = new Set(disbanded.map(d => d.unitId));
  const goneHp = [a, b].filter(u => goneIds.has(u.id)).map(u => u.hp);
  assert(goneHp.length > 0 && goneHp.every(hp => hp > 0),
    `T6: …a rozwiązane jednostki miały PEŁNE HP w chwili rozwiązania (${goneHp.join(', ') || '—'}) — ` +
    'to nie jest śmierć w walce, tylko natychmiastowy rozpad morale');
  assert([a, b].every(u => !gum._units.has(u.id)),
    'T6: obie zniknęły z rejestru po jednej rundzie — wzajemny zamiot, bo defekt dotyka OBU stron ' +
    '(jednostek desantowych AI i własnej piechoty startowej gracza)');

  // Druga połowa — i groźniejsza: TA SAMA jednostka po podróży przez zapis zachowuje się inaczej.
  const fresh = gum.createUnit('infantry', planetId, 5, 5);
  assert(fresh.morale === undefined, 'T6: świeża jednostka legacy nadal bez `morale`');

  const blob = gum.serialize();
  gum.restore(blob);
  const reloaded = gum._units.get(fresh.id);

  assert(!!reloaded, 'T6: jednostka przeżyła serialize→restore');
  assert(reloaded?.morale === 100,
    `T6: …i WRÓCIŁA Z MORALE 100 (${reloaded?.morale}) — `.trim() +
    '`serialize` zapisuje `morale: u.morale ?? 100` (GroundUnitManager.js:1281). Ta sama jednostka ' +
    'przed wczytaniem ginie od pierwszego trafienia, a po wczytaniu NIE. Walka naziemna rozstrzyga ' +
    'się inaczej przed i po zapisie — dziura determinizmu WIĘKSZA niż niezasiane RNG (R13).');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
