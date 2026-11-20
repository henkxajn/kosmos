// ARC COLONY SPHERE CS-8 — keeper konsoli Kolonii (ColonyConsoleLogic + BuildingSystem: koszt / uzysk / kolejność zamówień +
// przepływ budowy w obu trybach + Findings 740, 780, 785, 788). Plan: docs/design/COLONY_SPHERE_PLAN.md §3.16.
//
//   K1  logika konsoli (czysta): bramka konsoli, stan inspektora wg zaznaczenia, lista kolonii, karta planety, wiersze budowy,
//       kolejka, czipy nagłówka i soczewek, portrety (PNG / znak kategorii), rozkazy i transport jednostki, placówka (740)
//   K2  gra headless na kuli (flaga ON) i na mapie płaskiej (kontrola): koszt pokazany == pobrany w KAŻDYM pasie szerokości (780),
//       ulepszenie pokazane == pobrane, werdykty obu trybów budowy == stara ścieżka, budowa oboma trybami = ten sam stan,
//       kolejka (anuluj, kolejność, zapis w kolejności), spodziewany uzysk pola
//   K3  piny źródła: konsola tylko za flagą i tylko dla siatki geo, bez małego globusa, bez emoji w gnieździe portretu, strefy
//       konsoli za bramką własności, Finding 785 (podgląd przez fabrykę siatek), Finding 788 (kolejność założenia kolonii)
//   K4  flaga OFF: fabryka siatek = dzisiejszy generator (podgląd bit w bit), konsola nieaktywna
//
// Importy nowych modułów dynamiczne — na bazie (przed CS-8) piny degradują do FAIL, nie przerywają.

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as TG from '../../map/TileGraph.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { return null; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (rel) => { try { return readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const quiet = (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const L = (await tryImport('../../ui/ColonyConsoleLogic.js')) ?? {};
const VIEW = (await tryImport('../../ui/ColonySphereView.js')) ?? {};
const GUARD = await import('../../ui/ColonyOrderGuard.js');
const { BUILDINGS } = await import('../../data/BuildingsData.js');
const { TERRAIN_TYPES, evaluatePlacement } = await import('../../map/HexTile.js');
const { computeBuildResourceCost } = await import('../../data/EnvironmentCost.js');
const { PlanetMapGenerator } = await import('../../map/PlanetMapGenerator.js');
const FACTORY = await import('../../map/ColonyGridFactory.js');
const SYNC = await import('../../utils/ColonyGrid.js');
const missing = (names) => names.filter((n) => typeof L[n] === 'undefined');

// ── K1 logika ────────────────────────────────────────────────────────────────
console.log('\nK1 console logic (pure)');
const need = ['colonyConsoleActive', 'inspectorStateOf', 'colonyListRows', 'planetCardRows', 'tileStatsOf', 'tileBuildRows', 'queueRows',
  'headerChips', 'lensAfterChip', 'portraitSpecOf', 'categoryGlyphOf', 'unitOrdersOf', 'troopTransportRows', 'shouldActivateFoundedOutpost', 'missingOf'];
