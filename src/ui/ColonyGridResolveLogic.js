// ── Czysta decyzja: uszanować istniejący colony.grid czy regenerować? ──
// Wydzielone z ColonyOverlay._getGrid, bo ColonyOverlay importuje THREE (nietestowalny headless).
// Ta logika jest źródłem prawdy dla „czy zachować stan kafli (syntheticSlot, owner, stolica)".
//
// ROOT-CAUSE (Faza 4 live-gate): _getGrid regenerował grid gracza przy każdym otwarciu mapy
// (guard `colony.grid && isHostileColony` obejmował TYLKO kolonie obce). Po wczytaniu zapisu
// ColonyManager.restore ustawiał colony.grid = savedGrid (z syntheticSlot), a _getGrid go WYRZUCAŁ
// i generował świeży → zainstalowane droidy znikały (BUG C), a energyChain/Usuń działały na innej
// instancji grida (BUG A/B po reloadzie). Testy używały JEDNEGO grida → nigdy nie łapały diverencji.
//
// AI STRIKES BACK S4/2 (SB87, Finding 55) — siatka utworzona przez `ColonyGrid.ensureColonyGrid` (znacznik `_gridEnsured`:
// desant na kolonię, której mapy gracz nie otworzył, albo samo okno) też jest reużywana — inaczej pierwsze otwarcie mapy
// wygenerowałoby siatkę od nowa i zgubiło stan kafli z desantu (okupacja, właściciel).

/**
 * Czy zachować istniejący colony.grid zamiast regenerować.
 * @param {object} colony — obiekt kolonii (musi mieć .grid gdy istnieje; .`_gridFromSave` gdy z save;
 *   `._gridEnsured` gdy siatkę utworzyło `ensureColonyGrid`)
 * @param {boolean} isHostileColony — kolonia obca/test-enemy (grid postawiony przez spawn AI)
 * @returns {boolean} true → uszanuj colony.grid; false → generuj świeży
 */
export function shouldReuseColonyGrid(colony, isHostileColony) {
  if (!colony?.grid) return false;             // brak grida → trzeba wygenerować
  // Obca kolonia: grid od spawnTestEnemy/EmpireGenerator (ma capital+owner) — nie regeneruj.
  // Gracz z gridem z save: kafle niosą stan (syntheticSlot, owner) — regeneracja by go zgubiła.
  // Grid z `ensureColonyGrid` (SB87): kafle mogą nieść stan z desantu (okupacja) — regeneracja by go zgubiła.
  return !!isHostileColony || !!colony._gridFromSave || !!colony._gridEnsured;
}
