// A4 — outpost z dostawy cargo bramkowany na body.explored — smoke (offline).
//
// A3 udostępnił niezasiedlone ciała jako cele transportu cargo → delivery wchodzi w gałąź
// null-store same-system w MissionSystem._processTransportArrival i tworzyła outpost BEZ żadnej
// bramki (w przeciwieństwie do found_outpost/colonize, które wymagają body.explored). A4:
// outpost z dostawy TYLKO na ciele zbadanym; niezbadane → ta sama ścieżka co cross-system
// (statek orbituje z cargo NA POKŁADZIE, misja kończy się bez błędu, bez outpostu, bez utraty ładunku).
//
// Pokrycie:
//   T1  EXPLORED + same-system + cargo → createOutpost WYWOŁANY (z cargo); status completed; cargo statku wyczyszczony
//   T2  UNEXPLORED + same-system + cargo → createOutpost NIE wywołany; status orbiting; arriveAtTarget; cargo NA POKŁADZIE
//   T3  CROSS-system + układ ZNANY + cargo → outpost (ODWRÓCONE w (e); patrz nota przy teście)
//   T4  UNEXPLORED + same-system + BEZ cargo → orbit (brak outpostu; no-cargo path nietknięty dla zbadanych)
//   T5  analyzed⇒explored: explored=true (analyzed implikuje explored) → outpost (parytet found_outpost)

globalThis.window = globalThis;
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
globalThis.document = { createElement:()=>({style:{},appendChild(){},addEventListener(){}}), getElementById:()=>null };

