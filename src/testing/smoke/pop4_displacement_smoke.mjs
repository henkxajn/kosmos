// Population 2.0 (Faza 4) — FIX B: dane dialogu wyparcia (getSyntheticDisplacement).
// Pinuje N (wyparci) i M (wolne etaty na kolonii) dla staffed / unstaffed / partial / free-slots.
// Uruchom: node src/testing/smoke/tmp_pop4_displacement_smoke.mjs

import '../headless/env.js'; // MUST be first
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { HexGrid } from '../../map/HexGrid.js';

window.KOSMOS = { civMode: true, timeSystem: { gameTime: 0 } };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

/** Postaw budynki (real _activateBuilding → demand+employedPops), potem RĘCZNIE ustaw obsadę strat. */
function setup(buildings) {
  const grid = new HexGrid(10, 12); grid.forEach(t => { t.type = 'plains'; });
  const res = new ResourceSystem({ automation_droid: 99 });
  const civ = new CivilizationSystem({}, null, { id: 'disp', atmosphere: 'breathable' });
  civ.resourceSystem = res;
  const bs = new BuildingSystem(res, civ, null); civ.buildingSystem = bs;
  bs._grid = grid; bs._gridHeight = grid.height;
  window.KOSMOS.civSystem = civ;
  for (const s of Object.values(civ.strata)) s.count = 0;
  civ._unemployed = 0;
  const keys = []; grid.forEach(t => { if (keys.length < 12) keys.push(`${t.q},${t.r}`); });
  const tks = [];
  buildings.forEach((bid, i) => { const key = keys[i]; const [q, r] = key.split(',').map(Number); bs._activateBuilding(key, bid, grid.get(q, r).r, grid.get(q, r).type, false); tks.push(key); });
  return { civ, bs, tks };
}

// ── (1) STAFFED, brak wolnych etatów → wyparcie + warning (M < N) ──
console.log('--- (1) staffed full, brak wolnych etatów → displaced=1, freeSlots=0, warn ---');
{
  const { civ, bs, tks } = setup(['solar_farm']);   // 1 etat laborer
  civ.strata.laborer.count = 1;                       // w pełni obsadzony
  const d = bs.getSyntheticDisplacement(tks[0]);
  console.log(`    displaced=${d.displaced} freeSlots=${d.freeSlots} staffed=${d.staffed}`);
  ok('(1a) displaced === 1', d.displaced === 1);
  ok('(1b) freeSlots === 0', d.freeSlots === 0);
  ok('(1c) staffed === true (dialog pokazany)', d.staffed === true);
  ok('(1d) warning gdy freeSlots < displaced', d.freeSlots < d.displaced);
  civ.dispose();
}

// ── (2) UNSTAFFED → brak dialogu (displaced=0) ──
console.log('--- (2) unstaffed → displaced=0, staffed=false (bez dialogu) ---');
{
  const { civ, bs, tks } = setup(['solar_farm']);
  civ.strata.laborer.count = 0;                       // nikt nie pracuje
  const d = bs.getSyntheticDisplacement(tks[0]);
  ok('(2a) displaced === 0', d.displaced === 0);
  ok('(2b) staffed === false (brak dialogu)', d.staffed === false);
  civ.dispose();
}

// ── (3) STAFFED + WOLNY etat w innej stracie → brak warningu (M >= N) ──
console.log('--- (3) staffed + wolny etat miner → displaced=1, freeSlots=1, brak warningu ---');
{
  const { civ, bs, tks } = setup(['solar_farm', 'smelter']);   // laborer + miner
  civ.strata.laborer.count = 1;   // laborer obsadzony
  civ.strata.miner.count   = 0;   // miner WOLNY etat (absorpcja)
  const d = bs.getSyntheticDisplacement(tks[0]);   // instalacja na laborer
  console.log(`    displaced=${d.displaced} freeSlots=${d.freeSlots}`);
  ok('(3a) displaced === 1', d.displaced === 1);
  ok('(3b) freeSlots === 1 (wolny etat miner)', d.freeSlots === 1);
  ok('(3c) staffed === true', d.staffed === true);
  ok('(3d) BRAK warningu (freeSlots >= displaced)', !(d.freeSlots < d.displaced));
  civ.dispose();
}

// ── (4) PARTIAL (niedobsadzona strata) → luz wchłania automatyzację, displaced=0 (brak over-reportu) ──
console.log('--- (4) partial: 3 etaty laborer, 2 pracowników → automatyzacja 1 etatu displaced=0 ---');
{
  const { civ, bs, tks } = setup(['solar_farm', 'solar_farm', 'solar_farm']);   // 3 etaty laborer
  civ.strata.laborer.count = 2;    // niedobsada (2 z 3) — 1 etat i tak pusty
  const d = bs.getSyntheticDisplacement(tks[0]);
  ok('(4a) displaced === 0 (luz wchłania automatyzację, nikt nie wyparty)', d.displaced === 0);
  ok('(4b) staffed === false (brak dialogu przy niedobsadzie)', d.staffed === false);
  civ.dispose();
}

// ── (5) PARTIAL pełna obsada wielo-etatowej straty → automatyzacja 1 z 3 wypiera 1 ──
console.log('--- (5) 3 etaty laborer, 3 pracowników → automatyzacja 1 wypiera 1 ---');
{
  const { civ, bs, tks } = setup(['solar_farm', 'solar_farm', 'solar_farm']);
  civ.strata.laborer.count = 3;    // pełna obsada
  const d = bs.getSyntheticDisplacement(tks[0]);
  ok('(5a) displaced === 1', d.displaced === 1);
  ok('(5b) freeSlots === 0 (reszta etatów obsadzona)', d.freeSlots === 0);
  ok('(5c) staffed === true', d.staffed === true);
  civ.dispose();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
