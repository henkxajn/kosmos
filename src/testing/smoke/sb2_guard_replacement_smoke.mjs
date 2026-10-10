// AI STRIKES BACK S2 — keeper B5: ZASTĘPSTWO STRAŻNIKA i ROZWIĄZANIE STANOWISKA (SB33), odczyt stanowisk w konsoli.
// Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB33).
//
//   R1  strażnik stolicy utracony w środku roku: na granicach miesięcy — wpis „utracony”, BEZ zastępstwa, choć kadłub-strażnik
//       stoi w doku stolicy (świadek co miesiąc); na granicy roku kalendarzowego — zastępstwo tym kadłubem
//       (`trigger: 'replacement'`)
//   R2  brak kadłuba na granicy roku — stanowisko czeka; rok później odrastanie puli daje defendera i ta sama granica roku
//       obsadza nim stanowisko stolicy (drugie ciało — bez kadłuba: wolne)
//   R3  stanowisko drugiego ciała, które przestało należeć do imperium — rozwiązane (`fleetGuard:dissolved`); żywy strażnik
//       zostaje, gdzie stoi, bez roli; stanowisko stolicy bez zmian
//   R4  odczyt: `KOSMOS.debug.sbTuning()` (tabela floty — kolumny bez zmian) + wiersz `[sb] straze <imperium>: …` na imperium:
//       strzeżone ciała i kto trzyma każde stanowisko (orbita / lot / utracony / wolne; imperium bez puli — `-`);
//       `fleetPoolSystem.guardPosts(id)` — ta sama linia
//   R5  pokój: strażnik utracony w pokoju zastąpiony na granicy roku (strażnicy zostają także w pokoju)
//   R6  zapis → wczytanie: wpis „utracony” przeżywa, zastępstwo na granicy roku po wczytaniu — dokładnie raz
//   R7  wpięcie: audyt (`lost`, `dissolved`), zastępstwo wyłącznie z kontroli rocznej
//   R8  priorytet stolicy: stanowisko stolicy utracone, drugie ciało nigdy nieobsadzone, JEDEN wolny kadłub — co miesiąc nie
//       leci na drugie ciało (rezerwa dla stolicy, SB32 „drugi kadłub”), na granicy roku obsadza stolicę; KONTROLA (osobny
//       świat): nowy kadłub przy obsadzonej stolicy — leci na drugie ciało na najbliższej granicy miesiąca
//
// ⚠ Świat: `bootWithDirector` + `MovementOrderSystem`; drugie ciało A (kolonia `emp_001` w układzie stolicy) tworzone jawnie —
//   imperium samo kolonizuje układ w ciągu miesięcy, a ciało raz obsadzone zostaje drugim (stabilność, B4). Przed wojną jeden
//   tick (ustawia miesiąc kontroli). Strata = `isWreck` (wzór `sb1_fleet_pool_smoke` T12; KONTROLA w R1).
// ⚠ Każda scena ma własny świat: kolejny rozruch podmienia `window.KOSMOS` i `gameState` całego procesu.
// ⚠ Fail-first: na drzewie sprzed B5 piny zastępstwa, rozwiązania, odczytu i priorytetu czerwone; KONTROLE zielone po obu
//   stronach.

import '../headless/env.js';           // MUSI być pierwszy
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { printFleetLimits } from '../../utils/FleetLimit.js';
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
const GP  = await import('../../utils/GuardPostPlanner.js').catch(() => null);
const TUN = await import('../../utils/StrikesBackTuning.js');

const D = 'frigate_system_defender';
const run = (w, months) => quiet(() => w.ticker.run(months, { tickSize: 1.0 }));
const now = (w) => w.K.timeSystem.gameTime;
const yearOf = (w) => Math.floor(now(w) + 1e-9);

