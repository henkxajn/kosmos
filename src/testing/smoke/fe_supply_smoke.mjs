// 178 — PODAZ Fe. Plan + decyzje D-Fe-1/2: docs/design/FE_SUPPLY_PLAN.md.
//   STAN: FAIL-FIRST (keeper przed naprawa). Os glowna NIEWYBRANA — rozstrzyga tabela R1/R2/R3.
//
// PO CO: `EmpireLogisticsSystem._loadByRarity` laduje malejaco po RZADKOSCI i bez capa
//   (`loadCargo(v, id, avail, rs)` bierze CALA dostepna ilosc). `Fe` ma rarity 1, wiec jest
//   OSTATNIE, a `Xe` wazy 0,1 — jeden lekki, obfity surowiec zjada 100% ladowni. ZMIERZONE:
//   Fe/kurs = 0 na KAZDYM realistycznym outposcie ⇒ wiecej kurierow nie pomoze (N x 0 = 0),
//   rosnie tylko hoard Xe (koniec Findingu 180).
//
// ⚠ DWA „OCZYWISTE" WARIANTY PADLY W POMIARZE i T2/T3 pinuja wlasnie to:
//   cap per surowiec        -> Fe 0 (ladownia zapelnia sie na 7 rzadszych, zanim dojdzie do Fe)
//   rezerwacja dla pospolitych -> Fe 0 (w pasmie rarity<=2 Fe jest NADAL ostatnie; C/Si/Cu zjadaja
//                                 zarezerwowana polowe) ⇒ W3 zapada sie w W4
//   Bez tych pinow ktos „uprosci" W4 do capa i defekt wroci.
//
//   T1  FAIL-FIRST: dzisiejsze ladowanie wozi Fe 0 (+ kontrola NIEJALOWOSCI)
//   T2  cap sam nie wystarcza          (zielony dzis, ma zostac)
//   T3  rezerwacja pasma nie wystarcza (zielony dzis, ma zostac)
//   T4  D-Fe-1: UNIA (stalle ∪ luki rud zlecen) wozi Fe takze gdy fabryka NIE stoi
//   T5  223: kolonia AI w ukladzie niezwiedzonym wypada z tradingColonies (+ kontrola)
//   T6  224: `_getConsumption` nie widzi poboru receptur (+ kontrola)
//   T7  brak regresji 180: nadwyzka Xe nie rosnie wzgledem W1

import '../headless/env.js';           // MUSI byc pierwszy
import { EmpireLogisticsSystem } from '../../systems/EmpireLogisticsSystem.js';
import { CivilianTradeSystem } from '../../systems/CivilianTradeSystem.js';
import { FactorySystem } from '../../systems/FactorySystem.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { MINED_RESOURCES } from '../../data/ResourcesData.js';
import { TRADEABLE_GOODS } from '../../data/TradeValuesData.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import { loadCargo } from '../../entities/Vessel.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const BY_RARITY = Object.keys(MINED_RESOURCES)
  .sort((a, b) => (MINED_RESOURCES[b].rarity ?? 0) - (MINED_RESOURCES[a].rarity ?? 0));

const OUTPOSTS = {
  xe:    { Xe: 4000, Nt: 0,   Hv: 300, Ti: 900, Cu: 900, Si: 900, Li: 200, Fe: 3000, C: 1500 },
  nt:    { Xe: 200,  Nt: 400, Hv: 500, Ti: 600, Cu: 600, Si: 600, Li: 150, Fe: 2500, C: 1200 },
  ubogi: { Xe: 40,   Nt: 0,   Hv: 60,  Ti: 400, Cu: 400, Si: 400, Li: 90,  Fe: 2000, C: 900  },
};
const mkOutpost = (stock) => { const inv = new Map(Object.entries(stock));
  return { inventory: inv, getAmount: id => inv.get(id) ?? 0,
    spend: c => { for (const [k, v] of Object.entries(c)) inv.set(k, (inv.get(k) ?? 0) - v); return true; },
    canAfford: c => Object.entries(c).every(([k, v]) => (inv.get(k) ?? 0) >= v) }; };
const mkCourier = () => ({ id: 'v_9', cargo: {}, cargoUsed: 0, cargoMax: 200 });
const els = new EmpireLogisticsSystem();

