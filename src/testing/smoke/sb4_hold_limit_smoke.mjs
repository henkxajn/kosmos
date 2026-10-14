// ═══════════════════════════════════════════════════════════════════════════════
// sb4_hold_limit_smoke — KEEPER limitu trzymania orbity eskadry po desancie (AI STRIKES BACK S4 — decyzja SB70,
// Finding 440). Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2, §6.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: po desancie eskorta i transportowiec trzymały orbitę celu (SB63) do rozstrzygnięcia walki naziemnej — przy dużej
//   obronie przez lata (M6: 8,4 roku), a guard „eskadra w drodze” blokował w tym czasie każdą inną eskadrę imperium. SB70:
//   klucz strojenia `squadronHoldMaxYears` (domyślnie 3 lata gry, zakres 0,5–20); po limicie eskorta i transportowiec wracają
//   istniejącą ścieżką powrotu (SB63, `returning` → `closed`), wylądowana fala zostaje i walczy dalej, wynik `hold_expired`;
//   odbijanie liczy tę próbę jak każdą inną (cooldown celu od wysyłki).
//
// ⚠ Harness: prawdziwy `GameCore`, MOS, OrderService, EnemyAttackHandler, `DirectorOffensive` z odbijaniem
//   (`registerOffensiveBehaviors`); pula i garnizon WYŁĄCZONE (wzór R-B2b). Gracz zdobywa ciało imperium produkcyjnym
//   `captureColonyForPlayer` (księga wojny), eskadra odbicia — produkcyjne `DirectorRetake.launchRetake`.
// ⚠ Tik bez upływu czasu cywilizacyjnego (`civDeltaYears: 0`) — walka naziemna i przejęcia stoją; czas mierzy wyłącznie zegar
//   gry (`gameTime`), czyli to, co czyta limit.
// ⚠ Moduły danych importowane z `catch` — na kodzie sprzed S4 suita degraduje do czerwieni.
//
// PINY (fail-first na kodzie przed S4):
//   T0  klucz: wiersz tabeli (domyślnie 3, `lata gry`), odmowy `out_of_range` (0,4 i 21) i `wrong_type` ('3') niczego nie
//       zmieniają; zmiana 3 → 5 i reset do 3 — przez `consoleSetTuning` / `consoleResetTuning` (= `sbSet` / `sbReset`)
//   T1  limit: rekord `landed` z `landedYear`; STRAŻNIK T1b — przed limitem (2,99 roku) eskadra dalej trzyma orbitę; po
//       limicie (3,0) → `returning`, wynik `hold_expired`, eskorta i transportowiec w drodze do stolicy
//   T2  fala zostaje: eskadra zamknięta w domu, jednostki desantu dalej żyją na ciele; `squadron:closed`
//       (`hold_expired`, rozwiązane 0), transportowiec usunięty, ciało dalej gracza
//   T3  klucz czytany w chwili użycia: 0,5 → powrót po 0,5 roku; STRAŻNIK T3b — limit liczony od DESANTU, nie od wysyłki
//   T4  KONTROLA (zielona po obu stronach): ciało zdobyte w tym samym tiku — wynik `captured`, nie `hold_expired`
//   T5  cooldown jak po nieudanej próbie: po zamknięciu — brak eskadry w drodze; KONTROLE (zielone po obu stronach) — cel
//       czeka (`cooldown`) do 5 lat od wysyłki, potem odbijalny (próba = wysyłka, niezależnie od wyniku)
//   T6  rekord sprzed S4 (bez `landedYear`) — limit od `stageYear`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';
import { GameCore } from '../headless/GameCore.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';

