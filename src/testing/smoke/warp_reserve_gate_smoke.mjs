// Keeper: Finding 588 (D-GX-12) — kadłub w rezerwie W2 nie skacze.
// Uruchom: node src/testing/smoke/warp_reserve_gate_smoke.mjs
//
// Zmiana reguły gry, więc z fail-first (zmierzony w worktree na 7c49020: czerwone T1 / T2 / T3 + T6 — „naprawa”; T4 / T5 zielone
// po obu stronach — kontrole). Prawdziwe `VesselManager.dispatchInterstellar` i `WarpRouteSystem.canOrder` / `beginJourney`.
//
// T1  canOrder — stored / mobilizing odmawiają `vessel_in_reserve`; active i brak pola (stary zapis) przechodzą
// T2  beginJourney — odmowa nic nie rusza (paliwo, stan, misja, trasa, układ); kontrola: kadłub w służbie startuje
// T3  dispatchInterstellar (gałąź gracza) — ten sam termin dla wejść omijających planer; `force` omija paliwo, nie załogę
// T4  KONTROLA: gałąź AI nietknięta — kadłub imperium `stored` / `active` skacze jak dotąd; canOrder dalej `not_player`
// T5  (wycofany w G5-B — flaga `galaxyWarp` zdjęta, termin rezerwy bezwarunkowy)
// T6  powód dociera przez fasadę: `OrderService.issueWarp` → `vessel_in_reserve`
//
// ⚠ PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — flaga `galaxyWarp` na stałe ON, ścieżka OFF usunięta): T5 wycofany w całości (rezerwa
//   skacze przy OFF, dyspozytor przyjmuje `mobilizing` przy OFF, brak klucza = OFF) — terminu za flagą już nie ma. Żywość fixture'u
//   skoku pinują dalej kontrole T2 („active startuje”) i T3 („active → dyspozytor przyjmuje”). Ustawianie flagi w setupie i import
//   `GAME_CONFIG` (służył tylko jej przestawianiu) usunięte.

globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};
globalThis.document = globalThis.document ?? { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) };

const { WarpRouteSystem } = await import('../../systems/WarpRouteSystem.js');
const { VesselManager } = await import('../../systems/VesselManager.js');
const { OrderService } = await import('../../systems/OrderService.js');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label); } };
const header = (s) => console.log('\n' + s);

const SYS = [
  { id: 'sys_home', name: 'Dom',   x: 0,  y: 0, z: 0, explored: true },
  { id: 'B',        name: 'Beta',  x: 5,  y: 0, z: 0, explored: true },
];
const K = window.KOSMOS;
K.galaxyData = { systems: SYS };
K.timeSystem = { gameTime: 0 };
K.eventLogSystem = { push() {} };

// Prawdziwa metoda dyspozytora na minimalnej instancji (bez konstruktora i jego subskrypcji).
const vm = Object.create(VesselManager.prototype);
vm._vessels = new Map();
K.vesselManager = vm;
const wrs = new WarpRouteSystem(vm);
K.warpRouteSystem = wrs;

let seq = 0;
function mk(over = {}) {
  const id = `v_${++seq}`;
  const v = {
    id, name: id, shipId: 'hull_frigate', isWreck: false,
    systemId: 'sys_home', status: 'idle',
    position: { x: 0, y: 0, state: 'docked', dockedAt: 'home_planet' },
    modules: ['engine_warp', 'warp_tank'],
    warpFuel: { current: 10, max: 10, consumption: 0.5, fuelType: 'warp_cores' },
    unpaidYears: 0, mission: null, warpRoute: null, missionLog: [],
    ...over,
  };
  vm._vessels.set(id, v);
  return v;
}
const snap = (v) => JSON.stringify({ f: v.warpFuel.current, st: v.position.state, d: v.position.dockedAt, m: v.mission, r: v.warpRoute, s: v.systemId, status: v.status });

