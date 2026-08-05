// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — ResourceTelemetry (czujnik ZASOBÓW, READ-ONLY)
// ───────────────────────────────────────────────────────────────
// Zbiera migawkę ekonomii SUROWCOWEJ z ŻYWYCH systemów gry raz na GAME-YEAR
// (gameTime; 1 gy = 12 civ-yr). NIC nie mutuje — czyste odczyty.
//
// HARD-CONSTRAINT (Phase 2): instrument, nie regulator. Zero stałych gry.
// Progi klasyfikacji poniżej to KNOBY heurystyki pomiaru (nie balans) — jawnie
// wystawione w wyniku, przestrajalne bez dotykania gry.
//
// Co mierzymy per zasób i rok (wszystko przeliczone na GAME-YEAR, HARD #3):
//   • stock          — stan magazynu (ground truth)
//   • prodPerGy      — produkcja wg ROZBICIA GRY (`ResourceSystem.getResourceBreakdown`
//                      — dokładnie ta liczba, którą widzi gracz w tooltipie; obejmuje
//                      kopalnie i budynki)
//   • consPerGy      — konsumpcja wg tego samego rozbicia (POP + budynki + fabryka)
//   • deltaPerGy     — REALNA zmiana stanu rok-do-roku (ground truth przepływu netto)
//   • unaccountedOutGy — reszta bilansu: (prod−cons) − delta. Czyli jednorazowe wydatki
//                      (budowa, statki, bursty fabryki, paliwo) ORAZ luka nameplate-vs-realna
//                      produkcja (np. throttling brownoutu kopalń). NIE rozdzielamy tych
//                      dwóch — to jawna granica pomiaru, patrz raport.
//   • blockedBuilds  — ile budynków tech-legalnych i kafel-legalnych jest NIEosiągalnych
//                      PRZEZ TEN zasób (koszt liczony realną formułą gry:
//                      computeBuildResourceCost/CommodityCost + `canAfford` gry)
//   • pendingShort   — ile zleceń w kolejce „brak surowców" gry (`BuildingSystem._pendingQueue`)
//                      czeka na TEN zasób
//
// Sercem czujnika jest odpowiedź na pytanie „który zasób WIĄŻE i kiedy":
//   BINDING = gospodarka stoi (żaden budynek nie jest osiągalny) I ten zasób jest
//             wśród blokerów  ⟶ twarde wiązanie
//             ALBO magazyn pusty i drenuje (głód survivalowy)
//   TIGHT   = blokuje ≥1 budynek albo zapas < TIGHT_COVER_GY lat zużycia
//   GLUT    = zapas ≥ GLUT_COVER_GY lat zużycia i nic nie blokuje (nadmiar bez ujścia)
//   INERT   = zero produkcji, zero konsumpcji, zero ruchu (zasób nie uczestniczy w grze)
//   OK      = reszta
//
// ⚠ ZAKRES: próbkujemy kolonię MACIERZYSTĄ (jak PopTelemetry). Kolonie wtórne /
// placówki poza zakresem slice'u — flaga `activeIsHome` pilnuje, że rozbicie gry
// (czyta `window.KOSMOS.buildingSystem/factorySystem`) dotyczy tej samej kolonii.
// ═══════════════════════════════════════════════════════════════

import { ALL_RESOURCES, MINED_RESOURCES, HARVESTED_RESOURCES, UTILITY_RESOURCES } from '../../data/ResourcesData.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { TERRAIN_TYPES } from '../../map/HexTile.js';
import { computeBuildResourceCost, computeBuildCommodityCost } from '../../data/EnvironmentCost.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

// 1 game-year = CIV_TIME_SCALE civ-years. Stawki gry są PER CIV-YEAR — mnożymy (HARD #3).
export const CIV_PER_GY = GAME_CONFIG.CIV_TIME_SCALE;

// Stan zasobu w danym roku.
export const RES_STATE = {
  BINDING: 'binding',  // wiąże — gospodarka stoi przez ten zasób (albo głód)
  TIGHT:   'tight',    // ciasno — blokuje coś albo zapas < 1 gy zużycia
  OK:      'ok',       // zdrowo
  GLUT:    'glut',     // nadmiar bez ujścia
  INERT:   'inert',    // zasób nie uczestniczy (brak produkcji, konsumpcji i ruchu)
};

