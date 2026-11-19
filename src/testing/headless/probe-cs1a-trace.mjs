// ═══════════════════════════════════════════════════════════
// PROBE — CS-1a: ślad bit w bit (TileGraph refactor)
// Uruchom: node src/testing/headless/probe-cs1a-trace.mjs [--out plik.json] [--years N]
// ───────────────────────────────────────────────────────────
// Stały seed (env.js + HEADLESS_GALAXY_SEED), pełna gra headless z imperiami AI:
//   faza A — N lat civ (bootstrap AI, auto-expander, budowy, zdarzenia losowe, uderzenia),
//   faza B — skryptowana ziemia na kolonii domowej: jednostki gracza (ruch A*, przegląd spiralą,
//            armia), wojna ze wszystkimi imperiami (mobilizacja garnizonów AI = GarrisonPlanner),
//            desant AI na dom gracza (InvasionSystem → walka CombatSystem → odwrót / przejęcie),
//            podaż (SupplyCoverageSystem), M lat.
// Wynik: sha256 śladu EventBus (nazwa + ładunek, głębokość ≤ 4) + sha256 stanu końcowego
// (siatki, budynki, jednostki, armie, magazyny) + liczniki zdarzeń i wywołań HexGrid (pokrycie).
// Używa wyłącznie API istniejącego przed CS-1a — ten sam plik biegnie w worktree na bazie.
// ═══════════════════════════════════════════════════════════

import './env.js'; // MUSI być pierwszy
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import { HexGrid } from '../../map/HexGrid.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { ArmySystem } from '../../systems/ArmySystem.js';
import { SupplyCoverageSystem } from '../../systems/SupplyCoverageSystem.js';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = argOf('--out', null);
const YEARS_A = Number(argOf('--years', 30));
const YEARS_B = Number(argOf('--yearsB', 12));

// ── Ślad EventBus ────────────────────────────────────────────────────────────
const traceHash = createHash('sha256');
const eventCounts = {};
let eventTotal = 0;
const safe = (v, depth = 0, seen = new WeakSet()) => {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function') return '<fn>';
    if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
    if (typeof v === 'number' && Object.is(v, -0)) return '-0';
    return v;
  }
  if (seen.has(v)) return '<cyc>';
  if (depth >= 4) return '<deep>';
  seen.add(v);
  if (Array.isArray(v)) return v.map(x => safe(x, depth + 1, seen));
  if (v instanceof Map) return ['<Map>', ...[...v.entries()].map(e => safe(e, depth + 1, seen))];
  if (v instanceof Set) return ['<Set>', ...[...v].map(x => safe(x, depth + 1, seen))];
  const o = {};
  for (const k of Object.keys(v)) o[k] = safe(v[k], depth + 1, seen);
  return o;
};
const _emit = EventBus.emit.bind(EventBus);
EventBus.emit = (name, payload) => {
  eventCounts[name] = (eventCounts[name] ?? 0) + 1;
  eventTotal++;
  traceHash.update(name + '|' + JSON.stringify(safe(payload)) + '\n');
  return _emit(name, payload);
};

// ── Licznik wywołań HexGrid (pokrycie, nie tożsamość) ───────────────────────
const gridCalls = {};
for (const m of ['get', 'getNeighbors', 'spiral', 'ring', 'forEach', 'toArray']) {
  const orig = HexGrid.prototype[m];
  HexGrid.prototype[m] = function (...a) { gridCalls[m] = (gridCalls[m] ?? 0) + 1; return orig.apply(this, a); };
}
const _dist = HexGrid.distance;
HexGrid.distance = (...a) => { gridCalls.distance = (gridCalls.distance ?? 0) + 1; return _dist(...a); };

const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
const errors = [];
const _err = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 200)); };

// ── Faza A ───────────────────────────────────────────────────────────────────
const core = new GameCore();
quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
const K = window.KOSMOS;
K.combatSystem         = new CombatSystem();
K.armySystem           = new ArmySystem();
K.supplyCoverageSystem = new SupplyCoverageSystem(core.colonyManager, core.groundUnitManager);
const tick = (y) => quiet(() => new Ticker(core.timeSystem).run(y, { tickSize: 1.0 }));
const resA = tick(YEARS_A);

