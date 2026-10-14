// ═══════════════════════════════════════════════════════════════════════════════
// sb4_campaign_peace_smoke — KEEPER końca wojny przy wyczerpanej kampanii (AI STRIKES BACK S4/2 — decyzje SB85, SB86).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: depesza pokojowa AI miała JEDEN wyzwalacz — wyczerpanie z bitew ≥ `casusBelli.peaceCost` przy jego wzroście
//   (`WarSystem._maybeAiPeaceOffer`); wojna, w której AI nie ma już czym brać, a bitew nie ma, nie kończyła się. SB85:
//   drugi wyzwalacz — kampania WYCZERPANA (`campaignMaxFailedAttempts` kolejnych prób bez zdobycia celu albo żadna eskadra
//   do wzięcia i nic nie czeka na swój czas) → ta sama depesza status quo, te same bramki, ocena pokoju bez zmian (SB86).
//
// ⚠ Harness jak `sb4_campaign_smoke` (GameCore + TerritoryService + InfluenceMap świeże, `reseed`, świeży `gameState`,
//   pula i garnizon WYŁĄCZONE); BEZ nakładki zasięgu — cele gracza wyłącznie te, które scena tworzy w układzie stolicy
//   imperium. Ocena pokoju AI podmieniana na „TAK” WYŁĄCZNIE tam, gdzie pin dotyczy bramek po niej (wysyłka depeszy);
//   odmowa mierzona prawdziwą oceną (świeża wojna, wyczerpanie 0).
// ⚠ Moduły nowe importowane z `catch` — na kodzie sprzed S4/2 suita degraduje do czerwieni, nie przerywa.
//
// PINY:
//   T1  katalog: `campaign_peace_offer` (sonda `campaignExhausted`, guard wojny, bez rzutu, `delay: 0`, cooldown 1,0,
//       akcja `offerCampaignPeace`, PO kampanii); klucz `campaignMaxFailedAttempts` 3 (1–20); nazwy w rejestrach
//   T2  seria prób: zakończone eskadry bieżącej wojny bez zdobycia celu; zdobycie (księga wojny) przerywa serię; próby
//       trwające i z poprzedniej wojny się nie liczą
//   T3  wyczerpanie: `failed_attempts` (2 — nie, 3 — tak, klucz w chwili użycia), `no_affordable_target` (brak celu,
//       pula za mała na zawsze, pusta fala; stolica czekająca na ciała swojego układu — `capital_last` — nie
//       podtrzymuje kampanii), kampania trwa: `no_war`, `squadron_underway`, `squadron_affordable`, `target_waiting`
//   T4  `WarSystem.requestAiPeaceOffer`: bramki (`no_war`, `ai_refuses` z oceną, `offer_open`, `cooldown`), BEZ progu
//       `peaceCost`; ładunek z `trigger`; KONTROLA — stara ścieżka: próg `peaceCost` dalej obowiązuje, ładunek bez zmian
//   T5  akcja `offerCampaignPeace`: odmowa przy trwającej kampanii i przy odmowie oceny pokoju; wysyłka przy wyczerpaniu
//   T6  silnik reguł: depesza raz (cooldown reguły, depesza otwarta); KONTROLA — eskadra do wzięcia: wysyłka eskadry,
//       bez depeszy
//   T7  audyt
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
import { DirectorProbes, DirectorActions } from '../../systems/director/DirectorRegistry.js';
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
  const w = { core, K, vm: K.vesselManager, sq: K.strikeSquadronSystem, ws: K.warSystem, cp: off.campaign ?? null, emp, cap0, capSys, ev: [] };
  for (const n of ['war:aiPeaceOffer', 'director:campaignPeaceOffered', 'director:campaignPeaceRefused', 'director:campaignLaunched',
                   'director:ruleFired']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
const at = (w, y) => { w.K.timeSystem.gameTime = y; };
const dip = (w) => w.K.diplomacySystem;
const war = (w) => quiet(() => dip(w).declareWar(w.emp, 'keeper_setup'));
const freeBodies = (w, sys) => ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
  .filter(b => !w.K.colonyManager.getColony(b.id));
function playerOutpost(w) {
  const b = freeBodies(w, w.capSys)[0];
  if (!b) return null;
  quiet(() => w.K.colonyManager.createOutpost(b.id, {}, 0));
  return w.K.colonyManager.getColony(b.id) ? b.id : null;
}
function escorts(w, n) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap0.planetId }).vessel);
}
function playerFrigates(w, colonyId, n) {
  return Array.from({ length: n }, () => w.vm.createAndRegister('hull_frigate', colonyId, { modules: ['weapon_laser', 'engine_ion'] }));
}
/** Eskadra na cel (prawdziwe `launchSquadron`), od razu zamknięta bez zdobycia (`outcome`). Zwraca id. */
function failedAttempt(w, target, year, outcome = 'wave_destroyed') {
  at(w, year);
  const e = escorts(w, 1);
  const r = w.sq?.launchSquadron?.(w.emp, target, e.map(v => v.id), { origin: 'campaign' });
  if (r?.ok) w.sq._setStage(r.squadronId, 'closed', { outcome, closeReason: 'keeper' });
  return r?.squadronId ?? null;
}
const exh = (w) => w.cp?.campaignExhaustion?.(w.emp) ?? null;
const peaceYes = (w) => { dip(w).evaluatePeace = () => ({ decision: true, score: 99, threshold: 10 }); };
const peaceReal = (w) => { delete dip(w).evaluatePeace; };
function director(ids) {
  const cat = Object.fromEntries(Object.keys(C).filter(id => ids.includes(id)).map(id => [id, C[id]]));
  try { return Object.keys(cat).length === ids.length ? new DirectorSystem({ catalog: cat }) : null; } catch { return null; }
}
function withDirector(fn) {
  const flag = GAME_CONFIG.FEATURES.reactionDirector;
  GAME_CONFIG.FEATURES.reactionDirector = true;
  try { return fn(); } finally { GAME_CONFIG.FEATURES.reactionDirector = flag; }
}