// KNOBY heurystyki pomiaru (NIE stałe gry). Przestrajalne; kopiowane do meta wyniku.
export const RESOURCE_TELEMETRY_DEFAULTS = {
  TIGHT_COVER_GY:   1.0,   // zapas < 1 game-roku zużycia = ciasno
  GLUT_COVER_GY:    20.0,  // zapas ≥ 20 game-lat zużycia (i nic nie blokuje) = nadmiar
  STOCK_EPS:        1.0,   // magazyn ≤ to ≈ pusty
  FLOW_EPS:         0.01,  // przepływ ≤ to ≈ zero (test „inert")
  ENERGY_TIGHT_FRAC: 0.05, // bilans < 5% produkcji = sieć na styk
  ENERGY_GLUT_FRAC:  0.50, // bilans > 50% produkcji = połowa sieci stoi bezczynnie
};

// Autorytatywna lista zasobów — z DANYCH GRY (ResourcesData.ALL_RESOURCES:
// 10 MINED + 2 HARVESTED + 2 UTILITY). NIE zgadywana. Towary (CommoditiesData)
// nie mają rozbicia prod/cons w ResourceSystem (fabryka działa przez spend/receive)
// → wchodzą TYLKO do analizy blokerów, ze stanem magazynu.
export const RESOURCE_IDS = Object.keys(ALL_RESOURCES);

// Rodzaj zasobu — z TAKSONOMII GRY (ResourcesData), nie z listy „na oko". Klasyfikacja
// MUSI się rozgałęziać po rodzaju, bo `energy` i `research` NIE MAJĄ magazynu:
//   energy   = FLOW (bilans produkcja−zużycie; `getAmount('energy')` zwraca BILANS, nie zapas)
//   research = AKUMULATOR drenowany z założenia przez ResearchSystem (zero ≠ niedobór)
// Traktowanie ich jak inventory dawało fałszywe „binding/tight" w każdym roku
// (zapas ≈ 0 + ujemna delta) — pułapka definicyjna złapana na pierwszym przebiegu.
// Semantyka dwóch zasobów UTILITY (ResourcesData ma ich dokładnie dwa, o RÓŻNEJ naturze).
// Nowy zasób utility bez wpisu → 'accumulator' (zachowawczo: nigdy fałszywie nie „wiąże").
export const UTILITY_SEMANTICS = { energy: 'flow', research: 'accumulator' };
export const RESOURCE_KIND = {};
for (const id of Object.keys(MINED_RESOURCES))     RESOURCE_KIND[id] = 'mined';
for (const id of Object.keys(HARVESTED_RESOURCES)) RESOURCE_KIND[id] = 'harvested';
for (const id of Object.keys(UTILITY_RESOURCES))   RESOURCE_KIND[id] = UTILITY_SEMANTICS[id] ?? 'accumulator';
export const HAS_STOCKPILE = (kind) => kind === 'mined' || kind === 'harvested';

export class ResourceTelemetry {
  constructor(opts = {}) {
    this.cfg = { ...RESOURCE_TELEMETRY_DEFAULTS, ...opts };
    this._rows = [];
    this._prev = null;   // { gy, stock: {id: amount} } — do delty rok-do-roku
  }

  /** Migawka ŻYWEJ ekonomii zasobów w game-year `gy`. Dopisuje wiersz, nic nie mutuje. */
  sample(gy, ctx) {
    const row = ResourceTelemetry.snapshot(gy, ctx, this.cfg, this._prev);
    this._prev = { gy: row.gy, stock: row.stock };
    this._rows.push(row);
    return row;
  }

  /** Zebrany szereg czasowy (kopia). */
  getSeries() { return this._rows.slice(); }

