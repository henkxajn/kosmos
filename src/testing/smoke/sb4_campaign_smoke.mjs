// ═══════════════════════════════════════════════════════════════════════════════
// sb4_campaign_smoke — KEEPER kampanii AI układ po układzie (AI STRIKES BACK S4/2 — decyzje SB10, SB83, SB84).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: do S4/2 ofensywa AI w wojnie to same eskorty bez desantu (`strike_player_target`), a cel — najcenniejsze ciało
//   gracza w zasięgu (stolica gracza bywała pierwsza). SB83 / SB84: reguła `campaign_strike` (bez rzutu) wysyła ESKADRĘ
//   z desantem (`StrikeSquadronSystem.launchSquadron`) na NASTĘPNE ciało gracza — najbliższy układ gracza pierwszy, w nim
//   placówki, potem kolonie, stolica gracza na końcu; odbijanie ma pierwszeństwo; zwykłe uderzenie eskortą wyłącznie, gdy
//   pula nie pokrywa eskadry.
//
// ⚠ Harness: prawdziwy `GameCore` + `TerritoryService` + `InfluenceMap` (jak `DirectorHarness`), MOS, OrderService,
//   EnemyAttackHandler, `DirectorOffensive` z `registerOffensiveBehaviors` (rejestruje też odbijanie i kampanię); pula
//   i garnizon WYŁĄCZONE (wzór R-B2b); `gameState` i strumień PRNG świeże przy każdym boocie (pułapka 4 `DirectorHarness`:
//   bez `reseed` kolejny boot w tym samym procesie dostaje INNĄ galaktykę — zmierzone tu: dom gracza wypadał w zasięgu). Zasięg imperium — prawdziwa `InfluenceMap`; układ domowy gracza dołożony do powłoki granicznej
//   NAKŁADKĄ (na fixture GATE-S4 dom gracza leży w zasięgu `emp_001`, w świecie keepera — poza nim). Cele gracza —
//   produkcyjne `createOutpost` / `createColony`; zdobycia — `captureColonyForPlayer`.
// ⚠ Moduły nowe importowane z `catch` — na kodzie sprzed S4/2 suita degraduje do czerwieni, nie przerywa.
//
// PINY:
//   T1  katalog: `campaign_strike` (sonda `campaignTargets`, guardy wojny / „brak eskadry w drodze” / „nic do odbicia”,
//       bez rzutu, `delay: 0`, cooldown reguły 1,0, PO odbijaniu w katalogu); `strike_player_target` z guardem
//       `empireSquadronUnaffordable` (ostatnim); klucz `campaignCooldownYears` 5; nazwy w rejestrach
//   T2  porządek SB84 (czysty planer): najbliższy układ, w nim placówki → kolonie → stolica gracza; remis klasy — tańszy,
//       potem id; remis odległości — id układu; wejście nietknięte
//   T3  kandydaci: ciała gracza w zasięgu z odległością od stolicy imperium; ciało zdobyte przez gracza W BIEŻĄCEJ wojnie
//       (odbijanie) — poza kampanią, zdobyte PRZED wojną — w kampanii (SB75); kolejność integracyjna SB84
//   T4  wysyłka: eskadra na pierwszy cel, eskorta = `requiredSquadron`, rekord `origin: 'campaign'`, zdarzenie; cooldown
//       celu po wysyłce, następny cel w kolejce, po cooldownie cel wraca
//   T5  odmowy: `insufficient_squadron` (bez eskadry, cooldown niespalony), cel ponad sufit — pomijany (następny w kolejce),
//       wszystkie ponad sufit — `target_beyond_reach`, `no_target`, `no_capital`; audyt odmów
//   T6  pierwszeństwo (SB83): odbijanie do wysłania albo czekające na pulę — kampania czeka; odbijanie w zwłoce — nie;
//       zwykłe uderzenie zablokowane, gdy eskadra jest do wzięcia; dozwolone przy puli za małej albo pustej fali
//   T7  silnik reguł (`DirectorSystem`, prawdziwe wpisy katalogu): kampania odpala, cooldown reguły, „eskadra w drodze”,
//       następny cel po zamknięciu; zwykłe uderzenie nie dochodzi do rzutu; odbijanie wygrywa w tym samym ticku
//   T8  odczyt konsoli (wiersze `kampania` z werdyktem), lokator `KOSMOS.directorCampaign`, audyt zdarzeń kampanii
//   T9  pochodzenie eskadry: odbicie `'retake'`, dźwignia bez opcji — `null`
//   T10 STOLICA GRACZA OSTATNIA (SB84): nie jest celem, dopóki w jej układzie stoi inne ciało gracza — także w cooldownie
//       (wtedy brak celu, nie stolica); po upadku pozostałych ciał — cel; ciało w INNYM układzie stolicy nie blokuje
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
import { DirectorProbes, DirectorGuards, DirectorActions } from '../../systems/director/DirectorRegistry.js';
import { setTuning, resetTuning } from '../../utils/StrikesBackTuning.js';
import { readFileSync } from 'node:fs';

