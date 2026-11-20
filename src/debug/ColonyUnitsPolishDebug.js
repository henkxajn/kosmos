// ColonyUnitsPolishDebug — pomocniki konsoli przeglądarki do kontroli kroku CS-10b (dopracowanie jednostek na kuli kolonii).
// Bez argumentów, bez cudzysłowów. Najpierw csUnits() (CS-10) i zbliżenie do modeli.
//
//   csUnitLean()     — przełącza pochylenie modeli ku kamerze: włączone (stała UNIT_POLISH.lean) ↔ wyłączone (prosto na normalnej).
//   csUnitSelect3()  — Ctrl + klik w trzy własne modele na ekranie (ta sama ścieżka co mysz: prostokąty narysowanych jednostek);
//                      wypisuje zaznaczone id — szuflada grupy pokazuje trzy jednostki.
//   csUnitPath()     — rozkaz ruchu dla własnej jednostki (jak csUnitMove) + zaznaczenie jej: trasa z grotem i znacznikiem celu.
//   csBattleWindow() — bitwa przy stolicy (jak csUnitBattle; bez wojny wypowiada ją — R1: bez wojny nie ma bitwy) + okno bitwy
//                      obok strefy inspektora (w grze otwiera je klik w znacznik bitwy).
//   csGroundBattle() — D-CS-31: PRAWDZIWA bitwa do oglądania — wojna z pierwszym imperium (jeśli jej nie ma), 3 nasze jednostki
//                      i 3 wrogie na wolnym polu przy stolicy. Rundy liczy system walki (jedna na rok cywilizacyjny); karta bitwy
//                      otwiera się sama na pierwszej rundzie (ta sama ścieżka co w grze). Odpauzuj albo wołaj csBattleRound().
//   csBattleRound()  — jedna runda wszystkich bitew teraz (publiczny `combatSystem.tick(1)` — ten sam kod walki; tylko skrót czasu,
//                      żeby oglądać kartę przy pauzie).
//
// Importowalne pod node (bez THREE): czyta wyłącznie window.KOSMOS.

import { UNIT_POLISH } from '../renderer/ColonyUnitPolishLogic.js';
import { csUnitMove, csUnitBattle } from './ColonyUnitsDebug.js';
import { tileGraphOf } from '../map/TileGraph.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';

function view() {
  const K = window.KOSMOS, ov = K?.overlayManager?.overlays?.colony;
  const sv = ov?._sphere ?? null, col = ov?._getColony?.() ?? null;
  return { K, ov, sv, col, ok: !!sv?.renderer && col?.grid?.kind === 'geo' };
}
const redraw = (K, sv) => { if (sv?.renderer) sv.renderer._dirty = true; if (K?.uiManager) K.uiManager._dirty = true; };

export function csUnitLean() {
  const v = view();
  if (!v.ok) { console.warn('[csUnitLean] open a sphere colony in the Colonies console first'); return null; }
  const r = v.sv.renderer;
  r.unitLean = (r.unitLean ?? UNIT_POLISH.lean) > 0 ? 0 : UNIT_POLISH.lean;
  redraw(v.K, v.sv);
  console.log('[csUnitLean]', r.unitLean > 0 ? `lean ON (${r.unitLean})` : 'lean OFF (upright on the tile normal)');
  return r.unitLean;
}

export function csUnitSelect3() {
  const v = view();
  if (!v.ok) { console.warn('[csUnitSelect3] open a sphere colony in the Colonies console first'); return null; }
  const gum = v.K.groundUnitManager, boxes = (v.sv.units?._boxes ?? []).filter(b => { const u = gum?.getUnit?.(b.id); return u && (!u.owner || u.owner === 'player'); });
  const seen = new Set(), picks = [];
  for (const b of boxes.sort((a, c) => b.facing - a.facing)) { if (seen.has(b.id)) continue; seen.add(b.id); picks.push(b); if (picks.length === 3) break; }
  if (picks.length < 3) { console.warn('[csUnitSelect3] fewer than 3 own units drawn — run csUnits() and zoom in'); return null; }
  v.ov._clearSelection();
  const grid = v.col.grid;
  for (const b of picks) {
    const x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2;
    v.ov._lastMouseMods = { shift: false, ctrl: true };
    v.ov._sphereClick(v.col, grid, v.ov._screenToTile(x, y, grid), x, y);
  }
  v.ov._lastMouseMods = { shift: false, ctrl: false };
  redraw(v.K, v.sv);
  const ids = [...v.ov._selectedUnits];
  console.log('[csUnitSelect3]', ids.length, 'selected:', ids.join(', '));
  return ids;
}

export function csUnitPath() {
  const v = view();
  if (!v.ok) { console.warn('[csUnitPath] open a sphere colony in the Colonies console first'); return null; }
  const res = csUnitMove();
  if (!res) return null;
  const u = v.K.groundUnitManager.getUnit(res.unit);
  v.ov._selectSingle(u);
  v.ov._selectedHex = { q: u.q, r: u.r };
  redraw(v.K, v.sv);
  console.log('[csUnitPath]', `unit ${u.id}: ${res.steps} steps to tile ${res.to} — path, arrow and destination ring on the sphere`);
  return res;
}

