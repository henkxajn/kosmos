// AI STRIKES BACK S1 (domknięcie) — keeper B6 (SB27): plan puli liczony DO SKUTKU — pula osiąga minimum kadłubów z bakiem
// warp w chwili utworzenia, nie rok później. Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB27).
//
//   M1  planer — przypadki właściciela: limit 2 / 0 → D, E, E (SB27); KONTROLE (wynik bez zmian wobec planu sprzed SB27):
//       6 / 0 → D, E, E, E, D, E · limit 6, 6 defenderów → +2 eskorty · 3 defendery → +3 · limit 2, 2 defendery → +2 ·
//       minimum 0: limit 2 / 0 → D, E (pętla nie dokłada ponad limit, gdy minimum nie wymaga)
//   M2  planer — wzorzec bez szablonu z bakiem: pętla się kończy, brak kadłubów z bakiem zgłoszony prawdziwie
//       (`missingWarpTemplate`), `room` = dołożone + brakujące; pierwszy kadłub planu = pierwszy kadłub przebiegu sprzed SB27
//   M3  mobilizacja (świat `bootWithDirector`, stolice POP 24 → limit 2): wojna → pula D, E, E od razu (2 z bakiem), rekord
//       `planned` / `created` 3; granica roku 1 — odrastanie nic nie dokłada (plan pusty); drugie imperium bez zmian
//   M4  konsola: `printFleetLimits` (`KOSMOS.debug.sbTuning().flota`) — kolumna `pulaDoda` = ten sam plan co planer
//       i co kadłuby utworzone przy mobilizacji
//
// ⚠ Każdy pin wykluczający ma świadka w tym samym asercie; KONTROLA = zielona po OBU stronach (przed i po SB27).
// ⚠ Fail-first: na drzewie sprzed SB27 (`1a9f95b`) czerwone wyłącznie piny SB27 (M1a, M2a, M2b, M3a–M3c, M4a, M4b).

import '../headless/env.js';           // MUSI być pierwszy
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import * as VS from '../../entities/Vessel.js';
import { planPool, describePoolAdd } from '../../utils/FleetPoolPlanner.js';
import { printFleetLimits, readEmpirePoolPlan } from '../../utils/FleetLimit.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const read = (r) => readFileSync(path.join(SRC, r), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');

const D = 'frigate_system_defender', E = 'frigate_missile_escort';
const P = [D, E, E, E];
const quiet = (fn) => { const l = console.log, w = console.warn, tb = console.table; console.log = () => {}; console.warn = () => {}; console.table = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.table = tb; } };
const boot = () => { const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true })); return { core, K, ticker, vm: core.vesselManager, emps: K.empireRegistry.listIds() }; };
const run = (w, civY) => quiet(() => w.ticker.run(civY, { tickSize: 1.0 }));
const declare = (K, emp) => quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
const armedOf = (w, emp) => w.vm.getAllVessels().filter((v) => !v.isWreck && (v.ownerEmpireId ?? v.owner) === emp && VS.hasWeapons(v));
const poolOf = (w, emp) => armedOf(w, emp).filter((v) => v.origin === 'pool');
const rowsOf = (K) => { let rows = []; const tb = console.table; console.table = (r) => { rows = r; }; try { printFleetLimits(K); } finally { console.table = tb; } return rows; };
const plan = (limit, warpHulls, noWarpHulls, pattern = P, minWarp = 2) => planPool({ limit, pattern, minWarp, warpHulls, noWarpHulls });

// ── M1 — planer: przypadki właściciela ─────────────────────────────────────────────────────────
console.log('\nM1 — plan puli do skutku (SB27) — przypadki właściciela');
{
  assert(same(plan(2, 0, 0).add, [D, E, E]),
    `M1a: limit 2, 0 kadłubów → D, E, E — minimum 2 z bakiem od razu (${JSON.stringify(plan(2, 0, 0).add)})`);
  assert(same(plan(6, 0, 0).add, [D, E, E, E, D, E]),
    `M1b (KONTROLA): limit 6, 0 → D, E, E, E, D, E (${JSON.stringify(plan(6, 0, 0).add)})`);
  assert(same(plan(6, 0, 6).add, [E, E]),
    `M1c (KONTROLA): limit 6, 6 defenderów → +2 eskorty ponad limit (${JSON.stringify(plan(6, 0, 6).add)})`);
  assert(same(plan(6, 0, 3).add, [E, E, E]),
    `M1d (KONTROLA): limit 6, 3 defendery → +3 eskorty (${JSON.stringify(plan(6, 0, 3).add)})`);
  assert(same(plan(2, 0, 2).add, [E, E]),
    `M1e (KONTROLA): limit 2, 2 defendery → +2 eskorty (${JSON.stringify(plan(2, 0, 2).add)})`);
  assert(same(plan(2, 0, 0, P, 0).add, [D, E]),
    `M1f (KONTROLA dyskryminacji): minimum 0 — limit 2, 0 → D, E; pętla nie dokłada ponad limit (${JSON.stringify(plan(2, 0, 0, P, 0).add)})`);
}

