// Orbital Logistics Hub — smoke: SystemPoolService + PooledStore (commit 1+2 core).
// Uruchom: node src/testing/smoke/orbital_logistics_hub_smoke.mjs
// Pokrywa: skład puli (matka+księżyce), draw local→matka→księżyce, deposit lokalny, scalone inventory
// (kontrakt cargo-load), deficit all-or-nothing, izolacja energii, upkeep energii hubu na matce (diff),
// survival reconciliation (dokarm z nadwyżki / pusta pula = głód), blokada (drop pojedynczego księżyca /
// kotwicy = cała pula / rejoin po zdjęciu), zniszczenie stacji (dissolve + stock retained), runtime-only
// (świeża instancja odtwarza pulę), kill-switch OFF, moduł unique guard, serialize modułu.

globalThis.window = globalThis.window ?? {};
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { Station } = await import('../../entities/Station.js');
const { StationSystem } = await import('../../systems/StationSystem.js');
const { SystemPoolService } = await import('../../systems/SystemPoolService.js');
const { PooledStore } = await import('../../utils/PooledStore.js');
const { SHIP_MODULES } = await import('../../data/ShipModulesData.js');
const { STATION_MODULES } = await import('../../data/StationModuleData.js');
const { ProsperitySystem } = await import('../../systems/ProsperitySystem.js');

const WEAPON_MOD = Object.keys(SHIP_MODULES).find(k => SHIP_MODULES[k]?.slotType === 'weapon');
T('0.1 istnieje moduł broni (do testu blokady)', !!WEAPON_MOD);
T('0.2 STATION_MODULES.logistics_hub istnieje + unique + upkeep',
  !!STATION_MODULES.logistics_hub && STATION_MODULES.logistics_hub.unique === true && STATION_MODULES.logistics_hub.motherEnergyUpkeep > 0);

// ── Fake magazyn (kontrakt resourceSystem-podobny wykorzystywany przez PooledStore/SystemPoolService) ──
function makeFakeRS(init = {}, perYear = {}, energyAvail = 1.0) {
  const inventory = new Map(Object.entries(init));
  const producers = new Map();
  return {
    inventory, _perYear: { ...perYear }, _energyAvail: energyAvail, _producers: producers,
    getAmount(id) { return inventory.get(id) ?? 0; },
    getPerYear(id) { return this._perYear[id] ?? 0; },
    getEnergyAvailability() { return this._energyAvail; },
    receive(g) { for (const [k, v] of Object.entries(g)) if (v > 0) inventory.set(k, (inventory.get(k) ?? 0) + v); },
    spend(c) {
      for (const [k, v] of Object.entries(c)) if (v > 0 && (inventory.get(k) ?? 0) < v) return false;
      for (const [k, v] of Object.entries(c)) if (v > 0) inventory.set(k, (inventory.get(k) ?? 0) - v);
      return true;
    },
    canAfford(c) { for (const [k, v] of Object.entries(c)) if (v > 0 && (inventory.get(k) ?? 0) < v) return false; return true; },
    registerProducer(id, rates) { producers.set(id, { ...rates }); },
    removeProducer(id) { producers.delete(id); },
  };
}

// ── Rejestr kolonii + mocki window.KOSMOS ──────────────────────────────────────────────────────────
const colonies = new Map();
function addColony(planetId, init = {}, perYear = {}, energyAvail = 1.0) {
  const col = { planetId, systemId: 'sys_home', ownerEmpireId: null, resourceSystem: makeFakeRS(init, perYear, energyAvail) };
  colonies.set(planetId, col);
  return col;
}
const setInv = (col, obj) => { col.resourceSystem.inventory.clear(); for (const [k, v] of Object.entries(obj)) col.resourceSystem.inventory.set(k, v); };

const vessels = [];
window.KOSMOS.colonyManager = {
  getColony: (id) => colonies.get(id) ?? null,
  getPlayerColonies: () => [...colonies.values()],
  getColoniesInSystem: (sys) => [...colonies.values()].filter(c => (c.systemId ?? 'sys_home') === sys),
};
window.KOSMOS.vesselManager = { getAllVessels: () => vessels };
window.KOSMOS.stationSystem = { getAllStations: () => EntityManager.getByType('station') };

