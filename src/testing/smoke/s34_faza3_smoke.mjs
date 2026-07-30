// S3.4 FAZA 3 — smoke: StationManagementView emituje właściwe hit-zony (rename/sloty/picker/kolejka).
// StationManagementView jest node-importowalny (pure-ish); test używa REALNEJ encji Station (gettery
// popCapacity/tradeCapacity/hasActiveShipyard) + mock ctx (rejestruje addHit). Bez canvas/DOM.
// Uruchom: node tmp_s34_faza3_smoke.mjs

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage, KOSMOS: {} };

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const { Station } = await import('../../entities/Station.js');
const { StationSystem } = await import('../../systems/StationSystem.js');
const { makeStationModule } = await import('../../data/StationModuleData.js');
const { drawStationManagement } = await import('../../ui/StationManagementView.js');

// Mock ctx — no-op rysowanie, measureText zwraca szerokość ~ proporcjonalną do długości.
function mockCtx() {
  return new Proxy({
    measureText: (s) => ({ width: String(s ?? '').length * 6 }),
    fillText: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
    save: () => {}, restore: () => {}, setLineDash: () => {}, arc: () => {}, rect: () => {}, clip: () => {},
    translate: () => {}, rotate: () => {},
  }, { get: (tgt, p) => (p in tgt ? tgt[p] : (typeof p === 'string' ? undefined : tgt[p])), set: () => true });
}

// Zbierz hit-zony przez callback addHit.
function runView(station, { pickerOpen = false, shipPickerOpen = false, designs } = {}) {
  const hits = [];
  const addHit = (x, y, w, h, type, data) => hits.push({ type, data });
  drawStationManagement(mockCtx(), { x: 0, y: 0, w: 1000, h: 700 }, station, {
    addHit,
    techIsResearched: (id) => id === 'fusion_power' || id === 'exploration',   // fusion+exploration odblokowane
    designs,   // R2/decyzja #10 — ship picker buduje projekty gracza (undefined = brak / fallback window.KOSMOS)
    pickerOpen, shipPickerOpen,
  });
  return hits;
}
const types = (hits) => new Set(hits.map(h => h.type));

// ── 1. Ekran bazowy: rename + puste sloty + anuluj pending ────────────────────
{
  const st = new Station({
    id: 'st_a', name: 'Stacja A', bodyId: 'moon', pop: 2,
    modules: [makeStationModule('habitat', 1), makeStationModule('power_atom', 1)],
    depot: { Fe: 1000, pressure_modules: 100 },
  });
  st.pendingModuleOrders.push({ id: 'o1', moduleType: 'lab', level: 1, cost: {}, status: 'building', progress: 2, buildTime: 5 });
  const hits = runView(st);
  const ty = types(hits);
  T('1.1 rename hit obecny', ty.has('station_mgmt_rename'));
  T('1.2 puste sloty klikalne (addslot)', ty.has('station_mgmt_addslot'));
  T('1.3 pending → cancelmodule', ty.has('station_mgmt_cancelmodule'));
  // 2 moduły + 1 pending = 3 zajęte, maxModules 8 → 5 pustych slotów
  const emptyCount = hits.filter(h => h.type === 'station_mgmt_addslot').length;
  T('1.4 liczba pustych slotów = 5 (8 - 3)', emptyCount === 5);
  T('1.5 cancelmodule niesie orderId', hits.find(h => h.type === 'station_mgmt_cancelmodule')?.data?.orderId === 'o1');
  T('1.6 picker zamknięty → brak build/picker_bg', !ty.has('station_mgmt_build') && !ty.has('station_mgmt_picker_bg'));
}

// ── 2. Kolejka stoczni: cancelship gdy shipyard aktywny + statek w kolejce ─────
{
  const st = new Station({
    id: 'st_b', name: 'Stacja B', bodyId: 'moon', pop: 5,
    modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
    depot: {},
  });
  st.shipQueues.push({ shipId: 'science_vessel', progress: 1, buildTime: 4 });
  T('2.0 shipyard aktywny (getter)', st.hasActiveShipyard === true);
  const hits = runView(st);
  T('2.1 kolejka stoczni → cancelship', types(hits).has('station_mgmt_cancelship'));
  T('2.2 cancelship niesie index 0', hits.find(h => h.type === 'station_mgmt_cancelship')?.data?.index === 0);
}

