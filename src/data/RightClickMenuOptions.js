// ── M3 P1.1 — Right-Click Menu Options Schema ──────────────────────────
// Deklaratywna lista opcji menu kontekstowego per typ celu kliknięcia.
// Pure data + jeden helper (buildMenuOptions). Brak logiki wykonującej
// order — kliknięcie loguje placeholder, real wiring w P1.3.
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
    { id: 'createPOI', labelPL: 'Utwórz POI...', labelEN: 'Create POI...', icon: '⌖',
      action: 'openCreatePOIModal', requiresSelection: false },
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

// Buduje finalną listę opcji dla danego targetu + stanu selekcji.
// Zwraca opcje z dodanymi flagami enabled + disabledReason (do UI).
// Pure function — testowalna w izolacji.
export function buildMenuOptions(target, selectedVesselId) {
  const baseOptions = MENU_OPTIONS_BY_TARGET[target?.type] ?? [];
  return baseOptions
    .filter(opt => !opt.condition || opt.condition(target, selectedVesselId))
    .map(opt => ({
      ...opt,
      enabled: !opt.requiresSelection || selectedVesselId !== null,
      disabledReason: opt.requiresSelection && !selectedVesselId
        ? 'Najpierw wybierz statek'
        : null,
    }));
}
