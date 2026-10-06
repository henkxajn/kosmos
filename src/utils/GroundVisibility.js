// GroundVisibility — AI GARRISON, Finding 379 (odpowiedź (h) właściciela 2026-10-05): kanon tego, które CUDZE jednostki
// naziemne gracz widzi na ciele.
//
// Reguła (podpis właściciela 2026-10-05): wroga jednostka naziemna jest rysowana, zaznaczalna i wypisywana wyłącznie,
// gdy zachodzi co najmniej jedno:
//   (1) ciało jest kolonią gracza;
//   (2) gracz ma na tym ciele własne jednostki naziemne (żywe, nie w ładowni statku);
//   (3) gracz ma wywiad `detailed` o właścicielu tej jednostki.
// Ciała bez kolonii (np. desant AI na ciele niczyim) obejmują warunki (2) i (3). Własne jednostki — zawsze. Reguła
// stealth bez zmian: ukryta (`_stealthState === 'hidden'`) cudza jednostka — nigdy.
// Karta ciała G3-3 (`GarrisonReadout`) czyta TĘ SAMĄ regułę na poziomie ciała (`foreignGroundUnitsVisible`), więc karta,
// okno zrzutu i mapa kolonii nie mogą się rozjechać.
//
// ⚠ Warunek (1) pyta o PRAWDZIWĄ kolonię z `colonyManager`, nie o obiekt mapy: podgląd ciała bez kolonii
//   (`ColonyOverlay._previewColony`, `isPreview: true`) nie ma `ownerEmpireId`, więc kanon własności uznałby go za
//   kolonię gracza.
// ⚠ FAIL-CLOSED dla wywiadu: bez `IntelSystem` warunek (3) nie zachodzi. Warunki (1) i (2) wywiadu nie potrzebują.
// ⚠ Usługi gry dostaje argumentem (`K`, w grze `window.KOSMOS`) — działa na prawdziwym świecie w keeperze.

import { isPlayerColony } from './ColonyOwnership.js';

/** Poziom wywiadu o imperium, od którego gracz widzi jego jednostki naziemne i zna liczebność garnizonu (D6, G3-3). */
export const GARRISON_READOUT_INTEL = 'detailed';

const isPlayerOwner = (owner) => !owner || owner === 'player';

/**
 * Czy gracz ma na ciele własną żywą jednostkę naziemną (nie w ładowni statku).
 * @param {object} K — usługi gry (w grze `window.KOSMOS`)
 * @param {string} planetId
 * @returns {boolean}
 */
export function playerHasGroundUnitsOn(K, planetId) {
  if (!planetId) return false;
  const units = K?.groundUnitManager?.getUnitsOnPlanet?.(planetId) ?? [];
  return units.some(u => !!u && isPlayerOwner(u.owner) && u.status !== 'in_cargo' && (u.hp ?? 1) > 0);
}

/**
 * Reguła na poziomie CIAŁA: czy gracz widzi jednostki naziemne właściciela `ownerId` na ciele `planetId`.
 * @param {object} K — usługi gry
 * @param {string} planetId
 * @param {string|null|undefined} ownerId — właściciel jednostek (`'player'` / brak = gracz)
 * @returns {boolean}
 */
export function foreignGroundUnitsVisible(K, planetId, ownerId) {
  if (isPlayerOwner(ownerId)) return true;
  if (!planetId) return false;
  if (isPlayerColony(K?.colonyManager?.getColony?.(planetId) ?? null)) return true;          // (1)
  if (playerHasGroundUnitsOn(K, planetId)) return true;                                      // (2)
  return K?.intelSystem?.isAtLeast?.(ownerId, GARRISON_READOUT_INTEL) === true;              // (3), fail-closed
}

/**
 * Czy gracz widzi tę jednostkę (rysowanie, zaznaczanie, wypisywanie).
 * @param {object} K — usługi gry
 * @param {object} unit — jednostka naziemna
 * @returns {boolean}
 */
export function isGroundUnitVisibleToPlayer(K, unit) {
  if (!unit) return false;
  if (isPlayerOwner(unit.owner)) return true;
  if (unit._stealthState === 'hidden') return false;
  return foreignGroundUnitsVisible(K, unit.planetId, unit.owner);
}

/**
 * Jednostki widoczne dla gracza, w kolejności wejścia.
 * @param {object} K — usługi gry
 * @param {object[]} units
 * @returns {object[]}
 */
export function visibleGroundUnits(K, units) {
  return (units ?? []).filter(u => isGroundUnitVisibleToPlayer(K, u));
}

/**
 * Pierwsza WIDOCZNA jednostka na heksie — w kolejności rejestru i z filtrami `GroundUnitManager.getUnitAt`
 * (nie `moving`, nie `in_cargo`); niewidoczna albo ukryta cudza jednostka nie jest zaznaczana.
 * @param {object} K — usługi gry
 * @param {string} planetId
 * @param {number} q
 * @param {number} r
 * @returns {object|null}
 */
export function visibleGroundUnitAt(K, planetId, q, r) {
  for (const u of K?.groundUnitManager?.getUnitsAtHex?.(planetId, q, r) ?? []) {
    if (!u || u.status === 'moving' || u.status === 'in_cargo') continue;
    if (isGroundUnitVisibleToPlayer(K, u)) return u;
  }
  return null;
}
