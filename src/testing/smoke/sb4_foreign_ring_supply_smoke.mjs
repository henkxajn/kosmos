// ═══════════════════════════════════════════════════════════════════════════════
// sb4_foreign_ring_supply_smoke — KEEPER Findingu 448 (AI STRIKES BACK S4, sesja 4 — decyzja SB94).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2, §6 (448).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `SupplyCoverageSystem` liczył zasięg stolicy i koszar z siatki ciała bez względu na właściciela kolonii,
//   a faza 4 pomijała zużycie zaopatrzenia w tym zasięgu („w strefie uzupełniania efekt zerowy”). Od SB78 (S4-10) na
//   kolonii WŁASNEJ zużycia nie ma w ogóle, a uzupełnianie płynie wyłącznie z magazynu kolonii własnej — więc wyjątek
//   pierścienia działał już tylko na CUDZYM gruncie: desant gracza obok stolicy wroga nie zużywał zaopatrzenia i nie
//   głodował, a o krok dalej — głodował. SB94: pierścień stolicy / koszar CUDZEJ kolonii nie zwalnia z zużycia; cudzy grunt
//   jest cudzy. Zasięg stolicy i koszar liczony wyłącznie dla kolonii gracza (mapa pokrycia = zaopatrzenie gracza; ta
//   sama mapa zasila nakładkę zasięgu w UI).
//
// ⚠ Harness: prawdziwy `GameCore`; `SupplyCoverageSystem.update(civDeltaYears)` wołane wprost krokami 0,5 civY (bez
//   `time:tick` — wzór `sb4_own_ground_supply_smoke`). Jednostki — `createUnit` (szturm, zaopatrzenie 100/100).
//
// PINY (fail-first na kodzie S4-13):
//   T1  jednostka gracza w pierścieniu stolicy kolonii AI zużywa zaopatrzenie (1 civY w bezczynności: −zużycie)
//   T2  ta sama jednostka przez 10 lat gry — ginie z głodu (meldunek głodu)
//   T3  mapa pokrycia kolonii AI bez wpisów stolicy i koszar (nakładka zasięgu nie maluje pierścienia wroga)
//   T4  KONTROLE (zielone po obu stronach): własna kolonia — mapa pokrycia ma pierścień stolicy, jednostka w nim bez
//       zużycia; kolonia AI poza pierścieniem — zużycie jak dotąd; magazyn kolonii AI nietknięty; jednostka AI w swoim
//       pierścieniu — bez zmian (fazy dotyczą wyłącznie jednostek gracza)
//   T5  piny źródłowe: faza 4 bez wyjątku pierścienia; zasięg stolicy i koszar bramkowany kolonią gracza
// ═══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { SupplyCoverageSystem } from '../../systems/SupplyCoverageSystem.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  reseed('kosmos-default');
  gameState.restore(null);
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  const cm = K.colonyManager;
  const home = cm.getColony(K.homePlanet.id);
  const ai = cm.getAllColonies().find(c => c.ownerEmpireId && !c.isOutpost && c.grid);
  const w = { core, K, cm, gum: K.groundUnitManager, home, ai, scs: new SupplyCoverageSystem(cm, K.groundUnitManager), starved: [] };
  EventBus.on('groundUnit:starved', (e) => w.starved.push(e.unitId));
  return w;
}
const capTile = (colony) => colony.grid.toArray().find(t => t.capitalBase);
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
/** Kafel kolonii najdalej od stolicy (poza pierścieniem zasięgu). */
const farTile = (colony) => { const c = capTile(colony); return colony.grid.toArray().filter(t => !t.capitalBase).sort((a, b) => dist(b, c) - dist(a, c))[0]; };
/** Kafel w pierścieniu 1 wokół stolicy. */
const ringTile = (colony) => { const c = capTile(colony); return colony.grid.toArray().find(t => dist(t, c) === 1); };
const unit = (w, planetId, t, owner = 'player') => w.gum.createUnit('shock_infantry', planetId, t.q, t.r, { owner });
/** `civY` lat cywilizacyjnych krokami 0,5. */
const run = (w, civY) => { for (let t = 0; t < civY - 1e-9; t += 0.5) quiet(() => w.scs.update(0.5)); };
const alive = (w, u) => !!w.gum.getUnit(u.id) && (u.hp ?? 0) > 0;
const covTypes = (w, planetId) => [...new Set([...w.scs.getCoverage(planetId).values()].map(i => i.type))].sort();
const TEN_YEARS = 120;                               // 10 lat gry = 120 lat cywilizacyjnych

