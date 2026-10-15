// ═══════════════════════════════════════════════════════════════════════════════
// sb4_own_ground_supply_smoke — KEEPER Findingu 442 (AI STRIKES BACK S4, sesja 3 — decyzja SB78, wariant b).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (442).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `SupplyCoverageSystem` uzupełniał zaopatrzenie z `colony.commodities.military_supplies` — pola, którego żadna
//   kolonia nie ma (towary mieszkają w `colony.resourceSystem`), więc uzupełnianie nie działało nigdy, a jednostki gracza
//   ginęły z głodu także na WŁASNYCH koloniach (zmierzone D3: 8/8 na planecie macierzystej po 7,42 roku). SB78 (b):
//   jednostka na kolonii WŁASNEGO imperium nie zużywa zaopatrzenia, a zaopatrzenie liczy się wyłącznie na cudzym gruncie
//   (na własnym: bez głodu, regeneracja bez względu na zapas). Odczyt magazynu naprawiony: uzupełnianie w zasięgu stolicy /
//   koszar WŁASNEJ kolonii z `resourceSystem` (`military_supplies`); cudzy grunt — bez zmian.
//
// ⚠ Harness: prawdziwy `GameCore`; `SupplyCoverageSystem.update(civDeltaYears)` wołane wprost krokami 0,5 civY (bez
//   `time:tick` — utrzymanie, walka i reszta świata nie są przedmiotem testu). Jednostki gracza — `createUnit` (szturm,
//   zaopatrzenie 100/100, zużycie 3/civY).
//
// PINY (fail-first na `0bd5309` — S4-9):
//   T1  własna kolonia, poza pierścieniem stolicy: 10 lat gry (120 civY) — żyje, zapas bez zmian, bez meldunku głodu
//   T2  własna kolonia, zapas 0: 10 lat gry — żyje (bez głodu na własnym gruncie)
//   T3  własna kolonia, zapas 0: organizacja się regeneruje (zapas nie liczy się na własnym gruncie)
//   T4  uzupełnianie z magazynu kolonii (`resourceSystem`, `military_supplies`) w pierścieniu stolicy własnej kolonii
//   T5  KONTROLE (zielone po obu stronach): cudzy grunt bez zmian — jednostka na kolonii AI i na ciele niczyim ginie z głodu
//       w 10 lat gry; magazyn kolonii AI nietknięty przez jednostkę gracza w pierścieniu stolicy AI
//   T6  pin źródłowy: brak odczytu `colony.commodities` w `SupplyCoverageSystem`
// ═══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
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
  const ai = cm.getAllColonies().find(c => c.ownerEmpireId && !c.isOutpost);
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
const unit = (w, planetId, t) => w.gum.createUnit('shock_infantry', planetId, t.q, t.r, { owner: 'player' });
/** `civY` lat cywilizacyjnych krokami 0,5. */
const run = (w, civY) => { for (let t = 0; t < civY - 1e-9; t += 0.5) quiet(() => w.scs.update(0.5)); };
const alive = (w, u) => !!w.gum.getUnit(u.id) && (u.hp ?? 0) > 0;
const TEN_YEARS = 120;                               // 10 lat gry = 120 lat cywilizacyjnych

// ═══ T1 — własny grunt: bez zużycia ═══════════════════════════════════════════
header('T1  własna kolonia — bez zużycia zaopatrzenia');
{
  const w = boot();
  const u = unit(w, w.home.planetId, farTile(w.home));
  const s0 = u.supply;
  run(w, TEN_YEARS);
  console.log(`     zapas ${s0} → ${u.supply} · HP ${u.hp} · meldunki głodu ${w.starved.length}`);
  assert(alive(w, u) && u.supply === s0 && w.starved.length === 0, 'T1a 10 lat gry na własnej kolonii — żyje, zapas bez zmian, bez meldunku głodu');
}