function world({ activeD = 0 } = {}) {
  const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  const w = { core, K, ticker, vm: core.vesselManager, cm: core.colonyManager };
  run(w, 1);                                                    // pierwszy tick sesji — ustawia miesiąc kontroli
  w.e1 = K.empireRegistry.listIds()[0];
  w.e2 = K.empireRegistry.listIds()[1];
  w.cap = K.directorProduction.capitalOf(w.e1)?.planetId;
  const C = EntityManager.get(w.cap);
  const near = (EntityManager.getByTypeInSystem('planet', C.systemId) ?? []).filter((b) => b.id !== C.id && !w.cm.getColony(b.id))
    .sort((a, b) => Math.hypot(a.x - C.x, a.y - C.y) - Math.hypot(b.x - C.x, b.y - C.y))[0];
  quiet(() => { w.cm.createColony(near.id, {}, 10, 0, w.e1); K.empireRegistry.addColony(w.e1, near.id); });
  w.A = near.id;
  w.active = Array.from({ length: activeD }, () => mkD(w));
  return w;
}
const mkD = (w) => quiet(() => w.vm.createAIVessel({ templateId: D, empireId: w.e1, planetId: w.cap, origin: 'shipyard_sim' }))?.vessel;
const declare = (w) => quiet(() => w.K.diplomacySystem.declareWar(w.e1, 'keeper_setup'));
const roster = (w) => w.K.directorDoctrine?.guardRoster?.(w.e1) ?? [];
const entry = (w, bodyId) => roster(w).find((e) => e.bodyId === bodyId) ?? null;
const ev = (w, kind) => debugLog.query({ kind, empireId: w.e1 });
const replacements = (w) => ev(w, 'fleetGuard:posted').filter((e) => e.data?.trigger === 'replacement');
const atPost = (v, bodyId) => v?.position?.state === 'orbiting' && v?.position?.dockedAt === bodyId;
const dockedFree = (w, v) => !!v && !v.isWreck && v.serviceState === 'active' && v.position?.state === 'docked' && v.position?.dockedAt === w.cap
  && !v.mission && !v.movementOrder && !roster(w).some((e) => e.vesselId === v.id);
/** Do ostatniego miesiąca roku `y - 1` (granica roku `y` jeszcze nie przekroczona). Zwraca liczbę granic miesiąca. */
const toBeforeYear = (w, y, each = null) => { let n = 0; while (now(w) + 1 / 12 < y - 1e-9) { run(w, 1); n++; each?.(); } return n; };

// ── R1 — zastępstwo wyłącznie na granicy roku ────────────────────────────────────────────────────
console.log('\nR1 — utracony strażnik stolicy: bez zastępstwa co miesiąc, zastępstwo na granicy roku');
{
  const w = world({ activeD: 3 });
  declare(w);
  const [d1, d2, d3] = w.active;
  const g0 = entry(w, w.cap)?.vesselId, a0 = entry(w, w.A)?.vesselId;
  run(w, 1);
  d1.isWreck = true;                                            // strata w środku roku 0
  run(w, 1);
  const lostEv = ev(w, 'fleetGuard:lost');
  const e1 = entry(w, w.cap);
  assert(g0 === d1.id && a0 === d2.id && lostEv.length === 1 && lostEv[0].data?.vesselId === d1.id && lostEv[0].data?.reason === 'wreck'
    && e1 && e1.vesselId === null && e1.lostVesselId === d1.id && Number.isFinite(e1.lostYear),
    `R1a: strata ${d1.id} — wpis utracony (vesselId ${e1?.vesselId}, lostVesselId ${e1?.lostVesselId}), lost × ${lostEv.length} (${lostEv[0]?.data?.reason})`);
  let free = true;
  const monthly = toBeforeYear(w, 1, () => { if (!dockedFree(w, d3)) free = false; });
  assert(monthly >= 6 && free && replacements(w).length === 0 && entry(w, w.cap)?.vesselId === null,
    `R1b: ${monthly} granic miesiąca do końca roku — ${d3.id} wolny w doku stolicy co miesiąc (${free}), zastępstw ${replacements(w).length}`);
  run(w, 1);                                                    // granica roku 1
  const rep = replacements(w);
  assert(yearOf(w) === 1 && rep.length === 1 && rep[0].data?.vesselId === d3.id && rep[0].data?.bodyId === w.cap
    && entry(w, w.cap)?.vesselId === d3.id && atPost(d3, w.cap),
    `R1c: granica roku ${yearOf(w)} — zastępstwo ${rep[0]?.data?.vesselId} (trigger replacement), na orbicie stolicy`);
  assert(d1.isWreck === true && GP?.isGuardHull?.(d1, w.e1) === false && GP?.isGuardHull?.(d3, w.e1) === true,
    'R1d (KONTROLA): wrak nie jest kadłubem-strażnikiem, żywy defender w służbie — jest');
}

