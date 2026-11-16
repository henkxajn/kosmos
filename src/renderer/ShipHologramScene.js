// ShipHologramScene — budowa sceny hologramu statku z szablonu GLB (ARC KONSOLE, krok K1a; CONSOLES_PLAN.md §2 B2/B4).
//
// ⚠ Three.js WSTRZYKIWANY (`THREE`) — moduł wykonuje się pod node na prawdziwym Three.js r171 (keeper `ship_hologram_smoke`).
//
// ZASADA WSPÓŁDZIELENIA (keeper: materiały sceny głównej bajt w bajt nietknięte):
//   • szablon GLB z pamięci ThreeRenderera jest TYLKO CZYTANY — żadnego `updateMatrixWorld`, `computeBoundingBox`,
//     podmiany materiału ani `dispose()` na jego obiektach; macierze liczone z position/quaternion/scale na boku;
//   • geometria współdzielona tylko do odczytu (nowe `Mesh` na tej samej geometrii); wyjątek — siatka bez normalnych dostaje
//     WŁASNĄ kopię z policzonymi normalnymi (zwalnianą tutaj);
//   • materiały własne: jeden `ShaderMaterial` hologramu + materiał głębi + materiał linii na rendererze (na epokę motywu —
//     zmiana motywu przemalowuje uniformy, bez nowego programu); EdgesGeometry własne (zwalniane tutaj).
//
// Hierarchia: yaw (Group: obrót −π/2 — dziób +Z ramy kanonicznej → −X, w lewo ekranu; plus auto-obrót)
//               └─ canon (Group: kwaternion ramy z hardpointów — dziób pliku → +Z, góra → +Y)
//                    └─ norm (Group: skala 1/najdłuższy wymiar, przesunięcie −środek) → siatki głębi, hologramu i linie krawędzi
//
// GLSL: stałe łańcuchy bez interpolacji i bez grawisów (współdzielona pamięć programów; pułapka CLAUDE.md) — wartości per
// obiekt wyłącznie uniformami. Próba kompilacji w Chrome z celowo błędną kontrolą: sonda K1a `k1a_glsl.mjs`.

import { frameQuaternion } from './ShipHardpoints.js';

export const HOLO_VERT =
  'uniform float uOrtho;\n' +
  'varying vec3 vN;\n' +
  'varying vec3 vV;\n' +
  'void main() {\n' +
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);\n' +
  '  vN = normalize(normalMatrix * normal);\n' +
  '  vV = mix(normalize(-mv.xyz), vec3(0.0, 0.0, 1.0), uOrtho);\n' +
  '  gl_Position = projectionMatrix * mv;\n' +
  '}\n';

// Obwódka fresnela (dominująca) + słabe wypełnienie + ekranowe linie skanowania; wyjście premultiplikowane (mieszanie addytywne).
export const HOLO_FRAG =
  'uniform vec3 uCol;\n' +
  'uniform float uRim;\n' +
  'uniform float uScan;\n' +
  'uniform float uTime;\n' +
  'uniform float uAlpha;\n' +
  'uniform float uLinePx;\n' +
  'varying vec3 vN;\n' +
  'varying vec3 vV;\n' +
  'void main() {\n' +
  '  float ndv = abs(dot(normalize(vN), normalize(vV)));\n' +
  '  float f = pow(1.0 - ndv, 2.4);\n' +
  '  float rim = clamp(f * uRim, 0.0, 1.0);\n' +
  '  float band = step(0.5, fract(gl_FragCoord.y / max(uLinePx, 1.0) - uTime * 0.35));\n' +
  '  float a = clamp(0.035 + 0.9 * rim, 0.0, 1.0) * (1.0 - uScan * band) * uAlpha;\n' +
  '  gl_FragColor = vec4(uCol * a, a);\n' +
  '}\n';

/**
 * Materiały hologramu (jeden komplet na renderer; kolor = rola `primary` motywu).
 * @param {object} THREE @param {string} colorCss — kolor CSS roli (np. `#ffb000`)
 */
