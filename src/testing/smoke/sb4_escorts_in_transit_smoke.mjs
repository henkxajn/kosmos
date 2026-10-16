// ═══════════════════════════════════════════════════════════════════════════════
// sb4_escorts_in_transit_smoke — KEEPER decyzji SB96 (AI STRIKES BACK S4, sesja 4; zmienia SB89 (ii)).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB89, SB96).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: warunek (ii) depeszy pokojowej przy wyczerpanej kampanii (SB89) liczył wyłącznie kadłuby z bakiem warp —
//   do celu w układzie stolicy eskadra bierze też kadłuby BEZ baku, więc eskorta bez baku w drodze (rozkaz ruchu, misja)
//   nie wstrzymywała depeszy, choć po powrocie złożyłaby eskadrę. SB96: SB89 (ii) liczy KAŻDĄ eskortę w drodze — depesza
//   czeka, gdy eskorty dostępne teraz razem z eskortami w drodze (z bakiem albo bez) pokryłyby potrzebną eskadrę.
//   „W drodze” = uzbrojony kadłub imperium w służbie (nie strażnik, nie wrak) z aktywnym rozkazem ruchu, misją albo
//   złożonym rozkazem. Dawna gałąź SB89 (ii) (kadłuby z bakiem warp w puli liczone wszystkie) zostaje.
//
// ⚠ Harness: wzór `sb4_peace_checks_smoke` — prawdziwy `GameCore`, MOS, OrderService, EAH, `DirectorOffensive`
//   z odbijaniem i kampanią; pula i garnizon WYŁĄCZONE (R-B2b); kontrole roczne — `offerCampaignPeace` przy roku 1,0 i 2,0
//   (bez ticków czasu, więc kadłub w drodze zostaje w drodze). Eskorta w drodze — PRAWDZIWY rozkaz MOS (`moveToPoint`
//   w układzie stolicy). Cel kampanii — placówka gracza w układzie stolicy imperium z 2 fregatami gracza.
//
// PINY (fail-first na kodzie S4-14):
//   T1  SB96: dostępny 1 kadłub bez baku + 1 kadłub bez baku w drodze, potrzeba 2 — bez depeszy (`escorts_in_transit`,
//       w drodze 1, dostępne 1, z bakiem 0)
//   T2  KONTROLA (zielona po obu stronach): drugi kadłub bez baku poza układem BEZ rozkazu — nie „w drodze”: depesza
//   T3  KONTROLA (zielona po obu stronach): za mało nawet z eskortą w drodze (potrzeba 3: 1 + 1) — depesza
//   T4  KONTROLA (zielona po obu stronach): dawna gałąź SB89 (ii) — 2 kadłuby z bakiem poza układem (bez rozkazu) pokryłyby
//       eskadrę — bez depeszy
//   T5  odczyt bramki: `peaceStatus().transit.inTransit` (liczba eskort w drodze)
//   T6  piny źródłowe: predykat „w drodze” bez warunku baku; warunek blokady z `available + inTransit`
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
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
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
  const cap0 = K.directorProduction.capitalOf(emp);
  const capSys = EntityManager.get(cap0.planetId)?.systemId;
  const w = { core, K, vm: K.vesselManager, ws: K.warSystem, cp: off.campaign ?? null, emp, cap0, capSys, ev: [] };
  for (const n of ['war:aiPeaceOffer', 'director:campaignPeaceOffered', 'director:campaignPeaceRefused']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
const at = (w, y) => { w.K.timeSystem.gameTime = y; };
const war = (w) => quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
const offer = (w, year) => { at(w, year); return w.cp?.offerCampaignPeace?.({ empireId: w.emp, year }) ?? null; };
const freeBodies = (w, sys) => ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
  .filter(b => !w.K.colonyManager.getColony(b.id));
function playerOutpost(w) {
  const b = freeBodies(w, w.capSys)[0];
  if (!b) return null;
  quiet(() => w.K.colonyManager.createOutpost(b.id, {}, 0));
  return w.K.colonyManager.getColony(b.id) ? b.id : null;
}
const hulls = (w, templateId, n) => Array.from({ length: n },
  () => w.vm.createAIVessel({ templateId, empireId: w.emp, planetId: w.cap0.planetId }).vessel);
function playerFrigates(w, colonyId, n) {
  return Array.from({ length: n }, () => w.vm.createAndRegister('hull_frigate', colonyId, { modules: ['weapon_laser', 'engine_ion'] }));
}
/** Kadłub W DRODZE: prawdziwy rozkaz MOS `moveToPoint` na inne ciało układu stolicy (bez ticków czasu zostaje w drodze). */
function inTransit(w, v, exceptIds) {
  const body = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem(t, w.capSys))
    .filter(b => !exceptIds.includes(b.id)).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  return w.K.movementOrderSystem.issueOrder(v.id, {
    type: 'moveToPoint', targetBodyId: body.id, targetPoint: { x: body.x ?? 0, y: body.y ?? 0 },
    issuedBy: 'keeper_setup', bypassFuelCheck: true,
  });
}
/** Kadłub POZA układem stolicy BEZ rozkazu (wzór `away` z `sb4_peace_checks_smoke` — nie „w drodze” w sensie SB96). */
function away(w, v) {
  const other = (w.K.galaxyData?.systems ?? []).map(s => s.id).find(id => id !== w.capSys && id !== 'sys_home') ?? 'sys_far';
  v.systemId = other;
  v.position.state = 'orbiting';
  v.position.dockedAt = null;
}
const NOWARP = 'frigate_system_defender';
const WARP = 'frigate_missile_escort';