// ── R2 — stanowisko czeka na odrastanie ──────────────────────────────────────────────────────────
console.log('\nR2 — brak kadłuba na granicy roku: stanowisko czeka; odrastanie daje defendera rok później');
{
  const w = world();
  gameState.set('strikesBackTuning', {}, 'keeper_fresh');
  declare(w);
  const pool = w.vm.getAllVessels().filter((v) => v.ownerEmpireId === w.e1 && v.origin === 'pool');
  const g0 = entry(w, w.cap)?.vesselId;
  TUN.setTuning('fleetRegrowthPerYear', 0);
  for (const v of pool) v.isWreck = true;                       // strażnik i eskorty — bez kadłuba do zastępstwa
  toBeforeYear(w, 1);
  run(w, 1);                                                    // granica roku 1: bez odrastania, bez kadłuba
  const waited = yearOf(w) === 1 && replacements(w).length === 0 && entry(w, w.cap)?.vesselId === null && entry(w, w.cap)?.lostVesselId === g0;
  TUN.resetTuning('fleetRegrowthPerYear');
  toBeforeYear(w, 2);
  run(w, 1);                                                    // granica roku 2: odrastanie, potem zastępstwo
  const regrown = ev(w, 'fleetPool:regrown').filter((e) => e.data?.year === 2);
  const rep = replacements(w);
  assert(!!g0 && waited, `R2a: granica roku 1 — stanowisko stolicy czeka (utracony ${g0}, zastępstw 0)`);
  assert(yearOf(w) === 2 && regrown.length === 1 && regrown[0].data?.templateId === D && rep.length === 1
    && rep[0].data?.vesselId === regrown[0].data?.vesselId && entry(w, w.cap)?.vesselId === regrown[0].data?.vesselId && !entry(w, w.A),
    `R2b: granica roku 2 — odrastanie ${regrown[0]?.data?.templateId} ${regrown[0]?.data?.vesselId}, ta sama granica obsadza nim stolicę (${rep[0]?.data?.vesselId}); drugie ciało bez strażnika`);
  gameState.set('strikesBackTuning', {}, 'keeper_cleanup');
}

// ── R3 — rozwiązanie stanowiska ──────────────────────────────────────────────────────────────────
console.log('\nR3 — drugie ciało przestaje należeć do imperium: stanowisko rozwiązane');
{
  const w = world({ activeD: 2 });
  declare(w);
  const [d1, d2] = w.active;
  for (let i = 0; i < 24 && !atPost(d2, w.A); i++) run(w, 1);
  const before = roster(w).map((e) => e.bodyId);
  const ok = quiet(() => w.cm.captureColonyForPlayer(w.A, 'keeper'));
  run(w, 1);
  const dis = ev(w, 'fleetGuard:dissolved');
  assert(same(before, [w.cap, w.A]) && ok === true && dis.length === 1 && dis[0].data?.bodyId === w.A && dis[0].data?.vesselId === d2.id
    && !roster(w).some((e) => e.bodyId === w.A) && entry(w, w.cap)?.vesselId === d1.id,
    `R3a: przed [${before.join(', ')}]; przejęcie ${w.A} — dissolved × ${dis.length}, roster [${roster(w).map((e) => e.bodyId).join(', ')}]`);
  assert(!d2.isWreck && atPost(d2, w.A) && (w.K.directorDoctrine?.doctrineRoleOf?.(w.e1, d2.id) ?? null) === null && !d2.movementOrder,
    `R3b: ${d2.id} zostaje na orbicie ${w.A}, bez roli i bez rozkazu`);
}

