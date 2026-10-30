// AKCJE OBCE NA ORBICIE CIAŁA — JEDEN predykat dla panelu statku (HUD), panelu rejestru i końca gry
// (Finding 578, decyzje właściciela D-1 / D-2 (A1) / D-3, 2026-10-29).
//
// PO CO TO ISTNIEJE: „akcje obce" (Recon ciała, Recon układu, Kolonizuj, Rozładuj) wisiały na KSZTAŁCIE MISJI
// `exploration` + `orbiting_body`, którą produkuje wyłącznie `VesselManager._redirectInterstellarVessel`, a jego
// jedynym żywym producentem od 253 f-A (`5264a4b`) jest wiersz zakładki Atlas. Naturalna droga do ciała po skoku
// warp — PPM „Lecisz do planety" albo rozkaz ruchu d2 — kończy się `orbiting` + `idle` + `mission = null` i tam
// żadna powierzchnia nie oferowała ani kolonizacji, ani skanu (ZMIERZONE: sonda `probe-post-warp-actions`).
// Oba zamienniki, na które powoływał się 253 (klik ciała na mapie taktycznej, lista ciał po przylocie), były
// w chwili cięcia martwe — dlatego akcje obce kluczujemy PREDYKATEM, nigdy kształtem misji.
//
// KSZTAŁT (D-1) — predykat, NADZBIÓR dzisiejszego warunku:
//   (a) stan C — misja `exploration` / `orbiting_body` (trasa Atlas): DOKŁADNIE jak dziś; ciało = `mission.targetId`.
//       ⚠ Jedyny dopisek: recon CAŁEGO układu (`_tickForeignRecon`) wraca do tego kształtu BEZ `targetId`
//       (rekord misji ma `targets[]`), więc panel działał wtedy na `undefined`. Ciało = `position.dockedAt`,
//       bo tam statek właśnie stoi (zmierzone — keeper, grupa D1-C).
//   (b) stan B — statek gracza, w służbie, `orbiting` przy CIELE niebieskim swojego układu, `idle`, `mission = null`,
//       a układ leży POZA śladem kolonii gracza (D-2). Tylko wtedy akcje obce stają obok rozkazów normalnych.
// D-2 (A1) — ślad liczony PER STATEK: układ jest „u siebie", gdy TEN statek może w nim zadokować przy kolonii
//   gracza — kolonia (także placówka) w tym układzie ORAZ (statek mały ALBO port na jej ciele). Istniejące
//   kanony: `needsSpaceportForVessel` + `hasSpaceportAt`. Zmierzone przed kodem (`probe-foreign-footprint-d2`):
//   pełna kolonia + kadłub średni ⇒ dok i normalny start działają; sama placówka + średni ⇒ nie zadokuje
//   (normalnej ścieżki NIE MA — akcje obce zostają); placówka + mały ⇒ dokuje (normalna ścieżka jest).
//   ⚠ Stacje NIE liczą się do śladu (A1 mówi o kolonii) — świadome, nie przeoczone.
// D-3 — ten sam predykat rozstrzyga w `PlayerViability`, czy bezczynny kolonizator na orbicie to żywa trasa.
//
// ⚠ Kontekst jest WSTRZYKIWANY: `getBody`, `getColony`, `playerColonies`, `hasSpaceportAt`. Sam predykat nie czyta
//   `window`, więc `PlayerViability` zostaje czysty, a keeper karmi go atrapą. Kontekst gry składa
//   `foreignActionsContext(K)` — JEDYNE miejsce tego modułu, które zna systemy. Brak `playerColonies` w kontekście
//   = brak kolonii (tak jest zawsze tam, gdzie pyta koniec gry).

import { isEnemyVessel, isInService } from '../entities/Vessel.js';
import { systemIdOf } from './SystemScope.js';
import { needsSpaceportForVessel, hasSpaceportAt } from './SpaceportCheck.js';
import EntityManager from '../core/EntityManager.js';

/** Typy ciał, przy których statek może stać w stanie B (stacja nie jest ciałem — gwiazda też nie). */
const ORBITABLE_BODY_TYPES = new Set(['planet', 'moon', 'planetoid']);

/**
 * Reguła typu ciała dla „Kolonizuj" w obcym układzie — wcześniej dwie kopie (HUD i rejestr), teraz jedna.
 * @param {object|null} body
 * @returns {boolean}
 */
export function isForeignColonizeType(body) {
  return !!body && (['rocky', 'ice'].includes(body.planetType) || body.type === 'planetoid');
}

/**
 * D-2 (A1): czy TEN statek może zadokować przy kolonii gracza w danym układzie.
 * @param {object} vessel
 * @param {string|null} systemId
 * @param {object} ctx — `{ playerColonies(), hasSpaceportAt(bodyId) }`
 * @returns {boolean}
 */
export function inColonyFootprint(vessel, systemId, ctx) {
  if (systemId == null) return false;
  const needsPort = needsSpaceportForVessel(vessel);
  for (const colony of ctx?.playerColonies?.() ?? []) {
    if (systemIdOf(colony) !== systemId) continue;
    if (!needsPort || ctx.hasSpaceportAt?.(colony.planetId) === true) return true;
  }
  return false;
}

/**
 * Ciało, przy którym statek ma DZIŚ akcje obce — albo `null`.
 * @param {object} vessel
 * @param {object} ctx — `{ getBody(id), playerColonies(), hasSpaceportAt(bodyId) }`
 * @returns {string|null}
 */
export function foreignActionsBodyId(vessel, ctx) {
  if (!vessel) return null;
  const mission = vessel.mission;
  // (a) stan C — dzisiejszy warunek, bez nowych terminów.
  if (mission?.type === 'exploration' && mission.phase === 'orbiting_body') {
    return mission.targetId ?? vessel.position?.dockedAt ?? null;
  }
  // (b) stan B.
  if (mission != null || vessel.status !== 'idle') return null;
  if (vessel.isWreck || isEnemyVessel(vessel) || !isInService(vessel)) return null;
  const pos = vessel.position;
  if (pos?.state !== 'orbiting' || !pos.dockedAt) return null;
  const body = ctx?.getBody?.(pos.dockedAt) ?? null;
  if (!body || !ORBITABLE_BODY_TYPES.has(body.type)) return null;
  const systemId = systemIdOf(vessel);
  if (systemId == null || systemIdOf(body) !== systemId) return null;
  if (inColonyFootprint(vessel, systemId, ctx)) return null;
  return body.id;
}

/** @returns {boolean} */
export function foreignActionsAvailable(vessel, ctx) {
  return foreignActionsBodyId(vessel, ctx) != null;
}

/**
 * Kontekst predykatu złożony z systemów gry (`window.KOSMOS` albo jego atrapa w keeperze).
 * ⚠ Bez menedżera kolonii śladu nie da się policzyć ⇒ `null` ⇒ stan B zamknięty (fail-closed); stan C działa dalej.
 * @param {object} K
 * @returns {object|null}
 */
export function foreignActionsContext(K) {
  const colonyManager = K?.colonyManager ?? null;
  if (!colonyManager) return null;
  return {
    getBody:        (id) => (id ? EntityManager.get(id) ?? null : null),
    getColony:      (id) => colonyManager.getColony?.(id) ?? null,
    playerColonies: () => colonyManager.getPlayerColonies?.() ?? [],
    hasSpaceportAt: (bodyId) => hasSpaceportAt(bodyId),
  };
}
