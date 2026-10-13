// ═══════════════════════════════════════════════════════════════════════════════
// sb3_hold_return_smoke — KEEPER eskadry PO desancie i powrotu do stolicy
// (AI STRIKES BACK S3, sesja 2 — decyzje SB58 zmienione przez SB63; Finding 434). Rejestr: `AI_STRIKES_BACK_PLAN.md` §2, §6.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: po desancie odwołanie Directora (`DirectorRecall`) zabierało eskortę w ciągu miesiąca (M5: 0,0–1,1 mies.),
//   a nieuzbrojony transportowiec zostawał na orbicie celu na zawsze (434 — odwołanie i pule Directora wymagają
//   `hasWeapons`). SB63: eskorta i transportowiec TRZYMAJĄ orbitę celu, aż walka naziemna się rozstrzygnie (ciało zdobyte
//   albo fala zniszczona); potem wszyscy wracają do stolicy tym samym odwołaniem (`OrderService.issueRecall`);
//   transportowiec na orbicie stolicy jest usuwany, rekord `closed`. Pokój w trakcie — eskadra wraca, nic nie ląduje.
//
// ⚠ Harness jak `sb3_squadron_smoke` (prawdziwy `GameCore`, MOS, OrderService, EnemyAttackHandler; pula i garnizon
//   WYŁĄCZONE — wzór R-B2b). Odwołanie Directora — prawdziwy `DirectorRecall` (sonda `strandedWarshipsAwayFromHome`).
// ⚠ Pokój: zdarzenie produkcyjne `diplomacy:peaceSigned` (jedyny emitent — `DiplomacySystem`) wprost.
//
// PINY:
//   T1  TRZYMANIE: po desancie eskorta i transportowiec stoją na orbicie celu; `DirectorRecall` ich nie bierze (T1b);
//       STRAŻNIK T1a — tik nie wydaje powrotu, dopóki walka trwa (KONTROLA T1c: ta sama eskorta po zamknięciu — bierze)
//   T2  ZDOBYTE: kolonia celu imperium → `returning` (`captured`), eskorta i transportowiec w drodze do stolicy; przylot —
//       transportowiec USUNIĘTY, rekord `closed` (`transport_home`), eskorta zostaje
//   T3  FALA ZNISZCZONA: żadna jednostka desantu nie żyje → `returning` (`wave_destroyed`)
//   T4  POKÓJ w drodze: `returning` (`peace`), composite zdjęte, przy celu brak bitwy i desantu (KONTROLA T4c: bez pokoju —
//       desant)
//   T5  ATAK BEZ DESANTU (cel bez siatki — Finding 55, `no_grid`): `returning` (`not_landed`, `lastBlockReason`)
//   T6  ESKADRA PRZERWANA (SB66) — transportowiec w domu usunięty, niewylądowana fala znika z nim CICHO (bez śmierci)
//   T7  ESKORTA STRACONA PRZY TRZYMANIU: `returning` (`escorts_lost`), transportowiec wraca; STRAŻNIK T7b — fala zostaje
//   T8  źródło: `DirectorRecall` pomija `isHolding`; `squadron:closed` w `DebugLog.TRACKED_EVENTS`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';
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
              emp, cap, home: K.homePlanet, recall: new DirectorRecall(), ev: [] };
  for (const n of ['invasion:blocked', 'invasion:troopsLanded', 'battle:resolved', 'groundUnit:destroyed', 'squadron:closed']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
function escorts(w, n = 2) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap.planetId }).vessel);
}
function launch(w, targetId = w.home.id, es = escorts(w)) {
  const r = w.sq?.launchSquadron?.(w.emp, targetId, es.map(v => v.id)) ?? null;
  return { r, es, tr: r?.transportId ? w.vm.getVessel(r.transportId) : null };
}
function jump(w, members) {
  const T = Math.max(...members.filter(Boolean).map(v => v.mission?.type === 'interstellar_jump' ? (v.mission.arrivalYear ?? 0) : 0));
  w.K.timeSystem.gameTime = Math.max(w.K.timeSystem.gameTime ?? 0, T) + 0.001;
  w.vm._updatePositions(0.01);
}
function approach(w, members) {
  const T = Math.max(...members.filter(Boolean).map(v => v.mission?.arrivalYear ?? 0));
  w.K.timeSystem.gameTime = Math.max(w.K.timeSystem.gameTime ?? 0, T) + 0.001;
  w.vm._updatePositions(0.01);
}
function battle(w, planetId) {
  const p = w.K.enemyAttackHandler._pendingBattles.get(planetId);
  if (p?.timerId) clearTimeout(p.timerId);
  quiet(() => w.K.enemyAttackHandler._resolveBatchedBattle(planetId));
}
const tick = () => EventBus.emit('time:tick', { deltaYears: 0, civDeltaYears: 0 });
const wreck = (w, v) => quiet(() => w.K.enemyAttackHandler._turnIntoWreck(v, { x: v.position.x + 3, y: v.position.y }, w.K.timeSystem.gameTime));
const rec = (w, r) => w.sq?.getSquadron?.(r?.squadronId) ?? null;
const atTarget = (v, id) => !!v && !v.isWreck && v.position?.dockedAt === id && v.position?.state === 'orbiting';
const homeBound = (w, v) => {
  const capSys = EntityManager.get(w.cap.planetId)?.systemId;
  return (v?.pendingOrder?.kind === 'recall' && v.pendingOrder.targetSystemId === capSys)
    || (v?.movementOrder?.targetBodyId === w.cap.planetId);
};
/** Eskadra na dom gracza: skok, odcinek, bitwa, desant. */
function landed(w) {
  const s = launch(w);
  jump(w, [...s.es, s.tr]);
  approach(w, [...s.es, s.tr]);
  battle(w, w.home.id);
  return s;
}
/** Lot do domu: skok powrotny i odcinek do stolicy. */
function flyHome(w, members) {
  jump(w, members);
  approach(w, members);
}

