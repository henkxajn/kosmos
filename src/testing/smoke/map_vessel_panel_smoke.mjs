// KEEPER — panel statku z Rejestru nad mapą 3D (Wariant A / „panel mode", slice 258).
//
// CO PINUJE (i dlaczego akurat to)
// Klik w statek na mapie 3D ma otwierać TĘ SAMĄ powierzchnię co prawa kolumna Rejestru —
// nie kopię przycisków, tylko TĘ SAMĄ instancję `FleetManagerOverlay`. Plan + decyzje:
// `docs/design/MAP_VESSEL_PANEL_PLAN.md`.
//
// ⚠ ZIARNISTOŚĆ — dlaczego pinujemy na poziomie FMO, a nie UIManagera:
//   `UIManager` NIE IMPORTUJE SIĘ pod node (`THREE.TextureLoader is not a constructor` — ta sama
//   ściana co `ColonyOverlay`; stub `three` celowo nie wystawia loadera i NIE WOLNO go podnosić).
//   Dlatego adapter MUSI mieć wejścia na `FleetManagerOverlay` (`drawVesselPanel` /
//   `handleVesselPanelClick`), a nie być kodem wklejonym w `UIManager` — inaczej ten keeper
//   nie mógłby dotknąć niczego wykonaniem. To jest wymóg TESTOWALNOŚCI, nie stylu.
//   Mutex selekcji mieszka w czystym `MapVesselPanelLogic` (wzór `FleetGroupPanelLogic`,
//   `PanelDockLogic`, `ColonyModalLogic`).
//
// KONTROLE (muszą być zielone PRZED i PO zmianie — inaczej harness jest jałowy)
//   C1  `_drawRight` prowadzalny headless, zbiór stref NIEPUSTY i zawiera `action` orbit+transport
//   C2  `isVisible` świeżego FMO = false (pole rozłączne z `overlayManager.active`)
//   C3  `_drawRight` z `_selectedFleetId` renderuje gałąź FLOTY (dowód, że P7 mierzy różnicę)
//   C6  golden prawej kolumny Rejestru (regresja — musi przeżyć adapter)
//
// PINY (mają PAŚĆ przed zmianą, przejść po niej)
//   P1  `drawVesselPanel` istnieje i daje zbiór stref ≡ `_drawRight` (typ + actionId)
//   P2  `handleVesselPanelClick` routuje klik w `action` do `_handleAction`
//   P3  picker osiągalny z panelu mapy (`_missionConfig.step='select'` → ≥1 `select_target`)
//   P4  mutex po LICZBIE zaznaczenia (0 → none · 1 → vessel · ≥2 → group)
//   P5  brak podwójnego producenta stref (dwa rysowania pod rząd → count bez zmian)
//   P7  wymuszenie gałęzi statku mimo `_selectedFleetId`
//   P-open   rysowanie panelu NIE ustawia `_visible` (nie perturbuje `isAnyOpen()`)
//   P-flag   `mapVesselPanel:false` ⇒ przy N==1 powierzchnią jest `group` (dzisiejsze zachowanie)
//   P-scroll `_rightScrollY` WSPÓLNY (D-MVP-6) + reset przy zmianie statku dalej działa
//
// ⚠ Piny commitu 3 (footer-3 + `sameSystemOnly`) dochodzą osobno: P8/P9.
//
// Uruchom: node src/testing/smoke/map_vessel_panel_smoke.mjs

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

const { FleetManagerOverlay, MVP_FOOTER_H } = await import('../../ui/FleetManagerOverlay.js');
const { GAME_CONFIG }         = await import('../../config/GameConfig.js');
const EntityManager           = (await import('../../core/EntityManager.js')).default;

