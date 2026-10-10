// AI STRIKES BACK S2 — keeper B3: STRAŻNIK STOLICY (SB30, SB31, SB33, SB34). Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
//
//   G1  mobilizacja: kadłub-strażnik z puli (defender, bez baku) schodzi z doku NA ORBITĘ stolicy (`undockToOrbit`) i wchodzi
//       do rosteru `director.doctrine.<id>.guard`; eskorty (z bakiem) zostają w doku; imperium bez wojny — nic (KONTROLA)
//   G2  bez kadłuba w służbie przy mobilizacji (rezerwa w trakcie przejścia, pula dokłada wyłącznie eskorty) — stanowisko
//       obsadzone na pierwszej granicy miesiąca, na której kadłub jest w służbie (`trigger: 'monthly'`)
//   G3  strażnik trzyma orbitę i nie ściga: 24 miesiące z uzbrojonym okrętem gracza w układzie — zero rozkazów dla
//       strażnika, stan bez zmian
//   G4  zepchnięty ze stanowiska wraca: z orbity innego ciała — rozkaz `moveToPoint` na stolicę i przylot na orbitę;
//       z doku stolicy — z powrotem na orbitę (bez rozkazu); KONTROLA: strażnik na stanowisku — zero rozkazów
//   G5  wykluczenia: sonda doktryn (`countIdleArmedAtCapital`) i `assignDoctrine` (garnizon, patrol) pomijają strażnika;
//       pula uderzenia (`strikeReadyVessels`) pomija strażnika także z bakiem — KONTROLA: bez wpisu w rosterze — bierze
//   G6  zapis → wczytanie (gameState + VesselManager w tym samym świecie): roster i orbita odtworzone; potem 3 miesiące —
//       bez ponownego obsadzania, strażnik na stanowisku
//   G7  pokój przed mobilizacją: kadłub-strażnik w doku stolicy przez 24 miesiące — nic na orbicie, rostera brak,
//       `stationGuards` → `not_mobilized`; KONTROLA: wojna — ten kadłub (z garnizonu `defend_home`) zostaje strażnikiem
//       i wypada z garnizonu (jedna rola)
//   G8  wyłącznik `fleetPoolSystem.enabled = false` — wojna bez puli i bez strażnika; `stationGuards` → `disabled`
//   G9  `fleetGuardsPerBody`: domyślnie 1; 2 → dwa strażniki przy stolicy; obniżenie 2 → 1 → 0 zwalnia nadmiar
//       (kadłub zostaje na orbicie, bez roli, sonda doktryn znów go widzi)
//   G10 pokój po wojnie: strażnik zostaje na stanowisku i wraca na nie także w pokoju
//   G11 wpięcie: audyt w `DebugLog.TRACKED_EVENTS`, `_hasAnyDoctrine` → `doctrineRoleOf`, pula uderzenia pyta `isGuard`
//
// ⚠ Świat: `bootWithDirector` (prawdziwa dyplomacja i Director, stolice POP 24 → limit 2, pula D, E, E) + `MovementOrderSystem`
//   (headless go nie montuje). Przed wojną jeden tick — pierwszy tick sesji tylko ustawia miesiąc kontroli (jak w grze).
// ⚠ Fail-first: na drzewie sprzed B3 piny strażnika czerwone, KONTROLE zielone po obu stronach.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import * as VS from '../../entities/Vessel.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const read = (r) => readFileSync(path.join(SRC, r), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const quiet = (fn) => { const l = console.log, w = console.warn, tb = console.table; console.log = () => {}; console.warn = () => {}; console.table = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.table = tb; } };

const D = 'frigate_system_defender', E = 'frigate_missile_escort';

