// ═══════════════════════════════════════════════════════════════════════════════
// sb4_strike_own_target_smoke — KEEPER Findingu 447 (AI STRIKES BACK S4, sesja 4 — decyzja SB93, wariant a).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2, §6 (447).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: zwykłe uderzenie eskortą (`OrderService.issueAttack`, bez rekordu eskadry) na kolonię gracza, którą imperium
//   zdobyło w trakcie lotu (wcześniejsza fala, odbicie). Po naprawie 195 (S4-7) kadłuby zostają przy swoim domu, dolatują
//   z misją `attack`, a `EnemyAttackHandler` rozgrywał bitwę planetarną na ciele JUŻ WŁASNYM napastnika — z obecnością
//   gracza w układzie (wraki, księga wojny, dominacja). SB93 (a): bitwa jest pomijana, gdy ciało celu należy już do
//   napastnika; kadłuby zostają tak, jak po wygranej (orbita ciała, bez misji, `idle`) — powrót prowadzi istniejąca ścieżka
//   (`DirectorRecall`, gdy ciało leży poza układem stolicy). Zdarzenie audytu `enemyAttack:battleSkipped`.
//
// ⚠ Harness: prawdziwy `GameCore`, MOS, OrderService, EnemyAttackHandler; pula i garnizon WYŁĄCZONE (wzór R-B2b); lot
//   prawdziwą pętlą czasu (`Ticker`, krok 0,05 civY); partia bitwy EAH — okno 500 ms czasu REALNEGO (czekamy 700 ms).
//   Zdobycie celu — produkcyjne `ColonyManager.transferColony` (jak przejęcie przez falę).
//
// PINY (fail-first na `d2f081f`):
//   T1  scena w układzie stolicy imperium (gracz ma tam drugą kolonię z zadokowaną fregatą — obecność): cel zdobyty
//       w locie — brak `battle:resolved` na celu, `enemyAttack:battleSkipped` (`target_own`, oba kadłuby), brak wraków po
//       obu stronach (fregata gracza cała), księga wojny bez bitwy; KONTROLE T1e / T1f (zielone po obu stronach): kadłuby
//       jak po wygranej bitwie (orbita celu, bez misji, `idle`), dom kadłubów = stolica imperium (195, S4-7)
//   T2  scena poza układem stolicy (kolonia imperium w układzie domowym gracza): cel zdobyty w locie — bitwy brak;
//       KONTROLE T2b / T2c (zielone po obu stronach — po wygranej bitwie ta sama ścieżka): kadłuby w zbiorze zamiatacza
//       `DirectorRecall` (istniejąca ścieżka powrotu), odwołanie wydane obu
//   T3  KONTROLA (zielona po obu stronach): bez zdobycia — bitwa na celu jak dotąd, bez zdarzenia pominięcia
//   T4  piny źródłowe: termin właściciela w `_resolveBatchedBattle` PRZED bramką obecności, wypowiedzeniem wojny
//       i księgowaniem; `enemyAttack:battleSkipped` w `DebugLog.TRACKED_EVENTS`
// ═══════════════════════════════════════════════════════════════════════════════

import { reseed, flushZeroDelayTimers } from '../headless/env.js';   // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { DirectorRecall } from '../../systems/director/DirectorRecall.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function quiet(fn) {
  const log = console.log, warn = console.warn, err = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; console.error = err; }
}
function boot() {
  reseed('kosmos-default');
  gameState.restore(null);
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  K.orderService = new OrderService();
  K.enemyAttackHandler = new EnemyAttackHandler();
  K.directorRecall = new DirectorRecall();
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  if (K.fleetPoolSystem) K.fleetPoolSystem.enabled = false;
  const emp = K.empireRegistry.listAll()[0].id;
  const cap = K.directorProduction.capitalOf(emp);
  const w = { core, K, vm: K.vesselManager, emp, cap, home: K.homePlanet?.id ?? null, ticker: new Ticker(core.timeSystem),
              battles: [], skipped: [], wrecked: [], arrived: [] };
  EventBus.on('battle:resolved', (d) => w.battles.push({ battleId: d?.battleId ?? null, planetId: d?.result?.location?.planetId ?? null }));
  EventBus.on('enemyAttack:battleSkipped', (d) => w.skipped.push(d));
  EventBus.on('vessel:wrecked', (d) => w.wrecked.push(d?.vesselId ?? d?.vessel?.id ?? null));
  EventBus.on('vessel:arrived', ({ vessel, mission }) => { if (mission?.type === 'attack') w.arrived.push(vessel?.id); });
  return w;
}
const run = (w, civYears) => quiet(() => w.ticker.run(civYears, { tickSize: 0.05 }));
const freeBodies = (w, sys, from) => ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem(t, sys))
  .filter(b => !w.K.colonyManager.getColony(b.id))
  .map(b => ({ b, d: Math.hypot(b.x - from.x, b.y - from.y) })).sort((a, z) => z.d - a.d).map(x => x.b);
