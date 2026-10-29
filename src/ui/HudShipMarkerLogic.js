// HudShipMarkerLogic — ZNACZNIK STATKU na mapie 3D (krok po ARKUSZU HUD; D-SM-1…6, HUD_PLAN.md §„Znacznik statku”): czysta
// logika znacznika warstwy HUD 2D, który zastępuje insygnium frakcji (`ThreeRenderer._syncInsignia` — szewron z kropką
// w kolorze frakcji nad modelem). Rysunek — `HudShipMarkerLayer` (podwarstwa pod etykietami).
// Czysty: bez three i bez DOM, bez `window`; ZERO kolorów na sztywno (rolę zwraca się nazwą — barwę podaje
// `HudPalette.resolveHudRoles`). Wielkości w px LOGICZNYCH UI (skala jak `#ui-canvas`).
//   • rola (D-SM-1): własny — `primary`, obcy — `foreign` (token `textPrimary`; bez rozróżniania imperiów kolorem — nazwa jest
//     w etykiecie), wróg — `alert` (wojna z właścicielem statku albo pasmo opinii „wrogie”; statek wrogi bez imperium);
//   • widoczność = reguła insygnium dziś (fail-closed): sprite statku w scenie i widoczny, nie wrak, obcy — wywiad ≥ `contact`
//     albo uczestnik starcia z graczem (`isEndpointVisibleInCombat` — ta sama funkcja co bramka insygnium); statek bez
//     sprite'a (zadokowany, w innym układzie, w skoku po pierwszym tiku) — bez znacznika; czysty widok (SHIFT) — bez (D-SM-4);
//   • glif (D-SM-2): pusty daszek obrócony w kierunku RUCHU na ekranie; bez ruchu — pusty romb nad tarczą. Kierunek ruchu
//     z logiki gry (`classifyMotion`): skok warp — kierunek układu docelowego (ten sam co kreski H3, `HudRouteLogic.warpSpec`);
//     orbita przy ciele — styczna orbity `OrbitalSpaceSystem` (θ = θ₀ + ω·t na zegarze orbit); poza tym prędkość statku
//     (`vessel.velocity`, AU / rok cyw. — delta położenia w ostatnim tiku albo prędkość rozkazu `MovementOrderSystem`);
//     statek w locie bez prędkości (pauza tuż po wczytaniu albo po wydaniu rozkazu — prędkość liczy pierwszy tik) — kierunek
//     z geometrii trasy (tylko własne; obce — romb do pierwszego tiku, żeby nie zdradzić celu);
//   • rozmiar stały w px (D-SM-3), daszek przed tarczą statku w kierunku ruchu (odstęp = promień tarczy + `MARKER_GAP_PX`),
//     romb nad tarczą; gaśnie przy bliskim zoomie jak nawiasy (te same `FADE_LARGE_*` z `HUD_ATTENTION`); model uwagi
//     (zaznaczony / alertowany / najechany — `SELECTED_ALPHA` / 1, reszta przy ostrości × `LABEL_DIM`); BEZ oddechu.
import { isEndpointVisibleInCombat } from '../utils/VesselFxLogic.js';
import { HUD_ATTENTION, bracketBox, labelAttentionTarget } from './HudAttentionLogic.js';

// Stałe (px logiczne). Strojenie na bramce — z konsoli: `KOSMOS.hudLayer.tune({ MARKER_W: 12 })` (przeżywa do F5).
// `FADE_LARGE_FROM` / `FADE_LARGE_TO` — wspólne z nawiasami (`HUD_ATTENTION`), strojone tym samym `tune`.
export const HUD_SHIP_MARKER_DEFAULTS = Object.freeze({
  MARKER_W: 10,             // daszek — rozpiętość (w poprzek kierunku ruchu)
  MARKER_H: 7,              // daszek — głębokość (wzdłuż kierunku ruchu)
  DIAMOND_PX: 8,            // romb — przekątna
  MARKER_GAP_PX: 3,         // odstęp znacznika od krawędzi tarczy statku
  MARKER_WIDTH: 1,          // linia
  MARKER_ALPHA: 0.9,        // krycie statku niezaznaczonego (przy ostrości × `LABEL_DIM`)
  SELECTED_ALPHA: 1.0,      // krycie statku zaznaczonego (prowadzący, zbiór, flota)
  MOTION_EPS: 1e-4,         // [AU / rok cyw.] prędkość poniżej — „bez ruchu” (romb)
  MARKER_OBSTACLE: 1,       // 1 — etykiety omijają znacznik (przeszkoda jak nawiasy), 0 — etykiety go nie widzą
});
export const HUD_SHIP_MARKER = { ...HUD_SHIP_MARKER_DEFAULTS };

