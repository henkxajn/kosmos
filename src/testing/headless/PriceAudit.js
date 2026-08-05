// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — PriceAudit (WARSTWA A + A′: audyt TABELI cen, CZYSTY)
// ───────────────────────────────────────────────────────────────
// Slice CENY jest INNY W RODZAJU niż POP / ZASOBY / ROI. Tamte mierzyły ZACHOWANIE
// W CZASIE. Cena jest w ogromnej części TABELĄ STATYCZNĄ (`TradeValuesData.BASE_PRICE`
// + receptury `COMMODITIES`) — liczbami wpisanymi w dane, nie emergencją z rozgrywki.
// Dlatego slice ma DWIE WARSTWY, świadomie trzymane osobno — ten plik to warstwa
// statyczna (zero symulacji, zero `window`, zero gry):
//
//   WARSTWA A  — AUDYT TABELI: czy cennik jest wewnętrznie spójny? Czy cena towaru
//                pokrywa to, co zjada jego receptura? Które ceny odstają od reszty?
//   WARSTWA A′ — PYTANIE O JEDNOSTKĘ BAZOWĄ: slice ROI stoi na relacji
//                `energia = 1 Kr = 1 Fe`. Zanim uwierzymy CZEMUKOLWIEK wyrażonemu
//                w Kr, trzeba sprawdzić, czy ta relacja jest ugruntowana, czy to
//                arbitralna konwencja skrzywiająca wszystko, co się o nią opiera.
//   (WARSTWA B — osiągalność w realnym przebiegu — jest w `PriceTelemetry.js`.)
//
// HARD-CONSTRAINT (Phase 2): INSTRUMENT, NIE REGULATOR. Zero stałych balansu.
// Znaleziska są LOGOWANE, nie naprawiane. Progi poniżej to KNOBY POMIARU — jawnie
// wystawione w meta wyniku, żeby czytelnik wiedział, gdzie postawiono kreskę.
//
// ── ŹRÓDŁA PRAWDY (HARD #2: prawdziwy kod, nie zgadywana kopia) ─────────────
//   • ceny                — `TradeValuesData.BASE_PRICE` (ta sama tabela, po której
//                            handluje `CivilianTradeSystem`)
//   • receptury           — `COMMODITIES.recipe` (+ `creditCost`)
//   • rozwinięcie do rudy — `RoiTelemetry.expandCommodity` / `valueBasket` / `priceOf`
//                            (JEDNO źródło rozwijania receptur w całej Phase 2 — NIE kopiujemy)
//   • koszt budowy        — `RoiTelemetry.fullyLoadedCost` (realna formuła gry + dopłata
//                            środowiskowa) i `nominalNetRates`
//   • ceny kadłubów / statków / jednostek naziemnych / stacji — `HULLS`, `SHIPS`,
//                            `ColonyManager.GROUND_UNIT_*`, `STATIONS`
//
// ── KONWENCJA CENNIKA JAKO KRYTERIUM AUDYTU ────────────────────────────────
// `TradeValuesData` sam deklaruje swoją regułę: „Formuła: koszt surowców w recepturze
// × 1.3 (marża za przetworzenie)". Audyt mierzy ZGODNOŚĆ Z WŁASNĄ REGUŁĄ TABELI, a nie
// z wymyślonym przeze mnie standardem — dlatego odchylenia są faktem, nie opinią.
// `CONVENTION_MARGIN` jest knobem POMIARU (odczytanym z dokumentacji tabeli), nie stałą gry.
//
// ── DESIGN vs BUG: rozstrzygają DANE, nie autor pomiaru ────────────────────
// Towar wyceniony PONIŻEJ wsadu jest oznaczany jako „prawdopodobnie zamierzony sink"
// TYLKO wtedy, gdy same dane niosą marker sinku: `isDroidUnit` albo `creditCost > 0`
// (jawna opłata Kr per sztuka — konwencja droida opisana w `TradeValuesData`).
// Reszta → „niewyjaśnione". Werdykt zostaje po stronie czytelnika (HARD #1).
// ═══════════════════════════════════════════════════════════════

