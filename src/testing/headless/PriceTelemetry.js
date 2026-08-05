// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — PriceTelemetry (WARSTWA B: OSIĄGALNOŚĆ, READ-ONLY)
// ───────────────────────────────────────────────────────────────
// Druga warstwa slice'u CEN. Warstwa A/A′ (`PriceAudit.js`) pyta, czy TABELA jest
// wewnętrznie spójna — statycznie, bez gry. Ta warstwa pyta, jak ceny GRAJĄ w realnym
// przebiegu: ile Kr gracz naprawdę zarabia, na co je wydaje i co z cennika jest
// nieosiągalne, trywialne albo bramkuje postęp — i KIEDY, w GAME-LATACH (HARD #3).
//
// ── CO MIERZYMY ────────────────────────────────────────────────
//   • KSIĘGA Kr — realizacja, nie deklaracja. `trade:creditsChanged` daje wydatki
//     z `purpose`; przychód z handlu i płace nie mają `purpose` (rozróżniamy je po
//     ZNAKU); PODATEK nie emituje zdarzenia w ogóle, więc liczymy go REZYDUALNIE
//     (Δkredytów − suma zdarzeń) i tak etykietujemy. Obok trzymamy stawki „z metki"
//     (`calculateTaxIncome`, `getTotalLaborCost`, `getTotalFleetUpkeep`, `creditsPerYear`)
//     — rozjazd realizacja↔metka jest sam w sobie odczytem.
//   • OSIĄGALNOŚĆ — dla każdej pozycji katalogu zakupów pytamy REALNĄ bramkę gry
//     (`ResourceSystem.canAfford` + stan kredytów kolonii): stać czy nie stać, w którym
//     game-roku pierwszy raz, przez ile lat panelu, z jakim zapasem („ile naraz").
//   • CENA REALNA W GRZE — `CivilianTradeSystem.getLocalPrice` (BASE_PRICE × własny
//     mnożnik niedoboru gry). To WŁASNY osąd wartości wystawiony przez samą grę
//     w trakcie rozgrywki — najlepszy dostępny sprawdzian dla cen bazowych.
//   • NAKŁAD MIERZONY (`measuredCapex`) — dopełnienie Warstwy A′ o kopalnie, których
//     nie da się policzyć statycznie (`rates: {}` — urobek liczy się ze złóż).
//
// ⚠ DWA ZEGARY (pułapka jednostek, jawnie obsłużona): przepływy Kr chodzą na zegarze
// GRY (`_tickTaxCollection(physDt)`, `_tickVesselMaintenance` — raz na ROK GRY), a
// produkcja/populacja na zegarze CYWILIZACYJNYM (×12). Utrzymanie jednostek naziemnych
// i handel cywilny liczą się per CIV-rok → przeliczamy ×CIV_PER_GY. Każde przeliczenie
// jest w kodzie podpisane.
//
// HARD-CONSTRAINT (Phase 2): instrument, nie regulator. Zero stałych balansu, zero
// wpływu na logikę gry i politykę bota. Jedyna subskrypcja to licznik zdarzeń.
// ═══════════════════════════════════════════════════════════════

import EventBus from '../../core/EventBus.js';
import { BASE_PRICE } from '../../data/TradeValuesData.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import {
  PRICE_DEFAULTS, CIV_PER_GY, priceOf, isResource, buildPurchaseCatalog, round, median,
} from './PriceAudit.js';
import { fullyLoadedCost, RoiTelemetry } from './RoiTelemetry.js';

export { PRICE_DEFAULTS, CIV_PER_GY };

// Klasy osiągalności (Warstwa B) — knoby POMIARU w `PRICE_DEFAULTS`, nie stałe gry.
export const AFFORD_CLASS = {
  TRIVIAL: 'trivial',   // stać nas praktycznie zawsze i z dużym zapasem
  NORMAL:  'normal',    // stać nas przez większość przebiegu
  GATING:  'gating',    // stać nas późno albo rzadko — cena realnie bramkuje
  NEVER:   'never',     // nigdy w horyzoncie panelu
};

// Kubełki księgi Kr (patrz nagłówek: `purpose` / znak delty / rezyduum).
export const KR_BUCKETS = ['trade', 'wages', 'fleet_upkeep', 'droid_production',
  'ground_unit_recruit', 'ground_unit_upkeep', 'shipyard_surge', 'other'];

