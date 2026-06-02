// S3.0a Commit (e) — smoke test (offline). Pętla transportowa best-effort.
//
// Pokrycie:
//   T1  CURRENT_VERSION === 81                                            (1 case)
//   T2  Migracja v80→v81 — outboundCargoSpec recovery + trackery          (9 cases)
//   T3  _bestEffortLoad — clamp = loadCargo (sekwencyjny, wg kolejności)   (8 cases)
//   T4  _evaluateLoopProductivity — alert 0+0, throttle, reset            (6 cases)
//   T5  _tryResumeLoop — reload gdy cargo puste, skip gdy niepuste         (7 cases)

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
const { MissionSystem } = await import('./src/systems/MissionSystem.js');
const { COMMODITIES } = await import('./src/data/CommoditiesData.js');
const EventBusMod = await import('./src/core/EventBus.js');
const EventBus = EventBusMod.default ?? EventBusMod.EventBus ?? EventBusMod;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// Stub ResourceSystem (inventory Map + spend dekrementujący)
function makeResSys(inv) {
  const m = new Map(Object.entries(inv));
  return {
    inventory: m,
    spend(obj) { for (const [k, v] of Object.entries(obj)) m.set(k, (m.get(k) ?? 0) - v); },
    receive(obj) { for (const [k, v] of Object.entries(obj)) m.set(k, (m.get(k) ?? 0) + v); },
  };
}
function makeVessel(over = {}) {
  return { id: 'v1', name: 'Tankowiec', shipId: undefined, cargoMax: 100, cargoUsed: 0, cargo: {},
           position: { state: 'docked' }, fuel: { current: 100, consumption: 0.1 }, ...over };
}

// ── T1 — CURRENT_VERSION ─────────────────────────────────────────────────
header('T1: CURRENT_VERSION === 81');
assert(CURRENT_VERSION === 81, `CURRENT_VERSION === 81 (got ${CURRENT_VERSION})`);

// ── T2 — Migracja v80→v81 ────────────────────────────────────────────────
header('T2: Migracja v80→v81 outboundCargoSpec + trackery');
{
  const oldSave = {
    version: 80,
    civ4x: {
      missions: {
        missions: [
          { id: 'A', loop: true,  leg: 'outbound',       cargo: { fuel: 25 } },           // odzysk → {fuel:25}
          { id: 'B', loop: true,  leg: 'waiting_reload',  cargo: null },                   // nieodzysk → {}
          { id: 'C', loop: true,  leg: 'return',          cargo: { fuel: 10 } },           // nie outbound → {}
          { id: 'D', loop: false, leg: null,              cargo: { Fe: 5 } },              // nie-pętla → skip
          { id: 'E', loop: true,  leg: 'outbound',        cargo: { fuel: 9 }, outboundCargoSpec: { fuel: 99 } }, // idempotent
        ],
      },
      colonies: [],
    },
  };
  const m = migrate(oldSave);
  assert(m.version === 81, `migrated.version === 81 (got ${m.version})`);
  const byId = {};
  for (const x of m.civ4x.missions.missions) byId[x.id] = x;
  assert(JSON.stringify(byId.A.outboundCargoSpec) === '{"fuel":25}', `A: odzysk z cargo mid-outbound → {fuel:25} (got ${JSON.stringify(byId.A.outboundCargoSpec)})`);
  assert(byId.A._lastOutLoaded === 25, `A: _lastOutLoaded === 25 (got ${byId.A._lastOutLoaded})`);
  assert(JSON.stringify(byId.B.outboundCargoSpec) === '{}', `B: waiting_reload nieodzysk → {} (got ${JSON.stringify(byId.B.outboundCargoSpec)})`);
  assert(JSON.stringify(byId.C.outboundCargoSpec) === '{}', `C: return leg nieodzysk → {} (got ${JSON.stringify(byId.C.outboundCargoSpec)})`);
  assert(byId.D.outboundCargoSpec === undefined, 'D: nie-pętla pominięta (brak outboundCargoSpec)');
  assert(JSON.stringify(byId.E.outboundCargoSpec) === '{"fuel":99}', `E: idempotent (zachowany {fuel:99}) (got ${JSON.stringify(byId.E.outboundCargoSpec)})`);
  assert(byId.B._lastOutLoaded === 0 && byId.B._lastRetLoaded === 0, 'B: trackery 0');
  assert(byId.A._unproductiveNotified === false, 'A: _unproductiveNotified === false');
  // Wariant ze ścieżką expeditions
  const old2 = { version: 80, civ4x: { expeditions: { expeditions: [ { id: 'X', loop: true, leg: 'outbound', cargo: { fuel: 3 } } ] } } };
  const m2 = migrate(old2);
  assert(JSON.stringify(m2.civ4x.expeditions.expeditions[0].outboundCargoSpec) === '{"fuel":3}', 'ścieżka c4x.expeditions.expeditions też migrowana');
}

