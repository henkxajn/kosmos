// S3.4c Z1 — smoke DIAGNOZY: trade bonus stacji vs echo tradeCapacity widziane przez UI.
// Uruchom: node src/testing/smoke/s34c_z1_tradecap_diagnosis_smoke.mjs
// Cel: udowodnić FAKTY dla T5 — (1) bonus stacji JEST w _allocateTC (live); (2) getTradeCapacity zwraca
// ECHO (col.tradeCapacity) aktualizowane TYLKO w _halfYearlyTick, który early-return'uje przy <2 koloniach
// handlowych → UI pokazuje stale; (3) bonus tylko z AKTYWNYCH modułów (no_crew/no_power = 0).

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

const colonies = new Map();
function setColony(planetId, { pop = 3, prosperity = 50, isOutpost = false } = {}) {
  const col = {
    planetId, systemId: 'sys_home', ownerEmpireId: null, isOutpost,
    civSystem: { population: pop }, prosperitySystem: { prosperity }, buildingSystem: null,
    resourceSystem: { inventory: new Map(), receive() {}, spend() { return true; }, getAmount: () => 0 },
  };
  colonies.set(planetId, col);
  return col;
}
const colMgr = {
  getColony: (id) => colonies.get(id) ?? null,
  getAllColonies: () => [...colonies.values()],
  getPlayerColonies: () => [...colonies.values()],
  getColoniesInSystem: (s) => [...colonies.values()].filter(c => c.systemId === s),
};
window.KOSMOS.colonyManager = colMgr;

const sys = new StationSystem();
window.KOSMOS.stationSystem = sys;
const cts = new CivilianTradeSystem(colMgr);

const mkStation = (id, cfg) => { const s = new Station({ id, name: id, ...cfg }); EntityManager.add(s); return s; };

// ══ 1. Bonus stacji JEST w _allocateTC (live) ═══════════════════════════════════════════════════════
colonies.clear(); EntityManager.clear?.();
const home = setColony('planet_home', { pop: 3, prosperity: 50 });
// baza: 200*3 + floor(50/20)*50 = 600 + 100 = 700
T('1.1 baza _allocateTC = 700 (bez stacji)', cts._allocateTC(home) === 700);
mkStation('stA', { bodyId: 'planet_home', ownerColonyId: 'planet_home', pop: 5, modules: [makeStationModule('trade_module', 1, true)] });
T('1.2 _allocateTC z aktywnym trade_module = 900 (700+200)', cts._allocateTC(home) === 900);
T('1.3 _getStationTradeBonus = 200', cts._getStationTradeBonus(home) === 200);

// ══ 2. Z7 FIX: getTradeCapacity liczy LIVE (_allocateTC), NIE stale echo ════════════════════════════
// Poprzednio zwracał echo `col.tradeCapacity` (undefined bez ticku → 0). Po Z7 = live.
T('2.1 echo col.tradeCapacity niezdefiniowany przed tickiem (pole nietknięte)', home.tradeCapacity === undefined);
T('2.2 Z7: getTradeCapacity() = 900 (LIVE, bonus stacji widoczny natychmiast)', cts.getTradeCapacity('planet_home') === 900);
T('2.3 Z7: brak dywergencji — getTradeCapacity == _allocateTC', cts._allocateTC(home) === cts.getTradeCapacity('planet_home'));

// ══ 3. Single-colony: _halfYearlyTick early-return (routing off), ale display LIVE poprawny ═════════
window.KOSMOS.civMode = true;
cts._halfYearlyTick();   // tylko 1 kolonia → early-return L76 (routing nie biegnie)
T('3.1 po tick z 1 kolonią echo NADAL niezdefiniowany (early-return L76 — routing off)', home.tradeCapacity === undefined);
T('3.2 Z7: getTradeCapacity NADAL 900 (display live niezależny od ticku)', cts.getTradeCapacity('planet_home') === 900);

// ══ 4. getTradeCapacity nieznanej kolonii = 0 (guard) ═══════════════════════════════════════════════
T('4.1 getTradeCapacity(brak kolonii) = 0', cts.getTradeCapacity('planet_nonexistent') === 0);

// ══ 5. Point (d): bonus TYLKO z AKTYWNYCH modułów (no_crew/no_power = 0) ════════════════════════════
colonies.clear(); EntityManager.clear?.();
const home2 = setColony('planet_home', { pop: 3, prosperity: 50 });
mkStation('stInactive', { bodyId: 'planet_home', ownerColonyId: 'planet_home', pop: 0,
  modules: [makeStationModule('trade_module', 2, false)] });   // active:false (symuluje no_crew)
T('5.1 wygaszony trade_module → station.tradeCapacity = 0', EntityManager.get('stInactive').tradeCapacity === 0);
T('5.2 _getStationTradeBonus = 0 (moduł nieaktywny)', cts._getStationTradeBonus(home2) === 0);
T('5.3 _allocateTC = baza 700 (bez wkładu nieaktywnej stacji)', cts._allocateTC(home2) === 700);

console.log(`\nS3.4c Z1/Z7 (trade bonus + getTradeCapacity LIVE) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
console.log('WNIOSEK: bonus jest w _allocateTC (live); po Z7 getTradeCapacity liczy LIVE →');
console.log('  single-colony WIDZI bonus stacji natychmiast, niezależnie od early-return _halfYearlyTick.');
process.exit(fail ? 1 : 0);