export class PriceTelemetry {
  constructor(opts = {}) {
    this.cfg = { ...PRICE_DEFAULTS, ...opts };
    this._rows = [];
    this._ledger = Object.fromEntries(KR_BUCKETS.map(b => [b, 0]));   // kumulatywnie
    this._hooked = false;
    this._catalog = null;    // katalog zakupów (liczony przy 1. próbce — zna planetę seeda)
  }

  /** Hook `trade:creditsChanged` — JEDYNA subskrypcja czujnika (read-only, tylko liczy).
   *  Podpinamy przy PIERWSZEJ próbce, bo `GameCore.boot()` woła `EventBus.clear()`, więc
   *  subskrypcja z konstruktora by zniknęła (ten sam wzorzec co RoiTelemetry). */
  _hook() {
    if (this._hooked) return;
    this._hooked = true;
    EventBus.on('trade:creditsChanged', ({ delta, purpose }) => {
      const d = Number(delta) || 0;
      if (d === 0) return;
      let bucket;
      if (purpose && KR_BUCKETS.includes(purpose)) bucket = purpose;
      else if (purpose) bucket = 'other';
      else bucket = d > 0 ? 'trade' : 'wages';    // bez `purpose`: handel (+) / płace (−)
      this._ledger[bucket] += d;
    });
  }

  sample(gy, ctx) {
    this._hook();
    if (!this._catalog) this._catalog = buildPurchaseCatalog(ctx?.home?.planet ?? null, this.cfg);
    const row = PriceTelemetry.snapshot(gy, ctx, this.cfg, this._catalog, this._ledger);
    this._rows.push(row);
    return row;
  }

  getSeries() { return this._rows.slice(); }
  getCatalog() { return this._catalog; }

  // ── Czysta migawka ─────────────────────────────────────────────
  static snapshot(gy, { home, colonyManager, core } = {}, cfg = PRICE_DEFAULTS,
    catalog = {}, ledger = {}) {
    const resSys = home?.resourceSystem;
    const civSys = home?.civSystem;
    const bSys   = home?.buildingSystem;
    const K = (typeof window !== 'undefined' ? window.KOSMOS : null) ?? {};
    const trade  = core?.civilianTradeSystem ?? K.civilianTradeSystem ?? null;
    const vm     = core?.vesselManager ?? K.vesselManager ?? null;

    const credits = round(home?.credits ?? 0, 1);
    const playerColonies = colonyManager?.getPlayerColonies?.() ?? [];
    const creditsAll = round(playerColonies.reduce((s, c) => s + (c.credits ?? 0), 0), 1);

    // ── Osiągalność — REALNĄ bramką gry (`canAfford` + stan kredytów kolonii) ──
    const items = {};
    for (const [id, it] of Object.entries(catalog)) {
      const affordMat = Object.keys(it.cost).length === 0 ? true : (resSys?.canAfford?.(it.cost) ?? false);
      const affordKr  = (it.krCost ?? 0) <= 0 ? true : credits >= it.krCost;
      // Zapas = ile sztuk stać nas kupić NARAZ (min po kluczach kosztu i po kredytach).
      // `miss` = klucze, których REALNIE brakuje — pytamy magazyn gry osobno o KAŻDY,
      // tak jak slice ZASOBY: „nie stać" bez wskazania winowajcy nic nie mówi, a to
      // właśnie tu widać, czy bramką jest ruda, komponent, czy kredyty.
      let headroom = Infinity;
      const miss = [];
      for (const [k, v] of Object.entries(it.cost)) {
        if (!(v > 0)) continue;
        headroom = Math.min(headroom, (resSys?.getAmount?.(k) ?? 0) / v);
        if (!affordMat && !(resSys?.canAfford?.({ [k]: v }) ?? false)) miss.push(k);
      }
      if ((it.krCost ?? 0) > 0) {
        headroom = Math.min(headroom, credits / it.krCost);
        if (!affordKr) miss.push('Kr');
      }
      items[id] = {
        aff: !!(affordMat && affordKr),
        affMat: !!affordMat, affKr: !!affordKr,
        head: Number.isFinite(headroom) ? round(headroom, 2) : null,   // null = pozycja bez kosztu
        miss,
      };
    }

    // ── Cena REALNA w grze (BASE_PRICE × mnożnik niedoboru) — własny mechanizm gry ──
    const localPrice = {};
    if (trade?.getLocalPrice && home) {
      for (const id of Object.keys(BASE_PRICE)) {
        const p = trade.getLocalPrice(id, home);
        if (Number.isFinite(p)) localPrice[id] = round(p, 3);
      }
    }

    const stock = PriceTelemetry.stockValueKr(resSys);

    // ── Stawki „z metki" (do porównania z realizacją księgi) ──
    // ⚠ Zegary: podatek i utrzymanie floty naliczają się raz na ROK GRY (physDt) → są już
    // per game-year. Handel cywilny liczy `creditsPerYear` per CIV-rok → ×CIV_PER_GY.
    const taxPerGy = colonyManager?.calculateTaxIncome
      ? round(playerColonies.filter(c => !c.isOutpost)
        .reduce((s, c) => s + (colonyManager.calculateTaxIncome(c) ?? 0), 0), 1)
      : null;
    const wagesPerGy = round(civSys?.getTotalLaborCost?.() ?? 0, 1);
    const fleetUpkeepPerGy = round(vm?.getTotalFleetUpkeep?.() ?? 0, 1);
    const tradePerGy = round((home?.creditsPerYear ?? 0) * CIV_PER_GY, 1);

    return {
      gy: Math.round(gy),
      credits, creditsAll,
      ledger: { ...ledger },                       // kumulatywnie od startu przebiegu
      nameplate: { taxPerGy, wagesPerGy, fleetUpkeepPerGy, tradePerGy },
      stockKr: round(stock.res, 1),
      commodityKr: round(stock.com, 1),
      items, localPrice,
      capexMeasured: PriceTelemetry.measuredCapex(home, cfg),
      factoryPoints: home?.factorySystem?.totalPoints ?? 0,
      pop: civSys?.population ?? 0,
      colonies: playerColonies.length,
      buildings: bSys?._active?.size ?? 0,
      activeIsHome: (colonyManager?._activePlanetId ?? null) === (home?.planetId ?? null),
    };
  }

