// SurfaceAirLogic — atmosfera, chmury i pokład ciała dla SurfaceAirShader (ARC COLONY SPHERE, krok CS-6b; plan §3.7).
//
// Czysty moduł (bez DOM, bez THREE; wykonuje się pod node — keeper `colony_sphere_air_smoke`).
// `resolveAirLook(body)` → barwy (liniowe RGB) i parametry powłoki, DETERMINISTYCZNIE z danych zapisanych w ciele:
// `surfaceSeed`, `bodyArchetype`, klasa atmosfery. Bez Math.random.
//
// Jak powstaje „żadne dwa ciała nie mają tej samej atmosfery ani chmur":
//   1. wariant A barw archetypu + domieszka wariantu B (0…AIR_BLEND_MAX) + rozrzut odcienia / nasycenia / jasności,
//   2. pokrycie, skala, pasmowość i wiry chmur losowane z ziarna w zakresach archetypu,
//   3. przesunięcie wzoru (`phase`, trzy liczby z ziarna) — dwa ciała nigdy nie dzielą wzoru chmur.

import { ARCHETYPE_BY_ID } from '../data/BodyArchetypes.js';
import { BODY_AIR, AIR_DENSITY_BY_CLASS, AIR_SHELL_SCALE, AIR_HALO_SCALE, AIR_JITTER, AIR_BLEND_MAX, AIR_WEATHER } from '../data/BodyAtmospheres.js';
import { hexToRgb, rgbToHsv, hsvToRgb, srgbToLinear } from './SurfacePaletteLogic.js';
import { surfaceInfo } from './SurfaceField.js';
import { mixSeed, combineSeeds } from './SeedMath.js';

const SALT_AIR = 0x43533662;   // 'CS6b'
const KINDS = Object.freeze(['planet', 'moon']);

/** Liczba z [0, 1) z ziarna i numeru strumienia. */
function unit(seed, n) { return mixSeed(combineSeeds(seed >>> 0, SALT_AIR, n)) / 4294967296; }
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : (x > 1 ? 1 : x));

/** Klasa atmosfery ciała → mnożnik gęstości albo 0 (brak atmosfery). */
export function airDensityOf(body) {
  return AIR_DENSITY_BY_CLASS[body?.atmosphere] ?? 0;
}

/** Czy ciało ma powłokę powietrza (wiersz BODY_AIR + atmosfera; planetoidy i ciała bez atmosfery — nigdy). */
export function hasAirLook(body) {
  if (!KINDS.includes(body?.type) || !Number.isFinite(body?.surfaceSeed)) return false;
  const row = BODY_AIR[body?.bodyArchetype];
  if (!row || ARCHETYPE_BY_ID[body.bodyArchetype]?.family === 'gas') return false;
  return row.always || airDensityOf(body) > 0;
}

/**
 * Wygląd powietrza ciała albo null (ciało bez atmosfery / gaz / brak ziarna lub archetypu).
 * @returns {null | {archetype:string, variantA:string, variantB:string, blend:number, density:number,
 *   hazeOpacity:number, veilCenter:number, veilOpaque:number, veilBand:number, bandFreq:number,
 *   tint:number[], veilA:number[], veilB:number[], veilC:number[], cloud:number[], twilight:number[],
 *   cloudCoverage:number, cloudAlpha:number, cloudScale:number, cloudBand:number, cloudWarp:number, drift:number,
 *   cloudShade:number, wind:number, windBands:number, weatherPhase:number, evolve:number,
 *   phase:number[], haloScale:number, haloStrength:number, haloWrap:number, shellScale:number}}
 */
