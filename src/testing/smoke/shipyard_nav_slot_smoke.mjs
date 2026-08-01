// Smoke: nav-slot invariant po C8 (Stocznia zajęła strukturalny slot po Populacji z C7).
//
// §3.5 (AUDIT_COLONY_OVERLAY.md) — zestaw slotów nav MUSI być NIEZALEŻNY od
// FEATURES.populationOverlay: OBA stany flagi = 7 slotów, 'shipyard' obecny,
// 'population' NIEOBECNY. Test flag-ON (populationOverlay:true) łapie regresję
// „ktoś znów dodał warunkową populację do NAV_GROUPS" → 8 slotów — której test
// tylko-flag-OFF by NIE złapał (to była dokładnie pułapka clock-band z C7).
//
// Uruchom: node src/testing/smoke/shipyard_nav_slot_smoke.mjs

// i18n.js czyta localStorage przy module-load → mock PRZED (dynamicznym) importem.
globalThis.localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null; }, setItem(k, v){ this._s[k] = String(v); }, removeItem(k){ delete this._s[k]; } };
globalThis.window = globalThis;
if (!globalThis.KOSMOS) globalThis.KOSMOS = {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL:', m); } };

const { buildNavGroups, NAV_GROUPS } = await import('../../ui/CivPanelDrawer.js');

// ── T1-T3: buildNavGroups niezależne od flagi (oba stany = 7 / shipyard-in / population-out) ──
for (const flag of [true, false]) {
  const g = buildNavGroups({ populationOverlay: flag });
  const primaries = g.map(x => x.primary);
  ok(g.length === 7, `T1[pop=${flag}]: 7 slotów (jest ${g.length})`);
  ok(primaries.includes('shipyard'), `T2[pop=${flag}]: 'shipyard' obecny`);
  ok(!primaries.includes('population'), `T3[pop=${flag}]: 'population' NIEOBECNY (slot retired)`);
}

// ── T4: żywy eksport const = obraz konfiguracji (flag-OFF default) ──
const cp = NAV_GROUPS.map(x => x.primary);
ok(NAV_GROUPS.length === 7, `T4: NAV_GROUPS.length === 7 (jest ${NAV_GROUPS.length})`);
ok(cp.includes('shipyard'), `T4: NAV_GROUPS ma 'shipyard'`);
ok(!cp.includes('population'), `T4: NAV_GROUPS bez 'population'`);

// ── T5: shipyard NA POZYCJI po Populacji (między colony a diplomacy) ──
const si = cp.indexOf('shipyard');
ok(cp[si - 1] === 'colony' && cp[si + 1] === 'diplomacy',
  `T5: 'shipyard' między colony a diplomacy (jest ${cp[si - 1]},${cp[si]},${cp[si + 1]})`);

// ── T6: 'shipyard' jest członkiem swojej grupy (primary ∈ members) ──
const syG = NAV_GROUPS.find(g => g.primary === 'shipyard');
ok(syG?.members?.includes('shipyard'), `T6: grupa 'shipyard' zawiera 'shipyard' w members`);

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
