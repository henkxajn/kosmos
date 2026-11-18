// FleetManagerOverlay — trójdzielny overlay zarządzania flotą
//
// Otwierany klawiszem F lub kliknięciem FLOTA w Outlinerze.
// Layout zakładki taktycznej: REJESTR (tabela + oś czasu) | RIGHT (szczegóły + akcje).
// Rysowany na Canvas 2D (#ui-canvas), NA WIERZCHU istniejącego UI.
// Logika misji delegowana do MissionSystem + FleetActions.

import { THEME } from '../config/ThemeConfig.js';
import { COSMIC, BOTTOM_RESERVED } from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W, getSubNavHeight }  from './CivPanelDrawer.js';
import { SHIPS }           from '../data/ShipsData.js';
import { HULLS }           from '../data/HullsData.js';
import { SHIP_MODULES, getModuleCapabilities } from '../data/ShipModulesData.js';
import { RESOURCE_ICONS }  from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { ALL_RESOURCES }   from '../data/ResourcesData.js';
import { effectiveRange, loadColonists, unloadColonists, isEnemyVessel, warpRange, canColonize as vesselCanColonize, getPrimaryRole, canDoEnvoy }  from '../entities/Vessel.js';
import { getAvailableActions, FLEET_ACTIONS } from '../data/FleetActions.js';
import EntityManager       from '../core/EntityManager.js';
import EventBus            from '../core/EventBus.js';
import { GAME_CONFIG }     from '../config/GameConfig.js';
import { DistanceUtils }   from '../utils/DistanceUtils.js';
import { findHitZone, resolveTacticalTarget } from '../utils/TacticalRaycaster.js';
import { warpDist3D } from '../utils/WarpRoutePlanner.js';
import { tryCancelVesselOrder } from '../utils/MovementOrderCancellation.js';
import { resolveStratcomZone } from './StratcomHitLogic.js';
import { assignVesselsToFleet, openDockPicker } from './VesselGroupActions.js';
// REFORMA ZAKŁADEK T3 (D-TR-13) — rozbiórka z potwierdzeniem.
import { confirmThenDisband } from './ShipPanelAnchorLogic.js';
// D-255a (Finding 154) — JEDNO źródło doboru celu POWROTU: własna kolonia W UKŁADZIE STATKU.
import { buildFleetReturnPlan } from '../utils/FleetReturnPlan.js';
import { fleetOffendersOutOfFrame, describeOrderFail, describeFleetOrderRefusal } from '../utils/CameraFrame.js';
// Finding 166 — lista celów `engage` keyed na UKŁADZIE FLOTY (kanon `SystemScope`, forma listowa).
import { systemIdOf } from '../utils/SystemScope.js';
import { launchFuelMultiplierForVessel } from '../utils/SpaceportCheck.js';
import { foreignActionsBodyId, foreignActionsContext, isForeignColonizeType } from '../utils/ForeignActions.js';   // Finding 578 — akcje obce kluczuje predykat
import { zoomViewport, xToYear } from './TimelineLayout.js';
import { systemDisplayName } from './MapLabelLogic.js';
import { warpErrLabel } from './GalaxyWarpLogic.js';
import { showCargoLoadModal } from '../ui/CargoLoadModal.js';
import { showDropTroopsModal } from '../ui/DropTroopsModal.js';
import { ColonistLoadModal } from '../ui/ColonistLoadModal.js';
import { showBodyDetailModal } from '../ui/BodyDetailModal.js';
import { showReturnCargoModal } from '../ui/ReturnCargoModal.js';
import { showFleetAssignModal } from './FleetAssignModal.js';
import { getOrderTargetInfo } from './OrderTargetInfo.js';
import { OutpostBuildingPicker } from '../ui/OutpostBuildingPicker.js';
import { showRallyAssignModal } from '../ui/RallyAssignModal.js';
import { t, getName, getDesc, getShort, getLocale } from '../i18n/i18n.js';
// ARC KONSOLE K7-A — Dowództwo na szablonie konsoli (KZ-Command: jedyna ścieżka, flaga consoleCommand zdjęta)
import { applyConsoleHalo } from './ConsoleKit.js';
import { drawCommandConsole } from './CommandConsoleView.js';
import { defaultRegistryFilter, searchInputCss, focusPlan } from './CommandConsoleLogic.js';
import { dialogAnchorCss } from './CommandInspectorLogic.js';
import { UNIT_ARCHETYPES, checkArchetypeUnlocked, GROUND_UNIT_CAP_EXEMPT, ARCHETYPE_ICONS } from '../data/unitArchetypes.js';   // K7-C (dane, bez three)
import { resolveVesselStatus, vesselStatusLabelKey } from '../utils/VesselStatus.js';
// UWAGA: NIE importujemy UnitDesignOverlay statycznie — pociąga three (GroundUnitPanel →
// GlbSnapshotRenderer) i psuje headless import. Edytor projektów do osadzenia w Stoczni
// bierzemy z zarejestrowanej instancji (window.KOSMOS.overlayManager.overlays.unit_design).

// ── Ikony + etykiety slotów modułów (panel szczegółów statku) ──
// Reuse ikon/kluczy i18n z designera (MODULE_CATEGORIES w FleetTabPanel) + 3 typy
// bojowe/desantowe których designer nie grupuje (weapon/shield/troop).
const MODULE_SLOT_INFO = {
  propulsion: { icon: '🔥', key: 'fleet.designCatPropulsion' },
  fuel:       { icon: '⛽', key: 'fleet.designCatFuel' },
  cargo:      { icon: '📦', key: 'fleet.designCatCargo' },
  science:    { icon: '🔬', key: 'fleet.designCatScience' },
  special:    { icon: '🤖', key: 'fleet.designCatSpecial' },
  habitat:    { icon: '🏠', key: 'fleet.designCatHabitat' },
  armor:      { icon: '🛡', key: 'fleet.designCatArmor' },
  weapon:     { icon: '🔫', key: 'fleet.slotWeapon' },
  shield:     { icon: '✦', key: 'fleet.slotShield' },
  troop:      { icon: '🪖', key: 'fleet.slotTroop' },
};

// ── Helper detekcji wrogów: czy wrogi statek jest WYKRYTY z TOŻSAMOŚCIĄ (mapa taktyczna/listy) ──
// Po reformie detekcji obserwatorium (2026-06-25): wykrycie przez obserwatorium = poziom 'rumor'
// (pozycja bez tożsamości — ghost na scenie 3D). Mapa taktyczna pokazuje wroga z PEŁNĄ tożsamością
// (sprite + panel + tooltip), więc gateuje WYŁĄCZNIE intel >= 'contact' (statek gracza namierzył go
// z bliska / w walce — pozycja aktualna + identyfikacja). 'rumor'/'unknown' celowo NIE trafia na
// taktyczną — pokazany z nazwą/imperium byłby przeciekiem; ghost rumoru zostaje featurem sceny 3D.
// (Wcześniej short-circuit `obs.isVesselDetected` wynosił rumor do pełnego trackingu = przeciek.)
const _INTEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

// Poziom widoczności wroga (fog-of-war, spójny ze sceną 3D i mapą galaktyki):
//   'identified' — intel >= contact (statek gracza namierzył z bliska / w walce) → PEŁNA tożsamość
//                  (nazwa/imperium/kadłub, sprite, listy, targetowanie, panel).
//   'echo'       — wykryty przez obserwatorium (rumor / isVesselDetected) → ECHO „?" na mapie
//                  (znana pozycja, BRAK tożsamości). Nie trafia na listy/targetowanie/panel.
//   'hidden'     — niewykryty → niewidoczny (mgła).
function _enemyVisLevel(v) {
  const rec  = window.KOSMOS?.intelSystem?.getVesselContact?.(v.id);
  const rank = _INTEL_RANK[rec?.quality] ?? 0;
  if (rank >= _INTEL_RANK.contact) return 'identified';
  const obs = window.KOSMOS?.observatorySystem;
  if (rank >= _INTEL_RANK.rumor || obs?.isVesselDetected?.(v.id)) return 'echo';
  return 'hidden';
}
// Pełna tożsamość (contact+) — gate dla list/panelu/targetowania (NIE echo, by nie przeciekać nazwy).
function _isEnemyTracked(v) {
  return _enemyVisLevel(v) === 'identified';
}

// ── Helper: znajdź ciało niebieskie po ID ────────────────────────────────────
const _BODY_TYPES = ['star', 'planet', 'moon', 'asteroid', 'comet', 'planetoid'];
function _findBody(id) {
  if (!id) return null;
  for (const btype of _BODY_TYPES) {
    for (const b of EntityManager.getByType(btype)) {
      if (b.id === id) return b;
    }
  }
  return null;
}

// Helper: rozwiąż czytelną nazwę ciała/kolonii po ID (fallback ColonyManager)
function _resolveName(id) {
  if (!id) return '???';
  const body = _findBody(id);
  if (body?.name) return body.name;
  // S3.4-F2: stacje orbitalne to pełnoprawna lokacja doku/orbity — _findBody ich pomija (nie ma
  // ich w _BODY_TYPES), przez co statki zadokowane/orbitujące stację pokazywały surowe id zamiast
  // nazwy stacji (Command „nie znał" stacji jako lokacji). Rozwiąż nazwę wprost z EntityManager
  // (jak utils/BodyName.resolveBodyName) i oznacz 🛰 dla czytelności.
  const ent = EntityManager.get?.(id);
  if (ent?.type === 'station' && ent.name) return `🛰 ${ent.name}`;
  const colony = window.KOSMOS?.colonyManager?.getColony(id);
  if (colony?.name) return colony.name;
  return id;
}

// Górny offset overlay. „Dowództwo Taktyczne" jest pojedynczą grupą nav (bez rodzeństwa
// Fleet/Designs) → brak subnav, więc overlay sięga aż pod górną belkę i to jego własny
// pasek zakładek (4 zakładki) zajmuje miejsce dawnego subnav. getSubNavHeight() liczone
// dynamicznie w draw() (== 0 dla fleet-singleton; defensywnie, gdyby kiedyś wrócił subnav).
const TOP_BASE  = COSMIC.TOP_BAND_H + COSMIC.MAP_MODE_H;
// Zegar (BottomControlBar, STRIP_H≈20 px) to samodzielny widget rysowany NA WIERZCHU w prawym-
// dolnym rogu (UIManager rysuje go PO overlayManager, a jego kliki routuje PRZED). Rozdzielamy
// dwie rzeczy:
//   • TŁO/RAMKA overlayu sięgają paska nawigacji (BOTTOM_RESERVED) — jak w BaseOverlay. Wcześniej
//     overlay kończył się na górnej krawędzi zegara, a zegar maluje tło TYLKO pod swoim slotem
//     nawigacji (~1/7 szerokości) → pas 20 px był na ~85% szerokości niczym nie zamalowany,
//     przebijała przez niego mapa 3D i dolna krawędź ramki tworzyła linię tnącą ekran.
//   • TREŚĆ zakładek nadal ustępuje zegarowi o TIME_STRIP_H, bo leży on na niej — bez tej rezerwy
//     dolna treść prawego panelu (akcje statku: Refuel / „Tankuj automatycznie") chowała się pod
//     zawsze-wierzchnim sterowaniem czasu i była nieosiągalna mimo scrolla.
// Wypadkowa: geometria treści (contentY/contentH) BEZ ZMIAN — rośnie wyłącznie zamalowane tło.
// ── Styl akcji wg typu ──────────────────────────────────────────────────────
// Ikona + nazwa towaru/surowca (dual-locale, fallback do id)
function _cargoIcon(id) {
  return RESOURCE_ICONS[id] ?? ALL_RESOURCES[id]?.icon ?? COMMODITIES[id]?.icon ?? '•';
}
function _cargoName(id) {
  const en = getLocale() === 'en';
  const res = ALL_RESOURCES[id];
  if (res) return en ? (res.nameEN ?? res.namePL ?? id) : (res.namePL ?? id);
  const c = COMMODITIES[id];
  if (c) return en ? (c.nameEN ?? c.namePL ?? id) : (c.namePL ?? id);
  return id;
}
// Pełny katalog transportowalnych dóbr: surowce (bez research/energy — niefizyczne)
// + wszystkie towary (commodities). Kolejność: surowce, potem towary.
const _LOGI_GOOD_CATALOG = [
  ...Object.keys(ALL_RESOURCES).filter(id => id !== 'research' && id !== 'energy'),
  ...Object.keys(COMMODITIES),
];

