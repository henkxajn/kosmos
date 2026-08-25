// RetreatTarget — dobór celu UCIECZKI z bitwy. Plan: docs/design/RETREAT_TARGET_PLAN.md (F-D + F-E).
//
// PO CO TO ISTNIEJE OSOBNO OD `AutoRetreatSystem._findNearestFriendlyPlanet`:
// ta jedna funkcja odpowiadała naraz na DWA różne pytania, i dlatego na żadne nie odpowiadała dobrze.
//   „Gdzie jest moja BAZA?"       — własna kolonia, dok, przepisanie `colonyId`. Filtr własności OK.
//   „Gdzie mogę się SCHRONIĆ?"    — jakiekolwiek ciało, na które da się wejść na orbitę. Filtr
//                                    własności jest tu ODZIEDZICZONY i szkodliwy: uciekinier bez
//                                    własnej koloni w tym układzie nie miał dokąd uciec.
// Do tego selektor NIE MIAŁ TERMINU UKŁADU, a gwiazda każdego układu stoi w (0,0) — więc ciała
// obcych układów leżą w tej samej przestrzeni px co własne i wygrywały ranking odległości.
// Rozkaz odpadał potem na bramce `target_other_system` ⇒ ODWRÓT NIE DZIAŁAŁ DLA NIKOGO
// (zmierzone na żywo trzy razy, także dla gracza z kolonią w tym samym układzie — Finding F-D).
//
// Ten moduł odpowiada WYŁĄCZNIE na drugie pytanie. Pierwsze zostaje tam, gdzie było.
//
// ⚠ WŁASNOŚĆ JEST KOLEJNOŚCIĄ PREFERENCJI, NIE FILTREM (D-FDb). Zbiór kandydatów nie jest przez
//   nią zawężany — jest przez nią PORZĄDKOWANY. Dzięki temu zdanie „czy jest przyjazna planeta
//   w tym układzie" znika z mechaniki (zostaje „czy jest jakiekolwiek ciało"), a jednocześnie
//   statek nie parkuje nad cudzą kolonią, gdy ma dokąd pójść. To nie jest kosmetyka: wrogi statek
//   z `dockedAt` na ciele gracza blokuje pulę surowców SAMYM FAKTEM zadokowania
//   (`SystemPoolService._hostileWarshipInOrbit`) i dolicza się do następnej fali uderzenia
//   (`EnemyAttackHandler._resolveBatchedBattle` zbiera KAŻDY wrogi orbiter, niezależnie od misji).
//
// ⚠ DRABINA JEST BEZWZGLĘDNA — dowolne ciało niższego tieru bije dowolne ciało wyższego, a
//   odległość porządkuje dopiero WEWNĄTRZ tieru. To świadome: rozkaz odwrotu leci z
//   `bypassFuelCheck`, a paliwo jest pobierane PRZY WYDANIU (`MovementOrderSystem:765-767`) —
//   więc statek doleci wszędzie, ale z bakiem na zerze. Tankowanie wymaga `state === 'docked'`
//   ORAZ kolonii/stacji pod spodem (`VesselManager:1929,1945`), a przylot daje `orbiting`.
//   Maksymalizujemy więc szansę wylądowania tam, gdzie gracz MOŻE zatankować ręcznie — inaczej
//   produkujemy limbo klasy Finding 111/125 (kadłub żyje, nic nie może).
//
// ⚠ SZCZEBEL „wektor ucieczki" (`escapeVector`) JEST W PRAKTYCE NIEOSIĄGALNY. Pomiar na 12
//   wygenerowanych układach (38-57 ciał każdy, 7200 próbek) pokazał, że bąbel clearance NIE
//   OPRÓŻNIŁ zbioru ANI RAZU. Zostaje jako backstop poprawnościowy — i dlatego keeper pinuje go
//   na układzie ZDEGENEROWANYM, inaczej mierzyłby ciszę.

import EntityManager      from '../core/EntityManager.js';
import { DistanceUtils }  from './DistanceUtils.js';
import { systemIdOf }     from './SystemScope.js';
import { hasSpaceportAt } from './SpaceportCheck.js';
import { GAME_CONFIG }    from '../config/GameConfig.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

/** Typy ciał, na które da się wejść na orbitę. Gwiazda NIE jest kandydatem (strefa wykluczenia). */
export const SHELTER_BODY_TYPES = ['planet', 'moon', 'planetoid'];

/** Strefa wykluczenia Słońca — lustro `MovementOrderSystem:31`; niżej rozkaz = `unreachable_target`. */
export const SUN_EXCLUSION_AU = 0.3;

