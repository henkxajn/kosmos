// 217 — KANAL POPYTU ZAMOWIENIOWEGO. Plan + decyzje D-217-1..5:
//   docs/design/AI_ORDER_DEMAND_PLAN.md.  STAN: COMMIT 1 z dwoch — FAIL-FIRST (keeper przed naprawa).
//
// PO CO: `_demandBonus` ma DWOCH pisarzy i JEDNEGO integera bez proweniencji.
//   • `ColonyAutoExpander._syncTier3SafetyDemand:653` pisze ABSOLUTNIE:
//       setDemandBonus(cid, rich ? target-1 : 0),  rich = [Fe,Si,Cu,C].every(>= 20000)
//   • `DirectorProduction._feedCommodityDemand:313` pisze PRZYROSTOWO: setDemandBonus(id, cur + gap)
//   Bramka `rich` jest ZAMKNIETA Z PROJEKTU (d44af5e, panel 16 seedow) — defekt jest KOMPOZYCYJNY:
//   F3 dopisal `warp_cores`/`antimatter_cells` do listy objetej ta bramka, nie mierzac kompozycji.
//   Skutek ZMIERZONY (GATE-215-gy30): 25 FP bezczynnych, komplet surowcow, ZERO alokacji lancucha warp.
//
// ⚠ TO NIE JEST TEST BRAMKI `rich` — ona zostaje nietknieta (D-217-1, poza zakresem → rodzina 182).
//   Naprawa = Director dostaje WLASNY czlon addytywny (ksiega per zlecenie), ekspander zachowuje pole.
//
//   T1  FAIL-FIRST: lancuch warp NIE dostaje alokacji mimo surowcow i wolnych FP (+ kontrola niejalowosci)
//   T2  INWARIANCJA: zerowanie `_demandBonus` przez ekspandera bit-w-bit dzisiejsze (pin POLA, nie skutku)
//   T3  PROMIEN RAZENIA + NIEJALOWOSC: pozostala piatka tier-3+ bez alokacji, PRZECIW lustru V-RICH
//   T4  Kolonie GRACZA nieosiagalne dla obu pisarzy (selektor, nie wewnetrzny guard)
//   T5  KSIEGA: czysci sie na realizacji (a) i na wygasnieciu TTL (b); dwa zlecenia bez resztki (c)
//   T6  kill-switch `aiOrderDemandChannel` — OFF przywraca dzisiejsze zachowanie

import '../headless/env.js';           // MUSI byc pierwszy
import { FactorySystem } from '../../systems/FactorySystem.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { ARCHETYPES } from '../../data/EmpireData.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DirectorProduction } from '../../systems/director/DirectorProduction.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── Fixture GATE-215-gy30: komplet surowcow lancucha, 25 FP, boosted, avail 0.42 ──
const STOCK = {
  Si: 18580, Nt: 214, Hv: 6002, Xe: 4831, Ti: 8174, Li: 589, Fe: 20, Cu: 13489, C: 500,
  quantum_cores: 1, antimatter_cells: 1, warp_cores: 1, propulsion_systems: 5, structural_alloys: 1,
  plasma_cores: 0, quantum_processors: 0, semiconductor_arrays: 0, metamaterials: 0,
};
const T3 = Object.entries(ARCHETYPES.industrialist.startingSafetyStocks)
  .filter(([cid]) => (COMMODITIES[cid]?.tier ?? 0) >= 3);
const OTHER_FIVE = ['plasma_cores', 'quantum_processors', 'semiconductor_arrays', 'propulsion_systems', 'metamaterials'];

