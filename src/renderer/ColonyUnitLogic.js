// ColonyUnitLogic — czysta logika jednostek naziemnych na kuli kolonii (ARC COLONY SPHERE, krok CS-10; plan §3.19,
// D-CS-14: model GLB z bliska, znacznik z daleka).
//
// Bez three, bez DOM, bez stanu gry: keeper `colony_sphere_units_smoke` wykonuje wszystko pod node.
// • LOD: próg po rozmiarze pola na ekranie (`unitLodOf`) — jeden na cały kadr (bez przeskoków między polami).
// • Wariant `_mobile` / `_deployed`: TA SAMA reguła co mapa 2D (`ColonyOverlay._getUnitSprite`): mobile / deploying →
//   `_mobile`, deployed / packing → `_deployed`, tylko archetyp z `supportsDeploy`; brak pliku wariantu → bazowy GLB.
// • Ustawienie: jednostka stoi NA polu (środek pola albo — na polu z budynkiem — przesunięta na południe, przed portret),
//   stos = rząd wzdłuż lokalnego wschodu, pole sporne = własne po zachodniej, obce po wschodniej stronie, zwrócone do siebie.
// • Ruch: krok po wielkim kole między ŚRODKAMI pól (`greatCircleStep`), zwrot = styczna do łuku w kierunku celu.
//   Żadnej interpolacji w przestrzeni ekranu.
// • Grupowanie instancji: jeden klucz modelu = jedna grupa (InstancedMesh na część szablonu).

/** Budżet rozmiaru modelu jednostki w ścieżce gry (keeper + `tools/unit-models/optimize-unit.mjs`). */
export const UNIT_GLB_BUDGET = Object.freeze({
  maxBytes: 2.5 * 1048576,     // limit pliku GLB [B]
  maxTriangles: 64000,         // limit trójkątów (zaopatrzenie po uproszczeniu: 59,9 tys. — podłoga upraszczania przy szwach UV)
  targetTriangles: 30000,      // cel upraszczania (tyle mają pozostałe modele jednostek)
  maxTexturePx: 512,           // maks. bok tekstury [px]
});

export const UNIT_LOD = Object.freeze({ MODEL: 'model', MARKER: 'marker' });
/** Podgląd LOD właściciela (`csUnitLod()`): auto → zawsze modele → zawsze znaczniki. */
export const UNIT_LOD_BIAS = Object.freeze({ AUTO: 'auto', MODELS: 'models', MARKERS: 'markers' });

export const UNIT_VIEW = Object.freeze({
  modelAbovePx: 96,            // pole ≥ tyle px na ekranie → modele GLB; mniejsze → zwarty znacznik z licznikiem stosu
  modelShare: 0.58,            // największy wymiar modelu jako ułamek rozstawu pól (jednostka sama na polu)
  builtShare: 0.46,            // … na polu z budynkiem
  stackShare: 0.40,            // … w stosie / na polu spornym
  movingShare: 0.52,           // … w marszu
  builtOffset: 0.30,           // przesunięcie na południe na polu z budynkiem [rozstaw pól] — jednostka stoi przed portretem
  stackStep: 0.27,             // odstęp modeli w rzędzie stosu [rozstaw pól]
  battleGap: 0.24,             // odsunięcie stron od środka pola spornego [rozstaw pól]
  battleStep: 0.22,            // odstęp modeli jednej strony na polu spornym (wzdłuż północ–południe) [rozstaw pól]
  maxModelsPerSide: 3,         // tyle modeli jednej strony na polu; reszta tylko w liczniku stosu
  lift: 0.0015,                // uniesienie nad powierzchnię [promień ciała] (bez migotania głębi)
  minFacing: 0.16,             // poniżej: jednostka przy limbie nie jest rysowana (HUD 2D) — jak znaczniki budynków
  markerPx: [16, 30],          // klamra rozmiaru zwartego znacznika [px]
  markerShare: 0.42,           // rozmiar znacznika jako ułamek pola na ekranie
  moveFps: 30,                 // tempo klatek, gdy jakaś jednostka maszeruje
  effectFps: 20,               // tempo klatek efektów (lądowanie, puls bitwy)
  landingMs: 3200,             // czas życia znacznika lądowania [ms]
  landingDropMs: 1300,         // czas opadania modelu [ms]
  landingHeight: 1.6,          // wysokość startu opadania [rozstaw pól]
  ownTint: [1, 1, 1],
  enemyTint: [1.0, 0.56, 0.5], // mnożnik barwy modelu wroga (mapa 2D: filtr hue-rotate)
  offlineTint: [0.42, 0.42, 0.46],
  starvingTint: [0.72, 0.7, 0.66],
});