// ── Świat: planeta-matka + 2 księżyce + planeta odległa (poza pulą) + stacja z hubem ────────────────
EntityManager.clear?.();
EntityManager.add({ id: 'planet_home', type: 'planet', name: 'Home', systemId: 'sys_home', x: 0, y: 0 });
EntityManager.add({ id: 'moon_a', type: 'moon', parentPlanetId: 'planet_home', systemId: 'sys_home', x: 5, y: 5 });
EntityManager.add({ id: 'moon_b', type: 'moon', parentPlanetId: 'planet_home', systemId: 'sys_home', x: -5, y: -5 });
EntityManager.add({ id: 'planet_far', type: 'planet', name: 'Far', systemId: 'sys_home', x: 9999, y: 9999 });

const home  = addColony('planet_home');
const moonA = addColony('moon_a');
const moonB = addColony('moon_b');
const far   = addColony('planet_far');

function addHubStation() {
  const st = new Station({
    id: 'st_home', name: 'Hub', bodyId: 'planet_home', systemId: 'sys_home',
    x: 2, y: 2,   // odrębne od planety(0,0)/księżyców — do testu proximity blokady stacji (Issue 3b)
    ownerEmpireId: 'player', ownerColonyId: 'planet_home',
    modules: [{ id: 'm1', moduleType: 'logistics_hub', level: 1, active: true }],
  });
  EntityManager.add(st);
  return st;
}
let station = addHubStation();

const svc = new SystemPoolService();
window.KOSMOS.systemPoolService = svc;   // ścieżka integracji: ResourceSystem/ProsperitySystem sięgają po window.KOSMOS
const refresh = () => { svc._dirty = true; };   // symuluje granicę tury (per-tick invalidację)

// ══ 1. Skład puli ═══════════════════════════════════════════════════════════════════════════════════
refresh();
const pool1 = svc.getPool('planet_home');
T('1.1 pula istnieje przy aktywnym hubie', !!pool1);
T('1.2 pula = matka + 2 księżyce (3 członków)', pool1?.memberColonies.length === 3);
T('1.3 getPool(moon) → ta sama pula', svc.getPool('moon_a') === pool1 && svc.getPool('moon_b') === pool1);
T('1.4 getStore(resSys członka) → PooledStore', svc.getStore(moonA.resourceSystem) instanceof PooledStore);
T('1.5 getStore(colonyId string) → PooledStore', svc.getStore('moon_a') instanceof PooledStore);
T('1.6 kolonia poza pulą → getStore surowy + getPool null',
  svc.getStore(far.resourceSystem) === far.resourceSystem && svc.getPool('planet_far') === null);
T('1.7 getStore(null) → null (graceful)', svc.getStore(null) === null);
T('1.8 getHubLinkInfo(księżyc) = linked ▸ kotwica',
  svc.getHubLinkInfo('moon_a')?.status === 'linked' && svc.getHubLinkInfo('moon_a')?.anchorPlanetId === 'planet_home');
T('1.9 getHubLinkInfo(planeta-kotwica) = linked', svc.getHubLinkInfo('planet_home')?.status === 'linked');
T('1.10 getHubLinkInfo(poza pulą) = null', svc.getHubLinkInfo('planet_far') === null);

// ══ 2. Draw local-first → matka → księżyce ═══════════════════════════════════════════════════════════
setInv(home, { Fe: 100 }); setInv(moonA, { Fe: 50 }); setInv(moonB, { Fe: 0 });
refresh();
const storeA = svc.getStore(moonA.resourceSystem);   // dom = moon_a
T('2.1 pooled getAmount = suma (100+50+0)', storeA.getAmount('Fe') === 150);
T('2.2 pooled canAfford granica', storeA.canAfford({ Fe: 150 }) === true && storeA.canAfford({ Fe: 151 }) === false);
T('2.3 spend 120 = true', storeA.spend({ Fe: 120 }) === true);
T('2.4 local-first: moon_a wyczerpany PRZED matką', moonA.resourceSystem.getAmount('Fe') === 0);
T('2.5 reszta z matki (100 → 30)', home.resourceSystem.getAmount('Fe') === 30);
T('2.6 drugi księżyc nietknięty (miał 0)', moonB.resourceSystem.getAmount('Fe') === 0);

