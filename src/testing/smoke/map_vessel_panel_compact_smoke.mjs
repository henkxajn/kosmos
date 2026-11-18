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
//   C1  panel BEZ `compact` ma pełną kartę katalogową (`contentH` ≈ 550, akcja ~y+456) — od KZ-Command: inspektor rejestru
//   C2  zbiór akcji jest NIEPUSTY i zawiera zmierzone id (dwa puste panele też są „równe")
//
// PINY (mają PAŚĆ przed zmianą, przejść po niej)
//   E1  RÓWNOŚĆ: zbiór akcji w `compact` ≡ zbiór akcji Rejestru (ta sama metoda, ta sama instancja)
//   (E2 — Rejestr = panel mapy bez `compact` — usunięty w T4-3: panelu mapy T3 nie ma; golden Rejestru — `map_vessel_panel` C6)
//   E3  `{compact:false}` ≡ brak `opts`, CO DO PIKSELA (`_drawRight` odróżnia jawne `false` od braku `opts`)
//   M   (T4) flagi `mapVesselPanel` / `mapVesselPanelCompact` usunięte; `UIManager` nie rysuje dawnego panelu T3
//   R1  RENDER: `compact` realnie SKRACA panel — karta katalogowa znika, akcje idą do góry
//   R2  PICKER: krok `select` mieści listę celów w ~360 px (panel rośnie na czas wyboru)
//   A1  KOTWICA ZAPASOWA (`resolveVesselPanelAnchor(null)`): prawy górny róg obszaru mapy; NaN = brak pozycji
//   ⚠ PRZECELOWANE 2026-10-24 (REFORMA ZAKŁADEK T3, `TABS_REFORM_PLAN.md` §5.3, za zgodą): A1, A2, D1, D2 i Z1 opisywały
//     kotwicę przy STATKU — ścieżkę `shipPanelOutliner` OFF. Przy ON panel stoi przy wierszu prawego outlinera bez
//     przeciągania — warianty „-T3” (pełne piny: `ship_panel_outliner_smoke`).
//   ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): pływający panel statku usunięty z `UIManager`
//     — A1 (kotwica przy statku: px CSS → px logiczne, offset) i A2 (panel obok sprite'a) przycięte do kotwicy zapasowej i
//     wariantów „-T3”; D1 / D2 (przeciąganie na `FloatingPanel`, host w `UIManager`) usunięte; M / M2 (flagi
//     `mapVesselPanelCompact` / `mapVesselPanel`) zastąpione pinem M usunięcia; S2 / Z / K1 — trasa kółka i kolejność
//     malowania panelu statku T5 (`_drawShipPanelHud`). C1–R2 i S1 (dawny panel T3 `drawVesselPanel` — wyrocznia trybu
//     kompaktowego) — do kolejnego kroku T4. T4-2 (panel stacji usunięty): Z2 / K1 — drugim panelem klastra jest panel floty /
//     grupy T6 (`_drawFleetPanelHud`) w miejscu `stationPanel.draw`.
//   ⚠ T4-3 (dawny panel statku T3 usunięty z FMO — `drawVesselPanel`, footer, `handleVesselPanelClick` / `Scroll`): tryb
//     kompaktowy żyje dalej jako gałąź `_drawRight(…, { compact: true })` — decyzja właściciela T4 (Q2): `_drawRight` z gałęzią
//     kompaktową bez zmian. C1 / C2 / E1 / E3 / R1 / R2 wołają `_drawRight` WPROST (ten sam obszar 300 px; bez pasma footera,
//     który dorysowywał adapter); E2 (Rejestr = panel mapy bez `compact`) i S1 (kółko nad panelem T3) usunięte — druga
//     strona porównania i trasa kółka zniknęły razem z panelem (kółko panelu T5: `ship_panel_hud_smoke` H7h / H7i); S2 —
//     `_applyRightScroll` ma jednego wołającego (Rejestr).
//   (S1 — kółko nad panelem T3 — usunięty w T4-3)
//   S2  pin ŹRÓDŁOWY: clamp przewijania ma JEDNO źródło (`_applyRightScroll`), nie dwie kopie
//   Z   KOLEJNOŚĆ: etykiety mapy POD klastrem paneli — od B-Z etykiety mapy leżą na `#hud-canvas` POD `#ui-canvas`
//       (porządek DOM / z-index), a etykiety CTRL rysowane na `#ui-canvas` PRZED panelami (Z1/Z1b panel statku,
//       Z2 panel floty / grupy T6 + combatHud = fix KLASOWY, Z3 ramki RTS zostają nad etykietami)
//       + K1 (każde wywołanie RAZ — blokuje „naprawę przez skasowanie") i K2 (bramki
//       etykiet nietknięte — blokuje „naprawę przez dogaszenie")
//   E1  WYKONANIE: domyślne podwarstwy warstwy HUD gry zawierają etykiety (`HudLabelLayer`) — etykiety żyją
//   ⚠ PRZECELOWANE 2026-10-28 (ARKUSZ HUD B-Z — plakietki `MapLabelLayer` i flagi `mapLabels` / `fleetMapLabels` / `hudLabels`
//     usunięte): K1 / Z / K2 — mierzone wywołania etykiet na `#ui-canvas` to etykiety CTRL (`_drawAllLabels`), etykiety mapy
//     — warstwa HUD pod `#ui-canvas` (pin porządku canvasów); E1 — wykonanie domyślnych podwarstw warstwy HUD zamiast
//     dawnego `MapLabelLayer.draw`.
//
// ⚠ PRZECELOWANE (KZ-Command — `_drawRight` z gałęzią `{ compact }` usunięty z FMO razem z dawnym panelem rejestru):
//   „Rejestr” = inspektor konsoli Dowództwa (`CommandInspectorView.drawInspector`), „panel mapy (kompakt)” = panel statku HUD
//   T5 (`ShipPanelHudLayer.prepare` / `draw`, model `ShipPanelHudLogic.buildShipPanelModel`) — to on jest dziś małym panelem
//   nad mapą. C1 — inspektor rejestru jest PEŁNY (akta techniczne; > 400 px treści); C2 — jego zbiór akcji niepusty (transport);
//   E1 — RDZEŃ: panel HUD ma DOKŁADNIE te same akcje co inspektor rejestru (+ Cargo); R1 — panel HUD jest istotnie krótszy
//   niż inspektor (< 400 px, o > 150 px mniej) i ma wejście w rozkazy; R2 — krok `select` konfiguratora: panel HUD mieści cele
//   w 400 px, a inspektor rejestru (kontrola) rysuje te same cele w WYŻSZEJ treści.
//   USUNIĘTY: E3 (`{compact:false}` ≡ brak `opts`) — parametru `opts` nie ma już nigdzie (`_drawRight` usunięty, `UIManager`
//   nie buduje argumentu — pin M), więc kontrakt kill-switcha nie ma przedmiotu.
//
// ⚠ PIN M ODWRÓCONY 2026-09-09 (`false` → `true`): flaga dostała default-ON po zdanym
//   live-gate'cie B1 (6/6) i gate'cie kolejności malowania (4/4, `23523af`). Stary kształt
//   pinowałby od tej chwili DEFEKT — panel niewidoczny bez wpisu w konsoli. Powód tutaj,
//   bo odwrócony pin bez zapisanego powodu jest nieodróżnialny od poluzowanego.
// ⚠ E3 NIE JEST fail-first — opisuje WARUNEK: pada, gdy `_drawRight` przestaje odróżniać `false` od braku `opts`.
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
// Reguła kotwicy mieszka w CZYSTYM module (UIManager nie importuje się pod node).
// Import owinięty: gdyby helper jeszcze nie istniał, keeper ma dać FAIL-FIRST, nie umrzeć
// na starcie (martwy harness = 0/0 = fałszywa zieleń).
let MapLogic = null;
try { MapLogic = await import('../../ui/MapVesselPanelLogic.js'); } catch { /* fail-first */ }
// REFORMA ZAKŁADEK T3 — kotwica panelu przy wierszu prawego outlinera (moduł powstaje w T3; import owinięty).
let SPA = null;
try { SPA = await import('../../ui/ShipPanelAnchorLogic.js'); } catch { /* fail-first */ }

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

