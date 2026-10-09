// AI STRIKES BACK — keeper Findingu 413: kadłuby, które plan puli dokłada WYŁĄCZNIE dla minimum kadłubów z bakiem warp
// (ponad limitem floty), to kadłuby Z BAKIEM — nigdy kadłub bez baku. Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (413).
//
//   K1  przypadki z rejestru (minimum strojone ponad sloty z bakiem): limit 2, minimum 3, dwie eskorty → +E (przed 413:
//       D, E); limit 4, wzorzec D, D, D, E, minimum 3, dwie eskorty i dwa defendery → +E (przed: D, E); pierwszy kadłub
//       planu (odrastanie) = E; KONTROLA: wyrocznia (plan sprzed 413, kopia w keeperze) daje D, E
//   K2  siatka (limit 0–6 × z bakiem 0–6 × bez baku 0–6 × minimum 0–6 × cztery wzorce): kadłubów bez baku w planie nie
//       więcej niż miejsca z limitu; świadek: wyrocznia łamie to w N > 0 przypadkach, w tym przy minimum ponad sloty
//       z bakiem; KONTROLA: minimum spełnione, gdy wzorzec ma szablon z bakiem (także przed 413 — SB27)
//   K3  KONTROLA — strojenie domyślne (wzorzec D, E, E, E, minimum 2, limit 2–8): plan = wyrocznia w całej siatce (413
//       nieosiągalny); przypadki właściciela SB27 bez zmian
//   K4  świat: minimum 3, imperium z dwiema eskortami (limit 2) — mobilizacja dokłada jedną eskortę, zero defenderów,
//       z bakiem 3; KONTROLA: strojenie domyślne — ta sama scena nie dokłada nic
//
// ⚠ Każdy pin wykluczający ma świadka w tym samym asercie; KONTROLA = zielona po OBU stronach (przed i po 413).
// ⚠ Fail-first: na drzewie sprzed 413 (`6b40c30`) czerwone wyłącznie piny 413 (K1a, K1b, K1c, K2a, K4a).

import '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import * as VS from '../../entities/Vessel.js';
import { planPool, poolSlots, templateTraits } from '../../utils/FleetPoolPlanner.js';
import * as TUN from '../../utils/StrikesBackTuning.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const D = 'frigate_system_defender', E = 'frigate_missile_escort', L = 'frigate_laser_escort';
const P = [D, E, E, E];
const warpOf = (id) => templateTraits(id).warp;
const quiet = (fn) => { const l = console.log, w = console.warn, tb = console.table; console.log = () => {}; console.warn = () => {}; console.table = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.table = tb; } };

// ── Wyrocznia: plan puli SPRZED 413 (S1-8, `6b40c30`) — kopia algorytmu, wyłącznie do porównań ────────────────────
function oraclePass({ lim, pattern, minW, w0, n0 }) {
  const room = Math.max(lim - (w0 + n0), minW - w0, 0);
  const slots = poolSlots(lim, pattern);
  let w = w0, n = n0;
  const uncovered = [];
  for (const id of slots) {
    if (warpOf(id)) { if (w > 0) w--; else uncovered.push(id); }
    else { if (n > 0) n--; else uncovered.push(id); }
  }
  const add = uncovered.slice(0, room);
  const tank = pattern.find((id) => warpOf(id)) ?? null;
  let missing = 0;
  if (add.length < room) { if (tank) while (add.length < room) add.push(tank); else missing = room - add.length; }
  return { add, missing };
}
function oraclePlan({ limit, pattern, minWarp, warpHulls, noWarpHulls }) {
  const lim = Math.max(0, Math.floor(limit)), minW = Math.max(0, Math.floor(minWarp));
  let w = warpHulls, n = noWarpHulls;
  const add = [];
  let pass = oraclePass({ lim, pattern, minW, w0: w, n0: n });
  for (let i = 0; i < 64 && pass.add.length > 0; i++) {
    for (const id of pass.add) { add.push(id); if (warpOf(id)) w++; else n++; }
    pass = oraclePass({ lim, pattern, minW, w0: w, n0: n });
  }
  return { add, missingWarpTemplate: pass.missing };
}
const plan = (limit, warpHulls, noWarpHulls, pattern = P, minWarp = 2) => planPool({ limit, pattern, minWarp, warpHulls, noWarpHulls });
const oracle = (limit, warpHulls, noWarpHulls, pattern = P, minWarp = 2) => oraclePlan({ limit, pattern, minWarp, warpHulls, noWarpHulls });
const noTankCount = (ids) => ids.filter((id) => !warpOf(id)).length;
const tankCount = (ids) => ids.filter((id) => warpOf(id)).length;

