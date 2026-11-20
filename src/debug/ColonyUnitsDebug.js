// ColonyUnitsDebug — pomocniki konsoli przeglądarki do kontroli kroku CS-10 (jednostki naziemne na kuli kolonii:
// modele GLB z bliska, zwarte znaczniki z daleka, marsz po wielkim kole, bitwy, lądowanie). Bez argumentów, bez cudzysłowów.
//
//   csUnits()        — stawia przy stolicy pokazywanej (albo aktywnej) kolonii geo zestaw WŁASNYCH jednostek: piechota,
//                      artyleria, garnizon rozłożony i garnizon w szyku marszowym, obrona punktowa, medycy, dron,
//                      zaopatrzenie, stos trzech oddziałów piechoty na jednym polu i jeden oddział na polu z budynkiem.
//                      Wołane ponownie niczego nie dokłada.
//   csUnitMove()     — wysyła pierwszą własną jednostkę w szyku marszowym na pole odległe o kilka kroków (marsz po łuku).
//   csUnitLanding()  — desant wroga: trzy obce jednostki lądują w strefie lądowania (≥ 2 pola od zajętych) najbliżej
//                      stolicy — model opada na pole, nad polem znacznik lądowania.
//   csUnitBattle()   — bitwa: własny i obcy oddział na jednym polu przy stolicy (znacznik bitwy, strony naprzeciw siebie).
//   csUnitLod()      — podgląd LOD: auto → zawsze modele → zawsze znaczniki → auto.
//   csUnitInfo()     — stan: LOD, rozmiar pola [px], liczba modeli / znaczników / stosów / bitew, stany plików modeli,
//                      koszt przebiegu modeli i HUD [ms].
//   csUnitsClear()   — usuwa jednostki postawione przez te pomocniki.
//
// Importowalne pod node (bez THREE): czyta wyłącznie window.KOSMOS.

import { tileGraphOf } from '../map/TileGraph.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';

const OWN_SET = ['shock_infantry', 'rocket_artillery', 'aa_platform', 'medic_unit', 'recon_drone', 'ground_supply_unit'];
const LANDING_SET = ['shock_infantry', 'shock_infantry', 'rocket_artillery'];
const FALLBACK_MIN_DISTANCE = 4;   // bez strefy lądowania: pokazowy desant ląduje co najmniej tyle pól od stolicy
const _made = new Set();

function ctx() {
  const K = window.KOSMOS, cm = K?.colonyManager;
  const ov = K?.overlayManager?.overlays?.colony;
  const col = (ov?.visible ? ov._getColony?.() : null) ?? cm?.getColony?.(cm?.activePlanetId) ?? cm?.getColony?.(K?.homePlanet?.id) ?? null;
  const grid = col?.grid ?? null, gum = K?.groundUnitManager ?? null;
  const ok = !!gum && grid?.kind === 'geo';
  return { K, ov, col, grid, gum, ok, graph: ok ? tileGraphOf(grid) : null };
}
const dirty = (K) => { if (K?.uiManager) K.uiManager._dirty = true; };
const walkable = (t) => !!t && TERRAIN_TYPES[t.type]?.buildable && t.type !== 'ocean';
const built = (t) => t.buildingId != null || t.underConstruction != null || !!t.capitalBase;

function tilesByDistance(c) {
  const tiles = c.graph.tiles();
  const cap = tiles.find(t => t.capitalBase) ?? tiles.find(t => t.buildingId) ?? c.graph.anyTile();
  const topo = c.graph.topo;
  return { cap, list: tiles.filter(t => t !== cap && walkable(t)).sort((a, b) => (topo.distance(cap.q, a.q) - topo.distance(cap.q, b.q)) || (a.q - b.q)) };
}
const occupied = (c, t) => (c.gum.getUnitsAtHex?.(c.col.planetId, t.q, t.r) ?? []).length > 0;
function own(c, type, t, extra = {}) {
  const u = c.gum.createUnit(type, c.col.planetId, t.q, t.r, { factionId: 'humanity', owner: 'player', ...extra });
  if (u) _made.add(u.id);
  return u;
}
function enemyEmpire(K) {
  const ids = K?.empireRegistry?.listIds?.() ?? [];
  return ids.find(id => id !== 'player') ?? null;
}
function foe(c, type, t, empireId) {
  const res = c.gum.createAIUnit({ archetypeId: type, empireId, planetId: c.col.planetId, q: t.q, r: t.r, morale: 60, deployed: false });
  if (res?.ok) _made.add(res.unit.id);
  return res?.ok ? res.unit : null;
}

