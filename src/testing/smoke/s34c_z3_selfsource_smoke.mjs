// S3.4c Z3 — smoke: wykluczenia celów transportu (self-cargo D8 + cel==źródło Z3).
// Uruchom: node src/testing/smoke/s34c_z3_selfsource_smoke.mjs
// Modeluje filtr FleetManagerOverlay._getValidTargets (dwie reguły): (1) cel==źródło (kolonia→ta sama
// kolonia) wykluczony dla transport I transport_passenger; (2) stacja z matką wykluczona z transport
// cargo (D8), ale ZOSTAJE dla transport_passenger; sierota legalna dla cargo.

globalThis.window = globalThis.window ?? { KOSMOS: {} };
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const { Station } = await import('../../entities/Station.js');
const { resolveHomeColony } = await import('../../utils/TransferStore.js');

// Fake środowisko
const colonies = new Map();
const setColony = (planetId, systemId = 'sys_home') => {
  const c = { planetId, systemId, ownerEmpireId: null, resourceSystem: { inventory: new Map(), receive() {}, spend() { return true; }, getAmount: () => 0 } };
  colonies.set(planetId, c); return c;
};
window.KOSMOS.colonyManager = {
  getColony: (id) => colonies.get(id) ?? null,
  hasColony: (id) => colonies.has(id),
  getColoniesInSystem: (s) => [...colonies.values()].filter(c => c.systemId === s),
};

// Model filtra _getValidTargets (dwie reguły). Zwraca zbiór id celów.
function validTransportTargets(actionId, sourceColonyId, bodies, stations, vesselDockedAt) {
  const out = new Set();
  // Pętla ciał (kolonie/outposty)
  for (const b of bodies) {
    if (!colonies.has(b.id)) continue;
    if (sourceColonyId && b.id === sourceColonyId) continue;   // Z3: cel==źródło
    out.add(b.id);
  }
  // Blok stacji gracza
  if (actionId === 'transport' || actionId === 'transport_passenger') {
    for (const st of stations) {
      if ((st.ownerEmpireId ?? 'player') !== 'player') continue;
      if (st.id === vesselDockedAt) continue;
      if (actionId === 'transport' && resolveHomeColony(st) !== null) continue;   // D8: self-cargo (matka)
      out.add(st.id);
    }
  }
  return out;
}

// Setup: źródło = planet_home; drugie ciało planet_b; stacja z matką + sierota.
colonies.clear();
setColony('planet_home');
setColony('planet_b');
const bodies = [{ id: 'planet_home' }, { id: 'planet_b' }];
const stMother = new Station({ id: 'st_m', bodyId: 'planet_home', ownerColonyId: 'planet_home', systemId: 'sys_home' });
const stOrphan = new Station({ id: 'st_o', bodyId: 'asteroid_x', systemId: 'sys_deep' });
const stations = [stMother, stOrphan];
const SOURCE = 'planet_home';

// ══ 1. transport (cargo) ════════════════════════════════════════════════════════════════════════════
const cargo = validTransportTargets('transport', SOURCE, bodies, stations, null);
T('1.1 cel==źródło (planet_home) WYKLUCZONY z cargo', !cargo.has('planet_home'));
T('1.2 inna kolonia (planet_b) DOZWOLONA', cargo.has('planet_b'));
T('1.3 stacja z matką WYKLUCZONA z cargo (D8)', !cargo.has('st_m'));
T('1.4 sierota DOZWOLONA jako cel cargo', cargo.has('st_o'));

// ══ 2. transport_passenger (POP) ════════════════════════════════════════════════════════════════════
const pax = validTransportTargets('transport_passenger', SOURCE, bodies, stations, null);
T('2.1 cel==źródło (planet_home) WYKLUCZONY z pasażerów', !pax.has('planet_home'));
T('2.2 inna kolonia (planet_b) DOZWOLONA', pax.has('planet_b'));
T('2.3 stacja z matką ZOSTAJE dla pasażerów (POP → habitat)', pax.has('st_m'));
T('2.4 sierota też dozwolona dla pasażerów', pax.has('st_o'));

// ══ 3. Bez źródła (drift/brak dockedAt) — nic nie wyklucza się po źródle ═════════════════════════════
const noSrc = validTransportTargets('transport', null, bodies, stations, null);
T('3.1 brak źródła → planet_home NIE wykluczony po źródle (ale i tak dozwolony jako inna kolonia)', noSrc.has('planet_home'));

console.log(`\nS3.4c Z3 (self-cargo + cel==źródło) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