const RULES = await import('../../data/DirectorRuleData.js').catch(() => null);
const DATA  = await import('../../data/StrikesBackData.js').catch(() => null);
const PLAN  = await import('../../utils/CampaignPlanner.js').catch(() => null);
const SWP   = await import('../../utils/StrikeWavePlanner.js').catch(() => null);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const srcOr = (rel) => { try { return src(rel); } catch { return null; } };

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  reseed('kosmos-default');                      // ta sama galaktyka w każdej scenie
  gameState.restore(null);                       // świeży stan reguł, eskadr i strojenia
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  K.orderService = new OrderService();
  K.enemyAttackHandler = new EnemyAttackHandler();
  // ⚠ ZAWSZE nowe: `window.KOSMOS` przeżywa kolejny boot w tym samym procesie, a mapa wpływów z poprzedniej sceny trzyma
  //   strefy policzone na STARYM świecie (i nakładkę zasięgu) — zmierzone: dom gracza „w zasięgu” bez nakładki.
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
  // Nakładka zasięgu: układ domowy gracza w powłoce granicznej imperium (fixture GATE-S4: dom gracza w zasięgu `emp_001`).
  const real = K.influenceMap;
  K.influenceMap = { __proto__: real, isInBorderZone: (s, e) => (e === emp && s === 'sys_home') || real.isInBorderZone(s, e) };
  const w = { core, K, vm: K.vesselManager, sq: K.strikeSquadronSystem, off, rt: off.retake ?? null, cp: off.campaign ?? null,
              emp, cap0, capSys, ev: [] };
  for (const n of ['director:campaignLaunched', 'director:campaignRefused', 'director:retakeLaunched', 'director:ruleFired']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
const war = (w) => quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
const capture = (w, id) => quiet(() => w.K.colonyManager.captureColonyForPlayer(id, 'ground_invasion'));
const at = (w, y) => { w.K.timeSystem.gameTime = y; };
const freeBodies = (w, sys) => ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
  .filter(b => !w.K.colonyManager.getColony(b.id));
/** Ciało gracza (placówka albo kolonia) na pierwszym wolnym ciele układu; zwraca id. */
function playerBody(w, sys, kind) {
  const b = freeBodies(w, sys)[0];
  if (!b) return null;
  quiet(() => (kind === 'outpost' ? w.K.colonyManager.createOutpost(b.id, {}, 0) : w.K.colonyManager.createColony(b.id, {}, 8, 0)));
  return w.K.colonyManager.getColony(b.id) ? b.id : null;
}
/** Kolonia imperium w układzie jego stolicy (do zdobycia przez gracza); zwraca id. */
function aiColony(w) {
  const b = freeBodies(w, w.capSys)[0];
  if (!b) return null;
  quiet(() => w.K.colonyManager.createColony(b.id, {}, 8, w.K.timeSystem.gameTime ?? 0, w.emp));
  const col = w.K.colonyManager.getColony(b.id);
  if (!col) return null;
  col.ownerEmpireId = w.emp;
  w.K.empireRegistry.addColony(w.emp, b.id);
  return b.id;
}
function escorts(w, n) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap0.planetId }).vessel);
}
function playerFrigates(w, colonyId, n) {
  return Array.from({ length: n }, () => w.vm.createAndRegister('hull_frigate', colonyId, { modules: ['weapon_laser', 'engine_ion'] }));
}
/** Scena kampanii: układ stolicy imperium (X), układ w powłoce granicznej (Y), dom gracza (H). */
function campaignScene(w) {
  const near = (w.K.influenceMap.getBorderSystems?.(w.emp) ?? []).filter(s => s !== 'sys_home' && freeBodies(w, s).length > 0);
  const Y = near[0] ?? null;
  const ids = {
    OX: playerBody(w, w.capSys, 'outpost'), CX: playerBody(w, w.capSys, 'colony'),
    OY: Y ? playerBody(w, Y, 'outpost') : null,
    OH: playerBody(w, 'sys_home', 'outpost'), CH: playerBody(w, 'sys_home', 'colony'), H: w.K.homePlanet.id, Y,
  };
  return ids;
}
const order = (w) => (w.cp?.campaignNeeds?.(w.emp) ?? []).map(r => r.bodyId);
const guard = (name, w) => { try { return DirectorGuards.resolve(name)({ empireId: w.emp }); } catch { return undefined; } };

