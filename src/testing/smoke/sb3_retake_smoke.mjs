// ═══════════════════════════════════════════════════════════════════════════════
// sb3_retake_smoke — KEEPER reguły odbijania utraconych kolonii (AI STRIKES BACK S3, sesja 2 — decyzja SB57).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: imperium AI nigdy nie odbijało ciała, które gracz mu zdobył (audyt fazy A, C5–C6). SB57: reguła Directora
//   `retake_lost_colony` (bez rzutu) wysyła eskadrę (`StrikeSquadronSystem.launchSquadron`) na ciało zdobyte przez gracza
//   w BIEŻĄCEJ wojnie, gdy minęło `retakeDelayYears` od straty i `retakeCooldownYears` od ostatniej próby na to ciało,
//   a żadna eskadra imperium nie jest w drodze; najpierw utracona stolica, potem porządek planera garnizonu; eskorta =
//   `requiredSquadron` (SB56) wobec obrony celu; za mało — odmowa z powodem, bez spalenia cooldownu celu.
//
// ⚠ Harness: prawdziwy `GameCore` (imperia, kolonie, `WarSystem` z księgą zdobyczy, `DirectorProduction.capitalOf`), MOS,
//   OrderService, EnemyAttackHandler, `DirectorOffensive` z `registerOffensiveBehaviors` (rejestruje też odbijanie);
//   pula i garnizon WYŁĄCZONE (wzór R-B2b). Zdobycie przez gracza — produkcyjne `ColonyManager.captureColonyForPlayer`.
// ⚠ Moduły importowane przestrzenią nazw z `catch` — na kodzie sprzed S3/2 suita degraduje do czerwieni.
//
// PINY:
//   T1  katalog: `retake_lost_colony` — sonda `retakeTargets`, guardy wojny i „brak eskadry w drodze”, BEZ rzutu,
//       `delay: 0`, cooldown reguły 1,0; klucze `retakeDelayYears` 1 / `retakeCooldownYears` 5
//   T2  utracona stolica zapisana w chwili usunięcia z imperium (`getLostCapitals`); kolonia nie-stolica — nie
//       (KONTROLA T2c)
//   T3  czas: przed `retakeDelayYears` — czeka (`delay`), potem odbijalne; po wysłanej eskadrze — czeka (`cooldown`)
//   T4  kolejność: utracona stolica najpierw, potem pełna kolonia przed placówką (planer garnizonu)
//   T5  wysyłka: eskadra na utraconą stolicę formuje się przy NOWEJ stolicy (`capitalOf`), eskorta = `requiredSquadron`
//   T6  za mało okrętów — odmowa `insufficient_squadron` z liczbami, ŻADNEJ eskadry (cooldown celu niespalony); po
//       dołożeniu okrętów — wysyłka w tym samym roku
//   T7  bez stolicy (imperium bez pełnej kolonii) — odmowa `no_capital`; poza wojną — brak kandydatów
//   T8  silnik reguł (`DirectorSystem`, prawdziwy wpis katalogu): reguła odpala na ticku imperium, wysyła eskadrę, potem
//       cooldown reguły i guard „eskadra w drodze” — bez drugiej wysyłki
//   T9  po odbiciu (ścieżka przejęcia AI `transferColony`) — księga: wpis gracz → imperium, ciało nie jest kandydatem
//   T10 audyt: `director:retakeLaunched`, `director:retakeRefused`, `empire:capitalLost` w `DebugLog.TRACKED_EVENTS`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';
import { DirectorSystem } from '../../systems/director/DirectorSystem.js';
import { readFileSync } from 'node:fs';

