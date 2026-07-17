// PROBE (pomiar, NIE test) — czy zmiana warpSpeedLY 2.0→18.0 dociera do realnego dispatchu?
// Uruchom: node src/testing/headless/probe-warp-speed.mjs
import './env.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { calcShipStats } from '../../data/ShipModulesData.js';
import { HULLS } from '../../data/HullsData.js';

const vm = new VesselManager();

// Minimalny świat: 2 gwiazdy 6 LY od siebie + zegar
window.KOSMOS = {
  vesselManager: vm,
  timeSystem: { gameTime: 100.0 },
  galaxyData: { systems: [
    { id: 'sys_home', name: 'Dom',  x: 0, y: 0, z: 0 },
    { id: 'sys_b',    name: 'Beta', x: 6, y: 0, z: 0 },
  ] },
  starSystemManager: { hasBeacon: () => false, getSystem: () => null },
};

const MODS = ['engine_warp', 'warp_tank'];
const v = vm.createAndRegister('hull_medium', 'home', { modules: MODS });
v.position.state = 'docked';
v.systemId = 'sys_home';
v.warpFuel.current = v.warpFuel.max;   // pełny bak warp

const stats = calcShipStats(HULLS.hull_medium, MODS);
console.log('projekt: hull_medium + engine_warp + warp_tank');
console.log('  stats.warpSpeedLY =', stats.warpSpeedLY, '(z modułu; po zmianie ma być 18)');
console.log('  bak warp =', v.warpFuel.max, 'rdzeni | zużycie', v.warpFuel.consumption, '/LY');

const ok = vm.dispatchInterstellar(v.id, 'sys_b');
console.log('\ndispatchInterstellar ->', ok);
const m = v.mission;
console.log('  mission.warpSpeed  =', m.warpSpeed, 'LY/rok');
console.log('  mission.distLY     =', m.distLY.toFixed(2));
console.log('  czas przelotu      =', (m.arrivalYear - m.departYear).toFixed(3), 'lat gry');
console.log('  (przy starym 2.0   =', (m.distLY / 2.0).toFixed(3), 'lat gry)');

// Ile trwa dolot po wyjściu z warpa? Statek ląduje na krawędzi ~30 AU.
console.log('\npo wyjściu z warpa statek ląduje 30 AU od gwiazdy:');
console.log('  sublight =', stats.speed.toFixed(2), 'AU/rok -> dolot do środka układu =',
  (30 / stats.speed).toFixed(2), 'lat gry');