if (missing(need).length) {
  for (const n of ['K1a', 'K1b', 'K1c', 'K1d', 'K1e', 'K1f', 'K1g', 'K1h', 'K1i', 'K1j', 'K1k']) assert(false, `${n} ColonyConsoleLogic missing: ${missing(need).join(', ')}`);
} else {
  // K1a — bramka konsoli
  const A = L.colonyConsoleActive;
  GAME_CONFIG.FEATURES.colonySphere = false;
  const geoOff = A({ kind: 'geo' });
  GAME_CONFIG.FEATURES.colonySphere = true;
  const geoOn = A({ kind: 'geo' }), flatOn = A({ kind: 'flat' });
  GAME_CONFIG.FEATURES.colonySphere = false;
  assert(geoOff === true && geoOn === true && flatOn === false && A({ kind: 'flat' }) === false && A({}) === false && A(null) === false && A(undefined) === false
    && A({ colonySphere: true }) === false,
  'K1a console for EVERY geo grid whatever the flag says (a saved sphere colony after F5 keeps the console); flat grid / no grid → today\'s screen');

  // K1b — stan inspektora wg zaznaczenia
  const I = L.inspectorStateOf;
  const free = { type: 'plains' }, built = { buildingId: 'farm' }, uc = { underConstruction: { buildingId: 'farm' } }, pend = { pendingBuild: 'farm' };
  const cap = { capitalBase: true }, capBuilt = { capitalBase: true, buildingId: 'farm' }, unit = { id: 'u1' };
  assert(I({}).kind === 'summary' && I({ tile: free }).kind === 'tile' && I({ tile: free }).canBuild === true && I({ tile: built }).kind === 'building'
    && I({ tile: uc }).kind === 'construction' && I({ tile: pend }).kind === 'pending' && I({ unit }).kind === 'unit' && I({ station: true }).kind === 'station',
  'K1b inspector state per selection: nothing → summary, free tile → tile, building / construction / pending, unit, station view');
  assert(I({ unit, tile: built }).kind === 'unit' && I({ unit, unitCount: 3 }).multi === true && I({ unit, unitCount: 1 }).multi === false
    && I({ station: true, tile: free }).kind === 'tile' && I({ station: true, unit }).kind === 'unit'
    && I({ buildMode: true, unit, tile: built, station: true }).kind === 'palette',
  'K1c priority: build mode → unit → tile → station → summary (a selection always changes the inspector)');
  assert(I({ tile: cap }).kind === 'tile' && I({ tile: cap }).capital === true && I({ tile: capBuilt }).kind === 'building' && I({ tile: capBuilt }).capital === true
    && I({ tile: free, preview: true }).canBuild === false && I({ buildMode: true, preview: true }).kind === 'summary' && I({ station: true, preview: true }).kind === 'summary',
  'K1d capital tile keeps the tile state (virtual capital, tile free); preview = read only (no build list, no palette, no station)');

  // K1e — lista kolonii
  const cols = [
    { planetId: 'a', planet: { name: 'Alfa', systemId: 's1' }, civSystem: { humans: 12.7 } },
    { planetId: 'o1', planet: { name: 'Out1', systemId: 's1' }, isOutpost: true },
    { planetId: 'b', planet: { name: 'Beta', systemId: 's1' }, civSystem: { population: 4 } },
    { planetId: 'c', planet: { name: 'Gamma', systemId: 's2' }, civSystem: { humans: 2 } },
  ];
  const rows = L.colonyListRows(cols, { viewedId: 'b', activeId: 'a', systemNameOf: (s) => (s === 's1' ? 'Sol' : null) });
  const ids = rows.filter((r) => !r.group).map((r) => r.id);
  const one = L.colonyListRows(cols.slice(0, 3), { viewedId: 'a' });
  assert(same(ids, ['a', 'b', 'o1', 'c']) && rows.filter((r) => r.group).length === 2 && rows[0].group && rows[0].label === 'Sol' && rows[4].label === 's2'
    && rows.find((r) => r.id === 'o1').kind === 'outpost' && rows.find((r) => r.id === 'o1').pop === null && rows.find((r) => r.id === 'a').pop === 12
    && rows.find((r) => r.id === 'b').viewed && rows.find((r) => r.id === 'a').active && !rows.find((r) => r.id === 'a').viewed
    && one.every((r) => !r.group) && one.length === 3,
  'K1e list rows: all player colonies and outposts, colonies before outposts per system, group headers only with more than one system');

  // K1f — karta planety i statystyka pól
  const card = L.planetCardRows({ temperatureC: -12.4, surfaceGravity: 1.234, atmosphere: 'thin', physics: { mass: 2 }, surfaceRadius: 1.5 },
    { temperature: { bandKey: 'band.cold', effects: [{ key: 'e.x', tone: 'gate' }] }, gravity: { bandKey: null, effects: [] }, atmosphere: { effects: [] }, water: { hasWater: true, effects: [] } });
  const byId = Object.fromEntries(card.map((r) => [r.id, r]));
  const st = L.tileStatsOf([{ type: 'plains' }, { type: 'ocean' }, { type: 'plains', buildingId: 'farm' }, { type: 'mountains', capitalBase: true }, { type: 'plains', pendingBuild: 'x' }, null]);
  assert(['temperature', 'gravity', 'atmosphere', 'water', 'mass', 'radius'].every((k) => !!byId[k]) && byId.temperature.value === '-12 °C' && byId.temperature.bandKey === 'band.cold'
    && byId.temperature.effects.length === 1 && byId.gravity.value === '1.23 g' && byId.atmosphere.valueKey === 'colonyInfo.atm.thin' && byId.water.valueKey === 'colonyInfo.waterYes'
    && L.planetCardRows(null).length === 0 && L.planetCardRows({ temperatureC: 15 })[0].value === '+15 °C'
    && st.total === 5 && st.buildable === 4 && st.used === 3,
  'K1f planet card: temperature, gravity, atmosphere, water, mass, radius with band + effect lines; tile stats (total / buildable / used)');

  // K1g — wiersze budowy
  const haveOf = (k) => ({ Fe: 15, Si: 5 }[k] ?? 0);   // Fe dokładnie na styk kosztu farmy (15) — „mam tyle, ile trzeba" to nie brak
  const br = L.tileBuildRows({
    entries: [{ id: 'farm', locked: false }, { id: 'mine', locked: false }, { id: 'well', locked: true, reason: 'ui.requiresWater' }, { id: 'no_such_building' }],
    costOf: (id) => (id === 'farm' ? { Fe: 15 } : id === 'mine' ? { Fe: 30, Si: 9 } : { Fe: 1 }), haveOf,
  });
  const fr = L.tileBuildRows({ entries: [{ id: 'farm' }], costOf: () => ({ Fe: 1 }), haveOf, ordersOk: false })[0];
  assert(br.length === 3 && br[0].state === 'ok' && br[0].enabled && br[0].missing.length === 0 && same(br[0].cost, { Fe: 15 })
    && br[1].state === 'queue' && br[1].enabled && same(br[1].missing.map((m) => [m.key, m.short]), [['Fe', 15], ['Si', 4]])
    && br[2].state === 'locked' && !br[2].enabled && br[2].reasonKey === 'ui.requiresWater'
    && fr.state === 'foreign' && !fr.enabled && fr.reasonKey === 'colonyConsole.reason.foreign',
  'K1g build rows: ok / queue (missing amounts, still clickable) / locked with the gate\'s reason / foreign colony — every disabled row carries a reason');

  // K1h — kolejka
  const q = L.queueRows({
    construction: new Map([['g5', { buildingId: 'farm', progress: 0.5, buildTime: 2 }], ['g9', { buildingId: 'mine', progress: 3, buildTime: 2, isUpgrade: true, targetLevel: 3 }]]),
    pending: new Map([['g1', { buildingId: 'well', cost: { Fe: 3 } }], ['g2', { buildingId: 'farm', cost: {} }], ['g3', { buildingId: 'mine', cost: {} }]]),
  });
  assert(same(q.map((r) => r.id), ['c:g5', 'c:g9', 'p:g1', 'p:g2', 'p:g3']) && q[0].frac === 0.25 && q[0].yearsLeft === 1.5 && q[1].frac === 1 && q[1].isUpgrade && q[1].targetLevel === 3
    && !q[0].canEarlier && !q[0].canLater && !q[2].canEarlier && q[2].canLater && q[3].canEarlier && q[3].canLater && q[4].canEarlier && !q[4].canLater
    && L.queueRows({}).length === 0 && same(q[2].cost, { Fe: 3 }),
  'K1h queue rows: constructions first (parallel — no reorder), pending orders in payment order with earlier / later only where a move exists');

  // K1i — nagłówek i soczewki
  const h = L.headerChips({ lens: 'deposits', supply: false, buildMode: true, station: false, stationAvailable: false, canBuild: true });
  const h2 = L.headerChips({ lens: 'deposits', supply: true, canBuild: false, station: true });
  const LA = L.lensAfterChip;
  assert(same(h.lens.map((c) => c.id), ['lens:terrain', 'lens:deposits', 'lens:ownership', 'lens:supply']) && h.lens.filter((c) => c.active).length === 1 && h.lens[1].active
    && h.view[0].active && !h.view[1].enabled && !!h.view[1].reasonKey && h.build[0].active && h.build[0].enabled
    && h2.lens.filter((c) => c.active).map((c) => c.id).join() === 'lens:supply' && !h2.build[0].enabled && !!h2.build[0].reasonKey && h2.view[1].active
    && same(LA({ lens: 'none', supply: false }, 'terrain'), { lens: 'terrain', supply: false }) && same(LA({ lens: 'terrain', supply: false }, 'terrain'), { lens: 'none', supply: false })
    && same(LA({ lens: 'terrain', supply: false }, 'supply'), { lens: 'none', supply: true }) && same(LA({ lens: 'none', supply: true }, 'supply'), { lens: 'none', supply: false })
    && same(LA({ lens: 'none', supply: true }, 'ownership'), { lens: 'ownership', supply: false }) && same(LA({ lens: 'deposits', supply: false }, 'bogus'), { lens: 'deposits', supply: false }),
  'K1i header chips: four lens chips (one active), station / build chips disabled with a reason; lens clicks toggle, supply and lens exclude each other');

  // K1j — portret: PNG albo znak kategorii; stolica = budynek-stolica; każda kategoria z danych ma znak
  const cats = [...new Set(Object.values(BUILDINGS).map((b) => b.category).filter(Boolean))];
  const glyphOk = (g) => Array.isArray(g) && g.length > 0 && g.every((line) => line.length >= 2 && line.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
  const P = L.portraitSpecOf;
  assert(same(P('farm', () => true), { kind: 'png', id: 'farm' }) && same(P('farm', () => false), { kind: 'category', category: BUILDINGS.farm.category })
    && P(null, () => true).kind === 'category' && P('no_such', () => true).kind === 'category'
    && BUILDINGS[L.CAPITAL_BUILDING_ID]?.isCapital === true
    && cats.length >= 8 && cats.every((c) => !!L.CATEGORY_GLYPHS[c] && glyphOk(L.CATEGORY_GLYPHS[c])) && L.categoryGlyphOf('zzz') === L.CATEGORY_GLYPHS.civil
    && new Set(cats.map((c) => JSON.stringify(L.CATEGORY_GLYPHS[c]))).size === cats.length,
  `K1j portrait slot: PNG when the asset exists, else a category glyph (all ${cats.length} building categories have their own glyph); capital = the capital building`);

  // K1k — rozkazy i transport jednostki, placówka (740)
  const O = (u, c) => L.unitOrdersOf(u, c).map((o) => `${o.type}:${o.enabled ? 1 : 0}`);
  const reasonOf = (u, c, type) => L.unitOrdersOf(u, c).find((o) => o.type === type)?.reasonKey ?? null;
  const T = L.troopTransportRows;
  const S = L.shouldActivateFoundedOutpost;
  assert(same(O({ status: 'idle' }, {}), ['unitSurvey:1', 'drawerOpenUnit:1', 'unitDeselect:1'])
    && same(O({ status: 'moving', deployState: 'mobile' }, { canAnalyze: true }), ['unitDeploy:0', 'unitSurvey:0', 'unitAnalyze:0', 'drawerOpenUnit:1', 'unitDeselect:1'])
    && !!reasonOf({ status: 'moving', deployState: 'mobile' }, {}, 'unitDeploy') && !!reasonOf({ status: 'moving' }, {}, 'unitSurvey')
    && same(O({ status: 'idle', deployState: 'deployed', org: 5 }, {}).slice(0, 1), ['unitPackUp:0']) && same(O({ status: 'idle', deployState: 'deployed', org: 20 }, {}).slice(0, 1), ['unitPackUp:1'])
    && same(O({ status: 'idle', deployState: 'deploying' }, {}).slice(0, 1), ['unitCancelDeploy:1'])
    && same(O({ status: 'idle', range: 3 }, { hasCombatSystem: true, hasSupportCandidates: false }).slice(0, 1), ['unitSupportStart:0'])
    && same(O({ status: 'idle', range: 3, supportTarget: { q: 1, r: -1 } }, { hasCombatSystem: true }).slice(0, 1), ['unitClearSupport:1'])
    && same(O({ status: 'idle', range: 3 }, { hasCombatSystem: true, inCombat: true }).slice(0, 1), ['unitSurvey:1'])
    && same(O({ status: 'idle', deployState: 'mobile', range: 3 }, { isEnemy: true, hasCombatSystem: true }), ['drawerOpenUnit:1', 'unitDeselect:1']),
  'K1k unit orders: today\'s unit* hit types; an unavailable order stays listed as disabled with a reason; a foreign unit gets no orders');
  const tr = T([{ id: 'v1', name: 'Transport', troopCapacity: 4, troopBayUsed: 1 }, { id: 'v2', troopCapacity: 0 }, { id: 'v3', troopCapacity: 2, ownerEmpireId: 'emp' }]);
  assert(tr.length === 1 && tr[0].id === 'v1' && tr[0].enabled && tr[0].used === 1 && tr[0].capacity === 4
    && T([]).length === 1 && !T([])[0].enabled && !!T([])[0].reasonKey && T([{ id: 'v2', troopCapacity: 0 }])[0].enabled === false,
  'K1l transport rows: own docked ships with a troop bay; none → one disabled row with a reason');
  assert(S({ colonySphere: false }, { isOutpost: false }) === true && S({}, null) === true
    && S({ colonySphere: true }, { isOutpost: false }) === false && S({ colonySphere: true }, {}) === false
    && S({ colonySphere: true }, { isOutpost: true }) === true && S({ colonySphere: true }, null) === true,
  'K1m Finding 740: with the flag a founded outpost does not take the active colony unless the player has no active full colony; flag OFF as today');
}

// ── K2 gra headless ──────────────────────────────────────────────────────────
console.log('\nK2 headless game: cost shown == charged, both build modes, queue');
const { GameCore } = await import('../headless/GameCore.js');
const { default: EventBus } = await import('../../core/EventBus.js');
const RICH = { Fe: 5000, Si: 5000, Cu: 5000, C: 5000, Ti: 5000, Al: 5000 };
const BAND_NAMES = ['equatorial', 'subpolar', 'polar'];

function bootGame(flagOn) {
  GAME_CONFIG.FEATURES.colonySphere = flagOn;
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization', galaxySeed: 20261120 }));
  const K = window.KOSMOS, colony = K.colonyManager.getColony(K.homePlanet.id);
  const grid = colony.grid, graph = TG.tileGraphOf(grid), bSys = colony.buildingSystem, rs = colony.resourceSystem;
  const store = K.systemPoolService?.getStore?.(rs) ?? rs;
  const have = (k) => store.getAmount?.(k) ?? store.inventory?.get?.(k) ?? 0;
  return { K, colony, grid, graph, bSys, rs, store, have, planet: colony.planet };
}
const freeOk = (g, b, band = null) => g.graph.tiles().find((t) => !t.capitalBase && !t.buildingId && !t.underConstruction && !t.pendingBuild
  && evaluatePlacement(t, b, { techSystem: g.K.techSystem, planet: g.planet }).ok && (band == null || g.graph.latitudeBand(t) === band));

// K2a/b — koszt pokazany == pobrany w każdym pasie (780) + kontrola na mapie płaskiej
function costRun(flagOn) {
  const g = bootGame(flagOn);
  const out = { kind: g.grid.kind ?? 'flat', bands: [], preview: typeof g.bSys.previewBuildCost === 'function' };
  if (!out.preview) return out;
  const b = BUILDINGS.solar_farm;
  for (const band of [0, 1, 2]) {
    const tile = freeOk(g, b, band);
    if (!tile) { out.bands.push({ band, tile: null }); continue; }
    const shown = g.bSys.previewBuildCost(tile, b.id);
    quiet(() => { g.rs.receive(RICH); g.rs.receive(Object.fromEntries(Object.keys(shown).map((k) => [k, shown[k] * 3]))); });   // surowce i towary kosztu
    const flatPanel = computeBuildResourceCost(b, g.planet);   // liczba dzisiejszego panelu (bez pasa szerokości)
    const before = Object.fromEntries(Object.keys(shown).map((k) => [k, g.have(k)]));
    quiet(() => EventBus.emit('planet:buildRequest', { tile, buildingId: b.id }));
    const charged = Object.fromEntries(Object.keys(shown).map((k) => [k, before[k] - g.have(k)]));
    out.bands.push({ band, tile: g.graph.idOf(tile), shown, charged, started: !!(tile.underConstruction || tile.buildingId), pending: !!tile.pendingBuild,
      keys: Object.keys(shown).length, differsFromOldPanel: Object.keys(flatPanel).some((k) => flatPanel[k] !== shown[k]) });
  }
  return out;
}
let geoCost = null, flatCost = null, err = null;
try { geoCost = costRun(true); flatCost = costRun(false); } catch (e) { err = e; }
if (!geoCost || !flatCost || !geoCost.preview) {
  for (const n of ['K2a', 'K2b']) assert(false, `${n} cost run failed: ${err?.message ?? 'previewBuildCost missing'}`);
} else {
  const okBand = (r) => !!r.tile && r.keys > 0 && r.started && !r.pending && same(r.shown, r.charged);
  const g = geoCost.bands, f = flatCost.bands;
  assert(geoCost.kind === 'geo' && g.length === 3 && g.every(okBand),
    `K2a sphere: previewBuildCost == amount charged by planet:buildRequest in every latitude band (${g.map((r) => `${BAND_NAMES[r.band]} ${JSON.stringify(r.shown ?? null)}`).join(' · ')})`);
  assert(!g[0].differsFromOldPanel && g[1].differsFromOldPanel && g[2].differsFromOldPanel && g[2].shown && g[0].shown
    && Object.keys(g[0].shown).some((k) => g[2].shown[k] > g[0].shown[k])
    && flatCost.kind === 'flat' && f.filter((r) => r.tile).length >= 2 && f.filter((r) => r.tile).every(okBand),
  'K2b Finding 780 witness: outside the equatorial band the real cost differs from the old panel number (polar > equatorial); flat control: shown == charged too');
}

// K2c — ulepszenie pokazane == pobrane; K2d — spodziewany uzysk pola
let up = null, upErr = null;
try {
  const g = bootGame(true);
  const key = [...g.bSys._active.keys()].find((k) => !TG.isCapitalKey(k) && (g.bSys._active.get(k).building?.cost) && Object.keys(g.bSys._active.get(k).building.cost).length);
  const tile = key ? g.graph.tile(key) : null;
  quiet(() => g.rs.receive(RICH));
  const pv = key ? g.bSys.previewUpgradeCost?.(key) : null;
  const before = pv ? Object.fromEntries(Object.keys(pv.cost).map((k) => [k, g.have(k)])) : null;
  const lv0 = tile?.buildingLevel ?? 1;
  quiet(() => { if (tile && pv) EventBus.emit('planet:upgradeRequest', { tile }); });
  const charged = pv ? Object.fromEntries(Object.keys(pv.cost).map((k) => [k, before[k] - g.have(k)])) : null;
  const farm = BUILDINGS.farm, mine = BUILDINGS.mine;
  const ft = freeOk(g, farm), mt = freeOk(g, mine);
  const fy = ft ? g.bSys.previewTileYield?.(ft, 'farm') : null;
  const base = ft ? g.bSys._calcBaseRates(farm, ft, 1) : null;
  const my = mt ? g.bSys.previewTileYield?.(mt, 'mine') : null;
  up = { pv, charged, started: !!(tile?.underConstruction || (tile?.buildingLevel ?? 1) > lv0), next: pv?.nextLevel, lv0, fy, base, my, noBuilding: g.bSys.previewUpgradeCost?.('g99999') ?? null };
} catch (e) { upErr = e; }
if (!up || !up.pv) { for (const n of ['K2c', 'K2d']) assert(false, `${n} upgrade / yield run failed: ${upErr?.message ?? 'previewUpgradeCost missing'}`); } else {
  assert(Object.keys(up.pv.cost).length > 0 && same(up.pv.cost, up.charged) && up.started && up.next === up.lv0 + 1 && up.noBuilding === null,
    `K2c upgrade: previewUpgradeCost == amount charged by planet:upgradeRequest (${JSON.stringify(up.pv.cost)}), null without a building`);
  const fk = up.fy?.key;
  assert(!!up.fy && fk != null && up.fy.value === up.base[fk] && Math.abs(up.fy.mult - up.base[fk] / BUILDINGS.farm.rates[fk]) < 1e-12 && up.fy.value > 0
    && !!up.my && up.my.key === null && up.my.mult === null,
  `K2d expected yield of a tile = base rates of the tile (${fk} ${up.fy?.value}); a mine has no tile yield (deposits belong to the body)`);
}

// K2e — werdykty obu trybów == stara ścieżka (wszystkie pola × wybrane budynki) + wykonanie
let ver = null, verErr = null;
try {
  const g = bootGame(true);
  const ids = ['solar_farm', 'farm', 'mine', 'habitat', 'well', 'research_station'].filter((id) => BUILDINGS[id]);
  const ctx = { techSystem: g.K.techSystem, planet: g.planet };
  let cells = 0, okCells = 0, blocked = 0, occupied = 0, mismatch = 0;
  for (const id of ids) {
    const b = BUILDINGS[id];
    for (const t of g.graph.tiles()) {
      cells++;
      const occ = !!(t.buildingId || t.underConstruction || t.pendingBuild);
      const palette = VIEW.buildVerdictFor ? VIEW.buildVerdictFor(t, b, ctx) : null;        // tryb „budynek → pola" (podświetlenie + klik)
      const tileList = evaluatePlacement(t, b, ctx).ok;                                      // tryb „pole → budynek" (bramka listy pola)
      const oldPath = g.bSys._canBuildOnTile(t, b);                                          // stara ścieżka (BuildingSystem)
      const expect = occ ? 'occupied' : (oldPath ? 'ok' : 'blocked');
      if (palette !== expect || tileList !== oldPath) mismatch++;
      if (palette === 'ok') okCells++; else if (palette === 'blocked') blocked++; else if (palette === 'occupied') occupied++;
    }
  }
  // wykonanie: pole z werdyktem ok / blocked przez planet:buildRequest
  const b = BUILDINGS.solar_farm;
  const okT = g.graph.tiles().find((t) => !t.capitalBase && VIEW.buildVerdictFor?.(t, b, ctx) === 'ok');
  const badT = g.graph.tiles().find((t) => VIEW.buildVerdictFor?.(t, b, ctx) === 'blocked');
  const res = [];
  const on = (e) => res.push(e.success);
  EventBus.on('planet:buildResult', on);
  quiet(() => { g.rs.receive(RICH); EventBus.emit('planet:buildRequest', { tile: badT, buildingId: b.id }); EventBus.emit('planet:buildRequest', { tile: okT, buildingId: b.id }); });
  EventBus.off?.('planet:buildResult', on);
  ver = { cells, okCells, blocked, occupied, mismatch, res, ids: ids.length };
} catch (e) { verErr = e; }
if (!ver) assert(false, `K2e verdict run failed: ${verErr?.message}`);
else assert(ver.mismatch === 0 && ver.okCells > 0 && ver.blocked > 0 && ver.occupied > 0 && ver.cells === ver.ids * 252 && same(ver.res, [false, true]),
  `K2e placement verdicts equal in both build modes and on the old path: ${ver.cells} tile × building cells (${ver.okCells} ok, ${ver.blocked} blocked, ${ver.occupied} occupied), 0 mismatches; refusal and build confirmed by planet:buildRequest`);

// K2f — budowa oboma trybami daje ten sam stan
function modeRun(mode) {
  const g = bootGame(true);
  const ctx = { techSystem: g.K.techSystem, planet: g.planet };
  const b = BUILDINGS.solar_farm;
  const target = freeOk(g, b, 2) ?? freeOk(g, b);   // pole polarne — koszt z pasem szerokości
  quiet(() => { g.rs.receive(RICH); const c = g.bSys.previewBuildCost(target, b.id); g.rs.receive(Object.fromEntries(Object.keys(c).map((k) => [k, c[k] * 3]))); });
  let admitted = false;
  if (mode === 'tile') {
    // „pole → budynek": wiersz listy pola musi być włączony
    const rows = L.tileBuildRows({ entries: [{ id: b.id, locked: !evaluatePlacement(target, b, ctx).ok }], costOf: (id) => g.bSys.previewBuildCost(target, id), haveOf: g.have });
    admitted = rows[0]?.enabled === true && rows[0].state === 'ok';
  } else {
    // „budynek → pola": pole musi być podświetlone (werdykt ok)
    admitted = VIEW.buildVerdictFor(target, b, ctx) === 'ok';
  }
  // Dwa uruchomienia gry w jednym procesie mają różne układy kolonii (strumień losowy biegnie dalej), więc porównujemy SKUTEK
  // rozkazu względem stanu sprzed niego: pobrane kwoty, wpis kolejki, znaczniki pola, liczba aktywnych budynków.
  const cost = g.bSys.previewBuildCost(target, b.id);
  const before = Object.fromEntries(Object.keys(cost).map((k) => [k, g.have(k)])), active0 = g.bSys._active.size;
  quiet(() => { if (admitted) EventBus.emit('planet:buildRequest', { tile: target, buildingId: b.id }); });
  const key = g.graph.idOf(target);
  const entry = g.bSys._constructionQueue.get(key);
  return { key, band: g.graph.latitudeBand(target), keyInQueue: g.bSys._constructionQueue.has(key),
    effect: { admitted, cost, charged: Object.fromEntries(Object.keys(cost).map((k) => [k, before[k] - g.have(k)])),
      cq: entry ? [entry.buildingId, entry.buildTime, entry.progress] : null, cqSize: g.bSys._constructionQueue.size, pq: g.bSys._pendingQueue.size,
      tile: { uc: target.underConstruction?.buildingId ?? null, b: target.buildingId ?? null, p: target.pendingBuild ?? null }, activeDelta: g.bSys._active.size - active0 } };
}
let mA = null, mB = null, mErr = null;
try { mA = modeRun('tile'); mB = modeRun('palette'); } catch (e) { mErr = e; }
if (!mA || !mB) assert(false, `K2f mode run failed: ${mErr?.message}`);
else assert(mA.effect.admitted && mB.effect.admitted && same(mA.effect, mB.effect) && mA.band === 2 && mB.band === 2 && mA.keyInQueue && mB.keyInQueue
  && mA.effect.tile.uc === 'solar_farm' && same(mA.effect.cost, mA.effect.charged) && Object.keys(mA.effect.cost).length > 0,
  `K2f a polar build through "tile → building" and through "building → tiles" has the same effect: charge ${JSON.stringify(mA.effect.charged)}, queue entry, tile markers${same(mA.effect, mB.effect) ? '' : ' — ' + JSON.stringify(mA) + ' vs ' + JSON.stringify(mB)}`);

// K2g — kolejka: kolejność zamówień, anulowanie, zapis w kolejności
let qr = null, qErr = null;
try {
  const g = bootGame(true);
  const b = BUILDINGS.solar_farm;
  // opróżnij magazyn z surowców kosztu → trzy zamówienia oczekujące
  for (const k of Object.keys(b.cost ?? {})) g.store.inventory.set(k, 0);
  const tiles = g.graph.tiles().filter((t) => !t.capitalBase && !t.buildingId && !t.underConstruction && !t.pendingBuild && evaluatePlacement(t, b, { techSystem: g.K.techSystem, planet: g.planet }).ok).slice(0, 3);
  quiet(() => { for (const t of tiles) EventBus.emit('planet:buildRequest', { tile: t, buildingId: b.id }); });
  const order0 = [...g.bSys._pendingQueue.keys()];
  const hasMove = typeof g.bSys.movePending === 'function';
  const r1 = hasMove ? g.bSys.movePending(order0[2], -1) : null;
  const order1 = [...g.bSys._pendingQueue.keys()];
  const r2 = hasMove ? g.bSys.movePending(order1[0], -1) : null;                 // już pierwsze
  const r3 = hasMove ? g.bSys.movePending(order1[2], +1) : null;                 // już ostatnie
  const r4 = hasMove ? g.bSys.movePending('g99999', 1) : null;                   // nie ma takiego
  const r5 = hasMove ? g.bSys.movePending(order1[0], 0) : null;
  const order2 = [...g.bSys._pendingQueue.keys()];
  const saved = g.bSys.serializePendingQueue().map((o) => o.tileKey);
  // pierwsze w kolejce pierwsze dostaje surowce
  const firstKey = order2[0];
  quiet(() => { g.rs.receive(g.bSys._pendingQueue.get(firstKey).cost); g.bSys._tickPendingQueue(); });
  const afterTick = { pending: [...g.bSys._pendingQueue.keys()], started: [...g.bSys._constructionQueue.keys()] };
  // anulowanie zamówienia i budowy (zwrot połowy kosztu budowy)
  const cancelKey = afterTick.pending[0];
  quiet(() => g.bSys.cancelPending(cancelKey));
  const startedKey = afterTick.started.find((k) => k === firstKey);
  // znaczniki pól (budowa w toku) utrzymuje okno kolonii po zdarzeniu `planet:pendingFulfilled` — tu ta sama funkcja wprost
  quiet(() => SYNC.syncTileBuildings(g.grid, g.bSys));
  const fe0 = g.have('Fe');
  quiet(() => g.bSys.cancelConstruction(startedKey));
  qr = { hasMove, order0, order1, order2, r: [r1, r2, r3, r4, r5], saved, afterTick, firstKey, cancelKey,
    afterCancel: { pending: [...g.bSys._pendingQueue.keys()], started: [...g.bSys._constructionQueue.keys()] },
    refund: g.have('Fe') - fe0, feCost: b.cost?.Fe ?? 0, tileClear: !g.graph.tile(startedKey).underConstruction };
} catch (e) { qErr = e; }
if (!qr || !qr.hasMove) assert(false, `K2g queue run failed: ${qErr?.message ?? 'movePending missing'}`);
else {
  const [a, b2, c] = qr.order0;
  assert(qr.order0.length === 3 && same(qr.order1, [a, c, b2]) && same(qr.r, [true, false, false, false, false]) && same(qr.order2, qr.order1) && same(qr.saved, qr.order1),
    'K2g queue reorder: movePending swaps neighbours in payment order, refuses at both ends / unknown key / zero step; the save keeps the order');
  assert(same(qr.afterTick.started.filter((k) => k === qr.firstKey), [qr.firstKey]) && qr.afterTick.pending.length === 2 && !qr.afterTick.pending.includes(qr.firstKey)
    && qr.afterCancel.pending.length === 1 && !qr.afterCancel.pending.includes(qr.cancelKey) && !qr.afterCancel.started.includes(qr.firstKey) && qr.tileClear
    && qr.refund === Math.floor(qr.feCost * 0.5) && qr.feCost > 0,
  `K2h queue effect: the first pending order is the one paid when resources arrive; cancel removes an order; cancelling a construction refunds half the cost (${JSON.stringify({ t: qr.afterTick, c: qr.afterCancel, refund: qr.refund, fe: qr.feCost, clear: qr.tileClear, first: qr.firstKey })})`);
}
// K2i — Finding 791: założenie kolonii gracza drogą gry nie gubi właściciela fabryki (bez ostrzeżeń fail-closed, popyt policzony)
let fnd = null, fndErr = null;
for (const flagOn of [false, true]) {
  try {
    GAME_CONFIG.FEATURES.colonySphere = flagOn;
    const core = new GameCore();
    quiet(() => core.boot({ quiet: true, scenario: 'civilization', galaxySeed: 20261120 }));
    const K = window.KOSMOS, cm = K.colonyManager, EM = K.entityManager;
    const free = [...EM.getByType('planet'), ...EM.getByType('moon')].filter((b) => b.id !== K.homePlanet.id && !cm.getColony(b.id));
    const warns = [];
    const l = console.log, w = console.warn, e = console.error;
    console.log = console.error = () => {}; console.warn = (...a) => { const txt = a.join(' '); if (/fail-closed/.test(txt)) warns.push(txt); };
    let col = null, out = null;
    try {
      EventBus.emit('expedition:colonyFounded', { planetId: free[0].id, startResources: { Fe: 200 }, startPop: 4, autoSpaceport: true });
      col = cm.getColony(free[0].id);
      out = cm.createOutpost(free[1].id, { Fe: 50 }, 0);
    } finally { console.log = l; console.warn = w; console.error = e; }
    (fnd ??= []).push({ flagOn, warns: warns.length, mode: col?.factorySystem?._mode ?? null, outMode: out?.factorySystem?._mode ?? null,
      owner: col?.factorySystem?._getOwnerColony?.() === col, recipe: col?.factorySystem?.isRecipeAvailable?.('basic_supplies') });
  } catch (e) { fndErr = e; }
}
GAME_CONFIG.FEATURES.colonySphere = false;
if (!fnd || fnd.length !== 2) assert(false, `K2i founding run failed: ${fndErr?.message}`);
else assert(fnd.every((r) => r.warns === 0 && r.mode === 'reactive' && r.outMode === 'reactive' && r.owner === true && r.recipe === true),
  `K2i Finding 791: a player colony / outpost founded through the game path has its factory owner at once — no fail-closed recipe warnings (${fnd.map((r) => `flag ${r.flagOn ? 'ON' : 'OFF'}: ${r.warns}`).join(', ')}), reactive mode set`);
// K2j — Finding 792: nowa gra (kolonia domowa, registerHomePlanet) bez ostrzeżeń fail-closed, flaga OFF i ON
let home = null, homeErr = null;
for (const flagOn of [false, true]) {
  try {
    GAME_CONFIG.FEATURES.colonySphere = flagOn;
    const core = new GameCore();
    const warns = [];
    const l = console.log, w = console.warn, e = console.error;
    console.log = console.error = () => {}; console.warn = (...a) => { const txt = a.join(' '); if (/fail-closed/.test(txt)) warns.push(txt); };
    try { core.boot({ quiet: true, scenario: 'civilization', galaxySeed: 20261120 }); }
    finally { console.log = l; console.warn = w; console.error = e; }
    const K = window.KOSMOS, hc = K.colonyManager.getColony(K.homePlanet.id);
    (home ??= []).push({ flagOn, warns: warns.length, mode: hc?.factorySystem?._mode ?? null,
      owner: hc?.factorySystem?._getOwnerColony?.() === hc, recipe: hc?.factorySystem?.isRecipeAvailable?.('basic_supplies') });
  } catch (e) { homeErr = e; }
}
GAME_CONFIG.FEATURES.colonySphere = false;
if (!home || home.length !== 2) assert(false, `K2j new-game run failed: ${homeErr?.message}`);
else assert(home.every((r) => r.warns === 0 && r.mode === 'reactive' && r.owner === true && r.recipe === true),
  `K2j Finding 792: a new game registers the home colony before its factory goes reactive — 0 fail-closed recipe warnings (${home.map((r) => `flag ${r.flagOn ? 'ON' : 'OFF'}: ${r.warns}`).join(', ')}), owner found, reactive mode set`);

// ── K3 piny źródła ───────────────────────────────────────────────────────────
console.log('\nK3 source pins');
const co = stripComments(src('src/ui/ColonyOverlay.js'));
const cv = stripComments(src('src/ui/ColonyConsoleView.js'));
const gs = stripComments(src('src/scenes/GameScene.js'));
const bs = stripComments(src('src/systems/BuildingSystem.js'));
const body = (text, head) => { const i = text.indexOf(head); if (i < 0) return ''; const j = text.indexOf('\n  }\n', i); return text.slice(i, j < 0 ? i + 6000 : j); };
const drawFn = body(co, '  draw(ctx, W, H) {');
const iCall = drawFn.indexOf('if (colonyConsoleActive(cGrid)) { this._drawConsole(ctx, W, H, cCol, cGrid); return; }'), iBg = drawFn.indexOf("ctx.fillStyle = 'rgba(2, 4, 8, 0.92)';");
const consoleGate = drawFn.slice(0, iCall > 0 ? iCall : 0);
const activeFn = stripComments(src('src/ui/ColonyConsoleLogic.js')).split('export function colonyConsoleActive')[1]?.split('\n}')[0] ?? 'FEATURES';
assert(iCall > 0 && iBg > iCall && /this\._consoleOn = false;/.test(consoleGate) && !/FEATURES/.test(consoleGate) && !/FEATURES|GAME_CONFIG|features/.test(activeFn),
  'K3a draw(): the console branch depends on the grid kind only (no flag read on the way), before today\'s background — a flat grid falls through to today\'s screen');
const dc = body(co, '  _drawConsole(ctx, W, H, colony, grid) {');
const dip = body(co, '  _drawInfoPanel(ctx, x, y, w, h, colony, grid, opts = null) {');
assert(dc.length > 200 && !/drawMini\(/.test(dc) && /this\._teardownGlobe\(\);/.test(dc) && !/_syncGlobe\(/.test(dc) && !/drawMini\(/.test(cv) && !/_syncGlobe\(/.test(cv)
  && /if \(embedTab\) \{\s*this\._teardownGlobe\(\);\s*\} else if \(isSphereGrid\(grid\)\) \{/.test(dip) && /const embedTab = opts\?\.consoleTab \?\? null;/.test(dip)
  && (co.match(/\.drawMini\(/g) ?? []).length === 1,
'K3b no small globe in the console: _drawConsole tears the globe down and never draws the mini sphere; the embedded tab skips it (the old right column keeps its single drawMini call)');
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FF}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}]/u;
const portrait = body(cv.replace(/\nexport function /g, '\n  export function ').replace(/\n}\n/g, '\n  }\n'), '  export function drawBuildingPortrait(');
assert(cv.length > 1000 && !EMOJI.test(cv) && EMOJI.test(co) && /categoryGlyphOf\(cat\)/.test(portrait) && /portraitSpecOf\(buildingId, hasBuildingTexture\)/.test(portrait)
  && !/\.icon\b/.test(cv) && /drawBuildingPortrait\(ctx, CAPITAL_BUILDING_ID,/.test(cv),
'K3c no emoji placeholder: the console view has no emoji and reads no data icon (witness: the old overlay source has emoji); portrait = PNG or category glyph; capital tile = capital portrait');
const onHit = body(co, '  _onHit(zone) {');
const iGate = onHit.indexOf('if (isColonyOrderBlocked(zone.type, colony)) {'), iCons = onHit.indexOf('if (this._onConsoleHit(zone, colony, graph)) return;');
const B = GUARD.isColonyOrderBlocked, foreign = { ownerEmpireId: 'emp_x' }, own = {};
const navTypes = ['cChip', 'cInspTab', 'cReason', 'cCat', 'cPick', 'cBuildExit', 'cQueueFocus'], orderTypes = ['cQueueCancel', 'cQueueMove', 'cCargo', 'build', 'upgrade', 'demolish', 'cancelPending'];
const viewTypes = [...new Set([...cv.matchAll(/'(c[A-Z][A-Za-z]+)'/g)].map((m) => m[1]))];
assert(iGate > 0 && iCons > iGate && navTypes.every((ty) => !B(ty, foreign)) && orderTypes.every((ty) => B(ty, foreign) && !B(ty, own))
  && viewTypes.length >= 8 && viewTypes.every((ty) => navTypes.includes(ty) || orderTypes.includes(ty)),
`K3d console hit zones pass the ownership gate first: navigation allowed on a foreign colony, orders refused (${viewTypes.length} console zone types, each classified)`);
const gg = body(co, '  _getGrid(colony) {');
assert(/const g = createColonyGrid\(colony\.planet, false\);/.test(gg) && !/PlanetMapGenerator\.generate\(colony\.planet, false\)/.test(gg),
  'K3e Finding 785: the preview of a body without a colony builds its grid through the colony grid factory (geo with the flag)');
assert(/if \(this\._gridCache\[pid\] && colony\.grid && colony\.grid !== this\._gridCache\[pid\] && isSphereGrid\(colony\.grid\)\) delete this\._gridCache\[pid\];/.test(gg)
  && /if \(GAME_CONFIG\.FEATURES\?\.colonySphere === true\) queueMicrotask\(\(\) => this\.uiManager\?\.overlayManager\?\.openPanel\('colony'\)\);\s*else this\.uiManager\?\.overlayManager\?\.openPanel\('colony'\);/.test(gs),
'K3f Finding 788: with the flag the colony screen opens after the founding transaction, and a geo grid assigned later replaces the window\'s flat copy');
assert(/if \(!shouldActivateFoundedOutpost\(GAME_CONFIG\.FEATURES, activeCol\)\) return;\s*this\.colonyManager\.switchActiveColony\(colony\.planetId\);/.test(gs),
  'K3g Finding 740: the outpost:founded listener asks shouldActivateFoundedOutpost before switching the active colony');
const bld = body(bs, '  _build(tile, buildingId) {');
assert(/const actualCost = this\._buildCostOn\(tile, building, buildingId\);/.test(bld) && /previewBuildCost\(tile, buildingId\) \{[\s\S]{0,200}return this\._buildCostOn\(tile, building, buildingId\);/.test(bs)
  && /const upgradeCost = this\._upgradeCostOf\(building, nextLevel\);/.test(bs) && /costOf: \(id\) => bSys\?\.previewBuildCost\?\.\(tile, id\) \?\? null/.test(cv)
  && !/computeBuildResourceCost/.test(cv),
'K3h one cost function: _build charges _buildCostOn, the preview returns the same call, the console list reads previewBuildCost (never the latitude-less helper)');
const place = body(co, '  _consolePlace(tile, colony, keepArmed) {');
const cat = body(co, '  _consolePaletteCatalog(colony, grid) {');
assert(/buildVerdictFor\(tile, b, ctxV\)/.test(place) && /EventBus\.emit\('planet:buildRequest', \{ tile, buildingId: id \}\);/.test(place) && /if \(!keepArmed\) this\._cPick = null;/.test(place)
  && (place.match(/this\._showFlash\(/g) ?? []).length >= 3 && /this\._getAvailableBuildings\(tile\)/.test(cat)
  && /if \(this\._consoleOn && this\._cBuildMode\) \{ this\._exitBuildMode\(\); return true; \}/.test(co),
'K3i "building → tiles": catalogue from today\'s tile gate, placement through the same planet:buildRequest, every refusal flashes a reason, Shift keeps the building, Esc leaves the mode');
const rr = stripComments(src('src/renderer/ColonySphereRenderer.js'));
const fb = body(rr, '  _drawFallback(ctx, rect) {');
assert(/new THREE\.WebGLRenderer\(\{ canvas, alpha: true,/.test(rr) && /r\.setClearColor\(BACKGROUND_HEX, 0\);/.test(rr) && fb.length > 200 && !/ctx\.fillRect\(rect\.x, rect\.y, rect\.w, rect\.h\)/.test(fb)
  && /this\._drawHeroVignette\(ctx, hero\);/.test(dc) && !/ctx\.fillRect\(hero\.x, hero\.y, hero\.w, hero\.h\);\s*ctx\.restore\(\);\s*const placeable/.test(dc),
'K3k hero backdrop: the sphere canvas is transparent outside the disc (WebGL and the 2D fallback paint no frame background); the console draws only a vignette under the sphere');
const cmSrc = stripComments(src('src/systems/ColonyManager.js'));
const cc = body(cmSrc, '  createColony(planetId, startResources, startPop, gameYear, ownerEmpireId = null) {'), co2 = body(cmSrc, '  createOutpost(planetId, startResources, gameYear, ownerEmpireId = null) {');
const after = (text) => { const i = text.indexOf('this._colonies.set(planetId, colony);'), j = text.indexOf("factSys.setMode('reactive')"); return i > 0 && j > i && text.indexOf("factSys.setMode('reactive')", j + 1) < 0; };
assert(after(cc) && after(co2), 'K3l Finding 791: createColony / createOutpost switch the factory to reactive mode only after the colony is registered');
const hp = body(cmSrc, '  registerHomePlanet(planet, resourceSystem, civSystem, buildingSystem = null) {');
const hi = hp.indexOf('this._colonies.set(planet.id, colony);'), hj = hp.indexOf("factSys.setMode('reactive')");
assert(hi > 0 && hj > hi && hp.indexOf("factSys.setMode('reactive')", hj + 1) < 0,
  'K3m Finding 792: registerHomePlanet switches the home factory to reactive mode only after the colony is registered');
const pl = src('src/i18n/pl.js'), en = src('src/i18n/en.js');
const used = [...new Set([...(cv + stripComments(src('src/ui/ColonyConsoleLogic.js')) + co).matchAll(/'(colonyConsole\.[A-Za-z0-9_.]+[A-Za-z0-9])'/g)].map((m) => m[1]))];
const lacks = used.filter((k) => !pl.includes(`'${k}':`) || !en.includes(`'${k}':`));
const families = ['colonyConsole.cat.', 'colonyConsole.insp.', 'colonyConsole.band.', 'colonyConsole.tab.', 'colonyConsole.kind.', 'colonyConsole.mode.', 'colonyConsole.unit.status.', 'colonyConsole.unit.deploy.'];
const catKeys = [...new Set(Object.values(BUILDINGS).map((b) => b.category).filter(Boolean))].map((c) => `colonyConsole.cat.${c}`);
const inspKeys = (L.INSPECTOR_KINDS ?? []).map((k) => `colonyConsole.insp.${k}`);
const dyn = [...catKeys, ...inspKeys, 'colonyConsole.band.equatorial', 'colonyConsole.band.subpolar', 'colonyConsole.band.polar'];
assert(used.length > 100 && lacks.length === 0 && families.every((f) => pl.includes(`'${f}`) && en.includes(`'${f}`)) && inspKeys.length === 8
  && dyn.every((k) => pl.includes(`'${k}':`) && en.includes(`'${k}':`)),
`K3j i18n: ${used.length} literal console keys + computed families (categories, inspector states, bands) exist in PL and EN${lacks.length ? ' — missing: ' + lacks.slice(0, 5).join(', ') : ''}`);

// ── K4 flaga OFF ─────────────────────────────────────────────────────────────
console.log('\nK4 flag OFF');
GAME_CONFIG.FEATURES.colonySphere = false;
const body1 = { id: 'pf', type: 'planet', planetType: 'rocky', name: 'F', mass: 1, temperatureC: 10, atmosphere: 'thin', bodyArchetype: 'terran', surfaceSeed: 77, systemId: 'sys_home' };
const snap = (g) => JSON.stringify({ kind: g.kind ?? 'flat', w: g.width, h: g.height, tiles: TG.tileGraphOf(g).tiles().map((t) => [t.q, t.r, t.type, t.anomaly ?? null]) });
const offA = FACTORY.createColonyGrid(body1, false), offB = PlanetMapGenerator.generate(body1, false);
FACTORY.setGeoGridsAllowed(true);
const onGrid = FACTORY.createColonyGrid(body1, false, { flag: true, allowed: true });
assert(GAME_CONFIG.FEATURES.colonySphere === false && snap(offA) === snap(offB) && (offA.kind ?? 'flat') === 'flat' && onGrid.kind === 'geo'
  && L.colonyConsoleActive?.(offA) === false && L.colonyConsoleActive?.(onGrid) === true,
'K4a flag default OFF: the factory grid (new colony, preview) equals today\'s PlanetMapGenerator.generate bit for bit — flat, so no console; a geo grid exists only when the flag was ON at creation');

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
