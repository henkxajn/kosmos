// ═══════════════════════════════════════════════════════════════════════════════
// sb2b_body_intercept_smoke — KEEPER Findingu 416 (AI STRIKES BACK, pre-S3, decyzja SB39)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (416).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: lot do ciała, które krąży szybciej, niż leci statek, kończył się w chwili liczonej z trasy do punktu
//   przewidzianego na INNĄ chwilę (dolot po linii prostej do BIEŻĄCEJ pozycji ciała), a przy przylocie statek
//   przeskakiwał na żywą pozycję ciała (S2: `v_21` 4,47 roku zamiast 2,47, przeskok 6,53 AU; do 9,7 AU w układzie
//   domowym). Wznowienie misji po bitwie liczyło czas po linii prostej, trasę do punktu przewidzianego — przylot na
//   czas, ale z prędkością różną od prędkości statku. Pościg `engage` za celem na orbicie szybkiego ciała się nie
//   zamykał (prędkość celu na orbicie = 0; S2: 0 bitew w 2 lata).
// SB39: lot do ciała przylatuje WTEDY i TAM, gdzie ciało — bez spóźnienia wobec pokazanego ETA, bez przeskoku;
//   dotyczy moveToPoint, wznowienia misji po bitwie i pościgu `engage` za celem zadokowanym / na orbicie.
//
// ⚠ WYROCZNIA NIEZALEŻNA OD NAPRAWY: najwcześniejszą chwilę przechwycenia liczy test sam — skan w przód krokiem
//   0,0005 roku warunku „długość `_calcRoute` do `_predictPosition(ciało, t)` ≤ prędkość × (t − teraz)”. Obie funkcje
//   istnieją od dawna i naprawa ich NIE zmienia; pomocnik `_interceptBody` w ogóle nie jest tu wołany wprost.
//
// PINY (fail-first na `f3fb8e0` w świeżym klonie: 11 PASS / 8 FAIL — czerwone dokładnie T1a, T1c, T2a, T2b, T2d, T3a,
//   T6a, T6b; zielone po obu stronach — kontrole, w tym T1b i T2c: przylot w chwili ETA i brak przeskoku wznowienia
//   były już przed SB39 i naprawa nie ma prawa ich zepsuć):
//   T1  12 kątów startu, 2 AU od ciała (6,45 AU/rok), statek 1,114 AU/rok, PRAWDZIWY `issueOrder` + tiki:
//       (a) pokazane ETA (`mission.arrivalYear`) = najwcześniejsze przechwycenie (±0,002 roku) — bez spóźnienia
//       (b) KONTROLA: detekcja przylotu w chwili pokazanego ETA (± 1 tik)  (c) przeskok przy przylocie ≤ 0,06 AU
//       (d) KONTROLA: prędkość lotu = prędkość statku (trasa / czas, ±1 %)
//   T2  wznowienie po bitwie (`_suspendMissionIfAny(forCombat)` + zamrożenie + `_resumeMissionAfterOrder` — to, co
//       robi DSCS): ETA = przechwycenie, prędkość = prędkość statku; KONTROLA — przylot przy ciele (≤ 0,06 AU);
//       noga powrotna: `returnYear` = przechwycenie domu
//   T3  `engage` na cel NA ORBICIE szybkiego ciała: dystans się zamyka i powstaje starcie DSCS (prawdziwy MOS → VCS →
//       DSCS); KONTROLA — cel w wolnej przestrzeni: pościg z prędkości jak dotąd (starcie powstaje)
//   T4  KONTROLA — ciało wolne wobec statku (statek 20, ciało ~0,99 AU/rok): przylot przy ciele, ETA = przechwycenie
//       (było i jest — błąd jednorazowej predykcji jest tu drugiego rzędu)
//   T5  KONTROLA — ciało nieruchome (bez `orbital`): punkt, trasa i `arrivalYear` jak wzór sprzed SB39
//   T6  flota (`_arrivalSyncYear`) — przylot NIE wcześniej niż synchronizacja: osiągalna ⇒ w chwili synchronizacji przy
//       ciele; nieosiągalna ⇒ pierwsza osiągalna chwila PO niej (przy ciele); synchronizacja wcześniejsza niż własne
//       przechwycenie ⇒ własne przechwycenie
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { PhysicsSystem }       from '../../systems/PhysicsSystem.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { VesselCombatSystem }  from '../../systems/VesselCombatSystem.js';
import { KeplerMath }          from '../../utils/KeplerMath.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU  = GAME_CONFIG.AU_TO_PX;
const CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const DT  = 0.002;                                   // rok gry na tik
const SHIP_SPEED = 1.1139813200670667;               // hull_frigate (AU / rok gry)
const SYS = 'sys_t';
const T0  = 100;