// Moduł mutexu — fail-first NIE ISTNIEJE. Import owinięty, żeby keeper nie umarł na starcie
// (martwy harness = 0/0 = fałszywa zieleń, nie fail-first).
let MapLogic = null;
try { MapLogic = await import('../../ui/MapVesselPanelLogic.js'); } catch { /* fail-first */ }
let VGA = null;
try { VGA = await import('../../ui/VesselGroupActions.js'); } catch { /* fail-first */ }

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
  const home = { id: 'p_home', type: 'planet', name: 'Dom', x: 1 * AU, y: 0, systemId: 'sys_home',
                 orbital: { a: 1, e: 0, T: 1, M: 0 }, deposits: [], explored: true, analyzed: true };
  const two  = { id: 'p_two', type: 'planet', name: 'Wtora', x: 3 * AU, y: 0, systemId: 'sys_home',
                 orbital: { a: 3, e: 0, T: 5, M: 0 }, deposits: [], explored: true, analyzed: true };
  EntityManager.add(home); EntityManager.add(two);

  const vessel = {
    id: 'v_1', name: 'Merkury', shipId: 'hull_medium', systemId: 'sys_home',
    colonyId: 'p_home', homeColonyId: 'p_home', status: 'idle',
    position: { state: 'docked', dockedAt: 'p_home', x: 1 * AU, y: 0 },
    mission: null, movementOrder: null,
    fuel: { current: 40, max: 60, consumption: 1 }, warpFuel: { current: 0, max: 0 },
    endurance: { current: 10, max: 10 }, cargo: {}, cargoUsed: 0, cargoCapacity: 50,
    colonistCapacity: 0, colonists: 0, troopCapacity: 0,
    modules: ['engine_ion', 'cargo_small'], missionLog: [],
    isWreck: false, serviceState: 'active', unpaidYears: 0, refuelAutomatically: true, xp: 0,
  };
  const vessels = new Map([['v_1', vessel]]);
  const colony = {
    planetId: 'p_home', name: 'Dom', isOutpost: false,
    buildingSystem: { hasSpaceport: () => true },
    resourceSystem: { inventory: new Map(), getAmount: () => 10, canAfford: () => true, spend: () => true, receive: () => {} },
    civSystem: { freePops: 5 },
  };
  window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home', homePlanet: home,
    vesselManager: {
      _vessels: vessels, getVessel: (id) => vessels.get(id), getAllVessels: () => [...vessels.values()],
      isImmobilized: () => false, getVesselUpkeepCredits: () => 300, getVesselBaseUpkeepCredits: () => 300,
      _findEntity: (id) => EntityManager.get(id), deployVessel: () => {}, getVesselSensorRangeAU: () => 1,
    },
    colonyManager: {
      activePlanetId: 'p_home', getColony: (id) => (id === 'p_home' ? colony : null),
      getAllColonies: () => [colony], getPlayerColonies: () => [colony],
      isPlayerColony: () => true, _getShipyardLevel: () => 1,
    },
    missionSystem: { getActive: () => [] },
    techSystem: { isResearched: () => true, getShipSpeedMultiplier: () => 1, getMultiplier: () => 1, getFuelEfficiency: () => 1 },
    stationSystem: { getStationsAt: () => [] },
    uiManager: { _dirty: false, getSelectedVesselId: () => 'v_1' },
  };
  return { vessel, colony };
}

/** Zbiór stref jako porównywalny podpis: typ + actionId (BEZ x/y — geometria się różni). */
const sig = (zones) => zones.map((z) => z.type + (z.data?.actionId ? ':' + z.data.actionId : '')).sort();
const actionIds = (zones) => zones.filter((z) => z.type === 'action').map((z) => z.data.actionId).sort();
/** Footer-3 istnieje TYLKO na mapie (rysuje go adapter, nie `_drawRight`) — P1/P7 go pomijają. */
const FOOTER_TYPES = new Set(['mvpRetreat', 'mvpFleet', 'mvpDock']);
const sigBody = (zones) => sig(zones.filter((z) => !FOOTER_TYPES.has(z.type)));

function overlayDraw(fmo) {
  fmo._hitZones = [];
  fmo._drawRight(stubCtx(), 1600, 100, 300, 800,
    window.KOSMOS.vesselManager, window.KOSMOS.missionSystem, window.KOSMOS.colonyManager, 'p_home');
  return [...fmo._hitZones];
}

// ═══ C1 — baseline: `_drawRight` headless, NIEPUSTY, z konkretnymi akcjami ═══════════════════
header('C1  KONTROLA — baseline prawej kolumny Rejestru (anty-jałowość dla P1/P6)');
let GOLDEN = null, GOLDEN_ACTIONS = null;
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  const zones = overlayDraw(fmo);
  GOLDEN = sig(zones); GOLDEN_ACTIONS = actionIds(zones);
  ok(zones.length > 0, `_drawRight produkuje strefy (jest: ${zones.length})`);
  ok(GOLDEN_ACTIONS.includes('orbit') && GOLDEN_ACTIONS.includes('transport'),
     `baseline zawiera akcje orbit+transport (jest: ${JSON.stringify(GOLDEN_ACTIONS)})`);
}

// ═══ C2 — `_visible` rozłączne z overlayManagerem ════════════════════════════════════════════
header('C2  KONTROLA — świeży FMO jest niewidoczny (pole rozłączne z overlayManager.active)');
{
  const fmo = new FleetManagerOverlay();
  ok(fmo.isVisible === false, 'isVisible === false na świeżej instancji');
}

