// BALANS 1.0 — Phase 2 — PopTelemetry keeper (chroni czujnik POP).
// Instrument NIE ma browser live-gate → czujnik zepsuty = werdykt zepsuty bez śladu.
// Chroni: klasyfikator outlet-based (tablica prawdy), poprawkę zajętości (isOccupied
// vs buildingId — realny bug 7 vs 35), zliczanie ekspansji, sygnał absorpcji (prev-jobs
// threading) i realny boot (guard przed dryfem API POP/gridu).
//
//   T1  classify() tablica prawdy (tight/bound/buffer/wasted × ujścia)
//   T2  buildOut() liczy z isOccupied (NIE buildingId) + wyklucza damaged/non-buildable
//   T3  expansion() zliczanie kolonii/placówek/kolonizatorów + reguła active
//   T4  snapshot() + threading _prevHomeJobs (homeAbsorbing rok-do-roku)
//   T5  realny GameCore boot + ticki + sample (guard dryfu API, self-consistency zajętości)

import '../headless/env.js';           // MUST be first
import { reseed } from '../headless/env.js';
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { ActionCatalog } from '../actions/ActionCatalog.js';
import ActionAdapter from '../actions/ActionAdapter.js';
import { RuleBot } from '../bots/RuleBot.js';
import { PopTelemetry, POP_CLASS } from '../headless/PopTelemetry.js';
import { TERRAIN_TYPES } from '../../map/HexTile.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── T1: classify() tablica prawdy (czysta) ────────────────────────
console.log('T1 — classify() outlet-based truth table');
{
  const C = PopTelemetry.classify;
  // brak nadwyżki, etaty obsadzone → TIGHT
  assert(C({ unemployed: 0, unfilled: 0, builtOutFrac: 0.1, expansionActive: false, homeAbsorbing: false }) === POP_CLASS.TIGHT,
    'unemployed=0, filled → TIGHT');
  // NIEobsadzone etaty (nawet z nadwyżką) → BOUND (POP-limited ma pierwszeństwo)
  assert(C({ unemployed: 0, unfilled: 5, builtOutFrac: 0.1, expansionActive: false, homeAbsorbing: false }) === POP_CLASS.BOUND,
    'unfilled>eps → BOUND');
  assert(C({ unemployed: 10, unfilled: 5, builtOutFrac: 0.1, expansionActive: true, homeAbsorbing: true }) === POP_CLASS.BOUND,
    'unfilled>eps bije nadwyżkę+ujścia → BOUND');
  // nadwyżka + obsadzone + BRAK ujścia → WASTED
  assert(C({ unemployed: 10, unfilled: 0, builtOutFrac: 0.1, expansionActive: false, homeAbsorbing: false }) === POP_CLASS.WASTED,
    'nadwyżka, brak ujścia → WASTED (realny glut)');
  // każde pojedyncze ujście → BUFFER
  assert(C({ unemployed: 10, unfilled: 0, builtOutFrac: 0.9, expansionActive: false, homeAbsorbing: false }) === POP_CLASS.BUFFER,
    'ujście: zabudowa (≥0.8) → BUFFER');
  assert(C({ unemployed: 10, unfilled: 0, builtOutFrac: 0.1, expansionActive: true, homeAbsorbing: false }) === POP_CLASS.BUFFER,
    'ujście: ekspansja → BUFFER');
  assert(C({ unemployed: 10, unfilled: 0, builtOutFrac: 0.1, expansionActive: false, homeAbsorbing: true }) === POP_CLASS.BUFFER,
    'ujście: absorpcja (home wciąż buduje) → BUFFER');
  // próg nadwyżki: unemployed ≤ SURPLUS_EPS traktowane jak brak nadwyżki
  assert(C({ unemployed: 0.4, unfilled: 0, builtOutFrac: 0.1, expansionActive: false, homeAbsorbing: false }) === POP_CLASS.TIGHT,
    'unemployed ≤ SURPLUS_EPS → TIGHT (nie WASTED)');
}