const M = HUD_SHIP_MARKER;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const finite2 = (d) => !!d && Number.isFinite(d.x) && Number.isFinite(d.y);

/** Flaga kroku: `FEATURES.hudShipMarker` — brak klucza = OFF (insygnium jak dziś, warstwa bez znaczników). */
export function isHudShipMarkerOn(features) {
  return features?.hudShipMarker === true;
}

// ── Rola (D-SM-1) ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Relacja statku z graczem: `'own'` · `'foreign'` (obcy w pokoju / rozejmie / pakcie) · `'enemy'` (wojna z właścicielem,
 * pasmo opinii „wrogie”, statek wrogi bez imperium — rajder).
 * @param {{ isEnemy:boolean, empireId?:string|null, atWar?:boolean, hostile?:boolean }} p
 */
export function shipMarkerRelation({ isEnemy, empireId = null, atWar = false, hostile = false } = {}) {
  if (!isEnemy) return 'own';
  if (!empireId) return 'enemy';
  return (atWar === true || hostile === true) ? 'enemy' : 'foreign';
}

/** Rola koloru HUD dla relacji (nazwa roli `HudPalette.resolveHudRoles`). */
export function shipMarkerRole(relation) {
  if (relation === 'enemy') return 'alert';
  if (relation === 'foreign') return 'foreign';
  return 'primary';
}

// ── Widoczność (reguła insygnium; D-SM-4) ─────────────────────────────────────────────────────────────────────────────

/**
 * Czy statek dostaje znacznik — ta sama reguła co insygnium dziś (`ThreeRenderer._syncInsignia`), fail-closed.
 * @param {{ hasSprite:boolean, spriteVisible:boolean, isWreck:boolean, isEnemy:boolean, quality?:string|null,
 *   inPlayerEngagement?:boolean, cleanView?:boolean }} p
 */
export function shipMarkerVisible({ hasSprite = false, spriteVisible = false, isWreck = false, isEnemy = false, quality = null,
  inPlayerEngagement = false, cleanView = false } = {}) {
  if (cleanView === true) return false;
  if (hasSprite !== true || spriteVisible !== true) return false;
  if (isWreck === true) return false;
  return isEndpointVisibleInCombat({ isEnemy: isEnemy === true, quality, inPlayerEngagement: inPlayerEngagement === true });
}

// ── Ruch (D-SM-2) ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Kierunek orbity przy ciele (płaszczyzna ekliptyki: x = oś X świata, y = oś Z świata): pochodna położenia
 * `OrbitalSpaceSystem.getPosition` po czasie — θ = θ₀ + ω·t, (x, z) = środek + r·sin φ·(cos θ, sin θ) ⇒ kierunek
 * sgn(ω)·(−sin θ, cos θ). Orbita zakotwiczona albo ω = 0 — `null` (bez ruchu).
 * @param {{ anchored?:boolean, theta0:number, omega:number }|null} orbit
 * @param {number} tSec — zegar orbit (`orbitClockSec`)
 */
export function orbitTangent(orbit, tSec) {
  if (!orbit || orbit.anchored === true) return null;
  const w = Number(orbit.omega);
  if (!Number.isFinite(w) || w === 0 || !Number.isFinite(orbit.theta0)) return null;
  const th = orbit.theta0 + w * (Number.isFinite(tSec) ? tSec : 0);
  const s = Math.sign(w);
  return { x: -Math.sin(th) * s, y: Math.cos(th) * s };
}

