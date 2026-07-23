// Smoke: master-switch produkcji fabryk (offline/online) — jeden przycisk w dziale Production.
// Weryfikuje: API toggle, event factory:productionEnabledChanged, gate w _update (0 surowców),
// serialize/restore round-trip productionEnabled + default dla starych save.
//
// Uruchom: node src/testing/smoke/factory_production_toggle_smoke.mjs

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  FAIL:', msg); } }

// ── Minimalny global.window PRZED importem systemów ──────────────────────────
globalThis.window = { KOSMOS: {} };

const { default: EventBus } = await import('../../core/EventBus.js');
const { FactorySystem } = await import('../../systems/FactorySystem.js');

// ── Mock ResourceSystem ──────────────────────────────────────────────────────
function makeRS() {
  const inventory = new Map([['Fe', 1000], ['C', 1000]]);
  const rs = {
    inventory,
    _inventoryPerYear: new Map([['Fe', 10], ['C', 10]]),
    getEnergyAvailability: () => 1.0,
    getAmount: (id) => inventory.get(id) ?? 0,
    spendCalls: [], receiveCalls: [],
    spend(obj) {
      rs.spendCalls.push({ ...obj });
      for (const k in obj) inventory.set(k, (inventory.get(k) ?? 0) - obj[k]);
      return true;
    },
    receive(obj) {
      rs.receiveCalls.push({ ...obj });
      for (const k in obj) inventory.set(k, (inventory.get(k) ?? 0) + obj[k]);
    },
  };
  return rs;
}

// ── Setup fabryki jako aktywnej kolonii p1 ───────────────────────────────────
function setupFactory() {
  const rs = makeRS();
  const fs = new FactorySystem(rs);
  const colony = {
    planetId: 'p1',
    factorySystem: fs,
    buildingSystem: { techSystem: { getFactorySpeedMultiplier: () => 1.0 } },
  };
  window.KOSMOS.factorySystem = fs;
  window.KOSMOS.colonyManager = {
    activePlanetId: 'p1',
    getColony: (pid) => (pid === 'p1' ? colony : null),
    getAllColonies: () => [colony],
  };
  return { rs, fs };
}

// ── T1: domyślnie ONLINE ─────────────────────────────────────────────────────
{
  const { fs } = setupFactory();
  ok(fs.isProductionEnabled() === true, 'T1: nowy FactorySystem domyślnie ONLINE');
}

// ── T2: event factory:productionEnabledChanged z colonyId + enabled ──────────
{
  const { fs } = setupFactory();
  const events = [];
  const off = EventBus.on('factory:productionEnabledChanged', (d) => events.push(d));
  fs.setProductionEnabled(false);
  ok(events.length === 1, 'T2: jeden event po zmianie stanu');
  ok(events[0]?.colonyId === 'p1', 'T2: event niesie colonyId p1');
  ok(events[0]?.enabled === false, 'T2: event enabled=false');
  fs.setProductionEnabled(false); // no-op
  ok(events.length === 1, 'T2: powtórne setProductionEnabled(false) = no-op (bez eventu)');
  fs.setProductionEnabled(true);
  ok(events.length === 2 && events[1].enabled === true, 'T2: włączenie emituje event enabled=true');
  if (typeof off === 'function') off();
}

// ── T3: gate w _update — ONLINE produkuje i zużywa surowce ───────────────────
{
  const { rs, fs } = setupFactory();
  fs._allocations.set('structural_alloys', { points: 1, progress: 0, targetQty: null, produced: 0 });
  fs._update(0.25); // timePerUnit=0.20 → wyprodukuje 1 szt
  ok(rs.spendCalls.length >= 1, 'T3: ONLINE — spend wywołany (zużycie składników)');
  ok(rs.receiveCalls.some(c => 'structural_alloys' in c), 'T3: ONLINE — wyprodukowano structural_alloys');
}

// ── T4: gate w _update — OFFLINE nie zużywa ani nie produkuje ─────────────────
{
  const { rs, fs } = setupFactory();
  fs._allocations.set('structural_alloys', { points: 1, progress: 0, targetQty: null, produced: 0 });
  fs.setProductionEnabled(false);
  rs.spendCalls.length = 0; rs.receiveCalls.length = 0;
  fs._update(0.25);
  fs._update(0.5);
  ok(rs.spendCalls.length === 0, 'T4: OFFLINE — zero spend (brak zużycia surowców)');
  ok(rs.receiveCalls.length === 0, 'T4: OFFLINE — zero produkcji');
}

// ── T5: włączenie z powrotem wznawia produkcję ───────────────────────────────
{
  const { rs, fs } = setupFactory();
  fs._allocations.set('structural_alloys', { points: 1, progress: 0, targetQty: null, produced: 0 });
  fs.setProductionEnabled(false);
  fs._update(0.25);
  ok(rs.spendCalls.length === 0, 'T5: offline nie produkuje');
  fs.setProductionEnabled(true);
  fs._update(0.25);
  ok(rs.spendCalls.length >= 1, 'T5: po włączeniu produkcja wznowiona');
}

// ── T6: serialize/restore round-trip productionEnabled ───────────────────────
{
  const { fs } = setupFactory();
  fs.setProductionEnabled(false);
  const data = fs.serialize();
  ok(data.productionEnabled === false, 'T6: serialize zapisuje productionEnabled=false');

  const rs2 = makeRS();
  const fs2 = new FactorySystem(rs2);
  fs2.restore(data);
  ok(fs2.isProductionEnabled() === false, 'T6: restore odtwarza productionEnabled=false');
}

// ── T7: stary save bez pola → default ONLINE ─────────────────────────────────
{
  const rs = makeRS();
  const fs = new FactorySystem(rs);
  fs.restore({ totalPoints: 0 }); // brak productionEnabled (stary save)
  ok(fs.isProductionEnabled() === true, 'T7: restore bez pola → domyślnie ONLINE (bez migracji)');
}

console.log(`\nfactory_production_toggle_smoke: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
