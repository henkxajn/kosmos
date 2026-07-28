// Population 2.0 (Faza 4) — droidy jako dobra INWESTYCYJNE: zlecenia Build-N (one-shot),
// poza reactive/safety-stock. Real-path smoke (FactorySystem).
// Uruchom: node src/testing/smoke/tmp_pop4_droid_orders_smoke.mjs
//
// (a) zlecenie N → dokładnie N, potem STOP (brak auto-uzupełniania po zdjęciu droida);
// (b) min-zapas (demandBonus) NIE działa na droidy; (c) anulowanie w połowie: ukończone
// zostają, reszta stop, brak dalszego kosztu; (d) powody STALL dla zleceń (missing/insolvent/
// no_points); (e) android przez tę samą ścieżkę (+ chain-aware); (f) reactive dla zwykłego
// towaru NIETKNIĘTY; (m) migracja: konwersja jawnego one-shot droida + anulowanie in-flight.

import '../headless/env.js'; // MUST be first
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

function makeColony({ scenario = 'civilization', credits = 5000, stock = {}, techAllTrue = false } = {}) {
  window.KOSMOS = window.KOSMOS || {};
  window.KOSMOS.civMode = true;
  window.KOSMOS.scenario = scenario;
  window.KOSMOS.timeSystem = { gameTime: 0 };
  const res = new ResourceSystem({});
  for (const [k, v] of Object.entries(stock)) res.inventory.set(k, v);
  const fs = new FactorySystem(res);
  const techSystem = {
    getFactorySpeedMultiplier: () => 1.0,
    isResearched: () => techAllTrue,
    isCommodityUnlocked: () => techAllTrue,
  };
  const colony = {
    planetId: 'ne', credits, factorySystem: fs, resourceSystem: res,
    buildingSystem: { _active: new Map(), techSystem },
  };
  window.KOSMOS.factorySystem = fs;
  window.KOSMOS.colonyManager = { getAllColonies: () => [colony], getColony: () => colony, activePlanetId: 'ne' };
  window.KOSMOS.civilianTradeSystem = {
    getCredits: () => colony.credits,
    spendCredits: (_pid, amt) => { if ((colony.credits ?? 0) < amt) return false; colony.credits -= amt; return true; },
  };
  return { fs, res, colony };
}
const FULL = { Li: 9000, C: 9000, Fe: 9000, Cu: 9000, Si: 9000 };

// ── (a) zlecenie N → dokładnie N, potem STOP (brak auto-uzupełniania) ─────────
console.log('--- (a) zlecenie N → dokładnie N; zdjęcie droida NIE wywołuje auto-uzupełnienia ---');
{
  const { fs, res } = makeColony({ stock: { ...FULL }, credits: 5000 });
  fs.setTotalPoints(8); fs.setMode('reactive');
  ok('(a) setDroidOrder(3) zaakceptowane', fs.setDroidOrder('automation_droid', 3) === true);
  ok('(a) getDroidOrder → 0/3', fs.getDroidOrder('automation_droid')?.qty === 3);
  fs._update(1.0);
  ok('(a) wyprodukowano DOKŁADNIE 3', res.getAmount('automation_droid') === 3);
  ok('(a) zlecenie znika po ukończeniu', fs.getDroidOrder('automation_droid') === null && fs.droidOrders.length === 0);
  // Zdejmij 1 droida (jak install) → BRAK auto-uzupełnienia (droidy poza safety).
  res.spend({ automation_droid: 1 });
  fs._update(1.0); fs._update(1.0);
  ok('(a) po zdjęciu 1 (→2): ZERO auto-replenish (dalej 2)', res.getAmount('automation_droid') === 2);
  ok('(a) brak alokacji droida (nie produkuje w tle)', !fs.getAllocations().some(x => x.commodityId === 'automation_droid'));
  fs._reactiveAllocate();
  ok('(a) droid NIE w reactiveDemand (poza safety/reactive)', !fs.reactiveDemand.some(d => d.commodityId === 'automation_droid'));
}

// ── (b) min-zapas (demandBonus) NIE działa na droidy ──────────────────────────
console.log('--- (b) min-zapas nie dotyczy droidów (demandBonus no-op + safety wyklucza) ---');
{
  const { fs, res } = makeColony({ stock: {}, credits: 5000 });   // 0 zapasu droidów
  fs.setTotalPoints(8); fs.setMode('reactive');
  fs.setDemandBonus('automation_droid', 10);
  ok('(b) setDemandBonus na droida = no-op (bonus 0)', fs.getDemandBonus('automation_droid') === 0);
  // Nawet gdyby bonus istniał (wstrzyknięty), safety go pomija — brak produkcji bez zlecenia.
  fs._demandBonus.set('automation_droid', 10);            // wstrzyknięcie na siłę
  fs._everProducedHere.add('automation_droid');
  fs._update(1.0);
  ok('(b) brak zlecenia → ZERO droidów mimo wstrzykniętego min-zapasu', res.getAmount('automation_droid') === 0);
  ok('(b) droid poza reactiveDemand (safety wyklucza isDroidUnit)', !fs.reactiveDemand.some(d => d.commodityId === 'automation_droid'));
  ok('(b) getSafetyStockTarget ignoruje wstrzyknięty bonus? (i tak wykluczony) — brak alloc', !fs.getAllocations().some(x => x.commodityId === 'automation_droid'));
}

