// ═══════════════════════════════════════════════════════════════════════════════
// sb4_opportunity_war_smoke — KEEPER wojny z okazji (AI STRIKES BACK S4/2 — decyzje SB81, SB82).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: do S4/2 imperium AI wypowiadało wojnę wyłącznie z napięcia ≥ 80, po ultimatum albo przy przylocie misji ataku;
//   żadna reguła Directora nie wypowiadała wojny. SB81: reguła `opportunity_war` — pokój bez rozejmu i bez paktu
//   o nieagresji, pula floty, napięcie ≥ `warTensionMin` (40), cooldown reguły `aiWarCooldownYears` (5, SB82), eskadra
//   na najbliższy cel kampanii do wzięcia → `declareWar(…, 'opportunity')`.
//
// ⚠ Harness jak `sb4_campaign_smoke` (GameCore + TerritoryService + InfluenceMap świeże przy każdym boocie, `reseed`,
//   świeży `gameState`, pula i garnizon WYŁĄCZONE — flaga puli ustawiana w rejestrze imperium wprost; dom gracza dołożony
//   do powłoki granicznej imperium nakładką). Cele gracza — produkcyjne `createOutpost` / `createColony`.
// ⚠ Moduły nowe importowane z `catch` — na kodzie sprzed S4/2 suita degraduje do czerwieni, nie przerywa.
//
// PINY:
//   T1  katalog: `opportunity_war` (sonda `campaignTargets`, pięć guardów w kolejności, bez rzutu, `delay: 0`, cooldown
//       reguły 1,0, PRZED uderzeniem i kampanią); klucze `warTensionMin` 40 (0–100) i `aiWarCooldownYears` 5 (0–50)
//       z odmowami spoza zakresu; nazwy w rejestrach
//   T2  werdykt — pierwszy niespełniony warunek: `not_at_peace` (wojna, rozejm), `non_aggression_pact`, `no_fleet_pool`,
//       `tension_below_min` (39 — tak, 40 — nie), `cooldown`, `no_squadron` (brak eskorty, pusta fala); komplet — `ok`
//       z celem kampanii
//   T3  akcja: wojna wypowiedziana (`'opportunity'`), agresor = imperium; zdarzenie z napięciem i celem; odmowa z powodem
//       bez wojny
//   T4  silnik reguł: wojna i eskadra kampanii w TYM SAMYM ticku (jedna eskadra, zwykłe uderzenie bez rzutu); kontrole —
//       napięcie poniżej progu, NAP, rozejm: brak wojny
//   T5  cooldown reguły (`aiWarCooldownYears`) na silniku: po pokoju bez rozejmu i NAP — blokada przed upływem klucza,
//       wojna po; klucz czytany w chwili użycia
//   T6  audyt i lokator
// ═══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { TerritoryService } from '../../systems/TerritoryService.js';
import { InfluenceMap } from '../../systems/InfluenceMap.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';
import { DirectorSystem } from '../../systems/director/DirectorSystem.js';
import { DirectorGuards, DirectorActions } from '../../systems/director/DirectorRegistry.js';
import { setTuning, resetTuning } from '../../utils/StrikesBackTuning.js';
import { readFileSync } from 'node:fs';