// ═══ C3 — gałąź floty JEST inna (dowód, że P7 mierzy różnicę, a nie nic) ═════════════════════
header('C3  KONTROLA — `_selectedFleetId` przełącza `_drawRight` na gałąź FLOTY');
let FLEET_BRANCH_SIG = null;
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  fmo._selectedFleetId = 'f_1';
  window.KOSMOS.fleetSystem = { getFleet: () => ({ id: 'f_1', name: 'Alfa', memberIds: ['v_1'], activeOrder: null }),
                                listFleets: () => [{ id: 'f_1', name: 'Alfa', memberIds: ['v_1'] }] };
  const zones = overlayDraw(fmo);
  FLEET_BRANCH_SIG = sig(zones);
  ok(JSON.stringify(FLEET_BRANCH_SIG) !== JSON.stringify(GOLDEN),
     'gałąź floty daje INNY zbiór stref niż gałąź statku (bez tego P7 byłby jałowy)');
  delete window.KOSMOS.fleetSystem;
}

// ═══ P1 — drawVesselPanel ≡ _drawRight ═══════════════════════════════════════════════════════
header('P1  PIN — panel mapy ≡ prawa kolumna Rejestru (ten sam zbiór stref)');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (typeof fmo.drawVesselPanel !== 'function') {
    ok(false, 'FleetManagerOverlay.drawVesselPanel istnieje');
    ok(false, 'panel mapy ≡ Rejestr (zbiór stref)');
    ok(false, 'panel mapy zawiera akcje orbit+transport (anty-jałowość)');
  } else {
    const overlayZones = overlayDraw(fmo);
    // ⚠ Panel mapy rezerwuje pasmo na footer, więc TREŚĆ jest niższa o MVP_FOOTER_H.
    //   Porównanie musi iść przy RÓWNEJ wysokości treści — `_clipRightHitZones` przycina
    //   strefy poniżej panelu, więc niższy panel dałby mniej stref i pin kłamałby o różnicy.
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 800 + MVP_FOOTER_H);
    const mapZones = [...fmo._hitZones];
    ok(true, 'FleetManagerOverlay.drawVesselPanel istnieje');
    ok(JSON.stringify(sigBody(mapZones)) === JSON.stringify(sig(overlayZones)),
       `zbiory stref identyczne BEZ footera (mapa: ${sigBody(mapZones).length}, overlay: ${sig(overlayZones).length})`);
    ok(mapZones.length > 0 && actionIds(mapZones).includes('orbit') && actionIds(mapZones).includes('transport'),
       `panel mapy NIEPUSTY i z akcjami orbit+transport (jest: ${JSON.stringify(actionIds(mapZones))})`);
  }
}

// ═══ P1-id — IDENTYCZNOŚĆ STRUKTURALNA, nie zbieżność wyniku ═════════════════════════════════
// ⚠ SEDNO WYBORU WARIANTU A. P1 wyżej porównuje DWA WYNIKI — i przeszedłby także wtedy, gdyby
//   `drawVesselPanel` był KOPIĄ renderu, która dziś przypadkiem daje to samo. Wtedy A po cichu
//   stałoby się mini-B (dwie rzeczy do utrzymania w zgodzie). Ten pin sprawdza MECHANIZM:
//   panel mapy musi WOŁAĆ `this._drawRight` na TEJ SAMEJ instancji, dokładnie raz.
header('P1-id  PIN — drawVesselPanel DELEGUJE do _drawRight (ta sama instancja, nie kopia)');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (typeof fmo.drawVesselPanel !== 'function') {
    ok(false, 'drawVesselPanel woła _drawRight dokładnie raz');
    ok(false, 'woła je na TEJ SAMEJ instancji (this === fmo)');
    ok(false, 'KONTROLA: bez wywołania drawVesselPanel szpieg milczy');
    ok(false, 'gałąź statku wymuszona TRANSIENTNIE — pola przywrócone po rysowaniu');
  } else {
    let calls = 0, sameThis = null, gotArgs = null;
    const orig = fmo._drawRight;
    fmo._drawRight = function (...a) { calls++; sameThis = (this === fmo); gotArgs = a; return orig.apply(this, a); };
    // KONTROLA niejałowości: szpieg nie może liczyć niczego, zanim zawołamy panel.
    ok(calls === 0, 'KONTROLA: bez wywołania drawVesselPanel szpieg milczy');
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 600);
    ok(calls === 1, `drawVesselPanel woła _drawRight dokładnie raz (jest: ${calls})`);
    ok(sameThis === true, 'woła je na TEJ SAMEJ instancji (this === fmo)');
    // D-MVP-5 — wymuszenie gałęzi jest TRANSIENTNE; nieprzywrócone pola zepsułyby Dowództwo.
    fmo._drawRight = orig;
    fmo._selectedFleetId = 'f_9';
    fmo._pendingSendSystemId = 'sys_061';
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 600);
    ok(fmo._selectedFleetId === 'f_9' && fmo._pendingSendSystemId === 'sys_061',
       `pola przywrócone po rysowaniu (fleet=${fmo._selectedFleetId}, send=${fmo._pendingSendSystemId})`);
  }
}

