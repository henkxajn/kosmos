// AI STRIKES BACK S2 — keeper B4: DRUGIE STRZEŻONE CIAŁO (SB32). Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
//
//   S1  wybór: najcenniejsze ciało imperium W UKŁADZIE STOLICY poza stolicą, w porządku planera garnizonu — ciało spoza
//       układu stolicy z wyższym `devScore` pominięte (świadek: planer stawia je pierwsze)
//   S2  lot: dwa kadłuby-strażniki — pierwszy na orbitę stolicy, drugi pojawia się przy stolicy i LECI istniejącym rozkazem
//       (`moveToPoint`, cel-ciało w misji) na drugie ciało, przylatuje na ORBITĘ; w locie — w rosterze, poza doktrynami
//   S3  bez drugiego kadłuba-strażnika — drugiego strażnika brak (drugie ciało istnieje — świadek); 3 miesiące bez zmian
//   S4  bez drugiego ciała w układzie stolicy — drugiego strażnika brak, drugi kadłub zostaje w doku (świadek: ciało poza
//       układem jest w porządku planera)
//   S5  drugi kadłub w służbie dopiero miesiąc po mobilizacji (rezerwa) — drugie stanowisko obsadzone na pierwszej granicy
//       miesiąca, na której jest (`trigger: 'monthly'`, lot)
//   S6  (świat S2 — biegnie zaraz po S2) stabilność: ciało raz obsadzone zostaje drugim, choć inne ciało układu stało się cenniejsze (świadek: wybór bez
//       rosteru wskazałby tamto)
//   S7  przylot strażnika do drugiego ciała nie podnosi wywiadu gracza (B1, Finding 414) — świadek: `vessel:arrived` z misją
//
// ⚠ Świat: `bootWithDirector` + `MovementOrderSystem`; w układzie stolicy `emp_001` dwie kolonie (A pop 10, B pop 5), poza nim
//   kolonia X (pop 50) — `createColony` + `addColony` (wzór `fleet_upkeep_payer`). Limit floty 2, limit garnizonu 5.
// ⚠ S6 i S7 biegną zaraz po S2: kolejny rozruch podmienia `window.KOSMOS` i `gameState` całego procesu.
// ⚠ Fail-first: na drzewie sprzed B4 piny drugiego ciała czerwone, KONTROLE zielone po obu stronach.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import * as VS from '../../entities/Vessel.js';
import { readEmpireGarrisonSnapshot, garrisonAllocation } from '../../utils/GarrisonPlanner.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const quiet = (fn) => { const l = console.log, w = console.warn, tb = console.table; console.log = () => {}; console.warn = () => {}; console.table = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.table = tb; } };

const GP = await import('../../utils/GuardPostPlanner.js').catch(() => null);
const D = 'frigate_system_defender';
const RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

const run = (w, months) => quiet(() => w.ticker.run(months, { tickSize: 1.0 }));
const atPost = (v, bodyId) => v?.position?.state === 'orbiting' && v?.position?.dockedAt === bodyId;

