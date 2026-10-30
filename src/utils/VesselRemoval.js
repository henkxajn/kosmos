// VesselRemoval — JEDNO źródło powodów usunięcia statku POZA walką (Findingi 582 · 102 · 107).
//
// `VesselManager.destroyVessel` emituje `vessel:removed { vesselId, vessel, reason, atBodyId }` — statek zużyty albo
// usunięty bez walki. `vessel:docked` znaczy WYŁĄCZNIE prawdziwy dok (Finding 582: dawniej usunięcie udawało dok,
// a dwaj narratorzy Dziennika pisali „wylądował” i „wrócił do bazy” o statku, którego już nie ma). Strata w walce
// idzie własną drogą: `vessel:wrecked`, a po czasie życia wraku `vessel:destroyed`.
//
// ⚠ Zero importów — moduł czytają `UIManager` (narrator) i keeper `vessel_consumption_smoke`.

/** Powody usunięcia poza walką — wołający `destroyVessel` podaje jeden z nich. */
export const VESSEL_REMOVAL_REASONS = Object.freeze([
  'colonized',          // statek założył kolonię albo placówkę (kolonizacja normalna i obca)
  'outpost_upgraded',   // statek podniósł placówkę do pełnej kolonii
  'dismantled',         // rozbiórka w stoczni kolonii
  'colony_lost',        // statek w hangarze kolonii zniszczonej albo przejętej
  'consumed',           // pozostałe zużycie (`ColonyManager.consumeShip`) — także powód domyślny
]);

/**
 * Klucz linii Dziennika dla usunięcia statku — albo `null`, gdy usunięcie opowiada zdarzenie, które je wywołało:
 *   colonized, outpost_upgraded → `colony:founded` (🏙 nowa kolonia)
 *   dismantled                  → `fleet:disbanded` (🗑 statek wycofany)
 *   consumed                    → jedyny żywy wołający (`consumeShip` z katastrofy zwiadu) ma meldunek katastrofy
 * `colony_lost` nie ma linii o statku — przejęcie i zniszczenie kolonii mówią tylko o kolonii — stąd własny klucz.
 * @param {string} reason
 * @returns {string|null}
 */
export function removalJournalKey(reason) {
  return reason === 'colony_lost' ? 'log.vesselLostWithColony' : null;
}
