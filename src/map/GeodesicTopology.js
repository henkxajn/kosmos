// GeodesicTopology — czysta topologia siatki geodezyjnej kuli (ARC COLONY SPHERE, krok CS-5a; plan §2, D-CS-8, D-CS-9).
//
// Siatka = dual podzielonego dwudziestościanu (Goldberg): wierzchołki podziału o częstości n są środkami pól,
// 10·n² + 2 pól, w tym DOKŁADNIE 12 pięciokątów (narożniki dwudziestościanu), reszta sześciokąty.
//
// ── Zasady ───────────────────────────────────────────────────────────────────────────────────────────────────────
//  • Moduł BEZ importów i bez efektów ubocznych (działa w workerze i pod node) — jak SurfaceField.
//  • Identyfikatory całkowite i KOMBINATORYCZNE (bez mapy kluczowanej zaokrąglonymi floatami, inaczej niż prototyp):
//      0…11                         — narożniki dwudziestościanu (pięciokąty),
//      12 … 12+30(n−1)−1            — wnętrza krawędzi: krawędź e (posortowana para wierzchołków), krok k = 1…n−1
//                                     licząc od wierzchołka o MNIEJSZYM numerze,
//      dalej                        — wnętrza ścian: ściana f (kolejność F), (i, j) leksykograficznie.
//  • Geometria WYŁĄCZNIE + − × ÷ sqrt (jak ścieżka rozgrywki SurfaceField, D-CS-16): środki pól, kolejność sąsiadów
//    (pseudo-kąt w płaszczyźnie stycznej, bez atan2), szerokość pasów — ten sam wynik w każdym silniku JS.
//  • Topologia jest buforowana per n (5 wspólnych topologii; teren różni się per ciało).
//
// ── API ──────────────────────────────────────────────────────────────────────────────────────────────────────────
//  geodesicTopology(n) → { n, count, cx, cy, cz (Float64Array środków), nbStart, nbList (CSR, kolejność stała:
//    przeciwnie do zegara patrząc z zewnątrz, od kierunku e1), isPentagon(i), neighbors(i) (kopie), distance(a, b)
//    (macierz BFS), within(i, k) / ring(i, k) (BFS, kolejność odkrycia), path(a, b, passable, maxIterations),
//    equatorTile(), latitudeCutoffs(polarShare, subpolarShare) }
//  geodesicTileCount(n) = 10·n² + 2; geodesicNForCount(count) → n albo null.

/** Liczba pól siatki o częstości n. */
export function geodesicTileCount(n) { return 10 * n * n + 2; }

/** n dla liczby pól z tabeli D-CS-8 (92 → 3, 162 → 4, 252 → 5, 362 → 6); null gdy liczba nie jest 10n²+2. */
export function geodesicNForCount(count) {
  for (let n = 1; n <= 32; n++) if (geodesicTileCount(n) === count) return n;
  return null;
}

// Dwudziestościan (orientacja prototypu `colony-sphere.html` §4). Złoty podział t = (1 + √5) / 2 — sqrt jest dokładny.
const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V = [[-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0], [0, -1, ICO_T], [0, 1, ICO_T],
  [0, -1, -ICO_T], [0, 1, -ICO_T], [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1]];