const RULES = await import('../../data/DirectorRuleData.js').catch(() => null);
const DATA  = await import('../../data/StrikesBackData.js').catch(() => null);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const C = RULES?.DIRECTOR_RULES ?? {};

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
  const real = K.influenceMap;
  K.influenceMap = { __proto__: real, isInBorderZone: (s, e) => (e === emp && s === 'sys_home') || real.isInBorderZone(s, e) };
  const w = { core, K, vm: K.vesselManager, sq: K.strikeSquadronSystem, off, op: off.opportunity ?? null, emp, cap0, capSys, ev: [] };
  for (const n of ['director:opportunityWarDeclared', 'director:opportunityWarRefused', 'director:campaignLaunched', 'director:ruleFired',
                   'diplomacy:warDeclared']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
const at = (w, y) => { w.K.timeSystem.gameTime = y; };
const dip = (w) => w.K.diplomacySystem;
const freeBodies = (w, sys) => ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
  .filter(b => !w.K.colonyManager.getColony(b.id));
function playerOutpost(w, sys) {
  const b = freeBodies(w, sys)[0];
  if (!b) return null;
  quiet(() => w.K.colonyManager.createOutpost(b.id, {}, 0));
  return w.K.colonyManager.getColony(b.id) ? b.id : null;
}
function escorts(w, n) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap0.planetId }).vessel);
}
const setTension = (w, v) => dip(w).relations.setTension('player', w.emp, v, 'keeper_setup');
/** Okazja kompletna: placówka gracza w układzie stolicy imperium, 3 eskorty, pula, napięcie 45. */
function opportunity(w) {
  const target = playerOutpost(w, w.capSys);
  escorts(w, 3);
  w.K.empireRegistry.markFleetPoolMobilized(w.emp, { year: 0, reason: 'keeper_setup' });
  setTension(w, 45);
  return target;
}
const verdict = (w) => w.op?.opportunityVerdict?.(w.emp) ?? null;
function director(ids) {
  const cat = Object.fromEntries(Object.keys(C).filter(id => ids.includes(id)).map(id => [id, C[id]]));
  try { return Object.keys(cat).length === ids.length ? new DirectorSystem({ catalog: cat }) : null; } catch { return null; }
}
function withDirector(fn) {
  const flag = GAME_CONFIG.FEATURES.reactionDirector;
  GAME_CONFIG.FEATURES.reactionDirector = true;
  try { return fn(); } finally { GAME_CONFIG.FEATURES.reactionDirector = flag; }
}

// ═══ T1 — katalog i klucze ════════════════════════════════════════════════════
header('T1  wpis katalogu, klucze, rejestry');
{
  const r = C.opportunity_war;
  assert(r?.trigger?.kind === 'poll' && r.trigger.probe === 'campaignTargets' && r.trigger.gte === 1, 'T1a wyzwalacz: sonda `campaignTargets` ≥ 1');
  assert(JSON.stringify(r?.guard) === JSON.stringify(['empireAtPeaceWithoutPact', 'empireHasFleetPool', 'empireWarTensionReached',
    'opportunityWarCooldownElapsed', 'empireSquadronAffordable']), 'T1b guardy: pokój bez paktu, pula, napięcie, cooldown, eskadra (od najtańszego)');
  assert(r && !r.roll && !r.personalityMod && r.delay === 0 && r.cooldown?.years === 1.0 && r.response?.action === 'declareOpportunityWar',
    'T1c bez rzutu, `delay: 0`, cooldown reguły 1,0, akcja `declareOpportunityWar`');
  const keys = Object.keys(C);
  assert(keys.indexOf('opportunity_war') >= 0 && keys.indexOf('opportunity_war') < keys.indexOf('strike_player_target')
    && keys.indexOf('strike_player_target') < keys.indexOf('campaign_strike'), 'T1d w katalogu PRZED uderzeniem i kampanią');
  const T = DATA?.SB_TUNING ?? {};
  assert(T.warTensionMin?.default === 40 && T.warTensionMin.type === 'number' && T.warTensionMin.min === 0 && T.warTensionMin.max === 100,
    'T1e klucz `warTensionMin`: 40 (0–100)');
  assert(T.aiWarCooldownYears?.default === 5 && T.aiWarCooldownYears.type === 'number' && T.aiWarCooldownYears.min === 0
    && T.aiWarCooldownYears.max === 50, 'T1f klucz `aiWarCooldownYears`: 5 lat gry (0–50)');
  boot();
  const bad = [quiet(() => setTuning('warTensionMin', 101)), quiet(() => setTuning('warTensionMin', -1)),
               quiet(() => setTuning('aiWarCooldownYears', 51)), quiet(() => setTuning('aiWarCooldownYears', 'x'))];
  const good = quiet(() => setTuning('warTensionMin', 55));
  quiet(() => resetTuning());
  assert(bad.every(x => x && x.ok === false) && good?.ok === true, 'T1g odmowy spoza zakresu i złego typu; wartość w zakresie przyjęta');
  assert(['empireAtPeaceWithoutPact', 'empireHasFleetPool', 'empireWarTensionReached', 'opportunityWarCooldownElapsed', 'empireSquadronAffordable']
    .every(n => DirectorGuards.has(n)) && DirectorActions.has('declareOpportunityWar'), 'T1h nazwy zarejestrowane przy uderzeniu (`instance.opportunity`)');
  let built = null;
  try { built = director(['opportunity_war', 'strike_player_target', 'retake_lost_colony', 'campaign_strike']); } catch { built = null; }
  assert(!!built, 'T1i `DirectorSystem` z wojną z okazji, uderzeniem, odbijaniem i kampanią buduje się (walidacja nazw R12)');
}