const war = (w) => quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
const capture = (w, bodyId) => quiet(() => w.K.colonyManager.transferColony(bodyId, w.emp, 'invasion'));
const escorts = (w, planetId, n) => Array.from({ length: n },
  () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId }).vessel);
const strike = (w, es, targetId) => es.map(v => w.K.orderService.issueAttack(v.id, { targetBodyId: targetId }));
/** Lot do przylotu obu kadłubów (najwyżej 10 lat gry = 120 civY), potem okno partii EAH (500 ms realnego czasu). */
async function flyIn(w, es) {
  for (let i = 0; i < 240 && !es.every(v => w.arrived.includes(v.id)); i++) run(w, 0.5);
  flushZeroDelayTimers?.();
  await sleep(700);
  flushZeroDelayTimers?.();
}
const warBattles = (w) => (w.K.warSystem.getWarWith(w.emp)?.battles ?? []).length;

/** Scena A: kolonia gracza (cel) na najdalszym wolnym ciele układu stolicy imperium + druga kolonia gracza (obecność). */
function sceneCapitalSystem(w) {
  const capBody = EntityManager.get(w.cap.planetId);
  const fr = freeBodies(w, capBody.systemId, capBody);
  const target = fr[0], other = fr[fr.length - 1];
  quiet(() => w.K.colonyManager.createColony(target.id, {}, 8, 0));
  quiet(() => w.K.colonyManager.createColony(other.id, {}, 8, 0));
  // Fregata gracza zadokowana przy drugiej kolonii — obrońca bitwy planetarnej EAH (okręty gracza w układzie bez względu
  // na dok); przy wygranej napastnika — wrak (`_wreckPlayerVesselsInSystem`).
  const frigate = w.vm.createAndRegister('hull_frigate', other.id, { modules: ['weapon_laser', 'engine_ion'] });
  war(w);
  const es = escorts(w, w.cap.planetId, 2);
  return { target, other, frigate, es, res: strike(w, es, target.id) };
}

// ═══ T1 — cel zdobyty w locie, układ stolicy imperium ════════════════════════
header('T1  zwykłe uderzenie: cel zdobyty w locie — bitwy nie ma (układ stolicy imperium)');
{
  const w = boot();
  const sc = sceneCapitalSystem(w);
  run(w, 0.3);
  capture(w, sc.target.id);
  const owner = w.K.colonyManager.getColony(sc.target.id)?.ownerEmpireId ?? null;
  await flyIn(w, sc.es);
  const onTarget = w.battles.filter(b => b.planetId === sc.target.id);
  const st = sc.es.map(v => `${v.id}:${v.position.state}@${v.position.dockedAt ?? '-'} m=${v.mission?.type ?? '-'} s=${v.status} wrak=${!!v.isWreck} col=${v.colonyId}`);
  console.log(`     issueAttack ${JSON.stringify(sc.res.map(r => r?.ok))} · właściciel celu ${owner} · przyloty ${w.arrived.length} · fregata gracza ${sc.frigate?.id}@${sc.frigate?.systemId} wrak=${!!sc.frigate?.isWreck}`);
  console.log(`     bitwy na celu ${onTarget.length} · pominięte ${JSON.stringify(w.skipped.map(s => ({ p: s.planetId, r: s.reason, n: s.vesselIds?.length })))} · wraki ${w.wrecked.length}`);
  console.log(`     ${st.join(' | ')}`);
  assert(sc.res.every(r => r?.ok) && owner === w.emp && sc.es.every(v => w.arrived.includes(v.id))
    && sc.frigate?.systemId === EntityManager.get(sc.target.id)?.systemId,
    'T1-ctl scena: uderzenie wydane, cel należy do imperium przed przylotem, oba kadłuby przyleciały z misją `attack`, fregata gracza w układzie celu');
  assert(onTarget.length === 0, 'T1a brak `battle:resolved` na ciele już własnym napastnika');
  const sk = w.skipped.filter(s => s.planetId === sc.target.id);
  assert(sk.length === 1 && sk[0].reason === 'target_own' && sk[0].empireId === w.emp
    && sc.es.every(v => sk[0].vesselIds?.includes(v.id)), 'T1b `enemyAttack:battleSkipped` raz: `target_own`, imperium napastnika, oba kadłuby');
  assert(w.wrecked.length === 0 && sc.es.every(v => !v.isWreck) && !sc.frigate?.isWreck, 'T1c żadnych wraków po obu stronach (fregata gracza cała)');
  assert(warBattles(w) === 0, 'T1d księga wojny bez bitwy (brak wyczerpania z bitwy na ciele własnym)');
  assert(sc.es.every(v => v.position.state === 'orbiting' && v.position.dockedAt === sc.target.id && !v.mission && v.status === 'idle'),
    'T1e KONTROLA: kadłuby jak po wygranej bitwie — orbita celu, bez misji, `idle`');
  assert(sc.es.every(v => v.colonyId === w.cap.planetId), 'T1f KONTROLA: dom kadłubów = stolica imperium (195, S4-7)');
}

