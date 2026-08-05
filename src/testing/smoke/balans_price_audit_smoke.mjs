// BALANS 1.0 — Phase 2 — PriceAudit keeper (chroni AUDYT TABELI CEN, warstwy A + A′).
// Instrument NIE ma bramki w przeglądarce → czujnik zepsuty = werdykt zepsuty bez śladu.
//
// Chroni cztery rzeczy, których zepsucie byłoby CICHE i zmieniłoby wnioski slice'u:
//   1. rozróżnienie DWÓCH miar wsadu — pełna ruda (rekurencyjnie) vs bezpośrednie wejście
//      po cenach rynkowych. Zlanie ich w jedno zmienia werdykt `warp_cores` (×0.80 vs ×0.46).
//   2. split DESIGN vs SUSPECT liczony z DANYCH (`isDroidUnit` / `creditCost`), a nie
//      z listy id „na oko" — inaczej instrument zaczyna adjudykować (łamie HARD #1).
//   3. konwencję tabeli (×1.3) jako KRYTERIUM AUDYTU odczytane z dokumentacji cennika,
//      nie wymyślony standard — i robust outliery (mediana+MAD), których nie przesuwa
//      pojedynczy skrajny sink.
//   4. jednostki A′: nakład liczony na GAME-YEAR (HARD #3) i porównywalny MIĘDZY zasobami
//      dopiero po podzieleniu przez cenę (`capexPerKr`).
//
//   T1  recipeInputKr — wsad bezpośredni, półprodukt po CENIE, nie rozwijany
//   T2  auditCommodity — trzy miary kosztu + klasyfikacja + koszt nabycia z creditCost
//   T3  split design/suspect jest DATA-DRIVEN (zdjęcie markera przenosi towar do suspect)
//   T4  auditPriceTable — statystyki, „no data" z powodem, sieroty cennika
//   T5  priceOutliers — robust z-score w skali log (MAD odporny na skrajny sink)
//   T6  capexTable / assessBaseUnit — jednostki gy, czoło + alternatywy, implikowana cena
//   T7  katalog zakupów — prawdziwe pola gry (HULLS / ColonyManager / STATIONS) + koszyk
//   T8  staticVerdict — sink NIE liczy się jako outlier, suspect podnosi outcome
//
// Uruchom: node src/testing/smoke/balans_price_audit_smoke.mjs

import '../headless/env.js';           // MUST be first
import {
  PRICE_DEFAULTS, PRICE_CLASS, CIV_PER_GY,
  recipeInputKr, auditCommodity, auditPriceTable, priceOutliers, recipeUsers,
  capexTable, assessBaseUnit, buildPurchaseCatalog, loadedBasketKr, splitBasket,
  staticVerdict, isResource, priceOf,
} from '../headless/PriceAudit.js';
import { expandCommodity, valueBasket, fullyLoadedCost } from '../headless/RoiTelemetry.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { BASE_PRICE } from '../../data/TradeValuesData.js';
import { HULLS } from '../../data/HullsData.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { ColonyManager } from '../../systems/ColonyManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const NEUTRAL = { atmosphere: 'breathable', surfaceGravity: 1.0, temperatureC: 15 };