/** Stolica z REALNYM popytem: stall fabryki na Fe 40 + zlecenie okretowe na Fe 100. */
function mkCapital({ stall = 40, shipFe = 0, feStock = 0 } = {}) {
  return {
    planetId: 'entity_185',
    resourceSystem: { getAmount: (id) => (id === 'Fe' ? feStock : 0) },
    factorySystem: { getAllocations: () => (stall > 0
      ? [{ commodityId: 'structural_alloys', points: 0, paused: true,
           stallReason: { kind: 'missing_ingredient', missing: [{ resId: 'Fe', need: stall, have: feStock }] } }]
      : []) },
    pendingShipOrders: shipFe > 0 ? [{ id: 'pso_1', cost: { Fe: shipFe, Ti: 130 } }] : [],
  };
}

/** W2 — cap 1/3 ladowni na surowiec, kolejnosc dalej wg rzadkosci. */
function loadCapped(v, rs, capFrac = 1 / 3) {
  const cap = v.cargoMax * capFrac;
  for (const id of BY_RARITY) {
    if (v.cargoUsed >= v.cargoMax - 1e-6) break;
    const w = MINED_RESOURCES[id].weight ?? 1;
    const a = Math.min(rs.getAmount(id), Math.floor(cap / w));
    if (a > 0) loadCargo(v, id, a, rs);
  }
}
/** W4 — najpierw POPYT (lista potrzeb), reszta wg rzadkosci z capem. */
function loadByNeed(v, rs, need) {
  const cap = v.cargoMax * 0.6;
  for (const [id, qty] of Object.entries(need)) {
    const w = MINED_RESOURCES[id]?.weight ?? 1;
    const room = Math.floor(Math.min(cap, v.cargoMax - v.cargoUsed) / w);
    const a = Math.min(rs.getAmount(id), qty, room);
    if (a > 0) loadCargo(v, id, a, rs);
  }
  loadCapped(v, rs);
}

// ── T1 — FAIL-FIRST: dzisiejsze ladowanie wozi Fe 0 ────────────────────────────────────────
console.log('T1 — FAIL-FIRST: kurier ma przywozic Fe, gdy stolica na nie stoi');
{
  const wyniki = {};
  for (const [nazwa, stock] of Object.entries(OUTPOSTS)) {
    const rs = mkOutpost(stock), v = mkCourier();
    els._loadByRarity(v, rs, mkCapital({ stall: 40 }));   // sciezka PRODUKCYJNA (R1)
    wyniki[nazwa] = { fe: v.cargo.Fe ?? 0, xe: v.cargo.Xe ?? 0, uzyte: v.cargoUsed, max: v.cargoMax,
                      feNaSkladzie: stock.Fe };
  }
  // KONTROLA NIEJALOWOSCI — bez tego „Fe 0" znaczyloby „pusty outpost" albo „kurier nie ladowal".
  assert(Object.values(wyniki).every(w => w.feNaSkladzie >= 2000),
    'T1k NIEJALOWOSC: KAZDY outpost ma na skladzie >= 2000 Fe');
  assert(Object.values(wyniki).every(w => w.uzyte >= w.max - 1),
    'T1k NIEJALOWOSC: ladownia zapelnia sie DO PELNA w kazdym przypadku (kurier ladowal)');

  assert(Object.values(wyniki).every(w => w.fe > 0),
    'T1a: kurier przywozi Fe > 0 z KAZDEGO outpostu — ' +
    Object.entries(wyniki).map(([n, w]) => `${n}: ${w.fe.toFixed(0)}`).join(', '));
  assert((wyniki.xe.fe ?? 0) >= 40,
    `T1b: z outpostu Xe kurier przywozi >= 40 Fe (jest ${wyniki.xe.fe.toFixed(0)}) — tyle zjada ` +
    'jedna sztuka structural_alloys przy skalowaniu x5');
}

// ── T2 — cap SAM w sobie nie wystarcza (zielony dzis, MA zostac) ───────────────────────────
console.log('\nT2 — cap per surowiec NIE naprawia problemu (pin przeciw naprawie pozornej)');
{
  const rs = mkOutpost(OUTPOSTS.xe), v = mkCourier();
  loadCapped(v, rs);
  assert((v.cargo.Fe ?? 0) === 0,
    `T2: przy capie 1/3 Fe dalej wynosi 0 (Xe ${(v.cargo.Xe ?? 0).toFixed(0)}) — ladownia zapelnia ` +
    'sie na SIEDMIU rzadszych rudach, zanim dojdzie do Fe. NIE „upraszczac" W4 do capa.');
  assert(v.cargoUsed >= v.cargoMax - 1,
    'T2k KONTROLA: ladownia mimo capa nadal PELNA — inaczej „Fe 0" wynikaloby z niedoladowania');
}

