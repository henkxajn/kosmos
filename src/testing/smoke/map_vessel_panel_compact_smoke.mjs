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
//   A1  KOTWICA: px CSS → px LOGICZNE (`/uiScale`), offset prawo-dół, `null` → fallback
//   A2  panel nie zakrywa sprite'a statku
//   D1  DRAG na PRAWDZIWYM `FloatingPanel`: dragPos > kotwica, `reanchor()` wraca, clamp
//   D2  pin ŹRÓDŁOWY: host (FloatingPanel + kotwica + drag) zamontowany w `UIManager`
//   S1  Finding 260: kółko przewija panel i jest POCHŁANIANE (kontrola: poza panelem `false`)
//   S2  pin ŹRÓDŁOWY: clamp przewijania ma JEDNO źródło (`_applyRightScroll`), nie dwie kopie
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
// Reguła kotwicy mieszka w CZYSTYM module (UIManager nie importuje się pod node).
// Import owinięty: gdyby helper jeszcze nie istniał, keeper ma dać FAIL-FIRST, nie umrzeć
// na starcie (martwy harness = 0/0 = fałszywa zieleń).
let MapLogic = null;
try { MapLogic = await import('../../ui/MapVesselPanelLogic.js'); } catch { /* fail-first */ }

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

// ═══ A1 — KOTWICA: panel siada PRZY STATKU, w px LOGICZNYCH ══════════════════════════════════
// ⚠ KONWERSJA `/uiScale` JEST SEDNEM TEGO PINU. `getVesselScreenPosition` liczy z
//   `window.innerWidth/Height` (px CSS), a overlay rysuje pod `setTransform(UI_SCALE * _DPR)`.
//   Bez dzielenia panel rozjeżdża się na KAŻDEJ rozdzielczości ≠ 1280×720 — a to jest KAŻDY
//   nowoczesny ekran. Kanon: `MapLabelLogic.toLogicalPx` (Aneks A.3).
//   ⚠ `StationPanel:117-120` tej konwersji NIE robi (defekt PRE-EXISTING, osobny finding);
//   ten pin pilnuje, żeby panel statku NIE powielił tamtego wzorca.
header('A1  PIN — kotwica panelu: px CSS → px LOGICZNE, offset prawo-dół, fallback bez chowania');
{
  const f = MapLogic?.resolveVesselPanelAnchor;
  const B = { ox: 8, oy: 40, ow: 1264, oh: 600 };
  if (typeof f !== 'function') {
    for (let i = 0; i < 7; i++) ok(false, 'resolveVesselPanelAnchor istnieje');
  } else {
    ok(true, 'MapVesselPanelLogic.resolveVesselPanelAnchor istnieje');
    // uiScale = 1 → kotwica = pozycja + offset
    const a1 = f({ x: 400, y: 300 }, 1, B, 300, 300, 24);
    ok(a1.anchored === true && a1.x === 424 && a1.y === 324,
       `uiScale 1: offset prawo-dół +24 (jest: ${a1.x},${a1.y})`);
    // uiScale = 1.5 (1920×1080!) → MUSI podzielić, inaczej panel ucieka o połowę ekranu
    const a15 = f({ x: 900, y: 600 }, 1.5, B, 300, 300, 24);
    ok(a15.x === 624 && a15.y === 424,
       `uiScale 1.5: pozycja PODZIELONA (900/1.5+24=624, 600/1.5+24=424) — jest: ${a15.x},${a15.y}`);
    // ⚠ KONTROLA ANTY-JAŁOWA: bez dzielenia wyszłoby 924/624 — pin realnie mierzy konwersję.
    ok(a15.x !== 924 && a15.y !== 624,
       'KONTROLA: to NIE jest wynik bez konwersji (924/624) — dzielenie faktycznie zaszło');
    // null (statek za kamerą albo ZADOKOWANY — brak sprite'a) → fallback, NIE chowanie
    const fb = f(null, 1.5, B, 300, 300, 24);
    ok(fb.anchored === false, 'brak pozycji ekranowej → kotwica zapasowa (nie chowamy panelu)');
    ok(fb.x === B.ox + B.ow - 300 - 12 && fb.y === B.oy + 8,
       `fallback = prawa krawędź obszaru mapy (jest: ${fb.x},${fb.y})`);
    // NaN traktowany jak brak (obrona przed rzutem za kamerę)
    const nan = f({ x: NaN, y: 10 }, 1, B, 300, 300, 24);
    ok(nan.anchored === false, 'NaN w pozycji ⇒ fallback, nie panel na NaN');
  }
}