// ═══ T2 — werdykt ═════════════════════════════════════════════════════════════
header('T2  werdykt: pierwszy niespełniony warunek');
{
  const w = boot();
  const target = opportunity(w);
  at(w, 2);
  const ok = verdict(w);
  console.log(`     komplet: ${JSON.stringify(ok)}`);
  assert(ok?.ok === true && ok.reason === null && ok.target?.bodyId === target && ok.tension === 45 && ok.min === 40,
    'T2a komplet warunków — `ok`, cel = pierwszy cel kampanii');
  setTension(w, 39);
  const t39 = verdict(w)?.reason;
  setTension(w, 40);
  const t40 = verdict(w)?.ok;
  quiet(() => setTuning('warTensionMin', 41));
  const t40k = verdict(w)?.reason;
  quiet(() => resetTuning('warTensionMin'));
  assert(t39 === 'tension_below_min' && t40 === true && t40k === 'tension_below_min', 'T2b napięcie: 39 — odmowa, 40 — tak; klucz czytany w chwili użycia');
  gameState.set(`director.rules.opportunity_war|${w.emp}`, { lastFiredYear: 0 }, 'keeper');
  at(w, 4.99);
  const cd1 = verdict(w)?.reason;
  at(w, 5);
  const cd2 = verdict(w)?.ok;
  gameState.set(`director.rules.opportunity_war|${w.emp}`, null, 'keeper');
  assert(cd1 === 'cooldown' && cd2 === true, 'T2c cooldown reguły: 4,99 roku po odpaleniu — odmowa, 5 — tak');
  quiet(() => setTuning('strikeWaveShare', 0));
  const nw = verdict(w)?.reason;
  quiet(() => resetTuning('strikeWaveShare'));
  assert(nw === 'no_squadron', 'T2d pusta fala desantu — `no_squadron`');
  quiet(() => dip(w).relations.addTreaty('player', w.emp, { id: 'non_aggression' }));
  const nap = verdict(w)?.reason;
  dip(w).relations.removeTreaty?.('player', w.emp, 'non_aggression');
  const napOff = verdict(w)?.ok;
  assert(nap === 'non_aggression_pact' && napOff === true, 'T2e pakt o nieagresji — `non_aggression_pact` (po zdjęciu — tak)');
  quiet(() => dip(w).relations.setStatus('player', w.emp, 'truce', { truceUntilYear: 12 }, 'keeper'));
  const tr = verdict(w)?.reason;
  quiet(() => dip(w).relations.setStatus('player', w.emp, 'peace', {}, 'keeper'));
  assert(tr === 'not_at_peace', 'T2f rozejm — `not_at_peace`');
}
{
  const w = boot();
  playerOutpost(w, w.capSys);
  escorts(w, 3);
  setTension(w, 45);
  at(w, 2);
  assert(verdict(w)?.reason === 'no_fleet_pool', 'T2g imperium bez puli floty — `no_fleet_pool`');
}
{
  const w = boot();
  playerOutpost(w, w.capSys);
  w.K.empireRegistry.markFleetPoolMobilized(w.emp, { year: 0, reason: 'keeper_setup' });
  setTension(w, 45);
  at(w, 2);
  const v = verdict(w);
  assert(v?.reason === 'no_squadron' && v.plan === 'insufficient', 'T2h brak eskorty — `no_squadron` (plan kampanii `insufficient`)');
}

