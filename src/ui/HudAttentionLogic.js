// HudAttentionLogic — ARKUSZ HUD paczka B (B-1; D-HUD-11, D-HUD-12, D-HUD-c; HUD_PLAN.md §4.5): czysta logika MODELU UWAGI
// i NAWIASÓW zaznaczenia warstwy HUD 2D. Rysunek — `HudLabelLayer` (krycie etykiet), `HudRouteLayer` (krycie tras),
// `HudFocusLayer` (nawiasy).
// Czysty: bez three i bez DOM, bez `window`; ZERO kolorów na sztywno (role z `HudPalette.resolveHudRoles` podaje wołający).
// Wielkości w px LOGICZNYCH UI (skala jak `#ui-canvas`).
//   • uwaga (D-HUD-11): gdy coś jest zaznaczone (statek, zbiór, flota, ciało, stacja) ALBO trwa alert — etykiety
//     niezaznaczone `LABEL_DIM`, trasy niezaznaczone `ROUTE_DIM`; zaznaczone, przypięte, alertowane i najechane — 1,0.
//     Brak zaznaczenia i alertu — dzisiejsze wartości (etykiety 1,0; trasa niezaznaczona 0,25 — stała H3);
//   • przejście `FADE_MS` czasu REALNEGO — reakcja jednorazowa na akcję gracza (D-HUD-12: działa w pauzie), bez pulsowania;
//     etykieta, która pojawia się w trakcie, startuje od razu na swoim poziomie (pojawienie się niesie fade-in H2);
//   • nawiasy ⌜ ⌟ (D-HUD-c) w rogach tarczy zaznaczonego ciała / stacji / statku: odstęp od tarczy stały w px, linia
//     `BRACKET_WIDTH` w roli `primary`, „oddech” krycia `BREATH_LO` ↔ `BREATH_HI` na zegarze symulacji `simClockMs` (pauza —
//     statycznie; przed pierwszym tikiem — `BREATH_HI`); tarcza ciała / stacji mniejsza niż `BRACKET_MIN_DISC_PX` (średnica) —
//     bez nawiasów (zostaje etykieta 1,0); statek — nawiasy zawsze, co najmniej ramka RTS (`SHIP_MIN_HALF_PX`, lustro
//     `UIManager._drawBracketForVessel`: s = 17), bo to dziś jedyny znacznik zaznaczonego statku (paski paliwa pod nią);
//     gasną przy bliskim zoomie (bok nawiasów ≥ `FADE_LARGE_FROM` × kadr); narożnik pod przypiętą albo rozwiniętą etykietą
//     — pominięty (rozwinięcie ma pierwszeństwo).

/** Flaga paczki B — `true` wyłącznie przy `features.hudAttention === true` (brak klucza = OFF). */
export const isHudAttentionOn = (features) => features?.hudAttention === true;

// Stałe (px logiczne, ms). Strojenie na bramce — z konsoli: `KOSMOS.hudLayer.tune({ LABEL_DIM: 0.3 })` (przeżywa do F5).
export const HUD_ATTENTION_DEFAULTS = Object.freeze({
  LABEL_DIM: 0.38,          // etykiety niezaznaczone przy zaznaczeniu / alercie
  ROUTE_DIM: 0.25,          // trasy niezaznaczone (= stała H3 `HUD_ROUTES.ATTENTION_UNSELECTED`)
  FADE_MS: 200,             // przejście poziomu uwagi — czas realny
  BRACKET_GAP_PX: 5,        // odstęp nawiasów od tarczy
  BRACKET_ARM_PX: 7,        // ramię narożnika (najwyżej)
  BRACKET_ARM_FRAC: 0.3,    // … i najwyżej taka część boku (mała tarcza — narożniki nie zlewają się w kwadrat)
  BRACKET_WIDTH: 1,         // linia nawiasów
  BRACKET_MIN_DISC_PX: 6,   // tarcza ciała / stacji (średnica) mniejsza — bez nawiasów
  SHIP_MIN_HALF_PX: 17,     // statek — połowa boku co najmniej jak ramka RTS
  SHIP_SET_ALPHA: 0.55,     // pozostali członkowie zbioru statków (lustro ramek RTS: prowadzący jaśniej)
  BREATH_LO: 0.7,           // oddech nawiasów — krycie najniższe …
  BREATH_HI: 1.0,           // … i najwyższe
  BREATH_MS: 2000,          // okres oddechu (zegar symulacji)
  FADE_LARGE_FROM: 0.45,    // nawiasy gasną przy bliskim zoomie: bok / min(szer., wys.) kadru od …
  FADE_LARGE_TO: 0.6,       // … do (zero)
});
export const HUD_ATTENTION = { ...HUD_ATTENTION_DEFAULTS };

