// Smoke P3-1: weapon rangeAU + tech multipliers + TechSystem.getMultiplier
// Uruchom: node tmp_m4_p3_1_smoke.mjs
import { SHIP_MODULES } from './src/data/ShipModulesData.js';
import { TECHS } from './src/data/TechData.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
}
function eq(name, actual, expected) {
  ok(name + ' (got ' + JSON.stringify(actual) + ')', actual === expected);
}

console.log('--- T1: Weapon rangeAU + fireCooldownYears + category ---');
const laser   = SHIP_MODULES.weapon_laser.stats;
const kinetic = SHIP_MODULES.weapon_kinetic.stats;
const missile = SHIP_MODULES.weapon_missile.stats;
eq('weapon_laser.rangeAU',           laser.rangeAU, 0.05);
eq('weapon_laser.fireCooldownYears', laser.fireCooldownYears, 0.3);
eq('weapon_laser.category',          laser.category, 'short');
eq('weapon_laser.range (legacy)',    laser.range, 'short');
eq('weapon_kinetic.rangeAU',           kinetic.rangeAU, 0.15);
eq('weapon_kinetic.fireCooldownYears', kinetic.fireCooldownYears, 0.5);
eq('weapon_kinetic.category',          kinetic.category, 'medium');
eq('weapon_missile.rangeAU',           missile.rangeAU, 0.30);
eq('weapon_missile.fireCooldownYears', missile.fireCooldownYears, 1.0);
eq('weapon_missile.category',          missile.category, 'long');
// orbital_strike_battery: bez rangeAU (orbital, nie deep-space)
ok('orbital_strike_battery brak rangeAU', SHIP_MODULES.orbital_strike_battery.stats.rangeAU === undefined);

console.log('\n--- T2: TECHS schema (multiplier/category/value) ---');
const wo  = TECHS.weapon_optics;
const kt  = TECHS.kinetic_targeting;
const mga = TECHS.missile_guidance_ai;
const rfa = TECHS.range_finder_array;
const as1 = TECHS.advanced_sensors_1;
const as2 = TECHS.advanced_sensors_2;
const as3 = TECHS.advanced_sensors_3;

ok('weapon_optics istnieje', !!wo);
ok('kinetic_targeting istnieje', !!kt);
ok('missile_guidance_ai istnieje', !!mga);
ok('range_finder_array istnieje', !!rfa);
ok('advanced_sensors_1 istnieje', !!as1);
ok('advanced_sensors_2 istnieje', !!as2);
ok('advanced_sensors_3 istnieje', !!as3);

const woFx = wo.effects.find(e => e.type === 'multiplier' && e.category === 'weapon_range_short');
ok('weapon_optics ma multiplier weapon_range_short', !!woFx && woFx.value === 1.25);

const ktRange = kt.effects.find(e => e.type === 'multiplier' && e.category === 'weapon_range_medium');
const ktTrack = kt.effects.find(e => e.type === 'multiplier' && e.category === 'weapon_tracking_medium');
ok('kinetic_targeting ma weapon_range_medium ×1.3', !!ktRange && ktRange.value === 1.30);
ok('kinetic_targeting ma weapon_tracking_medium ×1.1', !!ktTrack && ktTrack.value === 1.10);

const mgaRange = mga.effects.find(e => e.type === 'multiplier' && e.category === 'weapon_range_long');
const mgaTrack = mga.effects.find(e => e.type === 'multiplier' && e.category === 'weapon_tracking_long');
ok('missile_guidance_ai ma weapon_range_long ×1.5', !!mgaRange && mgaRange.value === 1.50);
ok('missile_guidance_ai ma weapon_tracking_long ×1.1', !!mgaTrack && mgaTrack.value === 1.10);

const rfaFx = rfa.effects.find(e => e.type === 'multiplier' && e.category === 'weapon_range_all');
ok('range_finder_array ma weapon_range_all ×1.15', !!rfaFx && rfaFx.value === 1.15);

const as1Fx = as1.effects.find(e => e.type === 'multiplier' && e.category === 'sensor_range');
ok('advanced_sensors_1 ma sensor_range ×1.25', !!as1Fx && as1Fx.value === 1.25);

console.log('\n--- T3: TechSystem.getMultiplier ---');
// Mock minimal TechSystem bez EventBus/i18n side effects
// (TechSystem importuje EventBus/i18n/FactionSystem → ich konstruktor dotyka globalState
// Symulujemy logikę getMultiplier bezpośrednio z TECHS):
function simulateGetMultiplier(researched, category) {
  let m = 1.0;
  for (const id of researched) {
    const tech = TECHS[id];
    if (!tech?.effects) continue;
    for (const fx of tech.effects) {
      if (fx.type === 'multiplier' && fx.category === category) m *= fx.value;
    }
  }
  return m;
}

eq('getMultiplier(weapon_range_short) bez tech',
   simulateGetMultiplier(new Set(), 'weapon_range_short'), 1.0);
eq('getMultiplier(weapon_range_short) z weapon_optics',
   simulateGetMultiplier(new Set(['weapon_optics']), 'weapon_range_short'), 1.25);
// Każda kategoria liczona osobno. DSCS multiplikuje weapon.category × weapon_range_all w _resolveWeaponRange.
eq('getMultiplier(weapon_range_short) z weapon_optics + range_finder_array (osobno)',
   simulateGetMultiplier(new Set(['weapon_optics', 'range_finder_array']), 'weapon_range_short'),
   1.25);
eq('getMultiplier(weapon_range_all) z range_finder_array',
   simulateGetMultiplier(new Set(['range_finder_array']), 'weapon_range_all'),
   1.15);
// DSCS effective: short × all → 1.25 × 1.15 = 1.4375
const effectiveShort = simulateGetMultiplier(new Set(['weapon_optics', 'range_finder_array']), 'weapon_range_short')
                     * simulateGetMultiplier(new Set(['weapon_optics', 'range_finder_array']), 'weapon_range_all');
ok('DSCS effective short × all = 1.4375', Math.abs(effectiveShort - 1.4375) < 1e-9);
eq('getMultiplier(sensor_range) z advanced_sensors_1+2+3 ≈ 2.0',
   Math.round(simulateGetMultiplier(new Set(['advanced_sensors_1', 'advanced_sensors_2', 'advanced_sensors_3']), 'sensor_range') * 1000) / 1000,
   Math.round(1.25 * 1.20 * 1.333 * 1000) / 1000);
eq('getMultiplier(unknown) zwraca 1.0',
   simulateGetMultiplier(new Set(['weapon_optics']), 'totally_unknown'), 1.0);

console.log('\n--- T4: GameConfig FEATURES.m4DeepSpaceCombat + WEAPON_*_AU ---');
// Stub localStorage przed importem GameConfig (i18n.js wymaga w runtime przeglądarki)
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}
const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
// Flag existuje (od P3-1; flipnięte na true w P3-3 gdy fire działa).
ok('FEATURES.m4DeepSpaceCombat defined (bool)',
   typeof GAME_CONFIG.FEATURES.m4DeepSpaceCombat === 'boolean');
eq('WEAPON_SHORT_AU',     GAME_CONFIG.WEAPON_SHORT_AU, 0.05);
eq('WEAPON_MED_AU',       GAME_CONFIG.WEAPON_MED_AU, 0.15);
eq('WEAPON_LONG_AU',      GAME_CONFIG.WEAPON_LONG_AU, 0.30);
eq('COMBAT_DISENGAGE_AU', GAME_CONFIG.COMBAT_DISENGAGE_AU, 0.50);

console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail > 0 ? 1 : 0);
