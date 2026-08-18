// W3 — keeper rozkazu uderzenia (commit W3-4, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: audyt W3 (szwy S2+S3) pokazał, że pierwsza zdolność ofensywna AI to NIE nowy kod walki,
// tylko PRODUCENT jednego typu misji. Cały potok uderzenia orbitalnego istnieje i jest poprawny
// (batchowanie, automatyczne wypowiedzenie wojny, `recordBattle`, dominacja, wraki), ale
// `EnemyAttackHandler` bramkuje go na `mission.type === 'attack'` — a jedynym producentem tej
// misji w drzewie był debugowy `SpawnTestEnemy`. Jedyny żywy kanał rozkazów AI budował
// `move_to_point`. Te dwa fakty nigdy nie zostały złączone: flota AI mogła dolecieć nad planetę
// gracza i NIC się nie działo.
//
//   T1  ⚠ ODWRACA `w3_seams_smoke` T1: rozkaz `attack` na ciało gracza rodzi misję `attack`,
//       a przylot OTWIERA bitwę w EAH. KONTROLA PINU: `moveToPoint` na to samo ciało dalej
//       daje `move_to_point` i ZERO bitew — czyli bitwę otwiera ZAMIAR, nie sam przylot.
//   T2  `attack` jest DELEGATEM do `moveToPoint`, nie drugą implementacją lotu: ta sama trasa,
//       ten sam cel-ciało, to samo domknięcie rozkazu przy przylocie.
//   T3  ⚠ ODWRACA `w3_seams_smoke` T5: `_holdAtHome` na okręcie Z DALA od stolicy PRZECHODZI
//       (było `missing_target_point`). KONTROLA PINU: patrol niezmieniony.
//   T4  D6 — kadłub w REZERWIE nie dostaje ŻADNEGO rozkazu ruchu (`vessel_in_reserve`), łącznie
//       z nowym `attack` i z `pursue`, który omijał bramkowany `dispatchOnMission`.
//       KONTROLA PINU: ten sam kadłub w służbie przechodzi.
//   T5  i18n obu powodów w OBU słownikach — klucz `vessel.reason<Pascal>` jest budowany
//       INTERPOLACJĄ (`UIManager:824`, `RightClickMenu:330`), więc `check-i18n` go NIE widzi
//       i literówka zeszłaby do gracza jako surowy kod (precedens `w2_deploy_ui` T6).
//   T6  bramka portu kosmicznego NIE odrzuca po cichu startów AI — i pomiar mówi DLACZEGO
//       (cały katalog AI to kadłuby `small`), więc pin łapie dzień, w którym przestanie.
//
// ⚠ Harness NIE montuje `MovementOrderSystem`, `EnemyAttackHandler` ani Directora — stawiamy je
//    tu ręcznie (wzór `w3_seams_smoke`).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import { createVessel } from '../../entities/Vessel.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { DirectorDoctrine, registerDoctrineBehaviors } from '../../systems/director/DirectorDoctrine.js';
import { ORDER_TYPES, validateOrder } from '../../data/MovementOrderTypes.js';
import { needsSpaceportForVessel } from '../../utils/SpaceportCheck.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_TEMPLATES } from '../../data/ShipTemplateData.js';
import { resolveTemplate } from '../../utils/ShipTemplateResolver.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  // ⚠ ZAWSZE nowa instancja MOS: każdy boot() ma NOWY VesselManager, a MOS trzyma referencję
  //   do swojego (lekcja z `war_doctrine_smoke` boot()).
  window.KOSMOS.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  return core;
}

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

/** Kolonia AI w roli stolicy + atrapa `capitalOf` — harness nie montuje DirectorProduction
 *  (ten sam wzór co `war_doctrine_smoke.setupCapital`; stolica NIGDY po nazwie, zawsze po stemplu). */
