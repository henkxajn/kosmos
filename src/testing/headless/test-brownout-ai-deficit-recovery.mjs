// ═══════════════════════════════════════════════════════════════
// Blocker #1 — AI recovery under a REAL, sustained energy deficit.
// Uruchom: node src/testing/headless/test-brownout-ai-deficit-recovery.mjs on|off
//
// Cel: sprawdzić, czy Industrialist AI, wepchnięty w utrzymujący się deficyt
// energii (avail<1 → throttling kopalń przez energy brownout gate), ODBUDOWUJE
// się (ColonyAutoExpander dobudowuje solary → balance≥0 → avail→1), czy UTYKA
// trwale w throttled-regime bez odzysku.
//
// Izolacja: jedyny scarce input dla solara to Fe (throttlowane przez bramkę);
// Si/Cu/Ti obfite. Fe napływa TYLKO z throttlowanej kopalni na złożu mother_p.
// Jeśli gate zagładza Fe tak, że AI nie stać na solary → utyka (RED FLAG).
//
// Argument: 'on' (bramka aktywna) | 'off' (bramka wyłączona — A/B baseline).
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG }          from '../../config/GameConfig.js';
import { ColonyManager }        from '../../systems/ColonyManager.js';
import { EmpireRegistry }       from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { EmpireColonyMaintenance } from '../../systems/EmpireColonyMaintenance.js';
import { ColonyAutoExpander }   from '../../systems/ColonyAutoExpander.js';

const MODE = (process.argv[2] === 'off') ? 'off' : 'on';
GAME_CONFIG.FEATURES.energyBrownoutGate = (MODE === 'on');
console.log(`\n########## TRYB: energyBrownoutGate = ${GAME_CONFIG.FEATURES.energyBrownoutGate} ##########`);

const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const FE = (remaining = 100000) => ({ resourceId: 'Fe', richness: 1, totalAmount: remaining, remaining });
EntityManager.add({
  id: 'mother_p', name: 'Mother', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_x', deposits: [FE()],
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 10 },
  colonyManager,
  empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: {
    getSystem: (id) => id === 'sys_x' ? { planetIds: ['mother_p'], moonIds: [], planetoidIds: [] } : null,
  },
};

empireRegistry.createEmpire({ id: 'emp_I', archetype: 'industrialist', homeSystemId: 'sys_x' });
const mother = EmpireColonyBootstrap.bootstrapColony('emp_I', 'sys_x', 'mother_p', {
  startPop: { laborer: 2, worker: 1 }, startResources: { food: 500, water: 500 }, archetypeId: 'industrialist',
});
mother.civSystem.addPop('laborer', 10);   // pop → realna konsumpcja energii

const rs = mother.resourceSystem;
// Si/Cu/Ti OBFITE (nie-throttlowane, nie mają być wąskim gardłem); Fe SKĄPE (throttlowane wejście solara).
rs.receive({ Si: 1e5, Cu: 1e5, Ti: 1e5, C: 1e5, Fe: 30 });   // Fe: ~2 solary ze stocku, reszta z throttlowanej kopalni

// Systemy AI (subskrybują time:tick w konstruktorze)
new EmpireColonyMaintenance();       // _reapplyAllRates → świeży energy.balance dla AI co 1 civY
new ColonyAutoExpander();            // survival: balance<0 → build solar_farm (najwyższy priorytet)

// Odczyt bazowej energetyki, potem wstrzyknięcie utrzymującego się deficytu.
rs._reapplyAllRates?.();
const baseProd = rs.energy.production, baseCons = rs.energy.consumption;
// Drain tak dobrany, by AI potrzebowało ~+4-5 solarów (8e każdy) do odzysku — recoverable, ale nie trywialnie.
const DRAIN = -Math.round(baseProd * 0.9 + 30);
rs.registerProducer('debug_drain', { energy: DRAIN });
console.log(`bazowa energetyka: prod=${baseProd} cons=${baseCons} → drain=${DRAIN} (sztuczne obciążenie)`);

const countSolar = () => {
  let n = 0;
  for (const e of mother.buildingSystem._active.values()) if (e.building?.id === 'solar_farm') n += (e.level ?? 1);
  return n;
};
const snap = (cy) => {
  const avail = rs.getEnergyAvailability();
  console.log(
    `  cy${String(cy).padStart(2)}: bal=${rs.energy.balance.toFixed(1).padStart(6)} ` +
    `avail=${avail.toFixed(2)} brownout=${rs.energy.brownout ? 'T' : 'F'} ` +
    `solar=${countSolar()} Fe=${rs.getAmount('Fe').toFixed(0).padStart(4)} ` +
    `pop=${(mother.civSystem.population ?? 0).toFixed(0)} food=${rs.getAmount('food').toFixed(0)} ` +
    `alive=${colonyManager.getColony('mother_p') ? 'Y' : 'N'}`);
};

console.log('\n── Timeline (co 5 civY) ──');
snap(0);
const YEARS = 60, STEP = 1;   // 1 civY/tick
for (let cy = STEP; cy <= YEARS; cy += STEP) {
  rs.receive({ food: 200, water: 200 });                    // tylko survival (nie minerały) — izoluj energię
  window.KOSMOS.timeSystem.gameTime += STEP / 12;
  EventBus.emit('time:tick', { deltaYears: STEP / 12, civDeltaYears: STEP, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: STEP });
  if (cy % 5 === 0) snap(cy);
}

// ── Werdykt ──────────────────────────────────────────────────────
const finalBal   = rs.energy.balance;
const finalAvail = rs.getEnergyAvailability();
const finalSolar = countSolar();
const alive      = !!colonyManager.getColony('mother_p');
const food       = rs.getAmount('food');
console.log('\n── Werdykt ──');
console.log(`  końcowy: balance=${finalBal.toFixed(1)} avail=${finalAvail.toFixed(2)} solar=${finalSolar} alive=${alive} food=${food.toFixed(0)}`);
const recovered = finalBal >= 0 && finalAvail >= 1.0;
console.log(recovered
  ? `  ✅ ODZYSK: AI dobudowało solary (${finalSolar}), balance≥0, avail=1 — bramka NIE zablokowała odzysku.`
  : `  ⚠ BRAK PEŁNEGO ODZYSKU: balance=${finalBal.toFixed(1)}, avail=${finalAvail.toFixed(2)} — sprawdź czy utknęło czy tylko wolniej rośnie.`);
console.log(`  survival: kolonia ${alive ? 'ŻYJE' : 'ZNISZCZONA'}, food=${food.toFixed(0)} (${food > 0 ? 'brak głodu' : 'GŁÓD'}).`);
