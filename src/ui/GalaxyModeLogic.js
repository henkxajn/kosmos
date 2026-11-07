// GalaxyModeLogic — ARC GALAXY, krok G1 (docs/design/GALAXY_PLAN.md §4 G1; D-GX-1, D-GX-2, D-GX-3, D-GX-8, D-GX-13):
// CZYSTA logika trybu galaktyki głównego widoku 3D — jednostka płyty, kotwica (aktywny układ w początku świata),
// plany wejścia / wyjścia (migawka kamery systemu → przywrócenie 1:1), preset kamery, prawo zoomu, pan po stałym skosie,
// wybór gwiazdy z ekranu, bramka „da się wejść”, wygląd punktów płyty, kandydaci etykiet, rozkład pigułki trybu mapy.
// Orkiestracja — `GalaxyModeController`; płyta — `renderer/GalaxyPlate.js`; kamera — `ThreeCameraController` (gałąź galaxy).
//
//   • JEDNOSTKA (D-GX-1 (c)): płyta jest autorowana w ly w jednej grupie, `group.scale = GALAXY_K` (200 j. świata / ly);
//     K to jedna stała — przy K = 200 krąg orbit aktywnego układu (do 385 j. = 1,93 ly) nie przykrywa żadnego sąsiada
//     (faza A: 40 ziaren, 0 / 0).
//   • KOTWICA (D-GX-2 (b)): w początku świata stoi AKTYWNY układ — `group.position = −P_active · K`; dla domu to dokładnie
//     „dom w początku” z ramy F1. Względne położenia gwiazd nie zależą od kotwicy (niezmiennik przesunięcia — keeper).
//   • OSIE: galaktyka (x, y w płaszczyźnie, z = grubość dysku) → świat Three: X = gx, Y = gz (wysokość), Z = gy — to samo
//     odwzorowanie co niebo (`SkyCatalog`) i `HolotableCamera` (dawniej także `StratcomGalaxyRenderer`).
//   • KAMERA (D-GX-3): preset skos 0,92 / azymut 0,6 / dystans = `fitDist` mapy Stratcom × K (≈ 57 ly · K); zakres
//     6 ly · K … 120 ly · K; zoom MNOŻNIKOWY ×1,12 / ×0,89 na znormalizowane 100 px kółka; przeciąganie = PAN po stałym
//     skosie (`HolotableCamera.panScreenToWorld`), cel w ±30 ly · K wokół środka galaktyki (domu); far 40 000 (system 5 000).
//   • WYBÓR GWIAZDY (R2): najbliższy środek wśród rzutów gwiazd — reguła `StratcomHitLogic.pickStarZone` (Finding 109):
//     strefy kwadratowe, przy remisie wygrywa późniejsza.
//   • WEJŚCIE (D-GX-13 — bramka Findingu 186): układ da się otworzyć ⇔ jest wygenerowany ∧ (zbadany ∨ własna obecność —
//     kolonia, placówka, stacja, statek, wojska; ta sama reguła obecności co lewy outliner w trybie układu, Findingi
//     480 / 489 — zapisy sprzed naprawy 186 mają układ z kolonią gracza z `explored = false`).
// Czysty: bez three, bez DOM, bez `window`. Importy — wyłącznie moduły czyste.

import { pickStarZone } from './StratcomHitLogic.js';
import { DEFAULT_OBLIQUE_PITCH, panScreenToWorld } from '../renderer/HolotableCamera.js';
import { labelCandidates } from './HudLabelLogic.js';
import { SKY_CLASS_RGB } from '../utils/SkyCatalog.js';

