// HudRouteLogic — ARKUSZ HUD H3 (D-HUD-8, D-HUD-9, D-HUD-10, D-HUD-12; HUD_PLAN.md §4.4): czysta logika TRAS statków na
// warstwie HUD 2D — który rozkaz ma trasę i dokąd, kto ją widzi (mgła wojny, układ), marsz kresek na zegarze symulacji,
// gradient krycia, skok warp (kreski do krawędzi kadru w kierunku układu docelowego). Rysunek — `HudRouteLayer`.
// Czysty: bez three i bez DOM, bez `window`; ZERO kolorów na sztywno (role z `HudPalette.resolveHudRoles` podaje wołający).
//   • zestaw rozkazów (D-HUD-8): dzisiejszy (misja w locie: transport, kolonizacja, rekon, górnictwo, `moveToPoint` — także
//     odwrót i dok, powrót) + patrol (bieżący odcinek) + pościg (do celu — tylko gdy cel widoczny na mapie) i przechwycenie
//     (do punktu przechwycenia); walka i eskorta — bez trasy; statek zadokowany, na orbicie albo w wolnej przestrzeni bez
//     misji w locie — bez trasy (jak dziś);
//   • układ ŚCIŚLE (516): trasa tylko statku z oglądanego układu (`systemIdOf` — statek w skoku, `null`, nie jest w żadnym);
//     skok warp (D-HUD-9) — wyłącznie w układzie ODLOTU, przez czas skoku: od punktu odlotu do krawędzi kadru w kierunku
//     układu docelowego; w układzie celu — nic do przylotu;
//   • kierunek warp: różnica położeń układów na mapie galaktyki (x, y w ly; składowa z pominięta — rzut na ekliptykę), osie
//     galaktyki = osie układu (x galaktyki → x układu, y → y; w świecie 3D: oś X i oś Z) — ta sama konwencja co reszta HUD
//     (0 = oś x układu, rosnąco ku osi y);
//   • obce (D-HUD-10, 509): trasa tylko, gdy statek jest TERAZ wykryty (aktywna para wykrycia z dowolnym statkiem gracza
//     albo wykrycie przez obserwatorium kolonii gracza) i jakość wywiadu ≥ `contact` (`isEndpointVisibleByQuality` — ta sama
//     reguła co puls ruchu, SB43); `rumor` — nigdy;
//   • marsz kresek (D-HUD-12): przesunięcie wzoru = f(`simClockMs`) — stoi w pauzie; przed pierwszym tikiem po wczytaniu
//     (`null`) — wzór statyczny, BEZ zapasu na czas realny;
//   • krycie gasnące wzdłuż długości: przy statku 0,6 → przy celu 0,15; × 0,25 dla niezaznaczonych (stała poziomu uwagi —
//     pełny model uwagi to paczka B); zaznaczony i najechany — × 1.
import { systemIdOf } from '../utils/SystemScope.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { isEndpointVisibleByQuality } from '../utils/VesselFxLogic.js';

/** Flaga tras HUD — `true` wyłącznie przy `features.hudRoutes === true` (brak klucza = OFF). */
export const isHudRoutesOn = (features) => features?.hudRoutes === true;

// Rysunek i harmonogram (px logiczne, ms). Strojenie na bramce.
export const HUD_ROUTES = Object.freeze({
  WIDTH: 1,                               // linia trasy
  HOVER_WIDTH: 1.6,                       // trasa statku najechanego
  ALPHA_SHIP: 0.6,                        // krycie przy statku
  ALPHA_TARGET: 0.15,                     // … przy celu
  ATTENTION_UNSELECTED: 0.25,             // mnożnik krycia trasy niezaznaczonego statku
  DASH: Object.freeze([6, 4]),            // wzór kresek (px ekranu)
  WARP_DASH: Object.freeze([12, 6]),      // skok warp — dłuższe kreski
  MARCH_PX_PER_S: 4,                      // marsz kresek — px na sekundę zegara symulacji
  GLYPH_R: 4,                             // cel: puste kółko (ciało, obiekt)
  GLYPH_ALPHA: 0.55,                      // krycie glifu celu (× poziom uwagi)
  CHEVRON_LEN: 5, CHEVRON_HALF: 4,        // cel: chevron (punkt w przestrzeni)
  WARP_GLYPH_ALPHA: 0.8,                  // glif i nazwa układu docelowego przy krawędzi
  WARP_GLYPH_R: 3.5,                      // romb glifu warp (pół przekątnej)
  WARP_INSET: 14,                         // glif warp — odstęp od krawędzi kadru
  CLIP_PX: 8,                             // trasa rysowana tylko w oknie + margines (koszt kresek — Finding 527)
  WARP_SAMPLES: 48,                       // próbki promienia warp (geometrycznie, od 0,5 AU)
});

