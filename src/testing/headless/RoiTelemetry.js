// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — RoiTelemetry (czujnik KOSZT↔WARTOŚĆ budynków, READ-ONLY)
// ───────────────────────────────────────────────────────────────
// Odpowiada na pytanie slice'u: „czy koszt budynku jest proporcjonalny do tego,
// co budynek daje" — i na intuicję gracza „wiele budynków daje mało".
//
// HARD-CONSTRAINT (Phase 2): instrument, nie regulator. Zero stałych balansu.
// Progi poniżej to KNOBY heurystyki pomiaru — jawnie wystawione w wyniku.
//
// ── DWIE STRONY ────────────────────────────────────────────────
//
// KOSZT — liczony REALNĄ formułą gry (`computeBuildResourceCost` /
//   `computeBuildCommodityCost` — ta sama, której używa `_build`), ale w wersji
//   W PEŁNI OBCIĄŻONEJ: komponent (structural_alloys…) jest robiony przez fabrykę
//   z rudy, więc niesie UKRYTY koszt surowcowy. Rozwijamy recepturę
//   (`COMMODITIES.recipe`, rekurencyjnie — receptura może zawierać inne towary)
//   aż do surowców i sumujemy:
//     bezpośredni  = ruda z `cost`
//     wbudowany    = ruda schowana w `commodityCost`
//     w pełni obciążony = bezpośredni + wbudowany
//   Pokazujemy OBIE liczby — udział „wbudowany / w pełni obciążony" mówi, jaka
//   część prawdziwego kosztu przechodzi przez fabrykę.
//
// WARTOŚĆ — DWA TORY, świadomie NIE sprowadzane do jednej liczby:
//   (a) budynki PRODUKCYJNE (kopalnie, elektrownie, farmy, studnie, konwertery) —
//       twarde ROI: przepływ netto zasobów (produkcja − utrzymanie − energia,
//       czyli DOKŁADNIE `effectiveRates` gry) → zwrot w GAME-LATACH;
//   (b) budynki NIE-TOWAROWE (mieszkalne → miejsca, laboratoria → nauka,
//       handlowe → przepustowość/Kr, reszta) — WŁASNA metryka funkcjonalna,
//       raportowana OSOBNO. Wspólny mianownik dla tych zrobiłby liczby, które
//       wyglądają na porównywalne, a nie są.
//
// ── WSPÓLNA JEDNOSTKA TORU (a): Kr wg CEN GRY ──────────────────
// Żeby porównać „30 Fe + 10 C" z „8 energii/rok", trzeba wspólnej miary. Używamy
// `TradeValuesData.BASE_PRICE` — WŁASNEJ tabeli wyceny gry (ta sama, po której
// handluje CivilianTradeSystem), NIE wymyślonych wag. Cały koszt sprowadzamy do
// RUDY (bezpośredniej + wbudowanej) i wyceniamy rudę, więc obie strony są w tych
// samych „Kr rudy". `research` NIE MA ceny w tabeli gry — dlatego laboratoria
// NIE mogą wejść do toru (a); to nie wybór metodologiczny, tylko brak danych.
// Wszystkie założenia wyceny lądują w skrzynce uczciwości raportu.
//
// ── CO JEST MIERZONE, A CO POLICZONE Z DANYCH ─────────────────
//   • MIERZONE (żywa gra, raz na GAME-YEAR): `effectiveRates` każdej instancji
//     budynku w kolonii macierzystej (zawierają teren, tech, obsadę, poziom,
//     utrzymanie i energię), realny urobek kopalń (`getMineOutputEstimate` —
//     obsada × dostępność energii × wyczerpanie złoża), przerób fabryki
//     (`factory:produced`), płace strat.
//   • NOMINALNE (z DANYCH, poziom 1, bez terenu/tech/środowiska): dla budynków,
//     których bot nigdy nie postawił — inaczej 2/3 katalogu byłoby niewidoczne.
//     Raport oznacza oba źródła.
//
// ⚠ ZAKRES: kolonia MACIERZYSTA (jak POP i ZASOBY). Flaga `activeIsHome` pilnuje
// spójności odczytów globalnych.
// ═══════════════════════════════════════════════════════════════

import EventBus from '../../core/EventBus.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { BASE_PRICE } from '../../data/TradeValuesData.js';
import { ALL_RESOURCES } from '../../data/ResourcesData.js';
import { computeBuildResourceCost, computeBuildCommodityCost } from '../../data/EnvironmentCost.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

// 1 game-year = CIV_TIME_SCALE civ-years. Stawki gry są PER CIV-YEAR (HARD #3).
export const CIV_PER_GY = GAME_CONFIG.CIV_TIME_SCALE;

// KNOBY heurystyki pomiaru (NIE stałe gry). Kopiowane do meta wyniku.
export const ROI_TELEMETRY_DEFAULTS = {
  PAYBACK_FAST_GY:  1.0,    // zwrot ≤ 1 gy = budynek spłaca się natychmiast
  PAYBACK_SLOW_GY: 10.0,    // zwrot ≥ 10 gy = budynek spłaca się wolno
  SPREAD_FLAT:     10.0,    // rozrzut zwrotu max/min ≤ 10× = koszty proporcjonalne
  MIN_YEARS:        2,      // ile seed-lat budynek musi istnieć, żeby liczyć MIERZONE ROI
  RATE_EPS:         0.001,  // stawka ≤ to ≈ zero
  MAX_RECIPE_DEPTH: 8,      // bezpiecznik rekurencji rozwijania receptur
};

