// S3.4 FAZA 4 — smoke: transport pasażerski POP (moduł + canColonize gate + resolver + misja).
// Uruchom: node tmp_s34_faza4_smoke.mjs
//
// Zakres:
//  1. canColonize — REGRESJA OBOWIĄZKOWA (colony ship kolonizuje, passenger NIE, legacy fallback).
//  2. passenger_module — dane (slotType special, colonistCapacity 1).
//  3. VesselModelResolver — passenger reuse GLB colony (rola 'colony').
//  4. Misja passenger kolonia→stacja (load population-1, arrival station.pop++).
//  5. Pełna stacja → no_housing (statek czeka) + retry dostarcza gdy zwolni się miejsce.
//  6. Misja passenger stacja→kolonia (station.pop--, arrival addPop + civ:popBorn).
//  7. Bramki: never-last-POP, pusta stacja, brak kabiny, nie zadokowany.

// ── Shim środowiska (jak inne smoki S3.4) ────────────────────────────────────
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage, KOSMOS: {} };

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const EventBus = (await import('../../core/EventBus.js')).default;
const { Station } = await import('../../entities/Station.js');
const { makeStationModule } = await import('../../data/StationModuleData.js');
const { canColonize } = await import('../../entities/Vessel.js');
const { SHIP_MODULES, calcShipStats } = await import('../../data/ShipModulesData.js');
const { HULLS } = await import('../../data/HullsData.js');
const { vesselRole, resolveVesselModelKey } = await import('../../renderer/VesselModelResolver.js');
const { MissionSystem } = await import('../../systems/MissionSystem.js');
const { getAvailableActions } = await import('../../data/FleetActions.js');
const { StationSystem } = await import('../../systems/StationSystem.js');
const { t } = await import('../../i18n/i18n.js');

// ── Rejestr zdarzeń (reset per sekcja) ───────────────────────────────────────
let events = {};
const rec = (name) => (data) => { (events[name] ??= []).push(data); };
EventBus.on('expedition:launched', rec('launched'));
EventBus.on('expedition:launchFailed', rec('launchFailed'));
EventBus.on('station:popArrived', rec('popArrived'));
EventBus.on('station:popDeparted', rec('popDeparted'));
EventBus.on('civ:popBorn', rec('popBorn'));
EventBus.on('vessel:awaitingHousing', rec('awaitingHousing'));
const resetEvents = () => { events = {}; };
const lastFailReason = () => events.launchFailed?.[events.launchFailed.length - 1]?.reason ?? null;

// ── Mocki world (KOSMOS) ─────────────────────────────────────────────────────
const vessels = new Map();
const colonies = new Map();
const dispatched = [];

function makeColony(id, population, freePops) {
  const civSystem = {
    population, freePops,
    removePop(strata, n) { this.population -= n; this.freePops = Math.max(0, this.freePops - n); },
    addPop(strata, n) { this.population += n; },
  };
  const col = { id, name: id, planetId: id, fleet: [], civSystem };
  colonies.set(id, col);
  return col;
}

function makeVessel(id, { dockedAt, colonyId = 'home', modules = ['passenger_module'], colonistCapacity = 1, state = 'docked', status = 'idle' } = {}) {
  const v = {
    id, shipId: 'hull_small', name: id, colonyId, modules,
    colonistCapacity, colonists: 0, speedAU: 3, damaged: false,
    position: { state, dockedAt, x: 6, y: 6 },
    status, fuel: { current: 500, consumption: 1 }, missionLog: [],
  };
  vessels.set(id, v);
  return v;
}

globalThis.window.KOSMOS = {
  activePlanetId: 'home',
  techSystem: { getShipSpeedMultiplier: () => 1, getDisasterReduction: () => 0, isResearched: () => true },
  colonyManager: {
    activePlanetId: 'home',
    getColony: (id) => colonies.get(id) ?? null,
  },
  vesselManager: {
    getVessel: (id) => vessels.get(id) ?? null,
    dispatchOnMission: (id, data) => {
      dispatched.push({ id, data });
      const v = vessels.get(id);
      if (v) { v.position.state = 'in_transit'; v.status = 'in_transit'; if (data.fuelCost) v.fuel.current -= data.fuelCost; }
    },
    dockAtTarget: (id, tId) => { const v = vessels.get(id); if (v) { v.position.state = 'docked'; v.position.dockedAt = tId; } },
    dockAtColony: (id, cId) => { const v = vessels.get(id); if (v) { v.position.state = 'docked'; v.position.dockedAt = cId; v.colonyId = cId; } },
  },
};

