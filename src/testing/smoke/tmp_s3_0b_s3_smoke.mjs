// S3.0b S3 — smoke "warp od startu" (gate + silnik). REGRESSION GUARD.
//
// Dowodzi, że reforma S3 obniżyła bramki warpu do mid-game (bez T4, bez odkryć),
// zostawiając koszt surowcowy jako lewar, i NIE zepsuła endgame'u:
//   S3a (CommoditiesData): warp_cores→ion_drives, quantum_cores→quantum_physics,
//        antimatter_cells→fusion_power (receptury bez zmian).
//   S3b (ShipModulesData): engine_warp.commodityCost bez T3-komponentów
//        (electronic_systems+power_cells), engine_warp.requires→ion_drives.
// Sekcja 3 uruchamia PRAWDZIWY TechSystem + FactorySystem (stub _getOwnerColony) —
// dowodzi że warp_cores jest realnie producowalny dopiero po CAŁYM trio
// (ion_drives + quantum_physics + fusion_power), a żaden stary gate T4 nie jest potrzebny.

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

const { COMMODITIES }  = await import('../../data/CommoditiesData.js');
const { SHIP_MODULES } = await import('../../data/ShipModulesData.js');
const { TECHS }        = await import('../../data/TechData.js');
const { BUILDINGS }    = await import('../../data/BuildingsData.js');
const { TechSystem }   = await import('../../systems/TechSystem.js');
const { FactorySystem } = await import('../../systems/FactorySystem.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }
// Płaskie porównanie map receptur/kosztów (klucz→liczba)
function shallowEqual(a, b) {
  if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k] === b[k]);
}

// ════════════════════════════════════════════════════════════════════════
header('1) S3a — gate ekonomii warp_cores (spread) + typo guard + receptury');
// ════════════════════════════════════════════════════════════════════════
assert(COMMODITIES.warp_cores.requiresTech      === 'ion_drives',      'warp_cores.requiresTech = ion_drives');
assert(COMMODITIES.quantum_cores.requiresTech   === 'quantum_physics', 'quantum_cores.requiresTech = quantum_physics');
assert(COMMODITIES.antimatter_cells.requiresTech === 'fusion_power',   'antimatter_cells.requiresTech = fusion_power');
// Typo guard — nowe gate'y MUSZĄ być realnymi technami (literówka = wieczna blokada)
assert(!!TECHS['ion_drives'],      'gate tech ion_drives istnieje w TECHS');
assert(!!TECHS['quantum_physics'], 'gate tech quantum_physics istnieje w TECHS');
assert(!!TECHS['fusion_power'],    'gate tech fusion_power istnieje w TECHS');
// Receptury (koszt surowcowy = lewar) — bez zmian
assert(shallowEqual(COMMODITIES.warp_cores.recipe,      { quantum_cores: 2, antimatter_cells: 2, Ti: 8 }),      'warp_cores.recipe bez zmian');
assert(shallowEqual(COMMODITIES.quantum_cores.recipe, { Si: 6, Nt: 4, Hv: 4, Xe: 3, Ti: 2, Li: 2 }), 'quantum_cores.recipe bez zmian');
assert(shallowEqual(COMMODITIES.antimatter_cells.recipe, { Nt: 4, Xe: 4, Hv: 3, Li: 2 }),                       'antimatter_cells.recipe bez zmian');

// ════════════════════════════════════════════════════════════════════════
header('2) S3b — silnik warp bez T3-komponentów + gate modułu ion_drives');
// ════════════════════════════════════════════════════════════════════════
const ew = SHIP_MODULES.engine_warp;
assert(ew.requires === 'ion_drives', 'engine_warp.requires = ion_drives (match warp_cores gate)');
assert(shallowEqual(ew.commodityCost, { warp_cores: 2, electronic_systems: 4, power_cells: 2 }),
  'engine_warp.commodityCost = warp_cores:2 + electronic_systems:4 + power_cells:2');
assert(!('metamaterials' in ew.commodityCost) && !('quantum_processors' in ew.commodityCost),
  'engine_warp BEZ T3-gated metamaterials/quantum_processors');
assert(shallowEqual(ew.cost, { Ti: 50, Hv: 20 }), 'engine_warp.cost {Ti:50,Hv:20} bez zmian');
// Substytuty muszą być naprawdę wczesne (brak requiresTech)
assert(!COMMODITIES.electronic_systems.requiresTech, 'electronic_systems bez tech-gate (wczesny)');
assert(!COMMODITIES.power_cells.requiresTech,        'power_cells bez tech-gate (wczesny)');