// ── T1: recipeInputKr ─────────────────────────────────────────────
console.log('T1 — recipeInputKr(): wsad BEZPOŚREDNI (półprodukt po cenie, bez rozwijania)');
{
  const sa = recipeInputKr('structural_alloys');   // Fe 8 (×1) + C 4 (×1) = 12
  assert(near(sa.kr, 8 * BASE_PRICE.Fe + 4 * BASE_PRICE.C),
    `towar 1-poziomowy: wsad = suma cen surowców (${sa.kr} Kr)`);
  assert(sa.subCommodities.length === 0 && sa.ok, 'brak półproduktów, wsad w pełni wyceniony');

  // warp_cores: 2×quantum_cores + 2×antimatter_cells + Ti 8 — półprodukty po ICH cenie
  const wc = recipeInputKr('warp_cores');
  const expect = 2 * BASE_PRICE.quantum_cores + 2 * BASE_PRICE.antimatter_cells + 8 * BASE_PRICE.Ti;
  assert(near(wc.kr, expect), `półprodukt liczony po CENIE RYNKOWEJ, nie po rudzie (${wc.kr} Kr)`);
  assert(wc.subCommodities.includes('quantum_cores'), 'półprodukty raportowane osobno');
  const wcOre = valueBasket(expandCommodity('warp_cores', 1).res).kr;
  assert(Math.abs(wcOre - wc.kr) > 1,
    `⚠ dwie miary wsadu DAJĄ RÓŻNE liczby (ruda ${Math.round(wcOre)} vs rynek ${Math.round(wc.kr)}) — nie wolno ich zlewać`);

  // `fuel` ← H, a H NIE MA ceny w tabeli gry
  const fu = recipeInputKr('fuel');
  assert(!fu.ok && fu.unpriced.includes('H'), 'surowiec bez ceny (H) wywraca policzalność wsadu — i jest raportowany');
  assert(recipeInputKr('nie_ma_takiego').ok === false, 'nieznany towar nie udaje policzalnego');
}

// ── T2: auditCommodity ────────────────────────────────────────────
console.log('T2 — auditCommodity(): trzy miary kosztu + klasa');
{
  const sa = auditCommodity('structural_alloys');
  assert(sa.oreKr > 0 && sa.directKr > 0, 'ruda i wsad bezpośredni policzone');
  assert(near(sa.conventionKr, sa.directKr * PRICE_DEFAULTS.CONVENTION_MARGIN, 0.01),
    'konwencja tabeli = wsad × CONVENTION_MARGIN (knob POMIARU, odczytany z dokumentacji cennika)');
  assert(near(sa.conformance, sa.price / sa.conventionKr, 1e-3), 'zgodność = cena ÷ konwencja');
  assert(sa.cls === PRICE_CLASS.CONFORMS, `towar bazowy trzyma się konwencji (×${sa.conformance})`);

  const dr = auditCommodity('automation_droid');
  assert(dr.creditCost === COMMODITIES.automation_droid.creditCost, 'creditCost odczytany z danych');
  assert(near(dr.acquisitionKr, dr.oreKr + dr.creditCost, 0.01),
    'koszt NABYCIA = ruda + jawna opłata Kr (droid: ruda + 500 Kr)');
  assert(dr.ratioAcquisition < dr.ratioOre, 'doliczenie opłaty Kr POGARSZA stosunek ceny do kosztu');
  assert(dr.belowOre && dr.sinkMarked, 'droid: poniżej rudy I oznaczony w danych jako sink');

  const noPrice = auditCommodity('military_supplies');
  assert(noPrice.cls === PRICE_CLASS.NO_DATA && noPrice.noDataReason === 'no_price_in_table',
    'towar BEZ ceny w tabeli → no_data z powodem „brak ceny" (nie da się nim handlować)');
  const fuel = auditCommodity('fuel');
  assert(fuel.cls === PRICE_CLASS.NO_DATA && fuel.noDataReason === 'unpriced_input',
    '`fuel` → no_data z INNEGO powodu: nieceniony surowiec we wsadzie (H)');
  assert(auditCommodity('nie_ma_takiego') === null, 'nieznany towar → null (nie cichy zerowy wiersz)');
}

