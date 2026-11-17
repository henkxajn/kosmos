// ProductionConsoleLogic — czysta logika konsoli Produkcji (ARC KONSOLE K4, docs/design/CONSOLES_PLAN.md §1.2, §17;
// Findings 725 (część Produkcji), 732, 742).
//
// Bez DOM i canvas — testowalne pod node (keeper `console_production_smoke.mjs`). Widok: `ProductionConsoleView.js`.
// Mapowanie (kierunek bohatera podpisany: surowce → fabryki → towary):
//  • lista — towary: «W produkcji» (linie alokacji fabryk w zakresie, zsumowane po towarze) i «Pozostałe towary»; zakres filtra
//    (globalnie / kolonia / stacja) jawnie w nagłówku listy, wybór z pełnej listy encji (Finding 732 — dzisiejsze czipy gubią nadmiar);
//  • bohater — łańcuch wybranego towaru: wejścia receptury → fabryka (tempo, FP) → produkt, wąskie gardło w roli alert;
//  • inspektor — status, alerty towaru, trend 10 lat, magazyn, dzisiejsze akcje fabryki (z bramką i powodem i18n), blok D-K-16;
//  • pas — kolejka i zlecenia (kolejka fabryk, zlecenie jednorazowe, droidy), zlecenia eksportowe (ProductionRequestBoard), wykres 10 lat.
// Tempo linii = tempo SILNIKA: 1 / timePerUnit sztuk na rok (mnożniki scenariusza, techu i montowni wliczone — jak
// `FactorySystem.getIngredientDrawPerYear`); dzisiejszy wiersz pisze points / baseTime (bez mnożników).

import { COMMODITIES } from '../data/CommoditiesData.js';
import { commoditySort } from './EconomyConsoleLogic.js';

// ── Zakres (filtr Produkcji) ─────────────────────────────────────────────────────────────────────────────────────────

/** Rodzaj encji zakresu: 'station' (fasada stacji) | 'outpost' | 'colony'. */
export function entityKind(e) {
  if (e?.isStation) return 'station';
  if (e?.isOutpost) return 'outpost';
  return 'colony';
}

/**
 * Opcje wyboru zakresu: «Globalnie» + KAŻDA encja zakładki (kolonie gracza + stacje-sieroty), bez obcinania (Finding 732).
 * @returns {Array<{ id:string|null, name:string|null, kind:'global'|'colony'|'outpost'|'station' }>}
 */
export function scopeOptions(entities) {
  return [{ id: null, name: null, kind: 'global' },
    ...(entities ?? []).map((e) => ({ id: e.planetId, name: e.name ?? e.planetId, kind: entityKind(e) }))];
}

/** Encje w zakresie — ta sama reguła co dzisiejsza zakładka (`selectedId` null = wszystkie). */
export function scopeEntities(entities, selectedId) {
  const all = entities ?? [];
  return selectedId ? all.filter((c) => c.planetId === selectedId) : all;
}

/** Encja zakresu (null = globalnie albo wybrana encja zniknęła). */
export function scopeEntity(entities, selectedId) {
  return selectedId ? (entities ?? []).find((c) => c.planetId === selectedId) ?? null : null;
}

// ── Linie produkcji ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Tempo alokacji (szt./rok): 1 / timePerUnit; stojąca albo bez FP → 0. */
export function allocRate(a) {
  if (!a || a.paused || !(a.points > 0) || !(a.timePerUnit > 0)) return 0;
  return 1 / a.timePerUnit;
}

/**
 * Linie alokacji fabryk w encjach (ta sama reguła pominięcia co dzisiejszy przegląd: brak fabryk albo 0 FP → encja pominięta).
 * @returns {Array<{ colonyId, colonyName, commodityId, points, rate, paused, stallReason, blockedByTech, targetQty, produced }>}
 */
