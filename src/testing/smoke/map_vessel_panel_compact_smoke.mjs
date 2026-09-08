// KEEPER — slice B / B1: TRYB KOMPAKTOWY panelu statku nad mapą 3D.
//
// PO CO ISTNIEJE
// Live-gate 258 zdał, ale werdykt właściciela brzmiał: kolumna A zakrywa ~pół ekranu. POMIAR
// wyjaśnił dlaczego — nad PIERWSZYM przyciskiem akcji leżało **456 px karty katalogowej**
// (opis kadłuba, OSIĄGI, paski paliwa/wytrzymałości, utrzymanie) przy `contentH = 550 px`.
// Panel był w 83 % kartą katalogową i w 17 % akcjami ⇒ „mały panel z PEŁNYM zestawem akcji"
// jest problemem UKŁADU, nie geometrii: samo zmniejszenie okna wpycha akcje pod fold
// (zmierzone: przy h = 300 widocznych akcji ZERO, wracają dopiero po przewinięciu).
//
// ⚠ DLACZEGO B1, A NIE KARCZUNEK. Wyodrębnienie `VesselActionPanel` to 2504 linie / 26 % pliku
//   (zmierzone, 22 metody) i — co rozstrzygnęło — NIE dowozi celu samo z siebie: po przeniesieniu
//   renderowałbyś tę samą kartę katalogową. Do tego karczunek ODBIERA gwarancję, która uczyniła
//   slice 258 wiarygodnym: dziś „panel mapy ≡ Rejestr" jest prawdą Z KONSTRUKCJI (ta sama metoda,
//   ta sama instancja, ta sama klatka), a komponent z dwoma miejscami wywołania trzeba UTRZYMYWAĆ
//   w zgodzie. Karczunek jest osobnym, przyszłym slice'em — brany TYLKO jeśli liczba guardów go
//   uzasadni. ZMIERZONA LICZBA: **jeden** (region karty katalogowej jest ciągły, czysto
//   informacyjny — zero stref klikalnych, zero `return`, zero zmiennych czytanych niżej).
//
// KONTROLE (zielone PRZED i PO zmianie — inaczej harness jest jałowy)
//   C1  panel BEZ `compact` ma pełną kartę katalogową (`contentH` ≈ 550, akcja ~y+456)
//   C2  zbiór akcji jest NIEPUSTY i zawiera zmierzone id (dwa puste panele też są „równe")
//
// PINY (mają PAŚĆ przed zmianą, przejść po niej)
//   E1  RÓWNOŚĆ: zbiór akcji w `compact` ≡ zbiór akcji Rejestru (ta sama metoda, ta sama instancja)
//   E2  GOLDEN NIETKNIĘTY: Rejestr BEZ `compact` = dzisiejsza sygnatura Z GEOMETRIĄ stref
//   R1  RENDER: `compact` realnie SKRACA panel — karta katalogowa znika, akcje idą do góry
//   R2  PICKER: krok `select` mieści listę celów w ~360 px (panel rośnie na czas wyboru)
//
// ⚠ FIXTURE Z POPULACJI OSIĄGALNEJ NA MAPIE — statek `orbiting`, NIE `docked`. Zadokowany nie ma
//   sprite'a (`ThreeRenderer:4783`/`:1185`), więc nie ma kotwicy ekranowej; pin kotwicy na takim
//   fixturze mierzyłby ciszę. Lekcja z 258, tu wpisana od pierwszej wersji.
// ⚠ GRANICA DOWODU: headless. `FleetManagerOverlay` importuje się pod node i `_drawRight` daje się
//   prowadzić na atrapie `ctx`; host (FloatingPanel/kotwica) i wygląd = commit 2 + live-gate.
//
// Uruchom: node src/testing/smoke/map_vessel_panel_compact_smoke.mjs

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

const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');
const { GAME_CONFIG }         = await import('../../config/GameConfig.js');
const EntityManager           = (await import('../../core/EntityManager.js')).default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const AU = GAME_CONFIG.AU_TO_PX;

function stubCtx() {
  return new Proxy({}, {
    get: (t, k) => k === 'measureText' ? ((s) => ({ width: String(s).length * 6 }))
      : (k === 'canvas' ? { width: 1920, height: 1080 } : (typeof k === 'string' ? () => {} : undefined)),
    set: () => true,
  });
}

