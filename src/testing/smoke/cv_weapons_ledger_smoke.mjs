// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_weapons_ledger_smoke — KEEPER ARC COMBAT VISUALS, krok CV-4a (język broni + rejestr salw; flaga `cvWeapons`)
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.4, §2.9, §2.11, D-CV-8, D-CV-9, §3.1-3; Findingi 614, 615, 637, 653 (c), 655 (i).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — bez pinów na stałych rysunku; F11 a–f):
//   W0 (a) jedyna edycja DSCS kroku to ŁADUNEK FX (D-CV-8): `round.events` każdej rundy, `serialize()` w trakcie bitwy i rekord
//      bitwy (`battle:resolved`) BAJT W BAJT jak przed CV-4a — skróty SHA-256 nagrane TYM keeperem (`--record`) na drzewie sprzed
//      zmiany DSCS (fixture `src/testing/fixtures/traces/CV4a-dscs-baseline.json`); do tego budowa ładunku (`fcCombatFx` ON) ==
//      brak ładunku (`fcCombatFx` OFF) — budowanie pól FX nie dotyka stanu logiki.
//   (dalsze sekcje — patrz niżej)
//
// ŚWIAT: jak `cv_fx_results_smoke` — PRAWDZIWY `TimeSystem.update(ms)` w pętli klatek (siatka starcia), łańcuch `time:tick` →
//   VesselManager → Proximity → VesselCombatSystem → DeepSpaceCombatSystem → MOS → wraki (EAH); zegar realny wirtualny;
//   stager `KOSMOS.debug.cvBattle` (ten sam kod co w konsoli).
//
// Nagranie baseline'u W0 (TYLKO na drzewie sprzed zmiany DSCS):
//   node src/testing/smoke/cv_weapons_ledger_smoke.mjs --record src/testing/fixtures/traces/CV4a-dscs-baseline.json
// ⚠ Fail-first: moduły CV-4a powstają w tym kroku — import dynamiczny w try/catch, piny DEGRADUJĄ (czerwone), suita się nie
//   przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import { setNextVesselId }       from '../../entities/Vessel.js';
import { reseedRendererRandom }  from '../../renderer/RendererRng.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname }               from 'node:path';
import { createHash }            from 'node:crypto';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const STAGER = await tryImport('../../debug/CvBattleStager.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const sha = (s) => createHash('sha256').update(s).digest('hex');

const FIXTURE = new URL('../fixtures/traces/CV4a-dscs-baseline.json', import.meta.url);
const RECORD_IDX = process.argv.indexOf('--record');
const RECORD_TO = RECORD_IDX >= 0 ? (process.argv[RECORD_IDX + 1] ?? null) : null;

// ── Świat ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';
const GY0 = 100.00002;
const clock = { now: 1e7 };
performance.now = () => clock.now;

let ts, vm, mos, prox, dscs, eah, oss, saveSys, rec;

function world() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  clock.now = 1e7;
  setNextVesselId(1);
  ts = new TimeSystem();
  ts.gameTime = GY0;
  ts.multiplierIndex = 1;                                // 1 d/s
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  EntityManager.add({ id: 'p_rock', type: 'planet', name: 'Skala', systemId: SYS, x: 3 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  vm = new VesselManager(); mos = new MovementOrderSystem(vm); prox = new ProximitySystem(vm);
  dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); eah = new EnemyAttackHandler(); oss = new OrbitalSpaceSystem();
  saveSys = { _autosaveInterval: 1 };
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  const empires = [{ id: EMP, name: 'Testowe Imperium' }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos,
    proximitySystem: prox, deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'unknown' }), getLevel: () => 'unknown', isAtLeast: () => false },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find(e => e.id === id) ?? null },
    debug: { combatTrace: false },
  });
  rec = { rounds: [], states: [], serial: {}, battles: [], payloads: [], encId: null, battleId: null };
  const orig = dscs._tickEncounter.bind(dscs);
  dscs._tickEncounter = (enc, civDy) => {
    orig(enc, civDy);
    rec.encId = rec.encId ?? enc.id;
    const last = enc.timeline?.[enc.timeline.length - 1];
    rec.rounds.push(JSON.stringify(last?.events ?? []));
    // stan logiczny po CAŁEJ rundzie (ogień + regeneracja osłon) — odniesienie dla HP pokazywanego (sekcje L)
    rec.states.push({ round: enc.currentRound, at: clock.now,
      ships: Object.fromEntries([...enc.vesselStates].map(([id, s]) => [id, { hp: s.hp, shield: s.shieldHP, hpStart: s.hpStart, shieldStart: s.shieldHPStart }])) });
    if (enc.currentRound === 3 || enc.currentRound === 10) rec.serial['r' + enc.currentRound] = JSON.stringify(dscs.serialize());
  };
  EventBus.on('combat:roundFx', (p) => rec.payloads.push({ at: clock.now, p }));
  EventBus.on('battle:resolved', ({ result }) => {
    if (!result?.id?.startsWith?.('battle_ds_')) return;
    rec.battleId = rec.battleId ?? result.id;
    rec.battles.push(JSON.stringify(result));
  });
}

function frame(ms) { clock.now += ms; ts.update(ms); }
const encActive = () => dscs.listActive().length > 0;
const helpers = () => STAGER?.cvBattleDebugHelpers?.({ getRenderer: () => null, getSaveSystem: () => saveSys }) ?? null;

/** Identyfikatory starcia i bitwy zależą od historii `gameState` w procesie (sufiksy) — w skrótach zastępujemy je znacznikami. */
function norm(s) {
  let out = s;
  if (rec.encId) out = out.split(rec.encId).join('<ENC>');
  if (rec.battleId) out = out.split(rec.battleId).join('<BATTLE>');
  return out;
}

/** Bitwa stagera rozegrana do końca (bez renderera). Zwraca skróty W0 i surowe dane rund (sekcje L). */
function runBattle({ seed = 1, random = 0, nA = 10, nB = 10, fcCombatFx = true, roundMs = null } = {}) {
  const fxFlag = GAME_CONFIG.FEATURES.fcCombatFx;
  GAME_CONFIG.FEATURES.fcCombatFx = fcCombatFx;
  reseed('cv4a-battle'); reseedRendererRandom();
  let st = null;
  try {
    world();
    if (roundMs != null) ts.combatRoundMs = () => roundMs;
    const H = helpers();
    st = H ? H.cvBattle({ seed, nA, nB, ...(random ? { random } : {}) }) : null;
    ts.play();
    for (let n = 0; n < 60000; n++) {
      frame(16);
      if (!encActive() && rec.battles.length > 0) { for (let k = 0; k < 30; k++) frame(16); break; }
    }
  } finally {
    GAME_CONFIG.FEATURES.fcCombatFx = fxFlag;
  }
  const hashes = {
    rounds: rec.rounds.length,
    events: rec.rounds.map((s) => sha(norm(s))),
    serialize: Object.fromEntries(Object.entries(rec.serial).map(([k, s]) => [k, sha(norm(s))])),
    record: rec.battles.map((s) => sha(norm(s))),
  };
  const names = Object.fromEntries((vm?.getAllVessels?.() ?? []).map((v) => [v.id, v.name]));
  return { st, hashes, payloads: rec.payloads, states: rec.states, encId: rec.encId, roundMs: ts.combatRoundMs?.() ?? null, names };
}

const SCENARIOS = [
  { key: 'seed1', opts: { seed: 1 } },
  { key: 'seed2random', opts: { seed: 2, random: 1 } },
];

// ── --record: nagraj baseline (TYLKO na drzewie sprzed zmiany DSCS) ─────────────────────────────────────────────────
if (RECORD_TO) {
  const out = { step: 'CV-4a', recordedFrom: process.env.CV4A_BASELINE_COMMIT ?? 'unknown',
    note: 'Skróty SHA-256 (JSON, id starcia / bitwy zastąpione znacznikami): round.events każdej rundy, DSCS serialize() po rundach 3 i 10, rekord battle:resolved — bitwy stagera cvBattle, nagrane TYM keeperem na drzewie sprzed zmiany DSCS (ładunek FX D-CV-8).',
    scenarios: {} };
  for (const sc of SCENARIOS) {
    const r = runBattle(sc.opts);
    out.scenarios[sc.key] = { opts: sc.opts, ...r.hashes };
    console.log(`${sc.key}: rund ${r.hashes.rounds}, rekordów ${r.hashes.record.length}, serialize ${Object.keys(r.hashes.serialize).join('/')}`);
  }
  mkdirSync(dirname(RECORD_TO), { recursive: true });
  writeFileSync(RECORD_TO, JSON.stringify(out, null, 1) + '\n');
  console.log(`baseline zapisany: ${RECORD_TO}`);
  process.exit(0);
}