// ── T3: DESIGN vs SUSPECT jest DATA-DRIVEN ────────────────────────
console.log('T3 — split design/suspect z DANYCH, nie z listy id (HARD #1)');
{
  const before = auditCommodity('automation_droid');
  assert(before.cls === PRICE_CLASS.DESIGN_SINK, 'droid z markerem → „prawdopodobnie zamierzony sink"');

  // Zdejmij OBA markery sinku — klasa MUSI się przesunąć na „niewyjaśnione".
  const def = COMMODITIES.automation_droid;
  const origDroid = def.isDroidUnit, origCredit = def.creditCost;
  def.isDroidUnit = false; def.creditCost = 0;
  const after = auditCommodity('automation_droid');
  def.isDroidUnit = origDroid; def.creditCost = origCredit;
  assert(after.cls === PRICE_CLASS.SUSPECT,
    'ten sam towar BEZ markera w danych → suspect_below_cost (reguła czyta dane, nie id)');
  assert(auditCommodity('automation_droid').cls === PRICE_CLASS.DESIGN_SINK, 'dane przywrócone po teście');

  const wc = auditCommodity('warp_cores');
  assert(wc.belowOre && !wc.sinkMarked && wc.cls === PRICE_CLASS.SUSPECT,
    `warp_cores: poniżej rudy BEZ markera → suspect (×${wc.ratioOre} rudy, ×${wc.ratioDirect} rynku)`);
  const ps = auditCommodity('propulsion_systems');
  assert(ps.belowOre && ps.cls === PRICE_CLASS.SUSPECT, `propulsion_systems: suspect (×${ps.ratioOre})`);
}

// ── T4: auditPriceTable ───────────────────────────────────────────
console.log('T4 — auditPriceTable(): pokrycie, statystyki, sieroty');
{
  const a = auditPriceTable();
  assert(Object.keys(a.commodities).length === Object.keys(COMMODITIES).length,
    'audyt pokrywa CAŁY katalog towarów');
  assert(a.stats.suspect + a.stats.designSink === a.stats.belowCost,
    'każdy towar poniżej wsadu ma dokładnie jedną klasę (design albo suspect)');
  assert(a.stats.unpricedResources.includes('H') && a.stats.unpricedResources.includes('research'),
    `surowce bez ceny wykryte: ${a.stats.unpricedResources.join(', ')}`);
  assert(a.stats.orphanPrices.length === 0, 'brak cen-sierot (klucz w BASE_PRICE bez definicji towaru/surowca)');
  assert(a.resources.Fe.inRecipes.length > 0 && recipeUsers('Fe').length === a.resources.Fe.inRecipes.length,
    'przy każdym surowcu widać, ile receptur na jego cenie wisi');
  assert(a.stats.measurable + a.stats.noData === a.stats.total, 'suma klas = katalog (nic nie ginie po drodze)');
  assert(a.stats.unpricedGoods.length > 0,
    `towary całkowicie poza cennikiem: ${a.stats.unpricedGoods.join(', ')} (poza TRADEABLE_GOODS)`);
}

// ── T5: priceOutliers — robust ────────────────────────────────────
console.log('T5 — priceOutliers(): robust z-score (mediana + MAD) w skali log');
{
  // Syntetyczna tabela: 8 zgodnych + 1 skrajny sink + 1 umiarkowany odstający.
  const mk = (id, conformance, cls = PRICE_CLASS.CONFORMS) => ({ id, conformance, measurable: true, cls });
  const rows = {};
  for (let i = 0; i < 8; i++) rows['ok' + i] = mk('ok' + i, 1 + i * 0.01);
  rows.sink = mk('sink', 0.02, PRICE_CLASS.DESIGN_SINK);
  rows.odd  = mk('odd', 0.35, PRICE_CLASS.SUSPECT);
  const out = priceOutliers(rows);
  const ids = out.map(o => o.id);
  assert(ids.includes('sink'), 'skrajny sink wykryty jako odstający');
  assert(ids.includes('odd'), '⚠ UMIARKOWANY odstający też wykryty — skrajny sink NIE przesunął progu (MAD, nie średnia)');
  assert(out.every(o => Math.abs(o.z) >= PRICE_DEFAULTS.OUTLIER_Z), 'zwracane tylko wiersze ponad progiem knoba');
  assert(priceOutliers({ a: mk('a', 1) }).length === 0, 'za mało danych → brak outlierów (nie wyimaginowane)');

  // Symetria multiplikatywna: ×4 i ×0.25 mają ten sam dystans od mediany 1.0.
  const sym = {}; for (let i = 0; i < 8; i++) sym['ok' + i] = mk('ok' + i, 1);
  sym.hi = mk('hi', 4); sym.lo = mk('lo', 0.25);
  const so = priceOutliers(sym);
  const hi = so.find(o => o.id === 'hi'), lo = so.find(o => o.id === 'lo');
  assert(hi && lo && near(Math.abs(hi.z), Math.abs(lo.z), 1e-6),
    'skala LOG: ×4 i ×0.25 odstają tak samo (cena to relacja multiplikatywna)');
}