  /** Wartość magazynu po cenach BAZOWYCH — „siła nabywcza" w walucie cennika. */
  static stockValueKr(resSys) {
    let res = 0, com = 0;
    if (!resSys) return { res, com };
    for (const id of Object.keys(BASE_PRICE)) {
      const amt = resSys.getAmount?.(id) ?? 0;
      if (!(amt > 0)) continue;
      const kr = amt * (BASE_PRICE[id] ?? 0);
      if (isResource(id)) res += kr; else com += kr;
    }
    return { res, com };
  }

  /**
   * Nakład MIERZONY na jednostkę przepływu — ta sama arytmetyka co `PriceAudit.capexTable`,
   * ale na ŻYWYCH stawkach (`effectiveRates` + realny urobek kopalń), więc obejmuje też
   * KOPALNIE (statycznie niemierzalne: `rates: {}`). Per typ budynku, znormalizowane na
   * poziom; koszt z realnej formuły gry dla planety tej kolonii.
   *
   * ⚠ KONTRFAKTYK ×1 WYDOBYCIE — bez niego werdykt o jednostce bazowej byłby artefaktem
   * scenariusza. Przebieg referencyjny to `civilization_boosted` (urobek kopalń ×5), więc
   * nakład na 1 Kr RUDY wychodzi 5× tańszy niż w scenariuszu standardowym, a nakład na
   * 1 Kr ENERGII nie — mnożnik dotyka WYŁĄCZNIE wydobycia. Liczymy więc obie wersje na
   * TEJ SAMEJ zmierzonej serii (czysta arytmetyka, nie drugi przebieg), dzieląc tylko
   * urobek kopalń przez `RoiTelemetry.mineRateMult()` — dokładnie jak slice ROI §3.2.
   */
  static measuredCapex(home, cfg = PRICE_DEFAULTS) {
    const bSys = home?.buildingSystem;
    const planet = home?.planet;
    if (!bSys || !planet) return {};
    const mineMult = RoiTelemetry.mineRateMult();
    const perType = {};
    for (const [key, e] of (bSys._active ?? new Map())) {
      const b = e.building;
      if (!b || b.isCapital) continue;
      const t = perType[b.id] ?? (perType[b.id] = { levels: 0, rates: {}, mineGains: {} });
      t.levels += (e.level ?? 1);
      for (const [r, v] of Object.entries(e.effectiveRates ?? {})) t.rates[r] = (t.rates[r] ?? 0) + v;
      if (b.isMine && !key.startsWith('capital_')) {
        const est = bSys.getMineOutputEstimate?.(key);
        for (const [r, v] of Object.entries(est?.gains ?? {})) t.mineGains[r] = (t.mineGains[r] ?? 0) + v;
      }
    }
    const best = {};
    for (const [id, t] of Object.entries(perType)) {
      const b = BUILDINGS[id];
      if (!b) continue;
      const krLoaded = fullyLoadedCost(b, planet).krLoaded;
      if (!(krLoaded > 0)) continue;
      const lv = Math.max(1, t.levels);
      const keys = new Set([...Object.keys(t.rates), ...Object.keys(t.mineGains)]);
      for (const r of keys) {
        const p = priceOf(r);
        if (p == null) continue;
        const base = t.rates[r] ?? 0, mined = t.mineGains[r] ?? 0;
        const v = base + mined;
        if (!(v > cfg.RATE_EPS)) continue;
        const perGy = (v / lv) * CIV_PER_GY;                 // netto na POZIOM, na game-rok
        const capexPerUnit = krLoaded / perGy;
        const capexPerKr = capexPerUnit / p;
        // Kontrfaktycznie: ten sam pomiar z urobkiem kopalń podzielonym przez mnożnik.
        const vUn = base + (mineMult !== 1 ? mined / mineMult : mined);
        const perGyUn = (vUn / lv) * CIV_PER_GY;
        const capexPerKrUn = perGyUn > 0 ? (krLoaded / perGyUn) / p : null;
        if (!best[r] || capexPerKr < best[r].capexPerKr) {
          best[r] = {
            resource: r, price: p, from: id,
            perGy: round(perGy, 3),
            capexPerUnit: round(capexPerUnit, 3),
            capexPerKr: round(capexPerKr, 3),
            capexPerKrUnboosted: capexPerKrUn != null ? round(capexPerKrUn, 3) : null,
            mined: mined > cfg.RATE_EPS,
            source: 'measured',
          };
        }
      }
    }
    return best;
  }
}

