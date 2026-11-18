// ARC KONSOLE K7-B — inspektor statku / floty na konsoli Dowództwa: czysta logika (KZ-Command: jedyna ścieżka Dowództwa, flaga zdjęta).
//
// Bez DOM, bez canvasu, bez window. Widok (`CommandInspectorView`) zbiera FAKTY z żywego stanu (te same predykaty co dzisiejszy
// panel `_drawRight` / `_drawRightFleet`), a tu fakty → grupy czipów akcji. Każdy czip niesie DZISIEJSZĄ strefę trafień
// (typ + dane bez zmian; handler `_handleHit` bez zmian) albo — gdy akcja jest niemożliwa — powód (klucz i18n albo gotowy,
// już przetłumaczony tekst z `getAvailableActions`). Zasada: strefa jest dokładnie tam, gdzie dzisiejszy panel ją emituje
// (dostępność = dawny panel statku); czip wyłączony nigdy nie ma strefy (brak cichych no-opów — zawsze powód z tym, co zrobić).

/** Kolejność grup akcji w inspektorze statku (główna na górze, niszcząca na końcu w roli alert). */
export const SHIP_ACTION_GROUPS = Object.freeze(['primary', 'orders', 'logistics', 'destructive']);

/** Próg „mało” przyrządu (paliwo, wytrzymałość) — ten sam co kolumna paliwa rejestru (< 20 %). */
export const LOW_FRAC = 0.2;

const zone = (type, data) => ({ type, data });

/**
 * Czipy akcji statku pogrupowane: `{ primary, orders, logistics, destructive }` — każda tablica czipów
 * `{ id, labelKey?, labelArgs?, text?, zone|null, reasonKey?, reasonArgs?, reasonText?, danger? }`.
 * @param {object} f — fakty (zbierane przez widok z tych samych predykatów co `_drawRight`):
 *   vesselId, vesselRef (obiekt statku — dane strefy `action` jak dziś),
 *   docked, dockedAt, orbiting,
 *   service: null | { mobilizing:boolean, toReserve:boolean }   (null = brak `deployVessel` albo wrak)
 *   actions: Array<{ id, label, icon, ok, reason }>              (`getAvailableActions`)
 *   cancelOrder: boolean                                         (rozkaz ruchu `active`)
 *   interstellarSwitch: string|null                              (id układu — panel po przylocie)
 *   foreign: null | { bodyId, recon:boolean, analyzed:boolean,
 *                     colonize: null | { explored, colonized, validType },
 *                     unload: null | { tons } }
 *   foreignRecon: boolean, loop: boolean,
 *   cargo: null | { used, max }, colonistsOnBoard: number,
 *   canDisband: boolean, hasShipyard: boolean,
 *   refuelAuto: boolean, refuelReachable: boolean (false = dzisiejszy panel nie dochodzi do tankowania), pool: null | { inPool:boolean },
 *   rally: null | { currentId: string|null, currentName?: string }
 */