function mkFactory({ owner = 'emp_002' } = {}) {
  const inv = new Map(Object.entries(STOCK));
  const rs = {
    inventory: inv,
    _inventoryPerYear: new Map(Object.entries({ Si: 5, Nt: 2, Hv: 5, Xe: 5, Ti: 5, Li: 2, Fe: 5, Cu: 5, C: 5 })),
    getAmount: (id) => inv.get(id) ?? 0,
    getEnergyAvailability: () => 0.42,
  };
  const fs = new FactorySystem(rs);
  const colony = {
    planetId: 'entity_185', ownerEmpireId: owner, factorySystem: fs, resourceSystem: rs,
    buildingSystem: { techSystem: { isResearched: () => true, isCommodityUnlocked: () => true, getFactorySpeedMultiplier: () => 1 } },
    pendingShipOrders: [], shipQueues: [], fleet: [],
  };
  globalThis.window.KOSMOS = {
    colonyManager: { getAllColonies: () => [colony], getColony: () => colony, activePlanetId: null },
    scenario: 'civilization_boosted',
    gameConfig: GAME_CONFIG,      // lustro `GameScene:394` — tym uchwytem czyta flage FactorySystem
  };
  fs.setTotalPoints(25);
  fs.setMode('reactive');
  fs.setDemandBonus('structural_alloys', 27);   // popyt budowlany (tier 1 — poza bramka `rich`)
  return { fs, rs, colony, inv };
}

/**
 * PRODUKCYJNA sciezka zapisu popytu: prawdziwy `DirectorProduction._feedCommodityDemand`.
 * ⚠ Swiadomie NIE modelujemy tego zapisu recznie — pin ma sprawdzac WPIECIE, nie moja
 *   wyobraznie o nim. Zwraca zlecenie dopisane do `colony.pendingShipOrders`.
 */
function directorOrders(colony, { id = 'pso_1', cost = { warp_cores: 2, Ti: 8 } } = {}) {
  const order = { id, shipId: 'hull_frigate', cost, queuedAt: 20, directorTemplateId: 'frigate_laser_escort' };
  colony.pendingShipOrders.push(order);
  new DirectorProduction()._feedCommodityDemand(colony, order, colony.ownerEmpireId);
  return order;
}

/** Odwzorowuje `_syncTier3SafetyDemand` przy `rich === false` — ekspander zeruje cele tier-3+. */
const expanderZeroes = (fs) => { for (const [cid] of T3) fs.setDemandBonus(cid, 0); };

/** Uruchamia produkcyjny planista + konsolidacje i zwraca mape alokacji z FP. */
function plan(fs) {
  fs._reactiveAllocate();
  fs._autoConsolidate();
  const out = new Map();
  for (const [cid, a] of fs._allocations) out.set(cid, a.points);
  return out;
}

// ── T1 — FAIL-FIRST: brak alokacji lancucha warp przy komplecie surowcow ─────────────────────
console.log('T1 — FAIL-FIRST: popyt zamowieniowy Directora ma przezyc tik ekspandera');
{
  const { fs, colony } = mkFactory();
  // Director sygnalizuje brak warp_cores PRODUKCYJNA sciezka...
  directorOrders(colony);
  // ...a ekspander przy nastepnym tiku zeruje cale tier-3+.
  expanderZeroes(fs);
  const alloc = plan(fs);

  // KONTROLA NIEJALOWOSCI: surowce SA, FP SA, receptury odblokowane — inaczej T1 mierzylby
  // brak surowca zamiast braku popytu.
  assert(fs._hasIngredients(COMMODITIES.quantum_cores.recipe, 'quantum_cores')
      && fs._hasIngredients(COMMODITIES.antimatter_cells.recipe, 'antimatter_cells'),
    'T1k NIEJALOWOSC: skladniki obu polproduktow SA w magazynie (`_hasIngredients` = true)');
  assert(fs.totalPoints === 25 && fs.isRecipeAvailable('warp_cores'),
    'T1k NIEJALOWOSC: 25 FP i receptura `warp_cores` odblokowana');

  assert(alloc.has('quantum_cores') && alloc.has('antimatter_cells'),
    'T1a: lancuch warp DOSTAJE alokacje mimo zerowania `_demandBonus` przez ekspandera ' +
    `(alokacje: ${[...alloc.keys()].join(', ') || 'BRAK'})`);
  assert((alloc.get('quantum_cores') ?? 0) + (alloc.get('antimatter_cells') ?? 0) > 0,
    'T1b: polprodukty dostaja REALNE FP, nie zerowa alokacje-widmo');
  assert(fs.usedPoints > 0,
    `T1c: FP ida do pracy zamiast stac bezczynnie (used ${fs.usedPoints}/${fs.totalPoints})`);
}

