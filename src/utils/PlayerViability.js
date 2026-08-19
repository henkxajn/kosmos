// PlayerViability — czy gracz, który stracił wszystkie kolonie, ma jeszcze CZYM odwrócić los.
//
// Podstawa: decyzja **D9 = W3** (`docs/design/AI_CAPTURE_PLAN.md` §D9, podpisana 2026-08-19).
// D5 rozstrzygnęło, że utrata stolicy NIE kończy gry, bo „przegrana jest odwracalna" (D7 z W3:
// LOSING IS RECOVERABLE) — ale to milcząco zakłada, że odwrócenie jest WYKONALNE. D9 dopowiada:
// gra kończy się dopiero wtedy, gdy gracz nie ma kolonii **i** żadna ścieżka powrotu nie istnieje.
//
// ⚠ DWIE ŚCIEŻKI, DWIE RÓŻNE ARYTMETYKI — to jest sedno decyzji, nie szczegół:
//   (a) ODBICIE (desant) wymaga **DWÓCH rzeczy NARAZ**: statku zdolnego do zrzutu ORAZ
//       jakiejkolwiek jednostki naziemnej do przewiezienia. Wymóg właściciela, dosłownie:
//       *„sam transportowiec bez wojska to PUSTY TRANSPORTOWIEC — potencjał bez zdolności"*.
//       Ścieżka jest martwa, gdy brakuje KTÓREGOKOLWIEK z dwóch, nie dopiero obu.
//   (b) REKOLONIZACJA wymaga jednej rzeczy: statku z modułem habitacyjnym. To NIE jest domysł —
//       zmierzone (§D9 fakt 1): przy ZERZE kolonii `canLaunchColony` przechodzi, a przylot
//       zakłada kolonię bez kolonii-matki (`getPlayerColonies()` 0 → 1).
//
// ⚠ TRZY REGUŁY CZYTANIA STANU, każda kupiona konkretną pułapką (§D9 „cztery rzeczy"):
//   1. **ISTNIENIE, NIE OSIĄGALNOŚĆ.** Po utracie jedynej kolonii jednostki gracza stoją na ciele
//      należącym JUŻ do wroga. „Czy da się je zabrać" zależy od walki, orbity i paliwa — jest
//      w praktyce nierozstrzygalne, więc predykat pytający o osiągalność ZGADYWAŁBY. Liczymy to,
//      co da się policzyć: czy jednostka istnieje i żyje.
//   2. **STATEK W LOCIE LICZY SIĘ TAK SAMO** jak zadokowany. Inaczej predykat przeczyłby faktowi,
//      na którym stoi cała decyzja: kolonizator w drodze ZMIERZALNIE odbudowuje imperium.
//   3. **JEDNOSTKA W ŁADOWNI LICZY SIĘ TAK SAMO** jak stojąca na powierzchni — „na pokładzie tego
//      statku LUB czekająca do załadowania" (wymóg właściciela). Kolejka rekrutacji przy zerze
//      kolonii jest pusta z konstrukcji (kolejki żyją na koloniach), więc nie ma trzeciego źródła.
//
// ⚠ Ten moduł jest CZYSTY: bez importów systemów, bez `window`, bez EventBus. Kadencja, próg
//   wytrzymania i emisja `game:over` mieszkają w `ColonyManager` — tam, gdzie jest tick i gdzie
//   keeper może to uruchomić. Tu jest wyłącznie odpowiedź „czy JEST czym odwracać".

// ⚠ JEDYNY import: czysty predykat z encji statku (dane + moduły, ZERO systemów). Powielanie
//   reguły „co znaczy kolonizator" dałoby drugie źródło prawdy obok `canColonize` — a to jest
//   dokładnie ta klasa błędu, którą ten slice zamykał dwa razy (`hasLivingDefender`,
//   `holdsDecisiveGround`). `canDropTroops`/`troopCapacity` to POLA statku, więc ich nie liczymy.
import { canColonize } from '../entities/Vessel.js';

/** Kanon „nieostemplowane = gracza" (lustro `ColonyManager.isPlayerColony` / `isEnemyVessel`). */
const isPlayersVessel = (v) => !!v && !v.isWreck && (!v.ownerEmpireId || v.ownerEmpireId === 'player');
const isPlayersUnit   = (u) => !!u && (u.owner ?? 'player') === 'player' && (u.hp ?? u.currentHP ?? 0) > 0;

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

/** Statek zdolny założyć kolonię (moduł habitacyjny) — druga, niezależna ścieżka powrotu. */
export function hasColonyCapableShip(vessels) {
  return (vessels ?? []).some(v => isPlayersVessel(v) && canColonize(v));
}

/**
 * Czy gracz ma CZYM odwrócić los.
 * @param {object} snapshot
 * @param {Array}  snapshot.vessels      — wszystkie statki w rejestrze (filtrujemy tu)
 * @param {Array}  snapshot.groundUnits  — wszystkie jednostki naziemne (filtrujemy tu)
 * @returns {{ok:boolean, invasion:{ok:boolean,ship:boolean,troops:boolean}, recolonization:{ok:boolean,ship:boolean}}}
 */
export function canReverseFate({ vessels = [], groundUnits = [] } = {}) {
  const dropShip = hasDropCapableShip(vessels);
  const troops   = hasTransportableTroops(groundUnits);
  const colShip  = hasColonyCapableShip(vessels);

  const invasion = { ok: dropShip && troops, ship: dropShip, troops };
  const recolonization = { ok: colShip, ship: colShip };
  return { ok: invasion.ok || recolonization.ok, invasion, recolonization };
}

/**
 * Powód „dlaczego nie ma odwrotu" — do Dziennika i do audytu. NIE jest to samo, co `!ok`:
 * gate ma widzieć, KTÓREGO ogniwa zabrakło, inaczej mierzy ciszę.
 */
export function describeNoReversal(state) {
  if (!state || state.ok) return null;
  const missing = [];
  if (!state.invasion.ship)   missing.push('no_drop_ship');
  if (!state.invasion.troops) missing.push('no_ground_troops');
  if (!state.recolonization.ship) missing.push('no_colony_ship');
  return missing.join('+');
}
