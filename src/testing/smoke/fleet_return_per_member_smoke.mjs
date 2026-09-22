// Finding 272 — keeper: „Powrót do bazy" floty ROZPIĘTEJ na dwa układy — cel PER CZŁONEK (opcja A
// właściciela, decyzje D-272-1…9). Rejestr: docs/design/VESSEL_ORDERS_PLAN.md §272.
//
// PO CO TO ISTNIEJE: oba producenty Powrotu (`FleetManagerOverlay._handleFleetReturnBase`,
// `FleetCommandPanel._fleetReturn`) dobierały JEDEN cel — najbliższą własną kolonię PIERWSZEGO żywego
// członka — i podawały go jako goły punkt WSZYSTKIM. Współrzędne są lokalne dla układu (gwiazda w (0,0)),
// więc członek z INNEGO układu leciał do bezsensownych współrzędnych we własnej ramce, `_maybeAutoDockOnReturn`
// (263) odmawiał doku i statek DRYFOWAŁ — bezgłośnie, bo MOS goły punkt PRZYJMUJE (zmierzone sondami
// M1/M2/M4 audytu 272, 2026-09-18); reprezentant w tranzycie warp abortował całą flotę (M5).
// Teraz plan liczy `utils/FleetReturnPlan` (jedno źródło dla obu producentów): każdy członek dostaje
// własny cel = najbliższa WŁASNA kolonia w JEGO układzie (jawny `targetBodyId`+`targetPoint`, D-272-6),
// a członek bez celu jest ODMAWIANY GŁOŚNO (`memberRefusals` → `rejected` → Dziennik przez D-E2).
//
//   T1  M1: A(sys_home)+B(sys_020, własna kolonia f_far) → B leci do f_far, A do p_home; markery per
//       członek; `activeOrder.memberTargets`; oba producenty (FMO + FCP)
//   T2  M2: wynik per członek NIEZALEŻNY od kolejności dodania (dawniej: odwrócenie kolejności
//       przenosiło defekt z jednego statku na drugi)
//   T3  M4 + A2 (275): B bez własnej kolonii w SWOIM układzie → odmowa `no_friendly_planet`, NAZWANA
//       w Dzienniku (bez sluga, EN i PL); stary rozkaz floty B skasowany `replaced` (partial = A2),
//       B bez markera i bez misji (nie leci w cudzą ramkę)
//   T4  M3: członek w tranzycie warp → `vessel_in_warp_transit` nazwany (KONTROLA nie-regresji 147/D-E2)
//   T5  M5: reprezentant (pierwszy żywy) w warpie ⇒ flota NADAL wraca (D-272-3: reprezentant = pierwszy
//       Z ROZWIĄZANYM celem), B nazwany
//   T6  nikt nie ma celu ⇒ DOKŁADNIE jeden toast `fleet.noFriendlyPlanet`, zero rozkazu, zero markera,
//       zero wpisu (parytet z `return_dock_family` T9, D-272-9) — KONTROLA, oba producenty
//   T7  przylot: B dokuje w f_far (sys_020), `colonyId` re-homowany do f_far (D-272-7); A w p_home;
//       ZERO odmów 263 (console.warn przechwycony)
//   T8  brak sync ETA przy `memberTargets` (D-272-5): `arrivalSyncYear` null + `_arrivalSyncYear` null
//       na rozkazach; KONTROLA: zwykły fleet moveToPoint NADAL ma liczbowy sync
//   T9  ŹRÓDŁO (CRLF-safe, komentarze zdjęte): oba producenty przez `buildFleetReturnPlan`, żaden nie
//       woła `mos.issueOrder(` wprost (anty-279) ani `nearestOwnColonyBodyInSystem(`; FleetSystem czyta
//       `memberRefusals` (eligible) i `memberTargets` (fan-out + rekord); `_onMemberOrderEnded` i
//       `cancelFleetOrder` NIETKNIĘTE (bez `memberTargets`/`memberRefusals`); KONTRAKT helpera
//       WYKONANIEM: każdy nie-wrak ma DOKŁADNIE jeden wpis, wrak żadnego; zero nowych kluczy i18n
//
// ⚠ Fail-first w REALNYM `git worktree --detach 493b1e0` (reguła Findingu 270: źródło czytane po
//   normalizacji `\r\n → \n`). Import helpera OWINIĘTY — na HEAD sprzed naprawy modułu nie ma, a pin ma
//   DEGRADOWAĆ, nie przerywać (lekcja legu D).
//
// Uruchom: node src/testing/smoke/fleet_return_per_member_smoke.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';           // MUSI być pierwszy (localStorage dla i18n)
import { readFileSync }        from 'node:fs';
import { fileURLToPath }       from 'node:url';
import { dirname, join, resolve } from 'node:path';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { nearestOwnColonyBodyInSystem } from '../../utils/RetreatTarget.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { FleetCommandPanel }   from '../../ui/FleetCommandPanel.js';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';