export function csUnits() {
  const c = ctx();
  if (!c.ok) { console.warn('[csUnits] open a sphere colony first (geo grid)'); return null; }
  const mine = c.gum.getUnitsOnPlanet(c.col.planetId).filter(u => !u.owner || u.owner === 'player');
  if (mine.filter(u => _made.has(u.id)).length >= 8) { console.log('[csUnits] units already placed'); return { placed: 0 }; }
  const { list } = tilesByDistance(c);
  // Najbliższe stolicy pola lądu — także z budynkiem (jednostka staje przed portretem): na świecie z małą ilością lądu
  // wolne pola bywają daleko od stolicy.
  const free = list.filter(t => !occupied(c, t));
  const out = [];
  let k = 0;
  for (const type of OWN_SET) { const t = free[k++]; if (t) out.push(own(c, type, t)?.archetypeId ?? null); }
  const tDep = free[k++], tMob = free[k++], tStack = free[k++];
  if (tDep) own(c, 'garrison_unit', tDep, { deployState: 'deployed' });
  if (tMob) own(c, 'garrison_unit', tMob, { deployState: 'mobile' });
  if (tStack) for (let i = 0; i < 3; i++) own(c, 'shock_infantry', tStack);
  const tBuilt = list.find(t => built(t) && !occupied(c, t)) ?? null;
  if (tBuilt) own(c, 'shock_infantry', tBuilt);
  const first = free[0];
  if (first) c.ov?._sphere?.renderer?.turnTo?.(first.q);
  dirty(c.K);
  const res = { placed: _made.size, single: out.filter(Boolean).length, garrisonDeployed: !!tDep, garrisonMobile: !!tMob, stackOf3: !!tStack, onBuilding: !!tBuilt };
  console.log('[csUnits]', JSON.stringify(res));
  return res;
}

export function csUnitMove() {
  const c = ctx();
  if (!c.ok) { console.warn('[csUnitMove] open a sphere colony first (geo grid)'); return null; }
  const units = c.gum.getUnitsOnPlanet(c.col.planetId).filter(u => (!u.owner || u.owner === 'player') && u.status !== 'moving' && (!u.deployState || u.deployState === 'mobile'));
  if (!units.length) { console.warn('[csUnitMove] no own mobile unit — run csUnits() first'); return null; }
  // Cel: wolne pole lądu 2–5 kroków dalej, do którego gra ZNAJDUJE drogę (ocean i cudze pola blokują) — rozkaz idzie przez
  // prawdziwe `moveUnit`; próby od najdalszego celu, piechota pierwsza.
  const topo = c.graph.topo;
  const order = [...units.filter(x => x.archetypeId === 'shock_infantry'), ...units.filter(x => x.archetypeId !== 'shock_infantry')].slice(0, 6);
  let u = null, target = null;
  for (const cand of order) {
    const goals = c.graph.tiles().filter(t => walkable(t) && !occupied(c, t)).map(t => ({ t, d: topo.distance(cand.q, t.q) })).filter(x => x.d >= 2 && x.d <= 5)
      .sort((a, b) => (b.d - a.d) || (a.t.q - b.t.q)).slice(0, 12);
    for (const g of goals) {
      c.gum.moveUnit(cand.id, g.t.q, g.t.r);
      if (cand.status === 'moving' && cand._path?.length > 0) { u = cand; target = g.t; break; }
    }
    if (u) break;
  }
  if (!u) { console.warn('[csUnitMove] no reachable free tile 2–5 steps away'); return null; }
  const from = u.q, ok = true;
  dirty(c.K);
  const res = { unit: u.id, from, to: target.q, steps: u._path.length, ordered: ok, paused: !!c.K?.timeSystem?.isPaused };
  console.log('[csUnitMove]', JSON.stringify(res), res.paused ? '— time is paused: press Space to watch the march' : '');
  return res;
}

