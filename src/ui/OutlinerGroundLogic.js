// OutlinerGroundLogic — czysta warstwa listy jednostek naziemnych Outlinera.
//
// PO CO TU, A NIE W UIManagerze: kolektor żył w `UIManager.draw`, a ten plik NIE importuje się
// pod node (wywraca się na `THREE.TextureLoader`) — jedyny defekt, jaki miał, był pinowalny
// wyłącznie źródłowo. Tu jest pinowalny WYKONANIEM. Precedens: `FleetGroupPanelLogic.js`,
// `BottomContextLogic.js`, `ColonyModalLogic.js`.
//
// ⚠ ZMIERZONY DEFEKT, KTÓRY TO ZAMYKA: kolektor iterował WYŁĄCZNIE kolonie gracza
//   (`for (const col of allColonies)`, gdzie `allColonies` to `getAllColonies()` przefiltrowane
//   po `ownerEmpireId`), więc oddział stojący na planecie AI nie trafiał na listę NIGDY.
//   Pojawiał się dopiero po ZDOBYCIU kolonii — czyli w chwili, gdy przestawał być potrzebny.
//   Zmierzone na żywym silniku: dwie żywe jednostki gracza, lista widzi jedną.
//
// ⚠ FILTR `in_cargo` JEST OBOWIĄZKOWY, nie ostrożnościowy. Stary kolektor dostawał go ZA DARMO
//   od `GroundUnitManager.getUnitsOnPlanet:236`. Przejście na `getAllUnits()` go zdejmuje, a
//   jednostka w ładowni ZACHOWUJE `planetId` planety załadunku — bez tego filtra desant lecący
//   w kosmosie renderowałby się jako stojący na powierzchni.

import { isPlayerColony } from '../utils/ColonyOwnership.js';

/**
 * Płaska lista ŻYWYCH jednostek GRACZA na powierzchniach — z KAŻDEGO ciała, nie tylko z kolonii.
 * Kształt wpisu = jednostka + `planetName` (zgodny z tym, co Outliner konsumował dotąd).
 *
 * @param {Array<Object>} allUnits — `GroundUnitManager.getAllUnits()`
 * @param {{getColony?:Function, getBodyName?:Function}} deps
 * @returns {Array<Object>}
 */
export function collectPlayerGroundUnits(allUnits, { getColony, getBodyName } = {}) {
  const out = [];
  for (const u of (allUnits ?? [])) {
    if (!u) continue;
    if (u.owner && u.owner !== 'player') continue;   // wrogów widać na mapie, nie na liście gracza
    if (u.status === 'in_cargo') continue;           // w ładowni statku — nie na powierzchni
    if ((u.hp ?? 0) <= 0) continue;                  // martwi (defensywa)
    out.push({ ...u, planetName: resolveBodyLabel(u.planetId, getColony, getBodyName) });
  }
  return out;
}

/**
 * Własna kolonia → JEJ nazwa (zachowanie sprzed zmiany). Obce ciało → nazwa CIAŁA, nigdy nazwa
 * cudzej kolonii: moje buty na powierzchni nie są biletem do nazwy nadanej przez wroga.
 */
function resolveBodyLabel(planetId, getColony, getBodyName) {
  const col = getColony?.(planetId);
  if (col && isPlayerColony(col) && col.name) return col.name;
  return getBodyName?.(planetId) || planetId;
}

/**
 * Pogrupuj po ciele.
 *
 * ⚠ KOLEJNOŚĆ JEST DECYZJĄ, NIE PRZYPADKIEM: najpierw ciała BEZ mojej kolonii (siły
 *   ekspedycyjne / desant — to one nie mają żadnego innego wejścia i to one wymagają rozkazów),
 *   potem własne kolonie; w obu grupach alfabetycznie, żeby lista nie skakała między klatkami.
 *
 * @param {Array<Object>} units — wynik `collectPlayerGroundUnits`
 * @param {{isOwnBody?:Function}} deps
 * @returns {Array<{planetId:string, planetName:string, units:Array<Object>}>}
 */
export function groupGroundUnitsByBody(units, { isOwnBody } = {}) {
  const map = new Map();
  for (const u of (units ?? [])) {
    if (!u) continue;
    if (!map.has(u.planetId)) {
      map.set(u.planetId, { planetId: u.planetId, planetName: u.planetName ?? u.planetId, units: [] });
    }
    map.get(u.planetId).units.push(u);
  }
  const own = (pid) => (isOwnBody ? !!isOwnBody(pid) : false);
  return [...map.values()].sort((a, b) => (
    own(a.planetId) === own(b.planetId)
      ? String(a.planetName).localeCompare(String(b.planetName))
      : (own(a.planetId) ? 1 : -1)
  ));
}
