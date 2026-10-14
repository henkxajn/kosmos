// ═══════════════════════════════════════════════════════════════════════════════
// sb4_colony_grid_smoke — KEEPER jednej drogi tworzenia siatki kolonii (AI STRIKES BACK S4/2 — decyzja SB87, Finding 55).
// Rejestr: `docs/design/AI_CAPTURE_PLAN.md` §55, `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: desant AI na kolonię gracza BEZ siatki odmawiał `no_grid` (Finding 55) — siatkę tworzyło okno kolonii przy
//   otwarciu mapy. Zmierzone 2026-10-14: w nowej grze okno kolonii otwiera się samo (dom — przy starcie, nowa kolonia /
//   placówka gracza — przy założeniu), a `createOutpost` sam generuje siatkę; kolonia bez siatki to dziś stan po migracji
//   zapisu v36→v37 (siatka `null`, `_gridFromSave` fałsz). SB87: siatka LENIWIE przy desancie —
//   `ColonyGrid.ensureColonyGrid`, jedna funkcja dla okna kolonii (`ColonyOverlay._getGrid`) i desantu
//   (`InvasionSystem.launchInvasion`, `_landCargo`).
//
// ⚠ Harness: prawdziwy `GameCore`, MOS, OrderService, EnemyAttackHandler (wzór `sb3_hold_return_smoke`); pula i garnizon
//   WYŁĄCZONE (R-B2b). `ColonyOverlay` nie importuje się pod node (THREE) — jego wpięcie pinowane źródłowo (T7).
// ⚠ `ColonyGrid` importowany dynamicznie z `catch` — na kodzie sprzed S4/2 suita degraduje do czerwieni, nie przerywa.
//
// PINY:
//   T1  `ensureColonyGrid`: kolonia bez siatki → siatka = generator mapy planety (te same kafle), `_gridEnsured`, właściciel
//       kafli ('player' / imperium kolonii), `BuildingSystem` (ta sama instancja, wysokość), stolica z rejestru budynków
//       na kaflu (`capitalBase`)
//   T2  siatka istniejąca ZOSTAJE (ta sama instancja, stan kafli — okupacja — nietknięty); KONTROLA T2c: `regenerate` →
//       nowa instancja
//   T3  reguła reużycia okna kolonii: siatka z `ensureColonyGrid` reużywana; KONTROLE: siatka gracza spoza zapisu i spoza
//       tej funkcji — jak dotąd generowana od nowa; brak siatki — generowana
//   T4  desant z liczby (`launchInvasion`) na placówkę gracza bez siatki — ląduje, siatka powstała; KONTROLA T4c: ciało bez
//       kolonii — nadal `no_grid`
//   T5  eskadra (desant z ładunku, `_landCargo`) na placówkę gracza bez siatki — ląduje (rekord `landed`); stan kafli
//       z desantu przeżywa decyzję okna (reużycie)
//   T6  źródło: okno kolonii tworzy siatkę wyłącznie przez `ensureColonyGrid`, `_syncTileBuildings` deleguje; auto-stolica
//       wydzielona i wołana także dla siatki z desantu (nie z zapisu); `InvasionSystem` — obie ścieżki przez
//       `ensureColonyGrid`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';
import { shouldReuseColonyGrid } from '../../ui/ColonyGridResolveLogic.js';
import { readFileSync } from 'node:fs';

