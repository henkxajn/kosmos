// ARC COLONY SPHERE CS-10b — dopracowanie jednostek na kuli kolonii (plan §3.20): pochylenie modeli ku kamerze, trasa
// rozkazu ruchu po powierzchni, logika zaznaczenia (Ctrl / Shift, stos, armia), trafienie jednostki na ekranie, model okna bitwy.
// Czyste funkcje — bez importów, bez DOM, bez losowości (keeper `colony_sphere_units_polish_smoke`).

export const UNIT_POLISH = Object.freeze({
  lean: 0.55,          // JEDNA stała pochylenia: 0 = model prosto na normalnej pola, 1 = część normalnej wzdłuż osi widoku zastąpiona „górą” ekranu
  pathArcSteps: 6,     // punkty pośrednie na łuk wielkiego koła między środkami pól trasy
  pathFadeMs: 1200,    // trasa gaśnie po dojściu do celu [ms]
  pathLift: 0.004,     // uniesienie linii trasy nad powierzchnię [promień ciała]
  hitPadPx: 4,         // zapas prostokąta trafienia jednostki [px]
});

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** „Góra” ekranu w układzie kuli: oś Y świata (kamera ma up = +Y) rzutowana prostopadle do kierunku oka. */
export function screenUpOf(eye) {
  const e = norm(eye), d = e[1];
  const u = [-e[0] * d, 1 - e[1] * d, -e[2] * d];
  return Math.hypot(u[0], u[1], u[2]) < 1e-6 ? [0, 0, -1] : norm(u);
}

/**
 * Pochylenie modelu ku kamerze: składowa normalnej pola wzdłuż osi widoku (n·e) jest w części `k` zastąpiona „górą” ekranu.
 *   up' = norm(n + k · (n·e) · (u − e))
 * Środek tarczy (n = e): model odchylony o atan(k / (1 − k)) ku górze ekranu — widać go z boku; przy limbie (n·e → 0) bez zmian.
 * Dla k < 0.8 model zawsze zostaje nad płaszczyzną styczną pola (up'·n > 0). Strona odwrócona (n·e ≤ 0) — bez pochylenia.
 */
export function leanUp(n, eye, up, k = UNIT_POLISH.lean) {
  const c = dot(n, eye);
  if (!(k > 0) || c <= 0) return [n[0], n[1], n[2]];
  const s = k * c;
  return norm([n[0] + s * (up[0] - eye[0]), n[1] + s * (up[1] - eye[1]), n[2] + s * (up[2] - eye[2])]);
}

/** Trasa jednostki w polach geo: [pole bieżące, …pozostałe kroki A*]; brak ruchu / siatka płaska → []. */
export function movePathTiles(unit) {
  if (!unit || unit.status !== 'moving' || !Array.isArray(unit._path) || !unit._path.length) return [];
  const cur = unit.r === -1 && Number.isInteger(unit.q) ? unit.q : -1;
  if (cur < 0) return [];
  const out = [cur];
  for (const s of unit._path) {
    if (!s || s.r !== -1 || !Number.isInteger(s.q) || s.q < 0) return [];
    if (s.q !== out[out.length - 1]) out.push(s.q);
  }
  return out.length >= 2 ? out : [];
}

function slerp(a, b, t) {
  const c = Math.max(-1, Math.min(1, dot(a, b))), om = Math.acos(c);
  if (om < 1e-6) return [a[0], a[1], a[2]];
  const s = Math.sin(om), ka = Math.sin((1 - t) * om) / s, kb = Math.sin(t * om) / s;
  return norm([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]);
}

/**
 * Łamana trasy po powierzchni: łuki wielkiego koła między KOLEJNYMI środkami pól (wierzchołki = dokładnie środki pól).
 * `startT` (0..1) przycina pierwszy łuk do bieżącej pozycji jednostki w kroku.
 * @returns {{ points: number[][], tileIdx: number[] }} punkty (kierunki jednostkowe) i indeksy punktów leżących na środkach pól
 */
export function pathPolyline(topo, tiles, { steps = UNIT_POLISH.pathArcSteps, startT = 0 } = {}) {
  const points = [], tileIdx = [];
  if (!topo || !tiles || tiles.length < 2) return { points, tileIdx };
  const C = (i) => [topo.cx[i], topo.cy[i], topo.cz[i]];
  const t0 = Math.max(0, Math.min(1, Number(startT) || 0));
  for (let k = 0; k < tiles.length - 1; k++) {
    const a = C(tiles[k]), b = C(tiles[k + 1]);
    const from = k === 0 ? t0 : 0;
    if (k === 0) { points.push(from > 0 ? slerp(a, b, from) : a); if (from <= 0) tileIdx.push(0); }
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      if (t <= from) continue;
      if (j === steps) { tileIdx.push(points.length); points.push(b); } else points.push(slerp(a, b, t));
    }
  }
  return { points, tileIdx };
}

/** Grot strzałki na końcu łamanej ekranowej: dwa ramiona od czubka (ostatni punkt), kierunek z ostatniego odcinka. */
export function arrowHead(pts, size) {
  if (!pts || pts.length < 2) return null;
  const tip = pts[pts.length - 1];
  let k = pts.length - 2;
  while (k > 0 && Math.hypot(tip.x - pts[k].x, tip.y - pts[k].y) < 1e-3) k--;
  const dx = tip.x - pts[k].x, dy = tip.y - pts[k].y, l = Math.hypot(dx, dy);
  if (l < 1e-3) return null;
  const ux = dx / l, uy = dy / l, s = size, w = size * 0.55;
  return { tip, left: { x: tip.x - ux * s - uy * w, y: tip.y - uy * s + ux * w }, right: { x: tip.x - ux * s + uy * w, y: tip.y - uy * s - ux * w } };
}