// ── Stałe trybu ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const GALAXY_K = 200;                      // j. świata na 1 ly (D-GX-1 (c))
export const GALAXY_LAYER = 1;                    // warstwa three płyty (kamera w trybie galaktyki widzi tylko ją + niebo)
export const CAMERA_FAR = Object.freeze({ system: 5000, galaxy: 40000 });   // [j.] — system bit w bit jak przed krokiem
export const GALAXY_CAMERA = Object.freeze({
  PITCH: DEFAULT_OBLIQUE_PITCH,   // od zenitu = `_phi` kontrolera (ta sama konwencja co `HolotableCamera.orbitPosition`)
  YAW: 0.6,                       // azymut = `_theta` kontrolera (Stratcom `_galaxyYaw`)
  FLOOR_LY: 6,                    // podłoga dystansu [ly]
  MAX_LY: 120,                    // sufit dystansu [ly]
  PAN_LY: 30,                     // cel kamery w ±30 ly wokół środka galaktyki (dom), osobno w X i Z (jak Stratcom)
  FIT_FALLBACK_LY: 57,            // preset bez galaktyki
});
export const GALAXY_ZOOM = Object.freeze({ OUT: 1.12, IN: 0.89, NOTCH_PX: 100, LINE_PX: 33 });
export const GALAXY_FADE_MS = 250;               // twarde cięcie: rozjaśnienie płyty i etykiet [ms czasu realnego]
export const GALAXY_DOUBLE_CLICK_MS = 400;       // dwuklik gwiazdy płyty = wejście
export const GALAXY_PICK_HALF_PX = 11;           // [px logiczne] połowa boku strefy gwiazdy (Stratcom 22 × 22)

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ── Osie i kotwica (D-GX-2) ──────────────────────────────────────────────────────────────────────────────────────────

/** Położenie układu w osiach ŚWIATA [ly]: X = gx, Y = gz, Z = gy. */
export function galaxyLyToWorld(sys) {
  return { x: num(sys?.x), y: num(sys?.z), z: num(sys?.y) };
}

/** Rekord układu po id (`galaxyData.systems`); brak — `null`. */
export function systemById(systems, id) {
  if (!Array.isArray(systems) || id == null) return null;
  const k = String(id);
  return systems.find((s) => s && String(s.id) === k) ?? null;
}

/** Kotwica płyty [ly, osie świata] — położenie AKTYWNEGO układu; brak w galaktyce — początek (dom). */
export function galaxyAnchorLy(systems, activeId) {
  const s = systemById(systems, activeId);
  return s ? galaxyLyToWorld(s) : { x: 0, y: 0, z: 0 };
}

/** Położenie grupy płyty [j.]: −P_active · K (aktywny układ w początku świata). */
export function plateGroupPosition(anchorLy, K = GALAXY_K) {
  return { x: -num(anchorLy?.x) * K, y: -num(anchorLy?.y) * K, z: -num(anchorLy?.z) * K };
}

/** Położenie gwiazdy w świecie [j.] przy danej kotwicy. */
export function plateWorldOf(sys, anchorLy, K = GALAXY_K) {
  const w = galaxyLyToWorld(sys);
  return { x: (w.x - num(anchorLy?.x)) * K, y: (w.y - num(anchorLy?.y)) * K, z: (w.z - num(anchorLy?.z)) * K };
}

// ── Kamera (D-GX-3) ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Dystans kadru całej galaktyki [ly] — dawna reguła `StratcomGalaxyRenderer.fitDist` (rozrzut od domu). */
export function galaxyFitDistLy(systems) {
  let maxR = 0;
  for (const s of (Array.isArray(systems) ? systems : [])) {
    const d = Math.hypot(num(s?.x), num(s?.y), num(s?.z));
    if (d > maxR) maxR = d;
  }
  if (!(maxR > 0)) return GALAXY_CAMERA.FIT_FALLBACK_LY;
  const unit = Math.max(0.35, maxR * 0.022);
  return Math.max(8, maxR * 2.4 + unit * 10);
}

/**
 * Konfiguracja kamery trybu galaktyki [j.]: podłoga, sufit, dystans presetu, środek panu (dom w świecie) i połowa zakresu.
 * @returns {{ minDist:number, maxDist:number, presetDist:number, panCenter:{x:number,z:number}, panHalf:number, far:number,
 *   pitch:number, yaw:number }}
 */
