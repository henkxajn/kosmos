// ═══════════════════════════════════════════════════════════════════════════════
// sb4_peace_checks_smoke — KEEPER końca wojny bez oceny pokoju AI (AI STRIKES BACK S4, sesja 3 — decyzja SB89, rewizja SB86).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: przy wyczerpanej kampanii (SB85) depesza pokojowa AI przechodziła przez ocenę pokoju AI (SB86) — zmierzone M7:
//   imperium bez czym brać odrzucało status quo (≈ −47 przy progu −6), więc wojny się nie kończyły. SB89: depesza STATUS QUO
//   idzie BEZ oceny pokoju AI, ale tylko gdy (i) wyczerpanie trwa przez `campaignPeaceAfterChecks` (2) KOLEJNE kontrole roczne
//   (reguła `campaign_peace_offer`, cooldown reguły 1,0 roku) i (ii) brak eskadry do wzięcia nie wynika z eskort w drodze
//   (kadłuby z bakiem warp w puli imperium liczone wszystkie, nie tylko dostępne teraz). Gracz przyjmuje albo odrzuca jak
//   dziś — przyjęcie tej depeszy jest WIĄŻĄCE (ocena AI nie unieważnia go), odrzucenie daje AI cooldown depeszy (1 rok).
//
// ⚠ Harness jak `sb4_campaign_peace_smoke` (GameCore + TerritoryService + InfluenceMap świeże, `reseed`, świeży `gameState`,
//   pula i garnizon WYŁĄCZONE); BEZ nakładki zasięgu — cele gracza wyłącznie te, które scena tworzy w układzie stolicy
//   imperium. Ocena pokoju AI — PRAWDZIWA (świeża wojna, wyczerpanie 0 ⇒ NIE), poza kontrolą starej ścieżki.
// ⚠ Moduły nowe importowane z `catch` — na kodzie sprzed S4/3 suita degraduje do czerwieni, nie przerywa.
//
// PINY (fail-first na `3b4908a` — S4-7):
//   T1  klucz `campaignPeaceAfterChecks` (2, całkowity 1–10; odmowy 0, 11, 2,5); KONTROLA: wpis katalogu bez zmian
//   T2  (i): pierwsza kontrola z wyczerpaną kampanią — bez depeszy (`exhaustion_not_held`, 1 z 2); ta sama kontrola w tym
//       samym roku serii nie zmienia; kolejna kontrola po roku — depesza STATUS QUO bez oceny pokoju AI (ocena = NIE),
//       `binding`; klucz czytany w chwili użycia (1 — od razu)
//   T3  seria od nowa: kontrola po 1,5 roku; eskadra imperium wysłana między kontrolami
//   T4  (ii): obie eskorty z bakiem warp poza układem stolicy (w drodze) pokryłyby eskadrę — bez depeszy
//       (`escorts_in_transit`); jedna eskorta na 2 potrzebne — depesza; KONTROLA: eskorty w domu — kampania trwa
//   T5  odrzucenie przez gracza: następna depesza dopiero po cooldownie depeszy AI (`ai_peace_offer`, 1 rok); T5b zielone
//       po obu stronach (bramka cooldownu depeszy sprzed S4/3 — stoi przed oceną)
//   T6  przyjęcie depeszy wiążącej: pokój status quo, NAP, wojna zamknięta — choć ocena AI = NIE; KONTROLE: bez otwartej
//       depeszy wiążącej przyjęcie przy ocenie NIE nie podpisuje pokoju; zamknięcie bez odpowiedzi gasi wiązanie
//   T7  silnik reguł: kontrola roczna — 2,0 bez depeszy, 2,5 cooldown reguły, 3,0 depesza
//   T8  KONTROLA: pierwszy wyzwalacz (wyczerpanie z bitew) dalej przechodzi przez ocenę pokoju AI
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
import { setTuning, resetTuning } from '../../utils/StrikesBackTuning.js';