// ── T3 — rezerwacja pasma „pospolitych" tez nie wystarcza (zielony dzis, MA zostac) ────────
console.log('\nT3 — rezerwacja 1/2 ladowni dla rud POSPOLITYCH tez nie wystarcza');
{
  const rs = mkOutpost(OUTPOSTS.xe), v = mkCourier();
  const half = v.cargoMax / 2;
  for (const id of BY_RARITY.filter(i => (MINED_RESOURCES[i].rarity ?? 0) <= 2)) {
    if (v.cargoUsed >= half - 1e-6) break;
    const w = MINED_RESOURCES[id].weight ?? 1;
    const a = Math.min(rs.getAmount(id), Math.floor((half - v.cargoUsed) / w));
    if (a > 0) loadCargo(v, id, a, rs);
  }
  els._loadByRarity(v, rs);
  const pospolite = BY_RARITY.filter(i => (MINED_RESOURCES[i].rarity ?? 0) <= 2);
  assert(pospolite[pospolite.length - 1] === 'Fe',
    `T3k KONTROLA: Fe jest OSTATNIE takze w pasmie pospolitych (${pospolite.join(' > ')}) — ` +
    'to jest powod, dla ktorego rezerwacja pasma nie pomaga');
  assert((v.cargo.Fe ?? 0) === 0,
    `T3: mimo zarezerwowanej polowy ladowni Fe dalej wynosi 0 — C/Si/Cu zjadaja rezerwe. ` +
    'W3 naprawia sie dopiero przez uporzadkowanie pasma WG POTRZEBY, czyli zapada sie w W4.');
}

// ── T4 — D-Fe-1: UNIA (stalle ∪ luki rud zlecen) ───────────────────────────────────────────
console.log('\nT4 — D-Fe-1: zrodlem popytu jest UNIA, bo same stalle NIGDY nie woza dla stoczni');
{
  // Koszt RUDOWY fregaty eskortowej = kadlub + moduly szablonu (koszt STOCZNI, nie receptura).
  const mods = ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'];
  const koszt = { ...(HULLS.hull_frigate?.cost ?? {}) };
  for (const m of mods) for (const [k, v] of Object.entries(SHIP_MODULES[m]?.cost ?? {})) koszt[k] = (koszt[k] ?? 0) + v;
  assert((koszt.Fe ?? 0) >= 100,
    `T4k NIEJALOWOSC: fregata kosztuje ${koszt.Fe ?? 0} Fe (kadlub+moduly) — jest po co wozic`);

  // Scenariusz rozstrzygajacy: fabryka NIE stoi (brak stalli), ale czeka zlecenie okretowe.
  const stalle = {};                                   // pusta lista stalli
  const lukiZlecen = { Fe: koszt.Fe ?? 0 };            // z pendingShipOrders[].cost
  const unia = { ...stalle };
  for (const [k, v] of Object.entries(lukiZlecen)) unia[k] = (unia[k] ?? 0) + v;

  // KONTROLE (zielone po OBU stronach) — mierza SAMA ROZNICE miedzy zrodlami popytu,
  // na keeperowych helperach. To jest pin PROJEKTU, nie zachowania gry.
  const a = mkCourier(); loadByNeed(a, mkOutpost(OUTPOSTS.xe), stalle);
  const b = mkCourier(); loadByNeed(b, mkOutpost(OUTPOSTS.xe), unia);
  assert((a.cargo.Fe ?? 0) === 0,
    'T4k KONTROLA (projekt): przy SAMYCH stallach i pustej liscie stalli kurier wozi Fe 0 — koszt ' +
    'stoczni NIE JEST receptura, wiec na liscie stalli nie pojawia sie NIGDY');
  assert((b.cargo.Fe ?? 0) > 0,
    `T4k KONTROLA (projekt): UNIA wozi Fe (${(b.cargo.Fe ?? 0).toFixed(0)}) w tym samym scenariuszu`);

  // ⚠ FAIL-FIRST NA KODZIE GRY. Powyzsze dwie asercje przechodza na MOICH helperach i przeszlyby
  //   takze wtedy, gdyby gra nigdy nie dostala ladowania sterowanego popytem. Pin musi pytac
  //   o PRODUKCYJNY loader, inaczej jest zielony dokladnie tam, gdzie jest defekt.
  // ⚠ PIN ZACHOWANIOWY, nie sygnaturowy — i to jest korekta mojego wlasnego pina. Pierwsza
  //   wersja sprawdzala `els._loadByRarity.length >= 3`, ale `Function.length` NIE LICZY
  //   parametrow z wartoscia domyslna (`capital = null` daje arity 2). Pin padalby na
  //   POPRAWNEJ implementacji, ktora zachowuje zgodnosc wsteczna. Pytamy wiec o SKUTEK:
  //   ten sam kurier i ten sam outpost, raz BEZ stolicy, raz Z NIA.
  const bezStolicy = mkCourier(); els._loadByRarity(bezStolicy, mkOutpost(OUTPOSTS.xe));
  const zeStolica  = mkCourier(); els._loadByRarity(zeStolica, mkOutpost(OUTPOSTS.xe), mkCapital({ stall: 40 }));
  const maPopyt = (zeStolica.cargo.Fe ?? 0) > (bezStolicy.cargo.Fe ?? 0);
  assert(maPopyt,
    'T4a: PRODUKCYJNY loader REAGUJE na popyt stolicy — ten sam kurier bierze wiecej Fe, gdy dostanie ' +
    `stolice (bez: ${(bezStolicy.cargo.Fe ?? 0).toFixed(0)}, ze: ${(zeStolica.cargo.Fe ?? 0).toFixed(0)})`);

  if (maPopyt) {
    const c = mkCourier();
    // ⚠ Scenariusz ROZSTRZYGAJACY: fabryka NIE STOI (zero stalli), czeka WYLACZNIE zlecenie
    //   okretowe. Przy samych stallach kurier nie zaladowalby tu ANI JEDNEJ jednostki Fe.
    els._loadByRarity(c, mkOutpost(OUTPOSTS.xe), mkCapital({ stall: 0, shipFe: koszt.Fe ?? 100 }));
    assert((c.cargo.Fe ?? 0) > 0,
      `T4b: produkcyjny loader z UNIA wozi Fe (${(c.cargo.Fe ?? 0).toFixed(0)}) w scenariuszu ` +
      '„fabryka nie stoi, czeka zlecenie okretowe"');
  } else {
    assert(false, 'T4b: (pominiete — brak produkcyjnego loadera sterowanego popytem)');
  }
}

