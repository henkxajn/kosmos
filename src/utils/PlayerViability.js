// PlayerViability — czy gracz, który stracił wszystkie kolonie, ma jeszcze CZYM odwrócić los.
//
// Podstawa: decyzja **D9 = W3** (`docs/design/AI_CAPTURE_PLAN.md` §D9, podpisana 2026-08-19),
// skorygowana decyzją **D-111 = W1** (`docs/design/PLAYER_VIABILITY_PREDICATE_PLAN.md`, 2026-08-20).
// D5 rozstrzygnęło, że utrata stolicy NIE kończy gry, bo „przegrana jest odwracalna" (D7 z W3:
// LOSING IS RECOVERABLE) — ale to milcząco zakłada, że odwrócenie jest WYKONALNE. D9 dopowiada:
// gra kończy się dopiero wtedy, gdy gracz nie ma kolonii **i** żadna ścieżka powrotu nie istnieje.
//
// ⚠ DWIE ŚCIEŻKI, DWIE RÓŻNE ARYTMETYKI — to jest sedno decyzji, nie szczegół:
//   (a) ODBICIE (desant) wymaga **DWÓCH rzeczy NARAZ**: statku zdolnego do zrzutu ORAZ
//       jakiejkolwiek jednostki naziemnej do przewiezienia. Wymóg właściciela, dosłownie:
//       *„sam transportowiec bez wojska to PUSTY TRANSPORTOWIEC — potencjał bez zdolności"*.
//       Ścieżka jest martwa, gdy brakuje KTÓREGOKOLWIEK z dwóch, nie dopiero obu.
//   (b) REKOLONIZACJA wymaga statku, który ma DZIŚ żywe wyjście kończące się kolonią — patrz niżej.
//
// ⚠ REGUŁY CZYTANIA STANU — z jednym ŚWIADOMYM wyjątkiem, kupionym pomiarem (Finding 111):
//   1. **ISTNIENIE, NIE OSIĄGALNOŚĆ — obowiązuje w gałęzi DESANTU (a).** Po utracie jedynej koloni
//      jednostki gracza stoją na ciele należącym JUŻ do wroga. „Czy da się je zabrać" zależy od walki,
//      orbity i paliwa — jest w praktyce nierozstrzygalne, więc predykat pytający o osiągalność
//      ZGADYWAŁBY. Liczymy to, co da się policzyć: czy jednostka istnieje i żyje.
//      ⚠ Konsekwencja przyjęta świadomie: „statek desantowy + ocalały oddział" wstrzymuje koniec gry
//      nawet wtedy, gdy załadunek jest w praktyce niewykonalny. Zawężenie tej gałęzi = OSOBNY podpis.
//   2. **W gałęzi REKOLONIZACJI (b) reguła 1 była mierzalnie FAŁSZYWA i została ODWRÓCONA.**
//      Poprzednia wersja pytała o sam moduł habitacyjny, więc **dopóki gdziekolwiek stał taki kadłub,
//      `game:over` nie padał NIGDY** — także wtedy, gdy statek był zadokowany albo dryfował i nie mógł
//      zrobić absolutnie nic (start od zera jest ODMAWIANY: `MissionSystem._launchColony`,
//      `_launchFoundOutpost`). Przesłanka, na której stała stara reguła (*„przy ZERZE kolonii
//      `canLaunchColony` przechodzi, a przylot zakłada kolonię"*), okazała się PÓŁPRAWDĄ: bramka
//      przechodzi, **start nie** (Finding 106). Dlatego pytamy o TYP MISJI — patrz oba zbiory niżej.
//   3. **STATEK W LOCIE LICZY SIĘ TAK SAMO** jak zadokowany — i tylko on. Kolonizator w drodze
//      ZMIERZALNIE odbudowuje imperium (misja `colony` przy zerze kolonii: `getPlayerColonies()` 0 → 1,
//      statek skonsumowany); kolonizator zaparkowany nie robi nic i nie ma jak zacząć.
//   4. **JEDNOSTKA W ŁADOWNI LICZY SIĘ TAK SAMO** jak stojąca na powierzchni — „na pokładzie tego
//      statku LUB czekająca do załadowania" (wymóg właściciela). Kolejka rekrutacji przy zerze
//      kolonii jest pusta z konstrukcji (kolejki żyją na koloniach), więc nie ma trzeciego źródła.
//
// ⚠ Ten moduł jest CZYSTY: bez importów systemów, bez `window`, bez EventBus. Kadencja, próg
//   wytrzymania i emisja `game:over` mieszkają w `ColonyManager` — tam, gdzie jest tik i gdzie
//   keeper może to uruchomić. Tu jest wyłącznie odpowiedź „czy JEST czym odwracać".
//   ⚠ `mission` i `_suspendedMission` to POLA STATKU, nie systemy — czytamy je tak samo, jak
//   `modules` czy `isWreck`, więc zawężenie z Findingu 111 NIE dołożyło żadnej zależności.

