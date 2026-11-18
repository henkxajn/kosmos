// KOSMOS — sonda CS-3b-v2 CZĘŚĆ 1: audyt modelu temperatury (COLONY_SPHERE_PLAN §3.3, decyzja D-CS-19 w §4).
//
// Tylko POMIAR — nie zmienia fizyki. Dla każdego galaxySeed: układ domowy + 71 obcych układów przez prawdziwą ścieżkę
// gry (galaxyCensus z probe-cs3b-archetypes.mjs), potem każde ciało → (rodzaj × klasa atmosfery × strefa orbity):
//   strefa wg zapisanej HZ gwiazdy (klasa widmowa, STAR_TYPES): inner (a < hz.min) · hz · outer (hz.max … frost) ·
//   frost (a > frostLine = 2.2·hz.max, jak SystemGenerator). Księżyc: a planety-rodzica.
// Reguły realizmu właściciela (2026-11-18) i ich naruszenia:
//   R1  ciało bez atmosfery poza wewnętrzną strefą (a ≥ hz.min) powinno być bardzo zimne → naruszenie gdy T > 0 °C
//   R1b ciało bez atmosfery blisko gwiazdy (a < 0.5·hz.min) powinno być gorące jak Merkury → naruszenie gdy T < 100 °C
//   R2  atmosfera thin/breathable w HZ → umiarkowana → naruszenie gdy T ∉ (−20, 50) °C
//   R3  atmosfera dense/thick przy a ≤ hz.max → cieplarnia jak Wenus → naruszenie gdy T < 100 °C
//   R4  księżyc z atmosferą poza HZ (a_rodzica > hz.max) → poniżej zera (Tytan) → naruszenie gdy T ≥ 0 °C
// Dodatkowo: dryf temperatury zapisanej vs formuła LifeSystem._recalcTemp (planety; dom gracza ma clamp 5–35 °C).
//
// Uruchomienie: node src/testing/headless/probe-cs3b-temperature.mjs [--json out.json] [--seeds a,b,c]

import { galaxyCensus } from './probe-cs3b-archetypes.mjs';
const EntityManager = (await import('../../core/EntityManager.js')).default;

const DEFAULT_SEEDS = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
const argSeeds = process.argv.indexOf('--seeds');
const SEEDS = argSeeds >= 0 ? process.argv[argSeeds + 1].split(',').map(Number) : DEFAULT_SEEDS;
const jsonIdx = process.argv.indexOf('--json');

// Lustro LifeSystem._recalcTemp / SystemGenerator.GREENHOUSE (stałe dodatki °C).
const GREENHOUSE = { none: 0, thin: 15, breathable: 20, dense: 60, thick: 35 };
const atmClass = (atm) => (atm === 'dense' || atm === 'thick') ? 'dense/thick' : (atm ?? 'none');

function zoneOf(a, hz) {
  if (a < hz.min) return 'inner';
  if (a <= hz.max) return 'hz';
  if (a <= hz.max * 2.2) return 'outer';
  return 'frost';
}

const cells = {};          // klucz kind|atm|zone → tablica T
const viol = { R1: [0, 0], R1b: [0, 0], R2: [0, 0], R3: [0, 0], R4: [0, 0] };   // [naruszenia, zbiór reguły]
const drift = { planets: 0, drifted: 0, maxAbs: 0, homeDrift: [] };
const hzByClass = {};      // klasa → { planets, inHZ }

function push(key, t) { (cells[key] ??= []).push(t); }
function rule(id, applies, violated) { if (!applies) return; viol[id][1]++; if (violated) viol[id][0]++; }