function boot({ pool = true } = {}) {
  const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  if (!pool) K.fleetPoolSystem.enabled = false;
  const orders = [];
  EventBus.on('vessel:orderIssued', ({ vesselId, order }) => orders.push({ vesselId, type: order?.type ?? null }));
  const w = { core, K, ticker, vm: core.vesselManager, emps: K.empireRegistry.listIds(), orders };
  run(w, 1);                                                    // pierwszy tick sesji — ustawia miesiąc kontroli
  return w;
}
const run = (w, months) => quiet(() => w.ticker.run(months, { tickSize: 1.0 }));
const declare = (w, emp) => quiet(() => w.K.diplomacySystem.declareWar(emp, 'keeper_setup'));
const capOf = (w, emp) => w.K.directorProduction.capitalOf(emp)?.planetId ?? null;
const dd = (w) => w.K.directorDoctrine;
const roster = (w, emp) => dd(w)?.guardRoster?.(emp) ?? (gameState.get(`director.doctrine.${emp}`)?.guard ?? []);
const guardIds = (w, emp) => roster(w, emp).map((e) => e.vesselId);
const hull = (w, id) => w.vm.getVessel(id);
const armedOf = (w, emp) => w.vm.getAllVessels().filter((v) => !v.isWreck && (v.ownerEmpireId ?? v.owner) === emp && VS.hasWeapons(v));
const poolOf = (w, emp) => armedOf(w, emp).filter((v) => v.origin === 'pool');
const posted = (emp) => debugLog.query({ kind: 'fleetGuard:posted', empireId: emp });
const atPost = (v, bodyId) => v?.position?.state === 'orbiting' && v?.position?.dockedAt === bodyId;
const otherPlanet = (bodyId) => {
  const C = EntityManager.get(bodyId);
  return (EntityManager.getByTypeInSystem('planet', C.systemId) ?? []).filter((b) => b.id !== C.id)
    .sort((a, b) => Math.hypot(a.x - C.x, a.y - C.y) - Math.hypot(b.x - C.x, b.y - C.y))[0];
};
/** Scena wymaga strażnika: bez niego (drzewo sprzed B3) pin jest CZERWONY, nie wywraca suity. */
const needGuard = (g, label) => { if (g) return true; assert(false, `${label}: brak strażnika w rosterze — scena nie biegnie`); return false; };
const stationGuards = (w, emp, trig) => (typeof w.K.fleetPoolSystem?.stationGuards === 'function' ? quiet(() => w.K.fleetPoolSystem.stationGuards(emp, trig)) : undefined);

// ── G1 — mobilizacja ─────────────────────────────────────────────────────────────────────────────
console.log('\nG1 — mobilizacja: defender z puli na orbitę stolicy, w rosterze strażników');
{
  const w = boot();
  const [e1, e2] = w.emps;
  const cap = capOf(w, e1);
  declare(w, e1);
  const pool = poolOf(w, e1);
  const d = pool.find((v) => v.directorOrigin === D), es = pool.filter((v) => v.directorOrigin === E);
  const ev = posted(e1);
  assert(d && atPost(d, cap) && same(guardIds(w, e1), [d.id]) && ev.length === 1 && ev[0].data?.trigger === 'mobilization' && ev[0].data?.vesselId === d.id,
    `G1a: ${d?.id} (D) na orbicie ${cap}, roster [${guardIds(w, e1).join(', ')}], zdarzenie posted × ${ev.length} (${ev[0]?.data?.trigger})`);
  assert(es.length === 2 && es.every((v) => v.position?.state === 'docked' && v.position?.dockedAt === cap) && d?.serviceState === 'active',
    `G1b (KONTROLA sceny): eskorty z bakiem (${es.length}) w doku; defender z puli w służbie (${d?.serviceState})`);
  assert(roster(w, e2).length === 0 && posted(e2).length === 0 && armedOf(w, e2).length === 0,
    'G1c (KONTROLA): imperium bez wojny — bez puli, bez strażnika, bez rosteru');
}