import { COMMODITIES } from '../../data/CommoditiesData.js';
import { BASE_PRICE } from '../../data/TradeValuesData.js';
import { ALL_RESOURCES } from '../../data/ResourcesData.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIPS } from '../../data/ShipsData.js';
import { STATIONS } from '../../data/StationData.js';
import { UNIT_ARCHETYPES } from '../../data/unitArchetypes.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import {
  expandCommodity, valueBasket, priceOf, fullyLoadedCost, nominalNetRates, CIV_PER_GY,
} from './RoiTelemetry.js';

export { CIV_PER_GY, priceOf };

// KNOBY POMIARU (NIE stałe gry). Kopiowane do meta wyniku i drukowane w raporcie.
export const PRICE_DEFAULTS = {
  // ── Warstwa A ──
  CONVENTION_MARGIN: 1.3,    // marża deklarowana przez samą tabelę cen („koszt surowców × 1.3")
  CONVENTION_TOL:    1.35,   // ile razy cena może odbiegać od konwencji, zanim to nazwiemy odchyleniem
  OUTLIER_Z:         3.5,    // robust z-score (mediana + MAD) w skali log — próg outliera
  // ── Warstwa B (osiągalność; używane przez PriceTelemetry) ──
  TRIVIAL_SHARE:     0.90,   // „trywialne" = stać nas przez ≥ tyle lat panelu…
  TRIVIAL_MULT:      10,     // …I zapas ≥ tylu sztuk naraz
  GATE_LATE_GY:      10,     // „bramkuje" = pierwszy raz osiągalne później niż tyle gy…
  GATE_SHARE:        0.50,   // …albo stać nas mniej niż tyle lat panelu
  RATE_EPS:          1e-6,
};

// Klasy wyniku audytu ceny (Warstwa A).
export const PRICE_CLASS = {
  CONFORMS:    'conforms',            // cena mieści się w konwencji tabeli
  OFF:         'off_convention',      // cena odbiega od konwencji, ale pokrywa wsad
  DESIGN_SINK: 'design_sink',         // poniżej wsadu, ale DANE niosą marker sinku (droid/creditCost)
  SUSPECT:     'suspect_below_cost',  // poniżej wsadu BEZ wyjaśnienia w danych
  NO_DATA:     'no_data',             // nie da się wycenić (brak ceny towaru albo surowca we wsadzie)
};

// ═══════════════════════════════════════════════════════════════
// WARSTWA A — audyt tabeli cen
// ═══════════════════════════════════════════════════════════════

/** Czy klucz receptury jest surowcem gry (a nie półproduktem)? */
export function isResource(id) { return id in ALL_RESOURCES; }

/**
 * Wartość BEZPOŚREDNIEGO wsadu receptury po cenach RYNKOWYCH: surowce po `BASE_PRICE`,
 * półprodukty po ICH cenie rynkowej (NIE rozwijane do rudy). To jest liczba, którą miała
 * na myśli konwencja tabeli („koszt surowców × 1.3") i którą realnie płaci gracz, jeśli
 * kupuje półprodukty zamiast je produkować.
 */
export function recipeInputKr(comId) {
  const def = COMMODITIES[comId];
  if (!def) return { kr: 0, unpriced: [], subCommodities: [], ok: false };
  let kr = 0;
  const unpriced = [], subCommodities = [];
  for (const [k, v] of Object.entries(def.recipe ?? {})) {
    if (!(v > 0)) continue;
    if (!isResource(k)) subCommodities.push(k);
    const p = priceOf(k);
    if (p == null) { unpriced.push(k); continue; }
    kr += p * v;
  }
  return { kr: round(kr, 2), unpriced, subCommodities, ok: unpriced.length === 0 };
}

/**
 * Audyt JEDNEGO towaru. Trzy miary kosztu wytworzenia, świadomie NIE sprowadzone do
 * jednej liczby (każda odpowiada na inne pytanie):
 *   oreKr    — pełna ruda po rekurencyjnym rozwinięciu receptury (co gospodarka NAPRAWDĘ oddaje)
 *   directKr — wsad po cenach rynkowych, bez rozwijania półproduktów (co widzi kupujący)
 *   +creditCost — jawna opłata Kr per sztuka (droidy), doliczana do kosztu NABYCIA
 */