// ═══ T1 — katalog i klucz ═════════════════════════════════════════════════════
header('T1  wpis katalogu, klucz, rejestry');
{
  const r = C.campaign_peace_offer;
  assert(r?.trigger?.kind === 'poll' && r.trigger.probe === 'campaignExhausted' && r.trigger.gte === 1, 'T1a wyzwalacz: sonda `campaignExhausted` ≥ 1');
  assert(JSON.stringify(r?.guard) === JSON.stringify(['empireAtWarWithPlayer']), 'T1b guard: wojna z graczem');
  assert(r && !r.roll && !r.personalityMod && r.delay === 0 && r.cooldown?.years === 1.0 && r.response?.action === 'offerCampaignPeace',
    'T1c bez rzutu, `delay: 0`, cooldown reguły 1,0, akcja `offerCampaignPeace`');
  const keys = Object.keys(C);
  assert(keys.indexOf('campaign_strike') >= 0 && keys.indexOf('campaign_strike') < keys.indexOf('campaign_peace_offer'), 'T1d w katalogu PO kampanii');
  const k = DATA?.SB_TUNING?.campaignMaxFailedAttempts;
  assert(k?.default === 3 && k.type === 'int' && k.min === 1 && k.max === 20, 'T1e klucz `campaignMaxFailedAttempts`: 3 (1–20, całkowity)');
  boot();
  const bad = [quiet(() => setTuning('campaignMaxFailedAttempts', 0)), quiet(() => setTuning('campaignMaxFailedAttempts', 2.5))];
  quiet(() => resetTuning());
  assert(!!k && bad.every(x => x?.ok === false), 'T1f odmowy: 0 (poza zakresem), 2,5 (nie całkowita)');
  assert(DirectorProbes.has('campaignExhausted') && DirectorActions.has('offerCampaignPeace'), 'T1g nazwy zarejestrowane przy uderzeniu');
  assert(!!director(['strike_player_target', 'retake_lost_colony', 'campaign_strike', 'campaign_peace_offer']),
    'T1h `DirectorSystem` z uderzeniem, odbijaniem, kampanią i końcem wojny buduje się (walidacja nazw R12)');
}

