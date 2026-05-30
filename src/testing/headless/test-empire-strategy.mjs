// ═══════════════════════════════════════════════════════════════
// Smoke test — EmpireStrategySystem (Warstwa C: decyzje kolonizacji AI)
// Uruchom: node src/testing/headless/test-empire-strategy.mjs
// ───────────────────────────────────────────────────────────────
// Slice 2 / Sesja 2. Harness jak test-bootstrap-colony.mjs: realny
// ColonyManager + EmpireRegistry + EntityManager + permisywny techStub.
// Dodatkowo: window.KOSMOS.empireColonyBootstrap (EXEC) + starSystemManager stub.
//
//   T1-T8:   konstruktor + helpery (mother, mergeCosts, koszty, canAfford, scoring)
//   T9-T10:  P1 + atomic debit outpostu
//   T11-T12: P3 pełna kolonia breathable + transfer POP/zasobów
//   T13:     bramka food (próg = transfer = 200)
//   T14:     fallback (dowolny rocky gdy brak breathable)
//   T15:     blacklist + expiry
//   T16-T18: TRZY ścieżki rollbacku (mine throw / solar throw / full-colony throw)
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first — shim localStorage/window/THREE
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }        from '../../systems/ColonyManager.js';
import { EmpireRegistry }       from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { EmpireStrategySystem } from '../../systems/EmpireStrategySystem.js';
import { ResourceSystem }       from '../../systems/ResourceSystem.js';
import { FactorySystem }        from '../../systems/FactorySystem.js';
import { TechSystem }           from '../../systems/TechSystem.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};
// Ustaw zasób na DOKŁADNĄ wartość (neutralizuje drift konsumpcji między testami).
const setRes = (rs, key, target) => {
  const cur = rs.getAmount(key);
  if (cur > target) rs.spend({ [key]: cur - target });
  else if (cur < target) rs.receive({ [key]: target - cur });
};

// ── Permisywny techStub (mnożniki=1, isResearched=true) ───────────
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

// ── Encje ──────────────────────────────────────────────────────────
// Deposit helpers (richness, remaining). Xe/Nt = najrzadsze.
const XE = (richness = 1.0, remaining = 50000) => ({ resourceId: 'Xe', richness, totalAmount: remaining, remaining });
const FE = (remaining = 100000) => ({ resourceId: 'Fe', richness: 1, totalAmount: remaining, remaining });
const NT = (richness = 0.3, remaining = 10000) => ({ resourceId: 'Nt', richness, totalAmount: remaining, remaining });

