// S3.4c — smoke: proxy resolver StationDepot + stamp ownerColonyId (Commit 1, D1+D2).
// Uruchom: node src/testing/smoke/s34c_depot_proxy_smoke.mjs
// Pokrywa: proxy delegacja receive/spend/getAmount/inventory do kolonii-matki; sierota → własna Mapa;
// guard AI → depot; resolveHomeColony fallbacki (stamp → per-body → parent(księżyc) → jedyna-w-systemie
// → null); serialize kształt (matka {}, sierota płaski); createStation/serialize round-trip ownerColonyId.

// Stub środowiska (StationSystem/TransferStore dotykają window; EventBus/EntityManager czyste JS).
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

const { StationDepot } = await import('../../entities/StationDepot.js');
const { Station } = await import('../../entities/Station.js');
const { resolveHomeColony } = await import('../../utils/TransferStore.js');
const EntityManager = (await import('../../core/EntityManager.js')).default;
const { StationSystem } = await import('../../systems/StationSystem.js');

// ── Fake magazyn kolonii (kontrakt resourceSystem-podobny: receive/spend/getAmount/inventory Map) ─────
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

// ── Fake ColonyManager oparty o rejestr kolonii (planetId → colony) ──────────────────────────────────
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

const mkStation = (cfg) => new Station({ id: cfg.id ?? 'st_x', name: 'S', ...cfg });

// ══ 1. Stacja z matką (stamp) — proxy DELEGUJE do kolonii ═══════════════════════════════════════════
colonies.clear();
const home = setColony('planet_home', { init: {} });
const st1 = mkStation({ id: 'st1', bodyId: 'planet_home', systemId: 'sys_home', ownerColonyId: 'planet_home' });
T('1.1 resolveHomeColony → kolonia-matka', resolveHomeColony(st1) === home);
st1.depot.receive({ Fe: 100, fuel: 20 });
T('1.2 receive trafia do magazynu kolonii', home.resourceSystem.getAmount('Fe') === 100 && home.resourceSystem.getAmount('fuel') === 20);
T('1.3 depot.getAmount czyta z kolonii', st1.depot.getAmount('Fe') === 100);
T('1.4 depot._ownInventory pozostaje puste (proxy)', st1.depot._ownInventory.size === 0);
T('1.5 depot.inventory === Map kolonii (ta sama ref)', st1.depot.inventory === home.resourceSystem.inventory);
const okSpend = st1.depot.spend({ Fe: 40 });
T('1.6 spend true + odejmuje z kolonii', okSpend === true && home.resourceSystem.getAmount('Fe') === 60);
T('1.7 spend niewystarczające → false, bez pobrania', st1.depot.spend({ Fe: 9999 }) === false && home.resourceSystem.getAmount('Fe') === 60);
T('1.8 serialize matki = {} (delegat bez własnego stanu)', JSON.stringify(st1.depot.serialize()) === '{}');

// ══ 2. Sierota (brak kolonii-matki) — własna Mapa ═══════════════════════════════════════════════════
colonies.clear();
const orphan = mkStation({ id: 'st_orphan', bodyId: 'asteroid_x', systemId: 'sys_deep' });
T('2.1 resolveHomeColony → null (brak matki)', resolveHomeColony(orphan) === null);
orphan.depot.receive({ Fe: 50, Ti: 10 });
T('2.2 receive trafia do własnej Mapy', orphan.depot._ownInventory.get('Fe') === 50);
T('2.3 getAmount z własnej Mapy', orphan.depot.getAmount('Ti') === 10);
T('2.4 spend z własnej Mapy', orphan.depot.spend({ Fe: 20 }) === true && orphan.depot.getAmount('Fe') === 30);
T('2.5 spend za dużo → false', orphan.depot.spend({ Fe: 999 }) === false && orphan.depot.getAmount('Fe') === 30);
T('2.6 serialize sieroty = płaski niezerowy', JSON.stringify(orphan.depot.serialize()) === JSON.stringify({ Fe: 30, Ti: 10 }));