// ── T5 — 223: handel wewnetrzny AI bramkowany mgla wojny GRACZA ────────────────────────────
console.log('\nT5 — 223: kolonie AI wypadaja z tradingColonies, gdy gracz nie zwiedzil ich ukladu');
{
  const mkCol = (id, fe) => { const inv = new Map(Object.entries({ Fe: fe, C: 200 }));
    return { planetId: id, name: id, ownerEmpireId: 'emp_002', systemId: 'sys_057', isOutpost: false,
      tradeOverrides: {}, credits: 500,
      resourceSystem: { inventory: inv, getAmount: k => inv.get(k) ?? 0, _producers: new Map(),
        _inventoryPerYear: new Map([['Fe', fe > 500 ? 20 : -70]]),
        getPerYear: k => (k === 'Fe' ? (fe > 500 ? 20 : -70) : 0),
        receive: () => {}, spend: () => true },
      buildingSystem: { _active: new Map(), getPendingDemand: () => ({}) },
      factorySystem: { _everProducedHere: new Set() },
      civSystem: { population: 20 }, prosperitySystem: { prosperity: 50 }, pendingShipOrders: [] }; };
  const cols = [mkCol('entity_185', 4), mkCol('entity_186', 3000), mkCol('entity_187', 3000)];
  const cts = new CivilianTradeSystem({ getAllColonies: () => cols, getColony: id => cols.find(c => c.planetId === id) });
  cts._hasSpaceport = () => true;

  cts._getDistance = () => 5;                 // ten sam uklad, w zasiegu bazowym 10 AU
  // ⚠ PRZEZ PRODUKCYJNY TICK, nie przez odtworzony filtr — inaczej pin mierzylby moja
  //   wyobraznie o bramce, a nie bramke.
  const policz = (explored) => {
    globalThis.window.KOSMOS = {
      galaxyData: { systems: [{ id: 'sys_057', explored }] },
      diplomacySystem: { hasTradeAgreement: () => false },
      colonyManager: { getAllColonies: () => cols },
      gameConfig: GAME_CONFIG,
    };
    cts._connections = [];
    cts._halfYearlyTick();
    return cts._connections.length;
  };
  assert(TRADEABLE_GOODS.includes('Fe'),
    'T5k KONTROLA: `Fe` JEST towarem handlowym — kanal umialby wozic rude, wiec bramka jest ' +
    'jedynym powodem, dla ktorego nie wozi');
  assert(policz(true) >= 1,
    `T5k KONTROLA: przy ZWIEDZONYM ukladzie polaczenia POWSTAJA (${policz(true)}) — pin ma z czym porownywac`);
  assert(policz(false) >= 1,
    `T5: przy NIEzwiedzonym ukladzie kolonie TEGO SAMEGO imperium NADAL handluja ze soba ` +
    `(polaczen: ${policz(false)}) — mgla wojny GRACZA nie bramkuje wewnetrznej logistyki AI`);
}

