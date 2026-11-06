// GalaxyWarpLogic — czyste modele rozkazu skoku z mapy galaktyki (ARC GALAXY G3, GALAXY_PLAN.md §4 G3; D-GX-12, 18, 20).
// Bez Three.js i DOM: wpis menu PPM, podgląd trasy, picker [ Wyślij ▼ ] i JEDEN słownik odmowy. Rysuje G3-B.
//
// ⚠ O wykonalności rozstrzygają te same źródła co rozkaz: `WarpRouteSystem.canOrder` (bramka statku — wstrzykiwana) i `planWarpRoute`
//   (trasa), z opcjami tej samej postaci co `beginJourney` (`warpPlanOptions`; zgodność pilnowana keeperem) — inaczej menu obiecywałoby
//   skok, którego rozkaz by odmówił. Priorytet powodu jak w panelu rozkazu: bramka statku > powód trasy.
// ⚠ Nazwa układu tylko przez kanon mgły (`warpSystemLabel`, D-GX-18). Pozycje punktów trasy NIE są objęte mgłą: płyta i tak rysuje każdą
//   gwiazdę. Współrzędne to galaktyczne LY z `galaxyData.systems` — rzut na płytę należy do warstwy rysującej.

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, tIn, getName } from '../i18n/i18n.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipStats } from '../data/ShipModulesData.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { planWarpRoute as realPlanWarpRoute, WARP_ROUTE_REASONS } from '../utils/WarpRoutePlanner.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { warpSystemLabel } from '../utils/SystemRevealWorld.js';
import { stripLeadSymbol } from './GalaxyChromeLogic.js';

export { warpSystemLabel };

const FUEL_EPS = 1e-6;   // ten sam margines co bramka paliwa planera
const windowK = () => (typeof window !== 'undefined' ? window.KOSMOS : null);
const canOrderOf = (K) => (v) => K?.warpRouteSystem?.canOrder?.(v) ?? { ok: false, reason: 'not_player' };   // fail-closed

/** Flaga kroku (brak klucza = OFF). */
export const galaxyWarpOn = () => !!GAME_CONFIG.FEATURES?.galaxyWarp;

// ── Słownik odmowy (Finding 594, D-GX-20) ──────────────────────────────────────────────────────────────────────────────────
// Dawna tabela `FleetManagerOverlay._warpErrLabel` + powód rezerwy (Finding 588, klucz wspólny z MOS). Jeden słownik dla menu, pickera,
// toastów i starego panelu rozkazu.
const REFUSAL_KEYS = Object.freeze({
  // bramka statku (`canOrder`)
  in_transit:        'fleet.warpErrInTransit',
  immobilized:       'fleet.warpErrImmobilized',
  not_warp_capable:  'fleet.warpErrConfig',
  vessel_in_reserve: 'vessel.reasonVesselInReserve',
  bad_state:         'fleet.warpErrState',
  not_player:        'fleet.warpErrState',
  // powody trasy (`planWarpRoute`)
  [WARP_ROUTE_REASONS.SAME_SYSTEM]:       'fleet.warpErrSame',
  [WARP_ROUTE_REASONS.NO_ROUTE]:          'fleet.warpErrNoRoute',
  [WARP_ROUTE_REASONS.INSUFFICIENT_FUEL]: 'fleet.warpErrFuel',
  [WARP_ROUTE_REASONS.BAD_CONFIG]:        'fleet.warpErrConfig',
  [WARP_ROUTE_REASONS.UNKNOWN_SYSTEM]:    'fleet.warpErrConfig',
});
const ROUTE_DEFAULT_KEY = 'fleet.warpErrNoRoute';   // dawny `default` gałęzi trasy (np. `dispatch_failed`)
const GATE_DEFAULT_KEY  = 'fleet.warpErrState';     // dawny `default` gałęzi bramki

/** Tekst odmowy skoku dla powodu (bramka statku albo trasa). @param {string} reason @returns {string} */
export function refusalText(reason) {
  return t(REFUSAL_KEYS[reason] ?? ROUTE_DEFAULT_KEY);
}

