// ── POLISH P2a (CP13, CP14, Finding 458) — kadr „Obserwuj / Watch” i limit rozmiaru nakładek ──────────────────────
// Czysta matematyka (bez THREE, bez `window`) — wykonywalna pod node w keeperze `combat_watch_frame_smoke`. Renderer
// (`ThreeRenderer`) składa wejścia z kamery i sprite'ów, a wynik podaje kontrolerowi kamery (`flyTo`).
//
// Kamera kontrolera (`ThreeCameraController._applyCamera`): pozycja = cel + d·(sin φ cos θ, cos φ, sin φ sin θ),
// `camera.lookAt(cel)`, wektor „w górę” świata (0, 1, 0). Stąd baza kamery (wyprowadzenie w `cameraBasis`):
//   zc (od celu ku kamerze) = (sin φ cos θ, cos φ, sin φ sin θ)
//   xc (w prawo na ekranie)  = (sin θ, 0, −cos θ)
//   yc (w górę na ekranie)   = (−cos φ cos θ, sin φ, −cos φ sin θ)
// Rzut perspektywiczny (jak `PerspectiveCamera`): ndc_x = x_k / (głębia · tan(fov/2) · aspect),
// ndc_y = y_k / (głębia · tan(fov/2)); px_x = (ndc_x + 1)/2 · W, px_y = (1 − ndc_y)/2 · H.

/** Stałe kadru „Obserwuj” i limitów nakładek. Jednostki: [j.] = jednostki świata 3D (1 AU = 11 j.), [px] = piksele. */
export const COMBAT_WATCH = Object.freeze({
  MIN_DIST: 0.4,          // [j.] najbliższy kadr — makieta audytu P2 (§10.3: para 0,045 AU → d ≈ 0,40–0,43)
  MAX_DIST: 12,           // [j.] najdalszy kadr — rozpiętość starcia ~1 AU nadal w kadrze
  MARGIN_PX: 40,          // [px] margines prostokąta bezpiecznego (od krawędzi ekranu i paneli)
  MIN_SAFE_SIDE_PX: 120,  // [px] krótszy bok prostokąta bezpiecznego; mniej → cały ekran z marginesem
  ZOOM_MIN_DIST: 0.05,    // [j.] najmniejszy dystans kółkiem na czas „Obserwuj” (jak fokus statku)
  RETICLE_MAX_PX: 44,     // [px] najwyżej — czerwony celownik wykrytego wroga (CP14)
  FX_REF_DEPTH: 6,        // [j.] przy „Obserwuj” efekt walki nie większy na ekranie niż w tej głębi — kadr auto-fokusu (≤ 6 j.)
  NEAR_DEPTH: 0.01,       // [j.] punkt bliżej kamery niż to (albo za nią) — rzut nieokreślony
  MIN_DEPTH: 0.2,         // [j.] najbliższy uczestnik nie bliżej kamery (model fregaty ≤ ~60 px; para wzdłuż osi widzenia)
  FIT_ITERATIONS: 32,     // podział przedziału dystansu (dokładność ~1e-8 przedziału)
  CENTER_ITERATIONS: 12,  // centrowanie prostokąta rzutu (krok Newtona ze zmierzonym wzmocnieniem)
  CENTER_TOL_PX: 0.5,     // [px] dokładność centrowania
});