// Tory wartości. Budynek MOŻE być w kilku (arkologia = mieszkania + żywność) —
// tory to WIDOKI, nie podział rozłączny.
export const TRACK = {
  PRODUCTIVE: 'productive',  // wyjście = zasób/energia z ceną → twarde ROI
  HOUSING:    'housing',     // wyjście = miejsca mieszkalne
  RESEARCH:   'research',    // wyjście = nauka (BEZ ceny w tabeli gry)
  TRADE:      'trade',       // wyjście = przepustowość handlu / zasięg (→ Kr pośrednio)
  OTHER:      'other',       // wyjście niemierzalne w tym slice (obrona, ustrój, kultura…)
};

/** Cena jednostki wg tabeli gry; `null` = gra nie wycenia tego klucza. */
export function priceOf(id) {
  const p = BASE_PRICE[id];
  return Number.isFinite(p) ? p : null;
}

// ═══════════════════════════════════════════════════════════════
// KOSZT — rozwinięcie towaru do surowców + koszt w pełni obciążony
// ═══════════════════════════════════════════════════════════════

/**
 * Rozwiń `qty` sztuk towaru `comId` do SUROWCÓW (rekurencyjnie — receptura może
 * zawierać inne towary, np. warp_cores ← quantum_cores). Czysta funkcja.
 * @returns {{ res: Object, credits: number, unknown: Object, depth: number, cyclic: string[] }}
 *   res     — surowce (ALL_RESOURCES) potrzebne łącznie
 *   credits — Kr wpisane wprost w recepturę (`creditCost`, np. droidy)
 *   unknown — klucze, których nie da się rozwinąć (ani surowiec, ani towar)
 *   cyclic  — wykryte cykle receptur (nie powinny istnieć; raport je pokaże)
 */
export function expandCommodity(comId, qty = 1, cfg = ROI_TELEMETRY_DEFAULTS) {
  const out = { res: {}, credits: 0, unknown: {}, depth: 0, cyclic: [] };
  _expand(comId, qty, out, new Set(), 0, cfg);
  return out;
}

function _expand(comId, qty, out, seen, depth, cfg) {
  const def = COMMODITIES[comId];
  if (!def) { out.unknown[comId] = (out.unknown[comId] ?? 0) + qty; return; }
  if (seen.has(comId) || depth > cfg.MAX_RECIPE_DEPTH) { out.cyclic.push(comId); return; }
  seen.add(comId);
  if (depth > out.depth) out.depth = depth;
  out.credits += (def.creditCost ?? 0) * qty;
  for (const [k, v] of Object.entries(def.recipe ?? {})) {
    if (k in ALL_RESOURCES) out.res[k] = (out.res[k] ?? 0) + v * qty;
    else _expand(k, v * qty, out, seen, depth + 1, cfg);
  }
  seen.delete(comId);
}

/** Wycena koszyka surowców wg tabeli gry. Klucze bez ceny wracają w `unpriced`. */
export function valueBasket(basket) {
  let kr = 0;
  const unpriced = [];
  for (const [k, v] of Object.entries(basket ?? {})) {
    if (!(v > 0)) continue;
    const p = priceOf(k);
    if (p == null) { unpriced.push(k); continue; }
    kr += p * v;
  }
  return { kr, unpriced };
}

/**
 * Koszt budowy budynku, W PEŁNI OBCIĄŻONY. Używa REALNEJ formuły gry (z dopłatą
 * środowiskową planety tej kolonii), a potem rozwija komponenty do rudy.
 *   latBuildCost = 1 (modyfikator polarny zna tylko `_build` z kafla) — świadoma
 *   granica pomiaru, ta sama co w slice ZASOBY: zaniża koszt na kaflach polarnych.
 */
export function fullyLoadedCost(building, planet, cfg = ROI_TELEMETRY_DEFAULTS) {
  const direct    = computeBuildResourceCost(building, planet, 1);
  const commodity = computeBuildCommodityCost(building, planet);

  const embedded = {};
  let credits = 0;
  const unknown = new Set(), cyclic = new Set();
  for (const [c, q] of Object.entries(commodity)) {
    if (!(q > 0)) continue;
    const e = expandCommodity(c, q, cfg);
    for (const [r, v] of Object.entries(e.res)) embedded[r] = (embedded[r] ?? 0) + v;
    credits += e.credits;
    for (const k of Object.keys(e.unknown)) unknown.add(k);
    for (const k of e.cyclic) cyclic.add(k);
  }

  const loaded = { ...direct };
  for (const [r, v] of Object.entries(embedded)) loaded[r] = (loaded[r] ?? 0) + v;

  const vD = valueBasket(direct), vE = valueBasket(embedded), vC = valueBasket(commodity);
  const krLoaded = vD.kr + vE.kr;
  return {
    direct, commodity, embedded, loaded,
    krDirect:   round(vD.kr, 1),
    krEmbedded: round(vE.kr, 1),
    krLoaded:   round(krLoaded, 1),
    // „Cena z metki": to, co gracz widzi w UI — ruda + komponenty po cenie rynkowej
    // (BASE_PRICE towaru = ruda ×1.3 marży). Osobna liczba, NIE mianownik ROI.
    krTicket:   round(vD.kr + vC.kr, 1),
    embeddedShare: krLoaded > 0 ? round(vE.kr / krLoaded, 3) : 0,
    credits:    round(credits, 1),
    unpriced:   [...new Set([...vD.unpriced, ...vE.unpriced])],
    unknown:    [...unknown],
    cyclic:     [...cyclic],
  };
}