// ═══ T1 — pierścień stolicy AI: zużycie ═══════════════════════════════════════
header('T1  pierścień stolicy kolonii AI — jednostka gracza zużywa zaopatrzenie');
{
  const w = boot();
  const u = unit(w, w.ai.planetId, ringTile(w.ai));
  u.supply = 50;
  const spent = (u.supplyConsumption ?? 2) * 1.0;    // bezczynność: mnożnik 1,0
  quiet(() => w.scs.update(1.0));
  console.log(`     kolonia AI ${w.ai.planetId} (${w.ai.ownerEmpireId}) · zapas 50 → ${u.supply} (zużycie ${spent} / civY)`);
  assert(!!w.ai && spent > 0 && u.supply === 50 - spent, 'T1a 1 civY w pierścieniu stolicy AI: zapas 50 → 50 − zużycie');
}

// ═══ T2 — pierścień stolicy AI: głód ══════════════════════════════════════════
header('T2  pierścień stolicy kolonii AI — 10 lat gry: głód');
{
  const w = boot();
  const u = unit(w, w.ai.planetId, ringTile(w.ai));
  run(w, TEN_YEARS);
  console.log(`     żyje ${alive(w, u)} · zapas ${u.supply} · meldunki głodu ${w.starved.length}`);
  assert(!alive(w, u) && w.starved.includes(u.id), 'T2a 10 lat gry w pierścieniu stolicy AI — śmierć głodowa (meldunek głodu)');
}

// ═══ T3 — mapa pokrycia kolonii AI ════════════════════════════════════════════
header('T3  mapa pokrycia kolonii AI bez pierścienia stolicy i koszar');
{
  const w = boot();
  unit(w, w.ai.planetId, ringTile(w.ai));
  quiet(() => w.scs.update(0.5));
  const t = covTypes(w, w.ai.planetId);
  console.log(`     typy pokrycia na kolonii AI: ${JSON.stringify(t)}`);
  assert(!t.includes('capital') && !t.includes('barracks'), 'T3a mapa pokrycia kolonii AI — bez wpisów `capital` / `barracks`');
}

// ═══ T4 — kontrole ════════════════════════════════════════════════════════════
header('T4  KONTROLE (zielone po obu stronach)');
{
  const w = boot();
  const u = unit(w, w.home.planetId, ringTile(w.home));
  u.supply = 50;
  quiet(() => w.scs.update(1.0));
  const t = covTypes(w, w.home.planetId);
  console.log(`     własna kolonia: typy pokrycia ${JSON.stringify(t)} · zapas 50 → ${u.supply}`);
  assert(t.includes('capital') && u.supply === 50, 'T4a KONTROLA: własna kolonia — pierścień stolicy na mapie pokrycia, jednostka w nim bez zużycia');
}
{
  const w = boot();
  const u = unit(w, w.ai.planetId, farTile(w.ai));
  u.supply = 50;
  const spent = (u.supplyConsumption ?? 2) * 1.0;
  quiet(() => w.scs.update(1.0));
  assert(u.supply === 50 - spent, 'T4b KONTROLA: kolonia AI poza pierścieniem — zużycie jak dotąd');
}
{
  const w = boot();
  const u = unit(w, w.ai.planetId, ringTile(w.ai));
  u.supply = 50;
  w.ai.resourceSystem.receive({ military_supplies: 30 });
  quiet(() => w.scs.update(1.0));
  const stock = w.ai.resourceSystem.getAmount('military_supplies');
  assert(stock === 30 && u.supply <= 50, 'T4c KONTROLA: magazyn kolonii AI nietknięty przez jednostkę gracza (bez uzupełnienia)');
}
{
  const w = boot();
  const a = unit(w, w.ai.planetId, ringTile(w.ai), w.ai.ownerEmpireId);
  a.supply = 50;
  run(w, 10);
  assert(a.supply === 50 && alive(w, a), 'T4d KONTROLA: jednostka AI w pierścieniu swojej stolicy — bez zmian (fazy dotyczą gracza)');
}

// ═══ T5 — piny źródłowe ═══════════════════════════════════════════════════════
header('T5  piny źródłowe');
{
  const s = strip(readFileSync(new URL('../../systems/SupplyCoverageSystem.js', import.meta.url), 'utf8'));
  // Fazy 1–2 (uzupełnianie) pytają `cov.type !== 'capital'` — kontrola, że kod faz jest w tekście po zdjęciu komentarzy.
  assert(/cov\.type !== 'capital'/.test(s) && !/inRefillZone/.test(s) && !/cov\.type === 'capital'/.test(s),
    'T5a faza 4 bez wyjątku pierścienia stolicy / koszar (brak `inRefillZone` i testu „cov.type === capital”)');
  const cc = s.slice(s.indexOf('_computeCoverage(planetId, colony, units) {'), s.indexOf('_addHexAndNeighbors(map, grid, q, r, info'));
  assert(/if \(grid && isPlayerColony\(colony\)\) \{[\s\S]*capitalBase[\s\S]*barracks_lv1/.test(cc),
    'T5b zasięg stolicy i koszar w `_computeCoverage` bramkowany kolonią gracza (`isPlayerColony`)');
}

console.log(`\n═══ sb4_foreign_ring_supply_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