/** Barwy HUD jednostek — te same co mapa 2D (`ColonyOverlay._drawUnits`). */
export const UNIT_COLORS = Object.freeze({
  own: '#64A0FF', ownEdge: '#B0D0FF', enemy: '#D85A30', enemyEdge: '#FFB098',
  hpHigh: '#60E0B0', hpMid: '#D8A030', hpLow: '#D85A30',
  supplyHigh: '#E0C020', supplyMid: '#E08020', supplyLow: '#D85A30', org: '#4090E8', morale: '#80D060',
  battle: '#FF3030', landing: '#FFB060', scan: '#00ffb4', offline: '#9AA0AA',
});

export const isEnemyUnit = (u) => !!u?.owner && u.owner !== 'player';
const hiddenFromPlayer = (u) => u?._stealthState === 'hidden' && isEnemyUnit(u);

/** LOD kadru: modele z bliska, znaczniki z daleka; brak WebGL → zawsze znaczniki. */
export function unitLodOf(tilePx, { bias = UNIT_LOD_BIAS.AUTO, gl = true, T = UNIT_VIEW } = {}) {
  if (!gl) return UNIT_LOD.MARKER;
  if (bias === UNIT_LOD_BIAS.MODELS) return UNIT_LOD.MODEL;
  if (bias === UNIT_LOD_BIAS.MARKERS) return UNIT_LOD.MARKER;
  return tilePx >= T.modelAbovePx ? UNIT_LOD.MODEL : UNIT_LOD.MARKER;
}

/** Wariant rozłożenia jak na mapie 2D: 'mobile' | 'deployed' | null (archetyp bez `supportsDeploy` albo brak stanu). */
export function unitVariantOf(unit, archetype) {
  if (!unit?.deployState || !archetype?.supportsDeploy) return null;
  return (unit.deployState === 'mobile' || unit.deployState === 'deploying') ? 'mobile' : 'deployed';
}

const toGlb = (p) => String(p).replace(/\.(png|jpg|jpeg|webp|glb)$/i, '.glb');
const withVariant = (p, v) => String(p).replace(/(\.[a-z]+)$/i, `_${v}$1`);

/**
 * Kandydaci pliku modelu w kolejności prób: wariant rozłożenia, potem bazowy GLB (D-CS-14). Ścieżka bazowa =
 * `unit.sprite` (nadana przez fabrykę z danych frakcji) z rozszerzeniem `.glb`. Brak ścieżki → [] (zostaje znacznik).
 */
export function unitModelCandidates(unit, archetype) {
  const base = unit?.sprite;
  if (!base) return [];
  const v = unitVariantOf(unit, archetype);
  const glb = toGlb(base);
  return v ? [withVariant(glb, v), glb] : [glb];
}

/** Klucz grupy instancji: pierwszy kandydat modelu (wariant wchodzi w klucz — zmiana stanu przenosi jednostkę do innej grupy). */
export function unitModelKey(unit, archetype) { return unitModelCandidates(unit, archetype).join('|'); }

/** Indeks pola geo jednostki albo −1 (jednostka na siatce płaskiej nie należy do kuli). */
export function geoTileOf(ref) { return ref && ref.r === -1 && Number.isInteger(ref.q) && ref.q >= 0 ? ref.q : -1; }

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smooth = (p) => (p <= 0 ? 0 : (p >= 1 ? 1 : p * p * (3 - 2 * p)));

/** Lokalna baza styczna w punkcie kuli: wschód (−z, 0, x) jak `GeodesicTileGraph.stepDirection`, północ = wschód × kierunek (ku +Y). */
export function tangentBasis(dir) {
  const h = Math.hypot(dir[0], dir[2]);
  const east = h > 1e-6 ? [-dir[2] / h, 0, dir[0] / h] : [1, 0, 0];   // biegun: dowolna stała styczna
  const north = norm(cross(east, dir));
  return { east, north };
}

/** Interpolacja po wielkim kole między dwoma kierunkami jednostkowymi (t ∈ [0, 1]). */
export function slerpDir(a, b, t) {
  const c = Math.max(-1, Math.min(1, dot(a, b)));
  const om = Math.acos(c);
  if (om < 1e-6) return [a[0], a[1], a[2]];
  const s = Math.sin(om), ka = Math.sin((1 - t) * om) / s, kb = Math.sin(t * om) / s;
  return norm([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]);
}

/**
 * Krok jednostki po wielkim kole: pozycja na łuku środek pola A → środek pola B i zwrot (styczna do łuku w stronę B).
 * t = 0 → dokładnie środek A, t = 1 → dokładnie środek B.
 */
