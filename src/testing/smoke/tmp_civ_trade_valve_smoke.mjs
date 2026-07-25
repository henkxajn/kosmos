// MVP logistyki — Część A: zawór przepustowości handlu cywilnego.
// Uruchom: node src/testing/smoke/tmp_civ_trade_valve_smoke.mjs
//
// Pokrywa CivilianTradeSystem._routeGoods po zmianie stawki 0.3 → 1.8 (15% → 90% nadwyżki/tick)
// + twardy clamp qty ≤ surplus (Opcja 1):
//   T1 — stawka bazowa = 90% nadwyżki/tick (efficiency 1.0)
//   T2 — clamp: przy efficiency ×2.0 qty NIE przekracza surplus (byłoby 180%)
//   T3 — 2-letnia rezerwa konsumpcyjna nietknięta nawet przy max efficiency
//   T4 — pending demand (statki) wchodzi w rezerwę i jest chronione
//   T5 — TC jako wiążące ograniczenie: mała TC tnie qty poniżej 90% nadwyżki

globalThis.window = globalThis.window ?? {};
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const { CivilianTradeSystem } = await import('../../systems/CivilianTradeSystem.js');

const GOOD = 'structural_alloys'; // cena bazowa 16 Kr, towar handlowy

// ── Fabryki fixtures ────────────────────────────────────────────────────────
function mkResSys({ stock = {}, consumption = {} } = {}) {
  const inv = new Map(Object.entries(stock));
  const producers = new Map();
  if (Object.keys(consumption).length) {
    const rates = {};
    for (const [g, c] of Object.entries(consumption)) rates[g] = -c; // ujemne = konsumpcja
    producers.set('consumer', rates);
  }
  return {
    inventory: inv,
    _producers: producers,
    spend(obj) { for (const [g, q] of Object.entries(obj)) inv.set(g, (inv.get(g) ?? 0) - q); return true; },
    receive(obj) { for (const [g, q] of Object.entries(obj)) inv.set(g, (inv.get(g) ?? 0) + q); },
  };
}

function mkCol(planetId, resInit, { pendingShipOrders = [], tc = 1e12 } = {}) {
  return {
    planetId,
    resourceSystem: mkResSys(resInit),
    buildingSystem: null,      // getPendingDemand → {}, _getBuildingBonus → 0 (efficiency 1.0)
    pendingShipOrders,
    tradeOverrides: {},
    isOutpost: false,
    credits: 1e9,
    _tcPool: tc, _tcUsed: 0,
  };
}

// Uruchamia jeden przebieg routingu na parze (from → to) i zwraca przetransferowaną ilość.
function runRoute(cts, from, to, { effBonus = 0 } = {}) {
  cts._connections = [{ from, to, priority: 1, distance: 5, hasNexus: false }];
  cts._lastTransfers = [];
  // Wstrzyknij bonus efficiency (per kolonia) bez zależności od realnych danych budynków.
  const orig = cts._getBuildingBonus;
  cts._getBuildingBonus = (col, key) => (key === 'routingEfficiencyBonus' ? effBonus : 0);
  cts._routeGoods([from, to]);
  cts._getBuildingBonus = orig;
  const rec = cts._lastTransfers.find(t => t.goodId === GOOD);
  return rec ? rec.qty : 0;
}

const cts = new CivilianTradeSystem({ getAllColonies: () => [] });

// ══ T1 — stawka bazowa 90% nadwyżki/tick (efficiency 1.0) ═══════════════════════════════════════════
// exporter: brak konsumpcji GOOD → surplus = cały stock = 1000; efficiency 1.0.
// qty = min(maxFromTC, 1000×1.8×0.5) × 1.0 = 900. (stara stawka 0.3 dałaby 150.)
{
  const A = mkCol('A', { stock: { [GOOD]: 1000 } });
  const B = mkCol('B', { consumption: { [GOOD]: 10 } }); // deficyt
  const q = runRoute(cts, A, B);
  T('T1.1 stawka 90%: qty === 900 (nie 150 ze starej 0.3)', near(q, 900));
  T('T1.2 exporter stock po = 100 (1000 − 900)', near(A.resourceSystem.inventory.get(GOOD), 100));
}