const A = HUD_ATTENTION;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ── Uwaga ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Czy działa model uwagi: coś jest zaznaczone (`readClickSelection`: zbiór statków, prowadzący, ciało, stacja, flota) albo
 * trwa alert. Ping wroga (`pingedEnemyId`) nie jest zaznaczeniem.
 */
export function focusActive(sel, alertCount = 0) {
  if (alertCount > 0) return true;
  if (!sel) return false;
  return (Array.isArray(sel.vesselIds) && sel.vesselIds.length > 0) || sel.leadId != null || sel.entityId != null
    || sel.stationId != null || sel.fleetId != null;
}

/** Zbiór statków „zaznaczonych” dla uwagi: zbiór + prowadzący + członkowie zaznaczonej floty (`fleetMemberIds`). */
export function focusVesselIds(sel, fleetMemberIds = []) {
  const out = new Set();
  for (const id of sel?.vesselIds ?? []) out.add(String(id));
  if (sel?.leadId != null) out.add(String(sel.leadId));
  for (const id of fleetMemberIds ?? []) out.add(String(id));
  return out;
}

/** Docelowe krycie etykiety: bez uwagi — 1; z uwagą — 1 dla zaznaczonej / przypiętej / alertowanej / najechanej, reszta `LABEL_DIM`. */
export function labelAttentionTarget({ focus = false, selected = false, pinned = false, alerted = false, hovered = false } = {}) {
  if (!focus) return 1;
  return (selected || pinned || alerted || hovered) ? 1 : A.LABEL_DIM;
}

/** Docelowy mnożnik krycia trasy: zaznaczona / najechana / alertowana — 1, reszta `ROUTE_DIM` (także bez uwagi — jak H3). */
export function routeAttentionTarget({ selected = false, hovered = false, alerted = false } = {}) {
  return (selected || hovered || alerted) ? 1 : A.ROUTE_DIM;
}

/**
 * Pamięć poziomów uwagi (przejście `FADE_MS` czasu realnego). Klucz bez wpisu startuje od razu na celu; zmiana celu — od
 * bieżącej wartości do nowego celu liniowo. `animating` — czy w ostatnim kroku któryś klucz był w trakcie przejścia.
 */
export function makeAttentionMemory() {
  const m = new Map();       // klucz → { from, to, t0 }
  let animating = false;
  const valueOf = (e, now) => {
    const u = A.FADE_MS > 0 ? clamp01((now - e.t0) / A.FADE_MS) : 1;
    return e.from + (e.to - e.from) * u;
  };
  return {
    /** Wartość klucza w chwili `now` przy celu `target` (zapamiętuje cel). */
    step(key, target, now) {
      let e = m.get(key);
      if (!e) { e = { from: target, to: target, t0: now }; m.set(key, e); return target; }
      if (e.to !== target) { e = { from: valueOf(e, now), to: target, t0: now }; m.set(key, e); }
      const v = valueOf(e, now);
      if (v !== e.to) animating = true;
      return v;
    },
    /** Początek klatki: zeruje znacznik animacji. */
    begin() { animating = false; },
    /** Koniec klatki: zapomina klucze nieobecne w klatce. */
    prune(alive) {
      const keep = alive instanceof Set ? alive : new Set(alive ?? []);
      for (const k of [...m.keys()]) if (!keep.has(k)) m.delete(k);
    },
    get animating() { return animating; },
    get size() { return m.size; },
    peek(key) { return m.get(key) ?? null; },
  };
}

