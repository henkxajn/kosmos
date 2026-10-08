// AI STRIKES BACK S1 (domknięcie) — keeper B7 (SB28): tabela strojenia nie przyjmuje pary „wzorzec bez szablonu z bakiem
// warp” ↔ „minimum kadłubów z bakiem > 0” — w żadnej kolejności zmian. Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB28).
//
//   V1  wzorzec bez baku przy minimum 2 (domyślne) — odmowa `pattern_without_warp`, odmowa nazywa NAJPIERW
//       `fleetMinWarpHulls` (zejście do 0); stan bez zmian (także przy innej wartości zmienionej obok)
//   V2  odwrotna kolejność: minimum 0 → wzorzec bez baku (przyjęte) → minimum 2 — odmowa `min_warp_without_tank`, odmowa
//       nazywa NAJPIERW `fleetPoolPattern` i szablony z bakiem; stan bez zmian
//   V3  reset minimum do domyślnej (2) przy wzorcu bez baku — odmowa jak V2, stan bez zmian; reset wzorca — przyjęty,
//       potem reset minimum — przyjęty (KONTROLA nie-jałowości)
//   V4  KONTROLA: wzorzec z szablonem z bakiem przy minimum 2 — przyjęty; minimum 3 przy takim wzorcu — przyjęte;
//       odmowy klucza (nieznany szablon) mają pierwszeństwo przed odmową pary
//   V5  test „z bakiem” = ten sam co plan puli (`templateTraits`): szablony z bakiem wśród uzbrojonych = L, E (nie D)
//   V6  konsola (`sbSet` / `sbReset`): ostrzeżenie z linią odmowy, zwrot obiektu odmowy, stan bez zmian
//
// ⚠ Fail-first: na drzewie sprzed SB28 czerwone piny odmów (V1, V2, V3, V6); zielone po obu stronach — KONTROLE (V4, V5).

import '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import * as TUN from '../../utils/StrikesBackTuning.js';
import { armedTemplateIds, templateTraits } from '../../utils/FleetPoolPlanner.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const D = 'frigate_system_defender', E = 'frigate_missile_escort', L = 'frigate_laser_escort';
const stateOf = () => JSON.stringify(gameState.get(TUN.SB_TUNING_STATE_KEY) ?? null);
const line = (r) => (r && r.ok === false ? TUN.describeRefusal(r) : '');
const fresh = () => { gameState.restore(null); TUN.resetTuning(); };

// ── V1 — wzorzec bez baku przy minimum > 0 ─────────────────────────────────────────────────────
console.log('\nV1 — wzorzec bez szablonu z bakiem przy minimum 2 — odmowa');
{
  fresh();
  TUN.setTuning('fleetPopPerHull', 40);                          // stan niedomyślny obok — odmowa ma czego NIE zmienić
  const before = stateOf();
  const r = TUN.setTuning('fleetPoolPattern', [D]);
  assert(r?.ok === false && r.reason === 'pattern_without_warp' && r.changeFirst === 'fleetMinWarpHulls' && r.minWarp === 2,
    `V1a: sbSet(fleetPoolPattern, [D]) przy minimum 2 → odmowa pattern_without_warp, najpierw fleetMinWarpHulls (${JSON.stringify({ ok: r?.ok, reason: r?.reason, first: r?.changeFirst })})`);
  const msg = line(r);
  assert(msg.includes("Najpierw: sbSet('fleetMinWarpHulls', 0)") && msg.includes(L) && msg.includes(E) && msg.indexOf('fleetMinWarpHulls') < msg.indexOf('Szablony'),
    `V1b: linia odmowy nazywa NAJPIERW fleetMinWarpHulls → 0 i szablony z bakiem („${msg.slice(0, 130)}”)`);
  assert(stateOf() === before && same(TUN.getTuning('fleetPoolPattern'), [D, E, E, E]) && TUN.getTuning('fleetPopPerHull') === 40,
    'V1c: odmowa niczego nie zmienia — wzorzec domyślny, wartość obok (fleetPopPerHull 40) zostaje');
}

// ── V2 — odwrotna kolejność ────────────────────────────────────────────────────────────────────
console.log('\nV2 — odwrotna kolejność: minimum 0, wzorzec bez baku, minimum 2 — odmowa');
{
  fresh();
  const a = TUN.setTuning('fleetMinWarpHulls', 0);
  const b = TUN.setTuning('fleetPoolPattern', [D]);
  const before = stateOf();
  const r = TUN.setTuning('fleetMinWarpHulls', 2);
  assert(a?.ok === true && b?.ok === true && r?.ok === false && r.reason === 'min_warp_without_tank' && r.changeFirst === 'fleetPoolPattern'
    && same(r.pattern, [D]) && same(r.warpTemplates, [L, E]),
    `V2a: minimum 0 i wzorzec [D] przyjęte; minimum 2 → odmowa min_warp_without_tank, najpierw fleetPoolPattern (${JSON.stringify({ reason: r?.reason, first: r?.changeFirst, tank: r?.warpTemplates })})`);
  const msg = line(r);
  assert(msg.includes("Najpierw: sbSet('fleetPoolPattern'") && msg.includes(`[${D}]`) && msg.includes(L) && msg.includes(E),
    `V2b: linia odmowy nazywa NAJPIERW fleetPoolPattern, obecny wzorzec i szablony z bakiem („${msg.slice(0, 140)}”)`);
  assert(stateOf() === before && TUN.getTuning('fleetMinWarpHulls') === 0 && same(TUN.getTuning('fleetPoolPattern'), [D]),
    'V2c: odmowa niczego nie zmienia — minimum 0 i wzorzec [D] zostają');
  const r1 = TUN.setTuning('fleetMinWarpHulls', 1);
  assert(r1?.ok === false && r1.reason === 'min_warp_without_tank' && TUN.getTuning('fleetMinWarpHulls') === 0,
    'V2d: każde minimum > 0 przy wzorcu bez baku — odmowa (1), stan bez zmian');
}