// ═══ T3 — akcja ═══════════════════════════════════════════════════════════════
header('T3  akcja `declareOpportunityWar`');
{
  const w = boot();
  const target = opportunity(w);
  at(w, 2);
  const r = w.op?.declareOpportunityWar?.({ empireId: w.emp, year: 2 });
  const war = w.K.warSystem.getWarWith(w.emp);
  const ev = evs(w, 'director:opportunityWarDeclared')[0];
  console.log(`     ${JSON.stringify(r)} · wojna ${war?.aggressor} → ${war?.defender} (${war?.casusBelli}) · status ${dip(w).getStatus(w.emp)}`);
  assert(r?.declared === 1 && dip(w).getStatus(w.emp) === 'war' && evs(w, 'diplomacy:warDeclared').some(e => e.reason === 'opportunity'),
    'T3a wojna wypowiedziana z powodem `opportunity`');
  assert(war?.active === true && war.aggressor === w.emp && war.defender === 'player', 'T3b rekord wojny: agresor = imperium, obrońca = gracz');
  assert(ev && ev.empireId === w.emp && ev.tension === 45 && ev.min === 40 && ev.target?.bodyId === target, 'T3c `director:opportunityWarDeclared` (napięcie, próg, cel)');
}
{
  const w = boot();
  opportunity(w);
  setTension(w, 10);
  const r = w.op?.declareOpportunityWar?.({ empireId: w.emp, year: 2 });
  assert(r?.declared === 0 && r.reason === 'tension_below_min' && dip(w).getStatus(w.emp) === 'peace'
    && evs(w, 'director:opportunityWarRefused').some(e => e.reason === 'tension_below_min'), 'T3d odmowa z powodem, bez wojny, w audycie');
}

// ═══ T4 — silnik reguł ════════════════════════════════════════════════════════
header('T4  silnik reguł: wojna i eskadra w tym samym ticku');
const ENGINE = ['opportunity_war', 'strike_player_target', 'retake_lost_colony', 'campaign_strike'];
{
  const w = boot();
  const target = opportunity(w);
  const ds = director(ENGINE);
  const out = withDirector(() => {
    at(w, 2);
    ds?.tickEmpire?.(w.emp, w.K.empireRegistry.get(w.emp));
    return { status: dip(w).getStatus(w.emp), sq: w.sq?.listSquadrons?.(w.emp) ?? [], strike: ds?._ruleState?.('strike_player_target', w.emp) ?? {} };
  });
  console.log(`     status ${out.status} · eskadry ${out.sq.map(s => `${s.targetBodyId}/${s.origin}`).join(' ')} · uderzenie: próby ${out.strike.attempts ?? 0}`);
  assert(!!ds && out.status === 'war' && evs(w, 'director:ruleFired').some(e => e.ruleId === 'opportunity_war'), 'T4a reguła odpala: wojna wypowiedziana');
  assert(out.sq.length === 1 && out.sq[0].origin === 'campaign' && out.sq[0].targetBodyId === target, 'T4b w tym samym ticku eskadra kampanii na cel okazji');
  assert(!!ds && out.status === 'war' && !(out.strike.attempts > 0), 'T4c zwykłe uderzenie nie doszło do rzutu (eskadra do wzięcia)');
}
for (const [label, setup] of [
  ['napięcie 39', (w) => setTension(w, 39)],
  ['pakt o nieagresji', (w) => quiet(() => dip(w).relations.addTreaty('player', w.emp, { id: 'non_aggression' }))],
  ['rozejm', (w) => quiet(() => dip(w).relations.setStatus('player', w.emp, 'truce', { truceUntilYear: 12 }, 'keeper'))],
]) {
  const w = boot();
  opportunity(w);
  setup(w);
  const ds = director(ENGINE);
  withDirector(() => { at(w, 2); ds?.tickEmpire?.(w.emp, w.K.empireRegistry.get(w.emp)); });
  assert(!!ds && dip(w).getStatus(w.emp) !== 'war' && (w.sq?.listSquadrons?.(w.emp) ?? []).length === 0
    && !evs(w, 'director:ruleFired').some(e => e.ruleId === 'opportunity_war'), `T4d KONTROLA: ${label} — brak wojny i eskadry`);
}

