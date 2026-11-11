// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// rendezvous_663_smoke — KEEPER Findingu 663 (MECHANIKA, poza arciem CV; decyzja właściciela 2026-11-11).
//   Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §3.2-18, §5 #663. Dane: `src/data/RendezvousData.js`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Defekt (zmierzony w CV-3a3): „leć do planety” dla statku wolniejszego od planety i za nią — przechwycenie
//   (`VesselManager._interceptBody`, SB39) brało PIERWSZE możliwe spotkanie, czyli po drugiej stronie orbity: 32,7 AU za gwiazdą
//   (≈ 28 lat) dla statku 0,1 AU od planety. W wygenerowanych układach (sonda): statek 0,05–2 AU za / obok planety — mediana
//   3,7 roku, do 19 lat; statek przy planecie wysłany na jej księżyc (0,04 AU) — 1,2–4,0 roku.
// Decyzja: (A) statek JUŻ przy ciele (dok / orbita tego ciała albo < `CAPTURE_AU`, dla księżyca także od planety) — przylot od
//   razu, orbita w następnym tiku (wszyscy, także AI); (B) dalej — najwcześniejsze spotkanie (wolno przylecieć wcześniej i czekać),
//   a gdy jest dalej niż horyzont max(`HORIZON_MIN_YEARS`, `HORIZON_MULT` × lot po prostej do bieżącej pozycji ciała) — rozkaz
//   GRACZA odrzucony z powodem i ETA (PL + EN). Odwrót z bitwy — żadna z reguł (lot ucieczki M1).
// CO PINUJE (wyłącznie logika, PRAWDZIWY `MovementOrderSystem` + `VesselManager`, świat headless z ciałami Keplera):
//   R1 część A: statek na orbicie / wolny 0,3 AU za planetą / w doku przy planecie wysłany na jej księżyc / statek AI — przylot
//      od razu (`arrivalYear` = teraz), po jednym tiku orbita ciała, rozkaz zakończony; KONTROLE: przechwycenie z tego samego
//      punktu to spotkanie po drugiej stronie orbity (świat odtwarza defekt); statek W DOKU przy planecie stoi w jej środku, więc
//      przechwycenie z odległości 0 dawało „teraz” już przed krokiem; odwrót i statek w aktywnym starciu — NIE
//   fail-first na `92b54ff` (worktree): 11 PASS / 16 FAIL — zielone wyłącznie kontrole (R1-0, R1c, R1g, R2-0, R2f-0, R2i,
//      R3a–R3d, R4-0)
//   R2 część B: statek gracza 0,8 AU za planetą — odmowa `rendezvous_beyond_horizon`, ETA = najwcześniejsze spotkanie wyroczni
//      (±0,002 roku), horyzont = max(1, 3 × lot po prostej); odmowa bez mutacji (misja, paliwo, pozycja, poprzedni rozkaz);
//      tekst PL i EN z ETA, bez surowego sluga; menu prawego kliku („Lecisz do planety”) — wpis Dziennika z ETA; flota — odrzucony
//      członek z ETA, przyjęty nie czeka na jego spotkanie; pokrętło na żywo; KONTROLE: AI i odwrót w tym samym punkcie — przyjęte
//   R3 bez zmian: statek szybszy od ciała (za nim), ciało nieruchome, rozkaz z daleka, punkt w scenie bitwy (`noBodySnap`)
//   R4 `groupArrivalYear`: członkowie przy ciele nie wyznaczają chwili grupy; wszyscy przy ciele — chwila = teraz
// ⚠ Import modułu danych dynamicznie: na kodzie sprzed kroku pliku nie ma — pin dostaje kolor, przebieg się nie wywraca.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { PhysicsSystem }       from '../../systems/PhysicsSystem.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { RightClickMenu }      from '../../ui/RightClickMenu.js';
import { buildMenuOptions }    from '../../data/RightClickMenuOptions.js';
import { describeOrderFail }   from '../../utils/CameraFrame.js';
import { groupArrivalYear }    from '../../utils/GroupArrival.js';
import { KeplerMath }          from '../../utils/KeplerMath.js';
import { setLocale }           from '../../i18n/i18n.js';