const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6],
  [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

// Krawędzie: unikalne pary (min, max) z F, posortowane leksykograficznie → numer krawędzi.
const ICO_E = (() => {
  const set = new Set();
  for (const [a, b, c] of ICO_F) for (const [p, q] of [[a, b], [b, c], [c, a]]) set.add(Math.min(p, q) * 16 + Math.max(p, q));
  return [...set].sort((x, y) => x - y).map(k => [Math.floor(k / 16), k % 16]);
})();
const ICO_EDGE_INDEX = new Map(ICO_E.map(([p, q], i) => [p * 16 + q, i]));

const TOPOLOGIES = new Map();

/** Topologia siatki o częstości n (buforowana). n ≥ 1 całkowite. */
export function geodesicTopology(n) {
  const nn = n | 0;
  if (!(nn >= 1) || nn !== n) throw new Error(`geodesicTopology: n must be a positive integer (got ${n})`);
  let t = TOPOLOGIES.get(nn);
  if (!t) { t = buildTopology(nn); TOPOLOGIES.set(nn, t); }
  return t;
}

function buildTopology(n) {
  const count = geodesicTileCount(n);
  const cx = new Float64Array(count), cy = new Float64Array(count), cz = new Float64Array(count);

  // Narożniki znormalizowane.
  const V = ICO_V.map(([x, y, z]) => { const l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; });
  const put = (id, x, y, z) => { const l = Math.sqrt(x * x + y * y + z * z); cx[id] = x / l; cy[id] = y / l; cz[id] = z / l; };
  for (let i = 0; i < 12; i++) { cx[i] = V[i][0]; cy[i] = V[i][1]; cz[i] = V[i][2]; }

  const edgeBase = 12;
  const faceBase = 12 + 30 * (n - 1);
  const perFace = (n - 1) * (n - 2) / 2;

  // Wnętrza krawędzi: od wierzchołka o mniejszym numerze, krok k/n (jedna formuła dla obu ścian krawędzi).
  ICO_E.forEach(([p, q], e) => {
    const A = V[p], B = V[q];
    for (let k = 1; k < n; k++) {
      const s = k / n;
      put(edgeBase + e * (n - 1) + (k - 1), A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s);
    }
  });
  const edgeVertex = (p, q, kFromP) => {   // wierzchołek krawędzi (p, q) w kroku kFromP licząc od p
    const lo = Math.min(p, q), hi = Math.max(p, q);
    const e = ICO_EDGE_INDEX.get(lo * 16 + hi);
    const k = p === lo ? kFromP : n - kFromP;
    return edgeBase + e * (n - 1) + (k - 1);
  };

  // Ściany: indeks (i, j) → id pola; wnętrza liczone formułą ściany A + AB·i/n + AC·j/n.
  const tris = [];
  ICO_F.forEach(([a, b, c], f) => {
    const A = V[a], B = V[b], C = V[c];
    const idx = [];
    let local = 0;
    for (let i = 0; i <= n; i++) {
      idx[i] = [];
      for (let j = 0; j <= n - i; j++) {
        let id;
        if (i === 0 && j === 0) id = a;
        else if (i === n) id = b;
        else if (j === n) id = c;
        else if (j === 0) id = edgeVertex(a, b, i);
        else if (i === 0) id = edgeVertex(a, c, j);
        else if (i + j === n) id = edgeVertex(b, c, j);
        else id = -1;
        idx[i][j] = id;
      }
    }
    for (let i = 1; i <= n - 2; i++) {
      for (let j = 1; j <= n - 1 - i; j++) {
        const id = faceBase + f * perFace + local++;
        idx[i][j] = id;
        const si = i / n, sj = j / n;
        put(id, A[0] + (B[0] - A[0]) * si + (C[0] - A[0]) * sj, A[1] + (B[1] - A[1]) * si + (C[1] - A[1]) * sj,
          A[2] + (B[2] - A[2]) * si + (C[2] - A[2]) * sj);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        tris.push([idx[i][j], idx[i + 1][j], idx[i][j + 1]]);
        if (j < n - i - 1) tris.push([idx[i + 1][j], idx[i + 1][j + 1], idx[i][j + 1]]);
      }
    }
  });

  // Sąsiedzi z trójkątów, potem kolejność stała: pseudo-kąt w płaszczyźnie stycznej (bez trygonometrii).
  const nbSets = Array.from({ length: count }, () => new Set());
  for (const [p, q, r] of tris) { nbSets[p].add(q).add(r); nbSets[q].add(p).add(r); nbSets[r].add(p).add(q); }
  const nbStart = new Int32Array(count + 1);
  for (let i = 0; i < count; i++) nbStart[i + 1] = nbStart[i] + nbSets[i].size;
  const nbList = new Int32Array(nbStart[count]);
  for (let i = 0; i < count; i++) {
    const order = sortAround(i, [...nbSets[i]], cx, cy, cz);
    nbList.set(order, nbStart[i]);
  }

  // Macierz odległości (BFS z każdego pola). Średnica < 255 dla n ≤ 32.
  const dist = new Uint8Array(count * count).fill(255);
  const queue = new Int32Array(count);
  for (let s = 0; s < count; s++) {
    const row = s * count;
    dist[row + s] = 0;
    let head = 0, tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const u = queue[head++];
      const du = dist[row + u];
      for (let k = nbStart[u]; k < nbStart[u + 1]; k++) {
        const v = nbList[k];
        if (dist[row + v] === 255) { dist[row + v] = du + 1; queue[tail++] = v; }
      }
    }
  }

  return new GeodesicTopology(n, count, cx, cy, cz, nbStart, nbList, dist);
}

// Baza styczna e1/e2 w środku c (e1 = ref × c, ref = oś Y albo X przy biegunie) — tylko + − × ÷ sqrt.
function tangentBasis(x, y, z) {
  let rx = 0, ry = 1, rz = 0;
  if (Math.abs(y) >= 0.9) { rx = 1; ry = 0; }
  let e1x = ry * z - rz * y, e1y = rz * x - rx * z, e1z = rx * y - ry * x;
  const l = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
  e1x /= l; e1y /= l; e1z /= l;
  const e2x = y * e1z - z * e1y, e2y = z * e1x - x * e1z, e2z = x * e1y - y * e1x;
  return [e1x, e1y, e1z, e2x, e2y, e2z];
}

