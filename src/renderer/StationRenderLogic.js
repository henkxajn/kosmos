// StationRenderLogic — czyste reguły widoczności stacji orbitalnych na mapie 3D (BEZ importu THREE,
// więc testowalne headless). Mapa 3D renderuje WYŁĄCZNIE aktywny układ, a stacja jest anchored do
// ciała macierzystego (_tickOrbitingStations liczy jej pozycję WZGLĘDEM tego ciała) — mesh stacji z
// innego układu nie ma o co zaczepić pozycji i zostawał w origin sceny, czyli jako ikonka przy
// gwieździe układu aktywnego. Ta sama reguła co na mapie taktycznej 2D (FleetManagerOverlay filtruje
// stacje przez getByTypeInSystem / st.systemId === sysId) — tu jedno źródło dla warstwy 3D.

export const DEFAULT_SYSTEM_ID = 'sys_home';

/** Układ stacji; brak pola → 'sys_home' (spójnie z domyślną wartością Station.systemId). */
export function stationSystemId(station) {
  return station?.systemId ?? DEFAULT_SYSTEM_ID;
}

/** Czy stacja należy do renderowanego układu — JEDYNA bramka tworzenia meshu w ThreeRenderer. */
export function isStationInActiveSystem(station, activeSystemId) {
  if (!station) return false;
  return stationSystemId(station) === (activeSystemId ?? DEFAULT_SYSTEM_ID);
}