const RD = await import('../../data/RendezvousData.js').catch(() => null);
const TUNING = RD?.RENDEZVOUS_TUNING ?? null;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };

const AU  = GAME_CONFIG.AU_TO_PX;
const CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const DT  = 0.002;                                   // rok gry na tik
const SPEED = 1.0;                                   // AU / rok gry — jak przypadek z pomiaru (statek 1,0 AU/rok)
const SYS = 'sys_t';
const T0  = 100;
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

let vMgr, mos, fSys, log;
function bodyFromOrbit(id, type, orb, parent = null) {
  const E = KeplerMath.solveKepler(orb.M, orb.e);
  const th = KeplerMath.eccentricToTrueAnomaly(E, orb.e);
  const r = KeplerMath.orbitalRadius(orb.a, orb.e, th);
  const ang = th + orb.inclinationOffset;
  const px = parent?.x ?? 0, py = parent?.y ?? 0;
  return { id, type, name: id, systemId: SYS, radius: 4, mass: 1, visual: { radius: 4 }, orbital: { ...orb, theta: th },
           x: px + r * Math.cos(ang) * AU, y: py + r * Math.sin(ang) * AU, ...(parent ? { parentPlanetId: parent.id } : {}) };
}
function scene({ encounterWith = null } = {}) {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: T0 }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  // planeta z pomiaru: 3 AU, okres 5,196 roku ⇒ ~3,63 AU / rok — szybsza od statku 1,0 AU / rok
  const mid = bodyFromOrbit('p_mid', 'planet', { a: 3, e: 0, T: 3 ** 1.5, M: 0.6, inclinationOffset: 0 });
  // wolne ciało — 40 AU, ~0,99 AU / rok (statek 2,5 AU / rok jest szybszy)
  const slow = bodyFromOrbit('p_slow', 'planet', { a: 40, e: 0.02, T: 253, M: 2.0, inclinationOffset: 0 });
  EntityManager.add(mid); EntityManager.add(slow);
  const moon = bodyFromOrbit('m_mid', 'moon', { a: 0.04, e: 0, T: 0.03, M: 1.0, inclinationOffset: 0 }, mid);
  EntityManager.add(moon);
  new PhysicsSystem();                               // PRZED VesselManager — kolejność `time:tick` jak w GameScene
  vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr); fSys = new FleetSystem(vMgr);
  log = [];
  const cols = [{ planetId: 'p_slow', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: slow, vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_slow', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: (e) => log.push(e) },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    deepSpaceCombatSystem: { _findActiveEncounterContaining: (id) => (encounterWith && id === encounterWith() ? { id: 'enc_k' } : null) },
    debug: { combatTrace: false },
  });
  return { mid, slow, moon };
}
function ship({ x, y, name = 'S', empire = null, speed = SPEED, state = 'orbiting', dockedAt = null } = {}) {
  const v = vMgr.createAndRegister('hull_frigate', 'p_slow', { name, modules: ['weapon_laser', 'engine_ion'] });
  v.position.x = x; v.position.y = y; v.position.state = state; v.position.dockedAt = dockedAt;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = speed; v.systemId = SYS;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
  return v;
}
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    window.KOSMOS.timeSystem.gameTime += DT;
    EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 });
  }
}
/** Punkt `d` AU od ciała: za nim (przeciwnie do ruchu), przed nim albo na zewnątrz orbity. */
function around(body, d, where = 'behind') {
  const p1 = vMgr._predictPosition(body.id, window.KOSMOS.timeSystem.gameTime + 1e-4);
  let ux = p1.x - body.x, uy = p1.y - body.y; const n = Math.hypot(ux, uy); ux /= n; uy /= n;
  const r = Math.hypot(body.x, body.y), ox = body.x / r, oy = body.y / r;
  const [dx, dy] = where === 'behind' ? [-ux, -uy] : where === 'ahead' ? [ux, uy] : [ox, oy];
  return { x: body.x + dx * d * AU, y: body.y + dy * d * AU };
}
/** Punkt NA orbicie ciała `deg` stopni przed nim (w kierunku ruchu) — tam ciało przyjdzie samo. */
function onOrbitAhead(body, deg) {
  const p1 = vMgr._predictPosition(body.id, window.KOSMOS.timeSystem.gameTime + 1e-4);
  const sign = Math.sign(body.x * (p1.y - body.y) - body.y * (p1.x - body.x)) || 1;   // CCW (+) / CW (−)
  const a = Math.atan2(body.y, body.x) + sign * deg * Math.PI / 180, r = Math.hypot(body.x, body.y);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}