export function galaxyCameraConfig(systems, activeId, K = GALAXY_K) {
  const anchor = galaxyAnchorLy(systems, activeId);
  const minDist = GALAXY_CAMERA.FLOOR_LY * K, maxDist = GALAXY_CAMERA.MAX_LY * K;
  // Mnożnik presetu (pokrętło `PRESET_DIST_MUL`, czytane przy każdym Home); wartość niedodatnia — 1 = kadr Stratcomu ≈ 57 ly.
  const mul = Number(LIVE_GALAXY.PRESET_DIST_MUL) > 0 ? Number(LIVE_GALAXY.PRESET_DIST_MUL) : 1;
  const presetDist = clamp(galaxyFitDistLy(systems) * K * mul, minDist, maxDist);
  return {
    minDist, maxDist, presetDist,
    panCenter: { x: -anchor.x * K, z: -anchor.z * K },   // środek galaktyki = dom w świecie
    panHalf: GALAXY_CAMERA.PAN_LY * K,
    far: CAMERA_FAR.galaxy,
    pitch: GALAXY_CAMERA.PITCH, yaw: GALAXY_CAMERA.YAW,
  };
}

/** Widok presetu (klawisz Home w trybie galaktyki): skos, azymut, dystans kadru, cel = aktywny układ (początek). */
export function galaxyPresetView(cfg) {
  return { theta: cfg.yaw, phi: cfg.pitch, dist: cfg.presetDist, target: { x: 0, y: 0, z: 0 } };
}

/**
 * Plan WEJŚCIA (wzór `TacticalModeLogic`): migawka kamery systemu do przywrócenia 1:1 + widok do zastosowania.
 * @param {{ camera: object, systems?: Array, activeId?: string, K?: number }} src — `camera` = `snapshotView()`
 */
export function buildGalaxyEnterPlan(src = {}) {
  const cfg = galaxyCameraConfig(src.systems, src.activeId, src.K ?? GALAXY_K);
  const cam = src.camera ?? null;
  return {
    snapshot: { camera: cam ? { ...cam, target: cam.target ? { ...cam.target } : null } : null, activeId: src.activeId ?? null },
    apply: galaxyPresetView(cfg),
    config: cfg,
  };
}

/** Plan WYJŚCIA — DOKŁADNIE migawka sprzed wejścia (wymóg 1:1). */
export function buildGalaxyExitPlan(snapshot = {}) {
  return { camera: snapshot?.camera ?? null };
}

/**
 * Znormalizowane piksele kółka: tryb linii (`deltaMode` 1) × LINE_PX, strony (2) × wysokość okna; piksele bez zmian.
 */
export function normalizedWheelPx(deltaY, deltaMode = 0, viewportH = 800) {
  const d = num(deltaY);
  if (deltaMode === 1) return d * GALAXY_ZOOM.LINE_PX;
  if (deltaMode === 2) return d * (viewportH > 0 ? viewportH : 800);
  return d;
}

/** Mnożnik dystansu z kółka: ×1,12 na każde 100 px od siebie (dalej), ×0,89 do siebie (bliżej). */
export function galaxyZoomFactor(deltaY, deltaMode = 0, viewportH = 800) {
  const px = normalizedWheelPx(deltaY, deltaMode, viewportH);
  if (!(px !== 0) || !Number.isFinite(px)) return 1;
  const notches = Math.abs(px) / GALAXY_ZOOM.NOTCH_PX;
  return Math.pow(px > 0 ? GALAXY_ZOOM.OUT : GALAXY_ZOOM.IN, notches);
}

/** Krok zoomu galaktyki: dystans × mnożnik, w zakresie [min; max]. */
export function galaxyZoomStep(dist, deltaY, { minDist, maxDist }, deltaMode = 0, viewportH = 800) {
  const d = Number.isFinite(dist) && dist > 0 ? dist : minDist;
  return clamp(d * galaxyZoomFactor(deltaY, deltaMode, viewportH), minDist, maxDist);
}

/** Cel kamery w zakresie panu: ±`half` w X i w Z wokół `center` (jak Stratcom — osobno w każdej osi). */
export function clampPanTarget(target, center, half) {
  const cx = num(center?.x), cz = num(center?.z), h = Math.max(0, num(half));
  return { x: clamp(num(target?.x), cx - h, cx + h), z: clamp(num(target?.z), cz - h, cz + h) };
}