/** Etykieta błędu z pary (trasa, bramka) — priorytet: bramka statku > powód trasy (`FleetManagerOverlay._warpErrLabel`). */
export function warpErrLabel(plan, gate) {
  if (!gate.ok) return t(REFUSAL_KEYS[gate.reason] ?? GATE_DEFAULT_KEY);
  return refusalText(plan.reason);
}

// ── Opcje planera dla statku ───────────────────────────────────────────────────────────────────────────────────────────────

/** Opcje `planWarpRoute` dla statku — ta sama postać co `WarpRouteSystem.beginJourney` i panel rozkazu Stratcom. */
export function warpPlanOptions(vessel) {
  const wf = vessel?.warpFuel;
  const tankRange = (wf?.max > 0 && wf?.consumption > 0) ? wf.max / wf.consumption : 0;   // LY
  const def = SHIPS[vessel?.shipId] ?? HULLS[vessel?.shipId] ?? null;
  const stats = (def && Array.isArray(vessel?.modules) && vessel.modules.length > 0) ? calcShipStats(def, vessel.modules) : null;
  return {
    maxHopLY:    Math.min(GAME_CONFIG.WARP_MAX_JUMP_LY ?? 10, tankRange),   // LY
    currentFuel: wf?.current ?? 0,                                          // warp_cores
    consumption: wf?.consumption ?? 0,                                      // warp_cores / LY
    warpSpeed:   stats?.warpSpeedLY || def?.warpSpeedLY || 2.5,             // LY / rok
  };
}

// ── Wpis menu „Skok do X — …” ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Model wpisu menu dla zaznaczonego statku i gwiazdy celu.
 * @returns {{ available:boolean, reason:string|null, hops:number|null, etaYears:number|null, fuelNeed:number|null, fuelHave:number,
 *             targetName:string, labelPL:string, labelEN:string, plan:Object }}
 *   `hops` = liczba skoków, `plan` = wynik planera (wejście `warpPreview`), `reason` = slug dla `refusalText`.
 */
export function warpMenuOption({ vessel, targetSystemId, systems, canOrder, planWarpRoute = realPlanWarpRoute, K } = {}) {
  const gate = canOrder?.(vessel) ?? { ok: false, reason: 'not_player' };   // fail-closed: bez bramki nie ma rozkazu
  const opts = warpPlanOptions(vessel);
  const plan = planWarpRoute(systems ?? [], systemIdOf(vessel), targetSystemId, opts);

  const hasRoute = Array.isArray(plan?.hops) && plan.hops.length >= 2;      // także pola częściowe `insufficient_warp_fuel`
  const hops = hasRoute ? plan.hops.length - 1 : null;
  const etaYears = hasRoute ? (plan.etaYears ?? null) : null;
  const fuelNeed = hasRoute ? plan.totalFuel : null;
  const targetName = warpSystemLabel(targetSystemId, K);

  // „Skoki: N” — brzmienie neutralne, bez polskiej liczby mnogiej (klasa Findingu 563).
  const label = (lang) => {
    const title = tIn(lang, 'galaxyMenu.warpTo', targetName);
    if (!hasRoute) return title;
    const parts = [tIn(lang, 'fleet.warpHops', String(hops))];
    if (etaYears != null) parts.push(tIn(lang, 'fleet.warpEta', etaYears.toFixed(1)));
    parts.push(tIn(lang, 'fleet.warpFuelNeed', fuelNeed.toFixed(1), opts.currentFuel.toFixed(1)));
    return `${title} — ${parts.join(' · ')}`;
  };

  const available = gate.ok && plan?.ok === true;
  return {
    available,
    reason: available ? null : (!gate.ok ? gate.reason : (plan?.reason ?? WARP_ROUTE_REASONS.NO_ROUTE)),
    hops, etaYears, fuelNeed, fuelHave: opts.currentFuel,
    targetName,
    labelPL: label('pl'),
    labelEN: label('en'),
    plan,
  };
}