/** Rangi drabiny (D-FDb + D-FDg). Niższa liczba wygrywa BEZWZGLĘDNIE. */
export const SHELTER_TIER = Object.freeze({
  OWN_WITH_PORT: 0,   // własna kolonia z portem — jedyny tier, na którym da się zatankować
  OWN:           1,   // własna kolonia bez portu
  NEUTRAL:       2,   // niczyje
  FOREIGN:       3,   // kolonia obcego właściciela — ostatni
});

/** Właściciel statku w tej samej konwencji, w jakiej zapisane są kolonie. */
function ownerOf(vessel) {
  return vessel?.ownerEmpireId ?? vessel?.owner ?? 'player';
}

function colonyOwnerOf(colony) {
  return colony?.ownerEmpireId ?? 'player';
}

/**
 * Ciała, na które statek MOŻE wejść na orbitę w SWOIM układzie.
 * Termin układu przez `systemIdOf` (fail-open jak `SystemScope`), NIE przez
 * `EntityManager.getByTypeInSystem` — ta ostatnia jest fail-CLOSED i wycięłaby stare encje
 * bez pola `systemId`.
 *
 * @param {object} vessel
 * @returns {object[]}
 */
export function bodiesInSystemOf(vessel) {
  if (!vessel) return [];
  const sys = systemIdOf(vessel);
  const out = [];
  for (const e of EntityManager.getAll()) {
    if (!SHELTER_BODY_TYPES.includes(e?.type)) continue;
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
    // `sys == null` ⇒ statek w tranzycie międzygwiezdnym: nie ma „tutaj", zbiór pusty.
    if (sys == null) return [];
    if (systemIdOf(e) !== sys) continue;
    // Strefa wykluczenia Słońca — kandydat, którego rozkaz i tak by nie przyjął.
    if (Math.hypot(e.x, e.y) / AU_TO_PX < SUN_EXCLUSION_AU) continue;
    out.push(e);
  }
  return out;
}

/**
 * Ranga ciała dla danego właściciela (D-FDb + D-FDg).
 * @returns {{ tier: number, foreignAnchor: boolean }}
 */
function rankBody(body, ownerId, colonyManager) {
  const colony = colonyManager?.getColony?.(body.id) ?? null;
  if (!colony) return { tier: SHELTER_TIER.NEUTRAL, foreignAnchor: false };
  if (colonyOwnerOf(colony) !== ownerId) return { tier: SHELTER_TIER.FOREIGN, foreignAnchor: true };
  // Własna kolonia — port decyduje, czy statek zdoła się tam podnieść po pustym baku.
  return { tier: hasSpaceportAt(body.id) ? SHELTER_TIER.OWN_WITH_PORT : SHELTER_TIER.OWN,
           foreignAnchor: false };
}

/**
 * NAJBLIŻSZE SCHRONIENIE — cel ucieczki z bitwy.
 *
 * @param {object} vessel
 * @param {object} [opts]
 * @param {{x:number,y:number}} [opts.avoidPoint] — punkt starcia; ciała bliżej niż `clearanceAU`
 *        są ODRZUCANE. Bez tego statek „uciekał" na orbitę ciała, o które właśnie walczył: zostawał
 *        w zasięgu broni, wpadał w ponowne zwarcie po cooldownie, a `DeepSpaceCombatSystem`
 *        przestawał go liczyć jako wycofanego (`dockedAt != null`).
 * @param {number} [opts.clearanceAU=COMBAT_DISENGAGE_AU] — promień bąbla.
 * @param {object} [opts.colonyManager] — domyślnie `window.KOSMOS.colonyManager`.
 * @returns {{ body: object, distanceAU: number, tier: number, foreignAnchor: boolean } | null}
 */
export function nearestShelter(vessel, opts = {}) {
  if (!vessel?.position) return null;
  const colonyManager = opts.colonyManager ?? window.KOSMOS?.colonyManager ?? null;
  const clearanceAU = typeof opts.clearanceAU === 'number'
    ? opts.clearanceAU : GAME_CONFIG.COMBAT_DISENGAGE_AU;
  const avoid = opts.avoidPoint ?? null;
  const ownerId = ownerOf(vessel);

  const from = { x: vessel.position.x, y: vessel.position.y };
  let best = null;

  for (const body of bodiesInSystemOf(vessel)) {
    if (avoid && DistanceUtils.euclideanAU(avoid, body) < clearanceAU) continue;
    const { tier, foreignAnchor } = rankBody(body, ownerId, colonyManager);
    const distanceAU = DistanceUtils.euclideanAU(from, body);
    // Drabina BEZWZGLĘDNA: tier rozstrzyga pierwszy, odległość dopiero wewnątrz tieru.
    if (best === null || tier < best.tier || (tier === best.tier && distanceAU < best.distanceAU)) {
      best = { body, distanceAU, tier, foreignAnchor };
    }
  }
  return best;
}