/** Koszt ULEPSZENIA do poziomu `lvl` (realna formuła `_upgrade`: base × lvl × 1.2;
 *  commodities od Lv3 × (lvl−1)). Czysta — pozwala pokazać, jak ROI ulepszeń więdnie. */
export function upgradeCostAt(building, planet, lvl, cfg = ROI_TELEMETRY_DEFAULTS) {
  if (lvl < 2) return null;
  const base = computeBuildResourceCost(building, planet, 1);
  const com  = computeBuildCommodityCost(building, planet);
  const direct = {};
  for (const [k, v] of Object.entries(base)) direct[k] = Math.ceil(v * lvl * 1.2);
  const commodity = {};
  if (lvl >= 3) for (const [k, v] of Object.entries(com)) commodity[k] = Math.ceil(v * (lvl - 1));

  const embedded = {};
  for (const [c, q] of Object.entries(commodity)) {
    const e = expandCommodity(c, q, cfg);
    for (const [r, v] of Object.entries(e.res)) embedded[r] = (embedded[r] ?? 0) + v;
  }
  const kr = valueBasket(direct).kr + valueBasket(embedded).kr;
  return { level: lvl, direct, commodity, krLoaded: round(kr, 1) };
}

/** Ile GAME-LAT WYŁĄCZNEGO czasu fabryki pochłaniają komponenty budynku.
 *  ⚠ `COMMODITIES.baseTime` jest w CIV-LATACH mimo komentarza „lata gry" w danych:
 *  `FactorySystem._update` dostaje `civDeltaYears` i porównuje z `baseTime/(points×speed)`.
 *  Dlatego dzielimy przez CIV_PER_GY (HARD #3). Przepustowość skaluje liczba punktów
 *  (1 na budynek `factory`) × mnożniki prędkości. Rekurencyjnie — półprodukty też
 *  muszą przejść przez fabrykę. To czas NOMINALNY (fabryka na 100% dla tego budynku);
 *  realnie punkty dzielą się między kilkanaście receptur — patrz przerób mierzony. */
export function factoryTimeGy(building, planet, { points = 1, speedMult = 1 } = {}) {
  const com = computeBuildCommodityCost(building, planet);
  let years = 0;
  const walk = (id, qty, depth) => {
    const def = COMMODITIES[id];
    if (!def || depth > ROI_TELEMETRY_DEFAULTS.MAX_RECIPE_DEPTH) return;
    years += (def.baseTime ?? 0) * qty;
    for (const [k, v] of Object.entries(def.recipe ?? {})) {
      if (!(k in ALL_RESOURCES)) walk(k, v * qty, depth + 1);
    }
  };
  for (const [c, q] of Object.entries(com)) walk(c, q, 0);
  const eff = Math.max(1e-9, points * speedMult);
  return round(years / eff / CIV_PER_GY, 3);
}

/**
 * Cena rynkowa towaru vs wartość RUDY, którą zjada jego receptura (dane, nie pomiar).
 * Potrzebne, żeby uczciwie czytać „wartość dodaną" fabryki: kilka towarów gra wycenia
 * PONIŻEJ rudy w recepturze (świadomy sink produkcyjny — patrz komentarz przy droidzie
 * w TradeValuesData), więc przerób w Kr potrafi wyjść ujemny. Ceny to osobny slice —
 * tutaj tylko odnotowujemy, NIE rozstrzygamy.
 */