/**
 * Ruch statku z logiki gry. Kierunek w płaszczyźnie ekliptyki (ramka układu, jednostkowy).
 * @param {{ state?:string, dockedAt?:string|null, isWreck?:boolean, velocity?:{vx:number,vy:number}|null,
 *   orbit?:object|null, tSec?:number, warpDir?:{x:number,y:number}|null, routeDir?:{x:number,y:number}|null }} p —
 *   `warpDir`: statek w skoku (kierunek układu docelowego); `routeDir`: kierunek z geometrii trasy (gdy prędkość zerowa)
 * @returns {{ moving:boolean, dir:{x:number,y:number}|null, source:'warp'|'orbit'|'velocity'|'route'|'none' }}
 */
export function classifyMotion({ state = null, dockedAt = null, isWreck = false, velocity = null, orbit = null, tSec = 0,
  warpDir = null, routeDir = null } = {}) {
  const still = { moving: false, dir: null, source: 'none' };
  if (isWreck === true || state === 'docked') return still;
  const unit = (d) => {
    if (!finite2(d)) return null;
    const l = Math.hypot(d.x, d.y);
    return l > 0 ? { x: d.x / l, y: d.y / l } : null;
  };
  const wd = unit(warpDir);
  if (wd) return { moving: true, dir: wd, source: 'warp' };
  if (state === 'orbiting' && dockedAt != null) {
    const od = unit(orbitTangent(orbit, tSec));
    return od ? { moving: true, dir: od, source: 'orbit' } : still;
  }
  const vx = Number(velocity?.vx), vy = Number(velocity?.vy);
  if (Number.isFinite(vx) && Number.isFinite(vy) && Math.hypot(vx, vy) >= M.MOTION_EPS) {
    return { moving: true, dir: unit({ x: vx, y: vy }), source: 'velocity' };
  }
  if (state === 'in_transit') {
    const rd = unit(routeDir);
    if (rd) return { moving: true, dir: rd, source: 'route' };
  }
  return still;
}

/**
 * Punkt, ku któremu statek w locie NAPRAWDĘ leci (zapas kierunku, gdy prędkość jeszcze zerowa) — z trasy `HudRouteLogic.routeSpec`:
 * najbliższy punkt pośredni; bez punktów — misja w locie: punkt PRZEWIDZIANY na przylot (`mission.targetX/Y` — tam interpoluje
 * `VesselManager._updatePositions`), nie bieżące położenie ruchomego celu (`liveTargetX/Y`, do którego rysuje się kreska H3);
 * powrót, patrol, pościg, przechwycenie — cel trasy.
 * @returns {{x:number,y:number}|null} — ramka układu (px logiki gry)
 */
export function routeMotionPoint(spec, mission = null) {
  if (!spec) return null;
  const via = spec.via?.[0];
  if (finite2(via)) return { x: via.x, y: via.y };
  if (spec.kind === 'mission' && Number.isFinite(mission?.targetX) && Number.isFinite(mission?.targetY)) return { x: mission.targetX, y: mission.targetY };
  return finite2(spec.to) ? { x: spec.to.x, y: spec.to.y } : null;
}

/** Kierunek na ekranie z dwóch rzutów (px logiczne): punkt statku i punkt przesunięty wzdłuż ruchu; `null` — zdegenerowany. */
export function screenDirection(p0, p1) {
  if (!finite2(p0) || !finite2(p1)) return null;
  const dx = p1.x - p0.x, dy = p1.y - p0.y, l = Math.hypot(dx, dy);
  return l > 1e-6 ? { x: dx / l, y: dy / l } : null;
}

/** Kąt kierunku na ekranie [°] (0 = w prawo, 90 = w dół, zgodnie z zegarem) — odczyt dla bramki i keepera. */
export function screenAngleDeg(dir) {
  if (!finite2(dir)) return null;
  const a = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
  return ((a % 360) + 360) % 360;
}

