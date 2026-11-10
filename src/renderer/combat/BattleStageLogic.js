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
  // ARC CV-3a3 — skorupa przy ciele (D-CV-4, Finding 626)
  SHELL_FLOOR_L: 2,       // [L] podłoga skorupy: rysowany promień ciała + to — żaden statek sceny bliżej środka ciała
  SHELL_WARM_PASSES: 0,   // przejścia z przyciąganiem przy CIEPŁYM starcie sceny przy ciele (Finding 652): unieruchomieni prawie
                          //   nie ruszają się w logice (orbity ≈ 0,01 rad na rundę), a przyciąganie co rundę przestawiało ciasną
                          //   grupę — zmierzone 2,0–2,2 L na rundę (mediana) wobec 0,03–0,23 L bez niego; bitwa w wolnej
                          //   przestrzeni — PASSES (geometria logiki zmienia się co rundę, okna właściciela wymagają przyciągania)
  SHELL_PLANE_Y: 0.3,     // [j.] wysokość skorupy = płaszczyzna statków (`RaycasterHelper.SHIP_PLANE_Y`): klik w scenę przy ciele
                          //   trafia płaszczyznę, na której statki są rysowane (Finding 646 (b)), a kamera nad płaszczyzną orbit
                          //   widzi grupę nad krawędzią ciała z każdej strony (z kierunkiem poziomym ciało ją zasłaniało)
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
 * @param {{body:{x:number,y?:number,z:number,r:number}, pinned:Set<string>|string[], floorL?:number, planeY?:number}|null} [a.shell]
 *   — ARC CV-3a3: bitwa przy ciele — rysowany środek i promień ciała, id statków unieruchomionych przy nim (skorupa, D-CV-4)
 * @returns {{ pos: Map<string,{x:number,y:number,z:number}>, offsets: Map<string,{x:number,y:number,z:number}>, misbanded: number,
 *   misbandedBefore: number, fallback: boolean, scale: number|null, passes: number, rIn: number, pairs: number,
 *   shell: object|null }}  shell — kierunek `u`, środek grupy `P`, wykluczeni, przesunięcie sztywne `shift` (pole kliku)
 */