export function auditCommodity(comId, cfg = PRICE_DEFAULTS) {
  const def = COMMODITIES[comId];
  if (!def) return null;
  const price = priceOf(comId);
  const exp = expandCommodity(comId, 1);
  const oreVal = valueBasket(exp.res);
  const dir = recipeInputKr(comId);
  const creditCost = def.creditCost ?? 0;

  // Marker SINKU z DANYCH (nie z mojej oceny): droid albo jawna opłata Kr per sztuka.
  const sinkMarked = !!def.isDroidUnit || creditCost > 0;

  // Bez ceny któregokolwiek surowca we wsadzie nie da się policzyć kosztu (np. `fuel` ← H).
  const measurable = price != null && oreVal.unpriced.length === 0 && dir.ok && (oreVal.kr > 0 || dir.kr > 0);

  const conventionKr = round(dir.kr * cfg.CONVENTION_MARGIN, 2);
  const ratioOre     = measurable && oreVal.kr > 0 ? round(price / oreVal.kr, 3) : null;
  const ratioDirect  = measurable && dir.kr > 0 ? round(price / dir.kr, 3) : null;
  const conformance  = measurable && conventionKr > 0 ? round(price / conventionKr, 3) : null;
  // Koszt NABYCIA = ruda + jawna opłata Kr (droid: 7 500 Kr rudy + 500 Kr).
  const acquisitionKr = round(oreVal.kr + creditCost, 2);
  const ratioAcquisition = measurable && acquisitionKr > 0 ? round(price / acquisitionKr, 3) : null;

  const belowOre    = measurable && oreVal.kr > 0 && price < oreVal.kr;
  const belowDirect = measurable && dir.kr > 0 && price < dir.kr;

  // Rozróżnienie WEWNĄTRZ „no data" jest samo w sobie znaleziskiem: towar bez ceny
  // w tabeli (nie da się nim handlować — `TRADEABLE_GOODS` to klucze `BASE_PRICE`) to
  // co innego niż towar, którego WSAD ma surowiec bez ceny (np. `fuel` ← H).
  const noDataReason = price == null ? 'no_price_in_table'
    : (oreVal.unpriced.length || !dir.ok) ? 'unpriced_input' : null;

  let cls;
  if (!measurable) cls = PRICE_CLASS.NO_DATA;
  else if (belowOre || belowDirect) cls = sinkMarked ? PRICE_CLASS.DESIGN_SINK : PRICE_CLASS.SUSPECT;
  else if (conformance != null && (conformance > cfg.CONVENTION_TOL || conformance < 1 / cfg.CONVENTION_TOL))
    cls = PRICE_CLASS.OFF;
  else cls = PRICE_CLASS.CONFORMS;

  return {
    id: comId, tier: def.tier ?? null, price,
    oreKr: round(oreVal.kr, 2), directKr: dir.kr, conventionKr, acquisitionKr, creditCost,
    ratioOre, ratioDirect, ratioAcquisition, conformance,
    belowOre, belowDirect, sinkMarked, measurable,
    priced: price != null, noDataReason,
    subCommodities: dir.subCommodities,
    unpricedInputs: [...new Set([...oreVal.unpriced, ...dir.unpriced])],
    baseTime: def.baseTime ?? null, weight: def.weight ?? null,
    requiresTech: def.requiresTech ?? null,
    isConsumerGood: !!def.isConsumerGood,
    cls,
  };
}

/**
 * Audyt CAŁEJ tabeli. Zwraca też surowce (nie mają receptury → nie mają „wsadu";
 * ich spójność bada Warstwa A′) i klucze cen bez definicji towaru/surowca.
 */