export function greatCircleStep(a, b, t) {
  const tt = Math.max(0, Math.min(1, Number(t) || 0));
  const dir = tt <= 0 ? [a[0], a[1], a[2]] : (tt >= 1 ? [b[0], b[1], b[2]] : slerpDir(a, b, tt));
  // Styczna w `dir` w stronę B; w samym B — kontynuacja łuku (od A).
  let h = [b[0] - dir[0] * dot(dir, b), b[1] - dir[1] * dot(dir, b), b[2] - dir[2] * dot(dir, b)];
  if (Math.hypot(h[0], h[1], h[2]) < 1e-6) h = [dir[0] * dot(dir, a) - a[0], dir[1] * dot(dir, a) - a[1], dir[2] * dot(dir, a) - a[2]];
  if (Math.hypot(h[0], h[1], h[2]) < 1e-6) h = tangentBasis(dir).east;
  return { dir, heading: norm(h) };
}

const centre = (topo, i) => [topo.cx[i], topo.cy[i], topo.cz[i]];
const offsetDir = (dir, basis, e, n) => norm([dir[0] + basis.east[0] * e + basis.north[0] * n, dir[1] + basis.east[1] * e + basis.north[1] * n, dir[2] + basis.east[2] * e + basis.north[2] * n]);
// Wektor styczny pola przeniesiony do punktu `dir` (rzut na płaszczyznę styczną) — zwrot liczony z bazy ŚRODKA pola,
// nie z bazy punktu przesuniętego (przy biegunie lokalny wschód obraca się na długości jednego pola).
const tangentAt = (dir, v) => { const d = dot(dir, v); return norm([v[0] - dir[0] * d, v[1] - dir[1] * d, v[2] - dir[2] * d]); };
const tileBuilt = (t) => !!t && (t.buildingId != null || t.underConstruction != null || !!t.capitalBase);

function tintOf(u, T) {
  if (u.status === 'offline') return T.offlineTint;
  if (isEnemyUnit(u)) return T.enemyTint;
  if (u.supply != null && u.supplyCap != null && u.supply <= 0) return T.starvingTint;
  return T.ownTint;
}

/**
 * Rozstawienie jednostek kadru.
 * @param {object} o
 * @param {object[]} o.units jednostki ciała (już po regule widoczności gospodarza)
 * @param {object} o.topo topologia geodezyjna (cx / cy / cz / count)
 * @param {object[]} [o.tiles] pola siatki (budynek na polu → jednostka przed portretem)
 * @param {object} [o.archetypes] UNIT_ARCHETYPES (wariant rozłożenia)
 * @param {Map<string, number>} [o.landings] id jednostki → czas lądowania [ms]
 * @param {number} [o.now] zegar [ms]
 * @param {(tile:number)=>boolean} [o.battleAt] CS-10b (Finding 797) — czy na polu toczy się bitwa wg systemu walki
 *   (`CombatSystem.isBattleAt`: wojna + żywe, walczące jednostki). Ścieżka gry podaje go zawsze; bez predykatu (czyste
 *   wywołania CS-10) `battle` = `contested`.
 * @returns {{ items: object[], stacks: object[], moving: number, landing: number }}
 *   items: { id, unit, tile, dir, heading, share, enemy, moving, shown, tint, key, candidates, height, landing }
 *   stacks: { tile, dir, own, enemy, contested, battle } — contested = układ obok siebie (dwie strony na polu), battle = znacznik bitwy
 */