// ═══ T1 — trzymanie orbity ═════════════════════════════════════════════════════
header('T1  po desancie eskorta i transportowiec trzymają orbitę celu');
{
  const w = boot();
  const { r, es, tr } = landed(w);
  const swept0 = w.recall.strandedWarshipsAwayFromHome(w.emp).map(v => v.id);
  for (let i = 0; i < 3; i++) tick();
  const members = [...es, tr];
  console.log(`     etap ${rec(w, r)?.stage} · na orbicie celu ${members.filter(v => atTarget(v, w.home.id)).length}/3 · odwołanie bierze [${swept0.join(',')}]`);
  assert(r?.ok === true && rec(w, r)?.stage === 'landed' && (rec(w, r)?.landedUnitIds ?? []).length > 0, 'T1-0 desant — rekord `landed`');
  assert(members.every(v => atTarget(v, w.home.id) && !homeBound(w, v)), 'T1a STRAŻNIK (zielony po obu stronach): po trzech tikach eskorta i transportowiec dalej na orbicie celu — tik nie wydaje powrotu, dopóki walka trwa');
  assert(swept0.length === 0 && es.every(e => w.sq?.isHolding?.(e.id) === true), 'T1b odwołanie Directora ich nie bierze (`isHolding`)');
}
{
  const w = boot();
  const { r, es } = landed(w);
  w.sq?._setStage?.(r?.squadronId, 'closed', { closeReason: 'keeper' });
  const swept = w.recall.strandedWarshipsAwayFromHome(w.emp).map(v => v.id).sort();
  assert(swept.length === 2 && swept.every(id => es.some(e => e.id === id)),
    'T1c KONTROLA: ta sama eskorta po zamknięciu eskadry — odwołanie Directora ją bierze (sonda nie jest pusta z innej przyczyny)');
}

