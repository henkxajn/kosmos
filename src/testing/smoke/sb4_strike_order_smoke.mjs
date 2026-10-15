// ═══════════════════════════════════════════════════════════════════════════════
// sb4_strike_order_smoke — KEEPER porządku celów zwykłego uderzenia eskortą (AI STRIKES BACK S4, sesja 3 — decyzja SB92).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: zwykłe uderzenie eskortą (`strike_player_target` — wyłącznie, gdy eskadry nie da się złożyć, SB83) wybierało
//   cel po WARTOŚCI układu (`TerritoryService.getSystemDevScore` malejąco, potem koszt, potem id ciała) — stolica gracza
//   bywała pierwsza, a remis wartości rozstrzygał identyfikator. SB92: ten sam porządek co kampania (SB84) —
//   najbliższy układ gracza, w nim placówki → kolonie → stolica gracza na końcu; stolica gracza nie jest celem, dopóki w jej
//   układzie stoi inne ciało gracza (`capitalLast` — reguła kampanii). Zejście do pierwszego celu w zasięgu sufitu
//   (Finding 210) — w porządku SB84.
//
// ⚠ Harness jak `sb4_campaign_smoke`: GameCore + TerritoryService + InfluenceMap świeże, `reseed`, świeży `gameState`, pula
//   i garnizon WYŁĄCZONE; nakładka zasięgu: układ domowy gracza w powłoce granicznej imperium (wzór `sb4_campaign_peace` T3j).
//   Scena: placówka O i kolonia C gracza w układzie stolicy imperium (odległość 0) obsadzone fregatami gracza (2 — potrzeba
//   2), placówka X w układzie drugiego imperium (5,1 LY, wartość ta sama 42, bez obrony — potrzeba 1), placówka H i stolica
//   gracza w układzie domowym (16,4 LY, wartość 12); trzy eskorty imperium w domu.
// ⚠ Moduły nowe importowane z `catch` — na kodzie sprzed S4/3 suita degraduje do czerwieni, nie przerywa.
//
// PINY (fail-first na `4efde97` — S4-8):
//   T1  porządek SB84: O, C (układ stolicy imperium — placówka, potem kolonia), X, H; stolica gracza poza listą, póki stoi H
//   T2  uderzenie (`launchStrike`): cel O w układzie stolicy imperium (`director:strikeLaunched`), choć X tańszy
//   T3  stolica gracza ostatnia: po upadku H — na końcu listy (jedyny cel w układzie domowym)
//   T4  zejście (Finding 210) w porządku SB84: O i C ponad sufit — cel X (następny układ), głowa O
//   T5  KONTROLA (zielona po obu stronach): wartość O i X równa (42) — stary porządek rozstrzygał remis identyfikatorem
//   T6  jedno źródło porządku: kolejność ciał zwykłego uderzenia = kolejność kampanii (`campaignNeeds`)
// ═══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { TerritoryService } from '../../systems/TerritoryService.js';
import { InfluenceMap } from '../../systems/InfluenceMap.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
/** Scena (nagłówek). `frigates` — fregaty gracza w układzie stolicy imperium (2 ⇒ potrzeba 2 na O i C). */
function scene(frigates = 2) {
  reseed('kosmos-default');
  gameState.restore(null);
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  K.orderService = new OrderService();
  K.enemyAttackHandler = new EnemyAttackHandler();
  K.territoryService = new TerritoryService();
  const real = new InfluenceMap();
  K.influenceMap = real;
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  if (K.fleetPoolSystem) K.fleetPoolSystem.enabled = false;
  const off = new DirectorOffensive();
  registerOffensiveBehaviors(off, { allowOverride: true });
  K.directorOffensive = off;
  K.directorRetake = off.retake ?? null;
  K.directorCampaign = off.campaign ?? null;
  const emp = K.empireRegistry.listAll()[0].id;
  const cap = K.directorProduction.capitalOf(emp);
  const capSys = EntityManager.get(cap.planetId).systemId;
  const other = K.empireRegistry.listAll()[1]?.id;
  const otherSys = other ? EntityManager.get(K.directorProduction.capitalOf(other)?.planetId)?.systemId : null;
  K.influenceMap = { __proto__: real, isInBorderZone: (s, e) => (e === emp && s === 'sys_home') || real.isInBorderZone(s, e) };
  const free = (sys) => ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem(t, sys)).filter(b => !K.colonyManager.getColony(b.id));
  const [bO, bC] = free(capSys);
  const [bX] = free(otherSys);
  const [bH] = free('sys_home');
  quiet(() => K.colonyManager.createOutpost(bO.id, {}, 0));
  quiet(() => K.colonyManager.createColony(bC.id, {}, 8, 0));
  quiet(() => K.colonyManager.createOutpost(bX.id, {}, 0));
  quiet(() => K.colonyManager.createOutpost(bH.id, {}, 0));
  for (let i = 0; i < frigates; i++) K.vesselManager.createAndRegister('hull_frigate', bC.id, { modules: ['weapon_laser', 'engine_ion'] });
  for (let i = 0; i < 3; i++) K.vesselManager.createAIVessel({ templateId: 'frigate_missile_escort', empireId: emp, planetId: cap.planetId });
  quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
  const w = { core, K, off, emp, capSys, otherSys, O: bO.id, C: bC.id, X: bX.id, H: bH.id, home: K.homePlanet.id, ev: [] };
  EventBus.on('director:strikeLaunched', (d) => w.ev.push(d));
  return w;
}
const att = (w) => w.off.pickAttainableTarget(w.emp, w.off.strikeReadyVessels(w.emp));
const ids = (a) => (a?.ranked ?? []).map(r => r.body.id);