// ── 3. Picker modułów: build dla stać+odblokowany; picker_close/bg zawsze ──────
{
  const st = new Station({
    id: 'st_c', name: 'Stacja C', bodyId: 'moon', pop: 2,
    modules: [makeStationModule('habitat', 1)],
    depot: { Fe: 5000, Si: 5000, Ti: 5000, pressure_modules: 500, conductor_bundles: 500, plasma_cores: 500, power_cells: 500, electronic_systems: 500 },
  });
  const hits = runView(st, { pickerOpen: true });
  const ty = types(hits);
  T('3.1 picker: close hit', ty.has('station_mgmt_picker_close'));
  T('3.2 picker: bg absorber', ty.has('station_mgmt_picker_bg'));
  T('3.3 picker: build dla modułów na które stać', ty.has('station_mgmt_build'));
  const builds = hits.filter(h => h.type === 'station_mgmt_build').map(h => h.data.moduleType);
  // habitat/power_atom/power_solar/shipyard/trade_module/lab/power_fusion(fusion_power JEST) — stać na wszystkie
  T('3.4 power_fusion budowalny (tech fusion_power odblokowane)', builds.includes('power_fusion'));
  // power_solar_auto wymaga automation (NIE odblokowane) → brak build
  T('3.5 power_solar_auto NIE budowalny (brak automation)', !builds.includes('power_solar_auto'));
}

// ── 4. Picker przy pełnych slotach: żaden build (no_slots) ────────────────────
{
  const st = new Station({
    id: 'st_d', name: 'Stacja D', bodyId: 'moon', pop: 2,
    modules: Array.from({ length: 8 }, () => makeStationModule('power_solar', 1)),   // 8/8 pełne
    depot: { Fe: 9000, Si: 9000, Ti: 9000, pressure_modules: 900, conductor_bundles: 900, plasma_cores: 900, power_cells: 900, electronic_systems: 900 },
  });
  const hits = runView(st, { pickerOpen: true });
  T('4.1 pełne sloty → brak build w pickerze', !types(hits).has('station_mgmt_build'));
  T('4.2 pełne sloty → brak addslot na ekranie (0 pustych)', hits.filter(h => h.type === 'station_mgmt_addslot').length === 0);
}