function world() {
  EntityManager.clear();
  for (const [id, n, a] of [['p_home', 'Dom', 1], ['p_two', 'Wtora', 3], ['p_thr', 'Trzecia', 5]]) {
    EntityManager.add({ id, type: 'planet', name: n, x: a * AU, y: 0, systemId: 'sys_home',
                        orbital: { a, e: 0, T: a * 2, M: 0 }, deposits: [], explored: true, analyzed: true });
  }
  // ⚠ ORBITING — populacja osiągalna z mapy (patrz nagłówek).
  const vessel = {
    id: 'v_1', name: 'Merkury', shipId: 'hull_medium', systemId: 'sys_home',
    colonyId: 'p_home', homeColonyId: 'p_home', status: 'idle',
    position: { state: 'orbiting', dockedAt: 'p_home', x: 1 * AU, y: 0 },
    mission: null, movementOrder: null,
    fuel: { current: 40, max: 60, consumption: 1 }, warpFuel: { current: 0, max: 0 },
    endurance: { current: 10, max: 10 }, cargo: {}, cargoUsed: 0, cargoMax: 50, cargoCapacity: 50,
    colonistCapacity: 0, colonists: 0, troopCapacity: 0,
    modules: ['engine_ion', 'cargo_small'], missionLog: [],
    isWreck: false, serviceState: 'active', unpaidYears: 0, refuelAutomatically: true, xp: 0,
  };
  const vessels = new Map([['v_1', vessel]]);
  const colony = { planetId: 'p_home', name: 'Dom', isOutpost: false,
    buildingSystem: { hasSpaceport: () => true }, civSystem: { freePops: 5 },
    resourceSystem: { inventory: new Map(), getAmount: () => 10, canAfford: () => true, spend: () => true, receive: () => {} } };
  window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home', homePlanet: EntityManager.get('p_home'),
    vesselManager: { _vessels: vessels, getVessel: (id) => vessels.get(id), getAllVessels: () => [...vessels.values()],
      isImmobilized: () => false, getVesselUpkeepCredits: () => 300, getVesselBaseUpkeepCredits: () => 300,
      _findEntity: (id) => EntityManager.get(id), getVesselSensorRangeAU: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => (id === 'p_home' ? colony : null),
      getAllColonies: () => [colony], getPlayerColonies: () => [colony], isPlayerColony: () => true, _getShipyardLevel: () => 1 },
    missionSystem: { getActive: () => [] },
    techSystem: { isResearched: () => true, getShipSpeedMultiplier: () => 1, getMultiplier: () => 1, getFuelEfficiency: () => 1 },
    stationSystem: { getStationsAt: () => [] }, fleetSystem: { listFleets: () => [] },
    uiManager: { _dirty: false, getSelectedVesselId: () => 'v_1' },
  };
  return vessel;
}

const actionIds = (z) => z.filter((q) => q.type === 'action').map((q) => q.data.actionId).sort();
/** Podpis Z GEOMETRIĄ — mocniejszy niż sam zbiór typów (ten wariant zweryfikował płytę w 258). */
const sigGeom = (z) => z.map((q) => q.type + (q.data?.actionId ? ':' + q.data.actionId : '')
  + '@' + Math.round(q.x) + ',' + Math.round(q.y) + ',' + Math.round(q.w) + ',' + Math.round(q.h)).sort();

function draw(opts, w = 300, h = 700) {
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (opts === null) fmo.drawVesselPanel(stubCtx(), 20, 100, w, h);
  else               fmo.drawVesselPanel(stubCtx(), 20, 100, w, h, opts);
  return { fmo, zones: [...fmo._hitZones], contentH: fmo._rightContentH ?? -1 };
}

function overlayDraw() {
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  fmo._hitZones = [];
  fmo._drawRight(stubCtx(), 1600, 100, 300, 800, window.KOSMOS.vesselManager,
    window.KOSMOS.missionSystem, window.KOSMOS.colonyManager, 'p_home');
  return { fmo, zones: [...fmo._hitZones], contentH: fmo._rightContentH ?? -1 };
}

