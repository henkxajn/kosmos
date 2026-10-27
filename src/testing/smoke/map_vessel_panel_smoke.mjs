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
//   P-flag   kill-switch `mapVesselPanel` usunięty (REFORMA ZAKŁADEK T4) — przy N==1 powierzchnią jest `vessel`
//            niezależnie od drugiego argumentu (dawne `{ flagOn: false }` → `group` już nie istnieje)
//   P-scroll `_rightScrollY` WSPÓLNY (D-MVP-6) + reset przy zmianie statku dalej działa
//   P11      RENDER: przy każdym N (0/1/≥2) rysuje DOKŁADNIE JEDNA powierzchnia, a w UIManagerze
//            jest JEDEN producent każdego rysowania (odpowiedź na ① z live-gate'u 2026-09-07 —
//            fakt był prawdziwy, ale NIC go nie pilnowało)
//   P-A1     żadna powierzchnia keyed-on-N nie wystawia „Powrotu" (dokończenie Findingu 145 (a');
//            Odwrót ZOSTAJE — to inna akcja). Zwęża też Finding 154: producentów 3 → 2.
//   P12      ③ — klik w PROSTOKĄT panelu jest pochłaniany ZAWSZE, także bez trafienia w strefę
//            (kontrola kierunku: poza prostokątem nadal `false`, inaczej panel zjadałby mapę)
//   ⚠ P11, P12 — PRZECELOWANE 2026-10-24 (REFORMA ZAKŁADEK T3, `TABS_REFORM_PLAN.md` §5.3, za zgodą): piny bez zmian
//     (prostokąt panelu niezależny od kotwicy); dochodzą warianty „-T3” — panel przy wierszu prawego outlinera
//     (`shipPanelOutliner` ON): jeden producent rysowania za bramką trybu Y (D-TR-10) i pochłanianie kliku w nowym
//     prostokącie (wspólna krawędź z kolumną — `seamRight`).
//   ⚠ P-flag, P-mount, P11 — PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): flagi kroków na
//     stałe ON — w `UIManager` panel statku nad mapą to panel T5 (`_drawShipPanelHud`, klik `_vesselPanelClick`), panel
//     floty / grupy to panel T6 (`_drawFleetPanelHud`); dawne wywołania `drawVesselPanel` / `fleetGroupPanel.draw` w
//     `UIManager` usunięte (metody dawnych paneli — do kolejnego kroku T4; `drawFor` w P11 rysuje je wprost jako wyrocznię).
//   ⚠ T4-3 — PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): dawny panel statku nad mapą
//     (adapter `drawVesselPanel` / `handleVesselPanelClick` / `handleVesselPanelScroll`, płyta, footer, `_vesselPanelRect`)
//     i rysunek dawnych paneli grupy i floty USUNIĘTE; „warianty T5 / T6 stają się jedynymi”. Usunięte razem z adapterem
//     (podmiot zniknął; następca w nawiasie): P1 / P1-id / P1-src (panel ≡ Rejestr przez delegację — strefy panelu T5 ≡
//     migawka panelu T3: `ship_panel_hud_smoke` H1), P2 / P3 / P5 (router, picker, jeden producent stref — T5: H2, H6, H11),
//     P7 (gałąź statku mimo floty — model T5 bierze statek wprost), P-open, P-scroll (wspólny scroll — T5 przewija własną
//     listę: H7h), P12 / P12-T3 (pochłanianie kliku w prostokąt — T5: H4), P-plate (płyta T3 — T5 bez ramki). Przecelowane
//     na panel statku T5 i panel grupy T6: P-footer (chipy footera T5 → prawdziwe `_handleVesselPanelFooter`), P10 (stan
//     i akcje paneli floty i grupy wykonują się bez rysunku — `_onHit` każdego typu), P11 (jedna powierzchnia na N: model
//     T5 przy N == 1, model grupy T6 przy N ≥ 2, `fleetHudSurface`), P-A1 (bez „Powrotu” w modelach T5 / T6), P13
//     (integracja: łańcuch klików panelu T5 → PRAWDZIWY `MissionSystem`); P-mount — także FMO bez adaptera.
//   P13      INTEGRACJA — akcja CELOWANA klikana z panelu mapy zmienia stan PRAWDZIWEGO
//            `MissionSystem` (+ P13-src: pin premisy populacji)
//   P-plate  płyta tła pokrywa CAŁY prostokąt panelu i NIE jest strefą (absorber ③ ma być
//            widoczny; golden P1/C6 i prostokąt-bramka P12 bez zmian)
//
// ⚠ Piny commitu 3 (footer-3 + `sameSystemOnly`) dochodzą osobno: P8/P9.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// ⚠ LEKCJA, KTÓRA KOSZTOWAŁA JEDNĄ RUNDĘ LIVE-GATE'U — FIXTURE MUSI POCHODZIĆ Z POPULACJI
//   OSIĄGALNEJ NA NOWEJ POWIERZCHNI.
//
//   Ten keeper świecił 66/66, a live-gate 2026-09-07 złapał trzy defekty. Powód nie był taki,
//   że pinów było za mało — tylko taki, że wszystkie mierzyły LOGIKĘ, a żaden INTEGRACJI:
//
//   (a) FIXTURE Z NIEOSIĄGALNEJ POPULACJI. `world()` buduje statek ZADOKOWANY, bo tak najłatwiej
//       dostać bogaty zbiór akcji. Ale zadokowany statek NIE MA SPRITE'A na mapie 3D
//       (`ThreeRenderer._syncVesselPositions`: usuwa i NIE odtwarza; `_restoreActiveSystemVesselSprites`
//       robi `continue`) ⇒ GRACZ NIE MOŻE GO KLIKNĄĆ. P1/P2/P3 pinowały więc stan, którego ta
//       powierzchnia NIGDY nie widzi. Populacja mapy to `orbiting` / `in_transit` — i tam zbiór
//       akcji jest INNY (zmierzone: dok `["found_outpost","orbit","transport"]` vs mapa
//       `["redirect","transport"]`). P13 prowadzi fixture z TEJ populacji i pinuje różnicę wprost.
//
//   (b) PINOWANA TYLKO ŚCIEŻKA UDANA. P2 sprawdzało klik, który TRAFIA w strefę. ③ siedziało
//       w ścieżce NIETRAFIONEJ (`return false` → klik leci do mapy 3D). Pin ścieżki sukcesu nie
//       widzi defektu ścieżki porażki — P12 dokłada tę drugą, z kontrolą kierunku.
//
//   (c) KONIEC ŁAŃCUCHA NA ATRAPIE. Piny kończyły się na `_handleAction` / `_missionConfig.step`.
//       P13 idzie do końca: akcja → picker → potwierdzenie → PRAWDZIWY `MissionSystem` → zmiana
//       stanu (`targetId` p_two → p_thr) + wywołanie na `VesselManager`.
//
//   ⚠ Reguła na przyszłość: gdy pin dotyka NOWEJ powierzchni, najpierw ustal, JAKI STAN encji
//     ta powierzchnia w ogóle pokazuje — i dopiero z tego zbioru bierz fixture. Bogatszy fixture
//     z innej powierzchni daje zielony pin i zero pokrycia.
// ══════════════════════════════════════════════════════════════════════════════════════════
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