// KZ-Command — żywe powierzchnie: inspektor rejestru konsoli i panel statku HUD (T5), ten sam fixture `orbiting`.
let IV = null, ROLES = null, Y5 = null, L5 = null;
try { IV = await import('../../ui/CommandInspectorView.js'); ROLES = (await import('../../ui/ConsoleRolesLogic.js')).consoleRoles(); } catch { /* piny padną */ }
try { Y5 = await import('../../ui/ShipPanelHudLayer.js'); L5 = await import('../../ui/ShipPanelHudLogic.js'); } catch { /* piny padną */ }

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

/** Inspektor rejestru konsoli w obszarze (20, 100, 300, h); `cfg` — konfigurator misji. Wyjątek rysunku = wynik `threw`. */
function inspDraw(h = 700, cfg = null) {
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1'; fmo._missionConfig = cfg ? { ...cfg } : null;
  fmo._hitZones = []; fmo._cmdDisabled = []; fmo._cmdTip = null;
  const K = window.KOSMOS;
  let threw = null;
  try {
    IV.drawInspector(fmo, fontCtx(), { x: 20, y: 100, w: 300, h }, ROLES,
      { vMgr: K.vesselManager, ms: K.missionSystem, colMgr: K.colonyManager, activePid: 'p_home' });
  } catch (e) { threw = e?.message ?? String(e); }
  return { fmo, zones: [...fmo._hitZones], contentH: fmo._rightContentH ?? -1, threw };
}