// ── V3 — reset ─────────────────────────────────────────────────────────────────────────────────
console.log('\nV3 — reset minimum przy wzorcu bez baku');
{
  fresh();
  TUN.setTuning('fleetMinWarpHulls', 0);
  TUN.setTuning('fleetPoolPattern', [D]);
  const before = stateOf();
  const r = TUN.resetTuning('fleetMinWarpHulls');
  assert(r?.ok === false && r.reason === 'min_warp_without_tank' && r.changeFirst === 'fleetPoolPattern' && r.minWarp === 2 && stateOf() === before,
    `V3a: sbReset(fleetMinWarpHulls) → domyślne 2 przy wzorcu [D] — odmowa, najpierw fleetPoolPattern; stan bez zmian (${r?.reason})`);
  const rp = TUN.resetTuning('fleetPoolPattern');
  const rm = TUN.resetTuning('fleetMinWarpHulls');
  assert(rp?.ok === true && rm?.ok === true && same(TUN.getTuning('fleetPoolPattern'), [D, E, E, E]) && TUN.getTuning('fleetMinWarpHulls') === 2,
    'V3b (KONTROLA nie-jałowości): reset wzorca (domyślny ma bak) — przyjęty; potem reset minimum — przyjęty');
  TUN.setTuning('fleetMinWarpHulls', 0);
  TUN.setTuning('fleetPoolPattern', [D]);
  const all = TUN.resetTuning();
  assert(all?.ok === true && stateOf() === '{}',
    'V3c (KONTROLA): reset całej tabeli przy wzorcu [D] i minimum 0 — przyjęty (wartości domyślne są spójne)');
}

// ── V4 — kontrole ──────────────────────────────────────────────────────────────────────────────
console.log('\nV4 — KONTROLE: wzorzec z bakiem, minimum wyższe, kolejność odmów');
{
  fresh();
  const a = TUN.setTuning('fleetPoolPattern', [L, D]);
  const b = TUN.setTuning('fleetMinWarpHulls', 3);
  const c = TUN.setTuning('fleetPoolPattern', [D, D, E]);
  assert(a?.ok === true && b?.ok === true && c?.ok === true && same(TUN.getTuning('fleetPoolPattern'), [D, D, E]) && TUN.getTuning('fleetMinWarpHulls') === 3,
    'V4a (KONTROLA): wzorzec z szablonem z bakiem przy minimum 2 i 3 — przyjęte');
  const before = stateOf();
  const u = TUN.setTuning('fleetPoolPattern', ['bogus']);
  const s = TUN.setTuning('fleetPoolPattern', [D, 'science_probe']);
  assert(u?.reason === 'unknown_template' && s?.reason === 'unknown_template' && stateOf() === before,
    `V4b (KONTROLA): odmowa klucza ma pierwszeństwo przed odmową pary (${u?.reason}, ${s?.reason}); stan bez zmian`);
}

// ── V5 — ten sam test „z bakiem” co plan puli ──────────────────────────────────────────────────
console.log('\nV5 — test „z bakiem” = plan puli');
{
  const armed = armedTemplateIds();
  const tank = armed.filter((id) => templateTraits(id).warp);
  assert(same(armed, [L, E, D]) && same(tank, [L, E]),
    `V5 (KONTROLA): uzbrojone ${JSON.stringify(armed)}; z bakiem ${JSON.stringify(tank)} — D bez baku`);
}

// ── V6 — konsola ───────────────────────────────────────────────────────────────────────────────
console.log('\nV6 — konsola sbSet / sbReset');
{
  fresh();
  const warns = [];
  const w = console.warn, l = console.log;
  console.warn = (m) => warns.push(String(m)); console.log = () => {};
  let r1, r2;
  try {
    r1 = TUN.consoleSetTuning('fleetPoolPattern', [D]);
    TUN.consoleSetTuning('fleetMinWarpHulls', 0);
    TUN.consoleSetTuning('fleetPoolPattern', [D]);
    r2 = TUN.consoleResetTuning('fleetMinWarpHulls');
  } finally { console.warn = w; console.log = l; }
  assert(r1?.ok === false && r1.reason === 'pattern_without_warp' && r2?.ok === false && r2.reason === 'min_warp_without_tank'
    && warns.length === 2 && warns[0] === TUN.describeRefusal(r1) && warns[1] === TUN.describeRefusal(r2)
    && TUN.getTuning('fleetMinWarpHulls') === 0 && same(TUN.getTuning('fleetPoolPattern'), [D]),
    `V6: sbSet i sbReset — ostrzeżenia z linią odmowy (${warns.length}), zwrot obiektu odmowy, stan po odmowach bez zmian`);
  TUN.resetTuning();
}

console.log(`\n[sb1_tuning_warp_pair_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