// ── K1 — przypadki z rejestru ────────────────────────────────────────────────────────────────────────────────
console.log('\nK1 — przypadki z rejestru: minimum strojone ponad sloty z bakiem');
{
  const a = plan(2, 2, 0, P, 3);
  assert(same(a.add, [E]) && a.missingWarpTemplate === 0,
    `K1a: limit 2, minimum 3, dwie eskorty → +E, bez defendera ponad limitem (${JSON.stringify(a.add)})`);
  const b = plan(4, 2, 2, [D, D, D, E], 3);
  assert(same(b.add, [E]) && b.missingWarpTemplate === 0,
    `K1b: limit 4, wzorzec D, D, D, E, minimum 3, dwie eskorty + dwa defendery → +E (${JSON.stringify(b.add)})`);
  assert(a.add[0] === E && b.add[0] === E,
    `K1c: pierwszy kadłub planu (odrastanie bierze pierwszy) — eskorta, nie defender (${a.add[0]}, ${b.add[0]})`);
  assert(same(oracle(2, 2, 0, P, 3).add, [D, E]) && same(oracle(4, 2, 2, [D, D, D, E], 3).add, [D, E]),
    'K1d (KONTROLA wyroczni): plan sprzed 413 dawał w obu przypadkach D, E — wynik zmierzony w rejestrze (§6, 413)');
}

// ── K2 — siatka: kadłub bez baku nigdy ponad limitem ─────────────────────────────────────────────────────────
console.log('\nK2 — siatka: kadłubów bez baku nie więcej niż miejsca z limitu');
{
  const patterns = [P, [D, D, D, E], [D, D, E], [D]];
  let cases = 0, viol = 0, oracleViol = 0, oracleViolAbove = 0, minCases = 0, minMiss = 0;
  for (const pat of patterns) {
    const hasTank = pat.some((id) => warpOf(id));
    for (let limit = 0; limit <= 6; limit++) for (let w = 0; w <= 6; w++) for (let n = 0; n <= 6; n++) for (let m = 0; m <= 6; m++) {
      cases++;
      const limRoom = Math.max(limit - (w + n), 0);
      const p = plan(limit, w, n, pat, m);
      if (noTankCount(p.add) > limRoom) viol++;
      const o = oracle(limit, w, n, pat, m);
      if (noTankCount(o.add) > limRoom) {
        oracleViol++;
        const tankSlots = poolSlots(limit, pat).filter((id) => warpOf(id)).length;
        if (m > tankSlots) oracleViolAbove++;
      }
      if (hasTank) { minCases++; if (w + tankCount(p.add) < m) minMiss++; }
    }
  }
  assert(cases === 4 * 7 ** 4 && viol === 0 && oracleViol > 0 && oracleViolAbove > 0,
    `K2a: ${cases} przypadków — kadłub bez baku ponad limitem: ${viol} (świadek: plan sprzed 413 — ${oracleViol}, w tym przy minimum ponad sloty z bakiem ${oracleViolAbove})`);
  assert(minCases === 3 * 7 ** 4 && minMiss === 0,
    `K2b (KONTROLA, SB27): wzorce z szablonem z bakiem — minimum z bakiem spełnione w ${minCases - minMiss}/${minCases} przypadkach`);
}