/** Panel statku HUD (T5, prawdziwy `ShipPanelHudLayer`): rozmiar, strefy klatki (w 930, 60) i model. */
function hudDraw(cfg = null) {
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1'; fmo._missionConfig = cfg ? { ...cfg } : null;
  const lay = new Y5.ShipPanelHudLayer();
  const ctx = fontCtx();
  const sz = lay.prepare({ ctx, K: window.KOSMOS, fmo, vesselId: 'v_1', maxH: 4000, features: GAME_CONFIG.FEATURES });
  if (sz) lay.draw(ctx, { x: 930, y: 60, w: sz.w, h: sz.h }, {});
  const model = L5.buildShipPanelModel(window.KOSMOS.vesselManager.getVessel('v_1'), { K: window.KOSMOS, fmo, features: GAME_CONFIG.FEATURES });
  return { sz, zones: [...(lay._zones ?? [])], model };
}
const hudActionIds = (m) => (m?.orders?.items ?? []).filter((c) => c.enabled && c.zone?.type === 'action').map((c) => c.zone.data.actionId).sort();

// ═══ C1 — baseline: inspektor rejestru jest PEŁNY ═══════════════════════════════════════════
header('C1  KONTROLA — inspektor rejestru konsoli ma pełną treść (akta techniczne)');
let FULL = null;
{
  const r = inspDraw();
  FULL = r;
  ok(!r.threw && r.contentH > 400, `contentH inspektora rejestru > 400 (jest: ${Math.round(r.contentH)}${r.threw ? '; wyjątek: ' + r.threw : ''})`);
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

// ═══ E1 — RÓWNOŚĆ: panel mapy (HUD) ≡ Rejestr co do ZBIORU AKCJI ═════════════════════════════
// ⚠ To jest rdzeń slice'u B: mały panel nad mapą UKRYWA informacje, ale NIE ODBIERA ŻADNEJ AKCJI.
//   Gdyby zaczął, „pełny zestaw akcji" byłby nieprawdą, a panel — trzecią, uboższą powierzchnią.
header('E1  PIN — zbiór akcji panelu statku HUD ≡ zbiór akcji inspektora rejestru (ten sam statek, ta sama klatka świata)');
{
  const reg = inspDraw();
  const hud = hudDraw();
  const aReg = actionIds(reg.zones);
  const aHud = hudActionIds(hud.model);
  ok(aReg.length > 0 && aReg.includes('transport'),
     `KONTROLA: Rejestr ma niepusty, konkretny zbiór akcji (${JSON.stringify(aReg)})`);
  ok(JSON.stringify(aHud) === JSON.stringify(aReg),
     `panel HUD ma DOKŁADNIE te same akcje co Rejestr (HUD: ${JSON.stringify(aHud)}, rejestr: ${JSON.stringify(aReg)})`);
  // Cargo to AKCJA (strefa `cargo_load`), nie karta katalogowa — musi przeżyć mały panel.
  ok(hud.zones.some((z) => z.zone?.type === 'cargo_load') && reg.zones.some((z) => z.type === 'cargo_load'),
     'panel HUD ZACHOWUJE przycisk Cargo (to afordancja akcji, nie karta katalogowa) — jak Rejestr');
}

// (E3 — `{compact:false}` ≡ brak `opts` — usunięty w KZ-Command: parametru `opts` i gałęzi `compact` nie ma już nigdzie.)

// ═══ R1 — RENDER: panel mapy jest realnie KRÓTKI ═════════════════════════════════════════════
header('R1  PIN — panel statku HUD jest istotnie krótszy niż inspektor rejestru, a rozkazy są w zasięgu');
{
  const full = inspDraw();
  const hud = hudDraw();
  const h = hud.sz?.h ?? Infinity;
  ok(h < full.contentH - 150, `panel HUD krótszy o > 150 px (inspektor ${Math.round(full.contentH)} → HUD ${Math.round(h)})`);
  ok(h < 400, `panel HUD mieści się w „małym" budżecie (<400 px, jest ${Math.round(h)})`);
  // Wejście w rozkazy (akordeon „Rozkazy”) i Cargo — klikalne chipy w obrębie panelu (karta katalogowa nie wypycha akcji).
  const chips = hud.zones.filter((z) => z.kind === 'chip' && z.y >= 60 && z.y + z.h <= 60 + h);
  ok(chips.some((z) => z.zone?.type === 'cargo_load') && chips.some((z) => z.id === 'orders' && !z.zone),
     `panel HUD: chip Cargo i wejście w rozkazy w obrębie panelu (${chips.map((z) => z.zone?.type ?? z.id).join(', ')})`);
}

// ═══ R2 — PICKER: krok `select` mieści się w ~400 px ═════════════════════════════════════════
// Decyzja właściciela: panel ROŚNIE na czas wyboru celu i wraca po potwierdzeniu. Pin sprawdza, czy mały panel nad mapą
// MIEŚCI krok wyboru — inaczej ta decyzja jest nierealizowalna.
header('R2  PIN — krok `select` panelu statku HUD mieści listę celów (≤ 400 px)');
{
  const CFG = { actionId: 'transport', targetId: null, step: 'select' };
  const hud = hudDraw(CFG);
  const targets = (hud.model?.config?.rows ?? []).filter((r) => r.enabled && r.zone?.type === 'select_target');
  const drawnT = hud.zones.filter((z) => z.zone?.type === 'select_target');
  ok(targets.length >= 1 && drawnT.length === targets.length, `picker HUD emituje >=1 cel i rysuje każdy (model ${targets.length}, klatka ${drawnT.length})`);
  ok((hud.sz?.h ?? Infinity) <= 400, `panel HUD w kroku select mieści się w ~400 px (h ${Math.round(hud.sz?.h ?? -1)})`);
  // KONTROLA: inspektor rejestru rysuje te same cele, ale w WYŻSZEJ treści — mały panel to zasługa panelu HUD.
  //   Wyjątek rysunku konfiguratora konsoli (`drawConfigurator`) = czerwony pin z jego treścią — żywa ścieżka, nie atrapa.
  const reg = inspDraw(360, CFG);
  const regT = reg.zones.filter((z) => z.type === 'select_target');
  ok(!reg.threw && regT.length >= 1 && reg.contentH > (hud.sz?.h ?? Infinity),
     `KONTROLA: inspektor rejestru w kroku select rysuje cele (${regT.length}) w wyższej treści (contentH ${Math.round(reg.contentH)} > HUD ${Math.round(hud.sz?.h ?? -1)})${reg.threw ? ' — WYJĄTEK RYSUNKU: ' + reg.threw : ''}`);
}

// ═══ M — (T4) flagi trybu kompaktowego i panelu statku nad mapą usunięte ═══════════════════════
header('M  PIN — flagi `mapVesselPanel` / `mapVesselPanelCompact` usunięte, `UIManager` nie rysuje dawnego panelu T3 (T4)');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf-8');
  const code = src.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  ok(GAME_CONFIG.FEATURES?.mapVesselPanelCompact === undefined && GAME_CONFIG.FEATURES?.mapVesselPanel === undefined,
     'klucze `mapVesselPanel` i `mapVesselPanelCompact` usunięte z GameConfig (na stałe ON od T4)');
  ok(!code.includes('mapVesselPanelCompact') && !code.includes('drawVesselPanel') && code.includes('this._drawShipPanelHud(ctx, W, H)'),
     '`UIManager`: brak odczytu flagi i dawnego panelu T3 — panel statku nad mapą to panel T5 (`_drawShipPanelHud`)');
  ok(code.length > 50000, `KONTROLA: źródło realnie wczytane (${code.length} zn.)`);
  const f = MapLogic?.resolveMapSelectionSurface;
  ok(typeof f === 'function' && f(['a'], { flagOn: false }) === 'vessel' && f(['a', 'b']) === 'group',
     'KONTROLA: powierzchnia N == 1 to `vessel` bez względu na dawny argument flagi (N == 2 — `group`)');
}

