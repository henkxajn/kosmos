// S3.0b S1b — smoke kontraktu czytników warp + ożywienia canJump() w dispatchInterstellar.
//
// S1b podmienił martwe selDef.fuelPerLY w UI na realne helpery (canJump/warpRange) oraz
// ożywił canJump() jako twardą bramkę paliwa GRACZA w dispatchInterstellar. Ten smoke
// dowodzi, że:
//   1) Kontrakt helperów (na którym opierają się czytniki UI): warpRange/canJump dla
//      pełny/pusty/bez-baku/bez-silnika — w tym GOTCHA canJump(distLY<=0)===true
//      (dlatego dispatchInterstellar MUSI mieć osobny guard distLY<=0 — fix B).
//   2) Owner-gate dispatchInterstellar PRZETRWAŁ refaktor canJump (krytyczne — chain smoke
//      testuje tylko ścieżkę GRACZA, NIE AI/force):
//        - gracz pusty bak + dist>0 → false (canJump aplikowane)
//        - AI (isEnemy) pusty bak + dist>0 → TRUE (skacze "na oparach"; canJump POMIJANE)
//        - opts.force pusty bak + dist>0 → TRUE (force omija)
//        - distLY<=0 → false dla GRACZA, AI ORAZ force (fix B uniwersalny, przed owner-gate)
//        - brak Komory Warp (max=0) → false dla wszystkich (guard strukturalny)

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