export function auditPriceTable(cfg = PRICE_DEFAULTS) {
  const commodities = {};
  for (const id of Object.keys(COMMODITIES)) {
    const a = auditCommodity(id, cfg);
    if (a) commodities[id] = a;
  }
  const resources = {};
  for (const id of Object.keys(ALL_RESOURCES)) {
    resources[id] = {
      id, price: priceOf(id),
      priced: priceOf(id) != null,
      inRecipes: recipeUsers(id),
    };
  }
  const orphanPrices = Object.keys(BASE_PRICE).filter(k => !(k in COMMODITIES) && !(k in ALL_RESOURCES));

  const below = Object.values(commodities).filter(c => c.belowOre || c.belowDirect);
  const byCls = (c) => Object.values(commodities).filter(x => x.cls === c).length;
  const stats = {
    total: Object.keys(commodities).length,
    measurable: Object.values(commodities).filter(c => c.measurable).length,
    conforms:   byCls(PRICE_CLASS.CONFORMS),
    off:        byCls(PRICE_CLASS.OFF),
    designSink: byCls(PRICE_CLASS.DESIGN_SINK),
    suspect:    byCls(PRICE_CLASS.SUSPECT),
    noData:     byCls(PRICE_CLASS.NO_DATA),
    belowCost:  below.length,
    unpricedGoods: Object.values(commodities).filter(c => c.noDataReason === 'no_price_in_table').map(c => c.id),
    unpricedInputGoods: Object.values(commodities).filter(c => c.noDataReason === 'unpriced_input').map(c => c.id),
    unpricedResources: Object.values(resources).filter(r => !r.priced).map(r => r.id),
    orphanPrices,
  };
  return { commodities, resources, stats, outliers: priceOutliers(commodities, cfg) };
}

/** Ile receptur (i których) używa danego klucza — pokazuje, co realnie zależy od tej ceny. */
export function recipeUsers(id) {
  const users = [];
  for (const [cid, def] of Object.entries(COMMODITIES)) {
    if ((def.recipe ?? {})[id] > 0) users.push(cid);
  }
  return users;
}

/**
 * Odstające ceny — robust z-score (mediana + MAD) na LOGARYTMIE zgodności z konwencją
 * tabeli. Log, bo „×0.06" i „×16" to symetryczne odchylenia multiplikatywne; mediana+MAD,
 * bo pojedynczy skrajny sink nie ma prawa przesunąć progu dla reszty.
 */