export function createHoloMaterials(THREE, colorCss) {
  const holo = new THREE.ShaderMaterial({
    uniforms: {
      uCol: { value: new THREE.Color() }, uRim: { value: 1 }, uScan: { value: 0.2 }, uTime: { value: 0 },
      uAlpha: { value: 1 }, uLinePx: { value: 3 }, uOrtho: { value: 0 },
    },
    vertexShader: HOLO_VERT, fragmentShader: HOLO_FRAG,
    transparent: true, depthWrite: false, depthTest: true, premultipliedAlpha: true,
    blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  // Przebieg głębi: kadłub zasłania tylne krawędzie i wnętrze; odsunięty (polygonOffset), żeby krawędzie na powierzchni przechodziły.
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const line = new THREE.LineBasicMaterial({ color: new THREE.Color(), transparent: true, opacity: 0.22, depthWrite: false,
    premultipliedAlpha: true, blending: THREE.AdditiveBlending });
  const mats = { holo, depth, line, xray: 0 };
  recolorHoloMaterials(THREE, mats, colorCss);
  return mats;
}

/** Przemalowanie na kolor roli (zmiana epoki motywu) — tylko uniform / kolor, bez nowego programu. */
export function recolorHoloMaterials(THREE, mats, colorCss) {
  // Shader hologramu pisze kolor wprost (bez konwersji przestrzeni barw) → wartości sRGB motywu bez linearyzacji;
  // LineBasicMaterial konwertuje liniowy → sRGB na wyjściu → kolor podany zwykłą drogą (sRGB → liniowy).
  mats.holo.uniforms.uCol.value.setStyle(colorCss, THREE.LinearSRGBColorSpace);
  mats.line.color.setStyle(colorCss);
}

/** Tryb prześwitu (pokrętło `xray`): 1 = bez przebiegu głębi, obie strony, linie bez testu głębi. */
export function setHoloXray(mats, xray, THREE) {
  const on = xray >= 0.5 ? 1 : 0;
  if (mats.xray === on) return false;
  mats.xray = on;
  mats.depth.visible = !on;
  mats.holo.side = on ? THREE.DoubleSide : THREE.FrontSide;
  mats.holo.depthTest = !on;
  mats.line.depthTest = !on;
  mats.holo.needsUpdate = true;
  mats.line.needsUpdate = true;
  return true;
}

export function disposeHoloMaterials(mats) {
  if (!mats) return;
  mats.holo?.dispose?.(); mats.depth?.dispose?.(); mats.line?.dispose?.();
}

// Macierze siatek szablonu względem jego korzenia — liczone z position/quaternion/scale (szablonu NIE dotykamy).
function collectMeshes(THREE, root) {
  const out = [];
  const visit = (o, parentM) => {
    const local = o.matrixAutoUpdate === false ? o.matrix.clone() : new THREE.Matrix4().compose(o.position, o.quaternion, o.scale);
    const m = parentM ? parentM.clone().multiply(local) : local;
    if (o.isMesh && o.geometry?.attributes?.position) out.push({ geometry: o.geometry, matrix: m });
    for (const c of o.children ?? []) visit(c, m);
  };
  visit(root, null);
  return out;
}

/**
 * Model hologramu z szablonu GLB.
 * @param {object} THREE
 * @param {object} template — `gltf.scene` (tylko odczyt)
 * @param {{ frame?: {bow:number[],up:number[]}, edgeAngle: number, mats: object }} opts
 */
export function buildHoloModel(THREE, template, { frame = null, edgeAngle = 50, mats }) {
  const parts = collectMeshes(THREE, template);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  for (const p of parts) { tmp.setFromBufferAttribute(p.geometry.attributes.position).applyMatrix4(p.matrix); box.union(tmp); }
  const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const m = Math.max(size.x, size.y, size.z) || 1;

  const yaw = new THREE.Group(); yaw.rotation.y = -Math.PI / 2;
  const canon = new THREE.Group();
  const q = frameQuaternion(frame ?? { bow: [-1, 0, 0], up: [0, 1, 0] });
  canon.quaternion.set(q[0], q[1], q[2], q[3]);
  const norm = new THREE.Group();
  norm.scale.setScalar(1 / m);
  norm.position.set(-c.x / m, -c.y / m, -c.z / m);
  yaw.add(canon); canon.add(norm);

  const model = { root: yaw, canon, norm, parts: [], ownGeoms: [], edgeGeoms: [], edgeLines: [], edgeAngle: null,
    tris: 0, meshes: parts.length, edgeCount: 0, segments: new Float32Array(0), bounds: { c: [c.x, c.y, c.z], m } };
  for (const p of parts) {
    let g = p.geometry;
    if (!g.attributes.normal) { g = g.clone(); g.computeVertexNormals(); model.ownGeoms.push(g); }
    const d = new THREE.Mesh(g, mats.depth); d.matrixAutoUpdate = false; d.matrix.copy(p.matrix); d.renderOrder = 0;
    const h = new THREE.Mesh(g, mats.holo); h.matrixAutoUpdate = false; h.matrix.copy(p.matrix); h.renderOrder = 1;
    norm.add(d); norm.add(h);
    model.parts.push({ geometry: p.geometry, matrix: p.matrix, depth: d, holo: h });
    model.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  model.tris = Math.round(model.tris);
  // K1b — bbox modelu w PRZESTRZENI ZNORMALIZOWANEJ (środek 0, najdłuższy wymiar 1 — przestrzeń hardpointów i kotwic): wejście
  // domyślnych kotwic (`computeDefaultAnchors`). Ten sam bbox szablonu co skala `norm` (bez dotykania szablonu).
  model.normBox = box.isEmpty() ? null : {
    min: [(box.min.x - c.x) / m, (box.min.y - c.y) / m, (box.min.z - c.z) / m],
    max: [(box.max.x - c.x) / m, (box.max.y - c.y) / m, (box.max.z - c.z) / m],
  };
  // Zasięg modelu w ramie wyświetlania (kadr rysunku technicznego — sylwetka i plan; krawędzie nie wyznaczają obrysu gładkich burt).
  const disp = displayMatrix(THREE, model), mm = new THREE.Matrix4(), v = new THREE.Vector3();
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of model.parts) {
    mm.copy(disp).multiply(p.matrix);
    const pos = p.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mm);
      if (v.x < mn[0]) mn[0] = v.x; if (v.y < mn[1]) mn[1] = v.y; if (v.z < mn[2]) mn[2] = v.z;
      if (v.x > mx[0]) mx[0] = v.x; if (v.y > mx[1]) mx[1] = v.y; if (v.z > mx[2]) mx[2] = v.z;
    }
  }
  model.extent = Number.isFinite(mn[0]) ? { min: mn, max: mx } : null;
  rebuildHoloEdges(THREE, model, edgeAngle, mats);
  return model;
}

