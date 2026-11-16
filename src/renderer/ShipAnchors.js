// ShipAnchors — kotwice modułów modelu statku: wartości domyślne, scalanie z plikiem, pamięć plików (ARC KONSOLE, krok K1b;
// CONSOLES_PLAN.md §2 B3, D-K-8 / D-K-9). Schemat i walidator: `src/data/ShipAnchorsSchema.js`.
//
// `anchorsFor(slot, { file, hardpoints, bbox })` → 6 kotwic (po jednej na rolę, kolejność `ANCHOR_ROLES`): role z pliku
// właściciela nad wartościami domyślnymi. NIGDY nie rzuca — plik brakujący / niepoprawny / śmieci ⇒ same domyślne.
//
// DOMYŚLNE (liczone, nigdy niezapisywane; deterministyczne dla modelu — funkcja hardpointów, bbox i siatki modelu):
//   drive   = dysza z hardpointów (`nozzles[0].p`; brak dyszy ⇒ rufa na osi) — ŚRODEK dyszy, bez przyciągania (runda 3);
//   weapons = środek ciężkości wieżyczek W1…Wn z hardpointów, gdy są (decyzja właściciela po przeglądzie K1b); inaczej reguła bbox;
//   reszta  = punkt na osi dziobu (dziób 0,35 · 0,2 · śródokręcie 0 · rufa −0,25 długości modelu) przesunięty grzbietowo / na
//             burtę o ułamek półwymiaru bbox w tym kierunku, tak by żadne dwie role nie wypadły w jednym miejscu. Wszystkie po stronie
//             WIDOCZNEJ z kamery 3/4 hologramu (grzbiet albo prawa burta) — nic na brzuchu, nic do oglądania przez kadłub (runda 3)
//             (habitat zostaje przy regule bbox — na statkach kolonijnych właściciel stawia go ręcznie).
//   «burta» = prawa = góra × dziób (konwencja `frameQuaternion`) — w widoku 3/4 hologramu to burta zwrócona do kamery.
//   PRZYCIĄGANIE: gdy podano siatkę (`triangles` — trójkąty w przestrzeni znormalizowanej), każdy punkt domyślny POZA NAPĘDEM
//   przechodzi na najbliższy punkt powierzchni kadłuba (żaden nie wisi w pustce przed wąskim dziobem). Bez siatki — punkty reguły.
//
// ⚠ Moduł bez Three.js — wykonuje się pod node (keeper `ship_anchors_smoke`); `fetch` wstrzykiwany do pamięci podręcznej.

import { ANCHOR_ROLES, ANCHORS_VERSION, validateAnchors, moduleAnchorRole } from '../data/ShipAnchorsSchema.js';
import { SHIP_MODEL_DIR } from './ShipHardpoints.js';

export const ANCHORS_DIR = SHIP_MODEL_DIR + 'anchors/';

/** URL pliku kotwic klucza modelu. */
export function anchorsUrl(slot) { return ANCHORS_DIR + slot + '.json'; }

// Położenie domyślne ról (poza `drive`): `along` — ułamek DŁUGOŚCI modelu wzdłuż dziobu (+ ku dziobowi), `up` / `side` — ułamek
// PÓŁWYMIARU bbox w kierunku góry / prawej burty. Pięć różnych punktów (keeper: odstęp ≥ ANCHOR_MIN_SEPARATION).
export const ANCHOR_DEFAULT_LAYOUT = Object.freeze({
  weapons: Object.freeze({ along: 0.35, up: 0.7, side: 0 }),    // dziób, grzbiet
  defence: Object.freeze({ along: 0, up: 0, side: 0.8 }),       // śródokręcie, burta
  hold:    Object.freeze({ along: 0, up: 0.7, side: 0 }),       // śródokręcie, grzbiet (runda 3: z brzucha na stronę widoczną)
  mission: Object.freeze({ along: 0.2, up: 0.3, side: 0.8 }),   // przed śródokręciem, górna część burty do kamery (runda 3)
  habitat: Object.freeze({ along: -0.25, up: 0.7, side: 0 }),   // rufa, grzbiet
});
export const DRIVE_FALLBACK_ALONG = -0.45;   // [ułamek długości] dysza zastępcza, gdy hardpointy jej nie mają
// Bbox zastępczy (brak modelu): długość 1 wzdłuż dziobu, półwymiar 0,12 w górę i na burtę.
export const BBOX_FALLBACK_HALF = Object.freeze({ along: 0.5, up: 0.12, side: 0.12 });
export const ANCHOR_MIN_SEPARATION = 0.02;   // [przestrzeń znormalizowana] keeper: domyślne role nie nakładają się (reguła bez siatki)
export const SNAP_EPS = 1e-3;                // [przestrzeń znormalizowana] keeper: punkt domyślny po przyciągnięciu ≤ tyle od siatki

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const r4 = (x) => { const v = Math.round(x * 1e4) / 1e4; return Object.is(v, -0) ? 0 : v; };