  // ── Czysta migawka (bez `this`, bez mutacji) ─────────────────────
  // prev = { gy, stock } z poprzedniej próbki (null = brak historii → delta 0).
  static snapshot(gy, { home, colonyManager } = {}, cfg = RESOURCE_TELEMETRY_DEFAULTS, prev = null) {
    const resSys = home?.resourceSystem;
    const dGy = prev ? Math.max(1e-9, (gy - prev.gy)) : 1;

    const blk = ResourceTelemetry.blocked(home);

    const stock = {};
    const res = {};
    for (const id of RESOURCE_IDS) {
      const f = ResourceTelemetry.flows(resSys, id);
      stock[id] = f.stock;
      const prevStock = prev ? (prev.stock[id] ?? f.stock) : f.stock;
      const deltaPerGy = prev ? (f.stock - prevStock) / dGy : 0;
      // Reszta bilansu: ile „zniknęło" poza rozbiciem (jednorazowe wydatki + luka nameplate).
      const unaccountedOutGy = prev ? ((f.prodPerGy - f.consPerGy) - deltaPerGy) : 0;
      const blockedBuilds = blk.byRes[id] ?? 0;
      const pendingShort  = blk.pendingByRes[id] ?? 0;
      const kind = RESOURCE_KIND[id] ?? 'mined';
      // Zapas liczony w GAME-LATACH zużycia — tylko dla zasobów, które MAJĄ magazyn.
      const outflowGy = f.consPerGy + Math.max(0, unaccountedOutGy);
      const coverGy = !HAS_STOCKPILE(kind) ? null
        : (outflowGy > cfg.FLOW_EPS ? f.stock / outflowGy : Infinity);
      const state = ResourceTelemetry.classify({
        kind, stock: f.stock, prodPerGy: f.prodPerGy, consPerGy: f.consPerGy,
        deltaPerGy, coverGy, blockedBuilds, anyAffordable: blk.affordable > 0,
      }, cfg);
      res[id] = {
        kind,
        stock:      round(f.stock, 1),
        prod:       round(f.prodPerGy, 2),
        cons:       round(f.consPerGy, 2),
        delta:      round(deltaPerGy, 2),
        unaccOut:   round(Math.max(0, unaccountedOutGy), 2),
        netReg:     round(f.netRegPerGy, 2),
        cover:      coverGy != null && Number.isFinite(coverGy) ? round(coverGy, 2) : null,  // null = ∞ / nie dotyczy
        blockedBuilds, pendingShort,
        state,
      };
    }

    // Bramka uczciwości: konsumpcja POP zarejestrowana? (patrz raport — cross-colony bleed)
    const popCons = resSys?._producers?.get?.('civilization_consumption') ?? null;
    const pop = home?.civSystem?.population ?? 0;
    const popConsumptionZeroed = pop > 0 && (!popCons || Math.abs(popCons.food ?? 0) < 1e-9);

    const energy = resSys?.energy ?? {};
    const binding = RESOURCE_IDS.filter(id => res[id].state === RES_STATE.BINDING);
    // Top bloker liczony po WSZYSTKICH kluczach kosztu (surowce I towary) — bo realnym
    // blokerem bywa komponent (structural_alloys), nie surowiec.
    const topBlocker = Object.entries(blk.byRes).sort((a, b) => b[1] - a[1])[0] ?? null;

    return {
      gy: Math.round(gy),
      res,
      stock,                                    // wewnętrzne — do delty następnego roku
      commodityStock: blk.commodityStock,       // stan magazynu towarów-blokerów
      blockedBuilds:  blk.byRes,                // { resId|commodityId: liczba budynków }
      pendingByRes:   blk.pendingByRes,
      blockedCount:   blk.blocked,
      affordableCount: blk.affordable,
      pendingQueue:   blk.pendingQueue,
      stalled:        blk.affordable === 0,     // NIC nie jest osiągalne = gospodarka stoi
      topBlocker:     topBlocker ? topBlocker[0] : null,
      topBlockerCount: topBlocker ? topBlocker[1] : 0,
      binding,
      energyBalance:  round(energy.balance ?? 0, 2),
      energyAvail:    round(resSys?.getEnergyAvailability?.() ?? 1, 3),
      brownout:       !!energy.brownout,
      pop,
      colonies:       colonyManager?.getPlayerColonies?.().length ?? 0,
      popConsumptionZeroed,
      activeIsHome:   (colonyManager?._activePlanetId ?? null) === (home?.planetId ?? null),
    };
  }

  /** Przepływy jednego zasobu — z ROZBICIA GRY (ta sama liczba co tooltip gracza), na GAME-YEAR. */
  static flows(resSys, id) {
    if (!resSys) return { stock: 0, prodPerGy: 0, consPerGy: 0, netRegPerGy: 0 };
    let prod = 0, cons = 0;
    const bd = resSys.getResourceBreakdown?.(id) ?? { producers: {}, consumers: {} };
    for (const v of Object.values(bd.producers ?? {})) prod += (v.total ?? 0);
    for (const v of Object.values(bd.consumers ?? {})) cons += Math.abs(v.total ?? 0);
    return {
      stock:       resSys.getAmount?.(id) ?? 0,
      prodPerGy:   prod * CIV_PER_GY,
      consPerGy:   cons * CIV_PER_GY,
      netRegPerGy: (resSys.getPerYear?.(id) ?? 0) * CIV_PER_GY,
    };
  }

