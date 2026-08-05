// BALANS 1.0 — Phase 2 — RoiTelemetry keeper (chroni czujnik KOSZT↔WARTOŚĆ budynków).
// Instrument NIE ma bramki w przeglądarce → czujnik zepsuty = werdykt zepsuty bez śladu.
// Chroni: rekurencyjne rozwijanie komponentów do rudy (bez tego koszt budynku jest
// zaniżony ~3-4×), rozdział na tor produkcyjny i tory funkcjonalne (żaden wspólny
// mianownik dla nauki/mieszkań), przeliczenie na GAME-YEAR (HARD #3) — w tym pułapkę
// `baseTime` fabryki, która jest w CIV-latach mimo komentarza w danych — oraz
// ASYMETRIĘ pól gry `entry.housing` (akumuluje po poziomach) vs `entry.jobs`
// (per poziom), która przy naiwnym ×level daje podwójne liczenie mieszkań.
//
//   T1  expandCommodity — rekurencja przez receptury, bezpiecznik cyklu, creditCost
//   T2  fullyLoadedCost — bezpośredni vs wbudowany vs metka; dopłata środowiskowa
//   T3  tracksOf — klasyfikacja TORÓW z DANYCH (nie z listy „na oko")
//   T4  wycena przepływu + zwrot + stawki nominalne (jednostki: ×CIV_PER_GY)
//   T5  factoryTimeGy (CIV→GY) + upgradeCostAt (realna formuła _upgrade)
//   T6  snapshot — housing bez ×level, jobs ×level, urobek kopalni, płace
//   T7  summarizeSeed / aggregatePanel / panelVerdict (czyste)
//   T8  realny GameCore boot przez WSPÓLNY driver + sample (guard dryfu API)
//
// Uruchom: node src/testing/smoke/balans_roi_telemetry_smoke.mjs

import '../headless/env.js';           // MUST be first
import {
  RoiTelemetry, ROI_TELEMETRY_DEFAULTS, TRACK, CIV_PER_GY,
  expandCommodity, fullyLoadedCost, upgradeCostAt, factoryTimeGy, commodityPriceVsOre,
  tracksOf, nominalNetRates, flowValueKrPerGy, paybackGy, priceOf, valueBasket,
  buildCostTable, summarizeSeed, aggregatePanel, panelVerdict,
} from '../headless/RoiTelemetry.js';
import { runOneGame } from '../headless/balans-driver.mjs';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── T1: expandCommodity ───────────────────────────────────────────
console.log('T1 — expandCommodity(): rekurencja receptur do RUDY');
{
  // structural_alloys: Fe 8 + C 4 — jeden poziom, bez półproduktów
  const sa = expandCommodity('structural_alloys', 1);
  assert(sa.res.Fe === 8 && sa.res.C === 4, 'towar 1-poziomowy rozwija się wprost do rudy (Fe 8, C 4)');
  assert(expandCommodity('structural_alloys', 3).res.Fe === 24, 'ilość skaluje liniowo (3× → Fe 24)');

  // warp_cores: 2×quantum_cores + 2×antimatter_cells + Ti 8 → REKURENCJA
  const wc = expandCommodity('warp_cores', 1);
  const qc = COMMODITIES.quantum_cores.recipe, ac = COMMODITIES.antimatter_cells.recipe;
  assert(wc.res.Ti === 8 + 2 * (qc.Ti ?? 0) + 2 * (ac.Ti ?? 0),
    'towar T5 rozwija PÓŁPRODUKTY (Ti = własne 8 + Ti z quantum/antimatter)');
  assert(wc.res.Nt === 2 * (qc.Nt ?? 0) + 2 * (ac.Nt ?? 0) && wc.res.Nt > 0,
    'ruda widoczna DOPIERO po rekurencji (Nt tylko z półproduktów)');
  assert(wc.depth >= 1, 'głębokość rekurencji raportowana');
  assert(wc.cyclic.length === 0, 'brak cykli w prawdziwych recepturach gry');

  // creditCost (droid) — Kr wpisane w recepturę
  assert(expandCommodity('automation_droid', 2).credits === 2 * COMMODITIES.automation_droid.creditCost,
    'creditCost receptury sumowany osobno (droid: Kr/szt.)');

  // nieznany klucz nie znika po cichu
  assert(Object.keys(expandCommodity('nie_ma_takiego', 1).unknown).length === 1,
    'nieznany towar trafia do `unknown` (nie znika po cichu)');

  // bezpiecznik rekurencji
  const orig = COMMODITIES.__cyc_a, orig2 = COMMODITIES.__cyc_b;
  COMMODITIES.__cyc_a = { id: '__cyc_a', recipe: { __cyc_b: 1 }, baseTime: 1 };
  COMMODITIES.__cyc_b = { id: '__cyc_b', recipe: { __cyc_a: 1 }, baseTime: 1 };
  const cyc = expandCommodity('__cyc_a', 1);
  assert(cyc.cyclic.length > 0, 'cykl receptur wykryty i przerwany (bezpiecznik, nie stack overflow)');
  if (orig === undefined) delete COMMODITIES.__cyc_a; else COMMODITIES.__cyc_a = orig;
  if (orig2 === undefined) delete COMMODITIES.__cyc_b; else COMMODITIES.__cyc_b = orig2;
}