// ── T6 — 224: `_getConsumption` nie widzi poboru receptur ──────────────────────────────────
console.log('\nT6 — 224: deficyt stolicy zanizony, bo pobor FABRYKI nie jest zarejestrowanym producentem');
{
  const cts = new CivilianTradeSystem({ getAllColonies: () => [], getColony: () => null });
  // (a) stolica, ktora ZUZYWA Fe wylacznie przez fabryke (bezposredni zapis do inventory)
  // ⚠ REALNY `FactorySystem` z ZYWA alokacja — atrapa zwracajaca stala stawke przechodzilaby
  //   trywialnie i nie dowodzilaby, ze pochodna liczy sie z `timePerUnit` silnika.
  const invF = new Map(Object.entries({ Fe: 4, C: 500 }));
  const rsF = { inventory: invF, _inventoryPerYear: new Map(), _producers: new Map(),
    getAmount: (k) => invF.get(k) ?? 0, getEnergyAvailability: () => 1.0 };
  const fsF = new FactorySystem(rsF);
  const colF = { planetId: 'entity_185', ownerEmpireId: 'emp_002', factorySystem: fsF, resourceSystem: rsF,
    buildingSystem: { techSystem: { isResearched: () => true, isCommodityUnlocked: () => true, getFactorySpeedMultiplier: () => 1 } },
    pendingShipOrders: [], shipQueues: [] };
  globalThis.window.KOSMOS = { colonyManager: { getAllColonies: () => [colF], getColony: () => colF, activePlanetId: null },
    scenario: 'civilization', gameConfig: GAME_CONFIG };
  fsF.setTotalPoints(5);
  fsF._allocations.set('structural_alloys', { points: 5, progress: 0, targetQty: 100, produced: 0 });
  const fabryczna = colF;
  assert(fsF.getIngredientDrawPerYear('Fe') > 0,
    `T6k KONTROLA: pochodna stawka poboru Fe liczy sie z timePerUnit silnika ` +
    `(${fsF.getIngredientDrawPerYear('Fe').toFixed(1)}/civY) — nie ze stalej w atrapie`);
  // (b) kontrola: ten sam pobor, ale ZAREJESTROWANY jako producent z ujemna stawka
  const zarejestrowana = { planetId: 'entity_185',
    resourceSystem: { _producers: new Map([['budynek_x', { Fe: -70 }]]),
      inventory: new Map([['Fe', 4]]), getAmount: () => 4 } };

  assert(cts._getConsumption('Fe', zarejestrowana) === 70,
    'T6k KONTROLA: zarejestrowanego konsumenta `_getConsumption` WIDZI (70) — pin nie jest jalowy');
  assert(cts._getConsumption('Fe', fabryczna) > 0,
    `T6: pobor Fe przez FABRYKE jest widoczny dla \`_getConsumption\` (jest ` +
    `${cts._getConsumption('Fe', fabryczna)}) — inaczej \`_deficitScore\` zanizy potrzebe stolicy ` +
    'i routing wysle za malo i za pozno');
}

// ── T7 — brak regresji 180: hoard Xe nie rosnie ────────────────────────────────────────────
console.log('\nT7 — brak regresji 180: naprawa Fe nie moze zwiekszyc nadwyzki rud rzadkich');
{
  const w1 = mkCourier(); els._loadByRarity(w1, mkOutpost(OUTPOSTS.xe));
  const w4 = mkCourier(); loadByNeed(w4, mkOutpost(OUTPOSTS.xe), { Fe: 40 });
  assert((w1.cargo.Xe ?? 0) > 0,
    `T7k KONTROLA: W1 realnie wozi Xe (${(w1.cargo.Xe ?? 0).toFixed(0)}) — jest z czym porownywac`);
  assert((w4.cargo.Xe ?? 0) <= (w1.cargo.Xe ?? 0),
    `T7: W4 nie wozi WIECEJ Xe niz W1 (W4 ${(w4.cargo.Xe ?? 0).toFixed(0)} vs W1 ` +
    `${(w1.cargo.Xe ?? 0).toFixed(0)}) — inaczej naprawa Fe pogorszylaby 180`);
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
