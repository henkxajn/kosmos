// ColonyGrid — JEDNA droga tworzenia siatki heksów kolonii (AI STRIKES BACK S4/2, decyzja SB87, Finding 55).
//
// PO CO TEN PLIK ISTNIEJE. Siatkę kolonii gracza tworzyło okno kolonii (`ColonyOverlay._getGrid`) przy pierwszym otwarciu
// mapy. Kolonia, której mapy gracz nigdy nie otworzył, nie miała siatki — a desant AI (`InvasionSystem.launchInvasion`,
// `_landCargo`) potrzebuje siatki do wyboru heksów lądowania i odmawiał `no_grid` (Finding 55). Zmierzone 2026-10-14 na
// prawdziwej grze: okno kolonii otwiera się samo (kolonia macierzysta nowej gry — przy starcie; nowa kolonia i placówka
// gracza — przy założeniu, a `ColonyManager.createOutpost` sam generuje siatkę), więc kolonia bez siatki to dziś stan po
// migracji zapisu v36→v37 (`SaveMigration`: siatka `null`) albo każda przyszła droga zakładania kolonii bez okna.
// SB87 (2026-10-14): siatka tworzona LENIWIE przy desancie — ta sama funkcja woła okno kolonii i ścieżki desantu.
//
// CO ROBI `ensureColonyGrid` (kroki dotąd w `ColonyOverlay._getGrid`, gałąź generowania — przeniesione bez zmian):
//   1. generator mapy planety (`PlanetMapGenerator.generate(planet, isHome)` — deterministyczny, ta sama planeta zawsze
//      ta sama mapa), siatka na kolonii (`colony.grid`);
//   2. właściciel kafli bez właściciela: imperium kolonii, `'enemy'` dla kolonii testowej, inaczej `'player'`;
//   3. `BuildingSystem` kolonii: ta sama instancja siatki, wysokość, złoża planety, tryb heksów (nie regionów);
//   4. stan budynków na kaflach z rejestru budynków kolonii (`syncTileBuildings` — stolica, budynki, budowa, kolejka).
// Siatka istniejąca zostaje (bez `regenerate`) — także stan kafli (okupacja, właściciel). Siatka utworzona tutaj dostaje
// znacznik `colony._gridEnsured`: okno kolonii ją reużywa (`shouldReuseColonyGrid`) zamiast generować od nowa, więc stan
// kafli z desantu (okupacja) przeżywa pierwsze otwarcie mapy.
// ⚠ Czego TU NIE MA: tekstury biomów (asynchroniczne, warstwa okna) i automatycznego postawienia stolicy przy pierwszym
//   otwarciu mapy (zostaje w oknie kolonii — wymaga aktywnej kolonii, bo `planet:buildRequest` obsługuje jej
//   `BuildingSystem`).
// ⚠ Zero importów systemów (wzór `GarrisonPlanner`): `homePlanetId` z opcji, domyślnie z `window.KOSMOS` (gdy jest).

import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';

/**
 * Stan budynków na kaflach siatki z rejestru budynków kolonii: kafle czyszczone, potem stolica (`capitalBase`), aktywne
 * budynki (`buildingId`, `buildingLevel`), budowa w toku (`underConstruction`) i kolejka (`pendingBuild`); `BuildingSystem`
 * dostaje tę instancję siatki. Przeniesione bez zmian z `ColonyOverlay._syncTileBuildings` (jedno źródło).
 * @param {object} grid
 * @param {object} bSys — `BuildingSystem` kolonii
 */
export function syncTileBuildings(grid, bSys) {
  if (!grid || !bSys) return;
  // Wyczyść stany budynków
  grid.forEach(tile => {
    tile.buildingId = null; tile.buildingLevel = 1;
    tile.capitalBase = false; tile.underConstruction = null; tile.pendingBuild = null;
  });
  // Aktywne budynki
  for (const [tileKey, entry] of bSys._active) {
    if (tileKey.startsWith('capital_')) {
      const coords = tileKey.slice(8).split(',').map(Number);
      const t = grid.get(coords[0], coords[1]);
      if (t) t.capitalBase = true;
      continue;
    }
    const [q, r] = tileKey.split(',').map(Number);
    const t = grid.get(q, r);
    if (t) { t.buildingId = entry.building.id; t.buildingLevel = entry.level ?? 1; }
  }
  // Budowa w toku
  if (bSys._constructionQueue) {
    for (const [tileKey, constr] of bSys._constructionQueue) {
      const [q, r] = tileKey.split(',').map(Number);
      const t = grid.get(q, r);
      if (t) t.underConstruction = constr;
    }
  }
  // Oczekujące zamówienia (pending queue)
  if (bSys._pendingQueue) {
    for (const [tileKey, order] of bSys._pendingQueue) {
      const [q, r] = tileKey.split(',').map(Number);
      const t = grid.get(q, r);
      if (t) t.pendingBuild = order.buildingId ?? order.building?.id;
    }
  }
  // Aktualizuj _grid w BuildingSystem
  bSys._grid = grid;
}

/**
 * Siatka kolonii — istniejąca albo utworzona teraz (kroki w nagłówku).
 * @param {object} colony — wpis `ColonyManager` (`planet`, `planetId`, `buildingSystem`, `grid`)
 * @param {{regenerate?:boolean, homePlanetId?:string|null}} [opts]
 *   `regenerate` — utwórz nową siatkę także wtedy, gdy kolonia już ma jakąś (okno kolonii: siatka gracza spoza zapisu
 *   i spoza tej funkcji — zachowanie sprzed SB87); `homePlanetId` — id planety macierzystej gracza (generator stawia
 *   na niej mapę domu), domyślnie `window.KOSMOS.homePlanet.id`.
 * @returns {object|null} siatka albo `null` (brak kolonii albo planety)
 */
export function ensureColonyGrid(colony, opts = {}) {
  if (!colony) return null;
  if (colony.grid && opts.regenerate !== true) return colony.grid;
  if (!colony.planet) return colony.grid ?? null;
  const homePlanetId = opts.homePlanetId !== undefined
    ? opts.homePlanetId
    : ((typeof window !== 'undefined') ? (window.KOSMOS?.homePlanet?.id ?? null) : null);
  const isHome = colony.planetId === homePlanetId;
  const grid = PlanetMapGenerator.generate(colony.planet, isHome);
  colony.grid = grid;
  colony._gridEnsured = true;

  // Domyślny owner: dla obcej kolonii → empireId/isTestEnemy, inaczej → 'player'.
  // Nie nadpisuje hexów które już mają ownera (np. po invasion).
  const defaultOwner = colony.ownerEmpireId ?? (colony.isTestEnemy ? 'enemy' : 'player');
  for (const tile of grid.toArray()) {
    if (tile && tile.owner == null) tile.owner = defaultOwner;
  }

  // Ustaw gridHeight, deposits i tryb w BuildingSystem (krytyczne!)
  const bSys = colony.buildingSystem;
  if (bSys) {
    bSys._gridHeight = grid.height ?? 10;
    bSys._grid = grid;
    if (typeof bSys.setDeposits === 'function') {
      bSys.setDeposits(colony.planet?.deposits ?? []);
    }
    if (typeof bSys.setRegionMode === 'function') {
      bSys.setRegionMode(false); // hex grid, nie regiony
    }
  }
  syncTileBuildings(grid, bSys);
  return grid;
}