// ── T2: fullyLoadedCost ───────────────────────────────────────────
console.log('T2 — fullyLoadedCost(): ruda bezpośrednia vs wbudowana w komponenty');
{
  const neutral = { atmosphere: 'breathable', surfaceGravity: 1.0, temperatureC: 15 };
  const mine = fullyLoadedCost(BUILDINGS.mine, neutral);
  assert(mine.direct.Fe === BUILDINGS.mine.cost.Fe, 'koszt bezpośredni = `cost` gry (planeta neutralna → mnożnik 1)');
  assert(mine.commodity.structural_alloys === BUILDINGS.mine.commodityCost.structural_alloys,
    'koszt komponentowy = `commodityCost` gry');
  const saFe = COMMODITIES.structural_alloys.recipe.Fe * BUILDINGS.mine.commodityCost.structural_alloys;
  assert(mine.embedded.Fe >= saFe, 'ruda WBUDOWANA w komponenty policzona (Fe z alloys + reszta)');
  assert(mine.loaded.Fe === mine.direct.Fe + mine.embedded.Fe, 'w pełni obciążony = bezpośredni + wbudowany');
  assert(mine.krLoaded > mine.krDirect, 'koszt w pełni obciążony jest WIĘKSZY niż widoczna ruda');
  assert(near(mine.embeddedShare, mine.krEmbedded / mine.krLoaded, 1e-3), 'udział komponentów = krEmbedded/krLoaded');
  assert(mine.embeddedShare > 0.5, `kopalnia: >50% prawdziwego kosztu jest w komponentach (${Math.round(mine.embeddedShare * 100)}%)`);
  assert(mine.krTicket !== mine.krLoaded,
    '„cena z metki" (komponent po cenie rynkowej) to INNA liczba niż koszt w pełni obciążony');
  assert(mine.unpriced.length === 0, 'cała ruda kopalni ma cenę w tabeli gry');

  // Dopłata środowiskowa — REALNA formuła gry, nie własna
  const harsh = { atmosphere: 'none', surfaceGravity: 2.5, temperatureC: -80 };
  const mineHarsh = fullyLoadedCost(BUILDINGS.mine, harsh);
  assert(mineHarsh.krDirect > mine.krDirect, 'planeta wroga podnosi koszt (envMultiplier gry działa)');
  assert(fullyLoadedCost(BUILDINGS.colony_base, neutral).krLoaded === 0, 'stolica jest bezkosztowa (cost = {})');

  // Cały katalog: brak dziur w wycenie
  const table = buildCostTable(neutral);
  assert(Object.keys(table).length === Object.keys(BUILDINGS).length, 'tabela kosztów pokrywa CAŁY katalog budynków');
  const unpriced = Object.values(table).filter(c => c.cost.unpriced.length);
  assert(unpriced.length === 0, `każdy surowiec w koszcie ma cenę (0 dziur; inaczej: ${unpriced.map(c => c.id).join(',')})`);
  const cyclic = Object.values(table).filter(c => c.cost.cyclic.length);
  assert(cyclic.length === 0, 'żaden budynek nie ma cyklicznej receptury');
}