// ═══════════════════════════════════════════════════════════════
// Podsumowania (czyste funkcje nad szeregiem — runner drukuje, keeper testuje)
// ═══════════════════════════════════════════════════════════════

/** Klasa osiągalności pozycji katalogu — knoby POMIARU, nie balansu. */
export function affordClass({ firstGy, share, medHeadroom }, cfg = PRICE_DEFAULTS) {
  if (firstGy == null) return AFFORD_CLASS.NEVER;
  if (share >= cfg.TRIVIAL_SHARE && (medHeadroom ?? 0) >= cfg.TRIVIAL_MULT) return AFFORD_CLASS.TRIVIAL;
  if (firstGy > cfg.GATE_LATE_GY || share < cfg.GATE_SHARE) return AFFORD_CLASS.GATING;
  return AFFORD_CLASS.NORMAL;
}

export function summarizeSeed(series, catalog, cfg = PRICE_DEFAULTS) {
  const rows = (series ?? []).filter(r => r && r.gy >= 1);
  const last = rows[rows.length - 1] ?? { items: {}, ledger: {}, localPrice: {}, capexMeasured: {}, nameplate: {} };
  const first = rows[0] ?? last;
  const span = Math.max(1e-9, last.gy ?? 0);

  // ── Osiągalność per pozycja ──
  const items = {};
  for (const id of Object.keys(catalog ?? {})) {
    let firstGy = null, years = 0;
    const heads = [];
    const missCount = {};
    for (const r of rows) {
      const it = r.items?.[id];
      if (!it) continue;
      if (it.aff) { years++; if (firstGy == null) firstGy = r.gy; }
      if (it.head != null) heads.push(it.head);
      for (const k of it.miss ?? []) missCount[k] = (missCount[k] ?? 0) + 1;
    }
    const share = rows.length ? years / rows.length : 0;
    const medHeadroom = heads.length ? median(heads) : null;
    const missTop = Object.entries(missCount).sort((a, b) => b[1] - a[1]);
    items[id] = {
      firstAffordableGy: firstGy,
      yearsAffordable: years,
      share: round(share, 3),
      medHeadroom: medHeadroom != null ? round(medHeadroom, 2) : null,
      // Co BRAMKUJE tę pozycję: klucz kosztu, którego najczęściej brakowało.
      blocker: missTop[0]?.[0] ?? null,
      blockerYears: missTop[0]?.[1] ?? 0,
      blockers: Object.fromEntries(missTop.slice(0, 4)),
      cls: affordClass({ firstGy, share, medHeadroom }, cfg),
    };
  }

  // ── Księga Kr: realizacja (zdarzenia) + podatek REZYDUALNY ──
  const ledger = last.ledger ?? {};
  const eventSum = Object.values(ledger).reduce((s, v) => s + v, 0);
  const dCredits = (last.creditsAll ?? 0) - (first.creditsAll ?? 0);
  const taxResidual = round(dCredits - eventSum, 1);      // przychód bez zdarzenia = podatek
  const perGy = (v) => round(v / span, 1);

  return {
    years: rows.length, finalGy: last.gy ?? 0,
    creditsStart: first.creditsAll ?? 0, creditsEnd: last.creditsAll ?? 0,
    creditsMin: rows.length ? Math.min(...rows.map(r => r.creditsAll ?? 0)) : 0,
    creditsMax: rows.length ? Math.max(...rows.map(r => r.creditsAll ?? 0)) : 0,
    ledger: mapVals(ledger, v => round(v, 1)),
    ledgerPerGy: mapVals(ledger, perGy),
    taxResidualTotal: taxResidual,
    taxResidualPerGy: perGy(taxResidual),
    netKrPerGy: perGy(dCredits),
    grossInKrPerGy: perGy(Math.max(0, ledger.trade ?? 0) + Math.max(0, taxResidual)),
    grossOutKrPerGy: perGy(-Object.values(ledger).filter(v => v < 0).reduce((s, v) => s + v, 0)),
    nameplateEnd: last.nameplate ?? {},
    stockKrEnd: last.stockKr ?? 0, commodityKrEnd: last.commodityKr ?? 0,
    items,
    localPriceEnd: last.localPrice ?? {},
    localPriceMed: medianByKey(rows.map(r => r.localPrice ?? {})),
    capexMeasured: last.capexMeasured ?? {},
    finalPop: last.pop ?? 0, finalColonies: last.colonies ?? 0,
    factoryPoints: last.factoryPoints ?? 0,
  };
}