let vMgr, mos, dscs, phys;
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

function bodyFromOrbit(id, type, orb, parent = null) {
  const E = KeplerMath.solveKepler(orb.M, orb.e);
  const th = KeplerMath.eccentricToTrueAnomaly(E, orb.e);
  const r = KeplerMath.orbitalRadius(orb.a, orb.e, th);
  const ang = th + orb.inclinationOffset;
  const px = parent?.x ?? 0, py = parent?.y ?? 0;
  return { id, type, name: id, systemId: SYS, radius: 4, mass: 1, visual: { radius: 4 }, orbital: { ...orb, theta: th },
           x: px + r * Math.cos(ang) * AU, y: py + r * Math.sin(ang) * AU, ...(parent ? { parentPlanetId: parent.id } : {}) };
}

function scene() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: T0 }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  // szybkie ciało — jak stolica emp_001 w fixturze (a 1,443 AU, T 1,406 roku) ⇒ ~6,45 AU / rok
  const fast = bodyFromOrbit('p_fast', 'planet', { a: 1.443, e: 0.03, T: 1.406, M: 0.4, inclinationOffset: 0.7 });
  // wolne ciało — ~0,99 AU / rok, wolniejsze od statku
  const slow = bodyFromOrbit('p_slow', 'planet', { a: 40, e: 0.02, T: 253, M: 2.0, inclinationOffset: 0 });
  EntityManager.add(fast); EntityManager.add(slow);
  phys = new PhysicsSystem();                        // PRZED VesselManager — kolejność `time:tick` jak w GameScene
  vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr);
  dscs = new DeepSpaceCombatSystem(vMgr); new VesselCombatSystem(vMgr);
  const cols = [{ planetId: 'p_slow', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: slow, vesselManager: vMgr, movementOrderSystem: mos, deepSpaceCombatSystem: dscs,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_slow', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    debug: { combatTrace: false },
  });
  return { fast, slow };
}

