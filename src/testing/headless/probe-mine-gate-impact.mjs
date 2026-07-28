// ═══════════════════════════════════════════════════════════════
// PROBE (pomiar, NIE test) — impact balansowy GATE'a wydobycia na obsadę
// Uruchom: node src/testing/headless/probe-mine-gate-impact.mjs
// ───────────────────────────────────────────────────────────────
// Report 2 fix-plan prep: JEŚLI zbramkujemy wydobycie przez obsadę górników
// (output × staffingFraction), ile to zabiera? Mierzymy:
//   (A) świeża kolonia planetoid gracza (0 górników) — teraz vs gate-hard vs floor 0.2
//   (B) AI industrialist gy0..gy40 — obsada górników w kopalniach realnie w czasie,
//       ile % dochodu mineralnego zabrałby gate (level-weighted staffing fraction).
// Bez zmian w kodzie gry — SYMULUJEMY gate przez _getBuildingLaborEfficiency (już liczone).
// ═══════════════════════════════════════════════════════════════

import './env.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { ResourceSystem }     from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem }     from '../../systems/BuildingSystem.js';
import { HexGrid }            from '../../map/HexGrid.js';
import { BUILDINGS }          from '../../data/BuildingsData.js';
import { BASE_MINE_RATE }     from '../../data/ResourcesData.js';
import { ColonyManager }          from '../../systems/ColonyManager.js';
import { EmpireRegistry }         from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap }  from '../../systems/EmpireColonyBootstrap.js';
import { ColonyAutoExpander }     from '../../systems/ColonyAutoExpander.js';
import { INDUSTRIALIST }          from '../../data/EmpireArchetypeIndustrialist.js';
import { GAME_CONFIG }            from '../../config/GameConfig.js';

const FLOOR = GAME_CONFIG.MINE_STAFF_FLOOR;   // SHIPPED = 0 (twarda bramka, decyzja Filipa)

const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks')       return () => [];
    if (prop === 'isResearched')            return () => true;
    if (prop === 'isAllAutonomous')         return () => false;
    if (prop === 'getAutonomousEfficiency') return () => 1.0;
    return () => 1;
  },
});

// Enumeruj kopalnie kolonii → [{tileKey, level, isAutonomous, eff}]
const mineRows = (bSys) => {
  const rows = [];
  for (const [tileKey, entry] of bSys._active.entries()) {
    const b = entry.building;
    if (!(b?.isMine || b?.id === 'mine')) continue;
    const eff = bSys._getBuildingLaborEfficiency(b, tileKey);
    rows.push({ tileKey, id: b.id, level: entry.level ?? 1, isAutonomous: !!b.isAutonomous, eff });
  }
  return rows;
};
// Level-weighted staffing fraction (= ratio dochodu po gate, per wariant)
const gateRatio = (rows, floor = 0) => {
  let lvl = 0, gated = 0;
  for (const m of rows) {
    lvl += m.level;
    gated += m.level * Math.max(floor, Math.min(1, m.eff));
  }
  return lvl > 0 ? gated / lvl : 1;
};

// ═══ (A) ŚWIEŻA KOLONIA GRACZA — planetoid, 0 górników ═══
console.log('═══ (A) ŚWIEŻA KOLONIA GRACZA: planetoid, 3 POP (2 eng, 1 lab, 0 miner), 2 kopalnie L1 ═══');
{
  globalThis.window = globalThis.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 0 } };
  const planet = { id: 'ast', name: 'Ast', type: 'planetoid', planetType: 'planetoid', atmosphere: 'none' };
  const deposits = [{ resourceId: 'Fe', richness: 0.6, totalAmount: 100000, remaining: 100000 }];
  const grid = new HexGrid(8, 8); grid.forEach(t => { t.type = 'mountains'; });
  const resSys = new ResourceSystem({ energy: 500, Fe: 0 });
  const civSys = new CivilizationSystem({ population: 0 }, techStub, planet);
  civSys.resourceSystem = resSys;
  const bSys = new BuildingSystem(resSys, civSys, techStub);
  civSys.buildingSystem = bSys; bSys._grid = grid; bSys._gridHeight = grid.height; bSys.setDeposits(deposits);
  civSys.strata.engineer.count = 2; civSys.strata.laborer.count = 1; civSys.strata.miner.count = 0;
  bSys.restoreFromSave([
    { buildingId: 'autonomous_solar_farm', tileKey: '0,0', level: 3, baseRates: BUILDINGS.autonomous_solar_farm.rates },
    { buildingId: 'mine', tileKey: '2,0', level: 1 },
    { buildingId: 'mine', tileKey: '3,0', level: 1 },
  ]);
  bSys._mineLevelDirty = true;
  const rows = mineRows(bSys);
  const baseOut = rows.reduce((s, m) => s + m.level, 0) * BASE_MINE_RATE * 0.6;   // pełne złoże
  console.log(`  miner obsada: ${civSys.strata.miner.count} / demand ${bSys.getSlotDemand('miner')}  → per-mine eff = ${rows.map(m => m.eff.toFixed(2)).join(', ')}`);
  console.log(`  PRZED gate:                 ${baseOut.toFixed(1)} Fe/rok`);
  console.log(`  SHIPPED (floor ${FLOOR} = twarda): ${(baseOut * gateRatio(rows, FLOOR)).toFixed(1)} Fe/rok   (×${gateRatio(rows, FLOOR).toFixed(2)})`);
  console.log(`  (ref) łagodna floor 0.2:    ${(baseOut * gateRatio(rows, 0.2)).toFixed(1)} Fe/rok   (×${gateRatio(rows, 0.2).toFixed(2)})`);
  console.log('  → decyzja Filipa: TWARDA bramka (floor 0) — nieobsadzona kopalnia = ZERO. Presja na obsadę/droidy/kolonistów.');
}

