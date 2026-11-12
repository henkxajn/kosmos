// ShipModelRig — statek na mapie w RAMIE KANONICZNEJ (ARC COMBAT VISUALS, krok CV-1a; plan §2.11, §4 CV-1a; D-CV-11 /
// D-CV-12; Findingi 619 (smuga), 620, 621, 624; flaga `cvModels`).
//
// Hierarchia (wrapper zostaje tym, czym był — pozycja, kurs, przechył, przechył wraku; klik liczony ekranowo od niego):
//
//   wrapper (Group)                       userData { kosmosType: 'vessel', vesselId } — ustawia renderer
//     └─ canon (Group)                    kwaternion ramy (dziób pliku → +Z, góra → +Y) · skala = rozmiar klasy
//          ├─ model (klon szablonu GLB)   skala 1 / najdłuższy wymiar, przesunięcie −środek / wymiar ⇒ ZNORMALIZOWANA
//          │                              przestrzeń modelu (ta sama, w której zapisane są hardpointy)
//          ├─ exhaust (Mesh, opcjonalny)  czubek w dyszy `nozzles[0].p`, smuga wzdłuż `nozzles[0].d`
//          └─ lights  (Mesh z puli)       punkty `lights[]` — tylko gdy lista niepusta (niezależnie od `keyColour.mode`)
//
// Dzieci `canon` żyją w znormalizowanej przestrzeni MODELU (przed obrotem ramy) — punkt z pliku hardpointów wstawia się
// wprost, bez przeliczeń; obrót i skala klasy dzieją się raz, na `canon`.
//
// MATERIAŁY (Finding 624): każdy statek dostaje KLONY materiałów szablonu (tekstury współdzielone — klonuje się tylko obiekt
// materiału), więc szarość utrzymania, krycie wywiadu i wygląd wraku dotykają wyłącznie własnego statku. Każdy klon dostaje
// maskę koloru-klucza (jeden program dla wszystkich — `KeyColourEmission`). Geometria szablonu NIE jest klonowana ani
// zwalniana przy usuwaniu statku (współdzielona przez wszystkie statki slotu — dawne `geometry.dispose()` na klonie wymuszało
// ponowne wgranie bufora dla pozostałych).
//
// ⚠ Three.js WSTRZYKIWANY (`THREE`) — moduł wykonuje się pod node na prawdziwym Three.js r171 (keeper `cv_models_render_smoke`).

import { frameQuaternion } from './ShipHardpoints.js';
import { applyKeyColour, setKeyColourGain, setKeyColourTint, setKeyColourBurn, setKeyColourBody, setKeyColourRim,
  setKeyColourWreckState, setKeyColourObjScale } from './KeyColourEmission.js';
import { damagePointsFromVertices, explosionSeed } from './combat/ExplosionLogic.js';   // ARC CV-5 — punkty uszkodzeń kadłuba

// Pokrętła (długość / promień smugi, mnożniki maski, tintu, żaru, światła czytelności, świateł) żyją w `cvTuning`
// (`LIVE_CV_FX`, klucze `MODEL_*`) — czyta je renderer CO KLATKĘ; ten moduł buduje tylko strukturę.

// Wygląd statku wg rodzaju. Tint ciała wroga (kolor + ilość — przed kontrolą właściciela `color.lerp` jak ścieżka OFF) i żar
// idą uniformami maski; ilość tintu mnoży pokrętło `MODEL_ENEMY_TINT`. Obwódka strony: swój — chłodna biel, NIEZALEŻNA od
// motywu (rola `primary` bywa czerwona albo bursztynowa — crimson, terminal_red, amber — i zlałaby się z wrogiem); wróg —
// rola `alert` motywu podawana przez renderer (`enemyRimHex`), tu wartość zapasowa = `danger` motywu domyślnego.
export const RIG_PALETTE = Object.freeze({
  ENEMY_COLOR: 0xff4466, ENEMY_COLOR_T: 0.55, ENEMY_TINT: 0x880022,
  WRECK_COLOR: 0x1a1a1a, WRECK_BURN: 0xff2200, WRECK_BURN_GAIN: 2.2, WRECK_BURN_DIM: 0x110000,
  OWN_RIM: 0xcfe9ff, ENEMY_RIM: 0xff3344,
});