// ══ 3. Deposit ZAWSZE lokalny ════════════════════════════════════════════════════════════════════════
setInv(home, { Fe: 10 }); setInv(moonA, { Fe: 0 });
refresh();
svc.getStore(moonA.resourceSystem).receive({ Fe: 5 });
T('3.1 receive trafia LOKALNIE do moon_a', moonA.resourceSystem.getAmount('Fe') === 5);
T('3.2 matka nietknięta przy deposit', home.resourceSystem.getAmount('Fe') === 10);

// ══ 4. Scalone inventory (kontrakt cargo-load: Vessel._getAvailable czyta store.inventory Map) ════════
setInv(home, { Fe: 100, food: 50 }); setInv(moonA, { Fe: 50 }); setInv(moonB, {});
refresh();
const inv4 = svc.getStore(moonA.resourceSystem).inventory;
T('4.1 inventory to Map', inv4 instanceof Map);
T('4.2 inventory scala materiały puli', inv4.get('Fe') === 150 && inv4.get('food') === 50);

// ══ 5. Deficit — all-or-nothing gdy pula nie pokrywa (draw now, throttle later) ═══════════════════════
setInv(home, { Fe: 10 }); setInv(moonA, { Fe: 5 }); setInv(moonB, {});
refresh();
const storeD = svc.getStore(moonA.resourceSystem);
T('5.1 spend ponad pulę → false', storeD.spend({ Fe: 16 }) === false);
T('5.2 nic nie pobrane (all-or-nothing)', home.resourceSystem.getAmount('Fe') === 10 && moonA.resourceSystem.getAmount('Fe') === 5);

// ══ 6. Izolacja energii (NIGDY poolowana — delegacja do domu) ═════════════════════════════════════════
moonA.resourceSystem._energyAvail = 0.4;   // brownout księżyca
home.resourceSystem._energyAvail  = 1.0;
refresh();
T('6.1 getEnergyAvailability księżyca = jego własne (nie uśrednione)', svc.getStore(moonA.resourceSystem).getEnergyAvailability() === 0.4);
T('6.2 matka niezależnie 1.0', svc.getStore(home.resourceSystem).getEnergyAvailability() === 1.0);
moonA.resourceSystem._energyAvail = 1.0;

// ══ 7. Upkeep energii hubu na matce (rejestrowany jak upkeep budynku, diff bez churn) ═════════════════
refresh(); svc._ensureFresh(); svc._syncHubEnergy();
const up = STATION_MODULES.logistics_hub.motherEnergyUpkeep;
T('7.1 hub rejestruje ujemną energię na matce', home.resourceSystem._producers.get('logi_hub_st_home')?.energy === -up);
// druga synchronizacja bez zmian → brak duplikacji (diff)
svc._syncHubEnergy();
T('7.2 idempotentne (nadal jeden wpis)', home.resourceSystem._producers.has('logi_hub_st_home'));
// hub nieaktywny → producent usunięty
station.modules[0].active = false;
svc._syncHubEnergy();
T('7.3 hub zgaszony → upkeep zdjęty z matki', !home.resourceSystem._producers.has('logi_hub_st_home'));
station.modules[0].active = true;

// ══ 8. Survival reconciliation — FOOD i WATER × {konsument (POP), zero-konsumpcji (outpost)} ══════════
// §7 dokarmia TYLKO członków z UJEMNYM getPerYear (konsumpcja POP). Outpost = pop=0 → rates 0 (potwierdzone:
// ColonyManager.createOutpost:463 CivilizationSystem({population:0}) + CivilizationSystem._syncConsumption:1855
// = -(pop×POP_CONSUMPTION)) → getPerYear('water')=0 → BRAK potrzeby → nie dokarmiany (to NIE bug — to semantyka
// outpostu; §7 to fallback KONSUMPCJI, nie wyrównywanie stanów). CivilianTradeSystem nieobecny (trade inert).
setInv(home, { food: 1000, water: 1000 }); home.resourceSystem._perYear = {};                        // matka: nadwyżka
setInv(moonA, { food: 0, water: 0 });      moonA.resourceSystem._perYear = { food: -8, water: -6 };   // KONSUMENT (POP)
setInv(moonB, { food: 0, water: 0 });      moonB.resourceSystem._perYear = {};                        // zero-konsumpcji (outpost)
refresh(); svc._ensureFresh(); svc._reconcileSurvival(1);
T('8.1 konsument dokarmiony FOOD z matki', moonA.resourceSystem.getAmount('food') === 8);
T('8.2 konsument dokarmiony WATER z matki', moonA.resourceSystem.getAmount('water') === 6);
T('8.3 matka oddała food+water', home.resourceSystem.getAmount('food') === 992 && home.resourceSystem.getAmount('water') === 994);
T('8.4 zero-konsumpcji (outpost) NIE dokarmiany — brak potrzeby food/water',
  moonB.resourceSystem.getAmount('food') === 0 && moonB.resourceSystem.getAmount('water') === 0);