// ═══ T1 — SB96: eskorta bez baku w drodze ═════════════════════════════════════
header('T1  SB96 — eskorta bez baku warp w drodze wstrzymuje depeszę');
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 2);                     // potrzeba 2
  const [home1, moving] = hulls(w, NOWARP, 2);
  const ord = inTransit(w, moving, [target, w.cap0.planetId]);
  at(w, 1);
  war(w);
  const ex = w.cp?.campaignExhaustion?.(w.emp);
  offer(w, 1.0);
  const r = offer(w, 2.0);
  const rv = evs(w, 'director:campaignPeaceRefused').at(-1);
  console.log(`     bak warp: ${home1.warpFuel?.max ?? 0} / ${moving.warpFuel?.max ?? 0} · rozkaz ${JSON.stringify(ord)} · w drodze: ${moving.position.state} ${moving.movementOrder?.type ?? '-'}`);
  console.log(`     wyczerpanie ${JSON.stringify(ex)} · 2,0 ${JSON.stringify(r)}`);
  console.log(`     odmowa ${JSON.stringify({ reason: rv?.reason, inTransit: rv?.inTransit, available: rv?.available, needed: rv?.needed, warpHulls: rv?.warpHulls })}`);
  assert(!(home1.warpFuel?.max > 0) && !(moving.warpFuel?.max > 0) && ord?.ok === true && !!moving.movementOrder
    && ex?.exhausted === true && ex.plan === 'insufficient',
    'T1-ctl scena: oba kadłuby BEZ baku warp, jeden pod prawdziwym rozkazem ruchu; kampania wyczerpana — plan czeka na eskortę');
  assert(r?.offered === 0 && r.reason === 'escorts_in_transit' && evs(w, 'war:aiPeaceOffer').length === 0,
    'T1a druga kontrola z wyczerpaniem — bez depeszy: `escorts_in_transit` (SB96)');
  assert(rv?.inTransit === 1 && rv.available === 1 && rv.needed === 2 && rv.warpHulls === 0,
    'T1b odmowa niesie liczby: w drodze 1, dostępne 1, potrzeba 2, z bakiem warp 0');
}