const RULES = await import('../../data/DirectorRuleData.js').catch(() => null);
const DATA  = await import('../../data/StrikesBackData.js').catch(() => null);
const Modal = await import('../../ui/PeaceOfferModal.js').catch(() => null);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
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
  for (const n of ['war:aiPeaceOffer', 'director:campaignPeaceOffered', 'director:campaignPeaceRefused']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
const at = (w, y) => { w.K.timeSystem.gameTime = y; };
const dip = (w) => w.K.diplomacySystem;
const war = (w) => quiet(() => dip(w).declareWar(w.emp, 'keeper_setup'));
const warId = (w) => w.ws.getWarWith(w.emp)?.id ?? null;
const offer = (w, year) => { at(w, year); return w.cp?.offerCampaignPeace?.({ empireId: w.emp, year }) ?? null; };
const aiSaysNo = (w) => dip(w).evaluatePeace(w.emp, null)?.decision === false;
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
/** Kadłub „w drodze”: poza układem stolicy, w swobodnym locie (nie w puli eskorty). */
function away(w, v) {
  const other = (w.K.galaxyData?.systems ?? []).map(s => s.id).find(id => id !== w.capSys && id !== 'sys_home') ?? 'sys_far';
  v.systemId = other;
  v.position.state = 'orbiting';
  v.position.dockedAt = null;
}
function director(ids) {
  const cat = Object.fromEntries(Object.keys(C).filter(id => ids.includes(id)).map(id => [id, C[id]]));
  try { return Object.keys(cat).length === ids.length ? new DirectorSystem({ catalog: cat }) : null; } catch { return null; }
}
function withDirector(fn) {
  const flag = GAME_CONFIG.FEATURES.reactionDirector;
  GAME_CONFIG.FEATURES.reactionDirector = true;
  try { return fn(); } finally { GAME_CONFIG.FEATURES.reactionDirector = flag; }
}
/** Scena „nic do wzięcia”: wojna, 3 eskorty w domu, żadnego ciała gracza w zasięgu — kampania wyczerpana (`none`). */
function exhaustedScene() {
  const w = boot();
  escorts(w, 3);
  at(w, 1);
  war(w);
  return w;
}

// ═══ T1 — klucz i katalog ═════════════════════════════════════════════════════
header('T1  klucz `campaignPeaceAfterChecks`, katalog');
{
  const k = DATA?.SB_TUNING?.campaignPeaceAfterChecks;
  assert(k?.default === 2 && k.type === 'int' && k.min === 1 && k.max === 10, 'T1a klucz `campaignPeaceAfterChecks`: 2 (1–10, całkowity)');
  boot();
  const bad = [0, 11, 2.5].map(v => quiet(() => setTuning('campaignPeaceAfterChecks', v)));
  quiet(() => resetTuning());
  assert(!!k && bad.every(x => x?.ok === false), 'T1b odmowy: 0 i 11 (poza zakresem), 2,5 (nie całkowita)');
  const r = C.campaign_peace_offer;
  assert(r?.trigger?.probe === 'campaignExhausted' && r.cooldown?.years === 1.0 && r.response?.action === 'offerCampaignPeace' && r.delay === 0,
    'T1c KONTROLA: reguła `campaign_peace_offer` bez zmian (sonda `campaignExhausted`, cooldown 1,0 — kontrola roczna)');
}

// ═══ T2 — (i) dwie kolejne kontrole roczne ════════════════════════════════════
header('T2  (i) dwie kolejne kontrole roczne; depesza bez oceny pokoju AI');
{
  const w = exhaustedScene();
  const no = aiSaysNo(w);
  const r1 = offer(w, 1.0);
  const rv1 = evs(w, 'director:campaignPeaceRefused').at(-1);
  const r1b = offer(w, 1.5);
  const rv1b = evs(w, 'director:campaignPeaceRefused').at(-1);
  const n1 = evs(w, 'war:aiPeaceOffer').length;
  const r2 = offer(w, 2.0);
  const ev = evs(w, 'war:aiPeaceOffer').at(-1);
  const off = evs(w, 'director:campaignPeaceOffered').at(-1);
  console.log(`     ocena AI NIE: ${no} · 1,0 ${JSON.stringify(r1)} · 1,5 ${JSON.stringify(r1b)} · 2,0 ${JSON.stringify(r2)} · depesza ${JSON.stringify(ev)}`);
  assert(r1?.offered === 0 && r1.reason === 'exhaustion_not_held' && rv1?.checks === 1 && rv1.need === 2 && rv1.exhaustion === 'no_affordable_target',
    'T2a pierwsza kontrola (wyczerpana) — bez depeszy: `exhaustion_not_held`, 1 z 2');
  assert(r1b?.offered === 0 && r1b.reason === 'exhaustion_not_held' && rv1b?.checks === 1 && n1 === 0,
    'T2b ta sama kontrola roczna (1,5) — seria bez zmian, bez depeszy');
  assert(no === true && r2?.offered === 1 && ev?.trigger === 'campaign_exhausted' && ev.empireId === w.emp && off?.checks === 2,
    'T2c kolejna kontrola po roku (2,0) — depesza STATUS QUO, choć ocena pokoju AI = NIE (SB89)');
  assert(ev?.binding === true && w.ws.isAiOfferBinding?.(warId(w)) === true, 'T2d depesza wiążąca (`binding`, `isAiOfferBinding`)');
}
{
  const w = exhaustedScene();
  quiet(() => setTuning('campaignPeaceAfterChecks', 1));
  const r = offer(w, 1.0);
  quiet(() => resetTuning('campaignPeaceAfterChecks'));
  assert(r?.offered === 1, 'T2e klucz czytany w chwili użycia: 1 — depesza od pierwszej kontroli');
}

// ═══ T3 — seria od nowa ═══════════════════════════════════════════════════════
header('T3  seria od nowa');
{
  const w = exhaustedScene();
  offer(w, 1.0);
  const r = offer(w, 2.5);
  const rv = evs(w, 'director:campaignPeaceRefused').at(-1);
  assert(r?.offered === 0 && r.reason === 'exhaustion_not_held' && rv?.checks === 1, 'T3a kontrola po 1,5 roku (rok bez kontroli z wyczerpaniem) — seria od nowa');
  const r2 = offer(w, 3.5);
  assert(r2?.offered === 1, 'T3b następna kontrola po roku — depesza');
}
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 2);                     // potrzeba 2
  escorts(w, 1);                                    // pula 1 — kampania wyczerpana (`insufficient`)
  at(w, 1);
  war(w);
  const r1 = offer(w, 1.0);
  at(w, 1.4);
  const e = escorts(w, 1);
  const L = w.sq?.launchSquadron?.(w.emp, target, e.map(v => v.id), { origin: 'campaign' });
  quiet(() => w.K.colonyManager.transferColony(target, w.emp, 'invasion'));   // fala zdobywa cel
  w.sq?._tick?.();                                  // SB90 — eskadra z celem już własnym zamyka się
  const ex = w.cp?.campaignExhaustion?.(w.emp);
  const r2 = offer(w, 2.0);
  const rv = evs(w, 'director:campaignPeaceRefused').at(-1);
  console.log(`     1,0 ${JSON.stringify(r1)} · eskadra ${L?.ok} · wyczerpanie przy 2,0 ${ex?.reason} · 2,0 ${JSON.stringify(r2)}`);
  assert(r1?.reason === 'exhaustion_not_held' && L?.ok === true && ex?.exhausted === true && r2?.offered === 0 && r2.reason === 'exhaustion_not_held'
    && rv?.checks === 1, 'T3c eskadra wysłana między kontrolami — seria od nowa');
}