// ── Podgląd trasy ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Model podglądu trasy: linia przez układy trasy, punkty przeskoków, odcinki z flagą zasięgu.
 * Odcinek jest osiągalny, gdy paliwo narastająco mieści się w `currentFuel` (paliwo pobierane skok po skoku). Plan odrzucony bez
 * podanego `currentFuel` nie ma żadnego odcinka osiągalnego (fail-closed).
 * @param {Object} plan — wynik `planWarpRoute` (także pola częściowe)
 * @param {Array} systems — `galaxyData.systems`
 * @param {{currentFuel?:number, K?:Object}} [opts]
 */
export function warpPreview(plan, systems, { currentFuel, K } = {}) {
  const out = {
    ok: plan?.ok === true,
    reason: plan?.ok ? null : (plan?.reason ?? null),
    polyline: [], hopPoints: [], legs: [],
    totalLY: null, totalFuel: null, etaYears: null, fuelShort: null,
  };
  if (!Array.isArray(plan?.hops) || plan.hops.length < 2) return out;

  const byId = new Map((systems ?? []).map(s => [s.id, s]));
  const last = plan.hops.length - 1;
  plan.hops.forEach((id, i) => {
    const s = byId.get(id);
    if (!s) return;
    const at = { x: s.x ?? 0, y: s.y ?? 0, z: s.z ?? 0 };     // LY
    out.polyline.push(at);
    out.hopPoints.push({ ...at, systemId: id, role: i === 0 ? 'origin' : (i === last ? 'target' : 'hop'), label: warpSystemLabel(id, K) });
  });

  const budget = plan.ok ? Infinity : (Number.isFinite(currentFuel) ? currentFuel : -1);
  let spent = 0;
  out.legs = (plan.legs ?? []).map(leg => {
    spent += leg.fuelCost;
    return { ...leg, reachable: spent <= budget + FUEL_EPS };
  });
  out.totalLY = plan.totalLY ?? null;
  out.totalFuel = plan.totalFuel ?? null;
  out.etaYears = plan.etaYears ?? null;
  if (!plan.ok && plan.reason === WARP_ROUTE_REASONS.INSUFFICIENT_FUEL && Number.isFinite(currentFuel)) {
    out.fuelShort = Math.max(0, plan.totalFuel - currentFuel);   // warp_cores
  }
  return out;
}

const hullLabel = (v) => {
  const def = SHIPS[v.shipId] ?? HULLS[v.shipId] ?? null;
  return def ? getName(def, 'ship') : String(v.shipId ?? '');
};

// ── Picker [ Wyślij ▼ ] ────────────────────────────────────────────────────────────────────────────────────────────────────

// Plan trasy wiersza — picker pyta co klatkę HUD, a planer to Dijkstra po całej galaktyce (N statków × 72 układy): wynik trzymany,
// dopóki nie zmieni się cel, układ statku albo bak. Pamięć sprzątana przy innej galaktyce i ponad limitem wpisów.
const ROW_PLAN_MEMO_MAX = 256;
let _rowPlanMemo = { systems: null, map: new Map() };

function rowPlanRefusal(v, targetSystemId, systemId, systems, planWarpRoute) {
  if (_rowPlanMemo.systems !== systems || _rowPlanMemo.map.size > ROW_PLAN_MEMO_MAX) _rowPlanMemo = { systems, map: new Map() };
  const wf = v.warpFuel ?? {};
  const key = [v.id, targetSystemId, systemId, wf.current, wf.max, wf.consumption, v.shipId, v.modules?.length ?? 0].join('|');
  if (_rowPlanMemo.map.has(key)) return _rowPlanMemo.map.get(key);
  const plan = planWarpRoute(systems, systemId, targetSystemId, warpPlanOptions(v));
  const reason = plan?.ok === true ? null : (plan?.reason ?? WARP_ROUTE_REASONS.NO_ROUTE);
  _rowPlanMemo.map.set(key, reason);
  return reason;
}

