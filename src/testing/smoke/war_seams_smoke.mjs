// W1 — keeper szwów wojny (commit W1-0, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: audyt W1 (`docs/design/W1_PLAN.md`) OBALIŁ dwa ostrzeżenia kopiowane przez
// cztery dokumenty jako pewnik (K-1, K-2) i ZAOSTRZYŁ trzecie (K-3). Cały kształt slice'u
// stoi na tych trzech twierdzeniach. Ten keeper pinuje je WYKONANIEM, żeby żadne z nich
// nie zmieniło się po cichu w trakcie W1 — i żeby następny czytelnik nie musiał wierzyć
// dokumentowi na słowo.
// Pomiar jednorazowy (kurier, wieloseedowość, liczby) siedzi w sondzie:
//   node src/testing/headless/probe-war-seams.mjs
//
//   T1  K-1: LICZNIKA nie ma — `createEmpire` wycina `military`, `updateMilitaryPower` to no-op
//   T2  K-1: milRatio ≡ 0 dla każdego imperium + KONTROLA PINU (z licznikiem wychodzi ≠ 0)
//   T3  R2:  uzbrojony kadłub GRACZA rusza OBOMA estymatorami; sam pancerz/tarcza — NIE (V4)
//   T4  V5:  CUDZY kadłub i WRAK nie podnoszą „siły gracza"; kolonie liczone tylko GRACZA (V1)
//   T5  K-2: `empire.fleets` zostaje puste bez cheatu debugowego
//   T6  K-3: bitwa EAH z PRAWDZIWYM warId omija recordBattle (zero exhaustion, brak w war.battles[])
//
// ⚠ T3 i T4 były w W1-0 PINAMI DEFEKTU (estymator NIE reagował, filtru NIE było). W1-1 to
//    naprawił, więc obie zostały ŚWIADOMIE ODWRÓCONE — wzór „pin luki" z `director_seams_smoke` T6.
//    T2 (milRatio ≡ 0) celowo NIE ruszone: to jest dowód, że naprawa R2 niczego nie przesunęła.
// ⚠ Harness NIE montuje `stationSystem`, więc żeton stacji z R-3 nigdy nie jest zasiany
//    i AI nie produkuje okrętów wojennych samo. Każdy wrogi kadłub stawiamy tu RĘCZNIE.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EventBus from '../../core/EventBus.js';
import { createVessel } from '../../entities/Vessel.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { estimatePlayerMilitary } from '../../systems/ai/UtilityAI.js';
import { MilitaryAI } from '../../systems/ai/MilitaryAI.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP_MODULES = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

/** Kopia arytmetyki `AlienCivSystem.js:106` — CELOWO dosłowna, żeby pin mierzył
 *  formułę silnika, a nie parafrazę keepera. */
const milRatioOf = (emp, playerEstimate) =>
  playerEstimate > 0 ? (emp.military?.power ?? 0) / playerEstimate : 1.0;

function boot(civYears = 0) {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  if (civYears > 0) new Ticker(core.timeSystem).run(civYears, { tickSize: 1.0, stopOnCrash: true });
  return core;
}