const ok = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Długość łamanej `[{x, y}, …]`. */
export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < (pts?.length ?? 0); i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

/**
 * Pozostałe punkty pośrednie trasy (unikanie gwiazdy i ciał): łamana start → punkty → cel planowany; postęp `t` ∈ [0, 1]
 * (jak `VesselManager._interpolateWaypoints`) — zwraca punkty, których statek jeszcze nie minął.
 */
export function remainingWaypoints(start, waypoints, target, t) {
  if (!Array.isArray(waypoints) || !waypoints.length || !ok(start) || !ok(target)) return [];
  const pts = [start, ...waypoints.filter(ok), target];
  const total = polylineLength(pts);
  if (!(total > 0)) return [];
  const s = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * total;
  const out = [];
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc > s + 1e-9) out.push({ x: pts[i].x, y: pts[i].y });
  }
  return out;
}

/**
 * Trasa statku (D-HUD-8) w ramce oglądanego układu (px logiki gry). `null` — bez trasy.
 * @param {object} v — statek
 * @param {{ gameYear?:number, targetVisiblePos?:(id)=>{x,y}|null }} [ctx] — `targetVisiblePos`: położenie celu pościgu,
 *   jeśli widoczny na mapie (sprite) — inaczej `null` (bez trasy: linia do niewidocznego celu zdradzałaby jego położenie)
 * @returns {{ kind:'mission'|'return'|'patrol'|'pursue'|'intercept', to:{x,y}, toKind:'body'|'point'|'object',
 *   targetId:string|null, via:Array<{x,y}> }|null}
 */
export function routeSpec(v, ctx = {}) {
  if (!v || v.isWreck) return null;
  const st = v.position?.state;
  if (st === 'docked') return null;
  const mo = v.movementOrder;
  if (mo && mo.status === 'active') {
    switch (mo.type) {
      case 'engage':
      case 'escort':
        return null;                                                       // walka — pierścień starcia; eskorta — bez trasy
      case 'patrol': {
        const wp = mo.patrolRoute?.[mo.patrolWaypointIndex];
        return ok(wp) ? { kind: 'patrol', to: { x: wp.x, y: wp.y }, toKind: 'point', targetId: null, via: [] } : null;
      }
      case 'pursue': {
        const p = ctx.targetVisiblePos?.(mo.targetEntityId) ?? null;
        return ok(p) ? { kind: 'pursue', to: { x: p.x, y: p.y }, toKind: 'object', targetId: mo.targetEntityId ?? null, via: [] } : null;
      }
      case 'intercept': {
        const ip = mo.interceptPoint ?? null;
        return ok(ip) ? { kind: 'intercept', to: { x: ip.x, y: ip.y }, toKind: 'point', targetId: null, via: [] } : null;
      }
      default:
        break;                                                             // moveToPoint, odwrót, dok, POI — misja niżej
    }
  }
  const m = v.mission;
  if (!m || st !== 'in_transit') return null;                             // orbita / wolna przestrzeń — bez trasy (jak dziś)
  if (m.type === 'interstellar_jump') return null;                        // skok warp — `warpSpec`
  const gy = ctx.gameYear;
  if (m.phase === 'returning') {
    const to = { x: m.returnTargetX ?? m.liveOriginX, y: m.returnTargetY ?? m.liveOriginY };
    if (!ok(to)) return null;
    const dep = m.returnDepartYear ?? m.arrivalYear ?? m.departYear, end = m.returnYear ?? m.arrivalYear;
    const t = Number.isFinite(gy) && end > dep ? (gy - dep) / (end - dep) : 0;
    const via = remainingWaypoints({ x: m.returnStartX, y: m.returnStartY }, m.returnWaypoints, to, t);
    // Cel powrotu = baza statku (`VesselManager._updateRouteLine`: `returnTarget` śledzi `vessel.colonyId`).
    return { kind: 'return', to, toKind: 'body', targetId: v.colonyId ?? m.originId ?? null, via };
  }
  const to = { x: m.liveTargetX ?? m.targetX, y: m.liveTargetY ?? m.targetY };
  if (!ok(to)) return null;
  const t = Number.isFinite(gy) && m.arrivalYear > m.departYear ? (gy - m.departYear) / (m.arrivalYear - m.departYear) : 0;
  const via = remainingWaypoints({ x: m.startX, y: m.startY }, m.waypoints, { x: m.targetX ?? to.x, y: m.targetY ?? to.y }, t);
  return { kind: 'mission', to, toKind: m.targetId ? 'body' : 'point', targetId: m.targetId ?? null, via };
}