// ⚠ JEDYNY import: czysty predykat z encji statku (dane + moduły, ZERO systemów). Powielanie
//   reguły „co znaczy kolonizator" dałoby drugie źródło prawdy obok `canColonize` — a to jest
//   dokładnie ta klasa błędu, którą ten slice zamykał dwa razy (`hasLivingDefender`,
//   `holdsDecisiveGround`). `canDropTroops`/`troopCapacity` to POLA statku, więc ich nie liczymy.
import { canColonize } from '../entities/Vessel.js';

/** Kanon „nieostemplowane = gracza" (lustro `ColonyManager.isPlayerColony` / `isEnemyVessel`). */
const isPlayersVessel = (v) => !!v && !v.isWreck && (!v.ownerEmpireId || v.ownerEmpireId === 'player');
const isPlayersUnit   = (u) => !!u && (u.owner ?? 'player') === 'player' && (u.hp ?? u.currentHP ?? 0) > 0;

/**
 * Misje, których SAM PRZYLOT tworzy kolonię gracza — bez ani jednego kliknięcia więcej.
 * ⚠ Celowo BEZ wymogu modułu habitacyjnego: `found_outpost` wozi FRACHTOWIEC, nie kolonizator,
 *   a placówka jest pełnoprawną kolonią gracza (`getPlayerColonies` jej nie odsiewa). Obie trasy
 *   zmierzone wykonaniem przy zerze kolonii: 0 → 1.
 */
const COLONY_OUTLET_MISSIONS = new Set(['colony', 'found_outpost']);

/**
 * Przepływ obcego układu, w którym przycisk „Kolonizuj" jest OSIĄGALNY.
 * `interstellar_jump` (lot i postój po przylocie) → przekierowanie → `exploration` / `foreign_recon`
 * w fazie orbitowania → panel obcego przylotu. ⚠ Wszystkie cztery produkcje typu `exploration` leżą
 * PONIŻEJ przylotu międzygwiezdnego, więc ten zbiór opisuje wyłącznie trasę warpową — a ta wymaga
 * modułu habitacyjnego, bo kolonizuje przez `canColonize`, nie przez przylot.
 */
const FOREIGN_FLOW_MISSIONS = new Set(['interstellar_jump', 'exploration', 'foreign_recon']);

/** Statek, który potrafi ZRZUCIĆ wojsko: moduł `drop_pods` + ładownia `troop_bay_*`. */
export function hasDropCapableShip(vessels) {
  return (vessels ?? []).some(v => isPlayersVessel(v) && v.canDropTroops === true && (v.troopCapacity ?? 0) > 0);
}

/**
 * Jakakolwiek żywa jednostka naziemna gracza — w ładowni albo na powierzchni.
 * ⚠ `status: 'offline'` (nieopłacona) LICZY SIĘ: pytamy o ISTNIENIE, nie o gotowość bojową.
 *   Jednostka bez żołdu wciąż jest wojskiem, które da się załadować, jeśli gracz odzyska budżet.
 */
export function hasTransportableTroops(groundUnits) {
  return (groundUnits ?? []).some(isPlayersUnit);
}

/**
 * Czy ISTNIEJE kadłub zdolny założyć kolonię (sam moduł habitacyjny) — **wyłącznie do DIAGNOSTYKI**.
 * ⚠ To był stary predykat zdolności (`hasColonyCapableShip`) i to jest dokładnie ten test, który
 *   Finding 111 obalił. Zostaje, bo powód „dlaczego nie ma odwrotu" musi rozróżniać dwa różne światy:
 *   *nie ma żadnego kadłuba* vs *kadłub jest, ale zaparkowany*. NIE używać go do decyzji o końcu gry.
 */
export function hasColonyCapableHull(vessels) {
  return (vessels ?? []).some(v => isPlayersVessel(v) && canColonize(v));
}