// Moon: type='moon', BEZ planetType → PlanetMapGenerator defaultuje rocky (grid OK),
//   ale _isColonizableRocky=false → wykluczony z kandydatów pełnej kolonii (tylko outpost).
const mkMoon = (id, name, deposits) => EntityManager.add({
  id, name, type: 'moon', moonType: 'rocky', radius: 0.3, mass: 0.1,
  atmosphere: 'none', temperatureK: 200, systemId: 'sys_x', deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
// Planet: rocky + atmosfera → kandydat pełnej kolonii.
const mkPlanet = (id, name, atmosphere, deposits) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere, temperatureK: 280, systemId: 'sys_x', deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
const mkGas = (id, name) => EntityManager.add({
  id, name, type: 'planet', planetType: 'gas', radius: 5, mass: 50,
  atmosphere: 'thick', temperatureK: 120, systemId: 'sys_x', deposits: [],
  composition: { H: 0.9, He: 0.1 },
});

mkPlanet('mother_p',     'Mother',           'breathable', [FE()]);
mkMoon('xe_moon_1',      'Xe Moon 1',        [XE(1.2), FE()]);   // bogatszy Xe + Fe
mkMoon('xe_moon_2',      'Xe Moon 2',        [XE(0.8)]);
mkMoon('plain_moon',     'Plain Moon',       []);                // brak Xe
mkPlanet('breath_rocky', 'Breathable Rocky', 'breathable', [FE()]);
mkPlanet('bare_rocky',   'Bare Rocky',       'none',       [FE()]);
mkGas('gas_giant',       'Gas Giant');                           // niekolonizowalny
// Ciała dla ścieżek rollbacku / edge case (poza stubem systemu — używane wprost):
mkMoon('t16_moon',  'T16 Moon',  [XE(1.0)]);
mkMoon('t17_moon',  'T17 Moon',  [XE(1.0)]);
mkPlanet('t18_rocky', 'T18 Rocky', 'none', [FE()]);
mkMoon('d_moon',    'D Moon',    [XE(1.0)]);

// ── Ciała dla testów P5/P3 (Slice 2 S3 — outpost Nt) — osobny system sys_nt ──
const mkNtMoon = (id, name, deposits) => EntityManager.add({
  id, name, type: 'moon', moonType: 'rocky', radius: 0.3, mass: 0.1,
  atmosphere: 'none', temperatureK: 200, systemId: 'sys_nt', deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
const mkNtPlanet = (id, name, atmosphere, deposits) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere, temperatureK: 280, systemId: 'sys_nt', deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
mkNtPlanet('mother_nt', 'Mother NT', 'breathable', [FE()]);
mkNtPlanet('rocky_nt',  'Rocky NT',  'breathable', [FE()]);
mkNtMoon('xe_nt_1', 'Xe NT 1', [XE(1.2), FE()]);
mkNtMoon('xe_nt_2', 'Xe NT 2', [XE(1.0)]);
mkNtMoon('nt_body', 'Nt Body', [NT()]);   // TYLKO Nt (nie Xe → nie kandydat P1/P2)

// ── Realny ColonyManager + EmpireRegistry + window.KOSMOS ─────────
const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 10 },
  colonyManager,
  empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: {
    getSystem: (id) => {
      if (id === 'sys_x') return {
        planetIds:    ['mother_p', 'breath_rocky', 'bare_rocky', 'gas_giant'],
        moonIds:      ['xe_moon_1', 'xe_moon_2', 'plain_moon'],
        planetoidIds: [],
      };
      if (id === 'sys_nt') return {
        planetIds:    ['mother_nt', 'rocky_nt'],
        moonIds:      ['xe_nt_1', 'xe_nt_2', 'nt_body'],
        planetoidIds: [],
      };
      return null;
    },
  },
};

empireRegistry.createEmpire({ id: 'emp_C', archetype: 'industrialist', homeSystemId: 'sys_x' });
const emp_C = empireRegistry.get('emp_C');

// Macierzysta pełna kolonia AI (źródło POP/zasobów Warstwy C)
const mother = EmpireColonyBootstrap.bootstrapColony('emp_C', 'sys_x', 'mother_p', {
  startPop: { laborer: 1, worker: 1 }, startResources: { food: 200, water: 200 }, archetypeId: 'industrialist',
});

const sys      = new EmpireStrategySystem();
const cfg      = sys._config(emp_C);
const combined = sys._outpostCombinedCost();

// ═══════════════════════════════════════════════════════════════
// T1-T8 — konstruktor + helpery
// ═══════════════════════════════════════════════════════════════
console.log('--- T1: konstruktor (blacklist Map) + subskrypcja time:tick ---');
ok('_blacklist instanceof Map', sys._blacklist instanceof Map);
{
  // Spy bez side-effectów: podmień _tick, emituj, przywróć.
  let tickCalled = false;
  const orig = sys._tick.bind(sys);
  sys._tick = () => { tickCalled = true; };
  EventBus.emit('time:tick', { deltaYears: 0, civDeltaYears: 0 });  // 0 → zero konsumpcji u innych subskrybentów
  sys._tick = orig;
  ok('subskrybuje time:tick (_tick wywołane)', tickCalled);
}

console.log('--- T2: _pickMotherColony → pierwsza !isOutpost ---');
ok('mother = mother_p', sys._pickMotherColony(emp_C)?.planetId === 'mother_p');

console.log('--- T3: imperium tylko z outpostem → _pickMotherColony null ---');
empireRegistry.createEmpire({ id: 'emp_D', archetype: 'industrialist', homeSystemId: 'sys_x' });
EmpireColonyBootstrap.bootstrapAutonomousOutpost('emp_D', 'sys_x', 'd_moon', 'autonomous_solar_farm');
ok('emp_D (tylko outpost) → null', sys._pickMotherColony(empireRegistry.get('emp_D')) === null);

console.log('--- T4: mergeCosts DODAJE przy kolizji ---');
{
  const m = sys.mergeCosts({ structural_alloys: 4, Fe: 30 }, { structural_alloys: 4, Ti: 10 });
  ok('structural_alloys 4+4=8, Fe=30, Ti=10', m.structural_alloys === 8 && m.Fe === 30 && m.Ti === 10);
}

console.log('--- T5: _outpostCombinedCost == suma solar+mine ---');
{
  const exp = { Si: 20, Cu: 13, Ti: 15, Fe: 30, structural_alloys: 8, android_worker: 6, power_cells: 3, conductor_bundles: 2, electronic_systems: 1, extraction_systems: 2 };
  let combOk = Object.keys(exp).length === Object.keys(combined).length;
  for (const k of Object.keys(exp)) if (combined[k] !== exp[k]) combOk = false;
  ok('combined === oczekiwana suma 10 kluczy', combOk);
}

console.log('--- T6: _canAffordOutpost boundary (dokładna suma → true; -1 → false) ---');
{
  const rs = new ResourceSystem({});
  rs.receive(combined);
  const fakeMother = { resourceSystem: rs };
  ok('true przy dokładnej sumie', sys._canAffordOutpost(fakeMother) === true);
  rs.spend({ Si: 1 });
  ok('false po -1 Si', sys._canAffordOutpost(fakeMother) === false);
}

console.log('--- T7: _hasDeposit ---');
ok('xe_moon_1 ma Xe', sys._hasDeposit(EntityManager.get('xe_moon_1'), 'Xe') === true);
ok('plain_moon nie ma Xe', sys._hasDeposit(EntityManager.get('plain_moon'), 'Xe') === false);

console.log('--- T8: scoring Xe — bogatszy Xe + Fe wygrywa ---');
{
  const s1 = sys._scoreXeOutpostCandidate(EntityManager.get('xe_moon_1'));
  const s2 = sys._scoreXeOutpostCandidate(EntityManager.get('xe_moon_2'));
  ok(`xe_moon_1 (${s1}) > xe_moon_2 (${s2})`, s1 > s2);
}

// ═══════════════════════════════════════════════════════════════
// T9-T10 — P1 (pierwszy outpost Xe) + atomic debit
// ═══════════════════════════════════════════════════════════════
console.log('--- T9: P1 outpost na najlepszym ciele Xe (xe_moon_1) ---');
mother.resourceSystem.receive(combined);  // dokładnie 1× koszt outpostu
const before9 = {}; for (const k of Object.keys(combined)) before9[k] = mother.resourceSystem.getAmount(k);
sys._runForEmpire(emp_C, 100);
{
  const o = colonyManager.getColony('xe_moon_1');
  ok('outpost powstał na xe_moon_1', !!o && o.isOutpost === true);
  ok('outpost ma 2 budynki (solar + mine)', !!o && o.buildingSystem._active.size === 2);
}

console.log('--- T10: atomic debit — każdy klucz macierzystej -combined ---');
{
  let debitOk = true;
  for (const k of Object.keys(combined)) {
    if (mother.resourceSystem.getAmount(k) !== before9[k] - combined[k]) debitOk = false;
  }
  ok('debit dokładnie = combined (jeden spend)', debitOk);
}

// ═══════════════════════════════════════════════════════════════
// T11-T12 — P3 (pełna kolonia breathable) + transfer
// ═══════════════════════════════════════════════════════════════
console.log('--- T11: P3 pełna kolonia na breath_rocky ---');
mother.civSystem.addPop('laborer', 12);            // freePops >= minFreePops
setRes(mother.resourceSystem, 'food', 300);        // wyraźnie ≥ 200 (unik knife-edge konsumpcji)
setRes(mother.resourceSystem, 'water', 300);
const freeBefore11  = mother.civSystem.freePops;
const foodBefore11  = mother.resourceSystem.getAmount('food');
const waterBefore11 = mother.resourceSystem.getAmount('water');
sys._runForEmpire(emp_C, 105);                     // commodities=0 → canOutpost false → P3
{
  const bc = colonyManager.getColony('breath_rocky');
  ok('kolonia powstała na breath_rocky', !!bc && bc.isOutpost !== true);
  ok('nowa kolonia pop === popTransferSize', !!bc && bc.civSystem.population === cfg.popTransferSize);
}

console.log('--- T12: transfer — macierzysta freePops/food/water spadły ---');
ok('freePops -popTransferSize', mother.civSystem.freePops === freeBefore11 - cfg.popTransferSize);
ok('food -minFoodTransfer',     mother.resourceSystem.getAmount('food')  === foodBefore11  - cfg.minFoodTransfer);
ok('water -minWaterTransfer',   mother.resourceSystem.getAmount('water') === waterBefore11 - cfg.minWaterTransfer);

// ═══════════════════════════════════════════════════════════════
// T13 — bramka food (próg = transfer)
// ═══════════════════════════════════════════════════════════════
console.log('--- T13: food=199 (<200) → _canAffordFullColony false ---');
setRes(mother.resourceSystem, 'food', 199);   // dokładnie 199 (<200) — izoluj bramkę food
setRes(mother.resourceSystem, 'water', 250);
mother.civSystem.addPop('laborer', 12);       // freePops wysoko
ok('false przy food 199', sys._canAffordFullColony(mother, cfg) === false);

// ═══════════════════════════════════════════════════════════════
// T14 — fallback (dowolny rocky)
// ═══════════════════════════════════════════════════════════════
console.log('--- T14: fallback — breath_rocky zajęty → kolonia na bare_rocky ---');
setRes(mother.resourceSystem, 'food', 300);   // canFull true; commodities=0 → canOutpost false
setRes(mother.resourceSystem, 'water', 300);
sys._runForEmpire(emp_C, 115);
{
  const br = colonyManager.getColony('bare_rocky');
  ok('kolonia na bare_rocky (rocky bez atmosfery)', !!br && br.isOutpost !== true);
}

// ═══════════════════════════════════════════════════════════════
// T15 — blacklist + expiry
// ═══════════════════════════════════════════════════════════════
console.log('--- T15: blacklist aktywny → wygasa po blacklistDurationCy ---');
sys._blacklistPlanet('bl_test', 200, cfg);
ok('aktywny @200', sys._isBlacklisted('bl_test', 200) === true);
ok('wygasł @200+dur (auto-delete)', sys._isBlacklisted('bl_test', 200 + cfg.blacklistDurationCy) === false);

// ═══════════════════════════════════════════════════════════════
// T16-T18 — TRZY ścieżki rollbacku failure handling
// ═══════════════════════════════════════════════════════════════
const realEB = EmpireColonyBootstrap;

console.log('--- T16: rollback 1/3 — mine throw → partial refund (tylko mine) ---');
{
  window.KOSMOS.empireColonyBootstrap = {
    bootstrapAutonomousOutpost: (e, s, p, b) => {
      if (b === 'autonomous_mine') throw new Error('mine boom');
      return realEB.bootstrapAutonomousOutpost(e, s, p, b);   // solar deleguje do realnego
    },
    bootstrapColony: (...a) => realEB.bootstrapColony(...a),
  };
  mother.resourceSystem.receive(combined);
  const before16 = {}; for (const k of Object.keys(combined)) before16[k] = mother.resourceSystem.getAmount(k);
  const r16 = sys._executeAutonomousOutpost(emp_C, mother, 'sys_x', 't16_moon', 300, cfg);
  ok('zwraca {error:mine_failed, partial:true}', r16.error === 'mine_failed' && r16.partial === true);

  const solarPortion = sys._buildingCost('autonomous_solar_farm');
  let solarOnly = true;
  for (const k of Object.keys(combined)) {
    const expected = before16[k] - (solarPortion[k] ?? 0);   // netto = tylko porcja solar (mine zwrócone)
    if (mother.resourceSystem.getAmount(k) !== expected) solarOnly = false;
  }
  ok('refund netto = porcja solar (mine zrefundowane)', solarOnly);
  ok('t16_moon na blacklist', sys._isBlacklisted('t16_moon', 300) === true);
  window.KOSMOS.empireColonyBootstrap = realEB;
}

console.log('--- T17: rollback 2/3 — solar throw → pełny refund (nic nie powstało) ---');
{
  window.KOSMOS.empireColonyBootstrap = {
    bootstrapAutonomousOutpost: () => { throw new Error('solar boom'); },
    bootstrapColony: (...a) => realEB.bootstrapColony(...a),
  };
  mother.resourceSystem.receive(combined);
  const before17 = {}; for (const k of Object.keys(combined)) before17[k] = mother.resourceSystem.getAmount(k);
  const r17 = sys._executeAutonomousOutpost(emp_C, mother, 'sys_x', 't17_moon', 310, cfg);
  ok('zwraca {error:solar_failed}', r17.error === 'solar_failed');

  let unchanged = true;
  for (const k of Object.keys(combined)) if (mother.resourceSystem.getAmount(k) !== before17[k]) unchanged = false;
  ok('zasoby macierzystej bez zmian (pełny refund)', unchanged);
  ok('brak kolonii na t17_moon', colonyManager.getColony('t17_moon') === null);
  ok('t17_moon na blacklist', sys._isBlacklisted('t17_moon', 310) === true);
  window.KOSMOS.empireColonyBootstrap = realEB;
}

console.log('--- T18: rollback 3/3 — full-colony throw → refund zasoby + POP ---');
{
  window.KOSMOS.empireColonyBootstrap = {
    bootstrapAutonomousOutpost: (...a) => realEB.bootstrapAutonomousOutpost(...a),
    bootstrapColony: () => { throw new Error('colony boom'); },
  };
  // Ustaw food/water dokładnie 200 (asercja ===200 po rollbacku)
  const curFood = mother.resourceSystem.getAmount('food');
  if (curFood > 200) mother.resourceSystem.spend({ food: curFood - 200 });
  else if (curFood < 200) mother.resourceSystem.receive({ food: 200 - curFood });
  const curWater = mother.resourceSystem.getAmount('water');
  if (curWater > 200) mother.resourceSystem.spend({ water: curWater - 200 });
  else if (curWater < 200) mother.resourceSystem.receive({ water: 200 - curWater });
  mother.civSystem.addPop('laborer', 12);   // freePops >= minFreePops
  const popBefore18 = mother.civSystem.population;

  const r18 = sys._executeFullColony(emp_C, mother, 'sys_x', 't18_rocky', 320, cfg);
  ok('zwraca {error:colony_failed}', r18.error === 'colony_failed');
  ok('population przywrócone (addPop)', mother.civSystem.population === popBefore18);
  ok('food === 200 (przywrócone)',  mother.resourceSystem.getAmount('food')  === 200);
  ok('water === 200 (przywrócone)', mother.resourceSystem.getAmount('water') === 200);
  ok('t18_rocky na blacklist', sys._isBlacklisted('t18_rocky', 320) === true);
  ok('brak kolonii na t18_rocky', colonyManager.getColony('t18_rocky') === null);
  window.KOSMOS.empireColonyBootstrap = realEB;
}

// ═══════════════════════════════════════════════════════════════
// T19-T20 — bidirectional per-empire tech isolation (Slice 2 S2 fix)
// FactorySystem.isRecipeAvailable czyta buildingSystem.techSystem kolonii-właściciela
// (przez _getOwnerColony), nie globalny window.KOSMOS.techSystem.
// ═══════════════════════════════════════════════════════════════
// Tworzy kolonię z własnym TechSystem + FactorySystem, rejestruje w colonyManager
// (by _getOwnerColony ją znalazł po factorySystem reference).
const mkTechColony = (planetId, hasRobotics) => {
  const resSys  = new ResourceSystem({});
  const tech    = new TechSystem(resSys);
  tech.grantTechs(hasRobotics ? ['metallurgy', 'robotics'] : ['metallurgy']);
  const factSys = new FactorySystem(resSys);
  const colony  = { planetId, resourceSystem: resSys, factorySystem: factSys, buildingSystem: { techSystem: tech } };
  colonyManager._colonies.set(planetId, colony);
  return colony;
};

console.log('--- T19: AI z robotics produkuje android_worker MIMO że gracz nie ma ---');
{
  const playerCol = mkTechColony('t19_player', false);  // gracz bez robotics
  const aiCol     = mkTechColony('t19_ai',     true);   // AI z robotics
  ok('AI(robotics) → android_worker dostępny',          aiCol.factorySystem.isRecipeAvailable('android_worker') === true);
  ok('gracz(bez robotics) → android_worker NIEdostępny', playerCol.factorySystem.isRecipeAvailable('android_worker') === false);
}

console.log('--- T20: gracz z robotics produkuje android_worker MIMO że AI nie ma (odwrotny) ---');
{
  const playerCol = mkTechColony('t20_player', true);   // gracz z robotics
  const aiCol     = mkTechColony('t20_ai',     false);  // AI bez robotics
  ok('gracz(robotics) → android_worker dostępny',       playerCol.factorySystem.isRecipeAvailable('android_worker') === true);
  ok('AI(bez robotics) → android_worker NIEdostępny',    aiCol.factorySystem.isRecipeAvailable('android_worker') === false);
}

// ═══════════════════════════════════════════════════════════════
// T21-T23 — Slice 2 S3: P5 (outpost Nt) + waiver (brak ciała Nt)
// ═══════════════════════════════════════════════════════════════
console.log('--- T21: P5 — po zabezpieczeniu Xe (targetXe=2) AI buduje outpost Nt ---');
{
  empireRegistry.createEmpire({ id: 'emp_NT', archetype: 'industrialist', homeSystemId: 'sys_nt' });
  const empNT = empireRegistry.get('emp_NT');
  const motherNT = EmpireColonyBootstrap.bootstrapColony('emp_NT', 'sys_nt', 'mother_nt', {
    startPop: { laborer: 1, worker: 1 }, startResources: { food: 200, water: 200 }, archetypeId: 'industrialist',
  });

  const ntPick = sys._pickNtBody(empNT, ['xe_nt_1', 'xe_nt_2', 'nt_body', 'rocky_nt'], 500);
  ok('_pickNtBody znajduje nt_body (jedyne ze złożem Nt)', ntPick === 'nt_body');

  // P1 + P2: dwa outposty Xe (do targetXe=2). Refill kosztu outpostu przed każdym.
  motherNT.resourceSystem.receive(combined);
  sys._runForEmpire(empNT, 500);
  motherNT.resourceSystem.receive(combined);
  sys._runForEmpire(empNT, 501);
  const xeCount = ['xe_nt_1', 'xe_nt_2'].filter(id => colonyManager.getColony(id)?.isOutpost).length;
  ok('2 outposty Xe zbudowane (targetXe osiągnięty)', xeCount === 2);

  // P5: outpost Nt (xe>=targetXe, nt<targetNt, ntBody=nt_body).
  motherNT.resourceSystem.receive(combined);
  sys._runForEmpire(empNT, 502);
  const ntColony = colonyManager.getColony('nt_body');
  ok('outpost Nt zbudowany na nt_body (P5)', !!ntColony && ntColony.isOutpost === true);
}

console.log('--- T22: po Xe+Nt — P3 pełna kolonia (canFull, commodities=0) ---');
{
  const empNT     = empireRegistry.get('emp_NT');
  const motherNT  = sys._pickMotherColony(empNT);
  motherNT.civSystem.addPop('laborer', 12);
  setRes(motherNT.resourceSystem, 'food', 300);
  setRes(motherNT.resourceSystem, 'water', 300);
  // commodities=0 → canOutpost false → P5 też skip (nt już =target) → P3 breathable
  sys._runForEmpire(empNT, 510);
  const rockyColony = colonyManager.getColony('rocky_nt');
  ok('pełna kolonia na rocky_nt (P3 po Xe+Nt)', !!rockyColony && rockyColony.isOutpost !== true);
}

console.log('--- T23: waiver — brak ciała Nt → _pickNtBody null (P3 nie czeka na Nt) ---');
{
  const empC = empireRegistry.get('emp_C');
  // sys_x nie ma żadnego złoża Nt → _pickNtBody null → ntSatisfied=true → P3/Fb działa.
  ok('sys_x bez Nt → _pickNtBody null', sys._pickNtBody(empC, ['xe_moon_1', 'xe_moon_2', 'plain_moon', 'breath_rocky', 'bare_rocky'], 600) === null);
}

// ═══════════════════════════════════════════════════════════════
// T24 — Slice 3.1b: Expansionist różni się od Industrialist TYLKO maxExtraSystems
//   (Exp=2, Ind=0). Reszta doktryny + personality identyczne (klon S3.1a poza tym).
// ═══════════════════════════════════════════════════════════════
console.log('--- T24: Expansionist _config różni się od Industrialist TYLKO maxExtraSystems (S3.1b) ---');
{
  empireRegistry.createEmpire({ id: 'emp_EXP', archetype: 'expansionist', homeSystemId: 'sys_x' });
  const empEXP = empireRegistry.get('emp_EXP');
  ok('createEmpire(expansionist) OK (archetyp zarejestrowany)',
     !!empEXP && empEXP.archetype === 'expansionist');
  const cfgEXP = sys._config(empEXP);
  const cfgIND = sys._config(emp_C);
  // S3.1b: jawna RÓŻNICA behawioralna — limit ekspansji cross-system.
  ok('maxExtraSystems: Expansionist=2, Industrialist=0',
     cfgEXP.maxExtraSystems === 2 && cfgIND.maxExtraSystems === 0);
  // Poza maxExtraSystems doktryna IDENTYCZNA (parytet klona zachowany na resztę).
  {
    const { maxExtraSystems: _e, ...restEXP } = cfgEXP;
    const { maxExtraSystems: _i, ...restIND } = cfgIND;
    ok('_config Exp/Ind identyczne POZA maxExtraSystems',
       JSON.stringify(restEXP) === JSON.stringify(restIND));
  }
  // personality kopiowana w createEmpire z archetypu — klon ⇒ identyczna (bez zmian S3.1b)
  ok('personality(Expansionist) === personality(Industrialist)',
     JSON.stringify(empEXP.personality) === JSON.stringify(empireRegistry.get('emp_C').personality));
}

// ═══════════════════════════════════════════════════════════════
// T25-T32 — Slice 3.1b: kolonizacja cross-system (Expansionist)
//   T25: _meetsSystemQualityThreshold (próg otwierania: Xe LUB rocky+breathable)
//   T26: _pickTargetSystem (najbliższy nieposiadany; wyklucza home/AI/owned/blacklist)
//   T27: _outpostCountsInSystem (scope per-system)
//   T28: cross-system founding SUCCESS (mature → outpost Xe w najbliższym dobrym)
//   T29: develop-existing-before-new (rozbuduj posiadany extra-system, nie otwieraj nowego)
//   T30: próg jakości → system-blacklist (junk pominięty, kolejny dobry otwarty)
//   T31: limit enforcement (distinct=3, maxExtra=2 → brak nowego systemu)
//   T32: Industrialist home-locked (maxExtraSystems=0 → zero cross-system mimo dojrzałości)
// ═══════════════════════════════════════════════════════════════

// ── Fixture galaktyki + systemów cross-system ──────────────────────
// Encje ciał (planeta rocky / księżyc) z jawnym systemId. Reużywa XE/FE/NT z góry.
const mkBody = (id, name, systemId, kind, atmosphere, deposits = []) => EntityManager.add({
  id, name,
  type:       kind === 'moon' ? 'moon' : 'planet',
  planetType: kind === 'moon' ? undefined : 'rocky',
  moonType:   kind === 'moon' ? 'rocky' : undefined,
  radius: kind === 'moon' ? 0.3 : 1, mass: kind === 'moon' ? 0.1 : 1,
  atmosphere, temperatureK: 280, systemId, deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
// Home systemy (mature: 2 rocky+breathable na dodatkowe kolonie, 2 Xe-moon na outposty)
for (const [pfx, sysId] of [['hX', 'sys_hX'], ['hT', 'sys_hT'], ['hI', 'sys_hI']]) {
  mkBody(`${pfx}_mother`, `${pfx} Mother`, sysId, 'planet', 'breathable', [FE()]);
  mkBody(`${pfx}_r1`,     `${pfx} Rocky 1`, sysId, 'planet', 'breathable', [FE()]);
  mkBody(`${pfx}_r2`,     `${pfx} Rocky 2`, sysId, 'planet', 'breathable', [FE()]);
  mkBody(`${pfx}_xe1`,    `${pfx} Xe 1`,    sysId, 'moon',   'none',       [XE(1.2), FE()]);
  mkBody(`${pfx}_xe2`,    `${pfx} Xe 2`,    sysId, 'moon',   'none',       [XE(1.0)]);
}
mkBody('hL_mother', 'hL Mother', 'sys_hL', 'planet', 'breathable', [FE()]);
// Systemy-cele
mkBody('xg_xe',     'XGood Xe',     'sys_xgood', 'moon',   'none',       [XE(1.2)]);   // good (Xe)
mkBody('xg_breath', 'XGood Breath', 'sys_xgood', 'planet', 'breathable', [FE()]);
mkBody('xf_breath', 'XFar Breath',  'sys_xfar',  'planet', 'breathable', [FE()]);      // good (breathable)
mkBody('tj_nt',     'TJunk Nt',     'sys_tjunk', 'moon',   'none',       [NT()]);      // junk (Nt only)
mkBody('tj_bare',   'TJunk Bare',   'sys_tjunk', 'planet', 'none',       [FE()]);      // junk (bare rocky)
mkBody('tg_xe',     'TGood Xe',     'sys_tgood', 'moon',   'none',       [XE(1.0)]);   // good (Xe)
mkBody('tg_breath', 'TGood Breath', 'sys_tgood', 'planet', 'breathable', [FE()]);
mkBody('ig_xe',     'IGood Xe',     'sys_igood', 'moon',   'none',       [XE(1.0)]);   // good (lock test)
mkBody('ig_breath', 'IGood Breath', 'sys_igood', 'planet', 'breathable', [FE()]);
mkBody('l1_p', 'L1 Planet', 'sys_l1', 'planet', 'breathable', [FE()]);  // emp_LIM extra 1
mkBody('l2_p', 'L2 Planet', 'sys_l2', 'planet', 'breathable', [FE()]);  // emp_LIM extra 2
mkBody('l3_breath', 'L3 Breath', 'sys_l3', 'planet', 'breathable', [FE()]); // good (limit test — NIE otwierany)

const CROSS_SYS = {
  sys_hX:    { planetIds: ['hX_mother', 'hX_r1', 'hX_r2'], moonIds: ['hX_xe1', 'hX_xe2'], planetoidIds: [] },
  sys_hT:    { planetIds: ['hT_mother', 'hT_r1', 'hT_r2'], moonIds: ['hT_xe1', 'hT_xe2'], planetoidIds: [] },
  sys_hI:    { planetIds: ['hI_mother', 'hI_r1', 'hI_r2'], moonIds: ['hI_xe1', 'hI_xe2'], planetoidIds: [] },
  sys_hL:    { planetIds: ['hL_mother'], moonIds: [], planetoidIds: [] },
  sys_xgood: { planetIds: ['xg_breath'], moonIds: ['xg_xe'], planetoidIds: [] },
  sys_xfar:  { planetIds: ['xf_breath'], moonIds: [], planetoidIds: [] },
  sys_tjunk: { planetIds: ['tj_bare'], moonIds: ['tj_nt'], planetoidIds: [] },
  sys_tgood: { planetIds: ['tg_breath'], moonIds: ['tg_xe'], planetoidIds: [] },
  sys_igood: { planetIds: ['ig_breath'], moonIds: ['ig_xe'], planetoidIds: [] },
  sys_l1:    { planetIds: ['l1_p'], moonIds: [], planetoidIds: [] },
  sys_l2:    { planetIds: ['l2_p'], moonIds: [], planetoidIds: [] },
  sys_l3:    { planetIds: ['l3_breath'], moonIds: [], planetoidIds: [] },
};
const _origGetSystem = window.KOSMOS.starSystemManager.getSystem;
window.KOSMOS.starSystemManager.getSystem = (id) => CROSS_SYS[id] ?? _origGetSystem(id);
window.KOSMOS.galaxyData = { systems: [
  { id: 'sys_home',   isHome: true, x: 0,   y: 0, z: 0 },        // home gracza (wyklucz)
  { id: 'sys_aihome', x: 1,   y: 0, z: 0, empireId: 'emp_aiother' },  // home obcego AI (wyklucz)
  { id: 'sys_hX',     x: 100, y: 0, z: 0, empireId: 'emp_X' },
  { id: 'sys_xgood',  x: 102, y: 0, z: 0 },
  { id: 'sys_xfar',   x: 140, y: 0, z: 0 },
  { id: 'sys_hT',     x: 200, y: 0, z: 0, empireId: 'emp_THR' },
  { id: 'sys_tjunk',  x: 201, y: 0, z: 0 },
  { id: 'sys_tgood',  x: 203, y: 0, z: 0 },
  { id: 'sys_hI',     x: 300, y: 0, z: 0, empireId: 'emp_IND' },
  { id: 'sys_igood',  x: 302, y: 0, z: 0 },
  { id: 'sys_hL',     x: 400, y: 0, z: 0, empireId: 'emp_LIM' },
  { id: 'sys_l1',     x: 401, y: 0, z: 0 },
  { id: 'sys_l2',     x: 402, y: 0, z: 0 },
  { id: 'sys_l3',     x: 403, y: 0, z: 0 },
]};

// Helper: imperium DOJRZAŁE (2 Xe outposty + stolica + 2 dodatkowe kolonie home).
const bootstrapMatureEmpire = (empId, archetype, homeSysId, b) => {
  empireRegistry.createEmpire({ id: empId, archetype, homeSystemId: homeSysId });
  const m = EmpireColonyBootstrap.bootstrapColony(empId, homeSysId, b.mother,
    { startPop: { laborer: 1, worker: 1 }, startResources: { food: 200, water: 200 }, archetypeId: archetype });
  EmpireColonyBootstrap.bootstrapColony(empId, homeSysId, b.rocky1, { startPop: { laborer: 2 }, startResources: { food: 200, water: 200 } });
  EmpireColonyBootstrap.bootstrapColony(empId, homeSysId, b.rocky2, { startPop: { laborer: 2 }, startResources: { food: 200, water: 200 } });
  for (const xe of [b.xe1, b.xe2]) {
    EmpireColonyBootstrap.bootstrapAutonomousOutpost(empId, homeSysId, xe, 'autonomous_solar_farm');
    EmpireColonyBootstrap.bootstrapAutonomousOutpost(empId, homeSysId, xe, 'autonomous_mine');
  }
  return m;
};

const motherX = bootstrapMatureEmpire('emp_X', 'expansionist', 'sys_hX',
  { mother: 'hX_mother', rocky1: 'hX_r1', rocky2: 'hX_r2', xe1: 'hX_xe1', xe2: 'hX_xe2' });
const empX = empireRegistry.get('emp_X');

console.log('--- T25: _meetsSystemQualityThreshold (Xe LUB rocky+breathable) ---');
ok('Xe → true',                  sys._meetsSystemQualityThreshold(['xg_xe']) === true);
ok('rocky+breathable → true',    sys._meetsSystemQualityThreshold(['xg_breath']) === true);
ok('Nt-only → false',            sys._meetsSystemQualityThreshold(['tj_nt']) === false);
ok('bare rocky → false',         sys._meetsSystemQualityThreshold(['tj_bare']) === false);
ok('pusty → false',              sys._meetsSystemQualityThreshold([]) === false);
ok('junk (Nt+bare) → false',     sys._meetsSystemQualityThreshold(['tj_nt', 'tj_bare']) === false);
ok('mieszany (bare+Xe) → true',  sys._meetsSystemQualityThreshold(['tj_bare', 'xg_xe']) === true);

console.log('--- T26: _pickTargetSystem (najbliższy nieposiadany; wykluczenia + blacklist) ---');
{
  const t1 = sys._pickTargetSystem(empX, motherX, 1000);
  ok('nearest unowned = sys_xgood (d=2)', t1?.id === 'sys_xgood');
  ok('wynik nie jest home gracza/AI', !!t1 && !t1.isHome && !t1.empireId);
  sys._systemBlacklistAdd('sys_xgood', 1000, cfg);
  const t2 = sys._pickTargetSystem(empX, motherX, 1000);
  ok('po blacklist sys_xgood → sys_xfar', t2?.id === 'sys_xfar');
  sys._systemBlacklist.delete('sys_xgood');   // sprzątanie dla T28
}

console.log('--- T27: _outpostCountsInSystem (scope per-system) ---');
{
  const cHome = sys._outpostCountsInSystem(empX, 'sys_hX');
  ok('sys_hX: xe=2 nt=0', cHome.xe === 2 && cHome.nt === 0);
  const cGood = sys._outpostCountsInSystem(empX, 'sys_xgood');
  ok('sys_xgood: xe=0 (brak outpostów tam)', cGood.xe === 0 && cGood.nt === 0);
}

console.log('--- T28: cross-system SUCCESS — outpost Xe w najbliższym dobrym systemie ---');
{
  motherX.resourceSystem.receive(combined);   // koszt outpostu
  sys._runForEmpire(empX, 1100);
  const o = colonyManager.getColony('xg_xe');
  ok('outpost Xe powstał w sys_xgood (xg_xe)', !!o && o.isOutpost === true);
  ok('owner=emp_X, systemId=sys_xgood', !!o && o.ownerEmpireId === 'emp_X' && o.systemId === 'sys_xgood');
  const distinct = new Set(empireRegistry.getColoniesByEmpire('emp_X').map(c => c.systemId)).size;
  ok('distinct systemy emp_X = 2 (home + sys_xgood)', distinct === 2);
}

console.log('--- T29: develop-existing-before-new — rozbuduj posiadany, NIE otwieraj nowego ---');
{
  motherX.civSystem.addPop('laborer', 12);    // freePops dla pełnej kolonii
  setRes(motherX.resourceSystem, 'food', 300);
  setRes(motherX.resourceSystem, 'water', 300);
  sys._runForEmpire(empX, 1101);
  const dev = colonyManager.getColony('xg_breath');
  ok('kolonia w POSIADANYM sys_xgood (xg_breath)', !!dev && dev.systemId === 'sys_xgood');
  ok('NOWY system NIE otwarty (sys_xfar pusty)', colonyManager.getColony('xf_breath') === null);
  const distinct = new Set(empireRegistry.getColoniesByEmpire('emp_X').map(c => c.systemId)).size;
  ok('distinct nadal 2 (nie otwarto nowego)', distinct === 2);
}

console.log('--- T30: próg jakości → system-blacklist (junk pominięty, kolejny dobry otwarty) ---');
{
  const motherT = bootstrapMatureEmpire('emp_THR', 'expansionist', 'sys_hT',
    { mother: 'hT_mother', rocky1: 'hT_r1', rocky2: 'hT_r2', xe1: 'hT_xe1', xe2: 'hT_xe2' });
  const empT = empireRegistry.get('emp_THR');
  const cfgT = sys._config(empT);
  const r1 = sys._runCrossSystem(empT, motherT, 1200, cfgT, 1);
  ok('junk → _runCrossSystem false',          r1 === false);
  ok('sys_tjunk zablacklistowany',            sys._isSystemBlacklisted('sys_tjunk', 1200) === true);
  ok('junk NIE skolonizowany',                colonyManager.getColony('tj_bare') === null && colonyManager.getColony('tj_nt') === null);
  motherT.resourceSystem.receive(combined);
  const r2 = sys._runCrossSystem(empT, motherT, 1200, cfgT, 1);
  const tg = colonyManager.getColony('tg_xe');
  ok('po junk → sys_tgood otwarty (outpost tg_xe)',
     r2 === true && !!tg && tg.isOutpost === true && tg.systemId === 'sys_tgood');
}

console.log('--- T31: limit enforcement — distinct=3, maxExtra=2 → brak nowego systemu ---');
{
  empireRegistry.createEmpire({ id: 'emp_LIM', archetype: 'expansionist', homeSystemId: 'sys_hL' });
  const empL = empireRegistry.get('emp_LIM');
  const motherL = EmpireColonyBootstrap.bootstrapColony('emp_LIM', 'sys_hL', 'hL_mother',
    { startPop: { laborer: 1, worker: 1 }, startResources: { food: 200, water: 200 }, archetypeId: 'expansionist' });
  EmpireColonyBootstrap.bootstrapColony('emp_LIM', 'sys_l1', 'l1_p', { startPop: { laborer: 2 }, startResources: { food: 200, water: 200 } });
  EmpireColonyBootstrap.bootstrapColony('emp_LIM', 'sys_l2', 'l2_p', { startPop: { laborer: 2 }, startResources: { food: 200, water: 200 } });
  const cfgL = sys._config(empL);
  const distinctL = new Set(empireRegistry.getColoniesByEmpire('emp_LIM').map(c => c.systemId)).size;
  ok('emp_LIM distinct=3 (home + 2 extra)', distinctL === 3);
  motherL.resourceSystem.receive(combined);
  setRes(motherL.resourceSystem, 'food', 300);
  setRes(motherL.resourceSystem, 'water', 300);
  motherL.civSystem.addPop('laborer', 12);
  const rL = sys._runCrossSystem(empL, motherL, 1300, cfgL, distinctL);
  ok('_runCrossSystem=false przy distinct=3 maxExtra=2', rL === false);
  ok('sys_l3 (l3_breath) NIE otwarty', colonyManager.getColony('l3_breath') === null);
}

console.log('--- T32: Industrialist home-locked — maxExtraSystems=0 → zero cross-system ---');
{
  const motherI = bootstrapMatureEmpire('emp_IND', 'industrialist', 'sys_hI',
    { mother: 'hI_mother', rocky1: 'hI_r1', rocky2: 'hI_r2', xe1: 'hI_xe1', xe2: 'hI_xe2' });
  const empI = empireRegistry.get('emp_IND');
  motherI.resourceSystem.receive(combined);
  setRes(motherI.resourceSystem, 'food', 300);
  setRes(motherI.resourceSystem, 'water', 300);
  motherI.civSystem.addPop('laborer', 12);
  sys._runForEmpire(empI, 1400);
  ok('brak kolonii cross-system (sys_igood pusty)',
     colonyManager.getColony('ig_xe') === null && colonyManager.getColony('ig_breath') === null);
  const distinctI = new Set(empireRegistry.getColoniesByEmpire('emp_IND').map(c => c.systemId)).size;
  ok('distinct=1 (tylko home — mimo dojrzałości)', distinctI === 1);
}

// ═══════════════════════════════════════════════════════════════
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