// ── R4 — odczyt w konsoli ────────────────────────────────────────────────────────────────────────
console.log('\nR4 — sbTuning(): strzeżone ciała i kto trzyma każde stanowisko');
{
  const w = world({ activeD: 2 });
  declare(w);
  const [d1, d2] = w.active;
  const capture = () => { const out = []; const l = console.log, tb = console.table; console.log = (...a) => out.push(['log', a.join(' ')]); console.table = (r) => out.push(['table', r]);
    try { printFleetLimits(w.K); } finally { console.log = l; console.table = tb; } return out; };
  const o1 = capture();
  const table = o1.find(([k]) => k === 'table')?.[1] ?? [];
  const cols = ['imperium', 'pop', 'fabryki', 'szczebel', 'mnoznik', 'limit', 'uzbrojone', 'sluzba', 'rezerwa', 'mobilizacja', 'dok', 'przestrzen', 'miejsce', 'zBakiem', 'pula', 'pulaDoda'];
  const l1 = o1.filter(([k, s]) => k === 'log' && s.startsWith(`[sb] straze ${w.e1}:`)).map(([, s]) => s);
  const l2 = o1.filter(([k, s]) => k === 'log' && s.startsWith(`[sb] straze ${w.e2}:`)).map(([, s]) => s);
  assert(table.length === 2 && table.every((r) => same(Object.keys(r), cols)),
    'R4a (KONTROLA): tabela floty — wiersz na imperium, kolumny bez zmian');
  assert(l1.length === 1 && l1[0] === `[sb] straze ${w.e1}: ${w.cap}(stolica)=${d1.id} orbita, ${w.A}(drugie)=${d2.id} lot` && same(l2, [`[sb] straze ${w.e2}: -`]),
    `R4b: „${l1[0]}” · „${l2[0]}”`);
  d1.isWreck = true;
  for (let i = 0; i < 24 && !atPost(d2, w.A); i++) run(w, 1);
  const line = w.K.fleetPoolSystem?.guardPosts?.(w.e1);
  assert(line === `${w.cap}(stolica)=- utracony, ${w.A}(drugie)=${d2.id} orbita`,
    `R4c: po stracie i przylocie — guardPosts: „${line}”`);
  gameState.set('strikesBackTuning', {}, 'keeper_fresh');
  TUN.setTuning('fleetGuardsPerBody', 2);
  const line2 = w.K.fleetPoolSystem?.guardPosts?.(w.e1);
  gameState.set('strikesBackTuning', {}, 'keeper_cleanup');
  assert(line2 === `${w.cap}(stolica)=- utracony, ${w.cap}(stolica)=- wolne, ${w.A}(drugie)=${d2.id} orbita, ${w.A}(drugie)=- wolne`,
    `R4d: 2 na ciało — stanowiska nigdy nieobsadzone jako wolne: „${line2}”`);
}

// ── R5 — pokój ───────────────────────────────────────────────────────────────────────────────────
console.log('\nR5 — pokój: utracony strażnik zastąpiony na granicy roku');
{
  const w = world({ activeD: 3 });
  declare(w);
  const [d1, , d3] = w.active;
  w.K.diplomacySystem.relations.setStatus('player', w.e1, 'peace', {}, 'keeper_peace');
  run(w, 1);
  d1.isWreck = true;
  toBeforeYear(w, 1);
  run(w, 1);
  assert(w.K.diplomacySystem.relations.getStatus('player', w.e1) === 'peace' && replacements(w).length === 1
    && entry(w, w.cap)?.vesselId === d3.id && atPost(d3, w.cap),
    `R5: w pokoju — granica roku ${yearOf(w)}: zastępstwo ${entry(w, w.cap)?.vesselId}`);
}

// ── R6 — zapis i wczytanie ───────────────────────────────────────────────────────────────────────
console.log('\nR6 — zapis → wczytanie: wpis utracony przeżywa, zastępstwo dokładnie raz');
{
  const w = world({ activeD: 3 });
  declare(w);
  const [d1, , d3] = w.active;
  run(w, 1);
  d1.isWreck = true;
  run(w, 1);
  const lostBefore = entry(w, w.cap);
  const gsJson = JSON.stringify(gameState.serialize());
  const vmJson = JSON.stringify(quiet(() => w.vm.serialize()));
  gameState.restore(JSON.parse(gsJson));
  quiet(() => w.vm.restore(JSON.parse(vmJson)));
  const lostAfter = entry(w, w.cap);
  toBeforeYear(w, 1);
  run(w, 1);
  run(w, 12);
  const rep = replacements(w);
  const nd3 = w.vm.getVessel(d3.id);
  assert(lostBefore?.vesselId === null && same(lostAfter, lostBefore),
    `R6a: wpis utracony po wczytaniu bez zmian (${JSON.stringify({ v: lostAfter?.vesselId, lost: lostAfter?.lostVesselId })})`);
  assert(rep.length === 1 && rep[0].data?.vesselId === d3.id && entry(w, w.cap)?.vesselId === d3.id && atPost(nd3, w.cap),
    `R6b: granica roku po wczytaniu — zastępstwo ${rep[0]?.data?.vesselId}; rok później bez drugiego (${rep.length})`);
}