const DATA = await import('../../data/StrikesBackData.js').catch(() => null);
const TUNE = await import('../../utils/StrikesBackTuning.js').catch(() => null);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

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
  const cap = K.directorProduction.capitalOf(emp);
  const w = { core, K, vm: K.vesselManager, gum: K.groundUnitManager, sq: K.strikeSquadronSystem, rt: K.directorRetake,
              emp, cap, ev: [] };
  EventBus.on('squadron:closed', (d) => w.ev.push(d));
  return w;
}
const at = (w, y) => { w.K.timeSystem.gameTime = y; };
const tick = () => EventBus.emit('time:tick', { deltaYears: 0, civDeltaYears: 0 });
const rec = (w, id) => w.sq?.getSquadron?.(id) ?? null;
/** Pełna kolonia imperium w układzie stolicy, bez obrony, z siatką; zwraca planetId. */
function aiColony(w) {
  const sys = EntityManager.get(w.cap.planetId)?.systemId;
  const bodies = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem?.(t, sys) ?? []);
  const body = bodies.find(b => !w.K.colonyManager.getColony(b.id));
  if (!body) return null;
  quiet(() => w.K.colonyManager.createColony(body.id, {}, 8, w.K.timeSystem.gameTime ?? 0, w.emp));
  const col = w.K.colonyManager.getColony(body.id);
  if (!col) return null;
  col.ownerEmpireId = w.emp;
  if (!col.grid) col.grid = PlanetMapGenerator.generate(body, false);   // bez siatki desant odmawia `no_grid` (Finding 55)
  w.K.empireRegistry.addColony(w.emp, body.id);
  const a = col.buildingSystem?._active;
  if (a) for (const [k, e] of [...a]) if (e?.building?.id === 'defense_tower' || e?.building?.id === 'defense_grid') a.delete(k);
  return body.id;
}
function escorts(w, n) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap.planetId }).vessel);
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
/** W drodze do domu — produkcyjny predykat eskadry (`_homeBound`: composite `recall` albo odcinek `ai_recall`). */
const homeBound = (w, v) => w.sq?._homeBound?.(v) === true;
/** Chwila desantu: `landedYear` (S4), a w rekordzie bez niego — wejście w `landed` (`stageYear`). */
const landT = (s) => (Number.isFinite(s?.landedYear) ? s.landedYear : (s?.stageYear ?? 0));
/** Scena: wojna, gracz zdobywa kolonię imperium (rok 10), reguła odbijania wysyła eskadrę (rok 11), lot, bitwa, desant. */
function landedRetake() {
  const w = boot();
  const body = aiColony(w);
  quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
  at(w, 10);
  quiet(() => w.K.colonyManager.captureColonyForPlayer(body, 'ground_invasion'));
  escorts(w, 3);
  at(w, 11);
  const r = quiet(() => w.rt?.launchRetake?.({ empireId: w.emp, year: 11 })) ?? null;
  const s0 = rec(w, r?.squadronId);
  const members = s0 ? [...s0.escortIds, s0.transportId].map(id => w.vm.getVessel(id)) : [];
  if (s0) {
    approach(w, members);
    battle(w, body);
  }
  return { w, body, r, s0, members };
}

// ═══ T0 — klucz strojenia ══════════════════════════════════════════════════════
header('T0  klucz `squadronHoldMaxYears`: wartość domyślna, odmowy, zmiana i reset');
{
  boot();
  const def = DATA?.SB_TUNING?.squadronHoldMaxYears;
  assert(def?.default === 3 && def.type === 'number' && def.min === 0.5 && def.max === 20 && def.unit === 'lata gry',
    `T0a wiersz tabeli: domyślnie 3, liczba 0,5–20, „lata gry” — ${JSON.stringify(def ?? null)}`);
  const row = TUNE?.tuningRows?.().find(x => x.klucz === 'squadronHoldMaxYears');
  assert(row?.biezaca === 3 && row.zmiana === '', 'T0b odczyt `sbTuning()` (wiersze tabeli): bieżąca 3, bez znacznika zmiany');
  const set = (v) => quiet(() => TUNE?.consoleSetTuning?.('squadronHoldMaxYears', v)) ?? {};
  const a = set(0.4), b = set(21), c = set('3');
  assert(a.reason === 'out_of_range' && b.reason === 'out_of_range' && c.reason === 'wrong_type' && TUNE?.getTuning?.('squadronHoldMaxYears') === 3,
    `T0c odmowy \`sbSet\`: 0,4 → ${a.reason}, 21 → ${b.reason}, '3' → ${c.reason}; wartość dalej 3`);
  const d = set(5);
  assert(d.ok === true && d.previous === 3 && d.value === 5 && TUNE?.tuningRows?.().find(x => x.klucz === 'squadronHoldMaxYears')?.zmiana === '*',
    'T0d `sbSet` 3 → 5 (znacznik zmiany w odczycie)');
  const e = quiet(() => TUNE?.consoleResetTuning?.('squadronHoldMaxYears')) ?? {};
  assert(e.ok === true && (e.reset ?? []).includes('squadronHoldMaxYears') && TUNE?.getTuning?.('squadronHoldMaxYears') === 3,
    'T0e `sbReset` — z powrotem 3');
}

