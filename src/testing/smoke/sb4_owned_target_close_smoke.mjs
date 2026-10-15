// ═══════════════════════════════════════════════════════════════════════════════
// sb4_owned_target_close_smoke — KEEPER Findingów 446 i 195 (AI STRIKES BACK S4, sesja 3 — decyzja SB90).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2, §6 (446); `docs/design/VESSEL_ORDERS_PLAN.md` (195).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA:
//   • 195 — `VesselManager._onColonyDestroyed` (subskrypcje `colony:destroyed` i `colony:captured`) przepisywał na dom
//     GRACZA (`colonyId`, flota kolonii, wymuszony powrót) KAŻDY statek związany z utraconą kolonią — także statki AI.
//     SB90: statki AI nigdy nie przechodzą do gracza (termin właściciela na wejściu pętli).
//   • 446 — eskadra AI w drodze (`launched`), której cel zdobędzie wcześniejsza fala, wisiała na zawsze (rekord `launched`
//     ⇒ `hasSquadronUnderway` ⇒ odbijanie, kampania i depesza zablokowane do końca wojny). SB90: eskadra, której cel należy
//     już do jej imperium, zamyka się OD RAZU jako zdobycie (`closed`, wynik `captured`, powód `target_own`); członkowie
//     wracają do stolicy odwołaniem, a transportowiec z niewylądowaną falą jest usuwany w domu („ogon” rekordu).
//
// ⚠ Harness: prawdziwy `GameCore`, MOS, OrderService, EnemyAttackHandler, `DirectorOffensive` z odbijaniem i kampanią
//   (`registerOffensiveBehaviors`); pula i garnizon WYŁĄCZONE (wzór R-B2b); lot prawdziwą pętlą czasu (`Ticker`, krok
//   0,05 civY). Zdobycie celu — produkcyjne `ColonyManager.transferColony` (jak przejęcie przez falę: `colony:captured`,
//   wpis w księdze wojny). Cel eskadry — kolonia gracza w układzie stolicy imperium (bez skoku warp).
//
// PINY (fail-first na `2264910`):
//   T1  195, gałąź „lot do celu”: członkowie eskadry AI w locie na ciało zdobyte przez ich imperium — `colonyId` bez zmian
//       (stolica imperium), poza flotą domu gracza, bez wymuszonego powrotu; KONTROLA T1d (zielona po obu stronach):
//       statek GRACZA w locie na to ciało — wymuszony powrót do domu gracza, jak dotąd
//   T2  195, gałęzie „powrót do kolonii” i „przypisanie”: kolonia AI usunięta (`removeColony`) — statki AI z nią związane
//       nie trafiają do domu gracza; KONTROLE T2c / T2d (zielone po obu stronach): statek GRACZA związany z kolonią gracza
//       zdobytą (`colony:captured`) albo usuniętą (`colony:destroyed`) — przypisany do domu gracza, jak dotąd
//       (⚠ kadłub utworzony przy kolonii AI dostaje jej właściciela — statki gracza w scenie powstają w domu)
//   T3  446: tik po zdobyciu — rekord `closed`, wynik `captured`, powód `target_own`, `squadron:closed`; brak eskadry
//       w drodze, kampania nie stoi na `squadron_underway`; członkowie bez rozkazu `attack`, w drodze do stolicy;
//       KONTROLA T3f (zielona po obu stronach): bez zdobycia — `launched`, lot do celu trwa
//   T4  kolejność w tiku: transportowiec bezczynny na orbicie celu, który jest już własny — `captured`, nie `not_landed`
//   T5  ogon: transportowiec w domu usunięty razem z falą (`dissolvedUnitIds`), `homeTail` zgaszony, eskorta na orbicie
//       stolicy; KONTROLA T5d (zielona po obu stronach): seria nieudanych prób 0
//   T6  pin źródłowy: termin właściciela na wejściu pętli `_onColonyDestroyed` (przed każdym przepisaniem `colonyId`)
// ═══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { TerritoryService } from '../../systems/TerritoryService.js';
import { InfluenceMap } from '../../systems/InfluenceMap.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';
import { isEnemyVessel } from '../../entities/Vessel.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

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
  K.territoryService = new TerritoryService();
  K.influenceMap = new InfluenceMap();
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  if (K.fleetPoolSystem) K.fleetPoolSystem.enabled = false;
  const off = new DirectorOffensive();
  registerOffensiveBehaviors(off, { allowOverride: true });
  K.directorOffensive = off;
  K.directorRetake = off.retake ?? null;
  K.directorCampaign = off.campaign ?? null;
  const emp = K.empireRegistry.listAll()[0].id;
  const cap = K.directorProduction.capitalOf(emp);
  const w = { core, K, vm: K.vesselManager, sq: K.strikeSquadronSystem, cp: off.campaign ?? null, emp, cap,
              home: K.homePlanet?.id ?? null, ticker: new Ticker(core.timeSystem), ev: [] };
  EventBus.on('squadron:closed', (d) => w.ev.push(d));
  return w;
}
const run = (w, civYears) => quiet(() => w.ticker.run(civYears, { tickSize: 0.05 }));
const rec = (w, id) => w.sq?.getSquadron?.(id) ?? null;
const homeFleet = (w) => w.K.colonyManager.getColony(w.home)?.fleet ?? [];