// ── T2: buildOut() liczy z isOccupied ─────────────────────────────
console.log('\nT2 — buildOut() = isOccupied / buildable (nie buildingId)');
{
  const bType = Object.keys(TERRAIN_TYPES).find(k => TERRAIN_TYPES[k].buildable);
  const nType = Object.keys(TERRAIN_TYPES).find(k => !TERRAIN_TYPES[k].buildable) ?? '__none__';
  const home = { grid: { toArray: () => [
    { type: bType, isOccupied: true,  buildingId: undefined, damaged: false }, // ← dokładny bug: occupied, brak buildingId
    { type: bType, isOccupied: true,  buildingId: 'farm',    damaged: false },
    { type: bType, isOccupied: false, buildingId: undefined, damaged: false }, // wolny
    { type: bType, isOccupied: true,  buildingId: undefined, damaged: true  }, // damaged → poza buildable
    { type: nType, isOccupied: true,  buildingId: undefined, damaged: false }, // non-buildable → poza buildable
  ] } };
  const bo = PopTelemetry.buildOut(home);
  assert(bo.buildable === 3, `buildable = 3 (wyklucza damaged + non-buildable), było ${bo.buildable}`);
  assert(bo.occupied === 2, `occupied = 2 z isOccupied (łapie tile bez buildingId), było ${bo.occupied}`);
  assert(Math.abs(bo.frac - 2 / 3) < 1e-9, 'frac = occupied/buildable = 2/3');
  assert(PopTelemetry.buildOut({}).frac === 0, 'brak gridu → frac 0 (bezpieczne)');
}

// ── T3: expansion() zliczanie + active ────────────────────────────
console.log('\nT3 — expansion() kolonie/placówki/kolonizatory + reguła active');
{
  const colo = (state) => ({ modules: ['habitat_pod'], position: { state } });      // canColonize=true (slotType habitat)
  const nonColo = { modules: ['engine_chemical'], position: { state: 'in_transit' } };
  const cm = (cols) => ({ getPlayerColonies: () => cols });
  const vm = (vs) => ({ getAllVessels: () => vs });

  const e1 = PopTelemetry.expansion(
    cm([{ isOutpost: false }, { isOutpost: false }, { isOutpost: true }]),
    vm([colo('docked'), colo('in_transit'), nonColo]));
  assert(e1.fullColonies === 2 && e1.outposts === 1, `fullColonies=2 outposts=1 (było ${e1.fullColonies}/${e1.outposts})`);
  assert(e1.colonizersBuilt === 2 && e1.colonizersInFlight === 1, 'kolonizatory: 2 zbudowane, 1 w locie (state≠docked)');
  assert(e1.active === true, 'active=true (są kolonizatory / placówki / 2. kolonia)');

  // tylko macierzysta, brak kolonizatorów → brak ujścia
  const e0 = PopTelemetry.expansion(cm([{ isOutpost: false }]), vm([nonColo]));
  assert(e0.active === false, 'sama macierzysta + brak kolonizatorów → active=false');
  // wróg / kolonia AI pominięte
  const eAI = PopTelemetry.expansion(cm([{ isOutpost: false }]),
    vm([{ modules: ['habitat_pod'], ownerEmpireId: 'emp_x', position: { state: 'docked' } }]));
  assert(eAI.colonizersBuilt === 0, 'kolonizator AI (ownerEmpireId) pominięty');
}

