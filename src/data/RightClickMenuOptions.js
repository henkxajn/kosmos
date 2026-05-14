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

export const MENU_OPTIONS_BY_TARGET = Object.freeze({
  empty: [
    { id: 'moveToPoint', labelPL: 'Lecisz tutaj', labelEN: 'Move here', icon: '→',
      action: 'issueOrder', orderType: 'moveToPoint', requiresSelection: true },
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
  ],
  ownVessel: [
    { id: 'escort', labelPL: 'Eskortuj', labelEN: 'Escort', icon: '🛡',
      action: 'issueOrder', orderType: 'escort', requiresSelection: true,
      // Filtr: nie pokazuj escort'a jeśli celem jest sam selected vessel
      condition: (target, selectedId) => target.entityId !== selectedId },
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
    // dock — pominięte w P1.1: Planet entity nie ma flagi canDock; decyzja
    // dokowania to runtime (ColonyManager.colonies + OrbitalSpaceSystem).
    // P1.3 doda gdy będzie miał resolveTarget logic.
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
export function buildMenuOptions(target, selectedVesselId) {
  const baseOptions = MENU_OPTIONS_BY_TARGET[target?.type] ?? [];
  return baseOptions
    .filter(opt => !opt.condition || opt.condition(target, selectedVesselId))
    .map(opt => {
      const base = {
        ...opt,
        enabled: !opt.requiresSelection || selectedVesselId !== null,
        disabledReason: opt.requiresSelection && !selectedVesselId
          ? 'Najpierw wybierz statek'
          : null,
        warning: null,
      };
      // M4 P1.5 — warning gdy pursue/intercept na enemy a selected vessel bez broni.
      // Opcja zostaje enabled (player może świadomie wysłać "kamikaze recon"),
      // ale tooltip ostrzega o konsekwencjach.
      if (base.enabled
          && (opt.orderType === 'pursue' || opt.orderType === 'intercept')
          && target?.type === 'enemyVessel'
          && _vesselHasNoWeapons(selectedVesselId)) {
        base.warning = 'no_weapons';
      }
      return base;
    });
}
