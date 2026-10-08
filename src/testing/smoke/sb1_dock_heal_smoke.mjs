// AI STRIKES BACK S1 (sesja 2) — keeper leczenia chimer doku przy WCZYTANIU (Finding 407, SB24).
// Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB24), §6 (407).
//
//   T1  fixture GATE-S4 przez PRAWDZIWE `VesselManager.restore`: `v_21`, `v_22`, `v_23` stoją w `sys_home` (układ
//       ciała `entity_2`, przy którym są w doku); świadek: w zapisie mają `sys_060`, a `entity_2` leży w `sys_home`
//   T2  kadłuby AI w doku — `systemId` bez zmian (świadek: 6 kadłubów `emp_001` w doku przy `entity_115`)
//   T3  statki w przestrzeni (orbita, lot) — `systemId` bez zmian; KONTROLA: syntetyczna chimera NA ORBICIE
//       (dockedAt = ciało z innego układu) nie jest leczona
//   T4  nic poza `systemId`: serializacja z leczeniem = serializacja bez ciał (leczenie niemożliwe) poza dokładnie
//       trzema polami `systemId`
//   T5  jeden wpis `vessel:systemIdHealed` w DebugLog na wyleczony statek (from, to, dockedAt, właściciel);
//       zdarzenie w `DebugLog.TRACKED_EVENTS`
//   T6  bez zmian i bez wpisu: wrak w doku, nieznane ciało, ciało bez `systemId`, dok z misją międzygwiezdną,
//       statek zgodny; KONTROLA: ten sam statek bez wady (nie wrak) jest leczony
//   T7  tick (`_reconcileSystemId`, jak w `_updatePositions`) nie cofa leczenia
//   T8  obrona gracza: `WarSystem._playerVesselsInSystem('sys_home')` liczy wyleczone fregaty, `sys_060` — już nie
//
// ⚠ Fail-first: na kodzie sprzed leczenia każdy pin jest czerwony; zielone po obu stronach są wyłącznie świadkowie stanu
//   wejściowego (T1a, T2a). Każdy pin wykluczający (T2b, T3a, T3b, T6a) ma w tym samym asercie świadka, że leczenie
//   W TYM SAMYM wczytaniu zadziałało — inaczej przechodziłby jałowo na kodzie, który nie leczy niczego.
// ⚠ Świat: sam `VesselManager` + `EntityManager` z ciałami zapisu (id, nazwa, `systemId` — to, co czyta leczenie);
//   bez `GameCore` (jego generator galaktyki zajmuje te same identyfikatory `entity_N`).

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import debugLog from '../../core/DebugLog.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { WarSystem } from '../../systems/WarSystem.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const FIXTURE = JSON.parse(gunzipSync(readFileSync(path.join(SRC, 'testing/fixtures/GATE-S4-fresh-gy60.save.json.gz'))).toString('utf8'));
const SAVE_VESSELS = FIXTURE.civ4x.vesselManager.vessels;
const BODIES = [...FIXTURE.planets, ...(FIXTURE.moons ?? []), ...(FIXTURE.planetoids ?? [])];
const CHIMERAS = ['v_21', 'v_22', 'v_23'];

window.KOSMOS = window.KOSMOS ?? {};
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

/** Świeży świat: czysty EventBus + DebugLog, ciała zapisu w EntityManager (albo bez nich), nowy VesselManager. */
function world({ bodies = true } = {}) {
  EventBus.clear();
  debugLog.clear();
  debugLog.attach();
  EntityManager.clear();
  if (bodies) for (const b of BODIES) EntityManager.add({ id: b.id, name: b.name, type: 'planet', systemId: b.systemId, x: 0, y: 0 });
  const vm = new VesselManager();
  window.KOSMOS.vesselManager = vm;
  return vm;
}
const restoreFixture = (opts) => {
  const vm = world(opts);
  quiet(() => vm.restore(JSON.parse(JSON.stringify(FIXTURE.civ4x.vesselManager))));
  return vm;
};
const saved = (id) => SAVE_VESSELS.find((v) => v.id === id);
const healedLog = () => debugLog.query({ kind: 'vessel:systemIdHealed' });

