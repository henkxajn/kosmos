// KOSMOS — CS-PHYS-b2 (D-CS-24, plan COLONY_SPHERE §3.9.1): JEDNA skala odległości na układ gwiezdny.
//
// Świat orbit skalowanych (orbitModel 2, OrbitModel.js) ściska układy ciemnych gwiazd (karzeł M: planety 0.07–5.4 AU).
// Każdy próg przestrzenny WEWNĄTRZ układu (strefa słońca, przyciąganie kliku do ciała, zasięgi walki / blokady /
// sensorów, rdzeń i sfera kliku gwiazdy, strefa kamery, progi AI) mnoży się przez k tego układu:
//   k = κ = clamp(√L, 0.2, 1)  — ten sam współczynnik co separacje orbit generatora (OrbitModel.compactionOf),
//   k = 1 DOKŁADNIE w każdym układzie bez stempla `star.orbitModel === 2` (świat dotychczasowy, stary zapis) →
//   wszystkie progi bit w bit jak dotąd.
// NIE skalujemy: prędkości statków, zużycia paliwa, odległości galaktycznych (warp) — kompaktowe układy po prostu
// szybciej się przemierza (cecha strategiczna karłów M, decyzja właściciela 2026-11-19).
//
// Jedyne źródło k — konsumenci nie liczą √L sami (brak rozproszonych magicznych liczb).
import EntityManager from '../core/EntityManager.js';
import { ORBIT_SCALED, compactionOf, luminosityScaleAU, COMPACTION_MAX } from './OrbitModel.js';

export const SYSTEM_SCALE_LEGACY = 1;   // bezwymiarowe — skala układu świata dotychczasowego

/** k gwiazdy (encji Star albo obiektu z `orbitModel` + `luminosity`). Brak stempla → 1. */
export function systemScaleOfStar(star) {
  return star?.orbitModel === ORBIT_SCALED ? compactionOf(star.luminosity) : SYSTEM_SCALE_LEGACY;
}

/** Gwiazda układu `systemId` (null, gdy układ nieznany / bez encji gwiazdy). */
function starOfSystem(systemId) {
  if (systemId == null) return null;
  const sys = (typeof window !== 'undefined') ? window.KOSMOS?.starSystemManager?.getSystem?.(systemId) : null;
  if (sys?.starEntityId != null) return EntityManager.get(sys.starEntityId) ?? null;
  // Bez StarSystemManager (headless, wczesny start): jedyna gwiazda o tym systemId
  return EntityManager.getByType?.('star')?.find(s => s.systemId === systemId) ?? null;
}

/** k układu `systemId`. Układ nieznany → 1 (zachowanie dotychczasowe — fail-open na progach). */
export function systemScaleOf(systemId) {
  return systemScaleOfStar(starOfSystem(systemId));
}

/** k aktywnego (renderowanego) układu. */
export function activeSystemScale() {
  const id = (typeof window !== 'undefined') ? window.KOSMOS?.activeSystemId : null;
  return systemScaleOf(id ?? 'sys_home');
}

/** k układu encji (statek, ciało, stacja — pole `systemId`); brak → aktywny układ. */
export function systemScaleOfEntity(entity) {
  return entity?.systemId != null ? systemScaleOf(entity.systemId) : activeSystemScale();
}

// ── Finding 774 (CS-PHYS-b3) — WYŁĄCZNIE rysunek tarczy gwiazdy (nie generacja, nie progi rozgrywki) ──────────────
// k ma podłogę 0.2, a orbity idą za ℓ = √L bez podłogi → w najciemniejszych karłach M (ℓ < 0.2) rdzeń rysowany z k
// zbliżał się do najbliższego peryhelium (najgorzej 1.05×); w G/K świata orbit 2 minimalna orbita 0.40·ℓ AU też leży
// bliżej niż 1.5 rdzenia. Skala RYSUNKU: ℓ bez podłogi (sufit 1), dodatkowo przycięta tak, by najbliższe peryhelium
// planety leżało ≥ STAR_CORE_CLEARANCE × promień rdzenia. Rdzeń, korona, sfera kliku i strefa kamery idą za rysunkiem.
export const STAR_CORE_CLEARANCE = 1.5;   // bezwymiarowe — peryhelium najbliższej planety / promień rysowanego rdzenia
export const STAR_MIN_CORE_PX    = 4;     // CSS px — najmniejszy promień rdzenia na ekranie (tylko skala rysunku < 1)

/** Najmniejsze peryhelium a·(1 − e) z listy planet [AU]; brak planet → Infinity. */
export function innermostPeriapsisAU(planets) {
  let best = Infinity;
  for (const p of planets ?? []) {
    const a = Number(p?.orbital?.a);
    if (!(a > 0)) continue;
    const peri = a * (1 - (Number(p.orbital.e) || 0));
    if (peri < best) best = peri;
  }
  return best;
}