// ═══ C1 — baseline: bez `compact` karta katalogowa JEST ══════════════════════════════════════
header('C1  KONTROLA — bez `compact` panel ma pełną kartę katalogową');
let FULL = null;
{
  const r = draw(null);
  FULL = r;
  ok(r.contentH > 500, `contentH pełnego panelu > 500 (jest: ${Math.round(r.contentH)})`);
  const a = r.zones.filter((z) => z.type === 'action').sort((p, q) => p.y - q.y)[0];
  ok(!!a && (a.y - 100) > 400,
     `pierwsza akcja leży NISKO — pod kartą katalogową (jest: y+${a ? Math.round(a.y - 100) : '?'})`);
}

// ═══ C2 — zbiór akcji NIEPUSTY i konkretny (anty-jałowość dla E1) ════════════════════════════
header('C2  KONTROLA — zbiór akcji jest niepusty i zawiera zmierzone id');
let BASE_ACTIONS = null;
{
  BASE_ACTIONS = actionIds(FULL.zones);
  ok(BASE_ACTIONS.length > 0, `zbiór akcji NIEPUSTY (jest: ${JSON.stringify(BASE_ACTIONS)})`);
  ok(BASE_ACTIONS.includes('transport'),
     `zawiera zmierzone id `.concat(`(transport) — jest: ${JSON.stringify(BASE_ACTIONS)}`));
}

// ═══ E1 — RÓWNOŚĆ: compact ≡ Rejestr co do ZBIORU AKCJI ══════════════════════════════════════
// ⚠ To jest rdzeń slice'u B: kompakt UKRYWA informacje, ale NIE ODBIERA ŻADNEJ AKCJI.
//   Gdyby zaczął, „pełny zestaw akcji" byłby nieprawdą, a panel — trzecią, uboższą powierzchnią.
header('E1  PIN — zbiór akcji w `compact` ≡ zbiór akcji Rejestru (ta sama metoda, ta sama instancja)');
{
  const reg = overlayDraw();
  const cmp = draw({ compact: true });
  const aReg = actionIds(reg.zones);
  const aCmp = actionIds(cmp.zones);
  ok(aReg.length > 0 && aReg.includes('transport'),
     `KONTROLA: Rejestr ma niepusty, konkretny zbiór akcji (${JSON.stringify(aReg)})`);
  ok(JSON.stringify(aCmp) === JSON.stringify(aReg),
     `compact ma DOKŁADNIE te same akcje co Rejestr (compact: ${JSON.stringify(aCmp)}, rejestr: ${JSON.stringify(aReg)})`);
  // Cargo to AKCJA (strefa `cargo_load`), nie karta katalogowa — musi przeżyć kompakt.
  ok(cmp.zones.some((z) => z.type === 'cargo_load'),
     'compact ZACHOWUJE przycisk Cargo (to afordancja akcji, nie karta katalogowa)');
}

// ═══ E2 — GOLDEN: Rejestr bez `compact` nietknięty, Z GEOMETRIĄ ══════════════════════════════
// ⚠ Chronione Z KONSTRUKCJI: Rejestr NIE PODAJE `opts`, więc `compact` jest falsy. Ten pin
//   pilnuje, żeby nikt nie „uprościł" tego, przekazując flagę globalnie z konfiguracji.
header('E2  PIN — Rejestr BEZ `compact` = panel mapy BEZ `compact`, co do PIKSELA');
{
  const reg = overlayDraw();
  const map = draw(null);
  const FOOTER = new Set(['mvpRetreat', 'mvpFleet', 'mvpDock']);
  // Porównanie po TYPACH+akcjach (geometria X różni się, bo panele stoją w innych miejscach),
  // ale contentH — czyli WYSOKOŚĆ treści — musi być identyczna co do piksela.
  const tReg = sigGeom(reg.zones).map((s) => s.split('@')[0]).sort();
  const tMap = sigGeom(map.zones.filter((z) => !FOOTER.has(z.type))).map((s) => s.split('@')[0]).sort();
  ok(JSON.stringify(tReg) === JSON.stringify(tMap),
     `ten sam zestaw stref (rejestr ${tReg.length}, mapa bez footera ${tMap.length})`);
  ok(Math.round(reg.contentH) === Math.round(map.contentH),
     `contentH IDENTYCZNE (rejestr ${Math.round(reg.contentH)}, mapa ${Math.round(map.contentH)})`);
  ok(reg.contentH > 500, `KONTROLA: mierzymy PEŁNĄ treść, nie pustkę (${Math.round(reg.contentH)})`);
}

