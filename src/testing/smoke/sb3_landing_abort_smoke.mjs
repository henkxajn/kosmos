// ═══════════════════════════════════════════════════════════════════════════════
// sb3_landing_abort_smoke — KEEPER desantu na CEL eskadry i przerwania eskadry bez eskorty
// (AI STRIKES BACK S3, sesja 2 — decyzje SB64, SB66; Finding 435). Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2, §6.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA:
//   SB64 — desant z bitwy kadłubów lądował „najpierw na domu” (`_onVesselGroupVictory`: `isHomePlanet` ?? pierwsza kolonia
//     gracza w układzie), nawet gdy eskadra wygrała orbitę nad INNYM ciałem. Teraz ląduje na ciele bitwy (cel eskadry);
//     ciało bitwy, które nie jest kolonią gracza — brak desantu (`target_not_player_colony`).
//   SB66 — eskadra, która w drodze straciła CAŁĄ eskortę, leciała dalej samym transportowcem (grupa wydawała odcinek
//     jedynemu żywemu członkowi), wygrywała przewagą HP z obroną symboliczną kolonii i lądowała (Finding 435). Teraz
//     eskadra jest przerywana: rekord `aborted`, transportowiec zawraca do stolicy istniejącym odwołaniem, desantu nie ma.
//
// ⚠ Harness jak `sb3_squadron_smoke` (prawdziwy `GameCore`, MOS, OrderService, EnemyAttackHandler; pula i garnizon
//   WYŁĄCZONE w setupie — wzór R-B2b). Czas — `gameTime` + `_updatePositions`, bitwa — `_resolveBatchedBattle` wprost.
// ⚠ Moduły importowane przestrzenią nazw z `catch` — na kodzie sprzed S3/2 suita degraduje do czerwieni, nie wywraca się.
//
// PINY:
//   T1  SB64: eskadra na DRUGĄ kolonię gracza w układzie domu — fala ląduje na NIEJ, dom bez jednostek AI; rekord
//       `landedOn` = cel (KONTROLA T1c: eskadra na dom — ląduje na domu, zielona po obu stronach)
//   T2  SB64: bitwa nad ciałem bez kolonii gracza — brak desantu (`target_not_player_colony`), fala na pokładzie
//   T3  SB66: eskorta zestrzelona w układzie celu — rekord `aborted`, transportowiec zatrzymany i w drodze do stolicy,
//       przy celu NIE ma bitwy ani desantu (KONTROLA T3c: ta sama scena bez strat eskorty — desant)
//   T4  SB66: eskorta stracona, gdy transportowiec jest w skoku — composite zdjęty od razu, po przylocie brak odcinka do
//       celu, na ticku — powrót
//   T5  obrona w głąb: zrzutowiec eskadry przerwanej nie zrzuca (`squadron_not_landing`); para — eskadra w drodze ląduje
//   T6  źródło: `_onVesselGroupVictory` dalej woła `this._landCargo(empireId, target.planetId, droppers)`; system eskadr
//       subskrybuje `time:tick`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  const emp = K.empireRegistry.listAll()[0].id;
  const cap = K.directorProduction.capitalOf(emp);
  const w = { core, K, vm: K.vesselManager, gum: K.groundUnitManager, inv: K.invasionSystem, sq: K.strikeSquadronSystem,
              emp, cap, home: K.homePlanet, ev: [] };
  for (const n of ['invasion:blocked', 'invasion:troopsLanded', 'battle:resolved', 'vessel:arrived']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
/** Druga kolonia gracza w układzie domu, z siatką (bez siatki desant odmawia `no_grid` — Finding 55). */
function secondColony(w) {
  const sys = EntityManager.get(w.home.id)?.systemId;
  const bodies = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? []);
  const body = bodies.find(b => b.id !== w.home.id && !w.K.colonyManager.getColony(b.id));
  if (!body) return null;
  const col = quiet(() => w.K.colonyManager.createColony(body.id, {}, 4, w.K.timeSystem.gameTime ?? 0));
  if (col && !col.grid) col.grid = PlanetMapGenerator.generate(body, false);
  return col ? { col, body } : null;
}
/** Ciało w układzie domu bez żadnej kolonii. */
function emptyBody(w, skip = []) {
  const sys = EntityManager.get(w.home.id)?.systemId;
  const bodies = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? []);
  return bodies.find(b => b.id !== w.home.id && !skip.includes(b.id) && !w.K.colonyManager.getColony(b.id)) ?? null;
}
function escorts(w, n = 2) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap.planetId }).vessel);
}
function launch(w, targetId, es = escorts(w)) {
  const r = w.sq?.launchSquadron?.(w.emp, targetId, es.map(v => v.id)) ?? null;
  return { r, es, tr: r?.transportId ? w.vm.getVessel(r.transportId) : null };
}
/** Skok całej grupy (czas do NAJPÓŹNIEJSZEGO przylotu członka). */
function jump(w, members) {
  const T = Math.max(...members.map(v => v?.mission?.type === 'interstellar_jump' ? (v.mission.arrivalYear ?? 0) : 0));
  w.K.timeSystem.gameTime = T + 0.001;
  w.vm._updatePositions(0.01);
}
/** Odcinek w układzie celu (czas do chwili przylotu grupy). */
function approach(w, tr) {
  const T = tr?.mission?.arrivalYear ?? 0;
  w.K.timeSystem.gameTime = T + 0.001;
  w.vm._updatePositions(0.01);
}
function battle(w, planetId) {
  const p = w.K.enemyAttackHandler._pendingBattles.get(planetId);
  if (p?.timerId) clearTimeout(p.timerId);
  quiet(() => w.K.enemyAttackHandler._resolveBatchedBattle(planetId));
}
const tick = () => EventBus.emit('time:tick', { deltaYears: 0, civDeltaYears: 0 });
const wreck = (w, v) => quiet(() => w.K.enemyAttackHandler._turnIntoWreck(v, { x: v.position.x + 3, y: v.position.y }, w.K.timeSystem.gameTime));
const aiOn = (w, pid) => w.gum.getUnitsOnPlanet(pid).filter(u => u.owner === w.emp).map(u => u.id).sort();
const homeBound = (w, v) => {
  const capSys = EntityManager.get(w.cap.planetId)?.systemId;
  return (v?.pendingOrder?.kind === 'recall' && v.pendingOrder.targetSystemId === capSys)
    || (v?.mission?.type === 'interstellar_jump' && v.mission.toSystemId === capSys)
    || (v?.movementOrder?.targetBodyId === w.cap.planetId);
};