// ═══ A2 — PANEL NIE ZAKRYWA STATKU ═══════════════════════════════════════════════════════════
// Offset prawo-dół sprawia, że lewy-górny róg panelu leży POZA sprite'em. Sprite statku ma
// promień rzędu kilkunastu px; offset 24 daje zapas w obu osiach.
header('A2  PIN — zakotwiczony panel nie zachodzi na sprite statku');
{
  const f = MapLogic?.resolveVesselPanelAnchor;
  if (typeof f !== 'function') { ok(false, 'A2 — brak helpera'); }
  else {
    const B = { ox: 0, oy: 0, ow: 1280, oh: 720 };
    const shipLogical = { x: 400, y: 300 };
    const a = f({ x: 400, y: 300 }, 1, B, 300, 300, 24);
    const SPRITE_R = 16;   // z zapasem powyżej realnego promienia ikony statku
    const overlaps = a.x < shipLogical.x + SPRITE_R && a.y < shipLogical.y + SPRITE_R;
    ok(!overlaps, `panel zaczyna się poza sprite'em (panel ${a.x},${a.y} vs statek ${shipLogical.x},${shipLogical.y} r=${SPRITE_R})`);
    ok(a.x > shipLogical.x && a.y > shipLogical.y, 'kierunek: PRAWO-DÓŁ od statku');
  }
}

// ═══ D1 — DRAG: `dragPos` wygrywa nad kotwicą, `reanchor()` go zdejmuje ══════════════════════
// ⚠ Prowadzone na PRAWDZIWYM `FloatingPanel` (importuje się pod node), nie na atrapie —
//   inaczej pin mierzyłby moją kopię reguły, a nie regułę.
header('D1  PIN — drag panelu: dragPos wygrywa nad kotwicą, reanchor wraca do statku');
{
  const { FloatingPanel } = await import('../../ui/FloatingPanel.js');
  const B = { ox: 0, oy: 0, ow: 1280, oh: 720 };
  const fp = new FloatingPanel();
  const anchored = fp.place(400, 300, 300, 300, B);
  ok(anchored.px === 400 && anchored.py === 300, `bez draga panel siedzi na kotwicy (${anchored.px},${anchored.py})`);
  fp.beginDrag(410, 310, 400, 300);
  const movedSmall = fp.updateDrag(412, 312, 300, 300, B);
  ok(movedSmall === false, 'KONTROLA: ruch poniżej progu to KLIK, nie drag (kotwica nietknięta)');
  const moved = fp.updateDrag(600, 500, 300, 300, B);
  ok(moved === true, 'ruch powyżej progu ustawia dragPos');
  const dragged = fp.place(400, 300, 300, 300, B);
  ok(dragged.px !== 400 || dragged.py !== 300, `dragPos WYGRYWA nad kotwicą (${dragged.px},${dragged.py})`);
  ok(fp.endDrag() === true, 'endDrag zgłasza realny drag (panel może pochłonąć klik)');
  fp.reanchor();
  const back = fp.place(400, 300, 300, 300, B);
  ok(back.px === 400 && back.py === 300, 'reanchor() wraca do kotwicy przy statku');
  // Clamp: panel nigdy nie ucieka poza obszar mapy.
  const fp2 = new FloatingPanel();
  const far = fp2.place(5000, 5000, 300, 300, B);
  ok(far.px <= B.ox + B.ow - 300 && far.py <= B.oy + B.oh - 300,
     `clamp trzyma panel na ekranie (${far.px},${far.py})`);
}

// ═══ D2 — pin ŹRÓDŁOWY: host jest ZAMONTOWANY w UIManagerze ══════════════════════════════════
// `UIManager` nie importuje się pod node ⇒ pin źródłowy, z kontrolami (lekcja „skonstruowany
// ≠ zamontowany": konsumenci czytają przez `?.`, martwy host NIE krzyczy).
header('D2  PIN ŹRÓDŁOWY — FloatingPanel + kotwica + drag realnie wpięte w UIManagerze');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf-8');
  const code = src.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  ok(code.includes('new FloatingPanel()'), 'UIManager tworzy FloatingPanel dla panelu statku');
  ok(code.includes('resolveVesselPanelAnchor('), 'i liczy kotwicę CZYSTYM helperem (nie inline)');
  ok(code.includes('tryBeginVesselPanelDrag(x, y)'), 'drag wpięty w mousedown');
  ok(code.includes('endVesselPanelDrag()'), 'drag zamykany w mouseup');
  ok(code.includes('isDraggingVesselPanel()'), 'drag prowadzony w mousemove');
  ok(code.includes('reanchor()'), 'zmiana statku wraca do kotwicy');
  ok(code.length > 50000, `KONTROLA: źródło realnie wczytane (${code.length} zn.)`);
  ok(!code.includes('resolveVesselPanelAnchorXYZZY'), 'KONTROLA: pin nie przechodzi na dowolnym tokenie');
}