// ═══ T2 — ciało zdobyte ════════════════════════════════════════════════════════
header('T2  ciało zdobyte — powrót, transportowiec usunięty w domu');
{
  const w = boot();
  const { r, es, tr } = landed(w);
  quiet(() => w.K.colonyManager.transferColony(w.home.id, w.emp, 'invasion'));
  tick();
  const r1 = rec(w, r);
  const bound = [...es, tr].every(v => homeBound(w, v));
  console.log(`     po zdobyciu: ${r1?.stage}/${r1?.outcome} · w drodze do stolicy ${[...es, tr].filter(v => homeBound(w, v)).length}/3`);
  assert(w.K.colonyManager.getColony(w.home.id)?.ownerEmpireId === w.emp, 'T2-0 kolonia celu należy do imperium eskadry');
  assert(r1?.stage === 'returning' && r1.outcome === 'captured' && bound, 'T2a `returning` (`captured`), eskorta i transportowiec w drodze do stolicy');
  flyHome(w, [...es, tr]);
  tick();
  const r2 = rec(w, r);
  const trGone = !w.vm.getVessel(r?.transportId);
  console.log(`     w domu: ${r2?.stage}/${r2?.closeReason} · transportowiec ${trGone ? 'usunięty' : 'jest'} · eskorta ${es.map(e => `${e.position?.state}@${e.position?.dockedAt}`).join(' ')}`);
  assert(trGone && r2?.stage === 'closed' && r2.closeReason === 'transport_home', 'T2b transportowiec na orbicie stolicy USUNIĘTY, rekord `closed` (`transport_home`)');
  assert(es.every(e => !e.isWreck && w.vm.getVessel(e.id) && e.position?.dockedAt === w.cap.planetId), 'T2c eskorta na orbicie stolicy (zostaje)');
  assert(evs(w, 'squadron:closed').some(e => e.squadronId === r?.squadronId && e.outcome === 'captured'), 'T2d zdarzenie `squadron:closed` (audyt) z wynikiem');
}

// ═══ T3 — fala zniszczona ══════════════════════════════════════════════════════
header('T3  fala zniszczona — powrót');
{
  const w = boot();
  const { r, es, tr } = landed(w);
  for (const uid of rec(w, r)?.landedUnitIds ?? []) w.gum.removeUnit(uid);
  tick();
  const r1 = rec(w, r);
  assert(r1?.stage === 'returning' && r1.outcome === 'wave_destroyed' && [...es, tr].every(v => homeBound(w, v)),
    'T3a żadna jednostka desantu nie żyje — `returning` (`wave_destroyed`), wszyscy w drodze do stolicy');
}

// ═══ T4 — pokój w drodze ═══════════════════════════════════════════════════════
header('T4  pokój, gdy eskadra jest w drodze — powrót, nic nie ląduje');
{
  const w = boot();
  const { r, es, tr } = launch(w);
  const members = [...es, tr];
  EventBus.emit('diplomacy:peaceSigned', { empireId: w.emp, reason: 'keeper' });
  const r1 = rec(w, r);
  const cleared = members.every(v => v.pendingOrder?.kind !== 'attack');
  jump(w, members);
  tick();
  console.log(`     ${r1?.stage}/${r1?.outcome} · composite ataku zdjęte ${cleared} · po skoku w drodze do stolicy ${members.filter(v => homeBound(w, v)).length}/3`);
  assert(r1?.stage === 'returning' && r1.outcome === 'peace' && cleared, 'T4a `returning` (`peace`), composite ataku zdjęte od razu');
  assert(members.every(v => homeBound(w, v)), 'T4b po przylocie ze skoku — wszyscy w drodze do stolicy');
  w.K.timeSystem.gameTime = (w.K.timeSystem.gameTime ?? 0) + 8;
  w.vm._updatePositions(0.01);
  battle(w, w.home.id);
  assert(evs(w, 'battle:resolved').length === 0 && evs(w, 'invasion:troopsLanded').length === 0, 'T4c przy celu brak bitwy i desantu');
}
{
  const w = boot();
  const { r } = landed(w);
  assert(r?.ok === true && evs(w, 'invasion:troopsLanded').length === 1, 'T4d KONTROLA: ta sama eskadra bez pokoju — desant');
}