// ═══ T2 — poza układem stolicy: istniejąca ścieżka powrotu ═══════════════════
header('T2  poza układem stolicy — kadłuby w zbiorze zamiatacza `DirectorRecall`');
{
  const w = boot();
  const homeBody = EntityManager.get(w.home);
  const fr = freeBodies(w, homeBody.systemId, homeBody);
  const base = fr[fr.length - 1], target = fr[0];
  quiet(() => w.K.colonyManager.createColony(base.id, {}, 8, 0));
  quiet(() => w.K.colonyManager.createColony(target.id, {}, 8, 0));
  war(w);
  capture(w, base.id);                                       // kolonia imperium w układzie domowym gracza (baza wypadu)
  const es = escorts(w, base.id, 2);
  const res = strike(w, es, target.id);
  run(w, 0.3);
  capture(w, target.id);
  await flyIn(w, es);
  const onTarget = w.battles.filter(b => b.planetId === target.id);
  const stranded = w.K.directorRecall.strandedWarshipsAwayFromHome(w.emp).map(v => v.id);
  const recalled = [];
  EventBus.on('director:recalled', (d) => recalled.push(d));
  quiet(() => w.K.directorRecall.recallVessels({ empireId: w.emp, year: w.K.timeSystem.gameTime }, { count: 3 }));
  const recallOrders = es.map(v => v.pendingOrder?.kind ?? v.mission?.type ?? null);
  console.log(`     issueAttack ${JSON.stringify(res.map(r => r?.ok))} · bitwy na celu ${onTarget.length} · pominięte ${w.skipped.length} · wraki ${w.wrecked.length}`);
  console.log(`     zamiatacz ${JSON.stringify(stranded)} · odwołania ${JSON.stringify(recalled.map(r => r.count))} · rozkazy ${JSON.stringify(recallOrders)}`);
  assert(res.every(r => r?.ok) && es.every(v => w.arrived.includes(v.id)), 'T2-ctl scena: uderzenie wydane, oba kadłuby przyleciały');
  assert(onTarget.length === 0 && w.skipped.some(s => s.planetId === target.id && s.reason === 'target_own'),
    'T2a bitwy na celu brak, `enemyAttack:battleSkipped` (`target_own`)');
  assert(es.every(v => stranded.includes(v.id)), 'T2b KONTROLA: oba kadłuby w zbiorze zamiatacza (`strandedWarshipsAwayFromHome`) — istniejąca ścieżka powrotu');
  assert(recalled.some(r => r.count === 2) && es.every(v => v.pendingOrder?.kind === 'recall' || v.mission?.type === 'interstellar_jump'),
    'T2c KONTROLA: odwołanie wydane obu kadłubom (`director:recalled`, composite `recall`)');
}

// ═══ T3 — KONTROLA: bez zdobycia bitwa jak dotąd ═════════════════════════════
header('T3  KONTROLA: bez zdobycia — bitwa na celu jak dotąd');
{
  const w = boot();
  const sc = sceneCapitalSystem(w);
  await flyIn(w, sc.es);
  const onTarget = w.battles.filter(b => b.planetId === sc.target.id);
  console.log(`     bitwy na celu ${onTarget.length} · pominięte ${w.skipped.length}`);
  assert(onTarget.length === 1 && w.skipped.length === 0, 'T3a KONTROLA: cel gracza — jedna bitwa planetarna, bez zdarzenia pominięcia');
}

// ═══ T4 — piny źródłowe ═══════════════════════════════════════════════════════
header('T4  piny źródłowe');
{
  const s = src('../../systems/EnemyAttackHandler.js');
  const body = s.slice(s.indexOf('_resolveBatchedBattle(planetId) {'), s.indexOf('_systemLabel(systemId) {'));
  const iOwn = body.search(/getColony\?\.\(planetId\)\?\.ownerEmpireId[\s\S]{0,120}targetOwner === empireId/);
  const iPres = body.indexOf('hasPlayerPresenceInSystem');
  const iDecl = body.indexOf('declareWar');
  const iRec = body.indexOf('recordBattle');
  assert(iOwn > 0 && iPres > iOwn && iDecl > iOwn && iRec > iOwn,
    'T4a termin właściciela w `_resolveBatchedBattle` PRZED bramką obecności, wypowiedzeniem wojny i księgowaniem bitwy');
  const d = src('../../core/DebugLog.js');
  assert(/'enemyAttack:battleSkipped'/.test(d), 'T4b `enemyAttack:battleSkipped` w `DebugLog.TRACKED_EVENTS`');
}

console.log(`\n═══ sb4_strike_own_target_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
