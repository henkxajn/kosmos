// ═══════════════════════════════════════════════════════════════
// Save migration test — v77 → v78 (TechDebt Faza 1: save/restore AI #2)
// Uruchom: node src/testing/headless/test-save-migration-v78.mjs
// ───────────────────────────────────────────────────────────────
// Mock save v77 (bez empireTech/empireStrategy) → migrate() → lazy defaults
// civ4x.empireTech={} + civ4x.empireStrategy={blacklist:[]}, version===78, no crash.
// Idempotencja: istniejące empireTech/empireStrategy NIE są nadpisywane.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { migrate, CURRENT_VERSION } from '../../systems/SaveMigration.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// CURRENT_VERSION bump w S3.0a commit (a): 78 → 79 (spłaszczenie paliwa).
// Migrate() chainuje v77 → v79; logika v77→v78 (empireTech/empireStrategy) dalej weryfikowana niżej.
ok('CURRENT_VERSION === 79', CURRENT_VERSION === 79);

// ── Mock save v77 (brak empireTech/empireStrategy) ───────────────
const saveV77 = {
  version: 77,
  gameTime: 100,
  planets: [], moons: [], planetoids: [],
  civ4x: {
    civMode: true,
    colonies: [{ planetId: 'p1', isOutpost: false }],
    gameState: {
      empires: {
        emp_a: {
          id: 'emp_a', archetype: 'industrialist', colonies: ['p1'], fleets: [],
          logistics: { routes: [], reserve: [], pendingBuildRoute: null, stats: { built: 0, dispatched: 0, delivered: 0 } },
        },
      },
      intel: {}, diplomacy: { relations: {} }, wars: {}, battles: {}, invasions: {},
    },
  },
};

let result, threw = false;
try { result = migrate(saveV77); }
catch (e) { threw = true; console.error('migrate threw:', e); }

ok('migrate nie rzuca', !threw);
ok('version === 79 (chain v77→v79)', result?.version === 79);
ok('brak error object', !result?.error);
ok('empireTech default {} (obiekt)', result?.civ4x?.empireTech && typeof result.civ4x.empireTech === 'object');
ok('empireTech puste (stary save → fallback runtime)', Object.keys(result?.civ4x?.empireTech ?? { x: 1 }).length === 0);
ok('empireStrategy.blacklist = []', Array.isArray(result?.civ4x?.empireStrategy?.blacklist) && result.civ4x.empireStrategy.blacklist.length === 0);
// Istniejące pola nietknięte (logistics z v77)
ok('empire.logistics zachowany', !!result?.civ4x?.gameState?.empires?.emp_a?.logistics);

// ── Idempotencja: istniejące empireTech/empireStrategy NIE nadpisane ──
const saveV77b = {
  version: 77, gameTime: 50, planets: [], moons: [], planetoids: [],
  civ4x: {
    civMode: true,
    empireTech: { emp_x: ['robotics', 'metallurgy'] },
    empireStrategy: { blacklist: [['body_b', { sinceCivYear: 1, retryAtCivYear: 31 }]] },
    gameState: { empires: {}, intel: {}, diplomacy: { relations: {} }, wars: {}, battles: {}, invasions: {} },
  },
};
const r2 = migrate(saveV77b);
ok('idempotent: empireTech.emp_x zachowany', r2?.civ4x?.empireTech?.emp_x?.includes('robotics'));
ok('idempotent: blacklist zachowany', r2?.civ4x?.empireStrategy?.blacklist?.length === 1);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