const RULES = await import('../../data/DirectorRuleData.js').catch(() => null);
const DATA  = await import('../../data/StrikesBackData.js').catch(() => null);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  K.orderService = new OrderService();
  K.enemyAttackHandler = new EnemyAttackHandler();
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  if (K.fleetPoolSystem) K.fleetPoolSystem.enabled = false;
  const off = new DirectorOffensive();
  registerOffensiveBehaviors(off, { allowOverride: true });
  K.directorOffensive = off;
  K.directorRetake = off.retake ?? null;
  const emp = K.empireRegistry.listAll()[0].id;
  const cap0 = K.directorProduction.capitalOf(emp);
  const w = { core, K, vm: K.vesselManager, sq: K.strikeSquadronSystem, rt: K.directorRetake, emp, cap0, ev: [] };
  for (const n of ['director:retakeLaunched', 'director:retakeRefused', 'empire:capitalLost', 'director:ruleFired']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
const war = (w) => quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
const capture = (w, id) => quiet(() => w.K.colonyManager.captureColonyForPlayer(id, 'ground_invasion'));
const at = (w, y) => { w.K.timeSystem.gameTime = y; };
/** Druga pełna kolonia imperium (w układzie stolicy), bez budynków obrony; zwraca planetId. */
function aiColony(w, { outpost = false } = {}) {
  const sys = EntityManager.get(w.cap0.planetId)?.systemId;
  const bodies = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? []);
  const body = bodies.find(b => !w.K.colonyManager.getColony(b.id));
  if (!body) return null;
  quiet(() => {
    if (outpost) w.K.colonyManager.createOutpost?.(body.id, w.K.timeSystem.gameTime ?? 0, w.emp);
    else w.K.colonyManager.createColony(body.id, {}, 8, w.K.timeSystem.gameTime ?? 0, w.emp);
  });
  const col = w.K.colonyManager.getColony(body.id);
  if (!col) return null;
  col.ownerEmpireId = w.emp;
  if (outpost) col.isOutpost = true;
  w.K.empireRegistry.addColony(w.emp, body.id);
  return body.id;
}
/** Zdjęcie budynków obrony z kolonii (obrona symboliczna — jak przy pierwszym przejęciu przez gracza). */
function stripDefense(w, id) {
  const a = w.K.colonyManager.getColony(id)?.buildingSystem?._active;
  if (!a) return;
  for (const [k, e] of [...a]) if (e?.building?.id === 'defense_tower' || e?.building?.id === 'defense_grid') a.delete(k);
}
function escorts(w, planetId, n) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId }).vessel);
}

// ═══ T1 — katalog ═════════════════════════════════════════════════════════════
header('T1  wpis katalogu i klucze');
{
  const r = RULES?.DIRECTOR_RULES?.retake_lost_colony;
  assert(r?.trigger?.kind === 'poll' && r.trigger.probe === 'retakeTargets' && r.trigger.gte === 1, 'T1a wyzwalacz: sonda `retakeTargets` ≥ 1');
  assert(JSON.stringify(r?.guard) === JSON.stringify(['empireAtWarWithPlayer', 'empireHasNoSquadronUnderway']), 'T1b guardy: wojna z graczem, brak eskadry w drodze');
  assert(r && !r.roll && !r.personalityMod && r.delay === 0 && r.cooldown?.years === 1.0 && r.response?.action === 'launchRetake',
    'T1c bez rzutu (i bez modyfikatora osobowości), `delay: 0`, cooldown reguły 1,0, akcja `launchRetake`');
  const T = DATA?.SB_TUNING ?? {};
  assert(T.retakeDelayYears?.default === 1 && T.retakeCooldownYears?.default === 5, 'T1d klucze: `retakeDelayYears` 1, `retakeCooldownYears` 5');
}

// ═══ T2 — utracona stolica ════════════════════════════════════════════════════
header('T2  utracona stolica zapisana w chwili usunięcia z imperium');
{
  const w = boot();
  const second = aiColony(w);
  war(w);
  at(w, 10);
  capture(w, w.cap0.planetId);
  const lost = w.K.empireRegistry.getLostCapitals?.(w.emp) ?? [];
  const newCap = w.K.directorProduction.capitalOf(w.emp)?.planetId;
  console.log(`     stolica ${w.cap0.planetId} → zdobyta; utracone ${JSON.stringify(lost)}; nowa stolica ${newCap}`);
  assert(!!second && lost.length === 1 && lost[0].bodyId === w.cap0.planetId && lost[0].year === 10, 'T2a `getLostCapitals`: stolica z rokiem utraty');
  assert(evs(w, 'empire:capitalLost').length === 1 && newCap === second, 'T2b zdarzenie `empire:capitalLost`; `capitalOf` wskazuje następną pełną kolonię');
}
{
  const w = boot();
  const second = aiColony(w);
  war(w);
  capture(w, second);
  assert(!!second && (w.K.empireRegistry.getLostCapitals?.(w.emp) ?? []).length === 0 && evs(w, 'empire:capitalLost').length === 0,
    'T2c KONTROLA: zdobyta kolonia NIE-stolica — brak zapisu utraconej stolicy');
}