/** Uzbrojony kadłub wstawiony wprost do rejestru — patrz nota o stationSystem w nagłówku. */
function spawnHull(core, { owner = null, wreck = false, name = 'Kadłub' } = {}) {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel('hull_frigate', home.id, {
    name, modules: [...WARSHIP_MODULES],
    x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  if (wreck) v.isWreck = true;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

// ── T1 — K-1: licznik `empire.military.power` nie ma jak powstać ────────────
console.log('T1 — K-1: whitelist createEmpire wycina `military`; updateMilitaryPower to no-op');
{
  const core = boot();
  const reg = core.empireRegistry;

  // Dokładnie to robią SpawnTestEnemy.js:97 i CombatSandbox.js:383 — i oba są ignorowane.
  const emp = reg.createEmpire({
    id: 'emp_seamprobe', archetype: 'industrialist',
    military: { power: 200 }, resources: { production: 999 },
  });
  assert(emp.military === undefined,
    'T1: createEmpire({military:{power:200}}) MILCZĄCO wycina klucz — licznika nie da się przemycić');
  assert(emp.resources === undefined,
    'T1: ta sama whitelist wycina `resources` (druga połowa V6)');

  reg.updateMilitaryPower('emp_seamprobe', 500, 'keeper');
  assert(reg.get('emp_seamprobe')?.military?.power === undefined,
    'T1: updateMilitaryPower(+500) nie zapisuje NIC — drugiej drogi do licznika brak');
}

// ── T2 — K-1: milRatio ≡ 0 + kontrola pinu ──────────────────────────────────
console.log('T2 — K-1: milRatio ≡ 0 dla każdego imperium (i pin NIE jest martwy)');
{
  const core = boot();
  const empires = core.empireRegistry.listAll();
  const estimate = core.alienCivSystem._estimatePlayerMilitary();

  assert(empires.length > 0, `T2: partia ma imperia AI (${empires.length}) — jest co mierzyć`);
  assert(estimate > 0, `T2: MIANOWNIK estymatora jest dodatni (${estimate}) — ternary zawsze dzieli, nie ucieka w 1.0`);

  const ratios = empires.map(e => milRatioOf(e, estimate));
  assert(ratios.every(r => r === 0),
    `T2: milRatio ≡ 0 dla wszystkich ${ratios.length} imperiów — naprawa R2 NIE MOŻE wepchnąć nikogo ` +
    'w AGGRESSIVE/WAR (ostrzeżenie z czterech dokumentów jest FAŁSZYWE)');

  // KONTROLA PINU — bez niej „≡ 0" jest nieodróżnialne od asercji, która nic nie liczy.
  // To jest też dowód fail-first: dopisanie writera `military.power` MUSI zaczerwienić T2.
  assert(milRatioOf({ military: { power: 300 } }, estimate) > 0,
    'T2 KONTROLA PINU: ta sama formuła z licznikiem 300 daje wartość > 0 — zero powyżej pochodzi ' +
    'z BRAKU DANYCH, nie z martwego pinu');

  // ⚠ „Brak obserwowalnej zmiany" to OBIETNICA commitu W1-1 — pinujemy ją WYKONANIEM, nie
  //   argumentem. Oba czasowniki MilitaryAI czytające estymator mają wcześniejsze bramki:
  //   `build_fleet` wychodzi na bramce `production` (empire.resources wycięte whitelistą, T1),
  //   `attack_player` na pustej liście flot (K-2, T5). Naprawiony estymator NIE MOŻE więc
  //   wyprodukować decyzji, której wcześniej nie było — nawet uzbrojony po zęby.
  for (let i = 0; i < 3; i++) spawnHull(core, { name: `Fregata gracza ${i}` });
  const decisions = empires.map(e => MilitaryAI.tick(e.id)).filter(d => d && d.score > 0);
  assert(decisions.length === 0,
    `T2: MilitaryAI nie podejmuje ŻADNEJ akcji (score > 0) mimo 3 uzbrojonych kadłubów gracza ` +
    `i naprawionego estymatora (${estimate} → ${core.alienCivSystem._estimatePlayerMilitary()}) — ` +
    'obietnica „naprawa R2 niczego nie przesuwa" dowiedziona wykonaniem');
}

// ── T3 — R2: uzbrojony kadłub GRACZA rusza oboma estymatorami (NAPRAWIONE w W1-1) ──
console.log('T3 — R2: uzbrojony kadłub GRACZA rusza OBOMA estymatorami');
{
  const core = boot();
  const acs = core.alienCivSystem;

  const beforeUtility = estimatePlayerMilitary();
  const beforeAlien   = acs._estimatePlayerMilitary();
  const armed = spawnHull(core, { name: 'Fregata gracza' });

  assert(Array.isArray(armed.modules) && armed.modules.every(m => typeof m === 'string'),
    'T3: `vessel.modules` to płaska tablica STRINGÓW (grunt, na którym stał cały defekt R2)');

  // ⚠ Do W1-0 włącznie te dwie asercje pinowały DEFEKT (Δ === 0). W1-1 naprawił predykat,
  //   więc zostały ŚWIADOMIE ODWRÓCONE — wzór „pin luki" z `director_seams_smoke` T6.
  assert(estimatePlayerMilitary() - beforeUtility === 30,
    `T3: UtilityAI.estimatePlayerMilitary REAGUJE na uzbrojony kadłub (+30, było +0 przed W1-1)`);
  assert(acs._estimatePlayerMilitary() - beforeAlien === 30,
    'T3: AlienCivSystem._estimatePlayerMilitary reaguje TAK SAMO — bliźniaki naprawione zgodnie');

  // Zawężenie znaczenia z V4, podpisane: sam pancerz/tarcza to NIE jest uzbrojenie.
  // Stary (zepsuty) regex łapał `armor_|shield_`; gdyby kiedyś wrócił, ta asercja to złapie.
  const beforeArmorOnly = estimatePlayerMilitary();
  const armorOnly = createVessel('hull_frigate', window.KOSMOS.homePlanet.id, {
    name: 'Kadłub bez broni', modules: ['engine_ion', 'armor_standard', 'shield_basic'],
    x: 0, y: 0, systemId: 'sys_home',
  });
  core.vesselManager._vessels.set(armorOnly.id, armorOnly);
  assert(estimatePlayerMilitary() - beforeArmorOnly === 0,
    'T3: kadłub z SAMYM pancerzem i tarczą NIE liczy się jako bojowy (zawężenie V4, podpisane)');
}

// ── T4 — V5: filtr właściciela i wraku DZIAŁA (NAPRAWIONE w W1-1) ───────────
console.log('T4 — V5: estymator NIE liczy cudzych kadłubów ani wraków');
{
  const core = boot();
  const enemyId = core.empireRegistry.listAll()[0]?.id ?? 'emp_001';

  const baseline = estimatePlayerMilitary();
  spawnHull(core, { name: 'Fregata gracza' });
  const afterOwn = estimatePlayerMilitary();

  spawnHull(core, { name: 'Fregata wroga', owner: enemyId });
  spawnHull(core, { name: 'Wrak', wreck: true });
  const afterForeign = estimatePlayerMilitary();

  // KONTROLA PINU: najpierw dowodzimy, że licznik W OGÓLE reaguje (inaczej „nie wzrósł"
  // po wrogu przechodziłoby dlatego, że nic nigdy nie rośnie).
  assert(afterOwn - baseline === 30,
    `T4 KONTROLA PINU: WŁASNY uzbrojony kadłub podnosi estymator o 30 (${baseline} → ${afterOwn})`);
  assert(afterForeign === afterOwn,
    `T4: CUDZY kadłub i WRAK nie podnoszą go ani o jotę (${afterOwn} → ${afterForeign}) — ` +
    'filtr z V5 wszedł tym samym commitem co naprawa predykatu');

  // V1 — drugi wyciek w tej samej funkcji: człon kolonii liczył WSZYSTKIE, także AI.
  const aiColonies = core.colonyManager.getAllColonies().filter(c => c.ownerEmpireId && c.ownerEmpireId !== 'player');
  const playerColonies = core.colonyManager.getPlayerColonies();
  assert(playerColonies.length < core.colonyManager.getAllColonies().length || aiColonies.length === 0,
    `T4: rozróżnienie kolonii istnieje (gracz ${playerColonies.length} / AI ${aiColonies.length})`);
  assert(estimatePlayerMilitary() === 100 + 30 + playerColonies.length * 40,
    `T4: estymator = baza 100 + 30 za własny kadłub + 40 × kolonie GRACZA (${playerColonies.length}) — ` +
    'kolonie AI NIE podnoszą już „siły gracza" (V1)');
}

// ── T5 — K-2: abstrakcyjna księga flot zostaje pusta ────────────────────────
console.log('T5 — K-2: `empire.fleets` puste przez całą partię bez cheatu debugowego');
{
  const core = boot(120);
  const empires = core.empireRegistry.listAll();
  const total = empires.reduce((s, e) => s + (e.fleets ?? []).length, 0);

  assert(empires.length > 0, `T5: są imperia do sprawdzenia (${empires.length})`);
  assert(total === 0,
    `T5: Σ wpisów w `.trim() + '`empire.fleets` = 0 po 120 civY — „okres przejściowy, w którym oba ' +
    'istnieją" jest PUSTY (K-2), więc derived strength wchodzi jako czysty read-model');
}

// ── T6 — K-3: bitwa EAH z warId omija recordBattle ──────────────────────────
console.log('T6 — K-3: bitwa EnemyAttackHandler niesie warId i OMIJA recordBattle');
{
  const core = boot(12);
  const K = window.KOSMOS;
  const warSys = core.warSystem;
  const home = K.homePlanet;
  const empireId = core.empireRegistry.listAll()[0]?.id;

  let recordBattleCalls = 0;
  const origRecord = warSys.recordBattle.bind(warSys);
  warSys.recordBattle = (...a) => { recordBattleCalls++; return origRecord(...a); };

  // ⚠ Wojnę deklarujemy SAMI, PRZED bitwą — inaczej „exhaustion się nie zmieniło" przechodzi
  //   VACUOUSLY: EAH deklaruje wojnę dopiero w trakcie, więc stan „przed" byłby nullem i pin
  //   porównywałby się z nieistniejącą wojną. To jest też dokładnie scenariusz z GATE 2:
  //   atak orbitalny W TRAKCIE zadeklarowanej wojny.
  core.diplomacySystem.declareWar(empireId, 'keeper_seam_probe');

  const enemy = spawnHull(core, { name: 'Najeźdźca', owner: empireId });
  enemy.position.state = 'orbiting';
  enemy.position.dockedAt = home.id;
  enemy.systemId = 'sys_home';

  const eah = new EnemyAttackHandler();
  // Omijamy WYŁĄCZNIE 500 ms timer batchowania — reszta ścieżki jest prawdziwa.
  eah._pendingBattles.set(home.id, {
    arrivedVesselIds: new Set([enemy.id]),
    firstVesselYear:  K.timeSystem?.gameTime ?? 0,
    timerId: null,
  });

  const resolved = [];
  const onResolved = (p) => resolved.push(p);
  EventBus.on('battle:resolved', onResolved);

  const warBefore = warSys.getWarWith?.(empireId);
  assert(!!warBefore?.active,
    `T6: wojna ISTNIEJE przed bitwą (${warBefore?.id ?? '—'}) — pin ma z czym porównywać, nie z nullem`);
  const battlesBefore = warBefore ? warBefore.battles.length : 0;
  const exhaustBefore = warBefore ? JSON.stringify(warBefore.exhaustion) : null;

  eah._resolveBatchedBattle(home.id);

  EventBus.off('battle:resolved', onResolved);
  warSys.recordBattle = origRecord;

  const warAfter = warSys.getWarWith?.(empireId);
  const withWarId = resolved.filter(p => p?.warId);

  assert(withWarId.length > 0,
    `T6: EAH wyemitował battle:resolved z PRAWDZIWYM warId (${withWarId[0]?.warId ?? '—'}) ` +
    '— wojnę deklaruje SAM, jeśli jej nie ma');
  assert(recordBattleCalls === 0,
    'T6: …i ani razu nie dotknął recordBattle — JEDYNEGO producenta exhaustion (K-3)');
  assert(!!warAfter && warAfter.battles.length === battlesBefore,
    `T6: bitwa NIE dopisała się do war.battles[] (${battlesBefore} → ${warAfter?.battles.length}) ` +
    '— jest niewidoczna nawet w WarOverlay, który czyta tę tablicę');
  assert(!!warAfter && JSON.stringify(warAfter.exhaustion) === exhaustBefore,
    'T6: exhaustion bajt w bajt bez zmian — akceptacja pokoju (waga 55) systematycznie ZANIŻA ' +
    'cenę pokoju dokładnie w wojnach realnie toczonych');

  // KONTROLA PINU — porównanie exhaustion MUSI umieć wykryć zmianę, inaczej „bez zmian"
  // jest tautologią (np. gdyby obiekt wojny był zamrożony albo getWarWith zwracał kopię).
  warSys.changeExhaustion(warAfter.id, warAfter.aggressor, 15, 'pin_control');
  assert(JSON.stringify(warSys.getWarWith(empireId)?.exhaustion) !== exhaustBefore,
    'T6 KONTROLA PINU: jawny changeExhaustion(+15) JEST wykrywany tym samym porównaniem — ' +
    'zero powyżej pochodzi z braku księgowania, nie z martwej asercji');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
