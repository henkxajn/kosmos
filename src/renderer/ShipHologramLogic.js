// ShipHologramLogic — czysta logika hologramu statku (ARC KONSOLE, krok K1a; docs/design/CONSOLES_PLAN.md §2 B1–B4,
// D-K-4 / D-K-7 / D-K-10 / D-K-11). Bez Three.js i bez DOM — importowalna w node (keeper `ship_hologram_smoke`).
//
// Zawiera: klucz modelu dla projektu (kadłub + moduły — D-K-10: model podąża za VesselModelResolver na żywo), kolejność
// ścieżek wczytywania, pokrętła wyglądu (live, `KOSMOS.debug.holo.tune`), decyzję fallbacku (D-K-11), medianę czasu klatki
// i budżet, decyzję «renderować tę klatkę?» (0 pracy GPU w bezczynności), parametry kamery (3/4 i «plan»), przenikanie.

import { HULLS } from '../data/HullsData.js';
import { calcShipStats } from '../data/ShipModulesData.js';
import { resolveVesselModelKey, VESSEL_MODEL_DIR, VESSEL_MODEL_KEYS } from './VesselModelResolver.js';

// ── Pokrętła wyglądu (owner tuning; liczby, skutek od następnej klatki) ──────────────────────────────────────────────
// edgeAngle [°]  — próg kąta EdgesGeometry (Meshy przy 30° daje więcej szumu, ale właściciel wybrał gęstszy detal — 30°, K1a)
// edgeAlpha [0–1] — krycie linii krawędzi (krawędzie = detal, obwódka niesie sylwetkę)
// rim [×]        — siła obwódki fresnela (dominująca)
// scan [0–1]     — głębokość linii skanowania (ekranowych)
// spin [rad/s]   — prędkość auto-obrotu w widoku 3/4
// budgetMs [ms]  — budżet mediany czasu klatki hologramu (GPU); przekroczony ⇒ sylwetka (D-K-11)
// xray [0|1]     — 0: kadłub zasłania tylne krawędzie i wnętrze (przebieg głębi), 1: prześwit (jak prototyp fazy A)
export const HOLO_TUNING_DEFAULTS = Object.freeze({ edgeAngle: 30, edgeAlpha: 0.22, rim: 1.0, scan: 0.22, spin: 0.25, budgetMs: 4, xray: 0 });
export const HOLO_KNOB_RANGES = Object.freeze({
  edgeAngle: [1, 89], edgeAlpha: [0, 1], rim: [0, 4], scan: [0, 1], spin: [0, 6], budgetMs: [0.1, 100], xray: [0, 1],
});
export const HOLO_TUNING = { ...HOLO_TUNING_DEFAULTS };

/** Wpisuje liczby z `patch` w klamrze zakresu; inne klucze / nie-liczby pominięte. Zwraca kopię stanu. */
export function tuneHologram(patch = {}, target = HOLO_TUNING) {
  for (const [k, v] of Object.entries(patch ?? {})) {
    const r = HOLO_KNOB_RANGES[k];
    if (!r || typeof v !== 'number' || !Number.isFinite(v)) continue;
    target[k] = Math.min(r[1], Math.max(r[0], v));
  }
  return { ...target };
}
export function resetHologramTuning(target = HOLO_TUNING) { Object.assign(target, HOLO_TUNING_DEFAULTS); return { ...target }; }

// ── Klucz modelu (D-K-10) ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Klucz modelu dla projektu w stoczni: ta sama reguła co statek na mapie (`resolveVesselModelKey`) — oś warp z pojemności
 * Komór Warp wyliczonej z modułów (`calcShipStats().warpFuelCapacity > 0` ⇔ `warpFuel.max > 0` statku), rola cywilna z modułów.
 * @param {string} hullId @param {string[]} [moduleIds]
 */
export function designModelKey(hullId, moduleIds = []) {
  const mods = Array.isArray(moduleIds) ? moduleIds.filter((m) => typeof m === 'string') : [];
  const hull = HULLS[hullId] ?? null;
  let warpMax = 0;
  if (hull) { try { warpMax = calcShipStats(hull, mods)?.warpFuelCapacity ?? 0; } catch (e) { warpMax = 0; } }
  return resolveVesselModelKey({ shipId: hullId, modules: mods, warpFuel: { max: warpMax } });
}

export const COMBAT_MODEL_CLASSES = Object.freeze(['frigate', 'destroyer', 'battleship']);
export function isCombatModelKey(key) { return COMBAT_MODEL_CLASSES.some((c) => key === `nonwarp_${c}` || key === `warp_${c}`); }
export function isKnownModelKey(key) { return VESSEL_MODEL_KEYS.includes(key); }