/**
 * Scena: kolonia GRACZA na najdalszym wolnym ciele układu stolicy imperium, wojna, eskadra (1 eskorta) w locie na nią.
 * @returns {{body:object, r:object, ids:string[]}}
 */
function scene(w) {
  const capBody = EntityManager.get(w.cap.planetId);
  const sys = capBody.systemId;
  const body = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem(t, sys))
    .filter(b => !w.K.colonyManager.getColony(b.id))
    .map(b => ({ b, d: Math.hypot(b.x - capBody.x, b.y - capBody.y) })).sort((a, z) => z.d - a.d)[0].b;
  quiet(() => w.K.colonyManager.createColony(body.id, {}, 8, 0));
  quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
  const e = w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap.planetId }).vessel;
  const r = w.sq.launchSquadron(w.emp, body.id, [e.id], { origin: 'campaign' });
  const s = rec(w, r.squadronId);
  return { body, r, ids: [s.transportId, ...s.escortIds] };
}
const capture = (w, bodyId) => quiet(() => w.K.colonyManager.transferColony(bodyId, w.emp, 'invasion'));

// ═══ T1 — 195: lot do celu ═════════════════════════════════════════════════════
header('T1  195 — statki AI w locie na zdobyte ciało nie przechodzą do gracza');
{
  const w = boot();
  const sc = scene(w);
  run(w, 0.3);
  const before = sc.ids.map(id => ({ id, colonyId: w.vm.getVessel(id)?.colonyId, phase: w.vm.getVessel(id)?.mission?.phase ?? null }));
  // KONTROLA: statek GRACZA w locie na to samo ciało (misja transportowa) — ścieżka ewakuacji gracza bez zmian.
  const p = w.vm.createAndRegister('hull_small', w.home);
  p.mission = { type: 'transport', targetId: sc.body.id, phase: 'outbound', returnYear: (w.K.timeSystem.gameTime ?? 0) + 1 };
  p.position.state = 'in_transit';
  p.position.dockedAt = null;
  capture(w, sc.body.id);
  const after = sc.ids.map(id => w.vm.getVessel(id));
  console.log(`     przed: ${JSON.stringify(before)}`);
  console.log(`     po:    ${JSON.stringify(after.map(v => ({ id: v?.id, colonyId: v?.colonyId, phase: v?.mission?.phase ?? null })))}`);
  assert(after.every(v => v && v.colonyId === w.cap.planetId), 'T1a `colonyId` członków bez zmian (stolica imperium)');
  assert(after.every(v => !homeFleet(w).includes(v.id)), 'T1b członkowie poza flotą domu gracza');
  assert(after.every(v => v.mission?.phase !== 'returning'), 'T1c bez wymuszonego powrotu (`startReturn`)');
  assert(p.colonyId === w.home && p.mission?.phase === 'returning',
    'T1d KONTROLA: statek GRACZA w locie na to ciało — wymuszony powrót do domu gracza');
  quiet(() => w.vm.destroyVessel(p.id));
}