export function csUnitLanding() {
  const c = ctx();
  if (!c.ok) { console.warn('[csUnitLanding] open a sphere colony first (geo grid)'); return null; }
  const emp = enemyEmpire(c.K);
  if (!emp) { console.warn('[csUnitLanding] no other empire in this game'); return null; }
  const { list } = tilesByDistance(c);
  // Reguła gry (InvasionSystem._findLandingHexes): strefa lądowania, a gdy jej nie ma (całe ciało zajęte) — dowolne wolne pole lądu.
  const inZone = list.filter(t => c.graph.isLandingEdge(t) && !occupied(c, t));
  const topo = c.graph.topo, cap = tilesByDistance(c).cap;
  const pool = inZone.length ? inZone : list.filter(t => !built(t) && !occupied(c, t) && topo.distance(cap.q, t.q) >= FALLBACK_MIN_DISTANCE);
  const zone = pool.slice(0, LANDING_SET.length);
  const ids = [];
  zone.forEach((t, i) => { const u = foe(c, LANDING_SET[i], t, emp); if (u) ids.push(u.id); });
  c.ov?._sphereOf?.().units.noteLanding(ids);
  dirty(c.K);
  const res = { empire: emp, landed: ids.length, tiles: zone.map(t => t.q), zone: inZone.length ? 'landing zone' : 'fallback (no landing zone: every tile is held)', landingZoneTiles: inZone.length };
  console.log('[csUnitLanding]', JSON.stringify(res));
  return res;
}

export function csUnitBattle() {
  const c = ctx();
  if (!c.ok) { console.warn('[csUnitBattle] open a sphere colony first (geo grid)'); return null; }
  const emp = enemyEmpire(c.K);
  if (!emp) { console.warn('[csUnitBattle] no other empire in this game'); return null; }
  const { list } = tilesByDistance(c);
  const t = list.filter(x => !built(x) && !occupied(c, x))[0] ?? list.find(x => !occupied(c, x));
  if (!t) { console.warn('[csUnitBattle] no free tile'); return null; }
  own(c, 'shock_infantry', t); own(c, 'rocket_artillery', t);
  foe(c, 'shock_infantry', t, emp); foe(c, 'shock_infantry', t, emp);
  dirty(c.K);
  const res = { tile: t.q, own: 2, enemy: 2, empire: emp };
  console.log('[csUnitBattle]', JSON.stringify(res));
  return res;
}

export function csUnitLod() {
  const c = ctx();
  const units = c.ov?._sphere?.units;
  if (!units) { console.warn('[csUnitLod] open a sphere colony first'); return null; }
  const mode = units.cycleLod();
  dirty(c.K);
  console.log('[csUnitLod]', mode);
  return mode;
}

export function csUnitInfo() {
  const c = ctx();
  const sp = c.ov?._sphere;
  if (!sp) { console.warn('[csUnitInfo] open a sphere colony first'); return null; }
  const out = { ...sp.units.info(), layer: sp.renderer.info().units, sphereMsMedian: sp.renderer.info().renderMsMedian };
  console.log('[csUnitInfo]', JSON.stringify(out));
  return out;
}

export function csUnitsClear() {
  const c = ctx();
  if (!c.gum) return null;
  let n = 0;
  for (const id of _made) { if (c.gum.removeUnit(id)) n++; }
  _made.clear();
  dirty(c.K);
  console.log('[csUnitsClear] removed', n);
  return n;
}

export function colonyUnitsDebugHelpers() { return { csUnits, csUnitMove, csUnitLanding, csUnitBattle, csUnitLod, csUnitInfo, csUnitsClear }; }