let Plan = null;
try { Plan = await import('../../utils/FleetReturnPlan.js'); } catch { /* fail-first: brak modułu */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const SRC  = join(ROOT, 'src');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const J = (x) => JSON.stringify(x);
const src = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const AU = GAME_CONFIG.AU_TO_PX;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });
const locale0 = getLocale();
setLocale('en');

// ── Świat: kolonie gracza w DWÓCH układach, w TYCH SAMYCH zakresach px (mechanizm rodziny 154/255/272)
const COLONIES = {};
function addBody(id, sys, auX, name) {
  const b = { id, type: 'planet', name, x: auX * AU, y: 0, explored: true, analyzed: true,
              planetType: 'rocky', orbital: orb(auX), deposits: [], systemId: sys };
  EntityManager.add(b);
  return b;
}
function addColony(planetId, name, { isOutpost = false } = {}) {
  COLONIES[planetId] = { planetId, name, isOutpost,
    resourceSystem: { getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} } };
}
const colMgr = {
  activePlanetId: 'p_home',
  getColony: (id) => COLONIES[id] ?? null,
  getAllColonies: () => Object.values(COLONIES),
  getPlayerColonies: () => Object.values(COLONIES),
  hasColony: (id) => id in COLONIES,
  isPlayerColony: (c) => !!c,
};
const techStub = {
  isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
  getShipRangeMultiplier: () => 1.0, getMultiplier: () => 1.0,
  getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
};

let vMgr, mos, fs, toasts, journal, events, warns;
function world({ farColony = true } = {}) {
  EventBus.clear(); EntityManager.clear();
  for (const k of Object.keys(COLONIES)) delete COLONIES[k];
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: 'sys_home' };
  for (const s of ['sys_home', 'sys_020']) {
    EntityManager.add({ id: 'star_' + s, type: 'star', name: 'G ' + s, systemId: s, x: 0, y: 0, mass: 1 });
  }
  const home = addBody('p_home', 'sys_home', 1.00, 'Mstow');
  addBody('h2',     'sys_home', 6.00, 'Dom II');
  addBody('f_far',  'sys_020',  9.00, 'Wysunieta');
  addBody('f_rock', 'sys_020',  2.00, 'Skala 020');
  addColony('p_home', 'Mstow');
  addColony('h2', 'Dom II');
  if (farColony) addColony('f_far', 'Wysunieta');
  vMgr = new VesselManager();
  mos  = new MovementOrderSystem(vMgr);
  fs   = new FleetSystem(vMgr);
  toasts = []; journal = []; events = []; warns = [];
  EventBus.on('ui:toast', (e) => toasts.push(e.text));
  for (const ev of ['fleet:orderIssued', 'fleet:orderCancelled', 'fleet:orderCompleted']) {
    EventBus.on(ev, (p) => events.push(`${ev}(${p?.reason ?? p?.mode ?? ''})`));
  }
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fs,
    colonyManager: colMgr, techSystem: techStub, gameConfig: GAME_CONFIG,
    eventLogSystem: { push: (e) => journal.push(e.text) },
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
  });
  return home;
}
function ship({ sys = 'sys_020', auX = 3, colonyId = 'p_home', name = 'Zmija' } = {}) {
  const v = vMgr.createAndRegister('hull_small', colonyId, { name, modules: ['engine_ion'], x: auX * AU, y: 0 });
  v.position.x = auX * AU; v.position.y = 0;
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  v.systemId = sys; v.colonyId = colonyId;
  v.warpFuel = { current: 5, max: 5, consumption: 0.5 };
  return v;
}
function warpTransit(v) {
  v.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_home', fromSystemId: 'sys_020' };
  v.systemId = null; v.status = 'on_mission';
}
function fleetOf(members, name = 'Klin') {
  const f = fs.createFleet(name);
  for (const v of members) fs.addMember(f.id, v.id);
  return f;
}
/** Powrót przez PRAWDZIWY producent, z PRAWDZIWYM anonsem (D-E2 pisze do Dziennika). */
function fmoReturn(fleetId) { Object.create(FleetManagerOverlay.prototype)._handleFleetReturnBase(fleetId); }
function fcpReturn(fleetId) {
  const p = Object.create(FleetCommandPanel.prototype);
  p._fs = () => fs; p._markDirty = () => {};
  p._fleetReturn(fleetId);
}
/** Domyka rozkaz DOKŁADNIE tak, jak robi to `VesselManager` (`vessel:orderCompleted`). */
function completeOrder(v) {
  if (!v.movementOrder) return false;
  v.movementOrder.status = 'completed';
  EventBus.emit('vessel:orderCompleted', { vesselId: v.id, orderId: v.movementOrder.id });
  return true;
}
const snap = (v) => ({ target: v.mission?.targetId ?? null, marker: v._pendingReturnDock ?? null,
  order: v.movementOrder?.type ?? null, sync: v.movementOrder?._arrivalSyncYear ?? null });

