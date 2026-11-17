// EconomyConsoleLogic — czysta logika konsoli grupy Ekonomii (ARC KONSOLE K3, docs/design/CONSOLES_PLAN.md §1.2, D-K-15, D-K-16;
// Finding 725 — etykiety efektu podatku przez t()).
//
// Bez DOM i canvas — testowalne pod node (keeper `console_economy_smoke.mjs`). Widok: `EconomyConsoleView.js` (Budżet, Przepływy).
//  • czipy grupy (D-K-15): [ BUDŻET ] [ PRODUKCJA ] [ HANDEL ] [ RYNEK ] [ PRZEPŁYWY ] — drugi poziom zakładek Handlu (Handel / Rynek)
//    staje się dwoma czipami grupy; HANDEL i RYNEK otwierają ten sam overlay `trade` z inną zakładką (stan Handlu zostaje);
//  • Budżet: linie przychodów / wydatków z tych samych danych co dzisiejsza zakładka (`EconomyOverlay._gatherBudgetData`), netto
//    tym samym wzorem, rozbicie wybranej linii, efekt stawki podatku (ta sama formuła co dziś), ticker deficytów / nadwyżek;
//  • Przepływy: diagram producenci → zasób → konsumenci (pasma, wąskie gardło), wiersze listy jak dziś;
//  • D-K-16 (warunkowe): które linie lewej kolumny inwentarza pokazuje już górna szuflada zasobów — reszta idzie do bloku inspektora.

import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';

// ── Czipy grupy (D-K-15) ─────────────────────────────────────────────────────────────────────────────────────────────

/** Kolejność czipów grupy Ekonomii; `market` = zakładka Rynek overlayu `trade`. */
export const ECON_GROUP_CHIP_IDS = Object.freeze(['budget', 'economy', 'trade', 'market', 'flows']);
const CHIP_LABEL_KEY = Object.freeze({
  budget: 'civPanel.budget', economy: 'civPanel.economy', trade: 'tradePanel.tabTrade', market: 'tradePanel.tabMarket',
  flows: 'civPanel.flows',
});

/** Który czip jest aktywny: aktywny overlay grupy, a dla `trade` — jego zakładka (`'trade'` | `'market'`). */
export function activeEconChip(activeId, tradeTab) {
  if (activeId === 'trade') return tradeTab === 'market' ? 'market' : 'trade';
  return activeId;
}

/** Czipy nagłówka `{ id, label, active }` (etykiety przez `tFn`). */
export function economyGroupChips(activeId, tradeTab, tFn) {
  const act = activeEconChip(activeId, tradeTab);
  return ECON_GROUP_CHIP_IDS.map((id) => ({ id, label: tFn(CHIP_LABEL_KEY[id]), active: id === act }));
}

/** Dokąd prowadzi czip: overlay do otwarcia + zakładka Handlu (null = bez zmiany zakładki). */
export function econChipTarget(id) {
  if (id === 'market') return { panel: 'trade', tradeTab: 'market' };
  if (id === 'trade') return { panel: 'trade', tradeTab: 'trade' };
  return { panel: id, tradeTab: null };
}

/**
 * Klik czipu grupy: ustawia zakładkę instancji Handlu (bez zerowania reszty jej stanu) i otwiera overlay. Gdy overlay już jest
 * aktywny (np. Handel → Rynek), nie otwiera go ponownie. Zwraca cel.
 * @param {string} id
 * @param {{ active?:string, overlays?:object, openPanel?:Function }|null} om — `window.KOSMOS.overlayManager`
 */
export function applyEconChip(id, om) {
  const tgt = econChipTarget(id);
  if (!om) return tgt;
  if (tgt.tradeTab) {
    const tr = om.overlays?.trade;
    if (tr && tr._tab !== tgt.tradeTab) {
      tr._tab = tgt.tradeTab;
      tr._scrollLeft = 0;     // jak dzisiejszy klik zakładki Handel / Rynek (TradeOverlay._onHit 'tab')
      tr._scrollRight = 0;
      tr._closeQtyInput?.();
    }
  }
  if (om.active !== tgt.panel) om.openPanel?.(tgt.panel);
  return tgt;
}