// ── T4: snapshot() + threading _prevHomeJobs (homeAbsorbing) ───────
console.log('\nT4 — snapshot() pola + homeAbsorbing rok-do-roku (prev-jobs threading)');
{
  const bType = Object.keys(TERRAIN_TYPES).find(k => TERRAIN_TYPES[k].buildable);
  const mkCtx = (unemployed, jobsPerStrata) => {
    const civ = {
      population: 20, employed: 20 - unemployed, unemployed, humans: 20 + 0.3,
      satisfaction: 62, housing: 40,
      getAnnualGrowth: () => 0.25,
      getWorkforceBreakdown: () => [{ jobs: jobsPerStrata, workers: jobsPerStrata, synthetic: 0 }],
    };
    // Grid NIE-zabudowany (1/5 = 20% < 0.8) — by izolować sygnał absorpcji od zabudowy.
    const tiles = [{ type: bType, isOccupied: true, damaged: false },
      ...Array.from({ length: 4 }, () => ({ type: bType, isOccupied: false, damaged: false }))];
    return {
      home: { civSystem: civ, grid: { toArray: () => tiles } },
      colonyManager: { getPlayerColonies: () => [{ isOutpost: false }] },   // brak ekspansji
      vesselManager: { getAllVessels: () => [] },
    };
  };
  const tel = new PopTelemetry();
  const r0 = tel.sample(0, mkCtx(5, 10));   // prev=null → homeAbsorbing false
  assert(r0.homeAbsorbing === false && r0.homeJobsDelta === 0, 'próbka 0: brak historii → homeAbsorbing=false, delta 0');
  assert(r0.jobs === 10 && r0.unemployed === 5 && r0.unfilledJobs === 0, 'pola POP z civSystem (jobs=10, unemp=5)');
  const r1 = tel.sample(1, mkCtx(6, 13));   // jobs 10→13 (rośnie) → absorbing
  assert(r1.homeAbsorbing === true && r1.homeJobsDelta === 3, 'próbka 1: jobs rosną 10→13 → homeAbsorbing=true (delta 3)');
  assert(r1.class === POP_CLASS.BUFFER, 'rosnące etaty (absorpcja) → BUFFER mimo braku ekspansji');
  const r2 = tel.sample(2, mkCtx(7, 13));   // jobs 13→13 (płasko) → NIE absorbing, brak ekspansji → WASTED
  assert(r2.homeAbsorbing === false, 'próbka 2: jobs płaskie 13→13 → homeAbsorbing=false');
  assert(r2.class === POP_CLASS.WASTED, 'płaskie etaty + brak ekspansji + nadwyżka → WASTED (realny glut)');
  assert(tel.getSeries().length === 3, 'seria zebrała 3 wiersze');
}

// ── T5: realny GameCore boot + sample (guard dryfu API) ───────────
console.log('\nT5 — realny boot + ticki + sample (API POP/grid, self-consistency zajętości)');
{
  reseed('balans-pop-keeper');
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: 'GOOD_FE' });
  const K = window.KOSMOS;
  const home = core.colonyManager.getColony(K.homePlanet.id);
  const catalog = new ActionCatalog({ colonyManager: core.colonyManager, techSystem: core.techSystem, resourceSystem: core.resourceSystem, buildingSystem: core.buildingSystem, vesselManager: core.vesselManager, civSystem: core.civSystem, starSystemManager: core.starSystemManager });
  const bot = new RuleBot();
  const ticker = new Ticker(core.timeSystem);
  ticker.onCivYear(() => { for (let d = 0; d < 4; d++) { let a; try { a = bot.decideAction({ homeAlive: true }, catalog); } catch { continue; } if (a) { try { ActionAdapter.execute(a); } catch {} } } });
  ticker.run(36, { tickSize: 1.0 });   // 3 gy
  assert(!ticker._crashed, 'boot + 3gy ticków bez crasha');

  const ctx = { home, colonyManager: core.colonyManager, vesselManager: core.vesselManager };
  const row = PopTelemetry.snapshot(3, ctx);
  assert(row.pop > 0 && row.jobs > 0, `realne pola POP (pop=${row.pop}, jobs=${row.jobs})`);
  assert(row.buildableTiles > 0, `grid ma zabudowywalne kafle (${row.buildableTiles})`);
  assert(row.occupiedTiles > 0, `są zajęte kafle (${row.occupiedTiles}) — czytane z isOccupied`);
  assert([POP_CLASS.TIGHT, POP_CLASS.BOUND, POP_CLASS.BUFFER, POP_CLASS.WASTED].includes(row.class),
    `klasa z dozwolonego zbioru (${row.class})`);

  // Self-consistency: occupiedTiles == liczba zabudowywalnych kafli z isOccupied (ta sama reguła co _active)
  let manualOcc = 0;
  for (const t of home.grid.toArray()) {
    const terr = TERRAIN_TYPES[t.type];
    if (terr?.buildable && !t.damaged && t.isOccupied) manualOcc++;
  }
  assert(row.occupiedTiles === manualOcc, `occupiedTiles (${row.occupiedTiles}) == ręczne zliczenie isOccupied (${manualOcc})`);
  // Zajętość odzwierciedla realną zabudowę (nie zaniżony buildingId): powinno być ≥ kilku budynków.
  assert(row.occupiedTiles >= 5, `zajętość odzwierciedla realną zabudowę (${row.occupiedTiles} ≥ 5, nie zaniżony buildingId)`);
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
