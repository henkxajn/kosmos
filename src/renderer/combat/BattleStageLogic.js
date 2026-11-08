// BattleStageLogic — SCENA BITWY (ARC COMBAT VISUALS, krok CV-3a1; D-CV-2 (a), D-CV-3 (a), §3.1-2; Finding 638).
//
// ⚠ ZERO IMPORTÓW. Czysta matematyka — wykonuje się pod node, więc keeper sprawdza WYKONANIEM: prawo ściskania, soczewkę,
//   prowadnicę par (każda para w swoim paśmie), skalę awaryjną i klastry starć (wzór LogDepthChunks / PresentationClock).
//
// Co robi scena. Gdy gracz przybliża bitwę, uczestników rysujemy w lokalnej scenie wokół środka bitwy, z odległościami
// ściśniętymi MONOTONICZNIE (bliżej w logice ⇒ bliżej na ekranie): para w zasięgu lasera ~3,5 długości fregaty, kinetyka
// ~8, rakiet ~13,5 zamiast dzisiejszych ~33 / ~98 / ~196 (F3). Logiki nikt tu nie dotyka — moduł dostaje kopie pozycji
// (renderer: pozycje sprite'ów bez sceny) i zwraca pozycje RYSOWANE; pozycji logicznych nie pisze nikt (F1).
//
// Prawo (D-CV-2 (a)): odstęp pary G(d) = min(d, K·d^ALPHA), d i G w j. (1 AU = 11 j.); ALPHA 0,7525 i K 0,0913 dobrane
// na kotwicy lasera — wszystkie trzy okna właściciela trafione jednym prawem (plan §2.2).
// Ziarno: promieniowo wokół środka bitwy, g(r) = G(2r) / 2 (para symetryczna względem środka trafia dokładnie w prawo);
// para niesymetryczna (sojusznicy blisko siebie daleko od środka, para poza osią) może trafić w złe pasmo — dlatego po
// ziarnie biegnie PROWADNICA PAR (§3.1-2): kilka przejść Gaussa–Seidla na odstępach par ku G(d), z twardym przedziałem
// pasma każdej pary i podłogą rozsunięcia; kontrola pasm O(N²) sprawdza KAŻDĄ parę; gdy po przejściach któraś para nadal
// leży w złym paśmie — skala jednorodna (kolejność par dokładna, okna tylko w przybliżeniu), zgłaszana w fxStats.
// TRZY OSIE (pomiar sondy, nie wybór): w płaszczyźnie gęsta grupa jednej strony (kupka w jednym punkcie, szyk liniowy)
// nie mieści się w paśmie lasera z podłogą rozsunięcia — 10 statków co ≥ 1,6 L ma średnicę > 3,64 L (krawędź pasma), więc
// skrajne pary wypadały w pasmo kinetyka; w trzech osiach 12 sąsiadów wokół jednego mieści się w średnicy 3,2 L. Scena jest
// więc trójwymiarowa (F4 „nie płaska warstwa y = 0,3”, D-CV-6): ziarno dostaje deterministyczny rozrzut w pionie, prowadnica
// liczy odstępy w 3D.
// Soczewka: prawo G ściska WSZĘDZIE (G(d) < d już od ~6·10⁻⁵ j.), więc mapa promieniowa poza sceną wraca do skali
// prawdziwej pasem przejścia — odwrotność tej mapy (klik w scenie, krok CV-3a2) nie wyrzuca rozkazu na AU od bitwy.
//
// Jednostki: [j.] — jednostki świata 3D (1 AU = 11 j.); [L] — długość fregaty (`VESSEL_TARGET_SIZE.frigate` 0,016 j.).

/** Prawo sceny (D-CV-2 (a)): G(d) = min(d, K·d^ALPHA); d, G w [j.]. */
export const STAGE_LAW = Object.freeze({ ALPHA: 0.7525, K: 0.0913 });

