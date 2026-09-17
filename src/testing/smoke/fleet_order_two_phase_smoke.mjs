// ═══════════════════════════════════════════════════════════════════════════════
// fleet_order_two_phase_smoke — KEEPER Findingu 275 (D-E3: odrzucony rozkaz FLOTY kasował rozkaz,
// który flota WŁAŚNIE wykonywała). Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §275.
// Podpis właściciela (2026-09-17): D-275-1 = A2 · D-275-2 = `fleet:orderCancelled(replaced)`
// zostaje, fałszywe `fleet:orderCompleted` znika jako naprawa · D-275-3 = bez flagi (interakcja
// VO-3 OFF nazwana) · D-275-4 = snapshot TUŻ przed fan-outem.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `FleetSystem.issueFleetOrder:119` wołało `cancelFleetOrder(fleetId, 'replaced')`
//   PRZED bramką doktryny, PRZED `no_eligible_members` i PRZED fan-outem do MOS — JEDNOFAZOWA
//   preempcja na poziomie floty (residuum świata sprzed D-VO3a, `6b8b28c` 2026-05-20). Skutek
//   ZMIERZONY sondą na `5bbe6a0`: pełna odmowa (`no_weapons` ×2 albo `hold_position` + pursue)
//   ⇒ `activeOrder → null`, członkowie `in_transit/move_to_point` → `orbiting/idle/null` W POŁOWIE
//   LOTU (Δx = 0), a Dziennik dostawał fałszywe „zakończone" (`fleet:orderCompleted` z
//   `_onMemberOrderEnded`, gdy eager cancel zdejmował ostatniego śledzonego członka).
//   Teraz: snapshot → fan-out → rollback (nikt nie przyjął: rekord TEN SAM, zero zdarzeń) /
//   commit A2 (≥1 przyjął: odrzuceni, którzy NADAL trzymają rozkaz starej floty, stają `replaced`).
//
// ⚠ DLACZEGO PIN WYKONANIOWY NA PRAWDZIWYM `FleetSystem`+`MOS`+`VesselManager`: producenci
//   (PPM, FCP, FMO) po 255/8-9/268 bramkują TYLKO ramkę kamery; odmowy MOS (`no_weapons`,
//   `vessel_immobilized`, `vessel_in_reserve`, `vessel_in_warp_transit`, fuel) i bramka DOKTRYNY
//   docierają do fan-outu z KAŻDEGO producenta. Keeper `fleet_engage_picker_frame` T2b pinuje
//   przeżycie rozkazu U PRODUCENTA (return przed `issueFleetOrder`); ten keeper pinuje SEAM.
//
// ⚠ Fixture: gwiazda każdego układu stoi w (0,0); flota i wróg w `sys_home`, pozycje w px = AU × AU_TO_PX.
//   „Odmowa MOS" = `engage` na członkach BEZ modułu broni (`no_weapons`) — pierwsza odmowa, którą
//   `_issueEngage` zgłasza, niezależna od ramki, dystansu i paliwa.
//
// PINY (fail-first w PRAWDZIWYM `git worktree --detach 5bbe6a0`, checkout CRLF — liczby w raporcie):
//   T1   pełna odmowa MOS na ŻYWYM `moveToPoint`: TA SAMA referencja `activeOrder`, te same id
//        i `status='active'` członków, stan/misje/pozycje bit w bit, ZERO zdarzeń `fleet:*` /
//        `vessel:orderCancelled`, Δx > 0 po 20 tikach (statki LECĄ DALEJ)
//   T1k  KONTROLA: identyczny `engage` na flocie UZBROJONEJ przechodzi 2/2 — pin nie mierzy ciszy
//   T2   pełna odmowa PRZED MOS: doktryna `hold_position` + `pursue` ⇒ jak T1 (bramka `:138` leży
//        dziś PRZED snapshotem ⇒ no-op z konstrukcji, D-275-4)
//   T2b  `no_eligible_members` (wszyscy wrakami) ⇒ `activeOrder` nietknięty
//   T3   partial A2: A `engage` (stary `superseded`), B `mo=null/orbiting/idle` (jak dotąd — KONTROLA),
//        `activeOrder=engage{A}`, `fleet:orderCancelled(replaced)` PRZED `fleet:orderIssued` (KONTROLA),
//        BRAK `fleet:orderCompleted`
//   T3b  tożsamość rozkazu (A2): członek odrzucony, który trzyma OVERRIDE gracza (inny id niż rozkaz
//        starej floty), NIE traci go — `_onMemberOrderEnded` traktuje override tak samo (`tracked !== orderId`)
//   T4   pełny sukces: stare `superseded` (nie `cancelled`), 1× `fleet:orderCancelled(replaced)`,
//        1× `fleet:orderIssued`, 0× `fleet:orderCompleted`, ruch do NOWEGO celu
//   T5   pierwszy rozkaz bez `prev` ⇒ 0× `fleet:orderCancelled` (commit nie emituje pustego) — KONTROLA
//   T6   `unifiedVesselOrders=false` (VO-3 OFF): pełna odmowa nadal bit w bit (rollback nie zależy
//        od flagi); partial: przyjęty ma nowy rozkaz, odrzucony staje `replaced` (commit A2 flag-agnostyczny)
//   T7   ŹRÓDŁO (CRLF-safe, komentarze zdjęte): w ciele `issueFleetOrder` ZERO `this.cancelFleetOrder(`;
//        `fleet.activeOrder = null` stoi PRZED `mos.issueOrder(`; rollback `fleet.activeOrder = prevOrder` istnieje
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync }        from 'node:fs';
import { fileURLToPath }       from 'node:url';
import { dirname, join }       from 'node:path';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', '..');
const readSrc = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');   // CRLF-safe (Finding 270)
// Pin źródłowy czyta KOD, nie komentarze (lekcja `source-pin-strip-comments`).
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');