/**
 * Skok warp (D-HUD-9) widoczny w oglądanym układzie — wyłącznie w układzie ODLOTU, przez czas skoku.
 * Nazwa przy glifie = układ DOCELOWY TRASY (strojenie 1, decyzja 3: przy trasie wieloprzeskokowej `warpRoute.finalSystemId`,
 * nie bieżący przeskok); kierunek = bieżący przeskok (pierwszy z układu odlotu) — tam statek naprawdę leci.
 * @param {{ systemName?:(id)=>string|null }} [ctx] — nazwa układu (mapa galaktyki); brak — nazwa z misji / id
 * @returns {{ from:{x,y}, dir:{x,y}, name:string, toSystemId:string, finalSystemId:string }|null} — `from`: punkt odlotu
 *   (ramka układu odlotu), `dir`: kierunek w ramce układu (jednostkowy)
 */
export function warpSpec(v, activeSystemId, ctx = {}) {
  const m = v?.mission;
  if (!v || v.isWreck || !m || m.type !== 'interstellar_jump' || m.phase !== 'warp_transit') return null;
  if (v.systemId !== null) return null;                                   // w skoku statek nie jest w żadnym układzie
  if ((m.fromSystemId ?? null) !== activeSystemId) return null;           // tylko układ odlotu
  const dx = (m.toGalX ?? NaN) - (m.fromGalX ?? NaN), dy = (m.toGalY ?? NaN) - (m.fromGalY ?? NaN);
  const d = Math.hypot(dx, dy);
  if (!(d > 0) || !ok(v.position)) return null;
  const finalId = v.warpRoute?.finalSystemId ?? m.toSystemId ?? null;
  const name = ctx.systemName?.(finalId) ?? (finalId === m.toSystemId ? m.targetName : null) ?? finalId ?? '';
  return { from: { x: v.position.x, y: v.position.y }, dir: { x: dx / d, y: dy / d }, name,
    toSystemId: m.toSystemId ?? null, finalSystemId: finalId };
}

/** Statek w oglądanym układzie — ściśle (516): `systemIdOf` (brak pola = `sys_home`, `null` = skok — w żadnym). */
export function inActiveSystem(v, activeSystemId) {
  const s = systemIdOf(v);
  return s != null && s === activeSystemId;
}

/**
 * Obce statki wykryte TERAZ: aktywne pary wykrycia z dowolnym statkiem gracza (`ProximitySystem._activePairs` — klucze
 * „a|b”) albo wykrycie przez obserwatorium kolonii gracza.
 * @param {{ pairs?:Iterable<string>, isPlayerVesselId?:(id)=>boolean, observatoryDetected?:Iterable<string> }} p
 * @returns {Set<string>}
 */