// ── G2 — pierwsza granica miesiąca z kadłubem w służbie ──────────────────────────────────────────
console.log('\nG2 — brak kadłuba w służbie przy mobilizacji: stanowisko na pierwszej granicy miesiąca, na której jest');
{
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  const stored = [D, D].map((t) => quiet(() => w.vm.createAIVessel({ templateId: t, empireId: e1, planetId: cap, origin: 'shipyard_sim' }))?.vessel);
  for (const v of stored) v.serviceState = 'stored';
  declare(w, e1);
  const atMob = { roster: roster(w, e1).length, svc: stored.map((v) => v.serviceState).join(','), pool: poolOf(w, e1).map((v) => v.directorOrigin === D ? 'D' : 'E').join('') };
  run(w, 1);
  const ev = posted(e1);
  const g = ev[0]?.data?.vesselId;
  assert(atMob.roster === 0 && atMob.svc === 'mobilizing,mobilizing' && atMob.pool === 'EE',
    `G2a (KONTROLA sceny): przy mobilizacji — rezerwa ${atMob.svc}, pula ${atMob.pool} (bez defendera), stanowisko puste`);
  assert(ev.length === 1 && ev[0].data?.trigger === 'monthly' && stored.some((v) => v.id === g) && atPost(hull(w, g), cap) && hull(w, g)?.serviceState === 'active',
    `G2b: miesiąc później — ${g} (obudzony z rezerwy) na orbicie stolicy, trigger ${ev[0]?.data?.trigger}`);
}

// ── G3 — trzyma orbitę i nie ściga ───────────────────────────────────────────────────────────────
console.log('\nG3 — strażnik trzyma orbitę: okręt gracza w układzie, 24 miesiące');
{
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  declare(w, e1);
  const g = guardIds(w, e1)[0];
  const C = EntityManager.get(cap);
  if (needGuard(g, 'G3')) {
  const p = VS.createVessel('hull_frigate', w.K.homePlanet.id, { name: 'Intruz', modules: ['weapon_laser'], systemId: C.systemId, x: C.x + 3 * 110, y: C.y });
  p.position.state = 'orbiting'; p.position.dockedAt = null;
  w.vm._vessels.set(p.id, p);
  quiet(() => EventBus.emit('vessel:created', { vessel: p }));
  run(w, 24);
  const gOrders = w.orders.filter((o) => o.vesselId === g).length;
  assert(!!g && gOrders === 0 && atPost(hull(w, g), cap) && !hull(w, g)?.movementOrder && same(guardIds(w, e1), [g]),
    `G3: ${g} — rozkazów ${gOrders}, na orbicie stolicy, roster bez zmian (okręt gracza ${p.id} 3 AU od stolicy)`);
  }
}

// ── G4 — powrót na stanowisko ────────────────────────────────────────────────────────────────────
console.log('\nG4 — zepchnięty ze stanowiska wraca');
{
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  declare(w, e1);
  const g = guardIds(w, e1)[0];
  if (needGuard(g, 'G4')) {
  const v = hull(w, g);
  run(w, 2);
  const quietOrders = w.orders.filter((o) => o.vesselId === g).length;
  const other = otherPlanet(cap);
  v.position.state = 'orbiting'; v.position.dockedAt = other.id; v.position.x = other.x; v.position.y = other.y;
  run(w, 1);
  const ret = debugLog.query({ kind: 'fleetGuard:returnOrdered', empireId: e1 });
  const order = v.movementOrder;
  const target = v.mission?.type === 'move_to_point' ? v.mission?.targetId : null;   // cel-ciało rozkazu siedzi w misji
  let months = null;
  for (let i = 1; i <= 24 && months === null; i++) { run(w, 1); if (atPost(v, cap) && !v.movementOrder) months = i; }
  assert(quietOrders === 0, `G4a (KONTROLA): strażnik na stanowisku — rozkazów ${quietOrders}`);
  assert(ret.length === 1 && ret[0].data?.vesselId === g && order?.type === 'moveToPoint' && target === cap && months !== null,
    `G4b: z orbity ${other.id} — returnOrdered × ${ret.length}, rozkaz ${order?.type} → ${target}, na stanowisku po ${months} mies.`);
  v.position.state = 'docked'; v.position.dockedAt = cap;
  const before = w.orders.filter((o) => o.vesselId === g).length;
  run(w, 1);
  assert(atPost(v, cap) && w.orders.filter((o) => o.vesselId === g).length === before,
    `G4c: z doku stolicy — z powrotem na orbicie, bez rozkazu (${v.position.state})`);
  }
}