// ═══ T1 — katalog ═════════════════════════════════════════════════════════════
header('T1  wpis katalogu, guard zwykłego uderzenia, klucz, rejestry');
{
  const C = RULES?.DIRECTOR_RULES ?? {};
  const r = C.campaign_strike;
  assert(r?.trigger?.kind === 'poll' && r.trigger.probe === 'campaignTargets' && r.trigger.gte === 1, 'T1a wyzwalacz: sonda `campaignTargets` ≥ 1');
  assert(JSON.stringify(r?.guard) === JSON.stringify(['empireAtWarWithPlayer', 'empireHasNoSquadronUnderway', 'empireHasNoRetakePending']),
    'T1b guardy: wojna z graczem, brak eskadry w drodze, nic do odbicia');
  assert(r && !r.roll && !r.personalityMod && r.delay === 0 && r.cooldown?.years === 1.0 && r.response?.action === 'launchCampaign',
    'T1c bez rzutu, `delay: 0`, cooldown reguły 1,0, akcja `launchCampaign`');
  const keys = Object.keys(C);
  assert(keys.includes('retake_lost_colony') && keys.indexOf('retake_lost_colony') < keys.indexOf('campaign_strike'),
    'T1d w katalogu PO odbijaniu (wysyłka odbicia w tym samym ticku blokuje kampanię)');
  assert(JSON.stringify(C.strike_player_target?.guard) === JSON.stringify(['empireAtWarWithPlayer', 'empireHasStrikeForce', 'empireSquadronUnaffordable']),
    'T1e `strike_player_target`: guard `empireSquadronUnaffordable` (ostatni)');
  const k = DATA?.SB_TUNING?.campaignCooldownYears;
  assert(k?.default === 5 && k.type === 'number' && k.min === 0 && k.max === 100, 'T1f klucz `campaignCooldownYears`: 5 lat gry (0–100)');
  const w = boot();
  assert(DirectorProbes.has('campaignTargets') && DirectorGuards.has('empireHasNoRetakePending') && DirectorGuards.has('empireSquadronUnaffordable')
    && DirectorActions.has('launchCampaign') && !!w.cp, 'T1g nazwy zarejestrowane przy uderzeniu (`instance.campaign`)');
  let built = null;
  const sub = Object.fromEntries(['strike_player_target', 'retake_lost_colony', 'campaign_strike'].filter(id => C[id]).map(id => [id, C[id]]));
  try { built = Object.keys(sub).length === 3 ? new DirectorSystem({ catalog: sub }) : 'brak wpisu w katalogu'; } catch (e) { built = String(e?.message ?? e); }
  assert(built && typeof built === 'object', `T1h \`DirectorSystem\` z uderzeniem, odbijaniem i kampanią buduje się (walidacja nazw R12)${typeof built === 'string' ? ' — ' + built : ''}`);
}

// ═══ T2 — porządek SB84 (czysty) ══════════════════════════════════════════════
header('T2  porządek celów SB84 (planer)');
{
  const ord = PLAN?.orderCampaignTargets;
  const rec = (bodyId, systemId, distLY, cls, needed = 1) => ({ bodyId, systemId, distLY, needed, capital: cls === 'capital', outpost: cls === 'outpost' });
  const input = [
    rec('cap_far', 'sys_b', 9, 'capital'), rec('col_far', 'sys_b', 9, 'colony'), rec('out_far', 'sys_b', 9, 'outpost'),
    rec('cap_near', 'sys_a', 2, 'capital'), rec('col_near', 'sys_a', 2, 'colony'), rec('out_near', 'sys_a', 2, 'outpost'),
  ];
  const before = JSON.stringify(input);
  const got = ord ? ord(input).map(r => r.bodyId) : [];
  assert(got.join() === 'out_near,col_near,cap_near,out_far,col_far,cap_far', `T2a najbliższy układ pierwszy; w nim placówki → kolonie → stolica (${got.join(' ')})`);
  assert(JSON.stringify(input) === before && got.length === 6, 'T2b wejście nietknięte (kopia)');
  const tie = ord ? ord([rec('c2', 's', 1, 'colony', 2), rec('c1b', 's', 1, 'colony', 1), rec('c1a', 's', 1, 'colony', 1)]).map(r => r.bodyId) : [];
  assert(tie.join() === 'c1a,c1b,c2', `T2c remis klasy: tańszy (mniej okrętów) pierwszy, potem id ciała (${tie.join(' ')})`);
  const dt = ord ? ord([rec('x', 'sys_z', 3, 'outpost'), rec('y', 'sys_a', 3, 'capital')]).map(r => r.bodyId) : [];
  assert(dt.join() === 'y,x', `T2d remis odległości: id układu, nie klasa (${dt.join(' ')})`);
  const cls = PLAN?.campaignClass;
  assert(cls?.({ capital: true, outpost: true }) === 'capital' && cls?.({ outpost: true }) === 'outpost' && cls?.({}) === 'colony'
    && PLAN?.CAMPAIGN_CLASS_RANK?.outpost === 0 && PLAN.CAMPAIGN_CLASS_RANK.capital === 2, 'T2e klasa celu: stolica gracza > placówka > kolonia');
  const plSrc = srcOr('../../utils/CampaignPlanner.js');
  assert(!!PLAN?.CAMPAIGN_CLASS_RANK && Object.isFrozen(PLAN.CAMPAIGN_CLASS_RANK) && plSrc !== null && !/\bimport\b/.test(plSrc),
    'T2f planer czysty: zero importów, ranga zamrożona');
}