const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');
const { GAME_CONFIG }         = await import('../../config/GameConfig.js');
const EntityManager           = (await import('../../core/EntityManager.js')).default;

// Moduł mutexu — fail-first NIE ISTNIEJE. Import owinięty, żeby keeper nie umarł na starcie
// (martwy harness = 0/0 = fałszywa zieleń, nie fail-first).
let MapLogic = null;
try { MapLogic = await import('../../ui/MapVesselPanelLogic.js'); } catch { /* fail-first */ }
let VGA = null;
try { VGA = await import('../../ui/VesselGroupActions.js'); } catch { /* fail-first */ }
// REFORMA ZAKŁADEK T4-3 — powierzchnie mapy: panel statku T5 (renderer + model) i panel floty / grupy T6 (model).
let Y5 = null, L5 = null, L6 = null;
try { Y5 = await import('../../ui/ShipPanelHudLayer.js'); } catch { /* piny padną */ }
try { L5 = await import('../../ui/ShipPanelHudLogic.js'); } catch { /* piny padną */ }
try { L6 = await import('../../ui/FleetPanelHudLogic.js'); } catch { /* piny padną */ }

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

/** Atrapa ctx z fontem (pomiar 0,6 em na znak) — renderer T5 czyta rozmiar fontu. */
function fontCtx() {
  let font = '10px monospace';
  return new Proxy({}, {
    get(o, k) {
      if (k === 'font') return font;
      if (k === 'measureText') return (str) => ({ width: [...String(str)].length * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 10) * 0.6 });
      if (k === 'canvas') return { width: 1920, height: 1080 };
      if (k in o) return o[k];
      return typeof k === 'string' ? () => {} : undefined;
    },
    set(o, k, v) { if (k === 'font') font = v; else o[k] = v; return true; },
  });
}
/** Panel statku T5 (prawdziwy `ShipPanelHudLayer`): model, układ i rysunek w (930, 60); strefy z tej klatki. */
function t5Zones(fmo, lay, { open = false } = {}) {
  if (!lay || !L5) return [];
  const vid = fmo._selectedVesselId;
  if (open && !L5.ordersOpen?.(lay._open, vid)) lay._open = L5.toggleOrders(lay._open, vid);
  const ctx = fontCtx();
  const sz = lay.prepare({ ctx, K: window.KOSMOS, fmo, vesselId: vid, maxH: 4000, features: GAME_CONFIG.FEATURES });
  if (sz) lay.draw(ctx, { x: 930, y: 60, w: sz.w, h: sz.h }, {});
  return [...(lay._zones ?? [])];
}
const t5Click = (lay, fmo, z) => lay.handleClick(z.x + z.w / 2, z.y + z.h / 2, { K: window.KOSMOS, fmo });
const t5ModelTypes = (fmo, vessel) => (L5?.modelZones?.(L5.buildShipPanelModel(vessel, { K: window.KOSMOS, fmo, features: GAME_CONFIG.FEATURES })) ?? []).map((z) => z.type);
const t6GroupTypes = (vessels) => (L6?.modelZones?.(L6.buildGroupPanelModel(vessels, { K: window.KOSMOS, leadId: vessels[0]?.id ?? null })) ?? []).map((z) => z.type);

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