// ── M2 — planer: wzorzec bez baku, `room`, pierwszy kadłub ─────────────────────────────────────
console.log('\nM2 — wzorzec bez szablonu z bakiem; room; pierwszy kadłub planu');
{
  const noTank = plan(2, 0, 0, [D], 2);
  assert(same(noTank.add, [D, D]) && noTank.missingWarpTemplate === 2 && noTank.room === 4 && noTank.tankTemplate === null,
    `M2a: wzorzec [D], limit 2, minimum 2 — plan D, D, brak z bakiem 2 zgłoszony, room 4 (${JSON.stringify({ add: noTank.add, miss: noTank.missingWarpTemplate, room: noTank.room })})`);
  const p2 = plan(2, 0, 0);
  assert(p2.room === 3 && p2.missingWarpTemplate === 0 && same(p2.slots, [D, E]) && same(p2.uncovered, [D, E]),
    `M2b: limit 2, 0 — room 3 (dołożone + brakujące), sloty i niepokryte z pierwszego przebiegu (${JSON.stringify({ room: p2.room, slots: p2.slots })})`);
  const firsts = [[2, 0, 0], [6, 0, 0], [6, 0, 6], [6, 0, 3], [2, 0, 2], [2, 1, 1], [6, 1, 5]].map(([l, w, n]) => plan(l, w, n).add[0] ?? null);
  assert(same(firsts, [D, D, E, E, E, E, E]),
    `M2c (KONTROLA): pierwszy kadłub planu — ten sam co w przebiegu sprzed SB27 (odrastanie bierze pierwszy) (${JSON.stringify(firsts)})`);
}

// ── M3 — mobilizacja: minimum od razu ──────────────────────────────────────────────────────────
console.log('\nM3 — mobilizacja: pula osiąga minimum z bakiem w chwili utworzenia');
{
  const w = boot();
  const [e1, e2] = w.emps;
  const lim = readEmpirePoolPlan(w.K, e1)?.limit;
  declare(w.K, e1);
  const pool = poolOf(w, e1);
  const flag = w.K.empireRegistry.get(e1)?.fleetPool ?? null;
  assert(lim === 2 && same(pool.map((v) => v.directorOrigin), [D, E, E]) && pool.filter((v) => (v.warpFuel?.max ?? 0) > 0).length === 2
    && pool.every((v) => v.serviceState === 'active' && v.position?.state === 'docked'),
    `M3a: limit ${lim}, wojna → pula D, E, E od razu, 2 z bakiem, w służbie, w doku (${pool.map((v) => v.directorOrigin.split('_')[1]).join(', ')})`);
  assert(flag?.planned === 3 && flag?.created === 3 && flag?.missingWarpTemplate === 0,
    `M3b: rekord mobilizacji — planned 3, created 3, brak z bakiem 0 (${JSON.stringify({ p: flag?.planned, c: flag?.created, m: flag?.missingWarpTemplate })})`);
  run(w, 13);                                                   // granica roku 1 (rok 0 → 1,08)
  const regrown = debugLog.query({ kind: 'fleetPool:regrown', empireId: e1 }).length;
  assert(Math.floor(w.K.timeSystem.gameTime + 1e-9) >= 1 && regrown === 0 && poolOf(w, e1).length === 3
    && (w.K.fleetPoolSystem?.plan(e1)?.add?.length ?? -1) === 0 && w.K.empireRegistry.get(e1)?.fleetPool?.regrowthYear >= 1,
    `M3c: granica roku 1 — odrastanie nic nie dokłada (plan pusty), rok rozliczony; pula ${poolOf(w, e1).length} (odrosło ${regrown})`);
  assert(poolOf(w, e2).length === 0 && !w.K.empireRegistry.get(e2)?.fleetPool,
    'M3d (KONTROLA): drugie imperium (bez wojny) — bez puli i bez flagi');
}

// ── M4 — konsola: ten sam plan ─────────────────────────────────────────────────────────────────
console.log('\nM4 — konsola `sbTuning().flota` — kolumna pulaDoda = plan');
{
  const w = boot();
  const [e1, e2] = w.emps;
  const before = rowsOf(w.K);
  const b1 = before.find((r) => r.imperium === e1), b2 = before.find((r) => r.imperium === e2);
  const planned = describePoolAdd(readEmpirePoolPlan(w.K, e1).add);
  assert(b1?.pulaDoda === `${D} x1, ${E} x2` && b2?.pulaDoda === `${D} x1, ${E} x2` && b1?.pulaDoda === planned,
    `M4a: przed wojną — pulaDoda „${b1?.pulaDoda}” = plan („${planned}”), oba imperia`);
  declare(w.K, e1);
  const created = describePoolAdd(poolOf(w, e1).map((v) => v.directorOrigin));
  const after = rowsOf(w.K);
  const a1 = after.find((r) => r.imperium === e1), a2 = after.find((r) => r.imperium === e2);
  assert(created === b1?.pulaDoda && a1?.pulaDoda === '-' && a1?.pula === 'tak' && a1?.zBakiem === 2,
    `M4b: utworzone kadłuby („${created}”) = to, co konsola zapowiadała; po mobilizacji pulaDoda „${a1?.pulaDoda}”, z bakiem ${a1?.zBakiem}`);
  assert(a2?.pulaDoda === b2?.pulaDoda && a2?.pula === 'nie',
    `M4c (KONTROLA): imperium bez wojny — pulaDoda bez zmian („${a2?.pulaDoda}”), pula nie`);
  const gs = stripComments(read('scenes/GameScene.js'));
  assert(/sbTuning:\s*\(\)\s*=>\s*\(\{\s*tabela:\s*printTuningTable\(\),\s*flota:\s*printFleetLimits\(window\.KOSMOS\)\s*\}\)/.test(gs),
    'M4d (KONTROLA wpięcia): `KOSMOS.debug.sbTuning()` czyta flotę przez `printFleetLimits` — to samo wywołanie co w M4a–M4c');
}

console.log(`\n[sb1_pool_warp_minimum_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