// ═══ T3 — kandydaci ═══════════════════════════════════════════════════════════
header('T3  kandydaci: zasięg, odległość, odbijanie poza kampanią (SB75)');
{
  const w = boot();
  const s = campaignScene(w);
  const preWar = aiColony(w);
  capture(w, preWar);                         // przed wojną — zatrzymane (SB75: zwykły cel kampanii)
  const inWar = aiColony(w);
  war(w);
  at(w, 0.2);
  capture(w, inWar);                          // w wojnie — cel odbijania
  const cands = w.cp?.campaignCandidates?.(w.emp) ?? [];
  const byId = new Map(cands.map(c => [c.body.id, c]));
  console.log(`     X=${w.capSys} Y=${s.Y} · kandydaci ${cands.map(c => `${c.body.id}@${c.systemId}:${c.distLY.toFixed(2)}${c.capital ? '(S)' : c.outpost ? '(p)' : ''}`).join(' ')}`);
  assert(!!s.OX && !!s.CX && !!s.OY && !!s.OH && !!s.CH && !!preWar && !!inWar, 'T3-0 scena: ciała gracza w X, Y i w domu; dwie kolonie imperium zdobyte');
  assert(byId.size === 7 && [s.OX, s.CX, s.OY, s.OH, s.CH, s.H, preWar].every(id => byId.has(id)), 'T3a w kampanii: sześć ciał gracza w zasięgu + ciało zatrzymane sprzed wojny');
  assert(byId.size > 0 && !byId.has(inWar) && (w.rt?.retakeCandidates?.(w.emp) ?? []).some(c => c.body.id === inWar),
    'T3b ciało zdobyte W BIEŻĄCEJ wojnie — cel odbijania, NIE kampanii (także w zwłoce odbicia)');
  assert(byId.get(s.OX)?.distLY === 0 && byId.get(s.OY)?.distLY > 0 && byId.get(s.H)?.distLY > byId.get(s.OY)?.distLY,
    'T3c odległość układu od stolicy imperium (LY): X = 0 < Y < dom gracza');
  assert(byId.get(s.H)?.capital === true && [...byId.values()].filter(c => c.capital).length === 1 && byId.get(s.OH)?.outpost === true
    && byId.get(s.CH)?.outpost === false, 'T3d klasy: stolica gracza (`isHomePlanet`) jedna; placówka / kolonia');
  const o = order(w);
  const sx = [s.OX, preWar, s.CX].filter(Boolean);
  const exp = [s.OX, ...[preWar, s.CX].sort(), s.OY, s.OH, s.CH, s.H];
  console.log(`     kolejność ${o.join(' → ')}`);
  assert(o.join() === exp.join(), 'T3e kolejność: X (placówka, kolonie), Y, dom gracza (placówka, kolonia, stolica na końcu)');
  assert(sx.length === 3, 'T3f KONTROLA sceny: w X trzy cele gracza (placówka i dwie kolonie)');
}