/**
 * Wiersze pickera: każdy statek GRACZA z napędem warp, rozstrzygany przez `canOrder` (Finding 593 — nie „zadokowany przy aktywnej
 * kolonii”), a przy przejściu bramki statku — przez planer trasy z tymi samymi opcjami co rozkaz (`warpPlanOptions`): wiersz, który
 * odmówiłby przy kliku (za mało rdzeni, poza zasięgiem), jest przyciemniony z powodem PRZED klikiem. Odmówiony zostaje na liście
 * (D-GX-12): kadłub w rezerwie ma widzieć, co zrobić. Statek już w układzie celu odmawia `same_system`. Priorytet powodu jak w menu:
 * bramka statku > trasa. Najpierw zdolne, kolejność wejścia w obrębie grupy.
 * @returns {Array<{vesselId:string, name:string, hull:string, ok:boolean, reason:string|null, reasonText:string|null,
 *                  systemId:string|null, whereLabel:string, warpCurrent:number, warpMax:number}>}
 */
export function sendPickerRows(vessels, targetSystemId, canOrder, { K = windowK(), systems = K?.galaxyData?.systems ?? [], planWarpRoute = realPlanWarpRoute } = {}) {
  const rows = [];
  for (const v of vessels ?? []) {
    if (!v || v.isWreck || isEnemyVessel(v)) continue;
    if (!(v.warpFuel?.max > 0)) continue;
    const gate = canOrder?.(v) ?? { ok: false, reason: 'not_player' };
    const systemId = systemIdOf(v);
    const reason = !gate.ok ? gate.reason
      : systemId === targetSystemId ? WARP_ROUTE_REASONS.SAME_SYSTEM
      : rowPlanRefusal(v, targetSystemId, systemId, systems, planWarpRoute);
    rows.push({
      vesselId: v.id,
      name: v.name ?? v.id,
      hull: hullLabel(v),
      ok: reason === null,
      reason,
      reasonText: reason === null ? null : refusalText(reason),
      systemId,
      whereLabel: warpSystemLabel(systemId, K),
      warpCurrent: v.warpFuel.current ?? 0,
      warpMax: v.warpFuel.max,
    });
  }
  return [...rows.filter(r => r.ok), ...rows.filter(r => !r.ok)];
}

/** Limit wierszy pickera na raz (reszta — kółkiem). */
export const SEND_PICKER_MAX_ROWS = 6;

/** Okno pickera: `first` przycięty do listy, `maxScroll` = 0, gdy wszystko się mieści. */
export function sendPickerWindow(rows, scroll = 0, maxRows = SEND_PICKER_MAX_ROWS) {
  const list = rows ?? [];
  const maxScroll = Math.max(0, list.length - maxRows);
  const first = Math.min(maxScroll, Math.max(0, Math.round(Number(scroll) || 0)));
  return { first, maxScroll, total: list.length, rows: list.slice(first, first + maxRows) };
}

/**
 * Model pickera dla stanu `{ systemId, scroll }`: nagłówek z nazwą przez kanon mgły, okno wierszy, tekst pustej listy.
 * @returns {{ systemId:string, header:string, empty:string|null, rows:Array, first:number, maxScroll:number, total:number }}
 */
export function sendPickerModel(state, K = windowK()) {
  const rows = sendPickerRows(K?.vesselManager?.getAllVessels?.() ?? [], state.systemId, canOrderOf(K), { K });
  const win = sendPickerWindow(rows, state.scroll);
  return { ...win, systemId: state.systemId, header: `${t('fleet.selectShipToSend')} → ${warpSystemLabel(state.systemId, K)}`,
    empty: win.total === 0 ? t('fleet.noWarpShipsAvailable') : null };
}

/** Pudełko pickera pod przyciskiem, nad nim, gdy dół wyjdzie poza kadr; w poziomie w kadrze. Px logiczne. */
export function sendPickerBox({ anchor, w, h, rect, gap = 3 }) {
  const x = Math.max(rect.x, Math.min(anchor.x, rect.x + rect.w - w));
  const below = anchor.y + anchor.h + gap;
  const y = below + h <= rect.y + rect.h ? below : Math.max(rect.y, anchor.y - gap - h);
  return { x, y, w, h };
}

