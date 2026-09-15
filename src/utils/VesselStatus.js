// KANON „STATUS FIZYCZNY STATKU" — jedno źródło prawdy dla ETYKIETY stanu statku w UI.
//
// Powstało przy zamykaniu Findingu 266 (`docs/design/VESSEL_ORDERS_PLAN.md`, decyzje D-266a…d):
// sześć powierzchni (panel grupy, panel dowodzenia, rejestr K3, Dok taktyczny, plakietki mapy,
// Outliner) DOMYŚLNIE nazywało stan nierozpoznany „Docked" (`?? 'docked'` ×3 w logice,
// `?? 'fleetGroup.statusDocked'` ×2 w widoku, `?? byState.docked` ×1 w kubełkowaniu), a cztery
// inne łańcuchy zgadywały INNE słowo dla tego samego nieznanego („In flight" w Command, „Idle"
// w K3, „Bezczynny" w tooltipie 3D, cisza w NavPeek). Kanon zastępuje zgadywanie jednym,
// zamkniętym zbiorem tokenów i jednym predykatem.
//
// ⚠ SILNIK PRODUKUJE DOKŁADNIE TRZY TOKENY `position.state`: 'docked' | 'in_transit' | 'orbiting'
//   (48 pisarzy literałów w `src/`, fabryka `Vessel.js:158`; pin ŹRÓDŁOWY: keeper
//   `vessel_status_label_smoke` T0 — czwarty token w silniku zapala go GŁOŚNO). Wszystkie trzy
//   ścieżki piszące 'docked' ustawiają `dockedAt` w tym samym statemencie, więc
//   docked ⇒ dockedAt ≠ null Z KONSTRUKCJI. Stan `undefined`/nieznany jest osiągalny WYŁĄCZNIE
//   z zapisu bez pola (`VesselManager.restore` robi `{ ...vd.position }` → `{}`, bez leczenia)
//   albo z przyszłego czwartego tokena — dlatego fallback jest FAIL-CLOSED ('unknown'), nie zgadywany.
//
// ⚠ 'orbiting' JEST PRZECIĄŻONE i to jest jedyny OSIĄGALNY dziś defekt etykiety: orbita CIAŁA
//   (dockedAt = id ciała) ALBO swobodny dryf w przestrzeni (dockedAt = null — po engage
//   `MOS:1264`, po locie w pusty punkt `MOS:1637`, po przylocie międzygwiezdnym na obrzeże
//   `VesselManager:2818`, po odwrocie wektorem, po `ReturnJump`, po zamrożeniu DSCS/VCS).
//   Bez rozszczepienia panel pisał „Orbiting" niczego, a Command „Orbit: ???". Kanon daje
//   temu kształtowi WŁASNE słowo ('in_space', D-266b).
//
// ⚠ TEN PLIK NIE IMPORTUJE NICZEGO (wzór `ColonyOwnership.js` / `SystemExploration.js`).
//   Klucze i18n są tu STRINGAMI — tłumaczy widok przez `t()`; moduł nie zna języka.
//
// ⚠ KANON OPISUJE STATUS FIZYCZNY, NIC WIĘCEJ. Wrak (`isWreck`) to OSOBNA oś i konsumenci
//   rozstrzygają ją PRZED pytaniem o status (FleetPictureLogic, Outliner). Misja, rozkaz,
//   paliwo, obsada — osobne osie, osobne słowniki.
//
// ⚠ TYLKO DLA ETYKIET. Promień rażenia ZMIERZONY przy podpisie D-266c: żadna logika gry nie czyta
//   etykiety. To, co DECYDUJE (`countActionable`, `manualRefuel`, `undockToOrbit`, stożek wydechu
//   w `ThreeRenderer`, `VesselManager`), czyta SUROWY `position.state` i ma to robić dalej —
//   token 'in_space' NIE jest stanem silnika i nie wolno go zapisać do `position.state`.

/** Zamknięty zbiór tokenów kanonu (kolejność = kolejność wyświetlania w listach grupowanych). */
export const VESSEL_STATUS_TOKENS = Object.freeze(['in_transit', 'orbiting', 'in_space', 'docked', 'unknown']);

/** Trzy tokeny, które produkuje SILNIK w `position.state` (pinowane źródłowo w keeperze T0). */
export const ENGINE_POSITION_STATES = Object.freeze(['docked', 'in_transit', 'orbiting']);

/**
 * Klucze i18n rodziny panelowej (`fleetGroup.status*`) — trzy istniejące + DWA nowe (D-266a/b).
 * Rejestr K3 trzyma dla trzech stanów silnika własne klucze (`fleetPicture.state.*`), a dwa nowe
 * słowa DZIELI z tą rodziną — celowo: podpis „dokładnie dwie nowe pary", te same słowa.
 */
export const VESSEL_STATUS_LABEL_KEYS = Object.freeze({
  docked:     'fleetGroup.statusDocked',
  in_transit: 'fleetGroup.statusTransit',
  orbiting:   'fleetGroup.statusOrbiting',
  in_space:   'fleetGroup.statusInSpace',
  unknown:    'fleetGroup.statusUnknown',
});

/**
 * Status fizyczny statku dla warstwy wyświetlania.
 * @param {object|null|undefined} vessel — encja statku (czytane: `position.state`, `position.dockedAt`)
 * @returns {{ token: ('docked'|'orbiting'|'in_space'|'in_transit'|'unknown'), bodyId: (string|null) }}
 *   `bodyId` = ciało doku/orbity dla 'docked'/'orbiting', inaczej `null`.
 */
export function resolveVesselStatus(vessel) {
  const pos = vessel?.position;
  if (!pos || typeof pos !== 'object') return { token: 'unknown', bodyId: null };
  const state = pos.state;
  const bodyId = pos.dockedAt ?? null;
  if (state === 'in_transit') return { token: 'in_transit', bodyId: null };
  if (state === 'orbiting')   return bodyId ? { token: 'orbiting', bodyId } : { token: 'in_space', bodyId: null };
  // docked bez dockedAt jest niemożliwe z konstrukcji (trzej pisarze) — gdyby się pojawiło,
  // to zepsuty rekord, a nie dok: nie zgadujemy.
  if (state === 'docked')     return bodyId ? { token: 'docked', bodyId } : { token: 'unknown', bodyId: null };
  return { token: 'unknown', bodyId: null };
}

/** Czy `x` jest tokenem kanonu (do walidacji wejść widoków, nie do zgadywania). */
export function isVesselStatusToken(x) {
  return VESSEL_STATUS_TOKENS.includes(x);
}

/**
 * Klucz i18n etykiety dla tokena — fail-CLOSED: token spoza zbioru dostaje klucz „Unknown",
 * nigdy „Docked". (Jedyny dozwolony fallback w całej rodzinie konsumentów.)
 */
export function vesselStatusLabelKey(token) {
  return VESSEL_STATUS_LABEL_KEYS[token] ?? VESSEL_STATUS_LABEL_KEYS.unknown;
}
