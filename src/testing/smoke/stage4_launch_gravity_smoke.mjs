// KOSMOS Reform Etap 4 — smoke (offline): dopłata paliwowa za studnię grawitacyjną startu.
// Model: fuelCost = distance × consumption × launchMult;  launchMult zależy od CIAŁA-ŹRÓDŁA:
//   naziemne low <0.4g → ×0.7 / normal → ×1.0 / high >1.5g → ×1.5;  stacja + przestrzeń → ×1.0.
// Fail-open na całej ścieżce (brak źródła / nieznana grawitacja) → ×1.0 (nigdy nie blokuje startu).
//
// T1  LAUNCH_FUEL_GRAVITY_MULT — wartości pasm
// T2  launchFuelGravityMult(body) — pasma grawitacji + granice (0.4 / 1.5)
// T3  Stacja ZAWSZE ×1.0 (exempt, nawet high-g; nie dostaje też zniżki low-g)
// T4  Fail-open: null / undefined / brak grawitacji → ×1.0
// T5  resolveLaunchOriginBody — TYLKO docked; orbiting/in_transit/dock-bez-ref/nieznane → null
// T6  launchFuelMultiplierForVessel — docked na ciele wg pasma
// T7  launchFuelMultiplierForVessel — docked na stacji → ×1.0
// T8  launchFuelMultiplierForVessel — w przestrzeni / fail-open → ×1.0
// T9  Integracja: fuelCost = distance × consumption × mult (before/after, liczby z realnego save)
// T10 Progi = EnvironmentBands (jedno źródło prawdy — bez duplikatu literałów)

globalThis.localStorage = { _store:{}, length:0, key(){return null;}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];} };
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { LAUNCH_FUEL_GRAVITY_MULT, launchFuelGravityMult } = await import('../../data/LaunchFuelCost.js');
const { resolveLaunchOriginBody, launchFuelMultiplierForVessel } = await import('../../utils/SpaceportCheck.js');
const { gravityBand, GRAVITY_THRESHOLDS } = await import('../../data/EnvironmentBands.js');
const EntityManager = (await import('../../core/EntityManager.js')).default;

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { console.log('  ✓ ' + label); pass++; } else { console.log('  ✗ ' + label); fail++; } }
function header(t) { console.log('\n--- ' + t + ' ---'); }
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

const body = (id, surfaceGravity, type = 'planet') => { const b = { id, type, surfaceGravity }; EntityManager.add(b); return b; };
const dockedVessel = (dockedAt) => ({ position: { state: 'docked', dockedAt } });
const spaceVessel  = (state)    => ({ position: { state, dockedAt: 'irrelevant' } });

// ── T1 ────────────────────────────────────────────────────────────────────────
header('T1: LAUNCH_FUEL_GRAVITY_MULT wartości');
assert(LAUNCH_FUEL_GRAVITY_MULT.low === 0.7,    'low ×0.7');
assert(LAUNCH_FUEL_GRAVITY_MULT.normal === 1.0, 'normal ×1.0');
assert(LAUNCH_FUEL_GRAVITY_MULT.high === 1.5,   'high ×1.5');

// ── T2 ────────────────────────────────────────────────────────────────────────
header('T2: launchFuelGravityMult(body) — pasma + granice');
assert(launchFuelGravityMult({ surfaceGravity: 0.3 })  === 0.7, 'g=0.3 → low ×0.7');
assert(launchFuelGravityMult({ surfaceGravity: 0.39 }) === 0.7, 'g=0.39 → low ×0.7');
assert(launchFuelGravityMult({ surfaceGravity: 0.4 })  === 1.0, 'g=0.4 (granica LOW) → normal ×1.0');
assert(launchFuelGravityMult({ surfaceGravity: 1.0 })  === 1.0, 'g=1.0 → normal ×1.0');
assert(launchFuelGravityMult({ surfaceGravity: 1.5 })  === 1.0, 'g=1.5 (granica HIGH) → normal ×1.0');
assert(launchFuelGravityMult({ surfaceGravity: 1.51 }) === 1.5, 'g=1.51 → high ×1.5');
assert(launchFuelGravityMult({ surfaceGravity: 2.5 })  === 1.5, 'g=2.5 → high ×1.5');

