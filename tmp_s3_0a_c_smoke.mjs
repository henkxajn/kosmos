// S3.0a Commit (c) — Rafineria Atmosferyczna (Opcja A: H złoże→fuel): smoke (offline).
//
// Pokrycie:
//   T1  BUILDINGS.gas_fuel_refinery — isMine+mineResource+refineTo+autonomous+terrainAny (bez producer rates)
//   T3  FactorySystem._scanFuelDemand() → [] (fuel = produkt rafinerii, nie fabryki)
//   T4  canPlaceBuildingOnBody(refinery, *) → ok (terrainAny → buildable na gazowcu)
//   T5  i18n building.gas_fuel_refinery.name (PL+EN)
//   T6  Opcja A: refinery H ze złoża PROSTO w fuel — fuel rośnie, H NIE w inventory, złoże H depletuje
//   T7  generyczna kopalnia → H/C/Li do magazynu (H zostaje towarem; split nie psuje)
//   T8  mieszane: generic (H→magazyn) + refinery (H→fuel)
//   T9  MissionSystem.canFoundOutpost typeOk gas (3. bramka dispatch — BLOCKER fix)
//
// (T2 input-gate USUNIĘTE — mechanizm wycofany w Opcji A, gate naturalny na poziomie złoża.)

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];},
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };  // brak window.KOSMOS.resourceSystem → isActive=false
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { BUILDINGS }      = await import('./src/data/BuildingsData.js');
const { ResourceSystem } = await import('./src/systems/ResourceSystem.js');
const { FactorySystem }  = await import('./src/systems/FactorySystem.js');
const { BuildingSystem } = await import('./src/systems/BuildingSystem.js');
const { MissionSystem }  = await import('./src/systems/MissionSystem.js');
const { canPlaceBuildingOnBody } = await import('./src/utils/BodyTerrainUtils.js');
const EN = (await import('./src/i18n/en.js')).default;
const PL = (await import('./src/i18n/pl.js')).default;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// ── T1 — definicja budynku ───────────────────────────────────────────────
header('T1: BUILDINGS.gas_fuel_refinery (hybryda)');
{
  const r = BUILDINGS.gas_fuel_refinery;
  assert(!!r, 'budynek istnieje');
  assert(r?.isMine === true, `isMine === true (kolektory H) (got ${r?.isMine})`);
  assert(r?.isAutonomous === true, `isAutonomous === true (bez POP) (got ${r?.isAutonomous})`);
  assert(r?.terrainAny === true, `terrainAny === true (gazowiec) (got ${r?.terrainAny})`);
  assert(r?.popCost === 0, `popCost === 0 (got ${r?.popCost})`);
  assert(r?.requires === 'exploration', `requires === 'exploration' (got ${r?.requires})`);
  assert(!r?.rates?.fuel && !r?.rates?.H, `rates BEZ fuel/H (Opcja A: nie producent) (got ${JSON.stringify(r?.rates)})`);
  assert(r?.refineTo === 'fuel', `refineTo === 'fuel' (got ${r?.refineTo})`);
  assert(r?.refineRatio === 1.0, `refineRatio === 1.0 (got ${r?.refineRatio})`);
  assert(r?.category === 'mining', `category === 'mining' (got ${r?.category})`);
}

// ── T3 — _scanFuelDemand wygaszony ───────────────────────────────────────
header('T3: FactorySystem._scanFuelDemand → []');
{
  const result = FactorySystem.prototype._scanFuelDemand.call({});
  assert(Array.isArray(result) && result.length === 0, `_scanFuelDemand() === [] (got ${JSON.stringify(result)})`);
}

// ── T4 — terrainAny → buildable na gazowcu ───────────────────────────────
header('T4: canPlaceBuildingOnBody (terrainAny)');
{
  const r = BUILDINGS.gas_fuel_refinery;
  const check = canPlaceBuildingOnBody(r, new Set());  // brak terenów → terrainAny przepuszcza
  assert(check.ok === true, `terrainAny → ok (buildable na gazowcu) (got ${JSON.stringify(check)})`);
}

// ── T5 — i18n ─────────────────────────────────────────────────────────────
header('T5: i18n building.gas_fuel_refinery.name');
{
  assert(EN['building.gas_fuel_refinery.name'] === 'Atmospheric Refinery', `EN name (got ${EN['building.gas_fuel_refinery.name']})`);
  assert(PL['building.gas_fuel_refinery.name'] === 'Rafineria Atmosferyczna', `PL name (got ${PL['building.gas_fuel_refinery.name']})`);
}

