// TradeConsoleLogic — czysta logika konsoli Handlu (Handel + Rynek) w grupie Ekonomii (ARC KONSOLE K3-B,
// docs/design/CONSOLES_PLAN.md §1.2; Finding 725 — nazwy towarów zamiast surowych id).
//
// Bez DOM i canvas — testowalne pod node (keeper `console_trade_smoke.mjs`). Widok: `TradeConsoleView.js`.
// Reguły (ceny lokalne, cel zakupu awaryjnego, partnerzy Rynku) — TE SAME co dawna strona `TradeOverlay` (usunięta w KZ-E).

import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { BASE_PRICE } from '../data/TradeValuesData.js';

/** Nazwa towaru / surowca przez `getNameFn(def, kind)` (i18n); nieznane id — samo id (jak dziś). */
export function goodName(id, getNameFn) {
  const cd = COMMODITIES[id], rd = ALL_RESOURCES[id];
  if (cd) return getNameFn(cd, 'commodity');
  if (rd) return getNameFn(rd, 'resource');
  return id;
}

/** Ikona towaru z definicji (pusty napis, gdy brak). */
export function goodIcon(id) { return (COMMODITIES[id] ?? ALL_RESOURCES[id])?.icon ?? ''; }

/**
 * Wiersze listy połączeń: `{ id: partnerId, name, distance, exports, imports }` (liczba przepływów w każdą stronę).
 * @param {Array<{partnerId,partnerName,distance}>} conns — `civilianTradeSystem.getConnections`
 * @param {Array<{partnerId,direction}>} flows — `civilianTradeSystem.getFlowsForColony`
 */
export function connectionRows(conns, flows) {
  return (conns ?? []).map((c) => {
    const own = (flows ?? []).filter((f) => f.partnerId === c.partnerId);
    return { id: c.partnerId, name: c.partnerName ?? '???', distance: c.distance ?? 0,
      exports: own.filter((f) => f.direction === 'export').length, imports: own.filter((f) => f.direction === 'import').length };
  });
}

/** Id pierwszego wiersza listy połączeń „Wszystkie połączenia” — dzisiejszy widok globalny kolonii (polerka K3). */
export const ALL_CONNS = '*';

/**
 * Wybrane połączenie: zapamiętane, gdy wciąż istnieje; inaczej „wszystkie” (`ALL_CONNS`) — dzisiejszy wykres globalny.
 * Null przy braku połączeń.
 */
export function pickConnection(rows, selectedId) {
  if (!rows?.length) return null;
  if (selectedId === ALL_CONNS) return ALL_CONNS;
  return rows.some((r) => r.id === selectedId) ? selectedId : ALL_CONNS;
}

/**
 * Historia JEDNEGO połączenia z dziennika transakcji kolonii (wpisy `{ year, type, items, partnerName }`): ten sam kształt
 * co `TradeLog.getYearlyAggregation` (`{ year, exports, imports, exportItems, importItems }`), tylko wpisy z partnerem
 * `partnerName`. Dziennik trzyma nazwę partnera, nie id — dopasowanie po nazwie (jedyny klucz, jaki zapisuje).
 */
export function connectionHistory(log, partnerName, buckets = 10) {
  const byYear = new Map();
  for (const e of log ?? []) {
    if (!e || e.partnerName !== partnerName) continue;
    const yr = Math.floor(e.year ?? 0);
    if (!byYear.has(yr)) byYear.set(yr, { year: yr, exports: 0, imports: 0, exportItems: {}, importItems: {} });
    const agg = byYear.get(yr);
    const exp = e.type === 'export';
    for (const [id, q] of Object.entries(e.items ?? {})) {
      if (exp) { agg.exports += q; agg.exportItems[id] = (agg.exportItems[id] ?? 0) + q; }
      else { agg.imports += q; agg.importItems[id] = (agg.importItems[id] ?? 0) + q; }
    }
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year).slice(-buckets);
}

/**
 * Bieżące przepływy JEDNEGO połączenia jako słupki (gdy dziennik nie ma jego historii): `{ goodId, qty, isExport }`,
 * malejąco po ilości. `partnerId === ALL_CONNS` — wszystkie przepływy kolonii zsumowane per towar i kierunek.
 */
export function connectionFlowBars(flows, partnerId) {
  const acc = new Map();
  for (const f of flows ?? []) {
    if (partnerId !== ALL_CONNS && f.partnerId !== partnerId) continue;
    const isExport = f.direction === 'export';
    const k = `${isExport ? 'e' : 'i'}|${f.goodId}`;
    if (!acc.has(k)) acc.set(k, { goodId: f.goodId, qty: 0, isExport });
    acc.get(k).qty += f.qtyPerYear ?? 0;
  }
  return [...acc.values()].filter((b) => b.qty >= 0.01).sort((a, b) => b.qty - a.qty);
}