// ═══ W0 — DSCS bajt w bajt (D-CV-8: edycja wyłącznie ładunku FX) ════════════════════════════════════════════════════
header('W0 — (a) round.events, serialize() i rekord bitwy bajt w bajt jak przed CV-4a; ładunek FX nie dotyka logiki');
let BASE = null;
try { BASE = JSON.parse(readFileSync(FIXTURE, 'utf8')); } catch { BASE = null; }
assert(!!BASE?.scenarios?.seed1 && !!BASE?.scenarios?.seed2random, `W0-0 baseline wczytany (${BASE?.recordedFrom ?? 'brak'})`);
const RUNS = {};
for (const sc of SCENARIOS) {
  const r = runBattle(sc.opts);
  RUNS[sc.key] = r;
  const b = BASE?.scenarios?.[sc.key];
  console.log(`     ${sc.key}: rund ${r.hashes.rounds} (baseline ${b?.rounds ?? '?'}), rekordów ${r.hashes.record.length}, ładunków roundFx ${r.payloads.length}`);
  assert(!!b && r.hashes.rounds >= 5 && r.hashes.rounds === b.rounds && same(r.hashes.events, b.events),
    `W0-${sc.key}-a round.events każdej rundy bajt w bajt (${r.hashes.rounds} rund)`);
  assert(!!b && same(r.hashes.serialize, b.serialize) && Object.keys(b.serialize).length === 2,
    `W0-${sc.key}-b DSCS serialize() po rundach 3 i 10 bajt w bajt`);
  assert(!!b && r.hashes.record.length === 1 && same(r.hashes.record, b.record), `W0-${sc.key}-c rekord bitwy (battle:resolved) bajt w bajt`);
}
{
  const off = runBattle({ seed: 1, fcCombatFx: false });
  const on = RUNS.seed1;
  assert(on.payloads.length >= 5 && off.payloads.length === 0 && same(off.hashes, on.hashes),
    `W0-d ŚWIADEK + kontrola: z ładunkiem FX (${on.payloads.length} emisji) i bez niego (0) — round.events, serialize i rekord identyczne`);
}

// ═══ W1 — pola ładunku FX (D-CV-8) ══════════════════════════════════════════════════════════════════════════════════
header('W1 — ładunek `combat:roundFx`: round, seed, weapon, side, dmg, hpAfter, shieldAfter, killed (nie na round.events)');
{
  const r = RUNS.seed1;
  const pl = r.payloads.map((x) => x.p);
  const stateByRound = new Map(r.states.map((s) => [s.round, s]));
  const roundsOk = pl.length >= 5 && pl.every((p, i) => Number.isInteger(p.round) && (i === 0 || p.round > pl[i - 1].round));
  assert(roundsOk && pl.every((p) => p.seed === STAGER?.cvSeedBase?.(1)), `W1a numer rundy rosnący, ziarno = cvSeedBase(1) (${pl.length} ładunków)`);
  const evs = pl.flatMap((p) => p.events);
  const sideOk = evs.every((e) => (e.side === 'A') === /^CV-A/.test(r.names[e.attacker] ?? ''));
  const wOk = evs.every((e) => typeof e.weapon === 'string' && /^weapon_/.test(e.weapon));
  const dmgOk = evs.every((e) => (e.hit ? e.dmg >= 0 : e.dmg === 0));
  assert(evs.length >= 50 && wOk && dmgOk && evs.every((e) => e.side === 'A' || e.side === 'B') && sideOk,
    `W1b ${evs.length} zdarzeń: moduł broni, strona A / B, obrażenia (pudło — 0)`);
  // Odtworzenie W PRZÓD od stanu po poprzedniej rundzie (z regeneracją): HP po każdym zdarzeniu == hpAfter; ostatnie zdarzenie
  // w cel == stan po rundzie (HP — regeneracja go nie rusza); `killed` dokładnie przy przejściu HP przez 0.
  let hpBad = 0, lastBad = 0, killBad = 0, checked = 0, kills = 0;
  for (const p of pl) {
    const prev = stateByRound.get(p.round - 1)?.ships ?? null;
    const cur = stateByRound.get(p.round)?.ships ?? null;
    if (!prev || !cur) continue;
    const hp = new Map(Object.entries(prev).map(([id, s]) => [id, s.hp]));
    const lastOf = new Map();
    for (const e of p.events) {
      const before = hp.get(e.target) ?? 0;
      const after = before - (e.hit ? e.dmg : 0);
      hp.set(e.target, after);
      if (Math.abs(after - e.hpAfter) > 1e-9) hpBad++;
      if ((e.killed === true) !== (e.hit && before > 0 && after <= 0)) killBad++;
      if (e.killed) kills++;
      lastOf.set(e.target, e);
      checked++;
    }
    for (const [id, e] of lastOf) if (e.hpAfter !== cur[id]?.hp) lastBad++;
  }
  assert(checked >= 50 && hpBad === 0 && lastBad === 0, `W1c HP po każdym zdarzeniu = odtworzenie w przód (${checked} zdarzeń); ostatnie w cel = stan po rundzie, bajt w bajt`);
  assert(killBad === 0 && kills >= 1, `W1d \`killed\` dokładnie przy przejściu HP przez 0 (${kills} zniszczeń)`);
  const FX_KEYS = ['weapon', 'side', 'dmg', 'hpAfter', 'shieldAfter', 'killed'];
  assert(evs.every((e) => FX_KEYS.every((k) => k in e)) && evs.every((e) => e.shieldAfter >= 0),
    'W1e pola FX w KAŻDYM zdarzeniu ładunku (osłona po zdarzeniu ≥ 0); `round.events` bez nich — W0 (skróty bajt w bajt)');
}

// ═══ L — rejestr salw (czysta logika) na PRAWDZIWYCH ładunkach bitew stagera ═════════════════════════════════════════
const LEDGER = await tryImport('../../renderer/combat/CombatLedgerLogic.js');

/** Rejestr zasilony ładunkami bitwy: przyjście rundy = czas zegara świata (60 kl./s — zegar prezentacji == realny). */
function feedLedger(run, { arriveScale = 1, gapL = 8, tuning = null } = {}) {
  if (!LEDGER) return null;
  const led = new LEDGER.CombatLedger(tuning ? { tuning } : {});
  const t0 = run.payloads[0]?.at ?? 0;
  const recs = [];
  for (const { at, p } of run.payloads) {
    const nowMs = (at - t0) * arriveScale;
    const rec = led.addRound({ encounterId: 'E', round: p.round, seed: p.seed, events: p.events, nowMs, roundMs: run.roundMs ?? 1000, gapL: () => gapL });
    recs.push({ rec, nowMs, p });
  }
  return { led, recs };
}