export function csBattleWindow() {
  const v = view();
  if (!v.ok) { console.warn('[csBattleWindow] open a sphere colony in the Colonies console first'); return null; }
  const b = csUnitBattle();
  if (!b) return null;
  const q = b.tile;
  // Bitwa toczy się tylko w wojnie (R1, CombatSystem); nowa gra jej nie ma — pomocnik ją wypowiada (inscenizacja kontroli właściciela).
  const dip = v.K.diplomacySystem;
  if (dip?.relations?.getStatus?.('player', b.empire) !== 'war') { dip?.declareWar?.(b.empire, 'debug_cs10b'); console.log('[csBattleWindow] declared war on', b.empire, '(no war = no battle, rule R1)'); }
  v.ov._cBattle = { planetId: v.col.planetId, q, r: -1 };
  redraw(v.K, v.sv);
  console.log('[csBattleWindow]', `battle window on tile ${q} (click the crossed blades over a contested tile to open it in play)`);
  return q;
}

const GROUND_BATTLE_OWN = ['shock_infantry', 'shock_infantry', 'rocket_artillery'];
const GROUND_BATTLE_FOE = ['shock_infantry', 'shock_infantry', 'shock_infantry'];

/** Wolne pole lądu najbliżej stolicy (bez jednostek na nim i na sąsiednich polach — bitwa nie łączy się z inną). */
export function groundBattleTile(K, col) {
  const g = tileGraphOf(col?.grid);
  if (!g?.topo) return null;
  const gum = K.groundUnitManager, pid = col.planetId;
  const tiles = g.tiles();
  const cap = tiles.find(t => t.capitalBase) ?? tiles.find(t => t.buildingId) ?? g.anyTile();
  const empty = (t) => (gum.getUnitsAtHex?.(pid, t.q, t.r) ?? []).length === 0;
  const land = (t) => !!t && TERRAIN_TYPES[t.type]?.buildable && t.type !== 'ocean';
  return tiles.filter(t => t !== cap && land(t) && t.buildingId == null && empty(t) && g.neighbors(t).every(empty))
    .sort((a, b) => (g.topo.distance(cap.q, a.q) - g.topo.distance(cap.q, b.q)) || (a.q - b.q))[0] ?? null;
}

export function csGroundBattle() {
  const v = view();
  if (!v.ok) { console.warn('[csGroundBattle] open a sphere colony in the Colonies console first'); return null; }
  const K = v.K, gum = K.groundUnitManager;
  const empire = (K.empireRegistry?.listIds?.() ?? []).find(id => id !== 'player') ?? null;
  if (!empire) { console.warn('[csGroundBattle] no other empire in this game'); return null; }
  const t = groundBattleTile(K, v.col);
  if (!t) { console.warn('[csGroundBattle] no free land tile'); return null; }
  const dip = K.diplomacySystem;
  if (dip?.relations?.getStatus?.('player', empire) !== 'war') { dip?.declareWar?.(empire, 'debug_cs10b'); console.log('[csGroundBattle] declared war on', empire, '(no war = no battle, rule R1)'); }
  const own = GROUND_BATTLE_OWN.map(a => gum.createUnit(a, v.col.planetId, t.q, t.r, { factionId: 'humanity', owner: 'player' })).filter(Boolean);
  const foe = GROUND_BATTLE_FOE.map(a => gum.createAIUnit({ archetypeId: a, empireId: empire, planetId: v.col.planetId, q: t.q, r: t.r, morale: 60, deployed: false }))
    .filter(res => res?.ok).map(res => res.unit);
  redraw(K, v.sv);
  const res = { tile: t.q, own: own.length, enemy: foe.length, empire, battle: !!K.combatSystem?.isBattleAt?.(v.col.planetId, t.q, t.r) };
  console.log('[csGroundBattle]', JSON.stringify(res), '— unpause (one round per civ year) or call csBattleRound(); the battle card opens on round 1');
  return res;
}

export function csBattleRound() {
  const K = window.KOSMOS, cs = K?.combatSystem;
  if (!cs?.tick) { console.warn('[csBattleRound] no combat system'); return null; }
  cs.tick(1);   // dokładnie jedna runda każdej bitwy (akumulator lat cywilizacyjnych ≥ 1)
  redraw(K, view().sv);
  const b = view().ov?._cBattle ?? null;
  const rec = b ? K.colonyBattleFeed?.get?.(b.planetId, b.q, b.r) : null;
  const out = rec ? { round: rec.round, ended: rec.ended, winner: rec.winnerId, log: rec.log.length } : { window: 'closed' };
  console.log('[csBattleRound]', JSON.stringify(out));
  return out;
}

export function colonyUnitsPolishDebugHelpers() { return { csUnitLean, csUnitSelect3, csUnitPath, csBattleWindow, csGroundBattle, csBattleRound }; }