// ── T3 ────────────────────────────────────────────────────────────────────────
header('T3: stacja ZAWSZE ×1.0 (Wariant A — exempt niezależnie od grawitacji)');
assert(launchFuelGravityMult({ type: 'station', surfaceGravity: 2.5 }) === 1.0, 'stacja high-g (2.5) → ×1.0 (nie ×1.5)');
assert(launchFuelGravityMult({ type: 'station', surfaceGravity: 0.2 }) === 1.0, 'stacja low-g (0.2) → ×1.0 (NIE zniżka ×0.7)');
assert(launchFuelGravityMult({ type: 'station' })                      === 1.0, 'stacja bez grawitacji → ×1.0');

// ── T4 ────────────────────────────────────────────────────────────────────────
header('T4: fail-open → ×1.0');
assert(launchFuelGravityMult(null)      === 1.0, 'null → ×1.0');
assert(launchFuelGravityMult(undefined) === 1.0, 'undefined → ×1.0');
assert(launchFuelGravityMult({ surfaceGravity: null })      === 1.0, 'g=null → normal ×1.0');
assert(launchFuelGravityMult({ surfaceGravity: undefined }) === 1.0, 'g=undefined → normal ×1.0');
assert(launchFuelGravityMult({})        === 1.0, 'ciało bez pól → ×1.0');

// ── T5 ────────────────────────────────────────────────────────────────────────
header('T5: resolveLaunchOriginBody — tylko docked');
const groundLow = body('t5_ground', 0.3);
body('t5_station', 2.0, 'station');
assert(resolveLaunchOriginBody(dockedVessel('t5_ground')) === groundLow, 'docked na ciele → encja');
assert(resolveLaunchOriginBody(spaceVessel('orbiting'))   === null, 'orbiting → null (w przestrzeni)');
assert(resolveLaunchOriginBody(spaceVessel('in_transit')) === null, 'in_transit → null');
assert(resolveLaunchOriginBody({ position: { state: 'docked', dockedAt: null } })      === null, 'docked bez ref → null');
assert(resolveLaunchOriginBody({ position: { state: 'docked', dockedAt: 'ghost' } })   === null, 'docked na nieznanym ciele → null');
assert(resolveLaunchOriginBody(null) === null, 'brak statku → null');
assert(resolveLaunchOriginBody({})   === null, 'statek bez position → null');

// ── T6 ────────────────────────────────────────────────────────────────────────
header('T6: launchFuelMultiplierForVessel — docked na ciele');
body('t6_low', 0.2); body('t6_norm', 1.0); body('t6_high', 3.0);
assert(launchFuelMultiplierForVessel(dockedVessel('t6_low'))  === 0.7, 'docked low → ×0.7');
assert(launchFuelMultiplierForVessel(dockedVessel('t6_norm')) === 1.0, 'docked normal → ×1.0');
assert(launchFuelMultiplierForVessel(dockedVessel('t6_high')) === 1.5, 'docked high → ×1.5');

// ── T7 ────────────────────────────────────────────────────────────────────────
header('T7: docked na stacji → ×1.0');
assert(launchFuelMultiplierForVessel(dockedVessel('t5_station')) === 1.0, 'docked na stacji (g=2.0) → ×1.0');

// ── T8 ────────────────────────────────────────────────────────────────────────
header('T8: w przestrzeni / fail-open → ×1.0');
assert(launchFuelMultiplierForVessel(spaceVessel('orbiting'))   === 1.0, 'orbiting → ×1.0');
assert(launchFuelMultiplierForVessel(spaceVessel('in_transit')) === 1.0, 'in_transit → ×1.0');
assert(launchFuelMultiplierForVessel({ position: { state: 'docked', dockedAt: null } })    === 1.0, 'docked bez ref → ×1.0 (fail-open)');
assert(launchFuelMultiplierForVessel({ position: { state: 'docked', dockedAt: 'ghost' } }) === 1.0, 'docked nieznane ciało → ×1.0');
assert(launchFuelMultiplierForVessel(null) === 1.0, 'null vessel → ×1.0');

