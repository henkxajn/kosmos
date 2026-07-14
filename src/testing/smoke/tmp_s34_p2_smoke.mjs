// S3.4 FAZA 2 — smoke test (tick stacji: budowa modułów, bilans energii/pracy, efekty, stocznia).
// Uruchom: node tmp_s34_p2_smoke.mjs

// ── Mock środowiska ──────────────────────────────────────────────────────────
const researched = new Set(['fusion_power']);   // automation NIEobecne → gate power_solar_auto
const homeColony = {
  planetId: 'home',
  resourceSystem: { _research: 0, receive(g) { if (g.research) this._research += g.research; } },
  fleet: [],
};
const createdVessels = [];
const dockedCalls = [];
globalThis.window = {
  KOSMOS: {
    techSystem: { isResearched: (id) => researched.has(id) },
    homePlanet: { id: 'home' },
    colonyManager: {
      getColony: (id) => (id === 'home' ? homeColony : null),
      getPlayerColonies: () => [homeColony],
    },
    vesselManager: {
      createAndRegister(shipId, colonyId, opts) {
        const v = { id: `v_${createdVessels.length}`, shipId, colonyId, opts };
        createdVessels.push(v);
        return v;
      },
      dockAtStation(vId, sId) { dockedCalls.push({ vId, sId }); },
    },
  },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const EventBus = (await import('../../core/EventBus.js')).default;
const { Station } = await import('../../entities/Station.js');
const { StationSystem } = await import('../../systems/StationSystem.js');
const { STATION_MODULES, makeStationModule } = await import('../../data/StationModuleData.js');
const { SHIPS } = await import('../../data/ShipsData.js');
const { HULLS } = await import('../../data/HullsData.js');

const sys = new StationSystem();

// Pomocnik: świeża stacja z modułami + depot, dodana do EntityManager (+ ciało macierzyste).
function freshStation(id, { modules = [], pop = 0, depot = {}, bodyId = 'body_1' } = {}) {
  if (!EntityManager.get(bodyId)) EntityManager.add({ id: bodyId, type: 'planet', name: 'Body', x: 10, y: 20, systemId: 'sys_home' });
  const st = new Station({ id, name: id, bodyId, pop, modules, depot });
  EntityManager.add(st);
  return st;
}

// ── 1. Budowa modułu: queued → building → built (cadence civDt) ───────────────
EntityManager.clear?.();
{
  const st = freshStation('st_build', { modules: [], depot: { Fe: 500, pressure_modules: 50 } });
  const r = sys.addPendingModuleOrder('st_build', 'habitat');
  T('1.1 addPendingModuleOrder ok', r.ok && r.orderId);
  T('1.2 order queued', st.pendingModuleOrders.length === 1 && st.pendingModuleOrders[0].status === 'queued');
  // tick 1: depot stać → spend → building (depot: Fe 500-400=100, pm 50-40=10)
  sys._tick(0.5);
  T('1.3 po ticku: status building', st.pendingModuleOrders[0]?.status === 'building');
  T('1.4 depot spent (Fe 100, pm 10)', st.depot.getAmount('Fe') === 100 && st.depot.getAmount('pressure_modules') === 10);
  T('1.5 building start: progress 0 (postęp liczony od następnego ticku)', st.pendingModuleOrders[0].progress === 0);
  // habitat buildTime 3.0 → potrzeba jeszcze 2.5. tick 3.0 → complete
  sys._tick(3.0);
  T('1.6 moduł zbudowany (pending pusty)', st.pendingModuleOrders.length === 0);
  T('1.7 moduł w modules[] jako habitat', st.modules.length === 1 && st.modules[0].moduleType === 'habitat' && st.modules[0].active === true);
  T('1.8 popCapacity=1 po zbudowaniu habitatu', st.popCapacity === 1);
}

// ── 2. Queued czeka gdy brak środków; spend dopiero gdy stać ─────────────────
{
  const st = freshStation('st_wait', { modules: [], depot: { Fe: 10 } });   // za mało na habitat
  sys.addPendingModuleOrder('st_wait', 'habitat');
  sys._tick(1.0);
  T('2.1 brak środków → wciąż queued', st.pendingModuleOrders[0]?.status === 'queued');
  T('2.2 depot nietknięty', st.depot.getAmount('Fe') === 10);
  st.depot.receive({ Fe: 500, pressure_modules: 50 });
  sys._tick(1.0);
  T('2.3 po dosypaniu → building + spend (Fe 510-400=110)', st.pendingModuleOrders[0]?.status === 'building' && st.depot.getAmount('Fe') === 110);
}

// ── 3. Bramki: tech gate + slot limit ────────────────────────────────────────
{
  const st = freshStation('st_gate', { depot: {} });
  const rAuto = sys.addPendingModuleOrder('st_gate', 'power_solar_auto');   // wymaga automation (brak)
  T('3.1 power_solar_auto odrzucony (requiresTech)', !rAuto.ok && rAuto.reason === 'requiresTech');
  const rFus = sys.addPendingModuleOrder('st_gate', 'power_fusion');        // wymaga fusion_power (jest)
  T('3.2 power_fusion przyjęty (tech ok)', rFus.ok);
  // Zapełnij do maxModules (8): dodaj 7 modułów + mamy 1 pending = 8; kolejny odrzucony
  st.modules = Array.from({ length: 7 }, () => makeStationModule('power_solar', 1));  // 7 zajętych
  const rFull = sys.addPendingModuleOrder('st_gate', 'lab');   // 7 + 1 pending = 8 → pełne
  T('3.3 slot limit: odrzucony przy 8', !rFull.ok && rFull.reason === 'no_slots');
}

// ── 4. Bilans energii: deficyt gasi sheddable wg priorytetu (trade→lab→shipyard) ──
{
  // power_solar +3; trade -2, lab -2, shipyard -3, habitat -1 → suma z 1 solar: 3-2-2-3-1 = -5
  const st = freshStation('st_energy', {
    pop: 10,   // dużo załogi — praca nie ogranicza, testujemy tylko energię
    modules: [
      makeStationModule('power_solar', 1),   // +3
      makeStationModule('habitat', 1),       // -1 (core, nigdy nie gaśnie)
      makeStationModule('trade_module', 1),  // -2 (gaśnie 1.)
      makeStationModule('lab', 1),           // -2 (gaśnie 2.)
      makeStationModule('shipyard', 1),      // -3 (gaśnie 3.)
    ],
  });
  sys._recomputeModuleStates(st);
  const byType = (t) => st.modules.find(m => m.moduleType === t);
  // net musi wyjść ≥0: start -5. Gaś trade(+2→-3), lab(+2→-1), shipyard(+3→+2). Wszystkie 3 off.
  T('4.1 trade wyłączony (no_power)', byType('trade_module').active === false && byType('trade_module').inactiveReason === 'no_power');
  T('4.2 lab wyłączony', byType('lab').active === false);
  T('4.3 shipyard wyłączony', byType('shipyard').active === false);
  T('4.4 habitat (core) NIGDY nie gaśnie', byType('habitat').active === true);
  T('4.5 power_solar (core) aktywny', byType('power_solar').active === true);
  // net po wyłączeniu: 3 -1 = +2 ≥ 0 ✓
  let net = 0; for (const m of st.modules) if (m.active !== false) net += STATION_MODULES[m.moduleType].energy;
  T('4.6 net energii ≥ 0 po bilansie', net >= 0);
}

// ── 5. Bilans energii: przy nadmiarze mocy nic nie gaśnie ─────────────────────
{
  const st = freshStation('st_energy2', {
    pop: 10,
    modules: [
      makeStationModule('power_fusion', 1),  // +12
      makeStationModule('trade_module', 1),  // -2
      makeStationModule('lab', 1),           // -2
    ],
  });
  sys._recomputeModuleStates(st);
  T('5.1 przy nadmiarze mocy trade aktywny', st.modules.find(m => m.moduleType === 'trade_module').active === true);
  T('5.2 lab aktywny', st.modules.find(m => m.moduleType === 'lab').active === true);
}

// ── 6. Bilans pracy (obsada=pop, FAZA 4): Σ popWork > pop gasi wg CREW_SHED_ORDER (konsumenci→power) ──
{
  // pop=0. WSZYSTKIE moduły z popWork>0 gasną (power TEŻ — martwa stacja): trade 0.5, lab 0.1,
  // power_atom 0.1. Kolejność CREW_SHED_ORDER: trade → lab → power_atom (power OSTATNI). Zostaje 0
  // aktywnych (brak habitatu/solar_auto o popWork 0).
  const st = freshStation('st_crew', {
    pop: 0,
    modules: [
      makeStationModule('power_atom', 1),    // +6 energii, popWork 0.1 → gaśnie OSTATNI
      makeStationModule('trade_module', 1),  // popWork 0.5 → gaśnie 1.
      makeStationModule('lab', 1),           // popWork 0.1 → gaśnie 2.
    ],
  });
  sys._recomputeModuleStates(st);
  T('6.1 trade wyłączony (no_crew)', st.modules.find(m => m.moduleType === 'trade_module').active === false && st.modules.find(m => m.moduleType === 'trade_module').inactiveReason === 'no_crew');
  T('6.2 lab wyłączony (no_crew)', st.modules.find(m => m.moduleType === 'lab').active === false);
  T('6.3 power_atom TEŻ wyłączony (no_crew — martwa stacja przy pop=0, obsada=pop)',
    st.modules.find(m => m.moduleType === 'power_atom').active === false && st.modules.find(m => m.moduleType === 'power_atom').inactiveReason === 'no_crew');

  // pop=1 → trade(0.5)+lab(0.1)+power(0.1)=0.7 ≤ 1 → wszystkie wracają (energia +6 OK)
  st.pop = 1;
  sys._recomputeModuleStates(st);
  T('6.4 pop=1 → wszystkie moduły aktywne (0.7 ≤ 1)', st.modules.every(m => m.active !== false));
}

// ── 6b. Obsada=pop: świeża stacja pop=0 = MARTWA; POP ożywia kaskadą (power → konsumenci) ──
{
  // Świeży starter: pop=0, habitat(popWork 0) + power_atom(0.1) + shipyard(0.2).
  const st = freshStation('st_cap', {
    pop: 0,
    modules: [makeStationModule('habitat', 1), makeStationModule('power_atom', 1), makeStationModule('shipyard', 1)],
  });
  // (a) nic nie crashuje przy energii ≤0 (pop=0 gasi power → net = habitat -1)
  let noCrash = true;
  try { sys._tick(1.0); } catch { noCrash = false; }
  T('6.5a pop=0: _tick nie crashuje przy zgaszonej energii', noCrash);
  sys._recomputeModuleStates(st);
  T('6.5 pop=0 → shipyard NIEaktywny (no_crew — brak załogi)', st.hasActiveShipyard === false);
  T('6.6 pop=0 → power_atom no_crew (martwa), habitat pasywnie aktywny (popWork 0)',
    st.modules.find(m => m.moduleType === 'power_atom').active === false && st.modules.find(m => m.moduleType === 'habitat').active === true);
  // (b) dowieziono 1 POP → kaskada power+shipyard wraca (0.1+0.2=0.3 ≤ 1) w JEDNYM przeliczeniu (≤2 ticki)
  st.pop = 1;
  sys._recomputeModuleStates(st);
  T('6.7 pop=1 → power + shipyard AKTYWNE (kaskada 1 tick), hasActiveShipyard',
    st.hasActiveShipyard === true && st.modules.every(m => m.active !== false));
  // power_solar_auto (popWork 0) — autonomiczne: energia BEZ załogi nawet przy pop=0; trade dalej no_crew
  const stAuto = freshStation('st_auto', {
    pop: 0,
    modules: [makeStationModule('habitat', 1), makeStationModule('power_solar_auto', 1), makeStationModule('trade_module', 1)],
  });
  sys._recomputeModuleStates(stAuto);
  T('6.8 pop=0 → power_solar_auto (autonomiczne) aktywne; trade no_crew',
    stAuto.modules.find(m => m.moduleType === 'power_solar_auto').active === true && stAuto.modules.find(m => m.moduleType === 'trade_module').active === false);
}

// ── 7. Efekty: lab aktywny → research do home colony ─────────────────────────
{
  homeColony.resourceSystem._research = 0;
  const st = freshStation('st_lab', {
    pop: 5,
    modules: [makeStationModule('power_fusion', 1), makeStationModule('lab', 1)],   // lab aktywny (energia+praca OK)
  });
  sys._recomputeModuleStates(st);
  sys._tickEffects(st, 2.0);   // lab 4 RP/rok × 2.0 civDt = 8
  T('7.1 lab wlał 8 research do home colony', Math.abs(homeColony.resourceSystem._research - 8) < 1e-9);
  // Wyłączony lab nie produkuje
  st.modules.find(m => m.moduleType === 'lab').active = false;
  homeColony.resourceSystem._research = 0;
  sys._tickEffects(st, 2.0);
  T('7.2 wyłączony lab nie produkuje research', homeColony.resourceSystem._research === 0);
}

// ── 8. Gettery: tradeCapacity (aktywne) + hasActiveShipyard ──────────────────
{
  const st = freshStation('st_getters', {
    pop: 5,
    modules: [
      makeStationModule('power_fusion', 1),
      makeStationModule('trade_module', 1),   // lv1 → 200
      makeStationModule('shipyard', 1),
    ],
  });
  sys._recomputeModuleStates(st);
  T('8.1 tradeCapacity=200 (aktywny trade lv1)', st.tradeCapacity === 200);
  T('8.2 hasActiveShipyard=true', st.hasActiveShipyard === true);
  // trade lv3 → 600
  st.modules.find(m => m.moduleType === 'trade_module').level = 3;
  T('8.3 tradeCapacity=600 (trade lv3)', st.tradeCapacity === 600);
  // wyłączony trade → 0
  st.modules.find(m => m.moduleType === 'trade_module').active = false;
  T('8.4 wyłączony trade → tradeCapacity 0', st.tradeCapacity === 0);
  // wyłączony shipyard → hasActiveShipyard false
  st.modules.find(m => m.moduleType === 'shipyard').active = false;
  T('8.5 wyłączony shipyard → hasActiveShipyard false', st.hasActiveShipyard === false);
}

// ── 9. Stocznia: queueStationShip → build → spawn + dockAtStation ────────────
{
  createdVessels.length = 0; dockedCalls.length = 0; homeColony.fleet = [];
  const shipId = Object.keys(SHIPS)[0];
  const ship = SHIPS[shipId];
  researched.add(ship.requires ?? '_none_');   // spełnij ewentualny tech gate
  const cost = { ...(ship.cost ?? {}), ...(ship.commodityCost ?? {}) };
  const st = freshStation('st_yard', {
    pop: 5,
    modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
    depot: { ...cost },   // dokładnie na 1 statek
  });
  sys._recomputeModuleStates(st);   // shipyard aktywny (fusion +12, shipyard -3)
  // brak stoczni → reject
  const stNo = freshStation('st_noyard', { modules: [makeStationModule('power_solar', 1)], depot: { ...cost } });
  const rNo = sys.queueStationShip('st_noyard', shipId);
  T('9.1 brak aktywnej stoczni → reject', !rNo.ok && rNo.reason === 'no_shipyard');
  // z aktywną stocznią → ok + spend z depotu
  const rY = sys.queueStationShip('st_yard', shipId);
  T('9.2 queueStationShip ok', rY.ok);
  T('9.3 shipQueue ma 1 wpis', st.shipQueues.length === 1);
  const firstCostKey = Object.keys(cost)[0];
  T('9.4 depot spent (koszt pobrany)', st.depot.getAmount(firstCostKey) === 0);
  // niewystarczające środki → reject
  const rBroke = sys.queueStationShip('st_yard', shipId);
  T('9.5 pusty depot → insufficient_resources', !rBroke.ok && rBroke.reason === 'insufficient_resources');
  // tick do ukończenia (buildTime)
  sys._recomputeModuleStates(st);
  sys._tick(ship.buildTime + 0.01);
  T('9.6 statek zbudowany (queue pusta)', st.shipQueues.length === 0);
  T('9.7 vessel utworzony przez createAndRegister', createdVessels.length === 1 && createdVessels[0].shipId === shipId);
  T('9.8 dockAtStation wywołany na stacji', dockedCalls.length === 1 && dockedCalls[0].sId === 'st_yard');
  T('9.9 vessel dodany do floty home colony', homeColony.fleet.length === 1);
}

// ── 10. Cancel + serialize/restore shipQueues round-trip ─────────────────────
{
  EntityManager.clear?.();
  const st = freshStation('st_ser', {
    pop: 3,
    modules: [makeStationModule('power_atom', 1), makeStationModule('habitat', 1)],
    depot: { Fe: 500, pressure_modules: 50 },
  });
  const r = sys.addPendingModuleOrder('st_ser', 'lab');
  T('10.1 cancelPendingModuleOrder ok', sys.cancelPendingModuleOrder('st_ser', r.orderId) === true);
  T('10.2 kolejka pusta po cancel', st.pendingModuleOrders.length === 0);
  st.shipQueues.push({ shipId: 'x', progress: 1, buildTime: 5 });
  const ser = sys.serialize().find(s => s.id === 'st_ser');
  T('10.3 serialize zawiera shipQueues', Array.isArray(ser.shipQueues) && ser.shipQueues.length === 1);
  T('10.4 serialize zawiera modules/pop/pendingModuleOrders', Array.isArray(ser.modules) && ser.pop === 3 && Array.isArray(ser.pendingModuleOrders));
  EntityManager.remove('st_ser');
  sys.restore([ser]);
  const back = EntityManager.get('st_ser');
  T('10.5 restore shipQueues', back.shipQueues.length === 1 && back.shipQueues[0].shipId === 'x');
  T('10.6 restore modules + derived popCapacity', back.modules.length === 2 && back.popCapacity === 1);
}

// ── 11. _tick no-op guardy ───────────────────────────────────────────────────
{
  T('11.1 _tick(0) no-op (nie rzuca)', (() => { try { sys._tick(0); return true; } catch { return false; } })());
  EntityManager.clear?.();
  T('11.2 _tick bez stacji no-op', (() => { try { sys._tick(1.0); return true; } catch { return false; } })());
}

// ── 12. FIX S3.4-F2: stationFillDepot pokrywa PEŁNY koszt KAŻDEGO kadłuba (SHIPS+HULLS) ──
{
  EntityManager.clear?.();
  // Replika logiki KOSMOS.debug.stationFillDepot (GameScene) — union kosztów SHIPS+HULLS ×10.
  const buildFill = () => {
    const fill = {
      Fe: 5000, Ti: 5000, Si: 5000, Cu: 5000, Hv: 2000, Li: 1000, W: 500, Pt: 500,
      structural_alloys: 500, pressure_modules: 500, power_cells: 500, conductor_bundles: 500,
      plasma_cores: 500, electronic_systems: 500, reactive_armor: 500,
    };
    for (const def of [...Object.values(SHIPS), ...Object.values(HULLS)]) {
      const cost = { ...(def.cost ?? {}), ...(def.commodityCost ?? {}) };
      for (const [id, amt] of Object.entries(cost)) fill[id] = Math.max(fill[id] ?? 0, amt * 10);
    }
    return fill;
  };
  // Regresja root-cause: science_vessel wymaga polymer_composites; space_supply_ship wymaga Xe —
  // stary fill ich NIE zawierał. Potwierdź, że union je pokrywa.
  const fill = buildFill();
  T('12.1 fill zawiera polymer_composites (root cause science_vessel)', (fill.polymer_composites ?? 0) > 0);
  T('12.2 fill zawiera Xe (root cause space_supply_ship)', (fill.Xe ?? 0) > 0);

  // Każdy kadłub budowalny w stoczni t1 → ok:true po jednym filldepot.
  const allHulls = { ...SHIPS, ...HULLS };
  for (const id of Object.keys(allHulls)) researched.add(allHulls[id].requires ?? '_none_');
  let allOk = true; const failedHulls = [];
  for (const shipId of Object.keys(allHulls)) {
    const st = freshStation(`st_fill_${shipId}`, {
      pop: 20,
      modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
      depot: {},
    });
    sys._recomputeModuleStates(st);
    st.depot.receive(buildFill());
    const r = sys.queueStationShip(st.id, shipId);
    if (!r.ok) { allOk = false; failedHulls.push(`${shipId}:${r.reason}`); }
  }
  T(`12.3 queueStationShip ok:true dla KAŻDEGO kadłuba t1 (${Object.keys(allHulls).length})` + (failedHulls.length ? ` — FAIL: ${failedHulls.join(', ')}` : ''), allOk);

  // Odmowa niosie `missing:{...}` (debugowalne z konsoli na live-gate).
  const stPoor = freshStation('st_missing', {
    pop: 20,
    modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
    depot: {},   // pusty depot
  });
  sys._recomputeModuleStates(stPoor);
  const sv = SHIPS.science_vessel;
  const rMiss = sys.queueStationShip('st_missing', 'science_vessel');
  const expectedKeys = Object.keys({ ...(sv.cost ?? {}), ...(sv.commodityCost ?? {}) });
  T('12.4 odmowa insufficient_resources', !rMiss.ok && rMiss.reason === 'insufficient_resources');
  T('12.5 odmowa niesie missing:{...} z brakującymi pozycjami', rMiss.missing && expectedKeys.every(k => rMiss.missing[k] > 0));
  T('12.6 missing.polymer_composites = pełny koszt (pusty depot)', rMiss.missing.polymer_composites === sv.commodityCost.polymer_composites);
}

console.log(`\nS3.4 FAZA 2 smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