// pusta pula → konsument głoduje (bez zmian — normalne wygłodzenie)
setInv(home, { food: 0, water: 0 }); setInv(moonA, { food: 0, water: 0 });
refresh(); svc._ensureFresh(); svc._reconcileSurvival(1);
T('8.5 pusta pula → konsument zostaje na 0 (food+water)',
  moonA.resourceSystem.getAmount('food') === 0 && moonA.resourceSystem.getAmount('water') === 0);
moonA.resourceSystem._perYear = {}; moonB.resourceSystem._perYear = {};

// ══ 9. Blokada — wrogi uzbrojony statek na orbicie ════════════════════════════════════════════════════
setInv(home, { Fe: 100 }); setInv(moonA, { Fe: 50 }); setInv(moonB, { Fe: 10 });
vessels.length = 0;
vessels.push({ id: 'enemy1', isEnemy: true, ownerEmpireId: 'ai_1', modules: [WEAPON_MOD], systemId: 'sys_home',
  position: { x: 5, y: 5, state: 'orbiting', dockedAt: 'moon_a' } });
refresh();
T('9.1 isBlockaded(moon_a) = true (wrogi orbiter)', svc.isBlockaded(EntityManager.get('moon_a')) === true);
T('9.2 isBlockaded(planet) = false', svc.isBlockaded(EntityManager.get('planet_home')) === false);
const pool9 = svc.getPool('planet_home');
T('9.3 pula = matka + moon_b (moon_a wypadł)', pool9?.memberColonies.length === 2 && svc.getPool('moon_a') === null);
T('9.4 moon_b nadal w puli', svc.getPool('moon_b') === pool9);
T('9.7 getHubLinkInfo(zablokowany księżyc) = severed', svc.getHubLinkInfo('moon_a')?.status === 'severed');
T('9.8 getHubLinkInfo(moon_b) = linked', svc.getHubLinkInfo('moon_b')?.status === 'linked');

// nieuzbrojony wróg NIE blokuje
vessels[0].modules = [];
refresh();
T('9.5 wróg bez broni NIE blokuje', svc.isBlockaded(EntityManager.get('moon_a')) === false);
vessels[0].modules = [WEAPON_MOD];

// free-float (dockedAt null) — blokada przez BLISKOŚĆ, przypisana do NAJBLIŻSZEGO ciała (Issue 3b)
vessels[0].position = { x: 5, y: 5, state: 'orbiting', dockedAt: null };   // przy księżycu
refresh();
T('9.6 free-float ≤0.5 AU blokuje księżyc (proximity)', svc.isBlockaded(EntityManager.get('moon_a')) === true);
T('9.6b free-float przy księżycu NIE blokuje planety (nearest-body; księżyc <0.5 AU od planety)',
  svc.isBlockaded(EntityManager.get('planet_home')) === false);
vessels[0].position = { x: 0, y: 0, state: 'orbiting', dockedAt: null };   // przy planecie
refresh();
T('9.6c free-float przy planecie blokuje planetę', svc.isBlockaded(EntityManager.get('planet_home')) === true);
T('9.6d ...i NIE blokuje księżyca (nearest-body)', svc.isBlockaded(EntityManager.get('moon_a')) === false);
vessels[0].position = { x: 2, y: 2, state: 'orbiting', dockedAt: null };   // przy stacji (2,2)
refresh();
T('9.6e free-float przy stacji blokuje stację', svc.isBlockaded(station) === true);

// ══ 10. Blokada kotwicy → cała pula znika ════════════════════════════════════════════════════════════
vessels[0].position = { x: 0, y: 0, state: 'orbiting', dockedAt: 'planet_home' };
refresh();
T('10.1 blokada planety-kotwicy dissolve całej puli', svc.getPool('planet_home') === null);