// ═══ T3 — czas ════════════════════════════════════════════════════════════════
header('T3  czas od straty i od ostatniej próby');
{
  const w = boot();
  const second = aiColony(w);
  stripDefense(w, w.cap0.planetId);
  war(w);
  at(w, 10);
  capture(w, w.cap0.planetId);
  at(w, 10.5);
  const c1 = w.rt?.retakeCandidates?.(w.emp) ?? [];
  at(w, 11.01);
  const c2 = w.rt?.retakeCandidates?.(w.emp) ?? [];
  escorts(w, second, 3);
  const r = w.rt?.launchRetake?.({ empireId: w.emp, year: 11.01 });
  const c3 = w.rt?.retakeCandidates?.(w.emp) ?? [];
  console.log(`     10,5: ${c1.map(c => c.wait).join(',')} · 11,01: ${c2.map(c => c.eligible).join(',')} · po wysyłce: ${c3.map(c => c.wait).join(',')}`);
  assert(c1.length === 1 && c1[0].body.id === w.cap0.planetId && c1[0].wait === 'delay' && (w.rt?.countRetakeTargets?.(w.emp) ?? -1) >= 0,
    'T3a pół roku po stracie — kandydat czeka (`delay`)');
  assert(c2.length === 1 && c2[0].eligible === true, 'T3b po `retakeDelayYears` — odbijalny');
  assert(r?.launched === 1 && c3.length === 1 && c3[0].wait === 'cooldown' && c3[0].lastAttemptYear === 11.01,
    'T3c po wysłanej eskadrze — ciało czeka (`cooldown`, ostatnia próba = rok wysyłki)');
}

// ═══ T4 — kolejność ═══════════════════════════════════════════════════════════
header('T4  kolejność celów: utracona stolica, potem planer garnizonu');
{
  const w = boot();
  const full = aiColony(w);
  const full2 = aiColony(w);
  const outp = aiColony(w, { outpost: true });
  war(w);
  at(w, 10);
  for (const id of [outp, full, w.cap0.planetId]) if (id) capture(w, id);
  at(w, 12);
  const order = (w.rt?.retakeCandidates?.(w.emp) ?? []).map(c => c.body.id);
  console.log(`     kolejność ${order.join(' → ')} · stolica ${w.cap0.planetId}, pełna ${full}, placówka ${outp} (stolica imperium teraz ${w.K.directorProduction.capitalOf(w.emp)?.planetId}, ${full2})`);
  assert(!!full && !!full2 && !!outp && order.length === 3, 'T4-0 trzy ciała zdobyte (stolica, pełna kolonia, placówka); imperium ma jeszcze pełną kolonię');
  assert(order[0] === w.cap0.planetId && order[1] === full && order[2] === outp, 'T4a utracona stolica, potem pełna kolonia, potem placówka');
}

// ═══ T5 — wysyłka ═════════════════════════════════════════════════════════════
header('T5  eskadra na utraconą stolicę formuje się przy nowej stolicy');
{
  const w = boot();
  const second = aiColony(w);
  stripDefense(w, w.cap0.planetId);
  war(w);
  at(w, 10);
  capture(w, w.cap0.planetId);
  at(w, 11.5);
  const target = (w.rt?.retakeCandidates?.(w.emp) ?? [])[0];
  const pool0 = escorts(w, second, 3);
  const need = w.K.directorOffensive?.requiredSquadron?.(target, pool0)?.needed;
  const r = w.rt?.launchRetake?.({ empireId: w.emp, year: 11.5 });
  const rec = w.sq?.getSquadron?.(r?.squadronId);
  const tr = w.vm.getVessel(rec?.transportId ?? '');
  console.log(`     potrzebne ${need} · wynik ${JSON.stringify(r)} · transportowiec przy ${tr?.colonyId} · eskorta ${rec?.escortIds?.length}`);
  assert(r?.launched === 1 && rec?.targetBodyId === w.cap0.planetId && rec.capitalId === second, 'T5a eskadra na utraconą stolicę; rekord: stolica eskadry = nowa stolica');
  assert(Number.isFinite(need) && rec?.escortIds?.length === need && r.needed === need, 'T5b eskorta = `requiredSquadron` wobec obrony celu');
  assert(evs(w, 'director:retakeLaunched').some(e => e.squadronId === r?.squadronId && e.lostCapital === true), 'T5c `director:retakeLaunched` (cel = utracona stolica)');
}

