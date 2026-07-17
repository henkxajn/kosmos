// S3.4c Z3 — smoke: wykluczenia celów transportu (cel==źródło Z3; filtr stacji D8 ZNIESIONY).
// Uruchom: node src/testing/smoke/s34c_z3_selfsource_smoke.mjs
// Modeluje filtr FleetManagerOverlay._getValidTargets: (1) cel==źródło (kolonia→ta sama kolonia)
// wykluczony dla transport I transport_passenger; (2) KAŻDA stacja gracza jest celem cargo I pasażerów
// (D8 zniesiony — stacja = tańszy paliwowo skład niż start z planety); wyklucza się tylko stacje AI.

globalThis.window = globalThis.window ?? { KOSMOS: {} };
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const { Station } = await import('../../entities/Station.js');

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
  // Blok stacji gracza (D8 zniesiony — każda stacja gracza jest celem, także z matką)
  if (actionId === 'transport' || actionId === 'transport_passenger') {
    for (const st of stations) {
      if ((st.ownerEmpireId ?? 'player') !== 'player') continue;
      if (st.id === vesselDockedAt) continue;
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
const stAI = new Station({ id: 'st_ai', bodyId: 'planet_home', ownerEmpireId: 'ai_1', systemId: 'sys_home' });
const stations = [stMother, stOrphan, stAI];
const SOURCE = 'planet_home';

// ══ 1. transport (cargo) ════════════════════════════════════════════════════════════════════════════
const cargo = validTransportTargets('transport', SOURCE, bodies, stations, null);
T('1.1 cel==źródło (planet_home) WYKLUCZONY z cargo', !cargo.has('planet_home'));
T('1.2 inna kolonia (planet_b) DOZWOLONA', cargo.has('planet_b'));
T('1.3 stacja z matką DOZWOLONA jako cel cargo (D8 zniesiony)', cargo.has('st_m'));
T('1.4 sierota DOZWOLONA jako cel cargo', cargo.has('st_o'));
T('1.5 stacja AI WYKLUCZONA z cargo', !cargo.has('st_ai'));

// ══ 2. transport_passenger (POP) ════════════════════════════════════════════════════════════════════
const pax = validTransportTargets('transport_passenger', SOURCE, bodies, stations, null);
T('2.1 cel==źródło (planet_home) WYKLUCZONY z pasażerów', !pax.has('planet_home'));
T('2.2 inna kolonia (planet_b) DOZWOLONA', pax.has('planet_b'));
T('2.3 stacja z matką ZOSTAJE dla pasażerów (POP → habitat)', pax.has('st_m'));
T('2.4 sierota też dozwolona dla pasażerów', pax.has('st_o'));
T('2.5 stacja AI WYKLUCZONA z pasażerów', !pax.has('st_ai'));

// ══ 3. Bez źródła (drift/brak dockedAt) — nic nie wyklucza się po źródle ═════════════════════════════
const noSrc = validTransportTargets('transport', null, bodies, stations, null);
T('3.1 brak źródła → planet_home NIE wykluczony po źródle (ale i tak dozwolony jako inna kolonia)', noSrc.has('planet_home'));

console.log(`\nS3.4c Z3 (self-cargo + cel==źródło) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