// ── T2 — INWARIANCJA: pinujemy POLE ekspandera, nie skutek ──────────────────────────────────
console.log('\nT2 — INWARIANCJA: zerowanie `_demandBonus` przez ekspandera bit-w-bit dzisiejsze');
{
  const { fs, colony } = mkFactory();
  directorOrders(colony);
  expanderZeroes(fs);
  const zeroed = T3.every(([cid]) => fs.getDemandBonus(cid) === 0);
  assert(zeroed,
    'T2a: po przejsciu ekspandera WSZYSTKIE osiem celow tier-3+ ma `getDemandBonus` = 0 — ' +
    'naprawa doklada CZLON, nie otwiera bramki');
  // KONTROLA PINU: bramka `rich` nie jest ruszana w kodzie ekspandera.
  const CAE = src('../../systems/ColonyAutoExpander.js');
  assert(/rich\s*\?/.test(CAE) && /20000/.test(CAE),
    'T2b KONTROLA PINU: predykat `rich` i prog 20000 nadal w `ColonyAutoExpander` (poza zakresem, rodzina 182)');
}

// ── T3 — PROMIEN RAZENIA z lustrem V-RICH ───────────────────────────────────────────────────
console.log('\nT3 — PROMIEN RAZENIA: pozostala piatka tier-3+ bez alokacji (przeciw lustru V-RICH)');
{
  // LUSTRO: przy otwartej bramce te same towary alokacje DOSTAJA — bez tego T3 bylby pusty.
  const mirror = mkFactory();
  for (const [cid, target] of T3) mirror.fs.setDemandBonus(cid, Math.max(0, target - 1));
  const mAlloc = plan(mirror.fs);
  const mirrorHits = OTHER_FIVE.filter(c => mAlloc.has(c));
  assert(mirrorHits.length >= 4,
    `T3k NIEJALOWOSC (lustro V-RICH): przy otwartej bramce piatka DOSTAJE alokacje ` +
    `(${mirrorHits.join(', ')}) — dowod, ze ich brak w V-SPLIT jest WYNIKIEM, nie cisza`);

  const { fs, colony } = mkFactory();
  directorOrders(colony);
  expanderZeroes(fs);
  const alloc = plan(fs);
  const leaked = OTHER_FIVE.filter(c => alloc.has(c));
  // ⚠ KONIUNKCJA, nie dwa osobne piny: „piatka nie dostaje FP" jest prawda TAKZE wtedy, gdy nie
  //   dostaje NIKT (stan V0). Pin musi zadac OBU rzeczy naraz, inaczej przechodzi jalowo.
  assert(leaked.length === 0 && alloc.has('quantum_cores'),
    `T3a: lancuch warp DOSTAJE alokacje, a pozostala piatka NIE — jednoczesnie ` +
    `(lancuch: ${alloc.has('quantum_cores') ? 'jest' : 'BRAK'}, wyciek: ${leaked.join(', ') || 'brak'})`);
  const chainFP = (alloc.get('quantum_cores') ?? 0) + (alloc.get('antimatter_cells') ?? 0);
  assert(chainFP >= fs.totalPoints * 0.8,
    `T3b: pull OGRANICZONY ZAMOWIENIEM — lancuch dostaje >=80% FP (${chainFP}/${fs.totalPoints}); ` +
    'w lustrze V-RICH ten sam lancuch dostawal 6/25');
}