// ═══ P1-src — pin ŹRÓDŁOWY: jedna implementacja renderu, nie dwie ══════════════════
header('P1-src  PIN ŹRÓDŁOWY — w FMO istnieje DOKŁADNIE JEDNA implementacja `_drawRight`');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../ui/FleetManagerOverlay.js', import.meta.url), 'utf-8');
  // Kod BEZ komentarzy — komentarze cytują nazwę i same by pin zazieleniły
  // (reguła `source-pin-strip-comments`). Bez regex-ów: same operacje na łańcuchach.
  const lines = src.split(String.fromCharCode(10));
  const codeLines = lines.filter((l) => !l.trim().startsWith('//'));
  const defs = codeLines.filter((l) => l.startsWith('  _drawRight(')).length;
  ok(defs === 1, `dokładnie jedna definicja _drawRight (jest: ${defs})`);
  const code = codeLines.join(String.fromCharCode(10));
  const at = code.indexOf('  drawVesselPanel(ctx, x, y, w, h) {');
  const body = at >= 0 ? code.slice(at, at + 1800) : '';
  ok(body.includes('this._drawRight('), 'drawVesselPanel odwołuje się do this._drawRight (delegacja, nie kopia)');
  // KONTROLA: pin nie jest jałowy — ciało metody zostało realnie znalezione w źródle.
  ok(at >= 0 && body.length > 300, `KONTROLA: ciało drawVesselPanel znalezione w źródle (${body.length} zn.)`);
}

// ═══ P2 — router klików ══════════════════════════════════════════════════════════════════════
header('P2  PIN — handleVesselPanelClick routuje `action` do `_handleAction`');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (typeof fmo.handleVesselPanelClick !== 'function' || typeof fmo.drawVesselPanel !== 'function') {
    ok(false, 'FleetManagerOverlay.handleVesselPanelClick istnieje');
    ok(false, 'klik w strefę `action` dochodzi do _handleAction');
    ok(false, 'KONTROLA: klik POZA strefami nie woła _handleAction');
  } else {
    ok(true, 'FleetManagerOverlay.handleVesselPanelClick istnieje');
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 600);
    const spy = [];
    fmo._handleAction = (d) => spy.push(d);
    const z = fmo._hitZones.find((q) => q.type === 'action' && q.data?.actionId === 'orbit');
    if (!z) { ok(false, 'strefa action:orbit istnieje w panelu mapy (anty-jałowość)'); ok(false, 'kontrola'); }
    else {
      fmo.handleVesselPanelClick(z.x + z.w / 2, z.y + z.h / 2);
      ok(spy.length === 1 && spy[0].actionId === 'orbit', `klik w action:orbit dotarł do _handleAction (wywołań: ${spy.length})`);
      const before = spy.length;
      fmo.handleVesselPanelClick(-9999, -9999);
      ok(spy.length === before, 'KONTROLA: klik POZA strefami nie woła _handleAction');
    }
  }
}

// ═══ P3 — picker osiągalny z panelu mapy ═════════════════════════════════════════════════════
header('P3  PIN — picker celu osiągalny z panelu mapy');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (typeof fmo.drawVesselPanel !== 'function') {
    ok(false, 'po akcji `orbit` _missionConfig.step === "select"');
    ok(false, 'kolejne rysowanie panelu mapy emituje ≥1 strefę select_target');
  } else {
    const v = window.KOSMOS.vesselManager.getVessel('v_1');
    fmo._handleAction({ actionId: 'orbit', vessel: v });
    ok(fmo._missionConfig?.step === 'select', `_missionConfig.step === "select" (jest: ${fmo._missionConfig?.step})`);
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 600);
    const targets = fmo._hitZones.filter((z) => z.type === 'select_target');
    // ⚠ ANTY-JAŁOWOŚĆ: pusta lista celów przeszłaby „≥0" — wymagamy KONKRETNIE ≥1.
    ok(targets.length >= 1, `panel mapy emituje ≥1 select_target (jest: ${targets.length})`);
  }
}