// ── 5. R1 — rozbiórka: widok emituje demolish; intent usuwa moduł + przelicza; round-trip ─────
{
  // K2 (F4): rozbiórka zasiedlonego habitatu ZABLOKOWANA — test mechanizmu R1 na PUSTEJ stacji (pop 0),
  // gdzie rozbiórka habitatu jest dozwolona (cap 1 → 0, pop 0 ≤ 0). Blokadę pokrywa faza4 §11 + 5.11 niżej.
  const st = new Station({
    id: 'st_dem', name: 'Stacja Dem', bodyId: 'moon', pop: 0,
    modules: [makeStationModule('habitat', 1), makeStationModule('power_atom', 1), makeStationModule('trade_module', 1)],
    depot: {},
  });
  const hits = runView(st);
  const demHits = hits.filter(h => h.type === 'station_mgmt_demolish');
  T('5.1 każdy zbudowany moduł ma akcję demolish (3)', demHits.length === 3);
  T('5.2 demolish niesie moduleId + moduleType', demHits[0]?.data?.moduleId && demHits[0]?.data?.moduleType);

  // Intent demolishModule (realny StationSystem) — usuwa moduł, przelicza popCapacity, emituje event.
  EntityManager.clear?.();
  EntityManager.add(st);
  const sys = new StationSystem();
  let demolishedEvent = null;
  const EventBus = (await import('../../core/EventBus.js')).default;
  EventBus.on('station:moduleDemolished', (e) => { demolishedEvent = e; });
  const habId = st.modules.find(m => m.moduleType === 'habitat').id;
  const capBefore = st.popCapacity;
  const ok = sys.demolishModule('st_dem', habId);
  T('5.3 demolishModule ok', ok === true);
  T('5.4 moduł usunięty z modules', !st.modules.some(m => m.id === habId));
  T('5.5 popCapacity przeliczone (spadek o 1)', st.popCapacity === capBefore - 1);
  T('5.6 event station:moduleDemolished z moduleType=habitat', demolishedEvent?.moduleType === 'habitat');
  T('5.7 slot pusty → więcej pustych slotów w widoku', runView(st).filter(h => h.type === 'station_mgmt_addslot').length === 6);
  // Round-trip serialize/restore po rozbiórce
  const ser = sys.serialize().find(s => s.id === 'st_dem');
  T('5.8 serialize zawiera 2 moduły po rozbiórce', ser.modules.length === 2);
  EntityManager.remove('st_dem');
  sys.restore([ser]);
  T('5.9 restore odtwarza 2 moduły', EntityManager.get('st_dem')?.modules.length === 2);
  T('5.10 demolish nieistniejącego modułu → false', sys.demolishModule('st_dem', 'nope') === false);

  // 5.11 (K2) — zasiedlony habitat: widok wystawia station_mgmt_demolish_blocked (szary przycisk), NIE demolish.
  const stInhab = new Station({
    id: 'st_inhab', name: 'Zasiedlona', bodyId: 'moon', pop: 1,
    modules: [makeStationModule('habitat', 1), makeStationModule('power_atom', 1)], depot: {},
  });
  const inhabHits = runView(stInhab);
  const habCard = inhabHits.find(h => h.type === 'station_mgmt_demolish_blocked' && h.data?.moduleType === 'habitat');
  T('5.11 zasiedlony habitat → hit-zone demolish_blocked (nie demolish)', !!habCard
    && !inhabHits.some(h => h.type === 'station_mgmt_demolish' && h.data?.moduleType === 'habitat'));
  T('5.11b power_atom w zasiedlonej stacji → normalny demolish (nie-habitat bez zmian)',
    inhabHits.some(h => h.type === 'station_mgmt_demolish' && h.data?.moduleType === 'power_atom'));
}

// ── 6. R2 (decyzja #10) — ship picker buduje PROJEKTY GRACZA (nie surowe SHIPS) ──
{
  const st = new Station({
    id: 'st_yard', name: 'Stocznia', bodyId: 'moon', pop: 5,
    modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
    depot: { Fe: 9000, Ti: 9000, Cu: 9000, Si: 9000, Hv: 9000, Xe: 9000,
             structural_alloys: 900, polymer_composites: 900, electronic_systems: 900, reactive_armor: 900, power_cells: 900 },
  });
  // Projekt gracza: mały kadłub (requires 'exploration' — odblokowane) + moduł napędu.
  // Koszt = kadłub + moduł (calcShipCost) → depot pokrywa Fe/Ti/Cu + structural_alloys/polymer_composites/power_cells.
  const designs = [{ id: 'ud_kurier', name: 'Kurier', hullId: 'hull_small', modules: ['engine_chemical', null] }];
  // Bazowy ekran: „+ Buduj statek" widoczny gdy stocznia aktywna
  T('6.1 addship widoczny gdy stocznia aktywna', runView(st).some(h => h.type === 'station_mgmt_addship'));
  const hits = runView(st, { shipPickerOpen: true, designs });
  const ty = new Set(hits.map(h => h.type));
  T('6.2 ship picker: close hit', ty.has('station_mgmt_shippicker_close'));
  T('6.3 ship picker: bg absorber', ty.has('station_mgmt_shippicker_bg'));
  T('6.4 ship picker: buildship dla projektu gracza', ty.has('station_mgmt_buildship'));
  const bs = hits.find(h => h.type === 'station_mgmt_buildship');
  T('6.5 buildship niesie hullId+modules projektu (nie surowy shipId)',
    bs?.data?.hullId === 'hull_small' && Array.isArray(bs?.data?.modules) && bs.data.modules.includes('engine_chemical'));
  // Surowy szablon SHIPS (science_vessel) NIE jest budowalny ze stacji — tylko projekty gracza.
  T('6.6 surowy SHIPS (science_vessel) NIE budowalny ze stacji',
    !hits.some(h => h.type === 'station_mgmt_buildship' && h.data?.shipId === 'science_vessel'));
  // Pusta lista projektów → komunikat „Brak projektów", brak buildship.
  const empty = runView(st, { shipPickerOpen: true, designs: [] });
  T('6.7 brak projektów → brak buildship w pickerze', !new Set(empty.map(h => h.type)).has('station_mgmt_buildship'));
}

