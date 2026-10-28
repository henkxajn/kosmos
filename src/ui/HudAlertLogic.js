// HudAlertLogic — ARKUSZ HUD paczka B (B-2; D-HUD-4, D-HUD-11, D-HUD-12; HUD_PLAN.md §4.5 — wymagania z bramki H1): czysta
// logika ALERTÓW warstwy HUD 2D — obcy statek wchodzi w zasięg wykrycia obiektu gracza z WIDOCZNYM radarem: zaznaczonego, a w trybie
// Y — każdego własnego (zakres — `HudRadarLayer`; jeden komplet pierścieni, wektora i linii na intruza — `HudLayer._alertView`).
// Czysty: bez three i bez DOM, bez `window`; ZERO kolorów na sztywno (rola `alert` z `HudPalette.resolveHudRoles` u wołającego).
//   • czas trwania `ALERT_MS` na ZEGARZE SYMULACJI (`simClockMs` — D-HUD-12: puls alertu stoi w pauzie; przed pierwszym tikiem
//     po wczytaniu — alert stoi na początku); dwa pulsy (`ALERT_PULSES`, drugi słabszy) — błysk na granicy, pierścienie na
//     intruzie i wektor gasną z nimi; linia treści trzyma pełne krycie i gaśnie w ostatniej części;
//   • błysk na granicy: łuk co najmniej `FLASH_MIN_ARC_PX` na ekranie (stała w px, nie w AU) i co najmniej ±`FLASH_MIN_HALF_DEG`
//     wokół namiaru obcego (dzisiejszy łuk ±15° na małym okręgu miał kilka px);
//   • treść (jedna linia): tożsamość wg wywiadu — poniżej `contact` „kontakt” (bez nazwy i bez typu), od `contact` nazwa
//     (statek bez nazwy — typ, rola statku); próg — `VesselReveal.enemyVesselNamed`, ta sama reguła co etykieta i rozwinięcie
//     T1 (Finding 568, wariant „b”) — FAIL-CLOSED: każda jakość spoza `contact` / `detailed` (brak, `unknown`, `rumor`, coś
//     nowego) = „kontakt”; odległość w AU z jednym miejscem po przecinku; namiar 000–359° względem osi EKRANU (0° = w górę
//     ekranu, rośnie zgodnie z ruchem wskazówek zegara). Położenie obcego wg reguły punktu końcowego efektów
//     (`VesselFxLogic.resolveFxEndpointRaw`): `rumor` — ostatnio znane, `contact` i wyżej — żywe, `unknown` — niewidoczny
//     (bez pierścieni, wektora i linii; zostaje sam błysk na granicy — fakt wejścia, jak w H1);
//   • kolonia z zasięgiem ∞ (bez granicy) — alert przez etykietę kolonii: pasek w roli `alert` przez czas alertu + ta sama
//     linia treści (odległość i namiar od kolonii);
//   • scalenie z celownikiem wroga (`fcEnemyAlertMarker`): intruz z celownikiem — bez pierścieni HUD (celownik przejmuje ich
//     rolę i pulsuje dwa razy w rytmie alertu), wektor i linia treści zostają.
import { resolveFxEndpointRaw } from '../utils/VesselFxLogic.js';
import { enemyVesselNamed } from '../utils/VesselReveal.js';   // Finding 568 — jedna reguła nazwy obcego statku
import { fmtDec } from './NumberFormatLogic.js';

// Stałe (px logiczne, ms zegara symulacji). Strojenie na bramce — z konsoli: `KOSMOS.hudLayer.tune({ ALERT_MS: 2000 })`.
export const HUD_ALERT_DEFAULTS = Object.freeze({
  ALERT_MS: 1600,             // czas alertu (zegar symulacji)
  ALERT_PULSES: 2,            // liczba pulsów
  ALERT_PULSE2_GAIN: 0.75,    // drugi (i dalsze) puls — krycie względem pierwszego
  FLASH_MIN_ARC_PX: 48,       // błysk na granicy — najkrótszy łuk na ekranie
  FLASH_MIN_HALF_DEG: 15,     // … i co najmniej ±15° wokół namiaru
  FLASH_WIDTH: 1.6, FLASH_ALPHA: 0.9,            // linia błysku (rola `alert`)
  FLASH_GLOW_WIDTH: 5, FLASH_GLOW_ALPHA: 0.25,   // poświata błysku
  FLASH_SEGMENTS: 24,
  RING_R0: 8, RING_R1: 13,    // dwa cienkie pierścienie na intruzie (px)
  RING_A0: 0.9, RING_A1: 0.45,// … różnej jasności
  RING_WIDTH: 1,
  VECTOR_DOT: 1.5,            // kropkowany wektor obiekt → intruz: średnica kropki …
  VECTOR_GAP: 5,              // … co tyle px
  VECTOR_ALPHA: 0.8,
  LINE_FADE_FROM: 0.7,        // linia treści: pełne krycie do tej części czasu alertu, potem gaśnie
  COLONY_BAR_ALPHA: 0.45,     // kolonia ∞ — pasek etykiety w roli `alert` (szczyt pulsu)
});
export const HUD_ALERT = { ...HUD_ALERT_DEFAULTS };