// ═══ T2 — seria prób ══════════════════════════════════════════════════════════
header('T2  seria prób bez zdobycia celu');
{
  const w = boot();
  const target = playerOutpost(w);
  at(w, 1);
  war(w);
  const s0 = w.cp?.failedAttemptStreak?.(w.emp);
  failedAttempt(w, target, 1.5);
  const s1 = w.cp?.failedAttemptStreak?.(w.emp);
  failedAttempt(w, target, 2.0, 'not_landed');
  const s2 = w.cp?.failedAttemptStreak?.(w.emp);
  at(w, 2.4);
  const open = w.sq?.launchSquadron?.(w.emp, target, escorts(w, 1).map(v => v.id), { origin: 'campaign' });
  const s2open = w.cp?.failedAttemptStreak?.(w.emp);
  console.log(`     seria: przed ${s0} · po 1. ${s1} · po 2. ${s2} · z trwającą ${s2open}`);
  assert(s0 === 0 && s1 === 1 && s2 === 2, 'T2a każda zakończona próba bez zdobycia wydłuża serię');
  assert(open?.ok === true && s2open === 2, 'T2b próba trwająca (eskadra w drodze) się nie liczy');
  w.sq._setStage(open.squadronId, 'landed', { landedYear: 2.6 });
  at(w, 2.8);
  quiet(() => w.K.colonyManager.transferColony(target, w.emp, 'invasion'));        // fala zdobywa cel
  w.sq._setStage(open.squadronId, 'returning', { outcome: 'captured' });
  const ledger = (w.ws.getCaptures(w.ws.getWarWith(w.emp)?.id) ?? []).filter(c => c.bodyId === target && c.toEmpireId === w.emp);
  const s3 = w.cp?.failedAttemptStreak?.(w.emp);
  assert(ledger.length === 1 && s3 === 0, 'T2c zdobycie celu (wpis w księdze wojny) przerywa serię');
}
{
  const w = boot();
  const target = playerOutpost(w);
  at(w, 1);
  war(w);
  failedAttempt(w, target, 1.5);
  failedAttempt(w, target, 1.6);
  EventBus.emit('diplomacy:peaceSigned', { empireId: w.emp });
  quiet(() => dip(w).relations.setStatus('player', w.emp, 'peace', {}, 'keeper'));
  at(w, 3);
  war(w);
  const now = w.cp?.failedAttemptStreak?.(w.emp);
  failedAttempt(w, target, 3.5);
  assert(w.ws.getWarWith(w.emp)?.startYear === 3 && now === 0 && w.cp?.failedAttemptStreak?.(w.emp) === 1,
    'T2d próby z POPRZEDNIEJ wojny się nie liczą');
}