export function resolveAirLook(body) {
  if (!hasAirLook(body)) return null;
  const row = BODY_AIR[body.bodyArchetype];
  const seed = body.surfaceSeed >>> 0;
  const density = row.always ? 1 : airDensityOf(body);
  const variants = row.variants;

  const ia = Math.min(variants.length - 1, Math.floor(unit(seed, 1) * variants.length));
  let ib = ia;
  if (variants.length > 1) ib = (ia + 1 + Math.min(variants.length - 2, Math.floor(unit(seed, 2) * (variants.length - 1)))) % variants.length;
  const blend = variants.length > 1 ? unit(seed, 3) * AIR_BLEND_MAX : 0;
  const dHue = (unit(seed, 4) * 2 - 1) * AIR_JITTER.hue;
  const kSat = 1 + (unit(seed, 5) * 2 - 1) * AIR_JITTER.sat;
  const kVal = 1 + (unit(seed, 6) * 2 - 1) * AIR_JITTER.val;

  // Barwa: A + domieszka B, rozrzut HSV (wspólny dla całej powłoki — pasma i baza zostają spójne), sRGB → liniowe.
  const colour = (ha, hb, satK = 1) => {
    const a = hexToRgb(ha), b = hexToRgb(hb);
    const hsv = rgbToHsv([lerp(a[0], b[0], blend), lerp(a[1], b[1], blend), lerp(a[2], b[2], blend)]);
    hsv[0] += dHue; hsv[1] = clamp01(hsv[1] * (1 + (kSat - 1) * satK)); hsv[2] = clamp01(hsv[2] * kVal);
    return hsvToRgb(hsv).map(srgbToLinear);
  };
  const A = variants[ia], B = variants[ib];
  const c = row.clouds, v = row.veil, h = row.halo;
  const thin = density < 1 ? 0.6 + 0.4 * density : 1;   // cienka atmosfera: mniej chmur

  return {
    archetype: body.bodyArchetype, variantA: A.id, variantB: B.id, blend, density,
    hazeOpacity: clamp01(v.opacity * (row.always ? 1 : Math.min(1.25, density))),
    veilCenter: v.center, veilOpaque: v.opaque, veilBand: v.band,
    bandFreq: lerp(v.bandFreq[0], v.bandFreq[1], unit(seed, 7)),
    tint: colour(A.tint, B.tint), twilight: colour(A.twilight, B.twilight),
    veilA: colour(A.veil[0], B.veil[0]), veilB: colour(A.veil[1], B.veil[1]), veilC: colour(A.veil[2], B.veil[2]),
    cloud: colour(A.cloud, B.cloud, 0.5),
    cloudCoverage: clamp01(lerp(c.coverage[0], c.coverage[1], unit(seed, 8)) * thin),
    cloudAlpha: c.alpha,
    cloudScale: lerp(c.scale[0], c.scale[1], unit(seed, 9)),
    cloudBand: lerp(c.band[0], c.band[1], unit(seed, 10)),
    cloudWarp: lerp(c.warp[0], c.warp[1], unit(seed, 11)),
    drift: c.drift * (0.7 + 0.6 * unit(seed, 12)) * (unit(seed, 13) < 0.15 ? -1 : 1),   // ≈ 1 na 7 ciał: dryf wsteczny
    phase: [unit(seed, 14) * 97 + 3, unit(seed, 15) * 97 + 3, unit(seed, 16) * 97 + 3],
    // Pogoda (strojenie CS-6b): cieniowanie grubych partii, wiatr pasmowy (rad długości na cykl; znak z ziarna), liczba pasm wiatru,
    // faza startowa (ciała nie pulsują razem) i tempo ewolucji [cykle / s czasu pogody].
    cloudShade: c.shade ?? AIR_WEATHER.shade,
    wind: lerp(AIR_WEATHER.wind[0], AIR_WEATHER.wind[1], unit(seed, 17)) * (unit(seed, 18) < 0.5 ? -1 : 1),
    windBands: lerp(AIR_WEATHER.windBands[0], AIR_WEATHER.windBands[1], unit(seed, 19)),
    weatherPhase: unit(seed, 20) * 8,
    evolve: (0.8 + 0.4 * unit(seed, 21)) / AIR_WEATHER.cycleSeconds,
    haloScale: lerp(AIR_HALO_SCALE.lo, AIR_HALO_SCALE.hi, clamp01(h.thickness * (row.always ? 1 : Math.min(1.15, 0.55 + 0.45 * density)))),
    haloStrength: h.strength * (row.always ? 1 : Math.min(1.2, density)),
    haloWrap: h.wrap,
    shellScale: AIR_SHELL_SCALE,
  };
}

/** Odległość dwóch wyglądów powietrza (barwy zasłony + poświaty w liniowym RGB) — miara „czy dwa ciała się różnią". */
export function airDistance(a, b) {
  if (!a || !b) return Infinity;
  let sum = 0;
  for (const k of ['tint', 'veilA', 'veilB', 'veilC']) {
    const dr = a[k][0] - b[k][0], dg = a[k][1] - b[k][1], db = a[k][2] - b[k][2];
    sum += Math.sqrt(dr * dr + dg * dg + db * db);
  }
  return sum / 4;
}

/**
 * Tempo zegara pogody względem czasu realnego (strojenie CS-6b, §3.7.1): pauza gry = 0 (chmury zamrożone), prędkość
 * bazowa (1 dzień / s) = 1, szybsza gra = szybsza pogoda rosnąca z pierwiastkiem prędkości i OBCIĘTA do
 * `AIR_WEATHER.speedCap` (przy 1 roku / s nic nie migocze).
 * @param {number} multiplier mnożnik czasu gry [lata gry / s] (TimeSystem.multiplier)
 * @param {boolean} [paused]
 */
