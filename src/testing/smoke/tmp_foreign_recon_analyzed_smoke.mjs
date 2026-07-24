// Fix: skan statkiem naukowym w OBCYM układzie (foreign_recon) ustawia `analyzed`.
//
// Bug: VesselManager._tickForeignRecon ustawiał tylko `explored`, nigdy `analyzed`
// → ciała w obcych układach utykały na „skan zgrubny" mimo skanu statkiem naukowym
// (bliźniacza ścieżka pominięta względem recon macierzystego, dług mission-vs-expedition-parallel).
//
// Pokrycie:
//   T1  scope='target'      → target.explored=true I target.analyzed=true (planetoida)
//   T2  scope='full_system' → body.explored=true I body.analyzed=true (planetoida)
//   T3  _startForeignRecon full_system: filtr `!b.analyzed` — ciało zgrubne (explored,!analyzed)
//       WCHODZI do celów (upgrade), ciało pełne (analyzed) POMINIĘTE, niezbadane WCHODZI
//   T4  księżyc „przy okazji" zostaje zgrubny (explored-only) — parytet z recon macierzystym
//   T5  inwariant analyzed ⇒ explored (analyzed nie ustawiane bez explored)

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);},
  removeItem(k){delete this._store[k];}, key(i){return Object.keys(this._store)[i]??null;},
  get length(){return Object.keys(this._store).length;},
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {}, timeSystem: { gameTime: 100 } };
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const { VesselManager } = await import('../../systems/VesselManager.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// Bare instancja (bez konstruktora → bez subskrypcji EventBus).
function bareVM() {
  const vm = Object.create(VesselManager.prototype);
  vm._vessels = new Map();
  // stub czułości tech/hull (unikamy zależności window.KOSMOS.techSystem/ShipsData w _startForeignRecon)
  vm._techForVessel = () => ({ getShipSpeedMultiplier: () => 1 });
  return vm;
}
function mkVessel(over = {}) {
  return {
    id: 'v_1', shipId: 'hull_small', name: 'Nauka', systemId: 'sys_beta',
    speedAU: 2,
    position: { state: 'orbiting', x: 100, y: 0, dockedAt: null },
    fuel: { current: 10, max: 10, consumption: 0.5 },
    mission: null, status: 'on_mission', modules: [], cargo: {}, missionLog: [],
    ...over,
  };
}
function mkBody(id, over = {}) {
  return { id, type: 'planetoid', systemId: 'sys_beta', name: id, x: 0, y: 0,
    explored: false, analyzed: false, ...over };
}

// ── T1 — scope='target' ustawia analyzed ─────────────────────────────────────
header('T1 foreign_recon scope=target → analyzed');
EntityManager.clear();
const p1 = mkBody('pl_beta_1', { explored: true, analyzed: false }); // wcześniej zgrubny (teleskop)
EntityManager.add(p1);
const vm1 = bareVM();
const v1 = mkVessel();
vm1._vessels.set(v1.id, v1);
v1.mission = { type: 'foreign_recon', scope: 'target', targetId: 'pl_beta_1', systemId: 'sys_beta', completeYear: 50 };
vm1._tickForeignRecon(v1, v1.mission, 100); // gameYear 100 >= completeYear 50
assert(p1.explored === true, 'planetoida: explored=true');
assert(p1.analyzed === true, 'planetoida: analyzed=true (PRZED fixem było false → „skan zgrubny")');

// ── T2 — scope='full_system' ustawia analyzed ────────────────────────────────
header('T2 foreign_recon scope=full_system → analyzed');
EntityManager.clear();
const p2 = mkBody('pl_beta_2', { explored: false, analyzed: false });
EntityManager.add(p2);
const vm2 = bareVM();
const v2 = mkVessel();
vm2._vessels.set(v2.id, v2);
v2.mission = { type: 'foreign_recon', scope: 'full_system', systemId: 'sys_beta',
  targets: ['pl_beta_2'], currentIdx: 0, phase: 'scanning', scanCompleteYear: 50 };
vm2._tickForeignRecon(v2, v2.mission, 100);
assert(p2.explored === true, 'planetoida: explored=true');
assert(p2.analyzed === true, 'planetoida: analyzed=true');

// ── T3 — _startForeignRecon full_system: filtr !analyzed ──────────────────────
header('T3 _startForeignRecon full_system filtr !analyzed');
EntityManager.clear();
const rough   = mkBody('pl_rough',   { explored: true,  analyzed: false, x: 50,  y: 0 }); // zgrubny → upgrade
const full    = mkBody('pl_full',    { explored: true,  analyzed: true,  x: 60,  y: 0 }); // pełny → pomiń
const unknown = mkBody('pl_unknown', { explored: false, analyzed: false, x: 70,  y: 0 }); // niezbadany → wejdź
EntityManager.add(rough); EntityManager.add(full); EntityManager.add(unknown);
const vm3 = bareVM();
const v3 = mkVessel({ position: { state: 'orbiting', x: 0, y: 0, dockedAt: null } });
vm3._vessels.set(v3.id, v3);
vm3._startForeignRecon(v3.id, null, 'full_system');
const targets = v3.mission?.targets ?? [];
assert(targets.includes('pl_rough'),    'zgrubny (explored,!analyzed) WCHODZI do celów (upgrade rough→detailed)');
assert(!targets.includes('pl_full'),    'pełny (analyzed) POMINIĘTY');
assert(targets.includes('pl_unknown'),  'niezbadany WCHODZI');

// ── T4 — księżyc zostaje zgrubny (parytet) ───────────────────────────────────
header('T4 księżyc „przy okazji" = explored-only');
EntityManager.clear();
const planet = mkBody('pl_planet', { type: 'planet', explored: false, analyzed: false });
const moon   = mkBody('mn_1', { type: 'moon', parentPlanetId: 'pl_planet', explored: false, analyzed: false });
EntityManager.add(planet); EntityManager.add(moon);
const vm4 = bareVM();
const v4 = mkVessel();
vm4._vessels.set(v4.id, v4);
v4.mission = { type: 'foreign_recon', scope: 'target', targetId: 'pl_planet', systemId: 'sys_beta', completeYear: 50 };
vm4._tickForeignRecon(v4, v4.mission, 100);
assert(planet.analyzed === true, 'cel planety: analyzed=true (pełna analiza)');
assert(moon.explored === true,   'księżyc: explored=true (odkryty)');
assert(moon.analyzed !== true,   'księżyc: analyzed NIE ustawione (zgrubny — parytet z recon macierzystym)');

// ── T5 — inwariant analyzed ⇒ explored ────────────────────────────────────────
header('T5 inwariant analyzed ⇒ explored');
assert(!(p1.analyzed && !p1.explored), 'T1: brak analyzed bez explored');
assert(!(p2.analyzed && !p2.explored), 'T2: brak analyzed bez explored');
assert(!(planet.analyzed && !planet.explored), 'T4: brak analyzed bez explored');

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
