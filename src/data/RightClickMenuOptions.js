// ── M3 P1.1 — Right-Click Menu Options Schema ──────────────────────────
// Deklaratywna lista opcji menu kontekstowego per typ celu kliknięcia.
// Pure data + jeden helper (buildMenuOptions). Brak logiki wykonującej
// order — kliknięcie loguje placeholder, real wiring w P1.3.
//
// M4 P1.5 — dodano `warning` field dla opcji enabled ale z ostrzeżeniem
// (np. pursue na enemy z bezbronnym vesselem). RightClickMenu honoruje warning
// jako tooltip (data-tooltip) bez disabling samej opcji.

import { SHIP_MODULES } from './ShipModulesData.js';
//
// Target shape (dostarczany przez P1.2 raycaster — RaycasterHelper.resolveTargetFromHits):
//   { type, entityId?, vessel?, poi?, planet?, worldPoint }
//   type ∈ 'empty' | 'enemyVessel' | 'ownVessel' | 'poi' | 'planet'
//   worldPoint: {x, y:0, z} — Y=0 plane intersect (zawsze obecny, dla moveToPoint w P1.3)
//   vessel/poi/planet — pełna referencja do encji (z VesselManager/POIRegistry/EntityManager)
//
// Każda opcja:
//   id                — unikalny identyfikator (string)
//   labelPL/labelEN   — tekst wyświetlany (PL aktywny w P1.1)
//   icon              — emoji/symbol prefiksu
//   action            — 'issueOrder' | 'openCreatePOIModal' |
//                       'openEditPOIModal' | 'deletePOI'
//   orderType?        — klucz ORDER_TYPES z M1 MovementOrderSystem
//                       (gdy action === 'issueOrder')
//   condition?        — function(target, selectedVesselId) → boolean
//                       (filter dynamiczny; pominięty → zawsze widoczne)
//   requiresSelection — czy wymaga aktywnego selectedVesselId

// ── P2 — Fleet-context entries (forFleet:true) ──────────────────────────
// Pojawiają się gdy gracz ma wybraną flotę (selectedFleetId) — równolegle
// do standardowych vessel-context. Wzajemnie wykluczające: gdy fleet jest
// zaznaczony, fleet entries SHOW + vessel entries HIDE (gracz może mieć tylko
// jedna ścieżkę selekcji on aktiwnie).
// Etykieta zawiera placeholder {fleet} wstawiany przez buildMenuOptions z fleet.name.