/**
 * Kolejność ścieżek do wczytania modelu: kadłuby bojowe (normalize-ship@1, mają wariant `@1k`) — najpierw `@1k` (ta sama
 * siatka, tekstury mniejsze; hologram tekstur i tak nie próbkuje), potem plik 2K; cywilne — plik 2K; na końcu `default.glb`.
 */
export function modelLoadPaths(key) {
  const base = VESSEL_MODEL_DIR + key + '.glb';
  const out = isCombatModelKey(key) ? [VESSEL_MODEL_DIR + key + '@1k.glb', base] : [base];
  out.push(VESSEL_MODEL_DIR + 'default.glb');
  return out;
}

/** Następny / poprzedni klucz w kolejności `VESSEL_MODEL_KEYS` (podgląd debug). */
export function cycleModelKey(key, dir = 1) {
  const keys = VESSEL_MODEL_KEYS, n = keys.length;
  const i = keys.indexOf(key);
  if (i < 0) return keys[dir < 0 ? n - 1 : 0];
  return keys[(i + (dir < 0 ? -1 : 1) + n) % n];
}

// ── Fallback (D-K-11) ────────────────────────────────────────────────────────────────────────────────────────────────

export const FALLBACK_REASONS = Object.freeze(['forced', 'context_failed', 'context_lost', 'budget']);

/** Sylwetka zamiast hologramu? Priorytet przyczyn: wymuszona > brak kontekstu > kontekst utracony > budżet. */
export function fallbackState({ forced = false, contextFailed = false, contextLost = false, budgetTripped = false } = {}) {
  const reason = forced ? 'forced' : contextFailed ? 'context_failed' : contextLost ? 'context_lost' : budgetTripped ? 'budget' : null;
  return { fallback: reason !== null, reason };
}