// ── Budżet ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Netto Kr/rok — TEN SAM wzór co dzisiejsza zakładka: handel + podatki − jednostki − flota − płace. */
export function budgetNet(d) {
  return (d.totalCreditsPerYear ?? 0) + (d.taxIncome ?? 0)
    - (d.totalUnitUpkeep ?? 0) - (d.totalFleetUpkeep ?? 0) - (d.totalLaborCost ?? 0);
}

/** Przychody i wydatki (Kr/rok) dla paska porównania: dodatnie części linii przychodu vs reszta; income − expense = netto. */
export function budgetTotals(d) {
  const pos = (v) => Math.max(0, v ?? 0), neg = (v) => Math.max(0, -(v ?? 0));
  const income = pos(d.totalCreditsPerYear) + pos(d.taxIncome);
  const expense = neg(d.totalCreditsPerYear) + neg(d.taxIncome)
    + (d.totalLaborCost ?? 0) + (d.totalUnitUpkeep ?? 0) + (d.totalFleetUpkeep ?? 0);
  return { income, expense, net: income - expense };
}

/**
 * Wiersze listy Budżetu: grupy PRZYCHODY / WYDATKI / INNE, linie `{ id, labelKey, count?, value, unit, kind }`.
 * `kind` — 'income' | 'expense' | 'info'. Linie jak dzisiejsza zakładka (handel, podatki, płace, jednostki, flota + rezerwa,
 * skarbiec, badania); w konsoli linie wydatków stoją zawsze (0 = dim), rezerwa tylko gdy jest (jak dziś).
 */
export function budgetLines(d) {
  const fu = d.fleetUpkeep;
  const out = [
    { group: true, id: 'g_income', labelKey: 'econ.console.groupIncome' },
    { id: 'trade', labelKey: 'econ.console.lineTrade', value: d.totalCreditsPerYear ?? 0, unit: 'kryr', kind: 'income' },
    { id: 'tax', labelKey: 'civOverlay.taxIncome', value: d.taxIncome ?? 0, unit: 'kryr', kind: 'income' },
    { group: true, id: 'g_expense', labelKey: 'econ.console.groupExpense' },
    { id: 'labor', labelKey: 'civOverlay.laborCost', value: -(d.totalLaborCost ?? 0), unit: 'kryr', kind: 'expense' },
    { id: 'units', labelKey: 'civOverlay.unitUpkeep', count: d.unitUpkeepCount ?? 0, value: -(d.totalUnitUpkeep ?? 0), unit: 'kryr', kind: 'expense' },
    { id: 'fleet', labelKey: 'civOverlay.fleetUpkeep', count: d.fleetUpkeepCount ?? 0, value: -(d.totalFleetUpkeep ?? 0), unit: 'kryr', kind: 'expense' },
  ];
  if (fu && fu.reserveCount > 0) {
    out.push({ id: 'fleet_reserve', labelKey: 'fleet.reserveUpkeepRow', count: fu.reserveCount, value: -(fu.reserve ?? 0), unit: 'kryr', kind: 'expense', sub: true });
  }
  out.push(
    { group: true, id: 'g_info', labelKey: 'econ.console.groupInfo' },
    { id: 'treasury', labelKey: 'civOverlay.credits', value: d.totalCredits ?? 0, unit: 'kr', kind: 'info' },
    { id: 'research', labelKey: 'civOverlay.research', value: d.totalResearch ?? 0, unit: 'yr', kind: 'info' },
  );
  return out;
}

/** Ton roli dla wartości linii (wydatek ≠ 0 → alert; zero → dim). */
export function budgetLineTone(line) {
  if (!line || Math.abs(line.value ?? 0) < 1e-9) return 'dim';
  if (line.kind === 'info') return 'primary';
  return line.value < 0 ? 'alert' : 'primary';
}

/** Tekst wartości linii: znak + liczba (1 miejsce dla Kr/rok i badań, całe dla skarbca). */
export function fmtSigned(v, digits = 1) {
  const n = Number(v) || 0;
  const s = Math.abs(n) >= 10000 ? Math.round(n).toString() : n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}

