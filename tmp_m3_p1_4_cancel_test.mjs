// ── M3 P1.4 — Smoke tests dla cancel order dispatch ───────────────────
// Pure logic only — testuje tryCancelVesselOrder z mockami deps.
// Cumulative target: 191 (M3 prev) + 12 (P1.4) = 203/203 GREEN.
//
// Uruchomienie: node tmp_m3_p1_4_cancel_test.mjs

import { tryCancelVesselOrder } from './src/utils/MovementOrderCancellation.js';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}
function group(name) { console.log(`\n── ${name} ──`); }

// ── helper: mock factory ─────────────────────────────────────────────
function makeMocks({ vessel = null, mosReturn = true, includeMos = true, includeLog = true } = {}) {
  const calls = { cancel: [], push: [] };
  const mos = includeMos ? {
    cancelOrder(id, reason) {
      calls.cancel.push({ id, reason });
      return mosReturn;
    },
  } : null;
  const vesselManager = {
    getVessel(id) { return vessel?.id === id ? vessel : null; },
  };
  const eventLogSystem = includeLog ? {
    push(payload) { calls.push.push(payload); },
  } : null;
  const t = (key, ...args) => `${key}|${args.join(',')}`;
  return { deps: { mos, vesselManager, eventLogSystem, t }, calls };
}

// ──────────────────────────────────────────────────────────────────────
// T1 — happy path
// ──────────────────────────────────────────────────────────────────────
group('T1 — happy path');

// T1.1 active order → MOS.cancelOrder called z (id, 'player')
{
  const vessel = { id: 'v_1', name: 'Alfa', movementOrder: { type: 'moveToPoint', status: 'active' } };
  const { deps, calls } = makeMocks({ vessel });
  const r = tryCancelVesselOrder(deps, 'v_1');
  ok(r.ok === true, 'T1.1a ok=true');
  ok(calls.cancel.length === 1, 'T1.1b cancelOrder called once');
  ok(calls.cancel[0].id === 'v_1' && calls.cancel[0].reason === 'player', 'T1.1c args (id, "player")');
}

// T1.2 EventLog push wykonany z proper payload shape (L24 — objectContaining)
{
  const vessel = { id: 'v_2', name: 'Beta', movementOrder: { type: 'patrol', status: 'active' } };
  const { deps, calls } = makeMocks({ vessel });
  tryCancelVesselOrder(deps, 'v_2');
  ok(calls.push.length === 1, 'T1.2a push called once');
  const p = calls.push[0];
  ok(typeof p.text === 'string' && p.text.includes('Beta') && p.text.includes('patrol'), 'T1.2b text contains name+type');
  ok(p.channel === 'fleet', 'T1.2c channel=fleet (V5)');
  ok(p.severity === 'info', 'T1.2d severity=info');
  ok(p.entityRef === 'v_2', 'T1.2e entityRef=vesselId');
}

// ──────────────────────────────────────────────────────────────────────
// T2 — odrzucenia (no_mos / no_vessel / no_order / mos_rejected)
// ──────────────────────────────────────────────────────────────────────
group('T2 — odrzucenia');

// T2.1 brak MOS → no_mos, NO push
{
  const { deps, calls } = makeMocks({ includeMos: false });
  const r = tryCancelVesselOrder(deps, 'v_1');
  ok(r.ok === false && r.reason === 'no_mos', 'T2.1a reason=no_mos');
  ok(calls.push.length === 0, 'T2.1b NO eventLog push');
}

// T2.2 vessel not found → no_vessel
{
  const { deps, calls } = makeMocks({ vessel: null });
  const r = tryCancelVesselOrder(deps, 'v_missing');
  ok(r.ok === false && r.reason === 'no_vessel', 'T2.2a reason=no_vessel');
  ok(calls.cancel.length === 0, 'T2.2b NO MOS call');
  ok(calls.push.length === 0, 'T2.2c NO eventLog push');
}

// T2.3 vessel bez orderu → no_order
{
  const vessel = { id: 'v_3', name: 'Gamma', movementOrder: null };
  const { deps, calls } = makeMocks({ vessel });
  const r = tryCancelVesselOrder(deps, 'v_3');
  ok(r.ok === false && r.reason === 'no_order', 'T2.3a reason=no_order');
  ok(calls.cancel.length === 0, 'T2.3b NO MOS call');
  ok(calls.push.length === 0, 'T2.3c NO eventLog push');
}

// T2.4 MOS odrzuca (np. order.status='blocked' lub 'completed') → mos_rejected
{
  const vessel = { id: 'v_4', name: 'Delta', movementOrder: { type: 'pursue', status: 'blocked', blockReason: 'target_lost' } };
  const { deps, calls } = makeMocks({ vessel, mosReturn: false });
  const r = tryCancelVesselOrder(deps, 'v_4');
  ok(r.ok === false && r.reason === 'mos_rejected', 'T2.4a reason=mos_rejected');
  ok(calls.cancel.length === 1, 'T2.4b MOS called (gave it chance)');
  ok(calls.push.length === 0, 'T2.4c NO eventLog push');
}

// ──────────────────────────────────────────────────────────────────────
// T3 — defensive: brak eventLogSystem nie crashuje
// ──────────────────────────────────────────────────────────────────────
group('T3 — defensive');

// T3.1 brak eventLogSystem → ok=true, no crash
{
  const vessel = { id: 'v_5', name: 'Epsilon', movementOrder: { type: 'intercept', status: 'active' } };
  const { deps } = makeMocks({ vessel, includeLog: false });
  let crashed = false;
  let r;
  try { r = tryCancelVesselOrder(deps, 'v_5'); } catch (e) { crashed = true; }
  ok(!crashed, 'T3.1a no crash bez eventLogSystem');
  ok(r?.ok === true, 'T3.1b ok=true mimo brak loga');
}

// T3.2 brak deps całkowicie → no_mos, no crash
{
  let crashed = false;
  let r;
  try { r = tryCancelVesselOrder(undefined, 'v_x'); } catch (e) { crashed = true; }
  ok(!crashed, 'T3.2a no crash bez deps');
  ok(r?.ok === false && r?.reason === 'no_mos', 'T3.2b reason=no_mos');
}

// T3.3 vessel bez .name → push używa fallback '?' (defensive)
{
  const vessel = { id: 'v_6', movementOrder: { type: 'escort', status: 'active' } };
  const { deps, calls } = makeMocks({ vessel });
  const r = tryCancelVesselOrder(deps, 'v_6');
  ok(r.ok === true, 'T3.3a ok=true bez .name');
  ok(calls.push.length === 1 && typeof calls.push[0].text === 'string', 'T3.3b push wykonany');
}

// ──────────────────────────────────────────────────────────────────────
console.log(`\n══ M3 P1.4 ══  PASS=${pass}  FAIL=${fail}`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