// ═══ S1 — Finding 260: KÓŁKO przewija panel i jest POCHŁANIANE ═══════════════════════════════
// ⚠ Maszyneria przewijania istniała od 258 (`_rightScrollY`/`_rightContentH`/`_rightViewH`
//   + clamp) — brakowało wyłącznie TRASY. Trasa do `handleScroll` NIE działa: tamta metoda
//   bramkuje na `_visible`/`_bounds` OVERLAYA, a nad mapą overlay jest ZAMKNIĘTY (D-MVP-7).
// ⚠ W kompakcie scroll jest NOŚNY, nie kosmetyczny: przy 300 px okna treść (322 px) i tak
//   wystaje, a krok wyboru celu ma 326 px — bez kółka część rozkazów byłaby nieosiągalna.
header('S1  PIN — kółko myszy przewija panel statku i NIE przelatuje do kamery');
{
  world();
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = 'v_1';
  if (typeof fmo.handleVesselPanelScroll !== 'function') {
    for (let i = 0; i < 8; i++) ok(false, 'FleetManagerOverlay.handleVesselPanelScroll istnieje');
  } else {
    ok(true, 'FleetManagerOverlay.handleVesselPanelScroll istnieje');
    // Panel NIŻSZY niż treść — inaczej clamp trzyma 0 i pin przechodziłby jałowo.
    fmo.drawVesselPanel(stubCtx(), 20, 100, 300, 200, { compact: true });
    const r = fmo._vesselPanelRect;
    ok(fmo._rightContentH > fmo._rightViewH,
       `KONTROLA: treść przekracza okno (${Math.round(fmo._rightContentH)} > ${Math.round(fmo._rightViewH)}) — jest co przewijać`);
    const before = fmo._rightScrollY || 0;
    const consumed = fmo.handleVesselPanelScroll(r.x + r.w / 2, r.y + r.h / 2, 40);
    ok(consumed === true, 'obrót kółka NAD panelem jest POCHŁONIĘTY (nie zoomuje mapy)');
    ok((fmo._rightScrollY || 0) > before,
       `scroll faktycznie się przesunął (${before} → ${Math.round(fmo._rightScrollY)})`);
    // Clamp — ten sam, co w Rejestrze (jedno źródło `_applyRightScroll`).
    fmo.handleVesselPanelScroll(r.x + 5, r.y + 5, 99999);
    const maxS = Math.max(0, (fmo._rightContentH || 0) - (fmo._rightViewH || 0));
    ok(Math.round(fmo._rightScrollY) === Math.round(maxS),
       `clamp górny trzyma na maxScroll (${Math.round(fmo._rightScrollY)} == ${Math.round(maxS)})`);
    fmo.handleVesselPanelScroll(r.x + 5, r.y + 5, -99999);
    ok((fmo._rightScrollY || 0) === 0, `clamp dolny trzyma na 0 (jest ${fmo._rightScrollY})`);
    // KONTROLA KIERUNKU — poza prostokątem NIE pochłaniamy (inaczej panel zjadłby zoom całej mapy).
    ok(fmo.handleVesselPanelScroll(r.x - 5, r.y + 10, 40) === false, 'KONTROLA: kółko POZA panelem → false');
    fmo._vesselPanelRect = null;
    ok(fmo.handleVesselPanelScroll(r.x + 10, r.y + 10, 40) === false,
       'KONTROLA: bez narysowanego panelu → false');
  }
}

// ═══ S2 — JEDNO źródło clampu (Rejestr i panel mapy przewijają się tak samo) ══════════════════
header('S2  PIN ŹRÓDŁOWY — clamp przewijania ma JEDNO źródło, nie dwie kopie');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../ui/FleetManagerOverlay.js', import.meta.url), 'utf-8');
  const code = src.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  const cnt = (h, n) => h.split(n).length - 1;
  ok(cnt(code, '_applyRightScroll(') >= 3,
     `_applyRightScroll: 1 definicja + >=2 wołających (jest wystąpień: ${cnt(code, '_applyRightScroll(')})`);
  // Arytmetyka clampu występuje DOKŁADNIE RAZ — w helperze, nie skopiowana do panelu mapy.
  ok(cnt(code, "this._rightScrollY = Math.max(0, Math.min(maxScroll") === 1,
     `arytmetyka clampu występuje raz (jest: ${cnt(code, "this._rightScrollY = Math.max(0, Math.min(maxScroll")})`);
  const ui = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf-8')
    .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
  ok(ui.includes('handleVesselPanelScroll'), 'UIManager.handleWheel ma TRASĘ do panelu (bez niej pin S1 byłby martwy w grze)');
  ok(ui.length > 50000, `KONTROLA: źródło UIManagera realnie wczytane (${ui.length} zn.)`);
}


console.log(`\n═══ ${pass}/${pass + fail} OK, ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