// ═══ T1 — M1: cel PER CZŁONEK, oba producenty ════════════════════════════════════════════
header('T1  M1: A(sys_home) + B(sys_020, własna f_far) — każdy leci do SWOJEJ kolonii; oba producenty');
for (const [label, run] of [['FMO', fmoReturn], ['FCP', fcpReturn]]) {
  world();
  const A = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' });
  const B = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  // ŚWIADKOWIE: własna kolonia B istnieje w JEGO układzie, a p_home jest BLIŻEJ w px (świat konkurencyjny)
  const ownB = nearestOwnColonyBodyInSystem(B, colMgr);
  ok(ownB?.planet?.id === 'f_far', `${label} ŚWIADEK: resolver B → f_far w sys_020 (${ownB?.planet?.id ?? 'BRAK'})`);
  const dHome = Math.hypot(EntityManager.get('p_home').x - B.position.x, 0), dFar = Math.hypot(EntityManager.get('f_far').x - B.position.x, 0);
  ok(dHome < dFar, `${label} ŚWIADEK 2: p_home bliżej w px (${(dHome / AU).toFixed(1)} AU) niż f_far (${(dFar / AU).toFixed(1)} AU)`);
  const f = fleetOf([A, B]);
  run(f.id);
  ok(snap(B).target === 'f_far' && snap(B).marker === 'f_far',
     `${label} B: cel=f_far (SWÓJ układ), marker=f_far (jest: ${J(snap(B))})`);
  ok(snap(A).target === 'p_home' && snap(A).marker === 'p_home',
     `${label} A: cel=p_home, marker=p_home (jest: ${J(snap(A))})`);
  ok(J(f.activeOrder?.memberTargets) === J({ [A.id]: 'p_home', [B.id]: 'f_far' }),
     `${label} activeOrder.memberTargets = {A:p_home, B:f_far} (jest: ${J(f.activeOrder?.memberTargets)})`);
  ok(Object.keys(f.activeOrder?.memberOrderIds ?? {}).length === 2 && journal.length === 0 && toasts.length === 1,
     `${label} 2/2 przyjęte, zero wpisów odmowy, jeden toast (${J(toasts)})`);
}

