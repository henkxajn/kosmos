// AI STRIKES BACK S1 (domknięcie) — keeper B8 (SB29 — SB13 dosłownie; zamyka Finding 411): w wojnie guard parytetu NIE
// hamuje — kadłub imperium ze zmobilizowaną pulą, ukończony w wojnie, wchodzi do służby regułą `mobilize_reserve`
// bez względu na parytet; w pokoju guard parytetu bez zmian; reparacje blokują jak dotąd.
// Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB29), §6 (411).
//
//   R1  WOJNA: imperium z pulą, kadłub ukończony w wojnie prawdziwym szwem stoczni (`_onShipCompleted`) — parytet
//       hamowałby (imperium silniejsze od gracza: świadek), guard reguły przepuszcza, a w ciągu kilku lat gry kadłub
//       wchodzi do służby regułą (`director:mobilized` imperium)
//   R2  POKÓJ (ta sama scena po pokoju, flaga puli zostaje): guard parytetu hamuje, kadłub zostaje w rezerwie;
//       KONTROLA: gracz silniejszy ⇒ guard przepuszcza (porównanie sił bez zmian)
//   R3  WOJNA POD REPARACJAMI: guard parytetu przepuszcza, guard reparacji hamuje — kadłub zostaje w rezerwie; po końcu
//       reparacji (świadek nie-jałowości) — wchodzi do służby
//   R4  KONTROLA zakresu: wojna BEZ puli (wyłącznik keeperów) — parytet hamuje jak dotąd (wyjątek wojenny wymaga puli)
//   R5  katalog reguły bez zmian (guardy, porcja, rzut); rejestracja guardu woła `parityGuardAllows`
//
// ⚠ Fail-first: na drzewie sprzed SB29 czerwone piny wojny (R1b, R1c, R3b, R3c, R5b); zielone po obu stronach — świadkowie
//   i KONTROLE (R1a, R2a, R2b, R3a, R4, R5a).

import '../headless/env.js';           // MUSI być pierwszy
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { DirectorGuards } from '../../systems/director/DirectorRegistry.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
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

const MODS = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
const YEARS = 6;                                                  // lata gry na regułę (rzut 40 / 70 / 100 % na rok, oś agresji)
const quiet = (fn) => { const l = console.log, w = console.warn, tb = console.table; console.log = () => {}; console.warn = () => {}; console.table = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.table = tb; } };
const boot = () => { const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true })); return { core, K, ticker, vm: core.vesselManager, emps: K.empireRegistry.listIds() }; };
const run = (w, civY) => quiet(() => w.ticker.run(civY, { tickSize: 1.0 }));
const declare = (K, emp) => quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
const capOf = (K, emp) => K.directorProduction.capitalOf(emp)?.planetId ?? null;
const guard = (emp) => DirectorGuards.resolve('empireOutgunnedByPlayer')({ empireId: emp });
const mobilizedLog = (emp) => debugLog.query({ kind: 'director:mobilized', empireId: emp }).length;
/** Kadłub ukończony w stoczni stolicy — prawdziwy szew magazynu (`VesselManager._onShipCompleted`, W2-2). */
const complete = (w, emp) => {
  const before = new Set(w.vm.getAllVessels().map((v) => v.id));
  quiet(() => w.vm._onShipCompleted(capOf(w.K, emp), 'hull_frigate', [...MODS]));
  return w.vm.getAllVessels().find((v) => !before.has(v.id)) ?? null;
};
/** Do `years` lat gry: zwraca stan służby kadłuba w chwili, gdy wszedł do służby, albo po czasie. */
const runUntilActive = (w, v, years) => {
  for (let m = 0; m < years * 12 && v.serviceState !== 'active'; m++) run(w, 1);
  return v.serviceState;
};

// ── R1 — wojna: kadłub ukończony w wojnie wchodzi do służby mimo parytetu ───────────────────────
console.log('\nR1 — WOJNA: kadłub ukończony po mobilizacji puli wchodzi do służby bez względu na parytet');
{
  const w = boot();
  const [e1] = w.emps;
  declare(w.K, e1);
  const v = complete(w, e1);
  const parity = w.K.directorMobilization.isOutgunnedByPlayer(e1);
  assert(v && v.serviceState === 'stored' && (v.ownerEmpireId ?? v.owner) === e1 && v.position?.dockedAt === capOf(w.K, e1)
    && w.K.fleetPoolSystem?.isMobilized(e1) === true && w.K.fleetPoolSystem?.isAtWar(e1) === true && parity === false,
    `R1a (świadek): kadłub ${v?.id} w rezerwie przy stolicy, imperium w wojnie z pulą, parytet hamowałby (gracz silniejszy: ${parity})`);
  assert(guard(e1) === true,
    `R1b: guard reguły w wojnie z pulą — przepuszcza (${guard(e1)})`);
  const n0 = mobilizedLog(e1);
  const state = runUntilActive(w, v, YEARS);
  assert(state === 'active' && mobilizedLog(e1) > n0,
    `R1c: w ciągu ${YEARS} lat gry kadłub wszedł do służby regułą mobilize_reserve (stan ${state}, director:mobilized +${mobilizedLog(e1) - n0})`);
}