// ═══ T5 — atak bez desantu ═════════════════════════════════════════════════════
header('T5  atak bez desantu (cel bez siatki) — powrót');
{
  const w = boot();
  const homeCol = w.K.colonyManager.getColony(w.home.id);
  const grid = homeCol.grid;
  homeCol.grid = null;                                   // Finding 55 — kolonia bez siatki do pierwszego otwarcia mapy
  const { r, es, tr } = launch(w);
  jump(w, [...es, tr]);
  approach(w, [...es, tr]);
  battle(w, w.home.id);
  const r0 = rec(w, r);
  tick();
  const r1 = rec(w, r);
  homeCol.grid = grid;
  console.log(`     po bitwie ${r0?.stage} (${r0?.lastBlockReason}) · po tiku ${r1?.stage}/${r1?.outcome}`);
  assert(evs(w, 'battle:resolved').some(b => b.result?.winner === 'A') && r0?.stage === 'launched' && r0.lastBlockReason === 'no_grid',
    'T5-0 orbita wygrana, desant odmówiony (`no_grid`), rekord dalej `launched` z powodem');
  assert(r1?.stage === 'returning' && r1.outcome === 'not_landed' && [...es, tr].every(v => homeBound(w, v)),
    'T5a tik — `returning` (`not_landed`), wszyscy w drodze do stolicy');
}

// ═══ T6 — eskadra przerwana: transportowiec w domu ═════════════════════════════
header('T6  eskadra przerwana (SB66) — transportowiec w domu usunięty, fala znika z nim cicho');
{
  const w = boot();
  const { r, es, tr } = launch(w);
  const aboard = [...(tr?.groundUnits ?? [])];
  jump(w, [...es, tr]);
  for (const e of es) wreck(w, e);
  tick();
  flyHome(w, [tr]);
  const dead0 = evs(w, 'groundUnit:destroyed').length;
  tick();
  const r1 = rec(w, r);
  assert(r1?.stage === 'closed' && r1.abortReason === 'escorts_lost' && !w.vm.getVessel(r?.transportId),
    'T6a transportowiec eskadry przerwanej na orbicie stolicy usunięty, rekord `closed`');
  assert(aboard.length > 0 && aboard.every(id => !w.gum.getUnit(id)) && evs(w, 'groundUnit:destroyed').length === dead0
    && JSON.stringify([...(r1?.dissolvedUnitIds ?? [])].sort()) === JSON.stringify([...aboard].sort()),
    'T6b niewylądowana fala zniknęła z transportowcem bez zdarzeń śmierci (`dissolvedUnitIds`)');
}

// ═══ T7 — eskorta stracona przy trzymaniu ══════════════════════════════════════
header('T7  eskorta stracona przy trzymaniu orbity — transportowiec wraca, fala zostaje');
{
  const w = boot();
  const { r, es, tr } = landed(w);
  const onGround = (rec(w, r)?.landedUnitIds ?? []).filter(id => w.gum.getUnit(id));
  for (const e of es) wreck(w, e);
  tick();
  const r1 = rec(w, r);
  assert(r1?.stage === 'returning' && r1.outcome === 'escorts_lost' && homeBound(w, tr), 'T7a `returning` (`escorts_lost`), transportowiec w drodze do stolicy');
  assert(onGround.length > 0 && onGround.every(id => w.gum.getUnit(id)?.planetId === w.home.id), 'T7b STRAŻNIK (zielony po obu stronach): fala zostaje na ziemi');
}

// ═══ T8 — źródło ═══════════════════════════════════════════════════════════════
header('T8  źródło');
{
  const dr = src('../../systems/director/DirectorRecall.js');
  const sweep = dr.slice(dr.indexOf('strandedWarshipsAwayFromHome(empireId) {'), dr.indexOf('countStranded('));
  assert(/strikeSquadronSystem\?\.isHolding\?\.\(v\.id\)\) continue/.test(sweep), 'T8a `DirectorRecall` pomija kadłuby eskadry trzymającej orbitę');
  const dl = src('../../core/DebugLog.js');
  const tracked = dl.slice(dl.indexOf('TRACKED_EVENTS'), dl.indexOf('class DebugLog'));
  assert(/'squadron:closed'/.test(tracked) && /'squadron:launched'/.test(tracked), 'T8b `squadron:closed` śledzone (metoda: `squadron:launched` widoczne)');
}

console.log(`\n═══ sb3_hold_return_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