// K1b — trójkąty w PRZESTRZENI ZNORMALIZOWANEJ (hardpointów i kotwic): wejście przyciągania domyślnych kotwic do kadłuba.
function normTriangles(THREE, parts, c, m) {
  const mm = new THREE.Matrix4(), v = new THREE.Vector3();
  const nm = new THREE.Matrix4().compose(new THREE.Vector3(-c[0] / m, -c[1] / m, -c[2] / m), new THREE.Quaternion(), new THREE.Vector3(1 / m, 1 / m, 1 / m));
  let n = 0;
  for (const p of parts) n += (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count);
  const out = new Float32Array(n * 3); let o = 0;
  for (const p of parts) {
    mm.copy(nm).multiply(p.matrix);
    const pos = p.geometry.attributes.position, idx = p.geometry.index;
    const cnt = idx ? idx.count : pos.count;
    for (let i = 0; i < cnt; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mm);
      out[o++] = v.x; out[o++] = v.y; out[o++] = v.z;
    }
  }
  return out;
}

/** K1b — trójkąty modelu hologramu w przestrzeni znormalizowanej (leniwie, w pamięci modelu; zwalniane z modelem). */
export function modelNormTriangles(THREE, model) {
  if (!model._ntri) model._ntri = normTriangles(THREE, model.parts, model.bounds.c, model.bounds.m);
  return model._ntri;
}