/** Krycie trasy: pełne w marszu i przy zaznaczeniu; po dojściu gaśnie liniowo w `pathFadeMs`. */
export function pathAlpha({ moving, selected, arrivedAt = null, now = 0 }, T = UNIT_POLISH) {
  if (moving) return 1;
  if (arrivedAt == null) return 0;
  const k = 1 - (now - arrivedAt) / T.pathFadeMs;
  return k > 0 ? Math.min(1, k) : 0;
}

/**
 * Klik w jednostkę — ta sama reguła co mapa płaska (`ColonyOverlay.handleClick`):
 *   Ctrl / Shift → przełącz klikniętą jednostkę w zaznaczeniu (bez armii; ostatnia zostaje główną albo pierwsza z reszty);
 *   bez modyfikatora → jednostka w armii (> 1) zaznacza całą armię (drugi klik w tę samą armię = odznacz), jedyna zaznaczona
 *   luźna jednostka → odznacz, inaczej zaznacz tylko ją.
 * @returns {{ ids: string[], primaryId: string|null }}
 */
export function unitClickSelection({ ids = [], primaryId = null, clickedId, mods = {}, armyIds = null }) {
  const sel = new Set(ids);
  if (!clickedId) return { ids: [...sel], primaryId };
  if (mods.ctrl || mods.shift) {
    if (sel.has(clickedId)) {
      sel.delete(clickedId);
      const p = primaryId === clickedId ? ([...sel][0] ?? null) : primaryId;
      return { ids: [...sel], primaryId: sel.size ? p : null };
    }
    sel.add(clickedId);
    return { ids: [...sel], primaryId: clickedId };
  }
  if (armyIds && armyIds.length > 1) {
    const all = armyIds.length === sel.size && armyIds.every((id) => sel.has(id));
    return all ? { ids: [], primaryId: null } : { ids: [...armyIds], primaryId: clickedId };
  }
  if (sel.size === 1 && sel.has(clickedId)) return { ids: [], primaryId: null };
  return { ids: [clickedId], primaryId: clickedId };
}

/**
 * Trafienie jednostki na ekranie: prostokąt od podstawy do głowy narysowanego modelu / znacznika; wygrywa najbliższy
 * kamerze (największe `facing`), przy remisie — mniejszy prostokąt (pojedyncza jednostka przed znacznikiem stosu).
 * @param {{id:string, x0:number, y0:number, x1:number, y1:number, facing:number, ids?:string[]}[]} boxes
 */
export function pickUnitBox(boxes, x, y, pad = UNIT_POLISH.hitPadPx) {
  let best = null;
  for (const b of boxes ?? []) {
    if (x < b.x0 - pad || x > b.x1 + pad || y < b.y0 - pad || y > b.y1 + pad) continue;
    const area = (b.x1 - b.x0) * (b.y1 - b.y0);
    if (!best || b.facing > best.facing + 1e-6 || (Math.abs(b.facing - best.facing) <= 1e-6 && area < best.area)) best = { ...b, area };
  }
  return best;
}

/**
 * Model okna bitwy naziemnej na polu spornym (stan z `CombatSystem.getBattleStateAt` — dotąd bez czytelnika).
 * @param {{ sides: Object<string, object[]>, round: number, terrain?: object }|null} state
 * @param {object} [archetypes] UNIT_ARCHETYPES (HP maks.)
 * @param {string|null} [terrainId] typ terenu pola (klucz i18n `terrain.<id>.name`)
 * @returns {null|{ round:number, terrainKey:string|null, own:object[], enemy:object[], ownHp:number, ownHpMax:number, enemyHp:number, enemyHpMax:number, ownerIds:string[] }}
 */
export function battleWindowModel(state, archetypes = {}, terrainId = null) {
  if (!state?.sides) return null;
  const own = [], enemy = [], ownerIds = [];
  for (const [owner, list] of Object.entries(state.sides)) {
    ownerIds.push(owner);
    for (const u of list ?? []) {
      if (!u || (u.hp ?? 0) <= 0) continue;
      const hpMax = archetypes?.[u.archetypeId]?.baseStats?.hp ?? u.hpMax ?? u.hp ?? 1;
      const row = { id: u.id, archetypeId: u.archetypeId, owner, hp: u.hp ?? 0, hpMax, hpFrac: Math.max(0, Math.min(1, (u.hp ?? 0) / (hpMax || 1))) };
      (owner === 'player' ? own : enemy).push(row);
    }
  }
  if (!own.length && !enemy.length) return null;
  const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
  return { round: state.round ?? 0, terrainKey: terrainId ?? null, own, enemy,
    ownHp: sum(own, 'hp'), ownHpMax: sum(own, 'hpMax'), enemyHp: sum(enemy, 'hp'), enemyHpMax: sum(enemy, 'hpMax'), ownerIds: ownerIds.sort() };
}

/** Okno bitwy: wymiary (konsola Kolonii). */
export const BATTLE_WINDOW = Object.freeze({ W: 380, GAP: 8, HEAD_H: 52, ROW_H: 22, FOOT_H: 34, MAX_ROWS: 6 });

/** Okno bitwy przy lewej krawędzi strefy inspektora, u GÓRY bohatera (szuflada grupy jest u dołu, rekrutacja przy inspektorze). */
export function battleWindowRect(zones, wantH, W = BATTLE_WINDOW) {
  const hero = zones?.hero, insp = zones?.inspector;
  if (!hero || !insp) return null;
  const w = Math.max(220, Math.min(W.W, hero.w - 2 * W.GAP));
  const h = Math.max(80, Math.min(wantH, hero.h - 2 * W.GAP));
  return { x: Math.max(hero.x + W.GAP, insp.x - W.GAP - w), y: hero.y + W.GAP, w, h };
}