const CG = await import('../../utils/ColonyGrid.js').catch(() => null);
const ensureColonyGrid = CG?.ensureColonyGrid ?? (() => null);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  K.orderService = new OrderService();
  K.enemyAttackHandler = new EnemyAttackHandler();
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  if (K.fleetPoolSystem) K.fleetPoolSystem.enabled = false;
  const emp = K.empireRegistry.listAll()[0].id;
  const cap = K.directorProduction.capitalOf(emp);
  const w = { core, K, vm: K.vesselManager, gum: K.groundUnitManager, inv: K.invasionSystem, sq: K.strikeSquadronSystem,
              emp, cap, home: K.homePlanet, ev: [] };
  for (const n of ['invasion:blocked', 'invasion:troopsLanded', 'battle:resolved']) EventBus.on(n, (d) => w.ev.push({ n, d }));
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
const war = (w) => quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
/**
 * Placówka GRACZA bez siatki, w układzie domu. Produkcyjne `createOutpost` SAMO generuje siatkę (`ColonyManager.js` —
 * zmierzone 2026-10-14), a okno kolonii otwiera się przy założeniu kolonii gracza; kolonia bez siatki to dziś stan po
 * migracji zapisu v36→v37 (`SaveMigration._migrateV36toV37`: siatka `null`) — scena odtwarza go tak samo (siatka zdjęta).
 */
function playerOutpost(w) {
  const sys = w.home.systemId;
  const bodies = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? []);
  const body = bodies.find(b => b.id !== w.home.id && !w.K.colonyManager.getColony(b.id));
  if (!body) return null;
  quiet(() => w.K.colonyManager.createOutpost(body.id, {}, Math.floor(w.K.timeSystem.gameTime ?? 0)));
  const col = w.K.colonyManager.getColony(body.id);
  if (col) {
    col.grid = null;                                       // jak `_migrateV36toV37` (siatka z zapisu → null)
    if (col.buildingSystem) col.buildingSystem._grid = null;
  }
  return col;
}
function escorts(w, n = 2) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap.planetId }).vessel);
}
function jump(w, members) {
  const T = Math.max(...members.filter(Boolean).map(v => v.mission?.type === 'interstellar_jump' ? (v.mission.arrivalYear ?? 0) : 0));
  w.K.timeSystem.gameTime = Math.max(w.K.timeSystem.gameTime ?? 0, T) + 0.001;
  w.vm._updatePositions(0.01);
}
function approach(w, members) {
  const T = Math.max(...members.filter(Boolean).map(v => v.mission?.arrivalYear ?? 0));
  w.K.timeSystem.gameTime = Math.max(w.K.timeSystem.gameTime ?? 0, T) + 0.001;
  w.vm._updatePositions(0.01);
}
function battle(w, planetId) {
  const p = w.K.enemyAttackHandler._pendingBattles.get(planetId);
  if (p?.timerId) clearTimeout(p.timerId);
  quiet(() => w.K.enemyAttackHandler._resolveBatchedBattle(planetId));
}
const sameTiles = (a, b) => {
  const ta = a?.toArray?.() ?? [], tb = b?.toArray?.() ?? [];
  return ta.length > 0 && ta.length === tb.length && ta.every((t, i) => t?.q === tb[i]?.q && t?.r === tb[i]?.r && t?.type === tb[i]?.type);
};

// ═══ T1 — utworzenie siatki ═══════════════════════════════════════════════════
header('T1  ensureColonyGrid — kolonia bez siatki');
{
  const w = boot();
  const col = playerOutpost(w);
  const before = col?.grid ?? null;
  const g = quiet(() => ensureColonyGrid(col));
  const ref = PlanetMapGenerator.generate(col.planet, false);
  const owners = new Set((g?.toArray?.() ?? []).filter(Boolean).map(t => t.owner));
  console.log(`     przed: ${before ? 'siatka' : 'brak'} · po: ${g ? g.toArray().length + ' kafli' : 'brak'} · właściciele [${[...owners].join(',')}]`);
  assert(!!col && before === null, 'T1-0 warunek sceny: placówka gracza bez siatki (stan po migracji v36→v37 — Finding 55)');
  assert(!!g && col.grid === g && col._gridEnsured === true, 'T1a siatka na kolonii, znacznik `_gridEnsured`');
  assert(sameTiles(g, ref), 'T1b te same kafle co generator mapy planety (deterministycznie)');
  assert(owners.size === 1 && owners.has('player'), 'T1c właściciel kafli bez właściciela — gracz');
  assert(col.buildingSystem?._grid === g && col.buildingSystem?._gridHeight === (g?.height ?? -1), 'T1d `BuildingSystem` — ta sama instancja siatki i wysokość');
}
{
  const w = boot();
  const col = w.K.colonyManager.getColony(w.cap.planetId);
  const bSys = col.buildingSystem;
  const capKey = [...(bSys?._active?.keys?.() ?? [])].find(k => k.startsWith('capital_'));
  const old = col.grid;
  col.grid = null;
  const g = quiet(() => ensureColonyGrid(col));
  const [q, r] = (capKey ?? 'capital_0,0').slice(8).split(',').map(Number);
  const owners = new Set((g?.toArray?.() ?? []).filter(Boolean).map(t => t.owner));
  col.grid = old; if (bSys) bSys._grid = old;
  assert(!!capKey && g?.get?.(q, r)?.capitalBase === true, 'T1e stolica z rejestru budynków kolonii na kaflu (`capitalBase`)');
  assert(owners.size === 1 && owners.has(w.emp), 'T1f kolonia imperium — właściciel kafli = imperium');
}