// ═══ T4 — wysyłka ═════════════════════════════════════════════════════════════
header('T4  wysyłka eskadry, cooldown celu, następny cel');
{
  const w = boot();
  const s = campaignScene(w);
  war(w);
  at(w, 1);
  const pool = escorts(w, 3);
  const plan = w.cp?.planCampaign?.(w.emp);
  const need = w.off.requiredSquadron(plan?.target ?? { systemId: w.capSys, body: EntityManager.get(s.OX) }, pool).needed;
  const r = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  const rec = w.sq?.getSquadron?.(r?.squadronId);
  const ev = evs(w, 'director:campaignLaunched').find(e => e.squadronId === r?.squadronId);
  console.log(`     plan ${plan?.kind}/${plan?.target?.body?.id} · ${JSON.stringify(r)} · rekord ${rec?.origin}/${rec?.targetBodyId}/${rec?.escortIds?.length}`);
  assert(plan?.kind === 'start' && plan.target?.body?.id === s.OX && r?.launched === 1 && rec?.targetBodyId === s.OX,
    'T4a eskadra na pierwszy cel kolejności (placówka w układzie stolicy imperium)');
  assert(rec?.origin === 'campaign' && rec.escortIds?.length === need && r.needed === need && Number.isFinite(need),
    'T4b rekord `origin: \'campaign\'`, eskorta = `requiredSquadron`');
  assert(ev && ev.targetClass === 'outpost' && ev.targetSystemId === w.capSys && ev.distLY === 0 && ev.wave > 0 && ev.escorts?.length === need,
    'T4c `director:campaignLaunched`: klasa celu, układ, odległość, fala, eskorta');
  const c1 = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === s.OX);
  const next = w.cp?.planCampaign?.(w.emp);
  assert(c1?.wait === 'cooldown' && c1.lastAttemptYear === 1 && next?.target?.body?.id === s.CX,
    'T4d po wysyłce cel czeka (`cooldown`), plan bierze następny (kolonia w X)');
  at(w, 5.9);
  const c2 = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === s.OX);
  at(w, 6.0);
  const c3 = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === s.OX);
  assert(c2?.wait === 'cooldown' && c3?.eligible === true, 'T4e po `campaignCooldownYears` (5 lat gry) cel wraca');
  quiet(() => setTuning('campaignCooldownYears', 0));
  at(w, 1.5);
  const c4 = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === s.OX);
  quiet(() => resetTuning('campaignCooldownYears'));
  assert(c4?.eligible === true, 'T4f klucz czytany w chwili użycia (cooldown 0 — cel od razu)');
}

// ═══ T5 — odmowy ══════════════════════════════════════════════════════════════
header('T5  odmowy i pomijanie celów ponad sufit');
{
  const w = boot();
  const s = campaignScene(w);
  war(w);
  at(w, 1);
  playerFrigates(w, s.CX, 2);                  // obrona układu X: 2 fregaty gracza (potrzeba 2)
  const few = escorts(w, 1);
  const plan = w.cp?.planCampaign?.(w.emp);
  const r = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  const sq = (w.sq?.listSquadrons?.(w.emp) ?? []).length;
  const after = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === s.OX);
  console.log(`     potrzebne ${plan?.need?.needed} · pula ${few.length} · ${JSON.stringify(r)}`);
  assert(plan?.need?.needed > 1 && plan.need.needed <= (DATA?.SB_TUNING?.squadronMaxShips?.default ?? 3), 'T5-0 obrona X w zasięgu sufitu, pula o jeden za mała');
  assert(r?.launched === 0 && r.reason === 'insufficient_squadron' && r.needed === plan.need.needed && r.available === 1 && r.targetBodyId === s.OX && sq === 0,
    'T5a odmowa `insufficient_squadron` z liczbami, żadna eskadra; BEZ schodzenia na następny cel');
  assert(after?.eligible === true && after.lastAttemptYear === null, 'T5b cooldown celu niespalony');
  assert(evs(w, 'director:campaignRefused').some(e => e.reason === 'insufficient_squadron'), 'T5c odmowa w audycie (`director:campaignRefused`)');
}
{
  const w = boot();
  const s = campaignScene(w);
  war(w);
  at(w, 1);
  playerFrigates(w, s.CX, 4);                  // X ponad sufit
  escorts(w, 3);
  const p = w.cp?.planCampaign?.(w.emp);
  const r = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  console.log(`     plan ${p?.kind}/${p?.target?.body?.id} pominięte ${JSON.stringify(p?.skipped)}`);
  assert(p?.kind === 'start' && p.target?.body?.id === s.OY && (p.skipped ?? []).map(x => x.bodyId).sort().join() === [s.OX, s.CX].sort().join()
    && p.skipped.every(x => x.needed > p.cap), 'T5d cele ponad sufit pominięte — następny w kolejce (Y)');
  assert(r?.launched === 1 && r.targetBodyId === s.OY && evs(w, 'director:campaignLaunched')[0]?.skipped?.length === 2,
    'T5e wysyłka na Y; zdarzenie wymienia pominięte');
}
{
  const w = boot();
  campaignScene(w);
  war(w);
  at(w, 1);
  quiet(() => setTuning('squadronMaxShips', 1));
  for (const c of w.K.colonyManager.getPlayerColonies()) playerFrigates(w, c.planetId, 2);
  escorts(w, 3);
  const r = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  quiet(() => resetTuning('squadronMaxShips'));
  assert(r?.launched === 0 && r.reason === 'target_beyond_reach' && r.cap === 1 && (r.skipped ?? []).length === 5
    && !(r.skipped ?? []).some(x => x.bodyId === w.K.homePlanet.id),
    'T5f wszystkie cele ponad sufit — `target_beyond_reach` z listą pominiętych (stolica czeka — poza listą)');
}
{
  const w = boot();
  war(w);
  w.K.influenceMap = Object.getPrototypeOf(w.K.influenceMap);   // bez nakładki: brak ciał gracza w zasięgu
  const reach = w.off.reachableTargets(w.emp).length;
  const n = w.cp?.countCampaignTargets?.(w.emp);
  const r = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  console.log(`     bez nakładki: ciał gracza w zasięgu ${reach} · sonda ${n} · ${JSON.stringify(r)}`);
  assert(reach === 0 && w.K.colonyManager.getPlayerColonies().length >= 1, 'T5g-0 KONTROLA sceny: gracz ma kolonię, żadna nie leży w zasięgu imperium');
  assert(r?.launched === 0 && r.reason === 'no_target' && n === 0, 'T5g brak celu w zasięgu — `no_target`, sonda 0');
}
{
  const w = boot();
  campaignScene(w);
  war(w);
  capture(w, w.cap0.planetId);                // jedyna pełna kolonia imperium zdobyta
  const r = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  assert(!w.K.directorProduction.capitalOf(w.emp) && r?.launched === 0 && r.reason === 'no_capital', 'T5h imperium bez stolicy — `no_capital`');
}