// ── (c) anulowanie w połowie: ukończone zostają, reszta stop, brak dalszego kosztu ──
console.log('--- (c) cancel mid-order: ukończone zostają, remainder stop, zero dalszego kosztu ---');
{
  // Kredyty na dokładnie 2 szt (1000/500) → 2 zrobione, potem insolvent-pauza przy 5-szt zleceniu.
  const { fs, res, colony } = makeColony({ stock: { ...FULL }, credits: 1000 });
  fs.setTotalPoints(8); fs.setMode('reactive');
  fs.setDroidOrder('automation_droid', 5);
  fs._update(1.0);
  ok('(c) 2 ukończone (limit Kr 1000/500), zlecenie wciąż aktywne 2/5', res.getAmount('automation_droid') === 2 && fs.getDroidOrder('automation_droid')?.produced === 2);
  ok('(c) Kr wyzerowane (2×500)', colony.credits === 0);
  const madeBefore = res.getAmount('automation_droid');
  fs.cancelDroidOrder('automation_droid');
  ok('(c) po anulowaniu: zlecenie znika', fs.getDroidOrder('automation_droid') === null);
  ok('(c) ukończone 2 ZOSTAJĄ (brak zwrotu/utraty)', res.getAmount('automation_droid') === madeBefore);
  ok('(c) alokacja droida zwolniona natychmiast', !fs.getAllocations().some(x => x.commodityId === 'automation_droid'));
  // Dolej Kr i tyknij — brak dalszej produkcji/kosztu (zlecenie anulowane).
  colony.credits = 5000;
  fs._update(1.0); fs._update(1.0);
  ok('(c) brak dalszej produkcji po anulowaniu', res.getAmount('automation_droid') === madeBefore);
  ok('(c) brak dalszego kosztu Kr (5000 nietknięte)', colony.credits === 5000);
}

// ── (d) powody STALL dla zleceń droidów ───────────────────────────────────────
console.log('--- (d) stall reasons dla zleceń: missing / insolvent / no_points ---');
{
  // missing_ingredient: zlecenie + za mało Li.
  const c1 = makeColony({ stock: { Li: 100, C: 9000, Fe: 9000, Cu: 9000, Si: 9000 }, credits: 5000 });
  c1.fs.setTotalPoints(8); c1.fs.setMode('reactive');
  c1.fs.setDroidOrder('automation_droid', 3);
  c1.fs._update(1.0);
  const a1 = c1.fs.getAllocations().find(x => x.commodityId === 'automation_droid');
  ok('(d) missing: alloc paused + stallReason missing_ingredient(Li)', a1?.paused === true && a1.stallReason?.kind === 'missing_ingredient' && a1.stallReason.missing.some(m => m.resId === 'Li'));

  // insolvent: pełny zapas, kredyty < 500.
  const c2 = makeColony({ stock: { ...FULL }, credits: 200 });
  c2.fs.setTotalPoints(8); c2.fs.setMode('reactive');
  c2.fs.setDroidOrder('automation_droid', 3);
  c2.fs._update(1.0);
  const a2 = c2.fs.getAllocations().find(x => x.commodityId === 'automation_droid');
  ok('(d) insolvent: alloc paused + stallReason insolvent', a2?.paused === true && a2.stallReason?.kind === 'insolvent');

  // no_points: getStallReason bezpośrednio (pełny zapas, Kr OK, 0 FP).
  const c3 = makeColony({ stock: { ...FULL }, credits: 5000 });
  const sr = c3.fs.getStallReason('automation_droid', { commodityId: 'automation_droid', points: 0, progress: 0, produced: 0, targetQty: 3 });
  ok('(d) no_points: getStallReason → no_points (składniki+Kr OK, 0 FP)', sr?.kind === 'no_points');
}