/**
 * Rozbicie wybranej linii: `[{ label, value }]` (malejąco po |value|). `w` — dane świata zebrane przez widok:
 * `{ colonies:[{ name, creditsPerYear, tax, labor, credits, research, isOutpost }], units:[{ archetypeId, name, credits }],
 *    fleet:{ deployed, reserve, deployedCount, reserveCount } }`.
 */
export function budgetBreakdown(lineId, w) {
  const cols = w?.colonies ?? [];
  const sortAbs = (rows) => rows.filter((r) => Math.abs(r.value) > 1e-9).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  switch (lineId) {
    case 'trade':    return sortAbs(cols.map((c) => ({ label: c.name, value: c.creditsPerYear ?? 0 })));
    case 'tax':      return sortAbs(cols.filter((c) => !c.isOutpost).map((c) => ({ label: c.name, value: c.tax ?? 0 })));
    case 'labor':    return sortAbs(cols.filter((c) => !c.isOutpost).map((c) => ({ label: c.name, value: -(c.labor ?? 0) })));
    case 'treasury': return sortAbs(cols.map((c) => ({ label: c.name, value: c.credits ?? 0 })));
    case 'research': return sortAbs(cols.map((c) => ({ label: c.name, value: c.research ?? 0 })));
    case 'units': {
      const by = new Map();
      for (const u of w?.units ?? []) {
        const k = u.archetypeId;
        const e = by.get(k) ?? { label: u.name ?? k, value: 0, count: 0 };
        e.value -= u.credits ?? 0; e.count++;
        by.set(k, e);
      }
      return sortAbs([...by.values()].map((e) => ({ label: `${e.label} ×${e.count}`, value: e.value })));
    }
    case 'fleet':
    case 'fleet_reserve': {
      const f = w?.fleet;
      if (!f) return [];
      return [
        { label: 'inService', value: -(f.deployed ?? 0), count: f.deployedCount ?? 0, key: 'inService' },
        { label: 'reserve', value: -(f.reserve ?? 0), count: f.reserveCount ?? 0, key: 'reserve' },
      ];
    }
    default: return [];
  }
}

// ── Podatki (Finding 725) ────────────────────────────────────────────────────────────────────────────────────────────

export const TAX_MAX = 0.25;          // klamra stawki w ColonyManager (setter)
export const TAX_BANDS = Object.freeze([0.05, 0.12, 0.20]);   // progi efektu (dotacja | neutralne | cięcie | protest)

/**
 * Efekt stawki na konsumpcję — TA SAMA formuła co `EconomyOverlay._getTaxEffectLabel` przed K3; zwraca klucz i18n + procent.
 * @returns {{ key:string, pct:number, tone:'primary'|'dim'|'alert' }}
 */
export function taxEffect(rate) {
  const drain = rate <= 0.05 ? -(0.05 - rate) * 200
              : rate <= 0.12 ? 0
              : (rate - 0.12) / 0.13 * 40;
  const drainPct = Math.round(drain);
  if (drainPct < 0) return { key: 'econPanel.taxEffect.subsidy', pct: -drainPct, tone: 'primary' };
  if (drainPct === 0) return { key: 'econPanel.taxEffect.neutral', pct: 0, tone: 'dim' };
  if (rate <= 0.20) return { key: 'econPanel.taxEffect.cut', pct: drainPct, tone: 'alert' };
  return { key: 'econPanel.taxEffect.protest', pct: drainPct, tone: 'alert' };
}

/** Stawka z pozycji kliknięcia na pasku — TA SAMA reguła co dzisiejszy `_onHit('tax_slider')` (klamra, krok 1 %). */
export function taxRateFromX(hitX, barX, barW) {
  const relX = Math.max(0, Math.min(barW, hitX - barX));
  return Math.round((relX / barW) * TAX_MAX * 100) / 100;
}

/** Ton roli stawki (dzisiejsze 4 kolory → role: do 20 % primary, powyżej alert). */
export function taxTone(rate) { return rate > TAX_BANDS[2] ? 'alert' : 'primary'; }