// ═══ T3 — wyczerpanie ═════════════════════════════════════════════════════════
header('T3  wyczerpanie kampanii');
{
  const w = boot();
  const target = playerOutpost(w);
  escorts(w, 3);
  at(w, 1);
  const nw = exh(w);
  war(w);
  const aff = exh(w);
  failedAttempt(w, target, 1.2);
  failedAttempt(w, target, 1.4);
  const two = exh(w);
  quiet(() => setTuning('campaignMaxFailedAttempts', 2));
  const twoKey = exh(w);
  quiet(() => resetTuning('campaignMaxFailedAttempts'));
  failedAttempt(w, target, 1.6);
  const three = exh(w);
  console.log(`     ${JSON.stringify(nw)} · ${JSON.stringify(aff)} · 2: ${JSON.stringify(two)} · klucz 2: ${twoKey?.reason} · 3: ${JSON.stringify(three)}`);
  assert(nw?.exhausted === false && nw.reason === 'no_war', 'T3a bez wojny — `no_war`');
  assert(aff?.exhausted === false && aff.reason === 'squadron_affordable', 'T3b eskadra do wzięcia — kampania trwa (`squadron_affordable`)');
  assert(two?.exhausted === false && two.reason === 'target_waiting' && two.failedStreak === 2, 'T3c dwie nieudane próby — nie (cel w cooldownie czeka)');
  assert(twoKey?.exhausted === true && twoKey.reason === 'failed_attempts', 'T3d klucz czytany w chwili użycia (2 — tak)');
  assert(three?.exhausted === true && three.reason === 'failed_attempts' && three.failedStreak === 3 && three.max === 3, 'T3e trzy kolejne nieudane próby — wyczerpana');
  at(w, 1.7);
  w.sq?.launchSquadron?.(w.emp, target, escorts(w, 1).map(v => v.id), { origin: 'campaign' });
  assert(exh(w)?.reason === 'squadron_underway' && exh(w)?.exhausted === false, 'T3f eskadra w drodze — kampania trwa');
}
{
  const w = boot();
  escorts(w, 3);
  at(w, 1);
  war(w);
  const e = exh(w);
  assert(e?.exhausted === true && e.reason === 'no_affordable_target' && e.plan === 'none'
    && w.K.directorOffensive.reachableTargets(w.emp).length === 0, 'T3g żadnego ciała gracza w zasięgu — wyczerpana (`no_affordable_target`)');
}
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 2);                    // potrzeba 2
  escorts(w, 1);                                   // pula 1 — i nic więcej nie przybędzie (pula wyłączona)
  at(w, 1);
  war(w);
  const e = exh(w);
  assert(e?.exhausted === true && e.reason === 'no_affordable_target' && e.plan === 'insufficient', 'T3h pula za mała na każdy cel — wyczerpana');
  quiet(() => setTuning('strikeWaveShare', 0));
  escorts(w, 3);
  const ew = exh(w);
  quiet(() => resetTuning('strikeWaveShare'));
  assert(ew?.exhausted === true && ew.reason === 'no_affordable_target', 'T3i pusta fala desantu — wyczerpana');
}

{
  const w = boot();
  const real = w.K.influenceMap;
  w.K.influenceMap = { __proto__: real, isInBorderZone: (s, e) => (e === w.emp && s === 'sys_home') || real.isInBorderZone(s, e) };
  const b = freeBodies(w, 'sys_home')[0];
  quiet(() => w.K.colonyManager.createOutpost(b.id, {}, 0));
  playerFrigates(w, w.K.homePlanet.id, 2);         // obrona układu domowego: potrzeba 2
  escorts(w, 1);
  at(w, 1);
  war(w);
  const H = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === w.K.homePlanet.id);
  const e = exh(w);
  assert(H?.wait === 'capital_last' && e?.exhausted === true && e.reason === 'no_affordable_target' && e.plan === 'insufficient',
    'T3j stolica czeka na placówkę swojego układu, której nie da się wziąć — wyczerpana (`capital_last` nie podtrzymuje)');
}