export function median(values) {
  const a = (values ?? []).filter((v) => Number.isFinite(v)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export const HOLO_SAMPLE_WINDOW = 15;        // próbek w oknie mediany
export const HOLO_BUDGET_MIN_SAMPLES = 8;    // tyle próbek, zanim budżet może się «przełączyć»

/** Dopisuje próbkę [ms] do okna (zwraca nową tablicę — najwyżej `max` ostatnich). */
export function pushSample(samples, ms, max = HOLO_SAMPLE_WINDOW) {
  if (!Number.isFinite(ms) || ms < 0) return samples.slice();
  const out = samples.concat([ms]);
  return out.length > max ? out.slice(out.length - max) : out;
}

/** Budżet przekroczony: mediana okna > budżet, przy co najmniej `minSamples` próbkach. */
export function budgetExceeded(samples, budgetMs, minSamples = HOLO_BUDGET_MIN_SAMPLES) {
  if ((samples?.length ?? 0) < minSamples) return false;
  const m = median(samples);
  return m !== null && m > budgetMs;
}

/**
 * Próbkowanie czasu GPU bez zapytań czasomierza (synchroniczny odczyt 1 px): pierwsze `warm` renderów po zmianie
 * (model / tryb / rozmiar), potem co `every`-ty — żeby bezczynny koszt pomiaru był znikomy.
 */
export function shouldSyncSample(renderIndexSinceChange, warm = 12, every = 90) {
  return renderIndexSinceChange < warm || renderIndexSinceChange % every === 0;
}

// ── Decyzja klatki ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Renderować hologram w tej klatce? Tylko gdy gospodarz widoczny ORAZ coś się zmieniło albo trwa animacja (obrót, przenikanie). */
export function shouldRender({ visible = false, dirty = false, spinning = false, fading = false } = {}) {
  return !!visible && (!!dirty || !!spinning || !!fading);
}

export const HOLO_FADE_MS = 220;
/** Postęp przenikania 0…1 (1 = koniec / brak przenikania). */
export function fadeProgress(t0, now, ms = HOLO_FADE_MS) {
  if (!Number.isFinite(t0) || ms <= 0) return 1;
  return Math.min(1, Math.max(0, (now - t0) / ms));
}

// ── Kamera ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Model w ramie wyświetlania: znormalizowany (najdłuższy wymiar 1, środek 0), dziób → −X (w lewo ekranu przy kamerze na +Z),
// góra +Y. Widok 3/4: kamera lekko nad, z przodu-z lewej (dziób w lewo i ku widzowi). «Plan»: ortogonalnie z boku.

export const HOLO_VIEW = Object.freeze({ FOV: 30, AZIMUTH_DEG: -38, ELEVATION_DEG: 20, FIT_R: 0.62, PLAN_HALF_LEN: 0.58 });

/** Parametry kamery dla trybu `'3q' | 'plan'` i proporcji obrazu. */
export function holoCameraSpec(mode, aspect) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (mode === 'plan') {
    const halfW = Math.max(HOLO_VIEW.PLAN_HALF_LEN, HOLO_VIEW.PLAN_HALF_LEN * 0.75 * a);
    return { type: 'ortho', halfW, halfH: halfW / a, pos: [0, 0, 3], target: [0, 0, 0], up: [0, 1, 0] };
  }
  const half = (HOLO_VIEW.FOV / 2) * Math.PI / 180;
  // dopasowanie w krótszym wymiarze kadru
  const tanV = Math.tan(half), tanH = tanV * a;
  const dist = HOLO_VIEW.FIT_R / Math.min(tanV, tanH);
  const az = HOLO_VIEW.AZIMUTH_DEG * Math.PI / 180, el = HOLO_VIEW.ELEVATION_DEG * Math.PI / 180;
  return { type: 'persp', fov: HOLO_VIEW.FOV, near: 0.01, far: dist * 4,
    pos: [dist * Math.sin(az) * Math.cos(el), dist * Math.sin(el), dist * Math.cos(az) * Math.cos(el)], target: [0, 0, 0], up: [0, 1, 0] };
}

/** Odchylenie modelu [rad] w chwili `tSec` (obrót tylko w 3/4 i tylko z włączonym spinem). */
export function holoYaw(mode, spinOn, spinRadPerSec, tSec) {
  if (mode !== '3q' || !spinOn) return 0;
  return (spinRadPerSec || 0) * (tSec || 0);
}

// ── Sylwetka: rzut ortogonalny segmentów (bok + góra) do prostokąta ───────────────────────────────────────────────────

/**
 * Układ «rysunku technicznego» w prostokącie `w × h` (sylwetka i widok plan): bok (x, y) u góry, góra (x, z) u dołu.
 * Kadr z PRAWDZIWYCH zasięgów modelu w ramie wyświetlania (`extent` — min/max x, y, z): wysokości pasów w proporcji
 * zasięgów y : z, skala wspólna (ta sama długość statku w obu widokach), każdy widok wyśrodkowany na swoim zasięgu.
 * (K1a, poprawka po oglądaniu: dawniej pasy stałe 58/42 % i skala zakładająca |z| ≤ 0,3 — szerokie burty wychodziły z pasa.)
 */
export const TECH_PAD = 0.06;      // margines [ułamek krótszego boku]
export const TECH_FIT = 0.94;      // zapas skali wewnątrz pasów
export function technicalLayout(w, h, extent = null) {
  const e = extent ?? { min: [-0.5, -0.25, -0.25], max: [0.5, 0.25, 0.25] };
  const xR = Math.max(1e-3, e.max[0] - e.min[0]), yR = Math.max(1e-3, e.max[1] - e.min[1]), zR = Math.max(1e-3, e.max[2] - e.min[2]);
  const pad = Math.round(Math.min(w, h) * TECH_PAD);
  const avail = Math.max(2, h - pad * 3);
  const sideH = Math.max(1, Math.round(avail * yR / (yR + zR))), topH = Math.max(1, avail - sideH);
  const len = Math.min((w - pad * 2) / xR, sideH / yR, topH / zR) * TECH_FIT;   // 1 j. modelu w px
  const mid = [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, (e.min[2] + e.max[2]) / 2];
  const side = { x: 0, y: pad, w, h: sideH }, top = { x: 0, y: pad * 2 + sideH, w, h: topH };
  const cx = w / 2, sideCy = side.y + sideH / 2, topCy = top.y + topH / 2;
  return {
    scale: len, mid, side, top,
    sideXY: (x, y) => [cx + (x - mid[0]) * len, sideCy - (y - mid[1]) * len],
    topXZ: (x, z) => [cx + (x - mid[0]) * len, topCy + (z - mid[2]) * len],
  };
}

/**
 * Kamera ortogonalna jednego widoku planu (`'side' | 'top'`) dopasowana do pasa układu — ten sam rzut co sylwetka:
 * bok — z +Z, góra +Y; góra — z +Y w dół, «góra ekranu» = −Z (burta +Z w dół ekranu, dziób −X w lewo).
 */
export function planViewCamera(view, layout) {
  const r = layout[view], len = layout.scale || 1, m = layout.mid;
  const halfW = r.w / 2 / len, halfH = r.h / 2 / len;
  if (view === 'top') return { halfW, halfH, pos: [m[0], 3, m[2]], target: [m[0], 0, m[2]], up: [0, 0, -1], rect: r };
  return { halfW, halfH, pos: [m[0], m[1], 3], target: [m[0], m[1], 0], up: [0, 1, 0], rect: r };
}

/** Prostokąt podglądu debug (900×640 logicznych, wyśrodkowany, w klamrze ekranu). */
export function debugViewerRect(viewW, viewH, w = 900, h = 640) {
  const rw = Math.min(w, Math.max(80, viewW - 32)), rh = Math.min(h, Math.max(60, viewH - 32));
  return { x: Math.round((viewW - rw) / 2), y: Math.round((viewH - rh) / 2), w: rw, h: rh };
}
