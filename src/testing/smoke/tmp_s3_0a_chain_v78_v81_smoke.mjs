// S3.0a/S3.0b — KANONICZNY test migracji łańcucha v78 → v82.
// Weryfikuje pełną ścieżkę paliwa przez wszystkie migracje na JEDNYM save:
//   v78→v79: remap fuelType power_cells/plasma_cores → 'fuel' + colony inventory.fuel default 30
//   v79→v80: colony inventory.H bootstrap (0)
//   v80→v81: pętla outboundCargoSpec recovery + trackery produktywności
//   v81→v82: model dwu-bakowy — warpFuel na statkach + bak in-system ZAWSZE 'fuel' (S3.0b S1);
//            RESCUE statku legacy-warp (stary bak warp_cores → warpFuel)
//
// (Pojedyncze migracje mają per-commit smoke a/b/c/d/e + S3.0b S1 — to test integracyjny łańcucha.)

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

const { CURRENT_VERSION, migrate } = await import('../../systems/SaveMigration.js');

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

header('Łańcuch v78 → v82 (jedno przejście migrate)');
const m = migrate(JSON.parse(JSON.stringify(saveV78)));

assert(!m.error, m.error ? `migracja BEZ błędu (got error: ${m.error})` : 'migracja bez błędu (chain OK)');
assert(m.version === CURRENT_VERSION, `version === CURRENT_VERSION (got ${m.version})`);

header('v78→v79: remap fuelType + colony fuel default');
{
  const byId = {};
  for (const v of m.civ4x.vesselManager.vessels) byId[v.id] = v;
  assert(byId.tanker.fuelType === 'fuel' && byId.tanker.fuel.fuelType === 'fuel', 'tanker power_cells → fuel (root+nested)');
  assert(byId.tanker.fuel.current === 5, `tanker fuel.current zachowany 5 (got ${byId.tanker.fuel.current})`);
  assert(byId.hauler.fuelType === 'fuel' && byId.hauler.fuel.fuelType === 'fuel', 'hauler plasma_cores → fuel');
  // (warp ship: v78→v79 NIE remapuje warp_cores; reforma v81→v82 przenosi je do warpFuel — patrz sekcja niżej)
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

header('v81→v82: model dwu-bakowy (warpFuel + bak in-system fuel)');
{
  const byId = {};
  for (const v of m.civ4x.vesselManager.vessels) byId[v.id] = v;
  // tanker/hauler: nie-warp → bak in-system 'fuel', warpFuel.max 0 (nie skaczą)
  assert(byId.tanker.fuelType === 'fuel' && byId.tanker.fuel.fuelType === 'fuel', 'tanker bak in-system === fuel');
  assert(byId.tanker.warpFuel && byId.tanker.warpFuel.max === 0, `tanker warpFuel.max === 0 (nie-warp) (got ${byId.tanker.warpFuel?.max})`);
  assert(byId.tanker.fuel.current === 5, `tanker fuel.current zachowany 5 (got ${byId.tanker.fuel.current})`);
  // warp: RESCUE — warp_cores przeniesione do warpFuel, bak in-system zresetowany do 'fuel'
  assert(byId.warp.fuelType === 'fuel', `warp root fuelType → fuel (got ${byId.warp.fuelType})`);
  assert(byId.warp.fuel.fuelType === 'fuel' && byId.warp.fuel.max === 8, `warp bak in-system reset → {8,fuel} (got max ${byId.warp.fuel.max}/${byId.warp.fuel.fuelType})`);
  assert(byId.warp.warpFuel.current === 2, `warp RESCUE warpFuel.current === 2 (got ${byId.warp.warpFuel.current})`);
  assert(byId.warp.warpFuel.max === 5, `warp RESCUE warpFuel.max === 5 = max(4,5) (got ${byId.warp.warpFuel.max})`);
  assert(byId.warp.warpFuel.fuelType === 'warp_cores', 'warp warpFuel.fuelType === warp_cores');
}

console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