const v = (x, y, z) => ({ x, y, z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const mul = (a, k) => v(a.x * k, a.y * k, a.z * k);

/**
 * POLISH P2b (D1, Finding 467) — środek uczestników starcia: średnia pozycji (sprite'ów) żywych, widocznych uczestników.
 * JEDNO źródło dla kadru „Obserwuj” (`fitWatchFrame` — `centroid`), znacznika starcia i celu auto-fokusu (renderer bierze
 * go z `_computeWatchFit(enc).centroid`). Punkty bez skończonych współrzędnych pomijane; brak punktów — `null`.
 * @returns {{x:number,y:number,z:number}|null}
 */
export function centroidOf(points) {
  const pts = (points ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (!pts.length) return null;
  return mul(pts.reduce((s, p) => add(s, p), v(0, 0, 0)), 1 / pts.length);
}

/**
 * POLISH P2b (D1, Finding 467) — auto-fokus starcia ŚLEDZI walkę co klatkę (jak „Obserwuj”, bez dopasowania dystansu —
 * dystans ustawia start, potem kółko gracza). Dawniej cel stał w punkcie STARTU starcia (`location.point`), a walka
 * odpływała od niego o ~0,1 AU: kamera patrzyła na pierścień, nie na statki (bramka P2A u właściciela).
 * Krok na klatkę: KONIEC, gdy „Obserwuj” przejęło kamerę, starcie się skończyło albo nie jest w oglądanym układzie, albo
 * cel kamery zmienił ktoś inny (fokus ciała / statku / stacji, reset H, zmiana układu — cel ≠ ostatni ustawiony); inaczej
 * nowy cel = punkt śledzenia `centre` (renderer: uczestnicy wyśrodkowani w prostokącie bezpiecznym kadru — `watchTargetAt`
 * przy bieżącym dystansie); bez sprite'ów (model GLB jeszcze się wstawia) — cel bez zmian.
 * @returns {{ end: boolean, reason?: string, target?: {x,y,z}|null }}
 */
export function autoFocusFollowStep({ watching = false, active = false, inView = false, goal = null, lastGoal = null,
  centre = null, eps = 1e-6 }) {
  if (watching) return { end: true, reason: 'watch' };
  if (!active || !inView) return { end: true, reason: 'ended' };
  if (goal && lastGoal && (Math.abs(goal.x - lastGoal.x) > eps || Math.abs(goal.y - lastGoal.y) > eps
    || Math.abs(goal.z - lastGoal.z) > eps)) return { end: true, reason: 'camera_taken' };
  return { end: false, target: centre ?? null };
}

/**
 * Baza kamery kontrolera dla kątów (θ, φ) — wersory w przestrzeni świata.
 * @returns {{ zc: {x,y,z}, xc: {x,y,z}, yc: {x,y,z} }}
 */
export function cameraBasis(theta, phi) {
  const sp = Math.sin(phi), cp = Math.cos(phi), st = Math.sin(theta), ct = Math.cos(theta);
  return {
    zc: v(sp * ct, cp, sp * st),
    xc: v(st, 0, -ct),
    yc: v(-cp * ct, sp, -cp * st),
  };
}

/**
 * Rzut punktu świata na ekran dla kamery w pozycji `cam` o bazie `basis`.
 * @returns {{ x: number, y: number, depth: number }} px ekranu i głębia [j.] (≤ 0 — za kamerą)
 */
export function projectPoint(p, cam, basis, { tanHalf, aspect, W, H }) {
  const rel = sub(p, cam);
  const depth = -dot(rel, basis.zc);
  const xk = dot(rel, basis.xc), yk = dot(rel, basis.yc);
  const nx = xk / (depth * tanHalf * aspect), ny = yk / (depth * tanHalf);
  return { x: (nx + 1) / 2 * W, y: (1 - ny) / 2 * H, depth };
}

/**
 * Prostokąt bezpieczny kadru (px ekranu): ekran bez górnego paska, dolnych pasków, paneli bocznych (lewy outliner —
 * ARKUSZ UI U2-2 `leftW`; prawy Outliner — `rightW`) i panelu walki, z marginesem. Panel walki (`hudRect`, w jednostkach
 * LOGICZNYCH UI) leży na dole na środku — prostokąt kończy się nad nim. Zbyt mały prostokąt → cały ekran z marginesem
 * (lepiej zahaczyć o panel niż zgubić statki).
 */
export function watchSafeRect({ W, H, uiScale = 1, hudRect = null, topBarH = 0, bottomH = 0, rightW = 0, leftW = 0,
  marginPx = COMBAT_WATCH.MARGIN_PX, minSide = COMBAT_WATCH.MIN_SAFE_SIDE_PX }) {
  const s = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  const x0 = (Number.isFinite(leftW) && leftW > 0 ? leftW : 0) * s + marginPx;
  const x1 = W - rightW * s - marginPx;
  const y0 = topBarH * s + marginPx;
  let bottom = H - bottomH * s;
  if (hudRect && Number.isFinite(hudRect.y)) bottom = Math.min(bottom, hudRect.y * s);
  const y1 = bottom - marginPx;
  if (x1 - x0 < minSide || y1 - y0 < minSide) {
    return { x0: marginPx, x1: W - marginPx, y0: marginPx, y1: H - marginPx, fallback: true };
  }
  return { x0, x1, y0, y1, fallback: false };
}

/**
 * Cel kamery przy dystansie `d`, przy którym ŚRODEK PROSTOKĄTA RZUTU punktów (nie środek ciężkości 3D) stoi w środku
 * prostokąta bezpiecznego (panel walki na dole przesuwa go w górę ekranu). Start: środek ciężkości 3D w kotwicy; potem
 * przesunięcie boczne celu o błąd środka prostokąta rzutu, przeliczony na świat w głębi celu (z tłumieniem, do zbieżności).
 * ⚠ Dlaczego nie środek ciężkości 3D: para leżąca wzdłuż osi widzenia ma uczestników w RÓŻNEJ głębi — perspektywa
 *   przesuwa bliższego ku krawędzi (zmierzone, sonda P2a W: fregata ~0,9 j. bliżej kamery niż strażnik — przy
 *   dopasowaniu dotykała lewej krawędzi prostokąta, a środek grupy na ekranie stał ~180 px od kotwicy).
 * @returns {{ target: {x,y,z}, ok: boolean }} `ok: false` — któryś punkt za kamerą / bliżej niż `near`
 */
export function watchTargetAt({ points, d, theta, phi, fovDeg, aspect, W, H, safe, near = COMBAT_WATCH.NEAR_DEPTH,
  centerIterations = COMBAT_WATCH.CENTER_ITERATIONS, tolPx = COMBAT_WATCH.CENTER_TOL_PX }) {
  const pts = (points ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (!pts.length) return { target: null, ok: false };
  const tanHalf = Math.tan((fovDeg * Math.PI / 180) / 2);
  const asp = aspect > 0 ? aspect : W / H;
  const basis = cameraBasis(theta, phi);
  const c = centroidOf(pts);
  const axPx = (safe.x0 + safe.x1) / 2, ayPx = (safe.y0 + safe.y1) / 2;
  const ax = (axPx / W) * 2 - 1, ay = 1 - (ayPx / H) * 2;
  let t = sub(sub(c, mul(basis.xc, ax * d * tanHalf * asp)), mul(basis.yc, ay * d * tanHalf));
  const wpp = 2 * d * tanHalf / H;   // [j. / px] w głębi celu
  // środek prostokąta rzutu przy celu `tt` (null — któryś punkt za kamerą)
  const centerAt = (tt) => {
    const cam = add(tt, mul(basis.zc, d));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const s = projectPoint(p, cam, basis, { tanHalf, aspect: asp, W, H });
      if (!(s.depth > near)) return null;
      x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  };
  const H_PX = 2;   // [px] krok różnicy skończonej (przesunięcie celu o ~2 px w głębi celu)
  for (let i = 0; i <= centerIterations; i++) {
    const cc = centerAt(t);
    if (!cc) return { target: t, ok: false };
    const ex = axPx - cc.x, ey = ayPx - cc.y;
    if ((Math.abs(ex) <= tolPx && Math.abs(ey) <= tolPx) || i === centerIterations) break;
    // Krok Newtona osobno w osiach ekranu: wzmocnienie = zmiana środka prostokąta rzutu [px] na przesunięcie celu o 1 px
    // w głębi celu (punkty bliżej kamery reagują mocniej — perspektywa); przesunięcie celu w kierunku −xc przesuwa punkty
    // w prawo, w kierunku +yc — w dół ekranu.
    const cx = centerAt(sub(t, mul(basis.xc, H_PX * wpp)));
    const cy = centerAt(add(t, mul(basis.yc, H_PX * wpp)));
    const gx = cx ? Math.max(0.2, (cx.x - cc.x) / H_PX) : 1;
    const gy = cy ? Math.max(0.2, (cy.y - cc.y) / H_PX) : 1;
    t = add(sub(t, mul(basis.xc, (ex / gx) * wpp)), mul(basis.yc, (ey / gy) * wpp));
  }
  return { target: t, ok: true };
}

/**
 * Kadr „Obserwuj”: cel i dystans kamery, przy których WSZYSTKIE punkty (pozycje sprite'ów żywych uczestników) mieszczą
 * się w prostokącie bezpiecznym, przy bieżących kątach kamery; prostokąt ich rzutu wyśrodkowany w prostokącie
 * bezpiecznym (`watchTargetAt`); żaden uczestnik bliżej kamery niż `minDepth` (para wzdłuż osi widzenia). Dystans — najmniejszy mieszczący, w granicach [minD, maxD] (podział przedziału; przy
 * wyśrodkowanym prostokącie rzutu większy dystans go zmniejsza, więc „mieści się” rośnie z dystansem — wynik i tak
 * sprawdzany, a przy niezgodności dystans zwiększany o 5 % do skutku albo do maxD).
 * @returns {{ target: {x,y,z}, dist: number, fits: boolean, centroid: {x,y,z} } | null}
 */
export function fitWatchFrame({ points, theta, phi, fovDeg, aspect, W, H, safe,
  minD = COMBAT_WATCH.MIN_DIST, maxD = COMBAT_WATCH.MAX_DIST, near = COMBAT_WATCH.NEAR_DEPTH, minDepth = COMBAT_WATCH.MIN_DEPTH,
  iterations = COMBAT_WATCH.FIT_ITERATIONS }) {
  const pts = (points ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (!pts.length || !(W > 0) || !(H > 0) || !safe) return null;
  const tanHalf = Math.tan((fovDeg * Math.PI / 180) / 2);
  const asp = aspect > 0 ? aspect : W / H;
  const basis = cameraBasis(theta, phi);
  const c = centroidOf(pts);
  const at = (d) => watchTargetAt({ points: pts, d, theta, phi, fovDeg, aspect: asp, W, H, safe, near });
  const fits = (d) => {
    const r = at(d);
    if (!r.ok) return false;
    const cam = add(r.target, mul(basis.zc, d));
    for (const p of pts) {
      const s = projectPoint(p, cam, basis, { tanHalf, aspect: asp, W, H });
      if (!(s.depth >= minDepth) || s.x < safe.x0 || s.x > safe.x1 || s.y < safe.y0 || s.y > safe.y1) return false;
    }
    return true;
  };
  let dist; let ok = true;
  if (fits(minD)) dist = minD;
  else if (!fits(maxD)) { dist = maxD; ok = false; }
  else {
    let lo = minD, hi = maxD;
    for (let i = 0; i < iterations; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    dist = hi;
    while (!fits(dist) && dist < maxD) dist = Math.min(maxD, dist * 1.05);
    ok = fits(dist);
  }
  const r = at(dist);
  return { target: r.target ?? c, dist, fits: ok, centroid: c };
}

/**
 * Największy rozmiar świata billboardu (sprite'u zwróconego ku kamerze), który przy głębi `depth` [j.] ma na ekranie
 * najwyżej `capPx` [px]: rozmiar px = świat · H / (2 · głębia · tan(fov/2)).
 */
export function billboardMaxWorld({ capPx, depth, fovDeg, H }) {
  if (!(depth > 0) || !(H > 0)) return Infinity;
  return capPx * 2 * depth * Math.tan((fovDeg * Math.PI / 180) / 2) / H;
}

/** Rozmiar świata billboardu z limitem ekranowym `capPx` (CP14): bez zmian, dopóki na ekranie mieści się w limicie. */
export function capBillboardWorld(worldSize, { capPx, depth, fovDeg, H }) {
  return Math.min(worldSize, billboardMaxWorld({ capPx, depth, fovDeg, H }));
}

/**
 * Mnożnik skali efektu walki (błysk, pierścień osłony, wybuch) przy „Obserwuj”: rozmiar na ekranie ∝ rozmiar świata /
 * głębia, więc skala · min(1, głębia / `refDepth`) daje na ekranie NAJWYŻEJ to, co ten sam efekt ma w głębi `refDepth`
 * (kadr auto-fokusu). Głębia nieokreślona albo za kamerą — 1 (bez zmian).
 */
export function watchFxScale(depth, refDepth = COMBAT_WATCH.FX_REF_DEPTH) {
  if (!(depth > 0) || !(refDepth > 0)) return 1;
  return Math.min(1, depth / refDepth);
}

// ── POLISH P2b (D3, Finding 461) — płynne zbliżenie w starciu (wyłącznie rysowanie) ────────────────────────────────
// Krok zbliżenia (`DeepSpaceCombatSystem._closeToWeaponRange`) przesuwa statek raz na rundę — sprite wolnego statku brał
// pozycję logiczną od razu i skakał (≈ 0,028 AU co rundę; przy kadrze „Obserwuj” setki px). Renderer prowadzi sprite od
// pozycji WYŚWIETLANEJ do nowej pozycji logicznej przez jedną rundę czasu realnego (R = `combatRoundMs()`): ruch ciągły,
// kolejny krok zastaje sprite u celu. Logika walki nietknięta — pozycji logicznej nikt tu nie pisze.
// Stan: { from: {x,z}, to: {x,z}, elapsedMs, durMs, done } (płaszczyzna orbitalna; wysokość sprite'a bez zmian).
export const COMBAT_GLIDE = Object.freeze({
  DT_MAX_MS: 100,   // [ms] najdłuższy krok klatki (karta w tle / długa klatka — bez skoku na koniec ruchu)
  EPS: 1e-9,        // [j.] ten sam cel
});

/** Nowy ruch, gdy cel (pozycja logiczna) się zmienił — od pozycji wyświetlanej `cur`; ten sam cel — stan bez zmian. */
export function glideRetarget(glide, to, cur, durMs) {
  if (glide && Math.abs(glide.to.x - to.x) <= COMBAT_GLIDE.EPS && Math.abs(glide.to.z - to.z) <= COMBAT_GLIDE.EPS) return glide;
  const d = Number.isFinite(durMs) && durMs > 0 ? durMs : 1;
  return { from: { x: cur.x, z: cur.z }, to: { x: to.x, z: to.z }, elapsedMs: 0, durMs: d, done: false };
}

/** Krok ruchu o `dtMs` czasu realnego (≤ `DT_MAX_MS`): pozycja liniowo od `from` do `to`, `done` u celu. */
export function glideStep(glide, dtMs) {
  const dur = glide.durMs > 0 ? glide.durMs : 1;
  const dt = Math.min(Math.max(0, Number(dtMs) || 0), COMBAT_GLIDE.DT_MAX_MS);
  const el = Math.min(dur, Math.max(0, (glide.elapsedMs ?? 0) + dt));
  const k = el / dur;
  return { x: glide.from.x + (glide.to.x - glide.from.x) * k, z: glide.from.z + (glide.to.z - glide.from.z) * k,
    elapsedMs: el, done: el >= dur };
}