export function detectedNowIds({ pairs = [], isPlayerVesselId = () => false, observatoryDetected = [] } = {}) {
  const out = new Set();
  for (const k of pairs ?? []) {
    const i = String(k).indexOf('|');
    if (i < 0) continue;
    const a = String(k).slice(0, i), b = String(k).slice(i + 1);
    const pa = isPlayerVesselId(a), pb = isPlayerVesselId(b);
    if (pa && !pb) out.add(b);
    else if (pb && !pa) out.add(a);
  }
  for (const id of observatoryDetected ?? []) out.add(String(id));
  return out;
}

/** Trasa obcego (D-HUD-10, 509): wykryty TERAZ i jakość ≥ `contact`; własny — zawsze. */
export function foreignRouteVisible({ isEnemy, quality, detectedNow }) {
  if (!isEnemy) return true;
  return detectedNow === true && isEndpointVisibleByQuality(true, quality);
}

/** Czy statek ma rysowaną trasę w tej klatce (układ ściśle + reguła obcych). */
export function routeVisible({ vessel, activeSystemId, quality = null, detectedNow = false }) {
  if (!inActiveSystem(vessel, activeSystemId)) return false;
  return foreignRouteVisible({ isEnemy: isEnemyVessel(vessel), quality, detectedNow });
}

/** Skok warp obcego — ta sama reguła obcych (w skoku pary wykrycia nie powstają — w praktyce niewidoczny). */
export function warpVisible({ vessel, quality = null, detectedNow = false }) {
  return foreignRouteVisible({ isEnemy: isEnemyVessel(vessel), quality, detectedNow });
}

/**
 * Przesunięcie wzoru kresek (marsz, D-HUD-12): `simClockMs` → px wzdłuż trasy (mod okres wzoru). `null` — 0 (statycznie).
 */
export function marchOffset(simMs, period = HUD_ROUTES.DASH[0] + HUD_ROUTES.DASH[1]) {
  if (!Number.isFinite(simMs) || !(period > 0)) return 0;
  const px = (simMs / 1000) * HUD_ROUTES.MARCH_PX_PER_S;
  return ((px % period) + period) % period;
}

/** Krycie trasy w części długości `u` ∈ [0, 1] (0 — statek, 1 — cel) × mnożnik poziomu uwagi. */
export function routeAlpha(u, mult = 1) {
  const x = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0));
  return (HUD_ROUTES.ALPHA_SHIP + (HUD_ROUTES.ALPHA_TARGET - HUD_ROUTES.ALPHA_SHIP) * x) * mult;
}

/** Mnożnik poziomu uwagi trasy: zaznaczony / najechany — 1, reszta — 0,25. */
export function routeAttention({ selected = false, hovered = false } = {}) {
  return (selected || hovered) ? 1 : HUD_ROUTES.ATTENTION_UNSELECTED;
}

/**
 * Łamana w świecie → biegi na ekranie, z przycięciem płaszczyzną bliską kamery (głębia liniowa wzdłuż odcinka).
 * @param {Array<{x,y,z}>} pts — punkty świata
 * @param {{ depth:(x,y,z)=>number, point:(x,y,z)=>{x,y}|null, near:number }} pr
 * @returns {number[][]} biegi `[x0, y0, x1, y1, …]` (px logiczne)
 */
export function projectPolyline(pts, pr) {
  const runs = [];
  let run = null;
  const near = pr.near ?? 0.01;
  const push = (p) => { const s = pr.point(p.x, p.y, p.z); if (!s) return false; (run ??= []).push(s.x, s.y); return true; };
  for (let i = 1; i < (pts?.length ?? 0); i++) {
    const a = pts[i - 1], b = pts[i];
    const da = pr.depth(a.x, a.y, a.z), db = pr.depth(b.x, b.y, b.z);
    const va = da >= near, vb = db >= near;
    if (!va && !vb) { if (run && run.length >= 4) runs.push(run); run = null; continue; }
    const lerp = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    const tc = (near - da) / (db - da);
    if (va && vb) {
      if (!run) push(a);
      push(b);
    } else if (va) {
      if (!run) push(a);
      push(lerp(tc));
      if (run && run.length >= 4) runs.push(run);
      run = null;
    } else {
      run = null;
      push(lerp(tc));
      push(b);
    }
  }
  if (run && run.length >= 4) runs.push(run);
  return runs;
}