export function productionLines(entities) {
  const out = [];
  for (const col of entities ?? []) {
    const fs = col?.factorySystem;
    if (!fs || !(fs.totalPoints > 0)) continue;
    for (const a of fs.getAllocations?.() ?? []) {
      out.push({ colonyId: col.planetId, colonyName: col.name ?? col.planetId, commodityId: a.commodityId,
        points: a.points ?? 0, rate: allocRate(a), paused: !!a.paused, stallReason: a.stallReason ?? null,
        pct: Math.max(0, Math.min(1, (a.pctComplete ?? 0) / 100)),
        blockedByTech: a.blockedByTech ?? null, targetQty: a.targetQty ?? null, produced: a.produced ?? 0 });
    }
  }
  return out;
}

/** Czy linia stoi naprawdę (STALL), a nie z osiągniętym celem. */
export function lineStalled(l) {
  return !!l?.paused && l.stallReason?.kind !== 'target_done';
}

/**
 * Wiersze listy towarów: grupa «W produkcji» (towary z liniami w zakresie: suma tempa, czy któraś linia stoi) i «Pozostałe»
 * (odblokowane przed zablokowanymi, w kolejności kolumny). `isAvailable(id)` — recepta dostępna (null = nieznane → dostępna).
 * @returns {{ active:Array<{id,rate,stalled,lines:number}>, other:Array<{id,locked:boolean}> }}
 */
export function goodRows(lines, isAvailable = null, commodities = COMMODITIES) {
  const byId = new Map();
  for (const l of lines ?? []) {
    if (!commodities[l.commodityId]) continue;
    const g = byId.get(l.commodityId) ?? { id: l.commodityId, rate: 0, stalled: false, lines: 0 };
    g.rate += l.rate; g.lines += 1; g.stalled = g.stalled || lineStalled(l);
    byId.set(l.commodityId, g);
  }
  const order = Object.values(commodities).sort(commoditySort).map((d) => d.id);
  const active = order.filter((id) => byId.has(id)).map((id) => byId.get(id));
  const rest = order.filter((id) => !byId.has(id)).map((id) => ({ id, locked: isAvailable ? !isAvailable(id) : false }));
  const other = [...rest.filter((r) => !r.locked), ...rest.filter((r) => r.locked)];
  return { active, other };
}

/** Kolejność id wierszy listy (bez nagłówków grup). */
export function goodRowIds(rows) {
  return [...(rows?.active ?? []).map((r) => r.id), ...(rows?.other ?? []).map((r) => r.id)];
}

/** Zaznaczony towar: dotychczasowy, jeśli jest na liście; inaczej pierwszy w produkcji; inaczej pierwszy. */
export function pickGood(rows, selectedId) {
  const ids = goodRowIds(rows);
  if (selectedId && ids.includes(selectedId)) return selectedId;
  return ids[0] ?? null;
}

// ── Łańcuch towaru (bohater) ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Model łańcucha wybranego towaru w zakresie: wejścia receptury → fabryka → produkt.
 * @param {{ id:string, recipe:Object<string,number>|null, lines:Array, stock:Object<string,number>,
 *           fp:{ total:number, free:number, enabledAny:boolean, factories:number }, available:boolean,
 *           techBlocked?:Array<{ingredientId, requiresTech}> }} p
 *   `recipe` — receptura skalowana jak silnik (`FactorySystem._getScaledRecipe`); `lines` — linie TEGO towaru w zakresie;
 *   `stock` — magazyn zakresu; `fp.factories` — encje z fabrykami (FP > 0); `available` — recepta odblokowana.
 * @returns {{ rate, points, inputs:Array<{id,perUnit,perYear,stock,cover,short,low,tech}>, output:{id,stock},
 *            status:'producing'|'stalled'|'done'|'idle', bottleneck:null|{kind, resId?, need?, have?, tech?, colonyName?} }}
 *   Wąskie gardło (pierwsze trafione): locked (recepta zablokowana) > noFactories (0 FP w zakresie) > offline (fabryki wyłączone)
 *   > powód STALL linii (tech > missing > insolvent > noPoints) > bezczynny: brakujące wejście (stan < ilość na sztukę) >
 *   bezczynny: brak wolnych FP. Próg «low» = stan < 10 × ilość na sztukę (jak alert «niskie stany» dzisiejszej strony).
 */