// ═══ T2 — M2: niezależność od kolejności dodania ═══════════════════════════════════════════
header('T2  M2: kolejność odwrócona (B pierwszy) — wynik per członek IDENTYCZNY');
{
  world();
  const B = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const A = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' });
  const f = fleetOf([B, A]);
  fmoReturn(f.id);
  ok(snap(B).target === 'f_far' && snap(A).target === 'p_home' && snap(B).marker === 'f_far' && snap(A).marker === 'p_home',
     `cele/markery per członek bez względu na kolejność (B ${J(snap(B))}, A ${J(snap(A))})`);
  // Pole INFORMACYJNE: targetPoint reprezentanta (tu B → f_far @ 9 AU) — nie jest źródłem prawdy.
  ok(Math.abs((f.activeOrder?.targetPoint?.x ?? 0) / AU - 9) < 1e-9,
     `activeOrder.targetPoint = cel reprezentanta (B, 9 AU) — informacyjny (${((f.activeOrder?.targetPoint?.x ?? 0) / AU).toFixed(2)} AU)`);
}

// ═══ T3 — M4 + A2: członek bez własnej kolonii w SWOIM układzie ═════════════════════════════
header('T3  M4 + A2: B bez własnej kolonii w sys_020 → odmowa no_friendly_planet, NAZWANA; stary rozkaz floty B replaced');
{
  world({ farColony: false });
  const A = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' });
  const B = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  ok(nearestOwnColonyBodyInSystem(B, colMgr) === null, 'PRZESŁANKA: resolver B → null (brak własnej kolonii w sys_020)');
  const f = fleetOf([A, B]);
  // Poprzedni rozkaz floty — obaj lecą (goły punkt we WŁASNYCH ramkach; A2 z 275 ma co skasować)
  const r0 = fs.issueFleetOrder(f.id, { type: 'moveToPoint', targetPoint: { x: 4 * AU, y: 0 } });
  ok(r0.ok && r0.accepted.length === 2, `KONTROLA: poprzedni rozkaz floty 2/2 (${r0.accepted.length})`);
  const oldB = mos.getOrder(B.id)?.id;
  events.length = 0; journal.length = 0;
  fmoReturn(f.id);
  ok(snap(A).target === 'p_home' && snap(A).marker === 'p_home', `A wraca do p_home (${J(snap(A))})`);
  ok(snap(B).marker === null && B.mission == null && mos.getOrder(B.id) == null,
     `B: zero markera, zero misji, zero rozkazu — NIE leci w cudzą ramkę (${J(snap(B))})`);
  ok(journal.length === 1 && /Beta/.test(journal[0]) && journal[0].includes(t('vessel.reasonNoFriendlyPlanet'))
     && !/no_friendly_planet/.test(journal[0]),
     `Dziennik NAZYWA B z przetłumaczonym powodem, bez sluga (${J(journal)})`);
  ok(events.filter((e) => e === 'fleet:orderCancelled(replaced)').length === 1 && oldB && mos.getOrder(B.id) == null,
     `A2 (275): stary rozkaz B (${oldB}) skasowany replaced, 1× fleet:orderCancelled(replaced) (${J(events)})`);
  ok(toasts.at(-1) === t('fleet.orderResult', 1, 2), `toast liczbowy 1/2 (${J(toasts.at(-1))})`);
  // PL — ten sam wpis bez sluga
  setLocale('pl'); journal.length = 0; events.length = 0;
  world({ farColony: false });
  const A2 = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' }); const B2 = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  fmoReturn(fleetOf([A2, B2]).id);
  ok(journal.length === 1 && journal[0].includes(t('vessel.reasonNoFriendlyPlanet')) && !/no_friendly_planet/.test(journal[0]),
     `pl: wpis przetłumaczony, bez sluga (${J(journal)})`);
  setLocale('en');
}