// ═══ P4 — mutex po LICZBIE zaznaczenia ═══════════════════════════════════════════════════════
header('P4  PIN — mutex: 0 → none · 1 → vessel · ≥2 → group');
{
  const f = MapLogic?.resolveMapSelectionSurface;
  if (typeof f !== 'function') {
    ok(false, 'MapVesselPanelLogic.resolveMapSelectionSurface istnieje');
    ok(false, 'N==0 → none'); ok(false, 'N==1 → vessel'); ok(false, 'N==2 → group');
    ok(false, 'KONTROLA: N==1 po zejściu z 2 też → vessel (klucz = LICZBA, nie droga)');
  } else {
    ok(true, 'MapVesselPanelLogic.resolveMapSelectionSurface istnieje');
    ok(f([], { flagOn: true }) === 'none', 'N==0 → none');
    ok(f(['a'], { flagOn: true }) === 'vessel', 'N==1 → vessel');
    ok(f(['a', 'b'], { flagOn: true }) === 'group', 'N==2 → group');
    // Klucz to LICZBA, nie historia — `removeFromSelection` 2→1 ląduje na tym samym wyniku.
    ok(f(['b'], { flagOn: true, prevCount: 2 }) === 'vessel',
       'KONTROLA: N==1 po zejściu z 2 też → vessel (klucz = LICZBA, nie droga dojścia)');
  }
}

// ═══ P5 — brak podwójnego producenta stref ═══════════════════════════════════════════════════
header('P5  PIN — dwa rysowania pod rząd nie mnożą stref (D-MVP-4)');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (typeof fmo.drawVesselPanel !== 'function') {
    ok(false, 'liczba stref action:orbit po dwóch rysowaniach === 1');
  } else {
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 600);
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 600);
    const n = fmo._hitZones.filter((z) => z.type === 'action' && z.data?.actionId === 'orbit').length;
    ok(n === 1, `dokładnie JEDNA strefa action:orbit (jest: ${n}) — nie ">= 1"`);
  }
}

// ═══ C6 — regresja prawej kolumny Rejestru ═══════════════════════════════════════════════════
header('C6  KONTROLA — golden prawej kolumny Rejestru nietknięty');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  const zones = overlayDraw(fmo);
  ok(zones.length > 0, `golden niepusty (jest: ${zones.length})`);
  ok(JSON.stringify(sig(zones)) === JSON.stringify(GOLDEN), 'zbiór stref Rejestru identyczny z C1');
}

// ═══ P7 — wymuszenie gałęzi statku ═══════════════════════════════════════════════════════════
header('P7  PIN — panel mapy wymusza gałąź STATKU mimo `_selectedFleetId` (D-MVP-5)');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  fmo._selectedFleetId = 'f_1';
  fmo._pendingSendSystemId = 'sys_061';
  window.KOSMOS.fleetSystem = { getFleet: () => ({ id: 'f_1', name: 'Alfa', memberIds: ['v_1'], activeOrder: null }),
                                listFleets: () => [{ id: 'f_1', name: 'Alfa', memberIds: ['v_1'] }] };
  if (typeof fmo.drawVesselPanel !== 'function') {
    ok(false, 'panel mapy renderuje gałąź statku mimo _selectedFleetId/_pendingSendSystemId');
  } else {
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 800 + MVP_FOOTER_H);
    ok(JSON.stringify(sigBody([...fmo._hitZones])) === JSON.stringify(GOLDEN),
       'panel mapy renderuje gałąź STATKU (zbiór == golden), nie gałąź floty/pickera');
  }
  delete window.KOSMOS.fleetSystem;
}

// ═══ P-open — panel nie perturbuje isAnyOpen() ═══════════════════════════════════════════════
header('P-open  PIN — rysowanie panelu nie ustawia `_visible` (D-MVP-7)');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (typeof fmo.drawVesselPanel !== 'function') {
    ok(false, 'po drawVesselPanel isVisible === false');
    ok(false, 'KONTROLA: po open() isVisible === true');
  } else {
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 600);
    ok(fmo.isVisible === false, 'po drawVesselPanel isVisible === false');
    fmo.open();
    ok(fmo.isVisible === true, 'KONTROLA: po open() isVisible === true (pin nie jest jałowy)');
    fmo.close();
  }
}