const A = HUD_ALERT;

// ── Zegar alertu ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Wiek alertu (ms zegara symulacji): brak zegara albo brak startu — 0 (alert stoi na początku). */
export function alertAge(simNow, simStart) {
  if (!Number.isFinite(simNow) || !Number.isFinite(simStart)) return 0;
  return Math.max(0, simNow - simStart);
}

/** Czy alert trwa. */
export function alertLive(age) { return Number.isFinite(age) && age >= 0 && age < A.ALERT_MS; }

/** Obwiednia pulsów (0–1): `ALERT_PULSES` pulsów w `ALERT_MS`, każdy od pełnej wartości gaśnie do zera; poza czasem — 0. */
export function alertEnvelope(age) {
  if (!alertLive(age)) return 0;
  const n = Math.max(1, Math.round(A.ALERT_PULSES));
  const u = (age / A.ALERT_MS) * n;
  const p = Math.min(n - 1, Math.floor(u));
  const x = u - p;
  return (p === 0 ? 1 : A.ALERT_PULSE2_GAIN) * (1 - x * x);
}

/** Krycie linii treści (0–1): pełne do `LINE_FADE_FROM` czasu alertu, potem liniowo do zera. */
export function alertLineAlpha(age) {
  if (!alertLive(age)) return 0;
  const u = age / A.ALERT_MS, f = A.LINE_FADE_FROM;
  return u <= f ? 1 : Math.max(0, 1 - (u - f) / Math.max(1e-6, 1 - f));
}

// ── Geometria ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Połowa kąta łuku błysku (rad) dla okręgu o promieniu `ringPx` na ekranie: łuk ≥ `FLASH_MIN_ARC_PX`, ≥ ±`FLASH_MIN_HALF_DEG`, ≤ π. */
export function flashHalfAngle(ringPx) {
  const minRad = (A.FLASH_MIN_HALF_DEG * Math.PI) / 180;
  const byArc = Number.isFinite(ringPx) && ringPx > 0 ? A.FLASH_MIN_ARC_PX / (2 * ringPx) : minRad;
  return Math.min(Math.PI, Math.max(minRad, byArc));
}

/** Namiar 0–359° na EKRANIE od `from` do `to` (px): 0° = w górę ekranu, zgodnie z ruchem wskazówek zegara; brak wektora — `null`. */
export function screenBearingDeg(from, to) {
  if (!from || !to) return null;
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9)) return null;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  const r = Math.round(deg);
  return r >= 360 ? 0 : r;
}

/** Namiar w zapisie trzycyfrowym: 45 → „045°”. */
export function fmtBearing(deg) {
  return Number.isFinite(deg) ? `${String(Math.round(deg) % 360).padStart(3, '0')}°` : '';
}

/** Odległość (AU) między punktami w px logiki gry (jedna ramka układu). */
export function distanceAU(a, b, auToPx) {
  if (!a || !b || !(auToPx > 0)) return null;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return Number.isFinite(d) ? d / auToPx : null;
}

// ── Mgła wojny ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Poziom ujawnienia intruza (fail-closed): `contact` i `detailed` — nazwa, KAŻDA inna jakość — anonimowy „kontakt”
 * (`VesselReveal.enemyVesselNamed` — Finding 568, jedna reguła z etykietą i rozwinięciem T1).
 */
export function alertRevealTier(quality) {
  return enemyVesselNamed(quality) ? 'name' : 'anon';
}

/**
 * Położenie intruza widoczne dla gracza (px logiki gry) — reguła punktu końcowego efektów: `rumor` — ostatnio znane,
 * `contact` i wyżej — żywe, `unknown` — `null` (niewidoczny). Obcy statek bez jakości = `unknown` (fail-closed).
 */