  /**
   * Które zasoby BLOKUJĄ budowę. Dla każdego budynku tech-legalnego, mającego wolny
   * legalny kafel (`BuildingSystem._canBuildOnTile` — realna reguła gry), liczymy koszt
   * REALNĄ formułą gry (`computeBuildResourceCost` + `computeBuildCommodityCost` — tą samą,
   * której używa `_build`) i pytamy magazyn gry (`canAfford`) o KAŻDY klucz osobno.
   *  latBuildCost = 1 (modyfikator polarny zależy od kafla) → koszt najtańszego wariantu;
   *  świadoma granica pomiaru: zaniża koszt na kaflach polarnych.
   * Drugi filar: `_pendingQueue` gry — zlecenia, które GRA już odłożyła na „brak surowców".
   */
  static blocked(home) {
    const out = { byRes: {}, pendingByRes: {}, blocked: 0, affordable: 0, noTile: 0,
      pendingQueue: 0, commodityStock: {} };
    const bSys = home?.buildingSystem, resSys = home?.resourceSystem;
    const tech = bSys?.techSystem;
    if (!bSys || !resSys) return out;

    const tiles = home?.grid?.toArray?.() ?? [];
    const free = tiles.filter(t => TERRAIN_TYPES[t.type]?.buildable && !t.isOccupied && !t.damaged);

    for (const b of Object.values(BUILDINGS)) {
      if (b.isCapital) continue;
      if (b.requires && !(tech?.isResearched?.(b.requires) ?? false)) continue;
      if (!free.some(t => bSys._canBuildOnTile?.(t, b))) { out.noTile++; continue; }
      const cost = {
        ...computeBuildResourceCost(b, home.planet, 1),
        ...computeBuildCommodityCost(b, home.planet),
      };
      const short = [];
      for (const [k, v] of Object.entries(cost)) {
        if (!(v > 0)) continue;
        if (!resSys.canAfford({ [k]: v })) short.push(k);
      }
      if (short.length === 0) { out.affordable++; continue; }
      out.blocked++;
      for (const k of short) {
        out.byRes[k] = (out.byRes[k] ?? 0) + 1;
        if (!(k in ALL_RESOURCES)) out.commodityStock[k] = round(resSys.getAmount(k), 1);
      }
    }

    // Kolejka gry „brak surowców" — czego brakuje odłożonym zleceniom.
    for (const order of (bSys._pendingQueue?.values?.() ?? [])) {
      out.pendingQueue++;
      for (const [k, v] of Object.entries(order.cost ?? {})) {
        if (!(v > 0)) continue;
        if (!resSys.canAfford({ [k]: v })) {
          out.pendingByRes[k] = (out.pendingByRes[k] ?? 0) + 1;
          if (!(k in ALL_RESOURCES)) out.commodityStock[k] = round(resSys.getAmount(k), 1);
        }
      }
    }
    return out;
  }

