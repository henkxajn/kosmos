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
 * ⚠ BIERZE OBIEKT, NIE `planetId` — I TO JEST WYMUSZONE, NIE TYLKO OPISANE. Sam warunek
 *   `!!c && !c.ownerEmpireId` PRZEPUSZCZAŁ STRING: `'p_ai'.ownerEmpireId` to `undefined`, więc
 *   podanie identyfikatora po cichu zwracało „kolonia gracza" dla DOWOLNEGO id — dokładnie ta
 *   pułapka, przed którą ostrzegał census D6 (ograniczenie 2), i przez cztery commity opisana
 *   w komentarzu zamiast egzekwowana. Złapane keeperem E2 w OG-5. Pytanie po identyfikatorze
 *   ma własne wejście: `isPlayerColonyId`.
 * ⚠ `isTestEnemy` NIE JEST tu dyskryminatorem — nie jest serializowane, więc po każdym wczytaniu
 *   jest `undefined`, podczas gdy `ownerEmpireId` odtwarza relink.
 */
export function isPlayerColony(colony) {
  if (!colony || typeof colony !== 'object') return false;
  return !colony.ownerEmpireId || colony.ownerEmpireId === 'player';
}

/**
 * Wejście po `id` — dla konsumentów, którzy mają tylko `planetId` z payloadu zdarzenia.
 *
 * ⚠ FAIL-CLOSED przy braku kolonii: nieistniejące/nieznane `planetId` => `false`. Tak robiły OBA
 *   zmigrowane konsumenty (`RightClickMenuOptions._isPlayerColony`, `EconomyHistoryLog._isPlayer`)
 *   i to jest domyślna właściwa dla pytania „czy to MOJA kolonia".
 * ⚠ `JournalScope.isPlayerColonyEvent` ma ŚWIADOMIE INNĄ domyślną (brak `planetId` => `true`,
 *   bo zdarzenie bez tagu nie ma być wyciszane) — dlatego zostaje osobną funkcją, a nie aliasem.
 */
export function isPlayerColonyId(planetId) {
  if (!planetId) return false;
  const colony = (typeof window !== 'undefined' ? window.KOSMOS?.colonyManager?.getColony?.(planetId) : null);
  return isPlayerColony(colony);
}

/**
 * Własność + ŻYWOTNOŚĆ — „czy ta kolonia ma gdzie trzymać towar".
 *
 * ⚠ TO INNE PYTANIE NIŻ `isPlayerColony` i nie wolno ich uśredniać (D6, ograniczenie 3).
 *   `TransferStore` doklejał `&& !!c.resourceSystem`, bo rozwiązuje magazyn — kolonia gracza bez
 *   magazynu (np. w trakcie odpinania kontekstu, P0 `_detachActiveColony`) jest DALEJ jego
 *   kolonią, tylko nie ma dokąd przelać.
 */
export function isLivePlayerColony(colony) {
  return isPlayerColony(colony) && !!colony.resourceSystem;
}

/**
 * Własność + RODZAJ — „czy gracz może tą kolonią ZARZĄDZAĆ".
 *
 * ⚠ TRZECIE, ODRĘBNE pytanie. `isPreview` to podgląd planety BEZ kolonii, `isOutpost` to placówka
 *   bez POP — obie są „gracza", ale żadna nie ma panelu zarządzania. Żywotność (magazyn) NIE
 *   wchodzi: to osobna oś (patrz `isLivePlayerColony`).
 * ⚠ `isTestEnemy` CELOWO POMINIĘTY. Zmierzone: obaj producenci ustawiają go RAZEM
 *   z `ownerEmpireId` (`SpawnTestEnemy:112-113`, `CombatSandbox:392-393`), a
 *   `captureColonyForPlayer` czyści OBA (`ColonyManager:1004-1005`) ⇒ jest redundantny wobec
 *   własności. Dodatkowo NIE jest serializowany, więc po wczytaniu i tak `undefined` — opieranie
 *   na nim czegokolwiek dawałoby inną odpowiedź przed i po wczytaniu tego samego zapisu.
 */
export function isManageablePlayerColony(colony) {
  return isPlayerColony(colony) && !colony.isPreview && !colony.isOutpost;
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