/**
 * Bramka zlecenia Rynku (KUP / SPRZEDAJ) — powód odmowy PRZED klikiem, nigdy cichy brak reakcji. Kolejność = kolejność
 * `TradeOrderBoard.placeOrder` (kolonia gracza → warp `ion_drives` → traktat), potem warunki rozliczenia `_settle`, które dziś
 * anulują zlecenie po roku (kredyty / zapas kupującego i sprzedającego). Zwraca `{ ok, key, args }` — `key` = klucz i18n powodu.
 * @param {{ side:'buy'|'sell', playerOk:boolean, warp:boolean, agreement:boolean, qty:number, total:number,
 *   playerCredits:number, aiCredits:number, aiStock:number, ownStock:number, empireName:string, techName:string }} s
 */
export function orderGate(s) {
  const no = (key, ...args) => ({ ok: false, key, args });
  if (!s?.playerOk) return no('econ.console.gateNoColony');
  if (!(s.qty > 0)) return no('econ.console.gateQty');
  if (!s.warp) return no('econ.console.gateTech', s.techName ?? '');
  if (!s.agreement) return no('econ.console.gateTreaty', s.empireName ?? '');
  if (s.side === 'buy') {
    if ((s.playerCredits ?? 0) < s.total) return no('econ.console.gateCredits', fmtKr(s.total), fmtKr(s.playerCredits ?? 0));
    if ((s.aiStock ?? 0) < s.qty) return no('econ.console.gatePartnerStock', String(Math.floor(s.aiStock ?? 0)));
  } else {
    if ((s.ownStock ?? 0) < s.qty) return no('econ.console.gateOwnStock', String(Math.floor(s.ownStock ?? 0)));
    if ((s.aiCredits ?? 0) < s.total) return no('econ.console.gatePartnerCredits', fmtKr(s.aiCredits ?? 0));
  }
  return { ok: true, key: null, args: [] };
}

/**
 * Ceny lokalne podzielone jak dziś: drogie = mnożnik > 1,5 (5 najdroższych), tanie = < 0,8 (5 najtańszych, od najtańszego).
 * @param {Array<{id:string, mult:number}>} prices — `TradeOverlay._calcLocalPrices`
 */
export function priceGroups(prices) {
  const sorted = [...(prices ?? [])].sort((a, b) => b.mult - a.mult);
  return {
    expensive: sorted.filter((p) => p.mult > 1.5).slice(0, 5),
    cheap: sorted.filter((p) => p.mult < 0.8).slice(-5).reverse(),
  };
}

/** Zakup awaryjny jak dziś: najdroższy towar z mnożnikiem ≥ 2, koszt = ceil(cena bazowa × mnożnik × ilość × 0,15). */
export const EMERGENCY_BUY_QTY = 50;
export function emergencyBuy(prices, qty = EMERGENCY_BUY_QTY) {
  const scarce = (prices ?? []).filter((p) => p.mult >= 2.0).sort((a, b) => b.mult - a.mult);
  const target = scarce.length > 0 ? scarce[0] : null;
  const cost = target ? Math.ceil(BASE_PRICE[target.id] * target.mult * qty * 0.15) : 0;
  return { target, cost, qty };
}

/**
 * Wiersze listy partnerów Rynku: imperium (`kind:'empire'`), a pod WYBRANYM imperium jego kolonie (`kind:'colony'`) — ta sama
 * reguła rozwijania co dzisiejsza lewa kolumna. Id wierszy unikalne (`e:` / `c:`).
 * @param {Map<string, Array<{planetId,name}>>} byEmpire
 */
export function partnerRows(byEmpire, selectedEmpireId, nameOf) {
  const rows = [];
  for (const [empireId, cols] of byEmpire ?? new Map()) {
    rows.push({ kind: 'empire', id: `e:${empireId}`, empireId, name: nameOf(empireId), count: cols.length });
    if (selectedEmpireId !== empireId) continue;
    for (const col of cols) rows.push({ kind: 'colony', id: `c:${col.planetId}`, empireId, aiColId: col.planetId, name: col.name ?? col.planetId });
  }
  return rows;
}