// ── G5 — wykluczenia ─────────────────────────────────────────────────────────────────────────────
console.log('\nG5 — wykluczenia: doktryny i pula uderzenia');
{
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  declare(w, e1);
  const g = guardIds(w, e1)[0];
  if (needGuard(g, 'G5')) {
  const v = hull(w, g);
  const doc = dd(w);
  const saved = roster(w, e1);
  const idleWith = doc.countIdleArmedAtCapital(e1);
  const idleIds = doc._idleArmedAtCapital(e1).map((x) => x.id);
  quiet(() => doc.setGuardRoster?.(e1, []));
  const idleWithout = doc._idleArmedAtCapital(e1).map((x) => x.id);
  quiet(() => doc.setGuardRoster?.(e1, saved));
  assert(!!g && !idleIds.includes(g) && idleWithout.includes(g) && idleWithout.length === idleWith + 1,
    `G5a: sonda doktryn bez strażnika (${idleWith}); KONTROLA bez wpisu w rosterze — ${idleWithout.length}, w tym ${g}`);
  quiet(() => doc.assignDoctrine({ empireId: e1, year: 1 }, { doctrine: 'defend_home', count: 5 }));
  quiet(() => doc.assignDoctrine({ empireId: e1, year: 1 }, { doctrine: 'patrol_border', count: 5 }));
  const rec = gameState.get(`director.doctrine.${e1}`) ?? {};
  assert(!(rec.defend_home ?? []).includes(g) && !(rec.patrol_border ?? []).includes(g) && atPost(v, cap) && !v.movementOrder && same(guardIds(w, e1), [g]),
    `G5b: assignDoctrine (garnizon ×5, patrol ×5) — strażnika brak w rosterach doktryn, na orbicie, bez rozkazu`);
  const max0 = v.warpFuel?.max;
  v.warpFuel = { ...(v.warpFuel ?? {}), max: 5 };
  const withRoster = w.K.directorOffensive.strikeReadyVessels(e1).map((x) => x.id);
  quiet(() => doc.setGuardRoster?.(e1, []));
  const withoutRoster = w.K.directorOffensive.strikeReadyVessels(e1).map((x) => x.id);
  quiet(() => doc.setGuardRoster?.(e1, saved));
  v.warpFuel = { ...v.warpFuel, max: max0 };
  assert(!withRoster.includes(g) && withoutRoster.includes(g),
    `G5c: pula uderzenia pomija strażnika z bakiem (${withRoster.length}); KONTROLA bez wpisu w rosterze — bierze ${g}`);
  }
}

// ── G6 — zapis → wczytanie ───────────────────────────────────────────────────────────────────────
console.log('\nG6 — zapis i wczytanie: roster i orbita');
{
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  declare(w, e1);
  run(w, 2);
  const g = guardIds(w, e1)[0];
  if (needGuard(g, 'G6')) {
  const r0 = roster(w, e1);
  const gsJson = JSON.stringify(gameState.serialize());
  const vmJson = JSON.stringify(quiet(() => w.vm.serialize()));
  gameState.restore(null);
  const blank = roster(w, e1).length;
  gameState.restore(JSON.parse(gsJson));
  quiet(() => w.vm.restore(JSON.parse(vmJson)));
  const v = hull(w, g);
  assert(blank === 0 && same(roster(w, e1), r0) && dd(w).isGuard?.(e1, g) === true,
    `G6a: roster przeżywa zapis (świadek: świeży stan — ${blank} wpisów); po wczytaniu ${JSON.stringify(roster(w, e1).map((e) => [e.bodyId, e.vesselId]))}`);
  assert(atPost(v, cap) && v.serviceState === 'active' && v.ownerEmpireId === e1,
    `G6b: orbita odtworzona z zapisu — ${v?.position?.state} przy ${v?.position?.dockedAt}, ${v?.serviceState}`);
  const n0 = posted(e1).length, o0 = w.orders.filter((o) => o.vesselId === g).length;
  run(w, 3);
  assert(posted(e1).length === n0 && w.orders.filter((o) => o.vesselId === g).length === o0 && atPost(v, cap) && same(roster(w, e1), r0),
    'G6c: 3 miesiące po wczytaniu — bez ponownego obsadzania, bez rozkazu, strażnik na stanowisku');
  }
}