// ═══ T1 — desant na cel eskadry ════════════════════════════════════════════════
header('T1  SB64: fala ląduje na CELU eskadry (druga kolonia gracza w układzie), nie na domu');
{
  const w = boot();
  const sec = secondColony(w);
  const { r, tr, es } = launch(w, sec?.body?.id);
  const aboard = [...(tr?.groundUnits ?? [])].sort();
  jump(w, [...es, tr]);
  approach(w, tr);
  battle(w, sec?.body?.id);
  const onSec = aiOn(w, sec?.body?.id), onHome = aiOn(w, w.home.id);
  const rec = w.sq?.getSquadron?.(r?.squadronId);
  console.log(`     cel ${sec?.body?.id} · na pokładzie ${aboard.join(',')} · na celu ${onSec.join(',')} · na domu ${onHome.join(',')} · blokady ${evs(w, 'invasion:blocked').map(b => b.reason).join(',')}`);
  assert(!!sec && r?.ok === true && aboard.length > 0 && evs(w, 'battle:resolved').some(b => b.result?.winner === 'A'),
    'T1-0 druga kolonia gracza w układzie domu; eskadra wysłana na nią z falą, orbita wygrana');
  assert(aboard.length > 0 && same(onSec, aboard) && onHome.length === 0, 'T1a fala ląduje na CELU (druga kolonia), dom bez jednostek AI');
  assert(rec?.stage === 'landed' && rec.landedOn === sec?.body?.id, 'T1b rekord: `landed`, `landedOn` = cel eskadry');
}
{
  const w = boot();
  secondColony(w);
  const { r, tr, es } = launch(w, w.home.id);
  const aboard = [...(tr?.groundUnits ?? [])].sort();
  jump(w, [...es, tr]);
  approach(w, tr);
  battle(w, w.home.id);
  assert(r?.ok === true && aboard.length > 0 && same(aiOn(w, w.home.id), aboard),
    'T1c KONTROLA: eskadra na dom (przy drugiej kolonii w układzie) — fala ląduje na domu');
}

