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
// T24 — Slice 3.1a: Expansionist = klon Industrialist (identyczne decyzje Warstwy C)
// ═══════════════════════════════════════════════════════════════
console.log('--- T24: Expansionist _config == Industrialist _config (klon S3.1a) ---');
{
  empireRegistry.createEmpire({ id: 'emp_EXP', archetype: 'expansionist', homeSystemId: 'sys_x' });
  const empEXP = empireRegistry.get('emp_EXP');
  ok('createEmpire(expansionist) OK (archetyp zarejestrowany)',
     !!empEXP && empEXP.archetype === 'expansionist');
  // _config czyta ARCHETYPES[archetype].strategicColonization → klon ⇒ identyczna doktryna
  ok('_config(Expansionist) === _config(Industrialist)',
     JSON.stringify(sys._config(empEXP)) === JSON.stringify(sys._config(emp_C)));
  // personality kopiowana w createEmpire z archetypu — klon ⇒ identyczna
  ok('personality(Expansionist) === personality(Industrialist)',
     JSON.stringify(empEXP.personality) === JSON.stringify(empireRegistry.get('emp_C').personality));
}

// ═══════════════════════════════════════════════════════════════
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
