// ═══════════════════════════════════════════════════════════════
// PROBE (pomiar, Slice 5A target 5) — early-game Fe squeeze
// Uruchom: node src/testing/headless/probe-fe-squeeze.mjs
// ───────────────────────────────────────────────────────────────
// Pytanie Filipa: czy dobra konsumpcyjne (basic_supplies: Fe:3) dławią Fe wcześnie
// vs wydobycie? Mierzymy REALNĄ ekonomię (bootstrap Industrialist, BEZ wstrzykiwania):
// Fe stock + Fe/rok + produkcja basic_supplies (×3 Fe) i structural_alloys (×8 Fe) vs
// urobek kopalń. Atrybucja: który konsument faktycznie drenuje Fe wcześnie.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }          from '../../systems/ColonyManager.js';
import { EmpireRegistry }         from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap }  from '../../systems/EmpireColonyBootstrap.js';
import { ColonyAutoExpander }     from '../../systems/ColonyAutoExpander.js';
import { INDUSTRIALIST }          from '../../data/EmpireArchetypeIndustrialist.js';

const dep = (resourceId, remaining, richness = 0.6) => ({ resourceId, richness, totalAmount: remaining, remaining });
EntityManager.add({
  id: 'home', name: 'Home', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 288, temperatureC: 15, surfaceGravity: 1.0,
  deposits: [dep('Fe', 9e5), dep('Si', 9e5), dep('Cu', 5e5), dep('C', 9e5)],
  systemId: 'sys', composition: { Fe: 0.25, Si: 0.2, Cu: 0.05, C: 0.2, O: 0.25 },
});
const techStub = new Proxy({}, { get: (_t, p) => p === 'getTerrainUnlocks' ? () => [] : p === 'isResearched' ? () => true : () => 1 });
const colonyManager = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  civMode: true, timeSystem: { gameTime: 0 }, colonyManager, empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: { getSystem: (id) => id === 'sys' ? { planetIds: ['home'], moonIds: [], planetoidIds: [] } : null },
  galaxyData: { seed: 1, systems: [{ id: 'sys', x: 0, y: 0, z: 0 }] },
};
empireRegistry.createEmpire({ id: 'e', archetype: 'industrialist', homeSystemId: 'sys' });
EmpireColonyBootstrap.bootstrapHomeColony('e', INDUSTRIALIST, 'sys');
const _exp = new ColonyAutoExpander();
const home = colonyManager.getColony('home');
const reapply = () => { try { home.buildingSystem?._reapplyAllRates(); } catch {} };
reapply();

const res = home.resourceSystem, civ = home.civSystem, fs = home.factorySystem, bs = home.buildingSystem;

// Śledzenie produkcji basic_supplies / structural_alloys (przez factory:produced)
let bsProd = 0, saProd = 0;
EventBus.on('factory:produced', ({ commodityId, amount }) => {
  if (commodityId === 'basic_supplies') bsProd += amount;
  else if (commodityId === 'structural_alloys') saProd += amount;
});

const mineFeOut = () => {
  // urobek Fe/rok z kopalń (staffing-gated _cachedMineLevel × richness × depletion, tylko Fe)
  const lvl = bs._cachedMineLevel ?? 0;
  let out = 0;
  for (const d of (bs._deposits ?? [])) if (d.resourceId === 'Fe' && d.remaining > 0) out += lvl * 10 * d.richness * (d.remaining / d.totalAmount);
  return out;
};

console.log('cy  gy  | pop  Fe_stock  Fe/rok | mines(lvl) mineFe/rok | basic_supp/rok(×3Fe) struct_all/rok(×8Fe) | minerObsada');
console.log('--------+------------------------+----------------------+-------------------------------------------+-----------');
let cy = 0, lastBs = 0, lastSa = 0;
for (let block = 0; block < 12; block++) {
  const bs0 = bsProd, sa0 = saProd;
  for (let i = 0; i < 10; i++) {
    window.KOSMOS.timeSystem.gameTime += 1 / 12;
    EventBus.emit('time:tick', { deltaYears: 1 / 12, civDeltaYears: 1, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 });
    reapply();
    cy++;
  }
  const bsRate = (bsProd - bs0) / 10, saRate = (saProd - sa0) / 10;  // szt/civYear
  const mineLvl = bs._cachedMineLevel ?? 0;
  const minerC = civ.strata.miner?.count ?? 0, minerD = bs.getSlotDemand('miner');
  const feStock = res.getAmount('Fe'), feRate = res.getPerYear?.('Fe') ?? 0;
  console.log(`${String(cy).padStart(3)} ${(cy/12).toFixed(1).padStart(4)} | ${String(civ.population).padStart(3)} ${feStock.toFixed(0).padStart(8)} ${feRate.toFixed(1).padStart(7)} | ${(bs._active?.size?'':'')}${(mineFeOut()>0?'':'')}${String(mineLvl).padStart(6)}(lvl) ${mineFeOut().toFixed(1).padStart(9)} | ${bsRate.toFixed(2).padStart(11)} (${(bsRate*3).toFixed(1)}Fe) ${saRate.toFixed(2).padStart(9)} (${(saRate*8).toFixed(1)}Fe) | ${minerC}/${minerD}`);
}

console.log('\n═══ WNIOSEK ═══');
console.log('Porównaj: mineFe/rok (produkcja) vs (basic_supp×3 + struct_all×8) (konsumpcja Fe głównych dóbr).');
console.log('Jeśli basic_supplies×3 << struct_alloys×8 i << mineFe → dobra konsumpcyjne NIE są głównym drenem Fe.');
console.log('Jeśli Fe_stock spada do ~0 i Fe/rok ujemny → squeeze realny (ale źródło = struct_alloys/budowa, nie konsumpcja).');
