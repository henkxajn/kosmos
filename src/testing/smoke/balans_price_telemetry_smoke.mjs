// BALANS 1.0 — Phase 2 — PriceTelemetry keeper (chroni WARSTWĘ B: osiągalność + księgę Kr).
// Instrument NIE ma bramki w przeglądarce → czujnik zepsuty = werdykt zepsuty bez śladu.
//
// Chroni cztery rzeczy, których zepsucie byłoby CICHE:
//   1. KSIĘGĘ Kr: podatek NIE emituje zdarzenia, więc liczy się REZYDUALNIE; handel i płace
//      nie mają `purpose` i rozróżnia je ZNAK delty. Pomylenie tych reguł daje wiarygodnie
//      wyglądający, fałszywy bilans.
//   2. OSIĄGALNOŚĆ liczona REALNĄ bramką gry (`canAfford` + kredyty) i zapamiętanie, KTÓRY
//      klucz brakował — bez blokera „nie stać" nie niesie informacji.
//   3. KONTRFAKTYK ×1 WYDOBYCIE w nakładzie mierzonym: mnożnik scenariusza dotyka WYŁĄCZNIE
//      urobku kopalń. Podzielenie całej stawki (razem z energią) odwróciłoby werdykt
//      o jednostce bazowej — to najgroźniejszy możliwy błąd tego slice'u.
//   4. JEDNOSTKI: stawki gry są per CIV-rok, raport per GAME-rok (HARD #3); utrzymanie floty
//      jest JUŻ per rok gry, a jednostek naziemnych per civ-rok.
//
//   T1  księga Kr — purpose / znak delty / kubełek „other"
//   T2  snapshot — osiągalność, zapas „ile naraz", bloker, brama kredytowa
//   T3  summarizeSeed — 1. rok osiągalności, udział lat, bloker, podatek rezydualny
//   T4  affordClass — progi jako KNOBY (trivial / gating / never)
//   T5  aggregatePanel — remis klas wybiera GORSZĄ, mediany, bloker panelu
//   T6  measuredCapex — jednostki gy, normalizacja na poziom, ×1 wydobycie tylko dla kopalń
//   T7  dynamicVerdict — lista „nigdy"/„bramkuje", NO_DATA zamiast fałszywego OK
//   T8  realny GameCore boot przez WSPÓLNY driver (guard dryfu API)
//
// Uruchom: node src/testing/smoke/balans_price_telemetry_smoke.mjs

import '../headless/env.js';           // MUST be first
import EventBus from '../../core/EventBus.js';
import {
  PriceTelemetry, AFFORD_CLASS, KR_BUCKETS, PRICE_DEFAULTS, CIV_PER_GY,
  affordClass, summarizeSeed, aggregatePanel, dynamicVerdict,
} from '../headless/PriceTelemetry.js';
import { buildPurchaseCatalog } from '../headless/PriceAudit.js';
import { fullyLoadedCost } from '../headless/RoiTelemetry.js';
import { runOneGame } from '../headless/balans-driver.mjs';
import { BUILDINGS } from '../../data/BuildingsData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const NEUTRAL = { atmosphere: 'breathable', surfaceGravity: 1.0, temperatureC: 15 };

// Minimalny stub kolonii — czujnik ma czytać TYLKO przez publiczne API gry.
function stubHome({ stock = {}, credits = 0, planet = NEUTRAL } = {}) {
  const resSys = {
    getAmount: (id) => stock[id] ?? 0,
    canAfford: (cost) => Object.entries(cost).every(([k, v]) => (stock[k] ?? 0) >= v),
    inventory: new Map(Object.entries(stock)),
  };
  return {
    planetId: 'p1', planet, credits, resourceSystem: resSys,
    civSystem: { population: 10, getTotalLaborCost: () => 120 },
    buildingSystem: { _active: new Map() },
    factorySystem: { totalPoints: 2 },
  };
}
const CTX = (home) => ({ home, colonyManager: { getPlayerColonies: () => [home], _activePlanetId: 'p1' }, core: {} });