// ── Ticker deficytów / nadwyżek ──────────────────────────────────────────────────────────────────────────────────────

/** Te same filtry co dzisiejsza zakładka: zasoby z ALL_RESOURCES, |rate| > 0,5, po 4 najmocniejsze z każdej strony. */
export function budgetTicker(globalResources, allResources, limit = 4) {
  const sorted = Object.entries(globalResources ?? {})
    .filter(([id]) => allResources?.[id])
    .sort((a, b) => a[1].rate - b[1].rate);
  const deficits = sorted.filter(([, v]) => v.rate < -0.5).slice(0, limit).map(([id, v]) => ({ id, rate: v.rate, stock: v.stock }));
  const surpluses = sorted.filter(([, v]) => v.rate > 0.5).reverse().slice(0, limit).map(([id, v]) => ({ id, rate: v.rate, stock: v.stock }));
  return { deficits, surpluses };
}

// ── Przepływy ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Wiersze listy Przepływów — TE SAME co dziś: sumy z `_producers` kolonii gracza (bez energii i badań), malejąco po obrocie. */
export function flowListItems(colonies) {
  const flows = {};
  for (const col of colonies ?? []) {
    const rs = col?.resourceSystem;
    if (!rs?._producers) continue;
    for (const rates of rs._producers.values()) {
      for (const [resId, rate] of Object.entries(rates)) {
        if (resId === 'energy' || resId === 'research') continue;
        if (!flows[resId]) flows[resId] = { prod: 0, cons: 0 };
        if (rate > 0) flows[resId].prod += rate;
        else flows[resId].cons += Math.abs(rate);
      }
    }
  }
  return Object.entries(flows)
    .filter(([, f]) => f.prod > 0 || f.cons > 0)
    .sort((a, b) => (b[1].prod + b[1].cons) - (a[1].prod + a[1].cons))
    .map(([id, f]) => ({ id, prod: f.prod, cons: f.cons, bal: f.prod - f.cons }));
}

/**
 * Diagram przepływu wybranego zasobu z rozbicia `{ producers:{type:val}, consumers:{type:val} }` (`_gatherFlowBreakdown`):
 * węzły posortowane malejąco, ponad `maxNodes` → węzeł zbiorczy `{ type:'__more', count }`; `frac` = udział w max(suma prod,
 * suma kons) — grubość pasma. Wąskie gardło = konsumpcja > produkcja (netto < 0).
 */
export function flowDiagram(breakdown, maxNodes = 6) {
  const side = (obj) => {
    const all = Object.entries(obj ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([type, val]) => ({ type, val }));
    if (all.length <= maxNodes) return all;
    const head = all.slice(0, maxNodes - 1);
    const rest = all.slice(maxNodes - 1);
    head.push({ type: '__more', count: rest.length, val: rest.reduce((s, e) => s + e.val, 0) });
    return head;
  };
  const prod = side(breakdown?.producers), cons = side(breakdown?.consumers);
  const prodTotal = prod.reduce((s, e) => s + e.val, 0), consTotal = cons.reduce((s, e) => s + e.val, 0);
  const scale = Math.max(prodTotal, consTotal, 1e-9);
  for (const e of prod) e.frac = e.val / scale;
  for (const e of cons) e.frac = e.val / scale;
  const net = prodTotal - consTotal;
  return { prod, cons, prodTotal, consTotal, net, bottleneck: consTotal > prodTotal + 1e-9 };
}

/** Lata do wyczerpania zapasu przy ujemnym netto (null, gdy netto ≥ 0 albo brak zapasu). */
export function yearsToEmpty(stock, net) {
  if (!(net < 0) || !(stock > 0)) return null;
  return stock / -net;
}

// ── D-K-16 — lewa kolumna inwentarza vs górna szuflada ───────────────────────────────────────────────────────────────

/**
 * Id linii, które górna szuflada zasobów (`TopResourceDrawer._colonyTokens`) pokazuje dla każdej kolonii gracza: 10 wydobywalnych,
 * 2 zbieralne, paliwo, energia (bilans + brownout). Keeper porównuje ten zbiór z wykonaniem `_colonyTokens` na kolonii-atrapie.
 */