export function chainModel(p) {
  const id = p?.id;
  const recipe = p?.recipe ?? {};
  const lines = p?.lines ?? [];
  const stock = p?.stock ?? {};
  const fp = p?.fp ?? { total: 0, free: 0, enabledAny: false, factories: 0 };
  const rate = lines.reduce((s, l) => s + (l.rate || 0), 0);
  const points = lines.reduce((s, l) => s + (l.points || 0), 0);
  const techIds = new Set((p?.techBlocked ?? []).map((b) => b.ingredientId));
  const inputs = Object.entries(recipe).map(([rid, perUnit]) => {
    const st = stock[rid] ?? 0;
    const perYear = perUnit * rate;
    return { id: rid, perUnit, perYear, stock: st, cover: perYear > 0 ? st / perYear : null,
      short: st < perUnit, low: st < perUnit * 10, tech: techIds.has(rid) };
  });
  const stalled = lines.filter(lineStalled);
  const done = lines.length > 0 && lines.every((l) => l.stallReason?.kind === 'target_done');
  const status = rate > 0 ? 'producing' : stalled.length ? 'stalled' : done ? 'done' : 'idle';

  let bottleneck = null;
  if (p?.available === false) bottleneck = { kind: 'locked' };
  else if (!(fp.total > 0)) bottleneck = { kind: 'noFactories' };
  else if (!fp.enabledAny) bottleneck = { kind: 'offline' };
  else if (stalled.length) {
    const rank = { tech_blocked: 0, missing_ingredient: 1, insolvent: 2, no_points: 3 };
    const l = [...stalled].sort((a, b) => (rank[a.stallReason?.kind] ?? 9) - (rank[b.stallReason?.kind] ?? 9))[0];
    const sr = l.stallReason;
    if (sr?.kind === 'tech_blocked') bottleneck = { kind: 'tech', resId: sr.blocked?.[0]?.ingredientId, tech: sr.blocked?.[0]?.requiresTech ?? null, colonyName: l.colonyName };
    else if (sr?.kind === 'missing_ingredient') bottleneck = { kind: 'missing', resId: sr.missing?.[0]?.resId, need: sr.missing?.[0]?.need ?? 0, have: sr.missing?.[0]?.have ?? 0, colonyName: l.colonyName };
    else if (sr?.kind === 'insolvent') bottleneck = { kind: 'insolvent', need: sr.creditCost ?? 0, have: sr.credits ?? 0, colonyName: l.colonyName };
    else bottleneck = { kind: 'noCapacity', colonyName: l.colonyName };
  } else if (status === 'idle') {
    const tb = inputs.find((i) => i.tech);
    const sh = inputs.find((i) => i.short);
    if (tb) bottleneck = { kind: 'tech', resId: tb.id, tech: (p?.techBlocked ?? []).find((b) => b.ingredientId === tb.id)?.requiresTech ?? null };
    else if (sh) bottleneck = { kind: 'missing', resId: sh.id, need: sh.perUnit, have: sh.stock };
    else if (!(fp.free > 0)) bottleneck = { kind: 'noCapacity' };
  }
  return { rate, points, inputs, output: { id, stock: stock[id] ?? 0 }, status, bottleneck };
}

/** Wejście będące wąskim gardłem (id) albo null. */
export function bottleneckInput(model) {
  const b = model?.bottleneck;
  return b && (b.kind === 'missing' || b.kind === 'tech') ? b.resId ?? null : null;
}

/**
 * Układ bohatera łańcucha w prostokącie `r`: kolumna wejść (lewa), fabryka (środek), produkt (prawa), baner wąskiego gardła (dół).
 * Węzły wejść wyśrodkowane w pionie, krok ≤ `nodeMaxStep`. Czysta — keeper sprawdza zawieranie i brak nakładania.
 */