/**
 * NAJBLIŻSZA WŁASNA kolonia W TYM UKŁADZIE — cel POWROTU (dryf, F-E).
 * ⚠ Tu własność jest FILTREM, nie preferencją, i to jest różnica względem `nearestShelter`:
 *   dryf znaczy „wróć do siebie", nie „schowaj się gdziekolwiek". Jedyną zmianą wobec starego
 *   `_findNearestFriendlyPlanetForDrift` jest TERMIN UKŁADU.
 * Zwrotka celowo w kształcie `{ colony, planet, distanceAU }` — lustro starej funkcji, żeby
 * konsument nie musiał się zmieniać.
 *
 * @param {object} vessel
 * @param {object} [colonyManager] — domyślnie `window.KOSMOS.colonyManager`
 * @returns {{ colony: object, planet: object, distanceAU: number } | null}
 */
export function nearestOwnColonyBodyInSystem(vessel, colonyManager) {
  if (!vessel?.position) return null;
  const mgr = colonyManager ?? window.KOSMOS?.colonyManager ?? null;
  if (!mgr?.getAllColonies) return null;
  const ownerId = ownerOf(vessel);
  const sys = systemIdOf(vessel);
  if (sys == null) return null;

  const all = mgr.getAllColonies().filter(c => {
    if (colonyOwnerOf(c) !== ownerId) return false;
    const planet = EntityManager.get(c.planetId);
    return !!planet && systemIdOf(planet) === sys;
  });
  if (all.length === 0) return null;

  // Preferencja pełnych kolonii nad placówkami — zachowana ze starej funkcji.
  const full = all.filter(c => !c.isOutpost);
  const candidates = full.length > 0 ? full : all;

  const from = { x: vessel.position.x, y: vessel.position.y };
  let best = null;
  for (const c of candidates) {
    const planet = EntityManager.get(c.planetId);
    if (!planet) continue;
    const d = DistanceUtils.euclideanAU(from, planet);
    if (best === null || d < best.distanceAU) best = { colony: c, planet, distanceAU: d };
  }
  return best;
}

/**
 * WEKTOR UCIECZKI — szczebel 2 drabiny (D-FDe): pusty punkt poza promieniem starcia, w kierunku
 * OD punktu starcia, wyprowadzony poza strefę Słońca.
 *
 * ⚠ Statek dolatuje tu i DRYFUJE (`dockedAt = null`) — nie orbituje niczego. To jest świadome:
 *   lepiej stać w pustce z żywym kadłubem niż zostać wrakiem za geometrię układu.
 *
 * @param {object} vessel
 * @param {{x:number,y:number}} avoidPoint
 * @param {number} [minAU]
 * @returns {{ x:number, y:number } | null}
 */
export function escapeVector(vessel, avoidPoint, minAU) {
  if (!vessel?.position || !avoidPoint) return null;
  const radiusPx = (typeof minAU === 'number' ? minAU : GAME_CONFIG.COMBAT_DISENGAGE_AU) * AU_TO_PX;
  // Margines 20 % — bąbel liczy się od punktu starcia, a statek ma tam DOLECIEĆ, nie musnąć granicę.
  const r = radiusPx * 1.2;

  let dx = vessel.position.x - avoidPoint.x;
  let dy = vessel.position.y - avoidPoint.y;
  let len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    // Statek stoi dokładnie w punkcie starcia — uciekaj OD gwiazdy (deterministycznie, bez losowania).
    dx = avoidPoint.x; dy = avoidPoint.y; len = Math.hypot(dx, dy);
    if (len < 1e-6) { dx = 1; dy = 0; len = 1; }
  }
  let px = avoidPoint.x + (dx / len) * r;
  let py = avoidPoint.y + (dy / len) * r;

  // Wyprowadzenie poza strefę Słońca — inaczej `MovementOrderSystem` odrzuci `unreachable_target`.
  const sunPx = SUN_EXCLUSION_AU * AU_TO_PX;
  const dSun = Math.hypot(px, py);
  if (dSun < sunPx * 1.1) {
    const ux = dSun < 1e-6 ? 1 : px / dSun;
    const uy = dSun < 1e-6 ? 0 : py / dSun;
    px = ux * sunPx * 1.1;
    py = uy * sunPx * 1.1;
    // Po wypchnięciu punkt mógł wrócić do bąbla — wtedy szczebel 2 nie ma rozwiązania.
    if (Math.hypot(px - avoidPoint.x, py - avoidPoint.y) < radiusPx) return null;
  }
  return { x: px, y: py };
}