// ═══ T6 — pierwszeństwo (SB83) ════════════════════════════════════════════════
header('T6  pierwszeństwo: odbijanie przed kampanią, eskadra przed zwykłym uderzeniem');
{
  const w = boot();
  campaignScene(w);
  const lost = aiColony(w);
  war(w);
  at(w, 0);
  capture(w, lost);
  escorts(w, 3);
  at(w, 0.5);                                  // odbicie w zwłoce (`retakeDelayYears` 1)
  const inDelay = { pending: w.cp?.retakePending?.(w.emp), g: guard('empireHasNoRetakePending', w) };
  at(w, 1.1);                                  // odbicie do wysłania
  const ready = { kind: w.rt?.planRetake?.(w.emp)?.kind, g: guard('empireHasNoRetakePending', w), un: guard('empireSquadronUnaffordable', w) };
  console.log(`     zwłoka ${JSON.stringify(inDelay)} · gotowe ${JSON.stringify(ready)}`);
  assert(inDelay.pending === false && inDelay.g === true, 'T6a odbicie w zwłoce — kampania NIE czeka');
  assert(ready.kind === 'start' && ready.g === false, 'T6b odbicie do wysłania — kampania czeka (guard `empireHasNoRetakePending`)');
  assert(ready.un === false, 'T6c eskadra (odbicia) do wzięcia — zwykłe uderzenie zablokowane');
  const verdicts = (w.cp?.campaignNeeds?.(w.emp) ?? []).map(r => r.verdict);
  assert(verdicts.length > 1 && verdicts.filter(v => v !== 'czeka_capital_last').length === verdicts.length - 1
    && verdicts.filter(v => v !== 'czeka_capital_last').every(v => v === 'czeka_odbicie'),
    'T6d odczyt: wiersze kampanii `czeka_odbicie` (stolica — `czeka_capital_last`)');
}
{
  const w = boot();
  const s = campaignScene(w);
  const lost = aiColony(w);
  war(w);
  at(w, 0);
  capture(w, lost);
  playerFrigates(w, s.CX, 2);                  // obrona X (cel odbicia w X): potrzeba 2, pula 1
  escorts(w, 1);
  at(w, 1.1);
  const k = w.rt?.planRetake?.(w.emp)?.kind;
  assert(k === 'insufficient' && guard('empireHasNoRetakePending', w) === false && guard('empireSquadronUnaffordable', w) === true,
    'T6e odbicie czeka na pulę — kampania czeka, zwykłe uderzenie DOZWOLONE (pula nie pokrywa eskadry)');
}
{
  const w = boot();
  campaignScene(w);
  war(w);
  at(w, 1);
  escorts(w, 3);
  const a = { kind: w.cp?.planCampaign?.(w.emp)?.kind, un: guard('empireSquadronUnaffordable', w), nr: guard('empireHasNoRetakePending', w) };
  quiet(() => setTuning('strikeWaveShare', 0));
  const b = { wave: SWP?.readEmpireWavePlan?.(w.K, w.emp)?.count, un: guard('empireSquadronUnaffordable', w) };
  quiet(() => resetTuning('strikeWaveShare'));
  console.log(`     kampania ${JSON.stringify(a)} · pusta fala ${JSON.stringify(b)}`);
  assert(a.kind === 'start' && a.un === false && a.nr === true, 'T6f kampania do wysłania — zwykłe uderzenie zablokowane');
  assert(b.wave === 0 && b.un === true, 'T6g pusta fala desantu — eskadry nie ma, zwykłe uderzenie DOZWOLONE');
}
{
  const w = boot();
  const s = campaignScene(w);
  war(w);
  at(w, 1);
  playerFrigates(w, s.CX, 2);
  escorts(w, 1);
  assert(w.cp?.planCampaign?.(w.emp)?.kind === 'insufficient' && guard('empireSquadronUnaffordable', w) === true,
    'T6h kampania czeka na pulę — zwykłe uderzenie DOZWOLONE');
}