/** Świat z koloniami A, B (układ stolicy) i X (poza nim), kadłubami-strażnikami w służbie (`activeD`) i w rezerwie (`storedD`). */
function world({ inSystem = true, outside = true, activeD = 0, storedD = 0 } = {}) {
  const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  const w = { core, K, ticker, vm: core.vesselManager, cm: core.colonyManager, arrivals: [] };
  EventBus.on('vessel:arrived', ({ vessel, mission }) => w.arrivals.push({ id: vessel?.id, withMission: !!mission }));
  run(w, 1);                                                    // pierwszy tick sesji — ustawia miesiąc kontroli
  w.e1 = K.empireRegistry.listIds()[0];
  w.cap = K.directorProduction.capitalOf(w.e1)?.planetId;
  const C = EntityManager.get(w.cap);
  const near = (EntityManager.getByTypeInSystem('planet', C.systemId) ?? []).filter((b) => b.id !== C.id && !w.cm.getColony(b.id))
    .sort((a, b) => Math.hypot(a.x - C.x, a.y - C.y) - Math.hypot(b.x - C.x, b.y - C.y));
  const found = (body, pop) => { quiet(() => { w.cm.createColony(body.id, {}, pop, 0, w.e1); K.empireRegistry.addColony(w.e1, body.id); }); return body.id; };
  if (inSystem) { w.A = found(near[0], 10); w.B = found(near[1], 5); }
  if (outside) {
    const far = (EntityManager.getByType('planet') ?? []).find((b) => b.systemId && b.systemId !== C.systemId && !w.cm.getColony(b.id));
    w.X = found(far, 50);
  }
  const mk = () => quiet(() => w.vm.createAIVessel({ templateId: D, empireId: w.e1, planetId: w.cap, origin: 'shipyard_sim' }))?.vessel;
  w.active = Array.from({ length: activeD }, mk);
  w.stored = Array.from({ length: storedD }, mk);
  for (const v of w.stored) v.serviceState = 'stored';
  return w;
}
const declare = (w) => quiet(() => w.K.diplomacySystem.declareWar(w.e1, 'keeper_setup'));
const roster = (w) => w.K.directorDoctrine?.guardRoster?.(w.e1) ?? [];
const postedEv = (w) => debugLog.query({ kind: 'fleetGuard:posted', empireId: w.e1 });
const order = (w) => { const s = readEmpireGarrisonSnapshot(w.K, w.e1); const a = garrisonAllocation(s); return [...a.perBody.filter((b) => b.planetId !== w.cap).map((b) => b.planetId), ...a.skipped]; };

// ── S1 — wybór drugiego ciała ────────────────────────────────────────────────────────────────────
console.log('\nS1 — drugie ciało: najcenniejsze w układzie stolicy, w porządku planera');
{
  const w = world();
  const ord = order(w);
  const posts = GP?.readGuardPosts?.(w.K, w.e1, 1, []);
  assert(same(ord, [w.X, w.A, w.B]), `S1a (KONTROLA sceny): porządek planera ${JSON.stringify(ord)} — X (poza układem, pop 50) pierwszy, A, B`);
  assert(posts?.secondId === w.A && same(posts?.bodies?.map((b) => b.bodyId), [w.cap, w.A]),
    `S1b: strzeżone ciała [${posts?.bodies?.map((b) => `${b.bodyId}:${b.role}`).join(', ')}] — drugie A (${w.A}), nie X`);
}

// ── S2 — lot do drugiego ciała ───────────────────────────────────────────────────────────────────
console.log('\nS2 — drugi strażnik leci ze stolicy i przylatuje na orbitę drugiego ciała');
const s2 = world({ activeD: 2 });                                // dwa defendery w służbie (pula dokłada wtedy E, E)
{
  const w = s2;
  declare(w);
  const r = roster(w);
  const cg = r.find((e) => e.bodyId === w.cap)?.vesselId, sg = r.find((e) => e.bodyId === w.A)?.vesselId;
  const v = sg ? w.vm.getVessel(sg) : null;
  const ev = postedEv(w);
  assert(cg === w.active[0].id && atPost(w.vm.getVessel(cg), w.cap),
    `S2a (KONTROLA sceny — B3): pierwszy strażnik ${cg} na orbicie stolicy`);
  const want2 = w.active[1]?.id;
  assert(!!v && sg === want2 && v.movementOrder?.type === 'moveToPoint' && v.mission?.targetId === w.A && v.position?.state === 'in_transit'
    && ev.some((e) => e.data?.vesselId === sg && e.data?.bodyId === w.A && e.data?.flight === true && e.data?.trigger === 'mobilization'),
    `S2b: drugi strażnik ${sg} — rozkaz ${v?.movementOrder?.type} → ${v?.mission?.targetId}, ${v?.position?.state}, posted (lot)`);
  const idle = w.K.directorDoctrine._idleArmedAtCapital(w.e1).map((x) => x.id);
  assert(!!v && w.K.directorDoctrine.doctrineRoleOf?.(w.e1, sg) === 'guard' && !idle.includes(sg),
    'S2c: w locie — w rosterze strażników (rola guard), poza sondą doktryn');
  let months = null;
  for (let i = 1; i <= 24 && months === null && v; i++) { run(w, 1); if (atPost(v, w.A) && !v.movementOrder) months = i; }
  w.months = months;
  assert(months !== null && atPost(v, w.A) && same(roster(w).map((e) => e.vesselId), [cg, sg]),
    `S2d: przylot na orbitę A po ${months} mies.; roster [${roster(w).map((e) => `${e.bodyId}:${e.vesselId}`).join(', ')}]`);
}