header('L1–L5 — rejestr: każde zdarzenie raz, deterministyczny, opóźnienie ≤ 1 R, bez strzału po zniszczeniu, zniszczenie = trafienie zabijające');
for (const key of ['seed1', 'seed2random']) {
  const run = RUNS[key];
  const F = feedLedger(run);
  const F2 = feedLedger(run);
  if (!F) { assert(false, `L-${key} brak modułu rejestru`); continue; }
  const { led, recs } = F;
  const all = recs.flatMap((x) => x.rec?.entries ?? []);
  const nEv = run.payloads.reduce((a, x) => a + x.p.events.length, 0);
  const keys = new Set(all.map((x) => `${x.round}:${x.index}`));
  const dup = led.addRound({ encounterId: 'E', round: run.payloads[0].p.round, seed: 1, events: run.payloads[0].p.events, nowMs: 0, roundMs: 1000 });
  console.log(`     ${key}: rund ${recs.length}, zdarzeń ${nEv}, wpisów ${all.length}, zniszczeń ${led.stats.kills}, `
    + `opóźnienie maks. ${led.stats.maxLagR.toFixed(3)} R, rozpiętość maks. ${led.stats.maxSpanR.toFixed(3)} R, poza kolejnością ${led.stats.outOfOrder}`);
  assert(all.length === nEv && keys.size === nEv && dup === null && led.stats.duplicates === 1,
    `L1-${key} każde zdarzenie dokładnie raz (${all.length} / ${nEv}); ta sama runda drugi raz — pominięta`);
  const strip = (e) => JSON.stringify(e, (k, v) => (k === 'impacted' ? undefined : v));
  assert(same(all.map(strip), F2.recs.flatMap((x) => x.rec?.entries ?? []).map(strip)), `L2-${key} deterministyczny: te same ładunki → ten sam harmonogram`);
  const T = LEDGER.LEDGER_TUNING;
  let lagBad = 0, spanBad = 0, spillBad = 0;
  for (const { rec } of recs) {
    if (rec.startMs - rec.arriveMs > T.WPN_LAG_MAX * rec.roundMs + 1e-9) lagBad++;
    for (const x of rec.entries) {
      if (x.kind !== 'missile' && x.impactAt > rec.startMs + rec.R + 1e-6) spanBad++;
      if (x.kind === 'missile' && x.impactAt > rec.startMs + 2 * rec.R + 1e-6) spillBad++;
    }
  }
  assert(lagBad === 0, `L3a-${key} start rundy ≤ ${T.WPN_LAG_MAX} R po nadejściu (opóźnienie maks. ${led.stats.maxLagR.toFixed(3)} R)`);
  assert(spanBad === 0 && spillBad === 0, `L3b-${key} laser / kinetyk trafiają w swojej rundzie, rakieta najpóźniej w następnej (≤ 2 R)`);
  const killIds = all.filter((x) => x.killed).map((x) => x.target);
  let afterKill = 0, killMismatch = 0;
  for (const id of killIds) {
    const at = led.killAt(id);
    for (const x of all) if (x.attacker === id && x.fireAt >= at) afterKill++;
    const ke = all.find((x) => x.killed && x.target === id);
    if (at !== ke.impactAt) {
      killMismatch++;
      if (process.env.CV4A_DIAG) {
        const later = all.filter((x) => x.hit && x.target === id && x.impactAt > ke.impactAt);
        const lf = all.filter((x) => x.attacker === id).map((x) => x.fireAt);
        console.log(`       DIAG ${id}: kill r${ke.round}#${ke.index} ${ke.kind} impact ${ke.impactAt.toFixed(1)} killAt ${at.toFixed(1)}; późniejsze trafienia: ${later.map((x) => `r${x.round}#${x.index} ${x.kind} fire ${x.fireAt.toFixed(1)} imp ${x.impactAt.toFixed(1)}`).join(' | ')}; strzały ofiary maks. ${Math.max(...lf).toFixed(1)}`);
      }
    }
  }
  assert(killIds.length >= 1 && afterKill === 0 && led.stats.violations === 0,
    `L4-${key} żaden strzał okrętu po jego pokazanym zniszczeniu (${killIds.length} zniszczeń; w tej rundzie strzelał: ${killIds.filter((id) => all.some((x) => x.attacker === id && x.round === all.find((y) => y.killed && y.target === id).round)).length})`);
  assert(killMismatch === 0, `L5-${key} chwila zniszczenia = trafienie zabijające (rozjazdy ${killMismatch})`);
}

header('L6 — HP pokazywane: po ostatnim trafieniu rundy = stan logiczny końca rundy; nigdy nie rośnie; bez czekających = logika');
for (const key of ['seed1', 'seed2random']) {
  const run = RUNS[key];
  if (!LEDGER) { assert(false, `L6-${key} brak modułu rejestru`); continue; }
  const t0 = run.payloads[0].at;
  const arrivals = run.payloads.map(({ at, p }) => ({ t: at - t0, p }));
  const states = run.states.map((s) => ({ t: s.at - t0, round: s.round, ships: s.ships }));
  const firstRound = run.payloads[0].p.round;
  const startState = states.find((s) => s.round === firstRound - 1) ?? { ships: states[0].ships };
  const logicalAt = (t) => { let s = startState; for (const x of states) if (x.t <= t) s = x; return s; };
  const ids = Object.keys(startState.ships);
  const addRound = (led, a) => led.addRound({ encounterId: 'E', round: a.p.round, seed: a.p.seed, events: a.p.events, nowMs: a.t, roundMs: run.roundMs ?? 1000, gapL: () => 8 });
  // Przejście zbierające: wszystkie wpisy (czasy trafień — do siatki próbek). Rejestr idzie wyłącznie w przód, więc próbki biegną
  // na DRUGIM rejestrze, zasilanym tak jak w grze (runda w chwili nadejścia, `advance` do chwili próbki).
  const scout = new LEDGER.CombatLedger();
  const allEntries = arrivals.flatMap((a) => addRound(scout, a)?.entries ?? []);
  const tEnd = Math.max(...allEntries.map((x) => x.impactAt)) + 100;
  const led = new LEDGER.CombatLedger();
  let ai = 0;
  const pres2 = (t) => {
    while (ai < arrivals.length && arrivals[ai].t <= t) addRound(led, arrivals[ai++]);
    led.advance(t);
    const L = logicalAt(t);
    return Object.fromEntries(ids.map((id) => { const s = L.ships[id]; return [id, { ...led.presented(id, s.hp, s.shield, s.hpStart, s.shieldStart), lhp: s.hp, lsh: s.shield, hp0: s.hpStart }]; }));
  };
  const times = [...new Set([...arrivals.map((a) => a.t), ...allEntries.flatMap((x) => [x.impactAt, x.impactAt + 0.5])])]
    .concat(Array.from({ length: Math.ceil(tEnd / 50) }, (_, i) => i * 50)).sort((a, b) => a - b);
  let mono = 0, idle = 0, idleBad = 0, prev = null;
  for (const t of times) {
    const P = pres2(t);
    for (const id of ids) {
      if (prev && P[id].hp > prev[id].hp + 1e-9) mono++;
      if (P[id].pending === 0) { idle++; if (Math.abs(P[id].hp - Math.max(0, Math.min(P[id].hp0, P[id].lhp))) > 1e-12) idleBad++; }
    }
    prev = P;
  }
  // koniec rundy n: chwila ostatniego trafienia rund ≤ n, jeśli żadne trafienie rund > n jeszcze nie nadeszło
  const byRound = [...new Set(allEntries.map((x) => x.round))].sort((a, b) => a - b);
  let ends = 0, endBad = 0, endShield = 0, endShieldBad = 0;
  for (const n of byRound) {
    const Tn = Math.max(...allEntries.filter((x) => x.round <= n).map((x) => x.impactAt));
    const later = allEntries.filter((x) => x.round > n).map((x) => x.impactAt);
    if (later.length && Math.min(...later) <= Tn) continue;
    // stan od nowa do Tn (rejestr idzie wyłącznie w przód)
    const ledN = new LEDGER.CombatLedger();
    let k = 0;
    while (k < arrivals.length && arrivals[k].t <= Tn) {
      const a = arrivals[k++];
      ledN.addRound({ encounterId: 'E', round: a.p.round, seed: a.p.seed, events: a.p.events, nowMs: a.t, roundMs: run.roundMs ?? 1000, gapL: () => 8 });
    }
    ledN.advance(Tn);
    const endN = states.find((s) => s.round === n);
    const L = logicalAt(Tn);
    const sameRound = L.round === n;
    ends++;
    for (const id of ids) {
      const s = L.ships[id], e = endN.ships[id];
      const pr = ledN.presented(id, s.hp, s.shield, s.hpStart, s.shieldStart);
      if (Math.abs(pr.hp - Math.max(0, Math.min(e.hpStart, e.hp))) > 1e-6) endBad++;
      if (sameRound) { endShield++; if (Math.abs(pr.shield - Math.max(0, Math.min(e.shieldStart, e.shield))) > 1e-9) endShieldBad++; }
    }
  }
  console.log(`     ${key}: próbek ${times.length}, końców rund sprawdzonych ${ends} (osłony w tej samej rundzie logiki: ${endShield / Math.max(1, ids.length)})`);
  assert(ends >= 3 && endBad === 0, `L6a-${key} po ostatnim trafieniu rundy HP pokazywane = stan logiczny końca rundy (${ends} rund, ${ids.length} okrętów)`);
  assert(endShield > 0 && endShieldBad === 0, `L6b-${key} osłona po ostatnim trafieniu = stan końca rundy (z regeneracją), gdy logika jeszcze w tej rundzie`);
  assert(mono === 0, `L6c-${key} HP pokazywane nigdy nie rośnie (${times.length} próbek × ${ids.length} okrętów)`);
  assert(idle > 0 && idleBad === 0, `L6d-${key} bez czekających trafień HP pokazywane = logiczne co do bitu (${idle} próbek)`);
}

header('L7 — Finding 637: wolny zegar prezentacji (rundy GĘŚCIEJ niż co R) — harmonogram nie odpływa; KONTROLA bez dopasowania tempa');
if (!LEDGER) assert(false, 'L7 brak modułu rejestru');
else {
  const run = RUNS.seed1;
  const slow = feedLedger(run, { arriveScale: 0.23 });
  const ctl = feedLedger(run, { arriveScale: 0.23, tuning: { ...LEDGER.LEDGER_TUNING, WPN_REFF_MIN: 1 } });
  const last = slow.recs[slow.recs.length - 1].rec, lastC = ctl.recs[ctl.recs.length - 1].rec;
  const spanBad = slow.recs.filter(({ rec }) => rec.entries.some((x) => x.impactAt > rec.startMs + 2 * rec.R + 1e-6)).length;
  console.log(`     zegar ×0,23: opóźnienie maks. ${slow.led.stats.maxLagR.toFixed(3)} R, ostatnia runda ${((last.startMs - last.arriveMs) / last.roundMs).toFixed(3)} R, tempo R_eff ${(last.R / last.roundMs).toFixed(3)}; `
    + `KONTROLA (R_eff = R): opóźnienie maks. ${ctl.led.stats.maxLagR.toFixed(3)} R, ostatnia ${((lastC.startMs - lastC.arriveMs) / lastC.roundMs).toFixed(3)} R`);
  assert(slow.led.stats.maxLagR <= 0.5 && last.R < last.roundMs && spanBad === 0,
    `L7a harmonogram kurczy się z odstępem nadejść (R_eff ${(last.R / last.roundMs).toFixed(2)} R), opóźnienie ≤ 0,5 R, trafienia rundy ≤ 2 R_eff`);
  assert(ctl.led.stats.maxLagR >= 0.9, 'L7b KONTROLA: bez dopasowania tempa opóźnienie dochodzi do sufitu 1 R — przyrząd widzi różnicę');
}

header('L8 — nadrabianie (dwie rundy w jednej klatce) i kolejne nadejścia: start ≤ 1 R po nadejściu');
if (!LEDGER) assert(false, 'L8 brak modułu rejestru');
else {
  const run = RUNS.seed1;
  const led = new LEDGER.CombatLedger();
  const p = run.payloads.map((x) => x.p);
  const a = led.addRound({ encounterId: 'E', round: p[0].round, seed: 1, events: p[0].events, nowMs: 0, roundMs: 1000 });
  const b = led.addRound({ encounterId: 'E', round: p[1].round, seed: 1, events: p[1].events, nowMs: 0, roundMs: 1000 });
  const c = led.addRound({ encounterId: 'E', round: p[2].round, seed: 1, events: p[2].events, nowMs: 0, roundMs: 1000 });
  assert(a.startMs === 0 && b.startMs === 1000 && c.startMs <= 1000 && led.stats.maxLagR <= 1 + 1e-9,
    `L8a trzy rundy naraz: starty ${a.startMs} / ${b.startMs} / ${c.startMs} ms — druga po R, trzecia nie później niż 1 R po nadejściu`);
}

header('L9 — czysty harmonogram: wzajemne zniszczenie w jednej rundzie, okręt ginący od pierwszej salwy');
if (!LEDGER) assert(false, 'L9 brak modułu rejestru');
else {
  const ev = (attacker, target, category, extra = {}) => ({ attacker, target, category, hit: true, dmg: 10, blockedByShield: 0, killed: false, ...extra });
  const events = [ev('a', 'b', 'short', { killed: true }), ev('c', 'b', 'long'), ev('b', 'a', 'medium', { killed: true }), ev('b', 'c', 'long'), ev('d', 'c', 'short')];
  let worst = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const { items, stats } = LEDGER.scheduleRound({ events, roundMs: 1000, seed, round: 3, gapL: () => 8 });
    worst = Math.max(worst, stats.violations);
    const kImp = (t) => items.find((x) => x.ev.killed && x.ev.target === t).impact;
    if (items.some((x) => (x.ev.attacker === 'a' && x.fire >= kImp('a')) || (x.ev.attacker === 'b' && x.fire >= kImp('b')))) worst = Math.max(worst, 1);
  }
  assert(worst === 0, 'L9a 200 ziaren: wzajemne zniszczenie (a ↔ b) — każdy strzela przed własnym trafieniem zabijającym');
  const tune = { ...LEDGER.LEDGER_TUNING };
  const r1 = LEDGER.scheduleRound({ events, roundMs: 1000, seed: 7, round: 3, gapL: () => 8, tuning: tune });
  const r2 = LEDGER.scheduleRound({ events, roundMs: 1000, seed: 7, round: 3, gapL: () => 8, tuning: tune });
  const r3 = LEDGER.scheduleRound({ events, roundMs: 1000, seed: 8, round: 3, gapL: () => 8, tuning: tune });
  const sig = (r) => r.items.map((x) => [x.fire, x.impact].map((v) => v.toFixed(6)).join('/')).join(' ');
  assert(sig(r1) === sig(r2) && sig(r1) !== sig(r3), 'L9b to samo ziarno — ten sam harmonogram; inne ziarno — inna kolejność salw');
  const win = LEDGER.LEDGER_TUNING.WPN_VOLLEY_END * 1000;
  const sides = r1.items.map((x) => [x.ev.attacker, x.fire]);
  assert(r1.items.every((x) => x.fire >= 0 && (x.kind === 'missile' ? x.fire <= win + 1e-9 : x.impact <= 1000 + 1e-9)),
    `L9c strzały w oknie [0, ${win}] ms, laser / kinetyk trafiają ≤ R (${sides.map((s) => s[0] + '@' + s[1].toFixed(0)).join(', ')})`);
}