// ═══ T4 — M3: tranzyt warp (kontrola nie-regresji 147 + D-E2) ═════════════════════════════
header('T4  M3: B w tranzycie warp → vessel_in_warp_transit nazwany; A wraca (KONTROLA)');
{
  world();
  const A = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' });
  const B = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  warpTransit(B);
  const f = fleetOf([A, B]);
  fmoReturn(f.id);
  ok(snap(A).target === 'p_home' && B.movementOrder == null && B._pendingReturnDock == null,
     `A wraca, B nietknięty (${J(snap(A))} / ${J(snap(B))})`);
  ok(journal.length === 1 && /Beta/.test(journal[0]) && journal[0].includes(t('vessel.reasonVesselInWarpTransit')),
     `B nazwany z powodem tranzytu (${J(journal)})`);
  ok(!!Plan && Plan.buildFleetReturnPlan([A, B], colMgr).memberRefusals[B.id] === 'vessel_in_warp_transit',
     'plan: powód B = vessel_in_warp_transit (D-272-2 a — ten sam powód, który daje bramka MOS)');
}

// ═══ T5 — M5: reprezentant w warpie NIE abortuje floty (D-272-3) ═══════════════════════════
header('T5  M5: pierwszy żywy członek (B) w warpie ⇒ reprezentant = pierwszy Z CELEM (A); flota wraca');
{
  world();
  const B = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const A = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' });
  warpTransit(B);
  const f = fleetOf([B, A]);
  fmoReturn(f.id);
  ok(!!f.activeOrder && snap(A).target === 'p_home' && snap(A).marker === 'p_home',
     `flota MA rozkaz, A wraca do p_home (dziś: cała flota abortowała toastem) (${J(snap(A))})`);
  ok(!toasts.includes(t('fleet.noFriendlyPlanet')) && journal.length === 1 && /Beta/.test(journal[0]),
     `brak toastu „no friendly planet"; B nazwany (${J(toasts)} / ${J(journal)})`);
  ok(!!Plan && Plan.buildFleetReturnPlan([B, A], colMgr).representative?.vesselId === A.id,
     'plan.representative = A (pierwszy Z ROZWIĄZANYM celem, nie pierwszy żywy)');
}

// ═══ T6 — nikt nie ma celu: toast jak dotąd (D-272-9), oba producenty ═════════════════════
header('T6  nikt nie ma celu ⇒ DOKŁADNIE jeden toast, zero rozkazu, zero markera, zero wpisu (oba producenty)');
for (const [label, run] of [['FMO', fmoReturn], ['FCP', fcpReturn]]) {
  world({ farColony: false });
  const A = ship({ sys: 'sys_020', auX: 3, name: 'Alfa' });
  const B = ship({ sys: 'sys_020', auX: 5, name: 'Beta' });
  const f = fleetOf([A, B]);
  run(f.id);
  ok(f.activeOrder == null && A.movementOrder == null && B.movementOrder == null
     && A._pendingReturnDock == null && B._pendingReturnDock == null,
     `${label}: zero rozkazu, zero markera`);
  ok(toasts.length === 1 && toasts[0] === t('fleet.noFriendlyPlanet') && journal.length === 0,
     `${label}: DOKŁADNIE jeden toast fleet.noFriendlyPlanet, zero wpisów (${J(toasts)})`);
}

// ═══ T7 — przylot: dok we WŁASNYM układzie + re-home per członek (D-272-7) ════════════════
header('T7  przylot: B dokuje w f_far (sys_020) i re-homuje colonyId; A w p_home; ZERO odmów 263');
{
  world();
  const A = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' });
  const B = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const f = fleetOf([A, B]);
  fmoReturn(f.id);
  const warn0 = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  try { completeOrder(B); completeOrder(A); } finally { console.warn = warn0; }
  ok(B.position.dockedAt === 'f_far' && B.colonyId === 'f_far' && B.systemId === 'sys_020'
     && Math.abs(B.position.x - EntityManager.get('f_far').x) < 1e-6,
     `B: dockedAt=f_far, colonyId=f_far (re-home per członek), pozycja == f_far (${B.position.dockedAt}/${B.colonyId})`);
  ok(A.position.dockedAt === 'p_home' && A.colonyId === 'p_home', `A: dockedAt=p_home, colonyId=p_home`);
  ok(!warns.some((w) => /auto-dock ODRZUCONY/.test(w)), `zero odmów 263 przy przylocie (warns: ${J(warns)})`);
  ok(events.includes('fleet:orderCompleted(completed)') && f.activeOrder == null,
     `rozkaz floty domknięty przez _onMemberOrderEnded (nietknięte) (${J(events.filter((e) => /Completed/.test(e)))})`);
}