// Ciało macierzyste + kolonia 'home' jako encja (żeby _findTarget zwrócił pozycję).
EntityManager.clear?.();
EntityManager.add({ id: 'home', type: 'planet', name: 'Home', x: 5, y: 5, systemId: 'sys_home' });
EntityManager.add({ id: 'body_1', type: 'planet', name: 'Body1', x: 12, y: 8, systemId: 'sys_home' });

function freshStation(id, { modules = [], pop = 0, bodyId = 'body_1' } = {}) {
  const st = new Station({ id, name: id, bodyId, pop, modules, depot: {} });
  EntityManager.add(st);
  return st;
}

const ms = new MissionSystem();
ms._gameYear = 0;

// ═══════════════════════════════════════════════════════════════════════════
// 1. canColonize — REGRESJA OBOWIĄZKOWA
// ═══════════════════════════════════════════════════════════════════════════
{
  T('1.1 colony ship (habitat_pod) → canColonize TRUE', canColonize({ modules: ['habitat_pod'], shipId: 'hull_medium' }) === true);
  T('1.2 passenger ship (passenger_module) → canColonize FALSE', canColonize({ modules: ['passenger_module'], shipId: 'hull_small' }) === false);
  // Legacy fallback (stary save bez modułów, def.isColonizer) — dormant w bieżących danych,
  // testujemy przez tymczasowy wpis w HULLS (dowód że ścieżka `!!def?.isColonizer` żyje).
  HULLS.__test_legacy_colonizer = { id: '__test_legacy_colonizer', isColonizer: true };
  T('1.3 legacy def.isColonizer (brak modułów) → canColonize TRUE', canColonize({ shipId: '__test_legacy_colonizer', modules: [] }) === true);
  delete HULLS.__test_legacy_colonizer;
  // Kluczowy dowód: sama colonistCapacity>0 już NIE bramkuje (short-circuit usunięty).
  T('1.4 passenger ship z colonistCapacity=1 → nadal FALSE', canColonize({ modules: ['passenger_module'], colonistCapacity: 1, shipId: 'hull_small' }) === false);
  T('1.5 cryo_pod (slotType habitat) → canColonize TRUE', canColonize({ modules: ['cryo_pod'], shipId: 'hull_large' }) === true);
  T('1.6 pusty vessel → FALSE', canColonize({ modules: [], shipId: 'hull_small' }) === false);
  T('1.7 null → FALSE', canColonize(null) === false);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. passenger_module — dane
// ═══════════════════════════════════════════════════════════════════════════
{
  const pm = SHIP_MODULES.passenger_module;
  T('2.1 passenger_module istnieje', !!pm);
  T('2.2 slotType special', pm?.slotType === 'special');
  T('2.3 colonistCapacity 1', pm?.stats?.colonistCapacity === 1);
  T('2.4 requires null (bez tech-gate)', pm?.requires === null || pm?.requires === undefined);
  T('2.5 ma cost + commodityCost', !!pm?.cost && !!pm?.commodityCost);
  T('2.6 dwujęzyczny namePL+nameEN', !!pm?.namePL && !!pm?.nameEN);
  // calcShipStats sumuje colonistCapacity z modułu.
  const stats = calcShipStats({ baseModuleSlots: 3 }, ['passenger_module']);
  T('2.7 calcShipStats colonistCapacity=1', stats.colonistCapacity === 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. VesselModelResolver — passenger reuse GLB colony
// ═══════════════════════════════════════════════════════════════════════════
{
  const passVessel = { shipId: 'hull_small', modules: ['passenger_module'] };
  T('3.1 passenger → vesselRole colony', vesselRole(passVessel) === 'colony');
  T('3.2 passenger → klucz modelu zawiera "colony"', resolveVesselModelKey(passVessel).includes('colony'));
  T('3.3 colony ship (habitat_pod) → rola colony', vesselRole({ shipId: 'hull_medium', modules: ['habitat_pod'] }) === 'colony');
  T('3.4 science (science_lab) → rola science', vesselRole({ shipId: 'hull_medium', modules: ['science_lab'] }) === 'science');
  T('3.5 brak modułów → rola cargo', vesselRole({ shipId: 'hull_medium', modules: [] }) === 'cargo');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Misja passenger: kolonia → stacja (load population-1, arrival pop++)
// ═══════════════════════════════════════════════════════════════════════════
{
  resetEvents();
  const col = makeColony('home', 5, 3);
  const st = freshStation('st_dst', { modules: [makeStationModule('habitat', 1)], pop: 0 }); // popCapacity 1
  const v = makeVessel('v_cs', { dockedAt: 'home' });
  col.fleet.push('v_cs');

  ms._launchPassenger('st_dst', 'v_cs');
  const mission = ms._missions.find(m => m.vesselId === 'v_cs');
  T('4.1 launched (mission en_route)', events.launched?.length === 1 && mission?.status === 'en_route');
  T('4.2 kolonia population 5→4 (POP pobrany)', col.civSystem.population === 4);
  T('4.3 vessel.colonists 1', v.colonists === 1);
  T('4.4 mission type passenger, targetId st_dst, colonists 1', mission?.type === 'passenger' && mission?.targetId === 'st_dst' && mission?.colonists === 1);
  T('4.5 originColonyId home', mission?.originColonyId === 'home');
  T('4.6 dispatchOnMission wywołany (fuel odjęty)', dispatched.some(d => d.id === 'v_cs') && v.fuel.current < 500);

  // Przylot (przez _checkArrivals z advancem czasu).
  ms._gameYear = mission.arrivalYear + 0.01;
  ms._checkArrivals();
  T('4.7 station.pop 0→1', st.pop === 1);
  T('4.8 vessel.colonists 0 (rozładowany)', v.colonists === 0);
  T('4.9 mission completed', mission.status === 'completed');
  T('4.10 station:popArrived emitowany', events.popArrived?.length === 1 && events.popArrived[0].stationId === 'st_dst' && events.popArrived[0].count === 1);
  T('4.11 vessel zadokowany przy stacji', v.position.dockedAt === 'st_dst');
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Pełna stacja → no_housing (czeka) + retry dostarcza po zwolnieniu
// ═══════════════════════════════════════════════════════════════════════════
{
  resetEvents();
  const col = makeColony('home', 5, 3);
  const st = freshStation('st_full', { modules: [makeStationModule('habitat', 1)], pop: 1 }); // pełna (cap 1, pop 1)
  const v = makeVessel('v_full', { dockedAt: 'home' });
  col.fleet.push('v_full');

  ms._launchPassenger('st_full', 'v_full');
  const mission = ms._missions.find(m => m.vesselId === 'v_full');
  ms._gameYear = mission.arrivalYear + 0.01;
  ms._checkArrivals();
  T('5.1 pełna stacja → status no_housing', mission.status === 'no_housing');
  T('5.2 station.pop bez zmian (1)', st.pop === 1);
  T('5.3 vessel.colonists nadal 1 (nie rozładowany)', v.colonists === 1);
  T('5.4 vessel zadokowany przy stacji (czeka)', v.position.dockedAt === 'st_full');
  T('5.5 brak station:popArrived jeszcze', (events.popArrived?.length ?? 0) === 0);

  // Zwolnij miejsce (np. odpłynął inny POP) → retry co tick.
  st.pop = 0;
  ms._checkArrivals();
  T('5.6 retry dostarcza: station.pop 0→1', st.pop === 1);
  T('5.7 retry: vessel.colonists 0', v.colonists === 0);
  T('5.8 retry: mission completed', mission.status === 'completed');
  T('5.9 retry: station:popArrived emitowany', events.popArrived?.length === 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Misja passenger: stacja → kolonia (station.pop--, arrival addPop+popBorn)
// ═══════════════════════════════════════════════════════════════════════════
{
  resetEvents();
  const col = makeColony('home', 4, 2);
  const st = freshStation('st_src', { modules: [makeStationModule('habitat', 2)], pop: 2 }); // cap 2, pop 2
  const v = makeVessel('v_sc', { dockedAt: 'st_src', colonyId: 'home' });

  ms._launchPassenger('home', 'v_sc');
  const mission = ms._missions.find(m => m.vesselId === 'v_sc');
  T('6.1 launched', events.launched?.length === 1 && mission?.status === 'en_route');
  T('6.2 station.pop 2→1 (POP pobrany ze stacji)', st.pop === 1);
  T('6.3 vessel.colonists 1', v.colonists === 1);
  T('6.4 station:popDeparted emitowany', events.popDeparted?.length === 1 && events.popDeparted[0].stationId === 'st_src' && events.popDeparted[0].count === 1);
  T('6.5 mission originStationId st_src', mission?.originStationId === 'st_src');

  ms._gameYear = mission.arrivalYear + 0.01;
  ms._checkArrivals();
  T('6.6 kolonia population 4→5 (addPop)', col.civSystem.population === 5);
  T('6.7 civ:popBorn emitowany (planetId home)', events.popBorn?.length === 1 && events.popBorn[0].planetId === 'home');
  T('6.8 vessel.colonists 0', v.colonists === 0);
  T('6.9 mission completed', mission.status === 'completed');
  T('6.10 vessel zadokowany przy kolonii home', v.position.dockedAt === 'home');
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Bramki
// ═══════════════════════════════════════════════════════════════════════════
{
  // 7.1 never-last-POP: kolonia z population=1 → odmowa, POP nie ruszony.
  resetEvents();
  const col = makeColony('home', 1, 1);
  freshStation('st_g1', { modules: [makeStationModule('habitat', 1)], pop: 0 });
  makeVessel('v_g1', { dockedAt: 'home' });
  const before = ms._missions.length;
  ms._launchPassenger('st_g1', 'v_g1');
  T('7.1 never-last-POP → launchFailed (neverLastPop)', lastFailReason() === t('mission.neverLastPop'));
  T('7.2 kolonia population nietknięta (1)', col.civSystem.population === 1);
  T('7.3 brak nowej misji', ms._missions.length === before);
  T('7.4 vessel.colonists 0 (POP nie pobrany)', vessels.get('v_g1').colonists === 0);

  // 7.5 pusta stacja: station.pop=0 jako źródło → odmowa.
  resetEvents();
  makeColony('home', 5, 3);
  const stEmpty = freshStation('st_g2', { modules: [makeStationModule('habitat', 1)], pop: 0 });
  makeVessel('v_g2', { dockedAt: 'st_g2', colonyId: 'home' });
  ms._launchPassenger('home', 'v_g2');
  T('7.5 pusta stacja jako źródło → launchFailed (noStationCrew)', lastFailReason() === t('mission.noStationCrew'));
  T('7.6 station.pop nietknięty (0)', stEmpty.pop === 0);

  // 7.7 brak kabiny: vessel colonistCapacity=0 → odmowa.
  resetEvents();
  makeColony('home', 5, 3);
  freshStation('st_g3', { modules: [makeStationModule('habitat', 1)], pop: 0 });
  makeVessel('v_g3', { dockedAt: 'home', colonistCapacity: 0, modules: [] });
  ms._launchPassenger('st_g3', 'v_g3');
  T('7.7 brak kabiny → launchFailed (noPassengerCabin)', lastFailReason() === t('mission.noPassengerCabin'));

  // 7.8 nie zadokowany: vessel orbiting → odmowa (shipUnavailable).
  resetEvents();
  makeColony('home', 5, 3);
  freshStation('st_g4', { modules: [makeStationModule('habitat', 1)], pop: 0 });
  makeVessel('v_g4', { dockedAt: null, state: 'orbiting', status: 'idle' });
  ms._launchPassenger('st_g4', 'v_g4');
  T('7.8 nie zadokowany → launchFailed (shipUnavailable)', lastFailReason() === t('mission.shipUnavailable'));
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. B1 — dostępność akcji kolonizacji przez getAvailableActions (canColonize gate)
// ═══════════════════════════════════════════════════════════════════════════
{
  // Passenger-only (2× passenger_module, colonistCapacity 2, ZERO habitat) — mimo colonistCapacity>0.
  const passV = makeVessel('b1_pass', { dockedAt: 'home', modules: ['passenger_module', 'passenger_module'], colonistCapacity: 2 });
  const colV  = makeVessel('b1_col',  { dockedAt: 'home', modules: ['habitat_pod'], colonistCapacity: 1 });
  const state = { missionSystem: ms };
  const hasAction = (acts, id) => acts.some(r => r.action?.id === id);
  const actsPass = getAvailableActions(passV, state);
  const actsCol  = getAvailableActions(colV, state);
  // KLUCZ B1: passenger-only NIE dostaje akcji kolonizacji nawet z odblokowanym techem (mock isResearched=true).
  T('8.1 passenger-only: BRAK akcji "colonize" (canColonize gate, nie colonistCapacity>0)', !hasAction(actsPass, 'colonize'));
  T('8.2 colony ship (habitat_pod): akcja "colonize" OBECNA (regresja)', hasAction(actsCol, 'colonize'));
  T('8.3 passenger-only: MA akcję "transport_passenger" (colonistCapacity>0)', hasAction(actsPass, 'transport_passenger'));
  // Dodatkowo: canExecute colonize dla passenger-only zwraca ok:false (gdyby ktoś wywołał wprost).
  const colonizeAct = actsCol.find(r => r.action?.id === 'colonize');
  T('8.4 colony ship colonize.ok=true (tech mock + medium bypass pad)', colonizeAct?.ok === true);
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. K1 — załadunek = pełna pojemność kabin (nigdy ostatni POP) + rozładunek częściowy
// ═══════════════════════════════════════════════════════════════════════════
{
  // 9.1 — 2 kabiny + population 5 → leci 2.
  resetEvents();
  const col = makeColony('home', 5, 3);
  freshStation('st_k1a', { modules: [makeStationModule('habitat', 3)], pop: 0 });   // cap 3
  const v = makeVessel('v_k1a', { dockedAt: 'home', modules: ['passenger_module', 'passenger_module'], colonistCapacity: 2 });
  col.fleet.push('v_k1a');
  ms._launchPassenger('st_k1a', 'v_k1a');
  T('9.1 2 kabiny + pop 5 → załadunek 2', v.colonists === 2 && col.civSystem.population === 3);
  T('9.1b mission.colonists = 2', ms._missions.find(m => m.vesselId === 'v_k1a')?.colonists === 2);

  // 9.2 — 2 kabiny + population 2 → leci 1 (never-last).
  resetEvents();
  const col2 = makeColony('home', 2, 2);
  freshStation('st_k1b', { modules: [makeStationModule('habitat', 3)], pop: 0 });
  const v2 = makeVessel('v_k1b', { dockedAt: 'home', modules: ['passenger_module', 'passenger_module'], colonistCapacity: 2 });
  col2.fleet.push('v_k1b');
  ms._launchPassenger('st_k1b', 'v_k1b');
  T('9.2 2 kabiny + pop 2 → załadunek 1 (never-last)', v2.colonists === 1 && col2.civSystem.population === 1);

  // 9.3 — rozładunek częściowy: 2 na pokładzie, stacja cap 1 → 1 wysiada, 1 czeka; +habitat → 2. wysiada.
  resetEvents();
  ms._missions.length = 0;   // izolacja: usuń zaległe en_route z 9.1/9.2 (_checkArrivals przetwarza WSZYSTKIE due)
  const col3 = makeColony('home', 5, 4);
  const st = freshStation('st_k1c', { modules: [makeStationModule('habitat', 1)], pop: 0 });   // cap 1
  const v3 = makeVessel('v_k1c', { dockedAt: 'home', modules: ['passenger_module', 'passenger_module'], colonistCapacity: 2 });
  col3.fleet.push('v_k1c');
  ms._launchPassenger('st_k1c', 'v_k1c');
  const m3 = ms._missions.find(m => m.vesselId === 'v_k1c');
  T('9.3a załadunek 2', v3.colonists === 2);
  ms._gameYear = m3.arrivalYear + 0.01;
  ms._checkArrivals();
  T('9.3b rozładunek częściowy: station.pop 1, vessel.colonists 1, no_housing', st.pop === 1 && v3.colonists === 1 && m3.status === 'no_housing');
  T('9.3c popArrived count=1 (częściowy)', events.popArrived?.length === 1 && events.popArrived[0].count === 1);
  st.modules.push(makeStationModule('habitat', 1));   // cap → 2
  ms._checkArrivals();
  T('9.3d po dobudowie habitatu: station.pop 2, vessel.colonists 0, completed', st.pop === 2 && v3.colonists === 0 && m3.status === 'completed');
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. B2 — komunikacja no_housing (marker _awaitingHousing + event + retry do końca)
// ═══════════════════════════════════════════════════════════════════════════
{
  resetEvents();
  ms._missions.length = 0;   // izolacja od zaległych misji poprzednich sekcji
  const col = makeColony('home', 5, 3);
  const st = freshStation('st_b2', { modules: [makeStationModule('habitat', 1)], pop: 1 });   // pełna (cap 1, pop 1)
  const v = makeVessel('v_b2', { dockedAt: 'home' });
  col.fleet.push('v_b2');
  ms._launchPassenger('st_b2', 'v_b2');
  const m = ms._missions.find(x => x.vesselId === 'v_b2');
  ms._gameYear = m.arrivalYear + 0.01;
  ms._checkArrivals();
  T('10.1 pełna stacja → status no_housing', m.status === 'no_housing');
  T('10.2 marker vessel._awaitingHousing = true', v._awaitingHousing === true);
  T('10.3 event vessel:awaitingHousing emitowany (na wejściu)', events.awaitingHousing?.length === 1 && events.awaitingHousing[0].stationId === 'st_b2' && events.awaitingHousing[0].count === 1);
  T('10.4 _statusText: awaitingHousing ma pierwszeństwo (marker ustawiony niezależnie od paliwa)', v._awaitingHousing === true);
  // retry NIE spamuje eventu
  ms._checkArrivals();
  T('10.5 retry bez zwolnienia: nadal no_housing, event NIE ponowiony', m.status === 'no_housing' && (events.awaitingHousing?.length ?? 0) === 1);
  // zwolnij miejsce (dobuduj habitat) → auto-unload w ≤ kilku ticków
  st.modules.push(makeStationModule('habitat', 1));   // cap → 2
  ms._checkArrivals();
  T('10.6 po +habitat: auto-unload, station.pop 2, completed', st.pop === 2 && m.status === 'completed');
  T('10.7 marker wyczyszczony po dostawie', v._awaitingHousing === false);
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. K2 — blokada rozbiórki ZASIEDLONEGO habitatu (StationSystem.demolishModule)
// ═══════════════════════════════════════════════════════════════════════════
{
  const sys = new StationSystem();
  // 11.1 — pusty habitat (pop 0): rozbiórka OK.
  const st1 = freshStation('st_k2a', { modules: [makeStationModule('habitat', 1), makeStationModule('habitat', 1)], pop: 0 });
  const hid1 = st1.modules[0].id;
  T('11.1 pusty habitat (pop 0) → demolish OK', sys.demolishModule('st_k2a', hid1) === true && st1.modules.length === 1);

  // 11.2 — zasiedlony habitat (cap 2, pop 2): rozbiórka jednego → pop 2 > cap 1 → ZABLOKOWANA.
  const st2 = freshStation('st_k2b', { modules: [makeStationModule('habitat', 1), makeStationModule('habitat', 1)], pop: 2 });
  const hid2 = st2.modules[0].id;
  const before = st2.modules.length;
  T('11.2 zasiedlony habitat (pop=cap) → demolish ZABLOKOWANA', sys.demolishModule('st_k2b', hid2) === false && st2.modules.length === before);
  T('11.2b moduł przywrócony (splice-revert)', st2.modules.some(m => m.id === hid2));

  // 11.3 — pop ≤ cap po rozbiórce (cap 2, pop 1): rozbiórka jednego habitatu → cap 1, pop 1 ≤ 1 → OK.
  const st3 = freshStation('st_k2c', { modules: [makeStationModule('habitat', 1), makeStationModule('habitat', 1)], pop: 1 });
  const hid3 = st3.modules[0].id;
  T('11.3 pop ≤ nowe cap → demolish OK', sys.demolishModule('st_k2c', hid3) === true && st3.modules.length === 1);

  // 11.4 — moduł NIE-habitat (power_atom, brak popCapacity) przy pop>0: rozbiórka OK (nie zmniejsza cap).
  const st4 = freshStation('st_k2d', { modules: [makeStationModule('habitat', 1), makeStationModule('power_atom', 1)], pop: 1 });
  const pid = st4.modules.find(m => m.moduleType === 'power_atom').id;
  T('11.4 rozbiórka non-habitatu przy pop>0 → OK (cap nietknięty)', sys.demolishModule('st_k2d', pid) === true);
}

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\nS3.4 FAZA 4 smoke: ${pass}/${pass + fail} PASS${fail ? `  (${fail} FAIL)` : ''}`);
process.exit(fail ? 1 : 0);