// ═══ T2 — ciało bitwy bez kolonii gracza ═══════════════════════════════════════
header('T2  SB64: bitwa nad ciałem bez kolonii gracza — brak desantu');
{
  const w = boot();
  const body = emptyBody(w);
  const { r, tr, es } = launch(w, body?.id);
  const aboard = [...(tr?.groundUnits ?? [])].sort();
  jump(w, [...es, tr]);
  approach(w, tr);
  battle(w, body?.id);
  const won = evs(w, 'battle:resolved').some(b => b.result?.winner === 'A');
  console.log(`     cel ${body?.id} · bitwa wygrana ${won} · blokady ${evs(w, 'invasion:blocked').map(b => b.reason).join(',')} · na domu ${aiOn(w, w.home.id).length}`);
  assert(!!body && r?.ok === true && aboard.length > 0 && won, 'T2-0 eskadra na ciało bez kolonii, orbita wygrana');
  assert(evs(w, 'invasion:troopsLanded').length === 0 && aiOn(w, w.home.id).length === 0 && same([...(tr?.groundUnits ?? [])].sort(), aboard),
    'T2a nic nie ląduje (ani na domu), fala zostaje na pokładzie');
  assert(evs(w, 'invasion:blocked').some(b => b.reason === 'target_not_player_colony' && b.planetId === body?.id),
    'T2b odmowa `target_not_player_colony` z ciałem bitwy');
}

// ═══ T3 — eskorta stracona w układzie celu ════════════════════════════════════
header('T3  SB66: cała eskorta stracona w układzie celu — eskadra przerwana, transportowiec wraca');
{
  const w = boot();
  const { r, tr, es } = launch(w, w.home.id);
  const aboard = [...(tr?.groundUnits ?? [])].sort();
  jump(w, [...es, tr]);
  const legBefore = tr?.mission?.type;
  const legArrival = tr?.mission?.arrivalYear ?? null;   // chwila, w której transportowiec doleciałby do celu
  for (const e of es) wreck(w, e);
  tick();
  const rec = w.sq?.getSquadron?.(r?.squadronId);
  const heading = homeBound(w, tr);
  console.log(`     odcinek przed stratą: ${legBefore} · rekord ${rec?.stage}/${rec?.abortReason} · transportowiec ${tr?.position?.state}, misja ${tr?.mission?.type}, rozkaz ${tr?.movementOrder?.type ?? '-'}, composite ${tr?.pendingOrder?.kind ?? '-'}`);
  assert(r?.ok === true && legBefore === 'attack' && Number.isFinite(legArrival) && es.every(e => e.isWreck) && !tr?.isWreck,
    'T3-0 eskadra na odcinku do celu (`attack`), obie eskorty wrakami, transportowiec żywy');
  assert(rec?.stage === 'aborted' && rec.abortReason === 'escorts_lost' && rec.homeOrdered === true,
    'T3a rekord `aborted` (`escorts_lost`), rozkaz powrotu wydany');
  assert(heading && tr?.mission?.type !== 'attack', 'T3b transportowiec zatrzymany i w drodze do stolicy (odwołanie), bez misji ataku');
  // czas do chwili, w której transportowiec doleciałby do celu (odcinek sprzed straty eskorty)
  w.K.timeSystem.gameTime = (legArrival ?? 0) + 0.001;
  w.vm._updatePositions(0.01);
  battle(w, w.home.id);
  assert(evs(w, 'battle:resolved').length === 0 && evs(w, 'invasion:troopsLanded').length === 0 && aiOn(w, w.home.id).length === 0,
    'T3c przy celu brak bitwy i desantu — sam transportowiec nie wygrywa i nie ląduje');
  assert(same([...(tr?.groundUnits ?? [])].sort(), aboard), 'T3d fala zostaje na pokładzie');
}
{
  const w = boot();
  const { r, tr, es } = launch(w, w.home.id);
  const aboard = [...(tr?.groundUnits ?? [])].sort();
  jump(w, [...es, tr]);
  tick();
  approach(w, tr);
  battle(w, w.home.id);
  assert(r?.ok === true && aboard.length > 0 && same(aiOn(w, w.home.id), aboard) && w.sq?.getSquadron?.(r?.squadronId)?.stage === 'landed',
    'T3e KONTROLA: ta sama scena bez strat eskorty — fala ląduje, rekord `landed`');
}