// ── T4 — kolonie GRACZA nieosiagalne dla obu pisarzy ────────────────────────────────────────
console.log('\nT4 — kolonie GRACZA poza mechanizmem (selektor, nie wewnetrzny guard)');
{
  const CAE = src('../../systems/ColonyAutoExpander.js');
  assert(/_managedColonies\(\)\s*\{[\s\S]{0,400}?ownerEmpireId\s*==\s*null\)\s*return false/.test(CAE),
    'T4a: `_managedColonies` odsiewa kolonie bez `ownerEmpireId` ZANIM cokolwiek sie wykona');
  const DP = src('../../systems/director/DirectorProduction.js');
  assert(/_feedCommodityDemand/.test(DP) && !/getPlayerColonies/.test(DP),
    'T4b: `_feedCommodityDemand` nie ma zadnej sciezki do kolonii gracza');
  const { fs } = mkFactory({ owner: null });
  // ⚠ `?.size ?? 0` bylo JALOWE — daje 0 rowniez wtedy, gdy ksiegi nie ma wcale. Pin zada,
  //   zeby ksiega ISTNIALA i byla pusta; inaczej „gracz nic nie dostal" znaczy „nikt nic nie ma".
  assert(fs._orderDemand instanceof Map && fs._orderDemand.size === 0,
    'T4c: ksiega ISTNIEJE i dla kolonii GRACZA pozostaje pusta');
}

// ── T5 — KSIEGA: dwie sciezki czyszczenia + brak resztki przy dwoch zleceniach ───────────────
console.log('\nT5 — KSIEGA per zlecenie: usuniecie wpisu, nie odejmowanie (D-217-2)');
{
  const { fs } = mkFactory();
  expanderZeroes(fs);
  fs.setOrderDemand?.('pso_A', { warp_cores: 2 });
  const afterA = fs.getOrderDemand?.('warp_cores') ?? 0;
  assert(afterA === 2, `T5-0: zapis ksiegi daje czlon pochodny 2 (jest ${afterA})`);

  fs.setOrderDemand?.('pso_B', { warp_cores: 3 });
  assert((fs.getOrderDemand?.('warp_cores') ?? 0) === 5,
    'T5c-1: dwa rownolegle zlecenia sumuja sie do 5');
  fs.clearOrderDemand?.('pso_A');
  assert((fs.getOrderDemand?.('warp_cores') ?? 0) === 3,
    'T5c-2: usuniecie JEDNEGO zlecenia zostawia DOKLADNIE gap drugiego — licznik by tu zostawil resztke');

  const before5a = fs.getOrderDemand?.('warp_cores') ?? 0;
  fs.clearOrderDemand?.('pso_B');
  // ⚠ Sam odczyt „=== 0" bylby JALOWY (brak metody tez daje 0). Pin zada API, przejscia
  //   z wartosci NIEZEROWEJ do zera ORAZ zniknięcia wpisu z ksiegi.
  assert(typeof fs.clearOrderDemand === 'function' && before5a > 0
      && (fs.getOrderDemand?.('warp_cores') ?? -1) === 0 && !fs._orderDemand?.has('pso_B'),
    `T5a: czyszczenie na REALIZACJI usuwa WPIS (${before5a} -> 0, klucz pso_B znika)`);

  const DP = src('../../systems/director/DirectorProduction.js');
  assert(/_sweepExpiredOrders[\s\S]{0,900}?clearOrderDemand/.test(DP),
    'T5b: wygasniecie TTL (`_sweepExpiredOrders`) rowniez kasuje wpis ksiegi — OSOBNA sciezka');
}

