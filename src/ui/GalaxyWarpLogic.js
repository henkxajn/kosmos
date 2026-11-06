// GalaxyWarpLogic — czyste modele rozkazu skoku z mapy galaktyki (ARC GALAXY G3, GALAXY_PLAN.md §4 G3; D-GX-12, 18, 20).
// Bez Three.js i DOM: wpis menu PPM, podgląd trasy, picker [ Wyślij ▼ ] i JEDEN słownik odmowy. Rysuje G3-B.
//
// ⚠ O wykonalności rozstrzygają te same źródła co rozkaz: `WarpRouteSystem.canOrder` (bramka statku — wstrzykiwana) i `planWarpRoute`
//   (trasa), z opcjami tej samej postaci co `beginJourney` (`warpPlanOptions`; zgodność pilnowana keeperem) — inaczej menu obiecywałoby
//   skok, którego rozkaz by odmówił. Priorytet powodu jak w panelu rozkazu: bramka statku > powód trasy.
// ⚠ Nazwa układu tylko przez kanon mgły (`warpSystemLabel`, D-GX-18). Pozycje punktów trasy NIE są objęte mgłą: płyta i tak rysuje każdą
//   gwiazdę. Współrzędne to galaktyczne LY z `galaxyData.systems` — rzut na płytę należy do warstwy rysującej.

import { GAME_CONFIG } from '../config/GameConfig.js';
import { t, tIn } from '../i18n/i18n.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipStats } from '../data/ShipModulesData.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { planWarpRoute as realPlanWarpRoute, WARP_ROUTE_REASONS } from '../utils/WarpRoutePlanner.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { warpSystemLabel } from '../utils/SystemRevealWorld.js';

export { warpSystemLabel };

const FUEL_EPS = 1e-6;   // ten sam margines co bramka paliwa planera

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

// ── Picker [ Wyślij ▼ ] ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Wiersze pickera: każdy statek GRACZA z napędem warp, rozstrzygany przez `canOrder` (Finding 593 — nie „zadokowany przy aktywnej
 * kolonii”). Odmówiony zostaje na liście, przyciemniony z powodem (D-GX-12): kadłub w rezerwie ma widzieć, co zrobić. Statek już
 * w układzie celu odmawia `same_system`. Najpierw zdolne, kolejność wejścia w obrębie grupy.
 * @returns {Array<{vesselId:string, name:string, ok:boolean, reason:string|null, reasonText:string|null,
 *                  systemId:string|null, whereLabel:string, warpCurrent:number, warpMax:number}>}
 */
export function sendPickerRows(vessels, targetSystemId, canOrder, { K } = {}) {
  const rows = [];
  for (const v of vessels ?? []) {
    if (!v || v.isWreck || isEnemyVessel(v)) continue;
    if (!(v.warpFuel?.max > 0)) continue;
    const gate = canOrder?.(v) ?? { ok: false, reason: 'not_player' };
    const systemId = systemIdOf(v);
    const reason = !gate.ok ? gate.reason : (systemId === targetSystemId ? WARP_ROUTE_REASONS.SAME_SYSTEM : null);
    rows.push({
      vesselId: v.id,
      name: v.name ?? v.id,
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