// ── G7 — pokój przed mobilizacją ─────────────────────────────────────────────────────────────────
console.log('\nG7 — pokój przed mobilizacją: nic na orbicie');
{
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  const d = quiet(() => w.vm.createAIVessel({ templateId: D, empireId: e1, planetId: cap, origin: 'shipyard_sim' }))?.vessel;
  run(w, 24);
  const res = stationGuards(w, e1, 'monthly');
  const role = (typeof dd(w).doctrineRoleOf === 'function' ? dd(w).doctrineRoleOf(e1, d.id) : undefined) ?? ((gameState.get(`director.doctrine.${e1}`)?.defend_home ?? []).includes(d.id) ? 'defend_home' : null);
  assert(d.position.state === 'docked' && roster(w, e1).length === 0 && posted(e1).length === 0 && res?.reason === 'not_mobilized' && role === 'defend_home',
    `G7a: 24 mies. pokoju — ${d.id} w doku (rola ${role}), roster ${roster(w, e1).length}, stationGuards → ${res?.reason}`);
  declare(w, e1);
  const def = gameState.get(`director.doctrine.${e1}`)?.defend_home ?? [];
  assert(same(guardIds(w, e1), [d.id]) && atPost(d, cap) && !def.includes(d.id),
    `G7b: wojna — ${d.id} z garnizonu zostaje strażnikiem i wypada z defend_home (${JSON.stringify(def)})`);
}

// ── G8 — wyłącznik ───────────────────────────────────────────────────────────────────────────────
console.log('\nG8 — wyłącznik fleetPoolSystem.enabled');
{
  const w = boot({ pool: false });
  const [e1] = w.emps;
  declare(w, e1);
  run(w, 12);
  assert(roster(w, e1).length === 0 && posted(e1).length === 0 && stationGuards(w, e1, 'monthly')?.reason === 'disabled' && poolOf(w, e1).length === 0,
    `G8: wyłącznik — wojna bez puli i bez strażnika; stationGuards → ${stationGuards(w, e1, 'monthly')?.reason}`);
}

// ── G9 — strojenie ───────────────────────────────────────────────────────────────────────────────
console.log('\nG9 — fleetGuardsPerBody');
{
  const T = (await import('../../data/StrikesBackData.js')).SB_TUNING;
  const TUN = await import('../../utils/StrikesBackTuning.js');
  assert(T.fleetGuardsPerBody?.default === 1 && T.fleetGuardsPerBody?.type === 'int' && T.fleetGuardsPerBody?.min === 0,
    `G9a: klucz fleetGuardsPerBody — domyślnie ${T.fleetGuardsPerBody?.default}, ${T.fleetGuardsPerBody?.type}, ${T.fleetGuardsPerBody?.min}..${T.fleetGuardsPerBody?.max}`);
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  gameState.set('strikesBackTuning', {}, 'keeper_fresh');
  const set2 = TUN.setTuning('fleetGuardsPerBody', 2);
  // dwa defendery w służbie przy stolicy (przy jednym pula dokłada wyłącznie eskorty — limit 2 wypełniony, minimum z bakiem)
  const extra = [D, D].map((t) => quiet(() => w.vm.createAIVessel({ templateId: t, empireId: e1, planetId: cap, origin: 'shipyard_sim' }))?.vessel);
  declare(w, e1);
  const two = guardIds(w, e1);
  assert(two.length === 2 && extra.every((x) => two.includes(x.id)) && two.every((id) => atPost(hull(w, id), cap)),
    `G9b: 2 na ciało — dwa strażniki na orbicie stolicy [${two.join(', ')}] (sbSet: ${set2?.ok})`);
  if (needGuard(two.length === 2, 'G9c/G9d')) {
  TUN.setTuning('fleetGuardsPerBody', 1);
  run(w, 1);
  const one = guardIds(w, e1);
  const rel = debugLog.query({ kind: 'fleetGuard:released', empireId: e1 });
  const freed = two.find((id) => !one.includes(id));
  assert(one.length === 1 && rel.length === 1 && rel[0].data?.vesselId === freed && atPost(hull(w, freed), cap)
    && dd(w)._idleArmedAtCapital(e1).some((x) => x.id === freed),
    `G9c: 2 → 1 — zwolniony ${freed} (released × ${rel.length}), zostaje na orbicie, sonda doktryn go widzi`);
  TUN.setTuning('fleetGuardsPerBody', 0);
  run(w, 1);
  assert(guardIds(w, e1).length === 0 && debugLog.query({ kind: 'fleetGuard:released', empireId: e1 }).length === 2,
    `G9d: 1 → 0 — roster pusty (${guardIds(w, e1).length})`);
  }
  gameState.set('strikesBackTuning', {}, 'keeper_cleanup');
}