export function shipActionGroups(f) {
  const id = f.vesselId;
  const g = { primary: [], orders: [], logistics: [], destructive: [] };
  const add = (grp, c) => g[grp].push({ zone: null, ...c });

  // ── główne (to, co statek robi teraz najpewniej): start z doku, powrót do służby, przełączenie widoku po skoku
  if (f.docked && f.dockedAt) add('primary', { id: 'undock', labelKey: 'cmdInsp.undock', zone: zone('undock', { vesselId: id }) });
  if (f.service && !f.service.mobilizing && !f.service.toReserve) {
    add('primary', { id: 'deploy_vessel', labelKey: 'cmdInsp.deploy', zone: zone('deploy_vessel', { vesselId: id }) });
  }
  if (f.interstellarSwitch) {
    add('primary', { id: 'cluster_switch', labelKey: 'cmdInsp.clusterSwitch', zone: zone('cluster_switch', { systemId: f.interstellarSwitch }) });
  }

  // ── rozkazy: anulowanie rozkazu ruchu, akcje misji (`getAvailableActions`), rozkazy obcej orbity, rekon, pętla
  if (f.cancelOrder) add('orders', { id: 'cancel_movement_order', labelKey: 'cmdInsp.cancelOrder', zone: zone('cancel_movement_order', { vesselId: id }) });
  for (const a of f.actions ?? []) {
    const c = { id: `action:${a.action?.id ?? a.id}`, text: a.action?.label ?? a.label ?? '' };
    if (a.ok) c.zone = zone('action', { actionId: a.action?.id ?? a.id, vessel: f.vesselRef });
    else if (a.reason) c.reasonText = a.reason;
    else c.reasonKey = 'cmdInsp.reasonUnavailable';
    add('orders', c);
  }
  const fo = f.foreign;
  if (fo) {
    if (fo.recon) {
      add('orders', fo.analyzed
        ? { id: 'foreign_recon_body', labelKey: 'cmdInsp.reconBody', reasonKey: 'cmdInsp.reasonAnalyzed' }
        : { id: 'foreign_recon_body', labelKey: 'cmdInsp.reconBody', zone: zone('foreign_recon_body', { vesselId: id, targetId: fo.bodyId }) });
      add('orders', { id: 'foreign_recon_system', labelKey: 'cmdInsp.reconSystem', zone: zone('foreign_recon_system', { vesselId: id }) });
    }
    if (fo.colonize) {
      const k = fo.colonize;
      const can = k.explored && !k.colonized && k.validType;
      const c = { id: 'foreign_colonize', labelKey: 'cmdInsp.colonize' };
      if (can) c.zone = zone('foreign_colonize', { vesselId: id, targetId: fo.bodyId });
      else c.reasonKey = !k.explored ? 'cmdInsp.reasonNeedExplored' : k.colonized ? 'cmdInsp.reasonColonized' : 'cmdInsp.reasonBadType';
      add('orders', c);
    }
  }
  if (f.foreignRecon) add('orders', { id: 'abort_foreign_recon', labelKey: 'cmdInsp.abortRecon', zone: zone('abort_foreign_recon', { vesselId: id }) });
  if (f.loop) add('orders', { id: 'cancel_loop', labelKey: 'cmdInsp.stopLoop', zone: zone('cancel_loop', { vesselId: id }) });

  // ── logistyka: ładunek, koloniści, rozładunek u obcych, tankowanie, pula, punkt zborny, rezerwa
  if (f.cargo && f.cargo.max > 0) {
    const c = { id: 'cargo_load', labelKey: 'cmdInsp.cargo', labelArgs: [Math.round(f.cargo.used ?? 0), f.cargo.max] };
    if (f.docked || f.orbiting) c.zone = zone('cargo_load', { vesselId: id });
    else c.reasonKey = 'cmdInsp.reasonCargoWhere';
    add('logistics', c);
  }
  if ((f.colonistsOnBoard ?? 0) > 0) {
    const c = { id: 'unload_colonists', labelKey: 'cmdInsp.unloadColonists', labelArgs: [f.colonistsOnBoard] };
    if (f.docked) c.zone = zone('unload_colonists', { vesselId: id });
    else c.reasonKey = 'cmdInsp.reasonUnloadDock';
    add('logistics', c);
  }
  if (fo?.unload) {
    add('logistics', { id: 'foreign_unload', labelKey: 'cmdInsp.foreignUnload', labelArgs: [Math.round(fo.unload.tons ?? 0)],
      zone: zone('foreign_unload', { vesselId: id, targetId: fo.bodyId }) });
  }
  const refuelOk = f.docked && f.refuelReachable !== false;
  add('logistics', refuelOk
    ? { id: 'manual_refuel', labelKey: 'cmdInsp.refuel', zone: zone('manual_refuel', { vesselId: id }) }
    : { id: 'manual_refuel', labelKey: 'cmdInsp.refuel', reasonKey: 'cmdInsp.reasonRefuelDock' });
  add('logistics', refuelOk
    ? { id: 'toggle_refuel_auto', labelKey: f.refuelAuto ? 'cmdInsp.refuelAutoOn' : 'cmdInsp.refuelAutoOff', zone: zone('toggle_refuel_auto', { vesselId: id }) }
    : { id: 'toggle_refuel_auto', labelKey: f.refuelAuto ? 'cmdInsp.refuelAutoOn' : 'cmdInsp.refuelAutoOff', reasonKey: 'cmdInsp.reasonRefuelDock' });
  if (f.pool) {
    add('logistics', { id: 'toggle_logistics_pool', labelKey: f.pool.inPool ? 'cmdInsp.poolOut' : 'cmdInsp.poolIn',
      zone: zone('toggle_logistics_pool', { vesselId: id }) });
  }
  if (f.rally) {
    if (!f.rally.currentId) {
      add('logistics', { id: 'rally_assign_open', labelKey: 'cmdInsp.rallyAssign', zone: zone('rally_assign_open', { vesselId: id, currentRallyId: null }) });
    } else {
      add('logistics', { id: 'rally_assign_open', labelKey: 'cmdInsp.rallyChange', zone: zone('rally_assign_open', { vesselId: id, currentRallyId: f.rally.currentId }) });
      add('logistics', { id: 'rally_assign_remove', labelKey: 'cmdInsp.rallyRemove', zone: zone('rally_assign_remove', { vesselId: id, rallyId: f.rally.currentId }) });
    }
  }
  if (f.service && !f.service.mobilizing && f.service.toReserve) {
    add('logistics', { id: 'withdraw_vessel', labelKey: 'cmdInsp.withdraw', zone: zone('withdraw_vessel', { vesselId: id }) });
  }

  // ── niszczące (ostatnie, rola alert, dzisiejsze potwierdzenie w handlerze `disband`)
  {
    const c = { id: 'disband', labelKey: 'cmdInsp.scrap', danger: true };
    if (f.canDisband) c.zone = zone('disband', { vesselId: id });
    else c.reasonKey = f.docked && !f.hasShipyard ? 'cmdInsp.reasonScrapShipyard' : 'cmdInsp.reasonScrapDock';
    add('destructive', c);
  }
  return g;
}