// ═══ R1 — RENDER: compact realnie skraca panel ═══════════════════════════════════════════════
header('R1  PIN — `compact` SKRACA panel: karta katalogowa znika, akcje idą do góry');
{
  const full = draw(null);
  const cmp  = draw({ compact: true });
  ok(cmp.contentH < full.contentH - 150,
     `contentH spada istotnie (${Math.round(full.contentH)} → ${Math.round(cmp.contentH)})`);
  const aFull = full.zones.filter((z) => z.type === 'action').sort((p, q) => p.y - q.y)[0];
  const aCmp  = cmp.zones.filter((z) => z.type === 'action').sort((p, q) => p.y - q.y)[0];
  ok(!!aCmp, 'compact NADAL ma strefę akcji (nie wycięliśmy akcji razem z kartą)');
  ok(!!aFull && !!aCmp && (aCmp.y - 100) < (aFull.y - 100) - 150,
     `pierwsza akcja wędruje do góry (y+${Math.round(aFull.y - 100)} → y+${Math.round(aCmp.y - 100)})`);
  // Karta katalogowa ZNIKA — mierzone przez BRAK jej pionu, nie przez brak stref (ona ich nie ma).
  ok(cmp.contentH < 400, `panel mieści się w „małym" budżecie (<400 px, jest ${Math.round(cmp.contentH)})`);
}

// ═══ R2 — PICKER: krok `select` mieści się w ~360 px ═════════════════════════════════════════
// Decyzja właściciela: panel ROŚNIE do ~360 px na czas wyboru celu i wraca do kompaktu po
// potwierdzeniu. Pin sprawdza, czy 360 px WYSTARCZA — inaczej ta decyzja jest nierealizowalna.
header('R2  PIN — krok `select` mieści listę celów w ~360 px');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  fmo._missionConfig = { actionId: 'transport', targetId: null, step: 'select' };
  fmo.drawVesselPanel(stubCtx(), 20, 100, 300, 360, { compact: true });
  const targets = fmo._hitZones.filter((z) => z.type === 'select_target');
  ok(targets.length >= 1, `picker emituje >=1 cel przy h=360 (jest: ${targets.length})`);
  ok(fmo._rightContentH <= 360 + 40,
     `treść kroku select mieści się w oknie ~360 px (contentH ${Math.round(fmo._rightContentH)})`);
  // KONTROLA: bez `compact` ten sam krok NIE mieści się — czyli 360 px to zasługa kompaktu.
  world();
  const fmo2 = new FleetManagerOverlay();
  fmo2._selectedVesselId = 'v_1';
  fmo2._missionConfig = { actionId: 'transport', targetId: null, step: 'select' };
  fmo2.drawVesselPanel(stubCtx(), 20, 100, 300, 360);
  ok(fmo2._rightContentH > 360,
     `KONTROLA: bez kompaktu ten sam krok NIE mieści się w 360 px (contentH ${Math.round(fmo2._rightContentH)})`);
}

// ═══ M — pin ŹRÓDŁOWY: flaga jest ZAMONTOWANA ════════════════════════════════════════════════
// ⚠ Lekcja W3 „skonstruowany ≠ zamontowany": wszyscy konsumenci czytają przez `?.`, więc martwa
//   flaga NIE KRZYCZY. `UIManager` nie importuje się pod node ⇒ pin źródłowy z kontrolami.
header('M  PIN ŹRÓDŁOWY — `mapVesselPanelCompact` jest realnie wpięta w UIManagerze');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf-8');
  const code = src.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  ok(code.includes('mapVesselPanelCompact'), 'UIManager czyta flagę mapVesselPanelCompact');
  ok(code.includes('compact:'), 'i podaje ją do drawVesselPanel jako `compact:`');
  ok(code.length > 50000, `KONTROLA: źródło realnie wczytane (${code.length} zn.)`);
  ok(GAME_CONFIG.FEATURES?.mapVesselPanelCompact === false,
     'flaga istnieje i jest domyślnie OFF (fallback = kolumna A)');
}

console.log(`\n═══ ${pass}/${pass + fail} OK, ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