// ── R2 — pokój: guard parytetu bez zmian ───────────────────────────────────────────────────────
console.log('\nR2 — POKÓJ: parytet hamuje jak dotąd');
{
  const w = boot();
  const [e1] = w.emps;
  declare(w.K, e1);
  w.K.diplomacySystem.relations.setStatus('player', e1, 'peace', {}, 'keeper_peace');
  const v = complete(w, e1);
  const g = guard(e1);
  const state = runUntilActive(w, v, YEARS);
  assert(w.K.fleetPoolSystem?.isMobilized(e1) === true && w.K.diplomacySystem.getStatus(e1) === 'peace' && g === false && state === 'stored',
    `R2a: pokój, flaga puli zostaje, imperium silniejsze — guard hamuje (${g}), kadłub po ${YEARS} latach w rezerwie (${state})`);
  const ta = w.K.threatAssessment;
  const orig = ta.getStrength;
  ta.getStrength = (id) => (id === 'player' ? 1e9 : orig.call(ta, id));
  const gStrong = guard(e1);
  const eq = gStrong === w.K.directorMobilization.isOutgunnedByPlayer(e1);
  ta.getStrength = orig;
  assert(gStrong === true && eq,
    `R2b (KONTROLA): pokój, gracz silniejszy — guard przepuszcza (${gStrong}) i równa się porównaniu sił`);
}

// ── R3 — wojna pod reparacjami ─────────────────────────────────────────────────────────────────
console.log('\nR3 — WOJNA pod reparacjami: reparacje blokują jak dotąd');
{
  const w = boot();
  const [e1] = w.emps;
  declare(w.K, e1);
  const now = w.K.timeSystem.gameTime;
  w.K.diplomacySystem.relations.setReparationsUntilYear('player', e1, now + 20, 'keeper');
  const v = complete(w, e1);
  assert(w.K.diplomacySystem.getStatus(e1) === 'war' && w.K.fleetPoolSystem?.isMobilized(e1) === true
    && w.K.diplomacySystem.isUnderReparations(e1) === true && v?.serviceState === 'stored',
    'R3a (świadek): imperium z pulą w wojnie, pod reparacjami, kadłub ukończony w rezerwie');
  const repGuard = DirectorGuards.resolve('empireNotUnderReparations')({ empireId: e1 });
  const parGuard = guard(e1);
  const state = runUntilActive(w, v, YEARS);
  assert(parGuard === true && repGuard === false && state === 'stored',
    `R3b: guard parytetu przepuszcza (${parGuard}), hamuje guard reparacji (${repGuard}) — kadłub po ${YEARS} latach w rezerwie (${state})`);
  w.K.diplomacySystem.relations.setReparationsUntilYear('player', e1, null, 'keeper');
  const after = runUntilActive(w, v, YEARS);
  assert(after === 'active',
    `R3c: po końcu reparacji (wojna trwa) kadłub wchodzi do służby (${after})`);
}

// ── R4 — wojna bez puli ────────────────────────────────────────────────────────────────────────
console.log('\nR4 — KONTROLA zakresu: wojna bez puli — parytet hamuje jak dotąd');
{
  const w = boot();
  const [e1] = w.emps;
  if (w.K.fleetPoolSystem) w.K.fleetPoolSystem.enabled = false;
  declare(w.K, e1);
  const v = complete(w, e1);
  const g = guard(e1);
  const eq = g === w.K.directorMobilization.isOutgunnedByPlayer(e1);
  assert(w.K.fleetPoolSystem?.isMobilized(e1) === false && w.K.diplomacySystem.getStatus(e1) === 'war' && eq && v?.serviceState === 'stored',
    `R4 (KONTROLA): wojna bez puli — guard = porównanie sił (${g}); wyjątek wojenny wymaga mobilizacji puli`);
}

// ── R5 — katalog i rejestracja ─────────────────────────────────────────────────────────────────
console.log('\nR5 — katalog reguły i rejestracja guardu');
{
  const rule = DIRECTOR_RULES.mobilize_reserve;
  assert(same(rule?.guard, ['empireOutgunnedByPlayer', 'empireNotUnderReparations']) && rule?.response?.action === 'mobilizeVessels'
    && rule?.response?.params?.count === 2 && same(rule?.roll, { startPct: 40, stepPct: 30, capPct: 100, unit: 'displayedYear' })
    && rule?.cooldown?.years === 3.0,
    'R5a (KONTROLA): reguła mobilize_reserve bez zmian — guardy, porcja 2, rzut, cooldown');
  const dm = stripComments(read('systems/director/DirectorMobilization.js'));
  assert(/DirectorGuards\.register\('empireOutgunnedByPlayer',\s*\(\{\s*empireId\s*\}\)\s*=>\s*instance\.parityGuardAllows\(empireId\)/.test(dm)
    && /parityGuardAllows\(empireId\)\s*\{[\s\S]*?isMobilized\?\.\(empireId\)\s*===\s*true[\s\S]*?isAtWar\?\.\(empireId\)\s*===\s*true[\s\S]*?return this\.isOutgunnedByPlayer\(empireId\);/.test(dm),
    'R5b: guard reguły = parityGuardAllows (wojna + pula ⇒ przepuść; inaczej porównanie sił)');
}

console.log(`\n[sb1_war_reserve_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