header('L10 — liczniki per starcie (`encounterStats`) i od wczytania strony (`stats`): dwa starcia w jednym rejestrze (kontrola właściciela 2026-11-12)');
if (!LEDGER || typeof LEDGER.CombatLedger?.prototype?.encounterStats !== 'function') assert(false, 'L10 rejestr bez `encounterStats` (liczników per starcie)');
else {
  const led = new LEDGER.CombatLedger();
  // dwie bitwy stagera jak dwa starcia jednego załadowania strony; okręty drugiej z przedrostkiem (obie bitwy mają te same id)
  const feeds = [['E1', RUNS.seed1, '', 0], ['E2', RUNS.seed2random, 'x', 60000]];
  for (const [encId, run, pre, off] of feeds) {
    const t0 = run.payloads[0].at;
    for (const { at, p } of run.payloads) {
      const events = p.events.map((e) => ({ ...e, attacker: pre + e.attacker, target: pre + e.target }));
      led.addRound({ encounterId: encId, round: p.round, seed: p.seed, events, nowMs: off + (at - t0), roundMs: run.roundMs ?? 1000, gapL: () => 8 });
    }
  }
  const before = { e1: led.encounterStats('E1'), e2: led.encounterStats('E2') };
  led.advance(1e9);
  const e1 = led.encounterStats('E1'), e2 = led.encounterStats('E2'), g = led.stats;
  const keys = ['rounds', 'events', 'hits', 'duplicates', 'violations', 'outOfOrder', 'kills', 'killsShown'];
  const nEv = (run) => run.payloads.reduce((a, x) => a + x.p.events.length, 0);
  console.log(`     E1 ${JSON.stringify(e1)} · E2 ${JSON.stringify(e2)}`);
  assert(e1.rounds === RUNS.seed1.payloads.length && e2.rounds === RUNS.seed2random.payloads.length && e1.events === nEv(RUNS.seed1) && e2.events === nEv(RUNS.seed2random),
    'L10a starcie liczy tylko swoje rundy i strzały');
  assert(keys.every((k) => e1[k] + e2[k] === g[k]) && g.kills >= 2, `L10b liczniki od wczytania = suma starć (${keys.filter((k) => e1[k] + e2[k] !== g[k]).join(', ') || 'wszystkie'})`);
  assert(before.e1.killsShown === 0 && before.e2.killsShown === 0 && e1.kills >= 1 && e2.kills >= 1 && e1.killsShown === e1.kills && e2.killsShown === e2.kills,
    'L10c zniszczenie pokazane liczy się w starciu, z którego pochodzi (przed chwilą trafienia — 0)');
  led.addRound({ encounterId: 'E2', round: RUNS.seed2random.payloads[0].p.round, seed: 1, events: [], nowMs: 0, roundMs: 1000 });
  assert(led.encounterStats('E2').duplicates === 1 && led.encounterStats('E1').duplicates === 0 && led.stats.duplicates === 1, 'L10d powtórzona runda — w swoim starciu i od wczytania, nie w innym');
  const LG = LEDGER.LEDGER_INFO_LEGEND;
  const missing = [...Object.keys(led.stats), 'czekajace'].filter((k) => typeof LG?.rejestr?.[k] !== 'string');
  assert(typeof LG?.wTymStarciu === 'string' && typeof LG?.odZaladowaniaStrony === 'string' && missing.length === 0,
    `L10e legenda: oba zakresy i linia dla każdego licznika rejestru${missing.length ? ' — brak: ' + missing.join(', ') : ''}`);
}

// ═══ T — wieżyczki ═══════════════════════════════════════════════════════════════════════════════════════════════════
header('T — wybór wieżyczki: najlepszy namiar, równe — po kolei; deterministyczny, zawsze w weapons[]');
if (!LEDGER) assert(false, 'T brak modułu rejestru');
else {
  const c = { x: 0, y: 0.3, z: 0 };
  const top = { x: 0.001, y: 0.3012, z: 0 }, bot = { x: 0.001, y: 0.2988, z: 0 };
  const level = { x: 1, y: 0.3, z: 0 }, above = { x: 0.2, y: 1.3, z: 0 };
  const seqLevel = [0, 1, 2, 3, 4, 5].map((k) => LEDGER.pickTurret({ turrets: [top, bot], center: c, target: level, counter: k }));
  const seqAbove = [0, 1, 2, 3].map((k) => LEDGER.pickTurret({ turrets: [top, bot], center: c, target: above, counter: k }));
  assert(seqLevel.join() === '0,1,0,1,0,1', `Ta cel na wprost (górna i dolna wieżyczka równe): po kolei ${seqLevel.join()}`);
  assert(seqAbove.every((k) => k === 0), `Tb cel wysoko nad okrętem: zawsze górna (${seqAbove.join()})`);
  const many = Array.from({ length: 5 }, (_, i) => ({ x: Math.cos(i), y: 0.3 + Math.sin(i) * 0.01, z: Math.sin(i) }));
  const picks = Array.from({ length: 50 }, (_, k) => LEDGER.pickTurret({ turrets: many, center: c, target: { x: Math.cos(k), y: 0.3, z: Math.sin(k * 0.7) }, counter: k }));
  const again = Array.from({ length: 50 }, (_, k) => LEDGER.pickTurret({ turrets: many, center: c, target: { x: Math.cos(k), y: 0.3, z: Math.sin(k * 0.7) }, counter: k }));
  assert(picks.every((k) => Number.isInteger(k) && k >= 0 && k < many.length) && same(picks, again) && LEDGER.pickTurret({ turrets: [], center: c, target: level }) === -1,
    'Tc 50 wyborów: zawsze indeks z weapons[], powtarzalnie; brak wieżyczek — −1');
}