const _bboxCache = new WeakMap();   // szablon → { c: [x,y,z], m } (bbox liczony raz na szablon)

/** Środek i najdłuższy wymiar bbox szablonu (z transformacjami węzłów). */
export function templateBounds(THREE, template) {
  const have = _bboxCache.get(template);
  if (have) return have;
  const box = new THREE.Box3().setFromObject(template);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const out = { c: [c.x, c.y, c.z], m: Math.max(size.x, size.y, size.z) || 1 };
  _bboxCache.set(template, out);
  return out;
}

/** Kolor hex (sRGB) → liniowe rgb (Three.js ColorManagement). */
function linear(THREE, hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }

/**
 * Obwódka strony na materiałach rigu (zmiana motywu — renderer przemalowuje wrogów nową rolą `alert`). Wrak — bez obwódki.
 * @param {object} THREE @param {object[]} materials
 * @param {'own'|'enemy'|'wreck'} kind
 * @param {number|null} [enemyRimHex] — rola `alert` motywu (0xRRGGBB); brak — `RIG_PALETTE.ENEMY_RIM`
 */
export function paintRigRim(THREE, materials, kind, enemyRimHex = null) {
  const rim = kind === 'wreck' ? [0, 0, 0]
    : linear(THREE, kind === 'enemy' ? (Number.isFinite(enemyRimHex) ? enemyRimHex : RIG_PALETTE.ENEMY_RIM) : RIG_PALETTE.OWN_RIM);
  for (const mat of materials) setKeyColourRim(mat, rim[0], rim[1], rim[2]);
}

/**
 * Wygląd materiałów rigu wg rodzaju. Wołane przy budowie i przy zamianie żywego statku we wrak (bez ponownego klonowania).
 * @param {object} THREE
 * @param {object[]} materials — własne klony statku
 * @param {'own'|'enemy'|'wreck'} kind
 * @param {{ burnHot?: boolean, enemyRimHex?: number|null }} [opts] — burnHot: żar HDR (fcCombatFx), inaczej ledwie widoczna
 *   czerwień; enemyRimHex: kolor obwódki wroga (rola `alert` motywu)
 */
export function paintRigMaterials(THREE, materials, kind, { burnHot = true, enemyRimHex = null } = {}) {
  const P = RIG_PALETTE;
  for (const mat of materials) {
    if (kind === 'enemy') {
      const c = linear(THREE, P.ENEMY_COLOR);
      setKeyColourBody(mat, c[0], c[1], c[2], P.ENEMY_COLOR_T);
      const t = linear(THREE, P.ENEMY_TINT);
      setKeyColourTint(mat, t[0], t[1], t[2]);
    } else if (kind === 'wreck') {
      if (mat.color) mat.color.setHex(P.WRECK_COLOR);
      if (mat.emissive) mat.emissive.setHex(0x000000);   // martwe okna z mapy emisji gasną; żar idzie uniformem
      if (mat.metalness != null) mat.metalness = 0.3;
      if (mat.roughness != null) mat.roughness = 1.0;
      mat.opacity = 1.0;
      mat.transparent = false;
      mat.needsUpdate = true;   // duch wroga (krycie wywiadu) bywał przezroczysty — przełącznik OPAQUE to define programu
      setKeyColourGain(mat, 0);
      setKeyColourTint(mat, 0, 0, 0);
      setKeyColourBody(mat, 1, 1, 1, 0);
      const b = burnHot ? linear(THREE, P.WRECK_BURN).map((x) => x * P.WRECK_BURN_GAIN) : linear(THREE, P.WRECK_BURN_DIM);
      setKeyColourBurn(mat, b[0], b[1], b[2]);
      setKeyColourWreckState(mat, { mode: 0, heat: 1 });   // ARC CV-5 — wygląd CV-1a (wypalanie włącza renderer pod flagą `cvDamage`)
    }
  }
  paintRigRim(THREE, materials, kind, enemyRimHex);
}

