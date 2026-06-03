// S3.0b S1 — smoke modelu dwu-bakowego + silnika warp dwutrybowego.
// Pokrywa save-krytyczne, czyste ścieżki (bez przeglądarki):
//   1) Migracja v81→v82 — plain ship, legacy-warp (modules), legacy-warp (po fuel.fuelType), idempotencja
//   2) calcShipStats — warpFuelCapacity (Komora Warp) + fuelPerLY (silnik warp) + fuelType ZAWSZE 'fuel'
//   3) createVessel — inicjalizacja baku warpFuel (pusty start, opts.warpFuelCurrent)
//   4) Helpery warp — warpRange/canJump/consumeWarpFuel/needsWarpRefuel/refuelWarp (+ edge: brak silnika → 0)
//
// (Pełny chain v78→v82 ma osobny test tmp_s3_0a_chain_v78_v81_smoke.mjs.)

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

const { CURRENT_VERSION, migrate } = await import('./src/systems/SaveMigration.js');
const { calcShipStats }            = await import('./src/data/ShipModulesData.js');
const { HULLS }                    = await import('./src/data/HullsData.js');
const {
  createVessel, warpRange, canJump, consumeWarpFuel, needsWarpRefuel, refuelWarp,
} = await import('./src/entities/Vessel.js');
const { VesselManager }            = await import('./src/systems/VesselManager.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) < eps; }
function header(title) { console.log('\n--- ' + title + ' ---'); }

// ════════════════════════════════════════════════════════════════════════
header('1) Migracja v81→v82');
// ════════════════════════════════════════════════════════════════════════
const saveV81 = {
  version: 81,
  civ4x: {
    vesselManager: {
      vessels: [
        // (a) zwykły statek in-system (bez warp)
        { id: 'hauler', fuelType: 'fuel', modules: ['engine_chemical', 'cargo_small'],
          fuel: { fuelType: 'fuel', current: 5, max: 8 } },
        // (b) legacy warp z modułem engine_warp (stary bak trzymał warp_cores)
        { id: 'warpA', fuelType: 'warp_cores', modules: ['engine_warp', 'cargo_small'],
          fuel: { fuelType: 'warp_cores', current: 3, max: 4 } },
        // (c) legacy warp WYKRYTY po fuel.fuelType (brak modules — fixture uproszczony)
        { id: 'warpB', fuelType: 'warp_cores',
          fuel: { fuelType: 'warp_cores', current: 1, max: 6 } },
        // (d) idempotencja — statek już ma warpFuel (nie nadpisuj)
        { id: 'preW', fuelType: 'fuel', modules: ['engine_chemical'],
          fuel: { fuelType: 'fuel', current: 2, max: 8 },
          warpFuel: { current: 9, max: 12, consumption: 0.5, fuelType: 'warp_cores' } },
      ],
    },
    colonies: [{ resources: { inventory: { Fe: 100, fuel: 30, H: 0 } } }],
  },
};

const m = migrate(JSON.parse(JSON.stringify(saveV81)));
assert(!m.error, m.error ? `migracja BŁĄD: ${m.error}` : 'migracja bez błędu');
assert(m.version === CURRENT_VERSION && m.version === 82, `version === 82 (got ${m.version})`);

const byId = {};
for (const v of m.civ4x.vesselManager.vessels) byId[v.id] = v;

// (a) hauler — nie-warp: bak in-system 'fuel', warpFuel.max 0
assert(byId.hauler.fuel.fuelType === 'fuel', 'hauler fuel.fuelType === fuel');
assert(byId.hauler.fuel.current === 5, `hauler fuel.current zachowany 5 (got ${byId.hauler.fuel.current})`);
assert(byId.hauler.warpFuel && byId.hauler.warpFuel.max === 0, `hauler warpFuel.max === 0 (got ${byId.hauler.warpFuel?.max})`);
assert(byId.hauler.fuelType === 'fuel', 'hauler root fuelType === fuel');

// (b) warpA — RESCUE z modułem engine_warp
assert(byId.warpA.fuelType === 'fuel', `warpA root fuelType → fuel (got ${byId.warpA.fuelType})`);
assert(byId.warpA.fuel.fuelType === 'fuel' && byId.warpA.fuel.max === 8, `warpA bak in-system reset {8,fuel} (got ${byId.warpA.fuel.max}/${byId.warpA.fuel.fuelType})`);
assert(byId.warpA.warpFuel.current === 3, `warpA warpFuel.current === 3 (rescue) (got ${byId.warpA.warpFuel.current})`);
assert(byId.warpA.warpFuel.max === 5, `warpA warpFuel.max === 5 = max(4,5) (got ${byId.warpA.warpFuel.max})`);
assert(byId.warpA.warpFuel.fuelType === 'warp_cores', 'warpA warpFuel.fuelType === warp_cores');

// (c) warpB — RESCUE po fuel.fuelType (bez modules)
assert(byId.warpB.fuelType === 'fuel', 'warpB root fuelType → fuel');
assert(byId.warpB.warpFuel.current === 1, `warpB warpFuel.current === 1 (got ${byId.warpB.warpFuel.current})`);
assert(byId.warpB.warpFuel.max === 6, `warpB warpFuel.max === 6 = max(6,5) (got ${byId.warpB.warpFuel.max})`);
assert(byId.warpB.fuel.fuelType === 'fuel', 'warpB bak in-system reset → fuel');

// (d) preW — idempotencja: warpFuel istniejący NIE nadpisany
assert(byId.preW.warpFuel.current === 9 && byId.preW.warpFuel.max === 12, `preW warpFuel zachowany {9,12} (got ${byId.preW.warpFuel.current}/${byId.preW.warpFuel.max})`);
assert(byId.preW.fuel.fuelType === 'fuel', 'preW fuel.fuelType === fuel');

// ════════════════════════════════════════════════════════════════════════
header('2) calcShipStats — warpFuelCapacity + fuelPerLY + fuelType');
// ════════════════════════════════════════════════════════════════════════
const hull = HULLS.hull_medium;

const sWarp = calcShipStats(hull, ['engine_warp', 'warp_tank']);
assert(sWarp.warpFuelCapacity === 5, `warp build: warpFuelCapacity === 5 (got ${sWarp.warpFuelCapacity})`);
assert(sWarp.fuelPerLY === 0.5, `warp build: fuelPerLY === 0.5 (got ${sWarp.fuelPerLY})`);
assert(sWarp.warpCapable === true, 'warp build: warpCapable === true');
assert(sWarp.fuelType === 'fuel', `warp build: fuelType === 'fuel' (porzucenie ostatni-silnik-wygrywa) (got ${sWarp.fuelType})`);
assert(sWarp.warpSpeedLY === 2.0, `warp build: warpSpeedLY === 2.0 (got ${sWarp.warpSpeedLY})`);

const sPlain = calcShipStats(hull, ['engine_chemical', 'cargo_small']);
assert(sPlain.warpFuelCapacity === 0, `plain build: warpFuelCapacity === 0 (got ${sPlain.warpFuelCapacity})`);
assert(sPlain.fuelPerLY === 0, `plain build: fuelPerLY === 0 (got ${sPlain.fuelPerLY})`);
assert(sPlain.warpCapable === false, 'plain build: warpCapable === false');
assert(sPlain.fuelType === 'fuel', 'plain build: fuelType === fuel');

const sMk2 = calcShipStats(hull, ['engine_warp_mk2', 'warp_tank']);
assert(sMk2.warpFuelCapacity === 5 && sMk2.fuelPerLY === 0.5, `mk2: warpFuelCapacity 5 / fuelPerLY 0.5 (got ${sMk2.warpFuelCapacity}/${sMk2.fuelPerLY})`);
assert(sMk2.speed > sWarp.speed, `mk2 sublight szybszy niż tier1 (mk2 ${sMk2.speed.toFixed(2)} > w1 ${sWarp.speed.toFixed(2)})`);
assert(sMk2.warpSpeedLY === sWarp.warpSpeedLY, 'mk2 warpSpeedLY === tier1 (skok bez zmian między tierami)');

// engine_warp jest najżarłoczniejszy in-system (fuelMult 2.3 > fuzja 2.0)
assert(sWarp.fuelPerAU > sPlain.fuelPerAU, `warp fuelPerAU > chemical (presja paliwowa) (got ${sWarp.fuelPerAU.toFixed(3)} > ${sPlain.fuelPerAU.toFixed(3)})`);

// ════════════════════════════════════════════════════════════════════════
header('3) createVessel — inicjalizacja baku warpFuel');
// ════════════════════════════════════════════════════════════════════════
const cvWarp = createVessel('hull_medium', 'col_test', { modules: ['engine_warp', 'warp_tank'] });
assert(cvWarp.warpFuel.max === 5, `createVessel warp: warpFuel.max === 5 (got ${cvWarp.warpFuel.max})`);
assert(cvWarp.warpFuel.current === 0, `createVessel warp: startuje PUSTY current === 0 (got ${cvWarp.warpFuel.current})`);
assert(approx(cvWarp.warpFuel.consumption, 0.5), `createVessel warp: warpFuel.consumption === 0.5 (got ${cvWarp.warpFuel.consumption})`);
assert(cvWarp.warpFuel.fuelType === 'warp_cores', 'createVessel warp: warpFuel.fuelType === warp_cores');
assert(cvWarp.fuel.fuelType === 'fuel', 'createVessel warp: bak in-system fuelType === fuel');

const cvFull = createVessel('hull_medium', 'col_test', { modules: ['engine_warp', 'warp_tank'], warpFuelCurrent: 5 });
assert(cvFull.warpFuel.current === 5, `createVessel opts.warpFuelCurrent honorowany (got ${cvFull.warpFuel.current})`);

const cvPlain = createVessel('hull_small', 'col_test', { modules: ['engine_chemical'] });
assert(cvPlain.warpFuel.max === 0, `createVessel plain: warpFuel.max === 0 (got ${cvPlain.warpFuel.max})`);

// ════════════════════════════════════════════════════════════════════════
header('4) Helpery warp');
// ════════════════════════════════════════════════════════════════════════
// warpRange / canJump
const vR = { warpFuel: { current: 10, max: 20, consumption: 0.5, fuelType: 'warp_cores' } };
assert(warpRange(vR) === 20, `warpRange 10/0.5 === 20 (got ${warpRange(vR)})`);
assert(canJump(vR, 15) === true, 'canJump 15 LY (range 20) === true');
assert(canJump(vR, 25) === false, 'canJump 25 LY (range 20) === false');

// consumeWarpFuel — zwykły + clamp
const vC = { warpFuel: { current: 10, max: 20, consumption: 0.5, fuelType: 'warp_cores' } };
assert(consumeWarpFuel(vC, 4) === 2 && vC.warpFuel.current === 8, `consumeWarpFuel 4LY → -2, current 8 (got ${vC.warpFuel.current})`);
assert(consumeWarpFuel(vC, 100) === 8 && vC.warpFuel.current === 0, `consumeWarpFuel clamp do 0 (got ${vC.warpFuel.current})`);

// needsWarpRefuel / refuelWarp
const vF = { warpFuel: { current: 5, max: 20, consumption: 0.5, fuelType: 'warp_cores' } };
assert(needsWarpRefuel(vF) === true, 'needsWarpRefuel (5<20) === true');
assert(refuelWarp(vF, 8) === 8 && vF.warpFuel.current === 13, `refuelWarp +8 → 13 (got ${vF.warpFuel.current})`);
assert(refuelWarp(vF, 100) === 7 && vF.warpFuel.current === 20, `refuelWarp clamp do max 20 (got ${vF.warpFuel.current})`);

// EDGE: brak silnika warp (consumption 0) → warpRange 0 (NIE Infinity), canJump false
const vNoEngine = { warpFuel: { current: 0, max: 0, consumption: 0, fuelType: 'warp_cores' } };
assert(warpRange(vNoEngine) === 0, `warpRange bez silnika === 0 (NIE Infinity) (got ${warpRange(vNoEngine)})`);
assert(canJump(vNoEngine, 1) === false, 'canJump bez silnika === false');
assert(needsWarpRefuel(vNoEngine) === false, 'needsWarpRefuel (max 0) === false');

// EDGE: brak baku warpFuel w ogóle → bez crasha
const vNoTank = {};
assert(warpRange(vNoTank) === 0, 'warpRange bez warpFuel === 0');
assert(canJump(vNoTank, 1) === false, 'canJump bez warpFuel === false');
assert(consumeWarpFuel(vNoTank, 5) === 0, 'consumeWarpFuel bez warpFuel === 0 (bez crasha)');
assert(refuelWarp(vNoTank, 5) === 0, 'refuelWarp bez warpFuel === 0 (bez crasha)');

// ════════════════════════════════════════════════════════════════════════
header('5) dispatchInterstellar — bramka skoku (fix B: distLY=0 + consumption=0)');
// ════════════════════════════════════════════════════════════════════════
// Regresja buga z live-gate TEST B: pusty bak + cel = WŁASNY układ (distLY=0) →
//   fuelCost=0 → owner-gate 0<0=false BY PRZEPUŚCIŁA → return true (skok donikąd).
//   Fix B: guard distLY<=0 ORAZ fuelPerLY<=0 PRZED bramką paliwa, dla WSZYSTKICH.
//   (Headless dotąd NIE dotykał dispatchInterstellar — stąd bug przeszedł do żywej gry.)
const vm = new VesselManager();
window.KOSMOS.galaxyData = { systems: [
  { id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0 },
  { id: 'sys_far',  name: 'Far', x: 5, y: 0, z: 0 },  // distLY = 5 od domu
  { id: 'sys_dup',  name: 'Dup', x: 0, y: 0, z: 0 },  // distLY = 0 (te same współrzędne co dom)
] };

// (A) pusty bak + realny dystans → false (istniejąca bramka paliwa, zachowanie sprzed fixu)
const vEmpty = createVessel('hull_medium', 'col_test', { modules: ['engine_warp', 'warp_tank'] });
vEmpty.position.state = 'docked';
vm._vessels.set(vEmpty.id, vEmpty);
assert(vEmpty.warpFuel.current === 0 && vEmpty.warpFuel.max === 5, 'setup: vEmpty bak warp pusty {0/5}');
assert(vm.dispatchInterstellar(vEmpty.id, 'sys_far') === false, 'pusty bak + distLY 5 → false (bramka paliwa)');
assert(vEmpty.mission === null, 'pusty bak: mission NIE ustawiona (statek nie wystartował)');

// (B) THE BUG: pusty bak + cel = własny układ (distLY=0) → przed fixem true, po fixie false
assert(vm.dispatchInterstellar(vEmpty.id, 'sys_dup')  === false, 'distLY=0 (sys_dup, te same współrzędne) → false (fix B distLY<=0)');
assert(vm.dispatchInterstellar(vEmpty.id, 'sys_home') === false, 'distLY=0 (skok do własnego sys_home) → false');
assert(vEmpty.mission === null, 'degenerat distLY=0: mission NIE ustawiona');

// (C) zepsuta konfiguracja warp: consumption=0 (mina nullish ??) + realny dystans + PEŁNY bak → false
const vBadCfg = createVessel('hull_medium', 'col_test', { modules: ['engine_warp', 'warp_tank'], warpFuelCurrent: 5 });
vBadCfg.position.state = 'docked';
vBadCfg.warpFuel.consumption = 0;          // symuluj zepsuty warpFuelPerLY (consumption 0)
vm._vessels.set(vBadCfg.id, vBadCfg);
assert(vm.dispatchInterstellar(vBadCfg.id, 'sys_far') === false, 'consumption=0 + pełny bak + distLY 5 → false (fix B fuelPerLY<=0)');
assert(vBadCfg.mission === null, 'consumption=0: mission NIE ustawiona');

// (D) kontrola pozytywna: pełny bak + realny dystans + poprawna konfiguracja → true (skok startuje)
const vFull = createVessel('hull_medium', 'col_test', { modules: ['engine_warp', 'warp_tank'], warpFuelCurrent: 5 });
vFull.position.state = 'docked';
vm._vessels.set(vFull.id, vFull);
assert(vm.dispatchInterstellar(vFull.id, 'sys_far') === true, 'pełny bak + distLY 5 + poprawna konfiguracja → true (skok startuje)');
assert(vFull.mission?.type === 'interstellar_jump', 'pełny bak: mission interstellar_jump ustawiona');
assert(approx(vFull.warpFuel.current, 2.5), `pełny bak: warpFuel zużyte 5→2.5 (5LY×0.5) (got ${vFull.warpFuel.current})`);

console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