/** Dwie linie wiersza: „nazwa · kadłub · paliwo” oraz powód odmowy, a przy statku zdolnym — gdzie stoi. */
export function sendPickerRowLines(row) {
  const fuel = `${t('shipPicker.warp')} ${(row.warpCurrent ?? 0).toFixed(1)}/${(row.warpMax ?? 0).toFixed(1)}`;
  return { main: [row.name, row.hull, fuel].filter(Boolean).join(' · '), sub: row.ok ? row.whereLabel : row.reasonText };
}

// ── Zaznaczenie gracza (G3-B) ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Zaznaczenie mapy dla rozkazu skoku: flota (`fleetId`) i własne statki, lider pierwszy. Flota ma pierwszeństwo jak w menu mapy
 * (`buildMenuOptions`), wrak i statek obcy nie są zaznaczeniem do rozkazu.
 * @returns {{ fleetId:string|null, ships:Array<Object> }}
 */
export function warpSelection(K = windowK()) {
  const um = K?.uiManager;
  const lead = um?.getSelectedVesselId?.() ?? null;
  const ids = new Set([...(lead != null ? [lead] : []), ...(um?.getSelectedVesselIds?.() ?? [])]);
  const ships = [...ids].map((id) => K?.vesselManager?.getVessel?.(id)).filter((v) => v && !v.isWreck && !isEnemyVessel(v));
  return { fleetId: um?.getSelectedFleetId?.() ?? null, ships };
}

// ── Menu PPM gwiazdy płyty (G3-B, target `galaxyStar`) ─────────────────────────────────────────────────────────────────────

/**
 * Pozycje menu gwiazdy — zawsze co najwyżej JEDNA:
 *   • bez statku i bez floty — nic (menu się nie otwiera);
 *   • flota — wyłączona z powodem (skok floty to G4; luźne statki obok floty nie zmieniają tego, jak w menu mapy);
 *   • jeden statek — etykieta i dostępność z `warpMenuOption`;
 *   • kilka luźnych statków — sam tytuł „Skok do X” (trasa i paliwo są per statek), aktywna, gdy skoczyć może choć jeden;
 *     wyłączona — z powodem lidera.
 * Kształt jak `buildMenuOptions`; `reasonIsText` — `disabledReason` to gotowy tekst, nie kod do mapowania.
 */
export function galaxyStarMenuEntries(targetSystemId, K = windowK()) {
  const { fleetId, ships } = warpSelection(K);
  const target = String(targetSystemId);
  const name = warpSystemLabel(target, K);
  const entry = (labelPL, labelEN, reasonText, vesselIds) => ({
    id: 'galaxy.warp', action: 'issueGalaxyWarp', icon: '🌀', labelPL, labelEN,
    enabled: reasonText == null, disabledReason: reasonText ?? null, reasonIsText: true, warning: null,
    vesselIds, targetSystemId: target,
  });
  const title = (lang) => tIn(lang, 'galaxyMenu.warpTo', name);
  if (fleetId != null) return [entry(title('pl'), title('en'), t('galaxyMenu.fleetWaitsG4'), [])];
  if (ships.length === 0) return [];
  const canOrder = canOrderOf(K);
  const systems = K?.galaxyData?.systems ?? [];
  const opts = ships.map((vessel) => warpMenuOption({ vessel, targetSystemId: target, systems, canOrder, K }));
  const ids = ships.map((v) => v.id);
  if (ships.length === 1) {
    const o = opts[0];
    return [entry(o.labelPL, o.labelEN, o.available ? null : refusalText(o.reason), ids)];
  }
  const anyone = opts.some((o) => o.available);
  return [entry(title('pl'), title('en'), anyone ? null : refusalText(opts[0].reason), ids)];
}