// ═══ T2 — KONTROLA: kadłub poza układem bez rozkazu ═══════════════════════════
header('T2  KONTROLA: kadłub bez baku poza układem BEZ rozkazu — nie „w drodze”');
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 2);
  const [, idleAway] = hulls(w, NOWARP, 2);
  away(w, idleAway);
  at(w, 1);
  war(w);
  offer(w, 1.0);
  const r = offer(w, 2.0);
  assert(r?.offered === 1 && !idleAway.movementOrder && !idleAway.mission, 'T2a KONTROLA: dostępny 1 + 0 w drodze < 2 — depesza');
}

// ═══ T3 — KONTROLA: za mało nawet z eskortą w drodze ══════════════════════════
header('T3  KONTROLA: za mało nawet z eskortą w drodze');
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 3);                     // potrzeba 3
  const [, moving] = hulls(w, NOWARP, 2);
  inTransit(w, moving, [target, w.cap0.planetId]);
  at(w, 1);
  war(w);
  const need = w.cp?.escortsInTransit?.(w.emp)?.needed ?? null;
  offer(w, 1.0);
  const r = offer(w, 2.0);
  console.log(`     potrzeba ${need} · 2,0 ${JSON.stringify(r)}`);
  assert(need === 3 && r?.offered === 1, 'T3a KONTROLA: potrzeba 3, dostępny 1 + 1 w drodze — depesza');
}

// ═══ T4 — KONTROLA: dawna gałąź SB89 (ii) ═════════════════════════════════════
header('T4  KONTROLA: dawna gałąź SB89 (ii) — kadłuby z bakiem warp w puli liczone wszystkie');
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 2);
  hulls(w, WARP, 2).forEach(v => away(w, v));       // obie z bakiem, poza układem, BEZ rozkazu
  at(w, 1);
  war(w);
  offer(w, 1.0);
  const r = offer(w, 2.0);
  const rv = evs(w, 'director:campaignPeaceRefused').at(-1);
  assert(r?.offered === 0 && r.reason === 'escorts_in_transit' && rv?.warpHulls === 2 && rv.available === 0,
    'T4a KONTROLA: 2 kadłuby z bakiem poza układem pokryłyby eskadrę — bez depeszy (gałąź SB89 (ii) bez zmian)');
}

// ═══ T5 — odczyt bramki ═══════════════════════════════════════════════════════
header('T5  odczyt `peaceStatus().transit`');
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 2);
  const [, moving] = hulls(w, NOWARP, 2);
  inTransit(w, moving, [target, w.cap0.planetId]);
  at(w, 1);
  war(w);
  const st = w.cp?.peaceStatus?.(w.emp);
  console.log(`     transit ${JSON.stringify(st?.transit)}`);
  assert(st?.transit?.inTransit === 1 && st.transit.blocked === true, 'T5a `peaceStatus().transit`: w drodze 1, blokada `true`');
}

// ═══ T6 — piny źródłowe ═══════════════════════════════════════════════════════
header('T6  piny źródłowe');
{
  const s = strip(readFileSync(new URL('../../systems/director/DirectorCampaign.js', import.meta.url), 'utf8'));
  const fn = s.slice(s.indexOf('_escortsInTransit(empireId) {'), s.indexOf('_waitingSquadronPlan(empireId) {'));
  assert(fn.length > 0 && /movementOrder \|\| v\.mission \|\| v\.pendingOrder/.test(fn) && !/warpFuel/.test(fn),
    'T6a predykat „w drodze” (`_escortsInTransit`): rozkaz / misja / rozkaz złożony, bez warunku baku warp');
  const et = s.slice(s.indexOf('escortsInTransit(empireId) {'), s.indexOf('peaceStatus(empireId) {'));
  assert(/available \+ inTransit >= needed/.test(et) && /warpHulls >= needed/.test(et),
    'T6b warunek blokady: SB89 (ii) (`warpHulls >= needed`) albo SB96 (`available + inTransit >= needed`)');
}

console.log(`\n═══ sb4_escorts_in_transit_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