// ── T1: księga Kr ─────────────────────────────────────────────────
console.log('T1 — księga Kr: purpose / znak delty / „other"');
{
  const t = new PriceTelemetry();
  const home = stubHome({ credits: 1000 });
  t.sample(0, CTX(home));                       // podpina hook przy pierwszej próbce

  EventBus.emit('trade:creditsChanged', { delta: 300 });                                  // handel (+, bez purpose)
  EventBus.emit('trade:creditsChanged', { delta: -40 });                                  // płace (−, bez purpose)
  EventBus.emit('trade:creditsChanged', { delta: -70, purpose: 'fleet_upkeep' });
  EventBus.emit('trade:creditsChanged', { delta: -500, purpose: 'droid_production' });
  EventBus.emit('trade:creditsChanged', { delta: -5, purpose: 'cos_nowego' });             // nieznany → other
  EventBus.emit('trade:creditsChanged', { delta: 0 });                                     // zero ignorowane

  const l = t._ledger;
  assert(l.trade === 300, 'dodatnia delta bez `purpose` → handel');
  assert(l.wages === -40, 'ujemna delta bez `purpose` → płace (ColonyManager nie podaje purpose)');
  assert(l.fleet_upkeep === -70 && l.droid_production === -500, '`purpose` trafia do własnego kubełka');
  assert(l.other === -5, 'nieznany `purpose` NIE ginie — ląduje w „other"');
  assert(KR_BUCKETS.every(b => b in l), 'wszystkie kubełki istnieją od startu (brak `undefined` w raporcie)');

  const row = t.sample(1, CTX(home));
  assert(row.ledger.trade === 300 && row.ledger !== t._ledger, 'migawka niesie KOPIĘ księgi (kumulatywnie), nie referencję');
}

// ── T2: snapshot — osiągalność ────────────────────────────────────
console.log('T2 — snapshot(): osiągalność realną bramką gry + bloker');
{
  const catalog = {
    tani:   { id: 'tani',   kind: 'x', cost: { Fe: 10 }, krCost: 0 },
    drogi:  { id: 'drogi',  kind: 'x', cost: { Fe: 10, structural_alloys: 5 }, krCost: 0 },
    zaKr:   { id: 'zaKr',   kind: 'x', cost: {}, krCost: 500 },
    darmo:  { id: 'darmo',  kind: 'x', cost: {}, krCost: 0 },
  };
  const home = stubHome({ stock: { Fe: 100, structural_alloys: 1 }, credits: 200 });
  const r = PriceTelemetry.snapshot(3, CTX(home), PRICE_DEFAULTS, catalog, {});

  assert(r.items.tani.aff && near(r.items.tani.head, 10), 'stać: zapas „ile naraz" = min po kluczach (100 Fe / 10)');
  assert(!r.items.drogi.aff && r.items.drogi.miss.includes('structural_alloys'),
    'nie stać → bloker wskazuje KONKRETNY brakujący klucz (nie samo „nie stać")');
  assert(!r.items.drogi.miss.includes('Fe'), 'klucz, którego starcza, NIE trafia na listę blokerów');
  assert(!r.items.zaKr.aff && r.items.zaKr.affMat && !r.items.zaKr.affKr && r.items.zaKr.miss.includes('Kr'),
    'brama KREDYTOWA rozróżniona od materiałowej (Kr jako osobny bloker)');
  assert(r.items.darmo.aff && r.items.darmo.head === null, 'pozycja bez kosztu: osiągalna, zapas nie dotyczy (null, nie 0)');
  assert(r.gy === 3 && r.credits === 200 && r.creditsAll === 200, 'migawka niesie rok i stan kredytów');
  assert(near(r.nameplate.wagesPerGy, 120), 'płace „z metki" czytane z getTotalLaborCost (już per rok gry)');
  assert(r.stockKr > 0, 'siła nabywcza magazynu wyceniona tabelą');
}

// ── T3: summarizeSeed ─────────────────────────────────────────────
console.log('T3 — summarizeSeed(): 1. rok, udział, bloker, podatek REZYDUALNY');
{
  const catalog = { a: {}, b: {} };
  const mk = (gy, credits, aff, miss = [], head = 1) => ({
    gy, creditsAll: credits, ledger: { trade: 100, wages: -20 },
    items: { a: { aff, miss, head }, b: { aff: false, miss: ['Ti'], head: 0.2 } },
    localPrice: {}, capexMeasured: {}, nameplate: {},
  });
  const series = [mk(1, 0, false, ['Fe']), mk(2, 0, false, ['Fe']), mk(3, 0, true), mk(4, 200, true)];
  const s = summarizeSeed(series, catalog);

  assert(s.items.a.firstAffordableGy === 3, 'pierwszy game-rok osiągalności zapamiętany');
  assert(s.items.a.yearsAffordable === 2 && near(s.items.a.share, 0.5), 'udział lat panelu policzony');
  assert(s.items.a.blocker === 'Fe', 'bloker = klucz brakujący NAJCZĘŚCIEJ');
  assert(s.items.b.firstAffordableGy === null && s.items.b.cls === AFFORD_CLASS.NEVER, 'pozycja nigdy osiągalna → NEVER');

  // Podatek rezydualny: Δkredytów (200) − suma zdarzeń (100 − 20 = 80) = 120.
  assert(near(s.taxResidualTotal, 120),
    '⚠ podatek liczony REZYDUALNIE (Δkredytów − suma zdarzeń), bo nie emituje zdarzenia');
  assert(near(s.taxResidualPerGy, 120 / 4) && near(s.netKrPerGy, 200 / 4), 'przeliczenie na GAME-ROK po rozpiętości serii');
  assert(s.ledgerPerGy.trade === 25, 'księga też przeliczona na game-rok');
}