function setupCapital(core, empireId) {
  const cap = core.colonyManager.getAllColonies().find(c => c.ownerEmpireId === empireId) ?? null;
  window.KOSMOS.directorProduction = { capitalOf: () => cap };
  return cap;
}

/** Doprowadza statek do celu bez czekania na zegar: przewija misję na moment przylotu. */
function fastForwardArrival(core, vessel) {
  const m = vessel.mission;
  if (!m) return null;
  window.KOSMOS.timeSystem.gameTime = (m.arrivalYear ?? 0) + 0.001;
  core.vesselManager._updatePositions(0.01);
  return m;
}

// ── T1 — rozkaz `attack` otwiera bitwę (odwrócenie w3_seams T1) ─────────────
console.log('T1 — ⚠ ODWRÓCONE: rozkaz `attack` na ciało gracza KOŃCZY SIĘ BITWĄ');
{
  const core = boot();
  const empireId = empireOf(core);
  const home = window.KOSMOS.homePlanet;
  const mos = window.KOSMOS.movementOrderSystem;
  const eah = new EnemyAttackHandler();

  // KONTROLA PINU NAJPIERW: ten sam kadłub, ten sam cel, ale rozkaz RUCHU — dalej cisza.
  const mover = spawnHull(core, { owner: empireId, name: 'Kurier', x: 400, y: 400 });
  const rMove = mos.issueOrder(mover.id, {
    type: 'moveToPoint', targetBodyId: home.id,
    targetPoint: { x: home.x ?? 0, y: home.y ?? 0 },
    issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });
  assert(rMove?.ok === true && mover.mission?.type === 'move_to_point',
    `T1 KONTROLA PINU: rozkaz RUCHU dalej buduje \`move_to_point\` (${mover.mission?.type})`);
  fastForwardArrival(core, mover);
  assert(eah._pendingBattles.size === 0,
    'T1 KONTROLA PINU: …i przylot z tą misją NIE otwiera bitwy (0 oczekujących) — czyli to ' +
    'ZAMIAR decyduje, a nie sam fakt, że wrogi kadłub dotarł nad planetę');

  // A teraz to samo z zamiarem uderzenia.
  const striker = spawnHull(core, { owner: empireId, name: 'Napastnik', x: 500, y: 500 });
  const res = mos.issueOrder(striker.id, {
    type: 'attack', targetBodyId: home.id,
    issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });
  assert(res?.ok === true, `T1: kanał rozkazów PRZYJMUJE \`attack\` (${res?.reason ?? 'ok'})`);
  assert(striker.mission?.type === 'attack',
    `T1: misja ma typ \`${striker.mission?.type}\` — dokładnie ten, którego wymaga ` +
    'EnemyAttackHandler (`:41`). To jest CAŁE brakujące ogniwo uderzenia w stolicę.');
  assert(striker.mission?.targetId === home.id,
    'T1: …a `mission.targetId` to CIAŁO, bo EAH czyta je jako `targetPlanetId`');

  const arrivedMission = fastForwardArrival(core, striker);
  assert(striker.position.dockedAt === home.id && striker.position.state === 'orbiting',
    'T1: przylot dokuje napastnika przy celu (tego stanu EAH szuka 500 ms później)');
  assert(arrivedMission?.type === 'attack',
    'T1: …a misja NIESIONA W ZDARZENIU dalej jest atakiem, choć rozkaz się domknął — EAH ' +
    'czyta parametr zdarzenia, nie `vessel.mission`, więc kolejność subskrybentów nie gra roli');
  assert(eah._pendingBattles.size === 1,
    `T1 SEDNO: przylot OTWIERA bitwę (${eah._pendingBattles.size} oczekująca). Przed W3-4 ` +
    'żaden rozkaz AI nie potrafił tego zrobić — potok istniał, brakowało producenta misji.');
}