header('T1 canOrder — termin służby');
{
  const stored = wrs.canOrder(mk({ serviceState: 'stored' }));
  ok(stored.ok === false && stored.reason === 'vessel_in_reserve', 'stored → odmowa vessel_in_reserve');
  const mobA = wrs.canOrder(mk({ serviceState: 'mobilizing', mobilizeTarget: 'active' }));
  ok(mobA.ok === false && mobA.reason === 'vessel_in_reserve', 'mobilizing (do służby) → odmowa: mobilizacja nie jest służbą');
  const mobS = wrs.canOrder(mk({ serviceState: 'mobilizing', mobilizeTarget: 'stored' }));
  ok(mobS.ok === false && mobS.reason === 'vessel_in_reserve', 'mobilizing (wycofanie) → odmowa');
  ok(wrs.canOrder(mk({ serviceState: 'active' })).ok === true, 'KONTROLA: active → przechodzi');
  ok(wrs.canOrder(mk({})).ok === true, 'KONTROLA: brak pola (stary zapis, spawn spoza stoczni) = służba → przechodzi');
  const noWarp = wrs.canOrder(mk({ serviceState: 'stored', warpFuel: { current: 0, max: 0, consumption: 0 } }));
  ok(noWarp.reason === 'not_warp_capable', 'KONTROLA kolejności: stored bez napędu → not_warp_capable (powód nadrzędny)');
  const immob = wrs.canOrder(mk({ serviceState: 'stored', unpaidYears: 9 }));
  ok(immob.reason === 'vessel_in_reserve', 'stored + zaległe utrzymanie → vessel_in_reserve (najpierw załoga)');
}

header('T2 beginJourney — odmowa niczego nie rusza');
{
  for (const serviceState of ['stored', 'mobilizing']) {
    const v = mk({ serviceState });
    const before = snap(v);
    const res = wrs.beginJourney(v.id, 'B');
    ok(res.ok === false && res.reason === 'vessel_in_reserve', `${serviceState}: beginJourney → vessel_in_reserve`);
    ok(snap(v) === before, `${serviceState}: paliwo, stan, misja, trasa i układ nietknięte`);
  }
  const live = mk({ serviceState: 'active' });
  const res = wrs.beginJourney(live.id, 'B');
  ok(res.ok === true && live.position.state === 'in_transit' && live.warpFuel.current < 10,
    'KONTROLA: active startuje (in_transit, paliwo pobrane) — fixture skoku jest żywy');
}

header('T3 dispatchInterstellar — gałąź gracza');
{
  for (const serviceState of ['stored', 'mobilizing']) {
    const v = mk({ serviceState });
    const before = snap(v);
    ok(vm.dispatchInterstellar(v.id, 'B') === false, `${serviceState}: dyspozytor odmawia`);
    ok(snap(v) === before, `${serviceState}: nic nie zapisane`);
  }
  const forced = mk({ serviceState: 'stored' });
  ok(vm.dispatchInterstellar(forced.id, 'B', { force: true }) === false, 'stored + force: force omija paliwo, nie załogę');
  ok(vm.dispatchInterstellar(mk({ serviceState: 'active' }).id, 'B') === true, 'KONTROLA: active → dyspozytor przyjmuje');
}

header('T4 KONTROLA — gałąź AI nietknięta');
{
  const ai = (serviceState) => mk({ serviceState, ownerEmpireId: 'emp_001' });
  const aiStored = ai('stored');
  ok(vm.dispatchInterstellar(aiStored.id, 'B') === true && aiStored.position.state === 'in_transit',
    'kadłub imperium stored → dyspozytor przyjmuje (AI bez modelu rezerwy na tej ścieżce)');
  ok(vm.dispatchInterstellar(ai('active').id, 'B') === true, 'kadłub imperium active → przyjmuje');
  ok(wrs.canOrder(ai('stored')).reason === 'not_player', 'canOrder dla statku AI dalej not_player');
}

// T5 — wycofany w G5-B (flaga `galaxyWarp` zdjęta; zob. nagłówek).

header('T6 powód przez fasadę OrderService');
{
  const os = new OrderService();
  K.orderService = os;
  const v = mk({ serviceState: 'stored' });
  const res = os.issueWarp(v.id, 'B');
  ok(res?.ok === false && res?.reason === 'vessel_in_reserve', 'issueWarp → { ok:false, reason:vessel_in_reserve }');
  const live = mk({ serviceState: 'active' });
  ok(os.issueWarp(live.id, 'B')?.ok === true, 'KONTROLA: issueWarp kadłuba w służbie przechodzi');
  os.destroy?.();
}

console.log(`\nwarp_reserve_gate: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