// ══ 3. Guard AI — stacja obca NIGDY nie sięga magazynu gracza ═══════════════════════════════════════
colonies.clear();
setColony('planet_home', { init: { Fe: 1000 } });
const stAI = mkStation({ id: 'st_ai', bodyId: 'planet_home', systemId: 'sys_home', ownerColonyId: 'planet_home', ownerEmpireId: 'ai_1' });
T('3.1 resolveHomeColony(AI) → null (guard)', resolveHomeColony(stAI) === null);
stAI.depot.receive({ Fe: 5 });
T('3.2 AI depot używa własnej Mapy (nie kolonii gracza)', stAI.depot._ownInventory.get('Fe') === 5 && colonies.get('planet_home').resourceSystem.getAmount('Fe') === 1000);

// ══ 4. Fallback per-body (brak stampu) ══════════════════════════════════════════════════════════════
colonies.clear();
const colB = setColony('planet_b', { init: {} });
const stPB = mkStation({ id: 'st_pb', bodyId: 'planet_b', systemId: 'sys_home' });   // ownerColonyId null
T('4.1 fallback per-body → kolonia na bodyId', resolveHomeColony(stPB) === colB);

// ══ 5. Fallback parent (księżyc → planeta-rodzic) ═══════════════════════════════════════════════════
colonies.clear();
setColony('planet_b', { init: {} });
EntityManager.clear?.();
EntityManager.add({ id: 'moon_1', type: 'moon', parentPlanetId: 'planet_b', systemId: 'sys_home' });
const stMoon = mkStation({ id: 'st_moon', bodyId: 'moon_1', systemId: 'sys_home' });   // brak kolonii na moon_1
T('5.1 fallback parent → kolonia planety-rodzica', resolveHomeColony(stMoon) === colonies.get('planet_b'));

// ══ 6. Fallback jedyna-w-systemie + dwuznaczność (≥2 → null) ═════════════════════════════════════════
colonies.clear();
EntityManager.clear?.();
const colC = setColony('planet_c', { systemId: 'sys_two', init: {} });
const stSys = mkStation({ id: 'st_sys', bodyId: 'asteroid_y', systemId: 'sys_two' });   // brak per-body/parent
T('6.1 jedyna kolonia w systemie → matka', resolveHomeColony(stSys) === colC);
setColony('planet_d', { systemId: 'sys_two', init: {} });   // druga kolonia gracza w tym systemie
T('6.2 dwie kolonie w systemie → null (dwuznaczność → sierota)', resolveHomeColony(stSys) === null);
// stamp rozstrzyga dwuznaczność:
stSys.ownerColonyId = 'planet_d';
T('6.3 stamp rozstrzyga dwuznaczność → wskazana kolonia', resolveHomeColony(stSys) === colonies.get('planet_d'));

// ══ 7. createStation stampuje ownerColonyId + serialize/restore round-trip ══════════════════════════
colonies.clear();
setColony('planet_home', { init: {} });
EntityManager.clear?.();
EntityManager.add({ id: 'planet_home', type: 'planet', name: 'Home', x: 1, y: 2, systemId: 'sys_home' });
const ss = new StationSystem();
const built = ss.createStation('planet_home', { ownerColonyId: 'planet_home' });
T('7.1 createStation stampuje ownerColonyId', built?.ownerColonyId === 'planet_home');
T('7.2 createStation domyślnie ownerColonyId=null (bez opt)',
  ss.createStation('planet_home')?.ownerColonyId === null);
const ser = ss.serialize().find(r => r.id === built.id);
T('7.3 serialize zawiera ownerColonyId', ser && ser.ownerColonyId === 'planet_home');
T('7.4 serialize depot matki = {} (proxy)', ser && JSON.stringify(ser.depot) === '{}');
// restore round-trip
EntityManager.remove(built.id);
T('7.5 encja usunięta przed restore', !EntityManager.get(built.id));
ss.restore([ser]);
const restored = EntityManager.get(built.id);
T('7.6 restore odtwarza ownerColonyId', restored?.ownerColonyId === 'planet_home');

// ══ 8. Proxy respektuje ŻYWĄ zmianę matki (stamp nieaktualny → fallback) ═════════════════════════════
colonies.clear();
const colLive = setColony('planet_live', { init: {} });
const stStale = mkStation({ id: 'st_stale', bodyId: 'planet_live', systemId: 'sys_home', ownerColonyId: 'planet_gone' });
T('8.1 martwy stamp → fallback per-body na żywą kolonię', resolveHomeColony(stStale) === colLive);

console.log(`\nS3.4c Commit 1 (proxy + stamp) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
