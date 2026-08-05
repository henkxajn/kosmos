// BALANS 1.0 — Phase 2 — ResourceTelemetry keeper (chroni czujnik ZASOBÓW).
// Instrument NIE ma bramki w przeglądarce → czujnik zepsuty = werdykt zepsuty bez śladu.
// Chroni: rozgałęzienie klasyfikatora po RODZAJU zasobu (pułapka definicyjna: energy to
// FLOW, research to AKUMULATOR — traktowane jak magazyn dawały fałszywe „binding" co rok),
// przeliczenie stawek na GAME-YEAR (HARD #3), analizę blokerów opartą na REALNYCH regułach
// gry, wątek delty rok-do-roku, wykrywanie wady pomiaru (zerowana konsumpcja POP)
// oraz realny boot (guard przed dryfem API ResourceSystem/BuildingSystem).
//
//   T1  classify() tablica prawdy — magazyn (mined/harvested) vs flow vs accumulator
//   T2  blocked() — realny koszt + canAfford gry; kolejka „brak surowców"; brak kafla
//   T3  flows() — rozbicie gry przeliczone na game-year (×CIV_TIME_SCALE)
//   T4  snapshot() — delta rok-do-roku, reszta bilansu, flaga zerowanej konsumpcji POP
//   T5  summarizeSeed / aggregatePanel / panelVerdict (czyste)
//   T6  realny GameCore boot przez WSPÓLNY driver + sample (guard dryfu API)
//
// Uruchom: node src/testing/smoke/balans_resource_telemetry_smoke.mjs