// ── R7 — wpięcie ─────────────────────────────────────────────────────────────────────────────────
console.log('\nR7 — wpięcie: audyt i zastępstwo wyłącznie z kontroli rocznej');
{
  const dl = stripComments(read('core/DebugLog.js'));
  const tracked = dl.slice(dl.indexOf('const TRACKED_EVENTS = ['), dl.indexOf('];', dl.indexOf('const TRACKED_EVENTS = [')));
  assert(['fleetGuard:lost', 'fleetGuard:dissolved'].every((e) => tracked.includes(`'${e}'`)),
    'R7a: fleetGuard:lost / dissolved w DebugLog.TRACKED_EVENTS');
  const src = stripComments(read('systems/FleetPoolSystem.js'));
  const calls = src.match(/this\.stationGuards\([^)]*\)/g) ?? [];
  const withReplace = calls.filter((c) => /replaceLost:\s*true/.test(c));
  const yi = src.indexOf('_yearlyCheck() {');
  const yearly = yi >= 0 ? src.slice(yi, src.indexOf('\n  }\n', yi)) : '';
  assert(withReplace.length === 1 && /this\.stationGuards\(emp\.id, 'yearly', \{ replaceLost: true \}\)/.test(yearly) && calls.length >= 3,
    `R7b: zastępstwo (replaceLost) wyłącznie z kontroli rocznej — wywołań stationGuards ${calls.length}, z replaceLost ${withReplace.length}`);
}

// ── R8 — priorytet stolicy ───────────────────────────────────────────────────────────────────────
console.log('\nR8 — utracona stolica rezerwuje pierwszy kadłub: drugie ciało czeka na drugi');
{
  const w = world({ activeD: 1 });
  declare(w);
  const [d1] = w.active;
  run(w, 1);
  d1.isWreck = true;
  run(w, 1);
  const d2 = mkD(w);                                            // nowy defender w doku stolicy w środku roku
  let notSent = true;
  toBeforeYear(w, 1, () => { if (!dockedFree(w, d2) || entry(w, w.A)) notSent = false; });
  assert(entry(w, w.cap)?.vesselId === null && notSent && replacements(w).length === 0,
    `R8a: stolica utracona, ${d2.id} wolny w doku — co miesiąc NIE leci na drugie ciało (${notSent})`);
  run(w, 1);                                                    // granica roku 1
  assert(yearOf(w) === 1 && entry(w, w.cap)?.vesselId === d2.id && atPost(d2, w.cap) && !entry(w, w.A),
    `R8b: granica roku — ${d2.id} obsadza STOLICĘ; drugie ciało dalej bez strażnika`);
}
{
  // R8c — osobny świat: stolica OBSADZONA, drugie ciało nigdy nieobsadzone, nowy defender w doku — leci na drugie ciało na
  //   najbliższej granicy miesiąca (rezerwa nie blokuje, gdy stolica nie czeka) — zielone po obu stronach.
  const w = world({ activeD: 1 });
  declare(w);
  const d2 = mkD(w);
  run(w, 1);
  const a = entry(w, w.A);
  const v2 = w.vm.getVessel(d2.id);
  assert(entry(w, w.cap)?.vesselId === w.active[0].id && a?.vesselId === d2.id && v2?.mission?.targetId === w.A,
    `R8c (KONTROLA): stolica obsadzona — nowy defender ${d2.id} leci na drugie ciało na najbliższej granicy miesiąca (${a?.vesselId})`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