// ═══ P-flag — kill-switch ════════════════════════════════════════════════════════════════════
header('P-flag  PIN — `mapVesselPanel:false` ⇒ N==1 obsługuje GRUPA (dzisiejsze zachowanie)');
{
  const f = MapLogic?.resolveMapSelectionSurface;
  if (typeof f !== 'function') {
    ok(false, 'flagOn:false ⇒ N==1 → group');
    ok(false, 'KONTROLA: flagOn:true ⇒ N==1 → vessel');
  } else {
    ok(f(['a'], { flagOn: false }) === 'group', 'flagOn:false ⇒ N==1 → group (bit w bit jak dziś)');
    ok(f(['a'], { flagOn: true }) === 'vessel', 'KONTROLA: flagOn:true ⇒ N==1 → vessel');
  }
}

// ═══ P-scroll — wspólny scroll (D-MVP-6) ═════════════════════════════════════════════════════
header('P-scroll  PIN — `_rightScrollY` WSPÓLNY, reset przy zmianie statku dalej działa');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (typeof fmo.drawVesselPanel !== 'function') {
    ok(false, 'scroll ustawiony na mapie jest widoczny w overlayu (wspólne pole)');
    ok(false, 'KONTROLA: zmiana statku resetuje scroll');
  } else {
    // ⚠ Panel MUSI być niższy niż treść, inaczej `_drawRight` zaciska scroll do 0 (maxS=0)
    //   i pin przechodziłby jałowo — mierzyłby clamp, nie współdzielenie pola.
    fmo.drawVesselPanel(stubCtx(), 20, 400, 300, 200);
    ok(fmo._rightContentH > 200, `KONTROLA: treść przekracza panel (${fmo._rightContentH} > 200) — scroll ma sens`);
    fmo._rightScrollY = 40;
    fmo._drawRight(stubCtx(), 1600, 100, 300, 200, window.KOSMOS.vesselManager,
      window.KOSMOS.missionSystem, window.KOSMOS.colonyManager, 'p_home');
    ok(fmo._rightScrollY === 40, `scroll z mapy widoczny w overlayu — TO SAMO pole (jest: ${fmo._rightScrollY})`);
    fmo._selectedVesselId = 'v_2';
    window.KOSMOS.vesselManager._vessels.set('v_2',
      { ...window.KOSMOS.vesselManager.getVessel('v_1'), id: 'v_2', name: 'Wenus' });
    fmo._drawRight(stubCtx(), 1600, 100, 300, 200, window.KOSMOS.vesselManager,
      window.KOSMOS.missionSystem, window.KOSMOS.colonyManager, 'p_home');
    ok(fmo._rightScrollY === 0, `KONTROLA: zmiana statku resetuje scroll (jest: ${fmo._rightScrollY})`);
  }
}

// ═══ P-mount — SPOSÓB SKŁADANIA SCENY, nie samo istnienie adaptera ════════════════
// ⚠ Lekcja W3 („skonstruowany ≠ zamontowany”): reguła może żyć i być poprawna, a mimo to nie
//   istnieć dla gracza, bo nikt jej nie wpiął. Wszyscy konsumenci czytają przez `?.`, więc
//   NIC NIE KRZYCZY. `UIManager` nie importuje się pod node ⇒ pin źródłowy, z kontrolami.
header('P-mount  PIN ŹRÓDŁOWY — adapter jest ZAMONTOWANY w UIManagerze');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf-8');
  const code = src.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  ok(code.includes("from '../ui/MapVesselPanelLogic.js'"), 'UIManager importuje regułę mutexu');
  ok(code.includes('drawVesselPanel'), 'UIManager RYSUJE panel statku (drawVesselPanel)');
  ok(code.includes('handleVesselPanelClick'), 'UIManager ROUTUJE klik (handleVesselPanelClick)');
  ok(code.includes("_mapSurface() === 'group'"), 'panel grupy bramkowany na _mapSurface()===group');
  ok(code.includes("_mapSurface() === 'vessel'"), 'panel statku bramkowany na _mapSurface()===vessel');
  ok(code.length > 50000, `KONTROLA: źródło UIManagera realnie wczytane (${code.length} zn.)`);
  ok(!code.includes('drawVesselPanelXYZZY'), 'KONTROLA: pin nie przechodzi na dowolnym tokenie');
}