import '../headless/env.js';           // MUST be first
import {
  ResourceTelemetry, RES_STATE, RESOURCE_IDS, RESOURCE_KIND, RESOURCE_TELEMETRY_DEFAULTS,
  CIV_PER_GY, summarizeSeed, aggregatePanel, panelVerdict,
} from '../headless/ResourceTelemetry.js';
import { runOneGame } from '../headless/balans-driver.mjs';
import { TERRAIN_TYPES } from '../../map/HexTile.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── T1: classify() — rozgałęzienie po rodzaju ─────────────────────
console.log('T1 — classify() wg RODZAJU zasobu (magazyn / flow / akumulator)');
{
  const C = ResourceTelemetry.classify;
  const mined = (o) => C({ kind: 'mined', stock: 100, prodPerGy: 10, consPerGy: 5, deltaPerGy: 1, coverGy: 5, blockedBuilds: 0, anyAffordable: true, ...o });

  // magazyn: drabina inert → binding → tight → glut → ok
  assert(mined({ stock: 0, prodPerGy: 0, consPerGy: 0, deltaPerGy: 0, coverGy: Infinity }) === RES_STATE.INERT,
    'brak przepływu i zapasu → INERT');
  assert(mined({ blockedBuilds: 3, anyAffordable: false }) === RES_STATE.BINDING,
    'gospodarka stoi (0 osiągalnych) + zasób blokuje → BINDING');
  assert(mined({ blockedBuilds: 3, anyAffordable: true }) === RES_STATE.TIGHT,
    'zasób blokuje, ale coś JESZCZE jest osiągalne → TIGHT (nie binding)');
  assert(mined({ stock: 0.5, deltaPerGy: -3 }) === RES_STATE.BINDING,
    'magazyn pusty i drenuje → BINDING (głód) niezależnie od blokad');
  assert(mined({ stock: 0.5, deltaPerGy: +3, coverGy: 0.2 }) === RES_STATE.TIGHT,
    'pusty ale rosnący, zapas < 1 gy → TIGHT');
  assert(mined({ coverGy: 50 }) === RES_STATE.GLUT, 'zapas ≥ 20 gy zużycia → GLUT');
  assert(mined({ coverGy: Infinity }) === RES_STATE.GLUT, 'brak ujścia (cover ∞) → GLUT');
  assert(mined({ coverGy: 5 }) === RES_STATE.OK, 'zapas 5 gy, nic nie blokuje → OK');
  assert(mined({ blockedBuilds: 1, anyAffordable: false, coverGy: 999 }) === RES_STATE.BINDING,
    'binding bije glut (kolejność drabiny)');

  // flow (energy): `stock` = BILANS
  const flow = (o) => C({ kind: 'flow', stock: 10, prodPerGy: 100, consPerGy: 90, ...o });
  assert(flow({ stock: -5 }) === RES_STATE.BINDING, 'energia: bilans < 0 (brownout) → BINDING');
  assert(flow({ stock: 1 }) === RES_STATE.TIGHT, 'energia: bilans < 5% produkcji → TIGHT');
  assert(flow({ stock: 10 }) === RES_STATE.OK, 'energia: bilans 10% produkcji → OK');
  assert(flow({ stock: 80 }) === RES_STATE.GLUT, 'energia: bilans > 50% produkcji → GLUT (sieć stoi)');
  assert(flow({ stock: 0, prodPerGy: 0, consPerGy: 0 }) === RES_STATE.INERT, 'energia: zero sieci → INERT');
  // ⚠ regresja pułapki: energia NIGDY nie może być klasyfikowana jak pusty magazyn
  //    (bilans 0.4 przy żywej sieci to zdrowy „na styk", NIE pusty magazyn → nigdy BINDING)
  assert(flow({ stock: 0.4, prodPerGy: 100, consPerGy: 99.6 }) === RES_STATE.TIGHT
      && flow({ stock: 60, prodPerGy: 100, consPerGy: 40 }) === RES_STATE.GLUT,
    'energia nie używa progu STOCK_EPS (nie ma magazynu)');

  // accumulator (research): zero ≠ niedobór
  const acc = (o) => C({ kind: 'accumulator', stock: 0, prodPerGy: 200, consPerGy: 0, deltaPerGy: 0, ...o });
  assert(acc({}) === RES_STATE.OK, 'badania: bank 0 przy produkcji → OK (drenowane z założenia, NIE binding)');
  assert(acc({ prodPerGy: 0 }) === RES_STATE.INERT, 'badania: brak produkcji i banku → INERT');
  assert(acc({ blockedBuilds: 9, anyAffordable: false }) === RES_STATE.OK,
    'badania: nie wiążą nawet gdy gospodarka stoi (osobna metryka)');

  // taksonomia z danych gry
  assert(RESOURCE_KIND.Fe === 'mined' && RESOURCE_KIND.food === 'harvested'
      && RESOURCE_KIND.energy === 'flow' && RESOURCE_KIND.research === 'accumulator',
    'RESOURCE_KIND wyprowadzony z taksonomii ResourcesData');
  assert(RESOURCE_IDS.length === 14 && RESOURCE_IDS.includes('Fe') && RESOURCE_IDS.includes('research'),
    `lista zasobów z danych gry (${RESOURCE_IDS.length} pozycji: 10 mined + 2 harvested + 2 utility)`);
}

// ── Stub kolonii (realne TERRAIN_TYPES + realne BUILDINGS przez blocked()) ──
const bType = Object.keys(TERRAIN_TYPES).find(k => TERRAIN_TYPES[k].buildable);
function mkHome({ afford = () => true, tiles = null, pending = [], pop = 20, popCons = { food: -5, water: -3, energy: -2 },
  breakdown = null, amounts = {}, energy = { production: 10, consumption: 8, balance: 2, brownout: false } } = {}) {
  const grid = { toArray: () => tiles ?? Array.from({ length: 6 }, (_, i) => ({ type: bType, key: `t${i}`, isOccupied: false, damaged: false })) };
  const producers = new Map();
  if (popCons) producers.set('civilization_consumption', popCons);
  const resourceSystem = {
    _producers: producers,
    energy,
    getEnergyAvailability: () => 1,
    getAmount: (id) => amounts[id] ?? 0,
    getPerYear: (id) => (breakdown?.[id]?.net ?? 0),
    canAfford: (cost) => Object.entries(cost).every(([k, v]) => afford(k, v)),
    getResourceBreakdown: (id) => breakdown?.[id]
      ? { producers: { x: { total: breakdown[id].prod ?? 0 } }, consumers: { y: { total: -(breakdown[id].cons ?? 0) } } }
      : { producers: {}, consumers: {} },
  };
  const buildingSystem = {
    techSystem: { isResearched: () => true },
    _canBuildOnTile: () => true,
    _pendingQueue: new Map(pending.map((o, i) => [`p${i}`, o])),
  };
  return {
    planetId: 'home', planet: { id: 'home', atmosphere: 'breathable', temperatureC: 15, surfaceGravity: 1.0 },
    grid, resourceSystem, buildingSystem, civSystem: { population: pop },
  };
}