// ═══ T4 — bramki depeszy w WarSystem ══════════════════════════════════════════
header('T4  `WarSystem.requestAiPeaceOffer`: bramki, bez progu `peaceCost`; stara ścieżka bez zmian');
{
  const w = boot();
  at(w, 1);
  const none = w.ws.requestAiPeaceOffer?.(w.emp, 'campaign_exhausted');
  war(w);
  const warRec = w.ws.getWarWith(w.emp);
  const refused = w.ws.requestAiPeaceOffer?.(w.emp, 'campaign_exhausted');
  console.log(`     bez wojny ${JSON.stringify(none)} · ocena ${JSON.stringify(refused)} · wyczerpanie imperium ${warRec?.exhaustion?.[w.emp]}`);
  assert(none?.ok === false && none.reason === 'no_war', 'T4a bez wojny — `no_war`');
  assert(refused?.ok === false && refused.reason === 'ai_refuses' && Number.isFinite(refused.score) && Number.isFinite(refused.threshold)
    && refused.score < refused.threshold, 'T4b prawdziwa ocena pokoju (świeża wojna) — `ai_refuses` z oceną i progiem');
  peaceYes(w);
  const ok = w.ws.requestAiPeaceOffer?.(w.emp, 'campaign_exhausted');
  const ev = evs(w, 'war:aiPeaceOffer').at(-1);
  const again = w.ws.requestAiPeaceOffer?.(w.emp, 'campaign_exhausted');
  assert(ok?.ok === true && ok.warId === warRec?.id && (warRec?.exhaustion?.[w.emp] ?? 0) === 0, 'T4c ocena TAK przy wyczerpaniu 0 — depesza (bez progu `peaceCost`)');
  assert(ev && ev.empireId === w.emp && ev.warId === warRec?.id && ev.trigger === 'campaign_exhausted', 'T4d ładunek `war:aiPeaceOffer` z `trigger`');
  assert(again?.ok === false && again.reason === 'offer_open', 'T4e depesza otwarta — `offer_open`');
  EventBus.emit('war:aiPeaceOfferResolved', { empireId: w.emp, warId: warRec?.id, choice: 'reject' });
  dip(w).noteAiPeaceOfferAnswered(w.emp);
  const cd = w.ws.requestAiPeaceOffer?.(w.emp, 'campaign_exhausted');
  assert(cd?.ok === false && cd.reason === 'cooldown', 'T4f odpowiedziana depesza — `cooldown`');
  peaceReal(w);
}
{
  const w = boot();
  at(w, 1);
  war(w);
  peaceYes(w);
  const warRec = w.ws.getWarWith(w.emp);
  const n0 = evs(w, 'war:aiPeaceOffer').length;
  w.ws.changeExhaustion(warRec.id, w.emp, 10, 'keeper');
  const n1 = evs(w, 'war:aiPeaceOffer').length;
  w.ws.changeExhaustion(warRec.id, w.emp, 30, 'keeper');
  const ev = evs(w, 'war:aiPeaceOffer').at(-1);
  peaceReal(w);
  assert(n1 === n0, 'T4g KONTROLA: stara ścieżka — wyczerpanie poniżej `peaceCost` przy ocenie TAK: brak depeszy');
  assert(ev && JSON.stringify(Object.keys(ev).sort()) === JSON.stringify(['empireId', 'warId']), 'T4h KONTROLA: stara ścieżka — ładunek bez zmian (`empireId`, `warId`)');
  const body = src('../../systems/WarSystem.js');
  const fn = body.slice(body.indexOf('requestAiPeaceOffer(empireId'), body.indexOf('_sendAiPeaceOffer(warId, empireId, dipl, extra'));
  assert(fn.length > 0 && !/peaceCost/.test(fn) && /_sendAiPeaceOffer\(war\.id, empireId, dipl, \{ trigger \}\)/.test(fn),
    'T4i źródło: drugi wyzwalacz bez progu `peaceCost`, wspólny ogon bramek');
}