export function commodityPriceVsOre(cfg = ROI_TELEMETRY_DEFAULTS) {
  const out = {};
  for (const id of Object.keys(COMMODITIES)) {
    const e = expandCommodity(id, 1, cfg);
    const ore = valueBasket(e.res).kr;
    const price = priceOf(id);
    out[id] = {
      price, oreKr: round(ore, 1),
      credits: round(e.credits, 1),
      ratio: price != null && ore > 0 ? round(price / ore, 3) : null,
      belowOre: price != null && ore > 0 ? price < ore : false,
    };
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// WARTOŚĆ — klasyfikacja torów + wycena przepływu
// ═══════════════════════════════════════════════════════════════

/** Stawki netto Z DANYCH (poziom 1, bez terenu/tech/środowiska): rates − energyCost − maintenance. */
export function nominalNetRates(building) {
  const net = {};
  for (const [k, v] of Object.entries(building.rates ?? {})) net[k] = (net[k] ?? 0) + v;
  if (building.energyCost > 0) net.energy = (net.energy ?? 0) - building.energyCost;
  for (const [k, v] of Object.entries(building.maintenance ?? {})) net[k] = (net[k] ?? 0) - v;
  return net;
}

/** Wartość przepływu (stawki PER CIV-YEAR) w Kr na GAME-YEAR. */
export function flowValueKrPerGy(rates, cfg = ROI_TELEMETRY_DEFAULTS) {
  let kr = 0;
  const unpriced = [];
  for (const [k, v] of Object.entries(rates ?? {})) {
    if (Math.abs(v) <= cfg.RATE_EPS) continue;
    const p = priceOf(k);
    if (p == null) { unpriced.push(k); continue; }
    kr += p * v;
  }
  return { krPerGy: round(kr * CIV_PER_GY, 2), unpriced: [...new Set(unpriced)] };
}

// Pola danych, których obecność zdradza NIE-zasobowy efekt budynku (dla toru OTHER).
// Data-driven — nowa mechanika z nowym polem sama się tu pokaże jako „efekt X".
const EFFECT_FIELDS = [
  'tcBonus', 'tradeRangeBonus', 'routingEfficiencyBonus', 'tradeUpkeepMult', 'tradeRangeMult',
  'empireWideMatching', 'creditBonusLongDist', 'assemblyBonus', 'governanceBonus',
  'disasterReduction', 'missionYieldBonus', 'scanRange', 'scanInterval', 'isSpaceport',
  'capacityBonus', 'convertFrom', 'laborerSatisfactionBonus', 'workerSatisfactionBonus',
  'minerSatisfactionBonus', 'displacementMitigation', 'revolutionThreshold', 'specialEffect',
];

/**
 * Do których TORÓW należy budynek. Reguła DANYCH, nie lista „na oko":
 *   PRODUCTIVE — kopalnia (`isMine`) albo dodatnia stawka zasobu, który gra WYCENIA
 *   HOUSING    — `housing > 0`
 *   RESEARCH   — dodatnia stawka `research`
 *   TRADE      — kategoria `market` albo bonus handlowy w danych
 *   OTHER      — nic z powyższych (wartość niemierzalna w tym slice)
 */
export function tracksOf(building) {
  const tracks = [];
  const rates = building.rates ?? {};
  const producesPriced = Object.entries(rates)
    .some(([k, v]) => v > 0 && k !== 'research' && priceOf(k) != null);
  if (building.isMine || producesPriced || building.convertFrom) tracks.push(TRACK.PRODUCTIVE);
  if ((building.housing ?? 0) > 0) tracks.push(TRACK.HOUSING);
  if ((rates.research ?? 0) > 0) tracks.push(TRACK.RESEARCH);
  if (building.category === 'market' || building.tcBonus || building.tradeRangeBonus) tracks.push(TRACK.TRADE);
  if (tracks.length === 0) tracks.push(TRACK.OTHER);
  const tags = EFFECT_FIELDS.filter(f => building[f] != null && building[f] !== false);
  return { tracks, tags };
}

/** Zwrot w GAME-LATACH. `null` = brak dodatniego przepływu (nie spłaca się nigdy). */
export function paybackGy(krLoaded, krPerGy) {
  if (!(krPerGy > 0)) return null;
  if (!(krLoaded > 0)) return 0;
  return round(krLoaded / krPerGy, 3);
}

/** Tabela kosztów + nominalnych ROI dla CAŁEGO katalogu budynków (per planeta seeda). */
export function buildCostTable(planet, cfg = ROI_TELEMETRY_DEFAULTS) {
  const out = {};
  for (const b of Object.values(BUILDINGS)) {
    const cost = fullyLoadedCost(b, planet, cfg);
    const nominal = nominalNetRates(b);
    const nv = flowValueKrPerGy(nominal, cfg);
    const { tracks, tags } = tracksOf(b);
    out[b.id] = {
      id: b.id, category: b.category, namePL: b.namePL ?? b.id,
      isCapital: !!b.isCapital, isMine: !!b.isMine, requires: b.requires ?? null,
      buildTime: b.buildTime ?? 0, maxLevel: b.maxLevel ?? 1,
      jobs: b.jobs ?? 0, popType: b.popType ?? null, housing: b.housing ?? 0,
      tracks, tags,
      cost,
      nominalRates: nominal,
      nominalKrPerGy: nv.krPerGy,
      nominalPaybackGy: paybackGy(cost.krLoaded, nv.krPerGy),
      unpricedOut: nv.unpriced,
      upgrade2: upgradeCostAt(b, planet, 2, cfg),
      upgrade3: upgradeCostAt(b, planet, 3, cfg),
    };
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// CZUJNIK (żywa gra)
// ═══════════════════════════════════════════════════════════════

export class RoiTelemetry {
  constructor(opts = {}) {
    this.cfg = { ...ROI_TELEMETRY_DEFAULTS, ...opts };
    this._rows = [];
    this._produced = {};     // kumulatywny przerób fabryki (z `factory:produced`)
    this._hooked = false;
  }

  /** Podpięcie pod `factory:produced` — JEDYNY hook zdarzeniowy czujnika (read-only,
   *  tylko liczy). Podpinamy przy PIERWSZEJ próbce, bo `GameCore.boot()` woła
   *  `EventBus.clear()` — subskrypcja z konstruktora zniknęłaby, a subskrypcja
   *  poprzedniego seeda i tak jest sprzątana przez ten sam `clear()`. */
  _hook() {
    if (this._hooked) return;
    this._hooked = true;
    EventBus.on('factory:produced', ({ commodityId, amount }) => {
      if (!commodityId) return;
      this._produced[commodityId] = (this._produced[commodityId] ?? 0) + (amount ?? 1);
    });
  }

  sample(gy, ctx) {
    this._hook();
    const row = RoiTelemetry.snapshot(gy, ctx, this.cfg, this._produced);
    this._rows.push(row);
    return row;
  }

  getSeries() { return this._rows.slice(); }

  // ── Czysta migawka ─────────────────────────────────────────────
  static snapshot(gy, { home, colonyManager } = {}, cfg = ROI_TELEMETRY_DEFAULTS, produced = {}) {
    const bSys   = home?.buildingSystem;
    const resSys = home?.resourceSystem;
    const civSys = home?.civSystem;
    const facSys = home?.factorySystem;

    const types = {};
    for (const [key, e] of (bSys?._active ?? new Map())) {
      const b = e.building;
      if (!b) continue;
      const id = b.id;
      const lvl = e.level ?? 1;
      const t = types[id] ?? (types[id] = {
        count: 0, levels: 0, housing: 0, jobs: 0,
        rates: {}, mineGains: {}, mineStaffSum: 0, mineCount: 0,
      });
      t.count++;
      t.levels += lvl;
      // ⚠ ASYMETRIA POLA (pułapka pomiarowa, sprawdzona w kodzie gry): `entry.housing`
      // AKUMULUJE się przy ulepszeniu (`_applyUpgrade`: entry.housing += building.housing),
      // więc jest już wartością dla BIEŻĄCEGO poziomu. `entry.jobs` zostaje PER POZIOM —
      // gra mnoży je przez `entry.level` dopiero w `getSlotDemand`. Mnożnik ×lvl wolno
      // nałożyć TYLKO na jobs; na housing byłby podwójnym liczeniem.
      t.housing += (e.housing ?? 0);
      t.jobs += (e.jobs ?? 0) * lvl;
      // Stawki EFEKTYWNE gry — zawierają teren, tech, obsadę, poziom, utrzymanie i energię.
      for (const [r, v] of Object.entries(e.effectiveRates ?? {})) t.rates[r] = (t.rates[r] ?? 0) + v;
      // Kopalnie mają `rates: {}` — urobek liczy się z depozytów. Bierzemy REALNY
      // szacunek gry (obsada × dostępność energii × wyczerpanie), nie „nameplate".
      if (b.isMine && !key.startsWith('capital_')) {
        const est = bSys?.getMineOutputEstimate?.(key);
        if (est) {
          t.mineStaffSum += est.staff ?? 0;
          t.mineCount++;
          for (const [r, v] of Object.entries(est.gains ?? {})) t.mineGains[r] = (t.mineGains[r] ?? 0) + v;
        }
      }
    }

    // Netto per typ = stawki efektywne + urobek kopalń; wycena wg tabeli gry.
    const mineMult = RoiTelemetry.mineRateMult();
    const perType = {};
    for (const [id, t] of Object.entries(types)) {
      const net = { ...t.rates };
      for (const [r, v] of Object.entries(t.mineGains)) net[r] = (net[r] ?? 0) + v;
      const val = flowValueKrPerGy(net, cfg);
      // KONTRFAKTYCZNIE: ten sam przebieg BEZ mnożnika wydobycia scenariusza boosted.
      // Mnożnik ×5 dotyka WYŁĄCZNIE urobku kopalń (`rateMult` w BuildingSystem/DepositSystem/
      // ResourceSystem) — utrzymanie i energia są bez zmian, więc dzielimy TYLKO urobek.
      // Czysta arytmetyka na ZMIERZONYCH danych: żadnego drugiego przebiegu i żadnego
      // innego scenariusza (który zmieniałby też techy, POP i budynki startowe).
      let valUn = val;
      if (mineMult !== 1 && Object.keys(t.mineGains).length) {
        const netUn = { ...t.rates };
        for (const [r, v] of Object.entries(t.mineGains)) netUn[r] = (netUn[r] ?? 0) + v / mineMult;
        valUn = flowValueKrPerGy(netUn, cfg);
      }
      const lv = Math.max(1, t.levels);
      const popType = BUILDINGS[id]?.popType ?? 'laborer';
      const wage = civSys?.getStrataWage?.(popType) ?? 0;
      perType[id] = {
        count: t.count, levels: t.levels,
        housing: round(t.housing, 1), jobs: round(t.jobs, 2),
        net: roundMap(net, 3),
        krPerGy: val.krPerGy,
        krPerGyPerLevel: round(val.krPerGy / lv, 2),
        krPerGyPerLevelUnboosted: round(valUn.krPerGy / lv, 2),
        // Płace (Kr/gy) — realny wydatek Fazy 3 (`getStrataWage` × etaty). Raportowane
        // OSOBNO i jako drugi wariant zwrotu: to inna pula (kredyty, nie magazyn surowców),
        // ale ta sama waluta, więc czytelnik ma prawo zobaczyć obie liczby.
        wageKrPerGy: round(t.jobs * wage * CIV_PER_GY, 2),
        wageKrPerGyPerLevel: round(t.jobs * wage * CIV_PER_GY / lv, 2),
        mineStaff: t.mineCount ? round(t.mineStaffSum / t.mineCount, 3) : null,
        unpricedOut: val.unpriced,
      };
    }

    // „Nameplate" kopalni wg rozbicia gry (to, co widzi gracz w tooltipie) — do
    // porównania z realnym urobkiem. Rozbicie NIE stosuje obsady ani brownoutu.
    const minePlate = {};
    if (perType.mine || perType.autonomous_mine || perType.orbital_mine) {
      for (const rid of Object.keys(ALL_RESOURCES)) {
        const bd = resSys?.getResourceBreakdown?.(rid);
        const m = bd?.producers?.mine;
        if (m?.total) minePlate[rid] = round(m.total, 2);
      }
    }

    const facSpeed = RoiTelemetry.factorySpeedMult(home);
    return {
      gy: Math.round(gy),
      perType,
      minePlate,
      factory: {
        points: facSys?.totalPoints ?? 0,
        speedMult: facSpeed,
        produced: { ...produced },
      },
      energyAvail: round(resSys?.getEnergyAvailability?.() ?? 1, 3),
      brownout: !!resSys?.energy?.brownout,
      pop: civSys?.population ?? 0,
      colonies: colonyManager?.getPlayerColonies?.().length ?? 0,
      activeIsHome: (colonyManager?._activePlanetId ?? null) === (home?.planetId ?? null),
    };
  }

  /** Mnożnik wydobycia scenariusza — LUSTRO `BuildingSystem:368` / `DepositSystem:134`
   *  / `ResourceSystem:320` (`civilization_boosted` → ×5). Potrzebny do kontrfaktycznej
   *  kolumny „przy ×1 wydobyciu": zwrot kopalń w przebiegu referencyjnym jest o tyle
   *  szybszy, a to jedyny mnożnik scenariusza dotykający toru produkcyjnego. */
  static mineRateMult() {
    const scenario = (typeof window !== 'undefined' ? window.KOSMOS?.scenario : null);
    return scenario === 'civilization_boosted' ? 5 : 1;
  }

  /** Mnożnik prędkości fabryki (scenariusz × tech) — ta sama formuła co FactorySystem. */
  static factorySpeedMult(home) {
    const scenario = (typeof window !== 'undefined' ? window.KOSMOS?.scenario : null);
    const scen = scenario === 'civilization_boosted' ? 1.5 : 1;
    const tech = home?.buildingSystem?.techSystem?.getFactorySpeedMultiplier?.() ?? 1;
    return round(scen * tech, 3);
  }
}

function round(n, d) {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
function roundMap(m, d) {
  const out = {};
  for (const [k, v] of Object.entries(m ?? {})) if (Math.abs(v) > 1e-9) out[k] = round(v, d);
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Podsumowania (czyste funkcje nad szeregiem — runner drukuje, keeper testuje)
// ═══════════════════════════════════════════════════════════════

/**
 * Podsumowanie JEDNEGO seeda: per typ budynku — ile lat istniał, średni przepływ
 * na poziom, zwrot mierzony; plus przerób fabryki i luka nameplate kopalni.
 * @param {Array}  series     — szereg z RoiTelemetry
 * @param {Object} costTable  — buildCostTable(planet) tego seeda
 */
export function summarizeSeed(series, costTable, cfg = ROI_TELEMETRY_DEFAULTS) {
  const rows = (series ?? []).filter(r => r && r.gy >= 1);
  const last = rows[rows.length - 1] ?? { perType: {}, factory: { produced: {} } };
  const first = rows[0] ?? last;

  const byType = {};
  for (const r of rows) {
    for (const [id, t] of Object.entries(r.perType ?? {})) {
      const e = byType[id] ?? (byType[id] = {
        years: 0, firstGy: r.gy, sumKrPerLevel: 0, sumKrPerLevelUn: 0, sumKr: 0, sumWage: 0, sumWagePerLevel: 0,
        sumLevels: 0, maxCount: 0, sumHousingPerLevel: 0, sumResearchPerLevel: 0,
        mineStaffSum: 0, mineStaffN: 0, unpricedOut: [],
      });
      e.years++;
      e.sumKrPerLevel += t.krPerGyPerLevel ?? 0;
      e.sumKrPerLevelUn += t.krPerGyPerLevelUnboosted ?? t.krPerGyPerLevel ?? 0;
      e.sumKr += t.krPerGy ?? 0;
      e.sumWage += t.wageKrPerGy ?? 0;
      e.sumWagePerLevel += t.wageKrPerGyPerLevel ?? 0;
      e.sumLevels += t.levels ?? 0;
      e.maxCount = Math.max(e.maxCount, t.count ?? 0);
      const lv = Math.max(1, t.levels ?? 1);
      e.sumHousingPerLevel += (t.housing ?? 0) / lv;
      e.sumResearchPerLevel += ((t.net?.research ?? 0) * CIV_PER_GY) / lv;
      if (t.mineStaff != null) { e.mineStaffSum += t.mineStaff; e.mineStaffN++; }
      if (t.unpricedOut?.length) e.unpricedOut = [...new Set([...e.unpricedOut, ...t.unpricedOut])];
    }
  }

  const measured = {};
  for (const [id, e] of Object.entries(byType)) {
    const c = costTable?.[id];
    const krPerGyPerLevel = e.years ? round(e.sumKrPerLevel / e.years, 2) : 0;
    const wagePerLevel    = e.years ? round(e.sumWagePerLevel / e.years, 2) : 0;
    const krPerGyPerLevelUn = e.years ? round(e.sumKrPerLevelUn / e.years, 2) : 0;
    measured[id] = {
      years: e.years, firstGy: e.firstGy, maxCount: e.maxCount,
      meanLevels: e.years ? round(e.sumLevels / e.years, 2) : 0,
      krPerGyPerLevel,
      krPerGyPerLevelUnboosted: krPerGyPerLevelUn,
      krPerGyTotal: e.years ? round(e.sumKr / e.years, 2) : 0,
      wageKrPerGy:  e.years ? round(e.sumWage / e.years, 2) : 0,
      wageKrPerGyPerLevel: wagePerLevel,
      wageShare: krPerGyPerLevel > 0 ? round(wagePerLevel / krPerGyPerLevel, 3) : null,
      housingPerLevel:  round(e.sumHousingPerLevel / Math.max(1, e.years), 2),
      researchPerGyPerLevel: round(e.sumResearchPerLevel / Math.max(1, e.years), 2),
      mineStaff: e.mineStaffN ? round(e.mineStaffSum / e.mineStaffN, 3) : null,
      krLoaded: c?.cost?.krLoaded ?? null,
      paybackGy: c ? paybackGy(c.cost.krLoaded, krPerGyPerLevel) : null,
      // Drugi wariant: przepływ pomniejszony o płace obsady (ta sama waluta, inna pula).
      paybackWithWagesGy: c ? paybackGy(c.cost.krLoaded, krPerGyPerLevel - wagePerLevel) : null,
      // Kontrfaktyczny zwrot bez mnożnika wydobycia scenariusza (dla nie-kopalń identyczny).
      paybackUnboostedGy: c ? paybackGy(c.cost.krLoaded, krPerGyPerLevelUn) : null,
      enoughYears: e.years >= cfg.MIN_YEARS,
      unpricedOut: e.unpricedOut,
    };
  }

  // Przerób fabryki: kumulatywna produkcja / przepracowane game-lata.
  const prod = last.factory?.produced ?? {};
  const span = Math.max(1e-9, (last.gy ?? 0) - 0);
  const producedPerGy = {};
  let producedKrPerGy = 0, inputKrPerGy = 0;
  for (const [cid, n] of Object.entries(prod)) {
    const perGy = n / span;
    producedPerGy[cid] = round(perGy, 2);
    const p = priceOf(cid);
    if (p != null) producedKrPerGy += p * perGy;
    const e = expandCommodity(cid, perGy, cfg);
    inputKrPerGy += valueBasket(e.res).kr;
  }

  // Luka „nameplate vs realny urobek" kopalni (§5 slice'u ZASOBY, teraz per budynek).
  const plateKr = flowValueKrPerGy(last.minePlate ?? {}, cfg).krPerGy;
  const realKr  = last.perType?.mine ? last.perType.mine.krPerGy : 0;

  return {
    years: rows.length, finalGy: last.gy ?? 0, firstGy: first.gy ?? 0,
    finalPop: last.pop ?? 0, finalColonies: last.colonies ?? 0,
    finalEnergyAvail: last.energyAvail ?? 1,
    measured,
    factory: {
      points: last.factory?.points ?? 0,
      speedMult: last.factory?.speedMult ?? 1,
      producedPerGy,
      producedKrPerGy: round(producedKrPerGy, 1),
      inputKrPerGy: round(inputKrPerGy, 1),
      valueAddedKrPerGy: round(producedKrPerGy - inputKrPerGy, 1),
    },
    minePlateKrPerGy: round(plateKr, 1),
    mineRealKrPerGy: round(realKr, 1),
    mineNameplateRatio: realKr > 0 ? round(plateKr / realKr, 2) : null,
  };
}

/**
 * Agregat panelu: per typ budynku — mediana zwrotu, na ilu seedach mierzony.
 * @param {Array} costTables — tabela kosztów KAŻDEGO seeda (koszt zależy od planety
 *   przez dopłatę środowiskową, więc panel bierze MEDIANĘ, a nie koszt pierwszego seeda).
 */
export function aggregatePanel(summaries, costTables, cfg = ROI_TELEMETRY_DEFAULTS) {
  const tables  = Array.isArray(costTables) ? costTables : [costTables].filter(Boolean);
  const catalog = tables[0] ?? {};
  const costOf = (id, path) => median(tables.map(t => t?.[id]?.cost?.[path]).filter(v => v != null));
  const byType = {};
  for (const s of summaries) {
    for (const [id, m] of Object.entries(s.measured ?? {})) {
      const e = byType[id] ?? (byType[id] = {
        seeds: 0, years: 0, kr: [], payback: [], paybackW: [], paybackUn: [], wage: [], housing: [], research: [],
        mineStaff: [], maxCount: 0, unpricedOut: [],
      });
      e.seeds++;
      e.years += m.years;
      e.maxCount = Math.max(e.maxCount, m.maxCount);
      if (m.enoughYears) {
        e.kr.push(m.krPerGyPerLevel);
        if (m.paybackGy != null) e.payback.push(m.paybackGy);
        if (m.paybackWithWagesGy != null) e.paybackW.push(m.paybackWithWagesGy);
        if (m.paybackUnboostedGy != null) e.paybackUn.push(m.paybackUnboostedGy);
      }
      e.wage.push(m.wageKrPerGyPerLevel);
      e.housing.push(m.housingPerLevel);
      e.research.push(m.researchPerGyPerLevel);
      if (m.mineStaff != null) e.mineStaff.push(m.mineStaff);
      if (m.unpricedOut?.length) e.unpricedOut = [...new Set([...e.unpricedOut, ...m.unpricedOut])];
    }
  }

  const out = {};
  for (const [id, e] of Object.entries(byType)) {
    out[id] = {
      seeds: e.seeds, years: e.years, maxCount: e.maxCount,
      medKrPerGyPerLevel: median(e.kr),
      medPaybackGy: median(e.payback),
      medPaybackWithWagesGy: median(e.paybackW),
      medPaybackUnboostedGy: median(e.paybackUn),
      minPaybackGy: e.payback.length ? round(Math.min(...e.payback), 3) : null,
      maxPaybackGy: e.payback.length ? round(Math.max(...e.payback), 3) : null,
      medWageKrPerGyPerLevel: median(e.wage),
      medHousingPerLevel: median(e.housing),
      medResearchPerGyPerLevel: median(e.research),
      medMineStaff: e.mineStaff.length ? median(e.mineStaff) : null,
      krLoaded: costOf(id, 'krLoaded'),
      embeddedShare: costOf(id, 'embeddedShare'),
      measuredOn: e.kr.length,
      unpricedOut: e.unpricedOut,
    };
  }

  const factory = {
    medPoints: median(summaries.map(s => s.factory?.points ?? 0)),
    medValueAddedKrPerGy: median(summaries.map(s => s.factory?.valueAddedKrPerGy ?? 0)),
    medProducedKrPerGy: median(summaries.map(s => s.factory?.producedKrPerGy ?? 0)),
    medInputKrPerGy: median(summaries.map(s => s.factory?.inputKrPerGy ?? 0)),
  };
  const mineRatios = summaries.map(s => s.mineNameplateRatio).filter(v => v != null);

  // Udział kosztu przechodzącego przez fabrykę — po CAŁYM katalogu (nie tylko
  // postawionych), bo to własność cennika, nie przebiegu.
  const shares = Object.values(catalog)
    .filter(c => c.cost.krLoaded > 0)
    .map(c => c.cost.embeddedShare);

  return {
    seeds: summaries.length,
    byType: out,
    factory,
    medMineNameplateRatio: mineRatios.length ? median(mineRatios) : null,
    medEmbeddedShare: median(shares),
    catalogSize: Object.keys(catalog).length,
    measuredTypes: Object.keys(out).length,
  };
}

/**
 * Werdykt panelowy — czy koszt jest PROPORCJONALNY do produkcji?
 * Liczony na budynkach PRODUKCYJNYCH zmierzonych na ≥1 seedzie (mediana zwrotu).
 *   0 PROPORTIONATE — rozrzut zwrotu ≤ SPREAD_FLAT
 *   1 SKEWED        — rozrzut > SPREAD_FLAT (są budynki wyraźnie „drogie za to, co dają")
 *   2 NO_DATA       — mniej niż 2 zmierzone budynki produkcyjne
 */
export function panelVerdict(agg, costTable, cfg = ROI_TELEMETRY_DEFAULTS, field = 'medPaybackGy') {
  // Stolica NIE wchodzi do rankingu: jest stawiana automatycznie i ma koszt 0
  // (`colony_base.cost = {}` — decyzja projektowa gry), więc jej „zwrot 0 gy" nie jest
  // wyborem gracza i zafałszowałby rozrzut.
  const rows = Object.entries(agg.byType ?? {})
    .filter(([id, v]) => v[field] != null && v[field] > 0
      && !costTable?.[id]?.isCapital
      && (costTable?.[id]?.tracks ?? []).includes(TRACK.PRODUCTIVE))
    .map(([id, v]) => [id, v[field]])
    .sort((a, b) => a[1] - b[1]);

  if (rows.length < 2) {
    return { outcome: 2, label: 'NO DATA — za mało zmierzonych budynków produkcyjnych', spread: null, best: null, worst: null, n: rows.length };
  }
  const [bestId, bestP] = rows[0];
  const [worstId, worstP] = rows[rows.length - 1];
  const spread = round(worstP / bestP, 2);
  if (spread <= cfg.SPREAD_FLAT) {
    return { outcome: 0, label: `PROPORTIONATE — zwroty mieszczą się w ${spread}× rozrzutu`, spread, best: bestId, bestPaybackGy: bestP, worst: worstId, worstPaybackGy: worstP, n: rows.length };
  }
  return { outcome: 1, label: `SKEWED — ${spread}× rozrzutu zwrotu (${worstId} vs ${bestId})`, spread, best: bestId, bestPaybackGy: bestP, worst: worstId, worstPaybackGy: worstP, n: rows.length };
}

function median(arr) {
  const a = (arr ?? []).filter(v => Number.isFinite(v)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const m = a.length >> 1;
  return round(a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2, 3);
}

export default RoiTelemetry;