// ── T3: tracksOf ──────────────────────────────────────────────────
console.log('T3 — tracksOf(): tory z DANYCH budynku');
{
  assert(tracksOf(BUILDINGS.mine).tracks.includes(TRACK.PRODUCTIVE), 'kopalnia → tor produkcyjny (flaga isMine)');
  assert(tracksOf(BUILDINGS.solar_farm).tracks.includes(TRACK.PRODUCTIVE), 'elektrownia → produkcyjny (energia ma cenę)');
  assert(tracksOf(BUILDINGS.habitat).tracks.includes(TRACK.HOUSING), 'habitat → mieszkalny (housing > 0)');
  assert(tracksOf(BUILDINGS.observatory).tracks.includes(TRACK.RESEARCH), 'obserwatorium → nauka');
  assert(!tracksOf(BUILDINGS.observatory).tracks.includes(TRACK.PRODUCTIVE),
    '⚠ nauka NIE wchodzi do toru produkcyjnego (research nie ma ceny — brak danych, nie wybór)');
  assert(tracksOf(BUILDINGS.trade_hub).tracks.includes(TRACK.TRADE), 'hub handlowy → tor handlu');
  assert(tracksOf(BUILDINGS.defense_tower).tracks[0] === TRACK.OTHER, 'wieża obronna → tor „wartość poza slice\'em"');
  assert(tracksOf(BUILDINGS.arcology_building).tracks.length >= 2, 'arkologia jest w KILKU torach (mieszkania + żywność)');
  assert(tracksOf(BUILDINGS.fuel_refinery).tracks.includes(TRACK.PRODUCTIVE), 'konwerter (convertFrom) → produkcyjny');
  assert(tracksOf(BUILDINGS.admin_office).tags.includes('governanceBonus'),
    'efekty NIE-zasobowe wykryte z pól danych (governanceBonus)');
  assert(priceOf('research') === null && priceOf('Fe') === 1, 'tabela cen gry: research bez ceny, Fe = 1');
}

// ── T4: wycena przepływu / zwrot / stawki nominalne ───────────────
console.log('T4 — wycena przepływu, zwrot, stawki nominalne (jednostki)');
{
  const v = flowValueKrPerGy({ Fe: 10 });
  assert(v.krPerGy === 10 * priceOf('Fe') * CIV_PER_GY, `stawka per CIV-YEAR przeliczona na GAME-YEAR (×${CIV_PER_GY})`);
  assert(flowValueKrPerGy({ energy: -5 }).krPerGy < 0, 'ujemna stawka (energia/utrzymanie) obniża wartość');
  assert(flowValueKrPerGy({ research: 10 }).unpriced.includes('research'),
    'klucz bez ceny NIE jest liczony jako 0 — trafia na listę `unpriced`');
  assert(flowValueKrPerGy({ Fe: 0.0001 }).krPerGy === 0, 'szum poniżej RATE_EPS ignorowany');

  const nom = nominalNetRates(BUILDINGS.solar_farm);
  assert(nom.energy === BUILDINGS.solar_farm.rates.energy, 'stawki nominalne = rates z danych (bez energyCost tutaj)');
  assert(nom.Si === -BUILDINGS.solar_farm.maintenance.Si, 'utrzymanie wchodzi jako UJEMNA stawka');
  const nomCoal = nominalNetRates(BUILDINGS.coal_plant);
  assert(nomCoal.C === BUILDINGS.coal_plant.rates.C - BUILDINGS.coal_plant.maintenance.C,
    'rates i maintenance sumują się na tym samym kluczu (elektrownia węglowa: C)');
  const nomMine = nominalNetRates(BUILDINGS.mine);
  assert(nomMine.energy === -BUILDINGS.mine.energyCost, 'energyCost wchodzi jako ujemna energia');

  assert(paybackGy(100, 50) === 2, 'zwrot = koszt / przepływ (100 Kr przy 50 Kr/gy → 2 gy)');
  assert(paybackGy(100, 0) === null, 'brak dodatniego przepływu → zwrot `null` (nigdy), NIE 0 ani ∞');
  assert(paybackGy(100, -5) === null, 'ujemny przepływ → nigdy się nie zwraca');
  assert(paybackGy(0, 10) === 0, 'koszt 0 → zwrot natychmiastowy');
  assert(valueBasket({ Fe: 2, brak_ceny: 5 }).unpriced.includes('brak_ceny'), 'wycena koszyka raportuje klucze bez ceny');
}