/** Rama z hardpointów (dziób, góra ⟂ dziób, prawa = góra × dziób); śmieci ⇒ dziób −X, góra +Y. */
export function anchorFrame(frame) {
  const bow = norm(isVec3(frame?.bow) && Math.hypot(...frame.bow) > 1e-6 ? frame.bow : [-1, 0, 0]);
  let up = isVec3(frame?.up) ? frame.up : [0, 1, 0];
  up = [up[0] - bow[0] * dot(up, bow), up[1] - bow[1] * dot(up, bow), up[2] - bow[2] * dot(up, bow)];
  if (Math.hypot(...up) < 1e-6) up = Math.abs(bow[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  up = norm(up);
  return { bow, up, right: norm(cross(up, bow)) };
}

// ── najbliższy punkt na siatce (Ericson, «Real-Time Collision Detection» 5.1.5) ──────────────────────────────────────

/** Najbliższy punkt trójkąta (a, b, c) do punktu p — tablice [x, y, z]. */
export function closestPointOnTriangle(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [a[0], a[1], a[2]];
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [b[0], b[1], b[2]];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [c[0], c[1], c[2]];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

/**
 * Najbliższy punkt powierzchni siatki (trójkąty płasko: 9 liczb na trójkąt) albo null (brak siatki). Przegląd pełny —
 * wołany raz na model (wynik domyślnych trzymają wołający), ~30 tys. trójkątów × 6 punktów ≈ kilka ms.
 * @returns {{ p:number[], d:number }|null}
 */
export function closestPointOnMesh(p, triangles) {
  if (!isVec3(p) || !triangles || typeof triangles.length !== 'number' || triangles.length < 9) return null;
  let best = null, bestD2 = Infinity;
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (let k = 0; k + 8 < triangles.length; k += 9) {
    a[0] = triangles[k]; a[1] = triangles[k + 1]; a[2] = triangles[k + 2];
    b[0] = triangles[k + 3]; b[1] = triangles[k + 4]; b[2] = triangles[k + 5];
    c[0] = triangles[k + 6]; c[1] = triangles[k + 7]; c[2] = triangles[k + 8];
    // wczesne odrzucenie: odległość do prostopadłościanu trójkąta ≥ najlepsza
    const lo0 = Math.min(a[0], b[0], c[0]), hi0 = Math.max(a[0], b[0], c[0]);
    const lo1 = Math.min(a[1], b[1], c[1]), hi1 = Math.max(a[1], b[1], c[1]);
    const lo2 = Math.min(a[2], b[2], c[2]), hi2 = Math.max(a[2], b[2], c[2]);
    const e0 = p[0] < lo0 ? lo0 - p[0] : (p[0] > hi0 ? p[0] - hi0 : 0);
    const e1 = p[1] < lo1 ? lo1 - p[1] : (p[1] > hi1 ? p[1] - hi1 : 0);
    const e2 = p[2] < lo2 ? lo2 - p[2] : (p[2] > hi2 ? p[2] - hi2 : 0);
    if (e0 * e0 + e1 * e1 + e2 * e2 >= bestD2) continue;
    const q = closestPointOnTriangle(p, a, b, c);
    const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
    if (!Number.isFinite(d2)) continue;
    if (d2 < bestD2) { bestD2 = d2; best = q; }
  }
  return best ? { p: best, d: Math.sqrt(bestD2) } : null;
}

/** Środek ciężkości wieżyczek z hardpointów (tylko poprawne punkty) albo null. */
export function turretCentroid(hardpoints) {
  const pts = (Array.isArray(hardpoints?.weapons) ? hardpoints.weapons : []).map((w) => w?.p).filter(isVec3);
  if (!pts.length) return null;
  return [0, 1, 2].map((i) => pts.reduce((s, q) => s + q[i], 0) / pts.length);
}

/** Półwymiar prostopadłościanu (półosie `h`) w kierunku jednostkowym `d`. */
const halfAlong = (h, d) => Math.abs(d[0]) * h[0] + Math.abs(d[1]) * h[1] + Math.abs(d[2]) * h[2];

/**
 * Kotwice domyślne modelu (6 ról, kolejność `ANCHOR_ROLES`). Deterministyczne; nigdy nie rzuca.
 * @param {{ hardpoints?: object|null, bbox?: { min:number[], max:number[] }|null, triangles?: ArrayLike<number>|null }} [o]
 * @returns {{ role:string, p:number[], snapped?:boolean }[]}
 */
export function computeDefaultAnchors(o = {}) {
  const hardpoints = o && typeof o === 'object' ? o.hardpoints ?? null : null;
  const bbox = o && typeof o === 'object' ? o.bbox ?? null : null;
  const triangles = o && typeof o === 'object' ? o.triangles ?? null : null;
  const f = anchorFrame(hardpoints?.frame);
  let c = [0, 0, 0], hAlong = BBOX_FALLBACK_HALF.along, hUp = BBOX_FALLBACK_HALF.up, hSide = BBOX_FALLBACK_HALF.side;
  if (bbox && isVec3(bbox.min) && isVec3(bbox.max) && bbox.max.every((v, i) => v >= bbox.min[i])) {
    const h = [0, 1, 2].map((i) => (bbox.max[i] - bbox.min[i]) / 2);
    c = [0, 1, 2].map((i) => (bbox.max[i] + bbox.min[i]) / 2);
    hAlong = halfAlong(h, f.bow); hUp = halfAlong(h, f.up); hSide = halfAlong(h, f.right);
  }
  const len = 2 * hAlong;
  const at = ({ along, up, side }) => [0, 1, 2].map((i) => c[i] + f.bow[i] * along * len + f.up[i] * up * hUp + f.right[i] * side * hSide);
  const nz = Array.isArray(hardpoints?.nozzles) && hardpoints.nozzles.length && isVec3(hardpoints.nozzles[0]?.p) ? hardpoints.nozzles[0].p : null;
  const raw = {
    drive: nz ? [...nz] : at({ along: DRIVE_FALLBACK_ALONG, up: 0, side: 0 }),
    weapons: turretCentroid(hardpoints) ?? at(ANCHOR_DEFAULT_LAYOUT.weapons),
  };
  return ANCHOR_ROLES.map((role) => {
    const p0 = raw[role] ?? at(ANCHOR_DEFAULT_LAYOUT[role]);
    const s = triangles && role !== 'drive' ? closestPointOnMesh(p0, triangles) : null;   // napęd zostaje w środku dyszy
    return s ? { role, p: s.p.map(r4), snapped: true } : { role, p: p0.map(r4) };
  });
}

/** Czy lista domyślnych jest kompletna (6 ról w kolejności, punkty skończone) — wołający mogą podać gotowe (pamięć wyniku). */
const isDefaultsList = (d) => Array.isArray(d) && d.length === ANCHOR_ROLES.length && d.every((x, i) => x?.role === ANCHOR_ROLES[i] && isVec3(x.p));

/**
 * Kotwice modelu: role z pliku (poprawnego wg schematu) nad domyślnymi. NIGDY nie rzuca.
 * @param {string} slotKey — klucz modelu (24 klucze `VESSEL_MODEL_KEYS`)
 * @param {{ file?: object|null, hardpoints?: object|null, bbox?: object|null, triangles?: ArrayLike<number>|null, defaults?: object[]|null }} [ctx]
 *   `defaults` — gotowe `computeDefaultAnchors(...)` (pamięć wołającego: przyciąganie przegląda całą siatkę)
 * @returns {{ slot:string, anchors:{ role:string, p:number[], src:'file'|'default' }[], fromFile:number, fileOk:boolean|null }}
 */
export function anchorsFor(slotKey, ctx = {}) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const file = c.file ?? null, hardpoints = c.hardpoints ?? null, bbox = c.bbox ?? null, triangles = c.triangles ?? null;
  const slot = typeof slotKey === 'string' ? slotKey : String(slotKey ?? '');
  let defaults;
  if (isDefaultsList(c.defaults)) defaults = c.defaults;
  else { try { defaults = computeDefaultAnchors({ hardpoints, bbox, triangles }); } catch (e) { defaults = computeDefaultAnchors(); } }
  let fileOk = null;
  const fromFile = new Map();
  try {
    if (file != null) {
      fileOk = validateAnchors(file, { slot }).ok;
      if (fileOk) for (const a of file.anchors) fromFile.set(a.role, [...a.p]);
    }
  } catch (e) { fileOk = false; fromFile.clear(); }
  const anchors = defaults.map((d) => (fromFile.has(d.role)
    ? { role: d.role, p: fromFile.get(d.role), src: 'file' }
    : { role: d.role, p: d.p, src: 'default' }));
  return { slot, anchors, fromFile: fromFile.size, fileOk };
}

/**
 * Moduły kadłuba pogrupowane po rolach kotwic (K1c — lista na jednej linii odnośnika). Kolejność ról `ANCHOR_ROLES`,
 * w roli — kolejność montażu. Moduł bez roli (nie powinien istnieć — keeper) trafia do `unmapped`.
 * @param {string[]} moduleIds
 * @param {Record<string, object>} modulesDef — `SHIP_MODULES`
 */
export function groupModulesByRole(moduleIds = [], modulesDef = {}) {
  const groups = Object.fromEntries(ANCHOR_ROLES.map((r) => [r, []]));
  const unmapped = [];
  for (const id of Array.isArray(moduleIds) ? moduleIds : []) {
    const role = moduleAnchorRole(modulesDef?.[id]);
    if (role) groups[role].push(id); else unmapped.push(id);
  }
  return { groups, unmapped };
}

/** Pusty dokument kotwic dla klucza (wszystkie role domyślne). */
export function emptyAnchorsDoc(slot) { return { v: ANCHORS_VERSION, slot, anchors: [] }; }

// ── pamięć podręczna plików ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Pliki kotwic na klucz modelu. `load` NIGDY nie odrzuca: brak pliku / błąd sieci ⇒ null (same domyślne); plik niepoprawny ⇒
 * null + jedno ostrzeżenie w konsoli na klucz. Równoległe prośby o ten sam klucz dzielą jedno żądanie.
 */
export class ShipAnchorsCache {
  /** @param {{ fetchJson?: (url:string) => Promise<object|null>, warn?: (msg:string) => void }} [opts] */
  constructor({ fetchJson = null, warn = null } = {}) {
    this._fetchJson = typeof fetchJson === 'function' ? fetchJson : null;
    this._warn = typeof warn === 'function' ? warn : (m) => console.warn(m);
    this._docs = new Map();       // slot → dokument poprawny albo null (brak / niepoprawny)
    this._pending = new Map();
    this._invalid = new Set();
  }

  /** Dokument z pamięci: obiekt, null (brak pliku) albo undefined (jeszcze nie wczytano). */
  get(slot) { return this._docs.has(slot) ? this._docs.get(slot) : undefined; }

  /** @returns {Promise<object|null>} */
  load(slot) {
    if (this._docs.has(slot)) return Promise.resolve(this._docs.get(slot));
    if (this._pending.has(slot)) return this._pending.get(slot);
    const done = (doc) => { this._docs.set(slot, doc); return doc; };
    if (!this._fetchJson || typeof slot !== 'string' || !/^[a-z0-9_]+$/.test(slot)) return Promise.resolve(done(null));
    const p = Promise.resolve()
      .then(() => this._fetchJson(anchorsUrl(slot)))
      .then((doc) => {
        if (doc == null) return done(null);
        const v = validateAnchors(doc, { slot });
        if (!v.ok) {
          this._invalid.add(slot);
          this._warn(`[ShipAnchors] ${slot}: plik niepoprawny — kotwice domyślne: ${v.errors.slice(0, 3).join('; ')}`);
          return done(null);
        }
        return done(doc);
      })
      .catch(() => done(null))
      .finally(() => this._pending.delete(slot));
    this._pending.set(slot, p);
    return p;
  }

  /** Kotwice z pamięci (plik, jeśli wczytany) nad domyślnymi — `anchorsFor`. */
  anchorsFor(slot, ctx = {}) { return anchorsFor(slot, { ...ctx, file: this.get(slot) ?? null }); }

  /** Zapomnij klucz (podgląd po zapisie z Workshopu wczyta plik ponownie); bez argumentu — wszystko. */
  invalidate(slot = null) { if (slot == null) this._docs.clear(); else this._docs.delete(slot); }

  stats() { return { loaded: this._docs.size, withFile: [...this._docs.values()].filter(Boolean).length, invalid: [...this._invalid], pending: this._pending.size }; }
}
