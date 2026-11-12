// ShipHardpoints — hardpointy modelu statku w grze: wczytanie i pamięć na slot, wartości zapasowe, kwaternion ramy
// kanonicznej, kurs wrappera (ARC COMBAT VISUALS, krok CV-1a; plan §2.11, D-CV-11; flaga `cvModels`).
//
// RAMA KANONICZNA (D-CV-11): dziób +Z, góra +Y. Model w slocie może mieć dziób gdziekolwiek (26 z 27 starych plików:
// lokalne −X, `nonwarp_large_science`: +X — Finding 621; sześć modeli właściciela: −X); plik hardpointów mówi gdzie
// (`frame.bow`, `frame.up`), a renderer obraca model JEDNYM kwaternionem na slot. Kurs statku żyje dalej na wrapperze
// (obrót Y), ale w ramie kanonicznej to po prostu `atan2(dx, dz)` — bez dawnej poprawki „+ π/2" — i `Object3D.lookAt`
// zwraca dziób ku celowi jednym wywołaniem (CV-3b).
//
// WARTOŚCI ZAPASOWE: brak pliku albo plik niepoprawny ⇒ `defaultHardpoints(slot)` — dziób −X (+X dla wyjątków z listy
// niżej, ZGODNEJ z plikami z pomiaru — keeper pinuje zgodność), góra +Y, dysza na końcu rufy w osi, bez wieżyczek
// i świateł, bez maski. Statek NIGDY nie czeka na hardpointy w nieskończoność i nigdy nie leci rufą przez brak pliku.
//
// ⚠ Moduł bez Three.js (kwaterniony jako [x, y, z, w]) — wykonuje się pod node; `fetch` wstrzykiwany do pamięci podręcznej.

import { HARDPOINTS_SCHEMA, HARDPOINTS_VERSION, KEY_COLOUR_DEFAULTS, validateHardpoints } from '../data/ShipHardpointsSchema.js';

export const SHIP_MODEL_DIR    = 'assets/models/ships/';
export const HARDPOINTS_DIR    = SHIP_MODEL_DIR + 'hardpoints/';
export const INCOMING_DIR      = SHIP_MODEL_DIR + 'incoming/';
// Indeks slotów z hardpointami dla modeli w `incoming/` (śledzony w git — same pliki GLB w `incoming/` NIE są).
// Czyta go WYŁĄCZNIE przełącznik deweloperski `KOSMOS.debug.cvIncoming(1)` (podgląd modeli przed podmianą slotu, CV-1b).
export const INCOMING_INDEX    = HARDPOINTS_DIR + 'incoming/index.json';

// Sloty z dziobem w lokalnym +X (pomiar audytu Q6, Finding 621: „stern = koniec z większą liczbą wierzchołków
// w ostatnich 8 % długości" — 27/27). Wyłącznie dla wartości ZAPASOWYCH; prawda jest w pliku hardpointów.
export const BOW_PLUS_X_SLOTS = Object.freeze(['nonwarp_large_science']);

const NOZZLE_R_DEFAULT = 0.04;     // [przestrzeń znormalizowana] promień dyszy zapasowej

/**
 * Slot i wariant ze ścieżki modelu: `assets/models/ships/warp_frigate.glb` → { slot: 'warp_frigate', variant: 'slot' },
 * `assets/models/ships/incoming/warp_frigate.glb` → { slot: 'warp_frigate', variant: 'incoming' }.
 * @param {string} modelPath
 * @returns {{ slot: string, variant: 'slot'|'incoming' }|null}
 */
export function slotOfModelPath(modelPath) {
  if (typeof modelPath !== 'string') return null;
  const m = /(?:^|\/)([a-z0-9_]+)\.glb$/i.exec(modelPath);
  if (!m) return null;
  const variant = /(?:^|\/)incoming\/[^/]+\.glb$/i.test(modelPath) ? 'incoming' : 'slot';
  return { slot: m[1].toLowerCase(), variant };
}

/**
 * ARC CV-2b — czy slot ma wariant tekstur 1K (`<slot>@1k.glb` — presety Medium / Low). Normalizator CV-1b zapisuje go ZAWSZE
 * i stempluje `source.normalizer` = `normalize-ship@…`; stare modele (`legacy-textures@…`, brak pliku) — bez wariantu, zostają
 * przy 2K. Reguła z danych, bez listy slotów w kodzie i bez żądań 404: ponowna normalizacja starego modelu włącza 1K sama.
 * @param {object|null} doc — dokument hardpointów slotu
 */