export function aggregatePanel(summaries, catalog, cfg = PRICE_DEFAULTS) {
  const items = {};
  for (const id of Object.keys(catalog ?? {})) {
    const rows = summaries.map(s => s.items?.[id]).filter(Boolean);
    if (!rows.length) continue;
    const firsts = rows.map(r => r.firstAffordableGy).filter(v => v != null);
    const counts = {};
    for (const r of rows) counts[r.cls] = (counts[r.cls] ?? 0) + 1;
    // Klasa panelu = najliczniejsza klasa seedów; przy remisie wygrywa GORSZA
    // (kolejność sprawdzania od „never") — instrument nie ma prawa być optymistyczny.
    const order = [AFFORD_CLASS.NEVER, AFFORD_CLASS.GATING, AFFORD_CLASS.NORMAL, AFFORD_CLASS.TRIVIAL];
    let cls = order[0], bestN = -1;
    for (const c of order) if ((counts[c] ?? 0) > bestN) { bestN = counts[c] ?? 0; cls = c; }
    // Najczęstszy bloker po seedach — „co realnie stoi na drodze do tego zakupu".
    const blockerCount = {};
    for (const r of rows) for (const [k, n] of Object.entries(r.blockers ?? {})) blockerCount[k] = (blockerCount[k] ?? 0) + n;
    const blockerTop = Object.entries(blockerCount).sort((a, b) => b[1] - a[1]);
    items[id] = {
      seeds: rows.length,
      seedsAffordable: firsts.length,
      medFirstAffordableGy: firsts.length ? median(firsts) : null,
      medShare: median(rows.map(r => r.share)),
      medHeadroom: median(rows.map(r => r.medHeadroom).filter(v => v != null)),
      blocker: blockerTop[0]?.[0] ?? null,
      blockers: Object.fromEntries(blockerTop.slice(0, 4)),
      cls, counts,
    };
  }

  const ledgerKeys = new Set();
  for (const s of summaries) for (const k of Object.keys(s.ledgerPerGy ?? {})) ledgerKeys.add(k);
  const ledgerPerGy = {};
  for (const k of ledgerKeys) ledgerPerGy[k] = median(summaries.map(s => s.ledgerPerGy?.[k] ?? 0));

  // Nakład MIERZONY — scalony po seedach (mediana per zasób).
  const capexIds = new Set();
  for (const s of summaries) for (const k of Object.keys(s.capexMeasured ?? {})) capexIds.add(k);
  const capexMeasured = {};
  for (const r of capexIds) {
    const rows = summaries.map(s => s.capexMeasured?.[r]).filter(Boolean);
    capexMeasured[r] = {
      resource: r, price: rows[0]?.price ?? priceOf(r), from: rows[0]?.from ?? null,
      perGy: median(rows.map(x => x.perGy)),
      capexPerUnit: median(rows.map(x => x.capexPerUnit)),
      capexPerKr:   median(rows.map(x => x.capexPerKr)),
      capexPerKrUnboosted: median(rows.map(x => x.capexPerKrUnboosted).filter(v => v != null)),
      mined: rows.some(x => x.mined),
      seeds: rows.length, source: 'measured',
    };
  }

  return {
    seeds: summaries.length,
    items, ledgerPerGy, capexMeasured,
    medTaxResidualPerGy: median(summaries.map(s => s.taxResidualPerGy)),
    medNetKrPerGy: median(summaries.map(s => s.netKrPerGy)),
    medGrossInKrPerGy: median(summaries.map(s => s.grossInKrPerGy)),
    medGrossOutKrPerGy: median(summaries.map(s => s.grossOutKrPerGy)),
    medCreditsEnd: median(summaries.map(s => s.creditsEnd)),
    medCreditsMin: median(summaries.map(s => s.creditsMin)),
    medStockKrEnd: median(summaries.map(s => s.stockKrEnd)),
    medCommodityKrEnd: median(summaries.map(s => s.commodityKrEnd)),
    localPriceMed: medianByKey(summaries.map(s => s.localPriceMed ?? {})),
    nameplateMed: medianByKey(summaries.map(s => s.nameplateEnd ?? {})),
    classCounts: countBy(Object.values(items).map(i => i.cls)),
  };
}

