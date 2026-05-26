// ═══════════════════════════════════════════════════════════════
// Smoke test — BuildingSystem.autoPlaceBuilding (fix bug polarnych hexów)
// Uruchom: node src/testing/headless/test-auto-place-building.mjs
// ───────────────────────────────────────────────────────────────
// Kontekst: przed fixem Faza 2 brała "pierwszy wolny hex" = biegun (penalty
//   prod ×0.5), a Faza 1 (preferredTerrain) była MARTWA — czytała nieistniejące
//   tile.terrain zamiast tile.type. Fix wprowadza scoring wzorowany na
//   ColonyAutoExpander._findFreeTile: reguły z AiTerrainRules + polar penalty.
//
// IZOLOWANY harness (jak test-colony-auto-expander.mjs) — bez GameCore/'three'.
//   Budujemy realny BuildingSystem + ResourceSystem + CivilizationSystem + grid.
//
// Asercje:
//   T1: autonomous_solar_farm (desert + biegun)  → desert, nie biegun
//   T2: autonomous_mine (góry)                    → mountains
//   T3: autonomous_solar_farm (same równiny+bieg) → równina nie-polarna
//   T4: colony_base (nie-autonomiczny, capital)   → poza biegunem
//   T5: 10× autonomous_solar_farm                 → żaden w linii polarnej
//   T6: preferredTerrain:['mountains'] (Faza 1)   → mountains  [REGRESJA Fazy 1]
//       Po fixie tile.terrain→tile.type Faza 1 znów żyje — T6 chroni przed
//       ponownym jej martwiejem, nie tylko sprawdza "nadal działa".
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first — shim localStorage/window/THREE
import EventBus from '../../core/EventBus.js';
import { ResourceSystem }     from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem }     from '../../systems/BuildingSystem.js';
import { TechSystem }         from '../../systems/TechSystem.js';
import { HexGrid }            from '../../map/HexGrid.js';
import { BUILDINGS }          from '../../data/BuildingsData.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

globalThis.window = globalThis.window ?? {};
window.KOSMOS = { timeSystem: { gameTime: 0 } };

// Permisywny techStub — mnożniki=1, wszystko zbadane.
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const RES = {};
for (const r of ['Fe','Si','C','Cu','Ti','Li','Hv','Pt','food','water','research']) RES[r] = 1e6;

const HEIGHT = 10;       // rzędy 0..9; bieguny = 0 i 9
const WIDTH  = 8;
const lastRow = HEIGHT - 1;
const isPolar = (r) => r === 0 || r === lastRow;

// Buduje świeżą kolonię (izolacja między testami — capital idempotency, _active).
//   terrainFn(tile) może ustawić tile.type; domyślnie wszystko 'plains'.
function makeColony(terrainFn) {
  const planet = { id: 'p_test', name: 'Test', atmosphere: 'breathable' };
  const grid = new HexGrid(WIDTH, HEIGHT);
  grid.forEach(tile => { tile.type = 'plains'; if (terrainFn) terrainFn(tile); });

  const resSys = new ResourceSystem({ ...RES });
  const civSys = new CivilizationSystem({}, techStub, planet);
  civSys.resourceSystem = resSys;
  const bSys = new BuildingSystem(resSys, civSys, techStub);
  civSys.buildingSystem = bSys;
  civSys.population = 30;
  bSys._grid = grid;
  bSys._gridHeight = grid.height;
  bSys.setDeposits?.([]);
  return { grid, bSys };
}

// Znajdź tile na którym wylądował dany budynek (buildingId lub capitalBase).
function placedTileOf(grid, buildingId) {
  let found = null;
  grid.forEach(t => {
    if (found) return;
    if (BUILDINGS[buildingId]?.isCapital ? t.capitalBase : t.buildingId === buildingId) found = t;
  });
  return found;
}