// ═══ A1 — KOTWICA ZAPASOWA i kotwica przy wierszu (T3) ═══════════════════════════════════════════
// Dawny panel przy STATKU (px CSS → px logiczne `/uiScale`, offset prawo-dół) usunięty w T4 razem z pływającym panelem;
// zostaje kotwica zapasowa (`resolveVesselPanelAnchor(null)` — wejście `computeShipPanelPlacement` przy schowanej kolumnie).
header('A1  PIN — kotwica zapasowa panelu (`resolveVesselPanelAnchor(null)`) i kotwica przy wierszu (T3)');
{
  const f = MapLogic?.resolveVesselPanelAnchor;
  const B = { ox: 8, oy: 40, ow: 1264, oh: 600 };
  if (typeof f !== 'function') {
    for (let i = 0; i < 4; i++) ok(false, 'resolveVesselPanelAnchor istnieje');
  } else {
    ok(true, 'MapVesselPanelLogic.resolveVesselPanelAnchor istnieje');
    // null (brak pozycji ekranowej — dawny panel przy statku usunięty w T4) → kotwica zapasowa w prawym górnym rogu
    const fb = f(null, 1.5, B, 300, 300, 24);
    ok(fb.anchored === false, 'brak pozycji ekranowej → kotwica zapasowa (nie chowamy panelu)');
    ok(fb.x === B.ox + B.ow - 300 - 12 && fb.y === B.oy + 8,
       `fallback = prawa krawędź obszaru mapy (jest: ${fb.x},${fb.y})`);
    // NaN traktowany jak brak (obrona przed rzutem za kamerę)
    const nan = f({ x: NaN, y: 10 }, 1, B, 300, 300, 24);
    ok(nan.anchored === false, 'NaN w pozycji ⇒ fallback, nie panel na NaN');
  }
  // A1-T3 — przy `shipPanelOutliner` ON kotwica = WIERSZ prawego outlinera; pozycja sprite'a nie jest wejściem.
  const place = SPA?.computeShipPanelPlacement;
  const INS = { left: 150, right: 150, top: 28, bottom: 62 };
  const COL = { x: 1130, y: 28, w: 150, h: 630 };
  const row = { key: 'vessel:v_1', rowTop: 200, h: 16, anchorY: 200, visible: true, edge: null, viaSection: false };
  const pr = typeof place === 'function' ? place({ W: 1280, H: 720, insets: INS, column: COL, anchor: row, panelH: 300 }) : null;
  ok(pr?.mode === 'row' && pr.x === 830 && pr.y === 200,
     `A1-T3 przy ON kotwica przy wierszu outlinera: x = 1280 − 150 − 300, y = wiersz (jest: ${pr?.x},${pr?.y})`);
  // kolumna ukryta (klawisz „.”: wcięcie prawe 0) i statek bez wiersza (kolumna widoczna) → dzisiejszy fallback
  const fbHid = typeof place === 'function' ? place({ W: 1280, H: 720, insets: { ...INS, right: 0 }, column: null, anchor: null, panelH: 300 }) : null;
  const oldHid = f?.(null, 1, { ox: 158, oy: 36, ow: 1114, oh: 622 }, 300, 300, 24);
  ok(fbHid?.mode === 'fallback' && fbHid.x === oldHid?.x && fbHid.y === oldHid?.y,
     `A1-T3 kolumna ukryta → kotwica zapasowa = dzisiejszy fallback (${fbHid?.x},${fbHid?.y} = ${oldHid?.x},${oldHid?.y})`);
  const fbRow = typeof place === 'function' ? place({ W: 1280, H: 720, insets: INS, column: COL, anchor: null, panelH: 300 }) : null;
  const oldRow = f?.(null, 1, { ox: 158, oy: 36, ow: 964, oh: 622 }, 300, 300, 24);
  ok(fbRow?.mode === 'fallback' && fbRow.x === oldRow?.x && fbRow.y === oldRow?.y,
     `A1-T3 statek bez wiersza w liście (kolumna widoczna) → ten sam fallback (${fbRow?.x},${fbRow?.y} = ${oldRow?.x},${oldRow?.y})`);
}