/** Stałe sceny. */
export const STAGE = Object.freeze({
  DECONFLICT_L: 1.6,      // [L] najmniejszy odstęp statków JEDNEJ strony na scenie (siatka rozsunięcia, plan §2.2)
  COLLISION_L: 1.5,       // [L] najmniejszy odstęp dowolnej pary (podłoga kolizji — D-CV-6)
  PASSES: 40,             // przejścia prowadnicy z przyciąganiem do G(d) na jedną aktualizację
  HARD_PASSES: 96,        // dodatkowe przejścia wyłącznie twarde (przedział pasma + podłoga), gdy po PASSES coś leży poza
                          //   (sonda 300 + 300 układów 10v10: 24+48 → skala awaryjna 2 + 5, 40+96 → 2 + 1; ~1 ms na rozwiązanie)
  PULL: 0.5,              // waga przyciągania odstępu do G(d) w jednym kroku pary
  PRIORITY_PASSES: 12,    // przejścia wyłącznie par PIERWSZEŃSTWA (strzelec → cel ostatniej rundy — to gracz czyta jako zasięg),
                          //   z pełnym przyciąganiem do G(d) w przedziale pasma; potem przejścia twarde (sonda: bez nich laser
                          //   2,6–2,9 L wobec prawa 3,4 L — poza oknem właściciela 3–4 L)
  BAND_MARGIN: 0.04,      // ułamek szerokości pasma — margines przedziału twardego od krawędzi
  LENS_OUT: 3,            // pas przejścia soczewki: od r_in do LENS_OUT · r_in mapa przechodzi w skalę prawdziwą
  R_IN_MARGIN: 1.05,      // promień ściskania = najdalszy uczestnik × to
  SEED_Y_L: 1.0,          // [L] rozrzut ziarna w pionie (deterministyczny, z indeksu) — bez niego prowadnica zostaje płaska
  CLUSTER_AU: 0.30,       // [AU] starcia o środkach bliżej niż to = jedna bitwa na ekranie (zasięg rakiet — Finding 638)
  JOIN_MS: 500,           // [ms] czasu prezentacji — wejście dołączającego do sceny i powrót do skali prawdziwej po końcu
});

const GOLDEN = 2.399963229728653;   // [rad] kąt złoty — deterministyczny kierunek dla punktów pokrywających się

// Siatka rozsunięcia (plan §2.2): kupka statków w jednym punkcie (floty przylatują razem) albo gęsty szyk — ich naturalny
// odstęp na scenie spadłby poniżej podłogi. Ziarno takiej grupy: środek + 12 wierzchołków dwudziestościanu (promień R →
// sąsiedzi co 1,0515 R, średnica 2 R) + druga powłoka (2 R, obrót) — przy R = podłoga rozsunięcia 13 statków mieści się
// w średnicy 3,2 L, wewnątrz pasma lasera (3,64 L). Kolejność w siatce = kolejność id (deterministycznie).
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  return v.map(([x, y, z]) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; });
})();
function latticeOffset(k, R) {
  if (k === 0) return { x: 0, y: 0, z: 0 };
  if (k <= 12) { const u = ICO[k - 1]; return { x: u.x * R, y: u.y * R, z: u.z * R }; }
  const u = ICO[(k - 13) % 12], shell = 2 + Math.floor((k - 13) / 12), a = 0.5;   // kolejne powłoki co R, obrót o 0,5 rad
  const x = u.x * Math.cos(a) - u.z * Math.sin(a), z = u.x * Math.sin(a) + u.z * Math.cos(a);
  return { x: x * R * shell, y: u.y * R * shell, z: z * R * shell };
}

/** Odstęp pary na scenie: G(d) = min(d, K·d^ALPHA). d ≤ 0 ⇒ 0. */
export function stageGap(d, law = STAGE_LAW) {
  if (!(d > 0)) return 0;
  return Math.min(d, law.K * Math.pow(d, law.ALPHA));
}

/** Punkt przecięcia d = K·d^ALPHA [j.] — poniżej prawo jest tożsamością. */
export function stageGapCrossover(law = STAGE_LAW) {
  return Math.pow(law.K, 1 / (1 - law.ALPHA));
}