/** Wyrocznia: najwcześniejsza chwila ≥ teraz, w której trasa do ciała mieści się w prędkości statku (skan 0,0005 roku). */
function oracleIntercept(bodyId, sx, sy, speed) {
  const now = window.KOSMOS.timeSystem.gameTime;
  for (let t = now; t < now + 60; t += 0.0005) {
    const P = vMgr._predictPosition(bodyId, t);
    const L = vMgr._calcRoute(sx, sy, P.x, P.y, SYS).totalDist / AU;
    if (L <= speed * (t - now) + 1e-9) return t;
  }
  return NaN;
}
const order = (v, bodyId, extra = {}) => {
  const b = EntityManager.get(bodyId);
  return mos.issueOrder(v.id, { type: 'moveToPoint', targetBodyId: bodyId, targetPoint: { x: b.x, y: b.y }, issuedBy: 'keeper', ...extra });
};
const distAU = (v, bodyId) => { const b = EntityManager.get(bodyId); return Math.hypot(v.position.x - b.x, v.position.y - b.y) / AU; };

// ═══ R1 — część A: statek już przy ciele ═══════════════════════════════════════════════════════════════════════════
block('R1 — część A: statek przy ciele — przylot od razu, orbita w następnym tiku', () => {
  // (a) statek NA ORBICIE planety (slot 0,05 AU za nią — przypadek z pomiaru)
  let { mid } = scene();
  let st = around(mid, 0.05);
  let v = ship({ ...st, name: 'Orbita', dockedAt: 'p_mid' });
  const icBug = vMgr._interceptBody('p_mid', v.position.x, v.position.y, SPEED, { systemId: SYS });
  const bugEta = icBug ? icBug.arrivalYear - T0 : NaN;
  const bugDist = icBug ? Math.hypot(icBug.x - v.position.x, icBug.y - v.position.y) / AU : NaN;
  console.log(`     KONTROLA defektu: przechwycenie ze slotu orbity — spotkanie za ${fmt(bugEta, 2)} roku, ${fmt(bugDist, 2)} AU od statku`);
  assert(bugEta > 2 && bugDist > 2, `R1-0 KONTROLA: świat odtwarza defekt — „pierwsze spotkanie” ze slotu orbity jest po drugiej stronie orbity (${fmt(bugEta, 2)} roku, ${fmt(bugDist, 2)} AU)`);
  let completed = 0;
  EventBus.on('vessel:orderCompleted', ({ vesselId }) => { if (vesselId === v.id) completed++; });
  let r = order(v, 'p_mid');
  assert(r?.ok && v.mission?.targetId === 'p_mid' && Math.abs(v.mission.arrivalYear - T0) < 1e-9,
    `R1a SEDNO: statek na orbicie planety — rozkaz przyjęty z przylotem TERAZ (ETA ${fmt((v.mission?.arrivalYear ?? NaN) - T0, 4)} roku; było ${fmt(bugEta, 2)})`);
  tick();
  assert(v.position.state === 'orbiting' && v.position.dockedAt === 'p_mid' && v.mission == null && completed === 1 && distAU(v, 'p_mid') < 0.01,
    `R1b po jednym tiku: orbita planety (stan ${v.position.state}, dok ${v.position.dockedAt}), rozkaz zakończony (${completed}), ${fmt(distAU(v, 'p_mid'), 4)} AU od ciała`);

  // (b) statek W DOKU przy planecie
  ({ mid } = scene());
  v = ship({ x: mid.x, y: mid.y, name: 'Dok', state: 'docked', dockedAt: 'p_mid' });
  r = order(v, 'p_mid');
  tick();
  assert(r?.ok && v.position.state === 'orbiting' && v.position.dockedAt === 'p_mid',
    `R1c KONTROLA: statek w doku przy planecie (pozycja = środek ciała) — od razu na jej orbicie, jak przed krokiem (przechwycenie z odległości 0 = teraz) (stan ${v.position.state}, dok ${v.position.dockedAt})`);

  // (c) statek WOLNY 0,3 AU za planetą (po bitwie, bez orbity)
  ({ mid } = scene());
  st = around(mid, 0.3);
  v = ship({ ...st, name: 'Wolny' });
  const icFree = vMgr._interceptBody('p_mid', st.x, st.y, SPEED, { systemId: SYS });
  r = order(v, 'p_mid');
  const etaFree = (v.mission?.arrivalYear ?? NaN) - T0;
  tick();
  assert(r?.ok && Math.abs(etaFree) < 1e-9 && v.position.dockedAt === 'p_mid' && (icFree?.arrivalYear - T0) > 2,
    `R1d wolny statek 0,3 AU za planetą — przylot od razu i orbita (ETA ${fmt(etaFree, 4)}; przechwycenie dawało ${fmt(icFree?.arrivalYear - T0, 2)} roku)`);

  // (d) statek w doku przy planecie wysłany na JEJ księżyc (0,04 AU)
  const sc = scene(); mid = sc.mid;
  v = ship({ x: mid.x, y: mid.y, name: 'Księżyc', state: 'docked', dockedAt: 'p_mid' });
  const icMoon = vMgr._interceptBody('m_mid', mid.x, mid.y, SPEED, { systemId: SYS });
  r = order(v, 'm_mid');
  tick();
  assert(r?.ok && v.position.dockedAt === 'm_mid' && (icMoon?.arrivalYear - T0) > 0.5,
    `R1e statek przy planecie → jej księżyc: od razu na orbicie księżyca (dok ${v.position.dockedAt}; przechwycenie dawało ${fmt(icMoon?.arrivalYear - T0, 2)} roku)`);

  // (e) statek AI na orbicie planety — część A obejmuje AI
  ({ mid } = scene());
  st = around(mid, 0.05);
  v = ship({ ...st, name: 'AI', empire: 'emp_k', dockedAt: 'p_mid' });
  r = order(v, 'p_mid');
  assert(r?.ok && Math.abs((v.mission?.arrivalYear ?? NaN) - T0) < 1e-9, `R1f statek AI na orbicie planety — też przylot od razu (ETA ${fmt((v.mission?.arrivalYear ?? NaN) - T0, 4)})`);

  // (f) ODWRÓT z bitwy — NIE przechwytujemy (lot ucieczki M1 zostaje prawdziwym lotem)
  ({ mid } = scene());
  st = around(mid, 0.3);
  v = ship({ ...st, name: 'Ucieka' });
  r = order(v, 'p_mid', { isRetreat: true });
  assert(r?.ok && (v.mission?.arrivalYear ?? T0) - T0 > 0.5, `R1g KONTROLA: odwrót (isRetreat) w tym samym punkcie — bez przechwycenia na miejscu, lot (ETA ${fmt((v.mission?.arrivalYear ?? NaN) - T0, 2)} roku)`);

  // (g) statek w AKTYWNYM starciu — NIE (skok na orbitę wyjąłby go z bitwy); gracz ⇒ część B
  let vid = null;
  ({ mid } = scene({ encounterWith: () => vid }));
  st = around(mid, 0.3);
  v = ship({ ...st, name: 'Walczy' }); vid = v.id;
  r = order(v, 'p_mid');
  assert(r?.ok === false && r.reason === 'rendezvous_beyond_horizon' && v.mission == null,
    `R1h statek w aktywnym starciu 0,3 AU od planety — bez przechwycenia na miejscu (odmowa części B: ${r?.reason})`);
});