const AU  = GAME_CONFIG.AU_TO_PX;
const DT  = 0.01, CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });
const techStub = { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1, getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0 };

let vMgr, mos, fSys, events;

function scene() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: 'sys_home' };
  EntityManager.add({ id: 'star_h', type: 'star', name: 'G', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
  const home = { id: 'p_home', type: 'planet', name: 'Dom', x: AU, y: 0, radius: 8, mass: 1, orbital: orb(1), physics: { x: AU, y: 0 }, systemId: 'sys_home' };
  EntityManager.add(home);
  vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr); fSys = new FleetSystem(vMgr);
  events = [];
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: techStub,
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    debug: {},
  });
  // Rejestr zdarzeń — subskrybowany PO konstrukcji FleetSystem (jego handler biegnie pierwszy,
  // więc zagnieżdżony `fleet:orderCompleted` byłby widoczny w kolejności emisji).
  for (const ev of ['fleet:orderIssued', 'fleet:orderCancelled', 'fleet:orderCompleted', 'vessel:orderCancelled', 'vessel:orderIssued'])
    EventBus.on(ev, (d) => events.push({ ev, ...d }));
}
function ship({ xAU = 1, name = 'S', armed = true } = {}) {
  const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules: armed ? ['weapon_laser', 'engine_ion'] : ['engine_ion'] });
  v.position.x = xAU * AU; v.position.y = 0; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0; v.systemId = 'sys_home';
  v.warpFuel = { current: 5, max: 5, consumption: 0.5 };
  return v;
}
const enemy = (xAU) => { const e = ship({ xAU, name: 'Wrog' }); e.ownerEmpireId = 'emp_001'; e.owner = 'emp_001'; e.isEnemy = true; return e; };
const makeFleet = (...vs) => { const id = fSys.createFleet('F1').id; for (const v of vs) fSys.addMember(id, v.id); return id; };
function tick(n = 1) { for (let i = 0; i < n; i++) { window.KOSMOS.timeSystem.gameTime += DT; EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 }); } }
const snap = (v) => JSON.stringify({ mo: v.movementOrder ? [v.movementOrder.id, v.movementOrder.type, v.movementOrder.status] : null, st: v.position.state, status: v.status, dockedAt: v.position.dockedAt, mission: v.mission?.type ?? null, x: v.position.x, y: v.position.y });
const evNames = (from) => events.slice(from).filter(e => e.ev).map(e => `${e.ev}${e.reason ? '(' + e.reason + ')' : ''}${e.mode ? '(' + e.mode + ')' : ''}`);
const count = (list, prefix) => list.filter(s => s.startsWith(prefix)).length;

/** Flota w ŻYWYM moveToPoint po 5 tikach (członkowie `in_transit`). Zwraca id floty. */
function fleetOnMove(a, b) {
  const fid = makeFleet(a, b);
  const r = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetPoint: { x: 8 * AU, y: 0 } });
  if (!(r.ok && r.accepted.length === 2)) throw new Error('fixture: moveToPoint nie przyjęty 2/2');
  tick(5);
  return fid;
}