// ── Geometria (D-SM-2, D-SM-3) ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Glif znacznika (px logiczne). Daszek: ramiona od podstawy (odstęp `discR + MARKER_GAP_PX` od środka statku wzdłuż
 * kierunku) do wierzchołka (`+ MARKER_H`); romb: środek nad tarczą (`discR + MARKER_GAP_PX + DIAMOND_PX / 2`).
 * @param {{ cx:number, cy:number, discR?:number, dir?:{x:number,y:number}|null }} p — `dir` — kierunek na ekranie (brak — romb)
 * @returns {{ kind:'chevron'|'diamond', pts:number[], closed:boolean, rect:{x,y,w,h} }|null}
 */
export function markerGeometry({ cx, cy, discR = 0, dir = null } = {}) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const r = Number.isFinite(discR) && discR > 0 ? discR : 0;
  let kind, pts, closed;
  if (finite2(dir) && Math.hypot(dir.x, dir.y) > 0) {
    const l = Math.hypot(dir.x, dir.y), ux = dir.x / l, uy = dir.y / l, nx = -uy, ny = ux;
    const b = r + M.MARKER_GAP_PX, hw = M.MARKER_W / 2;
    const bx = cx + ux * b, by = cy + uy * b, ax = cx + ux * (b + M.MARKER_H), ay = cy + uy * (b + M.MARKER_H);
    kind = 'chevron'; closed = false;
    pts = [bx + nx * hw, by + ny * hw, ax, ay, bx - nx * hw, by - ny * hw];
  } else {
    const h = M.DIAMOND_PX / 2, dy = cy - (r + M.MARKER_GAP_PX + h);
    kind = 'diamond'; closed = true;
    pts = [cx, dy - h, cx + h, dy, cx, dy + h, cx - h, dy];
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  return { kind, pts, closed, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/** Gaśnięcie przy bliskim zoomie — ta sama reguła i te same progi co nawiasy statku (`bracketBox`, `FADE_LARGE_*`). */
export function markerZoomFade(discR, frame) {
  return bracketBox({ cx: 0, cy: 0, discR, kind: 'vessel', frame })?.fade ?? 0;
}

// ── Krycie (model uwagi; bez oddechu) ─────────────────────────────────────────────────────────────────────────────────

/** Docelowy poziom uwagi — ten sam co etykiety statku: bez ostrości 1; z ostrością 1 dla zaznaczonego / alertowanego / najechanego, reszta `LABEL_DIM`. */
export function markerAttentionTarget({ focus = false, selected = false, alerted = false, hovered = false } = {}) {
  return labelAttentionTarget({ focus, selected, alerted, hovered });
}

/**
 * Krycie znacznika: (`SELECTED_ALPHA` — zaznaczony, inaczej `MARKER_ALPHA`) × poziom uwagi × krycie wywiadu (jak model
 * i insygnium: `contact` 0,5) × gaśnięcie przy bliskim zoomie.
 */
export function markerAlpha({ selected = false, attention = 1, intelOpacity = 1, zoomFade = 1 } = {}) {
  const base = selected ? M.SELECTED_ALPHA : M.MARKER_ALPHA;
  const io = Number.isFinite(intelOpacity) ? clamp01(intelOpacity) : 1;
  const at = Number.isFinite(attention) ? clamp01(attention) : 1;
  const zf = Number.isFinite(zoomFade) ? clamp01(zoomFade) : 0;
  return clamp01(base) * at * io * zf;
}

// ── Strojenie ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Strojenie stałych znacznika: nieznane klucze pominięte (`FADE_LARGE_*` stroi `tuneHudAttention`); zwraca bieżące. */
export function tuneHudShipMarker(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) if (k in HUD_SHIP_MARKER_DEFAULTS && Number.isFinite(v)) HUD_SHIP_MARKER[k] = v;
  return { ...HUD_SHIP_MARKER, FADE_LARGE_FROM: HUD_ATTENTION.FADE_LARGE_FROM, FADE_LARGE_TO: HUD_ATTENTION.FADE_LARGE_TO };
}
export function resetHudShipMarker() {
  Object.assign(HUD_SHIP_MARKER, HUD_SHIP_MARKER_DEFAULTS);
  return { ...HUD_SHIP_MARKER, FADE_LARGE_FROM: HUD_ATTENTION.FADE_LARGE_FROM, FADE_LARGE_TO: HUD_ATTENTION.FADE_LARGE_TO };
}