/** Odwrotność G (monotoniczna): odstęp na scenie → odstęp logiczny. */
export function stageGapInverse(g, law = STAGE_LAW) {
  if (!(g > 0)) return 0;
  if (g <= stageGapCrossover(law)) return g;
  return Math.pow(g / law.K, 1 / law.ALPHA);
}

/**
 * Indeks pasma odległości: 0 — laser (d ≤ e₀), 1 — kinetyk (≤ e₁), 2 — rakiety (≤ e₂), 3 — dalej. Krawędzie włącznie
 * (DSCS strzela, gdy odległość ≤ zasięg). `edges` rosnąco.
 */
export function bandIndex(d, edges) {
  for (let i = 0; i < edges.length; i++) if (d <= edges[i]) return i;
  return edges.length;
}

/** Krawędzie pasm w [j.] z zasięgów broni w AU (logiczne). */
export function bandEdgesWU(rangesAU, auToWU = 11) {
  return rangesAU.map((r) => r * auToWU).sort((a, b) => a - b);
}

/** Krawędzie pasm NA SCENIE: G(krawędź logiczna). */
export function apparentEdges(edges, law = STAGE_LAW) {
  return edges.map((e) => stageGap(e, law));
}

/**
 * Mapa promieniowa sceny z soczewką: r ≤ rIn — g(r) = G(2r) / 2; rIn < r < LENS_OUT·rIn — liniowo do skali prawdziwej;
 * dalej — tożsamość. Monotoniczna i ciągła (rIn ≤ 0 albo bez ściśnięcia — tożsamość).
 */
export function radialMap(r, rIn, law = STAGE_LAW, lensOut = STAGE.LENS_OUT) {
  if (!(r > 0)) return 0;
  if (!(rIn > 0)) return r;
  const gIn = stageGap(2 * rIn, law) / 2;
  if (!(gIn < rIn)) return r;                       // bez ściśnięcia — tożsamość
  if (r <= rIn) return stageGap(2 * r, law) / 2;
  const rOut = lensOut * rIn;
  if (r >= rOut) return r;
  return gIn + (r - rIn) * (rOut - gIn) / (rOut - rIn);
}

/** Odwrotność mapy promieniowej (rysowany promień → logiczny). */
export function radialMapInverse(rd, rIn, law = STAGE_LAW, lensOut = STAGE.LENS_OUT) {
  if (!(rd > 0)) return 0;
  if (!(rIn > 0)) return rd;
  const gIn = stageGap(2 * rIn, law) / 2;
  if (!(gIn < rIn)) return rd;
  if (rd <= gIn) return stageGapInverse(2 * rd, law) / 2;
  const rOut = lensOut * rIn;
  if (rd >= rOut) return rd;
  return rIn + (rd - gIn) * (rOut - rIn) / (rOut - gIn);
}

/** Promień RYSOWANY przy mieszaniu `blend` ∈ [0, 1]: lerp(r, g(r)) — monotoniczny dla każdego `blend`. */
export function drawnRadius(r, blend, rIn, law = STAGE_LAW, lensOut = STAGE.LENS_OUT) {
  const b = Math.min(1, Math.max(0, blend));
  return r + (radialMap(r, rIn, law, lensOut) - r) * b;
}