export function drawerLineIds() {
  return new Set([...Object.keys(MINED_RESOURCES), ...Object.keys(HARVESTED_RESOURCES), 'fuel', 'energy']);
}

/** Sortowanie towarów jak lewa kolumna: zwykłe przed konsumpcyjnymi, potem tier. */
export function commoditySort(a, b) {
  const ga = a.isConsumerGood ? 1 : 0, gb = b.isConsumerGood ? 1 : 0;
  if (ga !== gb) return ga - gb;
  return (a.tier ?? 0) - (b.tier ?? 0);
}

/**
 * Agregat magazynu jak `_drawLeft`: suma inventory + stawki (obserwowane delty, fallback `_inventoryPerYear`) po encjach.
 * @returns {{ inv:Object<string,number>, rate:Object<string,number> }}
 */
export function aggregateStock(entities) {
  const inv = {}, rate = {};
  for (const col of entities ?? []) {
    const rs = col?.resourceSystem;
    if (!rs) continue;
    if (rs.inventory) for (const [id, amt] of rs.inventory) inv[id] = (inv[id] ?? 0) + amt;
    const observed = rs._deltaTracker?.observedPerYear;
    if (observed && observed.size > 0) {
      for (const [id, r] of observed) rate[id] = (rate[id] ?? 0) + r;
    } else if (rs._inventoryPerYear) {
      for (const [id, r] of rs._inventoryPerYear) rate[id] = (rate[id] ?? 0) + r;
    }
  }
  return { inv, rate };
}

/**
 * Linie, które pokazuje dziś lewa kolumna (w jej kolejności): wydobywalne, zbieralne, towary (z wybraną kolonią wszystkie,
 * globalnie tylko z zapasem lub ruchem), bilans energii. `selected` — czy wybrano kolonię / stację (filtr Produkcji).
 */
export function columnLineIds({ inv = {}, rate = {}, selected = false } = {}) {
  const coms = Object.values(COMMODITIES)
    .filter((c) => (selected ? true : ((inv[c.id] ?? 0) > 0 || (rate[c.id] ?? 0) !== 0)))
    .sort(commoditySort)
    .map((c) => c.id);
  return [...Object.keys(MINED_RESOURCES), ...Object.keys(HARVESTED_RESOURCES), ...coms, 'energy'];
}

/**
 * Blok inspektora D-K-16: linie kolumny, których szuflada nie pokazuje (dziś: towary poza paliwem), w kolejności kolumny,
 * z ilością i stawką; plus — gdy są stacje-sieroty (własny magazyn, brak w szufladzie, która pokazuje tylko kolonie) — ich
 * niezerowe linie surowców i paliwa (sumy kolumny je zawierają); stacja wybrana w filtrze Produkcji (`all`) — wszystkie te linie, także
 * zerowe (kolumna rysuje je wtedy wszystkie). Bilans energii stacji pominięty: stacja nie ma systemu energii (kolumna pisze 0.0).
 * @param {{ inv, rate, selected, stations?:Array<{ name, inv:Object, rate:Object, all?:boolean }> }} p
 * @returns {{ goods:Array<{id,amount,rate}>, stations:Array<{ name, lines:Array<{id,amount,rate}> }> }}
 */
export function stockBlockLines({ inv = {}, rate = {}, selected = false, stations = [] } = {}) {
  const drawer = drawerLineIds();
  const goods = columnLineIds({ inv, rate, selected })
    .filter((id) => !drawer.has(id))
    .map((id) => ({ id, amount: inv[id] ?? 0, rate: rate[id] ?? 0 }));
  const st = (stations ?? []).map((s) => ({
    name: s.name,
    lines: [...drawer].filter((id) => id !== 'energy' && (s.all || (s.inv?.[id] ?? 0) > 0 || (s.rate?.[id] ?? 0) !== 0))
      .map((id) => ({ id, amount: s.inv?.[id] ?? 0, rate: s.rate?.[id] ?? 0 })),
  })).filter((s) => s.lines.length > 0);
  return { goods, stations: st };
}