// Sąsiedzi posortowani przeciwnie do zegara (z zewnątrz) od kierunku e1: półpłaszczyzna, potem znak iloczynu.
function sortAround(i, ids, cx, cy, cz) {
  const [e1x, e1y, e1z, e2x, e2y, e2z] = tangentBasis(cx[i], cy[i], cz[i]);
  const uv = ids.map(j => {
    const dx = cx[j] - cx[i], dy = cy[j] - cy[i], dz = cz[j] - cz[i];
    const u = dx * e1x + dy * e1y + dz * e1z, v = dx * e2x + dy * e2y + dz * e2z;
    return { j, u, v, half: (v > 0 || (v === 0 && u > 0)) ? 0 : 1 };
  });
  uv.sort((a, b) => {
    if (a.half !== b.half) return a.half - b.half;
    const cr = a.u * b.v - a.v * b.u;
    if (cr > 0) return -1;
    if (cr < 0) return 1;
    return a.j - b.j;
  });
  return uv.map(o => o.j);
}

class GeodesicTopology {
  constructor(n, count, cx, cy, cz, nbStart, nbList, dist) {
    this.n = n; this.count = count;
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.nbStart = nbStart; this.nbList = nbList;
    this._dist = dist;
    this._cutoffs = new Map();
    this._equator = -1;
  }

  /** Pięciokąt = jeden z 12 narożników dwudziestościanu (ids 0…11). */
  isPentagon(i) { return i >= 0 && i < 12; }

  degree(i) { return this.nbStart[i + 1] - this.nbStart[i]; }

  /** Sąsiedzi pola i (kopia, kolejność stała). */
  neighbors(i) { return Array.from(this.nbList.subarray(this.nbStart[i], this.nbStart[i + 1])); }

  /** Odległość grafowa w krokach (dokładna, BFS). */
  distance(a, b) { return this._dist[a * this.count + b]; }

  /** Pola w promieniu k: środek, potem pierścienie w kolejności odkrycia BFS (sąsiedzi w kolejności stałej). */
  within(i, k) {
    const out = [i];
    if (k <= 0) return out;
    const seen = new Uint8Array(this.count);
    seen[i] = 1;
    for (let h = 0; h < out.length; h++) {
      const u = out[h];
      if (this.distance(i, u) >= k) continue;
      for (let s = this.nbStart[u]; s < this.nbStart[u + 1]; s++) {
        const v = this.nbList[s];
        if (!seen[v]) { seen[v] = 1; out.push(v); }
      }
    }
    return out;
  }

  /** Pola dokładnie w odległości k (kolejność jak within). */
  ring(i, k) {
    if (k <= 0) return [i];
    return this.within(i, k).filter(v => this.distance(i, v) === k);
  }

  /** Odchylenie środka pola od płaszczyzny wielkiego koła (nx, ny, nz) — |iloczyn skalarny|. */
  _dev(i, nx, ny, nz) { const d = this.cx[i] * nx + this.cy[i] * ny + this.cz[i] * nz; return d < 0 ? -d : d; }

  /** Normalna płaszczyzny wielkiego koła a → b (null, gdy a, b są tym samym lub przeciwległym punktem). */
  greatCircleNormal(a, b) {
    const ax = this.cx[a], ay = this.cy[a], az = this.cz[a], bx = this.cx[b], by = this.cy[b], bz = this.cz[b];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return l > 1e-9 ? [nx / l, ny / l, nz / l] : null;
  }