  /**
   * Klasyfikator stanu zasobu. Czysta funkcja, rozgałęziona po RODZAJU (taksonomia gry).
   *
   * Zasoby z MAGAZYNEM (mined / harvested) — drabina (kolejność ma znaczenie):
   *   INERT   — brak produkcji, konsumpcji, ruchu i zapasu (zasób nie uczestniczy)
   *   BINDING — gospodarka STOI (żaden budynek nie jest osiągalny) I ten zasób blokuje,
   *             ALBO magazyn pusty i drenuje (głód)
   *   TIGHT   — blokuje ≥1 budynek ALBO zapas < TIGHT_COVER_GY game-lat zużycia
   *   GLUT    — zapas ≥ GLUT_COVER_GY game-lat zużycia (albo brak ujścia) i nic nie blokuje
   *   OK      — reszta
   *
   * `energy` — FLOW bez magazynu: liczy się BILANS (deficyt = brownout throttluje całą
   *   produkcję gospodarczą, więc to realne wiązanie), a nie „zapas".
   * `research` — AKUMULATOR drenowany z założenia (ResearchSystem zjada do zera przy
   *   aktywnym badaniu): stan 0 to NIE niedobór. Tylko INERT (nic nie produkuje) / OK.
   *   Świadomie NIE mierzymy „wiązania badaniami" — to osobna metryka (tempo nauki).
   */
  static classify({ kind, stock, prodPerGy, consPerGy, deltaPerGy, coverGy, blockedBuilds, anyAffordable },
    cfg = RESOURCE_TELEMETRY_DEFAULTS) {
    const s = stock ?? 0;
    const prod = prodPerGy ?? 0, cons = consPerGy ?? 0;

    // AKUMULATOR (research): drenowany z założenia — stan 0 to NIE niedobór.
    if (kind === 'accumulator') {
      return (prod <= cfg.FLOW_EPS && s <= cfg.STOCK_EPS) ? RES_STATE.INERT : RES_STATE.OK;
    }
    // FLOW (energy): `stock` to BILANS (produkcja − zużycie), nie zapas.
    if (kind === 'flow') {
      if (prod <= cfg.FLOW_EPS && cons <= cfg.FLOW_EPS) return RES_STATE.INERT;
      if (s < 0) return RES_STATE.BINDING;                              // deficyt = brownout
      if (s < cfg.ENERGY_TIGHT_FRAC * prod) return RES_STATE.TIGHT;     // sieć na styk
      if (s > cfg.ENERGY_GLUT_FRAC * prod) return RES_STATE.GLUT;       // połowa sieci bezczynna
      return RES_STATE.OK;
    }

    const flow = Math.max(Math.abs(prod), Math.abs(cons), Math.abs(deltaPerGy ?? 0));
    if (flow <= cfg.FLOW_EPS && s <= cfg.STOCK_EPS) return RES_STATE.INERT;

    const blocking = (blockedBuilds ?? 0) > 0;
    const dryDraining = s <= cfg.STOCK_EPS && (deltaPerGy ?? 0) < 0;
    if ((blocking && !anyAffordable) || dryDraining) return RES_STATE.BINDING;

    const cover = coverGy == null ? Infinity : coverGy;
    if (blocking || cover < cfg.TIGHT_COVER_GY) return RES_STATE.TIGHT;
    if (cover >= cfg.GLUT_COVER_GY) return RES_STATE.GLUT;
    return RES_STATE.OK;
  }
}

