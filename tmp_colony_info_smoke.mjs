// tmp_colony_info_smoke.mjs — ColonyOverlay split 70/30 + panel info.
// Uruchom: node tmp_colony_info_smoke.mjs
// UWAGA: ColonyOverlay NIE jest importowalny w node (PlanetTextureUtils → bare
// import 'three'), więc formuły testujemy repliką spec, a żywe metody = live-gate.
// T1 _infoW clamp (spec) | T2 mapW dodatni | T3 _buildingSummary spec |
// T4 composition top-6 | T5 atmosphere key + deposit dots | T6 i18n PL/EN |
// T7 Resources/Elements name lookup dla panelu.

import './src/testing/headless/env.js';   // shim (MUST be first)

const { t, setLocale } = await import('./src/i18n/i18n.js');
const { ALL_RESOURCES } = await import('./src/data/ResourcesData.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}

// Replika _infoW (musi być identyczna z ColonyOverlay._infoW)
const INFO_FRAC = 0.30, INFO_MIN = 300, INFO_MAX = 460;
const infoW = (ow) =>
  Math.round(Math.min(Math.floor(ow * 0.5), Math.max(INFO_MIN, Math.min(INFO_MAX, ow * INFO_FRAC))));

// Replika _buildingSummary
const buildingSummary = (colony) => {
  const out = {};
  if (colony?.buildingSystem?._active) {
    for (const [key, entry] of colony.buildingSystem._active) {
      if (key.startsWith('capital_')) continue;
      const bid = entry.building?.id; if (!bid) continue;
      out[bid] = (out[bid] ?? 0) + 1;
    }
  }
  return out;
};

// ── T1: _infoW clamp ──────────────────────────────────────────────────────
console.log('--- T1: _infoW clamp (30% z limitem 300..460, max połowa) ---');
assert(infoW(1280) === 384, `T1a: 1280 → 384 (0.30×1280) [got ${infoW(1280)}]`);
assert(infoW(2560) === 460, `T1b: 2560 ultrawide → 460 (cap MAX) [got ${infoW(2560)}]`);
assert(infoW(900)  === 300, `T1c: 900 → 300 (0.30×900=270 < MIN) [got ${infoW(900)}]`);
assert(infoW(500)  === 250, `T1d: 500 wąski → 250 (cap połowa) [got ${infoW(500)}]`);

// ── T2: mapW dodatni i ≥50% ───────────────────────────────────────────────
console.log('--- T2: mapW = ow - infoW ---');
for (const ow of [500, 900, 1280, 1920, 2560]) {
  const mapW = ow - infoW(ow);
  assert(mapW > 0 && mapW >= ow * 0.5, `T2: ow=${ow} → mapW=${mapW} (>0, ≥50%)`);
}

// ── T3: _buildingSummary skip capital_ + count ────────────────────────────
console.log('--- T3: _buildingSummary spec ---');
{
  const active = new Map([
    ['capital_0,0', { building: { id: 'capital' } }],
    ['5,5', { building: { id: 'solar_plant' } }],
    ['6,6', { building: { id: 'solar_plant' } }],
    ['7,7', { building: { id: 'mine' } }],
  ]);
  const sum = buildingSummary({ buildingSystem: { _active: active } });
  assert(sum.capital === undefined, 'T3a: capital_ pominięty');
  assert(sum.solar_plant === 2, `T3b: solar_plant ×2 [${sum.solar_plant}]`);
  assert(sum.mine === 1, `T3c: mine ×1 [${sum.mine}]`);
  assert(Object.keys(buildingSummary({})).length === 0, 'T3d: brak buildingSystem → {}');
}

// ── T5: atmosphere key + deposit dots ─────────────────────────────────────
console.log('--- T5: atmosfera + dots ---');
{
  for (const a of ['none', 'thin', 'breathable', 'dense', 'thick']) {
    const key = `colonyInfo.atm.${a}`;
    assert(t(key) !== key, `T5a: atm.${a} ma tłumaczenie (${t(key)})`);
  }
  const dotsOf = (r) => Math.max(0, Math.min(4, Math.round((r ?? 0) * 4)));
  assert(dotsOf(1.0) === 4 && dotsOf(0.1) === 0 && dotsOf(0.5) === 2 && dotsOf(0.75) === 3,
    'T5b: richness→dots clamp 0..4');
}

// ── T6: i18n PL/EN parity dla colonyInfo.* ────────────────────────────────
console.log('--- T6: i18n colonyInfo.* PL/EN ---');
{
  const keys = ['colonyInfo.physics', 'colonyInfo.temperature', 'colonyInfo.mass',
    'colonyInfo.gravity', 'colonyInfo.radius', 'colonyInfo.atmosphere',
    'colonyInfo.elements', 'colonyInfo.resources', 'colonyInfo.buildings',
    'colonyInfo.noResources', 'colonyInfo.noBuildings', 'colonyInfo.massUnit', 'colonyInfo.radiusUnit'];
  setLocale('pl'); const plOk = keys.every(k => t(k) !== k);
  setLocale('en'); const enOk = keys.every(k => t(k) !== k);
  setLocale('pl');
  assert(plOk, 'T6a: wszystkie klucze PL obecne');
  assert(enOk, 'T6b: wszystkie klucze EN obecne');
}

// ── T7: name lookup dla surowców (panel używa ALL_RESOURCES) ──────────────
console.log('--- T7: ALL_RESOURCES lookup ---');
{
  assert(ALL_RESOURCES.Fe?.namePL === 'Żelazo', `T7a: ALL_RESOURCES.Fe.namePL [${ALL_RESOURCES.Fe?.namePL}]`);
  assert(typeof ALL_RESOURCES.Fe?.icon === 'string', 'T7b: ALL_RESOURCES ma icon');
}

console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` — ${fail} FAIL` : ''));
process.exit(fail ? 1 : 0);