// ═══ P-flag — kill-switch ════════════════════════════════════════════════════════════════════
header('P-flag  PIN — kill-switch `mapVesselPanel` usunięty (T4): N==1 obsługuje panel STATKU zawsze');
{
  const f = MapLogic?.resolveMapSelectionSurface;
  if (typeof f !== 'function') {
    ok(false, 'N==1 → vessel bez względu na drugi argument');
    ok(false, 'KONTROLA: N==2 → group');
  } else {
    ok(f(['a'], { flagOn: false }) === 'vessel' && f(['a'], false) === 'vessel' && f(['a']) === 'vessel',
      'N==1 → vessel bez względu na drugi argument (dawne `{ flagOn: false }` → `group` usunięte w T4)');
    ok(f(['a', 'b']) === 'group' && f([]) === 'none', 'KONTROLA: N==2 → group, N==0 → none (mutex po liczbie bez zmian)');
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
  ok(code.includes('this._drawShipPanelHud(ctx, W, H)'), 'UIManager RYSUJE panel statku (panel T5 — `_drawShipPanelHud`)');
  ok(code.includes('this._vesselPanelClick(x, y)') && code.includes('this._shipPanelHud.handleClick('), 'UIManager ROUTUJE klik (`_vesselPanelClick` → panel T5)');
  ok(code.includes('this._drawFleetPanelHud(ctx, W, H)') && code.includes("surf !== 'groupHud'"), 'panel grupy — panel T6 (`_drawFleetPanelHud`, powierzchnia `groupHud`)');
  ok(!code.includes('drawVesselPanel') && !code.includes('fleetGroupPanel.draw(') && !code.includes('fleetCommandPanel.draw('),
    'dawne panele (statku T3, grupy, floty) NIE są rysowane przez UIManager (T4)');
  ok(code.includes("_mapSurface() === 'vessel'"), 'panel statku bramkowany na _mapSurface()===vessel');
  ok(code.length > 50000, `KONTROLA: źródło UIManagera realnie wczytane (${code.length} zn.)`);
  ok(!code.includes('drawVesselPanelXYZZY'), 'KONTROLA: pin nie przechodzi na dowolnym tokenie');
  const fmoSrcM = readFileSync(new URL('../../ui/FleetManagerOverlay.js', import.meta.url), 'utf-8')
    .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  ok(!/drawVesselPanel\(|_drawVesselPanelFooter\(|handleVesselPanelClick\(|handleVesselPanelScroll\(|_vesselPanelRect|MVP_FOOTER_H/.test(fmoSrcM)
     && /_handleVesselPanelFooter\(zone\) \{/.test(fmoSrcM) && /_drawRight\(ctx, x, y, w, h, vMgr, ms, colMgr, activePid, opts = \{\}\) \{/.test(fmoSrcM),
     'FMO: adapter dawnego panelu statku nad mapą usunięty (T4-3); `_handleVesselPanelFooter` (cele footera T5) i `_drawRight` zostają');
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
  // ⚠ PIN PRZECELOWANY (Finding 256 ZAMKNIĘTY, kształt „A + C"). W wersji 258 stał tu pin
  //   ODWRÓCONY: „stare powierzchnie NIE używają sameSystemOnly:true — zachowanie sprzed 258".
  //   Pinował DEFEKT (ofertę cross-system) i MIAŁ PAŚĆ przy domknięciu 256 — i padł, co było
  //   sygnałem, że kształt (a) faktycznie dotknął tych dwóch site'ów. Teraz pinuje INWARIANT.
  // ⚠ Sam `sameSystemOnly: true` NIE WYSTARCZA i to jest mierzony sedno-fakt 256:
  //   `filterDockTargets` ma guard `if (!vessel) return list`, więc bez reprezentanta flaga jest
  //   NO-OPEM (zmierzone: `filterDockTargets(all, null, true)` zwraca WSZYSTKIE trzy ciała).
  //   Dlatego pin wymaga OBU rzeczy naraz: flagi i przekazanego statku.
  ok(fgp.includes('sameSystemOnly: true') && /vessel:\s*live\[0\]/.test(fgp),
     'FleetGroupPanel prosi o sameSystemOnly:true I podaje reprezentanta (Finding 256, kształt a)');
  ok(fcp.includes('sameSystemOnly: true') && /vessel:\s*first/.test(fcp),
     'FleetCommandPanel prosi o sameSystemOnly:true I podaje reprezentanta (Finding 256, kształt a)');
  // KONTROLA PINU — na zmutowanej kopii (flaga bez statku) ten sam pin PADA.
  ok(!(/vessel:\s*live\[0\]/.test('openDockPicker(ids, { sameSystemOnly: true, onDone });')),
     'KONTROLA PINU: sama flaga BEZ reprezentanta nie przechodzi (no-op `filterDockTargets`)');
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
// T4-3: footer-3 żyje na panelu statku T5 (chipy „Odwrót / → Flota / Dokuj”) — klik idzie do TEGO SAMEGO celu co dawny
// panel T3 (`FleetManagerOverlay._handleVesselPanelFooter` → `VesselGroupActions` / MOS).
header('P-footer  PIN — Odwrót / → Flota / Dokuj na panelu statku nad mapą (T5 → `_handleVesselPanelFooter`)');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  const v = window.KOSMOS.vesselManager.getVessel('v_1');
  v.position.state = 'orbiting';           // Odwrót wymaga statku w przestrzeni
  window.KOSMOS.fleetSystem = { listFleets: () => [] };
  const lay = Y5 ? new Y5.ShipPanelHudLayer() : null;
  const zones = t5Zones(fmo, lay);
  const foot = zones.filter((z) => z.kind === 'chip' && z.enabled !== false && FOOTER_TYPES.has(z.zone?.type)).map((z) => z.zone.type).sort();
  ok(foot.length === 3, `footer wystawia DOKŁADNIE 3 chipy na panelu T5 (jest: ${foot.length} — ${JSON.stringify(foot)})`);
  const issued = [];
  window.KOSMOS.movementOrderSystem = { issueOrder: (id, spec) => { issued.push(spec.type); return { ok: true }; } };
  const rz = zones.find((z) => z.zone?.type === 'mvpRetreat');
  if (!rz) ok(false, 'chip mvpRetreat istnieje (bez niego nie ma czego klikać)');
  else {
    t5Click(lay, fmo, rz);
    ok(issued.length === 1 && issued[0] === 'retreat', `Odwrót (prawdziwy klik chipa T5 → \`_handleVesselPanelFooter\`) dyspozycjonuje rozkaz retreat (jest: ${JSON.stringify(issued)})`);
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
  delete window.KOSMOS.fleetSystem;
}

// ═══ P10 — obie stare powierzchnie NADAL SIĘ WYKONUJĄ po przerzucie ═══════════════════════
// ⚠ `node --check` NIE JEST TESTEM (lekcja z arca OG-4). Usunięcie importu osieroconego przez
//   przerzut zostawia poprawną SKŁADNIĘ i `ReferenceError` dopiero przy pierwszym kliknięciu.
// ⚠ T4-3: rysunek obu paneli usunięty (importy rysunku zniknęły razem z nim) — zostają stan i `_onHit`, który wołają chipy
//   panelu T6. Pin wykonuje KAŻDY obsługiwany typ strefy obu paneli: żaden nie może skończyć się `ReferenceError`.
header('P10  PIN — FleetGroupPanel / FleetCommandPanel: stan i akcje wykonują się bez rysunku (T4-3)');
{
  const callSafe = (fn) => { try { fn(); return null; } catch (e) { return e; } };
  // KONTROLA HELPERA: musi realnie wykrywać ReferenceError, inaczej cały pin jest jałowy.
  ok(callSafe(() => { __nieistniejacy_symbol__(); }) instanceof ReferenceError,
     'KONTROLA: helper wykrywa ReferenceError');

  world();
  const { FleetGroupPanel }   = await import('../../ui/FleetGroupPanel.js');
  const { FleetCommandPanel } = await import('../../ui/FleetCommandPanel.js');
  const calls = [];
  window.KOSMOS.movementOrderSystem = { issueOrder: (id, s) => { calls.push(['issueOrder', s?.type]); return { ok: true }; },
    cancelOrder: (id) => { calls.push(['cancelOrder', id]); return true; } };
  window.KOSMOS.fleetSystem = {
    listFleets: () => [{ id: 'f_1', name: 'Alfa', memberIds: ['v_1'] }],
    getFleet: () => ({ id: 'f_1', name: 'Alfa', memberIds: ['v_1'], activeOrder: null, doctrine: null }),
    createFleet: () => ({ id: 'f_1' }), addMember: () => ({ ok: true }),
    issueFleetOrder: () => ({ ok: true, accepted: [], rejected: [] }), cancelFleetOrder: (id) => { calls.push(['cancelFleetOrder', id]); },
    disbandFleet: () => {}, setDoctrine: () => {}, setName: () => {}, removeMember: () => {},
  };
  window.KOSMOS.vesselManager.undockToOrbit = () => {};
  window.KOSMOS.vesselManager.manualRefuel = () => {};

  const gp = new FleetGroupPanel();
  ok(typeof gp.draw === 'undefined' && typeof gp.handleClick === 'undefined' && typeof gp._onHit === 'function',
     'FleetGroupPanel: rysunek i klik w prostokąt usunięte (T4-3), `_onHit` (cel chipów T6) zostaje');
  gp._ids = ['v_1']; gp.show();
  for (const type of ['minimize', 'restore', 'focus', 'remove', 'assignFleet', 'grpRefuel', 'grpStop', 'grpRetreat', 'grpUndock', 'grpDock']) {
    const e = callSafe(() => gp._onHit({ type, data: { id: 'v_1' } }));
    ok(!(e instanceof ReferenceError), `FleetGroupPanel ${type} bez ReferenceError (${e?.name ?? 'brak wyjątku'})`);
  }
  ok(calls.some((c) => c[0] === 'cancelOrder') && calls.some((c) => c[0] === 'issueOrder' && c[1] === 'retreat'),
     `KONTROLA: akcje grupy realnie wołają MOS (Stop → cancelOrder, Odwrót → retreat): ${JSON.stringify(calls)}`);

  const cp = new FleetCommandPanel();
  ok(typeof cp.draw === 'undefined' && typeof cp.handleClick === 'undefined' && typeof cp._onHit === 'function',
     'FleetCommandPanel: rysunek i klik w prostokąt usunięte (T4-3), `_onHit` (cel chipów T6) zostaje');
  cp._fleetId = 'f_1';
  for (const type of ['minimize', 'restore', 'prevFleet', 'nextFleet', 'doctrine', 'memberFocus', 'memberRemove',
    'bgMove', 'bgEngage', 'bgReturn', 'bgStop', 'bgUndock', 'bgDock', 'bgDisband', 'closeFleet']) {
    const e = callSafe(() => cp._onHit({ type, data: { id: 'v_1' } }));
    ok(!(e instanceof ReferenceError), `FleetCommandPanel ${type} bez ReferenceError (${e?.name ?? 'brak wyjątku'})`);
  }
  ok(calls.some((c) => c[0] === 'cancelFleetOrder' && c[1] === 'f_1'), 'KONTROLA: „Stop” floty realnie woła `cancelFleetOrder(f_1)`');
  delete window.KOSMOS.fleetSystem;
  delete window.KOSMOS.movementOrderSystem;
}

// ═══ P11 — RENDER: dokładnie JEDNA powierzchnia rysuje przy każdym N ══════════════════════
// ⚠ PO CO, skoro P4 pinuje już mutex? Bo P4 pinuje CZYSTĄ REGUŁĘ, a nie to, że reguła rozstrzyga
//   RENDER. Live-gate 2026-09-07 zgłosił ① („dwa panele naraz przy N>=2").
// ⚠ T4-3: powierzchnie to panel statku T5 (N == 1) i panel grupy T6 (N ≥ 2); o rysunku rozstrzyga `UIManager._mapSurface`
//   (`fleetHudSurface` nad `resolveMapSelectionSurface` — wykonanie na prawdziwych metodach: `fleet_panel_hud_smoke` F5).
// ⚠ ANTY-JAŁOWOŚĆ (część nośna): oba modele UMIEJĄ dać niepusty zbiór stref — inaczej cisza brałaby się z pustki, nie z mutexu.
header('P11  PIN RENDER — przy każdym N rysuje DOKŁADNIE JEDNA powierzchnia (0 / 1 / >=2)');
{
  const f = MapLogic?.resolveMapSelectionSurface;
  world();
  const vm = window.KOSMOS.vesselManager;
  vm._vessels.set('v_2', { ...vm.getVessel('v_1'), id: 'v_2', name: 'Wenus' });
  window.KOSMOS.fleetSystem = { listFleets: () => [] };
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  const vOne = t5ModelTypes(fmo, vm.getVessel('v_1')).length;
  const gTwo = t6GroupTypes([vm.getVessel('v_1'), vm.getVessel('v_2')]).length;
  ok(vOne > 0 && gTwo > 0,
     `KONTROLA: oba panele umieją dać strefy (statek T5 przy N==1: ${vOne}, grupa T6 przy N==2: ${gTwo}) — cisza bierze się z MUTEXU, nie z pustki`);
  const surfaceOf = (ids) => L6?.fleetHudSurface?.(f?.(ids), { features: GAME_CONFIG.FEATURES, fleetId: null, vesselCount: ids.length, leadId: ids[0] ?? null });
  ok(surfaceOf([]) === 'none', `N==0 → nic nie rysuje (powierzchnia ${surfaceOf([])})`);
  ok(surfaceOf(['v_1']) === 'vessel', `N==1 → rysuje TYLKO panel statku T5 (powierzchnia ${surfaceOf(['v_1'])})`);
  ok(surfaceOf(['v_1', 'v_2']) === 'groupHud', `N==2 → rysuje TYLKO panel grupy T6 (powierzchnia ${surfaceOf(['v_1', 'v_2'])})`);

  // Pin ŹRÓDŁOWY — JEDEN producent każdego rysowania w `UIManager`. Ten fakt był JEDYNĄ
  // odpowiedzią na ①, a nic go nie pilnowało. `UIManager` nie importuje się pod node.
  const { readFileSync } = await import('node:fs');
  const uiCode = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf-8')
    .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  const cnt = (hay, needle) => hay.split(needle).length - 1;
  ok(cnt(uiCode, 'this._drawFleetPanelHud(') === 1,
     `dokładnie JEDNO miejsce wywołania panelu floty / grupy T6 (jest: ${cnt(uiCode, 'this._drawFleetPanelHud(')})`);
  ok(cnt(uiCode, 'this._drawShipPanelHud(') === 1,
     `dokładnie JEDNO miejsce wywołania panelu statku T5 (jest: ${cnt(uiCode, 'this._drawShipPanelHud(')})`);
  // P11-T3 — jedyny producent panelu statku za bramką trybu Y (rozwinięty Dok — panel statku się nie rysuje, D-TR-10).
  ok(/!this\._shipPanelDockHidden\(\) && this\._mapSurface\(\) === 'vessel'\) \{\s*shipPanelHudDrawn = !!this\._drawShipPanelHud\(ctx, W, H\);/.test(uiCode),
     'P11-T3: jedyne wywołanie panelu statku za bramką trybu Y (`_shipPanelDockHidden`) i powierzchni N == 1');
  let SPA = null; try { SPA = await import('../../ui/ShipPanelAnchorLogic.js'); } catch { /* fail-first */ }
  ok(SPA?.shipPanelHiddenByDock?.(true) === true && SPA?.shipPanelHiddenByDock?.(false) === false,
     'P11-T3: rozwinięty Dok chowa panel statku (zwinięty — panel przy wierszu; 542)');

  vm._vessels.delete('v_2');
  delete window.KOSMOS.fleetSystem;
}

// ═══ P-A1 — „Powrót" nie istnieje na ŻADNEJ powierzchni keyed-on-N ════════════════════════
// ⚠ Rejestr nie ma akcji `return_home` od Findingu 145 (a'), a `MovementOrderSystem:224` pisze
//   wprost „Przycisk powrotu ZOSTAŁ USUNIĘTY". `grpReturn` przeżył w `FleetGroupPanel` i dawał
//   ROZJAZD SŁOWNIKA: ten sam statek miał Powrót przy N>=2, a nie miał przy N==1.
// ⚠ Pinowane WYKONANIEM, nie grepem: grep po źródle przeszedłby na samym komentarzu, a i tak nie
//   powiedziałby, czy przycisk SIĘ RYSUJE.
header('P-A1  PIN — żadna powierzchnia mapy nie wystawia „Powrotu" (ani przy N==1, ani przy N>=2)');
{
  world();
  const vm = window.KOSMOS.vesselManager;
  vm._vessels.set('v_2', { ...vm.getVessel('v_1'), id: 'v_2', name: 'Wenus' });
  // Stan, w którym „Powrót" BYŁ aktywny (`!docked && !immob`) — inaczej pin mierzyłby wyszarzenie.
  for (const id of ['v_1', 'v_2']) vm.getVessel(id).position.state = 'orbiting';
  window.KOSMOS.fleetSystem = { listFleets: () => [] };
  window.KOSMOS.movementOrderSystem = { issueOrder: () => ({ ok: true }), cancelOrder: () => true };
  // ⚠ PRZECELOWANIE ŚWIADOME (REFORMA ZAKŁADEK T6, strojenie 1 — Finding 562, podpis właściciela 2026-10-27): „Odwrót” jest
  //   aktywny tylko dla członka w AKTYWNYM STARCIU (predykat bramki MOS `not_in_combat`). Kontrola niejałowości niżej ma
  //   widzieć rząd rozkazów z aktywnym „Odwrotem” — grupa stoi w starciu (atrapa systemu walki), asercje bez zmian.
  window.KOSMOS.deepSpaceCombatSystem = { _findActiveEncounterContaining: (id) => (id === 'v_1' || id === 'v_2' ? { isActive: true } : null) };

  // T4-3: powierzchnie keyed-on-N to model grupy T6 (N >= 2) i model panelu statku T5 (N == 1).
  const grpTypes = [...new Set(t6GroupTypes([vm.getVessel('v_1'), vm.getVessel('v_2')]))].sort();
  delete window.KOSMOS.deepSpaceCombatSystem;
  ok(grpTypes.length > 0, `KONTROLA: model grupy T6 realnie dał strefy (${grpTypes.length} typów)`);
  ok(!grpTypes.includes('grpReturn'), `N>=2 — brak strefy grpReturn (typy: ${JSON.stringify(grpTypes)})`);
  // KONTROLA niejałowości: pozostałe rozkazy grupowe SĄ (nie zniknął cały rząd przycisków).
  ok(grpTypes.includes('grpDock') && grpTypes.includes('grpRetreat'),
     'KONTROLA: pozostałe rozkazy grupowe (grpDock, grpRetreat) dalej są w modelu');

  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  const mapTypes = t5ModelTypes(fmo, vm.getVessel('v_1'));
  ok(!mapTypes.includes('grpReturn') && !mapTypes.includes('mvpReturn'),
     'N==1 — panel statku T5 też nie wystawia Powrotu');
  // ⚠ Odwrót — `retreat` — to CO INNEGO niż Powrót i musi zostać na obu powierzchniach.
  //   ⚠ Nawias po słowie „Odwrót" świadomie usunięty: `check-i18n` skanuje wywołania i18n
  //   w CAŁYM `src/`, a polskie „ó" nie jest znakiem słowa w jego wzorcu — więc końcówka
  //   „...ót" tuż przed nawiasem parsowała się jako wywołanie i18n z kluczem `retreat`.
  ok(mapTypes.includes('mvpRetreat'),
     'KONTROLA: Odwrót (mvpRetreat) NIE został zdjęty razem z Powrotem');

  // Klucz i18n wycofany z OBU słowników (parytet — `check-i18n` liczy pl == en).
  const { readFileSync } = await import('node:fs');
  const pl = readFileSync(new URL('../../i18n/pl.js', import.meta.url), 'utf-8');
  const en = readFileSync(new URL('../../i18n/en.js', import.meta.url), 'utf-8');
  ok(!pl.includes('fleetGroup.actionReturn') && !en.includes('fleetGroup.actionReturn'),
     'klucz fleetGroup.actionReturn wycofany z pl.js i en.js');
  ok(pl.includes('fleetGroup.actionRetreat') && en.includes('fleetGroup.actionRetreat'),
     'KONTROLA: sąsiedni klucz fleetGroup.actionRetreat dalej istnieje w obu (pliki realnie wczytane)');

  vm._vessels.delete('v_2');
  delete window.KOSMOS.fleetSystem;
}


// ═══ P13 — INTEGRACJA: rozkaz CELOWANY z panelu mapy dochodzi do PRAWDZIWEGO MissionSystem ══
// ⚠ FIXTURE POCHODZI Z POPULACJI OSIĄGALNEJ NA TEJ POWIERZCHNI — to jest cała lekcja z ②/③.
//   P2/P3 prowadzą statek ZADOKOWANY, a zadokowany statek NIE MA SPRITE'A na mapie 3D
//   (`ThreeRenderer._syncVesselPositions` usuwa go i NIE odtwarza; `_restoreActiveSystemVesselSprites`
//   robi `continue`) ⇒ gracz NIE MOŻE go kliknąć, więc tamte piny mierzyły stan, którego ta
//   powierzchnia nigdy nie widzi. Populacja mapy to `orbiting` / `in_transit`.
// ⚠ GRANICA DOWODU, ŚWIADOMA: to NIE jest pin na `createMission`. Bramka `vessel.status !== 'idle'`
//   w pięciu `_launch*` (② — `mission.shipUnavailable`) jest PRE-EXISTING i odmawia tak samo
//   z Rejestru; ma własny finding i własny slice. P13 dowozi to, co należy do TEGO slice'u:
//   że łańcuch klików panelu mapy (akcja → picker → potwierdzenie) dociera do prawdziwego
//   silnika i ZMIENIA JEGO STAN — na akcji, która jest z mapy realnie osiągalna.
header('P13  PIN INTEGRACYJNY — akcja celowana z panelu statku T5 zmienia stan PRAWDZIWEGO MissionSystem');
{
  world();
  const { MissionSystem } = await import('../../systems/MissionSystem.js');
  const EventBus = (await import('../../core/EventBus.js')).default;
  EntityManager.add({ id: 'p_thr', type: 'planet', name: 'Trzecia', x: 5 * AU, y: 0, systemId: 'sys_home',
                      orbital: { a: 5, e: 0, T: 9, M: 0 }, deposits: [], explored: false, analyzed: false });

  const vm = window.KOSMOS.vesselManager;
  const v  = vm.getVessel('v_1');
  const redirects = [];
  vm.redirectToTarget = (id, tid, yr) => redirects.push({ id, tid, yr });
  vm.dispatchOnMission = () => true;
  vm.redispatchFromOrbit = () => true;

  const colony = window.KOSMOS.colonyManager.getColony('p_home');
  const ms = new MissionSystem(colony.resourceSystem);
  window.KOSMOS.missionSystem = ms;

  const failures = [];
  EventBus.on('expedition:launchFailed', (e) => failures.push(e?.reason));

  // Misja bazowa POWSTAJE PRODUKCYJNĄ ŚCIEŻKĄ (nie jest sklejona ręcznie) — statek `idle`
  // i ZADOKOWANY, bo taka jest bramka akcji `orbit` ORAZ bramka ② (`status !== 'idle'`).
  // ⚠ `orbitOnly: true` to dokładnie to, co robi akcja `orbit` — i jedyny wariant przechodzący
  //   przez bramkę `bodyAlreadyExplored` (`p_two` jest w tym fixture ZBADANA). Bez tego misja
  //   bazowa NIE POWSTAJE i cały pin mierzy ciszę.
  ms.createMission('survey', 'v_1', { targetId: 'p_two', orbitOnly: true });
  const m0 = ms.getActive()[0];
  ok(!!m0 && m0.targetId === 'p_two',
     `KONTROLA: misja bazowa powstała PRODUKCYJNIE i celuje w p_two (${JSON.stringify(m0 && { t: m0.type, s: m0.status, tg: m0.targetId })})`);
  if (m0) m0.status = 'orbiting';
  v.status = 'on_mission';
  v.position.state = 'orbiting';       // ← POPULACJA MAPY: nie-zadokowany = ma sprite = klikalny
  ok(v.position.state !== 'docked',
     'KONTROLA: fixture jest z populacji OSIĄGALNEJ z mapy (nie-zadokowany ⇒ ma sprite 3D)');

  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  // T4-3: panel mapy = panel statku T5 (prawdziwy `ShipPanelHudLayer`): strefy chipów z TEJ klatki, klik → `_handleHit`.
  const lay = Y5 ? new Y5.ShipPanelHudLayer() : null;
  const draw  = () => t5Zones(fmo, lay, { open: true }).filter((z) => z.kind === 'chip' && z.zone && z.enabled !== false)
    .map((z) => ({ ...z.zone, x: z.x, y: z.y, w: z.w, h: z.h }));
  const click = (z) => t5Click(lay, fmo, z);

  let zones = draw();
  const mapActions = actionIds(zones);
  ok(mapActions.length > 0, `zbiór akcji z populacji mapy jest NIEPUSTY (${JSON.stringify(mapActions)})`);
  // ⚠ Anty-jałowość lekcji: gdyby fixture nadal był zadokowany, ten zbiór równałby się goldenowi.
  ok(JSON.stringify(mapActions) !== JSON.stringify(GOLDEN_ACTIONS),
     `KONTROLA: to INNY zbiór niż golden zadokowanego (mapa: ${JSON.stringify(mapActions)} vs dok: ${JSON.stringify(GOLDEN_ACTIONS)})`);
  // ⚠ LEKCJA WYKONYWALNA: akcja, którą prowadzi ten pin, jest osiągalna WYŁĄCZNIE z populacji
  //   mapy. Gdyby ktoś „uprościł" fixture z powrotem do zadokowanego (bogatszy zbiór akcji!),
  //   pin nie miałby czego kliknąć — i ta kontrola powie DLACZEGO, zamiast zostawić 6x FAIL bez
  //   wyjaśnienia. Zmierzone: dok NIE MA `redirect` (wymaga `position.state === 'orbiting'`).
  ok(!GOLDEN_ACTIONS.includes('redirect') && mapActions.includes('redirect'),
     'KONTROLA: redirect istnieje TYLKO w populacji mapy (dok: nie, mapa: tak)');

  const az = zones.find(z => z.type === 'action' && z.data?.actionId === 'redirect');
  if (!az) {
    ok(false, 'akcja celowana `redirect` dostępna z panelu statku T5');
    ok(false, 'picker celu emituje >=2 cele'); ok(false, 'wybór celu → krok confirm');
    ok(false, 'potwierdzenie zmienia stan MissionSystem'); ok(false, 'VesselManager dostał redirectToTarget');
    ok(false, 'brak expedition:launchFailed w łańcuchu');
  } else {
    ok(click(az) === true, 'klik w akcję celowaną (chip T5) pochłonięty i obsłużony');
    ok(fmo._missionConfig?.step === 'select', `krok pickera (jest: ${fmo._missionConfig?.step})`);

    zones = draw();
    const targets = zones.filter(z => z.type === 'select_target');
    ok(targets.length >= 2, `picker celu emituje >=2 cele (jest: ${targets.length})`);
    const pick = targets.find(z => JSON.stringify(z.data ?? {}).includes('p_thr'));
    ok(!!pick, 'KONTROLA: w pickerze JEST cel p_thr (inaczej mierzylibyśmy inny rozkaz)');

    if (pick) {
      ok(click(pick) === true, 'klik w cel pochłonięty i obsłużony');
      ok(fmo._missionConfig?.targetId === 'p_thr' && fmo._missionConfig?.step === 'confirm',
         `cel wybrany, krok potwierdzenia (target=${fmo._missionConfig?.targetId}, step=${fmo._missionConfig?.step})`);

      zones = draw();
      const cz = zones.find(z => z.type === 'confirm_mission');
      ok(!!cz, 'panel statku T5 emituje chip confirm_mission');
      if (cz) {
        ok(click(cz) === true, 'klik w potwierdzenie pochłonięty i obsłużony');
        const after = ms.getActive();
        ok(after.length === 1 && after[0].targetId === 'p_thr',
           `PRAWDZIWY MissionSystem zmienił stan: cel p_two → ${after[0]?.targetId} (misji: ${after.length})`);
        ok(redirects.length === 1 && redirects[0].id === 'v_1' && redirects[0].tid === 'p_thr',
           `VesselManager dostał redirectToTarget(v_1, p_thr) (jest: ${JSON.stringify(redirects)})`);
        ok(failures.length === 0, `KONTROLA: łańcuch nie wywołał expedition:launchFailed (${JSON.stringify(failures)})`);
      }
    }
  }
}

// ═══ P13-src — PREMISA POPULACJI: zadokowany statek NIE MA sprite'a na mapie ══════════════
// ⚠ Cały wybór fixture'u P13 stoi na tym fakcie. `ThreeRenderer` nie importuje się pod node
//   (THREE), więc pin ŹRÓDŁOWY — z kontrolą, że plik został realnie wczytany.
header('P13-src  PIN ŹRÓDŁOWY — zadokowany statek nie dostaje sprite\'a (premisa populacji mapy)');
{
  const { readFileSync } = await import('node:fs');
  const tr = readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf-8');
  const code = tr.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  const cnt = (h, n) => h.split(n).length - 1;
  ok(cnt(code, "vessel.position?.state === 'docked'") >= 1 || cnt(code, "v.position?.state === 'docked'") >= 1,
     'ThreeRenderer ma gałąź „docked” w synchronizacji sprite\'ów');
  ok(code.length > 100000, `KONTROLA: źródło ThreeRenderera realnie wczytane (${code.length} zn.)`);
  ok(!code.includes('docked_XYZZY'), 'KONTROLA: pin nie przechodzi na dowolnym tokenie');
}


console.log(`\n═══ ${pass}/${pass + fail} OK, ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