/**
 * K1b — te same trójkąty prosto z szablonu GLB (Model Workshop): ten sam zbiór siatek, macierze i bbox co `buildHoloModel`,
 * więc domyślne kotwice w Workshopie = domyślne w grze. Szablon tylko czytany.
 */
export function templateNormTriangles(THREE, template) {
  const parts = collectMeshes(THREE, template);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  for (const p of parts) { tmp.setFromBufferAttribute(p.geometry.attributes.position).applyMatrix4(p.matrix); box.union(tmp); }
  if (box.isEmpty()) return new Float32Array(0);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  return normTriangles(THREE, parts, [c.x, c.y, c.z], Math.max(size.x, size.y, size.z) || 1);
}

/** Macierz ramy wyświetlania (bez auto-obrotu): yaw(−π/2) · canon · norm — przestrzeń szablonu → dziób −X, góra +Y. */
export function displayMatrix(THREE, model) {
  return new THREE.Matrix4().makeRotationY(-Math.PI / 2)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(model.canon.quaternion))
    .multiply(new THREE.Matrix4().compose(model.norm.position, new THREE.Quaternion(), model.norm.scale));
}

/** Trójkąty modelu w ramie wyświetlania (Float32Array, 9 liczb na trójkąt) — liczone leniwie przy pierwszej sylwetce. */
export function modelTriangles(THREE, model) {
  if (model._tri) return model._tri;
  const disp = displayMatrix(THREE, model), mm = new THREE.Matrix4(), v = new THREE.Vector3();
  let n = 0;
  for (const p of model.parts) n += (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count);
  const out = new Float32Array(n * 3); let o = 0;
  for (const p of model.parts) {
    mm.copy(disp).multiply(p.matrix);
    const pos = p.geometry.attributes.position, idx = p.geometry.index;
    const cnt = idx ? idx.count : pos.count;
    for (let i = 0; i < cnt; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mm);
      out[o++] = v.x; out[o++] = v.y; out[o++] = v.z;
    }
  }
  model._tri = out;
  return out;
}

/** (Prze)budowa linii krawędzi przy progu `edgeAngle` [°] + segmenty sylwetki w ramie wyświetlania (dziób −X, góra +Y). */
export function rebuildHoloEdges(THREE, model, edgeAngle, mats) {
  for (const l of model.edgeLines) model.norm.remove(l);
  for (const g of model.edgeGeoms) g.dispose();
  model.edgeLines = []; model.edgeGeoms = [];
  const disp = displayMatrix(THREE, model);
  const chunks = []; let total = 0;
  const v = new THREE.Vector3(), mm = new THREE.Matrix4();
  for (const p of model.parts) {
    const eg = new THREE.EdgesGeometry(p.geometry, edgeAngle);
    model.edgeGeoms.push(eg);
    const ls = new THREE.LineSegments(eg, mats.line); ls.matrixAutoUpdate = false; ls.matrix.copy(p.matrix); ls.renderOrder = 2;
    model.norm.add(ls); model.edgeLines.push(ls);
    const pos = eg.attributes.position; const out = new Float32Array(pos.count * 3);
    mm.copy(disp).multiply(p.matrix);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mm); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    chunks.push(out); total += out.length;
  }
  const seg = new Float32Array(total); let o = 0;
  for (const ch of chunks) { seg.set(ch, o); o += ch.length; }
  model.segments = seg; model.edgeCount = total / 6; model.edgeAngle = edgeAngle;
  return model.edgeCount;
}

/** Zwolnienie WYŁĄCZNIE własnych zasobów modelu (krawędzie, kopie z normalnymi) — geometria szablonu nietknięta. */
export function disposeHoloModel(model) {
  if (!model) return;
  for (const g of model.edgeGeoms) g.dispose();
  for (const g of model.ownGeoms) g.dispose();
  model.edgeGeoms = []; model.ownGeoms = []; model.edgeLines = [];
  model.root?.removeFromParent?.();
}