// ── T5: czas fabryki + koszt ulepszenia ───────────────────────────
console.log('T5 — factoryTimeGy (CIV→GY) + upgradeCostAt (formuła _upgrade)');
{
  const neutral = { atmosphere: 'breathable', surfaceGravity: 1.0, temperatureC: 15 };
  // ⚠ baseTime jest w CIV-LATACH (FactorySystem._update dostaje civDeltaYears) mimo
  // komentarza „lata gry" w CommoditiesData — dlatego wynik dzieli się przez CIV_PER_GY.
  const t1 = factoryTimeGy(BUILDINGS.mine, neutral, { points: 1, speedMult: 1 });
  let civYears = 0;
  for (const [c, q] of Object.entries(BUILDINGS.mine.commodityCost)) {
    civYears += COMMODITIES[c].baseTime * q;
    for (const [k, v] of Object.entries(COMMODITIES[c].recipe)) {
      if (COMMODITIES[k]) civYears += COMMODITIES[k].baseTime * v * q;
    }
  }
  assert(near(t1, Math.round(civYears / CIV_PER_GY * 1000) / 1000, 1e-3),
    `czas fabryki w GAME-LATACH = Σ baseTime / CIV_PER_GY (${t1} gy)`);
  assert(near(factoryTimeGy(BUILDINGS.mine, neutral, { points: 4, speedMult: 1 }), t1 / 4, 1e-3),
    'więcej punktów produkcji → proporcjonalnie krócej');
  assert(factoryTimeGy(BUILDINGS.colony_base, neutral, { points: 1 }) === 0, 'budynek bez komponentów nie zajmuje fabryki');

  const u2 = upgradeCostAt(BUILDINGS.mine, neutral, 2);
  assert(u2.direct.Fe === Math.ceil(BUILDINGS.mine.cost.Fe * 2 * 1.2), 'ulepszenie Lv2: base × lvl × 1.2 (formuła gry)');
  assert(Object.keys(u2.commodity).length === 0, 'komponenty przy ulepszeniu dopiero od Lv3');
  const u3 = upgradeCostAt(BUILDINGS.mine, neutral, 3);
  assert(u3.commodity.structural_alloys === BUILDINGS.mine.commodityCost.structural_alloys * 2,
    'ulepszenie Lv3: komponenty × (lvl − 1)');
  assert(u3.krLoaded > u2.krLoaded, 'koszt ulepszenia ROŚNIE z poziomem, choć produkcja rośnie liniowo (ROI ulepszeń więdnie)');
  // ⚠ własność cennika, którą łatwo przeoczyć: ulepszenie do Lv2 NIE bierze komponentów,
  // więc bywa TAŃSZE niż postawienie nowego budynku — a daje ten sam +1× produkcji.
  assert(u2.krLoaded < fullyLoadedCost(BUILDINGS.mine, neutral).krLoaded,
    'ulepszenie Lv2 (bez komponentów) tańsze niż nowa kopalnia przy tym samym przyroście produkcji');
  assert(upgradeCostAt(BUILDINGS.mine, neutral, 1) === null, 'poziom 1 nie jest ulepszeniem');

  const pvo = commodityPriceVsOre();
  assert(pvo.structural_alloys.ratio > 1, 'towar T1 wyceniony POWYŻEJ swojej rudy (marża przetworzenia)');
  assert(Object.values(pvo).some(v => v.belowOre), 'wykrywa towary wycenione PONIŻEJ rudy (wyjaśnia ujemną wartość dodaną)');
}