/**
 * Czipy rozkazów floty (dzisiejsza siatka 2×2 `_drawRightFleet`) + rozwiązanie floty (Finding 747 — `fleetDisband`).
 * @param {{ fleetId:string, hasOrder:boolean, engagePick:boolean }} f
 */
export function fleetActionGroups(f) {
  const d = { fleetId: f.fleetId };
  return {
    orders: [
      { id: 'fleetMoveToPoint', labelKey: 'cmdInsp.fleetMove', zone: zone('fleetMoveToPoint', d) },
      { id: 'fleetEngage', labelKey: f.engagePick ? 'cmdInsp.fleetEngagePick' : 'cmdInsp.fleetEngage', zone: zone('fleetEngage', d) },
      { id: 'fleetReturnBase', labelKey: 'cmdInsp.fleetReturn', zone: zone('fleetReturnBase', d) },
      f.hasOrder
        ? { id: 'fleetCancelOrder', labelKey: 'cmdInsp.fleetCancel', zone: zone('fleetCancelOrder', d) }
        : { id: 'fleetCancelOrder', labelKey: 'cmdInsp.fleetCancel', zone: null, reasonKey: 'cmdInsp.reasonNoFleetOrder' },
    ],
    destructive: [{ id: 'fleetDisband', labelKey: 'cmdInsp.fleetDisband', danger: true, zone: zone('fleetDisband', d) }],
  };
}

/**
 * Podsumowanie członków floty / zaznaczenia: liczba, obecni, najwolniejszy (AU/r), najmniejszy zasięg (AU), najmniej paliwa.
 * @param {Array<{ id, speedAU:number|null, rangeAU:number|null, fuelPct:number|null }>} members — obecni członkowie (statki żyją)
 * @param {number} declared — zadeklarowana liczba członków (`memberIds.length`)
 */
export function groupStats(members, declared = null) {
  const ms = members ?? [];
  const num = (k) => ms.map((m) => m?.[k]).filter((v) => Number.isFinite(v));
  const minOf = (k) => { const a = num(k); return a.length ? Math.min(...a) : null; };
  const fuel = minOf('fuelPct');
  return {
    count: declared ?? ms.length,
    present: ms.length,
    slowestSpeed: minOf('speedAU'),
    minRange: minOf('rangeAU'),
    minFuelPct: fuel,
    lowFuel: ms.filter((m) => Number.isFinite(m?.fuelPct) && m.fuelPct < LOW_FRAC).length,
  };
}

/** Przyrząd (pasek + liczby): ułamek 0–1 i rola (`alert` poniżej progu). Brak / zerowe maksimum → null (nie rysować). */
export function meter(cur, max, lowAt = LOW_FRAC) {
  const m = Number(max);
  if (!(m > 0)) return null;
  const frac = Math.max(0, Math.min(1, (Number(cur) || 0) / m));
  return { frac, tone: frac < lowAt ? 'alert' : 'primary' };
}

/**
 * Stan kadłuba (statek nie ma punktów życia — jest flaga `damaged` i postęp naprawy `_repairProgress` 0–1 w doku ze stocznią).
 * @returns {{ key:string, frac:number, tone:string, repairing:boolean }}
 */
export function hullState(v) {
  if (!v?.damaged) return { key: 'cmdInsp.hullOk', frac: 1, tone: 'primary', repairing: false };
  const p = Math.max(0, Math.min(1, Number(v._repairProgress) || 0));
  return { key: p > 0 ? 'cmdInsp.hullRepair' : 'cmdInsp.hullDamaged', frac: p, tone: 'alert', repairing: p > 0 };
}