// ═══ T7 — silnik reguł ════════════════════════════════════════════════════════
header('T7  reguły na prawdziwym silniku (`DirectorSystem`, wpisy z katalogu)');
const C = RULES?.DIRECTOR_RULES ?? {};
function director(w, ids) {
  const cat = Object.fromEntries(ids.filter(id => C[id]).map(id => [id, C[id]]));
  try { return Object.keys(cat).length === ids.length ? new DirectorSystem({ catalog: cat }) : null; } catch { return null; }
}
{
  const w = boot();
  const s = campaignScene(w);
  war(w);
  escorts(w, 3);
  const flag = GAME_CONFIG.FEATURES.reactionDirector;
  GAME_CONFIG.FEATURES.reactionDirector = true;
  const ds = director(w, ['strike_player_target', 'retake_lost_colony', 'campaign_strike']);
  const emp = w.K.empireRegistry.get(w.emp);
  const tick = (y) => { at(w, y); ds?.tickEmpire?.(w.emp, emp); return (w.sq?.listSquadrons?.(w.emp) ?? []); };
  const n1 = tick(1.0);
  const n2 = tick(1.3);
  const n3 = tick(2.4);
  const first = n1[0];
  if (first) w.sq._setStage(first.id, 'closed', { closeReason: 'keeper' });
  const n4 = tick(2.5);
  const strikeState = ds?._ruleState?.('strike_player_target', w.emp) ?? {};
  GAME_CONFIG.FEATURES.reactionDirector = flag;
  const fired = evs(w, 'director:ruleFired');
  console.log(`     eskadry: 1,0 → ${n1.length} · 1,3 → ${n2.length} · 2,4 → ${n3.length} · po zamknięciu 2,5 → ${n4.length} (${n4.map(x => `${x.targetBodyId}/${x.origin}`).join(' ')}) · uderzenie: próby ${strikeState.attempts ?? 0}`);
  assert(!!ds && n1.length === 1 && first?.origin === 'campaign' && first.targetBodyId === s.OX, 'T7a kampania odpala na ticku imperium (cel: pierwszy w kolejności)');
  assert(n2.length === 1 && n3.length === 1, 'T7b bez drugiej wysyłki: cooldown reguły, potem eskadra w drodze');
  assert(n4.length === 2 && n4.some(x => x.targetBodyId === s.CX && x.origin === 'campaign'), 'T7c po zamknięciu eskadry — następny cel kolejki');
  assert(fired.filter(e => e.ruleId === 'campaign_strike').length === 2 && fired.every(e => e.ruleId !== 'strike_player_target')
    && !(strikeState.attempts > 0), 'T7d zwykłe uderzenie ani razu nie doszło do rzutu (guard: eskadra do wzięcia)');
}
{
  const w = boot();
  campaignScene(w);
  const lost = aiColony(w);
  war(w);
  at(w, 0);
  capture(w, lost);
  escorts(w, 3);
  const flag = GAME_CONFIG.FEATURES.reactionDirector;
  GAME_CONFIG.FEATURES.reactionDirector = true;
  const ds = director(w, ['strike_player_target', 'retake_lost_colony', 'campaign_strike']);
  at(w, 1.1);
  ds?.tickEmpire?.(w.emp, w.K.empireRegistry.get(w.emp));
  GAME_CONFIG.FEATURES.reactionDirector = flag;
  const list = w.sq?.listSquadrons?.(w.emp) ?? [];
  assert(!!ds && list.length === 1 && list[0].origin === 'retake' && list[0].targetBodyId === lost && evs(w, 'director:campaignLaunched').length === 0,
    'T7e odbicie i kampania w tym samym ticku — jedna eskadra, odbicie (`origin: \'retake\'`)');
}