// ═══ T8 — brak sync ETA przy memberTargets (D-272-5) + KONTROLA ═════════════════════════════
header('T8  brak sync ETA przy celach per członek; KONTROLA: zwykły fleet moveToPoint ma sync');
{
  world();
  const A = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' });
  const B = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const f = fleetOf([A, B]);
  fmoReturn(f.id);
  ok(f.activeOrder?.arrivalSyncYear === null && snap(A).sync === null && snap(B).sync === null,
     `Powrót: arrivalSyncYear=null, _arrivalSyncYear=null na obu rozkazach (${J([f.activeOrder?.arrivalSyncYear, snap(A).sync, snap(B).sync])})`);
  world();
  const C = ship({ sys: 'sys_home', auX: 3, name: 'Gamma' });
  const D = ship({ sys: 'sys_home', auX: 8, name: 'Delta' });
  const f2 = fleetOf([C, D]);
  const r = fs.issueFleetOrder(f2.id, { type: 'moveToPoint', targetPoint: { x: 5 * AU, y: 0 } });
  ok(r.ok && typeof f2.activeOrder?.arrivalSyncYear === 'number' && typeof snap(C).sync === 'number',
     `KONTROLA: zwykły moveToPoint floty NADAL synchronizuje ETA (${f2.activeOrder?.arrivalSyncYear?.toFixed?.(2)})`);
}