// ── Nawiasy ⌜ ⌟ ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Oddech nawiasów (D-HUD-12): krycie `BREATH_HI` → `BREATH_LO` → `BREATH_HI` w okresie `BREATH_MS` zegara symulacji; brak zegara — `BREATH_HI`. */
export function breathAlpha(simMs) {
  if (!Number.isFinite(simMs) || !(A.BREATH_MS > 0)) return A.BREATH_HI;
  const ph = ((simMs % A.BREATH_MS) + A.BREATH_MS) % A.BREATH_MS / A.BREATH_MS;
  const w = 0.5 + 0.5 * Math.cos(2 * Math.PI * ph);    // 1 na początku okresu
  return A.BREATH_LO + (A.BREATH_HI - A.BREATH_LO) * w;
}

/**
 * Kwadrat nawiasów wokół tarczy obiektu (px logiczne).
 * @param {{ cx:number, cy:number, discR:number, kind:'body'|'station'|'vessel', frame?:{w:number,h:number} }} p — `discR`
 *   promień tarczy na ekranie; `frame` — obszar mapy (gaśnięcie przy bliskim zoomie)
 * @returns {{ cx:number, cy:number, half:number, arm:number, fade:number }|null} — `null`: bez nawiasów
 */
export function bracketBox({ cx, cy, discR = 0, kind = 'body', frame = null }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const r = Number.isFinite(discR) && discR > 0 ? discR : 0;
  let half;
  if (kind === 'vessel') half = Math.max(A.SHIP_MIN_HALF_PX, r + A.BRACKET_GAP_PX);
  else {
    if (2 * r < A.BRACKET_MIN_DISC_PX) return null;
    half = r + A.BRACKET_GAP_PX;
  }
  let fade = 1;
  const fm = frame ? Math.min(frame.w, frame.h) : 0;
  if (fm > 0) {
    const f = (2 * half) / fm;
    if (f >= A.FADE_LARGE_TO) return null;
    if (f > A.FADE_LARGE_FROM) fade = 1 - (f - A.FADE_LARGE_FROM) / (A.FADE_LARGE_TO - A.FADE_LARGE_FROM);
  }
  const arm = Math.max(1, Math.min(A.BRACKET_ARM_PX, 2 * half * A.BRACKET_ARM_FRAC));
  return { cx, cy, half, arm, fade };
}

/**
 * Cztery narożniki nawiasów: łamana [x0, y0, x1, y1, x2, y2] (ramię pionowe → narożnik → ramię poziome) i prostokąt
 * obejmujący narożnik (odcięcie pod etykietą).
 */
export function bracketCorners(box) {
  if (!box) return [];
  const { cx, cy, half: s, arm: L } = box;
  const c = (x, y, dx, dy, id) => ({ id, pts: [x, y + dy * L, x, y, x + dx * L, y],
    rect: { x: Math.min(x, x + dx * L), y: Math.min(y, y + dy * L), w: L, h: L } });
  return [c(cx - s, cy - s, +1, +1, 'tl'), c(cx + s, cy - s, -1, +1, 'tr'), c(cx - s, cy + s, +1, -1, 'bl'), c(cx + s, cy + s, -1, -1, 'br')];
}

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Narożniki, które NIE wchodzą na żaden z prostokątów (przypięta / rozwinięta etykieta ma pierwszeństwo). */
export function dropCornersUnder(corners, rects = []) {
  return (corners ?? []).filter((c) => !(rects ?? []).some((r) => r && hit(c.rect, r)));
}

// ── Strojenie ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Strojenie stałych uwagi i nawiasów: nieznane klucze pominięte; zwraca bieżące wartości. */
export function tuneHudAttention(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) if (k in HUD_ATTENTION_DEFAULTS && Number.isFinite(v)) HUD_ATTENTION[k] = v;
  return { ...HUD_ATTENTION };
}
export function resetHudAttention() { Object.assign(HUD_ATTENTION, HUD_ATTENTION_DEFAULTS); return { ...HUD_ATTENTION }; }