// ── T6 — kill-switch ────────────────────────────────────────────────────────────────────────
console.log('\nT6 — kill-switch `aiOrderDemandChannel` (D-217-5)');
{
  assert(Object.prototype.hasOwnProperty.call(GAME_CONFIG.FEATURES ?? {}, 'aiOrderDemandChannel'),
    'T6a: flaga `FEATURES.aiOrderDemandChannel` istnieje');
  const prev = GAME_CONFIG.FEATURES?.aiOrderDemandChannel;
  try {
    GAME_CONFIG.FEATURES.aiOrderDemandChannel = false;
    const { fs, colony } = mkFactory();
    directorOrders(colony, { id: 'pso_X' });
    expanderZeroes(fs);
    const alloc = plan(fs);
    // ⚠ PIN PRZEFORMULOWANY (221). Wczesniej zadal, zeby przy fladze OFF lancuch NIE byl
    //   alokowany — ale po naprawie 221 popyt plynie tez z `_scanBuildDemand` zywego zlecenia,
    //   wiec lancuch alokuje sie NIEZALEZNIE od flagi. To jest poprawne: 221 to INNY defekt
    //   i jego naprawa legalnie zmienia zachowanie w OBU stanach flagi. Kontrakt kill-switcha
    //   dotyczy KSIEGI, wiec pinujemy WPLYW KSIEGI, nie calosciowy wynik alokacji.
    assert(typeof fs.setOrderDemand === 'function' && fs._orderDemand.size === 0,
      'T6b: przy fladze OFF ksiega ISTNIEJE, ale Director do niej NIE pisze (zostaje pusta)');
    assert(fs.getDemandBonus('warp_cores') === 0 && fs.getOrderDemand('warp_cores') === 0
        && fs.getSafetyStockTarget('warp_cores') === 1,
      'T6c: przy fladze OFF Director pisze do `_demandBonus`, ekspander to KASUJE, a ksiega ' +
      'nie wnosi nic ⇒ cel wraca do bazy = defekt sprzed slice-u ODTWORZONY');
    assert(!alloc.has('plasma_cores'),
      'T6d KONTROLA: flaga OFF nie otwiera bramki `rich` — pozostale tier-3+ dalej milcza');
  } finally {
    if (prev !== undefined) GAME_CONFIG.FEATURES.aiOrderDemandChannel = prev;
  }
}

// ── T7 — ZAPIS SPRZED SLICE'U: ksiega odbudowana z zywych pendingShipOrders ──────────────────
console.log('\nT7 — zapis SPRZED slice\'u: ksiega ODBUDOWANA z zywych zlecen, nie przyjeta jako pusta');
{
  const zero = mkFactory();
  const saved = zero.fs.serialize();
  delete saved.orderDemand;                       // zapis sprzed slice'u
  assert(!('orderDemand' in saved),
    'T7k NIEJALOWOSC: fixture to naprawde zapis BEZ pola `orderDemand` (stan sprzed slice\'u)');

  const { fs, colony } = mkFactory();
  colony.pendingShipOrders.push({ id: 'pso_stary', shipId: 'hull_frigate',
    cost: { warp_cores: 2, Ti: 8 }, queuedAt: 20, directorTemplateId: 'frigate_laser_escort' });
  fs.restore(saved);
  assert(colony.pendingShipOrders.length === 1,
    'T7k NIEJALOWOSC: po restore lista pending JEST niepusta — inaczej odbudowa nie mialaby czego zrobic');
  assert(fs._orderDemand instanceof Map && fs._orderDemand.size === 0,
    'T7a: tuz po `restore` ksiega jest PUSTA (`?? {}` — v101 bez migracji)');

  fs._reconcileOrderDemand();
  assert(fs._orderDemand.has('pso_stary') && fs.getOrderDemand('warp_cores') === 1,
    `T7b: rekoncyliacja ODBUDOWALA ksiege z zywego zlecenia (gap 1, jest ${fs.getOrderDemand('warp_cores')}) — ` +
    'bez tego zlecenia ze starego zapisu nie generowalyby popytu i umarlyby na TTL jak przed naprawa');
  assert(!Object.prototype.hasOwnProperty.call(fs._orderDemand.get('pso_stary') ?? {}, 'Ti'),
    'T7c: do ksiegi wchodza WYLACZNIE towary — ruda `Ti` z kosztu zlecenia pominieta (Finding 214)');

  const covered = mkFactory();
  covered.colony.pendingShipOrders.push({ id: 'pso_ok', cost: { warp_cores: 1 } });
  covered.fs._reconcileOrderDemand();
  assert(!covered.fs._orderDemand.has('pso_ok'),
    'T7d KONTRA-PIN: zlecenie w pelni pokryte zapasem NIE tworzy wpisu');

  colony.pendingShipOrders.length = 0;            // trzecia sciezka: poza realizacja i TTL
  fs._reconcileOrderDemand();
  assert(fs._orderDemand.size === 0,
    'T7e: zlecenie zniknelo z listy POZA realizacja i TTL — rekoncyliacja i tak nie zostawia resztki');
}