export function priceOutliers(commodities, cfg = PRICE_DEFAULTS) {
  const rows = Object.values(commodities).filter(c => c.measurable && c.conformance > 0);
  if (rows.length < 4) return [];
  const logs = rows.map(c => Math.log10(c.conformance));
  const med = median(logs);
  const mad = median(logs.map(v => Math.abs(v - med))) || 1e-9;
  const sigma = 1.4826 * mad;   // MAD → σ dla rozkładu normalnego
  return rows
    .map((c, i) => ({ id: c.id, conformance: c.conformance, z: round((logs[i] - med) / sigma, 2), cls: c.cls }))
    .filter(r => Math.abs(r.z) >= cfg.OUTLIER_Z)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

/**
 * Werdykt WARSTWY A (tabela): czy cennik jest wewnętrznie spójny?
 *   0 COHERENT — brak niewyjaśnionych cen poniżej wsadu i brak outlierów konwencji
 *   1 SUSPECT  — są pozycje wymagające decyzji projektanta
 *   2 NO_DATA  — za mało wycenialnych towarów
 * Sinki oznaczone w DANYCH nie liczą się do outlierów — to nie pomyłka, tylko konwencja.
 */
export function staticVerdict(audit, cfg = PRICE_DEFAULTS) {
  const st = audit?.stats ?? {};
  if (!(st.measurable > 3)) {
    return { outcome: 2, label: 'NO DATA — za mało towarów z policzalnym wsadem', suspect: 0, outliers: 0 };
  }
  const suspect = st.suspect ?? 0;
  const outlierRows = (audit.outliers ?? []).filter(o => o.cls !== PRICE_CLASS.DESIGN_SINK);
  if (suspect === 0 && outlierRows.length === 0) {
    return {
      outcome: 0, suspect, outliers: 0, outlierIds: [],
      label: `COHERENT — ${st.conforms}/${st.measurable} cen w konwencji tabeli, 0 niewyjaśnionych poniżej wsadu`,
    };
  }
  return {
    outcome: 1, suspect, outliers: outlierRows.length, outlierIds: outlierRows.map(o => o.id),
    label: `SUSPECT — ${suspect} cen poniżej wsadu bez markera sinku, ${outlierRows.length} odstających od konwencji tabeli`,
  };
}

// ═══════════════════════════════════════════════════════════════
// WARSTWA A′ — jednostka bazowa (energia = 1 Kr = 1 Fe?)
// ═══════════════════════════════════════════════════════════════

/**
 * NAKŁAD INWESTYCYJNY NA JEDNOSTKĘ PRZEPŁYWU — jedyny test jednostki bazowej, jaki da
 * się zrobić WEWNĄTRZ danych gry, bez wymyślania zewnętrznego standardu.
 *
 * Idea: jeśli tabela wycenia 1 energii tak samo jak 1 Fe, to wyprodukowanie 1 energii/gy
 * powinno kosztować gracza tyle samo nakładu, co wyprodukowanie 1 Fe/gy. Dla każdego
 * wycenianego zasobu szukamy w katalogu NAJTAŃSZEGO budynku, który go produkuje:
 *   capexPerUnit = koszt budynku w pełni obciążony (Kr rudy) ÷ (netto zasobu na GAME-YEAR)
 *   capexPerKr   = capexPerUnit ÷ cena zasobu   ← porównywalne MIĘDZY zasobami
 * `capexPerKr` = „ile Kr nakładu kupuje 1 Kr/gy wartości TEGO zasobu" (czyli zwrot w gy,
 * gdyby budynek produkował wyłącznie ten zasób). Gdyby ceny odzwierciedlały nakład
 * produkcyjny, `capexPerKr` byłoby PODOBNE dla wszystkich zasobów. Rozjazd = skrzywienie
 * jednostki bazowej — mierzalne, nie uznaniowe.
 *
 * GRANICE (jawne): stawki NOMINALNE (poziom 1, bez terenu/tech/obsady — slice ROI pokazał,
 * że zaniżają realny wynik 2–3×, ale porównanie jest WZGLĘDNE); budynek wieloproduktowy
 * dostaje CAŁY koszt przypisany do każdego wyjścia (pole `outputs` to sygnalizuje);
 * KOPALNIE mają `rates: {}` (urobek liczony ze złóż) → nie mają statycznego producenta,
 * ich nakład dostarcza dopiero warstwa MIERZONA (`PriceTelemetry.measuredCapex`).
 */
export function capexTable(planet, cfg = PRICE_DEFAULTS) {
  const all = {};
  for (const b of Object.values(BUILDINGS)) {
    if (b.isCapital) continue;
    const cost = fullyLoadedCost(b, planet);
    if (!(cost.krLoaded > 0)) continue;
    const net = nominalNetRates(b);
    const outputs = Object.entries(net).filter(([k, v]) => v > cfg.RATE_EPS && priceOf(k) != null);
    for (const [r, v] of outputs) {
      const perGy = v * CIV_PER_GY;
      const capexPerUnit = cost.krLoaded / perGy;
      (all[r] ?? (all[r] = [])).push({
        resource: r, price: priceOf(r), from: b.id,
        requires: b.requires ?? null,
        perGy: round(perGy, 3),
        capexPerUnit: round(capexPerUnit, 3),
        capexPerKr: round(capexPerUnit / priceOf(r), 3),
        outputs: outputs.length,
        source: 'nominal',
      });
    }
  }
  // Czoło efektywności + 2 kolejne warianty. Czoło bywa budynkiem PÓŹNEJ tech (np.
  // generator próżniowy) — bez listy alternatyw czytelnik nie widziałby, że „najtańsza
  // energia" jest dostępna dopiero w endgame. Pole `requires` to pokazuje.
  const best = {};
  for (const [r, rows] of Object.entries(all)) {
    rows.sort((a, b) => a.capexPerKr - b.capexPerKr);
    best[r] = { ...rows[0], alternatives: rows.slice(1, 3), producers: rows.length };
  }
  return best;
}

/**
 * Ocena jednostki bazowej: porównuje `capexPerKr` zasobów względem MEDIANY panelu.
 * `impliedPriceFactor` = o ile trzeba by pomnożyć cenę zasobu, żeby jego nakład zrównał
 * się z medianą — jawna miara „o ile ta cena jest nie na miejscu" WEWNĄTRZ logiki samej
 * gry. Niczego nie zmieniamy; podajemy liczbę (HARD #1).
 *
 * @param {object}   capex — tabela z `capexTable` (nominalna), opcjonalnie scalona z mierzoną
 * @param {string[]} focus — para pod lupą (domyślnie energia vs Fe — na tej relacji stoi ROI)
 */
export function assessBaseUnit(capex, focus = ['energy', 'Fe'], cfg = PRICE_DEFAULTS) {
  const rows = Object.values(capex ?? {}).filter(r => Number.isFinite(r.capexPerKr) && r.capexPerKr > 0);
  if (rows.length < 2) return { ok: false, reason: 'za mało zasobów z policzalnym nakładem', byResource: {}, pair: {}, n: rows.length };
  const med = median(rows.map(r => r.capexPerKr));
  const out = {};
  for (const r of rows) {
    out[r.resource] = {
      ...r,
      relativeToMedian: round(r.capexPerKr / med, 3),
      // Cena „implikowana nakładem": ile musiałaby wynosić, żeby nakład = mediana.
      impliedPrice: round(r.price * (r.capexPerKr / med), 3),
      impliedPriceFactor: round(r.capexPerKr / med, 3),
    };
  }
  // `listedRatio`  — ile razy tabela wycenia A drożej niż B (dla energia:Fe = 1.0)
  // `impliedRatio` — ile razy DROŻSZY jest nakład na 1 Kr wartości A niż B
  // `skew`         — iloraz obu: 1.0 = jednostka bazowa ugruntowana, >1 = A niedowartościowane
  const pair = { missing: focus.filter(f => !out[f]) };
  if (focus.length === 2 && out[focus[0]] && out[focus[1]]) {
    const [a, b] = focus;
    pair.a = a; pair.b = b;
    pair.listedRatio  = round(out[a].price / out[b].price, 3);
    pair.impliedRatio = round(out[a].capexPerKr / out[b].capexPerKr, 3);
    pair.skew = pair.listedRatio > 0 ? round(pair.impliedRatio / pair.listedRatio, 3) : null;
    pair.capexA = out[a].capexPerKr; pair.capexB = out[b].capexPerKr;
    pair.fromA = out[a].from; pair.fromB = out[b].from;
  }
  return { ok: true, medianCapexPerKr: round(med, 3), byResource: out, pair, n: rows.length };
}

// ═══════════════════════════════════════════════════════════════
// KATALOG ZAKUPÓW — rzeczy, za które gracz PŁACI (wsad Warstwy B)
// ═══════════════════════════════════════════════════════════════

/** Rozdziel koszyk kosztu na surowce i towary (dwa magazyny w UI, jeden `canAfford`). */
export function splitBasket(basket) {
  const res = {}, com = {};
  for (const [k, v] of Object.entries(basket ?? {})) {
    if (!(v > 0)) continue;
    if (isResource(k)) res[k] = v; else com[k] = v;
  }
  return { res, com };
}

/** Koszt W PEŁNI OBCIĄŻONY dowolnego koszyka (ruda + ruda schowana w towarach). */
export function loadedBasketKr(basket) {
  const { res, com } = splitBasket(basket);
  const embedded = {};
  let credits = 0;
  for (const [c, q] of Object.entries(com)) {
    const e = expandCommodity(c, q);
    for (const [r, v] of Object.entries(e.res)) embedded[r] = (embedded[r] ?? 0) + v;
    credits += e.credits;
  }
  const vD = valueBasket(res), vE = valueBasket(embedded), vC = valueBasket(com);
  return {
    krDirect: round(vD.kr, 1), krEmbedded: round(vE.kr, 1),
    krLoaded: round(vD.kr + vE.kr, 1),
    krTicket: round(vD.kr + vC.kr, 1),          // „cena z metki" — towary po cenie rynkowej
    embeddedCredits: round(credits, 1),
    unpriced: [...new Set([...vD.unpriced, ...vE.unpriced])],
  };
}

/**
 * Katalog zakupów: rzeczy, za które gracz PŁACI (poza budynkami — te ma slice ROI, a ich
 * blokowanie mierzy slice ZASOBY). Każda pozycja niesie koszt materiałowy (ruda + towary),
 * jawną cenę w Kr i utrzymanie. Wszystko z prawdziwych danych gry — bez przepisanej kopii.
 */
export function buildPurchaseCatalog(planet, cfg = PRICE_DEFAULTS) {
  const items = {};
  const add = (id, kind, name, basket, krCost, upkeepKrPerGy, extra = {}) => {
    const { res, com } = splitBasket(basket);
    const loaded = loadedBasketKr(basket);
    items[id] = {
      id, kind, name,
      cost: { ...res, ...com }, res, com,
      krCost: round(krCost ?? 0, 1),
      upkeepKrPerGy: round(upkeepKrPerGy ?? 0, 1),
      ...loaded,
      // Pełny koszt nabycia w jednej walucie: ruda w Kr + jawna opłata Kr.
      totalKr: round(loaded.krLoaded + (krCost ?? 0), 1),
      ...extra,
    };
  };

  // ── Kadłuby (gołe) — realne pola `cost`/`commodityCost`/`upkeepCredits` ──
  for (const h of Object.values(HULLS)) {
    add(h.id, 'hull', h.namePL ?? h.id, { ...(h.cost ?? {}), ...(h.commodityCost ?? {}) },
      0, h.upkeepCredits ?? 0, { requires: h.requires ?? null, size: h.size ?? null, crewCost: h.crewCost ?? 0 });
  }
  // ── Statki legacy (`SHIPS`) — wciąż budowalne przez `startShipBuild` ──
  for (const s of Object.values(SHIPS)) {
    if (items[s.id]) continue;
    add(s.id, 'ship', s.namePL ?? s.id, { ...(s.cost ?? {}), ...(s.commodityCost ?? {}) },
      0, s.upkeepCredits ?? 0, { requires: s.requires ?? null, legacy: true });
  }
  // ── Droidy / androidy — towar z fabryki + jawna opłata Kr per sztuka ──
  for (const [id, def] of Object.entries(COMMODITIES)) {
    if (!def.isDroidUnit) continue;
    add(id, 'droid', def.namePL ?? id, { ...(def.recipe ?? {}) },
      def.creditCost ?? 0, 0, { requires: def.requiresTech ?? null, tier: def.droidTier ?? null, marketPrice: priceOf(id) });
  }
  // ── Jednostki naziemne — rzadkie surowce + towary + Kr rekrutacji ──
  const gRes = ColonyManager?.GROUND_UNIT_BUILD_COSTS ?? {};
  const gCom = ColonyManager?.GROUND_UNIT_COMMODITY_COSTS ?? {};
  const gKr  = ColonyManager?.GROUND_UNIT_CREDITS_BUILD ?? {};
  const gUp  = ColonyManager?.GROUND_UNIT_UPKEEP ?? {};
  for (const id of Object.keys(gRes)) {
    add(`ground_${id}`, 'ground_unit', UNIT_ARCHETYPES?.[id]?.namePL ?? id,
      { ...(gRes[id] ?? {}), ...(gCom[id] ?? {}) }, gKr[id] ?? 0,
      // Utrzymanie jednostek naziemnych nalicza się co 1.0 CIV-roku → ×CIV_PER_GY na game-rok.
      (gUp[id]?.credits ?? 0) * CIV_PER_GY, { archetype: id });
  }
  // ── Stacja orbitalna — koszt z `StationData` ──
  for (const st of Object.values(STATIONS ?? {})) {
    add(`station_${st.id}`, 'station', st.namePL ?? st.id,
      { ...(st.cost ?? {}), ...(st.commodityCost ?? {}) }, 0, 0, { requires: st.requires ?? null });
  }
  // ── Przyspieszenie stoczni — czysty sink Kr (bez materiałów) ──
  if (ColonyManager?.SURGE_KR_COST != null) {
    add('shipyard_surge', 'service', 'Przyspieszenie stoczni', {}, ColonyManager.SURGE_KR_COST, 0,
      { popCost: ColonyManager.SURGE_POP_COST ?? 0 });
  }
  return items;
}

// ── Narzędzia liczbowe ────────────────────────────────────────────
export function round(n, d) {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
export function median(arr) {
  const a = (arr ?? []).filter(v => Number.isFinite(v)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const m = a.length >> 1;
  return round(a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2, 3);
}

export default auditPriceTable;