// ── T1 — fixture: trzy chimery wracają do układu ciała ─────────────────────────────────────────
console.log('\nT1 — fixture GATE-S4: chimery doku po wczytaniu');
{
  const e2 = BODIES.find((b) => b.id === 'entity_2');
  assert(CHIMERAS.every((id) => saved(id)?.systemId === 'sys_060' && saved(id)?.position?.state === 'docked'
    && saved(id)?.position?.dockedAt === 'entity_2') && e2?.systemId === 'sys_home',
    'T1a (świadek): w zapisie v_21–v_23 mają sys_060, stoją w doku przy entity_2, a entity_2 leży w sys_home');
  const vm = restoreFixture();
  const got = CHIMERAS.map((id) => vm.getVessel(id)?.systemId);
  assert(got.every((s) => s === 'sys_home'), `T1b: po wczytaniu v_21, v_22, v_23 w sys_home (${got.join(', ')})`);
  const chim = vm.getAllVessels().filter((v) => v.position?.state === 'docked' && !v.isWreck && v.position.dockedAt
    && EntityManager.get(v.position.dockedAt)?.systemId && EntityManager.get(v.position.dockedAt).systemId !== v.systemId);
  assert(chim.length === 0, `T1c: po wczytaniu żaden statek w doku nie stoi w innym układzie niż jego ciało (${chim.map((v) => v.id).join(', ') || 'brak'})`);
}

// ── T2 — kadłuby AI w doku bez zmian ───────────────────────────────────────────────────────────
console.log('\nT2 — kadłuby AI w doku bez zmian');
{
  const aiDocked = SAVE_VESSELS.filter((v) => (v.ownerEmpireId ?? null) && v.position?.state === 'docked');
  const e001 = aiDocked.filter((v) => v.ownerEmpireId === 'emp_001' && v.position?.dockedAt === 'entity_115');
  assert(e001.length === 6, `T2a (świadek): w zapisie 6 kadłubów emp_001 w doku przy entity_115 (${e001.length})`);
  const vm = restoreFixture();
  const changed = aiDocked.filter((v) => vm.getVessel(v.id)?.systemId !== v.systemId);
  assert(aiDocked.length >= 6 && changed.length === 0 && vm.getVessel('v_21')?.systemId === 'sys_home',
    `T2b: ${aiDocked.length} kadłubów AI w doku — systemId jak w zapisie (zmienione: ${changed.map((v) => v.id).join(', ') || 'brak'}); świadek: v_21 w tym samym wczytaniu wyleczony`);
}

// ── T3 — statki w przestrzeni bez zmian ────────────────────────────────────────────────────────
console.log('\nT3 — statki w przestrzeni bez zmian');
{
  const inSpace = SAVE_VESSELS.filter((v) => v.position?.state === 'orbiting' || v.position?.state === 'in_transit');
  const vm = restoreFixture();
  const changed = inSpace.filter((v) => vm.getVessel(v.id)?.systemId !== (v.systemId === undefined ? 'sys_home' : v.systemId)
    && v.mission?.type !== 'interstellar_jump');
  assert(inSpace.length >= 10 && changed.length === 0 && vm.getVessel('v_21')?.systemId === 'sys_home',
    `T3a: ${inSpace.length} statków na orbicie i w locie — systemId jak w zapisie (zmienione: ${changed.map((v) => v.id).join(', ') || 'brak'}); świadek: v_21 w tym samym wczytaniu wyleczony`);
  // KONTROLA: chimera NA ORBICIE (dockedAt = ciało z innego układu) — leczenie dotyczy wyłącznie doku
  const data = JSON.parse(JSON.stringify(FIXTURE.civ4x.vesselManager));
  const orb = data.vessels.find((v) => v.id === 'v_21');
  orb.position.state = 'orbiting';
  const vm2 = world();
  quiet(() => vm2.restore(data));
  assert(vm2.getVessel('v_21')?.systemId === 'sys_060' && vm2.getVessel('v_22')?.systemId === 'sys_home',
    'T3b: ta sama fregata na ORBICIE przy ciele z innego układu zostaje w sys_060; świadek: jej bliźniak w doku (v_22) wyleczony');
}

// ── T4 — nic poza systemId ─────────────────────────────────────────────────────────────────────
console.log('\nT4 — leczenie zmienia wyłącznie systemId');
{
  const vmHeal = restoreFixture();
  const withHeal = JSON.parse(JSON.stringify(quiet(() => vmHeal.serialize())));
  const vmNo = restoreFixture({ bodies: false });      // bez ciał leczenie nie ma do czego porównać
  const without = JSON.parse(JSON.stringify(quiet(() => vmNo.serialize())));
  const diffs = [];
  const walk = (a, b, p) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${p}.${k}`);
    } else diffs.push(`${p}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
  };
  walk(withHeal, without, 'save');
  const expected = CHIMERAS.map((id) => {
    const i = without.vessels.findIndex((v) => v.id === id);
    return `save.vessels.${i}.systemId: "sys_060" → "sys_home"`;
  }).sort();
  assert(diffs.length === 3 && JSON.stringify([...diffs].sort()) === JSON.stringify(expected),
    `T4: różnica zapisu z leczeniem i bez = dokładnie trzy pola systemId (${diffs.length}: ${diffs.slice(0, 5).join(' · ')})`);
}