export function unitPlacements({ units, topo, tiles = null, archetypes = null, landings = null, now = 0, battleAt = null }, T = UNIT_VIEW) {
  const items = [], stacks = [];
  if (!topo || !units) return { items, stacks, moving: 0, landing: 0 };
  const spacing = Math.sqrt(4 * Math.PI / topo.count);
  const byTile = new Map();
  let moving = 0, landing = 0;
  const push = (u, tile, dir, heading, share, extra = {}) => {
    const arch = archetypes?.[u.archetypeId] ?? null;
    const candidates = unitModelCandidates(u, arch);
    let height = 0, land = 0;
    const t0 = landings?.get?.(u.id);
    if (t0 != null && now - t0 < T.landingMs) {
      land = 1 - Math.max(0, now - t0) / T.landingMs;
      const p = Math.max(0, Math.min(1, (now - t0) / T.landingDropMs));
      height = (1 - smooth(p)) * T.landingHeight * spacing;
      landing++;
    }
    items.push({ id: u.id, unit: u, tile, dir, heading, share, enemy: isEnemyUnit(u), moving: false, shown: true, tint: tintOf(u, T),
      key: candidates.join('|'), candidates, height, landing: land, ...extra });
  };

  for (const u of units) {
    if (hiddenFromPlayer(u)) continue;
    const i = geoTileOf(u);
    if (i < 0 || i >= topo.count) continue;
    const next = u.status === 'moving' && u._path?.length > 0 ? geoTileOf(u._path[0]) : -1;
    if (next >= 0 && next < topo.count && !u._wrapStep) {
      const step = greatCircleStep(centre(topo, i), centre(topo, next), u._animT);
      push(u, i, step.dir, step.heading, T.movingShare, { moving: true, toTile: next });
      moving++;
      continue;
    }
    let s = byTile.get(i);
    if (!s) { s = { tile: i, own: [], enemy: [] }; byTile.set(i, s); }
    (isEnemyUnit(u) ? s.enemy : s.own).push(u);
  }

  for (const s of byTile.values()) {
    const c = centre(topo, s.tile), basis = tangentBasis(c);
    const contested = s.own.length > 0 && s.enemy.length > 0;
    const battle = contested && (typeof battleAt === 'function' ? !!battleAt(s.tile) : true);
    stacks.push({ tile: s.tile, dir: c, own: s.own.length, enemy: s.enemy.length, contested, battle });
    if (contested) {
      for (const [side, sign] of [[s.own, -1], [s.enemy, 1]]) {
        const n = Math.min(side.length, T.maxModelsPerSide);
        side.forEach((u, k) => {
          const shown = k < T.maxModelsPerSide;
          const row = shown ? (k - (n - 1) / 2) * T.battleStep * spacing : 0;
          const dir = offsetDir(c, basis, sign * T.battleGap * spacing, row);
          push(u, s.tile, dir, tangentAt(dir, basis.east.map(v => -sign * v)), T.stackShare, { shown, contested: true });
        });
      }
      continue;
    }
    const side = s.own.length ? s.own : s.enemy;
    const south = tileBuilt(tiles?.[s.tile]) ? -T.builtOffset * spacing : 0;
    const n = Math.min(side.length, T.maxModelsPerSide);
    side.forEach((u, k) => {
      const shown = k < T.maxModelsPerSide;
      const row = shown ? (k - (n - 1) / 2) * T.stackStep * spacing : 0;
      const dir = (row === 0 && south === 0) ? c : offsetDir(c, basis, row, south);
      const share = side.length > 1 ? T.stackShare : (south !== 0 ? T.builtShare : T.modelShare);
      push(u, s.tile, dir, tangentAt(dir, basis.east.map(v => (u._facingLeft ? -v : v))), share, { shown });
    });
  }
  return { items, stacks, moving, landing };
}

/**
 * Grupy instancji: klucz modelu → jednostki rysowane modelem (tylko `shown`, tylko z kandydatem pliku).
 * @returns {Map<string, { key:string, candidates:string[], items:object[] }>}
 */
export function groupUnitInstances(items) {
  const groups = new Map();
  for (const it of items) {
    if (!it.shown || !it.key) continue;
    let g = groups.get(it.key);
    if (!g) { g = { key: it.key, candidates: it.candidates, items: [] }; groups.set(it.key, g); }
    g.items.push(it);
  }
  return groups;
}

/**
 * Macierz instancji (16 liczb, kolumnami): model znormalizowany (podstawa w y = 0, przód +Z, największy wymiar 1) staje
 * na powierzchni — oś Y modelu = normalna pola (CS-10b: albo podana oś pochylona ku kamerze, `leanUp`), oś Z = zwrot,
 * skala = udział × rozstaw pól. Podstawa zawsze na polu (przesunięcie wzdłuż normalnej `item.dir`).
 */
export function instanceMatrix(item, spacing, T = UNIT_VIEW, out = new Array(16), upAxis = null) {
  const up = upAxis ?? item.dir, base = item.dir;
  let f = item.heading;
  const d = dot(f, up);
  f = [f[0] - up[0] * d, f[1] - up[1] * d, f[2] - up[2] * d];
  // Zwrot prawie równoległy do pochylonej osi — zwrot z bazy stycznej (bez zera w macierzy).
  if (Math.hypot(f[0], f[1], f[2]) < 1e-4) { const e = tangentBasis(base).north; const k = dot(e, up); f = [e[0] - up[0] * k, e[1] - up[1] * k, e[2] - up[2] * k]; }
  f = norm(f);
  const r = cross(up, f);
  const s = item.share * spacing, h = 1 + T.lift + (item.height || 0);
  out[0] = r[0] * s; out[1] = r[1] * s; out[2] = r[2] * s; out[3] = 0;
  out[4] = up[0] * s; out[5] = up[1] * s; out[6] = up[2] * s; out[7] = 0;
  out[8] = f[0] * s; out[9] = f[1] * s; out[10] = f[2] * s; out[11] = 0;
  out[12] = base[0] * h; out[13] = base[1] * h; out[14] = base[2] * h; out[15] = 1;
  return out;
}