// ════════════════════════════════════════════════════════════════════════
header('3) Behawioralny — PRAWDZIWY TechSystem + FactorySystem (kaskada trio)');
// ════════════════════════════════════════════════════════════════════════
const techSys = new TechSystem();
const fs = new FactorySystem(null);
fs._getOwnerColony = () => ({ buildingSystem: { techSystem: techSys } }); // stub: tylko lookup kolonii

// (a) Stan zerowy — nic nie zbadane
assert(fs.isRecipeAvailable('warp_cores')       === false, '(zero) warp_cores niedostępne');
assert(fs.isRecipeAvailable('quantum_cores')    === false, '(zero) quantum_cores niedostępne');
assert(fs.isRecipeAvailable('antimatter_cells') === false, '(zero) antimatter_cells niedostępne');
assert(techSys.isResearched('ion_drives')       === false, '(zero) moduł engine_warp zablokowany (ion_drives nie zbadane)');

// (b) + ion_drives — gate BEZPOŚREDNI warp_cores otwarty, ale kaskada wciąż blokuje
techSys.restore({ researched: ['ion_drives'] });
assert(fs.isRecipeAvailable('warp_cores') === true, '(+ion) warp_cores gate bezpośredni otwarty');
assert(techSys.isResearched('ion_drives') === true, '(+ion) moduł engine_warp odblokowany (requires=ion_drives)');
const blocked1 = fs._getTechBlockedIngredients('warp_cores').map(b => b.ingredientId).sort();
assert(blocked1.length === 2 && blocked1.includes('quantum_cores') && blocked1.includes('antimatter_cells'),
  '(+ion) warp_cores wciąż blokowany kaskadowo: [antimatter_cells, quantum_cores]');

// (c) + quantum_physics — quantum_cores producowalny, zostaje 1 blokada
techSys.restore({ researched: ['quantum_physics'] });
assert(fs.isRecipeAvailable('quantum_cores') === true, '(+qphys) quantum_cores dostępny');
const blocked2 = fs._getTechBlockedIngredients('warp_cores').map(b => b.ingredientId);
assert(blocked2.length === 1 && blocked2[0] === 'antimatter_cells', '(+qphys) warp_cores: zostaje tylko antimatter_cells');

// (d) + fusion_power — pełne trio → warp_cores realnie producowalny
techSys.restore({ researched: ['fusion_power'] });
assert(fs.isRecipeAvailable('antimatter_cells') === true, '(+fusion) antimatter_cells dostępny');
assert(fs._getTechBlockedIngredients('warp_cores').length === 0, '(+fusion) warp_cores w pełni producowalny (0 blokad kaskady)');

// (e) MID-GAME — trio osiągnięte BEZ żadnego starego gate T4
assert(!techSys.isResearched('warp_drive') && !techSys.isResearched('quantum_computing') && !techSys.isResearched('antimatter_containment'),
  '(mid-game) warp_cores producowalny bez warp_drive / quantum_computing / antimatter_containment (T4)');

// ════════════════════════════════════════════════════════════════════════
header('4) Regresja — endgame nadal za swoimi technami + mk2 nietknięty');
// ════════════════════════════════════════════════════════════════════════
assert(BUILDINGS.warp_beacon.requires === 'warp_theory',                 'REGR: warp_beacon wciąż requires warp_theory');
assert(BUILDINGS.jump_gate.requires   === 'interstellar_colonization',   'REGR: jump_gate wciąż requires interstellar_colonization');
assert(TECHS.interstellar_colonization?.requiresInventory?.warp_cores === 5, 'REGR: interstellar_colonization wciąż wymaga warp_cores:5 w magazynie');
assert(BUILDINGS.warp_beacon.commodityCost?.warp_cores === 5,  'REGR: warp_beacon wciąż konsumuje warp_cores:5');
assert(BUILDINGS.jump_gate.commodityCost?.warp_cores   === 20, 'REGR: jump_gate wciąż konsumuje warp_cores:20');
const mk2 = SHIP_MODULES.engine_warp_mk2;
assert(mk2.requires === 'warp_drive_mk2', 'REGR: engine_warp_mk2 wciąż gated za warp_drive_mk2 (T5)');
assert(shallowEqual(mk2.commodityCost, { warp_cores: 2, metamaterials: 6, quantum_processors: 3 }),
  'REGR: engine_warp_mk2.commodityCost nietknięty (metamaterials/quantum_processors)');

// ════════════════════════════════════════════════════════════════════════
console.log(`\n=== S3.0b S3 smoke: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