export function chainHeroLayout(r, nInputs, { headerH = 22, bannerH = 40, nodeH = 40, nodeMaxStep = 56, colFrac = 0.30, colMax = 230 } = {}) {
  const colW = Math.min(colMax, Math.floor(r.w * colFrac));
  const top = r.y + headerH, bottom = r.y + r.h - bannerH;
  const bodyH = Math.max(0, bottom - top);
  const n = Math.max(0, nInputs | 0);
  const step = n > 0 ? Math.min(nodeMaxStep, Math.floor(bodyH / n)) : 0;
  const h = Math.min(nodeH, Math.max(0, step - 6));
  const y0 = top + Math.max(0, (bodyH - step * n) / 2);
  const inputs = Array.from({ length: n }, (_, i) => ({ x: r.x, y: Math.round(y0 + i * step), w: colW, h }));
  const outH = Math.min(bodyH, 64);
  const output = { x: r.x + r.w - colW, y: Math.round(top + (bodyH - outH) / 2), w: colW, h: outH };
  const fx = r.x + colW + 24, fw = Math.max(0, r.w - 2 * colW - 48);
  const fh = Math.min(bodyH, 150);
  const factory = { x: fx, y: Math.round(top + (bodyH - fh) / 2), w: fw, h: fh };
  return { header: { x: r.x, y: r.y, w: r.w, h: headerH }, inputs, factory, output,
    banner: { x: r.x, y: bottom + 6, w: r.w, h: Math.max(0, bannerH - 6) }, colW };
}

// ── Alerty (te same reguły co dzisiejsza prawa kolumna `_generateAlerts`, ze strukturą zamiast surowych id) ─────────────

/**
 * @returns {Array<{ level:'critical'|'warning', kind:'stall'|'low'|'brownout', commodityId?, resId?, colonyId, colonyName }>}
 */
export function productionAlerts(colonies, commodities = COMMODITIES) {
  const out = [];
  for (const col of colonies ?? []) {
    if (col?.isOutpost) continue;
    const fs = col.factorySystem, rs = col.resourceSystem;
    if (!fs || !rs) continue;
    const have = (rid) => rs.inventory?.get?.(rid) ?? 0;
    for (const a of fs.getAllocations?.() ?? []) {
      const def = commodities[a.commodityId];
      if (!def?.recipe) continue;
      if (a.paused && (a.targetQty === null || a.produced < a.targetQty)) {
        // brakujący składnik: powód STALL silnika (magazyn puli), inaczej dzisiejsza reguła po magazynie kolonii
        const miss = a.stallReason?.missing?.[0]?.resId ?? a.stallReason?.blocked?.[0]?.ingredientId
          ?? Object.entries(def.recipe).find(([rid, q]) => have(rid) < q)?.[0] ?? null;
        out.push({ level: 'critical', kind: 'stall', commodityId: def.id, resId: miss, colonyId: col.planetId, colonyName: col.name });
      } else if (!a.paused) {
        const low = Object.entries(def.recipe).find(([rid, q]) => have(rid) < q * 10)?.[0] ?? null;
        if (low) out.push({ level: 'warning', kind: 'low', commodityId: def.id, resId: low, colonyId: col.planetId, colonyName: col.name });
      }
    }
    if (rs.energy?.brownout) out.push({ level: 'critical', kind: 'brownout', colonyId: col.planetId, colonyName: col.name });
  }
  return out;
}

/** Alerty kolonii z zakresu (`scopeIds` null = wszystkie): dotyczące towaru `id` + brownout kolonii. */
export function alertsFor(alerts, id, scopeIds = null) {
  return (alerts ?? []).filter((a) => (!scopeIds || scopeIds.has(a.colonyId)) && (a.kind === 'brownout' || a.commodityId === id));
}

/** Trend towaru z `EconomyHistoryLog.getYearlyHistory`: wyprodukowane sztuki na rok. */
export function goodTrend(history, id) {
  return (history ?? []).map((b) => ({ year: b.year, v: Math.round(b.produced?.[id] ?? 0), current: !!b.current }));
}

// ── Bramki akcji (K3: żadnego cichego no-opa — akcja wyłączona ma powód i18n z tym, co zrobić) ─────────────────────────

