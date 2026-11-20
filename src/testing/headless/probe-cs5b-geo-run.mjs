// ARC COLONY SPHERE CS-5b — headless gra z FEATURES.colonySphere ON (siatki geo) vs OFF, ten sam seed.
//   node src/testing/headless/probe-cs5b-geo-run.mjs [--geo] [--years 30] [--yearsB 15] [--out plik.json]
// Faza A: N lat civ (bootstrap AI, auto-expander, budowy, zdarzenia, uderzenia). Faza B: skryptowana ziemia na kolonii
// domowej przez TileGraph (jednostki gracza, ruch A*, przegląd, armia, wojna, desant AI 4 jednostek, walka), M lat.
// Wynik: liczniki (kolonie per rodzaj siatki, budynki, desanty, bitwy, jednostki), błędy konsoli, wyjątki, hash stanu,
// round-trip zapisu każdej siatki (serialize → restore → serialize identyczne).
import './env.js';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const GEO = argv.includes('--geo');
const YEARS_A = +argOf('--years', 30), YEARS_B = +argOf('--yearsB', 15);

const { GAME_CONFIG } = await import('../../config/GameConfig.js');
GAME_CONFIG.FEATURES.colonySphere = GEO;
const { GameCore } = await import('./GameCore.js');
const { Ticker } = await import('./Ticker.js');
const { CombatSystem } = await import('../../systems/CombatSystem.js');
const { ArmySystem } = await import('../../systems/ArmySystem.js');
const { SupplyCoverageSystem } = await import('../../systems/SupplyCoverageSystem.js');
const { tileGraphOf } = await import('../../map/TileGraph.js');
const { HexGrid } = await import('../../map/HexGrid.js');
const { GeodesicGrid } = await import('../../map/GeodesicGrid.js');
const EventBus = (await import('../../core/EventBus.js')).default;

const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
const errors = [];
console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 240)); };
const eventCounts = {};
const _emit = EventBus.emit.bind(EventBus);
EventBus.emit = (name, payload) => { eventCounts[name] = (eventCounts[name] ?? 0) + 1; return _emit(name, payload); };

let crash = null;
const out = { geo: GEO, years: [YEARS_A, YEARS_B] };
try {
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.combatSystem = new CombatSystem();
  K.armySystem = new ArmySystem();
  K.supplyCoverageSystem = new SupplyCoverageSystem(core.colonyManager, core.groundUnitManager);
  const tick = (y) => quiet(() => new Ticker(core.timeSystem).run(y, { tickSize: 1.0 }));
  tick(YEARS_A);
  const home = K.homePlanet;
  const colony = core.colonyManager.getColony(home.id);
  const graph = tileGraphOf(colony.grid);
  const gum = core.groundUnitManager;
  const land = graph.tiles().filter(t => t.type !== 'ocean');
  const cap = land.find(t => t.capitalBase) ?? land[0];
  const far = [...land].sort((a, b) => graph.distance(cap, b) - graph.distance(cap, a) || graph.idOf(a).localeCompare(graph.idOf(b)));
  const scripted = { created: 0, moves: [], armies: 0, invasion: null };
  quiet(() => {
    const ids = [];
    for (const type of ['infantry', 'infantry', 'science_rover', 'recon_drone', 'medic_unit', 'infantry']) {
      const u = gum.createUnit(type, home.id, cap.q, cap.r, { owner: 'player' });
      const id = typeof u === 'string' ? u : u?.id;
      if (id) ids.push(id);
    }
    scripted.created = ids.length;
    ids.forEach((id, i) => { const t = far[(i * 7) % far.length]; scripted.moves.push(!!gum.moveUnit(id, t.q, t.r)); });
    if (ids[2]) gum.startSurvey?.(ids[2]);
  });
  tick(3);
  quiet(() => {
    const inf = gum.getUnitsOnPlanet(home.id).filter(u => u.owner === 'player' && u.type === 'infantry');
    const pair = inf.filter(u => inf.some(o => o !== u && o.q === u.q && o.r === u.r)).slice(0, 2);
    if (pair.length === 2) { K.armySystem.createArmy(pair.map(u => u.id)); scripted.armies++; }
    for (const e of K.empireRegistry.listAll()) K.diplomacySystem.declareWar(e.id, 'probe_setup');
    const emp = K.empireRegistry.listAll()[0]?.id;
    if (emp) scripted.invasion = core.invasionSystem.launchInvasion(emp, home.id, 4)?.landed?.length ?? null;
    const enemies = gum.getUnitsOnPlanet(home.id).filter(u => u.owner !== 'player');
    const mine = gum.getUnitsOnPlanet(home.id).filter(u => u.owner === 'player');
    mine.forEach((u, i) => { const e = enemies[i % Math.max(1, enemies.length)]; if (e) scripted.moves.push(!!gum.moveUnit(u.id, e.q, e.r)); });
  });
  tick(YEARS_B);

  const cols = core.colonyManager.getAllColonies?.() ?? [];
  const kinds = { flat: 0, geo: 0, none: 0 };
  let buildings = 0, aiCols = 0, outposts = 0, rtBad = 0, rtGeo = 0;
  const h = createHash('sha256');
  for (const c of [...cols].sort((a, b) => String(a.planetId).localeCompare(String(b.planetId)))) {
    const k = c.grid ? (c.grid.kind === 'geo' ? 'geo' : 'flat') : 'none';
    kinds[k]++;
    buildings += c.buildingSystem?._active?.size ?? 0;
    if (c.ownerEmpireId) aiCols++;
    if (c.isOutpost) outposts++;
    if (c.grid) {
      const ser = JSON.stringify(c.grid.serialize());
      const back = c.grid.kind === 'geo' ? GeodesicGrid.restore(JSON.parse(ser)) : HexGrid.restore(JSON.parse(ser));
      if (JSON.stringify(back.serialize()) !== ser) rtBad++;
      if (c.grid.kind === 'geo') rtGeo++;
      h.update(c.planetId + ser);
    }
    h.update(JSON.stringify(c.buildingSystem?.serialize?.() ?? null));
  }
  const units = gum.getAllUnits?.() ?? [];
  h.update(JSON.stringify(units.map(u => [u.id, u.type, u.owner, u.planetId, u.q, u.r, u.hp ?? null])));
  Object.assign(out, {
    colonies: cols.length, gridKinds: kinds, aiColonies: aiCols, outposts, buildings,
    invasions: (core.invasionSystem.listAll?.() ?? []).length,
    battles: K.combatSystem._battleTotals?.size ?? null,
    units: units.length, scripted, roundTrip: { grids: kinds.flat + kinds.geo, geo: rtGeo, bad: rtBad },
    events: Object.fromEntries(Object.entries(eventCounts).filter(([k]) => /^(colony:founded|outpost|invasion|combat:|groundUnit:(created|destroyed|moved)|building:(built|completed))/.test(k)).sort()),
    stateHash: h.digest('hex').slice(0, 16),
  });
} catch (e) { crash = String(e?.stack ?? e).slice(0, 1200); }
out.crash = crash;
out.consoleErrors = errors.length;
out.errorSample = errors.slice(0, 8);
console.log(JSON.stringify(out, null, 1));
const file = argOf('--out', null);
if (file) writeFileSync(file, JSON.stringify(out, null, 1));
process.exit(crash ? 2 : 0);
