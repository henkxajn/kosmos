// AI STRIKES BACK S2 — keeper B1 (SB36, Finding 414): przylot statku, który NIE jest statkiem gracza, nie podnosi wywiadu
// gracza o imperium. Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (414).
//
//   I1  kadłub AI (pula, `createAIVessel`) leci rozkazem `moveToPoint` do planety we WŁASNYM układzie i przylatuje —
//       wywiad gracza o tym imperium zostaje `unknown` (przed poprawką: `contact`); świadek: `vessel:arrived` z misją dla
//       tego kadłuba, a miejsce przylotu należy do układu imperium (`_findEmpireOfSystem`)
//   I2  KONTROLA: statek GRACZA przylatuje do planety w tym samym układzie — wywiad `unknown → contact` (bez zmian)
//   I3  KONTROLA: kadłub AI schodzi z doku na orbitę (`undockToOrbit`, misja `null`) — wywiad bez zmian (po obu stronach)
//   I4  pin źródłowy: `_onVesselArrived` pyta o właściciela statku predykatem obserwacji (`_isPlayerVessel`), PRZED
//       rozwiązaniem układu
//
// ⚠ Świat: `bootWithDirector` + `MovementOrderSystem` (headless go nie montuje — wzór sondy audytu S2, Q3).
// ⚠ Fail-first: na drzewie sprzed poprawki (`dab5e2a`) czerwone wyłącznie I1 i I4; KONTROLE zielone po obu stronach.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { createVessel } from '../../entities/Vessel.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const read = (r) => readFileSync(path.join(SRC, r), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

const E = 'frigate_missile_escort';
const levelOf = (emp) => gameState.get(`intel.${emp}`)?.level ?? 'unknown';

/** Świat: imperium, stolica, druga planeta układu stolicy (najbliższa), MOS, dziennik przylotów. */
function world() {
  const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  const emp = K.empireRegistry.listIds()[0];
  const C = EntityManager.get(K.directorProduction.capitalOf(emp)?.planetId);
  const other = (EntityManager.getByTypeInSystem('planet', C.systemId) ?? []).filter((b) => b.id !== C.id)
    .sort((a, b) => Math.hypot(a.x - C.x, a.y - C.y) - Math.hypot(b.x - C.x, b.y - C.y))[0];
  const arrivals = [];
  EventBus.on('vessel:arrived', ({ vessel, mission }) => arrivals.push({ id: vessel?.id, withMission: !!mission }));
  return { core, K, ticker, vm: core.vesselManager, emp, C, other, arrivals };
}
const fly = (w, v, body) => w.K.movementOrderSystem.issueOrder(v.id, { type: 'moveToPoint', targetBodyId: body.id,
  targetPoint: { x: body.x, y: body.y }, issuedBy: 'keeper', bypassFuelCheck: true });
const arrivedAt = (v, body) => v.position?.state === 'orbiting' && v.position?.dockedAt === body.id && !v.movementOrder;
const runUntil = (w, pred, months = 48) => { for (let i = 0; i < months; i++) { quiet(() => w.ticker.run(1, { tickSize: 1.0 })); if (pred()) return i + 1; } return null; };

// ── I1 — przylot kadłuba AI we własnym układzie ──────────────────────────────────────────────────
console.log('\nI1 — przylot kadłuba AI do planety we własnym układzie nie podnosi wywiadu gracza');
{
  const w = world();
  const before = levelOf(w.emp);
  const v = quiet(() => w.vm.createAIVessel({ templateId: E, empireId: w.emp, planetId: w.C.id, origin: 'pool' }))?.vessel;
  const order = v ? fly(w, v, w.other) : null;
  const months = v ? runUntil(w, () => arrivedAt(v, w.other)) : null;
  const witness = w.arrivals.some((a) => a.id === v?.id && a.withMission);
  const mapped = w.K.intelSystem._findEmpireOfSystem?.(w.other.systemId) === w.emp;
  assert(order?.ok === true && months !== null && witness && mapped && before === 'unknown' && levelOf(w.emp) === 'unknown',
    `I1: ${v?.id} przyleciał do ${w.other?.id} po ${months} mies. (vessel:arrived z misją: ${witness}, układ imperium: ${mapped}) — wywiad ${before} → ${levelOf(w.emp)}`);
}

// ── I2 — KONTROLA: przylot statku gracza ─────────────────────────────────────────────────────────
console.log('\nI2 — KONTROLA: przylot statku GRACZA podnosi wywiad (bez zmian)');
{
  const w = world();
  const before = levelOf(w.emp);
  const p = createVessel('hull_small', w.K.homePlanet.id, { name: 'Zwiad', modules: ['engine_ion'], systemId: w.C.systemId, x: w.C.x, y: w.C.y });
  p.position.state = 'orbiting'; p.position.dockedAt = w.C.id;
  w.vm._vessels.set(p.id, p);
  quiet(() => EventBus.emit('vessel:created', { vessel: p }));
  const order = fly(w, p, w.other);
  const months = runUntil(w, () => arrivedAt(p, w.other));
  const witness = w.arrivals.some((a) => a.id === p.id && a.withMission);
  assert(order?.ok === true && months !== null && witness && before === 'unknown' && levelOf(w.emp) === 'contact',
    `I2 (KONTROLA): statek gracza ${p.id} przyleciał po ${months} mies. — wywiad ${before} → ${levelOf(w.emp)}`);
}

// ── I3 — KONTROLA: zejście z doku na orbitę ──────────────────────────────────────────────────────
console.log('\nI3 — KONTROLA: undockToOrbit kadłuba AI (misja null) nie rusza wywiadu');
{
  const w = world();
  const v = quiet(() => w.vm.createAIVessel({ templateId: E, empireId: w.emp, planetId: w.C.id, origin: 'pool' }))?.vessel;
  const ok = v ? w.vm.undockToOrbit(v.id) : false;
  const ev = w.arrivals.find((a) => a.id === v?.id);
  assert(ok === true && ev && ev.withMission === false && v.position.state === 'orbiting' && levelOf(w.emp) === 'unknown',
    `I3 (KONTROLA): undock ${v?.id} — vessel:arrived bez misji, orbita, wywiad ${levelOf(w.emp)}`);
}

// ── I4 — pin źródłowy ────────────────────────────────────────────────────────────────────────────
console.log('\nI4 — pin źródłowy: bramka właściciela w `_onVesselArrived`');
{
  const src = stripComments(read('systems/IntelSystem.js'));
  const i = src.indexOf('_onVesselArrived(vessel, mission) {');
  const body = i >= 0 ? src.slice(i, src.indexOf('\n  }', i)) : '';
  const gate = body.search(/if\s*\(\s*!this\._isPlayerVessel\(vessel\)\s*\)\s*return\s*;/);
  const resolve = body.indexOf('_resolveSystemIdFromMission(');
  assert(body.length > 0 && gate >= 0 && resolve > gate,
    `I4: _onVesselArrived — bramka _isPlayerVessel(vessel) przed rozwiązaniem układu (bramka @${gate}, układ @${resolve})`);
  assert(/_isPlayerVessel\(v\)\s*\{\s*return\s*!!v\s*&&\s*!isEnemyVessel\(v\)\s*;/.test(src),
    'I4b (KONTROLA): predykat obserwacji = `!!v && !isEnemyVessel(v)` (ten sam, którego używa bramka)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