for (const seed of SEEDS) {
  const r = galaxyCensus(seed);
  const starBySys = new Map();
  for (const st of EntityManager.getByType('star')) starBySys.set(st.systemId ?? 'sys_home', st);
  const planetById = new Map(EntityManager.getByType('planet').map(p => [p.id, p]));
  const homeId = EntityManager.getByType('planet').find(p => p.lifeScore >= 100)?.id;
  for (const kind of ['planet', 'moon', 'planetoid']) {
    for (const b of EntityManager.getByType(kind)) {
      const st = starBySys.get(b.systemId ?? 'sys_home');
      if (!st) continue;
      const hz = st.habitableZone;
      const parent = kind === 'moon' ? planetById.get(b.parentPlanetId) : null;
      const a = kind === 'moon' ? (parent?.orbital?.a ?? NaN) : b.orbital?.a;
      const T = b.temperatureC ?? (b.temperatureK != null ? b.temperatureK - 273.15 : null);
      if (T == null || !Number.isFinite(a)) continue;
      const zone = zoneOf(a, hz);
      const atm = atmClass(b.atmosphere);
      const sub = kind === 'planet' ? b.planetType : kind === 'moon' ? `moon_${b.moonType}` : 'planetoid';
      push(`${sub}|${atm}|${zone}`, T);
      const airless = atm === 'none';
      rule('R1', airless && a >= hz.min, T > 0);
      rule('R1b', airless && a < 0.5 * hz.min, T < 100);
      rule('R2', (atm === 'thin' || atm === 'breathable') && zone === 'hz', !(T > -20 && T < 50));
      rule('R3', atm === 'dense/thick' && a <= hz.max, T < 100);
      rule('R4', kind === 'moon' && !airless && a > hz.max, T >= 0);
      if (kind === 'planet') {
        const cls = st.spectralType;
        hzByClass[cls] ??= { planets: 0, inHZ: 0, minA: Infinity };
        hzByClass[cls].planets++;
        if (zone === 'hz') hzByClass[cls].inHZ++;
        hzByClass[cls].minA = Math.min(hzByClass[cls].minA, a);
        const Trad = 278 * Math.pow(1 - (b.albedo ?? 0.3), 0.25) * Math.pow(st.luminosity, 0.25) / Math.sqrt(a);
        const Tf = Trad - 273.15 + (GREENHOUSE[b.atmosphere] ?? 0);
        drift.planets++;
        const d = Math.abs(Tf - T);
        if (d > 0.5) drift.drifted++;
        drift.maxAbs = Math.max(drift.maxAbs, d);
        if (b.id === homeId) drift.homeDrift.push({ seed, star: cls, a: +a.toFixed(3), stored: +T.toFixed(1), lifeSystem: +Tf.toFixed(1) });
      }
    }
  }
  void r;
}

function stats(arr) {
  const s = [...arr].sort((x, y) => x - y);
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  return { n: s.length, min: +s[0].toFixed(0), med: +q(0.5).toFixed(0), max: +s[s.length - 1].toFixed(0) };
}

const table = Object.entries(cells).map(([k, v]) => { const [sub, atm, zone] = k.split('|'); return { sub, atm, zone, ...stats(v) }; })
  .sort((x, y) => (x.sub + x.atm + x.zone).localeCompare(y.sub + y.atm + y.zone));
console.log('\n== CS-3b-v2 — temperatura (°C) per rodzaj × atmosfera × strefa, 5 seedów × 72 układy ==');
console.log('rodzaj'.padEnd(14) + 'atm'.padEnd(12) + 'strefa'.padEnd(7) + '     n    min    med    max');
for (const r of table) console.log(r.sub.padEnd(14) + r.atm.padEnd(12) + r.zone.padEnd(7) + [r.n, r.min, r.med, r.max].map(v => String(v).padStart(6)).join(' '));
console.log('\nNaruszenia reguł właściciela (naruszenia / ciała objęte regułą):');
for (const [k, [v, n]] of Object.entries(viol)) console.log(`  ${k}: ${v} / ${n}` + (n ? ` (${(100 * v / n).toFixed(1)}%)` : ''));
console.log('\nPlanety w HZ per klasa gwiazdy:', JSON.stringify(Object.fromEntries(Object.entries(hzByClass).map(([c, h]) => [c, `${h.inHZ}/${h.planets}, min a ${h.minA.toFixed(2)}`]))));
console.log(`Dryf zapis vs LifeSystem._recalcTemp: ${drift.drifted}/${drift.planets} planet > 0.5 °C, max ${drift.maxAbs.toFixed(1)} °C`);
console.log('Dom gracza (zapis → LifeSystem po 1. ticku):', drift.homeDrift.map(h => `${h.star} ${h.a}AU ${h.stored}→${h.lifeSystem}`).join(' · '));
if (jsonIdx >= 0) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ seeds: SEEDS, table, viol, hzByClass, drift }, null, 1));
}
process.exit(0);