// ═══ T6 — za mało okrętów ═════════════════════════════════════════════════════
header('T6  za mało okrętów — odmowa bez spalenia cooldownu celu');
{
  const w = boot();
  const second = aiColony(w);
  war(w);
  at(w, 10);
  capture(w, w.cap0.planetId);
  at(w, 11.5);
  const target = (w.rt?.retakeCandidates?.(w.emp) ?? [])[0];
  const need = w.K.directorOffensive?.requiredSquadron?.(target, [])?.needed ?? 99;
  const capKey = DATA?.SB_TUNING?.squadronMaxShips?.default ?? 3;
  const room = Math.min(need, capKey);
  const few = room > 1 ? escorts(w, second, room - 1) : [];
  const r1 = w.rt?.launchRetake?.({ empireId: w.emp, year: 11.5 });
  const sq1 = (w.sq?.listSquadrons?.(w.emp) ?? []).length;
  const after = (w.rt?.retakeCandidates?.(w.emp) ?? [])[0];
  console.log(`     potrzebne ${need} (sufit ${capKey}) · pula ${few.length} · ${JSON.stringify(r1)} · eskadr ${sq1}`);
  assert(need >= 1 && need <= capKey, `T6-0 obrona celu w zasięgu sufitu (potrzebne ${need} ≤ ${capKey}), pula o jeden mniejsza`);
  assert(r1?.launched === 0 && r1.reason === 'insufficient_squadron' && r1.needed === need && r1.available === few.length && sq1 === 0,
    'T6a odmowa `insufficient_squadron` z liczbami, żadna eskadra nie powstała');
  assert(after?.eligible === true && after.lastAttemptYear === null, 'T6b cooldown celu niespalony (ciało dalej odbijalne)');
  escorts(w, second, need - few.length);
  const r2 = w.rt?.launchRetake?.({ empireId: w.emp, year: 11.5 });
  assert(r2?.launched === 1, 'T6c po dołożeniu okrętów — wysyłka w tym samym roku');
  assert(evs(w, 'director:retakeRefused').length >= 1, 'T6d odmowa w audycie (`director:retakeRefused`)');
}

// ═══ T7 — bez stolicy / bez wojny ══════════════════════════════════════════════
header('T7  bez stolicy — `no_capital`; bez wojny — brak kandydatów');
{
  const w = boot();
  war(w);
  at(w, 10);
  capture(w, w.cap0.planetId);
  at(w, 12);
  const noCap = !w.K.directorProduction.capitalOf(w.emp);
  const r = w.rt?.launchRetake?.({ empireId: w.emp, year: 12 });
  assert(noCap && r?.launched === 0 && r.reason === 'no_capital', 'T7a imperium bez pełnej kolonii — odmowa `no_capital`');
}
{
  const w = boot();
  const second = aiColony(w);
  at(w, 10);
  capture(w, w.cap0.planetId);                // przed wojną — brak wpisu w księdze
  war(w);
  capture(w, second);                         // w wojnie — wpis w księdze (świadek)
  at(w, 12);
  const ids = (w.rt?.retakeCandidates?.(w.emp) ?? []).map(c => c.body.id);
  assert(!!second && ids.length === 1 && ids[0] === second && !ids.includes(w.cap0.planetId),
    'T7b ciało zdobyte PRZED wojną nie jest kandydatem; zdobyte w bieżącej wojnie — jest (świadek)');
}