// ── T1: solar_farm na ciele z pustyniami i biegunami → pustynia, nie biegun ──
console.log('--- T1: autonomous_solar_farm (desert + biegun) ---');
{
  // Ciało "z pustyniami i biegunami": tereny nie-polarne = desert, bieguny = plains.
  //   (solar soft-listuje desert i plains równo +10 — gdyby istniała nie-polarna
  //    równina, remisowałaby z pustynią; tu jedyny nie-polarny teren to desert.)
  const { grid, bSys } = makeColony(t => { if (!isPolar(t.r)) t.type = 'desert'; });
  const okBuild = bSys.autoPlaceBuilding('autonomous_solar_farm');
  const tile = placedTileOf(grid, 'autonomous_solar_farm');
  ok('T1 zbudowano', okBuild === true && tile != null);
  ok('T1 ląduje na desert', tile?.type === 'desert');
  ok('T1 nie na biegunie', tile != null && !isPolar(tile.r));
}

// ── T2: autonomous_mine na ciele z górami → góry ─────────────────────────────
console.log('--- T2: autonomous_mine (góry, hard) ---');
{
  const { grid, bSys } = makeColony(t => { if (t.r === 4) t.type = 'mountains'; });
  const okBuild = bSys.autoPlaceBuilding('autonomous_mine');
  const tile = placedTileOf(grid, 'autonomous_mine');
  ok('T2 zbudowano', okBuild === true && tile != null);
  ok('T2 ląduje na mountains (hard)', tile?.type === 'mountains');
}

// ── T3: solar_farm bez pustyń (same równiny + biegun) → równina nie-polarna ──
console.log('--- T3: autonomous_solar_farm (same równiny + biegun) ---');
{
  const { grid, bSys } = makeColony(); // wszystko plains
  const okBuild = bSys.autoPlaceBuilding('autonomous_solar_farm');
  const tile = placedTileOf(grid, 'autonomous_solar_farm');
  ok('T3 zbudowano', okBuild === true && tile != null);
  ok('T3 ląduje na plains', tile?.type === 'plains');
  ok('T3 nie na biegunie', tile != null && !isPolar(tile.r));
}

// ── T4: colony_base (nie-autonomiczny, capital) → poza biegunem jeśli możliwe ─
console.log('--- T4: colony_base (capital) ---');
{
  const { grid, bSys } = makeColony(); // wszystko plains
  const okBuild = bSys.autoPlaceBuilding('colony_base');
  const tile = placedTileOf(grid, 'colony_base');
  ok('T4 zbudowano (capitalBase)', okBuild === true && tile != null);
  ok('T4 nie na biegunie', tile != null && !isPolar(tile.r));
}

// ── T5: 10× solar_farm → żaden w linii polarnej ──────────────────────────────
console.log('--- T5: 10× autonomous_solar_farm (brak linii polarnej) ---');
{
  const { grid, bSys } = makeColony(); // wszystko plains → 48 hexów nie-polarnych
  const rows = [];
  let allBuilt = true;
  for (let i = 0; i < 10; i++) {
    const okBuild = bSys.autoPlaceBuilding('autonomous_solar_farm');
    if (!okBuild) { allBuilt = false; break; }
  }
  // Zbierz wszystkie hexy z tym budynkiem
  grid.forEach(t => { if (t.buildingId === 'autonomous_solar_farm') rows.push(t.r); });
  const polarHits = rows.filter(isPolar).length;
  console.log(`    postawiono=${rows.length}, rzędy=[${rows.join(',')}], polar=${polarHits}`);
  ok('T5 wszystkie 10 postawione', allBuilt && rows.length === 10);
  ok('T5 żaden hex w linii polarnej (r=0/last)', polarHits === 0);
}

// ── T6: preferredTerrain Faza 1 (REGRESJA — Faza 1 była martwa, fix ją wskrzesił)
console.log('--- T6: autonomous_solar_farm + preferredTerrain:[mountains] (Faza 1) ---');
{
  const { grid, bSys } = makeColony(t => { if (t.r === 4) t.type = 'mountains'; });
  const okBuild = bSys.autoPlaceBuilding('autonomous_solar_farm', { preferredTerrain: ['mountains'] });
  const tile = placedTileOf(grid, 'autonomous_solar_farm');
  ok('T6 zbudowano', okBuild === true && tile != null);
  ok('T6 respektuje preferredTerrain → mountains', tile?.type === 'mountains');
}

// ── Podsumowanie ─────────────────────────────────────────────────
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