// ── T2 — attack jest delegatem, nie drugą implementacją lotu ────────────────
console.log('T2 — `attack` to `moveToPoint` z innym ZAMIAREM (delegat, nie kopia)');
{
  const core = boot();
  const empireId = empireOf(core);
  const home = window.KOSMOS.homePlanet;
  const mos = window.KOSMOS.movementOrderSystem;

  const a = spawnHull(core, { owner: empireId, name: 'A', x: 600, y: 0 });
  const b = spawnHull(core, { owner: empireId, name: 'B', x: 600, y: 0 });

  mos.issueOrder(a.id, {
    type: 'moveToPoint', targetBodyId: home.id,
    targetPoint: { x: home.x ?? 0, y: home.y ?? 0 },
    issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });
  mos.issueOrder(b.id, {
    type: 'attack', targetBodyId: home.id,
    issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });

  assert(Math.abs((a.mission?.arrivalYear ?? 0) - (b.mission?.arrivalYear ?? -1)) < 1e-9,
    'T2: identyczny ETA z tej samej pozycji — trasa, prędkość i predykcja pozycji ciała są ' +
    'WSPÓLNYM kodem, nie skopiowanym');
  assert(Math.abs((a.mission?.fuelCost ?? 0) - (b.mission?.fuelCost ?? -1)) < 1e-9,
    'T2: identyczny koszt paliwa — uderzenie nie ma własnej ekonomii lotu');
  assert(b.movementOrder?.type === ORDER_TYPES.attack,
    `T2: …ale ROZKAZ nazywa się \`${b.movementOrder?.type}\` (rejestr mówi prawdę o zamiarze)`);

  // Domknięcie rozkazu przy przylocie — inaczej `_byVessel` trzymałoby uderzenie w nieskończoność.
  fastForwardArrival(core, b);
  assert(b.movementOrder?.status === 'completed',
    `T2: rozkaz uderzenia DOMYKA SIĘ przy przylocie (${b.movementOrder?.status}) — nie zostaje ` +
    'aktywny na zawsze w indeksie MOS');

  // Walidator: cel-CIAŁO jest wymagany (punkt dokłada `_issueAttack`).
  assert(validateOrder({ type: 'attack' }).reason === 'missing_target_body',
    'T2: walidator wymaga `targetBodyId` dla `attack` (uderza się w CIAŁO, nie w pustkę)');
  assert(validateOrder({ type: 'attack', targetBodyId: 'entity_1' }).valid === true,
    'T2: …i NIE wymaga punktu — ten dolicza producent, żeby nie powtórzyć pułapki `_holdAtHome`');
}

// ── T3 — _holdAtHome (odwrócenie w3_seams T5) ───────────────────────────────
console.log('T3 — ⚠ ODWRÓCONE: `_holdAtHome` z dala od stolicy PRZECHODZI');
{
  const core = boot();
  const empireId = empireOf(core);
  const mos = window.KOSMOS.movementOrderSystem;
  registerDoctrineBehaviors();
  const doctrine = new DirectorDoctrine();

  const cap = setupCapital(core, empireId);
  const capitalId = cap?.planetId;
  assert(!!capitalId, `T3: stolica AI rozwiązana przez kanoniczny resolver (${capitalId})`);

  const far = spawnHull(core, { owner: empireId, name: 'Wracający', x: 9000, y: 9000 });
  const ok = doctrine._holdAtHome(far, empireId);
  assert(ok === true,
    'T3 SEDNO: garnizon Z DALA od stolicy DOSTAJE rozkaz powrotu. Przed W3-4 leciało tu ' +
    '`missing_target_point`, `_issue` wypisywał warna i okręt wypadał z doboru — czyli ' +
    'doktryna obrony domu działała TYLKO dla okrętów, które i tak już stały w domu');
  assert(far.movementOrder?.type === ORDER_TYPES.moveToPoint,
    'T3: rozkaz to ruch (garnizon wraca, nie atakuje)');
  assert(far.mission?.targetId === capitalId,
    'T3: …i celuje w CIAŁO stolicy, więc statek ją ORBITUJE po dotarciu');

  // KONTROLA PINU: gałąź HOLD (już na miejscu) nadal NIE wydaje rozkazu.
  const athome = spawnHull(core, { owner: empireId, name: 'Na miejscu', dockedAt: capitalId });
  const okHold = doctrine._holdAtHome(athome, empireId);
  assert(okHold === true && athome.movementOrder == null,
    'T3 KONTROLA PINU: okręt JUŻ przy stolicy dalej trzyma pozycję BEZ rozkazu (trzymanie to ' +
    'brak ruchu; rozkaz na własną orbitę zwolniłby ją w OrbitalSpaceSystem — desync z Engage)');

  // KONTROLA PINU: patrol, druga gałąź tej samej akcji, niezmieniony.
  const patroller = spawnHull(core, { owner: empireId, name: 'Patrol', dockedAt: capitalId });
  const okPatrol = doctrine._sendOnPatrol(patroller, empireId, 10);
  assert(okPatrol === true && patroller.movementOrder?.type === ORDER_TYPES.moveToPoint,
    'T3 KONTROLA PINU: patrol dalej przechodzi tą samą drogą (naprawa nie ruszyła bliźniaka)');
}