// ═══ R — metody renderera (prawdziwe, ze źródła) na prawdziwym Three.js r171 ══════════════════════════════════════
const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const ENGINE = await tryImport('../../renderer/combat/FxEngine.js');
const CLOCK  = await tryImport('../../renderer/combat/PresentationClock.js');
const CUEBUS = await tryImport('../../renderer/combat/CombatCueBus.js');
const CUEDATA = await tryImport('../../data/CombatCueData.js');
const RIG    = await tryImport('../../renderer/ShipModelRig.js');
const HPTS   = await tryImport('../../renderer/ShipHardpoints.js');
const CHOREO = await tryImport('../../renderer/combat/ChoreographyLogic.js');
const FXC = await import('../../config/CombatFxConfig.js');
const FX  = await import('../../utils/VesselFxLogic.js');
const VMR = await import('../../renderer/VesselModelResolver.js');
const VES = await import('../../entities/Vessel.js');
const RRNG = await import('../../renderer/RendererRng.js');

const TR = read('src/renderer/ThreeRenderer.js');
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  const params = TR.slice(TR.indexOf('(', i) + 1, sigEnd);
  const end = TR.indexOf('\n  }\n', sigEnd);
  return { params, body: TR.slice(sigEnd + 4, end) };
}
const WORLD_SCALE = Number((TR.match(/const WORLD_SCALE\s*=\s*([\d.]+)/) ?? [])[1]);
const S = (v) => v / WORLD_SCALE;
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'CombatLedger', 'pickTurret', 'ledgerRng',
  'VESSEL_TARGET_SIZE', 'vesselTargetSize', 'vesselSizeClass', 'fxWeaponColor', 'FX_SHIELD_COLOR', 'cueWeaponOfCategory', 'cueSizeOfClass',
  'screenPan', 'CombatCueBus', 'EventBus', 'paintRigMaterials', 'rendererRandom', 'wreckTiltQuaternion', 'FxEngine', 'logDepthOn',
  'isEnemyVessel', 'isEndpointVisibleInCombat', 'isPlayerEngagement', 'quatFromYawPitchRoll', 'WRECK_EMISSIVE_COLOR', 'FX_HDR_WRECK', 'document',
  'LEDGER_INFO_LEGEND'];
const VALUES = () => [THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance, FX.isEngagementInView, LEDGER?.CombatLedger, LEDGER?.pickTurret, LEDGER?.ledgerRng,
  VMR.VESSEL_TARGET_SIZE, VMR.vesselTargetSize, VMR.vesselSizeClass, FXC.weaponColor, FXC.FX_SHIELD_COLOR, CUEBUS?.cueWeaponOfCategory, CUEBUS?.cueSizeOfClass,
  CUEBUS?.screenPan, CUEBUS?.CombatCueBus, EventBus, RIG?.paintRigMaterials, RRNG.rendererRandom, HPTS?.wreckTiltQuaternion, ENGINE?.FxEngine, () => true,
  VES.isEnemyVessel, FX.isEndpointVisibleInCombat, FX.isPlayerEngagement, CHOREO?.quatFromYawPitchRoll, FX.WRECK_EMISSIVE_COLOR, 2.5, globalThis.document,
  LEDGER?.LEDGER_INFO_LEGEND];
const METHODS = ['_cvWpnRoundFx', '_cvWpnSpawn', '_cvWpnImpact', '_cvWpnResolveLocal', '_cvWpnMuzzle', '_cvWpnTick', '_cvEncList', '_cvEncById', '_cvEncOf', '_cvVisWreck', '_cvWpnPresentKill', '_cvWpnKillLook',
  '_cvWpnWreckGate', 'cvPresentedState', 'cvEventShown', '_ensureFxEngine', '_tickCvFx', '_combatEndpointWorld', '_isEnemyEndpointVisible', '_isCombatRevealed',
  '_ensureCueBus', '_cueDestroyed', '_flushCues', '_cvTiltWreck', '_cvFxRoundFx', '_cueEncounterId', '_cueShot', 'cvLedgerInfo'];
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(...VALUES());
}
/** Handler `vessel:wrecked` renderera (nie metoda — ciało strzałki z konstruktora, wyciągnięte ze źródła). */
function wreckHandler() {
  // ⚠ PRZECELOWANE ŚWIADOMIE (CV-8a, 2026-11-13): ciało słuchacza `vessel:wrecked` przeniesione do `this._onVesselWreckedView`
  //   (słuchacz zostawia sobie tylko wstrzymanie wraku powtórki bitwy orbitalnej — `CvOrbital.deferWreck` — i woła je; powtórka woła
  //   to samo ciało po zniszczeniu w powtórce). Kod ciała co do znaku ten sam — wyciągamy je z nowego miejsca; stare — zapas.
  const heads = [["this._onVesselWreckedView = (vesselId, vessel) => {", '\n    };\n'], ["EventBus.on('vessel:wrecked', safe(({ vesselId, vessel }) => {", '\n    }));\n']];
  for (const [head, tail] of heads) {
    const i = TR.indexOf(head);
    if (i < 0) continue;
    const b0 = i + head.length;
    const end = TR.indexOf(tail, b0);
    return new Function(...NAMES, `return function ({ vesselId, vessel }) {\n${TR.slice(b0, end)}\n};`)(...VALUES());
  }
  return null;
}

/** Atrapa renderera z prawdziwymi metodami CV-4a; statki = obiekty z pozycją rysowaną (świat), rama kanoniczna — atrapa rigu. */
function fakeR() {
  const R = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000), _vessels: new Map(), _fxEngine: null, _fxGroup: null,
    _presClock: CLOCK ? new CLOCK.PresentationClock() : null, _galaxyActive: false, _galaxyFlight: false, cvTuning: ENGINE?.LIVE_CV_FX ?? {}, _cvLedger: null,
    _cvWpnTurretTurn: new Map(), _cvWpnStats: { rounds: 0, shots: 0, hidden: 0, killsShown: 0, wreckDeduped: 0, wreckDeferred: 0, wreckUnknown: 0 },
    _stageMarks: new Map(), _shipLightPool: null, _gfx: null, _cueBus: null, missing: [], explosions: [], _planets: new Map(), _moons: new Map(), _planetoids: new Map() };
  for (const n of METHODS) { const fn = makeMethod(n); if (fn) R[n] = fn; else R.missing.push(n); }
  R._spawnExplosion = (pos) => { R.explosions.push({ at: R._presClock.nowMs, x: pos.x }); };
  R._onWrecked = wreckHandler();
  R.camera.position.set(0, 0.5, 0.4); R.camera.lookAt(0, 0.3, 0); R.camera.updateMatrixWorld(true);
  R._presClock?.tick(performance.now());   // `_tickCvFx` tyka zegar prezentacji czasem realnym (`performance.now` — zegar wirtualny keepera)
  return R;
}
/** Statek atrapy: rama kanoniczna z wieżyczkami właściciela (warp_frigate W1 / W2) albo bez wieżyczek. */
function addShip(R, id, { x, z, enemy = false, turrets = true } = {}) {
  const wrapper = new THREE.Object3D();
  wrapper.position.set(x, 0.3, z);
  wrapper.visible = true;
  const canon = new THREE.Object3D();
  const fq = HPTS?.frameQuaternion?.({ bow: [-1, 0, 0], up: [0, 1, 0] }) ?? [0, 0, 0, 1];
  canon.quaternion.set(fq[0], fq[1], fq[2], fq[3]);
  canon.scale.setScalar(VMR.VESSEL_TARGET_SIZE.frigate);
  const mat = new THREE.MeshStandardMaterial();
  const rig = { canon, frameQuat: fq, materials: [mat], exhaust: new THREE.Object3D(), lights: null, frameBow: [-1, 0, 0],
    weapons: turrets ? [{ id: 'W1', p: [0.0798, 0.0779, 0.0013] }, { id: 'W2', p: [0.0804, -0.0767, 0.0012] }] : [] };
  rig.exhaust.visible = true;
  R._vessels.set(id, { sprite: wrapper, canonical: true, rig, isModel3D: true });
  return { id, name: id.toUpperCase(), shipId: 'hull_frigate', hullId: 'hull_frigate', isEnemy: enemy, ownerEmpireId: enemy ? 'emp_t' : undefined,
    position: { x: x * WORLD_SCALE, y: z * WORLD_SCALE, state: 'orbiting', dockedAt: null } };
}
function kosmosFor(ships, { quality = 'contact', engaged = false } = {}) {
  const byId = new Map(ships.map((v) => [v.id, v]));
  window.KOSMOS = { activeSystemId: SYS, timeSystem: { combatRoundMs: () => 1000, isPaused: false, multiplier: 1 },
    vesselManager: { getVessel: (id) => byId.get(id) ?? null },
    intelSystem: { getVesselContact: () => ({ quality }) },
    deepSpaceCombatSystem: { listActive: () => [], _findActiveEncounterContaining: () => (engaged ? { sideA: { ownerEmpireId: 'player' }, sideB: { ownerEmpireId: 'emp_t' } } : null) } };
}
const payload = (round, events) => ({ encounterId: 'enc_r', systemId: SYS, round, seed: 4242, midpoint: { x: 0, y: 0 }, events });
const pev = (attacker, target, category, { hit = true, dmg = 12, blocked = 0, killed = false, hpAfter = 50 } = {}) => ({
  attacker, target, category, hit, blockedByShield: blocked, aPos: null, tPos: null, weapon: { short: 'weapon_laser', medium: 'weapon_kinetic', long: 'weapon_missile' }[category],
  side: attacker.startsWith('a') ? 'A' : 'B', dmg: hit ? dmg : 0, hpAfter, shieldAfter: 0, killed });