/** Wspólny pin „odmowa jest NO-OPEM": rekord, rozkazy, stan, zdarzenia, ruch. */
function assertNoOp(label, fid, a, b, prevRef, prevA, prevB, k, refusal) {
  const fleet = fSys.getFleet(fid);
  assert(refusal && refusal.ok === false && refusal.accepted.length === 0,
    `${label}a odmowa całej floty: ok=${refusal?.ok} accepted=${refusal?.accepted?.length} reason=${refusal?.reason ?? refusal?.rejected?.map(r => r.reason).join(',')}`);
  assert(fleet.activeOrder === prevRef,
    `${label}b \`activeOrder\` to TA SAMA referencja co przed odmową (type=${fleet.activeOrder?.type ?? 'null'})`);
  assert(snap(a) === prevA && snap(b) === prevB,
    `${label}c stan obu członków bit w bit (rozkaz/id/status/state/misja/pozycja): A=${snap(a) === prevA} B=${snap(b) === prevB}`);
  assert(a.movementOrder?.status === 'active' && b.movementOrder?.status === 'active',
    `${label}d oba rozkazy członków NADAL \`active\` (${a.movementOrder?.id}/${b.movementOrder?.id})`);
  const evs = evNames(k);
  assert(evs.length === 0,
    `${label}e ZERO zdarzeń w trakcie odmowy (było: fleet:orderCompleted + fleet:orderCancelled(replaced) + 2× vessel:orderCancelled): [${evs.join(' · ')}]`);
  const ax = a.position.x, bx = b.position.x; tick(20);
  const dA = (a.position.x - ax) / AU, dB = (b.position.x - bx) / AU;
  assert(dA > 0.1 && dB > 0.1 && a.position.state === 'in_transit',
    `${label}f statki LECĄ DALEJ starym rozkazem: ΔA=${dA.toFixed(3)} AU ΔB=${dB.toFixed(3)} AU state=${a.position.state} (na pristine Δ=0, dryf w połowie lotu)`);
}

// ── T1 — pełna odmowa MOS (`no_weapons` ×2) na żywym moveToPoint ────────────────────────────
header('T1  pełna odmowa MOS (engage → no_weapons ×2) na ŻYWYM moveToPoint ⇒ NO-OP');
{
  scene();
  const a = ship({ name: 'A', armed: false }), b = ship({ xAU: 1.2, name: 'B', armed: false }); const e = enemy(5);
  const fid = fleetOnMove(a, b);
  const prevRef = fSys.getFleet(fid).activeOrder, prevA = snap(a), prevB = snap(b);
  assert(prevRef?.type === 'moveToPoint' && a.position.state === 'in_transit' && b.position.state === 'in_transit',
    'T1 KONTROLA fixture: flota MA żywy moveToPoint, oba członkowie in_transit');
  const k = events.length;
  const r = fSys.issueFleetOrder(fid, { type: 'engage', targetEntityId: e.id });
  assert(r.rejected.length === 2 && r.rejected.every(x => x.reason === 'no_weapons'),
    `T1 KONTROLA odmowy: oba powody = no_weapons (${r.rejected.map(x => x.reason).join(',')})`);
  assertNoOp('T1', fid, a, b, prevRef, prevA, prevB, k, r);
}

// ── T1k — KONTROLA: ten sam engage na flocie UZBROJONEJ przechodzi ─────────────────────────
header('T1k KONTROLA: identyczny engage na flocie UZBROJONEJ przechodzi 2/2 (pin T1 nie mierzy ciszy)');
{
  scene();
  const a = ship({ name: 'A' }), b = ship({ xAU: 1.2, name: 'B' }); const e = enemy(5);
  const fid = fleetOnMove(a, b);
  const oldA = a.movementOrder, oldB = b.movementOrder;
  const r = fSys.issueFleetOrder(fid, { type: 'engage', targetEntityId: e.id });
  assert(r.ok && r.accepted.length === 2 && fSys.getFleet(fid).activeOrder?.type === 'engage',
    `T1k engage przyjęty 2/2, activeOrder=engage (ok=${r.ok}, acc=${r.accepted.length})`);
  assert(oldA.status === 'superseded' && oldB.status === 'superseded' && a.movementOrder?.type === 'engage' && b.movementOrder?.type === 'engage',
    `T1k stare rozkazy \`superseded\` przez VO-3, nowe engage na obu (${oldA.status}/${oldB.status})`);
}