// ── T2: blocked() — realne reguły gry ─────────────────────────────
console.log('\nT2 — blocked() na realnych regułach gry (koszt + canAfford + kolejka pending)');
{
  const rich = ResourceTelemetry.blocked(mkHome({ afford: () => true }));
  assert(rich.blocked === 0 && rich.affordable > 0, `stać na wszystko → 0 zablokowanych, ${rich.affordable} osiągalnych`);
  assert(Object.keys(rich.byRes).length === 0, 'stać na wszystko → pusta mapa blokerów');

  const broke = ResourceTelemetry.blocked(mkHome({ afford: () => false }));
  assert(broke.affordable === 0 && broke.blocked > 0, `nie stać na nic → 0 osiągalnych, ${broke.blocked} zablokowanych`);
  assert((broke.byRes.Fe ?? 0) > 0, 'Fe wśród blokerów (realne koszty budynków z BUILDINGS)');
  assert(Object.keys(broke.byRes).some(k => !RESOURCE_IDS.includes(k)),
    'blokerem bywa TOWAR (commodityCost), nie tylko surowiec — liczone razem');
  assert(Object.keys(broke.commodityStock).length > 0, 'stany magazynu towarów-blokerów zapisane');

  const noTiles = ResourceTelemetry.blocked(mkHome({ tiles: [], afford: () => false }));
  assert(noTiles.blocked === 0 && noTiles.affordable === 0 && noTiles.noTile > 0,
    'brak wolnego kafla → budynek nie liczy się ani jako osiągalny, ani zablokowany');

  const occupied = ResourceTelemetry.blocked(mkHome({ tiles: [{ type: bType, isOccupied: true, damaged: false }], afford: () => false }));
  assert(occupied.noTile > 0 && occupied.blocked === 0, 'kafle zajęte → też brak kafla (parytet z regułą gry)');

  const pend = ResourceTelemetry.blocked(mkHome({ afford: (k) => k !== 'Ti', pending: [{ cost: { Ti: 40, Fe: 10 } }, { cost: { Fe: 10 } }] }));
  assert(pend.pendingQueue === 2, 'policzone wszystkie zlecenia w kolejce „brak surowców"');
  assert(pend.pendingByRes.Ti === 1 && !pend.pendingByRes.Fe,
    'kolejka pending wskazuje TYLKO realnie brakujący klucz (Ti), nie cały koszt');
}

// ── T3: flows() — przeliczenie na GAME-YEAR ───────────────────────
console.log('\nT3 — flows(): rozbicie gry × CIV_TIME_SCALE = stawki na game-year (HARD #3)');
{
  const home = mkHome({ breakdown: { Fe: { prod: 10, cons: 4, net: -4 } }, amounts: { Fe: 500 } });
  const f = ResourceTelemetry.flows(home.resourceSystem, 'Fe');
  assert(CIV_PER_GY === 12, 'CIV_PER_GY = 12 (z GameConfig, nie hardkod)');
  assert(f.prodPerGy === 120 && f.consPerGy === 48, `prod 10/civ-yr → 120/gy, cons 4 → 48 (było ${f.prodPerGy}/${f.consPerGy})`);
  assert(f.stock === 500 && f.netRegPerGy === -48, 'stan magazynu i netto rejestru przeniesione');
  assert(ResourceTelemetry.flows(null, 'Fe').prodPerGy === 0, 'brak systemu → zera (bezpiecznie)');
}