// ═══ R2 — część B: horyzont ════════════════════════════════════════════════════════════════════════════════════════
block('R2 — część B: spotkanie dalej niż horyzont — odmowa z ETA (gracz)', () => {
  let { mid } = scene();
  const st = around(mid, 0.8);
  let v = ship({ ...st, name: 'Za planetą' });
  const truth = oracleIntercept('p_mid', st.x, st.y, SPEED) - T0;
  const direct = Math.hypot(mid.x - st.x, mid.y - st.y) / AU / SPEED;
  const horizon = Math.max(1, 3 * direct);
  // poprzedni rozkaz (punkt w pustej przestrzeni) — odmowa ma go zostawić (dwufazowa preempcja)
  const prev = mos.issueOrder(v.id, { type: 'moveToPoint', targetPoint: { x: st.x + 0.2 * AU, y: st.y + 0.6 * AU }, noBodySnap: true, issuedBy: 'keeper' });
  const before = JSON.stringify({ m: v.mission, f: v.fuel.current, p: { x: v.position.x, y: v.position.y }, o: v.movementOrder?.id });
  const r = order(v, 'p_mid');
  const after = JSON.stringify({ m: v.mission, f: v.fuel.current, p: { x: v.position.x, y: v.position.y }, o: v.movementOrder?.id });
  console.log(`     statek 0,8 AU za planetą: wyrocznia — spotkanie za ${fmt(truth, 3)} roku; lot po prostej ${fmt(direct, 3)} roku ⇒ horyzont ${fmt(horizon, 3)}; odmowa ${JSON.stringify(r)}`);
  assert(prev?.ok && truth > horizon, `R2-0 KONTROLA: spotkanie wyroczni (${fmt(truth, 2)}) dalej niż horyzont (${fmt(horizon, 2)}) — przypadek nie jest jałowy`);
  assert(r?.ok === false && r.reason === 'rendezvous_beyond_horizon', `R2a SEDNO: rozkaz gracza odrzucony (${r?.reason})`);
  assert(Math.abs((r?.etaYears ?? NaN) - truth) <= 0.002 && Math.abs((r?.horizonYears ?? NaN) - horizon) < 1e-6,
    `R2b ETA w odmowie = najwcześniejsze spotkanie (${fmt(r?.etaYears)} vs ${fmt(truth)}), horyzont = max(1, 3 × lot po prostej) (${fmt(r?.horizonYears)} vs ${fmt(horizon)})`);
  assert(before === after, 'R2c odmowa bez mutacji: poprzedni rozkaz, misja, paliwo i pozycja nietknięte');

  // tekst powodu PL / EN — z ETA i horyzontem, bez surowego sluga
  const f = { vesselId: v.id, reason: r?.reason, etaYears: r?.etaYears, horizonYears: r?.horizonYears };
  setLocale('pl'); const pl = describeOrderFail(f);
  setLocale('en'); const en = describeOrderFail(f);
  setLocale('pl');
  console.log(`     PL: ${pl}\n     EN: ${en}`);
  const etaTxt = (r?.etaYears ?? 0).toFixed(1), hzTxt = (r?.horizonYears ?? 0).toFixed(1);
  assert(pl.includes(etaTxt) && pl.includes(hzTxt) && en.includes(etaTxt) && en.includes(hzTxt) && !/rendezvous_beyond_horizon/.test(pl + en) && pl !== en,
    `R2d tekst odmowy PL i EN z ETA ${etaTxt} i limitem ${hzTxt}, bez surowego sluga`);

  // menu prawego kliku — „Lecisz do planety” — wpis Dziennika z ETA
  ({ mid } = scene());
  v = ship({ ...around(mid, 0.8), name: 'Menu' });
  window.KOSMOS.uiManager = { getSelectedVesselId: () => v.id, getSelectedVesselIds: () => [v.id], getSelectedFleetId: () => null };
  const tgt = { type: 'planet', planet: mid, entityId: mid.id, worldPoint: { x: mid.x, y: mid.y } };
  const opt = buildMenuOptions(tgt, { vesselId: v.id }).find(o => o.id === 'moveToPlanet');
  new RightClickMenu()._handleOptionClick(opt, tgt);
  const line = log.map(e => e.text).join(' | ');
  console.log(`     Dziennik: ${line}`);
  assert(!!opt && v.mission == null && log.length === 1 && log[0].severity === 'warn' && /\d+\.\d/.test(line) && !/rendezvous_beyond_horizon/.test(line),
    'R2e menu „Lecisz do planety” — jedna linia Dziennika (warn) z ETA, bez surowego sluga, statek nie leci');

  // flota: członek za planetą odrzucony z ETA; przyjęty nie czeka na jego spotkanie
  ({ mid } = scene());
  const far = ship({ ...onOrbitAhead(mid, 40), name: 'Przed planetą' });
  const near = ship({ ...around(mid, 0.8), name: 'Za planetą' });
  const fid = fSys.createFleet('F663').id; fSys.addMember(fid, far.id); fSys.addMember(fid, near.id);
  const ownFar = vMgr._interceptBody('p_mid', far.position.x, far.position.y, SPEED, { systemId: SYS });
  const ownNear = vMgr._interceptBody('p_mid', near.position.x, near.position.y, SPEED, { systemId: SYS });
  assert(ownNear.arrivalYear - ownFar.arrivalYear > 1 && (ownNear.arrivalYear - T0) < 10 * (ownFar.arrivalYear - T0),
    `R2f-0 KONTROLA: spotkanie członka za planetą (${fmt(ownNear.arrivalYear - T0, 2)}) PÓŹNIEJSZE niż przyjętego (${fmt(ownFar.arrivalYear - T0, 2)}) i w klamrze synchronizacji (×10) — bez filtra przeciągnęłoby flotę`);
  const res = fSys.issueFleetOrder(fid, { type: 'moveToPoint', targetBodyId: 'p_mid', targetPoint: { x: mid.x, y: mid.y } });
  const rej = res?.rejected?.find(x => x.vesselId === near.id);
  assert(res?.accepted?.includes(far.id) && Number.isFinite(rej?.etaYears) && rej?.reason === 'rendezvous_beyond_horizon',
    `R2f flota: członek za planetą odrzucony z ETA (${fmt(rej?.etaYears, 2)} roku), członek przed planetą przyjęty`);
  assert(Math.abs((far.mission?.arrivalYear ?? NaN) - ownFar.arrivalYear) < 0.002,
    `R2g przyjęty członek leci na WŁASNE spotkanie (${fmt(far.mission?.arrivalYear - T0)} vs ${fmt(ownFar.arrivalYear - T0)}) — odrzucony nie przeciąga chwili floty`);

  // pokrętło na żywo: horyzont ×100 — ten sam rozkaz przechodzi
  ({ mid } = scene());
  v = ship({ ...around(mid, 0.8), name: 'Pokrętło' });
  const k0 = TUNING?.HORIZON_MULT;
  if (TUNING) TUNING.HORIZON_MULT = 100;
  const rk = order(v, 'p_mid');
  if (TUNING) TUNING.HORIZON_MULT = k0;
  assert(!!TUNING && rk?.ok === true, `R2h pokrętło na żywo: \`HORIZON_MULT\` 100 — ten sam rozkaz przyjęty (${rk?.ok})`);

  // KONTROLE: AI i odwrót w tym samym punkcie — przyjęte (AI nigdy nie dostaje odmowy z horyzontu)
  ({ mid } = scene());
  const ai = ship({ ...around(mid, 0.8), name: 'AI', empire: 'emp_k' });
  const ra = order(ai, 'p_mid');
  const pr = ship({ ...around(mid, 0.8), name: 'Ucieka' });
  const rr = order(pr, 'p_mid', { isRetreat: true });
  assert(ra?.ok && rr?.ok && (ai.mission?.arrivalYear - T0) > horizon,
    `R2i KONTROLA: statek AI i odwrót w tym samym punkcie — przyjęte, lot na spotkanie (AI ETA ${fmt(ai.mission?.arrivalYear - T0, 2)} roku)`);
});