  /**
   * A* o jednolitym koszcie 1. Heurystyka = dokładna odległość grafowa bez przeszkód (dopuszczalna i spójna →
   * ścieżka optymalna). Wybór z kolejki: min f, potem min h, potem najbliżej wielkiego koła start → cel, potem min id
   * (deterministycznie; tryb naiwny keepera: bez kryterium koła, rodzic = pierwszy odkrywca). Odtworzenie ścieżki
   * od celu wstecz (Finding 781 — „proste" trasy): spośród sąsiadów o g = g(bieżące) − 1 wybierany ten najbliżej
   * wielkiego koła start → cel, remis → mniejsze id. Każdy taki sąsiad leży na najkrótszej ścieżce (g dokładne),
   * więc długość jest optymalna. passable(i) === false blokuje wejście (cel też). Wynik: [id…] bez startu, z celem;
   * null = brak ścieżki.
   */
  path(a, b, passable = () => true, maxIterations = 2000, { straight = true } = {}) {
    if (a === b) return [];
    const N = this.count;
    const g = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open = [a];
    const inOpen = new Uint8Array(N);
    inOpen[a] = 1; g[a] = 0;
    const naiveFrom = straight ? null : new Int32Array(N).fill(-1);
    const nrm = straight ? this.greatCircleNormal(a, b) : null;
    const dev = (i) => (nrm ? this._dev(i, nrm[0], nrm[1], nrm[2]) : 0);
    let found = false, it = 0;
    while (open.length > 0 && it++ < maxIterations) {
      let bi = 0;
      for (let x = 1; x < open.length; x++) {
        const u = open[x], w = open[bi];
        const hu = this.distance(u, b), hw = this.distance(w, b);
        const fu = g[u] + hu, fw = g[w] + hw;
        if (fu !== fw) { if (fu < fw) bi = x; continue; }
        if (hu !== hw) { if (hu < hw) bi = x; continue; }
        const du = dev(u), dw = dev(w);
        if (du < dw || (du === dw && u < w)) bi = x;
      }
      const cur = open[bi];
      open.splice(bi, 1); inOpen[cur] = 0; closed[cur] = 1;
      if (cur === b) { found = true; break; }
      for (let s = this.nbStart[cur]; s < this.nbStart[cur + 1]; s++) {
        const v = this.nbList[s];
        if (closed[v] || !passable(v)) continue;
        const tg = g[cur] + 1;
        if (g[v] < 0 || tg < g[v]) {
          g[v] = tg;
          if (naiveFrom) naiveFrom[v] = cur;
          if (!inOpen[v]) { inOpen[v] = 1; open.push(v); }
        }
      }
    }
    if (!found) return null;
    const out = [];
    if (naiveFrom) {   // tryb porównawczy keepera: pierwszy rodzic (jak płaski A*)
      for (let v = b; v !== a; v = naiveFrom[v]) out.push(v);
      return out.reverse();
    }
    let v = b;
    while (v !== a) {
      out.push(v);
      const want = g[v] - 1;
      let best = -1, bestDev = Infinity;
      for (let s = this.nbStart[v]; s < this.nbStart[v + 1]; s++) {
        const u = this.nbList[s];
        if (g[u] !== want) continue;   // g sąsiada = g(v) − 1 jest dokładne (nierówność trójkąta) → leży na najkrótszej ścieżce
        const d = dev(u);
        if (d < bestDev || (d === bestDev && u < best)) { best = u; bestDev = d; }
      }
      v = best;
    }
    return out.reverse();
  }

  /** Pole równikowe: najmniejsze |y| środka, remis → mniejsze id. */
  equatorTile() {
    if (this._equator < 0) {
      let best = 0;
      for (let i = 1; i < this.count; i++) {
        const ay = Math.abs(this.cy[i]), ab = Math.abs(this.cy[best]);
        if (ay < ab) best = i;
      }
      this._equator = best;
    }
    return this._equator;
  }

  /**
   * Progi |y| pasów szerokości (D-CS-7) dla zadanych udziałów pól polarnych / przedbiegunowych. Pola są grupowane
   * w klastry równego |y| (tolerancja 1e-9 — symetryczne pola mogą różnić się ostatnim bitem), próg leży w połowie
   * odstępu między klastrami, wybrany tak, by udział był najbliższy celowi (remis → mniej pól). Zwraca
   * { polar, subpolar } (pole jest polarne, gdy |y| ≥ polar; przedbiegunowe, gdy |y| ≥ subpolar).
   */
  latitudeCutoffs(polarShare, subpolarShare) {
    const key = `${polarShare}|${subpolarShare}`;
    let c = this._cutoffs.get(key);
    if (c) return c;
    const N = this.count;
    const ay = Array.from(this.cy, v => Math.abs(v)).sort((p, q) => q - p);   // malejąco
    const clusters = [];   // { y (najmniejsze |y| w klastrze), cum (liczba pól do końca klastra) }
    for (let i = 0; i < N; i++) {
      const last = clusters[clusters.length - 1];
      if (last && last.yMin - ay[i] <= 1e-9) { last.yMin = ay[i]; last.cum = i + 1; }
      else clusters.push({ yMin: ay[i], cum: i + 1 });
    }
    const cutAt = (target, fromIdx) => {   // indeks klastra, PO którym tniemy (−1 = 0 pól)
      let bestIdx = fromIdx, bestErr = Math.abs((fromIdx < 0 ? 0 : clusters[fromIdx].cum) / N - target);
      for (let k = fromIdx + 1; k < clusters.length; k++) {
        const err = Math.abs(clusters[k].cum / N - target);
        if (err < bestErr - 1e-12) { bestErr = err; bestIdx = k; }
      }
      return bestIdx;
    };
    const thr = (k) => {
      if (k < 0) return Infinity;
      if (k >= clusters.length - 1) return -1;
      return (clusters[k].yMin + clusters[k + 1].yMin) / 2;
    };
    const kp = cutAt(polarShare, -1);
    const ks = cutAt(polarShare + subpolarShare, kp);
    c = Object.freeze({ polar: thr(kp), subpolar: thr(ks) });
    this._cutoffs.set(key, c);
    return c;
  }
}