// ═══ A2 — PANEL PRZY KOLUMNIE (T3) ══════════════════════════════════════════════════════════════
header('A2  PIN — panel przy kolumnie (T3): nie zasłania kolumny');
{
  // A2-T3 — przy ON panel stoi przy kolumnie (sprite statku nie jest wejściem kotwicy — 529): nie zasłania kolumny,
  // prawa krawędź = lewa krawędź kolumny.
  const pr = SPA?.computeShipPanelPlacement?.({ W: 1280, H: 720, insets: { left: 150, right: 150, top: 28, bottom: 62 },
    column: { x: 1130, y: 28, w: 150, h: 630 }, anchor: { rowTop: 400, h: 16, anchorY: 400, visible: true, edge: null }, panelH: 300 });
  ok(!!pr && pr.x + pr.w === 1130 && pr.x >= 150, `A2-T3 przy ON panel kończy się na lewej krawędzi kolumny (${pr?.x}–${pr ? pr.x + pr.w : '—'})`);
}

// ═══ S2 — JEDNO źródło clampu (Rejestr i panel mapy przewijają się tak samo) ══════════════════
header('S2  PIN ŹRÓDŁOWY — clamp przewijania ma JEDNO źródło, nie dwie kopie');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../ui/FleetManagerOverlay.js', import.meta.url), 'utf-8');
  const code = src.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  const cnt = (h, n) => h.split(n).length - 1;
  ok(cnt(code, '_applyRightScroll(') >= 2 && !code.includes('handleVesselPanelScroll('),
     `_applyRightScroll: 1 definicja + wołający Rejestru (dawny panel mapy usunięty w T4-3; jest wystąpień: ${cnt(code, '_applyRightScroll(')})`);
  // Arytmetyka clampu występuje DOKŁADNIE RAZ — w helperze, nie skopiowana do panelu mapy.
  ok(cnt(code, "this._rightScrollY = Math.max(0, Math.min(maxScroll") === 1,
     `arytmetyka clampu występuje raz (jest: ${cnt(code, "this._rightScrollY = Math.max(0, Math.min(maxScroll")})`);
  const ui = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf-8')
    .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  ok(ui.includes('this._shipPanelHud?.handleWheel?.(x, y, delta)'), 'UIManager.handleWheel ma TRASĘ do panelu statku (panel T5 — bez niej kółko zoomowałoby mapę)');
  ok(ui.length > 50000, `KONTROLA: źródło UIManagera realnie wczytane (${ui.length} zn.)`);
}


