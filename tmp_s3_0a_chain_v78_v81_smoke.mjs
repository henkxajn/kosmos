// S3.0a — KANONICZNY test migracji łańcucha v78 → v81 (domknięcie S3.0a).
// Weryfikuje pełną ścieżkę paliwa przez wszystkie 3 migracje S3.0a na JEDNYM save:
//   v78→v79: remap fuelType power_cells/plasma_cores → 'fuel' + colony inventory.fuel default 30
//   v79→v80: colony inventory.H bootstrap (0)
//   v80→v81: pętla outboundCargoSpec recovery + trackery produktywności
//
// (Pojedyncze migracje mają per-commit smoke a/b/c/d/e — to test integracyjny łańcucha.)

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

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// ── Reprezentatywny save v78 (przed reformą paliwa S3.0a) ────────────────
const saveV78 = {
  version: 78,
  civ4x: {
    vesselManager: {
      vessels: [
        { id: 'tanker', fuelType: 'power_cells',  fuel: { fuelType: 'power_cells',  current: 5, max: 8 } },
        { id: 'hauler', fuelType: 'plasma_cores',  fuel: { fuelType: 'plasma_cores',  current: 3, max: 10 } },
        { id: 'warp',   fuelType: 'warp_cores',    fuel: { fuelType: 'warp_cores',    current: 2, max: 4 } },
      ],
    },
    colonies: [
      { resources: { inventory: { Fe: 100, power_cells: 12 } } },   // brak fuel, brak H
    ],
    missions: {
      missions: [
        { id: 'L1', loop: true,  leg: 'outbound',      cargo: { fuel: 25 } },  // outbound → odzysk spec
        { id: 'L2', loop: true,  leg: 'waiting_reload', cargo: null },         // parked → spec {}
        { id: 'M1', loop: false, leg: null,             cargo: { Fe: 5 } },    // nie-pętla → skip
      ],
    },
  },
};

header('Łańcuch v78 → v81 (jedno przejście migrate)');
const m = migrate(JSON.parse(JSON.stringify(saveV78)));

assert(!m.error, m.error ? `migracja BEZ błędu (got error: ${m.error})` : 'migracja bez błędu (chain OK)');
assert(m.version === CURRENT_VERSION && m.version === 81, `version === 81 (got ${m.version})`);

header('v78→v79: remap fuelType + colony fuel default');
{
  const byId = {};
  for (const v of m.civ4x.vesselManager.vessels) byId[v.id] = v;
  assert(byId.tanker.fuelType === 'fuel' && byId.tanker.fuel.fuelType === 'fuel', 'tanker power_cells → fuel (root+nested)');
  assert(byId.tanker.fuel.current === 5, `tanker fuel.current zachowany 5 (got ${byId.tanker.fuel.current})`);
  assert(byId.hauler.fuelType === 'fuel' && byId.hauler.fuel.fuelType === 'fuel', 'hauler plasma_cores → fuel');
  assert(byId.warp.fuelType === 'warp_cores' && byId.warp.fuel.fuelType === 'warp_cores', 'warp_cores NIETKNIĘTY');
  const inv = m.civ4x.colonies[0].resources.inventory;
  assert(inv.fuel === 30, `colony inventory.fuel default 30 (got ${inv.fuel})`);
  assert(inv.power_cells === 12, `power_cells (commodity budowlane) zachowany 12 (got ${inv.power_cells})`);
}

header('v79→v80: colony hydrogen bootstrap');
{
  const inv = m.civ4x.colonies[0].resources.inventory;
  assert(inv.H === 0, `colony inventory.H === 0 (bootstrap) (got ${inv.H})`);
}

header('v80→v81: pętla outboundCargoSpec + trackery');
{
  const byId = {};
  for (const x of m.civ4x.missions.missions) byId[x.id] = x;
  assert(JSON.stringify(byId.L1.outboundCargoSpec) === '{"fuel":25}', `L1 outbound odzysk → {fuel:25} (got ${JSON.stringify(byId.L1.outboundCargoSpec)})`);
  assert(byId.L1._lastOutLoaded === 25, `L1 _lastOutLoaded === 25 (got ${byId.L1._lastOutLoaded})`);
  assert(byId.L1._unproductiveNotified === false, 'L1 _unproductiveNotified === false');
  assert(JSON.stringify(byId.L2.outboundCargoSpec) === '{}', `L2 waiting_reload nieodzysk → {} (got ${JSON.stringify(byId.L2.outboundCargoSpec)})`);
  assert(byId.M1.outboundCargoSpec === undefined, 'M1 nie-pętla pominięta');
}

console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