// ── T2 — pełna odmowa PRZED MOS: doktryna hold_position + pursue ───────────────────────────
header('T2  odmowa PRZED MOS: doktryna hold_position + pursue ⇒ NO-OP (bramka :138 leży przed snapshotem)');
{
  scene();
  const a = ship({ name: 'A' }), b = ship({ xAU: 1.2, name: 'B' }); const e = enemy(5);
  const fid = fleetOnMove(a, b);
  fSys.setDoctrine(fid, 'hold_position');
  const prevRef = fSys.getFleet(fid).activeOrder, prevA = snap(a), prevB = snap(b);
  const k = events.length;
  const r = fSys.issueFleetOrder(fid, { type: 'pursue', targetEntityId: e.id });
  assert(r.reason === 'doctrine_hold_position',
    `T2 KONTROLA: odmowa z bramki doktryny, bez udziału MOS (reason=${r.reason})`);
  assertNoOp('T2', fid, a, b, prevRef, prevA, prevB, k, r);
}

// ── T2b — no_eligible_members (wszyscy wrakami) ⇒ activeOrder nietknięty ───────────────────
header('T2b no_eligible_members (wszyscy członkowie wrakami) ⇒ activeOrder nietknięty');
{
  scene();
  const a = ship({ name: 'A' }), b = ship({ xAU: 1.2, name: 'B' });
  const fid = fleetOnMove(a, b);
  const prevRef = fSys.getFleet(fid).activeOrder;
  a.isWreck = true; b.isWreck = true;
  const k = events.length;
  const r = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetPoint: { x: 2 * AU, y: 0 } });
  assert(r.ok === false && r.reason === 'no_eligible_members', `T2b KONTROLA: reason=${r.reason}`);
  assert(fSys.getFleet(fid).activeOrder === prevRef && count(evNames(k), 'fleet:') === 0,
    `T2b activeOrder = ta sama referencja, zero zdarzeń fleet:* (type=${fSys.getFleet(fid).activeOrder?.type ?? 'null'})`);
}

// ── T3 — partial A2: A engage OK, B no_weapons ─────────────────────────────────────────────
header('T3  partial A2 — A uzbrojony (engage OK), B bez broni (no_weapons)');
{
  scene();
  const a = ship({ name: 'A', armed: true }), b = ship({ xAU: 1.2, name: 'B', armed: false }); const e = enemy(5);
  const fid = fleetOnMove(a, b);
  const oldA = a.movementOrder, oldB = b.movementOrder;
  const k = events.length;
  const r = fSys.issueFleetOrder(fid, { type: 'engage', targetEntityId: e.id });
  assert(r.ok && r.accepted.length === 1 && r.accepted[0] === a.id && r.rejected[0]?.vesselId === b.id && r.rejected[0]?.reason === 'no_weapons',
    `T3a partial: A przyjęty, B odrzucony no_weapons (acc=${r.accepted.join(',')} rej=${r.rejected.map(x => x.vesselId + ':' + x.reason).join(',')})`);
  assert(a.movementOrder?.type === 'engage' && oldA.status === 'superseded',
    `T3b A: nowy engage, stary ${oldA.id} \`superseded\` (VO-3)`);
  assert(b.movementOrder == null && oldB.status === 'cancelled' && oldB.blockReason === 'replaced' && b.position.state === 'orbiting' && b.status === 'idle',
    `T3c KONTROLA (A2 = jak dotąd): B bez rozkazu, stary ${oldB.id} cancelled(replaced), orbiting/idle`);
  const ao = fSys.getFleet(fid).activeOrder;
  assert(ao?.type === 'engage' && Object.keys(ao.memberOrderIds).join(',') === a.id,
    `T3d activeOrder = engage, śledzi TYLKO przyjętego (${Object.keys(ao?.memberOrderIds ?? {}).join(',')})`);
  const evs = evNames(k);
  const iCancel = evs.indexOf('fleet:orderCancelled(replaced)'), iIssued = evs.indexOf('fleet:orderIssued');
  assert(iCancel !== -1 && iIssued !== -1 && iCancel < iIssued,
    `T3e KONTROLA kolejności: fleet:orderCancelled(replaced) PRZED fleet:orderIssued [${evs.join(' · ')}]`);
  assert(count(evs, 'fleet:orderCompleted') === 0,
    `T3f BRAK fałszywego fleet:orderCompleted przy re-orderze (D-275-2) [${evs.join(' · ')}]`);
  assert(count(evs, 'vessel:orderCancelled(replaced)') === 1 && count(evs, 'vessel:orderCancelled(superseded)') === 1,
    `T3g dokładnie 1× vessel:orderCancelled(replaced) [B] i 1× (superseded) [A]`);
  const bx = b.position.x; tick(20);
  assert(Math.abs(b.position.x - bx) < 1e-9, `T3h B stoi (Δx=${((b.position.x - bx) / AU).toFixed(4)} AU) — semantyka partial zachowana`);
}