// ═══ T2 — własny grunt: bez głodu ═════════════════════════════════════════════
header('T2  własna kolonia, zapas 0 — bez głodu');
{
  const w = boot();
  const u = unit(w, w.home.planetId, farTile(w.home));
  u.supply = 0;
  const hp0 = u.hp;
  run(w, TEN_YEARS);
  console.log(`     HP ${hp0} → ${alive(w, u) ? u.hp : 'nie żyje'} · meldunki głodu ${w.starved.length}`);
  assert(alive(w, u) && u.hp === hp0 && w.starved.length === 0, 'T2a zapas 0 na własnej kolonii — żyje, HP bez zmian, bez meldunku głodu');
}

// ═══ T3 — własny grunt: regeneracja ═══════════════════════════════════════════
header('T3  własna kolonia, zapas 0 — regeneracja organizacji');
{
  const w = boot();
  const u = unit(w, w.home.planetId, farTile(w.home));
  u.supply = 0; u.org = 2;
  run(w, 2);
  console.log(`     organizacja 2 → ${u.org}`);
  assert(u.org > 2, 'T3a zapas nie liczy się na własnym gruncie — organizacja rośnie mimo zapasu 0');
}

// ═══ T4 — uzupełnianie z magazynu ═════════════════════════════════════════════
header('T4  uzupełnianie z magazynu kolonii (`resourceSystem`)');
{
  const w = boot();
  const u = unit(w, w.home.planetId, ringTile(w.home));
  u.supply = 50;
  w.home.resourceSystem.receive({ military_supplies: 30 });
  quiet(() => w.scs.update(1.0));
  const stock = w.home.resourceSystem.getAmount('military_supplies');
  console.log(`     zapas 50 → ${u.supply} · magazyn 30 → ${stock}`);
  assert(u.supply === 70 && stock === 10, 'T4a pierścień stolicy własnej kolonii: +20 / civY z magazynu (`military_supplies` 30 → 10)');
}

// ═══ T5 — cudzy grunt bez zmian ═══════════════════════════════════════════════
header('T5  KONTROLE: cudzy grunt bez zmian');
{
  const w = boot();
  const u = unit(w, w.ai.planetId, farTile(w.ai));
  run(w, TEN_YEARS);
  assert(!alive(w, u) && w.starved.includes(u.id), 'T5a KONTROLA: kolonia AI — śmierć głodowa w 10 lat gry (meldunek głodu)');
}
{
  const w = boot();
  const sys = EntityManager.get(w.home.planetId)?.systemId;
  const nb = ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .find(b => b.systemId === sys && b.id !== w.home.planetId && !w.cm.getColony(b.id));
  const u = w.gum.createUnit('shock_infantry', nb.id, 0, 0, { owner: 'player' });
  run(w, TEN_YEARS);
  assert(!!nb && !alive(w, u) && w.starved.includes(u.id), 'T5b KONTROLA: ciało niczyje — śmierć głodowa w 10 lat gry');
}
{
  const w = boot();
  const u = unit(w, w.ai.planetId, ringTile(w.ai));
  u.supply = 50;
  w.ai.resourceSystem.receive({ military_supplies: 30 });
  quiet(() => w.scs.update(1.0));
  const stock = w.ai.resourceSystem.getAmount('military_supplies');
  console.log(`     pierścień stolicy AI: zapas 50 → ${u.supply} · magazyn AI 30 → ${stock}`);
  assert(stock === 30 && u.supply <= 50, 'T5c KONTROLA: jednostka gracza w pierścieniu stolicy AI — magazyn AI nietknięty, bez uzupełnienia');
}

// ═══ T6 — pin źródłowy ════════════════════════════════════════════════════════
header('T6  pin źródłowy');
{
  const s = strip(readFileSync(new URL('../../systems/SupplyCoverageSystem.js', import.meta.url), 'utf8'));
  assert(s.includes('update(civDeltaYears)') && !/\.commodities\b/.test(s), 'T6a brak odczytu `colony.commodities` (towary — `resourceSystem`)');
}

console.log(`\n═══ sb4_own_ground_supply_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