// ── T6: snapshot (pułapki pól gry) ────────────────────────────────
console.log('T6 — snapshot(): housing bez ×level, jobs ×level, urobek kopalni, płace');
{
  const mk = (id, level, extra = {}) => [`${id}_${level}`, {
    building: BUILDINGS[id], level,
    effectiveRates: extra.rates ?? {},
    housing: extra.housing ?? 0, jobs: BUILDINGS[id].jobs ?? 0, ...extra,
  }];
  const active = new Map([
    mk('habitat', 3, { housing: BUILDINGS.habitat.housing * 3, rates: { Fe: -1, energy: -3 } }),  // gra AKUMULUJE housing
    mk('farm', 2, { rates: { food: 20, energy: -2 } }),
    mk('mine', 1, { rates: { Fe: -1, energy: -2 } }),
  ]);
  const home = {
    planetId: 'p1',
    buildingSystem: {
      _active: active,
      getMineOutputEstimate: () => ({ staff: 0.5, gains: { Fe: 100, Ti: 10 } }),
      techSystem: { getFactorySpeedMultiplier: () => 1 },
    },
    resourceSystem: {
      getResourceBreakdown: (id) => (id === 'Fe' ? { producers: { mine: { total: 200 } }, consumers: {} } : { producers: {}, consumers: {} }),
      getEnergyAvailability: () => 0.5, energy: { brownout: true },
    },
    civSystem: { population: 40, getStrataWage: () => 2 },
    factorySystem: { totalPoints: 3 },
  };
  const row = RoiTelemetry.snapshot(7, { home, colonyManager: { _activePlanetId: 'p1', getPlayerColonies: () => [1, 2] } });

  assert(row.gy === 7 && row.pop === 40 && row.colonies === 2, 'migawka niesie rok, POP i liczbę kolonii');
  assert(row.perType.habitat.housing === BUILDINGS.habitat.housing * 3,
    '⚠ housing NIE mnożony przez level (pole gry już akumuluje) — brak podwójnego liczenia');
  assert(row.perType.farm.jobs === BUILDINGS.farm.jobs * 2,
    '⚠ jobs MNOŻONE przez level (gra robi to samo w getSlotDemand)');
  assert(row.perType.mine.net.Fe === 100 - 1,
    'urobek kopalni (getMineOutputEstimate) dodany do stawek efektywnych, minus utrzymanie');
  assert(row.perType.mine.net.Ti === 10, 'urobek obejmuje WSZYSTKIE surowce ze złóż');
  assert(row.perType.mine.mineStaff === 0.5, 'obsada kopalni raportowana (realny urobek, nie nameplate)');
  assert(row.minePlate.Fe === 200, '„nameplate" z rozbicia gry zapisany OBOK realnego urobku (luka do porównania)');
  assert(near(row.perType.farm.krPerGyPerLevel, row.perType.farm.krPerGy / 2, 1e-6),
    'przepływ na POZIOM = przepływ typu / suma poziomów');
  assert(row.perType.farm.wageKrPerGy === BUILDINGS.farm.jobs * 2 * 2 * CIV_PER_GY,
    'płace = etaty × stawka straty × CIV_PER_GY (osobno od zwrotu)');
  assert(row.energyAvail === 0.5 && row.brownout === true, 'dostępność energii i brownout w migawce (kontekst urobku)');
  assert(row.activeIsHome === true, 'flaga „aktywna kolonia = macierzysta" (spójność odczytów globalnych)');
  assert(row.factory.points === 3, 'punkty produkcji fabryki w migawce');
}