/** Czy KTÓRYKOLWIEK statek gracza ma DZIŚ żywe wyjście kończące się kolonią (następca zdolności). */
export function hasLiveRecolonizationPath(vessels) {
  return (vessels ?? []).some(v => isPlayersVessel(v) && _hasLiveColonyOutlet(v));
}

/**
 * Serce zawężenia z Findingu 111 — klasyfikacja po TYPIE MISJI, nie po stanie i nie po module.
 *
 * ⚠ DLACZEGO NIE PO `status`/`position.state`: para `status='on_mission'` + `state='orbiting'` opisuje
 *   ZARÓWNO zwiadowcę zaparkowanego na wieczność (zmierzone: `mission=recon` `phase=orbiting_body`
 *   wisi bezterminowo, po 100 latach gry nadal), JAK I statek w obcym układzie z żywym panelem.
 *   Stan ich nie rozróżnia; typ misji rozróżnia.
 * ⚠ DLACZEGO BEZ TERMINU PALIWOWEGO: paliwo jest pobierane Z GÓRY przy starcie
 *   (`VesselManager.dispatchOnMission`), a wykrycie strandingu *„emituje wyłącznie sygnał — niczego
 *   nie blokuje"*. Statek na misji doleci niezależnie od stanu baku, a przekierowanie po warpie
 *   paliwo KLAMPUJE zamiast odmawiać. Termin paliwowy dokładałby fałszywe negatywy.
 * ⚠ DLACZEGO `_suspendedMission` OBOK `mission`, a NIE `??`: rozkaz ruchu PODMIENIA `vessel.mission`
 *   na własną (`move_to_point`), a prawdziwą chowa w `_suspendedMission`. Zapis `mission ?? _suspended`
 *   nigdy nie sięgnąłby po zawieszoną, bo pierwsza jest prawdziwa — zmierzone: kolonizator w misji
 *   `colony`, przerwany rozkazem ruchu, wypadał wtedy jako „brak odwrotu". To jedyny fałszywy negatyw
 *   znaleziony w projekcie tego predykatu i wyszedł dopiero na pomiarze.
 */
function _hasLiveColonyOutlet(vessel) {
  const missionTypes = [vessel.mission?.type, vessel._suspendedMission?.type];
  if (missionTypes.some(mt => !!mt && COLONY_OUTLET_MISSIONS.has(mt))) return true;
  return canColonize(vessel) && missionTypes.some(mt => !!mt && FOREIGN_FLOW_MISSIONS.has(mt));
}

/**
 * Czy gracz ma CZYM odwrócić los.
 * @param {object} snapshot
 * @param {Array}  snapshot.vessels      — wszystkie statki w rejestrze (filtrujemy tu)
 * @param {Array}  snapshot.groundUnits  — wszystkie jednostki naziemne (filtrujemy tu)
 * @returns {{ok:boolean, invasion:{ok:boolean,ship:boolean,troops:boolean},
 *            recolonization:{ok:boolean,ship:boolean,hull:boolean}}}
 */
export function canReverseFate({ vessels = [], groundUnits = [] } = {}) {
  const dropShip = hasDropCapableShip(vessels);
  const troops   = hasTransportableTroops(groundUnits);
  const colRoute = hasLiveRecolonizationPath(vessels);
  const colHull  = hasColonyCapableHull(vessels);       // tylko do powodu (niżej), NIE do decyzji

  const invasion = { ok: dropShip && troops, ship: dropShip, troops };
  const recolonization = { ok: colRoute, ship: colRoute, hull: colHull };
  return { ok: invasion.ok || recolonization.ok, invasion, recolonization };
}

/**
 * Powód „dlaczego nie ma odwrotu" — do Dziennika i do audytu. NIE jest to samo, co `!ok`:
 * gate ma widzieć, KTÓREGO ogniwa zabrakło, inaczej mierzy ciszę.
 * ⚠ `colony_ship_no_route` vs `no_colony_ship` to DWA RÓŻNE ŚWIATY: „kadłub jest, ale zaparkowany"
 *   znaczy, że gracz przegrał mając czym — i to jest informacja, której stary token nie umiał podać.
 */
export function describeNoReversal(state) {
  if (!state || state.ok) return null;
  const missing = [];
  if (!state.invasion.ship)   missing.push('no_drop_ship');
  if (!state.invasion.troops) missing.push('no_ground_troops');
  if (!state.recolonization.ship) {
    missing.push(state.recolonization.hull ? 'colony_ship_no_route' : 'no_colony_ship');
  }
  return missing.join('+');
}