/** Bramka akcji fabryki zakresu: null = można; inaczej klucz powodu. */
export function factoryGate(entity) {
  if (!entity) return 'econ.console.prodGateGlobal';
  if (entity.isStation) return 'econ.console.prodGateStation';
  if (entity.isOutpost === true) return 'econ.console.prodGateOutpost';   // placówka: bez załogi i fabryk (akcje bez skutku)
  if (!entity.factorySystem) return 'econ.console.prodGateNoFactory';
  return null;
}

/**
 * Bramka zlecenia jednorazowego towaru: null = można zlecić; 'job' = zlecenie już trwa (pokaż je z [ ANULUJ ]);
 * inaczej klucz powodu (droid → sekcja Build-N, zablokowana recepta).
 */
export function oneShotGate({ def, available, job }) {
  if (job) return 'job';
  if (def?.isDroidUnit) return 'econ.console.prodGateDroid';
  if (!available) return 'econ.console.prodGateLocked';
  return null;
}

/** Wszystkie klucze powodów konsoli Produkcji (keeper: PL i EN). */
export const PROD_REASON_KEYS = Object.freeze(['econ.console.prodGateGlobal', 'econ.console.prodGateStation', 'econ.console.prodGateOutpost',
  'econ.console.prodGateNoFactory', 'econ.console.prodGateDroid', 'econ.console.prodGateLocked', 'econ.console.prodGateDroidSource']);

// ── Pas: kolejka i zlecenia ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Wiersze kolejki zakresu: kolejka fabryk, zlecenie jednorazowe, zlecenia droidów — każdy z kolonią.
 * @returns {Array<{ kind:'queue'|'oneshot'|'droid', colonyId, colonyName, commodityId, qty, produced? }>}
 */
export function queueRows(entities) {
  const out = [];
  for (const col of entities ?? []) {
    const fs = col?.factorySystem;
    if (!fs) continue;
    const base = { colonyId: col.planetId, colonyName: col.name ?? col.planetId };
    const job = fs.oneShotJob;
    if (job) out.push({ ...base, kind: 'oneshot', commodityId: job.commodityId, qty: job.qty, produced: job.produced ?? 0 });
    for (const o of fs.droidOrders ?? []) out.push({ ...base, kind: 'droid', commodityId: o.commodityId, qty: o.qty, produced: o.produced ?? 0 });
    for (const q of fs.getQueue?.() ?? []) out.push({ ...base, kind: 'queue', commodityId: q.commodityId, qty: q.qty });
  }
  return out;
}

/**
 * Zlecenia eksportowe zakresu: przyjęte (pozostało / razem · zamawiający) i liczba dostępnych do podjęcia (tylko kolonia —
 * dzisiejsza reguła: włączone i tier dopuszczony).
 */
export function exportRows(entities, board, nameOf = (id) => id, commodities = COMMODITIES) {
  const accepted = [];
  let available = 0;
  for (const col of entities ?? []) {
    const fs = col?.factorySystem;
    if (!fs) continue;
    for (const o of fs.acceptedOrders ?? []) {
      if (!commodities[o.commodityId]) continue;
      accepted.push({ colonyName: col.name ?? col.planetId, commodityId: o.commodityId, remaining: Math.max(0, o.qtyTotal - (o.produced ?? 0)),
        total: o.qtyTotal, requester: nameOf(o.requesterId) });
    }
    const prefs = fs.exportPrefs;
    if (board && prefs?.enabled) {
      available += (board.getAvailableFor?.(col.planetId) ?? [])
        .filter((r) => commodities[r.commodityId] && prefs.tiers?.[commodities[r.commodityId].tier ?? 1] === true).length;
    }
  }
  return { accepted, available };
}

// ── Polerka K4 (bramka właściciela): pasma bohatera, «+1», komórka zapas / minimum, budowa droida ──────────────────────

/**
 * Pasma bohatera (z góry): PRODUKCJA TERAZ · łańcuch wybranego towaru · wąskie gardło + kolejka i zlecenia (mniej więcej tercje).
 * @returns {{ now:{x,y,w,h}, chain:{x,y,w,h}, foot:{x,y,w,h} }}
 */