// ── T4: affordClass ───────────────────────────────────────────────
console.log('T4 — affordClass(): progi to KNOBY POMIARU');
{
  const c = PRICE_DEFAULTS;
  assert(affordClass({ firstGy: null, share: 0, medHeadroom: 0 }) === AFFORD_CLASS.NEVER, 'brak 1. roku → NEVER');
  assert(affordClass({ firstGy: 1, share: 1, medHeadroom: c.TRIVIAL_MULT }) === AFFORD_CLASS.TRIVIAL,
    'stać zawsze i z zapasem ≥ TRIVIAL_MULT → TRIVIAL');
  assert(affordClass({ firstGy: 1, share: 1, medHeadroom: c.TRIVIAL_MULT - 0.01 }) === AFFORD_CLASS.NORMAL,
    'ten sam udział, mniejszy zapas → już nie „trywialne" (zapas jest częścią definicji)');
  assert(affordClass({ firstGy: c.GATE_LATE_GY + 1, share: 1, medHeadroom: 1 }) === AFFORD_CLASS.GATING,
    'osiągalne dopiero późno → GATING mimo wysokiego udziału');
  assert(affordClass({ firstGy: 1, share: c.GATE_SHARE - 0.01, medHeadroom: 1 }) === AFFORD_CLASS.GATING,
    'rzadko osiągalne → GATING');
  assert(affordClass({ firstGy: 1, share: 0.8, medHeadroom: 1 }) === AFFORD_CLASS.NORMAL, 'reszta → NORMAL');
}

// ── T5: aggregatePanel ────────────────────────────────────────────
console.log('T5 — aggregatePanel(): remis klas wybiera GORSZĄ');
{
  const catalog = { x: {}, y: {} };
  const seed = (cls, first, share, blockers) => ({
    items: {
      x: { cls, firstAffordableGy: first, share, medHeadroom: 1, blockers },
      y: { cls: AFFORD_CLASS.TRIVIAL, firstAffordableGy: 1, share: 1, medHeadroom: 50, blockers: {} },
    },
    ledgerPerGy: { trade: 10 }, capexMeasured: {}, taxResidualPerGy: 5, netKrPerGy: 5,
    creditsEnd: 100, creditsMin: 10, stockKrEnd: 1, commodityKrEnd: 1, localPriceMed: {}, nameplateEnd: {},
  });
  const agg = aggregatePanel([
    seed(AFFORD_CLASS.NEVER, null, 0, { Ti: 5 }),
    seed(AFFORD_CLASS.GATING, 4, 0.3, { Ti: 2, Kr: 1 }),
  ], catalog);

  assert(agg.items.x.cls === AFFORD_CLASS.NEVER,
    '⚠ remis 1:1 → klasa GORSZA (instrument nie ma prawa być optymistyczny)');
  assert(agg.items.x.seedsAffordable === 1 && agg.items.x.seeds === 2,
    'widać, na ilu seedach pozycja BYŁA osiągalna (klasa panelu nie zjada tej informacji)');
  assert(agg.items.x.medFirstAffordableGy === 4, 'mediana 1. roku liczona TYLKO po seedach, gdzie było osiągalne');
  assert(agg.items.x.blocker === 'Ti', 'bloker panelu = najczęstszy bloker po seedach');
  assert(agg.classCounts[AFFORD_CLASS.TRIVIAL] === 1, 'rozkład klas panelu policzony');
  assert(agg.medNetKrPerGy === 5 && agg.ledgerPerGy.trade === 10, 'mediany księgi po seedach');
}