// ── T6: capexTable / assessBaseUnit (Warstwa A′) ──────────────────
console.log('T6 — capexTable() / assessBaseUnit(): jednostka bazowa');
{
  const cap = capexTable(NEUTRAL);
  assert(cap.energy && cap.food && cap.water, 'zasoby z producentem statycznym mają nakład (energia/żywność/woda)');
  assert(!cap.Fe, '⚠ kopalnie NIE mają statycznego producenta (`rates: {}`) → Fe dopiero z pomiaru');

  // Jednostki: stawki gry są PER CIV-YEAR, nakład ma być na GAME-YEAR (HARD #3).
  // Sprawdzamy na CZOLE (`cap.energy.from`), bo ono jest kontraktem funkcji — który
  // konkretnie budynek jest czołem, zależy od danych i wolno mu się zmienić.
  const front = BUILDINGS[cap.energy.from];
  const frontKr = fullyLoadedCost(front, NEUTRAL).krLoaded;
  const frontNet = (front.rates?.energy ?? 0) - (front.energyCost ?? 0)
    - (front.maintenance?.energy ?? 0);
  const expectPerGy = frontNet * CIV_PER_GY;
  assert(near(cap.energy.perGy, expectPerGy, 0.01),
    `przepływ przeliczony na GAME-YEAR (${cap.energy.from}: ${expectPerGy}/gy = stawka gry ×${CIV_PER_GY})`);
  assert(near(cap.energy.capexPerUnit, frontKr / expectPerGy, 0.01),
    'nakład na jednostkę = koszt w pełni obciążony ÷ przepływ/gy');
  assert(near(cap.energy.capexPerKr, cap.energy.capexPerUnit / BASE_PRICE.energy, 0.01),
    'porównywalność MIĘDZY zasobami dopiero po podzieleniu przez cenę (capexPerKr)');
  assert((cap.energy.alternatives ?? []).every(a => a.capexPerKr >= cap.energy.capexPerKr),
    'czoło efektywności = najtańszy producent, alternatywy nie tańsze');
  assert(cap.energy.producers > 1 && 'requires' in cap.energy,
    'przy czole widać bramkę tech i liczbę producentów (czoło bywa budynkiem endgame)');

  const a = assessBaseUnit(cap);
  assert(a.ok && a.medianCapexPerKr > 0, 'ocena jednostki bazowej policzona');
  const e = a.byResource.energy;
  assert(near(e.impliedPriceFactor, e.capexPerKr / a.medianCapexPerKr, 1e-3),
    'implikowany współczynnik = nakład zasobu ÷ mediana panelu');
  assert(near(e.impliedPrice, e.price * e.impliedPriceFactor, 1e-2), 'cena implikowana = cena × współczynnik');
  assert(Array.isArray(a.pair.missing), 'para pod lupą raportuje BRAKUJĄCE zasoby zamiast udawać wynik');

  // Syntetyczna para: nakład na Kr energii 2× większy niż Fe przy cenie 1:1 → skew 2.
  const synth = {
    energy: { resource: 'energy', price: 1, capexPerKr: 2, capexPerUnit: 2, from: 'x' },
    Fe:     { resource: 'Fe',     price: 1, capexPerKr: 1, capexPerUnit: 1, from: 'y' },
  };
  const sa = assessBaseUnit(synth);
  assert(near(sa.pair.listedRatio, 1) && near(sa.pair.impliedRatio, 2) && near(sa.pair.skew, 2),
    'skew = ile razy relacja NAKŁADU rozjeżdża się z relacją CENNIKA (1.0 = jednostka ugruntowana)');
}