// ═══ T4 — (ii) eskorty w drodze ═══════════════════════════════════════════════
header('T4  (ii) brak eskadry nie z eskort w drodze');
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 2);                     // potrzeba 2
  const es = escorts(w, 2);
  es.forEach(v => away(w, v));                      // obie w drodze — pula w domu 0
  at(w, 1);
  war(w);
  const ex = w.cp?.campaignExhaustion?.(w.emp);
  offer(w, 1.0);
  const r = offer(w, 2.0);
  const rv = evs(w, 'director:campaignPeaceRefused').at(-1);
  console.log(`     wyczerpanie ${JSON.stringify(ex)} · 2,0 ${JSON.stringify(r)} · ${JSON.stringify(rv)}`);
  assert(ex?.exhausted === true && ex.plan === 'insufficient' && r?.offered === 0 && r.reason === 'escorts_in_transit'
    && rv?.warpHulls === 2 && rv.available === 0 && rv.needed === 2 && evs(w, 'war:aiPeaceOffer').length === 0,
    'T4a obie eskorty z bakiem warp w drodze pokryłyby eskadrę — bez depeszy (`escorts_in_transit`, 2 kadłuby, dostępne 0, potrzeba 2)');
  es.forEach(v => { v.systemId = w.capSys; v.position.state = 'docked'; v.position.dockedAt = w.cap0.planetId; });
  const back = offer(w, 3.0);
  assert(back?.offered === 0 && back.reason === 'squadron_affordable', 'T4b KONTROLA: eskorty w domu — eskadra do wzięcia, kampania trwa');
}
{
  const w = boot();
  const target = playerOutpost(w);
  playerFrigates(w, target, 2);                     // potrzeba 2
  escorts(w, 1).forEach(v => away(w, v));           // jedna eskorta w drodze — nawet w domu nie pokryje eskadry
  at(w, 1);
  war(w);
  offer(w, 1.0);
  const r = offer(w, 2.0);
  assert(r?.offered === 1, 'T4c jedna eskorta na 2 potrzebne (też w drodze) — brak eskadry nie z eskort w drodze: depesza');
}