const _dmgPtsCache = new WeakMap();   // szablon → { key, pts } (skan wierzchołków raz na szablon i ramę)

/**
 * ARC CV-5 — trzy punkty uszkodzeń kadłuba (przód / środek / tył) w ZNORMALIZOWANEJ przestrzeni modelu: z pliku hardpointów
 * (`damagePoints` — tablica punktów) albo `"auto"` — wierzchołki siatki szablonu (`damagePointsFromVertices`, deterministycznie
 * z ziarna slotu). Pożary, dym uszkodzeń i wybuchy wtórne pancernika siedzą w tych punktach.
 * @returns {number[][]}
 */
export function rigDamagePoints(THREE, template, hp) {
  const list = Array.isArray(hp?.damagePoints) ? hp.damagePoints.filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) : [];
  if (list.length) return [0, 1, 2].map((i) => list[i % list.length].slice(0, 3));
  const key = `${hp?.slot ?? ''}|${JSON.stringify(hp?.frame ?? null)}`;
  const have = _dmgPtsCache.get(template);
  if (have && have.key === key) return have.pts;
  const { c, m } = templateBounds(THREE, template);
  const v = new THREE.Vector3();
  const verts = [];
  template.updateMatrixWorld(true);
  template.traverse((o) => {
    const pos = o.isMesh ? o.geometry?.attributes?.position : null;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 6000));   // ≤ ~6000 wierzchołków na siatkę — punkty uszkodzeń nie potrzebują więcej
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      verts.push((v.x - c[0]) / m, (v.y - c[1]) / m, (v.z - c[2]) / m);
    }
  });
  const pts = damagePointsFromVertices(verts, hp?.frame, explosionSeed('dmg', hp?.slot ?? 'slot'));
  _dmgPtsCache.set(template, { key, pts });
  return pts;
}

/**
 * Zbuduj statek w ramie kanonicznej.
 * @param {{ THREE: object, template: object, hardpoints: object, targetSize: number, kind: 'own'|'enemy'|'wreck',
 *           lightPool?: object|null, lightKey?: string, exhaust?: { gradient: {apex:object, base:object}, hdr: number }|null,
 *           burnHot?: boolean, enemyRimHex?: number|null }} o
 * @returns {{ root: object, canon: object, model: object, materials: object[], exhaust: object|null, lights: object|null,
 *             nozzleR: number, frameQuat: number[] }}
 */