// ═══ T4 — eskorta stracona, transportowiec w skoku ═════════════════════════════
header('T4  SB66: eskorta stracona, gdy transportowiec jest w skoku');
{
  const w = boot();
  const { r, tr, es } = launch(w, w.home.id);
  const inWarp = tr?.mission?.phase === 'warp_transit';
  for (const e of es) wreck(w, e);
  const rec0 = w.sq?.getSquadron?.(r?.squadronId);
  assert(r?.ok === true && inWarp && rec0?.stage === 'aborted' && tr?.pendingOrder == null && rec0?.homeOrdered === false,
    'T4a transportowiec w skoku: rekord `aborted`, composite zdjęty od razu, rozkaz powrotu czeka na koniec skoku');
  jump(w, [tr]);
  const arrivedIn = tr?.systemId;
  const noLeg = tr?.mission?.type === 'interstellar_jump' && tr.mission.phase === 'in_system' && !tr?.movementOrder;
  tick();
  const rec1 = w.sq?.getSquadron?.(r?.squadronId);
  assert(arrivedIn === EntityManager.get(w.home.id)?.systemId && noLeg, 'T4b po przylocie ze skoku — brak odcinka do celu');
  assert(rec1?.homeOrdered === true && homeBound(w, tr), 'T4c na ticku — rozkaz powrotu do stolicy');
}

// ═══ T5 — obrona w głąb ════════════════════════════════════════════════════════
header('T5  zrzutowiec eskadry przerwanej nie zrzuca; para — eskadra w drodze ląduje');
{
  const w = boot();
  quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
  const { r, tr, es } = launch(w, w.home.id);
  const aboard = [...(tr?.groundUnits ?? [])].sort();
  const sys = EntityManager.get(w.home.id)?.systemId;
  // kadłuby „na orbicie celu” po wygranej (stan EnemyAttackHandler), kontroler orbity — imperium
  for (const v of [...es, tr]) { v.pendingOrder = null; v.mission = null; v.systemId = sys; v.position.state = 'orbiting'; v.position.dockedAt = w.home.id; }
  w.K.warSystem?._updateOrbitalDominance?.(sys, w.emp);
  const result = { winner: 'A', location: { systemId: sys, planetId: w.home.id, point: null },
    participantA: { type: 'vessel_group', empireId: w.emp, vesselIds: [...es.map(v => v.id), tr?.id] },
    participantB: { type: 'player', empireId: 'player', systemId: sys } };
  w.sq?._setStage?.(r?.squadronId, 'aborted', { abortReason: 'keeper' });
  w.inv._onVesselGroupVictory({ result });
  assert(r?.ok === true && aboard.length > 0 && evs(w, 'invasion:troopsLanded').length === 0
    && evs(w, 'invasion:blocked').some(b => b.reason === 'squadron_not_landing'), 'T5a eskadra przerwana — brak desantu (`squadron_not_landing`)');
  w.sq?._setStage?.(r?.squadronId, 'launched');
  w.inv._onVesselGroupVictory({ result });
  assert(evs(w, 'invasion:troopsLanded').length === 1 && same(aiOn(w, w.home.id), aboard), 'T5b para: eskadra w drodze (`launched`) — ląduje');
}

// ═══ T6 — źródło ═══════════════════════════════════════════════════════════════
header('T6  źródło');
{
  const inv = src('../../systems/InvasionSystem.js');
  const victory = inv.slice(inv.indexOf('  _onVesselGroupVictory({ result }) {'), inv.indexOf('  _onBattleResolved('));
  assert(/this\._landCargo\(empireId, target\.planetId, droppers\)/.test(victory) && /normalizeLocation\(result\.location\)\.planetId/.test(victory),
    'T6a `_onVesselGroupVictory`: ciało bitwy z `location.planetId`, desant przez `_landCargo(empireId, target.planetId, droppers)`');
  const sqs = src('../../systems/StrikeSquadronSystem.js');
  assert(/EventBus\.on\('time:tick', this\._onTick\)/.test(sqs) && /issueRecall\?\.\(v\.id, \{ homeSystemId, capitalBodyId: capitalId \}\)/.test(sqs),
    'T6b system eskadr: `time:tick` i powrót przez `OrderService.issueRecall`');
}

console.log(`\n═══ sb3_landing_abort_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