// ═══ Z — KOLEJNOŚĆ MALOWANIA: etykiety mapy POD panelami pływającymi ═════════════════════════
// ⚠ To defekt KOLEJNOŚCI, nie z-indexu: wszystko leci w JEDNYM `UIManager._draw()` na JEDNYM
//   `#ui-canvas`, więc „na wierzchu" znaczy „rysowane później". Etykiety stały na KOŃCU, a
//   `MapLabelLayer` NIE MA CLIPU ⇒ malowały po OŚMIU powierzchniach, w tym po Outlinerze,
//   którego własny komentarz mówi „nic go nie zasłania".
// ⚠ GRANICA DOWODU, NAZWANA: `UIManager` nie importuje się pod node, więc Z1/Z1b/Z2 to piny
//   ŹRÓDŁOWE na KOLEJNOŚCI WYWOŁAŃ w `_draw()` — nie na wyrenderowanych pikselach. Piksele
//   potwierdza live-gate. Kontrole K1/K2 robią tu robotę: bez nich pin przechodzi po
//   SKASOWANIU albo DOGASZENIU etykiet, czyli po „naprawie", która psuje mapę.
header('Z  PIN ŹRÓDŁOWY — etykiety mapy rysowane PRZED klastrem paneli pływających');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf-8');
  const lines = src.split(String.fromCharCode(10));
  // Kod BEZ komentarzy — komentarze cytują te nazwy i same by piny zazieleniły
  // (reguła `source-pin-strip-comments`).
  const code = lines.filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  const at   = (needle) => code.indexOf(needle);
  const cnt  = (needle) => code.split(needle).length - 1;

  const iLabels = at('this._drawAllLabels(ctx, tr)');
  const iPanel  = at('this._drawShipPanelHud(ctx, W, H)');
  const iFleet  = at('this._drawFleetPanelHud(');
  const iCombat = at('this.combatStrip.draw(');   // CV-Z — przecelowane świadomie: karta walki `combatHud.draw` usunięta, panel walki = pasek
  const iBrack  = at('this._drawSelectionBrackets(');

  // K1 — ANTY-JAŁOWOŚĆ NOŚNA: każde wywołanie DOKŁADNIE RAZ. Bez tego „naprawa" polegająca
  //      na SKASOWANIU przebiegu etykiet przechodziłaby na zielono.
  ok(cnt('this._drawAllLabels(') === 1,
     `K1: etykiety CTRL (_drawAllLabels) wywołane dokładnie raz (jest: ${cnt('this._drawAllLabels(')})`);
  ok(cnt('this._drawShipPanelHud(') === 1,
     `K1: panel statku T5 (_drawShipPanelHud) wywołany dokładnie raz (jest: ${cnt('this._drawShipPanelHud(')})`);
  ok(iLabels > 0 && iPanel > 0 && iFleet > 0 && iCombat > 0 && at('this.stationPanel.draw(') < 0 && at('_mapLabelLayer') < 0,
     'K1: wszystkie mierzone wywołania REALNIE znalezione w źródle (panel stacji nie rysuje się — T4; plakietek `MapLabelLayer` brak — B-Z)');
  // Etykiety mapy (warstwa HUD) — osobny canvas POD `#ui-canvas`: każdy panel `#ui-canvas` leży nad nimi z konstrukcji.
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf-8');
  const zOf = (id) => Number(html.match(new RegExp('#' + id + '\\s*\\{\\s*z-index:\\s*(\\d+)'))?.[1]);
  const iHudC = html.indexOf('<canvas id="hud-canvas">'), iUiC = html.indexOf('<canvas id="ui-canvas">');
  ok(iHudC > 0 && iUiC > iHudC && zOf('hud-canvas') < zOf('ui-canvas'),
     `Z0 (B-Z): etykiety mapy na \`#hud-canvas\` POD \`#ui-canvas\` (DOM ${iHudC} < ${iUiC}, z-index ${zOf('hud-canvas')} < ${zOf('ui-canvas')}) — panele nad nimi z konstrukcji`);

  // Z1 — etykiety CTRL przed panelem statku.
  ok(iLabels < iPanel, `Z1: etykiety CTRL PRZED panelem statku (${iLabels} < ${iPanel})`);
  // Z1-T3 — panel stoi przy wierszu prawego outlinera: outliner rysowany PRZED panelem (układ listy z tej samej klatki),
  // łącznik z wierszem PO panelu (w `_drawShipPanelHud`).
  const iOutl = at('this._outliner.draw(');
  const sph = code.slice(at('_drawShipPanelHud(ctx, W, H) {'), code.indexOf('\n  }\n', at('_drawShipPanelHud(ctx, W, H) {')));
  const iDrawT5 = sph.indexOf('this._shipPanelHud.draw('), iTab = sph.indexOf('this._drawShipPanelTab(ctx, p)');
  ok(iOutl > 0 && iOutl < iPanel && iDrawT5 > 0 && iTab > iDrawT5,
     `Z1-T3: prawy outliner PRZED panelem (${iOutl} < ${iPanel}), łącznik PO panelu w \`_drawShipPanelHud\` (${iDrawT5} < ${iTab})`);

  // Z2 — to jest fix KLASOWY, nie jednopanelowy.
  ok(iLabels < iFleet, `Z2: etykiety CTRL PRZED panelem floty / grupy T6 (${iLabels} < ${iFleet})`);
  ok(iLabels < iCombat, `Z2: etykiety CTRL PRZED paskiem walki (${iLabels} < ${iCombat})`);

  // Z3 — czego NIE wolno było przestawić: ramki RTS zostają NAD etykietami.
  ok(iBrack > iLabels, `Z3: ramki RTS zaznaczenia dalej PO etykietach CTRL (${iBrack} > ${iLabels})`);

  // K2 — ANTY-JAŁOWOŚĆ: bramki etykiet NIETKNIĘTE. Najtańsza zła naprawa to DOGASZENIE
  //      etykiet („nie rysuj, gdy panel widoczny") — ten pin ją blokuje.
  const gateWin = code.slice(Math.max(0, iLabels - 200), iLabels + 60);
  ok(gateWin.includes('_showAllLabels'), 'K2: bramka CTRL (`tr._showAllLabels`) dalej przy wywołaniu');
  ok(gateWin.includes('isAnyOpen()'), 'K2: bramka !isAnyOpen() dalej przy wywołaniu');
  // ⚠ I nic NOWEGO: żadnej bramki „nie rysuj, gdy panel widoczny".
  ok(!gateWin.includes('_vesselPanelRect') && !gateWin.includes("_mapSurface() === 'vessel'"),
     'K2: etykiety NIE zostały dogaszone widocznością panelu (fix jest kolejnością, nie tłumieniem)');

  // K3 — źródło realnie wczytane; pin nie przechodzi na dowolnym tokenie.
  ok(code.length > 50000, `K3: źródło UIManagera realnie wczytane (${code.length} zn.)`);
  ok(at('this._mapLabelLayerXYZZY.draw(') === -1, 'K3: pin nie przechodzi na dowolnym tokenie');
}

