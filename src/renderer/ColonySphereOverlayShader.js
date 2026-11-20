// ColonySphereOverlayShader — nakładka pól na kuli kolonii (ARC COLONY SPHERE, krok CS-7; plan §2 „lens overlay", §3.15).
//
// Jedna siatka (wachlarze trójkątów komórek pól — `ColonySphereLogic.buildTileMesh`) tuż nad powierzchnią. Wszystko, co
// zależy od stanu gry, idzie przez JEDNĄ małą teksturę (szerokość = liczba pól, 3 wiersze RGBA8 — `writeOverlayTile`)
// i kilka uniformów: wypełnienie pola (soczewka / tryb budowy / budynek), obrys pola, krawędzie graniczne własności,
// siatka przy kursorze albo cała (tryb budowy), obrys pola pod kursorem i pola zaznaczonego.
//
// ⚠ Moduł ma ZERO importów three (wzór SurfaceShader): THREE jest wstrzykiwane do fabryki, teksty programów czyta keeper
//   pod node, a sonda kompilacji ładuje ten sam plik w przeglądarce.
// ⚠ GLSL: wartości per kula WYŁĄCZNIE przez uniformy; w literałach GLSL nie ma odwrotnych apostrofów. Linie mają stałą
//   szerokość w pikselach (pochodne ekranowe współrzędnej krawędzi) i gasną przy limbie, gdzie komórka jest widziana z boku.
// ⚠ Nakładka jest warstwą UI: BEZ mapowania tonów i bez światła (barwy motywu trafiają na ekran wprost).

export const OVERLAY_VERT = /* glsl */`
uniform highp sampler2D uTiles;
uniform float uRadius;
attribute float aTile;
attribute float aEdge;
attribute float aSlot;
varying float vEdge;
varying float vTile;
varying vec4 vFill;
varying vec4 vLine;
varying vec4 vMeta;
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNormalW;

void main() {
  int ti = int(aTile + 0.5);
  vFill = texelFetch(uTiles, ivec2(ti, 0), 0);
  vLine = texelFetch(uTiles, ivec2(ti, 1), 0);
  vec4 m = texelFetch(uTiles, ivec2(ti, 2), 0);
  int mask = int(m.r * 255.0 + 0.5);
  int bit = (mask >> int(aSlot + 0.5)) & 1;
  // x: krawędź graniczna (0 / 1), y: szerokość obrysu [px], z: kreskowanie (0 / 1), w: granica obca (0 / 1)
  vMeta = vec4(float(bit), m.g * 255.0 / 16.0, m.b, m.a);
  vEdge = aEdge;
  vTile = aTile;
  vDir = position;
  vec4 wp = modelMatrix * vec4(position * uRadius, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const OVERLAY_FRAG = /* glsl */`
uniform vec4 uGridColor;
uniform vec4 uHoverColor;
uniform vec4 uSelColor;
uniform vec4 uOwnColor;
uniform vec4 uForeignColor;
uniform vec3 uCursor;
uniform vec2 uCursorCos;
uniform float uGridAll;
uniform float uHover;
uniform float uSel;
uniform float uPxScale;
varying float vEdge;
varying float vTile;
varying vec4 vFill;
varying vec4 vLine;
varying vec4 vMeta;
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNormalW;

// Krycie linii o połowie szerokości w [px] biegnącej po krawędzi komórki (dpx = odległość od krawędzi w px).
float lineMask(float dpx, float w) {
  return 1.0 - smoothstep(w - 0.6, w + 0.6, dpx);
}

vec4 over(vec4 dst, vec3 rgb, float a) {
  return vec4(mix(dst.rgb, rgb, a), dst.a + a * (1.0 - dst.a));
}

