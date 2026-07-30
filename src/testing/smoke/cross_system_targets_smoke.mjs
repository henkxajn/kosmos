// Slice D — cele cross-system w rejestrze (_getValidTargets) — offline smoke.
//
// Pokrycie:
//   T1  warp-capable transport → cele same-system (systemId=activeSys, sameSystem=true)
//       + cele CROSS-SYSTEM kolonii/stacji GRACZA (sameSystem=false, systemName, distLY)
//   T2  kolonia AI w innym układzie NIE jest celem transportu (→ handel S3.5b)
//   T3  statek BEZ warp (warpFuel.max=0) → tylko same-system (brak cross-system)
//   T4  select_target zone niesie targetSystemId (przez sortowanie same-system first)

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ style:{}, getContext:()=>({}), appendChild(){}, addEventListener(){} }), getElementById: () => null, addEventListener(){} };
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){}, key:()=>null, length:0 };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// ── Świat: 2 układy, kolonie gracza + AI + stacja ────────────────────────────
EntityManager.clear();
EntityManager.add({ id:'planet_home', type:'planet', name:'Dom',    systemId:'sys_home', x:0,   y:0 });
EntityManager.add({ id:'planet_a',    type:'planet', name:'Alfa',   systemId:'sys_home', x:100, y:0 });
EntityManager.add({ id:'planet_b',    type:'planet', name:'Beta-1', systemId:'sys_beta', x:0,   y:0 });
EntityManager.add({ id:'planet_ai',   type:'planet', name:'AI-kol', systemId:'sys_beta', x:50,  y:0 });
EntityManager.add({ id:'st_beta',     type:'station',name:'Stacja Beta', systemId:'sys_beta', bodyId:'planet_b', x:10, y:0, ownerEmpireId:null });

const COLONIES = {
  planet_a:  { planetId:'planet_a',  isOutpost:false, ownerEmpireId:null },
  planet_b:  { planetId:'planet_b',  isOutpost:false, ownerEmpireId:null },
  planet_ai: { planetId:'planet_ai', isOutpost:false, ownerEmpireId:'empire_2' },
};
const colonyManager = {
  hasColony: (id) => id in COLONIES,
  getColony: (id) => COLONIES[id] ?? null,
};

window.KOSMOS = {
  debug: {},
  homePlanet: { id:'planet_home' },
  activeSystemId: 'sys_home',
  colonyManager,
  galaxyData: { systems: [ {id:'sys_home', name:'Dom', x:0,y:0,z:0}, {id:'sys_beta', name:'Beta', x:3,y:0,z:0} ] },
  techSystem: { getShipSpeedMultiplier: () => 1 },
};

// Bare FMO instance — tylko pola potrzebne dla _getValidTargets.
const fmo = Object.create(FleetManagerOverlay.prototype);
fmo._cachedTargets = null;
fmo._cachedTargetsKey = '';
fmo._hitZones = [];

function makeVessel(warp = true) {
  return {
    id:'v_1', name:'T', systemId:'sys_home',
    colonyId:'planet_home', homeColonyId:'planet_home',
    position:{ x:0, y:0, state:'docked', dockedAt:'planet_home' },
    fuel:{ current:1000, max:1000, consumption:0.1 },   // duży zasięg AU → in-system reachable
    warpFuel: warp ? { current:100, max:100, consumption:0.1 } : { current:0, max:0, consumption:0 },
    modules:[], cargo:{ Fe:10 }, cargoMax:50,
  };
}

// ── T1 — warp-capable: same + cross-system ───────────────────────────────────
header('T1 warp-capable transport');
fmo._cachedTargets = null; fmo._cachedTargetsKey = '';
let targets = fmo._getValidTargets(makeVessel(true), 'transport');
const byId = (id) => targets.find(t => t.id === id);
assert(!!byId('planet_a') && byId('planet_a').sameSystem === true && byId('planet_a').systemId === 'sys_home',
  'planet_a: same-system (systemId=sys_home)');
assert(!!byId('planet_b') && byId('planet_b').sameSystem === false && byId('planet_b').systemId === 'sys_beta',
  'planet_b: cross-system (systemId=sys_beta)');
assert(byId('planet_b').systemName === 'Beta' && typeof byId('planet_b').distLY === 'number',
  'planet_b: systemName=Beta + distLY liczbowy');
assert(!!byId('st_beta') && byId('st_beta').sameSystem === false && byId('st_beta').type === 'station',
  'st_beta: stacja gracza cross-system jest celem');

// ── T2 — kolonia AI wykluczona ───────────────────────────────────────────────
header('T2 kolonia AI wykluczona');
assert(!byId('planet_ai'), 'planet_ai (AI, ownerEmpireId) NIE jest celem transportu');

// ── T3 — brak warp: tylko same-system ────────────────────────────────────────
header('T3 statek bez warp');
fmo._cachedTargets = null; fmo._cachedTargetsKey = '';
targets = fmo._getValidTargets(makeVessel(false), 'transport');
assert(targets.every(t => t.sameSystem === true), 'brak warp → zero celów cross-system');
assert(targets.some(t => t.id === 'planet_a'), 'same-system nadal działa (planet_a)');

// ── T4 — sort: same-system przed cross-system ────────────────────────────────
header('T4 kolejność same-system first');
fmo._cachedTargets = null; fmo._cachedTargetsKey = '';
targets = fmo._getValidTargets(makeVessel(true), 'transport');
const firstCross = targets.findIndex(t => t.sameSystem === false);
const lastSame   = targets.map(t => t.sameSystem).lastIndexOf(true);
assert(firstCross === -1 || lastSame < firstCross, 'wszystkie same-system przed cross-system');

console.log(`\n=== Slice D: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