// ── T3b — tożsamość rozkazu: override gracza na odrzuconym członku przeżywa ─────────────────
header('T3b tożsamość rozkazu (A2): odrzucony członek z OVERRIDE gracza (inny id) NIE traci go');
{
  scene();
  const a = ship({ name: 'A', armed: true }), b = ship({ xAU: 1.2, name: 'B', armed: false }); const e = enemy(5);
  const fid = fleetOnMove(a, b);
  // Override: gracz PPM-em daje B własny moveToPoint (inny id niż rozkaz floty).
  const ov = mos.issueOrder(b.id, { type: 'moveToPoint', targetPoint: { x: 1.2 * AU, y: 6 * AU } });
  assert(ov.ok && b.movementOrder?.id === ov.orderId && b.movementOrder.id !== fSys.getFleet(fid).activeOrder.memberOrderIds[b.id],
    `T3b KONTROLA: B ma override ${ov.orderId} ≠ rozkaz floty ${fSys.getFleet(fid).activeOrder.memberOrderIds[b.id] ?? '(zdjęty z trackingu)'}`);
  const r = fSys.issueFleetOrder(fid, { type: 'engage', targetEntityId: e.id });
  assert(r.ok && r.accepted.length === 1 && r.rejected[0]?.vesselId === b.id,
    `T3b partial: A przyjęty, B odrzucony (${r.rejected[0]?.reason})`);
  assert(b.movementOrder?.id === ov.orderId && b.movementOrder.status === 'active',
    `T3b override B PRZEŻYWA commit (${b.movementOrder?.id}:${b.movementOrder?.status}) — commit kasuje tylko rozkaz STAREJ FLOTY`);
}

// ── T4 — pełny sukces: moveToPoint → moveToPoint gdzie indziej ─────────────────────────────
header('T4  pełny sukces — re-order moveToPoint: stare superseded, 1× cancelled(replaced), 0× completed');
{
  scene();
  const a = ship({ name: 'A' }), b = ship({ xAU: 1.2, name: 'B' });
  const fid = fleetOnMove(a, b);
  const oldA = a.movementOrder, oldB = b.movementOrder;
  const k = events.length;
  const r = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetPoint: { x: 1.1 * AU, y: 6 * AU } });
  assert(r.ok && r.accepted.length === 2 && fSys.getFleet(fid).activeOrder?.targetPoint?.y === 6 * AU,
    `T4a re-order przyjęty 2/2, activeOrder celuje w nowy punkt`);
  assert(oldA.status === 'superseded' && oldB.status === 'superseded',
    `T4b stare rozkazy \`superseded\` (VO-3), NIE \`cancelled\` (${oldA.status}/${oldB.status})`);
  const evs = evNames(k);
  assert(count(evs, 'fleet:orderCancelled(replaced)') === 1 && count(evs, 'fleet:orderIssued') === 1 && count(evs, 'fleet:orderCompleted') === 0,
    `T4c 1× fleet:orderCancelled(replaced), 1× fleet:orderIssued, 0× fleet:orderCompleted [${evs.join(' · ')}]`);
  assert(count(evs, 'vessel:orderCancelled(replaced)') === 0,
    `T4d żaden członek nie dostał cancel(replaced) — wszyscy przyjęli (VO-3 supersede)`);
  const y0 = a.position.y; tick(20);
  assert(a.position.y - y0 > 0.1 * AU && a.position.state === 'in_transit',
    `T4e statki lecą do NOWEGO celu (Δy=${((a.position.y - y0) / AU).toFixed(3)} AU)`);
}