/** Ile kolumn tablicy towarów, żeby `n` wierszy po `rowH` zmieściło się w `availH` (1…`maxCols`). */
export function boardColumns(n, rowH, availH, maxCols = 3) {
  if (!(n > 0)) return 1;
  const fit = Math.max(1, Math.floor(availH / Math.max(1, rowH)));
  return Math.max(1, Math.min(maxCols, Math.ceil(n / fit)));
}

/** Format Kr (reguła dawnego TradeOverlay._fmtKr, usuniętego w KZ-E): 1 miejsce po przecinku poniżej 100, inaczej zaokrąglone. */
export function fmtKr(v) {
  if (!Number.isFinite(v)) return '0';
  return v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

/** Ilość w dzienniku transakcji jak dziś: poniżej 10 jedno miejsce po przecinku. */
export function fmtQty(q) { return q < 10 ? q.toFixed(1) : String(Math.round(q)); }

/** Wpisy dziennika transakcji od najnowszego (jak dziś); `max` — limit wierszy, `more` — ile pominięto. */
export function logEntries(log, max = 20) {
  const rev = [...(log ?? [])].reverse();
  return { entries: rev.slice(0, max), more: Math.max(0, rev.length - max) };
}

/** Koszty wydatków kredytów handlu — te same co dzisiejsza lewa kolumna (Przyspiesz budowę, Festyn). */
export const SPEND_COST = Object.freeze({ rush: 30, festival: 80 });

// ── K3 runda 2: kontekst kolonii Handlu (lokalny — bez `switchActiveColony`) ────────────────────────────────────────────
// „Pełna kolonia” = kolonia gracza (`isPlayerColony`: brak `ownerEmpireId` albo 'player') z `isOutpost !== true` — założona
// statkiem kolonizacyjnym albo placówka podniesiona przez `upgradeOutpostToColony`. „Placówka” = `isOutpost === true`
// (statek placówki; populacja 0, bez cywilizacji) — `TradeOrderBoard.placeOrder` odmawia jej (`is_outpost`).

/** Opcje wyboru kolonii Handlu: kolonie gracza; placówka — `ok:false` z powodem (widoczna, niewybieralna). */
export function tradeColonyOptions(playerColonies) {
  return (playerColonies ?? []).map((c) => ({ id: c.planetId, name: c.name ?? c.planetId, ok: c.isOutpost !== true,
    reasonKey: c.isOutpost === true ? 'econ.console.ctxOutpost' : null }));
}

/** Kolonia Handlu: wybrana w konsoli (gdy wciąż pełna) → aktywna gry (gdy pełna) → pierwsza pełna → null. */
export function pickTradeColony(options, pickedId, activeId) {
  const ok = (id) => (options ?? []).some((o) => o.id === id && o.ok);
  if (pickedId && ok(pickedId)) return pickedId;
  if (activeId && ok(activeId)) return activeId;
  return (options ?? []).find((o) => o.ok)?.id ?? null;
}

/**
 * Bramki wydatków kredytów handlu (te same warunki co handlery `spend_*`): `{ rush, buy, festival }`, każda `{ ok, key, args }`.
 * @param {{ credits:number, hasConstruction:boolean, buyTarget:boolean, buyCost:number, festivalActive:boolean }} s
 */
export function spendGates(s) {
  const credits = s?.credits ?? 0;
  const money = (cost) => (credits >= cost ? null : { ok: false, key: 'econ.console.spendCredits', args: [String(cost), String(Math.floor(credits))] });
  const OK = { ok: true, key: null, args: [] };
  const rush = !s?.hasConstruction ? { ok: false, key: 'econ.console.spendNoBuild', args: [] } : (money(SPEND_COST.rush) ?? OK);
  const buy = !s?.buyTarget ? { ok: false, key: 'econ.console.spendNoShortage', args: [] } : (money(s.buyCost ?? 0) ?? OK);
  const festival = s?.festivalActive ? { ok: false, key: 'econ.console.spendFestivalOn', args: [] } : (money(SPEND_COST.festival) ?? OK);
  return { rush, buy, festival };
}

/** Wszystkie klucze powodów bramek Handlu (pin keepera: PL i EN, bez surowych id). */
export const TRADE_REASON_KEYS = Object.freeze(['econ.console.gateNoColony', 'econ.console.gateQty', 'econ.console.gateTech',
  'econ.console.gateTreaty', 'econ.console.gateCredits', 'econ.console.gatePartnerStock', 'econ.console.gateOwnStock',
  'econ.console.gatePartnerCredits', 'econ.console.spendNoBuild', 'econ.console.spendNoShortage', 'econ.console.spendFestivalOn',
  'econ.console.spendCredits', 'econ.console.ctxOutpost']);
