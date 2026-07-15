// S3.4c — smoke: drain depotu przy restore + osierocenie po colony:destroyed (Commit 2, D3+D5).
// Uruchom: node src/testing/smoke/s34c_drain_orphan_smoke.mjs
// Pokrywa: drain zawartości starego depotu → kolonia-matka (idempotentny); drain fuel/warp_cores (D4);
// stamp normalizacyjny ownerColonyId; osierocenie po colony:destroyed (własny depot, moduły bez matki);
// depotDetached round-trip; sierota NIETKNIĘTA przy restore.

globalThis.window = globalThis.window ?? { KOSMOS: {} };
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const { Station } = await import('../../entities/Station.js');
const { resolveHomeColony } = await import('../../utils/TransferStore.js');
const EntityManager = (await import('../../core/EntityManager.js')).default;
const EventBus = (await import('../../core/EventBus.js')).default;
const { StationSystem } = await import('../../systems/StationSystem.js');

function makeFakeRS(init = {}) {
  const inventory = new Map(Object.entries(init));
  return {
    inventory,
    getAmount: (id) => inventory.get(id) ?? 0,
    receive(g) { for (const [k, v] of Object.entries(g)) if (v > 0) inventory.set(k, (inventory.get(k) ?? 0) + v); },
    spend(c) {
      for (const [k, v] of Object.entries(c)) if ((inventory.get(k) ?? 0) < v) return false;
      for (const [k, v] of Object.entries(c)) inventory.set(k, (inventory.get(k) ?? 0) - v);
      return true;
    },
  };
}

const colonies = new Map();
function setColony(planetId, { systemId = 'sys_home', ownerEmpireId = null, init = {} } = {}) {
  const col = { planetId, systemId, ownerEmpireId, resourceSystem: makeFakeRS(init) };
  colonies.set(planetId, col);
  return col;
}
window.KOSMOS.colonyManager = {
  getColony: (id) => colonies.get(id) ?? null,
  getColoniesInSystem: (sysId) => [...colonies.values()].filter(c => (c.systemId ?? 'sys_home') === sysId),
};

const sys = new StationSystem();

// ══ 1. Drain przy restore → magazyn kolonii-matki (surowa Mapa z save) ═══════════════════════════════
colonies.clear();
EntityManager.clear?.();
const home = setColony('planet_home', { init: { Fe: 10 } });
// symulacja restore: encja z depot (save flat map) + stamp matki
const stSave = {
  id: 'st_drain', name: 'D', bodyId: 'planet_home', systemId: 'sys_home', ownerColonyId: 'planet_home',
  depot: { Fe: 100, Ti: 50, fuel: 30, warp_cores: 2 },
};
sys.restore([stSave]);
const st1 = EntityManager.get('st_drain');
T('1.1 encja odtworzona', !!st1 && st1.type === 'station');
T('1.2 drain przelał Fe do kolonii (10+100)', home.resourceSystem.getAmount('Fe') === 110);
T('1.3 drain przelał Ti', home.resourceSystem.getAmount('Ti') === 50);
T('1.4 drain przelał fuel (D4 wspólny pool)', home.resourceSystem.getAmount('fuel') === 30);
T('1.5 drain przelał warp_cores (D4)', home.resourceSystem.getAmount('warp_cores') === 2);
T('1.6 własny depot pusty po drainie', st1.depot._ownInventory.size === 0);
T('1.7 depot.serialize() = {} (proxy do kolonii)', JSON.stringify(st1.depot.serialize()) === '{}');

// ══ 2. Drain IDEMPOTENTNY — drugi przebieg nie dubluje ══════════════════════════════════════════════
sys._normalizeAndDrainDepot(st1);
T('2.1 drugi drain NIE dubluje Fe (nadal 110)', home.resourceSystem.getAmount('Fe') === 110);
sys._normalizeAndDrainDepot(st1);
T('2.2 trzeci drain NIE dubluje', home.resourceSystem.getAmount('Fe') === 110 && home.resourceSystem.getAmount('fuel') === 30);

// ══ 3. Stamp normalizacyjny dla starego save (ownerColonyId brak → stamp z fallbacku) ═══════════════
colonies.clear();
EntityManager.clear?.();
const colB = setColony('planet_b', { init: {} });
sys.restore([{ id: 'st_nostamp', name: 'N', bodyId: 'planet_b', systemId: 'sys_home', depot: { Cu: 40 } }]);
const st3 = EntityManager.get('st_nostamp');
T('3.1 stamp ownerColonyId ustawiony z fallbacku per-body', st3.ownerColonyId === 'planet_b');
T('3.2 zawartość starego depotu przelana do kolonii', colB.resourceSystem.getAmount('Cu') === 40);