// ── 7. B2 inwariant — gdy picker otwarty, ekran bazowy NIE rejestruje hit-zon (z-order) ───────
{
  const st = new Station({
    id: 'st_modal', name: 'Modal', bodyId: 'moon', pop: 2,
    modules: [makeStationModule('habitat', 1)],
    depot: { Fe: 5000, Si: 5000, Ti: 5000, pressure_modules: 500, conductor_bundles: 500, plasma_cores: 500, power_cells: 500, electronic_systems: 500 },
  });
  const hits = runView(st, { pickerOpen: true });
  const ty = new Set(hits.map(h => h.type));
  T('7.1 picker otwarty → brak bazowego rename', !ty.has('station_mgmt_rename'));
  T('7.2 picker otwarty → brak bazowego addslot', !ty.has('station_mgmt_addslot'));
  T('7.3 picker otwarty → brak bazowego demolish', !ty.has('station_mgmt_demolish'));
  T('7.4 picker otwarty → picker_close obecny (klik ✕ działa)', ty.has('station_mgmt_picker_close'));
}

// ── 8. R2/decyzja #10 — queueStationShip buduje PROJEKT (koszt+spawn z modułami) ──
{
  EntityManager.clear?.();
  const created = [];
  window.KOSMOS.techSystem     = { isResearched: (id) => id === 'exploration' || id === 'fusion_power' };
  window.KOSMOS.homePlanet     = { id: 'home' };
  window.KOSMOS.colonyManager  = { getColony: () => null, getPlayerColonies: () => [] };
  window.KOSMOS.vesselManager  = {
    createAndRegister(shipId, colonyId, opts) { const v = { id: `v${created.length}`, shipId, opts }; created.push(v); return v; },
    dockAtStation() {},
  };
  if (!EntityManager.get('moon2')) EntityManager.add({ id: 'moon2', type: 'moon', name: 'Moon2', x: 5, y: 6, systemId: 'sys_home' });
  const st = new Station({
    id: 'st_proj', name: 'Proj', bodyId: 'moon2', pop: 20,
    modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
    depot: { Fe: 9000, Ti: 9000, Cu: 9000, structural_alloys: 900, polymer_composites: 900, power_cells: 900 },
  });
  EntityManager.add(st);
  const sys = new StationSystem();
  sys._recomputeModuleStates(st);
  T('8.0 shipyard aktywny (pop 20)', st.hasActiveShipyard === true);
  // Projekt gracza: hull_small (Fe60/Ti10/Cu8 + alloys3/poly2) + engine_chemical (Fe20/Cu10 + power_cells2).
  const r = sys.queueStationShip('st_proj', 'hull_small', ['engine_chemical', null]);
  T('8.1 queueStationShip(projekt) ok', r.ok === true);
  T('8.2 shipQueue niesie modules projektu', st.shipQueues[0]?.modules?.includes('engine_chemical'));
  T('8.3 koszt policzony z modułem (Fe 9000-80=8920)', st.depot.getAmount('Fe') === 8920);
  T('8.4 koszt modułu pobrany (power_cells 900-2=898)', st.depot.getAmount('power_cells') === 898);
  // tick do ukończenia (buildTime hull_small=3) → spawn z modułami projektu
  sys._tick(4.0);
  T('8.5 statek zbudowany (queue pusta)', st.shipQueues.length === 0);
  T('8.6 spawn createAndRegister z modułami projektu', created.length === 1 && created[0].opts?.modules?.includes('engine_chemical'));
  // Odmowa niesie missing (hull_large wymaga reactive_armor — brak w depocie).
  const rMiss = sys.queueStationShip('st_proj', 'hull_large', ['engine_chemical']);
  T('8.7 brak środków → insufficient_resources + missing.reactive_armor', !rMiss.ok && rMiss.reason === 'insufficient_resources' && rMiss.missing?.reactive_armor > 0);
}

console.log(`\nS3.4 FAZA 3 smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