// ── T3 — _bestEffortLoad ─────────────────────────────────────────────────
header('T3: _bestEffortLoad (clamp = loadCargo)');
{
  const ms = new MissionSystem();
  const wFuel = COMMODITIES.fuel.weight; // 1.5

  // Case 1: spec {fuel:50}, dostępne 30 → ładuje 30
  {
    const v = makeVessel();
    const col = { resourceSystem: makeResSys({ fuel: 30 }) };
    const { total } = ms._bestEffortLoad(v, col, { fuel: 50 });
    assert(total === 30, `dostępne<spec → ładuje 30 (got ${total})`);
    assert(v.cargo.fuel === 30, `vessel.cargo.fuel === 30 (got ${v.cargo.fuel})`);
    assert(col.resourceSystem.inventory.get('fuel') === 0, `inventory zdekrementowane do 0 (got ${col.resourceSystem.inventory.get('fuel')})`);
  }

  // Case 2: brak towaru → ładuje 0, nie rzuca
  {
    const v = makeVessel();
    const col = { resourceSystem: makeResSys({ fuel: 0 }) };
    const { total } = ms._bestEffortLoad(v, col, { fuel: 50 });
    assert(total === 0, `brak towaru → 0 (got ${total})`);
    assert(Object.keys(v.cargo).length === 0, 'cargo puste (nic nie załadowano)');
  }

  // Case 3: clamp ładowności (cargoMax) — pojedynczy towar
  {
    const v = makeVessel({ cargoMax: 15 });
    const col = { resourceSystem: makeResSys({ fuel: 100 }) };
    const expected = Math.floor(15 / wFuel); // 10
    const { total } = ms._bestEffortLoad(v, col, { fuel: 100 });
    assert(total === expected, `clamp cargoMax: floor(15/${wFuel})=${expected} (got ${total})`);
  }

  // Case 4: sekwencyjny clamp wielotowarowy — pierwszy klucz priorytet, drugi resztę
  {
    const secondId = Object.keys(COMMODITIES).find(k => k !== 'fuel' && (COMMODITIES[k].weight ?? 1) > 0) ?? 'structural_alloys';
    const wX = COMMODITIES[secondId].weight ?? 1;
    const cargoMax = 30;
    const v = makeVessel({ cargoMax });
    const col = { resourceSystem: makeResSys({ fuel: 100, [secondId]: 100 }) };
    const spec = { fuel: 6, [secondId]: 100 };  // kolejność: fuel pierwszy (6 szt), reszta dla secondId
    ms._bestEffortLoad(v, col, spec);
    const fuelLoaded = Math.min(6, Math.floor(cargoMax / wFuel));      // 6 (9t)
    const remW = cargoMax - fuelLoaded * wFuel;                         // 21
    const xLoaded = Math.min(100, Math.floor(remW / wX));
    assert(v.cargo.fuel === fuelLoaded, `fuel (pierwszy) ładowany w całości: ${fuelLoaded} (got ${v.cargo.fuel})`);
    assert((v.cargo[secondId] ?? 0) === xLoaded && xLoaded > 0, `${secondId} (drugi) bierze resztę miejsca: ${xLoaded} (got ${v.cargo[secondId] ?? 0})`);
  }
}

// ── T4 — _evaluateLoopProductivity ───────────────────────────────────────
header('T4: _evaluateLoopProductivity (alert 0+0, throttle, reset)');
{
  const ms = new MissionSystem();
  const pushed = [];
  let toastCount = 0;
  window.KOSMOS.eventLogSystem = { push: (e) => pushed.push(e) };
  const toastHandler = () => { toastCount++; };
  EventBus.on('ui:toast', toastHandler);

  const exp = { vesselId: 'v1', _lastOutLoaded: 0, _lastRetLoaded: 0, _unproductiveNotified: false };
  const vessel = { name: 'Tankowiec' };

  ms._evaluateLoopProductivity(exp, vessel);
  assert(exp._unproductiveNotified === true, '0+0 → notified=true');
  assert(pushed.length === 1, `1 wpis EventLog (got ${pushed.length})`);
  assert(toastCount === 1, `1 toast (got ${toastCount})`);
  assert(pushed[0].channel === 'fleet' && pushed[0].severity === 'warn', 'EventLog: channel=fleet severity=warn');

  ms._evaluateLoopProductivity(exp, vessel);  // throttle
  assert(pushed.length === 1, `throttle: nadal 1 wpis (got ${pushed.length})`);

  exp._lastRetLoaded = 5;  // produktywny cykl
  ms._evaluateLoopProductivity(exp, vessel);
  assert(exp._unproductiveNotified === false, 'produktywny → reset notified=false');

  exp._lastOutLoaded = 0; exp._lastRetLoaded = 0;  // znów bezproduktywny
  ms._evaluateLoopProductivity(exp, vessel);
  assert(pushed.length === 2, `po resecie nowy alert (got ${pushed.length})`);

  EventBus.off('ui:toast', toastHandler);
}