// ═══ T8 — odczyt, lokator, audyt ═════════════════════════════════════════════
header('T8  odczyt konsoli, lokator, audyt');
{
  const w = boot();
  campaignScene(w);
  war(w);
  at(w, 1);
  escorts(w, 3);
  const table = console.table;
  console.table = () => {};
  let rows = [];
  try { rows = SWP?.printSquadronNeeds?.(w.K) ?? []; } finally { console.table = table; }
  const camp = rows.filter(r => r.imperium === w.emp && r.rodzaj === 'kampania');
  assert(camp.length === 6 && camp[0].werdykt === 'start' && camp.every(r => r.potrzebne >= 1), 'T8a `sbTuning().eskadra`: wiersze `kampania` w kolejności, z werdyktem');
  w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  const v2 = (w.cp?.campaignNeeds?.(w.emp) ?? []).map(r => r.verdict);
  assert(v2.length === 6 && v2[0] === 'czeka_cooldown' && v2.slice(1, 5).every(v => v === 'eskadra_w_drodze') && v2[5] === 'czeka_capital_last',
    'T8b po wysyłce: cel `czeka_cooldown`, reszta `eskadra_w_drodze`, stolica `czeka_capital_last`');
  const gs = src('../../scenes/GameScene.js');
  assert(/window\.KOSMOS\.directorCampaign\s*=\s*this\.directorOffensive\.campaign\s*\?\?\s*null/.test(gs), 'T8c lokator `KOSMOS.directorCampaign` w GameScene');
  const dl = src('../../core/DebugLog.js');
  const tracked = dl.slice(dl.indexOf('TRACKED_EVENTS'), dl.indexOf('class DebugLog'));
  assert(/'director:campaignLaunched'/.test(tracked) && /'director:campaignRefused'/.test(tracked) && /'director:retakeLaunched'/.test(tracked),
    'T8d zdarzenia kampanii w `DebugLog.TRACKED_EVENTS` (metoda: odbijanie widoczne)');
}

// ═══ T9 — pochodzenie eskadry ═════════════════════════════════════════════════
header('T9  pochodzenie eskadry w rekordzie');
{
  const w = boot();
  const s = campaignScene(w);
  war(w);
  at(w, 1);
  const es = escorts(w, 1);
  const r = w.sq?.launchSquadron?.(w.emp, s.OX, es.map(v => v.id));
  const rec = w.sq?.getSquadron?.(r?.squadronId);
  assert(r?.ok === true && rec && rec.origin === null, 'T9 dźwignia bez opcji — `origin: null` (rekord eskadry ma pole pochodzenia)');
}

// ═══ T10 — stolica gracza ostatnia ════════════════════════════════════════════
header('T10 stolica gracza ostatnia (SB84)');
{
  const w = boot();
  const OH = playerBody(w, 'sys_home', 'outpost');
  const CH = playerBody(w, 'sys_home', 'colony');
  const H = w.K.homePlanet.id;
  war(w);
  at(w, 1);
  escorts(w, 3);
  const c0 = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === H);
  const p0 = w.cp?.planCampaign?.(w.emp);
  const r1 = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  const r2 = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  const p2 = w.cp?.planCampaign?.(w.emp);
  const r3 = w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  const onH = (w.sq?.listSquadrons?.(w.emp) ?? []).filter(s => s.targetBodyId === H).length;
  console.log(`     stolica ${c0?.wait} · plan ${p0?.target?.body?.id} · wysyłki ${r1?.targetBodyId}, ${r2?.targetBodyId} · potem ${p2?.kind} / ${JSON.stringify(r3)}`);
  assert(!!OH && !!CH && c0?.wait === 'capital_last' && c0.eligible === false && p0?.target?.body?.id === OH,
    'T10a stolica czeka (`capital_last`), plan bierze placówkę jej układu');
  assert(r1?.targetBodyId === OH && r2?.targetBodyId === CH, 'T10b kolejne wysyłki: placówka, kolonia');
  assert(p2?.kind === 'none' && r3?.launched === 0 && r3.reason === 'no_target' && onH === 0,
    'T10c pozostałe ciała w cooldownie — brak celu, stolica NIE jest celem');
  quiet(() => { w.K.colonyManager.transferColony(OH, w.emp, 'invasion'); w.K.colonyManager.transferColony(CH, w.emp, 'invasion'); });
  const c3 = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === H);
  const p3 = w.cp?.planCampaign?.(w.emp);
  assert(c3?.wait === null && c3.eligible === true && p3?.kind === 'start' && p3.target?.body?.id === H,
    'T10d po upadku pozostałych ciał układu — stolica jest celem');
}
{
  const w = boot();
  const OX = playerBody(w, w.capSys, 'outpost');
  const H = w.K.homePlanet.id;
  war(w);
  at(w, 1);
  escorts(w, 3);
  const c0 = (w.cp?.campaignCandidates?.(w.emp) ?? []).find(c => c.body.id === H);
  w.cp?.launchCampaign?.({ empireId: w.emp, year: 1 });
  const p1 = w.cp?.planCampaign?.(w.emp);
  assert(!!OX && c0?.wait === null && p1?.kind === 'start' && p1.target?.body?.id === H,
    'T10e ciało gracza w INNYM układzie nie blokuje stolicy (po próbie na nie — stolica jest celem)');
}

console.log(`\n═══ sb4_campaign_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