// ═══ T9 — ŹRÓDŁO + kontrakt helpera + i18n ═════════════════════════════════════════════════
header('T9  źródło: producenty przez helper, bez mos.issueOrder wprost; FleetSystem czyta pola; scope 275 nietknięty; kontrakt helpera; i18n');
{
  const fmo = stripComments(src('ui/FleetManagerOverlay.js'));
  const fcp = stripComments(src('ui/FleetCommandPanel.js'));
  const fsys = stripComments(src('systems/FleetSystem.js'));
  const retBody = (code, name) => { const i = code.indexOf(name); return i >= 0 ? code.slice(i, i + 2200) : ''; };
  const fmoRet = retBody(fmo, '_handleFleetReturnBase(fleetId) {');
  const fcpRet = retBody(fcp, '_fleetReturn(fleetId) {');
  ok(/import \{ buildFleetReturnPlan \} from '\.\.\/utils\/FleetReturnPlan\.js'/.test(fmo) && /buildFleetReturnPlan\(/.test(fmoRet),
     'FMO: importuje i woła buildFleetReturnPlan w _handleFleetReturnBase');
  ok(/import \{ buildFleetReturnPlan \} from '\.\.\/utils\/FleetReturnPlan\.js'/.test(fcp) && /buildFleetReturnPlan\(/.test(fcpRet),
     'FCP: importuje i woła buildFleetReturnPlan w _fleetReturn');
  ok(!/nearestOwnColonyBodyInSystem\(/.test(fmoRet) && !/nearestOwnColonyBodyInSystem\(/.test(fcpRet),
     'producenty NIE wołają resolvera wprost (jedno źródło = helper)');
  ok(!/\.issueOrder\(/.test(fmoRet) && !/\.issueOrder\(/.test(fcpRet) && /issueFleetOrder\(/.test(fmoRet) && /issueFleetOrder\(/.test(fcpRet),
     'producenty idą przez issueFleetOrder, NIE przez mos.issueOrder wprost (anty-279)');
  ok(/memberTargets:\s*plan\.memberTargets/.test(fmoRet) && /memberRefusals:\s*plan\.memberRefusals/.test(fmoRet)
     && /memberTargets:\s*plan\.memberTargets/.test(fcpRet) && /memberRefusals:\s*plan\.memberRefusals/.test(fcpRet),
     'oba producenty podają memberTargets + memberRefusals do issueFleetOrder');
  ok(/plan\.memberTargets\[memberId\]\?\.targetBodyId/.test(fmoRet) && /plan\.memberTargets\[id\]\?\.targetBodyId/.test(fcpRet),
     'marker _pendingReturnDock = WŁASNE ciało członka (D-272-7)');
  const issueBody = fsys.slice(fsys.indexOf('issueFleetOrder(fleetId, spec) {'), fsys.indexOf('cancelFleetOrder(fleetId, reason'));
  ok(/spec\.memberRefusals\?\.\[vid\]/.test(issueBody) && /spec\.memberTargets\?\.\[v\.id\]/.test(issueBody)
     && /memberTargets:\s*spec\.memberTargets \? memberTargets : null/.test(issueBody),
     'FleetSystem.issueFleetOrder: memberRefusals w eligible, memberTargets w fan-oucie i w rekordzie');
  ok(/spec\.type === 'moveToPoint' && spec\.memberTargets\)/.test(issueBody) && /_arrivalSyncYear: gameYear \+ fleetEta/.test(issueBody),
     'FleetSystem: gałąź memberTargets BEZ syncu obok gałęzi z syncem (D-272-5)');
  const omoe = fsys.slice(fsys.indexOf('_onMemberOrderEnded(vesselId, orderId, mode) {'), fsys.indexOf('createFleet(name, opts'));
  const cfoStart = fsys.indexOf('cancelFleetOrder(fleetId, reason');
  const cfo  = fsys.slice(cfoStart, fsys.indexOf('applyDoctrine(fleet, spec) {', cfoStart));   // DEFINICJA za cancelFleetOrder, nie wywołanie w issueFleetOrder
  ok(omoe.length > 100 && cfo.length > 100 && !/memberTargets|memberRefusals/.test(omoe + cfo),
     'scope: _onMemberOrderEnded i cancelFleetOrder NIETKNIĘTE (bez memberTargets/memberRefusals)');
  ok(/if \(ao\.memberTargets\)\s+clone\.memberTargets\s+=/.test(stripComments(src('entities/Fleet.js'))),
     'Fleet.js: _cloneActiveOrder klonuje memberTargets (round-trip zapisu; pole opcjonalne, bez migracji)');
  // KONTRAKT helpera — WYKONANIEM: każdy nie-wrak ma dokładnie jeden wpis, wrak żadnego.
  world({ farColony: true });
  const A = ship({ sys: 'sys_home', auX: 3, name: 'Alfa' });
  const B = ship({ sys: 'sys_020', auX: 3, name: 'Beta' });
  const C = ship({ sys: 'sys_020', auX: 4, name: 'Gamma' }); warpTransit(C);
  const W = ship({ sys: 'sys_home', auX: 5, name: 'Wrak' }); W.isWreck = true;
  delete COLONIES.f_far;   // B zostaje bez własnej kolonii w SWOIM układzie
  const plan = Plan ? Plan.buildFleetReturnPlan([A, B, C, W], colMgr) : null;
  const entries = (id) => (plan?.memberTargets[id] ? 1 : 0) + (plan?.memberRefusals[id] ? 1 : 0);
  ok(!!plan && entries(A.id) === 1 && entries(B.id) === 1 && entries(C.id) === 1 && entries(W.id) === 0,
     `KONTRAKT: A/B/C po JEDNYM wpisie, wrak ZERO (${J(plan && { t: Object.keys(plan.memberTargets), r: plan.memberRefusals })})`);
  ok(!!plan && plan.memberRefusals[B.id] === 'no_friendly_planet' && plan.memberRefusals[C.id] === 'vessel_in_warp_transit'
     && plan.memberTargets[A.id]?.targetBodyId === 'p_home' && plan.memberTargets[A.id]?.targetName === 'Mstow',
     'KONTRAKT: powody per stan + jawny targetBodyId/targetName (D-272-6, 281 dla Powrotu)');
  // i18n — zero nowych kluczy: oba powody i toast istnieją w PL i EN
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    ok(['vessel.reasonNoFriendlyPlanet', 'vessel.reasonVesselInWarpTransit', 'fleet.noFriendlyPlanet', 'vessel.orderPartial']
         .every((k) => t(k) !== k), `${loc}: wszystkie klucze użyte przez ścieżkę ISTNIEJĄ (zero nowych)`);
  }
  setLocale('en');
}

setLocale(locale0);
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
