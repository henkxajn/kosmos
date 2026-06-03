// S3.2 S2 — smoke "model badań AI" (EmpireResearchSystem). REGRESSION GUARD.
//
// Dowodzi, że AI bada techy W CZASIE z research stolicy (gate: research_station),
// per-archetyp kolejka, raw cost, ciche grantTechs. Pokrywa DEDYKOWANE ścieżki
// failure (zasada Filipa): brak stacji, rate 0, skip-already-researched, queue
// exhausted, oraz migrację v82→v83 i round-trip stanu.

globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
  getElementById: () => null,
};

const { ARCHETYPES }           = await import('./src/data/EmpireData.js');
const { TECHS }                = await import('./src/data/TechData.js');
const { TechSystem }           = await import('./src/systems/TechSystem.js');
const { EmpireResearchSystem } = await import('./src/systems/EmpireResearchSystem.js');
const { migrate, CURRENT_VERSION } = await import('./src/systems/SaveMigration.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── Fakes ──────────────────────────────────────────────────────────────────
function makeCapital({ hasStation = true, rate = 10, aiTech }) {
  const active = new Map();
  if (hasStation) active.set('research_station_5,5', { building: { id: 'research_station' }, level: 1 });
  return {
    isOutpost: false,
    resourceSystem: { getGrossPerYear: (r) => (r === 'research' ? rate : 0) },
    buildingSystem: { _active: active },
    techSystem: aiTech,
  };
}
function makeRegistry(empires, coloniesByEmpire) {
  return {
    listAll: () => empires,
    get: (id) => empires.find(e => e.id === id) ?? null,
    getColoniesByEmpire: (id) => coloniesByEmpire[id] ?? [],
  };
}
function seedTech(startingTechs, extra = []) {
  const ts = new TechSystem();
  ts.grantTechs([...startingTechs, ...extra]);
  return ts;
}
// Złóż jedno-imperiowy świat i podłącz do window.KOSMOS; zwróć { empire, aiTech, capital }.
function wireWorld({ archetype, startingTechs, extraTech = [], hasStation = true, rate = 10 }) {
  const aiTech = seedTech(startingTechs, extraTech);
  const capital = makeCapital({ hasStation, rate, aiTech });
  const empire = { id: 'emp_test', archetype };
  window.KOSMOS.empireRegistry = makeRegistry([empire], { emp_test: [capital] });
  return { empire, aiTech, capital };
}

const sys = new EmpireResearchSystem();
const IND  = ARCHETYPES.industrialist;
const EXP  = ARCHETYPES.expansionist;
const START = IND.startingTechs;  // oba archetypy współdzielą startingTechs (clone)

// ════════════════════════════════════════════════════════════════════════
header('0) Dane archetypów — kolejki + stacja + typo guard + porządek prereqów');
// ════════════════════════════════════════════════════════════════════════
assert(deepEq(IND.researchQueue,
  ['data_networks','efficient_solar','nuclear_power','advanced_materials','android_engineering']),
  'Industrialist.researchQueue = [data_networks,efficient_solar,nuclear_power,advanced_materials,android_engineering]');
assert(deepEq(EXP.researchQueue,
  ['ion_drives','data_networks','efficient_solar','nuclear_power','quantum_physics',
   'plasma_physics','fusion_power','warp_theory','warp_drive','warp_drive_mk2']),
  'Expansionist.researchQueue = ścieżka warpowa (10 techów)');
assert(!deepEq(EXP.researchQueue, IND.researchQueue),
  'Expansionist NADPISAŁ kolejkę (nie odziedziczył Industrialisty z _base)');
assert(deepEq(EXP.startingTechs, IND.startingTechs),
  'Expansionist.startingTechs == Industrialist (parytet clone)');
// Stacja badawcza w obu (Industrialist explicit; Expansionist via structuredClone)
const indHasStation = IND.startingBuildings.some(b => b.buildingId === 'research_station');
const expHasStation = EXP.startingBuildings.some(b => b.buildingId === 'research_station');
assert(indHasStation, 'Industrialist.startingBuildings zawiera research_station');
assert(expHasStation, 'Expansionist.startingBuildings dziedziczy research_station (clone)');
// Typo guard — KAŻDY tech w kolejce musi istnieć i mieć cost.research (literówka = wieczny stall)
for (const id of [...IND.researchQueue, ...EXP.researchQueue]) {
  assert(!!TECHS[id] && typeof TECHS[id].cost?.research === 'number',
    `tech '${id}' istnieje w TECHS z cost.research`);
}
// Porządek prereqów — invariant na którym opiera się brak jawnego check'u w runtime.
function validateOrder(queue, startingTechs) {
  const known = new Set(startingTechs);
  for (const id of queue) {
    for (const r of (TECHS[id]?.requires ?? [])) {
      if (!known.has(r)) return { ok: false, tech: id, missing: r };
    }
    known.add(id);
  }
  return { ok: true };
}
const ordInd = validateOrder(IND.researchQueue, START);
const ordExp = validateOrder(EXP.researchQueue, START);
assert(ordInd.ok, `Industrialist: każdy prereq spełniony przez poprzednika${ordInd.ok ? '' : ` (BRAK ${ordInd.missing} dla ${ordInd.tech})`}`);
assert(ordExp.ok, `Expansionist: każdy prereq spełniony przez poprzednika${ordExp.ok ? '' : ` (BRAK ${ordExp.missing} dla ${ordExp.tech})`}`);

// ════════════════════════════════════════════════════════════════════════
header('1) Progresja — stacja + rate → ukończenie techów po przekroczeniu kosztu');
// ════════════════════════════════════════════════════════════════════════
{
  const { empire, aiTech } = wireWorld({ archetype: 'industrialist', startingTechs: START, rate: 10 });
  // data_networks cost 150 → 15 civYears × 10/rok
  sys._tick(15);
  assert(aiTech.isResearched('data_networks'), '(15cy) data_networks zbadane (150 res)');
  assert(empire.research.queueIndex === 1, '(15cy) queueIndex → 1');
  assert(Math.abs(empire.research.progress) < 1e-6, '(15cy) progress ≈ 0 (dokładne wydanie)');
  // efficient_solar cost 70 → 7 civYears
  sys._tick(7);
  assert(aiTech.isResearched('efficient_solar'), '(+7cy) efficient_solar zbadane (70 res)');
  assert(empire.research.queueIndex === 2, '(+7cy) queueIndex → 2');
}

// ════════════════════════════════════════════════════════════════════════
header('2) Gate stacji (FAILURE) — brak research_station → badania stoją');
// ════════════════════════════════════════════════════════════════════════
{
  const { empire, aiTech } = wireWorld({ archetype: 'industrialist', startingTechs: START, hasStation: false, rate: 10 });
  sys._tick(100);
  assert(!aiTech.isResearched('data_networks'), '(brak stacji) data_networks NIE zbadane mimo 100cy');
  assert(empire.research.progress === 0, '(brak stacji) progress stoi na 0');
  assert(empire.research.queueIndex === 0, '(brak stacji) queueIndex stoi na 0');
}

// ════════════════════════════════════════════════════════════════════════
header('3) Rate 0 (FAILURE) — stacja jest, ale output 0 → brak akumulacji');
// ════════════════════════════════════════════════════════════════════════
{
  const { empire, aiTech } = wireWorld({ archetype: 'industrialist', startingTechs: START, hasStation: true, rate: 0 });
  sys._tick(100);
  assert(empire.research.progress === 0, '(rate 0) progress stoi na 0');
  assert(!aiTech.isResearched('data_networks'), '(rate 0) data_networks NIE zbadane');
}

// ════════════════════════════════════════════════════════════════════════
header('4) Skip already-researched (FAILURE path) — tech startowy pomijany gratis');
// ════════════════════════════════════════════════════════════════════════
{
  ARCHETYPES.__test_skip__ = { researchQueue: ['metallurgy', 'efficient_solar'] };  // metallurgy ∈ startingTechs
  const { empire } = wireWorld({ archetype: '__test_skip__', startingTechs: ['metallurgy'], hasStation: true, rate: 10 });
  sys._tick(1);  // progress 10; metallurgy skip (idx→1); efficient_solar 70 > 10 → break
  assert(empire.research.queueIndex === 1, '(skip) queueIndex przeskoczył metallurgy → 1');
  assert(Math.abs(empire.research.progress - 10) < 1e-6, '(skip) progress=10 zachowany (skip bez kosztu)');
  delete ARCHETYPES.__test_skip__;
}

// ════════════════════════════════════════════════════════════════════════
header('5) Queue exhausted (FAILURE path) — idle, brak wyjątku, bez dead-akumulacji');
// ════════════════════════════════════════════════════════════════════════
{
  ARCHETYPES.__test_exhaust__ = { researchQueue: ['efficient_solar'] };
  const { empire, aiTech } = wireWorld({ archetype: '__test_exhaust__', startingTechs: START, hasStation: true, rate: 1000 });
  sys._tick(1);  // 1000 ≥ 70 → efficient_solar done, queueIndex 1 (===length)
  assert(aiTech.isResearched('efficient_solar'), '(exhaust) efficient_solar zbadane');
  assert(empire.research.queueIndex === 1, '(exhaust) queueIndex === length(1)');
  const progAfterDone = empire.research.progress;
  let threw = false;
  try { sys._tick(1); } catch (e) { threw = true; }
  assert(!threw, '(exhaust) kolejny tick nie rzuca wyjątku');
  assert(empire.research.progress === progAfterDone, '(exhaust) idle-guard: progress NIE rośnie po wyczerpaniu');
  delete ARCHETYPES.__test_exhaust__;
}

// ════════════════════════════════════════════════════════════════════════
header('6) Multi-complete — jeden tick zalicza kilka techów po kolei');
// ════════════════════════════════════════════════════════════════════════
{
  ARCHETYPES.__test_multi__ = { researchQueue: ['efficient_solar', 'plasma_physics', 'data_networks'] };  // 70+200+150=420
  const { empire, aiTech } = wireWorld({ archetype: '__test_multi__', startingTechs: START, hasStation: true, rate: 420 });
  sys._tick(1);
  assert(aiTech.isResearched('efficient_solar') && aiTech.isResearched('plasma_physics') && aiTech.isResearched('data_networks'),
    '(multi) 3 techy zbadane w jednym ticku (420 res)');
  assert(empire.research.queueIndex === 3, '(multi) queueIndex → 3');
  assert(Math.abs(empire.research.progress) < 1e-6, '(multi) progress ≈ 0');
  delete ARCHETYPES.__test_multi__;
}

// ════════════════════════════════════════════════════════════════════════
header('7) Wiele imperiów — niezależne empire.research + różne kolejki');
// ════════════════════════════════════════════════════════════════════════
{
  const aiExp = seedTech(EXP.startingTechs);
  const aiInd = seedTech(IND.startingTechs);
  const capExp = makeCapital({ aiTech: aiExp, rate: 10 });
  const capInd = makeCapital({ aiTech: aiInd, rate: 10 });
  const empExp = { id: 'emp_exp', archetype: 'expansionist' };
  const empInd = { id: 'emp_ind', archetype: 'industrialist' };
  window.KOSMOS.empireRegistry = makeRegistry([empExp, empInd], { emp_exp: [capExp], emp_ind: [capInd] });
  sys._tick(25);  // 250 res każdy
  // Expansionist: ion_drives(250) → done; data_networks(150) > 0 → break
  assert(aiExp.isResearched('ion_drives') && empExp.research.queueIndex === 1, '(multi-emp) Exp: ion_drives done, idx 1');
  assert(!aiExp.isResearched('data_networks'), '(multi-emp) Exp: data_networks jeszcze nie (progress wydany na ion_drives)');
  // Industrialist: data_networks(150)+efficient_solar(70)=220 ≤ 250; nuclear_power(220) > 30 → break
  assert(aiInd.isResearched('data_networks') && aiInd.isResearched('efficient_solar') && empInd.research.queueIndex === 2,
    '(multi-emp) Ind: data_networks+efficient_solar done, idx 2');
  assert(!aiInd.isResearched('ion_drives'), '(multi-emp) Ind NIGDY nie bada ion_drives (inna kolejka — izolacja techSystem)');
  assert(empExp.research !== empInd.research, '(multi-emp) osobne obiekty empire.research');
}

// ════════════════════════════════════════════════════════════════════════
header('8) Migracja v82 → v83 — lazy default empire.research (mirror v76→v77)');
// ════════════════════════════════════════════════════════════════════════
{
  assert(CURRENT_VERSION === 83, 'CURRENT_VERSION === 83');
  const save = {
    version: 82,
    civ4x: { gameState: { empires: {
      emp_01: { id: 'emp_01', archetype: 'expansionist' },                          // brak research → default
      emp_02: { id: 'emp_02', archetype: 'industrialist', research: { queueIndex: 3, progress: 42 } }, // istnieje → zachowaj
    } } },
  };
  const out = migrate(save);
  assert(!out.error, 'migrate bez błędu');
  assert(out.version === 83, 'save.version → 83 po migracji');
  assert(deepEq(out.civ4x.gameState.empires.emp_01.research, { queueIndex: 0, progress: 0 }),
    'emp_01 dostał default research {0,0}');
  assert(deepEq(out.civ4x.gameState.empires.emp_02.research, { queueIndex: 3, progress: 42 }),
    'emp_02 zachował istniejący research {3,42} (NIE nadpisany)');
}

// ════════════════════════════════════════════════════════════════════════
header('9) Round-trip — empire.research przeżywa JSON + tick kontynuuje od stanu');
// ════════════════════════════════════════════════════════════════════════
{
  const before = { id: 'emp_rt', archetype: 'industrialist', research: { queueIndex: 1, progress: 30 } };
  const restored = JSON.parse(JSON.stringify(before));  // symuluje gameState serialize→restore
  assert(deepEq(restored.research, { queueIndex: 1, progress: 30 }), 'research przetrwał round-trip JSON');
  // queueIndex 1 → data_networks już zbadane; queue[1]=efficient_solar (cost 70)
  const aiTech = seedTech(IND.startingTechs, ['data_networks']);
  const capital = makeCapital({ aiTech, rate: 10 });
  window.KOSMOS.empireRegistry = makeRegistry([restored], { emp_rt: [capital] });
  sys._tick(4);  // 30 + 40 = 70 ≥ 70 → efficient_solar done
  assert(aiTech.isResearched('efficient_solar'), '(round-trip) tick kontynuował od progress=30 → efficient_solar done');
  assert(restored.research.queueIndex === 2, '(round-trip) queueIndex → 2');
}

// ════════════════════════════════════════════════════════════════════════
header('10) Wiring — bound handler _onTick (time:tick) działa jak _tick');
// ════════════════════════════════════════════════════════════════════════
{
  const { empire } = wireWorld({ archetype: 'industrialist', startingTechs: START, hasStation: true, rate: 10 });
  sys._onTick({ civDeltaYears: 5 });  // 50 res; data_networks 150 > 50 → break (brak ukończenia)
  assert(Math.abs(empire.research.progress - 50) < 1e-6, '_onTick zaakumulował 50 (rate 10 × 5cy)');
  assert(typeof sys._onTick === 'function', '_onTick zarejestrowany na time:tick');
}

// ── Podsumowanie ─────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════`);
console.log(`  PASS: ${pass}   FAIL: ${fail}`);
console.log(`════════════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