/**
 * Rozkaz skoku dla listy statków (menu gwiazdy, picker) — po jednym `OrderService.issueWarp` na statek, jeden komunikat:
 * sukces — `fleet.warpOrderSent`; odmowa jednego statku — nagłówek + powód; kilka statków — kształt D-E2
 * (`vessel.orderPartial` / `vessel.orderNoneMoved`, pominięte z nazwą i powodem). Odmowa idzie też do Dziennika: toast jest ulotny.
 * @returns {{ moved:number, total:number, fails:Array<{vesselId:string, reason:string|null}>, text:string }}
 */
export function runGalaxyWarpOrder({ vesselIds = [], targetSystemId, K = windowK() } = {}) {
  const results = vesselIds.map((vesselId) => {
    const res = K?.orderService?.issueWarp?.(vesselId, targetSystemId) ?? null;
    return { vesselId, ok: res?.ok === true, reason: res?.reason ?? null };
  });
  const fails = results.filter((r) => !r.ok);
  const total = results.length, moved = total - fails.length;
  let text;
  if (fails.length === 0) {
    text = t('fleet.warpOrderSent');
  } else if (total === 1) {
    text = `${t('fleet.warpOrderFailed')} — ${refusalText(fails[0].reason)}`;
  } else {
    const nameOf = (id) => K?.vesselManager?.getVessel?.(id)?.name ?? id;
    const skipped = fails.map((f) => `${nameOf(f.vesselId)} (${stripLeadSymbol(refusalText(f.reason))})`).join(', ');
    text = moved > 0 ? t('vessel.orderPartial', moved, total, skipped) : t('vessel.orderNoneMoved', skipped);
  }
  if (fails.length === 0) {
    if (total > 0) EventBus.emit('ui:toast', { text, color: THEME.accent, durationMs: 2500 });
  } else {
    EventBus.emit('ui:toast', { text, color: moved > 0 ? (THEME.warning ?? '#ffcc44') : (THEME.danger ?? '#ff4466'), durationMs: 3000 });
    K?.eventLogSystem?.push?.({ text, channel: 'fleet', severity: 'warn' });
  }
  return { moved, total, fails, text };
}

// ── Podgląd trasy przy najechaniu (G3-B) ───────────────────────────────────────────────────────────────────────────────────

let _hoverMemo = { key: null, systems: null, K: null, model: null };   // dwie podwarstwy pytają o to samo w jednej klatce

/**
 * Model podglądu dla gwiazdy pod kursorem: tylko z zaznaczonym statkiem z napędem warp (lider; flota czeka na G4). Układ lidera —
 * brak podglądu. Bramka statku (rezerwa, unieruchomienie) gasi całą trasę, a powód idzie do rozwinięcia gwiazdy.
 * @returns {{ vesselId, targetSystemId, available:boolean, reason:string|null, polyline:Array, hopPoints:Array, legs:Array }|null}
 */
export function warpHoverModel(targetSystemId, K = windowK()) {
  if (targetSystemId == null) return null;
  const { fleetId, ships } = warpSelection(K);
  const lead = ships[0] ?? null;
  if (fleetId != null || !(lead?.warpFuel?.max > 0)) return null;
  const target = String(targetSystemId);
  if (systemIdOf(lead) === target) return null;
  const canOrder = canOrderOf(K);
  const gate = canOrder(lead);
  const wf = lead.warpFuel;
  const systems = K?.galaxyData?.systems ?? [];
  const key = [lead.id, target, gate.ok, gate.reason, systemIdOf(lead), wf.current, wf.max, wf.consumption, lead.shipId, lead.modules?.length ?? 0].join('|');
  if (_hoverMemo.key === key && _hoverMemo.systems === systems && _hoverMemo.K === K) return _hoverMemo.model;
  const option = warpMenuOption({ vessel: lead, targetSystemId: target, systems, canOrder, K });
  const pv = warpPreview(option.plan, systems, { currentFuel: option.fuelHave, K });
  const model = {
    vesselId: lead.id, targetSystemId: target, available: option.available, reason: option.reason,
    polyline: pv.polyline, hopPoints: pv.hopPoints,
    legs: gate.ok ? pv.legs : pv.legs.map((l) => ({ ...l, reachable: false })),
  };
  _hoverMemo = { key, systems, K, model };
  return model;
}
