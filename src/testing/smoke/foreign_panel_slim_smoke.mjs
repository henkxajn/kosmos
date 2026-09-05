// KEEPER — (f-A) Finding 253: panel obcego układu traci LISTY CIAŁ, zachowuje akcje kontekstowe.
//
// CO PINUJE (i dlaczego akurat to)
// Panel obcego układu był STAŁYM ELEMENTEM: dwie przewijane enumeracje WSZYSTKICH ciał układu
// (`interstellar_redirect` na ekranie przylotu, `foreign_redirect` na orbicie ciała). To one
// czyniły z niego katalog zamiast zestawu akcji.
//
// ⚠ LISTY SĄ REDUNDANTNE PODWÓJNIE — i dopiero to czyni ich usunięcie DARMOWYM:
//   1. klik ciała NA MAPIE (`FMO:2034`) emituje ten sam `vessel:interstellarRedirect`,
//      a jego własny komentarz mówi wprost „to samo co wiersz listy, tylko wygodniej";
//   2. d2 dołożył trasę cross-system (`OrderService.issueMove` → composite).
//
// ⚠ RECON ZOSTAJE — i to NIE jest ostrożność. `expedition:foreignRecon` ma DOKŁADNIE DWÓCH
//   producentów (`FMO:2368`, `:2376`), oba to te przyciski; a `foreign_colonize` jest bramkowane
//   `orbitBody.explored`, które na obcym ciele ustawia WYŁĄCZNIE recon (`VesselManager:3191/3259`).
//   Ukrycie reconu zostawiłoby Kolonizuj narysowane i MARTWE na zawsze — dokładnie to kłamstwo,
//   które ten slice usuwa. Zmierzone PRZED cięciem, dlatego wariant f-A zamiast pełnego f.
//
// f-1 PIN      — obie listy zniknęły z WSZYSTKICH gałęzi obcych
// f-2 KONTROLA — Recon ciała / Recon układu / Kolonizuj / Rozładuj RYSUJĄ SIĘ i DYSPOZYCJONUJĄ
// f-3 KONTROLA — klik ciała na mapie dalej przekierowuje (zdolność „leć do innego ciała" żyje)
// f-4 KONTROLA — nic IN-SYSTEM-SPECYFICZNEGO nie zniknęło (⚠ gałąź nie jest bramkowana układem)
//
// Uruchom: node src/testing/smoke/foreign_panel_slim_smoke.mjs

globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  body: { appendChild() {}, removeChild() {} }, addEventListener() {},
};
globalThis.localStorage = {
  _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }, key(i) { return Object.keys(this._s)[i] ?? null; },
  get length() { return Object.keys(this._s).length; },
};

const EventBus              = (await import('../../core/EventBus.js')).default;
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');
const { VesselManager }     = await import('../../systems/VesselManager.js');
const { GAME_CONFIG }       = await import('../../config/GameConfig.js');

const AU = GAME_CONFIG.AU_TO_PX;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n--- ' + s + ' ---');