// ── T5 — pierwszy rozkaz bez prev ⇒ zero fleet:orderCancelled ─────────────────────────────
header('T5  KONTROLA: pierwszy rozkaz floty (brak prev) ⇒ 0× fleet:orderCancelled, 1× fleet:orderIssued');
{
  scene();
  const a = ship({ name: 'A' }), b = ship({ xAU: 1.2, name: 'B' });
  const fid = makeFleet(a, b);
  const k = events.length;
  const r = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetPoint: { x: 8 * AU, y: 0 } });
  const evs = evNames(k);
  assert(r.ok && count(evs, 'fleet:orderCancelled') === 0 && count(evs, 'fleet:orderIssued') === 1,
    `T5 [${evs.join(' · ')}]`);
}

// ── T6 — VO-3 OFF (unifiedVesselOrders=false): rollback i commit nie zależą od flagi ───────
header('T6  unifiedVesselOrders=false (VO-3 OFF): rollback bit w bit; commit A2 flag-agnostyczny');
{
  const prevFlag = GAME_CONFIG.FEATURES.unifiedVesselOrders;
  GAME_CONFIG.FEATURES.unifiedVesselOrders = false;
  try {
    scene();
    const a = ship({ name: 'A', armed: false }), b = ship({ xAU: 1.2, name: 'B', armed: false }); const e = enemy(5);
    const fid = fleetOnMove(a, b);
    const prevRef = fSys.getFleet(fid).activeOrder, prevA = snap(a), prevB = snap(b);
    const k = events.length;
    const r = fSys.issueFleetOrder(fid, { type: 'engage', targetEntityId: e.id });
    assertNoOp('T6', fid, a, b, prevRef, prevA, prevB, k, r);

    scene();
    const c = ship({ name: 'C', armed: true }), d = ship({ xAU: 1.2, name: 'D', armed: false }); const e2 = enemy(5);
    const fid2 = fleetOnMove(c, d);
    const oldD = d.movementOrder;
    const k2 = events.length;
    const r2 = fSys.issueFleetOrder(fid2, { type: 'engage', targetEntityId: e2.id });
    const evs = evNames(k2);
    assert(r2.ok && c.movementOrder?.type === 'engage' && d.movementOrder == null && oldD.status === 'cancelled' && oldD.blockReason === 'replaced'
        && fSys.getFleet(fid2).activeOrder?.type === 'engage' && count(evs, 'fleet:orderCancelled(replaced)') === 1 && count(evs, 'fleet:orderCompleted') === 0,
      `T6g partial pod VO-3 OFF: C engage, D cancelled(replaced), activeOrder=engage, 1× fleet:orderCancelled(replaced), 0× completed [${evs.join(' · ')}]`);
  } finally {
    GAME_CONFIG.FEATURES.unifiedVesselOrders = prevFlag;
  }
}

// ── T7 — ŹRÓDŁO (CRLF-safe, komentarze zdjęte) ────────────────────────────────────────────
header('T7  ŹRÓDŁO: issueFleetOrder bez cancelFleetOrder; snapshot PRZED mos.issueOrder; rollback istnieje');
{
  const src = stripComments(readSrc('systems/FleetSystem.js'));
  const start = src.indexOf('issueFleetOrder(fleetId, spec) {');
  const end   = src.indexOf('\n  cancelFleetOrder(', start);
  const body  = (start !== -1 && end !== -1) ? src.slice(start, end) : '';
  assert(body.length > 500, `T7 KONTROLA: ciało issueFleetOrder wyodrębnione (${body.length} znaków)`);
  assert(!/this\.cancelFleetOrder\(/.test(body),
    'T7a w ciele issueFleetOrder NIE MA `this.cancelFleetOrder(` (eager cancel :119 skasowany)');
  const iHide = body.indexOf('fleet.activeOrder = null'), iFan = body.indexOf('mos.issueOrder(');
  assert(iHide !== -1 && iFan !== -1 && iHide < iFan,
    `T7b snapshot/ukrycie \`fleet.activeOrder = null\` stoi PRZED fan-outem \`mos.issueOrder(\` (${iHide} < ${iFan})`);
  assert(/fleet\.activeOrder = prevOrder/.test(body) && body.indexOf('fleet.activeOrder = prevOrder') > iFan,
    'T7c rollback `fleet.activeOrder = prevOrder` istnieje i stoi PO fan-oucie');
  assert(/cancelFleetOrder\(fleetId, reason = 'manual'\)/.test(src),
    'T7d KONTROLA: `cancelFleetOrder` (Stop) nietknięty — dalej istnieje jako metoda publiczna');
}

console.log(`\n════ fleet_order_two_phase_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail ? 1 : 0);