// ═══ R3 — bez zmian ════════════════════════════════════════════════════════════════════════════════════════════════
block('R3 — bez zmian: statek szybszy od ciała, ciało nieruchome, rozkaz z daleka, punkt w scenie bitwy', () => {
  let { slow } = scene();
  let st = around(slow, 1.0);
  let v = ship({ ...st, name: 'Szybki', speed: 2.5 });
  const ic = vMgr._interceptBody('p_slow', st.x, st.y, 2.5, { systemId: SYS });
  let r = order(v, 'p_slow');
  assert(r?.ok && Math.abs(v.mission.arrivalYear - ic.arrivalYear) < 1e-9 && v.mission.arrivalYear - T0 > 0.1,
    `R3a statek szybszy od ciała (2,5 vs ~0,99 AU/rok), 1 AU za nim — spotkanie jak przed krokiem (${fmt(v.mission?.arrivalYear - T0)} = ${fmt(ic.arrivalYear - T0)} roku)`);

  scene();
  // ciało bez orbity (dodane tylko tu, bez tików — PhysicsSystem wymaga `orbital` u planet)
  EntityManager.add({ id: 'p_static', type: 'planet', name: 'Stała', systemId: SYS, x: 8 * AU, y: 2 * AU, radius: 4, mass: 1, visual: { radius: 4 } });
  v = ship({ x: 6 * AU, y: 0, name: 'Stała' });
  const route = vMgr._calcRoute(6 * AU, 0, 8 * AU, 2 * AU, SYS);
  r = order(v, 'p_static');
  assert(r?.ok && Math.abs(v.mission.arrivalYear - (T0 + route.totalDist / AU / SPEED)) < 1e-9,
    `R3b ciało nieruchome — przylot po trasie jak przed krokiem (${fmt(v.mission?.arrivalYear - T0)} roku)`);

  let mid; ({ mid } = scene());
  st = { x: mid.x + 2.4 * AU, y: mid.y - 1.1 * AU };
  v = ship({ ...st, name: 'Z daleka' });
  const truth = oracleIntercept('p_mid', st.x, st.y, SPEED);
  r = order(v, 'p_mid');
  assert(r?.ok && Math.abs(v.mission.arrivalYear - truth) <= 0.002,
    `R3c rozkaz z daleka (2,6 AU) — przyjęty, przylot = najwcześniejsze spotkanie (${fmt(v.mission?.arrivalYear - T0)} vs ${fmt(truth - T0)})`);

  ({ mid } = scene());
  st = around(mid, 0.05);
  v = ship({ ...st, name: 'Scena', dockedAt: 'p_mid' });
  const pt = { x: mid.x + 0.08 * AU, y: mid.y + 0.03 * AU };
  r = mos.issueOrder(v.id, { type: 'moveToPoint', targetPoint: pt, noBodySnap: true, issuedBy: 'keeper' });
  assert(r?.ok && v.mission?.targetId == null && v.mission.targetX === pt.x && v.mission.targetY === pt.y,
    'R3d KONTROLA: punkt w scenie bitwy (`noBodySnap`) przy planecie — punkt, bez ciała (Finding 662 bez zmian)');
});