EntityManager.clear();
EntityManager.add({ id: 'star_home', type: 'star', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
EntityManager.add({ id: 'p_home', type: 'planet', systemId: 'sys_home', x: 2 * AU, y: 0, name: 'Dom', explored: true });
EntityManager.add({ id: 'p_home2', type: 'planet', systemId: 'sys_home', x: 4 * AU, y: 0, name: 'Sąsiad', explored: true });
EntityManager.add({ id: 'star_gen', type: 'star', systemId: 'sys_gen', x: 0, y: 0, mass: 1 });
// Ciało ZBADANE (po reconie) — żeby Kolonizuj był AKTYWNY, nie tylko narysowany.
EntityManager.add({ id: 'p_far', type: 'planet', systemId: 'sys_gen', x: 3 * AU, y: 0, name: 'Phact c',
  explored: true, planetType: 'rocky' });
EntityManager.add({ id: 'p_far2', type: 'planet', systemId: 'sys_gen', x: 4 * AU, y: 0, name: 'Phact d',
  explored: false, planetType: 'rocky' });
EntityManager.add({ id: 'm_far', type: 'moon', systemId: 'sys_gen', x: 3.1 * AU, y: 0, name: 'Księżyc',
  parentPlanetId: 'p_far', explored: false });

const created = [];
const colonies = new Map([['p_home', { planetId: 'p_home', name: 'Dom', isOutpost: false, systemId: 'sys_home', fleet: [], resourceSystem: { receive() {} } }]]);
const colonyManager = {
  getColony: id => colonies.get(id) ?? null,
  hasColony: id => colonies.has(id),
  activePlanetId: 'p_home',
  _getShipyardLevel: () => 0,      // stub — `_drawActions` pyta o stocznię kolonii macierzystej
  createOutpost(targetId, resources, year) {
    created.push({ targetId, resources: { ...resources }, year });
    colonies.set(targetId, { planetId: targetId, isOutpost: true, fleet: [], resourceSystem: { receive() {} } });
    return colonies.get(targetId);
  },
};

const vm = new VesselManager();
globalThis.KOSMOS = {
  timeSystem: { gameTime: 40 }, vesselManager: vm, colonyManager,
  starSystemManager: { getSystem: id => ((id === 'sys_home' || id === 'sys_gen') ? { systemId: id } : null) },
  stationSystem: { getStation: () => null, getStationsAt: () => [] },
  missionSystem: { getActive: () => [] },
  techSystem: { isResearched: () => true, getShipSpeedMultiplier: () => 1, getFuelEfficiency: () => 1 },
};

function makeVessel(over = {}) {
  const v = {
    id: 'v_1', name: 'Kolonizator', shipId: 'hull_medium',
    systemId: 'sys_gen', colonyId: 'p_home', homeColonyId: 'p_home', status: 'on_mission',
    position: { state: 'orbiting', dockedAt: 'p_far', x: 3 * AU, y: 0 },
    mission: { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far', originId: 'sys_home' },
    fuel: { current: 60, max: 60, consumption: 1 }, warpFuel: { current: 4, max: 8, consumption: 0.2 },
    speedAU: 1, experience: 0, stats: { distanceTraveled: 0, missionsComplete: 0, resourcesHauled: 0 },
    // habitat → canColonize; cargo → przycisk Rozładuj; propulsion → recon caps
    modules: ['habitat_pod', 'cargo_small', 'engine_ion'],
    cargo: { minerals: 10 }, cargoUsed: 10,
    missionLog: [], pendingOrder: null, warpRoute: null, movementOrder: null,
    serviceState: 'active', isWreck: false, unpaidYears: 0, ...over,
  };
  vm._vessels.clear(); vm._vessels.set('v_1', v);
  return v;
}

function makeCtx(drawn) {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '11px mono', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    closePath() {}, save() {}, restore() {}, clip() {}, rect() {}, setLineDash() {}, getTransform() { return { a: 1, d: 1 }; },
    fillText(txt) { drawn.push(String(txt)); }, measureText(s) { return { width: String(s).length * 6 }; },
    createRadialGradient() { return { addColorStop() {} }; }, createConicGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; }, drawImage() {}, ellipse() {},
    quadraticCurveTo() {}, bezierCurveTo() {},
  };
}
function renderRight(mission, over = {}) {
  makeVessel({ mission, ...over });
  const o = Object.create(FleetManagerOverlay.prototype);
  o._selectedVesselId = 'v_1'; o._hitZones = []; o._rightViewH = 0; o._rightContentH = 0;
  o._collapsedFleets = new Set(); o._collapsedSections = new Set();
  const drawn = [];
  o._drawRight(makeCtx(drawn), 600, 60, 320, 700, vm, KOSMOS.missionSystem, colonyManager, 'p_home');
  return { drawn, zones: o._hitZones.map(z => z.type), overlay: o };
}

const FOREIGN = { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far', originId: 'sys_home' };
const ARRIVAL = { type: 'interstellar_jump', phase: 'in_system', toSystemId: 'sys_gen', fromSystemId: 'sys_home', targetName: 'Znany' };
const RECON   = { type: 'foreign_recon', scope: 'target', targetId: 'p_far', originId: 'sys_home', phase: 'scanning' };

// ── f-1 — listy zniknęły ──────────────────────────────────────────────────────────────────────
header('f-1 PIN — obie listy ciał zniknęły z wszystkich gałęzi obcych');
const rArr = renderRight(ARRIVAL), rOrb = renderRight(FOREIGN), rRec = renderRight(RECON);
for (const [label, r] of [['Interstellar Arrival', rArr], ['orbita ciała', rOrb], ['rekon w toku', rRec]]) {
  const lists = r.zones.filter(z => z === 'interstellar_redirect' || z === 'foreign_redirect');
  ok(lists.length === 0, `„${label}" bez enumeracji ciał (znaleziono: ${JSON.stringify(lists)})`);
}
ok(rArr.zones.includes('cluster_switch'),
  'KONTROLA PINU: ekran przylotu FAKTYCZNIE się narysował — brak list to filtr, nie brak rysowania');

// ── f-2 — akcje kontekstowe RYSUJĄ SIĘ i DYSPOZYCJONUJĄ ───────────────────────────────────────
header('f-2 KONTROLA — Recon / Kolonizuj / Rozładuj: narysowane ORAZ żywe');
for (const zt of ['foreign_recon_body', 'foreign_recon_system', 'foreign_colonize', 'foreign_unload']) {
  ok(rOrb.zones.includes(zt), `strefa ${zt} DALEJ renderowana`);
}
// …i naprawdę dyspozycjonują (klik → producent), a nie tylko istnieją.
const fired = [];
const cap = ev => d => fired.push({ ev, ...d });
const h1 = cap('foreignRecon'), h2 = cap('foreignColonize');
EventBus.on('expedition:foreignRecon', h1);
EventBus.on('expedition:foreignColonize', h2);
const fmo = Object.create(FleetManagerOverlay.prototype); fmo._hitZones = [];
makeVessel(FOREIGN);
fmo._handleHit({ type: 'foreign_recon_body', data: { vesselId: 'v_1', targetId: 'p_far' } });
fmo._handleHit({ type: 'foreign_colonize', data: { vesselId: 'v_1', targetId: 'p_far' } });
EventBus.off('expedition:foreignRecon', h1);
EventBus.off('expedition:foreignColonize', h2);
ok(fired.some(f => f.ev === 'foreignRecon'), `klik Recon dociera do producenta (${JSON.stringify(fired.map(f => f.ev))})`);
ok(fired.some(f => f.ev === 'foreignColonize'), 'klik Kolonizuj dociera do producenta');

// Rozładuj — END-TO-END: klik → placówka przez KANONICZNY foundOutpostFromCargo (zbieżność z (e)).
created.length = 0;
const vU = makeVessel({ ...FOREIGN, targetId: 'p_far2' }, { position: { state: 'orbiting', dockedAt: 'p_far2', x: 4 * AU, y: 0 } });
const fmo2 = Object.create(FleetManagerOverlay.prototype); fmo2._hitZones = [];
fmo2._handleHit({ type: 'foreign_unload', data: { vesselId: 'v_1', targetId: 'p_far2' } });
ok(created.some(c => c.targetId === 'p_far2' && c.resources?.minerals === 10),
  `klik Rozładuj ZAKŁADA placówkę kanoniczną ścieżką (${JSON.stringify(created)}) — ` +
  'to jest różnica między „narysowany" a „żywy"');
ok(Object.keys(vU.cargo).length === 0, 'ładownia opróżniona — akcja naprawdę się wykonała');

// ── f-3 — zdolność „leć do innego ciała" NIE zniknęła ─────────────────────────────────────────
header('f-3 KONTROLA — klik ciała na mapie dalej przekierowuje');
const redirects = [];
const h3 = d => redirects.push(d);
EventBus.on('vessel:interstellarRedirect', h3);
const fmo3 = Object.create(FleetManagerOverlay.prototype);
fmo3._hitZones = []; fmo3._selectedVesselId = 'v_1'; fmo3._missionConfig = null;
makeVessel(FOREIGN);
ok(fmo3._isForeignRedirectClickable('v_1', 'p_far2') === true,
  'predykat klikalności ciała na mapie dalej mówi TAK (FMO:2034 — ta sama zdolność co listy)');
fmo3._handleHit({ type: 'map_body', data: { bodyId: 'p_far2' } });
EventBus.off('vessel:interstellarRedirect', h3);
ok(redirects.some(r => r.targetId === 'p_far2'),
  `klik ciała na mapie emituje interstellarRedirect (${JSON.stringify(redirects)}) — ` +
  'usunęliśmy REDUNDANTNĄ enumerację, nie zdolność');

// ── f-4 — panel w układzie WŁASNYM nietknięty ─────────────────────────────────────────────────
header('f-4 KONTROLA — panel w układzie macierzystym bez zmian');
const rHome = renderRight(
  { type: 'exploration', phase: 'orbiting_body', targetId: 'p_home2', originId: 'sys_home' },
  { systemId: 'sys_home', position: { state: 'orbiting', dockedAt: 'p_home2', x: 4 * AU, y: 0 } },
);
ok(!rHome.zones.some(z => z === 'interstellar_redirect' || z === 'foreign_redirect'),
  'brak enumeracji także w układzie własnym — ZMIERZONE: gałąź exploration/orbiting_body NIE JEST ' +
  'bramkowana układem, tylko KSZTAŁTEM MISJI, więc lista pojawiała się i „u siebie". Usunięcie ' +
  'obejmuje oba przypadki, a redundancja (klik ciała na mapie) działa w obu.');
ok(rHome.zones.length > 0, `KONTROLA PINU: panel in-system dalej coś wystawia (${rHome.zones.length} stref)`);

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