// ── T4 — D6: rezerwa nie przyjmuje rozkazów ─────────────────────────────────
console.log('T4 — D6: kadłub w REZERWIE nie dostaje żadnego rozkazu ruchu');
{
  const core = boot();
  const empireId = empireOf(core);
  const home = window.KOSMOS.homePlanet;
  const mos = window.KOSMOS.movementOrderSystem;

  const stored = spawnHull(core, { name: 'Magazyn', x: 300, y: 300 });
  stored.serviceState = 'stored';
  const target = spawnHull(core, { owner: empireId, name: 'Cel', x: 320, y: 300 });

  const rMove = mos.issueOrder(stored.id, {
    type: 'moveToPoint', targetPoint: { x: 100, y: 100 }, issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });
  assert(rMove?.ok === false && rMove?.reason === 'vessel_in_reserve',
    `T4: ruch odrzucony powodem \`${rMove?.reason}\``);

  const rPursue = mos.issueOrder(stored.id, {
    type: 'pursue', targetEntityId: target.id, issuedBy: 'w3_attack_probe',
  });
  assert(rPursue?.ok === false && rPursue?.reason === 'vessel_in_reserve',
    `T4 SEDNO: POŚCIG też (\`${rPursue?.reason}\`) — to była realna dziura: ` +
    '`_issuePursueOrIntercept` startuje z pominięciem bramkowanego `dispatchOnMission`, więc ' +
    'menu PPM latało magazynem (darmowy okręt, zero załogi, 10 % utrzymania)');

  const rAttack = mos.issueOrder(stored.id, {
    type: 'attack', targetBodyId: home.id, issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });
  assert(rAttack?.ok === false && rAttack?.reason === 'vessel_in_reserve',
    'T4: nowy rozkaz `attack` dziedziczy bramkę z urzędu (stoi PRZED rozgałęzieniem na typy)');
  assert(stored.mission == null && stored.movementOrder == null,
    'T4: odmowa nie zostawia śmieci — bramka stoi PRZED mutacją stanu');

  // KONTROLA PINU: ten sam kadłub w służbie przechodzi. Bez tego „odmowa" byłaby
  // nieodróżnialna od zepsutego rozkazu.
  stored.serviceState = 'active';
  const rOk = mos.issueOrder(stored.id, {
    type: 'attack', targetBodyId: home.id, issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });
  assert(rOk?.ok === true,
    `T4 KONTROLA PINU: TEN SAM kadłub w SŁUŻBIE przechodzi (${rOk?.reason ?? 'ok'}) — bramkuje ` +
    'stan służby, nie coś innego');

  // …i drugi kierunek: `mobilizing` NIE jest służbą (W2 — jedna oś, jeden predykat).
  const mobilizing = spawnHull(core, { name: 'W trakcie', x: 350, y: 350 });
  mobilizing.serviceState = 'mobilizing';
  const rMob = mos.issueOrder(mobilizing.id, {
    type: 'moveToPoint', targetPoint: { x: 100, y: 100 }, issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });
  assert(rMob?.ok === false && rMob?.reason === 'vessel_in_reserve',
    'T4: `mobilizing` też odrzucone — W2 podpisał, że mobilizacja NIE jest służbą');

  // Stary zapis / spawn spoza stoczni (brak pola) = służba. Inaczej W3-4 unieruchomiłby flotę.
  const legacy = spawnHull(core, { name: 'Legacy', x: 360, y: 360 });
  delete legacy.serviceState;
  const rLegacy = mos.issueOrder(legacy.id, {
    type: 'moveToPoint', targetPoint: { x: 100, y: 100 }, issuedBy: 'w3_attack_probe', bypassFuelCheck: true,
  });
  assert(rLegacy?.ok === true,
    'T4: kadłub BEZ pola `serviceState` (stary zapis, spawn spoza stoczni) dalej lata — ' +
    'gdyby nie to, bramka unieruchomiłaby całą flotę z zapisów sprzed W2');
}