// ═══ R4 — wspólna chwila grupy ═════════════════════════════════════════════════════════════════════════════════════
block('R4 — `groupArrivalYear`: członkowie przy ciele nie wyznaczają chwili grupy', () => {
  const { mid } = scene();
  const a = ship({ ...around(mid, 0.05), name: 'Przy', dockedAt: 'p_mid' });
  const b = ship({ ...around(mid, 1.5, 'ahead'), name: 'Przed planetą' });
  const ownA = vMgr._interceptBody('p_mid', a.position.x, a.position.y, SPEED, { systemId: SYS });
  const ownB = vMgr._interceptBody('p_mid', b.position.x, b.position.y, SPEED, { systemId: SYS });
  const g = groupArrivalYear(vMgr, 'p_mid', [a, b], { now: T0 });
  assert(ownA.arrivalYear > ownB.arrivalYear + 0.5, `R4-0 KONTROLA: „przechwycenie” członka przy ciele (${fmt(ownA.arrivalYear - T0, 2)}) jest PÓŹNIEJSZE niż członka przed planetą (${fmt(ownB.arrivalYear - T0, 2)})`);
  assert(!!g && Math.abs(g.arrivalYear - ownB.arrivalYear) < 1e-6 && (g.captured ?? []).includes(a.id),
    `R4a chwila grupy = spotkanie członka przed planetą (${fmt(g?.arrivalYear - T0)}), członek przy ciele pominięty (${JSON.stringify(g?.captured)})`);
  const g2 = groupArrivalYear(vMgr, 'p_mid', [a], { now: T0 });
  assert(!!g2 && g2.arrivalYear === T0 && g2.core.length === 0, `R4b wszyscy przy ciele — chwila grupy = teraz (${fmt(g2?.arrivalYear - T0, 4)})`);
});