/** Klucz pary (kolejność bez znaczenia). */
export function pairKey(a, b) {
  const x = String(a), y = String(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

export function solveStage({ points, centre, L, edges, prevOffsets = null, priority = null, shell = null, law = STAGE_LAW, opts = {} }) {
  const o = { ...STAGE, ...opts };
  const pts = [...(points ?? [])].filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const n = pts.length;
  const pos = new Map(), offsets = new Map();
  const c = { x: centre?.x ?? 0, y: Number.isFinite(centre?.y) ? centre.y : 0, z: centre?.z ?? 0 };
  if (n === 0) return { pos, offsets, misbanded: 0, misbandedBefore: 0, fallback: false, scale: null, passes: 0, rIn: 0, pairs: 0, shell: null };
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
  // ARC CV-3a3 — scena przy ciele z ciepłym startem: bez przejść z przyciąganiem (SHELL_WARM_PASSES), tylko pierwszeństwo i twarde.
  const pullPasses = shell?.body && prevOffsets ? o.SHELL_WARM_PASSES : o.PASSES;
  for (let k = 0; k < pullPasses; k++) { pass(o.PULL); passes++; }
  if (P.some((q) => q.pri)) for (let k = 0; k < o.PRIORITY_PASSES; k++) { pass(1, true); passes++; }
  keep();
  for (let k = 0; k < o.HARD_PASSES && hardViolations() > 0; k++) { pass(0); passes++; }
  const hardSnap = shell?.body ? snap() : null;
  keep();
  let misbanded = bestMis;
  // ARC CV-3a3 — przy skorupie najpierw PODŁOGA, potem pasma: unieruchomieni przeciwnicy stoją w logice w jednym punkcie, a
  // pasmo lasera łapie też pary nałożone na siebie — migawka „zero złych pasm” potrafiła trzymać statki na sobie (zmierzone
  // na 200 układach 10 na 10 przy ciele: najmniejsza para 0,06 L). Wybór: mniej par pod podłogą (−5 %), przy remisie mniej
  // złych pasm. Scena bez skorupy — bez zmian (prowadnica CV-3a1).
  if (hardSnap) {
    const under = (snapArr) => { let v = 0; for (const q of P) if (gap3(snapArr[q.i], snapArr[q.j]) < q.lo * 0.95) v++; return v; };
    const misOf = (snapArr) => { let m = 0; for (const q of P) if (bandIndex(gap3(snapArr[q.i], snapArr[q.j]), app) !== q.band) m++; return m; };
    const uB = under(best), uH = under(hardSnap);
    const mH = misOf(hardSnap);
    if (uH < uB || (uH === uB && mH < bestMis)) { best = hardSnap; misbanded = mH; }
  }
  for (let i = 0; i < n; i++) s[i] = best[i];

  let out;
  // ARC CV-3a3 — przy skorupie (bitwa przy ciele) BEZ skali jednorodnej: unieruchomieni przeciwnicy stoją w logice w JEDNYM
  // punkcie (środek ciała), więc skala jednorodna zrzucała ich na siebie (zmierzone: 10 statków w jednym punkcie). Zostaje
  // najlepsze ułożenie prowadnicy (najmniej złych pasm, podłoga rozsunięcia), oznaczone jako awaryjne (`fallback`, bez `scale`).
  if (misbanded > 0 && !shell?.body) {
    // Skala jednorodna wokół środka: kolejność par dokładna, okna w przybliżeniu (§3.1-2). Współczynnik z mediany par.
    const ds = P.map((q) => q.d).filter((d) => d > 0).sort((a, b) => a - b);
    const dMed = ds.length ? ds[Math.floor(ds.length / 2)] : 1;
    const scale = dMed > 0 ? stageGap(dMed, law) / dMed : 1;
    pts.forEach((p) => {
      const x = c.x + (p.x - c.x) * scale, z = c.z + (p.z - c.z) * scale;
      pos.set(p.id, { x, y: c.y, z });
      offsets.set(p.id, null);
    });
    out = { pos, offsets, misbanded, misbandedBefore, fallback: true, scale, passes, rIn, pairs: P.length, shell: null };
  } else {
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
    out = { pos, offsets, misbanded, misbandedBefore, fallback: misbanded > 0, scale: null, passes, rIn, pairs: P.length, shell: null };
  }
  // ARC CV-3a3 (D-CV-4) — skorupa przy ciele: rozwiązanie przesunięte SZTYWNO (każdy odstęp pary zostaje — wynik prowadnicy
  // pasm przechodzi bez zmian) tak, by grupa unieruchomionych przy ciele stała tuż za skorupą; `offsets` (ciepły start)
  // zostają w układzie prowadnicy, przed przesunięciem.
  if (shell?.body) out.shell = applyShell(out, pts, { shell, L, edges, law, o });
  return out;
}

// ── ARC CV, krok CV-3a3 — SKORUPA PRZY CIELE (D-CV-4 (a), Finding 626) ─────────────────────────────────────────────────
// Bitwa przy ciele: uczestnicy stojący przy ciele (`dockedAt` — orbita gracza, wróg przypięty przez `_freezeAsStationary`
// bez orbity) są w logice przy samym ciele, więc każda ich para leży w paśmie lasera (≤ 3,64 L na scenie), a rysowane ciało
// ma 4–38 L promienia — prawo sceny wokół ich środka rysowałoby statki WEWNĄTRZ planety. Skorupa: kula o promieniu
// (rysowany promień ciała + SHELL_FLOOR_L), grupa unieruchomionych tuż za nią, w KIERUNKU (poziomym) — przeciwnika wolnego
// „z zewnątrz” (przy ciele jedna strona — wolni innych stron; przy ciele obie — wolni strony w większości wolnej; statek
// schodzący z orbity się nie liczy), inaczej wolnych w ogóle (tylko przy jednej stronie przy ciele), a gdy przy ciele stoją
// OBIE strony — po stronie statków GRACZA w skali prawdziwej (decyzja kroku CV-3a3: niezależne od kamery, stabilne — orbity obracają się
// powoli; średnia blisko środka ciała (statki rozłożone dookoła) — statek o najmniejszym id). Wysokość grupy = płaszczyzna
// statków (klik trafia płaszczyznę, na której grupa jest rysowana; kamera nad płaszczyzną orbit widzi grupę nad ciałem).
// Prowadnica pasm liczy scenę jak zawsze; potem całe rozwiązanie przesuwa się sztywno (odstępy par bez zmian), a statek
// wolny, który mimo to wypadłby wewnątrz skorupy, wypychamy promieniowo na jej powierzchnię (liczone w `excluded`).

/**
 * Kierunek skorupy (poziomy, wektor jednostkowy w XZ) od środka ciała — patrz wyżej. `points` — pozycje LOGICZNE [j.]
 * z `side` ('player' — gracz; inaczej id imperium), `pinned` — id statków unieruchomionych przy tym ciele (Set albo tablica).
 * @returns {{ x:number, z:number, source:string }}
 */
export function shellBearing(points, body, pinned) {
  const has = (id) => (typeof pinned?.has === 'function' ? pinned.has(id) : Array.isArray(pinned) && pinned.includes(id));
  const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const pin = [], free = [];
  for (const p of points ?? []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    (has(p.id) ? pin : free).push(p);
  }
  // Przeciwnik „z zewnątrz” (CV-3a3, poprawka po kontroli właściciela — FAIL 5): przy ciele JEDNA strona — wolni statki
  // innych stron; przy ciele OBIE strony — wolni statki strony, której WIĘKSZOŚĆ jest wolna. Dawniej „przeciwnik” = każdy wolny
  // spoza strony z przewagą przy ciele: w bitwie 10 + 10 przy ciele jeden statek gracza zdjęty z orbity rozkazem (wróg miał
  // przewagę 10 : 9) przestawiał kierunek z `player` na `free-opposing` i cała grupa obracała się wokół planety w jednej
  // rundzie — zmierzone w grze o 115°, statek nad tarczą planety. Statek schodzący z orbity nie jest siłą z zewnątrz.
  const pinCount = new Map(), freeCount = new Map();
  for (const p of pin) pinCount.set(p.side, (pinCount.get(p.side) ?? 0) + 1);
  for (const p of free) freeCount.set(p.side, (freeCount.get(p.side) ?? 0) + 1);
  const outside = pinCount.size === 1
    ? free.filter((p) => !pinCount.has(p.side))
    : free.filter((p) => (freeCount.get(p.side) ?? 0) > (pinCount.get(p.side) ?? 0));
  // Strona gracza — WSZYSTKIE jego statki w bitwie (przy ciele i wolne): zdjęcie statku z orbity nie zmienia zbioru (dawniej
  // tylko przy ciele — środek po zdjęciu jednego statku potrafił przeskoczyć z `player-first` na `player`, o > 100°).
  const players = [...pin, ...free].filter((p) => p.side === 'player');
  const tries = [['free-opposing', outside], ['free', pinCount.size === 1 ? free : []], ['player', players.length ? players : pin]];
  for (const [source, set] of tries) {
    if (!set.length) continue;
    let cx = 0, cz = 0, spread = 0;
    for (const p of set) { cx += p.x; cz += p.z; spread += Math.hypot(p.x - body.x, p.z - body.z); }
    cx /= set.length; cz /= set.length; spread /= set.length;
    const dx = cx - body.x, dz = cz - body.z, d = Math.hypot(dx, dz);
    if (d > Math.max(1e-9, 0.25 * spread)) return { x: dx / d, z: dz / d, source };
    const first = [...set].sort(byId)[0];
    const fx = first.x - body.x, fz = first.z - body.z, fd = Math.hypot(fx, fz);
    if (fd > 1e-9) return { x: fx / fd, z: fz / fd, source: `${source}-first` };
  }
  return { x: 1, z: 0, source: 'default' };
}

/**
 * Pozycja BAZOWA (skala prawdziwa) statku unieruchomionego przy ciele BEZ orbity (Finding 626 — w logice stoi w środku
 * ciała, sprite nie ruszał się wcale): tuż za skorupą w kierunku `u`, siatka rozsunięcia po `k` (kolejne statki obok siebie).
 */
export function shellBaseAt(body, u, k, L, { floorL = STAGE.SHELL_FLOOR_L, latticeL = STAGE.DECONFLICT_L, planeY = STAGE.SHELL_PLANE_Y } = {}) {
  const h = body.r + (floorL + 2 * latticeL) * L;   // dwie powłoki siatki (do 25 statków) — każdy punkt za skorupą
  const off = latticeOffset(k, latticeL * L);
  return { x: body.x + u.x * h + off.x, y: planeY + off.y, z: body.z + u.z * h + off.z };
}

function applyShell(out, pts, { shell, L, edges, law, o }) {
  const body = shell.body;
  const pinned = shell.pinned;
  const has = (id) => (typeof pinned?.has === 'function' ? pinned.has(id) : Array.isArray(pinned) && pinned.includes(id));
  const pinIds = pts.filter((p) => has(p.id)).map((p) => p.id);
  if (!pinIds.length || !Number.isFinite(body.x) || !Number.isFinite(body.z) || !(body.r >= 0)) return null;
  const floor = (shell.floorL ?? o.SHELL_FLOOR_L) * L;
  const planeY = shell.planeY ?? o.SHELL_PLANE_Y;
  const u = shellBearing(pts, body, pinned);
  const core = { x: 0, y: 0, z: 0 };
  for (const id of pinIds) { const q = out.pos.get(id); core.x += q.x; core.y += q.y; core.z += q.z; }
  core.x /= pinIds.length; core.y /= pinIds.length; core.z /= pinIds.length;
  let extent = 0;
  for (const id of pinIds) { const q = out.pos.get(id); extent = Math.max(extent, Math.hypot(q.x - core.x, q.y - core.y, q.z - core.z)); }
  const h = body.r + floor + extent;
  const P = { x: body.x + u.x * h, y: planeY, z: body.z + u.z * h };
  const dx = P.x - core.x, dy = P.y - core.y, dz = P.z - core.z;
  for (const q of out.pos.values()) { q.x += dx; q.y += dy; q.z += dz; }
  // Wykluczenie ciała: nikt bliżej środka ciała niż skorupa (unieruchomieni z konstrukcji — h − extent = skorupa).
  const by = Number.isFinite(body.y) ? body.y : 0;
  const R0 = body.r + floor;
  let excluded = 0;
  for (const q of out.pos.values()) {
    const vx = q.x - body.x, vy = q.y - by, vz = q.z - body.z, d = Math.hypot(vx, vy, vz);
    if (d >= R0 * (1 - 1e-9)) continue;
    excluded++;
    if (d < 1e-12) { q.x = body.x + u.x * R0; q.y = by; q.z = body.z + u.z * R0; continue; }
    q.x = body.x + vx / d * R0; q.y = by + vy / d * R0; q.z = body.z + vz / d * R0;
  }
  if (excluded > 0 && out.scale == null) { out.misbanded = countMisbanded(pts, out.pos, edges, law); out.fallback = out.misbanded > 0; }
  // `shift` — przesunięcie sztywne całego rozwiązania (pole kliku D-CV-5 przy skorupie: mapa promieniowa prowadnicy wokół
  // środka LOGICZNEGO grupy, przesunięta o nie — `stagePointDrawn` / `stagePointLogical`).
  return { P, u, h, floor, extent, excluded, pinned: pinIds.length, bodyR: body.r, shift: { x: dx, y: dy, z: dz } };
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

// ── ARC CV, krok CV-3a2 — „scena odpowiada”: pole kliku sceny (D-CV-5) i klastry z pozycji logicznych (Finding 638) ─────
//
// Pole kliku. Rozkaz z kliknięcia w pustą przestrzeń sceny ma trafić TAM, GDZIE GRACZ WIDZI kursor: punkt rysowany
// (przecięcie promienia kliku z płaszczyzną statków) przechodzi przez odwrotność mapy promieniowej sceny wokół środka
// klastra, przy BIEŻĄCYM stopniu sceny. Pole to mapa promieniowa (prawo `radialMap` albo — gdy klaster stoi na skali
// awaryjnej — skala jednorodna), obie z soczewką: poza LENS_OUT·rIn od środka pole jest tożsamością, więc klik daleko od
// bitwy niczego nie przesuwa. Statki leżą na polu tylko w przybliżeniu (prowadnica par przesuwa je o ułamki pasma) —
// klik obok rysowanego statku trafia obok jego pozycji logicznej, nie w nią.

/** Mapa promieniowa POLA sceny: prawo sceny albo (skala awaryjna, `scale`) skala jednorodna; obie z soczewką. Monotoniczna. */
export function fieldMap(r, { rIn, scale = null, law = STAGE_LAW, lensOut = STAGE.LENS_OUT } = {}) {
  if (!(r > 0)) return 0;
  if (scale == null) return radialMap(r, rIn, law, lensOut);
  if (!(rIn > 0) || !(scale > 0) || !(scale < 1)) return r;   // bez ściśnięcia — tożsamość
  if (r <= rIn) return r * scale;
  const rOut = lensOut * rIn;
  if (r >= rOut) return r;
  return rIn * scale + (r - rIn) * (rOut - rIn * scale) / (rOut - rIn);
}

/** Promień RYSOWANY pola przy mieszaniu `blend` ∈ [0, 1]: lerp(r, fieldMap(r), blend) — rosnący dla każdego `blend`. */
export function fieldDrawnRadius(r, blend, field) {
  const b = Math.min(1, Math.max(0, blend));
  return r + (fieldMap(r, field) - r) * b;
}

/** Odwrotność `fieldDrawnRadius` (bisekcja — funkcja rosnąca). */
export function fieldDrawnRadiusInverse(rd, blend, field) {
  if (!(rd > 0)) return 0;
  const lensOut = field?.lensOut ?? STAGE.LENS_OUT;
  let lo = 0, hi = Math.max(rd, lensOut * (field?.rIn ?? 0)) * 2 + 1;
  while (fieldDrawnRadius(hi, blend, field) < rd) hi *= 2;
  for (let i = 0; i < 64; i++) {
    const m = (lo + hi) / 2;
    if (fieldDrawnRadius(m, blend, field) < rd) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// ARC CV-3a3 (D-CV-5 przy skorupie) — pole PRZESUNIĘTE. Bitwa przy ciele jest rysowana jako mapa promieniowa prowadnicy wokół
// środka LOGICZNEGO grupy (`centre` — tam, gdzie statki są w logice: przy ciele), przesunięta sztywno o `shift` (przesunięcie
// skorupy z `applyShell`: grupa rysowana obok ciała). Pole z jednym środkiem rysowanym dla obu stron (przed poprawką) liczyło
// punkt logiczny wokół grupy RYSOWANEJ — przesunięty o całe przesunięcie skorupy; statek wysłany w taki punkt stawał na scenie
// zmierzone 6–11 L (mediana) od kursora, w wolnej przestrzeni 3 L. Wewnątrz r_in przesunięcie pełne (× stopień sceny), w pasie
// soczewki maleje liniowo do zera — poza LENS_OUT·r_in pole jest tożsamością jak bez skorupy. Promień ściskania pola co najmniej
// |shift|: wtedy promień rysowany w pasie rośnie szybciej, niż maleje przesunięcie, więc mapa jest różnowartościowa, a odwrotność
// ma jedno rozwiązanie (bisekcja po promieniu logicznym). Statki stoją wewnątrz r_in prowadnicy — powiększenie nie zmienia ich mapy.

/** Waga przesunięcia pola: 1 do r_in, liniowo do 0 na LENS_OUT·r_in (brzeg soczewki — tożsamość), dalej 0. */
export function fieldShiftWeight(r, rIn, lensOut = STAGE.LENS_OUT) {
  if (!(rIn > 0) || r <= rIn) return 1;
  const rOut = lensOut * rIn;
  if (r >= rOut) return 0;
  return (rOut - r) / (rOut - rIn);
}

// Pole z przesunięciem: promień ściskania ≥ |shift| (różnowartościowość — patrz wyżej); bez przesunięcia — pole bez zmian.
function fieldWithShift(field) {
  const sx = Number.isFinite(field?.shift?.x) ? field.shift.x : 0, sz = Number.isFinite(field?.shift?.z) ? field.shift.z : 0;
  const len = Math.hypot(sx, sz);
  if (!(len > 0)) return { f: field, sx: 0, sz: 0 };
  return { f: { ...field, rIn: Math.max(field.rIn ?? 0, len) }, sx, sz };
}

/**
 * Punkt BEZ sceny (logiczny) → punkt RYSOWANY w polu klastra (D-CV-5).
 * @param {{x:number, z:number}} p
 * @param {{centre:{x:number,z:number}, rIn:number, blend:number, scale?:number|null, shift?:{x:number,z:number}|null}} field
 */
export function stagePointDrawn(p, field) {
  const { f, sx, sz } = fieldWithShift(field);
  const c = f.centre, dx = p.x - c.x, dz = p.z - c.z, r = Math.hypot(dx, dz);
  const w = sx || sz ? Math.min(1, Math.max(0, f.blend)) * fieldShiftWeight(r, f.rIn, f.lensOut ?? STAGE.LENS_OUT) : 0;
  if (!(r > 1e-12)) return { x: p.x + w * sx, z: p.z + w * sz };
  const rd = fieldDrawnRadius(r, f.blend, f);
  return { x: c.x + dx / r * rd + w * sx, z: c.z + dz / r * rd + w * sz };
}

/** Punkt RYSOWANY (pod kursorem) → punkt BEZ sceny (logiczny) w polu klastra (D-CV-5): kierunek od środka zachowany. */
export function stagePointLogical(p, field) {
  const { f, sx, sz } = fieldWithShift(field);
  const c = f.centre, dx = p.x - c.x, dz = p.z - c.z;
  if (!(sx || sz)) {
    const rd = Math.hypot(dx, dz);
    if (!(rd > 1e-12)) return { x: p.x, z: p.z };
    const r = fieldDrawnRadiusInverse(rd, f.blend, f);
    return { x: c.x + dx / rd * r, z: c.z + dz / rd * r };
  }
  // Pole przesunięte: promień logiczny r — pierwiastek g(r) = promień rysowany(r) − |u − waga(r)·shift| (rosnąca, g(0) ≤ 0).
  const b = Math.min(1, Math.max(0, f.blend)), lensOut = f.lensOut ?? STAGE.LENS_OUT;
  const rest = (r) => { const w = b * fieldShiftWeight(r, f.rIn, lensOut); return { x: dx - w * sx, z: dz - w * sz }; };
  const g = (r) => { const v = rest(r); return fieldDrawnRadius(r, b, f) - Math.hypot(v.x, v.z); };
  let lo = 0, hi = Math.max(Math.hypot(dx, dz), lensOut * f.rIn) * 2 + 1;
  while (g(hi) < 0) hi *= 2;
  for (let i = 0; i < 64; i++) {
    const m = (lo + hi) / 2;
    if (g(m) < 0) lo = m; else hi = m;
  }
  const r = (lo + hi) / 2, v = rest(r), vl = Math.hypot(v.x, v.z);
  if (!(vl > 1e-12)) return { x: c.x, z: c.z };
  return { x: c.x + v.x / vl * r, z: c.z + v.z / vl * r };
}

/** Pole klastra, którego soczewka (LENS_OUT·rIn od środka, rysowane = logiczne na brzegu) obejmuje punkt; najbliższy środek. */
export function pickStageField(fields, p, lensOut = STAGE.LENS_OUT) {
  let best = null, bestD = Infinity;
  for (const f of fields ?? []) {
    if (!f?.centre || !(f.rIn > 0) || !(f.blend > 0)) continue;
    const d = Math.hypot(p.x - f.centre.x, p.z - f.centre.z);
    if (d < lensOut * fieldWithShift(f).f.rIn && d < bestD) { bestD = d; best = f; }
  }
  return best;
}

/** Uczestnicy starcia (strona A i B, z dołączonymi). */
export function encounterParticipants(enc) {
  return [...(enc?.sideA?.vesselIds ?? []), ...(enc?.sideA?.joinedVesselIds ?? []),
    ...(enc?.sideB?.vesselIds ?? []), ...(enc?.sideB?.joinedVesselIds ?? [])];
}

/**
 * Środek starcia z pozycji LOGICZNYCH uczestników (Finding 638): żywi (`vesselStates` hp > 0); brak żywych — wszyscy z pozycją;
 * brak pozycji — punkt starcia (`location.point`). `getPos(id)` → {x, y} albo null — jednostki dowolne (renderer: j. świata
 * x / z, karta walki i baner: px rozgrywki); promień klastra podaje wołający w tych samych jednostkach.
 * @returns {{x:number, y:number}|null}
 */
export function encounterCentre(enc, getPos) {
  const ids = encounterParticipants(enc);
  const mean = (list) => {
    let sx = 0, sy = 0, n = 0;
    for (const id of list) {
      const q = getPos(id);
      if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
      sx += q.x; sy += q.y; n++;
    }
    return n ? { x: sx / n, y: sy / n } : null;
  };
  const alive = ids.filter((id) => { const st = enc?.vesselStates?.get?.(id); return !st || st.hp > 0; });
  const c = mean(alive) ?? mean(ids);
  if (c) return c;
  const pt = enc?.location?.point;
  return pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) ? { x: pt.x, y: pt.y } : null;
}

/**
 * Klastry AKTYWNYCH starć z pozycji logicznych (Finding 638) — JEDNO źródło dla sceny bitwy (renderer), karty walki
 * (jeden wiersz na klaster) i banera wyniku (jeden na klaster): ten sam układ, środki bliżej niż `radius`, pojedyncze
 * wiązanie, id klastra = najmniejsze id starcia.
 */
export function encounterClusters(encs, getPos, radius) {
  const list = [];
  for (const e of encs ?? []) {
    const c = e ? encounterCentre(e, getPos) : null;
    if (c) list.push({ id: e.id, systemId: e.location?.systemId ?? null, centre: { x: c.x, z: c.y } });
  }
  return clusterEncounters(list, radius);
}