// ── T5 — i18n obu powodów w obu słownikach ──────────────────────────────────
console.log('T5 — klucze powodów w OBU słownikach (klucz budowany interpolacją, checker go nie widzi)');
{
  const KEYS = ['vessel.reasonVesselInReserve', 'vessel.reasonVesselImmobilized'];
  for (const k of KEYS) {
    assert(typeof PL[k] === 'string' && PL[k].length > 0, `T5: PL ma \`${k}\``);
    assert(typeof EN[k] === 'string' && EN[k].length > 0, `T5: EN ma \`${k}\``);
  }
  // KONTROLA PINU: klucz zmyślony NIE istnieje — inaczej test przechodziłby na wszystkim.
  assert(PL['vessel.reasonNieMaTakiego'] === undefined,
    'T5 KONTROLA PINU: nieistniejący klucz jest `undefined` — słownik naprawdę jest sprawdzany');
}

// ── T6 — bramka portu nie odrzuca po cichu startów AI ───────────────────────
console.log('T6 — bramka portu kosmicznego a starty AI (pomiar, nie założenie)');
{
  const aiHulls = Object.keys(SHIP_TEMPLATES)
    .map(id => resolveTemplate(id, { isResearched: () => true }))
    .filter(r => r?.ok)
    .map(r => r.hullId);
  assert(aiHulls.length >= 3, `T6: katalog AI rozwiązuje się na kadłuby (${aiHulls.join(', ')})`);
  assert(aiHulls.every(h => needsSpaceportForVessel({ shipId: h }) === false),
    'T6: ŻADEN kadłub z katalogu AI nie wymaga portu (wszystkie `size: small`) — dlatego bramka ' +
    'portu NIE odrzuca dziś startów AI i `DirectorDoctrine` nie musi jej omijać');

  // ⚠ KONTROLA PINU **i jednocześnie ostrzeżenie na przyszłość**: bramka ŻYJE. Dzień, w którym
  //   katalog dostanie niszczyciel (`hull_destroyer`, `size: medium`), jest dniem, w którym
  //   starty AI ze stolicy BEZ portu zaczną być odrzucane po cichu jako `no_spaceport_at_origin`.
  assert(needsSpaceportForVessel({ shipId: 'hull_destroyer' }) === true &&
         HULLS.hull_destroyer?.size === 'medium',
    'T6 KONTROLA PINU: `hull_destroyer` (medium) portu WYMAGA — bramka nie jest atrapą, ' +
    'jest po prostu nieaktywna dla dzisiejszego katalogu AI');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