// ═══ T1 — porządek SB84 ═══════════════════════════════════════════════════════
header('T1  porządek SB84 zwykłego uderzenia');
{
  const w = scene(2);
  const a = att(w);
  console.log(`     ciała ${JSON.stringify({ O: w.O, C: w.C, X: w.X, H: w.H, stolica: w.home })}`);
  console.log(`     ranking ${JSON.stringify((a?.ranked ?? []).map(r => ({ id: r.body.id, sys: r.systemId, v: r.value, n: r.needed })))}`);
  assert(JSON.stringify(ids(a)) === JSON.stringify([w.O, w.C, w.X, w.H]),
    'T1a kolejność: O, C (układ stolicy imperium — placówka, potem kolonia), X (5,1 LY), H (16,4 LY)');
  assert(!ids(a).includes(w.home), 'T1b stolica gracza poza listą, dopóki w jej układzie stoi placówka H');
}

// ═══ T2 — uderzenie ═══════════════════════════════════════════════════════════
header('T2  uderzenie w porządku SB84');
{
  const w = scene(2);
  const r = w.off.launchStrike({ empireId: w.emp, year: 1, ruleId: 'keeper' });
  const ev = w.ev.at(-1);
  console.log(`     wynik ${JSON.stringify(r)} · zdarzenie ${JSON.stringify(ev)}`);
  assert(r?.launched >= 2 && r.targetBodyId === w.O && r.needed === 2 && ev?.targetSystemId === w.capSys,
    'T2a cel O (układ stolicy imperium, potrzeba 2 ≤ sufit), choć X tańszy (potrzeba 1)');
}

// ═══ T3 — stolica gracza ostatnia ═════════════════════════════════════════════
header('T3  stolica gracza ostatnia');
{
  const w = scene(2);
  quiet(() => w.K.colonyManager.removeColony(w.H, 'keeper'));
  const a = att(w);
  console.log(`     ranking po upadku H ${JSON.stringify(ids(a))}`);
  assert(JSON.stringify(ids(a)) === JSON.stringify([w.O, w.C, w.X, w.home]),
    'T3a po upadku H stolica gracza na końcu listy (jedyny cel w układzie domowym)');
}

// ═══ T4 — zejście w porządku SB84 ═════════════════════════════════════════════
header('T4  zejście (Finding 210) w porządku SB84');
{
  const w = scene(6);
  const a = att(w);
  const r = w.off.launchStrike({ empireId: w.emp, year: 1, ruleId: 'keeper' });
  console.log(`     ranking ${JSON.stringify((a?.ranked ?? []).map(r2 => ({ id: r2.body.id, n: r2.needed })))} · wynik ${JSON.stringify(r)}`);
  assert(a?.head?.body?.id === w.O && a?.pick?.body?.id === w.X && r?.targetBodyId === w.X && r.skippedHead?.bodyId === w.O,
    'T4a O i C ponad sufit — cel X (następny układ w porządku SB84), głowa O pominięta (`skippedHead`)');
}

// ═══ T5 — kontrola sceny ══════════════════════════════════════════════════════
header('T5  KONTROLA sceny');
{
  const w = scene(2);
  const a = att(w);
  const by = (id) => (a?.ranked ?? []).find(r => r.body.id === id);
  assert(by(w.O)?.value === 42 && by(w.X)?.value === 42 && by(w.H)?.value === 12 && by(w.X)?.needed === 1 && by(w.O)?.needed === 2,
    'T5a wartość O i X równa (42), H 12; X tańszy (1), O potrzebuje 2 — stary porządek (wartość, koszt, id) wybierał X');
}

// ═══ T6 — jedno źródło porządku ═══════════════════════════════════════════════
header('T6  jedno źródło porządku (kampania i zwykłe uderzenie)');
{
  const w = scene(2);
  const camp = (w.K.directorCampaign?.campaignNeeds?.(w.emp) ?? []).filter(r => !r.target?.wait).map(r => r.bodyId);
  const strike = ids(att(w));
  console.log(`     kampania ${JSON.stringify(camp)} · uderzenie ${JSON.stringify(strike)}`);
  assert(camp.length === 4 && JSON.stringify(camp) === JSON.stringify(strike),
    'T6a kolejność ciał zwykłego uderzenia = kolejność kampanii (`campaignNeeds`, bez czekających)');
}

console.log(`\n═══ sb4_strike_order_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