export function weatherRate(multiplier, paused = false) {
  if (paused || !(multiplier > 0)) return 0;
  const daysPerSecond = multiplier * 365.25;
  return Math.min(AIR_WEATHER.speedCap, Math.sqrt(daysPerSecond));
}

/**
 * Ciało ustawione stałą półkulą ku gwieździe i bez obrotu wokół osi (D-CS-23): WYŁĄCZNIE planeta archetypu
 * `tidally_locked` — jej powierzchnia jest generowana z „okiem" podgwiezdnym. Światy innych archetypów (np. terran) z
 * zapisaną flagą `tidallyLocked` obracają się normalnie: ich powierzchnia ma klimat z obrotu (czapy polarne, pasy
 * szerokości). Flaga zostaje w danych ciała. Księżyce nigdy (są związane z planetą, nie z gwiazdą).
 */
export function isStarLocked(body) {
  return body?.type === 'planet' && body?.bodyArchetype === 'tidally_locked';
}

/**
 * Kierunek punktu podgwiezdnego w przestrzeni OBIEKTU siatki (= przestrzeń pola): archetyp `tidally_locked` ma „oko"
 * przesunięte z ziarna (SurfaceField `variation.substellar`), pozostałe związane ciała pokazują gwieździe +x.
 * @returns {number[]} wektor jednostkowy [x, y, z]
 */
export function substellarDirOf(body) {
  if (body?.bodyArchetype === 'tidally_locked' && Number.isFinite(body?.surfaceSeed)) {
    const arch = ARCHETYPE_BY_ID.tidally_locked;
    const d = surfaceInfo(body.surfaceSeed >>> 0, arch, null)?.variation?.substellar;
    if (d && Number.isFinite(d[0] + d[1] + d[2])) return d;
  }
  return [1, 0, 0];
}

/**
 * Kwaternion [x, y, z, w] obracający wektor jednostkowy `from` na `to` (najkrótszy łuk). Czysta arytmetyka — keeper
 * sprawdza, że obrócony punkt podgwiezdny trafia w kierunek gwiazdy.
 */
export function quatFromTo(from, to, out = [0, 0, 0, 1]) {
  const d = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (d < -0.999999) {
    // Przeciwne: obrót o 180° wokół dowolnej osi prostopadłej.
    let ax = 0, ay = -from[2], az = from[1];
    if (ay * ay + az * az < 1e-8) { ax = -from[1]; ay = from[0]; az = 0; }
    const l = Math.sqrt(ax * ax + ay * ay + az * az);
    out[0] = ax / l; out[1] = ay / l; out[2] = az / l; out[3] = 0;
    return out;
  }
  const x = from[1] * to[2] - from[2] * to[1], y = from[2] * to[0] - from[0] * to[2], z = from[0] * to[1] - from[1] * to[0];
  const w = 1 + d, l = Math.sqrt(x * x + y * y + z * z + w * w);
  out[0] = x / l; out[1] = y / l; out[2] = z / l; out[3] = w / l;
  return out;
}

/**
 * Orientacja ciała związanego pływowo: punkt podgwiezdny `sub` (przestrzeń obiektu) → kierunek gwiazdy w płaszczyźnie
 * układu (dirX, dirZ — świat, y = 0). Złożenie: stały obrót `sub` → +x, potem obrót wokół osi Y z +x na kierunek
 * gwiazdy. Bieguny zostają pionowo, a obrót jest równomierny na całej orbicie (najkrótszy łuk `sub` → gwiazda kołysałby
 * biegunami i gwałtownie przetaczał ciało raz na obieg, gdy gwiazda mija antypodę `sub`).
 * @returns {number[]} kwaternion [x, y, z, w]
 */
export function starLockQuat(sub, dirX, dirZ, out = [0, 0, 0, 1]) {
  const l = Math.sqrt(dirX * dirX + dirZ * dirZ);
  const q0 = quatFromTo(sub, [1, 0, 0]);
  const qy = l > 1e-9 ? quatFromTo([1, 0, 0], [dirX / l, 0, dirZ / l]) : [0, 0, 0, 1];
  // out = qy · q0 (najpierw q0, potem qy)
  out[0] = qy[3] * q0[0] + qy[0] * q0[3] + qy[1] * q0[2] - qy[2] * q0[1];
  out[1] = qy[3] * q0[1] - qy[0] * q0[2] + qy[1] * q0[3] + qy[2] * q0[0];
  out[2] = qy[3] * q0[2] + qy[0] * q0[1] - qy[1] * q0[0] + qy[2] * q0[3];
  out[3] = qy[3] * q0[3] - qy[0] * q0[0] - qy[1] * q0[1] - qy[2] * q0[2];
  return out;
}

/** Obrót wektora kwaternionem [x, y, z, w] (instrument keepera i sond). */
export function rotateByQuat(v, q) {
  const [x, y, z] = v, [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