// ══ 11. Blokada zdjęta → rejoin ══════════════════════════════════════════════════════════════════════
vessels.length = 0;
refresh();
T('11.1 pula wraca po zdjęciu blokady (3 członków)', svc.getPool('planet_home')?.memberColonies.length === 3);

// ══ 12. Zniszczenie stacji → dissolve, stock retained ════════════════════════════════════════════════
setInv(home, { Fe: 100 }); setInv(moonA, { Fe: 50 });
EntityManager.remove('st_home');
refresh();
T('12.1 brak hubu → pula znika', svc.getPool('planet_home') === null);
T('12.2 stock fizyczny zachowany', home.resourceSystem.getAmount('Fe') === 100 && moonA.resourceSystem.getAmount('Fe') === 50);
T('12.3 getStore poza pulą = surowy', svc.getStore(moonA.resourceSystem) === moonA.resourceSystem);

// ══ 13. Runtime-only — świeża instancja odtwarza pulę + serialize modułu ═════════════════════════════
station = addHubStation();
const svc2 = new SystemPoolService();   // symuluje instancję po wczytaniu save
svc2._dirty = true;
T('13.1 świeża instancja odtwarza pulę z modułów stacji', svc2.getPool('planet_home')?.memberColonies.length === 3);
const ser = new StationSystem().serialize().find(r => r.id === 'st_home');
T('13.2 serialize stacji niesie moduł logistics_hub',
  !!ser && ser.modules.some(m => m.moduleType === 'logistics_hub'));

// ══ 14. Kill-switch OFF → zero poolowania ════════════════════════════════════════════════════════════
GAME_CONFIG.FEATURES.orbitalLogisticsHub = false;
T('14.1 flag OFF → getStore surowy', svc2.getStore(moonA.resourceSystem) === moonA.resourceSystem);
T('14.2 flag OFF → getPool null', svc2.getPool('planet_home') === null);
T('14.3 flag OFF → isBlockaded false', svc2.isBlockaded(EntityManager.get('moon_a')) === false);
GAME_CONFIG.FEATURES.orbitalLogisticsHub = true;

// ══ 15. Severed PRZETRWA rozpuszczenie puli (planeta + JEDEN księżyc, zablokowany) — regresja Issue 2 ══
// Blokada jedynego księżyca → pula <2 członków → rozpuszczona, ale 'severed' MUSI działać (via _hubAnchors).
colonies.delete('moon_b');   // zostaje planeta + moon_a (jedyny księżyc)
setInv(home, {}); setInv(moonA, {});
vessels.length = 0;
vessels.push({ id: 'e2', isEnemy: true, ownerEmpireId: 'ai_1', modules: [WEAPON_MOD], systemId: 'sys_home',
  position: { x: 5, y: 5, state: 'orbiting', dockedAt: 'moon_a' } });
refresh();
T('15.1 pula rozpuszczona (1 członek po blokadzie jedynego księżyca)', svc.getPool('planet_home') === null);
T('15.2 mimo to księżyc = severed (via _hubAnchors, nie via przetrwałą pulę)',
  svc.getHubLinkInfo('moon_a')?.status === 'severed');
colonies.set('moon_b', moonB); vessels.length = 0;   // restore

// ══ 16. Kill-switch toggle — dirty-on-disable hardening (ITEM 1): OFF-tick czyści pule + dirty,
//        re-enable ODBUDOWUJE nawet BEZ ręcznego _dirty. ══
refresh();
T('16.1 pula obecna (flag true)', svc.getPool('planet_home')?.memberColonies.length === 3);
GAME_CONFIG.FEATURES.orbitalLogisticsHub = false;
T('16.2 pula null (flag false)', svc.getPool('planet_home') === null);
svc._onTick(1);   // tick podczas wyłączenia → czyści pule + ustawia dirty
T('16.3 OFF-tick: pule wyczyszczone + dirty=true', svc._byColonyId.size === 0 && svc._dirty === true);
GAME_CONFIG.FEATURES.orbitalLogisticsHub = true;
T('16.4 re-enable ODBUDOWUJE bez ręcznego _dirty', svc.getPool('planet_home')?.memberColonies.length === 3);