/**
 * Linie utrzymania (ta sama logika co karta katalogowa `_drawRight`, S3.5a-1 / W2-5 / A): stawka, nota rezerwy, ostrzeżenie
 * (rok 1 nieopłacony) albo unieruchomienie (rok 2), licznik zaległości i KONKRETNA naprawa (brakująca kwota albo „zejdzie sama”).
 * @returns {{ rate:{ key, args, tone }, lines:Array<{ key, args, tone }>, alert:boolean }}
 */
export function upkeepLines({ upkeep = 0, baseUpkeep = 0, immobilized = false, unpaid = 0, treasury = 0, inReserve = false } = {}) {
  const lines = [];
  if (inReserve) lines.push({ key: 'fleet.reserveRateNote', args: [Math.round(baseUpkeep)], tone: 'dim' });
  if (immobilized) lines.push({ key: 'fleet.immobilized', args: [], tone: 'alert' });
  else if (unpaid > 0) lines.push({ key: 'fleet.upkeepUnpaidWarn', args: [], tone: 'alert' });
  if (unpaid > 0) {
    lines.push({ key: 'fleet.unpaidYears', args: [unpaid], tone: 'dim' });
    const short = Math.max(0, Math.ceil(upkeep - treasury));
    lines.push(short > 0 ? { key: 'fleet.upkeepShortfall', args: [short], tone: 'alert' } : { key: 'fleet.arrearsClearsSoon', args: [], tone: 'primary' });
  }
  return { rate: { key: 'fleet.upkeepPerYear', args: [Math.round(upkeep)], tone: immobilized ? 'alert' : 'primary' }, lines,
    alert: immobilized || unpaid > 0 };
}

/**
 * Pozycja okna dialogowego DOM (zmiana nazwy, potwierdzenie rozbiórki / rozwiązania floty, wybór floty) z prostokąta strefy
 * konsoli (`consoleZones`, px logiczne) i skali UI (`uiViewport`) — px CSS. Szerokość = strefa (nie mniej niż `minW` px
 * logicznych), lewa krawędź dociągnięta tak, by okno nie wyszło za prawą krawędź ramy `frame`.
 * @returns {{ left:number, top:number, width:number }}
 */
export function dialogAnchorCss(rect, scale, { frame = null, minW = 260, dy = 0 } = {}) {
  const s = Number(scale) > 0 ? Number(scale) : 1;
  const w = Math.max(minW, rect.w);
  let x = rect.x;
  if (frame && x + w > frame.x + frame.w) x = Math.max(frame.x, frame.x + frame.w - w);
  return { left: Math.round(x * s), top: Math.round((rect.y + dy) * s), width: Math.round(w * s) };
}

/**
 * Czipy rysowane przez dzisiejszy panel PRZED konfiguratorem misji (gdy `_missionConfig` jest aktywny, `_drawRight` kończy na
 * konfiguratorze: bez akcji misji, służby, tankowania, puli, punktu zbornego i rozbiórki). Parytet stref w tym trybie.
 */
export const PRE_CONFIG_CHIPS = Object.freeze(new Set([
  'undock', 'cluster_switch', 'cancel_movement_order', 'foreign_recon_body', 'foreign_recon_system', 'foreign_colonize',
  'abort_foreign_recon', 'cancel_loop', 'cargo_load', 'unload_colonists', 'foreign_unload',
]));

/** Grupy zawężone do czipów sprzed konfiguratora (ta sama kolejność grup). */
export function preConfigGroups(g) {
  const out = {};
  for (const k of SHIP_ACTION_GROUPS) out[k] = (g?.[k] ?? []).filter((c) => PRE_CONFIG_CHIPS.has(c.id));
  return out;
}

/**
 * Linia pod rozkazami, gdy statek nie ma akcji misji (`getAvailableActions` puste): jeśli logistyka ma czipy — stan statku
 * („Brak rozkazów w locie” / „na orbicie” / „w doku” / „w tym stanie”), bo „Brak dostępnych akcji” kłamie przy widocznej logistyce;
 * bez logistyki — dzisiejsze „Brak dostępnych akcji”. Są akcje → null (bez linii).
 */
export function noOrdersKey(posState, actionsCount, logisticsCount) {
  if ((actionsCount ?? 0) > 0) return null;
  if (!((logisticsCount ?? 0) > 0)) return 'fleet.noAvailableActions';
  switch (posState) {
    case 'in_transit': return 'cmdInsp.noOrdersFlight';
    case 'orbiting':   return 'cmdInsp.noOrdersOrbit';
    case 'docked':     return 'cmdInsp.noOrdersDock';
    default:           return 'cmdInsp.noOrdersState';
  }
}
