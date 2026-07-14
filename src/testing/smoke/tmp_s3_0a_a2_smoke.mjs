// S3.0a Commit (a) — runda 2 fixów (live-gate): smoke (offline, real ResourceSystem + _tickRefueling).
//
// Pokrycie:
//   T1  Fix A — kadłub/statek bez silnika → fuelType z definicji = 'fuel'       (HullsData/ShipsData)
//   T2  Fix A — refueling realnie ODEJMUJE 'fuel' z inventory (nie nieskończone)
//   T3  Fix B — kolonia BEZ fuel: bak NIE rośnie + _awaitingFuel=true + status refueling
//   T4  Fix B — kolonia z fuel: bak rośnie, inventory spada, _awaitingFuel=false
//   T5  Fix C — pełny bak → _awaitingFuel=false (clear)

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];},
};
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { ResourceSystem } = await import('../../systems/ResourceSystem.js');
const { VesselManager }  = await import('../../systems/VesselManager.js');
const { HULLS }          = await import('../../data/HullsData.js');
const { SHIPS }          = await import('../../data/ShipsData.js');
const { consumeFuel, needsRefuel } = await import('../../entities/Vessel.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// Helper: świeży statek na 'fuel', docked @kolonia z mockiem colonyManager.
function makeVessel(fuelType = 'fuel', current = 5, max = 8) {
  return {
    id: 'v_' + Math.random().toString(36).slice(2, 7),
    status: 'idle',
    fuelType,
    fuel: { current, max, consumption: 0.5, fuelType },
    position: { state: 'docked', dockedAt: 'home', x: 0, y: 0 },
  };
}
function setupColony(fuelStock) {
  const rs = new ResourceSystem();
  if (fuelStock > 0) rs.receive({ fuel: fuelStock });
  const colony = { id: 'home', resourceSystem: rs };
  window.KOSMOS = { colonyManager: { getColony: (id) => (id === 'home' ? colony : null) } };
  return rs;
}

// ── T1 — Fix A: definicje kadłubów/statków na 'fuel' ─────────────────────
header('T1: Fix A — HullsData/ShipsData fuelType = fuel (bez silnika)');
{
  for (const [id, def] of Object.entries(HULLS)) {
    if (def.fuelType !== undefined) assert(def.fuelType === 'fuel', `HULLS.${id}.fuelType === 'fuel' (got ${def.fuelType})`);
  }
  for (const [id, def] of Object.entries(SHIPS)) {
    if (def.fuelType !== undefined) assert(def.fuelType === 'fuel', `SHIPS.${id}.fuelType === 'fuel' (got ${def.fuelType})`);
  }
}

// ── T2 — Fix A: refueling odejmuje fuel z inventory ──────────────────────
header('T2: refueling ODEJMUJE fuel (nie nieskończone)');
{
  const rs = setupColony(50);
  const vm = new VesselManager();
  const v = makeVessel('fuel', 5, 8);
  vm._vessels.set(v.id, v);
  for (let i = 0; i < 5; i++) vm._tickRefueling(1.0);
  assert(v.fuel.current >= v.fuel.max - 1e-6, `bak pełny (got ${v.fuel.current})`);
  assert(rs.getAmount('fuel') < 50, `inventory.fuel SPADŁO z 50 (got ${rs.getAmount('fuel').toFixed(2)})`);
  assert(Math.abs(rs.getAmount('fuel') - 47) < 1e-6, `dokładnie 47 (50 - 3 zużyte) (got ${rs.getAmount('fuel').toFixed(2)})`);
}

// ── T3 — Fix B: kolonia BEZ fuel → bak nie rośnie + awaitingFuel ─────────
header('T3: Fix B — brak fuel: bak nie rośnie ZA DARMO + _awaitingFuel');
{
  setupColony(0);  // zero fuel
  const vm = new VesselManager();
  const v = makeVessel('fuel', 5, 8);
  vm._vessels.set(v.id, v);
  for (let i = 0; i < 3; i++) vm._tickRefueling(1.0);
  assert(Math.abs(v.fuel.current - 5) < 1e-6, `bak NIE wzrósł (został 5) (got ${v.fuel.current})`);
  assert(v._awaitingFuel === true, `_awaitingFuel === true (got ${v._awaitingFuel})`);
  assert(v.status === 'refueling', `status 'refueling' (czeka) (got ${v.status})`);
}

// ── T4 — Fix B: kolonia z fuel → tankuje + flag czyszczony ───────────────
header('T4: Fix B — z fuel: tankuje + inventory spada + _awaitingFuel=false');
{
  const rs = setupColony(10);
  const vm = new VesselManager();
  const v = makeVessel('fuel', 5, 8);
  vm._vessels.set(v.id, v);
  vm._tickRefueling(1.0);  // +3 → bak 8, inventory 7
  assert(v.fuel.current > 5, `bak wzrósł (got ${v.fuel.current})`);
  assert(rs.getAmount('fuel') < 10, `inventory spadło (got ${rs.getAmount('fuel').toFixed(2)})`);
  assert(v._awaitingFuel === false, `_awaitingFuel === false po udanym tankowaniu (got ${v._awaitingFuel})`);
}

// ── T5 — Fix C: pełny bak → flag wyczyszczony ────────────────────────────
header('T5: Fix C — pełny bak → _awaitingFuel=false');
{
  setupColony(0);
  const vm = new VesselManager();
  const v = makeVessel('fuel', 8, 8);  // pełny
  v._awaitingFuel = true;              // udawany stary stan
  vm._vessels.set(v.id, v);
  vm._tickRefueling(1.0);
  assert(needsRefuel(v) === false, 'bak pełny → needsRefuel false');
  assert(v._awaitingFuel === false, `_awaitingFuel wyczyszczony (got ${v._awaitingFuel})`);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