// ═══ T1 — limit ═══════════════════════════════════════════════════════════════
header('T1  po limicie trzymania eskorta i transportowiec wracają (`hold_expired`)');
{
  const { w, body, r, members } = landedRetake();
  const s = rec(w, r?.squadronId);
  console.log(`     wysyłka ${r?.squadronId ?? '-'} · etap ${s?.stage ?? '-'} · desant ${(s?.landedUnitIds ?? []).length} · landedYear ${s?.landedYear ?? '-'}`);
  assert(r?.launched === 1 && s?.stage === 'landed' && (s?.landedUnitIds ?? []).length > 0 && s?.landedOn === body,
    'T1-0 WARUNEK SCENY: reguła odbijania wysłała eskadrę, desant na ciele — rekord `landed`');
  assert(Number.isFinite(s?.landedYear) && Math.abs(s.landedYear - w.K.timeSystem.gameTime) < 1e-9,
    'T1a rekord niesie chwilę desantu (`landedYear`)');
  at(w, landT(s) + 2.99); tick();
  assert(rec(w, r?.squadronId)?.stage === 'landed' && members.every(v => v?.position?.dockedAt === body && !homeBound(w, v)),
    'T1b STRAŻNIK (zielony po obu stronach): 2,99 roku po desancie eskadra dalej trzyma orbitę celu');
  at(w, landT(s) + 3.0); tick();
  const s2 = rec(w, r?.squadronId);
  assert(s2?.stage === 'returning' && s2.outcome === 'hold_expired', `T1c 3,0 roku po desancie → \`returning\`, wynik \`hold_expired\` (jest ${s2?.stage}/${s2?.outcome ?? '-'})`);
  assert(members.every(v => !!v && !v.isWreck && homeBound(w, v)), 'T1d eskorta i transportowiec w drodze do stolicy (odwołanie)');
}

// ═══ T2 — fala zostaje ═════════════════════════════════════════════════════════
header('T2  wylądowana fala zostaje i walczy dalej; zamknięcie w domu');
{
  const { w, body, r, s0, members } = landedRetake();
  const s = rec(w, r?.squadronId);
  const units = s?.landedUnitIds ?? [];
  at(w, landT(s) + 3.0); tick();
  approach(w, members); tick(); tick();
  const s3 = rec(w, r?.squadronId);
  const alive = units.filter(id => { const u = w.gum.getUnit(id); return !!u && u.planetId === body && (u.hp ?? 0) > 0; });
  const closed = w.ev.filter(e => e.squadronId === r?.squadronId);
  console.log(`     etap ${s3?.stage ?? '-'} · zamknięcia ${JSON.stringify(closed)} · żywe jednostki desantu ${alive.length}/${units.length}`);
  assert(s3?.stage === 'closed' && units.length > 0 && alive.length === units.length,
    'T2a eskadra zamknięta w domu, a jednostki desantu dalej żyją na ciele (fala zostaje)');
  assert(s3?.stage === 'closed' && closed.length === 1 && closed[0].outcome === 'hold_expired' && closed[0].dissolved === 0,
    'T2b `squadron:closed` — wynik `hold_expired`, rozwiązane 0 (fala nie leci z powrotem)');
  assert(!w.vm.getVessel(s0?.transportId) && !w.K.colonyManager.getColony(body)?.ownerEmpireId,
    'T2c transportowiec usunięty w stolicy; ciało dalej gracza');
}