// ═══ T2 — siatka istniejąca zostaje ═══════════════════════════════════════════
header('T2  siatka istniejąca zostaje (stan kafli nietknięty)');
{
  const w = boot();
  const col = playerOutpost(w);
  const g1 = quiet(() => ensureColonyGrid(col));
  const tile = g1?.toArray?.().find(t => t && t.type !== 'ocean');
  if (tile) tile.owner = w.emp;                                  // okupacja kafla przez desant
  const g2 = quiet(() => ensureColonyGrid(col));
  assert(!!g1 && g2 === g1, 'T2a drugie wywołanie — ta sama instancja');
  assert(!!tile && tile.owner === w.emp, 'T2b stan kafla (okupacja) nietknięty');
  const g3 = quiet(() => ensureColonyGrid(col, { regenerate: true }));
  assert(!!g3 && g3 !== g1 && col.grid === g3, 'T2c KONTROLA: `regenerate` — nowa instancja (wołający okna kolonii)');
}

// ═══ T3 — reguła reużycia okna kolonii ════════════════════════════════════════
header('T3  okno kolonii reużywa siatkę z ensureColonyGrid');
{
  const w = boot();
  const col = playerOutpost(w);
  quiet(() => ensureColonyGrid(col));
  assert(shouldReuseColonyGrid(col, false) === true, 'T3a siatka z `ensureColonyGrid` — reużyta (okno nie generuje od nowa)');
  const plain = { grid: PlanetMapGenerator.generate(col.planet, false) };
  assert(shouldReuseColonyGrid(plain, false) === false, 'T3b KONTROLA: siatka gracza spoza zapisu i spoza `ensureColonyGrid` — jak dotąd generowana od nowa');
  assert(shouldReuseColonyGrid({ grid: null }, false) === false && shouldReuseColonyGrid({ grid: plain.grid, _gridFromSave: true }, false) === true,
    'T3c KONTROLA: brak siatki — generowana; siatka z zapisu — reużyta (bez zmian)');
}

// ═══ T4 — desant z liczby ═════════════════════════════════════════════════════
header('T4  launchInvasion na placówkę bez siatki');
{
  const w = boot();
  const col = playerOutpost(w);
  war(w);
  const r = quiet(() => w.inv.launchInvasion(w.emp, col.planetId, 2));
  console.log(`     wynik: ${r?.success ? 'wylądowało ' + r.landed.length : r?.reason} · siatka ${col.grid ? 'jest' : 'brak'}`);
  assert(r?.success === true && (r.landed ?? []).length === 2, 'T4a desant ląduje (bez `no_grid`)');
  assert(!!col.grid && col._gridEnsured === true, 'T4b siatka powstała przy desancie (`ensureColonyGrid`)');
}
{
  const w = boot();
  war(w);
  const sys = w.home.systemId;
  const body = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? []).find(b => !w.K.colonyManager.getColony(b.id));
  const r = quiet(() => w.inv.launchInvasion(w.emp, body?.id, 2));
  assert(!!body && r?.success === false && r.reason === 'no_grid', 'T4c KONTROLA: ciało bez kolonii — nadal `no_grid`');
}