function ship({ x, y, name = 'S', empire = null, speed = SHIP_SPEED, armed = true } = {}) {
  const v = vMgr.createAndRegister('hull_frigate', 'p_slow', { name, modules: armed ? ['weapon_laser', 'engine_ion'] : ['engine_ion'] });
  v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = null;
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

/** Wyrocznia: najwcześniejsza chwila ≥ `from`, w której trasa do ciała mieści się w prędkości statku (skan 0,0005 roku). */
function oracleIntercept(bodyId, sx, sy, speed, from = null) {
  const now = window.KOSMOS.timeSystem.gameTime;
  for (let t = from ?? now; t < now + 40; t += 0.0005) {
    const P = vMgr._predictPosition(bodyId, t);
    const L = vMgr._calcRoute(sx, sy, P.x, P.y, SYS).totalDist / AU;
    if (L <= speed * (t - now) + 1e-9) return t;
  }
  return NaN;
}

const routeLenAU = (m) => {
  const pts = [{ x: m.startX, y: m.startY }, ...(m.waypoints ?? []), { x: m.targetX, y: m.targetY }];
  let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s / AU;
};

/** Leć do przylotu: zwraca chwilę detekcji, przeskok (punkt końca interpolacji ↔ żywe ciało) i stan po. */
function flyToArrival(v, bodyId, maxYears = 12) {
  let arrived = null;
  const off = EventBus.on('vessel:arrived', ({ vessel, mission }) => {
    if (vessel.id !== v.id || arrived) return;
    const b = EntityManager.get(bodyId);
    arrived = { t: window.KOSMOS.timeSystem.gameTime, jumpAU: Math.hypot(mission.targetX - b.x, mission.targetY - b.y) / AU };
  });
  for (let i = 0; i < maxYears / DT && !arrived; i++) tick();
  if (typeof off === 'function') off();
  return arrived;
}

// ═══ T1 — 12 kątów startu, szybkie ciało ═══════════════════════════════════════════
header('T1  moveToPoint na ciało szybsze od statku — 12 kątów startu');
{
  const rows = [];
  for (let k = 0; k < 12; k++) {
    const { fast } = scene();
    const ang = k * Math.PI / 6;
    const v = ship({ x: fast.x + Math.cos(ang) * 2 * AU, y: fast.y + Math.sin(ang) * 2 * AU, name: `K${k}` });
    const now = window.KOSMOS.timeSystem.gameTime;
    const truth = oracleIntercept('p_fast', v.position.x, v.position.y, SHIP_SPEED);
    const r = mos.issueOrder(v.id, { type: 'moveToPoint', targetBodyId: 'p_fast', targetPoint: { x: fast.x, y: fast.y }, issuedBy: 'keeper' });
    const m = v.mission;
    const eta = m?.arrivalYear;
    const speedRatio = m ? routeLenAU(m) / ((eta - m.departYear) * SHIP_SPEED) : NaN;
    const arr = r?.ok ? flyToArrival(v, 'p_fast') : null;
    rows.push({ k, ok: !!r?.ok, eta: eta - now, truth: truth - now, det: arr ? arr.t - now : NaN, jump: arr?.jumpAU ?? NaN, speedRatio });
  }
  for (const x of rows) console.log(`     k${String(x.k).padStart(2)}: ETA ${fmt(x.eta)} · przechwycenie ${fmt(x.truth)} · detekcja ${fmt(x.det)} · przeskok ${fmt(x.jump)} AU · prędkość ×${fmt(x.speedRatio)}`);
  assert(rows.every(x => x.ok), 'T1-0 KONTROLA: 12 rozkazów przyjętych');
  assert(rows.every(x => Number.isFinite(x.truth) && x.truth > 0.05), 'T1-0b KONTROLA: wyrocznia znalazła przechwycenie dla każdego kąta (niejałowo)');
  assert(rows.every(x => Math.abs(x.eta - x.truth) <= 0.002), 'T1a pokazane ETA = najwcześniejsze przechwycenie (±0,002 roku) — bez spóźnienia');
  assert(rows.every(x => Number.isFinite(x.det) && Math.abs(x.det - x.eta) <= DT + 1e-9), 'T1b przylot (detekcja) w chwili pokazanego ETA ±1 tik');
  assert(rows.every(x => x.jump <= 0.06), `T1c przeskok przy przylocie ≤ 0,06 AU (max ${fmt(Math.max(...rows.map(x => x.jump)))})`);
  assert(rows.every(x => x.speedRatio > 0.99 && x.speedRatio <= 1.000001), 'T1d KONTROLA: statek leci z prędkością statku (trasa / czas ±1 %)');
}

// ═══ T2 — wznowienie misji po bitwie ════════════════════════════════════════════════
header('T2  wznowienie misji po bitwie — `_resumeMissionAfterOrder`');
{
  const out = [];
  for (const ang of [0.3, 2.2, 4.1]) {
    const { fast } = scene();
    const v = ship({ x: fast.x + Math.cos(ang) * 2.5 * AU, y: fast.y + Math.sin(ang) * 2.5 * AU, name: 'R' });
    // misja w locie (jak z `dispatchOnMission`): cel = szybkie ciało
    v.mission = { type: 'transport', targetId: 'p_fast', startX: v.position.x, startY: v.position.y,
                  targetX: fast.x, targetY: fast.y, waypoints: [], departYear: T0 - 0.1, arrivalYear: T0 + 3, phase: 'outgoing' };
    v.position.state = 'in_transit'; v.status = 'on_mission';
    const snapped = mos._suspendMissionIfAny(v, { forCombat: true });
    v.mission = null; v.position.state = 'orbiting';                      // zamrożenie na czas walki (DSCS)
    tick(5);                                                              // walka trwa
    const now = window.KOSMOS.timeSystem.gameTime;
    const truth = oracleIntercept('p_fast', v.position.x, v.position.y, v.speedAU);
    vMgr._resumeMissionAfterOrder(v.id);
    const m = v.mission;
    const speedRatio = m ? routeLenAU(m) / ((m.arrivalYear - now) * v.speedAU) : NaN;
    const arr = m ? flyToArrival(v, 'p_fast') : null;
    out.push({ snapped, eta: m ? m.arrivalYear - now : NaN, truth: truth - now, speedRatio, jump: arr?.jumpAU ?? NaN, det: arr ? arr.t - (m?.arrivalYear ?? 0) : NaN });
  }
  for (const x of out) console.log(`     ETA ${fmt(x.eta)} · przechwycenie ${fmt(x.truth)} · prędkość ×${fmt(x.speedRatio)} · przeskok ${fmt(x.jump)} AU`);
  assert(out.every(x => x.snapped), 'T2-0 KONTROLA: migawka misji zrobiona (pauza bojowa)');
  assert(out.every(x => Math.abs(x.eta - x.truth) <= 0.002), 'T2a wznowiona misja: ETA = najwcześniejsze przechwycenie (±0,002 roku)');
  assert(out.every(x => x.speedRatio > 0.99 && x.speedRatio <= 1.000001), 'T2b wznowiona misja leci z prędkością statku (±1 %)');
  assert(out.every(x => x.jump <= 0.06 && Math.abs(x.det) <= DT + 1e-9), 'T2c przylot w chwili ETA i przy ciele (przeskok ≤ 0,06 AU)');

  // noga powrotna: dom = szybkie ciało
  const { fast } = scene();
  const v = ship({ x: fast.x + 3 * AU, y: fast.y, name: 'RR' });
  v.mission = { type: 'transport', targetId: 'p_slow', originId: 'p_fast', startX: fast.x, startY: fast.y, targetX: v.position.x,
                targetY: v.position.y, waypoints: [], departYear: T0 - 1, arrivalYear: T0 - 0.5, phase: 'returning',
                returnStartX: v.position.x, returnStartY: v.position.y, returnTargetX: fast.x, returnTargetY: fast.y,
                returnDepartYear: T0 - 0.1, returnYear: T0 + 2, returnWaypoints: [] };
  v.position.state = 'in_transit'; v.status = 'on_mission';
  mos._suspendMissionIfAny(v, { forCombat: true });
  v.mission = null; v.position.state = 'orbiting';
  const now = window.KOSMOS.timeSystem.gameTime;
  const truth = oracleIntercept('p_fast', v.position.x, v.position.y, v.speedAU);
  vMgr._resumeMissionAfterOrder(v.id);
  const m = v.mission;
  const P = vMgr._predictPosition('p_fast', m?.returnYear ?? now);
  assert(m?.phase === 'returning' && Math.abs(m.returnYear - truth) <= 0.002
    && Math.hypot(m.returnTargetX - P.x, m.returnTargetY - P.y) / AU <= 0.01,
    `T2d noga powrotna: returnYear = przechwycenie domu (${fmt(m?.returnYear - now)} vs ${fmt(truth - now)}), cel = dom w tej chwili`);
}

// ═══ T3 — engage na cel na orbicie szybkiego ciała ════════════════════════════════
header('T3  engage na cel NA ORBICIE szybkiego ciała ⇒ dystans się zamyka i powstaje starcie');
{
  const run = (orbiting) => {
    const { fast } = scene();
    const g = ship({ x: fast.x, y: fast.y, name: 'Guard', empire: 'emp_001' });
    if (orbiting) { g.position.dockedAt = 'p_fast'; g.position.state = 'orbiting'; }
    else { g.position.x = fast.x + 1.5 * AU; g.position.y = fast.y; }
    const p = ship({ x: g.position.x + 2 * AU, y: g.position.y + 0.5 * AU, name: 'Hunter' });
    const r = mos.issueOrder(p.id, { type: 'engage', targetEntityId: g.id, issuedBy: 'keeper' });
    let minAU = Infinity, encAt = null;
    for (let i = 0; i < 3 / DT; i++) {
      tick();
      const d = Math.hypot(p.position.x - g.position.x, p.position.y - g.position.y) / AU;
      minAU = Math.min(minAU, d);
      if ([...dscs._activeEncounters.values()].some(e => e.isActive && e.vesselStates.has(p.id) && e.vesselStates.has(g.id))) {
        encAt = window.KOSMOS.timeSystem.gameTime - T0; break;
      }
    }
    return { ok: !!r?.ok, minAU, encAt, guardMoved: orbiting };
  };
  const orbit = run(true);
  const free = run(false);
  console.log(`     orbita: min ${fmt(orbit.minAU)} AU, starcie po ${fmt(orbit.encAt)} roku · wolna przestrzeń: min ${fmt(free.minAU)} AU, starcie po ${fmt(free.encAt)} roku`);
  assert(orbit.ok && free.ok, 'T3-0 KONTROLA: oba rozkazy `engage` przyjęte');
  assert(orbit.minAU <= 0.2 && orbit.encAt != null, 'T3a cel na orbicie: dystans zamyka się (≤ 0,2 AU) i powstaje starcie DSCS (≤ 3 lata)');
  assert(free.encAt != null, 'T3b KONTROLA: cel w wolnej przestrzeni — starcie powstaje jak dotąd');
}

// ═══ T4 — ciało wolniejsze od statku ════════════════════════════════════════════════
header('T4  KONTROLA — ciało wolne wobec statku (statek 20 AU/rok, ciało ~0,99 AU/rok)');
{
  const { slow } = scene();
  const v = ship({ x: slow.x + 2 * AU, y: slow.y + 1 * AU, name: 'W', speed: 20 });
  const now = window.KOSMOS.timeSystem.gameTime;
  const truth = oracleIntercept('p_slow', v.position.x, v.position.y, 20);
  mos.issueOrder(v.id, { type: 'moveToPoint', targetBodyId: 'p_slow', targetPoint: { x: slow.x, y: slow.y }, issuedBy: 'keeper' });
  const eta = v.mission.arrivalYear;
  const arr = flyToArrival(v, 'p_slow');
  console.log(`     ETA ${fmt(eta - now, 4)} · przechwycenie ${fmt(truth - now, 4)} · przeskok ${fmt(arr?.jumpAU, 4)} AU`);
  assert(Math.abs(eta - truth) <= 0.002 && arr && arr.jumpAU <= 0.02, 'T4 KONTROLA ciało wolne: ETA = przechwycenie, przylot przy ciele (było i jest)');
}

// ═══ T5 — ciało nieruchome ══════════════════════════════════════════════════════════
header('T5  KONTROLA — ciało nieruchome (bez `orbital`): jak wzór sprzed SB39');
{
  scene();
  EntityManager.add({ id: 'p_still', type: 'planet', name: 'Still', systemId: SYS, x: 7 * AU, y: -3 * AU, radius: 4, mass: 1, visual: { radius: 4 } });
  const v = ship({ x: 2 * AU, y: 1 * AU, name: 'N' });
  const now = window.KOSMOS.timeSystem.gameTime;
  const route = vMgr._calcRoute(v.position.x, v.position.y, 7 * AU, -3 * AU, SYS);
  const expectArr = now + (route.totalDist / AU) / SHIP_SPEED;
  mos.issueOrder(v.id, { type: 'moveToPoint', targetBodyId: 'p_still', targetPoint: { x: 7 * AU, y: -3 * AU }, issuedBy: 'keeper' });
  const m = v.mission;
  assert(m.targetX === 7 * AU && m.targetY === -3 * AU && Math.abs(m.arrivalYear - expectArr) < 1e-9
    && JSON.stringify(m.waypoints) === JSON.stringify(route.waypoints),
    'T5 ciało nieruchome: punkt, trasa i arrivalYear = wzór sprzed SB39 (teraz + trasa / prędkość)');
}

// ═══ T6 — flota z synchronizacją ════════════════════════════════════════════════════
header('T6  flota (`_arrivalSyncYear`) — przylot NIE wcześniej niż chwila synchronizacji');
{
  const { fast } = scene();
  const v = ship({ x: fast.x + 1.2 * AU, y: fast.y - 0.4 * AU, name: 'F' });
  const now = window.KOSMOS.timeSystem.gameTime;
  const own = oracleIntercept('p_fast', v.position.x, v.position.y, SHIP_SPEED);
  // synchronizacja osiągalna: szukamy chwili > własnego przechwycenia, w której ciało jest w zasięgu
  let syncOk = NaN, syncBad = NaN;
  for (let t = own + 0.05; t < own + 6; t += 0.01) {
    const P = vMgr._predictPosition('p_fast', t);
    const L = vMgr._calcRoute(v.position.x, v.position.y, P.x, P.y, SYS).totalDist / AU;
    if (Number.isNaN(syncOk) && L <= SHIP_SPEED * (t - now) - 0.05) syncOk = t;
    if (Number.isNaN(syncBad) && L > SHIP_SPEED * (t - now) + 0.05) syncBad = t;
    if (!Number.isNaN(syncOk) && !Number.isNaN(syncBad)) break;
  }
  const order = (sync) => {
    scene();
    const w = ship({ x: v.position.x, y: v.position.y, name: 'F' });
    mos.issueOrder(w.id, { type: 'moveToPoint', targetBodyId: 'p_fast', targetPoint: { x: fast.x, y: fast.y }, issuedBy: 'keeper', _arrivalSyncYear: sync });
    const eta = w.mission.arrivalYear;
    const arr = flyToArrival(w, 'p_fast');
    return { eta, jump: arr?.jumpAU ?? NaN, det: arr ? arr.t - eta : NaN };
  };
  const afterBad = oracleIntercept('p_fast', v.position.x, v.position.y, SHIP_SPEED, syncBad);   // pierwsza osiągalna ≥ sync
  const early = now + 0.5 * (own - now);                     // synchronizacja WCZEŚNIEJSZA niż własne przechwycenie
  const a = order(syncOk), b = order(syncBad), c = order(early);
  console.log(`     własne ${fmt(own - now)} · sync osiągalna ${fmt(syncOk - now)} → ETA ${fmt(a.eta - now)}, przeskok ${fmt(a.jump)} · sync nieosiągalna ${fmt(syncBad - now)} (pierwsza osiągalna po niej ${fmt(afterBad - now)}) → ETA ${fmt(b.eta - now)}, przeskok ${fmt(b.jump)} · sync wczesna ${fmt(early - now)} → ETA ${fmt(c.eta - now)}`);
  assert(Number.isFinite(syncOk) && Number.isFinite(syncBad) && afterBad > syncBad + 0.01,
    'T6-0 KONTROLA: znaleziono chwilę synchronizacji osiągalną i nieosiągalną (z osiągalną chwilą później)');
  assert(Math.abs(a.eta - syncOk) < 1e-9 && a.jump <= 0.06, 'T6a synchronizacja osiągalna: przylot w chwili synchronizacji, przy ciele');
  assert(b.eta >= syncBad - 1e-9 && Math.abs(b.eta - afterBad) <= 0.002 && b.jump <= 0.06,
    'T6b synchronizacja nieosiągalna: pierwsza osiągalna chwila PO synchronizacji — nigdy wcześniej — przy ciele');
  assert(Math.abs(c.eta - own) <= 0.002 && c.jump <= 0.06, 'T6c synchronizacja wcześniejsza niż własne przechwycenie: własne przechwycenie, przy ciele');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