// ═══ T2 — 195: powrót do kolonii i przypisanie ════════════════════════════════
header('T2  195 — usunięta kolonia AI: statki AI z nią związane nie trafiają do domu gracza');
{
  const w = boot();
  const sc = scene(w);
  // KONTROLA T2c: statek GRACZA (utworzony w domu — kadłub utworzony przy kolonii AI dostaje jej właściciela) związany
  //   z kolonią gracza, którą imperium zdobywa (`colony:captured`), poza dokiem — przypisany do domu gracza, jak dotąd.
  const p2 = w.vm.createAndRegister('hull_small', w.home);
  p2.colonyId = sc.body.id;
  p2.homeColonyId = sc.body.id;
  p2.position.state = 'orbiting';
  p2.position.dockedAt = null;
  capture(w, sc.body.id);                              // ciało = kolonia imperium
  const mk = () => {
    const v = w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap.planetId }).vessel;
    v.colonyId = sc.body.id;                            // kadłub „macierzysty” przy tej kolonii
    v.homeColonyId = sc.body.id;
    v.position.state = 'orbiting';
    v.position.dockedAt = null;
    return v;
  };
  const a2 = mk();                                      // gałąź „przypisanie”
  const a3 = mk();                                      // gałąź „powrót do kolonii”
  a3.mission = { type: 'transport', targetId: w.cap.planetId, phase: 'returning', returnTargetX: 1, returnTargetY: 1 };
  // KONTROLA T2d: drugi statek GRACZA związany z kolonią gracza usuwaną (`colony:destroyed`) — przypisany do domu gracza.
  const b2 = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem(t, sc.body.systemId))
    .find(b => !w.K.colonyManager.getColony(b.id));
  quiet(() => w.K.colonyManager.createColony(b2.id, {}, 8, 0));
  const p3 = w.vm.createAndRegister('hull_small', w.home);
  p3.colonyId = b2.id;
  p3.homeColonyId = b2.id;
  p3.position.state = 'orbiting';
  p3.position.dockedAt = null;
  quiet(() => w.K.colonyManager.removeColony(sc.body.id, 'keeper'));
  quiet(() => w.K.colonyManager.removeColony(b2.id, 'keeper'));
  console.log(`     a2 ${a2.colonyId} · a3 ${a3.colonyId} (${a3.mission?.returnTargetX}) · p2 ${p2.colonyId} · p3 ${p3.colonyId}`);
  assert(a2.colonyId === sc.body.id && a2.homeColonyId === sc.body.id && !homeFleet(w).includes(a2.id),
    'T2a gałąź „przypisanie”: statek AI nie przypisany do domu gracza');
  assert(a3.colonyId === sc.body.id && a3.mission?.returnTargetX === 1 && !homeFleet(w).includes(a3.id),
    'T2b gałąź „powrót do kolonii”: statek AI nie przekierowany do domu gracza');
  assert(!isEnemyVessel(p2) && p2.colonyId === w.home && homeFleet(w).includes(p2.id),
    'T2c KONTROLA: statek GRACZA związany ze zdobytą kolonią — przypisany do domu gracza');
  assert(!isEnemyVessel(p3) && p3.colonyId === w.home && homeFleet(w).includes(p3.id),
    'T2d KONTROLA: statek GRACZA związany z usuniętą kolonią — przypisany do domu gracza');
}

// ═══ T3 — 446: zamknięcie od razu jako zdobycie ═══════════════════════════════
header('T3  446 — eskadra, której cel jest już własny, zamyka się od razu jako zdobycie');
{
  const w = boot();
  const sc = scene(w);
  run(w, 0.3);
  capture(w, sc.body.id);
  run(w, 0.05);                                         // jeden tik
  const s = rec(w, sc.r.squadronId);
  const ms = sc.ids.map(id => w.vm.getVessel(id));
  const ev = w.ev.filter(e => e.squadronId === sc.r.squadronId);
  const ex = w.cp?.campaignExhaustion?.(w.emp);
  console.log(`     rekord: ${s?.stage} · wynik ${s?.outcome} · powód ${s?.closeReason} · ogon ${s?.homeTail} · zdarzenia ${JSON.stringify(ev)}`);
  console.log(`     członkowie: ${JSON.stringify(ms.map(v => ({ id: v?.id, m: v?.mission?.type ?? null, mo: v?.movementOrder?.type ?? null,
    by: v?.movementOrder?.issuedBy ?? null, po: v?.pendingOrder?.kind ?? null })))} · kampania: ${ex?.reason}`);
  assert(s?.stage === 'closed' && s.outcome === 'captured' && s.closeReason === 'target_own',
    'T3a rekord `closed`, wynik `captured`, powód `target_own`');
  assert(ev.length === 1 && ev[0].outcome === 'captured' && ev[0].closeReason === 'target_own', 'T3b `squadron:closed` raz (`captured`, `target_own`)');
  assert(w.sq.hasSquadronUnderway(w.emp) === false && !!ex && ex.reason !== 'squadron_underway',
    'T3c brak eskadry w drodze — kampania nie stoi na `squadron_underway`');
  assert(ms.every(v => v && v.mission?.type !== 'attack' && v.movementOrder?.type !== 'attack' && v.pendingOrder?.kind !== 'attack'),
    'T3d członkowie bez rozkazu `attack`');
  assert(ms.every(v => v.movementOrder?.issuedBy === 'ai_recall' || v.pendingOrder?.kind === 'recall'), 'T3e członkowie w drodze do stolicy (odwołanie)');
}
{
  const w = boot();
  const sc = scene(w);
  run(w, 0.35);
  const s = rec(w, sc.r.squadronId);
  const ms = sc.ids.map(id => w.vm.getVessel(id));
  assert(s?.stage === 'launched' && ms.every(v => v?.movementOrder?.type === 'attack'),
    'T3f KONTROLA: bez zdobycia — `launched`, lot do celu trwa');
}