/** Klatki pętli renderu: czas realny (wirtualny) +16 ms, `_tickCvFx` (prawdziwy — sam tyka zegar prezentacji). */
const runFrames = (R, ms) => { for (let t = 0; t < ms; t += 16) { clock.now += 16; R._tickCvFx(); } };
function withFlags(flags, fn) {
  const F = GAME_CONFIG.FEATURES, keep = {};
  for (const k of Object.keys(flags)) { keep[k] = F[k]; F[k] = flags[k]; }
  // Wyjątek w sekcji (np. brak metody renderera na drzewie sprzed CV-4a) = FAIL tej sekcji, nie przerwanie przebiegu: pin musi
  // DEGRADOWAĆ, inaczej fail-first nie daje koloru sekcjom niżej.
  try { return fn(); } catch (e) { assert(false, `sekcja przerwana wyjątkiem: ${e?.message ?? e}`); return null; } finally { Object.assign(F, keep); }
}

header('R0 — metody CV-4a wyciągnięte ze źródła renderera');
{
  const R = fakeR();
  assert(R.missing.length === 0 && typeof R._onWrecked === 'function', `R0 metody (${METHODS.length}) i handler \`vessel:wrecked\`${R.missing.length ? ' — brak: ' + R.missing.join(', ') : ''}`);
}

header('F — (c) mgła wojny: niewidoczny koniec — bez strzału i bez sygnału (rejestr i tak liczy HP pokazywane); KONTROLA — widoczny');
withFlags({ fcCombatFx: true, cvFxEngine: true, cvWeapons: true, cvPresets: true }, () => {
  const mk = (quality) => {
    const R = fakeR();
    const ships = [addShip(R, 'a1', { x: -0.05, z: 0 }), addShip(R, 'b1', { x: 0.05, z: 0, enemy: true })];
    kosmosFor(ships, { quality });
    R._cvWpnRoundFx(payload(3, [pev('a1', 'b1', 'short'), pev('b1', 'a1', 'medium'), pev('a1', 'b1', 'long', { hit: false })]));
    return R;
  };
  const H = mk('unknown'), V = mk('contact');
  const hs = H._fxEngine?.stats?.(), vs = V._fxEngine?.stats?.();
  console.log(`     ukryty: strzały silnika ${hs?.wpnShots ?? '—'}, ukryte ${H._cvWpnStats.hidden}, sygnały ${H._cueBus?.stats?.().scheduled ?? 0}, wpisy rejestru ${H._cvLedger?.pendingCount?.() ?? 0}; `
    + `widoczny: strzały ${vs?.wpnShots ?? '—'}, sygnały ${V._cueBus?.stats?.().scheduled ?? 0}`);
  assert(!!hs && hs.wpnShots === 0 && hs.pools.mote.spawned === 0 && H._cvWpnStats.hidden === 3 && (H._cueBus?.stats?.().scheduled ?? 0) === 0,
    'Fa wróg niewykryty (wywiad „unknown”, poza starciem z graczem): 0 strzałów, 0 punktów, 0 sygnałów');
  assert(H._cvLedger?.pendingCount?.() === 3, 'Fb rejestr i tak ma wszystkie 3 zdarzenia (HP pokazywane własnego okrętu schodzi w chwili trafienia)');
  assert(!!vs && vs.wpnShots === 3 && V._cvWpnStats.hidden === 0 && (V._cueBus?.stats?.().scheduled ?? 0) > 0, 'Fc KONTROLA: wróg wykryty — 3 strzały i sygnały');
});

header('C — sygnały walki w chwilach rejestru: fire = strzał, impact / shieldHit = trafienie, kill = zniszczenie');
withFlags({ fcCombatFx: true, cvFxEngine: true, cvWeapons: true, cvPresets: true }, () => {
  const R = fakeR();
  const ships = [addShip(R, 'a1', { x: -0.05, z: 0 }), addShip(R, 'a2', { x: -0.05, z: 0.03 }), addShip(R, 'b1', { x: 0.05, z: 0, enemy: true })];
  kosmosFor(ships, { quality: 'contact' });
  R._cvWpnRoundFx(payload(5, [pev('a1', 'b1', 'short'), pev('a2', 'b1', 'long', { blocked: 5, dmg: 0 }), pev('b1', 'a1', 'medium', { hit: false }),
    pev('a1', 'b1', 'medium', { killed: true, hpAfter: -3 })]));
  const led = R._cvLedger, bus = R._cueBus;
  const rec = led?.roundsOf?.('enc_r')?.[0];
  const kinds = CUEDATA?.CUE_KINDS ?? [];
  const got = [];
  for (let i = 0; i < (bus?.n ?? 0); i++) got.push(`${kinds[Math.floor(bus.key[i] / 3)]}@${bus.at[i].toFixed(3)}:${bus.vid[i]}`);
  const want = [];
  for (const x of rec?.entries ?? []) {
    want.push(`fire@${x.fireAt.toFixed(3)}:${x.attacker}`);
    if (x.hit) want.push(`${x.blocked > 0 ? 'shieldHit' : 'impact'}@${x.impactAt.toFixed(3)}:${x.target}`);
    if (x.killed) want.push(`kill@${led.killAt(x.target).toFixed(3)}:${x.target}`);
  }
  got.sort(); want.sort();
  assert(want.length === 8 && same(got, want), `C1 ${got.length} sygnałów = czasy rejestru (strzały, trafienia, osłona, zniszczenie): ${got.slice(0, 3).join(' ')} …`);
});