/** Odwrotność `drawnRadius` (bisekcja — funkcja rosnąca). */
export function drawnRadiusInverse(rd, blend, rIn, law = STAGE_LAW, lensOut = STAGE.LENS_OUT) {
  if (!(rd > 0)) return 0;
  let lo = 0, hi = Math.max(rd, lensOut * rIn) * 2 + 1;
  while (drawnRadius(hi, blend, rIn, law, lensOut) < rd) hi *= 2;
  for (let i = 0; i < 64; i++) {
    const m = (lo + hi) / 2;
    if (drawnRadius(m, blend, rIn, law, lensOut) < rd) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** Przedział twardy pasma `b` na scenie (z marginesem od krawędzi), przed podłogą. */
function bandInterval(b, appEdges, marginFrac) {
  const lo = b === 0 ? 0 : appEdges[b - 1];
  const hi = b >= appEdges.length ? Infinity : appEdges[b];
  if (hi === Infinity) return { lo: lo * (1 + marginFrac), hi: Infinity };
  const m = (hi - lo) * marginFrac;
  return { lo: b === 0 ? 0 : lo + m, hi: hi - m };
}

/**
 * Rozwiązanie sceny jednej bitwy.
 * @param {object} a
 * @param {Array<{id:string, side:string, x:number, z:number, y?:number}>} a.points — pozycje BEZ sceny [j.]; odstęp logiczny
 *   liczony w płaszczyźnie XZ (logika gry jest płaska), `y` — wysokość rysunku (domyślnie środek sceny)
 * @param {{x:number, z:number, y?:number}} a.centre — środek sceny (renderer: środek uczestników)
 * @param {number} a.L — długość fregaty [j.]
 * @param {number[]} a.edges — krawędzie pasm logicznych [j.], rosnąco
 * @param {Map<string,{x:number,y:number,z:number}>|null} [a.prevOffsets] — rozwiązanie poprzedniej aktualizacji (przesunięcia
 *   od środka) — start prowadnicy (ciepły start); brak — ziarno promieniowe
 * @param {Set<string>|null} [a.priority] — pary pierwszeństwa jako `pairKey(a, b)` (strzelec → cel z ostatniej rundy): pełne
 *   przyciąganie do G(d); reszta par — kompromis prowadnicy
 * @returns {{ pos: Map<string,{x:number,y:number,z:number}>, offsets: Map<string,{x:number,y:number,z:number}>, misbanded: number,
 *   misbandedBefore: number, fallback: boolean, scale: number|null, passes: number, rIn: number, pairs: number }}
 */
/** Klucz pary (kolejność bez znaczenia). */
export function pairKey(a, b) {
  const x = String(a), y = String(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

export function solveStage({ points, centre, L, edges, prevOffsets = null, priority = null, law = STAGE_LAW, opts = {} }) {
  const o = { ...STAGE, ...opts };
  const pts = [...(points ?? [])].filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const n = pts.length;
  const pos = new Map(), offsets = new Map();
  const c = { x: centre?.x ?? 0, y: Number.isFinite(centre?.y) ? centre.y : 0, z: centre?.z ?? 0 };
  if (n === 0) return { pos, offsets, misbanded: 0, misbandedBefore: 0, fallback: false, scale: null, passes: 0, rIn: 0, pairs: 0 };
  const app = apparentEdges(edges, law);

  // Pary: odstęp logiczny, pasmo, cel G(d) w przedziale twardym pasma z podłogą rozsunięcia / kolizji.
  const P = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
      const band = bandIndex(d, edges);
      const iv = bandInterval(band, app, o.BAND_MARGIN);
      const floor = (pts[i].side === pts[j].side ? o.DECONFLICT_L : o.COLLISION_L) * L;
      let lo = Math.max(iv.lo, floor);
      if (lo > iv.hi) lo = iv.hi;                      // podłoga nigdy nad pasmem (pasmo laserowe sięga 3,64 L)
      const t = Math.min(iv.hi, Math.max(lo, stageGap(d, law)));
      P.push({ i, j, d, band, lo, hi: iv.hi, t, pri: !!priority?.has?.(pairKey(pts[i].id, pts[j].id)) });
    }
  }

  // Ziarno: ciepły start (poprzednie rozwiązanie wokół BIEŻĄCEGO środka) albo mapa promieniowa; gęste grupy — siatka
  // rozsunięcia wokół ziarna promieniowego środka grupy.
  let rMax = 0;
  for (const p of pts) rMax = Math.max(rMax, Math.hypot(p.x - c.x, p.z - c.z));
  const rIn = rMax * o.R_IN_MARGIN;
  const radialSeed = (x, z, i) => {
    const y = c.y + (((i + 1) * 0.6180339887) % 1 - 0.5) * o.SEED_Y_L * L;   // deterministyczny rozrzut w pionie
    const dx = x - c.x, dz = z - c.z, r = Math.hypot(dx, dz);
    if (r < 1e-12) { const a = (i + 1) * GOLDEN; return { x: c.x + Math.cos(a) * 1e-6, y, z: c.z + Math.sin(a) * 1e-6 }; }
    const g = radialMap(r, rIn, law, o.LENS_OUT);
    return { x: c.x + dx / r * g, y, z: c.z + dz / r * g };
  };
  // Grupy gęste: pojedyncze wiązanie par, których odstęp na scenie (G(d)) spadłby poniżej podłogi rozsunięcia.
  const nearD = stageGapInverse(o.DECONFLICT_L * L, law);
  const parent = pts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const q of P) if (q.d < nearD) { const a = find(q.i), b = find(q.j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
  const groups = new Map();
  pts.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  const s = new Array(n);
  for (const members of groups.values()) {
    if (members.length === 1) { const i = members[0]; s[i] = radialSeed(pts[i].x, pts[i].z, i); continue; }
    const gx = members.reduce((t, i) => t + pts[i].x, 0) / members.length, gz = members.reduce((t, i) => t + pts[i].z, 0) / members.length;
    const g0 = radialSeed(gx, gz, members[0]);
    members.forEach((i, k) => { const off = latticeOffset(k, o.DECONFLICT_L * L); s[i] = { x: g0.x + off.x, y: c.y + off.y, z: g0.z + off.z }; });
  }
  pts.forEach((p, i) => {
    const prev = prevOffsets?.get?.(p.id);
    if (prev && Number.isFinite(prev.x) && Number.isFinite(prev.y) && Number.isFinite(prev.z)) s[i] = { x: c.x + prev.x, y: c.y + prev.y, z: c.z + prev.z };
  });
  const gap3 = (A, B) => Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);

  const countMis = () => {
    let m = 0;
    for (const q of P) if (bandIndex(gap3(s[q.i], s[q.j]), app) !== q.band) m++;
    return m;
  };
  const hardViolations = () => {
    let v = 0;
    for (const q of P) {
      const g = gap3(s[q.i], s[q.j]);
      if (g < q.lo * (1 - 1e-9) || g > q.hi * (1 + 1e-9)) v++;
    }
    return v;
  };
  const misbandedBefore = countMis();
  const pass = (pull, onlyPri = false) => {
    for (const q of P) {
      if (onlyPri && !q.pri) continue;
      const A = s[q.i], B = s[q.j];
      let vx = B.x - A.x, vy = B.y - A.y, vz = B.z - A.z;
      let dist = Math.hypot(vx, vy, vz);
      if (dist < 1e-12) {
        const a = (q.i + 1) * GOLDEN + (q.j + 1) * 0.6180339887;
        vx = Math.cos(a) * 1e-9; vy = 0; vz = Math.sin(a) * 1e-9; dist = 1e-9;
      }
      let want;
      if (dist < q.lo) want = q.lo;
      else if (dist > q.hi) want = q.hi;
      else if (pull > 0) want = dist + (q.pri ? 1 : pull) * (q.t - dist);
      else continue;
      const k = (dist - want) / dist * 0.5;
      A.x += vx * k; A.y += vy * k; A.z += vz * k;
      B.x -= vx * k; B.y -= vy * k; B.z -= vz * k;
    }
  };
  // Najlepsze rozwiązanie z kolejnych etapów (ziarno, po przyciąganiu, po przejściach twardych): mniej złych pasm wygrywa,
  // remis — późniejszy etap (podłoga rozsunięcia). Bez tego prowadnica potrafiła zepsuć ziarno, które było już spójne.
  const snap = () => s.map((q) => ({ x: q.x, y: q.y, z: q.z }));
  let best = snap(), bestMis = misbandedBefore;
  const keep = () => { const m = countMis(); if (m <= bestMis) { bestMis = m; best = snap(); } };
  let passes = 0;
  for (let k = 0; k < o.PASSES; k++) { pass(o.PULL); passes++; }
  if (P.some((q) => q.pri)) for (let k = 0; k < o.PRIORITY_PASSES; k++) { pass(1, true); passes++; }
  keep();
  for (let k = 0; k < o.HARD_PASSES && hardViolations() > 0; k++) { pass(0); passes++; }
  keep();
  for (let i = 0; i < n; i++) s[i] = best[i];
  const misbanded = bestMis;

  if (misbanded > 0) {
    // Skala jednorodna wokół środka: kolejność par dokładna, okna w przybliżeniu (§3.1-2). Współczynnik z mediany par.
    const ds = P.map((q) => q.d).filter((d) => d > 0).sort((a, b) => a - b);
    const dMed = ds.length ? ds[Math.floor(ds.length / 2)] : 1;
    const scale = dMed > 0 ? stageGap(dMed, law) / dMed : 1;
    pts.forEach((p) => {
      const x = c.x + (p.x - c.x) * scale, z = c.z + (p.z - c.z) * scale;
      pos.set(p.id, { x, y: c.y, z });
      offsets.set(p.id, null);
    });
    return { pos, offsets, misbanded, misbandedBefore, fallback: true, scale, passes, rIn, pairs: P.length };
  }

  // Wyśrodkowanie: środek sceny = środek uczestników bez sceny (przesunięcie nie zmienia odstępów par) — przy każdym
  // mieszaniu środek rysowanej bitwy stoi w miejscu (przybliżenie kółkiem jest „focus pull”, nie przesuwa bitwy).
  let mx = 0, my = 0, mz = 0;
  for (const q of s) { mx += q.x; my += q.y; mz += q.z; }
  mx /= n; my /= n; mz /= n;
  const sx = c.x - mx, sy = c.y - my, sz = c.z - mz;
  pts.forEach((p, i) => {
    const x = s[i].x + sx, y = s[i].y + sy, z = s[i].z + sz;
    pos.set(p.id, { x, y, z });
    offsets.set(p.id, { x: x - c.x, y: y - c.y, z: z - c.z });
  });
  return { pos, offsets, misbanded: 0, misbandedBefore, fallback: false, scale: null, passes, rIn, pairs: P.length };
}

/**
 * Kontrola pasm (§3.1-2): liczba par, których pasmo odstępu RYSOWANEGO (krawędzie G(zasięg)) ≠ pasmo odstępu logicznego.
 * @param {Array<{id:string, x:number, z:number}>} logical
 * @param {Map<string,{x:number,y?:number,z:number}>} drawn — odstęp rysowany w 3D (brak `y` = 0)
 */
export function countMisbanded(logical, drawn, edges, law = STAGE_LAW) {
  const app = apparentEdges(edges, law);
  const pts = (logical ?? []).filter((p) => drawn.has(p.id));
  let m = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
      const a = drawn.get(pts[i].id), b = drawn.get(pts[j].id);
      if (bandIndex(Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z), app) !== bandIndex(d, edges)) m++;
    }
  }
  return m;
}