export const MENU_OPTIONS_BY_TARGET = Object.freeze({
  empty: [
    { id: 'moveToPoint', labelPL: 'Lecisz tutaj', labelEN: 'Move here', icon: '→',
      action: 'issueOrder', orderType: 'moveToPoint', requiresSelection: true },
    // P2 — fleet move
    { id: 'fleet.moveToPoint', labelPL: 'Flota: lecisz tutaj', labelEN: 'Fleet: move here', icon: '🎯',
      action: 'issueFleetOrder', orderType: 'moveToPoint', forFleet: true },
    // M3 P1.3 — patrol z manualnymi waypointami (picker mode). RightClickMenu
    // rozpoznaje target.type !== 'poi' + orderType='patrol' jako sygnał picker'a.
    // POI patrol (klasyczny) zostaje w MENU_OPTIONS_BY_TARGET.poi (używa POI.waypoints).
    { id: 'patrolManual', labelPL: 'Patroluj manualnie', labelEN: 'Manual patrol', icon: '↻',
      action: 'issueOrder', orderType: 'patrol', requiresSelection: true },
    // M3 P2.3 — Create POI mode (5 type-specific entries). Single-click types
    // (waypoint/picket/rally/ambush) używają target.worldPoint jako 1st click —
    // modal otwiera się natychmiast pre-filled (fast path). Patrol startuje
    // picker mode (multi-click ≥2 + ENTER).
    { id: 'createPOI.waypoint', labelPL: 'Utwórz Waypoint tutaj', labelEN: 'Create Waypoint here', icon: '📍',
      action: 'openCreatePOIPicker', poiType: 'waypoint', requiresSelection: false },
    { id: 'createPOI.patrol', labelPL: 'Utwórz Patrol tutaj', labelEN: 'Create Patrol here', icon: '↻',
      action: 'openCreatePOIPicker', poiType: 'patrol', requiresSelection: false },
    { id: 'createPOI.picket', labelPL: 'Utwórz Pikietę tutaj', labelEN: 'Create Picket here', icon: '⚠',
      action: 'openCreatePOIPicker', poiType: 'picket', requiresSelection: false },
    { id: 'createPOI.rally', labelPL: 'Utwórz Punkt Zborny tutaj', labelEN: 'Create Rally here', icon: '🎯',
      action: 'openCreatePOIPicker', poiType: 'rally', requiresSelection: false },
    { id: 'createPOI.ambush', labelPL: 'Utwórz Zasadzkę tutaj', labelEN: 'Create Ambush here', icon: '👁',
      action: 'openCreatePOIPicker', poiType: 'ambush', requiresSelection: false },
  ],
  enemyVessel: [
    { id: 'pursue', labelPL: 'Ścigaj', labelEN: 'Pursue', icon: '⚔',
      action: 'issueOrder', orderType: 'pursue', requiresSelection: true },
    { id: 'intercept', labelPL: 'Przechwyć', labelEN: 'Intercept', icon: '⊕',
      action: 'issueOrder', orderType: 'intercept', requiresSelection: true },
    // M4 P3 — tactical kiting: vessel utrzymuje optimal weapon range vs target.
    // Warning gdy brak broni (analogicznie do pursue/intercept).
    { id: 'engage', labelPL: 'Zaangażuj', labelEN: 'Engage', icon: '⊗',
      action: 'issueOrder', orderType: 'engage', requiresSelection: true },
    // P2 — fleet engage / pursue
    { id: 'fleet.engage', labelPL: 'Flota: zaangażuj', labelEN: 'Fleet: engage', icon: '⊗',
      action: 'issueFleetOrder', orderType: 'engage', forFleet: true },
    { id: 'fleet.pursue', labelPL: 'Flota: ścigaj', labelEN: 'Fleet: pursue', icon: '⚔',
      action: 'issueFleetOrder', orderType: 'pursue', forFleet: true },
  ],
  ownVessel: [
    { id: 'escort', labelPL: 'Eskortuj', labelEN: 'Escort', icon: '🛡',
      action: 'issueOrder', orderType: 'escort', requiresSelection: true,
      // Filtr: nie pokazuj escort'a jeśli celem jest sam selected vessel
      condition: (target, selectedId) => target.entityId !== selectedId },
    // M4 P3 polish — "Wycofaj się" gdy PPM na własny vessel który jest w aktywnym
    // DSCS encounter. Auto-pick najbliższej friendly planety + moveToPoint.
    // Bitwa kończy się porażką gdy vessel wyjdzie z combat range.
    { id: 'retreat', labelPL: 'Wycofaj się z bitwy', labelEN: 'Retreat from combat', icon: '↩',
      action: 'issueOrder', orderType: 'retreat', requiresSelection: true,
      // Pokazuj tylko gdy targetowany vessel jest w aktywnym combat.
      condition: (target) => _vesselInCombat(target.entityId) },
  ],
  poi: [
    { id: 'goToPOI', labelPL: 'Lecisz do POI', labelEN: 'Go to POI', icon: '→',
      action: 'issueOrder', orderType: 'goToPOI', requiresSelection: true },
    { id: 'patrol', labelPL: 'Patroluj', labelEN: 'Patrol', icon: '↻',
      action: 'issueOrder', orderType: 'patrol', requiresSelection: true,
      // Patrol opcja tylko jeśli POI jest typu 'patrol' (waypoint jest single)
      condition: (target) => target.poi?.type === 'patrol' },
    { id: 'editPOI', labelPL: 'Edytuj...', labelEN: 'Edit...', icon: '✎',
      action: 'openEditPOIModal', requiresSelection: false },
    { id: 'deletePOI', labelPL: 'Usuń POI', labelEN: 'Delete POI', icon: '✕',
      action: 'deletePOI', requiresSelection: false },
  ],
  planet: [
    { id: 'moveToPlanet', labelPL: 'Lecisz do planety', labelEN: 'Move to planet', icon: '→',
      action: 'issueOrder', orderType: 'moveToPoint', requiresSelection: true },
    // Slice 8b — Dock na kolonię gracza (hangar). Każda kolonia gracza: małe kadłuby dokują BEZ
    // portu, duże wymagają portu (per-vessel `dockAtColony` decyduje; bez portu duży→orbita).
    // Stacje orbitalne = dropdown w panelu floty. buildOrderSpec('dock') buduje spec.
    { id: 'dock', labelPL: 'Dokuj tutaj', labelEN: 'Dock here', icon: '⚓',
      action: 'issueOrder', orderType: 'dock', requiresSelection: true,
      condition: (target) => _isPlayerColony(target.entityId) },
    // P2 — fleet move to planet (sync ETA)
    { id: 'fleet.moveToPlanet', labelPL: 'Flota: lecisz do planety', labelEN: 'Fleet: move to planet', icon: '🎯',
      action: 'issueFleetOrder', orderType: 'moveToPoint', forFleet: true },
  ],
});

/**
 * M4 P1.5 — sprawdź czy selected vessel ma jakikolwiek moduł broni.
 * Vessel bez weapon module wchodząc w combat dostaje BattleSystem fallback damage=2,
 * co nie przebija pancerza wrogich frigate (armor=2), więc przegrywa i retreatuje.
 * Funkcja zwraca true gdy vessel NIE ma weapons — UI pokaże warning na pursue/intercept.
 *
 * Pure-ish: wykonuje window.KOSMOS lookup, ale to acceptable dla UI helper.
 * @param {string} vesselId
 * @returns {boolean} true gdy vessel istnieje i NIE ma weapon module
 */