/**
 * Pierwsze opuszczenie prostokąta przez łamaną `[{x, y}, …]` (Liang–Barsky na kolejnych odcinkach): odcinek, który przecina
 * prostokąt i kończy się poza nim. `null` — łamana nie opuszcza prostokąta (albo go nie dotyka).
 * @returns {{ index:number, point:{x,y} }|null} — `index`: początek odcinka wyjścia
 */
export function polylineRectExit(pts, rect) {
  for (let i = 1; i < (pts?.length ?? 0); i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1, hit = true;
    for (const [p, q] of [[-dx, a.x - rect.x], [dx, rect.x + rect.w - a.x], [-dy, a.y - rect.y], [dy, rect.y + rect.h - a.y]]) {
      if (p === 0) { if (q < 0) { hit = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { hit = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { hit = false; break; } if (r < t1) t1 = r; }
    }
    if (hit && t1 < 1) return { index: i - 1, point: { x: a.x + dx * t1, y: a.y + dy * t1 } };
  }
  return null;
}

/**
 * Promień skoku warp na ekranie: od punktu odlotu w kierunku `dir` (świat, płaszczyzna ekliptyki) do krawędzi kadru —
 * albo do punktu zbiegu (horyzontu), gdy promień ku niemu zmierza w kadrze. Próbki geometryczne od 0,5 AU, bisekcja na
 * krawędzi.
 * @param {{ start:{x,y,z}, dir:{x,z}, worldPerAU:number, toScreen:(x,y,z)=>{x,y}|null, rect:{x,y,w,h} }} p
 * @returns {{ pts:Array<{x,y}>, exit:{x,y}|null, edge:'left'|'right'|'top'|'bottom'|null }}
 */
export function warpScreenRay({ start, dir, worldPerAU, toScreen, rect }) {
  const inR = (s) => !!s && s.x >= rect.x && s.x <= rect.x + rect.w && s.y >= rect.y && s.y <= rect.y + rect.h;
  const at = (au) => toScreen(start.x + dir.x * au * worldPerAU, start.y, start.z + dir.z * au * worldPerAU);
  const s0 = toScreen(start.x, start.y, start.z);
  if (!s0) return { pts: [], exit: null, edge: null };
  const pts = [s0];
  let prevAu = 0, prevS = s0, exit = null;
  for (let i = 0; i < HUD_ROUTES.WARP_SAMPLES; i++) {
    const au = 0.5 * Math.pow(2, i);
    const s = at(au);
    if (!s) break;                                                         // za płaszczyzną bliską — koniec promienia
    if (inR(prevS) && !inR(s)) {
      // Bisekcja: pierwszy punkt poza kadrem.
      let lo = prevAu, hi = au;
      for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2, sm = at(mid); if (sm && inR(sm)) lo = mid; else hi = mid; }
      exit = at(lo);
      if (exit) pts.push(exit);
      break;
    }
    pts.push(s);
    prevAu = au; prevS = s;
  }
  if (!exit) {
    // Punkt odlotu poza kadrem: promień może przeciąć kadr między próbkami (odstęp próbek rośnie dwukrotnie) — wyjście =
    // miejsce, w którym łamana opuszcza prostokąt (prosta przecina wypukły prostokąt najwyżej raz); łamana kończy się tam.
    const cut = polylineRectExit(pts, rect);
    if (cut) { pts.length = cut.index + 1; pts.push(cut.point); exit = cut.point; }
  }
  if (!exit && pts.length > 1 && inR(pts[pts.length - 1])) exit = pts[pts.length - 1];   // punkt zbiegu w kadrze
  let edge = null;
  if (exit) {
    const d = { left: exit.x - rect.x, right: rect.x + rect.w - exit.x, top: exit.y - rect.y, bottom: rect.y + rect.h - exit.y };
    edge = Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
  }
  return { pts, exit, edge };
}