// ═══ T5 — odrzucenie i cooldown depeszy AI ════════════════════════════════════
header('T5  odrzucenie przez gracza — następna depesza po cooldownie depeszy AI');
{
  const w = exhaustedScene();
  offer(w, 1.0);
  const r2 = offer(w, 2.0);
  const id = warId(w);
  Modal?.rejectPeaceOffer?.(w.emp, id);
  EventBus.emit('war:aiPeaceOfferResolved', { empireId: w.emp, warId: id, choice: 'reject' });
  const cd = dip(w).getAiPeaceOfferCooldown?.(w.emp);
  const r25 = offer(w, 2.5);
  const r3 = offer(w, 3.0);
  console.log(`     2,0 ${JSON.stringify(r2)} · cooldown po odrzuceniu ${cd} · 2,5 ${JSON.stringify(r25)} · 3,0 ${JSON.stringify(r3)}`);
  assert(r2?.offered === 1 && cd === 1, 'T5a odrzucenie zapisuje cooldown depeszy AI (1 rok)');
  assert(r25?.offered === 0 && r25.reason === 'cooldown', 'T5b w cooldownie (2,5) — bez depeszy (`cooldown`; bramka sprzed S4/3)');
  assert(r3?.offered === 1 && evs(w, 'war:aiPeaceOffer').length === 2, 'T5c po cooldownie (3,0) — depesza znowu');
}

// ═══ T6 — przyjęcie wiążące ═══════════════════════════════════════════════════
header('T6  przyjęcie depeszy wiążącej');
{
  const w = exhaustedScene();
  offer(w, 1.0);
  offer(w, 2.0);
  const id = warId(w);
  const no = aiSaysNo(w);
  const ok = Modal?.acceptPeaceOffer?.(w.emp, id);
  console.log(`     ocena AI NIE: ${no} · przyjęcie ${ok} · status ${dip(w).getStatus(w.emp)}`);
  assert(no === true && ok === true && dip(w).getStatus(w.emp) === 'truce' && dip(w).hasTreaty?.(w.emp, 'non_aggression') === true
    && w.ws.getWar(id)?.active === false, 'T6a przyjęcie: pokój status quo, NAP, wojna zamknięta — choć ocena pokoju AI = NIE');
}
{
  const w = exhaustedScene();
  const id = warId(w);
  const ok = Modal?.acceptPeaceOffer?.(w.emp, id);
  assert(!!Modal && ok === false && w.ws.getWar(id)?.active === true,
    'T6b KONTROLA: bez otwartej depeszy wiążącej przyjęcie przy ocenie NIE nie podpisuje pokoju');
}
{
  const w = exhaustedScene();
  offer(w, 1.0);
  offer(w, 2.0);
  const id = warId(w);
  const before = w.ws.isAiOfferBinding?.(id);
  EventBus.emit('war:aiPeaceOfferResolved', { empireId: w.emp, warId: id, choice: 'dismissed' });
  assert(before === true && w.ws.isAiOfferBinding?.(id) === false && Modal?.acceptPeaceOffer?.(w.emp, id) === false,
    'T6c zamknięcie bez odpowiedzi gasi wiązanie — późniejsze przyjęcie przy ocenie NIE nie podpisuje pokoju');
}

// ═══ T7 — silnik reguł ════════════════════════════════════════════════════════
header('T7  silnik reguł — kontrola roczna');
{
  const w = exhaustedScene();
  const ds = director(['strike_player_target', 'retake_lost_colony', 'campaign_strike', 'campaign_peace_offer']);
  const n = withDirector(() => {
    const emp = w.K.empireRegistry.get(w.emp);
    const out = [];
    for (const y of [2.0, 2.5, 3.0]) { at(w, y); ds?.tickEmpire?.(w.emp, emp); out.push(evs(w, 'war:aiPeaceOffer').length); }
    return out;
  });
  console.log(`     depesze po 2,0 / 2,5 / 3,0: ${JSON.stringify(n)}`);
  assert(!!ds && n[0] === 0 && n[1] === 0 && n[2] === 1, 'T7a 2,0 — kontrola 1 bez depeszy; 2,5 — cooldown reguły; 3,0 — kontrola 2: depesza');
}

// ═══ T8 — pierwszy wyzwalacz bez zmian ════════════════════════════════════════
header('T8  KONTROLA: pierwszy wyzwalacz (wyczerpanie z bitew) z oceną pokoju AI');
{
  const w = exhaustedScene();
  const id = warId(w);
  const no = aiSaysNo(w);
  w.ws.changeExhaustion(id, w.emp, 40, 'keeper');      // ≥ peaceCost — stara ścieżka pyta ocenę pokoju
  assert(no === true && evs(w, 'war:aiPeaceOffer').length === 0 && w.ws.isAiOfferBinding?.(id) !== true,
    'T8a wyczerpanie z bitew ≥ `peaceCost` przy ocenie NIE — bez depeszy (ocena dalej rozstrzyga)');
}

console.log(`\n═══ sb4_peace_checks_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