export function has1kVariant(doc) {
  return /^normalize-ship@/.test(String(doc?.source?.normalizer ?? ''));
}

/** ARC CV-2b — ścieżka wariantu 1K modelu slotu: `…/warp_frigate.glb` → `…/warp_frigate@1k.glb` (`incoming/` — bez wariantu: null). */
export function modelPath1k(modelPath) {
  const s = slotOfModelPath(modelPath);
  if (!s || s.variant !== 'slot') return null;
  return modelPath.replace(/\.glb$/i, '@1k.glb');
}

/** URL pliku hardpointów dla slotu i wariantu. */
export function hardpointsUrl(slot, variant = 'slot') {
  return HARDPOINTS_DIR + (variant === 'incoming' ? 'incoming/' : '') + slot + '.json';
}

/**
 * Wartości zapasowe — poprawny dokument schematu v1 dla dowolnego slotu.
 * @param {string} slot
 * @returns {object}
 */
export function defaultHardpoints(slot) {
  const s = typeof slot === 'string' && /^[a-z0-9_]+$/.test(slot) ? slot : 'default';
  const sign = BOW_PLUS_X_SLOTS.includes(s) ? 1 : -1;
  return {
    schema: HARDPOINTS_SCHEMA, version: HARDPOINTS_VERSION, slot: s,
    source: { file: s + '.glb', sha256: null, normalizer: null },
    frame: { bow: [sign, 0, 0], up: [0, 1, 0] },
    nozzles: [{ p: [-0.5 * sign, 0, 0], d: [-sign, 0, 0], r: NOZZLE_R_DEFAULT }],
    weapons: [], lights: [],
    keyColour: { ...KEY_COLOUR_DEFAULTS, mode: 'none' },
    damagePoints: 'auto',
    notes: 'fallback (brak pliku hardpointów albo plik niepoprawny)',
  };
}

// ── matematyka ramy (kwaterniony [x, y, z, w], wektory [x, y, z]) ─────────────────────────────────────────────────────
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Kwaternion obracający przestrzeń modelu do ramy kanonicznej: `frame.bow` → +Z, `frame.up` → +Y.
 * Macierz obrotu ma wiersze (prawa, góra, dziób), gdzie prawa = góra × dziób (układ prawoskrętny: X = Y × Z).
 * `up` nie musi być idealnie prostopadły — zostaje zrzutowany na płaszczyznę prostopadłą do dziobu.
 * @param {{ bow:number[], up:number[] }} frame
 * @returns {number[]} [x, y, z, w]
 */