// ── T7: katalog zakupów ───────────────────────────────────────────
console.log('T7 — buildPurchaseCatalog(): prawdziwe pola gry, nie przepisana kopia');
{
  const cat = buildPurchaseCatalog(NEUTRAL);
  const hull = cat.hull_small;
  assert(hull && hull.res.Fe === HULLS.hull_small.cost.Fe, 'kadłub: koszt surowców wprost z HULLS');
  assert(hull.upkeepKrPerGy === HULLS.hull_small.upkeepCredits,
    'utrzymanie floty jest JUŻ per ROK GRY (`_tickVesselMaintenance` na physDt) — bez przeliczania');
  assert(hull.krLoaded > hull.krDirect, 'koszt w pełni obciążony > widoczna ruda (komponenty kadłuba)');

  const gu = cat.ground_shock_infantry;
  assert(gu.krCost === ColonyManager.GROUND_UNIT_CREDITS_BUILD.shock_infantry, 'jednostka naziemna: Kr wprost z ColonyManager');
  assert(near(gu.upkeepKrPerGy, ColonyManager.GROUND_UNIT_UPKEEP.shock_infantry.credits * CIV_PER_GY),
    '⚠ utrzymanie jednostek naziemnych liczy się per CIV-rok → ×12 na game-rok (dwa zegary)');

  const droid = cat.automation_droid;
  assert(droid.krCost === COMMODITIES.automation_droid.creditCost, 'droid: opłata Kr z receptury');
  assert(near(droid.totalKr, droid.krLoaded + droid.krCost, 0.1), 'pełny koszt nabycia = ruda w Kr + opłata Kr');
  assert(droid.marketPrice === BASE_PRICE.automation_droid, 'przy droidzie widać też jego cenę rynkową (kontrast z kosztem)');

  assert(cat.shipyard_surge.krCost === ColonyManager.SURGE_KR_COST && cat.shipyard_surge.krLoaded === 0,
    'usługa (przyspieszenie stoczni) = czysty sink Kr, zero materiałów');
  assert(cat.station_orbital_station && cat.station_orbital_station.krLoaded > 0, 'stacja orbitalna w katalogu');

  // splitBasket / loadedBasketKr — spójność z formułą kosztu budynku (jedno źródło rozwijania)
  const s = splitBasket({ Fe: 10, structural_alloys: 2 });
  assert(s.res.Fe === 10 && s.com.structural_alloys === 2, 'koszyk rozdzielony na surowce i towary');
  const b = BUILDINGS.mine;
  const viaBasket = loadedBasketKr({ ...b.cost, ...b.commodityCost });
  const viaRoi = fullyLoadedCost(b, NEUTRAL);
  assert(near(viaBasket.krLoaded, viaRoi.krLoaded, 0.2),
    'koszyk liczony tym SAMYM rozwinięciem co RoiTelemetry (planeta neutralna → mnożnik 1)');
  assert(isResource('Fe') && !isResource('structural_alloys') && priceOf('research') === null,
    'klasyfikacja klucza i tabela cen czytane z danych gry');
}

// ── T8: staticVerdict ─────────────────────────────────────────────
console.log('T8 — staticVerdict(): sink to nie pomyłka, suspect to decyzja projektanta');
{
  const audit = auditPriceTable();
  const v = staticVerdict(audit);
  assert(v.outcome === 1 && v.suspect === audit.stats.suspect,
    `panel: outcome ${v.outcome} — ${v.suspect} niewyjaśnionych poniżej wsadu`);
  assert(!v.outlierIds.includes('automation_droid') && !v.outlierIds.includes('android_worker'),
    '⚠ sinki oznaczone w DANYCH nie liczą się jako odstające (to konwencja, nie błąd)');

  // Tabela bez niczego podejrzanego → COHERENT.
  const clean = {
    stats: { measurable: 10, conforms: 10, suspect: 0 },
    outliers: [{ id: 'sink', cls: PRICE_CLASS.DESIGN_SINK, z: -9 }],
  };
  assert(staticVerdict(clean).outcome === 0, 'sam sink projektowy NIE psuje werdyktu tabeli');
  assert(staticVerdict({ stats: { measurable: 2 }, outliers: [] }).outcome === 2, 'za mało danych → NO DATA, nie fałszywe „OK"');
}

console.log(`\n═══ PriceAudit keeper: ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