const { createVessel, warpRange, canJump, isEnemyVessel } = await import('./src/entities/Vessel.js');
const { VesselManager } = await import('./src/systems/VesselManager.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) < eps; }
function header(title) { console.log('\n--- ' + title + ' ---'); }

// ════════════════════════════════════════════════════════════════════════
header('1) Kontrakt helperów warp (baza czytników UI)');
// ════════════════════════════════════════════════════════════════════════
const vFullTank  = { warpFuel: { current: 5, max: 5, consumption: 0.5, fuelType: 'warp_cores' } };
const vEmptyTank = { warpFuel: { current: 0, max: 5, consumption: 0.5, fuelType: 'warp_cores' } };
const vNoTank    = {};
const vNoEngine  = { warpFuel: { current: 0, max: 0, consumption: 0, fuelType: 'warp_cores' } };

// warpRange — używane przez czytniki "zasięg LY" (FMO 4741/4879)
assert(warpRange(vFullTank) === 10, `warpRange pełny 5/0.5 === 10 (got ${warpRange(vFullTank)})`);
assert(warpRange(vEmptyTank) === 0, `warpRange pusty === 0 (got ${warpRange(vEmptyTank)})`);
assert(warpRange(vNoTank) === 0, 'warpRange bez baku === 0 (czytnik pokaże "?")');
assert(warpRange(vNoEngine) === 0, 'warpRange bez silnika === 0 (NIE Infinity)');

// canJump — używane przez czytniki feasibility (FMO 4754, ShipPicker 65)
assert(canJump(vFullTank, 5) === true, 'canJump pełny, 5 LY (range 10) === true');
assert(canJump(vFullTank, 12) === false, 'canJump pełny, 12 LY (range 10) === false');
assert(canJump(vEmptyTank, 1) === false, 'canJump pusty, 1 LY === false');
assert(canJump(vNoTank, 1) === false, 'canJump bez baku === false');
assert(canJump(vNoEngine, 1) === false, 'canJump bez silnika === false');

// GOTCHA: canJump(distLY<=0) === true (range>=0). Dlatego dispatchInterstellar MUSI mieć
// osobny guard distLY<=0 (fix B) — canJump SAM tego nie złapie.
assert(canJump(vEmptyTank, 0) === true, 'GOTCHA: canJump(pusty, 0 LY) === true (range 0 >= 0) → guard distLY<=0 osobno');
assert(canJump(vFullTank, -1) === true, 'GOTCHA: canJump(distLY ujemny) === true → guard osobno');

// ════════════════════════════════════════════════════════════════════════
header('2) dispatchInterstellar owner-gate przetrwał refaktor canJump');
// ════════════════════════════════════════════════════════════════════════
const vm = new VesselManager();
window.KOSMOS.galaxyData = { systems: [
  { id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0 },
  { id: 'sys_far',  name: 'Far', x: 5, y: 0, z: 0 },  // distLY = 5
  { id: 'sys_dup',  name: 'Dup', x: 0, y: 0, z: 0 },  // distLY = 0
] };

// Helper: świeży warp-statek docked (każdy test = nowy statek, bo udany skok zmienia state)
function freshWarp(opts = {}) {
  const v = createVessel('hull_medium', 'col_test', { modules: ['engine_warp', 'warp_tank'], ...opts });
  v.position.state = 'docked';
  vm._vessels.set(v.id, v);
  return v;
}
function freshPlain() {
  const v = createVessel('hull_small', 'col_test', { modules: ['engine_chemical'] });
  v.position.state = 'docked';
  vm._vessels.set(v.id, v);
  return v;
}

// (A) GRACZ — pusty bak + dist 5 → false (canJump aplikowane do gracza)
const pEmpty = freshWarp();
assert(pEmpty.warpFuel.current === 0 && pEmpty.warpFuel.max === 5, 'setup: gracz pusty bak {0/5}');
assert(!isEnemyVessel(pEmpty), 'setup: pEmpty NIE jest enemy (gracz)');
assert(vm.dispatchInterstellar(pEmpty.id, 'sys_far') === false, 'GRACZ pusty + dist 5 → false (canJump bramka)');
assert(pEmpty.mission === null, 'GRACZ pusty: mission NIE ustawiona');

// (B) AI (isEnemy) — pusty bak + dist 5 → TRUE (skacze na oparach; canJump POMIJANE)
const aiEmpty = freshWarp();
aiEmpty.isEnemy = true;
assert(isEnemyVessel(aiEmpty) === true, 'setup: aiEmpty jest enemy');
assert(vm.dispatchInterstellar(aiEmpty.id, 'sys_far') === true, 'AI pusty + dist 5 → TRUE (na oparach, owner-gate pomija canJump)');
assert(aiEmpty.mission?.type === 'interstellar_jump', 'AI pusty: mission interstellar_jump ustawiona');
assert(aiEmpty.warpFuel.current === 0, `AI pusty: warpFuel clamp do 0 (got ${aiEmpty.warpFuel.current})`);

// (C) opts.force — pusty bak + dist 5 → TRUE (force omija owner-gate)
const fEmpty = freshWarp();
assert(vm.dispatchInterstellar(fEmpty.id, 'sys_far', { force: true }) === true, 'force pusty + dist 5 → TRUE (omija)');
assert(fEmpty.mission?.type === 'interstellar_jump', 'force pusty: mission ustawiona');

// (D) distLY<=0 → false dla GRACZA, AI ORAZ force (fix B uniwersalny, PRZED owner-gate)
const pDup = freshWarp({ warpFuelCurrent: 5 });   // pełny bak — żeby udowodnić że to guard distLY, nie paliwo
const aiDup = freshWarp({ warpFuelCurrent: 5 }); aiDup.isEnemy = true;
const fDup = freshWarp({ warpFuelCurrent: 5 });
assert(vm.dispatchInterstellar(pDup.id,  'sys_dup') === false, 'distLY=0 GRACZ (pełny bak) → false (fix B)');
assert(vm.dispatchInterstellar(aiDup.id, 'sys_dup') === false, 'distLY=0 AI → false (fix B uniwersalny, AI też)');
assert(vm.dispatchInterstellar(fDup.id,  'sys_dup', { force: true }) === false, 'distLY=0 force → false (fix B uniwersalny, force też)');
assert(pDup.mission === null && aiDup.mission === null && fDup.mission === null, 'distLY=0: żadna mission nie ustawiona');

// (E) brak Komory Warp (warpFuel.max=0) → false dla GRACZA i AI (guard strukturalny dla wszystkich)
const pNoTank = freshPlain();
const aiNoTank = freshPlain(); aiNoTank.isEnemy = true;
assert(pNoTank.warpFuel.max === 0, 'setup: pNoTank bez Komory Warp (max 0)');
assert(vm.dispatchInterstellar(pNoTank.id,  'sys_far') === false, 'brak Komory Warp GRACZ → false (strukturalny)');
assert(vm.dispatchInterstellar(aiNoTank.id, 'sys_far', { force: true }) === false, 'brak Komory Warp AI+force → false (nawet force nie zrobi baku)');

// (F) kontrola pozytywna: gracz PEŁNY bak + dist 5 → true + zużycie 5→2.5
const pFull = freshWarp({ warpFuelCurrent: 5 });
assert(vm.dispatchInterstellar(pFull.id, 'sys_far') === true, 'GRACZ pełny + dist 5 → true (canJump przepuszcza)');
assert(approx(pFull.warpFuel.current, 2.5), `GRACZ pełny: warpFuel 5→2.5 (5LY×0.5) (got ${pFull.warpFuel.current})`);

console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