/**
 * Werdykt WARSTWY B (osiągalność): czy ceny bramkują postęp?
 *   0 AFFORDABLE — nic z katalogu nie zostaje nieosiągalne ani bramkujące
 *   1 GATED      — są pozycje nieosiągalne / bramkujące (lista w werdykcie)
 *   2 NO_DATA
 * ⚠ „nieosiągalne" NIE rozdziela ceny od bramki technologicznej — pozycja może być
 * niekupiona dlatego, że bot nie odblokował tech. Raport podaje `requires` przy każdej.
 */
export function dynamicVerdict(agg, catalog, cfg = PRICE_DEFAULTS) {
  const rows = Object.entries(agg?.items ?? {});
  if (rows.length < 2) return { outcome: 2, label: 'NO DATA — pusty katalog zakupów', never: 0, gating: 0 };
  const pick = (c) => rows.filter(([, v]) => v.cls === c).map(([id]) => id);
  const never = pick(AFFORD_CLASS.NEVER), gating = pick(AFFORD_CLASS.GATING), trivial = pick(AFFORD_CLASS.TRIVIAL);
  if (never.length === 0 && gating.length === 0) {
    return {
      outcome: 0, never: 0, gating: 0, trivialCount: trivial.length, neverIds: [], gatingIds: [],
      label: `AFFORDABLE — wszystkie ${rows.length} pozycji katalogu osiągalne w horyzoncie panelu`,
    };
  }
  return {
    outcome: 1,
    label: `GATED — ${never.length} pozycji nigdy nieosiągalnych, ${gating.length} bramkujących (${trivial.length} trywialnych)`,
    never: never.length, gating: gating.length, trivialCount: trivial.length,
    neverIds: never, gatingIds: gating,
  };
}

// ── Narzędzia liczbowe ────────────────────────────────────────────
function mapVals(obj, f) {
  return Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k, f(v)]));
}
function medianByKey(maps) {
  const keys = new Set();
  for (const m of maps ?? []) for (const k of Object.keys(m ?? {})) keys.add(k);
  const out = {};
  for (const k of keys) out[k] = median((maps ?? []).map(m => m?.[k]).filter(v => v != null));
  return out;
}
function countBy(arr) {
  const out = {};
  for (const v of arr ?? []) out[v] = (out[v] ?? 0) + 1;
  return out;
}

export default PriceTelemetry;
