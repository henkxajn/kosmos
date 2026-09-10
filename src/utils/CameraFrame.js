// CameraFrame — termin „ramka KAMERY vs ramka STATKU" dla rozkazów, których cel pochodzi
// z KLIKNIĘTEGO PUNKTU. Plan/rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §255 (leg D = wiersze
// 1/2, ten slice = wiersze 8/9). Decyzja D-89b: predykat wychodzi z `RightClickMenu` do wspólnego
// modułu, bo od tego slice'u ma TRZECH konsumentów (PPM mapy + dwa pickery flotowe), a trzy kopie
// jednego predykatu to dokładnie ta mina, którą ta ekstrakcja usuwa (reguła „nieutwardzony
// bliźniak", `removeColony:667` / `ReturnJump`).
//
// ── MECHANIZM (klasa „globalne id ≠ położenie") ────────────────────────────────────────────
// Współrzędne są LOKALNE dla układu — gwiazda KAŻDEGO układu stoi w (0,0) — więc goły punkt
// {x,y} NIE NIESIE RAMKI. Klik na mapie 3D jest zawsze w ramce KAMERY (`activeSystemId`),
// a `StarSystemManager.switchActiveSystem:152` NIE czyści zaznaczenia statku ani floty (żaden
// konsument `system:switched` tego nie robi — zmierzone). Statek z innego układu zostaje więc
// zaznaczony i dostaje TE SAME liczby, odmierzone od SWOJEJ gwiazdy. Repro właściciela (`mo_6`):
// statek w `sys_020`, kamera na `sys_home`, klik w pustkę → lot do (15.71, −158.94) w `sys_020`.
//
// ── ⚠ GDZIE WOLNO TEGO UŻYWAĆ (mierzone granice, nie ostrożność) ──────────────────────────
// 1. NIE w `buildOrderSpec` / `_buildFleetSpec` (D-LD1): `OrderDispatcher.js` jest CZYSTY
//    i dostaje `vesselId` jako STRING, a `_buildFleetSpec(option, target)` nie dostaje ani
//    statku, ani `fleetId`. Termin siedzi u WOŁAJĄCEGO, bo tylko on ma obie strony pytania.
// 2. NIE w `FleetSystem.issueFleetOrder` — jedynym miejscu pokrywającym naraz PPM floty i oba
//    pickery: ta funkcja obsługuje TAKŻE „Powrót do bazy", którego cel liczy się w układzie
//    STATKU (`nearestOwnColonyBodyInSystem`, naprawa 154). ZMIERZONE: dostaje `{x:220, y:0}`
//    (Powrót) i `{x:15.71, y:−158.94}` (klik) — GOŁE LICZBY, nie do odróżnienia. Termin tam
//    odrzuciłby rozkaz CAŁKOWICIE POPRAWNY. Pinuje to `map_click_frame_smoke` T4.
// 3. WYŁĄCZNIE dla typów, których cel NA PEWNO pochodzi z kamery (`POINT_SOURCED_ORDER_TYPES`
//    w `RightClickMenu`, dziś = `moveToPoint` + `dock`). Ta sama miara wyklucza `retreat` (cel
//    liczony w układzie statku), `escort` (Finding 264) i `goToPOI`/`patrol` (POI nie ma
//    `systemId` — Finding 152; `patrol` NIE MOŻE wejść do tego zbioru, T8e).
//
// ── ⚠ MOMENT: FINALIZACJA, NIGDY ARM (D-89c — REGUŁA, obowiązuje też 267) ─────────────────
// Bramka przy UZBRAJANIU pickera jest NIEPEŁNA, i to jest POMIAR, nie preferencja: nic nie
// kasuje pickera na `system:switched` (dwaj konsumenci — `GameScene:3435` i `FMO:505` — go nie
// dotykają), więc gracz może uzbroić picker przy kamerze ZGODNEJ z flotą, przełączyć układ
// i kliknąć. ZMIERZONE: picker po przełączeniu „NADAL UZBROJONY", oba statki z `sys_020`
// dostają współrzędne z ramki `sys_home`. Bramka ARM-time przepuściłaby ten przypadek
// (fałszywy pozytyw) i jednocześnie odmówiłaby graczowi, który chciał NAJPIERW przełączyć układ
// (fałszywy negatyw). ⇒ termin liczy się w chwili KLIKU, w callbacku, który zamienia punkt na spec.
//
// ── FAIL-OPEN (idiom `SystemScope`) ────────────────────────────────────────────────────────
// `systemIdOf` zwraca `null` dla statku W TRANZYCIE międzygwiezdnym. Taki rozkaz ma odrzucić
// bramka Findingu 147 w `MovementOrderSystem` WŁASNYM powodem (`vessel_in_warp_transit`) —
// nie ten termin. Kolejność zmierzona i pinowana (T5a/T5c).
//
// ⚠ IMPORT i18n — ten moduł jest PIERWSZYM w `src/utils/`, który importuje `t()`. Powód jest
// nazwany: `describeOrderFail` to JEDNO źródło formatowania „nazwa statku (powód)" dla trzech
// powierzchni; alternatywą były trzy kopie trzylinijkowego formattera. Reszta kanonu utils
// (`RetreatTarget.js` importuje pięć modułów, `StationGroup.js` dwa) potwierdza, że „pure"
// znaczy tu „samodzielny moduł bez cykli, testowalny pod node", a nie „zero importów".