// ═══ T5 — cooldown reguły na silniku ══════════════════════════════════════════
header('T5  cooldown reguły (`aiWarCooldownYears`) na silniku');
{
  const w = boot();
  opportunity(w);
  escorts(w, 3);
  const ds = director(ENGINE);
  const emp = w.K.empireRegistry.get(w.emp);
  const peace = () => {
    EventBus.emit('diplomacy:peaceSigned', { empireId: w.emp });       // wojna zamknięta, eskadra wraca
    quiet(() => dip(w).relations.setStatus('player', w.emp, 'peace', {}, 'keeper'));   // pokój BEZ rozejmu i NAP
    for (const s of w.sq?.listSquadrons?.(w.emp) ?? []) w.sq._setStage(s.id, 'closed', { closeReason: 'keeper' });
    setTension(w, 45);
  };
  const res = withDirector(() => {
    const out = [];
    at(w, 2); ds?.tickEmpire?.(w.emp, emp); out.push(dip(w).getStatus(w.emp));
    peace();
    at(w, 6.9); ds?.tickEmpire?.(w.emp, emp); out.push(dip(w).getStatus(w.emp));
    at(w, 7.0); ds?.tickEmpire?.(w.emp, emp); out.push(dip(w).getStatus(w.emp));
    peace();
    quiet(() => setTuning('aiWarCooldownYears', 1));
    at(w, 8.0); ds?.tickEmpire?.(w.emp, emp); out.push(dip(w).getStatus(w.emp));
    quiet(() => resetTuning('aiWarCooldownYears'));
    return out;
  });
  console.log(`     status po tikach: 2 → ${res[0]} · pokój, 6,9 → ${res[1]} · 7,0 → ${res[2]} · pokój, klucz 1, 8,0 → ${res[3]}`);
  assert(!!ds && res[0] === 'war', 'T5a pierwsza wojna z okazji (rok 2)');
  assert(res[1] === 'peace' && res[2] === 'war', 'T5b po pokoju bez rozejmu i NAP: 4,9 roku po odpaleniu — blokada, 5 lat — wojna');
  assert(res[3] === 'war', 'T5c klucz czytany w chwili użycia (cooldown 1 rok — wojna rok po poprzedniej)');
  assert(evs(w, 'director:ruleFired').filter(e => e.ruleId === 'opportunity_war').length === 3, 'T5d trzy odpalenia reguły');
}

// ═══ T6 — audyt i lokator ═════════════════════════════════════════════════════
header('T6  audyt i lokator');
{
  const dl = src('../../core/DebugLog.js');
  const tracked = dl.slice(dl.indexOf('TRACKED_EVENTS'), dl.indexOf('class DebugLog'));
  assert(/'director:opportunityWarDeclared'/.test(tracked) && /'director:opportunityWarRefused'/.test(tracked) && /'diplomacy:warDeclared'/.test(tracked),
    'T6a zdarzenia wojny z okazji w `DebugLog.TRACKED_EVENTS` (metoda: wypowiedzenie wojny widoczne)');
  const gs = src('../../scenes/GameScene.js');
  assert(/window\.KOSMOS\.directorOpportunityWar\s*=\s*this\.directorOffensive\.opportunity\s*\?\?\s*null/.test(gs), 'T6b lokator `KOSMOS.directorOpportunityWar` w GameScene');
}

console.log(`\n═══ sb4_opportunity_war_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