/**
 * Klastry starć (Finding 638): bitwa na ekranie = grupa starć w jednym miejscu — ten sam układ, środki bliżej niż
 * `radiusWU` (pojedyncze wiązanie: łańcuch starć to jedna bitwa). Deterministyczne: id klastra = najmniejsze id starcia.
 * @param {Array<{id:string, systemId:string|null, centre:{x:number,z:number}}>} encs
 * @returns {Array<{id:string, systemId:string|null, encounterIds:string[], centre:{x:number,z:number}}>}
 */
export function clusterEncounters(encs, radiusWU) {
  const list = [...(encs ?? [])].filter((e) => e && e.id != null && e.centre && Number.isFinite(e.centre.x) && Number.isFinite(e.centre.z))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const parent = list.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if ((list[i].systemId ?? null) !== (list[j].systemId ?? null)) continue;
      if (Math.hypot(list[j].centre.x - list[i].centre.x, list[j].centre.z - list[i].centre.z) > radiusWU) continue;
      const a = find(i), b = find(j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map();
  list.forEach((e, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(e);
  });
  return [...groups.values()].map((g) => ({
    id: String(g[0].id),
    systemId: g[0].systemId ?? null,
    encounterIds: g.map((e) => String(e.id)),
    centre: { x: g.reduce((s, e) => s + e.centre.x, 0) / g.length, z: g.reduce((s, e) => s + e.centre.z, 0) / g.length },
  })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