// ══════════════════════════════════════════════════════════════════════════════
// FleetManagerOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class FleetManagerOverlay {
  constructor() {
    this._visible = false;
    this._selectedVesselId = null;
    // Player Fleet Groups (P2.5 outliner) — jedna lista z drzewem.
    //   _activeTab i _fleetScrollOffset usunięte (jeden widok, jeden scroll).
    this._selectedFleetId = null;
    // Multi-select w drzewie — Set<vesselId>; przypisywanie do floty.
    this._multiSelectedIds = new Set();
    // ── Faza 3 (Obraz Operacyjny) — rejestr K3 (pod-widok zakładki tactical) ──
    this._registrySort = { col: 'name', dir: 1 };
    this._registryFilter = { systemKey: null, role: null, search: '',
                             showWrecks: false, showContacts: false };   // 3f: sekcje domyślnie OFF
    this._registryGroupMode = 'none';           // 3e: 'none' | 'fleet' | 'system'
    this._registryCollapsedGroups = new Set();  // 3e: klucze zwiniętych grup (wzór _collapsedFleets)
    this._registryScroll = 0;
    this._timelineCollapsed = false;
    this._timelineYears = null;                 // {startYear,endYear} — lazy default, zoom scrollem
    this._registrySearchEl = null;              // DOM input (żyje TYLKO w widoku REJESTR)
    this._timelineBarZones = [];                // hover-tooltip pasków osi
    this._regMouseX = 0; this._regMouseY = 0;
    // P2 polish — Fleet Engage pick mode: po kliku „Atak" w panelu floty,
    // gracz wybiera wrogi kontakt klikiem LPM (wiersz rejestru).
    this._fleetEngagePickMode = null;  // null | { fleetId }
    this._missionConfig = null;   // null | { actionId, targetId, step:'select'|'confirm' }
    this._targetScrollOffset = 0; // scroll listy celów
    // Zakładki „Dowództwa Taktycznego": 'tactical' | 'ground' | 'atlas' | 'logistics'.
    // Zastąpiły boole _showAtlas/_showCluster. Zakładka Stratcom (dawny star-cluster) usunięta w G5 —
    // mapa galaktyki jest trybem głównego widoku 3D (klawisz G albo M).
    this._activeTab = 'tactical';
    this._contentBounds = null;   // { x,y,w,h } — obszar treści pod paskiem zakładek
    // Zakładka Logistyka (MVP Zlecenia Transportowe) — stan buildera zlecenia.
    this._logiFrom  = null;       // colonyId źródła
    this._logiTo    = null;       // colonyId celu
    this._logiGoods = {};         // { goodId: qty } budowanego zlecenia (wybrane towary)
    this._logiOrdersScrollY = 0;  // scroll listy aktywnych zleceń (prawa kolumna)
    this._logiBuilderScrollY = 0; // scroll buildera (lewa kolumna — pickery + towary)
    this._logiGoodDropdownOpen = false;  // drop-down wyboru towaru (pełny katalog surowce+commodities)
    this._logiGoodDropdownScrollY = 0;   // scroll listy drop-downu
    this._logiDropdownRect = null;       // rect panelu drop-downu towaru (routing wheel)
    this._logiColDropdown = null;        // 'from' | 'to' | null — otwarty drop-down kolonii
    this._logiColDropdownScrollY = 0;    // scroll drop-downu kolonii
    this._logiColDropdownRect = null;    // rect panelu drop-downu kolonii (routing wheel)
    this._logiQtyInput = null;           // DOM <input> ręcznej ilości (wzór safety stock)
    this._atlasScrollY = 0;       // scroll katalogu ciał
    this._groundColonyId = null;       // K7-C — kolonia strony Jednostek (lokalna)
    this._groundUnitScrollY = 0;       // K7-C — przewinięcie tabeli jednostek (px log.)
    this._groundSelUnitId = null;      // K7-C — jednostka wybrana w tabeli Jednostek
    this._logiSelectedOrderId = 'new'; // K7-C — wybór na liście Logistyki konsoli ('new' = kreator)
    this._logiKitRects = null;         // K7-C — prostokąty listy / inspektora Logistyki (kółko)
    this._atlasSelectedBodyId = null;  // K7-C — ciało wybrane w Atlasie konsoli (lista ↔ orrery)
    this._atlasContentH = 0;      // wysokość zawartości katalogu
    this._atlasVisibleH = 0;      // widoczna wysokość katalogu
    // Prawy panel taktyki (szczegóły statku) — pionowy scroll (treść bywa wyższa niż panel)
    this._rightScrollY = 0;
    this._rightContentH = 0;      // łączna wysokość treści panelu (do clampu)
    this._rightViewH = 0;         // widoczna wysokość panelu
    this._rightScrollVesselId = null;  // reset scrolla przy zmianie statku

    this._hitZones = [];          // { x,y,w,h, type, data }
    this._bounds = null;          // { x,y,w,h } — cały overlay

    this._cachedTargets = null;   // cache celów misji
    this._cachedTargetsKey = '';   // klucz walidacji cache
  }

  // ── API publiczne ──────────────────────────────────────────────────────────

  toggle() {
    this._visible = !this._visible;
    if (!this._visible) this._close();
  }
  // Finding 160 — WSZYSTKIE trzy przypisania zakładki idą przez `_switchTab`, nigdy wprost.
  // POWÓD: `OverlayManager.handleKey:75-80` przy JUŻ aktywnym overlayu woła `_showOverlay` BEZ
  // `_hideOverlay` (żeby drugie wciśnięcie K ponawiało focus zamiast zamykać), więc `open()`
  // wykonuje się na ŻYWYM overlayu — `close()` nie biegnie i nic nie sprząta po zakładce, z której
  // gracz właśnie wyszedł. Zmierzone: wyszukiwarka Rejestru (NIE ma handlera `blur` — celowo, fraza
  // ma przeżyć przeglądanie listy) zostawała jako osierocony <input> nad mapą galaktyki.
  // ⚠ Utwardzone wszystkie trzy, nie tylko `opts.tab` — klawisz K i wejście `view:'registry'` też
  //   flipują zakładkę, a nieutwardzony bliźniak to mina (por. `removeColony:667`, `ReturnJump`).
  // ⚠ `_switchTab` ma early-return `tab === _activeTab` i TAK MA ZOSTAĆ: wyciek polega na
  //   PRZENIESIENIU pola DOM tam, gdzie nie należy; gdy zakładka się nie zmienia, nic się nie
  //   przenosi (plan T4=W1, pinowane keeperem).
  // Plan: docs/design/OVERLAY_TAB_ENTRY_PLAN.md · audyt: docs/audit/STRATCOM_110_159_160_AUDIT.md §3
  open(opts = {}) {
    this._visible = true;
    // Wybór zakładki przez wywołującego (nav itp.).
    if (opts.tab) this._switchTab(opts.tab);
    // M4 P2 — klawisz K otwiera fleet z focusSection: 'wreck' → zakładka taktyczna, REJESTR z włączoną
    // sekcją wraków (K7-pre: lewa lista mapy 2D usunięta; dawna gałąź 3g jest jedyną drogą).
    // Kolejność zachowana (plan T3=W1): `_switchTab` NIE dotyka `_registryFilter`, więc intencja wejścia
    // przeżywa przełączenie.
    if (opts.focusSection) this._switchTab('tactical');
    if (opts.focusSection === 'wreck') this._registryFilter.showWrecks = true;
    // F3: otwarcie wprost w REJESTRZE (chip 🌀 tranzytu → prefiltr transit).
    if (opts.view === 'registry') {
      this._switchTab('tactical');
      if (opts.registrySystemKey !== undefined) {
        this._registryFilter.systemKey = opts.registrySystemKey;
      }
      // 4d (Dok taktyczny 🎯) — otwórz REJESTR z KONKRETNYM statkiem: wyczyść filtry
      // (by nie był ukryty), zaznacz i zaznacz do scrolla w pierwszym _drawRegistry.
      if (opts.focusVesselId) {
        this._registryFilter = { systemKey: null, role: null, search: '', showWrecks: false, showContacts: false };
        this._pendingFocusVesselId = opts.focusVesselId;
        this._setSelectedVesselViaUI(opts.focusVesselId);
      }
    }
  }
  close()  { this._visible = false; this._closeRegistrySearch(); this._closeLogiQtyInput(); this._close(); }

  get isVisible() { return this._visible; }

  _close() {
    this._missionConfig = null;
    this._targetScrollOffset = 0;
    this._cachedTargets = null;
    this._activeTab = 'tactical';
  }

  // Przełączenie zakładki + reset stanu, który nie powinien wyciekać między
  // zakładkami (hover, tryb wyboru celu misji, scroll/selekcja per-widok).
  _switchTab(tab) {
    if (!tab || tab === this._activeTab) return;
    this._activeTab = tab;
    this._closeRegistrySearch();   // F3: DOM input żyje tylko w widoku REJESTR
    // Logistyka: zamknij drop-downy + DOM input ilości przy wyjściu z zakładki
    this._closeLogiQtyInput();
    this._logiColDropdown = null;
    this._logiGoodDropdownOpen = false;
    this._rightScrollY = 0;   // reset scrolla prawego panelu przy zmianie zakładki
    // Tryb wyboru celu misji nie może przetrwać zmiany zakładki
    if (this._missionConfig?.step === 'select') {
      this._missionConfig = null;
      this._targetScrollOffset = 0;
      this._cachedTargets = null;
    }
    if (tab === 'atlas') this._atlasScrollY = 0;
  }

  // ── Główna metoda rysowania ────────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this._visible) return;

    this._hitZones = [];

    // Bounds overlay — Slice B: pełnoekranowy (bez rezerwy na Outliner; ten jest teraz
    // prawym wysuwanym drawerem na wierzchu). Nie nakrywamy tylko TopBar/BottomBar/Sidebar.
    const ox = CIV_SIDEBAR_W;
    const oy = TOP_BASE + getSubNavHeight();
    const ow = W - CIV_SIDEBAR_W;
    // Dolna granica TŁA overlayu = górna krawędź paska nawigacji (jak BaseOverlay). Zegar leży na
    // overlayu jako widget w rogu — ustępuje mu dopiero treść (contentH niżej). Patrz TIME_STRIP_H.
    const oh = (H - BOTTOM_RESERVED) - oy;
    this._bounds = { x: ox, y: oy, w: ow, h: oh };

    // K7-A — konsola: nagłówek z czipami zakładek, rejestr w 4 strefach (żywa, przyciemniona scena za tekstem).
    // KZ-Command: jedyna ścieżka (dawny pasek zakładek, rejestr pełnej szerokości i strony bez szablonu usunięte).
    ctx.save();
    applyConsoleHalo(ctx);
    try { drawCommandConsole(this, ctx, W, H); } finally { ctx.restore(); }
  }

  // DOM <input> ręcznego wpisania ilości towaru (wzór EconomyOverlay._openOneShotQtyInput).
  _openLogiQtyInput(goodId, canvasX, canvasY, kitBox = null) {
    this._closeLogiQtyInput();
    // K7-C — konsola: prostokąt pola z rysunku strefy inspektora (`consoleZones`) × skala UI z ostatniego rysunku; bez `window.inner*`.
    // KZ-Command: jedyny producent (CommandPagesView) zawsze podaje `boxW`; dawne pole liczone z okna usunięte (brak prostokąta → nic).
    if (!kitBox) return;
    const css = searchInputCss({ x: canvasX, y: canvasY, w: kitBox.w, h: kitBox.h }, this._uiScale || 1);
    const sx = css.left, sy = css.top, sw = css.width, sh = css.height;

    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.max = '999990'; input.step = '10';
    input.value = String(this._logiGoods[goodId] ?? 0);
    Object.assign(input.style, {
      position: 'fixed', left: `${Math.round(sx)}px`, top: `${Math.round(sy)}px`,
      width: `${Math.round(sw)}px`, height: `${Math.round(sh)}px`, boxSizing: 'border-box',
      padding: '0 3px', margin: '0', background: THEME.bgPrimary,
      border: `1px solid ${THEME.borderActive}`, color: THEME.accent, fontFamily: THEME.fontFamily,
      fontSize: `${Math.max(10, Math.round(sh * 0.6))}px`, textAlign: 'center', outline: 'none',
      zIndex: '300', caretColor: THEME.accent,
    });
    input.style.appearance = 'textfield';
    document.body.appendChild(input);
    this._logiQtyInput = input;

    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const raw = parseInt(input.value, 10);
      const val = Number.isFinite(raw) ? Math.max(0, Math.min(999990, raw)) : 0;
      if (val > 0) this._logiGoods[goodId] = val;
      else delete this._logiGoods[goodId];
      this._closeLogiQtyInput();
    };
    const cancel = () => { if (done) return; done = true; this._closeLogiQtyInput(); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', commit);
    for (const evt of ['click', 'mousedown', 'mouseup']) input.addEventListener(evt, (e) => e.stopPropagation());
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  _closeLogiQtyInput() {
    const el = this._logiQtyInput;
    if (!el) return;
    this._logiQtyInput = null;
    el.onblur = null;
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  /**
   * K7-C — fakty strony Logistyka dla konsoli (te same źródła i reguły co `_drawLogiBuilder` / `_drawLogiOrders` /
   * drop-downy): pula, kolonie gracza, źródło / cel, wybrane towary z zapasem źródła, katalog dóbr, bramka „Utwórz”, zlecenia.
   */
  _logiFacts(colMgr) {
    const tos = window.KOSMOS?.transportOrderSystem;
    const vMgr = window.KOSMOS?.vesselManager;
    const playerCols = colMgr?.getPlayerColonies?.() ?? [];
    const activePid = colMgr?.activePlanetId;
    if (!this._logiFrom && playerCols.some(c => c.planetId === activePid)) this._logiFrom = activePid;   // jak builder OFF
    const srcInv = this._logiFrom ? colMgr?.getColony(this._logiFrom)?.resourceSystem?.inventory : null;
    const srcAmt = (id) => (srcInv instanceof Map ? Math.floor(srcInv.get(id) ?? 0) : 0);
    const good = (id) => ({ id, icon: _cargoIcon(id), name: _cargoName(id) });
    const selected = Object.entries(this._logiGoods).filter(([, q]) => q > 0).map(([id, qty]) => ({ ...good(id), qty, inStock: srcAmt(id) }));
    const PHASE = { hauling: 'transportOrder.phase_hauling', to_origin: 'transportOrder.phase_to_origin', waiting: 'transportOrder.phase_waiting' };
    const orders = (tos?.getOrders?.() ?? []).map((o, i) => {
      const fromSys = colMgr?.getColony(o.fromColonyId)?.systemId;
      const toSys = colMgr?.getColony(o.toColonyId)?.systemId;
      return {
        id: o.id, fifo: i + 1, fromId: o.fromColonyId, toId: o.toColonyId,
        fromName: colMgr?.getColony(o.fromColonyId)?.name ?? o.fromColonyId, toName: colMgr?.getColony(o.toColonyId)?.name ?? o.toColonyId,
        cross: !!(fromSys && toSys && fromSys !== toSys),
        goods: Object.keys(o.goods).map(g => ({ ...good(g), total: o.goods[g] ?? 0, done: o.delivered?.[g] ?? 0 })),
        assigns: (o.assignments ?? []).map(a => {
          const v = vMgr?.getVessel?.(a.vesselId);
          const warping = v?.mission?.phase === 'warp_transit';
          return { vesselId: a.vesselId, name: v?.name ?? a.vesselId, phase: a.phase ?? null, warping,
            phaseKey: warping ? 'transportOrder.phase_warp' : (PHASE[a.phase] ?? 'transportOrder.phase_idle') };
        }),
      };
    });
    const totalGoods = selected.length;
    let createReason = null;
    if (!this._logiFrom) createReason = 'cmdPages.logi.reasonNoFrom';
    else if (!this._logiTo) createReason = 'cmdPages.logi.reasonNoTo';
    else if (this._logiFrom === this._logiTo) createReason = 'cmdPages.logi.reasonSame';
    else if (totalGoods === 0) createReason = 'cmdPages.logi.reasonNoGoods';
    return {
      pool: tos?.getPool?.().length ?? 0, hasSystem: !!tos,
      cols: playerCols.map(c => ({ id: c.planetId, name: c.name ?? c.planetId, systemId: c.systemId ?? null, sysName: this._sysName(c.systemId) })),
      from: this._logiFrom ?? null, to: this._logiTo ?? null, selected, totalGoods, canCreate: createReason === null, createReason,
      catalog: _LOGI_GOOD_CATALOG.map(id => ({ ...good(id), amt: srcAmt(id), already: (this._logiGoods[id] ?? 0) > 0 })),
      orders,
    };
  }

  // Nazwa układu gwiezdnego (galaxyData). Fallback = id.
  _sysName(systemId) {
    const sys = window.KOSMOS?.galaxyData?.systems?.find(s => s.id === systemId);
    return sys?.name ?? systemId ?? '?';
  }

  // ── M3 P1.1: setter selekcji przez UIManager ────────────────────────────
  // Single source of truth = UIManager._selectedVesselId. UIManager pisze
  // też w nasz cache `this._selectedVesselId` (sync), więc render canvas działa
  // bez zmian. Fallback (init order edge case) — zapis lokalny.
  _setSelectedVesselViaUI(vesselId) {
    const um = window.KOSMOS?.uiManager;
    if (um) um.setSelectedVesselId(vesselId);
    else this._selectedVesselId = vesselId;
  }

  // ── Obsługa kliknięć ──────────────────────────────────────────────────────

  /**
   * JEDYNE miejsce, które przewija prawą kolumnę (Rejestr i Dowództwo). Wyciągnięte z `handleScroll` przy Findingu 260
   * (wtedy także dla dawnego panelu statku nad mapą — usuniętego w REFORMIE ZAKŁADEK T4; panel statku T5 przewija własną
   * listę rozkazów): clamp i czułość w jednym miejscu.
   */
  _applyRightScroll(delta) {
    const maxScroll = Math.max(0, (this._rightContentH || 0) - (this._rightViewH || 0));
    this._rightScrollY = Math.max(0, Math.min(maxScroll, (this._rightScrollY || 0) + delta * 0.5));
  }

  /**
   * Dyspozycja footera-3 (Odwrót / → Flota / Dokuj; D-MVP-8) — WYŁĄCZNIE przez `VesselGroupActions` (jedyne źródło). Woła ją
   * panel statku T5 (`ShipPanelHudLogic.runShipPanelAction` — chipy footera); dawny panel statku nad mapą (slice 258,
   * `drawVesselPanel` / `handleVesselPanelClick`) usunięty w REFORMIE ZAKŁADEK T4.
   */
  _handleVesselPanelFooter(zone) {
    const ids = zone.data?.vesselId ? [zone.data.vesselId] : [];
    if (ids.length === 0) return;
    const um = window.KOSMOS?.uiManager;
    if (zone.type === 'mvpRetreat') {
      // ⚠ Odwrót NIE JEST kopią: jedynym źródłem jest `MovementOrderSystem`, a pod nim
      //   `resolveShelterOrderSpec` (arc RETREAT_TARGET) — ten sam dobór schronienia dla
      //   wszystkich trzech producentów odwrotu. To wywołanie, nie duplikat.
      const mos = window.KOSMOS?.movementOrderSystem;
      for (const id of ids) mos?.issueOrder?.(id, { type: 'retreat' });
    } else if (zone.type === 'mvpFleet') {
      assignVesselsToFleet(ids, { onDone: () => { if (um) um._dirty = true; } });
    } else {
      // ⚠ `sameSystemOnly: true` — NOWA powierzchnia nie przemyca Findingu 256.
      const v = window.KOSMOS?.vesselManager?.getVessel?.(ids[0]) ?? null;
      openDockPicker(ids, { sameSystemOnly: true, vessel: v, onDone: () => { if (um) um._dirty = true; } });
    }
    if (um) um._dirty = true;
  }

  handleClick(mx, my) {
    if (!this._visible) return false;
    if (!this._bounds) return false;
    // Blokuj kliknięcia gdy DOM modal jest na wierzchu (MissionEventModal, BodyDetailModal itp.)
    if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return false;
    const b = this._bounds;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return false;

    // S3.3b-S3b — podczas wyboru celu misji (step==='select') PRIORYTET ciała nad statkiem.
    // handleClick kończy po PIERWSZEJ trafionej, a statek zone wygrywa reverse-iter — więc tu, ZANIM
    // wejdziemy w normalną pętlę, sprawdzamy czy pod kliknięciem jest map_body i wybieramy CEL.
    if (this._missionConfig?.step === 'select') {
      const tgtZone = this._hitZones.find(z =>
        z.type === 'map_body' &&
        mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h);
      if (tgtZone) { this._handleHit(tgtZone, mx, my); return true; }
    }

    // Szukaj hit zone (reverse — top-most first).
    //
    // Finding 109 — `resolveStratcomZone` = reguła międzywarstwowa: wygrywa strefa WIERZCHNIA (ostatnia pushowana).
    // Doprecyzowanie „najbliższa gwiazda” dotyczy stref `cluster_star`, których od G5 (zakładka Stratcom usunięta)
    // ten overlay nie produkuje — tu działa sama reguła wierzchniej strefy.
    const hitZone = resolveStratcomZone(this._hitZones, mx, my);
    if (hitZone) {
      this._handleHit(hitZone, mx, my);
      return true;
    }
    return true; // pochłoń klik w overlayu
  }

  // M3 P1.5 — hover info dla universal Tooltip system (NIE emituje eventu). Zwraca:
  //   { kind: 'entity', target } — dla wiersza ciała w katalogu Atlasu
  //   { kind: 'uiHint', textKey } — dla hit zone z UI hint (np. cancel button)
  //   { kind: 'none' }             — Atlas bez trafienia (bez fallbacku coord-tooltipa)
  //   null                          — pozostałe miejsca overlayu
  resolveHoverInfo(mx, my) {
    if (!this._visible) return null;
    if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return null;

    // Najpierw sprawdź hit zone — UI hints (cancel button) wygrywają nad mapą
    const hit = findHitZone(mx, my, this._hitZones);
    if (hit && hit.type === 'cancel_movement_order') {
      return { kind: 'uiHint', textKey: 'tooltip.fleet.cancelOrderHint' };
    }
    // P3 — doctrine button tooltip (opis efektu doktryny).
    if (hit?.type === 'fleetSetDoctrine' && hit.data?.doctrine) {
      return { kind: 'uiHint', textKey: `fleet.doctrine.${hit.data.doctrine}.desc` };
    }
    // P3 — retreat threshold slider tooltip.
    if (hit?.type === 'fleetRetreatThreshold') {
      return { kind: 'uiHint', textKey: 'fleet.retreatThreshold.tooltip' };
    }

    // Atlas — własny hit-test (bez tactical worldPoint).
    // Wiersze ciał w katalogu mają hit-zony 'map_body' (L2484-2487). Dla
    // hovera nad wierszem zwracamy entity → GameScene pokaże Universal
    // Tooltip z TooltipContent._planetContent. Pusty hit zwraca 'none'
    // (NIE null) żeby GameScene NIE wpadł w coord-tooltip fallback —
    // _mapBounds w tle pokrywa region Atlas, ale Atlas to nie mapa świata.
    if (this._activeTab === 'atlas') {
      if (hit?.type === 'map_body') {
        const lookups = { getEntity: (id) => EntityManager.get(id) };
        const target = resolveTacticalTarget(hit, null, lookups);
        if (target && target.type !== 'empty') return { kind: 'entity', target };
      }
      return { kind: 'none' };
    }
    return null;
  }

  // PPM w overlayu nie ma celu: menu PPM (`ui:rightClickMenuOpened`) otwierała tylko mapa 2D, usunięta w K7-pre.
  // Metoda zostaje (wołana przez GameScene) i zwraca false — jak dotąd poza obszarem mapy.
  handleRightClick() {
    return false;
  }

  handleScroll(delta, mx, my) {
    if (!this._visible || !this._bounds) return false;
    const b = this._bounds;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return false;
    const inRect = (r) => r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;

    // ── ATLAS (pełna szerokość) — scroll katalogu ────────────
    if (this._activeTab === 'atlas') {
      // K7-C — konsola: inspektor ciała (pełna lista złóż) ma własne przewijanie
      if (inRect(this._atlasKitRects?.insp)) {
        const maxI = Math.max(0, (this._atlasInspContentH || 0) - (this._atlasInspViewH || 0));
        this._atlasInspScrollY = Math.max(0, Math.min(maxI, (this._atlasInspScrollY || 0) + delta * 0.5));
        return true;
      }
      if (inRect(this._contentBounds)) {
        const maxScroll = Math.max(0, this._atlasContentH - this._atlasVisibleH);
        this._atlasScrollY = Math.max(0, Math.min(maxScroll, this._atlasScrollY + delta * 0.5));
      }
      return true;
    }

    // ── JEDNOSTKI — scroll detalu archetypu (własny scroll panelu) ─
    if (this._activeTab === 'ground') {
      // K7-C — konsola: kółko nad tabelą jednostek przewija ją (klamra przy rysowaniu, `groundHeroLayout`)
      if (inRect(this._groundKitRects?.table)) {
        this._groundUnitScrollY = Math.max(0, (this._groundUnitScrollY || 0) + delta * 0.5);
        return true;
      }
      if (inRect(this._contentBounds)) {
        this._getDesignEditor()?._groundPanel?.handleScroll(delta, mx, my);
      }
      return true;
    }

    // ── LOGISTYKA — scroll buildera (lewa) LUB listy zleceń (prawa) wg kursora ─
    if (this._activeTab === 'logistics') {
      // Drop-down towaru otwarty i kursor nad nim → scroll katalogu.
      if (this._logiGoodDropdownOpen && inRect(this._logiDropdownRect)) {
        const maxD = Math.max(0, (this._logiDropdownContentH || 0) - (this._logiDropdownViewH || 0));
        this._logiGoodDropdownScrollY = Math.max(0, Math.min(maxD, (this._logiGoodDropdownScrollY || 0) + delta * 0.5));
        return true;
      }
      // Drop-down kolonii otwarty i kursor nad nim → scroll listy kolonii.
      if (this._logiColDropdown && inRect(this._logiColDropdownRect)) {
        const maxC = Math.max(0, (this._logiColDropdownContentH || 0) - (this._logiColDropdownViewH || 0));
        this._logiColDropdownScrollY = Math.max(0, Math.min(maxC, (this._logiColDropdownScrollY || 0) + delta * 0.5));
        return true;
      }
      // K7-C — konsola: lista zleceń (strefa listy) / kreator (strefa inspektora) wg prostokątów z rysunku
      if (this._logiKitRects) {
        if (inRect(this._logiKitRects.list)) {
          this._logiOrdersScrollY = Math.max(0, Math.min(Math.max(0, (this._logiOrdersContentH || 0) - (this._logiOrdersViewH || 0)), (this._logiOrdersScrollY || 0) + delta * 0.5));
        } else if (inRect(this._logiKitRects.insp)) {
          this._logiBuilderScrollY = Math.max(0, Math.min(Math.max(0, (this._logiBuilderContentH || 0) - (this._logiBuilderViewH || 0)), (this._logiBuilderScrollY || 0) + delta * 0.5));
        }
        return true;
      }
      return true;
    }

    // ── K7-A — konsola rejestru: przewijanie po strefach `consoleZones` (lista / tabela / pas = zoom osi / inspektor) ──
    if (this._cmdRects) {
      const r = this._cmdRects;
      if (inRect(r.list)) { this._cmdListScroll = Math.max(0, (this._cmdListScroll || 0) + delta * 0.5); return true; }
      if (r.timeline && inRect(r.timeline) && this._timelineYears) {
        const vp = { ...this._timelineYears, x0: r.timeline.vx0, x1: r.timeline.vx1 };
        const nv = zoomViewport(vp, delta > 0 ? 1.2 : 0.83, xToYear(mx, vp));
        this._timelineYears = { startYear: nv.startYear, endYear: nv.endYear };
        return true;
      }
      if (inRect(r.hero)) { this._registryScroll = Math.max(0, (this._registryScroll || 0) + delta * 0.5); return true; }
      if (inRect(r.inspector)) {
        if (this._selectedVesselId || this._selectedFleetId) this._applyRightScroll(delta);
        return true;
      }
      return true;
    }

    return true;
  }

  // Przeciąganie myszą nie ma celu w overlayu (pan mapy 2D usunięty w K7-pre); metody zostają, bo woła je
  // dyspozytor wejścia — zwracają false jak dotąd poza obszarem mapy.
  handleMouseDown() {
    return false;
  }

  handleMouseUp() {
    return false;
  }

  handleMouseMove(mx, my) {
    this._regMouseX = mx; this._regMouseY = my;   // F3: hover-tooltip osi czasu
    if (!this._visible) return;
    // K7-A — strefa pod kursorem (podświetlenia czipów nagłówka i akcji konsoli); ta sama reguła wierzchniej strefy co klik
    this._kitHoverZone = resolveStratcomZone(this._hitZones, mx, my) ?? null;

    // Hover osadzonych części UnitDesignOverlay (Stocznia = edytor projektów,
    // Jednostki = GroundUnitPanel) — podświetlenia wierszy i tooltipy panelu
    // czytają editor._hoverZone oraz _mouseX/_mouseY (UDO.handleMouseMove nie
    // biegnie, bo overlay unit_design jest schowany).
    if (this._activeTab === 'ground') {
      const ed = this._getDesignEditor();
      if (ed) {
        ed._hoverZone = findHitZone(mx, my, this._hitZones) ?? null;
        ed._mouseX = mx;
        ed._mouseY = my;
      }
    }
  }

  // ── Hit dispatch ──────────────────────────────────────────────────────────

  _handleHit(zone, mx = null, my = null) {
    // Panel jednostek naziemnych (strona Jednostki) — UDO._onHit rozpakowuje prefix 'ground:'.
    // (KZ-Command: delegacja stref projektanta statków zdjęta — Dowództwo ich nie produkuje od C8.)
    if (zone.type?.startsWith('ground:')) {
      if (this._activeTab === 'ground') {
        // K7-C — konsola: rekrutacja celuje w kolonię strony; wybór kafla archetypu zdejmuje wybór jednostki
        if (zone.type === 'ground:select_tile') this._groundSelUnitId = null;
        this._withGroundColony(() => this._getDesignEditor()?._onHit(zone));
        return;
      }
      this._getDesignEditor()?._onHit(zone);
      return;
    }

    switch (zone.type) {
      case 'close':
        this.close();
        break;
      // ── Player Fleet Groups ────────────────────────────────────────────
      // `fleetCreate` / `fleetDisband` zostają: akcje domeny (producentem była lewa lista mapy 2D — Finding 747).
      case 'fleetCreate':
        this._handleCreateFleet();
        break;
      case 'fleetRename':
        this._handleRenameFleet(zone.data.fleetId);
        break;
      case 'fleetDisband':
        this._handleDisbandFleet(zone.data.fleetId);
        break;
      case 'fleetSetDoctrine': {
        const fSys = window.KOSMOS?.fleetSystem;
        fSys?.setDoctrine?.(zone.data.fleetId, zone.data.doctrine);
        break;
      }
      case 'fleetRetreatThreshold': {
        // Slider — mapuj mx na threshold 0.05–0.95.
        const fSys = window.KOSMOS?.fleetSystem;
        if (mx == null || !zone.data) break;
        const { fleetId, sliderX, sliderW } = zone.data;
        const norm = Math.max(0, Math.min(1, (mx - sliderX) / Math.max(1, sliderW)));
        const threshold = 0.05 + norm * 0.9;  // 0.05–0.95 (clamp w FleetSystem)
        fSys?.setRetreatThreshold?.(fleetId, threshold);
        break;
      }
      case 'fleetBackToList': {
        const um = window.KOSMOS?.uiManager;
        if (um?.setSelectedFleetId) um.setSelectedFleetId(null);
        else this._selectedFleetId = null;
        break;
      }
      case 'fleetMemberSelect':
        // P2.5 — vessele są teraz w głównej liście outlinera pod nagłówkiem floty,
        // więc fleet detail panel NIE ma już listy członków klikalnych. Zachowany
        // case dla legacy compat (np. RightClickMenu jeszcze emit'uje).
        this._setSelectedVesselViaUI(zone.data.vesselId);
        // Mutex: klik member → clear fleet selection (vessel wygrywa).
        if (window.KOSMOS?.uiManager?.setSelectedFleetId) {
          window.KOSMOS.uiManager.setSelectedFleetId(null);
        }
        EventBus.emit('vessel:focus', { vesselId: zone.data.vesselId });
        break;
      case 'vesselMultiToggle': {
        const vid = zone.data.vesselId;
        if (this._multiSelectedIds.has(vid)) this._multiSelectedIds.delete(vid);
        else this._multiSelectedIds.add(vid);
        break;
      }
      // ── F3 (rejestr K3) ──────────────────────────────────────────────────
      case 'registrySort':
        if (this._registrySort.col === zone.data.col) this._registrySort.dir *= -1;
        else this._registrySort = { col: zone.data.col, dir: 1 };
        break;
      case 'registryChipSystem':
        this._registryFilter.systemKey =
          this._registryFilter.systemKey === zone.data.key ? null : zone.data.key;
        break;
      case 'registryChipRole':
        this._registryFilter.role =
          this._registryFilter.role === zone.data.role ? null : zone.data.role;
        break;
      case 'registryGroupMode':
        this._registryGroupMode = zone.data.mode;
        break;
      case 'registryGroupToggle': {
        const k = zone.data.key;
        if (this._registryCollapsedGroups.has(k)) this._registryCollapsedGroups.delete(k);
        else this._registryCollapsedGroups.add(k);
        break;
      }
      case 'registryGroupFleet':
        // Prawy panel z istniejącym widokiem floty (rename/disband/rozkazy).
        window.KOSMOS?.uiManager?.setSelectedFleetId?.(zone.data.fleetId);
        break;
      case 'registryChipKind':
        this._registryFilter[zone.data.field] = !this._registryFilter[zone.data.field];
        break;
      case 'registrySearch':
        this._openRegistrySearch();
        break;
      case 'registrySearchClear':
        this._registryFilter.search = '';
        this._closeRegistrySearch();
        break;
      case 'registryClearFilters':
        // K7-A — pusta tabela po filtrach: jeden klik przywraca filtr domyślny (jak open({ focusVesselId }))
        this._registryFilter = defaultRegistryFilter();
        this._closeRegistrySearch();
        break;
      case 'registryFocus': {
        // K7-A — konsola: deterministyczny „POKAŻ” z planu liczonego z żywego statku (`_focusVesselKit`)
        this._focusVesselKit(zone.data.vesselId);
        break;
      }
      case 'timelineCollapse':
        this._timelineCollapsed = !this._timelineCollapsed;
        break;
      case 'timelineBar':
        this._setSelectedVesselViaUI(zone.data.vesselId);   // klik paska = selekcja (read-only oś)
        break;
      case 'fleetAssignMenuOpen':
        this._handleAssignMultiToFleet();
        break;
      case 'fleetClearMultiSelect':
        this._multiSelectedIds.clear();
        break;
      // P2 — fleet order buttons
      case 'fleetMoveToPoint':
        this._handleFleetMoveToPoint(zone.data.fleetId);
        break;
      case 'fleetEngage':
        this._handleFleetEngage(zone.data.fleetId);
        break;
      case 'fleetReturnBase':
        this._handleFleetReturnBase(zone.data.fleetId);
        break;
      case 'fleetCancelOrder':
        this._handleFleetCancelOrder(zone.data.fleetId);
        break;
      // C8 — build_ship (martwe) / build_template / surge_ship / cancel_pending_ship
      // przeniesione do ShipyardOverlay (osobny overlay). Producenci hitów usunięci z FMO.
      case 'vessel': {
        // P2 polish — Fleet Engage pick mode: jeśli aktywny i klik na enemy
        // vessel → fire fleet engage order, exit pick mode.
        // Bug fix: klik na własny vessel WYŁĄCZA pick mode + kontynuuje normalne
        // selection. Wcześniejszy `break` lockował UI gdy gracz nieświadomie
        // aktywował pick mode (fallback z _handleFleetEngage gdy enemies=0).
        if (this._fleetEngagePickMode?.fleetId) {
          const v = window.KOSMOS?.vesselManager?.getVessel?.(zone.data.vesselId);
          if (v && isEnemyVessel(v)) {
            const fleetId = this._fleetEngagePickMode.fleetId;
            this._fleetEngagePickMode = null;
            const fs = window.KOSMOS?.fleetSystem;
            const res = fs?.issueFleetOrder?.(fleetId, {
              type: 'engage',
              targetEntityId: zone.data.vesselId,
            });
            this._announceFleetOrderResult(res, fleetId, 'engage');
            break;
          }
          // Klik na własny → cancel pick mode + fall-through do normal selection.
          this._fleetEngagePickMode = null;
          EventBus.emit('ui:toast', { text: t('fleet.engageCancelled'), color: '#808080', durationMs: 1500 });
          // fall-through (NO break) — wybór vessela dalej w dół.
        }
        // Toggle — kliknięcie tego samego statku odznacza go.
        // M3 P1.1: write idzie przez UIManager (single source of truth).
        if (this._selectedVesselId === zone.data.vesselId) {
          this._setSelectedVesselViaUI(null);
        } else {
          this._setSelectedVesselViaUI(zone.data.vesselId);
          // P2.5 mutex: klik vessela czyści fleet selection (vessel wygrywa context).
          const um2 = window.KOSMOS?.uiManager;
          if (um2?.setSelectedFleetId) um2.setSelectedFleetId(null);
          // K7-A (bramka właściciela) — na konsoli klik wiersza TYLKO zaznacza; kamerą rusza „POKAŻ” (`registryFocus`).
        }
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        this._cachedTargets = null;
        break;
      }
      case 'back_to_shipyard':
        // C8 — Stocznia to teraz osobny overlay (nav-slot 🛠 / klawisz S); odznacz statek i otwórz go.
        this._setSelectedVesselViaUI(null);
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        this._cachedTargets = null;
        window.KOSMOS?.overlayManager?.openPanel('shipyard');
        break;
      case 'map_body': {
        // Gdy konfigurator aktywny i czeka na cel → wybierz cel z mapy
        if (this._missionConfig?.step === 'select') {
          this._missionConfig.targetId = zone.data.bodyId;
          this._missionConfig.step = 'confirm';
          break;
        }
        // Obcy układ — swobodne latanie: wybrany statek orbituje ciało / właśnie przybył,
        // więc klik ciała na mapie = przekieruj tam (to samo co wiersz listy „Leć do innego
        // ciała", tylko wygodniej). Warunek = misja akceptowana przez _redirectInterstellarVessel.
        if (this._selectedVesselId && this._isForeignRedirectClickable(this._selectedVesselId, zone.data.bodyId)) {
          EventBus.emit('vessel:interstellarRedirect', {
            vesselId: this._selectedVesselId,
            targetId: zone.data.bodyId,
          });
          break;
        }
        const bodyEntity = _findBody(zone.data.bodyId);
        if (bodyEntity) EventBus.emit('body:selected', { entity: bodyEntity });
        break;
      }
      case 'groundColony':
        // K7-C — kolonia strony Jednostek (globalna aktywna kolonia nietknięta — jak kontekst Handlu)
        this._groundColonyId = zone.data.colonyId ?? null;
        this._groundSelUnitId = null;
        this._groundUnitScrollY = 0;   // nowa kolonia → tabela jednostek od góry
        break;
      case 'groundUnit':
        this._groundSelUnitId = zone.data.unitId ?? null;
        break;
      case 'logiSelect':
        // K7-C — wybór na liście Logistyki konsoli: 'new' = kreator, id = zlecenie (inspektor)
        this._logiSelectedOrderId = zone.data.orderId ?? 'new';
        break;
      case 'atlasSelect':
        // K7-C — wybór ciała w Atlasie konsoli (lista i orrery = jeden stan); akcje ciała w inspektorze (dzisiejsze strefy)
        this._atlasSelectedBodyId = zone.data.bodyId ?? null;
        break;
      case 'atlas_report': {
        // Ikona raportu 📋 w Star Atlas — otwórz modal ze szczegółami
        const reportBody = _findBody(zone.data.bodyId);
        if (reportBody) {
          showBodyDetailModal(reportBody, { anchor: this._dialogAnchor('inspector', { anyTab: true, minWcss: 520 }) });
        }
        break;
      }
      case 'tab':
        this._switchTab(zone.data.tab);
        break;
      // ── Zakładka Logistyka (MVP Zlecenia Transportowe) ──────────────────
      case 'logi_from_dropdown_toggle':
        this._logiColDropdown = this._logiColDropdown === 'from' ? null : 'from';
        this._logiGoodDropdownOpen = false;
        this._logiColDropdownScrollY = 0;
        break;
      case 'logi_to_dropdown_toggle':
        this._logiColDropdown = this._logiColDropdown === 'to' ? null : 'to';
        this._logiGoodDropdownOpen = false;
        this._logiColDropdownScrollY = 0;
        break;
      case 'logi_col_pick': {
        const { which, colonyId } = zone.data;
        if (which === 'from') {
          this._logiFrom = colonyId;
          this._logiGoods = {};                  // zmiana źródła → wyczyść dobra (inny magazyn)
          if (this._logiTo === colonyId) this._logiTo = null;
        } else if (colonyId !== this._logiFrom) {
          this._logiTo = colonyId;
        }
        this._logiColDropdown = null;
        break;
      }
      case 'logi_col_dropdown_close':
        this._logiColDropdown = null;
        break;
      case 'logi_col_dropdown_bg':
        break;   // absorber — klik w puste miejsce panelu kolonii nie przebija
      case 'logi_good_inc': {
        const cur = this._logiGoods[zone.data.goodId] ?? 0;
        this._logiGoods[zone.data.goodId] = Math.min(999990, cur + 10);
        break;
      }
      case 'logi_good_dec': {
        const cur = this._logiGoods[zone.data.goodId] ?? 0;
        const next = Math.max(0, cur - 10);
        if (next === 0) delete this._logiGoods[zone.data.goodId];
        else this._logiGoods[zone.data.goodId] = next;
        break;
      }
      case 'logi_good_remove':
        delete this._logiGoods[zone.data.goodId];
        break;
      case 'logi_good_dropdown_toggle':
        this._logiGoodDropdownOpen = !this._logiGoodDropdownOpen;
        this._logiColDropdown = null;
        this._logiGoodDropdownScrollY = 0;
        break;
      case 'logi_good_qty_input':
        this._openLogiQtyInput(zone.data.goodId, zone.data.boxCanvasX, zone.data.boxCanvasY,
          zone.data.boxW ? { w: zone.data.boxW, h: zone.data.boxH } : null);
        break;
      case 'logi_dropdown_close':
        this._logiGoodDropdownOpen = false;
        break;
      case 'logi_dropdown_bg':
        break;   // absorber — klik w puste miejsce panelu nie przebija do pickerów
      case 'logi_good_pick': {
        const id = zone.data.goodId;
        this._logiGoods[id] = (this._logiGoods[id] ?? 0) + 10;   // dodaj / dołóż 10
        this._logiGoodDropdownOpen = false;
        break;
      }
      case 'logi_create': {
        const tos = window.KOSMOS?.transportOrderSystem;
        const goods = {};
        for (const [g, q] of Object.entries(this._logiGoods)) if (q > 0) goods[g] = q;
        const res = tos?.createOrder?.({ fromColonyId: this._logiFrom, toColonyId: this._logiTo, goods });
        if (res?.ok) {
          this._logiGoods = {};   // reset buildera (from/to zostają dla kolejnego zlecenia)
          EventBus.emit('ui:toast', { text: t('transportOrder.created', res.orderId), color: THEME.success ?? '#44cc88', durationMs: 2500 });
        } else if (res?.reason) {
          EventBus.emit('ui:toast', { text: t('transportOrder.createFailed', t('transportOrder.reason_' + res.reason)), color: THEME.warning ?? '#ffcc44', durationMs: 3000 });
        }
        break;
      }
      case 'logi_cancel':
        window.KOSMOS?.transportOrderSystem?.cancelOrder?.(zone.data.orderId);
        break;
      case 'toggle_logistics_pool':
        window.KOSMOS?.transportOrderSystem?.togglePool?.(zone.data.vesselId);
        break;
      // W2-6 — oś służby. Odmowa idzie zdarzeniem do Dziennika (kod → i18n w UIManagerze);
      // przycisk, który po kliknięciu milczy, jest gorszy od przycisku wyszarzonego.
      case 'deploy_vessel':
      case 'withdraw_vessel': {
        const vMgr = window.KOSMOS?.vesselManager;
        const res = zone.type === 'deploy_vessel'
          ? vMgr?.deployVessel?.(zone.data.vesselId)
          : vMgr?.withdrawVessel?.(zone.data.vesselId);
        if (res && res.ok !== true) {
          EventBus.emit('vessel:deployRejected', {
            vesselId: zone.data.vesselId,
            vessel: vMgr?.getVessel?.(zone.data.vesselId) ?? null,
            reason: res.reason ?? 'unknown',
          });
        }
        break;
      }
      case 'cluster_switch': {
        // Przeżył zakładkę Stratcom (G5): producenci — panel przylotu międzygwiezdnego `_drawRight` i panel statku
        // `ShipPanelHudLogic` (czip „Przełącz widok”, dyspozycja przez `_handleHit` przy zamkniętym overlayu).
        const ssMgr = window.KOSMOS?.starSystemManager;
        if (ssMgr && zone.data.systemId) {
          ssMgr.switchActiveSystem(zone.data.systemId);
          // Przełącz na zakładkę taktyki żeby gracz widział nowy układ
          this._activeTab = 'tactical';
        }
        break;
      }
      case 'foreign_recon_body': {
        EventBus.emit('expedition:foreignRecon', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
          scope: 'target',
        });
        break;
      }
      case 'foreign_recon_system': {
        EventBus.emit('expedition:foreignRecon', {
          vesselId: zone.data.vesselId,
          targetId: null,
          scope: 'full_system',
        });
        break;
      }
      case 'foreign_colonize': {
        EventBus.emit('expedition:foreignColonize', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
        });
        this._setSelectedVesselViaUI(null);
        break;
      }
      case 'foreign_unload': {
        EventBus.emit('expedition:foreignUnload', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
        });
        break;
      }
      case 'abort_foreign_recon': {
        const vMgr5 = window.KOSMOS?.vesselManager;
        vMgr5?.abortForeignRecon(zone.data.vesselId);
        break;
      }
      case 'action':
        this._handleAction(zone.data);
        break;
      case 'select_target':
        if (this._missionConfig) {
          this._missionConfig.targetId = zone.data.targetId;
          // Slice D — cross-system: przenieś systemId celu do composite (OrderService).
          this._missionConfig.targetSystemId = zone.data.targetSystemId ?? null;
          this._missionConfig.step = 'confirm';
        }
        break;
      case 'confirm_mission':
        this._executeMission();
        break;
      case 'cancel_config':
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        break;
      case 'change_target':
        if (this._missionConfig) {
          this._missionConfig.step = 'select';
          this._missionConfig.targetId = null;
        }
        break;
      case 'rename':
        this._renameVessel(zone.data.vesselId);
        break;
      // M3 P3.1 — rally assignment
      case 'rally_assign_open': {
        this._openRallyAssignModal(zone.data.vesselId, zone.data.currentRallyId);
        break;
      }
      case 'rally_assign_remove': {
        this._removeFromRally(zone.data.vesselId, zone.data.rallyId);
        break;
      }
      // (duplikat map_body usunięty — obsługa w pierwszym case powyżej)
      case 'cargo_load':
        this._openCargoLoader(zone.data.vesselId);
        break;
      case 'unload_colonists':
        this._unloadColonists(zone.data.vesselId);
        break;
      case 'undock':
        // S3.4-F2 — reuse ścieżki z drawera: instant launch to orbit ciała/stacji.
        window.KOSMOS?.vesselManager?.undockToOrbit?.(zone.data.vesselId);
        break;
      case 'toggle_repeat':
        if (this._missionConfig) {
          this._missionConfig.repeat = !this._missionConfig.repeat;
        }
        break;
      case 'set_return_cargo':
        this._openReturnCargoModal();
        break;
      case 'cancel_loop':
        EventBus.emit('transport:cancelLoop', { vesselId: zone.data.vesselId });
        break;
      case 'cancel_movement_order': {
        // M3 P1.4 — anulowanie aktywnego rozkazu MovementOrderSystem.
        // Selection unchanged (D5 iii — label auto-hides bo cancelled status
        // ma early-return w _drawMovementOrderLabel:4037).
        // Logika dispatchu w pure helperze MovementOrderCancellation.js
        // (smoke testy headless bez canvas/THREE).
        tryCancelVesselOrder({
          mos:            window.KOSMOS?.movementOrderSystem,
          vesselManager:  window.KOSMOS?.vesselManager,
          eventLogSystem: window.KOSMOS?.eventLogSystem,
          t,
        }, zone.data.vesselId);
        break;
      }
      case 'disband':
        // REFORMA ZAKŁADEK T3 (D-TR-13 (a), Finding 543) — rozbiórka (nieodwracalna) dopiero po potwierdzeniu w istniejącym
        //   oknie `ConfirmModal` (Esc / tło = anuluj); zaznaczenie i konfigurator zdejmuje `_disbandVesselConfirmed`.
        this._disbandVesselConfirmed(zone.data.vesselId);
        break;
      case 'manual_refuel':
        window.KOSMOS?.vesselManager?.manualRefuel?.(zone.data.vesselId);
        break;
      case 'toggle_refuel_auto': {
        const v = window.KOSMOS?.vesselManager?.getVessel?.(zone.data.vesselId);
        if (v) v.refuelAutomatically = !(v.refuelAutomatically ?? true);
        break;
      }
    }
  }

  async _openReturnCargoModal() {
    const cfg = this._missionConfig;
    if (!cfg || !cfg.targetId) return;
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(this._selectedVesselId);
    if (!vessel) return;
    const colMgr = window.KOSMOS?.colonyManager;
    const targetColony = colMgr?.getColony(cfg.targetId) ?? null;
    if (!targetColony) return;
    const result = await showReturnCargoModal(targetColony, vessel);
    if (result) {
      cfg.returnCargo = result.returnCargo;
    }
  }

  _handleAction(data) {
    const { actionId, vessel } = data;
    const action = FLEET_ACTIONS[actionId];
    if (!action) return;

    // Transport — otwórz CargoLoadModal PRZED target pickerem
    if (actionId === 'transport') {
      this._openCargoThenTarget(vessel);
      return;
    }

    // Kolonizacja — otwórz ColonistLoadModal PRZED target pickerem
    if (actionId === 'colonize' && (vessel.colonistCapacity ?? 0) > 0) {
      this._openColonistThenTarget(vessel);
      return;
    }

    // Załadunek kolonistów bez startu (load-and-hold) — modal → loadColonists od razu.
    if (actionId === 'load_colonists') {
      this._openColonistLoader(vessel);
      return;
    }

    // Załadunek wojsk — CargoLoadModal w trybie troopsOnly (ukrywa cargo/surowce/orbital).
    if (actionId === 'load_troops') {
      const colony = this._getVesselColony?.(vessel) ?? window.KOSMOS?.colonyManager?.getColony(vessel.colonyId);
      if (colony) {
        try { showCargoLoadModal(vessel, colony, { troopsOnly: true, anchor: this._dialogAnchor('inspector', { minWcss: 440 }) }); } catch { /* anulowano */ }
      }
      return;
    }

    // Zrzut wojsk — najpierw modal wyboru jednostek, potem przekierowanie do ColonyOverlay
    if (actionId === 'drop_troops') {
      this._openDropTroopsFlow(vessel);
      return;
    }

    // Założenie placówki — teraz standardowy target picker (building picker po wyborze celu)
    // Flow obsługiwany w _executeMission()

    if (action.requiresTarget) {
      // Otwórz target picker
      this._missionConfig = { actionId, targetId: null, step: 'select' };
      this._targetScrollOffset = 0;
      this._cachedTargets = null;
    } else {
      // Wykonaj od razu (np. deep_scan, return_home)
      const orderService = window.KOSMOS?.orderService;
      if (orderService && actionId === 'return_home') {
        // Zunifikowana ścieżka powrotu (foreign→warp / local→cancel) przez OrderService.
        // Finding 125 — wynik NIE jest już połykany: odmowa skoku (najczęściej brak rdzeni warp)
        // musi się gdzieś odezwać, inaczej przycisk zostaje cichym no-opem.
        const res = orderService.issueReturn(vessel.id);
        if (res && res.ok === false) this._toastReturnFailed(res.reason);
      } else {
        const ms = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
        const colMgr = window.KOSMOS?.colonyManager;
        const state = {
          missionSystem: ms,
          vesselManager: window.KOSMOS?.vesselManager,
          colonyManager: colMgr,
          techSystem: window.KOSMOS?.techSystem,
          activePlanetId: colMgr?.activePlanetId,
        };
        action.execute(vessel, state);
      }
      this._missionConfig = null;
    }
  }

  /**
   * Transport: otwórz modal cargo → po zamknięciu otwórz target picker.
   */
  async _openCargoThenTarget(vessel) {
    try {
      const colony = this._getVesselColony(vessel);
      if (!colony) return;
      await showCargoLoadModal(vessel, colony, { anchor: this._dialogAnchor('inspector', { minWcss: 440 }) });
      // Po zamknięciu modal — otwórz target picker
      this._missionConfig = { actionId: 'transport', targetId: null, step: 'select' };
      this._targetScrollOffset = 0;
      this._cachedTargets = null;
    } catch {
      // Anulowano — nic nie rób
    }
  }

  /**
   * Zrzut wojsk: modal wyboru jednostek → emit drop request z unitIds[].
   * ColonyOverlay odbiera event, otwiera overlay docelowej planety
   * (wroga lub własna) i przechodzi w drop mode dla wybranych jednostek.
   */
  async _openDropTroopsFlow(vessel) {
    try {
      const targetId = vessel.position?.dockedAt;
      if (!targetId) return;
      const colMgr = window.KOSMOS?.colonyManager;
      const targetColony = colMgr?.getColony?.(targetId);
      const targetName = targetColony?.name
        ?? window.KOSMOS?.entityManager?.get?.(targetId)?.name
        ?? targetId;
      const unitIds = await showDropTroopsModal(vessel, targetName);
      if (!unitIds || unitIds.length === 0) return;  // anulowano
      EventBus.emit('vessel:dropTroopsRequest', {
        vesselId: vessel.id,
        targetId,
        unitIds,
      });
    } catch (e) {
      console.warn('[DropTroops] flow error', e);
    }
  }

  /**
   * Kolonizacja: otwórz modal kolonistów → po zamknięciu otwórz target picker.
   * Faktyczne usunięcie POPów z kolonii źródłowej w _executeMission (atomowo
   * z launchem). Anulowanie modalu przerywa setup misji.
   */
  async _openColonistThenTarget(vessel) {
    try {
      const colony = this._getVesselColony(vessel);
      if (!colony) {
        EventBus.emit('expedition:launchFailed', { reason: t('expedition.sourceColonyMissing') });
        return;
      }
      const capTotal = vessel.colonistCapacity ?? 0;
      const alreadyOnBoard = vessel.colonists ?? 0;

      // Statek już ma kolonistów na pokładzie (np. pozostałość po anulowanej misji) →
      // pomiń modal, przejdź od razu do wyboru celu. Uwaga: colonistCount=0 sygnalizuje
      // _executeMission żeby NIE wywoływać loadColonists — koloniści już na pokładzie.
      if (alreadyOnBoard > 0) {
        this._missionConfig = {
          actionId: 'colonize',
          targetId: null,
          step: 'select',
          colonistCount: 0, // 0 = nie ładuj więcej, lecimy z tym co jest
          preloadedColonists: alreadyOnBoard,
        };
        this._targetScrollOffset = 0;
        this._cachedTargets = null;
        return;
      }

      const capRemaining = Math.max(0, capTotal - alreadyOnBoard);
      if (capRemaining <= 0) {
        EventBus.emit('expedition:launchFailed', {
          reason: t('expedition.vesselFullOfColonists', capTotal)
        });
        return;
      }
      const free = Math.floor(colony.civSystem?.freePops ?? 0);
      if (free <= 0) {
        EventBus.emit('expedition:launchFailed', { reason: t('expedition.colonistsUnavailable') });
        return;
      }
      const modal = ColonistLoadModal.getInstance();
      const count = await modal.show(capRemaining, free);
      if (count <= 0) {
        // Anulowano lub brak wolnych POPów — nie konfiguruj misji
        this._missionConfig = null;
        return;
      }
      // Zapisz intencję — fizyczne usunięcie POPów dopiero w _executeMission
      this._missionConfig = {
        actionId: 'colonize',
        targetId: null,
        step: 'select',
        colonistCount: count,
      };
      this._targetScrollOffset = 0;
      this._cachedTargets = null;
    } catch {
      // Anulowano — nic nie rób
    }
  }

  /**
   * Załadunek kolonistów na statek BEZ startu misji (load-and-hold). W odróżnieniu od
   * `_openColonistThenTarget` (colonize) — ładuje POPy fizycznie od razu i je trzyma, bez
   * wyboru celu. Warp: załaduj tu → skok z mapy galaktyki → „Kolonizuj obcy". Rozładunek: „Wyładuj kolonistów".
   */
  async _openColonistLoader(vessel) {
    try {
      const colMgr = window.KOSMOS?.colonyManager;
      const colony = colMgr?.getColony(vessel.colonyId ?? vessel.homeColonyId);
      if (!colony?.civSystem) {
        EventBus.emit('expedition:launchFailed', { reason: t('expedition.sourceColonyMissing') });
        return;
      }
      const capRemaining = Math.max(0, (vessel.colonistCapacity ?? 0) - (vessel.colonists ?? 0));
      if (capRemaining <= 0) {
        EventBus.emit('expedition:launchFailed', { reason: t('expedition.vesselFullOfColonists', vessel.colonistCapacity ?? 0) });
        return;
      }
      const free = Math.floor(colony.civSystem?.freePops ?? 0);
      if (free <= 0) {
        EventBus.emit('expedition:launchFailed', { reason: t('expedition.colonistsUnavailable') });
        return;
      }
      const count = await ColonistLoadModal.getInstance().show(capRemaining, free);
      if (count <= 0) return;   // anulowano
      const loaded = loadColonists(vessel, count, colony.civSystem);
      if (loaded > 0) {
        EventBus.emit('ui:toast', { text: t('fleet.colonistsLoadedToast', loaded, vessel.name), color: THEME.accent, durationMs: 3000 });
      }
    } catch { /* anulowano */ }
  }

  /**
   * Założenie placówki (krok 2): po wyborze celu → otwórz OutpostBuildingPicker.
   * Jeśli gracz może sobie pozwolić → launch. Jeśli nie → pending order.
   */
  async _openOutpostBuildingPicker(targetId, vessel) {
    try {
      const colony = this._getVesselColony(vessel);
      if (!colony) return;

      // Znajdź encję ciała docelowego
      const body = _findBody(targetId);
      if (!body) return;

      const picker = OutpostBuildingPicker.getInstance();
      const result = await picker.show(colony.resourceSystem, body);
      if (!result) return; // anulowano

      const { buildingId, pending } = result;

      if (pending) {
        // Brak surowców — dodaj do pending outpost orders (fabryki wyprodukują)
        const bDef = window.KOSMOS?.buildingsData?.[buildingId]
                  ?? (await import('../data/BuildingsData.js')).BUILDINGS[buildingId];
        const totalCost = {};
        for (const [resId, qty] of Object.entries(bDef?.cost ?? {})) {
          totalCost[resId] = (totalCost[resId] ?? 0) + qty;
        }
        for (const [comId, qty] of Object.entries(bDef?.commodityCost ?? {})) {
          totalCost[comId] = (totalCost[comId] ?? 0) + qty;
        }

        const colMgr = window.KOSMOS?.colonyManager;
        colMgr?.addPendingOutpostOrder(vessel.colonyId, {
          targetId,
          buildingId,
          vesselId: vessel.id,
          cost: totalCost,
        });
      } else {
        // Ma surowce — od razu launch
        EventBus.emit('expedition:foundOutpostRequest', {
          targetId,
          buildingId,
          vesselId: vessel.id,
        });
      }
    } catch {
      // anulowano
    }
    this._missionConfig = null;
    this._targetScrollOffset = 0;
  }

  /**
   * Otwórz modal cargo dla statku (przycisk 📦 w RIGHT).
   */
  async _openCargoLoader(vesselId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(vesselId);
    if (!vessel) return;
    const colony = this._getVesselColony(vessel);
    if (!colony) return;
    try { await showCargoLoadModal(vessel, colony, { anchor: this._dialogAnchor('inspector', { minWcss: 440 }) }); } catch { /* anulowano */ }
  }

  /**
   * Wyładuj kolonistów ze statku z powrotem do kolonii macierzystej.
   * Chroni przed utknięciem w stanie „statek pełny kolonistów, nie mogę wystartować".
   */
  _unloadColonists(vesselId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(vesselId);
    if (!vessel) return;
    const colony = this._getVesselColony(vessel);
    if (!colony?.civSystem) {
      EventBus.emit('expedition:launchFailed', { reason: t('expedition.sourceColonyMissing') });
      return;
    }
    unloadColonists(vessel, colony.civSystem);
    // civ:popBorn emitowany przez civSystem.addPop — UIManager automatycznie zaloguje.
  }

  /**
   * Pobierz kolonię ZWIĄZANĄ ze statkiem — dla orbitujących to planeta docelowa
   * (żeby load troops brał unity z planety której statek pilnuje), dla zadokowanych
   * to kolonia macierzysta.
   */
  _getVesselColony(vessel) {
    const colMgr = window.KOSMOS?.colonyManager;
    // S3.3b-S3 — zadokowany przy STACJI → pseudo-kolonia z façade depotu (fuel/warp_cores).
    // CargoLoadModal czyta colony.resourceSystem → station.depot; isDepot filtruje rozładunek do paliwa.
    if (vessel?.position?.state === 'docked' && vessel.position.dockedAt) {
      const st = EntityManager.get(vessel.position.dockedAt);
      if (st?.type === 'station' && st.depot) {
        return { planetId: st.id, name: st.name, resourceSystem: st.depot, isDepot: true };
      }
    }
    // Orbitujący: użyj planety nad którą orbituje (dockedAt)
    if (vessel?.position?.state === 'orbiting' && vessel.position.dockedAt) {
      const orbiting = colMgr?.getColony(vessel.position.dockedAt);
      if (orbiting) return orbiting;
    }
    // Hangar / fallback: kolonia macierzysta
    return colMgr?.getColony(vessel.colonyId ?? vessel.homeColonyId) ?? null;
  }

  _executeMission() {
    if (!this._missionConfig) return;
    const { actionId, targetId } = this._missionConfig;
    const action = FLEET_ACTIONS[actionId];
    if (!action || !targetId) return;

    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(this._selectedVesselId);
    if (!vessel) {
      EventBus.emit('expedition:launchFailed', { reason: t('expedition.vesselUnavailable') });
      this._missionConfig = null;
      this._targetScrollOffset = 0;
      return;
    }

    // Kolonizacja bez załadowanych kolonistów — zgłoś błąd (wcześniej cicha porażka w _launchColony)
    if (actionId === 'colonize' && (this._missionConfig.colonistCount ?? 0) <= 0
        && (vessel.colonists ?? 0) <= 0) {
      EventBus.emit('expedition:launchFailed', { reason: t('expedition.noColonistsLoaded') });
      this._missionConfig = null;
      this._targetScrollOffset = 0;
      return;
    }

    // Założenie placówki — po wyborze celu otwórz building picker (async)
    if (actionId === 'found_outpost') {
      this._openOutpostBuildingPicker(targetId, vessel);
      return;
    }

    const ms = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;

    // Misja kolonizacyjna — załaduj kolonistów (fizycznie usuń POPy z kolonii źródłowej)
    if (actionId === 'colonize' && (this._missionConfig.colonistCount ?? 0) > 0) {
      const sourceColony = this._getVesselColony(vessel);
      if (!sourceColony?.civSystem) {
        // Brak kolonii źródłowej — przerwij z komunikatem
        EventBus.emit('expedition:launchFailed', { reason: t('expedition.sourceColonyMissing') });
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        return;
      }
      const actuallyLoaded = loadColonists(vessel, this._missionConfig.colonistCount, sourceColony.civSystem);
      if (actuallyLoaded <= 0) {
        // POPy zniknęły między modalem a confirmem (migracja/zgon/blokada) — zgłoś błąd
        EventBus.emit('expedition:launchFailed', { reason: t('expedition.colonistsUnavailable') });
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        return;
      }
    }

    const state = {
      missionSystem: ms,
      vesselManager: vMgr,
      colonyManager: colMgr,
      techSystem: window.KOSMOS?.techSystem,
      activePlanetId: colMgr?.activePlanetId,
      targetId,
      cargo: vessel.cargo ?? {},
      // Pętla transportowa (cykliczny transport) — przekazywana do FleetActions.transport.execute
      loop: !!this._missionConfig.repeat,
      returnCargoSpec: this._missionConfig.returnCargo ?? null,
    };
    // Zunifikowana ścieżka: transport/pasażer/powrót idą przez OrderService
    // (same-system → emit event jak dotąd; cross-system → auto-chain warp→dostawa).
    // NIGDY oba (action.execute I orderService) — ryzyko double-dispatch.
    const orderService = window.KOSMOS?.orderService;
    if (orderService && (actionId === 'transport' || actionId === 'transport_passenger')) {
      const targetSystemId = this._missionConfig.targetSystemId ?? null;
      if (actionId === 'transport') {
        orderService.issueTransport(vessel.id, { targetId, targetSystemId, cargo: state.cargo, loop: state.loop, returnCargoSpec: state.returnCargoSpec });
      } else {
        orderService.issuePassenger(vessel.id, { targetId, targetSystemId });
      }
    } else {
      action.execute(vessel, state);
    }
    this._missionConfig = null;
    this._targetScrollOffset = 0;
  }

  async _renameVessel(vesselId) {
    try {
      const { showRenameModal } = await import('../ui/ModalInput.js');
      // Finding 749 — pole startuje z BIEŻĄCĄ nazwą statku (ModalInput ją zaznacza); etykieta tylko gdy statku brak
      const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      const newName = await showRenameModal(vessel?.name ?? t('fleetPanel.rename'), { anchor: this._dialogAnchor('inspector') });
      if (newName) {
        EventBus.emit('vessel:rename', { vesselId, name: newName });
      }
    } catch { /* anulowano */ }
  }

  // ── M3 P3.1 — rally assignment handlers ───────────────────────────────────
  // Single-rally rule: vessel może być w max 1 rally na raz. Re-assign =
  // remove z poprzedniego + add do nowego.
  async _openRallyAssignModal(vesselId, currentRallyId) {
    try {
      const result = await showRallyAssignModal({ currentVesselId: vesselId, currentRallyId });
      if (!result || result.action === 'cancel') return;

      const reg = window.KOSMOS?.poiRegistry;
      if (!reg) return;

      if (result.action === 'remove' && currentRallyId) {
        this._removeFromRally(vesselId, currentRallyId);
        return;
      }

      if (result.action === 'assign' && result.rallyId) {
        // Remove z istniejącego rally (jeśli był) + add do nowego
        if (currentRallyId && currentRallyId !== result.rallyId) {
          this._removeFromRally(vesselId, currentRallyId, true /* skipUiRefresh */);
        }
        const target = reg.getPOI(result.rallyId);
        if (!target || target.type !== 'rally') return;
        const existing = target.memberVesselIds ?? [];
        if (existing.includes(vesselId)) return;  // de-dupe
        reg.updatePOI(result.rallyId, { memberVesselIds: [...existing, vesselId] });
      }
    } catch { /* modal cancel — noop */ }
  }

  _removeFromRally(vesselId, rallyId /* , _skipUiRefresh */) {
    const reg = window.KOSMOS?.poiRegistry;
    if (!reg) return;
    const rally = reg.getPOI(rallyId);
    if (!rally || rally.type !== 'rally') return;
    const existing = rally.memberVesselIds ?? [];
    const next = existing.filter(id => id !== vesselId);
    if (next.length === existing.length) return;  // nie był w tym rally
    reg.updatePOI(rallyId, { memberVesselIds: next });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Player Fleet Groups (P1) — Fleets tab UI (dawny pasek [Statki | Floty] `_drawLeftTabs` bez wołających usunięty w G5)
  // ══════════════════════════════════════════════════════════════════════════

  // ctx dla czystej logiki rejestru (wpięcia świata jak warstwa etykiet HUD).
  _registryCtx() {
    const K = window.KOSMOS;
    const vm = K?.vesselManager;
    const dscs = K?.deepSpaceCombatSystem;
    return {
      pictureCtx: {
        gameYear:      K?.timeSystem?.gameTime ?? 0,
        fleetSystem:   K?.fleetSystem ?? null,
        combatCheck:   dscs?._findActiveEncounterContaining
          ? (id) => !!dscs._findActiveEncounterContaining(id) : null,
        isImmobilized: vm?.isImmobilized ? (v) => vm.isImmobilized(v) : null,
      },
      fleetName:  (id) => K?.fleetSystem?.getFleet?.(id)?.name ?? null,
      systemName: (id) => systemDisplayName(id, {
        systems: K?.starSystemManager?.getAllSystems?.() ?? [],
        starName: (sid) => EntityManager.getByTypeInSystem?.('star', sid)?.[0]?.name ?? null,
      }),
      // Ciało → nazwa (kolumny Ciało / Skąd / Dokąd): encja (planeta/księżyc/
      // planetoida/stacja) z EntityManager, fallback nazwa kolonii, potem ID.
      bodyName: (id) => {
        if (!id) return null;
        const ent = EntityManager.get(id);
        if (ent?.name) return ent.name;
        return K?.colonyManager?.getColony?.(id)?.name ?? String(id);
      },
      // 3f — kontakty WYŁĄCZNIE przez istniejące bramki intel.
      enemyQuality: (id) => K?.intelSystem?.getVesselContact?.(id)?.quality ?? 'unknown',
    };
  }

  // Wyszukiwarka rejestru — inline DOM input NAD polem szukajki konsoli (żyje tylko w widoku REJESTR).
  // K7-A: prostokąt pola ze strefy listy (`consoleZones`, `_cmdRects.search` — ustawiany w tym samym rysunku, który rejestruje
  // strefę `registrySearch`) i skala z ostatniego rysunku (`uiViewport`). KZ-Command: dawne pole liczone z `window.inner*` usunięte.
  _openRegistrySearch() {
    this._closeRegistrySearch();
    const kitRect = this._cmdRects?.search ?? null;
    if (kitRect) this._openRegistrySearchKit(kitRect);
  }

  /** K7-A — środowisko planu „POKAŻ” (układ oglądany, czy układ da się otworzyć, stacja, nazwy) dla statku `vesselId`. */
  _focusPlanFor(vesselId) {
    const K = window.KOSMOS;
    const v = K?.vesselManager?.getVessel?.(vesselId) ?? null;
    const ssm = K?.starSystemManager;
    const names = this._registryCtx();
    const known = (sid) => (ssm?._systems?.has ? ssm._systems.has(sid)
      : !!ssm?.getAllSystems?.()?.some?.((s) => (s.systemId ?? s.id) === sid));
    return focusPlan(v, {
      activeSystemId: K?.activeSystemId ?? 'sys_home',
      canSwitch: known,
      isStation: (id) => !!K?.stationSystem?.getAllStations?.()?.some?.((st) => st.id === id),
      systemName: (sid) => names.systemName(sid),
      transitTarget: v?.mission?.toSystemId ? names.systemName(v.mission.toSystemId) : null,
    });
  }

  /**
   * K7-A — „POKAŻ” na konsoli: zamknij Dowództwo → (inny układ: przełącz; odmowa = komunikat z powodem i koniec) → zaznacz →
   * `vessel:focus` (renderer: statek — śledzi bieżącą pozycję sprite'a; zadokowany — ciało / stacja dokowania).
   * @returns {object|null} wykonany plan (keeper)
   */
  _focusVesselKit(vesselId) {
    const plan = this._focusPlanFor(vesselId);
    if (!plan) return null;
    if (!plan.ok) {
      EventBus.emit('ui:toast', { text: t(plan.reasonKey, ...(plan.args ?? [])), color: THEME.warning, durationMs: 2500 });
      return plan;
    }
    window.KOSMOS?.uiManager?.overlayManager?.closeActive?.();
    if (plan.switchTo && window.KOSMOS?.starSystemManager?.switchActiveSystem?.(plan.switchTo) !== true) {
      EventBus.emit('ui:toast', { text: t('cmdConsole.focusNoSystem', plan.args?.[0] ?? '?'), color: THEME.warning, durationMs: 2500 });
      return { ...plan, ok: false };
    }
    this._setSelectedVesselViaUI(vesselId);
    EventBus.emit('vessel:focus', { vesselId });
    return plan;
  }

  /** K7-A — szukajka konsoli: ten sam cykl życia co dziś (oninput → filtr, Esc/Enter zamyka), pozycja z `searchInputCss`. */
  _openRegistrySearchKit(rect) {
    const css = searchInputCss(rect, this._uiScale || 1);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this._registryFilter.search;
    input.placeholder = t('cmdConsole.searchPlaceholder');
    Object.assign(input.style, {
      position: 'fixed', left: `${css.left}px`, top: `${css.top}px`, width: `${css.width}px`, height: `${css.height}px`,
      zIndex: '300', background: THEME.bgPrimary, color: THEME.textPrimary, border: 'none',
      borderBottom: `1px solid ${THEME.accent}`, font: `${css.fontPx}px ${THEME.fontFamily}`, padding: '0 4px', outline: 'none',
    });
    input.oninput = () => {
      this._registryFilter.search = input.value;
      if (window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Enter') this._closeRegistrySearch();
    };
    for (const ev of ['click', 'mousedown', 'mouseup']) {
      input.addEventListener(ev, (e) => e.stopPropagation());
    }
    document.body.appendChild(input);
    input.focus();
    this._registrySearchEl = input;
  }

  _closeRegistrySearch() {
    const el = this._registrySearchEl;
    if (el?.parentNode) el.parentNode.removeChild(el);
    this._registrySearchEl = null;
  }

  // ── P2 — Helper: derived fleet status (idle/moving/engaging/mixed) ──────
  _computeFleetStatus(fleet) {
    const ao = fleet.activeOrder;
    if (!ao) return { label: t('fleet.statusIdle2'), color: THEME.textDim };
    // G4 — rekord skoku nie śledzi rozkazów członków; bez tej gałęzi flota w skoku czytałaby się jako bezczynna.
    if (ao.type === 'warp') return { label: `🌀 ${t('fleetPicture.activity.warp')}`, color: THEME.warning };
    const tracked = Object.keys(ao.memberOrderIds ?? {}).length;
    if (tracked === 0) return { label: t('fleet.statusIdle2'), color: THEME.textDim };
    switch (ao.type) {
      case 'moveToPoint':
        return { label: `🎯 ${t('fleet.statusMoving')}`, color: THEME.warning };
      case 'pursue':
      case 'intercept':
        return { label: `→ ${t('fleet.statusPursuing')}`, color: THEME.warning };
      case 'engage':
        return { label: `⚔ ${t('fleet.statusEngaging')}`, color: THEME.danger };
      default:
        return { label: ao.type, color: THEME.textSecondary };
    }
  }

  // ── Handlery CRUD (DOM modals) ──────────────────────────────────────────

  async _handleCreateFleet() {
    try {
      const { showRenameModal } = await import('../ui/ModalInput.js');
      const name = await showRenameModal(t('fleet.newFleetDefaultName'), { anchor: this._dialogAnchor('list') });
      if (!name) return;
      const fSys = window.KOSMOS?.fleetSystem;
      const fleet = fSys?.createFleet?.(name);
      // Bug fix: setuj selekcję przez UIManager (single source of truth) zamiast
      // direct mutate this._selectedFleetId. Bez tego UIManager._selectedFleetId
      // pozostaje null, mutex w 'vessel' case (setSelectedFleetId(null)) dedupe'uje
      // (już null) → fleetOv cache NIE synchronizowany → fleet detail "klei się"
      // i klik vessela nie pokazuje detail.
      if (fleet) {
        const um = window.KOSMOS?.uiManager;
        if (um?.setSelectedFleetId) um.setSelectedFleetId(fleet.id);
        else this._selectedFleetId = fleet.id;
      }
    } catch { /* anulowano */ }
  }

  async _handleRenameFleet(fleetId) {
    try {
      const fSys = window.KOSMOS?.fleetSystem;
      const fleet = fSys?.getFleet?.(fleetId);
      if (!fleet) return;
      const { showRenameModal } = await import('../ui/ModalInput.js');
      const newName = await showRenameModal(fleet.name, { anchor: this._dialogAnchor('inspector') });
      if (newName) fSys.setName(fleetId, newName);
    } catch { /* anulowano */ }
  }

  // Multi-select assign: DOM popup z listą flot + "Nowa flota".
  // Po wyborze przypisuje wszystkie _multiSelectedIds przez addMember.
  async _handleAssignMultiToFleet() {
    const fSys = window.KOSMOS?.fleetSystem;
    if (!fSys || this._multiSelectedIds.size === 0) return;
    const fleets = fSys.listFleets();
    try {
      const choice = await showFleetAssignModal(fleets, { anchor: this._dialogAnchor('inspector') });
      if (!choice) return;
      let targetFleetId = choice.fleetId;
      if (choice.action === 'new') {
        const { showRenameModal } = await import('../ui/ModalInput.js');
        const name = await showRenameModal(t('fleet.newFleetDefaultName'), { anchor: this._dialogAnchor('inspector') });
        if (!name) return;
        const created = fSys.createFleet(name);
        targetFleetId = created.id;
      }
      if (!targetFleetId) return;
      // Bulk add — zbierz vid'y do array (Set zmienia się gdy addMember
      // transferuje z innej floty → fleetId pole vessel update'uje się synchronicznie).
      const ids = [...this._multiSelectedIds];
      const accepted = [];
      const rejected = [];
      for (const vid of ids) {
        const res = fSys.addMember(targetFleetId, vid);
        if (res?.ok) accepted.push(vid);
        else rejected.push({ vid, reason: res?.reason });
      }
      this._multiSelectedIds.clear();
      // Bug fix: selekcja przez UIManager (sync cache). Direct set powodował
      // desynchronizację (vide _handleCreateFleet).
      const um = window.KOSMOS?.uiManager;
      if (um?.setSelectedFleetId) um.setSelectedFleetId(targetFleetId);
      else this._selectedFleetId = targetFleetId;
    } catch { /* anulowano */ }
  }

  // ── P2 — Handlery rozkazów flotowych ────────────────────────────────────

  // Move: picker mode targetPoint na tactical map; po wybraniu punktu fire
  // FleetSystem.issueFleetOrder('moveToPoint'). Klick na pustym miejscu mapy
  // (FleetManagerOverlay tactical map) → GameScene._finalizeTargetPointPicker
  // dispatchuje do naszego callbacku.
  _handleFleetMoveToPoint(fleetId) {
    const um = window.KOSMOS?.uiManager;
    if (!um) return;
    if (um.isPickerActive?.()) um.cancelPickerMode?.();
    um.setPickerMode?.('targetPoint', (point) => {
      if (!point) return;
      // ── Finding 255, WIERSZ 8 — termin ramki kamery, przy FINALIZACJI (D-89a/D-89c) ──
      // Punkt przychodzi z kliku w mapę 3D, czyli z ramki KAMERY, a członkowie floty mogą
      // być gdzie indziej — wtedy te same liczby znaczą u nich zupełnie inne miejsce.
      // ⚠ TERMIN NIE MOŻE STAĆ PRZY UZBRAJANIU PICKERA: nic nie kasuje pickera na
      //   `system:switched`, więc gracz uzbraja przy kamerze ZGODNEJ z flotą, przełącza
      //   układ i klika (zmierzone). Bramka ARM-time przepuściłaby dokładnie ten przypadek.
      // ⚠ CAŁA flota albo nic (D-LD2): `issueFleetOrder` liczy `_arrivalSyncYear` ze
      //   WSZYSTKICH eligible i nie przyjmuje listy wyjątków — częściowa wysyłka po cichu
      //   złamałaby kontrakt zsynchronizowanego przylotu.
      // ⚠ Wracamy PRZED `issueFleetOrder`, które kasuje poprzedni rozkaz floty (`:118`) —
      //   odrzucony klik nie ma prawa zepsuć bieżących rozkazów.
      const offenders = fleetOffendersOutOfFrame(fleetId);
      if (offenders.length > 0) {
        // ⚠ `_announceFleetOrderResult` ma `if (!res) return`, więc przy odmowie NIE POWIE NIC.
        //   Głośność musi tu być jawna — inaczej gracz widzi tylko zniknięcie celownika,
        //   nieodróżnialne od sukcesu (wcześniej UI wręcz meldowało „2/2 wykonuje rozkaz").
        window.KOSMOS?.eventLogSystem?.push?.({
          text: t('vessel.orderNoneMoved', offenders.map(describeOrderFail).join(', ')),
          channel: 'fleet',
          severity: 'warn',
          entityRef: offenders[0].vesselId,
        });
        return;
      }
      const fs = window.KOSMOS?.fleetSystem;
      const res = fs?.issueFleetOrder?.(fleetId, {
        type: 'moveToPoint',
        targetPoint: { x: point.x, y: point.y },
        ...(point.staged === true ? { noBodySnap: true } : {}),   // ARC CV — Finding 662 (a): klik w scenie bitwy = punkt
      });
      this._announceFleetOrderResult(res, fleetId, 'moveToPoint');
    }, { intent: 'fleet_move', fleetId });
  }

  // Engage: P2 polish 3 — DOM modal z listą wykrytych enemy vesseli. Klik wiersza
  // → fire fleet engage. Plus zachowany pick mode tactical map (drugi klik
  // "Atak" przy aktywnym pickMode → cancel).
  async _handleFleetEngage(fleetId) {
    if (this._fleetEngagePickMode?.fleetId === fleetId) {
      this._fleetEngagePickMode = null;
      EventBus.emit('ui:toast', { text: t('fleet.engageCancelled'), color: '#808080', durationMs: 1500 });
      return;
    }
    const vm = window.KOSMOS?.vesselManager;
    if (!vm) return;
    // ── Finding 166 (rodzina 138/142/255) — lista celów keyed na UKŁADZIE FLOTY, nie na KAMERZE ──
    // `c5077ef` (2026-07-16) świadomie zawęził tę listę do `activeSystemId` („spójność z mapą”), myląc
    // „widzę na mapie” z „legalny cel dla floty”. Bramka MOS (`_issueEngage`, W3-4b) doszła dopiero
    // miesiąc później i odtąd ten filtr był już tylko defektem UX. ZMIERZONE (probe 166/268, 2026-09-16):
    //   flota `sys_020`, kamera `sys_home` ⇒ popup oferował WYŁĄCZNIE wroga z `sys_home` (z liczbą „0.50 AU”
    //   liczoną z DWÓCH ramek naraz), każdy członek odpadał w MOS na `target_other_system`, a
    //   `issueFleetOrder:119` ZDĄŻYŁ skasować poprzedni rozkaz floty (osobny finding, D-E3);
    //   odwrotnie: kamera bez wrogów + wróg w układzie floty ⇒ „Brak wykrytych wrogów” (fałszywy negatyw,
    //   klasa 142 — naprawa w OBIE strony). Powodu odmowy toast nie niósł (D-E2: `_announceFleetOrderResult`).
    // Kanon = `SystemScope.systemIdOf` w formie LISTOWEJ (`bodiesInSystemOf`, `_findBodyNearPoint`):
    //   brak stempla → `sys_home` (fail-open, stary zapis); `null` (tranzyt warp) po stronie FLOTY ⇒ zbiór
    //   pusty (nie ma „tutaj”), po stronie KANDYDATA ⇒ pominięty (statek między układami nie jest celem;
    //   dawne `?? 'sys_home'` oferowało go przy kamerze na domu — klasa 151, ten site z niej wypada).
    // Układ floty = układ PIERWSZEGO żywego członka (precedens `_handleFleetReturnBase`; flota rozpięta =
    //   decyzja właściciela, Finding 272) — członek spoza tego układu odpada w MOS GŁOŚNO (D-E2).
    // D-E4: kolumna AU w popupie liczy `hypot(wróg, firstMember)` — po przecelowaniu listy OBIE strony
    //   są w ramce floty, więc liczba mieszana znika Z KONSTRUKCJI (popup nietknięty).
    // (Listy mapy 2D keyed na kamerze — `enemyVisible`, `_drawCenter` — odeszły z mapą w K7-pre.)
    const fs = window.KOSMOS?.fleetSystem;
    const fleet = fs?.getFleet?.(fleetId);
    const firstMember = fleet?.memberIds?.map(vid => vm.getVessel(vid)).find(v => v && !v.isWreck);
    const fleetSys = systemIdOf(firstMember);
    const enemies = fleetSys == null ? [] : vm.getAllVessels().filter(v =>
      isEnemyVessel(v) && !v.isWreck && _isEnemyTracked(v)
      && systemIdOf(v) === fleetSys
    );
    // Sortuj po dystansie od pierwszego membera floty (ta sama ramka — patrz wyżej)
    if (firstMember) {
      enemies.sort((a, b) => {
        const dA = Math.hypot(a.position.x - firstMember.position.x, a.position.y - firstMember.position.y);
        const dB = Math.hypot(b.position.x - firstMember.position.x, b.position.y - firstMember.position.y);
        return dA - dB;
      });
    }
    if (enemies.length === 0) {
      // Brak detected — fallback do pick mode (gracz może klika na tactical map gdy spawn'uje enemy).
      this._fleetEngagePickMode = { fleetId };
      EventBus.emit('ui:toast', { text: t('fleet.noDetectedEnemies'), color: '#ffaa22', durationMs: 3500 });
      return;
    }
    try {
      const choice = await _showEnemyPickPopup(enemies, firstMember);
      if (!choice?.vesselId) return;
      const res = fs.issueFleetOrder(fleetId, { type: 'engage', targetEntityId: choice.vesselId });
      this._announceFleetOrderResult(res, fleetId, 'engage');
    } catch { /* cancel */ }
  }

  // Return to base: cel = najbliższa WŁASNA kolonia W UKŁADZIE STATKU, potem moveToPoint.
  //
  // ⚠ POPRAWKA DWÓCH KŁAMSTW W TYM MIEJSCU (D-255a, Findingi 154 + 255):
  //   1. Stało tu „Centroid floty (najbliższa kolonia od centroidu, NIE od per-vessel)". Kod
  //      NIGDY nie liczył centroidu — bierze PIERWSZEGO żywego członka (`firstMember` niżej).
  //   2. Cel dobierał `AutoRetreatSystem._findNearestFriendlyPlanet`, która filtrowała po
  //      WŁAŚCICIELU i **nie miała terminu układu**. Gwiazda każdego układu stoi w (0,0), więc
  //      kolonia z INNEGO układu wygrywała dystansem: ZMIERZONE — statek w `sys_020` dostawał
  //      `p_home` [sys_home] jako „2.00 AU", podczas gdy własna kolonia w jego układzie leżała
  //      6.00 AU dalej. Rozkaz przechodził (bramka `if (bodyId)` w MOS widzi tylko cele-CIAŁA,
  //      a tu leci GOŁY PUNKT), statek leciał do tych współrzędnych we WŁASNEJ ramce, a marker
  //      `_pendingReturnDock` dokował go potem przy ciele, którego w jego układzie NIE MA.
  //   Od 154: `nearestOwnColonyBodyInSystem` (`utils/RetreatTarget.js`, D-FDh) — filtr własności,
  //   preferencja pełnych kolonii nad placówkami, PLUS termin układu.
  // ⚠ Finding 272 (opcja A, D-272-1…9) — cel PER CZŁONEK, nie reprezentanta. Jeden cel fan-outowany
  //   do wszystkich wysyłał członka z INNEGO układu do bezsensownych współrzędnych we własnej ramce
  //   (MOS to PRZYJMUJE — goły punkt nie ma czego porównać z układem), 263 odmawiał doku i statek
  //   dryfował BEZGŁOŚNIE; reprezentant w tranzycie warp abortował całą flotę (ZMIERZONE M1-M5).
  //   Plan liczy `utils/FleetReturnPlan` (ten sam resolver, wołany N razy; jedno źródło dla obu
  //   producentów — bliźniak `FleetCommandPanel._fleetReturn`): członek bez celu jest ODMAWIANY GŁOŚNIE
  //   (`memberRefusals` → `rejected` → Dziennik przez D-E2), nie wysyłany w cudzą ramkę.
  //   Brak celu u WSZYSTKICH ⇒ toast jak dotąd (D-272-9).
  _handleFleetReturnBase(fleetId) {
    const fs = window.KOSMOS?.fleetSystem;
    const fleet = fs?.getFleet?.(fleetId);
    if (!fleet || fleet.memberIds.length === 0) return;
    const vm = window.KOSMOS?.vesselManager;
    const members = fleet.memberIds
      .map(vid => vm?.getVessel?.(vid))
      .filter(v => v && !v.isWreck);
    if (members.length === 0) return;
    const plan = buildFleetReturnPlan(members, window.KOSMOS?.colonyManager);
    if (!plan.representative) {
      EventBus.emit('ui:toast', { text: t('fleet.noFriendlyPlanet'), color: '#ff4466', durationMs: 3000 });
      return;
    }
    const res = fs.issueFleetOrder(fleetId, {
      type: 'moveToPoint',
      targetPoint:    { ...plan.representative.targetPoint },   // INFORMACYJNE (D-272-3); prawda = memberTargets
      memberTargets:  plan.memberTargets,
      memberRefusals: plan.memberRefusals,
    });
    // Auto-dock flag: `FleetSystem._maybeAutoDockOnReturn` (listener `vessel:orderCompleted`)
    // snapuje pozycję do AKTUALNEJ pozycji planety i dokuje. Bez tego statek stoi w statycznym
    // punkcie z chwili wydania rozkazu, a planeta orbituje dalej (Bug F2 — dlatego NIE MA tam
    // progu odległości; patrz nagłówek `FleetSystem.js`).
    // ⚠ D-255b (Finding 263) — MARKER STAWIAMY **PO** ROZKAZIE i TYLKO DLA PRZYJĘTYCH.
    //   Stał przed `issueFleetOrder` i na WSZYSTKICH członkach, więc: (a) statek, którego rozkaz
    //   ODRZUCONO, zostawał z markerem, który odpalał się przy domknięciu dowolnego NASTĘPNEGO
    //   rozkazu; (b) `MovementOrderSystem.issueOrder` nie mógł sprzątać starych markerów na
    //   wejściu, bo wycierałby ten świeżo postawiony. Teraz sprzątanie ma jednoznaczny moment.
    // ⚠ Finding 272 (D-272-7) — marker celuje w WŁASNE ciało członka (re-home per członek: flota może
    //   skończyć z różnymi bazami — to jest znaczenie „wróć do najbliższej WŁASNEJ kolonii").
    for (const memberId of (res?.accepted ?? [])) {
      const member = vm.getVessel(memberId);
      if (member) member._pendingReturnDock = plan.memberTargets[memberId]?.targetBodyId ?? null;
    }
    this._announceFleetOrderResult(res, fleetId, 'returnBase');
  }

  // Cancel order — anuluj aktywny order floty.
  _handleFleetCancelOrder(fleetId) {
    const fs = window.KOSMOS?.fleetSystem;
    fs?.cancelFleetOrder?.(fleetId, 'manual');
  }

  // Helper: pokaż toast z agregowanym wynikiem (accepted/rejected) issueFleetOrder.
  _announceFleetOrderResult(res, _fleetId, _label) {
    if (!res) return;
    const acceptedN = res.accepted?.length ?? 0;
    const rejectedN = res.rejected?.length ?? 0;
    const totalN = acceptedN + rejectedN;
    const color = res.ok ? '#00ffb4' : '#ff4466';
    const msg = res.ok
      ? t('fleet.orderResult', acceptedN, totalN)
      : t('fleet.orderResultFailed', acceptedN, totalN);
    EventBus.emit('ui:toast', { text: msg, color, durationMs: 2500 });
    // D-E2 (Finding 166) — ODMOWA NIESIE POWÓD. Toast jest ulotny i liczy tylko sztuki; powód per statek
    //   (`res.rejected[].reason`) był tu WYRZUCANY (grep: 0 odczytów) dla KAŻDEGO typu rozkazu floty
    //   (move/engage/return). Dziennik `fleet`/`warn` przez `describeFleetOrderRefusal` (te same klucze co
    //   fan-out PPM w `RightClickMenu`); sukces nadal MILCZY (D-256d). Bliźniak: `FleetCommandPanel._announce`.
    const refusal = describeFleetOrderRefusal(res);
    if (refusal) window.KOSMOS?.eventLogSystem?.push?.({ channel: 'fleet', severity: 'warn', ...refusal });
  }

  /**
   * REFORMA ZAKŁADEK T3 (D-TR-13 (a), Finding 543) — rozbiórka statku z potwierdzeniem: `fleet:disbandRequest` DOPIERO
   * po „Rozwiąż” (`ShipPanelAnchorLogic.confirmThenDisband`); po wysłaniu — zaznaczenie zdjęte (jak dotąd), o ile to
   * nadal ten statek. Anulowanie (przycisk, Esc, tło) — nic.
   * @returns {Promise<boolean>} czy żądanie wysłano
   */
  async _disbandVesselConfirmed(vesselId) {
    const vm = window.KOSMOS?.vesselManager;
    const sent = await confirmThenDisband({
      vesselId,
      confirm: () => this._confirmVesselDisband(vm?.getVessel?.(vesselId) ?? null),
      isAlive: (id) => { const v = vm?.getVessel?.(id); return !!v && !v.isWreck; },
      emit: (n, p) => EventBus.emit(n, p),
    });
    if (sent && this._selectedVesselId === vesselId) {
      this._setSelectedVesselViaUI(null);
      this._missionConfig = null;
    }
    return sent;
  }

  /** Okno potwierdzenia rozbiórki statku — istniejący `ConfirmModal` (wzór `_handleDisbandFleet`). */
  async _confirmVesselDisband(vessel) {
    const { showConfirmModal } = await import('../ui/ConfirmModal.js');
    return showConfirmModal({
      title:        t('fleet.disbandReturn'),
      message:      t('fleet.disbandVesselConfirm', vessel?.name ?? vessel?.id ?? ''),
      confirmLabel: t('common.disband'),
      danger:       true,
      anchor:       this._dialogAnchor('inspector'),
    });
  }

  /**
   * K7-B — kotwica okna dialogowego DOM z prostokąta strefy konsoli (`consoleZones[zoneKey]`, skala z ostatniego rysunku —
   * bez `window.inner*`). Poza rejestrem (inne zakładki bez `anyTab`) → null = okno na środku ekranu.
   */
  _dialogAnchor(zoneKey = 'inspector', { anyTab = false, minWcss = 0 } = {}) {
    // K7-C (751): `anyTab` — strony Atlas / Logistyka / Jednostki też są konsolą; `minWcss` — szerokość okna, które nie
    // zmieści się w strefie (okno ładunku 440 px, raport ciała 520 px CSS) — dosunięte do prawej krawędzi ramy
    if (!anyTab && (this._activeTab ?? 'tactical') !== 'tactical') return null;
    const z = this.consoleZones;
    const r = z?.[zoneKey];
    if (!r) return null;
    const s = this._uiScale ?? 1;
    return dialogAnchorCss(r, s, { frame: z.frame ?? null, dy: 22, minW: Math.max(260, minWcss / s) });
  }

  async _handleDisbandFleet(fleetId) {
    try {
      const fSys = window.KOSMOS?.fleetSystem;
      const fleet = fSys?.getFleet?.(fleetId);
      if (!fleet) return;
      const { showConfirmModal } = await import('../ui/ConfirmModal.js');
      const ok = await showConfirmModal({
        title:   t('fleet.disbandConfirmTitle'),
        message: t('fleet.disbandConfirmMessage', fleet.name),
        danger:  true,
        anchor:  this._dialogAnchor('inspector'),
      });
      if (ok) {
        fSys.disbandFleet(fleetId, 'manual');
        if (this._selectedFleetId === fleetId) this._selectedFleetId = null;
      }
    } catch { /* anulowano */ }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAR ATLAS — katalog ciał niebieskich (zamiast mapy schematycznej)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * K7-C — fakty ciała dla inspektora Atlasu (te same wzory co wiersz `_drawAtlasCatalog`). Niezbadane = tylko typ i orbita
   * (mgła jak dziś: wiersz „???” z typem i odległościami).
   */
  _atlasBodyFacts(body) {
    const colMgr = window.KOSMOS?.colonyManager;
    const explored = !!body.explored || body === window.KOSMOS?.homePlanet;
    const typeKey = body.type === 'planet' ? 'fleet.bodyTypePlanet' : body.type === 'moon' ? 'fleet.bodyTypeMoon' : 'fleet.bodyTypePlanetoid';
    const base = { id: body.id, explored, typeKey, orbitAU: body.orbital?.a ?? 0, distHomeAU: DistanceUtils.orbitalFromHomeAU(body) };
    if (!explored) return base;
    const col = colMgr?.hasColony?.(body.id) ? colMgr.getColony(body.id) : null;
    // wszystkie niewyczerpane złoża (bramka K7-C: właściciel chce pełną listę; wiersz OFF pokazuje 3 najbogatsze)
    const deps = (body.deposits ?? []).filter(d => d.remaining > 0).sort((a, b) => b.richness - a.richness)
      .map(d => ({ id: d.resourceId, name: _cargoName(d.resourceId), remaining: d.remaining ?? null, stars: d.richness >= 0.7 ? 3 : d.richness >= 0.4 ? 2 : 1 }));
    return { ...base, name: body.name ?? body.id, subType: body.planetType ?? body.subType ?? body.type,
      tempC: (body.temperatureC != null || body.temperatureK) ? Math.round(body.temperatureC ?? (body.temperatureK - 273)) : null,
      colony: col ? { name: col.name ?? body.name, pop: col.civSystem?.population ?? 0, outpost: col.isOutpost === true } : null,
      deposits: deps, isHome: body === window.KOSMOS?.homePlanet, marked: !!body._markedAsTarget,
      redirect: !!(this._selectedVesselId && this._isForeignRedirectClickable(this._selectedVesselId, body.id)) };
  }

  _getAllCatalogBodies() {
    const homePl = window.KOSMOS?.homePlanet;
    const sysId  = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const planets = [];
    for (const btype of ['planet', 'planetoid']) {
      for (const body of EntityManager.getByTypeInSystem(btype, sysId)) {
        if (body === homePl) continue; // planeta macierzysta dodana osobno na górze
        planets.push({ body, explored: !!body.explored });
      }
    }
    planets.sort((a, b) => {
      if (a.explored !== b.explored) return a.explored ? -1 : 1;
      return (a.body.orbital?.a ?? 0) - (b.body.orbital?.a ?? 0);
    });

    const moonsByParent = new Map();
    for (const moon of EntityManager.getByTypeInSystem('moon', sysId)) {
      const pid = moon.parentPlanetId;
      if (!moonsByParent.has(pid)) moonsByParent.set(pid, []);
      moonsByParent.get(pid).push({ body: moon, explored: !!moon.explored, isMoon: true });
    }
    for (const moons of moonsByParent.values()) {
      moons.sort((a, b) => (a.body.orbital?.a ?? 0) - (b.body.orbital?.a ?? 0));
    }

    const result = [];
    // Planeta macierzysta + jej księżyce na górze (tylko jeśli w aktywnym układzie)
    const homeInSystem = homePl && (homePl.systemId === sysId);
    if (homeInSystem) {
      result.push({ body: homePl, explored: true, isHome: true });
    }
    const homeMoons = homeInSystem ? (moonsByParent.get(homePl.id) ?? []) : [];
    for (const m of homeMoons) result.push(m);
    if (homeMoons.length > 0) moonsByParent.delete(homePl.id);

    for (const entry of planets) {
      result.push(entry);
      const moons = moonsByParent.get(entry.body.id) ?? [];
      for (const m of moons) result.push(m);
    }
    return result;
  }

  // ARC GALAXY G5 — zakładka Stratcom usunięta (mapa galaktyki = tryb głównego widoku 3D, `GalaxyModeController`).
  // Został powrót skokiem z panelu obcego układu (Finding 125); kropka „?” pośredniego kontaktu odeszła z mapą 2D (K7-pre).

  // ── Powrót skokiem z panelu obcego układu ──────────────────────────────────

  // Etykieta odmowy skoku (priorytet: bramka statku > powód trasy) — czyta ją `_toastReturnFailed`.
  _warpErrLabel(plan, gate) {
    return warpErrLabel(plan, gate);   // jeden słownik odmowy skoku — `GalaxyWarpLogic` (D-GX-20)
  }

  // Finding 125 — jeden komunikat o odmowie „Powrotu do bazy" dla WSZYSTKICH trzech wejść.
  // Zero nowych kluczy i18n: reużywa słownika `_warpErrLabel` (powody bramki vs powody trasy)
  // i istniejącego nagłówka `fleet.warpOrderFailed`. Bez `reason` (dispatchInterstellar zwraca
  // goły bool) leci sam nagłówek.
  _toastReturnFailed(reason) {
    const GATE_REASONS = ['in_transit', 'immobilized', 'not_warp_capable', 'bad_state', 'not_player'];
    let detail = null;
    if (reason === 'no_active_mission')      detail = t('fleet.reason.noActiveMission');
    else if (GATE_REASONS.includes(reason))  detail = this._warpErrLabel(null, { ok: false, reason });
    else if (reason)                         detail = this._warpErrLabel({ reason }, { ok: true });
    const text = detail ? `${t('fleet.warpOrderFailed')} — ${detail}` : t('fleet.warpOrderFailed');
    EventBus.emit('ui:toast', { text, color: THEME.danger ?? '#ff4466', durationMs: 3000 });
    // ⚠ Toast jest ULOTNY, a odrzucony rozkaz nie zostawiał ŻADNEGO śladu — live-gate nie miał
    // czego przeczytać. `KOSMOS.debugLog` tu nie pomoże: to audyt AI/wojny/dyplomacji z zamkniętą
    // listą `TRACKED_EVENTS`, w której nie ma ANI JEDNEGO zdarzenia floty (sprawdzone). Właściwym
    // adresem jest Dziennik, kanał `fleet` — wpis zostaje w historii i da się go odczytać po fakcie.
    window.KOSMOS?.eventLogSystem?.push?.({ text, channel: 'fleet', severity: 'warn' });
  }

  // ── Tooltip informacji o ciele niebieskim ─────────────────────────────────

  // Panel wrogiego statku — brak akcji, ograniczone info
  // (imperium name, typ kadłuba, pozycja / odległość, stan). Intel poza zakresem MVP.
  /**
   * K7-C — fakty panelu wroga dla konsoli (te same predykaty i źródła co `_drawEnemyDetails`): mgła tożsamości
   * `_isEnemyTracked`; kontakt niezidentyfikowany = tylko dystans od domu.
   */
  _enemyFacts(vessel) {
    const K = window.KOSMOS;
    const home = K?.homePlanet;
    const distHomeAU = home ? DistanceUtils.euclideanAU(
      { x: home.x ?? 0, y: home.y ?? 0 }, { x: vessel.position?.x ?? 0, y: vessel.position?.y ?? 0 }) : null;
    if (!_isEnemyTracked(vessel)) return { tracked: false, distHomeAU };
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const empId = vessel.ownerEmpireId ?? vessel.owner;
    const emp = empId && K?.empireRegistry?.get?.(empId);
    const intel = K?.intelSystem?.getVesselContact?.(vessel.id)?.quality ?? K?.intelSystem?.getLevel?.(empId) ?? null;
    return {
      tracked: true, distHomeAU, name: vessel.name ?? '?', icon: ship?.icon ?? '⚔',
      empireName: emp?.name ?? null, intel,
      typeName: (getLocale() === 'en' ? (ship?.nameEN ?? ship?.namePL) : (ship?.namePL ?? ship?.nameEN)) ?? ship?.name ?? vessel.shipId ?? null,
      stateKey: vesselStatusLabelKey(resolveVesselStatus(vessel).token),
      posAU: { x: (vessel.position?.x ?? 0) / GAME_CONFIG.AU_TO_PX, y: (vessel.position?.y ?? 0) / GAME_CONFIG.AU_TO_PX },
    };
  }

  /** Fakty akcji statku → `shipActionGroups` (CommandInspectorLogic). */
  _inspectorShipFacts(vessel, ms, colMgr, activePid) {
    const K = window.KOSMOS;
    const vMgr = K?.vesselManager;
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const pos = vessel.position ?? {};
    const docked = pos.state === 'docked';
    const state = { missionSystem: ms, vesselManager: vMgr, colonyManager: colMgr, techSystem: K?.techSystem, activePlanetId: activePid };
    const svc = vessel.serviceState ?? 'active';
    const actions = getAvailableActions(vessel, state);
    const im = vessel.mission;
    let foreign = null;
    const fb = foreignActionsBodyId(vessel, foreignActionsContext(K));
    if (fb) {
      const orbitBody = _findBody(fb);
      const hullCaps = ship?.capabilities ?? [];
      const modCaps = vessel.modules?.length ? getModuleCapabilities(vessel.modules) : new Set();
      if (vessel.modules?.some(m => SHIP_MODULES[m]?.slotType === 'propulsion')) { modCaps.add('recon'); modCaps.add('survey'); }
      const has = (c) => hullCaps.includes(c) || modCaps.has(c);
      foreign = {
        bodyId: fb, bodyName: orbitBody?.name ?? fb, recon: has('recon'), analyzed: orbitBody?.analyzed ?? false,
        colonize: vesselCanColonize(vessel) ? { explored: orbitBody?.explored ?? false,
          colonized: K?.colonyManager?.getColony(fb) != null, validType: isForeignColonizeType(orbitBody) } : null,
        unload: has('cargo') && (vessel.cargoUsed ?? 0) > 0 ? { tons: vessel.cargoUsed ?? 0 } : null,
      };
    }
    const colony = vessel.colonyId ? colMgr?.getColony(vessel.colonyId) : null;
    const hasShipyard = colony ? colMgr._getShipyardLevel(colony) > 0 : false;
    // `_drawActions` wraca wcześnie przy pustej liście akcji — Rozbiórka / Tankowanie / pula są wtedy NIEOSIĄGALNE (dziś);
    // na konsoli Rozbiórka i Tankowanie mają wtedy czip wyłączony z powodem (bez strefy), pula — brak (parytet; Finding 748).
    const noActions = actions.length === 0;
    const tos = K?.transportOrderSystem;
    const reg = K?.poiRegistry;
    let rally = null;
    if (reg?.listPOIs) {
      const rallies = reg.listPOIs({ type: 'rally' }) ?? [];
      if (rallies.length > 0) {
        const cur = rallies.find((r) => (r.memberVesselIds ?? []).includes(vessel.id)) ?? null;
        rally = { currentId: cur?.id ?? null, currentName: cur?.name ?? null };
      }
    }
    const cargoMax = (vessel.cargoMax ?? 0) > 0 ? vessel.cargoMax : (ship?.cargoCapacity ?? 0);
    return {
      vesselId: vessel.id, vesselRef: vessel,
      docked, dockedAt: pos.dockedAt ?? null, orbiting: pos.state === 'orbiting',
      service: (vMgr?.deployVessel && !vessel.isWreck) ? { mobilizing: svc === 'mobilizing', toReserve: svc === 'active' } : null,
      actions,
      cancelOrder: vessel.movementOrder?.status === 'active',
      interstellarSwitch: (im?.type === 'interstellar_jump' && im.phase === 'in_system' && K?.starSystemManager?.getSystem(im.toSystemId))
        ? im.toSystemId : null,
      foreign,
      foreignRecon: im?.type === 'foreign_recon',
      loop: !!ms?.getActive?.()?.find(m => m.vesselId === vessel.id && m.loop && m.type === 'transport'),
      cargo: cargoMax > 0 ? { used: vessel.cargoUsed ?? 0, max: cargoMax } : null,
      colonistsOnBoard: vessel.colonists ?? 0,
      canDisband: !noActions && docked && hasShipyard, hasShipyard,
      refuelAuto: vessel.refuelAutomatically ?? true,
      refuelReachable: !noActions,
      pool: (!noActions && GAME_CONFIG.FEATURES?.transportOrders && tos && !isEnemyVessel(vessel)) ? { inPool: tos.isInPool?.(vessel.id) ?? false } : null,
      rally,
    };
  }

  /** Treść informacyjna inspektora statku (nagłówek, przyrządy, akta techniczne, utrzymanie, misja, log) — dzisiejsze dane. */
  _inspectorShipInfo(vessel, ms, colMgr) {
    const K = window.KOSMOS;
    const vMgr = K?.vesselManager;
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const tok = resolveVesselStatus(vessel).token;
    const sysId = systemIdOf(vessel);
    const reg = this._registryCtx();
    // akta techniczne — te same wartości co `_drawShipSpecs` / `_drawModulesSection`
    const specs = [];
    if (ship) {
      const baseSpeed = vessel?.speedAU ?? ship.speedAU ?? ship.baseSpeedAU ?? 1.0;
      const techMult = K?.techSystem?.getShipSpeedMultiplier?.() ?? 1;
      specs.push([t('fleet.designSpeed'), techMult > 1.01 ? `${baseSpeed.toFixed(1)} → ${(baseSpeed * techMult).toFixed(1)} AU/r` : `${baseSpeed.toFixed(1)} AU/r`]);
      const per = vessel?.fuel?.consumption ?? ship.fuelPerAU ?? 0.5;
      const cap = vessel?.fuel?.max ?? ship.fuelCapacity ?? 10;
      const range = per > 0 ? cap / per : (ship.range ?? 20);
      specs.push([t('fleet.shipRange'), `${range.toFixed(1)} AU${vessel?.warpFuel?.max > 0 ? ` / ${warpRange(vessel).toFixed(1)} LY` : ''}`]);
      specs.push([t('fleet.shipFuelType'), getShort(ship.fuelType)]);
      const mass = vessel?.totalMass ?? ship.baseMass ?? 0;
      if (mass > 0) specs.push([t('fleet.designMass'), `${mass} t`]);
      const cargoCap = vessel?.cargoMax ?? ship.cargoCapacity ?? 0;
      if (cargoCap > 0) specs.push([t('fleet.shipCargo'), `${cargoCap} t`]);
      specs.push([t('fleet.shipCrew'), `${ship.crewCost} POP`]);
      if (ship.capabilities?.length > 0) {
        const capIcons = { recon: '🔭', survey: '📡', deep_scan: '🛰', colony: '🏗', cargo: '📦' };
        specs.push([t('fleet.shipCapabilities'), ship.capabilities.map(c => capIcons[c] ?? c).join(' ')]);
      }
    }
    const mods = (vessel.modules ?? []).map((id) => {
      const m = SHIP_MODULES[id];
      const slot = MODULE_SLOT_INFO[m?.slotType] ?? { icon: '▪', key: null };
      return { slot: slot.key ? t(slot.key) : (m?.slotType ?? ''), name: m ? getName(m, 'module') : id, missing: !m };
    });
    // misja / manifest / pętla / rekon obcy / przylot — dzisiejsze dane
    const active = (ms?.getActive?.() ?? []);
    const mission = active.find(m => m.vesselId === vessel.id) ?? null;
    let missionInfo = null;
    if (mission) {
      const phase = mission.status ?? 'transit';
      const waitH = phase === 'no_housing';
      const phaseTxt = phase === 'returning' ? t('fleet.phaseReturn') : phase === 'orbiting' ? t('fleet.phaseOrbiting')
        : phase === 'working' ? t('fleet.phaseWorking') : waitH ? t('fleet.phaseWaitingHousing') : t('fleet.phaseTransit');
      const pos = (o) => Object.entries(o ?? {}).filter(([, q]) => q > 0).map(([id, q]) => ({ text: `${_cargoIcon(id)} ${_cargoName(id)}`, qty: Math.round(q) }));
      missionInfo = {
        label: `${this._missionTypeName(mission.type)} → ${mission.targetName ?? _resolveName(mission.targetId)}`,
        phase: phaseTxt, eta: (mission.arrivalYear && !waitH) ? t('fleet.etaYearLabel', Math.ceil(mission.arrivalYear)) : '',
        pct: mission.progressPct ?? 0,
        planned: pos(mission.cargo), onBoard: pos(vessel.cargo), ret: pos(mission.returnCargoSpec),
      };
    }
    const im = vessel.mission;
    let reconInfo = null;
    if (im?.type === 'foreign_recon') {
      if (im.scope === 'target') {
        const b = _findBody(im.targetId);
        reconInfo = { label: t('fleet.foreignScanning', b ? (b.name ?? b.id) : '...'), progress: null };
      } else if (im.scope === 'full_system') {
        const cur = im.targets?.[im.currentIdx];
        const b = cur ? _findBody(cur) : null;
        const nm = b ? (b.name ?? b.id) : '...';
        reconInfo = { label: im.phase === 'scanning' ? t('fleet.foreignScanning', nm) : t('fleet.foreignTraveling', nm),
          progress: `${(im.currentIdx ?? 0) + 1} / ${im.targets?.length ?? '?'}` };
      }
    }
    const loopM = active.find(m => m.vesselId === vessel.id && m.loop && m.type === 'transport') ?? null;
    let loopInfo = null;
    if (loopM) {
      const src = colMgr?.getColony(loopM.loopSourceId)?.name ?? loopM.loopSourceId ?? '?';
      const tb = _findBody(loopM.loopTargetId);
      const tgt = tb?.name ?? colMgr?.getColony(loopM.loopTargetId)?.name ?? loopM.loopTargetId ?? '?';
      loopInfo = { route: `${src} ⇄ ${tgt}`, waitKey: loopM.status === 'waiting_reload' ? 'fleet.loopWaitReload'
        : loopM.status === 'waiting_return_cargo' ? 'fleet.loopWaitReturnCargo' : null };
    }
    const upkeep = vMgr?.getVesselUpkeepCredits?.(vessel) ?? 0;
    return {
      ship, icon: ship?.icon ?? '',
      className: ship ? getName(ship, 'ship') : vessel.shipId,
      roleLabel: this._roleLabel(vessel),
      statusText: this._statusText(vessel), statusToken: tok,
      systemName: sysId === null ? null : reg.systemName(sysId ?? 'sys_home'),
      otherSystem: sysId !== null && (sysId ?? 'sys_home') !== (K?.activeSystemId ?? 'sys_home'),
      inTransit: sysId === null,
      base: this._baseText(vessel), xp: this._xpStars(vessel),
      desc: ship ? getDesc(ship, 'ship') : '',
      specs, mods, modsMax: ship?.baseModuleSlots ?? ship?.slots?.length ?? mods.length,
      fuel: vessel.fuel, warpFuel: vessel.warpFuel, endurance: vessel.endurance,
      mobilizing: (vessel.serviceState ?? 'active') === 'mobilizing'
        ? { key: vessel.mobilizeTarget === 'stored' ? 'fleet.withdrawing' : 'fleet.mobilizing', frac: Math.max(0, Math.min(1, vessel.mobilizeProgress ?? 0)) } : null,
      upkeep: { upkeep, baseUpkeep: vMgr?.getVesselBaseUpkeepCredits?.(vessel) ?? 0, immobilized: vMgr?.isImmobilized?.(vessel) ?? false,
        unpaid: vessel.unpaidYears ?? 0, treasury: K?.civilianTradeSystem?.getTreasuryCredits?.() ?? 0,
        inReserve: (vessel?.serviceState ?? 'active') !== 'active' },
      orderLine: this._movementOrderLine(vessel),
      mission: missionInfo,
      interstellar: (im?.type === 'interstellar_jump' && im.phase === 'in_system') ? t('fleet.arrivedAt', im.targetName ?? im.toSystemId) : null,
      recon: reconInfo, loop: loopInfo,
      log: (vessel.missionLog ?? []).slice(-8).reverse().map((e) => ({ year: e.year ? Math.floor(e.year) : null, text: e.text ?? '', type: e.type })),
    };
  }

  /** Członkowie floty do inspektora konsoli: obecne statki z prędkością, zasięgiem i paliwem (jak akta techniczne). */
  _inspectorMemberStats(ids) {
    const K = window.KOSMOS;
    const vMgr = K?.vesselManager;
    const techMult = K?.techSystem?.getShipSpeedMultiplier?.() ?? 1;
    const out = [];
    for (const id of ids ?? []) {
      const v = vMgr?.getVessel?.(id);
      if (!v || v.isWreck) continue;
      const ship = SHIPS[v.shipId] ?? HULLS[v.shipId];
      const per = v.fuel?.consumption ?? ship?.fuelPerAU ?? 0.5;
      const cap = v.fuel?.max ?? ship?.fuelCapacity ?? 10;
      out.push({ id, name: v.name ?? id, vessel: v,
        speedAU: (v.speedAU ?? ship?.speedAU ?? ship?.baseSpeedAU ?? 1.0) * techMult,
        rangeAU: per > 0 ? cap / per : (ship?.range ?? 20),
        fuelPct: v.fuel?.max > 0 ? v.fuel.current / v.fuel.max : null });
    }
    return out;
  }

  // Usuwa hit-zony dodane od indeksu `start`, które wypadły poza pionowy zakres
  // panelu (przewinięte poza widok) — zapobiega „duchom" klików na niewidocznych
  // przyciskach po scrollu. Wzór: cy-offset + clip rysowania nie tnie hit-zon.
  _clipRightHitZones(start, y, h) {
    for (let i = this._hitZones.length - 1; i >= start; i--) {
      const z = this._hitZones[i];
      if (z.y + z.h <= y || z.y >= y + h) this._hitZones.splice(i, 1);
    }
  }

  // ── Etykieta roli statku (podtytuł nagłówka) ────────────────────────────────
  // getPrimaryRole nie zna dyplomaty → envoy sprawdzamy osobno (moduł dyplomatyczny).
  _roleLabel(vessel) {
    const role = canDoEnvoy(vessel) ? 'envoy' : getPrimaryRole(vessel);
    return t(`fleet.role.${role}`);
  }

  // Helper: wrap text do zadanej szerokości (piksele)
  _wrapTextWidth(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ── Edytor projektów (Designs) osadzony w zakładce Stocznia ────────────────
  // Zarejestrowana instancja unit_design (wspólny stan z klawiszem U). Null gdy
  // brak (np. headless test) → zakładka rysuje tylko sekcję budowy.
  _getDesignEditor() {
    return window.KOSMOS?.overlayManager?.overlays?.unit_design ?? null;
  }

  // ── K7-C — Jednostki na konsoli: kolonia strony (lokalna; globalna aktywna kolonia nietknięta) ─────────────────

  /** Kolonia strony Jednostek: wybrana na liście, inaczej aktywna (jeśli gracza), inaczej pierwsza kolonia gracza. */
  _groundLocalColony() {
    const colMgr = window.KOSMOS?.colonyManager;
    const cols = colMgr?.getPlayerColonies?.() ?? [];
    const pick = cols.find(c => c.planetId === this._groundColonyId)
      ?? cols.find(c => c.planetId === colMgr?.activePlanetId) ?? cols[0] ?? null;
    this._groundColonyId = pick?.planetId ?? null;
    return pick;
  }

  /**
   * Wykonaj `fn` z panelem rekrutacji wskazującym kolonię strony (wstrzykiwalne źródło kolonii `GroundUnitPanel` —
   * ten sam mechanizm, którym ColonyOverlay celuje w oglądaną kolonię). Przywracane natychmiast; poza konsolą nieużywane.
   */
  _withGroundColony(fn) {
    const panel = this._getDesignEditor()?._groundPanel;
    if (!panel) return fn(null);
    const col = this._groundLocalColony();
    const saved = panel._getColonyDep;
    panel._getColonyDep = () => col;
    try { return fn(panel); } finally { panel._getColonyDep = saved; }
  }

  /**
   * Fakty strony Jednostek (te same reguły co `GroundUnitPanel._drawActions`: kolonia → blokada → koszary → limit → koszt).
   * Jednostki gracza w kolonii: `groundUnitManager.getUnitsOnPlanet` (owner gracza / frakcja ludzkości).
   */
  _groundFacts() {
    const K = window.KOSMOS;
    const colMgr = K?.colonyManager;
    const gum = K?.groundUnitManager;
    const mine = (u) => u.owner === 'player' || u.factionId === 'humanity';
    const unitsAt = (pid) => (gum?.getUnitsOnPlanet?.(pid) ?? []).filter(mine);
    const local = this._groundLocalColony();
    const colonies = (colMgr?.getPlayerColonies?.() ?? []).map(c => ({ id: c.planetId, name: c.name ?? c.planetId, outpost: c.isOutpost === true,
      units: unitsAt(c.planetId).length, queue: c.groundUnitQueues?.length ?? 0 }));
    return this._withGroundColony((panel) => {
      const colony = local;
      const archId = panel?._selectedArchetypeId ?? null;
      const barracksLv = colMgr?._getBarracksLevel?.(colony) ?? 0;
      const archs = Object.keys(UNIT_ARCHETYPES).map(id => {
        const g = checkArchetypeUnlocked(id, barracksLv, K?.techSystem);
        return { id, icon: ARCHETYPE_ICONS[id] ?? '', role: UNIT_ARCHETYPES[id].role, unlocked: !!g.unlocked, gate: g };
      });
      let recruit = null;
      if (panel && archId) {
        const gate = panel._getGatingStatus();
        const canAfford = panel._canAfford(colony);
        const slots = colMgr?._getBarracksSlots?.(colony) ?? 0;
        const queue = colony?.groundUnitQueues?.length ?? 0;
        const slotFree = queue < slots;
        const capOK = colMgr?._canRecruitMoreUnits?.(colony, archId) ?? true;
        let reasonKey = null, reasonArgs = [];
        if (!colony) reasonKey = 'cmdPages.ground.reasonNoColony';
        else if (!gate.unlocked) { reasonKey = gate.reason === 'tech' ? 'cmdPages.ground.reasonTech' : 'cmdPages.ground.reasonBarracks';
          reasonArgs = gate.reason === 'tech' ? [gate.missing ?? '?'] : [gate.requiredLv ?? '?', gate.currentLv ?? 0]; }
        else if (!slotFree) { reasonKey = 'cmdPages.ground.reasonSlots'; reasonArgs = [queue, slots]; }
        else if (!capOK) { reasonKey = 'cmdPages.ground.reasonCap'; reasonArgs = [colMgr?._getMaxGroundUnits?.(colony) ?? 0]; }
        else if (!canAfford) reasonKey = 'cmdPages.ground.reasonCost';
        const cost = panel._getRecruitCost();
        // nazwy towarów kosztu (bez surowych id) — ten sam słownik co ładownia / Logistyka
        const costGoods = Object.entries({ ...(cost.resources ?? {}), ...(cost.commodities ?? {}) }).map(([id, n]) => ({ id, name: _cargoName(id), n }));
        recruit = { archId, canRecruit: reasonKey === null, reasonKey, reasonArgs, cost, costGoods,
          barracksLv, slots, queue, maxUnits: colMgr?._getMaxGroundUnits?.(colony) ?? 0,
          active: unitsAt(colony?.planetId).filter(u => !GROUND_UNIT_CAP_EXEMPT.has(u.archetypeId)).length,
          toast: panel._recruitToast && panel._recruitToast.expireAt > Date.now() ? panel._recruitToast : null };
      }
      const units = colony ? unitsAt(colony.planetId).map(u => ({ id: u.id, archId: u.archetypeId ?? u.type, name: u.name ?? null,
        hp: u.currentHP ?? u.hp ?? 0, hpMax: u.hpMax ?? u.maxHP ?? 0, status: u.status ?? 'idle', org: u.org ?? null, maxOrg: u.maxOrg ?? null,
        morale: u.morale ?? null, maxMorale: u.maxMorale ?? null, experience: u.experience ?? 0, supply: u.supply ?? null, supplyCap: u.supplyCap ?? null })) : [];
      return { local: colony ? { id: colony.planetId, name: colony.name ?? colony.planetId } : null, colonies, units, archs, archId, recruit,
        hasPanel: !!panel };
    });
  }

  /** K7-C — miniatura modelu archetypu z cache panelu rekrutacji (null: brak panelu / brak wpisu frakcji). */
  _groundSprite(archId) {
    return this._getDesignEditor()?._groundPanel?._ensureSprite?.(archId) ?? null;
  }

  _statusText(vessel) {
    // B2 (F4 live-gate): pasażer czekający na wolny habitat ma PIERWSZEŃSTWO nad etykietami paliwa —
    // inaczej auto-tankowanie przy stacji (depot bez power_cells) fałszywie pokazuje „Czeka na paliwo".
    if (vessel._awaitingHousing) return t('fleet.statusTextAwaitingHousing');
    // Finding 266: KANON — 'in_space' dzieli gałąź orbity (test „utknął z dala od bazy" dotyczy
    // go tym bardziej), 'unknown' nie udaje lotu.
    const stTok = resolveVesselStatus(vessel).token;
    if (stTok === 'unknown') return t('fleetGroup.statusUnknown');
    if (stTok === 'docked') {
      if (vessel.status === 'idle') return t('fleet.statusTextHangar');
      // Fix C: rozróżnij "czeka na paliwo" (brak fuel w kolonii) od aktywnego tankowania.
      if (vessel._awaitingFuel) return t('fleet.statusTextAwaitingFuel');
      return t('fleet.statusTextRefueling');
    }
    if (stTok === 'orbiting' || stTok === 'in_space') {
      // (d) Luka D — orbitujący bez paliwa na powrót: czytelny sygnał zamiast cichego
      // "Orbituje". Stan WYLICZANY (bez nowego pola/migracji). Nie alarmuj przy własnej
      // kolonii/placówce (tam można dotankować) — tylko gdy utknął z dala od bazy.
      const colMgr = window.KOSMOS?.colonyManager;
      const atFriendly = !!colMgr?.getColony(vessel.position.dockedAt);
      if (!atFriendly) {
        // _strandedNotified — ustawiane przy alarmie dotarcia LUB odrzuconym powrocie
        // (łapie route-edge: powrót dłuższy niż linia prosta przez sun-avoidance).
        if (vessel._strandedNotified) return t('fleet.statusTextStranded');
        const home = _findBody(vessel.homeColonyId ?? vessel.colonyId);
        if (home && effectiveRange(vessel) < this._calcDistAU(vessel, home)) {
          return t('fleet.statusTextStranded');
        }
      }
      return t(stTok === 'in_space' ? 'fleetGroup.statusInSpace' : 'fleet.statusTextOrbiting');
    }
    return t('fleet.statusTextInFlight');
  }

  _baseText(vessel) {
    return _resolveName(vessel.homeColonyId ?? vessel.colonyId);
  }

  _xpStars(vessel) {
    const xp = vessel.experience ?? 0;
    const level = Math.min(5, Math.floor(xp / 3));
    return '★'.repeat(level) + '☆'.repeat(5 - level);
  }

  /** K7-B — tekst i kolor etykiety rozkazu ruchu (wspólny dla panelu OFF i inspektora konsoli); null = brak aktywnego rozkazu. */
  _movementOrderLine(vessel) {
    const order = vessel?.movementOrder;
    if (!order || order.status === 'cancelled' || order.status === 'completed') return null;

    // Cel: dla rozkazów celujących we wroga (engage/pursue/intercept) użyj wspólnego
    // helpera — nazwa z mgłą wojny (rumor → anonimowy) + żywy dystans. tinfo == null dla
    // pozostałych typów (moveToPoint/escort/patrol/POI) → stara ścieżka rozwiązania nazwy.
    const tinfo = getOrderTargetInfo(vessel);
    let targetName = '-';
    if (tinfo) {
      targetName = tinfo.name;
    } else if (order.targetEntityId) {
      const tv = window.KOSMOS?.vesselManager?.getVessel?.(order.targetEntityId);
      targetName = tv?.name ?? _resolveName(order.targetEntityId);
    } else if (order.targetPoint) {
      targetName = `(${order.targetPoint.x.toFixed(0)},${order.targetPoint.y.toFixed(0)})`;
    }

    let label = '';
    let color = THEME.textPrimary;
    if (order.status === 'blocked') {
      label = `⚠ Order blocked: ${order.blockReason ?? '?'}`;
      color = THEME.warning;
    } else {
      switch (order.type) {
        case 'moveToPoint': label = `→ MoveTo: ${targetName}`;        color = THEME.accent; break;
        case 'pursue':      label = `⚔ Pursue: ${targetName}`;        color = THEME.danger; break;
        case 'intercept':   label = `⊕ Intercept: ${targetName}`;     color = THEME.warning; break;
        case 'goToPOI': {
          // M2b C6 — nazwa POI z registry, fallback do poiId.
          const poi = window.KOSMOS?.poiRegistry?.getPOI?.(order.poiId);
          label = `→ POI ${poi?.name ?? order.poiId ?? '?'}`;
          color = THEME.accent;
          break;
        }
        case 'patrol': {
          // M2b C6 — licznik (idx+1)/N + nazwa POI lub "manualny".
          const idx = order.patrolWaypointIndex ?? 0;
          const total = order.patrolRoute?.length ?? 0;
          if (order.poiId) {
            const poi = window.KOSMOS?.poiRegistry?.getPOI?.(order.poiId);
            label = `↻ Patrol ${poi?.name ?? order.poiId} (${idx+1}/${total})`;
          } else {
            label = `↻ Patrol manualny (${idx+1}/${total})`;
          }
          color = THEME.textSecondary;
          break;
        }
        case 'escort':      label = `🛡 Escort: ${targetName}`;       color = THEME.accent; break;
        case 'engage':      label = `⊗ Engage: ${targetName}`;        color = THEME.danger; break;
        default:            label = `? ${order.type}: ${targetName}`;  color = THEME.textDim;
      }
    }

    // Żywy dystans do wrogiego celu (engage/pursue/intercept) — z helpera (po S() w AU).
    if (tinfo && Number.isFinite(tinfo.distAU) && order.status !== 'blocked') {
      label += ` · ${tinfo.distAU.toFixed(1)} AU`;
    }

    // Suspended oryginalna mission (§8.3) — marker istnieje na vessel._suspendedMission.
    if (vessel._suspendedMission) {
      label += ' (mission paused)';
    }
    return { label, color, blocked: order.status === 'blocked', type: order.type };
  }

  _missionTypeName(type) {
    const names = {
      recon: t('fleet.missionTypeRecon'), survey: t('fleet.missionTypeSurvey'), deep_scan: t('fleet.missionTypeDeepScan'),
      mining: t('fleet.missionTypeMining'), colony: t('fleet.missionTypeColony'),
      transport: t('fleet.missionTypeTransport'), transit: t('fleet.missionTypeTransit'),
      foreign_recon: t('fleet.missionTypeForeignRecon'),
      exploration: t('fleet.missionTypeExploration'),
      interstellar_jump: t('fleet.missionTypeInterstellar'),
    };
    return names[type] ?? type;
  }

  // ── Akcje ─────────────────────────────────────────────────────────────────

  /** K7-C — definicja akcji floty (konsola nie importuje danych akcji osobno). */
  _fleetActionDef(actionId) { return FLEET_ACTIONS[actionId] ?? null; }

  /** Podpowiedź „kolonizacja innego układu idzie z mapy galaktyki” — statek warp + kolonizacja. */
  _cfgColonizeCrossHint(vessel, actionId) {
    const isWarpShip = (vessel.warpFuel?.max ?? 0) > 0
      || (vessel.modules ?? []).some(m => SHIP_MODULES[m]?.warpCapable);
    return actionId === 'colonize' && isWarpShip;
  }

  /**
   * K7-C — fakty kroku potwierdzenia konfiguratora (jedno źródło dla rysunku OFF i konsoli): cel, skok między układami,
   * dystans / czas / paliwo, ETA, opcje (powtarzanie, ładunek powrotny), bramka paliwa przycisku WYŚLIJ.
   * Brak celu → null (wołający zdejmuje konfigurator, jak dziś).
   */
  _missionConfirmFacts(vessel) {
    const config = this._missionConfig;
    const targetId = config?.targetId;
    // S3.3b-S3b — cel może być STACJĄ (HUB); _findBody nie zna 'station' → fallback na EntityManager.
    const target = _findBody(targetId) ?? EntityManager.get(targetId);
    if (!target) return null;
    // Slice D — cel w INNYM układzie: auto-łańcuch warp→dostawa (dystans/paliwo in-system nie dotyczą skoku warp)
    const targetSysId = config.targetSystemId ?? null;
    const isCrossSystem = !!(targetSysId && targetSysId !== (vessel.systemId ?? 'sys_home'));
    const sysName = isCrossSystem ? (window.KOSMOS?.galaxyData?.systems?.find(s => s.id === targetSysId)?.name ?? targetSysId) : null;
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const distAU = this._calcDistAU(vessel, target);
    const effectiveSpeed = (vessel.speedAU ?? ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
    const travelYears = effectiveSpeed > 0 ? distAU / effectiveSpeed : Infinity;
    // Etap 4 reformy — podgląd == wydatek (dopłata za studnię grawitacyjną); zasila też bramkę „BRAK PALIWA"
    const fuelCost = distAU * (vessel.fuel.consumption ?? 0) * launchFuelMultiplierForVessel(vessel);
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const hasCargoCap = (vessel.cargoMax ?? 0) > 0 || (ship?.cargoCapacity ?? 0) > 0;
    const repeatOption = config.actionId === 'transport' && !!vessel && hasCargoCap;
    const repeat = config.repeat ?? false;
    const targetColony = (repeatOption && repeat) ? (window.KOSMOS?.colonyManager?.getColony(config.targetId) ?? null) : null;
    const returnCargoCount = config.returnCargo ? Object.keys(config.returnCargo).length : 0;
    const fuelCur = vessel.fuel?.current ?? 0;
    return {
      target, targetId, isCrossSystem, sysName, ship, distAU, travelYears, fuelCost, gameYear,
      eta: gameYear + travelYears, repeatOption, repeat, returnCargoOption: !!targetColony, returnCargoCount,
      fuelCur, insufficientFuel: fuelCur < fuelCost,
    };
  }

  _getValidTargets(vessel, actionId) {
    // Cache: unikamy ponownego obliczania co klatkę
    const key = `${vessel.id}_${actionId}_${Math.floor(Date.now() / 2000)}`;
    if (this._cachedTargetsKey === key && this._cachedTargets) return this._cachedTargets;

    const targets = [];
    const homePid = window.KOSMOS?.homePlanet?.id;
    const colMgr  = window.KOSMOS?.colonyManager;
    // S3.4c Z3 — źródło misji transport (kolonia/stacja, z której statek ładuje). Cel == źródło =
    // self-transfer (kolonia→ta sama kolonia) — wykluczany niżej dla transport/transport_passenger.
    const sourceColonyId = this._getVesselColony?.(vessel)?.planetId
      ?? vessel.colonyId ?? vessel.homeColonyId ?? null;

    // ⚠ ZAKRES = UKŁAD STATKU, NIE KAMERY (Finding 142, decyzja D-SS3=W1). Do tej naprawy stało
    // tu `window.KOSMOS.activeSystemId`, przez co picker odpowiadał na pytanie „co widzę", a nie
    // „co ten statek może zrobić". ZMIERZONE przy kamerze na cudzym układzie: własne, osiągalne
    // cele statku znikały w CAŁOŚCI (0/3), a obce dostawały stempel `sameSystem: true` +
    // `reachable: true` — dystans liczony surowym hypot na dwóch RÓŻNYCH ramkach odniesienia.
    // ⚠ Fałszywy NEGATYW był równie realny jak fałszywy pozytyw; rejestr wymieniał tylko drugi.
    // ⚠ `getByTypeInSystem` (fail-CLOSED) ZOSTAJE — tu było już wcześniej i nie jest regresją;
    //   inaczej niż w `VesselManager._findBodyNearPoint`, gdzie filtra NIE BYŁO i wprowadzenie
    //   fail-closed odcięłoby encje bez stempla (D-SS2 → `systemIdOf`).
    // ⚠ `activeSystemId` NIE JEST TU JUŻ CZYTANE ANI RAZ — i to jest cała naprawa 142.
    //   Kamera opisuje widok, nie możliwości statku. Zmienna została usunięta świadomie, żeby
    //   nikt nie „przywrócił" jej jako wygodnego fallbacku.
    const scopeSysId = vessel.systemId === undefined ? 'sys_home' : vessel.systemId;
    const bodies = [
      ...EntityManager.getByTypeInSystem('planet', scopeSysId),
      ...EntityManager.getByTypeInSystem('moon', scopeSysId),
      ...EntityManager.getByTypeInSystem('planetoid', scopeSysId),
      ...EntityManager.getByTypeInSystem('asteroid', scopeSysId),
      ...EntityManager.getByTypeInSystem('comet', scopeSysId),
    ];

    for (const body of bodies) {
      // Bug 3 fix — filter "docked here" relaxed dla found_outpost/transport:
      // gracz może chcieć dostarczyć kolejny budynek do tego samego outpostu
      // (lub dosypać zasobów), nie musi się przepinać do innego statku.
      const dockedHere = body.id === vessel.position.dockedAt && vessel.position.state === 'docked';
      if (dockedHere && actionId !== 'found_outpost' && actionId !== 'transport') {
        if (window.KOSMOS?.debug?.verboseTargets) {
          console.log('[target_filter] skip dockedHere', body.id, body.name);
        }
        continue;
      }

      // Transport PASAŻERSKI — POP dostarczany do kolonii/stacji z housingiem. Uncolonised body NIE ma
      // habitatów: _processPassengerArrival zeruje colonists (POPy przepadają) → wymagaj kolonii/outpostu.
      if (actionId === 'transport_passenger' && !colMgr?.hasColony(body.id)) continue;
      // Transport CARGO (A3) — uncolonised body DOZWOLONE: _processTransportArrival same-system tworzy
      // outpost z ładunku, cross-system orbituje (Etap 37) — delivery NIE zakłada istniejącej kolonii.
      // (AI-colonised in-system = cel jak dotąd, pre-existing; hostility filtr cross-empire = Slice D niżej.)
      if (actionId === 'transport' || actionId === 'transport_passenger') {
        // S3.4c Z3 — wyklucz cel tożsamy ze ŹRÓDŁEM (self-transfer cargo / self-POP bez sensu).
        if (sourceColonyId && body.id === sourceColonyId) continue;
      }
      // Kolonizacja — nie pokazuj pełnych kolonii (outposty można upgrade'ować)
      if (actionId === 'colonize') {
        const col = colMgr?.getColony(body.id);
        if (col && !col.isOutpost) continue;
      }
      // Założenie placówki — zbadane ciała; istniejące kolonie/outposty dozwolone
      // (misja działa jako dowóz budynku do istniejącej kolonii)
      if (actionId === 'found_outpost') {
        if (!body.explored) continue;
        // Tylko odpowiednie typy (rocky, ice, moon, planetoid)
        const pType = body.planetType ?? body.type;
        const okTypes = ['rocky', 'ice', 'iron', 'volcanic', 'moon', 'planetoid', 'gas'];
        if (!okTypes.includes(pType) && body.type !== 'moon' && body.type !== 'planetoid') continue;
      }
      // Survey/deep_scan — wszystkie ciała (zbadane i niezbadane)
      // Mining — tylko zbadane (ale pokazuj wszystkie, badge powie)

      const distAU = this._calcDistAU(vessel, body);
      const range = effectiveRange(vessel);
      const reachable = distAU <= range;

      // Status kolonii — używany do badge'a "(kolonia)/(placówka)" w found_outpost
      const existingCol = colMgr?.getColony(body.id);
      let colonyStatus = 'none';
      if (existingCol) colonyStatus = existingCol.isOutpost ? 'outpost' : 'colony';

      // Bug 3 — debug log (włącz przez `KOSMOS.debug.verboseTargets = true` w konsoli)
      if (window.KOSMOS?.debug?.verboseTargets) {
        console.log('[target_filter]', body.id, body.name, {
          explored: body.explored, type: body.type, planetType: body.planetType,
          systemId: body.systemId, colonyStatus, distAU: distAU.toFixed(2),
          reachable, range: range.toFixed(2),
        });
      }

      targets.push({
        id: body.id,
        name: body.name ?? body.id,
        type: body.type,
        distAU,
        explored: body.explored ?? false,
        reachable,
        colonyStatus,
        systemId: scopeSysId,
        sameSystem: true,
      });
    }

    // S3.3b-S3b — stacje GRACZA (HUB handlowy) jako cele transportu cargo; S3.4 FAZA 4 — także cel
    // transportu pasażerskiego (dostawa POP na stację). Cudze stacje pominięte (cross-empire → S3.5).
    if (actionId === 'transport' || actionId === 'transport_passenger') {
      for (const st of EntityManager.getByTypeInSystem('station', scopeSysId)) {
        if ((st.ownerEmpireId ?? 'player') !== 'player') continue;
        if (st.id === vessel.position.dockedAt) continue;   // nie celuj we własny dok (no-op)
        // WSZYSTKIE stacje gracza są legalnym celem cargo (zniesiony filtr D8 „stacja z matką").
        // Gracz świadomie kieruje transport na stację — start ze stacji jest tańszy paliwowo niż
        // z planety (studnia grawitacyjna), więc stacja pełni rolę wysuniętego składu/przeładunku.
        // Stacja z matką dzieli magazyn kolonii (S3.4c) → cargo trafia do wspólnej puli; ewentualną
        // jałową pętlę (loop=true na wspólny magazyn) łapie best-effort + `_evaluateLoopProductivity`
        // (nigdy nie zawiesza — leci pusta i ostrzega). Jednorazowy transport (loop=false) = bezpieczny.
        const body = EntityManager.get(st.bodyId);
        const distAU = this._calcDistAU(vessel, { x: body?.x ?? st.x, y: body?.y ?? st.y });
        targets.push({
          id: st.id, name: st.name ?? st.id, type: 'station',
          distAU, explored: true, reachable: distAU <= effectiveRange(vessel),
          colonyStatus: 'station',
          systemId: scopeSysId,
          sameSystem: true,
        });
      }
    }

    // ── Slice D — cele CROSS-SYSTEM (transport/pasażer) ──────────────────────
    // Kolonie i stacje GRACZA w INNYCH układach (warp-capable statek → auto-chain
    // warp→dostawa przez OrderService). Cudze kolonie = handel cross-empire (S3.5b),
    // NIE transport — pomijane. Reachable = zasięg warp (multi-hop planuje beginJourney).
    if ((actionId === 'transport' || actionId === 'transport_passenger') && (vessel.warpFuel?.max ?? 0) > 0) {
      const galaxy = window.KOSMOS?.galaxyData?.systems ?? [];
      const curSysId = scopeSysId;
      const curSys = galaxy.find(s => s.id === curSysId);
      const warpReachLY = warpRange(vessel);
      for (const sys of galaxy) {
        // ⚠ D-SS3 — WYKLUCZAMY WYŁĄCZNIE UKŁAD STATKU. Dawny warunek pomijał też układ
        //   OGLĄDANY, z komentarzem „in-system pokryty wyżej" — a pokryty NIE BYŁ, bo pętla
        //   główna używała kamery. Dwa błędy znosiły się do zera celów w tym układzie.
        if (sys.id === curSysId) continue;
        const distLY = (curSys && sys) ? warpDist3D(curSys, sys) : Infinity;
        const reachable = warpReachLY >= distLY;
        const sysName = sys.name ?? sys.id;
        // ⚠ d1 (Finding 254) — MGŁA WOJNY JEST GRANICĄ TEGO SLICE'U. Ciała układu, w którym gracz
        //   nigdy nie był, NIE ISTNIEJĄ (`getByTypeInSystem` → 0), a wygenerowanie ich po to, żeby
        //   je WYLISTOWAĆ, oddałoby graczowi spis ciał nieskanowanego układu — czyli otworzyłoby
        //   ponownie Finding 186 innymi drzwiami. Repo ma na to jawny rozdział:
        //   `peekCountsForStar` (LICZBY, bez encji) vs `generateAndRegister` (encje).
        //   Ten predykat trzyma nas po stronie „liczby" i jest OBRONĄ W GŁĄB: nawet gdyby ktoś
        //   kiedyś zaczął generować układy wcześniej, gołe ciała nadal nie wejdą do pickera.
        //   ⛔ NIE wolno tu wołać `generateAndRegister` — pin D1-5 w
        //   `cross_system_body_targets_smoke` liczy encje przed i po odpytaniu.
        const sysGenerated = !!window.KOSMOS?.starSystemManager?.getSystem?.(sys.id);
        // Ciała tego układu (kolonie gracza ORAZ — od d1 — gołe ciała, gdy układ jest znany)
        const foreignBodies = [
          ...EntityManager.getByTypeInSystem('planet', sys.id),
          ...EntityManager.getByTypeInSystem('moon', sys.id),
          ...EntityManager.getByTypeInSystem('planetoid', sys.id),
        ];
        for (const body of foreignBodies) {
          const col = colMgr?.getColony(body.id);
          // Kolonie AI = handel cross-empire (S3.5b), NIE transport — granica bez zmian.
          if (col && col.ownerEmpireId && col.ownerEmpireId !== 'player') continue;
          if (!col) {
            // Pasażer wymaga housingu — `_processPassengerArrival` zeruje colonists na ciele
            // bez habitatów, więc POPy by przepadły. Cargo takiej bramki nie potrzebuje:
            // `_startForeignUnload` zakłada z ładunku placówkę.
            if (actionId !== 'transport') continue;
            if (!sysGenerated) continue;
          }
          if (sourceColonyId && body.id === sourceColonyId) continue;
          targets.push({
            id: body.id, name: body.name ?? body.id, type: body.type,
            distAU: null, distLY, explored: col ? true : (body.explored ?? false), reachable,
            colonyStatus: col ? (col.isOutpost ? 'outpost' : 'colony') : 'none',
            systemId: sys.id, sameSystem: false, systemName: sysName,
          });
        }
        // Stacje gracza w tym układzie
        for (const st of EntityManager.getByTypeInSystem('station', sys.id)) {
          if ((st.ownerEmpireId ?? 'player') !== 'player') continue;
          targets.push({
            id: st.id, name: st.name ?? st.id, type: 'station',
            distAU: null, distLY, explored: true, reachable,
            colonyStatus: 'station', systemId: sys.id, sameSystem: false, systemName: sysName,
          });
        }
      }
    }

    // Sortuj: same-system najpierw (reachable→AU), potem cross-system (reachable→LY),
    // grupując po nazwie układu dla czytelności pickera.
    targets.sort((a, b) => {
      if (a.sameSystem !== b.sameSystem) return a.sameSystem ? -1 : 1;
      if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
      if (a.sameSystem) return (a.distAU ?? 0) - (b.distAU ?? 0);
      // cross-system: grupuj po układzie, potem po LY
      if ((a.systemName ?? '') !== (b.systemName ?? '')) return String(a.systemName ?? '').localeCompare(String(b.systemName ?? ''));
      return (a.distLY ?? 0) - (b.distLY ?? 0);
    });

    this._cachedTargets = targets;
    this._cachedTargetsKey = key;
    return targets;
  }

  _calcDistAU(vessel, target) {
    const vx = (vessel.position.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const vy = (vessel.position.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    // Ciała niebieskie trzymają x/y w korzeniu; statki pod .position — czytaj oba (fix).
    const tx = (target.x ?? target.position?.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const ty = (target.y ?? target.position?.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    return Math.sqrt((vx - tx) ** 2 + (vy - ty) ** 2);
  }

  /**
   * Czy klik ciała na mapie ma PRZEKIEROWAĆ statek (obcy układ), zamiast tylko go focusować?
   * Warunek = statek na misji akceptowanej przez VesselManager._redirectInterstellarVessel
   * (exploration/foreign_recon w fazie orbiting_body LUB interstellar_jump w fazie in_system),
   * a klikane ciało jest w tym samym układzie i różne od aktualnego celu.
   * @param {string} vesselId
   * @param {string} bodyId
   * @returns {boolean}
   */
  _isForeignRedirectClickable(vesselId, bodyId) {
    const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    if (!v || !bodyId) return false;
    const m = v.mission;
    if (!m || bodyId === m.targetId) return false;
    const orbiting = (m.type === 'exploration' || m.type === 'foreign_recon') && m.phase === 'orbiting_body';
    const arrived  = m.type === 'interstellar_jump' && m.phase === 'in_system';
    if (!orbiting && !arrived) return false;
    const body = _findBody(bodyId);
    return !!body && body.systemId === v.systemId;
  }
}

// ── DOM popup: wybór wroga z listy (Fleet Engage P2 polish 3) ───────────────
// Promise<{vesselId} | null> — null = cancel.
function _showEnemyPickPopup(enemies, fromVessel) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-modal-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(2,4,5,0.75)',
      zIndex: '1001',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: THEME.bgSecondary,
      border: `1px solid ${THEME.danger}`,
      borderRadius: '6px',
      padding: '16px 20px',
      width: '380px',
      maxHeight: '70vh',
      overflowY: 'auto',
      fontFamily: THEME.fontFamily,
      color: THEME.textPrimary,
    });
    const title = document.createElement('div');
    title.textContent = t('fleet.engagePickTitle');
    Object.assign(title.style, {
      color: THEME.danger,
      fontSize: `${THEME.fontSizeLarge}px`,
      marginBottom: '10px',
      letterSpacing: '1px',
    });
    panel.appendChild(title);
    const cleanup = () => { if (overlay.parentNode) document.body.removeChild(overlay); };
    const resolveAndClose = (v) => { cleanup(); resolve(v); };
    const list = document.createElement('div');
    Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' });
    for (const enemy of enemies) {
      const row = document.createElement('button');
      const dPx = fromVessel
        ? Math.hypot(enemy.position.x - fromVessel.position.x, enemy.position.y - fromVessel.position.y)
        : 0;
      const dAU = dPx / GAME_CONFIG.AU_TO_PX;
      row.textContent = `⊗ ${enemy.name ?? enemy.id}  —  ${dAU.toFixed(2)} AU`;
      Object.assign(row.style, {
        background: 'transparent',
        border: `1px solid ${THEME.dangerDim ?? THEME.border}`,
        borderRadius: '3px',
        color: THEME.textPrimary,
        fontFamily: THEME.fontFamily,
        fontSize: `${THEME.fontSizeNormal}px`,
        padding: '8px 12px',
        cursor: 'pointer',
        textAlign: 'left',
      });
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,68,102,0.10)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
      row.addEventListener('click', () => resolveAndClose({ vesselId: enemy.id }));
      list.appendChild(row);
    }
    panel.appendChild(list);
    const cancelRow = document.createElement('div');
    Object.assign(cancelRow.style, { display: 'flex', justifyContent: 'flex-end' });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = t('ui.cancel');
    Object.assign(cancelBtn.style, {
      background: 'transparent',
      border: `1px solid ${THEME.textDim}`,
      borderRadius: '3px',
      color: THEME.textSecondary,
      fontFamily: THEME.fontFamily,
      fontSize: `${THEME.fontSizeNormal}px`,
      padding: '6px 14px',
      cursor: 'pointer',
    });
    cancelBtn.addEventListener('click', () => resolveAndClose(null));
    cancelRow.appendChild(cancelBtn);
    panel.appendChild(cancelRow);
    overlay.appendChild(panel);
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) resolveAndClose(null); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); resolveAndClose(null); }
    });
    document.body.appendChild(overlay);
  });
}

// DOM popup „przypisz do floty" wyekstrahowany do ../ui/FleetAssignModal.js
// (showFleetAssignModal) — współdzielony z FleetGroupPanel (Slice 8b).
