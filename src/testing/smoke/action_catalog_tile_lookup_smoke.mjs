// ═══════════════════════════════════════════════════════════
// KEEPER — Finding 764 (COLONY SPHERE CS-1b): ActionCatalog / ScriptedBot znajdują kafel po kluczu
// Uruchom: node src/testing/smoke/action_catalog_tile_lookup_smoke.mjs
// ───────────────────────────────────────────────────────────
// Przed CS-1b katalog czytał kafel przez `grid.getByKey` / `grid._map` — HexGrid nie ma żadnego z nich,
// więc listUpgradeActions / listDemolishActions zawsze zwracały 0 akcji (boty nigdy nie ulepszały ani
// nie burzyły), a ScriptedBot z `tileKey` nigdy nie rozwiązywał kafla. Teraz: TileGraph.tile(klucz).
// K1  ŚWIADEK/KONTROLA: świeża kolonia ma budynki poza stolicą (zielony po obu stronach).
// K2  listUpgradeActions = niezależnie policzone wpisy _active (bez stolicy, poziom < max), kafle = kafle siatki.
// K3  listDemolishActions = wpisy _active bez stolicy, kafle = kafle siatki.
// K4  getCounts() zgodne z K2/K3.
// K5  ScriptedBot._resolveAction: ścieżka tileKey i tileQ/tileR dają ten sam kafel; brak kafla → pusto.
// K6  EFEKT: akcja UPGRADE z katalogu → planet:upgradeRequest z tym kaflem → poziom budynku +1.
// ═══════════════════════════════════════════════════════════

import '../headless/env.js'; // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { ActionCatalog } from '../actions/ActionCatalog.js';
import ActionAdapter, { ACTION_TYPES } from '../actions/ActionAdapter.js';
import { ScriptedBot } from '../bots/ScriptedBot.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import EventBus from '../../core/EventBus.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const c = new GameCore();
c.boot({ quiet: true, scenario: 'civilization', solo: true });
const K = window.KOSMOS;
const home = c.colonyManager.getColony(K.homePlanet.id);
const bSys = home.buildingSystem;
const cat = new ActionCatalog({
  colonyManager: c.colonyManager, techSystem: c.techSystem, resourceSystem: c.resourceSystem,
  buildingSystem: c.buildingSystem, vesselManager: c.vesselManager, civSystem: c.civSystem,
  starSystemManager: c.starSystemManager,
});

// Niezależny odczyt (keeper może rozbierać klucz sam — to jest wzorzec, nie kod gry).
const gridTileOf = (key) => { const [q, r] = key.split(',').map(Number); return home.grid.get(q, r); };
const entries = [...bSys._active.entries()];
const nonCapital = entries.filter(([k, e]) => !k.startsWith('capital_') && BUILDINGS[e.building?.id ?? e.buildingId] && !BUILDINGS[e.building?.id ?? e.buildingId].isCapital);
const expUpgrade = nonCapital.filter(([, e]) => (e.level ?? 1) < (BUILDINGS[e.building?.id ?? e.buildingId].maxLevel ?? 10));

console.log('\nK1 — świadek: kolonia startowa');
assert(nonCapital.length >= 3 && entries.some(([k]) => k.startsWith('capital_')),
  `K1 KONTROLA: _active ma stolicę i ${nonCapital.length} budynków poza nią (${entries.map(([k, e]) => `${k}:${e.building?.id}`).join(' ')})`);

console.log('\nK2/K3/K4 — katalog akcji na kaflach z kluczy _active');
const ups = cat.listUpgradeActions({ limit: 999 });
const dem = cat.listDemolishActions({ limit: 999 });
const sameSet = (actions, exp) => actions.length === exp.length
  && exp.every(([k]) => actions.some(a => a.tile === gridTileOf(k)))
  && actions.every(a => a.tile && bSys._active.has(a.tile.key));
assert(ups.length > 0 && sameSet(ups, expUpgrade), `K2 listUpgradeActions: ${ups.length} akcji = ${expUpgrade.length} oczekiwanych, każdy kafel = kafel siatki dla klucza`);
assert(dem.length > 0 && sameSet(dem, nonCapital), `K3 listDemolishActions: ${dem.length} akcji = ${nonCapital.length} oczekiwanych, każdy kafel = kafel siatki dla klucza`);
const counts = cat.getCounts();
assert(counts.upgrade === expUpgrade.length && counts.demolish === nonCapital.length,
  `K4 getCounts(): upgrade=${counts.upgrade} (${expUpgrade.length}), demolish=${counts.demolish} (${nonCapital.length})`);

console.log('\nK5 — ScriptedBot rozwiązuje kafel po kluczu i po q/r');
{
  const bot = new ScriptedBot({ script: [] });
  const [key] = nonCapital[0];
  const t = gridTileOf(key);
  const byKey = bot._resolveAction({ type: ACTION_TYPES.UPGRADE, tileKey: key }, cat)?.tile;
  const byQR = bot._resolveAction({ type: ACTION_TYPES.UPGRADE, tileQ: t.q, tileR: t.r }, cat)?.tile;
  const missing = bot._resolveAction({ type: ACTION_TYPES.UPGRADE, tileKey: '999,999' }, cat)?.tile;
  assert(byKey === t && byQR === t && !missing, `K5 tileKey '${key}' → kafel siatki (${byKey === t}), tileQ/tileR → ten sam (${byQR === t}), brak kafla → pusto (${!missing})`);
}

console.log('\nK6 — efekt: ulepszenie z katalogu podnosi poziom budynku');
{
  const a = ups[0];
  const key = a?.tile?.key;
  const before = bSys._active.get(key)?.level;
  let seen = null;
  const off = EventBus.on('planet:upgradeRequest', ({ tile }) => { seen = tile; });
  const res = a ? ActionAdapter.execute(a) : null;
  new Ticker(c.timeSystem).run(1);
  if (typeof off === 'function') off();
  const after = bSys._active.get(key)?.level;
  assert(!!res?.emitted && seen === a?.tile && after === before + 1,
    `K6 UPGRADE ${key}: emisja=${!!res?.emitted}, żądanie z kaflem katalogu=${seen === a?.tile}, poziom ${before} → ${after}`);
}

console.log(`\n=== action_catalog_tile_lookup_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