import { systemIdOf } from './SystemScope.js';
import { t }          from '../i18n/i18n.js';

/** Powód odmowy — reużyty z W3-4b (D-LD3: zero nowych kluczy i18n). */
export const CAMERA_FRAME_REASON = 'target_other_system';

/**
 * Czy statek jest POZA ramką kamery?
 * @returns {'target_other_system'|null} powód albo `null` (w ramce / nie wiemy / warp).
 */
export function outOfCameraFrame(vesselId) {
  const v    = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
  const cam  = window.KOSMOS?.activeSystemId ?? null;
  const vSys = systemIdOf(v);
  if (vSys == null || cam == null) return null;   // nie wiemy / warp → przepuść dalej
  return vSys === cam ? null : CAMERA_FRAME_REASON;
}

/**
 * Członkowie floty poza ramką kamery. Zbiór „eligible" LUSTRZANY wobec
 * `FleetSystem.issueFleetOrder:120-127` (żywi, nie-wraki) — inaczej odmawialibyśmy
 * z powodu statku, którego fan-out i tak by pominął.
 * @returns {{vesselId: string, reason: string}[]}
 */
export function fleetOffendersOutOfFrame(fleetId) {
  const fleet = window.KOSMOS?.fleetSystem?.getFleet?.(fleetId);
  const vm    = window.KOSMOS?.vesselManager;
  const out   = [];
  for (const vid of (fleet?.memberIds ?? [])) {
    const v = vm?.getVessel?.(vid);
    if (!v || v.isWreck) continue;
    const bad = outOfCameraFrame(vid);
    if (bad) out.push({ vesselId: vid, reason: bad });
  }
  return out;
}

/**
 * Nazwa statku + przetłumaczony powód. Jedno źródło formatowania dla WSZYSTKICH ścieżek
 * (per-statek, flotowa PPM, oba pickery flotowe) — inaczej ten sam powód czytałby się
 * inaczej zależnie od tego, którym przyciskiem gracz go wywołał.
 */
export function describeOrderFail(f) {
  const key    = `vessel.reason${_pascalCase(f?.reason ?? 'unknown')}`;
  const rt     = t(key);
  const reason = rt !== key ? rt : (f?.reason ?? 'unknown');
  const nm     = window.KOSMOS?.vesselManager?.getVessel?.(f?.vesselId)?.name ?? f?.vesselId;
  return `${nm} (${reason})`;
}

function _pascalCase(s) {
  if (!s) return '';
  return s.split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join('');
}