// ═══ (B) AI INDUSTRIALIST gy0..gy40 — realna obsada górników w czasie ═══
console.log('\n═══ (B) AI INDUSTRIALIST: obsada górników w kopalniach realnie w czasie (gate = ile % zabiera) ═══');
{
  EntityManager.clear?.();
  const dep = (resourceId, remaining, richness = 0.6) => ({ resourceId, richness, totalAmount: remaining, remaining });
  const mk = (id, name, sys, atm, deposits) => EntityManager.add({
    id, name, type: 'planet', planetType: 'rocky', radius: 1, mass: 1, atmosphere: atm,
    temperatureK: 280, deposits, systemId: sys, composition: { Fe: 0.25, Si: 0.2, Cu: 0.05, C: 0.2, O: 0.25 },
  });
  mk('ind_home', 'Ind Home', 'sys_ind', 'breathable', [dep('Fe', 9e5), dep('Si', 9e5), dep('Cu', 5e5), dep('Ti', 4e5), dep('C', 9e5)]);
  mk('ind_rk2',  'Ind Rk2',  'sys_ind', 'breathable', [dep('Fe', 5e5), dep('Si', 5e5), dep('C', 5e5)]);

  const colonyManager  = new ColonyManager(techStub);
  const empireRegistry = new EmpireRegistry();
  globalThis.window = globalThis.window ?? {};
  window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 0 }, colonyManager, empireRegistry,
    empireColonyBootstrap: EmpireColonyBootstrap,
    starSystemManager: { getSystem: (id) => id === 'sys_ind' ? { planetIds: ['ind_home', 'ind_rk2'], moonIds: [], planetoidIds: [] } : null },
    galaxyData: { seed: 1, systems: [{ id: 'sys_ind', x: 0, y: 0, z: 0 }] },
  };
  empireRegistry.createEmpire({ id: 'emp_ind', archetype: 'industrialist', homeSystemId: 'sys_ind' });
  EmpireColonyBootstrap.bootstrapHomeColony('emp_ind', INDUSTRIALIST, 'sys_ind');
  const _expander = new ColonyAutoExpander();
  const reapply = () => { for (const c of empireRegistry.getColoniesByEmpire('emp_ind')) try { c.buildingSystem?._reapplyAllRates(); } catch {} };
  reapply();

  const home = colonyManager.getColony('ind_home');
  console.log('gy   | miners  minerDemand  mines(lvl)  avgEff   Ti/rok  |  gate-hard  gate-floor0.2');
  console.log('-----+----------------------------------------------------+------------------------');
  let cy = 0;
  for (let block = 0; block < 8; block++) {
    for (let i = 0; i < 60; i++) {
      window.KOSMOS.timeSystem.gameTime += 1 / 12;
      EventBus.emit('time:tick', { deltaYears: 1 / 12, civDeltaYears: 1, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 });
      reapply();
    }
    cy += 60;
    const rows = mineRows(home.buildingSystem);
    const mCount = home.civSystem.strata.miner.count;
    const mDemand = home.buildingSystem.getSlotDemand('miner');
    const totLvl = rows.reduce((s, m) => s + m.level, 0);
    const avgEff = gateRatio(rows, 0);
    const tiRate = home.resourceSystem.getPerYear?.('Ti') ?? 0;
    console.log(`${String((cy / 12).toFixed(1)).padStart(4)} | ${String(mCount).padStart(6)} ${String(mDemand).padStart(11)} ${(rows.length + '(' + totLvl + ')').padStart(11)} ${avgEff.toFixed(3).padStart(7)} ${tiRate.toFixed(1).padStart(7)}  | ${('×' + gateRatio(rows, 0).toFixed(2)).padStart(9)}  ${('×' + gateRatio(rows, FLOOR).toFixed(2)).padStart(11)}`);
  }
  console.log('  avgEff = level-weighted staffing fraction kopalń = mnożnik dochodu po gate (1.00 = brak zmiany).');
}