// ── Helper: mock BuildingSystem do _tickMineExtraction ───────────────────
const DEP = (resourceId) => ({ resourceId, richness: 1.0, totalAmount: 10000, remaining: 10000 });
function makeBS(entries, deposits) {
  const bs = Object.create(BuildingSystem.prototype);
  bs._deposits = deposits;
  bs.resourceSystem = new ResourceSystem();
  bs._mineLevelDirty = true;
  bs._active = new Map(entries.map((e, i) => [`k${i}`, e]));
  bs._planetId = null;       // → asteroid bonus block skip
  bs.techSystem = null;
  return bs;
}

// ── T6 — c-fix: rafineria (mineResource:'H') wydobywa TYLKO H ─────────────
header('T6: rafineria — H ze złoża PROSTO w fuel (Opcja A)');
{
  assert(BUILDINGS.gas_fuel_refinery.mineResource === 'H', `mineResource === 'H' (got ${BUILDINGS.gas_fuel_refinery.mineResource})`);
  const deps = [DEP('H'), DEP('C'), DEP('Li')];
  const bs = makeBS([{ building: { isMine: true, mineResource: 'H', refineTo: 'fuel', refineRatio: 1.0, id: 'gas_fuel_refinery' }, level: 1 }], deps);
  bs._tickMineExtraction(1.0);
  assert(bs.resourceSystem.getAmount('fuel') > 0, `fuel wyprodukowany (got ${bs.resourceSystem.getAmount('fuel')})`);
  assert(bs.resourceSystem.getAmount('H') === 0, `H NIE w inventory (medium, nie towar) (got ${bs.resourceSystem.getAmount('H')})`);
  assert(bs.resourceSystem.getAmount('C') === 0 && bs.resourceSystem.getAmount('Li') === 0, 'C/Li NIE wydobyte');
  assert(deps[0].remaining < 10000, `złoże H depletuje (got ${deps[0].remaining})`);
  assert(deps[1].remaining === 10000 && deps[2].remaining === 10000, 'złoża C/Li nietknięte');
}

// ── T7 — generyczna kopalnia wydobywa WSZYSTKO (split nie psuje) ──────────
header('T7: generyczna kopalnia → wszystkie złoża');
{
  const deps = [DEP('H'), DEP('C'), DEP('Li')];
  const bs = makeBS([{ building: { isMine: true, id: 'mine' }, level: 1 }], deps);
  bs._tickMineExtraction(1.0);
  assert(bs.resourceSystem.getAmount('H') > 0 && bs.resourceSystem.getAmount('C') > 0 && bs.resourceSystem.getAmount('Li') > 0,
         'generyk wydobywa H+C+Li');
}

// ── T8 — mieszane: generic (H→magazyn) + refinery (H→fuel) ───────────────
header('T8: mieszane — generic daje H do magazynu, refinery robi fuel');
{
  const deps = [DEP('H'), DEP('C'), DEP('Li')];
  const bs = makeBS([
    { building: { isMine: true, id: 'mine' }, level: 1 },
    { building: { isMine: true, mineResource: 'H', refineTo: 'fuel', refineRatio: 1.0, id: 'gas_fuel_refinery' }, level: 1 },
  ], deps);
  bs._tickMineExtraction(1.0);
  assert(bs.resourceSystem.getAmount('H') > 0, `H w magazynie (z generic) (got ${bs.resourceSystem.getAmount('H')})`);
  assert(bs.resourceSystem.getAmount('fuel') > 0, `fuel (z refinery) (got ${bs.resourceSystem.getAmount('fuel')})`);
  assert(bs.resourceSystem.getAmount('C') > 0, 'C wydobyty przez generic');
  assert(deps[0].remaining < 10000, 'złoże H depletuje (oba)');
}

// ── T9 — BLOCKER fix: MissionSystem.canFoundOutpost typeOk dla gazowca ────
header('T9: MissionSystem.canFoundOutpost typeOk gas');
{
  globalThis.window.KOSMOS = {
    debug: {},
    techSystem: { isResearched: () => true },
    colonyManager: { activePlanetId: 'home', getColony: () => null },
    vesselManager: { getVessel: () => ({ cargoMax: 9999 }), hasAvailableShipWithCapability: () => true },
  };
  const ms = Object.create(MissionSystem.prototype);
  ms._findTarget = (id) => ({ id, type: 'planet', planetType: 'gas', explored: true });
  ms.resourceSystem = { canAfford: () => true, inventory: new Map() };
  const check = ms.canFoundOutpost('gasbody', 'gas_fuel_refinery', 'v1');
  assert(check.typeOk === true, `gazowiec typeOk === true (got ${check.typeOk})`);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