// ── K3 — KONTROLA: strojenie domyślne ────────────────────────────────────────────────────────────────────────
console.log('\nK3 — strojenie domyślne: plan bez zmian');
{
  let cases = 0, diff = 0;
  for (let limit = 2; limit <= 8; limit++) for (let w = 0; w <= 8; w++) for (let n = 0; n <= 8; n++) {
    cases++;
    const p = plan(limit, w, n), o = oracle(limit, w, n);
    if (!same(p.add, o.add) || p.missingWarpTemplate !== o.missingWarpTemplate) diff++;
  }
  assert(cases === 7 * 81 && diff === 0,
    `K3a (KONTROLA): wzorzec D, E, E, E, minimum 2, limit 2–8 — plan = plan sprzed 413 w ${cases - diff}/${cases} przypadkach`);
  const owner = [[2, 0, 0], [6, 0, 0], [6, 0, 6], [6, 0, 3], [2, 0, 2]].map(([l, w, n]) => plan(l, w, n).add);
  assert(same(owner, [[D, E, E], [D, E, E, E, D, E], [E, E], [E, E, E], [E, E]]) && same(plan(2, 0, 0, P, 0).add, [D, E]),
    'K3b (KONTROLA): przypadki właściciela SB27 bez zmian — 2/0 → D, E, E · 6/0 → D, E, E, E, D, E · 6 D → +2 E · 3 D → +3 E · 2 D → +2 E; minimum 0 → D, E');
}

// ── K4 — świat: mobilizacja przy minimum 3 ───────────────────────────────────────────────────────────────────
console.log('\nK4 — świat: mobilizacja z dwiema eskortami przy minimum 3');
{
  const scene = (minWarp) => {
    const { core, K } = quiet(() => bootWithDirector({ quiet: true }));
    gameState.set('strikesBackTuning', {}, 'keeper_fresh');
    if (minWarp !== null) TUN.setTuning('fleetMinWarpHulls', minWarp);
    const vm = core.vesselManager;
    const emp = K.empireRegistry.listIds()[0];
    const cap = K.directorProduction.capitalOf(emp)?.planetId ?? null;
    const made = [E, E].map((templateId) => quiet(() => vm.createAIVessel({ templateId, empireId: emp, planetId: cap, origin: 'keeper' })));
    quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
    const armed = vm.getAllVessels().filter((v) => !v.isWreck && (v.ownerEmpireId ?? v.owner) === emp && VS.hasWeapons(v));
    const pool = armed.filter((v) => v.origin === 'pool');
    return {
      made: made.every((r) => r?.ok === true), limit: K.empireRegistry.get(emp)?.fleetPool?.limit ?? null,
      pool: pool.map((v) => v.directorOrigin), poolNoTank: pool.filter((v) => !(v.warpFuel?.max > 0)).length,
      warp: armed.filter((v) => (v.warpFuel?.max ?? 0) > 0).length, flag: K.empireRegistry.get(emp)?.fleetPool ?? null,
    };
  };
  const s3 = scene(3);
  assert(s3.made && s3.limit === 2 && same(s3.pool, [E]) && s3.poolNoTank === 0 && s3.warp === 3
    && s3.flag?.planned === 1 && s3.flag?.created === 1 && s3.flag?.missingWarpTemplate === 0,
    `K4a: minimum 3, limit ${s3.limit}, dwie eskorty — wojna → pula dokłada [${s3.pool.join(', ')}], bez baku ${s3.poolNoTank}, z bakiem razem ${s3.warp}`);
  const s2 = scene(null);
  assert(s2.made && s2.limit === 2 && s2.pool.length === 0 && s2.warp === 2 && s2.flag?.mobilized === true && s2.flag?.planned === 0,
    `K4b (KONTROLA): strojenie domyślne (minimum 2) — ta sama scena: pula nie dokłada nic (${s2.pool.length}), z bakiem ${s2.warp}, flaga jest`);
  gameState.set('strikesBackTuning', {}, 'keeper_cleanup');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