/**
 * Sylwetka (fallback D-K-11) i rysunek techniczny na Canvas 2D: bok (x, y) u góry, góra (x, z) u dołu (`technicalLayout`).
 * Bez WebGL (działa też, gdy kontekst się nie utworzył).
 *   1. wypełnienie rzutu trójkątów (jedna ścieżka, reguła nonzero — krycie równe, bez kumulacji) o niskim kryciu;
 *   2. kontur rzutu = maska − erozja maski (operacje kompozycji płótna: `destination-in` przesuniętych kopii, potem
 *      `destination-out`) — gładkie burty nie mają krawędzi załamań, więc bez konturu detale na nich «wisiały» poza statkiem
 *      (diagnoza K1a: nie oś, nie wyspy geometrii);
 *   3. krawędzie załamań (EdgesGeometry) jako detal.
 * Kroki 1–2 wymagają `triangles` i `createCanvas`; bez nich — same krawędzie. @returns liczba narysowanych segmentów
 */
export const SIL_FILL_ALPHA = 0.08;
export const SIL_OUTLINE_ALPHA = 0.9;
export function drawSilhouette(ctx, segments, layout, { color, alpha = 0.55, lineWidth = 1, triangles = null, createCanvas = null, w = 0, h = 0 } = {}) {
  if (triangles && createCanvas && w > 0 && h > 0) {
    try {
      const mask = createCanvas(w, h), mc = mask.getContext('2d');
      mc.fillStyle = color;
      mc.beginPath();
      const nt = Math.floor(triangles.length / 9);
      for (const view of ['side', 'top']) {
        for (let i = 0; i < nt; i++) {
          const k = i * 9;
          const a = view === 'side' ? layout.sideXY(triangles[k], triangles[k + 1]) : layout.topXZ(triangles[k], triangles[k + 2]);
          const b = view === 'side' ? layout.sideXY(triangles[k + 3], triangles[k + 4]) : layout.topXZ(triangles[k + 3], triangles[k + 5]);
          const c = view === 'side' ? layout.sideXY(triangles[k + 6], triangles[k + 7]) : layout.topXZ(triangles[k + 6], triangles[k + 8]);
          // Jeden obieg dla wszystkich trójkątów: w rzucie zamkniętej siatki ściany przednie i tylne mają przeciwny obieg
          // i przy regule nonzero znosiłyby się (pomiar K1a: maska medium cargo 965 px zamiast kadłuba).
          const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
          mc.moveTo(a[0], a[1]);
          if (area >= 0) { mc.lineTo(b[0], b[1]); mc.lineTo(c[0], c[1]); } else { mc.lineTo(c[0], c[1]); mc.lineTo(b[0], b[1]); }
          mc.closePath();
        }
      }
      mc.fill();
      const t = Math.max(1, Math.round(lineWidth * 1.5));
      const ero = createCanvas(w, h), ec = ero.getContext('2d');
      ec.drawImage(mask, 0, 0);
      ec.globalCompositeOperation = 'destination-in';
      for (const [dx, dy] of [[t, 0], [-t, 0], [0, t], [0, -t]]) ec.drawImage(mask, dx, dy);
      const outl = createCanvas(w, h), oc = outl.getContext('2d');
      oc.drawImage(mask, 0, 0);
      oc.globalCompositeOperation = 'destination-out';
      oc.drawImage(ero, 0, 0);
      ctx.save();
      ctx.globalAlpha = SIL_FILL_ALPHA; ctx.drawImage(mask, 0, 0);
      ctx.globalAlpha = SIL_OUTLINE_ALPHA; ctx.drawImage(outl, 0, 0);
      ctx.restore();
    } catch (e) { /* bez maski — same krawędzie */ }
  }
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = lineWidth;
  const n = Math.floor((segments?.length ?? 0) / 6);
  const BATCH = 4000;
  for (const view of ['side', 'top']) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const k = i * 6;
      const a = view === 'side' ? layout.sideXY(segments[k], segments[k + 1]) : layout.topXZ(segments[k], segments[k + 2]);
      const b = view === 'side' ? layout.sideXY(segments[k + 3], segments[k + 4]) : layout.topXZ(segments[k + 3], segments[k + 5]);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      if ((i + 1) % BATCH === 0) { ctx.stroke(); ctx.beginPath(); }
    }
    ctx.stroke();
  }
  ctx.restore();
  return n;
}