// ═══ P8 — scalenie docka 2→1 jest CZYSTYM PRZERZUTEM, nie zmianą zachowania ═══════════════
header('P8  PIN — dock: JEDNO źródło, a dwie stare powierzchnie działają jak DZIŚ');
{
  world();
  if (!VGA) { for (let i = 0; i < 10; i++) ok(false, 'VesselGroupActions istnieje (P8)'); }
  else {
  const issued = [];
  window.KOSMOS.movementOrderSystem = { issueOrder: (id, spec) => { issued.push({ id, spec }); return { ok: true }; } };
  const res = VGA.dispatchDockTo(['v_1', 'v_9'], 'p_home');
  ok(issued.length === 2, `rozkaz poszedł do KAŻDEGO statku (jest: ${issued.length})`);
  const sp = issued[0]?.spec ?? {};
  ok(sp.type === 'dock' && sp.targetBodyId === 'p_home' && !!sp.targetName && !!sp.targetPoint,
     `kształt spec-a identyczny ze starymi kopiami (${JSON.stringify(Object.keys(sp).sort())})`);
  ok(res.okCount === 2, `okCount złożony poprawnie (jest: ${res.okCount})`);

  const { readFileSync } = await import('node:fs');
  const strip = (f) => readFileSync(new URL(f, import.meta.url), 'utf-8')
    .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  const fgp = strip('../../ui/FleetGroupPanel.js');
  const fcp = strip('../../ui/FleetCommandPanel.js');
  const vga = strip('../../ui/VesselGroupActions.js');
  // 2 → 1: żadna ze starych powierzchni nie konstruuje już rozkazu dock sama.
  ok(!fgp.includes("type: 'dock'"), 'FleetGroupPanel NIE konstruuje już rozkazu dock sam');
  ok(!fcp.includes("type: 'dock'"), 'FleetCommandPanel NIE konstruuje już rozkazu dock sam');
  ok(vga.includes("type: 'dock'"), 'KONTROLA: rozkaz dock konstruuje WYŁĄCZNIE VesselGroupActions');
  // Kontrola dwustronna — brak literalu mógłby znaczyć „funkcję usunięto", nie „przeniesiono".
  ok(fgp.includes('openDockPicker('), 'KONTROLA: FleetGroupPanel woła openDockPicker');
  ok(fcp.includes('openDockPicker('), 'KONTROLA: FleetCommandPanel woła openDockPicker');
  ok(fgp.includes('assignVesselsToFleet('), 'KONTROLA: FleetGroupPanel woła assignVesselsToFleet');
  // BIT W BIT: stare powierzchnie NIE proszą o zawężenie do własnego układu (to Finding 256).
  ok(!fgp.includes('sameSystemOnly: true') && !fcp.includes('sameSystemOnly: true'),
     'stare powierzchnie NIE używają sameSystemOnly:true — zachowanie sprzed 258');
  }
}

// ═══ P9 — szew `sameSystemOnly` (Finding 256) działa W OBIE STRONY ════════════════════════
header('P9  PIN — sameSystemOnly odsiewa cel z obcego układu, a false go ZACHOWUJE');
{
  world();
  if (!VGA) { for (let i = 0; i < 3; i++) ok(false, 'VesselGroupActions istnieje (P9)'); }
  else {
  EntityManager.add({ id: 'p_far', type: 'planet', name: 'Obca', x: 4 * AU, y: 0, systemId: 'sys_061' });
  const targets = [{ id: 'p_home' }, { id: 'p_far' }];
  const v = window.KOSMOS.vesselManager.getVessel('v_1');   // sys_home
  const kept = VGA.filterDockTargets(targets, v, true).map((x) => x.id);
  ok(kept.length === 1 && kept[0] === 'p_home', `true ⇒ zostaje tylko własny układ (jest: ${JSON.stringify(kept)})`);
  const all = VGA.filterDockTargets(targets, v, false).map((x) => x.id);
  ok(all.length === 2, `KONTROLA: false ⇒ lista NIETKNIĘTA (jest: ${JSON.stringify(all)})`);
  const warp = VGA.filterDockTargets(targets, { ...v, systemId: null }, true);
  ok(warp.length === 0, `tranzyt warp (systemId=null) ⇒ brak celów (jest: ${warp.length})`);
  }
}