// ── Faza B — skryptowana ziemia ──────────────────────────────────────────────
const home = K.homePlanet;
const colony = core.colonyManager.getColony(home.id);
const gum = core.groundUnitManager;
const tiles = colony.grid.toArray().filter(Boolean);
const land = tiles.filter(t => t.type !== 'ocean');
const cap = tiles.find(t => t.capitalBase) ?? land[0];
const far = [...land].sort((a, b) => HexGrid.distance(cap.q, cap.r, b.q, b.r) - HexGrid.distance(cap.q, cap.r, a.q, a.r) || a.r - b.r || a.q - b.q);
const scripted = { created: [], moves: [], armies: 0, invasion: null };
quiet(() => {
  const types = ['infantry', 'infantry', 'science_rover', 'recon_drone', 'medic_unit', 'infantry'];
  for (let i = 0; i < types.length; i++) {
    const u = gum.createUnit(types[i], home.id, cap.q, cap.r, { owner: 'player' });
    if (u) scripted.created.push(u.id ?? u);
  }
  const ids = scripted.created.map(x => (typeof x === 'string' ? x : x?.id));
  ids.forEach((id, i) => {
    const target = far[(i * 7) % far.length];
    scripted.moves.push(!!gum.moveUnit(id, target.q, target.r));
  });
  const rover = ids[2];
  if (rover) gum.startSurvey?.(rover);
});
tick(3);
quiet(() => {
  // armia z dwóch piechot na wspólnym polu
  const inf = gum.getUnitsOnPlanet(home.id).filter(u => u.owner === 'player' && u.type === 'infantry');
  const pair = inf.filter(u => inf.some(o => o !== u && o.q === u.q && o.r === u.r)).slice(0, 2);
  if (pair.length === 2) { K.armySystem.createArmy(pair.map(u => u.id)); scripted.armies++; }
  for (const e of K.empireRegistry.listAll()) K.diplomacySystem.declareWar(e.id, 'probe_setup');
  const emp = K.empireRegistry.listAll()[0]?.id;
  if (emp) scripted.invasion = core.invasionSystem.launchInvasion(emp, home.id, 4)?.landed?.length ?? null;
  // ruch w stronę desantu — kontakt i walka
  const enemies = gum.getUnitsOnPlanet(home.id).filter(u => u.owner !== 'player');
  const mine = gum.getUnitsOnPlanet(home.id).filter(u => u.owner === 'player');
  mine.forEach((u, i) => { const e = enemies[i % Math.max(1, enemies.length)]; if (e) scripted.moves.push(!!gum.moveUnit(u.id, e.q, e.r)); });
});
const resB = tick(YEARS_B);

// ── Stan końcowy ─────────────────────────────────────────────────────────────
const stateHash = createHash('sha256');
const put = (label, v) => stateHash.update(label + '=' + JSON.stringify(safe(v)) + '\n');
const cols = core.colonyManager.getAllColonies?.() ?? [];
const colSummary = [];
for (const c of [...cols].sort((a, b) => String(a.planetId).localeCompare(String(b.planetId)))) {
  put('grid:' + c.planetId, c.grid?.serialize?.() ?? null);
  put('bsys:' + c.planetId, c.buildingSystem?.serialize?.() ?? null);
  put('inv:' + c.planetId, c.resourceSystem?.inventory ?? null);
  colSummary.push({ id: c.planetId, owner: c.ownerEmpireId ?? 'player', tiles: c.grid?.toArray?.().length ?? 0, bld: c.buildingSystem?._active?.size ?? 0 });
}
put('gum', gum.serialize());
put('army', K.armySystem.serialize());
put('combat', { rounds: [...K.combatSystem._battleRounds.entries()], totals: [...K.combatSystem._battleTotals.entries()] });
put('invasions', core.invasionSystem.listAll());

const out = {
  trace: traceHash.digest('hex'),
  state: stateHash.digest('hex'),
  eventTotal,
  yearsA: resA?.civYearsCompleted, yearsB: resB?.civYearsCompleted,
  crashedA: !!resA?.crashed, crashedB: !!resB?.crashed, crashError: resA?.error?.message ?? resB?.error?.message ?? null,
  colonies: colSummary.length, coloniesByOwner: colSummary.reduce((m, c) => (m[c.owner] = (m[c.owner] ?? 0) + 1, m), {}),
  units: gum.getAllUnits().length,
  scripted: { created: scripted.created.length, moves: scripted.moves, armies: scripted.armies, invasionLanded: scripted.invasion },
  gridCalls,
  events: Object.fromEntries(Object.entries(eventCounts).filter(([k]) => /^(groundUnit|combat|invasion|army|building|colony|tile|supply|garrison|anomaly|impact|randomEvent)/.test(k)).sort()),
  consoleErrors: errors.length,
};
console.error = _err;
console.log(JSON.stringify(out, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 1));