// ═══ T5 — eskadra (desant z ładunku) ══════════════════════════════════════════
header('T5  eskadra na placówkę bez siatki — desant z ładunku');
{
  const w = boot();
  const col = playerOutpost(w);
  war(w);
  const es = escorts(w);
  const r = w.sq?.launchSquadron?.(w.emp, col.planetId, es.map(v => v.id)) ?? null;
  const tr = r?.transportId ? w.vm.getVessel(r.transportId) : null;
  jump(w, [...es, tr]);
  approach(w, [...es, tr]);
  battle(w, col.planetId);
  const s = w.sq?.getSquadron?.(r?.squadronId);
  const blocked = evs(w, 'invasion:blocked').map(b => b.reason);
  console.log(`     eskadra ${r?.ok ? r.squadronId : r?.reason} · bitwa ${evs(w, 'battle:resolved').map(b => b.result?.winner).join(',')} · etap ${s?.stage} · odmowy [${blocked.join(',')}]`);
  assert(r?.ok === true && evs(w, 'battle:resolved').some(b => b.result?.winner === 'A'), 'T5-0 warunek sceny: eskadra wysłana, orbita wygrana');
  assert(s?.stage === 'landed' && (s.landedUnitIds ?? []).length > 0 && !blocked.includes('no_grid'), 'T5a desant z ładunku ląduje (rekord `landed`, bez `no_grid`)');
  const tile = col.grid?.toArray?.().find(t => t && t.type !== 'ocean');
  if (tile) tile.owner = w.emp;
  assert(!!tile && shouldReuseColonyGrid(col, false) === true && col.grid?.toArray?.().includes(tile),
    'T5b stan kafli z desantu przeżywa decyzję okna kolonii (siatka reużyta, nie generowana od nowa)');
}

// ═══ T6 — źródło ══════════════════════════════════════════════════════════════
header('T6  źródło — jedna droga tworzenia siatki');
{
  const co = src('../../ui/ColonyOverlay.js');
  const at = co.indexOf('_getGrid(colony) {');
  const body = at >= 0 ? co.slice(at, co.indexOf('_findBestTileForCapital(grid) {', at)) : '';
  const gen = body.indexOf('ensureColonyGrid(colony, { regenerate: true');
  assert(gen > 0 && !/PlanetMapGenerator\.generate\(colony\.planet, isHome\)/.test(body),
    'T6a okno kolonii: gałąź generowania przez `ensureColonyGrid` (generator wołany wprost wyłącznie w podglądzie)');
  assert(/_syncTileBuildings\(grid, bSys\) \{\s*syncTileBuildings\(grid, bSys\);\s*\}/.test(co), 'T6b `_syncTileBuildings` deleguje do `syncTileBuildings`');
  assert(/if \(colony\._gridEnsured && !colony\._gridFromSave\) \{\s*const again = this\._autoPlaceCapital\(/.test(body)
    && /_autoPlaceCapital\(colony, grid, bSys, isHostileColony\) \{/.test(co),
    'T6c auto-stolica wydzielona i wołana także dla siatki z desantu (nie z zapisu)');
  const inv = src('../../systems/InvasionSystem.js');
  assert((inv.match(/ensureColonyGrid\(colony\)/g) ?? []).length === 2 && !/const grid = colony\?\.grid;\s*if \(!grid\) return \{ success: false, reason: 'no_grid' \}/.test(inv),
    'T6d `InvasionSystem`: `launchInvasion` i `_landCargo` — siatka przez `ensureColonyGrid`');
}

console.log(`\n═══ sb4_colony_grid_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
