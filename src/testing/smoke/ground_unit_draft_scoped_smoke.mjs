// Ground Unit Draft — colony-scoped recruitment — smoke (offline).
//
// Fix: rozkaz rekrutacji jednostki naziemnej celuje w KONKRETNĄ kolonię, nie w globalną
// „aktywną". Root-cause ambiguity: GroundUnitPanel._doRecruit() używał _getActiveColony()
// = window.KOSMOS.colonyManager.getActiveColony() (globalny _activePlanetId). Przy koszarach
// na wielu koloniach nie było wiadomo, gdzie powstaje jednostka.
//
// Zmiana: GroundUnitPanel dostaje WSTRZYKIWALNE źródło kolonii (getColony). Default = globalna
// aktywna (UnitDesignOverlay/JEDNOSTKI bez zmian). ColonyOverlay wstrzykuje kolonię ze swojego
// widoku → draft scoped do oglądanej kolonii. startGroundUnitBuild(planetId, ...) już niósł
// jawny planetId; kolejka jest per-kolonia i spawn idzie na colony.planetId (niezmienione).
//
// Pokrycie:
//   T1  panel scoped do A → _getActiveColony()===A, _doRecruit dispatch planetId=A
//   T2  panel scoped do B → dispatch planetId=B
//   T3  dwa panele scoped (A,B) równolegle → każdy swoja kolonia (koniec dwuznaczności)
//   T4  brak getColony (default) → fallback getActiveColony (backward compat UnitDesignOverlay)
//   T5  scoped panel IGNORUJE globalną aktywną (rdzeń buga) mimo getActiveColony=Global

globalThis.window = globalThis;
globalThis.Image = class { set src(v){} get src(){return '';} set onload(f){} set onerror(f){} };
globalThis.document = {
  createElement: () => ({ width:0, height:0, style:{}, getContext:()=>({fillRect(){},fillText(){}}), toDataURL:()=>'data:', appendChild(){}, addEventListener(){} }),
  getElementById: () => null,
};
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };

const mkColony = (id, name) => ({
  planetId: id, name,
  resourceSystem: { canAfford: () => true },
  civSystem: { freePops: 100, population: 50 },
  credits: 999999,
});
const colonyGlobal = mkColony('planet_GLOBAL', 'Global');
const colonyA      = mkColony('planet_A', 'Alpha');
const colonyB      = mkColony('planet_B', 'Beta');

const calls = [];
globalThis.window.KOSMOS = {
  debug: {},
  colonyManager: {
    getActiveColony: () => colonyGlobal,
    _getBarracksLevel: () => 2,
    _getMaxGroundUnits: () => 99,
    startGroundUnitBuild: (planetId, archetypeId, factionId) => {
      calls.push({ planetId, archetypeId, factionId });
      return { ok: true };
    },
  },
  techSystem: { isResearched: () => true },
  groundUnitManager: { getUnitsOnPlanet: () => [] },
};

const { GroundUnitPanel } = await import('../../ui/GroundUnitPanel.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

const mkPanel = (getColony) => new GroundUnitPanel({
  addHit: () => {}, getHoverZone: () => null, getMouse: () => ({ x: 0, y: 0 }), getColony,
});

// ── T1 — scoped do A ──────────────────────────────────────────────────────────
header('T1: panel scoped do kolonii A');
{
  const pA = mkPanel(() => colonyA);
  assert(pA._getActiveColony() === colonyA, '_getActiveColony() zwraca A (nie globalną)');
  calls.length = 0;
  pA._doRecruit();
  assert(calls.length === 1, '_doRecruit → dokładnie 1 rozkaz');
  assert(calls[0].planetId === 'planet_A', 'rozkaz niesie planetId=planet_A');
  assert(calls[0].archetypeId === 'shock_infantry', 'archetyp = domyślny shock_infantry');
}

// ── T2 — scoped do B ──────────────────────────────────────────────────────────
header('T2: panel scoped do kolonii B');
{
  const pB = mkPanel(() => colonyB);
  calls.length = 0;
  pB._doRecruit();
  assert(calls.length === 1 && calls[0].planetId === 'planet_B', 'rozkaz niesie planetId=planet_B');
}

// ── T3 — dwa panele równolegle, brak cross-talku ──────────────────────────────
header('T3: dwie kolonie z koszarami → każdy panel swoja (fix dwuznaczności)');
{
  const pA = mkPanel(() => colonyA);
  const pB = mkPanel(() => colonyB);
  calls.length = 0;
  pA._doRecruit();
  pB._doRecruit();
  assert(calls[0].planetId === 'planet_A' && calls[1].planetId === 'planet_B',
    'dwa scoped panele → dwa różne, poprawne planetId');
}

// ── T4 — backward compat (default = globalna aktywna) ─────────────────────────
header('T4: brak getColony → fallback getActiveColony (UnitDesignOverlay)');
{
  const pDefault = mkPanel(undefined);
  assert(pDefault._getActiveColony() === colonyGlobal, '_getActiveColony() = globalna aktywna');
  calls.length = 0;
  pDefault._doRecruit();
  assert(calls[0].planetId === 'planet_GLOBAL', 'default _doRecruit → globalna aktywna kolonia');
}

// ── T5 — scoped IGNORUJE globalną aktywną (rdzeń buga) ────────────────────────
header('T5: scoped draft ignoruje globalną aktywną');
{
  const pA = mkPanel(() => colonyA);
  // getActiveColony zwraca colonyGlobal, ale scoped panel MUSI użyć A
  calls.length = 0;
  pA._doRecruit();
  assert(calls[0].planetId !== colonyGlobal.planetId, 'NIE użył globalnej aktywnej');
  assert(calls[0].planetId === 'planet_A', 'użył scoped A');
}

console.log(`\nWYNIK: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