const { MissionSystem } = await import('../../systems/MissionSystem.js');
// (e) — helper zakładania placówki jest WSPÓLNY, więc stub pożycza PRAWDZIWĄ metodę:
// inaczej ten keeper mierzyłby własną atrapę zamiast kodu gry.
const { VesselManager } = await import('../../systems/VesselManager.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// Uruchom _processTransportArrival z zamockowanym otoczeniem. Zwraca telemetrię.
function runArrival({ explored, sameSystem, cargo }) {
  const createOutpostCalls = [];
  const arriveCalls = [];
  const targetBody = { id: 'body_target', type: 'moon', explored, systemId: sameSystem ? 'sys_home' : 'sys_other', x: 5, y: 5 };
  // (e) — `missionLog` jest wymagany przez wspólny helper (addMissionLog); prawdziwe statki
  // zawsze je mają, ten stub był po prostu minimalny.
  const vessel = { cargo: { ...(cargo ?? {}) }, cargoUsed: cargo ? 10 : 0, colonyId: null, stats: null, missionLog: [], name: 'stub' };

  globalThis.window.KOSMOS = {
    colonyManager: {
      // targetId uncolonised → null (wchodzi w gałąź null-store); origin ma systemId sys_home
      getColony: (id) => (id === 'origin_col' ? { systemId: 'sys_home', resourceSystem: {}, fleet: [] } : null),
      createOutpost: (id, res, year) => { createOutpostCalls.push({ id, res: { ...res }, year }); return { fleet: [] }; },
    },
    vesselManager: {
      getVessel: () => vessel,
      arriveAtTarget: (...a) => arriveCalls.push(a),
      dockAtColony: () => {},
      _findEntity: () => targetBody,
      foundOutpostFromCargo: VesselManager.prototype.foundOutpostFromCargo,
    },
    timeSystem: { gameTime: 10 },
    // (e) — reguła mgły: placówka tylko na ciele z układu, który gra ZNA.
    starSystemManager: { getSystem: (id) => (id === 'sys_home' || id === 'sys_other' ? { systemId: id } : null) },
  };

  const inst = Object.create(MissionSystem.prototype);
  inst._gameYear = 10;
  inst._findTarget = () => targetBody;   // stub — omija EntityManager (zwraca żywe ciało z .explored)
  inst._emit = () => {};                  // stub — bez EventBus
  inst._missions = [];

  const exp = { targetId: 'body_target', vesselId: 'v1', cargo: null, originColonyId: 'origin_col' };
  inst._processTransportArrival(exp);

  return { createOutpostCalls, arriveCalls, expStatus: exp.status, vesselCargo: vessel.cargo };
}

// ── T1 — EXPLORED same-system + cargo → outpost ───────────────────────────────
header('T1: explored + same-system + cargo → outpost');
{
  const r = runArrival({ explored: true, sameSystem: true, cargo: { minerals: 10 } });
  assert(r.createOutpostCalls.length === 1, 'createOutpost wywołany raz');
  assert(r.createOutpostCalls[0]?.res?.minerals === 10, 'outpost dostał cargo (minerals:10)');
  assert(r.expStatus === 'completed', 'status = completed');
  assert(Object.keys(r.vesselCargo).length === 0, 'cargo statku wyczyszczone (dostarczone)');
}

// ── T2 — UNEXPLORED same-system + cargo → orbit, cargo intact ──────────────────
header('T2: UNEXPLORED + same-system + cargo → orbit, cargo NA POKŁADZIE');
{
  const r = runArrival({ explored: false, sameSystem: true, cargo: { minerals: 10 } });
  assert(r.createOutpostCalls.length === 0, 'createOutpost NIE wywołany (bramka explored)');
  assert(r.expStatus === 'orbiting', 'status = orbiting');
  assert(r.arriveCalls.length === 1, 'arriveAtTarget wywołany (statek orbituje cel)');
  assert(r.vesselCargo?.minerals === 10, 'cargo NA POKŁADZIE (nie utracone)');
}

// ── T3 — EXPLORED cross-system → orbit (bez zmian) ────────────────────────────
header('T3: CROSS-system + układ ZNANY → outpost (ODWRÓCONE w (e))');
// ⚠ ODWRÓCONE ŚWIADOMIE, Finding 254 (e). Pin mierzył gałąź, którą A4 celowo zamykała:
//   „obcy układ ⇒ statek orbituje, placówka nie powstaje". Po d1 gracz może wysłać transport na
//   obce ciało, a przycisk „Rozładuj cargo" zakłada tam placówkę OD ZAWSZE — więc dwie ścieżki na
//   TYM SAMYM ciele dawały różny wynik. Obca strona schodzi teraz do reguły MGŁY (układ znany),
//   nie do `explored`: statek tam BYŁ. Zbieżność obu ścieżek pinuje
//   `outpost_founding_convergence_smoke` (e-1); tutaj zostaje strażnik samej gałęzi.
{
  const r = runArrival({ explored: true, sameSystem: false, cargo: { minerals: 10 } });
  assert(r.createOutpostCalls.length === 1, 'createOutpost WYWOŁANY (obcy, ale ZNANY układ)');
  assert(r.expStatus === 'completed', 'status = completed');
  assert(Object.keys(r.vesselCargo).length === 0, 'cargo dostarczone (ładownia pusta)');
}

// ── T4 — UNEXPLORED + no cargo → orbit ────────────────────────────────────────
header('T4: UNEXPLORED + brak cargo → orbit, brak outpostu');
{
  const r = runArrival({ explored: false, sameSystem: true, cargo: null });
  assert(r.createOutpostCalls.length === 0, 'brak outpostu');
  assert(r.expStatus === 'orbiting', 'status = orbiting');
}

// ── T5 — analyzed⇒explored (explored=true) → outpost ──────────────────────────
header('T5: analyzed implikuje explored → outpost (parytet found_outpost)');
{
  // analyzed ⇒ explored (invariant). Ciało analyzed ma explored=true → przechodzi bramkę.
  const r = runArrival({ explored: true, sameSystem: true, cargo: { water: 5 } });
  assert(r.createOutpostCalls.length === 1, 'analyzed/explored ciało → outpost');
}

console.log(`\nWYNIK: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