// ── T7: podsumowania (czyste) ─────────────────────────────────────
console.log('T7 — summarizeSeed / aggregatePanel / panelVerdict');
{
  const neutral = { atmosphere: 'breathable', surfaceGravity: 1.0, temperatureC: 15 };
  const table = buildCostTable(neutral);
  const mkRow = (gy, kr) => ({
    gy, perType: {
      mine: { count: 1, levels: 1, housing: 0, jobs: 1, net: { Fe: 10 }, krPerGy: kr, krPerGyPerLevel: kr, wageKrPerGy: 12, wageKrPerGyPerLevel: 12, mineStaff: 1, unpricedOut: [] },
      habitat: { count: 1, levels: 1, housing: 12, jobs: 0, net: { Fe: -1 }, krPerGy: -12, krPerGyPerLevel: -12, wageKrPerGy: 0, wageKrPerGyPerLevel: 0, mineStaff: null, unpricedOut: [] },
      observatory: { count: 1, levels: 1, housing: 0, jobs: 1, net: { research: 6 }, krPerGy: -50, krPerGyPerLevel: -50, wageKrPerGy: 12, wageKrPerGyPerLevel: 12, mineStaff: null, unpricedOut: ['research'] },
      solar_farm: { count: 1, levels: 1, housing: 0, jobs: 1, net: { energy: 8 }, krPerGy: 96, krPerGyPerLevel: 96, wageKrPerGy: 12, wageKrPerGyPerLevel: 12, mineStaff: null, unpricedOut: [] },
    },
    minePlate: { Fe: 20 },
    factory: { points: 2, speedMult: 1.5, produced: { structural_alloys: 10 * gy } },
    energyAvail: 1, brownout: false, pop: 20, colonies: 1, activeIsHome: true,
  });
  const series = [mkRow(0, 0), mkRow(1, 1000), mkRow(2, 1000), mkRow(3, 1000)];
  const sum = summarizeSeed(series, table);

  assert(sum.years === 3 && sum.finalGy === 3, 'lata liczone od gy≥1 (gy0 = baseline)');
  assert(sum.measured.mine.krPerGyPerLevel === 1000, 'średni przepływ na poziom po latach seeda');
  assert(near(sum.measured.mine.paybackGy, table.mine.cost.krLoaded / 1000, 1e-2),
    'zwrot = koszt w pełni obciążony / mierzony przepływ');
  assert(sum.measured.mine.paybackWithWagesGy > sum.measured.mine.paybackGy,
    'wariant z płacami daje DŁUŻSZY zwrot (płace raportowane, nie ukryte)');
  assert(sum.measured.habitat.paybackGy === null, 'budynek bez dodatniego przepływu: zwrot `null` (nie liczbowy fałsz)');
  assert(sum.measured.habitat.housingPerLevel === 12, 'miejsca mieszkalne na poziom (metryka toru b1)');
  assert(sum.measured.observatory.researchPerGyPerLevel === 6 * CIV_PER_GY, 'nauka/gy na poziom (metryka toru b2)');
  assert(sum.measured.observatory.unpricedOut.includes('research'), 'brak ceny nauki propagowany do podsumowania');
  assert(sum.factory.producedPerGy.structural_alloys === 10, 'przerób fabryki na game-rok = kumulatywnie / lata');
  assert(sum.factory.inputKrPerGy > 0 && sum.factory.producedKrPerGy > 0, 'przerób wyceniony po obu stronach (ruda → towar)');
  assert(near(sum.mineNameplateRatio, sum.minePlateKrPerGy / sum.mineRealKrPerGy, 1e-2),
    'luka nameplate/realny urobek kopalni policzona');
  assert(sum.measured.mine.enoughYears === true, 'próg MIN_YEARS pilnuje, że ROI liczymy z kilku lat');

  const agg = aggregatePanel([sum, sum], [table, table]);
  assert(agg.byType.mine.seeds === 2 && agg.byType.mine.measuredOn === 2, 'agregat liczy seedy i zmierzone seedy osobno');
  assert(agg.byType.mine.medPaybackGy === sum.measured.mine.paybackGy, 'mediana zwrotu po seedach');
  assert(agg.byType.mine.krLoaded === table.mine.cost.krLoaded, 'koszt w agregacie = MEDIANA tabel seedów (koszt zależy od planety)');
  assert(agg.medEmbeddedShare > 0.5, `mediana udziału komponentów w CAŁYM katalogu > 50% (${Math.round(agg.medEmbeddedShare * 100)}%)`);
  assert(agg.catalogSize === Object.keys(BUILDINGS).length, 'agregat zna rozmiar katalogu (pokrycie pomiaru)');

  const v = panelVerdict(agg, table);
  assert([0, 1, 2].includes(v.outcome), 'werdykt zwraca outcome 0/1/2');
  assert(v.best === 'mine' && v.worst === 'solar_farm' && v.n === 2,
    'ranking bierze TYLKO tor produkcyjny (habitat/observatory poza nim), od najszybszego zwrotu');
  assert(near(v.spread, Math.round(v.worstPaybackGy / v.bestPaybackGy * 100) / 100, 0.02),
    'rozrzut = najwolniejszy / najszybszy zwrot');

  // Stolica nie może zafałszować rozrzutu (koszt 0 → zwrot 0)
  const aggCap = aggregatePanel([{ ...sum, measured: { ...sum.measured,
    colony_base: { ...sum.measured.mine, paybackGy: 0, enoughYears: true } } }], [table]);
  const vCap = panelVerdict(aggCap, table);
  assert(vCap.best !== 'colony_base', '⚠ stolica (koszt 0, stawiana automatycznie) WYKLUCZONA z rankingu');

  const vEmpty = panelVerdict({ byType: {} }, table);
  assert(vEmpty.outcome === 2, 'brak zmierzonych budynków produkcyjnych → outcome 2 (NO DATA), nie fałszywe 0');
  assert(Object.keys(ROI_TELEMETRY_DEFAULTS).length === 6, 'komplet knobów pomiaru wystawiony w meta');
}