// ══ 4. Sierota NIETKNIĘTA przy restore (brak matki → własny depot z zawartością) ═════════════════════
colonies.clear();
EntityManager.clear?.();
sys.restore([{ id: 'st_lone', name: 'L', bodyId: 'asteroid_z', systemId: 'sys_far', depot: { Fe: 77 } }]);
const st4 = EntityManager.get('st_lone');
T('4.1 sierota zachowuje własny depot', st4.depot.getAmount('Fe') === 77);
T('4.2 sierota serialize płaski (własna Mapa)', JSON.stringify(st4.depot.serialize()) === JSON.stringify({ Fe: 77 }));
T('4.3 sierota resolveHomeColony null', resolveHomeColony(st4) === null);

// ══ 5. Osierocenie po colony:destroyed (D5) — stacja żyje, przełącza na własny depot ════════════════
colonies.clear();
EntityManager.clear?.();
const colH = setColony('planet_home', { init: { Fe: 500 } });
const st5 = new Station({ id: 'st_orph', name: 'O', bodyId: 'planet_home', systemId: 'sys_home', ownerColonyId: 'planet_home' });
EntityManager.add(st5);
T('5.1 przed zniszczeniem: matka rozwiązana', resolveHomeColony(st5) === colH);
T('5.2 przed: depot deleguje (Fe z kolonii)', st5.depot.getAmount('Fe') === 500);
// symuluj zniszczenie kolonii: usuń z rejestru, POTEM emit (kolejność jak ColonyManager.removeColony)
colonies.delete('planet_home');
EventBus.emit('colony:destroyed', { planetId: 'planet_home' });
T('5.3 stacja NIE zniszczona (żyje)', !!EntityManager.get('st_orph'));
T('5.4 depotDetached = true', st5.depotDetached === true);
T('5.5 resolveHomeColony null po osieroceniu', resolveHomeColony(st5) === null);
T('5.6 depot używa własnej (pustej) Mapy — moduły bez zaopatrzenia', st5.depot.getAmount('Fe') === 0 && st5.depot._ownInventory.size === 0);
st5.depot.receive({ Fe: 5 });
T('5.7 receive po osieroceniu trafia do własnej Mapy', st5.depot._ownInventory.get('Fe') === 5);

// ══ 6. Osierocenie NIE re-mothers do rodzeństwa w systemie ══════════════════════════════════════════
colonies.clear();
EntityManager.clear?.();
setColony('planet_a', { systemId: 'sys_x', init: {} });
const colSib = setColony('planet_sib', { systemId: 'sys_x', init: {} });
const st6 = new Station({ id: 'st_sib', name: 'S', bodyId: 'planet_a', systemId: 'sys_x', ownerColonyId: 'planet_a' });
EntityManager.add(st6);
colonies.delete('planet_a');
EventBus.emit('colony:destroyed', { planetId: 'planet_a' });
T('6.1 osierocona mimo rodzeństwa w systemie (depotDetached)', st6.depotDetached === true);
T('6.2 NIE re-mothered do planet_sib', resolveHomeColony(st6) === null && resolveHomeColony(st6) !== colSib);

// ══ 7. depotDetached round-trip (save v90) + sierota drain-skip przy restore ════════════════════════
colonies.clear();
EntityManager.clear?.();
// stacja osierocona z własną zawartością → serialize → restore → wciąż detached, zawartość zachowana
const st7 = new Station({ id: 'st_rt', name: 'RT', bodyId: 'planet_x', systemId: 'sys_home', depotDetached: true, depot: { Fe: 20 } });
EntityManager.add(st7);
const ser7 = sys.serialize().find(r => r.id === 'st_rt');
T('7.1 serialize zawiera depotDetached', ser7 && ser7.depotDetached === true);
T('7.2 serialize depot płaski (własna Mapa)', ser7 && JSON.stringify(ser7.depot) === JSON.stringify({ Fe: 20 }));
EntityManager.remove('st_rt');
setColony('planet_x', { init: {} });   // nawet gdy pojawi się kolonia na bodyId — detached blokuje mothering
sys.restore([ser7]);
const st7r = EntityManager.get('st_rt');
T('7.3 restore zachowuje depotDetached', st7r.depotDetached === true);
T('7.4 detached: drain POMINIĘTY, własny depot zachowany', st7r.depot.getAmount('Fe') === 20);
T('7.5 detached: kolonia na bodyId NIE dostała zawartości', colonies.get('planet_x').resourceSystem.getAmount('Fe') === 0);

console.log(`\nS3.4c Commit 2 (drain + orphan) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