function round(n, d) {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

// ═══════════════════════════════════════════════════════════════
// Podsumowania (czyste funkcje nad szeregiem — runner tylko drukuje, keeper testuje)
// ═══════════════════════════════════════════════════════════════

/** Podsumowanie JEDNEGO seeda. Lata liczone od gy≥1 (gy0 = baseline bez delty). */
export function summarizeSeed(series) {
  const rows = (series ?? []).filter(r => r && r.gy >= 1);
  const last = rows[rows.length - 1] ?? { res: {} };

  const byRes = {};
  for (const id of RESOURCE_IDS) {
    byRes[id] = { binding: 0, tight: 0, ok: 0, glut: 0, inert: 0,
      firstBindGy: null, blockedYears: 0, sumProd: 0, sumCons: 0,
      finalStock: last.res?.[id]?.stock ?? 0, finalState: last.res?.[id]?.state ?? RES_STATE.INERT,
      finalCover: last.res?.[id]?.cover ?? null };
  }
  const topBlockerYears = {}, blockerYears = {};
  let stalledYears = 0, firstStallGy = null, popConsZeroedFromGy = null;

  for (const r of rows) {
    if (r.stalled) { stalledYears++; if (firstStallGy == null) firstStallGy = r.gy; }
    if (r.popConsumptionZeroed && popConsZeroedFromGy == null) popConsZeroedFromGy = r.gy;
    if (r.topBlocker) topBlockerYears[r.topBlocker] = (topBlockerYears[r.topBlocker] ?? 0) + 1;
    for (const k of Object.keys(r.blockedBuilds ?? {})) blockerYears[k] = (blockerYears[k] ?? 0) + 1;
    for (const id of RESOURCE_IDS) {
      const e = r.res?.[id]; if (!e) continue;
      const b = byRes[id];
      b[e.state] = (b[e.state] ?? 0) + 1;
      if (e.state === RES_STATE.BINDING && b.firstBindGy == null) b.firstBindGy = r.gy;
      if ((e.blockedBuilds ?? 0) > 0) b.blockedYears++;
      b.sumProd += e.prod ?? 0;
      b.sumCons += e.cons ?? 0;
    }
  }
  const n = rows.length || 1;
  for (const id of RESOURCE_IDS) {
    byRes[id].meanProd = round(byRes[id].sumProd / n, 2);
    byRes[id].meanCons = round(byRes[id].sumCons / n, 2);
    delete byRes[id].sumProd; delete byRes[id].sumCons;
  }

  return {
    years: rows.length, finalGy: last.gy ?? 0,
    stalledYears, firstStallGy, popConsZeroedFromGy,
    finalColonies: last.colonies ?? 0, finalPop: last.pop ?? 0,
    finalBrownout: !!last.brownout, finalEnergyAvail: last.energyAvail ?? 1,
    byRes, topBlockerYears, blockerYears,
  };
}

/** Agregat panelu (wszystkie seedy) — kto wiąże, jak często, na ilu seedach, od kiedy. */
export function aggregatePanel(summaries) {
  const byRes = {};
  for (const id of RESOURCE_IDS) {
    byRes[id] = { bindingYears: 0, tightYears: 0, glutYears: 0, inertYears: 0, okYears: 0,
      blockedYears: 0, seedsBinding: 0, seedsGlutFinal: 0, seedsInertFinal: 0,
      earliestBindGy: null, meanProd: 0, meanCons: 0 };
  }
  const topBlockers = {};
  let totalYears = 0, stalledYears = 0, seedsStalled = 0, seedsPopConsZeroed = 0;

  for (const s of summaries) {
    totalYears += s.years;
    stalledYears += s.stalledYears;
    if (s.stalledYears > 0) seedsStalled++;
    if (s.popConsZeroedFromGy != null) seedsPopConsZeroed++;
    for (const [k, v] of Object.entries(s.topBlockerYears ?? {})) topBlockers[k] = (topBlockers[k] ?? 0) + v;
    for (const id of RESOURCE_IDS) {
      const b = s.byRes[id], a = byRes[id];
      a.bindingYears += b.binding; a.tightYears += b.tight; a.glutYears += b.glut;
      a.inertYears += b.inert; a.okYears += b.ok; a.blockedYears += b.blockedYears;
      if (b.binding > 0) a.seedsBinding++;
      if (b.finalState === RES_STATE.GLUT) a.seedsGlutFinal++;
      if (b.finalState === RES_STATE.INERT) a.seedsInertFinal++;
      if (b.firstBindGy != null) a.earliestBindGy = a.earliestBindGy == null ? b.firstBindGy : Math.min(a.earliestBindGy, b.firstBindGy);
      a.meanProd += b.meanProd; a.meanCons += b.meanCons;
    }
  }
  const n = summaries.length || 1;
  for (const id of RESOURCE_IDS) {
    byRes[id].meanProd = round(byRes[id].meanProd / n, 2);
    byRes[id].meanCons = round(byRes[id].meanCons / n, 2);
    byRes[id].keepsUp = byRes[id].meanProd >= byRes[id].meanCons;   // czy produkcja nadąża za konsumpcją
  }
  return { seeds: summaries.length, totalYears, stalledYears, seedsStalled, seedsPopConsZeroed, byRes, topBlockers };
}

/**
 * Werdykt panelowy — który zasób WIĄŻE panel (najwięcej seed-lat w stanie BINDING).
 *   0 NO_BINDING  — żaden zasób nie wiąże (gospodarka nigdy nie stoi na zasobie)
 *   1 SINGLE      — jeden zasób dominuje (≥60% wiążących seed-lat)
 *   2 MIXED       — wiąże kilka zasobów bez dominanta
 */
export function panelVerdict(agg) {
  const entries = Object.entries(agg.byRes ?? {})
    .map(([id, v]) => [id, v.bindingYears]).filter(([, y]) => y > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, y]) => s + y, 0);
  if (total === 0) return { outcome: 0, label: 'NO BINDING — żaden zasób nie wiąże gospodarki', binder: null, share: 0 };
  const [topId, topYears] = entries[0];
  const share = topYears / total;
  if (share >= 0.6)
    return { outcome: 1, label: `BOUND BY ${topId} — jeden zasób wiąże gospodarkę`, binder: topId, share, bindingYears: total };
  return { outcome: 2, label: 'MIXED — wiąże kilka zasobów bez dominanta', binder: topId, share, bindingYears: total };
}

export default ResourceTelemetry;
