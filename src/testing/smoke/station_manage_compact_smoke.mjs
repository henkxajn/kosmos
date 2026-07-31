// C6c-2b-i — headless smoke dla drawStationManageCompact (READ-ONLY compact station management).
// Dowodzi PRZECIW prawdziwemu importowi: render nie rzuca, endCy > y (treść narysowana), akumulacja
// wysokości (więcej modułów → wyżej), truncate się kończy (długa nazwa), ORAZ gałąź pooled-depot
// (systemPoolService.getPoolSnapshot przez resolveHomeColony) — pokrycie na żądanie reviewera.
// Uruchom: node src/testing/smoke/station_manage_compact_smoke.mjs

// ── Shim env: StationManagementView → i18n czyta bare localStorage; renderer czyta window.KOSMOS ──
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = { localStorage: globalThis.localStorage };

const { drawStationManageCompact } = await import('../../ui/StationManagementView.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── Mock ctx (measureText ∝ długość; reszta no-op) ──
function mockCtx() {
  return {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, textAlign: '', textBaseline: '',
    measureText: (s) => ({ width: (s ?? '').length * 6 }),
    fillText: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    save: () => {}, restore: () => {}, setLineDash: () => {}, rect: () => {}, clip: () => {},
  };
}

// ── Bazowa stacja (własny depot; owner=player, depotDetached → resolveHomeColony=null bez window.KOSMOS) ──
function baseStation(extra = {}) {
  return {
    id: 'station_1', name: 'Testowa Stacja', ownerEmpireId: 'player',
    stationType: 'orbital_station', pop: 3, popCapacity: 6, tradeCapacity: 2, hasActiveShipyard: true,
    modules: [
      { moduleType: 'habitat',      active: true,  level: 1 },
      { moduleType: 'power_atom',   active: false, inactiveReason: 'no_crew', level: 1 },
      { moduleType: 'trade_module', active: true,  level: 1 },
    ],
    pendingModuleOrders: [{ id: 'o1', moduleType: 'shipyard', status: 'building', progress: 2, buildTime: 5 }],
    shipQueues: [{ shipId: 'hull_small', progress: 1, buildTime: 4 }],
    depot: { inventory: new Map([['Fe', 120], ['electronic_systems', 8]]) },
    depotDetached: true,
    ...extra,
  };
}

const Y0 = 100, W = 300;

// ── T1: własny depot — render nie rzuca, endCy > y ──
console.log('--- T1: render own-depot ---');
let endCy1;
try {
  endCy1 = drawStationManageCompact(mockCtx(), { x: 0, y: Y0, w: W }, baseStation(), {});
  ok(`render own-depot bez wyjątku, endCy=${endCy1} > y=${Y0}`, typeof endCy1 === 'number' && endCy1 > Y0);
} catch (e) { ok('render own-depot — RZUCIŁ: ' + e.message, false); }

// ── T2: akumulacja — więcej modułów → większy endCy ──
console.log('--- T2: akumulacja wysokości ---');
const many = baseStation({ modules: Array.from({ length: 8 }, () => ({ moduleType: 'habitat', active: true, level: 1 })) });
const endCyMany = drawStationManageCompact(mockCtx(), { x: 0, y: Y0, w: W }, many, {});
ok(`8 modułów endCy=${endCyMany} > 3 modułów endCy=${endCy1}`, endCyMany > endCy1);

// ── T3: truncate — bardzo długa nazwa kończy się (brak nieskończonej pętli) ──
console.log('--- T3: truncate długiej nazwy ---');
let endCyLong;
try {
  endCyLong = drawStationManageCompact(mockCtx(), { x: 0, y: Y0, w: W }, baseStation({ name: 'X'.repeat(400) }), {});
  ok(`długa nazwa: render skończył, endCy=${endCyLong} > y`, typeof endCyLong === 'number' && endCyLong > Y0);
} catch (e) { ok('długa nazwa — RZUCIŁ (truncate loop?): ' + e.message, false); }

// ── T4: pooled-depot — resolveHomeColony (stamp) → getPoolSnapshot → render puli ──
console.log('--- T4: pooled-depot (getPoolSnapshot) ---');
globalThis.window.KOSMOS = {
  colonyManager: {
    getColony: (id) => id === 'colP' ? { planetId: 'colP', name: 'Nowa Ziemia', resourceSystem: {} } : null,
    getColoniesInSystem: () => [],
  },
  systemPoolService: {
    getPoolSnapshot: (pid) => pid === 'colP'
      ? { byBody: [{ colony: { name: 'Nowa Ziemia', planetId: 'colP' } }, { colony: { name: 'Luna', planetId: 'M1' } }],
          total: new Map([['Fe', 500], ['Ti', 200], ['Cu', 0]]) }
      : null,
  },
};
let endCyPool;
try {
  endCyPool = drawStationManageCompact(mockCtx(), { x: 0, y: Y0, w: W },
    baseStation({ ownerColonyId: 'colP', bodyId: 'P', systemId: 'sys_home', depotDetached: false }), {});
  ok(`pooled-depot render bez wyjątku, endCy=${endCyPool} > y`, typeof endCyPool === 'number' && endCyPool > Y0);
  // Pula > sama stacja bez wpisów depotu (label systemPool + 2 członków + 2 niezerowe totale Fe/Ti; Cu=0 pominięty).
  ok('pooled endCy sensowny (pula narysowana)', endCyPool > Y0 + 40);
} catch (e) { ok('pooled-depot — RZUCIŁ: ' + e.message, false); }
delete globalThis.window.KOSMOS;

// ── T5: akcje 2b-ii — view z addHit spy rejestruje 6 typów akcji; picker otwarty → bhit=noop ──
console.log('--- T5: action hits (2b-ii) ---');
function collect() { const types = []; return { addHit: (a, b, c, d, type) => types.push(type), techIsResearched: () => true, types }; }
const actStation = baseStation({
  pop: 0, popCapacity: 100,   // pop=0 → demolish NIE zablokowany (station_mgmt_demolish, nie _blocked)
  modules: [{ id: 'm1', moduleType: 'habitat', active: true, level: 1 }],
  pendingModuleOrders: [{ id: 'o1', moduleType: 'trade_module', status: 'queued', progress: 0, buildTime: 5 }],
  shipQueues: [{ shipId: 'hull_small', progress: 1, buildTime: 4 }],
});
const spy1 = collect();
drawStationManageCompact(mockCtx(), { x: 0, y: Y0, w: W }, actStation, { addHit: spy1.addHit, techIsResearched: spy1.techIsResearched });
ok('compact NIE emituje station_mgmt_rename (C6c-2b-ii: pinowany nagłówek, nie body)', !spy1.types.includes('station_mgmt_rename'));
ok('rejestruje demolish (lub _blocked)', spy1.types.includes('station_mgmt_demolish') || spy1.types.includes('station_mgmt_demolish_blocked'));
ok('rejestruje station_mgmt_cancelmodule', spy1.types.includes('station_mgmt_cancelmodule'));
ok('rejestruje station_mgmt_addslot', spy1.types.includes('station_mgmt_addslot'));
ok('rejestruje station_mgmt_addship', spy1.types.includes('station_mgmt_addship'));
ok('rejestruje station_mgmt_cancelship', spy1.types.includes('station_mgmt_cancelship'));
const spy2 = collect();
drawStationManageCompact(mockCtx(), { x: 0, y: Y0, w: W }, actStation, { addHit: spy2.addHit, techIsResearched: spy2.techIsResearched, pickerOpen: true });
ok('picker otwarty → 0 hitów station_mgmt_* (bhit=noop)', spy2.types.filter(t => t?.startsWith('station_mgmt_')).length === 0);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
