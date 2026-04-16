// Test Step 2 — weryfikuje że GameCore.boot() tworzy kompletny stan gry
import './env.js';
import { GameCore } from './GameCore.js';

console.log('─── Boot Test Step 2 ───');

const core = new GameCore();
try {
  const state = core.boot({ quiet: false });

  // Asserts
  const tests = [];

  tests.push(['star generated', !!state.star && state.star.name]);
  tests.push(['planets generated', state.planets && state.planets.length >= 5]);
  tests.push(['home planet = rocky', state.homePlanet?.planetType === 'rocky']);
  tests.push(['home planet lifeScore=100', state.homePlanet?.lifeScore === 100]);
  tests.push(['home planet in HZ', (() => {
    const hz = state.star.habitableZone;
    const a = state.homePlanet?.orbital?.a;
    return hz && a && a >= hz.min && a <= hz.max;
  })()]);
  tests.push(['colony registered', !!state.colony && state.colony.planetId === state.homePlanet.id]);
  tests.push(['colony has grid', !!state.grid]);
  tests.push(['civMode=true', window.KOSMOS.civMode === true]);
  tests.push(['homePlanet in KOSMOS', window.KOSMOS.homePlanet?.id === state.homePlanet.id]);
  tests.push(['resourceSystem present', !!window.KOSMOS.resourceSystem]);
  tests.push(['techSystem present', !!window.KOSMOS.techSystem]);
  tests.push(['buildingSystem present', !!window.KOSMOS.buildingSystem]);
  tests.push(['colonyManager has 1 colony', window.KOSMOS.colonyManager.getAllColonies().length === 1]);
  tests.push(['empires spawned', window.KOSMOS.empireRegistry.listAll().length >= 1]);
  tests.push(['galaxy data present', !!window.KOSMOS.galaxyData]);
  tests.push(['leader set', !!window.KOSMOS.leaderSystem.activeLeader]);
  tests.push(['gameState reset', !!window.KOSMOS.gameState]);

  // Starter buildings placed?
  const activeBuildings = window.KOSMOS.buildingSystem._active;
  tests.push(['3 starter buildings', activeBuildings && activeBuildings.size === 3]);

  // Show some stats
  console.log('\n── State Summary ──');
  console.log(`  Star: ${state.star.name} (${state.star.spectralType})`);
  console.log(`  Planets: ${state.planets.length}`);
  console.log(`  Home: ${state.homePlanet.name} (T=${Math.round(state.homePlanet.temperatureC)}°C, orbit=${state.homePlanet.orbital?.a?.toFixed(2)} AU)`);
  console.log(`  Moons total: ${state.moons.length}, Planetoids: ${state.planetoids.length}`);
  console.log(`  Empires: ${window.KOSMOS.empireRegistry.listAll().length}`);
  console.log(`  Starter buildings: ${activeBuildings.size}`);
  console.log(`  Resources (partial): Fe=${window.KOSMOS.resourceSystem.getAmount('Fe')}, food=${window.KOSMOS.resourceSystem.getAmount('food')}, research=${window.KOSMOS.resourceSystem.getAmount('research')}`);
  console.log('');

  // Raport
  let fail = 0;
  for (const [name, ok] of tests) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    if (!ok) fail++;
  }

  console.log(`\n${fail === 0 ? '✅ STEP 2 SUCCESS' : `❌ STEP 2 FAILED (${fail}/${tests.length})`}`);
  process.exit(fail === 0 ? 0 : 1);

} catch (err) {
  console.error('❌ Boot crashed:', err);
  console.error(err.stack);
  process.exit(1);
}