// ── T6: measuredCapex ─────────────────────────────────────────────
console.log('T6 — measuredCapex(): jednostki, poziom, ×1 wydobycie TYLKO dla kopalń');
{
  const prevK = globalThis.window?.KOSMOS;
  globalThis.window.KOSMOS = { scenario: 'civilization_boosted' };   // mnożnik wydobycia ×5

  const home = stubHome();
  home.buildingSystem = {
    _active: new Map([
      // Elektrownia: 2 sztuki, łącznie 3 poziomy — stawki EFEKTYWNE (per civ-rok).
      ['t1', { building: BUILDINGS.solar_farm, level: 2, effectiveRates: { energy: 12 } }],
      ['t2', { building: BUILDINGS.solar_farm, level: 1, effectiveRates: { energy: 6 } }],
      // Kopalnia: urobek NIE jest w `effectiveRates` (rates: {}) — idzie przez estymatę gry.
      ['t3', { building: BUILDINGS.mine, level: 1, effectiveRates: {} }],
    ]),
    getMineOutputEstimate: () => ({ gains: { Fe: 50 } }),
  };
  const cap = PriceTelemetry.measuredCapex(home);

  const solarKr = fullyLoadedCost(BUILDINGS.solar_farm, NEUTRAL).krLoaded;
  const expEnergyPerGy = (18 / 3) * CIV_PER_GY;      // netto ÷ suma poziomów × 12
  assert(near(cap.energy.perGy, expEnergyPerGy, 1e-3), `przepływ na POZIOM i na GAME-ROK (${expEnergyPerGy}/gy)`);
  assert(near(cap.energy.capexPerUnit, solarKr / expEnergyPerGy, 1e-3), 'nakład = koszt w pełni obciążony ÷ przepływ/gy');
  assert(cap.Fe && cap.Fe.from === 'mine' && cap.Fe.mined,
    '⚠ kopalnia MIERZONA przez getMineOutputEstimate (statycznie niewidoczna: rates: {})');

  // Kontrfaktyk: dzielimy WYŁĄCZNIE urobek kopalń.
  assert(near(cap.Fe.capexPerKrUnboosted, cap.Fe.capexPerKr * 5, 1e-2),
    'przy ×1 wydobyciu nakład na Fe rośnie ×5 (mnożnik scenariusza dotyka tylko kopalń)');
  assert(near(cap.energy.capexPerKrUnboosted, cap.energy.capexPerKr, 1e-9),
    '⚠⚠ ENERGIA bez zmian w kontrfaktyku — podzielenie jej też odwróciłoby werdykt o jednostce bazowej');
  assert(cap.energy.mined === false, 'flaga „z kopalni" rozróżnia oba źródła przepływu');

  globalThis.window.KOSMOS = prevK;
  const capPlain = PriceTelemetry.measuredCapex(home);
  assert(near(capPlain.Fe.capexPerKrUnboosted, capPlain.Fe.capexPerKr, 1e-9),
    'poza scenariuszem boosted kontrfaktyk jest tożsamością (mnożnik = 1)');
}

// ── T7: dynamicVerdict ────────────────────────────────────────────
console.log('T7 — dynamicVerdict(): co jest nieosiągalne i co bramkuje');
{
  const mk = (cls) => ({ cls });
  const ok = dynamicVerdict({ items: { a: mk(AFFORD_CLASS.NORMAL), b: mk(AFFORD_CLASS.TRIVIAL) } }, {});
  assert(ok.outcome === 0 && ok.trivialCount === 1, 'nic nieosiągalnego → outcome 0 AFFORDABLE');
  const bad = dynamicVerdict({ items: { a: mk(AFFORD_CLASS.NEVER), b: mk(AFFORD_CLASS.GATING), c: mk(AFFORD_CLASS.NORMAL) } }, {});
  assert(bad.outcome === 1 && bad.neverIds.includes('a') && bad.gatingIds.includes('b'),
    'outcome 1 GATED wymienia pozycje z nazwy (raport pokazuje przy nich bramkę tech)');
  assert(dynamicVerdict({ items: { a: mk(AFFORD_CLASS.NORMAL) } }, {}).outcome === 2, 'pusty/za mały katalog → NO DATA');
}

// ── T8: realny boot przez wspólny driver ──────────────────────────
console.log('T8 — realny GameCore przez WSPÓLNY driver (guard dryfu API gry)');
{
  const t = new PriceTelemetry();
  const r = runOneGame({ seed: 'balans-price-smoke', planetClass: 'REAL', targetGy: 3, telemetry: t });
  const series = r.series;
  assert(!r.crashed && series.length >= 3, `przebieg bez crasha (${series.length} próbek)`);

  const cat = t.getCatalog();
  assert(cat && Object.keys(cat).length > 10, 'katalog zakupów zbudowany z planety tego seeda');
  const last = series[series.length - 1];
  assert(Object.keys(last.items).length === Object.keys(cat).length, 'każda pozycja katalogu ma odczyt osiągalności');
  assert(last.capexMeasured.Fe || last.capexMeasured.energy, 'nakład MIERZONY policzony z żywych budynków');
  assert(Number.isFinite(last.localPrice.Fe),
    'cena realna w grze czytana z CivilianTradeSystem.getLocalPrice (prawdziwy kod, nie kopia formuły)');
  assert(last.activeIsHome, 'próbki dotyczą kolonii MACIERZYSTEJ (parytet z POP / ZASOBAMI / ROI)');

  const s = summarizeSeed(series, cat);
  const agg = aggregatePanel([s], cat);
  const v = dynamicVerdict(agg, cat);
  assert([0, 1, 2].includes(v.outcome), `werdykt policzony na realnym przebiegu (outcome ${v.outcome})`);
  assert(Object.keys(agg.items).length > 0 && s.creditsEnd >= 0, 'agregat i kredyty policzone bez wyjątku');
}

console.log(`\n═══ PriceTelemetry keeper: ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
