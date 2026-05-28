// ═══════════════════════════════════════════════════════════════
// Save migration test — v76 → v77 (Slice 2 S3 EmpireLogisticsSystem)
// Uruchom: node src/testing/headless/test-save-migration-v77.mjs
// ───────────────────────────────────────────────────────────────
// Mock save v76 (empire bez logistics, vessel bez assignedRouteId) → migrate()
// → empire.logistics defaulty + vessel.assignedRouteId===null, version===77, no crash.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { migrate, CURRENT_VERSION } from '../../systems/SaveMigration.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

ok('CURRENT_VERSION === 77', CURRENT_VERSION === 77);

// ── Mock save v76 ────────────────────────────────────────────────
const saveV76 = {
  version: 76,
  gameTime: 100,
  planets: [], moons: [], planetoids: [],
  civ4x: {
    civMode: true,
    gameState: {
      empires: {
        emp_a: { id: 'emp_a', archetype: 'industrialist', colonies: ['p1'], fleets: [] },
        emp_b: { id: 'emp_b', archetype: 'industrialist', colonies: [], fleets: [] },
      },
      intel: {}, diplomacy: { relations: {} }, wars: {}, battles: {}, invasions: {},
    },
    vesselManager: {
      vessels: [
        { id: 'v_1', shipId: 'hull_small', colonyId: 'p1' },
        { id: 'v_2', shipId: 'cargo_ship', colonyId: 'p1', assignedRouteId: 'preexisting' },
      ],
      nextId: 3,
    },
  },
};

let result, threw = false;
try { result = migrate(saveV76); }
catch (e) { threw = true; console.error('migrate threw:', e); }

ok('migrate nie rzuca', !threw);
ok('version === 77', result?.version === 77);
ok('brak error object', !result?.error);

const empires = result?.civ4x?.gameState?.empires ?? {};
ok('emp_a.logistics utworzony', !!empires.emp_a?.logistics);
ok('emp_a.logistics.routes = []', Array.isArray(empires.emp_a?.logistics?.routes) && empires.emp_a.logistics.routes.length === 0);
ok('emp_a.logistics.reserve = []', Array.isArray(empires.emp_a?.logistics?.reserve));
ok('emp_a.logistics.pendingBuildRoute = null', empires.emp_a?.logistics?.pendingBuildRoute === null);
ok('emp_a.logistics.stats defaults', empires.emp_a?.logistics?.stats?.built === 0 && empires.emp_a?.logistics?.stats?.dispatched === 0 && empires.emp_a?.logistics?.stats?.delivered === 0);
ok('emp_b.logistics też utworzony', !!empires.emp_b?.logistics);

const vessels = result?.civ4x?.vesselManager?.vessels ?? [];
const v1 = vessels.find(v => v.id === 'v_1');
const v2 = vessels.find(v => v.id === 'v_2');
ok('v_1.assignedRouteId = null (default)', v1?.assignedRouteId === null);
ok('v_2.assignedRouteId zachowany (preexisting)', v2?.assignedRouteId === 'preexisting');

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