// ── T5 — _tryResumeLoop reload gdy cargo puste / skip gdy niepuste ────────
header('T5: _tryResumeLoop (reload empty / skip non-empty)');
{
  const ms = new MissionSystem();
  const dispatchCalls = [];
  ms._dispatchLoopLeg = (e, v, target, leg) => { dispatchCalls.push({ target, leg }); return true; };

  const srcCol = { resourceSystem: makeResSys({ fuel: 50 }) };
  const tgtCol = { resourceSystem: makeResSys({ fuel: 8 }) };
  window.KOSMOS.colonyManager = { getColony: (id) => (id === 'src' ? srcCol : id === 'tgt' ? tgtCol : null) };

  // Case A: waiting_reload, cargo puste → best-effort reload outbound
  {
    const vessel = makeVessel({ cargo: {}, cargoUsed: 0 });
    window.KOSMOS.vesselManager = { getVessel: () => vessel };
    const exp = { vesselId: 'v1', status: 'waiting_reload', loopSourceId: 'src', loopTargetId: 'tgt',
                  outboundCargoSpec: { fuel: 20 }, returnCargoSpec: { fuel: 40 } };
    dispatchCalls.length = 0;
    ms._tryResumeLoop(exp);
    assert(vessel.cargo.fuel === 20, `A: reload outbound spec → cargo.fuel 20 (got ${vessel.cargo.fuel})`);
    assert(exp._lastOutLoaded === 20, `A: _lastOutLoaded === 20 (got ${exp._lastOutLoaded})`);
    assert(dispatchCalls[0]?.leg === 'outbound', `A: dispatch leg=outbound (got ${dispatchCalls[0]?.leg})`);
  }

  // Case B: waiting_reload, cargo NIEpuste → skip reload (bez podwójnego spendu)
  {
    const vessel = makeVessel({ cargo: { fuel: 5 }, cargoUsed: 7.5 });
    window.KOSMOS.vesselManager = { getVessel: () => vessel };
    srcCol.resourceSystem.inventory.set('fuel', 50);
    const exp = { vesselId: 'v1', status: 'waiting_reload', loopSourceId: 'src', loopTargetId: 'tgt',
                  outboundCargoSpec: { fuel: 20 } };
    dispatchCalls.length = 0;
    ms._tryResumeLoop(exp);
    assert(vessel.cargo.fuel === 5, `B: cargo niezmienione (5, brak reloadu) (got ${vessel.cargo.fuel})`);
    assert(srcCol.resourceSystem.inventory.get('fuel') === 50, `B: inventory niezdekrementowane (50) (got ${srcCol.resourceSystem.inventory.get('fuel')})`);
    assert(dispatchCalls[0]?.leg === 'outbound', `B: dispatch leg=outbound (got ${dispatchCalls[0]?.leg})`);
  }

  // Case C: waiting_return_cargo, cargo puste, target ma 8 < spec 20 → best-effort 8
  {
    const vessel = makeVessel({ cargo: {}, cargoUsed: 0 });
    window.KOSMOS.vesselManager = { getVessel: () => vessel };
    const exp = { vesselId: 'v1', status: 'waiting_return_cargo', loopSourceId: 'src', loopTargetId: 'tgt',
                  returnCargoSpec: { fuel: 20 } };
    dispatchCalls.length = 0;
    ms._tryResumeLoop(exp);
    assert(vessel.cargo.fuel === 8, `C: best-effort partial → cargo.fuel 8 (got ${vessel.cargo.fuel})`);
    assert(dispatchCalls[0]?.leg === 'return', `C: dispatch leg=return (got ${dispatchCalls[0]?.leg})`);
  }
}

// ── Podsumowanie ─────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