// ═══ T4 — kolejność w tiku ════════════════════════════════════════════════════
header('T4  kolejność: cel już własny wygrywa z „atakiem bez desantu”');
{
  const w = boot();
  const sc = scene(w);
  capture(w, sc.body.id);
  // Transportowiec bezczynny na orbicie celu (jak po ataku bez desantu) — cel jest już własny.
  for (const id of sc.ids) {
    const v = w.vm.getVessel(id);
    if (v.movementOrder?.status === 'active') quiet(() => w.K.movementOrderSystem.cancelOrder(v.id, 'keeper'));
    delete v._suspendedMission;
    v.mission = null; v.pendingOrder = null; v.status = 'idle';
    v.position.state = 'orbiting'; v.position.dockedAt = sc.body.id;
  }
  w.sq._tick();
  const s = rec(w, sc.r.squadronId);
  console.log(`     rekord: ${s?.stage} · wynik ${s?.outcome}`);
  assert(s?.stage === 'closed' && s.outcome === 'captured', 'T4a wynik `captured` (nie `returning` / `not_landed`)');
}

// ═══ T5 — ogon ════════════════════════════════════════════════════════════════
header('T5  ogon — transportowiec w domu usunięty z falą, eskorta w domu');
{
  const w = boot();
  const sc = scene(w);
  const unitIds = [...(rec(w, sc.r.squadronId)?.unitIds ?? [])];
  run(w, 0.3);
  capture(w, sc.body.id);
  let y = 0;
  for (; y < 60; y += 3) {
    run(w, 3);
    const s = rec(w, sc.r.squadronId);
    const esc = w.vm.getVessel(sc.ids[1]);
    if (s?.homeTail === false && esc?.position?.dockedAt === w.cap.planetId && !esc.mission && !esc.movementOrder) break;
  }
  const s = rec(w, sc.r.squadronId);
  const tr = w.vm.getVessel(sc.ids[0]);
  const esc = w.vm.getVessel(sc.ids[1]);
  const gum = w.K.groundUnitManager;
  console.log(`     po ${y + 3} civY: ogon ${s?.homeTail} · transportowiec ${tr ? 'jest' : 'usunięty'} · fala ${unitIds.length} ` +
    `(żywe ${unitIds.filter(u => gum.getUnit(u)).length}, rozwiązane ${JSON.stringify(s?.dissolvedUnitIds ?? null)}) · ` +
    `eskorta ${esc?.position?.state}@${esc?.position?.dockedAt} m=${esc?.mission?.type ?? null} mo=${esc?.movementOrder?.type ?? null}`);
  assert(s?.stage === 'closed' && s.homeTail === false, 'T5a ogon zgaszony (`homeTail` false), rekord `closed`');
  assert(!tr && unitIds.length > 0 && unitIds.every(u => !gum.getUnit(u))
    && JSON.stringify([...(s?.dissolvedUnitIds ?? [])].sort()) === JSON.stringify([...unitIds].sort()),
    'T5b transportowiec usunięty, niewylądowana fala rozwiązana (`dissolvedUnitIds` = fala)');
  assert(esc && esc.position?.dockedAt === w.cap.planetId && esc.position?.state === 'orbiting' && !esc.mission && !esc.movementOrder,
    'T5c eskorta na orbicie stolicy, bez misji i rozkazu');
  assert(w.cp?.failedAttemptStreak?.(w.emp) === 0, 'T5d KONTROLA: seria nieudanych prób 0');
}

// ═══ T6 — pin źródłowy ════════════════════════════════════════════════════════
header('T6  pin źródłowy — termin właściciela w `_onColonyDestroyed`');
{
  const s = src('../../systems/VesselManager.js');
  const i = s.indexOf('_onColonyDestroyed(planetId, destroyedVesselIds) {');
  const body = i >= 0 ? s.slice(i, s.indexOf('\n  }\n', i)) : '';
  const guard = body.indexOf('isEnemyVessel(vessel)');
  const firstWrite = body.indexOf('vessel.colonyId = homePlanetId');
  assert(i >= 0 && guard > 0 && firstWrite > 0 && guard < firstWrite,
    'T6a `isEnemyVessel(vessel)` w pętli przed pierwszym przepisaniem `colonyId`');
}

console.log(`\n═══ sb4_owned_target_close_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