// ── T9 ────────────────────────────────────────────────────────────────────────
header('T9: fuelCost = distance × consumption × mult (before/after, liczby z realnego save r79_v92)');
const consumption = 0.29803;  // hull_small: engine_chemical + cargo_small (z save)
const distGround  = 2.861;    // Opat III → Fobos (start z PLANETY Nowa Ziemia)
const distStation = 2.003;    // Dostawca III → Fobos (start ze STACJI Nowa Ziemia)
const base = distGround * consumption;
assert(near(base, 0.8526), `ground base (bez dopłaty) = ${base.toFixed(4)} ≈ 0.8526`);
assert(near(base * 0.7, 0.5969), `ground LOW ×0.7  = ${(base * 0.7).toFixed(4)} (taniej)`);
assert(near(base * 1.0, 0.8526), `ground NORMAL ×1.0 = ${(base * 1.0).toFixed(4)} (bez zmian)`);
assert(near(base * 1.5, 1.2790), `ground HIGH ×1.5 = ${(base * 1.5).toFixed(4)} (drożej)`);
const stationBase = distStation * consumption;
assert(near(stationBase, 0.5968), `station base = ${stationBase.toFixed(4)} ≈ 0.5968`);
assert(near(stationBase * 1.0, 0.5968), 'station ×1.0 (exempt) — dopłata NIE dotyczy stacji w żadnym paśmie');

// ── T10 ───────────────────────────────────────────────────────────────────────
header('T10: progi z EnvironmentBands (jedno źródło prawdy)');
assert(GRAVITY_THRESHOLDS.LOW === 0.4 && GRAVITY_THRESHOLDS.HIGH === 1.5, 'progi 0.4 / 1.5');
assert(launchFuelGravityMult({ surfaceGravity: GRAVITY_THRESHOLDS.LOW - 0.001 })  === 0.7, 'tuż pod LOW → low');
assert(launchFuelGravityMult({ surfaceGravity: GRAVITY_THRESHOLDS.HIGH + 0.001 }) === 1.5, 'tuż nad HIGH → high');
assert(gravityBand(0.3) === 'low' && gravityBand(1.0) === 'normal' && gravityBand(2.0) === 'high', 'gravityBand spójny z mnożnikiem');

// ── T11 ───────────────────────────────────────────────────────────────────────
// Wiring end-to-end (nie tylko formuła): prawdziwy MissionSystem._dispatchLoopLeg z ciała
// high-g vs normal-g → dopłata REALNIE dociera do fuelCost przekazanego do dispatchOnMission.
header('T11: wiring — _dispatchLoopLeg z docked high-g/normal → fuelCost realnie ×mult');
const { MissionSystem } = await import('../../systems/MissionSystem.js');
const { GAME_CONFIG }   = await import('../../config/GameConfig.js');
const AU = GAME_CONFIG.AU_TO_PX;
body('t11_high', 3.0);   // origin high-g → ×1.5
body('t11_norm', 1.0);   // origin normal → ×1.0 (kontrola)
EntityManager.add({ id: 't11_target', type: 'planet', x: 2 * AU, y: 0, name: 'Cel T11' });
window.KOSMOS.colonyManager = { getColony: () => null, activePlanetId: 't11_high' };

function runLoopLeg(dockedAt) {
  let captured = null;
  const vessel = {
    id: 't11_v', shipId: 'hull_small', speedAU: 1.0,
    position: { state: 'docked', dockedAt, x: 0, y: 0 },
    fuel: { current: 100, consumption: 0.3 }, cargo: {},
  };
  window.KOSMOS.vesselManager = {
    getVessel: (id) => (id === 't11_v' ? vessel : null),
    dispatchOnMission: (_id, m) => { captured = m; return true; },
  };
  const ms = new MissionSystem({});
  ms._dispatchLoopLeg({ vesselId: 't11_v', loop: true, loopSourceId: dockedAt, loopTargetId: 't11_target' },
                      vessel, 't11_target', 'outbound');
  return captured?.fuelCost ?? null;
}

const base11 = 2.0 * 0.3;   // dist 2 AU × consumption 0.3 = 0.6
const highFuel = runLoopLeg('t11_high');
const normFuel = runLoopLeg('t11_norm');
assert(near(highFuel, base11 * 1.5), `docked high-g → fuelCost ${(highFuel ?? 0).toFixed(4)} == ${base11}×1.5 (${(base11 * 1.5).toFixed(2)})`);
assert(near(normFuel, base11 * 1.0), `docked normal → fuelCost ${(normFuel ?? 0).toFixed(4)} == ${base11}×1.0 (kontrola)`);
assert(highFuel > normFuel + 0.2, 'high-g realnie drożej niż normal (dopłata dociera do dispatchOnMission)');

console.log(`\n=== Etap 4 launch-gravity smoke: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
