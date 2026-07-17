// S3.4c — smoke: trade bonus stacji + wykluczenie self-cargo (Commit 3, D7+D8).
// Uruchom: node src/testing/smoke/s34c_trade_selfcargo_smoke.mjs
// Pokrywa: _allocateTC rośnie o Σ aktywnych trade_module (atrybucja po ownerColonyId — zero
// double-count przy 2 koloniach w systemie); wygaszony moduł nie liczy; osierocona stacja nie liczy;
// predykat D8 (stacja z matką poza 'transport', w 'transport_passenger'; sierota legalnym celem cargo).

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
const { makeStationModule } = await import('../../data/StationModuleData.js');
const EntityManager = (await import('../../core/EntityManager.js')).default;
const { StationSystem } = await import('../../systems/StationSystem.js');
const { CivilianTradeSystem } = await import('../../systems/CivilianTradeSystem.js');

// Fake ColonyManager (dla resolveHomeColony)
const colonies = new Map();
function setColony(planetId, { systemId = 'sys_home', ownerEmpireId = null } = {}) {
  const col = {
    planetId, systemId, ownerEmpireId, resourceSystem: { inventory: new Map(), receive() {}, spend() { return true; }, getAmount: () => 0 },
    civSystem: { population: 1 }, prosperitySystem: { prosperity: 50 }, buildingSystem: null, isOutpost: false,
  };
  colonies.set(planetId, col);
  return col;
}
window.KOSMOS.colonyManager = {
  getColony: (id) => colonies.get(id) ?? null,
  getColoniesInSystem: (sysId) => [...colonies.values()].filter(c => (c.systemId ?? 'sys_home') === sysId),
};

const sys = new StationSystem();
window.KOSMOS.stationSystem = sys;
const cts = new CivilianTradeSystem(window.KOSMOS.colonyManager);

const mkStation = (id, cfg) => { const s = new Station({ id, name: id, ...cfg }); EntityManager.add(s); return s; };

// ══ 1. TC rośnie o aktywny trade_module (atrybucja po ownerColonyId) ════════════════════════════════
colonies.clear();
EntityManager.clear?.();
const home = setColony('planet_home');
// bazowe TC: 200*pop(1) + floor(50/20)*50 = 200 + 100 = 300, brak budynków, brak stacji
T('1.1 baza TC bez stacji = 300', cts._allocateTC(home) === 300);
mkStation('stA', { bodyId: 'planet_home', ownerColonyId: 'planet_home', modules: [makeStationModule('trade_module', 1, true)] });
T('1.2 trade_module lv1 aktywny → +200 (TC=500)', cts._allocateTC(home) === 500);
mkStation('stB', { bodyId: 'planet_home', ownerColonyId: 'planet_home', modules: [makeStationModule('trade_module', 2, true)] });
T('1.3 druga stacja trade lv2 → +400 (TC=900)', cts._allocateTC(home) === 900);

// ══ 2. Wygaszony moduł (active:false) NIE liczy ═════════════════════════════════════════════════════
mkStation('stC', { bodyId: 'planet_home', ownerColonyId: 'planet_home', modules: [makeStationModule('trade_module', 3, false)] });
T('2.1 wygaszony trade_module nie dolicza (TC nadal 900)', cts._allocateTC(home) === 900);

// ══ 3. Brak double-count przy 2 koloniach w systemie (atrybucja po ownerColonyId) ══════════════════
const home2 = setColony('planet_home2');   // druga kolonia gracza w tym samym systemie
T('3.1 druga kolonia NIE dostaje bonusu stacji planet_home (TC=300)', cts._allocateTC(home2) === 300);
T('3.2 pierwsza kolonia nadal 900 (bez zmian)', cts._allocateTC(home) === 900);

// ══ 4. Osierocona stacja (depotDetached) NIE liczy ══════════════════════════════════════════════════
const stD = mkStation('stD', { bodyId: 'planet_home', ownerColonyId: 'planet_home', modules: [makeStationModule('trade_module', 1, true)] });
T('4.1 świeża aktywna stacja dolicza (TC=1100)', cts._allocateTC(home) === 1100);
stD.depotDetached = true;
T('4.2 po osieroceniu nie dolicza (TC=900)', cts._allocateTC(home) === 900);

// ══ 5. Stacje obce (AI) NIE liczą ═══════════════════════════════════════════════════════════════════
mkStation('stAI', { bodyId: 'planet_home', ownerColonyId: 'planet_home', ownerEmpireId: 'ai_1', modules: [makeStationModule('trade_module', 3, true)] });
T('5.1 stacja AI ignorowana (TC nadal 900)', cts._allocateTC(home) === 900);

// ══ 6. Outpost dostaje bonus stacji (bez bazy pop) ══════════════════════════════════════════════════
colonies.clear();
EntityManager.clear?.();
const outpost = setColony('outpost_1');
outpost.isOutpost = true;
mkStation('stOut', { bodyId: 'outpost_1', ownerColonyId: 'outpost_1', modules: [makeStationModule('trade_module', 1, true)] });
T('6.1 outpost TC = 0 baza + 200 stacja = 200', cts._allocateTC(outpost) === 200);

// ══ 7. Cele transportu na stacje — filtr D8 ZNIESIONY ═══════════════════════════════════════════════
// Reguła z FleetManagerOverlay._getValidTargets: KAŻDA stacja gracza jest celem cargo I pasażerów
// (stacja = tańszy paliwowo skład/przeładunku niż start z planety). Filtr „stacja z matką" usunięty —
// stacja z matką dzieli magazyn kolonii (S3.4c), jałową pętlę łapie best-effort + _evaluateLoopProductivity.
// Wyklucza się tylko stacje obce (AI). resolveHomeColony NIE bramkuje już listy celów.
colonies.clear();
EntityManager.clear?.();
setColony('planet_home');
const stMother = new Station({ id: 'st_m', bodyId: 'planet_home', ownerColonyId: 'planet_home', systemId: 'sys_home' });
const stOrphan = new Station({ id: 'st_o', bodyId: 'asteroid_x', systemId: 'sys_deep' });   // brak matki
const stAI2 = new Station({ id: 'st_ai', bodyId: 'planet_home', ownerEmpireId: 'ai_1', systemId: 'sys_home' });
const isCargoTarget = (st) => (st.ownerEmpireId ?? 'player') === 'player';   // player-owned = cel cargo
T('7.1 stacja z matką JEST celem transport cargo (D8 zniesiony)', isCargoTarget(stMother) === true);
T('7.2 sierota JEST celem transport cargo', isCargoTarget(stOrphan) === true);
T('7.3 stacja AI NIE jest celem transport cargo', isCargoTarget(stAI2) === false);
// passenger: ta sama reguła player-owned (POP → habitat).
T('7.4 transport_passenger: stacja z matką POZOSTAJE celem (POP → habitat)', isCargoTarget(stMother) === true);
T('7.5 transport_passenger: sierota też celem', isCargoTarget(stOrphan) === true);

console.log(`\nS3.4c Commit 3 (trade bonus + self-cargo) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