// ── T8: realny boot przez wspólny driver ──────────────────────────
console.log('T8 — realny GameCore boot przez balans-driver + sample (guard dryfu API)');
{
  const tele = new RoiTelemetry();
  const r = runOneGame({ seed: 'roi-keeper', planetClass: 'REAL', targetGy: 3, telemetry: tele });
  const series = r.series;
  assert(series.length >= 4, `szereg ma próbkę na każdy game-rok (${series.length} ≥ 4: gy0..gy3)`);
  assert(series[0].gy === 0 && series[series.length - 1].gy === 3, 'próbki od gy0 do gy3 (oś w GAME-LATACH)');

  const last = series[series.length - 1];
  assert(last.activeIsHome === true, 'aktywna kolonia = macierzysta');
  assert(Object.keys(last.perType).length >= 3, `bot realnie postawił budynki (${Object.keys(last.perType).length} typów)`);
  assert(last.perType.mine && last.perType.mine.krPerGy > 0, 'kopalnia realnie produkuje wartość (żywe złoża + obsada)');
  assert(last.perType.mine.mineStaff != null, 'obsada kopalni czytana z gry (getMineOutputEstimate nie zdryfował)');
  assert(Object.values(last.perType).every(t => typeof t.krPerGyPerLevel === 'number'), 'każdy typ ma komplet pól');
  assert(last.factory.speedMult > 1, `scenariusz boosted podnosi prędkość fabryki (×${last.factory.speedMult}) — jawne w meta`);

  const costs = buildCostTable(r.home.planet);
  const sum = summarizeSeed(series, costs);
  const prod = Object.entries(sum.measured)
    .filter(([id, m]) => costs[id].tracks.includes(TRACK.PRODUCTIVE) && !costs[id].isCapital && m.paybackGy != null);
  assert(prod.length >= 2, `realny przebieg daje ≥2 budynki produkcyjne ze zwrotem (${prod.length})`);
  assert(prod.every(([, m]) => m.krLoaded > 0), 'każdy zmierzony budynek ma niezerowy koszt w pełni obciążony');
  assert(sum.factory.points >= 0, 'punkty fabryki odczytane z żywego FactorySystem');
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