export function frameQuaternion(frame) {
  const bow = norm(frame?.bow ?? [-1, 0, 0]);
  let up = frame?.up ?? [0, 1, 0];
  const d = dot(up, bow);
  up = norm([up[0] - d * bow[0], up[1] - d * bow[1], up[2] - d * bow[2]]);
  const right = cross(up, bow);
  // R = [[right],[up],[bow]] (wiersze) → kwaternion (algorytm Shepparda, jak Quaternion.setFromRotationMatrix).
  const m00 = right[0], m01 = right[1], m02 = right[2];
  const m10 = up[0],    m11 = up[1],    m12 = up[2];
  const m20 = bow[0],   m21 = bow[1],   m22 = bow[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1.0);
    w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

/** Obrót wektora kwaternionem [x, y, z, w]. */
export function rotateVec(q, v) {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);   // t = 2·(q.xyz × v)
  return [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
}

// ── kurs wrappera (obrót Y) ────────────────────────────────────────────────────────────────────────────────────────────
// Wrapper obraca się wokół Y o `yaw`: lokalne +Z → świat (sin yaw, 0, cos yaw), lokalne −X → świat (−cos yaw, 0, sin yaw).
// Ścieżka dawna (flaga OFF): dziób modelu w lokalnym −X ⇒ yaw = atan2(dx, dz) + π/2 — WZÓR BEZ ZMIAN.
// Rama kanoniczna: dziób w lokalnym +Z ⇒ yaw = atan2(dx, dz).

/**
 * Kurs dziobem w kierunku (dx, dz) świata (dz = logiczne y).
 * @param {boolean} canonical — sprite postawiony w ramie kanonicznej (`entry.canonical`)
 */
export function yawToward(dx, dz, canonical) {
  return canonical ? Math.atan2(dx, dz) : Math.atan2(dx, dz) + Math.PI / 2;
}

/**
 * Kurs statku na orbicie ciała, dziobem ZGODNIE z ruchem orbity (Finding 622). Pozycja orbity:
 * (r·sin φ·cos θ, …, r·sin φ·sin θ), θ = θ₀ + ω·t ⇒ kierunek ruchu (−sin θ, cos θ)·sgn(ω).
 * Ścieżka dawna (flaga OFF): `θ + π` — wzór BEZ ZMIAN (obracał dziób przeciwnie do orbity — zmierzone w audycie).
 */
export function orbitYaw(theta, omega, canonical) {
  if (!canonical) return theta + Math.PI;
  const sgn = omega < 0 ? -1 : 1;
  return Math.atan2(-Math.sin(theta) * sgn, Math.cos(theta) * sgn);
}

/**
 * Przechył w skręcie (fcMovementFx). W ramie kanonicznej obrót Z wrappera jest PRAWDZIWYM przechyłem wokół osi dziobu,
 * a lokalne +X to lewa burta — skręt w lewo (dYaw > 0) przechyla w LEWO, czyli rotation.z < 0. Ścieżka dawna: wzór bez
 * zmian (przy dziobie w −X obrót Z był w praktyce pochyleniem nosa).
 */
export function bankRoll(dYaw, canonical) {
  const r = Math.max(-0.5, Math.min(0.5, dYaw * 12));
  return canonical ? -r : r;
}

// ── kurs spoczynkowy i pochylenie wraku — RÓWNOWAŻNE ścieżce OFF (kontrola właściciela CV-1a, 2026-11-11) ─────────────
// Statek, dla którego renderer nie zna kierunku (brak misji przy stawianiu — np. stojący wróg w bitwie, wrak z zapisu),
// zostaje z kursem 0. Na ścieżce OFF to dziób modelu w lokalnym −X ⇒ dziób W ŚWIECIE −X; w ramie kanonicznej kurs 0 dawał
// dziób +Z — obrót o 90° (zmierzone na żywym silniku: wróg w `cvBattle` burtą do gracza zamiast dziobem). Kurs spoczynkowy
// ramy kanonicznej przywraca dawny dziób −X świata. To NIE jest kurs bojowy (zwrot ku celowi — CV-3b).

/** Kurs wrappera kanonicznego bez znanego kierunku: dziób w świecie −X (jak model z dziobem −X przy kursie 0 na ścieżce OFF). */
export const REST_YAW_CANONICAL = -Math.PI / 2;

/**
 * Losowe pochylenie wraku w ramie kanonicznej, RÓWNOWAŻNE ścieżce OFF. Ścieżka OFF ustawia na wrapperze Euler XYZ
 * (rx, yawOff, rz) modelu z dziobem w lokalnym −X; model w ramie kanonicznej = tamten model obrócony Ry(+π/2) (dziób −X → +Z,
 * góra bez zmian), więc ta sama orientacja w świecie to wrapper = Euler(rx, yawOff, rz) · Ry(−π/2), gdzie yawOff = yaw + π/2.
 * (Samo przepisanie Eulera z i x na wrapper kanoniczny dawało przechył wokół dziobu zamiast pochylenia nosa.)
 * @param {number} yaw — kurs wrappera kanonicznego (obrót Y)
 * @param {number} rx — pochylenie wokół X (jak ścieżka OFF)
 * @param {number} rz — pochylenie wokół Z (jak ścieżka OFF)
 * @returns {number[]} kwaternion wrappera [x, y, z, w]
 */
export function wreckTiltQuaternion(yaw, rx, rz) {
  const y = yaw + Math.PI / 2;
  const c1 = Math.cos(rx / 2), c2 = Math.cos(y / 2), c3 = Math.cos(rz / 2);
  const s1 = Math.sin(rx / 2), s2 = Math.sin(y / 2), s3 = Math.sin(rz / 2);
  // Euler XYZ → kwaternion (jak Quaternion.setFromEuler, kolejność 'XYZ').
  const ax = s1 * c2 * c3 + c1 * s2 * s3, ay = c1 * s2 * c3 - s1 * c2 * s3;
  const az = c1 * c2 * s3 + s1 * s2 * c3, aw = c1 * c2 * c3 - s1 * s2 * s3;
  const bw = Math.SQRT1_2, by = -Math.SQRT1_2;   // Ry(−π/2)
  return [ax * bw - az * by, ay * bw + aw * by, az * bw + ax * by, aw * bw - ay * by];
}

// ── pamięć podręczna plików ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Hardpointy na slot (i wariant). `load` NIGDY nie odrzuca: brak pliku / błąd sieci / dokument niepoprawny ⇒ wartości
 * zapasowe (jedno ostrzeżenie w konsoli na slot). Równoległe prośby o ten sam slot dzielą jedno żądanie.
 */
export class ShipHardpointsCache {
  /** @param {{ fetchJson?: (url:string) => Promise<object|null>, warn?: (msg:string) => void }} [opts] */
  constructor({ fetchJson = null, warn = null } = {}) {
    this._fetchJson = typeof fetchJson === 'function' ? fetchJson : null;
    this._warn = typeof warn === 'function' ? warn : (m) => console.warn(m);
    this._docs = new Map();       // key → dokument (plik albo zapas)
    this._pending = new Map();    // key → Promise
    this._fallback = new Set();   // klucze, dla których użyto zapasu
    this._overrides = new Map();  // key → dokument nadpisany w pamięci (narzędzia: test świateł)
    this._incoming = null;        // Promise<Set<string>>
  }

  static key(slot, variant = 'slot') { return (variant === 'incoming' ? 'incoming/' : '') + slot; }

  /** Dokument z pamięci (bez wczytywania) albo null. */
  get(slot, variant = 'slot') {
    const k = ShipHardpointsCache.key(slot, variant);
    return this._overrides.get(k) ?? this._docs.get(k) ?? null;
  }

  /** @returns {Promise<object>} poprawny dokument (plik albo zapas) */
  load(slot, variant = 'slot') {
    const k = ShipHardpointsCache.key(slot, variant);
    const have = this._overrides.get(k) ?? this._docs.get(k);
    if (have) return Promise.resolve(have);
    if (this._pending.has(k)) return this._pending.get(k);
    const useFallback = (why) => {
      const doc = defaultHardpoints(slot);
      this._docs.set(k, doc);
      this._fallback.add(k);
      if (why) this._warn(`[ShipHardpoints] ${k}: ${why} — wartości zapasowe (dziób ${doc.frame.bow[0] > 0 ? '+X' : '−X'})`);
      return doc;
    };
    if (!this._fetchJson) return Promise.resolve(useFallback(null));
    const p = Promise.resolve()
      .then(() => this._fetchJson(hardpointsUrl(slot, variant)))
      .then((doc) => {
        if (!doc) return useFallback('brak pliku');
        const v = validateHardpoints(doc);
        if (!v.ok) return useFallback('plik niepoprawny: ' + v.errors.slice(0, 3).join('; '));
        this._docs.set(k, doc);
        return doc;
      })
      .catch((e) => useFallback('błąd wczytania: ' + (e?.message ?? e)))
      .finally(() => this._pending.delete(k));
    this._pending.set(k, p);
    return p;
  }

  /** Nadpisanie w pamięci (narzędzie testowe świateł, Workshop w przyszłości); `null` zdejmuje. */
  setOverride(slot, variant, doc) {
    const k = ShipHardpointsCache.key(slot, variant);
    if (doc) this._overrides.set(k, doc); else this._overrides.delete(k);
  }

  clearOverrides() { this._overrides.clear(); }

  /** Sloty z hardpointami dla `incoming/` (indeks); brak indeksu ⇒ pusty zbiór. */
  loadIncomingIndex() {
    if (this._incoming) return this._incoming;
    const done = (list) => new Set(Array.isArray(list) ? list.filter((s) => typeof s === 'string' && /^[a-z0-9_]+$/.test(s)) : []);
    this._incoming = this._fetchJson
      ? Promise.resolve().then(() => this._fetchJson(INCOMING_INDEX)).then((doc) => done(doc?.slots)).catch(() => done(null))
      : Promise.resolve(done(null));
    return this._incoming;
  }

  stats() {
    return { loaded: this._docs.size, fallback: [...this._fallback], overrides: [...this._overrides.keys()], pending: this._pending.size };
  }
}