// ══ T2 — clamp przy max efficiency ×2.0 ═════════════════════════════════════════════════════════════
// effBonus 0.5 na obu koloniach → efficiency = 1 + 0.5 + 0.5 = 2.0.
// qty PRZED clampem = 900 × 2.0 = 1800 (> surplus 1000). Clamp → 1000. NIE 1800.
{
  const A = mkCol('A', { stock: { [GOOD]: 1000 } });
  const B = mkCol('B', { consumption: { [GOOD]: 10 } });
  const q = runRoute(cts, A, B, { effBonus: 0.5 });
  T('T2.1 clamp: qty === 1000 (= surplus), NIE 1800', near(q, 1000));
  T('T2.2 qty nigdy > surplus', q <= 1000 + 1e-9);
}

// ══ T3 — 2-letnia rezerwa konsumpcyjna nietknięta przy max efficiency ═══════════════════════════════
// exporter konsumuje 5/rok GOOD, stock 100 → reserve = 5×2 = 10, surplus = 90.
// efficiency 2.0: qty PRZED clampem = 90×1.8×0.5×2 = 162 (> surplus). Clamp → 90.
// Bez clampa _executeTransfer wysłałby min(162, available 100) = 100 → stock 0 < rezerwa 10 (NARUSZENIE).
{
  const A = mkCol('A', { stock: { [GOOD]: 100 }, consumption: { [GOOD]: 5 } });
  const B = mkCol('B', { consumption: { [GOOD]: 20 } });
  const q = runRoute(cts, A, B, { effBonus: 0.5 });
  const stockAfter = A.resourceSystem.inventory.get(GOOD);
  const reserve = 5 * 2; // consumption × 2
  T('T3.1 qty === 90 (= surplus, nie 100)', near(q, 90));
  T('T3.2 stock po = 10 (= dokładnie rezerwa)', near(stockAfter, reserve));
  T('T3.3 stock po ≥ 2-letnia rezerwa konsumpcyjna', stockAfter >= reserve - 1e-9);
}

// ══ T4 — pending demand (statki) wchodzi w chronioną rezerwę ════════════════════════════════════════
// exporter stock 1000, brak konsumpcji, ale pendingShipOrders wymaga 200 GOOD → reserve = 200,
// surplus = 800. efficiency 1.0 → qty = 800×0.9 = 720. stock po = 280 ≥ pending 200.
{
  const A = mkCol('A', { stock: { [GOOD]: 1000 } },
    { pendingShipOrders: [{ cost: { [GOOD]: 200 } }] });
  const B = mkCol('B', { consumption: { [GOOD]: 10 } });
  const q = runRoute(cts, A, B);
  const stockAfter = A.resourceSystem.inventory.get(GOOD);
  T('T4.1 pending w rezerwie: qty === 720 (surplus 800 × 0.9)', near(q, 720));
  T('T4.2 stock po = 280 ≥ pending 200', stockAfter >= 200 - 1e-9 && near(stockAfter, 280));
}

// ══ T5 — TC jako wiążące ograniczenie tnie qty poniżej 90% nadwyżki ═════════════════════════════════
// mała TC: _tcPool = 1600 Kr, cena GOOD = 16 → maxFromTC = 100 jednostek < 900 (90% nadwyżki).
// qty = min(100, 900) × 1.0 = 100.
{
  const A = mkCol('A', { stock: { [GOOD]: 1000 } }, { tc: 1600 });
  const B = mkCol('B', { consumption: { [GOOD]: 10 } }, { tc: 1600 });
  const q = runRoute(cts, A, B);
  T('T5.1 TC wiąże: qty === 100 (1600 Kr / 16 cena)', near(q, 100));
}

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\nCiv trade valve (Część A): ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