export function alertFoeEndpoint({ livePos, quality, positionLastKnown }) {
  const e = resolveFxEndpointRaw({ isEnemy: true, livePos, quality: quality ?? 'unknown', positionLastKnown });
  return e && e.visible ? { x: e.x, y: e.y } : null;
}

/**
 * Tożsamość intruza w linii treści wg wywiadu (fail-closed): nazwa; statek bez nazwy — typ (rola); poniżej `contact` —
 * „kontakt”.
 * @param {{ quality:string|null, roleLabel?:string|null, name?:string|null }} f
 * @param {(key:string, ...a:any[]) => string} t
 */
export function alertIdentity({ quality, roleLabel = null, name = null }, t) {
  if (alertRevealTier(quality) === 'name') {
    if (name) return String(name);
    if (roleLabel) return String(roleLabel);
  }
  return t('hudAlert.contact');
}

/**
 * Linia treści alertu: „tożsamość · odległość AU · namiar”. Brak odległości albo namiaru — ta część pominięta.
 * @param {{ quality, roleLabel?, name?, distAU?:number|null, bearingDeg?:number|null }} f
 * @param {{ t:Function, locale?:string }} o
 */
export function alertContentText(f, { t, locale = 'pl' }) {
  const parts = [alertIdentity(f, t)];
  if (Number.isFinite(f.distAU)) parts.push(`${fmtDec(f.distAU, 1, locale)} AU`);
  if (Number.isFinite(f.bearingDeg)) parts.push(fmtBearing(f.bearingDeg));
  return parts.join(' · ');
}

// ── Rejestr alertów ──────────────────────────────────────────────────────────────────────────────────────────────────

const MAX_ALERTS = 32;

/**
 * Rejestr alertów warstwy (czysty; zegar podaje wołający). Rekord: `{ id, kind: 'vessel'|'colony', holderKey, holderId, foeId,
 * systemId, angle, infinite }` — `angle` namiar obcego w ramce UKŁADU (łuk błysku), `infinite` — kolonia z zasięgiem ∞.
 */
export class HudAlertStore {
  constructor() { this._list = []; }

  /** Nowy alert (ten sam obiekt i ten sam obcy w trakcie — od nowa). */
  push(rec, simNow = null) {
    if (!rec?.id) return null;
    this._list = this._list.filter((a) => a.id !== rec.id);
    const a = { ...rec, simStart: Number.isFinite(simNow) ? simNow : null };
    this._list.push(a);
    if (this._list.length > MAX_ALERTS) this._list.shift();
    return a;
  }

  /**
   * Alerty trwające w chwili `simNow` (z wiekiem, obwiednią i kryciem linii); wygasłe — usunięte. Alert z chwili bez zegara
   * dostaje start przy pierwszym odczycie z zegarem.
   */
  frame(simNow) {
    const out = [];
    for (const a of this._list) {
      if (a.simStart == null && Number.isFinite(simNow)) a.simStart = simNow;
      const age = alertAge(simNow, a.simStart);
      if (!alertLive(age)) { a._done = true; continue; }
      out.push({ ...a, age, env: alertEnvelope(age), lineAlpha: alertLineAlpha(age) });
    }
    this._list = this._list.filter((a) => !a._done);
    return out;
  }

  /** Najwyższa obwiednia trwających alertów obcego `foeId` (0 — brak; bez usuwania wygasłych — odczyt renderera 3D). */
  envelopeFor(foeId, simNow) {
    let best = 0;
    for (const a of this._list) {
      if (String(a.foeId) !== String(foeId)) continue;
      const e = alertEnvelope(alertAge(simNow, a.simStart ?? (Number.isFinite(simNow) ? simNow : null)));
      if (e > best) best = e;
    }
    return best;
  }

  clear() { this._list = []; }
  get size() { return this._list.length; }
}

/** Najmocniejszy trwający alert obcego `foeId` (scalenie z celownikiem wroga) albo `null`. */
export function alertForFoe(active, foeId) {
  let best = null;
  for (const a of active ?? []) if (String(a.foeId) === String(foeId) && (!best || a.env > best.env)) best = a;
  return best;
}

// ── Strojenie ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function tuneHudAlert(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) if (k in HUD_ALERT_DEFAULTS && Number.isFinite(v)) HUD_ALERT[k] = v;
  return { ...HUD_ALERT };
}
export function resetHudAlert() { Object.assign(HUD_ALERT, HUD_ALERT_DEFAULTS); return { ...HUD_ALERT }; }
