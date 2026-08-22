// KANON WŁASNOŚCI KOLONII — jedno źródło prawdy dla pytania „czyja jest ta kolonia".
//
// Powstało w OG-3 (`docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`, D1=W2 + D2=W3+W1). Docelowy
// kształt rodziny nazw (`isLivePlayerColony`, `isManageablePlayerColony`) i migracja sześciu
// nazwanych kopii to **D6=W2 / OG-5** — tu leży wyłącznie predykat podstawowy plus resolver
// właściciela instancji, bez którego bramek OG-3 nie dałoby się napisać.
//
// ⚠ MIEJSCE JEST CZĘŚCIĄ DECYZJI, NIE PRZYPADKIEM. Kanon NIE MOŻE mieszkać w systemie: dwie
//   istniejące kopie powstały, cytując tę regułę w źródle (`TerritoryService:14-15`,
//   `TransportOrderSystem:552`). Drugi powód jest twardszy — `ColonyManager` konstruuje
//   `BuildingSystem`, więc import w drugą stronę to CYKL. Ten plik nie importuje NICZEGO.
//
// ⚠ `ColonyManager.isPlayerColony` DELEGUJE tutaj — nie ma dwóch definicji ani przez chwilę.

/**
 * Czy kolonia należy do gracza.
 * Kolonie AI mają `ownerEmpireId` = identyfikator imperium; kolonie gracza mają `null`/`undefined`
 * (albo jawnie `'player'`).
 *
 * ⚠ BIERZE OBIEKT, NIE `planetId`. Podanie id po cichu zwraca ZŁĄ odpowiedź (string nie ma
 *   `ownerEmpireId`, więc wyszłoby „gracza"). Wejście po `id` dochodzi w OG-5.
 * ⚠ `isTestEnemy` NIE JEST tu dyskryminatorem — nie jest serializowane, więc po każdym wczytaniu
 *   jest `undefined`, podczas gdy `ownerEmpireId` odtwarza relink.
 */
export function isPlayerColony(colony) {
  return !!colony && (!colony.ownerEmpireId || colony.ownerEmpireId === 'player');
}

/**
 * Kolonia, która POSIADA daną instancję systemu — po TOŻSAMOŚCI referencji.
 *
 * ⚠ DLACZEGO NIE `FactorySystem._getOwnerColony()`: tamten ma fast-path
 *   `if (window.KOSMOS.factorySystem === this) return colony(activePlanetId)`, czyli odpowiada
 *   na pytanie „która kolonia jest AKTYWNA", a nie „która mnie posiada". Wewnątrz bramki
 *   intencji te dwa pytania rozjeżdżają się dokładnie w scenariuszu, który bramka ma łapać.
 *
 * @param {object} system — instancja systemu per-kolonia
 * @param {string} key — pole koloni trzymające ten system (`'buildingSystem'` | `'factorySystem'` | `'civSystem'`)
 * @returns {object|null} kolonia albo `null`, gdy nie da się rozwiązać
 */
export function findOwningColony(system, key) {
  const colMgr = (typeof window !== 'undefined' ? window.KOSMOS?.colonyManager : null);
  if (!system || !colMgr || typeof colMgr.getAllColonies !== 'function') return null;
  for (const col of colMgr.getAllColonies()) {
    if (col && col[key] === system) return col;
  }
  return null;
}

/**
 * Termin własności dla BRAMEK INTENCJI GRACZA (D2=W1, obrona w głąb).
 *
 * ⚠ ZAWODZI OTWARCIE — i to jest WYMÓG, nie ostrożność. Około dwudziestu keeperów przypina GOŁY
 *   system do `window.KOSMOS`, bez koloni w rejestrze i bez `ownerEmpireId` (`pop3_economy`,
 *   `pop2_5c1`, `pop2_5c2`, `pop4_droids`, `energy_brownout_gate`, `factory_production_toggle`,
 *   `crewlock_unemployed_invariant`, …). System, którego właściciela nie da się rozwiązać, MUSI
 *   przepuścić — inaczej termin własności wywraca dwadzieścia niezwiązanych testów.
 *
 * ⚠ WYŁĄCZNIE do bramek INTENCJI. Bramki SYSTEMOWE (`civ:unrest`, `resource:*`, prosperity)
 *   raportują FAKTY o związanej koloni — termin własności byłby tam BŁĘDEM KATEGORII (D2, jawnie
 *   poza zakresem). Nie wolno ich „poprawić przy okazji".
 */
export function systemBelongsToPlayer(system, key) {
  const colony = findOwningColony(system, key);
  if (!colony) return true;            // fail-open — patrz komentarz wyżej
  return isPlayerColony(colony);
}