export function heroBands(r, { gap = 10, fracNow = 0.32, fracChain = 0.40 } = {}) {
  const avail = Math.max(0, r.h - 2 * gap);
  const hNow = Math.floor(avail * fracNow), hChain = Math.floor(avail * fracChain);
  const now = { x: r.x, y: r.y, w: r.w, h: hNow };
  const chain = { x: r.x, y: now.y + hNow + gap, w: r.w, h: hChain };
  const fy = chain.y + hChain + gap;
  return { now, chain, foot: { x: r.x, y: fy, w: r.w, h: Math.max(0, r.y + r.h - fy) } };
}

/** Klucz linii produkcji (kolonia | towar). */
export const lineKey = (l) => `${l.colonyId}|${l.commodityId}`;

/** Czas błysku «+1» po ukończeniu sztuki (ms czasu rzeczywistego). */
export const PULSE_MS = 900;

/**
 * Wykrycie ukończonej sztuki między klatkami: licznik `produced` wzrósł albo postęp «zawinął» (spadł o > 0,3). Ten sam stan wejścia
 * → ten sam stan (pauza = statyczne paski, bez błysków). Zwraca nową mapę `{ key: { pct, produced, pulseAt } }`.
 */
export function pulseTick(prev, lines, now) {
  const next = {};
  for (const l of lines ?? []) {
    const k = lineKey(l);
    const p = prev?.[k];
    // linia stojąca nigdy nie «kończy sztuki» (bez błysku), nawet gdy silnik przestawi postęp / licznik
    const done = !!p && !lineStalled(l) && ((l.produced ?? 0) > (p.produced ?? 0) || (l.pct ?? 0) < (p.pct ?? 0) - 0.3);
    next[k] = { pct: l.pct ?? 0, produced: l.produced ?? 0, pulseAt: done ? now : (p?.pulseAt ?? null) };
  }
  return next;
}

/** Siła błysku 0..1 (1 tuż po ukończeniu, 0 po PULSE_MS). */
export function pulseAlpha(entry, now) {
  if (!entry?.pulseAt) return 0;
  const dt = now - entry.pulseAt;
  return dt >= 0 && dt < PULSE_MS ? 1 - dt / PULSE_MS : 0;
}

/**
 * Stan paska linii «Produkcja teraz»: stojąca — zatrzymany pasek (0) w roli alert, bez błysku; produkująca — postęp do następnej
 * sztuki w roli primary i błysk «+1» (siła 0..1). Linia stojąca nigdy nie wygląda na pracującą (bramka K4).
 */
export function nowBarState(line, pulseEntry, now) {
  if (lineStalled(line)) return { frac: 0, tone: 'alert', pulse: 0 };
  return { frac: Math.max(0, Math.min(1, line?.pct ?? 0)), tone: 'primary', pulse: pulseAlpha(pulseEntry, now) };
}

/** Linie «Produkcja teraz»: produkujące przed stojącymi, potem po tempie. */
export function nowLines(lines) {
  return [...(lines ?? [])].sort((a, b) => (Number(lineStalled(a)) - Number(lineStalled(b))) || (b.rate - a.rate));
}

/** Komórka listy / instrument: «zapas / minimum» i rola (alert, gdy zapas < minimum). `min` null → sam zapas. */
export function stockMinCell(stock, min) {
  const s = Math.round((stock ?? 0) * 10) / 10;
  const sTxt = s >= 10 || Number.isInteger(s) ? String(Math.round(s)) : s.toFixed(1);
  if (min == null) return { text: sTxt, tone: 'primary' };
  return { text: `${sTxt} / ${min}`, tone: (stock ?? 0) < min ? 'alert' : 'primary' };
}

/**
 * Bramka budowy droida: null = można zbudować; inaczej klucz powodu. Kolejność: zakres (factoryGate) > zablokowana receptura >
 * brak lokalnego źródła składników (`setDroidOrder` odmówiłby po cichu — dziś przycisk nic nie robi).
 */
export function droidBuildGate({ scopeGate = null, available = true, sustainable = true } = {}) {
  if (scopeGate) return scopeGate;
  if (!available) return 'econ.console.prodGateLocked';
  if (!sustainable) return 'econ.console.prodGateDroidSource';
  return null;
}