// ═══ P-footer — trzy akcje na mapie, dyspozycja przez JEDNO źródło ════════════════════════
header('P-footer  PIN — Odwrót / → Flota / Dokuj na panelu mapy');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  const v = window.KOSMOS.vesselManager.getVessel('v_1');
  v.position.state = 'orbiting';           // Odwrót wymaga statku w przestrzeni
  window.KOSMOS.fleetSystem = { listFleets: () => [] };
  fmo.drawVesselPanel(stubCtx(), 20, 100, 300, 600);
  const foot = fmo._hitZones.filter((z) => FOOTER_TYPES.has(z.type)).map((z) => z.type).sort();
  ok(foot.length === 3, `footer wystawia DOKŁADNIE 3 strefy (jest: ${foot.length} — ${JSON.stringify(foot)})`);
  const issued = [];
  window.KOSMOS.movementOrderSystem = { issueOrder: (id, spec) => { issued.push(spec.type); return { ok: true }; } };
  const rz = fmo._hitZones.find((z) => z.type === 'mvpRetreat');
  if (!rz) ok(false, 'strefa mvpRetreat istnieje (bez niej nie ma czego klikać)');
  else {
    fmo.handleVesselPanelClick(rz.x + 2, rz.y + 2);
    ok(issued.length === 1 && issued[0] === 'retreat', `Odwrót dyspozycjonuje rozkaz retreat (jest: ${JSON.stringify(issued)})`);
  }
  const { readFileSync } = await import('node:fs');
  const fmoSrc = readFileSync(new URL('../../ui/FleetManagerOverlay.js', import.meta.url), 'utf-8')
    .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  const at = fmoSrc.indexOf('_handleVesselPanelFooter(zone) {');
  const body = at >= 0 ? fmoSrc.slice(at, at + 1400) : '';
  ok(body.includes('assignVesselsToFleet(') && body.includes('openDockPicker('),
     'footer dyspozycjonuje przez VesselGroupActions (jedno źródło)');
  ok(!body.includes("type: 'dock'"), 'footer NIE ma własnej kopii rozkazu dock');
  ok(body.includes('sameSystemOnly: true'), 'panel mapy prosi o sameSystemOnly:true (Finding 256)');
  ok(at >= 0 && body.length > 300, `KONTROLA: ciało _handleVesselPanelFooter znalezione (${body.length} zn.)`);
}

// ═══ P10 — obie stare powierzchnie NADAL SIĘ WYKONUJĄ po przerzucie ═══════════════════════
// ⚠ `node --check` NIE JEST TESTEM (lekcja z arca OG-4). Usunięcie importu osieroconego przez
//   przerzut zostawia poprawną SKŁADNIĘ i `ReferenceError` dopiero przy pierwszym kliknięciu.
//   Żaden keeper w repo nie wykonywał tych dwóch paneli (sprawdzone: tylko `FleetGroupPanelLogic`),
//   więc bez tego pinu regresja 2→1 przeszłaby na zielono.
header('P10  PIN — FleetGroupPanel / FleetCommandPanel wykonują się po scaleniu docka');
{
  const callSafe = (fn) => { try { fn(); return null; } catch (e) { return e; } };
  // KONTROLA HELPERA: musi realnie wykrywać ReferenceError, inaczej cały pin jest jałowy.
  ok(callSafe(() => { __nieistniejacy_symbol__(); }) instanceof ReferenceError,
     'KONTROLA: helper wykrywa ReferenceError');

  world();
  const { FleetGroupPanel }   = await import('../../ui/FleetGroupPanel.js');
  const { FleetCommandPanel } = await import('../../ui/FleetCommandPanel.js');
  window.KOSMOS.movementOrderSystem = { issueOrder: () => ({ ok: true }), cancelOrder: () => true };
  window.KOSMOS.fleetSystem = {
    listFleets: () => [{ id: 'f_1', name: 'Alfa', memberIds: ['v_1'] }],
    getFleet: () => ({ id: 'f_1', name: 'Alfa', memberIds: ['v_1'], activeOrder: null, doctrine: null }),
    createFleet: () => ({ id: 'f_1' }), addMember: () => ({ ok: true }),
  };

  const gp = new FleetGroupPanel();
  gp._ids = ['v_1'];
  ok(callSafe(() => gp.draw(stubCtx(), 1920, 1080)) === null, 'FleetGroupPanel.draw() nie rzuca');
  for (const type of ['grpDock', 'assignFleet']) {
    const e = callSafe(() => gp._onHit({ type }));
    ok(!(e instanceof ReferenceError), `FleetGroupPanel ${type} bez ReferenceError (${e?.name ?? 'brak wyjątku'})`);
  }

  const cp = new FleetCommandPanel();
  cp._fleetId = 'f_1';
  const e2 = callSafe(() => cp._onHit({ type: 'bgDock' }));
  ok(!(e2 instanceof ReferenceError), `FleetCommandPanel bgDock bez ReferenceError (${e2?.name ?? 'brak wyjątku'})`);
}

console.log(`\n═══ ${pass}/${pass + fail} OK, ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
