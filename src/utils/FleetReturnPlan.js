// PLAN POWROTU FLOTY — cel PER CZŁONEK (Finding 272, opcja A właściciela, decyzje D-272-1…9).
//
// PO CO TO ISTNIEJE: „Powrót do bazy" floty (FMO `_handleFleetReturnBase` / FCP `_fleetReturn`) dobierał
// JEDEN cel — najbliższą własną kolonię PIERWSZEGO żywego członka (reprezentanta) — i podawał go jako goły
// punkt WSZYSTKIM. Współrzędne są LOKALNE dla układu (gwiazda każdego układu stoi w (0,0)), więc członek
// z INNEGO układu leciał do bezsensownych współrzędnych we własnej ramce, po czym `_maybeAutoDockOnReturn`
// (termin układu, Finding 263) odmawiał doku i statek DRYFOWAŁ — bezgłośnie, bo MOS ten rozkaz PRZYJMUJE
// (ZMIERZONE, sondy M1/M2/M4 audytu 272). Reprezentant w tranzycie warp abortował całą flotę (M5).
//
// KSZTAŁT: każdy członek dostaje WŁASNY cel = najbliższa WŁASNA kolonia w JEGO układzie (ten sam resolver,
// którym Finding 154 naprawiło oba producenty — `nearestOwnColonyBodyInSystem`, wołany N razy zamiast raz).
// Członek bez celu jest ODMAWIANY GŁOŚNO, z nazwanym powodem, a nie wysyłany w cudzą ramkę:
//   • D-272-2 (a) — tranzyt warp: `systemIdOf(v) === null` (inwariant Findingu 147: `null` WYŁĄCZNIE
//     w prawdziwym `warp_transit`) ⇒ `vessel_in_warp_transit` — ten sam powód, który daje bramka MOS;
//   • D-272-1 (a) — brak własnej kolonii w JEGO układzie ⇒ `no_friendly_planet`.
//     ⚠ KOREKTA PODPISU PO POMIARZE: pierwotny podpis mówił „fallback = cel reprezentanta (jak dziś)".
//     Zmierzone (M4): resolver zwraca null członkowi w dokładnie dwóch stanach — tranzyt warp (MOS i tak
//     odmawia) albo układ BEZ kolonii gracza — a wtedy cel reprezentanta leży z definicji w INNEJ ramce
//     (gdyby był w tej samej, resolver by go znalazł). „Fallback" był więc zbiorem PUSTYM realnych celów
//     i dokładnie dzisiejszym defektem pod inną nazwą. Głośna odmowa zamiast lotu w pustkę.
//   • D-272-3 — reprezentant = PIERWSZY członek (w kolejności floty), DLA KTÓREGO resolver zwrócił cel;
//     jeden członek w warpie nie abortuje floty. Jego cel trafia do `activeOrder.targetPoint` — pole
//     INFORMACYJNE (zero czytelników poza FleetSystem, grep 2026-09-18); źródłem prawdy per członek są
//     `memberTargets`.
//   • D-272-6 — cel JAWNY: `targetBodyId` + `targetPoint` (+ `targetName` dla linii Dziennika, Finding 281
//     domknięty dla Powrotu za darmo). Precedens D-FDi (`resolveShelterOrderSpec`). Bramka MOS
//     `target_other_system` staje się obroną w głąb, nie ścieżką główną.
//
// KONTRAKT: dla KAŻDEGO żywego (nie-wraka) członka z wejścia plan ma DOKŁADNIE JEDEN wpis — w `memberTargets`
// ALBO w `memberRefusals`. `FleetSystem.issueFleetOrder` na tym polega (nie ma własnej gałęzi obronnej —
// zero nowych powodów/kluczy); pilnuje tego keeper `fleet_return_per_member_smoke` (T9). Wraki pomijamy:
// odrzuca je sam `issueFleetOrder` (`wrecked`), tak jak dotąd.
//
// ⚠ TEN PLIK NIE ZNA `window` ani `EventBus` — czysty, testowalny pod node (wzór `CameraFrame.js`).

import { nearestOwnColonyBodyInSystem } from './RetreatTarget.js';
import { systemIdOf } from './SystemScope.js';

/** Powody odmowy per członek (istniejące klucze `vessel.reason<PascalCase>` — zero nowych). */
export const RETURN_REFUSAL = Object.freeze({
  WARP_TRANSIT:       'vessel_in_warp_transit',
  NO_FRIENDLY_PLANET: 'no_friendly_planet',
});

/**
 * Buduje plan Powrotu floty — cel per członek.
 * @param {object[]} members       — żywe encje statków W KOLEJNOŚCI floty (`fleet.memberIds`)
 * @param {object}   colonyManager — `ColonyManager` (albo jego stub w testach)
 * @returns {{
 *   memberTargets:  Object<string, { targetBodyId: string, targetPoint: {x:number,y:number}, targetName: string|null }>,
 *   memberRefusals: Object<string, string>,
 *   representative: { vesselId: string, targetBodyId: string, targetPoint: {x:number,y:number} } | null
 * }}
 */
export function buildFleetReturnPlan(members, colonyManager) {
  const memberTargets  = {};
  const memberRefusals = {};
  let representative = null;

  for (const v of (Array.isArray(members) ? members : [])) {
    if (!v || v.isWreck) continue;                              // wraki odrzuca issueFleetOrder (`wrecked`)
    if (systemIdOf(v) === null) {                               // D-272-2 (a): tranzyt warp
      memberRefusals[v.id] = RETURN_REFUSAL.WARP_TRANSIT;
      continue;
    }
    const own = nearestOwnColonyBodyInSystem(v, colonyManager);
    if (!own?.planet) {                                         // D-272-1 (a): brak własnej kolonii w JEGO układzie
      memberRefusals[v.id] = RETURN_REFUSAL.NO_FRIENDLY_PLANET;
      continue;
    }
    const planet = own.planet;
    const targetPoint = { x: planet.x ?? planet.position?.x ?? 0, y: planet.y ?? planet.position?.y ?? 0 };
    memberTargets[v.id] = { targetBodyId: planet.id, targetPoint, targetName: planet.name ?? null };
    if (!representative) representative = { vesselId: v.id, targetBodyId: planet.id, targetPoint };   // D-272-3
  }

  return { memberTargets, memberRefusals, representative };
}