// ═══ E1 — WYKONANIE: warstwa etykiet NADAL produkuje plakietki ════════════════════════════════
// ⚠ Dosłowna wersja „etykieta NIE nachodząca na panel nadal się rysuje": prowadzimy PRAWDZIWY
//   `MapLabelLayer` (importuje się pod node — sprawdzone) i sprawdzamy, że dla fixture'u
//   z kolonią wypuszcza NIEPUSTY zbiór rysowań. Gdyby ktoś „naprawił" z-order gasząc etykiety,
//   ten pin pada niezależnie od K2.
header('E1  PIN WYKONANIOWY — warstwa HUD gry ma podwarstwę etykiet (nie zgasiliśmy etykiet)');
{
  let HLm = null, HLLm = null, threw = null;
  try { HLm = await import('../../ui/HudLayer.js'); HLLm = await import('../../ui/HudLabelLayer.js'); } catch (e) { threw = e; }
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  let hud = null;
  try { hud = HLm ? new HLm.HudLayer({ width: 0, height: 0, getContext: () => ctx }, { autoStart: false }) : null; } catch (e) { threw = e; }
  const lab = hud?._sublayers?.find?.((s) => s instanceof (HLLm?.HudLabelLayer ?? class {})) ?? null;
  ok(threw === null && !!hud, `warstwa HUD (domyślne podwarstwy gry) tworzy się bez wyjątku (${threw ? threw.message.slice(0, 60) : 'ok'})`);
  ok(!!lab && typeof lab.collect === 'function' && typeof lab.draw === 'function',
    'E1: domyślne podwarstwy warstwy HUD zawierają etykiety (`HudLabelLayer` — zbieranie i rysunek)');
  const { existsSync } = await import('node:fs');
  const gone = !existsSync(new URL('../../ui/MapLabelLayer.js', import.meta.url));
  const here = existsSync(new URL('../../ui/HudLabelLayer.js', import.meta.url));   // ta sama ścieżka — kontrola mechanizmu
  ok(gone && here, 'KONTROLA (B-Z): dawny `MapLabelLayer` usunięty, `HudLabelLayer` na miejscu — etykiety mapy wyłącznie z warstwy HUD');
  hud?.destroy?.();
}

console.log(`\n═══ ${pass}/${pass + fail} OK, ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