// ── T8 — 221 PO STRONIE GRACZA: `_reactiveAllocate` jest WSPOLDZIELONE ──────────────────────
console.log('\nT8 — 221 dotyka takze fabryk GRACZA (te same petle) — zmiana zachowania NAZWANA');
{
  // Kolonia GRACZA = brak `ownerEmpireId` (kanon `ColonyOwnership`), scenariusz zwykly (bez x5).
  const mkPlayer = (stock) => {
    const inv = new Map(Object.entries(stock));
    const rs = { inventory: inv, _inventoryPerYear: new Map(Object.entries({ Si: 5, Nt: 2, Hv: 5, Xe: 5, Ti: 5, Li: 2 })),
      getAmount: id => inv.get(id) ?? 0, getEnergyAvailability: () => 1.0 };
    const fs = new FactorySystem(rs);
    const colony = { planetId: 'p_home', factorySystem: fs, resourceSystem: rs,   // BRAK ownerEmpireId
      buildingSystem: { techSystem: { isResearched: () => true, isCommodityUnlocked: () => true, getFactorySpeedMultiplier: () => 1 } },
      pendingShipOrders: [], shipQueues: [], fleet: [] };
    globalThis.window.KOSMOS = { colonyManager: { getAllColonies: () => [colony], getColony: () => colony, activePlanetId: 'p_home' },
      scenario: 'civilization', gameConfig: GAME_CONFIG };
    fs.setTotalPoints(6); fs.setMode('reactive');
    return fs;
  };
  const RAW = { Si: 500, Nt: 60, Hv: 200, Xe: 200, Ti: 400, Li: 80 };

  // (a) SEDNO: gracz ustawia min-zapas 1 ponad stan, a polprodukty ma na poziomie deficytu.
  const a = mkPlayer({ ...RAW, quantum_cores: 1, antimatter_cells: 1, warp_cores: 1 });
  a.setDemandBonus('warp_cores', 1);
  a._reactiveAllocate(); a._autoConsolidate();
  assert(a._allocations.has('quantum_cores') && a._allocations.has('antimatter_cells'),
    'T8a: fabryka GRACZA alokuje lancuch przy deficycie 1 — przed 221 NIE alokowala go wcale ' +
    '(min-zapas ustawiony 1 ponad stan nie produkowal NIC)');
  assert(a._allocations.get('quantum_cores').targetQty === 1,
    `T8b: cel ogniwa = PRAWDZIWY deficyt 1 (jest ${a._allocations.get('quantum_cores').targetQty})`);

  // (b) KONTROLA: przypadek, ktorego 221 NIE zmienia (zapas polproduktow 0) — dziala tak samo.
  const b = mkPlayer({ ...RAW, quantum_cores: 0, antimatter_cells: 0, warp_cores: 1 });
  b.setDemandBonus('warp_cores', 1);
  b._reactiveAllocate(); b._autoConsolidate();
  assert(b._allocations.get('quantum_cores')?.targetQty === 2,
    'T8c KONTROLA: przy zerowym zapasie polproduktow cel to nadal 2 — 221 nie rusza tej sciezki');

  // (c) Cel przy DUZYM deficycie byl zanizony DOKLADNIE o zapas (36 zamiast 37).
  const c = mkPlayer({ ...RAW, quantum_cores: 1, antimatter_cells: 1, warp_cores: 1 });
  c.setDemandBonus('warp_cores', 19);
  c._reactiveAllocate(); c._autoConsolidate();
  assert(c._allocations.get('quantum_cores')?.targetQty === 37,
    `T8d: przy duzym deficycie cel jest teraz PELNY (37, wczesniej 36 = zanizony o zapas); ` +
    'to jest ta sama pomylka, tylko nie zabijala alokacji, wiec przez to byla niewidoczna');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