// ── T4: snapshot() — delta, reszta bilansu, flaga wady pomiaru ────
console.log('\nT4 — snapshot(): delta rok-do-roku + reszta bilansu + wykrycie zerowanej konsumpcji POP');
{
  const mk = (feStock, popCons) => ({
    home: mkHome({ amounts: { Fe: feStock }, popCons, afford: () => true,
      breakdown: { Fe: { prod: 10, cons: 4, net: 6 } } }),
    colonyManager: { _activePlanetId: 'home', getPlayerColonies: () => [{ isOutpost: false }] },
  });
  const tel = new ResourceTelemetry();
  const r0 = tel.sample(0, mk(1000, { food: -5 }));
  assert(r0.res.Fe.delta === 0 && r0.res.Fe.unaccOut === 0, 'próbka 0: brak historii → delta i reszta = 0');
  assert(r0.activeIsHome === true, 'flaga activeIsHome (rozbicie gry dotyczy tej samej kolonii)');
  assert(r0.popConsumptionZeroed === false, 'konsumpcja POP zarejestrowana → brak flagi wady');

  // rok 1: magazyn +12 przy (prod−cons) = 72/gy → 60 „zniknęło" (wydatki jednorazowe)
  const r1 = tel.sample(1, mk(1012, { food: -5 }));
  assert(r1.res.Fe.delta === 12, `delta = realna zmiana magazynu (12), było ${r1.res.Fe.delta}`);
  assert(Math.abs(r1.res.Fe.unaccOut - 60) < 1e-6, `reszta bilansu = (prod−cons) − delta = 60, było ${r1.res.Fe.unaccOut}`);
  assert(tel.getSeries().length === 2, 'seria zebrała 2 wiersze');

  // wada pomiaru: producent konsumpcji wyzerowany mimo populacji > 0
  const zeroed = ResourceTelemetry.snapshot(2, mk(1000, { food: -0, water: -0, energy: -0 }));
  assert(zeroed.popConsumptionZeroed === true, 'konsumpcja POP = 0 przy pop > 0 → flaga wady pomiaru');
  const missing = ResourceTelemetry.snapshot(2, mk(1000, null));
  assert(missing.popConsumptionZeroed === true, 'brak producenta konsumpcji przy pop > 0 → też flaga');

  // stan „stalled" + top bloker (żywa gospodarka: Fe płynie, ale na nic nie stać)
  const stalled = ResourceTelemetry.snapshot(3, {
    home: mkHome({ afford: () => false, amounts: { Fe: 5 }, breakdown: { Fe: { prod: 10, cons: 4, net: 6 } } }),
    colonyManager: { _activePlanetId: 'home' },
  });
  assert(stalled.stalled === true && stalled.affordableCount === 0, 'nic nie jest osiągalne → stalled=true');
  assert(typeof stalled.topBlocker === 'string' && stalled.topBlockerCount > 0, `top bloker wyliczony (${stalled.topBlocker})`);
  assert(stalled.binding.length > 0, 'przy zatrzymanej gospodarce co najmniej jeden zasób ma stan BINDING');
}