export function buildShipRig({ THREE, template, hardpoints, targetSize, kind = 'own', lightPool = null, lightKey = '', exhaust = null, burnHot = true, enemyRimHex = null }) {
  const hp = hardpoints;
  const root = new THREE.Group();
  const canon = new THREE.Group();
  canon.name = 'cvCanon';
  const q = frameQuaternion(hp.frame);
  canon.quaternion.set(q[0], q[1], q[2], q[3]);
  const s = Number.isFinite(targetSize) && targetSize > 0 ? targetSize : 0.018;
  canon.scale.set(s, s, s);
  root.add(canon);

  const model = template.clone();
  const { c, m } = templateBounds(THREE, template);
  model.scale.set(1 / m, 1 / m, 1 / m);
  model.position.set(-c[0] / m, -c[1] / m, -c[2] / m);
  canon.add(model);

  // Klony materiałów + maska (Finding 624) — tekstury współdzielone, obiekt materiału własny.
  // ARC CV-5 — skala położenia wierzchołka do przestrzeni modelu (szwy wypalanego wraku): skala węzła w szablonie / najdłuższy wymiar.
  const meshScale = [];
  template.updateMatrixWorld(true);
  template.traverse((o) => { if (o.isMesh) meshScale.push(o.matrixWorld.getMaxScaleOnAxis()); });
  let mi = 0;
  const materials = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    const objScale = (meshScale[mi++] ?? 1) / m;
    child.castShadow = false;
    child.receiveShadow = false;
    if (!child.material) return;
    const one = (src) => { const mat = src.clone(); applyKeyColour(mat, hp.keyColour); setKeyColourObjScale(mat, objScale); materials.push(mat); return mat; };
    child.material = Array.isArray(child.material) ? child.material.map(one) : one(child.material);
  });
  paintRigMaterials(THREE, materials, kind, { burnHot, enemyRimHex });

  // Smuga silnika (Finding 619): czubek w dyszy, podstawa za rufą wzdłuż `d`; geometria jednostkowa — długość i promień
  // ustawia co klatkę `_applyExhaust` (pokrętła `MODEL_PLUME_*`, migotanie długości, nie grubości).
  let cone = null;
  const nz = hp.nozzles?.[0] ?? null;
  if (exhaust && nz && kind !== 'wreck') {
    const geo = new THREE.ConeGeometry(1, 1, 32, 1, true);
    geo.translate(0, -0.5, 0);   // czubek (y = +0,5) → 0, podstawa → y = −1
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 4);
    const { apex, base } = exhaust.gradient;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) + 1;   // 0 = podstawa (koniec smugi), 1 = czubek (dysza)
      col[i * 4]     = (base.r + (apex.r - base.r) * t) * exhaust.hdr;
      col[i * 4 + 1] = (base.g + (apex.g - base.g) * t) * exhaust.hdr;
      col[i * 4 + 2] = (base.b + (apex.b - base.b) * t) * exhaust.hdr;
      col[i * 4 + 3] = t;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    cone = new THREE.Mesh(geo, mat);
    const d = new THREE.Vector3(nz.d[0], nz.d[1], nz.d[2]).normalize();
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);   // lokalne −Y (ku podstawie) → kierunek smugi
    cone.position.set(nz.p[0], nz.p[1], nz.p[2]);
    cone.scale.set(1e-6, 1e-6, 1e-6);
    cone.renderOrder = 2;
    cone.visible = false;   // domyślnie zgaszony (idle) — jak dziś
    canon.add(cone);
  }

  // Punkty świetlne — WYŁĄCZNIE gdy lista niepusta; tryb maski nie ma tu nic do powiedzenia.
  let lights = null;
  if (lightPool && Array.isArray(hp.lights) && hp.lights.length > 0) {
    const geo = lightPool.geometryFor(lightKey || hp.slot, hp.lights);
    lights = lightPool.acquire(geo);
    if (lights) canon.add(lights);
  }

  // ARC CV-4a — wieżyczki (`weapons[].p` w przestrzeni modelu; strzały języka broni wychodzą z nich) i dziób modelu (zapasowe
  // punkty strzału na kadłubie dla slotów bez wieżyczek). Same dane — bez obiektów THREE.
  const weapons = Array.isArray(hp.weapons)
    ? hp.weapons.filter((w) => Array.isArray(w?.p) && w.p.length === 3 && w.p.every(Number.isFinite)).map((w) => ({ id: w.id ?? null, p: [w.p[0], w.p[1], w.p[2]] }))
    : [];
  const fb = Array.isArray(hp.frame?.bow) ? hp.frame.bow : [-1, 0, 0];
  const fbl = Math.hypot(fb[0], fb[1], fb[2]) || 1;
  // ARC CV-5 — punkty uszkodzeń (pożary, dym, wybuchy wtórne) i dysza (iskry krztuszącego się silnika) — same dane.
  const damagePoints = rigDamagePoints(THREE, template, hp);
  const nozzle = nz && Array.isArray(nz.p) && Array.isArray(nz.d) ? { p: [nz.p[0], nz.p[1], nz.p[2]], d: [nz.d[0], nz.d[1], nz.d[2]] } : null;
  return { root, canon, model, materials, exhaust: cone, lights, nozzleR: nz?.r ?? 0.04, frameQuat: q, slot: hp.slot,
    weapons, frameBow: [fb[0] / fbl, fb[1] / fbl, fb[2] / fbl], damagePoints, nozzle };
}