// ── (e) android_worker przez tę samą ścieżkę (+ chain-aware) ──────────────────
console.log('--- (e) android: setDroidOrder + produkcja (pre-stock) + chain-aware ---');
{
  // Raws dla android I jego sub-składników (semiconductor_arrays wymaga Xe/Hv) + pre-stock subów.
  const stock = {
    Fe: 100, Cu: 100, Si: 100, C: 100, Hv: 100, Xe: 100,
    electronic_systems: 10, semiconductor_arrays: 10, polymer_composites: 10,
  };
  const { fs, res } = makeColony({ stock, credits: 5000, techAllTrue: true });
  fs.setTotalPoints(8); fs.setMode('reactive');
  ok('(e) android jest isDroidUnit', COMMODITIES.android_worker.isDroidUnit === true);
  ok('(e) setDroidOrder(android_worker,1) OK', fs.setDroidOrder('android_worker', 1) === true);
  // ⚠ Produkcja outer-fs PRZED utworzeniem nowej kolonii (makeColony klobruje window.KOSMOS).
  fs._update(1.0);
  ok('(e) android wyprodukowany (1), zlecenie znika', res.getAmount('android_worker') === 1 && fs.getDroidOrder('android_worker') === null);

  // delegacja: setOneShotJob(droid) → droidOrders (osobna kolonia, po produkcji outer-fs).
  {
    const c = makeColony({ stock, credits: 5000, techAllTrue: true });
    c.fs.setTotalPoints(8); c.fs.setMode('reactive');
    const r = c.fs.setOneShotJob('android_worker', 2);
    ok('(e) delegacja: setOneShotJob(android) idzie w droidOrders', r === true && c.fs.oneShotJob === null && c.fs.getDroidOrder('android_worker')?.qty === 2);
  }

  // chain-aware: order android BEZ subów w magazynie, ale z raws subów → autoChain zawiera suby.
  const stock2 = { Fe: 100, Cu: 100, Si: 100, C: 100, Hv: 100, Xe: 100 };
  const c2 = makeColony({ stock: stock2, credits: 5000, techAllTrue: true });
  c2.fs.setTotalPoints(8); c2.fs.setMode('reactive');
  c2.fs.setDroidOrder('android_worker', 1);
  ok('(e) chain-aware: autoChain zawiera semiconductor_arrays (sub-składnik)', c2.fs.autoChain.some(ch => ch.commodityId === 'semiconductor_arrays'));
}

// ── (f) reactive dla ZWYKŁEGO towaru NIETKNIĘTY (regresja) ────────────────────
console.log('--- (f) reactive/safety dla zwykłego towaru (structural_alloys) działa jak dawniej ---');
{
  const { fs, res } = makeColony({ stock: { Fe: 9000, C: 9000 }, credits: 5000 });
  fs.setTotalPoints(8); fs.setMode('reactive');
  fs.setDemandBonus('structural_alloys', 5);   // min-zapas dla zwykłego towaru DZIAŁA
  ok('(f) demandBonus zwykłego towaru USTAWIONY (nie no-op)', fs.getDemandBonus('structural_alloys') === 5);
  fs._update(1.0);
  ok('(f) structural_alloys w reactiveDemand (safety)', fs.reactiveDemand.some(d => d.commodityId === 'structural_alloys' && d.source === 'safety'));
  ok('(f) structural_alloys PRODUKOWANY przez reactive (>0)', res.getAmount('structural_alloys') > 0);
}

// ── (m) migracja restore ──────────────────────────────────────────────────────
console.log('--- (m) migracja: round-trip + konwersja one-shot droida + anulowanie in-flight ---');
{
  // m1: round-trip droidOrders.
  const { fs } = makeColony({ stock: { ...FULL } });
  fs.setDroidOrder('automation_droid', 4);
  fs._droidOrders.get('automation_droid').produced = 1;   // symuluj postęp
  const data = fs.serialize();
  const fs2 = new FactorySystem(new ResourceSystem({}));
  fs2.restore(data);
  ok('(m1) round-trip droidOrders (4, produced 1)', fs2.getDroidOrder('automation_droid')?.qty === 4 && fs2.getDroidOrder('automation_droid')?.produced === 1);

  // m2: stary jawny one-shot na droida → konwersja na droidOrder.
  const fs3 = new FactorySystem(new ResourceSystem({}));
  fs3.restore({ oneShotJob: { commodityId: 'automation_droid', qty: 5, produced: 2 } });
  ok('(m2) one-shot droida skonwertowany na droidOrder (5, produced 2)', fs3.getDroidOrder('automation_droid')?.qty === 5 && fs3.getDroidOrder('automation_droid')?.produced === 2);
  ok('(m2) _oneShotJob wyczyszczony po konwersji', fs3.oneShotJob === null);

  // m3: in-flight reactive alloc droida + demandBonus droida → anulowane/odfiltrowane na load.
  const fs4 = new FactorySystem(new ResourceSystem({}));
  fs4.restore({
    allocations: [{ commodityId: 'automation_droid', points: 1, progress: 0.5, produced: 0, targetQty: 3 }],
    queue: [{ commodityId: 'automation_droid', qty: 2 }],
    demandBonus: { automation_droid: 7, structural_alloys: 3 },
  });
  ok('(m3) in-flight reactive alloc droida ANULOWANA', !fs4.getAllocations().some(a => a.commodityId === 'automation_droid'));
  ok('(m3) droid w kolejce ANULOWANY', !fs4.getQueue().some(q => q.commodityId === 'automation_droid'));
  ok('(m3) demandBonus droida ODFILTROWANY, zwykłego ZACHOWANY', fs4.getDemandBonus('automation_droid') === 0 && fs4.getDemandBonus('structural_alloys') === 3);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