// ── T5: podsumowania (czyste) ─────────────────────────────────────
console.log('\nT5 — summarizeSeed / aggregatePanel / panelVerdict');
{
  const mkRow = (gy, feState, stalled, extra = {}) => ({
    gy, stalled, pop: 30, colonies: 1, brownout: false, energyAvail: 1,
    topBlocker: 'Fe', blockedBuilds: { Fe: 3 }, popConsumptionZeroed: false,
    res: Object.fromEntries(RESOURCE_IDS.map(id => [id, {
      state: id === 'Fe' ? feState : RES_STATE.OK, stock: id === 'Fe' ? 5 : 100,
      prod: 10, cons: 5, blockedBuilds: id === 'Fe' ? 3 : 0, cover: 2,
    }])), ...extra,
  });
  const series = [mkRow(0, RES_STATE.OK, false), mkRow(1, RES_STATE.TIGHT, false),
    mkRow(2, RES_STATE.BINDING, true), mkRow(3, RES_STATE.BINDING, true, { popConsumptionZeroed: true })];
  const s = summarizeSeed(series);
  assert(s.years === 3, 'gy0 (baseline) nie wchodzi do statystyk — liczone lata gy≥1');
  assert(s.byRes.Fe.binding === 2 && s.byRes.Fe.tight === 1, 'zliczone stany per zasób');
  assert(s.byRes.Fe.firstBindGy === 2, 'pierwszy rok wiązania zapamiętany (gy2)');
  assert(s.stalledYears === 2 && s.firstStallGy === 2, 'lata zatrzymanej gospodarki + pierwszy rok');
  assert(s.popConsZeroedFromGy === 3, 'pierwszy rok wady pomiaru zapamiętany');
  // stawki w wierszu są JUŻ w jednostkach game-year (przelicza je sampler) — średnia ich nie skaluje
  assert(s.byRes.Fe.meanProd === 10 && s.byRes.Fe.blockedYears === 3, 'średnie stawki i lata blokowania');
  assert(s.topBlockerYears.Fe === 3, 'lata w roli głównego blokera');

  const agg = aggregatePanel([s, s]);
  assert(agg.byRes.Fe.bindingYears === 4 && agg.byRes.Fe.seedsBinding === 2, 'agregat sumuje lata i seedy');
  assert(agg.byRes.Fe.earliestBindGy === 2, 'najwcześniejszy rok wiązania w panelu');
  assert(agg.seedsStalled === 2 && agg.seedsPopConsZeroed === 2, 'agregat liczy seedy zatrzymane i z wadą pomiaru');
  assert(agg.byRes.Fe.keepsUp === true && agg.byRes.food.meanCons === 5, 'średnie prod/cons + flaga „nadąża"');

  const v = panelVerdict(agg);
  assert(v.outcome === 1 && v.binder === 'Fe' && v.share === 1, 'jeden dominujący zasób → outcome 1 (SINGLE)');
  assert(panelVerdict({ byRes: {} }).outcome === 0, 'brak wiązań → outcome 0 (NO BINDING)');
  const mixed = aggregatePanel([s]);
  mixed.byRes.Ti.bindingYears = 2; mixed.byRes.Si.bindingYears = 2;
  assert(panelVerdict(mixed).outcome === 2, 'rozproszone wiązania → outcome 2 (MIXED)');
}

// ── T6: realny boot przez WSPÓLNY driver (guard dryfu API) ────────
console.log('\nT6 — realny GameCore boot przez balans-driver + sample (guard dryfu API)');
{
  const tel = new ResourceTelemetry();
  const r = runOneGame({ seed: 'balans-resource-keeper', planetClass: 'GOOD_FE', targetGy: 3, telemetry: tel });
  assert(!r.crashed, 'boot + 3 gy ticków bez crasha');
  const series = r.series;
  assert(series.length >= 4, `szereg ma próbkę na każdy game-rok (${series.length} ≥ 4: gy0..gy3)`);
  assert(series[0].gy === 0 && series[series.length - 1].gy === 3, 'próbki od gy0 do gy3 (oś w GAME-LATACH)');

  const last = series[series.length - 1];
  assert(last.activeIsHome === true, 'aktywna kolonia = macierzysta (rozbicie gry dotyczy tej kolonii)');
  assert(RESOURCE_IDS.every(id => last.res[id] && typeof last.res[id].stock === 'number'),
    'każdy zasób z listy gry ma komplet pól');
  assert(RESOURCE_IDS.every(id => Object.values(RES_STATE).includes(last.res[id].state)),
    'stany z dozwolonego zbioru');
  assert(last.res.Fe.prod > 0, `kopalnie realnie produkują Fe (${last.res.Fe.prod}/gy — rozbicie gry żyje)`);
  assert(last.res.food.cons > 0, `POP realnie je (food ${last.res.food.cons}/gy)`);
  assert(last.affordableCount + last.blockedCount > 0, 'skan budowy widzi realne budynki (tech + kafle)');
  assert(last.res.energy.kind === 'flow' && last.res.research.kind === 'accumulator',
    'rodzaje zasobów przeniesione do wiersza (raport rozgałęzia się po nich)');
  // Self-consistency: delta magazynu Fe zgodna z różnicą stanów między próbkami.
  const prev = series[series.length - 2];
  assert(Math.abs(last.res.Fe.delta - (last.res.Fe.stock - prev.res.Fe.stock)) < 0.2,
    'delta Fe == realna różnica stanów magazynu między próbkami (wątek prev)');
  assert(Object.keys(RESOURCE_TELEMETRY_DEFAULTS).length === 6, 'komplet knobów pomiaru wystawiony w meta');
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