// ═══ T8 — silnik reguł ════════════════════════════════════════════════════════
header('T8  reguła na prawdziwym silniku (`DirectorSystem`, wpis z katalogu)');
{
  const w = boot();
  const second = aiColony(w);
  stripDefense(w, w.cap0.planetId);
  war(w);
  at(w, 10);
  capture(w, w.cap0.planetId);
  escorts(w, second, 3);
  const flag = GAME_CONFIG.FEATURES.reactionDirector;
  GAME_CONFIG.FEATURES.reactionDirector = true;
  let ds = null;
  try { ds = RULES?.DIRECTOR_RULES?.retake_lost_colony ? new DirectorSystem({ catalog: { retake_lost_colony: RULES.DIRECTOR_RULES.retake_lost_colony } }) : null; } catch { ds = null; }
  const emp = w.K.empireRegistry.get(w.emp);
  const fired = (y) => { at(w, y); ds?.tickEmpire?.(w.emp, emp); return (w.sq?.listSquadrons?.(w.emp) ?? []).length; };
  const n0 = fired(10.5);                     // przed `retakeDelayYears`
  const n1 = fired(11.05);                    // pierwszy tik po — wysyłka
  const n2 = fired(11.2);                     // eskadra w drodze, cooldown reguły
  const n3 = fired(12.2);                     // cooldown reguły minął, eskadra dalej w drodze — guard
  GAME_CONFIG.FEATURES.reactionDirector = flag;
  console.log(`     eskadry po tikach: 10,5 → ${n0} · 11,05 → ${n1} · 11,2 → ${n2} · 12,2 → ${n3}`);
  assert(!!ds && n0 === 0 && n1 === 1, 'T8a reguła odpala na ticku imperium po `retakeDelayYears` i wysyła eskadrę');
  assert(n2 === 1 && n3 === 1, 'T8b potem bez drugiej wysyłki (cooldown reguły, guard „eskadra w drodze”)');
  assert(evs(w, 'director:ruleFired').filter(e => e.ruleId === 'retake_lost_colony').length === 1, 'T8c jedno odpalenie reguły (`director:ruleFired`)');
}

// ═══ T9 — po odbiciu ══════════════════════════════════════════════════════════
header('T9  ciało odbite ścieżką przejęcia AI — księga i kandydaci');
{
  const w = boot();
  aiColony(w);
  war(w);
  at(w, 10);
  capture(w, w.cap0.planetId);
  at(w, 13);
  const before = (w.rt?.retakeCandidates?.(w.emp) ?? []).map(c => c.body.id);
  quiet(() => w.K.colonyManager.transferColony(w.cap0.planetId, w.emp, 'invasion'));
  const warRec = w.K.warSystem.getWarWith(w.emp);
  const ledger = (w.K.warSystem.getCaptures(warRec?.id) ?? []).filter(e => e.bodyId === w.cap0.planetId);
  const lastE = ledger[ledger.length - 1];
  assert(ledger.length === 2 && lastE?.fromEmpireId === 'player' && lastE.toEmpireId === w.emp,
    'T9a KONTROLA (księga `WarSystem`, zielona po obu stronach): wpis gracz → imperium po odbiciu');
  assert(before.includes(w.cap0.planetId) && (w.rt?.retakeCandidates?.(w.emp) ?? []).length === 0,
    'T9b ciało przed odbiciem było kandydatem, po odbiciu nie jest');
  assert((w.K.empireRegistry.getLostCapitals?.(w.emp) ?? []).length === 1, 'T9c historia utraconej stolicy zostaje');
}

// ═══ T10 — audyt ══════════════════════════════════════════════════════════════
header('T10 audyt');
{
  const dl = src('../../core/DebugLog.js');
  const tracked = dl.slice(dl.indexOf('TRACKED_EVENTS'), dl.indexOf('class DebugLog'));
  assert(/'director:retakeLaunched'/.test(tracked) && /'director:retakeRefused'/.test(tracked) && /'empire:capitalLost'/.test(tracked)
    && /'squadron:launched'/.test(tracked), 'T10 zdarzenia odbijania śledzone (metoda: `squadron:launched` widoczne)');
}

console.log(`\n═══ sb3_retake_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