/**
 * Skala rysunku tarczy gwiazdy (bezwymiarowa). Bez stempla `orbitModel: 2` → 1 DOKŁADNIE (świat dotychczasowy bit w bit).
 * Stempel: min(1, ℓ) bez podłogi 0.2, przycięte do peryhelium / (STAR_CORE_CLEARANCE · promień rdzenia przy skali 1).
 * @param {object} star
 * @param {{ baseCoreAU?: number, innermostPeriapsisAU?: number }} [o] — promień rdzenia przy skali 1 [AU], peryhelium [AU]
 */
export function starDrawScale(star, { baseCoreAU = NaN, innermostPeriapsisAU: peri = Infinity } = {}) {
  if (star?.orbitModel !== ORBIT_SCALED) return SYSTEM_SCALE_LEGACY;
  let s = Math.min(COMPACTION_MAX, luminosityScaleAU(star.luminosity));
  if (baseCoreAU > 0 && Number.isFinite(peri) && peri > 0) s = Math.min(s, peri / (STAR_CORE_CLEARANCE * baseCoreAU));
  return s;
}

/**
 * Podłoga ekranowa rdzenia: mnożnik ≥ 1, przy którym promień rdzenia na ekranie ≥ minPx (CSS px).
 * px = R · (H/2) / (d · tan(fov/2)). Dane nieskończone / zerowe → 1.
 */
export function starScreenFloorScale({ coreRadiusWorld, distance, viewportHeightPx, fovDeg, minPx = STAR_MIN_CORE_PX }) {
  const tanHalf = Math.tan(((fovDeg ?? 55) * Math.PI / 180) / 2);
  const px = coreRadiusWorld * (viewportHeightPx / 2) / (distance * tanHalf);
  return (px > 0 && Number.isFinite(px) && px < minPx) ? minPx / px : 1;
}

// ── CS-PHYS-c — rysunek CIAŁ układu ściśniętego (planety, księżyce, planetoidy, pierścienie, orbity stacji) ──────────
// Orbity zmalały × k, a rysowane promienie nie (planeta ×200 przy orbicie 0.19 AU, pierścień księżyca szerszy niż odstęp
// planet). Skala rysunku ciał = k (ten sam współczynnik co separacje orbit) — świat bez stempla: 1 DOKŁADNIE. Statki,
// modele stacji, ikony i etykiety NIE skalują się (stały rozmiar na ekranie).
export const BODY_MIN_PX = 2;   // CSS px — najmniejszy promień tarczy ciała na ekranie (tylko skala rysunku < 1)

/** Skala rysunku ciał układu gwiazdy (bezwymiarowa). Bez stempla `orbitModel: 2` → 1 DOKŁADNIE. */
export function bodyDrawScale(star) {
  return systemScaleOfStar(star);
}

/**
 * Podłoga ekranowa tarczy ciała: mnożnik w [1, maxScale], przy którym promień tarczy na ekranie ≥ minPx (CSS px).
 * `maxScale` = 1 / skala rysunku → tarcza nigdy nie jest większa niż w świecie dotychczasowym. Dane zerowe → 1.
 */
export function bodyScreenFloorScale({ radiusWorld, distance, viewportHeightPx, fovDeg, minPx = BODY_MIN_PX, maxScale = Infinity }) {
  const f = starScreenFloorScale({ coreRadiusWorld: radiusWorld, distance, viewportHeightPx, fovDeg, minPx });
  return Math.max(1, Math.min(f, maxScale));
}

// ── CS-PHYS-b3 — odczyty odległości w układzie (AU) ─────────────────────────────────────────────────────────────────
// W kompaktowym układzie zasięgi × k i orbity schodzą poniżej 0.25 AU („0.1 AU” dla 0.06 i 0.14). Świat dotychczasowy
// nie ma takich wartości (minimalna orbita 0.35 AU, sensor-lock ≥ 0.3 AU, wykrycie ≥ 0.5 AU) → jego odczyty bez zmian.
export const AU_FINE_READOUT_BELOW = 0.25;   // AU — poniżej odczyt z 2 miejscami po przecinku

/** Liczba miejsc po przecinku odczytu AU zasięgu / orbity: < 0.25 AU → 2, inaczej 1. */
export function auReadoutDecimals(au) { return (au > 0 && au < AU_FINE_READOUT_BELOW) ? 2 : 1; }

export const SystemScale = Object.freeze({
  of: systemScaleOf,
  ofStar: systemScaleOfStar,
  ofEntity: systemScaleOfEntity,
  active: activeSystemScale,
  bodyDraw: bodyDrawScale,
});