/**
 * M4 P3 polish — czy vessel jest w aktywnym deep-space encounter.
 * Read-only z DSCS._activeEncounters. Wołane z buildMenuOptions condition.
 * @param {string} vesselId
 * @returns {boolean}
 */
// Slice 8b — czy `id` to kolonia gracza (dock target = hangar/port). Kolonie AI mają ownerEmpireId.
function _isPlayerColony(id) {
  if (!id) return false;
  const c = window.KOSMOS?.colonyManager?.getColony?.(id);
  return !!c && (!c.ownerEmpireId || c.ownerEmpireId === 'player');
}

function _vesselInCombat(vesselId) {
  if (!vesselId) return false;
  const dscs = window.KOSMOS?.deepSpaceCombatSystem;
  if (!dscs?._activeEncounters) return false;
  for (const enc of dscs._activeEncounters.values()) {
    if (!enc?.isActive) continue;
    if (enc.vesselStates?.has?.(vesselId)) return true;
  }
  return false;
}

function _vesselHasNoWeapons(vesselId) {
  if (!vesselId) return false;
  const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
  if (!vessel) return false;
  const modules = vessel.modules ?? [];
  if (modules.length === 0) {
    // Legacy ship (SHIPS data) bez modules — fallback po shipId.
    // science_vessel / cargo_ship / colony_ship / heavy_freighter — cywilne.
    const civIds = new Set(['science_vessel', 'cargo_ship', 'colony_ship', 'heavy_freighter']);
    return civIds.has(vessel.shipId);
  }
  // Modular hull (HULLS data) — sprawdź czy którykolwiek moduł ma stats.damage.
  for (const modId of modules) {
    const mod = SHIP_MODULES[modId];
    if (mod?.stats?.damage != null) return false;  // ma broń → nie warning
  }
  return true;  // wszystkie modules sprawdzone, brak weapons → warning
}

// Buduje finalną listę opcji dla danego targetu + stanu selekcji.
// Zwraca opcje z dodanymi flagami enabled + disabledReason + warning (do UI).
// Pure function — testowalna w izolacji.
//
// P2: signature backwards-compatible — drugi arg może być stringiem (legacy
// vesselId) ALBO obiektem { vesselId?, fleetId? } (nowy fleet-aware path).
//   - forFleet:true entries pojawiają się tylko gdy fleetId jest set
//   - vessel-context (requiresSelection) entries pojawiają się tylko gdy
//     vesselId set ORAZ fleetId NIE set (fleet selection wyklucza vessel)
export function buildMenuOptions(target, selection) {
  // Backwards-compat: gdy selection to string (legacy), traktuj jako vesselId.
  const selectedVesselId = (typeof selection === 'string') ? selection
    : (selection?.vesselId ?? null);
  const selectedFleetId = (typeof selection === 'object' && selection !== null)
    ? (selection.fleetId ?? null) : null;
  const fleetActive = selectedFleetId !== null;
  const fleetName = fleetActive
    ? (window.KOSMOS?.fleetSystem?.getFleet?.(selectedFleetId)?.name ?? '?')
    : null;

  const baseOptions = MENU_OPTIONS_BY_TARGET[target?.type] ?? [];
  return baseOptions
    .filter(opt => {
      // forFleet entries: pokazuj WYŁĄCZNIE gdy fleet selected.
      if (opt.forFleet) return fleetActive;
      // Vessel-context entries (requiresSelection): pokazuj gdy vessel selected
      // I fleet NIE selected (fleet ma priorytet — wyklucza vessel).
      if (opt.requiresSelection) return !fleetActive && selectedVesselId !== null;
      // Inne (np. createPOI) — bez filtra selekcji.
      return true;
    })
    .filter(opt => !opt.condition || opt.condition(target, selectedVesselId))
    .map(opt => {
      // Etykieta z nazwą floty dla fleet entries (placeholder {fleet} usuwany — wstawiamy
      // bezpośrednio do labelu jako suffix dla czytelności).
      const labelPL = opt.forFleet && fleetName
        ? `${opt.labelPL} (${fleetName})` : opt.labelPL;
      const labelEN = opt.forFleet && fleetName
        ? `${opt.labelEN} (${fleetName})` : opt.labelEN;
      const base = {
        ...opt,
        labelPL, labelEN,
        // forFleet zawsze enabled gdy zaakceptowany przez filter (fleetActive=true).
        enabled: opt.forFleet ? true
          : (!opt.requiresSelection || selectedVesselId !== null),
        disabledReason: (!opt.forFleet && opt.requiresSelection && !selectedVesselId)
          ? 'Najpierw wybierz statek' : null,
        warning: null,
      };
      // M4 P1.5 — warning gdy pursue/intercept na enemy a selected vessel bez broni.
      if (base.enabled && !opt.forFleet
          && (opt.orderType === 'pursue' || opt.orderType === 'intercept' || opt.orderType === 'engage')
          && target?.type === 'enemyVessel'
          && _vesselHasNoWeapons(selectedVesselId)) {
        base.warning = 'no_weapons';
      }
      return base;
    });
}
