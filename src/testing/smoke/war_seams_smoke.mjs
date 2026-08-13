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
//   T3  R2:  uzbrojony kadłub NIE rusza żadnym estymatorem (defekt, który naprawia W1-1)
//   T4  V5:  po naprawie predykatu wpadłyby CUDZE kadłuby i WRAKI — filtr musi wejść razem
//   T5  K-2: `empire.fleets` zostaje puste bez cheatu debugowego
//   T6  K-3: bitwa EAH z PRAWDZIWYM warId omija recordBattle (zero exhaustion, brak w war.battles[])
//
// ⚠ T3 i T4 to PINY DEFEKTU, nie poprawności. W1-1 je NAPRAWIA — wtedy obie asercje mają
//    paść i zostać świadomie odwrócone (wzór: T6 „pin luki" z `director_seams_smoke`).
// ⚠ Harness NIE montuje `stationSystem`, więc żeton stacji z R-3 nigdy nie jest zasiany
//    i AI nie produkuje okrętów wojennych samo. Każdy wrogi kadłub stawiamy tu RĘCZNIE.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EventBus from '../../core/EventBus.js';
import { createVessel } from '../../entities/Vessel.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { estimatePlayerMilitary } from '../../systems/ai/UtilityAI.js';

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
}

// ── T3 — R2: uzbrojony kadłub nie rusza estymatorami (PIN DEFEKTU) ──────────
console.log('T3 — R2 PIN DEFEKTU: uzbrojony kadłub nie rusza ŻADNYM estymatorem');
{
  const core = boot();
  const acs = core.alienCivSystem;

  const beforeUtility = estimatePlayerMilitary();
  const beforeAlien   = acs._estimatePlayerMilitary();
  const armed = spawnHull(core, { name: 'Fregata gracza' });

  assert(Array.isArray(armed.modules) && armed.modules.every(m => typeof m === 'string'),
    'T3: `vessel.modules` to płaska tablica STRINGÓW (grunt, na którym stoi cały defekt R2)');

  // ⚠ W1-1 NAPRAWIA ten defekt — wtedy obie asercje mają paść i zostać odwrócone.
  assert(estimatePlayerMilitary() - beforeUtility === 0,
    'T3: UtilityAI.estimatePlayerMilitary NIE reaguje na uzbrojony kadłub (W1-1 to odwraca)');
  assert(acs._estimatePlayerMilitary() - beforeAlien === 0,
    'T3: AlienCivSystem._estimatePlayerMilitary też NIE reaguje — oba zepsute identycznie');
}

// ── T4 — V5: brak filtru właściciela i wraku (PIN PUŁAPKI) ──────────────────
console.log('T4 — V5 PIN PUŁAPKI: sama naprawa predykatu wpuściłaby CUDZE kadłuby i WRAKI');
{
  const core = boot();
  const enemyId = core.empireRegistry.listAll()[0]?.id ?? 'emp_001';

  spawnHull(core, { name: 'Fregata gracza' });
  spawnHull(core, { name: 'Fregata wroga', owner: enemyId });
  spawnHull(core, { name: 'Wrak', wreck: true });

  // Symulacja NAPRAWIONEGO predykatu BEZ filtru — tyle kadłubów policzyłby W1-1 bez V5.
  const all = core.vesselManager.getAllVessels();
  const armedNoFilter = all.filter(v => (v.modules ?? []).some(m => /^weapon_/.test(String(m))));
  const foreignOrDead = armedNoFilter.filter(v => v.isWreck || (v.ownerEmpireId && v.ownerEmpireId !== 'player'));

  assert(armedNoFilter.length >= 3,
    `T4: naprawiony predykat widzi uzbrojone kadłuby (${armedNoFilter.length}) — sam predykat DZIAŁA`);
  assert(foreignOrDead.length === 2,
    `T4: z tego ${foreignOrDead.length} to CUDZE lub MARTWE — filtr właściciela i wraku MUSI wejść ` +
    'w tym samym commicie co naprawa predykatu (V5), inaczej „siła gracza" liczy flotę wroga');
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