header('K — dokładnie jeden pokaz zniszczenia na okręt: trafienie zabijające (rejestr) + późny `vessel:wrecked`');
withFlags({ fcCombatFx: true, cvFxEngine: true, cvWeapons: true, cvPresets: true, cvStage: true }, () => {
  // K1: pokaz w chwili trafienia, potem wrak z logiki — bez drugiej eksplozji i sygnału, wygląd wraku zostaje (bez ponownego przechyłu)
  const R = fakeR();
  const ships = [addShip(R, 'a1', { x: -0.05, z: 0 }), addShip(R, 'b1', { x: 0.05, z: 0, enemy: true })];
  kosmosFor(ships, { quality: 'contact' });
  R._cvWpnRoundFx(payload(2, [pev('a1', 'b1', 'short', { killed: true, hpAfter: -4 })]));
  const killAt = R._cvLedger?.killAt?.('b1');
  const destroyed = () => { const b = R._cueBus; let n = 0; for (let i = 0; i < (b?.n ?? 0); i++) if ((CUEDATA?.CUE_KINDS ?? [])[Math.floor(b.key[i] / 3)] === 'destroyed') n++; return n + (b?.stats?.().byKind?.destroyed ?? 0); };
  const hpBefore = R.cvPresentedState('b1', { hp: -4, shieldHP: 0, hpStart: 100, shieldHPStart: 0 })?.hp;
  runFrames(R, Math.max(0, (killAt ?? 0) - 40));
  const early = R.explosions.length;
  runFrames(R, 200);
  const e = R._vessels.get('b1');
  const after = { boom: R.explosions.length, at: R.explosions[0]?.at, look: e?.rig?.materials?.[0]?.color?.getHex?.(), exhaust: e?.rig?.exhaust?.visible, q: e?.sprite?.quaternion?.toArray?.().join(), dc: destroyed() };
  const hpAt = R.cvPresentedState('b1', { hp: -4, shieldHP: 0, hpStart: 100, shieldHPStart: 0 })?.hp;
  R._onWrecked?.call(R, { vesselId: 'b1', vessel: ships[1] });
  const fin = { boom: R.explosions.length, q: e?.sprite?.quaternion?.toArray?.().join(), dc: destroyed() };
  console.log(`     K1: zniszczenie zaplanowane na ${killAt?.toFixed?.(1)} ms, eksplozje przed ${early} / po ${after.boom} (w ${after.at?.toFixed?.(1)} ms) / po wraku ${fin.boom}; HP pokazywane przed ${hpBefore} / po ${hpAt}`);
  assert(early === 0 && after.boom === 1 && Math.abs(after.at - killAt) <= 16.5, 'K1a eksplozja w chwili trafienia zabijającego (± klatka), nie wcześniej');
  assert(hpBefore === 12 - 4 && hpAt === 0, 'K1b HP pokazywane: przed trafieniem — stan sprzed rundy, w chwili trafienia — 0');
  assert(after.look === RIG?.RIG_PALETTE?.WRECK_COLOR && after.exhaust === false && R._cvWpnStats.killsShown === 1, 'K1c wygląd wraku i zgaszony silnik w chwili zniszczenia');
  assert(fin.boom === 1 && fin.q === after.q && fin.dc === after.dc && R._cvWpnStats.wreckDeduped === 1, 'K1d późny `vessel:wrecked`: bez drugiej eksplozji, sygnału „destroyed” i przechyłu (jeden pokaz)');
  // K2: wrak z logiki, zanim trafienie zabijające doleciało — eksplozja dopiero w chwili trafienia (raz)
  const R2 = fakeR();
  const s2 = [addShip(R2, 'a1', { x: -0.05, z: 0 }), addShip(R2, 'b1', { x: 0.05, z: 0, enemy: true })];
  kosmosFor(s2, { quality: 'contact' });
  R2._cvWpnRoundFx(payload(2, [pev('a1', 'b1', 'long', { killed: true, hpAfter: -4 })]));
  const k2 = R2._cvLedger?.killAt?.('b1');
  runFrames(R2, 100);
  R2._onWrecked?.call(R2, { vesselId: 'b1', vessel: s2[1] });
  const atWreck = R2.explosions.length;
  runFrames(R2, Math.max(0, (k2 ?? 0) + 100));
  assert(atWreck === 0 && R2.explosions.length === 1 && Math.abs(R2.explosions[0].at - k2) <= 16.5 && R2._cvWpnStats.wreckDeferred === 1,
    `K2 wrak z logiki przed trafieniem zabijającym: eksplozja dopiero w chwili trafienia (${R2.explosions[0]?.at?.toFixed?.(1)} ≈ ${k2?.toFixed?.(1)} ms), jedna`);
  // K3: okręt nieznany rejestrowi (bitwa poza widokiem) — dzisiejsza zamiana, jedna eksplozja, potem rejestr go nie pokaże drugi raz
  const R3 = fakeR();
  const s3 = [addShip(R3, 'c1', { x: 0, z: 0, enemy: true })];
  kosmosFor(s3, { quality: 'contact' });
  R3._cvLedger = LEDGER ? new LEDGER.CombatLedger() : null;
  try { R3._onWrecked?.call(R3, { vesselId: 'c1', vessel: s3[0] }); } catch (e) { console.log('     K3 wyjątek handlera: ' + e.message); }
  runFrames(R3, 100);
  if (process.env.CV4A_DIAG) console.log(`     K3 diag: eksplozje ${R3.explosions.length}, stan ${R3._cvLedger?.killState?.('c1')}, liczniki ${JSON.stringify(R3._cvWpnStats)}`);
  assert(R3.explosions.length === 1 && R3._cvLedger?.killState?.('c1') === 'shown' && R3._cvWpnStats.wreckUnknown === 1, 'K3 okręt nieznany rejestrowi: dzisiejsza eksplozja przy wraku, jedna');
  // K4–K6 (kontrola właściciela 2026-11-12, sonda `kosmos-handover/cv-4a/probe_kills.mjs` B3): dźwignia `cvWeapons(0)` W TRAKCIE bitwy.
  // K4: zniszczenie pokazane przy trafieniu, potem OFF, potem wrak z logiki — bez drugiej eksplozji (przed poprawką: druga na końcu bitwy)
  const R4 = fakeR();
  const s4 = [addShip(R4, 'a1', { x: -0.05, z: 0 }), addShip(R4, 'b1', { x: 0.05, z: 0, enemy: true })];
  kosmosFor(s4, { quality: 'contact' });
  R4._cvWpnRoundFx(payload(2, [pev('a1', 'b1', 'short', { killed: true, hpAfter: -4 })]));
  runFrames(R4, (R4._cvLedger?.killAt?.('b1') ?? 0) + 100);
  const shown4 = R4.explosions.length, q4 = R4._vessels.get('b1')?.sprite?.quaternion?.toArray?.().join();
  GAME_CONFIG.FEATURES.cvWeapons = false;
  R4._onWrecked?.call(R4, { vesselId: 'b1', vessel: s4[1] });
  runFrames(R4, 200);
  GAME_CONFIG.FEATURES.cvWeapons = true;
  assert(shown4 === 1 && R4.explosions.length === 1 && R4._vessels.get('b1')?.sprite?.quaternion?.toArray?.().join() === q4,
    `K4 \`cvWeapons(0)\` po pokazanym zniszczeniu: wrak z logiki bez drugiej eksplozji i bez ponownego przechyłu (eksplozje ${shown4} → ${R4.explosions.length})`);
  // K5: trafienie zabijające w locie, OFF, wrak z logiki przed trafieniem — jedna eksplozja (w chwili trafienia), nie dwie
  const R5 = fakeR();
  const s5 = [addShip(R5, 'a1', { x: -0.05, z: 0 }), addShip(R5, 'b1', { x: 0.05, z: 0, enemy: true })];
  kosmosFor(s5, { quality: 'contact' });
  R5._cvWpnRoundFx(payload(2, [pev('a1', 'b1', 'long', { killed: true, hpAfter: -4 })]));
  const k5 = R5._cvLedger?.killAt?.('b1');
  runFrames(R5, 100);
  GAME_CONFIG.FEATURES.cvWeapons = false;
  R5._onWrecked?.call(R5, { vesselId: 'b1', vessel: s5[1] });
  runFrames(R5, Math.max(0, (k5 ?? 0) + 100));
  GAME_CONFIG.FEATURES.cvWeapons = true;
  assert(R5.explosions.length === 1, `K5 \`cvWeapons(0)\` z trafieniem zabijającym w locie: jedna eksplozja (${R5.explosions.length})`);
  // K6 KONTROLA: sesja wyłącznie OFF (rejestru nie ma) — dzisiejsza ścieżka co do bitu: eksplozja przy wraku, wpis bez znacznika CV-4a
  const R6 = fakeR();
  const s6 = [addShip(R6, 'c1', { x: 0, z: 0, enemy: true })];
  kosmosFor(s6, { quality: 'contact' });
  GAME_CONFIG.FEATURES.cvWeapons = false;
  R6._onWrecked?.call(R6, { vesselId: 'c1', vessel: s6[0] });
  GAME_CONFIG.FEATURES.cvWeapons = true;
  const e6 = R6._vessels.get('c1');
  assert(R6._cvLedger === null && R6.explosions.length === 1 && e6?.cvKilled === undefined && R6._cvWpnStats.wreckUnknown === 0,
    'K6 KONTROLA: tylko OFF, bez rejestru — dzisiejsza eksplozja przy wraku, bez znaczników i liczników CV-4a');
});

header('I — `ledgerInfo` (kontrola właściciela 2026-11-12): liczniki z nazwanym zakresem — per starcie i od wczytania strony, legenda');
withFlags({ fcCombatFx: true, cvFxEngine: true, cvWeapons: true, cvPresets: false }, () => {
  const R = fakeR();
  const ships = [addShip(R, 'a1', { x: -0.05, z: 0 }), addShip(R, 'b1', { x: 0.05, z: 0, enemy: true })];
  kosmosFor(ships, { quality: 'contact' });
  const none = R.cvLedgerInfo();
  R._cvWpnRoundFx(payload(4, [pev('a1', 'b1', 'short'), pev('b1', 'a1', 'medium', { hit: false })]));
  runFrames(R, 400);
  const info = R.cvLedgerInfo();
  const s0 = info?.starcia?.[0];
  assert(none?.ledger === null && typeof none?.odZaladowaniaStrony?.renderer?.killsShown === 'number' && !('stats' in (none ?? {})),
    'I1 bez rejestru: `ledger: null`, liczniki renderera pod `odZaladowaniaStrony`');
  assert(s0?.wTymStarciu?.rounds === 1 && s0?.wTymStarciu?.events === 2 && s0?.aktywne === false && info?.odZaladowaniaStrony?.rejestr?.rounds === 1
    && typeof info?.odZaladowaniaStrony?.renderer?.shots === 'number' && !('rejestr' in info) && !('renderer' in info),
    'I2 starcie: `wTymStarciu` (od jego początku); sumy — wyłącznie pod `odZaladowaniaStrony` (bez dwuznacznych `rejestr` / `renderer` na wierzchu)');
  const lgR = Object.keys(R._cvWpnStats).filter((k) => typeof info?.legenda?.renderer?.[k] !== 'string');
  assert(info?.legenda === LEDGER?.LEDGER_INFO_LEGEND && lgR.length === 0, `I3 legenda w odczycie, linia dla każdego licznika renderera${lgR.length ? ' — brak: ' + lgR.join(', ') : ''}`);
});