// ═══ T3 — klucz w chwili użycia, liczony od desantu ═════════════════════════════
header('T3  klucz czytany w chwili użycia; limit od desantu');
{
  const { w, r, s0 } = landedRetake();
  const s = rec(w, r?.squadronId);
  quiet(() => TUNE?.consoleSetTuning?.('squadronHoldMaxYears', 0.5));
  const flight = landT(s) - (s0?.launchedYear ?? 0);
  at(w, landT(s) + 0.49); tick();
  assert(flight > 0.02 && rec(w, r?.squadronId)?.stage === 'landed',
    `T3b STRAŻNIK (zielony po obu stronach): limit liczony od DESANTU — 0,49 roku po desancie (lot ${flight.toFixed(3)} roku) dalej \`landed\``);
  at(w, landT(s) + 0.5); tick();
  assert(rec(w, r?.squadronId)?.outcome === 'hold_expired', 'T3a klucz 0,5 → powrót 0,5 roku po desancie');
  quiet(() => TUNE?.consoleResetTuning?.('squadronHoldMaxYears'));
}

// ═══ T4 — rozstrzygnięcie ma pierwszeństwo ═════════════════════════════════════
header('T4  KONTROLA: ciało zdobyte w tym samym tiku — `captured`');
{
  const { w, body, r } = landedRetake();
  const s = rec(w, r?.squadronId);
  const col = w.K.colonyManager.getColony(body);
  if (col) col.ownerEmpireId = w.emp;                       // przejęcie przez fale (stan, który czyta `_groundDecision`)
  at(w, landT(s) + 3.0); tick();
  assert(rec(w, r?.squadronId)?.outcome === 'captured', `T4 KONTROLA (zielona po obu stronach): wynik \`captured\`, nie \`hold_expired\` (jest ${rec(w, r?.squadronId)?.outcome ?? '-'})`);
}

// ═══ T5 — cooldown jak po nieudanej próbie ═════════════════════════════════════
header('T5  odbijanie liczy próbę zakończoną limitem jak każdą inną');
{
  const { w, body, r, s0, members } = landedRetake();
  const s = rec(w, r?.squadronId);
  at(w, landT(s) + 3.0); tick();
  approach(w, members); tick(); tick();
  const L = s0?.launchedYear ?? 0;
  const underway = w.sq?.hasSquadronUnderway?.(w.emp);
  at(w, Math.max(w.K.timeSystem.gameTime, L + 4.9));
  const c1 = (w.rt?.retakeCandidates?.(w.emp) ?? []).find(c => c.body.id === body);
  at(w, L + 5.0);
  const c2 = (w.rt?.retakeCandidates?.(w.emp) ?? []).find(c => c.body.id === body);
  console.log(`     zamknięta ${rec(w, r?.squadronId)?.stage ?? '-'} · w drodze ${underway} · L+4,9: ${c1?.wait ?? '-'} · L+5: ${c2?.eligible}`);
  assert(rec(w, r?.squadronId)?.stage === 'closed' && underway === false, 'T5a po zamknięciu — żadna eskadra imperium w drodze');
  assert(c1?.wait === 'cooldown' && c1.lastAttemptYear === L, 'T5b KONTROLA (zielona po obu stronach): 4,9 roku od wysyłki — cel czeka (`cooldown`), próba = wysyłka');
  assert(c2?.eligible === true, 'T5c KONTROLA (zielona po obu stronach): 5,0 roku od wysyłki — cel znów odbijalny');
}

// ═══ T6 — rekord sprzed S4 ═════════════════════════════════════════════════════
header('T6  rekord bez `landedYear` — limit od `stageYear`');
{
  const { w, r } = landedRetake();
  const s = rec(w, r?.squadronId);
  const key = `strikeSquadrons.${r?.squadronId}`;
  const raw = gameState.get(key) ?? null;
  if (raw) { const { landedYear, ...old } = raw; gameState.set(key, { ...old, stageYear: landT(s) - 1 }, 'keeper'); }
  const before = rec(w, r?.squadronId);
  at(w, landT(s) + 1.9); tick();
  const mid = rec(w, r?.squadronId)?.stage;
  at(w, landT(s) + 2.0); tick();
  assert(!!raw && before?.stage === 'landed' && !('landedYear' in (before ?? {})) && mid === 'landed' && rec(w, r?.squadronId)?.outcome === 'hold_expired',
    `T6 zapis bez \`landedYear\`: limit od \`stageYear\` (rok przed desantem) — 1,9 roku po desancie dalej \`landed\`, 2,0 → \`hold_expired\` (${mid}/${rec(w, r?.squadronId)?.outcome ?? '-'})`);
}

console.log(`\n═══ sb4_hold_limit_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