// ═══ R5 — pomocniki kontroli właściciela (konsola) ═════════════════════════════════════════════════════════════════
const DBG = await import('../../debug/RendezvousDebug.js').catch(() => null);
block('R5 — `rendezvousPlace` / `rendezvousInfo`: przewidywanie = wynik prawdziwego rozkazu', () => {
  const H = DBG?.rendezvousDebugHelpers?.({ getSaveSystem: () => null }) ?? null;
  assert(!!H, 'R5-0 moduł pomocników istnieje');
  if (!H) return;
  const run = (d, ahead = 0) => {
    const { mid } = scene();
    const v = ship({ ...around(mid, 0.05), name: 'Kontrola', dockedAt: 'p_mid' });
    window.KOSMOS.uiManager = { getSelectedVesselId: () => v.id, getSelectedVesselIds: () => [v.id], getSelectedFleetId: () => null };
    const out = H.rendezvousPlace(d, ahead);
    const placedAU = distAU(v, 'p_mid');
    const r = order(v, 'p_mid');
    return { out, r, placedAU, v };
  };
  const behind = run(0.8), near = run(0.3), ahead = run(0.8, 1);
  assert(behind.out?.ok && Math.abs(behind.placedAU - 0.8) < 1e-6 && behind.out.rozkaz?.wynik === 'odmowa' && behind.r?.ok === false
      && Math.abs(behind.out.rozkaz.etaLat - behind.r.etaYears) < 0.01,
    `R5a 0,8 AU za planetą: przewidywanie „odmowa” (ETA ${behind.out?.rozkaz?.etaLat}, limit ${behind.out?.rozkaz?.limitLat}) = odmowa rozkazu (${behind.r?.reason})`);
  assert(near.out?.rozkaz?.wynik === 'przy ciele — orbita od razu' && near.r?.ok && Math.abs(near.v.mission.arrivalYear - T0) < 1e-9,
    `R5b 0,3 AU: przewidywanie „przy ciele” = przylot od razu (${near.out?.rozkaz?.wynik})`);
  assert(ahead.out?.strona === 'przed' && ahead.out?.rozkaz?.wynik === 'lot' && ahead.r?.ok && Math.abs((ahead.v.mission.arrivalYear - T0) - ahead.out.rozkaz.etaLat) < 0.01,
    `R5c 0,8 AU PRZED planetą: przewidywanie „lot” za ${ahead.out?.rozkaz?.etaLat} roku = rozkaz przyjęty (${fmt(ahead.v.mission?.arrivalYear - T0, 2)})`);
  const rows = H.rendezvousInfo();
  assert(Array.isArray(rows) && rows.some(x => x.cialo === 'p_mid') && rows.some(x => x.cialo === 'm_mid'), `R5d rendezvousInfo — tabela ciał układu (${rows?.length})`);
});

console.log(`\n═══ rendezvous_663_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