header('M — wylot z wieżyczki: najlepszy namiar, po kolei przy równych; bez wieżyczek — punkt na kadłubie');
withFlags({ fcCombatFx: true, cvFxEngine: true, cvWeapons: true, cvPresets: false }, () => {
  const R = fakeR();
  const ships = [addShip(R, 'a1', { x: 0, z: 0 }), addShip(R, 'b1', { x: 0.06, z: 0, enemy: true }), addShip(R, 'n1', { x: 0, z: 0.05, turrets: false })];
  kosmosFor(ships, { quality: 'contact' });
  const aw = { x: 0, y: 0.3, z: 0 }, tw = { x: 0.06, y: 0.3, z: 0 };
  const seq = [0, 1, 2, 3].map(() => R._cvWpnMuzzle('a1', aw, tw, VMR.VESSEL_TARGET_SIZE.frigate).turret);
  const up = R._cvWpnMuzzle('a1', aw, { x: 0.01, y: 0.4, z: 0 }, VMR.VESSEL_TARGET_SIZE.frigate);
  const upTurret = up.turret, upY = up.y;
  const nm = R._cvWpnMuzzle('n1', { x: 0, y: 0.3, z: 0.05 }, tw, VMR.VESSEL_TARGET_SIZE.frigate);
  const nd = Math.hypot(nm.x - 0, nm.y - 0.3, nm.z - 0.05);
  assert(seq.join() === '0,1,0,1', `M1 cel na wprost: W1 / W2 po kolei (${seq.join()})`);
  assert(upTurret === 0 && upY > 0.3, `M2 cel nad okrętem: górna wieżyczka W1 (y ${upY.toFixed(4)})`);
  assert(nm.turret === -1 && nm.mode === 2 && nd > 0 && nd <= 0.5 * VMR.VESSEL_TARGET_SIZE.frigate + 1e-9, `M3 slot bez wieżyczek: punkt na kadłubie (${(nd / VMR.VESSEL_TARGET_SIZE.frigate).toFixed(2)} L od środka), śledzony z obrotem statku`);
  // wylot jedzie za statkiem: obrót i przesunięcie wrappera po strzale przesuwają początek wiązki
  R._cvWpnRoundFx(payload(9, [pev('a1', 'b1', 'short')]));
  const E = R._fxEngine;
  runFrames(R, 200);
  const s0 = E ? Array.from(E.wbeams.f.aStart.array.slice(0, 3)) : [];
  R._vessels.get('a1').sprite.position.x += 0.01;
  R._vessels.get('a1').sprite.rotateY(0.5);
  runFrames(R, 32);
  const s1 = E ? Array.from(E.wbeams.f.aStart.array.slice(0, 3)) : [];
  const exp = { x: 0, y: 0, z: 0 };
  R._cvWpnResolveLocal('a1', 0.0798, 0.0779, 0.0013, exp);
  const exp2 = { x: 0, y: 0, z: 0 };
  R._cvWpnResolveLocal('a1', 0.0804, -0.0767, 0.0012, exp2);
  const near = (p, q) => Math.hypot(p[0] - q.x, p[1] - q.y, p[2] - q.z) < 1e-6;
  assert(E?.wbeams?.n === 1 && Math.abs(s1[0] - s0[0]) > 0.005 && (near(s1, exp) || near(s1, exp2)), 'M4 początek wiązki śledzi wieżyczkę (przesunięcie i obrót okrętu po strzale)');
});

header('H — gorąca ścieżka języka broni: zero konstrukcji THREE i tablic typowanych po rozgrzewce');
if (!ENGINE) assert(false, 'H brak modułu silnika');
else withFlags({ fcCombatFx: true, cvFxEngine: true, cvWeapons: true, cvPresets: false }, () => {
  const R = fakeR();
  const ships = [];
  for (let i = 0; i < 10; i++) { ships.push(addShip(R, 'a' + i, { x: -0.06, z: i * 0.01 })); ships.push(addShip(R, 'b' + i, { x: 0.06, z: i * 0.01, enemy: true })); }
  kosmosFor(ships, { quality: 'contact' });
  const cats = ['short', 'medium', 'long'];
  const round = (k) => payload(100 + k, ships.flatMap((s, i) => [0, 1, 2, 3, 4].map((w) => pev(s.id, ships[(i + 1 + w) % 20].id, cats[(i + w) % 3], { hit: (i + w) % 4 !== 0 }))));
  R._cvWpnRoundFx(round(0)); runFrames(R, 1100);
  const probe = () => { const o = new THREE.Object3D(), m = new THREE.Material(), g = new THREE.BufferGeometry(), t = new THREE.Texture(); const ids = [o.id, m.id, g.id, t.id]; m.dispose(); g.dispose(); t.dispose(); return ids; };
  const names = ['Float32Array', 'Float64Array', 'Uint16Array', 'Uint32Array', 'Int32Array', 'Uint8Array'];
  const saved = {}; let typed = 0;
  const i0 = probe();
  for (const n of names) { saved[n] = globalThis[n]; globalThis[n] = new Proxy(saved[n], { construct(T, args) { typed++; return new T(...args); } }); }
  try { for (let k = 1; k <= 20; k++) { R._cvWpnRoundFx(round(k)); runFrames(R, 1000); } } finally { for (const n of names) globalThis[n] = saved[n]; }
  const i1 = probe();
  const st = R._fxEngine.stats();
  console.log(`     20 rund × 100 strzałów: szczyt wiązki ${st.pools.wbeam.peak} / pociski ${st.pools.bolt.peak} / punkty ${st.pools.mote.peak}, kradzieże ${st.pools.wbeam.steals + st.pools.bolt.steals + st.pools.mote.steals}`);
  assert(i1.every((v, j) => v - i0[j] === 1) && typed === 0, `H1 zero konstrukcji THREE (przyrost id ${i1.map((v, j) => v - i0[j] - 1).join('/')}) i tablic typowanych (${typed})`);
  assert(st.pools.wbeam.steals + st.pools.bolt.steals === 0 && st.wpnShots === 21 * 100, `H2 każdy strzał narysowany (${st.wpnShots} / ${21 * 100}), bez kradzieży slotów strzałów`);
  const SRC = read('src/renderer/combat/FxEngine.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const body = (name) => { const i = SRC.indexOf(`\n  ${name}(`); if (i < 0) return null; const a = SRC.indexOf('{', i); return SRC.slice(a, SRC.indexOf('\n  }\n', a)); };
  const HOT = ['spawnBeam', 'spawnBolt', 'spawnMote', '_followWpn', '_wpnEnd', '_rgb', '_epochFor', 'setFollow', 'free'];
  const bad = HOT.filter((n) => { const b = body(n); return b == null || /\bnew\s+[A-Z]/.test(b); });
  assert(bad.length === 0, `H3 źródło: gorąca ścieżka języka broni (${HOT.length} metod) bez \`new\`${bad.length ? ' — ' + bad.join(', ') : ''}`);
});

header('P — pasek walki (Finding 614): HP pokazywane zamiast logicznego, linia logu dopiero po trafieniu; bez rejestru — jak dziś');
{
  const SL = await tryImport('../../ui/CombatStripLogic.js');
  const mkEnc = () => ({ id: 'enc_p', isActive: true, currentRound: 4, location: { systemId: SYS, point: { x: 0, y: 0 } },
    sideA: { ownerEmpireId: 'player', vesselIds: ['a1'], joinedVesselIds: [] }, sideB: { ownerEmpireId: 'emp_t', vesselIds: ['b1'], joinedVesselIds: [] },
    vesselStates: new Map([['a1', { hp: 40, hpStart: 100, shieldHP: 0, shieldHPStart: 10 }], ['b1', { hp: -5, hpStart: 100, shieldHP: 0, shieldHPStart: 0 }]]),
    timeline: [{ round: 4, events: [{ attacker: 'a1', target: 'b1', weapon: 'weapon_laser', hit: true, damage: 30, blockedByShield: 0 },
      { attacker: 'b1', target: 'a1', weapon: 'weapon_kinetic', hit: true, damage: 20, blockedByShield: 5 }] }] });
  const env = (presented) => ({ getPos: () => ({ x: 0, y: 0 }), radius: 10, activeSystemId: SYS, quality: () => 'contact', presented });
  const presented = (id) => (id === 'b1' ? { hp: 25, shield: 0 } : { hp: 60, shield: 5 });
  const rowsP = SL?.stripBattles?.([mkEnc()], env(presented)) ?? [];
  const rowsL = SL?.stripBattles?.([mkEnc()], env(null)) ?? [];
  const own = rowsP[0]?.own, foe = rowsP[0]?.enemy;
  assert(own?.ships?.[0]?.hp === 60 && own?.ships?.[0]?.shield === 5 && foe?.ships?.[0]?.hp === 25 && foe?.alive === 1 && rowsL[0]?.enemy?.alive === 0 && rowsL[0]?.own?.ships?.[0]?.hp === 40,
    'P1 HP / osłona pokazywane w pasku; okręt zabity w logice, którego trafienie jeszcze leci, nadal „żywy”; bez rejestru — stan logiczny');
  const shown = (encId, round, j) => !(encId === 'enc_p' && round === 4 && j === 1);
  const logP = SL?.stripLog?.(rowsP[0], { shown }) ?? [];
  const logL = SL?.stripLog?.(rowsP[0], {}) ?? [];
  assert(logP.length === 1 && logL.length === 2 && /a1/.test(logP[0].text), `P2 log: zdarzenie jeszcze nie trafione — bez linii (${logP.length} / ${logL.length}); bez rejestru — wszystkie`);
}

header('Z — źródło CV-4a: zero Math.random w nowych modułach');
try {
  const files = ['src/renderer/combat/CombatLedgerLogic.js', 'src/renderer/combat/FxEngine.js', 'src/renderer/combat/FxShaders.js'];
  const dirty = files.filter((f) => /\bMath\.random\b/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')));
  const wpn = METHODS.filter((n) => n.startsWith('_cvWpn')).map((n) => methodOf(n)?.body ?? '').join('\n');
  assert(dirty.length === 0 && !/\bMath\.random\b/.test(wpn) && wpn.length > 1000, `Z1 rejestr, silnik, shadery i metody renderera _cvWpn*: zero Math.random${dirty.length ? ' — ' + dirty.join(', ') : ''}`);
} catch (e) { assert(false, `Z1 przerwane: ${e?.message ?? e}`); }

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