/** Podpis stanu warstwy modeli — zmiana = trzeba wyrenderować klatkę. */
export function unitLayerSignature(groups) {
  let s = '';
  for (const g of groups.values()) {
    s += g.key + '#';
    for (const it of g.items) s += `${it.dir[0].toFixed(5)},${it.dir[1].toFixed(5)},${it.dir[2].toFixed(5)},${it.heading[0].toFixed(3)},${it.heading[2].toFixed(3)},${(it.height || 0).toFixed(4)},${it.share},${it.tint[0]}${it.tint[1]};`;
  }
  return s;
}

/**
 * Zwarte znaczniki (LOD daleki oraz jednostki bez modelu): jeden na pole i stronę, z licznikiem stosu; jednostka
 * w marszu ma własny znacznik na łuku.
 * @param {{items:object[], stacks:object[]}} placement
 * @param {(it:object) => boolean} [needsMarker] które jednostki z `items` rysować znacznikiem (domyślnie wszystkie)
 * @returns {{ dir:number[], enemy:boolean, count:number, ids:string[], moving:boolean, side:number }[]}
 */
export function unitMarkerList(placement, needsMarker = () => true) {
  const out = [], byKey = new Map();
  for (const it of placement.items) {
    if (!needsMarker(it)) continue;
    if (it.moving) { out.push({ dir: it.dir, enemy: it.enemy, count: 1, ids: [it.id], moving: true, side: 0, tile: it.tile }); continue; }
    const key = `${it.tile}:${it.enemy ? 1 : 0}`;
    let m = byKey.get(key);
    if (!m) {
      const st = placement.stacks.find(s => s.tile === it.tile);
      m = { dir: st?.dir ?? it.dir, enemy: it.enemy, count: 0, ids: [], moving: false, side: st?.contested ? (it.enemy ? 1 : -1) : 0, tile: it.tile };
      byKey.set(key, m); out.push(m);
    }
    m.count++; m.ids.push(it.id);
  }
  return out;
}

/** Pola bitwy (znacznik bitwy): własne i obce jednostki na jednym polu ORAZ bitwa wg systemu walki (Finding 797). */
export function battleTilesOf(placement) { return placement.stacks.filter(s => s.battle); }

/** Paski HUD jednostki — te same warunki i barwy co mapa 2D. Zwraca listę { pct, color, thick }. */
export function unitBarsOf(u, C = UNIT_COLORS) {
  const bars = [];
  const clamp = (v) => Math.max(0, Math.min(1, v));
  if (u.hpMax && u.hp < u.hpMax) {
    const p = clamp(u.hp / u.hpMax);
    bars.push({ pct: p, color: p > 0.5 ? C.hpHigh : (p > 0.25 ? C.hpMid : C.hpLow), thick: true });
  }
  if (u.supply != null && u.supplyCap != null && !isEnemyUnit(u)) {
    const sup = u.supplyCap > 0 ? clamp(u.supply / u.supplyCap) : 0;
    const org = (u.maxOrg ?? 0) > 0 ? clamp(u.org / u.maxOrg) : 0;
    const mor = (u.maxMorale ?? 0) > 0 ? clamp(u.morale / u.maxMorale) : 0;
    if (sup < 1 || u.supply <= 0) bars.push({ pct: sup, color: sup > 0.5 ? C.supplyHigh : (sup > 0 ? C.supplyMid : C.supplyLow), thick: false });
    if (org < 1) bars.push({ pct: org, color: C.org, thick: false });
    if (!u.noMorale && mor < 1) bars.push({ pct: mor, color: C.morale, thick: false });
  }
  return bars;
}

/** Za ile ms narysować kolejną klatkę z powodu jednostek: marsz, lądowanie, puls bitwy; ∞ = nic się nie rusza. */
export function unitFrameDelayMs(placement, T = UNIT_VIEW) {
  if (!placement) return Infinity;
  if (placement.moving > 0) return 1000 / T.moveFps;
  if (placement.landing > 0 || placement.stacks.some(s => s.battle)) return 1000 / T.effectFps;
  return Infinity;
}