// ═══ T5 — akcja ═══════════════════════════════════════════════════════════════
header('T5  akcja `offerCampaignPeace`');
{
  const w = boot();
  playerOutpost(w);
  escorts(w, 3);
  at(w, 1);
  war(w);
  const r1 = w.cp?.offerCampaignPeace?.({ empireId: w.emp, year: 1 });
  assert(r1?.offered === 0 && r1.reason === 'squadron_affordable' && evs(w, 'war:aiPeaceOffer').length === 0
    && evs(w, 'director:campaignPeaceRefused').some(e => e.reason === 'squadron_affordable'), 'T5a kampania trwa — odmowa z powodem, bez depeszy');
}
{
  const w = boot();
  at(w, 1);
  war(w);
  const r2 = w.cp?.offerCampaignPeace?.({ empireId: w.emp, year: 1 });
  const rv = evs(w, 'director:campaignPeaceRefused').at(-1);
  console.log(`     wyczerpana, prawdziwa ocena: ${JSON.stringify(r2)}`);
  assert(r2?.offered === 0 && r2.reason === 'ai_refuses' && rv?.exhaustion === 'no_affordable_target' && Number.isFinite(rv?.score),
    'T5b wyczerpana, ale ocena pokoju AI = NIE — odmowa `ai_refuses` z oceną (SB86: ocena bez zmian)');
  peaceYes(w);
  const r3 = w.cp?.offerCampaignPeace?.({ empireId: w.emp, year: 1 });
  const off = evs(w, 'director:campaignPeaceOffered').at(-1);
  peaceReal(w);
  assert(r3?.offered === 1 && evs(w, 'war:aiPeaceOffer').some(e => e.trigger === 'campaign_exhausted')
    && off?.exhaustion === 'no_affordable_target' && off.failedStreak === 0, 'T5c wyczerpana, ocena TAK — depesza status quo, `director:campaignPeaceOffered`');
}

// ═══ T6 — silnik reguł ════════════════════════════════════════════════════════
header('T6  silnik reguł');
const ENGINE = ['strike_player_target', 'retake_lost_colony', 'campaign_strike', 'campaign_peace_offer'];
{
  const w = boot();
  escorts(w, 3);
  at(w, 1);
  war(w);
  peaceYes(w);
  const ds = director(ENGINE);
  const n = withDirector(() => {
    const emp = w.K.empireRegistry.get(w.emp);
    at(w, 2.0); ds?.tickEmpire?.(w.emp, emp);
    const a = evs(w, 'war:aiPeaceOffer').length;
    at(w, 2.5); ds?.tickEmpire?.(w.emp, emp);
    EventBus.emit('war:aiPeaceOfferResolved', { empireId: w.emp, warId: w.ws.getWarWith(w.emp)?.id, choice: 'dismissed' });
    at(w, 3.1); ds?.tickEmpire?.(w.emp, emp);
    return [a, evs(w, 'war:aiPeaceOffer').length];
  });
  peaceReal(w);
  console.log(`     depesze: po 2,0 → ${n[0]} · po 2,5 i 3,1 → ${n[1]}`);
  assert(!!ds && n[0] === 1, 'T6a reguła odpala: depesza przy wyczerpanej kampanii');
  assert(n[1] === 2, 'T6b w roku — bez drugiej (cooldown reguły); po roku i zamknięciu depeszy — znowu');
}
{
  const w = boot();
  playerOutpost(w);
  escorts(w, 3);
  at(w, 1);
  war(w);
  peaceYes(w);
  const ds = director(ENGINE);
  withDirector(() => { at(w, 2.0); ds?.tickEmpire?.(w.emp, w.K.empireRegistry.get(w.emp)); });
  peaceReal(w);
  assert(!!ds && (w.sq?.listSquadrons?.(w.emp) ?? []).length === 1 && evs(w, 'war:aiPeaceOffer').length === 0,
    'T6c KONTROLA: eskadra do wzięcia — wysłana, depeszy brak');
}

// ═══ T7 — audyt ═══════════════════════════════════════════════════════════════
header('T7  audyt');
{
  const dl = src('../../core/DebugLog.js');
  const tracked = dl.slice(dl.indexOf('TRACKED_EVENTS'), dl.indexOf('class DebugLog'));
  assert(/'director:campaignPeaceOffered'/.test(tracked) && /'director:campaignPeaceRefused'/.test(tracked) && /'war:peaceSigned'/.test(tracked),
    'T7 zdarzenia końca wojny w `DebugLog.TRACKED_EVENTS` (metoda: pokój widoczny)');
}

console.log(`\n═══ sb4_campaign_peace_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