/**
 * Krok panu: przeciągnięcie (dx, dy px CSS) → nowy cel na płaszczyźnie celu, w zakresie panu.
 * ⚠ KIERUNEK: `panScreenToWorld` bez flag przesuwa cel ZGODNIE z kursorem (zawartość ucieka spod kursora — zmierzone
 *   na bazie kamery three: przy azymucie 0 prawa strona ekranu to −Z, a „right” funkcji to +Z). `grab` (domyślnie, pokrętło
 *   `LIVE_GALAXY.PAN_GRAB`) odwraca obie osie: zawartość jedzie za kursorem jak w mapach; `grab = false` — odczucie Stratcomu.
 * @param {{x:number,z:number}} target
 * @param {{ dist:number, fov:number, yaw:number, viewportHpx:number, center:{x,z}, half:number, grab?:boolean }} o
 */
export function galaxyPanStep(target, dxPx, dyPx, o = {}) {
  const grab = o.grab !== false;
  const d = panScreenToWorld(dxPx, dyPx, { dist: o.dist, fov: o.fov, yaw: o.yaw, viewportHpx: o.viewportHpx,
    invertX: grab, invertY: grab });
  return clampPanTarget({ x: num(target?.x) + d.dx, z: num(target?.z) + d.dz }, o.center, o.half);
}

// ── Wybór gwiazdy (R2, reguła Findingu 109) ──────────────────────────────────────────────────────────────────────────

/**
 * Gwiazda pod punktem: najbliższy środek wśród rzutów (`points` = [{ id, x, y }] w tych samych jednostkach co punkt),
 * w kwadratowej strefie ±`half`; remis — późniejsza (`pickStarZone`). Brak — `null`.
 */