// ── S6 — stabilność ──────────────────────────────────────────────────────────────────────────────
console.log('\nS6 — obsadzone drugie ciało zostaje, choć inne stało się cenniejsze');
{
  const w = s2;
  const r0 = roster(w);
  quiet(() => w.cm.getColony(w.B).civSystem.setPopulation(40));
  run(w, 1);
  const fresh = GP?.secondGuardBodyId?.(readEmpireGarrisonSnapshot(w.K, w.e1), (id) => EntityManager.get(id)?.systemId ?? null, []);
  const held = GP?.readGuardPosts?.(w.K, w.e1, 1, roster(w))?.secondId;
  assert(fresh === w.B && held === w.A && same(roster(w), r0),
    `S6: wybór bez rosteru → B (${fresh}); z rosterem — A (${held}); roster bez zmian`);
}

// ── S7 — wywiad gracza ───────────────────────────────────────────────────────────────────────────
console.log('\nS7 — przylot strażnika do drugiego ciała nie podnosi wywiadu gracza (Finding 414)');
{
  const w = s2;
  const sg = roster(w).find((e) => e.bodyId === w.A)?.vesselId;
  const lvl = gameState.get(`intel.${w.e1}`)?.level ?? 'unknown';
  assert(!!sg && w.arrivals.some((a) => a.id === sg && a.withMission) && (RANK[lvl] ?? 0) < RANK.contact,
    `S7: vessel:arrived z misją dla ${sg} — wywiad gracza o ${w.e1}: ${lvl}`);
}

// ── S3 — bez drugiego kadłuba ────────────────────────────────────────────────────────────────────
console.log('\nS3 — bez drugiego kadłuba-strażnika nie ma drugiego strażnika');
{
  const w = world();
  declare(w);
  run(w, 3);
  const posts = GP?.readGuardPosts?.(w.K, w.e1, 1, roster(w));
  assert(posts?.secondId === w.A && roster(w).length === 1 && roster(w)[0].bodyId === w.cap && postedEv(w).length === 1,
    `S3: drugie ciało ${posts?.secondId} istnieje, roster ${roster(w).length} (tylko stolica), posted × ${postedEv(w).length}`);
}

// ── S4 — bez drugiego ciała w układzie stolicy ───────────────────────────────────────────────────
console.log('\nS4 — bez drugiego ciała w układzie stolicy nie ma drugiego strażnika');
{
  const w = world({ inSystem: false, activeD: 2 });
  declare(w);
  run(w, 2);
  const posts = GP?.readGuardPosts?.(w.K, w.e1, 1, roster(w));
  const others = w.vm.getAllVessels().filter((v) => (v.ownerEmpireId === w.e1) && v.directorOrigin === D && !roster(w).some((e) => e.vesselId === v.id));
  assert(order(w).includes(w.X) && posts?.capitalId === w.cap && posts?.secondId === null && roster(w).length === 1
    && others.length >= 1 && others.every((v) => v.position?.state === 'docked' && !v.movementOrder),
    `S4: X w porządku planera (poza układem), drugie ciało ${posts?.secondId}, roster ${roster(w).length}; pozostałe defendery w doku (${others.length})`);
}

// ── S5 — drugi kadłub w służbie miesiąc później ──────────────────────────────────────────────────
console.log('\nS5 — drugie stanowisko obsadzone na pierwszej granicy miesiąca z drugim kadłubem w służbie');
{
  const w = world({ activeD: 1, storedD: 1 });
  declare(w);
  const atMob = roster(w).map((e) => e.bodyId);
  run(w, 1);
  const ev = postedEv(w).filter((e) => e.data?.bodyId === w.A);
  const g = ev[0]?.data?.vesselId;
  assert(same(atMob, [w.cap]) && ev.length === 1 && ev[0].data?.trigger === 'monthly' && ev[0].data?.flight === true && g === w.stored[0].id
    && w.vm.getVessel(g)?.mission?.targetId === w.A,
    `S5: przy mobilizacji [${atMob.join(', ')}]; miesiąc później ${g} (obudzony z rezerwy) leci na A (trigger ${ev[0]?.data?.trigger})`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