// ══ 17. poolCoversSurvival — tłumienie fałszywej flagi niedoboru survival (ITEM 2) ══
setInv(home, { water: 500 }); setInv(moonA, { water: 0 }); setInv(moonB, {});
refresh();
T('17.1 pooled + rodzeństwo ma wodę → covered (tłum niedobór)', svc.poolCoversSurvival(moonA.resourceSystem, 'water') === true);
setInv(home, { water: 0 }); setInv(moonB, {});
refresh();
T('17.2 pula pusta z wody → NIE covered (realny głód → flaga zostaje)', svc.poolCoversSurvival(moonA.resourceSystem, 'water') === false);
T('17.3 kolonia spoza puli (severed/nie-pooled) → NIE covered', svc.poolCoversSurvival(far.resourceSystem, 'water') === false);

// ══ 18. Prosperity survival scarcity — tłumienie kary dla członka puli, reużycie poolCoversSurvival ══
//   pooled+fed → potrzeba spełniona (ratio 1, brak kary); pula pusta / link zerwany / nie-pooled → kara.
moonA.resourceSystem._producers = new Map([['cons', { water: -6, food: -6 }]]);   // konsument (dla _getPerYear)
far.resourceSystem._producers  = new Map([['cons', { water: -6, food: -6 }]]);
const psM = new ProsperitySystem(moonA.resourceSystem, { population: 8 }, null, EntityManager.get('moon_a'));
const psF = new ProsperitySystem(far.resourceSystem,  { population: 8 }, null, EntityManager.get('planet_far'));
// (a) pooled + rodzeństwo ma wodę → kara wody stłumiona
setInv(home, { water: 500 }); setInv(moonA, { water: 0 }); setInv(moonB, {}); vessels.length = 0;
refresh();
const satCovered = psM._calcSurvivalSatisfaction();
// (b) pula PUSTA z wody → kara wraca
setInv(home, { water: 0 });
refresh();
const satEmpty = psM._calcSurvivalSatisfaction();
// (c) non-pooled kolonia (far, woda 0) → baseline (kara)
setInv(far, { water: 0 });
const satFar = psF._calcSurvivalSatisfaction();
// (d) link ZERWANY (blokada moon_a) mimo wody w puli → kara (odcięty od puli)
setInv(home, { water: 500 });
vessels.push({ id: 'e3', isEnemy: true, ownerEmpireId: 'ai_1', modules: [WEAPON_MOD], systemId: 'sys_home',
  position: { x: 5, y: 5, state: 'orbiting', dockedAt: 'moon_a' } });
refresh();
const satSevered = psM._calcSurvivalSatisfaction();
vessels.length = 0;
T('18.1 pooled fed → survival-satysfakcja wyższa (kara stłumiona)', satCovered > satEmpty);
T('18.2 pula pusta → kara jak non-pooled baseline', satEmpty === satFar);
T('18.3 link zerwany (blokada) mimo wody w puli → kara (odcięty)', satSevered === satFar);

// NEEDS-row pool-aware (ITEM 5) — _calcNeeds bez konstruktora (Object.create — unika DOM/canvas)
const { PopulationOverlay } = await import('../../ui/PopulationOverlay.js');
const pov = Object.create(PopulationOverlay.prototype);
setInv(home, { water: 500, food: 500 }); setInv(moonA, { water: 0, food: 0 }); setInv(moonB, {}); vessels.length = 0;
refresh();
const needsCov = pov._calcNeeds(null, moonA.resourceSystem, 8);   // [food, water, energy]
T('18.4 NEEDS water pooled → ratio 1 + flaga pooled (brak fałszywego deficytu)',
  needsCov[1].ratio === 1 && needsCov[1].pooled === true);
setInv(home, { water: 0, food: 0 }); refresh();
const needsEmpty = pov._calcNeeds(null, moonA.resourceSystem, 8);
T('18.5 NEEDS water pula pusta → deficyt (ratio<0.5, pooled false)',
  needsEmpty[1].ratio < 0.5 && !needsEmpty[1].pooled);

moonA.resourceSystem._producers = new Map(); far.resourceSystem._producers = new Map();

console.log(`\nOrbital Logistics Hub smoke: PASS ${pass} / FAIL ${fail}  (${pass}/${pass + fail})`);
process.exit(fail ? 1 : 0);