// ── T5 — wpis audytu na każdy wyleczony statek ─────────────────────────────────────────────────
console.log('\nT5 — DebugLog: jeden wpis na wyleczony statek');
{
  restoreFixture();
  const log = healedLog();
  const rows = log.map((e) => `${e.data?.vesselId}:${e.data?.from}->${e.data?.to}@${e.data?.dockedAt}/${e.data?.owner}`).sort();
  assert(log.length === 3 && JSON.stringify(rows) === JSON.stringify(CHIMERAS.map((id) => `${id}:sys_060->sys_home@entity_2/player`)),
    `T5a: trzy wpisy vessel:systemIdHealed (${rows.join(' · ') || 'brak'})`);
  const dl = stripComments(read('core/DebugLog.js'));
  const tracked = dl.slice(dl.indexOf('const TRACKED_EVENTS = ['), dl.indexOf('];', dl.indexOf('const TRACKED_EVENTS = [')));
  assert(tracked.includes("'vessel:systemIdHealed'"), 'T5b: vessel:systemIdHealed w DebugLog.TRACKED_EVENTS');
}

// ── T6 — przypadki bez leczenia ────────────────────────────────────────────────────────────────
console.log('\nT6 — bez zmian i bez wpisu: wrak, nieznane ciało, ciało bez układu, misja międzygwiezdna, statek zgodny');
{
  const base = JSON.parse(JSON.stringify(saved('v_21')));
  const mk = (id, patch) => ({ ...JSON.parse(JSON.stringify(base)), id, ...patch, position: { ...base.position, ...(patch.position ?? {}) } });
  const data = { nextId: 900, vessels: [
    mk('t_wreck',   { isWreck: true }),
    mk('t_nobody',  { position: { dockedAt: 'entity_nope' } }),
    mk('t_nosys',   { position: { dockedAt: 'body_nosys' } }),
    mk('t_warp',    { mission: { type: 'interstellar_jump', phase: 'in_system', toSystemId: 'sys_060' } }),
    mk('t_ok',      { systemId: 'sys_home' }),
    mk('t_control', {}),
  ] };
  const vm = world();
  EntityManager.add({ id: 'body_nosys', name: 'Bez układu', type: 'planet', x: 0, y: 0 });
  quiet(() => vm.restore(data));
  const sys = (id) => vm.getVessel(id)?.systemId;
  const ids = healedLog().map((e) => e.data?.vesselId);
  assert(sys('t_wreck') === 'sys_060' && sys('t_nobody') === 'sys_060' && sys('t_nosys') === 'sys_060'
    && sys('t_warp') === 'sys_060' && sys('t_ok') === 'sys_home' && sys('t_control') === 'sys_home',
    `T6a: wrak / nieznane ciało / ciało bez układu / misja międzygwiezdna / zgodny — bez zmian (${['t_wreck', 't_nobody', 't_nosys', 't_warp', 't_ok'].map(sys).join(', ')}); świadek: ten sam statek bez wady wyleczony (${sys('t_control')})`);
  assert(JSON.stringify(ids) === JSON.stringify(['t_control']),
    `T6b: wpis audytu wyłącznie dla wyleczonego (${ids.join(', ') || 'brak'})`);
}

// ── T7 — tick nie cofa leczenia ────────────────────────────────────────────────────────────────
console.log('\nT7 — tick nie cofa leczenia');
{
  const vm = restoreFixture();
  const flips = CHIMERAS.map((id) => vm._reconcileSystemId(vm.getVessel(id)));
  assert(CHIMERAS.every((id) => vm.getVessel(id)?.systemId === 'sys_home') && flips.every((f) => f === false),
    `T7: _reconcileSystemId (jak w _updatePositions) zostawia sys_home (zmiany: ${flips.join(', ')})`);
}

// ── T8 — obrona gracza po wczytaniu ────────────────────────────────────────────────────────────
console.log('\nT8 — obrona gracza: WarSystem._playerVesselsInSystem');
{
  const vm = restoreFixture();
  const count = (sys) => WarSystem.prototype._playerVesselsInSystem.call({}, sys).map((v) => v.id);
  const home = count('sys_home'), far = count('sys_060');
  assert(CHIMERAS.every((id) => home.includes(id)) && CHIMERAS.every((id) => !far.includes(id)),
    `T8: sys_home liczy v_21–v_23 (${home.join(', ') || 'brak'}); sys_060 — ${far.join(', ') || 'nic'}`);
  void vm;
}

console.log(`\n[sb1_dock_heal_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