// ── G10 — pokój po wojnie ────────────────────────────────────────────────────────────────────────
console.log('\nG10 — pokój po wojnie: strażnik zostaje');
{
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  declare(w, e1);
  const g = guardIds(w, e1)[0];
  if (needGuard(g, 'G10')) {
  w.K.diplomacySystem.relations.setStatus('player', e1, 'peace', {}, 'keeper_peace');
  run(w, 12);
  const stays = atPost(hull(w, g), cap) && same(guardIds(w, e1), [g]);
  const v = hull(w, g), other = otherPlanet(cap);
  v.position.state = 'orbiting'; v.position.dockedAt = other.id; v.position.x = other.x; v.position.y = other.y;
  run(w, 1);
  const back = v.movementOrder?.type === 'moveToPoint' && v.mission?.type === 'move_to_point' ? v.mission.targetId : null;
  assert(w.K.diplomacySystem.relations.getStatus('player', e1) === 'peace' && stays && back === cap,
    `G10: w pokoju — ${g} na stanowisku po 12 mies. (${stays}); zepchnięty — rozkaz powrotu na ${back}`);
  }
}

// ── G11 — wpięcie ────────────────────────────────────────────────────────────────────────────────
console.log('\nG11 — wpięcie: audyt, rola w doktrynach, pula uderzenia');
{
  const dl = stripComments(read('core/DebugLog.js'));
  const tracked = dl.slice(dl.indexOf('const TRACKED_EVENTS = ['), dl.indexOf('];', dl.indexOf('const TRACKED_EVENTS = [')));
  assert(['fleetGuard:posted', 'fleetGuard:returnOrdered', 'fleetGuard:released'].every((e) => tracked.includes(`'${e}'`)),
    'G11a: fleetGuard:posted / returnOrdered / released w DebugLog.TRACKED_EVENTS');
  const doc = stripComments(read('systems/director/DirectorDoctrine.js'));
  assert(/_hasAnyDoctrine\(empireId, vesselId\)\s*\{\s*return this\.doctrineRoleOf\(empireId, vesselId\) !== null;/.test(doc)
    && /rec\.guard\.some\(\(e\) => e\?\.vesselId === vesselId\)\) return 'guard'/.test(doc),
    'G11b: `_hasAnyDoctrine` pyta `doctrineRoleOf`, a ta zna rolę strażnika (roster `guard`)');
  const off = stripComments(read('systems/director/DirectorOffensive.js'));
  const i = off.indexOf('strikeReadyVessels(empireId) {');
  const body = i >= 0 ? off.slice(i, off.indexOf('return out;', i)) : '';
  assert(/isGuard\?\.\(empireId, v\.id\)\)\s*continue;/.test(body) && body.indexOf('isGuard') < body.indexOf('out.push(v)'),
    'G11c: `strikeReadyVessels` pomija strażnika przed dopisaniem do puli');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