/**
 * Testowy wzór punktów świetlnych NA kadłubie (narzędzie `KOSMOS.debug.cvLightTest`) — do Workshopu CV-1c nikt nie kliknął
 * okien, a punkty trzeba dać się obejrzeć. Wierzchołki siatki w znormalizowanej przestrzeni modelu: czubek dziobu (cyjan),
 * lewa / prawa burta w połowie długości (czerwony / zielony — światła nawigacyjne), grzbiet w połowie (biały), lewa / prawa
 * krawędź przy rufie (cyjan). Lewa burta = +X ramy kanonicznej (patrząc od rufy ku dziobowi, góra +Y).
 * @returns {Array<{p:number[], size:number, colour:string}>}
 */
export function lightTestPattern(THREE, template, frame) {
  const { c, m } = templateBounds(THREE, template);
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const bow = nrm(frame?.bow ?? [-1, 0, 0]);
  let up = frame?.up ?? [0, 1, 0];
  const d = up[0] * bow[0] + up[1] * bow[1] + up[2] * bow[2];
  up = nrm([up[0] - d * bow[0], up[1] - d * bow[1], up[2] - d * bow[2]]);
  const xAx = [up[1] * bow[2] - up[2] * bow[1], up[2] * bow[0] - up[0] * bow[2], up[0] * bow[1] - up[1] * bow[0]];   // lewa burta
  const pick = { tip: null, port: null, star: null, top: null, sPort: null, sStar: null };
  const sc = { tip: -1e9, port: -1e9, star: -1e9, top: -1e9, sPort: -1e9, sStar: -1e9 };
  const v = new THREE.Vector3();
  template.updateMatrixWorld(true);
  template.traverse((o) => {
    const pos = o.isMesh ? o.geometry?.attributes?.position : null;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const p = [(v.x - c[0]) / m, (v.y - c[1]) / m, (v.z - c[2]) / m];
      const pb = p[0] * bow[0] + p[1] * bow[1] + p[2] * bow[2];
      const px = p[0] * xAx[0] + p[1] * xAx[1] + p[2] * xAx[2];
      const pu = p[0] * up[0] + p[1] * up[1] + p[2] * up[2];
      const take = (k, score) => { if (score > sc[k]) { sc[k] = score; pick[k] = p; } };
      take('tip', pb);
      if (Math.abs(pb) < 0.06) { take('port', px); take('star', -px); take('top', pu); }
      if (pb < -0.36) { take('sPort', px - 0.5 * Math.abs(pu)); take('sStar', -px - 0.5 * Math.abs(pu)); }
    }
  });
  const out = [];
  const add = (p, colour) => { if (p) out.push({ p: p.map((x) => Math.round(x * 1e4) / 1e4), size: 0.035, colour }); };
  add(pick.tip, '#7ff4ff'); add(pick.port, '#ff4040'); add(pick.star, '#40ff60'); add(pick.top, '#ffffff');
  add(pick.sPort, '#7ff4ff'); add(pick.sStar, '#7ff4ff');
  return out;
}

/**
 * Zwolnij to, co rig posiada: klony materiałów, smugę, punkty (do puli). Geometria szablonu ZOSTAJE.
 */
export function disposeShipRig(rig, lightPool = null) {
  if (!rig) return;
  if (rig.lights) { lightPool?.release?.(rig.lights); rig.lights = null; }
  for (const m of rig.materials ?? []) m.dispose?.();
  rig.materials = [];
  if (rig.exhaust) { rig.exhaust.geometry?.dispose?.(); rig.exhaust.material?.dispose?.(); rig.exhaust = null; }
}