void main() {
  float fw = max(length(vec2(dFdx(vEdge), dFdy(vEdge))), 1e-6);
  float dpx = (1.0 - vEdge) / fw / uPxScale;
  float facing = dot(normalize(vNormalW), normalize(cameraPosition - vWorld));
  float limb = smoothstep(0.03, 0.22, facing);

  // 1. wypełnienie pola (soczewka, tryb budowy, budynek); kreskowanie = pola zabronione
  float stripe = step(2.6 * uPxScale, mod(gl_FragCoord.x + gl_FragCoord.y, 9.0 * uPxScale));
  float fillA = vFill.a * mix(1.0, mix(1.0, 0.30, stripe), step(0.5, vMeta.z));
  vec4 col = vec4(vFill.rgb, fillA);

  // 2. siatka: przy kursorze albo cała (tryb budowy)
  float near = smoothstep(uCursorCos.y, uCursorCos.x, dot(normalize(vDir), uCursor));
  float grid = max(uGridAll, near) * uGridColor.a * lineMask(dpx, 0.55);
  col = over(col, uGridColor.rgb, grid);

  // 3. granica własności (tylko krawędzie między polami różnych właścicieli)
  vec4 bc = mix(uOwnColor, uForeignColor, step(0.5, vMeta.w));
  col = over(col, bc.rgb, vMeta.x * bc.a * lineMask(dpx, 1.5));

  // 4. obrys pola (budynek, pole dozwolone w trybie budowy…)
  col = over(col, vLine.rgb, vLine.a * lineMask(dpx, vMeta.y));

  // 5. pole pod kursorem, 6. pole zaznaczone
  float isHover = 1.0 - step(0.5, abs(vTile - uHover));
  float isSel = 1.0 - step(0.5, abs(vTile - uSel));
  col = over(col, uHoverColor.rgb, isHover * uHoverColor.a * max(lineMask(dpx, 1.4), 0.10));
  col = over(col, uSelColor.rgb, isSel * uSelColor.a * max(lineMask(dpx, 2.3), 0.16));

  gl_FragColor = vec4(col.rgb, col.a * limb);
}
`;

/** Uniformy nakładki (wektory = zwykłe tablice). */
export function createOverlayUniforms(texture, radius) {
  return {
    uTiles:        { value: texture },
    uRadius:       { value: radius },
    uGridColor:    { value: [0.75, 0.9, 1.0, 0.34] },
    uHoverColor:   { value: [1.0, 1.0, 1.0, 0.95] },
    uSelColor:     { value: [1.0, 0.85, 0.35, 1.0] },
    uOwnColor:     { value: [0.3, 1.0, 0.75, 0.85] },
    uForeignColor: { value: [1.0, 0.35, 0.3, 0.85] },
    uCursor:       { value: [0, 0, 0] },
    uCursorCos:    { value: [1, 1] },
    uGridAll:      { value: 0 },
    uHover:        { value: -1 },
    uSel:          { value: -1 },
    uPxScale:      { value: 1 },
  };
}

/** Tekstura stanu pól z bajtów `createOverlayData` (szerokość = liczba pól, 3 wiersze). */
export function createOverlayTexture(THREE, data, count) {
  const tex = new THREE.DataTexture(data, count, 3, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Materiał nakładki pól. */
export function createOverlayMaterial(THREE, texture, radius) {
  const material = new THREE.ShaderMaterial({
    uniforms: createOverlayUniforms(texture, radius),
    vertexShader: OVERLAY_VERT,
    fragmentShader: OVERLAY_FRAG,
    // ⚠ BEZ testu głębi: płaskie trójkąty komórki leżą POD powierzchnią kuli (strzałka cięciwy > odstęp nakładki), więc
    //   test głębi zostawiał z pola same okruchy przy wierzchołkach. Powłoka jest wypukła — ściany przednie (FrontSide)
    //   to dokładnie ściany widoczne; nakładka rysuje się ostatnia (renderOrder gospodarza).
    transparent: true, depthWrite: false, depthTest: false, side: THREE.FrontSide,
  });
  material.userData.colonySphereOverlay = true;
  return material;
}

/** Geometria nakładki z siatki `buildTileMesh`. */
export function createOverlayGeometry(THREE, mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.position, 3));
  g.setAttribute('aTile', new THREE.BufferAttribute(mesh.tile, 1));
  g.setAttribute('aEdge', new THREE.BufferAttribute(mesh.edge, 1));
  g.setAttribute('aSlot', new THREE.BufferAttribute(mesh.slot, 1));
  return g;
}

export const ColonySphereOverlayShader = {
  OVERLAY_VERT, OVERLAY_FRAG, createOverlayUniforms, createOverlayTexture, createOverlayMaterial, createOverlayGeometry,
};