export function pickGalaxyStar(points, x, y, half = GALAXY_PICK_HALF_PX) {
  if (!Array.isArray(points) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const zones = [];
  for (const p of points) {
    if (!p || p.id == null || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    zones.push({ type: 'cluster_star', x: p.x - half, y: p.y - half, w: 2 * half, h: 2 * half, data: { id: p.id } });
  }
  return pickStarZone(zones, x, y)?.data?.id ?? null;
}

// ── Bramka wejścia (D-GX-13) ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Czy da się otworzyć widok układu: wygenerowany ∧ (zbadany ∨ własna obecność).
 * @param {{ generated?:boolean, explored?:boolean, presence?:boolean }} s
 */
export function isSystemEnterable({ generated = false, explored = false, presence = false } = {}) {
  return generated === true && (explored === true || presence === true);
}

// ── Kliknięcie gwiazdy płyty: zaznaczenie / dwuklik = wejście ────────────────────────────────────────────────────────

/**
 * Co zrobić z klikiem w płytę. `prev` = { id, t } poprzedniego kliku w gwiazdę (mutowana pamięć wołającego).
 * Reguła: 1. klik — zaznaczenie · 2. klik w zaznaczoną — fokus kamery (z bliska `ctx.dive` — wejście) · dwuklik — wejście.
 * @param {{ selectedId?:string|null, dive?:boolean }} [ctx] — zaznaczona gwiazda i czy kamera jest w zasięgu nurkowania
 * @returns {{ action: 'select'|'focus'|'enter'|'deselect', id: string|null, memo: {id:string|null, t:number} }}
 */
export function plateClickAction(prev, id, now, ms = GALAXY_DOUBLE_CLICK_MS, ctx = {}) {
  if (id == null) return { action: 'deselect', id: null, memo: { id: null, t: -Infinity } };
  const k = String(id);
  const dbl = prev && prev.id === k && Number.isFinite(prev.t) && (now - prev.t) <= ms;
  if (dbl) return { action: 'enter', id: k, memo: { id: null, t: -Infinity } };
  // 2. klik w zaznaczoną gwiazdę (wolniej niż dwuklik): z bliska (zasięg nurkowania) — wejście, inaczej — fokus kamery.
  if (ctx?.selectedId != null && String(ctx.selectedId) === k) {
    return ctx.dive === true
      ? { action: 'enter', id: k, memo: { id: null, t: -Infinity } }
      : { action: 'focus', id: k, memo: { id: k, t: now } };
  }
  return { action: 'select', id: k, memo: { id: k, t: now } };
}

// ── Wygląd punktów płyty (F5: ten sam PSF co niebo; rozmiar z jasności; niezbadane × 0,5; dom / zaznaczony — halo) ─────
// ⚠ Pokrętła strojenia na bramce: `KOSMOS.threeRenderer.galaxyTuning.<KLUCZ> = wartość` (ALIAS tego obiektu — płyta
//   porównuje go z migawką co klatkę i przelicza atrybuty przy zmianie). Każde pole ma czytelnika (V-266): wygląd — ten moduł,
//   `PAN_GRAB` — kontroler kamery, `PRESET_DIST_MUL` — `galaxyCameraConfig` (Home przelicza preset od razu).
export const LIVE_GALAXY = {
  LUM_LO: 0.03,          // [L☉] jasność dająca najmniejszy punkt
  LUM_HI: 4.0,           // [L☉] jasność dająca największy punkt
  SIZE_MIN: 3.0,         // [px] punkt najsłabszej gwiazdy
  SIZE_GAIN: 6.5,        // [px] przyrost do najjaśniejszej (G2 T3: było 4,5 — prawdziwa gwiazda „bliżej” niż tło)
  SIZE_EXP: 0.8,         // krzywa rozmiaru
  I_MIN: 1.0,            // intensywność najsłabszej (próg bloomu = 1,0)
  I_GAIN: 4.2,           // przyrost intensywności (HDR > 1 → bloom); G2 T3: było 1,6 — szczyt 5,2 ≥ 2× sufit tła (CAP 2,6)
  PLATE_SAT: 1.7,        // G2 T3: nasycenie barwy klasy względem nieba (1 = barwa nieba; > 1 — wyraźniejsza)
  UNEXPLORED_MUL: 0.5,   // niezbadane — mnożnik intensywności (F5 „unexplored at 0.5”)
  HALO_SIZE_MUL: 3.4,    // halo domu / zaznaczonej — rozmiar × rozmiar gwiazdy
  HALO_I: 0.55,          // halo — intensywność
  PAN_GRAB: 1,           // 1 — przeciąganie: zawartość jedzie za kursorem; 0 — odczucie Stratcomu (czyta kontroler kamery)
  PRESET_DIST_MUL: 0.8,  // mnożnik dystansu presetu (Home i wylot): 0,8 — decyzja właściciela po G3 (≈ 46 ly); 1 = fitDist Stratcomu ≈ 57 ly (D-GX-3)
  // ── ARC GALAXY G2 — każde pole ma czytelnika (V-266) ──
  // G2-1 lot (czyta `GalaxyModeController`): FLIGHT 0 = twarde cięcie G1 (jak przy `prefers-reduced-motion`).
  FLIGHT: 1,             // 1 — wylot / wlot lotem kamery; 0 — twarde cięcie z rozjaśnieniem 0,25 s (G1)
  FLIGHT_OUT_MS: 1400,   // [ms czasu realnego] wylot do galaktyki (D-GX-14 ~1,4 s)
  FLIGHT_IN_MS: 1200,    // [ms] wlot do układu (D-GX-14 ~1,2 s)
  FLIGHT_EASE: 2,        // łagodzenie: 0 — liniowe, 1 — smoothstep, 2 — smootherstep (jak lot intro)
  FLIGHT_APPROACH_LY: 6, // [ly] wlot: dystans nad gwiazdą celu w chwili przełączenia (podłoga galaktyki)
  // G2-2 przypięcie (czyta `HudGalaxyLabelLayer`): 1 — [ Skanuj ] tylko w zasięgu obserwatorium (STRATCOM_LY_BY_LEVEL od domu,
  // D-GX-22); 0 — bez członu zasięgu (jak przycisk panelu Stratcom: wyłącznie tier obserwatorium i limit).
  SCAN_RANGE_GATE: 1,
  // G2-3 terytorium (czyta `GalaxyTerritory` — uniformy co klatkę; TERR_GRID_LY — przeliczenie `TerritoryField`).
  TERR_GRID_LY: 0.75,    // [ly] komórka siatki pola (GAME_CONFIG.TERRITORY.GRID_LY; 0,5 przy widocznych załamaniach — D-GX-15)
  TERR_POOL_ALPHA: 0.07, // krycie rozlanego światła (skala; rdzeń = × TERR_CORE_MULT, front przy izolinii = × TERR_FRONT)
  TERR_CORE_MULT: 2.0,   // rdzeń (pole ≥ ~2,6 ISO)
  TERR_FRONT: 0.3,       // front przy izolinii — światło gaśnie od rdzenia ku granicy („rozlane”, nie płaskie)
  TERR_RIM_PX: 1.4,      // [px ekranu] szerokość jasnej krawędzi (izolinia z gradientu pola)
  TERR_RIM_I: 0.9,       // jasność krawędzi
  TERR_SEAM_PX: 1.8,     // [px] szerokość szwu spornego (pola dwóch właścicieli równe)
  TERR_SEAM_I: 1.4,      // jasność szwu (gorąca biel; addytywnie — połowa na każdą stronę)
  TERR_SEAM_STYLE: 0,    // styl szwu spornego: 0 = biały (obecny, domyślny) · 1 = barwy obu imperiów przeplatane wzdłuż szwu (kreskowanie, bez bieli) · 2 = bez szwu, obie krawędzie nakładają się przy zmniejszonym kryciu (czyta GalaxyTerritory.tick przez seamStyleParams)
  TERR_BREATH: 0.015,    // oddech krycia (1–2 %)
  TERR_CURTAIN_LY: 0.55, // [ly] wysokość zasłony granicy
  TERR_CURTAIN_A: 0.2,   // krycie zasłony u podstawy (gaśnie z wysokością)
  // G2-3 aureole i słupki (czyta `GalaxyPlate`)
  OWNER_HALO_MUL: 2.6,   // aureola własności — rozmiar × rozmiar gwiazdy
  OWNER_HALO_I: 0.42,    // aureola własności — intensywność (barwa imperium)
  RISER_ALPHA: 0.4,      // słupek gwiazda → płaszczyzna płyty (układy gracza + zaznaczona)
};

/** Migawka pokręteł płyty / czy zmienione (wzór `SkyCatalog.skyKnobsChanged`). */
export function galaxyKnobSnapshot(k = LIVE_GALAXY) { return { ...k }; }
export function galaxyKnobsChanged(snap, k = LIVE_GALAXY) {
  if (!snap) return true;
  for (const key of Object.keys(k)) if (snap[key] !== k[key]) return true;
  return false;
}

/** Barwa klasy widmowej (liniowe RGB, jak niebo — ciągłość przy wylocie, F2). */
export function plateStarColor(spectralType, sat = 1) {
  const c = [...(SKY_CLASS_RGB[spectralType] ?? SKY_CLASS_RGB.G)];
  if (!(sat > 0) || sat === 1) return c;
  // Nasycenie wokół średniej kanałów, kanały ≥ 0, maksimum kanału znów 1 (jak paleta nieba).
  const m = (c[0] + c[1] + c[2]) / 3;
  const o = c.map((v) => Math.max(0, m + (v - m) * sat));
  const mx = Math.max(...o, 1e-6);
  return o.map((v) => v / mx);
}

/**
 * Punkt płyty: rozmiar [px] i intensywność z jasności (log), niezbadane — intensywność × UNEXPLORED_MUL.
 * @returns {{ size:number, intensity:number, color:number[] }}
 */
export function plateStarLook(sys, { explored = false } = {}, k = LIVE_GALAXY) {
  const L = Number(sys?.luminosity);
  const lo = Math.log10(Math.max(1e-6, k.LUM_LO)), hi = Math.log10(Math.max(k.LUM_LO * 1.0001, k.LUM_HI));
  const t = clamp((Math.log10(L > 0 ? L : k.LUM_LO) - lo) / (hi - lo), 0, 1);
  const size = k.SIZE_MIN + k.SIZE_GAIN * Math.pow(t, k.SIZE_EXP);
  let intensity = k.I_MIN + k.I_GAIN * t;
  if (explored !== true) intensity *= k.UNEXPLORED_MUL;
  return { size, intensity, color: plateStarColor(sys?.spectralType, k.PLATE_SAT) };
}

/** Halo domu i zaznaczonej gwiazdy — większy PSF z tą samą barwą. */
export function plateHaloLook(starLook, k = LIVE_GALAXY) {
  return { size: starLook.size * k.HALO_SIZE_MUL, intensity: k.HALO_I, color: starLook.color };
}

/** Lista gwiazd z halo: dom (zawsze) i zaznaczona (gdy inna niż dom). */
export function haloIds(homeId, selectedId) {
  const out = [];
  if (homeId != null) out.push(String(homeId));
  if (selectedId != null && String(selectedId) !== String(homeId)) out.push(String(selectedId));
  return out;
}

// ── Etykiety płyty (HUD S0) ──────────────────────────────────────────────────────────────────────────────────────────

/** Wersaliki nazwy układu (locale-aware). */
export function galaxyLabelText(name, locale = 'pl') {
  const s = String(name ?? '');
  try { return s.toLocaleUpperCase(locale === 'en' ? 'en' : 'pl'); } catch { return s.toUpperCase(); }
}

/**
 * Kandydaci etykiety płyty: najpierw POD gwiazdą, wyśrodkowana (`side` 'C'), potem standardowi kandydaci warstwy etykiet
 * (`labelCandidates` — nad gwiazdą w prawo / w lewo, coraz wyżej, potem pod nią).
 */
export function galaxyLabelCandidates(it) {
  const c = Math.max(0, it.clear ?? 0);
  const under = { x: it.ax - it.w / 2, y: it.ay + c + (it.gapBelow ?? 3), side: 'C', below: true, level: 0 };
  return [under, ...labelCandidates(it)];
}

/** Priorytet rozkładu (mniej = wcześniej): zaznaczona, dom, własne, zbadane, niezbadane; w obrębie — bliższe. */
export function galaxyLabelPrio({ selected = false, home = false, relation = 'unexplored', distLy = 0 } = {}) {
  const r = selected ? 0 : home ? 1 : relation === 'own' ? 2 : relation === 'known' ? 3 : 4;
  return r * 1000 + clamp(Math.round(num(distLy) * 10), 0, 999);
}

// ── Pigułka trybu mapy [ UKŁAD ] [ GALAKTYKA ] (D-GX-9) ───────────────────────────────────────────────────────────────

export const MAP_PILL = Object.freeze({ H: 16, GAP: 2, PAD_X: 3 });

/**
 * Pigułka wyśrodkowana w wolnym odcinku pasa [spanLeft; spanRight] (od ostatniego chipu warstw do klastra po prawej).
 * Odcinek za wąski — brak pigułki (`[]`).
 * @param {{ spanLeft:number, spanRight:number, stripTop:number, stripH:number, widths:number[] }} o — szerokości segmentów
 *   [system, galaxy]
 * @returns {Array<{ mode:'system'|'galaxy', x:number, y:number, w:number, h:number }>}
 */
export function layoutMapModePill({ spanLeft, spanRight, stripTop, stripH, widths }) {
  const ws = Array.isArray(widths) ? widths : [];
  if (ws.length !== 2 || !(ws[0] > 0) || !(ws[1] > 0)) return [];
  const total = ws[0] + MAP_PILL.GAP + ws[1];
  if (!(spanRight - spanLeft >= total)) return [];
  const x0 = spanLeft + (spanRight - spanLeft - total) / 2;
  const h = MAP_PILL.H, y = stripTop + (stripH - h) / 2;
  return [
    { mode: 'system', x: x0, y, w: ws[0], h },
    { mode: 'galaxy', x: x0 + ws[0] + MAP_PILL.GAP, y, w: ws[1], h },
  ];
}

/** Segment pigułki pod punktem albo `null`. */
export function mapModePillAt(pill, x, y) {
  for (const s of pill ?? []) if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
  return null;
}

/** Szerokość segmentu: tekst w nawiasach chipu („[ GALAKTYKA ]”) + zapas — idiom `HudLayerChipsLogic`. */
export function mapPillSegmentText(label) { return `[ ${String(label ?? '')} ]`; }
export function mapPillSegmentWidth(label, measure) {
  const s = mapPillSegmentText(label);
  return Math.ceil(measure?.(s) ?? s.length * 6) + 2 * MAP_PILL.PAD_X;
}

// ── Klawisze G i M (D-GX-8; M od G5 — dawny skrót mini-mapy / Stratcomu jest aliasem mapy galaktyki) ─────────────────

/** Czy zdarzenie klawisza to przełącznik mapy: G albo M (także z Shift), bez Ctrl / Alt / Meta. */
export function isGalaxyToggleKey(e) {
  if (!e || e.ctrlKey || e.altKey || e.metaKey) return false;
  const k = String(e.key ?? '').toLowerCase();
  return k === 'g' || k === 'm';
}
